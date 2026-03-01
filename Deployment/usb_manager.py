"""
usb_manager.py
==============
GUI tool for deploying Merbana.exe to USB drives and managing auth tokens.

Features
--------
• Refresh — lists all currently plugged-in removable drives
• Deploy  — copies Merbana.exe to the selected USB and writes auth.token
             bound to that drive's hardware serial number
• Revoke  — deletes auth.token from the USB (deauthorises it)
• Check   — validates existing token against current serial number

Usage
-----
    python Deployment/usb_manager.py
"""

import json
import ctypes
import hashlib
import hmac
import os
import shutil
import string
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import messagebox, ttk

from config import SECRET_KEY, TOKEN_FILENAME, EXE_NAME, get_drive_serial

# Path to the compiled exe (built by build_distribution.py)
DIST_EXE = Path(__file__).parent.parent / "dist" / EXE_NAME


# ── Drive helpers ──────────────────────────────────────────────

def get_removable_drives() -> list[tuple[str, str]]:
    """
    Returns list of (drive_letter, volume_label) for removable drives.
    """
    drives = []
    bitmask = ctypes.windll.kernel32.GetLogicalDrives()
    for letter in string.ascii_uppercase:
        if bitmask & 1:
            root = f"{letter}:\\"
            drive_type = ctypes.windll.kernel32.GetDriveTypeW(root)
            if drive_type == 2:  # DRIVE_REMOVABLE
                vol_buf = ctypes.create_unicode_buffer(1024)
                ctypes.windll.kernel32.GetVolumeInformationW(
                    root, vol_buf, 1024, None, None, None, None, 0
                )
                label = vol_buf.value or "(no label)"
                drives.append((letter, label))
        bitmask >>= 1
    return drives


# ── GUI ────────────────────────────────────────────────────────

class USBManagerApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Merbana USB Deployment Manager")
        self.root.geometry("540x460")
        self.root.resizable(False, False)

        style = ttk.Style()
        style.theme_use("vista")
        style.configure("TButton", padding=6, font=("Segoe UI", 10))
        style.configure("TLabel", font=("Segoe UI", 10))
        style.configure("Header.TLabel", font=("Segoe UI", 15, "bold"))
        style.configure("Sub.TLabel", font=("Segoe UI", 9), foreground="#555555")

        # ── Header ──
        ttk.Label(root, text="Merbana Deployment Manager", style="Header.TLabel").pack(pady=(18, 2))
        ttk.Label(root, text="Deploy & manage USB hardware licences", style="Sub.TLabel").pack()

        ttk.Separator(root).pack(fill="x", padx=20, pady=10)

        # ── Drive selection ──
        frame_drv = ttk.LabelFrame(root, text=" Target USB Drive ", padding=12)
        frame_drv.pack(fill="x", padx=20, pady=4)

        self.drive_var = tk.StringVar()
        self.drive_combo = ttk.Combobox(frame_drv, textvariable=self.drive_var, state="readonly", width=40)
        self.drive_combo.grid(row=0, column=0, sticky="ew", padx=(0, 6))

        ttk.Button(frame_drv, text="↻ Refresh", command=self.refresh_drives, width=10).grid(row=0, column=1)
        frame_drv.columnconfigure(0, weight=1)

        # ── Actions ──
        frame_act = ttk.LabelFrame(root, text=" Actions ", padding=12)
        frame_act.pack(fill="x", padx=20, pady=8)

        actions = [
            ("🚀  Deploy & Authorise USB", self.deploy,       "green"),
            ("🔍  Check Token",            self.check_token,  "blue"),
            ("🗑️  Revoke Licence",         self.revoke,       "red"),
        ]

        self.action_btns: list[ttk.Button] = []
        for i, (text, cmd, _) in enumerate(actions):
            btn = ttk.Button(frame_act, text=text, command=cmd)
            btn.grid(row=i, column=0, sticky="ew", pady=3)
            self.action_btns.append(btn)
        frame_act.columnconfigure(0, weight=1)

        # ── Log / status area ──
        frame_log = ttk.LabelFrame(root, text=" Activity Log ", padding=8)
        frame_log.pack(fill="both", expand=True, padx=20, pady=(0, 14))

        self.log_text = tk.Text(
            frame_log, height=7, state="disabled",
            font=("Consolas", 9), bg="#f8f8f8", relief="flat",
            wrap="word", bd=0,
        )
        self.log_text.pack(fill="both", expand=True)

        # Source exe status
        src_ok = DIST_EXE.exists()
        src_msg = f"{'✓' if src_ok else '✗'}  Source exe: {DIST_EXE}"
        self._log(src_msg)
        if not src_ok:
            self._log("  → Run build_distribution.py first.")

        self.refresh_drives()

    # ── Helpers ────────────────────────────────────────────────

    def _log(self, msg: str) -> None:
        ts = datetime.now().strftime("%H:%M:%S")
        self.log_text.config(state="normal")
        self.log_text.insert("end", f"[{ts}] {msg}\n")
        self.log_text.see("end")
        self.log_text.config(state="disabled")
        self.root.update_idletasks()

    def _set_buttons(self, state: str) -> None:
        for btn in self.action_btns:
            btn.config(state=state)

    def get_selected_drive(self) -> str | None:
        val = self.drive_var.get()
        if not val or ":" not in val:
            return None
        return val[0]  # first character is always the letter

    def refresh_drives(self) -> None:
        drives = get_removable_drives()
        if drives:
            values = [f"{letter}:  [{label}]" for letter, label in drives]
            self.drive_combo["values"] = values
            self.drive_combo.current(0)
            self._set_buttons("normal")
            self._log(f"Found {len(drives)} removable drive(s): {', '.join(l + ':' for l, _ in drives)}")
        else:
            self.drive_combo["values"] = []
            self.drive_var.set("(no removable drives found)")
            self._set_buttons("disabled")
            self._log("No removable drives detected.")

    # ── Actions ────────────────────────────────────────────────

    def deploy(self) -> None:
        drive = self.get_selected_drive()
        if not drive:
            return

        if not DIST_EXE.exists():
            messagebox.showerror("Missing Build",
                f"Executable not found:\n{DIST_EXE}\n\nRun build_distribution.py first.")
            return

        target_root = Path(f"{drive}:\\")
        target_exe = target_root / EXE_NAME
        token_path = target_root / TOKEN_FILENAME

        if token_path.exists():
            if not messagebox.askyesno("Already Deployed",
                    f"{drive}:\\ already has an auth.token.\nOverwrite and rebind?"):
                return

        try:
            self._set_buttons("disabled")

            # Copy exe
            self._log(f"Copying {EXE_NAME} → {target_exe} …")
            shutil.copy2(DIST_EXE, target_exe)
            size_mb = target_exe.stat().st_size / (1024 * 1024)
            self._log(f"  Copied ({size_mb:.1f} MB)")

            # Generate token
            serial = get_drive_serial(drive)
            if not serial:
                raise RuntimeError(f"Cannot read serial for drive {drive}:")

            fingerprint = hmac.new(SECRET_KEY, serial.encode(), hashlib.sha256).hexdigest()
            token_data = {
                "fingerprint": fingerprint,
                "deployed_at": datetime.utcnow().isoformat(),
                "drive_serial": serial,
            }
            token_path.write_text(json.dumps(token_data, indent=2), encoding="utf-8")
            self._log(f"  Token written (serial {serial})")

            self._log("✓ Deployment complete.")
            messagebox.showinfo("Success",
                f"Successfully deployed to {drive}:\\\n\n"
                f"• {EXE_NAME}  ({size_mb:.1f} MB)\n"
                f"• auth.token  (bound to serial {serial})")

        except Exception as exc:
            self._log(f"✗ Error: {exc}")
            messagebox.showerror("Deploy Failed", str(exc))
        finally:
            self._set_buttons("normal")

    def check_token(self) -> None:
        drive = self.get_selected_drive()
        if not drive:
            return

        token_path = Path(f"{drive}:\\") / TOKEN_FILENAME
        if not token_path.exists():
            self._log(f"No auth.token on {drive}:\\")
            messagebox.showinfo("No Token", f"No auth.token found on {drive}:\\")
            return

        try:
            data = json.loads(token_path.read_text(encoding="utf-8"))
            serial = get_drive_serial(drive)
            if not serial:
                raise RuntimeError("Cannot read drive serial.")

            expected = hmac.new(SECRET_KEY, serial.encode(), hashlib.sha256).hexdigest()
            valid = hmac.compare_digest(data.get("fingerprint", ""), expected)
            deployed_at = data.get("deployed_at", "unknown")

            if valid:
                self._log(f"✓ Token VALID on {drive}:\\  (serial {serial}, deployed {deployed_at})")
                messagebox.showinfo("Valid Licence",
                    f"✅ Token is VALID\n\nDrive: {drive}:\\\nSerial: {serial}\nDeployed: {deployed_at}")
            else:
                self._log(f"✗ Token INVALID on {drive}:\\  (serial mismatch)")
                messagebox.showwarning("Invalid Licence",
                    f"❌ Token does NOT match this drive.\n\nDrive serial: {serial}")

        except Exception as exc:
            self._log(f"✗ Error reading token: {exc}")
            messagebox.showerror("Error", str(exc))

    def revoke(self) -> None:
        drive = self.get_selected_drive()
        if not drive:
            return

        token_path = Path(f"{drive}:\\") / TOKEN_FILENAME
        if not token_path.exists():
            messagebox.showinfo("Nothing to Revoke", f"No auth.token on {drive}:\\")
            return

        if not messagebox.askyesno("Confirm Revoke",
                f"Delete auth.token from {drive}:\\ ?\nThe app will no longer run from this USB."):
            return

        try:
            token_path.unlink()
            self._log(f"✓ Licence revoked on {drive}:\\")
            messagebox.showinfo("Revoked", f"auth.token deleted from {drive}:\\")
        except Exception as exc:
            self._log(f"✗ Revoke failed: {exc}")
            messagebox.showerror("Error", str(exc))


# ── Entry point ────────────────────────────────────────────────
if __name__ == "__main__":
    root = tk.Tk()
    app = USBManagerApp(root)
    root.mainloop()
