from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import re

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


def normalize_spaces(text):
    return re.sub(r"\s+", " ", str(text or "")).strip()


def split_fragments(text):
    raw = str(text or "")
    parts = re.split(r"[\n\r.;]+", raw)
    cleaned = [normalize_spaces(part) for part in parts]
    return [part for part in cleaned if part]


def unique_first(items, max_items=5):
    output = []
    seen = set()

    for item in items:
        clean = normalize_spaces(item)
        if not clean:
            continue

        key = clean.lower()
        if key in seen:
            continue

        seen.add(key)
        output.append(clean)
        if len(output) >= max_items:
            break

    return output


def extract_name_hint(text):
    match = re.match(r"^\s*([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+){1,4})", str(text or ""))
    if match:
        return normalize_spaces(match.group(1))
    return ""


def extract_contact_hints(text):
    raw = str(text or "")
    emails = unique_first(re.findall(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", raw), 2)
    phones = unique_first(re.findall(r"(?:\+?\d[\d\s\-()]{7,}\d)", raw), 2)
    return emails, phones


def extract_fragments_by_keywords(fragments, keywords, max_items=4):
    output = []
    for fragment in fragments:
        lowered = fragment.lower()
        if any(keyword in lowered for keyword in keywords):
            output.append(fragment)
    return unique_first(output, max_items)


def extract_education_institution_hints(fragments):
    university_hints = extract_fragments_by_keywords(
        fragments,
        ["universidad", "university", "institucion universitaria", "instituto", "politecnico", "tecnolog", "facultad"],
        3,
    )
    school_hints = extract_fragments_by_keywords(
        fragments,
        ["colegio", "escuela", "liceo", "institucion educativa", "bachiller"],
        3,
    )
    generic_education_hints = extract_fragments_by_keywords(
        fragments,
        ["semestre", "educacion", "formacion", "pregrado", "maestr", "tecnico", "tecnologo", "diplomado"],
        4,
    )

    categorized = {item.lower() for item in university_hints + school_hints}
    filtered_generic_hints = [item for item in generic_education_hints if item.lower() not in categorized]

    education_hints = unique_first(
        [f"Universidad: {item}" for item in university_hints]
        + [f"Colegio: {item}" for item in school_hints]
        + filtered_generic_hints,
        6,
    )

    return university_hints, school_hints, education_hints


def extract_location_hint(text):
    lowered = str(text or "").lower()

    if "cali" in lowered and "colombia" in lowered:
        return "Cali, Colombia"

    cities = ["cali", "bogota", "medellin", "colombia", "mexico", "peru", "chile", "argentina", "ecuador", "espana"]
    for city in cities:
        if city in lowered:
            return city.capitalize()

    return ""


def extract_availability_hint(text):
    lowered = str(text or "").lower()
    full_time = "tiempo completo" in lowered or "full time" in lowered or "full-time" in lowered
    part_time = "medio tiempo" in lowered or "part time" in lowered or "part-time" in lowered
    remote = "remoto" in lowered or "remote" in lowered or "hibrido" in lowered or "hybrid" in lowered

    if full_time:
        return "Disponible para jornada completa" + (" y trabajo remoto/hibrido" if remote else "")
    if part_time:
        return "Disponible para jornada parcial" + (" y trabajo remoto/hibrido" if remote else "")
    if remote:
        return "Abierto a trabajo remoto/hibrido"

    return "Disponibilidad sujeta a acuerdo"


def build_structured_input_block(input_libre):
    raw = str(input_libre or "")
    fragments = split_fragments(raw)

    name_hint = extract_name_hint(raw)
    location_hint = extract_location_hint(raw)
    availability_hint = extract_availability_hint(raw)
    emails, phones = extract_contact_hints(raw)

    university_hints, school_hints, education_hints = extract_education_institution_hints(fragments)
    experience_hints = extract_fragments_by_keywords(
        fragments,
        ["experiencia", "trabaj", "aprendiz", "practic", "manager", "empresa", "cargo", "rol", "desde", "actualmente"],
    )
    project_hints = extract_fragments_by_keywords(
        fragments,
        ["proyecto", "project", "producto", "implement", "desarrollo", "automatizacion", "produccion"],
    )
    skill_hints = extract_fragments_by_keywords(
        fragments,
        ["habilidad", "skills", "python", "sql", "power bi", "excel", "react", "node", "api", "postgres", "mysql", "mongodb", "firebase", "docker", "git", "ci/cd", "pandas", "numpy"],
    )
    language_hints = extract_fragments_by_keywords(
        fragments,
        ["ingles", "english", "bilingue", "idioma", "languages", "lenguajes"],
        3,
    )

    def as_bullets(title, values):
        if values:
            return "\n".join([f"- {title}: {value}" for value in values])
        return f"- {title}: Sin dato explicito"

    lines = [
        "DATOS ESTRUCTURADOS DETECTADOS (extraidos del texto original):",
        f"- Name hint: {name_hint or 'Sin dato explicito'}",
        f"- Location hint: {location_hint or 'Sin dato explicito'}",
        f"- Availability hint: {availability_hint}",
        as_bullets("Email hint", emails),
        as_bullets("Phone hint", phones),
        as_bullets("University hint", university_hints),
        as_bullets("School hint", school_hints),
        as_bullets("Education hint", education_hints),
        as_bullets("Work experience hint", experience_hints),
        as_bullets("Projects hint", project_hints),
        as_bullets("Technical skills hint", skill_hints),
        as_bullets("Languages hint", language_hints),
    ]

    return "\n".join(lines)


def construir_prompt(input_libre):
    structured_block = build_structured_input_block(input_libre)

    return f"""Actua como un consultor senior de reclutamiento y redaccion de CVs ATS.

OBJETIVO:
Convertir el texto del usuario en un CV completo, detallado y profesional, sin perder informacion relevante.

PRIORIDADES:
1. No omitir datos del usuario: conserva toda informacion util.
2. Reescribir con calidad profesional: claridad, impacto y lenguaje de accion.
3. Estructura ATS: secciones claras, keywords, legibilidad.

{structured_block}

INSTRUCCION CRITICA:
- Usa primero los DATOS ESTRUCTURADOS DETECTADOS y luego completa con el texto original.
- Si hay pistas para Education, Work experience, Projects o Technical skills, debes incorporarlas en esas secciones.
- En Education, conserva explicitamente los nombres de universidad y colegio cuando aparezcan.
- No reemplaces datos detectados con frases genericas.

SECCIONES OBLIGATORIAS (usa exactamente estos encabezados):
- Name:
- Age:
- Professional title:
- Professional summary:
- Core strengths:
- Work experience:
- Projects:
- Education:
- Technical skills:
- Courses and certifications:
- Languages:
- Contact:
- Time availability:

REGLAS DE DETALLE:
- Professional summary: 6 a 9 lineas con enfoque en valor, dominio tecnico y tipo de impacto.
- Work experience: por cada rol incluye empresa, cargo, periodo y entre 4 y 7 bullets de logros/responsabilidades.
- Projects: incluye al menos 2 proyectos cuando existan datos; describe objetivo, stack y resultado.
- Technical skills: agrupa por categorias (Programming, Data/BI, Databases, DevOps/Cloud, Tools).
- Courses and certifications / Languages / Contact / Time availability: no las omitas.
- Longitud objetivo: minimo 55 lineas utiles y salida extensa cuando haya datos suficientes.
- Si falta un dato, completa con texto profesional util y legible para esa seccion.
- Nunca uses frases como "No especificado", "No especificado por el candidato" o equivalentes.

TEXTO DEL USUARIO:
<<<
{input_libre}
>>>

FORMATO OBLIGATORIO:
- Entrega en texto plano (sin Markdown).
- No uses **, #, >, ni simbolos decorativos.
- Usa encabezados con ":" como en la lista obligatoria.
- Usa bullets con "-".
- Mantener redaccion limpia y profesional.
- No inventar hechos falsos; solo inferencias prudentes cuando haga falta."""


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


def resolve_model_sequence(requested_model):
    normalized = str(requested_model or "auto").strip()

    if not normalized or normalized == "auto":
        return list(HF_MODEL_CANDIDATES), None, "auto"

    if normalized in HF_MODEL_SET:
        return [normalized], None, normalized

    allowed_values = ", ".join(HF_MODEL_CANDIDATES)
    return None, f"Modelo no valido. Opciones: auto, {allowed_values}", normalized


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

        model_sequence, model_error, normalized_requested_model = resolve_model_sequence(requested_model)
        if model_error:
            return jsonify({"success": False, "error": model_error}), 400

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
                "max_tokens": 1300,
                "stream": False,
            }

            response = requests.post(HF_CHAT_URL, headers=headers, json=payload, timeout=60)

            if response.status_code != 200:
                error_msg = parse_hf_error(response)
                if normalized_requested_model == "auto" and is_model_not_supported(error_msg):
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
            if normalized_requested_model == "auto":
                return jsonify({
                    "success": False,
                    "error": f"No hay modelos compatibles con tus providers habilitados. Detalle: {last_model_error}",
                }), 400

            return jsonify({
                "success": False,
                "error": f"El modelo seleccionado no genero una salida valida. Detalle: {last_model_error}",
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