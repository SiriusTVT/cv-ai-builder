const REPLICATE_API_URL = "https://api.replicate.com/v1/predictions";
const QWEN_VERSION = "2d19859c18c92054145331a3f74ab25eef51f01886d421c3b52495013d2a24a1";

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

function parseReplicateError(responseData, statusCode, fallbackText) {
  if (responseData && typeof responseData.detail === "string" && responseData.detail) {
    return responseData.detail;
  }

  if (responseData && typeof responseData.error === "string" && responseData.error) {
    return responseData.error;
  }

  if (responseData && typeof responseData === "object") {
    return JSON.stringify(responseData);
  }

  return `Error ${statusCode}: ${String(fallbackText || "Error desconocido").slice(0, 200)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const replicateApiKey = String(body.apiKey || "").trim();
    const inputLibre = String(body.inputLibre || "").trim();

    if (!replicateApiKey) {
      return makeResponse(400, { success: false, error: "Clave API de Replicate requerida" });
    }

    if (!inputLibre) {
      return makeResponse(400, { success: false, error: "Debes ingresar informacion en el cuadro de texto" });
    }

    const headers = {
      Authorization: `Token ${replicateApiKey}`,
      "Content-Type": "application/json"
    };

    const payload = {
      version: QWEN_VERSION,
      input: {
        prompt: construirPrompt(inputLibre),
        max_tokens: 1500,
        temperature: 0.7,
        top_p: 0.9
      }
    };

    const createResponse = await fetch(REPLICATE_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const createText = await createResponse.text();
    let createData = null;
    try {
      createData = JSON.parse(createText);
    } catch (err) {
      createData = null;
    }

    if (createResponse.status !== 201) {
      const errorMsg = parseReplicateError(createData, createResponse.status, createText);
      return makeResponse(400, { success: false, error: `Error en Replicate: ${errorMsg}` });
    }

    const predictionId = createData && createData.id;
    if (!predictionId) {
      return makeResponse(500, { success: false, error: "Replicate no devolvio id de prediccion" });
    }

    for (let i = 0; i < 25; i += 1) {
      await sleep(2000);

      const statusResponse = await fetch(`${REPLICATE_API_URL}/${predictionId}`, {
        method: "GET",
        headers
      });

      if (statusResponse.status !== 200) {
        continue;
      }

      const statusText = await statusResponse.text();
      let statusData = null;
      try {
        statusData = JSON.parse(statusText);
      } catch (err) {
        statusData = null;
      }

      if (!statusData) {
        continue;
      }

      if (statusData.status === "succeeded") {
        const output = statusData.output;
        const texto = Array.isArray(output) ? output.join("") : String(output || "");
        return makeResponse(200, {
          success: true,
          texto: texto.trim() || "No se recibio contenido de la IA. Intenta de nuevo."
        });
      }

      if (statusData.status === "failed" || statusData.status === "canceled") {
        return makeResponse(400, {
          success: false,
          error: `Error en Replicate: ${statusData.error || "La prediccion fallo"}`
        });
      }
    }

    return makeResponse(504, {
      success: false,
      error: "Tiempo de espera agotado. Intenta de nuevo."
    });
  } catch (error) {
    return makeResponse(500, {
      success: false,
      error: `Error inesperado: ${error.message}`
    });
  }
};
