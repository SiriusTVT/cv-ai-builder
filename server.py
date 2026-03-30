from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"

@app.route('/api/generar-cv', methods=['POST'])
def generar_cv():
    data = request.json
    
    # Obtener la clave API del cliente
    gemini_api_key = data.get("apiKey", "").strip()
    
    if not gemini_api_key:
        return jsonify({"success": False, "error": "Clave API de Gemini requerida"}), 400
    
    prompt = f"""
    Crea una hoja de vida profesional con esta información:

    Nombre: {data.get('nombre', '')}
    Perfil: {data.get('perfil', '')}
    Experiencia: {data.get('experiencia', '')}
    Educación: {data.get('educacion', '')}
    Habilidades: {data.get('habilidades', '')}

    Mejora la redacción y hazlo profesional.
    """
    
    try:
        response = requests.post(
            f"{GEMINI_URL}?key={gemini_api_key}",
            json={
                "contents": [{
                    "parts": [{"text": prompt}]
                }]
            }
        )
        
        if response.status_code == 200:
            response_data = response.json()
            texto = response_data['candidates'][0]['content']['parts'][0]['text']
            return jsonify({"success": True, "texto": texto})
        else:
            error_msg = response.json().get("error", {}).get("message", "Error desconocido")
            return jsonify({"success": False, "error": error_msg}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
