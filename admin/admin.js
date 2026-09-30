(() => {
  "use strict";

  const CATS = [
    { key: "productions", label: "Productions", glyph: "record", color: "#ff2438", ratio: "16 / 9" },
    { key: "motion", label: "Motion Graphics", glyph: "play", color: "#2f86ff", ratio: "16 / 9" },
    { key: "social", label: "Social Media", glyph: "pause", color: "#8fc2ff", ratio: "9 / 16" },
    { key: "projects", label: "Projects", glyph: "stop", color: "#eef2f7", ratio: "4 / 3" },
  ];
  const FILE_OK = /\.(jpe?g|png|gif|webp|avif|mp4|webm|mov|m4v)$/i;

  const $ = (id) => document.getElementById(id);
  const ui = {
    app: $("app"), login: $("login"), offline: $("offline"), loginForm: $("login-form"), password: $("password"),
    loginError: $("login-error"), tabs: $("tabs"), crumbs: $("crumbs"), tools: $("panel-tools"), drop: $("drop"),
    dropTitle: $("drop-title"), fileInput: $("file-input"), uploads: $("uploads"), hint: $("hint"), grid: $("grid"),
    empty: $("empty"), saveState: $("save-state"), veil: $("drag-veil"), veilText: $("drag-veil-text"),
    toast: $("toast"), toastText: $("toast-text"), toastUndo: $("toast-undo"), viewSite: $("view-site"),
  };

  const state = { data: null, cat: "productions", project: null, key: "" };
  try { state.key = sessionStorage.getItem("gallery-admin-key") || ""; } catch {}

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const catInfo = (key) => CATS.find((c) => c.key === key);
  const h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") el.className = v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
    return el;
  };
  const prettyName = (file) =>
    file.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/^./, (c) => c.toUpperCase());

  // ---------------------------------------------------------------------
  // Server
  // ---------------------------------------------------------------------
  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: {
        ...(state.key ? { Authorization: "Bearer " + state.key } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const out = await res.json().catch(() => ({}));
    if (res.status === 401) { showOnly("login"); throw new Error("Please sign in again."); }
    if (!res.ok) throw new Error(out.error || `Server error (${res.status}).`);
    return out;
  }

  function uploadFile(file, category, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/upload?category=${encodeURIComponent(category)}&name=${encodeURIComponent(file.name)}`);
      if (state.key) xhr.setRequestHeader("Authorization", "Bearer " + state.key);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      xhr.onload = () => {
        let out = {};
        try { out = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status === 401) showOnly("login");
        if (xhr.status >= 200 && xhr.status < 300) resolve(out);
        else reject(new Error(out.error || `Upload failed (${xhr.status}).`));
      };
      xhr.onerror = () => reject(new Error("Upload failed — is the server still running?"));
      xhr.send(file);
    });
  }

  // ---------------------------------------------------------------------
  // Saving: every change is saved automatically a moment later
  // ---------------------------------------------------------------------
  const save = { timer: 0, running: null, again: false, dirty: false };

  function setSaveState(kind, text) {
    ui.saveState.dataset.state = kind;
    ui.saveState.textContent = text || { saved: "All changes saved", saving: "Saving…", dirty: "Saving…", error: "Couldn't save" }[kind] || "";
  }

  function scheduleSave() {
    save.dirty = true;
    setSaveState("dirty");
    clearTimeout(save.timer);
    save.timer = setTimeout(runSave, 450);
  }

  async function runSave() {
    clearTimeout(save.timer);
    if (save.running) { save.again = true; return save.running; }
    save.dirty = false;
    setSaveState("saving");
    save.running = (async () => {
      try {
        await api("PUT", "/api/gallery", state.data);
        if (!save.dirty) setSaveState("saved");
      } catch (e) {
        save.dirty = true;
        setSaveState("error", "Couldn't save: " + e.message);
        clearTimeout(save.timer);
        save.timer = setTimeout(runSave, 4000); // try again
      }
    })();
    await save.running;
    save.running = null;
    if (save.again) { save.again = false; await runSave(); }
  }

  addEventListener("beforeunload", (e) => {
    if (save.dirty || save.running || uploadsInFlight > 0) { e.preventDefault(); e.returnValue = ""; }
  });

  // ---------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------
  function showOnly(which) {
    ui.app.hidden = which !== "app";
    ui.login.hidden = which !== "login";
    ui.offline.hidden = which !== "offline";
    if (which === "login") setTimeout(() => ui.password.focus(), 50);
  }

  const list = () => {
    const items = state.data.categories[state.cat].items;
    if (state.project) {
      const p = items.find((it) => it.id === state.project);
      return p ? p.media : null;
    }
    return items;
  };
  const currentProject = () => state.project && state.data.categories.projects.items.find((p) => p.id === state.project);

  function go(cat, projectId = null) {
    state.cat = cat;
    state.project = cat === "projects" ? projectId : null;
    if (state.project && !currentProject()) state.project = null;
    history.replaceState(null, "", "#" + cat + (state.project ? "/" + state.project : ""));
    render();
  }

  function render() {
    renderTabs();
    renderPanel();
  }

  function renderTabs() {
    ui.tabs.setAttribute("role", "tablist");
    ui.tabs.replaceChildren(...CATS.map((c) => h("button", {
      class: "tab", type: "button", role: "tab", "aria-selected": String(c.key === state.cat), style: `--c: ${c.color}`,
      onclick: () => go(c.key),
    }, h("span", { class: `glyph glyph-${c.glyph}`, "aria-hidden": "true" }), c.label,
    h("span", { class: "tab-count" }, String(state.data.categories[c.key].items.length)))));
  }

  function renderPanel() {
    const c = catInfo(state.cat);
    const project = currentProject();
    const inProjectsRoot = state.cat === "projects" && !project;
    document.documentElement.style.setProperty("--accent", c.color);
    ui.viewSite.href = "../#" + state.cat;

    // heading
    if (project) {
      const title = h("h1", {}, project.title || "Untitled project");
      ui.crumbs.replaceChildren(
        h("button", { class: "crumb-link", type: "button", onclick: () => go("projects") }, "Projects"),
        h("span", { class: "sep", "aria-hidden": "true" }, "/"),
        title
      );
    } else {
      ui.crumbs.replaceChildren(h("h1", {}, c.label));
    }

    // tools
    const tools = [];
    if (project) {
      const input = h("input", { type: "text", value: project.title, placeholder: "Project name", maxlength: "200" });
      input.addEventListener("input", () => {
        project.title = input.value;
        ui.crumbs.querySelector("h1").textContent = input.value || "Untitled project";
        scheduleSave();
      });
      tools.push(h("label", { class: "field title-field" }, "Name", input));
      tools.push(h("button", { class: "btn btn-danger", type: "button", onclick: () => removeProject(project) }, "Delete project"));
    } else {
      const cols = h("input", { type: "number", min: "1", max: "12", value: String(state.data.categories[state.cat].columns) });
      cols.addEventListener("change", () => {
        const v = Math.min(12, Math.max(1, parseInt(cols.value, 10) || 1));
        cols.value = v;
        state.data.categories[state.cat].columns = v;
        scheduleSave();
      });
      tools.push(h("label", { class: "field", title: "How many tiles sit side by side before the gallery starts a new row" }, "Tiles per row", cols));
      if (inProjectsRoot) tools.push(h("button", { class: "btn btn-primary", type: "button", onclick: newProject }, "+ New project"));
    }
    ui.tools.replaceChildren(...tools);

    ui.dropTitle.textContent = project
      ? "Drop images or videos to add them to this project"
      : inProjectsRoot ? "Drop files to start a new project" : "Drop images or videos here";
    ui.hint.textContent = project
      ? "Drag to change the order. The first file is the project's cover in the gallery."
      : inProjectsRoot
        ? "Drag projects to change their order. Open a project to add or sort its files."
        : "Drag cards to change the order. The first card shows first on the site.";

    // cards
    const items = list() || [];
    ui.grid.style.setProperty("--ratio", project ? "4 / 3" : c.ratio);
    ui.grid.classList.toggle("is-portrait", state.cat === "social");
    ui.grid.replaceChildren(...items.map((it, i) => (inProjectsRoot ? projectCard(it, i) : mediaCard(it, i))));
    ui.empty.hidden = items.length > 0;
    ui.hint.hidden = items.length < 2;
    ui.empty.textContent = inProjectsRoot
      ? "No projects yet. Drop files above, or press “New project”."
      : "Nothing here yet — the site shows blank tiles until you add files. Drop some above.";
  }

  function thumbFor(m) {
    const box = h("div", { class: "thumb" });
    if (!m || !m.src) {
      box.append(h("span", { class: "thumb-empty" }, "No files yet"));
      return box;
    }
    if (m.type === "video") {
      const v = h("video", { muted: true, loop: true, playsinline: true, preload: "metadata", src: "/" + m.src + "#t=0.1" });
      v.muted = true;
      box.addEventListener("pointerenter", () => v.play().catch(() => {}));
      box.addEventListener("pointerleave", () => v.pause());
      box.append(v, h("span", { class: "badge badge-video" }, "Video"));
    } else {
      box.append(h("img", { src: "/" + m.src, alt: "", loading: "lazy", draggable: "false" }), h("span", { class: "badge" }, "Image"));
    }
    return box;
  }

  const trashIcon = () => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.innerHTML = '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />';
    return s;
  };

  function mediaCard(m, i) {
    const title = h("input", { class: "card-title", type: "text", value: m.title || "", placeholder: "Title (optional)", maxlength: "200", "aria-label": "Title" });
    title.addEventListener("input", () => { m.title = title.value; scheduleSave(); });
    const name = m.src.split("/").pop();
    const card = h("li", { class: "card", tabindex: "0", dataset: { id: m.id }, "aria-label": `${m.title || name}, position ${i + 1}` },
      h("div", { style: "position:relative" }, thumbFor(m), h("span", { class: "order" }, String(i + 1))),
      title,
      h("div", { class: "card-row" },
        h("span", { class: "card-meta", title: name }, m.w && m.h ? `${m.w} × ${m.h}` : name.slice(0, 22)),
        h("button", { class: "icon-btn", type: "button", "aria-label": "Remove", title: "Remove", onclick: () => removeMedia(m) }, trashIcon())));
    return card;
  }

  function projectCard(p, i) {
    const title = h("input", { class: "card-title", type: "text", value: p.title || "", placeholder: "Project name", maxlength: "200", "aria-label": "Project name" });
    title.addEventListener("input", () => { p.title = title.value; scheduleSave(); });
    const open = () => go("projects", p.id);
    const card = h("li", { class: "card", tabindex: "0", dataset: { id: p.id }, "aria-label": `${p.title || "Untitled project"}, position ${i + 1}`, ondblclick: open },
      h("div", { style: "position:relative" }, thumbFor(p.media[0]), h("span", { class: "order" }, String(i + 1))),
      title,
      h("div", { class: "card-row" },
        h("span", { class: "card-meta" }, `${p.media.length} file${p.media.length === 1 ? "" : "s"}`),
        h("div", { class: "card-actions" },
          h("button", { class: "btn", type: "button", onclick: open }, "Open"),
          h("button", { class: "icon-btn", type: "button", "aria-label": "Delete project", title: "Delete project", onclick: () => removeProject(p) }, trashIcon()))));
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === card) open(); });
    return card;
  }

  // ---------------------------------------------------------------------
  // Adding files
  // ---------------------------------------------------------------------
  let uploadsInFlight = 0;

  function readSize(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const done = (w, h) => { URL.revokeObjectURL(url); resolve(w && h ? { w, h } : {}); };
      const timer = setTimeout(() => done(), 8000);
      if (/^video\//.test(file.type) || /\.(mp4|webm|mov|m4v)$/i.test(file.name)) {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.muted = true;
        v.onloadedmetadata = () => { clearTimeout(timer); done(v.videoWidth, v.videoHeight); };
        v.onerror = () => { clearTimeout(timer); done(); };
        v.src = url;
      } else {
        const img = new Image();
        img.onload = () => { clearTimeout(timer); done(img.naturalWidth, img.naturalHeight); };
        img.onerror = () => { clearTimeout(timer); done(); };
        img.src = url;
      }
    });
  }

  async function addFiles(fileList) {
    const files = [...fileList].filter((f) => FILE_OK.test(f.name));
    const skipped = fileList.length - files.length;
    if (skipped) showToast(`${skipped} file${skipped === 1 ? " was" : "s were"} skipped — only images and videos can be added.`);
    if (!files.length) return;

    // decide where the files go now, so switching tabs mid-upload is safe
    const cat = state.cat;
    let target = list();
    if (cat === "projects" && !state.project) {
      const p = { id: uid(), title: prettyName(files[0].name), media: [] };
      state.data.categories.projects.items.push(p);
      target = p.media;
      scheduleSave();
      go("projects", p.id);
    }

    // two at a time keeps things quick; results are added in the order picked
    const jobs = files.map((file) => ({ file, row: uploadRow(file), item: undefined }));
    const queue = [...jobs];
    const flush = () => {
      let added = false;
      while (jobs.length && jobs[0].item !== undefined) {
        const { item } = jobs.shift();
        if (item) { target.push(item); added = true; }
      }
      if (!added) return;
      scheduleSave();
      if (list() === target) renderPanel();
      renderTabs();
    };
    const worker = async () => {
      while (queue.length) {
        const job = queue.shift();
        uploadsInFlight++;
        try {
          const size = await readSize(job.file);
          const res = await uploadFile(job.file, cat, (f) => job.row.progress(f));
          job.item = { id: uid(), type: res.type, src: res.src, title: "", ...size };
          job.row.done();
        } catch (e) {
          job.item = null;
          job.row.fail(e.message);
        } finally {
          uploadsInFlight--;
          flush();
        }
      }
    };
    await Promise.all([worker(), worker()]);
  }

  function uploadRow(file) {
    const bar = h("span");
    const pct = h("span", { class: "upload-pct" }, "Waiting…");
    const row = h("li", { class: "upload" }, h("span", { class: "upload-name" }, file.name), pct, h("div", { class: "upload-bar" }, bar));
    ui.uploads.append(row);
    return {
      progress(f) { bar.style.width = (f * 100).toFixed(1) + "%"; pct.textContent = Math.round(f * 100) + "%"; },
      done() { bar.style.width = "100%"; pct.textContent = "Added"; setTimeout(() => row.remove(), 1400); },
      fail(msg) {
        row.classList.add("is-error");
        pct.textContent = msg;
        row.append(h("button", { class: "btn btn-ghost", type: "button", style: "grid-column:1/-1;justify-self:start", onclick: () => row.remove() }, "Dismiss"));
      },
    };
  }

  ui.fileInput.addEventListener("change", () => {
    addFiles(ui.fileInput.files);
    ui.fileInput.value = "";
  });

  // drop anywhere on the page
  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  addEventListener("dragenter", (e) => {
    if (!hasFiles(e) || ui.app.hidden) return;
    e.preventDefault();
    dragDepth++;
    const c = catInfo(state.cat);
    ui.veilText.textContent = state.project ? "Drop to add to this project"
      : state.cat === "projects" ? "Drop to start a new project" : `Drop to add to ${c.label}`;
    ui.veil.hidden = false;
    ui.drop.classList.add("is-over");
  });
  addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) { ui.veil.hidden = true; ui.drop.classList.remove("is-over"); }
  });
  addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    ui.veil.hidden = true;
    ui.drop.classList.remove("is-over");
    if (!ui.app.hidden) addFiles(e.dataTransfer.files);
  });

  // ---------------------------------------------------------------------
  // Removing (with undo; the file itself is deleted once undo expires)
  // ---------------------------------------------------------------------
  const toast = { timer: 0, commit: null };

  function showToast(text, undo, commit) {
    finishToast();
    ui.toastText.textContent = text;
    ui.toastUndo.hidden = !undo;
    ui.toast.hidden = false;
    toast.commit = commit || null;
    ui.toastUndo.onclick = () => {
      clearTimeout(toast.timer);
      toast.commit = null;
      ui.toast.hidden = true;
      if (undo) undo();
    };
    toast.timer = setTimeout(finishToast, undo ? 6000 : 4000);
  }

  function finishToast() {
    clearTimeout(toast.timer);
    ui.toast.hidden = true;
    const commit = toast.commit;
    toast.commit = null;
    if (commit) commit();
  }

  async function deleteFiles(srcs) {
    await runSave(); // the server only deletes files the gallery no longer uses
    for (const src of srcs) {
      try { await api("DELETE", "/api/media?src=" + encodeURIComponent(src)); } catch (e) { console.warn(e.message); }
    }
  }

  function animateOut(id, then) {
    const card = ui.grid.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!card) return then();
    card.classList.add("is-removing");
    setTimeout(then, 220);
  }

  function removeMedia(m) {
    const target = list();
    const index = target.indexOf(m);
    if (index < 0) return;
    animateOut(m.id, () => {
      target.splice(index, 1);
      renderPanel();
      renderTabs();
      scheduleSave();
      showToast("File removed", () => {
        target.splice(Math.min(index, target.length), 0, m);
        render();
        scheduleSave();
      }, () => deleteFiles([m.src]));
    });
  }

  function removeProject(p) {
    const items = state.data.categories.projects.items;
    const index = items.indexOf(p);
    if (index < 0) return;
    const run = () => {
      items.splice(index, 1);
      if (state.project === p.id) go("projects");
      else render();
      scheduleSave();
      showToast(`Project “${p.title || "Untitled"}” deleted`, () => {
        items.splice(Math.min(index, items.length), 0, p);
        render();
        scheduleSave();
      }, () => deleteFiles(p.media.map((m) => m.src)));
    };
    if (state.project === p.id) run();
    else animateOut(p.id, run);
  }

  function newProject() {
    const p = { id: uid(), title: "New project", media: [] };
    state.data.categories.projects.items.push(p);
    scheduleSave();
    go("projects", p.id);
    const input = ui.tools.querySelector("input");
    if (input) { input.focus(); input.select(); }
  }

  // ---------------------------------------------------------------------
  // Sorting: press, drag, drop. (Touch: press and hold first.)
  // ---------------------------------------------------------------------
  let drag = null;

  function commitOrder() {
    const target = list();
    if (!target) return;
    const byId = new Map(target.map((it) => [it.id, it]));
    const ordered = [...ui.grid.children].map((c) => byId.get(c.dataset.id)).filter(Boolean);
    if (ordered.length !== target.length) return render();
    const changed = ordered.some((it, i) => it !== target[i]);
    target.splice(0, target.length, ...ordered);
    [...ui.grid.children].forEach((c, i) => { const o = c.querySelector(".order"); if (o) o.textContent = String(i + 1); });
    if (changed) scheduleSave();
  }

  function flip(mutate, skip) {
    const kids = [...ui.grid.children].filter((k) => k !== skip);
    const before = new Map(kids.map((k) => [k, k.getBoundingClientRect()]));
    mutate();
    for (const k of kids) {
      const a = before.get(k);
      const b = k.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (dx || dy) {
        k.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 280, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
      }
    }
  }

  // Hit-test against where cards sit in the layout, not where their
  // slide animation currently draws them (that made the target flicker).
  function cardAt(x, y) {
    const g = ui.grid.getBoundingClientRect();
    for (const k of ui.grid.children) {
      if (k === drag.card) continue;
      const left = g.left + k.offsetLeft;
      const top = g.top + k.offsetTop;
      if (x >= left && x <= left + k.offsetWidth && y >= top && y <= top + k.offsetHeight) return k;
    }
    return null;
  }

  function placeDragged() {
    const c = drag.card;
    c.style.transform = "none";
    const r = c.getBoundingClientRect();
    c.style.transform = `translate(${drag.x - drag.ox - r.left}px, ${drag.y - drag.oy - r.top}px) scale(1.03)`;
  }

  function startDrag() {
    drag.started = true;
    const r = drag.card.getBoundingClientRect();
    drag.ox = drag.sx - r.left;
    drag.oy = drag.sy - r.top;
    drag.card.classList.add("is-dragging");
    document.body.style.cursor = "grabbing";
    placeDragged();
  }

  ui.grid.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const card = e.target.closest(".card");
    if (!card || e.target.closest("input, button, a")) return;
    drag = { card, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, started: false, id: e.pointerId, touch: e.pointerType !== "mouse" };
    if (drag.touch) drag.hold = setTimeout(() => { if (drag && !drag.started) { startDrag(); navigator.vibrate?.(10); } }, 320);
  });

  addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.started) {
      const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
      if (drag.touch) { if (moved > 10) { clearTimeout(drag.hold); drag = null; } return; } // scrolling, not sorting
      if (moved < 6) return;
      startDrag();
    }
    placeDragged();
    const over = cardAt(e.clientX, e.clientY);
    if (over) {
      const kids = [...ui.grid.children];
      const from = kids.indexOf(drag.card);
      const to = kids.indexOf(over);
      flip(() => ui.grid.insertBefore(drag.card, from < to ? over.nextSibling : over), drag.card);
      placeDragged();
    }
    // scroll the page while dragging near the edges
    if (e.clientY < 70) scrollBy(0, -14);
    else if (e.clientY > innerHeight - 70) scrollBy(0, 14);
  });

  // stop the page from scrolling while a touch drag is active
  ui.grid.addEventListener("touchmove", (e) => { if (drag && drag.started) e.preventDefault(); }, { passive: false });

  const endDrag = () => {
    if (!drag) return;
    const { card, started } = drag;
    clearTimeout(drag.hold);
    drag = null;
    document.body.style.cursor = "";
    if (!started) return;
    const from = card.getBoundingClientRect();
    card.style.transform = "";
    card.classList.remove("is-dragging");
    const to = card.getBoundingClientRect();
    card.animate(
      [{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(1.03)` }, { transform: "none" }],
      { duration: 260, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
    );
    commitOrder();
  };
  addEventListener("pointerup", endDrag);
  addEventListener("pointercancel", endDrag);

  // keyboard: focus a card, then Alt + arrow keys move it
  ui.grid.addEventListener("keydown", (e) => {
    const card = e.target.closest(".card");
    if (!card || e.target !== card || !e.altKey) return;
    const dir = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    const kids = [...ui.grid.children];
    const i = kids.indexOf(card);
    const j = i + dir;
    if (j < 0 || j >= kids.length) return;
    flip(() => ui.grid.insertBefore(card, dir > 0 ? kids[j].nextSibling : kids[j]));
    commitOrder();
    card.focus();
  });

  // ---------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------
  async function loadData() {
    state.data = await api("GET", "/api/gallery");
    // older data may miss ids; the order logic relies on them
    for (const c of CATS) {
      for (const it of state.data.categories[c.key].items) {
        it.id = it.id || uid();
        if (c.key === "projects") it.media.forEach((m) => { m.id = m.id || uid(); });
      }
    }
    const [cat, project] = location.hash.slice(1).split("/");
    showOnly("app");
    setSaveState("saved");
    go(catInfo(cat) ? cat : "productions", project || null);
  }

  ui.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    state.key = ui.password.value;
    ui.loginError.hidden = true;
    try {
      await api("GET", "/api/check");
      try { sessionStorage.setItem("gallery-admin-key", state.key); } catch {}
      await loadData();
    } catch {
      ui.loginError.hidden = false;
      showOnly("login");
    }
  });

  (async () => {
    let status;
    try {
      const res = await fetch("/api/status");
      status = await res.json();
    } catch {
      showOnly("offline");
      return;
    }
    if (status.auth) {
      if (!state.key) { showOnly("login"); return; }
      try { await api("GET", "/api/check"); } catch { showOnly("login"); return; }
    }
    try {
      await loadData();
    } catch (e) {
      showOnly("offline");
      console.error(e);
    }
  })();
})();
