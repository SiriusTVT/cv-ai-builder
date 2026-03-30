const crypto = require("crypto");

const HF_CHAT_URL = "https://router.huggingface.co/v1/chat/completions";
const HF_MODEL_CANDIDATES = [
  "google/gemma-2-2b-it:fastest",
  "openai/gpt-oss-20b:fastest",
  "openai/gpt-oss-120b:fastest",
  "Qwen/Qwen2.5-7B-Instruct-1M:fastest"
];
const HF_MODEL_SET = new Set(HF_MODEL_CANDIDATES);

const CANVA_API_BASE = "https://api.canva.com/rest/v1";
const CANVA_OAUTH_AUTHORIZE_URL = "https://www.canva.com/api/oauth/authorize";
const CANVA_OAUTH_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";
const CANVA_DEFAULT_SCOPES = [
  "design:content:write",
  "design:meta:read",
  "brandtemplate:content:read",
  "brandtemplate:meta:read",
  "asset:read",
  "asset:write"
];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const POLL_ATTEMPTS = 25;
const POLL_INTERVAL_MS = 1200;
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function responseJson(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    },
    body: JSON.stringify(payload)
  };
}

function buildRedirectUrl(baseUrl, params) {
  try {
    const target = new URL(baseUrl);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }
      target.searchParams.set(key, String(value));
    });
    return target.toString();
  } catch (error) {
    return baseUrl;
  }
}

function sanitizeFrontendUrl(candidate, fallback) {
  const raw = String(candidate || "").trim();
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch (error) {
    return fallback;
  }

  return fallback;
}

function getCanvaConfig() {
  const scopeString = String(process.env.CANVA_SCOPES || "").trim();

  return {
    clientId: String(process.env.CANVA_CLIENT_ID || "").trim(),
    clientSecret: String(process.env.CANVA_CLIENT_SECRET || "").trim(),
    redirectUri: String(process.env.CANVA_REDIRECT_URI || "").trim(),
    frontendUrl: String(process.env.CANVA_FRONTEND_URL || "").trim(),
    scopes: scopeString ? scopeString.split(/\s+/) : [...CANVA_DEFAULT_SCOPES],
    signingSecret: String(
      process.env.CANVA_SESSION_SECRET || process.env.CANVA_STATE_SECRET || process.env.CANVA_CLIENT_SECRET || ""
    ).trim()
  };
}

function isCanvaConfigured(config) {
  return Boolean(config.clientId && config.clientSecret && config.redirectUri && config.signingSecret);
}

function makePkceCodeVerifier() {
  return crypto.randomBytes(72).toString("base64url").slice(0, 128);
}

