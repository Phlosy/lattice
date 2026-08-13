#!/usr/bin/env swift
// Analyze a screenshot's color layout to find UI region boundaries.
// Outputs: horizontal color bands (top-to-bottom) and vertical color columns
// (left-to-right), which reveal sidebar width, topbar height, panel edges.
// Usage: swift layout.swift <image.png>

import AppKit
import Foundation

let path = CommandLine.arguments[1]
guard let img = NSImage(contentsOfFile: path),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { print("cannot load"); exit(1) }
let w = cg.width, h = cg.height
guard let data = cg.dataProvider?.data, let ptr = CFDataGetBytePtr(data) else { print("no data"); exit(1) }
let bpp = cg.bitsPerPixel / 8
let rowBytes = cg.bytesPerRow

func px(_ x: Int, _ y: Int) -> (Int, Int, Int) {
    let o = y * rowBytes + x * bpp
    return (Int(ptr[o]), Int(ptr[o+1]), Int(ptr[o+2]))
}

func bucket(_ r: Int, _ g: Int, _ b: Int) -> String {
    // Quantize to a coarse bucket
    let q = 24
    return "\(r/q*q),\(g/q*q),\(b/q*q)"
}

print("image=\(w)x\(h)")

// Horizontal bands: for each row, compute the dominant color, then merge consecutive rows.
print("\n=== HORIZONTAL BANDS (top to bottom) ===")
var prevKey = ""
var bandStart = 0
for y in stride(from: 0, to: h, by: 2) {
    var counts: [String: Int] = [:]
    for x in stride(from: 0, to: w, by: 8) {
        let (r, g, b) = px(x, y)
        counts[bucket(r, g, b), default: 0] += 1
    }
    let key = counts.sorted { $0.value > $1.value }.first?.key ?? "?"
    if key != prevKey {
        if bandStart > 0 { print("y=\(bandStart)..\(y)  \(prevKey)") }
        prevKey = key
        bandStart = y
    }
}
print("y=\(bandStart)..\(h)  \(prevKey)")

// Vertical columns: for each column, dominant color, merge consecutive columns.
print("\n=== VERTICAL COLUMNS (left to right) ===")
var prevKey2 = ""
var colStart = 0
for x in stride(from: 0, to: w, by: 2) {
    var counts: [String: Int] = [:]
    for y in stride(from: 0, to: h, by: 8) {
        let (r, g, b) = px(x, y)
        counts[bucket(r, g, b), default: 0] += 1
    }
    let key = counts.sorted { $0.value > $1.value }.first?.key ?? "?"
    if key != prevKey2 {
        if colStart > 0 { print("x=\(colStart)..\(x)  \(prevKey2)") }
        prevKey2 = key
        colStart = x
    }
}
print("x=\(colStart)..\(w)  \(prevKey2)")
