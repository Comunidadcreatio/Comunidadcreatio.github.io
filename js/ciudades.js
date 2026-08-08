// js/ciudades.js
// Lista canónica de ciudades/pueblos de Táchira y sus banderas.
// Script clásico (no módulo): expone window.CIUDADES_POR_PAIS y
// window.BANDERA_POR_CIUDAD para auth-logic.js (registro) y chat.js (directorio).
// El ?v= lo mantiene scripts/bump-version.js vía los <script> de auth.html e index.html.
(function () {
    'use strict';

    window.CIUDADES_POR_PAIS = {
        'Venezuela': {
            'Táchira': ['San Cristóbal', 'San Antonio del Táchira', 'San Juan de Colón', 'Táriba', 'Rubio', 'La Fría', 'San Josecito', 'Palmira', 'Capacho Nuevo', 'Capacho Viejo', 'La Grita', 'Abejales', 'Lobatera', 'Michelena', 'Ureña', 'Cordero', 'Las Mesas', 'Santa Ana del Táchira', 'San Rafael del Piñal', 'San José de Bolívar', 'El Cobre', 'Coloncito', 'Delicias', 'La Tendida', 'San Judas Tadeo', 'Seboruco', 'San Simón', 'Queniquea', 'Pregonero']
        }
    };

    window.BANDERA_POR_CIUDAD = {
        'San Cristóbal': 'san-cristobal.webp',
        'San Antonio del Táchira': 'bolivar.webp',
        'San Juan de Colón': 'ayacucho.webp',
        'Táriba': 'cardenas.webp',
        'Rubio': 'junin.webp',
        'La Fría': 'garcia-de-hevia.webp',
        'San Josecito': 'torbes.webp',
        'Palmira': 'guasimos.webp',
        'Capacho Nuevo': 'independencia.webp',
        'Capacho Viejo': 'libertad.webp',
        'La Grita': 'jauregui.webp',
        'Abejales': 'libertador.webp',
        'Lobatera': 'lobatera.webp',
        'Michelena': 'michelena.webp',
        'Ureña': 'pedro-maria-urena.webp',
        'Cordero': 'andres-bello.webp',
        'Las Mesas': 'antonio-romulo-costa.webp',
        'Santa Ana del Táchira': 'cordoba.webp',
        'San Rafael del Piñal': 'fernandez-feo.webp',
        'San José de Bolívar': 'francisco-de-miranda.webp',
        'El Cobre': 'jose-maria-vargas.webp',
        'Coloncito': 'panamericano.webp',
        'Delicias': 'rafael-urdaneta.webp',
        'La Tendida': 'samuel-dario-maldonado.webp',
        'San Judas Tadeo': 'san-judas-tadeo.webp',
        'Seboruco': 'seboruco.webp',
        'San Simón': 'simon-rodriguez.webp',
        'Queniquea': 'sucre.webp',
        'Pregonero': 'uribante.webp'
    };
})();
