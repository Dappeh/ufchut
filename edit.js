"use strict";
/* The design editor (edit.html): changes the site's design (design-core.js) with a live preview of the
   site in a frame. Everything stays on this device (saved in the browser) or in a share link until
   someone puts a design on the real site on purpose. */
(() => {
  const D = window.UFCDesign;
  const ROOT = new URL(".", document.currentScript?.src || location.href).href;
  const $ = (s, el = document) => el.querySelector(s);
  const DEVICES = { phone: 390, tablet: 820, computer: 1440 };
  const frame = $("#preview");

  let design = null; // the design being changed
  let pageId = "home"; // the page shown and edited
  let selBid = null; // the chosen section
  let tab = "sections"; // the open panel
  let adding = false; // the sections panel shows the "add a section" choices
  let colorMode = "light"; // which colours the Style panel changes
  let footFirst = false; // the Top & menu panel opens at the bottom-of-page settings
  const P = { device: innerWidth < 900 ? "phone" : "computer", look: "", editing: true, sample: true }; // the preview
  const UNDO = [];
  const REDO = [];
  let lastKey = null;
  let lastAt = 0;
  let ready = false; // the preview is listening
  let scrollNext = false; // the next preview update scrolls to the chosen section

  // ------------------------------------------------------------- helpers
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k in el && !k.includes("-")) el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  }
  // a copy of the design that shares its (long) picture texts instead of copying them
  const copy = (x) => (Array.isArray(x) ? x.map(copy) : x && typeof x === "object"
    ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, copy(v)])) : x);
  const srcOf = (v) => (v.startsWith("data:") ? v : ROOT + v);
  const short = (s, n = 34) => {
    const t = String(s || "").replace(/\*\*|\[|\]\([^)]*\)|\*/g, "").replace(/\s+/g, " ").trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
  };
  const page = (d = design) => d.pages.find((p) => p.id === pageId) || d.pages[0];
  function findBlock(id, d = design) {
    for (const pg of d.pages) {
      const b = pg.blocks.find((x) => x.id === id);
      if (b) return [b, pg];
    }
    return [null, null];
  }
  const typeName = (t) => D.BLOCKS[t][0];
  function blockName(b) {
    const p = b.p;
    const own = { heading: p.text, text: p.text, banner: p.title, buttons: p.items?.map((i) => i.label).join(" · "), image: p.caption || p.alt };
    return short(b.title || own[b.type]) || typeName(b.type);
  }
  // new sections, with every setting filled in as the design's checker would
  const fresh = (blocks) => D.sanitize({ pages: [{ id: "x", blocks }] }).pages[0].blocks;
  const ec = (pg, b) => (pg.cols > 1 ? Math.min(b.col, pg.cols) : 0); // the column a section is in (0: full width)

  // ------------------------------------------------------- saving (this device)
  const store = (() => {
    let dbp = null;
    const open = () => (dbp ||= new Promise((res, rej) => {
      const r = indexedDB.open("ufchut-editor", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    async function run(mode, fn) {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction("kv", mode);
        const req = fn(t.objectStore("kv"));
        t.oncomplete = () => res(req.result);
        t.onerror = t.onabort = () => rej(t.error);
      });
    }
    return {
      async get(k) {
        try { return await run("readonly", (s) => s.get(k)); } catch {
          try { return JSON.parse(localStorage.getItem(`ufchut-editor-${k}`)); } catch { return null; }
        }
      },
      async set(k, v) {
        try { await run("readwrite", (s) => s.put(v, k)); return true; } catch {
          try { localStorage.setItem(`ufchut-editor-${k}`, JSON.stringify(v)); return true; } catch { return false; }
        }
      },
    };
  })();
  let saveT = 0;
  function saveSoon() {
    bar.saved.textContent = "Saving…";
    clearTimeout(saveT);
    saveT = setTimeout(async () => {
      const ok = await store.set("work", { design, page: pageId, t: Date.now() });
      bar.saved.textContent = ok ? "Saved on this device ✓" : "Couldn't save here: use Save & share → Save design file";
    }, 600);
  }
  async function versions() { return (await store.get("versions")) || []; }
  async function addVersion(name, d) {
    const list = await versions();
    list.unshift({ id: Date.now().toString(36), name: name || "Saved version", t: Date.now(), design: d });
    return store.set("versions", list.slice(0, 60));
  }

  // -------------------------------------------------------------- changes
  function edit(fn, key = null, redraw = false) {
    const now = Date.now();
    if (!key || key !== lastKey || now - lastAt > 1500) { // typing in one box counts as one change
      UNDO.push(copy(design));
      if (UNDO.length > 200) UNDO.shift();
      REDO.length = 0;
    }
    lastKey = key;
    lastAt = now;
    fn(design);
    changed(redraw);
  }
  function replace(nd, msg) {
    UNDO.push(copy(design));
    REDO.length = 0;
    lastKey = null;
    design = nd;
    fix();
    changed(true);
    if (msg) toast(msg);
  }
  function undo() {
    if (!UNDO.length) return;
    REDO.push(copy(design));
    design = UNDO.pop();
    lastKey = null;
    fix();
    changed(true);
  }
  function redo() {
    if (!REDO.length) return;
    UNDO.push(copy(design));
    design = REDO.pop();
    lastKey = null;
    fix();
    changed(true);
  }
  function fix() {
    if (selBid && !findBlock(selBid)[0]) selBid = null;
    if (selBid) pageId = findBlock(selBid)[1].id;
    if (!design.pages.some((p) => p.id === pageId)) pageId = design.pages[0].id;
  }
  function changed(redraw) {
    if (redraw) drawPanel();
    drawBar();
    sendSoon();
    saveSoon();
  }

  // -------------------------------------------------------------- preview
  let sendT = 0;
  function send() {
    if (!ready) return;
    frame.contentWindow.postMessage({ t: "design", design, page: pageId, look: P.look, editing: P.editing, sample: P.sample,
      sel: selBid, scroll: scrollNext }, location.origin);
    scrollNext = false;
  }
  function sendSoon() {
    clearTimeout(sendT);
    sendT = setTimeout(send, 80);
  }
  function select(id, scroll) {
    selBid = id;
    adding = false;
    if (id) pageId = findBlock(id)[1].id;
    if (tab !== "sections") { tab = "sections"; drawTabs(); }
    drawPanel();
    drawBar();
    if (ready) frame.contentWindow.postMessage({ t: "select", bid: id, scroll }, location.origin);
    $("#panel").scrollTop = 0;
  }
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
    const m = e.data || {};
    if (m.t === "ready") { ready = true; send(); }
    else if (m.t === "select") {
      if (m.bid) select(m.bid, false);
      else if (m.part === "header" || m.part === "footer") {
        selBid = null;
        tab = "chrome";
        footFirst = m.part === "footer";
        drawTabs();
        drawPanel();
        frame.contentWindow.postMessage({ t: "select", bid: null }, location.origin);
      } else select(null, false);
    } else if (m.t === "page" && m.id !== pageId) {
      pageId = m.id;
      selBid = null;
      adding = false;
      drawBar();
      if (tab === "sections" || tab === "pages") drawPanel();
    } else if (m.t === "tool") tool(m.act, m.bid);
  });
  function layoutFrame() {
    const st = $("#stage");
    const box = $("#frame");
    box.classList.toggle("phone", P.device === "phone");
    const w = DEVICES[P.device];
    const cs = getComputedStyle(st);
    const b = parseFloat(getComputedStyle(box).borderLeftWidth) || 0;
    const availW = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2 * b;
    const availH = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 2 * b;
    const scale = Math.min(1, availW / w);
    frame.style.width = `${w}px`;
    frame.style.height = `${availH / scale}px`;
    frame.style.transform = `scale(${scale})`;
    box.style.width = `${w * scale + 2 * b}px`;
    box.style.height = `${availH + 2 * b}px`;
  }

  // ------------------------------------------------------- section actions
  function moveBlock(id, dir) {
    const [b, pg] = findBlock(id);
    const L = pg.blocks;
    const i = L.indexOf(b);
    let j = i + dir;
    if (j < 0 || j >= L.length) return toast(dir < 0 ? "It's already at the top." : "It's already at the bottom.");
    if (!ec(pg, b)) {
      // a full-width section moves past a whole set of columns in one step
      if (ec(pg, L[j])) while (j + dir >= 0 && j + dir < L.length && ec(pg, L[j + dir])) j += dir;
      edit((d) => {
        const [x, p] = findBlock(id, d);
        p.blocks.splice(p.blocks.indexOf(x), 1);
        p.blocks.splice(j, 0, x);
      }, null, true);
    } else {
      // a section in a column moves within its column
      while (j >= 0 && j < L.length && ec(pg, L[j]) && ec(pg, L[j]) !== ec(pg, b)) j += dir;
      if (j < 0 || j >= L.length || !ec(pg, L[j])) {
        return toast(`It's already at the ${dir < 0 ? "top" : "bottom"} of its column. To take it out of the columns, make it full width.`);
      }
      edit((d) => {
        const [, p] = findBlock(id, d);
        [p.blocks[i], p.blocks[j]] = [p.blocks[j], p.blocks[i]];
      }, null, true);
    }
    scrollNext = true;
  }
  function duplicate(id) {
    const [b, pg] = findBlock(id);
    if (D.SINGLE.has(b.type)) return toast("There can only be one of these on a page. You can put it on another page instead.");
    const nb = { ...copy(b), id: D.bid(), s: { ...copy(b.s), anchor: "" } };
    edit((d) => {
      const [x, p] = findBlock(id, d);
      p.blocks.splice(p.blocks.indexOf(x) + 1, 0, nb);
    });
    selBid = nb.id;
    scrollNext = true;
    drawPanel();
    toast(`Made a copy of “${blockName(b)}” on ${pg.name}.`);
  }
  function removeBlock(id) {
    const [b] = findBlock(id);
    edit((d) => {
      const [x, p] = findBlock(id, d);
      p.blocks.splice(p.blocks.indexOf(x), 1);
    });
    if (selBid === id) selBid = null;
    drawPanel();
    toast(`Deleted “${blockName(b)}”.`, ["Undo", undo]);
  }
  function toggleHidden(id) {
    edit((d) => { const [x] = findBlock(id, d); x.hidden = !x.hidden; }, null, true);
  }
  function tool(act, id) {
    if (!findBlock(id)[0]) return;
    if (act === "up" || act === "down") moveBlock(id, act === "up" ? -1 : 1);
    else if (act === "copy") duplicate(id);
    else if (act === "hide") toggleHidden(id);
    else if (act === "delete") removeBlock(id);
  }
  function addBlock(type) {
    const pg = page();
    const cur = selBid && findBlock(selBid)[1] === pg ? findBlock(selBid)[0] : null;
    const [nb] = fresh([D.block(type, cur ? cur.col : 0)]);
    edit((d) => {
      const p = page(d);
      if (cur) p.blocks.splice(p.blocks.indexOf(cur) + 1, 0, nb);
      else p.blocks.push(nb);
    });
    adding = false;
    selBid = nb.id;
    scrollNext = true;
    drawPanel();
  }

  // ---------------------------------------------------------------- toast
  let toastT = 0;
  function toast(msg, action) {
    const t = $("#toast");
    t.replaceChildren(msg, action ? h("button", { type: "button", class: "b b--s", style: "margin-left:10px", onclick: () => { action[1](); t.hidden = true; } }, action[0]) : "");
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => (t.hidden = true), action ? 6000 : 3500);
  }

  // --------------------------------------------------------------- fields
  const field = (label, control, help, warn) => h("div", { class: "f" }, label != null && h("div", { class: "f__l" }, label), control,
    help && h("small", { class: "f__h" }, help), warn);
  function group(title, open, ...kids) {
    return h("details", { class: "g", open }, h("summary", {}, title), h("div", { class: "gb" }, kids));
  }
  function fText(label, get, set, o = {}) {
    const el = h(o.multi ? "textarea" : "input", { class: "in", value: get() ?? "", placeholder: o.placeholder || "", maxLength: o.max || 5000 });
    if (o.multi) el.rows = o.rows || 4;
    el.addEventListener("input", () => edit((d) => set(d, el.value), `t:${label}:${selBid}:${o.key || ""}`, o.redraw));
    return field(label, el, o.help);
  }
  function fNum(label, get, set, min, max, o = {}) {
    const unit = o.unit ?? "px";
    const show = (v) => (o.show ? o.show(v) : `${v}${unit}`);
    const val = h("span", { class: "val" }, show(get()));
    const r = h("input", { type: "range", min, max, step: o.step || 1, value: get() });
    r.addEventListener("input", () => {
      val.textContent = show(+r.value);
      edit((d) => set(d, +r.value), `n:${label}:${selBid}`);
    });
    return h("div", { class: "f" }, h("div", { class: "f__l" }, label, val), r, o.help && h("small", { class: "f__h" }, o.help));
  }
  // a number that can also be "the same as the rest of the site" (null)
  function fOptNum(label, get, set, min, max, dflt) {
    const cur = get();
    const same = h("input", { type: "checkbox", checked: cur == null });
    const val = h("span", { class: "val" }, cur == null ? "same as the site" : `${cur}px`);
    const r = h("input", { type: "range", min, max, value: cur ?? dflt, disabled: cur == null });
    same.addEventListener("change", () => {
      r.disabled = same.checked;
      val.textContent = same.checked ? "same as the site" : `${r.value}px`;
      edit((d) => set(d, same.checked ? null : +r.value));
    });
    r.addEventListener("input", () => {
      val.textContent = `${r.value}px`;
      edit((d) => set(d, +r.value), `o:${label}:${selBid}`);
    });
    return h("div", { class: "f" }, h("div", { class: "f__l" }, label, val), r,
      h("label", { class: "f__h", style: "display:flex;gap:6px;align-items:center" }, same, "Same as the rest of the site"));
  }
  function fSelect(label, get, set, options, o = {}) {
    const s = h("select", { class: "in" }, options.map(([v, t]) => h("option", { value: String(v) }, t)));
    s.value = String(get());
    s.addEventListener("change", () => {
      const opt = options.find(([v]) => String(v) === s.value);
      edit((d) => set(d, opt[0]), null, o.redraw);
    });
    return field(label, s, o.help);
  }
  function segButtons(options, get, pick) {
    const wrap = h("div", { class: "seg" });
    const draw = () => { for (const b of wrap.children) b.setAttribute("aria-pressed", String(b.dataset.v === String(get()))); };
    for (const [v, t, title] of options) {
      wrap.append(h("button", { type: "button", "data-v": String(v), title, onclick: () => { pick(v); draw(); } }, t));
    }
    draw();
    wrap.update = draw;
    return wrap;
  }
  function fSeg(label, get, set, options, o = {}) {
    return field(label, segButtons(options, get, (v) => edit((d) => set(d, v), null, o.redraw)), o.help);
  }
  function fToggle(label, get, set, o = {}) {
    const c = h("input", { type: "checkbox", checked: !!get() });
    c.addEventListener("change", () => edit((d) => set(d, c.checked), null, o.redraw));
    return h("label", { class: "tog" }, h("span", {}, label, o.help && h("small", { class: "f__h" }, o.help)), c);
  }
  function fColor(label, get, set, o = {}) {
    const cur = get() || "";
    const sw = h("input", { type: "color", class: "swatch", value: cur || o.fallback || "#888888", title: "Pick a colour" });
    const hex = h("input", { class: "in hex", value: cur, placeholder: o.empty ? "default" : "#rrggbb", maxLength: 7, spellcheck: false });
    const key = `c:${label}:${selBid}:${colorMode}`;
    sw.addEventListener("input", () => { hex.value = sw.value; edit((d) => set(d, sw.value), key); });
    hex.addEventListener("input", () => {
      const v = hex.value.trim();
      if (/^#[0-9a-f]{6}$/i.test(v)) { sw.value = v; edit((d) => set(d, v.toLowerCase()), key); }
      else if (!v && o.empty) edit((d) => set(d, ""), key);
    });
    const kids = [sw, hex];
    if (o.empty) kids.push(h("button", { type: "button", class: "b b--s", title: "No colour of its own", onclick: () => { hex.value = ""; edit((d) => set(d, "")); } }, "Default"));
    if (o.reset) kids.push(h("button", { type: "button", class: "b b--s", title: "Back to the original colour", onclick: () => { const v = o.reset(); hex.value = v; sw.value = v; edit((d) => set(d, v)); } }, "↺"));
    return field(label, h("div", { class: "row" }, kids), o.help);
  }
  // Pictures are made smaller on this device before they're kept (a phone photo is several MB).
  async function readImage(file, kind) {
    const max = kind === "logo" ? 320 : kind === "wide" ? 1800 : 1400;
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      let scale = Math.min(1, max / Math.max(img.naturalWidth || max, img.naturalHeight || max));
      for (let tries = 0; tries < 4; tries++, scale *= 0.75) {
        const w = Math.max(1, Math.round((img.naturalWidth || max) * scale));
        const hh = Math.max(1, Math.round((img.naturalHeight || max) * scale));
        const c = h("canvas", { width: w, height: hh });
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, w, hh);
        let alpha = false;
        if (!/jpe?g/.test(file.type)) {
          const px = ctx.getImageData(0, 0, w, hh).data;
          for (let i = 3; i < px.length; i += 4) if (px[i] < 250) { alpha = true; break; }
        }
        const out = alpha ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.82);
        if (out.length < 1.5e6) return out;
      }
      throw new Error("too big");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  function fImage(label, get, set, o = {}) {
    const cur = get() || "";
    const file = h("input", { type: "file", accept: "image/*", hidden: true });
    file.addEventListener("change", async () => {
      const f = file.files[0];
      if (!f) return;
      toast("Adding the picture…");
      try {
        const url = await readImage(f, o.kind);
        edit((d) => set(d, url), null, true);
        toast("Picture added.");
      } catch {
        toast("That picture couldn't be used. Try a JPG or PNG.");
      }
    });
    const th = cur ? h("img", { class: `thumb${o.kind === "logo" ? " thumb--logo" : ""}`, src: srcOf(cur), alt: "" }) : h("div", { class: "thumb" });
    return field(label, h("div", { class: "row" }, th, h("div", { class: "btns", style: "margin:0" },
      h("button", { type: "button", class: "b b--s", onclick: () => file.click() }, cur ? "Change picture" : "Choose a picture"),
      cur && h("button", { type: "button", class: "b b--s b--d", onclick: () => edit((d) => set(d, ""), null, true) }, "Remove")), file), o.help);
  }
  const ACTION_NAMES = [["compare", "Compare the chosen fighters"], ["swap", "Swap the two corners"], ["share", "Share the page"],
    ["copyai", "Copy the comparison for AI"], ["top", "Scroll back to the top"]];
  // where a button or link goes
  function targetSelect(get, set, o = {}) {
    const cur = get() || "";
    const commit = (v, key) => (o.local ? set(null, v) : edit((d) => set(d, v), key));
    const s = h("select", { class: "in" });
    const add = (parent, v, t) => parent.append(h("option", { value: v }, t));
    add(s, "", o.none || "Nowhere yet");
    const gp = h("optgroup", { label: "Open a page" });
    for (const p of design.pages) add(gp, `page:${p.id}`, `${p.name} page`);
    s.append(gp);
    const anchors = page().blocks.filter((b) => b.s.anchor);
    if (anchors.length) {
      const ga = h("optgroup", { label: "Jump to a section on the same page" });
      for (const b of anchors) add(ga, `#${b.s.anchor}`, `${blockName(b)} (${b.s.anchor})`);
      s.append(ga);
    }
    const gx = h("optgroup", { label: "Do something" });
    for (const [v, t] of ACTION_NAMES) add(gx, `action:${v}`, t);
    s.append(gx);
    add(s, "web", "Another website (web address)…");
    const isWeb = !!cur && !/^(page:|#|action:)/.test(cur);
    s.value = isWeb ? "web" : cur;
    if (!isWeb && s.value !== cur) { add(s, cur, `${cur} (no longer there)`); s.value = cur; }
    const url = h("input", { class: "in", placeholder: "https://…", value: isWeb ? cur : "", hidden: !isWeb, style: "margin-top:6px" });
    const warn = h("small", { class: "f__h warn", hidden: !isWeb || !!D.target(cur) }, "A web address starts with https://");
    const tabT = o.newTab && fToggle("Open in a new tab", o.newTab[0], o.newTab[1]);
    if (tabT) { tabT.hidden = !isWeb; tabT.style.marginTop = "6px"; }
    s.addEventListener("change", () => {
      const web = s.value === "web";
      url.hidden = !web;
      if (tabT) tabT.hidden = !web;
      warn.hidden = true;
      commit(web ? url.value.trim() : s.value);
      if (web) url.focus();
    });
    url.addEventListener("input", () => {
      const v = url.value.trim();
      warn.hidden = !v || !!D.target(v);
      commit(v, `u:${selBid}:${o.key || ""}`);
    });
    return h("div", {}, s, url, warn, tabT);
  }
  const fTarget = (label, get, set, o = {}) => field(label, targetSelect(get, set, o), o.help);

  // drag ⠿ to change the order of a list; done(ids in the new order)
  function dragSort(list, done) {
    list.addEventListener("pointerdown", (e) => {
      const handle = e.target.closest(".drag");
      if (!handle) return;
      e.preventDefault();
      const li = handle.closest("[data-id]");
      const before = [...list.children].map((x) => x.dataset.id).join();
      li.classList.add("dragging");
      handle.setPointerCapture(e.pointerId);
      const panel = $("#panel");
      const move = (ev) => {
        const pr = panel.getBoundingClientRect();
        if (ev.clientY < pr.top + 30) panel.scrollTop -= 12;
        if (ev.clientY > pr.bottom - 30) panel.scrollTop += 12;
        const over = [...list.children].find((x) => {
          if (x === li) return false;
          const r = x.getBoundingClientRect();
          return ev.clientY > r.top && ev.clientY < r.bottom;
        });
        if (!over) return;
        const r = over.getBoundingClientRect();
        list.insertBefore(li, ev.clientY < r.top + r.height / 2 ? over : over.nextSibling);
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        li.classList.remove("dragging");
        const order = [...list.children].map((x) => x.dataset.id);
        if (order.join() !== before) done(order);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  }
  const dragHandle = () => h("span", { class: "drag", title: "Drag to move", "aria-hidden": "true" }, "⠿");

  // which rows a table shows, their order and their names
  function rowsEditor(title, get, set, all) {
    const conf = (d) => (get(d) || all.map((k) => ({ k, show: true, label: "" }))).map((x) => ({ ...x }));
    const list = h("ul", { class: "list" }, conf(design).map((r) => {
      const cb = h("input", { type: "checkbox", checked: r.show, title: "Show this row" });
      cb.addEventListener("change", () => edit((d) => { const c = conf(d); c.find((x) => x.k === r.k).show = cb.checked; set(d, c); }));
      const name = h("input", { class: "in", value: r.label, placeholder: r.k, title: "Type a new name for this row" });
      name.addEventListener("input", () => edit((d) => { const c = conf(d); c.find((x) => x.k === r.k).label = name.value; set(d, c); }, `rows:${r.k}:${selBid}`));
      return h("li", { class: "li", "data-id": r.k }, dragHandle(), cb, name);
    }));
    dragSort(list, (order) => edit((d) => { const c = conf(d); set(d, order.map((k) => c.find((x) => x.k === k))); }));
    return field(title, list, "Untick a row to hide it, drag ⠿ to move it, type in the box to rename it.");
  }

  // a list of things (buttons, pictures, links) she can add to, reorder and remove
  function itemsEditor(get, set, draw, blank, addLabel, max) {
    const items = get() || [];
    const list = h("ul", { class: "list" }, items.map((it, i) => h("li", { class: "item", "data-id": String(i) },
      h("div", { class: "row" }, dragHandle(), h("b", { style: "flex:1" }, `${i + 1}`),
        h("button", { type: "button", class: "b b--s b--d", onclick: () => edit((d) => { const l = get(d).slice(); l.splice(i, 1); set(d, l); }, null, true) }, "Remove")),
      draw(it, i))));
    dragSort(list, (order) => edit((d) => { const l = get(d); set(d, order.map((k) => l[+k])); }, null, true));
    const add = items.length < max && h("button", { type: "button", class: "b b--w", onclick: () => edit((d) => set(d, [...(get(d) || []), blank()]), null, true) }, addLabel);
    return h("div", {}, list, add);
  }

  // ------------------------------------------------------------- top bar
  const bar = {};
  function buildBar() {
    bar.page = h("select", { class: "in", style: "width:auto;max-width:180px", title: "The page you're changing",
      onchange: () => { pageId = bar.page.value; selBid = null; adding = false; drawPanel(); send(); } });
    bar.device = segButtons([["phone", "📱", "Phone"], ["tablet", "▭", "Tablet"], ["computer", "🖥", "Computer"]], () => P.device,
      (v) => { P.device = v; layoutFrame(); });
    bar.look = segButtons([["", "Auto", "As the design says (or the device's setting)"], ["light", "☀", "Light"], ["dark", "☾", "Dark"]], () => P.look,
      (v) => { P.look = v; send(); });
    bar.mode = segButtons([[true, "✏️ Edit", "Click things in the preview to change them"], [false, "👆 Try it", "Use the preview like the real site"]],
      () => P.editing, (v) => { P.editing = v; send(); });
    bar.sample = h("input", { type: "checkbox", checked: P.sample, onchange: () => { P.sample = bar.sample.checked; send(); } });
    bar.undo = h("button", { type: "button", class: "b b--i", title: "Undo (Ctrl+Z)", onclick: undo }, "↶");
    bar.redo = h("button", { type: "button", class: "b b--i", title: "Redo (Ctrl+Y)", onclick: redo }, "↷");
    bar.saved = h("span", { class: "saved" });
    $("#bar").append(
      h("div", { class: "bar__name" }, h("img", { src: `${ROOT}icons/icon.svg`, alt: "" }), "Design editor", h("small", {}, "the real site doesn't change")),
      h("div", { class: "grp" }, h("span", { class: "lbl" }, "Page"), bar.page),
      h("div", { class: "grp" }, bar.device, bar.look),
      h("div", { class: "grp" }, bar.mode),
      h("label", { class: "grp", title: "Show two fighters in the preview" }, bar.sample, h("span", { class: "lbl", style: "display:inline" }, "Example fighters")),
      h("span", { class: "bar__grow" }),
      bar.saved, bar.undo, bar.redo,
      h("button", { type: "button", class: "b b--p", onclick: () => { tab = "save"; drawTabs(); drawPanel(); } }, "Save & share"));
  }
  function drawBar() {
    bar.page.replaceChildren(...design.pages.map((p) => h("option", { value: p.id }, p.name)));
    bar.page.value = page().id;
    bar.undo.disabled = !UNDO.length;
    bar.redo.disabled = !REDO.length;
  }

  // ------------------------------------------------------------- the panels
  const TABS = [["sections", "▤", "Sections"], ["pages", "❐", "Pages"], ["style", "🎨", "Style"],
    ["chrome", "☰", "Top & menu"], ["words", "✎", "Words"], ["save", "⤴", "Save & share"]];
  function drawTabs() {
    $("#tabs").replaceChildren(...TABS.map(([k, icon, name]) => h("button", { type: "button", "aria-selected": String(tab === k),
      onclick: () => { tab = k; adding = false; if (k !== "sections") selBid = null; drawTabs(); drawPanel(); if (ready) frame.contentWindow.postMessage({ t: "select", bid: selBid }, location.origin); } },
    h("span", {}, icon), name)));
  }
  let lastView = "";
  function drawPanel() {
    const el = $("#panel");
    const v = `${tab}:${selBid}:${adding}:${pageId}`;
    const top = v === lastView ? el.scrollTop : 0;
    lastView = v;
    const root = h("div");
    ({ sections: panelSections, pages: panelPages, style: panelStyle, chrome: panelChrome, words: panelWords, save: panelSave })[tab](root);
    el.replaceChildren(root);
    el.scrollTop = top;
    if (tab === "chrome" && footFirst) {
      footFirst = false;
      $("#foot-group")?.scrollIntoView();
    }
  }

  const ICONS = { heading: "𝐇", text: "¶", image: "🖼", gallery: "▦", buttons: "⬭", banner: "▬", video: "▶", divider: "—", spacer: "↕",
    search: "🔍", heads: "👤", share: "⤴", tape: "📏", stats: "📊", strikes: "🎯", last3: "3️⃣", form: "📈", met: "🤝", common: "👥", history: "📜",
    upcoming: "📅", helpStats: "❓", helpHome: "📱" };
  const ABOUT = {
    heading: "A big title", text: "Words, bold, links and lists", image: "One picture (can be a link)", gallery: "A grid of pictures",
    buttons: "Buttons that open pages or websites", banner: "A big coloured or picture banner", video: "A YouTube or Vimeo video",
    divider: "A line across the page", spacer: "Empty space", search: "The two name boxes and the Compare button",
    heads: "Names, photos, records, next fight", share: "Share and Copy for AI buttons", tape: "Age, height, reach, records…",
    stats: "Strikes, takedowns, defence per minute (all or last 3 fights)", strikes: "Where their strikes land (all or last 3 fights)",
    last3: "Record in the last 3 fights and those 3 opponents' records", form: "Last 5 fights, streaks, how they win",
    met: "Shows when the two have fought each other", common: "Opponents they've both fought", history: "Every pro fight, with stats",
    upcoming: "The next fight cards (tap to compare)", helpStats: "Explains what the stats mean", helpHome: "How to add the site to a phone",
  };

  // ---- sections
  function panelSections(root) {
    const pg = page();
    const b = selBid && findBlock(selBid)[0];
    if (b) return blockSettings(root, b);
    if (adding) return catalogue(root);
    root.append(h("h2", {}, `Sections on the “${pg.name}” page`),
      h("p", { class: "intro" }, "Click a section here or in the preview to change it. Drag ⠿ to move it up or down."));
    root.append(fSeg("Columns on computer screens", () => page().cols, (d, v) => { page(d).cols = v; }, [[1, "One"], [2, "Two"], [3, "Three"]],
      { redraw: true, help: "Sections set to a column sit side by side on computers; phones always show them one under the other." }));
    if (pg.cols === 2) {
      root.append(fNum("Left column width", () => page().split, (d, v) => { page(d).split = v; }, 20, 80, { unit: "%" }));
    }
    const list = h("ul", { class: "list" });
    for (const x of pg.blocks) {
      const colSel = pg.cols > 1 && h("select", { class: "in", title: "Where it sits", onchange: (e) => edit((d) => { findBlock(x.id, d)[0].col = +e.target.value; }, null, true) },
        [[0, "Full width"], ...(pg.cols === 2 ? [[1, "Left"], [2, "Right"]] : [[1, "Left"], [2, "Middle"], [3, "Right"]])]
          .map(([v, t]) => h("option", { value: String(v), selected: ec(pg, x) === v }, t)));
      list.append(h("li", { class: `li${x.hidden ? " off" : ""}`, "data-id": x.id }, dragHandle(),
        h("button", { type: "button", class: "li__name", onclick: () => select(x.id, true) },
          `${ICONS[x.type]} ${blockName(x)}`, h("small", {}, typeName(x.type) + (x.hidden ? " · hidden" : ""))),
        colSel,
        h("button", { type: "button", class: "b b--s b--i", title: x.hidden ? "Show it" : "Hide it", onclick: () => toggleHidden(x.id) }, x.hidden ? "Show" : "Hide")));
    }
    dragSort(list, (order) => edit((d) => { const p = page(d); p.blocks = order.map((id) => p.blocks.find((y) => y.id === id)); }, null, true));
    if (!pg.blocks.length) root.append(h("p", { class: "tip" }, "This page is empty. Add a section to start."));
    root.append(list, h("button", { type: "button", class: "b b--p b--w", onclick: () => { adding = true; drawPanel(); } }, "+ Add a section"));
  }
  function catalogue(root) {
    const pg = page();
    root.append(h("button", { type: "button", class: "back", onclick: () => { adding = false; drawPanel(); } }, "← Back to the sections"),
      h("h2", {}, "Add a section"), h("p", { class: "intro" }, selBid ? "It goes under the chosen section." : `It goes at the bottom of the “${pg.name}” page.`));
    const cat = h("div", { class: "cat" });
    for (const [grp, title] of [["own", "Your own content"], ["data", "The fighter comparison"], ["site", "Other parts of the site"]]) {
      cat.append(h("h3", {}, title), h("div", { class: "cat__grid" }, Object.keys(D.BLOCKS).filter((t) => D.BLOCKS[t][1] === grp).map((t) => {
        const there = D.SINGLE.has(t) && pg.blocks.some((x) => x.type === t);
        return h("button", { type: "button", class: "cat__it", disabled: there, title: there ? "Already on this page" : "", onclick: () => addBlock(t) },
          h("span", { class: "cat__ico" }, ICONS[t]), h("b", {}, typeName(t)), h("small", {}, there ? "Already on this page" : ABOUT[t]));
      })));
    }
    root.append(cat);
  }

  function blockSettings(root, b) {
    const id = b.id;
    const pg = findBlock(id)[1];
    const at = (d) => findBlock(id, d)[0];
    const cur = () => at(design);
    const p = (k) => [() => cur().p[k], (d, v) => { at(d).p[k] = v; }];
    const s = (k) => [() => cur().s[k], (d, v) => { at(d).s[k] = v; }];
    const data = D.BLOCKS[b.type][1] !== "own";
    root.append(h("button", { type: "button", class: "back", onclick: () => select(null, false) }, `← All sections on “${pg.name}”`),
      h("h2", {}, `${ICONS[b.type]} ${typeName(b.type)}`));
    const others = design.pages.filter((x) => x !== pg);
    root.append(h("div", { class: "btns" },
      h("button", { type: "button", class: "b b--s", onclick: () => moveBlock(id, -1) }, "↑ Up"),
      h("button", { type: "button", class: "b b--s", onclick: () => moveBlock(id, 1) }, "↓ Down"),
      h("button", { type: "button", class: "b b--s", onclick: () => duplicate(id) }, "⧉ Copy"),
      h("button", { type: "button", class: "b b--s", onclick: () => toggleHidden(id) }, b.hidden ? "Show" : "Hide"),
      h("button", { type: "button", class: "b b--s b--d", onclick: () => removeBlock(id) }, "Delete"),
      others.length > 0 && h("select", { class: "in b--s", style: "width:auto;padding:4px 6px;font-size:12px", onchange: (e) => {
        const to = design.pages.find((x) => x.id === e.target.value);
        if (!to) return;
        if (D.SINGLE.has(b.type) && to.blocks.some((x) => x.type === b.type)) { e.target.value = ""; return toast(`The “${to.name}” page already has one of these.`); }
        edit((d) => {
          const [x, from] = findBlock(id, d);
          from.blocks.splice(from.blocks.indexOf(x), 1);
          d.pages.find((q) => q.id === to.id).blocks.push(x);
        });
        pageId = to.id;
        scrollNext = true;
        drawPanel();
        drawBar();
        toast(`Moved to the bottom of the “${to.name}” page.`);
      } }, h("option", { value: "" }, "Move to page…"), others.map((x) => h("option", { value: x.id }, x.name)))));
    if (b.hidden) root.append(h("p", { class: "warnbox" }, "This section is hidden: it isn't shown on the site."));

    const content = contentFields(b, p);
    if (content.length) root.append(group("What it shows", true, content));
    if (D.DEFAULT_TITLES[b.type] != null) {
      const help = b.type === "helpStats" || b.type === "helpHome";
      root.append(group("Title", true,
        fText(help ? "Title (tap to open)" : "Title", () => cur().title || "", (d, v) => { at(d).title = v || null; }, { placeholder: D.DEFAULT_TITLES[b.type] }),
        !help && fToggle("Show the title", ...[() => cur().showTitle, (d, v) => { at(d).showTitle = v; }])));
    }
    const full = !ec(pg, b);
    root.append(group("Where it sits", false,
      pg.cols > 1 && fSelect("Column", () => ec(pg, cur()), (d, v) => { at(d).col = v; },
        [[0, "Full width"], ...(pg.cols === 2 ? [[1, "Left column"], [2, "Right column"]] : [[1, "Left column"], [2, "Middle column"], [3, "Right column"]])], { redraw: true }),
      fSeg("Show it on", ...s("on"), [["all", "Phones & computers"], ["phone", "Phones only"], ["computer", "Computers only"]]),
      full && fSeg("Width", ...s("width"), [["", "Normal"], ["narrow", "Narrow"], ["medium", "Medium"], ["edge", "Edge to edge"]]),
      fText("Jump-to name", () => cur().s.anchor, (d, v) => { at(d).s.anchor = v.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+/, "").slice(0, 40); },
        { placeholder: "e.g. fights", help: "Give it a name to let a button on this page jump to it (Buttons → Where it goes → Jump to a section)." })));
    root.append(group("Look", false,
      fSeg("Box", ...s("box"), data ? [["", "Card (normal)"], ["plain", "No box"]] : [["", "No box (normal)"], ["card", "Card"]]),
      fColor("Background colour", ...s("bg"), { empty: true }),
      fImage("Background picture", ...s("image"), { kind: "wide" }),
      cur().s.image && fNum("Darken the picture", ...s("dim"), 0, 90, { unit: "%" }),
      fColor("Text colour", ...s("text"), { empty: true }),
      fColor("Title colour", ...s("title"), { empty: true }),
      fSeg("Border", ...s("border"), [["", "Normal"], ["none", "None"], ["line", "Thin"], ["thick", "Thick"]]),
      fColor("Border colour", ...s("borderColor"), { empty: true }),
      fOptNum("Rounded corners", ...s("radius"), 0, 60, design.shape.radius),
      fSeg("Shadow", ...s("shadow"), [["", "Normal"], ["none", "None"], ["soft", "Soft"], ["strong", "Strong"]]),
      fOptNum("Space inside", ...s("pad"), 0, 80, design.space.pad),
      fOptNum("Space below it", ...s("space"), 0, 120, design.space.gap),
      fSeg("Line up the text", ...s("align"), [["", "Normal"], ["left", "Left"], ["center", "Centre"], ["right", "Right"]]),
      fSelect("When it comes into view", ...s("appear"), [["", "Same as the site"], ["none", "Just appears"], ["fade", "Fades in"], ["rise", "Slides up"], ["zoom", "Zooms in"]]),
      h("button", { type: "button", class: "b b--s", onclick: () => edit((d) => { const x = at(d); x.s = { ...fresh([D.block("spacer")])[0].s, anchor: x.s.anchor, on: x.s.on, width: x.s.width }; }, null, true) }, "Reset this section's look")));
  }

  function contentFields(b, p) {
    const at = (d) => findBlock(b.id, d)[0];
    switch (b.type) {
      case "search": return [fToggle("Show the corner labels", ...p("labels")), fToggle("Show the Swap button", ...p("swap")),
        h("p", { class: "f__h" }, "The words (Red corner, Compare…) are in the Words panel.")];
      case "heads": return [fToggle("Nicknames", ...p("nick")), fToggle("Tags (rankings, titles)", ...p("tags")), fToggle("Next fight", ...p("next"))];
      case "share": return [fToggle("Share button", ...p("share")), fToggle("Copy for AI button", ...p("copyai"))];
      case "tape": return [
        rowsEditor("Rows", (d) => at(d).p.rows, (d, v) => { at(d).p.rows = v; }, D.TAPE_ROWS),
        fToggle("Include the career stats", ...p("stats"), { redraw: true }),
        b.p.stats && rowsEditor("Career stats rows", (d) => at(d).p.statRows, (d, v) => { at(d).p.statRows = v; }, D.STAT_ROWS),
        fToggle("Include the strike breakdown", ...p("strikes")),
        h("p", { class: "f__h" }, "Career stats and the strike breakdown are also sections of their own, if you'd rather put them somewhere else.")];
      case "stats": return [fSeg("Which fights", ...p("last3"), [[false, "All UFC fights"], [true, "Last 3 UFC fights"]]),
        rowsEditor("Rows", (d) => at(d).p.rows, (d, v) => { at(d).p.rows = v; }, D.STAT_ROWS)];
      case "strikes": return [fSeg("Which fights", ...p("last3"), [[false, "All UFC fights"], [true, "Last 3 UFC fights"]])];
      case "last3": return [rowsEditor("Rows", (d) => at(d).p.rows, (d, v) => { at(d).p.rows = v; }, D.LAST3_ROWS)];
      case "form": {
        const all = D.FORM_FACTS.map(([k]) => k);
        return [field("What to show", h("div", {}, D.FORM_FACTS.map(([k, name]) => fToggle(name, () => (b.p.facts || all).includes(k),
          (d, v) => { const f = new Set(at(d).p.facts || all); if (v) f.add(k); else f.delete(k); at(d).p.facts = all.filter((x) => f.has(x)); }))))];
      }
      case "history": return [fNum("Fights shown before “Show all”", ...p("limit"), 3, 100, { unit: "" }),
        fToggle("“UFC fights only” tick box", ...p("filter")), fToggle("Start with UFC fights only", ...p("ufcOnly"))];
      case "upcoming": return [fText("Note next to the title", ...p("sub")), fNum("Fight cards open at the start", ...p("open"), 0, 10, { unit: "" }),
        fSeg("Fights side by side (computers)", ...p("perRow"), [[1, "1"], [2, "2"], [3, "3"]])];
      case "helpStats": case "helpHome": return [fToggle("Open at the start", ...p("open"))];
      case "heading": return [fText("Words", ...p("text"), { help: "Put **two stars** around words to make them bold." }),
        fSeg("Size", ...p("size"), [["s", "S"], ["m", "M"], ["l", "L"], ["xl", "XL"], ["xxl", "XXL"]])];
      case "text": return [textField(b, p), fSeg("Text size", ...p("size"), [["s", "Small"], ["m", "Normal"], ["l", "Big"]])];
      case "image": return [fImage("Picture", ...p("src")), fText("Describe the picture (for blind visitors)", ...p("alt")),
        fNum("Width", ...p("width"), 10, 100, { unit: "%" }),
        fSeg("Shape", ...p("fit"), [["natural", "As it is"], ["cover", "Cropped to a height"]], { redraw: true }),
        b.p.fit === "cover" && fNum("Height", ...p("height"), 60, 1200),
        fText("Caption", ...p("caption")), fTarget("When tapped, go to", ...p("to"), { newTab: p("newTab"), none: "Nowhere (just a picture)" })];
      case "gallery": return [
        field("Pictures", itemsEditor((d) => at(d).p.items, (d, v) => { at(d).p.items = v; }, (it, i) => {
          const item = (k) => [() => at(design).p.items[i][k], (d, v) => { at(d).p.items[i][k] = v; }];
          return [fImage("Picture", ...item("src")), fText("Caption", ...item("caption"), { key: `g${i}` }), fTarget("When tapped, go to", ...item("to"), { key: `g${i}`, none: "Nowhere" })];
        }, () => ({ src: "", caption: "", to: "" }), "+ Add a picture", 24)),
        fNum("Pictures per row", ...p("perRow"), 1, 6, { unit: "" }), fNum("Picture height", ...p("height"), 60, 800)];
      case "buttons": return [
        field("Buttons", itemsEditor((d) => at(d).p.items, (d, v) => { at(d).p.items = v; }, (it, i) => {
          const item = (k) => [() => at(design).p.items[i][k], (d, v) => { at(d).p.items[i][k] = v; }];
          return [fText("Words on the button", ...item("label"), { key: `b${i}` }),
            fTarget("Where it goes", ...item("to"), { key: `b${i}`, newTab: item("newTab"), help: "Pick a page to open a new page, or a section to jump to on this page." }),
            fSelect("Look", ...item("look"), [["main", "Main colour"], ["plain", "Plain"], ["outline", "Outline"], ["red", "Red corner colour"], ["blue", "Blue corner colour"]])];
        }, () => ({ label: "Button", to: "", look: "plain", newTab: false }), "+ Add a button", 12)),
        fSeg("Size", ...p("size"), [["small", "Small"], ["normal", "Normal"], ["large", "Large"]]),
        fToggle("Stretch across the whole width", ...p("full")),
        h("p", { class: "f__h" }, "Line the buttons up left, centre or right under Look → Line up the text.")];
      case "banner": return [fText("Big title", ...p("title")), fText("Line underneath", ...p("sub"), { multi: true, rows: 2 }),
        fImage("Background picture", ...p("image"), { kind: "wide" }), b.p.image && fNum("Darken the picture", ...p("dim"), 0, 90, { unit: "%" }),
        fColor("Background colour", () => b.s.bg, (d, v) => { at(d).s.bg = v; }, { empty: true, help: "Default: the main button colour." }),
        fColor("Fade to a second colour", ...p("bg2"), { empty: true }),
        fColor("Text colour", ...p("textColor")),
        fNum("Height", ...p("height"), 80, 900),
        fText("Button words (leave empty for no button)", ...p("btn")), fTarget("Button goes to", ...p("to"))];
      case "video": return [fText("YouTube or Vimeo link", ...p("url"), { placeholder: "https://www.youtube.com/watch?v=…", help: "Copy the video's link from YouTube or Vimeo and paste it here." }),
        fSeg("Shape", ...p("ratio"), [["16:9", "Wide"], ["4:3", "TV"], ["1:1", "Square"], ["9:16", "Tall (Shorts)"]])];
      case "divider": return [fSeg("Line", ...p("look"), [["line", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"], ["double", "Double"]]),
        fNum("Thickness", ...p("thick"), 1, 12), fColor("Colour", ...p("color"), { empty: true })];
      case "spacer": return [fNum("Height", ...p("h"), 4, 400)];
      default: return [h("p", { class: "f__h" }, "This section shows the chosen fighters. Change how it looks under Look, or its title under Title.")];
    }
  }

  // the text box with buttons for bold, italic, links and lists
  function textField(b, p) {
    const [get, set] = p("text");
    const ta = h("textarea", { class: "in", rows: 7, value: get() });
    ta.addEventListener("input", () => edit((d) => set(d, ta.value), `text:${b.id}`));
    const wrapSel = (before, after = before) => {
      const { selectionStart: a, selectionEnd: z, value } = ta;
      const mid = value.slice(a, z) || "text";
      ta.value = value.slice(0, a) + before + mid + after + value.slice(z);
      ta.focus();
      ta.setSelectionRange(a + before.length, a + before.length + mid.length);
      ta.dispatchEvent(new Event("input"));
    };
    let to = "";
    const linkRow = h("div", { class: "item", hidden: true },
      targetSelect(() => to, (d, v) => { to = v; }, { local: true }),
      h("button", { type: "button", class: "b b--s b--p", style: "margin-top:6px", onclick: () => {
        const t = D.target(to);
        if (!t) return toast("Choose where the link goes first.");
        linkRow.hidden = true;
        wrapSel("[", `](${t})`);
      } }, "Make the chosen words a link"));
    const tools = h("div", { class: "toolbar" },
      h("button", { type: "button", class: "b b--s", title: "Bold", onclick: () => wrapSel("**") }, h("b", {}, "B")),
      h("button", { type: "button", class: "b b--s", title: "Italic", onclick: () => wrapSel("*") }, h("i", {}, "I")),
      h("button", { type: "button", class: "b b--s", title: "Link", onclick: () => { linkRow.hidden = !linkRow.hidden; } }, "🔗 Link"),
      h("button", { type: "button", class: "b b--s", title: "List", onclick: () => {
        const { selectionStart: a, value } = ta;
        const lineStart = value.lastIndexOf("\n", a - 1) + 1;
        ta.value = `${value.slice(0, lineStart)}- ${value.slice(lineStart)}`;
        ta.dispatchEvent(new Event("input"));
      } }, "• List"));
    return field("Text", h("div", {}, tools, linkRow, ta), "Select words and press B to make them bold. An empty line starts a new paragraph; lines starting with “- ” make a list.");
  }

  // ---- pages
  function uniqueId(name) {
    const base = (name || "page").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "page";
    let id = base;
    for (let n = 2; design.pages.some((p) => p.id === id); n++) id = `${base}-${n}`;
    return id;
  }
  function panelPages(root) {
    root.append(h("h2", {}, "Pages"), h("p", { class: "intro" }, "The first page is the home page. Drag ⠿ to change the order (it's also the menu's order). Click a page's name to work on it."));
    const list = h("ul", { class: "list" }, design.pages.map((pg, i) => h("li", { class: `li${pg.id === pageId ? " on" : ""}`, "data-id": pg.id }, dragHandle(),
      h("button", { type: "button", class: "li__name", onclick: () => { pageId = pg.id; selBid = null; drawPanel(); drawBar(); send(); } },
        pg.name, i === 0 && h("span", { class: "badge" }, "Home"), h("small", {}, `${pg.blocks.length} section${pg.blocks.length === 1 ? "" : "s"}${pg.menu ? " · in the menu" : ""}`)),
      h("button", { type: "button", class: "b b--s", title: "Make a copy of this page", onclick: () => {
        const np = { ...copy(pg), id: uniqueId(`${pg.name} copy`), name: `${pg.name} (copy)`, blocks: pg.blocks.map((x) => ({ ...copy(x), id: D.bid() })) };
        edit((d) => d.pages.splice(d.pages.indexOf(page(d)) + 1, 0, np));
        pageId = np.id;
        drawPanel();
      } }, "Copy"),
      design.pages.length > 1 && h("button", { type: "button", class: "b b--s b--d", onclick: () => {
        if (!confirm(`Delete the “${pg.name}” page and everything on it?`)) return;
        edit((d) => { d.pages = d.pages.filter((x) => x.id !== pg.id); });
        fix();
        drawPanel();
        drawBar();
        toast(`Deleted the “${pg.name}” page.`, ["Undo", undo]);
      } }, "Delete"))));
    dragSort(list, (order) => edit((d) => { d.pages = order.map((id) => d.pages.find((x) => x.id === id)); }, null, true));
    root.append(list);

    const name = h("input", { class: "in", placeholder: "Name, e.g. Stats" });
    const kind = h("select", { class: "in" }, Object.entries(D.PAGE_TEMPLATES).map(([k, [t]]) => h("option", { value: k }, t)));
    root.append(group("Add a page", true, field("Name", name), field("Start with", kind),
      h("button", { type: "button", class: "b b--p b--w", onclick: () => {
        const nm = name.value.trim() || "New page";
        const np = { id: uniqueId(nm), name: nm, tab: "", menu: true, cols: kind.value === "compare" ? 2 : 1, split: 50, bg: "", blocks: fresh(D.PAGE_TEMPLATES[kind.value][1]()) };
        edit((d) => d.pages.push(np));
        pageId = np.id;
        selBid = null;
        drawPanel();
        drawBar();
        send();
        toast(`Added the “${nm}” page. It's in the menu; buttons can open it too.`);
      } }, "Add the page")));

    const pg = page();
    const pp = (k) => [() => page()[k], (d, v) => { page(d)[k] = v; }];
    root.append(group(`This page: “${pg.name}”`, true,
      fText("Name (in the menu)", ...pp("name"), { max: 60 }),
      fText("Browser tab title", ...pp("tab"), { placeholder: `${pg.name} · ${design.texts.tabTitle}` }),
      fToggle("Show it in the menu", ...pp("menu")),
      fSeg("Columns on computer screens", ...pp("cols"), [[1, "One"], [2, "Two"], [3, "Three"]]),
      fColor("Page background colour", ...pp("bg"), { empty: true, help: "Default: the site's background colour (Style)." })));

    const pageOpts = (none) => [["", none], ...design.pages.map((x) => [x.id, `The “${x.name}” page`])];
    const lk = (k) => [() => design.links[k], (d, v) => { d.links[k] = v; }];
    root.append(group("Where the site's own buttons go", true,
      h("p", { class: "tip" }, "To make one of your own buttons open a page: add a Buttons section and pick the page under “Where it goes”."),
      fSelect("Compare button, and picking two fighters", ...lk("compare"), pageOpts("The comparison on the same page"),
        { help: "Pick a page to have the comparison open on a page of its own." }),
      fSelect("Tapping an upcoming fight", ...lk("upcoming"), pageOpts("Same as the Compare button")),
      fSelect("The logo at the top", ...lk("logo"), pageOpts("The home page"))));
  }

  // ---- style
  function panelStyle(root) {
    root.append(h("h2", {}, "Style"), h("p", { class: "intro" }, "Colours, fonts, shapes and spacing for the whole site. A single section's own colours are in its settings (Sections)."));
    root.append(group("Ready-made looks", true, h("p", { class: "f__h", style: "margin-top:0" }, "A starting point: it changes the colours, fonts and shapes. Undo (↶) goes back."),
      h("div", { class: "looks" }, Object.entries(D.PRESETS).map(([k, pr]) => {
        const c = pr.look === "dark" ? { ...D.DARK, ...pr.colors.dark } : { ...D.LIGHT, ...pr.colors.light };
        return h("button", { type: "button", class: "look", onclick: () => { edit((d) => D.applyPreset(d, k), null, true); toast(`“${pr.name}” look applied.`, ["Undo", undo]); } },
          h("div", { class: "look__sw" }, [c.bg, c.surface, c.accent, c.red, c.blue].map((x) => h("span", { style: `background:${x}` }))), h("b", {}, pr.name));
      }))));
    root.append(group("Light or dark", true,
      fSeg("The site is", () => design.look, (d, v) => { d.look = v; }, [["auto", "Light or dark (follows the device)"], ["light", "Always light"], ["dark", "Always dark"]]),
      h("p", { class: "f__h" }, "Phones and computers set to dark mode see the dark colours when it follows the device. The preview's ☀ / ☾ buttons show either.")));

    const modeSeg = segButtons([["light", "☀ Light colours"], ["dark", "☾ Dark colours"]], () => colorMode, (v) => {
      colorMode = v;
      P.look = v;
      bar.look.update();
      send();
      drawPanel();
    });
    const other = colorMode === "light" ? "dark" : "light";
    root.append(group("Colours", false, modeSeg, h("p", { class: "f__h" }, `Changing the ${colorMode} colours (the preview shows them).`),
      D.COLORS.map(([k, name]) => fColor(name, () => design.colors[colorMode][k], (d, v) => { d.colors[colorMode][k] = v; },
        { reset: () => (colorMode === "light" ? D.LIGHT : D.DARK)[k] })),
      h("div", { class: "btns" },
        h("button", { type: "button", class: "b b--s", onclick: () => { edit((d) => { d.colors[other] = { ...d.colors[colorMode] }; }); toast(`Copied to the ${other} colours.`, ["Undo", undo]); } }, `Use these for ${other} too`),
        h("button", { type: "button", class: "b b--s", onclick: () => edit((d) => { d.colors[colorMode] = { ...(colorMode === "light" ? D.LIGHT : D.DARK) }; }, null, true) }, "Original colours"))));

    const fontOpts = Object.entries(D.FONTS).map(([k, f]) => [k, f.name]);
    const fontSel = (label, k) => {
      const f = fSelect(label, () => design.font[k], (d, v) => { d.font[k] = v; }, fontOpts, { redraw: true });
      for (const o of f.querySelectorAll("option")) o.style.fontFamily = D.FONTS[o.value].stack;
      f.append(h("div", { class: "sample", style: `font-family:${D.FONTS[design.font[k]].stack}` }, "Volkanovski vs Evloev 123"));
      return f;
    };
    const fo = (k) => [() => design.font[k], (d, v) => { d.font[k] = v; }];
    root.append(group("Fonts & text", false,
      fontSel("Text", "body"), fontSel("Titles and names", "heading"), fontSel("Site name (top left)", "brand"),
      fNum("Text size", ...fo("size"), 12, 26),
      fNum("Title size", ...fo("hscale"), 60, 250, { unit: "%" }),
      fSelect("Title thickness", ...fo("hweight"), [[400, "Normal"], [500, "Medium"], [600, "Semi-bold"], [700, "Bold"], [800, "Extra bold"], [900, "Black"]]),
      fToggle("Titles in CAPITALS", ...fo("hcase")),
      fNum("Space between title letters", ...fo("hspace"), -5, 30, { show: (v) => (v ? `${v > 0 ? "+" : ""}${v}` : "normal") }),
      fNum("Space between lines", ...fo("lh"), 100, 220, { show: (v) => `${(v / 100).toFixed(2)}×` })));

    const sh = (k) => [() => design.shape[k], (d, v) => { d.shape[k] = v; }];
    root.append(group("Shapes", false,
      fNum("Card corners", ...sh("radius"), 0, 40),
      fNum("Button corners", () => Math.min(design.shape.btn, 40), (d, v) => { d.shape.btn = v; }, 0, 40),
      fToggle("Fully round buttons (pill)", () => design.shape.btn >= 999, (d, v) => { d.shape.btn = v ? 999 : 12; }, { redraw: true }),
      fNum("Search box corners", ...sh("input"), 0, 30),
      fSeg("Fighter photos", ...sh("photo"), [["circle", "Circle"], ["rounded", "Rounded"], ["square", "Square"]]),
      fNum("Photo size", ...sh("photoSize"), 32, 200),
      fNum("Photo border", ...sh("photoBorder"), 0, 12)));

    const sp = (k) => [() => design.space[k], (d, v) => { d.space[k] = v; }];
    root.append(group("Spacing & width", false,
      fNum("Widest the page gets", () => Math.min(design.space.width, 2600), (d, v) => { d.space.width = v; }, 700, 2600, { step: 20 }),
      fToggle("Use the full screen width", () => design.space.width >= 4000, (d, v) => { d.space.width = v ? 4000 : 1800; }, { redraw: true }),
      fNum("Space at the sides (computers)", ...sp("side"), 0, 120),
      fNum("Space inside cards", ...sp("pad"), 4, 48),
      fNum("Space between sections", ...sp("gap"), 0, 60),
      fNum("Space between columns", ...sp("colgap"), 0, 60),
      fNum("Columns start at screens this wide", ...sp("wide"), 700, 2000, { step: 10, help: "Narrower screens show one section under another." })));

    root.append(group("Cards", false,
      fSeg("Card style", () => design.cards.style, (d, v) => { d.cards.style = v; }, [["filled", "Filled"], ["outline", "Outline"], ["flat", "Flat"], ["glass", "Glass"]]),
      fSeg("Shadow", () => design.cards.shadow, (d, v) => { d.cards.shadow = v; }, [["none", "None"], ["soft", "Soft"], ["strong", "Strong"]]),
      fNum("Border thickness", () => design.cards.border, (d, v) => { d.cards.border = v; }, 0, 6)));
    root.append(group("Buttons", false,
      fSeg("Main buttons", () => design.buttons.style, (d, v) => { d.buttons.style = v; }, [["filled", "Filled"], ["outline", "Outline"], ["soft", "Soft"]]),
      fSeg("Size", () => design.buttons.size, (d, v) => { d.buttons.size = v; }, [["small", "Small"], ["normal", "Normal"], ["large", "Large"]]),
      fToggle("Button words in CAPITALS", () => design.buttons.caps, (d, v) => { d.buttons.caps = v; })));

    const bg = (k) => [() => design.background[k], (d, v) => { d.background[k] = v; }];
    const t = design.background.type;
    root.append(group("Page background", false,
      fSeg("Background", ...bg("type"), [["color", "Colour"], ["gradient", "Fade"], ["image", "Picture"]], { redraw: true }),
      fColor(`Colour (${colorMode} colours)`, () => design.colors[colorMode].bg, (d, v) => { d.colors[colorMode].bg = v; }, { reset: () => (colorMode === "light" ? D.LIGHT : D.DARK).bg }),
      t === "gradient" && fColor("Fades to", ...bg("color2")),
      t === "gradient" && fNum("Direction", ...bg("angle"), 0, 360, { unit: "°" }),
      t === "image" && fImage("Picture", ...bg("image"), { kind: "wide" }),
      t === "image" && fSeg("Picture fills", ...bg("fit"), [["cover", "The whole page"], ["tile", "Repeats (tiles)"]]),
      t === "image" && fNum("Darken the picture", ...bg("dim"), 0, 90, { unit: "%" }),
      t === "image" && fToggle("Picture stays still when scrolling", ...bg("fixed"))));
    root.append(group("Effects", false,
      fToggle("Cards lift up under the mouse", () => design.effects.lift, (d, v) => { d.effects.lift = v; }),
      fSelect("Sections when they come into view", () => design.effects.appear, (d, v) => { d.effects.appear = v; },
        [["none", "Just appear"], ["fade", "Fade in"], ["rise", "Slide up"], ["zoom", "Zoom in"]], { help: "See it with 👆 Try it." })));
  }

  // ---- top bar, menu and bottom of the page
  function panelChrome(root) {
    const hd = (k) => [() => design.header[k], (d, v) => { d.header[k] = v; }];
    const ft = (k) => [() => design.footer[k], (d, v) => { d.footer[k] = v; }];
    const tx = (k) => [() => design.texts[k], (d, v) => { d.texts[k] = v; }];
    const col = (k) => [() => design.colors[colorMode][k], (d, v) => { d.colors[colorMode][k] = v; }];
    root.append(h("h2", {}, "Top bar, menu & bottom"));
    root.append(group("Logo and site name", true,
      fImage("Logo", ...hd("logo"), { kind: "logo", help: "Empty: the UFC HUT icon." }),
      fNum("Logo size", ...hd("logoSize"), 16, 120),
      fToggle("Show the logo", ...hd("showLogo")),
      fToggle("Show the site name", ...hd("showName")),
      fText("Site name", ...tx("brand"), { max: 60 }),
      fToggle("Show when it was last updated", ...hd("showUpdated"))));
    root.append(group("Top bar", true,
      fSeg("Style", ...hd("style"), [["plain", "Plain"], ["accent", "Main colour"], ["clear", "See-through"]]),
      fColor(`Background (${colorMode} colours)`, ...col("headerBg"), { reset: () => (colorMode === "light" ? D.LIGHT : D.DARK).headerBg }),
      fColor(`Text (${colorMode} colours)`, ...col("headerText"), { reset: () => (colorMode === "light" ? D.LIGHT : D.DARK).headerText }),
      fNum("Height", ...hd("height"), 40, 160),
      fToggle("Stays at the top when scrolling", ...hd("sticky"))));
    const pagesIn = design.pages.filter((p) => p.menu).length + design.links.extra.length;
    root.append(group("Menu", true,
      pagesIn < 2 && h("p", { class: "tip" }, "The menu shows once there are two or more pages in it. Add pages in the Pages panel."),
      fSelect("Menu style", ...hd("menu"), [["links", "Links in the top bar"], ["tabs", "Tabs under the top bar"], ["bottom", "A bar at the bottom (phones)"],
        ["button", "A “Menu” button"], ["none", "No menu"]], { help: "Pages are in the menu when “Show it in the menu” is on (Pages panel)." }),
      fSeg("Line up the menu", ...hd("menuAlign"), [["left", "Left"], ["center", "Centre"], ["right", "Right"]]),
      fText("Menu button words", ...tx("menu"), { max: 30 }),
      field("Extra links in the menu (other websites, sections…)", itemsEditor((d) => d.links.extra, (d, v) => { d.links.extra = v; }, (it, i) => {
        const item = (k) => [() => design.links.extra[i][k], (d, v) => { d.links.extra[i][k] = v; }];
        return [fText("Words", ...item("label"), { key: `x${i}` }), fTarget("Goes to", ...item("to"), { key: `x${i}`, newTab: item("newTab") })];
      }, () => ({ label: "Link", to: "", newTab: true }), "+ Add a link", 12))));
    const fg = group("Bottom of the page", true,
      fToggle("Show it", ...ft("show")),
      fText("Words", ...tx("footer"), { multi: true, rows: 3, help: "**bold** and [links](https://…) work here too." }),
      fSeg("Line up", ...ft("align"), [["left", "Left"], ["center", "Centre"], ["right", "Right"]]),
      fColor("Background colour", ...ft("bg"), { empty: true }),
      fColor("Text colour", ...ft("color"), { empty: true }));
    fg.id = "foot-group";
    root.append(fg);
  }

  // ---- words
  const WORD_GROUPS = [
    ["Top and bottom", ["brand", "tabTitle", "updated", "footer", "menu"]],
    ["Search", ["red", "blue", "placeholder", "compare", "swap", "vs"]],
    ["Messages", ["boot", "hint", "loading", "pickOther"]],
    ["Comparison", ["share", "copied", "copyai", "copiedAi", "nextFight", "statsSec", "strikesSec", "noCommon"]],
    ["Fight history", ["historySub", "ufcOnly", "showAll"]],
    ["Upcoming fights", ["liveNow"]],
  ];
  function panelWords(root) {
    const T = Object.fromEntries(D.TEXTS.map(([k, label, dflt]) => [k, [label, dflt]]));
    root.append(h("h2", {}, "Words"), h("p", { class: "intro" }, "Every bit of wording on the site. Words in {curly brackets} are filled in by the site (a name, a number…): keep them as they are. Section titles are in each section's settings."));
    WORD_GROUPS.forEach(([title, keys], i) => {
      root.append(group(title, i === 0, keys.map((k) => {
        const [label, dflt] = T[k];
        const f = fText(label, () => design.texts[k], (d, v) => { d.texts[k] = v; }, { multi: dflt.length > 70, rows: 2, placeholder: dflt });
        if (design.texts[k] !== dflt) f.append(h("button", { type: "button", class: "b b--s", style: "margin-top:4px", onclick: () => edit((d) => { d.texts[k] = dflt; }, null, true) }, "↺ Original wording"));
        return f;
      })));
    });
  }

  // ---- save & share
  async function links() {
    const code = await D.encode(D.sanitize(design));
    return { view: `${ROOT}#d=${code}`, edit: `${ROOT}edit.html#d=${code}`, size: code.length };
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {
      const ta = h("textarea", { value: text, style: "position:fixed;top:0;opacity:0" });
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }
  function linkBox(title, url, help) {
    const inp = h("input", { class: "in", value: url, readOnly: true, onfocus: (e) => e.target.select() });
    return field(title, h("div", {}, inp, h("div", { class: "btns", style: "margin-top:6px" },
      h("button", { type: "button", class: "b b--s b--p", onclick: async () => toast((await copyText(url)) ? "Link copied." : "Couldn't copy: press and hold the link to copy it.") }, "Copy link"),
      navigator.share && h("button", { type: "button", class: "b b--s", onclick: () => navigator.share({ title: "UFC HUT design", url }).catch(() => {}) }, "Send…"),
      h("a", { class: "b b--s", href: url, target: "_blank", rel: "noopener", style: "text-decoration:none" }, "Open it"))), help);
  }
  // the real site's design: the one written into its page (none: the original look)
  async function liveDesign() {
    try {
      const r = await fetch(`${ROOT}index.html`, { cache: "no-cache" });
      const tag = new DOMParser().parseFromString(await r.text(), "text/html").querySelector("#design-data");
      if (tag) return D.sanitize(JSON.parse(tag.textContent));
    } catch { /* none */ }
    return D.sanitize(D.DEFAULT);
  }
  function panelSave(root) {
    root.append(h("h2", {}, "Save & share"),
      h("p", { class: "tip" }, "Your work saves itself on this device as you go. Nothing here changes the real site: a design goes live only when the site's owner puts it there."));
    const out = h("div");
    root.append(group("Show it to someone", true,
      h("p", { class: "f__h", style: "margin-top:0" }, "Makes a link that opens the site with this design (with a purple “Design draft” strip at the top). Send it to the site's owner when it's ready to go live."),
      h("button", { type: "button", class: "b b--p b--w", onclick: async () => {
        const l = await links();
        out.replaceChildren(
          linkBox("Link to see the design", l.view),
          linkBox("Link to keep editing it (on another phone or computer)", l.edit),
          l.size > 30000 && h("p", { class: "warnbox" }, "These links are long because of the pictures in the design. If one won't send, use “Save design file” below and send the file instead."));
      } }, "Make the links"), out));

    const name = h("input", { class: "in", placeholder: "Name, e.g. Dark version" });
    const vlist = h("ul", { class: "list" }, h("li", { class: "muted" }, "Loading…"));
    const drawVersions = async () => {
      const list = await versions();
      vlist.replaceChildren(...(list.length ? list.map((v) => h("li", { class: "li" },
        h("div", { class: "li__name", style: "cursor:default" }, v.name, h("small", {}, new Date(v.t).toLocaleString())),
        h("button", { type: "button", class: "b b--s", onclick: () => replace(D.sanitize(v.design), `Opened “${v.name}”. Undo goes back.`) }, "Open"),
        h("button", { type: "button", class: "b b--s b--d", onclick: async () => {
          if (!confirm(`Delete the saved version “${v.name}”?`)) return;
          await store.set("versions", (await versions()).filter((x) => x.id !== v.id));
          drawVersions();
        } }, "Delete"))) : [h("li", { class: "muted" }, "None yet.")]));
    };
    drawVersions();
    root.append(group("Saved versions", true,
      h("p", { class: "f__h", style: "margin-top:0" }, "Keep a copy of the design as it is now, to come back to later (on this device)."),
      h("div", { class: "row", style: "margin-bottom:10px" }, name, h("button", { type: "button", class: "b b--p", onclick: async () => {
        await addVersion(name.value.trim() || `Version of ${new Date().toLocaleString()}`, copy(design));
        name.value = "";
        drawVersions();
        toast("Saved.");
      } }, "Save")), vlist));

    const file = h("input", { type: "file", accept: ".json,application/json,text/plain", hidden: true, onchange: async () => {
      const f = file.files[0];
      if (!f) return;
      try { replace(D.sanitize(JSON.parse(await f.text())), "Design file opened. Undo goes back."); } catch { toast("That file isn't a UFC HUT design."); }
    } });
    root.append(group("Design file", false,
      h("p", { class: "f__h", style: "margin-top:0" }, "The whole design in one file: to keep, or to send by email or AirDrop."),
      h("div", { class: "btns" },
        h("button", { type: "button", class: "b", onclick: () => {
          const blob = new Blob([JSON.stringify(D.sanitize(design))], { type: "application/json" });
          const a = h("a", { href: URL.createObjectURL(blob), download: `ufc-hut-design-${new Date().toISOString().slice(0, 10)}.json` });
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        } }, "Save design file"),
        h("button", { type: "button", class: "b", onclick: () => file.click() }, "Open a design file"), file)));
    root.append(group("Start over", false,
      h("p", { class: "f__h", style: "margin-top:0" }, "Go back to the design the real site has now. (Save a version first if you might want this one back; Undo also works.)"),
      h("button", { type: "button", class: "b b--d", onclick: async () => {
        if (!confirm("Go back to the real site's design?")) return;
        replace(await liveDesign(), "Back to the real site's design. Undo goes back.");
      } }, "Go back to the real site's design")));
  }

  // ------------------------------------------------------------- start
  function welcome() {
    try { if (localStorage.getItem("ufchut-editor-welcomed")) return; } catch { return; }
    const box = h("div", { class: "welcome" }, h("div", { class: "welcome__box" },
      h("h2", {}, "Welcome to the design editor"),
      h("ol", {},
        h("li", {}, "Click anything in the preview to change it: its words, colours, pictures, size and place."),
        h("li", {}, "The panels on the side do the rest: sections, pages, colours and fonts, the menu, all the wording."),
        h("li", {}, "Buttons can open a page of their own: add pages under Pages, then pick one under a button's “Where it goes”."),
        h("li", {}, "Your work saves itself on this device. When you're happy, go to Save & share and send the link.")),
      h("p", { class: "tip" }, "Nothing you do here changes the real site."),
      h("button", { type: "button", class: "b b--p b--w", onclick: () => { box.remove(); try { localStorage.setItem("ufchut-editor-welcomed", "1"); } catch { /* fine */ } } }, "Start")));
    document.body.append(box);
  }
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
  });
  async function start() {
    document.head.append(h("style", {}, D.fontFaces(Object.keys(D.HOSTED), ROOT)));
    buildBar();
    const work = await store.get("work");
    const m = location.hash.match(/^#d=([zj][A-Za-z0-9_-]{4,})$/);
    const opened = m ? await D.decode(m[1]) : null;
    if (opened) {
      if (work?.design) await addVersion("Before opening a link", work.design);
      design = opened;
    } else if (work?.design) {
      design = D.sanitize(work.design);
      pageId = work.page || pageId;
    } else {
      design = await liveDesign();
    }
    if (m) history.replaceState(null, "", location.pathname + location.search);
    fix();
    drawBar();
    drawTabs();
    drawPanel();
    bar.saved.textContent = work ? "Saved on this device ✓" : "";
    frame.src = `${ROOT}index.html?preview=1`;
    layoutFrame();
    if ("ResizeObserver" in window) new ResizeObserver(layoutFrame).observe($("#stage"));
    else addEventListener("resize", layoutFrame);
    if (opened) {
      saveSoon();
      toast(work?.design ? "Opened the design from the link. Your earlier work is under Save & share → Saved versions." : "Opened the design from the link.");
    }
    welcome();
  }
  start();
})();
