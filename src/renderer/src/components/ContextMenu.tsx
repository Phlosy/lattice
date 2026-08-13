import { useEffect, useRef } from "react";

export interface MenuItem {
  label?: string;
  danger?: boolean;
  onClick?: () => void;
  separator?: boolean;
}

interface ContextMenuProps {
  items: MenuItem[];
  onClose: () => void;
  x: number;
  y: number;
}

export function ContextMenu({ items, onClose, x, y }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="context-menu-sep" />
        ) : (
          <button
            key={i}
            className={`context-menu-item ${item.danger ? "danger" : ""}`}
            onClick={() => {
              item.onClick?.();
              onClose();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
