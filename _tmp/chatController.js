// controllers/chatController.js
// Chat global + privado. Diseño económico: sin websockets, el cliente hace
// polling condicional (solo con el chat abierto) usando id > afterId.
const { db } = require('../config/db');
const logger = require('../logger');

// Emojis permitidos en las reacciones
const EMOJIS_PERMITIDOS = ['❤️', '👍', '😂', '😮', '🎉', '😢', '🔥'];

// Indicador de "escribiendo…" en memoria (se pierde al reiniciar, aceptable).
const typingPorCanal = {};   // canal -> { usuarioId: timestamp }
const TYPING_TTL = 6000;     // ms de validez

// Canal privado: 'priv:<idMenor>:<idMayor>' (IDs ordenados para que ambos
// usuarios consulten la misma fila).
function canalPrivadoValido(canal, usuarioId) {
    const m = /^priv:(\d+):(\d+)$/.exec(canal);
    if (!m) return false;
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a <= 0 || b <= 0 || a === b || a > b) return false;
    return a === usuarioId || b === usuarioId;
}

function canalValido(canal, usuarioId) {
    if (canal === 'global') return true;
    return canalPrivadoValido(canal, usuarioId);
}

// Devuelve el id del OTRO participante en un canal privado (o null).
function otroParticipante(canal, usuarioId) {
    if (!canalPrivadoValido(canal, usuarioId)) return null;
    return canal.replace('priv:', '').split(':').map(Number).find(n => n !== usuarioId) || null;
}

// Consulta si hay un bloqueo entre dos usuarios (en cualquier dirección).
function hayBloqueo(usuarioId, otroId, cb) {
    db.query(
        'SELECT 1 FROM chat_bloqueos WHERE (usuario_id = ? AND bloqueado_id = ?) OR (usuario_id = ? AND bloqueado_id = ?) LIMIT 1',
        [usuarioId, otroId, otroId, usuarioId],
        (err, rows) => cb(err, !err && rows && rows.length > 0)
    );
}

// GET /chat/directorio — usuarios registrados agrupados por su ciudad,
// con su última actividad (sesiones activas) para el indicador de presencia.
const getDirectorio = (req, res) => {
    const sql = "SELECT a.ciudad, a.id, a.nombre_artista, a.foto_perfil, (SELECT MAX(s.ultima_actividad) FROM sesiones s WHERE s.artista_id = a.id AND s.activo = TRUE AND s.fecha_expiracion > NOW()) AS ultima_actividad FROM artistas a WHERE a.verificado = true AND a.ciudad IS NOT NULL AND a.ciudad != '' ORDER BY a.ciudad, a.nombre_artista";
    db.query(sql, (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        const porPueblo = {};
        for (const u of result) {
            if (!porPueblo[u.ciudad]) porPueblo[u.ciudad] = [];
            porPueblo[u.ciudad].push({
                id: u.id,
                nombre_artista: u.nombre_artista,
                foto_perfil: u.foto_perfil,
                ultima_actividad: u.ultima_actividad || null
            });
        }
        res.json({ success: true, pueblos: porPueblo });
    });
};

// Limpia entradas de typing vencidas y devuelve quién está escribiendo en un canal.
function obtenerTyping(canal, usuarioId) {
    const ahora = Date.now();
    const mapa = typingPorCanal[canal] || {};
    const lista = [];
    for (const [uid, ts] of Object.entries(mapa)) {
        if (ahora - ts > TYPING_TTL) { delete mapa[uid]; continue; }
        if (Number(uid) !== usuarioId) lista.push(Number(uid));
    }
    if (Object.keys(mapa).length === 0) delete typingPorCanal[canal];
    return lista;
}

