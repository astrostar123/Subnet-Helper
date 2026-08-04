/* ============================================================
   SubnetMaster — script.js
   Vanilla JS, no dependencies.

   Modules (in order):
     1. IPv4 core utilities        (pure functions)
     2. Step-by-step explainers    (pure functions)
     3. UI helpers                 (toast, tabs, contrast)
     4. Subnet Calculator panel
     5. Host Calculator panel
     6. Binary Visualizer panel
     7. VLSM Helper panel
     8. Practice Mode
     9. Quiz Mode + leaderboard
    10. Cheat Sheet & CIDR table + search
    11. History (localStorage)
    12. PDF export (print-based)
    13. Init
   ============================================================ */

"use strict";

/* ============================================================
   1. IPv4 CORE UTILITIES
   All IPv4 math is done on unsigned 32-bit integers.
   `>>> 0` forces JavaScript's signed bitwise results back
   into the unsigned range (0 … 4294967295).
   ============================================================ */

const IP = {
  /** Validate a dotted-quad IPv4 string. Returns true/false. */
  isValid(str) {
    if (typeof str !== "string") return false;
    const parts = str.trim().split(".");
    if (parts.length !== 4) return false;
    return parts.every((p) => {
      if (!/^\d{1,3}$/.test(p)) return false;        // digits only, no signs
      if (p.length > 1 && p[0] === "0") return false; // no leading zeros (avoids octal confusion)
      const n = Number(p);
      return n >= 0 && n <= 255;
    });
  },

  /** "192.168.1.10" -> 3232235786 (unsigned 32-bit int). */
  toInt(str) {
    return str.trim().split(".")
      .reduce((acc, oct) => ((acc << 8) + Number(oct)) >>> 0, 0);
  },

  /** 3232235786 -> "192.168.1.10". */
  toDotted(int) {
    return [24, 16, 8, 0].map((s) => (int >>> s) & 255).join(".");
  },

  /** CIDR prefix (0–32) -> mask as unsigned int. /0 must be 0, not -1. */
  maskFromCidr(cidr) {
    return cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0;
  },

  /** Mask int -> CIDR prefix, or -1 if the mask is not contiguous. */
  cidrFromMask(maskInt) {
    const bits = maskInt.toString(2).padStart(32, "0");
    const cidr = bits.indexOf("0") === -1 ? 32 : bits.indexOf("0");
    // Reject non-contiguous masks like 255.0.255.0
    if (bits.slice(cidr).includes("1")) return -1;
    return cidr;
  },

  /** Int -> "11000000.10101000.00000001.00001010". */
  toBinary(int) {
    const b = (int >>> 0).toString(2).padStart(32, "0");
    return `${b.slice(0, 8)}.${b.slice(8, 16)}.${b.slice(16, 24)}.${b.slice(24)}`;
  },

  /**
   * Smallest CIDR that provides at least `hosts` usable addresses.
   * Capped at /1 (2^31 − 2 = 2,147,483,646 hosts); returns -1 beyond that.
   */
  cidrForHosts(hosts) {
    if (hosts === 1 || hosts === 2) return 30;      // /31 & /32 are special cases; use /30
    for (let bits = 2; bits <= 31; bits++) {
      if (Math.pow(2, bits) - 2 >= hosts) return 32 - bits;
    }
    return -1; // more hosts than any practical IPv4 subnet can hold
  },

  /**
   * Full subnet report for an IP + CIDR.
   * Returns null for invalid input; otherwise an object with every
   * value the UI needs, pre-formatted where useful.
   */
  subnet(ipStr, cidr) {
    if (!IP.isValid(ipStr) || cidr < 0 || cidr > 32) return null;

    const ip        = IP.toInt(ipStr);
    const mask      = IP.maskFromCidr(cidr);
    const wildcard  = (~mask) >>> 0;
    const network   = (ip & mask) >>> 0;
    const broadcast = (network | wildcard) >>> 0;
    const total     = Math.pow(2, 32 - cidr);

    // /31 (point-to-point, RFC 3021) and /32 (single host) have no
    // separate network/broadcast pair, so "usable" differs.
    let usable, firstHost, lastHost;
    if (cidr >= 31) {
      usable    = cidr === 31 ? 2 : 1;
      firstHost = network;
      lastHost  = broadcast;
    } else {
      usable    = total - 2;
      firstHost = network + 1;
      lastHost  = broadcast - 1;
    }

    return {
      input: ipStr.trim(),
      cidr,
      ip, mask, wildcard, network, broadcast,
      total, usable,
      firstHost, lastHost,
      ipDotted:        IP.toDotted(ip),
      maskDotted:      IP.toDotted(mask),
      wildcardDotted:  IP.toDotted(wildcard),
      networkDotted:   IP.toDotted(network),
      broadcastDotted: IP.toDotted(broadcast),
      firstHostDotted: IP.toDotted(firstHost),
      lastHostDotted:  IP.toDotted(lastHost),
      maskBinary:      IP.toBinary(mask),
      // How many subnets of this size fit in the parent classful network
      subnets: IP.classfulSubnetCount(ip, cidr),
      className: IP.classOf(ip),
    };
  },

  /** Legacy class of an address (still asked on every exam). */
  classOf(ipInt) {
    const first = ipInt >>> 24;
    if (first < 128) return "A";
    if (first < 192) return "B";
    if (first < 224) return "C";
    if (first < 240) return "D (multicast)";
    return "E (experimental)";
  },

  /** Default (classful) prefix for the address, or null for D/E. */
  classfulPrefix(ipInt) {
    const first = ipInt >>> 24;
    if (first < 128) return 8;
    if (first < 192) return 16;
    if (first < 224) return 24;
    return null;
  },

  /** Number of subnets of size /cidr inside the classful network. */
  classfulSubnetCount(ipInt, cidr) {
    const base = IP.classfulPrefix(ipInt);
    if (base === null || cidr < base) return 1;
    return Math.pow(2, cidr - base);
  },
};

