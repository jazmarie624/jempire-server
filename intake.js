// J EMPIRE SERVER — intake.js (version 8: per-job papers, tap-to-type, Rush/Foreclosure/Business flags)
// Reads pasted jobs for each client, drops the junk words, and builds
// uniform job drafts. Every draft can be edited before saving.
(function () {
  "use strict";

  // =====================================================================
  // 1. PARSERS (pure functions — no screen code here)
  // =====================================================================
  const CLIENTS = ["ABC Legal", "Ody's", "ProVest", "Userve", "Private"];

  const RULES = {
    "ABC Legal": "Keeps: order #, name, price, address, serve-by date, attempt instructions, vehicles. Ignores: Details, Photos, History, Deliver To, and the other menu words.",
    "Ody's": "Keeps: Standard or Rush, name, ODY job #, Action date and C/O (to notes), and the address when included. Once you add an address for a name, it fills in automatically next time.",
    "ProVest": "Keeps: each address as its own job. Ignores: Saved, All Work, Corporate, Search, Include Closed Cases. Add job # and names later.",
    "Userve": "Keeps: name, job #, address, county. Ignores: open, MWA, MDEWA, the assigned date, Attempt / Serve, View on Map.",
    "Private": "Makes a blank job for you to fill in. If you paste an address, it's filled in for you."
  };

  // --- county lookup by ZIP, then by city ---
  const OSCEOLA_ZIPS = ["34739", "34741", "34742", "34743", "34744", "34745", "34746", "34747", "34758", "34769", "34771", "34772", "34773"];
  const ORANGE_ZIPS = ["32703", "32704", "32709", "32712", "32751", "32789", "32790", "32792", "32793", "34734", "34740", "34760", "34761", "34777", "34778", "34786", "34787"];
  const OSCEOLA_CITIES = ["kissimmee", "st cloud", "st. cloud", "saint cloud", "celebration", "poinciana", "kenansville", "harmony", "narcoossee", "kindred", "intercession city", "campbell"];
  const ORANGE_CITIES = ["orlando", "winter park", "apopka", "ocoee", "winter garden", "windermere", "maitland", "oakland", "belle isle", "edgewood", "eatonville", "gotha", "pine hills", "lake buena vista", "zellwood", "christmas", "bithlo"];

  // A ZIP only counts if it follows FL (or ends the address) — not the house number
  function zipOf(address) {
    const a = address || "";
    const m = a.match(/\b(?:FL|Florida)\b[\s,]*(\d{5})(?:-\d{4})?/i) || a.match(/,\s*(\d{5})(?:-\d{4})?\s*$/);
    return m ? m[1] : "";
  }
  const hasZip = (a) => !!zipOf(a);

  function countyFor(address) {
    const a = (address || "").toLowerCase();
    const zip = zipOf(address);
    if (zip) {
      if (OSCEOLA_ZIPS.includes(zip)) return "Osceola";
      if (ORANGE_ZIPS.includes(zip) || /^32[78]\d\d$/.test(zip)) return "Orange";
    }
    if (OSCEOLA_CITIES.some((c) => a.includes(c))) return "Osceola";
    if (ORANGE_CITIES.some((c) => a.includes(c))) return "Orange";
    return "";
  }

  // --- tidy text ---
  const KEEP_UPPER = new Set(["FL", "LLC", "INC", "PA", "LLP", "NE", "NW", "SE", "SW", "N", "S", "E", "W", "II", "III", "IV", "PO"]);
  function titleCase(s) {
    // Fixes ALL-CAPS words one at a time; leaves normal words alone.
    return (s || "").trim().split(/(\s+)/).map((w) => {
      const bare = w.replace(/[^A-Za-z]/g, "");
      if (bare.length < 2 || bare !== bare.toUpperCase()) return w;
      const up = bare.toUpperCase();
      if (up === "INC") return w.replace(bare, "Inc");
      if (KEEP_UPPER.has(up)) return w;
      return w.toLowerCase().replace(/(^|[^A-Za-z0-9])([a-z])/g, (m, p, c) => p + c.toUpperCase());
    }).join("");
  }

  function cleanAddress(s) {
    let a = (s || "").replace(/\s+/g, " ").trim();
    a = a.replace(/,\s*,+/g, ",");                                 // ",,"  -> ","
    a = a.replace(/,?\s*\b(OSCEOLA|ORANGE)\b\s*(COUNTY)?\s*,?\s*$/i, ""); // trailing county word
    a = a.replace(/,\s*FL\s*,?\s*(\d{5})(?:[\s-]+(\d{4}))?/i, (m, z, p4) => ", FL " + z + (p4 ? "-" + p4 : ""));
    a = a.replace(/\s+FL\s*,?\s*(\d{5})(?:[\s-]+(\d{4}))?/i, (m, z, p4) => ", FL " + z + (p4 ? "-" + p4 : ""));
    a = a.replace(/,\s*,/g, ",").replace(/[,\s]+$/, "");
    return titleCase(a);
  }

  const STRAY = /^[\s•·=#*\-–—|>曲\u2022\u25CF\u25AA\u2023]+|[\s•·=|]+$/g;
  function lines(text) {
    return (text || "").replace(/\r/g, "").split("\n")
      .map((l) => l.replace(STRAY, "").trim())
      .filter((l) => l.length);
  }
  const DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
  const toIsoDate = (m) => `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const STREET_START = /^\d{1,6}[A-Za-z]?\s+[A-Za-z0-9]/;

  // Jean prints ProVest + Userve papers and hands them over weekly
  const PAPER_CLIENTS = ["ProVest", "Userve"];
  const PACKET_RATE = 15;   // ProVest foreclosures: $15 per packet
  function blankDraft(client) {
    return { client, job_no: "", person: "", address: "", county: "", service: "Standard",
      due_date: "", price: null, notes: "", raw_text: "", private_phone: "", private_email: "", paid_upfront: false,
      has_papers: !PAPER_CLIENTS.includes(client),
      is_foreclosure: false, packets: 1, is_business: false };
  }
  // Same name next time = same address filled in (hospitals, water authority, etc.)
  const nameKey = (n) => (n || "").toLowerCase().replace(/(\.\.\.|…)\s*$/, "").replace(/[^a-z0-9& ]/g, " ").replace(/\s+/g, " ").trim();

  function removeIgnored(ls, extra) {
    if (!extra || !extra.length) return ls;
    const lower = extra.map((w) => w.toLowerCase().trim()).filter(Boolean);
    return ls.filter((l) => !lower.includes(l.toLowerCase()));
  }

  // ---------- ABC Legal ----------
  function parseABC(text, extra) {
    const chunks = text.split(/(?=^\s*Order\s+\d{5,})/im).filter((c) => /Order\s+\d{5,}/i.test(c));
    const blocks = chunks.length ? chunks : [text];
    return blocks.map((block) => {
      const d = blankDraft("ABC Legal");
      d.raw_text = block.trim();
      const ls = removeIgnored(lines(block), extra);
      const order = block.match(/Order\s+(\d{5,})/i);
      if (order) d.job_no = order[1];

      const price = block.match(/\$\s?(\d+(?:\.\d{1,2})?)/);
      if (price) d.price = Number(price[1]);

      const dt = ls.findIndex((l) => /^deliver\s*to$/i.test(l));
      if (dt >= 0) {
        const name = ls.slice(dt + 1).find((l) => !/\$/.test(l) && !STREET_START.test(l) && /[A-Za-z]{2}/.test(l));
        if (name) d.person = titleCase(name);
      }

      const si = ls.findIndex((l) => STREET_START.test(l));
      if (si >= 0) {
        let addr = ls[si];
        // join the next lines (apt/unit, then city/state/ZIP) until the ZIP shows up
        for (let j = si + 1; j < Math.min(ls.length, si + 4) && !hasZip(addr); j++) {
          const l = ls[j];
          if (/^(=?\s*instructions?|serve|vehicles?|deadline|bo)$/i.test(l) || /\$/.test(l)) break;
          if (hasZip(l) || /\b(FL|Florida)\b/i.test(l) || /^(apt|unit|ste|suite|#|lot|bldg|building)\b/i.test(l)) addr += ", " + l;
          else break;
        }
        d.address = cleanAddress(addr);
      }

      const due = block.match(/Serve\s+by\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
      if (due) d.due_date = toIsoDate(due[1].match(DATE));

      const TIMES = ["Morning", "Afternoon", "Evening", "Weekends", "Weekdays", "New Days", "Early Morning", "Late Evening"];
      const found = TIMES.filter((t) => ls.some((l) => l.toLowerCase() === t.toLowerCase()));
      const notes = [];
      if (found.length) notes.push("Vary attempts: " + found.join(", "));
      const vi = ls.findIndex((l) => /^vehicles?$/i.test(l));
      if (vi >= 0) {
        const cars = [];
        for (let i = vi + 1; i < ls.length; i++) {
          if (/^(bo\s*)?deadline$|^serve by|^bo$/i.test(ls[i])) break;
          if (/\d{4}/.test(ls[i]) && /[A-Za-z]/.test(ls[i])) cars.push(ls[i]);
        }
        if (cars.length) notes.push("Vehicles: " + cars.join("; "));
      }
      d.notes = notes.join("\n");
      d.county = countyFor(d.address);
      return d;
    });
  }

  // ---------- Ody's ----------
  // Handles the list view (name above "ODY - #", "Action date" below it) and
  // the detail view (job # on top, then name, C/O and address).
  function parseOdys(text, extra) {
    const ls = removeIgnored(lines(text), extra);
    const isMarker = (l) => /^ODY\s*[—–\-:]*\s*\d{6,}/i.test(l);
    const isService = (l) => /^(standard|rush|rushed|stand|standa|standar|ru|rus)$/i.test(l);
    const isAction = (l) => /^action\b/i.test(l);
    const isCO = (l) => /^(c\/o|attn|attention)\b/i.test(l);
    const isCity = (l) => /\b(FL|Florida)\b[\s,]*\d{5}/i.test(l);
    const isNameish = (l) => !isService(l) && !isAction(l) && !isCO(l) && !isMarker(l) &&
      !/^ODY$/i.test(l) && !STREET_START.test(l) && !isCity(l) && /[A-Za-z]{2}/.test(l);
    const idx = [];
    ls.forEach((l, i) => { if (isMarker(l)) idx.push(i); });
    if (!idx.length) { const d = blankDraft("Ody's"); d.raw_text = text.trim(); return [d]; }

    const headerFirst = ls.slice(0, idx[0]).every((l) => isService(l) || /^ODY$/i.test(l));
    const startOf = (at) => (at > 0 && isService(ls[at - 1]) ? at - 1 : at);

    return idx.map((at, n) => {
      const d = blankDraft("Ody's");
      d.job_no = ls[at].match(/(\d{6,})/)[1];
      let bl;
      if (headerFirst) {
        bl = ls.slice(n === 0 ? 0 : startOf(at), n + 1 < idx.length ? startOf(idx[n + 1]) : ls.length);
      } else {
        // everything after the previous job's marker (skipping its Action line) up to this marker
        let from = n === 0 ? 0 : idx[n - 1] + 1;
        while (from < at && isAction(ls[from])) from++;
        bl = ls.slice(from, at + 1);
        if (ls[at + 1] && isAction(ls[at + 1])) bl.push(ls[at + 1]);
      }
      d.raw_text = bl.join("\n");
      const body = bl.filter((l) => !isMarker(l));

      // name: first name-like line (detail view) or the one right above the job # (list view)
      const names = body.filter(isNameish);
      const nameLine = headerFirst ? names[0] : names[names.length - 1];
      if (nameLine) d.person = titleCase(nameLine);

      const notes = [];
      const co = body.find(isCO);
      if (co) notes.push(titleCase(co.replace(/^(c\/o|attn|attention)\s*:?\s*/i, "C/O: ")));
      const act = body.find(isAction);
      if (act) notes.push("Action date: " + act.replace(/^action\s*:?\s*/i, ""));
      if (nameLine && /(\.\.\.|…)\s*$/.test(nameLine)) notes.push("Name was cut off in the paste — check the full name in Ody's app.");
      d.notes = notes.join("\n");

      const si = body.findIndex((l) => STREET_START.test(l));
      if (si >= 0) {
        let addr = body[si];
        for (let j = si + 1; j < Math.min(body.length, si + 3) && !hasZip(addr); j++) {
          if (isCity(body[j]) || /^(apt|unit|ste|suite|#|lot|bldg)\b/i.test(body[j])) addr += ", " + body[j];
          else break;
        }
        d.address = cleanAddress(addr);
        d.county = countyFor(d.address);
      }

      const pi = nameLine ? body.indexOf(nameLine) : body.length;
      const svc = body.slice(0, pi).reverse().find(isService) || body.find(isService) || "";
      d.service = /^ru/i.test(svc) ? "Rush" : "Standard";
      return d;
    });
  }

  // ---------- ProVest ----------
  const PROVEST_JUNK = /^(saved|all work|corporate|q\s*search|search|include closed cases|my work|open|filters?|sort)$/i;
  function parseProVest(text, extra) {
    const ls = removeIgnored(lines(text), extra).filter((l) => !PROVEST_JUNK.test(l));
    const out = [];
    let buf = "";
    const flush = () => { if (buf.trim()) out.push(buf.trim()); buf = ""; };
    ls.forEach((l) => {
      if (STREET_START.test(l)) { flush(); buf = l; }
      else if (buf) { buf += (buf.trim().endsWith(",") ? " " : ", ") + l; }
    });
    flush();
    return out.map((raw) => {
      const d = blankDraft("ProVest");
      d.raw_text = raw;
      d.address = cleanAddress(raw);
      d.county = countyFor(d.address);
      return d;
    });
  }

  // ---------- Userve ----------
  const USERVE_JUNK = /^(open|closed|mwa|mdewa|attempt\s*\/\s*serve|view on map|attempt|serve)$/i;
  function parseUserve(text, extra) {
    const ls = removeIgnored(lines(text), extra)
      .filter((l) => !USERVE_JUNK.test(l))
      .filter((l) => !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(l)); // assigned date
    const jobs = [];
    let cur = null;
    const isName = (l) => /^[A-Z][A-Z0-9&.,'\- ]*[A-Z.]$/.test(l) && /[A-Z]{2}/.test(l) &&
      !STREET_START.test(l) && !/^(OSCEOLA|ORANGE)( COUNTY)?$/.test(l) && !/^\d+$/.test(l);
    ls.forEach((l) => {
      if (isName(l) && !(cur && cur.address && !hasZip(cur.address) && /\b(FL|KISSIMMEE|ORLANDO)\b/.test(l))) {
        cur = { lines: [l], person: l, job_no: "", address: "", county: "" };
        jobs.push(cur);
        return;
      }
      if (!cur) return;
      cur.lines.push(l);
      if (/^\d{5,7}$/.test(l) && !cur.job_no) { cur.job_no = l; return; }
      if (/^(OSCEOLA|ORANGE)( COUNTY)?$/i.test(l)) { cur.county = titleCase(l.replace(/ county/i, "")); return; }
      if (STREET_START.test(l) && !cur.address) { cur.address = l; return; }
      if (cur.address && !hasZip(cur.address) && /[A-Za-z]/.test(l)) { cur.address += ", " + l; }
    });
    return jobs.map((j) => {
      const d = blankDraft("Userve");
      d.person = titleCase(j.person);
      d.job_no = j.job_no;
      const cm = j.address.match(/\b(OSCEOLA|ORANGE)\b/i);
      d.address = cleanAddress(j.address);
      d.county = j.county || (cm ? titleCase(cm[1]) : "") || countyFor(d.address);
      d.raw_text = j.lines.join("\n");
      return d;
    });
  }

  // ---------- Private ----------
  function parsePrivate(text) {
    const d = blankDraft("Private");
    d.raw_text = (text || "").trim();
    const addr = lines(text).find((l) => STREET_START.test(l));
    if (addr) { d.address = cleanAddress(addr); d.county = countyFor(d.address); }
    return [d];
  }

  function parse(client, text, extra) {
    if (client === "ABC Legal") return parseABC(text, extra);
    if (client === "Ody's") return parseOdys(text, extra);
    if (client === "ProVest") return parseProVest(text, extra);
    if (client === "Userve") return parseUserve(text, extra);
    return parsePrivate(text);
  }

  // Missing address / ZIP / county: the job still SAVES, but can't go on a route until fixed.
  function problems(d) {
    const p = [];
    if (!d.address) p.push("Address missing");
    else if (!hasZip(d.address)) p.push("ZIP missing");
    if (!d.county) p.push("County missing");
    return p;
  }
  // Only a duplicate stops a save.
  function duplicateOf(d, existing) {
    if (!existing) return "";
    if (d.job_no && existing.some((e) => e.job_no && e.client === d.client && e.job_no === d.job_no)) return "Already saved (same job #)";
    if (!d.job_no && d.address && existing.some((e) => e.client === d.client && e.status !== "Served" &&
      (e.address || "").toLowerCase() === d.address.toLowerCase())) return "Already saved (same address)";
    return "";
  }
  function laterNotes(d) {
    const l = [];
    if (!d.job_no) l.push("job #");
    if (!d.person) l.push("name");
    return l.length ? "Add " + l.join(" + ") + " later" : "";
  }

  window.JES_PARSE = { parse, problems, duplicateOf, countyFor, cleanAddress, titleCase, nameKey, hasZip, CLIENTS };

  // =====================================================================
  // 2. SCREEN (Add Jobs)
  // =====================================================================
  const S = { client: "Userve", drafts: [], existing: null, prices: {}, ignore: {}, known: {}, addToday: true };

  function J() { return window.JES; }
  function saveLocal() {
    try { localStorage.setItem("jes_drafts", JSON.stringify({ client: S.client, drafts: S.drafts })); } catch (e) {}
  }
  function loadLocal() {
    try {
      const v = JSON.parse(localStorage.getItem("jes_drafts") || "null");
      if (v) { S.client = v.client || S.client; S.drafts = v.drafts || []; }
    } catch (e) {}
  }

  async function loadData() {
    const db = J().db;
    const [jobs, prices, ign, known] = await Promise.all([
      db.from("jes_jobs").select("id,client,job_no,address,status"),
      db.from("jes_settings").select("value").eq("key", "default_prices").maybeSingle(),
      db.from("jes_settings").select("value").eq("key", "ignore_words").maybeSingle(),
      db.from("jes_settings").select("value").eq("key", "known_addresses").maybeSingle()
    ]);
    S.known = (known.data && known.data.value) || {};
    S.existing = jobs.data || [];
    S.prices = (prices.data && prices.data.value) || {};
    S.ignore = (ign.data && ign.data.value) || {};
  }

  async function draw() {
    const { esc } = J();
    loadLocal();
    document.getElementById("screen").innerHTML = `
      <section class="intake">
        <div class="intake-left">
          <h1>Add Jobs</h1>
          <div class="row-gap">
            <label class="sr" for="inClient">Client</label>
            <select id="inClient" class="big-select">${CLIENTS.map((c) => `<option ${c === S.client ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
            <button class="btn" id="inBuild">Build Jobs</button>
          </div>
          <label class="sr" for="inText">Paste jobs</label>
          <textarea id="inText" class="paste" placeholder="Paste all of this client's jobs here, exactly as copied."></textarea>
          <p class="rule" id="inRule"></p>
          <details class="ignore">
            <summary>Extra words to ignore for <span id="igClient"></span></summary>
            <p class="muted small">One word or line per row. Any pasted line that matches exactly gets dropped.</p>
            <textarea id="igText" rows="3"></textarea>
            <button class="btn ghost" id="igSave">Save ignore words</button>
          </details>
        </div>
        <div class="intake-right">
          <div class="summary" id="inSummary"></div>
          <div id="inPapers"></div>
          <div class="drafts" id="inDrafts"></div>
          <div class="save-area" id="inSaveArea"></div>
        </div>
      </section>
      <div class="sheet-back" id="sheetBack" hidden></div>`;

    const sel = document.getElementById("inClient");
    const syncClient = () => {
      S.client = sel.value;
      document.getElementById("inRule").textContent = RULES[S.client];
      document.getElementById("igClient").textContent = S.client;
      document.getElementById("igText").value = (S.ignore[S.client] || []).join("\n");
    };
    sel.onchange = () => { syncClient(); saveLocal(); };
    document.getElementById("inBuild").onclick = build;
    document.getElementById("igSave").onclick = saveIgnore;

    await loadData();
    syncClient();
    drawDrafts();
  }

  function build() {
    const text = document.getElementById("inText").value;
    if (!text.trim() && S.client !== "Private") { J().toast("Paste jobs first"); return; }
    const found = parse(S.client, text, S.ignore[S.client]);
    found.forEach((d) => {
      if (d.price == null) d.price = Number(S.prices[d.client] || 0);
      const k = nameKey(d.person);
      if (!d.address && k && S.known[k]) {
        d.address = S.known[k].address;
        d.county = S.known[k].county || countyFor(d.address);
        d.notes = (d.notes ? d.notes + "\n" : "") + "Address filled in from a past job with this name — double-check it.";
      }
    });
    S.drafts = S.drafts.concat(found);
    document.getElementById("inText").value = "";
    saveLocal();
    drawDrafts();
    J().toast(found.length + (found.length === 1 ? " job found" : " jobs found"));
  }

  function drawPapersSwitch() {
    const box = document.getElementById("inPapers"); if (!box) return;
    const jean = S.drafts.filter((d) => PAPER_CLIENTS.includes(d.client));
    if (!jean.length) { box.innerHTML = ""; return; }
    const have = jean.filter((d) => d.has_papers).length;
    box.innerHTML = `<div class="papers-switch">
      <span><b>Papers in hand?</b> <span class="muted small">(${jean.length} ProVest/Userve job${jean.length > 1 ? "s" : ""})</span></span>
      <div class="seg">
        <button class="${have === 0 ? "on" : ""}" data-pp="no">No — waiting on Jean</button>
        <button class="${have === jean.length ? "on" : ""}" data-pp="yes">Yes, I have them</button>
      </div></div>`;
    box.querySelectorAll("[data-pp]").forEach((b) => b.onclick = () => {
      jean.forEach((d) => { d.has_papers = b.dataset.pp === "yes"; });
      saveLocal(); drawDrafts();
    });
  }

  function drawDrafts() {
    const { esc } = J();
    const box = document.getElementById("inDrafts");
    drawPapersSwitch();
    const withP = S.drafts.map((d, i) => {
      const dup = duplicateOf(d, S.existing);
      return { d, i, dup, p: dup ? [dup] : problems(d) };
    });
    withP.sort((a, b) => (b.p.length > 0) - (a.p.length > 0));
    const dups = withP.filter((x) => x.dup).length;
    const red = withP.filter((x) => x.p.length && !x.dup).length;
    const savable = withP.length - dups;
    const ready = savable - red;

    document.getElementById("inSummary").innerHTML = S.drafts.length
      ? `<span>${S.drafts.length} job${S.drafts.length > 1 ? "s" : ""} found</span><span><b class="ok">${ready} ready to route</b>${red ? ` · <b class="bad">${red} need an address</b>` : ""}${dups ? ` · <b class="bad">${dups} duplicate${dups > 1 ? "s" : ""}</b>` : ""}</span>`
      : `<span class="muted">Pick the client, paste their jobs, and tap Build Jobs.</span>`;

    box.innerHTML = withP.map(({ d, i, p }) => `
      <div class="draft dcard2 ${p.length ? "is-red" : "is-green"}">
        <div class="d2-top">
          <span class="dot" aria-hidden="true"></span>
          <span class="tap-field name" contenteditable data-f="person" data-i="${i}" data-ph="tap to add name">${esc(d.person || "")}</span>
          <span class="tap-field jobno" contenteditable data-f="job_no" data-i="${i}" data-ph="job #">${esc(d.job_no || "")}</span>
          <button class="icon-btn" data-edit="${i}" aria-label="Open ${esc(d.person || d.address || "job")}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>
          </button>
        </div>
        <div class="draft-addr">${p.length ? `<b>${esc(p.join(" · "))}</b>${d.address ? " · " : ""}` : ""}${esc(d.address || "")}${d.county && !p.length ? ` · ${esc(d.county)}` : ""}</div>
        <div class="flag-row">
          ${PAPER_CLIENTS.includes(d.client) ? `<button class="flag paper ${d.has_papers ? "on" : ""}" data-flag="has_papers" data-i="${i}">📄 ${d.has_papers ? "Papers in hand" : "Waiting on Jean"}</button>` : ""}
          <button class="flag rush ${d.service === "Rush" ? "on" : ""}" data-flag="service" data-i="${i}">⚡ Rush</button>
          <button class="flag fore ${d.is_foreclosure ? "on" : ""}" data-flag="is_foreclosure" data-i="${i}">📚 Foreclosure</button>
          ${d.is_foreclosure ? `<label class="pk">packets <input inputmode="numeric" data-pk="${i}" value="${d.packets || 1}" aria-label="How many packets"></label>` : ""}
          <button class="flag biz ${d.is_business ? "on" : ""}" data-flag="is_business" data-i="${i}">🏢 Business</button>
          <span class="d2-price">${J().money(d.price || 0)}</span>
        </div>
      </div>`).join("");

    box.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => openSheet(Number(b.getAttribute("data-edit"))));
    // tap the name or job # and just type
    box.querySelectorAll(".tap-field").forEach((el) => {
      el.onblur = () => {
        const d = S.drafts[Number(el.dataset.i)];
        d[el.dataset.f] = el.textContent.trim();
        saveLocal(); drawDrafts();
      };
      el.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } };
    });
    // one tap per flag
    box.querySelectorAll("[data-flag]").forEach((b) => b.onclick = () => {
      const d = S.drafts[Number(b.dataset.i)], f = b.dataset.flag;
      if (f === "service") d.service = d.service === "Rush" ? "Standard" : "Rush";
      else d[f] = !d[f];
      if (f === "is_foreclosure" && d.is_foreclosure && d.client === "ProVest") d.price = (d.packets || 1) * PACKET_RATE;
      saveLocal(); drawDrafts();
    });
    box.querySelectorAll("[data-pk]").forEach((i) => i.onchange = () => {
      const d = S.drafts[Number(i.dataset.pk)];
      d.packets = Math.max(1, parseInt(i.value, 10) || 1);
      if (d.client === "ProVest") d.price = d.packets * PACKET_RATE;
      saveLocal(); drawDrafts();
    });

    const area = document.getElementById("inSaveArea");
    if (!S.drafts.length) { area.innerHTML = ""; return; }
    area.innerHTML = `
      <label class="check-line"><input type="checkbox" id="inToday" ${S.addToday ? "checked" : ""}> Also add to Today's route</label>
      <button class="btn go" id="inSave" ${savable ? "" : "disabled"}>Save ${savable} Job${savable === 1 ? "" : "s"}</button>
      ${red ? `<p class="muted small center">Red jobs can still be saved — you'll be asked what to do with them.</p>` : ""}
      ${dups ? `<p class="muted small center">Duplicates are not saved. Remove them with ✏️ → Remove.</p>` : ""}
      <button class="btn ghost" id="inClear">Clear all drafts</button>`;
    document.getElementById("inToday").onchange = (e) => { S.addToday = e.target.checked; };
    document.getElementById("inSave").onclick = checkBeforeSave;
    document.getElementById("inClear").onclick = () => {
      if (!confirm("Remove all drafts on this screen? Saved jobs are not affected.")) return;
      S.drafts = []; saveLocal(); drawDrafts();
    };
  }

  // ---------- edit sheet ----------
  function openSheet(i) {
    const { esc } = J();
    const d = S.drafts[i];
    const back = document.getElementById("sheetBack");
    const opt = (list, v) => list.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("");
    back.hidden = false;
    back.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="shTitle">
        <h2 id="shTitle">Edit job</h2>
        <div class="grid2">
          <label>Client<select id="f_client">${opt(CLIENTS, d.client)}</select></label>
          <label>Standard / Rush<select id="f_service">${opt(["Standard", "Rush"], d.service)}</select></label>
          <label>Job #<input id="f_job_no" value="${esc(d.job_no)}"></label>
          <label>Price<input id="f_price" inputmode="decimal" value="${esc(d.price ?? 0)}"></label>
        </div>
        <label>Person to serve<input id="f_person" value="${esc(d.person)}"></label>
        <label>Address<textarea id="f_address" rows="2">${esc(d.address)}</textarea></label>
        <div class="grid2">
          <label>County<select id="f_county">${opt(["", "Osceola", "Orange", "Other"], d.county)}</select></label>
          <label>Due date<input id="f_due_date" type="date" value="${esc(d.due_date)}"></label>
        </div>
        <label>Notes<textarea id="f_notes" class="notes-box" rows="5">${esc(d.notes)}</textarea></label>
        <div class="flag-row sheet-flags">
          <label class="check-line"><input type="checkbox" id="f_is_foreclosure" ${d.is_foreclosure ? "checked" : ""}> 📚 Foreclosure</label>
          <label class="check-line">packets <input id="f_packets" inputmode="numeric" value="${d.packets || 1}" style="width:4rem"></label>
          <label class="check-line"><input type="checkbox" id="f_is_business" ${d.is_business ? "checked" : ""}> 🏢 Business (serve 10–12 or 2–4)</label>
        </div>
        <label class="check-line" ${PAPER_CLIENTS.includes(d.client) ? "" : "hidden"} id="f_papers_line"><input type="checkbox" id="f_has_papers" ${d.has_papers ? "checked" : ""}> I have the papers for this job</label>
        <div class="private-only" ${d.client === "Private" ? "" : "hidden"}>
          <div class="grid2">
            <label>Client phone<input id="f_private_phone" inputmode="tel" value="${esc(d.private_phone)}"></label>
            <label>Client email<input id="f_private_email" inputmode="email" value="${esc(d.private_email)}"></label>
          </div>
          <label class="check-line"><input type="checkbox" id="f_paid_upfront" ${d.paid_upfront ? "checked" : ""}> Paid upfront</label>
        </div>
        <details><summary>Original pasted text</summary><pre class="raw">${esc(d.raw_text || "(none)")}</pre></details>
        <div class="sheet-btns">
          <button class="btn ghost danger" id="shRemove">Remove</button>
          <button class="btn" id="shDone">Done</button>
        </div>
      </div>`;
    const $f = (k) => document.getElementById("f_" + k);
    // Boxes grow to fit everything typed — no tiny scrolling inside them
    const grow = (el) => { el.style.height = "auto"; el.style.height = (el.scrollHeight + 4) + "px"; };
    back.querySelectorAll("textarea").forEach((t) => { grow(t); t.addEventListener("input", () => grow(t)); });
    $f("client").onchange = () => {
      back.querySelector(".private-only").hidden = $f("client").value !== "Private";
      document.getElementById("f_papers_line").hidden = !PAPER_CLIENTS.includes($f("client").value);
    };
    $f("address").onblur = () => {
      const cleaned = window.JES_PARSE.cleanAddress($f("address").value);
      $f("address").value = cleaned;
      if (!$f("county").value) $f("county").value = countyFor(cleaned) || "";
    };
    document.getElementById("shDone").onclick = () => {
      ["client", "service", "job_no", "person", "address", "county", "due_date", "notes", "private_phone", "private_email"]
        .forEach((k) => { d[k] = $f(k).value.trim(); });
      d.address = window.JES_PARSE.cleanAddress(d.address);
      if (!d.county) d.county = countyFor(d.address);
      d.price = Number(String($f("price").value).replace(/[^0-9.]/g, "")) || 0;
      d.paid_upfront = $f("paid_upfront").checked;
      d.has_papers = PAPER_CLIENTS.includes(d.client) ? $f("has_papers").checked : true;
      d.is_foreclosure = $f("is_foreclosure").checked;
      d.packets = Math.max(1, parseInt($f("packets").value, 10) || 1);
      d.is_business = $f("is_business").checked;
      if (d.is_foreclosure && d.client === "ProVest" && !Number($f("price").value)) d.price = d.packets * PACKET_RATE;
      closeSheet(); saveLocal(); drawDrafts();
    };
    document.getElementById("shRemove").onclick = () => {
      S.drafts.splice(i, 1); closeSheet(); saveLocal(); drawDrafts();
    };
    back.onclick = (e) => { if (e.target === back) closeSheet(); };
    $f("person").focus();
  }
  function closeSheet() {
    const back = document.getElementById("sheetBack");
    back.hidden = true; back.innerHTML = "";
  }

  // ---------- "what do you want to do with it?" ----------
  // Before saving, any job that can't be routed gets a decision.
  function checkBeforeSave() {
    const { esc } = J();
    const pending = S.drafts
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => !duplicateOf(d, S.existing) && problems(d).length);
    if (!pending.length) { saveJobs(new Set()); return; }

    const choice = {};                       // index -> "later" | "draft"
    pending.forEach(({ i }) => { choice[i] = "later"; });
    const back = document.getElementById("sheetBack");
    const draw = () => {
      back.hidden = false;
      back.innerHTML = `
        <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="dcTitle">
          <h2 id="dcTitle">${pending.length} job${pending.length > 1 ? "s aren't" : " isn't"} ready for a route</h2>
          <p class="muted">What do you want to do with ${pending.length > 1 ? "them" : "it"}?</p>
          ${pending.map(({ d, i }) => `
            <div class="decide">
              <div class="decide-name">${esc(d.person || "(no name yet)")}${d.job_no ? ` <span class="jobno">#${esc(d.job_no)}</span>` : ""}</div>
              <div class="decide-why">${esc(problems(d).join(" · "))}</div>
              <div class="decide-btns">
                <button class="pick ${choice[i] === "fix" ? "on" : ""}" data-fix="${i}">Add address now</button>
                <button class="pick ${choice[i] === "later" ? "on" : ""}" data-set="${i}" data-val="later">Save, route later</button>
                <button class="pick ${choice[i] === "draft" ? "on" : ""}" data-set="${i}" data-val="draft">Keep as draft</button>
              </div>
            </div>`).join("")}
          <div class="sheet-btns">
            <button class="btn ghost" id="dcCancel">Go back</button>
            <button class="btn go" id="dcSave">Save now</button>
          </div>
        </div>`;
      back.querySelectorAll("[data-set]").forEach((b) => b.onclick = () => { choice[b.getAttribute("data-set")] = b.getAttribute("data-val"); draw(); });
      back.querySelectorAll("[data-fix]").forEach((b) => b.onclick = () => { closeSheet(); openSheet(Number(b.getAttribute("data-fix"))); });
      document.getElementById("dcCancel").onclick = closeSheet;
      document.getElementById("dcSave").onclick = () => {
        const keep = new Set(pending.filter(({ i }) => choice[i] === "draft").map(({ d }) => d));
        closeSheet();
        saveJobs(keep);
      };
    };
    draw();
  }

  // ---------- save ----------
  async function saveJobs(keepAsDraft) {
    const btn = document.getElementById("inSave");
    btn.disabled = true; btn.textContent = "Saving…";
    const toSave = S.drafts.filter((d) => !duplicateOf(d, S.existing) && !keepAsDraft.has(d));
    if (!toSave.length) { drawDrafts(); J().toast("Nothing saved — kept as drafts"); return; }
    const rows = toSave.map((d) => ({
      client: d.client, job_no: d.job_no || null, person: d.person || null, address: d.address || null,
      county: d.county || null, service: d.service || "Standard", due_date: d.due_date || null,
      price: Number(d.price) || 0, notes: d.notes || null, raw_text: d.raw_text || null,
      status: "Active", has_papers: d.has_papers !== false,
      is_foreclosure: !!d.is_foreclosure, packets: d.packets || 1, is_business: !!d.is_business,
      on_today: S.addToday && !problems(d).length && d.has_papers !== false,
      private_phone: d.private_phone || null, private_email: d.private_email || null,
      paid_upfront: !!d.paid_upfront
    }));
    const { error } = await J().db.from("jes_jobs").insert(rows);
    if (error) {
      J().toast("Not saved: " + error.message);
      btn.disabled = false; btn.textContent = "Try again";
      return;
    }
    S.drafts = S.drafts.filter((d) => !toSave.includes(d));
    saveLocal();
    // remember name → address for next time
    let learned = false;
    toSave.forEach((d) => {
      const k = nameKey(d.person);
      if (k && d.address && hasZip(d.address)) { S.known[k] = { address: d.address, county: d.county }; learned = true; }
    });
    if (learned) await J().db.from("jes_settings").upsert({ key: "known_addresses", value: S.known });
    await loadData();
    drawDrafts();
    const later = rows.filter((r) => !r.on_today && S.addToday).length;
    J().refreshBadges && J().refreshBadges(); J().toast(`Saved ${rows.length} job${rows.length === 1 ? "" : "s"}${later ? ` · ${later} waiting for an address` : ""}`);
  }

  async function saveIgnore() {
    const words = document.getElementById("igText").value.split("\n").map((w) => w.trim()).filter(Boolean);
    S.ignore[S.client] = words;
    const { error } = await J().db.from("jes_settings").upsert({ key: "ignore_words", value: S.ignore });
    J().toast(error ? "Not saved: " + error.message : "Ignore words saved for " + S.client);
  }

  window.JES_INTAKE = { draw };
})();
