const {
  createSessionToken,
  decodeStateToken,
  exchangeCanvaToken,
  getCallbackHtml,
  getCanvaConfig,
  isCanvaConfigured,
  responseJson,
  sanitizeFrontendUrl
} = require("./_canva_shared");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") {
    return responseJson(405, { success: false, error: "Metodo no permitido" });
  }

  const config = getCanvaConfig();
  if (!isCanvaConfigured(config)) {
    return responseJson(500, {
      success: false,
      error: "Canva no esta configurado en Netlify"
    });
  }

  const query = event.queryStringParameters || {};
  const oauthError = String(query.error || "").trim();
  const oauthErrorDescription = String(query.error_description || "").trim();
  const stateToken = String(query.state || "").trim();
  const authCode = String(query.code || "").trim();

  const fallbackFrontend = sanitizeFrontendUrl(config.frontendUrl, "https://app.netlify.com/");

  const decodedState = decodeStateToken(stateToken, config.signingSecret);
  const statePayload = decodedState.payload;
  const frontendUrl = sanitizeFrontendUrl(statePayload?.f, fallbackFrontend);

  if (oauthError) {
    const html = getCallbackHtml({
      frontendUrl,
      errorMessage: oauthErrorDescription || oauthError
    });
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      },
      body: html
    };
  }

  if (!statePayload) {
    const html = getCallbackHtml({
      frontendUrl,
      errorMessage: decodedState.error || "Estado OAuth invalido"
    });
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      },
      body: html
    };
  }

  if (!authCode) {
    const html = getCallbackHtml({
      frontendUrl,
      errorMessage: "Canva no devolvio codigo de autorizacion"
    });
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      },
      body: html
    };
  }

  const tokenResult = await exchangeCanvaToken({
    config,
    grantType: "authorization_code",
    code: authCode,
    codeVerifier: statePayload.v
  });

  if (!tokenResult.ok) {
    const html = getCallbackHtml({
      frontendUrl,
      errorMessage: tokenResult.error || "No se pudo obtener token de Canva"
    });
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      },
      body: html
    };
  }

  const sessionToken = createSessionToken(
    {
      accessToken: tokenResult.data.accessToken,
      refreshToken: tokenResult.data.refreshToken,
      expiresAt: tokenResult.data.expiresAt,
      scope: tokenResult.data.scope,
      createdAt: Date.now()
    },
    config.signingSecret
  );

  const html = getCallbackHtml({
    frontendUrl,
    sessionToken
  });

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: html
  };
};
