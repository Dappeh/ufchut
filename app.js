"use strict";
(() => {
  // The site's top folder, worked out from this script's address, so links and files still work on
  // the upcoming fights' own pages (vs/<red>-<blue>/) and after the address bar changes to one.
  const ROOT = new URL(".", document.currentScript?.src || location.href).href;
  const DATA = ROOT + "data/";
  const D = window.UFCDesign; // design-core.js: what the site looks like and how it's laid out
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const other = (c) => (c === "a" ? "b" : "a");
  const MAIN = $("#page");
  const VS = /\/vs\/(\d+)-(\d+)\/?$/; // an upcoming fight's own page
  const TITLE0 = document.title;
  // Inside the design editor (edit.html), which shows the site in a frame and sends it the design.
  const PREVIEW = new URLSearchParams(location.search).get("preview") === "1" && window.parent !== window;
  const ED = { editing: false, sample: false, sampled: false, sel: null, look: "" };
  const post = (m) => window.parent.postMessage(m, location.origin);

  let DESIGN = null; // the design shown (design-core.js); null until known
  let T = D.TEXT_DEFAULTS; // its wording
  let PAGE = null; // the page shown
  let DRAFT = ""; // a design draft's code when the link carries one (#d=...)
  const BLOCK = new Map(); // the shown page's sections by id
  const DATA_TYPES = new Set(["heads", "share", "tape", "stats", "strikes", "last3", "form", "met", "common", "history"]);

  let INDEX = [];
  let UPDATED = null; // when the data was last refreshed
  let UPCOMING = [];
  let LOADED = false;
  const byId = new Map();
  const profiles = new Map();
  const sel = { a: null, b: null };
  const pickers = {};
  let shown = { a: null, b: null };
  let status = "boot"; // what the comparison area says when it shows no fighter: boot | bootfail | hint | loading | error | ok
  const hist = { corner: "a", ufcOnly: false, all: false, touched: false };
  const readable = new Set(); // "<red>-<blue>" pairs that have a page of their own (upcoming fights)

  // a wording from the design with its {placeholders} filled in, as safe HTML
  const tx = (k, vars = {}) => esc(T[k] ?? "").replace(/\{(\w+)\}/g, (m, v) => (v in vars ? esc(vars[v]) : m));
  // scrolls this page only (scrollIntoView would also scroll the design editor around its preview)
  function scrollToEl(el, where = "start") {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const top = where === "center" ? r.top + scrollY - (innerHeight - r.height) / 2 : r.top + scrollY;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }
  const media = (src) => (src.startsWith("data:") ? src : ROOT + src);

  // ------------------------------------------------------------------ data
  async function getJSON(path) {
    const r = await fetch(DATA + path, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  }
  function profile(id) {
    if (!profiles.has(id)) {
      profiles.set(id, getJSON(`f/${id}.json`).catch((e) => { profiles.delete(id); throw e; }));
    }
    return profiles.get(id);
  }

  // ------------------------------------------------------------ formatting
  const CM = 2.54;
  const dash = '<span class="muted">—</span>';
  const pct = (x) => (x == null ? null : `${Math.round(x * 100)}%`);
  const num = (x, d = 2) => (x == null ? null : x.toFixed(d));
  const inches = (i) => (i % 1 ? i.toFixed(1) : String(i));
  const fmtHeight = (i) => (i ? `${Math.floor(i / 12)}' ${inches(i % 12)}" <span class="small">${Math.round(i * CM)} cm</span>` : null);
  const fmtIn = (i) => (i ? `${inches(i)}" <span class="small">${Math.round(i * CM)} cm</span>` : null);
  const toDate = (s) => new Date(s.length === 10 ? `${s}T12:00:00Z` : s);
  const fmtDate = (s) => (s ? toDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "");
  const fmtWhen = (s) => toDate(s).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const mmss = (m) => (m == null ? null : secs(m * 60));
  const secs = (s) => { if (s == null) return null; s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

  function age(dob) {
    if (!dob) return null;
    const [y, m, d] = dob.split("-").map(Number);
    const now = new Date();
    let a = now.getFullYear() - y;
    if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--;
    return a;
  }
  function ago(iso) {
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
    const n = s < 86400 ? Math.round(s / 3600) : Math.round(s / 86400);
    return `${n} ${s < 86400 ? "hour" : "day"}${n === 1 ? "" : "s"} ago`;
  }
  function since(iso) {
    const days = (Date.now() - toDate(iso)) / 864e5;
    if (days < 60) return `${Math.round(days)} days ago`;
    if (days < 730) return `${Math.round(days / 30.4)} months ago`;
    return `${(days / 365.25).toFixed(1)} years ago`;
  }
  const rec = (r) => (r ? `${r.W}-${r.L}-${r.D}${r.NC ? ` <span class="small">+ ${r.NC} no contest${r.NC > 1 ? "s" : ""}</span>` : ""}` : null);
  const winShare = (r) => (r && r.W + r.L + r.D ? r.W / (r.W + r.L + r.D) : null);
  function oppRec(o) {
    if (!o) return null;
    const r = o.record;
    const notes = [`${o.counted < o.opponents ? `${o.counted} of ${o.opponents}` : o.counted} opponent${o.opponents === 1 ? "" : "s"}`];
    if (winShare(r) != null) notes.unshift(`${pct(winShare(r))} wins`);
    return `${r.W}-${r.L}-${r.D}<span class="small">${notes.join(" · ")}</span>`;
  }
  const initials = (n) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  function how(m) {
    m = (m || "").toLowerCase();
    if (/no contest|overturn/.test(m)) return "nc";
    if (/\bdq\b|disqual/.test(m)) return "oth";
    if (/sub/.test(m)) return "sub";
    if (/dec/.test(m)) return "dec";
    if (/ko|knock|doctor|corner|retire|stoppage|punch|strike|elbow|kick|knee/.test(m)) return "ko";
    return "oth";
  }
  const HOW = { ko: "KO/TKO", sub: "Submission", dec: "Decision", oth: "Other" };

  // Text written in the design editor: **bold**, *italic*, [words](where it goes), "- " lists.
  const marks = (h) => h.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, "$1<i>$2</i>");
  function inline(s) {
    s = String(s ?? "");
    let out = "";
    let last = 0;
    for (const m of s.matchAll(/\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/g)) {
      out += marks(esc(s.slice(last, m.index)));
      const to = D.target(m[2]);
      out += to ? `<a ${linkAttrs(to)}>${marks(esc(m[1]))}</a>` : marks(esc(m[0]));
      last = m.index + m[0].length;
    }
    return out + marks(esc(s.slice(last)));
  }
  function rich(s) {
    return String(s ?? "").split(/\n\s*\n/).filter((x) => x.trim()).map((para) => {
      const lines = para.split("\n");
      if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-•*]\s+/, ""))}</li>`).join("")}</ul>`;
      return `<p>${lines.map(inline).join("<br>")}</p>`;
    }).join("");
  }

  // ---------------------------------------------------------------- pages
  const pageById = (id) => (id && DESIGN.pages.find((p) => p.id === id)) || null;
  const hasData = (pg) => pg.blocks.some((b) => !b.hidden && DATA_TYPES.has(b.type));
  // The page a comparison shows on: the one the design names, else this one if it has the comparison's
  // sections, else the first page that has them.
  function resultsPage(kind = "compare", from = PAGE) {
    const named = pageById(DESIGN.links[kind]) || (kind === "upcoming" && pageById(DESIGN.links.compare));
    if (named) return named;
    if (from && hasData(from)) return from;
    return DESIGN.pages.find(hasData) || from || DESIGN.pages[0];
  }
  const draftHash = () => (DRAFT ? `#d=${DRAFT}` : "");
  const pageHref = (pg) => ROOT + (pg === DESIGN.pages[0] ? "" : `?p=${pg.id}`) + draftHash();
  function pageURL() {
    const q = new URLSearchParams();
    if (PREVIEW) q.set("preview", "1");
    if (PAGE !== DESIGN.pages[0]) q.set("p", PAGE.id);
    if (sel.a) q.set("a", sel.a.i);
    if (sel.b) q.set("b", sel.b.i);
    // an upcoming fight has its own page, which AI tools can read too, so its link is the one to share
    const pair = sel.a && sel.b ? `${sel.a.i}-${sel.b.i}` : null;
    if (!PREVIEW && !DRAFT && readable.has(pair) && PAGE === resultsPage("compare", null)) return ROOT + `vs/${pair}/`;
    const s = q.toString();
    return ROOT + (s ? `?${s}` : "") + draftHash();
  }
  function pageFromURL() {
    const id = new URLSearchParams(location.search).get("p");
    return pageById(id) || (VS.test(location.pathname) ? resultsPage("compare", null) : DESIGN.pages[0]);
  }
  function idsFromURL() {
    const q = new URLSearchParams(location.search);
    const m = location.pathname.match(VS);
    return { a: q.get("a") || m?.[1], b: q.get("b") || m?.[2] };
  }
  // where a link or button goes: a page of the site, a section on this page, a web address or an action
  function linkAttrs(to, newTab) {
    if (!to) return "";
    if (to.startsWith("page:")) {
      const pg = pageById(to.slice(5)) || DESIGN.pages[0];
      return `href="${esc(pageHref(pg))}" data-to="page:${esc(pg.id)}"`;
    }
    if (to.startsWith("#")) return `href="${esc(to)}" data-to="${esc(to)}"`;
    if (to.startsWith("action:")) return `href="#" role="button" data-to="${esc(to)}"`;
    return `href="${esc(to)}"${newTab ? ' target="_blank" rel="noopener"' : ""}`;
  }

  function goPage(pg, { scroll = true } = {}) {
    PAGE = pg;
    closeMenus();
    history[PREVIEW ? "replaceState" : "pushState"](null, "", pageURL());
    drawPage();
    if (scroll) window.scrollTo(0, 0);
    if (PREVIEW) post({ t: "page", id: pg.id });
  }

  // --------------------------------------------------------------- design
  const styleEl = (id) => $(`#${id}`) || document.head.appendChild(Object.assign(document.createElement("style"), { id }));
  function setDesign(d, pageId) {
    const before = PAGE?.id;
    DESIGN = d;
    T = d.texts;
    styleEl("design-css").textContent = D.css(d, ROOT, ED.look);
    $('meta[name="theme-color"]')?.setAttribute("content", d.colors.light.accent);
    PAGE = pageById(pageId) || pageFromURL();
    drawChrome();
    drawPage();
    if (before && before !== PAGE.id) window.scrollTo(0, 0);
  }

  // top bar, menu and bottom line
  function drawChrome() {
    const h = DESIGN.header;
    const brand = $(".brand");
    brand.innerHTML = `${h.showLogo ? `<img src="${esc(h.logo ? media(h.logo) : `${ROOT}icons/icon.svg`)}" alt="" width="32" height="32">` : ""}${h.showName ? `<span>${tx("brand")}</span>` : ""}`;
    brand.setAttribute("aria-label", `${T.brand} home`);
    const home = pageById(DESIGN.links.logo) || DESIGN.pages[0];
    brand.href = pageHref(home);
    brand.dataset.to = `page:${home.id}`;
    const up = $("#updated");
    up.hidden = !h.showUpdated;
    up.textContent = UPDATED ? T.updated.replace("{ago}", ago(UPDATED)) : "";
    $(".top").hidden = !h.showLogo && !h.showName && !h.showUpdated && h.menu === "none";

    for (const el of $$(".js-nav")) el.remove();
    document.body.classList.remove("has-bottom");
    const items = [...DESIGN.pages.filter((p) => p.menu).map((p) => ({ label: p.name, to: `page:${p.id}` })), ...DESIGN.links.extra];
    if (h.menu !== "none" && items.length > 1) {
      const links = items.map((it) => `<a ${linkAttrs(it.to, it.newTab)}>${esc(it.label)}</a>`).join("");
      const add = (html, where, before) => {
        const t = document.createElement("template");
        t.innerHTML = html.trim();
        where.insertBefore(t.content.firstChild, before || null);
      };
      const inner = $(".top__inner");
      const align = `nav--${h.menuAlign}`;
      if (h.menu === "links" || h.menu === "bottom") {
        add(`<nav class="nav ${align} js-nav${h.menu === "bottom" ? " wide-only" : ""}" aria-label="Menu">${links}</nav>`, inner, up);
      }
      if (h.menu === "tabs") add(`<div class="navrow js-nav"><div class="wrap"><nav class="nav ${align}" aria-label="Menu">${links}</nav></div></div>`, $(".top"));
      if (h.menu === "bottom") {
        add(`<nav class="navbottom js-nav" aria-label="Menu">${links}</nav>`, document.body);
        document.body.classList.add("has-bottom");
      }
      if (h.menu === "button") {
        add(`<div class="menuwrap ${align} js-nav"><button class="menubtn" type="button" aria-expanded="false" data-act="menu">☰ ${tx("menu")}</button>
          <nav class="menupanel" aria-label="Menu" hidden>${links}</nav></div>`, inner, up);
      }
    }
    const foot = $(".foot");
    foot.hidden = !DESIGN.footer.show;
    foot.innerHTML = `<p>${inline(T.footer)}</p>`;
  }
  function markNav() {
    for (const a of $$(".js-nav a[data-to]")) a.classList.toggle("on", a.dataset.to === `page:${PAGE.id}`);
    const tab = PAGE.tab || (PAGE === DESIGN.pages[0] ? T.tabTitle : `${PAGE.name} · ${T.tabTitle}`);
    document.title = VS.test(location.pathname) && !PAGE.tab && PAGE === resultsPage("compare", null) ? TITLE0 : tab;
  }
  function closeMenus() {
    for (const p of $$(".menupanel")) {
      p.hidden = true;
      p.previousElementSibling?.setAttribute("aria-expanded", "false");
    }
  }

  // the shown page, made of the design's sections, in columns where the page has them
  function drawPage() {
    if (!DESIGN || !PAGE) return;
    BLOCK.clear();
    for (const b of PAGE.blocks) BLOCK.set(b.id, b);
    if (PAGE.bg) document.body.style.setProperty("--bg", PAGE.bg);
    else document.body.style.removeProperty("--bg");
    const hb = PAGE.blocks.find((b) => b.type === "history");
    if (hb && !hist.touched) hist.ufcOnly = hb.p.ufcOnly;
    styleEl("page-css").textContent = blockCSS(PAGE);
    MAIN.innerHTML = layoutHTML(PAGE);
    pickers.a = pickers.b = null;
    if ($("#in-a", MAIN)) {
      setupPicker("a");
      setupPicker("b");
      for (const c of ["a", "b"]) if (sel[c]) setPick(c, sel[c]);
    }
    drawData();
    appear();
    markNav();
    if (PREVIEW) markSelected();
  }

  function layoutHTML(pg) {
    const list = pg.blocks.filter((b) => !b.hidden || ED.editing);
    if (!list.length) return ph("This page is empty. Add sections to it in the editor.");
    let html = "";
    let cols = null;
    const flush = () => {
      if (!cols) return;
      const tpl = pg.cols === 2 ? `minmax(0,${pg.split}fr) minmax(0,${100 - pg.split}fr)` : `repeat(${pg.cols},minmax(0,1fr))`;
      html += `<div class="region" style="--cols:${tpl}">${cols.map((c) => `<div class="col">${c.join("")}</div>`).join("")}</div>`;
      cols = null;
    };
    for (const b of list) {
      const col = pg.cols > 1 ? Math.min(b.col, pg.cols) : 0;
      if (!col) {
        flush();
        html += blockHTML(b, true);
      } else {
        cols ||= Array.from({ length: pg.cols }, () => []);
        cols[col - 1].push(blockHTML(b, false));
      }
    }
    flush();
    return html;
  }

  function blockHTML(b, full) {
    const s = b.s;
    const cls = ["blk", `blk--${b.type}`];
    if (s.align) cls.push(`al-${s.align}`);
    if (s.width && (full || s.width !== "edge")) cls.push(`w-${s.width}`);
    if (s.on !== "all") cls.push(`on-${s.on}`);
    const ap = s.appear || DESIGN.effects.appear;
    if (ap !== "none" && !ED.editing) cls.push("ap", `ap--${ap}`);
    if (b.hidden) cls.push("is-hidden");
    const data = DATA_TYPES.has(b.type);
    const label = PREVIEW ? ` data-label="${esc(b.title || D.BLOCKS[b.type][0])}${b.hidden ? " (hidden)" : ""}"` : "";
    return `<div class="${cls.join(" ")}" data-bid="${b.id}"${data ? " data-data" : ""}${s.anchor ? ` data-anchor="${s.anchor}"` : ""}${label}>${data ? "" : siteHTML(b)}</div>`;
  }

  // A section's own colours, borders and spacing (all checked by design-core.js: colours are #rrggbb,
  // numbers are numbers and pictures are pictures).
  function blockCSS(pg) {
    let css = "";
    for (const b of pg.blocks) {
      const s = b.s;
      const k = `.blk[data-bid="${b.id}"]`;
      const v = [];
      if (s.text) v.push(`color:${s.text}`, `--text:${s.text}`, `--muted:color-mix(in srgb, ${s.text} 72%, transparent)`);
      if (s.space != null) v.push(`--gap:${s.space}px`);
      if (s.pad != null) v.push(`--pad:${s.pad}px`);
      if (s.radius != null) v.push(`--radius:${s.radius}px`);
      if (s.shadow) v.push(`--shadow:${s.shadow === "none" ? "none" : `var(--shadow-${s.shadow})`}`);
      let bg = s.bg;
      if (s.image) {
        const dim = s.dim / 100;
        bg = `${dim ? `linear-gradient(rgba(0,0,0,${dim}),rgba(0,0,0,${dim})),` : ""}url("${media(s.image)}") center/cover no-repeat${s.bg ? ` ${s.bg}` : ""}`;
      }
      let border = "";
      if (s.border === "none") border = "none";
      else if (s.border || s.borderColor) border = `${s.border === "thick" ? "3px" : "max(1px, var(--border-w))"} solid ${s.borderColor || "var(--border)"}`;
      if (bg) v.push(`--cbg:${bg}`);
      if (border) v.push(`--cborder:${border}`);
      if (v.length) css += `${k}{${v.join(";")}}`;
      if (bg || border) {
        css += `${k} .own.box:not(.card),${k} .share{${bg ? `background:${bg};` : ""}${border ? `border:${border};` : ""}padding:var(--pad);border-radius:var(--radius)}`;
      }
      if (s.title) css += `${k} h2,${k} summary{color:${s.title}}`;
    }
    return css;
  }

  const ph = (text) => (ED.editing ? `<div class="ph">${esc(text)}</div>` : "");
  const cardCls = (b) => `card box${b.s.box === "plain" ? " box--plain" : ""}`;
  const heading = (b, sub = "") => (b.showTitle ? `<h2>${esc(b.title || D.DEFAULT_TITLES[b.type])}${sub}</h2>` : "");
  const LOOKS = { main: "btn--primary", plain: "", outline: "btn--outline", red: "btn--red", blue: "btn--blue" };

  // sections that don't depend on the chosen fighters
  function siteHTML(b) {
    const p = b.p;
    const box = `own box${b.s.box === "card" ? " card" : ""}`;
    switch (b.type) {
      case "search": return searchHTML(b);
      case "upcoming": return upcomingHTML(b);
      case "helpStats": case "helpHome":
        return `<section class="help box"><details${p.open ? " open" : ""}><summary>${esc(b.title || D.DEFAULT_TITLES[b.type])}</summary>
          ${b.type === "helpStats" ? HELP_STATS : HELP_HOME}</details></section>`;
      case "heading": return `<div class="${box}"><h2 class="hd hd--${p.size}">${inline(p.text)}</h2></div>`;
      case "text": return `<div class="${box} rich rich--${p.size}">${rich(p.text)}</div>`;
      case "image": {
        if (!p.src) return ph("Picture: choose one in the editor");
        const img = `<img src="${esc(media(p.src))}" alt="${esc(p.alt)}" loading="lazy"${p.fit === "cover" ? ` style="height:${p.height}px"` : ""}>`;
        return `<figure class="${box} pic${p.fit === "cover" ? " pic--cover" : ""}" style="width:${p.width}%">${p.to ? `<a ${linkAttrs(p.to, p.newTab)}>${img}</a>` : img}${p.caption ? `<figcaption>${inline(p.caption)}</figcaption>` : ""}</figure>`;
      }
      case "gallery":
        if (!p.items.length) return ph("Picture gallery: add pictures in the editor");
        return `<div class="${box} gal${p.perRow === 1 ? " gal--1" : ""}" style="grid-template-columns:repeat(${p.perRow},minmax(0,1fr))">${p.items.map((it) => {
          const img = `<img src="${esc(media(it.src))}" alt="${esc(it.caption)}" loading="lazy" style="height:${p.height}px">`;
          return `<figure>${it.to ? `<a ${linkAttrs(it.to)}>${img}</a>` : img}${it.caption ? `<figcaption>${inline(it.caption)}</figcaption>` : ""}</figure>`;
        }).join("")}</div>`;
      case "buttons":
        if (!p.items.length) return ph("Buttons: add some in the editor");
        return `<div class="${box} btns btns--${p.size}${p.full ? " btns--full" : ""}">${p.items.map((it) => `<a class="btn ${LOOKS[it.look]}" ${linkAttrs(it.to, it.newTab)}>${esc(it.label)}</a>`).join("")}</div>`;
      case "banner": {
        const dim = p.dim / 100;
        const base = b.s.bg || "var(--accent)";
        const bg = p.image ? `linear-gradient(rgba(0,0,0,${dim}),rgba(0,0,0,${dim})),url("${media(p.image)}") center/cover no-repeat ${base}`
          : p.bg2 ? `linear-gradient(135deg,${base},${p.bg2})` : base;
        return `<div class="${box} banner" style="min-height:${p.height}px;color:${p.textColor};background:${esc(bg)}"><div class="banner__in">
          ${p.title ? `<h2>${inline(p.title)}</h2>` : ""}${p.sub ? `<p>${inline(p.sub)}</p>` : ""}
          ${p.btn ? `<a class="btn btn--primary" ${linkAttrs(p.to)}>${esc(p.btn)}</a>` : ""}</div></div>`;
      }
      case "video": {
        const src = D.videoSrc(p.url);
        if (!src) return ph("Video: paste a YouTube or Vimeo link in the editor");
        const [w, h] = p.ratio.split(":");
        return `<div class="${box} video" style="aspect-ratio:${w}/${h}${w < h ? ";max-width:420px;margin-left:auto;margin-right:auto" : ""}">
          <iframe src="${esc(src)}" title="Video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
      }
      case "divider": {
        const look = p.look === "line" ? "solid" : p.look;
        return `<hr class="${box} dv" style="border-top:${look === "double" ? Math.max(3, p.thick) : p.thick}px ${look} ${p.color || "var(--border)"}">`;
      }
      case "spacer": return `<div class="spacer" style="height:${p.h}px"></div>`;
      default: return "";
    }
  }

  const HELP_STATS = `<dl class="gloss">
        <dt>UFC opponent combined record</dt><dd>The UFC records of everyone they've fought in the UFC, added together (someone they fought twice counts once). A higher win percentage means tougher opposition.</dd>
        <dt>Total pro MMA opponent combined record</dt><dd>The same for every opponent in their whole pro career, including smaller promotions, using each opponent's full pro MMA record. A few opponents from small shows have no record anywhere; the page says how many were counted.</dd>
        <dt>Sig. strikes landed / min</dt><dd>Significant strikes (the real, scoring ones) landed per minute of fighting.</dd>
        <dt>Striking accuracy</dt><dd>Percentage of significant strikes thrown that landed.</dd>
        <dt>Sig. strikes absorbed / min</dt><dd>Significant strikes taken from the opponent per minute. <b>Lower is better.</b></dd>
        <dt>Striking defence</dt><dd>Percentage of the opponent's significant strikes that missed.</dd>
        <dt>Takedown avg</dt><dd>Takedowns landed per 15 minutes (a 3-round fight). Not a percentage.</dd>
        <dt>Takedown accuracy</dt><dd>Percentage of takedown attempts that worked.</dd>
        <dt>Takedown defence</dt><dd>Percentage of the opponent's takedown attempts that were stopped.</dd>
        <dt>Submission avg</dt><dd>Submission attempts per 15 minutes. Not a percentage.</dd>
        <dt>Knockdown avg</dt><dd>Times they knocked the opponent down, per 15 minutes.</dd>
        <dt>Control time</dt><dd>How long they held the opponent in a dominant position (mostly on the ground or against the fence), per 15 minutes of fighting.</dd>
      </dl>
      <p class="note">Career numbers on this site are worked out from the fighter's UFC fights. Detailed strike and takedown stats are only recorded for UFC fights, so fights in other organisations show the result only.</p>
      <p class="note">Each fighter's country is checked against where they were born, their nationality and where they're based. When those agree with each other but not with the country listed for them, the country is corrected; when nothing settles it, the listed country is kept and marked "not confirmed" (many fighters represent a country other than the one they were born in).</p>`;
  const HELP_HOME = `<p><b>iPhone / iPad:</b> open this page in Safari, tap the Share button (square with an arrow), then <b>Add to Home Screen</b>.</p>
      <p><b>Android:</b> open it in Chrome, tap the ⋮ menu, then <b>Add to Home screen</b>.</p>`;

  // ---------------------------------------------------------------- search
  function prepIndex() {
    for (const r of INDEX) {
      r._n = norm(r.n);
      r._k = norm(r.k);
      r._t = `${r._n} ${r._k}`.split(" ").filter(Boolean);
      r._c = r._n.replace(/ /g, "");
      r._ini = r._n.split(" ").map((w) => w[0]).join("");
      byId.set(r.i, r);
    }
  }
  function search(q, exclude) {
    const qn = norm(q);
    if (!qn) return [];
    const qt = qn.split(" ");
    const qc = qn.replace(/ /g, "");
    const now = Date.now();
    const out = [];
    for (const r of INDEX) {
      if (r.i === exclude) continue;
      let ok = qt.every((t) => r._t.some((w) => w.startsWith(t)));
      if (!ok && qc.length >= 3) ok = r._c.includes(qc);
      const ini = !ok && qt.length === 1 && qc.length >= 2 && qc.length <= 4 && r._ini === qc; // "gsp"
      if (!ok && !ini) continue;
      const words = r._n.split(" ");
      let score = 0;
      if (r._n === qn) score += 1000;
      if (r._k === qn) score += 150;
      if (r._n.startsWith(qn)) score += 250;
      if (words[words.length - 1] === qt[qt.length - 1]) score += 200; // surname match
      if (ini) score -= 100;
      score += Math.min(r.u || 0, 25) * 3;
      const yrs = r.l ? (now - Date.parse(r.l)) / 3.156e10 : 30;
      score += Math.max(0, 80 - yrs * 8);
      out.push([score, r]);
    }
    out.sort((x, y) => y[0] - x[0]);
    return out.slice(0, 8).map((x) => x[1]);
  }

  function searchHTML(b) {
    const p = b.p;
    const pick = (c) => {
      const corner = T[c === "a" ? "red" : "blue"];
      return `<div class="pick pick--${c}">
      ${p.labels ? `<label for="in-${c}" class="corner corner--${c}">${esc(corner)}</label>` : ""}
      <div class="combo">
        <input id="in-${c}" type="search" autocomplete="off" autocapitalize="words" spellcheck="false"
               placeholder="${esc(T.placeholder)}" role="combobox" aria-expanded="false" aria-controls="list-${c}" aria-autocomplete="list"${p.labels ? "" : ` aria-label="${esc(corner)}"`}>
        <button class="clear" type="button" data-clear="${c}" aria-label="Clear ${esc(corner.toLowerCase())}" hidden>×</button>
        <ul class="suggest" id="list-${c}" role="listbox" hidden></ul>
      </div>
    </div>`;
    };
    return `<section class="search box${b.s.box === "plain" ? " box--plain" : ""}" aria-label="Choose two fighters">
    ${pick("a")}
    <div class="vs" aria-hidden="true">${tx("vs")}</div>
    ${pick("b")}
    <div class="actions">
      <button id="go" class="btn btn--primary" type="button" data-act="compare">${tx("compare")}</button>
      ${p.swap ? `<button id="swap" class="btn" type="button" title="Swap corners" data-act="swap">${tx("swap")}</button>` : ""}
    </div>
  </section>`;
  }

  function setupPicker(c) {
    const input = $(`#in-${c}`);
    const list = $(`#list-${c}`);
    const clear = $(`[data-clear="${c}"]`);
    const wrap = input.closest(".pick");
    let items = [];
    let active = -1;
    const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); active = -1; };
    const draw = () => {
      if (!input.value.trim()) return close();
      items = search(input.value, sel[other(c)]?.i);
      list.innerHTML = items.length
        ? items.map((r, i) => `<li role="option" id="opt-${c}-${i}" data-i="${i}" aria-selected="${i === active}">
            <div class="s-name">${esc(r.n)}${r.k ? ` <span class="s-nick">“${esc(r.k)}”</span>` : ""}</div>
            <div class="s-meta">${[r.r, r.w, r.c].filter(Boolean).map(esc).join(" · ")}</div></li>`).join("")
        : `<li class="s-empty">No fighter found. Check the spelling, or try just the last name.</li>`;
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      if (active >= 0) input.setAttribute("aria-activedescendant", `opt-${c}-${active}`);
      else input.removeAttribute("aria-activedescendant");
    };
    input.addEventListener("input", () => {
      if (sel[c]) { sel[c] = null; wrap.classList.remove("is-set"); }
      clear.hidden = !input.value;
      active = -1;
      draw();
    });
    input.addEventListener("keydown", (e) => {
      if (list.hidden) { if (e.key === "Enter") go(); return; }
      if (e.key === "ArrowDown") { active = Math.min(active + 1, items.length - 1); draw(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { active = Math.max(active - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === "Enter") { const r = items[Math.max(active, 0)]; if (r) choose(c, r); e.preventDefault(); }
      else if (e.key === "Escape") close();
    });
    list.addEventListener("mousedown", (e) => e.preventDefault());
    list.addEventListener("click", (e) => { const li = e.target.closest("li[data-i]"); if (li) choose(c, items[+li.dataset.i]); });
    input.addEventListener("blur", () => setTimeout(close, 120));
    input.addEventListener("focus", () => { if (input.value && !sel[c]) draw(); });
    clear.addEventListener("click", () => { setPick(c, null); compare(); input.focus(); });
    pickers[c] = { input, clear, wrap, close };
  }

  function setPick(c, row) {
    sel[c] = row;
    const p = pickers[c];
    if (!p) return;
    p.input.value = row ? row.n : "";
    p.wrap.classList.toggle("is-set", !!row);
    p.clear.hidden = !row;
    p.close();
  }
  function choose(c, row) {
    setPick(c, row);
    pickers[c]?.input.blur();
    if (sel.a && sel.b) showResults();
    else compare();
  }
  function go() {
    if (!sel.a && !sel.b) { pickers.a?.input.focus(); return; }
    showResults();
  }
  function swap() {
    const a = sel.a;
    setPick("a", sel.b);
    setPick("b", a);
    if (hist.corner) hist.corner = other(hist.corner);
    compare();
  }
  // after Compare, a second fighter or a tap on an upcoming fight: the comparison, on its page
  function showResults(kind = "compare") {
    const pg = resultsPage(kind);
    if (pg !== PAGE) {
      goPage(pg);
      compare();
    } else {
      compare({ scroll: true });
    }
  }

  // --------------------------------------------------------------- compare
  function updateURL() {
    if (DESIGN) history.replaceState(null, "", pageURL());
  }

  let ticket = 0;
  async function compare({ scroll = false } = {}) {
    if (!LOADED) return;
    updateURL();
    const ids = { a: sel.a?.i, b: sel.b?.i };
    if (!ids.a && !ids.b) { shown = { a: null, b: null }; status = "hint"; drawData(); return; }
    const t = ++ticket;
    status = "loading";
    drawData();
    try {
      const [pa, pb] = await Promise.all([ids.a ? profile(ids.a) : null, ids.b ? profile(ids.b) : null]);
      if (t !== ticket) return;
      shown = { a: pa, b: pb };
      if (!shown[hist.corner]) hist.corner = pa ? "a" : "b";
      hist.all = false;
      status = "ok";
      drawData();
      if (scroll) scrollToEl($(".blk[data-data]:not(.is-empty)", MAIN));
    } catch (e) {
      if (t === ticket) { status = "error"; drawData(); }
    }
  }

  function corners() {
    return ["a", "b"].filter((c) => shown[c]).map((c) => [c, shown[c]]);
  }
  function statusHTML() {
    switch (status) {
      case "boot": return `<p class="loading">${tx("boot")}</p>`;
      case "bootfail": return `<p class="loading">Sorry, the fighter list couldn't be loaded. Please refresh the page.</p>`;
      case "hint": return `<p class="hint">${tx("hint")}</p>`;
      case "loading": return `<p class="loading">${tx("loading")}</p>`;
      case "error": return `<p class="error">Sorry, that fighter couldn't be loaded. Please check your connection and try again.</p>`;
      default: return "";
    }
  }

  // the sections that show the chosen fighters (a message in the first of them while there are none)
  function drawData() {
    if (!DESIGN) return;
    const msg = statusHTML();
    const cs = corners();
    const two = cs.length === 2;
    $$(".blk[data-data]", MAIN).forEach((el, i) => {
      const b = BLOCK.get(el.dataset.bid);
      const h = msg ? (i === 0 ? msg : "") : dataHTML(b, cs, two);
      el.innerHTML = h || ph(`${D.BLOCKS[b.type][0]}: shows here once fighters are picked`);
      el.classList.toggle("is-empty", !el.innerHTML);
    });
    if (!msg) {
      for (const img of $$("img.photo", MAIN)) {
        img.addEventListener("error", () => {
          const d = document.createElement("div");
          d.className = "photo initials";
          d.textContent = img.dataset.ini;
          img.replaceWith(d);
        }, { once: true });
      }
      renderHistory();
    }
    if (PREVIEW) placeTools();
  }

  function dataHTML(b, cs, two) {
    switch (b.type) {
      case "heads": return headsHTML(cs, two, b);
      case "share": return shareHTML(cs, two, b);
      case "tape": return tapeHTML(cs, two, b);
      case "stats": return statsHTML(cs, two, b);
      case "strikes": return strikesHTML(cs, two, b);
      case "last3": return last3HTML(cs, two, b);
      case "form": return formHTML(cs, two, b);
      case "met": return two ? metHTML(shown.a, b) : "";
      case "common": return two ? commonHTML(shown.a, shown.b, b) : "";
      case "history": return `<section class="${cardCls(b)}" data-role="history"></section>`;
      default: return "";
    }
  }

  function headsHTML(cs, two, b) {
    const o = b.p;
    return `<section class="${cardCls(b)}"><div class="heads ${two ? "" : "heads--one"}">${cs.map(([c, p]) => {
      const tags = (p.tags || []).map((t) => `<span class="tag ${/title|champ/i.test(t) ? "tag--gold" : ""}">${esc(t.replace(/ Division$/, ""))}</span>`).join("");
      const status = p.status && p.status !== "Active" ? `<span class="tag">${esc(p.status)}</span>` : "";
      const photo = p.photo
        ? `<img class="photo" src="${esc(ROOT + p.photo)}" alt="" loading="lazy" data-ini="${esc(initials(p.name))}">`
        : `<div class="photo initials">${esc(initials(p.name))}</div>`;
      return `<div class="head head--${c}">${photo}<div>
        <h2 class="head__name">${esc(p.name)}</h2>
        ${o.nick && p.nickname ? `<div class="head__nick">“${esc(p.nickname)}”</div>` : ""}
        <div class="head__rec">${rec(p.record) || ""}</div>
        ${o.tags ? `<div class="tags">${tags}${status}</div>` : ""}</div></div>`;
    }).join("")}</div>${o.next ? cs.map(([, p]) => nextHTML(p)).join("") : ""}</section>`;
  }
  function nextHTML(p) {
    const u = p.upcoming;
    if (!u) return "";
    return `<div class="next"><b>${tx("nextFight", { name: p.name })}</b> vs ${esc(u.opp_name)}, ${esc(u.event)} (${esc(fmtWhen(u.date))})${u.billing ? `<span class="small">${esc(u.billing)}</span>` : ""}</div>`;
  }
  function shareHTML(cs, two, b) {
    const o = b.p;
    const corner = T[cs[0][0] === "a" ? "blue" : "red"].toLowerCase();
    if (two && !o.share && !o.copyai) return "";
    return `<div class="share box">
      ${o.share ? `<button class="btn" type="button" data-act="share">${tx("share")}</button>` : ""}
      ${o.copyai ? `<button class="btn" type="button" data-act="copyai" title="Copies the whole comparison as text, to paste into an AI app">${tx("copyai")}</button>` : ""}
      ${two ? "" : `<span class="muted" style="align-self:center">${tx("pickOther", { corner })}</span>`}
    </div>`;
  }

  // ------------------------------------------------------- tale of the tape
  const TAPE = [
    ["Age", (p) => (age(p.dob) != null ? `${age(p.dob)}<span class="small">born ${fmtDate(p.dob)}</span>` : null)],
    ["Country", (p) => {
      if (!p.country) return null;
      const cc = p.country_check;
      let h = esc(p.country);
      if (p.birthplace) h += `<span class="small">born in ${esc(p.birthplace)}</span>`;
      if (cc?.status === "corrected") {
        h += `<span class="small cnote" title="The country listed for them didn't match where they were born, and their nationality agrees with the birthplace.">Corrected: also listed as ${esc(cc.listed)}</span>`;
      } else if (cc?.status === "unconfirmed") {
        h += `<span class="small cnote" title="They were born somewhere else, and nothing else confirms which country they represent.">Not confirmed: born in another country</span>`;
      }
      return h;
    }],
    ["Pro MMA record", (p) => rec(p.record)],
    ["UFC record", (p) => rec(p.ufc_record)],
    ["UFC opponent combined record", (p) => oppRec(p.opp_records?.ufc), (p) => winShare(p.opp_records?.ufc?.record), "high"],
    ["Total pro MMA opponent combined record", (p) => oppRec(p.opp_records?.pro), (p) => winShare(p.opp_records?.pro?.record), "high"],
    ["Height", (p) => fmtHeight(p.height_in), (p) => p.height_in, "high"],
    ["Reach", (p) => fmtIn(p.reach_in), (p) => p.reach_in, "high"],
    ["Leg reach", (p) => fmtIn(p.leg_reach_in), (p) => p.leg_reach_in, "high"],
    ["Stance", (p) => esc(p.stance) || null],
    ["Style", (p) => (p.styles?.length ? p.styles.map(esc).join(", ") : null)],
    ["Weight class", (p) => esc(p.weight_class) || null],
    ["Gym", (p) => (p.gym ? `${esc(p.gym)}${p.teams?.length ? `<span class="small">Also: ${p.teams.slice(0, 3).map(esc).join(", ")}${p.teams.length > 3 ? "…" : ""}</span>` : ""}` : null)],
    ["Fighting out of", (p) => esc(p.fighting_out_of || p.background?.fighting_out_of) || null],
    ["Coaches", (p) => {
      const t = p.background || {};
      const list = p.coaches?.length ? p.coaches
        : [t.head_coach && { role: "head", name: t.head_coach }, t.other_coaches && { role: "other", name: t.other_coaches }].filter(Boolean);
      return list.length
        ? `<ul>${list.map((x) => `<li>${x.role ? `<b>${esc(x.role[0].toUpperCase() + x.role.slice(1))}:</b> ` : ""}${esc(x.name)}${x.former ? ' <span class="muted">(former)</span>' : ""}</li>`).join("")}</ul>`
        : '<span class="muted">Not publicly listed</span>';
    }],
    ["Belts & ranks", (p) => (p.belts?.length ? `<ul>${p.belts.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : null)],
  ];
  // rows left out when neither fighter has anything for them
  const OPTIONAL = new Set(["Fighting out of", "Belts & ranks"]);
  const STATS = [
    ["Sig. strikes landed / min", "slpm", num, "high"],
    ["Striking accuracy", "str_acc", pct, "high"],
    ["Sig. strikes absorbed / min", "sapm", num, "low"],
    ["Striking defence", "str_def", pct, "high"],
    ["Takedown avg (per 15 min)", "td_avg", num, "high"],
    ["Takedown accuracy", "td_acc", pct, "high"],
    ["Takedown defence", "td_def", pct, "high"],
    ["Submission avg (per 15 min)", "sub_avg", num, "high"],
    ["Knockdown avg (per 15 min)", "kd_avg", num, "high"],
    ["Control time (per 15 min)", "ctrl_avg", secs, "high"],
  ];
  // Where significant strikes landed, and where they were thrown from (shares of strikes landed).
  const SPLITS = [
    ["Strikes landed to", [["head", "Head"], ["body", "Body"], ["leg", "Legs"]]],
    ["Strikes landed from", [["dist", "Distance"], ["clinch", "Clinch"], ["ground", "Ground"]]],
  ];
  function splitHTML(c, parts) {
    if (!c || parts.some(([k]) => c[`${k}_pct`] == null)) return null;
    const seg = parts.map(([k], i) => `<span class="s${i + 1}" style="width:${c[`${k}_pct`] * 100}%"></span>`).join("");
    const leg = parts.map(([k, name], i) => `<span class="key k${i + 1}"></span>${name} ${pct(c[`${k}_pct`])}`).join(" · ");
    return `<div class="bar split" aria-hidden="true">${seg}</div><span class="legend">${leg}</span>`;
  }

  function better(va, vb, dir) {
    if (va == null || vb == null || !dir || Math.abs(va - vb) < 1e-9) return ["", ""];
    const aWins = dir === "high" ? va > vb : va < vb;
    return aWins ? ["adv", ""] : ["", "adv"];
  }
  const ARROW = ' <span class="arrow" title="Advantage">▲</span>';
  const mark = (h) => (h.includes('<span class="small"') ? h.replace('<span class="small"', `${ARROW}<span class="small"`) : h + ARROW);
  function row(label, vals, cls, two) {
    const v = vals.map((x, i) => (x == null || x === "" ? dash : cls[i] ? mark(x) : x));
    if (!two) return `<div class="trow one"><div class="lab">${label}</div><div class="va">${v[0]}</div></div>`;
    return `<div class="trow"><div class="va ${cls[0]}">${v[0]}</div><div class="lab">${label}</div><div class="vb ${cls[1]}">${v[1]}</div></div>`;
  }
  // the rows a design shows, in its order and with its names (all of them, as listed above, by default)
  function rowsOf(list, conf) {
    if (!conf) return list.map((r) => [r, r[0]]);
    const by = new Map(list.map((r) => [r[0], r]));
    return conf.filter((c) => c.show && by.has(c.k)).map((c) => [by.get(c.k), c.label || c.k]);
  }
  const noStats = (ps) => (ps.some((p) => !p.career) ? '<p class="note">No UFC stats yet for a fighter who hasn\'t fought in the UFC.</p>' : "");

  // The numbers from a fighter's last 3 UFC fights (all of them when they've had fewer).
  const last3Of = (p) => p.last3 || (p.career && p.career.fights < 3 ? p.career : null);
  const ufcFights = (p, last3) => Math.min(p.career?.fights || 0, last3 ? 3 : Infinity);

  function statRows(ps, two, conf, last3 = false) {
    let h = "";
    for (const [[, key, fmt, dir], label] of rowsOf(STATS, conf)) {
      const src = ps.map((p) => (last3 ? last3Of(p) : p.career));
      const vals = ps.map((p, i) => {
        const c = src[i]?.[key];
        if (c == null) return null;
        const l3 = p.last3?.[key];
        return `${fmt(c)}${!last3 && l3 != null ? `<span class="small">last 3: ${fmt(l3)}</span>` : ""}`;
      });
      const cls = two ? better(src[0]?.[key], src[1]?.[key], dir) : ["", ""];
      h += row(esc(label), vals, cls, two);
    }
    return h;
  }
  const hasSplits = (ps, last3 = false) => ps.some((p) => splitHTML(last3 ? last3Of(p) : p.career, SPLITS[0][1]));
  const splitRows = (ps, two, last3 = false) => SPLITS.map(([label, parts]) =>
    row(label, ps.map((p) => splitHTML(last3 ? last3Of(p) : p.career, parts)), ["", ""], two)).join("");
  const fromUFC = (ps, last3 = false) =>
    `${last3 ? "UFC fights only" : "from UFC fights"} (${ps.map((p) => ufcFights(p, last3)).join(" / ")})`;

  function tapeHTML(cs, two, b) {
    const o = b.p;
    const ps = cs.map((x) => x[1]);
    let h = `<section class="${cardCls(b)}">${heading(b)}<div class="tape">`;
    for (const [[key, show, val, dir], label] of rowsOf(TAPE, o.rows)) {
      const vals = ps.map(show);
      if (vals.every((x) => x == null) && OPTIONAL.has(key)) continue;
      const cls = two && val ? better(val(ps[0]), val(ps[1]), dir) : ["", ""];
      h += row(esc(label), vals, cls, two);
    }
    if (o.stats) {
      h += `<div class="sec">${tx("statsSec")} <span class="muted" style="font-weight:400">· ${fromUFC(ps)}</span></div>`;
      h += statRows(ps, two, o.statRows);
    }
    if (o.strikes && hasSplits(ps)) {
      h += `<div class="sec">${tx("strikesSec")} <span class="muted" style="font-weight:400">· share of significant strikes landed</span></div>`;
      h += splitRows(ps, two);
    }
    return `${h}</div>${o.stats || o.strikes ? noStats(ps) : ""}</section>`;
  }
  function statsHTML(cs, two, b) {
    const ps = cs.map((x) => x[1]);
    const l3 = b.p.last3;
    return `<section class="${cardCls(b)}">${heading(b, ` <span class="sub">${fromUFC(ps, l3)}</span>`)}<div class="tape">${statRows(ps, two, b.p.rows, l3)}</div>${noStats(ps)}</section>`;
  }
  function strikesHTML(cs, two, b) {
    const ps = cs.map((x) => x[1]);
    const l3 = b.p.last3;
    if (!hasSplits(ps, l3)) return "";
    const sub = l3 ? `share of significant strikes landed, ${fromUFC(ps, true)}` : "share of significant strikes landed";
    return `<section class="${cardCls(b)}">${heading(b, ` <span class="sub">${sub}</span>`)}<div class="tape">${splitRows(ps, two, l3)}</div></section>`;
  }

  // ----------------------------------------------------------- last 3 fights
  const lastFights = (p, n = 3) => p.fights.filter((f) => ["W", "L", "D", "NC"].includes(f.result)).slice(0, n);
  function last3Record(p) {
    const fs = lastFights(p);
    if (!fs.length) return null;
    const r = { W: 0, L: 0, D: 0, NC: 0 };
    for (const f of fs) r[f.result]++;
    return r;
  }
  const LAST3 = [
    ["Record in last 3 fights", (p) => {
      const r = last3Record(p);
      if (!r) return null;
      const badges = lastFights(p).map((f) => `<span class="badge b-${f.result}" title="${esc(`${f.result} vs ${f.opp_name}, ${fmtDate(f.date)}`)}">${f.result}</span>`).join("");
      const n = lastFights(p).length;
      return `${rec(r)}<span class="small">${n < 3 ? `only ${n} pro fight${n === 1 ? "" : "s"} · ` : ""}newest first</span><div class="badges badges--sm">${badges}</div>`;
    }, (p) => winShare(last3Record(p)), "high"],
    ["Last 3 opponents' combined record", (p) => oppRec(p.opp_records?.last3), (p) => winShare(p.opp_records?.last3?.record), "high"],
  ];
  function last3HTML(cs, two, b) {
    const ps = cs.map((x) => x[1]);
    let h = `<section class="${cardCls(b)}">${heading(b, ' <span class="sub">all pro fights, any promotion</span>')}<div class="tape">`;
    for (const [[, show, val, dir], label] of rowsOf(LAST3, b.p.rows)) {
      const cls = two ? better(val(ps[0]), val(ps[1]), dir) : ["", ""];
      h += row(esc(label), ps.map(show), cls, two);
    }
    return `${h}</div></section>`;
  }

  // --------------------------------------------------------- form & finish
  function summary(p) {
    const done = p.fights.filter((f) => ["W", "L", "D", "NC"].includes(f.result));
    const s = { last5: done.slice(0, 5), streak: null, wins: { ko: 0, sub: 0, dec: 0, oth: 0 }, losses: { ko: 0, sub: 0, dec: 0, oth: 0 } };
    if (done.length && ["W", "L"].includes(done[0].result)) {
      let n = 0;
      while (n < done.length && done[n].result === done[0].result) n++;
      s.streak = [done[0].result, n];
    }
    for (const f of done) {
      const k = how(f.method);
      if (f.result === "W" && k !== "nc") s.wins[k]++;
      if (f.result === "L" && k !== "nc") s.losses[k]++;
    }
    const ufc = done.filter((f) => f.ufc && f.minutes);
    s.avgTime = ufc.length ? ufc.reduce((a, f) => a + f.minutes, 0) / ufc.length : null;
    const wl = (fs) => (fs.length ? `${fs.filter((f) => f.result === "W").length}-${fs.filter((f) => f.result === "L").length}` : null);
    s.ufcTitles = wl(done.filter((f) => f.title && f.ufc));
    s.last = done[0]?.date;
    const firstUfc = [...done].reverse().find((f) => f.ufc);
    s.debut = firstUfc?.date;
    return s;
  }
  function methodBar(o, title) {
    const total = o.ko + o.sub + o.dec + o.oth;
    if (!total) return `<li>${title}: <b>none</b></li>`;
    const seg = ["ko", "sub", "dec", "oth"].filter((k) => o[k]).map((k) => `<span class="${k === "oth" ? "oth" : k}" style="width:${(o[k] / total) * 100}%"></span>`).join("");
    const leg = ["ko", "sub", "dec", "oth"].filter((k) => o[k]).map((k) => `${HOW[k]} ${o[k]} (${Math.round((o[k] / total) * 100)}%)`).join(" · ");
    return `<li>${title}: <b>${total}</b><div class="bar" aria-hidden="true">${seg}</div><div class="legend">${leg}</div></li>`;
  }
  function formHTML(cs, two, b) {
    const F = new Set(b.p.facts || D.FORM_FACTS.map(([k]) => k));
    const on = (k, h) => (F.has(k) ? h : "");
    return `<section class="${cardCls(b)}">${heading(b)}<div class="form ${two ? "" : "form--one"}">${cs.map(([c, p]) => {
      const s = summary(p);
      const wins = s.wins.ko + s.wins.sub + s.wins.dec + s.wins.oth;
      const fin = wins ? Math.round(((s.wins.ko + s.wins.sub) / wins) * 100) : null;
      return `<div class="f${c}"><h3>${esc(p.name)}</h3>
        ${on("last5", `<div class="legend">Last 5 fights (newest first)</div>
        <div class="badges">${s.last5.map((f) => `<span class="badge b-${f.result}" title="${esc(`${f.result} vs ${f.opp_name}, ${fmtDate(f.date)}`)}">${f.result === "NC" ? "NC" : f.result}</span>`).join("") || '<span class="muted">No fights yet</span>'}</div>`)}
        <ul class="facts">
          ${on("streak", s.streak ? `<li>${s.streak[1] === 1 ? `<b>${s.streak[0] === "W" ? "Won" : "Lost"}</b> their last fight` : s.streak[0] === "W" ? `On a <b>${s.streak[1]}-fight win streak</b>` : `Has <b>lost ${s.streak[1]} in a row</b>`}</li>` : "")}
          ${on("wins", methodBar(s.wins, "Wins"))}
          ${on("losses", methodBar(s.losses, "Losses"))}
          ${on("finish", fin != null ? `<li>Finishes <b>${fin}%</b> of wins (KO or submission)</li>` : "")}
          ${on("avg", s.avgTime ? `<li>Average UFC fight lasts <b>${mmss(s.avgTime)}</b></li>` : "")}
          ${on("titles", s.ufcTitles ? `<li>UFC title fights: <b>${s.ufcTitles}</b></li>` : "")}
          ${on("last", s.last ? `<li>Last fought: <b>${fmtDate(s.last)}</b> <span class="muted">(${since(s.last)})</span></li>` : "")}
          ${on("debut", s.debut ? `<li>UFC debut: ${fmtDate(s.debut)}</li>` : "")}
        </ul></div>`;
    }).join("")}</div></section>`;
  }

  // ------------------------------------------- head to head, common foes
  const foeKey = (f) => f.opp_id || `n:${norm(f.opp_name)}`;
  const short = (f) => `<b class="${f.result === "W" ? "" : ""}">${f.result}</b> ${esc(HOW[how(f.method)] || f.method || "")}${f.round ? ` R${f.round}` : ""} · ${toDate(f.date).getUTCFullYear()}`;

  function h2hData(a, b) {
    const met = a.fights.filter((f) => f.opp_id === b.id || norm(f.opp_name) === norm(b.name));
    const mapA = new Map();
    const mapB = new Map();
    for (const f of a.fights) if (f.result) (mapA.get(foeKey(f)) || mapA.set(foeKey(f), []).get(foeKey(f))).push(f);
    for (const f of b.fights) if (f.result) (mapB.get(foeKey(f)) || mapB.set(foeKey(f), []).get(foeKey(f))).push(f);
    const common = [...mapA.keys()].filter((k) => mapB.has(k) && k !== b.id && k !== a.id && k !== `n:${norm(b.name)}` && k !== `n:${norm(a.name)}`)
      .map((k) => [k, mapA.get(k), mapB.get(k)])
      .sort((x, y) => Math.max(Date.parse(y[1][0].date), Date.parse(y[2][0].date)) - Math.max(Date.parse(x[1][0].date), Date.parse(x[2][0].date)));
    return { met, common };
  }
  let H2H = null;
  const h2h = () => {
    if (!H2H || H2H.a !== shown.a || H2H.b !== shown.b) H2H = { a: shown.a, b: shown.b, ...h2hData(shown.a, shown.b) };
    return H2H;
  };
  function metHTML(a, blk) {
    const { met } = h2h();
    if (!met.length) return "";
    return `<section class="${cardCls(blk)}">${heading(blk)}<ul class="facts">${met.map((f) => `<li><b>${esc(a.name)} ${f.result === "W" ? "won" : f.result === "L" ? "lost" : f.result === "D" ? "drew" : "— no contest"}</b> · ${esc(f.method || "")}${f.finish ? ` (${esc(f.finish)})` : ""}${f.round ? `, round ${f.round} (${esc(f.time)})` : ""} · ${esc(f.event)}, ${fmtDate(f.date)}</li>`).join("")}</ul></section>`;
  }
  function commonHTML(a, b, blk) {
    const { common } = h2h();
    let h = `<section class="${cardCls(blk)}">${heading(blk, ` <span class="sub">${common.length || "none"}</span>`)}`;
    if (common.length) {
      h += `<table class="tbl"><thead><tr><th>Opponent</th><th style="color:var(--red)">${esc(a.name)}</th><th style="color:var(--blue)">${esc(b.name)}</th></tr></thead><tbody>${common.map(([, fa, fb]) =>
        `<tr><td><b>${esc(fa[0].opp_name)}</b></td><td>${fa.map(short).join("<br>")}</td><td>${fb.map(short).join("<br>")}</td></tr>`).join("")}</tbody></table>`;
    } else {
      h += `<p class="muted">${tx("noCommon")}</p>`;
    }
    return `${h}</section>`;
  }

  // ------------------------------------------------------- copy for AI tools
  // The whole comparison as plain text, to paste into an AI assistant: tools that read a link often
  // can't open the site and then make things up (the user's request, 2026-10-18).
  function plain(html) {
    const d = document.createElement("div");
    d.innerHTML = html;
    for (const s of $$(".small", d)) s.textContent = ` (${s.textContent})`;
    for (const li of $$("li", d)) li.textContent = `${li.textContent}; `;
    return d.textContent.replace(/\s+/g, " ").replace(/;\s*$/, "").trim();
  }
  function aiText(cs) {
    const ps = cs.map(([, p]) => p);
    const two = ps.length === 2;
    const line = (label, vals) => `${label}: ${vals.map((v) => (v == null || v === "" ? "-" : v)).join(" | ")}`;
    const L = [`${ps.map((p) => p.name).join(" vs ")}: fighter comparison from UFC HUT${UPDATED ? `, data updated ${fmtDate(UPDATED.slice(0, 10))}` : ""}.`];
    if (two) L.push(`Red corner: ${ps[0].name}. Blue corner: ${ps[1].name}. Values are listed in that order, separated by |.`);
    for (const p of ps) {
      const u = p.upcoming;
      const when = u && toDate(u.date).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
      if (u) L.push(`${p.name}'s next fight: vs ${u.opp_name}, ${[u.event, when, u.billing, u.weight_class, u.rounds && `${u.rounds} rounds`].filter(Boolean).join(", ")}.`);
    }
    L.push("", "TALE OF THE TAPE");
    if (ps.some((p) => p.nickname)) L.push(line("Nickname", ps.map((p) => p.nickname)));
    for (const [label, show] of TAPE) {
      const vals = ps.map((p) => { const h = show(p); return h == null ? null : plain(h); });
      if (vals.every((v) => v == null || v === "Not publicly listed")) continue;
      L.push(line(label, vals));
    }
    L.push("", "CAREER STATS (from UFC fights only; the average over the last 3 fights is in brackets)");
    L.push(line("UFC fights counted", ps.map((p) => p.career?.fights || 0)));
    for (const [label, key, fmt] of STATS) {
      L.push(line(label, ps.map((p) => (p.career?.[key] == null ? null
        : `${fmt(p.career[key])}${p.last3?.[key] != null ? ` (${fmt(p.last3[key])})` : ""}`))));
    }
    for (const [label, parts] of SPLITS) {
      L.push(line(`${label} ${parts.map(([, n]) => n.toLowerCase()).join(" / ")}`, ps.map((p) => (
        p.career && parts.every(([k]) => p.career[`${k}_pct`] != null) ? parts.map(([k]) => pct(p.career[`${k}_pct`])).join(" / ") : null))));
    }
    L.push("", "FORM AND FINISHING");
    const by = (o) => ["ko", "sub", "dec", "oth"].filter((k) => o[k]).map((k) => `${HOW[k]} ${o[k]}`).join(", ") || "none";
    for (const p of ps) {
      const s = summary(p);
      const wins = s.wins.ko + s.wins.sub + s.wins.dec + s.wins.oth;
      L.push(`${p.name}: ${[
        `last 5 results (newest first) ${s.last5.map((f) => f.result).join(" ") || "none"}`,
        s.streak && (s.streak[1] === 1 ? `${s.streak[0] === "W" ? "won" : "lost"} their last fight`
          : `${s.streak[0] === "W" ? "won" : "lost"} the last ${s.streak[1]} in a row`),
        `wins by ${by(s.wins)}`, `losses by ${by(s.losses)}`,
        wins && `finishes ${Math.round(((s.wins.ko + s.wins.sub) / wins) * 100)}% of wins`,
        s.avgTime && `average UFC fight lasts ${mmss(s.avgTime)}`,
        s.ufcTitles && `UFC title fights ${s.ufcTitles}`,
        s.last && `last fought ${fmtDate(s.last)}`, s.debut && `UFC debut ${fmtDate(s.debut)}`,
      ].filter(Boolean).join("; ")}.`);
    }
    const said = { W: "won", L: "lost", D: "drew", NC: "no contest" };
    const brief = (f) => `${f.result} ${HOW[how(f.method)] || f.method || ""}${f.round ? ` R${f.round}` : ""} (${toDate(f.date).getUTCFullYear()})`;
    if (two) {
      const { met, common } = h2hData(ps[0], ps[1]);
      if (met.length) {
        L.push("", "THEY'VE FOUGHT BEFORE");
        for (const f of met) L.push(`${fmtDate(f.date)}: ${ps[0].name} ${said[f.result] || f.result}, ${[f.method, f.finish, f.round && `round ${f.round} at ${f.time}`, f.event].filter(Boolean).join(", ")}`);
      }
      L.push("", `COMMON OPPONENTS: ${common.length || "none"}`);
      for (const [, fa, fb] of common) L.push(`${fa[0].opp_name}: ${fa.map(brief).join("; ")} | ${fb.map(brief).join("; ")}`);
    }
    for (const p of ps) {
      const done = p.fights.filter((f) => ["W", "L", "D", "NC"].includes(f.result));
      L.push("", `${p.name.toUpperCase()}: EVERY PRO FIGHT (${done.length}, newest first)`);
      for (const f of done) {
        L.push([fmtDate(f.date), f.result, `vs ${f.opp_name}`, [f.method, f.finish && `(${f.finish})`].filter(Boolean).join(" "),
          f.round && `round ${f.round} at ${f.time}`, f.event, f.title && "title fight",
          f.me?.sig_a != null && `sig. strikes landed ${f.me.sig_l} of ${f.me.sig_a}`,
          f.me?.td_a != null && `takedowns ${f.me.td_l} of ${f.me.td_a}`].filter(Boolean).join(" · "));
      }
      if (p.history_missing) L.push(`(${p.history_missing} older pro fight${p.history_missing > 1 ? "s are" : " is"} not listed.)`);
    }
    L.push("", "Career stats are worked out from UFC fights only; fights in other organisations have results only.");
    return L.join("\n");
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;opacity:0";
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }

  // ---------------------------------------------------------- fight history
  const FS = [
    ["Sig. strikes landed", (s) => (s.sig_a != null ? `${s.sig_l} of ${s.sig_a}` : null), (s) => s.sig_l, "high"],
    ["Sig. strikes landed / min", (s) => num(s.slpm), (s) => s.slpm, "high"],
    ["Striking accuracy", (s) => pct(s.str_acc), (s) => s.str_acc, "high"],
    ["Sig. strikes absorbed / min", (s) => num(s.sapm), (s) => s.sapm, "low"],
    ["Striking defence", (s) => pct(s.str_def), (s) => s.str_def, "high"],
    ["Takedowns landed", (s) => (s.td_a != null ? `${s.td_l} of ${s.td_a}` : null), (s) => s.td_l, "high"],
    ["Takedown avg (per 15 min)", (s) => num(s.td_avg), (s) => s.td_avg, "high"],
    ["Takedown accuracy", (s) => pct(s.td_acc), (s) => s.td_acc, "high"],
    ["Takedown defence", (s) => pct(s.td_def), (s) => s.td_def, "high"],
    ["Submission attempts", (s) => (s.sub != null ? String(s.sub) : null), (s) => s.sub, "high"],
    ["Submission avg (per 15 min)", (s) => num(s.sub_avg), (s) => s.sub_avg, "high"],
    ["Knockdowns", (s) => (s.kd != null ? String(s.kd) : null), (s) => s.kd, "high"],
    ["Reversals", (s) => (s.rev != null ? String(s.rev) : null), (s) => s.rev, "high"],
    ["Control time", (s) => secs(s.ctrl), (s) => s.ctrl, "high"],
    ["Sig. strikes landed to", null],
    ["Head", (s) => of(s, "head"), (s) => s.head_l, "high"],
    ["Body", (s) => of(s, "body"), (s) => s.body_l, "high"],
    ["Legs", (s) => of(s, "leg"), (s) => s.leg_l, "high"],
    ["Sig. strikes landed from", null],
    ["At distance", (s) => of(s, "dist"), (s) => s.dist_l, "high"],
    ["In the clinch", (s) => of(s, "clinch"), (s) => s.clinch_l, "high"],
    ["On the ground", (s) => of(s, "ground"), (s) => s.ground_l, "high"],
  ];
  const of = (s, k) => (s[`${k}_a`] != null ? `${s[`${k}_l`]} of ${s[`${k}_a`]}` : null);
  const surname = (n) => esc((n || "Opponent").split(" ").slice(-1)[0]);

  function roundsHTML(p, f) {
    const rs = f.by_round;
    if (!rs?.length) return "";
    const pair = (r, get) => `${get(r.me) ?? "—"} – ${get(r.opp) ?? "—"}`;
    const cols = [
      ["Sig. strikes", (s) => s.sig_l],
      ["Takedowns", (s) => s.td_l],
      ...(rs.some((r) => r.me.kd || r.opp.kd) ? [["Knockdowns", (s) => s.kd]] : []),
      ...(rs.some((r) => r.me.ctrl != null) ? [["Control", (s) => secs(s.ctrl)]] : []),
    ];
    return `<table class="fs rounds"><caption>Round by round <span class="muted">(${surname(p.name)} – ${surname(f.opp_name)})</span></caption>
      <thead><tr><th>Round</th>${cols.map(([c]) => `<th>${c}</th>`).join("")}</tr></thead>
      <tbody>${rs.map((r, i) => `<tr><th>${i + 1}</th>${cols.map(([, get]) => `<td>${pair(r, get)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }

  // Records going in, billing, venue and weigh-in.
  function detailsHTML(p, f) {
    const t = f.details;
    if (!t) return "";
    const me = surname(p.name);
    const bits = [];
    if (t.rec_before || t.opp_rec_before) {
      bits.push(`<b>Records going in:</b> ${me} ${esc(t.rec_before || "?")}, ${surname(f.opp_name)} ${esc(t.opp_rec_before || "?")}`);
    }
    if (t.billing) bits.push(`<b>Billing:</b> ${esc(t.billing)}`);
    if (t.venue || t.location) bits.push(`<b>Where:</b> ${[t.venue, t.location].filter(Boolean).map(esc).join(", ")}`);
    if (t.weigh_in) bits.push(`<b>Weigh-in:</b> ${esc(t.weigh_in)}`);
    return bits.length ? `<p class="officials">${bits.join("<br>")}</p>` : "";
  }

  function fightStats(p, f) {
    if (!f.me) {
      return `<p class="nostats">${f.ufc ? "No detailed stats were recorded for this fight." : "Detailed stats are only recorded for UFC fights."}</p>
        <div class="fight__stats">${detailsHTML(p, f)}</div>`;
    }
    const me = f.me;
    const op = f.opp || {};
    let rows = "";
    let heading = "";
    for (const [label, show, val, dir] of FS) {
      if (!show) { heading = `<tr class="fs-sec"><th colspan="3">${label}</th></tr>`; continue; }
      const a = show(me);
      const b = f.opp ? show(op) : null;
      if (a == null && b == null) continue;
      const cls = val && f.opp ? better(val(me), val(op), dir) : ["", ""];
      rows += `${heading}<tr><th>${label}</th><td class="${cls[0] ? "win" : ""}">${a ?? "—"}</td><td class="${cls[1] ? "win" : ""}">${b ?? "—"}</td></tr>`;
      heading = "";
    }
    return `<div class="fight__stats"><table class="fs"><thead><tr><th>${f.minutes ? `Fight time ${mmss(f.minutes)}` : ""}</th><th>${surname(p.name)}</th><th>${surname(f.opp_name)}</th></tr></thead><tbody>${rows}</tbody></table>
      ${f.opp ? "" : '<p class="note">The opponent\'s numbers for this fight aren\'t available.</p>'}${roundsHTML(p, f)}${detailsHTML(p, f)}</div>`;
  }

  const chevText = (f, open) => (!f.me && !f.details ? "" : open ? "Hide ▴" : f.me ? "Stats ▾" : "Details ▾");

  function renderHistory() {
    const box = $('[data-role="history"]', MAIN);
    if (!box) return;
    const b = BLOCK.get(box.closest(".blk").dataset.bid);
    const cs = corners();
    const p = shown[hist.corner];
    const list = p.fights.filter((f) => !hist.ufcOnly || f.ufc);
    const limit = hist.all ? list.length : b.p.limit;
    const tabs = cs.length === 2
      ? `<div class="tabs" role="tablist">${cs.map(([c, q]) => `<button class="tab t${c}" role="tab" type="button" data-tab="${c}" aria-selected="${c === hist.corner}">${esc(q.name)}</button>`).join("")}</div>`
      : "";
    const missing = p.history_missing ? `<p class="note">${p.history_missing} of ${esc(p.name)}'s older pro fight${p.history_missing > 1 ? "s aren't" : " isn't"} listed here.</p>` : "";
    box.innerHTML = `${heading(b, ` <span class="sub">${tx("historySub", { n: p.fights.length })}</span>`)}${tabs}
      ${b.p.filter ? `<div class="filter"><label><input type="checkbox" data-act="ufconly" ${hist.ufcOnly ? "checked" : ""}> ${tx("ufcOnly")}</label></div>` : ""}
      <ul class="fights">${list.slice(0, limit).map((f, i) => {
        const res = f.result === "NC" ? "NC" : f.result || "?";
        return `<li class="fight r-${esc(f.result)}">
          <button class="fight__head" type="button" data-fight="${i}" aria-expanded="false">
            <span class="res">${res}</span>
            <span class="fight__opp">vs ${esc(f.opp_name)}${f.title ? '<span class="title-belt">Title</span>' : ""}</span>
            <span class="fight__how">${esc(f.method || "")}${f.finish ? ` (${esc(f.finish)})` : ""}${f.round ? ` · Round ${f.round}, ${esc(f.time)}` : ""}</span>
            <span class="fight__meta">${esc(f.event)} · ${fmtDate(f.date)}${f.weight_class ? ` · ${esc(f.weight_class)}` : ""}</span>
            <span class="chev">${chevText(f, false)}</span>
          </button>
          <div class="fight__body" hidden></div>
        </li>`;
      }).join("")}</ul>
      ${list.length > limit ? `<button class="btn more" type="button" data-act="all">${tx("showAll", { n: list.length })}</button>` : ""}
      ${list.length ? "" : '<p class="muted">No fights to show.</p>'}${missing}`;
    box._list = list;
  }

  // --------------------------------------------------------------- upcoming
  function upcomingHTML(b) {
    if (!UPCOMING.length) return ph("Upcoming fights: the next fight cards show here");
    const p = b.p;
    return `<section class="upcoming box">${heading(b, p.sub ? ` <span class="sub">${esc(p.sub)}</span>` : "")}<div class="cards">${UPCOMING.map((ev, i) => `<details ${i < p.open ? "open" : ""}>
      <summary>${esc(ev.name)}${ev.live && Date.now() - toDate(ev.date) < 8 * 36e5 ? ` <span class="live">${tx("liveNow")}</span>` : ""}<span class="when">${esc(fmtWhen(ev.date))}${ev.venue ? ` · ${esc(ev.venue)}` : ""}</span></summary>
      <ul class="mus r${p.perRow}">${ev.fights.map((f) => `<li><button class="mu" type="button" data-a="${esc(f.a.id)}" data-b="${esc(f.b.id)}" data-an="${esc(f.a.name)}" data-bn="${esc(f.b.name)}">
        <span class="mu-a">${esc(f.a.name)}<small>${esc(f.a.record || "")}</small></span>
        <span class="mu-vs">${tx("vs")}</span>
        <span class="mu-b">${esc(f.b.name)}<small>${esc(f.b.record || "")}</small></span>
        <span class="mu-wc">${esc(f.weight_class || "")}${f.rounds ? ` · ${f.rounds} rounds` : ""}</span>
      </button></li>`).join("")}</ul></details>`).join("")}</div></section>`;
  }

  // ---------------------------------------------------------------- clicks
  function flash(el, text, ms) {
    el.dataset.orig ??= el.textContent;
    el.textContent = text;
    setTimeout(() => (el.textContent = el.dataset.orig), ms);
  }
  async function act(name, el) {
    if (name === "compare") go();
    else if (name === "swap") swap();
    else if (name === "top") window.scrollTo({ top: 0, behavior: "smooth" });
    else if (name === "all") { hist.all = true; renderHistory(); }
    else if (name === "menu") {
      const panel = el.nextElementSibling;
      panel.hidden = !panel.hidden;
      el.setAttribute("aria-expanded", String(!panel.hidden));
    } else if (name === "share") {
      const url = location.href;
      const title = [sel.a?.n, sel.b?.n].filter(Boolean).join(" vs ") || T.tabTitle;
      try {
        if (navigator.share) await navigator.share({ title, url });
        else { await navigator.clipboard.writeText(url); flash(el, T.copied, 2000); }
      } catch { /* user cancelled */ }
    } else if (name === "copyai") {
      if (!corners().length) { flash(el, "Pick a fighter first", 2500); return; }
      const ok = await copyText(aiText(corners()));
      flash(el, ok ? T.copiedAi : "Couldn't copy on this device", 3000);
    }
  }
  function follow(to, el, e) {
    if (to.startsWith("page:")) {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return; // a new tab: the link's address does it
      e.preventDefault();
      goPage(pageById(to.slice(5)) || DESIGN.pages[0]);
    } else if (to.startsWith("#")) {
      e.preventDefault();
      scrollToEl($(`[data-anchor="${CSS.escape(to.slice(1))}"]`));
    } else if (to.startsWith("action:")) {
      e.preventDefault();
      act(to.slice(7), el);
    }
  }
  document.addEventListener("click", (e) => {
    if (ED.editing || !DESIGN) return;
    const t = e.target.closest("[data-to],[data-act],[data-tab],[data-fight],.mu");
    if (!t?.closest(".menupanel,[data-act=menu]")) closeMenus();
    if (!t) return;
    if (t.matches(".brand") && !(e.metaKey || e.ctrlKey || e.shiftKey)) { // the logo starts over, on the home page
      e.preventDefault();
      setPick("a", null);
      setPick("b", null);
      goPage(pageById(t.dataset.to.slice(5)));
      compare();
    } else if (t.matches(".mu")) {
      setPick("a", byId.get(t.dataset.a) || { i: t.dataset.a, n: t.dataset.an });
      setPick("b", byId.get(t.dataset.b) || { i: t.dataset.b, n: t.dataset.bn });
      showResults("upcoming");
    } else if (t.dataset.tab) {
      hist.corner = t.dataset.tab;
      hist.all = false;
      renderHistory();
    } else if (t.dataset.fight != null) {
      const box = t.closest('[data-role="history"]');
      const f = box._list[+t.dataset.fight];
      const body = t.nextElementSibling;
      const open = t.getAttribute("aria-expanded") === "true";
      if (!open && !body.innerHTML) body.innerHTML = fightStats(shown[hist.corner], f);
      body.hidden = open;
      t.setAttribute("aria-expanded", String(!open));
      $(".chev", t).textContent = chevText(f, !open);
    } else if (t.dataset.act) {
      act(t.dataset.act, t);
    } else if (t.dataset.to != null) {
      follow(t.dataset.to, t, e);
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.dataset.act === "ufconly") {
      hist.ufcOnly = e.target.checked;
      hist.touched = true;
      renderHistory();
    }
  });
  // a design draft's link opened in a tab already showing the site: load it
  const newDraft = () => /^#d=./.test(location.hash) && location.hash.slice(3) !== DRAFT;
  window.addEventListener("hashchange", () => { if (newDraft() && !PREVIEW) location.reload(); });
  window.addEventListener("popstate", () => {
    if (!DESIGN || newDraft()) return;
    const ids = idsFromURL();
    for (const c of ["a", "b"]) sel[c] = (ids[c] && byId.get(ids[c])) || null;
    PAGE = pageFromURL();
    drawPage();
    compare();
  });

  // sections that fade or slide in when they come into view
  let io = null;
  function appear() {
    const els = $$(".ap:not(.in)", MAIN);
    if (!els.length) return;
    if (!("IntersectionObserver" in window)) { els.forEach((x) => x.classList.add("in")); return; }
    io ||= new IntersectionObserver((es) => {
      for (const en of es) if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    }, { rootMargin: "0px 0px -6% 0px" });
    els.forEach((x) => io.observe(x));
  }

  // ------------------------------------------------- inside the design editor
  const EDIT_CSS = `
.editing .blk { position: relative; cursor: pointer; min-height: 10px; }
.editing .blk > * { pointer-events: none; }
.editing .blk:hover { outline: 2px dashed #a78bfa; outline-offset: 3px; }
.editing .blk.is-sel { outline: 3px solid #7c3aed; outline-offset: 3px; }
.editing .blk.is-hidden { opacity: .38; }
.editing .blk:hover::after, .editing .blk.is-sel::after { content: attr(data-label); position: absolute; left: 4px; top: -13px; z-index: 6;
  background: #7c3aed; color: #fff; font: 700 12px/1 system-ui, sans-serif; padding: 4px 8px; border-radius: 6px; white-space: nowrap; pointer-events: none; }
.editing .top, .editing .foot, .editing .navbottom { cursor: pointer; }
.editing .top *, .editing .foot *, .editing .navbottom * { pointer-events: none; }
.editing .top:hover, .editing .foot:hover, .editing .navbottom:hover { outline: 2px dashed #a78bfa; outline-offset: -3px; }
.ph { border: 2px dashed var(--border); border-radius: var(--radius); padding: 18px; text-align: center; color: var(--muted); margin: 0 0 var(--gap); font: 600 .9rem/1.4 system-ui, sans-serif; }
#edtools { position: absolute; z-index: 60; display: flex; gap: 4px; }
#edtools button { width: 32px; height: 28px; border: 0; border-radius: 6px; background: #7c3aed; color: #fff; font: 700 14px/1 system-ui, sans-serif; cursor: pointer; }
#edtools button:hover { background: #5b21b6; }`;
  function markSelected() {
    for (const el of $$(".blk.is-sel")) el.classList.remove("is-sel");
    $(`.blk[data-bid="${ED.sel}"]`, MAIN)?.classList.add("is-sel");
    placeTools();
  }
  // the selected section's buttons (move up, move down, copy, hide, delete), over its top right corner
  function placeTools() {
    let bar = $("#edtools");
    const el = ED.editing && ED.sel && $(`.blk[data-bid="${ED.sel}"]`, MAIN);
    if (!el || !el.getClientRects().length) { bar?.remove(); return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "edtools";
      bar.innerHTML = [["up", "↑", "Move up"], ["down", "↓", "Move down"], ["copy", "⧉", "Make a copy"], ["hide", "◐", "Hide or show"], ["delete", "✕", "Delete"]]
        .map(([k, s, t]) => `<button type="button" data-tool="${k}" title="${t}">${s}</button>`).join("");
      document.body.append(bar);
    }
    const r = el.getBoundingClientRect();
    bar.style.top = `${Math.max(0, r.top + scrollY - 14)}px`;
    bar.style.left = `${Math.max(0, r.right + scrollX - bar.offsetWidth)}px`;
  }
  function pickSample() {
    const f = UPCOMING[0]?.fights?.[0];
    if (!f || sel.a || sel.b) return;
    setPick("a", byId.get(f.a.id) || { i: f.a.id, n: f.a.name });
    setPick("b", byId.get(f.b.id) || { i: f.b.id, n: f.b.name });
    ED.sampled = true;
    compare();
  }
  function startPreview() {
    document.head.append(Object.assign(document.createElement("style"), { textContent: EDIT_CSS }));
    // while editing, a click picks what to change instead of doing what it does on the site
    document.addEventListener("click", (e) => {
      if (!ED.editing) return;
      e.preventDefault();
      e.stopPropagation();
      const tool = e.target.closest("#edtools button");
      const blk = e.target.closest(".blk");
      if (tool) post({ t: "tool", act: tool.dataset.tool, bid: ED.sel });
      else if (blk) {
        ED.sel = blk.dataset.bid;
        markSelected();
        post({ t: "select", bid: ED.sel });
      } else if (e.target.closest(".top,.navbottom")) post({ t: "select", part: "header" });
      else if (e.target.closest(".foot")) post({ t: "select", part: "footer" });
      else post({ t: "select", part: "page" });
    }, true);
    window.addEventListener("resize", placeTools);
    if ("ResizeObserver" in window) new ResizeObserver(placeTools).observe(MAIN);
    window.addEventListener("message", (e) => {
      if (e.origin !== location.origin || e.source !== window.parent) return;
      const m = e.data || {};
      if (m.t === "design") {
        ED.editing = !!m.editing;
        ED.look = m.look || "";
        ED.sel = m.sel || null;
        document.documentElement.classList.toggle("editing", ED.editing);
        setDesign(D.sanitize(m.design), m.page);
        if (m.scroll && ED.sel) scrollToEl($(`.blk[data-bid="${ED.sel}"]`, MAIN), "center");
        if (!!m.sample !== ED.sample) {
          ED.sample = !!m.sample;
          if (ED.sample && LOADED) pickSample();
          if (!ED.sample && ED.sampled) {
            ED.sampled = false;
            setPick("a", null);
            setPick("b", null);
            compare();
          }
        }
      } else if (m.t === "select") {
        ED.sel = m.bid;
        markSelected();
        if (m.scroll) scrollToEl($(`.blk[data-bid="${m.bid}"]`, MAIN), "center");
      }
    });
    post({ t: "ready" });
  }

  // ------------------------------------------------------------------- boot
  async function boot() {
    $("#plain")?.remove(); // that page's plain-text copy of the comparison, for tools that don't run scripts
    for (const l of $$("link[href]")) l.setAttribute("href", l.href); // the tab icon is looked up again after the address changes
    if (PREVIEW) startPreview();
    else {
      // a design draft from the design editor's share link, else the site's design, else the original look
      let d = null;
      const m = location.hash.match(/^#d=([zj][A-Za-z0-9_-]{4,})$/);
      if (m) {
        d = await D.decode(m[1]);
        if (d) DRAFT = m[1];
      }
      const tag = $("#design-data");
      if (!d && tag) {
        try { d = D.sanitize(JSON.parse(tag.textContent)); } catch { d = null; }
      }
      setDesign(d || D.sanitize(D.DEFAULT));
      if (DRAFT) {
        const bar = document.createElement("div");
        bar.className = "draftbar";
        bar.innerHTML = `<b>Design draft:</b> only a preview, the real site hasn't changed. <a href="${ROOT}edit.html#d=${DRAFT}">Edit this design</a> · <a href="${ROOT}">See the real site</a>`;
        document.body.prepend(bar);
      }
    }
    try {
      const [idx, meta, up] = await Promise.all([
        getJSON("index.json"),
        getJSON("meta.json").catch(() => null),
        getJSON("upcoming.json").catch(() => []),
      ]);
      INDEX = idx;
      prepIndex();
      UPDATED = meta?.updated || null;
      UPCOMING = up || [];
      for (const f of UPCOMING.flatMap((ev) => ev.fights)) readable.add(`${f.a.id}-${f.b.id}`).add(`${f.b.id}-${f.a.id}`);
      LOADED = true;
      status = "hint";
      const ids = idsFromURL();
      for (const c of ["a", "b"]) if (ids[c] && byId.has(ids[c])) sel[c] = byId.get(ids[c]); // a fight's own page names its two fighters
      if (DESIGN) {
        drawChrome();
        drawPage();
      }
      if (sel.a || sel.b) compare();
      else if (ED.sample) pickSample();
    } catch (e) {
      status = "bootfail";
      drawData();
    }
  }
  boot();
})();
