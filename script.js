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
const TEMPLATE_OPTIONS = ["corporativo", "minimal", "creativo", "ejecutivo", "moderno", "academico"];
const KNOWN_SECTION_DEFINITIONS = [
  { id: "name", title: "Name", aliases: ["name", "nombre", "nombre completo"] },
  { id: "age", title: "Age", aliases: ["age", "edad"] },
  { id: "professional-title", title: "Professional title", aliases: ["professional title", "titulo profesional", "cargo", "profesion", "titulo"] },
  { id: "professional-summary", title: "Professional summary", aliases: ["professional summary", "perfil profesional", "resumen"] },
  { id: "core-strengths", title: "Core strengths", aliases: ["core strengths", "fortalezas", "strengths"] },
  { id: "work-experience", title: "Work experience", aliases: ["work experience", "experiencia laboral", "experiencia"] },
  { id: "projects", title: "Projects", aliases: ["projects", "proyectos"] },
  { id: "education", title: "Education", aliases: ["education", "educacion", "formacion academica"] },
  { id: "technical-skills", title: "Technical skills", aliases: ["technical skills", "habilidades tecnicas", "skills", "habilidades"] },
  { id: "courses-certifications", title: "Courses and certifications", aliases: ["courses and certifications", "courses", "cursos", "certifications", "certificaciones"] },
  { id: "languages", title: "Languages", aliases: ["languages", "idiomas", "lenguajes"] },
  { id: "contact", title: "Contact", aliases: ["contact", "contacto"] },
  { id: "time-availability", title: "Time availability", aliases: ["time availability", "availability", "disponibilidad"] }
];
const KNOWN_SECTION_ORDER = KNOWN_SECTION_DEFINITIONS.map(function(section) {
  return section.id;
});
const UNSPECIFIED_PLACEHOLDER_PATTERNS = [
  /\bno especificado por el candidato\b/gi,
  /\bno especificado\b/gi,
  /\bnot specified by the candidate\b/gi,
  /\bnot specified\b/gi
];
const SECTION_READABLE_FALLBACKS = {
  "name": "Candidato profesional",
  "age": "Edad no publica",
  "professional-title": "Profesional orientado a resultados",
  "professional-summary": "Perfil con enfoque en logro de objetivos, aprendizaje continuo y adaptacion a entornos dinamicos.",
  "core-strengths": "Pensamiento analitico, trabajo colaborativo y resolucion estructurada de problemas.",
  "work-experience": "Experiencia en ejecucion de tareas clave, colaboracion con equipos y mejora continua de procesos.",
  "projects": "Participacion en proyectos con enfoque en resultados medibles y entrega de valor.",
  "education": "Formacion academica alineada con el desarrollo profesional.",
  "technical-skills": "Manejo de herramientas digitales, analitica de datos y tecnologias orientadas a productividad.",
  "courses-certifications": "Formacion complementaria y actualizacion profesional continua.",
  "languages": "Comunicacion profesional en espanol y lectura tecnica en ingles.",
  "contact": "Contacto profesional disponible bajo solicitud.",
  "time-availability": "Disponibilidad sujeta a acuerdo.",
  "default": "Informacion complementaria disponible bajo solicitud."
};

let latestCvText = "";
let latestUsedModel = "";
let selectedImageDataUrl = "";
let latestUserInputText = "";

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

