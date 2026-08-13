#!/usr/bin/env swift
// OCR a screenshot using macOS Vision framework. Outputs recognized text with
// normalized bounding boxes (0..1, origin bottom-left).
// Usage: swift ocr.swift <image.png>

import AppKit
import Foundation
import Vision

let path = CommandLine.arguments[1]
guard let img = NSImage(contentsOfFile: path),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("cannot load image"); exit(1)
}

let request = VNRecognizeTextRequest { req, err in
    guard let results = req.results as? [VNRecognizedTextObservation] else { return }
    // Sort top-to-bottom, left-to-right
    let sorted = results.sorted { a, b in
        let ay = a.boundingBox.midY, by = b.boundingBox.midY
        if abs(ay - by) > 0.01 { return ay > by }
        return a.boundingBox.minX < b.boundingBox.minX
    }
    for obs in sorted {
        guard let cand = obs.topCandidates(1).first else { continue }
        let box = obs.boundingBox
        let x = (box.minX * 1000).rounded() / 1000
        let y = (box.minY * 1000).rounded() / 1000
        let w = (box.width * 1000).rounded() / 1000
        let h = (box.height * 1000).rounded() / 1000
        let conf = Int(cand.confidence * 100)
        print("\(cand.string) | @\(x),\(y) \(w)x\(h) | \(conf)%")
    }
}
request.recognitionLevel = VNRequestTextRecognitionLevel.accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["en-US", "zh-Hans"]

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
try handler.perform([request])
