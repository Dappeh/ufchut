"use strict";
/* UFC HUT's design: what the site looks like and how it is laid out (pages, sections, colours,
   fonts, wording, where buttons go). The site (app.js) draws itself from a design and the design
   editor (edit.html) changes one. A design is plain data that can arrive in a link from anyone, so
   everything taken from it goes through sanitize() first and is only ever used as text, a colour,
   a number, a picture or one of a few known choices. */
(function (G) {
  // ------------------------------------------------------------------ fonts
  // Free (SIL Open Font License) fonts kept on the site itself, in fonts/<id>/, so nothing loads from
  // another website. [name, weights kept, has the accented-letters file]
  const HOSTED = {
    inter: ["Inter", [400, 700, 800], true], roboto: ["Roboto", [400, 700, 800], true],
    montserrat: ["Montserrat", [400, 700, 800], true], poppins: ["Poppins", [400, 700, 800], true],
    oswald: ["Oswald", [400, 700], true], "bebas-neue": ["Bebas Neue", [400], true], anton: ["Anton", [400], true],
    "barlow-condensed": ["Barlow Condensed", [400, 700, 800], true], teko: ["Teko", [400, 700], true],
    rubik: ["Rubik", [400, 700, 800], true], lato: ["Lato", [400, 700, 900], true],
    "open-sans": ["Open Sans", [400, 700, 800], true], "playfair-display": ["Playfair Display", [400, 700, 800], true],
    merriweather: ["Merriweather", [400, 700, 800], true], "space-grotesk": ["Space Grotesk", [400, 700], true],
    "archivo-black": ["Archivo Black", [400], true], "russo-one": ["Russo One", [400], true],
    "black-ops-one": ["Black Ops One", [400], true], "permanent-marker": ["Permanent Marker", [400], false],
    "exo-2": ["Exo 2", [400, 700, 800], true], kanit: ["Kanit", [400, 700, 800], true],
  };
  const SERIF = new Set(["playfair-display", "merriweather"]);
  const RANGE = {
    latin: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    "latin-ext": "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
  };
  const SYSTEM = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const FONTS = {
    system: { name: "Phone/computer's own (default)", stack: SYSTEM },
    helvetica: { name: "Helvetica / Arial", stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
    georgia: { name: "Georgia (classic serif)", stack: 'Georgia, "Times New Roman", serif' },
    mono: { name: "Typewriter (monospace)", stack: 'ui-monospace, Menlo, Consolas, "Courier New", monospace' },
  };
  for (const [id, [name]] of Object.entries(HOSTED)) {
    FONTS[id] = { name, stack: `"F-${id}", ${SERIF.has(id) ? "Georgia, serif" : id === "permanent-marker" ? "cursive" : SYSTEM}` };
  }

  // ----------------------------------------------------------------- colours
  // [key, label in the editor]. Every colour the site uses can be changed, separately for the light
  // and the dark look.
  const COLORS = [
    ["bg", "Page background"], ["surface", "Cards"], ["surface2", "Boxes inside cards"], ["text", "Text"],
    ["muted", "Soft text"], ["border", "Lines and borders"], ["red", "Red corner"], ["redSoft", "Red corner, light shade"],
    ["blue", "Blue corner"], ["blueSoft", "Blue corner, light shade"], ["accent", "Main buttons"],
    ["accentText", "Main button text"], ["link", "Links"], ["win", "Wins"], ["loss", "Losses"], ["draw", "Draws / no contests"],
    ["good", "Better stat (advantage)"], ["warn", "Warnings"], ["gold", "Title tags"], ["goldText", "Title tag text"],
    ["ko", "KO/TKO bar"], ["sub", "Submission bar"], ["dec", "Decision bar"], ["split1", "Strike chart 1 (head / distance)"],
    ["split2", "Strike chart 2 (body / clinch)"], ["split3", "Strike chart 3 (legs / ground)"],
    ["headerBg", "Top bar background"], ["headerText", "Top bar text"], ["footerText", "Bottom text"],
  ];
  const LIGHT = {
    bg: "#f4f5f7", surface: "#ffffff", surface2: "#f0f2f5", text: "#15171a", muted: "#5d6470", border: "#e2e5ea",
    red: "#c62828", redSoft: "#fdecec", blue: "#1b5fc1", blueSoft: "#e8f0fd", accent: "#c62828", accentText: "#ffffff",
    link: "#1b5fc1", win: "#1d8a3a", loss: "#c62828", draw: "#7d838d", good: "#1d8a3a", warn: "#9a5b00",
    gold: "#fff3c4", goldText: "#7a5a00", ko: "#e2553f", sub: "#8e5bd6", dec: "#3d8bd9",
    split1: "#d6452f", split2: "#e8a33d", split3: "#3d8bd9", headerBg: "#ffffff", headerText: "#15171a", footerText: "#5d6470",
  };
  const DARK = {
    bg: "#0e1014", surface: "#171a20", surface2: "#1f232b", text: "#eef0f3", muted: "#a3aab5", border: "#2b3039",
    red: "#ff6161", redSoft: "#3a1c1f", blue: "#67a3ff", blueSoft: "#18263d", accent: "#ff6161", accentText: "#ffffff",
    link: "#67a3ff", win: "#45d071", loss: "#ff6b6b", draw: "#9aa1ab", good: "#45d071", warn: "#f0b45a",
    gold: "#3b3214", goldText: "#f3d36b", ko: "#e2553f", sub: "#8e5bd6", dec: "#3d8bd9",
    split1: "#ff7a63", split2: "#f2c25b", split3: "#6aa9f0", headerBg: "#171a20", headerText: "#eef0f3", footerText: "#a3aab5",
  };

  // -------------------------------------------------------- tables' rows
  // Rows of the tale of the tape and of the career stats, in their usual order (their names are
  // also their keys). A design can hide, rename and reorder them.
  const TAPE_ROWS = ["Age", "Country", "Pro MMA record", "UFC record", "UFC opponent combined record",
    "Total pro MMA opponent combined record", "Height", "Reach", "Leg reach", "Stance", "Style",
    "Weight class", "Gym", "Fighting out of", "Coaches", "Belts & ranks"];
  const STAT_ROWS = ["Sig. strikes landed / min", "Striking accuracy", "Sig. strikes absorbed / min", "Striking defence",
    "Takedown avg (per 15 min)", "Takedown accuracy", "Takedown defence", "Submission avg (per 15 min)",
    "Knockdown avg (per 15 min)", "Control time (per 15 min)"];
  const LAST3_ROWS = ["Record in last 3 fights", "Last 3 opponents' combined record"];
  const FORM_FACTS = [["last5", "Last 5 fights"], ["streak", "Win or losing streak"], ["wins", "Wins and how"],
    ["losses", "Losses and how"], ["finish", "Finish rate"], ["avg", "Average fight time"], ["titles", "UFC title fights"],
    ["last", "Last fought"], ["debut", "UFC debut"]];

  // ----------------------------------------------------------------- sections
  // Section types: [label, group, default title (null: none), default settings]. "data" sections
  // show the chosen fighters; "site" ones are the site's own; "own" ones are whatever she makes.
  const BLOCKS = {
    search: ["Fighter search", "site", null, { labels: true, swap: true }],
    heads: ["Fighters' names & photos", "data", null, { nick: true, tags: true, next: true }],
    share: ["Share & Copy for AI buttons", "data", null, { share: true, copyai: true }],
    tape: ["Tale of the tape", "data", "Tale of the tape", { rows: null, stats: true, strikes: true }],
    stats: ["Career stats", "data", "Career stats", { rows: null, last3: false }],
    strikes: ["Strike breakdown", "data", "Strike breakdown", { last3: false }],
    last3: ["Last 3 fights: records", "data", "Last 3 fights", { rows: null }],
    form: ["Form & finishing", "data", "Form & finishing", { facts: null }],
    met: ["They've fought before", "data", "They've fought before", {}],
    common: ["Common opponents", "data", "Common opponents", {}],
    history: ["Every pro fight", "data", "Every pro fight", { limit: 15, filter: true, ufcOnly: false }],
    upcoming: ["Upcoming fights", "site", "Upcoming fights", { sub: "tap a fight to compare", open: 1, perRow: 2 }],
    helpStats: ["What do the stats mean?", "site", "What do the stats mean?", { open: false }],
    helpHome: ["Add to home screen help", "site", "Put this on your phone's home screen", { open: false }],
    heading: ["Heading", "own", null, { text: "Your heading", size: "l" }],
    text: ["Text", "own", null, { text: "Write something here. Put **two stars** around words to make them bold." }],
    image: ["Picture", "own", null, { src: "", alt: "", width: 100, caption: "", to: "", fit: "natural", height: 300 }],
    gallery: ["Picture gallery", "own", null, { items: [], perRow: 3, height: 220 }],
    buttons: ["Buttons", "own", null, { items: [{ label: "Button", to: "", look: "main" }], full: false, size: "normal" }],
    banner: ["Banner", "own", null, { title: "Big title", sub: "A line underneath", image: "", height: 260, dim: 40,
      btn: "", to: "", textColor: "#ffffff", bg2: "" }],
    video: ["Video (YouTube or Vimeo)", "own", null, { url: "", ratio: "16:9" }],
    divider: ["Line", "own", null, { look: "line", thick: 1, color: "" }],
    spacer: ["Empty space", "own", null, { h: 32 }],
  };
  const DEFAULT_TITLES = Object.fromEntries(Object.entries(BLOCKS).map(([k, v]) => [k, v[2]]));
  // the site's own sections: at most one of each per page
  const SINGLE = new Set(Object.keys(BLOCKS).filter((k) => BLOCKS[k][1] !== "own"));

  // Words used around the site, each can be changed. [key, label in the editor, default]
  const TEXTS = [
    ["brand", "Site name (top left)", "UFC HUT"],
    ["tabTitle", "Browser tab title", "UFC HUT"],
    ["red", "Red corner label", "Red corner"],
    ["blue", "Blue corner label", "Blue corner"],
    ["placeholder", "Search box hint", "Type a fighter's name…"],
    ["compare", "Compare button", "Compare"],
    ["swap", "Swap button", "⇄ Swap"],
    ["vs", "VS between the boxes", "VS"],
    ["hint", "Message before any fighter is picked", "Type two fighters' names above, or tap one of the upcoming fights below."],
    ["boot", "While the site starts", "Loading fighters…"],
    ["loading", "While a fighter loads", "Loading…"],
    ["share", "Share button", "Share this comparison"],
    ["copied", "After the link is copied", "Link copied!"],
    ["copyai", "Copy for AI button", "Copy for AI"],
    ["copiedAi", "After Copy for AI", "Copied! Paste it into your AI app"],
    ["pickOther", "Asks for the second fighter", "Pick a {corner} fighter above to compare."],
    ["nextFight", "Next fight label", "{name}'s next fight:"],
    ["ufcOnly", "Fight history filter", "UFC fights only"],
    ["showAll", "Show all fights button", "Show all {n} fights"],
    ["historySub", "Fight history note", "{n} fights · tap a fight for stats"],
    ["noCommon", "No common opponents", "These two haven't fought any of the same people."],
    ["statsSec", "Career stats heading (inside the tale of the tape)", "Career stats"],
    ["strikesSec", "Strike breakdown heading (inside the tale of the tape)", "Strike breakdown"],
    ["liveNow", "Tag on a card that's happening now", "Live now"],
    ["updated", "Last update (top right)", "Updated {ago}"],
    ["menu", "Menu button (when the menu is a button)", "Menu"],
    ["footer", "Bottom of the page", "Refreshed automatically every day. Not affiliated with the UFC."],
  ];
  const TEXT_DEFAULTS = Object.fromEntries(TEXTS.map(([k, , v]) => [k, v]));

  // ------------------------------------------------------------- the design
  let n = 0;
  const bid = () => `b${Date.now().toString(36)}${(n++).toString(36)}`;
  const block = (type, col = 0, extra = {}) => ({ id: extra.id || bid(), type, col, hidden: false, title: null,
    showTitle: true, s: {}, p: JSON.parse(JSON.stringify(BLOCKS[type][3])), ...extra });

  // The site exactly as it was before the editor existed.
  const DEFAULT = {
    v: 1,
    look: "auto",
    colors: { light: { ...LIGHT }, dark: { ...DARK } },
    font: { body: "system", heading: "system", brand: "system", size: 17, hscale: 100, hweight: 700, hcase: false,
      hspace: 0, lh: 145 },
    shape: { radius: 14, btn: 12, input: 12, photo: "circle", photoSize: 76, photoBorder: 3 },
    space: { width: 1800, side: 32, pad: 16, gap: 16, colgap: 20, wide: 1200 },
    cards: { style: "filled", shadow: "soft", border: 1 },
    buttons: { style: "filled", size: "normal", caps: false },
    header: { style: "plain", sticky: true, logo: "", logoSize: 32, showLogo: true, showName: true, showUpdated: true,
      height: 56, menu: "links", menuAlign: "right" },
    footer: { show: true, align: "center", bg: "", color: "" },
    background: { type: "color", color2: "#1b5fc1", angle: 180, image: "", fit: "cover", dim: 0, fixed: false },
    effects: { lift: false, appear: "none" },
    texts: { ...TEXT_DEFAULTS },
    links: { compare: "", upcoming: "", logo: "", extra: [] },
    pages: [{
      id: "home", name: "Home", tab: "", menu: true, cols: 2, split: 50, bg: "",
      blocks: [
        block("search", 0, { id: "search" }), block("heads", 0, { id: "heads" }), block("share", 0, { id: "share" }),
        block("tape", 1, { id: "tape" }), block("form", 2, { id: "form" }), block("met", 2, { id: "met" }),
        block("common", 2, { id: "common" }), block("history", 2, { id: "history" }),
        block("upcoming", 0, { id: "upcoming" }), block("helpStats", 0, { id: "helpStats" }),
        block("helpHome", 0, { id: "helpHome" }),
      ],
    }],
  };

  // New pages from the editor's "Add a page" choices.
  const PAGE_TEMPLATES = {
    blank: ["Blank page", () => []],
    compare: ["Comparison page", () => [block("search"), block("heads"), block("share"), block("tape", 1),
      block("form", 2), block("met", 2), block("common", 2), block("history", 2)]],
    upcoming: ["Upcoming fights page", () => [block("upcoming")]],
    history: ["Fight history page", () => [block("heads"), block("history")]],
    stats: ["Stats page", () => [block("heads"), block("stats"), block("strikes"), block("form")]],
    last3: ["Last 3 fights page", () => [block("search"), block("heads"), block("last3"),
      block("stats", 0, { title: "Career stats: last 3 fights", p: { rows: null, last3: true } }),
      block("strikes", 0, { title: "Strike breakdown: last 3 fights", p: { last3: true } })]],
    about: ["About / info page", () => [block("banner"), block("text"), block("helpStats"), block("helpHome")]],
  };

  // Ready-made looks (colours, fonts, shapes): a starting point she can change further.
  const mix = (base, over) => ({ ...base, ...over });
  const PRESETS = {
    classic: { name: "UFC HUT classic", look: "auto", colors: { light: LIGHT, dark: DARK },
      font: { body: "system", heading: "system", brand: "system", hcase: false, hweight: 800 },
      shape: { radius: 14, btn: 12, input: 12 }, cards: { style: "filled", shadow: "soft" }, header: { style: "plain" } },
    octagon: { name: "Octagon night", look: "dark",
      colors: { light: mix(LIGHT, { accent: "#b8860b", link: "#8a6508", gold: "#f6e7b0", goldText: "#6b4e00" }),
        dark: mix(DARK, { bg: "#08090b", surface: "#121316", surface2: "#1b1d22", border: "#2a2c31", accent: "#d4af37",
          accentText: "#111111", link: "#e6c35c", headerBg: "#000000", headerText: "#f5f1e3", gold: "#d4af37", goldText: "#111111" }) },
      font: { body: "inter", heading: "oswald", brand: "oswald", hcase: true, hweight: 700 },
      shape: { radius: 6, btn: 4, input: 6 }, cards: { style: "filled", shadow: "none" }, header: { style: "plain" } },
    poster: { name: "Fight poster", look: "dark",
      colors: { light: mix(LIGHT, { accent: "#d90429", red: "#d90429", headerBg: "#d90429", headerText: "#ffffff" }),
        dark: mix(DARK, { bg: "#111111", surface: "#1a1a1a", surface2: "#242424", border: "#333333", red: "#ff2d3d",
          accent: "#ff2d3d", headerBg: "#ff2d3d", headerText: "#ffffff", blue: "#4d8dff" }) },
      font: { body: "barlow-condensed", heading: "bebas-neue", brand: "anton", hcase: true, hweight: 400, size: 18, hscale: 130 },
      shape: { radius: 0, btn: 0, input: 0, photo: "square" }, cards: { style: "filled", shadow: "none" }, header: { style: "plain" } },
    clean: { name: "Clean white", look: "light",
      colors: { light: mix(LIGHT, { bg: "#ffffff", surface: "#ffffff", surface2: "#f6f7f9", border: "#e6e8ec",
        accent: "#1b5fc1", headerBg: "#ffffff" }), dark: DARK },
      font: { body: "inter", heading: "inter", brand: "inter", hcase: false, hweight: 700 },
      shape: { radius: 10, btn: 10, input: 10 }, cards: { style: "outline", shadow: "none" }, header: { style: "plain" } },
    neon: { name: "Neon", look: "dark",
      colors: { light: mix(LIGHT, { red: "#e0007a", blue: "#0077cc", accent: "#e0007a" }),
        dark: mix(DARK, { bg: "#0a0620", surface: "#140d33", surface2: "#1e1546", border: "#34286b", text: "#f3f0ff",
          muted: "#b4aadb", red: "#ff2e97", redSoft: "#3b0f2c", blue: "#2ee6ff", blueSoft: "#0d2f45", accent: "#ff2e97",
          link: "#2ee6ff", good: "#3dff9a", win: "#3dff9a", headerBg: "#0a0620", headerText: "#f3f0ff" }) },
      font: { body: "exo-2", heading: "russo-one", brand: "russo-one", hcase: false, hweight: 400 },
      shape: { radius: 16, btn: 999, input: 12 }, cards: { style: "glass", shadow: "strong" }, header: { style: "plain" } },
    gold: { name: "Championship gold", look: "light",
      colors: { light: mix(LIGHT, { bg: "#f7f3ea", surface: "#fffdf8", surface2: "#f3ecdc", border: "#e5dcc6",
        text: "#221d12", muted: "#6c6250", accent: "#a67c00", link: "#7a5c00", headerBg: "#221d12", headerText: "#f2d572" }),
        dark: mix(DARK, { accent: "#d4af37", accentText: "#111111" }) },
      font: { body: "lato", heading: "playfair-display", brand: "playfair-display", hcase: false, hweight: 700 },
      shape: { radius: 12, btn: 999, input: 12 }, cards: { style: "filled", shadow: "soft" }, header: { style: "plain" } },
    minimal: { name: "Minimal", look: "light",
      colors: { light: mix(LIGHT, { bg: "#fafafa", surface: "#fafafa", surface2: "#f0f0f0", border: "#dddddd",
        accent: "#111111", link: "#111111", headerBg: "#fafafa" }), dark: mix(DARK, { accent: "#f5f5f5", accentText: "#111111" }) },
      font: { body: "space-grotesk", heading: "space-grotesk", brand: "space-grotesk", hcase: false, hweight: 700 },
      shape: { radius: 0, btn: 0, input: 0 }, cards: { style: "flat", shadow: "none" }, header: { style: "plain" } },
    sporty: { name: "Sporty", look: "light",
      colors: { light: mix(LIGHT, { accent: "#e10600", red: "#e10600", headerBg: "#15171a", headerText: "#ffffff" }), dark: DARK },
      font: { body: "rubik", heading: "kanit", brand: "kanit", hcase: true, hweight: 800 },
      shape: { radius: 8, btn: 8, input: 8 }, cards: { style: "filled", shadow: "strong" }, header: { style: "plain" } },
  };
  function applyPreset(d, key) {
    const p = PRESETS[key];
    if (!p) return d;
    d.look = p.look;
    d.colors = { light: { ...LIGHT, ...p.colors.light }, dark: { ...DARK, ...p.colors.dark } };
    Object.assign(d.font, p.font);
    Object.assign(d.shape, p.shape);
    Object.assign(d.cards, p.cards);
    Object.assign(d.header, p.header);
    return d;
  }

  // --------------------------------------------------------------- checking
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
  const color = (v, dflt) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : dflt);
  const optColor = (v) => color(v, "");
  const numIn = (v, lo, hi, dflt) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt);
  const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);
  const bool = (v, dflt) => (typeof v === "boolean" ? v : dflt);
  const str = (v, dflt, max = 400) => (typeof v === "string" ? v.slice(0, max) : dflt);
  const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
  // pictures: uploaded (kept in the design) or, once put live, a file on the site
  const image = (v) => (typeof v === "string" && (
    (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length < 4e6)
    || /^media\/[a-z0-9-]{1,64}\.(png|jpe?g|webp|gif)$/.test(v)) ? v : "");
  // where a button or link goes: one of her pages, a section on the page, a web address or a site action
  const ACTIONS = ["compare", "swap", "share", "copyai", "top"];
  function target(v) {
    if (typeof v !== "string" || !v) return "";
    if (/^page:[a-z0-9][a-z0-9-]{0,39}$/.test(v)) return v;
    if (/^#[a-z0-9][a-z0-9-]{0,39}$/.test(v)) return v;
    if (/^action:[a-z]+$/.test(v) && ACTIONS.includes(v.slice(7))) return v;
    if (/^(https?:\/\/|mailto:)[^\s"'<>\\]{1,500}$/i.test(v)) return v;
    return "";
  }
  const youtube = (v) => {
    const m = typeof v === "string" && v.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : "";
  };
  const vimeo = (v) => {
    const m = typeof v === "string" && v.match(/vimeo\.com\/(?:video\/)?(\d{4,12})/);
    return m ? m[1] : "";
  };
  // the address a video is played from, made here from its number only
  const videoSrc = (v) => (youtube(v) ? `https://www.youtube-nocookie.com/embed/${youtube(v)}`
    : vimeo(v) ? `https://player.vimeo.com/video/${vimeo(v)}` : "");

  function cleanRows(v, all) {
    if (!Array.isArray(v)) return null;
    const seen = new Set();
    const out = [];
    for (const r of v) {
      if (!isObj(r) || !all.includes(r.k) || seen.has(r.k)) continue;
      seen.add(r.k);
      out.push({ k: r.k, show: bool(r.show, true), label: str(r.label, "", 80) });
    }
    for (const k of all) if (!seen.has(k)) out.push({ k, show: true, label: "" });
    return out;
  }

  function cleanBlock(b, ids) {
    if (!isObj(b) || !BLOCKS[b.type]) return null;
    const def = BLOCKS[b.type][3];
    let id = typeof b.id === "string" && /^[a-zA-Z0-9]{1,40}$/.test(b.id) && !ids.has(b.id) ? b.id : bid();
    ids.add(id);
    const s = isObj(b.s) ? b.s : {};
    const p = isObj(b.p) ? b.p : {};
    const out = {
      id, type: b.type, col: numIn(b.col, 0, 3, 0), hidden: bool(b.hidden, false),
      title: typeof b.title === "string" ? b.title.slice(0, 120) : null, showTitle: bool(b.showTitle, true),
      s: {
        bg: optColor(s.bg), text: optColor(s.text), title: optColor(s.title), borderColor: optColor(s.borderColor),
        border: pick(s.border, ["", "none", "line", "thick"], ""), radius: s.radius == null ? null : numIn(s.radius, 0, 60, null),
        shadow: pick(s.shadow, ["", "none", "soft", "strong"], ""), pad: s.pad == null ? null : numIn(s.pad, 0, 80, null),
        space: s.space == null ? null : numIn(s.space, 0, 120, null), align: pick(s.align, ["", "left", "center", "right"], ""),
        width: pick(s.width, ["", "narrow", "medium", "edge"], ""), on: pick(s.on, ["all", "phone", "computer"], "all"),
        appear: pick(s.appear, ["", "none", "fade", "rise", "zoom"], ""), anchor: typeof s.anchor === "string" && ID.test(s.anchor) ? s.anchor : "",
        image: image(s.image), dim: numIn(s.dim, 0, 90, 0), box: pick(s.box, ["", "card", "plain"], ""),
      },
      p: {},
    };
    const P = out.p;
    switch (b.type) {
      case "search": P.labels = bool(p.labels, true); P.swap = bool(p.swap, true); break;
      case "heads": for (const k of ["nick", "tags", "next"]) P[k] = bool(p[k], true); break;
      case "share": P.share = bool(p.share, true); P.copyai = bool(p.copyai, true); break;
      case "tape": P.rows = cleanRows(p.rows, TAPE_ROWS); P.statRows = cleanRows(p.statRows, STAT_ROWS);
        P.stats = bool(p.stats, true); P.strikes = bool(p.strikes, true); break;
      case "stats": P.rows = cleanRows(p.rows, STAT_ROWS); P.last3 = bool(p.last3, false); break;
      case "strikes": P.last3 = bool(p.last3, false); break;
      case "last3": P.rows = cleanRows(p.rows, LAST3_ROWS); break;
      case "form": P.facts = Array.isArray(p.facts) ? p.facts.filter((k) => FORM_FACTS.some(([f]) => f === k)) : null; break;
      case "history": P.limit = numIn(p.limit, 3, 200, 15); P.filter = bool(p.filter, true); P.ufcOnly = bool(p.ufcOnly, false); break;
      case "upcoming": P.sub = str(p.sub, def.sub, 120); P.open = numIn(p.open, 0, 20, 1); P.perRow = numIn(p.perRow, 1, 3, 2); break;
      case "helpStats": case "helpHome": P.open = bool(p.open, false); break;
      case "heading": P.text = str(p.text, def.text, 200); P.size = pick(p.size, ["s", "m", "l", "xl", "xxl"], "l"); break;
      case "text": P.text = str(p.text, def.text, 5000); P.size = pick(p.size, ["s", "m", "l"], "m"); break;
      case "image": P.src = image(p.src); P.alt = str(p.alt, "", 200); P.width = numIn(p.width, 10, 100, 100);
        P.caption = str(p.caption, "", 300); P.to = target(p.to); P.fit = pick(p.fit, ["natural", "cover"], "natural");
        P.height = numIn(p.height, 60, 1200, 300); P.newTab = bool(p.newTab, false); break;
      case "gallery":
        P.items = (Array.isArray(p.items) ? p.items : []).slice(0, 24).filter(isObj)
          .map((it) => ({ src: image(it.src), caption: str(it.caption, "", 200), to: target(it.to) })).filter((it) => it.src);
        P.perRow = numIn(p.perRow, 1, 6, 3); P.height = numIn(p.height, 60, 800, 220); break;
      case "buttons":
        P.items = (Array.isArray(p.items) ? p.items : []).slice(0, 12).filter(isObj).map((it) => ({
          label: str(it.label, "Button", 80), to: target(it.to), look: pick(it.look, ["main", "plain", "outline", "red", "blue"], "main"),
          newTab: bool(it.newTab, false) }));
        P.full = bool(p.full, false); P.size = pick(p.size, ["small", "normal", "large"], "normal"); break;
      case "banner": P.title = str(p.title, "", 200); P.sub = str(p.sub, "", 400); P.image = image(p.image);
        P.height = numIn(p.height, 80, 900, 260); P.dim = numIn(p.dim, 0, 90, 40); P.btn = str(p.btn, "", 80);
        P.to = target(p.to); P.textColor = color(p.textColor, "#ffffff"); P.bg2 = optColor(p.bg2); break;
      case "video": P.url = videoSrc(p.url) ? str(p.url, "", 300) : ""; P.ratio = pick(p.ratio, ["16:9", "9:16", "4:3", "1:1"], "16:9"); break;
      case "divider": P.look = pick(p.look, ["line", "dashed", "dotted", "double"], "line"); P.thick = numIn(p.thick, 1, 12, 1);
        P.color = optColor(p.color); break;
      case "spacer": P.h = numIn(p.h, 4, 400, 32); break;
      default: break;
    }
    return out;
  }

  function sanitize(x) {
    const d = clone(DEFAULT);
    if (!isObj(x)) return d;
    d.look = pick(x.look, ["auto", "light", "dark"], d.look);
    for (const lk of ["light", "dark"]) {
      const c = isObj(x.colors) && isObj(x.colors[lk]) ? x.colors[lk] : {};
      for (const [k] of COLORS) d.colors[lk][k] = color(c[k], d.colors[lk][k]);
    }
    const f = isObj(x.font) ? x.font : {};
    for (const k of ["body", "heading", "brand"]) d.font[k] = FONTS[f[k]] ? f[k] : d.font[k];
    d.font.size = numIn(f.size, 12, 26, d.font.size);
    d.font.hscale = numIn(f.hscale, 60, 250, d.font.hscale);
    d.font.hweight = pick(f.hweight, [400, 500, 600, 700, 800, 900], d.font.hweight);
    d.font.hcase = bool(f.hcase, d.font.hcase);
    d.font.hspace = numIn(f.hspace, -5, 30, d.font.hspace);
    d.font.lh = numIn(f.lh, 100, 220, d.font.lh);
    const sh = isObj(x.shape) ? x.shape : {};
    d.shape.radius = numIn(sh.radius, 0, 60, d.shape.radius);
    d.shape.btn = numIn(sh.btn, 0, 999, d.shape.btn);
    d.shape.input = numIn(sh.input, 0, 60, d.shape.input);
    d.shape.photo = pick(sh.photo, ["circle", "rounded", "square"], d.shape.photo);
    d.shape.photoSize = numIn(sh.photoSize, 32, 200, d.shape.photoSize);
    d.shape.photoBorder = numIn(sh.photoBorder, 0, 12, d.shape.photoBorder);
    const sp = isObj(x.space) ? x.space : {};
    d.space.width = numIn(sp.width, 600, 4000, d.space.width);
    d.space.side = numIn(sp.side, 0, 160, d.space.side);
    d.space.pad = numIn(sp.pad, 4, 64, d.space.pad);
    d.space.gap = numIn(sp.gap, 0, 80, d.space.gap);
    d.space.colgap = numIn(sp.colgap, 0, 80, d.space.colgap);
    d.space.wide = numIn(sp.wide, 700, 2000, d.space.wide);
    const cd = isObj(x.cards) ? x.cards : {};
    d.cards.style = pick(cd.style, ["filled", "outline", "flat", "glass"], d.cards.style);
    d.cards.shadow = pick(cd.shadow, ["none", "soft", "strong"], d.cards.shadow);
    d.cards.border = numIn(cd.border, 0, 6, d.cards.border);
    const bt = isObj(x.buttons) ? x.buttons : {};
    d.buttons.style = pick(bt.style, ["filled", "outline", "soft"], d.buttons.style);
    d.buttons.size = pick(bt.size, ["small", "normal", "large"], d.buttons.size);
    d.buttons.caps = bool(bt.caps, d.buttons.caps);
    const h = isObj(x.header) ? x.header : {};
    d.header.style = pick(h.style, ["plain", "accent", "clear"], d.header.style);
    d.header.sticky = bool(h.sticky, d.header.sticky);
    d.header.logo = image(h.logo);
    d.header.logoSize = numIn(h.logoSize, 16, 120, d.header.logoSize);
    for (const k of ["showLogo", "showName", "showUpdated"]) d.header[k] = bool(h[k], d.header[k]);
    d.header.height = numIn(h.height, 40, 160, d.header.height);
    d.header.menu = pick(h.menu, ["links", "tabs", "bottom", "button", "none"], d.header.menu);
    d.header.menuAlign = pick(h.menuAlign, ["left", "center", "right"], d.header.menuAlign);
    const ft = isObj(x.footer) ? x.footer : {};
    d.footer.show = bool(ft.show, d.footer.show);
    d.footer.align = pick(ft.align, ["left", "center", "right"], d.footer.align);
    d.footer.bg = optColor(ft.bg);
    d.footer.color = optColor(ft.color);
    const bg = isObj(x.background) ? x.background : {};
    d.background.type = pick(bg.type, ["color", "gradient", "image"], d.background.type);
    d.background.color2 = color(bg.color2, d.background.color2);
    d.background.angle = numIn(bg.angle, 0, 360, d.background.angle);
    d.background.image = image(bg.image);
    d.background.fit = pick(bg.fit, ["cover", "tile"], d.background.fit);
    d.background.dim = numIn(bg.dim, 0, 90, d.background.dim);
    d.background.fixed = bool(bg.fixed, d.background.fixed);
    const ef = isObj(x.effects) ? x.effects : {};
    d.effects.lift = bool(ef.lift, d.effects.lift);
    d.effects.appear = pick(ef.appear, ["none", "fade", "rise", "zoom"], d.effects.appear);
    const t = isObj(x.texts) ? x.texts : {};
    for (const [k, , dflt] of TEXTS) d.texts[k] = str(t[k], dflt, k === "hint" || k === "footer" ? 600 : 200);
    // pages
    if (Array.isArray(x.pages) && x.pages.length) {
      const ids = new Set();
      const bids = new Set();
      d.pages = [];
      for (const pg of x.pages.slice(0, 40)) {
        if (!isObj(pg)) continue;
        let id = typeof pg.id === "string" && ID.test(pg.id) ? pg.id : `page-${d.pages.length + 1}`;
        while (ids.has(id)) id = `${id}-2`.slice(0, 40);
        ids.add(id);
        d.pages.push({
          id, name: str(pg.name, "Page", 60) || "Page", tab: str(pg.tab, "", 120), menu: bool(pg.menu, true),
          cols: numIn(pg.cols, 1, 3, 1), split: numIn(pg.split, 20, 80, 50), bg: optColor(pg.bg),
          blocks: (Array.isArray(pg.blocks) ? pg.blocks : []).slice(0, 200).map((b) => cleanBlock(b, bids)).filter(Boolean)
            .filter((b, i, all) => !SINGLE.has(b.type) || all.findIndex((x) => x.type === b.type) === i),
        });
      }
      if (!d.pages.length) d.pages = clone(DEFAULT.pages);
    }
    const pageIds = new Set(d.pages.map((p) => p.id));
    const l = isObj(x.links) ? x.links : {};
    for (const k of ["compare", "upcoming", "logo"]) d.links[k] = typeof l[k] === "string" && pageIds.has(l[k]) ? l[k] : "";
    d.links.extra = (Array.isArray(l.extra) ? l.extra : []).slice(0, 12).filter(isObj)
      .map((e) => ({ label: str(e.label, "Link", 60), to: target(e.to), newTab: bool(e.newTab, false) })).filter((e) => e.to);
    return d;
  }

  // ------------------------------------------------------------------- CSS
  const SHADOW = {
    none: ["none", "none"],
    soft: ["0 1px 2px rgba(16, 24, 40, .06), 0 1px 3px rgba(16, 24, 40, .08)", "none"],
    strong: ["0 8px 24px rgba(16, 24, 40, .16), 0 2px 6px rgba(16, 24, 40, .08)", "0 8px 24px rgba(0, 0, 0, .55)"],
  };
  const kebab = (k) => k.replace(/[A-Z0-9]/g, (m) => `-${m.toLowerCase()}`);
  function vars(d, c, dark) {
    const v = Object.entries(c).map(([k, x]) => `--${kebab(k)}:${x}`);
    const i = dark ? 1 : 0;
    v.push(`--shadow:${SHADOW[d.cards.shadow][i]}`, `--shadow-soft:${SHADOW.soft[i]}`, `--shadow-strong:${SHADOW.strong[i]}`,
      `color-scheme:${dark ? "dark" : "light"}`);
    return v.join(";");
  }
  const url = (root, src) => (src.startsWith("data:") ? src : root + src).replace(/["\\\n]/g, "");
  // the site's own copies of these fonts (a browser only downloads the ones a page uses)
  function fontFaces(ids, root) {
    let s = "";
    for (const id of new Set(ids)) {
      const h = HOSTED[id];
      if (!h) continue;
      for (const sub of h[2] ? ["latin", "latin-ext"] : ["latin"]) {
        for (const w of h[1]) {
          s += `@font-face{font-family:"F-${id}";font-style:normal;font-weight:${w};font-display:swap;`
            + `src:url("${url(root, `fonts/${id}/${sub}-${w}.woff2`)}") format("woff2");unicode-range:${RANGE[sub]}}`;
        }
      }
    }
    return s;
  }

  // The CSS that makes the site look like the design (added after styles.css). `root` is the site's
  // top folder, for fonts and pictures. `look` forces "light" or "dark" (the editor's preview).
  function css(d, root, look) {
    const L = d.colors.light;
    const K = d.colors.dark;
    const mode = look || d.look;
    let s = "";
    if (mode === "dark") s += `:root{${vars(d, K, true)}}@media (prefers-color-scheme: dark){:root{${vars(d, K, true)}}}`;
    else if (mode === "light") s += `:root{${vars(d, L, false)}}@media (prefers-color-scheme: dark){:root{${vars(d, L, false)}}}`;
    else s += `:root{${vars(d, L, false)}}@media (prefers-color-scheme: dark){:root{${vars(d, K, true)}}}`;
    const f = d.font;
    s += fontFaces([f.body, f.heading, f.brand], root);
    const sh = d.shape;
    const sp = d.space;
    s += `:root{--font:${FONTS[f.body].stack};--hfont:${FONTS[f.heading].stack};--bfont:${FONTS[f.brand].stack};`
      + `--fs:${f.size}px;--hscale:${f.hscale / 100};--hweight:${f.hweight};--hcase:${f.hcase ? "uppercase" : "none"};`
      + `--hspace:${f.hspace / 100}em;--lh:${f.lh / 100};--radius:${sh.radius}px;--btn-radius:${sh.btn}px;`
      + `--in-radius:${sh.input}px;--photo:${sh.photoSize}px;--photo-small:${Math.round(sh.photoSize * 0.76)}px;`
      + `--photo-radius:${sh.photo === "circle" ? "50%" : sh.photo === "rounded" ? "22%" : "0"};--photo-border:${sh.photoBorder}px;`
      + `--maxw:${sp.width}px;--side:${sp.side}px;--pad:${sp.pad}px;--gap:${sp.gap}px;--colgap:${sp.colgap}px;`
      + `--border-w:${d.cards.border}px;--header-h:${d.header.height}px;--logo:${d.header.logoSize}px}`;
    // cards
    if (d.cards.style === "outline") s += ":root{--cbg:transparent}";
    if (d.cards.style === "flat") s += ":root{--cbg:transparent;--cborder:none}.card,.search{padding-left:0;padding-right:0}";
    if (d.cards.style === "glass") s += ":root{--cbg:color-mix(in srgb, var(--surface) 72%, transparent)}.card,.search,.upcoming details,.help details{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}";
    // buttons
    const b = d.buttons;
    if (b.style === "outline") s += ".btn--primary{background:transparent;color:var(--accent);border:2px solid var(--accent)}";
    if (b.style === "soft") s += ".btn--primary{background:color-mix(in srgb, var(--accent) 16%, transparent);color:var(--accent);border-color:transparent}";
    if (b.size !== "normal") s += `:root{--btn-h:${b.size === "small" ? 42 : 62}px}`;
    if (b.caps) s += ".btn,.tab{text-transform:uppercase;letter-spacing:.04em}";
    // top bar
    const h = d.header;
    if (L.headerBg !== L.surface || L.headerText !== L.text || K.headerBg !== K.surface || K.headerText !== K.text) {
      s += ".top .updated{color:color-mix(in srgb, var(--header-text) 70%, var(--header-bg))}";
    }
    if (h.style === "accent") s += ".top{background:var(--accent);border-bottom-color:transparent}.top,.top .brand,.top .updated,.nav a{color:var(--accent-text)}.nav a.on{border-color:var(--accent-text)}";
    if (h.style === "clear") s += ".top{background:transparent;border-bottom-color:transparent}";
    if (!h.sticky) s += ".top{position:static}";
    // page background
    const bg = d.background;
    if (bg.type === "gradient") s += `body{background:linear-gradient(${bg.angle}deg, var(--bg), ${bg.color2});background-attachment:fixed}`;
    if (bg.type === "image" && bg.image) {
      const dim = bg.dim / 100;
      s += `body{background:${dim ? `linear-gradient(rgba(0,0,0,${dim}),rgba(0,0,0,${dim})),` : ""}url("${url(root, bg.image)}") center / `
        + `${bg.fit === "cover" ? "cover no-repeat" : "auto repeat"} var(--bg)${bg.fixed ? ";background-attachment:fixed" : ""}}`;
    }
    // footer
    const ft = d.footer;
    s += `.foot{text-align:${ft.align}${ft.bg ? `;background:${ft.bg};max-width:none;margin-top:var(--gap)` : ""}${ft.color ? `;color:${ft.color}` : ""}}`;
    // effects
    if (d.effects.lift) s += ".card,.mu,.btn{transition:transform .15s ease, box-shadow .15s ease}.card:hover,.mu:hover{transform:translateY(-3px);box-shadow:0 10px 26px rgba(0,0,0,.18)}.btn:hover{transform:translateY(-1px)}";
    // two or three columns from this screen width on
    s += `@media (min-width:${sp.wide}px){.region{display:grid;grid-template-columns:var(--cols);gap:0 var(--colgap);align-items:start}`
      + ".mus.r2{display:grid;grid-template-columns:1fr 1fr;gap:6px}.mus.r3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}"
      + ".mus.r2 .mu,.mus.r3 .mu{margin-bottom:0;height:100%}}";
    return s;
  }

  // ------------------------------------------------------------ share links
  const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  async function pipe(bytes, stream) {
    const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await out.arrayBuffer());
  }
  function chunked(bytes) { // btoa on very long inputs, in pieces
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  async function encode(d) {
    const raw = new TextEncoder().encode(JSON.stringify(d));
    if (typeof CompressionStream === "function") return `z${chunked(await pipe(raw, new CompressionStream("deflate-raw")))}`;
    return `j${chunked(raw)}`;
  }
  async function decode(s) {
    if (typeof s !== "string" || s.length < 2) return null;
    try {
      let bytes = unb64(s.slice(1));
      if (s[0] === "z") bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
      else if (s[0] !== "j") return null;
      return sanitize(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      return null;
    }
  }

  G.UFCDesign = {
    DEFAULT, BLOCKS, DEFAULT_TITLES, TEXTS, TEXT_DEFAULTS, COLORS, FONTS, HOSTED, PRESETS, PAGE_TEMPLATES,
    TAPE_ROWS, STAT_ROWS, LAST3_ROWS, FORM_FACTS, ACTIONS, LIGHT, DARK, SINGLE,
    sanitize, css, fontFaces, encode, decode, clone, block, bid, target, videoSrc, image, applyPreset,
  };
})(window);
