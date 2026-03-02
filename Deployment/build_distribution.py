"""
build_distribution.py
=====================
Builds the Merbana application into a single distributable .exe  (Windows).

For a Linux binary run instead::

    python Deployment/build_linux.py [--skip-frontend] [--backend gtk|qt]

Steps
-----
1. npm run build  — produces ./dist/ (React SPA)
2. Nuitka --onefile — compiles merbana_launcher.py into Merbana.exe
   The dist/ folder is embedded inside the exe via --include-data-dir.

Usage
-----
    python Deployment/build_distribution.py [--skip-frontend]

Requirements
------------
    pip install nuitka zstandard pywebview
"""

import argparse
import os
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path


# ── Helpers ────────────────────────────────────────────────────

def run(cmd: str | list, *, cwd: Path | None = None) -> None:
    """Run a shell command, exit on failure."""
    display = cmd if isinstance(cmd, str) else " ".join(cmd)
    print(f"\n▶  {display}")
    result = subprocess.run(cmd, shell=isinstance(cmd, str), cwd=cwd)
    if result.returncode != 0:
        print(f"\n✗  Command failed (exit {result.returncode})")
        sys.exit(result.returncode)


def ensure_nuitka() -> None:
    """Install Nuitka + zstandard if missing."""
    try:
        import nuitka  # noqa: F401  (just checking)
    except ImportError:
        print("Nuitka not found — installing …")
        run([sys.executable, "-m", "pip", "install", "nuitka", "zstandard"])


# ── Main ───────────────────────────────────────────────────────

def main() -> None:
    if platform.system() != "Windows":
        print(
            "⚠  This script builds a Windows .exe and must run on Windows.\n"
            "   For a Linux binary use:  python Deployment/build_linux.py"
        )
        sys.exit(1)

    parser = argparse.ArgumentParser(description="Build Merbana distributable")
    parser.add_argument(
        "--skip-frontend", action="store_true",
        help="Skip 'npm run build' (useful when dist/ is already up-to-date)",
    )
    args = parser.parse_args()

    project_root = Path(__file__).parent.parent.resolve()
    deployment_dir = project_root / "Deployment"
    dist_dir = project_root / "dist"
    launcher_script = deployment_dir / "merbana_launcher.py"
    output_exe = dist_dir / "Merbana.exe"

    t_start = time.time()
    print("=" * 60)
    print("  Merbana Build Script")
    print(f"  Project root: {project_root}")
    print("=" * 60)

    # ── Step 1: Frontend build ─────────────────────────────────
    if args.skip_frontend:
        print("\n⏭  Skipping frontend build (--skip-frontend)")
        if not (dist_dir / "index.html").exists():
            print("✗  dist/index.html not found — run without --skip-frontend first.")
            sys.exit(1)
    else:
        if dist_dir.exists():
            print(f"\n🧹 Cleaning {dist_dir} …")
            shutil.rmtree(dist_dir)

        print("\n⚛  Building React frontend …")
        run("npm run build", cwd=project_root)

        if not (dist_dir / "index.html").exists():
            print("✗  Frontend build failed: dist/index.html not found.")
            sys.exit(1)
        print("✓  Frontend build OK")

    # ── Step 2: Ensure Nuitka ──────────────────────────────────
    ensure_nuitka()

    # ── Step 3: Compile launcher ───────────────────────────────
    print("\n🔨 Compiling launcher with Nuitka …")

    #  Key flags explained:
    #  --standalone        → self-contained directory (prerequisite for --onefile)
    #  --onefile           → compress everything into a single .exe
    #  --windows-console-mode=disable → no console window on launch
    #  --include-data-dir  → embed the React build inside the exe; the launcher
    #                         looks for it at  <exe_dir>/dist/
    #  --include-package=webview → bundle pywebview + its helpers
    #  --nofollow-import-to=tkinter → exclude tkinter (not used in launcher)
    nuitka_cmd = [
        sys.executable, "-m", "nuitka",
        "--standalone",
        "--onefile",
        "--windows-console-mode=disable",
        f"--include-data-dir={dist_dir}=dist",
        "--include-package=webview",
        "--nofollow-import-to=tkinter",
        f"--output-dir={dist_dir}",
        f"--output-filename=Merbana.exe",
        str(launcher_script),
    ]

    run(nuitka_cmd, cwd=project_root)

    # ── Step 4: Verify output ──────────────────────────────────
    if not output_exe.exists():
        print(f"✗  Compilation appeared to succeed but {output_exe} was not found.")
        sys.exit(1)

    size_mb = output_exe.stat().st_size / (1024 * 1024)
    elapsed = time.time() - t_start

    print("\n" + "=" * 60)
    print("  ✅  Build complete!")
    print(f"  Executable : {output_exe}")
    print(f"  Size       : {size_mb:.1f} MB")
    print(f"  Time       : {elapsed:.0f}s")
    print("=" * 60)
    print("\nNext step: run  python Deployment/usb_manager.py  to deploy to USB.")


if __name__ == "__main__":
    main()
