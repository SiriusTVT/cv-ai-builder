const {
  buildAutofillData,
  createAutofillDesign,
  decodePhotoDataUrl,
  ensureCanvaAccess,
  extractCvSections,
  generarTextoCv,
  getBrandTemplateDataset,
  getCanvaConfig,
  isCanvaConfigured,
  responseJson,
  uploadPhotoToCanva
} = require("./_canva_shared");

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return responseJson(204, {});
  }

  if (event.httpMethod !== "POST") {
    return responseJson(405, { success: false, error: "Metodo no permitido" });
  }

  const config = getCanvaConfig();
  if (!isCanvaConfigured(config)) {
    return responseJson(500, {
      success: false,
      error: "Canva no esta configurado en Netlify. Define CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, CANVA_REDIRECT_URI y CANVA_FRONTEND_URL."
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (error) {
    return responseJson(400, { success: false, error: "JSON invalido en la solicitud" });
  }

  const hfApiKey = String(body.apiKey || "").trim();
  const inputLibre = String(body.inputLibre || "").trim();
  const requestedModel = String(body.requestedModel || "auto").trim();
  const canvaSessionId = String(body.canvaSessionId || "").trim();
  const canvaTemplateId = String(body.canvaTemplateId || "").trim();
  const fotoDataUrl = String(body.fotoDataUrl || "").trim();

  if (!hfApiKey) {
    return responseJson(400, { success: false, error: "Token de Hugging Face requerido" });
  }

  if (!inputLibre) {
    return responseJson(400, { success: false, error: "Debes ingresar informacion en el cuadro de texto" });
  }

  if (!canvaSessionId) {
    return responseJson(401, { success: false, error: "Debes conectar Canva primero" });
  }

  if (!canvaTemplateId) {
    return responseJson(400, { success: false, error: "Debes ingresar el Brand Template ID de Canva" });
  }

  if (!fotoDataUrl) {
    return responseJson(400, { success: false, error: "Debes subir la foto del candidato" });
  }

  const canvaAccess = await ensureCanvaAccess({
    config,
    sessionToken: canvaSessionId
  });

  if (!canvaAccess.ok) {
    return responseJson(canvaAccess.status || 401, {
      success: false,
      error: canvaAccess.error || "Sesion Canva invalida"
    });
  }

  const cvResult = await generarTextoCv({
    hfApiKey,
    inputLibre,
    requestedModel
  });

  if (!cvResult.ok) {
    return responseJson(cvResult.status || 400, {
      success: false,
      error: cvResult.error || "No se pudo generar el CV"
    });
  }

  const photoResult = decodePhotoDataUrl(fotoDataUrl);
  if (!photoResult.ok) {
    return responseJson(400, {
      success: false,
      error: photoResult.error
    });
  }

  const uploadResult = await uploadPhotoToCanva({
    accessToken: canvaAccess.accessToken,
    photoBytes: photoResult.bytes,
    fileName: photoResult.fileName
  });

  if (!uploadResult.ok) {
    return responseJson(400, {
      success: false,
      error: `No se pudo subir la foto a Canva: ${uploadResult.error}`
    });
  }

  const datasetResult = await getBrandTemplateDataset({
    accessToken: canvaAccess.accessToken,
    brandTemplateId: canvaTemplateId
  });

  if (!datasetResult.ok) {
    return responseJson(400, {
      success: false,
      error: `No se pudo leer la plantilla de Canva: ${datasetResult.error}`
    });
  }

  const sections = extractCvSections(cvResult.texto);
  const mapResult = buildAutofillData(datasetResult.dataset, sections, uploadResult.assetId);

  if (!mapResult.ok) {
    return responseJson(400, {
      success: false,
      error: mapResult.error
    });
  }

  const designResult = await createAutofillDesign({
    accessToken: canvaAccess.accessToken,
    brandTemplateId: canvaTemplateId,
    autofillData: mapResult.autofillData,
    title: `CV - ${sections.nombre || "Generado con IA"}`
  });

  if (!designResult.ok) {
    return responseJson(400, {
      success: false,
      error: `Canva no pudo generar el diseno: ${designResult.error}`
    });
  }

  const design = designResult.design || {};
  const urls = design.urls || {};
  const thumbnail = design.thumbnail || {};

  return responseJson(200, {
    success: true,
    texto: cvResult.texto,
    modelo: cvResult.modelo,
    warnings: mapResult.warnings || [],
    canvaSessionId: canvaAccess.sessionToken,
    canva: {
      designId: String(design.id || ""),
      title: String(design.title || ""),
      editUrl: String(urls.edit_url || design.url || ""),
      viewUrl: String(urls.view_url || ""),
      thumbnailUrl: String(thumbnail.url || ""),
      mappedFields: Object.keys(mapResult.autofillData || {}).sort()
    }
  });
};