// Carga las reacciones de un conjunto de mensajes.
function cargarReacciones(ids, usuarioId, cb) {
    if (!ids.length) return cb(null, {});
    const inClause = ids.map(() => '?').join(',');
    db.query(`SELECT mensaje_id, emoji, COUNT(*) AS n FROM chat_reacciones WHERE mensaje_id IN (${inClause}) GROUP BY mensaje_id, emoji`, ids, (err, rows) => {
        if (err) return cb(err, null);
        const porMsg = {};
        (rows || []).forEach(r => {
            if (!porMsg[r.mensaje_id]) porMsg[r.mensaje_id] = {};
            porMsg[r.mensaje_id][r.emoji] = { n: r.n, mio: false };
        });
        // Reacciones del usuario actual (para marcar "mio")
        db.query(`SELECT mensaje_id, emoji FROM chat_reacciones WHERE mensaje_id IN (${inClause}) AND usuario_id = ?`, [...ids, usuarioId], (err2, mios) => {
            if (!err2) (mios || []).forEach(r => {
                if (porMsg[r.mensaje_id] && porMsg[r.mensaje_id][r.emoji]) porMsg[r.mensaje_id][r.emoji].mio = true;
            });
            cb(null, porMsg);
        });
    });
}

// GET /chat/mensajes?canal=global|priv:a:b&afterId=N
const getMensajes = (req, res) => {
    const canal = String(req.query.canal || '');
    const afterId = parseInt(req.query.afterId, 10) || 0;
    if (!canalValido(canal, req.user.id)) {
        return res.status(400).json({ success: false, error: 'Canal inválido' });
    }
    // En chats privados, ocultar los mensajes que este usuario marcó como borrados
    let hideSql = '';
    if (canal !== 'global') {
        const nums = canal.replace('priv:', '').split(':').map(Number);
        const lado = req.user.id === nums[0] ? 'oculto_para_menor' : 'oculto_para_mayor';
        hideSql = ` AND m.${lado} = 0`;
    }
    const base = "SELECT m.id, m.canal, m.autor_id, m.contenido, m.tipo_mensaje, m.imagen_url, m.responde_a, m.editado, m.eliminado, m.created_at, a.nombre_artista, a.foto_perfil, mr.contenido AS responde_contenido, mr.tipo_mensaje AS responde_tipo, ar.nombre_artista AS responde_autor FROM chat_mensajes m JOIN artistas a ON a.id = m.autor_id LEFT JOIN chat_mensajes mr ON mr.id = m.responde_a LEFT JOIN artistas ar ON ar.id = mr.autor_id WHERE m.canal = ?" + hideSql;
    const finalizar = (rows) => {
        // Reacciones
        cargarReacciones(rows.map(r => r.id), req.user.id, (errR, reacciones) => {
            if (errR) logger.error('reacciones getMensajes:', errR.message);
            // Visto/recibido (solo priv): ¿hasta qué id leyó el otro participante?
            let leidoHasta = 0;
            const esPriv = canal !== 'global';
            const otro = esPriv ? otroParticipante(canal, req.user.id) : null;
            const leerYResponder = () => {
                const mensajes = rows.map(m => {
                    const reac = (reacciones && reacciones[m.id]) || {};
                    return {
                        id: m.id,
                        canal: m.canal,
                        autor_id: m.autor_id,
                        contenido: m.eliminado ? '' : m.contenido,
                        tipo_mensaje: m.tipo_mensaje || 'texto',
                        imagen_url: m.imagen_url || null,
                        editado: !!m.editado,
                        eliminado: !!m.eliminado,
                        created_at: m.created_at,
                        nombre_artista: m.nombre_artista,
                        foto_perfil: m.foto_perfil,
                        responde: m.responde_a ? {
                            autor: m.responde_autor || 'Usuario',
                            contenido: m.responde_contenido || '',
                            tipo: m.responde_tipo || 'texto'
                        } : null,
                        reacciones: reac,
                        leido: esPriv && m.autor_id === req.user.id ? (m.id <= leidoHasta) : null
                    };
                });
                // "Escribiendo…" — quién está escribiendo en este canal
                const escribiendoIds = obtenerTyping(canal, req.user.id);
                res.json({ success: true, mensajes, leido_hasta: esPriv ? leidoHasta : null, escribiendo: escribiendoIds });
            };
            if (esPriv && otro) {
                db.query('SELECT ultimo_leido_id FROM chat_contadores WHERE usuario_id = ? AND canal = ?', [otro, canal], (errL, lr) => {
                    if (!errL && lr && lr.length) leidoHasta = lr[0].ultimo_leido_id || 0;
                    leerYResponder();
                });
            } else {
                leerYResponder();
            }
        });
    };
    if (afterId > 0) {
        const sql = `${base} AND m.id > ? ORDER BY m.id ASC LIMIT 50`;
        db.query(sql, [canal, afterId], (err, rows) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            finalizar(rows || []);
        });
    } else {
        const sql = `${base} ORDER BY m.id DESC LIMIT 30`;
        db.query(sql, [canal], (err, rows) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            finalizar((rows || []).reverse());
        });
    }
};

