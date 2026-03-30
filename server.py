from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
from dotenv import load_dotenv
import traceback

load_dotenv()

app = Flask(__name__)
CORS(app)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"

@app.route('/api/generar-cv', methods=['POST'])
def generar_cv():
    try:
        data = request.json
        
        # Obtener la clave API del cliente
        gemini_api_key = data.get("apiKey", "").strip()
        
        if not gemini_api_key:
            return jsonify({"success": False, "error": "Clave API de Gemini requerida"}), 400
        
        nombre = data.get('nombre', '').strip()
        perfil = data.get('perfil', '').strip()
        experiencia = data.get('experiencia', '').strip()
        educacion = data.get('educacion', '').strip()
        habilidades = data.get('habilidades', '').strip()
        
        # Validar que haya al menos algo de contenido
        if not nombre:
            return jsonify({"success": False, "error": "El nombre es requerido"}), 400
        
        prompt = f"""
        Crea una hoja de vida profesional con esta información:

        Nombre: {nombre}
        Perfil: {perfil}
        Experiencia: {experiencia}
        Educación: {educacion}
        Habilidades: {habilidades}

        Mejora la redacción y hazlo profesional.
        """
        
        print(f"[INFO] Enviando solicitud a Gemini con clave: {gemini_api_key[:20]}...")
        
        # Llamar a la API de Gemini
        response = requests.post(
            f"{GEMINI_URL}?key={gemini_api_key}",
            json={
                "contents": [{
                    "parts": [{"text": prompt}]
                }]
            },
            timeout=30
        )
        
        print(f"[INFO] Respuesta de Gemini - Status: {response.status_code}")
        print(f"[DEBUG] Respuesta: {response.text[:500]}")
        
        if response.status_code == 200:
            response_data = response.json()
            
            # Validar que la respuesta tenga el formato esperado
            if 'candidates' not in response_data or not response_data['candidates']:
                return jsonify({
                    "success": False, 
                    "error": "Respuesta inválida de Gemini (sin contenido)"
                }), 500
            
            texto = response_data['candidates'][0]['content']['parts'][0]['text']
            return jsonify({"success": True, "texto": texto})
        else:
            # Gemini retornó un error
            try:
                error_data = response.json()
                error_msg = error_data.get("error", {}).get("message", "Error desconocido")
            except:
                error_msg = f"Error {response.status_code}: {response.text}"
            
            print(f"[ERROR] Error de Gemini: {error_msg}")
            
            return jsonify({
                "success": False, 
                "error": f"Error de Gemini: {error_msg}"
            }), 400
    
    except requests.exceptions.Timeout:
        return jsonify({
            "success": False,
            "error": "Tiempo de espera agotado. Intenta de nuevo."
        }), 504
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] Error de conexión: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Error de conexión: {str(e)}"
        }), 500
    except Exception as e:
        print(f"[ERROR] Error inesperado: {str(e)}")
        print(traceback.format_exc())
        return jsonify({
            "success": False,
            "error": f"Error inesperado: {str(e)}"
        }), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"}), 200

if __name__ == '__main__':
    print("🚀 Iniciando servidor Flask en http://127.0.0.1:5000")
    app.run(debug=True, port=5000)
