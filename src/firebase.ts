import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Config
const firebaseConfig = {
  apiKey: "AIzaSyBrYcYWGkd9luCVcPJ1QyyoCr3QHssvmHE",
  authDomain: "easyorder-c2781.firebaseapp.com",
  projectId: "easyorder-c2781",
  storageBucket: "easyorder-c2781.firebasestorage.app",
  messagingSenderId: "553991205534",
  appId: "1:553991205534:web:ddee409c73fac10ad0018f",
  measurementId: "G-17EHYE42Q8"
};

//Inicializamos la App de Firebase
const app = initializeApp(firebaseConfig);

//Inicializamos y EXPORTAMOS los servicios para usarlos en AdminView.vue y otros
export const db = getFirestore(app);
export const auth = getAuth(app);