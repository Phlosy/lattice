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

function findTerminalTab(model: Model): TabNode | undefined {
  let found: TabNode | undefined;
  model.visitNodes((node) => {
    if (!found && node.getType() === "tab") {
      const component = (node as TabNode).getComponent() ?? "";
      if (component.startsWith("terminal:")) found = node as TabNode;
    }
  });
  return found;
}

function tabsetHasTerminal(model: Model, tabsetId: string): boolean {
  let has = false;
  model.visitNodes((node) => {
    if (has) return;
    if (node.getType() === "tab") {
      const tab = node as TabNode;
      const component = tab.getComponent() ?? "";
      if (component.startsWith("terminal:") && tab.getParent()?.getId() === tabsetId) has = true;
    }
  });
  return has;
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

  /**
   * Open a specific terminal (one PTY per tab).
   *   • first terminal  → docks a new tabset to the RIGHT of the active tabset
   *   • later terminals → append to the existing terminal tabset (so a single
   *     tab bar switches between them)
   * A tab can still be dragged out into its own split layout afterwards.
   */
  openTerminal(terminalId: string): void {
    if (!boundModel) return;
    const component = `terminal:${terminalId}`;
    const nodeId = `view-terminal-${terminalId}`;
    const existing = findTabByComponent(boundModel, component);
    if (existing) {
      selectTab(boundModel, existing);
      return;
    }

    const activeTabset = boundModel.getActiveTabset();
    let targetId: string | undefined;
    let location: DockLocation;

    if (activeTabset && tabsetHasTerminal(boundModel, activeTabset.getId())) {
      // Stack with the terminals already in the active tabset.
      targetId = activeTabset.getId();
      location = DockLocation.CENTER;
    } else {
      const terminalTab = findTerminalTab(boundModel);
      if (terminalTab?.getParent()) {
        // Append to the existing terminal tabset.
        targetId = terminalTab.getParent()?.getId();
        location = DockLocation.CENTER;
      } else {
        // No terminal yet → dock a new tabset on the right.
        targetId = activeTabset?.getId() ?? boundModel.getRootRow()?.getId();
        location = DockLocation.RIGHT;
      }
    }

    if (!targetId) return;
    boundModel.doAction(
      Actions.addNode(
        { type: "tab", id: nodeId, name: "Terminal", component, enableClose: true },
        targetId,
        location,
        -1,
        true,
      ),
    );
  },

  resetLayout(): void {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
    window.location.reload();
  },

  /** Update a view tab's displayed title (e.g. session name, terminal cwd). */
  updateViewTitle(tabId: string, title: string): void {
    if (!boundModel) return;
    const node = boundModel.getNodeById(tabId);
    if (node?.getType() === "tab" && (node as TabNode).getName() !== title) {
      boundModel.doAction(Actions.updateNodeAttributes(tabId, { name: title }));
    }
  },
};
