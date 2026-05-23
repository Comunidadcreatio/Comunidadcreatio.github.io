// ============================================
// VARIABLES GLOBALES
// ============================================
window.obrasData = [];
window.editingId = null;
window.currentSlide = 0;
let artistaToken = localStorage.getItem('artistaToken');
let artistaActual = null;

// ============================================
// CONFIGURACIÓN INICIAL
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-menu a');
    const cartContainer = document.getElementById('cart-container');
    const perfilBtn = document.getElementById('perfil-btn');
    const artistDashboard = document.getElementById('artist-dashboard');
    const artistArtworkForm = document.getElementById('artista-artwork-form');
    const btnArtistaSave = document.getElementById('btn-artista-save');
    const btnArtistaUpdate = document.getElementById('btn-artista-update');
    const btnArtistaClear = document.getElementById('btn-artista-clear');
    const btnArtistLogout = document.getElementById('btn-artist-logout');
    const artistaBuscador = document.getElementById('artista-buscador-obras');
    const loginModal = document.getElementById('login-artista-modal');
    const registroModal = document.getElementById('registro-artista-modal');
    const loginForm = document.getElementById('login-artista-form');
    const registroForm = document.getElementById('registro-artista-form');

    // --- NAVEGACIÓN ---
    if (menuBtn && navMenu) {
        menuBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }

    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const linkText = this.textContent.trim().toLowerCase();
            if (linkText === 'galería' || linkText === 'galeria') {
                document.querySelector('.main-content').classList.add('hidden');
                document.getElementById('galeria').classList.remove('hidden');
                cargarGaleria();
                if (cartContainer) {
                    cartContainer.classList.remove('hidden');
                    cartContainer.classList.add('show-anim');
                }
                artistDashboard.classList.add('hidden');
            } else if (linkText === 'inicio') {
                document.querySelector('.main-content').classList.remove('hidden');
                document.getElementById('galeria').classList.add('hidden');
                artistDashboard.classList.add('hidden');
                if (cartContainer) {
                    cartContainer.classList.add('hidden');
                }
            }
            navLinks.forEach(el => el.classList.remove('active'));
            this.classList.add('active');
            if (navMenu) navMenu.classList.remove('active');
        });
    });

    // --- AUTENTICACIÓN ---
    if (artistaToken) {
        try {
            artistaActual = JSON.parse(localStorage.getItem('artistaData'));
            if (artistaActual) actualizarInterfazArtista();
        } catch (e) {
            localStorage.removeItem('artistaToken');
            localStorage.removeItem('artistaData');
            artistaToken = null;
            artistaActual = null;
        }
    }

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) this.classList.add('hidden');
        });
    });
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            this.closest('.modal').classList.add('hidden');
        });
    });
    document.getElementById('ir-a-registro')?.addEventListener('click', (e) => {
        e.preventDefault();
        loginModal.classList.add('hidden');
        registroModal.classList.remove('hidden');
    });

    // --- REGISTRO ---
    if (registroForm) {
        registroForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnSubmit = registroForm.querySelector('button[type="submit"]');
            const originalText = btnSubmit.innerHTML;
            btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registrando...';
            btnSubmit.disabled = true;
            const data = {
                nombre_artista: document.getElementById('reg-nombre-artista').value,
                nombre_real: document.getElementById('reg-nombre-real').value,
                email: document.getElementById('reg-email').value,
                password: document.getElementById('reg-password').value
            };
            try {
                const response = await fetch('https://backend-fundacion-atpe.onrender.com/api/artistas/registro', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await response.json();
                if (result.success) {
                    alert("¡Registro exitoso! Ahora puedes iniciar sesión.");
                    registroModal.classList.add('hidden');
                    loginModal.classList.remove('hidden');
                    registroForm.reset();
                } else {
                    alert("Error: " + (result.error || "Ocurrió un error"));
                }
            } catch (error) {
                alert("Error de conexión.");
            } finally {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
        });
    }

    // --- LOGIN ---
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnSubmit = loginForm.querySelector('button[type="submit"]');
            const originalText = btnSubmit.innerHTML;
            btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Iniciando sesión...';
            btnSubmit.disabled = true;
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            try {
                const response = await fetch('https://backend-fundacion-atpe.onrender.com/api/artistas/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const result = await response.json();
                if (result.success) {
                    artistaToken = result.token;
                    artistaActual = result.artista;
                    localStorage.setItem('artistaToken', artistaToken);
                    localStorage.setItem('artistaData', JSON.stringify(artistaActual));
                    loginModal.classList.add('hidden');
                    actualizarInterfazArtista();
                    irAlPanelDeArtista();
                } else {
                    alert("Error: " + (result.error || "Credenciales incorrectas"));
                }
            } catch (error) {
                alert("Error de conexión.");
            } finally {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
        });
    }

    // --- NAVEGACIÓN AL PANEL ---
    if (perfilBtn) {
        perfilBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (artistaToken && artistaActual) {
                irAlPanelDeArtista();
            } else {
                loginModal.classList.remove('hidden');
            }
        });
    }

    function irAlPanelDeArtista() {
        if (!artistaToken || !artistaActual) return;
        document.querySelector('.main-content').classList.add('hidden');
        document.getElementById('galeria').classList.add('hidden');
        artistDashboard.classList.remove('hidden');
        document.getElementById('artist-username').textContent = artistaActual.nombre_artista;
        cargarMisObras();
    }

    // --- LOGOUT ---
    if (btnArtistLogout) {
        btnArtistLogout.addEventListener('click', () => {
            localStorage.removeItem('artistaToken');
            localStorage.removeItem('artistaData');
            artistaToken = null;
            artistaActual = null;
            artistDashboard.classList.add('hidden');
            document.querySelector('.main-content').classList.remove('hidden');
            actualizarInterfazArtista();
            alert("Sesión cerrada.");
        });
    }

    // --- FUNCIONES DEL PANEL ---
    async function cargarMisObras() {
        if (!artistaToken) return;
        try {
            const response = await fetch('https://backend-fundacion-atpe.onrender.com/api/artistas/mis-obras', {
                headers: { 'Authorization': `Bearer ${artistaToken}` }
            });
            const obras = await response.json();
            renderizarTablaArtista(obras);
        } catch (error) {
            console.error("Error cargando mis obras:", error);
        }
    }

    function renderizarTablaArtista(listaObras) {
        const tbody = document.getElementById('artista-tabla-obras-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!listaObras || listaObras.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#888;">No tienes obras registradas.</td></tr>';
            return;
        }
        listaObras.forEach(obra => {
            let urlFinal = '';
            const valorImagen = obra.imagen_url;
            const dominio = 'https://backend-fundacion-atpe.onrender.com';
            if (!valorImagen) {
                urlFinal = 'https://placehold.co/35';
            } else if (valorImagen.startsWith('http')) {
                urlFinal = valorImagen;
            } else {
                urlFinal = valorImagen.startsWith('/') ? `${dominio}${valorImagen}` : `${dominio}/${valorImagen}`;
            }
            const statusClass = (obra.status === 'Inactivo') ? 'badge-inactive' : 'badge-active';
            const displayId = obra.id_personalizado || obra.id;
            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td>${displayId}</td>
                <td>${obra.titulo}</td>
                <td>${obra.artista}</td>
                <td>${obra.certificado || 'N/A'}</td>
                <td>${obra.precio || '0'}$</td>
                <td><span class="${statusClass}">${obra.status || 'Activo'}</span></td>
                <td>
                    <img src="${urlFinal}" style="width:35px; height:35px; border-radius:5px; object-fit:cover;" onerror="this.onerror=null; this.src='https://placehold.co/35'">
                </td>
                <td>
                    <div class="actions-cell">
                        <button class="btn-icon-edit" onclick="prepararEdicionArtista(${obra.id})" title="Editar">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="btn-icon-duplicate" onclick="window.duplicarObra(${obra.id})" title="Duplicar">
                            <i class="fa-solid fa-copy"></i>
                        </button>
                        <button class="btn-icon-delete" onclick="eliminarObraArtista(${obra.id})" title="Eliminar">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(fila);
        });
    }

    if (artistaBuscador) {
        artistaBuscador.addEventListener('input', (e) => {
            const texto = e.target.value.toLowerCase().trim();
            const filas = document.querySelectorAll('#artista-tabla-obras-body tr');
            filas.forEach(fila => {
                const celdas = fila.querySelectorAll('td');
                let coincide = false;
                celdas.forEach(celda => {
                    if (celda.textContent.toLowerCase().includes(texto)) coincide = true;
                });
                fila.style.display = coincide ? '' : 'none';
            });
        });
    }

    function validarFormularioArtista() {
        const inputs = artistArtworkForm.querySelectorAll('input:not([type="file"]), select, textarea');
        let hayVacios = false;
        inputs.forEach(input => {
            if (input.value.trim() === "") {
                hayVacios = true;
                input.style.border = "2px solid #e74c3c";
            } else {
                input.style.border = "none";
            }
        });
        if (hayVacios) {
            alert("⚠️ Por favor, llena todos los campos vacíos antes de continuar.");
            return false;
        }
        return true;
    }

    // --- GUARDAR OBRA (con fieldMap) ---
    if (artistArtworkForm) {
        artistArtworkForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!validarFormularioArtista()) return;
            if (!artistaToken) return;

            const originalText = btnArtistaSave.innerHTML;
            btnArtistaSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
            btnArtistaSave.disabled = true;

            const formData = new FormData();
            for (let i = 0; i < 5; i++) {
                const inputArchivo = document.getElementById(`artista-imagen-${i}`);
                if (inputArchivo && inputArchivo.files[0]) {
                    formData.append(`imagen_${i}`, inputArchivo.files[0]);
                }
            }

            // 🚀 CAMBIO CLAVE: MAPA DE CAMPOS (ID HTML -> NOMBRE BACKEND)
            const fieldMap = {
                'titulo': 'artista-titulo',
                'artista': 'artista-artista',
                'ano': 'artista-ano',
                'descripcion_tecnica': 'artista-tec-desc',
                'descripcion_artistica': 'artista-art-desc',
                'status': 'artista-status',
                'estado_obra': 'artista-estado-obra',
                'ancho': 'artista-ancho',
                'alto': 'artista-alto',
                'peso': 'artista-peso',
                'marcos': 'artista-marcos',
                'precio': 'artista-precio',
                'certificado': 'artista-certificado',
                'id_obra': 'artista-id', // 🔥 El backend espera 'id_obra'
                'procedencia': 'artista-procedencia',
                'firma': 'artista-firma',
                'soporte': 'artista-soporte',
                'conservacion': 'artista-conservacion',
                'etiquetas': 'artista-etiquetas',
                'localizacion': 'artista-localizacion'
            };

            Object.keys(fieldMap).forEach(backendField => {
                const inputId = fieldMap[backendField];
                const element = document.getElementById(inputId);
                if (element) {
                    formData.append(backendField, element.value);
                }
            });

            try {
                const response = await fetch('https://backend-fundacion-atpe.onrender.com/obras', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${artistaToken}` },
                    body: formData
                });
                const result = await response.json();
                if (response.ok && result.success) {
                    alert("¡Obra guardada exitosamente!");
                    resetFormularioArtista();
                    cargarMisObras();
                    cargarGaleria(); // 🔥 Refrescar la galería pública
                } else {
                    alert("Error: " + (result.error || "No se pudo guardar"));
                }
            } catch (error) {
                console.error("Error al guardar obra:", error);
                alert("Error de conexión.");
            } finally {
                btnArtistaSave.innerHTML = originalText;
                btnArtistaSave.disabled = false;
            }
        });
    }

    // --- PREPARAR EDICIÓN ---
    window.prepararEdicionArtista = function(id) {
        if (!artistaToken) return;
        fetch(`https://backend-fundacion-atpe.onrender.com/obras/${id}`, {
            headers: { 'Authorization': `Bearer ${artistaToken}` }
        })
        .then(res => res.json())
        .then(obra => {
            if (!obra) return;
            window.editingId = id;
            document.getElementById('artist-dashboard').scrollTo({ top: 0, behavior: 'smooth' });

            // 🚀 MAPA DE CAMPOS PARA LLENAR EL FORMULARIO
            const fieldMap = {
                'artista-titulo': 'titulo',
                'artista-artista': 'artista',
                'artista-ano': 'ano',
                'artista-tec-desc': 'descripcion_tecnica',
                'artista-art-desc': 'descripcion_artistica',
                'artista-status': 'status',
                'artista-estado-obra': 'estado_obra',
                'artista-ancho': 'ancho',
                'artista-alto': 'alto',
                'artista-peso': 'peso',
                'artista-marcos': 'marcos',
                'artista-precio': 'precio',
                'artista-certificado': 'certificado',
                'artista-id': 'id_personalizado', // 🔥 El campo del HTML es 'artista-id'
                'artista-procedencia': 'procedencia',
                'artista-firma': 'firma',
                'artista-soporte': 'soporte',
                'artista-conservacion': 'conservacion',
                'artista-etiquetas': 'etiquetas',
                'artista-localizacion': 'localizacion'
            };

            Object.keys(fieldMap).forEach(inputId => {
                const valor = obra[fieldMap[inputId]] || '';
                document.getElementById(inputId).value = valor;
            });

            // 🌟 CARGAR IMÁGENES
            const imagenes = obra.todas_imagenes || [];
            for (let i = 0; i < 5; i++) {
                const slot = document.getElementById(`artista-slot-${i}`);
                const imgPreview = slot.querySelector('.preview-img');
                if (imagenes[i]) {
                    imgPreview.src = imagenes[i];
                    imgPreview.classList.remove('hidden');
                    slot.classList.add('has-image');
                } else {
                    imgPreview.src = '';
                    imgPreview.classList.add('hidden');
                    slot.classList.remove('has-image');
                }
            }

            // Mostrar botón de actualizar, ocultar guardar
            document.getElementById('btn-artista-save').style.display = 'none';
            document.getElementById('btn-artista-update').style.display = 'block';
        })
        .catch(err => console.error("Error al cargar obra para editar:", err));
    };

    // --- ACTUALIZAR OBRA ---
    if (btnArtistaUpdate) {
        btnArtistaUpdate.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!validarFormularioArtista()) return;
            if (!window.editingId) { alert("Selecciona una obra para actualizar."); return; }
            if (!artistaToken) return;

            const originalText = btnArtistaUpdate.innerHTML;
            btnArtistaUpdate.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Actualizando...';
            btnArtistaUpdate.disabled = true;

            const formData = new FormData();
            for (let i = 0; i < 5; i++) {
                const inputArchivo = document.getElementById(`artista-imagen-${i}`);
                if (inputArchivo && inputArchivo.files[0]) {
                    formData.append(`imagen_${i}`, inputArchivo.files[0]);
                }
            }

            // Usar el mismo fieldMap que en guardar
            const fieldMap = {
                'titulo': 'artista-titulo',
                'artista': 'artista-artista',
                'ano': 'artista-ano',
                'descripcion_tecnica': 'artista-tec-desc',
                'descripcion_artistica': 'artista-art-desc',
                'status': 'artista-status',
                'estado_obra': 'artista-estado-obra',
                'ancho': 'artista-ancho',
                'alto': 'artista-alto',
                'peso': 'artista-peso',
                'marcos': 'artista-marcos',
                'precio': 'artista-precio',
                'certificado': 'artista-certificado',
                'id_obra': 'artista-id',
                'procedencia': 'artista-procedencia',
                'firma': 'artista-firma',
                'soporte': 'artista-soporte',
                'conservacion': 'artista-conservacion',
                'etiquetas': 'artista-etiquetas',
                'localizacion': 'artista-localizacion'
            };

            Object.keys(fieldMap).forEach(backendField => {
                const inputId = fieldMap[backendField];
                const element = document.getElementById(inputId);
                if (element) {
                    formData.append(backendField, element.value);
                }
            });

            try {
                const response = await fetch(`https://backend-fundacion-atpe.onrender.com/obras/${window.editingId}`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${artistaToken}` },
                    body: formData
                });
                const result = await response.json();
                if (response.ok && result.success) {
                    alert("¡Obra actualizada correctamente!");
                    resetFormularioArtista();
                    cargarMisObras();
                    cargarGaleria();
                } else {
                    alert("Error al actualizar: " + (result.error || "Desconocido"));
                }
            } catch (error) {
                console.error("Error en actualización:", error);
                alert("Error de conexión.");
            } finally {
                btnArtistaUpdate.innerHTML = originalText;
                btnArtistaUpdate.disabled = false;
            }
        });
    }

    // --- DUPLICAR OBRA ---
    window.duplicarObra = function(id) {
        if (!artistaToken) return;
        fetch(`https://backend-fundacion-atpe.onrender.com/obras/${id}`, {
            headers: { 'Authorization': `Bearer ${artistaToken}` }
        })
        .then(res => res.json())
        .then(obra => {
            if (!obra) return;
            resetFormularioArtista();
            // Llenar el formulario con los datos de la obra
            document.getElementById('artista-titulo').value = obra.titulo || '';
            document.getElementById('artista-artista').value = obra.artista || '';
            document.getElementById('artista-ano').value = obra.ano || '';
            document.getElementById('artista-tec-desc').value = obra.descripcion_tecnica || '';
            document.getElementById('artista-art-desc').value = obra.descripcion_artistica || '';
            document.getElementById('artista-status').value = obra.status || '';
            document.getElementById('artista-estado-obra').value = obra.estado_obra || '';
            document.getElementById('artista-ancho').value = obra.ancho || '';
            document.getElementById('artista-alto').value = obra.alto || '';
            document.getElementById('artista-peso').value = obra.peso || '';
            document.getElementById('artista-marcos').value = obra.marcos || '';
            document.getElementById('artista-precio').value = obra.precio || '';
            document.getElementById('artista-certificado').value = obra.certificado || '';
            document.getElementById('artista-id').value = ''; // Dejar vacío
            document.getElementById('artista-procedencia').value = obra.procedencia || '';
            document.getElementById('artista-firma').value = obra.firma || '';
            document.getElementById('artista-soporte').value = obra.soporte || '';
            document.getElementById('artista-conservacion').value = obra.conservacion || '';
            document.getElementById('artista-etiquetas').value = obra.etiquetas || '';
            document.getElementById('artista-localizacion').value = obra.localizacion || '';
            // Limpiar imágenes
            for (let i = 0; i < 5; i++) {
                const slot = document.getElementById(`artista-slot-${i}`);
                const img = slot.querySelector('.preview-img');
                if (img) {
                    img.src = '';
                    img.classList.add('hidden');
                }
                slot.classList.remove('has-image');
            }
            document.getElementById('btn-artista-save').style.display = 'block';
            document.getElementById('btn-artista-update').style.display = 'none';
            document.getElementById('artist-dashboard').scrollTo({ top: 0, behavior: 'smooth' });
        })
        .catch(err => console.error("Error al duplicar obra:", err));
    };

    // --- ELIMINAR OBRA ---
    window.eliminarObraArtista = async function(id) {
        if (!confirm("¿Estás seguro de eliminar esta obra permanentemente?")) return;
        if (!artistaToken) return;
        try {
            const response = await fetch(`https://backend-fundacion-atpe.onrender.com/obras/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${artistaToken}` }
            });
            if (response.ok) {
                alert("Obra eliminada.");
                cargarMisObras();
                cargarGaleria();
                resetFormularioArtista();
            } else {
                alert("No se pudo eliminar.");
            }
        } catch (error) {
            alert("Error de conexión.");
        }
    };

    // --- RESETEAR FORMULARIO ---
    function resetFormularioArtista() {
        const form = document.getElementById('artista-artwork-form');
        if (form) form.reset();
        window.editingId = null;
        for (let i = 0; i < 5; i++) {
            const input = document.getElementById(`artista-imagen-${i}`);
            if (input) input.value = "";
            const slot = document.getElementById(`artista-slot-${i}`);
            if (slot) {
                slot.classList.remove('has-image');
                const img = slot.querySelector('.preview-img');
                if (img) {
                    img.src = "";
                    img.classList.add('hidden');
                }
            }
        }
        const nameDisplay = document.getElementById('artista-file-names-display');
        if (nameDisplay) nameDisplay.textContent = "";
        document.getElementById('btn-artista-save').style.display = 'block';
        document.getElementById('btn-artista-update').style.display = 'none';
        if (form) {
            const inputs = form.querySelectorAll('input, select, textarea');
            inputs.forEach(i => i.style.border = "none");
        }
    }

    // --- FUNCIONES DE IMÁGENES ---
    window.activarInput = function(slotIndex) {
        document.getElementById(`artista-imagen-${slotIndex}`).click();
    };
    window.previewImage = function(event, slotIndex) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        const slot = document.getElementById(`artista-slot-${slotIndex}`);
        const imgPreview = slot.querySelector('.preview-img');
        reader.onload = function (e) {
            imgPreview.src = e.target.result;
            imgPreview.classList.remove('hidden');
            slot.classList.add('has-image');
            actualizarNombresArchivos();
        };
        reader.readAsDataURL(file);
    };
    function actualizarNombresArchivos() {
        const display = document.getElementById('artista-file-names-display');
        let archivos = [];
        for (let i = 0; i < 5; i++) {
            const input = document.getElementById(`artista-imagen-${i}`);
            if (input && input.files[0]) {
                archivos.push(input.files[0].name);
            }
        }
        if (archivos.length > 0) {
            display.textContent = `Archivos (${archivos.length}/5): ${archivos.join(', ')}`;
            display.style.color = "#2ecc71";
        } else {
            display.textContent = '';
        }
    }

    function actualizarInterfazArtista() {
        const perfilIcon = document.querySelector('#perfil-btn i');
        if (artistaToken && artistaActual) {
            perfilIcon.className = "fa-solid fa-user-check";
            perfilIcon.style.color = "#2ecc71";
            document.querySelector('#perfil-btn').title = "Panel de " + artistaActual.nombre_artista;
        } else {
            perfilIcon.className = "fa-solid fa-user";
            perfilIcon.style.color = "";
            document.querySelector('#perfil-btn').title = "Iniciar sesión como Artista";
        }
    }

    llenarListaPaises();
    if (artistaToken && artistaActual) {
        irAlPanelDeArtista();
    }
});

