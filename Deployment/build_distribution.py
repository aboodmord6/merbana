"""
build_distribution.py
=====================
Single-file build + launcher for the Merbana POS desktop app.

When run from source (``python Deployment/build_distribution.py``):
    1. ``npm run build`` — produces ./dist/ (React SPA)
    2. PyInstaller --onefile — bundles THIS file + dist/ into Merbana.exe

When executed as the frozen .exe:
    Serves the bundled React SPA and opens it in a pywebview window.

Usage
-----
    python Deployment/build_distribution.py [--skip-frontend]

Requirements
------------
    pip install pyinstaller pywebview
"""

import http.server
import mimetypes
import os
import socket
import socketserver
import sys
import threading

# Ensure .wasm files are served with the correct MIME type.
mimetypes.add_type("application/wasm", ".wasm")

# ── App Configuration ────────────────────────────────────────
PORT = 8741
HOST = "127.0.0.1"
LOCK_PORT = 8742
APP_NAME = "Merbana - إدارة الطلبات"
WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 820


# =====================================================================
#  LAUNCHER  (runs inside the frozen .exe OR when called with --serve)
# =====================================================================

def _resolve_web_root() -> str:
    """Return the absolute path to the React build directory (dist/)."""
    if getattr(sys, "_MEIPASS", None):
        return os.path.join(sys._MEIPASS, "dist")
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")


def _acquire_lock() -> bool:
    global _lock_socket
    try:
        _lock_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        _lock_socket.bind((HOST, LOCK_PORT))
        _lock_socket.listen(1)
        return True
    except OSError:
        return False


_lock_socket = None


