// js/main.js
import { API_BASE_URL } from './config.js';
import { token, artistaActual, login, register, logout } from './auth.js';
import { cargarGaleria, mostrarGaleria } from './galeria.js';
import { cargarMisObras, renderizarTabla, guardarObra, eliminarObra, editarObra } from './panel.js';

// ============================================
// ELEMENTOS DEL DOM (GLOBALES)
// ============================================
const mainContent = document.querySelector('main');
const galeriaContainer = document.getElementById('galeria-container');
const panelArtista = document.getElementById('panel-artista');
const tablaBody = document.getElementById('tabla-obras-body');
const obraForm = document.getElementById('artista-artwork-form');
const btnLogout = document.getElementById('btn-logout');
const btnPerfil = document.getElementById('btn-perfil');
const btnSave = document.getElementById('btn-artista-save');
const btnUpdate = document.getElementById('btn-artista-update');
const btnClear = document.getElementById('btn-artista-clear');

// ============================================
// INICIALIZACIÓN DE LA APLICACIÓN
// ============================================

async function init() {
    if (token && artistaActual) {
        await mostrarPanelArtista();
    } else {
        const obras = await cargarGaleria(galeriaContainer);
        mostrarGaleria(obras, galeriaContainer, (id) => {
            console.log("Ver detalles de obra con ID:", id);
        });
    }
    llenarListaPaises(); // 🔥 Esto carga la lista de países al iniciar
    if (token && artistaActual) {
        await mostrarPanelArtista();
    } else {
        const obras = await cargarGaleria(galeriaContainer);
        mostrarGaleria(obras, galeriaContainer, (id) => {
            console.log("Ver detalles de obra con ID:", id);
        });
    }
    setupEvents();
}

// 4. Eventos (Login, Logout, Cambio de secciones)
function setupEvents() {
    btnPerfil.addEventListener('click', () => {
        if (token) {
            mostrarPanelArtista();
        } else {
            document.getElementById('modal-login').classList.remove('hidden');
        }
    });

    btnLogout.addEventListener('click', () => {
        logout();
        ocultarPanelArtista();
        location.reload();
    });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-pass').value;
        const result = await login(email, password);
        if (result.success) {
            document.getElementById('modal-login').classList.add('hidden');
            await mostrarPanelArtista();
        } else {
            alert("Error: " + result.error);
        }
    });

    document.getElementById('registro-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre_artista = document.getElementById('reg-nombre-artista').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-pass').value;
        const result = await register(nombre_artista, email, password);
        if (result.success) {
            alert("Registro exitoso. Inicia sesión.");
            document.getElementById('modal-registro').classList.add('hidden');
            document.getElementById('modal-login').classList.remove('hidden');
        } else {
            alert("Error: " + result.error);
        }
    });

    // --- EVENTOS DEL FORMULARIO DE OBRA ---
    
    // Guardar Obra
    obraForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(obraForm);
        const idEdicion = document.getElementById('input-id-edicion').value;
        
        // Agregar imágenes si las hay
        for (let i = 0; i < 5; i++) {
            const inputFile = document.getElementById(`artista-imagen-${i}`);
            if (inputFile && inputFile.files[0]) {
                formData.append(`imagen_${i}`, inputFile.files[0]);
            }
        }

        const result = await guardarObra(token, formData, idEdicion || null);
        if (result.success) {
            alert("Obra guardada correctamente.");
            resetFormularioArtista();
            await refrescarTabla();
        } else {
            alert("Error: " + result.error);
        }
    });

    // Botón Refrescar (Actualizar)
    btnUpdate.addEventListener('click', async (e) => {
        e.preventDefault();
        const idEdicion = document.getElementById('input-id-edicion').value;
        if (!idEdicion) return;

        const formData = new FormData(obraForm);
        for (let i = 0; i < 5; i++) {
            const inputFile = document.getElementById(`artista-imagen-${i}`);
            if (inputFile && inputFile.files[0]) {
                formData.append(`imagen_${i}`, inputFile.files[0]);
            }
        }

        const result = await guardarObra(token, formData, idEdicion);
        if (result.success) {
            alert("Obra actualizada correctamente.");
            resetFormularioArtista();
            await refrescarTabla();
        } else {
            alert("Error al actualizar: " + result.error);
        }
    });

    // Botón Limpiar
    btnClear.addEventListener('click', (e) => {
        e.preventDefault();
        resetFormularioArtista();
    });
}

