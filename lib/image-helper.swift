import AppKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

struct ImageSize: Encodable {
    let width: Int
    let height: Int
}

struct ProbeResult: Encodable {
    let width: Int
    let height: Int
    let x: Int
    let y: Int
    let output: String
}

func die(_ message: String) -> Never {
    fputs("error: \(message)\n", stderr)
    exit(1)
}

func loadImage(at path: String) -> CGImage {
    guard let image = NSImage(contentsOfFile: path),
          let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        die("cannot load image")
    }
    return cgImage
}

func savePNG(_ image: CGImage, to path: String) {
    let url = URL(fileURLWithPath: path)
    guard let dest = CGImageDestinationCreateWithURL(
        url as CFURL,
        UTType.png.identifier as CFString,
        1,
        nil
    ) else {
        die("cannot create output image")
    }
    CGImageDestinationAddImage(dest, image, nil)
    guard CGImageDestinationFinalize(dest) else {
        die("cannot save output image")
    }
}

func makeProbeImage(_ image: CGImage, x: Int, y: Int) -> CGImage {
    let width = image.width
    let height = image.height

    guard let ctx = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
    ) else {
        die("cannot create drawing context")
    }

    // Use a top-left origin so image coordinates match screenshot coordinates.
    ctx.translateBy(x: 0, y: CGFloat(height))
    ctx.scaleBy(x: 1, y: -1)
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

    let px = CGFloat(x) + 0.5
    let py = CGFloat(y) + 0.5
    let major = CGFloat(max(width, height))
    let outerLine = max(3.0, major * 0.002)
    let innerLine = max(1.0, major * 0.001)
    let radius = max(8.0, major * 0.01)

    ctx.setStrokeColor(NSColor.white.withAlphaComponent(0.95).cgColor)
    ctx.setLineWidth(outerLine)
    ctx.move(to: CGPoint(x: 0, y: py))
    ctx.addLine(to: CGPoint(x: CGFloat(width), y: py))
    ctx.move(to: CGPoint(x: px, y: 0))
    ctx.addLine(to: CGPoint(x: px, y: CGFloat(height)))
    ctx.strokePath()

    ctx.setStrokeColor(NSColor.systemRed.cgColor)
    ctx.setLineWidth(innerLine)
    ctx.move(to: CGPoint(x: 0, y: py))
    ctx.addLine(to: CGPoint(x: CGFloat(width), y: py))
    ctx.move(to: CGPoint(x: px, y: 0))
    ctx.addLine(to: CGPoint(x: px, y: CGFloat(height)))
    ctx.strokePath()

    let ring = CGRect(
        x: CGFloat(x) - radius,
        y: CGFloat(y) - radius,
        width: radius * 2,
        height: radius * 2
    )
    ctx.setStrokeColor(NSColor.white.withAlphaComponent(0.95).cgColor)
    ctx.setLineWidth(outerLine)
    ctx.strokeEllipse(in: ring)
    ctx.setStrokeColor(NSColor.systemRed.cgColor)
    ctx.setLineWidth(innerLine)
    ctx.strokeEllipse(in: ring)

    let dot = CGRect(x: CGFloat(x) - 2, y: CGFloat(y) - 2, width: 4, height: 4)
    ctx.setFillColor(NSColor.systemRed.cgColor)
    ctx.fillEllipse(in: dot)

    guard let annotated = ctx.makeImage() else {
        die("cannot finalize output image")
    }
    return annotated
}

let args = CommandLine.arguments
guard args.count >= 2 else {
    fputs("usage: image-helper size <image-path> | probe <image-path> <output-path> <x> <y>\n", stderr)
    exit(2)
}

let encoder = JSONEncoder()

switch args[1] {
case "size":
    guard args.count >= 3 else {
        fputs("usage: image-helper size <image-path>\n", stderr)
        exit(2)
    }
    let image = loadImage(at: args[2])
    let payload = ImageSize(width: image.width, height: image.height)
    let json = try encoder.encode(payload)
    print(String(data: json, encoding: .utf8)!)

case "probe":
    guard args.count >= 6 else {
        fputs("usage: image-helper probe <image-path> <output-path> <x> <y>\n", stderr)
        exit(2)
    }
    let imagePath = args[2]
    let outputPath = args[3]
    guard let x = Int(args[4]), let y = Int(args[5]) else {
        die("x and y must be integers")
    }

    let image = loadImage(at: imagePath)
    guard x >= 0, y >= 0, x < image.width, y < image.height else {
        die("point is outside image bounds")
    }

    let annotated = makeProbeImage(image, x: x, y: y)
    savePNG(annotated, to: outputPath)

    let payload = ProbeResult(width: image.width, height: image.height, x: x, y: y, output: outputPath)
    let json = try encoder.encode(payload)
    print(String(data: json, encoding: .utf8)!)

default:
    fputs("usage: image-helper size <image-path> | probe <image-path> <output-path> <x> <y>\n", stderr)
    exit(2)
}