// POST /chat/mensajes { canal, contenido?, tipo_mensaje?, imagen_url?, responde_a? }
const enviarMensaje = (req, res) => {
    const canal = String(req.body.canal || '');
    const tipoMensaje = req.body.tipo_mensaje === 'imagen' ? 'imagen' : 'texto';
    const contenido = String(req.body.contenido || '').trim();
    const imagenUrl = String(req.body.imagen_url || '').trim();
    const respondeA = parseInt(req.body.responde_a, 10) || null;
    if (!canalValido(canal, req.user.id)) {
        return res.status(400).json({ success: false, error: 'Canal inválido' });
    }
    if (tipoMensaje === 'imagen') {
        if (!imagenUrl || imagenUrl.length > 500) {
            return res.status(400).json({ success: false, error: 'Imagen requerida' });
        }
        if (contenido.length > 300) {
            return res.status(400).json({ success: false, error: 'Comentario demasiado largo' });
        }
    } else if (!contenido || contenido.length > 1000) {
        return res.status(400).json({ success: false, error: 'Mensaje vacío o demasiado largo' });
    }
    // Bloqueo: en priv, ninguno de los dos puede escribir al otro
    if (canal !== 'global') {
        const otro = otroParticipante(canal, req.user.id);
        if (otro) {
            return hayBloqueo(req.user.id, otro, (errB, bloqueado) => {
                if (errB) logger.error('bloqueo check:', errB.message);
                if (bloqueado) {
                    return res.status(403).json({ success: false, error: 'No puedes enviar mensajes a este usuario' });
                }
                insertarMensaje();
            });
        }
    }
    insertarMensaje();

    function insertarMensaje() {
        const tipo = canal === 'global' ? 'global' : 'priv';
        const sql = "INSERT INTO chat_mensajes (tipo, canal, autor_id, contenido, tipo_mensaje, imagen_url, responde_a) VALUES (?, ?, ?, ?, ?, ?, ?)";
        db.query(sql, [tipo, canal, req.user.id, contenido, tipoMensaje, imagenUrl || null, respondeA], (err, result) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            notificar();
            res.json({
                success: true,
                mensaje: {
                    id: result.insertId,
                    canal,
                    autor_id: req.user.id,
                    contenido,
                    tipo_mensaje: tipoMensaje,
                    imagen_url: imagenUrl || null,
                    editado: false,
                    eliminado: false,
                    created_at: new Date(),
                    nombre_artista: req.user.nombre_artista || '',
                    foto_perfil: null,
                    responde: null,
                    reacciones: {},
                    leido: null
                }
            });
        });
    }

    function notificar() {
        if (canal === 'priv') {
            try {
                const { enviarAUsuario } = require('../services/firebase-push');
                const otro = otroParticipante(canal, req.user.id);
                if (!otro) return;
                db.query('SELECT nombre_artista, foto_perfil FROM artistas WHERE id = ?', [req.user.id], (errA, autorRows) => {
                    const autor = (!errA && autorRows && autorRows.length)
                        ? autorRows[0]
                        : { nombre_artista: req.user.nombre_artista || '', foto_perfil: null };
                    db.query('INSERT INTO chat_contadores (usuario_id, canal, n) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE n = n + 1', [otro, canal], (errC) => {
                        const enviar = (n) => {
                            const textoVisor = tipoMensaje === 'imagen'
                                ? `📷 ${autor.nombre_artista || 'Alguien'} te envió una imagen`
                                : (n > 1 ? `${n} mensajes nuevos` : contenido.slice(0, 120));
                            enviarAUsuario(otro, {
                                title: autor.nombre_artista || 'Nuevo mensaje',
                                body: textoVisor,
                                image: autor.foto_perfil || null,
                                data: {
                                    tipo: 'chat',
                                    canal,
                                    otro_nombre: autor.nombre_artista || '',
                                    n: String(n),
                                    foto: autor.foto_perfil || '',
                                    ultimo: (tipoMensaje === 'imagen' ? '[Imagen]' : contenido).slice(0, 200)
                                },
                                tag: canal,
                                notificationCount: n
                            });
                        };
                        if (errC) return enviar(1);
                        db.query('SELECT n FROM chat_contadores WHERE usuario_id = ? AND canal = ?', [otro, canal], (errS, cnt) => {
                            enviar((!errS && cnt && cnt.length) ? cnt[0].n : 1);
                        });
                    });
                });
            } catch (e) { /* el push nunca debe romper el envío */ }
        }
        if (canal === 'global') {
            db.query("INSERT INTO chat_contadores (usuario_id, canal, n) SELECT id, 'global', 1 FROM artistas WHERE id != ? AND verificado = TRUE ON DUPLICATE KEY UPDATE n = n + 1", [req.user.id], (errG) => {
                if (errG) logger.error('contador chat global:', errG.message);
            });
        }
    }
};

