function cargarAPIKeyGuardada() {
  const apiKey = localStorage.getItem("gemini_api_key");
  if (apiKey) {
    document.getElementById("apiStatus").innerHTML = "<p class='api-success'>✅ API Key configurada</p>";
    document.getElementById("apiKey").value = apiKey.substring(0, 10) + "***";
  }
}

function guardarAPIKey() {
  const apiKey = document.getElementById("apiKey").value.trim();
  const statusDiv = document.getElementById("apiStatus");

  if (!apiKey) {
    statusDiv.innerHTML = "<p class='api-error'>❌ Ingresa una clave API válida</p>";
    return;
  }

  localStorage.setItem("gemini_api_key", apiKey);
  statusDiv.innerHTML = "<p class='api-success'>✅ Clave API guardada correctamente</p>";
  document.getElementById("apiKey").value = apiKey.substring(0, 10) + "***";
}

async function generarCV() {
  const apiKey = localStorage.getItem("gemini_api_key");
  
  if (!apiKey) {
    document.getElementById("preview").innerHTML = "<p style='color: red;'>⚠️ Por favor, ingresa tu Google Gemini API Key primero</p>";
    return;
  }

  const nombre = document.getElementById("nombre").value;
  const perfil = document.getElementById("perfil").value;
  const experiencia = document.getElementById("experiencia").value;
  const educacion = document.getElementById("educacion").value;
  const habilidades = document.getElementById("habilidades").value;

  document.getElementById("preview").innerHTML = "<p>Generando CV...</p>";

  try {
    // Detectar si estamos en desarrollo o producción
    const apiUrl = window.location.hostname === 'localhost' 
      ? "http://localhost:5000/api/generar-cv"
      : "/.netlify/functions/generar_cv";

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        apiKey,
        nombre,
        perfil,
        experiencia,
        educacion,
        habilidades
      })
    });

    const data = await response.json();

    if (data.success) {
      document.getElementById("preview").innerHTML = `
        <h2>${nombre}</h2>
        <p>${data.texto.replace(/\n/g, "<br>")}</p>
      `;
    } else {
      document.getElementById("preview").innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
    }
  } catch (error) {
    document.getElementById("preview").innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
  }
}

function descargarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const contenido = document.getElementById("preview").innerText;

  doc.text(contenido, 10, 10);
  doc.save("CV.pdf");
}

// Cargar API Key al iniciar la página
window.addEventListener("DOMContentLoaded", cargarAPIKeyGuardada);