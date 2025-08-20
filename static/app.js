// static/app.js (v12.1) - dual-purpose Login/Logout button + gated edit mode
console.log("[PAGE_MODE]", window.PAGE_MODE);
console.log("[API_BASE]", window.PAGE_MODE === "wishlist" ? "/api/wishlist" : "/api/perfumes");

// DOM refs
const grid = document.getElementById("grid");
const search = document.getElementById("search");
const addForm = document.getElementById("addForm");
const editToggle = document.getElementById("editToggle");
const imgFile = document.getElementById("imgFile");
const imgPath = document.getElementById("imgPath");
const imgPreviewWrap = document.getElementById("imgPreviewWrap");
const imgPreview = document.getElementById("imgPreview");
const zoomBox = document.getElementById("zoomBox");
const loginModal = document.getElementById("loginModal");
const loginForm = document.getElementById("loginForm");
const loginUser = document.getElementById("loginUser");
const loginPass = document.getElementById("loginPass");
const loginCancel = document.getElementById("loginCancel");
const authBtn = document.getElementById("logoutBtn"); // re-used as Login/Logout

// MODE / API
const MODE = window.PAGE_MODE === "wishlist" ? "wishlist" : "collection";
const API_BASE = MODE === "wishlist" ? "/api/wishlist" : "/api/perfumes";

// Helpers
function escapeHTML(s = "") {
  s = String(s ?? "");
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function escapeAttr(s = "") {
  return String(s).replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function toRootAbsolute(p) {
  if (!p) return p;
  const trimmed = String(p).trim();
  if (!trimmed) return trimmed;
  return (trimmed.startsWith("/") ? trimmed : "/" + trimmed.replace(/^\/+/, "")).replace(/\/{2,}/g, "/");
}
const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// Always send cookies
async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...opts });
  let data = null;
  try { data = await res.json(); } catch {}
  return { res, data };
}

// State
let perfumes = [];
let editingId = null;

// Load data
async function loadData() {
  try {
    const { res, data } = await fetchJSON(API_BASE);
    if (!res.ok) throw new Error("Failed to load " + MODE);
    perfumes = Array.isArray(data) ? data : [];
    render(perfumes);
  } catch (err) {
    console.error(err);
    alert("Could not load items. Please refresh.");
  }
}
loadData();

// Templates / render
function cardTemplate(p, i) {
  const hasImg = !!p.img;
  const imgSrc = hasImg ? toRootAbsolute(p.img) : null;
  const imgPart = hasImg
    ? `
      <div class="thumb-wrap">
        <img class="thumb" src="${escapeAttr(imgSrc)}" alt="${escapeAttr((p.name || "Perfume") + " bottle")}" loading="lazy" decoding="async"
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
        <button class="icon-btn" title="Edit" data-edit="${escapeAttr(p.id || "")}" aria-label="Edit">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM21.41 6.34a1.25 1.25 0 000-1.77l-2.34-2.34a1.25 1.25 0 00-1.77 0l-1.83 1.83 3.75 3.75 1.19-1.47z"/>
          </svg>
        </button>
        <button class="icon-btn delete" title="Delete" data-del="${escapeAttr(p.id || "")}" aria-label="Delete">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-4.5l-1-1z"/>
          </svg>
        </button>
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

// Toasts
function showToast(message, type = "success", timeout = 2400) {
  const host = document.getElementById("toastHost");
  if (!host) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  const icon = type === "success" ? "✓" : type === "error" ? "⚠" : "ℹ";
  el.innerHTML = `
    <span class="icon" aria-hidden="true">${icon}</span>
    <span class="msg">${escapeHTML(message)}</span>
    <button class="close" aria-label="Close">×</button>
  `;
  const remove = () => el.remove();
  el.querySelector(".close").addEventListener("click", remove);
  host.appendChild(el);
  if (timeout) setTimeout(remove, timeout);
}

// Confirm modal that returns a Promise<boolean>
function confirmDialog(message = "Are you sure?", okLabel = "Yes", cancelLabel = "Cancel") {
  const modal = document.getElementById("confirmModal");
  const msg   = document.getElementById("confirmMessage");
  const okBtn = document.getElementById("confirmOk");
  const caBtn = document.getElementById("confirmCancel");
  if (!modal || !msg || !okBtn || !caBtn) {
    return Promise.resolve(confirm(message)); // fallback
  }
  msg.textContent = message;
  okBtn.textContent = okLabel;
  caBtn.textContent = cancelLabel;

  modal.classList.remove("hidden");
  return new Promise((resolve) => {
    const cleanup = () => {
      modal.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      caBtn.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
    };
    const onOk = () => { cleanup(); resolve(true);  };
    const onCancel = () => { cleanup(); resolve(false); };
    const onBackdrop = (e) => { if (e.target === modal) onCancel(); };

    okBtn.addEventListener("click", onOk);
    caBtn.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
  });
}

function render(list) {
  if (!grid) return;
  grid.innerHTML = list.map((p, i) => cardTemplate(p, i)).join("");
  document.body.classList.toggle("editing", !!editToggle?.checked);
  bindZoomHandlers();
}

// Search
search?.addEventListener("input", debounce((e) => {
  const q = (e.target.value || "").trim().toLowerCase();
  if (!q) return render(perfumes);
  const filtered = perfumes.filter((p) => {
    const name = String(p.name || "").toLowerCase();
    const brand = String(p.brand || "").toLowerCase();
    const price = String(p.price ?? "").toLowerCase();
    return name.includes(q) || brand.includes(q) || price.includes(q);
  });
  render(filtered);
}, 120));

// Grid actions
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
    const p = perfumes.find((x) => String(x.id) === String(id));
    const label = p?.name ? `${p.name}` : id;
    if (!confirm(`Delete "${label}"?`)) return;
    const { res } = await fetchJSON(`${API_BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Delete failed (API). If you are not logged in, turn on Edit mode and log in first.");
      return;
    }
    if (String(editingId) === String(id)) editingId = null;
    await loadData();
    return;
  }

  const card = e.target.closest(".card");
  if (card) card.classList.toggle("open");
});

