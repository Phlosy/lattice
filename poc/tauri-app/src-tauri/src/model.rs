// Model commands for the Tauri Desktop Core.
// Bridges Pi RPC get_available_models / set_model / set_thinking_level.

use tauri::{AppHandle, State};

use crate::pi::{ensure_spawned, pi_request, PiShared};

#[tauri::command]
pub fn get_models(
    app: AppHandle,
    shared: State<std::sync::Arc<PiShared>>,
) -> Result<Vec<serde_json::Value>, String> {
    ensure_spawned(&app, &shared)?;
    let data = pi_request(
        &shared,
        serde_json::json!({ "type": "get_available_models" }),
    )?;
    let models = data
        .get("models")
        .cloned()
        .unwrap_or_else(|| serde_json::json!([]));
    serde_json::from_value(models).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_model(
    app: AppHandle,
    shared: State<std::sync::Arc<PiShared>>,
    provider: String,
    model_id: String,
) -> Result<serde_json::Value, String> {
    ensure_spawned(&app, &shared)?;
    pi_request(
        &shared,
        serde_json::json!({ "type": "set_model", "provider": provider, "modelId": model_id }),
    )
}

#[tauri::command]
pub fn set_thinking_level(
    app: AppHandle,
    shared: State<std::sync::Arc<PiShared>>,
    level: String,
) -> Result<(), String> {
    ensure_spawned(&app, &shared)?;
    pi_request(
        &shared,
        serde_json::json!({ "type": "set_thinking_level", "level": level }),
    )?;
    Ok(())
}