function makePkceCodeChallenge(codeVerifier) {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

function signPayload(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyPayload(token, secret) {
  const value = String(token || "");
  const parts = value.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [body, signature] = parts;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");

  if (signature.length !== expected.length) {
    return null;
  }

  const sigBuffer = Buffer.from(signature, "utf8");
  const expBuffer = Buffer.from(expected, "utf8");
  if (!crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch (error) {
    return null;
  }
}

function createStateToken({ codeVerifier, frontendUrl }, secret) {
  return signPayload(
    {
      v: codeVerifier,
      f: frontendUrl,
      iat: Date.now()
    },
    secret
  );
}

function decodeStateToken(stateToken, secret) {
  const payload = verifyPayload(stateToken, secret);
  if (!payload) {
    return { payload: null, error: "Estado OAuth invalido" };
  }

  const iat = Number(payload.iat || 0);
  if (!iat || Date.now() - iat > STATE_MAX_AGE_MS) {
    return { payload: null, error: "Estado OAuth expirado. Intenta conectar de nuevo." };
  }

  if (!payload.v || !payload.f) {
    return { payload: null, error: "Estado OAuth incompleto" };
  }

  return { payload, error: null };
}

function createSessionToken(sessionPayload, secret) {
  return signPayload(sessionPayload, secret);
}

function decodeSessionToken(sessionToken, secret) {
  const payload = verifyPayload(sessionToken, secret);
  if (!payload || !payload.accessToken) {
    return { payload: null, error: "Sesion Canva invalida" };
  }
  return { payload, error: null };
}

function extractApiError(data, text, status) {
  if (data && typeof data === "object") {
    if (data.error && typeof data.error === "object" && typeof data.error.message === "string") {
      return data.error.message;
    }
    if (typeof data.error === "string" && data.error) {
      return data.error;
    }
    if (typeof data.message === "string" && data.message) {
      return data.message;
    }
    if (typeof data.code === "string" && typeof data.message === "string") {
      return `${data.code}: ${data.message}`;
    }
  }

  const safeText = String(text || "").slice(0, 220);
  return `Error ${status}: ${safeText || "Error desconocido"}`;
}

async function exchangeCanvaToken({ config, grantType, code, codeVerifier, refreshToken }) {
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: grantType
  });

  if (grantType === "authorization_code") {
    body.set("code", String(code || ""));
    body.set("code_verifier", String(codeVerifier || ""));
    body.set("redirect_uri", config.redirectUri);
  } else {
    body.set("refresh_token", String(refreshToken || ""));
  }

  const response = await fetch(CANVA_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const text = await response.text();
  const data = parseJsonSafe(text);

  if (!response.ok) {
    return { ok: false, error: extractApiError(data, text, response.status), status: response.status };
  }

  if (!data || !data.access_token) {
    return { ok: false, error: "Canva no devolvio access_token", status: 502 };
  }

  return {
    ok: true,
    data: {
      accessToken: String(data.access_token),
      refreshToken: String(data.refresh_token || ""),
      expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
      scope: String(data.scope || "")
    }
  };
}

async function ensureCanvaAccess({ config, sessionToken }) {
  const decoded = decodeSessionToken(sessionToken, config.signingSecret);
  if (!decoded.payload) {
    return { ok: false, error: decoded.error || "Sesion Canva invalida", status: 401 };
  }

  const session = decoded.payload;
  const expiresAt = Number(session.expiresAt || 0);

  if (expiresAt > Date.now() + 60 * 1000) {
    return {
      ok: true,
      accessToken: String(session.accessToken),
      session,
      sessionToken
    };
  }

  if (!session.refreshToken) {
    return { ok: false, error: "Sesion Canva vencida. Conecta Canva de nuevo.", status: 401 };
  }

  const refreshed = await exchangeCanvaToken({
    config,
    grantType: "refresh_token",
    refreshToken: String(session.refreshToken)
  });

  if (!refreshed.ok) {
    return { ok: false, error: `No se pudo refrescar sesion Canva: ${refreshed.error}`, status: 401 };
  }

  const newSession = {
    accessToken: refreshed.data.accessToken,
    refreshToken: refreshed.data.refreshToken || session.refreshToken,
    expiresAt: refreshed.data.expiresAt,
    scope: refreshed.data.scope || session.scope || "",
    updatedAt: Date.now()
  };

  const newSessionToken = createSessionToken(newSession, config.signingSecret);
  return {
    ok: true,
    accessToken: newSession.accessToken,
    session: newSession,
    sessionToken: newSessionToken
  };
}

function construirPrompt(inputLibre) {
  return `Actua como un experto en reclutamiento, redaccion profesional y optimizacion de hojas de vida (ATS).

Tu tarea es analizar, organizar y transformar informacion desordenada en una hoja de vida profesional, clara y atractiva.

INSTRUCCIONES:

1. Analiza el texto proporcionado por el usuario (puede estar desordenado, incompleto o mal redactado).
2. Extrae y organiza la informacion en estas secciones:
   - Nombre
   - Perfil profesional
   - Experiencia
   - Educacion
   - Habilidades
3. Si alguna seccion no esta clara:
   - infierela inteligentemente sin inventar informacion falsa
   - completa con redaccion profesional
4. Mejora completamente la redaccion:
   - usa lenguaje claro, profesional y persuasivo
   - convierte descripciones simples en contenido profesional
   - usa verbos de accion
5. Optimiza para sistemas ATS:
   - estructura clara
   - palabras clave relevantes
   - formato profesional

TEXTO DEL USUARIO:
"""
${inputLibre}
"""

SALIDA:
Genera una hoja de vida estructurada con:
- Nombre
- Perfil profesional
- Experiencia
- Educacion
- Habilidades

Formato limpio, claro y listo para enviar.

REGLAS DE FORMATO OBLIGATORIAS:
- Entrega en texto plano (sin Markdown).
- No uses **, #, >, ni simbolos decorativos.
- Usa solo encabezados simples con ":". Ejemplo: "Perfil profesional:".
- Usa bullets con guion "-" para listar logros.
- Evita caracteres raros o unicode no estandar.`;
}

function resolveModelSequence(requestedModel) {
  const normalized = String(requestedModel || "auto").trim();

  if (!normalized || normalized === "auto") {
    return { modelSequence: [...HF_MODEL_CANDIDATES], normalizedRequestedModel: "auto", modelError: null };
  }

  if (HF_MODEL_SET.has(normalized)) {
    return { modelSequence: [normalized], normalizedRequestedModel: normalized, modelError: null };
  }

  return {
    modelSequence: null,
    normalizedRequestedModel: normalized,
    modelError: `Modelo no valido. Opciones: auto, ${HF_MODEL_CANDIDATES.join(", ")}`
  };
}

function isModelNotSupported(errorMsg) {
  const normalized = String(errorMsg || "").toLowerCase();
  return normalized.includes("not supported by any provider") || normalized.includes("model_not_supported");
}

async function generarTextoCv({ hfApiKey, inputLibre, requestedModel }) {
  const modelInfo = resolveModelSequence(requestedModel);
  if (modelInfo.modelError) {
    return { ok: false, error: modelInfo.modelError, status: 400 };
  }

  let lastModelError = "";

  for (const model of modelInfo.modelSequence) {
    const payload = {
      model,
      messages: [
        {
          role: "system",
          content: "Eres un experto en CVs y optimizacion ATS. Responde en espanol claro y profesional."
        },
        {
          role: "user",
          content: construirPrompt(inputLibre)
        }
      ],
      temperature: 0.4,
      max_tokens: 700,
      stream: false
    };

    const response = await fetch(HF_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    const data = parseJsonSafe(text);

    if (!response.ok) {
      const message = extractApiError(data, text, response.status);
      if (modelInfo.normalizedRequestedModel === "auto" && isModelNotSupported(message)) {
        lastModelError = message;
        continue;
      }
      return { ok: false, error: `Error en Hugging Face: ${message}`, status: 400 };
    }

    const output = data?.choices?.[0]?.message?.content;
    if (!output || typeof output !== "string") {
      lastModelError = "Respuesta invalida del proveedor para este modelo";
      continue;
    }

    return {
      ok: true,
      texto: output.trim(),
      modelo: model
    };
  }

  if (lastModelError) {
    if (modelInfo.normalizedRequestedModel !== "auto") {
      return {
        ok: false,
        error: `El modelo seleccionado no genero una salida valida. Detalle: ${lastModelError}`,
        status: 400
      };
    }

    return {
      ok: false,
      error: `No hay modelos compatibles con tus providers habilitados. Detalle: ${lastModelError}`,
      status: 400
    };
  }

  return {
    ok: false,
    error: "No se pudo completar la solicitud con ningun modelo",
    status: 500
  };
}

async function canvaRequest({ method, accessToken, path, headers, jsonBody, rawBody }) {
  const reqHeaders = {
    Authorization: `Bearer ${accessToken}`,
    ...(headers || {})
  };

  let body;
  if (jsonBody !== undefined) {
    if (!reqHeaders["Content-Type"]) {
      reqHeaders["Content-Type"] = "application/json";
    }
    body = JSON.stringify(jsonBody);
  } else if (rawBody !== undefined) {
    body = rawBody;
  }

  const response = await fetch(`${CANVA_API_BASE}${path}`, {
    method,
    headers: reqHeaders,
    body
  });

  const text = await response.text();
  const data = parseJsonSafe(text);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: extractApiError(data, text, response.status),
      data
    };
  }

  return {
    ok: true,
    status: response.status,
    data: data || {}
  };
}

function decodePhotoDataUrl(photoDataUrl) {
  const text = String(photoDataUrl || "").trim();
  if (!text) {
    return { ok: false, error: "Debes cargar una foto para insertar en Canva" };
  }

  const match = text.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!match) {
    return { ok: false, error: "Formato de foto invalido. Debe ser una imagen base64." };
  }

  const mimeType = String(match[1]).toLowerCase();
  const base64Data = String(match[2]).replace(/\s+/g, "");

  let buffer;
  try {
    buffer = Buffer.from(base64Data, "base64");
  } catch (error) {
    return { ok: false, error: "No se pudo leer la foto seleccionada" };
  }

  if (!buffer || !buffer.length) {
    return { ok: false, error: "La foto seleccionada esta vacia" };
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: "La foto supera el limite de 8 MB" };
  }

  const extensionMap = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
  };

  const extension = extensionMap[mimeType];
  if (!extension) {
    return { ok: false, error: "Formato de imagen no soportado. Usa JPG, PNG, WEBP o GIF." };
  }

  return {
    ok: true,
    bytes: buffer,
    fileName: `foto_cv_${Date.now()}.${extension}`
  };
}