/** Format big numbers with thousands separators: 4194304 -> "4,194,304". */
const fmt = (n) => n.toLocaleString("en-US");

/* ============================================================
   2. STEP-BY-STEP EXPLAINERS
   Each returns an array of { title, body, math? } objects that
   the UI renders as an animated numbered list.
   ============================================================ */

/** Explain: "I need N hosts" -> CIDR + mask. Beginner-friendly. */
function stepsForHosts(hosts) {
  const hostBits = 32 - IP.cidrForHosts(hosts);
  const total    = Math.pow(2, hostBits);
  const cidr     = 32 - hostBits;
  const mask     = IP.toDotted(IP.maskFromCidr(cidr));

  return [
    {
      title: `You need ${fmt(hosts)} usable host address${hosts === 1 ? "" : "es"}.`,
      body: "Every device that needs an IP — PCs, phones, printers, servers — counts as one host.",
    },
    {
      title: "Find the nearest power of two that fits.",
      body: `Subnets always come in power-of-two sizes. We need at least ${fmt(hosts)} + 2 addresses, because two are always reserved.`,
      math: `2^${hostBits} = ${fmt(total)} addresses — the smallest block that fits`,
    },
    {
      title: "Subtract the two reserved addresses.",
      body: "The first address names the network itself, and the last is the broadcast address. Neither can be given to a device.",
      math: `${fmt(total)} − 2 = ${fmt(total - 2)} usable hosts`,
    },
    {
      title: `That block size needs ${hostBits} host bits.`,
      body: `Each host bit doubles the block: ${hostBits} bits give 2^${hostBits} = ${fmt(total)} combinations.`,
    },
    {
      title: "Whatever isn't a host bit is a network bit.",
      body: "An IPv4 address is 32 bits. Take away the host bits and the rest belong to the network — that count is the CIDR prefix.",
      math: `32 − ${hostBits} = /${cidr}`,
    },
    {
      title: "Write the prefix as a subnet mask.",
      body: `A /${cidr} means the first ${cidr} bits are 1s and the last ${hostBits} bits are 0s. Convert each group of 8 bits to decimal:`,
      math: `Subnet mask: ${mask}`,
    },
  ];
}

/** Explain a full IP + CIDR calculation (AND trick, block size, etc.). */
function stepsForSubnet(r) {
  const lastMaskOctet = (r.mask >>> 0) & 255 || ((r.mask >>> 8) & 255); // interesting octet for the trick
  const blockSize = 256 - lastMaskOctet;
  const steps = [
    {
      title: `Start with ${r.ipDotted}/${r.cidr}.`,
      body: `The "/${r.cidr}" says the first ${r.cidr} bits identify the network and the remaining ${32 - r.cidr} bits identify hosts inside it. (This is a Class ${r.className} address.)`,
    },
    {
      title: "Turn the prefix into a subnet mask.",
      body: `${r.cidr} ones followed by ${32 - r.cidr} zeros, then each octet converted to decimal.`,
      math: `${r.maskBinary}  →  ${r.maskDotted}`,
    },
    {
      title: "Invert the mask to get the wildcard.",
      body: "The wildcard mask flips every bit — it's what ACLs on Cisco and Fortinet gear use.",
      math: `Wildcard: ${r.wildcardDotted}`,
    },
    {
      title: "AND the IP with the mask to find the network address.",
      body: "Bitwise AND keeps a bit only where both the IP and the mask have a 1 — which zeroes out all host bits.",
      math: `${r.ipDotted} AND ${r.maskDotted} = ${r.networkDotted}`,
    },
    {
      title: "Set all host bits to 1 to find the broadcast address.",
      body: "The broadcast is the very last address in the block — a packet sent there reaches every host in the subnet.",
      math: `Broadcast: ${r.broadcastDotted}`,
    },
  ];

  if (r.cidr <= 30) {
    steps.push({
      title: "Everything in between is usable.",
      body: "First usable = network + 1. Last usable = broadcast − 1.",
      math: `${r.firstHostDotted} … ${r.lastHostDotted}  (${fmt(r.usable)} hosts)`,
    });
  } else {
    steps.push({
      title: r.cidr === 31 ? "A /31 is a special point-to-point link." : "A /32 is a single host route.",
      body: r.cidr === 31
        ? "RFC 3021 lets both addresses in a /31 be used on router-to-router links — no network or broadcast address is reserved."
        : "A /32 matches exactly one address. It's used for loopbacks and host routes, not for LANs.",
    });
  }

  steps.push({
    title: "Count the addresses.",
    body: `${32 - r.cidr} host bits give the total size of the block.`,
    math: `2^${32 - r.cidr} = ${fmt(r.total)} total  →  ${fmt(r.usable)} usable`,
  });

  if (r.cidr >= 25 && r.cidr <= 30) {
    steps.push({
      title: "Shortcut: the block size trick.",
      body: `The interesting mask octet is ${lastMaskOctet}, so subnets repeat every ${blockSize} addresses (256 − ${lastMaskOctet}). Your IP falls in the block starting at ${r.networkDotted}.`,
    });
  }

  return steps;
}

/* ============================================================
   3. UI HELPERS
   ============================================================ */

const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/** Small transient notification. */
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

