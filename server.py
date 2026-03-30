import base64
import hashlib
import json
import os
import re
import secrets
import time
import unicodedata
import urllib.parse

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, request
from flask_cors import CORS

load_dotenv()

app = Flask(__name__)
CORS(app)

HF_CHAT_URL = "https://router.huggingface.co/v1/chat/completions"
HF_MODEL_CANDIDATES = [
    "google/gemma-2-2b-it:fastest",
    "openai/gpt-oss-20b:fastest",
    "openai/gpt-oss-120b:fastest",
    "Qwen/Qwen2.5-7B-Instruct-1M:fastest",
]
HF_MODEL_SET = set(HF_MODEL_CANDIDATES)

CANVA_API_BASE = "https://api.canva.com/rest/v1"
CANVA_OAUTH_AUTHORIZE_URL = "https://www.canva.com/api/oauth/authorize"
CANVA_OAUTH_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token"
CANVA_DEFAULT_SCOPES = [
    "design:content:write",
    "design:meta:read",
    "brandtemplate:content:read",
    "brandtemplate:meta:read",
    "asset:read",
    "asset:write",
]
CANVA_STATE_TTL_SECONDS = 10 * 60
CANVA_SESSION_TTL_GRACE_SECONDS = 60
CANVA_POLL_ATTEMPTS = 25
CANVA_POLL_INTERVAL_SECONDS = 1.2
MAX_IMAGE_BYTES = 8 * 1024 * 1024

CANVA_OAUTH_STATES = {}
CANVA_TOKEN_SESSIONS = {}


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


def parse_json_error(response):
    try:
        payload = response.json()
        if isinstance(payload, dict):
            nested_error = payload.get("error")
            if isinstance(nested_error, dict):
                message = nested_error.get("message")
                if isinstance(message, str) and message:
                    return message

            if isinstance(payload.get("error"), str) and payload.get("error"):
                return payload.get("error")

            if isinstance(payload.get("message"), str) and payload.get("message"):
                return payload.get("message")

            return str(payload)
    except Exception:
        pass

    return f"Error {response.status_code}: {response.text[:200]}"


def is_model_not_supported(error_msg):
    normalized = str(error_msg).lower()
    return "not supported by any provider" in normalized or "model_not_supported" in normalized


def resolve_model_sequence(requested_model):
    normalized = str(requested_model or "auto").strip()

    if not normalized or normalized == "auto":
        return list(HF_MODEL_CANDIDATES), None, "auto"

    if normalized in HF_MODEL_SET:
        return [normalized], None, normalized

    allowed_values = ", ".join(HF_MODEL_CANDIDATES)
    return None, f"Modelo no valido. Opciones: auto, {allowed_values}", normalized


def generar_texto_cv(hf_api_key, input_libre, requested_model):
    model_sequence, model_error, normalized_requested_model = resolve_model_sequence(requested_model)
    if model_error:
        return None, None, model_error, 400

    headers = {
        "Authorization": f"Bearer {hf_api_key}",
        "Content-Type": "application/json",
    }

    last_model_error = ""

    for model in model_sequence:
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
            error_msg = parse_json_error(response)
            if normalized_requested_model == "auto" and is_model_not_supported(error_msg):
                last_model_error = error_msg
                continue
            return None, None, f"Error en Hugging Face: {error_msg}", 400

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

        return texto, model, None, 200

    if last_model_error:
        if normalized_requested_model == "auto":
            return None, None, f"No hay modelos compatibles con tus providers habilitados. Detalle: {last_model_error}", 400
        return None, None, f"El modelo seleccionado no genero una salida valida. Detalle: {last_model_error}", 400

    return None, None, "No se pudo completar la solicitud con ningun modelo", 500


def get_canva_settings():
    scope_string = str(os.getenv("CANVA_SCOPES", "")).strip()
    scopes = scope_string.split() if scope_string else list(CANVA_DEFAULT_SCOPES)

    return {
        "client_id": str(os.getenv("CANVA_CLIENT_ID", "")).strip(),
        "client_secret": str(os.getenv("CANVA_CLIENT_SECRET", "")).strip(),
        "redirect_uri": str(
            os.getenv("CANVA_REDIRECT_URI", "http://localhost:5000/api/canva/oauth/callback")
        ).strip(),
        "frontend_url": str(os.getenv("CANVA_FRONTEND_URL", "http://localhost:8000/")).strip(),
        "scopes": scopes,
    }


