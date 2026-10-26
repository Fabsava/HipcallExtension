const C = HIPCALL_CONFIG;
const $ = (id) => document.getElementById(id);

const els = {
  viewLogin: $("view-login"), viewApp: $("view-app"),
  pill: $("status-pill"), pillText: $("status-text"),
  btnLogin: $("btn-login"), loginError: $("login-error"), loginWaiting: $("login-waiting"),
  userDisplay: $("user-display"), btnRefresh: $("btn-refresh"), btnLogout: $("btn-logout"),
  loading: $("state-loading"), error: $("state-error"), errorTitle: $("error-title"),
  errorMsg: $("error-msg"), errorAction: $("btn-error-action"),
  data: $("state-data"), chartsWrapper: $("charts-wrapper"), metrics: $("metrics"),
  raw: $("raw-json"), toggle: $("btn-toggle-json"),
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

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds)) {
    return { text: "0 sn", digital: "00:00:00" };
  }
  const s = Math.max(0, Math.floor(Number(seconds)));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  const hh = String(hrs).padStart(2, "0");
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  const digital = `${hh}:${mm}:${ss}`;

  let text = "";
  if (hrs > 0) {
    text = `${hrs} sa ${mins} dk`;
  } else if (mins > 0) {
    text = `${mins} dk ${secs} sn`;
  } else {
    text = `${secs} sn`;
  }
  return { text, digital };
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const parts = String(dateStr).split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return d.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        weekday: "long",
      });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

function syntaxHighlightJson(json) {
  let str = typeof json !== "string" ? JSON.stringify(json, null, 2) : json;
  str = str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return str.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    function (match) {
      let cls = "json-num";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "json-key" : "json-str";
      } else if (/true|false/.test(match)) {
        cls = "json-bool";
      } else if (/null/.test(match)) {
        cls = "json-null";
      }
      return '<span class="' + cls + '">' + match + "</span>";
    }
  );
}

function renderCharts(obj) {
  els.chartsWrapper.innerHTML = "";
  if (!obj || !obj.states || typeof obj.states !== "object") {
    show(els.chartsWrapper, false);
    return;
  }
  show(els.chartsWrapper, true);

  const states = obj.states;
  const stateConfig = [
    { key: "time_to_available", label: "Müsait", color: "#3fb950" },
    { key: "time_to_remain", label: "Kalan", color: "#484f58" },
    { key: "time_to_busy", label: "Meşgul", color: "#f85149" },
    { key: "time_to_break", label: "Mola", color: "#d29922" },
    { key: "time_to_away", label: "Dışarıda", color: "#a371f7" },
    { key: "time_to_unknown", label: "Bilinmeyen", color: "#6e7681" },
  ];

  let totalSec = Object.values(states).reduce((acc, v) => acc + (Number(v) || 0), 0);
  if (totalSec <= 0) totalSec = 86400;

  const items = [];
  stateConfig.forEach((cfg) => {
    const val = Number(states[cfg.key]) || 0;
    const pct = (val / totalSec) * 100;
    items.push({ ...cfg, val, pct });
  });

  const header = document.createElement("div");
  header.className = "chart-header";
  header.innerHTML = `<span>GÜNLÜK ZAMAN DAĞILIMI</span><span>${Math.round(totalSec / 3600)} SAAT</span>`;
  els.chartsWrapper.appendChild(header);

  const body = document.createElement("div");
  body.className = "chart-body";

  const r = 38;
  const c = 2 * Math.PI * r;
  let accumulated = 0;

  const donutBox = document.createElement("div");
  donutBox.className = "donut-box";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("class", "donut-svg");

  const bgCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  bgCircle.setAttribute("cx", "50");
  bgCircle.setAttribute("cy", "50");
  bgCircle.setAttribute("r", String(r));
  bgCircle.setAttribute("fill", "transparent");
  bgCircle.setAttribute("stroke", "#21262d");
  bgCircle.setAttribute("stroke-width", "12");
  svg.appendChild(bgCircle);

  items.forEach((item) => {
    if (item.val <= 0) return;
    const strokeDash = (item.pct / 100) * c;
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "50");
    circle.setAttribute("cy", "50");
    circle.setAttribute("r", String(r));
    circle.setAttribute("fill", "transparent");
    circle.setAttribute("stroke", item.color);
    circle.setAttribute("stroke-width", "12");
    circle.setAttribute("stroke-dasharray", `${strokeDash} ${c}`);
    circle.setAttribute("stroke-dashoffset", String(-accumulated));
    svg.appendChild(circle);
    accumulated += strokeDash;
  });
  donutBox.appendChild(svg);

  const availSec = Number(states.time_to_available) || 0;
  const availHrs = (availSec / 3600).toFixed(1);
  const center = document.createElement("div");
  center.className = "donut-center";
  center.innerHTML = `<span class="donut-center-val">${availHrs} sa</span><span class="donut-center-lbl">Müsait</span>`;
  donutBox.appendChild(center);
  body.appendChild(donutBox);

  const legend = document.createElement("div");
  legend.className = "chart-legend";
  items.forEach((item) => {
    if (item.val <= 0 && item.key !== "time_to_available" && item.key !== "time_to_remain") return;
    const dur = formatDuration(item.val);
    const div = document.createElement("div");
    div.className = "legend-item";
    div.innerHTML = `
      <div class="legend-left">
        <span class="legend-dot" style="background:${item.color}"></span>
        <span class="legend-name">${item.label}</span>
      </div>
      <span class="legend-val">${dur.text} (%${item.pct.toFixed(0)})</span>
    `;
    legend.appendChild(div);
  });
  body.appendChild(legend);
  els.chartsWrapper.appendChild(body);

  const timelineWrap = document.createElement("div");
  timelineWrap.className = "timeline-wrap";
  timelineWrap.innerHTML = `
    <div class="timeline-title">
      <span>Zaman Çubuğu Dağılımı</span>
      <span>00:00 - 24:00</span>
    </div>
  `;
  const bar = document.createElement("div");
  bar.className = "timeline-bar";
  items.forEach((item) => {
    if (item.pct <= 0) return;
    const seg = document.createElement("div");
    seg.className = "timeline-segment";
    seg.style.width = `${item.pct}%`;
    seg.style.backgroundColor = item.color;
    seg.title = `${item.label}: ${item.pct.toFixed(1)}%`;
    bar.appendChild(seg);
  });
  timelineWrap.appendChild(bar);
  els.chartsWrapper.appendChild(timelineWrap);
}

