(() => {
  const header = document.querySelector(".site-header");
  const menuBtn = document.querySelector(".menu-btn");
  const menu = document.getElementById("menu");

  // Header background once the page scrolls
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 40);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Circle menu
  const setMenu = (open) => {
    menu.hidden = !open;
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    document.body.style.overflow = open ? "hidden" : "";
  };
  menuBtn.addEventListener("click", () => setMenu(menu.hidden));
  menu.addEventListener("click", (e) => { if (e.target.closest("a") || e.target === menu) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) setMenu(false); });

  // Swap key icons for GIFs: <a class="key" data-gif="assets/gifs/productions.gif">
  document.querySelectorAll(".key[data-gif]").forEach((key) => {
    const src = key.dataset.gif.trim();
    if (!src) return;
    const img = new Image();
    img.alt = "";
    img.decoding = "async";
    img.onload = () => key.classList.add("has-gif");
    img.src = src;
    key.querySelector(".key-media").prepend(img);
  });

  // Ambient light follows the pointer a little
  const root = document.documentElement;
  window.addEventListener("pointermove", (e) => {
    const x = 40 + (e.clientX / window.innerWidth) * 20;
    root.style.setProperty("--mx", x.toFixed(1) + "%");
  }, { passive: true });

  // Hero: the title is pinned; blur it as the console scrolls over it
  const pin = document.querySelector(".hero-pin");
  const title = document.querySelector(".hero-title");
  const consoleEl = document.querySelector(".console");
  let ticking = false;
  const updateCover = () => {
    ticking = false;
    const top = pin.getBoundingClientRect().top + title.offsetTop;
    const h = title.offsetHeight;
    const overlap = top + h - consoleEl.getBoundingClientRect().top;
    const cover = Math.min(Math.max(overlap / h, 0), 2);
    title.style.setProperty("--cover", cover.toFixed(3));
  };
  const requestCover = () => {
    if (!ticking) { ticking = true; requestAnimationFrame(updateCover); }
  };
  updateCover();
  window.addEventListener("scroll", requestCover, { passive: true });
  window.addEventListener("resize", requestCover);

  // Category sliders
  document.querySelectorAll(".category").forEach((section) => {
    const track = section.querySelector(".slider-track");
    const slides = [...track.children];
    const [prev, next] = section.querySelectorAll(".slider-btn");
    const count = section.querySelector(".slider-count b");
    slides.forEach((slide, i) => slide.style.setProperty("--i", Math.min(i, 6)));

    const step = () => {
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return slides[0].offsetWidth + gap;
    };
    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      const index = Math.round(track.scrollLeft / step());
      count.textContent = String(Math.min(index + 1, slides.length)).padStart(2, "0");
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max - 2;
    };
    const go = (dir) => track.scrollBy({ left: dir * step(), behavior: "smooth" });

    prev.addEventListener("click", () => go(-1));
    next.addEventListener("click", () => go(1));
    track.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
    track.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    });
    window.addEventListener("resize", update);
    update();

    // Drag to slide with a mouse (touch already scrolls natively)
    let startX = 0, startScroll = 0, dragging = false;
    track.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse") return;
      dragging = true;
      startX = e.clientX;
      startScroll = track.scrollLeft;
      track.setPointerCapture(e.pointerId);
    });
    track.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) track.classList.add("dragging");
      track.scrollLeft = startScroll - dx;
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      track.classList.remove("dragging");
      // settle on the nearest square
      const target = Math.round(track.scrollLeft / step()) * step();
      track.scrollTo({ left: target, behavior: "smooth" });
    };
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);
  });

  // Slide the squares in when a category page comes into view
  const pageIO = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        pageIO.unobserve(entry.target);
      }
    });
  }, { threshold: 0.25 });
  document.querySelectorAll(".category").forEach((el) => pageIO.observe(el));

  // Reveal on scroll
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  document.getElementById("year").textContent = new Date().getFullYear();
})();
