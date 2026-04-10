import Cocoa
import Foundation
import Darwin

// swipe-helper: Two swipe modes
// Usage:
//   swipe-helper touch <x> <y> <dx> <dy> [duration_ms]   — click-hold-drag (iPhone style)
//   swipe-helper gesture <direction>                      — Mission Control workspace switch

enum SwipeHelperError: Error, LocalizedError {
    case message(String)

    var errorDescription: String? {
        switch self {
        case .message(let text):
            return text
        }
    }
}

struct ManagedDisplaySpace {
    let identifier: String
    let currentSpaceID: UInt64
    let spaces: [UInt64]
}

typealias SLSMainConnectionIDFn = @convention(c) () -> Int32
typealias SLSCopyManagedDisplaySpacesFn = @convention(c) (Int32) -> Unmanaged<CFArray>?
typealias SLSGetActiveSpaceFn = @convention(c) (Int32) -> UInt64

struct SkyLightAPI {
    let handle: UnsafeMutableRawPointer
    let mainConnectionID: SLSMainConnectionIDFn
    let copyManagedDisplaySpaces: SLSCopyManagedDisplaySpacesFn
    let getActiveSpace: SLSGetActiveSpaceFn
}

func loadSkyLight() throws -> SkyLightAPI {
    let path = "/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight"
    guard let handle = dlopen(path, RTLD_LAZY | RTLD_LOCAL) else {
        let message = dlerror().map { String(cString: $0) } ?? "unknown"
        throw SwipeHelperError.message("error: unable to load SkyLight (\(message))")
    }

    func symbol<T>(_ name: String, as _: T.Type) throws -> T {
        guard let raw = dlsym(handle, name) else {
            throw SwipeHelperError.message("error: missing SkyLight symbol \(name)")
        }
        return unsafeBitCast(raw, to: T.self)
    }

    return SkyLightAPI(
        handle: handle,
        mainConnectionID: try symbol("SLSMainConnectionID", as: SLSMainConnectionIDFn.self),
        copyManagedDisplaySpaces: try symbol("SLSCopyManagedDisplaySpaces", as: SLSCopyManagedDisplaySpacesFn.self),
        getActiveSpace: try symbol("SLSGetActiveSpace", as: SLSGetActiveSpaceFn.self)
    )
}

func parseInt(_ value: Any?) -> Int? {
    if let intValue = value as? Int { return intValue }
    if let numberValue = value as? NSNumber { return numberValue.intValue }
    return nil
}

func parseUInt64(_ value: Any?) -> UInt64? {
    if let uintValue = value as? UInt64 { return uintValue }
    if let intValue = value as? Int { return intValue >= 0 ? UInt64(intValue) : nil }
    if let numberValue = value as? NSNumber { return numberValue.uint64Value }
    return nil
}

func loadManagedDisplaySpaces(_ skylight: SkyLightAPI) throws -> [ManagedDisplaySpace] {
    let connection = skylight.mainConnectionID()
    guard let rawDisplays = skylight.copyManagedDisplaySpaces(connection)?.takeRetainedValue() as? [[String: Any]] else {
        throw SwipeHelperError.message("error: unable to read managed display spaces")
    }

    return rawDisplays.compactMap { display in
        guard let identifier = display["Display Identifier"] as? String else { return nil }
        let currentSpace = display["Current Space"] as? [String: Any]
        let currentSpaceID = parseUInt64(currentSpace?["ManagedSpaceID"] ?? currentSpace?["id64"]) ?? 0
        let spaces = (display["Spaces"] as? [[String: Any]] ?? []).compactMap {
            parseUInt64($0["ManagedSpaceID"] ?? $0["id64"])
        }
        return ManagedDisplaySpace(identifier: identifier, currentSpaceID: currentSpaceID, spaces: spaces)
    }
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

func displayID(forManagedIdentifier identifier: String) -> CGDirectDisplayID? {
    for displayID in orderedDisplayIDs() {
        guard let uuid = CGDisplayCreateUUIDFromDisplayID(displayID)?.takeRetainedValue() else { continue }
        let uuidString = CFUUIDCreateString(nil, uuid) as String? ?? ""
        if uuidString == identifier { return displayID }
    }
    return nil
}

func axAttr(_ element: AXUIElement, _ name: String) -> AnyObject? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, name as CFString, &value)
    guard result == .success else { return nil }
    return value
}

func missionControlGroup() -> AXUIElement? {
    guard let dock = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.dock").first else {
        return nil
    }
    let appElement = AXUIElementCreateApplication(dock.processIdentifier)
    let children = axAttr(appElement, kAXChildrenAttribute) as? [AXUIElement] ?? []
    return children.first { (axAttr($0, "AXIdentifier") as? String) == "mc" }
}

func pressKey(_ keyCode: CGKeyCode) {
    let source = CGEventSource(stateID: .hidSystemState)
    let down = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true)
    let up = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false)
    down?.post(tap: .cghidEventTap)
    up?.post(tap: .cghidEventTap)
}

func openMissionControl() throws {
    let appURL = URL(fileURLWithPath: "/System/Applications/Mission Control.app")
    guard FileManager.default.fileExists(atPath: appURL.path) else {
        throw SwipeHelperError.message("error: Mission Control.app is unavailable")
    }

    let workspace = NSWorkspace.shared
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.activates = true
    let semaphore = DispatchSemaphore(value: 0)
    var openError: Error?
    workspace.openApplication(at: appURL, configuration: configuration) { _, error in
        openError = error
        semaphore.signal()
    }
    _ = semaphore.wait(timeout: .now() + 2)
    if let openError {
        throw SwipeHelperError.message("error: unable to open Mission Control (\(openError.localizedDescription))")
    }
}

