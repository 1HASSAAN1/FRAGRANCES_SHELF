# server.py — cache-busting with version stamps
from flask import Flask, jsonify, request, send_from_directory, render_template_string
from flask_cors import CORS
from werkzeug.utils import secure_filename
from PIL import Image
import json, os, tempfile, time
from json import JSONDecodeError

try:
    import pillow_heif  # optional HEIC/HEIF
    pillow_heif.register_heif_opener()
except Exception:
    pass

APP_ROOT   = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(APP_ROOT, "static")
DATA_DIR   = os.path.join(STATIC_DIR, "data")
IMG_DIR    = os.path.join(STATIC_DIR, "img")

PERFUMES_PATH = os.path.join(DATA_DIR, "perfumes.json")
WISHLIST_PATH = os.path.join(DATA_DIR, "wishlist.json")

ALLOWED_UPLOAD_EXT = {"jpg", "jpeg", "png", "webp", "heic", "heif", "avif"}

app = Flask(__name__)
CORS(app)

app.config["MAX_CONTENT_LENGTH"] = 30 * 1024 * 1024
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 31536000  # 1y

# -------- static with cache headers --------
@app.get("/static/<path:path>")
def static_files(path):
    resp = send_from_directory(STATIC_DIR, path)
    if path.endswith((".mp4", ".webm", ".jpg", ".jpeg", ".png", ".webp", ".css", ".js")):
        resp.cache_control.public = True
        resp.cache_control.max_age = 31536000
    return resp

# -------- utils --------
def allowed_ext(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_UPLOAD_EXT

def slug(s: str) -> str:
    return "-".join("".join(c.lower() if c.isalnum() else " " for c in s).split())

def load_json(path: str):
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else [data]
    except JSONDecodeError as e:
        print(f"[ERROR] Failed to parse {path}: {e}")
        return []

def save_json(path: str, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)

def versioned(path: str) -> str:
    """Return /static/path?v=last_modified_timestamp"""
    full = os.path.join(STATIC_DIR, path)
    v = int(os.path.getmtime(full)) if os.path.exists(full) else int(time.time())
    return f"/static/{path}?v={v}"

# -------- pages --------
@app.get("/")
def root():
    html_path = os.path.join(APP_ROOT, "index.html")
    with open(html_path, encoding="utf-8") as f:
        html = f.read()
    html = html.replace("/static/styles.css", versioned("styles.css"))
    html = html.replace("/static/app.js", versioned("app.js"))
    return render_template_string(html)

@app.get("/wishlist")
def wishlist_page():
    html_path = os.path.join(APP_ROOT, "wishlist.html")
    with open(html_path, encoding="utf-8") as f:
        html = f.read()
    html = html.replace("/static/styles.css", versioned("styles.css"))
    html = html.replace("/static/app.js", versioned("app.js"))
    return render_template_string(html)

# -------- uploads --------
@app.post("/api/upload-image")
def upload_image():
    if "file" not in request.files:
        return jsonify({"ok": False, "error": "no file"}), 400
    f = request.files["file"]
    if f.filename == "":
        return jsonify({"ok": False, "error": "empty filename"}), 400
    if not allowed_ext(f.filename):
        return jsonify({"ok": False, "error": "bad extension"}), 400

    hint = (request.form.get("hint") or os.path.splitext(f.filename)[0]).strip()
    base = secure_filename(hint).lower() or "upload"
    os.makedirs(IMG_DIR, exist_ok=True)

    try:
        img = Image.open(f.stream)
        img = img.convert("RGB")
        target = f"{base}.webp"
        path   = os.path.join(IMG_DIR, target)
        n = 1
        while os.path.exists(path):
            target = f"{base}-{n}.webp"
            path   = os.path.join(IMG_DIR, target)
            n += 1
        img.save(path, format="WEBP", quality=90, method=6)
        rel = f"/static/img/{target}"
        return jsonify({"ok": True, "path": rel})
    except Exception as e:
        ext = f.filename.rsplit(".", 1)[1].lower() if "." in f.filename else "jpg"
        if ext in {"jpg", "jpeg", "png", "webp"}:
            target = f"{base}.{ext}"
            path   = os.path.join(IMG_DIR, target)
            n = 1
            while os.path.exists(path):
                target = f"{base}-{n}.{ext}"
                path   = os.path.join(IMG_DIR, target)
                n += 1
            f.save(path)
            rel = f"/static/img/{target}"
            return jsonify({"ok": True, "path": rel})
        return jsonify({"ok": False, "error": f"cannot process image: {e}"}), 400

# -------- collection --------
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

# -------- wishlist --------
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

if __name__ == "__main__":
    os.makedirs(DATA_DIR, exist_ok=True)
    for p in (PERFUMES_PATH, WISHLIST_PATH):
        if not os.path.exists(p):
            save_json(p, [])
    print("[DEBUG] PERFUMES_PATH:", PERFUMES_PATH)
    print("[DEBUG] WISHLIST_PATH:", WISHLIST_PATH)
    app.run(host="127.0.0.1", port=8000, debug=True)
