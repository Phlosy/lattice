// Session commands for the Tauri Desktop Core.
// Pi owns JSONL semantics; Rust lists files and switches the single RPC sidecar.

use std::fs;
use std::path::{Path, PathBuf};

use crate::pi::{ensure_spawned, pi_request, PiShared};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SessionMeta {
    pub file: String,
    pub id: String,
    pub name: Option<String>,
    pub project_id: String,
    pub cwd: String,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: usize,
}

#[tauri::command]
pub fn session_list() -> Result<Vec<SessionMeta>, String> {
    list_sessions_in(&crate::paths::prepare_session_dir()?)
}

pub fn list_sessions_in(session_dir: &Path) -> Result<Vec<SessionMeta>, String> {
    let mut out = Vec::new();
    let entries = match fs::read_dir(session_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(out),
        Err(error) => return Err(format!("read dir: {error}")),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map(|e| e == "jsonl").unwrap_or(false) {
            if let Ok(meta) = parse_session_meta(&path) {
                out.push(meta);
            }
        }
    }
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(out)
}

#[tauri::command]
pub fn session_messages(file: String) -> Result<Vec<serde_json::Value>, String> {
    let file = validate_session_file(&file)?;
    let content = fs::read_to_string(&file).map_err(|e| format!("read: {e}"))?;
    let mut messages = Vec::new();
    for line in content.lines() {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
            if value["type"] == "message" {
                if let Some(message) = value.get("message") {
                    messages.push(message.clone());
                }
            }
        }
    }
    Ok(messages)
}

#[tauri::command]
pub fn get_session_state(
    app: AppHandle,
    shared: State<std::sync::Arc<PiShared>>,
) -> Result<serde_json::Value, String> {
    ensure_spawned(&app, &shared)?;
    pi_request(&shared, serde_json::json!({ "type": "get_state" }))
}

#[tauri::command]
pub fn create_session(
    app: AppHandle,
    shared: State<std::sync::Arc<PiShared>>,
    name: Option<String>,
) -> Result<serde_json::Value, String> {
    ensure_spawned(&app, &shared)?;
    pi_request(&shared, serde_json::json!({ "type": "new_session" }))?;
    if let Some(name) = name.filter(|name| !name.trim().is_empty()) {
        pi_request(
            &shared,
            serde_json::json!({ "type": "set_session_name", "name": name.trim() }),
        )?;
    }
    session_result(&app, &shared, "session-created")
}

#[tauri::command]
pub fn open_session(
    app: AppHandle,
    shared: State<std::sync::Arc<PiShared>>,
    file: String,
) -> Result<serde_json::Value, String> {
    let file = validate_session_file(&file)?;
    ensure_spawned(&app, &shared)?;
    pi_request(
        &shared,
        serde_json::json!({ "type": "switch_session", "sessionPath": file }),
    )?;
    session_result(&app, &shared, "session-created")
}

fn session_result(
    app: &AppHandle,
    shared: &std::sync::Arc<PiShared>,
    event: &str,
) -> Result<serde_json::Value, String> {
    let state = pi_request(shared, serde_json::json!({ "type": "get_state" }))?;
    let result = serde_json::json!({
        "sessionId": state["sessionId"],
        "cwd": state.get("cwd").and_then(|value| value.as_str()).unwrap_or(""),
        "file": state.get("sessionFile"),
        "state": state,
    });
    let _ = app.emit(event, &result);
    Ok(result)
}

#[tauri::command]
pub fn rename_session(
    app: AppHandle,
    shared: State<std::sync::Arc<PiShared>>,
    session_id: String,
    name: String,
) -> Result<bool, String> {
    ensure_spawned(&app, &shared)?;
    let current = pi_request(&shared, serde_json::json!({ "type": "get_state" }))?;
    let original_file = current
        .get("sessionFile")
        .and_then(|value| value.as_str())
        .map(str::to_string);
    let switched = current["sessionId"].as_str() != Some(session_id.as_str());
    if switched && original_file.is_none() {
        return Err(
            "cannot rename an inactive session without an active session file to restore".into(),
        );
    }
    if switched {
        let file = find_session_file(&session_id)?;
        pi_request(
            &shared,
            serde_json::json!({ "type": "switch_session", "sessionPath": file }),
        )?;
    }
    let rename_result = pi_request(
        &shared,
        serde_json::json!({ "type": "set_session_name", "name": name }),
    );
    let restore_result = if switched {
        pi_request(
            &shared,
            serde_json::json!({
                "type": "switch_session",
                "sessionPath": original_file.expect("checked above")
            }),
        )
        .map(|_| ())
    } else {
        Ok(())
    };
    match (rename_result, restore_result) {
        (Ok(_), Ok(())) => Ok(true),
        (Err(rename), Ok(())) => Err(rename),
        (Ok(_), Err(restore)) => Err(format!(
            "session renamed but failed to restore active session: {restore}"
        )),
        (Err(rename), Err(restore)) => Err(format!(
            "rename failed ({rename}) and active session restore failed ({restore})"
        )),
    }
}