function sanitizeDisplayLine(line) {
  return stripMarkdownDecorators(line)
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSectionTitle(line) {
  const output = sanitizeDisplayLine(line);
  if (output.endsWith(":")) {
    return output.slice(0, -1).trim();
  }

  return output;
}

function isSectionHeading(line) {
  const raw = String(line || "").trim();
  const clean = sanitizeDisplayLine(raw);

  if (!clean) {
    return false;
  }

  if (/^#{1,6}\s+/.test(raw)) {
    return true;
  }

  const uppercaseHeading = /^[A-ZÁÉÍÓÚÜÑ0-9][A-ZÁÉÍÓÚÜÑ0-9\s]{2,}$/.test(clean) && clean.length <= 80;
  if (uppercaseHeading) {
    return true;
  }

  const endsWithColon = clean.endsWith(":");
  if (!endsWithColon || clean.length > 80) {
    return false;
  }

  const withoutColon = clean.slice(0, -1).trim();
  const words = withoutColon.split(/\s+/).filter(Boolean);
  if (words.length > 7) {
    return false;
  }

  return !/[,.!?]/.test(withoutColon);
}

function parseKeyValueLine(line) {
  const normalized = sanitizeDisplayLine(line);
  const match = normalized.match(/^([^:]{1,40}):\s+(.+)$/);

  if (!match) {
    return null;
  }

  return {
    key: match[1].trim(),
    value: match[2].trim()
  };
}

function normalizeFieldKey(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getReadableSectionFallback(sectionId) {
  const normalizedId = String(sectionId || "").trim();
  return SECTION_READABLE_FALLBACKS[normalizedId] || SECTION_READABLE_FALLBACKS.default;
}

function isUnspecifiedPlaceholderValue(text) {
  const candidate = normalizeFieldKey(String(text || "").replace(/[.]+$/, "").trim());

  if (!candidate) {
    return true;
  }

  const compact = candidate.replace(/\s+/g, " ");
  return compact === "no especificado por el candidato"
    || compact === "no especificado"
    || compact === "not specified by the candidate"
    || compact === "not specified"
    || compact === "n/a"
    || compact === "na"
    || compact === "pendiente";
}

function ensureReadableValue(text, sectionId) {
  let output = sanitizeDisplayLine(text);

  if (!output || isUnspecifiedPlaceholderValue(output)) {
    return getReadableSectionFallback(sectionId);
  }

  for (const pattern of UNSPECIFIED_PLACEHOLDER_PATTERNS) {
    if (pattern.test(output)) {
      output = output.replace(pattern, getReadableSectionFallback(sectionId));
    }
    pattern.lastIndex = 0;
  }

  output = output.replace(/\s{2,}/g, " ").trim();

  if (!output || isUnspecifiedPlaceholderValue(output)) {
    return getReadableSectionFallback(sectionId);
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

  if (templateValue === "ejecutivo") {
    return "Ejecutivo premium";
  }

  if (templateValue === "moderno") {
    return "Moderno editorial";
  }

  if (templateValue === "academico") {
    return "Academico formal";
  }

  return "Corporativo (sidebar)";
}

function setImageStatus(message, isError) {
  const statusEl = document.getElementById("imageStatus");

  if (!statusEl) {
    return;
  }

  statusEl.textContent = message || "";
  statusEl.classList.remove("api-error", "api-success");

  if (!message) {
    return;
  }

  statusEl.classList.add(isError ? "api-error" : "api-success");
}

function getSelectedImageSource() {
  return selectedImageDataUrl || FALLBACK_AVATAR;
}

function handleImageFileSelection(event) {
  const fileInput = event && event.target ? event.target : null;
  const file = fileInput && fileInput.files ? fileInput.files[0] : null;

  if (!file) {
    selectedImageDataUrl = "";
    setImageStatus("", false);

    if (latestCvText) {
      renderPreviewWithTemplate();
    }

    return;
  }

  if (!file.type || !file.type.startsWith("image/")) {
    selectedImageDataUrl = "";
    if (fileInput) {
      fileInput.value = "";
    }

    setImageStatus("Selecciona un archivo de imagen valido (JPG, PNG, WEBP, etc.).", true);

    if (latestCvText) {
      renderPreviewWithTemplate();
    }

    return;
  }

  const reader = new FileReader();
  reader.onload = function(loadEvent) {
    const result = loadEvent && loadEvent.target ? loadEvent.target.result : "";
    selectedImageDataUrl = typeof result === "string" ? result : "";
    setImageStatus(`Foto cargada: ${file.name}`, false);

    if (latestCvText) {
      renderPreviewWithTemplate();
    }
  };

  reader.onerror = function() {
    selectedImageDataUrl = "";
    setImageStatus("No se pudo leer la imagen seleccionada.", true);

    if (fileInput) {
      fileInput.value = "";
    }

    if (latestCvText) {
      renderPreviewWithTemplate();
    }
  };

  reader.readAsDataURL(file);
}

function getNonEmptyLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line));
}

function resolveKnownSectionDefinition(text) {
  const normalized = normalizeFieldKey(cleanSectionTitle(text));

  if (!normalized) {
    return null;
  }

  for (const sectionDef of KNOWN_SECTION_DEFINITIONS) {
    if (sectionDef.aliases.some((alias) => normalized === alias || normalized.includes(alias))) {
      return sectionDef;
    }
  }

  return null;
}

function sectionLinesToPlainLines(section) {
  if (!section || !Array.isArray(section.lines)) {
    return [];
  }

  const output = [];
  for (const lineItem of section.lines) {
    if (!lineItem) {
      continue;
    }

    if (lineItem.type === "kv") {
      output.push(`${lineItem.key}: ${ensureReadableValue(lineItem.value, section.id)}`);
      continue;
    }

    output.push(ensureReadableValue(lineItem.text || "", section.id));
  }

  return output.map((line) => sanitizeDisplayLine(line)).filter(Boolean);
}

