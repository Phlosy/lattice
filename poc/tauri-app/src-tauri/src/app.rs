#[tauri::command]
pub fn app_info(app: tauri::AppHandle) -> serde_json::Value {
    let package = app.package_info();
    serde_json::json!({
        "name": package.name,
        "version": package.version.to_string(),
        "platform": std::env::consts::OS,
    })
}

/// Report the Desktop Core's actual runtime capabilities (single source of truth
/// for local capability negotiation).
#[tauri::command]
pub fn runtime_capabilities() -> serde_json::Value {
    serde_json::json!({
        "chat": true,
        "sessions": true,
        "sessionResume": true,
        "filesystem": true,
        "git": true,
        "shell": true,
        "pty": cfg!(desktop),
        "skills": true,
        "extensions": true,
        "subagents": true,
        "remoteFilesystem": false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capabilities_report_pty_on_desktop_only() {
        let caps = runtime_capabilities();
        assert_eq!(caps["pty"], cfg!(desktop));
        assert_eq!(caps["filesystem"], true);
        assert_eq!(caps["remoteFilesystem"], false);
    }
}
