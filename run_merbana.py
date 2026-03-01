"""
Merbana - Order Management System
Desktop Application Launcher (GUI)

This script serves the built Merbana app in a native desktop window.

To convert to .exe:
  1. pip install pywebview pyinstaller
  2. pyinstaller --onefile --noconsole --add-data "dist;dist" --name Merbana run_merbana.py
"""

import http.server
import socketserver
import threading
import os
import sys
import socket


# ── Configuration ────────────────────────────────────────────
PORT = 8741
HOST = "127.0.0.1"
APP_NAME = "Merbana - إدارة الطلبات"
WINDOW_WIDTH = 1200
WINDOW_HEIGHT = 800


def get_dist_path():
    """
    Resolves the path to the 'dist' folder.
    Works both as a Python script and as a PyInstaller .exe.
    """
    if getattr(sys, '_MEIPASS', None):
        return os.path.join(sys._MEIPASS, 'dist')
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist')


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    """
    Serves the SPA with React Router fallback to index.html.
    """

    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def do_GET(self):
        file_path = os.path.join(self.directory, self.path.lstrip('/'))
        if os.path.isfile(file_path):
            return super().do_GET()
        self.path = '/index.html'
        return super().do_GET()

    def log_message(self, format, *args):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()


def find_available_port(start_port):
    """Find an available port starting from start_port."""
    port = start_port
    while port < start_port + 100:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind((HOST, port))
                return port
        except OSError:
            port += 1
    return start_port


def start_server(dist_path, port):
    """Start the HTTP server in a background thread."""
    handler = lambda *args, **kwargs: SPAHandler(*args, directory=dist_path, **kwargs)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer((HOST, port), handler)
    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()
    return httpd


def show_error_gui(title, message):
    """Show an error message using tkinter (always available)."""
    try:
        import tkinter as tk
        from tkinter import messagebox
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(title, message)
        root.destroy()
    except Exception:
        print(f"ERROR: {title}\n{message}")
        input("Press Enter to exit...")


def run_with_webview(dist_path, port):
    """Launch the app in a native desktop window using pywebview."""
    import webview

    url = f"http://{HOST}:{port}"

    # Start the HTTP server
    httpd = start_server(dist_path, port)

    # Create native window
    window = webview.create_window(
        APP_NAME,
        url,
        width=WINDOW_WIDTH,
        height=WINDOW_HEIGHT,
        resizable=True,
        min_size=(800, 600),
        text_select=True,
    )

    # Start the GUI event loop (blocks until window is closed)
    webview.start()

    # Cleanup
    httpd.shutdown()


def run_with_browser(dist_path, port):
    """Fallback: launch in default browser with a tkinter control window."""
    import tkinter as tk
    import webbrowser

    url = f"http://{HOST}:{port}"

    # Start the HTTP server
    httpd = start_server(dist_path, port)

    # Open in browser
    webbrowser.open(url)

    # Create a small control window
    root = tk.Tk()
    root.title("Merbana Server")
    root.geometry("380x200")
    root.resizable(False, False)
    root.configure(bg="#1a1a2e")

    # Center the window
    root.update_idletasks()
    x = (root.winfo_screenwidth() // 2) - 190
    y = (root.winfo_screenheight() // 2) - 100
    root.geometry(f"+{x}+{y}")

    title_label = tk.Label(
        root,
        text="☕ Merbana",
        font=("Segoe UI", 18, "bold"),
        fg="#e94560",
        bg="#1a1a2e",
    )
    title_label.pack(pady=(20, 5))

    status_label = tk.Label(
        root,
        text=f"✅ Server running on port {port}",
        font=("Segoe UI", 10),
        fg="#a0a0b0",
        bg="#1a1a2e",
    )
    status_label.pack(pady=(0, 5))

    info_label = tk.Label(
        root,
        text="The app is open in your browser.\nClose this window to stop the server.",
        font=("Segoe UI", 9),
        fg="#707080",
        bg="#1a1a2e",
    )
    info_label.pack(pady=(0, 10))

    open_btn = tk.Button(
        root,
        text="🌐  Open in Browser",
        font=("Segoe UI", 10),
        bg="#e94560",
        fg="white",
        activebackground="#c73e54",
        activeforeground="white",
        relief="flat",
        cursor="hand2",
        padx=15,
        pady=5,
        command=lambda: webbrowser.open(url),
    )
    open_btn.pack(pady=(0, 10))

    def on_close():
        httpd.shutdown()
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", on_close)
    root.mainloop()


def main():
    dist_path = get_dist_path()

    # Validate dist folder
    if not os.path.isdir(dist_path):
        show_error_gui(
            "Merbana - Error",
            f"Build folder not found!\n\nExpected at:\n{dist_path}\n\n"
            "Make sure the 'dist' folder is next to the executable."
        )
        sys.exit(1)

    if not os.path.isfile(os.path.join(dist_path, 'index.html')):
        show_error_gui(
            "Merbana - Error",
            f"index.html not found in the build folder!\n\nThe build appears to be incomplete."
        )
        sys.exit(1)

    # Find available port
    port = find_available_port(PORT)

    # Try pywebview first (native window), fall back to browser
    try:
        import webview  # noqa: F401
        run_with_webview(dist_path, port)
    except ImportError:
        run_with_browser(dist_path, port)


if __name__ == '__main__':
    main()
