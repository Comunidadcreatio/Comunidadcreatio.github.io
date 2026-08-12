// routes/chatRoutes.js
// Chat global + privado. GET con solo authenticateToken (sin verificarSesionActiva:
// esa middleware hace un UPDATE de sesión por request y el polling del chat
// pegaría 5 veces/min por usuario). El POST sí mantiene el rate-limit.
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const chatController = require('../controllers/chatController');

const chatLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 30,
    message: { success: false, error: '⚠️ Demasiados mensajes. Espera un momento.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Límite suave para el resto de acciones del chat (reacciones, typing, etc.)
const chatAccionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 90,
    message: { success: false, error: '⚠️ Demasiadas acciones. Espera un momento.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Subida de imágenes de mensajes (memoryStorage -> Cloudinary)
const uploadChat = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 }
});

// Todas las rutas de chat requieren sesión (JWT válido en cookie HttpOnly)
router.use(authenticateToken);

router.get('/directorio', chatController.getDirectorio);
router.get('/mensajes', chatController.getMensajes);
router.get('/conversaciones', chatController.getConversaciones);
router.get('/no-leidos', chatController.getNoLeidos);
router.post('/mensajes', chatLimiter, chatController.enviarMensaje);
router.put('/mensajes/:id', chatController.editarMensaje);
router.delete('/mensajes/:id', chatController.eliminarMensaje);
router.post('/leido', chatController.marcarLeido);
router.post('/reaccion', chatAccionLimiter, chatController.reaccionarMensaje);
router.post('/typing', chatAccionLimiter, chatController.indicarTyping);
router.post('/bloquear', chatController.bloquearUsuario);
router.delete('/bloquear', chatController.desbloquearUsuario);
router.post('/denunciar', chatController.denunciarUsuario);
router.post('/imagen', uploadChat.single('imagen'), chatController.subirImagen);
router.delete('/conversaciones', chatController.eliminarConversacion);

module.exports = router;
