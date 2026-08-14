// WorkbenchViewRegistry — maps a view type to its React component. Adding a
// future view (editor, preview, agent, problems, search…) is a single
// `registerWorkbenchView` call; the Dock Engine is never touched.

import type { ComponentType } from "react";
import type { WorkbenchViewType } from "./types";

export interface WorkbenchViewDescriptor {
  type: WorkbenchViewType;
  title: string;
  component: ComponentType;
  /** Only one instance allowed in the layout. */
  singleton?: boolean;
  closable?: boolean;
}

const registry = new Map<WorkbenchViewType, WorkbenchViewDescriptor>();

export function registerWorkbenchView(descriptor: WorkbenchViewDescriptor): void {
  registry.set(descriptor.type, descriptor);
}

export function getWorkbenchView(type: string): WorkbenchViewDescriptor | undefined {
  return registry.get(type as WorkbenchViewType);
}

export function listWorkbenchViews(): WorkbenchViewDescriptor[] {
  return [...registry.values()];
}