// Add / Update
addForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (imgFile && imgFile.files && imgFile.files[0]) {
    const fd = new FormData();
    fd.append("file", imgFile.files[0]);
    const hint = (addForm.brand.value + " " + addForm.name.value).trim();
    fd.append("hint", hint);
    const up = await fetch("/api/upload-image", { method: "POST", body: fd, credentials: "same-origin" });
    if (!up.ok) {
      alert("Image upload failed. If you are not logged in, turn on Edit mode and log in first.");
      return;
    }
    const j = await up.json().catch(() => ({}));
    if (j.ok && j.path) imgPath.value = j.path;
  }

  const payload = {
    id: editingId || undefined,
    name: addForm.name.value.trim(),
    brand: addForm.brand.value.trim(),
    price: (addForm.price?.value || "").trim() || null,
    img: toRootAbsolute((imgPath?.value || addForm.img?.value || "").trim()) || null,
    notes: (addForm.notes.value || "").trim() || null,
  };

  if (!payload.name || !payload.brand) {
    alert("Name and Brand are required");
    return;
  }

  const { res } = await fetchJSON(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    alert("Save failed (API). If you are not logged in, turn on Edit mode and log in first.");
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

// Auth helpers
async function updateLoginUI() {
  try {
    const { data } = await fetchJSON("/api/status");
    const loggedIn = !!data?.logged_in;
    if (authBtn) authBtn.textContent = loggedIn ? "Logout" : "Login";
    if (!loggedIn && editToggle) {
      editToggle.checked = false;
      document.body.classList.remove("editing");
    }
    return loggedIn;
  } catch {
    if (authBtn) authBtn.textContent = "Login";
    return false;
  }
}
async function doLogin(username, password) {
  const { res } = await fetchJSON("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  return res.ok;
}
function openLoginModal() {
  loginModal?.classList.remove("hidden");
  loginUser?.focus();
}
function closeLoginModal() {
  loginModal?.classList.add("hidden");
  loginForm?.reset();
}

// Dual-purpose button: Login or Logout (with confirm + spinner + toast)
authBtn?.addEventListener("click", async () => {
  const loggedIn = await updateLoginUI();
  if (loggedIn) {
    const yes = await confirmDialog("Log out of Perfume Shelf?", "Logout", "Stay");
    if (!yes) return;

    authBtn.classList.add("loading");
    authBtn.disabled = true;

    try {
      const { res } = await fetchJSON("/api/logout", { method: "POST" });
      if (res.ok) {
        await updateLoginUI();
        showToast("You have been logged out", "success");
      } else {
        showToast("Logout failed. Please try again.", "error", 3200);
      }
    } catch (e) {
      console.error(e);
      showToast("Network error during logout", "error", 3200);
    } finally {
      authBtn.classList.remove("loading");
      authBtn.disabled = false;
    }
  } else {
    openLoginModal();
  }
});

// Modal submit / cancel
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
loginCancel?.addEventListener("click", () => {
  closeLoginModal();
});

// Edit toggle (login gated)
editToggle?.addEventListener("change", async () => {
  if (editToggle.checked) {
    const loggedIn = await updateLoginUI();
    if (!loggedIn) {
      openLoginModal();
      editToggle.checked = false;
      document.body.classList.remove("editing");
      return;
    }
  }
  document.body.classList.toggle("editing", !!editToggle.checked);
});

// Hover Zoom
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

// Header scroll and "/" to focus search
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

// Mode-aware nav placeholder
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

// Initialize auth UI on load
updateLoginUI();
