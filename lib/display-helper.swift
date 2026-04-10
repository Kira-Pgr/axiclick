import Cocoa
import CoreGraphics

struct DisplayInfo: Encodable {
    let name: String
    let x: Int
    let y: Int
    let width: Int
    let height: Int
    let scale: Double
    let retina: Bool
    let main: Bool
}

func orderedDisplayIDs() -> [CGDirectDisplayID] {
    var ids = [CGDirectDisplayID](repeating: 0, count: 16)
    var count: UInt32 = 0
    let err = CGGetActiveDisplayList(UInt32(ids.count), &ids, &count)
    guard err == .success else { return [CGMainDisplayID()] }

    var ordered = Array(ids.prefix(Int(count)))
    let mainID = CGMainDisplayID()
    if let mainIndex = ordered.firstIndex(of: mainID), mainIndex != 0 {
        ordered.remove(at: mainIndex)
        ordered.insert(mainID, at: 0)
    }
    return ordered
}

let screenPairs: [(CGDirectDisplayID, NSScreen)] = NSScreen.screens.compactMap { screen in
    guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else {
        return nil
    }
    return (CGDirectDisplayID(number.uint32Value), screen)
}

let screensByID = Dictionary(uniqueKeysWithValues: screenPairs)

let displays = orderedDisplayIDs().map { id -> DisplayInfo in
    let bounds = CGDisplayBounds(id)
    let screen = screensByID[id]
    let scale = screen?.backingScaleFactor ?? 1.0
    return DisplayInfo(
        name: screen?.localizedName ?? "Display",
        x: Int(bounds.origin.x),
        y: Int(bounds.origin.y),
        width: Int(bounds.width),
        height: Int(bounds.height),
        scale: scale,
        retina: scale > 1.0,
        main: CGDisplayIsMain(id) != 0
    )
}

let encoder = JSONEncoder()
let json = try encoder.encode(displays)
print(String(data: json, encoding: .utf8)!)