def is_canva_configured(settings):
    return bool(settings["client_id"] and settings["client_secret"] and settings["redirect_uri"])


def cleanup_canva_states():
    now = time.time()
    expired = [
        state
        for state, payload in CANVA_OAUTH_STATES.items()
        if now - float(payload.get("created_at", 0)) > CANVA_STATE_TTL_SECONDS
    ]
    for state in expired:
        CANVA_OAUTH_STATES.pop(state, None)


def cleanup_canva_sessions():
    now = time.time()
    expired = [
        session_id
        for session_id, payload in CANVA_TOKEN_SESSIONS.items()
        if now > float(payload.get("expires_at", 0)) + CANVA_SESSION_TTL_GRACE_SECONDS
    ]
    for session_id in expired:
        CANVA_TOKEN_SESSIONS.pop(session_id, None)


def make_code_verifier():
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(72)).decode("ascii").rstrip("=")
    if len(verifier) < 43:
        verifier = verifier + ("a" * (43 - len(verifier)))
    return verifier[:128]


def make_code_challenge(code_verifier):
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def build_frontend_redirect(frontend_url, query_updates):
    parsed = urllib.parse.urlsplit(frontend_url)
    query = dict(urllib.parse.parse_qsl(parsed.query, keep_blank_values=True))
    query.update(query_updates)

    return urllib.parse.urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            urllib.parse.urlencode(query),
            parsed.fragment,
        )
    )


def sanitize_frontend_url(candidate_url, fallback_url):
    raw = str(candidate_url or "").strip()
    if not raw:
        return fallback_url

    parsed = urllib.parse.urlsplit(raw)
    if parsed.scheme not in {"http", "https"}:
        return fallback_url

    if not parsed.netloc:
        return fallback_url

    return raw