function buildStructuredSections(rawText) {
  const lines = String(rawText || "").split(/\r?\n/);
  const knownSectionsById = new Map();
  const extraSections = [];
  let currentSection = null;

  const summaryDef = KNOWN_SECTION_DEFINITIONS.find((section) => section.id === "professional-summary");

  function ensureKnownSection(sectionDef) {
    if (!sectionDef) {
      return null;
    }

    if (knownSectionsById.has(sectionDef.id)) {
      return knownSectionsById.get(sectionDef.id);
    }

    const section = {
      id: sectionDef.id,
      title: sectionDef.title,
      lines: []
    };

    knownSectionsById.set(sectionDef.id, section);
    return section;
  }

  function ensureExtraSection(title) {
    const cleanTitle = cleanSectionTitle(title || "") || "Informacion profesional";
    const normalizedTitle = normalizeFieldKey(cleanTitle);

    const existing = extraSections.find((section) => normalizeFieldKey(section.title) === normalizedTitle);
    if (existing) {
      return existing;
    }

    const newSection = {
      id: `extra-${extraSections.length + 1}`,
      title: cleanTitle,
      lines: []
    };

    extraSections.push(newSection);
    return newSection;
  }

  function openSectionFromHeading(title) {
    const known = resolveKnownSectionDefinition(title);
    if (known) {
      currentSection = ensureKnownSection(known);
      return;
    }

    currentSection = ensureExtraSection(title);
  }

  function ensureDefaultSection() {
    if (!currentSection) {
      currentSection = ensureKnownSection(summaryDef) || ensureExtraSection("Informacion profesional");
    }
  }

  for (const rawLine of lines) {
    const trimmedRaw = String(rawLine || "").trim();

    if (!trimmedRaw) {
      continue;
    }

    const markdownHeading = trimmedRaw.match(/^#{1,6}\s+(.+)/);
    if (markdownHeading) {
      openSectionFromHeading(markdownHeading[1]);
      continue;
    }

    const keyValue = parseKeyValueLine(trimmedRaw);
    const onlyHeadingWithColon = /:\s*$/.test(trimmedRaw) && !keyValue;

    if (onlyHeadingWithColon || (isSectionHeading(trimmedRaw) && !keyValue)) {
      openSectionFromHeading(trimmedRaw);
      continue;
    }

    if (keyValue) {
      const knownKeyValueSection = resolveKnownSectionDefinition(keyValue.key);
      if (knownKeyValueSection) {
        currentSection = ensureKnownSection(knownKeyValueSection);
        currentSection.lines.push({
          type: "text",
          text: ensureReadableValue(keyValue.value, currentSection.id)
        });
        continue;
      }
    }

    ensureDefaultSection();

    const bulletMatch = trimmedRaw.match(/^[-*•]\s+(.+)/);
    if (bulletMatch) {
      currentSection.lines.push({
        type: "bullet",
        text: ensureReadableValue(bulletMatch[1], currentSection.id)
      });
      continue;
    }

    if (keyValue) {
      currentSection.lines.push({
        type: "kv",
        key: sanitizeDisplayLine(keyValue.key),
        value: ensureReadableValue(keyValue.value, currentSection.id)
      });
      continue;
    }

    currentSection.lines.push({
      type: "text",
      text: ensureReadableValue(trimmedRaw, currentSection.id)
    });
  }

  const orderedSections = [];
  for (const sectionId of KNOWN_SECTION_ORDER) {
    const section = knownSectionsById.get(sectionId);
    if (section && section.lines.length) {
      orderedSections.push(section);
    }
  }

  for (const section of extraSections) {
    if (section.lines.length) {
      orderedSections.push(section);
    }
  }

  return orderedSections;
}

function sectionHasRealContent(section) {
  if (!section || !Array.isArray(section.lines)) {
    return false;
  }

  return section.lines.some((lineItem) => {
    if (!lineItem) {
      return false;
    }

    if (lineItem.type === "kv") {
      return Boolean(sanitizeDisplayLine(lineItem.value));
    }

    return Boolean(sanitizeDisplayLine(lineItem.text));
  });
}

function hasAnyKeyword(text, keywords) {
  const normalized = normalizeFieldKey(text);
  return keywords.some((keyword) => normalized.includes(normalizeFieldKey(keyword)));
}

function extractNameHintFromInput(text) {
  const match = String(text || "").match(/^\s*([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúñ]+){1,4})/);
  return match ? sanitizeDisplayLine(match[1]) : "";
}

function extractContactHintsFromInput(text) {
  const raw = String(text || "");
  const emails = uniqueFirst(raw.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [], 2);
  const phones = uniqueFirst(raw.match(/(?:\+?\d[\d\s\-()]{7,}\d)/g) || [], 2);
  return { emails, phones };
}

function extractLocationHintFromInput(text) {
  const lowered = normalizeFieldKey(text);

  if (lowered.includes("cali") && lowered.includes("colombia")) {
    return "Cali, Colombia";
  }

  const hits = ["cali", "bogota", "medellin", "colombia", "mexico", "peru", "chile", "argentina", "ecuador", "espana"];
  const city = hits.find((item) => lowered.includes(item));
  if (!city) {
    return "";
  }

  return `${city.charAt(0).toUpperCase()}${city.slice(1)}`;
}

