#!/usr/bin/env python3
"""
OmniParser model-preloading daemon for axiclick.

Listens on a Unix socket at ~/.axiclick/som.sock.
Keeps YOLO, EasyOCR, and Florence2 models loaded in memory so that
subsequent SoM requests avoid the cold-start penalty.

Protocol: newline-delimited JSON over a Unix stream socket.
Each connection sends one JSON request and receives one JSON response,
then the connection is closed.

Request shapes
--------------
  {"action": "ping"}
  {"action": "shutdown"}
  {
    "action":      "run",
    "image":       "<absolute-path-to-screenshot>",
    "output":      "<absolute-path-for-annotated-output>",
    "scale":       <float, default 1.0>,
    "passthrough": ["--no-caption", ...],   # optional extra CLI flags
    "jsonOut":     "<path>"                 # optional; write element JSON here
  }

Response shapes
---------------
  {"pong": true}
  {"ok": true}       (shutdown acknowledgement)
  {"toon": "<TOON string>"}
  {"error": "<message>"}
"""

import sys
import os
import json
import signal
import socket
import threading
from pathlib import Path

AXICLICK_DIR = Path.home() / ".axiclick"
WEIGHTS_DIR = AXICLICK_DIR / "models"
OMNIPARSER_DIR = AXICLICK_DIR / "OmniParser"
SOCK_PATH = AXICLICK_DIR / "som.sock"

# ── Global model state ────────────────────────────────────────────────────────

_models_lock = threading.Lock()
_yolo_model = None
_caption_model = None
_caption_processor = None
_easyocr_reader = None
_shutdown_event = threading.Event()


def load_all_models():
    """Load YOLO, Florence2, and EasyOCR models into module-level globals."""
    global _yolo_model, _caption_model, _caption_processor, _easyocr_reader

    if OMNIPARSER_DIR.exists():
        sys.path.insert(0, str(OMNIPARSER_DIR))

    import warnings
    warnings.filterwarnings("ignore")
    import logging
    logging.disable(logging.WARNING)

    from ultralytics import YOLO
    from transformers import AutoModelForCausalLM, AutoProcessor
    import easyocr

    yolo_path = str(WEIGHTS_DIR / "icon_detect" / "model.pt")
    caption_path = str(WEIGHTS_DIR / "icon_caption_florence")

    print("server: loading YOLO...", file=sys.stderr, flush=True)
    _yolo_model = YOLO(yolo_path)

    print("server: loading Florence2...", file=sys.stderr, flush=True)
    _caption_model = AutoModelForCausalLM.from_pretrained(
        caption_path, trust_remote_code=True
    )
    _caption_processor = AutoProcessor.from_pretrained(
        caption_path, trust_remote_code=True
    )

    # Move caption model to MPS at load time so it stays on GPU
    import torch
    if torch.backends.mps.is_available():
        _caption_model = _caption_model.to("mps")
        print("server: using MPS (Apple GPU) for YOLO + Florence2", file=sys.stderr, flush=True)

    print("server: loading EasyOCR...", file=sys.stderr, flush=True)
    _easyocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False)

    print("server: models ready", file=sys.stderr, flush=True)


# ── Inference helpers (mirrors omniparser_cli.py, uses cached models) ─────────

def _run_ocr_cached(image):
    import numpy as np
    img_np = np.array(image)
    results = _easyocr_reader.readtext(img_np)
    ocr_elements = []
    for bbox, text, conf in results:
        if conf < 0.3:
            continue
        x1 = int(min(p[0] for p in bbox))
        y1 = int(min(p[1] for p in bbox))
        x2 = int(max(p[0] for p in bbox))
        y2 = int(max(p[1] for p in bbox))
        ocr_elements.append({"bbox": [x1, y1, x2, y2], "label": text, "kind": "text", "conf": float(conf)})
    return ocr_elements


def _run_yolo_cached(image, box_threshold=0.05, iou_threshold=0.1, imgsz=640):
    import torch
    import numpy as np
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    img_np = np.array(image)
    results = _yolo_model.predict(
        source=img_np, conf=box_threshold, iou=iou_threshold, imgsz=imgsz, verbose=False, device=device
    )
    elements = []
    if results and len(results) > 0:
        for box in results[0].boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = float(box.conf[0])
            elements.append({"bbox": [int(x1), int(y1), int(x2), int(y2)], "label": "", "kind": "icon", "conf": conf})
    return elements


