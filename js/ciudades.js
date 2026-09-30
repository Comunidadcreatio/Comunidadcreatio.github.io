// @ts-check
// js/ciudades.js
// Lista canÃ³nica de ciudades/pueblos de TÃ¡chira y sus banderas.
// Script clÃ¡sico (no mÃ³dulo): expone window.CIUDADES_POR_PAIS y
// window.BANDERA_POR_CIUDAD para auth-logic.js (registro) y chat.js (directorio).
// El ?v= lo mantiene scripts/bump-version.js vÃ­a los <script> de auth.html e index.html.
(function () {
    'use strict';

    window.CIUDADES_POR_PAIS = {
        'Venezuela': {
            'TÃ¡chira': ['San CristÃ³bal', 'San Antonio del TÃ¡chira', 'San Juan de ColÃ³n', 'TÃ¡riba', 'Rubio', 'La FrÃ­a', 'San Josecito', 'Palmira', 'Capacho Nuevo', 'Capacho Viejo', 'La Grita', 'Abejales', 'Lobatera', 'Michelena', 'UreÃ±a', 'Cordero', 'Las Mesas', 'Santa Ana del TÃ¡chira', 'San Rafael del PiÃ±al', 'San JosÃ© de BolÃ­var', 'El Cobre', 'Coloncito', 'Delicias', 'La Tendida', 'San Judas Tadeo', 'Seboruco', 'San SimÃ³n', 'Queniquea', 'Pregonero']
        }
    };

    window.BANDERA_POR_CIUDAD = {
        'San CristÃ³bal': 'san-cristobal.webp',
        'San Antonio del TÃ¡chira': 'bolivar.webp',
        'San Juan de ColÃ³n': 'ayacucho.webp',
        'TÃ¡riba': 'cardenas.webp',
        'Rubio': 'junin.webp',
        'La FrÃ­a': 'garcia-de-hevia.webp',
        'San Josecito': 'torbes.webp',
        'Palmira': 'guasimos.webp',
        'Capacho Nuevo': 'independencia.webp',
        'Capacho Viejo': 'libertad.webp',
        'La Grita': 'jauregui.webp',
        'Abejales': 'libertador.webp',
        'Lobatera': 'lobatera.webp',
        'Michelena': 'michelena.webp',
        'UreÃ±a': 'pedro-maria-urena.webp',
        'Cordero': 'andres-bello.webp',
        'Las Mesas': 'antonio-romulo-costa.webp',
        'Santa Ana del TÃ¡chira': 'cordoba.webp',
        'San Rafael del PiÃ±al': 'fernandez-feo.webp',
        'San JosÃ© de BolÃ­var': 'francisco-de-miranda.webp',
        'El Cobre': 'jose-maria-vargas.webp',
        'Coloncito': 'panamericano.webp',
        'Delicias': 'rafael-urdaneta.webp',
        'La Tendida': 'samuel-dario-maldonado.webp',
        'San Judas Tadeo': 'san-judas-tadeo.webp',
        'Seboruco': 'seboruco.webp',
        'San SimÃ³n': 'simon-rodriguez.webp',
        'Queniquea': 'sucre.webp',
        'Pregonero': 'uribante.webp'
    };

    // Municipio al que pertenece cada pueblo del TÃ¡chira (las banderas del
    // carrusel son de los municipios; el pueblo es la capital). Cuando el
    // municipio se llama igual que el pueblo, se omite en la UI.
    window.MUNICIPIO_POR_PUEBLO = {
        'San CristÃ³bal': 'San CristÃ³bal',
        'San Antonio del TÃ¡chira': 'BolÃ­var',
        'San Juan de ColÃ³n': 'Ayacucho',
        'TÃ¡riba': 'CÃ¡rdenas',
        'Rubio': 'JunÃ­n',
        'La FrÃ­a': 'GarcÃ­a de HevÃ­a',
        'San Josecito': 'Torbes',
        'Palmira': 'GuÃ¡simos',
        'Capacho Nuevo': 'Independencia',
        'Capacho Viejo': 'Libertad',
        'La Grita': 'JÃ¡uregui',
        'Abejales': 'Libertador',
        'Lobatera': 'Lobatera',
        'Michelena': 'Michelena',
        'UreÃ±a': 'Pedro MarÃ­a UreÃ±a',
        'Cordero': 'AndrÃ©s Bello',
        'Las Mesas': 'Antonio RÃ³mulo Costa',
        'Santa Ana del TÃ¡chira': 'CÃ³rdoba',
        'San Rafael del PiÃ±al': 'FernÃ¡ndez Feo',
        'San JosÃ© de BolÃ­var': 'Francisco de Miranda',
        'El Cobre': 'JosÃ© MarÃ­a Vargas',
        'Coloncito': 'Panamericano',
        'Delicias': 'Rafael Urdaneta',
        'La Tendida': 'Samuel DarÃ­o Maldonado',
        'San Judas Tadeo': 'San Judas Tadeo',
        'Seboruco': 'Seboruco',
        'San SimÃ³n': 'SimÃ³n RodrÃ­guez',
        'Queniquea': 'Sucre',
        'Pregonero': 'Uribante'
    };
})();
