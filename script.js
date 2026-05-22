import { auth, db } from "./firebase-app.js";
import { cloudinaryConfig } from "./cloudinary-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

const STORAGE_KEYS = {
  actividades: "actividadesCAS",
  reflexiones: "reflexionesCAS",
  horario: "horarioCAS",
  folders: "portfolioFoldersCAS",
  files: "portfolioFilesCAS",
  outcomes: "learningOutcomesCAS",
  theme: "casTheme",
  selectedFolder: "portfolioSelectedFolderCAS"
};

const DEFAULT_FOLDER = { id: "general", nombre: "General", createdAt: 0 };
let userUID = null;

initTheme();
initPage();

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  userUID = user.uid;
  await cargarDatosDesdeFirestore();
  renderAll();
});

function initPage() {
  document.addEventListener("DOMContentLoaded", () => {
    bindThemeToggle();
    bindForms();
    iniciarContadorReflexion();
    renderAll();
  });
}

function bindForms() {
  document.getElementById("formActividad")?.addEventListener("submit", guardarActividad);
  document.getElementById("formReflexion")?.addEventListener("submit", guardarReflexion);
  document.getElementById("guardarHorario")?.addEventListener("click", guardarHorario);
  document.getElementById("limpiarHorario")?.addEventListener("click", limpiarHorario);
  document.getElementById("formCarpeta")?.addEventListener("submit", crearCarpeta);
  document.getElementById("formArchivo")?.addEventListener("submit", guardarEnlacePortafolio);
  document.getElementById("cloudinaryUploadBtn")?.addEventListener("click", abrirWidgetCloudinary);
  document.querySelectorAll("#learningOutcomes input[type='checkbox']").forEach(input => {
    input.addEventListener("change", guardarResultadosAprendizaje);
  });
}

function renderAll() {
  actualizarTotales();
  mostrarActividades();
  mostrarReflexiones();
  mostrarReflexionesPreview();
  cargarHorario();
  mostrarCarpetas();
  mostrarArchivos();
  mostrarResultadosAprendizaje();
  mostrarSugerenciasCAS();
}

function getJSON(key, fallback = []) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function setJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function createEl(tag, options = {}) {
  const el = document.createElement(tag);
  if (options.className) el.className = options.className;
  if (options.text !== undefined) el.textContent = options.text;
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => el.setAttribute(key, value));
  }
  return el;
}

function isCloudinaryConfigured() {
  return Boolean(cloudinaryConfig.cloudName && cloudinaryConfig.uploadPreset);
}

function crearVistaPreviaPdf(url) {
  if (!url || !url.includes("/image/upload/") || !url.toLowerCase().endsWith(".pdf")) return "";
  return url.replace("/image/upload/", "/image/upload/pg_1/").replace(/\.pdf(\?.*)?$/i, ".jpg$1");
}

async function guardarDatosEnFirestore() {
  if (!userUID) return;
  const data = {
    actividades: getJSON(STORAGE_KEYS.actividades),
    reflexiones: getJSON(STORAGE_KEYS.reflexiones),
    horario: getJSON(STORAGE_KEYS.horario),
    portfolioFolders: getFolders(),
    portfolioFiles: getJSON(STORAGE_KEYS.files),
    learningOutcomes: getJSON(STORAGE_KEYS.outcomes)
  };
  await setDoc(doc(db, "usuarios", userUID), data, { merge: true });
}

async function cargarDatosDesdeFirestore() {
  if (!userUID) return;
  const userRef = doc(db, "usuarios", userUID);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    await setDoc(userRef, {
      actividades: [],
      reflexiones: [],
      horario: [],
      portfolioFolders: [DEFAULT_FOLDER],
      portfolioFiles: [],
      learningOutcomes: []
    }, { merge: true });
    return;
  }

  const data = snap.data();
  setJSON(STORAGE_KEYS.actividades, data.actividades || []);
  setJSON(STORAGE_KEYS.reflexiones, data.reflexiones || []);
  setJSON(STORAGE_KEYS.horario, data.horario || []);
  setJSON(STORAGE_KEYS.folders, normalizeFolders(data.portfolioFolders || []));
  setJSON(STORAGE_KEYS.files, data.portfolioFiles || []);
  setJSON(STORAGE_KEYS.outcomes, data.learningOutcomes || []);
}

