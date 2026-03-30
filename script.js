async function generarCV() {
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