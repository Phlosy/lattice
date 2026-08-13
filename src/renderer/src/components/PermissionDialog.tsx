import { useApp } from "../store/useApp";

export function PermissionDialog() {
  const permissions = useApp((s) => s.permissions);
  const respond = useApp((s) => s.respondPermission);
  const dismiss = useApp((s) => s.dismissPermission);

  if (permissions.length === 0) return null;
  const req = permissions[0];

  return (
    <div className="modal-backdrop" onClick={() => dismiss(req.requestId)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Allow {req.label}?</span>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>{req.summary}</label>
            {req.command && <div className="command-preview">{req.command}</div>}
            {req.filePath && <div className="command-preview">{req.filePath}</div>}
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 12 }}>
            This tool can modify your files and run commands. Review the action above before allowing.
          </p>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={() => respond(req.requestId, "deny-once")}>
            Deny
          </button>
          <button className="btn" onClick={() => respond(req.requestId, "allow-once")}>
            Allow once
          </button>
          <button className="btn btn-primary" onClick={() => respond(req.requestId, "allow-session")}>
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