function normalizeFolders(folders) {
  const cleaned = folders.filter(folder => folder && folder.id && folder.nombre);
  return cleaned.some(folder => folder.id === DEFAULT_FOLDER.id)
    ? cleaned
    : [DEFAULT_FOLDER, ...cleaned];
}

function getFolders() {
  return normalizeFolders(getJSON(STORAGE_KEYS.folders, [DEFAULT_FOLDER]));
}

function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme) || "light";
  document.documentElement.dataset.theme = savedTheme;
}

function bindThemeToggle() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  const syncLabel = () => {
    const isDark = document.documentElement.dataset.theme === "dark";
    btn.textContent = isDark ? "☀" : "☾";
    btn.setAttribute("aria-label", isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
  };
  syncLabel();
  btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(STORAGE_KEYS.theme, next);
    syncLabel();
  });
}

function guardarActividad(e) {
  e.preventDefault();
  const nombre = document.getElementById("nombre").value.trim();
  const categoria = document.getElementById("categoria").value;
  const horas = Number.parseInt(document.getElementById("horas").value, 10);
  const fecha = document.getElementById("fecha").value;
  const descripcion = document.getElementById("descripcion").value.trim();

  if (!nombre || !categoria || !fecha || !Number.isInteger(horas) || horas < 1) return;

  const actividades = getJSON(STORAGE_KEYS.actividades);
  actividades.push({ id: Date.now(), nombre, categoria, horas, fecha, descripcion });
  setJSON(STORAGE_KEYS.actividades, actividades);
  guardarDatosEnFirestore();
  e.target.reset();
  mostrarActividades();
  actualizarTotales();
}

function mostrarActividades() {
  const tabla = document.querySelector("#tablaActividades tbody");
  if (!tabla) return;

  const actividades = getJSON(STORAGE_KEYS.actividades);
  tabla.replaceChildren();

  if (!actividades.length) {
    const tr = createEl("tr");
    const td = createEl("td", {
      className: "empty-state",
      text: "Todavía no hay actividades registradas.",
      attrs: { colspan: "6" }
    });
    tr.appendChild(td);
    tabla.appendChild(tr);
    return;
  }

  actividades.forEach((act, i) => {
    const tr = createEl("tr");
    [
      act.nombre,
      labelCategoria(act.categoria),
      `${act.horas}`,
      act.fecha,
      act.descripcion || "-"
    ].forEach(text => tr.appendChild(createEl("td", { text })));

    const actions = createEl("td");
    const removeBtn = createEl("button", { className: "btn danger small", text: "Eliminar" });
    removeBtn.type = "button";
    removeBtn.addEventListener("click", () => eliminarActividad(i));
    actions.appendChild(removeBtn);
    tr.appendChild(actions);
    tabla.appendChild(tr);
  });
}

function labelCategoria(categoria) {
  return { C: "Creatividad", A: "Actividad", S: "Servicio" }[categoria] || categoria;
}

function eliminarActividad(index) {
  if (!confirm("¿Estás seguro de que quieres eliminar esta actividad?")) return;
  const actividades = getJSON(STORAGE_KEYS.actividades);
  actividades.splice(index, 1);
  setJSON(STORAGE_KEYS.actividades, actividades);
  guardarDatosEnFirestore();
  mostrarActividades();
  actualizarTotales();
}

function actualizarTotales() {
  const actividades = getJSON(STORAGE_KEYS.actividades);
  const totals = actividades.reduce((acc, act) => {
    if (["C", "A", "S"].includes(act.categoria)) acc[act.categoria] += Number(act.horas) || 0;
    return acc;
  }, { C: 0, A: 0, S: 0 });

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = `${value} horas`;
  };

  setText("totalC", totals.C);
  setText("totalA", totals.A);
  setText("totalS", totals.S);
  setText("totalGeneral", totals.C + totals.A + totals.S);
}

