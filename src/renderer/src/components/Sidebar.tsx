// Sidebar — two-zone layout:
//   • scroll area: Projects (with their conversations) + Chats (standalone) + Archived
//   • fixed bottom bar: Pi Runtime · Extensions · New (never scrolls)
// Uses flex column; no absolute positioning, no horizontal scrollbar.

import { useEffect, useRef, useState } from "react";
import {
  Archive,
  Blocks,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FolderOpen,
  FolderPlus,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useApp } from "../store/useApp";
import { useT } from "../i18n";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { RuntimeIndicator } from "../runtime/RuntimeIndicator";
import type { Conversation } from "@shared/types";

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

export function Sidebar() {
  const t = useT();
  const projects = useApp((s) => s.projects);
  const currentProject = useApp((s) => s.currentProject);
  const conversations = useApp((s) => s.conversations);
  const activeSessionId = useApp((s) => s.activeSessionId);
  const running = useApp((s) => s.transcript.running);
  const collapsed = useApp((s) => s.sidebarCollapsed);
  const showArchived = useApp((s) => s.showArchived);
  const setShowArchived = useApp((s) => s.setShowArchived);
  const toggleSidebar = useApp((s) => s.toggleSidebar);

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(currentProject ? [currentProject.path] : []),
  );
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [menu, setMenu] = useState<MenuState | null>(null);

  // Keep the active project expanded as it changes.
  useEffect(() => {
    if (currentProject) setExpanded((prev) => new Set(prev).add(currentProject.path));
  }, [currentProject?.path]);

  const byProject = (projectId: string) =>
    conversations.filter((c) => !c.archived && c.projectId === projectId);
  const standalone = conversations.filter((c) => !c.archived && !c.projectId);
  const archived = conversations.filter((c) => c.archived);

  const toggleExpanded = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const openMenu = (e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const conversationMenu = (
    e: React.MouseEvent,
    c: Conversation,
  ): MenuItem[] => {
    const items: MenuItem[] = [
      {
        label: t("sidebar.rename"),
        onClick: () => {
          setRenaming(c.id);
          setRenameValue(c.title);
        },
      },
    ];
    if (c.projectId) {
      items.push({
        label: t("sidebar.moveToStandalone"),
        onClick: () => void useApp.getState().moveConversation(c.id, null),
      });
    } else if (currentProject) {
      items.push({
        label: t("sidebar.moveToProject", { name: currentProject.name }),
        onClick: () => void useApp.getState().moveConversation(c.id, currentProject.path),
      });
    }
    items.push({ separator: true });
    items.push({
      label: c.archived ? t("sidebar.unarchive") : t("sidebar.archive"),
      onClick: () =>
        void (c.archived
          ? useApp.getState().unarchiveConversation(c.id)
          : useApp.getState().archiveConversation(c.id)),
    });
    items.push({
      label: t("sidebar.delete"),
      danger: true,
      onClick: () => {
        if (c.file) void useApp.getState().deleteSession(c.file);
      },
    });
    return items;
  };

  const projectMenu = (e: React.MouseEvent, path: string, name: string): MenuItem[] => [
    {
      label: t("sidebar.open"),
      onClick: () => void useApp.getState().openProject(path),
    },
    {
      label: t("sidebar.newConversationIn", { name }),
      onClick: () => {
        void useApp.getState().openProject(path).then(() => {
          if (useApp.getState().currentProject?.path === path) {
            void useApp.getState().createSession();
          }
        });
      },
    },
    { separator: true },
    {
      label: t("sidebar.removeRecents"),
      danger: true,
      onClick: () => void useApp.getState().removeProject(path),
    },
  ];

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        {!collapsed && (
          <span className="brand">
            <span className="brand-mark">Λ</span>
            Lattice
          </span>
        )}
        <button
          className="icon-btn"
          data-tooltip={collapsed ? "Expand" : "Collapse"}
          onClick={() => toggleSidebar()}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      <div className="sidebar-scroll">
        {!collapsed ? (
          <>
            <SectionTitle label={t("sidebar.projects")} onAction={() => void useApp.getState().openProject()} actionIcon={<FolderOpen size={13} />} />
            {projects.length === 0 && (
              <div className="sidebar-empty">{t("sidebar.noProjects")}</div>
            )}
            {projects.map((p) => {
              const isOpen = expanded.has(p.path);
              const isActive = currentProject?.path === p.path;
              const items = byProject(p.path);
              return (
                <div key={p.path} className="project-group">
                  <div
                    className={`item item-project ${isActive ? "active" : ""}`}
                    onClick={() => void useApp.getState().openProject(p.path)}
                    onContextMenu={(e) => openMenu(e, projectMenu(e, p.path, p.name))}
                  >
                    <button
                      className="chevron-btn"
                      data-tooltip={isOpen ? "Collapse" : "Expand"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(p.path);
                      }}
                    >
                      {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                    <span className="item-label">{p.name}</span>
                    <span className="item-meta">{p.kind === "repo" ? "⑂" : "▤"}</span>
                  </div>
                  {isOpen &&
                    items.map((c) => (
                      <ConversationRow
                        key={c.id}
                        conversation={c}
                        active={c.id === activeSessionId}
                        running={running}
                        renaming={renaming}
                        renameValue={renameValue}
                        onRenameChange={setRenameValue}
                        onStartRename={(id, title) => {
                          setRenaming(id);
                          setRenameValue(title);
                        }}
                        onFinishRename={(id) => {
                          const value = renameValue.trim();
                          if (value) void useApp.getState().renameSession(id, value);
                          setRenaming(null);
                        }}
                        onCancelRename={() => setRenaming(null)}
                        onOpen={() => c.file && void useApp.getState().openSession(c.file)}
                        onMenu={(e) => openMenu(e, conversationMenu(e, c))}
                        indent
                      />
                    ))}
                </div>
              );
            })}

            <SectionTitle label={t("sidebar.chats")} onAction={() => void useApp.getState().createStandaloneSession()} actionIcon={<Plus size={13} />} />
            {standalone.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                active={c.id === activeSessionId}
                running={running}
                renaming={renaming}
                renameValue={renameValue}
                onRenameChange={setRenameValue}
                onStartRename={(id, title) => {
                  setRenaming(id);
                  setRenameValue(title);
                }}
                onFinishRename={(id) => {
                  const value = renameValue.trim();
                  if (value) void useApp.getState().renameSession(id, value);
                  setRenaming(null);
                }}
                onCancelRename={() => setRenaming(null)}
                onOpen={() => c.file && void useApp.getState().openSession(c.file)}
                onMenu={(e) => openMenu(e, conversationMenu(e, c))}
              />
            ))}
            {standalone.length === 0 && (
              <div className="sidebar-empty">{t("sidebar.noChats")}</div>
            )}

            <button className="archived-toggle" onClick={() => setShowArchived(!showArchived)}>
              <Archive size={13} />
              <span>{t("sidebar.archived")}</span>
              <span className="archived-count">{archived.length}</span>
            </button>
            {showArchived &&
              archived.map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  active={c.id === activeSessionId}
                  running={running}
                  renaming={renaming}
                  renameValue={renameValue}
                  onRenameChange={setRenameValue}
                  onStartRename={(id, title) => {
                    setRenaming(id);
                    setRenameValue(title);
                  }}
                  onFinishRename={(id) => {
                    const value = renameValue.trim();
                    if (value) void useApp.getState().renameSession(id, value);
                    setRenaming(null);
                  }}
                  onCancelRename={() => setRenaming(null)}
                  onOpen={() => c.file && void useApp.getState().openSession(c.file)}
                  onMenu={(e) => openMenu(e, conversationMenu(e, c))}
                />
              ))}
          </>
        ) : (
          <div className="sidebar-collapsed-icons">
            {projects.map((p) => (
              <button
                key={p.path}
                className={`icon-btn ${currentProject?.path === p.path ? "active" : ""}`}
                data-tooltip={p.name}
                onClick={() => void useApp.getState().openProject(p.path)}
              >
                <FolderOpen size={16} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <RuntimeIndicator />
        <button className="icon-btn" data-tooltip={t("sidebar.extensions")} onClick={() => useApp.getState().setView("extensions")}>
          <Blocks size={16} />
        </button>
        <NewButton />
      </div>

      {menu && <ContextMenu items={menu.items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </aside>
  );
}

function SectionTitle({ label, onAction, actionIcon }: { label: string; onAction?: () => void; actionIcon?: React.ReactNode }) {
  return (
    <div className="sidebar-section-title">
      <span>{label}</span>
      {onAction && (
        <button className="icon-btn" data-tooltip={label} onClick={onAction}>
          {actionIcon ?? <Plus size={13} />}
        </button>
      )}
    </div>
  );
}

function ConversationRow(props: {
  conversation: Conversation;
  active: boolean;
  running: boolean;
  renaming: string | null;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onStartRename: (id: string, title: string) => void;
  onFinishRename: (id: string) => void;
  onCancelRename: () => void;
  onOpen: () => void;
  onMenu: (e: React.MouseEvent) => void;
  indent?: boolean;
}) {
  const t = useT();
  const c = props.conversation;
  const isRunning = props.active && props.running;

  if (props.renaming === c.id) {
    return (
      <input
        className="rename-input"
        style={props.indent ? { marginLeft: 20, width: "calc(100% - 20px)" } : undefined}
        autoFocus
        value={props.renameValue}
        onChange={(e) => props.onRenameChange(e.target.value)}
        onBlur={() => props.onFinishRename(c.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter") props.onFinishRename(c.id);
          else if (e.key === "Escape") props.onCancelRename();
        }}
      />
    );
  }

  return (
    <div
      className={`item item-conversation ${props.active ? "active" : ""} ${props.running && !props.active ? "disabled" : ""}`}
      style={props.indent ? { paddingLeft: 20 } : undefined}
      aria-disabled={props.running && !props.active}
      onClick={props.onOpen}
      onContextMenu={props.onMenu}
    >
      <span className={`status-dot ${isRunning ? "running" : props.active ? "success" : ""}`} />
      <span className="item-label">{c.title}</span>
      {c.messageCount > 0 && <span className="item-meta">{c.messageCount}</span>}
      <span className="item-actions">
        <button
          className="icon-btn"
          data-tooltip={t("sidebar.rename")}
          onClick={(e) => {
            e.stopPropagation();
            props.onStartRename(c.id, c.title);
          }}
        >
          <Pencil size={12} />
        </button>
        <button
          className="icon-btn"
          data-tooltip={t("sidebar.archive")}
          onClick={(e) => {
            e.stopPropagation();
            void useApp.getState().archiveConversation(c.id);
          }}
        >
          <Archive size={12} />
        </button>
      </span>
    </div>
  );
}

function NewButton() {
  const t = useT();
  const currentProject = useApp((s) => s.currentProject);
  const running = useApp((s) => s.transcript.running);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const items: { label: string; icon: React.ReactNode; onClick: () => void }[] = [];
  if (currentProject) {
    items.push({
      label: t("sidebar.newConversationIn", { name: currentProject.name }),
      icon: <MessageSquare size={14} />,
      onClick: () => {
        setOpen(false);
        void useApp.getState().createSession();
      },
    });
    items.push({
      label: t("sidebar.newStandalone"),
      icon: <FolderPlus size={14} />,
      onClick: () => {
        setOpen(false);
        void useApp.getState().createStandaloneSession();
      },
    });
  } else {
    items.push({
      label: t("sidebar.newConversation"),
      icon: <MessageSquare size={14} />,
      onClick: () => {
        setOpen(false);
        void useApp.getState().createSession();
      },
    });
  }
  items.push({
    label: t("sidebar.openFolder"),
    icon: <ExternalLink size={14} />,
    onClick: () => {
      setOpen(false);
      void useApp.getState().openProject();
    },
  });

  return (
    <div className="new-menu-wrap" ref={ref} style={{ position: "relative" }}>
      <button className="icon-btn" data-tooltip={t("sidebar.new")} disabled={running} onClick={() => setOpen((v) => !v)}>
        <Plus size={16} />
      </button>
      {open && (
        <div className="popover" style={{ bottom: "calc(100% + 6px)", right: 0, minWidth: 220 }}>
          <div className="popover-header">{t("sidebar.new")}</div>
          <div className="popover-list">
            {items.map((item) => (
              <button key={item.label} className="popover-item" onClick={item.onClick}>
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
