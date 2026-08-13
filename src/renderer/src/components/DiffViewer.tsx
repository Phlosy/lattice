import { useMemo, useState } from "react";
import { parseDiff } from "../lib/diff";

interface DiffViewerProps {
  diff: string;
  /** Collapse long diffs behind a toggle. */
  maxLines?: number;
}

export function DiffViewer({ diff, maxLines = 400 }: DiffViewerProps) {
  const [expanded, setExpanded] = useState(false);

  const lines = useMemo(() => parseDiff(diff), [diff]);
  const fileHead = useMemo(() => {
    const meta = lines.filter((l) => l.type === "meta");
    return meta.length > 0 ? meta.map((l) => l.text).join("  ") : undefined;
  }, [lines]);

  if (lines.length === 0) {
    return <div className="empty-state">No changes</div>;
  }

  const visible = expanded ? lines : lines.slice(0, maxLines);
  const truncated = !expanded && lines.length > maxLines;

  return (
    <div className="diff-wrap">
      {fileHead && <div className="diff-file-head">{fileHead}</div>}
      <div className="diff">
        {visible.map((l, i) => {
          const sign = l.type === "add" ? "+" : l.type === "del" ? "−" : l.type === "hunk" ? " " : " ";
          return (
            <div key={i} className={`diff-line ${l.type}`}>
              <span className="gutter">{l.type === "ctx" || l.type === "meta" ? "" : sign}</span>
              <span className="content">{l.text}</span>
            </div>
          );
        })}
      </div>
      {truncated && (
        <button className="diff-expand" onClick={() => setExpanded(true)}>
          Show all {lines.length} lines
        </button>
      )}
    </div>
  );
}