function guardarResultadosAprendizaje() {
  const selected = Array.from(document.querySelectorAll("#learningOutcomes input[type='checkbox']:checked"))
    .map(input => input.value);
  setJSON(STORAGE_KEYS.outcomes, selected);
  guardarDatosEnFirestore();
  mostrarSugerenciasCAS();
}

function mostrarResultadosAprendizaje() {
  const cont = document.getElementById("learningOutcomes");
  if (!cont) return;
  const selected = new Set(getJSON(STORAGE_KEYS.outcomes));
  cont.querySelectorAll("input[type='checkbox']").forEach(input => {
    input.checked = selected.has(input.value);
  });
}

function mostrarSugerenciasCAS() {
  const cont = document.getElementById("casInsights");
  if (!cont) return;

  const actividades = getJSON(STORAGE_KEYS.actividades);
  const reflexiones = getJSON(STORAGE_KEYS.reflexiones);
  const archivos = getJSON(STORAGE_KEYS.files);
  const resultados = getJSON(STORAGE_KEYS.outcomes);
  const categorias = new Set(actividades.map(act => act.categoria));
  const suggestions = [];

  if (!actividades.length) {
    suggestions.push("Registra tu primera actividad para empezar a construir tu historial CAS.");
  }
  if (!categorias.has("C")) suggestions.push("Agrega una experiencia de Creatividad para balancear tu portafolio.");
  if (!categorias.has("A")) suggestions.push("Incluye una actividad física o de bienestar para cubrir Actividad.");
  if (!categorias.has("S")) suggestions.push("Registra una experiencia de Servicio con impacto claro en otras personas.");
  if (actividades.length && reflexiones.length < Math.ceil(actividades.length / 2)) {
    suggestions.push("Escribe una reflexión reciente: ayuda mucho cuando llega la revisión del portafolio.");
  }
  if (actividades.length && !archivos.length) {
    suggestions.push("Sube al menos una evidencia al Portafolio para respaldar tus actividades.");
  }
  if (resultados.length < 3) {
    suggestions.push("Marca resultados de aprendizaje CAS conforme los vayas demostrando.");
  }
  if (!suggestions.length) {
    suggestions.push("Tu tracker se ve equilibrado. Mantén el hábito semanal de registrar, reflexionar y guardar evidencia.");
  }

  cont.replaceChildren();
  suggestions.slice(0, 3).forEach(text => {
    cont.appendChild(createEl("p", { text }));
  });
}

function guardarReflexion(e) {
  e.preventDefault();
  const titulo = document.getElementById("tituloReflexion").value.trim();
  const texto = document.getElementById("textoReflexion").value.trim();
  if (!titulo || !texto) return;

  const reflexiones = getJSON(STORAGE_KEYS.reflexiones);
  const fecha = new Date().toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" });

  if (window.reflexionEditando) {
    const index = reflexiones.findIndex(r => r.id === window.reflexionEditando);
    if (index >= 0) reflexiones[index] = { ...reflexiones[index], titulo, texto, updatedAt: Date.now() };
    window.reflexionEditando = null;
  } else {
    reflexiones.push({ id: Date.now(), titulo, texto, fecha, createdAt: Date.now() });
  }

  setJSON(STORAGE_KEYS.reflexiones, reflexiones);
  guardarDatosEnFirestore();
  e.target.reset();
  actualizarContador(document.getElementById("textoReflexion"));
  mostrarReflexiones();
  mostrarReflexionesPreview();
}

function mostrarReflexiones() {
  const cont = document.getElementById("listaReflexiones");
  if (!cont) return;

  const reflexiones = getJSON(STORAGE_KEYS.reflexiones);
  cont.replaceChildren();

  if (!reflexiones.length) {
    cont.appendChild(createEl("p", { className: "empty-state", text: "Todavía no hay reflexiones guardadas." }));
    return;
  }

  reflexiones.slice().reverse().forEach(reflexion => cont.appendChild(crearTarjetaReflexion(reflexion, true)));
}

