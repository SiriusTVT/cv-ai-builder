const MODEL_STORAGE_KEY = "hf_model_selected";
const CANVA_TEMPLATE_STORAGE_KEY = "canva_template_id";
const CANVA_SESSION_STORAGE_KEY = "canva_session_id";
const MODEL_OPTIONS = [
  "auto",
  "google/gemma-2-2b-it:fastest",
  "openai/gpt-oss-20b:fastest",
  "openai/gpt-oss-120b:fastest",
  "Qwen/Qwen2.5-7B-Instruct-1M:fastest"
];
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function isLocalBackend() {
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function getGenerarCvApiUrl() {
  return isLocalBackend()
    ? "http://localhost:5000/api/generar-cv"
    : "/.netlify/functions/generar_cv";
}

function getCanvaApiUrl(path) {
  const base = isLocalBackend() ? "http://localhost:5000" : "";
  return `${base}${path}`;
}

function getSavedApiKey() {
  return localStorage.getItem("hf_api_key") || "";
}

function setSavedApiKey(apiKey) {
  localStorage.setItem("hf_api_key", apiKey);
  localStorage.removeItem("replicate_api_key");
  localStorage.removeItem("gemini_api_key");
}

function getSelectedModel() {
  const select = document.getElementById("modeloSalida");
  const value = select ? select.value : "auto";
  return MODEL_OPTIONS.includes(value) ? value : "auto";
}

function setSelectedModel(value) {
  const safeValue = MODEL_OPTIONS.includes(value) ? value : "auto";
  localStorage.setItem(MODEL_STORAGE_KEY, safeValue);
}

function getCanvaTemplateId() {
  return localStorage.getItem(CANVA_TEMPLATE_STORAGE_KEY) || "";
}

function setCanvaTemplateId(templateId) {
  localStorage.setItem(CANVA_TEMPLATE_STORAGE_KEY, String(templateId || "").trim());
}

function getCanvaSessionId() {
  return localStorage.getItem(CANVA_SESSION_STORAGE_KEY) || "";
}

function setCanvaSessionId(sessionId) {
  localStorage.setItem(CANVA_SESSION_STORAGE_KEY, String(sessionId || "").trim());
}

function clearCanvaSessionId() {
  localStorage.removeItem(CANVA_SESSION_STORAGE_KEY);
}

function cargarModeloGuardado() {
  const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
  const select = document.getElementById("modeloSalida");

  if (!select) {
    return;
  }

  if (savedModel && MODEL_OPTIONS.includes(savedModel)) {
    select.value = savedModel;
  } else {
    select.value = "auto";
    setSelectedModel("auto");
  }
}

function guardarModeloSeleccionado() {
  setSelectedModel(getSelectedModel());
}

function maskApiKey(apiKey) {
  if (!apiKey) {
    return "";
  }

  if (apiKey.length <= 10) {
    return `${apiKey.slice(0, 4)}***`;
  }

  return `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
}

function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  };

  return String(text || "").replace(/[&<>"']/g, function(char) {
    return map[char];
  });
}

function sanitizeHttpUrl(url) {
  const text = String(url || "").trim();
  if (!text) {
    return "";
  }

  try {
    const parsed = new URL(text);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch (error) {
    return "";
  }

  return "";
}

function setPreviewError(message) {
  const preview = document.getElementById("preview");
  preview.innerHTML = `<p style='color: red;'>${escapeHtml(message)}</p>`;
}

function renderPreview(texto, modelo, canvaInfo, warnings) {
  const preview = document.getElementById("preview");
  const modeloUsado = modelo
    ? `<p class="model-used">Modelo usado: ${escapeHtml(modelo)}</p>`
    : "";

  const warningList = Array.isArray(warnings) && warnings.length > 0
    ? `<div class="warning-box"><strong>Nota:</strong><ul>${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`
    : "";

  let canvaBlock = "";
  if (canvaInfo && typeof canvaInfo === "object") {
    const editUrl = sanitizeHttpUrl(canvaInfo.editUrl);
    const thumbUrl = sanitizeHttpUrl(canvaInfo.thumbnailUrl);
    const mappedFields = Array.isArray(canvaInfo.mappedFields) ? canvaInfo.mappedFields : [];

    canvaBlock = `
      <div class="canva-result">
        <h3>Diseno en Canva creado</h3>
        ${editUrl ? `<p><a href="${escapeHtml(editUrl)}" target="_blank" rel="noopener">Abrir diseno en Canva</a></p>` : ""}
        ${thumbUrl ? `<img src="${escapeHtml(thumbUrl)}" alt="Vista previa Canva" class="canva-thumb">` : ""}
        ${mappedFields.length ? `<p class="canva-fields">Campos mapeados: ${escapeHtml(mappedFields.join(", "))}</p>` : ""}
      </div>
    `;
  }

  preview.innerHTML = `
    <h2>Hoja de Vida Generada</h2>
    ${modeloUsado}
    ${warningList}
    ${canvaBlock}
    <div class="cv-output">${escapeHtml(texto || "").replace(/\n/g, "<br>")}</div>
  `;
}

async function readJsonResponse(response) {
  const responseText = await response.text();
  try {
    return {
      ok: response.ok,
      status: response.status,
      data: JSON.parse(responseText)
    };
  } catch (error) {
    return {
      ok: response.ok,
      status: response.status,
      data: null,
      parseError: true
    };
  }
}

function cargarAPIKeyGuardada() {
  const apiKey = getSavedApiKey();
  if (!apiKey) {
    return;
  }

  document.getElementById("apiStatus").innerHTML = "<p class='api-success'>API Key configurada</p>";
  document.getElementById("apiKey").value = maskApiKey(apiKey);
}

function cargarCanvaGuardado() {
  const template = getCanvaTemplateId();
  if (template) {
    const input = document.getElementById("canvaTemplateId");
    if (input) {
      input.value = template;
    }
  }
}

function guardarAPIKey() {
  const input = document.getElementById("apiKey");
  const apiKey = input.value.trim();
  const statusDiv = document.getElementById("apiStatus");
  const savedApiKey = getSavedApiKey();

  if (!apiKey) {
    statusDiv.innerHTML = "<p class='api-error'>Ingresa una API Key valida</p>";
    return;
  }

  if (!apiKey.includes("*") && !apiKey.startsWith("hf_")) {
    statusDiv.innerHTML = "<p class='api-error'>El token debe iniciar con hf_</p>";
    return;
  }

  if (apiKey.includes("*") && savedApiKey) {
    statusDiv.innerHTML = "<p class='api-success'>API Key ya configurada</p>";
    return;
  }

  setSavedApiKey(apiKey);
  statusDiv.innerHTML = "<p class='api-success'>Clave API guardada correctamente</p>";
  input.value = maskApiKey(apiKey);
}

function setCanvaStatus(message, type) {
  const statusDiv = document.getElementById("canvaStatus");
  const safeType = ["success", "error", "info"].includes(type) ? type : "info";
  statusDiv.innerHTML = `<p class="canva-${safeType}">${escapeHtml(message)}</p>`;
}

function guardarCanvaConfig() {
  const templateInput = document.getElementById("canvaTemplateId");
  const templateId = templateInput.value.trim();

  if (!templateId) {
    setCanvaStatus("Ingresa el Brand Template ID antes de guardar.", "error");
    return;
  }

  setCanvaTemplateId(templateId);
  setCanvaStatus("Configuracion de Canva guardada.", "success");
}

function processCanvaCallback() {
  const params = new URLSearchParams(window.location.search);
  const connected = params.get("canva_connected");
  const sessionId = params.get("canva_session_id");
  const callbackError = params.get("canva_error");

  let changed = false;

  if (connected === "1" && sessionId) {
    setCanvaSessionId(sessionId);
    setCanvaStatus("Canva conectado correctamente.", "success");
    changed = true;
  }

  if (callbackError) {
    clearCanvaSessionId();
    setCanvaStatus(`No se pudo conectar Canva: ${callbackError}`, "error");
    changed = true;
  }

  if (changed) {
    params.delete("canva_connected");
    params.delete("canva_session_id");
    params.delete("canva_error");

    const newQuery = params.toString();
    const cleanUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ""}${window.location.hash}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }
}

async function validateCanvaStatus() {
  const sessionId = getCanvaSessionId();
  const statusUrl = `${getCanvaApiUrl("/api/canva/status")}?sessionId=${encodeURIComponent(sessionId)}`;

  try {
    const response = await fetch(statusUrl);
    const result = await readJsonResponse(response);

    if (!result.ok || !result.data || !result.data.success) {
      setCanvaStatus("No se pudo validar estado de Canva en el backend.", "info");
      return;
    }

    if (!result.data.configured) {
      setCanvaStatus("Canva no esta configurado en el backend (faltan variables CANVA_*).", "error");
      return;
    }

    if (result.data.connected) {
      setCanvaStatus("Canva conectado y listo para generar disenos.", "success");
    } else {
      setCanvaStatus("Conecta Canva para enviar el CV a tu plantilla.", "info");
    }
  } catch (error) {
    setCanvaStatus("No se pudo conectar con el backend de Canva.", "error");
  }
}

async function conectarCanva() {
  const templateId = document.getElementById("canvaTemplateId").value.trim();
  if (!templateId) {
    setCanvaStatus("Primero guarda el Brand Template ID.", "error");
    return;
  }

  setCanvaTemplateId(templateId);
  const frontendUrl = `${window.location.origin}${window.location.pathname}`;
  const authUrl = `${getCanvaApiUrl("/api/canva/auth/start")}?frontend=${encodeURIComponent(frontendUrl)}`;
  window.location.assign(authUrl);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer la foto"));
    reader.readAsDataURL(file);
  });
}

async function readPhotoForCanva() {
  const input = document.getElementById("fotoPersona");
  const file = input && input.files ? input.files[0] : null;

  if (!file) {
    return { dataUrl: "", error: "Debes seleccionar una foto para Canva." };
  }

  if (!file.type.startsWith("image/")) {
    return { dataUrl: "", error: "La foto debe ser un archivo de imagen." };
  }

  if (file.size > MAX_PHOTO_BYTES) {
    return { dataUrl: "", error: "La foto supera el limite de 8 MB." };
  }

  try {
    const dataUrl = await fileToDataUrl(file);
    return { dataUrl, error: "" };
  } catch (error) {
    return { dataUrl: "", error: error.message || "No se pudo leer la foto" };
  }
}

async function generarCV() {
  const apiKey = getSavedApiKey();
  const inputLibre = document.getElementById("inputLibre").value.trim();
  const requestedModel = getSelectedModel();
  const preview = document.getElementById("preview");

  if (!apiKey) {
    setPreviewError("Primero guarda tu token de Hugging Face.");
    return;
  }

  if (!inputLibre) {
    setPreviewError("Escribe o pega informacion en el cuadro de texto.");
    return;
  }

  setSelectedModel(requestedModel);
  preview.innerHTML = "<p>Generando CV profesional...</p>";

  try {
    const response = await fetch(getGenerarCvApiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        apiKey,
        inputLibre,
        requestedModel
      })
    });

    const result = await readJsonResponse(response);
    if (result.parseError) {
      setPreviewError("La respuesta del servidor no es JSON valida.");
      return;
    }

    if (!result.ok || !result.data || !result.data.success) {
      setPreviewError(result.data?.error || "No se pudo generar el CV.");
      return;
    }

    renderPreview(result.data.texto || "", result.data.modelo || "", null, []);
  } catch (error) {
    setPreviewError(`Error de conexion: ${error.message}`);
  }
}

async function generarYEnviarCanva() {
  const apiKey = getSavedApiKey();
  const inputLibre = document.getElementById("inputLibre").value.trim();
  const requestedModel = getSelectedModel();
  const canvaTemplateId = document.getElementById("canvaTemplateId").value.trim();
  const canvaSessionId = getCanvaSessionId();
  const preview = document.getElementById("preview");

  if (!apiKey) {
    setPreviewError("Primero guarda tu token de Hugging Face.");
    return;
  }

  if (!inputLibre) {
    setPreviewError("Escribe o pega informacion en el cuadro de texto.");
    return;
  }

  if (!canvaTemplateId) {
    setCanvaStatus("Debes ingresar y guardar el Brand Template ID.", "error");
    return;
  }

  if (!canvaSessionId) {
    setCanvaStatus("Primero conecta Canva con el boton 'Conectar Canva'.", "error");
    return;
  }

  const photoResult = await readPhotoForCanva();
  if (photoResult.error) {
    setCanvaStatus(photoResult.error, "error");
    return;
  }

  setSelectedModel(requestedModel);
  setCanvaTemplateId(canvaTemplateId);
  setCanvaStatus("Enviando informacion a Canva...", "info");
  preview.innerHTML = "<p>Generando CV y creando diseno en Canva...</p>";

  try {
    const response = await fetch(getCanvaApiUrl("/api/generar-cv-canva"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        apiKey,
        inputLibre,
        requestedModel,
        canvaSessionId,
        canvaTemplateId,
        fotoDataUrl: photoResult.dataUrl
      })
    });

    const result = await readJsonResponse(response);
    if (result.parseError) {
      setPreviewError("La respuesta del servidor de Canva no es JSON valida.");
      return;
    }

    if (!result.ok || !result.data || !result.data.success) {
      if (result.status === 401) {
        clearCanvaSessionId();
      }
      const errorMsg = result.data?.error || "No se pudo crear el diseno en Canva.";
      setCanvaStatus(errorMsg, "error");
      setPreviewError(errorMsg);
      return;
    }

    const canvaInfo = result.data.canva || {};
    renderPreview(result.data.texto || "", result.data.modelo || "", canvaInfo, result.data.warnings || []);
    setCanvaStatus("Diseno creado en Canva correctamente.", "success");
  } catch (error) {
    const errorMessage = `Error de conexion con Canva: ${error.message}`;
    setCanvaStatus(errorMessage, "error");
    setPreviewError(errorMessage);
  }
}

function descargarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const preview = document.getElementById("preview");
  const cvOutput = preview.querySelector(".cv-output");
  const contenidoOriginal = cvOutput ? cvOutput.innerText : preview.innerText;
  const contenido = normalizarTextoParaPdf(contenidoOriginal);

  if (!contenido.trim()) {
    preview.innerHTML = "<p style='color: red;'>No hay contenido para exportar.</p>";
    return;
  }

  const margenX = 14;
  const margenY = 14;
  const anchoUtil = 210 - margenX * 2;
  const altoUtil = 297 - margenY;
  const interlineado = 6;
  let y = margenY;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Hoja de Vida", margenX, y);
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  const bloques = contenido.split("\n");
  for (const bloque of bloques) {
    const texto = bloque.trim();

    if (!texto) {
      y += interlineado * 0.6;
      if (y > altoUtil) {
        doc.addPage();
        y = margenY;
      }
      continue;
    }

    const esTitulo = /^([A-Z][A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+):$/.test(texto);
    doc.setFont("helvetica", esTitulo ? "bold" : "normal");

    const lineas = doc.splitTextToSize(texto, anchoUtil);
    for (const linea of lineas) {
      if (y > altoUtil) {
        doc.addPage();
        y = margenY;
      }

      doc.text(linea, margenX, y);
      y += interlineado;
    }
  }

  doc.save("CV_profesional.pdf");
}

function normalizarTextoParaPdf(texto) {
  let limpio = String(texto || "");

  limpio = limpio.normalize("NFKC");

  limpio = limpio
    .replace(/\*\*/g, "")
    .replace(/__+/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^>\s*/gm, "")
    .replace(/`/g, "");

  limpio = limpio
    .replace(/[•·●◦]/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[Ø=ÜÞç]/g, " ");

  limpio = limpio.replace(/\b(?:[A-Za-z0-9@./:+_-]\s+){3,}[A-Za-z0-9@./:+_-]\b/g, (match) => {
    return match.replace(/\s+/g, "");
  });

  limpio = limpio.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, " ");

  limpio = limpio
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((linea) => linea.trimEnd())
    .join("\n")
    .trim();

  return limpio;
}

window.addEventListener("DOMContentLoaded", function() {
  cargarAPIKeyGuardada();
  cargarModeloGuardado();
  cargarCanvaGuardado();
  processCanvaCallback();
  validateCanvaStatus();

  const modelSelect = document.getElementById("modeloSalida");
  if (modelSelect) {
    modelSelect.addEventListener("change", guardarModeloSeleccionado);
  }
});