function extractAvailabilityHintFromInput(text) {
  const lowered = normalizeFieldKey(text);
  const fullTime = lowered.includes("tiempo completo") || lowered.includes("full time") || lowered.includes("full-time");
  const partTime = lowered.includes("medio tiempo") || lowered.includes("part time") || lowered.includes("part-time");
  const remote = lowered.includes("remoto") || lowered.includes("remote") || lowered.includes("hibrido") || lowered.includes("hybrid");

  if (fullTime) {
    return `Disponible para jornada completa${remote ? " y trabajo remoto/hibrido" : ""}`;
  }

  if (partTime) {
    return `Disponible para jornada parcial${remote ? " y trabajo remoto/hibrido" : ""}`;
  }

  if (remote) {
    return "Abierto a trabajo remoto/hibrido";
  }

  return "Disponibilidad sujeta a acuerdo";
}

function formatHintLines(label, values) {
  if (!values || !values.length) {
    return `- ${label}: Sin dato explicito`;
  }

  return values.map((value) => `- ${label}: ${value}`).join("\n");
}

function buildDetectedDataPreviewFromInput(inputText) {
  const raw = String(inputText || "").trim();
  if (!raw) {
    return "Escribe tu informacion para ver como se estructura antes de generar.";
  }

  const fragments = splitRawFragments(raw);
  const nameHint = extractNameHintFromInput(raw);
  const locationHint = extractLocationHintFromInput(raw);
  const availabilityHint = extractAvailabilityHintFromInput(raw);
  const contact = extractContactHintsFromInput(raw);

  const educationHints = extractFragmentsByKeywords(
    fragments,
    ["universidad", "colegio", "semestre", "ingenier", "educacion", "formacion", "bachiller", "pregrado", "maestr"],
    4
  );
  const experienceHints = extractFragmentsByKeywords(
    fragments,
    ["experiencia", "trabaj", "aprendiz", "practic", "manager", "empresa", "cargo", "rol", "desde", "actualmente"],
    5
  );
  const projectHints = extractFragmentsByKeywords(
    fragments,
    ["proyecto", "project", "automatizacion", "produccion", "transformacion", "implement"],
    4
  );
  const skillHints = extractFragmentsByKeywords(
    fragments,
    ["python", "sql", "power bi", "excel", "react", "node", "api", "postgres", "mysql", "mongodb", "firebase", "docker", "git", "ci/cd", "pandas", "numpy", "habilidad", "skills"],
    7
  );
  const languageHints = extractFragmentsByKeywords(
    fragments,
    ["ingles", "english", "bilingue", "idioma", "languages", "lenguaje"],
    3
  );

  return [
    "DATOS ESTRUCTURADOS DETECTADOS (vista previa):",
    `- Name hint: ${nameHint || "Sin dato explicito"}`,
    `- Location hint: ${locationHint || "Sin dato explicito"}`,
    `- Availability hint: ${availabilityHint}`,
    formatHintLines("Email hint", contact.emails),
    formatHintLines("Phone hint", contact.phones),
    formatHintLines("Education hint", educationHints),
    formatHintLines("Work experience hint", experienceHints),
    formatHintLines("Projects hint", projectHints),
    formatHintLines("Technical skills hint", skillHints),
    formatHintLines("Languages hint", languageHints)
  ].join("\n");
}

function renderDetectedDataPreview(inputText) {
  const previewEl = document.getElementById("detectedDataPreview");
  if (!previewEl) {
    return;
  }

  previewEl.textContent = buildDetectedDataPreviewFromInput(inputText);
}

function splitRawFragments(text) {
  return String(text || "")
    .split(/[\n\r.;]+/)
    .map((part) => sanitizeDisplayLine(part))
    .filter(Boolean);
}

function uniqueFirst(items, maxItems) {
  const output = [];
  const seen = new Set();

  for (const item of items) {
    const clean = sanitizeDisplayLine(item);
    if (!clean) {
      continue;
    }

    const key = clean.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(clean);

    if (output.length >= maxItems) {
      break;
    }
  }

  return output;
}

function extractFragmentsByKeywords(fragments, keywords, maxItems) {
  const matched = fragments.filter((fragment) => {
    const lowered = normalizeFieldKey(fragment);
    return keywords.some((keyword) => lowered.includes(normalizeFieldKey(keyword)));
  });

  return uniqueFirst(matched, maxItems);
}