// GET /chat/conversaciones — últimos chats privados del usuario.
const getConversaciones = (req, res) => {
    const me = req.user.id;
    const p1 = `priv:${me}:%`;
    const p2 = `priv:%:${me}`;
    const sql = "SELECT canal, MAX(id) AS last_id, MAX(created_at) AS last_at FROM chat_mensajes WHERE tipo = 'priv' AND ((canal LIKE ? AND oculto_para_menor = 0) OR (canal LIKE ? AND oculto_para_mayor = 0)) GROUP BY canal ORDER BY last_at DESC LIMIT 20";
    db.query(sql, [p1, p2], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (rows.length === 0) return res.json({ success: true, conversaciones: [] });
        const lastIds = rows.map(r => r.last_id);
        const otros = new Set();
        rows.forEach(r => {
            r.canal.replace('priv:', '').split(':').map(Number).forEach(n => { if (n !== me) otros.add(n); });
        });
        const inIds = lastIds.map(() => '?').join(',');
        const inUsers = Array.from(otros).map(() => '?').join(',');
        db.query(`SELECT id, canal, autor_id, contenido, tipo_mensaje, imagen_url, eliminado, created_at FROM chat_mensajes WHERE id IN (${inIds})`, lastIds, (err2, msgs) => {
            if (err2) return res.status(500).json({ success: false, error: err2.message });
            const msgPorId = {};
            msgs.forEach(m => { msgPorId[m.id] = m; });
            db.query(`SELECT id, nombre_artista, foto_perfil FROM artistas WHERE id IN (${inUsers})`, Array.from(otros), (err3, users) => {
                if (err3) return res.status(500).json({ success: false, error: err3.message });
                const userPorId = {};
                users.forEach(u => { userPorId[u.id] = u; });
                const conversaciones = rows.map(r => {
                    const m = msgPorId[r.last_id] || null;
                    const nums = r.canal.replace('priv:', '').split(':').map(Number);
                    const otroId = nums.find(n => n !== me);
                    const u = userPorId[otroId] || {};
                    let textoUltimo = '';
                    if (m) {
                        if (m.eliminado) textoUltimo = '🗑️ Mensaje eliminado';
                        else if (m.tipo_mensaje === 'imagen') textoUltimo = '📷 Imagen';
                        else textoUltimo = m.contenido || '';
                    }
                    return {
                        canal: r.canal,
                        otro_id: otroId,
                        otro_nombre: u.nombre_artista || 'Usuario',
                        otro_foto: u.foto_perfil || null,
                        ultimo: m ? { id: m.id, autor_id: m.autor_id, contenido: textoUltimo, created_at: m.created_at } : null
                    };
                });
                res.json({ success: true, conversaciones });
            });
        });
    });
};

// DELETE /chat/conversaciones — oculta la conversación SOLO para quien la borra.
const eliminarConversacion = (req, res) => {
    const canal = String(req.body.canal || '');
    if (!canalPrivadoValido(canal, req.user.id)) {
        return res.status(400).json({ success: false, error: 'Canal inválido' });
    }
    const nums = canal.replace('priv:', '').split(':').map(Number);
    const col = req.user.id === nums[0] ? 'oculto_para_menor' : 'oculto_para_mayor';
    const sql = `UPDATE chat_mensajes SET ${col} = 1 WHERE canal = ? AND tipo = 'priv' AND ${col} = 0`;
    db.query(sql, [canal], (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        db.query('DELETE FROM chat_contadores WHERE usuario_id = ? AND canal = ?', [req.user.id, canal], (errD) => {
            if (errD) logger.error('limpiar contador al borrar:', errD.message);
        });
        res.json({ success: true, ocultados: result.affectedRows || 0 });
    });
};