/** Escape text before inserting into innerHTML. */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- Tab system (accessible, keyboard-navigable) ---------- */
function initTabs() {
  const tabs = $$(".tab");

  function activate(tab, focus = true) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.dataset.panel);
      panel.classList.toggle("active", on);
      panel.hidden = !on;
    });
    if (focus) tab.focus();
  }

  tabs.forEach((tab, i) => {
    tab.tabIndex = tab.classList.contains("active") ? 0 : -1;
    tab.addEventListener("click", () => activate(tab, false));
    // Roving tabindex: arrows move between tabs, Home/End jump.
    tab.addEventListener("keydown", (e) => {
      let next = null;
      if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
      if (e.key === "ArrowLeft")  next = tabs[(i - 1 + tabs.length) % tabs.length];
      if (e.key === "Home")       next = tabs[0];
      if (e.key === "End")        next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); activate(next); }
    });
  });
}

/* ---------- High-contrast toggle (persisted) ---------- */
function initContrast() {
  const btn = $("#contrastToggle");
  const apply = (on) => {
    document.body.classList.toggle("high-contrast", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  };
  apply(localStorage.getItem("sm_contrast") === "1");
  btn.addEventListener("click", () => {
    const on = !document.body.classList.contains("high-contrast");
    apply(on);
    localStorage.setItem("sm_contrast", on ? "1" : "0");
  });
}

/* ---------- Render helpers ---------- */

/** Render a <dl> of results from [label, value, highlight?] rows. */
function renderResults(dl, rows) {
  dl.innerHTML = rows
    .map(([k, v, hl]) => `<dt>${esc(k)}</dt><dd${hl ? ' class="hl"' : ""}>${esc(v)}</dd>`)
    .join("");
}

/** Render animated steps into an <ol>. */
function renderSteps(ol, steps) {
  ol.innerHTML = steps
    .map((s, i) => `
      <li style="--i:${i}">
        <span class="step-title">${esc(s.title)}</span>
        <span class="step-body"> ${esc(s.body)}</span>
        ${s.math ? `<span class="step-math">${esc(s.math)}</span>` : ""}
      </li>`)
    .join("");
}

/** Binary string with network bits cyan / host bits amber. */
function colorBinary(binaryDotted, cidr) {
  let bitIndex = 0;
  return binaryDotted.split("").map((ch) => {
    if (ch === ".") return '<span class="bit-dot">.</span>';
    const cls = bitIndex < cidr ? "bit-net" : "bit-host";
    bitIndex++;
    return `<span class="${cls}">${ch}</span>`;
  }).join("");
}

/* ============================================================
   4. SUBNET CALCULATOR PANEL
   ============================================================ */

let lastCalcResult = null; // kept for Copy / PDF export

function initCalculator() {
  const form       = $("#calcForm");
  const ipInput    = $("#calcIp");
  const cidrInput  = $("#calcCidr");
  const hostsInput = $("#calcHosts");
  const errEl      = $("#calcError");

  // Toggle between "by CIDR" and "by hosts" input modes.
  form.calcMode.forEach((radio) =>
    radio.addEventListener("change", () => {
      const byCidr = form.calcMode.value === "cidr";
      $("#cidrField").classList.toggle("hidden", !byCidr);
      $("#hostsField").classList.toggle("hidden", byCidr);
    })
  );

  $("#calcExample").addEventListener("click", () => {
    ipInput.value = "172.16.35.123";
    form.calcMode.value = "cidr";
    form.calcMode.forEach((r) => r.dispatchEvent(new Event("change")));
    cidrInput.value = 20;
    form.requestSubmit();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errEl.textContent = "";
    ipInput.removeAttribute("aria-invalid");
    cidrInput.removeAttribute("aria-invalid");
    hostsInput.removeAttribute("aria-invalid");

    // --- Validate IP ---
    const ipStr = ipInput.value.trim();
    if (!IP.isValid(ipStr)) {
      errEl.textContent = "Enter a valid IPv4 address — four numbers 0–255 separated by dots, e.g. 192.168.1.10.";
      ipInput.setAttribute("aria-invalid", "true");
      ipInput.focus();
      return;
    }

    // --- Resolve CIDR from the chosen mode ---
    let cidr;
    let hostSteps = null;
    if (form.calcMode.value === "cidr") {
      cidr = Number(cidrInput.value);
      if (!Number.isInteger(cidr) || cidr < 0 || cidr > 32) {
        errEl.textContent = "CIDR prefix must be a whole number from 0 to 32.";
        cidrInput.setAttribute("aria-invalid", "true");
        cidrInput.focus();
        return;
      }
    } else {
      const hosts = Number(hostsInput.value);
      if (!Number.isInteger(hosts) || hosts < 1) {
        errEl.textContent = "Enter how many usable hosts you need (a whole number, at least 1).";
        hostsInput.setAttribute("aria-invalid", "true");
        hostsInput.focus();
        return;
      }
      cidr = IP.cidrForHosts(hosts);
      if (cidr === -1) {
        errEl.textContent = `No IPv4 subnet can hold ${fmt(hosts)} hosts — the largest practical subnet (/1) allows ${fmt(2 ** 31 - 2)}.`;
        hostsInput.setAttribute("aria-invalid", "true");
        return;
      }
      hostSteps = stepsForHosts(hosts);
    }

    // --- Calculate & render ---
    const r = IP.subnet(ipStr, cidr);
    lastCalcResult = r;

    renderResults($("#calcResults"), [
      ["Network address",   `${r.networkDotted}/${r.cidr}`, true],
      ["Broadcast address", r.broadcastDotted],
      ["First usable host", r.firstHostDotted],
      ["Last usable host",  r.lastHostDotted],
      ["Subnet mask",       r.maskDotted],
      ["Wildcard mask",     r.wildcardDotted],
      ["CIDR notation",     `/${r.cidr}`],
      ["Binary mask",       r.maskBinary],
      ["Total addresses",   fmt(r.total)],
      ["Usable hosts",      fmt(r.usable), true],
      ["Subnets (in class " + r.className[0] + " net)", fmt(r.subnets)],
      ["Address class",     r.className],
    ]);
    $("#calcResultsCard").hidden = false;

    // Steps: host-sizing explanation first (if used), then the subnet math.
    const steps = hostSteps ? [...hostSteps, ...stepsForSubnet(r)] : stepsForSubnet(r);
    renderSteps($("#calcSteps"), steps);
    $("#calcStepsCard").hidden = false;

    // Binary view of IP / mask / network / broadcast.
    $("#calcBinary").innerHTML = [
      ["IP address", IP.toBinary(r.ip)],
      ["Subnet mask", r.maskBinary],
      ["Network", IP.toBinary(r.network)],
      ["Broadcast", IP.toBinary(r.broadcast)],
    ].map(([lbl, bin]) => `
      <div class="binary-row">
        <span class="lbl">${lbl}</span>
        <span>${colorBinary(bin, r.cidr)}</span>
      </div>`).join("");
    $("#calcBinaryCard").hidden = false;

    History.add("Subnet", `${r.ipDotted}/${r.cidr} → net ${r.networkDotted}, ${fmt(r.usable)} hosts`);
  });

  // Copy results to clipboard as plain text.
  $("#copyResults").addEventListener("click", async () => {
    if (!lastCalcResult) return;
    const r = lastCalcResult;
    const text = [
      `SubnetMaster — ${r.ipDotted}/${r.cidr}`,
      `Network:    ${r.networkDotted}`,
      `Broadcast:  ${r.broadcastDotted}`,
      `Host range: ${r.firstHostDotted} – ${r.lastHostDotted}`,
      `Mask:       ${r.maskDotted}`,
      `Wildcard:   ${r.wildcardDotted}`,
      `Usable:     ${fmt(r.usable)} hosts`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast("Results copied to clipboard");
    } catch {
      toast("Copy failed — your browser blocked clipboard access");
    }
  });

  $("#exportPdf").addEventListener("click", () => exportPdf());
}

/* ============================================================
   5. HOST CALCULATOR PANEL
   ============================================================ */

function initHostCalc() {
  const form  = $("#hostForm");
  const input = $("#hostCount");
  const errEl = $("#hostError");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errEl.textContent = "";
    input.removeAttribute("aria-invalid");

    const hosts = Number(input.value);
    if (!Number.isInteger(hosts) || hosts < 1) {
      errEl.textContent = "Enter a whole number of hosts, at least 1.";
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    const cidr = IP.cidrForHosts(hosts);
    if (cidr === -1) {
      errEl.textContent = `No IPv4 subnet can hold ${fmt(hosts)} hosts.`;
      input.setAttribute("aria-invalid", "true");
      return;
    }

    const total  = 2 ** (32 - cidr);
    const usable = total - 2;
    const wasted = usable - hosts;

    renderResults($("#hostResults"), [
      ["Required hosts", fmt(hosts)],
      ["Recommended CIDR", `/${cidr}`, true],
      ["Subnet mask", IP.toDotted(IP.maskFromCidr(cidr)), true],
      ["Wildcard mask", IP.toDotted((~IP.maskFromCidr(cidr)) >>> 0)],
      ["Total addresses", fmt(total)],
      ["Usable hosts", fmt(usable)],
      ["Wasted (unused) hosts", fmt(wasted)],
      ["Efficiency", `${((hosts / usable) * 100).toFixed(1)}%`],
    ]);
    $("#hostResultsCard").hidden = false;

    renderSteps($("#hostSteps"), stepsForHosts(hosts));
    $("#hostStepsCard").hidden = false;

    History.add("Hosts", `${fmt(hosts)} hosts → /${cidr} (${IP.toDotted(IP.maskFromCidr(cidr))}), ${fmt(wasted)} wasted`);
  });
}

