// js/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

// 🔴 REEMPLAZA ESTE OBJETO CON TU firebaseConfig DE FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyDHC1ufOjMnWKMoyszDyTQCmuzpZsHhYyo",
    authDomain: "hagamos-arte-tachira.firebaseapp.com",
    projectId: "hagamos-arte-tachira",
    storageBucket: "hagamos-arte-tachira.firebasestorage.app",
    messagingSenderId: "722835457032",
    appId: "1:722835457032:web:4ddc43f116b2ee74dc3dbd",
    measurementId: "G-0PWK51SDZT"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Exporta lo que necesitas en main.js
export { auth, RecaptchaVerifier, signInWithPhoneNumber };