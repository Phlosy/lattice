// Workbench commands — the only way UI/agents mutate the layout. Components
// never reach into the Dock Engine directly; they call these commands.

import { Actions, DockLocation, Model } from "flexlayout-react";
import type { TabNode } from "flexlayout-react";
import { getWorkbenchView } from "./registry";
import { LAYOUT_STORAGE_KEY } from "./layout";

let boundModel: Model | null = null;

export function bindWorkbenchModel(model: Model): void {
  boundModel = model;
}

function findTabByComponent(model: Model, component: string): TabNode | undefined {
  let found: TabNode | undefined;
  model.visitNodes((node) => {
    if (!found && node.getType() === "tab" && (node as TabNode).getComponent() === component) {
      found = node as TabNode;
    }
  });
  return found;
}

function selectTab(model: Model, tab: TabNode): void {
  model.doAction(Actions.selectTab(tab.getId()));
}

export const workbenchCommands = {
  /** Open (and focus) a view; create it in the active tabset if absent. */
  openView(type: string): void {
    if (!boundModel) return;
    const descriptor = getWorkbenchView(type);
    if (!descriptor) return;

    const existing = descriptor.singleton ? findTabByComponent(boundModel, type) : undefined;
    if (existing) {
      selectTab(boundModel, existing);
      return;
    }

    const tabset = boundModel.getActiveTabset();
    const targetId = tabset?.getId() ?? boundModel.getRootRow()?.getId();
    if (!targetId) return;

    boundModel.doAction(
      Actions.addNode(
        {
          type: "tab",
          id: `view-${type}`,
          name: descriptor.title,
          component: type,
          enableClose: descriptor.closable !== false,
        },
        targetId,
        DockLocation.CENTER,
        -1,
        true,
      ),
    );
  },

  resetLayout(): void {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
    window.location.reload();
  },
};
