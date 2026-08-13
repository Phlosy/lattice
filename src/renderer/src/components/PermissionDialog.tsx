import { useApp } from "../store/useApp";
import { useT } from "../i18n";

export function PermissionDialog() {
  const t = useT();
  const permissions = useApp((s) => s.permissions);
  const respond = useApp((s) => s.respondPermission);
  const dismiss = useApp((s) => s.dismissPermission);

  if (permissions.length === 0) return null;
  const req = permissions[0];
  const isBash = req.kind === "bash";

  const kindLabel =
    req.kind === "bash"
      ? t("perm.runCommand")
      : req.kind === "write"
        ? t("perm.writeFile")
        : req.kind === "edit"
          ? t("perm.editFile")
          : t("perm.toolCall");

  return (
    <div className="modal-backdrop" onClick={() => dismiss(req.requestId)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className={`perm-kind ${isBash ? "danger" : ""}`}>{kindLabel}</span>
          <span className="modal-title">{req.label}</span>
        </div>
        <div className="modal-body">
          <div className="perm-request">
            <div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>{t("perm.request")}</label>
              </div>
              <div className="perm-content">{req.command ?? req.filePath ?? req.summary}</div>
            </div>
            <p className="perm-note">{isBash ? t("perm.bashNote") : t("perm.fileNote")}</p>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-danger" onClick={() => respond(req.requestId, "deny-once")}>
            {t("perm.deny")}
          </button>
          <button className="btn" onClick={() => respond(req.requestId, "allow-once")}>
            {t("perm.allowOnce")}
          </button>
          <button className="btn" onClick={() => respond(req.requestId, "allow-session")}>
            {t("perm.allowSession")}
          </button>
          <button className="btn btn-primary" onClick={() => respond(req.requestId, "allow-always")}>
            {t("perm.allowAlways")}
          </button>
        </div>
      </div>
    </div>
  );
}
