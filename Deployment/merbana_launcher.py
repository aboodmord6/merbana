"""
merbana_launcher.py
===================
Embedded launcher used by the compiled distributable (Nuitka / PyInstaller).

Serves the bundled React SPA on a local port, then opens it inside a native
desktop window via pywebview.

Linux requirements (system packages)::

    sudo apt install python3-gi gir1.2-webkit2-4.0 libgtk-3-dev

"""

import http.server
import os
import socket
import socketserver
import sys
import threading
from typing import Optional

# Path to data/db.json — set before starting the server so the HTTP handler can
# write the database back to disk on every /api/save-db POST request.
_data_path: str = ""

# ── Configuration ────────────────────────────────────────────
PORT = 8741
HOST = "127.0.0.1"
LOCK_PORT = 8742          # Reserved solely as a single-instance mutex
APP_NAME = "Merbana - إدارة الطلبات"
WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 820


# ── Single-instance lock ────────────────────────────────────

_lock_socket: Optional[socket.socket] = None


def acquire_single_instance_lock() -> bool:
    """
    Try to bind LOCK_PORT on loopback as a process mutex.
    Returns True if this is the first (and only) running instance.
    The socket is intentionally kept open for the lifetime of the process.
    """
    global _lock_socket
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
        sock.bind((HOST, LOCK_PORT))
        sock.listen(1)           # must listen so Windows doesn't free the port
        _lock_socket = sock
        return True
    except OSError:
        return False


# ── Path resolution ──────────────────────────────────────────

def get_dist_path() -> str:
    """
    Resolve the bundled ``dist/`` folder whether running:
    - launched via the POS/Merbana shell wrapper  (MERBANA_DIST_PATH env var)
    - as a plain .py script
    - frozen by PyInstaller  (_MEIPASS)
    - compiled by Nuitka     (__compiled__)
    """
    # Shell wrapper sets this explicitly — most reliable
    env_path = os.environ.get("MERBANA_DIST_PATH", "")
    if env_path and os.path.isdir(env_path):
        return env_path

    # PyInstaller onefile / onedir
    if getattr(sys, "_MEIPASS", None):
        return os.path.join(sys._MEIPASS, "dist")

    # Nuitka compiled: executable lives next to the embedded data
    if getattr(sys, "__compiled__", False):
        return os.path.join(os.path.dirname(sys.executable), "dist")

    # Plain script: <project>/Deployment/merbana_launcher.py  → dist is one level up
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")