function createCard(title, mainVal, subVal = null, wide = false, highlight = false) {
  const card = document.createElement("div");
  card.className = "metric" + (wide ? " wide" : "") + (highlight ? " highlight" : "");
  const k = document.createElement("div");
  k.className = "k";
  k.textContent = title;
  const v = document.createElement("div");
  v.className = "v" + (String(mainVal).length > 15 ? " small-v" : "");
  v.textContent = mainVal;
  card.append(k, v);
  if (subVal) {
    const s = document.createElement("div");
    s.className = "sub-v";
    s.textContent = subVal;
    card.appendChild(s);
  }
  return card;
}

function createSectionTitle(title) {
  const t = document.createElement("div");
  t.className = "section-title";
  t.textContent = title;
  return t;
}

function renderMetrics(json) {
  els.metrics.innerHTML = "";
  let obj = json;
  if (obj && typeof obj === "object" && !Array.isArray(obj) && obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    obj = obj.data;
  }
  if (!obj || typeof obj !== "object") {
    els.metrics.innerHTML = '<div class="metric wide"><div class="k">Sonuç</div><div class="v small-v">Veri yok</div></div>';
    return;
  }

  // Grafik bileşeni
  renderCharts(obj);

  // Tarih ve Saat Dilimi
  if (obj.date) {
    const dateFormatted = formatDate(obj.date);
    const sub = obj.timezone ? `Saat Dilimi: ${obj.timezone}` : null;
    const topGrid = document.createElement("div");
    topGrid.className = "grid-2";
    topGrid.appendChild(createCard("Tarih", dateFormatted, sub, true, true));
    els.metrics.appendChild(topGrid);
  }

  // Çağrılar
  if (obj.calls && typeof obj.calls === "object") {
    if (obj.calls.inbound) {
      els.metrics.appendChild(createSectionTitle("Gelen Çağrılar (Inbound)"));
      const inGrid = document.createElement("div");
      inGrid.className = "grid-3";
      const total = formatDuration(obj.calls.inbound.total_duration);
      const avg = formatDuration(obj.calls.inbound.avg_duration);
      inGrid.appendChild(createCard("Çağrı Sayısı", String(obj.calls.inbound.count ?? 0)));
      inGrid.appendChild(createCard("Toplam Süre", total.text, total.digital));
      inGrid.appendChild(createCard("Ort. Süre", avg.text, avg.digital));
      els.metrics.appendChild(inGrid);
    }
    if (obj.calls.outbound) {
      els.metrics.appendChild(createSectionTitle("Giden Çağrılar (Outbound)"));
      const outGrid = document.createElement("div");
      outGrid.className = "grid-3";
      const total = formatDuration(obj.calls.outbound.total_duration);
      const avg = formatDuration(obj.calls.outbound.avg_duration);
      outGrid.appendChild(createCard("Çağrı Sayısı", String(obj.calls.outbound.count ?? 0)));
      outGrid.appendChild(createCard("Toplam Süre", total.text, total.digital));
      outGrid.appendChild(createCard("Ort. Süre", avg.text, avg.digital));
      els.metrics.appendChild(outGrid);
    }
  }

  // Durum Süreleri
  if (obj.states && typeof obj.states === "object") {
    els.metrics.appendChild(createSectionTitle("Günlük Durum Süreleri"));
    const statesGrid = document.createElement("div");
    statesGrid.className = "grid-2";

    const stateDefs = [
      { key: "time_to_available", label: "Müsait", highlight: true },
      { key: "time_to_remain", label: "Kalan Süre", highlight: true },
      { key: "time_to_busy", label: "Meşgul" },
      { key: "time_to_break", label: "Mola" },
      { key: "time_to_away", label: "Dışarıda" },
      { key: "time_to_unknown", label: "Bilinmeyen" },
    ];

    stateDefs.forEach((def) => {
      const val = obj.states[def.key];
      if (val !== undefined && val !== null) {
        const dur = formatDuration(val);
        statesGrid.appendChild(createCard(def.label, dur.text, dur.digital, false, !!def.highlight && Number(val) > 0));
      }
    });

    Object.entries(obj.states).forEach(([k, v]) => {
      if (!stateDefs.some((d) => d.key === k)) {
        const dur = formatDuration(v);
        statesGrid.appendChild(createCard(k.replace(/^time_to_/, "").replace(/_/g, " "), dur.text, dur.digital));
      }
    });
    els.metrics.appendChild(statesGrid);
  }

  const handledKeys = new Set(["date", "timezone", "calls", "states", "user_id"]);
  const extraKeys = Object.entries(obj).filter(([k]) => !handledKeys.has(k));
  if (extraKeys.length > 0) {
    els.metrics.appendChild(createSectionTitle("Diğer İstatistikler"));
    const extraGrid = document.createElement("div");
    extraGrid.className = "grid-2";
    extraKeys.forEach(([k, v]) => {
      const str = typeof v === "object" ? JSON.stringify(v) : String(v);
      extraGrid.appendChild(createCard(k.replace(/_/g, " "), str));
    });
    els.metrics.appendChild(extraGrid);
  }
}

