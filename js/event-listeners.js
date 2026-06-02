// js/event-listeners.js
import { token, artistaActual, login, register, logout } from './auth.js';
import { TOKEN_KEY, ARTISTA_KEY, apiRequest } from './config.js';
import { 
    btnPerfil, obraForm, imagenesAEliminar, 
    currentPage, currentLimit, currentSearch, currentSortBy, currentOrder, totalObras,
    desktopLogoutModal, desktopLogoutAllBtn, desktopLogoutSingleBtn, 
    desktopMainMenu, mobileMainMenu,
    clickOutsideHandlerLogout, clickOutsideHandlerMainMenu, mobileOutsideClickListener,
    activeSessionsCount
} from './dom-globals.js';
import { mostrarErrores, limpiarFormularioCompleto, poblarCiudades } from './utils.js';
import { fetchActiveSessionsCount, updateCerrarTodasSesionesButtonState, closeAllSessions } from './session-manager.js';
import { ejecutarLogout, cerrarMobileLogoutModal, cerrarDesktopLogoutModal, cerrarDesktopMainMenu, cerrarMenuMovil, positionDesktopPanel } from './logout-panels.js';
import { mostrarPaginaBlanca, toggleGaleria, togglePanel, refrescarTabla, mostrarPanelArtista } from './views.js';
import { guardarObra } from './panel.js';

