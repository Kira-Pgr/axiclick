import Cocoa
import ApplicationServices

// ax-helper: Walk the accessibility tree of the frontmost app
// Usage: ax-helper [snapshot|click <uid>|fill <uid> <text>|value <uid>]

struct AXNode {
    let uid: Int
    let role: String
    let title: String
    let value: String
    let position: CGPoint?
    let size: CGSize?
    let depth: Int
    let actions: [String]
    let enabled: Bool
    let focused: Bool
}

var uidCounter = 0
var nodeMap: [Int: AXUIElement] = [:]

func getAttribute(_ element: AXUIElement, _ attr: String) -> AnyObject? {
    var value: AnyObject?
    AXUIElementCopyAttributeValue(element, attr as CFString, &value)
    return value
}

func getStringAttr(_ element: AXUIElement, _ attr: String) -> String {
    guard let val = getAttribute(element, attr) else { return "" }
    return "\(val)"
}

func getPointAttr(_ element: AXUIElement) -> CGPoint? {
    guard let val = getAttribute(element, kAXPositionAttribute) else { return nil }
    var point = CGPoint.zero
    AXValueGetValue(val as! AXValue, .cgPoint, &point)
    return point
}

func getSizeAttr(_ element: AXUIElement) -> CGSize? {
    guard let val = getAttribute(element, kAXSizeAttribute) else { return nil }
    var size = CGSize.zero
    AXValueGetValue(val as! AXValue, .cgSize, &size)
    return size
}

func getActions(_ element: AXUIElement) -> [String] {
    var names: CFArray?
    AXUIElementCopyActionNames(element, &names)
    guard let actions = names as? [String] else { return [] }
    return actions
}

func walkTree(_ element: AXUIElement, depth: Int, maxDepth: Int, nodes: inout [AXNode]) {
    if depth > maxDepth { return }
    if nodes.count > 500 { return } // safety limit

    let role = getStringAttr(element, kAXRoleAttribute)
    let title = getStringAttr(element, kAXTitleAttribute)
    let roleDesc = getStringAttr(element, kAXRoleDescriptionAttribute)
    let value = getStringAttr(element, kAXValueAttribute)
    let position = getPointAttr(element)
    let size = getSizeAttr(element)
    let actions = getActions(element)
    let desc = getStringAttr(element, kAXDescriptionAttribute)
    let enabled = getAttribute(element, kAXEnabledAttribute) as? Bool ?? true
    let focused = getAttribute(element, kAXFocusedAttribute) as? Bool ?? false

    // Determine if this node is worth showing
    let isInteractive = !actions.isEmpty ||
        ["AXButton", "AXTextField", "AXTextArea", "AXCheckBox", "AXRadioButton",
         "AXPopUpButton", "AXComboBox", "AXSlider", "AXLink", "AXMenuItem",
         "AXMenuButton", "AXTab", "AXTabGroup", "AXTable", "AXRow",
         "AXSearchField", "AXToolbar", "AXList", "AXScrollArea",
         "AXImage", "AXStaticText", "AXCell"].contains(role)
    let hasText = !title.isEmpty || !desc.isEmpty || !value.isEmpty
    let isContainer = ["AXWindow", "AXGroup", "AXSplitGroup", "AXScrollArea",
                       "AXTabGroup", "AXToolbar", "AXList", "AXTable",
                       "AXOutline", "AXSheet", "AXDrawer"].contains(role)

    // Skip invisible/zero-size elements
    if let s = size, s.width == 0 && s.height == 0 {
        // still walk children
    } else if isInteractive || hasText || isContainer || depth <= 2 {
        uidCounter += 1
        let uid = uidCounter
        nodeMap[uid] = element

        let displayTitle = !title.isEmpty ? title : (!desc.isEmpty ? desc : "")
        let displayRole = role.hasPrefix("AX") ? String(role.dropFirst(2)) : role

        nodes.append(AXNode(
            uid: uid,
            role: displayRole,
            title: displayTitle,
            value: value.count > 100 ? String(value.prefix(97)) + "..." : value,
            position: position,
            size: size,
            depth: depth,
            actions: actions,
            enabled: enabled,
            focused: focused
        ))
    }

    // Walk children
    guard let children = getAttribute(element, kAXChildrenAttribute) as? [AXUIElement] else { return }
    for child in children {
        walkTree(child, depth: depth + 1, maxDepth: maxDepth, nodes: &nodes)
    }
}

