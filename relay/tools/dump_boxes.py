"""Proof for the demo: what the relay holds for a drop box is ciphertext only.

    python3 relay/tools/dump_boxes.py

Runs create -> drop in-process (Flask test client) on synthetic data and prints, per box, the ciphertext
length and the first 16 bytes of `ct` in hex. Never prints plaintext or key material.
"""
import base64
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402

import app as relay_app  # noqa: E402
from dropbox import BOXES  # noqa: E402

SYNTHETIC = {"v": 1, "workouts": [{"sport": "squash", "start_s": 3600, "end_s": 600, "kcal": 410.0, "src": "watch",
                                    "hr": [{"t_s": 3600 - i * 15, "v": 120.0 + i % 40} for i in range(200)]}],
             "rhr": [{"t_s": 40000, "v": 52.0}], "hrv": [{"t_s": 30000, "v": 61.0}], "effort": [{"t_s": 590, "v": 7.0}]}


def run(payload: dict = SYNTHETIC) -> list[str]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    spki = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    c = relay_app.app.test_client()
    box = c.post("/v1/box", json={"pub": base64.b64encode(spki).decode()}).get_json()
    c.post(f"/v1/drop/{box['box']}", data=json.dumps(payload), headers={"Authorization": f"Bearer {box['write']}"})
    lines = []
    for _bid, b in BOXES.items():
        if b["drop"]:
            ct = base64.b64decode(b["drop"]["ct"])
            lines.append(f"box: ciphertext {len(ct)} bytes, head {ct[:16].hex()}")
    return lines


if __name__ == "__main__":
    sys.stdout.write("\n".join(run()) + "\n")
