// J EMPIRE SERVER — jobs.js (version 37: paper check by ZIP or by client, with a “Jean’s two only” view —  stacked “middle of the ZIP” pins fan out and own up to it —  “you are here” pin, and the map says how many stops it actually placed —  tap a client in the count box to see only their jobs —  road miles banked at every stop —  the paper number stops shuffling —  tap any stop to open it —  count box on Jobs —  stops-by-ZIP box and a rush bar on the Route —  rush shows on typed jobs —  papers tick on every client —  a stop with no county no longer disappears off the route —  jump a stop to the front —  papers list grouped by ZIP —  packet reminder on the stop —  due boxes tint red —  gas order wins, deadlines shown not re-sorted —  deadline beats a saved route order —  lineup rebuilt —  deadlines drive the route order —  print pile and Jean pile split apart —  need-papers-printed list —  Lineup list + papers on every job —  deadline + job-type flags —  Served + Non-Served go straight to the sheet, Attempts folder, miles banked)
(function () {
  "use strict";
  window.JES_VER = Object.assign(window.JES_VER || {}, { jobs: 37 });
  const J = () => window.JES;
  const P = () => window.JES_PARSE;
  const $ = (s) => document.querySelector(s);
  const byId = (id) => document.getElementById(id);

  const PAPER_CLIENTS = ["ProVest", "Userve"];
  const waitingPapers = (j) => j.status === "Active" && j.has_papers === false;
  function flagChips(j) {
    const out = [];
    const dm = dueMark(j);
    if (dm) out.push(dm.replace(/class="m /g, 'class="flag-chip '));
    if (j.job_type) out.push(`<span class="flag-chip ${/expedit|rush|same.?day|asap|priority/i.test(j.job_type) ? "rush" : "type"}">📌 ${J().esc(j.job_type)}</span>`);
    // A rush can land on a job that already has a service type (Routine, 2 Day Post).
    // It used to be hidden the moment job_type was set, which made ProVest rushes invisible.
    if (j.service === "Rush") out.push(`<span class="flag-chip rush">⚡ Rush</span>`);
    if (j.is_foreclosure) out.push(`<span class="flag-chip fore">📚 Foreclosure${(j.packets || 1) > 1 ? " ×" + j.packets : ""}</span>`);
    if (j.is_business) out.push(`<span class="flag-chip biz">🏢 Business · 10–12 / 2–4</span>`);
    if (waitingPapers(j)) out.push(`<span class="flag-chip paper">📄 Waiting on papers</span>`);
    return out.join(" ");
  }
  // What drives first. Lower wins: overdue, due today, due tomorrow, rush, the rest.
  const rank = (j) => {
    const d = daysLeft(j);
    if (d != null && d < 0) return 0;
    if (d === 0) return 1;
    if (d === 1) return 2;
    if (j.service === "Rush") return 3;
    return 4;
  };
  const urgent = (j) => (rank(j) <= 3 ? 1 : 0);
  // Urgent ones to the front, without throwing away the gas-saving order
  const byUrgency = (list) => list.map((j, i) => ({ j, i }))
    .sort((a, b) => rank(a.j) - rank(b.j) || a.i - b.i)
    .map((x) => x.j);
  const needsAddress = (j) => !j.address || !P().hasZip(j.address) || !j.county;
  const isDone = (j) => j.status === "Served" || j.status === "Non-Serve Complete";

  async function fetchJobs() {
    const { data, error } = await J().db.from("jes_jobs").select("*").order("created_at", { ascending: false });
    if (error) { J().toast("Couldn't load jobs: " + error.message); return []; }
    return data;
  }
  async function updateJob(id, patch) {
    patch.updated_at = new Date().toISOString();
    const { error } = await J().db.from("jes_jobs").update(patch).eq("id", id);
    if (error) J().toast("Not saved: " + error.message);
    return !error;
  }
  async function logAttempt(job, kind, note) {
    await J().db.from("jes_attempts").insert({ job_id: job.id, kind, note: note || null });
  }

  // =====================================================================
  // JOBS TAB
  // =====================================================================
  // Four columns, left to right in the order a job moves:
  // Needs address → Ready to route → On today's route → On hold
  const COLS = [
    { id: "fix",    short: "Fix",    title: "Needs address",     sub: "Add the address to route it",   test: (j) => !isDone(j) && j.status !== "On Hold" && !waitingPapers(j) && needsAddress(j) },
    { id: "papers", short: "Print",  title: "Need papers printed", sub: "Emailed to you · print them yourself",
      test: (j) => waitingPapers(j) && !PAPER_CLIENTS.includes(j.client) },
    { id: "jean",   short: "Jean",   title: "Waiting on Jean",     sub: "He has the papers · can't route yet",
      test: (j) => waitingPapers(j) && PAPER_CLIENTS.includes(j.client) },
    { id: "ready",  short: "Ready",  title: "Ready to route",    sub: "Tap + Today to add",             test: (j) => j.status === "Active" && !waitingPapers(j) && !needsAddress(j) && !j.on_today },
    { id: "today",  short: "Today",  title: "On today's route",  sub: "Shown on Route",                 test: (j) => j.status === "Active" && !waitingPapers(j) && !needsAddress(j) && j.on_today },
    { id: "hold",   short: "Hold",   title: "On hold",           sub: "Paused or has a problem",        test: (j) => j.status === "On Hold" }
  ];
  const FILTER_TO_COL = { "Needs address": "fix", "Papers": "papers", "Jean": "jean", "Active": "ready", "Today": "today", "On Hold": "hold" };
  const JS = { col: "ready", hcol: "Ody's", view: "working", county: "All", client: "All", q: "", jobs: [], invs: {}, dense: localStorage.getItem("jes_dense") !== "cards" };

  async function drawJobs(opts) {
    if (opts && opts.filter && FILTER_TO_COL[opts.filter]) JS.col = FILTER_TO_COL[opts.filter];
    const { esc } = J();
    byId("screen").innerHTML = `
      <section class="jobs">
        <div class="jobs-bar">
          <h1>Jobs</h1>
          <div class="seg view-seg" id="jDense">${[["list", "List"], ["cards", "Cards"]].map(([v, t]) => `<button class="${(v === "list") === JS.dense ? "on" : ""}" data-d="${v}">${t}</button>`).join("")}</div>
          <div class="seg view-seg" id="jView">${[["working", "Working"], ["history", "History"]].map(([v, t]) => `<button class="${v === JS.view ? "on" : ""}" data-v="${v}">${t}</button>`).join("")}</div>
          <label class="sr" for="jq">Search jobs</label>
          <input id="jq" class="search" type="search" placeholder="Search name, job #, address" value="${esc(JS.q)}">
          <button class="btn ghost thin" id="jPaper">📋 Paper check</button>
          <div class="seg" id="jCounty">${["All", "Osceola", "Orange"].map((c) => `<button class="${c === JS.county ? "on" : ""}" data-c="${c}">${c}</button>`).join("")}</div>
        </div>
        <div id="jTally"></div>
        <div class="chips phone-only" id="jColPick"></div>
        <div id="jBody"><p class="muted">Loading…</p></div>
        <div id="printSheet" class="print-only"></div>
      </section>
      <div class="sheet-back" id="sheetBack" hidden></div>`;
    byId("jCounty").onclick = (e) => { const b = e.target.closest("[data-c]"); if (b) { JS.county = b.dataset.c; drawJobs(); } };
    byId("jq").oninput = (e) => { JS.q = e.target.value; drawList(); };
    byId("jPaper").onclick = () => drawPaperCheck();
    byId("jDense").onclick = (e) => {
      const b = e.target.closest("[data-d]"); if (!b) return;
      JS.dense = b.dataset.d === "list";
      localStorage.setItem("jes_dense", JS.dense ? "list" : "cards");
      drawJobs();
    };
    byId("jView").onclick = (e) => { const b = e.target.closest("[data-v]"); if (b) { JS.view = b.dataset.v; drawJobs(); } };
    JS.jobs = await fetchJobs();
    const { data: invs } = await J().db.from("jes_invoices").select("id,grp,status,paid_on,period_start,period_end");
    JS.invs = {}; (invs || []).forEach((i) => { JS.invs[i.id] = i; });
    drawList();
  }

  // The job type Proof gives us (2 Day Post / Expedited / Standard) carries a
  // deadline, so it rides on the front of every row with the countdown next to it.
  function typeMark(j) {
    if (!j.job_type) return "";
    const t = String(j.job_type);
    const hot = /expedit|rush|same.?day|asap|priority/i.test(t);
    return `<span class="m ${hot ? "rush" : "type"}">📌 ${J().esc(t.toUpperCase())}</span>`;
  }
  // Whole calendar days, so a job due tomorrow says tomorrow — not "2 days"
  function daysLeft(j) {
    if (!j.due_date) return null;
    const due = new Date(String(j.due_date).slice(0, 10) + "T00:00:00");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((due.getTime() - today.getTime()) / 864e5);
  }
  // Tints the whole box, not just a chip — red when the clock is on you
  function dueClass(j) {
    if (isDone(j)) return "";
    const d = daysLeft(j);
    if (d == null) return "";
    if (d <= 0) return "due-now";
    if (d === 1) return "due-soon";
    return "";
  }
  function dueMark(j) {
    if (isDone(j)) return "";
    const d = daysLeft(j);
    if (d == null) return "";
    if (d < 0) return `<span class="m late">⏰ OVERDUE</span>`;
    if (d === 0) return `<span class="m late">⏰ DUE TODAY</span>`;
    if (d === 1) return `<span class="m late">⏰ DUE TOMORROW</span>`;
    if (d <= 3) return `<span class="m due">⏰ ${d} DAYS LEFT</span>`;
    return "";
  }

  function jobLine(j) {
    const { esc, money } = J();
    const red = !isDone(j) && needsAddress(j);
    const wait = waitingPapers(j);
    const cls = red ? "is-red" : wait || j.status === "On Hold" ? "is-hold" : isDone(j) ? "is-done" : "is-green";
    const marks = [
      dueMark(j),
      typeMark(j),
      j.service === "Rush" ? `<span class="m rush">⚡ RUSH</span>` : "",
      j.is_foreclosure ? `<span class="m fore">📚 ${(j.packets || 1) > 1 ? "×" + j.packets : "FORECL"}</span>` : "",
      j.is_business ? `<span class="m biz">🏢 10–12 / 2–4</span>` : "",
      wait ? `<span class="m pap">📄 NO PAPERS</span>` : "",
      j.status === "On Hold" ? `<span class="m hold">⏸ HOLD</span>` : ""
    ].filter(Boolean).join("");
    const title = j.person || (j.address ? j.address.split(",")[0] : "(no name)");
    return `<div class="jline ${cls} ${dueClass(j)}" data-open="${j.id}" role="button" tabindex="0">
      <span class="jl-body">
        <span class="jl-row1">${marks}<b class="jl-name">${esc(title)}</b>${j.job_no ? `<span class="jobno">#${esc(j.job_no)}</span>` : ""}</span>
        <span class="jl-row2">${red ? `<b class="bad">${esc(P().problems(j).join(" · "))}</b> ` : ""}${esc(j.address || "no address yet")}<span class="jl-tail"> · ${esc(j.client || "")}${j.attempt_count && !isDone(j) ? ` · att ${j.attempt_count}/5` : ""}${j.price ? ` · ${money(j.price)}` : ""}</span></span>
      </span>
      ${wait ? `<button class="jl-today gotit" data-papers="${j.id}" aria-label="${PAPER_CLIENTS.includes(j.client) ? "Got the papers from Jean for" : "Printed the papers for"} ${esc(title)}">✓</button>`
        : j.status === "Active" && !red ? `<button class="jl-today ${j.on_today ? "on" : ""}" data-today="${j.id}" aria-label="${j.on_today ? "Remove from" : "Add to"} today">${j.on_today ? "✓" : "+"}</button>` : ""}
    </div>`;
  }

  function jobCard(j) {
    const { esc, money } = J();
    const red = !isDone(j) && needsAddress(j);
    const cls = red ? "is-red" : j.status === "On Hold" ? "is-hold" : isDone(j) ? "is-done" : "is-green";
    const wait = waitingPapers(j);
    const canToday = j.status === "Active" && !red && !wait;
    return `
      <div class="jcard ${cls}">
        <div class="jc-top">
          <span class="tap-field name" contenteditable data-jf="person" data-id="${j.id}" data-ph="${esc(j.address ? j.address.split(",")[0] : "tap to add name")}">${esc(j.person || "")}</span>
          <span class="tap-field jobno" contenteditable inputmode="numeric" data-jf="job_no" data-id="${j.id}" data-ph="job #">${esc(j.job_no || "")}</span>
        </div>
        <div class="jc-addr">${red ? `<b>${esc(P().problems(j).join(" · "))}</b>${j.address ? " · " : ""}` : ""}${esc(j.address || "")}</div>
        <div class="jc-meta">${esc(j.client || "")}${j.attempt_count && !isDone(j) ? ` · ${j.attempt_count}/5` : ""}${j.due_date && !isDone(j) ? ` · ${esc(fmtDate(j.due_date).slice(0, 5))}` : ""} · <b>${money(j.price)}</b> ${flagChips(j)}</div>
        <div class="jc-btns">
          ${canToday ? `<button class="today-btn ${j.on_today ? "on" : ""}" data-today="${j.id}">${j.on_today ? "✓ Today" : "+ Today"}</button>` : ""}
          ${wait ? `<button class="today-btn paper-btn" data-gotpaper="${j.id}">✓ ${PAPER_CLIENTS.includes(j.client) ? "Got it from Jean" : "Printed it"}</button>` : ""}
          ${j.status === "Active" && !wait ? `<button class="mini-flag" data-nopaper="${j.id}" aria-label="Mark waiting on papers">📄</button>` : ""}
          <button class="mini-flag ${j.service === "Rush" ? "on rush" : ""}" data-jflag="service" data-id="${j.id}" aria-label="Rush">⚡</button>
          <button class="mini-flag ${j.is_business ? "on biz" : ""}" data-jflag="is_business" data-id="${j.id}" aria-label="Business">🏢</button>
          <button class="btn ghost thin" data-open="${j.id}">${red ? "Fix" : "Open"}</button>
        </div>
      </div>`;
  }

  function wireCards(box, after) {
    box.querySelectorAll(".tap-field").forEach((el) => {
      el.onblur = async () => {
        const j = JS.jobs.find((x) => x.id === el.dataset.id); if (!j) return;
        const v = el.textContent.trim();
        if (v === (j[el.dataset.jf] || "")) return;
        j[el.dataset.jf] = v;
        if (await updateJob(j.id, { [el.dataset.jf]: v || null })) J().toast("Saved");
      };
      el.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } };
    });
    box.querySelectorAll("[data-jflag]").forEach((b) => b.onclick = async () => {
      const j = JS.jobs.find((x) => x.id === b.dataset.id);
      const f = b.dataset.jflag;
      const patch = f === "service" ? { service: j.service === "Rush" ? "Standard" : "Rush" } : { [f]: !j[f] };
      Object.assign(j, patch);
      if (await updateJob(j.id, patch)) after();
    });
    box.querySelectorAll("[data-nopaper]").forEach((b) => b.onclick = async () => {
      if (await updateJob(b.dataset.nopaper, { has_papers: false, on_today: false })) { J().toast("Moved to waiting on papers"); J().refreshBadges && J().refreshBadges(); after(); }
    });
  }

  const SHORT = { "Accurate Serve": "Accurate", "Legal Serve USA": "Legal USA", "Lynx Legal": "Lynx" };
  const shortName = (c) => SHORT[c] || c;
  const H_CLIENTS = ["ProVest", "Userve", "Ody's", "Accurate Serve", "Proof", "Lynx Legal", "Legal Serve USA", "Private"];
  function moneyStatus(j) {
    if (j.billed != null && j.paid_amount != null && Number(j.paid_amount) >= Number(j.billed))
      return { cls: "st-paid", t: "Paid ✓" + (j.paid_on ? " " + fmtDate(j.paid_on).slice(0, 5) : "") };
    if (j.billed != null && j.paid_amount != null)
      return { cls: "st-unbilled", t: "SHORT PAID" };
    if (j.billed != null) return { cls: "st-pending", t: "Submitted · waiting" };
    if (j.sheet_id) return { cls: "st-pending", t: "On the open sheet" };
    if (j.paid_upfront) return { cls: "st-paid", t: "Paid upfront" };
    if (isDone(j)) return { cls: "st-unbilled", t: "Done · not on a sheet" };
    if (j.in_attempts) return { cls: "st-hold", t: `In Attempts · ${j.attempt_count || 0}/5` };
    if (j.status === "On Hold") return { cls: "st-hold", t: "On hold" };
    return { cls: "st-active", t: `Active · attempt ${j.attempt_count || 0}/5` };
  }
  function histCard(j) {
    const { esc, money } = J();
    const m = moneyStatus(j);
    const d = j.done_at || j.created_at;
    return `<div class="hcard">
      <div class="jc-name">${esc(j.person || "(no name yet)")}${j.job_no ? ` <span class="jobno">#${esc(j.job_no)}</span>` : ""}</div>
      <div class="jc-addr">${esc(j.address || "No address on file")}</div>
      ${flagChips(j) ? `<div class="chip-row">${flagChips(j)}</div>` : ""}
      <div class="hc-foot"><span class="mstat ${m.cls}">${esc(m.t)}</span><span class="hc-right">${esc(d ? fmtDate(d).slice(0, 5) : "")} · <b>${money(j.price)}</b></span></div>
      <div class="jc-btns"><button class="btn ghost thin" data-open="${j.id}">Open</button></div>
    </div>`;
  }
  function drawHistory(q, byCounty) {
    const { esc, money } = J();
    const match = (j) => !q || [j.person, j.job_no, j.address, j.client, j.notes].join(" ").toLowerCase().includes(q);
    const cols = H_CLIENTS.map((c) => {
      const jobs = JS.jobs.filter((j) => j.client === c && byCounty(j) && match(j))
        .sort((a, b) => new Date(b.done_at || b.created_at) - new Date(a.done_at || a.created_at));
      return { c, jobs };
    });
    byId("jColPick").innerHTML = cols.map(({ c, jobs }) => `<button class="chip ${c === JS.hcol ? "on" : ""}" data-hcol="${esc(c)}">${esc(shortName(c))} (${jobs.length})</button>`).join("");
    byId("jColPick").onclick = (e) => { const b = e.target.closest("[data-hcol]"); if (b) { JS.hcol = b.dataset.hcol; drawList(); } };
    const monthOf = (j) => new Date(j.done_at || j.created_at).toLocaleDateString([], { month: "long", year: "numeric" });
    byId("jBody").innerHTML = `${q ? `<p class="muted small">Showing matches for “${esc(JS.q)}”.</p>` : ""}<div class="job-cols hist">${cols.map(({ c, jobs }) => {
      let last = "";
      const total = jobs.reduce((a, j) => a + Number(j.price || 0), 0);
      return `<div class="job-col hist-col ${c === JS.hcol ? "phone-on" : ""}">
        <div class="col-head"><div><h2>${esc(shortName(c))}</h2><div class="col-sub">${jobs.length} job${jobs.length === 1 ? "" : "s"} · ${money(total)}</div></div></div>
        <div class="col-list">${jobs.length ? jobs.map((j) => { const m = monthOf(j); const head = m !== last ? `<div class="month-head">${esc(m)}</div>` : ""; last = m; return head + histCard(j); }).join("") : `<p class="muted small center">No jobs.</p>`}</div>
      </div>`;
    }).join("")}</div>`;
  }

  // ---------- the count box: what you're holding, before you scroll ----------
  function tallyBox(active) {
    const { esc, money } = J();
    if (!active.length) return "";
    const cash = active.reduce((a, j) => a + Number(j.price || 0), 0);
    const byClient = {};
    active.forEach((j) => { const c = j.client || "No client"; byClient[c] = (byClient[c] || 0) + 1; });
    // Tap a client to see only that client's jobs — no extra tab needed
    const split = Object.entries(byClient).sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `<button class="tally-chip ${JS.client === c ? "on" : ""}" data-client="${esc(c)}">${esc(shortName(c))}<i>${n}</i></button>`).join("");
    const shown = JS.client === "All" ? active : active.filter((j) => (j.client || "No client") === JS.client);
    const today = shown.filter((j) => j.on_today && !waitingPapers(j)).length;
    const ready = shown.filter((j) => !j.on_today && !waitingPapers(j) && !needsAddress(j)).length;
    const waiting = shown.filter(waitingPapers).length;
    const only = JS.client !== "All";
    return `<div class="tally ${only ? "filtered" : ""}">
      <div class="tally-top">
        <span class="tally-big">${only ? shown.length : active.length}<em>${only ? esc(shortName(JS.client)) + " jobs" : "jobs in hand"}</em></span>
        <span class="tally-cash">${money(only ? shown.reduce((a, j) => a + Number(j.price || 0), 0) : cash)}</span>
      </div>
      <div class="tally-split">${split}</div>
      <div class="tally-foot">${only ? `<button class="tally-back" data-client="All">← All ${active.length} jobs</button> · ` : ""}<u>${today}</u> on today's route · <u>${ready}</u> ready to add · <u>${waiting}</u> waiting on papers</div>
    </div>`;
  }

  function drawList() {
    const { esc } = J();
    const q = JS.q.toLowerCase().trim();
    const byCounty = (j) => JS.county === "All" || j.county === JS.county || (!j.county && JS.county !== "All" && needsAddress(j));
    const dueRank = (j) => (j.due_date ? new Date(j.due_date).getTime() : 9e15);
    const sortJobs = (a, b) => (b.service === "Rush") - (a.service === "Rush") || dueRank(a) - dueRank(b);
    const body = byId("jBody");

    if (JS.view === "history") {
      byId("jTally").innerHTML = "";
      drawHistory(q, byCounty);
    } else if (q) {
      // Searching in Working shows one list across everything, including finished jobs
      byId("jTally").innerHTML = "";
      byId("jColPick").innerHTML = "";
      const hits = JS.jobs.filter((j) => byCounty(j) && [j.person, j.job_no, j.address, j.client].join(" ").toLowerCase().includes(q)).sort(sortJobs);
      body.innerHTML = `<p class="muted small">${hits.length} match${hits.length === 1 ? "" : "es"} for “${esc(JS.q)}”</p><div class="search-grid">${hits.map(JS.dense ? jobLine : jobCard).join("") || ""}</div>`;
    } else {
      const byClient = (j) => JS.client === "All" || (j.client || "No client") === JS.client;
      const lists = COLS.map((c) => ({ c, jobs: JS.jobs.filter((j) => byCounty(j) && byClient(j) && c.test(j)).sort(sortJobs) }));
      byId("jTally").innerHTML = tallyBox(JS.jobs.filter((j) => byCounty(j) && j.status === "Active"));
      byId("jTally").querySelectorAll("[data-client]").forEach((b) => b.onclick = () => {
        JS.client = b.dataset.client === JS.client ? "All" : b.dataset.client;
        drawList();
      });
      byId("jColPick").innerHTML = lists.map(({ c, jobs }) => `<button class="chip ${c.id === JS.col ? "on" : ""} ${c.id === "fix" && jobs.length ? "alert-chip" : ""}" data-col="${c.id}">${c.short} <b>${jobs.length}</b></button>`).join("");
      body.innerHTML = `<div class="job-cols six">${lists.map(({ c, jobs }) => `
        <div class="job-col col-${c.id} ${c.id === JS.col ? "phone-on" : ""}">
          <div class="col-head"><div><h2>${c.title}</h2><div class="col-sub">${c.sub}</div></div><span class="col-count">${jobs.length}</span></div>
          ${c.id === "papers" && jobs.length ? `<div class="row-gap thin-row">
            <button class="btn ghost thin grow" data-printlist="papers">🖨 Print this list</button>
            <button class="btn go thin grow" data-allpapers="papers">✓ All printed</button>
          </div>` : ""}
          ${c.id === "jean" && jobs.length ? `<div class="row-gap thin-row">
            <button class="btn ghost thin grow" data-printlist="jean">🖨 List for Jean</button>
            <button class="btn go thin grow" data-pickup="1">✓ Got them from Jean</button>
          </div>` : ""}
          <div class="col-list ${jobs.length > 7 ? "two-up" : ""}">${jobs.length ? jobs.map(JS.dense ? jobLine : jobCard).join("") : `<p class="muted small center">Nothing here.</p>`}</div>
        </div>`).join("")}</div>
        <p class="muted small center">Finished and paid jobs are in <b>History</b> (switch at the top).</p>`;
      byId("jColPick").onclick = (e) => { const b = e.target.closest("[data-col]"); if (b) { JS.col = b.dataset.col; drawList(); } };
    }
    wireCards(body, drawList);
    body.querySelectorAll("[data-open]").forEach((b) => b.onclick = (e) => {
      if (e.target.closest("[data-today]") || e.target.closest("[data-papers]")) return;
      openJob(JS.jobs.find((j) => j.id === b.dataset.open), drawJobs);
    });
    body.querySelectorAll("[data-papers]").forEach((b) => b.onclick = async (e) => {
      e.stopPropagation();
      if (await updateJob(b.dataset.papers, { has_papers: true })) {
        J().toast("Printed ✓ — moved to Ready to route");
        J().refreshBadges && J().refreshBadges();
        drawJobs();
      }
    });
    body.querySelectorAll("[data-printlist]").forEach((b) => b.onclick = () => printPapersList(b.dataset.printlist));
    body.querySelectorAll("[data-allpapers]").forEach((b) => b.onclick = async () => {
      const mine = JS.jobs.filter((j) => waitingPapers(j) && !PAPER_CLIENTS.includes(j.client));
      if (!mine.length) return;
      if (!confirm(`Mark all ${mine.length} as printed?`)) return;
      for (const j of mine) await updateJob(j.id, { has_papers: true });
      J().toast(mine.length + " marked printed ✓");
      J().refreshBadges && J().refreshBadges();
      drawJobs();
    });
    body.querySelectorAll("[data-gotpaper]").forEach((b) => b.onclick = async () => {
      if (await updateJob(b.dataset.gotpaper, { has_papers: true })) { J().toast("Papers in hand ✓ — ready to route"); J().refreshBadges && J().refreshBadges(); drawJobs(); }
    });
    body.querySelectorAll("[data-pickup]").forEach((b) => b.onclick = () => paperPickup());
    body.querySelectorAll("[data-today]").forEach((b) => b.onclick = async () => {
      const j = JS.jobs.find((x) => x.id === b.dataset.today);
      j.on_today = !j.on_today;
      J().refreshBadges && J().refreshBadges(); if (await updateJob(j.id, { on_today: j.on_today, route_order: null })) { drawList(); J().toast(j.on_today ? "Added to today" : "Removed from today"); }
    });
  }

  // ---------- the printing list: what still needs papers run off ----------
  function printPapersList(which) {
    const { esc } = J();
    const jean = which === "jean";
    const list = JS.jobs.filter((j) => waitingPapers(j) && (jean ? PAPER_CLIENTS.includes(j.client) : !PAPER_CLIENTS.includes(j.client)))
      .sort((a, b) => (a.client || "").localeCompare(b.client || "") ||
        (daysLeft(a) ?? 99) - (daysLeft(b) ?? 99));
    if (!list.length) { J().toast(jean ? "Nothing waiting on Jean" : "Nothing waiting to be printed"); return; }
    const d = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    let last = "";
    byId("printSheet").innerHTML = `
      <div class="print-head"><b>${jean ? "Papers to pick up from Jean" : "Papers to print"}</b><span>${esc(d)} · ${list.length} job${list.length === 1 ? "" : "s"}</span></div>
      <table class="lu-print">
        <thead><tr><th class="lup-x">✓</th><th class="lup-c">JOB #</th><th>NAME</th><th>ADDRESS</th><th class="lup-c">CLIENT</th><th class="lup-c">DUE</th></tr></thead>
        <tbody>${list.map((j) => {
          const z = zipOf(j);
          const n = list.filter((x) => zipOf(x) === z).length;
          const head = z !== last ? `<tr><td colspan="6" class="lup-group"><b>ZIP ${esc(z)}</b> — ${n} job${n > 1 ? "s" : ""}</td></tr>` : "";
          last = z;
          const dl = daysLeft(j);
          return head + `<tr>
            <td class="lup-x"></td>
            <td class="lup-c">${esc(j.job_no || "—")}</td>
            <td><b>${esc(j.person || "(no name)")}</b></td>
            <td>${esc(j.address || "")}</td>
            <td class="lup-c">${esc(j.client || "")}</td>
            <td class="lup-c">${j.due_date ? esc(fmtDate(j.due_date)) + (dl != null && dl <= 2 ? " ⚠" : "") : ""}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>`;
    window.print();
  }

  // ---------- weekly pickup: tick what's in the stack from Jean ----------
  function paperPickup() {
    const { esc } = J();
    const back = byId("sheetBack");
    const list = JS.jobs.filter(waitingPapers).sort((a, b) => (a.due_date ? new Date(a.due_date) : 9e15) - (b.due_date ? new Date(b.due_date) : 9e15));
    const picked = new Set();
    const draw = () => {
      back.hidden = false;
      back.innerHTML = `
        <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ppTitle">
          <h2 id="ppTitle">Got papers from Jean</h2>
          <p class="muted small">Tick every job that's in the stack. Anything you don't tick stays on the waiting list.</p>
          <button class="btn ghost thin" id="ppAll">${picked.size === list.length ? "Untick all" : "Tick all " + list.length}</button>
          <div class="pick-list">${list.map((j) => `
            <div class="pick-row ${picked.has(j.id) ? "on" : ""}">
              <input type="checkbox" id="pp_${j.id}" data-pp="${j.id}" ${picked.has(j.id) ? "checked" : ""}>
              <label class="pick-main" for="pp_${j.id}">
                <span class="pick-name">${esc(j.person || "(no name yet)")}${j.job_no ? ` <span class="jobno">#${esc(j.job_no)}</span>` : ""}</span>
                <span class="pick-sub">${esc(j.client)} · ${esc(j.address || "no address yet")}${j.due_date ? ` · <span class="${new Date(j.due_date) - Date.now() < 3 * 864e5 ? "bad" : ""}">due ${esc(fmtDate(j.due_date).slice(0, 5))}</span>` : ""}</span>
              </label>
            </div>`).join("")}</div>
          <div class="sheet-btns">
            <button class="btn ghost" id="ppCancel">Cancel</button>
            <button class="btn go" id="ppDone" ${picked.size ? "" : "disabled"}>Done — ${picked.size} in hand</button>
          </div>
        </div>`;
      back.querySelectorAll("[data-pp]").forEach((c) => c.onchange = () => { c.checked ? picked.add(c.dataset.pp) : picked.delete(c.dataset.pp); draw(); });
      byId("ppAll").onclick = () => { if (picked.size === list.length) picked.clear(); else list.forEach((j) => picked.add(j.id)); draw(); };
      byId("ppCancel").onclick = () => { back.hidden = true; back.innerHTML = ""; };
      byId("ppDone").onclick = async () => {
        const { error } = await J().db.from("jes_jobs").update({ has_papers: true, updated_at: new Date().toISOString() }).in("id", [...picked]);
        if (error) { J().toast("Not saved: " + error.message); return; }
        back.hidden = true; back.innerHTML = "";
        const left = list.length - picked.size;
        J().toast(`${picked.size} ready to route${left ? ` · ${left} still waiting on papers` : ""}`);
        J().refreshBadges && J().refreshBadges();
        drawJobs();
      };
    };
    draw();
  }

  function businessHoursNow() {
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    return (h >= 10 && h < 12) || (h >= 14 && h < 16);
  }

  function fmtDate(iso) {
    const [y, m, d] = String(iso).slice(0, 10).split("-");
    return `${m}/${d}/${y}`;
  }

  // ---------- edit a saved job ----------
  async function openJob(j, after) {
    const { esc } = J();
    const back = byId("sheetBack");
    const opt = (list, v) => list.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("");
    const { data: attempts } = await J().db.from("jes_attempts").select("*").eq("job_id", j.id).order("at", { ascending: true });
    back.hidden = false;
    back.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="jTitle">
        <h2 id="jTitle">${esc(j.person || "Edit job")}</h2>
        <div class="grid2">
          <label>Status<select id="g_status">${opt(["Active", "On Hold", "Served", "Non-Serve Complete"], j.status)}</select></label>
          <label>Standard / Rush<select id="g_service">${opt(["Standard", "Rush"], j.service)}</select></label>
          <label>Client<select id="g_client">${opt(P().CLIENTS, j.client)}</select></label>
          <label>Job #<input id="g_job_no" inputmode="numeric" value="${esc(j.job_no || "")}"></label>
        </div>
        <label>Person to serve<input id="g_person" value="${esc(j.person || "")}"></label>
        <label>Address<textarea id="g_address" rows="2">${esc(j.address || "")}</textarea></label>
        <div class="grid2">
          <label>County<select id="g_county">${opt(["", "Osceola", "Orange", "Other"], j.county || "")}</select></label>
          <label>Due date<input id="g_due_date" type="date" value="${esc(j.due_date || "")}"></label>
          <label>Price<input id="g_price" inputmode="decimal" placeholder="$" value="${j.price ? esc(j.price) : ""}"></label>
          <label>Attempts<input id="g_attempt_count" inputmode="numeric" placeholder="0" value="${j.attempt_count ? esc(j.attempt_count) : ""}"></label>
        </div>
        <label>Notes<textarea id="g_notes" class="notes-box" rows="5">${esc(j.notes || "")}</textarea></label>
        <div class="toggle-list">
          <label class="tgl"><input type="checkbox" id="g_has_papers" ${j.has_papers !== false ? "checked" : ""}><span>📄 I have the papers for this job${PAPER_CLIENTS.includes(j.client) ? " (Jean hands these over)" : " (you print these)"}</span></label>
          <label class="tgl"><input type="checkbox" id="g_is_business" ${j.is_business ? "checked" : ""}><span>🏢 Business — serve 10–12 or 2–4 only</span></label>
          <label class="tgl"><input type="checkbox" id="g_is_foreclosure" ${j.is_foreclosure ? "checked" : ""}><span>📚 Foreclosure — pays per packet</span></label>
          <label class="tgl inset"><span>How many packets?</span><input id="g_packets" inputmode="numeric" value="${j.packets || 1}"></label>
        </div>
        <div class="history">
          <div class="tile-label">Attempt history</div>
          ${(attempts || []).length ? attempts.map((a) => `<div class="hist-line"><b>${esc(a.kind)}</b> · ${esc(new Date(a.at).toLocaleString([], { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }))}${a.note ? " · " + esc(a.note) : ""}</div>`).join("") : `<div class="muted small">No attempts yet.</div>`}
        </div>
        <details><summary>Original pasted text</summary><pre class="raw">${esc(j.raw_text || "(none)")}</pre></details>
        <div class="sheet-btns">
          <button class="btn ghost danger" id="gDelete">Delete</button>
          <button class="btn ghost" id="gCancel">Cancel</button>
          <button class="btn" id="gSave">Save</button>
        </div>
      </div>`;
    const f = (k) => byId("g_" + k);
    const grow = (el) => { el.style.height = "auto"; el.style.height = (el.scrollHeight + 4) + "px"; };
    back.querySelectorAll("textarea").forEach((t) => { grow(t); t.addEventListener("input", () => grow(t)); });
    f("address").onblur = () => {
      f("address").value = P().cleanAddress(f("address").value);
      if (!f("county").value) f("county").value = P().countyFor(f("address").value) || "";
    };
    const close = () => { back.hidden = true; back.innerHTML = ""; };
    byId("gCancel").onclick = close;
    back.onclick = (e) => { if (e.target === back) close(); };
    byId("gDelete").onclick = async () => {
      if (!confirm("Delete this job for good? This can't be undone.")) return;
      const { error } = await J().db.from("jes_jobs").delete().eq("id", j.id);
      if (error) { J().toast("Not deleted: " + error.message); return; }
      close(); J().toast("Job deleted"); after && after();
    };
    byId("gSave").onclick = async () => {
      const patch = {};
      ["status", "service", "client", "job_no", "person", "county", "due_date", "notes", "private_phone", "private_email"].forEach((k) => {
        if (f(k)) patch[k] = f(k).value.trim() || null;
      });
      patch.address = P().cleanAddress(f("address").value) || null;
      if (!patch.county && patch.address) patch.county = P().countyFor(patch.address) || null;
      patch.price = Number(String(f("price").value).replace(/[^0-9.]/g, "")) || 0;
      patch.attempt_count = parseInt(f("attempt_count").value, 10) || 0;
      if (f("has_papers")) { patch.has_papers = f("has_papers").checked; if (!patch.has_papers) patch.on_today = false; }
      patch.is_foreclosure = f("is_foreclosure").checked;
      patch.packets = Math.max(1, parseInt(f("packets").value, 10) || 1);
      patch.is_business = f("is_business").checked;
      if (patch.address !== j.address) { patch.lat = null; patch.lng = null; }
      if ((patch.status === "Served" || patch.status === "Non-Serve Complete") && !j.done_at) { patch.done_at = new Date().toISOString(); patch.on_today = false; }
      if (patch.status === "Active" || patch.status === "On Hold") patch.done_at = null;
      if (patch.status === "On Hold") patch.on_today = false;
      if (await updateJob(j.id, patch)) {
        // remember name -> address for future pastes
        if (patch.person && patch.address && P().hasZip(patch.address)) {
          const { data } = await J().db.from("jes_settings").select("value").eq("key", "known_addresses").maybeSingle();
          const known = (data && data.value) || {};
          known[P().nameKey(patch.person)] = { address: patch.address, county: patch.county };
          await J().db.from("jes_settings").upsert({ key: "known_addresses", value: known });
        }
        close(); J().toast("Saved"); after && after();
      }
    };
  }

  // =====================================================================
  // ROUTE TAB
  // =====================================================================
  const todayKey = () => new Date().toDateString();
  const RS = {
    county: localStorage.getItem("jes_route_county") || "Osceola",
    start: localStorage.getItem("jes_route_start") || "here",
    started: false, here: null, watchId: null, dismissed: new Set(),
    map: null, stops: [], all: [], open: null, vague: 0,
    miles: Number(localStorage.getItem("jes_route_miles") || 0),
    lastPt: JSON.parse(localStorage.getItem("jes_route_lastpt") || "null")
  };
  RS.started = localStorage.getItem("jes_route_started") === todayKey() + "|" + RS.county;
  function getHere() {
    return new Promise((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 20000 });
    });
  }
  function stopWatch() { if (RS.watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(RS.watchId); RS.watchId = null; }
  function startWatch() {
    stopWatch();
    if (!navigator.geolocation) return;
    RS.watchId = navigator.geolocation.watchPosition((p) => {
      if (!byId("rMap")) { stopWatch(); return; }          // left the Route screen
      RS.here = { lat: p.coords.latitude, lng: p.coords.longitude };
      checkNearby();
    }, () => {}, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
  }
  // "You're passing one of your stops" — within about a quarter mile, and closer than your next stop
  function checkNearby() {
    const box = byId("rNear"); if (!box || !RS.here || RS.stops.length < 2) return;
    const next = RS.stops[0];
    const dNext = next.lat != null ? miles(RS.here, next) : Infinity;
    let best = null;
    RS.stops.slice(1).forEach((j, k) => {
      if (j.lat == null || RS.dismissed.has(j.id)) return;
      const d = miles(RS.here, j);
      if (d <= 0.3 && d < dNext && (!best || d < best.d)) best = { j, d, n: k + 2 };
    });
    if (!best) { box.innerHTML = ""; return; }
    const { esc } = J();
    box.innerHTML = `<div class="near-alert" role="alert">
      <div><b>You're ${best.d.toFixed(1)} mi from Stop ${best.n}</b><br>${esc(best.j.person || "")} ${esc(best.j.address)}</div>
      <div class="row-gap"><button class="btn go thin" id="nearGo">Go there now</button><button class="btn ghost thin" id="nearNo">Not now</button></div>
    </div>`;
    byId("nearGo").onclick = async () => {
      RS.stops = [best.j].concat(RS.stops.filter((x) => x.id !== best.j.id));
      box.innerHTML = ""; drawStops(); drawMap(); await saveOrder();
      J().toast(`Stop ${best.n} is now your next stop`);
    };
    byId("nearNo").onclick = () => { RS.dismissed.add(best.j.id); box.innerHTML = ""; };
  }

  const HOME_FALLBACK = { lat: 28.2489, lng: -81.2812 }; // St. Cloud, FL
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Tries the full address, then short forms (S, Pkwy…), then the street, then the ZIP.
  const ABBR = [[/\bSouth\b/gi, "S"], [/\bNorth\b/gi, "N"], [/\bEast\b/gi, "E"], [/\bWest\b/gi, "W"],
    [/\bParkway\b/gi, "Pkwy"], [/\bBoulevard\b/gi, "Blvd"], [/\bHighway\b/gi, "Hwy"], [/\bAvenue\b/gi, "Ave"],
    [/\bStreet\b/gi, "St"], [/\bDrive\b/gi, "Dr"], [/\bRoad\b/gi, "Rd"], [/\bLane\b/gi, "Ln"], [/\bCourt\b/gi, "Ct"],
    [/\bCircle\b/gi, "Cir"], [/\bTrail\b/gi, "Trl"], [/\bPlace\b/gi, "Pl"]];
  async function lookup(q) {
    try {
      const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=" + encodeURIComponent(q), { headers: { "Accept": "application/json" } });
      const d = await r.json();
      if (d && d[0]) return { lat: Number(d[0].lat), lng: Number(d[0].lon) };
    } catch (e) {}
    return null;
  }
  async function geocode(address) {
    const base = address.replace(/,?\s*(apt|unit|ste|suite|lot|bldg|#)\s*[\w-]+/ig, "").replace(/-\d{4}\b/, "");
    let abbr = base; ABBR.forEach(([re, to]) => { abbr = abbr.replace(re, to); });
    const noNum = base.replace(/^\d+[A-Za-z]?\s+/, "");
    const zip = (base.match(/\bFL\s*(\d{5})/i) || [])[1];
    const tries = [base, abbr, noNum];
    for (let i = 0; i < tries.length; i++) {
      if (i && tries[i] === tries[i - 1]) continue;
      const pt = await lookup(tries[i]);
      if (pt) { pt.approx = i === 2; return pt; }
      await sleep(1100);
    }
    if (zip) { const pt = await lookup(zip + ", FL"); if (pt) { pt.approx = true; return pt; } }
    return null;
  }
  async function homePoint() {
    if (RS.start === "here") {
      const here = await getHere();
      if (here) { RS.here = here; return here; }
      J().toast("Couldn't get your location — starting from home. Check that Location is allowed for Safari.");
    }
    try { const c = JSON.parse(localStorage.getItem("jes_home_ll") || "null"); if (c) return c; } catch (e) {}
    const { data } = await J().db.from("jes_settings").select("value").eq("key", "home_address").maybeSingle();
    const pt = (data && data.value && await geocode(String(data.value))) || HOME_FALLBACK;
    try { localStorage.setItem("jes_home_ll", JSON.stringify(pt)); } catch (e) {}
    return pt;
  }
  function miles(a, b) {
    const R = 3958.8, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  // Straight-line is always shorter than the road. In a suburban grid the road
  // runs roughly a third further, so banking the crow-flies number under-claims
  // the deduction every single day. Ordering still uses the raw number.
  const ROAD = 1.3;
  const roadMiles = (a, b) => miles(a, b) * ROAD;
  // The server's date is UTC, so an 8pm serve would file under tomorrow.
  // Evening routes are normal here, so the day comes off this device's clock.
  function localDay(d) {
    d = d || new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // Write today's miles to the books now, not at the end of the day. The whole
  // running total is written each time, so a reload can't double-count it.
  async function bankMiles() {
    if (!(RS.miles > 0.2)) return;
    const day = localDay();
    const done = RS.all.filter((j) => j.done_at && localDay(new Date(j.done_at)) === day).length;
    try {
      const rateRow = await J().db.from("jes_settings").select("value").eq("key", "mileage_rate").maybeSingle();
      const rate = rateRow.data ? Number(rateRow.data.value) : 0.7;
      const found = await J().db.from("jes_expenses").select("id,miles").eq("kind", "Miles").eq("day", day).maybeSingle();
      // If the day was started on the other device, keep whichever total is larger
      const total = Number(Math.max(RS.miles, Number((found.data && found.data.miles) || 0)).toFixed(1));
      const row = {
        kind: "Miles", day, miles: total, amount: Number((total * rate).toFixed(2)),
        county: RS.county, stops: done, note: `Route — ${RS.county}, ${done} stop${done === 1 ? "" : "s"}`
      };
      if (found.data) await J().db.from("jes_expenses").update(row).eq("id", found.data.id);
      else await J().db.from("jes_expenses").insert(row);
    } catch (e) { /* miles are never worth losing a serve over */ }
  }
  // nearest-next from the start, then a quick clean-up pass to remove zig-zags
  function bestOrder(start, pts) {
    const left = pts.slice(), out = [];
    let cur = start;
    while (left.length) {
      let bi = 0, bd = Infinity;
      left.forEach((p, i) => { const d = miles(cur, p); if (d < bd) { bd = d; bi = i; } });
      cur = left.splice(bi, 1)[0]; out.push(cur);
    }
    const len = (arr) => arr.reduce((s, p, i) => s + miles(i ? arr[i - 1] : start, p), 0);
    let improved = true, route = out;
    while (improved) {
      improved = false;
      for (let i = 0; i < route.length - 1; i++) {
        for (let k = i + 1; k < route.length; k++) {
          const cand = route.slice(0, i).concat(route.slice(i, k + 1).reverse(), route.slice(k + 1));
          if (len(cand) + 0.01 < len(route)) { route = cand; improved = true; }
        }
      }
    }
    return route;
  }

  async function drawRoute() {
    const { esc } = J();
    if (RS.map) { RS.map.remove(); RS.map = null; }
    stopWatch();
    RS.started = localStorage.getItem("jes_route_started") === todayKey() + "|" + RS.county;
    byId("screen").innerHTML = `
      <section class="route">
        <div class="route-head">
          <h1>Today's Route</h1>
          <div class="seg" id="rCounty">${["Osceola", "Orange"].map((c) => `<button class="${c === RS.county ? "on" : ""}" data-c="${c}">${c}</button>`).join("")}</div>
        </div>
        <div id="rZips"></div>
        <div id="rMsg"></div>
        ${RS.started ? `<div class="route-live">● Route in progress — stops re-sort from where you are after each one</div>` : ""}
        <div id="rNear" class="near-wrap"></div>
        <div id="rDid"></div>
        <div class="route-grid">
          <div class="route-mapcol">
            <div id="rMap" class="map" role="img" aria-label="Map of today's stops"></div>
            <div class="start-from">
              <span class="sf-label">Start from</span>
              <div class="seg" id="rStart">${[["here", "📍 Where I am now"], ["home", "🏠 Home"]].map(([v, t]) => `<button class="${v === RS.start ? "on" : ""}" data-s="${v}">${t}</button>`).join("")}</div>
            </div>
            <div class="route-tools">
              ${RS.started
                ? `<button class="btn ghost" id="rEnd">■ End route</button>`
                : `<button class="btn go" id="rGo">▶ Start route</button>`}
              <button class="btn ghost" id="rBest">Re-sort (save gas)</button>
              <button class="btn ghost" id="rLine">📋 Lineup</button>
              <button class="btn ghost" id="rPrint">Print</button>
              <button class="btn ghost" id="rWhere">📍 Where am I</button>
              <button class="btn ghost" id="rPins">Find missing pins</button>
            </div>
            <p class="map-count" id="rMapCount"></p>

          </div>
          <div class="route-listcol">
            <div id="rStops" class="stops"><p class="muted">Loading…</p></div>
            <details class="add-more" id="rAdd"><summary>Add more stops in ${esc(RS.county)}</summary><div id="rAddList"></div></details>
          </div>
        </div>
        <div id="printSheet" class="print-only"></div>
      </section>
      <div class="sheet-back" id="sheetBack" hidden></div>`;
    byId("rCounty").onclick = (e) => {
      const b = e.target.closest("[data-c]"); if (!b) return;
      RS.county = b.dataset.c; localStorage.setItem("jes_route_county", RS.county); drawRoute();
    };
    byId("rStart").onclick = (e) => { const b = e.target.closest("[data-s]"); if (!b) return; RS.start = b.dataset.s; localStorage.setItem("jes_route_start", RS.start); byId("rStart").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); };
    byId("rBest").onclick = () => optimize();
    byId("rPins").onclick = () => findMissingPins();
    byId("rWhere").onclick = async () => {
      J().toast("Finding you…");
      const here = await getHere();
      if (!here) { J().toast("Couldn't get your location — check Settings → Safari → Location"); return; }
      RS.here = here; drawMap(); J().toast("You're on the map ✓");
    };
    if (byId("rGo")) byId("rGo").onclick = startRoute;
    if (byId("rEnd")) byId("rEnd").onclick = endRoute;
    byId("rPrint").onclick = printRoute;
    byId("rLine").onclick = drawLineup;
    await loadStops();
    if (RS.started) startWatch();
  }

  async function startRoute() {
    if (!RS.stops.length) { J().toast("No stops on today's route yet"); return; }
    const b = byId("rGo"); if (b) { b.disabled = true; b.textContent = "Finding you…"; }
    localStorage.setItem("jes_route_started", todayKey() + "|" + RS.county);
    RS.dismissed = new Set();
    await optimize({ quiet: true });
    J().toast(RS.start === "here" && RS.here ? "Route started from where you are ✓" : "Route started from home ✓");
    drawRoute();
  }
  async function endRoute() {
    if (!confirm("End today's route? Stops you haven't done stay on today's list.")) return;

    // The stops were banked as they happened. All that's left is the drive home.
    if (RS.lastPt) { const home = await homePoint(); if (home) RS.miles += roadMiles(RS.lastPt, home); }
    if (RS.miles > 0.2) {
      await bankMiles();
      J().toast(`${RS.miles.toFixed(1)} miles banked for today · tax deduction saved`);
    }
    RS.miles = 0; RS.lastPt = null;
    localStorage.removeItem("jes_route_miles");
    localStorage.removeItem("jes_route_lastpt");
    localStorage.removeItem("jes_route_started");
    stopWatch();

    const waiting = RS.all.filter((j) => j.in_attempts).length;
    if (waiting && confirm(`${waiting} job${waiting > 1 ? "s are" : " is"} in the Attempts folder. Pick what to retry tomorrow now?`)) {
      J().go("attempts"); return;
    }
    drawRoute();
  }

  // Pull one stop to the front of the run, from the list or from the rush bar.
  async function toTop(id) {
    const i = RS.stops.findIndex((s) => s.id === id);
    if (i <= 0) return;
    const [j] = RS.stops.splice(i, 1);
    RS.stops.unshift(j);
    await saveOrder();
    drawStops(); drawMap(); drawZipLedger();
    J().toast((j.person || "That stop") + " is next");
  }

  // ---------- how many stops sit in each ZIP, to check against the paper stacks ----------
  function drawZipLedger() {
    const box = byId("rZips");
    if (!box) return;
    const { esc, money } = J();
    if (!RS.stops.length) { box.innerHTML = ""; return; }
    const zip = (j) => ((j.address || "").match(/\b(\d{5})(?:-\d{4})?\b/) || [])[1] || "no ZIP";
    const town = (j) => { const p = (j.address || "").split(","); return (p[p.length - 2] || "").trim(); };
    const g = {};
    RS.stops.forEach((j) => {
      const z = zip(j);
      if (!g[z]) g[z] = { n: 0, cash: 0, town: town(j) };
      g[z].n++; g[z].cash += Number(j.price || 0);
    });
    const rows = Object.entries(g).sort((a, b) => b[1].n - a[1].n)
      .map(([z, d]) => `<div class="zrow"><b>${esc(z)}</b><span>${esc(d.town)}</span><u>${d.n} stop${d.n > 1 ? "s" : ""}</u></div>`).join("");
    const cash = RS.stops.reduce((a, j) => a + Number(j.price || 0), 0);
    box.innerHTML = `<div class="zips">
      <h4>Stops by ZIP</h4>${rows}
      <div class="ztot"><b>${RS.stops.length} stop${RS.stops.length > 1 ? "s" : ""}</b><u>${money(cash)}</u></div>
    </div>`;
  }

  async function loadStops() {
    RS.all = await fetchJobs();
    // A job with no county used to match NEITHER county and vanish off the route
    // with no message. Now it shows up wherever you are until you set it.
    const sameCounty = (j) => j.county === RS.county || !j.county;
    const waitingToday = RS.all.filter((j) => j.on_today && waitingPapers(j) && sameCounty(j)).length;
    const today = RS.all.filter((j) => j.on_today && j.status === "Active" && !waitingPapers(j));
    const inCounty = today.filter(sameCounty);
    const noCounty = inCounty.filter((j) => !j.county);
    const noAddr = inCounty.filter(needsAddress);
    RS.stops = inCounty.filter((j) => !needsAddress(j))
      // Gas order rules the route. Deadlines show up in red instead of
      // jumping the line — you'll drive the whole route today anyway.
      .sort((a, b) => (a.route_order ?? 999) - (b.route_order ?? 999) || rank(a) - rank(b));
    const otherCounty = today.filter((j) => j.county && j.county !== RS.county).length;

    const msgs = [];
    const noPin = RS.stops.filter((j) => j.lat == null).length;
    if (noCounty.length) msgs.push(`${noCounty.length} of today's stops ${noCounty.length > 1 ? "have" : "has"} no county set, so ${noCounty.length > 1 ? "they show" : "it shows"} on both routes: ${noCounty.map((j) => j.person || (j.address || "").split(",")[0] || "no name").join(", ")}. Open ${noCounty.length > 1 ? "them" : "it"} and set the county.`);
    if (noPin) msgs.push(`${noPin} stop${noPin > 1 ? "s have" : " has"} no map pin — open it and check the address.`);
    if (noAddr.length) msgs.push(`${noAddr.length} of today's jobs in ${RS.county} ${noAddr.length > 1 ? "are" : "is"} missing an address — fix in Jobs → Needs address.`);
    if (waitingToday) msgs.push(`${waitingToday} job${waitingToday > 1 ? "s are" : " is"} still waiting on papers from Jean, so ${waitingToday > 1 ? "they're" : "it's"} left off the route.`);
    if (otherCounty) msgs.push(`${otherCounty} of today's jobs ${otherCounty > 1 ? "are" : "is"} in the other county and not shown here.`);
    byId("rMsg").innerHTML = msgs.map((m) => `<div class="alert soft">${J().esc(m)}</div>`).join("");
    await numberPapers(false);     // anything added since keeps a number of its own
    drawZipLedger();

    // A rush can come from anybody, Jean included. Say where it sits in the run.
    const rushes = RS.stops.map((j, i) => ({ j, n: stopNo(j, i) })).filter(({ j }) => j.service === "Rush");
    if (rushes.length) {
      const lines = rushes.map(({ j, n }) => `<span class="rush-line"><b>${J().esc(j.person || (j.address || "").split(",")[0] || "a stop")}</b>
        is <b>paper #${n}</b> — ${J().esc(j.address || "no address")}
        ${n > 1 ? `<button class="rush-jump" data-rushtop="${j.id}">Move it to stop 1</button>` : `<em>already first</em>`}</span>`).join("");
      byId("rMsg").insertAdjacentHTML("afterbegin",
        `<div class="alert rush-warn"><b>⚡ ${rushes.length} rush ${rushes.length > 1 ? "jobs" : "job"} today</b>${lines}</div>`);
      byId("rMsg").querySelectorAll("[data-rushtop]").forEach((b) => b.onclick = () => toTop(b.dataset.rushtop));
    }

    // The gas order stands, but if a last-chance job sits late in the run and
    // you don't finish, that's the one you lose. Say so.
    const risky = RS.stops
      .map((j, i) => ({ j, n: stopNo(j, i) }))
      .filter(({ j, n }) => { const d = daysLeft(j); return d != null && d <= 0 && n > Math.ceil(RS.stops.length / 2); });
    if (risky.length) {
      const names = risky.map(({ j, n }) => `#${n} ${J().esc(j.person || "a stop")}`).join(", ");
      byId("rMsg").insertAdjacentHTML("afterbegin",
        `<div class="alert late-warn">${names} ${risky.length > 1 ? "are" : "is"} due today and ${risky.length > 1 ? "sit" : "sits"} late in the run.
         If there's any chance you don't finish, do ${risky.length > 1 ? "those" : "that one"} first.</div>`);
    }

    // look up map points once (saved so it never has to look again)
    const missing = RS.stops.filter((j) => j.lat == null);
    for (let i = 0; i < missing.length; i++) {
      byId("rMsg").insertAdjacentHTML("afterbegin", `<div class="alert soft" id="geoMsg">Finding ${missing.length - i} address${missing.length - i > 1 ? "es" : ""} on the map…</div>`);
      const pt = await geocode(missing[i].address);
      const gm = byId("geoMsg"); if (gm) gm.remove();
      if (pt) { missing[i].lat = pt.lat; missing[i].lng = pt.lng; missing[i].geoApprox = pt.approx; await updateJob(missing[i].id, { lat: pt.lat, lng: pt.lng }); }
      else missing[i].geoFail = true;
      if (i < missing.length - 1) await sleep(1100);
    }
    drawStops();
    drawMap();
    drawAddMore();
  }

  function drawMap() {
    if (!window.L) { byId("rMap").innerHTML = `<p class="muted center">Map couldn't load. The list still works.</p>`; return; }
    if (RS.map) { RS.map.remove(); RS.map = null; }
    const map = L.map("rMap", { zoomControl: true, attributionControl: true });
    RS.map = map;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, className: "soft-tiles",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    // Several stops landing on ONE point means the lookup gave up on the street
    // and dropped them in the middle of the ZIP. They used to hide under each
    // other and look like a single correct pin. Now they fan out and say so.
    const tally = {};
    RS.stops.forEach((j) => {
      if (j.lat == null) return;
      const k = j.lat.toFixed(4) + "," + j.lng.toFixed(4);
      tally[k] = (tally[k] || 0) + 1;
    });
    const pts = [];
    const seen = {};
    let vague = 0;
    RS.stops.forEach((j, i) => {
      if (j.lat == null) return;
      const key = j.lat.toFixed(4) + "," + j.lng.toFixed(4);
      const stacked = tally[key] > 1;
      if (stacked) vague++;
      const n = (seen[key] = (seen[key] || 0) + 1);
      let lat = j.lat, lng = j.lng;
      if (stacked) {
        // spread them in a visible ring, about a third of a mile across
        const a = (n - 1) * (2 * Math.PI / tally[key]);
        lat += 0.0035 * Math.cos(a);
        lng += 0.0040 * Math.sin(a);
      }
      const icon = L.divIcon({
        className: "pin" + (stacked ? " vague" : ""),
        html: `<span>${stopNo(j, i)}</span>`, iconSize: [34, 34], iconAnchor: [17, 17]
      });
      L.marker([lat, lng], { icon }).addTo(map)
        .bindPopup(`<b>${stopNo(j, i)}. ${J().esc(j.person || "")}</b><br>${J().esc(j.address)}`
          + (stacked ? `<br><b style="color:#9B3B2F">Rough spot only — this pin is the middle of the ZIP, not the door.</b>` : ""));
      pts.push([lat, lng]);
    });
    RS.vague = vague;
    if (pts.length > 1) L.polyline(pts, { color: "#1F2A44", weight: 3, dashArray: "6 6" }).addTo(map);

    // "You are here" — your own dot, so you can see the run from where you stand
    const all = pts.slice();
    if (RS.here) {
      const youIcon = L.divIcon({ className: "pin you", html: `<span>YOU</span>`, iconSize: [40, 40], iconAnchor: [20, 20] });
      L.marker([RS.here.lat, RS.here.lng], { icon: youIcon, zIndexOffset: 1000 })
        .addTo(map).bindPopup("<b>You are here</b>");
      all.push([RS.here.lat, RS.here.lng]);
    }
    if (all.length) map.fitBounds(all, { padding: [40, 40], maxZoom: 15 });
    else map.setView([HOME_FALLBACK.lat, HOME_FALLBACK.lng], 11);
    setTimeout(() => map.invalidateSize(), 200);

    // Say plainly how many stops actually made it onto the map
    const tag = byId("rMapCount");
    if (tag) {
      const off = RS.stops.length - pts.length;
      const bits = [];
      if (off) bits.push(`<b class="bad">${off} of your ${RS.stops.length} stops ${off === 1 ? "isn't" : "aren't"} on the map</b> — tap <b>Find missing pins</b>.`);
      if (RS.vague) bits.push(`<b class="bad">${RS.vague} pin${RS.vague === 1 ? " is" : "s are"} a rough guess</b> — the lookup couldn't find the street and used the middle of the ZIP instead. Those are the hollow pins. Don't trust them to navigate, and don't trust the drive order around them.`);
      if (!bits.length) bits.push(`All ${RS.stops.length} stops are on the map, each at its own address.`);
      tag.innerHTML = bits.join(" ");
    }
  }

  // Look up only the stops that still have no pin, and say what happened
  async function findMissingPins() {
    const missing = RS.stops.filter((j) => j.lat == null);
    if (!missing.length) { J().toast("Every stop is already on the map"); return; }
    let found = 0;
    for (let i = 0; i < missing.length; i++) {
      const tag = byId("rMapCount");
      if (tag) tag.innerHTML = `Looking up ${i + 1} of ${missing.length}…`;
      const pt = await geocode(missing[i].address);
      if (pt) {
        found++;
        missing[i].lat = pt.lat; missing[i].lng = pt.lng; missing[i].geoApprox = pt.approx;
        await updateJob(missing[i].id, { lat: pt.lat, lng: pt.lng });
      } else missing[i].geoFail = true;
      if (i < missing.length - 1) await sleep(1100);
    }
    drawMap(); drawStops();
    J().toast(found ? `${found} more stop${found === 1 ? "" : "s"} on the map` : "Couldn't place those — check the addresses");
  }

  function drawStops() {
    const { esc } = J();
    const box = byId("rStops");
    if (!RS.stops.length) {
      box.innerHTML = `<div class="card center"><b>No stops for ${esc(RS.county)} today.</b><p class="muted">Tap "+ Today" on jobs in the Jobs tab, or use "Add more stops" below.</p></div>`;
      return;
    }
    // Whichever stop is open shows the Served buttons. It's the next one up by
    // default, but tapping any card opens it — for when you cut the line.
    if (RS.open && !RS.stops.some((s) => s.id === RS.open)) RS.open = null;
    box.innerHTML = RS.stops.map((j, i) => {
      const first = RS.open ? j.id === RS.open : i === 0;
      const no = stopNo(j, i);
      const moved = no !== i + 1;
      return `
      <div class="stop ${first ? "current" : ""} ${dueClass(j)}">
        <div class="stop-top ${first ? "" : "tap-open"}" ${first ? "" : `data-open-stop="${j.id}"`} ${first ? "" : 'role="button" tabindex="0"'}>
          <span class="stop-num">${no}</span>
          <div class="draft-text">
            <div class="draft-name">${esc(j.person || "(no name yet)")}${j.job_no ? ` <span class="jobno">#${esc(j.job_no)}</span>` : ""} ${j.service === "Rush" ? `<span class="rush">Rush</span>` : ""}</div>
            <div class="draft-addr">${esc(j.address)}</div>
            ${first ? `<div class="next-label">${RS.open && i !== 0 ? "OPEN NOW" : RS.started ? "NEXT STOP" : "FIRST STOP"} · paper #${no}${moved ? ` · ${i + 1}${i === 0 ? "st" : i === 1 ? "nd" : i === 2 ? "rd" : "th"} in the drive` : ` of ${RS.stops.length}`}</div>`
              : `<div class="tap-hint">Tap to open this one</div>`}
            ${flagChips(j) ? `<div class="chip-row">${flagChips(j)}</div>` : ""}
            ${j.is_business && !businessHoursNow() ? `<div class="biz-warn">🏢 Registered agent hours are 10–12 and 2–4 — it's outside those hours now</div>` : ""}
            ${j.is_foreclosure && (j.packets || 1) > 1 ? `<div class="pk-warn">📚 TAKE ${j.packets} PACKETS to this door — all ${j.packets} get served here · ${J().money(j.price || 0)}</div>` : ""}
            <div class="draft-later">${esc(j.client || "")} · Attempt ${(j.attempt_count || 0) + 1} of 5${j.lat == null ? ` · <b class="bad">📍 No map pin — check address</b>` : j.geoApprox ? ` · <b class="bad">Pin is approximate</b>` : ""}</div>
          </div>
          <div class="move">
            <button class="icon-btn top-btn" data-top="${i}" aria-label="Drive to paper #${no} next" ${i === 0 ? "disabled" : ""}>⇧ 1st</button>
            <button class="icon-btn" data-up="${i}" aria-label="Move paper #${no} up the drive" ${i === 0 ? "disabled" : ""}>▲</button>
            <button class="icon-btn" data-down="${i}" aria-label="Move paper #${no} down the drive" ${i === RS.stops.length - 1 ? "disabled" : ""}>▼</button>
          </div>
        </div>
        ${first ? `
        <div class="stop-actions">
          <div class="row-gap">
            <a class="btn ghost grow" href="https://maps.apple.com/?daddr=${encodeURIComponent(j.address)}&dirflg=d" target="_blank" rel="noopener">Navigate (Apple Maps)</a>
            <button class="btn ghost" data-edit="${j.id}">Edit</button>
          </div>
          <label class="sr" for="rNote">Note for this stop</label>
          <input id="rNote" class="note-in" placeholder="Quick note (optional): no answer, car in driveway…">
          <button class="btn go big" data-act="Served" data-id="${j.id}">Served</button>
          <div class="row-gap">
            <button class="btn ghost gold grow" data-act="Attempt" data-id="${j.id}">Attempted</button>
            <button class="btn grow" data-act="Non-Serve" data-id="${j.id}">Non-Served</button>
          </div>
        </div>` : `
        <div class="row-gap small-actions">
          <a class="btn ghost thin grow" href="https://maps.apple.com/?daddr=${encodeURIComponent(j.address)}&dirflg=d" target="_blank" rel="noopener">Apple Maps</a>
          <button class="btn ghost thin" data-edit="${j.id}">Edit</button>
        </div>`}
      </div>`;
    }).join("");
    box.querySelectorAll("[data-open-stop]").forEach((el) => {
      const open = () => { RS.open = el.dataset.openStop; drawStops(); };
      el.onclick = (e) => { if (e.target.closest(".move")) return; open(); };
      el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    });
    box.querySelectorAll("[data-top]").forEach((b) => b.onclick = () => toTop(RS.stops[Number(b.dataset.top)] && RS.stops[Number(b.dataset.top)].id));
    box.querySelectorAll("[data-up]").forEach((b) => b.onclick = () => move(Number(b.dataset.up), -1));
    box.querySelectorAll("[data-down]").forEach((b) => b.onclick = () => move(Number(b.dataset.down), 1));
    box.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => openJob(RS.stops.find((j) => j.id === b.dataset.edit), drawRoute));
    box.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => act(b.dataset.act, RS.stops.find((j) => j.id === b.dataset.id)));
  }

  async function saveOrder() {
    await Promise.all(RS.stops.map((j, i) => (j.route_order = i, updateJob(j.id, { route_order: i }))));
  }

  // ---------- the number you write on the papers ----------
  // Serving a stop used to shuffle every number below it, so by mid-afternoon
  // the stack in the car no longer matched the screen. The number is set once,
  // when you build the route, and left alone until you renumber on purpose.
  const stopNo = (j, i) => j.lineup_no || i + 1;
  function nextFreeNo() {
    const used = RS.stops.map((j) => j.lineup_no).filter((n) => n != null);
    return (used.length ? Math.max.apply(null, used) : 0) + 1;
  }
  // all = true renumbers the whole run 1..n (a fresh set of sticky notes).
  // all = false only numbers stops that don't have one yet.
  async function numberPapers(all) {
    const jobs = [];
    RS.stops.forEach((j, i) => {
      if (!all && j.lineup_no) return;
      j.lineup_no = all ? i + 1 : nextFreeNo();
      jobs.push(updateJob(j.id, { lineup_no: j.lineup_no }));
    });
    if (jobs.length) await Promise.all(jobs);
  }

  async function move(i, dir) {
    const k = i + dir;
    [RS.stops[i], RS.stops[k]] = [RS.stops[k], RS.stops[i]];
    drawStops(); drawMap(); await saveOrder();
  }
  async function optimize(opts) {
    const quiet = opts && opts.quiet;
    const withPts = RS.stops.filter((j) => j.lat != null);
    if (withPts.length < 2) { if (!quiet) J().toast("Need at least 2 stops on the map"); if (RS.start === "here") RS.here = await getHere(); return; }
    const start = await homePoint();
    const ordered = bestOrder(start, withPts);
    RS.stops = ordered.concat(RS.stops.filter((j) => j.lat == null));
    await saveOrder();
    await numberPapers(true);      // fresh run = a fresh set of sticky notes
    drawStops(); drawMap();
    const total = RS.stops.filter((j) => j.lat != null).reduce((s, p, i, arr) => s + roadMiles(i ? arr[i - 1] : start, p), 0);
    if (!quiet) J().toast(`Order set · 1 to ${RS.stops.length} on your papers · about ${total.toFixed(1)} miles of driving`);
  }

  // Why a non-serve happened — one tap, because you'll have forgotten by tonight
  function askReason() {
    return new Promise((resolve) => {
      const reasons = ["Does not live there", "Moved", "Vacant", "Bad address", "Refused / wrong person"];
      const back = byId("sheetBack") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "sheetBack", className: "sheet-back" }));
      back.hidden = false;
      back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="nsT">
        <h2 id="nsT">Why couldn't it be served?</h2>
        <p class="muted">This is what goes in their app. It pays the same either way.</p>
        <div class="reasons">${reasons.map((r) => `<button class="pick wide" data-r="${J().esc(r)}">${J().esc(r)}</button>`).join("")}</div>
        <div class="sheet-btns"><button class="btn ghost" id="nsCancel">Go back</button></div>
      </div>`;
      const close = (v) => { back.hidden = true; back.innerHTML = ""; resolve(v); };
      back.querySelectorAll("[data-r]").forEach((b) => b.onclick = () => close(b.getAttribute("data-r")));
      byId("nsCancel").onclick = () => close(null);
    });
  }

  async function act(kind, j) {
    const note = (byId("rNote") && byId("rNote").value.trim()) || "";
    const before = { status: j.status, attempt_count: j.attempt_count || 0, done_at: j.done_at,
      on_today: true, in_attempts: !!j.in_attempts, sheet_id: j.sheet_id || null, outcome: j.outcome || null, ns_reason: j.ns_reason || null };
    const patch = { on_today: false, route_order: null };
    let landed = null;

    if (kind === "Attempt") {
      // Out of today's route, into the Attempts folder. No popups, no 5-attempt rule.
      patch.attempt_count = (j.attempt_count || 0) + 1;
      patch.in_attempts = true;
      patch.last_attempt_at = new Date().toISOString();
    } else {
      // Served AND Non-Served both pay in full and both go straight onto the sheet.
      let reason = null;
      if (kind !== "Served") {
        reason = await askReason();
        if (!reason) return;
        patch.ns_reason = reason;
      }
      const sheet = window.JES_OFFICE && await window.JES_OFFICE.sheetFor(j.client);
      if (!sheet) { J().toast("Couldn't open the " + (j.client || "client") + " sheet — nothing was changed."); return; }
      patch.sheet_id = sheet.id;
      patch.outcome = kind === "Served" ? "Served" : "Non-Serve";
      patch.status = kind === "Served" ? "Served" : "Non-Serve Complete";
      patch.done_at = new Date().toISOString();
      patch.in_attempts = false;
      landed = sheet;
    }

    if (!(await updateJob(j.id, patch))) return;

    // Bank the miles as you go — saved to the books at every stop, so closing
    // the app or forgetting to tap End route can't lose the day.
    if (j.lat != null) {
      const from = RS.lastPt || await homePoint();
      if (from) RS.miles += roadMiles(from, j);
      RS.lastPt = { lat: j.lat, lng: j.lng };
      localStorage.setItem("jes_route_miles", String(RS.miles));
      localStorage.setItem("jes_route_lastpt", JSON.stringify(RS.lastPt));
      await bankMiles();
    }

    await logAttempt(j, kind === "Attempt" ? "Attempt" : kind === "Served" ? "Served" : "Non-Serve", note);
    if (landed) landed = await window.JES_OFFICE.sheetTotal(landed.id);
    RS.lastAction = { job: j, kind, sheet: landed, before };
    RS.stops = RS.stops.filter((x) => x.id !== j.id);
    if (RS.started && RS.stops.filter((x) => x.lat != null).length > 1) {
      const here = RS.here || await getHere() || (j.lat != null ? { lat: j.lat, lng: j.lng } : null);
      if (here) {
        const ordered = bestOrder(here, RS.stops.filter((x) => x.lat != null));
        RS.stops = ordered.concat(RS.stops.filter((x) => x.lat == null));
      }
    }
    await saveOrder();
    drawStops(); drawMap(); drawAddMore();
    checkNearby();
    J().refreshBadges && J().refreshBadges(); showDid();
  }

  // Big confirmation so a stop never just vanishes on you
  function showDid() {
    const box = byId("rDid"); if (!box || !RS.lastAction) return;
    const { esc } = J();
    const { job, kind, sheet } = RS.lastAction;
    const word = kind === "Served" ? "SERVED ✓" : kind === "Attempt" ? "ATTEMPT LOGGED" : "NON-SERVED ✓";
    const left = RS.stops.length;
    const paid = sheet
      ? `<div class="did-sheet">Added to the <b>${esc(job.client || "")}</b> sheet · ${J().money(job.price || 0)}<br>
           <span class="small">Sheet total now ${J().money(sheet.total)} · ${sheet.count} job${sheet.count === 1 ? "" : "s"}</span></div>`
      : kind === "Attempt"
        ? `<div class="did-sheet">Attempt ${(job.attempt_count || 0) + 1} · moved to the <b>Attempts</b> folder<br>
             <span class="small">Off today's route. Pick it up again tonight.</span></div>`
        : "";
    box.innerHTML = `<div class="did ${kind === "Served" ? "ok" : kind === "Attempt" ? "att" : "non"}">
      <div class="did-word">${word}</div>
      <div class="did-who">${esc(job.person || "")} ${esc(job.address || "")}</div>
      ${paid}
      <div class="row-gap">
        <button class="btn go grow" id="didNext">${left ? `Next stop → (${left} left)` : "All stops done today 🎉"}</button>
        <button class="btn ghost" id="didUndo">Undo</button>
      </div>
    </div>`;
    byId("didNext").onclick = () => { RS.lastAction = null; box.innerHTML = ""; window.scrollTo({ top: 0, behavior: "smooth" }); };
    byId("didUndo").onclick = async () => {
      const { job: j, before } = RS.lastAction;
      await updateJob(j.id, { status: before.status, attempt_count: before.attempt_count, done_at: before.done_at,
        on_today: true, in_attempts: before.in_attempts, sheet_id: before.sheet_id, outcome: before.outcome, ns_reason: before.ns_reason });
      const { data } = await J().db.from("jes_attempts").select("id").eq("job_id", j.id).order("at", { ascending: false }).limit(1);
      if (data && data[0]) await J().db.from("jes_attempts").delete().eq("id", data[0].id);
      Object.assign(j, before);
      RS.stops = [j].concat(RS.stops);
      RS.lastAction = null; box.innerHTML = "";
      await saveOrder(); drawStops(); drawMap();
      J().toast("Undone — back on the route");
    };
  }

  function drawAddMore() {
    const { esc } = J();
    const pool = RS.all.filter((j) => j.status === "Active" && !j.on_today && !j.in_attempts && (j.county === RS.county || !j.county) && !needsAddress(j) && !waitingPapers(j));
    byId("rAddList").innerHTML = pool.length ? pool.map((j) => `
      <div class="add-line">
        <div class="draft-text"><div class="draft-name">${esc(j.person || "(no name yet)")}${j.job_no ? ` <span class="jobno">#${esc(j.job_no)}</span>` : ""}</div><div class="draft-addr">${esc(j.address)}</div></div>
        <button class="today-btn" data-add="${j.id}">+ Add</button>
      </div>`).join("") : `<p class="muted small">No other active ${esc(RS.county)} jobs.</p>`;
    byId("rAddList").querySelectorAll("[data-add]").forEach((b) => b.onclick = async () => {
      if (await updateJob(b.dataset.add, { on_today: true, route_order: null })) { J().toast("Added — tap Re-sort (save gas) to put it in order"); loadStops(); }
    });
  }

  // ---------- Lineup: the numbered list for sticky-noting the papers ----------
  function lineKey() { return "jes_lineup_" + todayKey() + "_" + RS.county; }
  function lineDone() {
    try { return new Set(JSON.parse(localStorage.getItem(lineKey()) || "[]")); } catch (e) { return new Set(); }
  }
  function lineSave(set) {
    try { localStorage.setItem(lineKey(), JSON.stringify(Array.from(set))); } catch (e) {}
  }

  function drawLineup() {
    const { esc } = J();
    if (!RS.stops.length) { J().toast("Build the route first"); return; }
    const done = lineDone();
    const back = byId("sheetBack");
    back.hidden = false;
    const dueChip = (j) => {
      const d = daysLeft(j);
      if (d == null) return "";
      if (d < 0) return `<span class="lu-due late">OVERDUE</span>`;
      if (d === 0) return `<span class="lu-due late">DUE TODAY</span>`;
      if (d === 1) return `<span class="lu-due late">DUE TOMORROW</span>`;
      if (d <= 3) return `<span class="lu-due soon">${d} DAYS</span>`;
      return "";
    };
    const rows = () => RS.stops.map((j, i) => `
      <div class="lu-row ${done.has(j.id) ? "on" : ""} ${dueClass(j)}" data-lu="${j.id}" role="button" tabindex="0"
           aria-label="Paper number ${stopNo(j, i)}, ${esc(j.person || "no name")}">
        <div class="lu-num">${stopNo(j, i)}</div>
        <div class="lu-text">
          <div class="lu-name">${esc(j.person || "(no name)")}</div>
          <div class="lu-sub">${esc(j.address || "")}</div>
          <div class="lu-sub2">${esc(j.client || "")}${j.job_no ? " · #" + esc(j.job_no) : ""}${dueChip(j)}${j.has_papers === false ? ` <span class="lu-due late">NO PAPERS</span>` : ""}</div>
        </div>
        <div class="lu-tick">${done.has(j.id) ? "✓" : ""}</div>
      </div>`).join("");

    const paint = () => {
      const n = RS.stops.length, got = RS.stops.filter((j) => done.has(j.id)).length;
      back.innerHTML = `<div class="sheet lineup" role="dialog" aria-modal="true" aria-labelledby="luT">
        <div class="lu-head">
          <h2 id="luT">Lineup · ${esc(RS.county)}</h2>
          <span class="lu-count ${got === n ? "all" : ""}">${got} of ${n} numbered</span>
        </div>
        <p class="muted small">Write the number on the papers, then tap the row.</p>
        <div class="lu-list">${rows()}</div>
        <div class="sheet-btns">
          <button class="btn ghost" id="luPrint">🖨 Print</button>
          <button class="btn go" id="luClose">Done</button>
        </div>
      </div>`;
      back.querySelectorAll("[data-lu]").forEach((row) => row.onclick = () => {
        const id = row.getAttribute("data-lu");
        if (done.has(id)) done.delete(id); else done.add(id);
        lineSave(done);
        paint();
      });
      byId("luClose").onclick = () => { back.hidden = true; back.innerHTML = ""; };
      byId("luPrint").onclick = () => { back.hidden = true; back.innerHTML = ""; printLineup(); };
    };
    paint();
  }

  // ---------- paper check: stand at the car and work the stack ----------
  // Two ways to read the same stack. BY ZIP is for sorting at home, because
  // that's how the papers get labelled. BY CLIENT is for standing in front of
  // Jean — pick "Jean's two" and he sees ProVest and Userve and nothing else.
  const PS = { view: "zip", only: "All" };
  function drawPaperCheck() {
    const { esc } = J();
    const back = byId("sheetBack") || document.body.appendChild(
      Object.assign(document.createElement("div"), { id: "sheetBack", className: "sheet-back" }));
    back.hidden = false;
    const zipOfJob = (j) => ((j.address || "").match(/\b(\d{5})(?:-\d{4})?\b/) || [])[1] || "No ZIP";

    const paint = () => {
      const all = JS.jobs.filter((j) => j.status === "Active" && !isDone(j));
      const clients = Array.from(new Set(all.map((j) => j.client || "No client"))).sort();
      const keep = (j) => PS.only === "All"
        || (PS.only === "JEAN" ? PAPER_CLIENTS.includes(j.client) : (j.client || "No client") === PS.only);
      const live = all.filter(keep).sort((a, b) => PS.view === "zip"
        ? (zipOfJob(a).localeCompare(zipOfJob(b)) || (a.client || "").localeCompare(b.client || ""))
        : ((a.client || "").localeCompare(b.client || "") || zipOfJob(a).localeCompare(zipOfJob(b))));
      const got = live.filter((j) => j.has_papers !== false).length;
      const bandOf = (j) => PS.view === "zip" ? zipOfJob(j) : (j.client || "No client");

      let last = "";
      const rows = live.map((j) => {
        const b = bandOf(j);
        const n = live.filter((x) => bandOf(x) === b).length;
        const head = b !== last
          ? `<div class="pc-zip">${esc(b)}<span>${n} job${n === 1 ? "" : "s"}</span></div>` : "";
        last = b;
        const have = j.has_papers !== false;
        const jean = PAPER_CLIENTS.includes(j.client);
        const sub = PS.view === "zip"
          ? `${esc(j.client || "")} · ${jean ? "Jean hands this over" : "you print this one"}`
          : `ZIP ${esc(zipOfJob(j))} · ${jean ? "Jean hands this over" : "you print this one"}`;
        return head + `<div class="pc-row ${have ? "on" : ""}" data-pc="${j.id}" role="button" tabindex="0"
             aria-label="${have ? "In hand" : "Not in hand"}: ${esc(j.person || j.address || "job")}">
          <div class="pc-tick">${have ? "✓" : ""}</div>
          <div class="pc-text">
            <div class="pc-name">${esc(j.person || "(no name)")}${j.job_no ? ` <span class="jobno">#${esc(j.job_no)}</span>` : ""}</div>
            <div class="pc-addr">${esc(j.address || "no address")}</div>
            <div class="pc-sub">${sub}</div>
          </div>
        </div>`;
      }).join("");

      const missing = live.length - got;
      const chips = PS.view === "client"
        ? `<div class="pc-chips">
            <button class="pc-chip ${PS.only === "All" ? "on" : ""}" data-only="All">All clients</button>
            <button class="pc-chip jean ${PS.only === "JEAN" ? "on" : ""}" data-only="JEAN">Jean's two only</button>
            ${clients.map((c) => `<button class="pc-chip ${PS.only === c ? "on" : ""}" data-only="${esc(c)}">${esc(shortName(c))}</button>`).join("")}
          </div>` : "";

      back.innerHTML = `<div class="sheet papercheck" role="dialog" aria-modal="true" aria-labelledby="pcT">
        <div class="lu-head">
          <h2 id="pcT">Paper check</h2>
          <span class="lu-count ${missing ? "" : "all"}">${got} of ${live.length} in hand</span>
        </div>
        <div class="seg pc-seg" id="pcView">
          <button class="${PS.view === "zip" ? "on" : ""}" data-v="zip">By ZIP</button>
          <button class="${PS.view === "client" ? "on" : ""}" data-v="client">By client</button>
        </div>
        ${chips}
        <p class="muted small">${PS.only === "JEAN" ? `<b>Jean's two only — ProVest and Userve. Nothing else is on this screen.</b> ` : ""}Work your stack. Tap a row when you find its papers.
          ${missing ? `<b>${missing} still unticked — those are jobs you have no paper for.</b>` : `Every job here has its papers ✓`}</p>
        <div class="lu-list">${rows || `<p class="muted center">Nothing here.</p>`}</div>
        <div class="sheet-btns">
          <button class="btn ghost" id="pcNone">Untick these</button>
          <button class="btn go" id="pcClose">Done</button>
        </div>
      </div>`;

      back.querySelectorAll("[data-pc]").forEach((row) => row.onclick = async () => {
        const j = JS.jobs.find((x) => x.id === row.dataset.pc);
        const have = j.has_papers !== false;
        const patch = { has_papers: !have };
        if (have) patch.on_today = false;           // no papers means off the route
        if (!(await updateJob(j.id, patch))) return;
        Object.assign(j, patch);
        // Say out loud where it went, and move it behind the sheet right now
        J().toast(have
          ? "Papers back with " + (PAPER_CLIENTS.includes(j.client) ? "Jean" : "the printer")
          : "Papers in hand ✓ — now in Ready to route");
        J().refreshBadges && J().refreshBadges();
        drawList();
        paint();
      });
      byId("pcView").onclick = (e) => {
        const b = e.target.closest("[data-v]");
        if (b) { PS.view = b.dataset.v; if (PS.view === "zip") PS.only = "All"; paint(); }
      };
      const chipBox = back.querySelector(".pc-chips");
      if (chipBox) chipBox.onclick = (e) => {
        const b = e.target.closest("[data-only]");
        if (b) { PS.only = b.dataset.only; paint(); }
      };
      byId("pcNone").onclick = async () => {
        if (!confirm(`Untick all ${live.length} showing? You'd start this stack from scratch.`)) return;
        for (const j of live) if (j.has_papers !== false) {
          await updateJob(j.id, { has_papers: false, on_today: false });
          j.has_papers = false; j.on_today = false;
        }
        J().refreshBadges && J().refreshBadges();
        drawList(); paint();
      };
      byId("pcClose").onclick = () => {
        back.hidden = true; back.innerHTML = "";
        J().refreshBadges && J().refreshBadges();
        drawJobs();
      };
    };
    paint();
  }

  // One line per stop, several to a page — black ink
  function printLineup() {
    const { esc } = J();
    const d = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    byId("printSheet").innerHTML = `
      <div class="print-head"><b>Lineup · ${esc(RS.county)} County</b><span>${esc(d)} · ${RS.stops.length} stops</span></div>
      <table class="lu-print">
        <thead><tr><th class="lup-n">#</th><th>NAME</th><th>ADDRESS</th><th class="lup-c">CLIENT · JOB #</th><th class="lup-x">✓</th></tr></thead>
        <tbody>${RS.stops.map((j, i) => `<tr>
          <td class="lup-n">${stopNo(j, i)}</td>
          <td><b>${esc(j.person || "(no name)")}</b></td>
          <td>${esc(j.address || "")}</td>
          <td class="lup-c">${esc(j.client || "")}${j.job_no ? " · #" + esc(j.job_no) : ""}</td>
          <td class="lup-x"></td>
        </tr>`).join("")}</tbody>
      </table>`;
    window.print();
  }

  // ---------- one-page printed route (black ink) ----------
  function printRoute() {
    const { esc } = J();
    const d = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    byId("printSheet").innerHTML = `
      <div class="print-head"><b>Route · ${esc(RS.county)} County</b><span>${esc(d)} · ${RS.stops.length} stops</span></div>
      <div class="print-grid">${RS.stops.map((j, i) => `
        <div class="print-box">
          <div class="pb-top"><span class="pb-num">${i + 1}</span><span>${(() => { const d = daysLeft(j); return d != null && d <= 3 ? `<span class="pb-rush">${d < 0 ? "OVERDUE" : d === 0 ? "DUE TODAY" : d === 1 ? "DUE TOMORROW" : d + " DAYS"}</span> ` : ""; })()}${j.job_type ? `<span class="pb-rush">${esc(j.job_type.toUpperCase())}</span> ` : j.service === "Rush" ? `<span class="pb-rush">RUSH</span> ` : ""}${j.is_foreclosure ? `<span class="pb-rush">FORECL ×${j.packets || 1}</span> ` : ""}${j.is_business ? `<span class="pb-rush">BUS 10-12/2-4</span>` : ""}</span></div>
          <div class="pb-name">${esc(j.person || "(no name)")}</div>
          <div>${esc(j.client || "")}${j.job_no ? " · #" + esc(j.job_no) : ""}</div>
          <div>${esc(j.address)}</div>
          <div>Attempt ${(j.attempt_count || 0) + 1} of 5${j.due_date ? " · Due " + esc(fmtDate(j.due_date)) : ""}</div>
          <div class="pb-lines">☐ Served ☐ Attempt ☐ Non-serve<br>Time: ______ Notes: ______________</div>
        </div>`).join("")}</div>`;
    window.print();
  }

  // =====================================================================
  // ATTEMPTS FOLDER — nobody home. Pick what to go back for, by county.
  // =====================================================================
  const AS = { county: localStorage.getItem("jes_att_county") || "Osceola", picked: new Set() };

  function whenTxt(iso) {
    if (!iso) return "";
    const d = new Date(iso), now = new Date();
    const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(" ", "");
    const sameDay = d.toDateString() === now.toDateString();
    const yday = new Date(now.getTime() - 864e5).toDateString() === d.toDateString();
    return sameDay ? t : yday ? "yesterday " + t : d.toLocaleDateString([], { month: "numeric", day: "numeric" }) + " " + t;
  }

  async function drawAttempts() {
    const { esc } = J();
    document.getElementById("screen").innerHTML = `
      <section class="attempts">
        <div class="att-head">
          <h1>Attempts</h1>
          <p class="muted">Nobody home — pick what to go back for.</p>
        </div>
        <div class="chips" id="attChips"></div>
        <div id="attList" class="att-list"><p class="muted">Loading…</p></div>
        <div id="attFoot" class="att-foot"></div>
      </section>`;
    await loadAttempts();
  }

  async function loadAttempts() {
    const { esc } = J();
    const all = (await fetchJobs()).filter((j) => j.in_attempts);
    AS.all = all;

    const counts = { Osceola: 0, Orange: 0, Other: 0 };
    all.forEach((j) => { counts[j.county === "Osceola" || j.county === "Orange" ? j.county : "Other"]++; });
    document.getElementById("attChips").innerHTML = ["Osceola", "Orange", "Other"]
      .filter((c) => counts[c] || c === AS.county)
      .map((c) => `<button class="chip ${c === AS.county ? "on" : ""}" data-cty="${c}">${c} ${counts[c]}</button>`).join("");
    document.querySelectorAll("[data-cty]").forEach((b) => b.onclick = () => {
      AS.county = b.getAttribute("data-cty");
      localStorage.setItem("jes_att_county", AS.county);
      AS.picked.clear();
      loadAttempts();
    });

    // Closest to 5 attempts on top — those are nearly paid, you just have to go back
    const mine = all.filter((j) => (j.county === AS.county) || (AS.county === "Other" && j.county !== "Osceola" && j.county !== "Orange"))
      .sort((a, b) => (b.attempt_count || 0) - (a.attempt_count || 0) ||
        new Date(a.last_attempt_at || 0) - new Date(b.last_attempt_at || 0));

    const list = document.getElementById("attList");
    if (!mine.length) {
      list.innerHTML = `<div class="card soft center"><p>Nothing waiting in ${esc(AS.county)}.</p><p class="muted small">Jobs land here when you tap Attempted on the route.</p></div>`;
      document.getElementById("attFoot").innerHTML = "";
      return;
    }

    list.innerHTML = mine.map((j) => {
      const n = j.attempt_count || 0;
      const hot = n >= 4;
      const note = (j.notes || "").split("\n").pop().slice(0, 48);
      return `<label class="att-row ${hot ? "hot" : ""}">
        <input type="checkbox" data-pick="${j.id}" ${AS.picked.has(j.id) ? "checked" : ""}>
        <span class="att-text">
          <span class="att-name">${esc(j.person || "(no name yet)")}${j.job_no ? ` <span class="jobno">#${esc(j.job_no)}</span>` : ""}</span>
          <span class="att-addr">${esc(j.address || "(no address)")} · ${esc(j.client || "")}</span>
          <span class="att-when ${hot ? "hot" : ""}">Attempt ${n} of 5${j.last_attempt_at ? ` · last ${esc(whenTxt(j.last_attempt_at))}` : ""}${note ? " — " + esc(note) : ""}</span>
        </span>
        <span class="att-btns">
          <button class="icon-btn" data-note="${j.id}" aria-label="Write the attempt note for ${esc(j.person || "job")}">📝</button>
          <button class="icon-btn" data-open="${j.id}" aria-label="Open ${esc(j.person || "job")}">✎</button>
        </span>
      </label>`;
    }).join("");

    list.querySelectorAll("[data-pick]").forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const id = b.getAttribute("data-pick");
      b.checked ? AS.picked.add(id) : AS.picked.delete(id);
      drawAttFoot();
    });
    list.querySelectorAll("[data-open]").forEach((b) => b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      openJob(b.getAttribute("data-open"));
    });
    list.querySelectorAll("[data-note]").forEach((b) => b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      writeNote(mine.find((x) => x.id === b.getAttribute("data-note")));
    });
    drawAttFoot();
  }

  // ---------- the attempt note, written in your words ----------
  async function writeNote(j) {
    if (!j) return;
    const { esc } = J();
    const { data } = await J().db.from("jes_attempts").select("at,kind,note")
      .eq("job_id", j.id).order("at", { ascending: true });
    const tries = (data || []).filter((a) => a.kind === "Attempt");
    const last = tries[tries.length - 1];
    const when = new Date(last ? last.at : (j.last_attempt_at || Date.now()));
    const dateTxt = when.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
    const timeTxt = when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const who = j.person || "the person named in the papers";
    const extra = (last && last.note) ? " " + last.note.replace(/\s+/g, " ").trim().replace(/([^.!?])$/, "$1.") : "";

    const para = `On ${dateTxt} at ${timeTxt}, I attempted service on ${who} at ${j.address || "the address provided"}. ` +
      `I knocked and announced myself and waited for a response. No one came to the door and I was unable to make contact.${extra} ` +
      `This was attempt ${j.attempt_count || tries.length || 1} of 5. I will attempt service again at a different time of day.`;

    const back = byId("sheetBack") ||
      document.body.appendChild(Object.assign(document.createElement("div"), { id: "sheetBack", className: "sheet-back" }));
    back.hidden = false;
    back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="anT">
      <h2 id="anT">Attempt note</h2>
      <p class="muted">Edit anything that isn't right, then copy it into their app.</p>
      <textarea id="anText" rows="7" class="paste">${esc(para)}</textarea>
      ${tries.length > 1 ? `<p class="muted small">All ${tries.length} attempts on this job: ${tries.map((a) =>
        new Date(a.at).toLocaleDateString([], { month: "numeric", day: "numeric" }) + " " +
        new Date(a.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })).join(" · ")}</p>` : ""}
      <div class="sheet-btns"><button class="btn ghost" id="anClose">Done</button><button class="btn go" id="anCopy">Copy</button></div>
    </div>`;
    const close = () => { back.hidden = true; back.innerHTML = ""; };
    byId("anClose").onclick = close;
    byId("anCopy").onclick = async () => {
      const t = byId("anText");
      t.select(); t.setSelectionRange(0, 99999);
      try { await navigator.clipboard.writeText(t.value); J().toast("Note copied"); }
      catch (e) { document.execCommand("copy"); J().toast("Note copied"); }
    };
  }

  function drawAttFoot() {
    const n = AS.picked.size;
    document.getElementById("attFoot").innerHTML = `
      <p class="muted small">Closest to 5 attempts sits on top — those are nearly paid, you just have to go back.</p>
      <button class="btn go wide" id="attGo" ${n ? "" : "disabled"}>${n ? `Add ${n} to tomorrow · ${J().esc(AS.county)}` : "Tick the ones you'll go back for"}</button>`;
    const g = document.getElementById("attGo");
    if (g) g.onclick = addToTomorrow;
  }

  async function addToTomorrow() {
    const ids = Array.from(AS.picked);
    if (!ids.length) return;
    const btn = document.getElementById("attGo");
    btn.disabled = true; btn.textContent = "Adding…";
    const { error } = await J().db.from("jes_jobs")
      .update({ on_today: true, in_attempts: false, route_order: null })
      .in("id", ids);
    if (error) { J().toast("Not added: " + error.message); btn.disabled = false; drawAttFoot(); return; }
    AS.picked.clear();
    J().toast(`${ids.length} back on the ${AS.county} route`);
    J().refreshBadges && J().refreshBadges();
    loadAttempts();
  }

  window.JES_JOBS = { drawJobs, drawRoute, drawAttempts, openJob };
})();
