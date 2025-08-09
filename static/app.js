const grid = document.getElementById("grid");
const search = document.getElementById("search");
const addForm = document.getElementById("addForm");
const editToggle = document.getElementById("editToggle");
const imgFile = document.getElementById("imgFile");
const imgPath = document.getElementById("imgPath");

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
    : `<div class="thumb-wrap"><div class="thumb placeholder">image coming soon</div></div>`;

  const notes = p.notes ? `<div class="notes">${escapeHTML(p.notes)}</div>` : "";

  return `
    <article class="card" data-id="${escapeAttr(p.id || "")}">
      <div class="controls">
        <button class="card-btn edit" data-edit="${escapeAttr(p.id || "")}">✎ Edit</button>
        <button class="card-btn delete" data-del="${escapeAttr(p.id || "")}">✖ Delete</button>
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
  // reflect current edit mode on first render and after
  document.body.classList.toggle("editing", !!editToggle?.checked);
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

  // Edit
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

  // Delete
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

  // Toggle notes on card tap/click (ignore when clicking buttons)
  const card = e.target.closest(".card");
  if (card) card.classList.toggle("open");
});

// ---- Add / Update (with optional image upload) ----
addForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  // 1) If a file was chosen, upload it and auto-fill the path
  if (imgFile && imgFile.files && imgFile.files[0]) {
    const fd = new FormData();
    fd.append("file", imgFile.files[0]);
    const hint = (addForm.brand.value + " " + addForm.name.value).trim();
    fd.append("hint", hint);
    const up = await fetch("/api/upload-image", { method: "POST", body: fd });
    if (!up.ok) { alert("Image upload failed"); return; }
    const j = await up.json();
    if (j.ok && j.path) {
      imgPath.value = j.path; // use returned /static/img/... path
    }
  }

  // 2) Save (upsert)
  const payload = {
    id: editingId || undefined, // server will slug if missing
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

  // reset UI
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
