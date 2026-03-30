from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

HF_CHAT_URL = "https://router.huggingface.co/v1/chat/completions"
HF_MODEL_CANDIDATES = [
    "google/gemma-2-2b-it:fastest",
    "openai/gpt-oss-20b:fastest",
    "openai/gpt-oss-120b:fastest",
    "Qwen/Qwen2.5-7B-Instruct-1M:fastest",
]


def construir_prompt(input_libre):
    return f"""Actua como un experto en reclutamiento, redaccion profesional y optimizacion de hojas de vida (ATS).

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
<<<
{input_libre}
>>>

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
- Evita caracteres raros o unicode no estandar."""


def parse_hf_error(response):
    try:
        error_data = response.json()
        if isinstance(error_data, dict):
            nested_error = error_data.get("error")
            if isinstance(nested_error, dict):
                if isinstance(nested_error.get("message"), str) and nested_error.get("message"):
                    return nested_error.get("message")
            if isinstance(error_data.get("error"), str) and error_data.get("error"):
                return error_data.get("error")
            if isinstance(error_data.get("message"), str) and error_data.get("message"):
                return error_data.get("message")
            return str(error_data)
    except Exception:
        pass

    return f"Error {response.status_code}: {response.text[:200]}"


def is_model_not_supported(error_msg):
    normalized = str(error_msg).lower()
    return "not supported by any provider" in normalized or "model_not_supported" in normalized


@app.route("/api/generar-cv", methods=["POST"])
def generar_cv():
    try:
        data = request.get_json(silent=True) or {}

        hf_api_key = str(data.get("apiKey", "")).strip()
        input_libre = str(data.get("inputLibre", "")).strip()

        if not hf_api_key:
            return jsonify({"success": False, "error": "Token de Hugging Face requerido"}), 400

        if not input_libre:
            return jsonify({"success": False, "error": "Debes ingresar informacion en el cuadro de texto"}), 400

        headers = {
            "Authorization": f"Bearer {hf_api_key}",
            "Content-Type": "application/json",
        }

        last_model_error = ""

        for model in HF_MODEL_CANDIDATES:
            payload = {
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": "Eres un experto en CVs y optimizacion ATS. Responde en espanol claro y profesional.",
                    },
                    {
                        "role": "user",
                        "content": construir_prompt(input_libre),
                    },
                ],
                "temperature": 0.4,
                "max_tokens": 700,
                "stream": False,
            }

            response = requests.post(HF_CHAT_URL, headers=headers, json=payload, timeout=60)

            if response.status_code != 200:
                error_msg = parse_hf_error(response)
                if is_model_not_supported(error_msg):
                    last_model_error = error_msg
                    continue
                return jsonify({"success": False, "error": f"Error en Hugging Face: {error_msg}"}), 400

            response_data = response.json()
            choices = response_data.get("choices") if isinstance(response_data, dict) else None
            if not choices:
                last_model_error = "Respuesta invalida del proveedor para este modelo"
                continue

            message = choices[0].get("message", {}) if isinstance(choices[0], dict) else {}
            texto = str(message.get("content", "")).strip()

            if not texto:
                last_model_error = "No se recibio contenido de la IA"
                continue

            return jsonify({"success": True, "texto": texto, "modelo": model})

        if last_model_error:
            return jsonify({
                "success": False,
                "error": f"No hay modelos compatibles con tus providers habilitados. Detalle: {last_model_error}",
            }), 400

        return jsonify({"success": False, "error": "No se pudo completar la solicitud con ningun modelo"}), 500

    except requests.exceptions.Timeout:
        return jsonify({"success": False, "error": "Tiempo de espera agotado. Intenta de nuevo."}), 504
    except requests.exceptions.RequestException as exc:
        return jsonify({"success": False, "error": f"Error de conexion: {str(exc)}"}), 500
    except Exception as exc:
        return jsonify({"success": False, "error": f"Error inesperado: {str(exc)}"}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


if __name__ == "__main__":
    app.run(debug=True, port=5000)