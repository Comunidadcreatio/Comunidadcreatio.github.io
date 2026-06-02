// js/views.js
import { cargarGaleria, mostrarGaleria } from './galeria.js';
import { galeriaContainer, panelArtista, btnPerfil, currentPage, currentLimit, currentSearch, currentSortBy, currentOrder, totalObras, tablaBody, imagenesAEliminar } from './dom-globals.js';
import { token, artistaActual } from './auth.js';
import { cargarMisObras, renderizarTabla, eliminarObra, guardarObra } from './panel.js';
import { apiRequest } from './config.js';
import { mostrarErrores } from './utils.js';

export function mostrarPaginaBlanca() {
    const galeria = document.getElementById('galeria-publica');
    const panel = document.getElementById('panel-artista');
    const paginaBlanca = document.getElementById('pagina-blanca');
    if (galeria) galeria.classList.add('hidden');
    if (panel) panel.classList.add('hidden');
    if (paginaBlanca) paginaBlanca.classList.remove('hidden');
}

export function toggleGaleria() {
    const galeria = document.getElementById('galeria-publica');
    const panel = document.getElementById('panel-artista');
    const paginaBlanca = document.getElementById('pagina-blanca');
    if (galeria.classList.contains('hidden')) {
        galeria.classList.remove('hidden');
        panel.classList.add('hidden');
        paginaBlanca.classList.add('hidden');
        cargarGaleria(galeriaContainer).then(obras => {
            mostrarGaleria(obras, galeriaContainer, (id) => {
                console.log("Ver detalles de obra con ID:", id);
            });
        });
    } else {
        galeria.classList.add('hidden');
        paginaBlanca.classList.remove('hidden');
    }
}

export function togglePanel() {
    const galeria = document.getElementById('galeria-publica');
    const panel = document.getElementById('panel-artista');
    const paginaBlanca = document.getElementById('pagina-blanca');
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        galeria.classList.add('hidden');
        paginaBlanca.classList.add('hidden');
        refrescarTabla();
    } else {
        panel.classList.add('hidden');
        paginaBlanca.classList.remove('hidden');
    }
}

