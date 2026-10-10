// J EMPIRE SERVER — app.js (version 16: version stamp on Home —  Attempts + Sheets replace Done + Invoices)
(function () {
  "use strict";
  window.JES_VER = Object.assign(window.JES_VER || {}, { app: 16 });

  // ---------- small helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const money = (n) => "$" + (Number(n) || 0).toFixed(2);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- text size (A− / A+) — remembered per device ----------
  const SIZES = [0.8, 0.9, 1, 1.1, 1.2, 1.35];
  let sizeIdx = Number(store.get("jes_size", 2));
  function applySize() {
    document.documentElement.style.setProperty("--scale", SIZES[sizeIdx]);
    store.set("jes_size", sizeIdx);
  }
  $("#sizeDown").onclick = () => { if (sizeIdx > 0) { sizeIdx--; applySize(); } };
  $("#sizeUp").onclick = () => { if (sizeIdx < SIZES.length - 1) { sizeIdx++; applySize(); } };
  applySize();

  // ---------- device key (no password) ----------
  // Setup link looks like: https://.../#setup=YOURKEY  — open once per device.
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get("setup")) {
    store.set("jes_key", hash.get("setup").trim());
    history.replaceState(null, "", location.pathname);
  }
  const deviceKey = store.get("jes_key", "");

  const cfg = window.JES_CONFIG || {};
  let db = null;
  function connect() {
    db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      global: { headers: { "x-jempire-key": store.get("jes_key", "") } },
      auth: { persistSession: false }
    });
    window.JES = { db, esc, money, toast, go: (id, f) => go(id, f), refreshBadges: () => refreshBadges() };
  }

  // ---------- sections ----------
  // Tabs follow the order you actually work: add → check → route → verify → bill → money
  const TABS = [
    { id: "home",     label: "Home" },
    { id: "add",      label: "Add Jobs" },
    { id: "jobs",     label: "Jobs" },
    { id: "route",    label: "Route" },
    { id: "attempts", label: "Attempts" },
    { id: "sheets",   label: "Sheets" },
    { id: "money",    label: "Money" }
  ];
  // iPhone bottom bar keeps it to five; Attempts is one tap from Jobs and from the end of a route
  const PHONE_TABS = [
    { id: "home", label: "Home" },
    { id: "add", label: "Add" },
    { id: "jobs", label: "Jobs" },
    { id: "route", label: "Route" },
    { id: "sheets", label: "Sheets" }
  ];
  // Red number badges: how many jobs are waiting at each step
  let BADGE = {};
  async function refreshBadges() {
    if (!db) return;
    const [jobsRes, sheetRes] = await Promise.all([
      db.from("jes_jobs").select("status,on_today,address,county,client,has_papers,in_attempts,sheet_id,billed"),
      db.from("jes_sheets").select("status,paid_on")
    ]);
    const data = jobsRes.data;
    if (!data) return;
    const sheets = sheetRes.data || [];
    const routable = (j) => j.address && j.county && /\b(?:FL|Florida)\b[\s,]*\d{5}/i.test(j.address);
    BADGE = {
      jobs: data.filter((j) => j.status === "Active" && !j.in_attempts && !(j.on_today && routable(j))).length,
      route: data.filter((j) => j.status === "Active" && j.on_today && routable(j) && j.has_papers !== false).length,
      attempts: data.filter((j) => j.in_attempts).length,
      sheets: data.filter((j) => j.sheet_id && j.billed == null).length,
      money: sheets.filter((s) => s.status === "Closed" && !s.paid_on).length
    };
    drawTabs();
  }
  let current = "home";

  function drawTabs() {
    const badge = (id) => BADGE[id] ? `<span class="badge" aria-label="${BADGE[id]} waiting">${BADGE[id] > 99 ? "99+" : BADGE[id]}</span>` : "";
    $(".tabs-top").innerHTML = TABS.map((t) =>
      `<button class="tab" data-go="${t.id}" ${t.id === current ? 'aria-current="page"' : ""}>${esc(t.label)}${badge(t.id)}</button>`).join("");
    const phoneCur = ["money", "office"].includes(current) ? "sheets" : current === "attempts" ? "jobs" : current;
    $(".tabs-bottom").innerHTML = PHONE_TABS.map((t) =>
      `<button class="tab" data-go="${t.id}" ${t.id === phoneCur ? 'aria-current="page"' : ""}><span class="tab-in">${esc(t.label)}${badge(t.id)}</span></button>`).join("");
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-go]");
    if (!b) return;
    go(b.getAttribute("data-go"), b.getAttribute("data-filter"));
  });

  function go(id, filter) {
    current = id;
    drawTabs();
    refreshBadges();
    window.scrollTo(0, 0);
    const screens = {
      home: drawHome,
      add: () => (window.JES_INTAKE ? window.JES_INTAKE.draw() : comingSoon("add")),
      jobs: () => (window.JES_JOBS ? window.JES_JOBS.drawJobs(filter ? { filter } : null) : comingSoon("jobs")),
      route: () => (window.JES_JOBS ? window.JES_JOBS.drawRoute() : comingSoon("route")),
      attempts: () => (window.JES_JOBS ? window.JES_JOBS.drawAttempts() : comingSoon("attempts")),
      sheets: () => (window.JES_OFFICE ? window.JES_OFFICE.drawSheets(filter ? { company: filter } : null) : comingSoon("sheets")),
      money: () => (window.JES_OFFICE ? window.JES_OFFICE.drawMoney(filter ? { company: filter } : null) : comingSoon("money")),
      office: () => (window.JES_OFFICE ? window.JES_OFFICE.drawSheets() : comingSoon("sheets"))
    };
    (screens[id] || drawHome)(id);
  }

  // ---------- home screen ----------
  const LOGO = `<svg class="home-logo" viewBox="0 0 220 220" aria-label="J Empire logo">
    <g transform="translate(122,54) rotate(4) scale(0.85)"><path d="M-18 6 L-20 -10 L-9 -1 L0 -16 L9 -1 L20 -10 L18 6 Z" fill="#B08D43"/><rect x="-18" y="7" width="36" height="4" fill="#B08D43"/><circle cx="-20" cy="-11" r="2.6" fill="#B08D43"/><circle cx="0" cy="-17" r="2.6" fill="#B08D43"/><circle cx="20" cy="-11" r="2.6" fill="#B08D43"/></g>
    <text x="110" y="148" text-anchor="middle" font-family="Pinyon Script" font-size="112" fill="#1F2A44">J</text>
    <line x1="40" y1="180" x2="180" y2="180" stroke="#B08D43" stroke-width="1.5"/>
    <path d="M110 175 L115 180 L110 185 L105 180 Z" fill="#B08D43"/>
    <text x="110" y="206" text-anchor="middle" font-family="Cormorant Garamond" font-weight="700" font-size="17" letter-spacing="7" fill="#1F2A44">EMPIRE</text>
  </svg>`;
  const PIN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`;
  const DESK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>`;

  // Serve week runs Thursday to Thursday
  function weekStart() {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() - 4 + 7) % 7));
    return d;
  }
  function needsFixing(j) {
    return !j.client || !j.address || !j.county || !/\b(?:FL|Florida)\b[\s,]*\d{5}/i.test(j.address || "");
  }

  async function drawHome() {
    $("#screen").innerHTML = `
      <section class="home">
        <div class="home-hero">
          ${LOGO}
          <div>
            <div class="home-hello">Welcome back, Jazmin</div>
            <div class="muted">Where are you working today?</div>
          </div>
        </div>
        <div class="choices">
          <button class="choice field" data-mode="field">${PIN}
            <span><span class="choice-title">Out in the Field</span><span class="choice-sub">Paste jobs, build the route, mark Attempted or Served</span></span>
          </button>
          <button class="choice" data-mode="office">${DESK}
            <span><span class="choice-title">In the Office</span><span class="choice-sub">Sheets, printing for Jean, who still owes you</span></span>
          </button>
        </div>
        <div id="alerts"></div>
        <div class="glance" id="glance">
          <button class="tile" data-go="jobs" data-filter="Active"><div class="tile-label">Active jobs ›</div><div class="tile-value">…</div><div class="tile-sub">Ready to route</div></button>
          <button class="tile" data-go="attempts"><div class="tile-label">Attempts ›</div><div class="tile-value">…</div><div class="tile-sub">Go back another day</div></button>
          <button class="tile red" data-go="jobs" data-filter="Needs address"><div class="tile-label">Need fixing ›</div><div class="tile-value">…</div><div class="tile-sub">Red jobs</div></button>
          <button class="tile green" data-go="sheets"><div class="tile-label">On open sheets ›</div><div class="tile-value">…</div><div class="tile-sub">Not submitted yet</div></button>
          <button class="tile red" data-go="money"><div class="tile-label">Owed to me ›</div><div class="tile-value">…</div><div class="tile-sub">Submitted, not paid</div></button>
          <button class="tile green" data-go="money"><div class="tile-label">This week ›</div><div class="tile-value">…</div><div class="tile-sub">Goal $500, Thu to Thu</div></button>
        </div>
        <div class="ver-line" id="verLine"></div>
      </section>`;
    drawVersion();
    document.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => {
      const mode = b.getAttribute("data-mode");
      store.set("jes_mode", mode);
      go(mode === "field" ? "add" : "sheets");
    });
    loadGlance();
  }

  // So you can always tell at a glance whether an upload actually landed
  function drawVersion() {
    const v = window.JES_VER || {};
    const box = $("#verLine");
    if (!box) return;
    box.innerHTML = `<span>Version <b>${v.app || "?"}.${v.intake || "?"}.${v.jobs || "?"}.${v.office || "?"}</b></span>
      <button class="ver-reload" id="verReload">Check for an update</button>`;
    $("#verReload").onclick = () => {
      // Jump to a fresh address so the phone can't hand back a stale page
      location.replace(location.pathname + "?r=" + Date.now());
    };
  }

  async function loadGlance() {
    const tiles = document.querySelectorAll("#glance .tile-value");
    const [jobsRes, sheetRes, goalRes] = await Promise.all([
      db.from("jes_jobs").select("*"),
      db.from("jes_sheets").select("*"),
      db.from("jes_settings").select("value").eq("key", "weekly_goal").maybeSingle()
    ]);
    if (jobsRes.error || sheetRes.error) {
      tiles.forEach((t) => t.textContent = "—");
      $("#alerts").innerHTML = `<div class="alert">Can't reach your data. If you just ran the new SQL, reload this page. Otherwise check that this device's setup link was opened and that config.js has your anon key.</div>`;
      return;
    }
    const jobs = jobsRes.data, sheets = sheetRes.data;
    const ws = weekStart();
    const goal = goalRes.data ? Number(goalRes.data.value) : 500;

    const onOpenSheet = jobs.filter((j) => j.sheet_id && j.billed == null);
    const billedJobs = jobs.filter((j) => j.billed != null);
    const openTotal = onOpenSheet.reduce((s, j) => s + Number(j.price || 0), 0);
    const owed = billedJobs.reduce((s, j) => s + Math.max(0, Number(j.billed) - Number(j.paid_amount || 0)), 0);
    const earned = jobs
      .filter((j) => j.done_at && new Date(j.done_at) >= ws)
      .reduce((s, j) => s + Number(j.billed != null ? j.billed : j.price || 0), 0);

    tiles[0].textContent = jobs.filter((j) => j.status === "Active" && !j.in_attempts).length;
    tiles[1].textContent = jobs.filter((j) => j.in_attempts).length;
    tiles[2].textContent = jobs.filter((j) => (j.status === "Active" || j.status === "On Hold") && needsFixing(j)).length;
    tiles[3].textContent = money(openTotal);
    tiles[4].textContent = money(owed);
    tiles[5].textContent = money(earned);
    document.querySelectorAll("#glance .tile-sub")[5].textContent = `Goal ${money(goal)}, Thu to Thu`;

    // ---- Reminders: nothing is allowed to sit forgotten ----
    const alerts = [];
    const days = (d) => (new Date(d).getTime() - Date.now()) / 864e5;

    const noAddress = jobs.filter((j) => j.status === "Active" && needsFixing(j));
    if (noAddress.length) alerts.push({ go: 'data-go="jobs" data-filter="Needs address"',
      t: `${noAddress.length} saved job${noAddress.length > 1 ? "s are" : " is"} missing an address and can't be routed yet. Tap to fix.` });

    // Serve-by date coming up — miss it and the job pays nothing
    const dueSoon = jobs.filter((j) => j.status === "Active" && !j.outcome && j.due_date && days(j.due_date) <= 2);
    if (dueSoon.length) alerts.push({ go: 'data-go="jobs" data-filter="Active"',
      t: `${dueSoon.length} job${dueSoon.length > 1 ? "s are" : " is"} due within 2 days — serve ${dueSoon.length > 1 ? "them" : "it"} or ${dueSoon.length > 1 ? "they don't" : "it doesn't"} pay.` });

    const nearly = jobs.filter((j) => j.in_attempts && (j.attempt_count || 0) >= 4);
    if (nearly.length) alerts.push({ go: 'data-go="attempts"',
      t: `${nearly.length} job${nearly.length > 1 ? "s are" : " is"} on attempt 4 of 5 — one more trip and ${nearly.length > 1 ? "they're" : "it's"} done.` });

    const waiting = jobs.filter((j) => j.status === "Active" && j.has_papers === false);
    if (waiting.length) alerts.push({ go: 'data-go="jobs" data-filter="Papers"',
      t: `${waiting.length} job${waiting.length > 1 ? "s are" : " is"} marked NO PAPERS YET — they stay off the route until you tick them.` });

    const short = billedJobs.filter((j) => j.paid_amount != null && Number(j.paid_amount) < Number(j.billed));
    if (short.length) alerts.push({ go: 'data-go="money"',
      t: `${short.length} job${short.length > 1 ? "s were" : " was"} short paid — ${money(short.reduce((s, j) => s + (Number(j.billed) - Number(j.paid_amount)), 0))} still owed to you.` });

    const stale = sheets.filter((s) => s.status === "Closed" && !s.paid_on && s.closed_on && -days(s.closed_on) > 14);
    stale.forEach((s) => alerts.push({ go: 'data-go="money"',
      t: `${s.company} sheet for ${money(s.total)} has been unpaid ${Math.round(-days(s.closed_on))} days.` }));

    const bigOpen = sheets.filter((s) => s.status === "Open").map((s) => ({
      s, n: onOpenSheet.filter((j) => j.sheet_id === s.id).length
    })).filter((x) => x.n >= 15);
    bigOpen.forEach((x) => alerts.push({ go: `data-go="sheets" data-filter="${esc(x.s.company)}"`,
      t: `The ${x.s.company} sheet is up to ${x.n} jobs — close it and get it submitted.` }));

    $("#alerts").innerHTML = alerts.length
      ? `<div class="alerts">${alerts.map((a) => `<button class="alert tap" ${a.go}>${esc(a.t)}</button>`).join("")}</div>`
      : "";
  }

  function comingSoon(id) {
    const piece = { add: "Piece 2 (Smart Intake)", jobs: "Piece 3 (Jobs + Route)", route: "Piece 3 (Jobs + Route)", done: "Piece 4 (Office)", money: "Piece 4 (Office)" }[id];
    $("#screen").innerHTML = `<div class="card coming"><h2>${esc((TABS.find((t) => t.id === id) || { label: "Office" }).label)}</h2><p class="muted">This screen arrives in ${piece}.</p></div>`;
  }

  // ---------- first-time setup screen ----------
  function drawSetup(msg) {
    $(".tabs-top").innerHTML = ""; $(".tabs-bottom").innerHTML = "";
    $("#screen").innerHTML = `
      <div class="card setup">
        <h1>Connect this device</h1>
        <p>Open your setup link once on this ${/iPad|Macintosh/.test(navigator.userAgent) ? "iPad" : "phone"}, or paste your setup key here. You won't be asked again.</p>
        ${msg ? `<div class="alert">${esc(msg)}</div>` : ""}
        <label for="keyIn">Setup key</label>
        <input id="keyIn" autocomplete="off" autocapitalize="off" spellcheck="false">
        <button class="btn" id="keySave">Connect</button>
      </div>`;
    $("#keySave").onclick = () => {
      const k = $("#keyIn").value.trim();
      if (!k) return;
      store.set("jes_key", k);
      start();
    };
  }

  // ---------- start ----------
  async function start() {
    if (!cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.indexOf("PASTE") === 0) {
      drawSetup("config.js still needs your Supabase anon key.");
      return;
    }
    if (!store.get("jes_key", "")) { drawSetup(""); return; }
    connect();
    // The key check: a wrong key returns zero rows from settings (which always has rows)
    const test = await db.from("jes_settings").select("key").limit(1);
    if (test.error) { drawSetup("Couldn't connect: " + test.error.message); return; }
    if (!test.data.length) { drawSetup("That setup key didn't match. Open your setup link again."); return; }
    go("home");
    toast("Connected");
  }

  start();
})();
