(() => {
  "use strict";

  // ---------------------------------------------------------------------
  // Categories. Content (files, titles, order, columns) comes from
  // data/gallery.js, which the admin page writes.
  // ---------------------------------------------------------------------
  const CATEGORIES = {
    productions: { label: "Productions", eyebrow: "Record", glow: "#ff2438", aspect: 16 / 9, columns: 3, kind: "video", blanks: 9 },
    motion: { label: "Motion Graphics", eyebrow: "Play", glow: "#2f86ff", aspect: 16 / 9, columns: 3, kind: "video", blanks: 9 },
    social: { label: "Social Media", eyebrow: "Pause", glow: "#8fc2ff", aspect: 9 / 16, columns: 6, kind: "video", blanks: 12, focusScale: 1.1, rowGap: 0.1 },
    projects: { label: "Projects", eyebrow: "Stop", glow: "#eef2f7", aspect: 4 / 3, columns: 3, kind: "image", blanks: 9, isProjects: true },
  };

  const gallery = document.getElementById("gallery");
  if (!gallery) return;

  const data = (window.GALLERY_DATA && window.GALLERY_DATA.categories) || {};
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = matchMedia("(hover: hover) and (pointer: fine)").matches;

  const $ = (sel, root = gallery) => root.querySelector(sel);
  const stage = $(".g-stage");
  const world = $(".g-world");
  const info = $(".g-info");
  const zones = {};
  gallery.querySelectorAll(".g-zone").forEach((z) => { zones[z.dataset.dir] = z; });
  const transport = [...gallery.querySelectorAll(".g-tbtn")];

  const pad = (n) => String(n).padStart(2, "0");
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lockScroll = (on) => document.documentElement.classList.toggle("g-lock", on);
  // history can be locked down inside some embedded frames; the gallery works without it
  const setHistory = (method, stateObj, url) => {
    try { history[method](stateObj, "", url); } catch {}
  };

  // Runs cb after an element's transition, with a timeout fallback
  // (reduced-motion settings remove transitions entirely).
  const afterTransition = (el, ms, cb) => {
    let done = false;
    const finish = () => { if (done) return; done = true; el.removeEventListener("transitionend", onEnd); cb(); };
    const onEnd = (e) => { if (e.target === el) finish(); };
    el.addEventListener("transitionend", onEnd);
    setTimeout(finish, reduceMotion ? 0 : ms + 80);
  };

  const state = {
    open: false,
    cat: null,
    cfg: null,
    items: [],
    cols: 1,
    rows: 1,
    index: 0,
    target: { x: 0, y: 0 },
    cur: { x: 0, y: 0 },
    depth: 0,
    tiles: [],
    m: null,
    raf: 0,
    last: 0,
    pointer: null,
    playing: null,
    origin: null,
  };

  // ---------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------
  function itemsFor(cat) {
    const cfg = CATEGORIES[cat];
    const list = data[cat] && Array.isArray(data[cat].items) ? data[cat].items : [];
    if (list.length) return list;
    // No content yet: blank tiles so the wall still reads as a gallery.
    return Array.from({ length: cfg.blanks }, (_, i) => ({
      id: "blank-" + i,
      blank: true,
      title: cfg.isProjects ? "Project Name" : "",
    }));
  }

  function columnsFor(cat, n) {
    const c = parseInt(data[cat] && data[cat].columns, 10) || CATEGORIES[cat].columns;
    return clamp(c, 1, Math.max(1, n));
  }

  // The media shown on a tile: the item itself, or a project's first file.
  function coverOf(item) {
    if (state.cfg.isProjects) return (item.media && item.media[0]) || null;
    return item.src ? item : null;
  }

  // ---------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------
  function measure() {
    const cfg = state.cfg;
    const vw = innerWidth;
    const vh = innerHeight;
    const mobile = vw < 760;
    const a = cfg.aspect;
    let h;
    if (a >= 1) {
      h = mobile
        ? Math.min((vw * 0.84) / a, vh * 0.34)
        : Math.min(vh * (cfg.isProjects ? 0.52 : 0.4), (vw * (cfg.isProjects ? 0.44 : 0.4)) / a);
    } else {
      h = mobile ? Math.min(vh * 0.5, (vw * 0.6) / a) : vh * 0.6;
    }
    const w = h * a;
    const gap = Math.round(Math.max(12, Math.min(vw, vh) * 0.03));
    const rowGap = cfg.rowGap ? Math.max(gap, vh * cfg.rowGap) : gap;
    const cx = mobile ? vw / 2 : vw * 0.62;
    const cy = mobile ? vh * 0.53 : vh * 0.5;
    state.m = {
      w, h, gap, rowGap, cx, cy, vw, vh, mobile,
      // radii of the curved wall (bigger = flatter)
      R: Math.max(vw, 900) * 1.2,
      Rv: Math.max(vh, 700) * 1.5,
    };
    const s = gallery.style;
    s.setProperty("--tw", w + "px");
    s.setProperty("--th", h + "px");
    s.setProperty("--cx", cx + "px");
    s.setProperty("--cy", cy + "px");
    positionZones();
  }

  // Arrow zones cover the neighbouring tiles; hovering one moves that way.
  function positionZones() {
    const { w, h, gap, rowGap, cx, cy, vw, vh, mobile } = state.m;
    const s = state.cfg.focusScale || 1;
    const fw = w * s;
    const fh = h * s;
    const top = cy - fh / 2;
    const bottom = cy + fh / 2;
    const leftW = mobile ? Math.min(56, cx - fw / 2) : Math.min(170, w * 0.45);
    const place = (z, x, y, zw, zh) => Object.assign(z.style, {
      left: x + "px", top: y + "px", width: Math.max(0, zw) + "px", height: Math.max(0, zh) + "px",
    });
    place(zones.up, cx - fw / 2, 0, fw, Math.max(56, top - rowGap / 2));
    place(zones.down, cx - fw / 2, bottom + rowGap / 2, fw, Math.max(56, vh - bottom - rowGap / 2));
    place(zones.right, cx + fw / 2 + gap / 2, top, vw - (cx + fw / 2 + gap / 2), fh);
    place(zones.left, cx - fw / 2 - gap / 2 - leftW, top, leftW, fh);
  }

  // ---------------------------------------------------------------------
  // Tiles
  // ---------------------------------------------------------------------
  function build() {
    // stop any downloads from the previous gallery
    world.querySelectorAll("video").forEach((v) => { v.pause(); v.removeAttribute("src"); v.load(); });
    world.textContent = "";
    state.playing = null;
    state.tiles = state.items.map((item, i) => {
      const el = document.createElement("div");
      el.className = "tile";
      el.dataset.index = i;
      const media = document.createElement("div");
      media.className = "tile-media";
      const shade = document.createElement("div");
      shade.className = "tile-shade";
      el.append(media, shade);
      world.append(el);
      return { el, media, item, i, x: i % state.cols, y: Math.floor(i / state.cols), loaded: false, video: null, hidden: false };
    });
  }

  // Media is attached only once a tile comes near the view.
  function loadTile(t) {
    if (t.loaded) return;
    t.loaded = true;
    const cover = coverOf(t.item);
    if (!cover || !cover.src) return;
    if (cover.type === "video") {
      const v = document.createElement("video");
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = "metadata";
      v.setAttribute("muted", "");
      v.setAttribute("playsinline", "");
      if (cover.poster) v.poster = cover.poster;
      v.src = cover.src + (cover.poster ? "" : "#t=0.1");
      t.media.append(v);
      t.video = v;
      const dot = document.createElement("span");
      dot.className = "tile-kind";
      t.el.append(dot);
    } else {
      const img = document.createElement("img");
      img.alt = t.item.title || "";
      img.decoding = "async";
      img.draggable = false;
      img.src = cover.src;
      t.media.append(img);
    }
  }

  function render() {
    const { w, h, gap, rowGap, R, Rv } = state.m;
    const { cur } = state;
    const focusScale = state.cfg.focusScale || 1;
    for (const t of state.tiles) {
      const dx = t.x - cur.x;
      const dy = t.y - cur.y;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (ax > 3.4 || ay > 2.8) {
        if (!t.hidden) { t.el.style.visibility = "hidden"; t.hidden = true; }
        continue;
      }
      if (t.hidden) { t.el.style.visibility = ""; t.hidden = false; }
      if (ax < 2.6 && ay < 2.2) loadTile(t);

      // Wrap the flat grid onto the inside of a sphere: edges bend toward you.
      const th = (dx * (w + gap)) / R;
      const ph = (dy * (h + rowGap)) / Rv;
      const x = R * Math.sin(th);
      const y = Rv * Math.sin(ph);
      const z = R * (1 - Math.cos(th)) + Rv * (1 - Math.cos(ph)) + state.depth;
      const dist = Math.hypot(dx, dy * 1.1);
      const g = Math.max(0, 1 - dist * 1.6);
      const s = 1 + (focusScale - 1) * g;

      t.el.style.transform =
        `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px) ` +
        `rotateY(${(-th).toFixed(4)}rad) rotateX(${ph.toFixed(4)}rad) scale(${s.toFixed(4)})`;
      t.el.style.zIndex = String(200 - Math.round(dist * 20));
      const st = t.el.style;
      st.setProperty("--g", g.toFixed(3));
      st.setProperty("--d", Math.min(1, dist * 0.82).toFixed(3));
      st.setProperty("--sx", (50 - clamp(dx, -1, 1) * 48).toFixed(1) + "%");
      st.setProperty("--sy", (50 - clamp(dy, -1, 1) * 48).toFixed(1) + "%");
    }
  }

  // ---------------------------------------------------------------------
  // Motion loop: everything eases toward the target, frame-rate independent
  // ---------------------------------------------------------------------
  function frame(now) {
    const dt = Math.min(0.05, (now - state.last) / 1000 || 1 / 60);
    state.last = now;
    const k = reduceMotion ? 1 : 1 - Math.pow(1 - 0.085, dt * 60);
    const kd = reduceMotion ? 1 : 1 - Math.pow(1 - 0.07, dt * 60);
    const { cur, target } = state;
    cur.x += (target.x - cur.x) * k;
    cur.y += (target.y - cur.y) * k;
    state.depth += (0 - state.depth) * kd;

    const settled = Math.abs(target.x - cur.x) < 0.0015 && Math.abs(target.y - cur.y) < 0.0015 && Math.abs(state.depth) < 0.5;
    if (settled) {
      cur.x = target.x;
      cur.y = target.y;
      state.depth = 0;
    }
    render();
    if (settled) {
      state.raf = 0;
      syncPlayback();
    } else {
      state.raf = requestAnimationFrame(frame);
    }
  }

  function kick() {
    if (state.raf || !state.open) return;
    state.last = performance.now();
    state.raf = requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------
  function neighbour(dir) {
    const i = state.index;
    const n = state.items.length;
    const { cols, rows } = state;
    const y = Math.floor(i / cols);
    if (dir === "right") return i + 1 < n ? i + 1 : -1;       // runs on into the next row
    if (dir === "left") return i - 1;
    if (dir === "down") return y + 1 < rows ? Math.min(i + cols, n - 1) : -1;
    if (dir === "up") return y > 0 ? i - cols : -1;
    return -1;
  }

  function move(dir) {
    const j = neighbour(dir);
    if (j < 0) return false;
    focusIndex(j);
    return true;
  }

  function focusIndex(j) {
    if (j === state.index && state.tiles[j] && state.tiles[j].el.classList.contains("is-focus")) return;
    const prev = state.tiles[state.index];
    if (prev) prev.el.classList.remove("is-focus");
    state.index = j;
    state.target.x = j % state.cols;
    state.target.y = Math.floor(j / state.cols);
    state.tiles[j].el.classList.add("is-focus");
    stopPlayback();
    updateInfo();
    updateZones();
    kick();
  }

  function updateZones() {
    for (const dir in zones) {
      const off = neighbour(dir) < 0;
      zones[dir].disabled = off;
      if (off && hover.dir === dir) disarm();
    }
  }

  function updateInfo() {
    const item = state.items[state.index];
    $(".g-count").innerHTML = `<b>${pad(state.index + 1)}</b> / ${pad(state.items.length)}`;
    $(".g-item-title").textContent = (item && item.title) || "";
  }

  // Hovering an arrow zone moves once after a short pause, then keeps going.
  const hover = { dir: null, timer: 0 };
  function arm(dir) {
    disarm();
    if (zones[dir].disabled) return;
    hover.dir = dir;
    zones[dir].classList.add("is-armed");
    const step = () => {
      if (!move(hover.dir)) { disarm(); return; }
      hover.timer = setTimeout(step, 1000);
    };
    hover.timer = setTimeout(step, 420);
  }
  function disarm() {
    clearTimeout(hover.timer);
    if (hover.dir && zones[hover.dir]) zones[hover.dir].classList.remove("is-armed");
    hover.dir = null;
  }

  for (const dir in zones) {
    const z = zones[dir];
    z.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") arm(dir); });
    z.addEventListener("pointerleave", disarm);
    z.addEventListener("click", () => {
      // a click moves right away and restarts the hover rhythm
      const wasArmed = hover.dir === dir;
      move(dir);
      if (wasArmed) arm(dir);
    });
  }

  // Wheel / trackpad: one step per gesture.
  const wheel = { x: 0, y: 0, lock: 0 };
  gallery.addEventListener("wheel", (e) => {
    if (!state.open || viewerOpen() || projectOpen()) return;
    e.preventDefault();
    const now = performance.now();
    if (now < wheel.lock) { wheel.x = wheel.y = 0; return; }
    wheel.x += e.shiftKey ? e.deltaY : e.deltaX;
    wheel.y += e.shiftKey ? 0 : e.deltaY;
    let dir = null;
    if (Math.abs(wheel.y) > 40 && Math.abs(wheel.y) >= Math.abs(wheel.x)) {
      dir = wheel.y > 0 ? "down" : "up";
      if (neighbour(dir) < 0) dir = wheel.y > 0 ? "right" : "left";
    } else if (Math.abs(wheel.x) > 40) {
      dir = wheel.x > 0 ? "right" : "left";
    }
    if (dir) {
      move(dir);
      wheel.x = wheel.y = 0;
      wheel.lock = now + 480;
    }
  }, { passive: false });

  // Touch: swipe to move, tap to open.
  const swipe = { x: 0, y: 0, active: false, moved: false };
  stage.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    swipe.active = true;
    swipe.moved = false;
    swipe.x = e.clientX;
    swipe.y = e.clientY;
  });
  stage.addEventListener("pointerup", (e) => {
    if (!swipe.active) return;
    swipe.active = false;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 36) return;
    swipe.moved = true;
    if (Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? "right" : "left");
    else move(dy < 0 ? "down" : "up");
  });
  stage.addEventListener("pointercancel", () => { swipe.active = false; });

  world.addEventListener("click", (e) => {
    if (swipe.moved) { swipe.moved = false; return; }
    const tileEl = e.target.closest(".tile");
    if (!tileEl) return;
    const i = Number(tileEl.dataset.index);
    if (i === state.index) openItem(i);
    else focusIndex(i);
  });

  // ---------------------------------------------------------------------
  // Hover autoplay (touch screens: the focused video plays by itself)
  // ---------------------------------------------------------------------
  gallery.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    state.pointer = { x: e.clientX, y: e.clientY };
    if (!state.raf) syncPlayback();
  }, { passive: true });
  gallery.addEventListener("pointerleave", () => { state.pointer = null; syncPlayback(); });

  function syncPlayback() {
    if (!state.open || viewerOpen() || projectOpen()) { stopPlayback(); return; }
    const t = state.tiles[state.index];
    let want = null;
    if (t && t.video) {
      if (!canHover) want = t.video;
      else if (state.pointer) {
        const r = t.el.getBoundingClientRect();
        const p = state.pointer;
        if (p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom) want = t.video;
      }
    }
    if (state.playing && state.playing !== want) stopPlayback();
    if (want && want.paused) {
      want.muted = true;
      const pr = want.play();
      if (pr) pr.catch(() => {});
      state.playing = want;
      t.el.classList.add("is-playing");
    }
  }

  function stopPlayback() {
    if (!state.playing) return;
    state.playing.pause();
    const el = state.playing.closest(".tile");
    if (el) el.classList.remove("is-playing");
    state.playing = null;
  }

  // ---------------------------------------------------------------------
  // Category + open / close
  // ---------------------------------------------------------------------
  function setCategory(cat, mode) {
    if (mode === "switch" && cat === state.cat) return;
    const apply = () => {
      stopPlayback();
      disarm();
      state.cat = cat;
      state.cfg = CATEGORIES[cat];
      state.items = itemsFor(cat);
      state.cols = columnsFor(cat, state.items.length);
      state.rows = Math.ceil(state.items.length / state.cols);
      state.index = 0;
      gallery.dataset.cat = cat;
      gallery.style.setProperty("--glow", state.cfg.glow);
      $(".g-eyebrow").textContent = state.cfg.eyebrow;
      $(".g-title").textContent = state.cfg.label;
      transport.forEach((b) => b.setAttribute("aria-current", String(b.dataset.cat === cat)));

      measure();
      build();
      state.target = { x: 0, y: 0 };
      // fly in from depth, sweeping across from the lower right
      state.cur = mode === "intro" ? { x: 1.4, y: 0.9 } : { x: 1.8, y: 0 };
      state.depth = reduceMotion ? 0 : mode === "intro" ? -900 : -420;
      state.tiles[0].el.classList.add("is-focus");
      updateInfo();
      updateZones();
      render();
      kick();
      world.classList.remove("is-leaving");
      info.classList.remove("is-leaving");
    };
    if (mode === "switch" && !reduceMotion) {
      world.classList.add("is-leaving");
      info.classList.add("is-leaving");
      setTimeout(apply, 320);
    } else {
      apply();
    }
  }

  function openGallery(cat, originEl) {
    if (!CATEGORIES[cat]) return;
    if (state.open) { setCategory(cat, "switch"); return; }
    state.open = true;
    state.origin = originEl || null;
    setIrisOrigin(originEl);
    gallery.hidden = false;
    lockScroll(true);
    setCategory(cat, "intro");
    void gallery.offsetWidth; // start the iris from its closed size
    gallery.classList.add("is-open");
    gallery.focus({ preventScroll: true });
  }

  function closeGallery() {
    if (!state.open) return;
    closeViewer(true);
    closeProject(true);
    stopPlayback();
    disarm();
    // shrink back into the key that belongs to the current category
    const key = document.querySelector(`.key[href="#${state.cat}"]`);
    setIrisOrigin(key && isOnScreen(key) ? key : null);
    gallery.classList.remove("is-open");
    state.open = false;
    cancelAnimationFrame(state.raf);
    state.raf = 0;
    afterTransition(gallery, 1000, () => {
      if (state.open) return;
      gallery.hidden = true;
      world.textContent = "";
      state.tiles = [];
      lockScroll(false);
      const back = state.origin && document.contains(state.origin) ? state.origin : null;
      if (back) back.focus({ preventScroll: true });
    });
  }

  function setIrisOrigin(el) {
    let x = innerWidth / 2;
    let y = innerHeight / 2;
    if (el) {
      const r = el.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    }
    gallery.style.setProperty("--ox", x + "px");
    gallery.style.setProperty("--oy", y + "px");
  }

  const isOnScreen = (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && r.width > 0;
  };

  transport.forEach((b) => b.addEventListener("click", () => {
    const cat = b.dataset.cat;
    if (cat === state.cat) return;
    setHistory("replaceState", { gallery: cat, pushed: !!(history.state && history.state.pushed) }, "#" + cat);
    setCategory(cat, "switch");
  }));

  // ---------------------------------------------------------------------
  // Viewer: semi-fullscreen image / video that grows out of the tile
  // ---------------------------------------------------------------------
  const viewer = document.getElementById("viewer");
  const panel = viewer.querySelector(".viewer-panel");
  const vMedia = viewer.querySelector(".viewer-media");
  const player = viewer.querySelector(".player");
  const plBar = player.querySelector(".pl-bar");
  const plTime = player.querySelector(".pl-time");
  const vState = { open: false, from: null, video: null, ac: null, idle: 0 };
  const viewerOpen = () => vState.open;

  function fitPanel(aspect) {
    const mobile = innerWidth < 760;
    const maxW = innerWidth * (mobile ? 0.94 : 0.84);
    const maxH = innerHeight * (mobile ? 0.72 : 0.8);
    const w = Math.min(maxW, maxH * aspect);
    panel.style.width = Math.round(w) + "px";
    panel.style.height = Math.round(w / aspect) + "px";
  }

  // FLIP: start the panel on top of the element it came from.
  function flipFrom(el, target) {
    if (!el || reduceMotion) return;
    const a = el.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    if (!a.width || !b.width) return;
    target.style.transition = "none";
    target.style.transform =
      `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) ` +
      `scale(${a.width / b.width}, ${a.height / b.height})`;
    void target.offsetWidth;
    target.style.transition = "";
    target.style.transform = "";
  }

  function openViewer(media, fromEl, fallbackAspect, glow) {
    closeViewer(true);
    vState.open = true;
    vState.from = fromEl;
    viewer.style.setProperty("--glow", glow || state.cfg.glow);
    vMedia.textContent = "";
    const aspect = media && media.w && media.h ? media.w / media.h : fallbackAspect;
    const isVideo = media ? media.type === "video" : state.cfg.kind === "video";
    viewer.hidden = false;
    fitPanel(aspect);

    let video = null;
    if (media && media.src && media.type === "video") {
      video = document.createElement("video");
      video.playsInline = true;
      video.preload = "auto";
      if (media.poster) video.poster = media.poster;
      video.src = media.src;
      vMedia.append(video);
      if (!(media.w && media.h)) {
        video.addEventListener("loadedmetadata", () => {
          if (video.videoWidth) fitPanel(video.videoWidth / video.videoHeight);
        }, { once: true });
      }
    } else if (media && media.src) {
      const img = document.createElement("img");
      img.alt = media.title || "";
      img.src = media.src;
      vMedia.append(img);
      if (!(media.w && media.h)) {
        img.addEventListener("load", () => { if (img.naturalWidth) fitPanel(img.naturalWidth / img.naturalHeight); }, { once: true });
      }
    }

    player.hidden = !isVideo;
    bindPlayer(video);
    flipFrom(fromEl, panel);
    requestAnimationFrame(() => viewer.classList.add("is-open"));
    viewer.focus({ preventScroll: true });
    stopPlayback();
    if (video) {
      const pr = video.play();
      if (pr) pr.catch(() => { video.muted = true; video.play().catch(() => {}); syncPlayerUi(); });
    }
  }

  function closeViewer(instant) {
    if (!vState.open) return;
    vState.open = false;
    if (vState.ac) vState.ac.abort();
    clearTimeout(vState.idle);
    const video = vState.video;
    vState.video = null;
    const finish = () => {
      if (vState.open) return;
      viewer.hidden = true;
      panel.style.transform = "";
      panel.style.opacity = "";
      if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
      vMedia.textContent = "";
    };
    if (video) video.pause();
    viewer.classList.remove("is-open");
    const from = vState.from;
    if (instant || reduceMotion || !from || !document.contains(from)) { finish(); return; }
    // shrink back onto the tile
    const a = from.getBoundingClientRect();
    const b = panel.getBoundingClientRect();
    panel.style.transform =
      `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) ` +
      `scale(${a.width / b.width}, ${a.height / b.height})`;
    panel.style.opacity = "0";
    afterTransition(panel, 650, finish);
    const back = projectOpen() ? project : gallery;
    back.focus({ preventScroll: true });
    setTimeout(syncPlayback, 700);
  }

  const fmt = (s) => {
    if (!isFinite(s)) return "0:00";
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  };

  function syncPlayerUi() {
    const v = vState.video;
    player.classList.toggle("is-playing", !!v && !v.paused);
    player.classList.toggle("is-muted", !!v && v.muted);
    const p = v && v.duration ? (v.currentTime / v.duration) * 100 : 12;
    plBar.style.setProperty("--p", p.toFixed(2) + "%");
    plBar.setAttribute("aria-valuenow", String(Math.round(v ? p : 0)));
    plTime.textContent = v ? `${fmt(v.currentTime)} / ${fmt(v.duration)}` : "0:00";
    player.querySelector(".pl-play").setAttribute("aria-label", v && !v.paused ? "Pause" : "Play");
    player.querySelector(".pl-mute").setAttribute("aria-label", v && v.muted ? "Unmute" : "Mute");
  }

  function bindPlayer(video) {
    vState.video = video;
    vState.ac = new AbortController();
    const opt = { signal: vState.ac.signal };
    player.classList.remove("is-idle");
    syncPlayerUi();
    if (!video) return;

    const toggle = () => { if (video.paused) video.play().catch(() => {}); else video.pause(); };
    ["play", "pause", "timeupdate", "durationchange", "volumechange", "ended"].forEach((ev) =>
      video.addEventListener(ev, () => { syncPlayerUi(); wake(); }, opt));
    player.querySelector(".pl-play").addEventListener("click", toggle, opt);
    player.querySelector(".pl-mute").addEventListener("click", () => { video.muted = !video.muted; }, opt);
    video.addEventListener("click", toggle, opt);

    const seekTo = (clientX) => {
      const r = plBar.getBoundingClientRect();
      const f = clamp((clientX - r.left) / r.width, 0, 1);
      if (video.duration) video.currentTime = f * video.duration;
      plBar.style.setProperty("--p", f * 100 + "%");
    };
    let scrubbing = false;
    plBar.addEventListener("pointerdown", (e) => { scrubbing = true; plBar.setPointerCapture(e.pointerId); seekTo(e.clientX); }, opt);
    plBar.addEventListener("pointermove", (e) => { if (scrubbing) seekTo(e.clientX); }, opt);
    plBar.addEventListener("pointerup", () => { scrubbing = false; }, opt);
    plBar.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { video.currentTime = Math.min(video.duration || 0, video.currentTime + 5); e.preventDefault(); e.stopPropagation(); }
      if (e.key === "ArrowLeft") { video.currentTime = Math.max(0, video.currentTime - 5); e.preventDefault(); e.stopPropagation(); }
    }, opt);

    // controls fade away while watching, come back on movement
    const wake = () => {
      player.classList.remove("is-idle");
      clearTimeout(vState.idle);
      if (!video.paused) vState.idle = setTimeout(() => player.classList.add("is-idle"), 2200);
    };
    panel.addEventListener("pointermove", wake, opt);
    viewer.addEventListener("keydown", wake, opt);
  }

  viewer.querySelector(".viewer-backdrop").addEventListener("click", () => closeViewer());
  viewer.querySelector(".viewer-close").addEventListener("click", () => closeViewer());
  addEventListener("resize", () => {
    if (!vState.open) return;
    const v = vState.video;
    const img = vMedia.querySelector("img");
    if (v && v.videoWidth) fitPanel(v.videoWidth / v.videoHeight);
    else if (img && img.naturalWidth) fitPanel(img.naturalWidth / img.naturalHeight);
  });

  // ---------------------------------------------------------------------
  // Project stack: the project's files, one under the other
  // ---------------------------------------------------------------------
  const project = document.getElementById("project");
  const pScroll = project.querySelector(".project-scroll");
  const pState = { open: false, from: null, io: null };
  const projectOpen = () => pState.open;

  function openProject(item, fromEl) {
    closeProject(true);
    pState.open = true;
    pState.from = fromEl;
    stopPlayback();
    pScroll.textContent = "";
    pScroll.scrollTop = 0;
    const media = item.media && item.media.length ? item.media : [null, null, null];

    pState.io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const v = en.target.querySelector("video");
        if (!v) return;
        if (en.intersectionRatio > 0.6) v.play().catch(() => {});
        else v.pause();
      });
    }, { root: pScroll, threshold: [0, 0.6] });

    media.forEach((m, k) => {
      const card = document.createElement("div");
      card.className = "project-card";
      card.style.setProperty("--k", k);
      if (m && m.src && m.type === "video") {
        const v = document.createElement("video");
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        v.setAttribute("muted", "");
        v.setAttribute("playsinline", "");
        v.preload = "metadata";
        if (m.poster) v.poster = m.poster;
        v.src = m.src + (m.poster ? "" : "#t=0.1");
        card.append(v);
        pState.io.observe(card);
      } else if (m && m.src) {
        const img = document.createElement("img");
        img.alt = m.title || item.title || "";
        img.loading = k > 1 ? "lazy" : "eager";
        img.src = m.src;
        card.append(img);
      }
      if (k === 0) {
        const name = document.createElement("h3");
        name.className = "project-name glow-text";
        name.textContent = item.title || "Untitled project";
        card.append(name);
      }
      card.addEventListener("click", () => {
        const shown = card.querySelector("video");
        if (shown) shown.pause();
        openViewer(m, card, 16 / 9, CATEGORIES.projects.glow);
      });
      pScroll.append(card);
    });

    project.hidden = false;
    const first = pScroll.firstElementChild;
    if (first && fromEl && !reduceMotion) {
      first.style.transition = "none";
      first.style.opacity = "1";
      flipFrom(fromEl, first);
      first.style.transition = "transform 0.75s cubic-bezier(0.2, 0.85, 0.2, 1)";
    }
    requestAnimationFrame(() => project.classList.add("is-open"));
    project.focus({ preventScroll: true });
  }

  function closeProject(instant) {
    if (!pState.open) return;
    pState.open = false;
    if (pState.io) pState.io.disconnect();
    pScroll.querySelectorAll("video").forEach((v) => v.pause());
    project.classList.remove("is-open");
    const finish = () => {
      if (pState.open) return;
      project.hidden = true;
      pScroll.textContent = "";
    };
    if (instant) finish();
    else afterTransition(project, 450, finish);
    if (state.open) gallery.focus({ preventScroll: true });
    setTimeout(syncPlayback, 500);
  }

  project.querySelector(".project-back").addEventListener("click", () => closeProject());

  // ---------------------------------------------------------------------
  // Open the focused item
  // ---------------------------------------------------------------------
  function openItem(i) {
    const t = state.tiles[i];
    if (!t) return;
    disarm();
    if (state.cfg.isProjects) openProject(t.item, t.el);
    else openViewer(t.item.src ? t.item : null, t.el, state.cfg.aspect);
  }

  // ---------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------
  const KEY_DIRS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
  document.addEventListener("keydown", (e) => {
    if (!state.open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (vState.open) closeViewer();
      else if (pState.open) closeProject();
      else requestClose();
      return;
    }
    if (vState.open) {
      if (e.key === " " && vState.video && document.activeElement === viewer) {
        e.preventDefault();
        if (vState.video.paused) vState.video.play().catch(() => {}); else vState.video.pause();
      }
      return;
    }
    if (pState.open) return;
    if (KEY_DIRS[e.key]) { e.preventDefault(); move(KEY_DIRS[e.key]); }
    else if ((e.key === "Enter" || e.key === " ") && (document.activeElement === gallery || document.activeElement === document.body)) {
      e.preventDefault();
      openItem(state.index);
    }
  });

  addEventListener("resize", () => {
    if (!state.open) return;
    measure();
    render();
  });

  // ---------------------------------------------------------------------
  // Routing: #productions, #motion, #social, #projects
  // ---------------------------------------------------------------------
  const catFromHash = () => {
    const h = decodeURIComponent(location.hash.slice(1));
    return CATEGORIES[h] ? h : null;
  };

  function requestClose() {
    if (history.state && history.state.pushed) history.back();
    else {
      setHistory("replaceState", null, location.pathname + location.search);
      closeGallery();
    }
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || gallery.contains(a)) return;
    const cat = a.getAttribute("href").slice(1);
    if (!CATEGORIES[cat]) return;
    e.preventDefault();
    if (!state.open) setHistory("pushState", { gallery: cat, pushed: true }, "#" + cat);
    openGallery(cat, a.closest(".key") || a);
  });

  gallery.querySelector(".g-close").addEventListener("click", requestClose);
  gallery.querySelector(".g-home").addEventListener("click", (e) => { e.preventDefault(); requestClose(); });

  addEventListener("popstate", () => {
    const cat = catFromHash();
    if (cat) openGallery(cat, null);
    else if (state.open) closeGallery();
  });

  const initial = catFromHash();
  if (initial) {
    setHistory("replaceState", { gallery: initial, pushed: false }, "#" + initial);
    openGallery(initial, null);
  }
})();
