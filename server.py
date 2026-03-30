from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

HF_CHAT_URL = "https://router.huggingface.co/v1/chat/completions"
HF_MODEL = "Qwen/Qwen2.5-7B-Instruct-1M:cheapest"


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

Formato limpio, claro y listo para enviar."""


def parse_hf_error(response):
    try:
        error_data = response.json()
        if isinstance(error_data, dict):
            if isinstance(error_data.get("error"), str) and error_data.get("error"):
                return error_data.get("error")
            if isinstance(error_data.get("message"), str) and error_data.get("message"):
                return error_data.get("message")
            return str(error_data)
    except Exception:
        pass

    return f"Error {response.status_code}: {response.text[:200]}"


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

        payload = {
            "model": HF_MODEL,
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
            return jsonify({"success": False, "error": f"Error en Hugging Face: {error_msg}"}), 400

        response_data = response.json()
        choices = response_data.get("choices") if isinstance(response_data, dict) else None
        if not choices:
            return jsonify({"success": False, "error": "Respuesta invalida de Hugging Face"}), 500

        message = choices[0].get("message", {}) if isinstance(choices[0], dict) else {}
        texto = str(message.get("content", "")).strip()

        if not texto:
            return jsonify({"success": False, "error": "No se recibio contenido de la IA"}), 500

        return jsonify({"success": True, "texto": texto})

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