/* ============================================================
   6. BINARY VISUALIZER PANEL
   ============================================================ */

function initVisualizer() {
  const slider = $("#vizSlider");
  const grid   = $("#bitGrid");

  // Build 32 bit cells with octet separators once.
  const cells = [];
  for (let i = 0; i < 32; i++) {
    if (i > 0 && i % 8 === 0) {
      const sep = document.createElement("div");
      sep.className = "bit-sep";
      grid.appendChild(sep);
    }
    const cell = document.createElement("div");
    cell.className = "bit-cell";
    grid.appendChild(cell);
    cells.push(cell);
  }

  function update() {
    const cidr = Number(slider.value);
    slider.setAttribute("aria-valuenow", cidr);
    $("#vizCidrLabel").textContent = `/${cidr}`;

    cells.forEach((cell, i) => {
      const on = i < cidr;
      cell.textContent = on ? "1" : "0";
      cell.classList.toggle("on", on);
    });

    const mask   = IP.maskFromCidr(cidr);
    const total  = 2 ** (32 - cidr);
    const usable = cidr >= 31 ? (cidr === 31 ? 2 : 1) : total - 2;

    $("#vizReadout").innerHTML = [
      ["Subnet mask", IP.toDotted(mask)],
      ["Wildcard", IP.toDotted((~mask) >>> 0)],
      ["Network bits", `${cidr}`],
      ["Host bits", `${32 - cidr}`],
      ["Total addresses", fmt(total)],
      ["Usable hosts", fmt(usable)],
    ].map(([k, v]) => `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("");
  }

  slider.addEventListener("input", update);
  update();
}

/* ============================================================
   7. VLSM HELPER PANEL
   ============================================================ */

function initVlsm() {
  const rowsEl = $("#vlsmRows");
  const errEl  = $("#vlsmError");

  function addRow(name = "", hosts = "") {
    const row = document.createElement("div");
    row.className = "vlsm-row";
    row.innerHTML = `
      <input type="text" placeholder="Network name (e.g. Office A)" value="${esc(name)}"
             aria-label="Network name" maxlength="30">
      <input type="number" placeholder="Hosts" min="1" value="${esc(hosts)}"
             aria-label="Required hosts">
      <button type="button" class="remove-row" aria-label="Remove this network">✕</button>`;
    row.querySelector(".remove-row").addEventListener("click", () => row.remove());
    rowsEl.appendChild(row);
  }

  $("#vlsmAddRow").addEventListener("click", () => addRow());

  $("#vlsmExample").addEventListener("click", () => {
    rowsEl.innerHTML = "";
    addRow("Office A", 100);
    addRow("Office B", 50);
    addRow("Office C", 20);
    addRow("WAN link", 2);
    $("#vlsmBase").value = "192.168.10.0";
    $("#vlsmBaseCidr").value = 24;
  });

  // Start with two blank rows so the form is self-explanatory.
  addRow("Office A", "");
  addRow("Office B", "");

  $("#vlsmForm").addEventListener("submit", (e) => {
    e.preventDefault();
    errEl.textContent = "";

    const baseStr  = $("#vlsmBase").value.trim();
    const baseCidr = Number($("#vlsmBaseCidr").value);

    if (!IP.isValid(baseStr)) {
      errEl.textContent = "Enter a valid base network address, e.g. 192.168.0.0.";
      return;
    }
    if (!Number.isInteger(baseCidr) || baseCidr < 1 || baseCidr > 30) {
      errEl.textContent = "Base prefix must be between /1 and /30.";
      return;
    }

    // Collect and validate requirement rows.
    const reqs = [];
    for (const row of rowsEl.querySelectorAll(".vlsm-row")) {
      const name  = row.children[0].value.trim();
      const hosts = Number(row.children[1].value);
      if (!name && !row.children[1].value) continue; // ignore fully blank rows
      if (!Number.isInteger(hosts) || hosts < 1) {
        errEl.textContent = `"${name || "Unnamed network"}" needs a whole-number host count of at least 1.`;
        return;
      }
      reqs.push({ name: name || `Network ${reqs.length + 1}`, hosts });
    }
    if (reqs.length === 0) {
      errEl.textContent = "Add at least one network requirement.";
      return;
    }

    // --- VLSM algorithm ---
    // 1. Sort largest-first (this is the whole trick: big blocks first
    //    keeps every subsequent block naturally aligned).
    // 2. Walk a cursor through the address space, assigning each
    //    requirement the smallest subnet that fits.
    const sorted = [...reqs].sort((a, b) => b.hosts - a.hosts);
    const baseNet  = (IP.toInt(baseStr) & IP.maskFromCidr(baseCidr)) >>> 0;
    const baseEnd  = (baseNet + 2 ** (32 - baseCidr)) >>> 0; // exclusive upper bound
    let cursor = baseNet;
    const allocations = [];

    for (const req of sorted) {
      const cidr = IP.cidrForHosts(req.hosts);
      if (cidr === -1 || cidr < baseCidr) {
        errEl.textContent = `"${req.name}" (${fmt(req.hosts)} hosts) doesn't fit inside ${baseStr}/${baseCidr}.`;
        return;
      }
      const size = 2 ** (32 - cidr);
      // Cursor is always aligned because blocks are allocated big → small.
      if (cursor + size > baseEnd) {
        errEl.textContent = `Ran out of space: "${req.name}" doesn't fit. Try a larger base network (e.g. /${baseCidr - 1}).`;
        return;
      }
      const r = IP.subnet(IP.toDotted(cursor), cidr);
      allocations.push({ ...req, r });
      cursor = (cursor + size) >>> 0;
    }

    // --- Render plan ---
    const tbody = $("#vlsmTable tbody");
    tbody.innerHTML = allocations.map(({ name, hosts, r }) => `
      <tr>
        <td class="use-col">${esc(name)}</td>
        <td>${fmt(hosts)}</td>
        <td>${r.networkDotted}/${r.cidr}</td>
        <td>${r.maskDotted}</td>
        <td>${r.firstHostDotted} – ${r.lastHostDotted}</td>
        <td>${r.broadcastDotted}</td>
      </tr>`).join("");

    const used = cursor - baseNet;
    const capacity = 2 ** (32 - baseCidr);
    $("#vlsmSummary").textContent =
      `Allocated ${fmt(used)} of ${fmt(capacity)} addresses (${((used / capacity) * 100).toFixed(1)}%). ` +
      `Next free block starts at ${IP.toDotted(cursor >>> 0)}. ` +
      `Networks were sorted largest-first — the golden rule of VLSM.`;
    $("#vlsmResultCard").hidden = false;

    History.add("VLSM", `${baseStr}/${baseCidr} split into ${allocations.length} subnets`);
  });
}

