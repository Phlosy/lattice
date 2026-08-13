// Lattice main process entry — creates the window, initializes services, and
// wires IPC. The Pi runtime runs in-process via PiRuntimeAdapter.

import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { EVT, IPC } from "@shared/types";
import { registerIpc } from "./ipc";
import { DialogBridge } from "./runtime/dialog-bridge";
import { PiRuntimeAdapter } from "./runtime/pi-runtime";
import { AppState, decisionsPath } from "./state";
import { WorkspaceManager } from "./workspace";
import { GitManager } from "./git";
import { TerminalManager } from "./terminal";
import { ExtensionRegistry } from "./extensions";
import { SessionRegistry } from "./session-registry";

let mainWindow: BrowserWindow | null = null;

const appState = new AppState();
const bridge = new DialogBridge();
const workspace = new WorkspaceManager(appState);
const git = new GitManager();
const terminal = new TerminalManager((channel, ...args) => {
  mainWindow?.webContents.send(channel, ...args);
});
const extensions = new ExtensionRegistry(getAgentDir());
const runtime = new PiRuntimeAdapter(bridge);
const sessions = new SessionRegistry(runtime, (channel, ...args) => {
  mainWindow?.webContents.send(channel, ...args);
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: "Lattice",
    backgroundColor: "#0e0f12",
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

async function bootstrap(): Promise<void> {
  // Attach the dialog bridge once the window is ready.
  bridge.attach(
    (channel, ...args) => mainWindow?.webContents.send(channel, ...args),
    decisionsPath(),
  );

  registerIpc({
    appState,
    workspace,
    git,
    terminal,
    extensions,
    sessions,
    runtime,
    bridge,
    agentDir: getAgentDir(),
    getWindow: () => mainWindow,
  });

  try {
    await runtime.init();
  } catch (err) {
    console.error("Failed to initialize Pi runtime:", err);
  }
}

app.whenReady().then(async () => {
  createWindow();
  await bootstrap();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  terminal.disposeAll();
  sessions.disposeAll();
});
