# Ayman Solomon — Portfolio

A dark, lit portfolio site. The four console buttons on the home page (record, play, pause, stop)
open a full-screen gallery for **Productions**, **Motion Graphics**, **Social Media** and **Projects**.

- The gallery is a curved wall of tiles. The one in the middle glows.
- Hover the white arrows to move that way; keep hovering and it keeps going.
  Mouse wheel, arrow keys and swiping work too.
- Hovering a video tile plays it (muted). Clicking opens it large, with a play button and a
  progress bar you can drag.
- In Projects, clicking a project opens all its images and videos stacked vertically.
  The left arrow goes back.
- The icons at the bottom-left switch between the four galleries.

Until you add work, every gallery shows blank tiles.

## Adding and sorting work (the admin)

You need [Node.js](https://nodejs.org) 18 or newer. Nothing else needs installing.

```bash
node server.js
```

Then open **http://localhost:3000/admin/**. The site itself runs at http://localhost:3000/.

In the admin:

- **Add files:** drag images or videos from your computer onto the page, or click the drop area to
  pick them. Supported: JPG, PNG, GIF, WebP, AVIF, MP4, WebM, MOV.
- **Change the order:** click and drag a card to where you want it. The first card shows first.
  (Keyboard: focus a card and press Alt + arrow keys.)
- **Titles:** type into the box under a card. The title shows next to the gallery.
- **Tiles per row:** how many tiles sit side by side before the gallery starts a new row
  (the up/down arrows move between rows).
- **Remove:** the bin icon. You get a few seconds to undo, then the file is deleted.
- **Projects:** drop files on the Projects tab to start a new project, or press "New project".
  Open a project to name it, add files, and sort them. Its first file is the cover in the gallery.

Everything saves automatically. The admin writes to:

| Path | What |
| --- | --- |
| `media/<category>/` | the uploaded files |
| `data/gallery.json` | order, titles and settings |
| `data/gallery.js` | the same data, loaded by the site |

## Publishing

Pick one of these:

1. **Static hosting (GitHub Pages, Netlify, Vercel…).** Edit on your own computer with
   `node server.js`, then commit and push the `media/` and `data/` folders. The site is plain
   HTML/CSS/JS and needs no server.
2. **Edit online.** Run `server.js` on a host that runs Node and keeps files on disk
   (for example a small VPS, or Render/Railway with a persistent disk):

   ```bash
   ADMIN_PASSWORD="choose-a-long-password" PORT=3000 node server.js
   ```

   With a password set, the server accepts outside connections and the admin asks for the
   password before any change. Without one, it only listens on your own computer.

Optional: `MAX_UPLOAD_MB` limits the upload size (default 2048).

### Video tips

- MP4 (H.264) plays everywhere. WebM is fine for Chrome, Firefox and Edge.
- Keep gallery clips short and web-sized: 1080p, around 5–20 MB, exported for "web" / "fast start".
- GitHub refuses files over 100 MB. If you publish through GitHub, keep videos smaller than that or
  use Git LFS.

## Other files

- `index.html`, `styles.css`, `script.js`: the home page (pinned name, lit console, hover glow).
- `gallery.css`, `gallery.js`: the gallery, the video viewer and the project stack.
- `admin/`: the admin page.
- `server.js`: the local server and admin API. It has no dependencies.

The console buttons on the home page can also show GIFs. Set `data-gif="assets/gifs/name.gif"` on a
`.key` in `index.html`.

## To do

- Replace the placeholder email in the Contact section (`mailto:hello@example.com`).