class _Handler(http.server.SimpleHTTPRequestHandler):
    """Serves static files from WEB_ROOT and handles /api/save-db."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=_web_root, **kwargs)

    def do_POST(self):
        if self.path == "/api/save-db":
            self._save_db()
        else:
            self.send_error(404)

    def _save_db(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b""
        if not body:
            self.send_response(400)
            self.end_headers()
            return
        db_path = os.path.join(_persistent_dir, "merbana.db")
        try:
            with open(db_path, "wb") as f:
                f.write(body)
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"OK")
        except Exception as exc:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(exc).encode())

    def do_GET(self):
        # Serve merbana.db from persistent storage (next to .exe)
        if self.path == "/data/merbana.db":
            db_path = os.path.join(_persistent_dir, "merbana.db")
            if os.path.isfile(db_path):
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(os.path.getsize(db_path)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                with open(db_path, "rb") as f:
                    self.wfile.write(f.read())
                return
            else:
                self.send_error(404)
                return

        path = self.translate_path(self.path)
        if os.path.isfile(path):
            super().do_GET()
        elif self.path.startswith(("/data/", "/api/")):
            # Never SPA-fallback for data/api routes — return real 404
            self.send_error(404)
        else:
            # SPA fallback → serve index.html for client-side routes
            self.path = "/index.html"
            super().do_GET()

    def log_message(self, fmt, *args):  # noqa: ARG002
        pass


def _start_server() -> socketserver.TCPServer:
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer((HOST, PORT), _Handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    print(f"[merbana] serving {_web_root} on http://{HOST}:{PORT}")
    return httpd


def _resolve_persistent_dir() -> str:
    """
    Return a persistent directory next to the .exe for saving user data.
    When frozen, this is the folder containing the .exe.
    When running from source, this is dist/data/.
    """
    if getattr(sys, "frozen", False):
        return os.path.join(os.path.dirname(sys.executable), "data")
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "data")


def launch_app() -> None:
    """Start the local server + pywebview window."""
    global _web_root, _data_dir, _persistent_dir
    _web_root = _resolve_web_root()
    _data_dir = os.path.join(_web_root, "data")
    _persistent_dir = _resolve_persistent_dir()
    os.makedirs(_data_dir, exist_ok=True)
    os.makedirs(_persistent_dir, exist_ok=True)

    if not _acquire_lock():
        print("[merbana] Another instance is already running.")
        sys.exit(0)

    httpd = _start_server()
    try:
        import webview
        window = webview.create_window(
            APP_NAME,
            url=f"http://{HOST}:{PORT}",
            width=WINDOW_WIDTH,
            height=WINDOW_HEIGHT,
            min_size=(800, 600),
        )

        # When the window is about to close, force a final DB save from JS
        # before pywebview tears down the renderer process.
        def _on_closing():
            try:
                window.evaluate_js(
                    "if(window.__flushSave__) window.__flushSave__();"
                )
            except Exception:
                pass

        window.events.closing += _on_closing
        webview.start()

        # Give the final /api/save-db POST time to arrive and be written.
        import time as _time
        _time.sleep(1.0)
    except ImportError:
        print("[merbana] pywebview not installed — opening in browser instead")
        import webbrowser
        webbrowser.open(f"http://{HOST}:{PORT}")
        input("Press Enter to stop the server...")
    finally:
        httpd.shutdown()


# =====================================================================
#  BUILDER  (runs from source to produce the .exe)
# =====================================================================

def _run(cmd, *, cwd=None):
    """Run a shell command, exit on failure."""
    import subprocess
    display = cmd if isinstance(cmd, str) else " ".join(cmd)
    print(f"\n>  {display}")
    result = subprocess.run(cmd, shell=isinstance(cmd, str), cwd=cwd)
    if result.returncode != 0:
        print(f"\n[X]  Command failed (exit {result.returncode})")
        sys.exit(result.returncode)


def _ensure_deps():
    missing = []
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        missing.append("pyinstaller")
    try:
        import webview  # noqa: F401
    except ImportError:
        missing.append("pywebview")
    if missing:
        print(f"Installing missing packages: {', '.join(missing)} ...")
        _run([sys.executable, "-m", "pip", "install"] + missing)


def _seed_database(output_dir) -> None:
    """Create app/data/merbana.db with the full schema pre-applied."""
    import sqlite3
    from pathlib import Path

    data_dir = Path(output_dir) / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    db_path = data_dir / "merbana.db"

    # Always create a fresh seeded database alongside the exe
    if db_path.exists():
        db_path.unlink()

    print(f"\nSeeding database at {db_path} ...")
    SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id   TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id         TEXT    PRIMARY KEY NOT NULL,
  name       TEXT    NOT NULL,
  price      REAL    NOT NULL DEFAULT 0,
  categoryId TEXT    REFERENCES categories(id),
  createdAt  TEXT    NOT NULL,
  stock      INTEGER,
  trackStock INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_sizes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  productId TEXT    NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name      TEXT    NOT NULL,
  price     REAL    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id            TEXT    PRIMARY KEY NOT NULL,
  orderNumber   INTEGER NOT NULL,
  date          TEXT    NOT NULL,
  total         REAL    NOT NULL DEFAULT 0,
  paymentMethod TEXT    NOT NULL DEFAULT 'cash',
  orderType     TEXT    NOT NULL DEFAULT 'dine_in',
  note          TEXT,
  userId        TEXT,
  userName      TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId   TEXT    NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  productId TEXT    NOT NULL,
  name      TEXT    NOT NULL,
  price     REAL    NOT NULL DEFAULT 0,
  quantity  INTEGER NOT NULL DEFAULT 1,
  size      TEXT,
  subtotal  REAL    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cash_transactions (
  id      TEXT PRIMARY KEY NOT NULL,
  type    TEXT NOT NULL,
  amount  REAL NOT NULL DEFAULT 0,
  note    TEXT,
  date    TEXT NOT NULL,
  orderId TEXT,
  userId  TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id        TEXT PRIMARY KEY NOT NULL,
  name      TEXT NOT NULL,
  password  TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
  id        TEXT PRIMARY KEY NOT NULL,
  userId    TEXT NOT NULL,
  userName  TEXT NOT NULL,
  action    TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS debtors (
  id        TEXT PRIMARY KEY NOT NULL,
  name      TEXT NOT NULL,
  amount    REAL NOT NULL DEFAULT 0,
  note      TEXT,
  createdAt TEXT NOT NULL,
  paidAt    TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO settings(key, value) VALUES ('companyName', '');
INSERT OR IGNORE INTO settings(key, value) VALUES ('lastStockReset', '');
"""
    con = sqlite3.connect(str(db_path))
    con.executescript(SCHEMA)
    con.commit()
    con.close()
    print(f"[OK]  Database seeded ({db_path.stat().st_size} bytes)")