func performClick(_ element: AXUIElement) -> Bool {
    let actions = getActions(element)
    if actions.contains(kAXPressAction as String) {
        AXUIElementPerformAction(element, kAXPressAction as CFString)
        return true
    }
    // Fallback: click at center of element
    if let pos = getPointAttr(element), let size = getSizeAttr(element) {
        let center = CGPoint(x: pos.x + size.width / 2, y: pos.y + size.height / 2)
        let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: center, mouseButton: .left)
        let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: center, mouseButton: .left)
        down?.post(tap: .cghidEventTap)
        usleep(15000)
        up?.post(tap: .cghidEventTap)
        return true
    }
    return false
}

func setValue(_ element: AXUIElement, _ text: String) -> Bool {
    let result = AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, text as CFTypeRef)
    if result == .success { return true }
    // Fallback: focus and type
    AXUIElementSetAttributeValue(element, kAXFocusedAttribute as CFString, true as CFTypeRef)
    return result == .success
}

// ── Main ──

guard CommandLine.arguments.count >= 2 else {
    fputs("usage: ax-helper snapshot|click <uid>|fill <uid> <text>|value <uid>\n", stderr)
    exit(1)
}

let cmd = CommandLine.arguments[1]

// Get frontmost app
guard let frontApp = NSWorkspace.shared.frontmostApplication else {
    print("error: no frontmost application")
    exit(1)
}

let appElement = AXUIElementCreateApplication(frontApp.processIdentifier)
let appName = frontApp.localizedName ?? "unknown"

switch cmd {
case "snapshot":
    let maxDepth = CommandLine.arguments.count > 2 ? (Int(CommandLine.arguments[2]) ?? 10) : 10
    var nodes: [AXNode] = []
    walkTree(appElement, depth: 0, maxDepth: maxDepth, nodes: &nodes)

    // Output in TOON-ish format
    print("snapshot:")
    print("  app: \(appName)")

    if nodes.isEmpty {
        print("elements: 0 elements found (accessibility may not be enabled for this app)")
    } else {
        // Print as indented tree
        for node in nodes {
            let indent = String(repeating: "  ", count: min(node.depth, 6))
            var line = "\(indent)@\(node.uid) \(node.role)"
            if !node.title.isEmpty { line += " \"\(node.title)\"" }
            if !node.value.isEmpty { line += " value=\"\(node.value)\"" }
            if node.focused { line += " [focused]" }
            if !node.enabled { line += " [disabled]" }
            // Show position for interactive elements
            if !node.actions.isEmpty, let p = node.position, let s = node.size {
                line += " (\(Int(p.x)),\(Int(p.y)) \(Int(s.width))x\(Int(s.height)))"
            }
            print(line)
        }
    }

case "click":
    guard CommandLine.arguments.count >= 3, let uid = Int(CommandLine.arguments[2]) else {
        print("error: expected uid")
        exit(1)
    }
    // Need to build the tree first to populate nodeMap
    var nodes: [AXNode] = []
    walkTree(appElement, depth: 0, maxDepth: 10, nodes: &nodes)
    guard let element = nodeMap[uid] else {
        print("error: uid @\(uid) not found")
        exit(1)
    }
    if performClick(element) {
        print("result:")
        print("  action: click")
        print("  uid: @\(uid)")
        let role = nodes.first(where: { $0.uid == uid })?.role ?? ""
        let title = nodes.first(where: { $0.uid == uid })?.title ?? ""
        if !role.isEmpty { print("  role: \(role)") }
        if !title.isEmpty { print("  title: \(title)") }
    } else {
        print("error: could not click @\(uid)")
        exit(1)
    }

case "fill":
    guard CommandLine.arguments.count >= 4, let uid = Int(CommandLine.arguments[2]) else {
        print("error: expected uid and text")
        exit(1)
    }
    let text = CommandLine.arguments[3...].joined(separator: " ")
    var nodes: [AXNode] = []
    walkTree(appElement, depth: 0, maxDepth: 10, nodes: &nodes)
    guard let element = nodeMap[uid] else {
        print("error: uid @\(uid) not found")
        exit(1)
    }
    if setValue(element, text) {
        print("result:")
        print("  action: fill")
        print("  uid: @\(uid)")
        print("  text: \"\(text)\"")
    } else {
        print("error: could not set value on @\(uid)")
        exit(1)
    }

case "value":
    guard CommandLine.arguments.count >= 3, let uid = Int(CommandLine.arguments[2]) else {
        print("error: expected uid")
        exit(1)
    }
    var nodes: [AXNode] = []
    walkTree(appElement, depth: 0, maxDepth: 10, nodes: &nodes)
    guard let element = nodeMap[uid] else {
        print("error: uid @\(uid) not found")
        exit(1)
    }
    let value = getStringAttr(element, kAXValueAttribute)
    print("value:")
    print("  uid: @\(uid)")
    print("  text: \"\(value)\"")

default:
    fputs("error: unknown command '\(cmd)'\n", stderr)
    exit(1)
}