async function waitForAssetUpload({ accessToken, jobId }) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const statusRes = await canvaRequest({
      method: "GET",
      accessToken,
      path: `/asset-uploads/${encodeURIComponent(jobId)}`
    });

    if (!statusRes.ok) {
      return { ok: false, error: statusRes.error };
    }

    const job = statusRes.data?.job || {};
    const status = String(job.status || "").toLowerCase();

    if (status === "success") {
      const assetId = String(job.asset?.id || "").trim();
      if (assetId) {
        return { ok: true, assetId };
      }
      return { ok: false, error: "Canva subio la imagen, pero no devolvio asset_id" };
    }

    if (status === "failed") {
      const err = job.error?.message || "Canva no pudo procesar la foto";
      return { ok: false, error: err };
    }

    await delay(POLL_INTERVAL_MS);
  }

  return { ok: false, error: "Timeout esperando la subida de foto en Canva" };
}

async function uploadPhotoToCanva({ accessToken, photoBytes, fileName }) {
  const metadata = JSON.stringify({
    name_base64: Buffer.from(fileName, "utf8").toString("base64")
  });

  const uploadRes = await canvaRequest({
    method: "POST",
    accessToken,
    path: "/asset-uploads",
    headers: {
      "Content-Type": "application/octet-stream",
      "Asset-Upload-Metadata": metadata
    },
    rawBody: photoBytes
  });

  if (!uploadRes.ok) {
    return { ok: false, error: uploadRes.error };
  }

  const job = uploadRes.data?.job || {};
  const status = String(job.status || "").toLowerCase();

  if (status === "success") {
    const assetId = String(job.asset?.id || "").trim();
    if (assetId) {
      return { ok: true, assetId };
    }
  }

  const jobId = String(job.id || "").trim();
  if (!jobId) {
    return { ok: false, error: "Canva no devolvio id de trabajo para la subida de foto" };
  }

  return waitForAssetUpload({ accessToken, jobId });
}

