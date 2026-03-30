const HF_CHAT_URL = "https://router.huggingface.co/v1/chat/completions";
const HF_MODEL_CANDIDATES = [
  "google/gemma-2-2b-it:fastest",
  "openai/gpt-oss-20b:fastest",
  "openai/gpt-oss-120b:fastest",
  "Qwen/Qwen2.5-7B-Instruct-1M:fastest"
];
const HF_MODEL_SET = new Set(HF_MODEL_CANDIDATES);

function normalizeSpaces(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function splitFragments(text) {
  return String(text || "")
    .split(/[\n\r.;]+/)
    .map((part) => normalizeSpaces(part))
    .filter(Boolean);
}

function uniqueFirst(items, maxItems) {
  const output = [];
  const seen = new Set();

  for (const item of items) {
    const clean = normalizeSpaces(item);
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

function extractNameHint(text) {
  const match = String(text || "").match(/^\s*([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+){1,4})/);
  return match ? normalizeSpaces(match[1]) : "";
}

function extractContactHints(text) {
  const raw = String(text || "");
  const emails = uniqueFirst(raw.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [], 2);
  const phones = uniqueFirst(raw.match(/(?:\+?\d[\d\s\-()]{7,}\d)/g) || [], 2);
  return { emails, phones };
}

function extractFragmentsByKeywords(fragments, keywords, maxItems = 4) {
  const matched = fragments.filter((fragment) => {
    const lowered = fragment.toLowerCase();
    return keywords.some((keyword) => lowered.includes(keyword));
  });

  return uniqueFirst(matched, maxItems);
}

function extractLocationHint(text) {
  const lowered = String(text || "").toLowerCase();

  if (lowered.includes("cali") && lowered.includes("colombia")) {
    return "Cali, Colombia";
  }

  const cities = ["cali", "bogota", "medellin", "colombia", "mexico", "peru", "chile", "argentina", "ecuador", "espana"];
  const hit = cities.find((city) => lowered.includes(city));
  if (!hit) {
    return "";
  }

  return `${hit.charAt(0).toUpperCase()}${hit.slice(1)}`;
}

function extractAvailabilityHint(text) {
  const lowered = String(text || "").toLowerCase();
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

function buildStructuredInputBlock(inputLibre) {
  const raw = String(inputLibre || "");
  const fragments = splitFragments(raw);

  const nameHint = extractNameHint(raw);
  const locationHint = extractLocationHint(raw);
  const availabilityHint = extractAvailabilityHint(raw);
  const { emails, phones } = extractContactHints(raw);

  const educationHints = extractFragmentsByKeywords(
    fragments,
    ["universidad", "colegio", "semestre", "ingenier", "educacion", "formacion", "bachiller", "maestr", "pregrado"]
  );
  const experienceHints = extractFragmentsByKeywords(
    fragments,
    ["experiencia", "trabaj", "aprendiz", "practic", "manager", "empresa", "cargo", "rol", "desde", "actualmente"]
  );
  const projectHints = extractFragmentsByKeywords(
    fragments,
    ["proyecto", "project", "producto", "implement", "desarrollo", "automatizacion", "produccion"]
  );
  const skillHints = extractFragmentsByKeywords(
    fragments,
    ["habilidad", "skills", "python", "sql", "power bi", "excel", "react", "node", "api", "postgres", "mysql", "mongodb", "firebase", "docker", "git", "ci/cd", "pandas", "numpy"]
  );
  const languageHints = extractFragmentsByKeywords(
    fragments,
    ["ingles", "english", "bilingue", "idioma", "languages", "lenguajes"],
    3
  );

  function asBullets(title, values) {
    if (values.length) {
      return values.map((value) => `- ${title}: ${value}`).join("\n");
    }

    return `- ${title}: Sin dato explicito`;
  }

  return [
    "DATOS ESTRUCTURADOS DETECTADOS (extraidos del texto original):",
    `- Name hint: ${nameHint || "Sin dato explicito"}`,
    `- Location hint: ${locationHint || "Sin dato explicito"}`,
    `- Availability hint: ${availabilityHint}`,
    asBullets("Email hint", emails),
    asBullets("Phone hint", phones),
    asBullets("Education hint", educationHints),
    asBullets("Work experience hint", experienceHints),
    asBullets("Projects hint", projectHints),
    asBullets("Technical skills hint", skillHints),
    asBullets("Languages hint", languageHints)
  ].join("\n");
}

function construirPrompt(inputLibre) {
  const structuredBlock = buildStructuredInputBlock(inputLibre);

  return `Actua como un consultor senior de reclutamiento y redaccion de CVs ATS.

OBJETIVO:
Convertir el texto del usuario en un CV completo, detallado y profesional, sin perder informacion relevante.

PRIORIDADES:
1. No omitir datos del usuario: conserva toda informacion util.
2. Reescribir con calidad profesional: claridad, impacto y lenguaje de accion.
3. Estructura ATS: secciones claras, keywords, legibilidad.

${structuredBlock}

INSTRUCCION CRITICA:
- Usa primero los DATOS ESTRUCTURADOS DETECTADOS y luego completa con el texto original.
- Si hay pistas para Education, Work experience, Projects o Technical skills, debes incorporarlas en esas secciones.
- No reemplaces datos detectados con frases genericas.

SECCIONES OBLIGATORIAS (usa exactamente estos encabezados):
- Name:
- Age:
- Professional title:
- Professional summary:
- Core strengths:
- Work experience:
- Projects:
- Education:
- Technical skills:
- Courses and certifications:
- Languages:
- Contact:
- Time availability:

REGLAS DE DETALLE:
- Professional summary: 6 a 9 lineas con enfoque en valor, dominio tecnico y tipo de impacto.
- Work experience: por cada rol incluye empresa, cargo, periodo y entre 4 y 7 bullets de logros/responsabilidades.
- Projects: incluye al menos 2 proyectos cuando existan datos; describe objetivo, stack y resultado.
- Technical skills: agrupa por categorias (Programming, Data/BI, Databases, DevOps/Cloud, Tools).
- Courses and certifications / Languages / Contact / Time availability: no las omitas.
- Longitud objetivo: minimo 55 lineas utiles y salida extensa cuando haya datos suficientes.
- Si falta un dato, completa con texto profesional util y legible para esa seccion.
- Nunca uses frases como "No especificado", "No especificado por el candidato" o equivalentes.

TEXTO DEL USUARIO:
"""
${inputLibre}
"""

FORMATO OBLIGATORIO:
- Entrega en texto plano (sin Markdown).
- No uses **, #, >, ni simbolos decorativos.
- Usa encabezados con ":" como en la lista obligatoria.
- Usa bullets con "-".
- Mantener redaccion limpia y profesional.
- No inventar hechos falsos; solo inferencias prudentes cuando haga falta.`;
}

function makeResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(payload)
  };
}

function parseHfError(responseData, statusCode, fallbackText) {
  if (responseData && typeof responseData.error === "object" && responseData.error !== null) {
    if (typeof responseData.error.message === "string" && responseData.error.message) {
      return responseData.error.message;
    }
  }

  if (responseData && typeof responseData.error === "string" && responseData.error) {
    return responseData.error;
  }

  if (responseData && typeof responseData.message === "string" && responseData.message) {
    return responseData.message;
  }

  if (responseData && typeof responseData === "object") {
    return JSON.stringify(responseData);
  }

  return `Error ${statusCode}: ${String(fallbackText || "Error desconocido").slice(0, 200)}`;
}

function isModelNotSupported(errorMsg) {
  const normalized = String(errorMsg || "").toLowerCase();
  return normalized.includes("not supported by any provider") || normalized.includes("model_not_supported");
}

function resolveModelSequence(requestedModel) {
  const normalized = String(requestedModel || "auto").trim();

  if (!normalized || normalized === "auto") {
    return { modelSequence: [...HF_MODEL_CANDIDATES], modelError: null, normalizedRequestedModel: "auto" };
  }

  if (HF_MODEL_SET.has(normalized)) {
    return { modelSequence: [normalized], modelError: null, normalizedRequestedModel: normalized };
  }

  const allowedValues = HF_MODEL_CANDIDATES.join(", ");
  return {
    modelSequence: null,
    modelError: `Modelo no valido. Opciones: auto, ${allowedValues}`,
    normalizedRequestedModel: normalized
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return makeResponse(204, {});
  }

  if (event.httpMethod !== "POST") {
    return makeResponse(405, { success: false, error: "Metodo no permitido" });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const hfApiKey = String(body.apiKey || "").trim();
    const inputLibre = String(body.inputLibre || "").trim();
    const requestedModel = String(body.requestedModel || "auto").trim();

    if (!hfApiKey) {
      return makeResponse(400, { success: false, error: "Token de Hugging Face requerido" });
    }

    if (!inputLibre) {
      return makeResponse(400, { success: false, error: "Debes ingresar informacion en el cuadro de texto" });
    }

    const { modelSequence, modelError, normalizedRequestedModel } = resolveModelSequence(requestedModel);
    if (modelError) {
      return makeResponse(400, { success: false, error: modelError });
    }

    const headers = {
      Authorization: `Bearer ${hfApiKey}`,
      "Content-Type": "application/json"
    };

    let lastModelError = "";

    for (const model of modelSequence) {
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
        max_tokens: 1300,
        stream: false
      };

      const response = await fetch(HF_CHAT_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      let data = null;
      try {
        data = JSON.parse(responseText);
      } catch (err) {
        data = null;
      }

      if (!response.ok) {
        const errorMsg = parseHfError(data, response.status, responseText);
        if (normalizedRequestedModel === "auto" && isModelNotSupported(errorMsg)) {
          lastModelError = errorMsg;
          continue;
        }
        return makeResponse(400, { success: false, error: `Error en Hugging Face: ${errorMsg}` });
      }

      const texto = data?.choices?.[0]?.message?.content;
      if (!texto || typeof texto !== "string") {
        lastModelError = "Respuesta invalida del proveedor para este modelo";
        continue;
      }

      return makeResponse(200, {
        success: true,
        texto: texto.trim(),
        modelo: model
      });
    }

    if (lastModelError) {
      if (normalizedRequestedModel !== "auto") {
        return makeResponse(400, {
          success: false,
          error: `El modelo seleccionado no genero una salida valida. Detalle: ${lastModelError}`
        });
      }

      return makeResponse(400, {
        success: false,
        error: `No hay modelos compatibles con tus providers habilitados. Detalle: ${lastModelError}`
      });
    }

    return makeResponse(500, {
      success: false,
      error: "No se pudo completar la solicitud con ningun modelo"
    });
  } catch (error) {
    return makeResponse(500, {
      success: false,
      error: `Error inesperado: ${error.message}`
    });
  }
};
