(function () {
  "use strict";

  const root = document.documentElement;
  const state = {
    theme: "sa",
    slideIndex: 0
  };

  /* ---------------- Carousel ---------------- */

  const mediaTrack = document.getElementById("mediaTrack");

  function renderSlides() {
    const images = CONFIG.carousel[state.theme] || [];
    mediaTrack.innerHTML = "";
    images.forEach((src, i) => {
      const slide = document.createElement("div");
      slide.className = "stage-media__slide" + (i === 0 ? " is-active" : "");
      slide.dataset.index = String(i);

      const img = document.createElement("img");
      img.src = src;
      img.alt = "The Greatest Rivalry jersey concept, image " + (i + 1);
      img.loading = i === 0 ? "eager" : "lazy";
      img.onerror = function () {
        slide.classList.add("is-placeholder");
        slide.innerHTML = "Add photo:<br>" + src;
      };

      slide.appendChild(img);
      mediaTrack.appendChild(slide);
    });
    state.slideIndex = 0;
  }

  function showSlide(index) {
    const slides = mediaTrack.querySelectorAll(".stage-media__slide");
    if (!slides.length) return;
    const count = slides.length;
    state.slideIndex = ((index % count) + count) % count;
    slides.forEach((s, i) => s.classList.toggle("is-active", i === state.slideIndex));
  }

  document.getElementById("mediaPrev").addEventListener("click", () => showSlide(state.slideIndex - 1));
  document.getElementById("mediaNext").addEventListener("click", () => showSlide(state.slideIndex + 1));

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

    const jerseySelect = document.getElementById("jersey");
    if (jerseySelect && !jerseySelect.dataset.touched) {
      jerseySelect.value = theme;
    }

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
    btn.addEventListener("click", () => setTheme(btn.dataset.themeChoice));
  });

  document.getElementById("jersey").addEventListener("change", function () {
    this.dataset.touched = "true";
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
      source: "thegreatestrivalry.com"
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

      if (!res.ok) throw new Error("Request failed: " + res.status);

      state.lastSubmission = payload;
      showView("thankyou");
    } catch (err) {
      console.error(err);
      showStatus("Something went wrong — please try again in a moment.", true);
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

  document.getElementById("downloadStory").addEventListener("click", async function () {
    const jersey = document.getElementById("jersey").value || state.theme;
    const imgSrc = jersey === "nz" ? CONFIG.storyTemplate.nz : CONFIG.storyTemplate.sa;
    const isNz = jersey === "nz";

    const canvas = document.getElementById("storyCanvas");
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;

    // background
    ctx.fillStyle = isNz ? "#0a0a0a" : "#122921";
    ctx.fillRect(0, 0, W, H);

    try {
      const img = await loadImage(imgSrc);
      const scale = Math.max(W / img.width, (H * 0.78) / img.height);
      const w = img.width * scale, h = img.height * scale;
      const x = (W - w) / 2, y = H * 0.03;
      ctx.drawImage(img, x, y, w, h);
    } catch (err) {
      ctx.fillStyle = "#666";
      ctx.font = "40px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Add " + imgSrc, W / 2, H / 2);
    }

    // gradient footer band for legibility
    const grad = ctx.createLinearGradient(0, H * 0.72, 0, H);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, isNz ? "rgba(0,0,0,0.92)" : "rgba(18,41,33,0.92)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, H * 0.72, W, H * 0.28);

    ctx.textAlign = "center";
    ctx.fillStyle = isNz ? "#ffffff" : "#c9a24b";
    ctx.font = "700 30px Inter, sans-serif";
    ctx.fillText("THE GREATEST RIVALRY", W / 2, H * 0.86);

    ctx.fillStyle = isNz ? "#d9d9d9" : "#f4ecd9";
    ctx.font = "400 26px Inter, sans-serif";
    ctx.fillText("105 years. Two nations. One enduring contest.", W / 2, H * 0.895);

    ctx.font = "600 24px Inter, sans-serif";
    ctx.fillStyle = isNz ? "#d9d9d9" : "#d8bd7c";
    ctx.fillText("Vote at " + CONFIG.shareUrl.replace(/^https?:\/\//, ""), W / 2, H * 0.94);

    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "greatest-rivalry-story.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, "image/png");
  });

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  /* ---------------- Init ---------------- */

  populateSelects();
  setTheme("sa", { animate: false });
})();