/* ============================================================
   8. PRACTICE MODE
   ============================================================ */

/**
 * Question generators shared by Practice and Quiz.
 * Each returns { text, answers: [accepted strings], explain }.
 * All accepted answers are compared lowercase / trimmed.
 */
const QuestionBank = {
  randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },

  randomIp(cidrForContext) {
    // Generate a plausible private-range IP for exam-style questions.
    const bases = [
      () => `10.${this.randInt(0, 255)}.${this.randInt(0, 255)}.${this.randInt(1, 254)}`,
      () => `172.${this.randInt(16, 31)}.${this.randInt(0, 255)}.${this.randInt(1, 254)}`,
      () => `192.168.${this.randInt(0, 255)}.${this.randInt(1, 254)}`,
    ];
    return bases[this.randInt(0, bases.length - 1)]();
  },

  /** "Need N hosts → what CIDR?" */
  hostsToCidr() {
    const pool = [2, 6, 10, 14, 25, 30, 50, 60, 100, 120, 126, 200, 254, 300, 500, 1000, 2000, 4000];
    const hosts = pool[this.randInt(0, pool.length - 1)];
    const cidr  = IP.cidrForHosts(hosts);
    const mask  = IP.toDotted(IP.maskFromCidr(cidr));
    const total = 2 ** (32 - cidr);
    return {
      text: `You need a subnet with at least <strong>${fmt(hosts)}</strong> usable hosts. What is the correct CIDR prefix?`,
      answers: [`/${cidr}`, `${cidr}`, mask],
      explain: `${fmt(hosts)} hosts + 2 reserved needs ${fmt(total)} addresses (the nearest power of two). ` +
               `That's ${32 - cidr} host bits, so 32 − ${32 - cidr} = /${cidr} (mask ${mask}), giving ${fmt(total - 2)} usable hosts.`,
    };
  },

  /** "What mask is /N?" */
  cidrToMask() {
    const cidr = this.randInt(8, 30);
    const mask = IP.toDotted(IP.maskFromCidr(cidr));
    return {
      text: `Write the dotted-decimal subnet mask for <strong>/${cidr}</strong>.`,
      answers: [mask],
      explain: `/${cidr} = ${cidr} ones then ${32 - cidr} zeros: ${IP.toBinary(IP.maskFromCidr(cidr))} → ${mask}.`,
    };
  },

  /** "What CIDR is this mask?" */
  maskToCidr() {
    const cidr = this.randInt(8, 30);
    const mask = IP.toDotted(IP.maskFromCidr(cidr));
    return {
      text: `What CIDR prefix matches the subnet mask <strong>${mask}</strong>?`,
      answers: [`/${cidr}`, `${cidr}`],
      explain: `${mask} contains ${cidr} one-bits in binary, so it's written /${cidr}.`,
    };
  },

  /** "How many usable hosts in /N?" */
  usableHosts() {
    const cidr = this.randInt(20, 30);
    const usable = 2 ** (32 - cidr) - 2;
    return {
      text: `How many <strong>usable</strong> hosts does a <strong>/${cidr}</strong> subnet provide?`,
      answers: [`${usable}`, fmt(usable)],
      explain: `/${cidr} leaves ${32 - cidr} host bits → 2^${32 - cidr} = ${fmt(2 ** (32 - cidr))} addresses, minus network and broadcast = ${fmt(usable)}.`,
    };
  },

  /** "Network address of IP/CIDR?" */
  networkAddress() {
    const cidr = this.randInt(22, 29);
    const ip = this.randomIp();
    const r = IP.subnet(ip, cidr);
    const block = 256 - ((r.mask >>> (cidr > 24 ? 0 : 8)) & 255);
    return {
      text: `What is the <strong>network address</strong> of <strong>${ip}/${cidr}</strong>?`,
      answers: [r.networkDotted, `${r.networkDotted}/${cidr}`],
      explain: `Mask ${r.maskDotted}: AND it with ${ip} (block size ${block} in the interesting octet) → network ${r.networkDotted}. Broadcast is ${r.broadcastDotted}.`,
    };
  },

  /** "Broadcast address of IP/CIDR?" */
  broadcastAddress() {
    const cidr = this.randInt(22, 29);
    const ip = this.randomIp();
    const r = IP.subnet(ip, cidr);
    return {
      text: `What is the <strong>broadcast address</strong> of <strong>${ip}/${cidr}</strong>?`,
      answers: [r.broadcastDotted],
      explain: `Network is ${r.networkDotted}; set all ${32 - cidr} host bits to 1 → broadcast ${r.broadcastDotted}. Usable range: ${r.firstHostDotted} – ${r.lastHostDotted}.`,
    };
  },

  /** Random question from all generators. */
  random() {
    const gens = [
      this.hostsToCidr, this.cidrToMask, this.maskToCidr,
      this.usableHosts, this.networkAddress, this.broadcastAddress,
    ];
    return gens[this.randInt(0, gens.length - 1)].call(this);
  },

  /** Compare a user answer against accepted answers, forgivingly. */
  check(user, answers) {
    const norm = (s) => String(s).toLowerCase().replace(/[,\s]/g, "");
    const u = norm(user);
    return answers.some((a) => norm(a) === u);
  },
};