fn validate_session_file(file: &str) -> Result<PathBuf, String> {
    let root = crate::paths::prepare_session_dir()?;
    let canonical_root = root
        .canonicalize()
        .map_err(|e| format!("resolve session directory: {e}"))?;
    let path = PathBuf::from(file);
    if path.extension().and_then(|value| value.to_str()) != Some("jsonl") || !path.is_file() {
        return Err("session must be an existing JSONL file".into());
    }
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("resolve session file: {e}"))?;
    if !canonical.starts_with(&canonical_root) {
        return Err("session file is outside the Lattice session directory".into());
    }
    Ok(canonical)
}

#[tauri::command]
pub fn delete_session(app: AppHandle, file: String) -> Result<bool, String> {
    let path = PathBuf::from(&file);
    let parent = path.parent().ok_or("invalid session path")?;
    let expected = crate::paths::prepare_session_dir()?;
    let allowed = parent == expected
        || (parent.canonicalize().ok().is_some()
            && parent.canonicalize().ok() == expected.canonicalize().ok());
    if !allowed || path.extension().and_then(|value| value.to_str()) != Some("jsonl") {
        return Err("refusing to delete a file outside the Lattice session directory".into());
    }
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("delete session: {e}"))?;
    }
    let _ = app.emit("session-deleted", serde_json::json!({ "file": file }));
    Ok(true)
}

fn find_session_file(session_id: &str) -> Result<String, String> {
    session_list()?
        .into_iter()
        .find(|session| session.id == session_id)
        .map(|session| session.file)
        .ok_or_else(|| format!("session not found: {session_id}"))
}

fn parse_session_meta(path: &Path) -> Result<SessionMeta, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut lines = content.lines();
    let first = lines.next().ok_or("empty session file")?;
    let header: serde_json::Value = serde_json::from_str(first).map_err(|e| e.to_string())?;
    let id = header["id"].as_str().unwrap_or("").to_string();
    let cwd = header["cwd"].as_str().unwrap_or("").to_string();
    let created_at = header["timestamp"].as_str().unwrap_or("").to_string();
    let mut updated_at = created_at.clone();
    let mut name = None;
    let mut message_count = 0;
    for line in lines {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
            if value["type"] == "message" {
                message_count += 1;
            } else if value["type"] == "session_info" {
                name = value
                    .get("name")
                    .and_then(|value| value.as_str())
                    .map(str::to_string);
            }
            if let Some(timestamp) = value.get("timestamp").and_then(|value| value.as_str()) {
                updated_at = timestamp.to_string();
            }
        }
    }
    Ok(SessionMeta {
        file: path.to_string_lossy().to_string(),
        id,
        name,
        project_id: String::new(),
        cwd,
        created_at,
        updated_at,
        message_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_name_and_camel_case_metadata() {
        let path =
            std::env::temp_dir().join(format!("lattice-session-{}.jsonl", std::process::id()));
        std::fs::write(
            &path,
            "{\"type\":\"session\",\"id\":\"s1\",\"cwd\":\"/tmp/p\",\"timestamp\":\"2025-01-01T00:00:00Z\"}\n{\"type\":\"session_info\",\"name\":\"Demo\",\"timestamp\":\"2025-01-01T00:00:01Z\"}\n{\"type\":\"message\",\"message\":{\"role\":\"user\"},\"timestamp\":\"2025-01-01T00:00:02Z\"}\n",
        )
        .unwrap();
        let meta = parse_session_meta(&path).unwrap();
        assert_eq!(meta.name.as_deref(), Some("Demo"));
        assert_eq!(meta.message_count, 1);
        let json = serde_json::to_value(meta).unwrap();
        assert_eq!(json["messageCount"], 1);
        assert_eq!(json["createdAt"], "2025-01-01T00:00:00Z");
        let _ = std::fs::remove_file(path);
    }
}