export async function refrescarTabla() {
    const result = await cargarMisObras(token, currentPage, currentLimit, currentSearch, currentSortBy, currentOrder);
    if (!result.success) {
        console.error("Error al cargar obras:", result.error);
        if (result.error && (result.error.includes("Sesión expirada") || result.error.includes("401"))) {
            alert("🔐 Tu sesión ha expirado. Serás redirigido a la página principal.");
            localStorage.removeItem('token');
            localStorage.removeItem('artista');
            window.location.href = '/';
            return;
        }
        mostrarErrores(result);
        return;
    }
    const obras = result.obras;
    totalObras = result.total; // reasigna variable exportada (mutable)
    const totalPages = Math.ceil(totalObras / currentLimit);
    document.getElementById('page-info').textContent = `Página ${currentPage} de ${totalPages || 1}`;
    document.getElementById('btn-prev').disabled = currentPage <= 1;
    document.getElementById('btn-next').disabled = currentPage >= totalPages;
    renderizarTabla(obras, tablaBody,
        async (id) => {
            try {
                const data = await apiRequest(`/obras/${id}`);
                if (!data) return;
                if (data.success === false) {
                    console.error('Error al obtener obra:', data.error);
                    alert('Error al cargar la obra: ' + data.error);
                    return;
                }
                const obra = data;
                document.getElementById('input-id-edicion').value = obra.id;
                document.getElementById('input-titulo').value = obra.titulo;
                document.getElementById('input-artista').value = obra.artista;
                document.getElementById('input-precio').value = obra.precio;
                document.getElementById('input-id-personalizado').value = obra.id_personalizado;
                document.getElementById('input-ano').value = obra.ano || '';
                document.getElementById('input-descripcion-tecnica').value = obra.descripcion_tecnica || '';
                document.getElementById('input-soporte').value = obra.soporte || '';
                document.getElementById('input-descripcion-artistica').value = obra.descripcion_artistica || '';
                document.getElementById('input-estado-obra').value = obra.estado_obra || '';
                document.getElementById('input-procedencia').value = obra.procedencia || '';
                document.getElementById('input-marcos').value = obra.marcos || '';
                document.getElementById('input-certificado').value = obra.certificado || '';
                document.getElementById('input-status').value = obra.status || '';
                document.getElementById('input-ancho').value = obra.ancho || '';
                document.getElementById('input-alto').value = obra.alto || '';
                document.getElementById('input-firma').value = obra.firma || '';
                document.getElementById('input-conservacion').value = obra.conservacion || '';
                document.getElementById('input-etiquetas').value = obra.etiquetas || '';
                document.getElementById('btn-guardar').textContent = 'Actualizar Obra';
                const imagenes = [
                    obra.imagen_url,
                    obra.imagen_url_1,
                    obra.imagen_url_2,
                    obra.imagen_url_3,
                    obra.imagen_url_4
                ];
                document.querySelectorAll('.btn-eliminar-imagen').forEach(btn => btn.remove());
                imagenes.forEach((url, index) => {
                    if (url) {
                        const preview = document.getElementById(`preview-${index}`);
                        const placeholder = document.getElementById(`placeholder-${index}`);
                        if (preview && placeholder) {
                            preview.src = url;
                            preview.style.display = 'block';
                            placeholder.style.display = 'none';
                            const recuadro = preview.closest('.recuadro-imagen') || preview.parentElement;
                            if (recuadro) {
                                const btnExistente = recuadro.querySelector('.btn-eliminar-imagen');
                                if (btnExistente) btnExistente.remove();
                                const btnEliminar = document.createElement('button');
                                btnEliminar.type = 'button';
                                btnEliminar.className = 'btn-eliminar-imagen';
                                btnEliminar.dataset.index = index;
                                btnEliminar.textContent = '✕';
                                btnEliminar.style.cssText = `
                                    position: absolute; top: 0; right: 0;
                                    background: #dc3545; color: white;
                                    border: none; border-radius: 50%;
                                    width: 24px; height: 24px;
                                    cursor: pointer; font-size: 14px;
                                    display: block; z-index: 10;
                                    line-height: 24px; text-align: center;
                                `;
                                recuadro.style.position = 'relative';
                                recuadro.appendChild(btnEliminar);
                                btnEliminar.addEventListener('click', function() {
                                    const idx = parseInt(this.dataset.index);
                                    const previewImg = document.getElementById(`preview-${idx}`);
                                    const placeholderSpan = document.getElementById(`placeholder-${idx}`);
                                    const inputFile = document.getElementById(`input-imagen-${idx}`);
                                    if (previewImg.src && previewImg.src !== '') {
                                        imagenesAEliminar.add(idx);
                                        previewImg.src = '';
                                        previewImg.style.display = 'none';
                                        placeholderSpan.style.display = 'block';
                                        inputFile.value = '';
                                        this.style.display = 'none';
                                    }
                                });
                            }
                        }
                    }
                });
                document.getElementById('btn-limpiar-campos').classList.remove('hidden');
                document.getElementById('formulario-obra').scrollIntoView({ behavior: 'smooth' });
            } catch (error) {
                console.error("Error al cargar datos de la obra:", error);
                alert("Error al cargar la obra para editar");
            }
        },
        async (id) => {
            const exito = await eliminarObra(token, id);
            if (exito) {
                await refrescarTabla();
            } else {
                alert("❌ Error al eliminar la obra.");
            }
        },
        async (id) => {
            try {
                const res = await apiRequest(`/obras/${id}`);
                if (!res) return;
                const obra = res;
                document.getElementById('input-id-edicion').value = '';
                document.getElementById('input-titulo').value = obra.titulo;
                document.getElementById('input-artista').value = obra.artista;
                document.getElementById('input-precio').value = obra.precio;
                document.getElementById('input-id-personalizado').value = '';
                document.getElementById('input-ano').value = obra.ano || '';
                document.getElementById('input-descripcion-tecnica').value = obra.descripcion_tecnica || '';
                document.getElementById('input-soporte').value = obra.soporte || '';
                document.getElementById('input-descripcion-artistica').value = obra.descripcion_artistica || '';
                document.getElementById('input-estado-obra').value = obra.estado_obra || '';
                document.getElementById('input-procedencia').value = obra.procedencia || '';
                document.getElementById('input-marcos').value = obra.marcos || '';
                document.getElementById('input-certificado').value = obra.certificado || '';
                document.getElementById('input-status').value = obra.status || '';
                document.getElementById('input-ancho').value = obra.ancho || '';
                document.getElementById('input-alto').value = obra.alto || '';
                document.getElementById('input-firma').value = obra.firma || '';
                document.getElementById('input-conservacion').value = obra.conservacion || '';
                document.getElementById('input-etiquetas').value = obra.etiquetas || '';
                for (let i = 0; i < 5; i++) {
                    const preview = document.getElementById(`preview-${i}`);
                    const placeholder = document.getElementById(`placeholder-${i}`);
                    if (preview && placeholder) {
                        preview.src = '';
                        preview.style.display = 'none';
                        placeholder.style.display = 'block';
                    }
                    document.getElementById(`input-imagen-${i}`).value = '';
                }
                document.getElementById('btn-guardar').textContent = 'Guardar Obra';
                document.getElementById('btn-limpiar-campos').classList.remove('hidden');
                document.getElementById('formulario-obra').scrollIntoView({ behavior: 'smooth' });
                document.getElementById('input-id-personalizado').focus();
            } catch (error) {
                console.error("Error al duplicar:", error);
                alert("Error al duplicar.");
            }
        }
    );
}

export async function mostrarPanelArtista() {
    document.getElementById('galeria-publica').classList.add('hidden');
    panelArtista.classList.remove('hidden');
    btnPerfil.textContent = '👤 Artista';
    if (artistaActual) {
        document.getElementById('input-artista').value = artistaActual.nombre_artista;
    }
    await refrescarTabla();
}

export function mostrarGaleriaPublica() {
    document.getElementById('panel-artista').classList.add('hidden');
    document.getElementById('galeria-publica').classList.remove('hidden');
    cargarGaleria(galeriaContainer).then(obras => {
        mostrarGaleria(obras, galeriaContainer, (id) => {
            console.log("Ver detalles de obra con ID:", id);
        });
    });
}