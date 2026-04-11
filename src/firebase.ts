// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBrYcYWGkd9luCVcPJ1QyyoCr3QHssvmHE",
  authDomain: "easyorder-c2781.firebaseapp.com",
  projectId: "easyorder-c2781",
  storageBucket: "easyorder-c2781.firebasestorage.app",
  messagingSenderId: "553991205534",
  appId: "1:553991205534:web:ddee409c73fac10ad0018f",
  measurementId: "G-17EHYE42Q8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);