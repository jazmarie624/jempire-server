// J EMPIRE SERVER — app.js (version 11: waiting-on-papers reminders)
(function () {
  "use strict";

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
    { id: "add",      label: "1 Add Jobs" },
    { id: "jobs",     label: "2 Jobs" },
    { id: "route",    label: "3 Route" },
    { id: "done",     label: "4 Done" },
    { id: "invoices", label: "5 Invoices" },
    { id: "money",    label: "6 Money" }
  ];
  // iPhone bottom bar keeps it short; steps 4–6 live under "Office"
  const PHONE_TABS = [
    { id: "home", label: "Home" },
    { id: "add", label: "Add" },
    { id: "jobs", label: "Jobs" },
    { id: "route", label: "Route" },
    { id: "office", label: "Office" }
  ];
  // Red number badges: how many jobs are waiting at each step
  let BADGE = {};
  async function refreshBadges() {
    if (!db) return;
    const { data } = await db.from("jes_jobs").select("status,on_today,address,county,client,chk_client_app,chk_proof,chk_price,invoice_id,paid_upfront,has_papers");
    if (!data) return;
    const done = (j) => j.status === "Served" || j.status === "Non-Serve Complete";
    const routable = (j) => j.address && j.county && /\b(?:FL|Florida)\b[\s,]*\d{5}/i.test(j.address);
    const toCheck = data.filter((j) => done(j) && !(j.chk_client_app && j.chk_proof && j.chk_price)).length;
    const toBill = data.filter((j) => done(j) && j.chk_client_app && j.chk_proof && j.chk_price && !j.invoice_id && !j.paid_upfront && j.client !== "ABC Legal").length;
    BADGE = {
      jobs: data.filter((j) => j.status === "Active" && !(j.on_today && routable(j))).length,
      route: data.filter((j) => j.status === "Active" && j.on_today && routable(j) && j.has_papers !== false).length,
      done: toCheck, invoices: toBill, office: toCheck + toBill
    };
    drawTabs();
  }
  let current = "home";

  function drawTabs() {
    const badge = (id) => BADGE[id] ? `<span class="badge" aria-label="${BADGE[id]} waiting">${BADGE[id] > 99 ? "99+" : BADGE[id]}</span>` : "";
    $(".tabs-top").innerHTML = TABS.map((t) =>
      `<button class="tab" data-go="${t.id}" ${t.id === current ? 'aria-current="page"' : ""}>${esc(t.label)}${badge(t.id)}</button>`).join("");
    const phoneCur = ["done", "invoices", "money", "office"].includes(current) ? "office" : current;
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
      done: () => (window.JES_OFFICE ? window.JES_OFFICE.drawDone() : comingSoon("done")),
      invoices: () => (window.JES_OFFICE ? window.JES_OFFICE.drawInvoices() : comingSoon("invoices")),
      money: () => (window.JES_OFFICE ? window.JES_OFFICE.drawMoney() : comingSoon("money")),
      office: () => (window.JES_OFFICE ? window.JES_OFFICE.drawHub() : comingSoon("money"))
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
            <span><span class="choice-title">In the Office</span><span class="choice-sub">Verify, invoices, money, printing</span></span>
          </button>
        </div>
        <div id="alerts"></div>
        <div class="glance" id="glance">
          <button class="tile" data-go="jobs" data-filter="Active"><div class="tile-label">Active jobs ›</div><div class="tile-value">…</div><div class="tile-sub">Ready to route</div></button>
          <button class="tile" data-go="jobs" data-filter="On Hold"><div class="tile-label">On hold ›</div><div class="tile-value">…</div><div class="tile-sub">Kept, not routed</div></button>
          <button class="tile red" data-go="jobs" data-filter="Needs address"><div class="tile-label">Need fixing ›</div><div class="tile-value">…</div><div class="tile-sub">Red jobs</div></button>
          <button class="tile green" data-go="money"><div class="tile-label">This week ›</div><div class="tile-value">…</div><div class="tile-sub">Goal $500, Thu to Thu</div></button>
          <button class="tile red" data-go="invoices"><div class="tile-label">Pending payment ›</div><div class="tile-value">…</div><div class="tile-sub">Unpaid invoices</div></button>
        </div>
      </section>`;
    document.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => {
      const mode = b.getAttribute("data-mode");
      store.set("jes_mode", mode);
      go(mode === "field" ? "add" : "money");
    });
    loadGlance();
  }

  async function loadGlance() {
    const tiles = document.querySelectorAll("#glance .tile-value");
    const [jobsRes, invRes, goalRes] = await Promise.all([
      db.from("jes_jobs").select("*"),
      db.from("jes_invoices").select("total,status"),
      db.from("jes_settings").select("value").eq("key", "weekly_goal").maybeSingle()
    ]);
    if (jobsRes.error || invRes.error) {
      tiles.forEach((t) => t.textContent = "—");
      $("#alerts").innerHTML = `<div class="alert">Can't reach your data. Check that this device's setup link was opened and that config.js has your anon key.</div>`;
      return;
    }
    const jobs = jobsRes.data, invs = invRes.data;
    const ws = weekStart();
    const open = jobs.filter((j) => j.status === "Active" || j.status === "On Hold");
    const earned = jobs
      .filter((j) => (j.status === "Served" || j.status === "Non-Serve Complete") && j.done_at && new Date(j.done_at) >= ws)
      .reduce((s, j) => s + Number(j.price || 0), 0);
    const pending = invs.filter((i) => i.status === "Pending").reduce((s, i) => s + Number(i.total || 0), 0);
    const goal = goalRes.data ? Number(goalRes.data.value) : 500;

    tiles[0].textContent = jobs.filter((j) => j.status === "Active").length;
    tiles[1].textContent = jobs.filter((j) => j.status === "On Hold").length;
    tiles[2].textContent = open.filter(needsFixing).length;
    tiles[3].textContent = money(earned);
    tiles[4].textContent = money(pending);
    document.querySelectorAll("#glance .tile-sub")[3].textContent = `Goal ${money(goal)}, Thu to Thu`;

    // ---- Reminders: nothing is allowed to sit forgotten ----
    const alerts = [];
    const noAddress = jobs.filter((j) => j.status === "Active" && needsFixing(j));
    if (noAddress.length) alerts.push(`${noAddress.length} saved job${noAddress.length > 1 ? "s are" : " is"} missing an address and can't be routed yet. Tap to fix.`);

    // Waiting on papers from Jean (ProVest + Userve)
    const waiting = jobs.filter((j) => j.status === "Active" && ["ProVest", "Userve"].includes(j.client) && j.has_papers === false);
    const dueSoon = waiting.filter((j) => j.due_date && new Date(j.due_date).getTime() - Date.now() < 3 * 864e5);
    if (dueSoon.length) alerts.push(`${dueSoon.length} job${dueSoon.length > 1 ? "s" : ""} still waiting on papers ${dueSoon.length > 1 ? "are" : "is"} due within 3 days — ask Jean for ${dueSoon.length > 1 ? "them" : "it"} early.`);
    if (waiting.length) alerts.push(`${waiting.length} job${waiting.length > 1 ? "s are" : " is"} waiting on papers from Jean.`);

    const threeDays = Date.now() - 3 * 864e5;
    const idle = jobs.filter((j) => j.status === "Active" && !needsFixing(j) && !j.on_today && j.has_papers !== false &&
      (j.attempt_count || 0) === 0 && j.created_at && new Date(j.created_at).getTime() < threeDays);
    if (idle.length) alerts.push(`${idle.length} job${idle.length > 1 ? "s have" : " has"} been sitting 3+ days with no attempt and no route. Add to a route or put on hold?`);

    const shortPaid = jobs.filter((j) => Number(j.short_paid || 0) > 0);
    if (shortPaid.length) alerts.push(`${shortPaid.length} job${shortPaid.length > 1 ? "s were" : " was"} short paid — ${money(shortPaid.reduce((s, j) => s + Number(j.short_paid), 0))} still owed to you (invoice follow-up).`);

    const weekAgo = Date.now() - 7 * 864e5;
    const forgot = jobs.filter((j) =>
      (j.status === "Served" || j.status === "Non-Serve Complete") && !j.invoice_id && !j.paid_upfront &&
      j.client !== "ABC Legal" && j.done_at && new Date(j.done_at).getTime() < weekAgo);
    if (forgot.length) alerts.push(`${forgot.length} finished job${forgot.length > 1 ? "s are" : " is"} over a week old and not on an invoice yet.`);

    $("#alerts").innerHTML = alerts.length
      ? `<div class="alerts">${alerts.map((a, i) => `<button class="alert tap" ${/invoice/.test(a) ? 'data-go="invoices"' : /papers/.test(a) ? 'data-go="jobs" data-filter="Papers"' : /address/.test(a) ? 'data-go="jobs" data-filter="Needs address"' : 'data-go="jobs" data-filter="Active"'}>${esc(a)}</button>`).join("")}</div>`
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
