import Cocoa
import Vision
import UniformTypeIdentifiers

// som-helper: Set-of-Mark screenshot annotation
// Usage: som-helper <output-path> [--display <n>] [--region <x>,<y>,<w>,<h>]
// Takes a screenshot, detects text and UI elements, overlays numbered marks,
// saves annotated image, and prints element list to stdout.

struct SoMElement {
    let id: Int
    let label: String
    let x: Int
    let y: Int
    let w: Int
    let h: Int
    let kind: String // text, button, field, image, region
}

// ── Screenshot ──

func captureScreen(region: CGRect? = nil, displayID: CGDirectDisplayID = CGMainDisplayID()) -> CGImage? {
    if let r = region {
        return CGWindowListCreateImage(r, .optionOnScreenOnly, kCGNullWindowID, [.bestResolution])
    }
    let bounds = CGDisplayBounds(displayID)
    return CGWindowListCreateImage(bounds, .optionOnScreenOnly, kCGNullWindowID, [.bestResolution])
}

// ── Vision: detect text regions ──

func detectText(in image: CGImage) -> [SoMElement] {
    var elements: [SoMElement] = []
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false

    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try? handler.perform([request])

    guard let results = request.results else { return elements }

    let imgW = image.width
    let imgH = image.height

    for obs in results {
        guard let candidate = obs.topCandidates(1).first else { continue }
        let box = obs.boundingBox
        // Vision coordinates: origin bottom-left, normalized
        let x = Int(box.origin.x * CGFloat(imgW))
        let y = Int((1 - box.origin.y - box.height) * CGFloat(imgH))
        let w = Int(box.width * CGFloat(imgW))
        let h = Int(box.height * CGFloat(imgH))

        elements.append(SoMElement(
            id: 0, // assigned later
            label: candidate.string,
            x: x, y: y, w: w, h: h,
            kind: "text"
        ))
    }

    return elements
}

// ── Vision: detect rectangles (buttons, fields, UI elements) ──

func detectRectangles(in image: CGImage) -> [SoMElement] {
    var elements: [SoMElement] = []
    let request = VNDetectRectanglesRequest()
    request.minimumSize = 0.02
    request.maximumObservations = 50
    request.minimumConfidence = 0.5
    request.minimumAspectRatio = 0.1
    request.maximumAspectRatio = 10.0

    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try? handler.perform([request])

    guard let results = request.results else { return elements }

    let imgW = image.width
    let imgH = image.height

    for obs in results {
        let box = obs.boundingBox
        let x = Int(box.origin.x * CGFloat(imgW))
        let y = Int((1 - box.origin.y - box.height) * CGFloat(imgH))
        let w = Int(box.width * CGFloat(imgW))
        let h = Int(box.height * CGFloat(imgH))

        // Skip very large rectangles (likely the window itself)
        if w > imgW * 8 / 10 && h > imgH * 8 / 10 { continue }
        // Skip tiny rectangles
        if w < 10 || h < 10 { continue }

        elements.append(SoMElement(
            id: 0,
            label: "",
            x: x, y: y, w: w, h: h,
            kind: "region"
        ))
    }

    return elements
}

// ── Merge overlapping elements ──

func iou(_ a: SoMElement, _ b: SoMElement) -> Double {
    let x1 = max(a.x, b.x)
    let y1 = max(a.y, b.y)
    let x2 = min(a.x + a.w, b.x + b.w)
    let y2 = min(a.y + a.h, b.y + b.h)
    let intersection = max(0, x2 - x1) * max(0, y2 - y1)
    let union = a.w * a.h + b.w * b.h - intersection
    return union > 0 ? Double(intersection) / Double(union) : 0
}

func mergeElements(_ textElements: [SoMElement], _ rectElements: [SoMElement]) -> [SoMElement] {
    var merged: [SoMElement] = []
    var usedRects = Set<Int>()

    // Add all text elements
    for text in textElements {
        merged.append(text)
        // Mark overlapping rectangles as used
        for (i, rect) in rectElements.enumerated() {
            if iou(text, rect) > 0.3 {
                usedRects.insert(i)
            }
        }
    }

    // Add non-overlapping rectangles
    for (i, rect) in rectElements.enumerated() {
        if !usedRects.contains(i) {
            merged.append(rect)
        }
    }

    return merged
}

// ── Draw marks on image ──

