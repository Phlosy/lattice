// Workbench layout model — builds the FlexLayout model, owns default layout,
// and persists the serialized JSON tree. This is the single source of truth for
// "where views live"; individual views never manage their own position.

import { Model } from "flexlayout-react";
import type { IJsonModel } from "flexlayout-react";

export const LAYOUT_STORAGE_KEY = "lattice.workbench.layout.v1";

/** Default: conversation on the left, Git on the right. Terminals are added
 * on demand and dock to the right (see workbenchCommands.openTerminal). */
export function defaultLayoutJson(): IJsonModel {
  return {
    global: {
      rootOrientationVertical: true,
      tabEnableClose: true,
      tabEnableDrag: true,
      tabEnableRename: false,
      tabEnableRenderOnDemand: true,
      // Views fill their own panel and manage their own scrolling.
      tabEnableScrollbars: false,
      tabSetEnableMaximize: true,
      tabSetEnableDivide: true,
      tabSetEnableDeleteWhenEmpty: true,
      tabSetTabLocation: "top",
    },
    borders: [],
    layout: {
      type: "row",
      weight: 100,
      children: [
        {
          type: "tabset",
          weight: 62,
          selected: 0,
          children: [
            {
              type: "tab",
              id: "view-conversation",
              name: "Conversation",
              component: "conversation",
              enableClose: false,
            },
          ],
        },
        {
          type: "tabset",
          weight: 38,
          selected: 0,
          children: [{ type: "tab", id: "view-git", name: "Git", component: "git" }],
        },
      ],
    },
  };
}

function parseSavedLayout(): IJsonModel | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const json = JSON.parse(raw) as IJsonModel;
    // Guard against a corrupt/empty saved tree.
    if (!json?.layout) return null;
    // Terminals are ephemeral PTYs recreated on demand; never resurrect stale
    // `terminal:*` tabs from a previous session.
    return stripTerminalTabs(json);
  } catch {
    return null;
  }
}

function stripTerminalTabs(json: IJsonModel): IJsonModel {
  const layout = pruneNode(json.layout as unknown as Record<string, unknown>);
  return { ...json, layout } as unknown as IJsonModel;
}

function pruneNode(node: Record<string, unknown>): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  if (node.type === "tab") {
    const component = String(node.component ?? "");
    return component.startsWith("terminal:") ? null : node;
  }
  const children = node.children as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(children)) {
    const pruned = children
      .map((child) => pruneNode(child))
      .filter((child): child is Record<string, unknown> => child !== null);
    // Drop a tabset/row that lost every child (all terminals).
    if (pruned.length === 0 && (node.type === "tabset" || node.type === "row")) return null;
    return { ...node, children: pruned };
  }
  return node;
}

export function createWorkbenchModel(): Model {
  const model = Model.fromJson(parseSavedLayout() ?? defaultLayoutJson());
  model.setSplitterSize(4);
  return model;
}
