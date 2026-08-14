#!/usr/bin/env swift
import AppKit

let width: CGFloat = 720
let height: CGFloat = 440
let output = CommandLine.arguments.dropFirst().first
    ?? "poc/tauri-app/src-tauri/icons/dmg-background.png"

let image = NSImage(size: NSSize(width: width, height: height))
image.lockFocus()

let bounds = NSRect(x: 0, y: 0, width: width, height: height)
let gradient = NSGradient(colors: [
    NSColor(calibratedRed: 0.035, green: 0.047, blue: 0.078, alpha: 1),
    NSColor(calibratedRed: 0.075, green: 0.105, blue: 0.170, alpha: 1),
    NSColor(calibratedRed: 0.055, green: 0.065, blue: 0.110, alpha: 1),
])!
gradient.draw(in: bounds, angle: -20)

// Soft brand glow.
let glow = NSGradient(colors: [
    NSColor(calibratedRed: 0.31, green: 0.55, blue: 1.0, alpha: 0.22),
    NSColor(calibratedRed: 0.31, green: 0.55, blue: 1.0, alpha: 0),
])!
glow.draw(in: NSBezierPath(ovalIn: NSRect(x: 202, y: 52, width: 316, height: 316)), relativeCenterPosition: .zero)

func drawText(_ text: String, rect: NSRect, font: NSFont, color: NSColor, alignment: NSTextAlignment = .center, kern: CGFloat = 0) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = alignment
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: color,
        .paragraphStyle: paragraph,
        .kern: kern,
    ]
    text.draw(in: rect, withAttributes: attrs)
}

drawText("Λ", rect: NSRect(x: 0, y: 351, width: width, height: 44),
         font: NSFont.systemFont(ofSize: 34, weight: .semibold),
         color: NSColor(calibratedRed: 0.42, green: 0.64, blue: 1.0, alpha: 1))
drawText("LATTICE", rect: NSRect(x: 0, y: 320, width: width, height: 30),
         font: NSFont.systemFont(ofSize: 20, weight: .semibold),
         color: .white, kern: 4.2)
drawText("Your AI coding workspace", rect: NSRect(x: 0, y: 292, width: width, height: 24),
         font: NSFont.systemFont(ofSize: 13, weight: .regular),
         color: NSColor.white.withAlphaComponent(0.62), kern: 0.3)

// Frosted cards keep Finder's dark icon labels readable on the branded field.
for x in [92.0, 452.0] {
    let card = NSBezierPath(roundedRect: NSRect(x: x, y: 82, width: 176, height: 164), xRadius: 22, yRadius: 22)
    NSColor(calibratedWhite: 0.96, alpha: 0.80).setFill()
    card.fill()
    NSColor(calibratedRed: 0.52, green: 0.68, blue: 0.94, alpha: 0.45).setStroke()
    card.lineWidth = 1
    card.stroke()
}

// Drag arrow between Finder's app and Applications icons.
let arrowColor = NSColor(calibratedRed: 0.49, green: 0.68, blue: 1.0, alpha: 0.9)
arrowColor.setStroke()
let line = NSBezierPath()
line.lineWidth = 2.5
line.lineCapStyle = .round
line.move(to: NSPoint(x: 292, y: 178))
line.line(to: NSPoint(x: 425, y: 178))
line.stroke()
let head = NSBezierPath()
head.lineWidth = 2.5
head.lineCapStyle = .round
head.move(to: NSPoint(x: 414, y: 187))
head.line(to: NSPoint(x: 426, y: 178))
head.line(to: NSPoint(x: 414, y: 169))
head.stroke()

drawText("DRAG TO INSTALL", rect: NSRect(x: 0, y: 65, width: width, height: 24),
         font: NSFont.systemFont(ofSize: 11, weight: .medium),
         color: NSColor.white.withAlphaComponent(0.55), kern: 2.0)
drawText("Lattice requires macOS 13 or later", rect: NSRect(x: 0, y: 45, width: width, height: 18),
         font: NSFont.systemFont(ofSize: 10, weight: .regular),
         color: NSColor.white.withAlphaComponent(0.34))

image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
    fputs("Failed to render DMG background\n", stderr)
    exit(1)
}
try png.write(to: URL(fileURLWithPath: output))
print("Generated \(output) (\(Int(width))x\(Int(height)))")