# ── SPA HTTP handler ─────────────────────────────────────────

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler with React Router fallback and a /api/save-db write endpoint."""

    def do_GET(self):
        file_path = os.path.join(self.directory, self.path.lstrip("/"))
        if os.path.isfile(file_path):
            return super().do_GET()
        self.path = "/index.html"
        return super().do_GET()

    def do_OPTIONS(self):
        """Handle CORS preflight requests (needed for POST from the webview)."""
        self.send_response(200)
        self.end_headers()  # CORS headers added by end_headers() override below

    def do_POST(self):
        """Write the posted JSON body atomically to data/db.json on disk."""
        if self.path == "/api/save-db":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length)
                if _data_path:
                    # Atomic write: write to .tmp then rename so a crash never
                    # corrupts the live database file.
                    tmp = _data_path + ".tmp"
                    with open(tmp, "wb") as f:
                        f.write(body)
                    os.replace(tmp, _data_path)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"ok":true}')
            except Exception as exc:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(f'{{"error":"{exc}"}}'.encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):  # silence request logs
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()


# ── Helpers ──────────────────────────────────────────────────

def find_free_port(start: int) -> int:
    port = start
    while port < start + 100:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind((HOST, port))
                return port
        except OSError:
            port += 1
    return start


def start_server(dist_path: str, port: int) -> socketserver.TCPServer:
    handler = lambda *a, **kw: SPAHandler(*a, directory=dist_path, **kw)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer((HOST, port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def show_fatal(title: str, message: str) -> None:
    try:
        import tkinter as tk
        from tkinter import messagebox
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(title, message)
        root.destroy()
    except Exception:
        print(f"FATAL: {title}\n{message}", file=sys.stderr)
        sys.exit(1)


# ── pywebview window ─────────────────────────────────────────

def run_with_webview(dist_path: str, port: int) -> None:
    global _data_path
    _data_path = os.path.join(os.path.dirname(dist_path), "data", "db.json")

    import webview  # noqa: PLC0415

    httpd = start_server(dist_path, port)
    url = f"http://{HOST}:{port}"

    window = webview.create_window(
        APP_NAME,
        url,
        width=WINDOW_WIDTH,
        height=WINDOW_HEIGHT,
        resizable=True,
        min_size=(800, 600),
        text_select=True,
    )

    # gui=None  → auto-detect:  GTK/WebKitWebView on Linux, WinForms/EdgeChromium on Windows
    webview.start()
    httpd.shutdown()


def run_with_browser(dist_path: str, port: int) -> None:
    """Fallback: open the default browser + a small tkinter control window.
    Degrades gracefully if tkinter is unavailable (prints URL and blocks)."""
    global _data_path
    _data_path = os.path.join(os.path.dirname(dist_path), "data", "db.json")

    import webbrowser

    httpd = start_server(dist_path, port)
    url = f"http://{HOST}:{port}"
    webbrowser.open(url)

    try:
        import tkinter as tk

        root = tk.Tk()
        root.title("Merbana Server")
        root.geometry("380x180")
        root.resizable(False, False)
        root.configure(bg="#1a1a2e")

        x = (root.winfo_screenwidth() // 2) - 190
        y = (root.winfo_screenheight() // 2) - 90
        root.geometry(f"+{x}+{y}")

        tk.Label(root, text="Merbana", font=("Segoe UI", 18, "bold"),
                 fg="#e94560", bg="#1a1a2e").pack(pady=(20, 4))
        tk.Label(root, text=f"Running on port {port}",
                 font=("Segoe UI", 9), fg="#a0a0b0", bg="#1a1a2e").pack()
        tk.Label(root, text="Close this window to stop.",
                 font=("Segoe UI", 9), fg="#707080", bg="#1a1a2e").pack(pady=(4, 12))
        tk.Button(root, text="Open in Browser", bg="#e94560", fg="white",
                  relief="flat", cursor="hand2", padx=12, pady=4,
                  command=lambda: webbrowser.open(url)).pack()

        def on_close():
            httpd.shutdown()
            root.destroy()

        root.protocol("WM_DELETE_WINDOW", on_close)
        root.mainloop()

    except (ImportError, Exception) as exc:
        # tkinter not installed, or cannot connect to a display.
        # Keep the server running until Ctrl-C.
        if not isinstance(exc, ImportError):
            print(f"[merbana] tkinter unavailable ({exc}), running headless.",
                  file=sys.stderr)
        print(f"\n  Merbana is running at: {url}")
        print("  Open the URL above in your browser.")
        print("  Press Ctrl-C to stop.\n")
        try:
            import signal
            signal.pause()   # block until any signal (Ctrl-C sends SIGINT)
        except (AttributeError, KeyboardInterrupt):
            pass
        finally:
            httpd.shutdown()


# ── Entry point ──────────────────────────────────────────────

def main() -> None:
    # ── Ensure only one instance runs at a time ──────────────
    if not acquire_single_instance_lock():
        show_fatal(
            APP_NAME,
            "Merbana is already running.\n\nClose the existing window and try again.",
        )
        sys.exit(0)

    dist_path = get_dist_path()

    if not os.path.isdir(dist_path):
        show_fatal(
            "Merbana — Error",
            f"Build folder not found!\n\nExpected:\n{dist_path}\n\n"
            "Make sure the 'dist' folder is bundled with the executable.",
        )
        sys.exit(1)

    if not os.path.isfile(os.path.join(dist_path, "index.html")):
        show_fatal(
            "Merbana — Error",
            "index.html not found inside the build folder.\n"
            "The build appears incomplete.",
        )
        sys.exit(1)

    port = find_free_port(PORT)

    try:
        import webview  # noqa: F401
        run_with_webview(dist_path, port)
    except ImportError:
        run_with_browser(dist_path, port)
    except Exception as exc:
        # Catches webview.util.WebViewException (no GTK/QT backend found)
        # and any other runtime failure so the app degrades gracefully.
        print(f"[merbana] pywebview failed ({exc}), falling back to browser.",
              file=sys.stderr)
        run_with_browser(dist_path, port)


if __name__ == "__main__":
    main()
