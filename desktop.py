import sys
import time
import socket
import threading
import subprocess
from pathlib import Path
import uvicorn
import webview

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0

def wait_for_server(port: int, timeout: float = 5.0):
    start = time.time()
    while time.time() - start < timeout:
        if is_port_in_use(port):
            return True
        time.sleep(0.05)
    return False

def run_fastapi(port: int):
    from backend.main import app
    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
        access_log=False
    )
    server = uvicorn.Server(config)
    server.run()

def main():
    api_port = 8000
    is_dev = "--dev" in sys.argv or "-d" in sys.argv

    # Ensure frontend bundle exists if running in non-dev production mode
    dist_dir = Path(__file__).resolve().parent / "dist"
    if not is_dev and not dist_dir.exists():
        print("Frontend dist not found. Building with pnpm...")
        try:
            subprocess.run(["pnpm", "build"], check=True, shell=True)
        except Exception as e:
            print(f"Warning: Failed to build frontend with pnpm: {e}")

    # Start FastAPI backend in a daemon background thread
    server_thread = threading.Thread(target=run_fastapi, args=(api_port,), daemon=True)
    server_thread.start()

    # Wait for FastAPI to bind
    wait_for_server(api_port)

    # Determine URL
    if is_dev:
        dev_port = 5173 if is_port_in_use(5173) else (8443 if is_port_in_use(8443) else 5173)
        target_url = f"http://localhost:{dev_port}"
        print(f"Starting Quatern Desktop in DEV mode (Frontend: {target_url}, API: http://127.0.0.1:{api_port})")
    else:
        target_url = f"http://127.0.0.1:{api_port}"
        print(f"Starting Quatern Desktop (Standalone: {target_url})")

    # Launch PyWebView desktop window (using native Windows WebView2)
    window = webview.create_window(
        title="Quatern — Retail POS & Shop Management",
        url=target_url,
        width=1280,
        height=820,
        min_size=(980, 640),
        text_select=True,
        zoomable=True
    )

    webview.start()

if __name__ == "__main__":
    main()