function crearTarjetaReflexion(reflexion, withActions) {
  const card = createEl("article", { className: "reflexion" });
  const header = createEl("button", { className: "reflexion-header", attrs: { type: "button" } });
  header.appendChild(createEl("span", { className: "reflexion-title", text: reflexion.titulo }));
  header.appendChild(createEl("small", { text: reflexion.fecha || "" }));

  const body = createEl("div", { className: "reflexion-body" });
  body.appendChild(createEl("p", { text: reflexion.texto }));

  if (withActions) {
    const actions = createEl("div", { className: "button-row" });
    const editBtn = createEl("button", { className: "btn secondary small", text: "Editar" });
    const deleteBtn = createEl("button", { className: "btn danger small", text: "Eliminar" });
    const exportBtn = createEl("button", { className: "btn small", text: "Exportar a Word" });

    editBtn.type = deleteBtn.type = exportBtn.type = "button";
    editBtn.addEventListener("click", () => editarReflexion(reflexion.id));
    deleteBtn.addEventListener("click", () => eliminarReflexion(reflexion.id));
    exportBtn.addEventListener("click", () => exportarReflexionWord(reflexion));
    actions.append(editBtn, deleteBtn, exportBtn);
    body.appendChild(actions);
  }

  header.addEventListener("click", () => {
    const expanded = card.classList.toggle("is-open");
    header.setAttribute("aria-expanded", String(expanded));
  });

  card.append(header, body);
  return card;
}

function eliminarReflexion(id) {
  if (!confirm("¿Seguro que quieres eliminar esta reflexión?")) return;
  const nuevas = getJSON(STORAGE_KEYS.reflexiones).filter(r => r.id !== id);
  setJSON(STORAGE_KEYS.reflexiones, nuevas);
  guardarDatosEnFirestore();
  mostrarReflexiones();
  mostrarReflexionesPreview();
}

