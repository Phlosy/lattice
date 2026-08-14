// Workbench layout model — builds the FlexLayout model, owns default layout,
// and persists the serialized JSON tree. This is the single source of truth for
// "where views live"; individual views never manage their own position.

import { Model } from "flexlayout-react";
import type { IJsonModel } from "flexlayout-react";

export const LAYOUT_STORAGE_KEY = "lattice.workbench.layout.v1";

/** Default: conversation on top, [Terminal | Git] below (a vertical split). */
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
          children: [
            { type: "tab", id: "view-terminal", name: "Terminal", component: "terminal" },
            { type: "tab", id: "view-git", name: "Git", component: "git" },
          ],
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
    return json;
  } catch {
    return null;
  }
}

export function createWorkbenchModel(): Model {
  const model = Model.fromJson(parseSavedLayout() ?? defaultLayoutJson());
  model.setSplitterSize(4);
  return model;
}
