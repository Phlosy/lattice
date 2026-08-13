import { useApp } from "../store/useApp";

const KIND_LABEL: Record<string, string> = {
  bash: "Run command",
  write: "Write file",
  edit: "Edit file",
  other: "Tool call",
};

export function PermissionDialog() {
  const permissions = useApp((s) => s.permissions);
  const respond = useApp((s) => s.respondPermission);
  const dismiss = useApp((s) => s.dismissPermission);

  if (permissions.length === 0) return null;
  const req = permissions[0];
  const isBash = req.kind === "bash";

  return (
    <div className="modal-backdrop" onClick={() => dismiss(req.requestId)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className={`perm-kind ${isBash ? "danger" : ""}`}>{KIND_LABEL[req.kind] ?? "Approval"}</span>
          <span className="modal-title">{req.label}</span>
        </div>
        <div className="modal-body">
          <div className="perm-request">
            <div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>Request</label>
              </div>
              <div className="perm-content">{req.command ?? req.filePath ?? req.summary}</div>
            </div>
            <p className="perm-note">
              {isBash
                ? "This command will run in your shell with your user permissions. Review it carefully before allowing."
                : "This will modify files in your workspace."}
            </p>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-danger" onClick={() => respond(req.requestId, "deny-once")}>
            Deny
          </button>
          <button className="btn" onClick={() => respond(req.requestId, "allow-once")}>
            Allow once
          </button>
          <button className="btn" onClick={() => respond(req.requestId, "allow-session")}>
            Allow for session
          </button>
          <button className="btn btn-primary" onClick={() => respond(req.requestId, "allow-always")}>
            Always allow
          </button>
        </div>
      </div>
    </div>
  );
}
