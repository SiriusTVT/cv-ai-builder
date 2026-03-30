import json
import requests
import time

def handler(event, context):
    """Genera un CV usando Qwen via Replicate API"""
    
    # Solo aceptar POST
    if event["httpMethod"] != "POST":
        return {
            "statusCode": 405,
            "body": json.dumps({"success": False, "error": "Método no permitido"})
        }
    
    try:
        # Parsear el body
        body = json.loads(event["body"])
        
        replicate_api_key = body.get("apiKey", "").strip()
        nombre = body.get("nombre", "").strip()
        perfil = body.get("perfil", "").strip()
        experiencia = body.get("experiencia", "").strip()
        educacion = body.get("educacion", "").strip()
        habilidades = body.get("habilidades", "").strip()
        
        # Validar que se proporcione la clave API
        if not replicate_api_key:
            return {
                "statusCode": 400,
                "body": json.dumps({"success": False, "error": "Clave API de Replicate requerida"})
            }
        
        if not nombre:
            return {
                "statusCode": 400,
                "body": json.dumps({"success": False, "error": "El nombre es requerido"})
            }
        
        # Crear el prompt
        prompt = f"""Eres un experto en reclutamiento, redacción profesional y optimización de hojas de vida (ATS).

Tu tarea es transformar esta información en una hoja de vida profesional, clara y atractiva.

INFORMACIÓN PROPORCIONADA:
- Nombre: {nombre}
- Perfil: {perfil}
- Experiencia: {experiencia}
- Educación: {educacion}
- Habilidades: {habilidades}

INSTRUCCIONES:

1. Extrae y organiza la información en estas secciones:
   • Nombre
   • Perfil profesional (resumen ejecutivo)
   • Experiencia laboral (con logros cuantificables)
   • Educación
   • Habilidades (organizadas por categoría)

2. Mejora completamente la redacción:
   - Usa lenguaje claro, profesional y persuasivo
   - Usa verbos de acción (lideré, implementé, desarrollé, etc.)
   - Convierte descripciones simples en contenido profesional
   - Destaca logros y resultados medibles

3. Optimiza para sistemas ATS:
   - Estructura clara y bien organizada
   - Palabras clave relevantes por industria
   - Formato profesional sin caracteres especiales

4. Si alguna información está incompleta:
   - Infiérela inteligentemente sin inventar hechos falsos
   - Completa gaps razonablemente
   - Mantén coherencia y realismo

5. Genera una hoja de vida:
   - Profesional y lista para enviar
   - Impactante y memorable
   - Optimizada para ATS
   - Coherente y bien estructurada

SALIDA:
Proporciona la hoja de vida completa, estructurada y profesional."""
        
        # Headers para Replicate
        headers = {
            "Authorization": f"Token {replicate_api_key}",
            "Content-Type": "application/json"
        }
        
        # Payload para Qwen en Replicate
        payload = {
            "version": "2d19859c18c92054145331a3f74ab25eef51f01886d421c3b52495013d2a24a1",  # qwen-72b
            "input": {
                "prompt": prompt,
                "max_tokens": 1500,
                "temperature": 0.7,
                "top_p": 0.9
            }
        }
        
        # Crear predicción en Replicate
        response = requests.post(
            "https://api.replicate.com/v1/predictions",
            headers=headers,
            json=payload,
            timeout=30
        )
        
        if response.status_code != 201:
            try:
                error_data = response.json()
                error_msg = error_data.get("detail", str(error_data))
            except:
                error_msg = f"Error {response.status_code}"
            
            return {
                "statusCode": 400,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                "body": json.dumps({"success": False, "error": f"Error en Replicate: {error_msg}"})
            }
        
        response_data = response.json()
        prediction_id = response_data.get("id")
        
        # Esperar a que la predicción se complete (máximo 50 segundos)
        max_attempts = 25
        for attempt in range(max_attempts):
            time.sleep(2)
            
            # Obtener el estado de la predicción
            check_response = requests.get(
                f"https://api.replicate.com/v1/predictions/{prediction_id}",
                headers=headers,
                timeout=10
            )
            
            if check_response.status_code == 200:
                check_data = check_response.json()
                
                if check_data.get("status") == "succeeded":
                    output = check_data.get("output", [])
                    if isinstance(output, list):
                        texto = "".join(output)
                    else:
                        texto = str(output)
                    
                    return {
                        "statusCode": 200,
                        "headers": {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*"
                        },
                        "body": json.dumps({"success": True, "texto": texto})
                    }
                
                elif check_data.get("status") == "failed":
                    error = check_data.get("error", "Error desconocido")
                    return {
                        "statusCode": 400,
                        "headers": {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*"
                        },
                        "body": json.dumps({"success": False, "error": f"Error en Replicate: {error}"})
                    }
        
        # Timeout
        return {
            "statusCode": 504,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": json.dumps({"success": False, "error": "Tiempo de espera agotado. Intenta de nuevo."})
        }
    
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": json.dumps({"success": False, "error": str(e)})
        }
