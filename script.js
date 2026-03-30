const MODEL_STORAGE_KEY = "hf_model_selected";
const TEMPLATE_STORAGE_KEY = "cv_template_selected";
const FALLBACK_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' fill='%23cbd5e1'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' fill='%23334155' font-family='Arial' font-size='24'%3EFOTO%3C/text%3E%3C/svg%3E";
const MODEL_OPTIONS = [
  "auto",
  "google/gemma-2-2b-it:fastest",
  "openai/gpt-oss-20b:fastest",
  "openai/gpt-oss-120b:fastest",
  "Qwen/Qwen2.5-7B-Instruct-1M:fastest"
];
const TEMPLATE_OPTIONS = ["corporativo", "minimal", "creativo"];

let latestCvText = "";
let latestUsedModel = "";

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

function getSelectedTemplate() {
  const select = document.getElementById("plantillaSalida");
  const value = select ? select.value : "corporativo";
  return TEMPLATE_OPTIONS.includes(value) ? value : "corporativo";
}

function setSelectedTemplate(value) {
  const safeValue = TEMPLATE_OPTIONS.includes(value) ? value : "corporativo";
  localStorage.setItem(TEMPLATE_STORAGE_KEY, safeValue);
}

function cargarTemplateGuardado() {
  const savedTemplate = localStorage.getItem(TEMPLATE_STORAGE_KEY);
  const select = document.getElementById("plantillaSalida");

  if (!select) {
    return;
  }

  if (savedTemplate && TEMPLATE_OPTIONS.includes(savedTemplate)) {
    select.value = savedTemplate;
  } else {
    select.value = "corporativo";
    setSelectedTemplate("corporativo");
  }
}

function guardarTemplateSeleccionada() {
  setSelectedTemplate(getSelectedTemplate());
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

  return text.replace(/[&<>"']/g, function(char) {
    return map[char];
  });
}

function stripMarkdownDecorators(line) {
  return String(line || "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

function isSectionHeading(line) {
  const clean = stripMarkdownDecorators(line);

  if (!clean) {
    return false;
  }

  return /^([A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ][A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ()/&.,\-\s]{2,}):$/.test(clean)
    || /^[A-ZÁÉÍÓÚÜÑ0-9][A-ZÁÉÍÓÚÜÑ0-9\s]{3,}$/.test(clean);
}

function cleanLineForDisplay(line, maxLength) {
  let output = stripMarkdownDecorators(line)
    .replace(/^[-*•]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (output.endsWith(":")) {
    output = output.slice(0, -1).trim();
  }

  if (maxLength && output.length > maxLength) {
    return `${output.slice(0, maxLength - 1).trim()}...`;
  }

  return output;
}

function getTemplateLabel(templateValue) {
  if (templateValue === "minimal") {
    return "Minimal centrado";
  }

  if (templateValue === "creativo") {
    return "Creativo en tarjetas";
  }

  return "Corporativo (sidebar)";
}

function getImageInputValue() {
  const input = document.getElementById("imageUrl");
  return input ? input.value.trim() : "";
}

function sanitizeImageUrl(value) {
  const candidate = String(value || "").trim();

  if (!candidate) {
    return FALLBACK_AVATAR;
  }

  try {
    const parsed = new URL(candidate, window.location.origin);
    const protocol = parsed.protocol.toLowerCase();

    if (protocol === "http:" || protocol === "https:" || protocol === "data:") {
      return parsed.href;
    }
  } catch (error) {
    return FALLBACK_AVATAR;
  }

  return FALLBACK_AVATAR;
}

function getNonEmptyLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line));
}

function getProfileData(rawText) {
  const candidates = getNonEmptyLines(rawText)
    .map((line) => stripMarkdownDecorators(line))
    .filter((line) => line && !isSectionHeading(line) && !/^[-*•]\s+/.test(line));

  const name = cleanLineForDisplay(candidates[0] || "Tu Nombre", 60) || "Tu Nombre";
  const headline = cleanLineForDisplay(candidates[1] || "Perfil Profesional", 90) || "Perfil Profesional";

  const summarySource = candidates.find((line) => line.length >= 30) || "Perfil orientado a resultados, con enfoque en impacto y mejora continua.";
  const summary = cleanLineForDisplay(summarySource, 180) || "Perfil orientado a resultados, con enfoque en impacto y mejora continua.";

  return {
    name,
    headline,
    summary
  };
}

