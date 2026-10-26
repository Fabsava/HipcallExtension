const HIPCALL_CONFIG = {
  baseUrl: "https://use.hipcall.com.tr",
  authorizeUrl: "https://use.hipcall.com.tr/oauth/authorize",

  clientId: "YOUR_CLIENT_ID",
  clientSecret: "",
  redirectUri: "https://YOUR_SUBDOMAIN.ngrok-free.dev/callback",
  scope: "profile email offline_access contacts:read",
  state: "YOUR_STATE",
  usePKCE: true,

  tokenMode: "exchange",
  tokenExchangeUrl: "https://use.hipcall.com.tr/oauth/token",
  fallbackCodeAsBearer: false,

  profileEndpoints: ["/oauth/userinfo", "/api/v3/users/me", "/api/v3/me"],
  statsPath: (userId) => `/api/v3/users/${encodeURIComponent(userId)}/stats/today`,

  defaultUserId: "",

  storageKeys: {
    token: "hipcall_token",
    userId: "hipcall_user_id",
  },
};

async function hipcallRequestToken(params) {
  const body = new URLSearchParams({
    client_id: HIPCALL_CONFIG.clientId,
    ...params,
  });
  if (HIPCALL_CONFIG.clientSecret) body.set("client_secret", HIPCALL_CONFIG.clientSecret);

  const res = await fetch(HIPCALL_CONFIG.tokenExchangeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!res.ok || !json || !json.access_token) {
    throw new Error(`Token exchange başarısız (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  return json;
}