function initPractice() {
  let current = null;
  let score = { right: 0, total: 0 };

  const qEl  = $("#practiceQuestion");
  const form = $("#practiceForm");
  const fb   = $("#practiceFeedback");

  function newQuestion() {
    current = QuestionBank.random();
    qEl.innerHTML = current.text;
    form.hidden = false;
    fb.hidden = true;
    $("#practiceAnswer").value = "";
    $("#practiceAnswer").focus();
  }

  $("#practiceNew").addEventListener("click", newQuestion);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!current) return;
    const user = $("#practiceAnswer").value.trim();
    if (!user) return;

    const ok = QuestionBank.check(user, current.answers);
    score.total++;
    if (ok) score.right++;

    fb.hidden = false;
    fb.className = `practice-feedback ${ok ? "ok" : "bad"}`;
    fb.innerHTML = `
      <span class="verdict">${ok ? "✓ Correct!" : "✗ Not quite."}</span>
      ${ok ? "" : `<p class="why">Expected answer: <code>${esc(current.answers[0])}</code></p>`}
      <p class="why"><strong>Why:</strong> ${esc(current.explain)}</p>`;

    $("#practiceScore").textContent = `Session score: ${score.right} / ${score.total}`;
    current = null; // require a new question before answering again
  });
}

/* ============================================================
   9. QUIZ MODE + LEADERBOARD
   ============================================================ */