function editarReflexion(id) {
  const reflexion = getJSON(STORAGE_KEYS.reflexiones).find(r => r.id === id);
  if (!reflexion) return;
  document.getElementById("tituloReflexion").value = reflexion.titulo;
  document.getElementById("textoReflexion").value = reflexion.texto;
  window.reflexionEditando = id;
  actualizarContador(document.getElementById("textoReflexion"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function mostrarReflexionesPreview() {
  const cont = document.getElementById("previewReflexiones");
  if (!cont) return;

  const reflexiones = getJSON(STORAGE_KEYS.reflexiones);
  cont.replaceChildren();

  if (!reflexiones.length) {
    cont.appendChild(createEl("p", { className: "empty-state", text: "Tus reflexiones recientes aparecerán aquí." }));
    return;
  }

  reflexiones.slice(-2).reverse().forEach(ref => {
    const card = createEl("article", { className: "reflexion preview-card" });
    card.appendChild(createEl("strong", { text: ref.titulo }));
    card.appendChild(createEl("small", { text: ref.fecha || "" }));
    card.appendChild(createEl("p", { text: ref.texto.length > 120 ? `${ref.texto.slice(0, 120)}...` : ref.texto }));
    cont.appendChild(card);
  });
}

function guardarHorario() {
  const filas = document.querySelectorAll("#tablaHorario tbody tr");
  const horario = Array.from(filas).map(row => ({
    dia: row.children[0].textContent,
    actividad: row.querySelector("textarea")?.value.trim() || ""
  }));

  setJSON(STORAGE_KEYS.horario, horario);
  guardarDatosEnFirestore();
  alert("Horario guardado.");
}

function cargarHorario() {
  const horario = getJSON(STORAGE_KEYS.horario);
  const filas = document.querySelectorAll("#tablaHorario tbody tr");
  if (!filas.length) return;

  filas.forEach((fila, i) => {
    const textarea = fila.querySelector("textarea");
    if (textarea) textarea.value = horario[i]?.actividad || "";
  });
}

function limpiarHorario() {
  if (!confirm("¿Quieres limpiar todo el horario?")) return;
  localStorage.removeItem(STORAGE_KEYS.horario);
  document.querySelectorAll("#tablaHorario textarea").forEach(textarea => textarea.value = "");
  guardarDatosEnFirestore();
}

function contarPalabras(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function actualizarContador(textarea) {
  const counter = document.getElementById("wordCount");
  if (!textarea || !counter) return;
  const n = contarPalabras(textarea.value);
  const MAX = 400;
  const WARN = 350;
  counter.textContent = `${n} palabra${n === 1 ? "" : "s"}`;
  counter.classList.toggle("warning", n >= WARN && n <= MAX);
  counter.classList.toggle("exceeded", n > MAX);
}

function iniciarContadorReflexion() {
  const textarea = document.getElementById("textoReflexion");
  if (!textarea) return;
  const actualizar = () => actualizarContador(textarea);
  ["input", "keyup", "change", "paste"].forEach(evt => textarea.addEventListener(evt, actualizar));
  actualizar();
}

function getSelectedFolderId() {
  const folders = getFolders();
  const selected = localStorage.getItem(STORAGE_KEYS.selectedFolder);
  return folders.some(folder => folder.id === selected) ? selected : DEFAULT_FOLDER.id;
}

function setSelectedFolder(id) {
  localStorage.setItem(STORAGE_KEYS.selectedFolder, id);
  mostrarCarpetas();
  mostrarArchivos();
}

function crearCarpeta(e) {
  e.preventDefault();
  const input = document.getElementById("nombreCarpeta");
  const nombre = input.value.trim();
  if (!nombre) return;

  const folders = getFolders();
  folders.push({ id: `folder-${Date.now()}`, nombre, createdAt: Date.now() });
  setJSON(STORAGE_KEYS.folders, folders);
  input.value = "";
  guardarDatosEnFirestore();
  mostrarCarpetas();
}

function mostrarCarpetas() {
  const cont = document.getElementById("listaCarpetas");
  if (!cont) return;

  const folders = getFolders();
  const selected = getSelectedFolderId();
  cont.replaceChildren();

  folders.forEach(folder => {
    const item = createEl("div", { className: folder.id === selected ? "folder-item active" : "folder-item" });
    const button = createEl("button", { text: folder.nombre, attrs: { type: "button" } });
    button.addEventListener("click", () => setSelectedFolder(folder.id));
    item.appendChild(button);

    if (folder.id !== DEFAULT_FOLDER.id) {
      const remove = createEl("button", { className: "folder-delete", text: "Eliminar", attrs: { type: "button" } });
      remove.addEventListener("click", () => eliminarCarpeta(folder.id));
      item.appendChild(remove);
    }

    cont.appendChild(item);
  });

  const current = folders.find(folder => folder.id === selected);
  const label = document.getElementById("carpetaActual");
  if (label) label.textContent = current?.nombre || DEFAULT_FOLDER.nombre;
}

function eliminarCarpeta(id) {
  const files = getJSON(STORAGE_KEYS.files).filter(file => file.folderId === id);
  if (files.length) {
    alert("Primero elimina o mueve los archivos de esta carpeta.");
    return;
  }
  if (!confirm("¿Eliminar esta carpeta?")) return;

  const folders = getFolders().filter(folder => folder.id !== id);
  setJSON(STORAGE_KEYS.folders, folders);
  setSelectedFolder(DEFAULT_FOLDER.id);
  guardarDatosEnFirestore();
}

async function guardarEnlacePortafolio(e) {
  e.preventDefault();
  const nameInput = document.getElementById("nombreArchivo");
  const urlInput = document.getElementById("urlArchivo");
  const typeInput = document.getElementById("tipoArchivo");
  const status = document.getElementById("portfolioStatus");
  const name = nameInput.value.trim();
  const url = urlInput.value.trim();
  const type = typeInput.value;
  const folderId = getSelectedFolderId();

  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Invalid protocol");

    const files = getJSON(STORAGE_KEYS.files);
    files.push({
      id: Date.now(),
      folderId,
      name,
      type,
      url,
      provider: "link",
      createdAt: Date.now()
    });
    setJSON(STORAGE_KEYS.files, files);
    await guardarDatosEnFirestore();
    e.target.reset();
    if (status) status.textContent = "Enlace guardado.";
    mostrarArchivos();
  } catch (error) {
    if (status) status.textContent = "Pega un enlace válido que empiece con http o https.";
    console.error(error);
  }
}

function abrirWidgetCloudinary() {
  const status = document.getElementById("cloudinaryStatus");
  if (!isCloudinaryConfigured()) {
    if (status) status.textContent = "Falta configurar Cloudinary: cloud name y upload preset.";
    return;
  }

  if (!window.cloudinary?.createUploadWidget) {
    if (status) status.textContent = "No se pudo cargar el widget de Cloudinary. Revisa tu conexión.";
    return;
  }

  const folderId = getSelectedFolderId();
  const widget = window.cloudinary.createUploadWidget({
    cloudName: cloudinaryConfig.cloudName,
    uploadPreset: cloudinaryConfig.uploadPreset,
    folder: `${cloudinaryConfig.folder}/${userUID || "sin-usuario"}/${folderId}`,
    sources: ["local", "url", "google_drive"],
    multiple: false,
    maxFileSize: cloudinaryConfig.maxFileSize,
    clientAllowedFormats: cloudinaryConfig.allowedFormats,
    resourceType: "auto",
    showAdvancedOptions: false,
    styles: {
      palette: {
        window: "#ffffff",
        sourceBg: "#f4f7fb",
        windowBorder: "#e4eaf1",
        tabIcon: "#0077b6",
        menuIcons: "#6b7280",
        textDark: "#1f2937",
        textLight: "#ffffff",
        link: "#0077b6",
        action: "#0077b6",
        inactiveTabIcon: "#6b7280",
        error: "#d83b3b",
        inProgress: "#0096c7",
        complete: "#0077b6",
        progressBar: "#0077b6"
      }
    }
  }, async (error, result) => {
    if (error) {
      if (status) status.textContent = "No se pudo subir el documento.";
      console.error(error);
      return;
    }

    if (result.event !== "success") return;

    const info = result.info;
    const files = getJSON(STORAGE_KEYS.files);
    files.push({
      id: Date.now(),
      folderId,
      name: info.original_filename ? `${info.original_filename}.${info.format || ""}`.replace(/\.$/, "") : info.public_id,
      type: (info.format || info.resource_type || "Documento").toUpperCase(),
      url: info.secure_url,
      previewUrl: crearVistaPreviaPdf(info.secure_url),
      provider: "cloudinary",
      publicId: info.public_id,
      resourceType: info.resource_type,
      format: info.format,
      bytes: info.bytes || 0,
      createdAt: Date.now()
    });
    setJSON(STORAGE_KEYS.files, files);
    await guardarDatosEnFirestore();
    if (status) status.textContent = "Documento subido y guardado.";
    mostrarArchivos();
  });

  widget.open();
}

function mostrarArchivos() {
  const cont = document.getElementById("listaArchivos");
  if (!cont) return;

  const selected = getSelectedFolderId();
  const files = getJSON(STORAGE_KEYS.files).filter(file => file.folderId === selected);
  cont.replaceChildren();

  if (!files.length) {
    cont.appendChild(createEl("p", { className: "empty-state", text: "Esta carpeta todavía no tiene documentos." }));
    return;
  }

  files.slice().reverse().forEach(file => {
    const item = createEl("article", { className: "file-item" });
    const info = createEl("div");
    info.appendChild(createEl("strong", { text: file.name }));
    const provider = file.provider === "cloudinary" ? "Cloudinary" : "Enlace";
    info.appendChild(createEl("small", { text: `${file.type || "Documento"} · ${provider} · ${new Date(file.createdAt).toLocaleDateString("es-MX")}` }));

    const actions = createEl("div", { className: "button-row" });
    if (file.previewUrl) {
      const preview = createEl("a", { className: "btn secondary small", text: "Vista previa", attrs: { href: file.previewUrl, target: "_blank", rel: "noopener" } });
      actions.appendChild(preview);
    }
    const open = createEl("a", { className: "btn small", text: "Abrir original", attrs: { href: file.url, target: "_blank", rel: "noopener" } });
    const remove = createEl("button", { className: "btn danger small", text: "Eliminar", attrs: { type: "button" } });
    remove.addEventListener("click", () => eliminarArchivo(file.id));
    actions.append(open, remove);

    item.append(info, actions);
    cont.appendChild(item);
  });
}

async function eliminarArchivo(id) {
  if (!confirm("¿Eliminar este documento del portafolio?")) return;
  const files = getJSON(STORAGE_KEYS.files);
  setJSON(STORAGE_KEYS.files, files.filter(item => item.id !== id));
  await guardarDatosEnFirestore();
  mostrarArchivos();
}

function exportarDatos() {
  const data = {
    actividades: getJSON(STORAGE_KEYS.actividades),
    reflexiones: getJSON(STORAGE_KEYS.reflexiones),
    horario: getJSON(STORAGE_KEYS.horario),
    portfolioFolders: getFolders(),
    portfolioFiles: getJSON(STORAGE_KEYS.files),
    learningOutcomes: getJSON(STORAGE_KEYS.outcomes)
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cas_backup.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function cargarImagenDocx(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
  return response.arrayBuffer();
}

function lineRun(length = 20) {
  return new TextRun({ text: "_".repeat(length), bold: true, size: 24 });
}

function labelRun(text) {
  return new TextRun({ text, bold: true, size: 24 });
}

function valueRun(text) {
  return new TextRun({ text, size: 24 });
}

async function exportarReflexionWord(reflexion) {
  if (!window.docx || !window.saveAs) {
    alert("No se pudo cargar el exportador de Word.");
    return;
  }

  const {
    AlignmentType,
    BorderStyle,
    Document,
    ImageRun,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType
  } = window.docx;

  let cetysLogo;
  let ibLogo;
  try {
    [cetysLogo, ibLogo] = await Promise.all([
      cargarImagenDocx("./assets/cetys-logo.png"),
      cargarImagenDocx("./assets/ib-logo.png")
    ]);
  } catch (error) {
    console.error(error);
    alert("No se pudieron cargar los logos del formato.");
    return;
  }

  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
  };

  const cell = (children, width) => new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    borders: noBorders,
    children
  });

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          cell([
            new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [
                new ImageRun({
                  data: cetysLogo,
                  transformation: { width: 126, height: 88 }
                })
              ]
            })
          ], 20),
          cell([
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 180 },
              children: [new TextRun({ text: "Centro De Enseñanza Técnica y Superior", bold: true, size: 24 })]
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "Escuela Preparatoria", bold: true, size: 24 })]
            })
          ], 60),
          cell([
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new ImageRun({
                  data: ibLogo,
                  transformation: { width: 84, height: 84 }
                })
              ]
            })
          ], 20)
        ]
      })
    ]
  });

  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          cell([
            new Paragraph({ children: [labelRun("Nombre: "), lineRun(34)] })
          ], 62),
          cell([
            new Paragraph({ children: [labelRun("Matrícula BI: "), lineRun(10)] })
          ], 38)
        ]
      }),
      new TableRow({
        children: [
          cell([
            new Paragraph({
              children: [
                labelRun("Actividad/proyecto: "),
                valueRun(reflexion.titulo || ""),
                lineRun(Math.max(5, 26 - (reflexion.titulo || "").length))
              ]
            })
          ], 62),
          cell([
            new Paragraph({ children: [labelRun("Fecha: "), lineRun(14)] })
          ], 38)
        ]
      }),
      new TableRow({
        children: [
          cell([
            new Paragraph({ children: [labelRun("Horas de avance: "), lineRun(5), labelRun(" horas")] })
          ], 62),
          cell([new Paragraph({ text: "" })], 38)
        ]
      })
    ]
  });

  const reflectionParagraphs = (reflexion.texto || "")
    .split(/\n+/)
    .map(text => text.trim())
    .filter(Boolean)
    .map(text => new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 180, line: 360 },
      children: [new TextRun({ text, size: 24 })]
    }));

  const docxFile = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 720,
            right: 720,
            bottom: 720,
            left: 720
          }
        }
      },
      children: [
        headerTable,
        new Paragraph({ text: "", spacing: { after: 840 } }),
        infoTable,
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 360, after: 420 },
          children: [
            new TextRun({ text: "Reflexión #", bold: true, size: 24 }),
            lineRun(2)
          ]
        }),
        ...reflectionParagraphs
      ]
    }]
  });

  Packer.toBlob(docxFile).then(blob => {
    const safeName = reflexion.titulo.replace(/[\\/:*?"<>|]/g, "-");
    saveAs(blob, `${safeName}.docx`);
  });
}

window.exportarDatos = exportarDatos;