async function discoverUserId(accessToken) {
  for (const path of C.profileEndpoints) {
    try {
      const res = await fetch(C.baseUrl + path, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
      });
      if (!res.ok) continue;
      const j = await res.json();
      const id = j.user_id ?? j.sub ?? j.id ?? j.data?.id ?? j.data?.user_id ?? j.user?.id;
      if (id) return String(id);
    } catch (_) {}
  }
  return null;
}

async function getOrDiscoverUserId(token) {
  let { userId } = await getStored();
  if (userId) return userId;
  if (!token?.access_token) return null;

  userId = await discoverUserId(token.access_token);
  if (userId) {
    await chrome.storage.local.set({ [C.storageKeys.userId]: userId });
    return userId;
  }
  return null;
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
  loadingNow = true;
  els.btnRefresh.disabled = true;
  showState({ loading: true });

  try {
    let { token } = await getStored();
    if (!token?.access_token) {
      showState({ error: { title: "Oturum bulunamadı", msg: "Lütfen tekrar giriş yapın." }, reset: true });
      return;
    }

    if (token.expires_at && Date.now() > token.expires_at - 60000 && token.refresh_token) {
      const r = await chrome.runtime.sendMessage({ type: "refresh-token" });
      if (r?.ok) {
        ({ token } = await getStored());
      }
    }

    let userId = await getOrDiscoverUserId(token);
    let targetId = userId || "me";

    let res = await fetchStats(token, targetId);

    if (res.status === 401 && token.refresh_token) {
      const r = await chrome.runtime.sendMessage({ type: "refresh-token" });
      if (r?.ok) {
        ({ token } = await getStored());
        res = await fetchStats(token, targetId);
      }
    }

    if (res.status === 401) {
      showState({
        error: { title: "Oturum geçersiz (401)", msg: "Token süresi dolmuş veya geçersiz. Oturumu sıfırlayıp tekrar giriş yapın." },
        reset: true,
      });
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

    const foundId = json.user_id ?? json.data?.user_id ?? userId;
    if (foundId) {
      await chrome.storage.local.set({ [C.storageKeys.userId]: String(foundId) });
      els.userDisplay.textContent = `Kullanıcı #${foundId}`;
    } else {
      els.userDisplay.textContent = "Kullanıcı";
    }

    renderMetrics(json);
    els.raw.innerHTML = syntaxHighlightJson(json);
    showState({ data: true });
  } catch (e) {
    showState({ error: { title: "Bağlantı hatası", msg: `${e.message}. Sunucu veya ağ bağlantısını kontrol edin.` } });
  } finally {
    loadingNow = false;
    els.btnRefresh.disabled = false;
  }
}

async function render() {
  const { token, userId } = await getStored();
  const loggedIn = !!token?.access_token;
  setConnected(loggedIn);
  show(els.viewLogin, !loggedIn);
  show(els.viewApp, loggedIn);

  if (loggedIn) {
    els.userDisplay.textContent = userId ? `Kullanıcı #${userId}` : "Kullanıcı…";
    loadStats();
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