def build() -> None:
    """Build the Merbana .exe using PyInstaller."""
    import argparse
    import platform
    import shutil
    import time
    from pathlib import Path

    if platform.system() != "Windows":
        print("This script builds a Windows .exe and must run on Windows.")
        sys.exit(1)

    parser = argparse.ArgumentParser(description="Build Merbana distributable")
    parser.add_argument("--skip-frontend", action="store_true",
                        help="Skip 'npm run build' (reuse existing dist/)")
    args = parser.parse_args()

    project_root = Path(__file__).parent.parent.resolve()
    this_script = Path(__file__).resolve()
    dist_dir = project_root / "dist"
    output_dir = project_root / "app"
    output_exe = output_dir / "Merbana.exe"

    t_start = time.time()
    print("=" * 60)
    print("  Merbana Build Script (PyInstaller)")
    print(f"  Project root: {project_root}")
    print("=" * 60)

    # ── Step 1: Frontend build ─────────────────────────────────
    if args.skip_frontend:
        print("\nSkipping frontend build (--skip-frontend)")
        if not (dist_dir / "index.html").exists():
            print("[X]  dist/index.html not found -- run without --skip-frontend first.")
            sys.exit(1)
    else:
        if dist_dir.exists():
            print(f"\nCleaning {dist_dir} ...")
            shutil.rmtree(dist_dir)
        print("\nBuilding React frontend ...")
        _run("npm run build", cwd=project_root)
        if not (dist_dir / "index.html").exists():
            print("[X]  Frontend build failed: dist/index.html not found.")
            sys.exit(1)
        print("[OK]  Frontend build OK")

    # ── Step 2: Ensure dependencies ────────────────────────────
    _ensure_deps()

    # ── Step 3: Bundle with PyInstaller ────────────────────────
    print("\nBundling with PyInstaller ...")
    build_dir = project_root / "pyinstaller_build"

    pyinstaller_cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--noconsole",
        f"--add-data={dist_dir}{os.pathsep}dist",
        "--hidden-import=webview",
        "--hidden-import=clr",
        "--exclude-module=tkinter",
        f"--name=Merbana",
        f"--distpath={output_dir}",
        f"--workpath={build_dir}",
        f"--specpath={build_dir}",
        "--clean", "-y",
        str(this_script),
    ]
    _run(pyinstaller_cmd, cwd=project_root)

    # ── Step 4: Verify output ──────────────────────────────────
    if not output_exe.exists():
        print(f"[X]  Build appeared to succeed but {output_exe} was not found.")
        sys.exit(1)

    # ── Step 5: Seed app/data/merbana.db ──────────────────────
    _seed_database(output_dir)

    size_mb = output_exe.stat().st_size / (1024 * 1024)
    elapsed = time.time() - t_start
    print("\n" + "=" * 60)
    print("  Build complete!")
    print(f"  Executable : {output_exe}")
    print(f"  Database   : {output_dir / 'data' / 'merbana.db'}")
    print(f"  Size       : {size_mb:.1f} MB")
    print(f"  Time       : {elapsed:.0f}s")
    print("=" * 60)


# =====================================================================
#  Entry point — detect frozen vs. source automatically
# =====================================================================

# Module-level vars used by the handler (set in launch_app())
_web_root: str = ""
_data_dir: str = ""
_persistent_dir: str = ""

if __name__ == "__main__":
    if getattr(sys, "frozen", False):
        # Running as compiled .exe → launch the app
        launch_app()
    else:
        # Running from source → build the .exe
        build()
