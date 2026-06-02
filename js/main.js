// js/main.js
import { token, artistaActual } from './auth.js';
import { btnPerfil } from './dom-globals.js';
import { poblarCiudades } from './utils.js';
import { fetchActiveSessionsCount } from './session-manager.js';
import { mostrarPaginaBlanca } from './views.js';
import { setupImagePreviews } from './image-previews.js';
import { cargarSelectoresFecha, verificarSesionBackend } from './init-helpers.js';
import { setupEvents } from './event-listeners.js';

async function init() {
    const sesionValida = await verificarSesionBackend();
    if (sesionValida) {
        btnPerfil.classList.add('hidden');
        document.getElementById('toggle-panel').classList.remove('hidden');
        mostrarPaginaBlanca();
        document.getElementById('modal-login').classList.add('hidden');
        document.getElementById('modal-login').classList.remove('modal-fullscreen');
        document.getElementById('modal-registro').classList.add('hidden');
        document.getElementById('modal-registro').classList.remove('modal-fullscreen');
        setupEvents();
        setupImagePreviews();
        cargarSelectoresFecha();
        poblarCiudades('');
        await fetchActiveSessionsCount();
    } else {
        document.getElementById('panel-artista').classList.add('hidden');
        document.getElementById('galeria-publica').classList.add('hidden');
        document.getElementById('toggle-panel').classList.add('hidden');
        btnPerfil.classList.add('hidden');
        const modalLogin = document.getElementById('modal-login');
        modalLogin.classList.remove('hidden');
        modalLogin.classList.add('modal-fullscreen');
        document.getElementById('modal-registro').classList.add('hidden');
        document.getElementById('modal-registro').classList.remove('modal-fullscreen');
        setupEvents();
        setupImagePreviews();
        cargarSelectoresFecha();
        poblarCiudades('');
    }
}

init();