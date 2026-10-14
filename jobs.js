// J EMPIRE SERVER — jobs.js (version 48: THE PINS — the lookup was shrinking street names when it should have been spelling them out, searching as one blob, and believing any answer it got —  it now asks the US Census first, asks properly, and checks the answer before saving it —  a guessed pin can no longer plan your drive: it is parked at the end and flagged —  “Fix the pins”: look them all up again, or drop one by hand and keep it —  the road bar — re-route from where you are, from home, start/end, renumber: none of it folds away any more —  “Where I am now” really re-routes, with the alert —  the top bar is alerts only, every one of them tappable —  renumber the papers 1…n after deletes —  fit a job into the drive where it costs the least —  postings and standard serves are two lanes now — split or merged in one tap on Jobs and on the Route —  Full map actually fills the screen, rotates, and zooms —  ZIP box off the phone route (it lives in Paper check, where the filing happens) —  two phone layouts you pick between — Big (one stop, large type, map parked at the bottom) and Detailed (the whole list) —  Coming up is tappable, so Big view can move around without the list —  a run is a separate drive, not a filter — pick Postings or Rush and that IS today's route: its own order, its own paper numbers 1…n, its own map and miles —  the ZIP box and the map fold shut on the phone and stay as a one-line reference —  Served can no longer close out the next job — after any action nothing is open until you tap Next stop —  the phone list goes quiet: a stop you're not standing at is three lines, the iPad keeps everything —  “Where I am now” and “Home” drop a flashing gold ring on the map —  “save re-tries for the end” turned itself off: with 39 of 44 stops a re-try it was throwing the gas order away —  re-tries can be saved for the end of the run instead of jumping the queue —  phone Route: one navy strip, a live map band you can open full screen, and what's coming up next —  Route filters — work the postings or the business ones as a cluster —  skip a stop without logging a false attempt —  lineup grouped by ZIP or client and the rows stop overlapping —  set 2 Day Post yourself — one tap, and it sets the two-day deadline —  paper check by ZIP or by client, with a “Jean’s two only” view —  stacked “middle of the ZIP” pins fan out and own up to it —  “you are here” pin, and the map says how many stops it actually placed —  tap a client in the count box to see only their jobs —  road miles banked at every stop —  the paper number stops shuffling —  tap any stop to open it —  count box on Jobs —  stops-by-ZIP box and a rush bar on the Route —  rush shows on typed jobs —  papers tick on every client —  a stop with no county no longer disappears off the route —  jump a stop to the front —  papers list grouped by ZIP —  packet reminder on the stop —  due boxes tint red —  gas order wins, deadlines shown not re-sorted —  deadline beats a saved route order —  lineup rebuilt —  deadlines drive the route order —  print pile and Jean pile split apart —  need-papers-printed list —  Lineup list + papers on every job —  deadline + job-type flags —  Served + Non-Served go straight to the sheet, Attempts folder, miles banked)
(function () {
  "use strict";
  window.JES_VER = Object.assign(window.JES_VER || {}, { jobs: 48 });
  const J = () => window.JES;
  const P = () => window.JES_PARSE;
  const $ = (s) => document.querySelector(s);
  const byId = (id) => document.getElementById(id);

  const PAPER_CLIENTS = ["ProVest", "Userve"];
  // What the client calls the job. "2 Day Post" is a posting to the door with a
  // hard two-day clock — Proof sends a lot of them.
  const JOB_TYPES = ["", "Routine", "Standard", "2 Day Post", "3 Day Post", "5 Day Post", "Expedited", "Same Day", "Priority"];
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
        <div class="lane-pick" id="jLane"></div>
        <div id="jTally"></div>
        <div class="chips phone-only" id="jColPick"></div>
        <div id="jBody"><p class="muted">Loading…</p></div>
        <div id="printSheet" class="print-only"></div>
      </section>
      <div class="sheet-back" id="sheetBack" hidden></div>`;
    byId("jCounty").onclick = (e) => { const b = e.target.closest("[data-c]"); if (b) { JS.county = b.dataset.c; drawJobs(); } };
    byId("jLane").onclick = (e) => {
      const b = e.target.closest("[data-lane]"); if (!b) return;
      JS.lane = b.dataset.lane;
      window.JES_LANE.set(JS.lane);
      drawJobs();
    };
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
          <button class="mini-flag ${/day\s*post/i.test(j.job_type || "") ? "on post" : ""}" data-post="${j.id}" aria-label="2 Day Post">📌 2d</button>
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
    // 2 Day Post in one tap — and it sets the two-day deadline with it
    box.querySelectorAll("[data-post]").forEach((b) => b.onclick = async () => {
      const j = JS.jobs.find((x) => x.id === b.dataset.post);
      const on = /day\s*post/i.test(j.job_type || "");
      const patch = { job_type: on ? null : "2 Day Post" };
      if (!on) {
        const by = new Date(); by.setHours(12, 0, 0, 0); by.setDate(by.getDate() + 2);
        patch.due_date = `${by.getFullYear()}-${String(by.getMonth() + 1).padStart(2, "0")}-${String(by.getDate()).padStart(2, "0")}`;
      }
      Object.assign(j, patch);
      if (await updateJob(j.id, patch)) {
        J().toast(on ? "2 Day Post taken off" : "2 Day Post — post it by " + patch.due_date);
        after();
      }
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
    // Postings and standard serves are two different days' work, so the Jobs
    // tab splits them exactly like the Route does.
    const lane = JS.lane || "all";
    const inLane = (j) => lane === "all" || (lane === "post" ? isPost(j) : !isPost(j));
    const nPost = JS.jobs.filter((j) => j.status === "Active" && isPost(j)).length;
    const nStd  = JS.jobs.filter((j) => j.status === "Active" && !isPost(j)).length;
    const laneBox = byId("jLane");
    if (laneBox) {
      laneBox.innerHTML = [["all", "Everything", nPost + nStd], ["post", "\u{1F4CC} 2 Day Posts & rushes", nPost], ["std", "\u{1F6AA} Standard serves", nStd]]
        .map(([id, label, n]) => `<button class="lane-btn ${id === lane ? "on" : ""}" data-lane="${id}">${label} <b>${n}</b></button>`).join("")
        + (lane !== "all" ? `<p class="lane-note">Showing <b>${lane === "post" ? "postings and rushes" : "standard serves"}</b> only. Tap <b>Everything</b> to put them back together.</p>` : "");
    }
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
      const hits = JS.jobs.filter((j) => byCounty(j) && inLane(j) && [j.person, j.job_no, j.address, j.client].join(" ").toLowerCase().includes(q)).sort(sortJobs);
      body.innerHTML = `<p class="muted small">${hits.length} match${hits.length === 1 ? "" : "es"} for “${esc(JS.q)}”</p><div class="search-grid">${hits.map(JS.dense ? jobLine : jobCard).join("") || ""}</div>`;
    } else {
      const byClient = (j) => JS.client === "All" || (j.client || "No client") === JS.client;
      const lists = COLS.map((c) => ({ c, jobs: JS.jobs.filter((j) => byCounty(j) && byClient(j) && inLane(j) && c.test(j)).sort(sortJobs) }));
      byId("jTally").innerHTML = tallyBox(JS.jobs.filter((j) => byCounty(j) && inLane(j) && j.status === "Active"));
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
          <label>Job type<select id="g_job_type">${opt(JOB_TYPES, j.job_type)}</select></label>
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
      ["status", "service", "client", "job_no", "person", "county", "due_date", "notes", "job_type", "private_phone", "private_email"].forEach((k) => {
        if (f(k)) patch[k] = f(k).value.trim() || null;
      });
      // A posting has its own clock: "2 Day Post" means posted within 2 days.
      // If there's no deadline on the job yet, set one from the type.
      const post = (patch.job_type || "").match(/^(\d+)\s*day\s*post/i);
      if (post && !patch.due_date) {
        const by = new Date(); by.setHours(12, 0, 0, 0);
        by.setDate(by.getDate() + Number(post[1]));
        patch.due_date = `${by.getFullYear()}-${String(by.getMonth() + 1).padStart(2, "0")}-${String(by.getDate()).padStart(2, "0")}`;
        J().toast(`${patch.job_type} — deadline set to ${patch.due_date}`);
      }
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
    map: null, stops: [], all: [], open: null, vague: 0, pool: null,
    homePt: null, ping: null,
    // Which run you're driving. Not a filter — the run IS the route.
    filter: localStorage.getItem("jes_route_run") || "all",
    // Two phone layouts she switches between: "big" for the field (one stop,
    // large, map parked at the bottom for reference) and "full" for planning
    // (every stop, every control). The iPad ignores this entirely.
    view: localStorage.getItem("jes_route_view") || "big",
    // A job you already knocked on comes back onto the route the next day. If
    // you re-sort from home it lands at the FRONT, because yesterday's attempts
    // are usually the ones closest to the house — so the fresh jobs you've
    // never touched get pushed to the end of the day and sometimes don't
    // happen. "last" keeps retries in gas order but parks them behind
    // everything new. The passing-by alert still pulls one up if you're near it.
    retry: localStorage.getItem("jes_route_retry") || "mixed",
    mapBig: false, fold: null,
    miles: Number(localStorage.getItem("jes_route_miles") || 0),
    lastPt: JSON.parse(localStorage.getItem("jes_route_lastpt") || "null")
  };
  // One-time reset. "Save for the end" shipped as the default and wrecked a day's
  // driving, because almost the whole route was re-tries — so it reordered nearly
  // every stop and threw the gas order away. That isn't a preference chosen on its
  // merits, so it gets cleared once. Setting it back by hand will stick.
  if (!localStorage.getItem("jes_retry_reset")) {
    try {
      localStorage.setItem("jes_retry_reset", "1");
      if (localStorage.getItem("jes_route_retry") === "last") {
        localStorage.setItem("jes_route_retry", "mixed");
        RS.retry = "mixed";
        RS.retryWasReset = true;
      }
    } catch (e) {}
  }
  RS.started = localStorage.getItem("jes_route_started") === todayKey() + "|" + RS.county;
  function getHere() {
    return new Promise((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 20000 });
    });
  }
  // "Where I am now" and "Home" used to only set a preference — nothing happened
  // on screen, so there was no way to tell they'd done anything. Now each one
  // finds the spot, drops a flashing gold ring on the map and moves the map to it.
  async function showPoint(which) {
    J().toast(which === "here" ? "Finding you\u2026" : "Finding home\u2026");
    let pt = null;
    if (which === "here") { pt = await getHere(); if (pt) RS.here = pt; }
    else { pt = await housePoint(); if (pt) RS.homePt = pt; }
    if (!pt) {
      J().toast(which === "here"
        ? "Couldn't get your location \u2014 check Settings \u2192 Safari \u2192 Location"
        : "Couldn't find your home address \u2014 set it on the Home screen");
      return;
    }
    RS.ping = { lat: pt.lat, lng: pt.lng, kind: which };
    drawMap();
    if (RS.map) RS.map.setView([pt.lat, pt.lng], 14, { animate: true });
    J().toast(which === "here" ? "You're the flashing gold ring \u2713" : "Home is the flashing gold ring \u2713");
  }

  // The whole point of "Where I am now" out on the road: not a preference, a
  // re-route. It finds you, drops the gold ring, and rebuilds the remaining run
  // from that spot — renumbering the papers so the stack matches again.
  async function rerouteFrom(which) {
    if (RS.busy) return;
    RS.busy = true;
    try {
      J().toast(which === "here" ? "Finding you\u2026" : "Finding home\u2026");
      let pt = null;
      if (which === "here") { pt = await getHere(); if (pt) RS.here = pt; }
      else { pt = await housePoint(); if (pt) RS.homePt = pt; }
      if (!pt) {
        J().toast(which === "here"
          ? "Couldn't get your location \u2014 check Settings \u2192 Safari \u2192 Location"
          : "Couldn't find your home address \u2014 set it on the Home screen");
        return;
      }
      RS.start = which;
      localStorage.setItem("jes_route_start", which);
      RS.ping = { lat: pt.lat, lng: pt.lng, kind: which };
      J().toast(which === "here" ? "Re-routing to your new current location\u2026" : "Re-routing from home\u2026");
      if (RS.stops.filter((x) => x.lat != null).length < 2) {
        drawMap();
        if (RS.map) RS.map.setView([pt.lat, pt.lng], 14, { animate: true });
        J().toast("Not enough stops with pins to re-route");
        return;
      }
      await optimize({ from: pt, label: which === "here" ? "Re-routed from where you are" : "Re-routed from home" });
      if (RS.map) RS.map.setView([pt.lat, pt.lng], 13, { animate: true });
    } finally { RS.busy = false; }
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
  // ---------------------------------------------------------------
  //  FINDING THE DOOR
  //  This was the thing wrecking the drive. Three faults:
  //   1. It SHRANK street types — Circle became Cir. Her clients already send
  //      "Cir", "Pkwy", "Ct", and OpenStreetMap stores the full word. So the
  //      abbreviation never matched anything and the lookup gave up.
  //   2. It searched as one blob of text instead of street / city / state / ZIP
  //      as separate fields, which is what the map service is built for.
  //   3. It accepted whatever came back. A pin in the wrong county became a
  //      stop on the route with nobody the wiser.
  //  Now it expands, asks properly, asks the US Census too, and checks the
  //  answer before it believes it.
  // ---------------------------------------------------------------
  const EXPAND = [
    [/\bCir\b\.?/gi, "Circle"], [/\bCt\b\.?/gi, "Court"], [/\bDr\b\.?/gi, "Drive"],
    [/\bPkwy\b\.?/gi, "Parkway"], [/\bBlvd\b\.?/gi, "Boulevard"], [/\bHwy\b\.?/gi, "Highway"],
    [/\bAve\b\.?/gi, "Avenue"], [/\bSt\b\.?(?!\s*\d)/gi, "Street"], [/\bRd\b\.?/gi, "Road"],
    [/\bLn\b\.?/gi, "Lane"], [/\bTrl\b\.?/gi, "Trail"], [/\bPl\b\.?/gi, "Place"],
    [/\bTer\b\.?/gi, "Terrace"], [/\bSq\b\.?/gi, "Square"], [/\bCv\b\.?/gi, "Cove"],
    [/\bBnd\b\.?/gi, "Bend"], [/\bXing\b\.?/gi, "Crossing"], [/\bLoop\b\.?/gi, "Loop"],
    [/\bPt\b\.?/gi, "Point"], [/\bRdg\b\.?/gi, "Ridge"], [/\bGln\b\.?/gi, "Glen"],
    [/\bRun\b\.?/gi, "Run"], [/\bWay\b\.?/gi, "Way"], [/\bPark\b\.?/gi, "Park"]
  ];
  const DIRS = [[/\bN\b\.?/g, "North"], [/\bS\b\.?/g, "South"], [/\bE\b\.?/g, "East"], [/\bW\b\.?/g, "West"],
    [/\bNE\b\.?/g, "Northeast"], [/\bNW\b\.?/g, "Northwest"], [/\bSE\b\.?/g, "Southeast"], [/\bSW\b\.?/g, "Southwest"]];

  // Strip the unit off — a geocoder can't place "Apt 105" and it ruins the match
  // NOTE: "fl" is NOT in this list. Florida's state code is FL, and treating it
  // as "floor" ate the state and the ZIP off every single address.
  const UNIT_RE = /,?\s*\b(apt|apartment|unit|ste|suite|lot|bldg|building|rm|room|floor|#)\s*\.?\s*[\w-]+/ig;

  function parseAddr(address) {
    const raw = String(address || "").trim();
    const noUnit = raw.replace(UNIT_RE, "");
    const parts = noUnit.split(",").map((x) => x.trim()).filter(Boolean);
    const tail = parts[parts.length - 1] || "";
    const m = tail.match(/\b([A-Z]{2})\s*(\d{5})(?:-\d{4})?\s*$/i);
    let state = m ? m[1].toUpperCase() : "FL";
    let zip = m ? m[2] : (noUnit.match(/\b(\d{5})(?:-\d{4})?\b/) || [])[1] || "";
    let city = "";
    if (parts.length >= 2) city = (m ? parts[parts.length - 2] : parts[parts.length - 1]) || "";
    city = city.replace(/\b[A-Z]{2}\s*\d{5}(-\d{4})?\s*$/i, "").trim();
    let street = parts[0] || "";
    // some pastes put the whole thing on one line
    if (parts.length === 1) {
      const sm = raw.match(/^(.*?)\s+([A-Za-z .'-]+),?\s*([A-Z]{2})\s*(\d{5})/);
      if (sm) { street = sm[1]; city = sm[2]; state = sm[3]; zip = sm[4]; }
    }
    street = street.replace(UNIT_RE, "").replace(/\s+/g, " ").trim();
    let full = street;
    EXPAND.forEach(([re, to]) => { full = full.replace(re, to); });
    let dirFull = full;
    DIRS.forEach(([re, to]) => { dirFull = dirFull.replace(re, to); });
    return { raw, street, full, dirFull, city, state, zip };
  }

  async function nomStructured(a) {
    const q = new URLSearchParams({ format: "jsonv2", addressdetails: "1", limit: "1", countrycodes: "us" });
    if (a.full) q.set("street", a.full);
    if (a.city) q.set("city", a.city);
    if (a.state) q.set("state", a.state);
    if (a.zip) q.set("postalcode", a.zip);
    try {
      const r = await fetch("https://nominatim.openstreetmap.org/search?" + q.toString(), { headers: { Accept: "application/json" } });
      const d = await r.json();
      if (d && d[0]) {
        const ad = d[0].address || {};
        return { lat: Number(d[0].lat), lng: Number(d[0].lon),
          zip: ad.postcode ? String(ad.postcode).slice(0, 5) : "",
          house: !!ad.house_number, kind: d[0].addresstype || d[0].type || "" };
      }
    } catch (e) {}
    return null;
  }
  async function nomFree(q) {
    try {
      const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=us&q=" + encodeURIComponent(q), { headers: { Accept: "application/json" } });
      const d = await r.json();
      if (d && d[0]) {
        const ad = d[0].address || {};
        return { lat: Number(d[0].lat), lng: Number(d[0].lon),
          zip: ad.postcode ? String(ad.postcode).slice(0, 5) : "",
          house: !!ad.house_number, kind: d[0].addresstype || d[0].type || "" };
      }
    } catch (e) {}
    return null;
  }
  // The US Census geocoder is free, needs no key, and is built for exactly this
  // — American street addresses. When it answers, it's usually the real door.
  async function censusLookup(a) {
    const one = [a.full, a.city, a.state, a.zip].filter(Boolean).join(", ");
    const url = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=" + encodeURIComponent(one);
    try {
      const r = await fetch(url);
      const d = await r.json();
      const hit = d && d.result && d.result.addressMatches && d.result.addressMatches[0];
      if (hit && hit.coordinates) {
        return { lat: Number(hit.coordinates.y), lng: Number(hit.coordinates.x),
          zip: (hit.addressComponents && hit.addressComponents.zip) || "", house: true, kind: "census" };
      }
    } catch (e) {}
    return null;
  }

  // Believe a result only if it lands where it should. A pin in the wrong ZIP,
  // or an hour outside the counties she works, is worse than no pin at all.
  function plausible(pt, a) {
    if (!pt || !isFinite(pt.lat) || !isFinite(pt.lng)) return false;
    let home = HOME_FALLBACK;
    try { const c = JSON.parse(localStorage.getItem("jes_home_ll") || "null"); if (c) home = c; } catch (e) {}
    if (miles(home, pt) > 90) return false;                 // not in her circuit
    if (a.zip && pt.zip && pt.zip !== a.zip) return false;   // wrong ZIP outright
    return true;
  }

  // quality: "exact" = the door · "street" = right street, no number ·
  //          "rough" = middle of the ZIP, do not trust it to navigate
  async function geocode(address) {
    const a = parseAddr(address);
    if (!a.street && !a.zip) return null;

    // 1. the Census, which knows house numbers
    let pt = await censusLookup(a);
    if (pt && plausible(pt, a)) return { lat: pt.lat, lng: pt.lng, quality: "exact", approx: false };

    // 2. the map service, asked properly
    await sleep(900);
    pt = await nomStructured(a);
    if (pt && plausible(pt, a)) return { lat: pt.lat, lng: pt.lng, quality: pt.house ? "exact" : "street", approx: !pt.house };

    // 3. the same thing spelled out in full, in case the street type was the problem
    if (a.dirFull !== a.full) {
      await sleep(900);
      pt = await nomFree([a.dirFull, a.city, a.state, a.zip].filter(Boolean).join(", "));
      if (pt && plausible(pt, a)) return { lat: pt.lat, lng: pt.lng, quality: pt.house ? "exact" : "street", approx: !pt.house };
    }

    // 4. exactly as it was written
    await sleep(900);
    pt = await nomFree(a.raw.replace(UNIT_RE, ""));
    if (pt && plausible(pt, a)) return { lat: pt.lat, lng: pt.lng, quality: pt.house ? "exact" : "street", approx: !pt.house };

    // 5. the street without the house number — right road, wrong door
    const noNum = a.full.replace(/^\d+[A-Za-z]?\s+/, "");
    if (noNum && noNum !== a.full) {
      await sleep(900);
      pt = await nomFree([noNum, a.city, a.state, a.zip].filter(Boolean).join(", "));
      if (pt && plausible(pt, a)) return { lat: pt.lat, lng: pt.lng, quality: "street", approx: true };
    }

    // 6. give up and say so. This pin is the middle of the ZIP and nothing more.
    if (a.zip) {
      await sleep(900);
      pt = await nomFree(a.zip + ", " + (a.state || "FL"));
      if (pt) return { lat: pt.lat, lng: pt.lng, quality: "rough", approx: true };
    }
    return null;
  }

  // The house itself, whatever "Start from" is set to.
  async function housePoint() {
    try { const c = JSON.parse(localStorage.getItem("jes_home_ll") || "null"); if (c) return c; } catch (e) {}
    const { data } = await J().db.from("jes_settings").select("value").eq("key", "home_address").maybeSingle();
    const pt = (data && data.value && await geocode(String(data.value))) || HOME_FALLBACK;
    try { localStorage.setItem("jes_home_ll", JSON.stringify(pt)); } catch (e) {}
    return pt;
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
    // On the phone the whole planning half folds behind one navy strip. Open by
    // default the night before, closed once the route is running — because by
    // then you want the stop you're standing at, not the planning tools.
    // Big view exists to put the stop at the top. Opening the planning half
    // above it would undo the whole thing, so Big starts folded.
    if (RS.fold == null) RS.fold = RS.view === "big" ? false : !RS.started;
    const mapShut = localStorage.getItem("jes_map_shut") === "1";
    byId("screen").innerHTML = `
      <section class="route ${RS.fold ? "fold-open" : ""} ${mapShut ? "map-shut" : ""} view-${RS.view}" id="rSec">
        <div class="route-head">
          <h1>Today's Route</h1>
          <div class="seg desk-county" id="rCounty">${["Osceola", "Orange"].map((c) => `<button class="${c === RS.county ? "on" : ""}" data-c="${c}">${c}</button>`).join("")}</div>
        </div>
        <div id="rStrip" class="rstrip-wrap"></div>
        <div class="view-pick" id="rView">
          <button class="${RS.view === "big" ? "on" : ""}" data-v="big">👁 Big — one stop</button>
          <button class="${RS.view === "full" ? "on" : ""}" data-v="full">☰ Detailed — everything</button>
        </div>
        <div class="road-bar" id="rRoad">
          <button class="rb big" id="rbHere">📍 Re-route from where I am</button>
          <div class="rb-row">
            <button class="rb" id="rbHome">🏠 From home</button>
            ${RS.started
              ? `<button class="rb stop" id="rbEnd">■ End route</button>`
              : `<button class="rb go" id="rbGo">▶ Start route</button>`}
            <button class="rb" id="rbMore">⚙ More</button>
          </div>
          <button class="rb thin" id="rbNum">🔢 Renumber the papers 1–<span id="rbNumN">0</span></button>
          <button class="rb warn" id="rbPins" hidden>📍 Fix <span id="rbPinsN">0</span> unconfirmed pin<span id="rbPinsS"></span></button>
        </div>
        <div class="route-fold">
          <div class="start-from phone-block">
            <span class="sf-label">County</span>
            <div class="seg" id="rCounty2">${["Osceola", "Orange"].map((c) => `<button class="${c === RS.county ? "on" : ""}" data-c="${c}">${c}</button>`).join("")}</div>
          </div>
          <div id="rZips"></div>
          <div id="rMsg"></div>
          ${RS.started ? `<div class="route-live">● Route in progress — stops re-sort from where you are after each one</div>` : ""}
        </div>
        <div id="rNear" class="near-wrap"></div>
        <div id="rDid"></div>
        <div class="route-grid">
          <div class="route-mapcol">
            <button class="map-show" id="rMapShow">🗺 Show the map ▾</button>
            <div class="map-wrap" id="rMapWrap">
              <div id="rMap" class="map" role="img" aria-label="Map of today's stops"></div>
              <button class="map-expand" id="rExpand" aria-label="Open the map full screen">⤢ Full map</button>
              <button class="map-shrink" id="rShrink">‹ Back to the stop</button>
              <button class="map-hide" id="rMapHide">hide map ▴</button>
            </div>
            <div class="map-extras">
              <div class="start-from">
                <span class="sf-label">Start from</span>
                <div class="seg" id="rStart">${[["here", "📍 Where I am now"], ["home", "🏠 Home"]].map(([v, t]) => `<button class="${v === RS.start ? "on" : ""}" data-s="${v}">${t}</button>`).join("")}</div>
              </div>
              <div class="start-from">
                <span class="sf-label">Re-tries</span>
                <div class="seg" id="rRetry">${[["last", "⤓ Save for the end"], ["mixed", "Mix into the drive"]].map(([v, t]) => `<button class="${v === RS.retry ? "on" : ""}" data-r="${v}">${t}</button>`).join("")}</div>
              </div>
              <p class="retry-note" id="rRetryNote"></p>
              <div class="route-tools">
                ${RS.started
                  ? `<button class="btn ghost" id="rEnd">■ End route</button>`
                  : `<button class="btn go" id="rGo">▶ Start route</button>`}
                <button class="btn ghost" id="rBest">Re-sort (save gas)</button>
                <button class="btn ghost" id="rLine">📋 Lineup</button>
                <button class="btn ghost" id="rPrint">Print</button>
                <button class="btn ghost" id="rWhere">📍 Where am I</button>
                <button class="btn ghost" id="rPins">📍 Fix the pins</button>
              </div>
              <p class="map-count" id="rMapCount"></p>
            </div>
          </div>
          <div class="route-listcol">
            <div id="rStops" class="stops"><p class="muted">Loading…</p></div>
            <details class="add-more" id="rAdd"><summary>Add more stops in ${esc(RS.county)}</summary><div id="rAddList"></div></details>
          </div>
        </div>
        <div id="printSheet" class="print-only"></div>
      </section>
      <div class="sheet-back" id="sheetBack" hidden></div>`;
    const pickCounty = (e) => {
      const b = e.target.closest("[data-c]"); if (!b) return;
      RS.county = b.dataset.c; localStorage.setItem("jes_route_county", RS.county); drawRoute();
    };
    byId("rCounty").onclick = pickCounty;
    byId("rCounty2").onclick = pickCounty;
    byId("rStart").onclick = (e) => {
      const b = e.target.closest("[data-s]"); if (!b) return;
      RS.start = b.dataset.s;
      localStorage.setItem("jes_route_start", RS.start);
      byId("rStart").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      showPoint(RS.start);          // and show me where that is
    };
    byId("rbPins").onclick = () => drawFixPins();
    byId("rbHere").onclick = () => rerouteFrom("here");
    byId("rbHome").onclick = () => rerouteFrom("home");
    if (byId("rbGo")) byId("rbGo").onclick = startRoute;
    if (byId("rbEnd")) byId("rbEnd").onclick = endRoute;
    byId("rbMore").onclick = () => {
      RS.fold = !RS.fold;
      byId("rSec").classList.toggle("fold-open", RS.fold);
      drawStrip();
      if (RS.fold) setTimeout(() => {
        const ex = document.querySelector(".map-extras");
        if (ex) ex.scrollIntoView({ block: "start", behavior: "smooth" });
      }, 80);
      if (RS.map) setTimeout(() => { RS.map.invalidateSize(); fitMap(); }, 120);
    };
    byId("rbNum").onclick = async () => {
      if (!RS.stops.length) { J().toast("No stops to number"); return; }
      if (!confirm(`Write fresh numbers 1 to ${RS.stops.length} on today's papers?\n\nThis is the drive order you have now. Any numbers already on your sticky notes will be wrong after this.`)) return;
      await numberPapers(true);
      drawStops(); drawMap(); drawStrip();
      J().toast(`Papers renumbered 1 to ${RS.stops.length}`);
    };
    byId("rView").onclick = (e) => {
      const b = e.target.closest("[data-v]"); if (!b || b.dataset.v === RS.view) return;
      RS.view = b.dataset.v;
      localStorage.setItem("jes_route_view", RS.view);
      const sec = byId("rSec");
      sec.classList.toggle("view-big", RS.view === "big");
      sec.classList.toggle("view-full", RS.view === "full");
      byId("rView").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      if (RS.view === "big" && !RS.hold && !RS.open && RS.stops.length) RS.open = RS.stops[0].id;
      if (RS.view === "big" && RS.fold) { RS.fold = false; sec.classList.remove("fold-open"); drawStrip(); }
      drawStops();
      if (RS.map) setTimeout(() => { RS.map.invalidateSize(); fitMap(); }, 80);
      J().toast(RS.view === "big" ? "One stop at a time \u00b7 map parked at the bottom" : "The whole list, every control");
    };
    byId("rRetry").onclick = (e) => {
      const b = e.target.closest("[data-r]"); if (!b || b.dataset.r === RS.retry) return;
      RS.retry = b.dataset.r;
      localStorage.setItem("jes_route_retry", RS.retry);
      RS.retryWasReset = false;
      drawRoute();
      J().toast(RS.retry === "last"
        ? "Re-tries will sit at the end — tap Re-sort to apply it"
        : "One gas order for everything — tap Re-sort to apply it");
    };
    byId("rBest").onclick = () => optimize();
    byId("rPins").onclick = () => drawFixPins();
    // Full-screen map, and back again. Leaflet has to be told the box changed size.
    const resize = () => { if (RS.map) { RS.map.invalidateSize(); fitMap(); } };
    byId("rExpand").onclick = () => {
      RS.mapBig = true;
      byId("rSec").classList.add("map-big");
      // Leaflet measures its box once. Give the fixed layout a frame to land,
      // then measure again after the rotate/resize settles.
      setTimeout(resize, 60); setTimeout(resize, 350);
    };
    if (!RS.rotWired) {
      RS.rotWired = true;
      window.addEventListener("orientationchange", () => { setTimeout(() => { if (RS.map) { RS.map.invalidateSize(); fitMap(); } }, 350); });
      window.addEventListener("resize", () => {
        clearTimeout(RS.rotT);
        RS.rotT = setTimeout(() => { if (RS.map) RS.map.invalidateSize(); }, 220);
      });
    }
    byId("rMapHide").onclick = () => {
      localStorage.setItem("jes_map_shut", "1");
      byId("rSec").classList.add("map-shut");
    };
    byId("rMapShow").onclick = () => {
      localStorage.setItem("jes_map_shut", "0");
      byId("rSec").classList.remove("map-shut");
      setTimeout(resize, 60);
    };
    byId("rShrink").onclick = () => { RS.mapBig = false; byId("rSec").classList.remove("map-big"); setTimeout(resize, 60); };
    // Tap a pin, open that stop — from either map size
    byId("rMapWrap").addEventListener("click", (e) => {
      const b = e.target.closest("[data-popstop]"); if (!b) return;
      RS.open = b.dataset.popstop;
      RS.mapBig = false; byId("rSec").classList.remove("map-big");
      drawStops(); drawStrip(); drawNextUp();
      setTimeout(resize, 60);
      const card = byId("rStops").querySelector(".stop.current");
      if (card) card.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    byId("rWhere").onclick = () => showPoint("here");
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
    RS.fold = null;      // driving now — the planning half folds itself away
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
    RS.fold = null; RS.mapBig = false;   // back to planning — open it up again

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
    const shut = localStorage.getItem("jes_zip_shut") === "1";
    box.innerHTML = `<div class="zips ${shut ? "shut" : ""}" id="rZipBox">
      <button class="zip-toggle" id="rZipToggle">
        <span><b>Stops by ZIP</b>${shut ? ` \u00b7 ${Object.keys(g).length} ZIP${Object.keys(g).length === 1 ? "" : "s"} \u00b7 ${RS.stops.length} stop${RS.stops.length === 1 ? "" : "s"} \u00b7 ${money(cash)}` : ""}</span>
        <u>${shut ? "open \u25BE" : "hide \u25B4"}</u>
      </button>
      <div class="zip-body">${rows}
        <div class="ztot"><b>${RS.stops.length} stop${RS.stops.length > 1 ? "s" : ""}</b><u>${money(cash)}</u></div>
      </div>
    </div>`;
    byId("rZipToggle").onclick = () => {
      localStorage.setItem("jes_zip_shut", shut ? "0" : "1");
      drawZipLedger();
    };
  }

  // Whether "Save for the end" is a good idea depends entirely on how many of
  // today's stops are re-tries. At 39 out of 44 it isn't a nudge, it's a reorder
  // of the whole route with the gas order thrown away. So the note counts.
  function drawRetryNote() {
    const box = byId("rRetryNote"); if (!box) return;
    const n = RS.stops.length;
    const again = RS.stops.filter(isRetry).length;
    const pct = n ? Math.round((again / n) * 100) : 0;
    const heavy = n >= 6 && pct >= 35;
    const reset = RS.retryWasReset
      ? `<b class="bad">Changed back for you.</b> "Save for the end" was moving almost your whole route, which is what had you driving out of an area and back into it. Tap it again if you want it on.<br><br>` : "";
    if (RS.retry === "last") {
      box.className = "retry-note" + (heavy ? " warn" : "");
      box.innerHTML = reset + (heavy
        ? `<b class="bad">This will scramble today's drive.</b> ${again} of your ${n} stops (${pct}%) are re-tries, so this moves nearly all of them to the back and the gas order barely survives. It only helps when re-tries are a small handful. <b>Leave it on "Mix into the drive" today.</b>`
        : `${again} of ${n} stops are re-tries. They go <b>behind everything you haven't knocked on yet</b>. You'll still get the "you're passing it" prompt if you drive near one.`);
    } else {
      box.className = "retry-note";
      box.innerHTML = reset + `Everything is ordered by gas together \u2014 one loop, no doubling back. <b>Re-sort (save gas)</b> is what sets it.`
        + (again ? ` ${again} of your ${n} stops are re-tries and they're mixed in where they fall.` : "");
    }
  }

  // ---------- the phone strip: the whole planning half on one line ----------
  // Nothing here is new information. It's the ZIP box, the rush bar, the
  // deadline warning, the rough-pin count and the money, squeezed down so you
  // can read the lot at a red light. Tap it and the real thing unfolds.
  function drawStrip() {
    const n = byId("rbNumN"); if (n) n.textContent = String(RS.stops.length);
    const bad = RS.stops.filter(pinBad).length;
    const pb = byId("rbPins");
    if (pb) {
      pb.hidden = !bad;
      byId("rbPinsN").textContent = String(bad);
      byId("rbPinsS").textContent = bad === 1 ? "" : "s";
    }
    const box = byId("rStrip"); if (!box) return;
    const { esc, money } = J();
    if (!RS.stops.length) { box.innerHTML = ""; return; }
    const openAt = RS.open ? RS.stops.findIndex((s) => s.id === RS.open) : 0;
    const j = RS.stops[openAt < 0 ? 0 : openAt];
    // This bar is for things that need doing. ZIP counts are not an alert — they
    // belong in Paper check, where the filing happens — and the money on the
    // windscreen is just noise.
    const rush = RS.stops.filter((x) => x.service === "Rush").length;
    const due = RS.stops.filter((x) => { const d = daysLeft(x); return d != null && d <= 0; }).length;
    const soon = RS.stops.filter((x) => { const d = daysLeft(x); return d === 1; }).length;
    const again = RS.stops.filter(isRetry).length;
    const biz = RS.stops.filter((x) => x.is_business).length;
    const badPins = RS.stops.filter(pinBad).length;
    const chips = [
      rush ? `<span class="sc hot" data-jump="rush">⚡ ${rush} rush</span>` : "",
      due ? `<span class="sc hot" data-jump="due">⏰ ${due} due today</span>` : "",
      soon ? `<span class="sc warm" data-jump="due">⏰ ${soon} due tomorrow</span>` : "",
      again ? `<span class="sc warm" data-jump="again">🔁 ${again} re-tr${again === 1 ? "y" : "ies"}</span>` : "",
      biz && !businessHoursNow() ? `<span class="sc warm" data-jump="biz">🏢 ${biz} business · closed now</span>` : "",
      badPins ? `<span class="sc hot" data-jump="rough">📍 ${badPins} unconfirmed pin${badPins === 1 ? "" : "s"}</span>` : ""
    ].filter(Boolean).join("");
    const clear = !chips;
    // "Stop 49 of 41" is nonsense, and it is what she saw. The paper number and
    // the position in the drive are two different things, so say both.
    const at = (openAt < 0 ? 0 : openAt) + 1;
    box.innerHTML = `<button class="rstrip ${clear ? "clear" : ""}" id="rStripBtn" aria-expanded="${RS.fold}">
      <span class="rs-top">
        <b>${at} of ${RS.stops.length} · paper #${stopNo(j, openAt < 0 ? 0 : openAt)} · ${esc(RS.county)}</b>
        <u>${RS.fold ? "close ▴" : "open ▾"}</u>
      </span>
      <span class="rs-chips">${chips || `<span class="sc ok">✓ Nothing needs you — just drive the list</span>`}</span>
    </button>`;
    byId("rStripBtn").onclick = (e) => {
      // Tap an alert and you land in that group. Tap the bar itself and it folds.
      const chip = e.target.closest("[data-jump]");
      if (chip) {
        e.stopPropagation();
        const want = chip.dataset.jump;
        RS.filter = RS.filter === want ? "all" : want;
        localStorage.setItem("jes_route_run", RS.filter);
        RS.open = null; RS.hold = false;
        applyRun();
        drawStops(); drawMap(); drawZipLedger(); drawRetryNote(); drawStrip(); drawNextUp();
        const f = stopFilter();
        J().toast(RS.filter === "all"
          ? `Back to the whole day \u00b7 ${RS.stops.length} stops`
          : `${RS.stops.length} ${f.short} \u00b7 tap the same chip again to come back`);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      RS.fold = !RS.fold;
      byId("rSec").classList.toggle("fold-open", RS.fold);
      drawStrip();
      if (RS.map) setTimeout(() => { RS.map.invalidateSize(); fitMap(); }, 60);
    };
  }

  // The open stop plus the three after it — what the band on the map is showing
  function computeNext() {
    const openAt = RS.open ? RS.stops.findIndex((s) => s.id === RS.open) : 0;
    const from = openAt < 0 ? 0 : openAt;
    const run = RS.stops.slice(from, from + 4);
    RS.nextPts = run.filter((x) => x.lat != null).map((x) => [x.lat, x.lng]);
    return { from, run };
  }

  function nextUpHtml() {
    const { esc } = J();
    const { from, run } = computeNext();
    const rest = run.slice(1);
    if (!rest.length) return "";
    const rows = rest.map((x, k) => {
      const prev = run[k];
      const d = (prev.lat != null && x.lat != null) ? roadMiles(prev, x).toFixed(1) + " mi" : "\u2014";
      return `<button class="nx-row" data-open-stop="${x.id}"><b>${stopNo(x, from + k + 1)}</b>
        <span>${esc(x.person || "(no name)")}<i>${esc((x.address || "").split(",")[0] || "no address")}</i></span>
        ${isRetry(x) ? `<em class="nx-again">\u{1F501}</em>` : ""}<u>${d}</u></button>`;
    }).join("");
    const left = RS.stops.length - (from + 1);
    return `<div class="nextup phone-block"><h4>Coming up \u00b7 tap one to jump to it</h4>${rows}
      ${left > rows.length ? `<p class="nx-more">${left} stop${left === 1 ? "" : "s"} left in this run</p>` : ""}</div>`;
  }
  function drawNextUp() { computeNext(); }

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
    RS.pool = inCounty.filter((j) => !needsAddress(j))
      // Gas order rules the route. Deadlines show up in red instead of
      // jumping the line — you'll drive the whole route today anyway.
      // Retries sit behind anything you've never knocked on, unless a saved
      // drive order already decided otherwise.
      .sort((a, b) => (a.route_order ?? 999) - (b.route_order ?? 999)
        || (RS.retry === "last" ? (isRetry(a) ? 1 : 0) - (isRetry(b) ? 1 : 0) : 0)
        || rank(a) - rank(b));
    RS.stops = RS.pool;
    applyRun();                      // a run is the route, not a filter
    const otherCounty = today.filter((j) => j.county && j.county !== RS.county).length;

    const msgs = [];
    const noPin = RS.stops.filter((j) => j.lat == null).length;
    if (noCounty.length) msgs.push(`${noCounty.length} of today's stops ${noCounty.length > 1 ? "have" : "has"} no county set, so ${noCounty.length > 1 ? "they show" : "it shows"} on both routes: ${noCounty.map((j) => j.person || (j.address || "").split(",")[0] || "no name").join(", ")}. Open ${noCounty.length > 1 ? "them" : "it"} and set the county.`);
    if (noPin) msgs.push(`${noPin} stop${noPin > 1 ? "s have" : " has"} no map pin — open it and check the address.`);
    if (noAddr.length) msgs.push(`${noAddr.length} of today's jobs in ${RS.county} ${noAddr.length > 1 ? "are" : "is"} missing an address — fix in Jobs → Needs address.`);
    if (waitingToday) msgs.push(`${waitingToday} job${waitingToday > 1 ? "s are" : " is"} still waiting on papers from Jean, so ${waitingToday > 1 ? "they're" : "it's"} left off the route.`);
    if (otherCounty) msgs.push(`${otherCounty} of today's jobs ${otherCounty > 1 ? "are" : "is"} in the other county and not shown here.`);
    const again = RS.stops.filter(isRetry).length;
    if (again && RS.retry === "last") msgs.push(`${again} stop${again > 1 ? "s are" : " is"} a re-try, so ${again > 1 ? "they sit" : "it sits"} behind everything you haven't knocked on yet. Tap Re-sort to rebuild the drive that way. Change it under Re-tries if you'd rather mix them in.`);
    byId("rMsg").innerHTML = msgs.map((m) => `<div class="alert soft">${J().esc(m)}</div>`).join("");
    await numberPapers(false);     // anything added since keeps a number of its own
    drawZipLedger();
    drawRetryNote();

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
      if (pt) {
        missing[i].lat = pt.lat; missing[i].lng = pt.lng;
        missing[i].geoApprox = pt.approx; missing[i].geo_quality = pt.quality;
        await updateJob(missing[i].id, { lat: pt.lat, lng: pt.lng, geo_quality: pt.quality });
      } else missing[i].geoFail = true;
      if (i < missing.length - 1) await sleep(1100);
    }
    drawStops();
    drawMap();
    drawAddMore();
  }

  // Shrunk down to a band on the phone, the whole county is unreadable, so the
  // small map leans in on where you actually are. Full screen shows the lot.
  function fitMap() {
    const map = RS.map; if (!map) return;
    const all = RS.bounds || [];
    if (!all.length) { map.setView([HOME_FALLBACK.lat, HOME_FALLBACK.lng], 11); return; }
    const band = !RS.mapBig && window.matchMedia("(max-width: 899px)").matches;
    if (RS.mapBig) { map.fitBounds(all, { padding: [50, 50], maxZoom: 15 }); return; }
    if (!band) { map.fitBounds(all, { padding: [40, 40], maxZoom: 15 }); return; }
    // the band: your own dot plus the next three stops, close in
    const near = (RS.here ? [[RS.here.lat, RS.here.lng]] : []).concat(RS.nextPts || []);
    if (near.length > 1) map.fitBounds(near, { padding: [26, 26], maxZoom: 15 });
    else if (near.length === 1) map.setView(near[0], 14);
    else map.fitBounds(all, { padding: [20, 20], maxZoom: 14 });
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
    computeNext();
    const mf = stopFilter();
    const onMap = RS.stops.map((j, i) => ({ j, i }));
    const tally = {};
    onMap.forEach(({ j }) => {
      if (j.lat == null) return;
      const k = j.lat.toFixed(4) + "," + j.lng.toFixed(4);
      tally[k] = (tally[k] || 0) + 1;
    });
    const pts = [];
    const seen = {};
    let vague = 0;
    onMap.forEach(({ j, i }) => {
      if (j.lat == null) return;
      const key = j.lat.toFixed(4) + "," + j.lng.toFixed(4);
      const stacked = tally[key] > 1 || pinBad(j);
      j.geoVague = stacked;
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
          + (stacked ? `<br><b style="color:#9B3B2F">Rough spot only — this pin is the middle of the ZIP, not the door.</b>` : "")
          + `<br><button class="pop-open" data-popstop="${j.id}">Open this stop</button>`);
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
    // your house — where the run starts and ends
    if (RS.homePt) {
      const hIcon = L.divIcon({ className: "pin house", html: `<span>\u{1F3E0}</span>`, iconSize: [38, 38], iconAnchor: [19, 19] });
      L.marker([RS.homePt.lat, RS.homePt.lng], { icon: hIcon, zIndexOffset: 900 })
        .addTo(map).bindPopup("<b>Home</b>");
      all.push([RS.homePt.lat, RS.homePt.lng]);
    }
    // the flashing gold ring — whatever you just asked the map to show you
    if (RS.ping) {
      const pIcon = L.divIcon({ className: "pin ping", html: `<i></i><span>${RS.ping.kind === "here" ? "YOU" : "HOME"}</span>`, iconSize: [64, 64], iconAnchor: [32, 32] });
      L.marker([RS.ping.lat, RS.ping.lng], { icon: pIcon, zIndexOffset: 1200 }).addTo(map);
    }
    RS.bounds = all;
    fitMap();
    setTimeout(() => map.invalidateSize(), 200);

    // Say plainly how many stops actually made it onto the map
    const tag = byId("rMapCount");
    if (tag) {
      const off = onMap.length - pts.length;
      const bits = [];
      if (off) bits.push(`<b class="bad">${off} of your ${RS.stops.length} stops ${off === 1 ? "isn't" : "aren't"} on the map</b> — tap <b>Find missing pins</b>.`);
      const bad = RS.stops.filter(pinBad).length;
      if (bad) bits.push(`<b class="bad">${bad} pin${bad === 1 ? " isn't" : "s aren't"} confirmed</b> — those are the hollow ones. They're left out of the gas sort and parked at the end, so they can't drag your drive sideways. Tap <b>Fix the pins</b> to sort them.`);
      if (!bits.length) bits.push(`All ${onMap.length} stop${onMap.length === 1 ? " is" : "s are"} on the map, each at its own address.`);
      if (RS.filter !== "all") bits.unshift(`<b>This map is your ${J().esc(mf.short)} run.</b>`);
      tag.innerHTML = bits.join(" ");
    }
  }

  // ---------------------------------------------------------------
  //  FIX THE PINS
  //  No lookup gets every address. Gated communities, brand-new builds and
  //  unit numbers defeat all of them. So there has to be a way to put a pin
  //  exactly where the door is, by hand, once — and have it stay there.
  // ---------------------------------------------------------------
  const PIN = { map: null, job: null, at: null };
  async function drawFixPins() {
    const { esc } = J();
    const bad = RS.stops.filter(pinBad);
    const back = byId("sheetBack") ||
      document.body.appendChild(Object.assign(document.createElement("div"), { id: "sheetBack", className: "sheet-back" }));
    back.hidden = false;
    const row = (j) => {
      const why = j.lat == null ? "never found"
        : j.geo_quality === "rough" ? "middle of the ZIP — not a real spot"
        : "found by the old lookup, never checked";
      return `<div class="fp-row" data-fp="${j.id}">
        <div class="fp-text">
          <div class="fp-name">${esc(j.person || "(no name)")}${j.job_no ? ` <span class="jobno">#${esc(j.job_no)}</span>` : ""}</div>
          <div class="fp-addr">${esc(j.address || "no address")}</div>
          <div class="fp-why">${esc(why)}</div>
        </div>
        <div class="fp-btns">
          <button class="btn ghost thin" data-one="${j.id}">Look up</button>
          <button class="btn ghost thin" data-hand="${j.id}">📍 Place by hand</button>
        </div>
      </div>`;
    };
    back.innerHTML = `<div class="sheet fixpins" role="dialog" aria-modal="true" aria-labelledby="fpT">
      <h2 id="fpT">Fix the pins</h2>
      <p class="muted">The drive order is worked out from the pins. A pin that's only the middle of a ZIP code isn't a place — so those are left out of the gas sort and parked at the end until you fix them.</p>
      <div class="fp-sum">
        <b>${RS.stops.filter(pinOK).length}</b> confirmed · <b class="bad">${bad.length}</b> to fix
      </div>
      <button class="btn go wide" id="fpAll" ${bad.length ? "" : "disabled"}>Look all ${bad.length} up again</button>
      <p class="muted small center">About a second each — ${bad.length} will take roughly ${Math.ceil(bad.length * 2.5 / 60)} minute${Math.ceil(bad.length * 2.5 / 60) === 1 ? "" : "s"}. Leave this open while it runs.</p>
      <div id="fpProg"></div>
      <div class="fp-list" id="fpList">${bad.length ? bad.map(row).join("") : `<p class="muted center">Every stop has a confirmed pin. ✓</p>`}</div>
      <div class="sheet-btns"><button class="btn ghost" id="fpClose">Done</button></div>
    </div>`;
    byId("fpClose").onclick = () => { back.hidden = true; back.innerHTML = ""; loadStops(); };
    byId("fpAll").onclick = () => runLookups(bad);
    back.querySelectorAll("[data-one]").forEach((b) => b.onclick = () => runLookups([RS.stops.find((x) => x.id === b.dataset.one)]));
    back.querySelectorAll("[data-hand]").forEach((b) => b.onclick = () => placeByHand(RS.stops.find((x) => x.id === b.dataset.hand)));
  }

  async function runLookups(list) {
    const jobs = list.filter(Boolean);
    if (!jobs.length) return;
    const prog = byId("fpProg");
    let fixed = 0, still = 0;
    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      if (prog) prog.innerHTML = `<div class="fp-prog">Looking up ${i + 1} of ${jobs.length} — ${J().esc(j.person || j.address || "")}</div>`;
      const pt = await geocode(j.address);
      if (pt) {
        j.lat = pt.lat; j.lng = pt.lng; j.geo_quality = pt.quality; j.geoApprox = pt.approx;
        await updateJob(j.id, { lat: pt.lat, lng: pt.lng, geo_quality: pt.quality });
        if (pt.quality === "rough") still++; else fixed++;
      } else still++;
      const rowEl = document.querySelector(`[data-fp="${j.id}"]`);
      if (rowEl) {
        const ok = j.geo_quality === "exact" || j.geo_quality === "street";
        rowEl.classList.toggle("ok", ok);
        const w = rowEl.querySelector(".fp-why");
        if (w) w.textContent = ok
          ? (j.geo_quality === "exact" ? "✓ found the door" : "✓ found the street")
          : "still can't find it — place it by hand";
      }
    }
    if (prog) prog.innerHTML = `<div class="fp-prog done">${fixed} pinned properly${still ? ` · ${still} still need placing by hand` : ""}</div>`;
    J().toast(`${fixed} pin${fixed === 1 ? "" : "s"} fixed${still ? ` · ${still} to place by hand` : ""}`);
  }

  // Drop the pin yourself. One tap on the map, and it's saved as exact.
  function placeByHand(j) {
    if (!j) return;
    const { esc } = J();
    const back = byId("sheetBack");
    PIN.job = j; PIN.at = null;
    back.innerHTML = `<div class="sheet fixpins" role="dialog" aria-modal="true">
      <h2>Place this pin</h2>
      <div class="fp-head"><b>${esc(j.person || "(no name)")}</b><br>${esc(j.address || "")}</div>
      <p class="muted small">Zoom in and tap the door. Pinch to zoom. This is saved as the real spot and the lookup will never overwrite it.</p>
      <div id="pinMap" class="pin-map"></div>
      <p class="fp-chosen" id="pinAt">Nothing picked yet</p>
      <div class="sheet-btns">
        <button class="btn ghost" id="pinCancel">Go back</button>
        <button class="btn go" id="pinSave" disabled>Save this spot</button>
      </div>
    </div>`;
    byId("pinCancel").onclick = () => { if (PIN.map) { PIN.map.remove(); PIN.map = null; } drawFixPins(); };
    const startAt = j.lat != null ? [j.lat, j.lng] : [HOME_FALLBACK.lat, HOME_FALLBACK.lng];
    if (!window.L) { byId("pinMap").innerHTML = `<p class="muted center">Map couldn't load.</p>`; return; }
    setTimeout(() => {
      if (PIN.map) { PIN.map.remove(); PIN.map = null; }
      const map = L.map("pinMap", { zoomControl: true }).setView(startAt, j.lat != null ? 15 : 12);
      PIN.map = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, className: "soft-tiles",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
      let marker = null;
      map.on("click", (e) => {
        PIN.at = { lat: e.latlng.lat, lng: e.latlng.lng };
        if (marker) map.removeLayer(marker);
        marker = L.marker([PIN.at.lat, PIN.at.lng], {
          icon: L.divIcon({ className: "pin ping", html: `<i></i><span>HERE</span>`, iconSize: [64, 64], iconAnchor: [32, 32] })
        }).addTo(map);
        byId("pinAt").textContent = `Picked: ${PIN.at.lat.toFixed(5)}, ${PIN.at.lng.toFixed(5)}`;
        byId("pinSave").disabled = false;
      });
      setTimeout(() => map.invalidateSize(), 200);
    }, 60);
    byId("pinSave").onclick = async () => {
      if (!PIN.at) return;
      const ok = await updateJob(j.id, { lat: PIN.at.lat, lng: PIN.at.lng, geo_quality: "exact" });
      if (!ok) return;
      j.lat = PIN.at.lat; j.lng = PIN.at.lng; j.geo_quality = "exact"; j.geoApprox = false;
      if (PIN.map) { PIN.map.remove(); PIN.map = null; }
      J().toast("Pin saved — that's the real spot now");
      drawFixPins();
    };
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
        missing[i].lat = pt.lat; missing[i].lng = pt.lng;
        missing[i].geoApprox = pt.approx; missing[i].geo_quality = pt.quality;
        await updateJob(missing[i].id, { lat: pt.lat, lng: pt.lng, geo_quality: pt.quality });
      } else missing[i].geoFail = true;
      if (i < missing.length - 1) await sleep(1100);
    }
    drawMap(); drawStops();
    J().toast(found ? `${found} more stop${found === 1 ? "" : "s"} on the map` : "Couldn't place those — check the addresses");
  }

  // Postings and business serves arrive in clusters and you'd rather clear a
  // whole cluster than hop between them. These only change what's SHOWN — the
  // drive order, the paper numbers and the route itself are untouched.
  // A run is a separate drive, not a filter. 15 postings mixed into 30 personal
  // serves is what sent her up and down the county. Pick a run and it becomes
  // today's route outright: the order, the paper numbers, the map, the miles and
  // the whole list are that run only. The rest sit parked until you switch back.
  const isPost = (j) => /day\s*post/i.test(j.job_type || "") || /post/i.test(j.service || "");
  window.JES_LANE = {
    isPost,
    get: () => localStorage.getItem("jes_lane") || "all",
    set: (v) => localStorage.setItem("jes_lane", v)
  };
  const STOP_FILTERS = [
    { id: "all",  label: "Everything",        short: "everything", test: () => true },
    { id: "post", label: "📌 Postings",      short: "postings",   test: isPost },
    { id: "serve",label: "🚪 Personal serves", short: "personal serves", test: (j) => !isPost(j) && !j.is_business },
    { id: "biz",  label: "🏢 Business",      short: "business serves", test: (j) => !!j.is_business },
    { id: "rush", label: "⚡ Rush",            short: "rush jobs",  test: (j) => j.service === "Rush" },
    { id: "due",  label: "⏰ Due soon",        short: "jobs due",   test: (j) => { const d = daysLeft(j); return d != null && d <= 1; } },
    { id: "again",label: "🔁 Re-tries",        short: "re-tries",   test: (j) => (j.attempt_count || 0) > 0 },
    { id: "rough",label: "📍 Unconfirmed pins", short: "unconfirmed pins", test: (j) => j.lat == null || j.geo_quality === "rough" || !j.geo_quality }
  ];
  const stopFilter = () => STOP_FILTERS.find((f) => f.id === RS.filter) || STOP_FILTERS[0];
  // Narrow the day's stops down to the run you're actually driving.
  function applyRun() {
    RS.pool = RS.pool || RS.stops;
    RS.stops = RS.pool.filter(stopFilter().test);
    if (RS.open && !RS.stops.some((x) => x.id === RS.open)) RS.open = null;
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
    const f = stopFilter();
    const pool = RS.pool || RS.stops;
    const shown = RS.stops.map((j, i) => ({ j, i }));
    const chips = `<div class="stop-filters" id="rFilter">${STOP_FILTERS.map((x) => {
      const n = pool.filter(x.test).length;
      return `<button class="sf-chip ${x.id === RS.filter ? "on" : ""} ${n ? "" : "empty"}" data-f="${x.id}">${x.label} <b>${n}</b></button>`;
    }).join("")}</div>` +
      (RS.filter !== "all"
        ? `<p class="sf-note run"><b>You're driving the ${esc(f.short)} — ${RS.stops.length} stop${RS.stops.length === 1 ? "" : "s"}.</b>
            The other ${pool.length - RS.stops.length} job${pool.length - RS.stops.length === 1 ? " is" : "s are"} parked, not lost — tap <b>Everything</b> to bring them back.
            Re-sort now and it plans this run on its own.${RS.filter === "biz" ? `<br><b>${businessHoursNow() ? "You're inside registered-agent hours right now (10–12, 2–4)." : "It's outside registered-agent hours (10–12, 2–4) — these won't take."}</b>` : ""}</p>`
        : "");
    if (!shown.length) {
      box.innerHTML = chips + `<div class="card center"><b>Nothing in that run today.</b><p class="muted">Tap <b>Everything</b> to see the whole day again.</p></div>`;
      wireFilter();
      return;
    }
    // Where the fresh jobs stop and the re-tries begin, so the list says out
    // loud what the order is doing.
    let bandDone = false;
    box.innerHTML = chips + shown.map(({ j, i }, n) => {
      const first = RS.hold ? false : (RS.open ? j.id === RS.open : i === 0);
      const no = stopNo(j, i);
      const moved = no !== i + 1;
      let band = "";
      if (RS.retry === "last" && !bandDone && isRetry(j) && n > 0 && !isRetry(shown[n - 1].j)) {
        bandDone = true;
        const left = shown.length - n;
        band = `<div class="retry-band">🔁 ${left} re-tr${left === 1 ? "y" : "ies"} from here down — already knocked on once, saved for last</div>`;
      }
      return band + `
      <div class="stop ${first ? "current" : ""} ${dueClass(j)}">
        <div class="stop-top ${first ? "" : "tap-open"}" ${first ? "" : `data-open-stop="${j.id}"`} ${first ? "" : 'role="button" tabindex="0"'}>
          <span class="stop-num">${no}</span>
          <div class="draft-text">
            <div class="draft-name">${esc(j.person || "(no name yet)")}${j.job_no ? ` <span class="jobno">#${esc(j.job_no)}</span>` : ""} ${j.service === "Rush" ? `<span class="rush">Rush</span>` : ""}</div>
            <div class="draft-addr">${esc(j.address)}</div>
            ${first ? `<div class="next-label">${RS.open && i !== 0 ? "OPEN NOW" : RS.started ? "NEXT STOP" : "FIRST STOP"} · paper #${no}${moved ? ` · ${i + 1}${i === 0 ? "st" : i === 1 ? "nd" : i === 2 ? "rd" : "th"} in the drive` : ` of ${RS.stops.length}`}</div>`
              : `<div class="tap-hint">Tap to open this one</div>`}
            ${(() => {
              const r = isRetry(j) ? `<span class="flag-chip again">🔁 Re-try · ${j.attempt_count} ${j.attempt_count === 1 ? "knock" : "knocks"} already</span>` : "";
              const c = flagChips(j);
              return (r || c) ? `<div class="chip-row">${r}${r && c ? " " : ""}${c}</div>` : "";
            })()}
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
          <div class="row-gap skip-row">
            <button class="btn ghost thin grow" data-skip="later" data-id="${j.id}">⤓ Skip — later today</button>
            <button class="btn ghost thin grow" data-skip="off" data-id="${j.id}">📅 Skip — not today</button>
          </div>
          <p class="skip-note">Skipping never logs an attempt. Your 5 tries stay untouched.</p>
        </div>
        ${nextUpHtml()}` : `
        <div class="row-gap small-actions">
          <a class="btn ghost thin grow" href="https://maps.apple.com/?daddr=${encodeURIComponent(j.address)}&dirflg=d" target="_blank" rel="noopener">Apple Maps</a>
          <button class="btn ghost thin" data-edit="${j.id}">Edit</button>
        </div>`}
      </div>`;
    }).join("");
    wireFilter();
    // Driving past a job isn't an attempt. Logging a false one burns a try and
    // puts something in the record that never happened, so skipping leaves the
    // attempt count exactly where it was.
    box.querySelectorAll("[data-skip]").forEach((b) => b.onclick = async () => {
      if (RS.busy) return;
      const j = RS.stops.find((x) => x.id === b.dataset.id);
      if (!j) return;
      const when = new Date().toLocaleDateString([], { month: "short", day: "numeric" });
      if (b.dataset.skip === "later") {
        const i = RS.stops.indexOf(j);
        RS.stops.splice(i, 1); RS.stops.push(j);
        RS.open = null;
        await saveOrder();
        drawStops(); drawMap(); drawZipLedger();
        J().toast("Moved to the end of today's run — paper #" + (j.lineup_no || "") );
        return;
      }
      const note = (j.notes ? j.notes + "\n" : "") + `Skipped ${when} — drove past, no attempt made.`;
      if (!(await updateJob(j.id, { on_today: false, route_order: null, notes: note }))) return;
      j.notes = note; j.on_today = false;
      RS.stops = RS.stops.filter((x) => x.id !== j.id);
      RS.open = null;
      await saveOrder();
      drawStops(); drawMap(); drawZipLedger();
      J().refreshBadges && J().refreshBadges();
      J().toast("Off today's route — back in Ready to route, no attempt logged");
    });
    box.querySelectorAll("[data-open-stop]").forEach((el) => {
      const open = () => {
        RS.hold = false; RS.open = el.dataset.openStop; drawStops(); drawMap();
        const c = box.querySelector(".stop.current");
        if (c) c.scrollIntoView({ block: "start", behavior: "smooth" });
      };
      el.onclick = (e) => { if (e.target.closest(".move")) return; open(); };
      el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    });
    box.querySelectorAll("[data-top]").forEach((b) => b.onclick = () => toTop(RS.stops[Number(b.dataset.top)] && RS.stops[Number(b.dataset.top)].id));
    box.querySelectorAll("[data-up]").forEach((b) => b.onclick = () => move(Number(b.dataset.up), -1));
    box.querySelectorAll("[data-down]").forEach((b) => b.onclick = () => move(Number(b.dataset.down), 1));
    box.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => openJob(RS.stops.find((j) => j.id === b.dataset.edit), drawRoute));
    box.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => {
      if (RS.busy) return;                       // already saving \u2014 ignore the second tap
      RS.busy = true;
      box.querySelectorAll("[data-act],[data-skip]").forEach((x) => { x.disabled = true; });
      b.textContent = "Saving\u2026";
      Promise.resolve(act(b.dataset.act, RS.stops.find((j) => j.id === b.dataset.id)))
        .catch((e) => { J().toast("Something went wrong \u2014 nothing was changed"); })
        .then(() => { RS.busy = false; });
    });
    drawStrip(); drawNextUp();
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
  // A retry is anything you've already knocked on at least once
  const isRetry = (j) => (j.attempt_count || 0) > 0;
  // A pin you can drive to. A "rough" pin is the middle of a ZIP code — it is
  // not a place, and letting one into the gas sort is what sent her across the
  // county and back. Unknown quality means it was found by the old lookup and
  // has never been checked, so it isn't trusted either.
  const pinOK = (j) => j.lat != null && (j.geo_quality === "exact" || j.geo_quality === "street");
  const pinBad = (j) => j.lat == null || j.geo_quality === "rough" || !j.geo_quality;
  async function optimize(opts) {
    const quiet = opts && opts.quiet;
    // ONLY real pins get to decide the drive. Anything rough or unchecked is
    // parked at the end and called out, instead of quietly dragging the route
    // across the county to the middle of a ZIP code.
    const withPts = RS.stops.filter(pinOK);
    const unsure = RS.stops.filter((j) => !pinOK(j));
    if (withPts.length < 2) {
      if (!quiet) J().toast(unsure.length
        ? `Can't plan a drive \u2014 ${unsure.length} of ${RS.stops.length} stops have no confirmed pin. Tap \u201cFix the pins\u201d first.`
        : "Need at least 2 stops on the map");
      if (RS.start === "here") RS.here = await getHere();
      return;
    }
    const start = (opts && opts.from) || await homePoint();
    let ordered, held = 0;
    if (RS.retry === "last") {
      // Fresh jobs get the whole drive first. Retries are then ordered among
      // themselves, starting from wherever the fresh run ended, so they're
      // still a sensible loop — just a loop you do afterward.
      const fresh = withPts.filter((j) => !isRetry(j));
      const again = withPts.filter(isRetry);
      held = again.length;
      if (!fresh.length || !again.length) ordered = bestOrder(start, withPts);
      else {
        const a = bestOrder(start, fresh);
        const b = bestOrder(a[a.length - 1], again);
        ordered = a.concat(b);
      }
    } else ordered = bestOrder(start, withPts);
    RS.stops = ordered.concat(unsure);
    await saveOrder();
    await numberPapers(true);      // fresh run = a fresh set of sticky notes
    drawStops(); drawMap(); drawZipLedger(); drawRetryNote(); drawStrip(); drawNextUp();
    const total = ordered.reduce((s, p, i, arr) => s + roadMiles(i ? arr[i - 1] : start, p), 0);
    if (!quiet) J().toast(((opts && opts.label) || "Order set")
      + (unsure.length ? ` \u00b7 ${unsure.length} unconfirmed pin${unsure.length === 1 ? "" : "s"} parked at the end` : "")
      + ` · papers renumbered 1 to ${RS.stops.length} · about ${total.toFixed(1)} miles of driving`
      + (held ? ` · ${held} retr${held === 1 ? "y sits" : "ies sit"} at the end` : ""));
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
    RS.hold = true;              // no stop is open, so no Served button is on screen
    RS.open = null;
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
    byId("didNext").onclick = () => {
      RS.lastAction = null; box.innerHTML = "";
      RS.hold = false;                       // now, and only now, the next stop opens
      drawStops();
      const card = byId("rStops") && byId("rStops").querySelector(".stop.current");
      if (card) card.scrollIntoView({ block: "center", behavior: "smooth" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    };
    byId("didUndo").onclick = async () => {
      const { job: j, before } = RS.lastAction;
      await updateJob(j.id, { status: before.status, attempt_count: before.attempt_count, done_at: before.done_at,
        on_today: true, in_attempts: before.in_attempts, sheet_id: before.sheet_id, outcome: before.outcome, ns_reason: before.ns_reason });
      const { data } = await J().db.from("jes_attempts").select("id").eq("job_id", j.id).order("at", { ascending: false }).limit(1);
      if (data && data[0]) await J().db.from("jes_attempts").delete().eq("id", data[0].id);
      Object.assign(j, before);
      RS.stops = [j].concat(RS.stops);
      RS.lastAction = null; box.innerHTML = "";
      RS.hold = false;
      await saveOrder(); drawStops(); drawMap();
      J().toast("Undone — back on the route");
    };
  }

  function wireFilter() {
    const box = byId("rFilter");
    if (!box) return;
    box.onclick = (e) => {
      const b = e.target.closest("[data-f]");
      if (!b) return;
      RS.filter = b.dataset.f;
      RS.open = null; RS.hold = false;
      localStorage.setItem("jes_route_run", RS.filter);
      applyRun();
      drawStops(); drawMap(); drawZipLedger(); drawRetryNote(); drawStrip(); drawNextUp();
      const f = stopFilter();
      J().toast(RS.filter === "all"
        ? `Back to the whole day \u2014 ${RS.stops.length} stops`
        : `Driving the ${f.short} \u2014 ${RS.stops.length} stop${RS.stops.length === 1 ? "" : "s"} \u00b7 tap Re-sort to plan it`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  }

  // Where does this job cost the least extra driving? Checks every gap in the
  // run, including before stop 1 and after the last one, and returns the
  // cheapest slot plus what the detour actually costs.
  function bestSlot(j) {
    if (j.lat == null) return { i: RS.stops.length, cost: null };
    const from = RS.here || RS.homePt || null;
    let best = RS.stops.length, bestCost = Infinity;
    for (let i = 0; i <= RS.stops.length; i++) {
      const prev = i === 0 ? from : RS.stops[i - 1];
      const next = RS.stops[i] || null;
      const a = prev && prev.lat != null ? roadMiles(prev, j) : 0;
      const b = next && next.lat != null ? roadMiles(j, next) : 0;
      const skip = prev && next && prev.lat != null && next.lat != null ? roadMiles(prev, next) : 0;
      const cost = a + b - skip;
      if (cost < bestCost) { bestCost = cost; best = i; }
    }
    return { i: best, cost: bestCost };
  }

  // Drop a job into today's run at the spot that costs the least driving,
  // instead of sticking it on the end and making you re-sort everything.
  async function fitIntoRoute(id) {
    if (RS.busy) return;
    const j = RS.all.find((x) => x.id === id);
    if (!j) return;
    RS.busy = true;
    try {
      if (j.lat == null) {
        J().toast("Looking up the address\u2026");
        const pt = await geocode(j.address);
        if (pt) { j.lat = pt.lat; j.lng = pt.lng; j.geoApprox = pt.approx; j.geo_quality = pt.quality;
          await updateJob(j.id, { lat: pt.lat, lng: pt.lng, geo_quality: pt.quality }); }
      }
      const slot = bestSlot(j);
      j.on_today = true;
      j.lineup_no = nextFreeNo();
      if (!(await updateJob(j.id, { on_today: true, route_order: slot.i, lineup_no: j.lineup_no }))) return;
      RS.pool = (RS.pool || []).slice();
      RS.pool.splice(Math.min(slot.i, RS.pool.length), 0, j);
      RS.stops.splice(Math.min(slot.i, RS.stops.length), 0, j);
      await saveOrder();
      drawStops(); drawMap(); drawZipLedger(); drawStrip(); drawNextUp(); drawAddMore();
      const where = slot.i === 0 ? "as your next stop" : `after stop ${slot.i}`;
      J().toast(`${j.person || "Job"} fitted in ${where} \u00b7 paper #${j.lineup_no}`
        + (slot.cost != null ? ` \u00b7 adds about ${slot.cost.toFixed(1)} mi` : ""));
    } finally { RS.busy = false; }
  }

  function drawAddMore() {
    const { esc } = J();
    const pool = RS.all.filter((j) => j.status === "Active" && !j.on_today && !j.in_attempts && (j.county === RS.county || !j.county) && !needsAddress(j) && !waitingPapers(j));
    byId("rAddList").innerHTML = pool.length ? pool.map((j) => `
      <div class="add-line">
        <div class="draft-text"><div class="draft-name">${esc(j.person || "(no name yet)")}${j.job_no ? ` <span class="jobno">#${esc(j.job_no)}</span>` : ""}</div><div class="draft-addr">${esc(j.address)}</div></div>
        <div class="add-btns">
          <button class="today-btn fit" data-fit="${j.id}">✧ Fit into today's drive</button>
          <button class="today-btn" data-add="${j.id}">+ Add to the end</button>
        </div>
      </div>`).join("") : `<p class="muted small">No other active ${esc(RS.county)} jobs.</p>`;
    byId("rAddList").querySelectorAll("[data-fit]").forEach((b) => b.onclick = () => fitIntoRoute(b.dataset.fit));
    byId("rAddList").querySelectorAll("[data-add]").forEach((b) => b.onclick = async () => {
      if (await updateJob(b.dataset.add, { on_today: true, route_order: null })) { J().toast("Added at the end — tap Re-sort to put it in gas order"); loadStops(); }
    });
  }

  // ---------- Lineup: the numbered list for sticky-noting the papers ----------
  // The paper number is frozen to the drive order, but you sort the physical
  // stack by ZIP (that's how Gene hands them over) or by client. So the list
  // can be grouped either way while the numbers stay the numbers.
  const LU = { sort: (() => { try { return localStorage.getItem("jes_lu_sort") || "zip"; } catch (e) { return "zip"; } })() };
  const zipOf = (j) => ((j.address || "").match(/\b(\d{5})(?:-\d{4})?\b/) || [])[1] || "No ZIP";
  const bandOf = (j) => LU.sort === "client" ? (j.client || "No client")
    : LU.sort === "zip" ? zipOf(j) : "In driving order";
  function lineupOrder() {
    const withNo = RS.stops.map((j, i) => ({ j, no: stopNo(j, i), i }));
    if (LU.sort === "drive") return withNo;
    return withNo.slice().sort((a, b) =>
      bandOf(a.j).localeCompare(bandOf(b.j)) || a.no - b.no);
  }

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
    // You work the paper stack, not the drive order — so the list is grouped the
    // way the papers are: by ZIP, or by client when you're sorting for a client.
    const rows = () => {
      const list = lineupOrder();
      let band = "";
      return list.map(({ j, no }) => {
        const b = bandOf(j);
        const head = b !== band
          ? `<div class="lu-band">${esc(b)}<span>${list.filter((x) => bandOf(x.j) === b).length} job${list.filter((x) => bandOf(x.j) === b).length === 1 ? "" : "s"}</span></div>` : "";
        band = b;
        return head + `
        <div class="lu-row ${done.has(j.id) ? "on" : ""} ${dueClass(j)}" data-lu="${j.id}" role="button" tabindex="0"
             aria-label="Paper number ${no}, ${esc(j.person || "no name")}">
          <div class="lu-num">${no}</div>
          <div class="lu-text">
            <div class="lu-name">${esc(j.person || "(no name)")}</div>
            <div class="lu-sub">${esc(j.address || "")}</div>
            <div class="lu-sub2">${esc(j.client || "")}${j.job_no ? " · #" + esc(j.job_no) : ""}${dueChip(j)}${j.has_papers === false ? ` <span class="lu-due late">NO PAPERS</span>` : ""}</div>
          </div>
          <div class="lu-tick">${done.has(j.id) ? "✓" : ""}</div>
        </div>`;
      }).join("");
    };

    const paint = () => {
      const n = RS.stops.length, got = RS.stops.filter((j) => done.has(j.id)).length;
      back.innerHTML = `<div class="sheet lineup" role="dialog" aria-modal="true" aria-labelledby="luT">
        <div class="lu-head">
          <h2 id="luT">Lineup · ${esc(RS.county)}</h2>
          <span class="lu-count ${got === n ? "all" : ""}">${got} of ${n} numbered</span>
        </div>
        <div class="seg lu-seg" id="luSort">
          <button class="${LU.sort === "zip" ? "on" : ""}" data-s="zip">By ZIP</button>
          <button class="${LU.sort === "client" ? "on" : ""}" data-s="client">By client</button>
          <button class="${LU.sort === "drive" ? "on" : ""}" data-s="drive">Drive order</button>
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
      byId("luSort").onclick = (e) => {
        const b = e.target.closest("[data-s]");
        if (b) { LU.sort = b.dataset.s; try { localStorage.setItem("jes_lu_sort", LU.sort); } catch (err) {} paint(); }
      };
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
      <div class="print-head"><b>Lineup · ${esc(RS.county)} County</b><span>${esc(d)} · ${RS.stops.length} stops · sorted by ${LU.sort === "client" ? "client" : LU.sort === "zip" ? "ZIP code" : "driving order"}</span></div>
      <table class="lu-print">
        <thead><tr><th class="lup-n">#</th><th>NAME</th><th>ADDRESS</th><th class="lup-c">CLIENT · JOB #</th><th class="lup-x">✓</th></tr></thead>
        <tbody>${(() => {
          const list = lineupOrder();
          let band = "";
          return list.map(({ j, no }) => {
            const b = bandOf(j);
            const n = list.filter((x) => bandOf(x.j) === b).length;
            const head = b !== band
              ? `<tr><td colspan="5" class="lup-group"><b>${esc(b)}</b> — ${n} job${n === 1 ? "" : "s"}</td></tr>` : "";
            band = b;
            return head + `<tr>
              <td class="lup-n">${no}</td>
              <td><b>${esc(j.person || "(no name)")}</b></td>
              <td>${esc(j.address || "")}</td>
              <td class="lup-c">${esc(j.client || "")}${j.job_no ? " · #" + esc(j.job_no) : ""}</td>
              <td class="lup-x"></td>
            </tr>`;
          }).join("");
        })()}</tbody>
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
    const low = (localStorage.getItem("jes_route_retry") || "last") === "last";
    document.getElementById("attFoot").innerHTML = `
      <p class="muted small">Closest to 5 attempts sits on top — those are nearly paid, you just have to go back.</p>
      <button class="btn go wide" id="attGo" ${n ? "" : "disabled"}>${n ? `Add ${n} to tomorrow · ${J().esc(AS.county)}` : "Tick the ones you'll go back for"}</button>
      <p class="muted small">${low
        ? `These go on the route <b>behind the jobs you haven't knocked on yet</b>, so a re-sort from home can't push the fresh ones to the end of the day. You'll still get the "you're passing it" prompt if you drive near one. Change that under <b>Re-tries</b> on the Route.`
        : `<b>Heads up:</b> re-tries are currently mixed into the gas order. Starting from home, that usually puts them first. Switch <b>Re-tries</b> on the Route to "Save for the end" if you'd rather do the fresh jobs first.`}</p>`;
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
