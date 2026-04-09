import Cocoa

guard CommandLine.arguments.count == 3,
      let dy = Int32(CommandLine.arguments[1]),
      let dx = Int32(CommandLine.arguments[2]) else {
    fputs("usage: scroll-helper <dy> <dx>\n", stderr)
    exit(1)
}

if let e = CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 2, wheel1: dy, wheel2: dx, wheel3: 0) {
    e.post(tap: CGEventTapLocation.cghidEventTap)
}
