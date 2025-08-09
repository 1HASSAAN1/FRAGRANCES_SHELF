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


// instant preview on file select
imgFile?.addEventListener("change", () => {
  const f = imgFile.files?.[0];
  if (!f) { imgPreviewWrap.classList.add("hidden"); return; }
  const url = URL.createObjectURL(f);
  imgPreview.src = url;
  imgPreviewWrap.classList.remove("hidden");
});

let perfumes = [];
let editingId = null; // which card we're editing, if any

// ---- Load data from Flask ----
async function loadData() {
  const res = await fetch("/api/perfumes", { cache: "no-store" });
  if (!res.ok) {
    console.error("Failed to load perfumes via API");
    return;
  }
  perfumes = await res.json();
  render(perfumes);
}
loadData();

// ---- Template + render ----
function cardTemplate(p) {
  const imgPart = p.img
    ? `<div class="thumb-wrap">
         <img class="thumb" src="${p.img}" alt="${escapeAttr(p.name)} bottle" loading="lazy" decoding="async" />
       </div>`
    : `<div class="thumb-wrap"><div class="thumb placeholder"></div></div>`;

  const notes = p.notes ? `<div class="notes">${escapeHTML(p.notes)}</div>` : "";

  return `
    <article class="card" data-id="${escapeAttr(p.id || "")}">
      <div class="controls">
        <div class="icon-btn" title="Edit" data-edit="${escapeAttr(p.id || "")}">
          <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM21.41 
          6.34a1.25 1.25 0 000-1.77l-2.34-2.34a1.25 1.25 0 00-1.77 
          0l-1.83 1.83 3.75 3.75 1.19-1.47z"/></svg>
        </div>
        <div class="icon-btn delete" title="Delete" data-del="${escapeAttr(p.id || "")}">
          <svg viewBox="0 0 24 24"><path d="M16 9v10H8V9h8m-1.5-6h-5l-1 
          1H5v2h14V4h-4.5l-1-1z"/></svg>
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
  grid.innerHTML = list.map(cardTemplate).join("");
  document.body.classList.toggle("editing", !!editToggle?.checked);
  bindZoomHandlers(); // <-- attach zoom to new cards
}


// ---- Search ----
search?.addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) return render(perfumes);
  const filtered = perfumes.filter(p =>
    p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)
  );
  render(filtered);
});

// ---- Single grid click handler (edit / delete / toggle notes) ----
grid.addEventListener("click", async (e) => {
  const editBtn = e.target.closest("[data-edit]");
  const delBtn  = e.target.closest("[data-del]");

  if (editBtn) {
    const id = editBtn.getAttribute("data-edit");
    const p = perfumes.find(x => x.id === id);
    if (!p) return;
    editingId = p.id;
    addForm.name.value  = p.name  || "";
    addForm.brand.value = p.brand || "";
    addForm.img.value   = p.img   || "";
    addForm.notes.value = p.notes || "";
    addForm.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (delBtn) {
    const id = delBtn.getAttribute("data-del");
    if (!id) return;
    if (!confirm(`Delete "${id}"?`)) return;
    const res = await fetch(`/api/perfumes/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) { alert("Delete failed (API)"); return; }
    if (editingId === id) editingId = null;
    await loadData();
    return;
  }

  const card = e.target.closest(".card");
  if (card) card.classList.toggle("open");
});

// ---- Add / Update (with optional image upload) ----
addForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

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

  const res = await fetch("/api/perfumes", {
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

// ---- Edit mode toggle ----
editToggle?.addEventListener("change", () => {
  document.body.classList.toggle("editing", editToggle.checked);
});

// ---- Helpers ----
function escapeHTML(s = "") {
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function escapeAttr(s = "") {
  return String(s).replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// ===== Hover Zoom (directly bind to each .thumb-wrap after render) =====
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
    // clean old handlers (in case render was called again)
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
