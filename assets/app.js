// MySplitIt website behaviour. No libraries.
(function () {
  "use strict";
  var root = document.documentElement;

  // Light/dark theme toggle (remembered on this device when possible).
  var themeBtn = document.getElementById("theme-btn");
  function currentTheme() {
    if (root.dataset.theme) return root.dataset.theme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  themeBtn.addEventListener("click", function () {
    var next = currentTheme() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) {}
  });

  // Header shadow and mobile menu.
  var header = document.querySelector(".site-header");
  var onScroll = function () { header.classList.toggle("scrolled", window.scrollY > 8); };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  var menuBtn = document.getElementById("menu-btn");
  var links = document.getElementById("nav-links");
  menuBtn.addEventListener("click", function () {
    var open = links.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  links.addEventListener("click", function (e) {
    if (e.target.tagName === "A") { links.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }
  });

  // Reveal sections as they scroll into view.
  var revealed = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    revealed.forEach(function (el) { io.observe(el); });
  } else {
    revealed.forEach(function (el) { el.classList.add("in"); });
  }

  // Tour: switch the phone screenshot.
  var showcaseImg = document.getElementById("showcase-img");
  var tourTabs = document.querySelectorAll(".tabs .tab");
  tourTabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tourTabs.forEach(function (t) { t.setAttribute("aria-selected", "false"); });
      tab.setAttribute("aria-selected", "true");
      showcaseImg.style.opacity = "0";
      setTimeout(function () {
        showcaseImg.src = "assets/screens/" + tab.dataset.shot + ".jpg";
        showcaseImg.alt = tab.querySelector("h3").textContent + " screen";
        showcaseImg.onload = function () { showcaseImg.style.opacity = "1"; };
      }, 150);
    });
  });

  // Guides: one topic at a time; the URL hash opens a guide directly (e.g. #g-share).
  var guideBtns = document.querySelectorAll(".guide-list button");
  function openGuide(id, scroll) {
    var target = document.getElementById(id);
    if (!target || !target.classList.contains("guide")) return false;
    document.querySelectorAll(".guide").forEach(function (g) { g.classList.toggle("active", g === target); });
    guideBtns.forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.guide === id)); });
    if (scroll) document.getElementById("how").scrollIntoView();
    return true;
  }
  guideBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      openGuide(b.dataset.guide, false);
      if (window.innerWidth < 900) b.parentElement.parentElement.querySelector(".guide.active").scrollIntoView({ block: "start" });
    });
  });
  function guideFromHash() { if (location.hash.indexOf("#g-") === 0) openGuide(location.hash.slice(1), true); }
  window.addEventListener("hashchange", guideFromHash);
  guideFromHash();

  // Lightbox for screenshots.
  var lb = document.getElementById("lightbox");
  var lbImg = document.getElementById("lightbox-img");
  function closeLb() { lb.classList.remove("open"); }
  document.querySelectorAll(".guide .phone img, .gallery .phone img").forEach(function (img) {
    img.addEventListener("click", function () { lbImg.src = img.src; lbImg.alt = img.alt; lb.classList.add("open"); });
  });
  lb.addEventListener("click", function (e) { if (e.target === lb) closeLb(); });
  document.getElementById("lightbox-close").addEventListener("click", closeLb);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLb(); });

  // Copy the APK checksum.
  var copyBtn = document.getElementById("copy-sha");
  if (copyBtn) copyBtn.addEventListener("click", function () {
    var text = document.getElementById("sha").textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () {
      copyBtn.textContent = "Copied";
      setTimeout(function () { copyBtn.textContent = "Copy"; }, 1500);
    });
  });

  document.getElementById("year").textContent = String(new Date().getFullYear());

  // Contact form: sent by FormSubmit (formsubmit.co) to the MySplitIt inbox.
  var FORM_ENDPOINT = "https://formsubmit.co/ajax/kssp.apps@gmail.com";
  var form = document.getElementById("contact-form");
  var statusEl = document.getElementById("form-status");
  var submitBtn = document.getElementById("contact-submit");
  function setStatus(text, ok) {
    statusEl.textContent = text;
    statusEl.className = "form-status " + (ok ? "ok" : "err");
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = new FormData(form);
    if (data.get("_honey")) return; // a bot filled the hidden field
    var name = String(data.get("name") || "").trim();
    var email = String(data.get("email") || "").trim();
    var message = String(data.get("message") || "").trim();
    if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setStatus("Please fill in your name, a valid email and a message.", false);
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
    setStatus("", true);
    fetch(FORM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        name: name,
        email: email,
        topic: data.get("topic"),
        message: message,
        _subject: "MySplitIt website: " + data.get("topic") + " from " + name,
        _replyto: email,
        _template: "table",
        _captcha: "false"
      })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (res.ok && String(res.body.success) === "true") {
          form.reset();
          setStatus("Thanks! Your message was sent. We'll reply by email.", true);
        } else {
          setStatus("Couldn't send right now. Please try again in a minute.", false);
        }
      })
      .catch(function () { setStatus("Couldn't send. Check your internet connection and try again.", false); })
      .then(function () { submitBtn.disabled = false; submitBtn.textContent = "Send message"; });
  });
})();