func annotateImage(_ image: CGImage, elements: [SoMElement]) -> CGImage? {
    let w = image.width
    let h = image.height

    guard let ctx = CGContext(
        data: nil,
        width: w, height: h,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
    ) else { return nil }

    // Draw original image
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))

    for elem in elements {
        // Flip y for Core Graphics (origin bottom-left)
        let flippedY = h - elem.y - elem.h

        // Draw semi-transparent highlight box
        let boxRect = CGRect(x: elem.x, y: flippedY, width: elem.w, height: elem.h)

        let highlightColor: CGColor
        switch elem.kind {
        case "text":
            highlightColor = CGColor(red: 0.2, green: 0.6, blue: 1.0, alpha: 0.15)
        default:
            highlightColor = CGColor(red: 1.0, green: 0.4, blue: 0.2, alpha: 0.15)
        }
        ctx.setFillColor(highlightColor)
        ctx.fill(boxRect)

        // Draw border
        let borderColor: CGColor
        switch elem.kind {
        case "text":
            borderColor = CGColor(red: 0.2, green: 0.6, blue: 1.0, alpha: 0.8)
        default:
            borderColor = CGColor(red: 1.0, green: 0.4, blue: 0.2, alpha: 0.8)
        }
        ctx.setStrokeColor(borderColor)
        ctx.setLineWidth(2.0)
        ctx.stroke(boxRect)

        // Draw label badge (top-left corner)
        let labelText = "\(elem.id)"
        let badgeSize = CGSize(width: max(22, labelText.count * 10 + 8), height: 20)
        let badgeRect = CGRect(
            x: elem.x,
            y: flippedY + elem.h - Int(badgeSize.height),
            width: Int(badgeSize.width),
            height: Int(badgeSize.height)
        )

        // Badge background
        ctx.setFillColor(CGColor(red: 1.0, green: 0.2, blue: 0.2, alpha: 0.95))
        ctx.fill(badgeRect)

        // Badge text
        let nsCtx = NSGraphicsContext(cgContext: ctx, flipped: false)
        NSGraphicsContext.current = nsCtx
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.boldSystemFont(ofSize: 13),
            .foregroundColor: NSColor.white,
        ]
        let nsStr = NSString(string: labelText)
        let strSize = nsStr.size(withAttributes: attrs)
        let strX = CGFloat(badgeRect.origin.x) + (badgeSize.width - strSize.width) / 2
        let strY = CGFloat(badgeRect.origin.y) + (badgeSize.height - strSize.height) / 2
        nsStr.draw(at: NSPoint(x: strX, y: strY), withAttributes: attrs)
    }

    return ctx.makeImage()
}

// ── Save image ──

func saveImage(_ image: CGImage, to path: String) -> Bool {
    let url = URL(fileURLWithPath: path)
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
        return false
    }
    CGImageDestinationAddImage(dest, image, nil)
    return CGImageDestinationFinalize(dest)
}

// ── AX tree fallback: get elements from accessibility ──

func getAXElements() -> [SoMElement] {
    guard let frontApp = NSWorkspace.shared.frontmostApplication else { return [] }
    let appElement = AXUIElementCreateApplication(frontApp.processIdentifier)

    var elements: [SoMElement] = []
    walkAX(appElement, depth: 0, maxDepth: 8, elements: &elements)
    return elements
}

func getAXAttr(_ element: AXUIElement, _ attr: String) -> AnyObject? {
    var value: AnyObject?
    AXUIElementCopyAttributeValue(element, attr as CFString, &value)
    return value
}