const QUIZ_LENGTH = 20;
const LB_KEY = "sm_leaderboard";

function initQuiz() {
  let questions = [];
  let index = 0;
  let correct = 0;
  let review = [];
  let startTime = 0;
  let timerId = null;

  const startCard  = $("#quizStart");
  const activeCard = $("#quizActive");
  const resultCard = $("#quizResults");

  function mmss(seconds) {
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function tick() {
    $("#quizTimer").textContent = mmss(Math.floor((Date.now() - startTime) / 1000));
  }

  function showQuestion() {
    const q = questions[index];
    $("#quizProgress").textContent = `Question ${index + 1} / ${QUIZ_LENGTH}`;
    $("#quizBar").style.width = `${(index / QUIZ_LENGTH) * 100}%`;
    $("#quizQuestion").innerHTML = q.text;
    $("#quizAnswer").value = "";
    $("#quizAnswer").focus();
  }

  function record(userAnswer) {
    const q = questions[index];
    const ok = userAnswer !== null && QuestionBank.check(userAnswer, q.answers);
    if (ok) correct++;
    review.push({ q, userAnswer, ok });
    index++;
    if (index < QUIZ_LENGTH) showQuestion();
    else finish();
  }

  function finish() {
    clearInterval(timerId);
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const pct = Math.round((correct / QUIZ_LENGTH) * 100);
    const wrong = QUIZ_LENGTH - correct;

    activeCard.hidden = true;
    resultCard.hidden = false;

    $("#quizSummary").innerHTML = `
      <div class="stat good"><span class="v">${correct}</span><span class="k">Correct</span></div>
      <div class="stat bad"><span class="v">${wrong}</span><span class="k">Incorrect</span></div>
      <div class="stat"><span class="v">${pct}%</span><span class="k">Score</span></div>
      <div class="stat"><span class="v">${mmss(seconds)}</span><span class="k">Time</span></div>`;

    $("#quizReviewList").innerHTML = review.map(({ q, userAnswer, ok }) => `
      <li>
        ${q.text}<br>
        <span class="${ok ? "r-ok" : "r-bad"}">${ok ? "✓" : "✗"}
          ${userAnswer === null ? "Skipped" : `Your answer: <code>${esc(userAnswer)}</code>`}</span>
        ${ok ? "" : ` — correct: <code>${esc(q.answers[0])}</code>`}<br>
        <em>${esc(q.explain)}</em>
      </li>`).join("");

    // Save to leaderboard
    const name = ($("#quizName").value.trim() || "Anonymous").slice(0, 20);
    const board = loadLeaderboard();
    board.push({ name, correct, pct, seconds, date: new Date().toISOString().slice(0, 10) });
    // Best score first; faster time breaks ties.
    board.sort((a, b) => b.correct - a.correct || a.seconds - b.seconds);
    saveLeaderboard(board.slice(0, 10));
    renderLeaderboard();
    toast(`Saved: ${correct}/${QUIZ_LENGTH} in ${mmss(seconds)}`);
  }

  $("#quizStartBtn").addEventListener("click", () => {
    questions = Array.from({ length: QUIZ_LENGTH }, () => QuestionBank.random());
    index = 0; correct = 0; review = [];
    startCard.hidden = true;
    resultCard.hidden = true;
    activeCard.hidden = false;
    startTime = Date.now();
    tick();
    timerId = setInterval(tick, 1000);
    showQuestion();
  });

  $("#quizForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const val = $("#quizAnswer").value.trim();
    if (!val) return;
    record(val);
  });

  $("#quizSkip").addEventListener("click", () => record(null));

  $("#quizRetry").addEventListener("click", () => {
    resultCard.hidden = true;
    startCard.hidden = false;
  });

  $("#clearLeaderboard").addEventListener("click", () => {
    saveLeaderboard([]);
    renderLeaderboard();
    toast("Leaderboard cleared");
  });

  renderLeaderboard();
}

function loadLeaderboard() {
  try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; }
  catch { return []; }
}
function saveLeaderboard(board) {
  try { localStorage.setItem(LB_KEY, JSON.stringify(board)); }
  catch { /* storage full or blocked — leaderboard just won't persist */ }
}
function renderLeaderboard() {
  const tbody = $("#leaderboardTable tbody");
  const board = loadLeaderboard();
  if (board.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="use-col">No scores yet — take the quiz!</td></tr>`;
    return;
  }
  tbody.innerHTML = board.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td class="use-col">${esc(r.name)}</td>
      <td>${r.correct}/${QUIZ_LENGTH}</td>
      <td>${r.pct}%</td>
      <td>${String(Math.floor(r.seconds / 60)).padStart(2, "0")}:${String(r.seconds % 60).padStart(2, "0")}</td>
      <td>${esc(r.date)}</td>
    </tr>`).join("");
}

/* ============================================================
   10. CHEAT SHEET & CIDR TABLE + SEARCH
   ============================================================ */

