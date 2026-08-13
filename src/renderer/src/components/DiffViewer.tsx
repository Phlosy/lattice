// Unified-diff viewer. Parses `git diff` / unified-patch output into colored
// lines. Also used to render Pi's `edit` tool `details.patch`.

import { parseDiff } from "../lib/diff";

interface DiffViewerProps {
  diff: string;
}

export function DiffViewer({ diff }: DiffViewerProps) {
  const lines = parseDiff(diff);
  if (lines.length === 0) return <div className="empty">No changes</div>;
  return (
    <div className="diff-view">
      {lines.map((l, i) => (
        <div key={i} className={`diff-line ${l.type}`}>
          <span className="sign">{l.type === "add" ? "+" : l.type === "del" ? "-" : " "}</span>
          <span>{l.text}</span>
        </div>
      ))}
    </div>
  );
}