// ==========================================
// FUNCIONES GLOBALES (GALERÍA, MODAL, PAÍSES)
// ==========================================

const paises = [
    { code: 'AF', name: 'Afganistán' },
    { code: 'AL', name: 'Albania' },
    { code: 'DE', name: 'Alemania' },
    { code: 'AD', name: 'Andorra' },
    { code: 'AO', name: 'Angola' },
    { code: 'AG', name: 'Antigua y Barbuda' },
    { code: 'SA', name: 'Arabia Saudita' },
    { code: 'DZ', name: 'Argelia' },
    { code: 'AR', name: 'Argentina' },
    { code: 'AM', name: 'Armenia' },
    { code: 'AU', name: 'Australia' },
    { code: 'AT', name: 'Austria' },
    { code: 'AZ', name: 'Azerbaiyán' },
    { code: 'BS', name: 'Bahamas' },
    { code: 'BD', name: 'Bangladés' },
    { code: 'BB', name: 'Barbados' },
    { code: 'BH', name: 'Baréin' },
    { code: 'BE', name: 'Bélgica' },
    { code: 'BZ', name: 'Belice' },
    { code: 'BJ', name: 'Benín' },
    { code: 'BY', name: 'Bielorrusia' },
    { code: 'BO', name: 'Bolivia' },
    { code: 'BA', name: 'Bosnia y Herzegovina' },
    { code: 'BW', name: 'Botsuana' },
    { code: 'BR', name: 'Brasil' },
    { code: 'BN', name: 'Brunéi' },
    { code: 'BG', name: 'Bulgaria' },
    { code: 'BF', name: 'Burkina Faso' },
    { code: 'BI', name: 'Burundi' },
    { code: 'BT', name: 'Bután' },
    { code: 'CV', name: 'Cabo Verde' },
    { code: 'KH', name: 'Camboya' },
    { code: 'CM', name: 'Camerún' },
    { code: 'CA', name: 'Canadá' },
    { code: 'QA', name: 'Catar' },
    { code: 'TD', name: 'Chad' },
    { code: 'CL', name: 'Chile' },
    { code: 'CN', name: 'China' },
    { code: 'CY', name: 'Chipre' },
    { code: 'CO', name: 'Colombia' },
    { code: 'KM', name: 'Comoras' },
    { code: 'KP', name: 'Corea del Norte' },
    { code: 'KR', name: 'Corea del Sur' },
    { code: 'CI', name: 'Costa de Marfil' },
    { code: 'CR', name: 'Costa Rica' },
    { code: 'HR', name: 'Croacia' },
    { code: 'CU', name: 'Cuba' },
    { code: 'DK', name: 'Dinamarca' },
    { code: 'DM', name: 'Dominica' },
    { code: 'EC', name: 'Ecuador' },
    { code: 'EG', name: 'Egipto' },
    { code: 'SV', name: 'El Salvador' },
    { code: 'AE', name: 'Emiratos Árabes Unidos' },
    { code: 'ER', name: 'Eritrea' },
    { code: 'SK', name: 'Eslovaquia' },
    { code: 'SI', name: 'Eslovenia' },
    { code: 'ES', name: 'España' },
    { code: 'US', name: 'Estados Unidos' },
    { code: 'EE', name: 'Estonia' },
    { code: 'ET', name: 'Etiopía' },
    { code: 'PH', name: 'Filipinas' },
    { code: 'FI', name: 'Finlandia' },
    { code: 'FJ', name: 'Fiyi' },
    { code: 'FR', name: 'Francia' },
    { code: 'GA', name: 'Gabón' },
    { code: 'GM', name: 'Gambia' },
    { code: 'GE', name: 'Georgia' },
    { code: 'GH', name: 'Ghana' },
    { code: 'GD', name: 'Granada' },
    { code: 'GR', name: 'Grecia' },
    { code: 'GT', name: 'Guatemala' },
    { code: 'GN', name: 'Guinea' },
    { code: 'GQ', name: 'Guinea Ecuatorial' },
    { code: 'GW', name: 'Guinea-Bisáu' },
    { code: 'GY', name: 'Guyana' },
    { code: 'HT', name: 'Haití' },
    { code: 'HN', name: 'Honduras' },
    { code: 'HU', name: 'Hungría' },
    { code: 'IN', name: 'India' },
    { code: 'ID', name: 'Indonesia' },
    { code: 'IQ', name: 'Irak' },
    { code: 'IR', name: 'Irán' },
    { code: 'IE', name: 'Irlanda' },
    { code: 'IS', name: 'Islandia' },
    { code: 'IL', name: 'Israel' },
    { code: 'IT', name: 'Italia' },
    { code: 'JM', name: 'Jamaica' },
    { code: 'JP', name: 'Japón' },
    { code: 'JO', name: 'Jordania' },
    { code: 'KZ', name: 'Kazajistán' },
    { code: 'KE', name: 'Kenia' },
    { code: 'KG', name: 'Kirguistán' },
    { code: 'KI', name: 'Kiribati' },
    { code: 'KW', name: 'Kuwait' },
    { code: 'LA', name: 'Laos' },
    { code: 'LS', name: 'Lesoto' },
    { code: 'LV', name: 'Letonia' },
    { code: 'LB', name: 'Líbano' },
    { code: 'LR', name: 'Liberia' },
    { code: 'LY', name: 'Libia' },
    { code: 'LI', name: 'Liechtenstein' },
    { code: 'LT', name: 'Lituania' },
    { code: 'LU', name: 'Luxemburgo' },
    { code: 'MK', name: 'Macedonia del Norte' },
    { code: 'MG', name: 'Madagascar' },
    { code: 'MY', name: 'Malasia' },
    { code: 'MW', name: 'Malaui' },
    { code: 'MV', name: 'Maldivas' },
    { code: 'ML', name: 'Malí' },
    { code: 'MT', name: 'Malta' },
    { code: 'MA', name: 'Marruecos' },
    { code: 'MU', name: 'Mauricio' },
    { code: 'MR', name: 'Mauritania' },
    { code: 'MX', name: 'México' },
    { code: 'FM', name: 'Micronesia' },
    { code: 'MD', name: 'Moldavia' },
    { code: 'MC', name: 'Mónaco' },
    { code: 'MN', name: 'Mongolia' },
    { code: 'ME', name: 'Montenegro' },
    { code: 'MZ', name: 'Mozambique' },
    { code: 'MM', name: 'Birmania (Myanmar)' },
    { code: 'NA', name: 'Namibia' },
    { code: 'NR', name: 'Nauru' },
    { code: 'NP', name: 'Nepal' },
    { code: 'NI', name: 'Nicaragua' },
    { code: 'NE', name: 'Níger' },
    { code: 'NG', name: 'Nigeria' },
    { code: 'NO', name: 'Noruega' },
    { code: 'NZ', name: 'Nueva Zelanda' },
    { code: 'OM', name: 'Omán' },
    { code: 'NL', name: 'Países Bajos' },
    { code: 'PK', name: 'Pakistán' },
    { code: 'PW', name: 'Palaos' },
    { code: 'PA', name: 'Panamá' },
    { code: 'PG', name: 'Papúa Nueva Guinea' },
    { code: 'PY', name: 'Paraguay' },
    { code: 'PE', name: 'Perú' },
    { code: 'PL', name: 'Polonia' },
    { code: 'PT', name: 'Portugal' },
    { code: 'GB', name: 'Reino Unido' },
    { code: 'CF', name: 'República Centroafricana' },
    { code: 'CZ', name: 'República Checa' },
    { code: 'CG', name: 'República del Congo' },
    { code: 'CD', name: 'República Democrática del Congo' },
    { code: 'DO', name: 'República Dominicana' },
    { code: 'RW', name: 'Ruanda' },
    { code: 'RO', name: 'Rumania' },
    { code: 'RU', name: 'Rusia' },
    { code: 'WS', name: 'Samoa' },
    { code: 'LC', name: 'Santa Lucía' },
    { code: 'VC', name: 'San Vicente y las Granadinas' },
    { code: 'KN', name: 'San Cristóbal y Nieves' },
    { code: 'SM', name: 'San Marino' },
    { code: 'ST', name: 'Santo Tomé y Príncipe' },
    { code: 'SN', name: 'Senegal' },
    { code: 'RS', name: 'Serbia' },
    { code: 'SC', name: 'Seychelles' },
    { code: 'SL', name: 'Sierra Leona' },
    { code: 'SG', name: 'Singapur' },
    { code: 'SY', name: 'Siria' },
    { code: 'SO', name: 'Somalia' },
    { code: 'LK', name: 'Sri Lanka' },
    { code: 'SZ', name: 'Suazilandia (Eswatini)' },
    { code: 'ZA', name: 'Sudáfrica' },
    { code: 'SD', name: 'Sudán' },
    { code: 'SS', name: 'Sudán del Sur' },
    { code: 'SE', name: 'Suecia' },
    { code: 'CH', name: 'Suiza' },
    { code: 'SR', name: 'Surinam' },
    { code: 'TH', name: 'Tailandia' },
    { code: 'TZ', name: 'Tanzania' },
    { code: 'TJ', name: 'Tayikistán' },
    { code: 'TL', name: 'Timor Oriental' },
    { code: 'TG', name: 'Togo' },
    { code: 'TO', name: 'Tonga' },
    { code: 'TT', name: 'Trinidad y Tobago' },
    { code: 'TN', name: 'Túnez' },
    { code: 'TM', name: 'Turkmenistán' },
    { code: 'TR', name: 'Turquía' },
    { code: 'TV', name: 'Tuvalu' },
    { code: 'UA', name: 'Ucrania' },
    { code: 'UG', name: 'Uganda' },
    { code: 'UY', name: 'Uruguay' },
    { code: 'UZ', name: 'Uzbekistán' },
    { code: 'VU', name: 'Vanuatu' },
    { code: 'VE', name: 'Venezuela' },
    { code: 'VN', name: 'Vietnam' },
    { code: 'YE', name: 'Yemen' },
    { code: 'DJ', name: 'Yibuti' },
    { code: 'ZM', name: 'Zambia' },
    { code: 'ZW', name: 'Zimbabue' }
];

