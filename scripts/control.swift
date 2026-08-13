#!/usr/bin/env swift
// Desktop control via CGEvent. Requires Accessibility permission.
// Usage:
//   swift control.swift click <x> <y>            — click at screen coords
//   swift control.swift clickn <xn> <yn>         — click at normalized coords (relative to target window)
//   swift control.swift type <text>              — type text
//   swift control.swift key <key>                — press a key (e.g. "return", "tab", "esc", "cmd+,")
//   swift control.swift scroll <dy>              — scroll (dy pixels, + = up)
//   swift control.swift frontmost                — print frontmost app

import ApplicationServices
import AppKit
import Foundation

let args = CommandLine.arguments
let cmd = args.count > 1 ? args[1] : "help"

func postMouse(_ type: CGEventType, _ point: CGPoint) {
    let e = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: .left)!
    e.post(tap: .cghidEventTap)
}

func postKey(_ keyCode: CGKeyCode, _ flags: CGEventFlags = []) {
    let down = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: true)!
    down.flags = flags
    down.post(tap: .cghidEventTap)
    let up = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: false)!
    up.flags = flags
    up.post(tap: .cghidEventTap)
}

func keyCodeFor(_ s: String) -> CGKeyCode {
    // Map a few common keys via a simple layout-independent table.
    let map: [String: CGKeyCode] = [
        "return": 36, "enter": 76, "tab": 48, "space": 49, "esc": 53,
        "delete": 51, "left": 123, "right": 124, "down": 125, "up": 126,
        "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7,
        "c": 8, "v": 9, "b": 11, "q": 12, "w": 13, "e": 14, "r": 15,
        "y": 16, "t": 17, "1": 18, "2": 19, "3": 20, "4": 21, "6": 22,
        "5": 23, "=": 24, "9": 25, "7": 26, "-": 27, "8": 28, "0": 29,
        "]": 30, "o": 31, "u": 32, "[": 33, "i": 34, "p": 35, "l": 37,
        "j": 38, "'": 39, "k": 40, ";": 41, "\\": 42, ",": 43, "/": 44,
        "n": 45, "m": 46, ".": 47,
    ]
    return map[s.lowercased()] ?? 0
}

func targetWindowBounds() -> (CGRect, Int)? {
    let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
    for w in list {
        let owner = w[kCGWindowOwnerName as String] as? String ?? ""
        if owner == "ChatGPT" {
            if let b = w[kCGWindowBounds as String] as? [String: Any],
               let x = b["X"] as? Double, let y = b["Y"] as? Double,
               let wd = b["Width"] as? Double, let ht = b["Height"] as? Double,
               let num = w[kCGWindowNumber as String] as? Int {
                return (CGRect(x: x, y: y, width: wd, height: ht), num)
            }
        }
    }
    return nil
}

switch cmd {
case "click":
    let x = Double(args[2])!, y = Double(args[3])!
    let p = CGPoint(x: x, y: y)
    // move then click
    CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left)!.post(tap: .cghidEventTap)
    usleep(80000)
    postMouse(.leftMouseDown, p)
    usleep(60000)
    postMouse(.leftMouseUp, p)
    print("clicked \(Int(x)),\(Int(y))")

case "clickn":
    let xn = Double(args[2])!, yn = Double(args[3])!
    guard let (b, _) = targetWindowBounds() else { print("ChatGPT window not found"); exit(1) }
    let x = b.origin.x + xn * b.width
    let y = b.origin.y + (1 - yn) * b.height
    let p = CGPoint(x: x, y: y)
    CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left)!.post(tap: .cghidEventTap)
    usleep(80000)
    postMouse(.leftMouseDown, p)
    usleep(60000)
    postMouse(.leftMouseUp, p)
    print("clicked normalized \(xn),\(yn) -> screen \(Int(x)),\(Int(y))")

case "type":
    let text = args.dropFirst(2).joined(separator: " ")
    for ch in text.unicodeScalars {
        if let ev = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true) {
            var buf = [UniChar](repeating: 0, count: 1)
            buf[0] = UniChar(ch.value)
            ev.keyboardSetUnicodeString(stringLength: 1, unicodeString: &buf)
            ev.post(tap: .cghidEventTap)
            usleep(20000)
        }
    }
    print("typed \(text.count) chars")

case "key":
    let keys = args[2]
    // support "cmd+X" or "shift+X" or plain key
    var flags: CGEventFlags = []
    var keyStr = keys
    for part in keys.split(separator: "+") {
        let p = String(part).lowercased()
        if p == "cmd" || p == "command" { flags.insert(.maskCommand) }
        else if p == "shift" { flags.insert(.maskShift) }
        else if p == "alt" || p == "option" { flags.insert(.maskAlternate) }
        else if p == "ctrl" || p == "control" { flags.insert(.maskControl) }
        else { keyStr = String(part) }
    }
    postKey(keyCodeFor(keyStr), flags)
    print("pressed \(keys)")

case "scroll":
    let dy = Double(args[2])!
    guard let (b, _) = targetWindowBounds() else { print("ChatGPT window not found"); exit(1) }
    let center = CGPoint(x: b.midX, y: b.midY)
    CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: center, mouseButton: .left)!.post(tap: .cghidEventTap)
    usleep(50000)
    let scroll = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: Int32(dy), wheel2: 0, wheel3: 0)!
    scroll.post(tap: .cghidEventTap)
    print("scrolled \(Int(dy))")

case "frontmost":
    let apps = NSWorkspace.shared.runningApplications
    print(apps.first(where: { $0.isActive })?.localizedName ?? "?")

default:
    print("usage: control.swift <click|clickn|type|key|scroll|frontmost> ...")
}
