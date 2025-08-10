from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import json, os, tempfile

APP_ROOT   = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(APP_ROOT, "static")
DATA_DIR   = os.path.join(STATIC_DIR, "data")
IMG_DIR    = os.path.join(STATIC_DIR, "img")

PERFUMES_PATH  = os.path.join(DATA_DIR, "perfumes.json")
WISHLIST_PATH  = os.path.join(DATA_DIR, "wishlist.json")
ALLOWED_EXT    = {"jpg", "jpeg", "png", "webp"}

app = Flask(__name__)
CORS(app)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB

# ---------- utils ----------
def allowed_ext(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT

def slug(s: str) -> str:
    return "-".join("".join(c.lower() if c.isalnum() else " " for c in s).split())

def load_json(path: str):
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path: str, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)

# ---------- pages ----------
@app.get("/")
def root():
    return send_from_directory(APP_ROOT, "index.html")

@app.get("/wishlist")
def wishlist_page():
    return send_from_directory(APP_ROOT, "wishlist.html")

@app.get("/wishlist.html")
def wishlist_page_html():
    return send_from_directory(APP_ROOT, "wishlist.html")

@app.get("/static/<path:path>")

def static_files(path):
    return send_from_directory(STATIC_DIR, path)

# ---------- uploads ----------
@app.post("/api/upload-image")
def upload_image():
    if "file" not in request.files:
        return jsonify({"ok": False, "error": "no file"}), 400
    f = request.files["file"]
    if f.filename == "":
        return jsonify({"ok": False, "error": "empty filename"}), 400
    if not allowed_ext(f.filename):
        return jsonify({"ok": False, "error": "bad extension"}), 400

    hint = request.form.get("hint", "").strip() or os.path.splitext(f.filename)[0]
    base = secure_filename(hint).lower() or "upload"
    ext  = f.filename.rsplit(".", 1)[1].lower()

    os.makedirs(IMG_DIR, exist_ok=True)
    target = f"{base}.{ext}"
    path   = os.path.join(IMG_DIR, target)
    n = 1
    while os.path.exists(path):
        target = f"{base}-{n}.{ext}"
        path   = os.path.join(IMG_DIR, target)
        n += 1

    f.save(path)
    rel = f"static/img/{target}"
    return jsonify({"ok": True, "path": rel})

# ---------- perfumes (collection) ----------
@app.get("/api/perfumes")
def get_perfumes():
    return jsonify(load_json(PERFUMES_PATH))

@app.post("/api/perfumes")
def upsert_perfume():
    item  = request.get_json(force=True) or {}
    name  = (item.get("name") or "").strip()
    brand = (item.get("brand") or "").strip()
    if not name or not brand:
        return jsonify({"ok": False, "error": "name and brand required"}), 400

    item.setdefault("id", slug(f"{brand} {name}"))
    data = load_json(PERFUMES_PATH)
    for i, p in enumerate(data):
        if str(p.get("id")) == str(item["id"]):
            data[i] = item
            save_json(PERFUMES_PATH, data)
            return jsonify({"ok": True, "id": item["id"], "mode": "updated"})
    data.append(item)
    save_json(PERFUMES_PATH, data)
    return jsonify({"ok": True, "id": item["id"], "mode": "created"})

@app.delete("/api/perfumes/<pid>")
def delete_perfume(pid):
    data = load_json(PERFUMES_PATH)
    new  = [p for p in data if str(p.get("id")) != str(pid)]
    save_json(PERFUMES_PATH, new)
    return jsonify({"ok": True, "deleted": pid})

# ---------- wishlist ----------
@app.get("/api/wishlist")
def get_wishlist():
    return jsonify(load_json(WISHLIST_PATH))

@app.post("/api/wishlist")
def upsert_wishlist():
    item  = request.get_json(force=True) or {}
    name  = (item.get("name") or "").strip()
    brand = (item.get("brand") or "").strip()
    if not name or not brand:
        return jsonify({"ok": False, "error": "name and brand required"}), 400

    item.setdefault("id", slug(f"{brand} {name}"))
    data = load_json(WISHLIST_PATH)
    for i, p in enumerate(data):
        if str(p.get("id")) == str(item["id"]):
            data[i] = item
            save_json(WISHLIST_PATH, data)
            return jsonify({"ok": True, "id": item["id"], "mode": "updated"})
    data.append(item)
    save_json(WISHLIST_PATH, data)
    return jsonify({"ok": True, "id": item["id"], "mode": "created"})

@app.delete("/api/wishlist/<pid>")
def delete_wishlist(pid):
    data = load_json(WISHLIST_PATH)
    new  = [p for p in data if str(p.get("id")) != str(pid)]
    save_json(WISHLIST_PATH, new)
    return jsonify({"ok": True, "deleted": pid})

# ---------- run ----------
if __name__ == "__main__":
    os.makedirs(DATA_DIR, exist_ok=True)
    for p in (PERFUMES_PATH, WISHLIST_PATH):
        if not os.path.exists(p):
            save_json(p, [])
    app.run(host="127.0.0.1", port=8000, debug=True)
