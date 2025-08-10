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
if (!zoomBox) console.warn("zoomBox not found");

// ========= MODE / API =========
// In wishlist.html add: <script>window.PAGE_MODE = "wishlist";</script>
const MODE = (window.PAGE_MODE === "wishlist") ? "wishlist" : "collection";
const API_BASE = (MODE === "wishlist") ? "/api/wishlist" : "/api/perfumes";

// Optional: reflect mode in header button text if present
const menuBtn = document.querySelector(".menu-btn");
if (menuBtn) {
  menuBtn.textContent = (MODE === "wishlist" ? "Wishlist ▾" : "Collection ▾");
}

// ========= Image preview =========
imgFile?.addEventListener("change", () => {
  const f = imgFile.files?.[0];
  if (!f) { imgPreviewWrap?.classList.add("hidden"); return; }
  const url = URL.createObjectURL(f);
  if (imgPreview) imgPreview.src = url;
  imgPreviewWrap?.classList.remove("hidden");
});

let perfumes = [];
let editingId = null; // which card we're editing, if any

// ========= LOAD =========
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
  const imgPart = p.img
    ? `<div class="thumb-wrap"><img class="thumb" src="${p.img}" alt="${escapeAttr(p.name)} bottle" loading="lazy" decoding="async" /></div>`
    : `<div class="thumb-wrap"><div class="thumb placeholder"></div></div>`;

  const notes = p.notes ? `<div class="notes">${escapeHTML(p.notes)}</div>` : "";

  return `
    <article class="card" style="--i:${i}" data-id="${escapeAttr(p.id || "")}">
      <div class="controls">
        <div class="icon-btn" title="Edit" data-edit="${escapeAttr(p.id || "")}">
          <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM21.41 6.34a1.25 1.25 0 000-1.77l-2.34-2.34a1.25 1.25 0 00-1.77 0l-1.83 1.83 3.75 3.75 1.19-1.47z"/></svg>
        </div>
        <div class="icon-btn delete" title="Delete" data-del="${escapeAttr(p.id || "")}">
          <svg viewBox="0 0 24 24"><path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-4.5l-1-1z"/></svg>
        </div>
      </div>
      ${imgPart}
      <div class="meta">
        <div class="name">${escapeHTML(p.name)}</div>
        <div class="brand">${escapeHTML(p.brand)}</div>
        ${notes}
      </div>
    </article>
  `;
}

function render(list) {
  grid.innerHTML = list.map((p, i) => cardTemplate(p, i)).join("");
  document.body.classList.toggle("editing", !!editToggle?.checked);
  bindZoomHandlers?.(); // re-bind zoom on fresh cards
}

// ========= Search =========
search?.addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) return render(perfumes);
  const filtered = perfumes.filter(p =>
    p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)
  );
  render(filtered);
});

// ========= Grid actions (edit / delete / toggle notes) =========
grid.addEventListener("click", async (e) => {
  const editBtn = e.target.closest("[data-edit]");
  const delBtn  = e.target.closest("[data-del]");

  if (editBtn) {
    const id = editBtn.getAttribute("data-edit");
    const p = perfumes.find(x => x.id === id);
    if (!p) return;
    editingId = p.id;
    if (addForm) {
      addForm.name.value  = p.name  || "";
      addForm.brand.value = p.brand || "";
      addForm.img.value   = p.img   || "";
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
    if (!res.ok) { alert("Delete failed (API)"); return; }
    if (editingId === id) editingId = null;
    await loadData();
    return;
  }

  const card = e.target.closest(".card");
  if (card) card.classList.toggle("open");
});

// ========= Add / Update (with optional image upload) =========
addForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  // 1) optional upload
  if (imgFile && imgFile.files && imgFile.files[0]) {
    const fd = new FormData();
    fd.append("file", imgFile.files[0]);
    const hint = (addForm.brand.value + " " + addForm.name.value).trim();
    fd.append("hint", hint);
    const up = await fetch("/api/upload-image", { method: "POST", body: fd });
    if (!up.ok) { alert("Image upload failed"); return; }
    const j = await up.json();
    if (j.ok && j.path) {
      imgPath.value = j.path;
    }
  }

  // 2) upsert
  const payload = {
    id: editingId || undefined,
    name: addForm.name.value.trim(),
    brand: addForm.brand.value.trim(),
    img: (imgPath.value || "").trim() || null,
    notes: (addForm.notes.value || "").trim() || null
  };
  if (!payload.name || !payload.brand) {
    alert("Name and Brand are required");
    return;
  }

  const res = await fetch(API_BASE, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(payload)
  });
  if (!res.ok) { alert("Save failed (API)"); return; }

  editingId = null;
  if (imgFile) imgFile.value = "";
  addForm.reset();
  await loadData();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ========= Edit mode toggle =========
editToggle?.addEventListener("change", () => {
  document.body.classList.toggle("editing", editToggle.checked);
});

// ========= Helpers =========
function escapeHTML(s = "") {
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function escapeAttr(s = "") {
  return String(s).replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// ========= Badge ripple =========
document.addEventListener('click', (e) => {
  const b = e.target.closest('.badge');
  if (!b) return;
  const r = document.createElement('span');
  r.className = 'ripple';
  const rect = b.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  r.style.width = r.style.height = size + 'px';
  r.style.left = (e.clientX - rect.left) + 'px';
  r.style.top  = (e.clientY - rect.top)  + 'px';
  b.appendChild(r);
  setTimeout(() => r.remove(), 600);
});

// ========= Hover Zoom (bind to each .thumb-wrap after render) =========
function bindZoomHandlers() {
  const wraps = document.querySelectorAll(".thumb-wrap");
  const box = document.getElementById("zoomBox");
  if (!box) { console.warn("zoomBox not found"); return; }

  const pad = 16;
  const W = 280, H = 360;

  function place(x, y) {
    let left = x + 20, top = y - H / 2;
    if (left + W + pad > window.innerWidth) left = x - W - 20;
    if (top < pad) top = pad;
    if (top + H + pad > window.innerHeight) top = window.innerHeight - H - pad;
    box.style.left = `${left}px`;
    box.style.top  = `${top}px`;
  }

  wraps.forEach(wrap => {
    wrap.onmouseenter = null;
    wrap.onmouseleave = null;
    wrap.onmousemove  = null;

    wrap.addEventListener("mouseenter", () => {
      const img = wrap.querySelector("img.thumb");
      if (!img) return;
      box.style.backgroundImage = `url("${img.src}")`;
      box.classList.add("visible");
    });

    wrap.addEventListener("mouseleave", () => {
      box.classList.remove("visible");
    });

    wrap.addEventListener("mousemove", (e) => {
      if (!box.classList.contains("visible")) return;
      const rect = wrap.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      const relY = (e.clientY - rect.top)  / rect.height;
      place(e.clientX, e.clientY);
      box.style.backgroundPosition = `${Math.round(relX*100)}% ${Math.round(relY*100)}%`;
    });
  });
}

// ========= Header shadow on scroll & "/" to focus search =========
window.addEventListener('scroll', () => {
  document.querySelector('.header')?.classList.toggle('scrolled', window.scrollY > 10);
});
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !e.target.matches('input, textarea')) {
    e.preventDefault();
    document.getElementById('search')?.focus();
  }
});

// ========= Dropdown (defensive) =========
document.addEventListener('click', (e) => {
  const menu = document.querySelector('.menu');
  const btn = e.target.closest('.menu-btn');
  if (!menu) return; // page might not have the menu
  if (btn) {
    menu.classList.toggle('open');
  } else if (!e.target.closest('.menu')) {
    menu.classList.remove('open');
  }
});