async function getBrandTemplateDataset({ accessToken, brandTemplateId }) {
  const datasetRes = await canvaRequest({
    method: "GET",
    accessToken,
    path: `/brand-templates/${encodeURIComponent(brandTemplateId)}/dataset`
  });

  if (!datasetRes.ok) {
    return { ok: false, error: datasetRes.error };
  }

  const dataset = datasetRes.data?.dataset;
  if (!dataset || typeof dataset !== "object") {
    return { ok: false, error: "La plantilla no tiene campos de autofill configurados" };
  }

  return { ok: true, dataset };
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function detectSectionHeading(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.includes(":")) {
    return null;
  }

  const candidate = normalizeText(trimmed.split(":", 1)[0]);

  if (candidate.includes("nombre") || candidate.includes("name")) {
    return "nombre";
  }
  if (candidate.includes("perfil") || candidate.includes("summary") || candidate.includes("resumen")) {
    return "perfil_profesional";
  }
  if (candidate.includes("experiencia") || candidate.includes("experience")) {
    return "experiencia";
  }
  if (
    candidate.includes("educacion") ||
    candidate.includes("education") ||
    candidate.includes("estudios") ||
    candidate.includes("formacion")
  ) {
    return "educacion";
  }
  if (candidate.includes("habilidades") || candidate.includes("skills") || candidate.includes("competencias")) {
    return "habilidades";
  }
  if (candidate.includes("contact") || candidate.includes("correo") || candidate.includes("telefono")) {
    return "contacto";
  }

  return null;
}

