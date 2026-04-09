#!/usr/bin/env python3
"""
OmniParser CLI for axiclick SoM integration.
Usage:
  omniparser_cli.py <image-path> <output-path> [--box-threshold 0.05] [--iou-threshold 0.1] [--imgsz 640]
  omniparser_cli.py --check   (verify models are loaded)
"""

import sys
import os
import json
import argparse
from pathlib import Path

AXICLICK_DIR = Path.home() / ".axiclick"
WEIGHTS_DIR = AXICLICK_DIR / "models"
OMNIPARSER_DIR = AXICLICK_DIR / "OmniParser"


def check_setup():
    """Verify OmniParser is set up correctly."""
    yolo_path = WEIGHTS_DIR / "icon_detect" / "model.pt"
    caption_path = WEIGHTS_DIR / "icon_caption_florence" / "model.safetensors"

    ok = True
    if not yolo_path.exists():
        print(f"missing: {yolo_path}", file=sys.stderr)
        ok = False
    if not caption_path.exists():
        print(f"missing: {caption_path}", file=sys.stderr)
        ok = False

    if ok:
        print("status: ready")
    else:
        print("status: not-ready")
        sys.exit(1)


def load_models():
    """Load YOLO and Florence2 models."""
    # Add OmniParser to path for its utils
    if OMNIPARSER_DIR.exists():
        sys.path.insert(0, str(OMNIPARSER_DIR))

    from ultralytics import YOLO
    from transformers import AutoModelForCausalLM, AutoProcessor

    yolo_path = str(WEIGHTS_DIR / "icon_detect" / "model.pt")
    caption_path = str(WEIGHTS_DIR / "icon_caption_florence")

    yolo_model = YOLO(yolo_path)

    caption_model = AutoModelForCausalLM.from_pretrained(
        caption_path, trust_remote_code=True
    )
    caption_processor = AutoProcessor.from_pretrained(
        caption_path, trust_remote_code=True
    )

    return yolo_model, caption_model, caption_processor


def run_ocr(image):
    """Run EasyOCR on image, return list of (bbox, text)."""
    import easyocr
    import numpy as np

    reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    img_np = np.array(image)
    results = reader.readtext(img_np)

    ocr_elements = []
    for bbox, text, conf in results:
        if conf < 0.3:
            continue
        # bbox is [[x1,y1],[x2,y1],[x2,y2],[x1,y2]]
        x1 = int(min(p[0] for p in bbox))
        y1 = int(min(p[1] for p in bbox))
        x2 = int(max(p[0] for p in bbox))
        y2 = int(max(p[1] for p in bbox))
        ocr_elements.append({
            "bbox": [x1, y1, x2, y2],
            "label": text,
            "kind": "text",
            "conf": float(conf),
        })

    return ocr_elements


def run_yolo(image, yolo_model, box_threshold=0.05, iou_threshold=0.1, imgsz=640):
    """Run YOLO icon detection on image."""
    import numpy as np

    img_np = np.array(image)
    results = yolo_model.predict(
        source=img_np,
        conf=box_threshold,
        iou=iou_threshold,
        imgsz=imgsz,
        verbose=False,
    )

    elements = []
    if results and len(results) > 0:
        for box in results[0].boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = float(box.conf[0])
            elements.append({
                "bbox": [int(x1), int(y1), int(x2), int(y2)],
                "label": "",
                "kind": "icon",
                "conf": conf,
            })

    return elements


def caption_elements(image, elements, caption_model, caption_processor):
    """Generate captions for detected icon elements using Florence2."""
    import torch
    from PIL import Image as PILImage

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    caption_model = caption_model.to(device)

    for elem in elements:
        if elem["kind"] != "icon" or elem["label"]:
            continue

        x1, y1, x2, y2 = elem["bbox"]
        # Crop element from image
        crop = image.crop((x1, y1, x2, y2))
        if crop.width < 5 or crop.height < 5:
            continue

        try:
            prompt = "<CAPTION>"
            inputs = caption_processor(
                text=prompt, images=crop, return_tensors="pt"
            ).to(device)

            with torch.no_grad():
                generated_ids = caption_model.generate(
                    input_ids=inputs["input_ids"],
                    pixel_values=inputs["pixel_values"],
                    max_new_tokens=50,
                    num_beams=3,
                )

            generated_text = caption_processor.batch_decode(
                generated_ids, skip_special_tokens=True
            )[0]
            elem["label"] = generated_text.strip()
        except Exception:
            pass

    return elements


