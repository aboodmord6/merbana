"""
build_linux.py
==============
Builds the Merbana application into a single-file Linux binary.

Steps
-----
1. npm run build   → produces ./dist/  (React SPA)
2. PyInstaller --onefile → compiles merbana_launcher.py into ./dist/Merbana
   The dist/ web-app folder is embedded at runtime via --add-data.

Usage
-----
    Run this script ON a Linux machine (or WSL / GitHub Actions):

        python Deployment/build_linux.py [--skip-frontend] [--backend gtk|qt]

Requirements
------------
    Python packages:
        pip install pyinstaller pywebview

    System packages (Debian / Ubuntu):
        sudo apt update
        sudo apt install \\
            python3-gi python3-gi-cairo gir1.2-gtk-3.0 \\
            gir1.2-webkit2-4.1 \\
            libgtk-3-dev libwebkit2gtk-4.1-dev \\
            nodejs npm

    OR for the Qt backend instead of GTK:
        pip install PyQt5 PyQtWebEngine qtpy
        (no extra system libs needed beyond libGL)

Notes
-----
* Cross-compilation is NOT supported: run this script on a Linux host
  (physical machine, VM, Docker, or WSL2 with a native filesystem).
* The produced binary is dynamically linked to system libs (WebKit2GTK /
  Qt).  Distribute on a machine with the same OS / lib versions, or build
  inside a Docker image that matches your deployment target.
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
    """Run a shell command; exit on non-zero return code."""
    display = cmd if isinstance(cmd, str) else " ".join(str(c) for c in cmd)
    print(f"\n▶  {display}")
    result = subprocess.run(cmd, shell=isinstance(cmd, str), cwd=cwd)
    if result.returncode != 0:
        print(f"\n✗  Command failed (exit {result.returncode})")
        sys.exit(result.returncode)


def ensure_pyinstaller() -> None:
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        print("PyInstaller not found — installing …")
        run([sys.executable, "-m", "pip", "install", "pyinstaller"])


def check_webview_backend(backend: str) -> None:
    """Warn if the required system libraries are missing."""
    if backend == "gtk":
        try:
            import gi  # noqa: F401
        except ImportError:
            print(
                "\n⚠  PyGObject (gi) not found.\n"
                "   Install system packages:\n"
                "     sudo apt install python3-gi python3-gi-cairo "
                "gir1.2-gtk-3.0 gir1.2-webkit2-4.1\n"
            )
    elif backend == "qt":
        try:
            from PyQt5 import QtWebEngineWidgets  # noqa: F401
        except ImportError:
            try:
                from PySide6 import QtWebEngineWidgets  # noqa: F401
            except ImportError:
                print(
                    "\n⚠  PyQt5/PyQtWebEngine not found.\n"
                    "   Install:  pip install PyQt5 PyQtWebEngine qtpy\n"
                )


# ── Main ───────────────────────────────────────────────────────

def main() -> None:
    if platform.system() != "Linux":
        print(
            "⚠  This script is intended to be run on Linux.\n"
            "   You are on: " + platform.system() + "\n"
            "   Use WSL2, a Linux VM, or Docker to produce a Linux binary.\n"
            "   For Windows builds use:  python Deployment/build_distribution.py"
        )
        sys.exit(1)

    parser = argparse.ArgumentParser(description="Build Merbana Linux distributable")
    parser.add_argument(
        "--skip-frontend", action="store_true",
        help="Skip 'npm run build' (reuse existing dist/)",
    )
    parser.add_argument(
        "--backend", choices=["gtk", "qt"], default="gtk",
        help="pywebview backend to use (default: gtk)",
    )
    args = parser.parse_args()

    project_root = Path(__file__).parent.parent.resolve()
    deployment_dir = project_root / "Deployment"
    dist_web = project_root / "dist"          # Vite output (React SPA)
    out_dir = project_root / "dist_linux"     # PyInstaller output
    launcher_script = deployment_dir / "merbana_launcher.py"
    output_bin = out_dir / "Merbana"

    t_start = time.time()
    print("=" * 60)
    print("  Merbana Linux Build Script")
    print(f"  Project root : {project_root}")
    print(f"  Backend      : pywebview / {args.backend}")
    print("=" * 60)

    # ── Step 1: Frontend build ─────────────────────────────────
    if args.skip_frontend:
        print("\n⏭  Skipping frontend build (--skip-frontend)")
        if not (dist_web / "index.html").exists():
            print("✗  dist/index.html not found — run without --skip-frontend first.")
            sys.exit(1)
    else:
        if dist_web.exists():
            print(f"\n🧹 Cleaning {dist_web} …")
            shutil.rmtree(dist_web)

        print("\n⚛  Building React frontend …")
        run("npm run build", cwd=project_root)

        if not (dist_web / "index.html").exists():
            print("✗  Frontend build failed: dist/index.html not found.")
            sys.exit(1)
        print("✓  Frontend build OK")

    # ── Step 2: Ensure PyInstaller ─────────────────────────────
    ensure_pyinstaller()

    # ── Step 3: Check webview backend ─────────────────────────
    check_webview_backend(args.backend)

    # ── Step 4: Clean previous output ─────────────────────────
    if out_dir.exists():
        print(f"\n🧹 Cleaning {out_dir} …")
        shutil.rmtree(out_dir)

    # PyInstaller also writes a build/ work folder and a .spec file
    pi_build_dir = project_root / "build_pyinstaller"
    spec_file = project_root / "Merbana.spec"
    for path in (pi_build_dir, spec_file):
        if path.exists():
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()

    # ── Step 5: Build with PyInstaller ────────────────────────
    print("\n📦 Packaging with PyInstaller …")

    # On Linux --add-data uses "src:dest" (colon separator)
    # We embed the React dist/ folder; the launcher retrieves it from _MEIPASS
    add_data = f"{dist_web}:dist"

    hidden_imports = [
        "--hidden-import", "webview",
        "--hidden-import", "webview.http",
    ]

    if args.backend == "gtk":
        hidden_imports += [
            "--hidden-import", "webview.platforms.gtk",
        ]
    else:
        hidden_imports += [
            "--hidden-import", "webview.platforms.qt",
            "--hidden-import", "PyQt5",
            "--hidden-import", "PyQt5.QtWebEngineWidgets",
        ]

    pyinstaller_cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--noconsole",                        # suppress console window
        "--add-data", add_data,
        "--name", "Merbana",
        "--distpath", str(out_dir),
        "--workpath", str(pi_build_dir),
        "--specpath", str(project_root),
        *hidden_imports,
        str(launcher_script),
    ]

    run(pyinstaller_cmd, cwd=project_root)

    # ── Step 6: Verify output ──────────────────────────────────
    if not output_bin.exists():
        print(f"✗  Compilation appeared to succeed but {output_bin} was not found.")
        sys.exit(1)

    # Make it executable (should already be, but be explicit)
    output_bin.chmod(0o755)

    size_mb = output_bin.stat().st_size / (1024 * 1024)
    elapsed = time.time() - t_start

    print("\n" + "=" * 60)
    print("  ✅  Linux build complete!")
    print(f"  Binary  : {output_bin}")
    print(f"  Size    : {size_mb:.1f} MB")
    print(f"  Time    : {elapsed:.0f}s")
    print("=" * 60)
    print(
        "\nDistribute the single 'Merbana' binary.\n"
        "Target machine must have these system libs installed:\n"
    )
    if args.backend == "gtk":
        print(
            "  sudo apt install \\\n"
            "      python3-gi python3-gi-cairo gir1.2-gtk-3.0 \\\n"
            "      gir1.2-webkit2-4.1\n"
        )
    else:
        print("  pip install PyQt5 PyQtWebEngine\n")

    # Clean up PyInstaller work artefacts
    for path in (pi_build_dir, spec_file):
        if path.exists():
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()


if __name__ == "__main__":
    main()
