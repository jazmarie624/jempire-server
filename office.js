// J EMPIRE SERVER — office.js (version 25: names and job numbers typed straight on the sheet —  warns about blank names and job numbers before closing —  paid button reports failures —  J Empire invoice for everyone but Jean's two —  take a line back off a sheet —  Sheets, payment trackers, Jean's printed form)
// One open sheet per company. Served / Non-Served drops a line on it by itself.
// Close a sheet to freeze it, print it, and open a line in that company's tracker.
(function () {
  "use strict";
  window.JES_VER = Object.assign(window.JES_VER || {}, { office: 25 });
  const J = () => window.JES;
  const byId = (id) => document.getElementById(id);
  const O = { rates: [], sheets: [], jobs: [], goal: 500, rate: 0.7 };

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
            <span>#</span><span>Date · Job #</span><span>Name</span><span>S/NS</span><span class="right">Amount</span><span class="center">✓</span><span class="center">↩</span>
          </div>
          ${ls.length ? ls.map((j, i) => `
            <div class="sl-row ${!Number(j.price) ? "zero" : ""}">
              <span class="muted">${i + 1}</span>
              <span class="sl-date">${esc(fmtDay(j.done_at))}<input class="cell-in ${j.job_no ? "" : "empty"}" value="${esc(j.job_no || "")}" placeholder="job #" data-jobno="${j.id}" aria-label="Job number"></span>
              <span class="sl-name"><input class="cell-in wide ${j.person ? "" : "empty"}" value="${esc(j.person || "")}" placeholder="tap to add name" data-person="${j.id}" aria-label="Name"><span class="sl-tags">${j.is_foreclosure ? `<span class="tag purple">📚 ×${j.packets || 1}</span>` : ""}${j.ns_reason ? ` <span class="muted small">${esc(j.ns_reason)}</span>` : ""}</span></span>
              <span class="sl-sn ${j.outcome === "Served" ? "ok" : ""}">${j.outcome === "Served" ? "S" : "NS"}</span>
              <span class="right"><input class="amt" type="number" inputmode="decimal" step="0.01" placeholder="—" value="${j.price != null && Number(j.price) ? Number(j.price).toFixed(2) : ""}" data-price="${j.id}" aria-label="Amount for ${esc(j.person || "job")}"></span>
              <span class="center"><button class="tick ${j.chk_client_app ? "on" : ""}" data-tick="${j.id}" aria-label="Entered in their app">${j.chk_client_app ? "✓" : "·"}</button></span>
              <span class="center"><button class="tick undo" data-unserve="${j.id}" aria-label="Put ${esc(j.person || "this job")} back on the route">↩</button></span>
            </div>`).join("")
          : `<p class="muted center pad">Nothing on this sheet yet. Tap Served or Non-Served out on the route and it lands here.</p>`}
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
            <div class="sum"><span>Miles banked this year</span><b>${milesTotal.toFixed(0)} mi · ${money(milesMoney)}</b></div>
          </div>
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
              <span class="sl-name" data-job="${j.id}">${esc(j.person || "(no name)")}${j.is_foreclosure ? ` <span class="tag purple">📚 ×${j.packets || 1}</span>` : ""}</span>
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
