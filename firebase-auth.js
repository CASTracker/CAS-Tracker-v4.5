import { auth, db } from "./firebase-app.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const logoutBtn = document.getElementById("logoutBtn");
const msg = document.getElementById("msg");

function setMessage(text, type = "info") {
  if (!msg) return;
  msg.textContent = text;
  msg.dataset.type = type;
}

async function crearDocumentoUsuario(user) {
  await setDoc(doc(db, "usuarios", user.uid), {
    email: user.email,
    actividades: [],
    reflexiones: [],
    horario: [],
    portfolioFolders: [{ id: "general", nombre: "General", createdAt: Date.now() }],
    portfolioFiles: [],
    learningOutcomes: []
  }, { merge: true });
}

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      setMessage("Iniciando sesión...", "success");
      window.location.href = "menu.html";
    } catch (error) {
      setMessage("No se pudo iniciar sesión. Revisa tu correo y contraseña.", "error");
      console.error(error);
    }
  });
}

if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value;

    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      await crearDocumentoUsuario(userCred.user);
      setMessage("Cuenta creada. Redirigiendo...", "success");
      window.location.href = "menu.html";
    } catch (error) {
      setMessage("No se pudo crear la cuenta. Usa una contraseña de al menos 6 caracteres.", "error");
      console.error(error);
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}

onAuthStateChanged(auth, (user) => {
  const isLoginPage = window.location.pathname.endsWith("index.html") || window.location.pathname.endsWith("/");
  if (user && isLoginPage) {
    window.location.href = "menu.html";
  }

  if (!user && !isLoginPage) {
    window.location.href = "index.html";
  }
});
