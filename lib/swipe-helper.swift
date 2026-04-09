import Cocoa

// swipe-helper: Two swipe modes
// Usage:
//   swipe-helper touch <x> <y> <dx> <dy> [duration_ms]   — click-hold-drag (iPhone style)
//   swipe-helper gesture <direction>                       — trackpad gesture (macOS workspace)

guard CommandLine.arguments.count >= 3 else {
    fputs("usage:\n  swipe-helper touch <x> <y> <dx> <dy> [duration_ms]\n  swipe-helper gesture left|right|up|down\n", stderr)
    exit(1)
}

let mode = CommandLine.arguments[1]

switch mode {
case "touch":
    // Click-hold-drag: simulates a finger touch swipe (for iPhone Mirroring)
    guard CommandLine.arguments.count >= 6,
          let x = Double(CommandLine.arguments[2]),
          let y = Double(CommandLine.arguments[3]),
          let dx = Double(CommandLine.arguments[4]),
          let dy = Double(CommandLine.arguments[5]) else {
        fputs("error: touch requires x y dx dy\n", stderr)
        exit(1)
    }
    let durationMs = CommandLine.arguments.count > 6 ? Int(CommandLine.arguments[6]) ?? 300 : 300
    let steps = 20
    let stepDelay = UInt32(durationMs * 1000 / steps) // microseconds per step

    let start = CGPoint(x: x, y: y)
    let end = CGPoint(x: x + dx, y: y + dy)

    // Mouse down at start
    let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: start, mouseButton: .left)
    down?.post(tap: .cghidEventTap)

    // Brief hold before moving — short enough to avoid long-press (app edit mode)
    // but long enough for touch registration
    usleep(50_000) // 50ms hold

    // Smooth drag
    for i in 1...steps {
        let t = Double(i) / Double(steps)
        let px = start.x + (end.x - start.x) * t
        let py = start.y + (end.y - start.y) * t
        let drag = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDragged, mouseCursorPosition: CGPoint(x: px, y: py), mouseButton: .left)
        drag?.post(tap: .cghidEventTap)
        usleep(stepDelay)
    }

    // Mouse up at end
    let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: end, mouseButton: .left)
    up?.post(tap: .cghidEventTap)

case "gesture":
    // Trackpad swipe gesture for macOS workspace switching
    guard CommandLine.arguments.count >= 3 else {
        fputs("error: gesture requires direction\n", stderr)
        exit(1)
    }
    let direction = CommandLine.arguments[2]

    // Use NSEvent to post a swipe gesture
    // Unfortunately CGEvent doesn't directly support trackpad gestures,
    // so we use the private CGS API via keyboard shortcuts instead:
    // Ctrl+Arrow keys switch workspaces (built-in macOS shortcut)
    let keyCode: CGKeyCode
    switch direction {
    case "left":
        keyCode = 123 // left arrow
    case "right":
        keyCode = 124 // right arrow
    case "up":
        keyCode = 126 // up arrow (Mission Control)
    case "down":
        keyCode = 125 // down arrow
    default:
        fputs("error: direction must be left, right, up, or down\n", stderr)
        exit(1)
    }

    // Ctrl+Arrow to switch workspace
    let downEvent = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: true)
    downEvent?.flags = .maskControl
    downEvent?.post(tap: .cghidEventTap)

    usleep(50_000)

    let upEvent = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: false)
    upEvent?.flags = .maskControl
    upEvent?.post(tap: .cghidEventTap)

default:
    fputs("error: unknown mode '\(mode)', use 'touch' or 'gesture'\n", stderr)
    exit(1)
}