function formatCvContentToHtml(rawText) {
  const lines = String(rawText || "").split(/\r?\n/);
  const htmlParts = [];
  let sectionOpen = false;
  let listOpen = false;

  function closeList() {
    if (listOpen) {
      htmlParts.push("</ul>");
      listOpen = false;
    }
  }

  function closeSection() {
    closeList();
    if (sectionOpen) {
      htmlParts.push("</section>");
      sectionOpen = false;
    }
  }

  function openSection(title) {
    closeSection();
    htmlParts.push("<section>");
    sectionOpen = true;

    if (title) {
      htmlParts.push(`<h3>${escapeHtml(title)}</h3>`);
    }
  }

  for (const rawLine of lines) {
    const strippedLine = stripMarkdownDecorators(rawLine);

    if (!strippedLine) {
      closeList();
      continue;
    }

    if (isSectionHeading(strippedLine)) {
      const heading = cleanLineForDisplay(strippedLine, 80);
      openSection(heading);
      continue;
    }

    if (!sectionOpen) {
      openSection("");
    }

    const bulletMatch = strippedLine.match(/^[-*•]\s+(.+)/);
    if (bulletMatch) {
      if (!listOpen) {
        htmlParts.push("<ul>");
        listOpen = true;
      }

      htmlParts.push(`<li>${escapeHtml(cleanLineForDisplay(bulletMatch[1], 420))}</li>`);
      continue;
    }

    closeList();
    htmlParts.push(`<p>${escapeHtml(cleanLineForDisplay(strippedLine, 620))}</p>`);
  }

  closeSection();

  if (!htmlParts.length) {
    return "<section><p>No hay contenido para mostrar aun.</p></section>";
  }

  return htmlParts.join("");
}

function buildTemplateMarkup(rawText, modelUsed) {
  const selectedTemplate = getSelectedTemplate();
  const imageUrl = sanitizeImageUrl(getImageInputValue());
  const profile = getProfileData(rawText);
  const contentHtml = formatCvContentToHtml(rawText);
  const modelBadge = modelUsed
    ? `<span class="tpl-model">Modelo usado: ${escapeHtml(modelUsed)}</span>`
    : "";

  if (selectedTemplate === "minimal") {
    return `
      <article class="cv-template template-minimal">
        <header class="tpl-hero">
          <img class="tpl-photo" src="${escapeHtml(imageUrl)}" alt="Foto de perfil">
          <h2 class="tpl-name">${escapeHtml(profile.name)}</h2>
          <p class="tpl-headline">${escapeHtml(profile.headline)}</p>
          ${modelBadge}
        </header>
        <div class="tpl-content cv-output">
          ${contentHtml}
        </div>
      </article>
    `;
  }

  if (selectedTemplate === "creativo") {
    return `
      <article class="cv-template template-creativo">
        <header class="tpl-banner">
          <img class="tpl-photo-square" src="${escapeHtml(imageUrl)}" alt="Foto de perfil">
          <div>
            <h2 class="tpl-name">${escapeHtml(profile.name)}</h2>
            <p class="tpl-headline">${escapeHtml(profile.headline)}</p>
            <p class="tpl-summary">${escapeHtml(profile.summary)}</p>
            ${modelBadge}
          </div>
        </header>
        <div class="tpl-content cv-output">
          ${contentHtml}
        </div>
      </article>
    `;
  }

  return `
    <article class="cv-template template-corporativo">
      <aside class="tpl-sidebar">
        <img class="tpl-photo" src="${escapeHtml(imageUrl)}" alt="Foto de perfil">
        <h2 class="tpl-name">${escapeHtml(profile.name)}</h2>
        <p class="tpl-headline">${escapeHtml(profile.headline)}</p>
        <p class="tpl-summary">${escapeHtml(profile.summary)}</p>
      </aside>
      <section class="tpl-main">
        <header class="tpl-main-header">
          <h3>Curriculum Vitae</h3>
          ${modelBadge}
        </header>
        <div class="tpl-content cv-output">
          ${contentHtml}
        </div>
      </section>
    </article>
  `;
}

function renderEmptyPreview() {
  const preview = document.getElementById("preview");

  if (!preview) {
    return;
  }

  preview.innerHTML = `
    <div class="preview-empty">
      <h2>Tu hoja de vida aparecera aqui</h2>
      <p>Plantilla activa: ${escapeHtml(getTemplateLabel(getSelectedTemplate()))}</p>
      <p>Escribe tu informacion y pulsa "Generar con IA" para ver el resultado.</p>
    </div>
  `;
}

