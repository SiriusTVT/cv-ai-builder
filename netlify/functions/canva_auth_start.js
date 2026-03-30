const {
  CANVA_OAUTH_AUTHORIZE_URL,
  createStateToken,
  getCanvaConfig,
  isCanvaConfigured,
  makePkceCodeChallenge,
  makePkceCodeVerifier,
  responseJson,
  sanitizeFrontendUrl
} = require("./_canva_shared");

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return responseJson(204, {});
  }

  if (event.httpMethod !== "GET") {
    return responseJson(405, { success: false, error: "Metodo no permitido" });
  }

  const config = getCanvaConfig();
  if (!isCanvaConfigured(config)) {
    return responseJson(500, {
      success: false,
      error: "Canva no esta configurado. Define CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, CANVA_REDIRECT_URI y CANVA_FRONTEND_URL."
    });
  }

  const frontendInput = event.queryStringParameters?.frontend;
  const frontendUrl = sanitizeFrontendUrl(frontendInput, config.frontendUrl);

  const codeVerifier = makePkceCodeVerifier();
  const codeChallenge = makePkceCodeChallenge(codeVerifier);
  const stateToken = createStateToken(
    {
      codeVerifier,
      frontendUrl
    },
    config.signingSecret
  );

  const params = new URLSearchParams({
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    scope: config.scopes.join(" "),
    response_type: "code",
    client_id: config.clientId,
    state: stateToken,
    redirect_uri: config.redirectUri
  });

  return {
    statusCode: 302,
    headers: {
      Location: `${CANVA_OAUTH_AUTHORIZE_URL}?${params.toString()}`,
      "Cache-Control": "no-store"
    },
    body: ""
  };
};