function inferProfileContextFromSections(sections, sourceText) {
  const sectionMap = new Map((sections || []).map((section) => [section.id, section]));

  const name = sectionLinesToPlainLines(sectionMap.get("name"))[0] || "";
  const age = sectionLinesToPlainLines(sectionMap.get("age"))[0] || "";
  const title = sectionLinesToPlainLines(sectionMap.get("professional-title"))[0] || "";
  const summary = sectionLinesToPlainLines(sectionMap.get("professional-summary")).slice(0, 3).join(" ") || "";

  const allLines = (sections || []).flatMap((section) => sectionLinesToPlainLines(section));
  const allText = `${allLines.join(" ")} ${String(sourceText || "")}`.trim();
  const normalizedText = normalizeFieldKey(allText);
  const sourceFragments = splitRawFragments(sourceText);

  let location = "";
  const locationMatch = normalizedText.match(/\b(cali|bogota|medellin|colombia|mexico|peru|chile|argentina|ecuador|espana)\b/);
  if (locationMatch) {
    location = locationMatch[1].charAt(0).toUpperCase() + locationMatch[1].slice(1);
  }

  let availability = "Disponibilidad sujeta a acuerdo.";
  if (hasAnyKeyword(normalizedText, ["tiempo completo", "full time", "full-time", "jornada completa"])) {
    availability = "Disponible para jornada completa";
  } else if (hasAnyKeyword(normalizedText, ["medio tiempo", "part time", "part-time"])) {
    availability = "Disponible para jornada parcial";
  }

  if (hasAnyKeyword(normalizedText, ["remoto", "remote", "hibrido", "hybrid"])) {
    availability += " y modalidades remotas/hibridas";
  }

  let languageLine = "Comunicacion profesional en espanol y lectura tecnica en ingles.";
  if (hasAnyKeyword(normalizedText, ["ingles", "english", "bilingue", "bilingual"])) {
    languageLine = "Nivel de ingles funcional para comunicacion profesional y documentacion tecnica.";
  }

  const skillCatalog = [
    { label: "Python y analitica de datos (Pandas, NumPy)", keywords: ["python", "pandas", "numpy", "analisis de datos", "data"] },
    { label: "SQL y modelado de datos", keywords: ["sql", "modelado", "mysql", "postgres"] },
    { label: "Visualizacion y BI (Power BI, Excel)", keywords: ["power bi", "excel", "bi"] },
    { label: "Desarrollo web full-stack (React, Node.js)", keywords: ["react", "node", "node.js", "full-stack", "frontend", "backend"] },
    { label: "APIs REST e integraciones", keywords: ["api", "rest", "integracion"] },
    { label: "Bases de datos relacionales y NoSQL", keywords: ["mongodb", "firebase", "postgres", "mysql", "nosql"] },
    { label: "Herramientas DevOps (Docker, Git, CI/CD)", keywords: ["docker", "git", "ci/cd", "devops"] }
  ];

  const detectedSkills = skillCatalog
    .filter((item) => item.keywords.some((keyword) => normalizedText.includes(normalizeFieldKey(keyword))))
    .map((item) => item.label);

  const educationHints = extractFragmentsByKeywords(
    sourceFragments,
    ["universidad", "colegio", "semestre", "ingenier", "educacion", "formacion", "bachiller", "pregrado", "maestr"],
    4
  );
  const experienceHints = extractFragmentsByKeywords(
    sourceFragments,
    ["experiencia", "trabaj", "aprendiz", "manager", "project manager", "empresa", "cargo", "rol", "desde", "actualmente"],
    5
  );
  const projectHints = extractFragmentsByKeywords(
    sourceFragments,
    ["proyecto", "project", "automatizacion", "produccion", "transformacion", "implement"],
    4
  );
  const languageHints = extractFragmentsByKeywords(
    sourceFragments,
    ["ingles", "english", "bilingue", "idioma", "languages", "lenguaje"],
    3
  );

  return {
    name,
    age,
    title,
    summary,
    location,
    availability,
    languageLine,
    skillBullets: detectedSkills,
    educationHints,
    experienceHints,
    projectHints,
    languageHints
  };
}