function renderPreviewWithTemplate() {
  const preview = document.getElementById("preview");

  if (!preview) {
    return;
  }

  if (!latestCvText.trim()) {
    renderEmptyPreview();
    return;
  }

  preview.innerHTML = buildTemplateMarkup(latestCvText, latestUsedModel);
}

function cargarAPIKeyGuardada() {
  const apiKey = getSavedApiKey();
  if (!apiKey) {
    return;
  }

  document.getElementById("apiStatus").innerHTML = "<p class='api-success'>API Key configurada</p>";
  document.getElementById("apiKey").value = maskApiKey(apiKey);
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

async function generarCV() {
  const apiKey = getSavedApiKey();
  const inputLibre = document.getElementById("inputLibre").value.trim();
  const requestedModel = getSelectedModel();
  const preview = document.getElementById("preview");

  if (!apiKey) {
    preview.innerHTML = "<p style='color: red;'>Primero guarda tu token de Hugging Face.</p>";
    return;
  }

  if (!inputLibre) {
    preview.innerHTML = "<p style='color: red;'>Escribe o pega informacion en el cuadro de texto.</p>";
    return;
  }

  setSelectedModel(requestedModel);
  preview.innerHTML = "<p>Generando CV profesional...</p>";

  try {
    const apiUrl = window.location.hostname === "localhost"
      ? "http://localhost:5000/api/generar-cv"
      : "/.netlify/functions/generar_cv";

    const response = await fetch(apiUrl, {
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

    const responseText = await response.text();
    let data;

    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      preview.innerHTML = "<p style='color: red;'>Error: la respuesta del servidor no es JSON valida.</p>";
      return;
    }

    if (!response.ok || !data.success) {
      preview.innerHTML = `<p style='color: red;'>Error: ${escapeHtml(data.error || "No se pudo generar el CV")}</p>`;
      return;
    }

    latestCvText = String(data.texto || "").trim();
    latestUsedModel = String(data.modelo || requestedModel || "");

    if (!latestCvText) {
      preview.innerHTML = "<p style='color: red;'>No se recibio contenido para el CV.</p>";
      return;
    }

    renderPreviewWithTemplate();
  } catch (error) {
    preview.innerHTML = `<p style='color: red;'>Error de conexion: ${escapeHtml(error.message)}</p>`;
  }
}

function descargarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const preview = document.getElementById("preview");
  const cvOutput = preview ? preview.querySelector(".cv-output") : null;
  const contenidoOriginal = latestCvText || (cvOutput ? cvOutput.innerText : (preview ? preview.innerText : ""));
  const contenido = normalizarTextoParaPdf(contenidoOriginal);

  if (!contenido.trim()) {
    if (preview) {
      preview.innerHTML = "<p style='color: red;'>No hay contenido para exportar.</p>";
    }
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

  // Normaliza caracteres Unicode compuestos
  limpio = limpio.normalize("NFKC");

  // Elimina formato Markdown común
  limpio = limpio
    .replace(/\*\*/g, "")
    .replace(/__+/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^>\s*/gm, "")
    .replace(/`/g, "");

  // Reemplaza símbolos problemáticos por equivalentes seguros
  limpio = limpio
    .replace(/[•·●◦]/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[Ø=ÜÞç]/g, " ");

  // Corrige palabras que vienen letra por letra con espacios
  limpio = limpio.replace(/\b(?:[A-Za-z0-9@./:+_-]\s+){3,}[A-Za-z0-9@./:+_-]\b/g, (match) => {
    return match.replace(/\s+/g, "");
  });

  // Quita caracteres no imprimibles fuera de rango latino básico
  limpio = limpio.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, " ");

  // Normaliza espacios y saltos
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
  cargarTemplateGuardado();
  renderEmptyPreview();

  const modelSelect = document.getElementById("modeloSalida");
  if (modelSelect) {
    modelSelect.addEventListener("change", guardarModeloSeleccionado);
  }

  const templateSelect = document.getElementById("plantillaSalida");
  if (templateSelect) {
    templateSelect.addEventListener("change", function() {
      guardarTemplateSeleccionada();
      renderPreviewWithTemplate();
    });
  }

  const imageInput = document.getElementById("imageUrl");
  if (imageInput) {
    imageInput.addEventListener("input", function() {
      if (latestCvText) {
        renderPreviewWithTemplate();
      }
    });
  }
});