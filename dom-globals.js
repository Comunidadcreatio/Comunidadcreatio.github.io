// js/dom-globals.js
export const galeriaContainer = document.getElementById('galeria-container');
export const panelArtista = document.getElementById('panel-artista');
export const tablaBody = document.getElementById('tabla-obras-body');
export const obraForm = document.getElementById('obra-form');
export const btnPerfil = document.getElementById('btn-perfil');
export const imagenesAEliminar = new Set();

// Paginación y filtros
export let currentPage = 1;
export let currentLimit = 10;
export let currentSearch = '';
export let currentSortBy = 'id';
export let currentOrder = 'DESC';
export let totalObras = 0;

// Paneles flotantes
export let desktopLogoutModal = null;
export let desktopLogoutAllBtn = null;
export let desktopLogoutSingleBtn = null;
export let desktopMainMenu = null;
export let mobileMainMenu = null;
export let clickOutsideHandlerLogout = null;
export let clickOutsideHandlerMainMenu = null;
export let mobileOutsideClickListener = null;

// Sesiones activas
export let activeSessionsCount = 0;

// Ciudades
export const ciudadesPorPais = {
    'Venezuela': {
        'Táchira': ['San Cristóbal', 'San Antonio del Táchira', 'San Juan de Colón', 'Táriba', 'Rubio', 'La Fría', 'San Josecito', 'Palmira', 'Capacho Nuevo', 'Capacho Viejo', 'La Grita', 'Abejales', 'Lobatera', 'Michelena', 'Ureña', 'Cordero', 'Las Mesas', 'Santa Ana del Táchira', 'San Rafael del Piñal', 'San José de Bolívar', 'El Cobre', 'Coloncito', 'Delicias', 'La Tendida', 'San Judas Tadeo', 'Seboruco', 'San Simón', 'Queniquea', 'Pregonero']
    }
};