export function setupEvents() {
    // Panel de logout (escritorio y móvil)
    const logoutIcon = document.getElementById('btn-logout-sidebar');
    if (logoutIcon) {
        logoutIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                const mobileModal = document.getElementById('mobile-logout-options');
                if (mobileModal) {
                    if (mobileModal.classList.contains('hidden')) {
                        mobileModal.classList.remove('hidden');
                        setTimeout(() => {
                            document.addEventListener('click', function onClickOutsideMobile(e) {
                                if (!mobileModal.contains(e.target) && e.target !== logoutIcon) {
                                    mobileModal.classList.add('hidden');
                                    document.removeEventListener('click', onClickOutsideMobile);
                                }
                            });
                        }, 0);
                    } else {
                        mobileModal.classList.add('hidden');
                    }
                }
            } else {
                if (!desktopLogoutModal) {
                    desktopLogoutModal = document.getElementById('desktop-logout-options');
                    desktopLogoutAllBtn = document.getElementById('desktop-logout-all');
                    desktopLogoutSingleBtn = document.getElementById('desktop-logout-single');
                    if (desktopLogoutAllBtn) {
                        desktopLogoutAllBtn.addEventListener('click', () => {
                            closeAllSessions();
                            cerrarDesktopLogoutModal();
                        });
                    }
                    if (desktopLogoutSingleBtn) {
                        desktopLogoutSingleBtn.addEventListener('click', async () => {
                            cerrarDesktopLogoutModal();
                            await ejecutarLogout();
                        });
                    }
                }
                if (desktopLogoutModal.classList.contains('hidden')) {
                    updateCerrarTodasSesionesButtonState();
                    positionDesktopPanel(logoutIcon, desktopLogoutModal);
                    desktopLogoutModal.classList.remove('hidden');
                    if (clickOutsideHandlerLogout) {
                        document.removeEventListener('click', clickOutsideHandlerLogout);
                    }
                    clickOutsideHandlerLogout = function(event) {
                        if (desktopLogoutModal && !desktopLogoutModal.contains(event.target) && event.target !== logoutIcon) {
                            cerrarDesktopLogoutModal();
                        }
                    };
                    setTimeout(() => {
                        document.addEventListener('click', clickOutsideHandlerLogout);
                    }, 0);
                } else {
                    cerrarDesktopLogoutModal();
                }
            }
        });
    }

    // Menú principal unificado (Galería + Panel)
    const menuBtn = document.getElementById('btn-menu-principal');
    if (menuBtn) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isMobile = window.innerWidth <= 768;

            if (isMobile) {
                if (!mobileMainMenu) {
                    mobileMainMenu = document.getElementById('mobile-main-menu');
                    if (!mobileMainMenu) return;
                    document.getElementById('mobile-menu-galeria')?.addEventListener('click', () => {
                        cerrarMenuMovil();
                        toggleGaleria();
                    });
                    document.getElementById('mobile-menu-panel')?.addEventListener('click', () => {
                        cerrarMenuMovil();
                        togglePanel();
                    });
                    mobileMainMenu.addEventListener('click', (evento) => {
                        if (evento.target === mobileMainMenu) cerrarMenuMovil();
                    });
                }
                if (mobileMainMenu.classList.contains('hidden')) {
                    mobileMainMenu.classList.remove('hidden');
                    if (mobileOutsideClickListener) {
                        document.removeEventListener('click', mobileOutsideClickListener);
                    }
                    mobileOutsideClickListener = (event) => {
                        if (!mobileMainMenu.contains(event.target) && !menuBtn.contains(event.target)) {
                            cerrarMenuMovil();
                        }
                    };
                    setTimeout(() => document.addEventListener('click', mobileOutsideClickListener), 10);
                } else {
                    cerrarMenuMovil();
                }
            } else {
                if (!desktopMainMenu) {
                    desktopMainMenu = document.getElementById('desktop-main-menu');
                    if (!desktopMainMenu) return;
                    document.getElementById('menu-galeria')?.addEventListener('click', () => {
                        cerrarDesktopMainMenu();
                        toggleGaleria();
                    });
                    document.getElementById('menu-panel')?.addEventListener('click', () => {
                        cerrarDesktopMainMenu();
                        togglePanel();
                    });
                }
                if (desktopMainMenu.classList.contains('hidden')) {
                    positionDesktopPanel(menuBtn, desktopMainMenu);
                    desktopMainMenu.classList.remove('hidden');
                    if (clickOutsideHandlerMainMenu) document.removeEventListener('click', clickOutsideHandlerMainMenu);
                    clickOutsideHandlerMainMenu = (event) => {
                        if (desktopMainMenu && !desktopMainMenu.contains(event.target) && !menuBtn.contains(event.target)) {
                            cerrarDesktopMainMenu();
                        }
                    };
                    setTimeout(() => document.addEventListener('click', clickOutsideHandlerMainMenu), 10);
                } else {
                    cerrarDesktopMainMenu();
                }
            }
        });
    }

    // Botones del panel móvil de logout
    const mobileSingle = document.getElementById('mobile-logout-single');
    if (mobileSingle) {
        mobileSingle.addEventListener('click', async () => {
            cerrarMobileLogoutModal();
            await ejecutarLogout();
        });
    }
    const mobileAll = document.getElementById('mobile-logout-all');
    if (mobileAll) {
        mobileAll.addEventListener('click', async () => {
            cerrarMobileLogoutModal();
            if (activeSessionsCount >= 2) {
                await closeAllSessions();
            } else {
                alert("No hay otras sesiones activas. Solo tienes la sesión actual.");
            }
        });
    }
    const mobileModalLogout = document.getElementById('mobile-logout-options');
    if (mobileModalLogout) {
        mobileModalLogout.addEventListener('click', (e) => {
            if (e.target === mobileModalLogout) cerrarMobileLogoutModal();
        });
    }

    // Resto de eventos
    document.getElementById('btn-olvide-contrasena').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('modal-login').classList.add('hidden');
        document.getElementById('modal-restablecimiento').classList.remove('hidden');
    });

    document.getElementById('btn-aplicar-filtros').addEventListener('click', () => {
        currentSearch = document.getElementById('search-input').value;
        currentSortBy = document.getElementById('sort-select').value;
        currentOrder = document.getElementById('order-select').value;
        currentLimit = parseInt(document.getElementById('limit-select').value);
        currentPage = 1;
        refrescarTabla();
    });

    document.getElementById('reg-pais').addEventListener('change', function() {
        poblarCiudades(this.value);
    });

    document.getElementById('btn-prev').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            refrescarTabla();
        }
    });

    document.getElementById('btn-next').addEventListener('click', () => {
        const totalPages = Math.ceil(totalObras / currentLimit);
        if (currentPage < totalPages) {
            currentPage++;
            refrescarTabla();
        }
    });

    btnPerfil.addEventListener('click', () => {
        if (token) mostrarPanelArtista();
        else document.getElementById('modal-login').classList.remove('hidden');
    });

    // Login
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-pass').value;
        const result = await login(email, password);
        if (result.success) {
            const modalLogin = document.getElementById('modal-login');
            modalLogin.classList.add('hidden');
            modalLogin.classList.remove('modal-fullscreen');
            document.getElementById('modal-registro').classList.add('hidden');
            document.getElementById('modal-registro').classList.remove('modal-fullscreen');
            document.getElementById('toggle-panel').classList.remove('hidden');
            mostrarPaginaBlanca();
            await fetchActiveSessionsCount();
        } else {
            mostrarErrores(result);
        }
    });

    // Registro
    document.getElementById('registro-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre_artista = document.getElementById('reg-nombre-artista').value;
        const nombres = document.getElementById('reg-nombres').value;
        const apellidos = document.getElementById('reg-apellidos').value;
        const nombre_real = `${nombres} ${apellidos}`.trim();
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-pass').value;
        const telefono = document.getElementById('reg-telefono').value;
        const pais = document.getElementById('reg-pais').value;
        const ciudad = document.getElementById('reg-ciudad').value;
        const genero = document.getElementById('reg-genero').value;
        const dia = document.getElementById('reg-dia').value;
        const mes = document.getElementById('reg-mes').value;
        const ano = document.getElementById('reg-ano').value;
        if (!dia || !mes || !ano) {
            alert("❌ Todos los campos de fecha son obligatorios.");
            return;
        }
        const fechaNac = new Date(ano, mes - 1, dia);
        if (fechaNac.getFullYear() != ano || fechaNac.getMonth() != mes - 1 || fechaNac.getDate() != dia) {
            alert("❌ La fecha seleccionada no es válida.");
            return;
        }
        const hoy = new Date();
        let edad = hoy.getFullYear() - fechaNac.getFullYear();
        const mesDiff = hoy.getMonth() - fechaNac.getMonth();
        if (mesDiff < 0 || (mesDiff === 0 && hoy.getDate() < fechaNac.getDate())) edad--;
        if (edad < 18) {
            alert("⚠️ Debes tener al menos 18 años para registrarte.");
            return;
        }
        const fecha_nacimiento = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        const result = await register(
            nombre_artista, nombre_real, email, password, telefono, pais, ciudad, fecha_nacimiento, genero
        );
        if (result.success) {
            alert("¡Registro exitoso! Te hemos enviado un correo de confirmación. Por favor revisa tu bandeja de entrada y SPAM.");
            const modalRegistro = document.getElementById('modal-registro');
            modalRegistro.classList.add('hidden');
            modalRegistro.classList.remove('modal-fullscreen');
            const modalLogin = document.getElementById('modal-login');
            modalLogin.classList.remove('hidden');
            modalLogin.classList.add('modal-fullscreen');
            document.getElementById('registro-form').reset();
        } else {
            mostrarErrores(result);
        }
    });

    // Guardar obra
    obraForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const titulo = document.getElementById('input-titulo').value;
        const artista = document.getElementById('input-artista').value;
        const precio = document.getElementById('input-precio').value;
        const idPersonalizado = document.getElementById('input-id-personalizado').value;
        const idEdicion = document.getElementById('input-id-edicion').value;
        const ano = document.getElementById('input-ano').value;
        const descripcion_tecnica = document.getElementById('input-descripcion-tecnica').value;
        const soporte = document.getElementById('input-soporte').value;
        const descripcion_artistica = document.getElementById('input-descripcion-artistica').value;
        const estado_obra = document.getElementById('input-estado-obra').value;
        const procedencia = document.getElementById('input-procedencia').value;
        const marcos = document.getElementById('input-marcos').value;
        const certificado = document.getElementById('input-certificado').value;
        const status = document.getElementById('input-status').value;
        const ancho = document.getElementById('input-ancho').value;
        const alto = document.getElementById('input-alto').value;
        const firma = document.getElementById('input-firma').value;
        const conservacion = document.getElementById('input-conservacion').value;
        const etiquetas = document.getElementById('input-etiquetas').value;
        const archivos = [
            document.getElementById('input-imagen-0'),
            document.getElementById('input-imagen-1'),
            document.getElementById('input-imagen-2'),
            document.getElementById('input-imagen-3'),
            document.getElementById('input-imagen-4')
        ];
        let imagenFinalVisible = false;
        const hayArchivosNuevos = archivos.some(input => input && input.files && input.files.length > 0);
        for (let i = 0; i < 5; i++) {
            const preview = document.getElementById(`preview-${i}`);
            if (preview && preview.style.display === 'block' && !imagenesAEliminar.has(i)) {
                imagenFinalVisible = true;
                break;
            }
        }
        if (!hayArchivosNuevos && !imagenFinalVisible) {
            alert("❌ La obra debe tener al menos una imagen. No puedes guardar sin imágenes.");
            return;
        }
        const formData = new FormData();
        formData.append('titulo', titulo);
        formData.append('artista', artista);
        formData.append('precio', precio);
        formData.append('id_obra', idPersonalizado);
        formData.append('ano', ano);
        formData.append('descripcion_tecnica', descripcion_tecnica);
        formData.append('soporte', soporte);
        formData.append('descripcion_artistica', descripcion_artistica);
        formData.append('estado_obra', estado_obra);
        formData.append('procedencia', procedencia);
        formData.append('marcos', marcos);
        formData.append('certificado', certificado);
        formData.append('status', status);
        formData.append('ancho', ancho);
        formData.append('alto', alto);
        formData.append('firma', firma);
        formData.append('conservacion', conservacion);
        formData.append('etiquetas', etiquetas);
        if (imagenesAEliminar.size > 0) {
            formData.append('imagenes_a_eliminar', JSON.stringify([...imagenesAEliminar]));
        }
        archivos.forEach((input, index) => {
            if (input && input.files && input.files.length > 0) {
                formData.append(`imagen_${index}`, input.files[0]);
            }
        });
        const result = await guardarObra(token, formData, idEdicion || null);
        if (result.success) {
            alert("Obra guardada correctamente.");
            document.getElementById('btn-guardar').textContent = 'Guardar Obra';
            imagenesAEliminar.clear();
            limpiarFormularioCompleto(true);
            await refrescarTabla();
        } else {
            mostrarErrores(result);
        }
    });

    document.getElementById('btn-limpiar-campos').addEventListener('click', () => limpiarFormularioCompleto(true));
    document.getElementById('btn-ir-registro').addEventListener('click', () => {
        document.getElementById('modal-login').classList.add('hidden');
        document.getElementById('modal-login').classList.remove('modal-fullscreen');
        document.getElementById('modal-registro').classList.remove('hidden');
        document.getElementById('modal-registro').classList.add('modal-fullscreen');
    });
    document.getElementById('btn-ir-login').addEventListener('click', () => {
        document.getElementById('modal-registro').classList.add('hidden');
        document.getElementById('modal-registro').classList.remove('modal-fullscreen');
        document.getElementById('modal-login').classList.remove('hidden');
        document.getElementById('modal-login').classList.add('modal-fullscreen');
    });
    document.getElementById('btn-eliminar-cuenta').addEventListener('click', () => {
        document.getElementById('modal-confirmar-eliminacion').classList.remove('hidden');
    });
    document.getElementById('solicitar-restablecimiento-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('reset-email').value;
        const messageEl = document.getElementById('reset-message');
        messageEl.style.display = 'block';
        messageEl.textContent = '⏳ Enviando solicitud...';
        messageEl.style.color = '#555';
        try {
            const res = await apiRequest('/api/artistas/solicitar-restablecimiento', {
                method: 'POST',
                body: JSON.stringify({ email })
            });
            if (res && res.success) {
                messageEl.textContent = '✅ Si el correo está registrado, recibirás un enlace en tu bandeja de entrada.';
                messageEl.style.color = '#28a745';
            } else if (res && res.error) {
                messageEl.textContent = '❌ Error: ' + res.error;
                messageEl.style.color = '#dc3545';
            } else {
                messageEl.textContent = '❌ Error de conexión. Inténtalo más tarde.';
                messageEl.style.color = '#dc3545';
            }
        } catch (error) {
            console.error('Error al solicitar restablecimiento:', error);
            messageEl.textContent = '❌ Error de conexión. Inténtalo más tarde.';
            messageEl.style.color = '#dc3545';
        }
    });
    document.getElementById('confirmar-eliminacion-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('confirmar-password').value;
        const mensajeError = document.getElementById('mensaje-error');
        mensajeError.style.display = 'none';
        try {
            const res = await apiRequest('/api/artistas/eliminar-cuenta', {
                method: 'POST',
                body: JSON.stringify({ password })
            });
            if (res && res.success) {
                alert("✅ Tu cuenta ha sido eliminada correctamente.");
                logout();
                location.reload();
            } else if (res && (res.errors || res.error)) {
                if (Array.isArray(res.errors) && res.errors.length > 0) {
                    mensajeError.textContent = '❌ ' + res.errors.join('\n');
                } else if (res.error) {
                    mensajeError.textContent = '❌ ' + res.error;
                } else {
                    mensajeError.textContent = '❌ Error desconocido.';
                }
                mensajeError.style.display = 'block';
            } else {
                mensajeError.textContent = '❌ Error de conexión. Intenta más tarde.';
                mensajeError.style.display = 'block';
            }
        } catch (error) {
            mensajeError.textContent = '❌ Error de conexión. Intenta más tarde.';
            mensajeError.style.display = 'block';
        }
    });
    document.querySelectorAll('.cerrar-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) modal.classList.add('hidden');
        });
    });
}