function llenarListaPaises() {
    const select = document.getElementById('artista-localizacion');
    if (!select) return;
    while (select.options.length > 1) {
        select.remove(1);
    }
    paises.forEach(pais => {
        const option = document.createElement('option');
        option.value = pais.code;
        option.textContent = pais.name;
        select.appendChild(option);
    });
}

// --- GALERÍA PÚBLICA ---
async function cargarGaleria() {
    const container = document.getElementById('galeria-container');
    try {
        const response = await fetch('https://backend-fundacion-atpe.onrender.com/obras');
        const obras = await response.json();
        window.obrasData = obras;
        const obrasActivas = obras.filter(obra => obra.status === 'Activo' && obra.imagen_url);
        mostrarGaleria(obrasActivas);
    } catch (error) {
        console.error("Error cargando galería:", error);
        container.innerHTML = '<div class="error">Error al cargar la galería.</div>';
    }
}

function mostrarGaleria(obras) {
    const container = document.getElementById('galeria-container');
    const sinResultados = document.querySelector('.sin-resultados');
    if (!obras || obras.length === 0) {
        container.innerHTML = '';
        sinResultados.classList.remove('hidden');
        return;
    }
    sinResultados.classList.add('hidden');

    container.innerHTML = obras.map(obra => {
        let imagenes = [];
        if (obra.todas_imagenes && Array.isArray(obra.todas_imagenes)) {
            imagenes = obra.todas_imagenes.filter(img => img && img.trim() !== '');
        }
        if (imagenes.length === 0 && obra.imagen_url) {
            imagenes = [obra.imagen_url];
        }
        if (imagenes.length === 0) {
            imagenes = ['https://placehold.co/400x400?text=Sin+Imagen'];
        }
        const imagenesCompletas = imagenes.map(imgUrl => 
            imgUrl.startsWith('http') ? imgUrl : `https://backend-fundacion-atpe.onrender.com${imgUrl}`
        );
        const mostrarControles = imagenesCompletas.length > 1;
        const indicadoresHTML = imagenesCompletas.map((_, i) => 
            `<span class="mini-indicator ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`
        ).join('');
        const dimensiones = `${obra.ancho || 'S/N'} × ${obra.alto || 'S/N'}`;
        const tecnica = obra.descripcion_tecnica || 'Técnica no especificada';
        const precio = obra.precio ? `$${parseInt(obra.precio).toLocaleString()}` : 'Consultar';

        return `
            <div class="obra-card" data-id="${obra.id}" data-precio="${obra.precio || 0}" data-tecnica="${obra.descripcion_tecnica || ''}">
                <div class="obra-imagen">
                    <div class="mini-carousel">
                        <div class="mini-carousel-track" data-id="${obra.id}">
                            ${imagenesCompletas.map((url, i) => `
                                <div class="mini-slide ${i === 0 ? 'active' : ''}" data-index="${i}">
                                    <img src="${url}" alt="${obra.titulo}" onerror="this.onerror=null; this.src='https://placehold.co/400x400?text=Error'">
                                </div>
                            `).join('')}
                        </div>
                        ${mostrarControles ? `
                            <button class="mini-carousel-btn prev" onclick="cambiarImagenGaleria(this, -1)"><i class="fa-solid fa-chevron-left"></i></button>
                            <button class="mini-carousel-btn next" onclick="cambiarImagenGaleria(this, 1)"><i class="fa-solid fa-chevron-right"></i></button>
                        ` : ''}
                        <div class="mini-indicators">${indicadoresHTML}</div>
                        <span class="obra-badge" style="display:none;">${obra.certificado === 'Si' ? 'Certificada ✓' : 'Original'}</span>
                    </div>
                </div>
                <div class="obra-info">
                    <h3 class="obra-titulo">${obra.titulo}</h3>
                    <p class="obra-artista">${obra.artista}</p>
                    <div class="obra-detalles">
                        <div class="detalle-item"><span class="detalle-label">Dimensiones:</span><span class="detalle-valor">${dimensiones}</span></div>
                        <div class="detalle-item"><span class="detalle-label">Técnica:</span><span class="detalle-valor">${tecnica}</span></div>
                    </div>
                    <div class="obra-precio">
                        <div class="precio-monto">${precio}</div>
                        <div class="precio-etiqueta">${obra.estado_obra === 'Disponible' ? 'Disponible para venta' : obra.estado_obra || 'Consultar'}</div>
                    </div>
                    <button class="btn-ver-detalle" onclick="verDetalleObra(${obra.id})"><i class="fa-solid fa-eye"></i> Ver detalles</button>
                </div>
            </div>
        `;
    }).join('');
}

