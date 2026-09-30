#!/usr/bin/env node
/*
 * Portfolio server + gallery admin. No dependencies — Node 18 or newer.
 *
 *   node server.js                         → http://localhost:3000        (site)
 *                                            http://localhost:3000/admin  (admin)
 *
 * Without ADMIN_PASSWORD the server only listens on this computer (127.0.0.1)
 * and the admin needs no login. To run it on a host, set ADMIN_PASSWORD
 * (and usually PORT); it then listens publicly and the admin asks for it.
 *
 * The admin writes:
 *   media/<category>/<file>   uploaded images and videos
 *   data/gallery.json         order, titles and settings (source of truth)
 *   data/gallery.js           the same data for the site to load
 */
"use strict";

const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { pipeline, Transform } = require("stream");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_JSON = path.join(DATA_DIR, "gallery.json");
const DATA_JS = path.join(DATA_DIR, "gallery.js");
const MEDIA_DIR = path.join(ROOT, "media");

const PORT = Number(process.env.PORT) || 3000;
const PASSWORD = process.env.ADMIN_PASSWORD || "";
const HOST = process.env.HOST || (PASSWORD ? "0.0.0.0" : "127.0.0.1");
const MAX_UPLOAD = (Number(process.env.MAX_UPLOAD_MB) || 2048) * 1024 * 1024;

const CATEGORIES = ["productions", "motion", "social", "projects"];
const DEFAULT_COLUMNS = { productions: 3, motion: 3, social: 6, projects: 3 };
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".m4v"]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== "string" && !Buffer.isBuffer(body);
  const payload = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, {
    "Content-Type": isJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(payload);
}

const fail = (res, status, message) => send(res, status, { error: message });

function authorized(req) {
  if (!PASSWORD) return true;
  const header = req.headers.authorization || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("Request too large"), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const kindOf = (file) => {
  const ext = path.extname(file).toLowerCase();
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  return null;
};

// "media/productions/clip.mp4" → absolute path, or null if it points elsewhere
function mediaPath(src) {
  if (typeof src !== "string" || !src.startsWith("media/")) return null;
  const abs = path.resolve(ROOT, src);
  return abs.startsWith(MEDIA_DIR + path.sep) ? abs : null;
}

function slug(name) {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "file"
  );
}

// ---------------------------------------------------------------------------
// Gallery data
// ---------------------------------------------------------------------------

const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const posInt = (v) => (Number.isInteger(v) && v > 0 && v < 100000 ? v : undefined);
const newId = () => crypto.randomBytes(6).toString("hex");

function cleanMedia(m) {
  if (!m || !mediaPath(m.src)) return null;
  const type = kindOf(m.src);
  if (!type) return null;
  const out = { id: str(m.id, 40) || newId(), type, src: m.src, title: str(m.title, 200) };
  const w = posInt(m.w);
  const h = posInt(m.h);
  if (w && h) { out.w = w; out.h = h; }
  if (m.poster && mediaPath(m.poster) && kindOf(m.poster) === "image") out.poster = m.poster;
  return out;
}

function cleanProject(p) {
  if (!p || typeof p !== "object") return null;
  const media = Array.isArray(p.media) ? p.media.slice(0, 300).map(cleanMedia).filter(Boolean) : [];
  return { id: str(p.id, 40) || newId(), title: str(p.title, 200), media };
}

function cleanGallery(input) {
  const out = { categories: {} };
  const cats = (input && input.categories) || {};
  for (const cat of CATEGORIES) {
    const c = cats[cat] || {};
    const cols = Number.parseInt(c.columns, 10);
    const items = Array.isArray(c.items) ? c.items.slice(0, 1000) : [];
    out.categories[cat] = {
      columns: cols >= 1 && cols <= 12 ? cols : DEFAULT_COLUMNS[cat],
      items: items.map(cat === "projects" ? cleanProject : cleanMedia).filter(Boolean),
    };
  }
  return out;
}

async function loadGallery() {
  try {
    return cleanGallery(JSON.parse(await fsp.readFile(DATA_JSON, "utf8")));
  } catch (e) {
    if (e.code !== "ENOENT") console.warn("Could not read gallery.json:", e.message);
    return cleanGallery({});
  }
}

async function writeAtomic(file, text) {
  const tmp = file + "." + process.pid + ".tmp";
  await fsp.writeFile(tmp, text);
  await fsp.rename(tmp, file);
}

async function saveGallery(data) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const json = JSON.stringify(data, null, 2);
  await writeAtomic(DATA_JSON, json + "\n");
  await writeAtomic(
    DATA_JS,
    "// Generated by the admin page (server.js). Edit data/gallery.json or use /admin instead.\n" +
      "window.GALLERY_DATA = " + json + ";\n"
  );
}

