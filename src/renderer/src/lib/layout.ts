// Responsive layout classification shared by the React UI. Breakpoints are
// tuned to the product (not copied from a generic grid): Phone = single
// primary view with navigation; Tablet = sidebar + conversation (iPad-like,
// closer to Desktop); Desktop = current multi-pane layout.

import { useEffect, useState } from "react";

export type LayoutClass = "phone" | "tablet" | "desktop";

export function classifyLayout(width: number): LayoutClass {
  if (width < 768) return "phone";
  if (width < 1200) return "tablet";
  return "desktop";
}

export function useLayoutClass(): LayoutClass {
  const [cls, setCls] = useState<LayoutClass>(() => classifyLayout(window.innerWidth));

  useEffect(() => {
    const onResize = () => {
      const next = classifyLayout(window.innerWidth);
      setCls(next);
      document.body.dataset.layout = next;
    };
    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return cls;
}