function extractContactInfo(text) {
  const fullText = String(text || "");
  const email = fullText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] || "";
  const phone = fullText.match(/\+?\d[\d\s().-]{7,}\d/)?.[0] || "";

  const parts = [];
  if (email) {
    parts.push(`Email: ${email}`);
  }
  if (phone) {
    parts.push(`Telefono: ${phone}`);
  }

  return parts.join(" | ");
}

function extractCvSections(cvText) {
  const sections = {
    nombre: [],
    perfil_profesional: [],
    experiencia: [],
    educacion: [],
    habilidades: [],
    contacto: []
  };

  let currentSection = null;
  String(cvText || "")
    .split(/\r?\n/)
    .forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) {
        return;
      }

      const heading = detectSectionHeading(line);
      if (heading) {
        currentSection = heading;
        const tail = line.includes(":") ? line.split(":").slice(1).join(":").trim() : "";
        if (tail) {
          sections[heading].push(tail);
        }
        return;
      }

      if (currentSection) {
        sections[currentSection].push(line);
      }
    });

  const normalized = {
    nombre: sections.nombre.join("\n").trim(),
    perfil_profesional: sections.perfil_profesional.join("\n").trim(),
    experiencia: sections.experiencia.join("\n").trim(),
    educacion: sections.educacion.join("\n").trim(),
    habilidades: sections.habilidades.join("\n").trim(),
    contacto: sections.contacto.join("\n").trim(),
    cv_completo: String(cvText || "").trim()
  };

  if (!normalized.nombre) {
    const firstSimple = String(cvText || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && line.length <= 70 && !line.includes(":"));
    if (firstSimple) {
      normalized.nombre = firstSimple;
    }
  }

  if (!normalized.contacto) {
    normalized.contacto = extractContactInfo(cvText);
  }

  return normalized;
}

