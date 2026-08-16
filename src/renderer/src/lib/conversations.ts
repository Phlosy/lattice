// Conversation model helpers — the pure data layer that turns Pi session metas
// into the UI's Conversation view model. Pi owns the JSONL agent session (id,
// name, cwd, timestamps, message count); Lattice owns the association (project
// vs standalone), the archived flag, and last-opened time, persisted as
// `ConversationMeta` under localStorage.

import type {
  Conversation,
  ConversationMeta,
  ProjectInfo,
  SessionMeta,
} from "@shared/types";

export const CONVERSATIONS_STORAGE_KEY = "lattice.conversations.v1";

export function loadConversationMeta(): Record<string, ConversationMeta> {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ConversationMeta>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveConversationMeta(meta: Record<string, ConversationMeta>): void {
  try {
    localStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    /* ignore quota / serialization errors */
  }
}

/** The project whose path equals the session cwd, if any. */
export function projectPathForCwd(projects: ProjectInfo[], cwd: string): string | null {
  if (!cwd) return null;
  return projects.some((p) => p.path === cwd) ? cwd : null;
}

/**
 * Derive a short conversation title from the first user message.
 * Targets 10–24 CJK characters or 3–8 English words.
 */
export function autoTitle(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) return "New conversation";
  const hasCjk = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(cleaned);
  if (hasCjk) {
    const compact = cleaned.replace(/\s+/g, "");
    return compact.length > 20 ? compact.slice(0, 20) + "…" : compact;
  }
  const words = cleaned.split(" ");
  const short = words.slice(0, 8).join(" ");
  return short.length > 48 ? short.slice(0, 48).trimEnd() + "…" : short;
}

/**
 * Fold raw Pi session metas + Lattice metadata into the UI Conversation model.
 * `projectId` defaults to the project matching the session cwd; a meta override
 * (from Move) wins.
 */
export function deriveConversations(
  sessions: SessionMeta[],
  projects: ProjectInfo[],
  meta: Record<string, ConversationMeta>,
): Conversation[] {
  return sessions.map((s) => {
    const m = meta[s.id] ?? {};
    const projectId =
      m.projectId !== undefined ? m.projectId : projectPathForCwd(projects, s.cwd);
    return {
      id: s.id,
      title: s.name?.trim() || "New conversation",
      projectId,
      agentSessionId: s.id,
      file: s.file,
      cwd: s.cwd,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      lastOpenedAt: m.lastOpenedAt ?? s.updatedAt,
      messageCount: s.messageCount,
      archived: m.archived ?? false,
    };
  });
}

/** Most-recently-active first. */
export function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort(
    (a, b) => (b.lastOpenedAt || b.updatedAt || 0) - (a.lastOpenedAt || a.updatedAt || 0),
  );
}
