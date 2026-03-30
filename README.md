# CV Builder IA 🚀

Generador de hojas de vida con inteligencia artificial usando Hugging Face Inference Providers.

Ahora tambien permite generar el contenido con IA y enviarlo automaticamente a Canva (Brand Template + foto del candidato).

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

## 🔑 Obtener tu token de Hugging Face

La aplicación requiere un **token personal de Hugging Face** con permiso de Inference Providers.

1. Ve a [Hugging Face Tokens](https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained)
2. Crea un token tipo **fine-grained**
3. Activa permiso **Make calls to Inference Providers**
4. Copia tu token `hf_...`

Hugging Face incluye créditos gratuitos mensuales para usuarios free.

## 🎨 Configurar Canva Connect (para diseno automatico)

Para que la app acomode el CV en Canva con foto necesitas configurar una integracion de Canva Connect.

### Variables de entorno necesarias

Define estas variables en tu entorno local (o archivo `.env`):

```env
CANVA_CLIENT_ID=tu_client_id
CANVA_CLIENT_SECRET=tu_client_secret
CANVA_REDIRECT_URI=http://localhost:5000/api/canva/oauth/callback
CANVA_FRONTEND_URL=http://localhost:8000/
CANVA_SCOPES=design:content:write design:meta:read brandtemplate:content:read brandtemplate:meta:read asset:read asset:write
```

### Requisitos de Canva

1. Debes tener una integracion creada en Canva Developer Portal.
2. Debes agregar el redirect URL exactamente igual al valor de `CANVA_REDIRECT_URI`.
3. Tu plantilla debe ser una Brand Template con campos de Data Autofill (texto e imagen).
4. El flujo de Autofill/Brand Templates requiere acceso Enterprise en Canva (o acceso de desarrollo aprobado por Canva).

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
- Pega tu token `hf_...` en el campo "Configuración API"
- Haz clic en "Guardar Clave"
- Pega toda tu informacion en el cuadro de texto libre
- (Opcional) Genera solo texto con "Generar con IA"
- Para Canva:
   - Ingresa tu Brand Template ID
   - Carga la foto del candidato
   - Haz clic en "Conectar Canva"
   - Luego clic en "Generar + Enviar a Canva"
- La app devolvera un enlace para abrir el diseno editable en Canva

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
✅ **Integracion con Canva** - Crea un diseno desde Brand Template con foto y datos del CV  
✅ **Descarga PDF** - Exporta el CV generado como PDF  
✅ **Deploy automático** - Cada push a GitHub se deploya automáticamente  

## 🔒 Seguridad

- ✅ La API Key **no se envía al servidor** durante el deploy
- ✅ Cada usuario usa su propio token de Hugging Face
- ✅ Se almacena únicamente en localStorage del navegador (seguro)
- ✅ La sesion OAuth de Canva se maneja en backend (no en frontend)
- ✅ Compatible con créditos gratuitos mensuales de Hugging Face

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

### Cambiar el mapeo de datos hacia Canva
Edita funciones de mapeo en `server.py`:
- `extract_cv_sections()`
- `build_autofill_data()`

## 📄 Licencia

MIT

## ❓ Preguntas frecuentes

**¿Es gratis?**  
Sí. Hugging Face ofrece créditos gratuitos mensuales para comenzar.

**¿Es seguro compartir mi API Key?**  
Sí, la clave se almacena SOLO en tu navegador. Nunca se envía a nuestros servidores.

**¿Qué pasa si se acaba mi cuota?**  
Hugging Face te pedirá comprar créditos adicionales para seguir usando la API.

**¿Puedo cambiar a otra IA?**  
Sí, solo actualiza el endpoint y el prompt en `server.py` y `netlify/functions/generar_cv.js`

**¿Canva funciona en el deploy serverless actual de Netlify?**  
El flujo completo de OAuth + Autofill implementado aqui vive en `server.py` (backend Flask). Para usarlo en produccion debes desplegar tambien este backend o migrar estos endpoints a funciones serverless.