// GET /chat/no-leidos — total y desglose por canal de los mensajes sin leer.
const getNoLeidos = (req, res) => {
    db.query('SELECT canal, n FROM chat_contadores WHERE usuario_id = ? AND n > 0', [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        let total = 0;
        const canales = (rows || []).map(r => { total += r.n; return { canal: r.canal, n: r.n }; });
        res.json({ success: true, total, canales });
    });
};

// POST /chat/leido { canal } — resetea el contador y guarda el último id leído
// (alimenta los ✓✓ de "visto").
const marcarLeido = (req, res) => {
    const canal = String(req.body.canal || '');
    if (!canalValido(canal, req.user.id)) {
        return res.status(400).json({ success: false, error: 'Canal inválido' });
    }
    db.query('SELECT MAX(id) AS max_id FROM chat_mensajes WHERE canal = ?', [canal], (errM, mr) => {
        const maxId = (!errM && mr && mr.length) ? (mr[0].max_id || 0) : 0;
        db.query(
            'INSERT INTO chat_contadores (usuario_id, canal, n, ultimo_leido_id) VALUES (?, ?, 0, ?) ON DUPLICATE KEY UPDATE n = 0, ultimo_leido_id = ?',
            [req.user.id, canal, maxId, maxId],
            (err) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true });
            }
        );
    });
};

// POST /chat/reaccion { mensaje_id, emoji } — alterna la reacción del usuario.
const reaccionarMensaje = (req, res) => {
    const mensajeId = parseInt(req.body.mensaje_id, 10) || 0;
    const emoji = String(req.body.emoji || '');
    if (!mensajeId || !EMOJIS_PERMITIDOS.includes(emoji)) {
        return res.status(400).json({ success: false, error: 'Reacción inválida' });
    }
    db.query('SELECT canal FROM chat_mensajes WHERE id = ?', [mensajeId], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!rows || !rows.length || !canalValido(rows[0].canal, req.user.id)) {
            return res.status(400).json({ success: false, error: 'Mensaje inválido' });
        }
        db.query('SELECT 1 FROM chat_reacciones WHERE mensaje_id = ? AND usuario_id = ? AND emoji = ?', [mensajeId, req.user.id, emoji], (errE, exist) => {
            if (errE) return res.status(500).json({ success: false, error: errE.message });
            const quitar = exist && exist.length;
            const q = quitar
                ? 'DELETE FROM chat_reacciones WHERE mensaje_id = ? AND usuario_id = ? AND emoji = ?'
                : 'INSERT INTO chat_reacciones (mensaje_id, usuario_id, emoji) VALUES (?, ?, ?)';
            db.query(q, [mensajeId, req.user.id, emoji], (errR) => {
                if (errR) return res.status(500).json({ success: false, error: errR.message });
                cargarReacciones([mensajeId], req.user.id, (errC, reac) => {
                    if (errC) return res.status(500).json({ success: false, error: errC.message });
                    res.json({ success: true, reacciones: reac[mensajeId] || {} });
                });
            });
        });
    });
};

// PUT /chat/mensajes/:id { contenido } — editar (solo autor, solo texto, no eliminado)
const editarMensaje = (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const contenido = String(req.body.contenido || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'ID inválido' });
    if (!contenido || contenido.length > 1000) {
        return res.status(400).json({ success: false, error: 'Mensaje vacío o demasiado largo' });
    }
    db.query("SELECT autor_id, tipo_mensaje, eliminado FROM chat_mensajes WHERE id = ?", [id], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!rows || !rows.length) return res.status(404).json({ success: false, error: 'Mensaje no encontrado' });
        const m = rows[0];
        if (m.autor_id !== req.user.id) return res.status(403).json({ success: false, error: 'Solo el autor puede editar' });
        if (m.tipo_mensaje !== 'texto' || m.eliminado) return res.status(400).json({ success: false, error: 'Este mensaje no se puede editar' });
        db.query("UPDATE chat_mensajes SET contenido = ?, editado = 1, editado_en = NOW() WHERE id = ?", [contenido, id], (errU) => {
            if (errU) return res.status(500).json({ success: false, error: errU.message });
            res.json({ success: true, mensaje: { id, contenido, editado: true } });
        });
    });
};

