const C = HIPCALL_CONFIG;
const $ = (id) => document.getElementById(id);

const els = {
  viewLogin: $("view-login"), viewApp: $("view-app"),
  pill: $("status-pill"), pillText: $("status-text"),
  btnLogin: $("btn-login"), loginError: $("login-error"), loginWaiting: $("login-waiting"),
  userId: $("input-user-id"), btnRefresh: $("btn-refresh"), btnLogout: $("btn-logout"),
  loading: $("state-loading"), error: $("state-error"), errorTitle: $("error-title"),
  errorMsg: $("error-msg"), errorAction: $("btn-error-action"),
  data: $("state-data"), metrics: $("metrics"), raw: $("raw-json"), toggle: $("btn-toggle-json"),
};

const show = (el, on) => el.classList.toggle("hidden", !on);

async function getStored() {
  const s = await chrome.storage.local.get([C.storageKeys.token, C.storageKeys.userId]);
  return { token: s[C.storageKeys.token], userId: s[C.storageKeys.userId] };
}

function setConnected(on) {
  els.pill.className = "pill " + (on ? "pill-on" : "pill-off");
  els.pillText.textContent = on ? "Aktif" : "Bağlı değil";
}

async function render() {
  const { token, userId } = await getStored();
  const loggedIn = !!token?.access_token;
  setConnected(loggedIn);
  show(els.viewLogin, !loggedIn);
  show(els.viewApp, loggedIn);
  if (loggedIn) {
    els.userId.value = userId || C.defaultUserId || "";
    loadStats();
  }
}

function showState({ loading = false, error = null, data = false, reset = false }) {
  show(els.loading, loading);
  show(els.error, !!error);
  show(els.data, data);
  show(els.errorAction, reset);
  if (error) {
    els.errorTitle.textContent = error.title;
    els.errorMsg.textContent = error.msg;
  }
}

function fmt(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function renderMetrics(json) {
  els.metrics.innerHTML = "";
  let obj = json;
  if (obj && typeof obj === "object" && !Array.isArray(obj) && obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    obj = obj.data;
  }
  const entries = Array.isArray(obj) ? obj.map((v, i) => [i, v]) : Object.entries(obj || {});
  if (!entries.length) {
    els.metrics.innerHTML = '<div class="metric wide"><div class="k">Sonuç</div><div class="v small-v">Veri yok</div></div>';
    return;
  }
  entries.forEach(([k, v], i) => {
    const div = document.createElement("div");
    const text = fmt(v);
    const isLong = typeof v === "object" || text.length > 14;
    div.className = "metric" + (isLong ? " wide" : "");
    div.style.animationDelay = `${i * 25}ms`;
    const key = document.createElement("div"); key.className = "k"; key.textContent = String(k).replace(/_/g, " ");
    const val = document.createElement("div"); val.className = "v" + (isLong ? " small-v" : ""); val.textContent = text;
    div.append(key, val);
    els.metrics.appendChild(div);
  });
}

async function fetchStats(token, userId) {
  return fetch(C.baseUrl + C.statsPath(userId), {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/json",
      "ngrok-skip-browser-warning": "true",
    },
  });
}

let loadingNow = false;
async function loadStats() {
  if (loadingNow) return;
  const userId = els.userId.value.trim();
  if (!userId) {
    showState({ error: { title: "user_id gerekli", msg: "Lütfen yukarıdaki alana user_id girip Yenile'ye basın." } });
    return;
  }
  loadingNow = true;
  els.btnRefresh.disabled = true;
  showState({ loading: true });
  await chrome.storage.local.set({ [C.storageKeys.userId]: userId });

  try {
    let { token } = await getStored();
    let res = await fetchStats(token, userId);

    if (res.status === 401 && token.refresh_token) {
      const r = await chrome.runtime.sendMessage({ type: "refresh-token" });
      if (r?.ok) {
        ({ token } = await getStored());
        res = await fetchStats(token, userId);
      }
    }

    if (res.status === 401) {
      showState({ error: { title: "Oturum geçersiz (401)", msg: "Token süresi dolmuş veya geçersiz. Oturumu sıfırlayıp tekrar giriş yapın." }, reset: true });
      return;
    }
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    if (!res.ok) {
      showState({ error: { title: `API hatası (HTTP ${res.status})`, msg: text.slice(0, 300) || res.statusText } });
      return;
    }
    if (json === null) {
      showState({ error: { title: "Geçersiz yanıt", msg: "Sunucu JSON döndürmedi: " + text.slice(0, 200) } });
      return;
    }
    renderMetrics(json);
    els.raw.textContent = JSON.stringify(json, null, 2);
    showState({ data: true });
  } catch (e) {
    showState({ error: { title: "Bağlantı hatası", msg: `${e.message}. İnternet / ngrok / sunucu erişimini kontrol edin.` } });
  } finally {
    loadingNow = false;
    els.btnRefresh.disabled = false;
  }
}

async function logout() {
  await chrome.runtime.sendMessage({ type: "logout" });
  await render();
}

function onAuthResult(res) {
  els.btnLogin.disabled = false;
  show(els.loginWaiting, false);
  if (res.ok) {
    show(els.loginError, false);
    render();
  } else {
    els.loginError.textContent = res.error || "Giriş başarısız.";
    show(els.loginError, true);
  }
}

els.btnLogin.addEventListener("click", async () => {
  show(els.loginError, false);
  els.btnLogin.disabled = true;
  show(els.loginWaiting, true);
  await chrome.runtime.sendMessage({ type: "login" });
});
els.btnRefresh.addEventListener("click", loadStats);
els.btnLogout.addEventListener("click", logout);
els.errorAction.addEventListener("click", logout);
els.userId.addEventListener("keydown", (e) => { if (e.key === "Enter") loadStats(); });
els.toggle.addEventListener("click", () => {
  const open = els.toggle.getAttribute("aria-expanded") === "true";
  els.toggle.setAttribute("aria-expanded", String(!open));
  show(els.raw, !open);
});

chrome.runtime.onMessage.addListener((msg) => { if (msg.type === "auth-complete") onAuthResult(msg); });

(async function init() {
  const { hipcall_auth_result: last } = await chrome.storage.local.get("hipcall_auth_result");
  await render();
  if (last && !last.ok && Date.now() - last.at < 5 * 60 * 1000 && els.viewLogin && !els.viewLogin.classList.contains("hidden")) {
    onAuthResult(last);
  }
  await chrome.storage.local.remove("hipcall_auth_result");
})();
