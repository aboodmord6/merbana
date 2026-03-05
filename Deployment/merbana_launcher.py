"""
merbana_launcher.py
===================
Serves the bundled React SPA on a local port and opens it in a native
desktop window via pywebview (falls back to the system browser).
"""

import http.server
import json
import os
import socket
import socketserver
import sys
import tempfile
import threading
import webbrowser
from urllib.parse import parse_qs, urlparse

# ── Configuration ─────────────────────────────────────────────────────────────
PORT          = 8741
HOST          = "127.0.0.1"
APP_NAME      = "Merbana - إدارة الطلبات"
WINDOW_WIDTH  = 1280
WINDOW_HEIGHT = 820

# Set by run_with_webview / run_with_browser before the server starts
_data_path: str = ""


def _json_response(handler: http.server.BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def _get_cups_connection():
    """Return a pycups connection, or raise RuntimeError with a readable reason."""
    try:
        import cups
    except Exception as exc:
        raise RuntimeError(f"pycups unavailable: {exc}")

    try:
        return cups.Connection(), cups
    except Exception as exc:
        raise RuntimeError(f"CUPS connection failed: {exc}")


def _get_printer_options(conn, cups, printer_name: str):
    """Return normalized CUPS options for a given printer."""
    options = []
    ppd_path = ""

    try:
        ppd_path = conn.getPPD(printer_name)
        ppd = cups.PPD(ppd_path)
        ppd.markDefaults()

        for group in getattr(ppd, "optionGroups", []):
            group_name = getattr(group, "text", "General")
            for opt in getattr(group, "options", []):
                name = getattr(opt, "keyword", "") or getattr(opt, "text", "")
                if not name:
                    continue

                choices = []
                default_value = getattr(opt, "defchoice", "") or ""
                for ch in getattr(opt, "choices", []):
                    if isinstance(ch, dict):
                        value = str(ch.get("choice", ""))
                        text = str(ch.get("text", value))
                        if ch.get("marked"):
                            default_value = value
                    else:
                        value = str(ch)
                        text = value
                    if value:
                        choices.append({"value": value, "label": text})

                if default_value and not any(c["value"] == default_value for c in choices):
                    choices.insert(0, {"value": default_value, "label": default_value})

                if choices:
                    options.append({
                        "name": str(name),
                        "label": str(getattr(opt, "text", name)),
                        "group": str(group_name),
                        "default": str(default_value),
                        "choices": choices,
                        "source": "ppd",
                    })
    except Exception:
        # PPD parsing can fail on some drivers; attribute fallback below still works.
        pass
    finally:
        if ppd_path and os.path.isfile(ppd_path):
            try:
                os.unlink(ppd_path)
            except OSError:
                pass

    if options:
        return options

    # Fallback to printer attributes if PPD options are unavailable.
    attrs = conn.getPrinterAttributes(printer_name)
    for key, value in attrs.items():
        if not key.endswith("-supported"):
            continue
        if not isinstance(value, (list, tuple)) or not value:
            continue
        # Avoid huge unsupported lists from cluttering UI.
        if len(value) > 50:
            continue

        name = key[: -len("-supported")]
        choices = [{"value": str(v), "label": str(v)} for v in value]
        default_value = attrs.get(f"{name}-default", "")

        options.append({
            "name": name,
            "label": name,
            "group": "attributes",
            "default": str(default_value),
            "choices": choices,
            "source": "attributes",
        })

    return options


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
        query = parse_qs(parsed.query)
        path = parsed.path

        if path == "/api/printers":
            try:
                conn, _ = _get_cups_connection()
                printers_raw = conn.getPrinters()
                default_printer = conn.getDefault()
                printers = []

                for name, attrs in printers_raw.items():
                    printers.append({
                        "name": name,
                        "info": attrs.get("printer-info", ""),
                        "location": attrs.get("printer-location", ""),
                        "state": attrs.get("printer-state", 0),
                        "isDefault": name == default_printer,
                    })

                _json_response(self, 200, {"ok": True, "printers": printers})
            except RuntimeError as exc:
                _json_response(self, 200, {"ok": False, "printers": [], "error": str(exc)})
            except Exception as exc:
                _json_response(self, 500, {"ok": False, "printers": [], "error": str(exc)})
            return

        if path == "/api/printer-options":
            try:
                conn, cups = _get_cups_connection()
                printer_name = (query.get("printer", [""])[0] or "").strip()

                printers = conn.getPrinters()
                if not printer_name:
                    printer_name = conn.getDefault() or ""
                if not printer_name or printer_name not in printers:
                    _json_response(self, 400, {
                        "ok": False,
                        "printer": printer_name,
                        "options": [],
                        "error": "Invalid printer name",
                    })
                    return

                options = _get_printer_options(conn, cups, printer_name)
                _json_response(self, 200, {
                    "ok": True,
                    "printer": printer_name,
                    "options": options,
                })
            except RuntimeError as exc:
                _json_response(self, 200, {
                    "ok": False,
                    "printer": "",
                    "options": [],
                    "error": str(exc),
                })
            except Exception as exc:
                _json_response(self, 500, {
                    "ok": False,
                    "printer": "",
                    "options": [],
                    "error": str(exc),
                })
            return

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

        if path == "/api/print":
            try:
                conn, _ = _get_cups_connection()
                body_bytes = self.rfile.read(int(self.headers.get("Content-Length", 0)))
                payload = json.loads(body_bytes.decode("utf-8") or "{}")

                printer = str(payload.get("printer") or "").strip()
                copies = int(payload.get("copies") or 1)
                title = str(payload.get("title") or "Merbana Receipt")
                html_docs = payload.get("htmlDocs")
                html = payload.get("html")
                raw_options = payload.get("options") or {}

                if not isinstance(raw_options, dict):
                    raw_options = {}
                options = {str(k): str(v) for k, v in raw_options.items() if str(k).strip()}
                options["copies"] = str(max(1, copies))

                printers = conn.getPrinters()
                if not printer:
                    printer = conn.getDefault() or ""
                if not printer or printer not in printers:
                    raise ValueError("Invalid printer name")

                docs = []
                if isinstance(html_docs, list):
                    docs = [str(doc) for doc in html_docs if isinstance(doc, str) and doc.strip()]
                elif isinstance(html, str) and html.strip():
                    docs = [html]

                if not docs:
                    raise ValueError("No printable HTML provided")

                job_ids = []
                for idx, doc in enumerate(docs, start=1):
                    tmp_path = ""
                    try:
                        with tempfile.NamedTemporaryFile(mode="w", suffix=".html", delete=False, encoding="utf-8") as f:
                            f.write(doc)
                            tmp_path = f.name
                        job_id = conn.printFile(printer, tmp_path, f"{title} #{idx}", options)
                        job_ids.append(job_id)
                    finally:
                        if tmp_path and os.path.isfile(tmp_path):
                            os.unlink(tmp_path)

                _json_response(self, 200, {"ok": True, "jobIds": job_ids})
            except RuntimeError as exc:
                _json_response(self, 200, {"ok": False, "error": str(exc)})
            except Exception as exc:
                _json_response(self, 400, {"ok": False, "error": str(exc)})
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

    if not os.path.isfile(os.path.join(dist_path, "index.html")):
        try:
            import tkinter as tk
            from tkinter import messagebox
            tk.Tk().withdraw()
            messagebox.showerror("Merbana — Error",
                                 f"dist/ folder not found.\n\nExpected:\n{dist_path}")
        except Exception:
            print(f"ERROR: dist/ not found at {dist_path}", file=sys.stderr)
        sys.exit(1)

    port = find_free_port(PORT)

    try:
        import webview  # noqa: F401
        run_with_webview(dist_path, port)
    except Exception as exc:
        print(f"[merbana] pywebview unavailable ({exc}), opening in browser.",
              file=sys.stderr)
        run_with_browser(dist_path, port)


if __name__ == "__main__":
    main()