// DELETE /chat/mensajes/:id — borrado suave (solo autor); los demás ven
// "Mensaje eliminado" pero el id se conserva (polling/reacciones intactos).
const eliminarMensaje = (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    if (!id) return res.status(400).json({ success: false, error: 'ID inválido' });
    db.query('SELECT autor_id FROM chat_mensajes WHERE id = ?', [id], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!rows || !rows.length) return res.status(404).json({ success: false, error: 'Mensaje no encontrado' });
        if (rows[0].autor_id !== req.user.id) return res.status(403).json({ success: false, error: 'Solo el autor puede borrar' });
        db.query("UPDATE chat_mensajes SET eliminado = 1, contenido = '' WHERE id = ?", [id], (errU) => {
            if (errU) return res.status(500).json({ success: false, error: errU.message });
            res.json({ success: true, id });
        });
    });
};

// POST /chat/typing { canal } — avisa que el usuario está escribiendo.
const indicarTyping = (req, res) => {
    const canal = String(req.body.canal || '');
    if (!canalValido(canal, req.user.id)) {
        return res.status(400).json({ success: false, error: 'Canal inválido' });
    }
    if (!typingPorCanal[canal]) typingPorCanal[canal] = {};
    typingPorCanal[canal][req.user.id] = Date.now();
    res.json({ success: true });
};

// POST /chat/bloquear { usuario_id } — bloquea al usuario (no se pueden enviar
// mensajes en ninguna dirección; la conversación se conserva para desbloquear).
const bloquearUsuario = (req, res) => {
    const objetivo = parseInt(req.body.usuario_id, 10) || 0;
    if (!objetivo || objetivo === req.user.id) {
        return res.status(400).json({ success: false, error: 'Usuario inválido' });
    }
    db.query('INSERT IGNORE INTO chat_bloqueos (usuario_id, bloqueado_id) VALUES (?, ?)', [req.user.id, objetivo], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true });
    });
};

// DELETE /chat/bloquear { usuario_id } — desbloquea.
const desbloquearUsuario = (req, res) => {
    const objetivo = parseInt(req.body.usuario_id, 10) || 0;
    if (!objetivo) return res.status(400).json({ success: false, error: 'Usuario inválido' });
    db.query('DELETE FROM chat_bloqueos WHERE usuario_id = ? AND bloqueado_id = ?', [req.user.id, objetivo], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true });
    });
};

// POST /chat/denunciar { usuario_id, motivo } — guarda la denuncia.
const denunciarUsuario = (req, res) => {
    const objetivo = parseInt(req.body.usuario_id, 10) || 0;
    const motivo = String(req.body.motivo || '').trim();
    if (!objetivo || objetivo === req.user.id) {
        return res.status(400).json({ success: false, error: 'Usuario inválido' });
    }
    if (!motivo || motivo.length > 300) {
        return res.status(400).json({ success: false, error: 'Motivo requerido (máx. 300 caracteres)' });
    }
    db.query('INSERT INTO chat_denuncias (denunciante_id, denunciado_id, motivo) VALUES (?, ?, ?)', [req.user.id, objetivo, motivo], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true });
    });
};

// POST /chat/imagen — sube la imagen del mensaje a Cloudinary y devuelve la URL.
const subirImagen = (req, res) => {
    if (!req.file || !req.file.buffer) {
        return res.status(400).json({ success: false, error: 'Imagen requerida' });
    }
    const { uploadToCloudinary } = require('../services/cloudinaryService');
    uploadToCloudinary(req.file.buffer, 'comunidadcreatio/chat')
        .then(resultado => {
            res.json({ success: true, url: resultado.secure_url });
        })
        .catch(err => {
            logger.error('subir imagen chat:', err && err.message);
            res.status(500).json({ success: false, error: 'No se pudo subir la imagen' });
        });
};

module.exports = { getDirectorio, getMensajes, enviarMensaje, getConversaciones, eliminarConversacion, marcarLeido, getNoLeidos, reaccionarMensaje, editarMensaje, eliminarMensaje, indicarTyping, bloquearUsuario, desbloquearUsuario, denunciarUsuario, subirImagen };
