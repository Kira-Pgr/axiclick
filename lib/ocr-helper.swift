import Cocoa
import Vision

// ocr-helper: Fast native OCR using macOS Vision framework
// Usage: ocr-helper <image-path>
// Outputs JSON array of {text, x1, y1, x2, y2} to stdout

guard CommandLine.arguments.count >= 2 else {
    fputs("usage: ocr-helper <image-path>\n", stderr)
    exit(1)
}

let imagePath = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: imagePath),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("error: cannot load image\n", stderr)
    exit(1)
}

let imgW = cgImage.width
let imgH = cgImage.height

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
request.recognitionLanguages = ["en", "zh-Hans", "zh-Hant", "ja", "ko"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    fputs("error: OCR request failed: \(error)\n", stderr)
    exit(1)
}

guard let results = request.results else {
    print("[]")
    exit(0)
}

var elements: [[String: Any]] = []

for obs in results {
    guard let candidate = obs.topCandidates(1).first else { continue }
    let box = obs.boundingBox
    // Vision coordinates: origin bottom-left, normalized 0-1
    let x1 = Int(box.origin.x * CGFloat(imgW))
    let y1 = Int((1.0 - box.origin.y - box.height) * CGFloat(imgH))
    let x2 = Int((box.origin.x + box.width) * CGFloat(imgW))
    let y2 = Int((1.0 - box.origin.y) * CGFloat(imgH))

    let elem: [String: Any] = [
        "text": candidate.string,
        "conf": candidate.confidence,
        "x1": x1, "y1": y1, "x2": x2, "y2": y2
    ]
    elements.append(elem)
}

// Output as JSON
let jsonData = try! JSONSerialization.data(withJSONObject: elements, options: [])
print(String(data: jsonData, encoding: .utf8)!)