// --- MODAL DE DETALLES ---
async function verDetalleObra(id) {
    if (!window.obrasData || window.obrasData.length === 0) {
        try {
            const response = await fetch('https://backend-fundacion-atpe.onrender.com/obras');
            window.obrasData = await response.json();
        } catch (error) {
            alert("Error al cargar los detalles.");
            return;
        }
    }
    const obra = window.obrasData.find(o => o.id === id);
    if (!obra) return;
    const modal = document.getElementById('obra-modal');
    const modalBody = document.querySelector('.modal-body');

    let imagenes = [];
    if (obra.todas_imagenes && Array.isArray(obra.todas_imagenes)) {
        imagenes = obra.todas_imagenes.filter(img => img && img.trim() !== '');
    }
    if (imagenes.length === 0 && obra.imagen_url) {
        imagenes = [obra.imagen_url];
    }
    if (imagenes.length === 0) {
        imagenes = ['https://placehold.co/600x400?text=Sin+Imagen'];
    }

    let carouselHTML = `
        <div class="image-carousel">
            <div class="carousel-container" id="carousel-container">
    `;
    imagenes.forEach((imgUrl) => {
        const urlFinal = imgUrl.startsWith('http') ? imgUrl : `https://backend-fundacion-atpe.onrender.com${imgUrl}`;
        carouselHTML += `<div class="carousel-slide"><img src="${urlFinal}" alt="Imagen de ${obra.titulo}" onerror="this.onerror=null; this.src='https://placehold.co/600x400?text=Imagen+no+disponible'"></div>`;
    });
    carouselHTML += `
            </div>
            <button class="carousel-btn prev" onclick="moverCarrusel(-1)"><i class="fa-solid fa-chevron-left"></i></button>
            <button class="carousel-btn next" onclick="moverCarrusel(1)"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
    `;

    let thumbnailsHTML = `
        <div class="carousel-thumbnails" id="carousel-thumbnails">
            ${imagenes.map((imgUrl, i) => {
                const urlFinal = imgUrl.startsWith('http') ? imgUrl : `https://backend-fundacion-atpe.onrender.com${imgUrl}`;
                return `<img src="${urlFinal}" class="thumbnail-img ${i === 0 ? 'active' : ''}" onclick="irAImagen(${i})" onerror="this.src='https://placehold.co/80x80'">`;
            }).join('')}
        </div>
    `;

    const dimensiones = `${obra.ancho || 'S/N'} × ${obra.alto || 'S/N'}`;
    let localizacionTexto = obra.localizacion || 'No especificada';
    let localizacionHTML = '';
    if (localizacionTexto.length === 2 && localizacionTexto !== 'No especificada') {
        const codigoPais = localizacionTexto.toLowerCase();
        localizacionHTML = `
            <div style="display: flex; align-items: center; gap: 5px; justify-content: flex-start;">
                <img src="https://flagcdn.com/16x12/${codigoPais}.png" alt="Bandera ${localizacionTexto}" style="border-radius: 2px; display: inline-block;">
                <span>${localizacionTexto.toUpperCase()}</span>
            </div>
        `;
    } else {
        localizacionHTML = localizacionTexto;
    }

    const infoHTML = `
        <h2 class="modal-titulo">${obra.titulo}</h2>
        <p class="modal-artista">${obra.artista} (${obra.ano || 'N/A'})</p>
        <div class="modal-descripcion">${obra.descripcion_artistica || 'Sin descripción disponible.'}</div>
        <div class="modal-detalles">
            <div class="modal-detalle"><span class="modal-detalle-label">Dimensiones</span><span class="modal-detalle-valor">${dimensiones}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Peso</span><span class="modal-detalle-valor">${obra.peso || 'S/N'}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Técnica</span><span class="modal-detalle-valor">${obra.descripcion_tecnica || 'No especificada'}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Soporte</span><span class="modal-detalle-valor">${obra.soporte || 'No especificado'}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Enmarcado</span><span class="modal-detalle-valor">${obra.marcos || 'No especificado'}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Firma</span><span class="modal-detalle-valor">${obra.firma || 'No especificada'}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Estado</span><span class="modal-detalle-valor">${obra.estado_obra || 'N/A'}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Certificado</span><span class="modal-detalle-valor">${obra.certificado === 'Si' ? 'Sí ✓' : 'No'}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Procedencia</span><span class="modal-detalle-valor">${obra.procedencia || 'No especificada'}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Conservación</span><span class="modal-detalle-valor">${obra.conservacion || 'No especificado'}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Localización</span><span class="modal-detalle-valor">${localizacionHTML}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Etiquetas</span><span class="modal-detalle-valor">${obra.etiquetas || 'Sin etiquetas'}</span></div>
        </div>
        <div class="modal-precio">
            <div class="precio-monto-modal">${obra.precio ? `$${parseInt(obra.precio).toLocaleString()}` : 'Consultar'}</div>
            <div class="precio-estado-modal">${obra.estado_obra === 'Disponible' ? 'Disponible para compra' : obra.estado_obra || 'Estado no disponible'}</div>
        </div>
        ${obra.estado_obra === 'Disponible' ? `<button class="btn-ver-detalle" style="background: #2ecc71; margin-top: 20px; width: 100%;" onclick="agregarAlCarrito(${id})"><i class="fa-solid fa-cart-plus"></i> Agregar al carrito</button>` : ''}
    `;

    modalBody.innerHTML = `
        <div class="modal-left-column">
            ${carouselHTML}
            ${thumbnailsHTML}
        </div>
        <div class="modal-info">
            ${infoHTML}
        </div>
    `;
    window.currentSlide = 0;
    const container = document.getElementById('carousel-container');
    if (container) container.style.transform = 'translateX(0)';
    modal.classList.remove('hidden');
}

// --- CARRUSEL ---
function moverCarrusel(direction) {
    const container = document.getElementById('carousel-container');
    if (!container) return;
    const slides = container.children;
    const totalSlides = slides.length;
    window.currentSlide = (window.currentSlide + direction + totalSlides) % totalSlides;
    container.style.transform = `translateX(-${window.currentSlide * 100}%)`;
    actualizarMiniaturas();
}

function irAImagen(index) {
    const container = document.getElementById('carousel-container');
    if (!container) return;
    window.currentSlide = index;
    container.style.transform = `translateX(-${index * 100}%)`;
    actualizarMiniaturas();
}

function actualizarMiniaturas() {
    const thumbnails = document.querySelectorAll('.thumbnail-img');
    thumbnails.forEach((thumb, i) => {
        thumb.classList.toggle('active', i === window.currentSlide);
    });
}

function cambiarImagenGaleria(btn, direction) {
    const carousel = btn.closest('.mini-carousel');
    if (!carousel) return;
    const track = carousel.querySelector('.mini-carousel-track');
    if (!track) return;
    const slides = track.querySelectorAll('.mini-slide');
    if (slides.length <= 1) return;
    let currentIndex = 0;
    slides.forEach((slide, index) => {
        if (slide.classList.contains('active')) currentIndex = index;
    });
    let newIndex = (currentIndex + direction + slides.length) % slides.length;
    slides.forEach((slide, index) => {
        slide.classList.toggle('active', index === newIndex);
    });
    const indicators = carousel.querySelectorAll('.mini-indicator');
    indicators.forEach((ind, index) => {
        ind.classList.toggle('active', index === newIndex);
    });
}

function agregarAlCarrito(id) {
    const cartBadge = document.querySelector('.cart-badge');
    let count = parseInt(cartBadge.textContent) || 0;
    cartBadge.textContent = count + 1;
    alert("Obra agregada al carrito");
}