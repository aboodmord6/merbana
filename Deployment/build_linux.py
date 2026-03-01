"""
build_linux.py
==============
Builds the Merbana application for Linux into a single executable.

Steps:
1. npm run build
2. PyInstaller --onefile run_merbana.py
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

def run(cmd, cwd=None):
    display = cmd if isinstance(cmd, str) else " ".join(cmd)
    print(f"\n▶  {display}")
    result = subprocess.run(cmd, shell=isinstance(cmd, str), cwd=cwd)
    if result.returncode != 0:
        print(f"\n✗  Command failed (exit {result.returncode})")
        sys.exit(result.returncode)

def main():
    project_root = Path(__file__).resolve().parent.parent
    dist_dir = project_root / "dist"
    
    print("=" * 60)
    print("  Merbana Linux Build Script")
    print(f"  Project root: {project_root}")
    print("=" * 60)

    # 1. Build frontend (if npm is available)
    print("\n⚛  Checking frontend build ...")
    if shutil.which("npm"):
        print("▶  npm run build")
        run("npm run build", cwd=project_root)
    else:
        print("⚠️  npm is not installed on this system.")
        print("⚠️  Skipping frontend build. Ensure 'dist/index.html' was copied from the Windows machine.")

    if not (dist_dir / "index.html").exists():
        print("✗  Frontend build failed: dist/index.html not found.")
        sys.exit(1)
    
    # 3. Bundle with PyInstaller
    print("\n📦 Bundling app with PyInstaller ...")
    
    # Note: On Linux, the separator for --add-data is ':' instead of ';'
    pyinstaller_cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--windowed",
        "--add-data=dist:dist",
        "--name=Merbana",
        str(project_root / "run_merbana.py")
    ]
    
    run(pyinstaller_cmd, cwd=project_root)
    
    output_bin = project_root / "dist" / "Merbana"
    
    if output_bin.exists() or Path(str(output_bin) + ".exe").exists():
        final_bin = output_bin if output_bin.exists() else Path(str(output_bin) + ".exe")
        size_mb = final_bin.stat().st_size / (1024 * 1024)
        print("\n" + "=" * 60)
        print("  ✅  Build complete!")
        print(f"  Executable : {final_bin}")
        print(f"  Size       : {size_mb:.1f} MB")
        print("=" * 60)
    else:
        print("\n⚠️ Build finished but executable not found at expected location.")

if __name__ == "__main__":
    main()
