from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyA-dYrRfDfwhocfOSSpSC8UR7qfhh4AdC0")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"

@app.route('/api/generar-cv', methods=['POST'])
def generar_cv():
    data = request.json
    
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
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            json={
                "contents": [{
                    "parts": [{"text": prompt}]
                }]
            }
        )
        
        if response.status_code == 200:
            data = response.json()
            texto = data['candidates'][0]['content']['parts'][0]['text']
            return jsonify({"success": True, "texto": texto})
        else:
            return jsonify({"success": False, "error": "Error en la API de Gemini"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