def merge_elements(ocr_elements, yolo_elements, image_w, image_h):
    """Merge OCR and YOLO detections, removing overlaps."""

    def iou(a, b):
        x1 = max(a[0], b[0])
        y1 = max(a[1], b[1])
        x2 = min(a[2], b[2])
        y2 = min(a[3], b[3])
        inter = max(0, x2 - x1) * max(0, y2 - y1)
        area_a = (a[2] - a[0]) * (a[3] - a[1])
        area_b = (b[2] - b[0]) * (b[3] - b[1])
        union = area_a + area_b - inter
        return inter / union if union > 0 else 0

    merged = list(ocr_elements)
    used = set()

    for i, yolo_elem in enumerate(yolo_elements):
        overlaps = False
        for ocr_elem in ocr_elements:
            if iou(yolo_elem["bbox"], ocr_elem["bbox"]) > 0.3:
                overlaps = True
                break
        if not overlaps:
            # Skip elements that are basically the whole screen
            bw = yolo_elem["bbox"][2] - yolo_elem["bbox"][0]
            bh = yolo_elem["bbox"][3] - yolo_elem["bbox"][1]
            if bw > image_w * 0.8 and bh > image_h * 0.8:
                continue
            merged.append(yolo_elem)

    return merged


def annotate_image(image, elements):
    """Draw numbered marks on the image."""
    from PIL import ImageDraw, ImageFont

    annotated = image.copy()
    draw = ImageDraw.Draw(annotated)

    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 14)
        font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 12)
    except Exception:
        font = ImageFont.load_default()
        font_small = font

    for elem in elements:
        x1, y1, x2, y2 = elem["bbox"]
        eid = elem["id"]

        # Color by kind
        if elem["kind"] == "text":
            color = (51, 153, 255)  # blue
            fill = (51, 153, 255, 30)
        else:
            color = (255, 102, 51)  # orange
            fill = (255, 102, 51, 30)

        # Draw box border
        draw.rectangle([x1, y1, x2, y2], outline=color, width=2)

        # Draw badge
        label = str(eid)
        badge_w = max(20, len(label) * 9 + 8)
        badge_h = 18
        badge_x = x1
        badge_y = max(0, y1 - badge_h)

        draw.rectangle(
            [badge_x, badge_y, badge_x + badge_w, badge_y + badge_h],
            fill=(230, 50, 50),
        )
        draw.text(
            (badge_x + 4, badge_y + 1), label, fill=(255, 255, 255), font=font_small
        )

    return annotated


def main():
    parser = argparse.ArgumentParser(description="OmniParser CLI for axiclick")
    parser.add_argument("image", nargs="?", help="Input image path")
    parser.add_argument("output", nargs="?", help="Output annotated image path")
    parser.add_argument("--check", action="store_true", help="Check setup status")
    parser.add_argument("--box-threshold", type=float, default=0.05)
    parser.add_argument("--iou-threshold", type=float, default=0.1)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--no-caption", action="store_true", help="Skip captioning")
    parser.add_argument("--scale", type=float, default=1.0, help="Retina scale factor (auto-detected if not set)")
    args = parser.parse_args()

    if args.check:
        check_setup()
        return

    if not args.image or not args.output:
        parser.print_help()
        sys.exit(2)

    from PIL import Image

    # Suppress warnings
    import warnings
    warnings.filterwarnings("ignore")
    import logging
    logging.disable(logging.WARNING)

    # Load image
    image = Image.open(args.image).convert("RGB")
    img_w, img_h = image.size

    # Load models (stderr for progress)
    print("loading models...", file=sys.stderr)
    yolo_model, caption_model, caption_processor = load_models()

    # Run OCR
    print("running OCR...", file=sys.stderr)
    ocr_elements = run_ocr(image)

    # Run YOLO detection
    print("detecting elements...", file=sys.stderr)
    yolo_elements = run_yolo(
        image, yolo_model, args.box_threshold, args.iou_threshold, args.imgsz
    )

    # Caption YOLO elements
    if not args.no_caption and yolo_elements:
        print("captioning elements...", file=sys.stderr)
        yolo_elements = caption_elements(
            image, yolo_elements, caption_model, caption_processor
        )

    # Merge
    all_elements = merge_elements(ocr_elements, yolo_elements, img_w, img_h)

    # Assign IDs
    for i, elem in enumerate(all_elements):
        elem["id"] = i + 1

    # Annotate and save
    annotated = annotate_image(image, all_elements)
    annotated.save(args.output)

    # Output TOON to stdout with screen coordinates (divide by Retina scale)
    scale = args.scale
    file_size = os.path.getsize(args.output)
    print(f"som:")
    print(f"  path: {args.output}")
    print(f"  size: {file_size // 1024}KB")
    print(f"  elements: {len(all_elements)}")
    if scale != 1.0:
        print(f"  scale: {scale}x (coords are screen-ready)")

    if not all_elements:
        print("marks: 0 elements detected")
    else:
        print(f"marks[{len(all_elements)}]{{id,kind,label,x,y,w,h}}:")
        for elem in all_elements:
            x1, y1, x2, y2 = elem["bbox"]
            w = x2 - x1
            h = y2 - y1
            # Convert to screen coordinates
            sx = int(x1 / scale)
            sy = int(y1 / scale)
            sw = int(w / scale)
            sh = int(h / scale)
            label = elem["label"].replace('"', '\\"').replace("\n", " ")
            if "," in label or label.startswith('"'):
                label = f'"{label}"'
            print(f"  {elem['id']},{elem['kind']},{label},{sx},{sy},{sw},{sh}")


if __name__ == "__main__":
    main()
