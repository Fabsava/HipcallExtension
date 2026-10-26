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

  navBtnStats: $("nav-btn-stats"), navBtnScraper: $("nav-btn-scraper"),
  tabStats: $("tab-content-stats"), tabScraper: $("tab-content-scraper"),
  btnScrapeSite: $("btn-scrape-site"),
  scraperLoading: $("scraper-loading"), scraperError: $("scraper-error"),
  scraperErrorMsg: $("scraper-error-msg"), scraperResults: $("scraper-results"),
  resDomain: $("res-domain"), resUrl: $("res-url"), resEmail: $("res-email"),
  resPhone: $("res-phone"), resAddress: $("res-address"),
};

const show = (el, on) => el.classList.toggle("hidden", !on);

function switchTab(tab) {
  if (tab === "stats") {
    els.navBtnStats.classList.add("active");
    els.navBtnScraper.classList.remove("active");
    show(els.tabStats, true);
    show(els.tabScraper, false);
  } else {
    els.navBtnScraper.classList.add("active");
    els.navBtnStats.classList.remove("active");
    show(els.tabStats, false);
    show(els.tabScraper, true);
  }
}

els.navBtnStats.addEventListener("click", () => switchTab("stats"));
els.navBtnScraper.addEventListener("click", () => switchTab("scraper"));

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

  renderCharts(obj);

  if (obj.date) {
    const dateFormatted = formatDate(obj.date);
    const sub = obj.timezone ? `Saat Dilimi: ${obj.timezone}` : null;
    const topGrid = document.createElement("div");
    topGrid.className = "grid-2";
    topGrid.appendChild(createCard("Tarih", dateFormatted, sub, true, true));
    els.metrics.appendChild(topGrid);
  }

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

// ============================================================================
// AKTİF SİTE BİLGİSİ ÇEKME (DOM & İLETİŞİM SAYFASI SCRAPER)
// ============================================================================

// Aktif sekmenin içerisinde çalıştırılacak fonksiyon
async function scrapeSiteDataInTab() {
  const result = {
    domain: window.location.hostname.replace(/^www\./i, "") || "-",
    url: window.location.origin || window.location.href || "-",
    email: "-",
    phone: "-",
    address: "-",
  };

  function scanDoc(doc) {
    let emails = new Set();
    const phones = new Set();
    let foundAddress = null;

    // 1. Mailto Linkleri (Önce kullanıcının ekranda gördüğü metin taranır, yoksa href alınır)
    doc.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
      const visibleMatch = (a.innerText || a.textContent || "").match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (visibleMatch) {
        emails.add(visibleMatch[0].toLowerCase().trim());
      } else {
        const email = a.href.replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
        if (email && email.includes("@")) emails.add(email);
      }
    });

    // 2. Tel Linkleri (Önce ekrandaki biçimli telefon metni, yoksa href alınır)
    doc.querySelectorAll('a[href^="tel:"]').forEach((a) => {
      const visiblePhone = (a.innerText || a.textContent || "").trim();
      const digits = visiblePhone.replace(/\D/g, "");
      if (digits.length >= 10 && digits.length <= 14) {
        phones.add(visiblePhone);
      } else {
        const phone = a.href.replace(/^tel:/i, "").trim();
        if (phone && phone.length >= 7) phones.add(phone);
      }
    });

    // 3. Schema.org / JSON-LD
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try {
        const json = JSON.parse(script.textContent);
        const findInJson = (obj) => {
          if (!obj || typeof obj !== "object") return;
          if (obj.email && typeof obj.email === "string") emails.add(obj.email.toLowerCase().trim());
          if (obj.telephone && typeof obj.telephone === "string") phones.add(obj.telephone);
          if (obj.address) {
            if (typeof obj.address === "string") foundAddress = obj.address;
            else if (typeof obj.address === "object") {
              const parts = [
                obj.address.streetAddress,
                obj.address.addressLocality,
                obj.address.addressRegion,
                obj.address.postalCode,
                obj.address.addressCountry,
              ].filter(Boolean);
              if (parts.length > 0) foundAddress = parts.join(", ");
            }
          }
          Object.values(obj).forEach(findInJson);
        };
        findInJson(json);
      } catch (_) {}
    });

    // 4. HTML5 Address ve Microdata
    if (!foundAddress) {
      const addrEl = doc.querySelector("address") || doc.querySelector('[itemprop="address"]');
      if (addrEl) {
        const txt = addrEl.innerText.trim().replace(/\s+/g, " ");
        if (txt.length >= 10 && txt.length < 300) foundAddress = txt;
      }
    }

    const bodyText = doc.body ? doc.body.innerText : "";

    // 5. Metin İçi "E-posta:" etiketli alan veya regex taraması
    const labelMatch = bodyText.match(/(?:e-?posta|email|mail)\s*[:：\-]?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (labelMatch && labelMatch[1]) {
      const labeledEmail = labelMatch[1].toLowerCase().trim();
      emails.delete(labeledEmail);
      emails = new Set([labeledEmail, ...emails]);
    } else if (emails.size === 0 && bodyText) {
      const matches = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      if (matches) {
        matches.forEach((em) => {
          if (!/\.(png|jpg|jpeg|gif|webp|svg|css|js|woff|woff2)$/i.test(em)) {
            emails.add(em.toLowerCase().trim());
          }
        });
      }
    }

    // 6. Metin İçi Telefon Taraması (TR ve Uluslararası Regex)
    if (phones.size === 0 && bodyText) {
      const phoneMatches = bodyText.match(/(?:\+?90|0)?\s*\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/g);
      if (phoneMatches) {
        phoneMatches.forEach((ph) => {
          const clean = ph.trim();
          const digits = clean.replace(/\D/g, "");
          if (digits.length >= 10 && digits.length <= 13) {
            phones.add(clean);
          }
        });
      }
      if (phones.size === 0) {
        const genericMatches = bodyText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{2,4}/g);
        if (genericMatches) {
          genericMatches.forEach((ph) => {
            const clean = ph.trim();
            const digits = clean.replace(/\D/g, "");
            if (digits.length >= 10 && digits.length <= 14 && !/^\d{4}[-.]\d{2}[-.]\d{2}$/.test(clean)) {
              phones.add(clean);
            }
          });
        }
      }
    }

    // 7. Footer ve Metin İçi Adres Taraması
    if (!foundAddress) {
      const footer = doc.querySelector("footer") || doc.querySelector("#footer") || doc.querySelector(".footer");
      const targetText = footer ? footer.innerText : bodyText;
      const addrMatch = targetText.match(/(?:adres|address)\s*[:：\-]\s*([^\n\r]{12,180})/i);
      if (addrMatch && addrMatch[1]) {
        foundAddress = addrMatch[1].trim();
      }
    }

    return {
      emails: Array.from(emails),
      phones: Array.from(phones),
      address: foundAddress,
    };
  }

  let scan = scanDoc(document);

  // Sayfada bulunamayan bilgi varsa İletişim / Hakkında sayfasına bak
  if (scan.emails.length === 0 || scan.phones.length === 0 || !scan.address) {
    const contactLinks = Array.from(document.querySelectorAll("a[href]")).filter((a) => {
      const href = a.getAttribute("href") || "";
      const text = a.textContent.toLowerCase();
      return (
        /iletisim|contact|bize-ulasin|ulasim|about|hakkimizda/i.test(href) ||
        /iletişim|contact|bize ulaşın|ulaşım|hakkımızda/i.test(text)
      );
    });

    if (contactLinks.length > 0) {
      const contactUrl = contactLinks[0].href;
      if (contactUrl.startsWith(window.location.origin)) {
        try {
          const resp = await fetch(contactUrl);
          if (resp.ok) {
            const html = await resp.text();
            const parser = new DOMParser();
            const contactDoc = parser.parseFromString(html, "text/html");
            const contactScan = scanDoc(contactDoc);

            if (scan.emails.length === 0 && contactScan.emails.length > 0) scan.emails = contactScan.emails;
            if (scan.phones.length === 0 && contactScan.phones.length > 0) scan.phones = contactScan.phones;
            if (!scan.address && contactScan.address) scan.address = contactScan.address;
          }
        } catch (_) {}
      }
    }
  }

  result.email = scan.emails.length > 0 ? scan.emails[0] : "-";
  result.phone = scan.phones.length > 0 ? scan.phones[0] : "-";
  result.address = scan.address ? scan.address : "-";

  return result;
}

