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
├── README.md               # Este archivo
├── requirements.txt        # Dependencias Python
└── netlify/
    └── functions/
      └── generar_cv.js   # Función serverless para Netlify
```

## 🔑 Obtener tu API Key de Gemini

La aplicación requiere una **API Key personal de Google Gemini**. Es gratis y toma 1 minuto obtenerla:

1. Ve a [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Haz clic en "Create API Key"
3. Selecciona "Create API key in new project"
4. ¡Copia tu clave! 🎉

## 🚀 Usar localmente

### 1. Instalar dependencias
```bash
pip install -r requirements.txt
```

### 2. Iniciar el servidor (en una terminal)
```bash
# En Windows
c:\Users\tu_usuario\path\cv-ai-builder\.venv\Scripts\python.exe server.py

# O simplemente
python server.py
```

### 3. Servir archivos estáticos (en otra terminal)
```bash
python -m http.server 8000
```

### 4. Usar la aplicación
- Abre [http://localhost:8000](http://localhost:8000)
- Pega tu API Key de Gemini en el campo "Configuración API"
- Haz clic en "Guardar Clave"
- ¡Llena el formulario y genera tu CV! 📄

## 🌐 Desplegar en Netlify

### Pasos:

1. **Sube a GitHub:**
   ```bash
   git init
   git add .
   git commit -m "CV Builder listo para Netlify"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/cv-ai-builder.git
   git push -u origin main
   ```

2. **Conecta a Netlify:**
   - Ve a [app.netlify.com](https://app.netlify.com)
   - Haz clic en "New site from Git"
   - Selecciona tu repositorio
   - Netlify detectará automáticamente `netlify.toml`

3. **Listo!** ✅
   - Tu sitio estará en `https://tu-sitio.netlify.app`
   - Los usuarios ingresarán su propia API Key en la aplicación

## ✨ Características

✅ **Sin servidor que mantener** - Usa Netlify Functions (serverless)  
✅ **Seguridad** - La API Key se almacena localmente en localStorage del navegador  
✅ **Sin configuración** - Los usuarios usan su propia clave (sin costo)  
✅ **Generación con IA** - Mejora automáticamente el contenido del CV  
✅ **Descarga PDF** - Exporta el CV generado como PDF  
✅ **Deploy automático** - Cada push a GitHub se deploya automáticamente  

## 🔒 Seguridad

- ✅ La API Key **no se envía al servidor** durante el deploy
- ✅ Cada usuario usa su propia clave de Gemini
- ✅ Se almacena únicamente en localStorage del navegador (seguro)
- ✅ Perfectamente compatible con planes free de Gemini

## 📦 Dependencias

- **Flask** (solo para desarrollo local)
- **Requests** (solo para desarrollo local)
- **python-dotenv** (solo para desarrollo local)
- **jsPDF** (descargado vía CDN para el frontend)

## 🎨 Personalización

### Cambiar el prompt de generación
Edita la variable `prompt` en:
- `server.py` (línea ~22)
- `netlify/functions/generar_cv.js`

### Cambiar los estilos
Edita `style.css`

### Cambiar los campos del formulario
Edita `index.html`

## 📄 Licencia

MIT

## ❓ Preguntas frecuentes

**¿Es gratis?**  
Sí, completamente. Google Gemini tiene un plan gratuito con límite de requests.

**¿Es seguro compartir mi API Key?**  
Sí, la clave se almacena SOLO en tu navegador. Nunca se envía a nuestros servidores.

**¿Qué pasa si se acaba mi cuota?**  
Google Gemini te notificará y puedes mejorar tu plan si lo deseas.

**¿Puedo cambiar a otra IA?**  
Sí, solo actualiza el endpoint y el prompt en `server.py` y `netlify/functions/generar_cv.js`