func ensureMissionControlOpen() throws -> Bool {
    if missionControlGroup() != nil { return false }
    try openMissionControl()
    return true
}

func waitForMissionControlGroup(timeout: TimeInterval = 2.0) -> AXUIElement? {
    let start = Date()
    while Date().timeIntervalSince(start) < timeout {
        if let group = missionControlGroup() { return group }
        usleep(50_000)
    }
    return nil
}

func findSpacesList(forDisplayID displayID: CGDirectDisplayID) throws -> AXUIElement {
    guard let mcGroup = waitForMissionControlGroup() else {
        throw SwipeHelperError.message("error: unable to get Mission Control data from the Dock")
    }

    let mcDisplays = (axAttr(mcGroup, kAXChildrenAttribute) as? [AXUIElement] ?? []).filter {
        (axAttr($0, "AXIdentifier") as? String) == "mc.display"
    }
    guard let targetDisplay = mcDisplays.first(where: {
        parseInt(axAttr($0, "AXDisplayID")) == Int(displayID)
    }) else {
        throw SwipeHelperError.message("error: no Mission Control display found for the active screen")
    }

    let displayChildren = axAttr(targetDisplay, kAXChildrenAttribute) as? [AXUIElement] ?? []
    guard let spacesGroup = displayChildren.first(where: {
        (axAttr($0, "AXIdentifier") as? String) == "mc.spaces"
    }) else {
        throw SwipeHelperError.message("error: unable to locate Mission Control spaces group")
    }

    let spacesChildren = axAttr(spacesGroup, kAXChildrenAttribute) as? [AXUIElement] ?? []
    guard let spacesList = spacesChildren.first(where: {
        (axAttr($0, "AXIdentifier") as? String) == "mc.spaces.list"
    }) else {
        throw SwipeHelperError.message("error: unable to locate Mission Control spaces list")
    }

    return spacesList
}

func switchWorkspace(direction: String) throws {
    guard direction == "left" || direction == "right" else {
        throw SwipeHelperError.message("error: workspace gesture requires left or right")
    }

    let skylight = try loadSkyLight()
    let connection = skylight.mainConnectionID()
    let activeSpaceID = skylight.getActiveSpace(connection)
    let managedDisplays = try loadManagedDisplaySpaces(skylight)
    guard let activeDisplay = managedDisplays.first(where: { $0.currentSpaceID == activeSpaceID || $0.spaces.contains(activeSpaceID) }) else {
        throw SwipeHelperError.message("error: unable to determine the active display space")
    }
    guard let currentIndex = activeDisplay.spaces.firstIndex(of: activeSpaceID) else {
        throw SwipeHelperError.message("error: active space not found in display order")
    }

    let targetIndex: Int
    if direction == "right" {
        targetIndex = currentIndex + 1
    } else {
        targetIndex = currentIndex - 1
    }
    guard targetIndex >= 0 && targetIndex < activeDisplay.spaces.count else {
        throw SwipeHelperError.message("error: no workspace exists in that direction")
    }
    guard let displayID = displayID(forManagedIdentifier: activeDisplay.identifier) else {
        throw SwipeHelperError.message("error: unable to resolve the active display")
    }

    let openedMissionControl = try ensureMissionControlOpen()
    do {
        usleep(350_000)
        let spacesList = try findSpacesList(forDisplayID: displayID)
        let spaces = axAttr(spacesList, kAXChildrenAttribute) as? [AXUIElement] ?? []
        guard targetIndex < spaces.count else {
            throw SwipeHelperError.message("error: target workspace thumbnail is unavailable")
        }
        let target = spaces[targetIndex]
        let result = AXUIElementPerformAction(target, kAXPressAction as CFString)
        if result != .success {
            throw SwipeHelperError.message("error: failed to activate the target workspace")
        }
    } catch {
        if openedMissionControl, missionControlGroup() != nil {
            pressKey(53) // Escape closes Mission Control reliably.
        }
        throw error
    }
}

guard CommandLine.arguments.count >= 3 else {
    fputs("usage:\n  swipe-helper touch <x> <y> <dx> <dy> [duration_ms]\n  swipe-helper gesture left|right\n", stderr)
    exit(1)
}

let mode = CommandLine.arguments[1]

do {
    switch mode {
    case "touch":
        // Click-hold-drag: simulates a finger touch swipe (for iPhone Mirroring)
        guard CommandLine.arguments.count >= 6,
              let x = Double(CommandLine.arguments[2]),
              let y = Double(CommandLine.arguments[3]),
              let dx = Double(CommandLine.arguments[4]),
              let dy = Double(CommandLine.arguments[5]) else {
            throw SwipeHelperError.message("error: touch requires x y dx dy")
        }

        let durationMs: Int
        if CommandLine.arguments.count > 6 {
            guard let parsedDuration = Int(CommandLine.arguments[6]), parsedDuration >= 0 else {
                throw SwipeHelperError.message("error: duration_ms must be a non-negative integer")
            }
            durationMs = parsedDuration
        } else {
            durationMs = 300
        }

        let steps = 20
        let stepDelay = useconds_t(durationMs * 1000 / steps) // microseconds per step

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
        let direction = CommandLine.arguments[2]
        try switchWorkspace(direction: direction)

    default:
        throw SwipeHelperError.message("error: unknown mode '\(mode)', use 'touch' or 'gesture'")
    }
} catch {
    let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    fputs("\(message)\n", stderr)
    exit(1)
}
