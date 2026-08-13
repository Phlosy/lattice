// Unified-diff parser — shared between the DiffViewer component and tests.

export interface DiffLine {
  type: "add" | "del" | "hunk" | "meta" | "ctx";
  text: string;
}

export function parseDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++") || raw.startsWith("---")) {
      lines.push({ type: "meta", text: raw });
    } else if (raw.startsWith("@@")) {
      lines.push({ type: "hunk", text: raw });
    } else if (raw.startsWith("+") && !raw.startsWith("+++")) {
      lines.push({ type: "add", text: raw });
    } else if (raw.startsWith("-") && !raw.startsWith("---")) {
      lines.push({ type: "del", text: raw });
    } else if (
      raw.startsWith("diff ") ||
      raw.startsWith("index ") ||
      raw.startsWith("new ") ||
      raw.startsWith("old ") ||
      raw.startsWith("similarity ")
    ) {
      lines.push({ type: "meta", text: raw });
    } else {
      lines.push({ type: "ctx", text: raw });
    }
  }
  return lines;
}
