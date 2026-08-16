// Conversation model tests — partition, auto-title, archive/move, sort, and
// persistence. Pure functions; no DOM required (localStorage stubbed where used).

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ConversationMeta, ProjectInfo, SessionMeta } from "../src/shared/types";
import {
  autoTitle,
  deriveConversations,
  loadConversationMeta,
  projectPathForCwd,
  saveConversationMeta,
  sortConversations,
} from "../src/renderer/src/lib/conversations";

const projects: ProjectInfo[] = [
  { id: "proj-/a", name: "a", path: "/a", kind: "repo", lastOpenedAt: 10 },
  { id: "proj-/b", name: "b", path: "/b", kind: "folder", lastOpenedAt: 20 },
];

function session(partial: Partial<SessionMeta>): SessionMeta {
  return {
    id: "s1",
    name: "Demo",
    projectId: "",
    cwd: "/a",
    createdAt: 1,
    updatedAt: 2,
    messageCount: 3,
    ...partial,
  };
}

describe("autoTitle", () => {
  it("derives a short CJK title (<=20 chars)", () => {
    const title = autoTitle("帮我把 Terminal 改成类似 VS Code 的拖拽结构，并且让会话标题自动生成");
    expect(title.length).toBeLessThanOrEqual(21);
    expect(title).toMatch(/Terminal|拖拽/);
  });

  it("derives 3-8 English words", () => {
    expect(autoTitle("fix the terminal resize glitch on retina displays").split(" ").length).toBeLessThanOrEqual(8);
  });

  it("falls back for empty input", () => {
    expect(autoTitle("  ")).toBe("New conversation");
  });
});

describe("deriveConversations", () => {
  it("maps a session cwd to a project path", () => {
    const convs = deriveConversations([session({ cwd: "/a" })], projects, {});
    expect(convs[0].projectId).toBe("/a");
  });

  it("treats an unmatched cwd as standalone (projectId null)", () => {
    const convs = deriveConversations([session({ cwd: "/home/x" })], projects, {});
    expect(convs[0].projectId).toBeNull();
  });

  it("respects a Move override in metadata", () => {
    const meta: Record<string, ConversationMeta> = { s1: { projectId: null } };
    const convs = deriveConversations([session({ cwd: "/a" })], projects, meta);
    expect(convs[0].projectId).toBeNull();
  });

  it("marks archived from metadata", () => {
    const meta: Record<string, ConversationMeta> = { s1: { archived: true } };
    const convs = deriveConversations([session({})], projects, meta);
    expect(convs[0].archived).toBe(true);
  });

  it("uses the Pi session name as the title", () => {
    const convs = deriveConversations([session({ name: "My task" })], projects, {});
    expect(convs[0].title).toBe("My task");
  });
});

describe("sortConversations", () => {
  it("orders by lastOpenedAt descending", () => {
    const convs = deriveConversations(
      [session({ id: "a", updatedAt: 5 }), session({ id: "b", updatedAt: 9 })],
      projects,
      { a: { lastOpenedAt: 1 }, b: { lastOpenedAt: 2 } },
    );
    const sorted = sortConversations(convs);
    expect(sorted.map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("projectPathForCwd", () => {
  it("returns the matching project path or null", () => {
    expect(projectPathForCwd(projects, "/a")).toBe("/a");
    expect(projectPathForCwd(projects, "/nope")).toBeNull();
    expect(projectPathForCwd(projects, "")).toBeNull();
  });
});

describe("conversation meta persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      _store: {} as Record<string, string>,
      getItem(k: string) {
        return this._store[k] ?? null;
      },
      setItem(k: string, v: string) {
        this._store[k] = v;
      },
      removeItem(k: string) {
        delete this._store[k];
      },
    });
  });

  it("round-trips metadata", () => {
    saveConversationMeta({ s1: { projectId: "/a", archived: true } });
    expect(loadConversationMeta()).toEqual({ s1: { projectId: "/a", archived: true } });
  });

  it("returns empty on corrupt storage", () => {
    (localStorage as any)._store["lattice.conversations.v1"] = "{not json";
    expect(loadConversationMeta()).toEqual({});
  });
});