// ============================================
// FUNCIONES DE NAVEGACIÓN Y RENDERIZADO
// ============================================

async function mostrarPanelArtista() {
    document.getElementById('galeria-publica').classList.add('hidden');
    panelArtista.classList.remove('hidden');
    btnLogout.classList.remove('hidden');
    btnPerfil.textContent = '👤 Artista';
    await refrescarTabla();
}

function ocultarPanelArtista() {
    document.getElementById('galeria-publica').classList.remove('hidden');
    panelArtista.classList.add('hidden');
    btnLogout.classList.add('hidden');
    btnPerfil.textContent = '👤';
}

async function refrescarTabla() {
    const obras = await cargarMisObras(token);
    renderizarTabla(obras, tablaBody, (id) => {
        // Lógica para cargar datos al formulario cuando se edita una obra
        editarObra(token, id, (obra) => {
            // Llenar el formulario con los datos de la obra
            llenarFormulario(obra);
            // Cambiar botones
            btnSave.style.display = 'none';
            btnUpdate.style.display = 'block';
            document.getElementById('input-id-edicion').value = obra.id;
        });
    }, async (id) => {
        const exito = await eliminarObra(token, id);
        if (exito) {
            await refrescarTabla();
        } else {
            alert("Error al eliminar la obra.");
        }
    });
}

function llenarFormulario(obra) {
    if (!obra) return;

    function setValue(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.value = value || '';
        } else {
            console.warn(`Elemento con ID '${id}' no encontrado.`);
        }
    }

    setValue('artista-titulo', obra.titulo);
    setValue('artista-artista', obra.artista);
    setValue('artista-ano', obra.ano);
    setValue('artista-tec-desc', obra.descripcion_tecnica);
    setValue('artista-art-desc', obra.descripcion_artistica);
    setValue('artista-status', obra.status);
    setValue('artista-estado-obra', obra.estado_obra);
    setValue('artista-ancho', obra.ancho);
    setValue('artista-alto', obra.alto);
    setValue('artista-peso', obra.peso);
    setValue('artista-marcos', obra.marcos);
    setValue('artista-precio', obra.precio);
    setValue('artista-certificado', obra.certificado);
    setValue('artista-id', obra.id_personalizado);
    setValue('artista-procedencia', obra.procedencia);
    setValue('artista-firma', obra.firma);
    setValue('artista-soporte', obra.soporte);
    setValue('artista-conservacion', obra.conservacion);
    setValue('artista-etiquetas', obra.etiquetas);
    setValue('artista-localizacion', obra.localizacion);

    // Cargar imágenes
    const imagenes = obra.todas_imagenes || [];
    for (let i = 0; i < 5; i++) {
        const slot = document.getElementById(`artista-slot-${i}`);
        const imgPreview = slot ? slot.querySelector('.preview-img') : null;
        if (imagenes[i] && imgPreview) {
            imgPreview.src = imagenes[i];
            imgPreview.classList.remove('hidden');
            slot.classList.add('has-image');
        } else if (imgPreview) {
            imgPreview.src = '';
            imgPreview.classList.add('hidden');
            if (slot) slot.classList.remove('has-image');
        }
    }
}

function resetFormularioArtista() {
    const form = document.getElementById('artista-artwork-form');
    if (form) form.reset();
    document.getElementById('input-id-edicion').value = '';
    btnSave.style.display = 'block';
    btnUpdate.style.display = 'none';
    for (let i = 0; i < 5; i++) {
        const slot = document.getElementById(`artista-slot-${i}`);
        const img = slot.querySelector('.preview-img');
        if (img) {
            img.src = '';
            img.classList.add('hidden');
        }
        slot.classList.remove('has-image');
    }
    document.getElementById('artista-file-names-display').textContent = '';
}

// --- LISTA DE PAÍSES ---
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

// ============================================
// INICIALIZACIÓN
// ============================================
init();