def _caption_elements_cached(image, elements):
    import torch

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model = _caption_model  # already on device from load_models()

    for elem in elements:
        if elem["kind"] != "icon" or elem["label"]:
            continue
        x1, y1, x2, y2 = elem["bbox"]
        crop = image.crop((x1, y1, x2, y2))
        if crop.width < 5 or crop.height < 5:
            continue
        try:
            prompt = "<CAPTION>"
            inputs = _caption_processor(text=prompt, images=crop, return_tensors="pt").to(device)
            with torch.no_grad():
                generated_ids = model.generate(
                    input_ids=inputs["input_ids"],
                    pixel_values=inputs["pixel_values"],
                    max_new_tokens=50,
                    num_beams=3,
                )
            generated_text = _caption_processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
            elem["label"] = generated_text.strip()
        except Exception:
            pass
    return elements


def _iou(a, b):
    x1 = max(a[0], b[0]); y1 = max(a[1], b[1])
    x2 = min(a[2], b[2]); y2 = min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0


def _merge(ocr_elements, yolo_elements, image_w, image_h):
    merged = list(ocr_elements)
    for yolo_elem in yolo_elements:
        overlaps = any(_iou(yolo_elem["bbox"], o["bbox"]) > 0.3 for o in ocr_elements)
        if not overlaps:
            bw = yolo_elem["bbox"][2] - yolo_elem["bbox"][0]
            bh = yolo_elem["bbox"][3] - yolo_elem["bbox"][1]
            if bw > image_w * 0.8 and bh > image_h * 0.8:
                continue
            merged.append(yolo_elem)
    return merged


def _annotate(image, elements):
    from PIL import ImageDraw, ImageFont
    annotated = image.copy()
    draw = ImageDraw.Draw(annotated)
    try:
        font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 12)
    except Exception:
        font_small = ImageFont.load_default()

    for elem in elements:
        x1, y1, x2, y2 = elem["bbox"]
        eid = elem["id"]
        color = (51, 153, 255) if elem["kind"] == "text" else (255, 102, 51)
        draw.rectangle([x1, y1, x2, y2], outline=color, width=2)
        label = str(eid)
        badge_w = max(20, len(label) * 9 + 8)
        badge_h = 18
        badge_x = x1
        badge_y = max(0, y1 - badge_h)
        draw.rectangle([badge_x, badge_y, badge_x + badge_w, badge_y + badge_h], fill=(230, 50, 50))
        draw.text((badge_x + 4, badge_y + 1), label, fill=(255, 255, 255), font=font_small)
    return annotated


def _build_toon(output_path, all_elements, scale):
    """Build the same TOON output that omniparser_cli.py prints."""
    lines = []
    file_size = os.path.getsize(output_path)
    lines.append("som:")
    lines.append(f"  path: {output_path}")
    lines.append(f"  size: {file_size // 1024}KB")
    lines.append(f"  elements: {len(all_elements)}")
    if scale != 1.0:
        lines.append(f"  scale: {scale}x (coords are screen-ready)")

    if not all_elements:
        lines.append("marks: 0 elements detected")
    else:
        lines.append(f"marks[{len(all_elements)}]{{id,kind,label,x,y,w,h}}:")
        for elem in all_elements:
            x1, y1, x2, y2 = elem["bbox"]
            w = x2 - x1
            h = y2 - y1
            sx = int(x1 / scale)
            sy = int(y1 / scale)
            sw = int(w / scale)
            sh = int(h / scale)
            lbl = elem["label"].replace('"', '\\"').replace("\n", " ")
            if "," in lbl or lbl.startswith('"'):
                lbl = f'"{lbl}"'
            lines.append(f"  {elem['id']},{elem['kind']},{lbl},{sx},{sy},{sw},{sh}")
    return "\n".join(lines)


