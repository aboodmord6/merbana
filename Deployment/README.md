# Merbana — Deployment Guide

Three scripts handle the full deployment lifecycle.

```
Deployment/
├── config.py               ← shared constants & helpers (don't edit unless changing the key)
├── build_distribution.py   ← Step 1 — build Merbana.exe
├── usb_manager.py          ← Step 2 — deploy to USB drives (GUI)
└── merbana_launcher.py     ← the app entry-point (compiled into Merbana.exe)
```

---

## Prerequisites

```bash
pip install pywebview nuitka zstandard
node + npm   # for the React frontend build
```

---

## Step 1 — Build

```bash
python Deployment/build_distribution.py
```

What it does:

1. Runs `npm run build` → produces `dist/` (the React SPA)
2. Compiles `merbana_launcher.py` with Nuitka into `dist/Merbana.exe`
   - The `dist/` folder is **embedded inside** the exe via `--include-data-dir`

**Tip:** if `dist/` is already up-to-date, skip the frontend step:

```bash
python Deployment/build_distribution.py --skip-frontend
```

---

## Step 2 — Deploy to USB

```bash
python Deployment/usb_manager.py
```

A small GUI will open:

| Button                        | Action                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------- |
| **↻ Refresh**                 | Re-scan for plugged-in USB drives                                               |
| **🚀 Deploy & Authorise USB** | Copies `Merbana.exe` and writes `auth.token` bound to the drive's serial number |
| **🔍 Check Token**            | Validates the existing token against the current drive                          |
| **🗑️ Revoke Licence**         | Deletes `auth.token` — app will no longer run from that USB                     |

---

## How the Security Model Works

1. On Deploy: the script reads the USB's hardware **volume serial number** and creates an HMAC-SHA256 fingerprint signed with `SECRET_KEY` (in `config.py`).
2. `auth.token` (a JSON file) is written to the root of the USB alongside `Merbana.exe`.
3. On every launch: the launcher re-reads the serial, recomputes the fingerprint, and compares it with the stored one using constant-time `hmac.compare_digest`. If they don't match (e.g. exe was copied to another drive), the app refuses to start.

> **⚠ Change `SECRET_KEY` in `config.py` before distributing.** Anyone with the key can forge tokens.

---

## Running from Source (Development)

```bash
# In project root:
npm run dev
# The launcher is not needed during development — the Vite dev server serves the app.
```

To test the launcher itself without building:

```bash
python Deployment/merbana_launcher.py --debug
```

This skips USB verification only when auth.token exists on the drive you're running from.

---

## Troubleshooting

| Symptom                       | Fix                                                              |
| ----------------------------- | ---------------------------------------------------------------- |
| "Auth token not found"        | Run `usb_manager.py` → Deploy & Authorise USB                    |
| "Hardware mismatch"           | The exe was copied to a different USB; re-deploy                 |
| "Application files not found" | The `dist/` folder is missing; run `build_distribution.py` again |
| Nuitka install fails          | Run `pip install nuitka zstandard` manually, then retry          |
| App window is blank           | Check `merbana.log` next to the exe for errors                   |
