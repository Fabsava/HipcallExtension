importScripts("config.js");

const C = HIPCALL_CONFIG;
const PENDING_KEY = "hipcall_pending_auth";

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateCodeVerifier() {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return base64UrlEncode(randomBytes);
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

function buildAuthUrl(codeChallenge) {
  const u = new URL(C.authorizeUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", C.clientId);
  u.searchParams.set("redirect_uri", C.redirectUri);
  u.searchParams.set("scope", C.scope);
  u.searchParams.set("state", C.state);
  if (codeChallenge) {
    u.searchParams.set("code_challenge", codeChallenge);
    u.searchParams.set("code_challenge_method", "S256");
  }
  return u.toString();
}

async function saveToken(tok) {
  const record = {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token || null,
    token_type: tok.token_type || "Bearer",
    expires_at: tok.expires_in ? Date.now() + Number(tok.expires_in) * 1000 : null,
  };
  const toStore = { [C.storageKeys.token]: record };
  if (tok.user_id) toStore[C.storageKeys.userId] = String(tok.user_id);
  await chrome.storage.local.set(toStore);
  return record;
}

async function discoverUserId(accessToken) {
  for (const path of C.profileEndpoints) {
    try {
      const res = await fetch(C.baseUrl + path, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      if (!res.ok) continue;
      const j = await res.json();
      const id = j.user_id ?? j.sub ?? j.id ?? j.data?.id ?? j.data?.user_id ?? j.user?.id;
      if (id) return String(id);
    } catch (_) {}
  }
  return null;
}

async function finishAuth(tok) {
  await saveToken(tok);
  const existing = (await chrome.storage.local.get(C.storageKeys.userId))[C.storageKeys.userId];
  if (!tok.user_id && !existing) {
    const id = await discoverUserId(tok.access_token);
    if (id) await chrome.storage.local.set({ [C.storageKeys.userId]: id });
  }
}

async function handleCallback(tabId, urlStr, codeVerifier) {
  const url = new URL(urlStr);
  const p = new URLSearchParams(url.search);
  new URLSearchParams(url.hash.replace(/^#/, "")).forEach((v, k) => { if (!p.has(k)) p.set(k, v); });

  let result = { ok: false, error: "Bilinmeyen hata" };
  try {
    if (p.get("error")) {
      throw new Error(p.get("error_description") || p.get("error"));
    }
    if (p.get("state") && p.get("state") !== C.state) {
      throw new Error("State uyuşmazlığı (olası CSRF).");
    }
    if (p.get("access_token")) {
      await finishAuth({
        access_token: p.get("access_token"),
        refresh_token: p.get("refresh_token"),
        expires_in: p.get("expires_in"),
        user_id: p.get("user_id"),
      });
    } else if (p.get("code")) {
      const code = p.get("code");
      if (C.tokenMode === "direct") {
        await finishAuth({ access_token: code });
      } else {
        try {
          const tokenParams = {
            grant_type: "authorization_code",
            code,
            redirect_uri: C.redirectUri,
          };
          if (codeVerifier) {
            tokenParams.code_verifier = codeVerifier;
          }
          const tok = await hipcallRequestToken(tokenParams);
          await finishAuth(tok);
        } catch (e) {
          if (C.fallbackCodeAsBearer) await finishAuth({ access_token: code });
          else throw e;
        }
      }
    } else {
      throw new Error("Callback'te code veya access_token bulunamadı.");
    }
    result = { ok: true };
  } catch (e) {
    result = { ok: false, error: e.message };
  }

  await chrome.storage.local.set({ hipcall_auth_result: { ...result, at: Date.now() } });
  await chrome.storage.session.remove(PENDING_KEY);
  try { await chrome.tabs.remove(tabId); } catch (_) {}
  chrome.runtime.sendMessage({ type: "auth-complete", ...result }).catch(() => {});
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  const url = changeInfo.url;
  if (!url || !url.startsWith(C.redirectUri)) return;
  const pending = (await chrome.storage.session.get(PENDING_KEY))[PENDING_KEY];
  if (!pending || pending.tabId !== tabId) return;
  if (pending.handled) return;
  await chrome.storage.session.set({ [PENDING_KEY]: { ...pending, handled: true } });
  handleCallback(tabId, url, pending.codeVerifier);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const pending = (await chrome.storage.session.get(PENDING_KEY))[PENDING_KEY];
  if (pending && pending.tabId === tabId && !pending.handled) {
    await chrome.storage.session.remove(PENDING_KEY);
    chrome.runtime.sendMessage({ type: "auth-complete", ok: false, error: "Giriş penceresi kapatıldı." }).catch(() => {});
  }
});

async function refreshToken() {
  const rec = (await chrome.storage.local.get(C.storageKeys.token))[C.storageKeys.token];
  if (!rec?.refresh_token) throw new Error("Refresh token yok.");
  const tok = await hipcallRequestToken({ grant_type: "refresh_token", refresh_token: rec.refresh_token });
  if (!tok.refresh_token) tok.refresh_token = rec.refresh_token;
  return saveToken(tok);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === "login") {
      let codeVerifier = null;
      let codeChallenge = null;
      if (C.usePKCE) {
        codeVerifier = generateCodeVerifier();
        codeChallenge = await generateCodeChallenge(codeVerifier);
      }
      const authUrl = buildAuthUrl(codeChallenge);
      const tab = await chrome.tabs.create({ url: authUrl });
      await chrome.storage.session.set({
        [PENDING_KEY]: { tabId: tab.id, handled: false, codeVerifier },
      });
      sendResponse({ ok: true });
    } else if (msg.type === "logout") {
      await chrome.storage.local.remove([C.storageKeys.token]);
      sendResponse({ ok: true });
    } else if (msg.type === "refresh-token") {
      try { await refreshToken(); sendResponse({ ok: true }); }
      catch (e) { sendResponse({ ok: false, error: e.message }); }
    }
  })();
  return true;
});
