(function () {
  "use strict";

  const root = document.documentElement;
  const state = {
    theme: "sa",
    slideIndex: 0
  };

  /* ---------------- Carousel ---------------- */

  const mediaTrack = document.getElementById("mediaTrack");
  const mediaDots = document.getElementById("mediaDots");

  function renderSlides() {
    const images = CONFIG.carousel[state.theme] || [];
    mediaTrack.innerHTML = "";
    mediaDots.innerHTML = "";
    images.forEach((src, i) => {
      const slide = document.createElement("div");
      slide.className = "stage-media__slide" + (i === 0 ? " is-active" : "");
      slide.dataset.index = String(i);

      const img = document.createElement("img");
      img.src = src;
      img.alt = "The 105 jersey concept, image " + (i + 1);
      img.loading = i === 0 ? "eager" : "lazy";
      img.onerror = function () {
        slide.classList.add("is-placeholder");
        slide.innerHTML = "Add photo:<br>" + src;
      };

      slide.appendChild(img);
      mediaTrack.appendChild(slide);

      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "stage-media__dot" + (i === 0 ? " is-active" : "");
      dot.setAttribute("aria-label", "Go to image " + (i + 1));
      dot.addEventListener("click", () => showSlide(i));
      mediaDots.appendChild(dot);
    });
    state.slideIndex = 0;
  }

  function showSlide(index) {
    const slides = mediaTrack.querySelectorAll(".stage-media__slide");
    if (!slides.length) return;
    const count = slides.length;
    state.slideIndex = ((index % count) + count) % count;
    slides.forEach((s, i) => s.classList.toggle("is-active", i === state.slideIndex));
    mediaDots.querySelectorAll(".stage-media__dot").forEach((d, i) => d.classList.toggle("is-active", i === state.slideIndex));
  }

  document.getElementById("mediaPrev").addEventListener("click", () => showSlide(state.slideIndex - 1));
  document.getElementById("mediaNext").addEventListener("click", () => showSlide(state.slideIndex + 1));

  /* Swipe support (mobile). Arrow buttons above keep working as-is. */
  const stageMedia = document.querySelector(".stage-media");
  let touchStartX = 0;
  let touchStartY = 0;

  stageMedia.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  }, { passive: true });

  stageMedia.addEventListener("touchend", (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;

    // Require a deliberate, mostly-horizontal swipe so vertical page
    // scrolling and accidental taps aren't mistaken for a swipe.
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      showSlide(state.slideIndex + (dx < 0 ? 1 : -1));
    }
  }, { passive: true });

  /* ---------------- Theme ---------------- */

  function setTheme(theme, opts) {
    const animate = !opts || opts.animate !== false;
    const changed = state.theme !== theme || !state.initialized;

    state.theme = theme;
    state.initialized = true;
    root.setAttribute("data-theme", theme);
    document.getElementById("logoImg").src = CONFIG.logo[theme];

    document.querySelectorAll(".theme-toggle__btn").forEach(btn => {
      btn.classList.toggle("is-selected", btn.dataset.themeChoice === theme);
    });

    if (!changed) return;

    if (animate) {
      mediaTrack.classList.add("is-fading");
      setTimeout(() => {
        renderSlides();
        mediaTrack.classList.remove("is-fading");
      }, 260);
    } else {
      renderSlides();
    }
  }

  document.querySelectorAll(".theme-toggle__btn").forEach(btn => {
    btn.addEventListener("click", () => {
      setTheme(btn.dataset.themeChoice);
      // On mobile the carousel and panel are stacked vertically, so a user
      // scrolled down to the panel wouldn't see the new theme's images
      // without this — desktop is a fixed side-by-side layout, no scroll needed.
      if (window.matchMedia("(max-width: 900px)").matches) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });

  /* ---------------- Panel view switching ---------------- */

  function showView(name) {
    document.querySelectorAll(".panel-view").forEach(v => {
      v.classList.toggle("is-active", v.dataset.view === name);
    });
  }

  document.getElementById("goToForm").addEventListener("click", () => showView("form"));

  document.querySelectorAll("[data-back-to]").forEach(btn => {
    btn.addEventListener("click", () => showView(btn.dataset.backTo));
  });

  /* ---------------- Populate selects ---------------- */

  function populateSelects() {
    const countrySelect = document.getElementById("country");
    CONFIG.countries.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      countrySelect.appendChild(opt);
    });

    const sizeSelect = document.getElementById("size");
    CONFIG.sizes.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      sizeSelect.appendChild(opt);
    });

    const priceSelect = document.getElementById("price");
    CONFIG.priceBands.forEach(band => {
      const opt = document.createElement("option");
      opt.value = band.id;
      opt.textContent = priceBandLabel(band);
      priceSelect.appendChild(opt);
    });
  }

  /* ---------------- Form submit ---------------- */

  const form = document.getElementById("registerForm");
  const submitBtn = document.getElementById("submitBtn");
  const formStatus = document.getElementById("formStatus");

  function setFieldError(field, hasError) {
    field.closest(".field").classList.toggle("has-error", hasError);
  }

  function validateForm() {
    let valid = true;

    const email = document.getElementById("email");
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
    setFieldError(email, !emailOk);
    if (!emailOk) valid = false;

    const country = document.getElementById("country");
    setFieldError(country, !country.value);
    if (!country.value) valid = false;

    const jersey = document.getElementById("jersey");
    setFieldError(jersey, !jersey.value);
    if (!jersey.value) valid = false;

    const price = document.getElementById("price");
    setFieldError(price, !price.value);
    if (!price.value) valid = false;

    return valid;
  }

  function showStatus(message, isError) {
    formStatus.textContent = message;
    formStatus.classList.add("is-visible");
    formStatus.classList.toggle("is-error", isError);
    formStatus.classList.toggle("is-success", !isError);
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    // Honeypot: if filled, silently pretend to succeed and stop.
    if (document.getElementById("company").value) {
      showView("thankyou");
      return;
    }

    if (!validateForm()) {
      showStatus("Please fill in the required fields.", true);
      return;
    }

    const payload = {
      email: document.getElementById("email").value.trim(),
      country: document.getElementById("country").value,
      jerseyPreference: document.getElementById("jersey").value,
      size: document.getElementById("size").value || null,
      priceBand: document.getElementById("price").value,
      marketingConsent: document.getElementById("marketingConsent").checked,
      source: "hale-collections.com"
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
    showStatus("", false);
    formStatus.classList.remove("is-visible");

    try {
      const res = await fetch(CONFIG.apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let serverMessage;
        try { serverMessage = (await res.json()).error; } catch (e) { /* not JSON */ }
        throw new Error(serverMessage || ("Request failed: " + res.status));
      }

      state.lastSubmission = payload;
      showView("thankyou");
    } catch (err) {
      console.error(err);
      const isKnownMessage = err.message && !/^Request failed:/.test(err.message);
      showStatus(isKnownMessage ? err.message : "Something went wrong — please try again in a moment.", true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Count Me In";
    }
  });

  /* ---------------- Share actions ---------------- */

  document.getElementById("shareWhatsapp").addEventListener("click", () => {
    const text = encodeURIComponent(CONFIG.shareText + " " + CONFIG.shareUrl);
    window.open("https://wa.me/?text=" + text, "_blank", "noopener");
  });

  document.getElementById("copyLink").addEventListener("click", async function () {
    try {
      await navigator.clipboard.writeText(CONFIG.shareUrl);
      this.lastChild.textContent = " Link Copied!";
      setTimeout(() => { this.lastChild.textContent = " Copy Link"; }, 1800);
    } catch (err) {
      prompt("Copy this link:", CONFIG.shareUrl);
    }
  });

  /* ---------------- Download for stories ---------------- */

  // storyTemplate images are already finished, ready-to-post graphics
  // (headline, CTA and watermark baked in by design) — just download them
  // as-is, no canvas compositing on top.
  document.getElementById("downloadStory").addEventListener("click", async function () {
    const jersey = document.getElementById("jersey").value || state.theme;
    const imgSrc = jersey === "nz" ? CONFIG.storyTemplate.nz : CONFIG.storyTemplate.sa;

    try {
      const res = await fetch(imgSrc);
      if (!res.ok) throw new Error("Story image not found: " + imgSrc);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "the-105-jersey-story.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      console.error(err);
      alert("Couldn't prepare that download — please try again.");
    }
  });

  /* ---------------- Init ---------------- */

  populateSelects();
  setTheme("sa", { animate: false });

  // Testing aid: open index.html?view=thankyou to preview that screen
  // directly, without submitting the form or needing the backend live.
  if (new URLSearchParams(location.search).get("view") === "thankyou") {
    showView("thankyou");
  }
})();
