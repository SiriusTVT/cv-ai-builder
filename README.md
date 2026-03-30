# CV Builder IA 🚀

Generador de hojas de vida con inteligencia artificial usando Gemini.

## 📁 Estructura del proyecto

```
cv-ai-builder/
├── index.html              # Archivo principal HTML
├── script.js               # Lógica del frontend
├── style.css               # Estilos
├── server.py               # Servidor Flask (desarrollo local)
├── netlify.toml            # Configuración de Netlify
├── .env                    # Variables de entorno (no commitear)
├── .gitignore              # Archivos a ignorar en Git
└── netlify/
    └── functions/
        └── generar_cv.py   # Función serverless para Netlify
```

## 🚀 Deployment en Netlify

### Requisitos
- Cuenta en [Netlify](https://netlify.com)
- Cuenta en [GitHub](https://github.com) (o tu proveedor de Git preferido)
- Clave API de [Google Gemini](https://aistudio.google.com/app/apikey)

### Pasos para desplegar

1. **Sube tu proyecto a GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/TU_USUARIO/cv-ai-builder.git
   git push -u origin main
   ```

2. **Conecta a Netlify:**
   - Ve a [Netlify](https://app.netlify.com/)
   - Haz clic en "New site from Git"
   - Selecciona tu repositorio

3. **Configura las variables de entorno:**
   - En tu sitio de Netlify, ve a **Site Settings** → **Build & Deploy** → **Environment**
   - Añade la variable:
     - **Key:** `GEMINI_API_KEY`
     - **Value:** Tu clave API de Gemini

4. **Despliega:**
   - Netlify detectará `netlify.toml` automáticamente
   - El sitio se desplegará en pocos segundos

## 🔒 Seguridad

- ✅ La clave API se mantiene segura en variables de entorno
- ✅ No se expone en el código del cliente
- ✅ Las funciones serverless manejan las requests a Gemini

## 💻 Desarrollo local

```bash
# Instalar dependencias
pip install -r requirements.txt

# Iniciar servidor Flask (porta 5000)
python server.py

# En otra terminal, iniciar servidor de archivos estáticos (puerto 8000)
python -m http.server 8000

# Abre http://localhost:8000 en tu navegador
```

## 📦 Dependencias

- Flask (solo para desarrollo local)
- Requests
- python-dotenv

## 📝 Variables de entorno

Crea un archivo `.env` en la raíz:
```
GEMINI_API_KEY=tu_clave_aqui
```

## 🎨 Personalización

- Modifica `style.css` para cambiar los estilos
- Edita el prompt en `netlify/functions/generar_cv.py` para cambiar cómo se genera el CV
- Ajusta los campos en `index.html` según lo que necesites

## 📄 Licencia

MIT

---

**¿Necesitas ayuda?** Abre un issue en tu repositorio o contacta al equipo de desarrollo.
