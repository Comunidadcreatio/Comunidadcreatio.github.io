// js/dom-globals.js
export const galeriaContainer = document.getElementById('galeria-container');
export const panelArtista = document.getElementById('panel-artista');
export const tablaBody = document.getElementById('tabla-obras-body');
export const obraForm = document.getElementById('obra-form');
export const btnPerfil = document.getElementById('btn-perfil');
export const imagenesAEliminar = new Set();

// Estado global mutable (paginación, paneles, sesiones...)
export const state = {
  currentPage: 1,
  currentLimit: 10,
  currentSearch: '',
  currentSortBy: 'id',
  currentOrder: 'DESC',
  totalObras: 0,

  desktopLogoutModal: null,
  desktopLogoutAllBtn: null,
  desktopLogoutSingleBtn: null,
  desktopMainMenu: null,
  mobileMainMenu: null,
  clickOutsideHandlerLogout: null,
  clickOutsideHandlerMainMenu: null,
  mobileOutsideClickListener: null,

  activeSessionsCount: 0
};

// Datos fijos
export const ciudadesPorPais = {
  'Venezuela': {
    'Táchira': ['San Cristóbal', 'San Antonio del Táchira', 'San Juan de Colón', 'Táriba', 'Rubio', 'La Fría', 'San Josecito', 'Palmira', 'Capacho Nuevo', 'Capacho Viejo', 'La Grita', 'Abejales', 'Lobatera', 'Michelena', 'Ureña', 'Cordero', 'Las Mesas', 'Santa Ana del Táchira', 'San Rafael del Piñal', 'San José de Bolívar', 'El Cobre', 'Coloncito', 'Delicias', 'La Tendida', 'San Judas Tadeo', 'Seboruco', 'San Simón', 'Queniquea', 'Pregonero']
  }
};