// Recent projects for the Tauri Desktop Core.
// Persists to ~/.lattice/state.json (same shape as the Electron AppState).

use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn state_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    PathBuf::from(home).join(".lattice").join("state.json")
}

fn read_state() -> serde_json::Value {
    if let Ok(content) = fs::read_to_string(state_path()) {
        if let Ok(v) = serde_json::from_str(&content) {
            return v;
        }
    }
    serde_json::json!({})
}

fn write_state(value: &serde_json::Value) {
    let path = state_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&path, serde_json::to_string_pretty(value).unwrap_or_else(|_| "{}".into()));
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn kind_of(path: &str) -> &'static str {
    let git_dir = PathBuf::from(path).join(".git");
    if git_dir.exists() {
        "repo"
    } else {
        "folder"
    }
}

/// Record a project into recents (called by open_project).
pub fn record_project(path: &str) {
    let name = PathBuf::from(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string());
    let kind = kind_of(path);

    let mut state = read_state();
    let mut recent = state["recentProjects"].as_array().cloned().unwrap_or_default();
    recent.retain(|p| p["path"] != path);
    recent.insert(
        0,
        serde_json::json!({
            "id": format!("proj-{path}"),
            "name": name,
            "path": path,
            "kind": kind,
            "lastOpenedAt": now_ms(),
        }),
    );
    recent.truncate(20);
    state["recentProjects"] = serde_json::json!(recent);
    write_state(&state);
}

#[tauri::command]
pub fn get_projects() -> Vec<serde_json::Value> {
    let state = read_state();
    state["recentProjects"].as_array().cloned().unwrap_or_default()
}

#[tauri::command]
pub fn remove_project(path: String) -> Result<(), String> {
    let mut state = read_state();
    let mut recent = state["recentProjects"].as_array().cloned().unwrap_or_default();
    recent.retain(|p| p["path"] != path);
    state["recentProjects"] = serde_json::json!(recent);
    write_state(&state);
    Ok(())
}
