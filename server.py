from flask import Flask, jsonify, request, send_from_directory  # Import Flask core and helpers for JSON, requests, and static file serving
from flask_cors import CORS                                     # Allow cross-origin requests (useful for local dev or separate frontends)
from werkzeug.utils import secure_filename                      # Safely clean filenames (remove unsafe chars)
from PIL import Image  # pip install pillow                      # Pillow library for image handling (open/convert/save)
import json, os, tempfile                                       # Python built-ins: JSON, filesystem ops, temp files
from json import JSONDecodeError                                # Specific exception when JSON parsing fails

# Optional HEIC/HEIF support: pip install pillow-heif
try:
    import pillow_heif  # type: ignore                          # Try to import HEIC/HEIF support (iOS images etc.)
    pillow_heif.register_heif_opener()                          # Tell Pillow how to open HEIC/HEIF
except Exception:
    pass  # ok if not installed                                 # If not installed, just ignore; JPEG/PNG/WebP still work

# ---------- Paths / constants ----------
APP_ROOT   = os.path.dirname(os.path.abspath(__file__))         # Absolute path to the folder containing this file
STATIC_DIR = os.path.join(APP_ROOT, "static")                   # /static directory path
DATA_DIR   = os.path.join(STATIC_DIR, "data")                   # /static/data directory path (JSON lives here)
IMG_DIR    = os.path.join(STATIC_DIR, "img")                    # /static/img directory path (uploaded images)

PERFUMES_PATH = os.path.join(DATA_DIR, "perfumes.json")         # File path to collection JSON
WISHLIST_PATH = os.path.join(DATA_DIR, "wishlist.json")         # File path to wishlist JSON

ALLOWED_UPLOAD_EXT = {"jpg", "jpeg", "png", "webp", "heic", "heif", "avif"}  # Allowed image extensions for upload

app = Flask(__name__)                                           # Create the Flask app instance
CORS(app)                                                       # Enable CORS for all routes (simple dev setup)

# Limits & caching
app.config["MAX_CONTENT_LENGTH"] = 30 * 1024 * 1024  # 30 MB    # Max upload size (protects server)
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 31536000   # 1 year   # Default cache time for static responses

# ---------- Static (with cache headers) ----------
@app.get("/static/<path:path>")                                 # Route to serve files under /static/... with custom headers
def static_files(path):
    resp = send_from_directory(STATIC_DIR, path)                # Use Flask helper to serve from the static folder
    if path.endswith((".mp4", ".webm", ".jpg", ".jpeg", ".png", ".webp", ".css", ".js")):
        resp.cache_control.public = True                        # Mark response as public cacheable
        resp.cache_control.max_age = 31536000                   # Cache for 1 year (seconds)
    return resp                                                 # Return the file response

# ---------- Utils ----------
def allowed_ext(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_UPLOAD_EXT
    # Check filename has an extension and that it’s one we allow

def slug(s: str) -> str:
    return "-".join("".join(c.lower() if c.isalnum() else " " for c in s).split())
    # Make a URL-safe id: lowercase, keep letters/numbers, turn others to spaces, compress spaces to hyphens

def load_json(path: str):
    if not os.path.exists(path):
        return []                                               # If file doesn’t exist, treat as empty list
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)                                 # Parse JSON from file
            return data if isinstance(data, list) else [data]   # Ensure we always return a list
    except JSONDecodeError as e:
        print(f"[ERROR] Failed to parse {path}: {e}")           # Log bad JSON for debugging
        return []                                               # Return empty list on parse error

def save_json(path: str, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)           # Ensure the folder exists
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    # Create a temp file safely in the same directory (atomic write pattern)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)        # Write pretty-printed JSON
    os.replace(tmp, path)                                       # Atomically replace old file with new (prevents corruption)

# ---------- Pages ----------
@app.get("/")                                                   # Home page route
def root():
    return send_from_directory(APP_ROOT, "index.html")          # Serve index.html from project root

@app.get("/wishlist")                                           # Wishlist page route
def wishlist_page():
    return send_from_directory(APP_ROOT, "wishlist.html")       # Serve wishlist.html from project root

# ---------- Uploads (normalize to WEBP when possible) ----------
@app.post("/api/upload-image")                                  # API endpoint to upload an image
def upload_image():
    if "file" not in request.files:
        return jsonify({"ok": False, "error": "no file"}), 400  # No file part => bad request
    f = request.files["file"]                                   # The uploaded file object
    if f.filename == "":
        return jsonify({"ok": False, "error": "empty filename"}), 400  # Empty filename => reject
    if not allowed_ext(f.filename):
        return jsonify({"ok": False, "error": "bad extension"}), 400   # Extension not allowed

    hint = (request.form.get("hint") or os.path.splitext(f.filename)[0]).strip()
    # Optional "hint" sent from client; fallback to filename without extension
    base = secure_filename(hint).lower() or "upload"            # Sanitize to safe lowercase filename base

    os.makedirs(IMG_DIR, exist_ok=True)                         # Ensure image dir exists

    try:
        img = Image.open(f.stream)                              # Open image via Pillow
        img = img.convert("RGB")                                # Convert to standard RGB (drop alpha)
        target = f"{base}.webp"                                 # Prefer saving as WEBP for size/compat
        path   = os.path.join(IMG_DIR, target)                  # Absolute path to target file
        n = 1                                                   # Counter for collisions
        while os.path.exists(path):                             # If file exists, add -1, -2, etc.
            target = f"{base}-{n}.webp"
            path   = os.path.join(IMG_DIR, target)
            n += 1
        img.save(path, format="WEBP", quality=90, method=6)     # Save WEBP with good quality/efficiency
        rel = f"static/img/{target}"                            # Relative path used by frontend
        return jsonify({"ok": True, "path": rel})               # Success response with path
    except Exception as e:
        # If conversion via Pillow fails, try to just save the original file if it's a common format
        ext = f.filename.rsplit(".", 1)[1].lower()
        if ext in {"jpg", "jpeg", "png", "webp"}:
            target = f"{base}.{ext}"                            # Keep original extension
            path   = os.path.join(IMG_DIR, target)
            n = 1
            while os.path.exists(path):                         # Avoid overwriting files
                target = f"{base}-{n}.{ext}"
                path   = os.path.join(IMG_DIR, target)
                n += 1
            f.save(path)                                        # Save raw file stream directly
            rel = f"static/img/{target}"
            return jsonify({"ok": True, "path": rel})           # Success response even if conversion failed
        return jsonify({"ok": False, "error": f"cannot process image: {e}"}), 400
        # Otherwise, tell the client we couldn’t process it

