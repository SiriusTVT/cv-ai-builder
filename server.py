from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
from dotenv import load_dotenv
import traceback
import json

load_dotenv()

app = Flask(__name__)
CORS(app)

# API de Replicate para usar Qwen
REPLICATE_API_URL = "https://api.replicate.com/v1/predictions"
QWEN_MODEL = "qwen/qwen-72b"

@app.route('/api/generar-cv', methods=['POST'])
def generar_cv():
    try:
        data = request.json
        
        # Obtener la clave API del cliente (Replicate)
        replicate_api_key = data.get("apiKey", "").strip()
        
        if not replicate_api_key:
            return jsonify({"success": False, "error": "Clave API de Replicate requerida"}), 400
        
        nombre = data.get('nombre', '').strip()
        perfil = data.get('perfil', '').strip()
        experiencia = data.get('experiencia', '').strip()
        educacion = data.get('educacion', '').strip()
        habilidades = data.get('habilidades', '').strip()
        
        # Validar que haya al menos algo de contenido
        if not nombre:
            return jsonify({"success": False, "error": "El nombre es requerido"}), 400
        
        prompt = f"""Crea una hoja de vida profesional bien formateada con esta información:

Nombre: {nombre}
Perfil: {perfil}
Experiencia: {experiencia}
Educación: {educacion}
Habilidades: {habilidades}

Por favor:
1. Mejora la redacción y el formato
2. Hazlo profesional y atractivo
3. Organiza la información de forma clara
4. Usa viñetas donde sea apropiado"""
        
        print(f"[INFO] Usando Qwen via Replicate")
        print(f"[INFO] Clave: {replicate_api_key[:20]}...")
        
        # Llamar a la API de Replicate
        headers = {
            "Authorization": f"Token {replicate_api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "version": "2d19859c18c92054145331a3f74ab25eef51f01886d421c3b52495013d2a24a1",  # qwen-72b
            "input": {
                "prompt": prompt,
                "max_tokens": 1500,
                "temperature": 0.7,
                "top_p": 0.9
            }
        }
        
        response = requests.post(
            REPLICATE_API_URL,
            headers=headers,
            json=payload,
            timeout=60
        )
        
        print(f"[INFO] Respuesta de Replicate - Status: {response.status_code}")
        
        if response.status_code == 201:
            response_data = response.json()
            
            # Replicate devuelve un ID de predicción, necesitamos esperar
            prediction_id = response_data.get("id")
            print(f"[INFO] Predicción creada: {prediction_id}")
            
            # Esperar a que se complete
            import time
            max_attempts = 30
            for attempt in range(max_attempts):
                time.sleep(2)
                
                # Obtener el estado
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
                        
                        print(f"[INFO] CV generado exitosamente")
                        return jsonify({"success": True, "texto": texto})
                    
                    elif check_data.get("status") == "failed":
                        error = check_data.get("error", "Error desconocido en Replicate")
                        print(f"[ERROR] Predicción fallida: {error}")
                        return jsonify({
                            "success": False,
                            "error": f"Error en Replicate: {error}"
                        }), 400
            
            # Timeout
            return jsonify({
                "success": False,
                "error": "Tiempo de espera agotado. Intenta de nuevo."
            }), 504
        
        else:
            try:
                error_data = response.json()
                error_msg = error_data.get("detail", str(error_data))
            except:
                error_msg = f"Error {response.status_code}: {response.text[:200]}"
            
            print(f"[ERROR] Error de Replicate: {error_msg}")
            
            return jsonify({
                "success": False,
                "error": f"Error de Replicate: {error_msg}"
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
    print("📡 Usando Qwen via Replicate API")
    app.run(debug=True, port=5000)
