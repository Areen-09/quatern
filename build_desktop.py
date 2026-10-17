"""
Quatern Desktop Packaging Script
Packages Quatern into a standalone, distribution-ready Windows executable
that runs without requiring Python, Node.js, or Git.
"""

import sys
import shutil
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
DIST_DIR = ROOT_DIR / "dist"
RELEASE_DIR = ROOT_DIR / "release"

def main():
    print("=" * 60)
    print(" Quatern Desktop - Standalone App Packager")
    print("=" * 60)

    # 1. Build Vite frontend bundle
    print("\n[1/3] Building production frontend with pnpm...")
    try:
        subprocess.run(["pnpm", "build"], cwd=ROOT_DIR, check=True, shell=True)
    except Exception as e:
        print(f"Error building frontend bundle: {e}")
        sys.exit(1)

    if not (DIST_DIR / "index.html").exists():
        print("Error: dist/index.html was not generated.")
        sys.exit(1)

    # 2. Check / install PyInstaller
    print("\n[2/3] Checking PyInstaller...")
    try:
        import PyInstaller
    except ImportError:
        print("PyInstaller not found. Installing pyinstaller via uv/pip...")
        try:
            subprocess.run(["uv", "pip", "install", "pyinstaller"], check=True)
        except Exception:
            subprocess.run([sys.executable, "-m", "pip", "install", "pyinstaller"], check=True)

    # 3. Clean prior release folder
    if RELEASE_DIR.exists():
        shutil.rmtree(RELEASE_DIR, ignore_errors=True)
    RELEASE_DIR.mkdir(parents=True, exist_ok=True)

    # 4. Run PyInstaller
    print("\n[3/3] Compiling standalone Windows executable...")
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--onedir",
        "--windowed",
        "--name", "Quatern",
        "--distpath", str(RELEASE_DIR),
        "--workpath", str(ROOT_DIR / ".pyinstaller_cache"),
        "--add-data", f"{DIST_DIR};dist",
        "--collect-submodules", "uvicorn",
        "--collect-submodules", "fastapi",
        "--collect-submodules", "backend",
        "--hidden-import", "uvicorn.logging",
        "--hidden-import", "uvicorn.loops",
        "--hidden-import", "uvicorn.loops.auto",
        "--hidden-import", "uvicorn.protocols",
        "--hidden-import", "uvicorn.protocols.http",
        "--hidden-import", "uvicorn.protocols.http.auto",
        "--hidden-import", "uvicorn.lifespan",
        "--hidden-import", "uvicorn.lifespan.on",
        str(ROOT_DIR / "desktop.py")
    ]

    try:
        subprocess.run(cmd, cwd=ROOT_DIR, check=True)
    except subprocess.CalledProcessError as e:
        print(f"\nPackaging failed: {e}")
        sys.exit(1)

    # Clean temporary cache
    cache_dir = ROOT_DIR / ".pyinstaller_cache"
    if cache_dir.exists():
        shutil.rmtree(cache_dir, ignore_errors=True)

    spec_file = ROOT_DIR / "Quatern.spec"
    if spec_file.exists():
        spec_file.unlink()

    exe_path = RELEASE_DIR / "Quatern" / "Quatern.exe"
    print("\n" + "=" * 60)
    print(" BUILD SUCCESSFUL!")
    print(f" Standalone Executable: {exe_path}")
    print(f" Folder: {RELEASE_DIR / 'Quatern'}")
    print("=" * 60)
    print("\nYou can now zip the 'release/Quatern' folder and send it to any Windows user.")
    print("They do NOT need Python, Node.js, or any developer tools installed!\n")

if __name__ == "__main__":
    main()