def request_canva_token(grant_type, token_value, code_verifier=None):
    settings = get_canva_settings()
    if not is_canva_configured(settings):
        return None, "Faltan variables de entorno de Canva (CANVA_CLIENT_ID/CANVA_CLIENT_SECRET/CANVA_REDIRECT_URI)"

    credentials = f"{settings['client_id']}:{settings['client_secret']}".encode("utf-8")
    basic_auth = base64.b64encode(credentials).decode("ascii")

    headers = {
        "Authorization": f"Basic {basic_auth}",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    body = {
        "grant_type": grant_type,
    }

    if grant_type == "authorization_code":
        body.update(
            {
                "code": token_value,
                "code_verifier": code_verifier or "",
                "redirect_uri": settings["redirect_uri"],
            }
        )
    else:
        body.update(
            {
                "refresh_token": token_value,
            }
        )

    response = requests.post(CANVA_OAUTH_TOKEN_URL, headers=headers, data=body, timeout=30)
    if response.status_code != 200:
        return None, parse_json_error(response)

    payload = response.json() if response.content else {}
    access_token = str(payload.get("access_token", "")).strip()
    if not access_token:
        return None, "Canva no devolvio un access_token valido"

    return payload, None


def ensure_canva_access_token(session_id):
    cleanup_canva_sessions()

    key = str(session_id or "").strip()
    if not key:
        return None, "Debes conectar Canva primero.", 401

    session = CANVA_TOKEN_SESSIONS.get(key)
    if not session:
        return None, "Sesion Canva no encontrada o vencida. Conecta Canva nuevamente.", 401

    now = time.time()
    expires_at = float(session.get("expires_at", 0))
    if now < expires_at - 60:
        return session.get("access_token"), None, 200

    refresh_token = str(session.get("refresh_token", "")).strip()
    if not refresh_token:
        return None, "La sesion Canva expiro y no se pudo refrescar. Conecta Canva nuevamente.", 401

    token_payload, token_error = request_canva_token("refresh_token", refresh_token)
    if token_error:
        return None, f"No se pudo refrescar la sesion Canva: {token_error}", 401

    expires_in = int(token_payload.get("expires_in") or 3600)
    session["access_token"] = token_payload.get("access_token")
    session["refresh_token"] = token_payload.get("refresh_token") or refresh_token
    session["scope"] = token_payload.get("scope") or session.get("scope", "")
    session["expires_at"] = now + max(60, expires_in)

    CANVA_TOKEN_SESSIONS[key] = session
    return session.get("access_token"), None, 200


def canva_request(method, path, access_token, *, headers=None, json_body=None, data_body=None, timeout=60):
    req_headers = {
        "Authorization": f"Bearer {access_token}",
    }
    if headers:
        req_headers.update(headers)

    response = requests.request(
        method,
        f"{CANVA_API_BASE}{path}",
        headers=req_headers,
        json=json_body,
        data=data_body,
        timeout=timeout,
    )

    if response.status_code >= 400:
        return None, parse_json_error(response), response.status_code

    if not response.content:
        return {}, None, response.status_code

    try:
        return response.json(), None, response.status_code
    except Exception:
        return {"raw": response.text}, None, response.status_code


def decode_photo_data_url(photo_data_url):
    text = str(photo_data_url or "").strip()
    if not text:
        return None, None, "Debes adjuntar una foto para insertar en Canva."

    match = re.match(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$", text, flags=re.DOTALL)
    if not match:
        return None, None, "Formato de foto invalido. Debe ser una imagen en base64."

    mime_type = match.group(1).lower()
    encoded = re.sub(r"\s+", "", match.group(2))

    try:
        photo_bytes = base64.b64decode(encoded, validate=True)
    except Exception:
        return None, None, "No se pudo leer la foto seleccionada."

    if len(photo_bytes) > MAX_IMAGE_BYTES:
        return None, None, "La foto supera el limite de 8 MB."

    extension_map = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    }
    extension = extension_map.get(mime_type)
    if not extension:
        return None, None, "Formato de imagen no soportado. Usa JPG, PNG, WEBP o GIF."

    filename = f"foto_cv_{int(time.time())}.{extension}"
    return photo_bytes, filename, None


def wait_for_asset_upload(access_token, job_id):
    for _ in range(CANVA_POLL_ATTEMPTS):
        result, error, _ = canva_request("GET", f"/asset-uploads/{job_id}", access_token)
        if error:
            return None, error

        job = result.get("job") if isinstance(result, dict) else None
        status = str((job or {}).get("status", "")).lower()

        if status == "success":
            asset = (job or {}).get("asset") or {}
            asset_id = str(asset.get("id", "")).strip()
            if asset_id:
                return asset_id, None
            return None, "Canva marco la subida como exitosa pero no devolvio asset_id"

        if status == "failed":
            err_payload = (job or {}).get("error") or {}
            err_message = err_payload.get("message") if isinstance(err_payload, dict) else str(err_payload)
            return None, err_message or "Canva no pudo procesar la foto"

        time.sleep(CANVA_POLL_INTERVAL_SECONDS)

    return None, "Timeout esperando la subida de foto en Canva"


def upload_photo_to_canva(access_token, photo_bytes, filename):
    metadata_header = json.dumps(
        {
            "name_base64": base64.b64encode(filename.encode("utf-8")).decode("ascii"),
        }
    )

    result, error, _ = canva_request(
        "POST",
        "/asset-uploads",
        access_token,
        headers={
            "Content-Type": "application/octet-stream",
            "Asset-Upload-Metadata": metadata_header,
        },
        data_body=photo_bytes,
    )

    if error:
        return None, error

    job = result.get("job") if isinstance(result, dict) else None
    if not isinstance(job, dict):
        return None, "Canva no devolvio informacion del trabajo de subida"

    status = str(job.get("status", "")).lower()
    if status == "success":
        asset = job.get("asset") or {}
        asset_id = str(asset.get("id", "")).strip()
        if asset_id:
            return asset_id, None

    job_id = str(job.get("id", "")).strip()
    if not job_id:
        return None, "Canva no devolvio id del trabajo de subida"

    return wait_for_asset_upload(access_token, job_id)


def wait_for_autofill(access_token, job_id):
    for _ in range(CANVA_POLL_ATTEMPTS):
        result, error, _ = canva_request("GET", f"/autofills/{job_id}", access_token)
        if error:
            return None, error

        job = result.get("job") if isinstance(result, dict) else None
        status = str((job or {}).get("status", "")).lower()

        if status == "success":
            design = ((job or {}).get("result") or {}).get("design") or {}
            if design:
                return design, None
            return None, "Canva finalizo el autofill, pero no devolvio informacion del diseno"

        if status == "failed":
            err_payload = (job or {}).get("error") or {}
            err_message = err_payload.get("message") if isinstance(err_payload, dict) else str(err_payload)
            return None, err_message or "No se pudo completar el autofill en Canva"

        time.sleep(CANVA_POLL_INTERVAL_SECONDS)

    return None, "Timeout esperando la generacion del diseno en Canva"


def get_brand_template_dataset(access_token, brand_template_id):
    safe_id = urllib.parse.quote(str(brand_template_id), safe="")
    result, error, _ = canva_request("GET", f"/brand-templates/{safe_id}/dataset", access_token)
    if error:
        return None, error

    dataset = result.get("dataset") if isinstance(result, dict) else None
    if not isinstance(dataset, dict) or not dataset:
        return None, "La plantilla de Canva no tiene campos de autofill configurados"

    return dataset, None


def normalize_text(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    return text


def detect_section_heading(line):
    trimmed = str(line or "").strip()
    if not trimmed:
        return None

    if ":" not in trimmed:
        return None

    candidate = normalize_text(trimmed.split(":", 1)[0])
    if "nombre" in candidate or "name" in candidate:
        return "nombre"
    if "perfil" in candidate or "resumen" in candidate or "summary" in candidate:
        return "perfil_profesional"
    if "experiencia" in candidate or "experience" in candidate:
        return "experiencia"
    if "educacion" in candidate or "estudios" in candidate or "education" in candidate or "formacion" in candidate:
        return "educacion"
    if "habilidades" in candidate or "skills" in candidate or "competencias" in candidate:
        return "habilidades"
    if "contact" in candidate or "contacto" in candidate:
        return "contacto"

    return None


def extract_contact_info(cv_text):
    text = str(cv_text or "")
    emails = re.findall(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text)
    phones = re.findall(r"\+?\d[\d\s().-]{7,}\d", text)

    parts = []
    if emails:
        parts.append(f"Email: {emails[0]}")
    if phones:
        parts.append(f"Telefono: {phones[0]}")

    return " | ".join(parts)


def extract_cv_sections(cv_text):
    sections = {
        "nombre": [],
        "perfil_profesional": [],
        "experiencia": [],
        "educacion": [],
        "habilidades": [],
        "contacto": [],
    }
    current_section = None

    for raw_line in str(cv_text or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue

        heading = detect_section_heading(line)
        if heading:
            current_section = heading
            tail = line.split(":", 1)[1].strip() if ":" in line else ""
            if tail:
                sections[heading].append(tail)
            continue

        if current_section:
            sections[current_section].append(line)

    normalized = {}
    for key, values in sections.items():
        text = "\n".join(values).strip()
        normalized[key] = text

    if not normalized["nombre"]:
        for line in str(cv_text or "").splitlines():
            candidate = line.strip()
            if candidate and len(candidate) <= 70 and ":" not in candidate:
                normalized["nombre"] = candidate
                break

    if not normalized["contacto"]:
        normalized["contacto"] = extract_contact_info(cv_text)

    normalized["cv_completo"] = str(cv_text or "").strip()
    return normalized


def clamp_text(value, max_len=1600):
    text = str(value or "").strip()
    if len(text) <= max_len:
        return text
    return f"{text[: max_len - 3].strip()}..."


def pick_text_for_field(field_name, sections, fallback_values, used_fallback_index):
    normalized_field = normalize_text(field_name)

    def has_any(*terms):
        return any(term in normalized_field for term in terms)

    if has_any("nombre", "name", "full name"):
        if sections.get("nombre"):
            return sections["nombre"], used_fallback_index

    if has_any("perfil", "summary", "resumen", "about"):
        if sections.get("perfil_profesional"):
            return sections["perfil_profesional"], used_fallback_index

    if has_any("experiencia", "experience", "work", "laboral"):
        if sections.get("experiencia"):
            return sections["experiencia"], used_fallback_index

    if has_any("educacion", "education", "estudios", "academica", "formacion"):
        if sections.get("educacion"):
            return sections["educacion"], used_fallback_index

    if has_any("habilidad", "skills", "competencia"):
        if sections.get("habilidades"):
            return sections["habilidades"], used_fallback_index

    if has_any("contact", "correo", "telefono", "email", "phone"):
        if sections.get("contacto"):
            return sections["contacto"], used_fallback_index

    for idx in range(used_fallback_index, len(fallback_values)):
        candidate = fallback_values[idx]
        if candidate:
            return candidate, idx + 1

    return sections.get("cv_completo", ""), used_fallback_index


def build_autofill_data(dataset, sections, photo_asset_id):
    autofill_data = {}
    warnings = []

    image_fields = []
    text_fields = []

    for key, meta in dataset.items():
        item_type = ""
        if isinstance(meta, dict):
            item_type = str(meta.get("type", "")).lower()

        if item_type == "image":
            image_fields.append(key)
        elif item_type == "text":
            text_fields.append(key)

    if image_fields and photo_asset_id:
        for field_name in image_fields:
            autofill_data[field_name] = {
                "type": "image",
                "asset_id": photo_asset_id,
            }
    elif image_fields and not photo_asset_id:
        warnings.append("La plantilla tiene campos de imagen, pero no se pudo subir la foto.")
    elif photo_asset_id and not image_fields:
        warnings.append("La plantilla no tiene campos de imagen para insertar la foto.")

    fallback_values = [
        sections.get("nombre", ""),
        sections.get("perfil_profesional", ""),
        sections.get("experiencia", ""),
        sections.get("educacion", ""),
        sections.get("habilidades", ""),
        sections.get("contacto", ""),
        sections.get("cv_completo", ""),
    ]

    fallback_idx = 0
    for field_name in text_fields:
        value, fallback_idx = pick_text_for_field(field_name, sections, fallback_values, fallback_idx)
        clean_value = clamp_text(value)
        if not clean_value:
            continue

        autofill_data[field_name] = {
            "type": "text",
            "text": clean_value,
        }

    if not autofill_data:
        return None, warnings, "No se pudieron mapear campos para autofill en la plantilla seleccionada"

    return autofill_data, warnings, None


def create_autofill_design(access_token, brand_template_id, autofill_data, title):
    payload = {
        "brand_template_id": brand_template_id,
        "title": title,
        "data": autofill_data,
    }

    result, error, _ = canva_request(
        "POST",
        "/autofills",
        access_token,
        headers={"Content-Type": "application/json"},
        json_body=payload,
    )
    if error:
        return None, error

    job = result.get("job") if isinstance(result, dict) else None
    if not isinstance(job, dict):
        return None, "Canva no devolvio informacion del trabajo de autofill"

    status = str(job.get("status", "")).lower()
    if status == "success":
        design = ((job.get("result") or {}).get("design")) or {}
        if design:
            return design, None

    job_id = str(job.get("id", "")).strip()
    if not job_id:
        return None, "Canva no devolvio id del trabajo de autofill"

    return wait_for_autofill(access_token, job_id)


@app.route("/api/generar-cv", methods=["POST"])
def generar_cv():
    try:
        data = request.get_json(silent=True) or {}

        hf_api_key = str(data.get("apiKey", "")).strip()
        input_libre = str(data.get("inputLibre", "")).strip()
        requested_model = str(data.get("requestedModel", "auto")).strip()

        if not hf_api_key:
            return jsonify({"success": False, "error": "Token de Hugging Face requerido"}), 400

        if not input_libre:
            return jsonify({"success": False, "error": "Debes ingresar informacion en el cuadro de texto"}), 400

        texto, modelo, error, status = generar_texto_cv(hf_api_key, input_libre, requested_model)
        if error:
            return jsonify({"success": False, "error": error}), status

        return jsonify({"success": True, "texto": texto, "modelo": modelo})

    except requests.exceptions.Timeout:
        return jsonify({"success": False, "error": "Tiempo de espera agotado. Intenta de nuevo."}), 504
    except requests.exceptions.RequestException as exc:
        return jsonify({"success": False, "error": f"Error de conexion: {str(exc)}"}), 500
    except Exception as exc:
        return jsonify({"success": False, "error": f"Error inesperado: {str(exc)}"}), 500


@app.route("/api/canva/status", methods=["GET"])
def canva_status():
    settings = get_canva_settings()
    session_id = str(request.args.get("sessionId", "")).strip()
    cleanup_canva_sessions()

    connected = False
    if session_id:
        session = CANVA_TOKEN_SESSIONS.get(session_id)
        if session and float(session.get("expires_at", 0)) > time.time():
            connected = True

    return jsonify(
        {
            "success": True,
            "configured": is_canva_configured(settings),
            "connected": connected,
            "requiresEnterpriseForAutofill": True,
        }
    )


@app.route("/api/canva/auth/start", methods=["GET"])
def canva_auth_start():
    settings = get_canva_settings()
    if not is_canva_configured(settings):
        return jsonify(
            {
                "success": False,
                "error": "Canva no esta configurado en el backend. Define CANVA_CLIENT_ID, CANVA_CLIENT_SECRET y CANVA_REDIRECT_URI.",
            }
        ), 500

    cleanup_canva_states()

    frontend_target = sanitize_frontend_url(request.args.get("frontend"), settings["frontend_url"])
    code_verifier = make_code_verifier()
    code_challenge = make_code_challenge(code_verifier)
    state = secrets.token_urlsafe(32)

    CANVA_OAUTH_STATES[state] = {
        "code_verifier": code_verifier,
        "created_at": time.time(),
        "frontend_url": frontend_target,
    }

    params = {
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "scope": " ".join(settings["scopes"]),
        "response_type": "code",
        "client_id": settings["client_id"],
        "state": state,
        "redirect_uri": settings["redirect_uri"],
    }
    auth_url = f"{CANVA_OAUTH_AUTHORIZE_URL}?{urllib.parse.urlencode(params)}"
    return redirect(auth_url)


@app.route("/api/canva/oauth/callback", methods=["GET"])
def canva_oauth_callback():
    settings = get_canva_settings()
    fallback_frontend = settings["frontend_url"]

    oauth_error = str(request.args.get("error", "")).strip()
    oauth_error_description = str(request.args.get("error_description", "")).strip()
    state = str(request.args.get("state", "")).strip()
    code = str(request.args.get("code", "")).strip()

    cleanup_canva_states()

    state_payload = CANVA_OAUTH_STATES.pop(state, None)
    frontend_target = fallback_frontend
    if isinstance(state_payload, dict):
        frontend_target = state_payload.get("frontend_url") or fallback_frontend

    if oauth_error:
        message = oauth_error_description or oauth_error
        return redirect(build_frontend_redirect(frontend_target, {"canva_error": message}))

    if not state_payload:
        return redirect(build_frontend_redirect(frontend_target, {"canva_error": "Estado OAuth invalido o expirado"}))

    if not code:
        return redirect(build_frontend_redirect(frontend_target, {"canva_error": "Canva no devolvio codigo de autorizacion"}))

    code_verifier = str(state_payload.get("code_verifier", "")).strip()
    token_payload, token_error = request_canva_token("authorization_code", code, code_verifier=code_verifier)
    if token_error:
        return redirect(build_frontend_redirect(frontend_target, {"canva_error": token_error}))

    session_id = secrets.token_urlsafe(28)
    expires_in = int(token_payload.get("expires_in") or 3600)
    now = time.time()

    CANVA_TOKEN_SESSIONS[session_id] = {
        "access_token": token_payload.get("access_token"),
        "refresh_token": token_payload.get("refresh_token"),
        "scope": token_payload.get("scope", ""),
        "created_at": now,
        "expires_at": now + max(60, expires_in),
    }

    cleanup_canva_sessions()
    return redirect(
        build_frontend_redirect(
            frontend_target,
            {
                "canva_connected": "1",
                "canva_session_id": session_id,
            },
        )
    )


@app.route("/api/canva/disconnect", methods=["POST"])
def canva_disconnect():
    data = request.get_json(silent=True) or {}
    session_id = str(data.get("canvaSessionId", "")).strip()
    if session_id:
        CANVA_TOKEN_SESSIONS.pop(session_id, None)

    return jsonify({"success": True})


@app.route("/api/generar-cv-canva", methods=["POST"])
def generar_cv_canva():
    try:
        data = request.get_json(silent=True) or {}

        hf_api_key = str(data.get("apiKey", "")).strip()
        input_libre = str(data.get("inputLibre", "")).strip()
        requested_model = str(data.get("requestedModel", "auto")).strip()
        canva_session_id = str(data.get("canvaSessionId", "")).strip()
        canva_template_id = str(data.get("canvaTemplateId", "")).strip()
        foto_data_url = str(data.get("fotoDataUrl", "")).strip()

        if not hf_api_key:
            return jsonify({"success": False, "error": "Token de Hugging Face requerido"}), 400

        if not input_libre:
            return jsonify({"success": False, "error": "Debes ingresar informacion en el cuadro de texto"}), 400

        if not canva_template_id:
            return jsonify({"success": False, "error": "Debes ingresar el Brand Template ID de Canva"}), 400

        if not foto_data_url:
            return jsonify({"success": False, "error": "Debes cargar una foto para insertarla en Canva"}), 400

        canva_access_token, token_error, token_status = ensure_canva_access_token(canva_session_id)
        if token_error:
            return jsonify({"success": False, "error": token_error}), token_status

        texto_cv, modelo_usado, cv_error, cv_status = generar_texto_cv(hf_api_key, input_libre, requested_model)
        if cv_error:
            return jsonify({"success": False, "error": cv_error}), cv_status

        photo_bytes, photo_filename, photo_error = decode_photo_data_url(foto_data_url)
        if photo_error:
            return jsonify({"success": False, "error": photo_error}), 400

        asset_id, asset_error = upload_photo_to_canva(canva_access_token, photo_bytes, photo_filename)
        if asset_error:
            return jsonify({"success": False, "error": f"No se pudo subir la foto a Canva: {asset_error}"}), 400

        dataset, dataset_error = get_brand_template_dataset(canva_access_token, canva_template_id)
        if dataset_error:
            return jsonify({
                "success": False,
                "error": f"No se pudo leer la plantilla de Canva: {dataset_error}",
            }), 400

        sections = extract_cv_sections(texto_cv)
        autofill_data, warnings, map_error = build_autofill_data(dataset, sections, asset_id)
        if map_error:
            return jsonify({"success": False, "error": map_error}), 400

        design, design_error = create_autofill_design(
            canva_access_token,
            canva_template_id,
            autofill_data,
            title=f"CV - {sections.get('nombre') or 'Generado con IA'}",
        )
        if design_error:
            return jsonify({"success": False, "error": f"Canva no pudo generar el diseno: {design_error}"}), 400

        urls = design.get("urls") if isinstance(design, dict) else {}
        thumbnail = design.get("thumbnail") if isinstance(design, dict) else {}

        return jsonify(
            {
                "success": True,
                "texto": texto_cv,
                "modelo": modelo_usado,
                "warnings": warnings,
                "canva": {
                    "designId": str(design.get("id", "")),
                    "title": str(design.get("title", "")),
                    "editUrl": str((urls or {}).get("edit_url") or design.get("url", "")),
                    "viewUrl": str((urls or {}).get("view_url", "")),
                    "thumbnailUrl": str((thumbnail or {}).get("url", "")),
                    "mappedFields": sorted(list(autofill_data.keys())),
                },
            }
        )

    except requests.exceptions.Timeout:
        return jsonify({"success": False, "error": "Tiempo de espera agotado al comunicarse con servicios externos"}), 504
    except requests.exceptions.RequestException as exc:
        return jsonify({"success": False, "error": f"Error de conexion: {str(exc)}"}), 500
    except Exception as exc:
        return jsonify({"success": False, "error": f"Error inesperado: {str(exc)}"}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


if __name__ == "__main__":
    app.run(debug=True, port=5000)