function buildSectionFallbackLines(sectionId, context) {
  const ctx = context || {};

  if (sectionId === "name") {
    return [{ type: "text", text: ctx.name || "Candidato profesional" }];
  }

  if (sectionId === "age") {
    return [{ type: "text", text: ctx.age || "Edad no publica" }];
  }

  if (sectionId === "professional-title") {
    return [{ type: "text", text: ctx.title || "Profesional en desarrollo con enfoque en resultados" }];
  }

  if (sectionId === "professional-summary") {
    return [{
      type: "text",
      text: ctx.summary || "Perfil analitico, orientado a objetivos y mejora continua, con capacidad de adaptacion en entornos dinamicos."
    }];
  }

  if (sectionId === "core-strengths") {
    return [
      { type: "bullet", text: "Pensamiento analitico y resolucion estructurada de problemas." },
      { type: "bullet", text: "Comunicacion efectiva y colaboracion con equipos multidisciplinarios." },
      { type: "bullet", text: "Adaptacion rapida a nuevas herramientas, procesos y retos." }
    ];
  }

  if (sectionId === "work-experience") {
    if (ctx.experienceHints && ctx.experienceHints.length) {
      return ctx.experienceHints.map((item) => ({ type: "bullet", text: item }));
    }

    return [
      { type: "bullet", text: "Participacion en actividades operativas y tecnicas con enfoque en cumplimiento de objetivos." },
      { type: "bullet", text: "Apoyo en mejoras de proceso, calidad de entrega y seguimiento de tareas." },
      { type: "bullet", text: "Trabajo colaborativo con diferentes areas para resolver requerimientos del negocio." }
    ];
  }

  if (sectionId === "projects") {
    if (ctx.projectHints && ctx.projectHints.length) {
      return ctx.projectHints.map((item) => ({ type: "bullet", text: item }));
    }

    return [
      { type: "bullet", text: "Proyecto orientado a automatizacion y eficiencia de procesos internos." },
      { type: "bullet", text: "Proyecto de analitica y visualizacion para soporte a decisiones." }
    ];
  }

  if (sectionId === "education") {
    if (ctx.educationHints && ctx.educationHints.length) {
      return ctx.educationHints.map((item) => ({ type: "text", text: item }));
    }

    return [
      { type: "text", text: "Formacion academica alineada con el desarrollo profesional del candidato." }
    ];
  }

  if (sectionId === "technical-skills") {
    const skillBullets = (ctx.skillBullets && ctx.skillBullets.length)
      ? ctx.skillBullets
      : [
        "Analitica de datos y visualizacion.",
        "Desarrollo de soluciones web y APIs.",
        "Gestion de bases de datos y herramientas de productividad."
      ];

    return skillBullets.map((item) => ({ type: "bullet", text: item }));
  }

  if (sectionId === "courses-certifications") {
    return [
      { type: "text", text: "Formacion complementaria en herramientas tecnicas y buenas practicas profesionales." }
    ];
  }

  if (sectionId === "languages") {
    if (ctx.languageHints && ctx.languageHints.length) {
      return ctx.languageHints.map((item) => ({ type: "text", text: item }));
    }

    return [{ type: "text", text: ctx.languageLine || "Comunicacion profesional en espanol e ingles tecnico." }];
  }

  if (sectionId === "contact") {
    const locationLine = ctx.location
      ? `Ubicacion de referencia: ${ctx.location}.`
      : "Ubicacion de referencia disponible bajo solicitud.";

    return [
      { type: "text", text: locationLine },
      { type: "text", text: "Canales de contacto profesional disponibles para procesos de seleccion." }
    ];
  }

  if (sectionId === "time-availability") {
    return [{ type: "text", text: ctx.availability || "Disponibilidad sujeta a acuerdo." }];
  }

  return [{ type: "text", text: getReadableSectionFallback(sectionId) }];
}

function buildCompleteSections(rawText) {
  const parsedSections = buildStructuredSections(rawText);
  const knownSectionMap = new Map();
  const extraSections = [];

  for (const section of parsedSections) {
    if (KNOWN_SECTION_ORDER.includes(section.id)) {
      knownSectionMap.set(section.id, section);
    } else {
      extraSections.push(section);
    }
  }

  const context = inferProfileContextFromSections(parsedSections, latestUserInputText || rawText);
  const completedSections = [];

  for (const sectionDef of KNOWN_SECTION_DEFINITIONS) {
    const existingSection = knownSectionMap.get(sectionDef.id);

    if (sectionHasRealContent(existingSection)) {
      completedSections.push(existingSection);
      continue;
    }

    completedSections.push({
      id: sectionDef.id,
      title: sectionDef.title,
      lines: buildSectionFallbackLines(sectionDef.id, context)
    });
  }

  for (const section of extraSections) {
    if (sectionHasRealContent(section)) {
      completedSections.push(section);
    }
  }

  return completedSections;
}

function getProfileData(rawText) {
  const structuredSections = buildCompleteSections(rawText);
  const sectionMap = new Map(structuredSections.map((section) => [section.id, section]));

  const nameSection = sectionMap.get("name");
  const ageSection = sectionMap.get("age");
  const titleSection = sectionMap.get("professional-title");
  const summarySection = sectionMap.get("professional-summary");
  const strengthsSection = sectionMap.get("core-strengths");

  const allPlainLines = structuredSections
    .flatMap((section) => sectionLinesToPlainLines(section))
    .filter(Boolean);

  const name = sectionLinesToPlainLines(nameSection)[0]
    || allPlainLines[0]
    || "Tu Nombre";

  const headline = sectionLinesToPlainLines(titleSection)[0]
    || allPlainLines[1]
    || "Perfil Profesional";

  const summaryCandidates = [
    ...sectionLinesToPlainLines(summarySection),
    ...sectionLinesToPlainLines(strengthsSection)
  ].filter(Boolean);

  const summary = summaryCandidates.slice(0, 3).join(" ")
    || "Perfil orientado a resultados, con enfoque en impacto y mejora continua.";

  const age = sectionLinesToPlainLines(ageSection)[0] || "";

  return {
    name: sanitizeDisplayLine(name),
    headline: sanitizeDisplayLine(headline),
    summary: sanitizeDisplayLine(summary),
    age: sanitizeDisplayLine(age)
  };
}

