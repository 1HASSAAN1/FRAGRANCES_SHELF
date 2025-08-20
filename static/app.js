// static/app.js (v11) — root-absolute fix + path normalizer
console.log("[PAGE_MODE]", window.PAGE_MODE);
console.log("[API_BASE]", window.PAGE_MODE === "wishlist" ? "/api/wishlist" : "/api/perfumes");

// ========= DOM refs =========
const grid = document.getElementById("grid");
const search = document.getElementById("search");
const addForm = document.getElementById("addForm");
const editToggle = document.getElementById("editToggle");
const imgFile = document.getElementById("imgFile");
const imgPath = document.getElementById("imgPath");
const imgPreviewWrap = document.getElementById("imgPreviewWrap");
const imgPreview = document.getElementById("imgPreview");
const zoomBox = document.getElementById("zoomBox");

// ========= MODE / API =========
const MODE = window.PAGE_MODE === "wishlist" ? "wishlist" : "collection";
const API_BASE = MODE === "wishlist" ? "/api/wishlist" : "/api/perfumes";

// Optional: reflect mode in any menu button
const menuBtn = document.querySelector(".menu-btn");
if (menuBtn) menuBtn.textContent = MODE === "wishlist" ? "Wishlist ▾" : "Collection ▾";

// ========= Helpers =========
function escapeHTML(s = "") {
  s = String(s ?? "");
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function escapeAttr(s = "") {
  return String(s).replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
// Force any "static/..." to root-absolute "/static/..."
function toRootAbsolute(p) {
  if (!p) return p;
  const trimmed = String(p).trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith("/") ? trimmed : "/" + trimmed.replace(/^\/+/, "");
}

// ========= Image preview =========
imgFile?.addEventListener("change", () => {
  const f = imgFile.files?.[0];
  if (!f) {
    imgPreviewWrap?.classList.add("hidden");
    if (imgPreview) imgPreview.src = "";
    return;
  }
  const url = URL.createObjectURL(f);
  if (imgPreview) imgPreview.src = url;
  imgPreviewWrap?.classList.remove("hidden");
});

// ========= State =========
let perfumes = [];
let editingId = null;

// ========= Load data =========
async function loadData() {
  try {
    const res = await fetch(API_BASE, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${MODE}`);
    perfumes = await res.json();
    render(perfumes);
  } catch (err) {
    console.error(err);
  }
}
loadData();

// ========= Templates / render =========
function cardTemplate(p, i) {
  const hasImg = !!p.img;
  const imgSrc = hasImg ? toRootAbsolute(p.img) : null;
  const imgPart = hasImg
    ? `
      <div class="thumb-wrap">
        <img class="thumb" src="${escapeAttr(imgSrc)}" alt="${escapeAttr((p.name || "Perfume") + ' bottle')}" loading="lazy" decoding="async"
             onerror="this.onerror=null;this.src='/static/img/placeholder.webp'"/>
      </div>
    `
    : `
      <div class="thumb-wrap">
        <div class="thumb placeholder"></div>
      </div>
    `;

  const notes = p.notes ? `<div class="notes">${escapeHTML(p.notes)}</div>` : "";
  const priceText =
    p.price !== undefined && p.price !== null && String(p.price).trim() !== ""
      ? `£${escapeHTML(String(p.price))}`
      : "£—";

  return `
    <article class="card" style="--i:${i}" data-id="${escapeAttr(p.id || "")}">
      <div class="controls">
        <div class="icon-btn" title="Edit" data-edit="${escapeAttr(p.id || "")}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM21.41 6.34a1.25 1.25 0 000-1.77l-2.34-2.34a1.25 1.25 0 00-1.77 0l-1.83 1.83 3.75 3.75 1.19-1.47z"/>
          </svg>
        </div>
        <div class="icon-btn delete" title="Delete" data-del="${escapeAttr(p.id || "")}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-4.5l-1-1z"/>
          </svg>
        </div>
      </div>
      ${imgPart}
      <div class="meta">
        <div class="name">${escapeHTML(p.name || "")}</div>
        <div class="brand">${escapeHTML(p.brand || "")}</div>
        ${notes}
      </div>
      <div class="price">${priceText}</div>
    </article>
  `;
}

function render(list) {
  if (!grid) return;
  grid.innerHTML = list.map((p, i) => cardTemplate(p, i)).join("");
  document.body.classList.toggle("editing", !!editToggle?.checked);
  bindZoomHandlers();
}

// ========= Search =========
search?.addEventListener("input", (e) => {
  const q = (e.target.value || "").trim().toLowerCase();
  if (!q) return render(perfumes);
  const filtered = perfumes.filter((p) => {
    const name = String(p.name || "").toLowerCase();
    const brand = String(p.brand || "").toLowerCase();
    const price = String(p.price ?? "").toLowerCase();
    return name.includes(q) || brand.includes(q) || price.includes(q);
  });
  render(filtered);
});

// ========= Grid actions =========
grid?.addEventListener("click", async (e) => {
  const editBtn = e.target.closest("[data-edit]");
  const delBtn = e.target.closest("[data-del]");

  if (editBtn) {
    const id = editBtn.getAttribute("data-edit");
    const p = perfumes.find((x) => String(x.id) === String(id));
    if (!p) return;
    editingId = p.id;
    if (addForm) {
      addForm.name.value = p.name || "";
      addForm.brand.value = p.brand || "";
      if (addForm.price) addForm.price.value = String(p.price ?? "");
      addForm.img.value = p.img || "";
      addForm.notes.value = p.notes || "";
      addForm.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return;
  }

  if (delBtn) {
    const id = delBtn.getAttribute("data-del");
    if (!id) return;
    if (!confirm(`Delete "${id}"?`)) return;
    const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Delete failed (API)");
      return;
    }
    if (String(editingId) === String(id)) editingId = null;
    await loadData();
    return;
  }

  const card = e.target.closest(".card");
  if (card) card.classList.toggle("open");
});

// ========= Add / Update =========
addForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Upload file if present
  if (imgFile && imgFile.files && imgFile.files[0]) {
    const fd = new FormData();
    fd.append("file", imgFile.files[0]);
    const hint = (addForm.brand.value + " " + addForm.name.value).trim();
    fd.append("hint", hint);
    const up = await fetch("/api/upload-image", { method: "POST", body: fd });
    if (!up.ok) {
      alert("Image upload failed");
      return;
    }
    const j = await up.json();
    if (j.ok && j.path) imgPath.value = j.path; // this is already root-absolute
  }

  const payload = {
    id: editingId || undefined,
    name: addForm.name.value.trim(),
    brand: addForm.brand.value.trim(),
    price: (addForm.price?.value || "").trim() || null,
    img: toRootAbsolute((imgPath?.value || addForm.img?.value || "").trim()) || null, // normalize ✅
    notes: (addForm.notes.value || "").trim() || null,
  };

  if (!payload.name || !payload.brand) {
    alert("Name and Brand are required");
    return;
  }

  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    alert("Save failed (API)");
    return;
  }

  editingId = null;
  if (imgFile) imgFile.value = "";
  addForm.reset();
  imgPreviewWrap?.classList.add("hidden");
  if (imgPreview) imgPreview.src = "";

  await loadData();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ========= Edit toggle =========
// ========= Login Modal =========
const loginModal = document.getElementById("loginModal");
const loginForm = document.getElementById("loginForm");
const loginUser = document.getElementById("loginUser");
const loginPass = document.getElementById("loginPass");
const loginCancel = document.getElementById("loginCancel");

function openLoginModal() {
  loginModal.classList.remove("hidden");
  loginUser.focus();
}

function closeLoginModal() {
  loginModal.classList.add("hidden");
  loginForm.reset();
}

async function doLogin(username, password) {
  const r = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  return r.ok;
}

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const ok = await doLogin(loginUser.value, loginPass.value);
  if (ok) {
    closeLoginModal();
    await updateLoginUI();
    if (editToggle) {
      editToggle.checked = true;
      document.body.classList.add("editing");
    }
  } else {
    alert("Login failed.");
  }
});

loginCancel?.addEventListener("click", closeLoginModal);

async function requireLogin() {
  const r = await fetch("/api/status");
  const { logged_in } = await r.json();
  if (logged_in) return true;
  openLoginModal();
  return new Promise((resolve) => {
    loginForm.addEventListener("submit", () => resolve(true), { once: true });
    loginCancel.addEventListener("click", () => resolve(false), { once: true });
  });
}
// ========= Edit toggle (login gated) =========
editToggle?.addEventListener("change", async () => {
  if (editToggle.checked) {
    // User wants to enable editing → must be logged in
    const ok = await requireLogin();
    if (!ok) {
      editToggle.checked = false;
      document.body.classList.remove("editing");
      return;
    }
  }
  document.body.classList.toggle("editing", !!editToggle.checked);
});



// ========= Hover Zoom =========
function bindZoomHandlers() {
  const wraps = document.querySelectorAll(".thumb-wrap");
  if (!zoomBox) return;

  const pad = 16;
  const W = 280, H = 360;

  function place(x, y) {
    let left = x + 20, top = y - H / 2;
    if (left + W + pad > window.innerWidth) left = x - W - 20;
    if (top < pad) top = pad;
    if (top + H + pad > window.innerHeight) top = window.innerHeight - H - pad;
    zoomBox.style.left = `${left}px`;
    zoomBox.style.top = `${top}px`;
  }

  wraps.forEach((wrap) => {
    wrap.onmouseenter = wrap.onmouseleave = wrap.onmousemove = null;

    wrap.addEventListener("mouseenter", () => {
      const img = wrap.querySelector("img.thumb");
      if (!img) return;
      zoomBox.style.backgroundImage = `url("${img.src}")`;
      zoomBox.classList.add("visible");
    });

    wrap.addEventListener("mouseleave", () => zoomBox.classList.remove("visible"));

    wrap.addEventListener("mousemove", (e) => {
      if (!zoomBox.classList.contains("visible")) return;
      const rect = wrap.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      const relY = (e.clientY - rect.top) / rect.height;
      place(e.clientX, e.clientY);
      zoomBox.style.backgroundPosition = `${Math.round(relX * 100)}% ${Math.round(relY * 100)}%`;
    });
  });
}

// ========= Header scroll & "/" to focus =========
window.addEventListener("scroll", () => {
  document.querySelector(".header")?.classList.toggle("scrolled", window.scrollY > 10);
  document.querySelector(".site-header")?.classList.toggle("scrolled", window.scrollY > 10);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !e.target.matches("input, textarea")) {
    e.preventDefault();
    document.getElementById("search")?.focus();
  }
});

// ========= Dropdown (if present) =========
document.addEventListener("click", (e) => {
  const menu = document.querySelector(".menu");
  const btn = e.target.closest(".menu-btn");
  if (!menu) return;
  if (btn) {
    menu.classList.toggle("open");
  } else if (!e.target.closest(".menu")) {
    menu.classList.remove("open");
  }
});

// ========= Mode-aware nav placeholder =========
(function () {
  const mode = window.PAGE_MODE === "wishlist" ? "wishlist" : "collection";
  document.querySelectorAll(".global-nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.link === mode);
  });
  const s = document.getElementById("search");
  if (s) s.placeholder = mode === "wishlist"
    ? "Search wishlist… (press / to focus)"
    : "Search perfumes… (press / to focus)";
})();