func walkAX(_ element: AXUIElement, depth: Int, maxDepth: Int, elements: inout [SoMElement]) {
    if depth > maxDepth || elements.count > 300 { return }

    let role = (getAXAttr(element, kAXRoleAttribute) as? String) ?? ""
    let title = (getAXAttr(element, kAXTitleAttribute) as? String) ?? ""
    let desc = (getAXAttr(element, kAXDescriptionAttribute) as? String) ?? ""

    var position: CGPoint?
    var size: CGSize?
    if let posVal = getAXAttr(element, kAXPositionAttribute) {
        var p = CGPoint.zero
        AXValueGetValue(posVal as! AXValue, .cgPoint, &p)
        position = p
    }
    if let sizeVal = getAXAttr(element, kAXSizeAttribute) {
        var s = CGSize.zero
        AXValueGetValue(sizeVal as! AXValue, .cgSize, &s)
        size = s
    }

    let interactive = ["AXButton", "AXTextField", "AXTextArea", "AXCheckBox",
                       "AXRadioButton", "AXPopUpButton", "AXComboBox", "AXSlider",
                       "AXLink", "AXMenuItem", "AXMenuButton", "AXTab",
                       "AXSearchField", "AXImage"].contains(role)

    if interactive || (!title.isEmpty && !role.isEmpty), let p = position, let s = size,
       s.width > 5 && s.height > 5 {
        let label = !title.isEmpty ? title : (!desc.isEmpty ? desc : "")
        let kind: String
        switch role {
        case "AXButton", "AXMenuButton": kind = "button"
        case "AXTextField", "AXTextArea", "AXSearchField", "AXComboBox": kind = "field"
        case "AXImage": kind = "image"
        default: kind = "region"
        }
        elements.append(SoMElement(
            id: 0,
            label: label,
            x: Int(p.x), y: Int(p.y),
            w: Int(s.width), h: Int(s.height),
            kind: kind
        ))
    }

    guard let children = getAXAttr(element, kAXChildrenAttribute) as? [AXUIElement] else { return }
    for child in children {
        walkAX(child, depth: depth + 1, maxDepth: maxDepth, elements: &elements)
    }
}

// ── Main ──

var outputPath = "/tmp/som-screenshot.png"
var displayID = CGMainDisplayID()
var region: CGRect? = nil

var i = 1
while i < CommandLine.arguments.count {
    let arg = CommandLine.arguments[i]
    switch arg {
    case "--display":
        i += 1
        // Just use main display for now
    case "--region":
        i += 1
        let parts = CommandLine.arguments[i].split(separator: ",").compactMap { Int($0) }
        if parts.count == 4 {
            region = CGRect(x: parts[0], y: parts[1], width: parts[2], height: parts[3])
        }
    default:
        if !arg.hasPrefix("--") {
            outputPath = arg
        }
    }
    i += 1
}

// 1. Capture screenshot
guard let screenshot = captureScreen(region: region, displayID: displayID) else {
    print("error: failed to capture screenshot")
    exit(1)
}

// 2. Detect elements — combine Vision + AX
var textElements = detectText(in: screenshot)
let rectElements = detectRectangles(in: screenshot)
let axElements = getAXElements()

// 3. Merge all sources, preferring AX elements (they have better labels)
var allElements: [SoMElement] = []

// If AX has good coverage, prefer it
if axElements.count > 5 {
    allElements = axElements
    // Add text elements that don't overlap with AX
    for text in textElements {
        let overlaps = allElements.contains { iou($0, text) > 0.3 }
        if !overlaps {
            allElements.append(text)
        }
    }
} else {
    // AX is sparse (non-native app) — rely on Vision
    allElements = mergeElements(textElements, rectElements)
    // Still add any AX elements that don't overlap
    for ax in axElements {
        let overlaps = allElements.contains { iou($0, ax) > 0.3 }
        if !overlaps {
            allElements.append(ax)
        }
    }
}

// 4. Assign IDs
var numbered = allElements.enumerated().map { (i, var elem) -> SoMElement in
    SoMElement(id: i + 1, label: elem.label, x: elem.x, y: elem.y,
               w: elem.w, h: elem.h, kind: elem.kind)
}

// 5. Annotate image
guard let annotated = annotateImage(screenshot, elements: numbered) else {
    print("error: failed to annotate image")
    exit(1)
}

// 6. Save
guard saveImage(annotated, to: outputPath) else {
    print("error: failed to save image to \(outputPath)")
    exit(1)
}

// 7. Output element list
let fileSize = (try? FileManager.default.attributesOfItem(atPath: outputPath)[.size] as? Int) ?? 0

print("som:")
print("  path: \(outputPath)")
print("  size: \(fileSize / 1024)KB")
print("  elements: \(numbered.count)")

if numbered.isEmpty {
    print("marks: 0 elements detected")
} else {
    let fields = "id,kind,label,x,y,w,h"
    print("marks[\(numbered.count)]{\(fields)}:")
    for elem in numbered {
        let label = elem.label.isEmpty ? "" : "\"\(elem.label.replacingOccurrences(of: "\"", with: "\\\""))\""
        print("  \(elem.id),\(elem.kind),\(label),\(elem.x),\(elem.y),\(elem.w),\(elem.h)")
    }
}