# ---------- Perfumes (collection) ----------
@app.get("/api/perfumes")                                       # Read all collection items
def get_perfumes():
    return jsonify(load_json(PERFUMES_PATH))                    # Load list from file and JSON-ify it

@app.post("/api/perfumes")                                      # Create or update a collection item
def upsert_perfume():
    item  = request.get_json(force=True) or {}                  # Parse JSON body (force=True = try even without header)
    name  = (item.get("name") or "").strip()                    # Get/clean name
    brand = (item.get("brand") or "").strip()                   # Get/clean brand
    if not name or not brand:
        return jsonify({"ok": False, "error": "name and brand required"}), 400
        # Validate: must have name + brand

    item.setdefault("id", slug(f"{brand} {name}"))              # If no id passed, generate a slug from brand+name
    data = load_json(PERFUMES_PATH)                             # Load existing list
    for i, p in enumerate(data):                                # Loop to see if id already exists
        if str(p.get("id")) == str(item["id"]):
            data[i] = item                                      # If exists, replace (update)
            save_json(PERFUMES_PATH, data)                      # Save list back to file
            return jsonify({"ok": True, "id": item["id"], "mode": "updated"})
    data.append(item)                                           # If not found, add as new (create)
    save_json(PERFUMES_PATH, data)                              # Save
    return jsonify({"ok": True, "id": item["id"], "mode": "created"})

@app.delete("/api/perfumes/<pid>")                              # Delete a collection item by id
def delete_perfume(pid):
    data = load_json(PERFUMES_PATH)                             # Load list
    new  = [p for p in data if str(p.get("id")) != str(pid)]    # Keep everything except the one with matching id
    save_json(PERFUMES_PATH, new)                               # Save filtered list
    return jsonify({"ok": True, "deleted": pid})                # Confirm deletion

# ---------- Wishlist ----------
@app.get("/api/wishlist")                                       # Read all wishlist items
def get_wishlist():
    return jsonify(load_json(WISHLIST_PATH))                    # Load list and jsonify

@app.post("/api/wishlist")                                      # Create or update a wishlist item
def upsert_wishlist():
    item  = request.get_json(force=True) or {}                  # Parse JSON body
    name  = (item.get("name") or "").strip()                    # Clean name
    brand = (item.get("brand") or "").strip()                   # Clean brand
    if not name or not brand:
        return jsonify({"ok": False, "error": "name and brand required"}), 400
        # Validate inputs

    item.setdefault("id", slug(f"{brand} {name}"))              # Default id = slug(brand name)
    data = load_json(WISHLIST_PATH)                             # Load existing wishlist
    for i, p in enumerate(data):                                # Search for existing id
        if str(p.get("id")) == str(item["id"]):
            data[i] = item                                      # Update in place
            save_json(WISHLIST_PATH, data)                      # Save
            return jsonify({"ok": True, "id": item["id"], "mode": "updated"})
    data.append(item)                                           # If new, append
    save_json(WISHLIST_PATH, data)                              # Save
    return jsonify({"ok": True, "id": item["id"], "mode": "created"})

@app.delete("/api/wishlist/<pid>")                              # Delete a wishlist item by id
def delete_wishlist(pid):
    data = load_json(WISHLIST_PATH)                             # Load wishlist
    new  = [p for p in data if str(p.get("id")) != str(pid)]    # Filter out the matching id
    save_json(WISHLIST_PATH, new)                               # Save updated list
    return jsonify({"ok": True, "deleted": pid})                # Respond success

# ---------- Run ----------
if __name__ == "__main__":                                      # Only run this block when executing this file directly
    os.makedirs(DATA_DIR, exist_ok=True)                        # Ensure data directory exists
    for p in (PERFUMES_PATH, WISHLIST_PATH):                    # Ensure both JSON files exist
        if not os.path.exists(p):
            save_json(p, [])                                    # Create empty list files if missing
    print("[DEBUG] PERFUMES_PATH:", PERFUMES_PATH)              # Helpful debug prints
    print("[DEBUG] WISHLIST_PATH:", WISHLIST_PATH)
    app.run(host="127.0.0.1", port=8000, debug=True)            # Start dev server on http://127.0.0.1:8000 with debug mode
