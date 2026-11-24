import subprocess
import time
import sys
import os
import requests

print("Starting live Uvicorn backend process on port 5000...")
proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "5000"],
    cwd=os.path.abspath(r".\Rooftop-Solar-Energy-Potential-Map-main"),
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)

try:
    # Wait for server to bind
    for _ in range(15):
        time.sleep(1)
        try:
            r = requests.get("http://127.0.0.1:5000/api/health", timeout=2)
            if r.status_code == 200:
                print("Server online! Health check response:", r.json())
                break
        except Exception:
            continue
    else:
        out, err = proc.communicate(timeout=3)
        raise RuntimeError(f"Server failed to start. Stdout: {out}, Stderr: {err}")

    # Test Tariffs endpoint over real network
    r_tariffs = requests.get("http://127.0.0.1:5000/api/tariffs", timeout=3)
    assert r_tariffs.status_code == 200
    print("Tariffs endpoint probe: 200 OK, payload:", len(r_tariffs.json()["jurisdictions"]), "jurisdiction(s)")

    # Test Frontend root over real network
    r_root = requests.get("http://127.0.0.1:5000/", timeout=3)
    assert r_root.status_code == 200
    print("Frontend root probe: 200 OK (Serving React production build)")

    print(">> LIVE SERVER NETWORK PROBE: 100% SUCCESSFUL!")

finally:
    proc.terminate()
    try:
        proc.wait(timeout=3)
    except Exception:
        proc.kill()
    print("Live server probe process cleanly shut down.")
