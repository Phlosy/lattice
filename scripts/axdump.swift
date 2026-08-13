#!/usr/bin/env swift
// Dump the Accessibility UI tree of a target app (default: ChatGPT).
// Usage: swift axdump.swift [appName] [maxDepth]
// Outputs: role | title | value | description | pos | size  (tab-indented tree)

import ApplicationServices
import AppKit
import Foundation

let appName = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "ChatGPT"
let maxDepth = CommandLine.arguments.count > 2 ? Int(CommandLine.arguments[2])! : 8
let maxChildrenPerNode = 200

func attr(_ el: AXUIElement, _ key: String) -> CFTypeRef? {
    var v: CFTypeRef?
    let e = AXUIElementCopyAttributeValue(el, key as CFString, &v)
    return e == .success ? v : nil
}

func str(_ el: AXUIElement, _ key: String) -> String {
    if let v = attr(el, key) as? String { return v }
    return ""
}

func pointStr(_ el: AXUIElement, _ key: String) -> String {
    if let v = attr(el, key), CFGetTypeID(v) == AXValueGetTypeID() {
        var p = CGPoint.zero
        if AXValueGetValue(v as! AXValue, .cgPoint, &p) { return "@(\(Int(p.x)),\(Int(p.y)))" }
    }
    return ""
}

func sizeStr(_ el: AXUIElement, _ key: String) -> String {
    if let v = attr(el, key), CFGetTypeID(v) == AXValueGetTypeID() {
        var s = CGSize.zero
        if AXValueGetValue(v as! AXValue, .cgSize, &s) { return "\(Int(s.width))x\(Int(s.height))" }
    }
    return ""
}

func clean(_ s: String) -> String {
    let t = s.replacingOccurrences(of: "\n", with: "\\n").replacingOccurrences(of: "\t", with: " ")
    return t.count > 120 ? String(t.prefix(120)) + "…" : t
}

func dump(_ el: AXUIElement, _ depth: Int) {
    let role = str(el, kAXRoleAttribute)
    let title = clean(str(el, kAXTitleAttribute))
    let value = clean(str(el, kAXValueAttribute))
    let desc = clean(str(el, kAXDescriptionAttribute))
    let pos = pointStr(el, kAXPositionAttribute)
    let size = sizeStr(el, kAXSizeAttribute)
    var parts = [role]
    if !title.isEmpty { parts.append("title=\(title)") }
    if !value.isEmpty { parts.append("value=\(value)") }
    if !desc.isEmpty && desc != title { parts.append("desc=\(desc)") }
    if !pos.isEmpty { parts.append(pos) }
    if !size.isEmpty { parts.append(size) }
    print(String(repeating: "  ", count: depth) + parts.joined(separator: " | "))
    if depth >= maxDepth { return }
    if let children = attr(el, kAXChildrenAttribute) as? [AXUIElement] {
        let limit = min(children.count, maxChildrenPerNode)
        for i in 0..<limit { dump(children[i], depth + 1) }
        if children.count > limit { print(String(repeating: "  ", count: depth+1) + "… (\(children.count - limit) more)") }
    }
}

let apps = NSWorkspace.shared.runningApplications
guard let target = apps.first(where: { $0.localizedName == appName }) else {
    print("\(appName) not running"); exit(1)
}
let pid = target.processIdentifier
let app = AXUIElementCreateApplication(pid)
if let windows = attr(app, kAXWindowsAttribute) as? [AXUIElement] {
    print("# \(appName) pid=\(pid) windows=\(windows.count)")
    for (i, w) in windows.enumerated() {
        print("## window \(i)")
        dump(w, 0)
    }
} else {
    print("AXWindows failed (no accessibility permission)")
    exit(2)
}
