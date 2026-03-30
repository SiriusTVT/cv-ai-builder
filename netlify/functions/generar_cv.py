import json
import requests
import os

def handler(event, context):
    """Genera un CV usando la API de Gemini"""
    
    # Solo aceptar POST
    if event["httpMethod"] != "POST":
        return {
            "statusCode": 405,
            "body": json.dumps({"success": False, "error": "Método no permitido"})
        }
    
    try:
        # Parsear el body
        body = json.loads(event["body"])
        
        nombre = body.get("nombre", "")
        perfil = body.get("perfil", "")
        experiencia = body.get("experiencia", "")
        educacion = body.get("educacion", "")
        habilidades = body.get("habilidades", "")
        
        # Crear el prompt
        prompt = f"""
        Crea una hoja de vida profesional con esta información:

        Nombre: {nombre}
        Perfil: {perfil}
        Experiencia: {experiencia}
        Educación: {educacion}
        Habilidades: {habilidades}

        Mejora la redacción y hazlo profesional.
        """
        
        # Obtener la clave API desde variables de entorno
        gemini_api_key = os.environ.get("GEMINI_API_KEY")
        if not gemini_api_key:
            return {
                "statusCode": 500,
                "body": json.dumps({"success": False, "error": "Clave API no configurada"})
            }
        
        # Llamar a la API de Gemini
        gemini_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"
        response = requests.post(
            f"{gemini_url}?key={gemini_api_key}",
            json={
                "contents": [{
                    "parts": [{"text": prompt}]
                }]
            }
        )
        
        if response.status_code == 200:
            data = response.json()
            texto = data['candidates'][0]['content']['parts'][0]['text']
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                "body": json.dumps({"success": True, "texto": texto})
            }
        else:
            return {
                "statusCode": 500,
                "body": json.dumps({"success": False, "error": "Error en la API de Gemini"})
            }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"success": False, "error": str(e)})
        }
