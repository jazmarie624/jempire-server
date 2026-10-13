// J EMPIRE SERVER — office.js (version 29: add a job straight onto a sheet, and delete a line — every stop behind a day’s miles, and a real mileage log —  miles day by day, with a spreadsheet: address on every sheet line —  names and job numbers typed straight on the sheet —  warns about blank names and job numbers before closing —  paid button reports failures —  J Empire invoice for everyone but Jean's two —  take a line back off a sheet —  Sheets, payment trackers, Jean's printed form)
// One open sheet per company. Served / Non-Served drops a line on it by itself.
// Close a sheet to freeze it, print it, and open a line in that company's tracker.
(function () {
  "use strict";
  window.JES_VER = Object.assign(window.JES_VER || {}, { office: 29 });
  const J = () => window.JES;
  const byId = (id) => document.getElementById(id);
  const O = { rates: [], sheets: [], jobs: [], goal: 500, rate: 0.7, showMiles: false, openDay: null, stops: [] };

  const todayISO = () => new Date().toISOString().slice(0, 10);
  const num = (v) => (v == null || v === "" ? null : Number(v));
  function fmtDay(d) {
    if (!d) return "";
    const s = String(d).slice(0, 10);
    return s.slice(5, 7).replace(/^0/, "") + "/" + s.slice(8, 10);
  }
  function weekStart() {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() - 4 + 7) % 7));
    return d;
  }

  // =====================================================================
  // Shared with the Route: find or start this company's open sheet
  // =====================================================================
  async function sheetFor(company) {
    const db = J().db;
    if (!company) return null;
    const got = await db.from("jes_sheets").select("*").eq("company", company).eq("status", "Open").limit(1);
    if (got.data && got.data[0]) return got.data[0];
    const ins = await db.from("jes_sheets").insert({ company, status: "Open", opened_on: todayISO() }).select().single();
    if (ins.error) { console.warn("sheetFor", ins.error); return null; }
    return ins.data;
  }

  async function sheetTotal(id) {
    const { data } = await J().db.from("jes_jobs").select("price").eq("sheet_id", id).is("billed", null);
    const rows = data || [];
    return { id, count: rows.length, total: rows.reduce((s, r) => s + Number(r.price || 0), 0) };
  }

  // =====================================================================
  // Load everything once
  // =====================================================================
  async function load() {
    const db = J().db;
    const [rates, sheets, jobs, goal, mrate] = await Promise.all([
      db.from("jes_rates").select("*").order("sort"),
      db.from("jes_sheets").select("*").order("created_at", { ascending: false }),
      db.from("jes_jobs").select("*"),
      db.from("jes_settings").select("value").eq("key", "weekly_goal").maybeSingle(),
      db.from("jes_settings").select("value").eq("key", "mileage_rate").maybeSingle()
    ]);
    O.rates = rates.data || [];
    O.sheets = sheets.data || [];
    O.jobs = jobs.data || [];
    // Every door you stopped at, with the time — this is what turns a mileage
    // total into a record you could actually hand someone.
    const att = await db.from("jes_attempts").select("job_id,at,kind");
    O.stops = att.data || [];
    O.goal = goal.data ? Number(goal.data.value) : 500;
    O.rate = mrate.data ? Number(mrate.data.value) : 0.7;
    return !rates.error && !sheets.error && !jobs.error;
  }

  const openOf = (company) => O.sheets.find((s) => s.company === company && s.status === "Open");
  const linesOf = (sheetId) => O.jobs.filter((j) => j.sheet_id === sheetId)
    .sort((a, b) => new Date(a.done_at || 0) - new Date(b.done_at || 0));
  const openLines = (sheetId) => linesOf(sheetId).filter((j) => j.billed == null);

  // =====================================================================
  // SHEETS
  // =====================================================================
  async function drawSheets(opts) {
    const { esc, money } = J();
    byId("screen").innerHTML = `<section class="office"><p class="muted">Loading…</p></section>`;
    if (!(await load())) {
      byId("screen").innerHTML = `<section class="office"><div class="alert">Couldn't load your sheets. If you just ran the new SQL, reload this page.</div></section>`;
      return;
    }
    if (opts && opts.company) { const s = openOf(opts.company); if (s) return openSheet(s.id); }

    const cards = O.rates.filter((r) => r.active !== false).map((r) => {
      const sheet = openOf(r.company);
      const ls = sheet ? openLines(sheet.id) : [];
      const total = ls.reduce((s, j) => s + Number(j.price || 0), 0);
      const noRate = r.standard == null && r.mode !== "per_job";
      const first = ls.length ? fmtDay(ls[0].done_at) : "";
      const last = ls.length ? fmtDay(ls[ls.length - 1].done_at) : "";
      const rateTxt = r.mode === "per_job" ? "price per job"
        : r.standard == null ? "no rate set yet"
        : money(r.standard) + (r.rush != null && Number(r.rush) !== Number(r.standard) ? " · rush " + money(r.rush) : "");
      if (!ls.length) {
        return `<div class="sheet-card empty">
          <div class="sc-top"><span class="sc-name">${esc(r.company)}</span><span class="sc-rate">${esc(rateTxt)}</span></div>
          <div class="muted small">${esc(r.pays_how || "")}</div>
          <div class="sc-empty">Sheet ready · 0 jobs${noRate ? " · set a rate in Money → Rates" : ""}</div>
        </div>`;
      }
      return `<div class="sheet-card">
        <div class="sc-top"><span class="sc-name">${esc(r.company)}</span><span class="sc-rate">${esc(rateTxt)}</span></div>
        <div class="muted small">${esc(r.pays_how || "")}</div>
        <div class="sc-money"><span class="sc-total">${money(total)}</span><span class="muted">${ls.length} job${ls.length === 1 ? "" : "s"}</span></div>
        <div class="muted small">First ${esc(first)} · last ${esc(last)}</div>
        <div class="row-gap">
          <button class="btn grow" data-open="${sheet.id}">Open sheet</button>
          <button class="btn ghost" data-close="${sheet.id}">Close</button>
        </div>
      </div>`;
    }).join("");

    const openTotal = O.jobs.filter((j) => j.sheet_id && j.billed == null).reduce((s, j) => s + Number(j.price || 0), 0);
    const owed = O.jobs.filter((j) => j.billed != null).reduce((s, j) => s + Math.max(0, Number(j.billed) - Number(j.paid_amount || 0)), 0);

    const stale = O.sheets.filter((s) => s.status === "Closed" && !s.paid_on && s.closed_on &&
      (Date.now() - new Date(s.closed_on).getTime()) / 864e5 > 14);

    byId("screen").innerHTML = `
      <section class="office">
        <div class="off-head">
          <h1>Sheets</h1>
          <p class="muted">Every served job lands here by itself. Close a sheet when you submit it.</p>
          <div class="off-sums">
            <div class="sum red"><span>On open sheets</span><b>${money(openTotal)}</b></div>
            <button class="sum green" data-go="money"><span>Waiting on payment</span><b>${money(owed)}</b></button>
          </div>
        </div>
        ${stale.map((s) => `<button class="alert tap" data-go="money" data-filter="${esc(s.company)}">${esc(s.company)} sheet for ${money(s.total)} closed ${esc(fmtDay(s.closed_on))} is still unpaid — ${Math.round((Date.now() - new Date(s.closed_on).getTime()) / 864e5)} days out.</button>`).join("")}
        <div class="sheet-grid">${cards}</div>
        <div id="printSheet" class="print-only"></div>
      </section>`;

    document.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openSheet(b.getAttribute("data-open")));
    document.querySelectorAll("[data-close]").forEach((b) => b.onclick = () => askClose(b.getAttribute("data-close")));
  }

  // ---------- one sheet, opened ----------
  async function openSheet(sheetId) {
    const { esc, money } = J();
    if (!O.sheets.length) await load();
    const sheet = O.sheets.find((s) => s.id === sheetId);
    if (!sheet) return drawSheets();
    const rate = O.rates.find((r) => r.company === sheet.company) || {};
    const ls = openLines(sheetId);
    const total = ls.reduce((s, j) => s + Number(j.price || 0), 0);
    const unticked = ls.filter((j) => !j.chk_client_app).length;
    const lastClosed = O.sheets.find((s) => s.company === sheet.company && s.status === "Closed");
    const isJean = forJean(sheet.company);

    byId("screen").innerHTML = `
      <section class="office">
        <div class="off-head row-gap wrap">
          <div class="grow">
            <button class="link-back" data-go="sheets">← All sheets</button>
            <h1>${esc(sheet.company)} — open sheet</h1>
            <p class="muted">${esc(rate.bill_to ? "Billed to " + rate.bill_to : "")}</p>
          </div>
          <div class="row-gap">
            <button class="btn ghost" id="shPrint">🖨 Print${isJean ? " for Jean" : ""}</button>
            <button class="btn go" id="shClose">Close</button>
          </div>
        </div>

        ${(() => {
          const nn = ls.filter((j) => !j.person).length, nj = ls.filter((j) => !j.job_no).length;
          if (!nn && !nj) return "";
          const bits = [];
          if (nj) bits.push(`${nj} need a job number`);
          if (nn) bits.push(`${nn} need a name`);
          return `<div class="alert">${bits.join(" · ")} before this sheet is submitted. Tap a line to fill it in — they can wait until you're off the road.</div>`;
        })()}
        ${unticked ? `<div class="alert soft">${unticked} job${unticked > 1 ? "s aren't" : " isn't"} ticked as entered in ${esc(sheet.company)}'s app. They get billed either way — the ✓ is just your own reminder.</div>` : ""}

        <div class="sheet-lines">
          <div class="sl-head">
            <span>#</span><span>Date · Job #</span><span>Name</span><span>S/NS</span><span class="right">Amount</span><span class="center">✓</span><span class="center">↩</span><span class="center">✕</span>
          </div>
          ${ls.length ? ls.map((j, i) => `
            <div class="sl-row ${!Number(j.price) ? "zero" : ""}">
              <span class="muted">${i + 1}</span>
              <span class="sl-date">${esc(fmtDay(j.done_at))}<input class="cell-in ${j.job_no ? "" : "empty"}" value="${esc(j.job_no || "")}" placeholder="job #" data-jobno="${j.id}" aria-label="Job number"></span>
              <span class="sl-name">
                <input class="cell-in wide ${j.person ? "" : "empty"}" value="${esc(j.person || "")}" placeholder="tap to add name" data-person="${j.id}" aria-label="Name">
                <span class="sl-addr">${esc(j.address || "no address")}${j.is_foreclosure ? ` <span class="tag purple">📚 ×${j.packets || 1}</span>` : ""}${j.ns_reason ? ` · ${esc(j.ns_reason)}` : ""}</span>
              </span>
              <span class="sl-sn ${j.outcome === "Served" ? "ok" : ""}">${j.outcome === "Served" ? "S" : "NS"}</span>
              <span class="right"><input class="amt" type="number" inputmode="decimal" step="0.01" placeholder="—" value="${j.price != null && Number(j.price) ? Number(j.price).toFixed(2) : ""}" data-price="${j.id}" aria-label="Amount for ${esc(j.person || "job")}"></span>
              <span class="center"><button class="tick ${j.chk_client_app ? "on" : ""}" data-tick="${j.id}" aria-label="Entered in their app">${j.chk_client_app ? "✓" : "·"}</button></span>
              <span class="center"><button class="tick undo" data-unserve="${j.id}" aria-label="Put ${esc(j.person || "this job")} back on the route">↩</button></span>
              <span class="center"><button class="tick drop" data-dropline="${j.id}" aria-label="Delete ${esc(j.person || "this line")} from the sheet">✕</button></span>
            </div>`).join("")
          : `<p class="muted center pad">Nothing on this sheet yet. Tap Served or Non-Served out on the route and it lands here.</p>`}
        </div>

        <div class="add-line-box">
          <button class="btn ghost" id="shAdd">+ Add a job to this sheet</button>
          <p class="muted small">For work you did before the app, or anything that never went through a route.
            It goes straight onto this sheet as served — no route, no attempt.</p>
        </div>

        <div class="sl-total"><span>Sheet total · ${ls.length} job${ls.length === 1 ? "" : "s"}</span><b>${money(total)}</b></div>

        <div class="two-cards">
          <div class="card soft">
            <div class="mini-label">What happens on close</div>
            <ol class="tight">
              <li>The sheet gets a number and a date range</li>
              <li>A line opens in the ${esc(sheet.company)} payment tracker</li>
              <li>A fresh empty sheet starts</li>
            </ol>
            <p class="muted small">Printing is its own button — print before or after closing, as many times as you want.</p>
          </div>
          ${lastClosed ? `<div class="card soft">
            <div class="mini-label">Last closed</div>
            <div>${esc(fmtDay(lastClosed.period_start))} – ${esc(fmtDay(lastClosed.period_end))} · <b>${money(lastClosed.total)}</b></div>
            <div class="${lastClosed.paid_on ? "ok-txt" : "red-txt"}">${lastClosed.paid_on ? "Paid " + esc(fmtDay(lastClosed.paid_on)) + " ✓" : "Not paid yet"}</div>
          </div>` : ""}
        </div>
        <div id="printSheet" class="print-only"></div>
      </section>`;

    document.querySelectorAll("[data-person],[data-jobno]").forEach((inp) => inp.onchange = async () => {
      const isName = inp.hasAttribute("data-person");
      const id = inp.getAttribute(isName ? "data-person" : "data-jobno");
      const patch = {};
      patch[isName ? "person" : "job_no"] = inp.value.trim() || null;
      const { error } = await J().db.from("jes_jobs").update(patch).eq("id", id);
      if (error) { J().toast("Not saved: " + error.message); return; }
      inp.classList.toggle("empty", !inp.value.trim());
      const row = O.jobs.find((x) => x.id === id);
      if (row) Object.assign(row, patch);
      J().toast("Saved");
    });
    document.querySelectorAll("[data-price]").forEach((inp) => inp.onchange = async () => {
      const v = num(inp.value);
      await J().db.from("jes_jobs").update({ price: v == null ? 0 : v }).eq("id", inp.getAttribute("data-price"));
      await load(); openSheet(sheetId);
    });
    document.querySelectorAll("[data-tick]").forEach((b) => b.onclick = async () => {
      const id = b.getAttribute("data-tick");
      const j = O.jobs.find((x) => x.id === id);
      await J().db.from("jes_jobs").update({ chk_client_app: !j.chk_client_app }).eq("id", id);
      j.chk_client_app = !j.chk_client_app;
      b.classList.toggle("on"); b.textContent = j.chk_client_app ? "✓" : "·";
    });
    // Tapped Served by mistake? Put it straight back on the route.
    document.querySelectorAll("[data-unserve]").forEach((b) => b.onclick = async () => {
      const id = b.getAttribute("data-unserve");
      const j = O.jobs.find((x) => x.id === id);
      if (!confirm(`Take ${j.person || "this job"} off the ${sheet.company} sheet and put it back on today's route?\n\nUse this if you tapped Served by mistake.`)) return;
      const { error } = await J().db.from("jes_jobs").update({
        sheet_id: null, outcome: null, done_at: null, status: "Active",
        on_today: true, route_order: null
      }).eq("id", id);
      if (error) { J().toast("Not changed: " + error.message); return; }
      J().toast((j.person || "Job") + " is back on the route");
      J().refreshBadges && J().refreshBadges();
      await load(); openSheet(sheetId);
    });
    // Delete a line outright — for one you typed in by hand, or a mistake
    document.querySelectorAll("[data-dropline]").forEach((b) => b.onclick = async () => {
      const id = b.getAttribute("data-dropline");
      const j = O.jobs.find((x) => x.id === id);
      const who = (j && (j.person || j.address)) || "this line";
      if (!confirm(`Delete ${who} from the ${sheet.company} sheet for good?\n\nThis removes the job completely. To put it back on the route instead, use ↩.`)) return;
      await J().db.from("jes_attempts").delete().eq("job_id", id);
      const { error } = await J().db.from("jes_jobs").delete().eq("id", id);
      if (error) { J().toast("Not deleted: " + error.message); return; }
      J().toast("Deleted");
      J().refreshBadges && J().refreshBadges();
      await load(); openSheet(sheetId);
    });

    // Add a job you did before the app, or one that never went on a route
    byId("shAdd").onclick = () => addToSheet(sheet);

    document.querySelectorAll("[data-job]").forEach((s) => s.onclick = () =>
      window.JES_JOBS && window.JES_JOBS.openJob(s.getAttribute("data-job")));
    byId("shPrint").onclick = () => printForJean(sheet, ls, total);
    byId("shClose").onclick = () => askClose(sheetId);
  }

  // ---------- close ----------
  async function askClose(sheetId) {
    if (!O.sheets.length) await load();
    const sheet = O.sheets.find((s) => s.id === sheetId);
    const ls = openLines(sheetId);
    if (!ls.length) { J().toast("Nothing on that sheet yet"); return; }
    const total = ls.reduce((s, j) => s + Number(j.price || 0), 0);
    const zero = ls.filter((j) => !Number(j.price)).length;
    if (zero && !confirm(`${zero} job${zero > 1 ? "s have" : " has"} no price on ${zero > 1 ? "them" : "it"}. Close anyway?`)) return;

    // Blank names and job numbers print as blank cells on the invoice
    const noName = ls.filter((j) => !j.person || !String(j.person).trim()).length;
    const noNo = ls.filter((j) => !j.job_no || !String(j.job_no).trim()).length;
    if (noName || noNo) {
      const bits = [];
      if (noNo) bits.push(`${noNo} with no job number`);
      if (noName) bits.push(`${noName} with no name`);
      const who = forJean(sheet.company) ? "Jean" : sheet.company;
      if (!confirm(`${bits.join(" and ")}.\n\nThose print as blank boxes and ${who} can't match them to pay you.\n\nClose anyway?`)) return;
    }
    if (!confirm(`Close the ${sheet.company} sheet?\n\n${ls.length} jobs · ${J().money(total)}\n\nThe amounts get frozen and a line opens in the payment tracker.`)) return;

    const period_start = String(ls[0].done_at || todayISO()).slice(0, 10);
    const period_end = String(ls[ls.length - 1].done_at || todayISO()).slice(0, 10);
    const seq = O.sheets.filter((s) => s.company === sheet.company && s.status === "Closed").length + 1;
    const sheet_no = sheet.company.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() + "-" +
      new Date().getFullYear() + "-" + String(seq).padStart(3, "0");

    // Freeze every line, then freeze the sheet
    for (const j of ls) {
      await J().db.from("jes_jobs").update({ billed: Number(j.price || 0) }).eq("id", j.id);
    }
    const { error } = await J().db.from("jes_sheets").update({
      status: "Closed", closed_on: todayISO(), sheet_no, period_start, period_end,
      total: Number(total.toFixed(2)),
      lines: ls.map((j, i) => ({ n: i + 1, job_no: j.job_no || "", name: j.person || "", amount: Number(j.price || 0), outcome: j.outcome || "" }))
    }).eq("id", sheetId);
    if (error) { J().toast("Not closed: " + error.message); return; }

    await load();
    J().toast(`${sheet.company} sheet closed · ${J().money(total)}`);
    J().refreshBadges && J().refreshBadges();
    const closed = O.sheets.find((s) => s.id === sheetId) || sheet;
    drawSheets();
    if (confirm("Print it now?")) printForJean(closed, ls, total);
  }

  // ---------- printing onto Jean's blank Quickserve sheet ----------
  const PER_PAGE = 20;   // Jean's form has 20 numbered rows
  // Only these two go through Jean, so only these two print on his form
  const JEAN_CLIENTS = ["ProVest", "Userve"];
  const forJean = (company) => JEAN_CLIENTS.includes(company);
  const billToOf = (company) => {
    const r = O.rates.find((x) => x.company === company);
    return (r && r.bill_to) || company;
  };

  function printForJean(sheet, ls, total) {
    const { esc, money } = J();
    const pages = [];
    for (let i = 0; i < Math.max(1, Math.ceil(ls.length / PER_PAGE)); i++) pages.push(ls.slice(i * PER_PAGE, (i + 1) * PER_PAGE));
    const period = (sheet.period_start ? fmtDay(sheet.period_start) : ls.length ? fmtDay(ls[0].done_at) : "") +
      " – " + (sheet.period_end ? fmtDay(sheet.period_end) : ls.length ? fmtDay(ls[ls.length - 1].done_at) : "");

    byId("printSheet").innerHTML = pages.map((page, pi) => {
      const rows = [];
      for (let r = 0; r < PER_PAGE; r++) {
        const j = page[r];
        const n = pi * PER_PAGE + r + 1;
        rows.push(`<tr>
          <td class="jp-n">${j ? n : ""}</td>
          <td class="jp-job">${j ? esc(j.job_no || "") : ""}</td>
          <td class="jp-name">${j ? esc(j.person || "") : ""}</td>
          <td class="jp-amt">${j ? money(j.price || 0) : ""}</td>
        </tr>`);
      }
      const last = pi === pages.length - 1;
      const pageNo = pages.length > 1 ? ` — page ${pi + 1} of ${pages.length}` : "";

      // Jean's own Quickserve form, only for the two clients that go through him
      if (forJean(sheet.company)) {
        return `<div class="jp-page">
          <div class="jp-head">
            <div class="jp-logo"><b>QUICKSERVE<br>LEGAL</b><small>CERTIFIED PROCESS SOLUTIONS</small></div>
            <div class="jp-title"><b>BLANK INVOICE SHEET</b><span>Quickserve Legal Certified Process Solutions</span></div>
            <div class="jp-server"><span>SERVER NAME</span><b>JAZMIN AGUAYO</b><span>Period: ${esc(period)}</span></div>
          </div>
          <div class="jp-client">${esc(sheet.company)}${pageNo}</div>
          <table class="jp-table">
            <thead><tr><th class="jp-n">NO.</th><th class="jp-job">JOB NUMBER</th><th class="jp-name">NAME</th><th class="jp-amt">AMOUNT</th></tr></thead>
            <tbody>${rows.join("")}</tbody>
          </table>
          ${last ? `<div class="jp-total"><span>TOTAL — ${ls.length} job${ls.length === 1 ? "" : "s"}</span><b>${money(total)}</b></div>` : ""}
          <div class="jp-foot">Quickserve Legal | Lakeland, FL | 863-594-0066 | info@quicklegalservers.com | quicklegalservers.com</div>
        </div>`;
      }

      // Everybody else gets your own sheet
      return `<div class="jp-page je-page">
        <div class="je-head">
          <div class="je-mark">
            <svg viewBox="0 0 220 220" aria-hidden="true">
              <g transform="translate(110,42) scale(0.8)"><path d="M-18 6 L-20 -10 L-9 -1 L0 -16 L9 -1 L20 -10 L18 6 Z" fill="#000"/><rect x="-18" y="7" width="36" height="4" fill="#000"/></g>
              <text x="110" y="150" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="120" fill="#000">J</text>
            </svg>
            <span>J EMPIRE</span>
          </div>
          <div class="je-title"><b>INVOICE</b><span>Process Serving &amp; Notary</span></div>
          <div class="je-meta">
            <span>SERVER</span><b>JAZMIN AGUAYO</b>
            <span>Period: ${esc(period)}</span>
            ${sheet.sheet_no ? `<span>Sheet ${esc(sheet.sheet_no)}</span>` : ""}
          </div>
        </div>
        <div class="je-billto"><span>BILL TO</span><b>${esc(billToOf(sheet.company))}</b>${pageNo}</div>
        <table class="jp-table je-table">
          <thead><tr><th class="jp-n">NO.</th><th class="jp-job">JOB NUMBER</th><th class="jp-name">NAME</th><th class="jp-amt">AMOUNT</th></tr></thead>
          <tbody>${rows.join("")}</tbody>
        </table>
        ${last ? `<div class="jp-total je-total"><span>AMOUNT DUE — ${ls.length} job${ls.length === 1 ? "" : "s"}</span><b>${money(total)}</b></div>` : ""}
        <div class="jp-foot je-foot">Jazmin Aguayo · St. Cloud, FL · 407-487-6008 · Jazmarie624@gmail.com</div>
      </div>`;
    }).join("");
    window.print();
  }

  // =====================================================================
  // MONEY — what am I owed
  // =====================================================================
  async function drawMoney(opts) {
    const { esc, money } = J();
    byId("screen").innerHTML = `<section class="office"><p class="muted">Loading…</p></section>`;
    if (!(await load())) {
      byId("screen").innerHTML = `<section class="office"><div class="alert">Couldn't load. If you just ran the new SQL, reload this page.</div></section>`;
      return;
    }
    const miles = await J().db.from("jes_expenses").select("miles,amount,day").eq("kind", "Miles");
    const thisYear = (miles.data || []).filter((m) => String(m.day).slice(0, 4) === String(new Date().getFullYear()));
    const milesTotal = thisYear.reduce((s, m) => s + Number(m.miles || 0), 0);
    const milesMoney = thisYear.reduce((s, m) => s + Number(m.amount || 0), 0);

    const billed = O.jobs.filter((j) => j.billed != null);
    const owed = billed.reduce((s, j) => s + Math.max(0, Number(j.billed) - Number(j.paid_amount || 0)), 0);
    const ws = weekStart();
    const earned = O.jobs.filter((j) => j.done_at && new Date(j.done_at) >= ws)
      .reduce((s, j) => s + Number(j.billed != null ? j.billed : j.price || 0), 0);

    const companies = Array.from(new Set(O.sheets.filter((s) => s.status === "Closed").map((s) => s.company)));
    const focus = opts && opts.company;

    const panels = companies.map((c) => {
      const cs = O.sheets.filter((s) => s.company === c && s.status === "Closed")
        .sort((a, b) => new Date(b.closed_on || 0) - new Date(a.closed_on || 0));
      const cOwed = cs.reduce((sum, s) => sum + linesOf(s.id)
        .reduce((t, j) => t + Math.max(0, Number(j.billed || 0) - Number(j.paid_amount || 0)), 0), 0);
      return `<div class="pay-panel ${focus === c ? "focus" : ""}">
        <div class="pp-top"><span class="pp-name">${esc(c)}</span>
          <span class="${cOwed > 0 ? "red-txt" : "ok-txt"}">${cOwed > 0 ? money(cOwed) + " owed" : "all paid ✓"}</span></div>
        ${cs.map((s) => {
          const ls = linesOf(s.id);
          const sOwed = ls.reduce((t, j) => t + Math.max(0, Number(j.billed || 0) - Number(j.paid_amount || 0)), 0);
          return `<button class="pp-row ${sOwed > 0 ? "due" : ""}" data-sheet="${s.id}">
            <span class="pp-when">${esc(fmtDay(s.period_start))} – ${esc(fmtDay(s.period_end))} · ${ls.length} job${ls.length === 1 ? "" : "s"}</span>
            <span class="pp-amt">${money(s.total)}</span>
            <span class="${s.paid_on ? "ok-txt" : "red-txt"}">${s.paid_on ? esc(fmtDay(s.paid_on)) : "not yet"}</span>
          </button>`;
        }).join("")}
      </div>`;
    }).join("");

    byId("screen").innerHTML = `
      <section class="office">
        <div class="off-head">
          <h1>What am I owed</h1>
          <p class="muted">Every closed sheet, by company. Tap one to tick off jobs as the money lands.</p>
          <div class="off-sums">
            <div class="sum red"><span>Waiting on payment</span><b>${money(owed)}</b></div>
            <div class="sum green"><span>This week · goal ${money(O.goal)}</span><b>${money(earned)}</b></div>
            <button class="sum sum-tap" id="mMiles">
              <span>Miles banked this year${thisYear.length ? ` · ${thisYear.length} day${thisYear.length === 1 ? "" : "s"}` : ""}</span>
              <b>${milesTotal.toFixed(0)} mi · ${money(milesMoney)}</b>
              <em>${O.showMiles ? "Hide the days ▲" : "Tap for day by day ▼"}</em>
            </button>
          </div>
          ${O.showMiles ? milesPanel(thisYear, milesTotal, milesMoney) : ""}
        </div>
        ${companies.length ? `<div class="pay-grid">${panels}</div>`
          : `<div class="card soft center pad"><p>No closed sheets yet.</p><p class="muted small">Close a sheet in Sheets and it shows up here.</p></div>`}
        <div class="row-gap wrap pad-top">
          <button class="btn ghost" id="mRates">Rates</button>
          <button class="btn ghost" id="mExport">Export everything</button>
        </div>
        <div id="printSheet" class="print-only"></div>
      </section>`;

    document.querySelectorAll("[data-sheet]").forEach((b) => b.onclick = () => openTracker(b.getAttribute("data-sheet")));
    byId("mRates").onclick = drawRates;
    byId("mExport").onclick = exportAll;
    byId("mMiles").onclick = () => { O.showMiles = !O.showMiles; drawMoney(opts); };
    const mx = byId("mMilesCsv");
    if (mx) mx.onclick = () => milesCsv(thisYear);
    document.querySelectorAll("[data-day]").forEach((b) => b.onclick = () => {
      O.openDay = O.openDay === b.dataset.day ? null : b.dataset.day;
      drawMoney(opts);
    });
  }

  // ---------- type a job straight onto a sheet ----------
  // Work you did before the app, or anything that never went through a route.
  // It lands as served, on this sheet, with no attempt logged.
  function addToSheet(sheet) {
    const { esc } = J();
    const back = byId("sheetBack") || document.body.appendChild(
      Object.assign(document.createElement("div"), { id: "sheetBack", className: "sheet-back" }));
    const rate = O.rates.find((r) => r.company === sheet.company) || {};
    const today = todayISO();
    back.hidden = false;
    back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="asT">
      <h2 id="asT">Add a job to ${esc(sheet.company)}</h2>
      <p class="muted small">Goes straight onto this sheet as served. Nothing is routed and no attempt is recorded.</p>
      <div class="grid2">
        <label>Date served<input id="as_date" type="date" value="${esc(today)}"></label>
        <label>Job #<input id="as_job" placeholder="their number"></label>
      </div>
      <label>Person or company served<input id="as_person" placeholder="who you served"></label>
      <label>Address<input id="as_addr" placeholder="street, city, FL ZIP"></label>
      <div class="grid2">
        <label>Amount<input id="as_price" type="number" inputmode="decimal" step="0.01"
          value="${rate.flat != null ? Number(rate.flat).toFixed(2) : ""}" placeholder="0.00"></label>
        <label>Served / Non-Served<select id="as_out"><option>Served</option><option>Non-Served</option></select></label>
      </div>
      <label>Note (optional)<input id="as_note" placeholder="anything you want on the record"></label>
      <div class="sheet-btns">
        <button class="btn ghost" id="asCancel">Cancel</button>
        <button class="btn go" id="asSave">Add to the sheet</button>
      </div>
    </div>`;
    const close = () => { back.hidden = true; back.innerHTML = ""; };
    byId("asCancel").onclick = close;
    byId("asSave").onclick = async () => {
      const v = (id) => { const el = byId(id); return el ? el.value.trim() : ""; };
      const person = v("as_person"), addr = v("as_addr");
      if (!person && !addr) { J().toast("Give it a name or an address first"); return; }
      const day = v("as_date") || today;
      const out = v("as_out") === "Non-Served" ? "Non-Served" : "Served";
      const row = {
        client: sheet.company, sheet_id: sheet.id,
        person: person || null, job_no: v("as_job") || null,
        address: addr ? J().P ? J().P().cleanAddress(addr) : addr : null,
        county: null,
        price: Number(v("as_price")) || 0,
        status: out === "Served" ? "Served" : "Non-Serve Complete",
        outcome: out, done_at: day + "T12:00:00",
        on_today: false, has_papers: true, source: "By hand",
        notes: (v("as_note") ? v("as_note") + "\n" : "") + "Typed onto the sheet by hand — did not go through a route."
      };
      if (window.JES_PARSE && addr) {
        row.address = window.JES_PARSE.cleanAddress(addr);
        row.county = window.JES_PARSE.countyFor(row.address) || null;
      }
      const { error } = await J().db.from("jes_jobs").insert(row);
      if (error) { J().toast("Not added: " + error.message); return; }
      close();
      J().toast("Added to the " + sheet.company + " sheet");
      J().refreshBadges && J().refreshBadges();
      await load(); openSheet(sheet.id);
    };
  }

  // ---------- rebuild one day's actual driving from the stops you made ----------
  const HOME = (() => {
    try { const h = JSON.parse(localStorage.getItem("jes_home_ll") || "null"); if (h && h.lat) return h; } catch (e) {}
    return { lat: 28.2489, lng: -81.2812 };   // St. Cloud
  })();
  const ROAD = 1.3;   // straight line always undercounts the road
  function legMiles(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return null;
    const R = 3958.8, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h)) * ROAD;
  }
  const dayOf = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const clock = (ts) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  // Returns the stops you made that day, in the order you made them, each with
  // the miles driven to get there. Starts and ends at home.
  function dayTrip(day) {
    const byId = {};
    O.jobs.forEach((j) => { byId[j.id] = j; });
    const seen = new Set();
    const stops = (O.stops || [])
      .filter((s) => dayOf(s.at) === day && byId[s.job_id])
      .sort((a, b) => new Date(a.at) - new Date(b.at))
      .filter((s) => { const k = s.job_id + "|" + s.at; if (seen.has(k)) return false; seen.add(k); return true; })
      .map((s) => ({ job: byId[s.job_id], at: s.at, kind: s.kind }));
    let from = HOME, total = 0;
    const legs = stops.map((s) => {
      const m = legMiles(from, s.job);
      if (m != null) { total += m; from = s.job; }
      return { ...s, miles: m, running: total };
    });
    const home = legMiles(from, HOME);
    if (home != null) total += home;
    return { legs, home, total };
  }

  // ---------- every day you drove, newest first ----------
  function milesPanel(days, total, cash) {
    const { esc, money } = J();
    if (!days.length) {
      return `<div class="miles-panel"><p class="muted center pad">No driving banked yet this year.
        Build a route, mark your stops, and each day lands here on its own line.</p></div>`;
    }
    const rows = days.slice().sort((a, b) => String(b.day).localeCompare(String(a.day)))
      .map((m) => {
        const open = O.openDay === m.day;
        const trip = open ? dayTrip(m.day) : null;
        return `<button class="mrow mtap ${open ? "open" : ""}" data-day="${esc(m.day)}">
          <b>${esc(fmtDay(m.day))}</b>
          <span>${esc(m.county || "")}${m.stops ? ` · ${m.stops} stop${m.stops === 1 ? "" : "s"}` : ""} · ${open ? "hide the stops ▲" : "see the stops ▼"}</span>
          <u>${Number(m.miles || 0).toFixed(1)} mi</u>
          <i>${money(m.amount || 0)}</i>
        </button>` + (open ? tripPanel(trip, m) : "");
      }).join("");
    return `<div class="miles-panel">
      <div class="mrow mhead"><b>Day</b><span>Where</span><u>Miles</u><i>Deduction</i></div>
      ${rows}
      <div class="mrow mtot"><b>${days.length} day${days.length === 1 ? "" : "s"}</b><span></span>
        <u>${total.toFixed(1)} mi</u><i>${money(cash)}</i></div>
      <button class="btn ghost" id="mMilesCsv">Download the spreadsheet</button>
      <p class="muted small">Opens in Excel or Numbers. Road distance is worked out from your stops,
        so it's a careful estimate — your odometer is the final word.</p>
    </div>`;
  }

  // The stops behind one day's mileage — where you went, and why
  function tripPanel(trip, row) {
    const { esc, money } = J();
    if (!trip.legs.length) {
      return `<div class="trip"><p class="muted small">No stops recorded for this day — the miles came from an
        older version that only kept the total.</p></div>`;
    }
    const lines = trip.legs.map((s, i) => `<div class="tleg">
      <b>${i + 1}</b>
      <span class="tleg-who">${esc(s.job.person || "(no name)")}${s.job.job_no ? ` · #${esc(s.job.job_no)}` : ""}
        <em>${esc(s.job.address || "no address")}</em>
        <u>${esc(s.job.client || "")} · ${esc(s.kind)} · ${esc(clock(s.at))}</u></span>
      <i>${s.miles == null ? "—" : s.miles.toFixed(1) + " mi"}</i>
    </div>`).join("");
    return `<div class="trip">
      <div class="tleg thome"><b>🏠</b><span class="tleg-who">Left home<em>352 Pineland Ct, St. Cloud</em></span><i>—</i></div>
      ${lines}
      <div class="tleg thome"><b>🏠</b><span class="tleg-who">Home again</span><i>${trip.home == null ? "—" : trip.home.toFixed(1) + " mi"}</i></div>
      <div class="tleg ttot"><b></b><span class="tleg-who">${trip.legs.length} stop${trip.legs.length === 1 ? "" : "s"} · process serving</span>
        <i>${trip.total.toFixed(1)} mi · ${money(row.amount || 0)}</i></div>
    </div>`;
  }

  function milesCsv(days) {
    // Every stop on every day, because a mileage log needs the destination
    // and the reason, not just a number.
    const rows = [["Date", "Time", "Stop", "Client", "Job #", "Served to", "Address",
      "What happened", "Miles this leg", "Day total miles", "Day deduction", "Purpose"]];
    days.slice().sort((a, b) => String(a.day).localeCompare(String(b.day))).forEach((m) => {
      const trip = dayTrip(m.day);
      const dayMiles = Number(m.miles || 0).toFixed(1);
      const dayCash = Number(m.amount || 0).toFixed(2);
      if (!trip.legs.length) {
        rows.push([m.day, "", "", "", "", "", "(no stops recorded)", "", "", dayMiles, dayCash, "Process serving route"]);
        return;
      }
      rows.push([m.day, "", "Start", "", "", "", "352 Pineland Ct, St. Cloud, FL 34769", "Left home", "", "", "", "Process serving"]);
      trip.legs.forEach((s, i) => {
        rows.push([m.day, clock(s.at), i + 1, s.job.client || "", s.job.job_no || "",
          s.job.person || "", s.job.address || "", s.kind,
          s.miles == null ? "" : s.miles.toFixed(1), "", "", "Serving legal process"]);
      });
      rows.push([m.day, "", "End", "", "", "", "352 Pineland Ct, St. Cloud, FL 34769", "Home again",
        trip.home == null ? "" : trip.home.toFixed(1), dayMiles, dayCash, "Process serving"]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `J-Empire-mileage-${new Date().getFullYear()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    J().toast("Spreadsheet downloaded");
  }

  // ---------- one closed sheet, job by job ----------
  async function openTracker(sheetId) {
    const { esc, money } = J();
    if (!O.sheets.length) await load();
    const sheet = O.sheets.find((s) => s.id === sheetId);
    if (!sheet) return drawMoney();
    const ls = linesOf(sheetId);
    const billedTotal = ls.reduce((s, j) => s + Number(j.billed || 0), 0);
    const paidTotal = ls.reduce((s, j) => s + Number(j.paid_amount || 0), 0);
    const short = ls.filter((j) => j.paid_amount != null && Number(j.paid_amount) < Number(j.billed));
    const unpaid = ls.filter((j) => j.paid_amount == null);
    const owed = billedTotal - paidTotal;

    byId("screen").innerHTML = `
      <section class="office">
        <div class="off-head row-gap wrap">
          <div class="grow">
            <button class="link-back" data-go="money">← What am I owed</button>
            <h1>${esc(sheet.company)} · ${esc(fmtDay(sheet.period_start))} – ${esc(fmtDay(sheet.period_end))}</h1>
            <p class="muted">${esc(sheet.sheet_no || "")} · closed ${esc(fmtDay(sheet.closed_on))}</p>
          </div>
          <div class="row-gap">
            <button class="btn ghost" id="tPrint">🖨 Re-print</button>
            <button class="btn ghost" id="tPaste">Paste pay report</button>
            <button class="btn go" id="tAll">Mark all paid</button>
          </div>
        </div>

        <div class="sheet-lines">
          <div class="sl-head pay">
            <span>#</span><span>Date · Job #</span><span>Name</span><span class="right">Billed</span><span class="right">Paid</span><span class="center">Paid?</span>
          </div>
          ${ls.map((j, i) => {
            const isShort = j.paid_amount != null && Number(j.paid_amount) < Number(j.billed);
            const isPaid = j.paid_amount != null && Number(j.paid_amount) >= Number(j.billed);
            return `<div class="sl-row pay ${isShort ? "short" : ""}">
              <span class="muted">${i + 1}</span>
              <span class="sl-date">${esc(fmtDay(j.done_at))}<input class="cell-in ${j.job_no ? "" : "empty"}" value="${esc(j.job_no || "")}" placeholder="job #" data-jobno="${j.id}" aria-label="Job number"></span>
              <span class="sl-name" data-job="${j.id}">${esc(j.person || "(no name)")}${j.is_foreclosure ? ` <span class="tag purple">📚 ×${j.packets || 1}</span>` : ""}
                <span class="sl-addr">${esc(j.address || "")}</span>
              </span>
              <span class="right strong">${money(j.billed || 0)}</span>
              <span class="right"><input class="amt" type="number" inputmode="decimal" step="0.01" placeholder="—" value="${j.paid_amount != null ? Number(j.paid_amount).toFixed(2) : ""}" data-paid="${j.id}" aria-label="Paid for ${esc(j.person || "job")}"></span>
              <span class="center">${isShort ? `<span class="short-tag">SHORT</span>`
                : `<button class="tick ${isPaid ? "on" : ""}" data-pay="${j.id}" aria-label="Mark paid">${isPaid ? "✓" : "☐"}</button>`}</span>
            </div>`;
          }).join("")}
        </div>

        <div class="sl-total pay"><span>Sheet totals · ${ls.length} job${ls.length === 1 ? "" : "s"}</span>
          <b>${money(billedTotal)}</b><b class="${owed > 0 ? "red-txt" : "ok-txt"}">${money(paidTotal)}</b></div>

        ${owed > 0 ? `<div class="card red-card">
          <div class="mini-label">Still owed on this sheet</div>
          <div class="big-red">${money(owed)}</div>
          <div>${unpaid.length ? `${money(unpaid.reduce((s, j) => s + Number(j.billed || 0), 0))} from ${unpaid.length} job${unpaid.length > 1 ? "s" : ""} not paid yet` : ""}
            ${short.length ? `<br>${money(short.reduce((s, j) => s + (Number(j.billed) - Number(j.paid_amount)), 0))} short-paid on ${short.length} job${short.length > 1 ? "s" : ""}` : ""}</div>
          ${short.length ? `<div class="mini-label pad-top">The short-paid ones</div>
            <div>${short.map((j) => `#${esc(j.job_no || "—")} ${esc(j.person || "")} — billed ${money(j.billed)}, paid ${money(j.paid_amount)}`).join("<br>")}</div>` : ""}
        </div>` : `<div class="card soft"><b class="ok-txt">This sheet is fully paid ✓</b></div>`}

        <div class="card soft">
          <div class="mini-label">How to tick them off</div>
          <p>Tap the <b>Paid?</b> box and it fills in the billed amount. Tap the <b>Paid</b> number instead if they paid something different — anything less turns the line red by itself.</p>
        </div>
        <div id="printSheet" class="print-only"></div>
      </section>`;

    document.querySelectorAll("[data-paid]").forEach((inp) => inp.onchange = async () => {
      const v = num(inp.value);
      const { error } = await J().db.from("jes_jobs").update({ paid_amount: v, paid_on: v == null ? null : todayISO() })
        .eq("id", inp.getAttribute("data-paid"));
      if (error) { J().toast("Not saved: " + error.message); return; }
      await load(); await syncSheetPaid(sheetId); openTracker(sheetId);
    });
    document.querySelectorAll("[data-pay]").forEach((b) => b.onclick = async () => {
      const id = b.getAttribute("data-pay");
      const j = O.jobs.find((x) => x.id === id);
      if (!j) { J().toast("Couldn't find that job — reload and try again"); return; }
      const already = j.paid_amount != null;
      // Fall back to the price if the frozen amount somehow never got written
      const amount = Number(j.billed != null ? j.billed : j.price || 0);
      if (!already && !amount) { J().toast("That line has no amount on it — type the price in first"); return; }
      const { error } = await J().db.from("jes_jobs").update({
        paid_amount: already ? null : amount,
        paid_on: already ? null : todayISO()
      }).eq("id", id);
      if (error) { J().toast("Not saved: " + error.message); return; }
      J().toast(already ? "Marked unpaid" : "Paid " + J().money(amount) + " ✓");
      await load(); await syncSheetPaid(sheetId); openTracker(sheetId);
    });
    // Delete a line outright — for one you typed in by hand, or a mistake
    document.querySelectorAll("[data-dropline]").forEach((b) => b.onclick = async () => {
      const id = b.getAttribute("data-dropline");
      const j = O.jobs.find((x) => x.id === id);
      const who = (j && (j.person || j.address)) || "this line";
      if (!confirm(`Delete ${who} from the ${sheet.company} sheet for good?\n\nThis removes the job completely. To put it back on the route instead, use ↩.`)) return;
      await J().db.from("jes_attempts").delete().eq("job_id", id);
      const { error } = await J().db.from("jes_jobs").delete().eq("id", id);
      if (error) { J().toast("Not deleted: " + error.message); return; }
      J().toast("Deleted");
      J().refreshBadges && J().refreshBadges();
      await load(); openSheet(sheetId);
    });

    // Add a job you did before the app, or one that never went on a route
    byId("shAdd").onclick = () => addToSheet(sheet);

    document.querySelectorAll("[data-job]").forEach((s) => s.onclick = () =>
      window.JES_JOBS && window.JES_JOBS.openJob(s.getAttribute("data-job")));
    byId("tPrint").onclick = () => printForJean(sheet, ls.map((j) => Object.assign({}, j, { price: j.billed })), billedTotal);
    byId("tAll").onclick = async () => {
      if (!confirm(`Mark all ${ls.length} jobs paid in full?`)) return;
      for (const j of ls) {
        const amt = Number(j.billed != null ? j.billed : j.price || 0);
        const { error } = await J().db.from("jes_jobs").update({ paid_amount: amt, paid_on: todayISO() }).eq("id", j.id);
        if (error) { J().toast("Not saved: " + error.message); break; }
      }
      await load(); await syncSheetPaid(sheetId); openTracker(sheetId);
    };
    byId("tPaste").onclick = () => pastePayReport(sheetId);
  }

  // The sheet counts as paid when every job on it is paid in full
  async function syncSheetPaid(sheetId) {
    const ls = linesOf(sheetId);
    const allPaid = ls.length && ls.every((j) => j.paid_amount != null && Number(j.paid_amount) >= Number(j.billed));
    const sheet = O.sheets.find((s) => s.id === sheetId);
    const want = allPaid ? todayISO() : null;
    if (sheet && (sheet.paid_on || null) !== want) {
      await J().db.from("jes_sheets").update({ paid_on: want }).eq("id", sheetId);
      sheet.paid_on = want;
    }
  }

  // ---------- paste their pay report ----------
  function pastePayReport(sheetId) {
    const back = byId("sheetBack") ||
      document.body.appendChild(Object.assign(document.createElement("div"), { id: "sheetBack", className: "sheet-back" }));
    back.hidden = false;
    back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="prT">
      <h2 id="prT">Paste their pay report</h2>
      <p class="muted">Any line with a job number and a dollar amount gets matched. Whatever doesn't match is left for you to look at.</p>
      <textarea id="prText" rows="8" class="paste"></textarea>
      <div class="sheet-btns"><button class="btn ghost" id="prCancel">Go back</button><button class="btn go" id="prGo">Match it up</button></div>
    </div>`;
    const close = () => { back.hidden = true; back.innerHTML = ""; };
    byId("prCancel").onclick = close;
    byId("prGo").onclick = async () => {
      const text = byId("prText").value || "";
      const ls = linesOf(sheetId);
      let hit = 0, miss = 0;
      for (const line of text.split("\n")) {
        const am = line.match(/\$?\s*(\d+(?:\.\d{2})?)\s*$/);
        if (!am) continue;
        const j = ls.find((x) => x.job_no && line.indexOf(x.job_no) >= 0);
        if (!j) { miss++; continue; }
        await J().db.from("jes_jobs").update({ paid_amount: Number(am[1]), paid_on: todayISO() }).eq("id", j.id);
        hit++;
      }
      close();
      await load(); await syncSheetPaid(sheetId); openTracker(sheetId);
      J().toast(`${hit} matched${miss ? ` · ${miss} line${miss > 1 ? "s" : ""} didn't match a job` : ""}`);
    };
  }

  // =====================================================================
  // RATES — you set them, not me
  // =====================================================================
  async function drawRates() {
    const { esc } = J();
    if (!O.rates.length) await load();
    byId("screen").innerHTML = `
      <section class="office">
        <div class="off-head">
          <button class="link-back" data-go="money">← What am I owed</button>
          <h1>Rates</h1>
          <p class="muted">What each company pays. Leave a box empty if you don't know it yet — the job still saves, you just put the price in on the sheet.</p>
        </div>
        <div class="rate-list">
          <div class="rt-head"><span>Company</span><span class="right">Standard</span><span class="right">Rush</span><span>Billed to</span></div>
          ${O.rates.map((r) => `<div class="rt-row">
            <span class="rt-name">${esc(r.company)}</span>
            <span class="right"><input class="amt" type="number" inputmode="decimal" step="0.01" placeholder="—" value="${r.standard != null ? Number(r.standard).toFixed(2) : ""}" data-std="${esc(r.company)}" aria-label="Standard rate for ${esc(r.company)}"></span>
            <span class="right"><input class="amt" type="number" inputmode="decimal" step="0.01" placeholder="—" value="${r.rush != null ? Number(r.rush).toFixed(2) : ""}" data-rush="${esc(r.company)}" aria-label="Rush rate for ${esc(r.company)}"></span>
            <span class="muted small">${esc(r.bill_to || "")}</span>
          </div>`).join("")}
        </div>
        <p class="muted small">ProVest foreclosures count per packet — the standard price here is the price of one packet.</p>
        <div id="printSheet" class="print-only"></div>
      </section>`;
    document.querySelectorAll("[data-std],[data-rush]").forEach((inp) => inp.onchange = async () => {
      const col = inp.hasAttribute("data-std") ? "standard" : "rush";
      const company = inp.getAttribute("data-std") || inp.getAttribute("data-rush");
      const patch = {}; patch[col] = num(inp.value);
      const { error } = await J().db.from("jes_rates").update(patch).eq("company", company);
      J().toast(error ? "Not saved: " + error.message : `${company} saved`);
      await load();
    });
  }

  // =====================================================================
  // EXPORT — your whole year in one spreadsheet file
  // =====================================================================
  async function exportAll() {
    if (!O.jobs.length) await load();
    const head = ["Date done", "Company", "Job #", "Name", "Address", "County", "Served/Non", "Reason",
      "Attempts", "Price", "Billed", "Paid", "Paid on", "Sheet", "Status"];
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const rows = O.jobs
      .slice()
      .sort((a, b) => new Date(a.done_at || a.created_at || 0) - new Date(b.done_at || b.created_at || 0))
      .map((j) => {
        const s = O.sheets.find((x) => x.id === j.sheet_id);
        return [String(j.done_at || "").slice(0, 10), j.client, j.job_no, j.person, j.address, j.county,
          j.outcome || "", j.ns_reason || "", j.attempt_count || 0, j.price, j.billed, j.paid_amount,
          String(j.paid_on || "").slice(0, 10), s ? (s.sheet_no || s.company + " (open)") : "", j.status].map(q).join(",");
      });
    const csv = head.map(q).join(",") + "\n" + rows.join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `j-empire-server-${todayISO()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    J().toast(`${rows.length} jobs exported`);
  }

  window.JES_OFFICE = { drawSheets, drawMoney, drawRates, openSheet, openTracker, sheetFor, sheetTotal, exportAll };
})();
