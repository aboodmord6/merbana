"""
Shared configuration for all Merbana deployment scripts.
Import from here — never duplicate these values.
"""
import ctypes

# ── Security ──────────────────────────────────────────────────
# Change this key before distributing. Keep it secret.
SECRET_KEY: bytes = b"MERBANA_SECURE_USB_KEY_2024"

# ── Deployment files ──────────────────────────────────────────
TOKEN_FILENAME: str = "auth.token"   # Written to USB root
EXE_NAME: str = "Merbana.exe"
APP_NAME: str = "Merbana"

# ── Drive serial helper (shared between launcher & usb_manager) ──
def get_drive_serial(drive_letter: str) -> str | None:
    """
    Returns the volume serial number (as decimal string) for the given
    drive letter (e.g. 'E'), or None if the call fails.
    """
    volume_name_buf = ctypes.create_unicode_buffer(1024)
    fs_name_buf = ctypes.create_unicode_buffer(1024)
    serial = ctypes.c_ulong(0)
    max_comp = ctypes.c_ulong(0)
    fs_flags = ctypes.c_ulong(0)

    drive_root = f"{drive_letter}:\\"
    ok = ctypes.windll.kernel32.GetVolumeInformationW(
        drive_root,
        volume_name_buf,
        ctypes.sizeof(volume_name_buf),
        ctypes.byref(serial),
        ctypes.byref(max_comp),
        ctypes.byref(fs_flags),
        fs_name_buf,
        ctypes.sizeof(fs_name_buf),
    )
    return str(serial.value) if ok else None
