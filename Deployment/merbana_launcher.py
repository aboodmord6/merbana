"""
merbana_launcher.py
===================
Serves the bundled React SPA on a local port and opens it in a native
desktop window via pywebview (falls back to the system browser).
"""

import http.server
import json
import logging
import os
import shutil
import socket
import socketserver
import subprocess
import sys
import threading
import webbrowser
from urllib.parse import urlparse

# ── Configuration ─────────────────────────────────────────────────────────────
PORT          = 8741
HOST          = "127.0.0.1"
APP_NAME      = "Merbana - إدارة الطلبات"
WINDOW_WIDTH  = 1280
WINDOW_HEIGHT = 820

# Set by run_with_webview / run_with_browser before the server starts
_data_path: str = ""
_log_path: str = ""


def _setup_logging(log_path: str) -> None:
    """Configure logging to file + stderr."""
    global _log_path
    _log_path = log_path
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(log_path, mode="a", encoding="utf-8"),
            logging.StreamHandler(sys.stderr),
        ],
    )
    logging.info("Merbana launcher started. Log: %s", log_path)


def _open_log_terminal() -> None:
    """Open a terminal window that tails the log file (Linux only)."""
    if not _log_path:
        return
    candidates = [
        ("xterm",          ["xterm", "-title", "Merbana — Log", "-e", f"tail -f '{_log_path}'; read"]),
        ("gnome-terminal", ["gnome-terminal", "--title=Merbana — Log", "--", "bash", "-c", f"tail -f '{_log_path}'; read"]),
        ("konsole",        ["konsole", "--title", "Merbana — Log", "-e", "bash", "-c", f"tail -f '{_log_path}'; read"]),
        ("xfce4-terminal", ["xfce4-terminal", "--title=Merbana — Log", "-e", f"tail -f '{_log_path}'; read"]),
        ("lxterminal",     ["lxterminal", "--title=Merbana — Log", "-e", f"tail -f '{_log_path}'; read"]),
    ]
    for bin_name, cmd in candidates:
        if shutil.which(bin_name):
            try:
                subprocess.Popen(cmd)
            except Exception as exc:
                logging.warning("Could not open log terminal (%s): %s", bin_name, exc)
            return