function formatCvContentToHtml(rawText) {
  const sections = buildCompleteSections(rawText);

  if (!sections.length) {
    return "<section><h3>Informacion profesional</h3><p>No hay contenido para mostrar aun.</p></section>";
  }

  const htmlParts = [];

  for (const section of sections) {
    htmlParts.push(`<section data-section="${escapeHtml(section.id)}">`);
    htmlParts.push(`<h3>${escapeHtml(section.title)}</h3>`);

    let listOpen = false;
    for (const lineItem of section.lines) {
      if (lineItem.type === "bullet") {
        if (!listOpen) {
          htmlParts.push("<ul>");
          listOpen = true;
        }

        htmlParts.push(`<li>${escapeHtml(lineItem.text)}</li>`);
        continue;
      }

      if (listOpen) {
        htmlParts.push("</ul>");
        listOpen = false;
      }

      if (lineItem.type === "kv") {
        htmlParts.push(`<p><strong>${escapeHtml(lineItem.key)}:</strong> ${escapeHtml(lineItem.value)}</p>`);
        continue;
      }

      htmlParts.push(`<p>${escapeHtml(lineItem.text)}</p>`);
    }

    if (listOpen) {
      htmlParts.push("</ul>");
    }

    htmlParts.push("</section>");
  }

  return htmlParts.join("");
}

function splitCorporateContent(contentHtml) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = String(contentHtml || "");

  const sectionNodes = Array.from(wrapper.querySelectorAll("section"));
  if (!sectionNodes.length) {
    return {
      sidebarHtml: "",
      mainHtml: String(contentHtml || "")
    };
  }

  const sidebarKeywords = [
    "core strengths",
    "fortalezas",
    "habilidades",
    "skills",
    "technical",
    "tecnic",
    "tecnolog",
    "idiomas",
    "languages",
    "lenguajes",
    "cursos",
    "courses",
    "certificaciones",
    "certifications",
    "contacto",
    "contact",
    "disponibilidad"
  ];

  const heroSectionKeys = ["name", "age", "professional-title", "professional-summary"];
  const sidebarSectionKeys = [
    "core-strengths",
    "technical-skills",
    "courses-certifications",
    "languages",
    "contact",
    "time-availability"
  ];

  const sidebarParts = [];
  const mainParts = [];

  for (const sectionNode of sectionNodes) {
    const cloned = sectionNode.cloneNode(true);
    const headingNode = cloned.querySelector("h3");
    const title = headingNode ? normalizeFieldKey(headingNode.textContent || "") : "";
    const sectionKey = normalizeFieldKey(cloned.getAttribute("data-section") || "");

    if (heroSectionKeys.includes(sectionKey)) {
      continue;
    }

    const isSidebarByKey = sidebarSectionKeys.includes(sectionKey);
    const isSidebarByTitle = sidebarKeywords.some((keyword) => title.includes(keyword));
    const isSidebar = isSidebarByKey || isSidebarByTitle;

    if (isSidebar) {
      sidebarParts.push(cloned.outerHTML);
    } else {
      mainParts.push(cloned.outerHTML);
    }
  }

  if (!mainParts.length && sidebarParts.length) {
    mainParts.push(sidebarParts.shift());
  }

  return {
    sidebarHtml: sidebarParts.join(""),
    mainHtml: mainParts.join("") || String(contentHtml || "")
  };
}

