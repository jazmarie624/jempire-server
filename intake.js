// J EMPIRE SERVER — intake.js (version 20: papers checked by default on every job —  deadline flags —  Proof, Accurate Serve, Legal Serve USA and Lynx Legal parsers; Ody's detail view; + Add one job; rates table)
// Reads pasted jobs for each client, drops the junk words, and builds
// uniform job drafts. Every draft can be edited before saving.
(function () {
  "use strict";

  // =====================================================================
  // 1. PARSERS (pure functions — no screen code here)
  // =====================================================================
  // ABC Legal is parked — its parser is still below, ready to switch back on
  const CLIENTS = ["ProVest", "Userve", "Ody's", "Accurate Serve", "Proof", "Lynx Legal", "Legal Serve USA", "Private"];

  const RULES = {
    "ABC Legal": "Keeps: order #, name, price, address, serve-by date, attempt instructions, vehicles. Ignores: Details, Photos, History, Deliver To, and the other menu words.",
    "Ody's": "Keeps: Standard or Rush, name, ODY job #, Action date and C/O (to notes), and the address when included. Once you add an address for a name, it fills in automatically next time.",
    "ProVest": "Keeps: every address as its own job, including C/O (registered agent) and Re: (property) addresses. Ignores: Saved, All Work, Corporate, Search, Include Closed Cases. Add job # and names later.",
    "Userve": "Keeps: name, job #, address, county. Ignores: open, MWA, MDEWA, the assigned date, Attempt / Serve, View on Map.",
    "Accurate Serve": "Keeps: the job #, name, Due date, address, and Routine or Rush. Ignores: the Assn date and the Attempts line.",
    "Legal Serve USA": "Same system as Accurate Serve, so it reads the same paste: job #, name, Due date, address, Routine or Rush. Set their rate in Money → Rates when you know it.",
    "Proof": "Keeps: whatever it can find — name, address, job #, and the price when the paste includes a dollar amount. Check the price on every job before you save.",
    "Lynx Legal": "Same shape as Ody's: Standard or Rush, name, job #, and the address when it's included. Set their rate in Money → Rates when you know it.",
    "Legal Serve USA": "No set format yet — it reads any address it finds and takes the line above it as the name. Fix whatever it gets wrong before saving.",
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
    }).join("")
      // Surname fixes, whatever case the paste arrived in
      .replace(/\bMc([a-z])/g, (m, c) => "Mc" + c.toUpperCase())    // McNally, McCray
      .replace(/\bO'([a-z])/g, (m, c) => "O'" + c.toUpperCase());   // O'Brien
  }

  function cleanAddress(s) {
    let a = (s || "").replace(/\s+/g, " ").trim();
    a = a.replace(/,\s*,+/g, ",");                                 // ",,"  -> ","
    a = a.replace(/,?\s*\b(OSCEOLA|ORANGE)\b\s*(COUNTY)?\s*,?\s*$/i, ""); // trailing county word
    a = a.replace(/,\s*FL\s*,?\s*(\d{5})(?:[\s-]+(\d{4}))?/i, (m, z, p4) => ", FL " + z + (p4 ? "-" + p4 : ""));
    a = a.replace(/\s+FL\s*,?\s*(\d{5})(?:[\s-]+(\d{4}))?/i, (m, z, p4) => ", FL " + z + (p4 ? "-" + p4 : ""));
    a = a.replace(/,?\s*\(?[o0]\)?\s*$/i, "");
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
      has_papers: true,   // always starts checked — uncheck the ones you don't have yet
      is_foreclosure: false, packets: 1, is_business: false, on_hold: false, job_type: "", attempt_count: 0 };
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
  function parseOdys(text, extra, client) {
    client = client || "Ody's";
    const ls = removeIgnored(lines(text), extra);
    // Ody's marks a job with "ODY — 2026013757". Lynx Legal uses the same
    // layout, so any short letter prefix (or a bare long number) counts too.
    const isMarker = (l) => client === "Ody's"
      ? /^ODY\s*[—–\-:]*\s*\d{6,}/i.test(l)
      : /^[A-Z]{2,6}\s*[—–\-:]*\s*\d{5,}\s*$/i.test(l) || /^#?\d{6,}\s*$/.test(l);
    const isService = (l) => /^(standard|rush|rushed|stand|standa|standar|ru|rus)$/i.test(l);
    const isAction = (l) => /^action\b/i.test(l);
    // C/O can sit at the start of its own line OR in the middle of the servee line
    const isCO = (l) => /(^|\s)(c\/o|attn|attention)\b/i.test(l);
    const isCity = (l) => /\b(FL|Florida)\b[\s,]*\d{5}/i.test(l);
    // Column headings in the detail view — never a name
    const isLabel = (l) => /^(party to be served|parties to be served|servee|servees|serve to|defendant|defendants|respondent|respondents|plaintiff|plaintiffs|petitioner|address|serve address|service address|name|case|court|county)s?\s*:?\s*$/i.test(l);
    const isNameish = (l) => !isService(l) && !isAction(l) && !isCO(l) && !isMarker(l) && !isLabel(l) &&
      !/^ODY$/i.test(l) && !STREET_START.test(l) && !isCity(l) && /[A-Za-z]{2}/.test(l);
    const idx = [];
    ls.forEach((l, i) => { if (isMarker(l)) idx.push(i); });
    if (!idx.length) { const d = blankDraft(client); d.raw_text = text.trim(); return [d]; }

    const headerFirst = ls.slice(0, idx[0]).every((l) => isService(l) || /^ODY$/i.test(l));
    const startOf = (at) => (at > 0 && isService(ls[at - 1]) ? at - 1 : at);

    return idx.map((at, n) => {
      const d = blankDraft(client);
      d.job_no = ls[at].match(/(\d{5,})/)[1];
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
      if (co) {
        // Keep only the part from C/O onward — the company name is already the job name
        const tail = co.replace(/^.*?(c\/o|attn|attention)\s*:?\s*/i, "");
        notes.push("C/O: " + titleCase(tail));
      }
      // A company or a registered agent gets the business-hours flag
      if ((nameLine && BIZ.test(nameLine)) || (co && /registered agent|r\.?a\.?\b/i.test(co))) d.is_business = true;
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
    const ls = removeIgnored(lines(text), extra).filter((l) => !PROVEST_JUNK.test(l) && !/^\(?[o0]\)?[.,]?$/i.test(l));
    const isCO = (l) => /^(c\/o|c\.o\.|attn|attention)\b/i.test(l);
    const isRe = (l) => /^re\s*:/i.test(l);
    const out = [];
    let cur = null;
    const start = (raw, kind, person) => { cur = { raw, addr: raw, kind: kind || "", person: person || "" }; out.push(cur); };
    ls.forEach((l) => {
      if (isCO(l)) {
        // "C/O Rftax Llc 3300 Greenwald Way N Kissimmee, FL 34741" — company, then the address
        const body = l.replace(/^(c\/o|c\.o\.|attn|attention)\s*:?\s*/i, "");
        const m = body.match(/^(.*?)(\d{1,6}[A-Za-z]?\s+.*)$/);
        start(m ? m[2] : body, "Registered agent (C/O)", m ? titleCase(m[1].trim()) : "");
        return;
      }
      if (isRe(l)) { start(l.replace(/^re\s*:\s*/i, ""), "Property address (Re:)", ""); return; }
      if (STREET_START.test(l) && (!cur || hasZip(cur.addr))) { start(l); return; }
      if (!cur) return;
      cur.addr += (cur.addr.trim().endsWith(",") ? " " : ", ") + l;
    });
    return out.map((o) => {
      const d = blankDraft("ProVest");
      d.raw_text = o.raw;
      d.address = cleanAddress(o.addr);
      d.county = countyFor(d.address);
      d.person = o.person || "";
      d.notes = o.kind || "";
      // a registered agent is a business — only servable 10–12 and 2–4
      if (o.kind === "Registered agent (C/O)") d.is_business = true;
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

  // ---------- Accurate Serve ----------
  // ORL262830 / NAME / Assn: date / Due: date / address / Routine / Attempts: 0
  const BIZ = /\b(llc|l\.l\.c|inc|corp|corporation|company|co|pa|p\.a|llp|lp|ltd|enterprises|services|group|bank|trust|association|assn|hoa|university|hospital|authority|agent|registered)\b/i;
  const ACC_JOBNO = /^[A-Z]{2,4}[-\s]?\d{5,}$/;

  function parseAccurate(text, extra) {
    const ls = removeIgnored(lines(text), extra);
    const out = [];
    let cur = null;
    const push = () => { if (cur) out.push(cur); cur = null; };

    ls.forEach((l) => {
      if (ACC_JOBNO.test(l)) {
        push();
        cur = blankDraft("Accurate Serve");
        cur.job_no = l.replace(/[-\s]/g, "");
        cur.raw_text = l;
        return;
      }
      if (!cur) return;
      cur.raw_text += "\n" + l;

      if (/^assn\s*:/i.test(l)) return;                    // assigned date — not needed
      if (/^attempts?\s*:/i.test(l)) {                     // how many they've already logged
        const am = l.match(/(\d+)/);
        if (am) cur.attempt_count = Number(am[1]);
        return;
      }
      if (/^due\s*:/i.test(l)) {
        const dm = l.match(DATE);
        if (dm) cur.due_date = toIsoDate(dm);
        return;
      }
      // Same as Proof: the service word carries the deadline, so keep it as a flag
      if (/^(routine|standard|regular)$/i.test(l)) { cur.service = "Standard"; cur.job_type = titleCase(l); return; }
      if (/^(rush|priority|expedited?|same.?day|asap)$/i.test(l)) { cur.service = "Rush"; cur.job_type = titleCase(l); return; }
      if (!cur.address && (hasZip(l) || STREET_START.test(l))) {
        cur.address = cleanAddress(l);
        cur.county = countyFor(cur.address);
        return;
      }
      if (!cur.person) {
        cur.person = titleCase(l);
        if (BIZ.test(l)) cur.is_business = true;
        return;
      }
      cur.notes = cur.notes ? cur.notes + " · " + l : l;
    });
    push();
    return out;
  }

  // "due in 22hrs" / "due in 2d 4h" / "by 8AM Sunday" -> a real date on the job
  const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  function dueFromText(s) {
    const t = (s || "").toLowerCase();
    const dm = t.match(/(\d+)\s*d(?:ay)?s?\b/);
    const hm = t.match(/(\d+)\s*h(?:r|rs|our|ours)?\b/);
    if (dm || hm) {
      const ms = Date.now() + (dm ? Number(dm[1]) * 864e5 : 0) + (hm ? Number(hm[1]) * 36e5 : 0);
      return new Date(ms).toISOString().slice(0, 10);
    }
    const wd = WEEKDAYS.findIndex((w) => t.indexOf(w) >= 0);
    if (wd >= 0) {
      const now = new Date(); now.setHours(12, 0, 0, 0);
      const add = ((wd - now.getDay()) + 7) % 7 || 7;
      now.setDate(now.getDate() + add);
      return now.toISOString().slice(0, 10);
    }
    if (/tomorrow/.test(t)) return new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    if (/today|tonight/.test(t)) return new Date().toISOString().slice(0, 10);
    return "";
  }

  // ---------- Proof ----------
  // Each job starts with an "Attempt due in…" / "Attempt by…" line. The price
  // floats around the block ($16.50 on its own, or "max pay $74.25"), and the
  // job # is sometimes buried in "Primary • 1/4 attempts • #2138760".
  function parseProof(text, extra) {
    const ls = removeIgnored(lines(text), extra);
    const isHeader = (l) => /^[•*\-\s]*attempt\s+(due\s+in|by)\b/i.test(l);
    const isNoise = (l) =>
      /^(assigned|unassigned|accepted|serve|in progress|primary|open|new|view|details)$/i.test(l) ||
      /^\d+\s+unread\s+chat/i.test(l) ||
      /^due\s+in\b/i.test(l) ||
      /^(hide|show)\s+\d+\s+jobs?\s+at\s+this\s+address/i.test(l) ||
      /^\d+(\.\d+)?\s*mi\s+away/i.test(l) ||
      /^[•*\-\s]*$/.test(l);

    const blocks = [];
    let cur = null;
    ls.forEach((l) => {
      if (isHeader(l)) { if (cur) blocks.push(cur); cur = [l]; return; }
      if (cur) cur.push(l); else cur = [l];
    });
    if (cur) blocks.push(cur);

    return blocks.map((bl) => {
      const d = blankDraft("Proof");
      d.raw_text = bl.join("\n");
      const nameParts = [];
      let nameDone = false;
      let post = "", stacked = 0;

      bl.forEach((l, i) => {
        if (i === 0 && isHeader(l)) {
          const by = l.replace(/^[•*\-\s]*/, "");
          d.notes = d.notes ? d.notes + "\n" + by : by;
          const due = dueFromText(by);
          if (due && !d.due_date) d.due_date = due;
          return;
        }
        // These have to be checked BEFORE the address, because "2 Day Post"
        // looks exactly like a house number followed by a street name.
        if (/^\d+\s*day\s*post/i.test(l)) { post = l; d.job_type = titleCase(l); nameDone = true; return; }
        if (/^(expedited|rush|priority|same.?day|asap)$/i.test(l)) { d.service = "Rush"; d.job_type = titleCase(l); nameDone = true; return; }
        if (/^(routine|standard|regular)$/i.test(l)) { d.service = "Standard"; d.job_type = titleCase(l); nameDone = true; return; }
        const sm = l.match(/^(?:hide|show)\s+(\d+)\s+jobs?\s+at\s+this\s+address/i);
        if (sm) { stacked = Number(sm[1]); nameDone = true; return; }
        if (isNoise(l)) { nameDone = true; return; }

        // price — "$16.50" alone, or "max pay $74.25"
        const pm = l.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
        if (pm) {
          if (d.price == null) d.price = Number(pm[1].replace(/,/g, ""));
          if (/max\s*pay/i.test(l)) d.notes = (d.notes ? d.notes + "\n" : "") + "Proof shows this as MAX pay — check what actually lands.";
          nameDone = true;
          return;
        }
        // job number — "#2139564" (the # is stripped off by then), or buried
        // in "Primary • 1/4 attempts • #2138760"
        const am = l.match(/(\d+)\s*\/\s*(\d+)\s*attempts?/i);
        if (am) d.attempt_count = Number(am[1]);
        const jm = l.match(/#\s*([0-9][0-9\/]{3,})/) || l.match(/^([0-9][0-9\/]{4,})$/);
        if (jm) { if (!d.job_no) d.job_no = jm[1].replace(/\/$/, ""); nameDone = true; return; }
        if (am) { nameDone = true; return; }

        // county comes free on the "10.1 mi away • Osceola County" line
        const cm = l.match(/mi\s+away\s*[•·|]\s*([A-Za-z]+)\s+County/i);
        if (cm) { d.county = titleCase(cm[1]); nameDone = true; return; }
        // address
        if (!d.address && (hasZip(l) || STREET_START.test(l))) {
          d.address = cleanAddress(l);
          if (!d.county) d.county = countyFor(d.address);
          nameDone = true;
          return;
        }
        if (!nameDone) nameParts.push(l);
      });

      if (nameParts.length) {
        d.person = titleCase(nameParts.join(" ").replace(/\s+/g, " ").trim());
        if (BIZ.test(d.person)) d.is_business = true;
      }
      const extras = [];
      if (post) extras.push(titleCase(post) + " — posting, not a personal serve");
      if (stacked > 1) extras.push(`${stacked} jobs at this address — check for a second one in Proof.`);
      if (extras.length) d.notes = (d.notes ? d.notes + "\n" : "") + extras.join("\n");
      if (d.county) d.county = titleCase(d.county);
      return d;
    }).filter((d) => d.person || d.address || d.job_no);
  }

  // ---------- Anything else (Lynx Legal fallback, anything new) ----------
  // No fixed layout: every address line starts a job, and the lines above it
  // are read for a name, a job #, a due date and a dollar amount.
  function parseGeneric(client, text, extra) {
    const ls = removeIgnored(lines(text), extra);
    const out = [];
    let held = [];

    const flush = (addrLine) => {
      const d = blankDraft(client);
      if (addrLine) { d.address = cleanAddress(addrLine); d.county = countyFor(d.address); }
      held.forEach((p) => {
        const pm = p.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
        if (pm && d.price == null) { d.price = Number(pm[1].replace(/,/g, "")); return; }
        const dm = p.match(DATE);
        if (dm) { if (/due|serve by|deadline/i.test(p) && !d.due_date) d.due_date = toIsoDate(dm); return; }
        if (/^(rush|priority|expedite|same.?day|asap)/i.test(p)) { d.service = "Rush"; return; }
        // "Job 8842991", "File #22-1180", "Case: ABC-9912" — or a bare code with digits
        const jm = p.match(/^(?:job|file|case|ref(?:erence)?|order|service|svc)\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Za-z0-9._\/-]{3,24})$/i);
        if (!d.job_no && jm) { d.job_no = jm[1]; return; }
        if (!d.job_no && /\d/.test(p) && /^#?[A-Za-z0-9._\/-]{4,24}$/.test(p)) { d.job_no = p.replace(/^#/, ""); return; }
        if (!d.person && /[A-Za-z]{2}/.test(p)) {
          d.person = titleCase(p);
          if (BIZ.test(p)) d.is_business = true;
          return;
        }
        d.notes = d.notes ? d.notes + " · " + p : p;
      });
      d.raw_text = held.concat(addrLine ? [addrLine] : []).join("\n");
      held = [];
      out.push(d);
    };

    ls.forEach((l) => {
      if (hasZip(l) || STREET_START.test(l)) flush(l);
      else held.push(l);
    });
    if (held.length) {
      if (out.length) {
        const last = out[out.length - 1];
        last.notes = (last.notes ? last.notes + " · " : "") + held.join(" · ");
      } else flush("");
    }
    return out;
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
    // Lynx Legal comes out in the same shape as Ody's
    if (client === "Ody's" || client === "Lynx Legal") return parseOdys(text, extra, client);
    if (client === "ProVest") return parseProVest(text, extra);
    if (client === "Userve") return parseUserve(text, extra);
    // Accurate Serve and Legal Serve USA run on the same system, so the paste is identical
    if (client === "Accurate Serve" || client === "Legal Serve USA") return parseAccurate(text, extra);
    if (client === "Proof") return parseProof(text, extra);
    if (client === "Private") return parsePrivate(text);
    return parseGeneric(client, text, extra);
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
    const [jobs, rates, ign, known] = await Promise.all([
      db.from("jes_jobs").select("id,client,job_no,address,status"),
      db.from("jes_rates").select("company,standard,rush,mode"),
      db.from("jes_settings").select("value").eq("key", "ignore_words").maybeSingle(),
      db.from("jes_settings").select("value").eq("key", "known_addresses").maybeSingle()
    ]);
    S.known = (known.data && known.data.value) || {};
    S.existing = jobs.data || [];
    S.rates = {};
    (rates.data || []).forEach((r) => { S.rates[r.company] = r; });
    S.ignore = (ign.data && ign.data.value) || {};
  }

  // The price for this client at this service level. null = no rate set yet.
  function rateFor(client, service) {
    const r = S.rates[client];
    if (!r) return null;
    const v = service === "Rush" ? r.rush : r.standard;
    return v == null ? null : Number(v);
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
          <button class="btn ghost wide" id="inOne">+ Add one job by hand</button>
          <p class="muted small">For jobs that come in by email, by text, or over the phone — nothing to paste.</p>
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
    document.getElementById("inOne").onclick = addOne;
    document.getElementById("igSave").onclick = saveIgnore;

    await loadData();
    syncClient();
    drawDrafts();
  }

  // One job, typed in — for anything that didn't arrive as text you can paste.
  function addOne() {
    const d = blankDraft(S.client);
    d.source = "One job";
    d.price = rateFor(S.client, "Standard");
    if (d.price == null) d.price = 0;
    S.drafts.push(d);
    saveLocal();
    drawDrafts();
    openSheet(S.drafts.length - 1);
  }

  function build() {
    const text = document.getElementById("inText").value;
    if (!text.trim() && S.client !== "Private") { J().toast("Paste jobs first"); return; }
    const found = parse(S.client, text, S.ignore[S.client]);
    found.forEach((d) => {
      if (d.price == null) d.price = rateFor(d.client, d.service);
      if (d.price == null) d.price = 0;
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
          <button class="flag paper ${d.has_papers ? "on" : ""}" data-flag="has_papers" data-i="${i}">📄 ${d.has_papers ? "Papers in hand" : "NO PAPERS YET"}</button>
          <button class="flag rush ${d.service === "Rush" ? "on" : ""}" data-flag="service" data-i="${i}">⚡ Rush</button>
          <button class="flag fore ${d.is_foreclosure ? "on" : ""}" data-flag="is_foreclosure" data-i="${i}">📚 Foreclosure</button>
          ${d.is_foreclosure ? `<label class="pk">packets <input inputmode="numeric" data-pk="${i}" value="${d.packets || 1}" aria-label="How many packets"></label>` : ""}
          <button class="flag biz ${d.is_business ? "on" : ""}" data-flag="is_business" data-i="${i}">🏢 Business</button>
          <button class="flag hold ${d.on_hold ? "on" : ""}" data-flag="on_hold" data-i="${i}">⏸ Hold</button>
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
        <div class="private-only" ${d.client === "Private" ? "" : "hidden"}>
          <div class="grid2">
            <label>Client phone<input id="f_private_phone" inputmode="tel" value="${esc(d.private_phone)}"></label>
            <label>Client email<input id="f_private_email" inputmode="email" value="${esc(d.private_email)}"></label>
          </div>
        </div>
        <div class="toggle-list">
          <label class="tgl" id="f_papers_line">
            <input type="checkbox" id="f_has_papers" ${d.has_papers ? "checked" : ""}><span>📄 I have the papers for this job</span></label>
          <label class="tgl"><input type="checkbox" id="f_is_business" ${d.is_business ? "checked" : ""}><span>🏢 Business — serve 10–12 or 2–4 only</span></label>
          <label class="tgl"><input type="checkbox" id="f_is_foreclosure" ${d.is_foreclosure ? "checked" : ""}><span>📚 Foreclosure — pays per packet</span></label>
          <label class="tgl inset"><span>How many packets?</span><input id="f_packets" inputmode="numeric" value="${d.packets || 1}"></label>
          <label class="tgl" ${d.client === "Private" ? "" : "hidden"} id="f_paid_line"><input type="checkbox" id="f_paid_upfront" ${d.paid_upfront ? "checked" : ""}><span>💵 Paid upfront (private client)</span></label>
          <label class="tgl"><input type="checkbox" id="f_on_hold" ${d.on_hold ? "checked" : ""}><span>⏸ Put this job on hold</span></label>
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
      const isPriv = $f("client").value === "Private";
      const po = back.querySelector(".private-only"); if (po) po.hidden = !isPriv;
      const pl = document.getElementById("f_paid_line"); if (pl) pl.hidden = !isPriv;
    };
    $f("address").onblur = () => {
      const cleaned = window.JES_PARSE.cleanAddress($f("address").value);
      $f("address").value = cleaned;
      if (!$f("county").value) $f("county").value = countyFor(cleaned) || "";
    };
    document.getElementById("shDone").onclick = () => {
      ["client", "service", "job_no", "person", "address", "county", "due_date", "notes", "private_phone", "private_email"]
        .forEach((k) => { if ($f(k)) d[k] = $f(k).value.trim(); });
      d.address = window.JES_PARSE.cleanAddress(d.address);
      if (!d.county) d.county = countyFor(d.address);
      d.price = Number(String($f("price").value).replace(/[^0-9.]/g, "")) || 0;
      d.paid_upfront = !!($f("paid_upfront") && $f("paid_upfront").checked);
      d.has_papers = !($f("has_papers") && !$f("has_papers").checked);
      d.is_foreclosure = !!($f("is_foreclosure") && $f("is_foreclosure").checked);
      d.packets = Math.max(1, parseInt($f("packets") ? $f("packets").value : 1, 10) || 1);
      d.is_business = !!($f("is_business") && $f("is_business").checked);
      d.on_hold = !!($f("on_hold") && $f("on_hold").checked);
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
      status: d.on_hold ? "On Hold" : "Active", has_papers: d.has_papers !== false,
      is_foreclosure: !!d.is_foreclosure, packets: d.packets || 1, is_business: !!d.is_business,
      on_today: S.addToday && !problems(d).length && d.has_papers !== false && !d.on_hold,
      private_phone: d.private_phone || null, private_email: d.private_email || null,
      paid_upfront: !!d.paid_upfront,
      source: d.source || "Paste",
      job_type: d.job_type || null,
      attempt_count: Number(d.attempt_count) || 0
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
