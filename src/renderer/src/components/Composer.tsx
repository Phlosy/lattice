import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, ImagePlus, Square } from "lucide-react";
import { useApp } from "../store/useApp";
import { useT } from "../i18n";

interface Attachment {
  type: "image";
  data: string; // base64
  mimeType: string;
  name: string;
}

export function Composer() {
  const t = useT();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fileList, setFileList] = useState<string[]>([]);
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const prompt = useApp((s) => s.prompt);
  const abort = useApp((s) => s.abort);
  const running = useApp((s) => s.transcript.running);
  const steering = useApp((s) => s.transcript.steering);
  const followUp = useApp((s) => s.transcript.followUp);
  const sessionState = useApp((s) => s.sessionState);
  const currentProject = useApp((s) => s.currentProject);
  const gitStatus = useApp((s) => s.gitStatus);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentProject) {
      window.lattice
        .listFiles(currentProject.path)
        .then((list) => setFileList(list as string[]))
        .catch(() => setFileList([]));
    } else {
      setFileList([]);
    }
  }, [currentProject]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
  }, [text]);

  const addImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] ?? "";
      setAttachments((prev) => [
        ...prev,
        { type: "image", data: base64, mimeType: file.type || "image/png", name: file.name || "image" },
      ]);
    };
    reader.readAsDataURL(file);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          addImage(file);
        }
      }
    }
  };

  const submit = async () => {
    const message = text.trim();
    if (running || (!message && attachments.length === 0)) return;
    const pendingAttachments = attachments;
    const images = pendingAttachments.map((attachment) => ({
      type: "image" as const,
      data: attachment.data,
      mimeType: attachment.mimeType,
    }));
    setText("");
    setAtQuery(null);
    setAttachments([]);
    try {
      await prompt(message || "Describe this image", images);
    } catch {
      // Keep the user's draft recoverable when native/RPC submission fails.
      setText(message);
      setAttachments(pendingAttachments);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    const cursor = e.target.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const match = before.match(/@([\w./-]*)$/);
    setAtQuery(match ? match[1] : null);
  };

  const pickFile = (path: string) => {
    if (atQuery !== null) {
      const regex = new RegExp(`@${escapeRegex(atQuery)}$`);
      setText((prev) => prev.replace(regex, `@${path} `));
    } else {
      setText((prev) => prev + `@${path} `);
    }
    setAtQuery(null);
    textareaRef.current?.focus();
  };

  const filteredFiles = atQuery !== null && atQuery.length > 0
    ? fileList.filter((f) => f.toLowerCase().includes(atQuery.toLowerCase())).slice(0, 8)
    : atQuery !== null
      ? fileList.slice(0, 8)
      : [];

  const queueCount = steering.length + followUp.length;
  const hasModel = !!sessionState?.model;
  const branch = gitStatus?.branch ?? "main";

  return (
    <div className="composer">
      <div className="composer-inner">
        {/* @file picker dropdown */}
        {atQuery !== null && (
          <div className="at-menu">
            {filteredFiles.length === 0 ? (
              <div className="at-menu-empty">No files match</div>
            ) : (
              filteredFiles.map((f) => (
                <button key={f} className="at-menu-item" onMouseDown={(e) => { e.preventDefault(); pickFile(f); }}>
                  <span className="at-icon">▤</span>
                  <span className="at-path">{f}</span>
                </button>
              ))
            )}
          </div>
        )}

        {/* Project / branch context (Codex-style) */}
        {(currentProject || gitStatus) && (
          <div className="composer-context">
            <span className="composer-project">{currentProject?.name}</span>
            <span className="composer-sep">•</span>
            <span className="composer-branch">{branch}</span>
          </div>
        )}

        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="composer-attachments">
            {attachments.map((a, i) => (
              <span key={i} className="attachment-chip">
                <span className="attachment-thumb" style={{ backgroundImage: `url(data:${a.mimeType};base64,${a.data})` }} />
                <span className="attachment-name">{a.name}</span>
                <button
                  className="attachment-remove"
                  onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="composer-box">
          <button
            className="attach-btn"
            data-tooltip="Attach image"
            aria-label="Attach image"
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              for (const f of Array.from(e.target.files ?? [])) addImage(f);
              e.target.value = "";
            }}
          />
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={t("composer.placeholder")}
            value={text}
            onChange={handleChange}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            autoFocus
          />
          {running ? (
            <button className="stop-btn" onClick={() => void abort()} data-tooltip={`${t("composer.stop")} (Esc)`}>
              <Square size={13} fill="currentColor" strokeWidth={0} aria-hidden="true" />
            </button>
          ) : (
            <button
              className={`send-btn ${(text.trim() || attachments.length > 0) && hasModel ? "active" : ""}`}
              onClick={() => void submit()}
              disabled={(!text.trim() && attachments.length === 0) || !hasModel}
              data-tooltip={hasModel ? `${t("composer.send")} (⏎)` : t("topbar.selectModel")}
            >
              <ArrowUp size={15} strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="composer-hint">
          {running ? (
            <span className="queue">
              {queueCount > 0 ? `${queueCount} ${t("composer.queued")}` : t("composer.working")}
            </span>
          ) : (
            <span />
          )}
          <span className="spacer" />
          {sessionState?.model && (
            <span>
              {sessionState.model.name} · {sessionState.thinkingLevel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
