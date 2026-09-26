# Ayman Solomon — Portfolio

Static site: `index.html`, `styles.css`, `script.js`. Open `index.html` in a browser; no build step.

## Swapping the console buttons for GIFs

Drop GIFs into `assets/gifs/` and set `data-gif` on the matching key in `index.html`:

```html
<a class="key key--record" href="#productions" style="--glow: var(--red)" data-gif="assets/gifs/productions.gif">
```

The GIF fills the key, the icon is hidden, and the key keeps its colored glow and floor reflection.
Glow colors are the `--red`, `--blue`, `--ice` and `--white` tokens at the top of `styles.css`.

## Portfolio images

Each category page (Productions, Motion Graphics, Social Media, Projects) has a slider of blank squares.
Put an image inside a square to fill it:

```html
<li class="slide"><img src="assets/productions/01.jpg" alt="Project name" /><span class="slide-num">01</span></li>
```

Add or remove `<li class="slide">` items and update the `/ 08` total in that page's `.slider-count`.

## To do
- Replace the placeholder email in the Contact section (`mailto:hello@example.com`).
- Fill the blank slider squares with portfolio images.
