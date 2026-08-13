#!/usr/bin/env swift
// Crop a normalized region of a screenshot and save as PNG.
// Usage: swift crop.swift <input> <out> <nx> <ny> <nw> <nh>
//   nx,ny = top-left of region (normalized, origin bottom-left), nw,nh = size
import AppKit
import Foundation
let a = CommandLine.arguments
let (inp, outp) = (a[1], a[2])
let (nx, ny, nw, nh) = (Double(a[3])!, Double(a[4])!, Double(a[5])!, Double(a[6])!)
guard let img = NSImage(contentsOfFile: inp), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { print("load fail"); exit(1) }
let w = cg.width, h = cg.height
// origin bottom-left -> flip to top-left
let rect = CGRect(x: nx * Double(w), y: (1 - ny - nh) * Double(h), width: nw * Double(w), height: nh * Double(h))
guard let cropped = cg.cropping(to: rect) else { print("crop fail"); exit(1) }
let out = NSBitmapImageRep(cgImage: cropped)
try! out.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: outp))
print("cropped -> \(outp) (\(cropped.width)x\(cropped.height))")
