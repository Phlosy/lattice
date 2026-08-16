// DockWorkbench — the FlexLayout-backed dockable workbench. Owns the layout
// model, binds it to the command service, renders views via the registry, and
// persists the JSON layout (debounced) on change.

import { useEffect, useMemo, useRef } from "react";
import { Layout, Model } from "flexlayout-react";
import type { TabNode } from "flexlayout-react";
import "flexlayout-react/style/dark.css";
import { createWorkbenchModel, LAYOUT_STORAGE_KEY } from "./layout";
import { getWorkbenchView } from "./registry";
import { bindWorkbenchModel } from "./commands";
import { useApp } from "../store/useApp";

function factory(node: TabNode): React.ReactNode {
  const component = node.getComponent() ?? "";
  const baseType = component.split(":")[0];
  const descriptor = getWorkbenchView(baseType);
  if (!descriptor) return <div className="workbench-unknown">Unknown view: {component}</div>;
  const View = descriptor.component;
  return <View componentId={component} />;
}

export function DockWorkbench() {
  // Bind the model synchronously (during render) so view effects can update
  // tab titles on their first mount.
  const model = useMemo(() => {
    const m = createWorkbenchModel();
    bindWorkbenchModel(m);
    return m;
  }, []);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const listener = () => {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        try {
          localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(model.toJson()));
        } catch {
          /* ignore quota / serialization errors */
        }
      }, 300);
      // Kill any PTY whose dedicated terminal tab was removed from the layout.
      const inLayout = new Set<string>();
      model.visitNodes((node) => {
        if (node.getType() === "tab") {
          const comp = (node as TabNode).getComponent() ?? "";
          if (comp.startsWith("terminal:")) inLayout.add(comp.slice("terminal:".length));
        }
      });
      for (const terminal of useApp.getState().terminals) {
        if (!inLayout.has(terminal.id)) void useApp.getState().killTerminal(terminal.id);
      }
    };
    model.addChangeListener(listener);
    return () => {
      model.removeChangeListener(listener);
      window.clearTimeout(saveTimer.current);
    };
  }, [model]);

  return <Layout model={model} factory={factory} />;
}
