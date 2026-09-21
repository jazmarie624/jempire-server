// J EMPIRE SERVER — office.js (version 4: invoice columns, editable prices, extra charges, open & edit saved invoices)
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
    const list = jobs.data || [];
    // Any job still at $0 (and not already billed) picks up its client's default price
    const dp = settings.default_prices || {};
    const fix = {};
    list.forEach((j) => {
      const def = Number(dp[j.client] || 0);
      if (def > 0 && !Number(j.price) && !j.invoice_id) { j.price = def; (fix[j.client] = fix[j.client] || []).push(j.id); }
    });
    await Promise.all(Object.keys(fix).map((c) => db.from("jes_jobs").update({ price: Number(dp[c]) }).in("id", fix[c])));
    return { jobs: list, invoices: invs.data || [], expenses: exps.data || [], settings, error: jobs.error || invs.error };
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
  // OFFICE HUB (iPhone "Office" tab)
  // =====================================================================
  function drawHub() {
    byId("screen").innerHTML = `<section class="office hub">
      <h1>Office</h1>
      <button class="hub-btn" data-go="done"><span class="hub-num">4</span><span><b>Done checklist</b><span class="muted">Check each finished job in the client's app</span></span></button>
      <button class="hub-btn" data-go="invoices"><span class="hub-num">5</span><span><b>Invoices</b><span class="muted">Jean · Ody's · Private — build, print, mark paid</span></span></button>
      <button class="hub-btn" data-go="money"><span class="hub-num">6</span><span><b>Money</b><span class="muted">Earnings, costs, profit, settings</span></span></button>
    </section>`;
  }

  // =====================================================================
  // INVOICES TAB (step 5) — one column per client: Jean · Ody's · Private
  // =====================================================================
  let phoneCol = "Jean";
  let lastD = null;
  const jobLines = (i) => (i.lines || []).filter((l) => !l.extra);
  const extraLines = (i) => (i.lines || []).filter((l) => l.extra);

  async function drawInvoices() {
    const { esc, money } = J();
    byId("screen").innerHTML = `<section class="office"><p class="muted">Loading…</p></section><div class="sheet-back" id="sheetBack" hidden></div>`;
    const D = await load(); lastD = D;
    if (D.error) { byId("screen").querySelector(".office").innerHTML = `<div class="alert">Couldn't load: ${esc(D.error.message)}</div>`; return; }
    const notBilled = D.jobs.filter((j) => isDone(j) && !j.invoice_id && !j.paid_upfront && j.client !== "ABC Legal").length;

    const col = (g) => {
      const list = D.invoices.filter((i) => i.grp === g);
      const owed = list.filter((i) => i.status !== "Paid").reduce((a, i) => a + Number(i.total || 0), 0);
      const paid = list.filter((i) => i.status === "Paid").reduce((a, i) => a + Number(i.total || 0), 0);
      return `
      <div class="inv-col ${g === phoneCol ? "phone-on" : ""}">
        <div class="col-head">
          <div><h2>${esc(g)}</h2><div class="col-sub">${g === "Jean" ? "ProVest + Userve" : g === "Ody's" ? "Ody's jobs" : "Private serves"}</div></div>
          <button class="btn thin" data-new="${esc(g)}">+ New</button>
        </div>
        <div class="col-totals"><span class="bad">Owed ${money(owed)}</span><span class="ok">Paid ${money(paid)}</span></div>
        <div class="col-list">${list.length ? list.map((i) => `
          <button class="inv-mini ${i.status === "Paid" ? "paid" : "pending"}" data-open="${i.id}">
            <span class="im-top"><b>${esc(i.period_start ? md(fromIso(i.period_start)) + " – " + md(fromIso(i.period_end)) : "")}</b><span class="im-total">${money(i.total)}</span></span>
            <span class="im-sub">${jobLines(i).length} job${jobLines(i).length === 1 ? "" : "s"}${extraLines(i).length ? ` + ${extraLines(i).length} extra` : ""} · ${i.status === "Paid" ? "Paid " + esc(i.paid_on ? md(fromIso(i.paid_on)) : "") : "Pending payment"}</span>
          </button>`).join("") : `<p class="muted small center">No invoices yet.</p>`}</div>
      </div>`;
    };

    byId("screen").querySelector(".office").innerHTML = `
      <div class="jobs-head"><h1>Invoices</h1><span class="muted small">Tap any invoice to see its jobs, change prices, or add charges.</span></div>
      ${notBilled ? `<button class="alert tap" id="mNotBilled">${notBilled} finished job${notBilled > 1 ? "s are" : " is"} not on an invoice yet. Tap to start one.</button>` : ""}
      <div class="chips phone-only" id="colPick">${Object.keys(GROUPS).map((g) => `<button class="chip ${g === phoneCol ? "on" : ""}" data-col="${g}">${g}</button>`).join("")}</div>
      <div class="inv-cols">${Object.keys(GROUPS).map(col).join("")}</div>
      <div id="printSheet" class="print-only"></div>`;

    const scr = byId("screen");
    byId("colPick").onclick = (e) => { const b = e.target.closest("[data-col]"); if (b) { phoneCol = b.dataset.col; drawInvoices(); } };
    scr.querySelectorAll("[data-new]").forEach((b) => b.onclick = () => newInvoice(D, b.dataset.new));
    if (byId("mNotBilled")) byId("mNotBilled").onclick = () => newInvoice(D, phoneCol);
    scr.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openInvoice(D.invoices.find((i) => i.id === b.dataset.open), D));
  }

  // ---------- open a saved invoice: see jobs, edit prices, add charges, mark paid ----------
  function openInvoice(inv, D) {
    const { esc, money } = J();
    const back = byId("sheetBack");
    const st = {
      billTo: inv.bill_to || "",
      start: inv.period_start, end: inv.period_end,
      lines: jobLines(inv).map((l) => ({ ...l })),
      extras: extraLines(inv).map((l) => ({ ...l })),
      removed: []
    };
    const total = () => st.lines.reduce((a, l) => a + Number(l.price || 0), 0) + st.extras.reduce((a, l) => a + Number(l.price || 0), 0);
    const draw = () => {
      const sections = [...new Set(st.lines.map((l) => l.section))];
      let n = 0;
      back.hidden = false;
      back.innerHTML = `
        <div class="sheet wide" role="dialog" aria-modal="true" aria-labelledby="ovTitle">
          <div class="ov-head">
            <div><h2 id="ovTitle">${esc(inv.grp)} invoice</h2><div class="muted small">${esc(inv.inv_no)}</div></div>
            <span class="status-pill ${inv.status === "Paid" ? "pill-paid" : "pill-pending"}">${inv.status === "Paid" ? "PAID " + esc(inv.paid_on ? mdy(fromIso(inv.paid_on)) : "") : "PENDING PAYMENT"}</span>
          </div>
          <div class="grid2">
            <label>Bill to<input id="ovBill" value="${esc(st.billTo)}"></label><span></span>
            <label>From<input type="date" id="ovStart" value="${esc(st.start || "")}"></label>
            <label>To<input type="date" id="ovEnd" value="${esc(st.end || "")}"></label>
          </div>
          <div class="ov-lines">
            ${sections.map((sec) => `<div class="inv-sec">${esc(sec)}</div>` + st.lines.map((l, k) => l.section !== sec ? "" : `
              <div class="ov-line">
                <span class="il-n">${++n}.</span>
                <span class="il-no">${esc(l.job_no ? "#" + l.job_no : "no job #")}</span>
                <span class="il-name">${esc(l.name)}</span>
                <label class="price-in">$<input inputmode="decimal" data-lp="${k}" value="${Number(l.price || 0).toFixed(2)}" aria-label="Price for ${esc(l.name)}"></label>
                <button class="icon-btn small-x" data-rm="${k}" aria-label="Take ${esc(l.name)} off this invoice">✕</button>
              </div>`).join("")).join("")}
            <div class="inv-sec">Extra charges</div>
            ${st.extras.map((l, k) => `
              <div class="ov-line">
                <span class="il-n">+</span>
                <input class="ex-desc" data-ed="${k}" value="${esc(l.name)}" placeholder="What for (extra stop, printing…)" aria-label="Extra charge description">
                <label class="price-in">$<input inputmode="decimal" data-ep="${k}" value="${Number(l.price || 0).toFixed(2)}" aria-label="Extra charge amount"></label>
                <button class="icon-btn small-x" data-erm="${k}" aria-label="Remove this extra charge">✕</button>
              </div>`).join("")}
            <button class="btn ghost thin" id="ovAddExtra">+ Add extra charge</button>
          </div>
          <div class="inv-sum"><div class="due"><span>Amount Due</span><span id="ovTotal">${money(total())}</span></div></div>
          <div class="row-gap wrap">
            ${inv.status === "Paid"
              ? `<button class="btn ghost thin" id="ovUnpay">Mark unpaid</button>`
              : `<label class="paid-on">Paid on <input type="date" id="ovPaidOn" value="${isoDay(new Date())}"></label><button class="btn go thin" id="ovPay">Mark Paid</button>`}
          </div>
          <div class="sheet-btns">
            <button class="btn ghost danger" id="ovDelete">Delete</button>
            <button class="btn ghost" id="ovClose">Close</button>
            <button class="btn ghost" id="ovPrint">Save &amp; Print</button>
            <button class="btn" id="ovSave">Save changes</button>
          </div>
        </div>`;
      const retotal = () => { byId("ovTotal").textContent = money(total()); };
      const num = (v) => Number(String(v).replace(/[^0-9.]/g, "")) || 0;
      byId("ovBill").oninput = (e) => { st.billTo = e.target.value; };
      byId("ovStart").onchange = (e) => { st.start = e.target.value; };
      byId("ovEnd").onchange = (e) => { st.end = e.target.value; };
      back.querySelectorAll("[data-lp]").forEach((i) => i.oninput = () => { st.lines[i.dataset.lp].price = num(i.value); retotal(); });
      back.querySelectorAll("[data-ep]").forEach((i) => i.oninput = () => { st.extras[i.dataset.ep].price = num(i.value); retotal(); });
      back.querySelectorAll("[data-ed]").forEach((i) => i.oninput = () => { st.extras[i.dataset.ed].name = i.value; });
      back.querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => {
        const l = st.lines[b.dataset.rm];
        if (!confirm(`Take ${l.name} off this invoice? The job goes back to "not invoiced".`)) return;
        st.removed.push(l.job_id); st.lines.splice(b.dataset.rm, 1); draw();
      });
      back.querySelectorAll("[data-erm]").forEach((b) => b.onclick = () => { st.extras.splice(b.dataset.erm, 1); draw(); });
      byId("ovAddExtra").onclick = () => { st.extras.push({ extra: true, section: "Extra charges", name: "", price: 0 }); draw(); };
      byId("ovClose").onclick = () => { back.hidden = true; back.innerHTML = ""; };
      byId("ovSave").onclick = () => save(false);
      byId("ovPrint").onclick = () => save(true);
      if (byId("ovPay")) byId("ovPay").onclick = async () => {
        const d = byId("ovPaidOn").value; if (!d) { J().toast("Pick the date it was paid"); return; }
        await save(false, { status: "Paid", paid_on: d });
      };
      if (byId("ovUnpay")) byId("ovUnpay").onclick = () => save(false, { status: "Pending", paid_on: null });
      byId("ovDelete").onclick = async () => {
        if (!confirm("Delete this invoice? Its jobs go back to 'not invoiced' so you can bill them again.")) return;
        await J().db.from("jes_jobs").update({ invoice_id: null }).eq("invoice_id", inv.id);
        const { error } = await J().db.from("jes_invoices").delete().eq("id", inv.id);
        back.hidden = true; back.innerHTML = "";
        J().toast(error ? "Not deleted: " + error.message : "Invoice deleted"); drawInvoices();
      };
    };
    async function save(andPrint, statusPatch) {
      let n = 0;
      const lines = st.lines.map((l) => ({ ...l, n: ++n }))
        .concat(st.extras.filter((l) => l.name.trim() || Number(l.price)).map((l) => ({ ...l, n: ++n, extra: true, section: "Extra charges", name: l.name.trim() || "Extra charge" })));
      const patch = Object.assign({ bill_to: st.billTo.trim(), period_start: st.start || null, period_end: st.end || null, lines, total: total() }, statusPatch || {});
      const { data, error } = await J().db.from("jes_invoices").update(patch).eq("id", inv.id).select().single();
      if (error) { J().toast("Not saved: " + error.message); return; }
      // keep each job's price in step with the invoice so Money matches
      await Promise.all(st.lines.map((l) => J().db.from("jes_jobs").update({ price: Number(l.price || 0) }).eq("id", l.job_id)));
      if (st.removed.length) await J().db.from("jes_jobs").update({ invoice_id: null }).in("id", st.removed);
      back.hidden = true; back.innerHTML = "";
      J().toast(statusPatch && statusPatch.status === "Paid" ? "Marked paid ✓" : "Invoice updated");
      await drawInvoices();
      if (andPrint) printInvoice(data);
    }
    draw();
  }

  // =====================================================================
  // MONEY TAB (step 6)
  // =====================================================================
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

    byId("screen").querySelector(".office").innerHTML = `
      <div class="jobs-head"><h1>Money</h1><span class="muted">Week: ${esc(periodLabel(ws, we))}</span></div>
      <div class="glance money-grid">
        <div class="tile green"><div class="tile-label">Earned this week</div><div class="tile-value">${money(earned)}</div><div class="tile-sub">${doneWeek.length} done · goal ${money(goal)}</div>
          <div class="bar"><span style="width:${Math.min(100, goal ? earned / goal * 100 : 0)}%"></span></div></div>
        <div class="tile"><div class="tile-label">Gas, tolls &amp; costs</div><div class="tile-value">${money(costs)}</div><div class="tile-sub">${milesWeek ? milesWeek.toFixed(0) + " miles logged" : "Nothing logged yet"}</div></div>
        <div class="tile green"><div class="tile-label">Real profit</div><div class="tile-value">${money(earned - costs)}</div><div class="tile-sub">Earned minus costs</div></div>
        <button class="tile red" data-go="invoices"><div class="tile-label">Owed to you ›</div><div class="tile-value">${money(owed)}</div><div class="tile-sub">Pending invoices</div></button>
        <div class="tile green"><div class="tile-label">Paid this week</div><div class="tile-value">${money(paidWeek)}</div><div class="tile-sub">Money received</div></div>
        <button class="tile" data-go="jobs" data-filter="Active"><div class="tile-label">Still attempting ›</div><div class="tile-value">${attempting}</div><div class="tile-sub">Not counted as money yet</div></button>
      </div>
      <div class="row-gap wrap"><button class="btn ghost" id="mExpense">+ Log gas / tolls / miles</button></div>
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
        <p class="muted small">Any job still at $0 that isn't on an invoice automatically picks up its client's default price. You can still change any single job.</p>
      </details>`;

    byId("mExpense").onclick = () => addExpense();
    const scr = byId("screen");
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
      J().toast(error ? "Not saved: " + error.message : "Settings saved — $0 jobs updated"); drawMoney();
    };
  }

  // ---------- new invoice: you pick every job, prices editable, extra charges allowed ----------
  function newInvoice(D, grp) {
    const { esc, money } = J();
    const back = byId("sheetBack");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const endThu = today.getDay() === 4 ? today : addDays(weekStart(), 7);
    const g0 = GROUPS[grp] ? grp : "Jean";
    const st = { grp: g0, start: addDays(endThu, -7), end: endThu, billTo: GROUPS[g0].billTo, picked: new Set(), price: {}, extras: [], showAll: false };
    const priceOf = (j) => (st.price[j.id] != null ? st.price[j.id] : Number(j.price || 0));
    const num = (v) => Number(String(v).replace(/[^0-9.]/g, "")) || 0;
    let pool = [];
    const totals = () => {
      const picked = pool.filter((j) => st.picked.has(j.id));
      const sub = (c) => picked.filter((j) => j.client === c).reduce((a, j) => a + priceOf(j), 0);
      const ex = st.extras.reduce((a, e) => a + Number(e.price || 0), 0);
      return { picked, sub, ex, total: picked.reduce((a, j) => a + priceOf(j), 0) + ex };
    };
    const drawSum = () => {
      const t = totals();
      byId("niSum").innerHTML = `
        ${st.grp === "Jean" ? `<div><span>ProVest (${t.picked.filter((j) => j.client === "ProVest").length})</span><span>${money(t.sub("ProVest"))}</span></div>
        <div><span>Userve (${t.picked.filter((j) => j.client === "Userve").length})</span><span>${money(t.sub("Userve"))}</span></div>` : ""}
        ${t.ex ? `<div><span>Extra charges</span><span>${money(t.ex)}</span></div>` : ""}
        <div class="due"><span>Amount Due (${t.picked.length} job${t.picked.length === 1 ? "" : "s"})</span><span>${money(t.total)}</span></div>`;
      byId("niSave").disabled = byId("niSavePrint").disabled = !t.picked.length;
    };
    const draw = () => {
      const g = GROUPS[st.grp];
      const inPeriod = (j) => j.done_at && new Date(j.done_at) >= st.start && new Date(j.done_at) < addDays(st.end, 1);
      pool = D.jobs.filter((j) => g.clients.includes(j.client));
      if (!st.showAll) pool = pool.filter((j) => isDone(j) || (j.attempt_count || 0) > 0);
      pool.sort((a, b) => (!!a.invoice_id - !!b.invoice_id) || (inPeriod(b) - inPeriod(a)) || (isDone(b) - isDone(a)) ||
        (st.grp === "Jean" ? (a.client === "ProVest" ? -1 : 1) - (b.client === "ProVest" ? -1 : 1) : 0));
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
          <p class="muted small">Tick a job, then change its price on the right if this one pays differently.</p>
          <div class="pick-list">${pool.length ? pool.map((j) => {
            const tag = j.status === "Served" ? `<span class="tag done">Served ${j.done_at ? md(j.done_at) : ""}</span>`
              : j.status === "Non-Serve Complete" ? `<span class="tag navy">Non-serve</span>`
              : `<span class="tag hold">Attempt ${j.attempt_count || 0}/5</span>`;
            const locked = !!j.invoice_id, on = st.picked.has(j.id);
            return `<div class="pick-row ${on ? "on" : ""} ${locked ? "locked" : ""}">
              <input type="checkbox" id="pk_${j.id}" data-pick="${j.id}" ${on ? "checked" : ""} ${locked ? "disabled" : ""}>
              <label class="pick-main" for="pk_${j.id}">
                <span class="pick-name">${esc(j.person || "(no name)")}${j.job_no ? ` <span class="jobno">#${esc(j.job_no)}</span>` : ""}</span>
                <span class="pick-sub">${esc(j.client)} · ${tag} · <span class="${verified(j) ? "ok" : "bad"}">${locked ? "on an invoice" : verified(j) ? "checked ✓" : "not checked"}</span></span>
              </label>
              ${on ? `<label class="price-in">$<input inputmode="decimal" data-price="${j.id}" value="${priceOf(j).toFixed(2)}" aria-label="Price"></label>` : `<b class="pick-amt">${money(j.price)}</b>`}
            </div>`;
          }).join("") : `<p class="muted">No ${esc(st.grp)} jobs to show.</p>`}</div>
          <div class="inv-sec">Extra charges</div>
          ${st.extras.map((e, k) => `
            <div class="ov-line">
              <span class="il-n">+</span>
              <input class="ex-desc" data-ed="${k}" value="${esc(e.name)}" placeholder="What for (extra stop, printing…)" aria-label="Extra charge description">
              <label class="price-in">$<input inputmode="decimal" data-ep="${k}" value="${Number(e.price || 0).toFixed(2)}" aria-label="Extra charge amount"></label>
              <button class="icon-btn small-x" data-erm="${k}" aria-label="Remove this extra charge">✕</button>
            </div>`).join("")}
          <button class="btn ghost thin" id="niAddExtra">+ Add extra charge</button>
          <div class="inv-sum" id="niSum"></div>
          <div class="sheet-btns">
            <button class="btn ghost" id="niCancel">Cancel</button>
            <button class="btn" id="niSave">Save Invoice</button>
            <button class="btn go" id="niSavePrint">Save &amp; Print</button>
          </div>
        </div>`;
      back.querySelectorAll("[data-g]").forEach((b) => b.onclick = () => { st.grp = b.dataset.g; st.billTo = GROUPS[st.grp].billTo; st.picked.clear(); draw(); });
      byId("niBill").oninput = (e) => { st.billTo = e.target.value; };
      byId("niStart").onchange = (e) => { if (e.target.value) { st.start = fromIso(e.target.value); draw(); } };
      byId("niEnd").onchange = (e) => { if (e.target.value) { st.end = fromIso(e.target.value); draw(); } };
      byId("niAll").onchange = (e) => { st.showAll = e.target.checked; draw(); };
      byId("niPickPeriod").onclick = () => { pool.filter((j) => !j.invoice_id && isDone(j) && inPeriod(j)).forEach((j) => st.picked.add(j.id)); draw(); };
      back.querySelectorAll("[data-pick]").forEach((c) => c.onchange = () => { c.checked ? st.picked.add(c.dataset.pick) : st.picked.delete(c.dataset.pick); draw(); });
      back.querySelectorAll("[data-price]").forEach((i) => i.oninput = () => { st.price[i.dataset.price] = num(i.value); drawSum(); });
      back.querySelectorAll("[data-ep]").forEach((i) => i.oninput = () => { st.extras[i.dataset.ep].price = num(i.value); drawSum(); });
      back.querySelectorAll("[data-ed]").forEach((i) => i.oninput = () => { st.extras[i.dataset.ed].name = i.value; });
      back.querySelectorAll("[data-erm]").forEach((b) => b.onclick = () => { st.extras.splice(b.dataset.erm, 1); draw(); });
      byId("niAddExtra").onclick = () => { st.extras.push({ name: "", price: 0 }); draw(); };
      byId("niCancel").onclick = () => { back.hidden = true; back.innerHTML = ""; };
      byId("niSave").onclick = () => save(false);
      byId("niSavePrint").onclick = () => save(true);
      drawSum();
    };
    async function save(andPrint) {
      if (st.grp === "Private" && !st.billTo.trim()) { J().toast("Type who you're billing"); return; }
      const { picked } = totals();
      const order = st.grp === "Jean" ? ["ProVest", "Userve"] : [GROUPS[st.grp].clients[0]];
      let n = 0;
      const lines = [];
      order.forEach((c) => picked.filter((j) => j.client === c).forEach((j) => lines.push({
        n: ++n, section: c, job_id: j.id, job_no: j.job_no || "", name: j.person || j.address || "", address: j.address || "", price: priceOf(j)
      })));
      st.extras.filter((e) => e.name.trim() || Number(e.price)).forEach((e) => lines.push({ n: ++n, extra: true, section: "Extra charges", name: e.name.trim() || "Extra charge", price: Number(e.price || 0) }));
      const total = lines.reduce((a, l) => a + l.price, 0);
      const { data, error } = await J().db.from("jes_invoices").insert({
        grp: st.grp, bill_to: st.billTo.trim(), period_start: isoDay(st.start), period_end: isoDay(st.end), lines, total
      }).select().single();
      if (error) { J().toast("Not saved: " + error.message); return; }
      const jl = lines.filter((l) => !l.extra);
      await J().db.from("jes_jobs").update({ invoice_id: data.id }).in("id", jl.map((l) => l.job_id));
      await Promise.all(jl.filter((l) => st.price[l.job_id] != null).map((l) => J().db.from("jes_jobs").update({ price: l.price }).eq("id", l.job_id)));
      back.hidden = true; back.innerHTML = "";
      J().toast("Invoice saved — red until you mark it paid");
      J().go("invoices");
      for (let t = 0; t < 50 && !byId("printSheet"); t++) await new Promise((r) => setTimeout(r, 100));
      if (andPrint) printInvoice(data);
    }
    draw();
  }

  // ---------- plain printed invoice (black ink) ----------
  function printInvoice(inv) {
    const { esc, money } = J();
    const sections = [...new Set((inv.lines || []).filter((l) => !l.extra).map((l) => l.section))];
    if ((inv.lines || []).some((l) => l.extra)) sections.push("Extra charges");
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
            <table class="ip-table">${ls.map((l) => `<tr><td class="ip-n">${l.n}.</td><td class="ip-no">${esc(l.extra ? "" : l.job_no ? "#" + l.job_no : "")}</td><td>${esc(l.name)}</td><td class="ip-amt">${money(l.price)}</td></tr>`).join("")}</table>
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

  window.JES_OFFICE = { drawDone, drawInvoices, drawMoney, drawHub };
})();
