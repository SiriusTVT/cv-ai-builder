import json
import time
import requests

REPLICATE_API_URL = "https://api.replicate.com/v1/predictions"
QWEN_VERSION = "2d19859c18c92054145331a3f74ab25eef51f01886d421c3b52495013d2a24a1"


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
\"\"\"
{input_libre}
\"\"\"

SALIDA:
Genera una hoja de vida estructurada con:
- Nombre
- Perfil profesional
- Experiencia
- Educacion
- Habilidades

Formato limpio, claro y listo para enviar."""


def parse_replicate_error(response):
    try:
        error_data = response.json()
        detail = error_data.get("detail")
        if isinstance(detail, str) and detail:
            return detail
        if isinstance(error_data, dict):
            return str(error_data)
    except Exception:
        pass

    return f"Error {response.status_code}: {response.text[:200]}"


def handler(event, context):
    if event.get("httpMethod") != "POST":
        return {
            "statusCode": 405,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({"success": False, "error": "Metodo no permitido"}),
        }

    try:
        body = json.loads(event.get("body") or "{}")

        replicate_api_key = str(body.get("apiKey", "")).strip()
        input_libre = str(body.get("inputLibre", "")).strip()

        if not replicate_api_key:
            return {
                "statusCode": 400,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                "body": json.dumps({"success": False, "error": "Clave API de Replicate requerida"}),
            }

        if not input_libre:
            return {
                "statusCode": 400,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                "body": json.dumps({"success": False, "error": "Debes ingresar informacion en el cuadro de texto"}),
            }

        headers = {
            "Authorization": f"Token {replicate_api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "version": QWEN_VERSION,
            "input": {
                "prompt": construir_prompt(input_libre),
                "max_tokens": 1500,
                "temperature": 0.7,
                "top_p": 0.9,
            },
        }

        create_response = requests.post(
            REPLICATE_API_URL,
            headers=headers,
            json=payload,
            timeout=30,
        )

        if create_response.status_code != 201:
            error_msg = parse_replicate_error(create_response)
            return {
                "statusCode": 400,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                "body": json.dumps({"success": False, "error": f"Error en Replicate: {error_msg}"}),
            }

        prediction_id = create_response.json().get("id")
        if not prediction_id:
            return {
                "statusCode": 500,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                "body": json.dumps({"success": False, "error": "Replicate no devolvio id de prediccion"}),
            }

        for _ in range(25):
            time.sleep(2)

            status_response = requests.get(
                f"{REPLICATE_API_URL}/{prediction_id}",
                headers=headers,
                timeout=10,
            )

            if status_response.status_code != 200:
                continue

            status_data = status_response.json()
            status = status_data.get("status")

            if status == "succeeded":
                output = status_data.get("output", "")
                if isinstance(output, list):
                    texto = "".join(output)
                else:
                    texto = str(output)

                if not texto.strip():
                    texto = "No se recibio contenido de la IA. Intenta de nuevo."

                return {
                    "statusCode": 200,
                    "headers": {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    },
                    "body": json.dumps({"success": True, "texto": texto}),
                }

            if status in {"failed", "canceled"}:
                error_msg = status_data.get("error", "La prediccion fallo")
                return {
                    "statusCode": 400,
                    "headers": {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    },
                    "body": json.dumps({"success": False, "error": f"Error en Replicate: {error_msg}"}),
                }

        return {
            "statusCode": 504,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({"success": False, "error": "Tiempo de espera agotado. Intenta de nuevo."}),
        }

    except requests.exceptions.Timeout:
        return {
            "statusCode": 504,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({"success": False, "error": "Tiempo de espera agotado. Intenta de nuevo."}),
        }
    except requests.exceptions.RequestException as exc:
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({"success": False, "error": f"Error de conexion: {str(exc)}"}),
        }
    except Exception as exc:
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({"success": False, "error": str(exc)}),
        }