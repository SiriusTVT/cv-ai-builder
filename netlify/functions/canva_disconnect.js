const { responseJson } = require("./_canva_shared");

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return responseJson(204, {});
  }

  if (event.httpMethod !== "POST") {
    return responseJson(405, { success: false, error: "Metodo no permitido" });
  }

  return responseJson(200, { success: true });
};