function buildTemplateMarkup(rawText, modelUsed) {
  const selectedTemplate = getSelectedTemplate();
  const imageUrl = getSelectedImageSource();
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

  if (selectedTemplate === "ejecutivo") {
    return `
      <article class="cv-template template-ejecutivo">
        <header class="tpl-executive-header">
          <h2 class="tpl-name">${escapeHtml(profile.name)}</h2>
          <p class="tpl-headline">${escapeHtml(profile.headline)}</p>
          ${modelBadge}
        </header>
        <div class="tpl-executive-body">
          <aside class="tpl-executive-aside">
            <img class="tpl-photo" src="${escapeHtml(imageUrl)}" alt="Foto de perfil">
            <p class="tpl-summary">${escapeHtml(profile.summary)}</p>
          </aside>
          <div class="tpl-content cv-output">
            ${contentHtml}
          </div>
        </div>
      </article>
    `;
  }

  if (selectedTemplate === "moderno") {
    return `
      <article class="cv-template template-moderno">
        <header class="tpl-modern-header">
          <div>
            <h2 class="tpl-name">${escapeHtml(profile.name)}</h2>
            <p class="tpl-headline">${escapeHtml(profile.headline)}</p>
            <p class="tpl-summary">${escapeHtml(profile.summary)}</p>
            ${modelBadge}
          </div>
          <img class="tpl-photo-square" src="${escapeHtml(imageUrl)}" alt="Foto de perfil">
        </header>
        <div class="tpl-content cv-output">
          ${contentHtml}
        </div>
      </article>
    `;
  }

  if (selectedTemplate === "academico") {
    return `
      <article class="cv-template template-academico">
        <header class="tpl-academic-header">
          <img class="tpl-photo" src="${escapeHtml(imageUrl)}" alt="Foto de perfil">
          <div>
            <h2 class="tpl-name">${escapeHtml(profile.name)}</h2>
            <p class="tpl-headline">${escapeHtml(profile.headline)}</p>
            <p class="tpl-summary">${escapeHtml(profile.summary)}</p>
            ${modelBadge}
          </div>
        </header>
        <div class="tpl-academic-divider"></div>
        <div class="tpl-content cv-output">
          ${contentHtml}
        </div>
      </article>
    `;
  }

  const corporateContent = splitCorporateContent(contentHtml);
  const sidebarFallback = `
    <section>
      <h3>Core strengths</h3>
      <ul>
        <li>${escapeHtml(profile.summary || "Perfil orientado a resultados")}</li>
      </ul>
    </section>
  `;

  const ageBlock = profile.age
    ? `<p class="tpl-age">${escapeHtml(profile.age)}</p>`
    : "";

  return `
    <article class="cv-template template-corporativo">
      <aside class="tpl-sidebar">
        <img class="tpl-photo" src="${escapeHtml(imageUrl)}" alt="Foto de perfil">
        <div class="tpl-side-content cv-output">
          ${corporateContent.sidebarHtml || sidebarFallback}
        </div>
      </aside>
      <section class="tpl-main">
        <header class="tpl-hero">
          <h2 class="tpl-name">${escapeHtml(profile.name)}</h2>
          ${ageBlock}
          <p class="tpl-headline">${escapeHtml(profile.headline)}</p>
          ${modelBadge}
        </header>
        <div class="tpl-content tpl-main-content cv-output">
          ${corporateContent.mainHtml}
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

  latestUserInputText = inputLibre;
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

async function descargarPDF() {
  const preview = document.getElementById("preview");
  const templateElement = preview ? preview.querySelector(".cv-template") : null;

  if (!templateElement) {
    if (preview) {
      preview.innerHTML = "<p style='color: red;'>Genera primero tu CV para poder exportarlo en PDF.</p>";
    }
    return;
  }

  if (typeof window.html2canvas !== "function") {
    if (preview) {
      preview.innerHTML = "<p style='color: red;'>No se encontro html2canvas para exportar el diseno.</p>";
    }
    return;
  }

  try {
    const canvas = await window.html2canvas(templateElement, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: templateElement.scrollWidth,
      height: templateElement.scrollHeight
    });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const margin = 8;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const printableWidth = pageWidth - margin * 2;
    const printableHeight = pageHeight - margin * 2;

    const pxPerMm = canvas.width / printableWidth;
    const pageCanvasHeightPx = Math.floor(printableHeight * pxPerMm);

    let renderedHeightPx = 0;
    let pageIndex = 0;

    while (renderedHeightPx < canvas.height) {
      const sliceHeightPx = Math.min(pageCanvasHeightPx, canvas.height - renderedHeightPx);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeightPx;

      const pageContext = pageCanvas.getContext("2d");
      if (!pageContext) {
        throw new Error("No se pudo crear el contexto de render.");
      }

      pageContext.drawImage(
        canvas,
        0,
        renderedHeightPx,
        canvas.width,
        sliceHeightPx,
        0,
        0,
        canvas.width,
        sliceHeightPx
      );

      const imgData = pageCanvas.toDataURL("image/png");
      const sliceHeightMm = sliceHeightPx / pxPerMm;

      if (pageIndex > 0) {
        doc.addPage();
      }

      doc.addImage(imgData, "PNG", margin, margin, printableWidth, sliceHeightMm, undefined, "FAST");

      renderedHeightPx += sliceHeightPx;
      pageIndex += 1;
    }

    doc.save("CV_profesional.pdf");
  } catch (error) {
    if (preview) {
      const message = error && error.message ? error.message : "Error desconocido";
      preview.innerHTML = `<p style='color: red;'>No se pudo exportar el PDF con diseno: ${escapeHtml(message)}</p>`;
    }
  }
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

  const inputLibreEl = document.getElementById("inputLibre");
  renderDetectedDataPreview(inputLibreEl ? inputLibreEl.value : "");

  if (inputLibreEl) {
    inputLibreEl.addEventListener("input", function() {
      latestUserInputText = inputLibreEl.value.trim();
      renderDetectedDataPreview(inputLibreEl.value);
    });
  }

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

  const imageInput = document.getElementById("imageFile");
  if (imageInput) {
    imageInput.addEventListener("change", handleImageFileSelection);
  }
});