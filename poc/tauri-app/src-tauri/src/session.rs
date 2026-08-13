// Session commands for the Tauri Desktop Core.
// Reads Pi's JSONL session files directly (Rust equivalent of SessionManager),
// so session listing/messages work without a live Pi RPC process.

use std::fs;
use std::path::Path;

use serde::Serialize;

#[derive(Serialize, Debug)]
pub struct SessionMeta {
    pub file: String,
    pub id: String,
    pub cwd: String,
    pub created_at: String,
    pub message_count: usize,
}

#[tauri::command]
pub fn session_list(session_dir: String) -> Result<Vec<SessionMeta>, String> {
    let mut out = Vec::new();
    let entries = fs::read_dir(&session_dir).map_err(|e| format!("read dir: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map(|e| e == "jsonl").unwrap_or(false) {
            if let Ok(meta) = parse_session_meta(&path) {
                out.push(meta);
            }
        }
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

#[tauri::command]
pub fn session_messages(file: String) -> Result<Vec<serde_json::Value>, String> {
    let content = fs::read_to_string(&file).map_err(|e| format!("read: {e}"))?;
    let mut msgs = Vec::new();
    for line in content.lines() {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
            if v["type"] == "message" {
                if let Some(m) = v.get("message") {
                    msgs.push(m.clone());
                }
            }
        }
    }
    Ok(msgs)
}

fn parse_session_meta(path: &Path) -> Result<SessionMeta, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let first = content.lines().next().ok_or("empty session file")?;
    let v: serde_json::Value = serde_json::from_str(first).map_err(|e| e.to_string())?;
    let id = v["id"].as_str().unwrap_or("").to_string();
    let cwd = v["cwd"].as_str().unwrap_or("").to_string();
    let created_at = v["timestamp"].as_str().unwrap_or("").to_string();
    let message_count = content
        .lines()
        .filter(|l| l.contains("\"type\":\"message\""))
        .count();
    Ok(SessionMeta {
        file: path.to_string_lossy().to_string(),
        id,
        cwd,
        created_at,
        message_count,
    })
}