def handle_run(req):
    """Process a 'run' request and return a TOON string."""
    image_path = req.get("image")
    output_path = req.get("output")
    scale = float(req.get("scale", 1.0))
    passthrough = req.get("passthrough", [])
    json_out = req.get("jsonOut")

    if not image_path or not output_path:
        return {"error": "run request requires 'image' and 'output' fields"}

    # Parse passthrough flags (mirrors omniparser_cli.py arg parsing)
    box_threshold = 0.05
    iou_threshold = 0.1
    imgsz = 640
    no_caption = False
    i = 0
    while i < len(passthrough):
        flag = passthrough[i]
        if flag == "--box-threshold" and i + 1 < len(passthrough):
            i += 1
            box_threshold = float(passthrough[i])
        elif flag == "--iou-threshold" and i + 1 < len(passthrough):
            i += 1
            iou_threshold = float(passthrough[i])
        elif flag == "--imgsz" and i + 1 < len(passthrough):
            i += 1
            imgsz = int(passthrough[i])
        elif flag == "--no-caption":
            no_caption = True
        i += 1

    from PIL import Image
    image = Image.open(image_path).convert("RGB")
    img_w, img_h = image.size

    with _models_lock:
        ocr_elements = _run_ocr_cached(image)
        yolo_elements = _run_yolo_cached(image, box_threshold, iou_threshold, imgsz)
        if not no_caption and yolo_elements:
            yolo_elements = _caption_elements_cached(image, yolo_elements)

    all_elements = _merge(ocr_elements, yolo_elements, img_w, img_h)
    for idx, elem in enumerate(all_elements):
        elem["id"] = idx + 1

    annotated = _annotate(image, all_elements)
    annotated.save(output_path)

    # Optionally write JSON element list (screen coordinates)
    if json_out:
        json_elements = []
        for elem in all_elements:
            x1, y1, x2, y2 = elem["bbox"]
            w = x2 - x1
            h = y2 - y1
            json_elements.append({
                "id": elem["id"],
                "kind": elem["kind"],
                "label": elem["label"],
                "x": int(x1 / scale),
                "y": int(y1 / scale),
                "w": int(w / scale),
                "h": int(h / scale),
            })
        with open(json_out, "w") as fh:
            json.dump(json_elements, fh)

    toon_str = _build_toon(output_path, all_elements, scale)
    return {"toon": toon_str}


# ── Connection handler ────────────────────────────────────────────────────────

def handle_connection(conn):
    try:
        data = b""
        while True:
            chunk = conn.recv(65536)
            if not chunk:
                break
            data += chunk
            # Stop reading once we have a complete JSON object (simple heuristic:
            # try to parse after every chunk; real clients send one object)
            try:
                req = json.loads(data.decode("utf-8"))
                break
            except json.JSONDecodeError:
                continue

        if not data:
            return

        req = json.loads(data.decode("utf-8"))
        action = req.get("action")

        if action == "ping":
            resp = {"pong": True}
        elif action == "shutdown":
            resp = {"ok": True}
            # Send response before triggering shutdown
            conn.sendall(json.dumps(resp).encode("utf-8"))
            _shutdown_event.set()
            return
        elif action == "run":
            resp = handle_run(req)
        else:
            resp = {"error": f"unknown action: {action!r}"}

        conn.sendall(json.dumps(resp).encode("utf-8"))
    except Exception as exc:
        try:
            conn.sendall(json.dumps({"error": str(exc)}).encode("utf-8"))
        except Exception:
            pass
    finally:
        try:
            conn.close()
        except Exception:
            pass


# ── Server main ───────────────────────────────────────────────────────────────

def main():
    # Ensure ~/.axiclick exists
    AXICLICK_DIR.mkdir(parents=True, exist_ok=True)

    # Remove stale socket if present
    sock_str = str(SOCK_PATH)
    if SOCK_PATH.exists():
        SOCK_PATH.unlink()

    # Load models before accepting connections
    load_all_models()

    server_sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server_sock.bind(sock_str)
    server_sock.listen(8)
    server_sock.settimeout(1.0)  # allows checking _shutdown_event each second

    print(f"server: listening on {sock_str}", file=sys.stderr, flush=True)

    def _sigterm(signum, frame):
        _shutdown_event.set()

    signal.signal(signal.SIGTERM, _sigterm)
    signal.signal(signal.SIGINT, _sigterm)

    while not _shutdown_event.is_set():
        try:
            conn, _ = server_sock.accept()
        except socket.timeout:
            continue
        except OSError:
            break
        # Handle each connection in its own thread so the server stays responsive
        t = threading.Thread(target=handle_connection, args=(conn,), daemon=True)
        t.start()

    server_sock.close()
    if SOCK_PATH.exists():
        SOCK_PATH.unlink()
    print("server: shut down", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