function referencedSources(data) {
  const set = new Set();
  for (const cat of CATEGORIES) {
    for (const item of data.categories[cat].items) {
      const list = cat === "projects" ? item.media : [item];
      for (const m of list) {
        set.add(m.src);
        if (m.poster) set.add(m.poster);
      }
    }
  }
  return set;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function handleUpload(req, res, url) {
  const cat = url.searchParams.get("category");
  const original = url.searchParams.get("name") || "";
  if (!CATEGORIES.includes(cat)) return fail(res, 400, "Unknown category.");
  const ext = path.extname(original).toLowerCase();
  const type = kindOf(original);
  if (!type) {
    return fail(res, 415, "Only images (jpg, png, gif, webp, avif) and videos (mp4, webm, mov, m4v) can be uploaded.");
  }
  const declared = Number(req.headers["content-length"] || 0);
  if (declared > MAX_UPLOAD) return fail(res, 413, `File is larger than ${Math.round(MAX_UPLOAD / 1048576)} MB.`);

  const dir = path.join(MEDIA_DIR, cat);
  await fsp.mkdir(dir, { recursive: true });
  const stem = slug(path.basename(original, path.extname(original)));

  // claim a unique name without overwriting anything
  let handle;
  let fileName;
  for (let n = 1; n < 1000 && !handle; n++) {
    fileName = n === 1 ? stem + ext : `${stem}-${n}${ext}`;
    try {
      handle = await fsp.open(path.join(dir, fileName), "wx");
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
  }
  if (!handle) return fail(res, 409, "Could not find a free file name.");
  const dest = path.join(dir, fileName);

  let size = 0;
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (size > MAX_UPLOAD) cb(Object.assign(new Error("too large"), { status: 413 }));
      else cb(null, chunk);
    },
  });
  const out = handle.createWriteStream();
  pipeline(req, limiter, out, async (err) => {
    if (err || size === 0) {
      await fsp.unlink(dest).catch(() => {});
      if (!res.headersSent) {
        if (err && err.status === 413) fail(res, 413, "File is too large.");
        else fail(res, 400, size === 0 ? "The file was empty." : "Upload was interrupted.");
      }
      return;
    }
    send(res, 201, { src: `media/${cat}/${fileName}`, type, size });
  });
}

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;

  if (route === "GET /api/status") return send(res, 200, { auth: !!PASSWORD, categories: CATEGORIES });
  if (route === "GET /api/gallery") return send(res, 200, await loadGallery());

  if (!authorized(req)) return fail(res, 401, "Wrong or missing password.");

  if (route === "GET /api/check") return send(res, 200, { ok: true });

  if (route === "PUT /api/gallery") {
    let parsed;
    try {
      parsed = JSON.parse(await readBody(req, 5 * 1024 * 1024));
    } catch (e) {
      return fail(res, e.status || 400, e.status ? e.message : "Invalid JSON.");
    }
    const data = cleanGallery(parsed);
    await saveGallery(data);
    return send(res, 200, data);
  }

  if (route === "POST /api/upload") return handleUpload(req, res, url);

  if (route === "DELETE /api/media") {
    const src = url.searchParams.get("src");
    const abs = mediaPath(src);
    if (!abs) return fail(res, 400, "Not a media file.");
    const data = await loadGallery();
    if (referencedSources(data).has(src)) return fail(res, 409, "This file is still used in the gallery.");
    await fsp.unlink(abs).catch((e) => { if (e.code !== "ENOENT") throw e; });
    return send(res, 200, { deleted: src });
  }

  return fail(res, 404, "Not found.");
}

// ---------------------------------------------------------------------------
// Static files (with byte ranges, so videos can be scrubbed)
// ---------------------------------------------------------------------------

const BLOCKED = new Set(["server.js", "package.json", "package-lock.json"]);

async function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") return fail(res, 405, "Method not allowed.");
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    return fail(res, 400, "Bad path.");
  }
  if (rel.split("/").some((part) => part.startsWith("."))) return fail(res, 404, "Not found.");
  if (BLOCKED.has(rel.replace(/^\/+/, ""))) return fail(res, 404, "Not found.");

  let file = path.resolve(ROOT, "." + rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return fail(res, 404, "Not found.");

  let stat;
  try {
    stat = await fsp.stat(file);
    if (stat.isDirectory()) {
      if (!rel.endsWith("/")) {
        res.writeHead(301, { Location: url.pathname + "/" + url.search });
        return res.end();
      }
      file = path.join(file, "index.html");
      stat = await fsp.stat(file);
    }
  } catch {
    return fail(res, 404, "Not found.");
  }

  const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
  const isData = file.startsWith(DATA_DIR + path.sep);
  const headers = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Last-Modified": stat.mtime.toUTCString(),
    // the gallery data changes whenever the admin saves
    "Cache-Control": isData || type.startsWith("text/html") ? "no-cache" : "public, max-age=300",
  };

  const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if (range) {
    let start = range[1] === "" ? stat.size - Number(range[2]) : Number(range[1]);
    let end = range[1] !== "" && range[2] !== "" ? Number(range[2]) : stat.size - 1;
    start = Math.max(0, start);
    end = Math.min(stat.size - 1, end);
    if (start > end || start >= stat.size) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": end - start + 1 });
    if (req.method === "HEAD") return res.end();
    return pipeline(fs.createReadStream(file, { start, end }), res, () => {});
  }

  res.writeHead(200, { ...headers, "Content-Length": stat.size });
  if (req.method === "HEAD") return res.end();
  pipeline(fs.createReadStream(file), res, () => {});
}

// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) fail(res, 500, "Something went wrong on the server.");
    else res.end();
  }
});

server.requestTimeout = 0; // large uploads can take a while

server.listen(PORT, HOST, () => {
  const shown = HOST === "0.0.0.0" ? "localhost" : HOST;
  console.log(`\n  Portfolio   http://${shown}:${PORT}/`);
  console.log(`  Admin       http://${shown}:${PORT}/admin/`);
  console.log(PASSWORD ? "  Admin password is required (ADMIN_PASSWORD).\n" : "  Local only — no password needed.\n");
});
