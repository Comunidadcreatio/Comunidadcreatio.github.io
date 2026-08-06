const fs = require('fs');
let css = fs.readFileSync('css/formularios.css', 'utf-8');

// Find the actual modern styles block
const startMarker = '/* ==============================================\n   ESTILO MODERNO: INPUTS Y SELECTS (underline)\n   ============================================== */';
const endMarker = '\n/* Fila de 3 columnas */';

const start = css.indexOf(startMarker);
const end = css.indexOf(endMarker, start);

if (start === -1 || end === -1) {
    console.log('MARKERS NOT FOUND');
    console.log('start:', start, 'end:', end);
    process.exit(1);
}

const newModernBlock = `/* ==============================================
   ESTILO MODERNO: INPUTS Y SELECTS (underline)
   ============================================== */
#obra-form .form-group input[type="text"],
#obra-form .form-group input[type="number"],
#obra-form .form-group select,
#obra-form .form-group textarea {
    padding: 10px 0 !important;
    border: none !important;
    border-bottom: 1px solid var(--color-gray-300) !important;
    border-radius: 0 !important;
    background: transparent !important;
    background-color: transparent !important;
    font-size: 15px !important;
    font-family: 'Nunito', sans-serif;
    color: var(--color-text);
    outline: none !important;
    transition: border-color 0.2s;
    margin-bottom: 4px !important;
    box-shadow: none !important;
    width: 100%;
    max-width: 100%;
}

#obra-form .form-group input[type="text"]:focus,
#obra-form .form-group input[type="number"]:focus,
#obra-form .form-group select:focus,
#obra-form .form-group textarea:focus {
    border-bottom-color: var(--color-ink) !important;
    border-bottom-width: 2px !important;
}

#obra-form .form-group input::placeholder,
#obra-form .form-group textarea::placeholder {
    color: var(--color-gray-400) !important;
    opacity: 1;
}

#obra-form .form-group input:read-only {
    color: var(--color-gray-500) !important;
    border-bottom-style: dashed !important;
}

#obra-form .form-group select {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%23888' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 4px center;
    padding-right: 20px !important;
    -webkit-appearance: none;
    appearance: none;
}

#obra-form .form-group label {
    font-size: 11px !important;
    font-weight: 700 !important;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-gray-500) !important;
    margin-bottom: 2px !important;
}

/* Dark mode */
[data-theme="dark"] #obra-form .form-group input[type="text"],
[data-theme="dark"] #obra-form .form-group input[type="number"],
[data-theme="dark"] #obra-form .form-group select,
[data-theme="dark"] #obra-form .form-group textarea {
    color: var(--color-ink) !important;
    border-bottom-color: #444 !important;
    background: transparent !important;
    background-color: transparent !important;
}

[data-theme="dark"] #obra-form .form-group input:focus,
[data-theme="dark"] #obra-form .form-group select:focus,
[data-theme="dark"] #obra-form .form-group textarea:focus {
    border-bottom-color: var(--color-ink) !important;
}

[data-theme="dark"] #obra-form .form-group input::placeholder,
[data-theme="dark"] #obra-form .form-group textarea::placeholder {
    color: #555 !important;
}

[data-theme="dark"] #obra-form .form-group input:read-only {
    color: #666 !important;
}

[data-theme="dark"] #obra-form .form-group select {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%23888' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
}

[data-theme="dark"] #obra-form .form-group label {
    color: var(--color-gray-400) !important;
}
`;

css = css.slice(0, start) + newModernBlock + css.slice(end);
fs.writeFileSync('css/formularios.css', css);
console.log('OK - replaced modern block');
