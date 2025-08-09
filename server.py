from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import json, os, tempfile

APP_ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(APP_ROOT, "static")
DATA_PATH = os.path.join(STATIC_DIR, "data", "perfumes.json")
IMG_DIR = os.path.join(STATIC_DIR, "img")
ALLOWED_EXT = {"jpg","jpeg","png","webp"}

def allowed_ext(filename):
    return "." in filename and filename.rsplit(".",1)[1].lower() in ALLOWED_EXT


app = Flask(__name__)
CORS(app)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB

# -------- helpers --------
@app.post("/api/upload-image")
def upload_image():
    if "file" not in request.files:
        return jsonify({"ok": False, "error": "no file"}), 400
    f = request.files["file"]
    if f.filename == "":
        return jsonify({"ok": False, "error": "empty filename"}), 400
    if not allowed_ext(f.filename):
        return jsonify({"ok": False, "error": "bad extension"}), 400

    # optional hint for name (e.g., id or name) from form-data
    hint = request.form.get("hint", "").strip() or os.path.splitext(f.filename)[0]
    base = secure_filename(hint).lower() or "upload"
    ext = f.filename.rsplit(".",1)[1].lower()

    os.makedirs(IMG_DIR, exist_ok=True)
    target = f"{base}.{ext}"
    path = os.path.join(IMG_DIR, target)

    # avoid overwrite: add suffix if exists
    n = 1
    while os.path.exists(path):
        target = f"{base}-{n}.{ext}"
        path = os.path.join(IMG_DIR, target)
        n += 1

    f.save(path)
    rel = f"static/img/{target}"
    return jsonify({"ok": True, "path": rel})

def load_perfumes():
    if not os.path.exists(DATA_PATH):
        return []
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def save_perfumes(data):
    os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
    # atomic write
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(DATA_PATH), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, DATA_PATH)

def slug(s: str) -> str:
    return "-".join("".join(c.lower() if c.isalnum() else " " for c in s).split())

# -------- routes --------
@app.get("/")
def root():
    # serve index.html from project root
    return send_from_directory(APP_ROOT, "index.html")

@app.get("/static/<path:path>")
def static_files(path):
    # serve everything under /static
    return send_from_directory(STATIC_DIR, path)

@app.get("/api/perfumes")
def get_perfumes():
    return jsonify(load_perfumes())

@app.post("/api/perfumes")
def upsert_perfume():
    item = request.get_json(force=True) or {}
    name = (item.get("name") or "").strip()
    brand = (item.get("brand") or "").strip()
    if not name or not brand:
        return jsonify({"ok": False, "error": "name and brand required"}), 400

    item.setdefault("id", slug(f"{brand} {name}"))
    data = load_perfumes()

    for i, p in enumerate(data):
        if str(p.get("id")) == str(item["id"]):
            data[i] = item
            save_perfumes(data)
            return jsonify({"ok": True, "id": item["id"], "mode": "updated"})

    data.append(item)
    save_perfumes(data)
    return jsonify({"ok": True, "id": item["id"], "mode": "created"})

@app.delete("/api/perfumes/<pid>")
def delete_perfume(pid):
    data = load_perfumes()
    new = [p for p in data if str(p.get("id")) != str(pid)]
    save_perfumes(new)
    return jsonify({"ok": True, "deleted": pid})

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=True)