def _json_response(handler: http.server.BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def get_data_path(dist_path: str) -> str:
    """Return the absolute path to data/db.json.

    When frozen by PyInstaller (onefile), _MEIPASS is the temp extraction
    directory that is deleted on exit — the data folder must live next to the
    executable instead.  In plain-script mode, keep the old behaviour of
    looking one level above dist/.
    """
    if getattr(sys, "_MEIPASS", None):
        # Packaged exe: place data/ beside the .exe so it survives restarts.
        return os.path.join(os.path.dirname(sys.executable), "data", "db.json")
    return os.path.join(os.path.dirname(dist_path), "data", "db.json")


# ── Path resolution ────────────────────────────────────────────────────────────

def get_dist_path() -> str:
    """Return the path to the React dist/ folder."""
    # 1. Explicit env var (set by Merbana.bat / shell wrapper)
    env = os.environ.get("MERBANA_DIST_PATH", "")
    if env and os.path.isdir(env):
        return env
    # 2. PyInstaller onefile (_MEIPASS/dist)
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        return os.path.join(meipass, "dist")
    # 3. Plain script: Deployment/merbana_launcher.py → project root / dist
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")


# ── HTTP server ────────────────────────────────────────────────────────────────

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    """Serve the SPA and handle /api/save-db writes."""

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # /data/db.json is stored beside the exe / launcher, NOT inside dist/.
        # Serve it directly so reads always hit the real persistent file.
        if path == "/data/db.json" and _data_path:
            if os.path.isfile(_data_path):
                try:
                    with open(_data_path, "rb") as f:
                        data = f.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                except Exception as exc:
                    self.send_response(500)
                    self.end_headers()
                    self.wfile.write(f'{{"error":"{exc}"}}'.encode())
            else:
                # db.json doesn't exist yet — return empty object so the
                # front-end initialises with defaults and writes it on first save.
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", "2")
                self.end_headers()
                self.wfile.write(b'{}')
            return

        # Serve real files; fall back to index.html for React Router paths
        if os.path.isfile(os.path.join(self.directory, path.lstrip("/"))):
            return super().do_GET()
        self.path = "/index.html"
        return super().do_GET()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        path = self.path.split("?", 1)[0]

        if path == "/api/save-db":
            try:
                body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
                if _data_path:
                    os.makedirs(os.path.dirname(_data_path), exist_ok=True)
                    tmp = _data_path + ".tmp"
                    with open(tmp, "wb") as f:
                        f.write(body)
                    os.replace(tmp, _data_path)   # atomic write
                _json_response(self, 200, {"ok": True})
            except Exception as exc:
                _json_response(self, 500, {"ok": False, "error": str(exc)})
            return

        self.send_response(404)
        self.end_headers()

    def log_message(self, *_):  # silence access logs
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()


def start_server(dist_path: str, port: int) -> socketserver.TCPServer:
    handler = lambda *a, **kw: SPAHandler(*a, directory=dist_path, **kw)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer((HOST, port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def find_free_port(start: int) -> int:
    for port in range(start, start + 100):
        try:
            with socket.socket() as s:
                s.bind((HOST, port))
                return port
        except OSError:
            continue
    return start


# ── Launch modes ───────────────────────────────────────────────────────────────

def run_with_webview(dist_path: str, port: int) -> None:
    global _data_path
    _data_path = get_data_path(dist_path)
    import webview
    httpd = start_server(dist_path, port)
    webview.create_window(APP_NAME, f"http://{HOST}:{port}",
                          width=WINDOW_WIDTH, height=WINDOW_HEIGHT,
                          resizable=True, min_size=(800, 600))
    webview.start()
    httpd.shutdown()


def run_with_browser(dist_path: str, port: int) -> None:
    global _data_path
    _data_path = get_data_path(dist_path)
    httpd = start_server(dist_path, port)
    url = f"http://{HOST}:{port}"
    webbrowser.open(url)

    try:
        import tkinter as tk
        root = tk.Tk()
        root.title(APP_NAME)
        root.geometry("320x140")
        root.resizable(False, False)
        tk.Label(root, text=APP_NAME, font=("Segoe UI", 11, "bold")).pack(pady=(18, 4))
        tk.Label(root, text="Close this window to stop the server.",
                 font=("Segoe UI", 9)).pack()
        tk.Button(root, text="Open in Browser",
                  command=lambda: webbrowser.open(url)).pack(pady=10)
        root.protocol("WM_DELETE_WINDOW", lambda: (httpd.shutdown(), root.destroy()))
        root.mainloop()
    except Exception:
        print(f"\n  Merbana running at: {url}\n  Ctrl-C to stop.\n")
        try:
            threading.Event().wait()
        except KeyboardInterrupt:
            httpd.shutdown()


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    dist_path = get_dist_path()

    # Set up log file beside the data folder.
    log_dir = os.path.dirname(get_data_path(dist_path))
    _setup_logging(os.path.join(log_dir, "merbana.log"))
    _open_log_terminal()

    if not os.path.isfile(os.path.join(dist_path, "index.html")):
        logging.error("dist/ folder not found. Expected: %s", dist_path)
        try:
            import tkinter as tk
            from tkinter import messagebox
            tk.Tk().withdraw()
            messagebox.showerror("Merbana — Error",
                                 f"dist/ folder not found.\n\nExpected:\n{dist_path}")
        except Exception:
            pass
        sys.exit(1)

    port = find_free_port(PORT)
    logging.info("Starting server on %s:%d", HOST, port)

    try:
        import webview  # noqa: F401
        run_with_webview(dist_path, port)
    except Exception as exc:
        logging.warning("pywebview unavailable (%s), opening in browser.", exc)
        run_with_browser(dist_path, port)


if __name__ == "__main__":
    main()
