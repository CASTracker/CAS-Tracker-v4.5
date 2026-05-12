import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAUq-pRnG4U8f8ubnakfxGhQynlXiHJavs",
  authDomain: "cas-tracker-v1-5.firebaseapp.com",
  projectId: "cas-tracker-v1-5",
  storageBucket: "cas-tracker-v1-5.firebasestorage.app",
  messagingSenderId: "250411099476",
  appId: "1:250411099476:web:67a8a045c6a7833b9f14c1",
  measurementId: "G-PSGSFE02VY"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
