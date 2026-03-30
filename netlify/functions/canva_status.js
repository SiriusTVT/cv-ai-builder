const {
  decodeSessionToken,
  getCanvaConfig,
  isCanvaConfigured,
  responseJson
} = require("./_canva_shared");

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return responseJson(204, {});
  }

  if (event.httpMethod !== "GET") {
    return responseJson(405, { success: false, error: "Metodo no permitido" });
  }

  const config = getCanvaConfig();
  const sessionToken = String(event.queryStringParameters?.sessionId || "").trim();

  let connected = false;
  if (sessionToken && config.signingSecret) {
    const decoded = decodeSessionToken(sessionToken, config.signingSecret);
    const expiresAt = Number(decoded.payload?.expiresAt || 0);
    connected = Boolean(decoded.payload && expiresAt > Date.now());
  }

  return responseJson(200, {
    success: true,
    configured: isCanvaConfigured(config),
    connected,
    requiresEnterpriseForAutofill: true
  });
};
