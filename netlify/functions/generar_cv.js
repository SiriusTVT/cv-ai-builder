const HF_CHAT_URL = "https://router.huggingface.co/v1/chat/completions";
const HF_MODEL_CANDIDATES = [
  "google/gemma-2-2b-it:fastest",
  "openai/gpt-oss-20b:fastest",
  "openai/gpt-oss-120b:fastest",
  "Qwen/Qwen2.5-7B-Instruct-1M:fastest"
];

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

Formato limpio, claro y listo para enviar.`;
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

    if (!hfApiKey) {
      return makeResponse(400, { success: false, error: "Token de Hugging Face requerido" });
    }

    if (!inputLibre) {
      return makeResponse(400, { success: false, error: "Debes ingresar informacion en el cuadro de texto" });
    }

    const headers = {
      Authorization: `Bearer ${hfApiKey}`,
      "Content-Type": "application/json"
    };

    let lastModelError = "";

    for (const model of HF_MODEL_CANDIDATES) {
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
        if (isModelNotSupported(errorMsg)) {
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
