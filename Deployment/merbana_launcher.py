"""
Merbana Launcher
================
Verifies USB hardware token then opens the bundled React app in a native
pywebview window.

Build this file with build_distribution.py (uses Nuitka --onefile).
When frozen by Nuitka, the bundled assets live next to the .exe; the
script detects this via __compiled__ (Nuitka) rather than sys._MEIPASS
(PyInstaller).
"""

import os
import sys
import json
import hmac
import hashlib
import ctypes
import argparse
import threading
import time
import logging
from datetime import datetime
from pathlib import Path

import webview

from config import SECRET_KEY, TOKEN_FILENAME, APP_NAME, get_drive_serial

# ── Logging setup ─────────────────────────────────────────────
def _setup_logging(base_dir: Path) -> None:
    log_path = base_dir / "merbana.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(log_path, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )

log = logging.getLogger(__name__)


# ── Resource path ─────────────────────────────────────────────
def get_base_dir() -> Path:
    """
    Returns the directory that contains program assets.
    - Nuitka onefile: assets are in a temp extraction folder next to the exe,
      exposed via sys._MEIPASS in PyInstaller but as a sibling "dist" folder
      placed next to the exe by our build script when using Nuitka.
    - Nuitka standalone: same directory as the exe.
    - Development: project root (one level above Deployment/).
    """
    if getattr(sys, "frozen", False):
        # Running as a compiled (frozen) executable
        # Nuitka sets __compiled__ = True and sys.executable points to the exe
        return Path(sys.executable).parent
    else:
        # Running from source
        return Path(__file__).parent.parent


# ── USB / hardware token verification ─────────────────────────
def get_current_drive() -> str:
    """Return drive letter where the executable (or script) lives."""
    path = Path(sys.executable if getattr(sys, "frozen", False) else __file__).resolve()
    return path.drive.replace(":", "")  # e.g. 'E'


def verify_token() -> tuple[bool, str]:
    """
    Verifies auth.token exists in the root of the current drive and that
    its HMAC fingerprint matches the drive's serial number.
    Returns (True, "OK") or (False, error_message).
    """
    drive = get_current_drive()
    token_path = Path(f"{drive}:\\") / TOKEN_FILENAME

    if not token_path.exists():
        return False, f"Auth token not found on {drive}:\\"

    try:
        token_data = json.loads(token_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        return False, f"Token file unreadable: {exc}"

    serial = get_drive_serial(drive)
    if not serial:
        return False, f"Cannot read serial number of drive {drive}:\\"

    expected = hmac.new(SECRET_KEY, serial.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(token_data.get("fingerprint", ""), expected):
        return False, "Hardware mismatch — app may have been copied to an unauthorised drive."

    # Optional: check expiry
    expires = token_data.get("expires")
    if expires:
        try:
            exp_dt = datetime.fromisoformat(expires)
            if datetime.utcnow() > exp_dt:
                return False, f"Licence expired on {exp_dt.date()}."
        except ValueError:
            pass  # Ignore malformed date

    return True, "OK"


# ── Database injection ─────────────────────────────────────────
def inject_database(window: webview.Window, db_path: str) -> None:
    """
    Reads a JSON database file and calls window.injectDatabase() in the
    React app after the UI signals it is ready (up to 30 s).
    """
    db_file = Path(db_path)
    if not db_file.exists():
        log.warning("DB file not found: %s", db_path)
        return

    try:
        raw = db_file.read_text(encoding="utf-8")
        json.loads(raw)  # validate JSON before injecting
        safe = json.dumps(raw)  # escape for JS string literal
    except Exception as exc:
        log.error("Failed to read DB file: %s", exc)
        return

    js_inject = f"window.injectDatabase({safe})"
    js_ready_check = "typeof window.injectDatabase === 'function'"

    log.info("Waiting for app to expose injectDatabase …")
    for attempt in range(30):
        time.sleep(1)
        try:
            ready = window.evaluate_js(js_ready_check)
            if ready:
                window.evaluate_js(js_inject)
                log.info("Database injected from %s", db_path)
                return
        except Exception as exc:
            log.debug("Attempt %d: %s", attempt + 1, exc)

    log.error("Timed out waiting for injectDatabase() — DB was not injected.")


# ── pywebview API exposed to JS ────────────────────────────────
class NativeApi:
    """Methods callable from the web app via window.pywebview.api.*"""

    def __init__(self) -> None:
        self._window: webview.Window | None = None

    def set_window(self, w: webview.Window) -> None:
        self._window = w

    def log(self, message: str) -> None:  # noqa: A003
        log.info("[UI] %s", message)

    def get_app_version(self) -> str:
        return "1.0.0"


# ── Entry point ────────────────────────────────────────────────
def main() -> None:
    base_dir = get_base_dir()
    _setup_logging(base_dir)
    log.info("Merbana launcher starting")

    # 1. Verify USB binding
    is_valid, error_msg = verify_token()
    if not is_valid:
        log.error("Token verification failed: %s", error_msg)
        ctypes.windll.user32.MessageBoxW(
            0,
            f"Security Error:\n\n{error_msg}",
            "Merbana — Access Denied",
            0x10,  # MB_ICONERROR
        )
        sys.exit(1)

    log.info("Token verified OK")

    # 2. Parse CLI arguments
    parser = argparse.ArgumentParser(description="Merbana Launcher")
    parser.add_argument("-db", "--database", dest="db", metavar="PATH",
                        help="Path to a JSON database file to inject on startup")
    parser.add_argument("--debug", action="store_true",
                        help="Enable pywebview debug mode")
    args = parser.parse_args()

    # 3. Locate built React app
    dist_path = base_dir / "dist"
    index_path = dist_path / "index.html"

    if not index_path.exists():
        msg = f"Application files not found.\nExpected: {index_path}"
        log.error(msg)
        ctypes.windll.user32.MessageBoxW(0, msg, "Merbana — Missing Files", 0x10)
        sys.exit(1)

    log.info("Loading app from %s", index_path)

    # 4. Create window
    api = NativeApi()
    window = webview.create_window(
        APP_NAME,
        url=str(index_path),
        js_api=api,
        width=1280,
        height=800,
        min_size=(900, 600),
        resizable=True,
        text_select=False,
        confirm_close=False,
    )
    api.set_window(window)

    # 5. Inject DB in background (doesn't block the UI event loop)
    if args.db:
        t = threading.Thread(target=inject_database, args=(window, args.db), daemon=True)
        t.start()

    # 6. Start the webview event loop
    webview.start(debug=args.debug)
    log.info("Launcher exited cleanly")


if __name__ == "__main__":
    main()