function initTables() {
  // --- Cheat sheet: /24 → /30 with typical uses ---
  const uses = {
    24: "Standard office LAN",
    25: "Half a /24 — two departments",
    26: "Small department (≈60 devices)",
    27: "Small office / branch",
    28: "Server cluster, DMZ segment",
    29: "Firewall segment, tiny site",
    30: "Router-to-router (WAN) link",
  };
  $("#cheatTable tbody").innerHTML = Array.from({ length: 7 }, (_, i) => {
    const cidr = 24 + i;
    const mask = IP.maskFromCidr(cidr);
    const total = 2 ** (32 - cidr);
    return `<tr>
      <td>/${cidr}</td>
      <td>${IP.toDotted(mask)}</td>
      <td>${IP.toDotted((~mask) >>> 0)}</td>
      <td>${fmt(total)}</td>
      <td>${fmt(total - 2)}</td>
      <td>${fmt(2 ** (cidr - 24))}</td>
      <td class="use-col">${uses[cidr]}</td>
    </tr>`;
  }).join("");

  // --- Full CIDR table /1 → /32 with instant search ---
  const rows = Array.from({ length: 32 }, (_, i) => {
    const cidr = i + 1;
    const mask = IP.maskFromCidr(cidr);
    const total = 2 ** (32 - cidr);
    const usable = cidr >= 31 ? (cidr === 31 ? 2 : 1) : total - 2;
    return {
      cidr: `/${cidr}`,
      mask: IP.toDotted(mask),
      wildcard: IP.toDotted((~mask) >>> 0),
      total: fmt(total),
      usable: fmt(usable),
      // Pre-computed lowercase haystack for fast filtering.
      hay: `/${cidr} ${cidr} ${IP.toDotted(mask)} ${IP.toDotted((~mask) >>> 0)} ${total} ${usable} ${fmt(total)} ${fmt(usable)}`.toLowerCase(),
    };
  });

  const tbody = $("#cidrTable tbody");
  const countEl = $("#cidrSearchCount");

  function render(filter = "") {
    const q = filter.trim().toLowerCase();
    const visible = q ? rows.filter((r) => r.hay.includes(q)) : rows;

    const mark = (text) => {
      if (!q) return esc(text);
      const idx = text.toLowerCase().indexOf(q);
      if (idx === -1) return esc(text);
      return esc(text.slice(0, idx)) + "<mark>" + esc(text.slice(idx, idx + q.length)) + "</mark>" + esc(text.slice(idx + q.length));
    };

    tbody.innerHTML = visible.length
      ? visible.map((r) => `<tr>
          <td>${mark(r.cidr)}</td><td>${mark(r.mask)}</td><td>${mark(r.wildcard)}</td>
          <td>${mark(r.total)}</td><td>${mark(r.usable)}</td></tr>`).join("")
      : `<tr><td colspan="5" class="use-col">No prefixes match "${esc(filter)}". Try a mask octet like 240, a prefix like /19, or a host count.</td></tr>`;

    countEl.textContent = q ? `${visible.length} of 32 prefixes shown` : "";
  }

  $("#cidrSearch").addEventListener("input", (e) => render(e.target.value));
  render();
}

/* ============================================================
   11. HISTORY (localStorage)
   ============================================================ */

const History = {
  KEY: "sm_history",
  MAX: 50,

  load() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || []; }
    catch { return []; }
  },

  save(list) {
    try { localStorage.setItem(this.KEY, JSON.stringify(list)); }
    catch { /* private mode / quota — history simply won't persist */ }
  },

  add(kind, summary) {
    const list = this.load();
    list.unshift({ kind, summary, at: Date.now() });
    this.save(list.slice(0, this.MAX));
    this.render();
  },

  clear() {
    this.save([]);
    this.render();
  },

  render() {
    const ul = $("#historyList");
    const list = this.load();
    if (list.length === 0) {
      ul.innerHTML = `<li class="note">No calculations yet. Results from the Calculator, Host Calc and VLSM tools appear here.</li>`;
      return;
    }
    ul.innerHTML = list.map((h) => `
      <li>
        <span class="h-kind">${esc(h.kind)}</span>
        <span class="h-main">${esc(h.summary)}</span>
        <span class="h-time">${new Date(h.at).toLocaleString()}</span>
      </li>`).join("");
  },
};

/* ============================================================
   12. PDF EXPORT
   Uses the browser's print-to-PDF: zero dependencies, works
   offline, and every OS ships a "Save as PDF" print target.
   ============================================================ */

function exportPdf() {
  if (!lastCalcResult) { toast("Run a calculation first"); return; }
  const r = lastCalcResult;

  const rows = [
    ["Input", `${r.ipDotted}/${r.cidr}`],
    ["Network address", `${r.networkDotted}/${r.cidr}`],
    ["Broadcast address", r.broadcastDotted],
    ["First usable host", r.firstHostDotted],
    ["Last usable host", r.lastHostDotted],
    ["Subnet mask", r.maskDotted],
    ["Wildcard mask", r.wildcardDotted],
    ["Binary mask", r.maskBinary],
    ["Total addresses", fmt(r.total)],
    ["Usable hosts", fmt(r.usable)],
    ["Address class", r.className],
  ];

  $("#printArea").innerHTML = `
    <h1>SubnetMaster — Subnet Report</h1>
    <p class="p-sub">Generated ${new Date().toLocaleString()} · subnet of ${esc(r.ipDotted)}/${r.cidr}</p>
    <table>
      ${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td class="p-mono">${esc(v)}</td></tr>`).join("")}
    </table>
    <ol class="p-steps">
      ${stepsForSubnet(r).map((s) => `<li><strong>${esc(s.title)}</strong> ${esc(s.body)}${s.math ? ` <em>${esc(s.math)}</em>` : ""}</li>`).join("")}
    </ol>`;

  window.print();
}

/* ============================================================
   13. INIT
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initContrast();
  initCalculator();
  initHostCalc();
  initVisualizer();
  initVlsm();
  initPractice();
  initQuiz();
  initTables();
  History.render();

  $("#clearHistory").addEventListener("click", () => {
    History.clear();
    toast("History cleared");
  });
});
