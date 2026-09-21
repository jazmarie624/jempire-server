// J EMPIRE SERVER — office.js (version 2: invoice defaults to this Thu–Thu week)
(function () {
  "use strict";
  const J = () => window.JES;
  const byId = (id) => document.getElementById(id);
  const isDone = (j) => j.status === "Served" || j.status === "Non-Serve Complete";
  const GROUPS = {
    "Jean": { clients: ["ProVest", "Userve"], billTo: "Quick Service Legal — Jean" },
    "Ody's": { clients: ["Ody's"], billTo: "Ody's Professional Process" },
    "Private": { clients: ["Private"], billTo: "" }
  };

  // ---------- dates (serve week = Thursday to Thursday) ----------
  function weekStart(d) {
    const x = new Date(d || Date.now()); x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() - 4 + 7) % 7));
    return x;
  }
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const isoDay = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
  const fromIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const mdy = (d) => { const x = new Date(d); return `${String(x.getMonth() + 1).padStart(2, "0")}/${String(x.getDate()).padStart(2, "0")}/${x.getFullYear()}`; };
  const md = (d) => mdy(d).slice(0, 5);
  const dayName = (d) => new Date(d).toLocaleDateString([], { weekday: "short" });
  const periodLabel = (s, e) => `${dayName(s)} ${md(s)} – ${dayName(e)} ${mdy(e)}`;

  async function load() {
    const db = J().db;
    const [jobs, invs, exps, sets] = await Promise.all([
      db.from("jes_jobs").select("*").order("done_at", { ascending: false }),
      db.from("jes_invoices").select("*").order("created_at", { ascending: false }),
      db.from("jes_expenses").select("*").order("day", { ascending: false }),
      db.from("jes_settings").select("*")
    ]);
    const settings = {};
    (sets.data || []).forEach((r) => { settings[r.key] = r.value; });
    return { jobs: jobs.data || [], invoices: invs.data || [], expenses: exps.data || [], settings, error: jobs.error || invs.error };
  }
  async function upd(table, id, patch) {
    const { error } = await J().db.from(table).update(patch).eq("id", id);
    if (error) J().toast("Not saved: " + error.message);
    return !error;
  }

  // =====================================================================
  // DONE TAB — afternoon checklist, grouped by day
  // =====================================================================
  let doneFilter = "Needs checking";
  async function drawDone() {
    const { esc, money } = J();
    byId("screen").innerHTML = `<section class="office"><div class="jobs-head"><h1>Done</h1></div>
      <div class="chips" id="dFilter">${["Needs checking", "All done"].map((f) => `<button class="chip ${f === doneFilter ? "on" : ""}" data-f="${f}">${f}</button>`).join("")}</div>
      <div id="dList"><p class="muted">Loading…</p></div></section>
      <div class="sheet-back" id="sheetBack" hidden></div>`;
    byId("dFilter").onclick = (e) => { const b = e.target.closest("[data-f]"); if (b) { doneFilter = b.dataset.f; drawDone(); } };
    const D = await load();
    let list = D.jobs.filter(isDone);
    const checked = (j) => j.chk_client_app && j.chk_proof && j.chk_price;
    if (doneFilter === "Needs checking") list = list.filter((j) => !checked(j));
    if (!list.length) { byId("dList").innerHTML = `<p class="muted center">${doneFilter === "Needs checking" ? "Everything is checked off. ✓" : "No finished jobs yet."}</p>`; return; }

    const days = {};
    list.forEach((j) => { const k = j.done_at ? isoDay(j.done_at) : "unknown"; (days[k] = days[k] || []).push(j); });
    byId("dList").innerHTML = Object.keys(days).sort().reverse().map((k) => `
      <h2 class="day-head">${k === "unknown" ? "No date" : fromIso(k).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</h2>
      ${days[k].map((j) => `
        <div class="check-card ${checked(j) ? "all-ok" : ""}">
          <div class="draft-name">${esc(j.person || "(no name)")}${j.job_no ? ` <span class="jobno">#${esc(j.job_no)}</span>` : ""}
            <span class="tag done">${j.status === "Served" ? "Served" : "Non-serve"}</span>${j.invoice_id ? ` <span class="tag">On invoice</span>` : ""}</div>
          <div class="draft-addr">${esc(j.client || "")} · ${esc(j.address || "")}</div>
          <div class="checks">
            <label><input type="checkbox" data-chk="chk_client_app" data-id="${j.id}" ${j.chk_client_app ? "checked" : ""}> Entered in ${esc(j.client || "client")}'s app</label>
            <label><input type="checkbox" data-chk="chk_proof" data-id="${j.id}" ${j.chk_proof ? "checked" : ""}> Proof uploaded there</label>
            <label><input type="checkbox" data-chk="chk_price" data-id="${j.id}" ${j.chk_price ? "checked" : ""}> Price confirmed</label>
          </div>
          <div class="row-gap">
            <label class="price-in">$<input inputmode="decimal" data-price="${j.id}" value="${Number(j.price || 0).toFixed(2)}" aria-label="Price"></label>
            <button class="btn ghost thin" data-open="${j.id}">Edit job</button>
          </div>
        </div>`).join("")}`).join("");
    const findJ = (id) => D.jobs.find((j) => j.id === id);
    byId("dList").querySelectorAll("[data-chk]").forEach((c) => c.onchange = async () => {
      const j = findJ(c.dataset.id); j[c.dataset.chk] = c.checked;
      await upd("jes_jobs", j.id, { [c.dataset.chk]: c.checked });
      c.closest(".check-card").classList.toggle("all-ok", checked(j));
    });
    byId("dList").querySelectorAll("[data-price]").forEach((inp) => inp.onchange = async () => {
      const v = Number(String(inp.value).replace(/[^0-9.]/g, "")) || 0;
      inp.value = v.toFixed(2);
      if (await upd("jes_jobs", inp.dataset.price, { price: v })) J().toast("Price saved " + money(v));
    });
    byId("dList").querySelectorAll("[data-open]").forEach((b) => b.onclick = () => window.JES_JOBS.openJob(findJ(b.dataset.open), drawDone));
  }

  // =====================================================================
  // MONEY & INVOICES TAB
  // =====================================================================
  let invFilter = "All";
  async function drawMoney() {
    const { esc, money } = J();
    byId("screen").innerHTML = `<section class="office"><p class="muted">Loading…</p></section><div class="sheet-back" id="sheetBack" hidden></div>`;
    const D = await load();
    if (D.error) { byId("screen").querySelector(".office").innerHTML = `<div class="alert">Couldn't load: ${esc(D.error.message)}</div>`; return; }
    const ws = weekStart(), we = addDays(ws, 7);
    const inWeek = (t) => t && new Date(t) >= ws && new Date(t) < we;
    const doneWeek = D.jobs.filter((j) => isDone(j) && inWeek(j.done_at));
    const earned = doneWeek.reduce((s, j) => s + Number(j.price || 0), 0);
    const expWeek = D.expenses.filter((e) => inWeek(fromIso(e.day)));
    const costs = expWeek.reduce((s, e) => s + Number(e.amount || 0), 0);
    const milesWeek = expWeek.reduce((s, e) => s + Number(e.miles || 0), 0);
    const owed = D.invoices.filter((i) => i.status === "Pending").reduce((s, i) => s + Number(i.total || 0), 0);
    const paidWeek = D.invoices.filter((i) => i.status === "Paid" && i.paid_on && inWeek(fromIso(i.paid_on))).reduce((s, i) => s + Number(i.total || 0), 0)
      + D.jobs.filter((j) => j.paid_upfront && inWeek(j.done_at)).reduce((s, j) => s + Number(j.price || 0), 0);
    const attempting = D.jobs.filter((j) => j.status === "Active" && (j.attempt_count || 0) > 0).length;
    const goal = Number(D.settings.weekly_goal || 500);
    const notBilled = D.jobs.filter((j) => isDone(j) && !j.invoice_id && !j.paid_upfront && j.client !== "ABC Legal").length;

    const invs = D.invoices.filter((i) => invFilter === "All" || i.grp === invFilter);
    byId("screen").querySelector(".office").innerHTML = `
      <div class="jobs-head"><h1>Money &amp; Invoices</h1><span class="muted">Week: ${esc(periodLabel(ws, we))}</span></div>
      <div class="glance money-grid">
        <div class="tile green"><div class="tile-label">Earned this week</div><div class="tile-value">${money(earned)}</div><div class="tile-sub">${doneWeek.length} done · goal ${money(goal)}</div>
          <div class="bar"><span style="width:${Math.min(100, goal ? earned / goal * 100 : 0)}%"></span></div></div>
        <div class="tile"><div class="tile-label">Gas, tolls &amp; costs</div><div class="tile-value">${money(costs)}</div><div class="tile-sub">${milesWeek ? milesWeek.toFixed(0) + " miles logged" : "Nothing logged yet"}</div></div>
        <div class="tile green"><div class="tile-label">Real profit</div><div class="tile-value">${money(earned - costs)}</div><div class="tile-sub">Earned minus costs</div></div>
        <div class="tile red"><div class="tile-label">Owed to you</div><div class="tile-value">${money(owed)}</div><div class="tile-sub">Pending invoices</div></div>
        <div class="tile green"><div class="tile-label">Paid this week</div><div class="tile-value">${money(paidWeek)}</div><div class="tile-sub">Money received</div></div>
        <div class="tile"><div class="tile-label">Still attempting</div><div class="tile-value">${attempting}</div><div class="tile-sub">Not counted as money yet</div></div>
      </div>
      ${notBilled ? `<button class="alert tap" id="mNotBilled">${notBilled} finished job${notBilled > 1 ? "s are" : " is"} not on an invoice yet. Tap to start one.</button>` : ""}
      <div class="row-gap wrap">
        <button class="btn" id="mNewInv">+ New Invoice</button>
        <button class="btn ghost" id="mExpense">+ Log gas / tolls / miles</button>
      </div>
      <h2>Invoice History</h2>
      <div class="chips" id="iFilter">${["All", "Jean", "Ody's", "Private"].map((f) => `<button class="chip ${f === invFilter ? "on" : ""}" data-f="${f}">${f}</button>`).join("")}</div>
      <div class="inv-list">${invs.length ? invs.map((i) => `
        <div class="inv-card ${i.status === "Paid" ? "paid" : "pending"}">
          <div class="inv-top">
            <div><div class="draft-name">${esc(i.grp)} · ${esc(i.period_start ? periodLabel(fromIso(i.period_start), fromIso(i.period_end)) : "")}</div>
              <div class="draft-addr">${esc(i.bill_to || "")} · ${(i.lines || []).length} job${(i.lines || []).length === 1 ? "" : "s"} · <b>${money(i.total)}</b> · ${esc(i.inv_no)}</div></div>
            <span class="status-pill">${i.status === "Paid" ? "PAID " + esc(i.paid_on ? mdy(fromIso(i.paid_on)) : "") : "PENDING PAYMENT"}</span>
          </div>
          <div class="row-gap wrap">
            ${i.status === "Paid"
              ? `<button class="btn ghost thin" data-unpay="${i.id}">Mark unpaid</button>`
              : `<label class="paid-on">Paid on <input type="date" data-date="${i.id}" value="${isoDay(new Date())}"></label><button class="btn go thin" data-pay="${i.id}">Mark Paid</button>`}
            <button class="btn ghost thin" data-print="${i.id}">Print</button>
            <button class="btn ghost thin danger" data-del="${i.id}">Delete</button>
          </div>
        </div>`).join("") : `<p class="muted">No invoices yet.</p>`}</div>
      ${expWeek.length ? `<h2>This week's costs</h2><div class="exp-list">${expWeek.map((e) => `
        <div class="exp-line"><span>${esc(mdy(fromIso(e.day)))} · <b>${esc(e.kind)}</b>${e.miles ? " · " + esc(e.miles) + " mi" : ""}${e.note ? " · " + esc(e.note) : ""}</span>
        <span>${money(e.amount)} <button class="icon-btn small-x" data-delexp="${e.id}" aria-label="Delete this cost">✕</button></span></div>`).join("")}</div>` : ""}
      <details class="settings"><summary>Settings: default prices, weekly goal, home address</summary>
        <div class="grid2">${["ABC Legal", "Ody's", "ProVest", "Userve", "Private"].map((c) => `
          <label>${esc(c)} default price<input inputmode="decimal" data-dp="${esc(c)}" value="${Number((D.settings.default_prices || {})[c] || 0).toFixed(2)}"></label>`).join("")}
          <label>Weekly goal<input inputmode="decimal" id="sGoal" value="${goal}"></label>
        </div>
        <label>Home address (route start)<input id="sHome" value="${esc(D.settings.home_address || "")}"></label>
        <button class="btn" id="sSave">Save settings</button>
        <p class="muted small">New jobs use these default prices. You can still change any single job's price.</p>
      </details>
      <div id="printSheet" class="print-only"></div>`;

    byId("iFilter").onclick = (e) => { const b = e.target.closest("[data-f]"); if (b) { invFilter = b.dataset.f; drawMoney(); } };
    byId("mNewInv").onclick = () => newInvoice(D);
    if (byId("mNotBilled")) byId("mNotBilled").onclick = () => newInvoice(D);
    byId("mExpense").onclick = () => addExpense();
    const scr = byId("screen");
    scr.querySelectorAll("[data-pay]").forEach((b) => b.onclick = async () => {
      const d = scr.querySelector(`[data-date="${b.dataset.pay}"]`).value;
      if (!d) { J().toast("Pick the date it was paid"); return; }
      if (await upd("jes_invoices", b.dataset.pay, { status: "Paid", paid_on: d })) { J().toast("Marked paid ✓"); drawMoney(); }
    });
    scr.querySelectorAll("[data-unpay]").forEach((b) => b.onclick = async () => {
      if (await upd("jes_invoices", b.dataset.unpay, { status: "Pending", paid_on: null })) drawMoney();
    });
    scr.querySelectorAll("[data-print]").forEach((b) => b.onclick = () => printInvoice(D.invoices.find((i) => i.id === b.dataset.print)));
    scr.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      if (!confirm("Delete this invoice? Its jobs go back to 'not invoiced' so you can bill them again.")) return;
      await J().db.from("jes_jobs").update({ invoice_id: null }).eq("invoice_id", b.dataset.del);
      const { error } = await J().db.from("jes_invoices").delete().eq("id", b.dataset.del);
      J().toast(error ? "Not deleted: " + error.message : "Invoice deleted"); drawMoney();
    });
    scr.querySelectorAll("[data-delexp]").forEach((b) => b.onclick = async () => {
      if (!confirm("Delete this cost?")) return;
      await J().db.from("jes_expenses").delete().eq("id", b.dataset.delexp); drawMoney();
    });
    byId("sSave").onclick = async () => {
      const dp = {};
      scr.querySelectorAll("[data-dp]").forEach((i) => { dp[i.dataset.dp] = Number(String(i.value).replace(/[^0-9.]/g, "")) || 0; });
      const rows = [
        { key: "default_prices", value: dp },
        { key: "weekly_goal", value: Number(byId("sGoal").value) || 500 },
        { key: "home_address", value: byId("sHome").value.trim() }
      ];
      const { error } = await J().db.from("jes_settings").upsert(rows);
      try { localStorage.removeItem("jes_home_ll"); } catch (e) {}
      J().toast(error ? "Not saved: " + error.message : "Settings saved"); drawMoney();
    };
  }

  // ---------- new invoice: you pick every job ----------
  function newInvoice(D) {
    const { esc, money } = J();
    const back = byId("sheetBack");
    // The week you'd hand in next: ends this Thursday (today, if today is Thursday)
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const endThu = today.getDay() === 4 ? today : addDays(weekStart(), 7);
    const st = { grp: "Jean", start: addDays(endThu, -7), end: endThu, billTo: GROUPS.Jean.billTo, picked: new Set(), showAll: false };
    const draw = () => {
      const g = GROUPS[st.grp];
      const inPeriod = (j) => j.done_at && new Date(j.done_at) >= st.start && new Date(j.done_at) < addDays(st.end, 1);
      let pool = D.jobs.filter((j) => g.clients.includes(j.client));
      if (!st.showAll) pool = pool.filter((j) => isDone(j) || (j.attempt_count || 0) > 0);
      pool.sort((a, b) => (!!a.invoice_id - !!b.invoice_id) || (inPeriod(b) - inPeriod(a)) || (isDone(b) - isDone(a)) ||
        (st.grp === "Jean" ? (a.client === "ProVest" ? -1 : 1) - (b.client === "ProVest" ? -1 : 1) : 0));
      const picked = pool.filter((j) => st.picked.has(j.id));
      const sub = (c) => picked.filter((j) => j.client === c).reduce((s, j) => s + Number(j.price || 0), 0);
      const total = picked.reduce((s, j) => s + Number(j.price || 0), 0);
      const verified = (j) => j.chk_client_app && j.chk_proof && j.chk_price;
      back.hidden = false;
      back.innerHTML = `
        <div class="sheet wide" role="dialog" aria-modal="true" aria-labelledby="niTitle">
          <h2 id="niTitle">New Invoice</h2>
          <div class="seg">${Object.keys(GROUPS).map((k) => `<button class="${k === st.grp ? "on" : ""}" data-g="${k}">${k}</button>`).join("")}</div>
          <div class="grid2">
            <label>Bill to<input id="niBill" value="${esc(st.billTo)}" placeholder="${st.grp === "Private" ? "Client name" : ""}"></label>
            <span></span>
            <label>From (Thursday)<input type="date" id="niStart" value="${isoDay(st.start)}"></label>
            <label>To (Thursday)<input type="date" id="niEnd" value="${isoDay(st.end)}"></label>
          </div>
          <div class="row-gap wrap">
            <button class="btn ghost thin" id="niPickPeriod">Tick all finished jobs in these dates</button>
            <label class="check-line"><input type="checkbox" id="niAll" ${st.showAll ? "checked" : ""}> Show jobs with no attempts too</label>
          </div>
          <div class="pick-list">${pool.length ? pool.map((j) => {
            const tag = j.status === "Served" ? `<span class="tag done">Served ${j.done_at ? md(j.done_at) : ""}</span>`
              : j.status === "Non-Serve Complete" ? `<span class="tag navy">Non-serve · 5 attempts</span>`
              : `<span class="tag hold">Attempt ${j.attempt_count || 0} of 5</span>`;
            const locked = !!j.invoice_id;
            return `<label class="pick-row ${st.picked.has(j.id) ? "on" : ""} ${locked ? "locked" : ""}">
              <input type="checkbox" data-pick="${j.id}" ${st.picked.has(j.id) ? "checked" : ""} ${locked ? "disabled" : ""}>
              <span class="draft-text"><span class="draft-name">${esc(j.person || "(no name)")}${j.job_no ? ` <span class="jobno">#${esc(j.job_no)}</span>` : ""}</span>
                <span class="draft-addr">${esc(j.client)} · ${esc(j.address || "")}</span>
                <span class="draft-later ${verified(j) ? "ok" : "bad"}">${locked ? "Already on an invoice" : verified(j) ? "Checked in " + esc(j.client) + "'s app ✓" : "Not fully checked in " + esc(j.client) + "'s app yet"}</span></span>
              <span class="pick-right">${tag}<b>${money(j.price)}</b></span>
            </label>`;
          }).join("") : `<p class="muted">No ${esc(st.grp)} jobs to show.</p>`}</div>
          <div class="inv-sum">
            ${st.grp === "Jean" ? `<div><span>ProVest (${picked.filter((j) => j.client === "ProVest").length})</span><span>${money(sub("ProVest"))}</span></div>
            <div><span>Userve (${picked.filter((j) => j.client === "Userve").length})</span><span>${money(sub("Userve"))}</span></div>` : ""}
            <div class="due"><span>Amount Due (${picked.length} job${picked.length === 1 ? "" : "s"})</span><span>${money(total)}</span></div>
          </div>
          <div class="sheet-btns">
            <button class="btn ghost" id="niCancel">Cancel</button>
            <button class="btn" id="niSave" ${picked.length ? "" : "disabled"}>Save Invoice</button>
            <button class="btn go" id="niSavePrint" ${picked.length ? "" : "disabled"}>Save &amp; Print</button>
          </div>
        </div>`;
      back.querySelectorAll("[data-g]").forEach((b) => b.onclick = () => { st.grp = b.dataset.g; st.billTo = GROUPS[st.grp].billTo; st.picked.clear(); draw(); });
      byId("niBill").oninput = (e) => { st.billTo = e.target.value; };
      byId("niStart").onchange = (e) => { if (e.target.value) { st.start = fromIso(e.target.value); draw(); } };
      byId("niEnd").onchange = (e) => { if (e.target.value) { st.end = fromIso(e.target.value); draw(); } };
      byId("niAll").onchange = (e) => { st.showAll = e.target.checked; draw(); };
      byId("niPickPeriod").onclick = () => { pool.filter((j) => !j.invoice_id && isDone(j) && inPeriod(j)).forEach((j) => st.picked.add(j.id)); draw(); };
      back.querySelectorAll("[data-pick]").forEach((c) => c.onchange = () => { c.checked ? st.picked.add(c.dataset.pick) : st.picked.delete(c.dataset.pick); draw(); });
      byId("niCancel").onclick = () => { back.hidden = true; back.innerHTML = ""; };
      byId("niSave").onclick = () => save(false, picked);
      byId("niSavePrint").onclick = () => save(true, picked);
    };
    async function save(andPrint, picked) {
      if (st.grp === "Private" && !st.billTo.trim()) { J().toast("Type who you're billing"); return; }
      const order = st.grp === "Jean" ? ["ProVest", "Userve"] : [GROUPS[st.grp].clients[0]];
      let n = 0;
      const lines = [];
      order.forEach((c) => picked.filter((j) => j.client === c).forEach((j) => lines.push({
        n: ++n, section: c, job_id: j.id, job_no: j.job_no || "", name: j.person || j.address || "", address: j.address || "", price: Number(j.price || 0)
      })));
      const total = lines.reduce((s, l) => s + l.price, 0);
      const { data, error } = await J().db.from("jes_invoices").insert({
        grp: st.grp, bill_to: st.billTo.trim(), period_start: isoDay(st.start), period_end: isoDay(st.end), lines, total
      }).select().single();
      if (error) { J().toast("Not saved: " + error.message); return; }
      await J().db.from("jes_jobs").update({ invoice_id: data.id }).in("id", lines.map((l) => l.job_id));
      back.hidden = true; back.innerHTML = "";
      J().toast("Invoice saved — red until you mark it paid");
      await drawMoney();
      if (andPrint) printInvoice(data);
    }
    draw();
  }

  // ---------- plain printed invoice (black ink) ----------
  function printInvoice(inv) {
    const { esc, money } = J();
    const sections = [...new Set((inv.lines || []).map((l) => l.section))];
    const multi = sections.length > 1 || inv.grp === "Jean";
    byId("printSheet").innerHTML = `
      <div class="inv-print">
        <div class="ip-head">
          <div><div class="ip-me">Jazmin Aguayo</div><div>Bill to: ${esc(inv.bill_to || "")}</div></div>
          <div class="ip-week">Week<br><b>${esc(periodLabel(fromIso(inv.period_start), fromIso(inv.period_end)))}</b></div>
        </div>
        ${sections.map((s) => {
          const ls = inv.lines.filter((l) => l.section === s);
          return `${multi ? `<div class="ip-sec">${esc(s.toUpperCase())}</div>` : ""}
            <table class="ip-table">${ls.map((l) => `<tr><td class="ip-n">${l.n}.</td><td class="ip-no">${esc(l.job_no ? "#" + l.job_no : "")}</td><td>${esc(l.name)}</td><td class="ip-amt">${money(l.price)}</td></tr>`).join("")}</table>
            ${multi ? `<div class="ip-sub">${esc(s)} total&nbsp;&nbsp;${money(ls.reduce((a, l) => a + l.price, 0))}</div>` : ""}`;
        }).join("")}
        <div class="ip-due"><span>AMOUNT DUE</span><span>${money(inv.total)}</span></div>
      </div>`;
    window.print();
  }

  // ---------- log gas / tolls / miles ----------
  function addExpense() {
    const back = byId("sheetBack");
    back.hidden = false;
    back.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="exTitle">
        <h2 id="exTitle">Log a cost</h2>
        <div class="grid2">
          <label>Date<input type="date" id="exDay" value="${isoDay(new Date())}"></label>
          <label>Type<select id="exKind">${["Gas", "Tolls", "Parking", "Miles", "Other"].map((k) => `<option>${k}</option>`).join("")}</select></label>
          <label>Amount ($)<input id="exAmt" inputmode="decimal" placeholder="0.00"></label>
          <label>Miles (optional)<input id="exMiles" inputmode="decimal" placeholder="0"></label>
        </div>
        <label>Note<input id="exNote" placeholder="Optional"></label>
        <div class="sheet-btns"><button class="btn ghost" id="exCancel">Cancel</button><button class="btn" id="exSave">Save</button></div>
      </div>`;
    const close = () => { back.hidden = true; back.innerHTML = ""; };
    byId("exCancel").onclick = close;
    byId("exSave").onclick = async () => {
      const row = {
        day: byId("exDay").value || isoDay(new Date()), kind: byId("exKind").value,
        amount: Number(String(byId("exAmt").value).replace(/[^0-9.]/g, "")) || 0,
        miles: Number(String(byId("exMiles").value).replace(/[^0-9.]/g, "")) || null,
        note: byId("exNote").value.trim() || null
      };
      const { error } = await J().db.from("jes_expenses").insert(row);
      if (error) { J().toast("Not saved: " + error.message); return; }
      close(); J().toast("Cost logged"); drawMoney();
    };
  }

  window.JES_OFFICE = { drawDone, drawMoney };
})();
