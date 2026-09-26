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