els.btnScrapeSite.addEventListener("click", async () => {
  show(els.scraperError, false);
  show(els.scraperResults, false);
  show(els.scraperLoading, true);
  els.btnScrapeSite.disabled = true;

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.id) {
      throw new Error("Aktif sekme bulunamadı.");
    }
    if (!activeTab.url || activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("edge://") || activeTab.url.startsWith("about:")) {
      throw new Error("Tarayıcı içi sistem sayfalarında (chrome:// vb.) bilgi taranamıyor. Lütfen normal bir web sitesini açıp deneyin.");
    }

    const execResults = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: scrapeSiteDataInTab,
    });

    const data = execResults?.[0]?.result;
    if (!data) {
      throw new Error("Siteden bilgi okunamadı veya sayfa yüklenmesi tamamlanmadı.");
    }

    els.resDomain.textContent = data.domain || "-";
    els.resUrl.textContent = data.url || "-";
    els.resEmail.textContent = data.email || "-";
    els.resPhone.textContent = data.phone || "-";
    els.resAddress.textContent = data.address || "-";

    show(els.scraperResults, true);
  } catch (err) {
    els.scraperErrorMsg.textContent = err.message || "Bilinmeyen tarama hatası.";
    show(els.scraperError, true);
  } finally {
    show(els.scraperLoading, false);
    els.btnScrapeSite.disabled = false;
  }
});

// Kopyala butonları
document.querySelectorAll(".btn-copy").forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetId = btn.getAttribute("data-target");
    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;
    const text = targetEl.textContent.trim();
    if (text === "-" || text === "—") return;

    navigator.clipboard.writeText(text).then(() => {
      const orig = btn.textContent;
      btn.textContent = "✓";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = orig;
        btn.classList.remove("copied");
      }, 1500);
    });
  });
});

(async function init() {
  const { hipcall_auth_result: last } = await chrome.storage.local.get("hipcall_auth_result");
  await render();
  if (last && !last.ok && Date.now() - last.at < 5 * 60 * 1000 && els.viewLogin && !els.viewLogin.classList.contains("hidden")) {
    onAuthResult(last);
  }
  await chrome.storage.local.remove("hipcall_auth_result");
})();
