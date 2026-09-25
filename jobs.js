// J EMPIRE SERVER — jobs.js (version 11: warnings on top, smaller cards, number pads)
(function () {
  "use strict";
  const J = () => window.JES;
  const P = () => window.JES_PARSE;
  const $ = (s) => document.querySelector(s);
  const byId = (id) => document.getElementById(id);

  const PAPER_CLIENTS = ["ProVest", "Userve"];
  const waitingPapers = (j) => j.status === "Active" && PAPER_CLIENTS.includes(j.client) && j.has_papers === false;
  function flagChips(j) {
    const out = [];
    if (j.service === "Rush") out.push(`<span class="flag-chip rush">⚡ Rush</span>`);
    if (j.is_foreclosure) out.push(`<span class="flag-chip fore">📚 Foreclosure${(j.packets || 1) > 1 ? " ×" + j.packets : ""}</span>`);
    if (j.is_business) out.push(`<span class="flag-chip biz">🏢 Business · 10–12 / 2–4</span>`);
    if (waitingPapers(j)) out.push(`<span class="flag-chip paper">📄 Waiting on papers</span>`);
    return out.join(" ");
  }
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
    { id: "papers", short: "Papers", title: "Waiting on papers", sub: "From Jean · can't route yet",    test: (j) => waitingPapers(j) },
    { id: "ready",  short: "Ready",  title: "Ready to route",    sub: "Tap + Today to add",             test: (j) => j.status === "Active" && !waitingPapers(j) && !needsAddress(j) && !j.on_today },
    { id: "today",  short: "Today",  title: "On today's route",  sub: "Shown on Route",                 test: (j) => j.status === "Active" && !waitingPapers(j) && !needsAddress(j) && j.on_today },
    { id: "hold",   short: "Hold",   title: "On hold",           sub: "Paused or has a problem",        test: (j) => j.status === "On Hold" }
  ];
  const FILTER_TO_COL = { "Needs address": "fix", "Papers": "papers", "Active": "ready", "Today": "today", "On Hold": "hold" };
  const JS = { col: "ready", hcol: "Ody's", view: "working", county: "All", q: "", jobs: [], invs: {} };

  async function drawJobs(opts) {
    if (opts && opts.filter && FILTER_TO_COL[opts.filter]) JS.col = FILTER_TO_COL[opts.filter];
    const { esc } = J();
    byId("screen").innerHTML = `
      <section class="jobs">
        <div class="jobs-bar">
          <h1>Jobs</h1>
          <div class="seg view-seg" id="jView">${[["working", "Working"], ["history", "History"]].map(([v, t]) => `<button class="${v === JS.view ? "on" : ""}" data-v="${v}">${t}</button>`).join("")}</div>
          <label class="sr" for="jq">Search jobs</label>
          <input id="jq" class="search" type="search" placeholder="Search name, job #, address" value="${esc(JS.q)}">
          <div class="seg" id="jCounty">${["All", "Osceola", "Orange"].map((c) => `<button class="${c === JS.county ? "on" : ""}" data-c="${c}">${c}</button>`).join("")}</div>
        </div>
        <div class="chips phone-only" id="jColPick"></div>
        <div id="jBody"><p class="muted">Loading…</p></div>
      </section>
      <div class="sheet-back" id="sheetBack" hidden></div>`;
    byId("jCounty").onclick = (e) => { const b = e.target.closest("[data-c]"); if (b) { JS.county = b.dataset.c; drawJobs(); } };
    byId("jq").oninput = (e) => { JS.q = e.target.value; drawList(); };
    byId("jView").onclick = (e) => { const b = e.target.closest("[data-v]"); if (b) { JS.view = b.dataset.v; drawJobs(); } };
    JS.jobs = await fetchJobs();
    const { data: invs } = await J().db.from("jes_invoices").select("id,grp,status,paid_on,period_start,period_end");
    JS.invs = {}; (invs || []).forEach((i) => { JS.invs[i.id] = i; });
    drawList();
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
          ${wait ? `<button class="today-btn paper-btn" data-gotpaper="${j.id}">📄 Got papers</button>` : ""}
          ${j.status === "Active" && !wait && PAPER_CLIENTS.includes(j.client) ? `<button class="mini-flag" data-nopaper="${j.id}" aria-label="Mark waiting on papers">📄</button>` : ""}
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

  const H_CLIENTS = ["ProVest", "Userve", "Ody's", "ABC Legal", "Private"];
  function moneyStatus(j) {
    const inv = j.invoice_id && JS.invs[j.invoice_id];
    if (inv && inv.status === "Paid") return { cls: "st-paid", t: "Paid ✓" + (inv.paid_on ? " " + fmtDate(inv.paid_on).slice(0, 5) : "") };
    if (inv) return { cls: "st-pending", t: "Billed · pending" };
    if (j.paid_upfront) return { cls: "st-paid", t: "Paid upfront" };
    if (isDone(j) && j.client === "ABC Legal") return { cls: "st-paid", t: "Done · ABC pays in app" };
    if (isDone(j)) return { cls: "st-unbilled", t: "Done · NOT billed" };
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
    byId("jColPick").innerHTML = cols.map(({ c, jobs }) => `<button class="chip ${c === JS.hcol ? "on" : ""}" data-hcol="${esc(c)}">${esc(c === "ABC Legal" ? "ABC" : c)} (${jobs.length})</button>`).join("");
    byId("jColPick").onclick = (e) => { const b = e.target.closest("[data-hcol]"); if (b) { JS.hcol = b.dataset.hcol; drawList(); } };
    const monthOf = (j) => new Date(j.done_at || j.created_at).toLocaleDateString([], { month: "long", year: "numeric" });
    byId("jBody").innerHTML = `${q ? `<p class="muted small">Showing matches for “${esc(JS.q)}”.</p>` : ""}<div class="job-cols five">${cols.map(({ c, jobs }) => {
      let last = "";
      const total = jobs.reduce((a, j) => a + Number(j.price || 0), 0);
      return `<div class="job-col hist-col ${c === JS.hcol ? "phone-on" : ""}">
        <div class="col-head"><div><h2>${esc(c === "ABC Legal" ? "ABC" : c)}</h2><div class="col-sub">${jobs.length} job${jobs.length === 1 ? "" : "s"} · ${money(total)}</div></div></div>
        <div class="col-list">${jobs.length ? jobs.map((j) => { const m = monthOf(j); const head = m !== last ? `<div class="month-head">${esc(m)}</div>` : ""; last = m; return head + histCard(j); }).join("") : `<p class="muted small center">No jobs.</p>`}</div>
      </div>`;
    }).join("")}</div>`;
  }

  function drawList() {
    const { esc } = J();
    const q = JS.q.toLowerCase().trim();
    const byCounty = (j) => JS.county === "All" || j.county === JS.county || (!j.county && JS.county !== "All" && needsAddress(j));
    const dueRank = (j) => (j.due_date ? new Date(j.due_date).getTime() : 9e15);
    const sortJobs = (a, b) => (b.service === "Rush") - (a.service === "Rush") || dueRank(a) - dueRank(b);
    const body = byId("jBody");

    if (JS.view === "history") {
      drawHistory(q, byCounty);
    } else if (q) {
      // Searching in Working shows one list across everything, including finished jobs
      byId("jColPick").innerHTML = "";
      const hits = JS.jobs.filter((j) => byCounty(j) && [j.person, j.job_no, j.address, j.client].join(" ").toLowerCase().includes(q)).sort(sortJobs);
      body.innerHTML = `<p class="muted small">${hits.length} match${hits.length === 1 ? "" : "es"} for “${esc(JS.q)}”</p><div class="search-grid">${hits.map(jobCard).join("") || ""}</div>`;
    } else {
      const lists = COLS.map((c) => ({ c, jobs: JS.jobs.filter((j) => byCounty(j) && c.test(j)).sort(sortJobs) }));
      byId("jColPick").innerHTML = lists.map(({ c, jobs }) => `<button class="chip ${c.id === JS.col ? "on" : ""} ${c.id === "fix" && jobs.length ? "alert-chip" : ""}" data-col="${c.id}">${c.short} <b>${jobs.length}</b></button>`).join("");
      body.innerHTML = `<div class="job-cols five">${lists.map(({ c, jobs }) => `
        <div class="job-col col-${c.id} ${c.id === JS.col ? "phone-on" : ""}">
          <div class="col-head"><div><h2>${c.title}</h2><div class="col-sub">${c.sub}</div></div><span class="col-count">${jobs.length}</span></div>
          ${c.id === "papers" && jobs.length ? `<button class="btn go thin" data-pickup="1">📄 Got papers from Jean</button>` : ""}
          <div class="col-list ${jobs.length > 7 ? "two-up" : ""}">${jobs.length ? jobs.map(jobCard).join("") : `<p class="muted small center">Nothing here.</p>`}</div>
        </div>`).join("")}</div>
        <p class="muted small center">Finished and paid jobs are in <b>History</b> (switch at the top).</p>`;
      byId("jColPick").onclick = (e) => { const b = e.target.closest("[data-col]"); if (b) { JS.col = b.dataset.col; drawList(); } };
    }
    wireCards(body, drawList);
    body.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openJob(JS.jobs.find((j) => j.id === b.dataset.open), drawJobs));
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
          ${PAPER_CLIENTS.includes(j.client) ? `<label class="tgl"><input type="checkbox" id="g_has_papers" ${j.has_papers !== false ? "checked" : ""}><span>📄 I have the papers for this job</span></label>` : ""}
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
    map: null, stops: [], all: []
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
              <button class="btn ghost" id="rPrint">Print</button>
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
    byId("rCounty").onclick = (e) => {
      const b = e.target.closest("[data-c]"); if (!b) return;
      RS.county = b.dataset.c; localStorage.setItem("jes_route_county", RS.county); drawRoute();
    };
    byId("rStart").onclick = (e) => { const b = e.target.closest("[data-s]"); if (!b) return; RS.start = b.dataset.s; localStorage.setItem("jes_route_start", RS.start); byId("rStart").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); };
    byId("rBest").onclick = () => optimize();
    if (byId("rGo")) byId("rGo").onclick = startRoute;
    if (byId("rEnd")) byId("rEnd").onclick = endRoute;
    byId("rPrint").onclick = printRoute;
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
  function endRoute() {
    if (!confirm("End today's route? Stops you haven't done stay on today's list.")) return;
    localStorage.removeItem("jes_route_started");
    stopWatch(); drawRoute();
  }

  async function loadStops() {
    RS.all = await fetchJobs();
    const waitingToday = RS.all.filter((j) => j.on_today && waitingPapers(j) && j.county === RS.county).length;
    const today = RS.all.filter((j) => j.on_today && j.status === "Active" && !waitingPapers(j));
    const inCounty = today.filter((j) => j.county === RS.county);
    const noAddr = inCounty.filter(needsAddress);
    RS.stops = inCounty.filter((j) => !needsAddress(j))
      .sort((a, b) => (a.route_order ?? 999) - (b.route_order ?? 999) || (b.service === "Rush") - (a.service === "Rush"));
    const otherCounty = today.filter((j) => j.county && j.county !== RS.county).length;

    const msgs = [];
    const noPin = RS.stops.filter((j) => j.lat == null).length;
    if (noPin) msgs.push(`${noPin} stop${noPin > 1 ? "s have" : " has"} no map pin — open it and check the address.`);
    if (noAddr.length) msgs.push(`${noAddr.length} of today's jobs in ${RS.county} ${noAddr.length > 1 ? "are" : "is"} missing an address — fix in Jobs → Needs address.`);
    if (waitingToday) msgs.push(`${waitingToday} job${waitingToday > 1 ? "s are" : " is"} still waiting on papers from Jean, so ${waitingToday > 1 ? "they're" : "it's"} left off the route.`);
    if (otherCounty) msgs.push(`${otherCounty} of today's jobs ${otherCounty > 1 ? "are" : "is"} in the other county and not shown here.`);
    byId("rMsg").innerHTML = msgs.map((m) => `<div class="alert soft">${J().esc(m)}</div>`).join("");

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
    const pts = [];
    const seen = {};
    RS.stops.forEach((j, i) => {
      if (j.lat == null) return;
      const key = j.lat.toFixed(4) + "," + j.lng.toFixed(4);
      const n = (seen[key] = (seen[key] || 0) + 1);
      if (n > 1) { const a = (n - 1) * 1.1; j = Object.assign({}, j, { lat: j.lat + 0.00035 * Math.cos(a), lng: j.lng + 0.00035 * Math.sin(a) }); }
      const icon = L.divIcon({ className: "pin", html: `<span>${i + 1}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] });
      L.marker([j.lat, j.lng], { icon }).addTo(map).bindPopup(`<b>${i + 1}. ${J().esc(j.person || "")}</b><br>${J().esc(j.address)}`);
      pts.push([j.lat, j.lng]);
    });
    if (pts.length > 1) L.polyline(pts, { color: "#1F2A44", weight: 3, dashArray: "6 6" }).addTo(map);
    if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
    else map.setView([HOME_FALLBACK.lat, HOME_FALLBACK.lng], 11);
    setTimeout(() => map.invalidateSize(), 200);
  }

  function drawStops() {
    const { esc } = J();
    const box = byId("rStops");
    if (!RS.stops.length) {
      box.innerHTML = `<div class="card center"><b>No stops for ${esc(RS.county)} today.</b><p class="muted">Tap "+ Today" on jobs in the Jobs tab, or use "Add more stops" below.</p></div>`;
      return;
    }
    box.innerHTML = RS.stops.map((j, i) => {
      const first = i === 0;
      return `
      <div class="stop ${first ? "current" : ""}">
        <div class="stop-top">
          <span class="stop-num">${i + 1}</span>
          <div class="draft-text">
            <div class="draft-name">${esc(j.person || "(no name yet)")}${j.job_no ? ` <span class="jobno">#${esc(j.job_no)}</span>` : ""} ${j.service === "Rush" ? `<span class="rush">Rush</span>` : ""}</div>
            <div class="draft-addr">${esc(j.address)}</div>
            ${first ? `<div class="next-label">${RS.started ? "NEXT STOP" : "FIRST STOP"} · ${i + 1} of ${RS.stops.length}</div>` : ""}
            ${flagChips(j) ? `<div class="chip-row">${flagChips(j)}</div>` : ""}
            ${j.is_business && !businessHoursNow() ? `<div class="biz-warn">🏢 Registered agent hours are 10–12 and 2–4 — it's outside those hours now</div>` : ""}
            <div class="draft-later">${esc(j.client || "")} · Attempt ${(j.attempt_count || 0) + 1} of 5${j.lat == null ? ` · <b class="bad">📍 No map pin — check address</b>` : j.geoApprox ? ` · <b class="bad">Pin is approximate</b>` : ""}</div>
          </div>
          <div class="move">
            <button class="icon-btn" data-up="${i}" aria-label="Move stop ${i + 1} up" ${i === 0 ? "disabled" : ""}>▲</button>
            <button class="icon-btn" data-down="${i}" aria-label="Move stop ${i + 1} down" ${i === RS.stops.length - 1 ? "disabled" : ""}>▼</button>
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
    box.querySelectorAll("[data-up]").forEach((b) => b.onclick = () => move(Number(b.dataset.up), -1));
    box.querySelectorAll("[data-down]").forEach((b) => b.onclick = () => move(Number(b.dataset.down), 1));
    box.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => openJob(RS.stops.find((j) => j.id === b.dataset.edit), drawRoute));
    box.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => act(b.dataset.act, RS.stops.find((j) => j.id === b.dataset.id)));
  }

  async function saveOrder() {
    await Promise.all(RS.stops.map((j, i) => (j.route_order = i, updateJob(j.id, { route_order: i }))));
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
    const rush = ordered.filter((j) => j.service === "Rush");
    const rest = ordered.filter((j) => j.service !== "Rush");
    RS.stops = rush.concat(rest, RS.stops.filter((j) => j.lat == null));
    drawStops(); drawMap(); await saveOrder();
    const total = RS.stops.filter((j) => j.lat != null).reduce((s, p, i, arr) => s + miles(i ? arr[i - 1] : start, p), 0);
    if (!quiet) J().toast(`Order set from ${RS.start === "here" && RS.here ? "where you are" : "home"} · about ${total.toFixed(1)} miles (straight-line)`);
  }

  async function act(kind, j) {
    const note = (byId("rNote") && byId("rNote").value.trim()) || "";
    const patch = {};
    if (kind === "Attempt") {
      patch.attempt_count = (j.attempt_count || 0) + 1;
      patch.on_today = false; patch.route_order = null;
      if (patch.attempt_count >= 5 && confirm("That's attempt 5. Mark this job Non-Serve Complete (done and billable)?")) {
        patch.status = "Non-Serve Complete"; patch.done_at = new Date().toISOString();
      }
    } else if (kind === "Served") {
      patch.status = "Served"; patch.done_at = new Date().toISOString(); patch.on_today = false; patch.route_order = null;
    } else {
      if ((j.attempt_count || 0) < 4 && !confirm(`Only ${j.attempt_count || 0} attempt(s) logged. Mark Non-Served anyway?`)) return;
      patch.status = "Non-Serve Complete"; patch.done_at = new Date().toISOString(); patch.on_today = false; patch.route_order = null;
      if (kind === "Non-Serve") patch.attempt_count = Math.max(5, (j.attempt_count || 0) + 1);
    }
    if (!(await updateJob(j.id, patch))) return;
    await logAttempt(j, kind === "Attempt" ? "Attempt" : kind === "Served" ? "Served" : "Non-Serve", note);
    RS.lastAction = { job: j, kind, before: { status: j.status, attempt_count: j.attempt_count || 0, done_at: j.done_at, on_today: true } };
    RS.stops = RS.stops.filter((x) => x.id !== j.id);
    if (RS.started && RS.stops.filter((x) => x.lat != null).length > 1) {
      const here = RS.here || await getHere() || (j.lat != null ? { lat: j.lat, lng: j.lng } : null);
      if (here) {
        const ordered = bestOrder(here, RS.stops.filter((x) => x.lat != null));
        RS.stops = ordered.filter((x) => x.service === "Rush").concat(ordered.filter((x) => x.service !== "Rush"), RS.stops.filter((x) => x.lat == null));
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
    const { job, kind } = RS.lastAction;
    const word = kind === "Served" ? "SERVED ✓" : kind === "Attempt" ? "ATTEMPT LOGGED" : "NON-SERVED ✓";
    const left = RS.stops.length;
    box.innerHTML = `<div class="did ${kind === "Served" ? "ok" : kind === "Attempt" ? "att" : "non"}">
      <div class="did-word">${word}</div>
      <div class="did-who">${esc(job.person || "")} ${esc(job.address || "")}</div>
      <div class="row-gap">
        <button class="btn go grow" id="didNext">${left ? `Next stop → (${left} left)` : "All stops done today 🎉"}</button>
        <button class="btn ghost" id="didUndo">Undo</button>
      </div>
    </div>`;
    byId("didNext").onclick = () => { RS.lastAction = null; box.innerHTML = ""; window.scrollTo({ top: 0, behavior: "smooth" }); };
    byId("didUndo").onclick = async () => {
      const { job: j, before } = RS.lastAction;
      await updateJob(j.id, { status: before.status, attempt_count: before.attempt_count, done_at: before.done_at, on_today: true });
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
    const pool = RS.all.filter((j) => j.status === "Active" && !j.on_today && j.county === RS.county && !needsAddress(j) && !waitingPapers(j));
    byId("rAddList").innerHTML = pool.length ? pool.map((j) => `
      <div class="add-line">
        <div class="draft-text"><div class="draft-name">${esc(j.person || "(no name yet)")}${j.job_no ? ` <span class="jobno">#${esc(j.job_no)}</span>` : ""}</div><div class="draft-addr">${esc(j.address)}</div></div>
        <button class="today-btn" data-add="${j.id}">+ Add</button>
      </div>`).join("") : `<p class="muted small">No other active ${esc(RS.county)} jobs.</p>`;
    byId("rAddList").querySelectorAll("[data-add]").forEach((b) => b.onclick = async () => {
      if (await updateJob(b.dataset.add, { on_today: true, route_order: null })) { J().toast("Added — tap Best order to re-sort"); loadStops(); }
    });
  }

  // ---------- one-page printed route (black ink) ----------
  function printRoute() {
    const { esc } = J();
    const d = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    byId("printSheet").innerHTML = `
      <div class="print-head"><b>Route · ${esc(RS.county)} County</b><span>${esc(d)} · ${RS.stops.length} stops</span></div>
      <div class="print-grid">${RS.stops.map((j, i) => `
        <div class="print-box">
          <div class="pb-top"><span class="pb-num">${i + 1}</span><span>${j.service === "Rush" ? `<span class="pb-rush">RUSH</span> ` : ""}${j.is_foreclosure ? `<span class="pb-rush">FORECL ×${j.packets || 1}</span> ` : ""}${j.is_business ? `<span class="pb-rush">BUS 10-12/2-4</span>` : ""}</span></div>
          <div class="pb-name">${esc(j.person || "(no name)")}</div>
          <div>${esc(j.client || "")}${j.job_no ? " · #" + esc(j.job_no) : ""}</div>
          <div>${esc(j.address)}</div>
          <div>Attempt ${(j.attempt_count || 0) + 1} of 5${j.due_date ? " · Due " + esc(fmtDate(j.due_date)) : ""}</div>
          <div class="pb-lines">☐ Served ☐ Attempt ☐ Non-serve<br>Time: ______ Notes: ______________</div>
        </div>`).join("")}</div>`;
    window.print();
  }

  window.JES_JOBS = { drawJobs, drawRoute, openJob };
})();