function clampText(value, maxLen = 1600) {
  const text = String(value || "").trim();
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen - 3).trim()}...`;
}

function pickTextForField(fieldName, sections, fallbackValues, fallbackIndex) {
  const normalizedField = normalizeText(fieldName);
  const hasAny = (...terms) => terms.some((term) => normalizedField.includes(term));

  if (hasAny("nombre", "name", "full name") && sections.nombre) {
    return { value: sections.nombre, fallbackIndex };
  }
  if (hasAny("perfil", "summary", "resumen", "about") && sections.perfil_profesional) {
    return { value: sections.perfil_profesional, fallbackIndex };
  }
  if (hasAny("experiencia", "experience", "work", "laboral") && sections.experiencia) {
    return { value: sections.experiencia, fallbackIndex };
  }
  if (hasAny("educacion", "education", "estudios", "academica", "formacion") && sections.educacion) {
    return { value: sections.educacion, fallbackIndex };
  }
  if (hasAny("habilidad", "skills", "competencia") && sections.habilidades) {
    return { value: sections.habilidades, fallbackIndex };
  }
  if (hasAny("contact", "correo", "telefono", "email", "phone") && sections.contacto) {
    return { value: sections.contacto, fallbackIndex };
  }

  for (let i = fallbackIndex; i < fallbackValues.length; i += 1) {
    if (fallbackValues[i]) {
      return { value: fallbackValues[i], fallbackIndex: i + 1 };
    }
  }

  return { value: sections.cv_completo || "", fallbackIndex };
}

function buildAutofillData(dataset, sections, photoAssetId) {
  const autofillData = {};
  const warnings = [];

  const imageFields = [];
  const textFields = [];

  Object.entries(dataset).forEach(([fieldName, meta]) => {
    const type = String(meta?.type || "").toLowerCase();
    if (type === "image") {
      imageFields.push(fieldName);
    } else if (type === "text") {
      textFields.push(fieldName);
    }
  });

  if (imageFields.length && photoAssetId) {
    imageFields.forEach((fieldName) => {
      autofillData[fieldName] = {
        type: "image",
        asset_id: photoAssetId
      };
    });
  } else if (imageFields.length && !photoAssetId) {
    warnings.push("La plantilla tiene campos de imagen, pero no se pudo insertar la foto.");
  } else if (!imageFields.length && photoAssetId) {
    warnings.push("La plantilla no tiene campos de imagen para usar la foto.");
  }

  const fallbackValues = [
    sections.nombre,
    sections.perfil_profesional,
    sections.experiencia,
    sections.educacion,
    sections.habilidades,
    sections.contacto,
    sections.cv_completo
  ];

  let fallbackIndex = 0;
  textFields.forEach((fieldName) => {
    const picked = pickTextForField(fieldName, sections, fallbackValues, fallbackIndex);
    fallbackIndex = picked.fallbackIndex;

    const safeText = clampText(picked.value);
    if (!safeText) {
      return;
    }

    autofillData[fieldName] = {
      type: "text",
      text: safeText
    };
  });

  if (!Object.keys(autofillData).length) {
    return {
      ok: false,
      warnings,
      error: "No se pudieron mapear campos para autofill en la plantilla seleccionada"
    };
  }

  return {
    ok: true,
    warnings,
    autofillData
  };
}

async function waitForAutofill({ accessToken, jobId }) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const statusRes = await canvaRequest({
      method: "GET",
      accessToken,
      path: `/autofills/${encodeURIComponent(jobId)}`
    });

    if (!statusRes.ok) {
      return { ok: false, error: statusRes.error };
    }

    const job = statusRes.data?.job || {};
    const status = String(job.status || "").toLowerCase();

    if (status === "success") {
      const design = job.result?.design;
      if (design) {
        return { ok: true, design };
      }
      return { ok: false, error: "Canva no devolvio el diseno generado" };
    }

    if (status === "failed") {
      const err = job.error?.message || "No se pudo completar el autofill en Canva";
      return { ok: false, error: err };
    }

    await delay(POLL_INTERVAL_MS);
  }

  return { ok: false, error: "Timeout esperando la generacion del diseno en Canva" };
}

async function createAutofillDesign({ accessToken, brandTemplateId, autofillData, title }) {
  const createRes = await canvaRequest({
    method: "POST",
    accessToken,
    path: "/autofills",
    jsonBody: {
      brand_template_id: brandTemplateId,
      title,
      data: autofillData
    }
  });

  if (!createRes.ok) {
    return { ok: false, error: createRes.error };
  }

  const job = createRes.data?.job || {};
  const status = String(job.status || "").toLowerCase();

  if (status === "success") {
    const design = job.result?.design;
    if (design) {
      return { ok: true, design };
    }
  }

  const jobId = String(job.id || "").trim();
  if (!jobId) {
    return { ok: false, error: "Canva no devolvio id de trabajo para autofill" };
  }

  return waitForAutofill({ accessToken, jobId });
}

function getCallbackHtml({ frontendUrl, sessionToken, errorMessage }) {
  const targetUrl = errorMessage
    ? buildRedirectUrl(frontendUrl, { canva_error: errorMessage })
    : buildRedirectUrl(frontendUrl, { canva_connected: "1" });

  const escapedTarget = JSON.stringify(targetUrl);
  const escapedSession = JSON.stringify(String(sessionToken || ""));
  const escapedError = JSON.stringify(String(errorMessage || ""));

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>Conectando Canva...</title>
  </head>
  <body>
    <p>Conectando Canva...</p>
    <script>
      (function () {
        try {
          if (${escapedError} && ${escapedError} !== "") {
            localStorage.removeItem("canva_session_id");
          } else {
            localStorage.setItem("canva_session_id", ${escapedSession});
          }
        } catch (e) {
          // noop
        }
        window.location.replace(${escapedTarget});
      })();
    </script>
  </body>
</html>`;
}

module.exports = {
  CANVA_OAUTH_AUTHORIZE_URL,
  buildRedirectUrl,
  createAutofillDesign,
  createSessionToken,
  createStateToken,
  decodePhotoDataUrl,
  decodeSessionToken,
  decodeStateToken,
  ensureCanvaAccess,
  exchangeCanvaToken,
  extractCvSections,
  generarTextoCv,
  getCallbackHtml,
  getBrandTemplateDataset,
  getCanvaConfig,
  isCanvaConfigured,
  makePkceCodeChallenge,
  makePkceCodeVerifier,
  responseJson,
  sanitizeFrontendUrl,
  uploadPhotoToCanva,
  buildAutofillData
};
