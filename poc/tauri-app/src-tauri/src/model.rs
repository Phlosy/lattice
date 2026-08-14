// Model/provider commands for the Tauri Desktop Core.
// Bridges Pi RPC model commands and Pi's shared ~/.pi/agent/auth.json store.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::pi::{ensure_spawned, pi_request, restart_pi, PiShared};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub has_auth: bool,
    pub auth_kind: Option<String>,
}

fn auth_path() -> PathBuf {
    crate::paths::pi_agent_dir().join("auth.json")
}

struct AuthLock(PathBuf);

impl Drop for AuthLock {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir(&self.0);
    }
}

fn acquire_auth_lock(path: &Path) -> Result<AuthLock, String> {
    let lock_path = path.with_extension("json.lock");
    let recovery_path = PathBuf::from(format!("{}.recovery", lock_path.display()));
    for _ in 0..150 {
        if recovery_path.exists() {
            std::thread::sleep(std::time::Duration::from_millis(20));
            continue;
        }
        match std::fs::create_dir(&lock_path) {
            Ok(()) => {
                if recovery_path.exists() {
                    let _ = std::fs::remove_dir(&lock_path);
                    std::thread::sleep(std::time::Duration::from_millis(20));
                    continue;
                }
                return Ok(AuthLock(lock_path));
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                let stale = std::fs::metadata(&lock_path)
                    .and_then(|metadata| metadata.modified())
                    .ok()
                    .and_then(|modified| modified.elapsed().ok())
                    .is_some_and(|age| age > std::time::Duration::from_secs(30));
                if stale && std::fs::create_dir(&recovery_path).is_ok() {
                    let still_stale = std::fs::metadata(&lock_path)
                        .and_then(|metadata| metadata.modified())
                        .ok()
                        .and_then(|modified| modified.elapsed().ok())
                        .is_some_and(|age| age > std::time::Duration::from_secs(30));
                    if still_stale {
                        let _ = std::fs::remove_dir_all(&lock_path);
                    }
                    let _ = std::fs::remove_dir(&recovery_path);
                    continue;
                }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            Err(error) => return Err(format!("lock auth: {error}")),
        }
    }
    Err("timed out waiting for Pi auth.json lock".into())
}

fn read_auth(path: &Path) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    if !path.exists() {
        return Ok(serde_json::Map::new());
    }
    let text = std::fs::read_to_string(path).map_err(|e| format!("read auth: {e}"))?;
    serde_json::from_str::<serde_json::Value>(&text)
        .map_err(|e| format!("parse auth: {e}"))?
        .as_object()
        .cloned()
        .ok_or_else(|| "Pi auth.json must contain an object".into())
}

fn read_auth_locked(path: &Path) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    if !path.exists() {
        return Ok(serde_json::Map::new());
    }
    let _lock = acquire_auth_lock(path)?;
    read_auth(path)
}

fn write_api_key(path: &Path, provider: &str, api_key: &str) -> Result<(), String> {
    if provider.is_empty()
        || !provider
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return Err("invalid provider id".into());
    }
    if api_key.trim().is_empty() {
        return Err("API key cannot be empty".into());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir auth: {e}"))?;
    }
    let _lock = acquire_auth_lock(path)?;
    let mut auth = read_auth(path)?;
    auth.insert(
        provider.to_string(),
        serde_json::json!({ "type": "api_key", "key": api_key.trim() }),
    );
    let text = serde_json::to_string_pretty(&auth).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let temp = path.with_extension(format!("json.tmp-{}", std::process::id()));
        std::fs::write(&temp, text).map_err(|e| format!("write auth temp file: {e}"))?;
        std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("chmod auth temp file: {e}"))?;
        std::fs::rename(&temp, path).map_err(|e| format!("replace auth: {e}"))?;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("chmod auth: {e}"))?;
    }
    #[cfg(not(unix))]
    {
        let temp = path.with_extension(format!("json.tmp-{}", std::process::id()));
        std::fs::write(&temp, text).map_err(|e| format!("write auth temp file: {e}"))?;
        if path.exists() {
            std::fs::remove_file(path).map_err(|e| format!("replace auth: {e}"))?;
        }
        std::fs::rename(&temp, path).map_err(|e| format!("replace auth: {e}"))?;
    }
    Ok(())
}

fn provider_display_name(id: &str) -> String {
    match id {
        "openai" => "OpenAI".into(),
        "openai-codex" => "OpenAI Codex".into(),
        "deepseek" => "DeepSeek".into(),
        "anthropic" => "Anthropic".into(),
        "google" => "Google Gemini".into(),
        "openrouter" => "OpenRouter".into(),
        "groq" => "Groq".into(),
        "xai" => "xAI".into(),
        other => other
            .split(['-', '_'])
            .map(|part| {
                let mut chars = part.chars();
                chars
                    .next()
                    .map(|first| first.to_uppercase().collect::<String>() + chars.as_str())
                    .unwrap_or_default()
            })
            .collect::<Vec<_>>()
            .join(" "),
    }
}

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
pub fn get_providers(
    app: AppHandle,
    shared: State<std::sync::Arc<PiShared>>,
) -> Result<Vec<ProviderInfo>, String> {
    let models = get_models(app, shared)?;
    let auth = read_auth_locked(&auth_path())?;
    let mut providers: BTreeMap<String, ProviderInfo> = BTreeMap::new();

    // Keep common providers visible even before authentication so Settings can
    // repair missing credentials instead of rendering an empty panel.
    for id in ["anthropic", "deepseek", "google", "openai", "openrouter"] {
        providers.insert(
            id.into(),
            ProviderInfo {
                id: id.into(),
                name: provider_display_name(id),
                has_auth: false,
                auth_kind: None,
            },
        );
    }

    for (id, credential) in auth {
        let kind = credential
            .get("type")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        providers.insert(
            id.clone(),
            ProviderInfo {
                id: id.clone(),
                name: provider_display_name(&id),
                has_auth: true,
                auth_kind: kind,
            },
        );
    }

    let available: BTreeSet<String> = models
        .iter()
        .filter_map(|model| model.get("provider")?.as_str().map(str::to_string))
        .collect();
    for id in available {
        providers
            .entry(id.clone())
            .and_modify(|provider| provider.has_auth = true)
            .or_insert(ProviderInfo {
                id: id.clone(),
                name: provider_display_name(&id),
                has_auth: true,
                auth_kind: Some("environment".into()),
            });
    }

    Ok(providers.into_values().collect())
}

#[tauri::command]
pub fn login(
    app: AppHandle,
    shared: State<std::sync::Arc<PiShared>>,
    provider: String,
    api_key: String,
) -> Result<bool, String> {
    ensure_spawned(&app, &shared)?;
    let state = pi_request(&shared, serde_json::json!({ "type": "get_state" })).ok();
    let session_file = state
        .as_ref()
        .and_then(|value| value.get("sessionFile"))
        .and_then(|value| value.as_str())
        .map(str::to_string);
    write_api_key(&auth_path(), &provider, &api_key)?;
    restart_pi(&app, &shared, session_file.as_deref())?;
    let _ = app.emit(
        "models-changed",
        serde_json::json!({ "provider": provider }),
    );
    Ok(true)
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

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_auth_path() -> PathBuf {
        std::env::temp_dir().join(format!(
            "lattice-auth-test-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn api_key_write_preserves_other_provider_credentials() {
        let path = temp_auth_path();
        std::fs::write(
            &path,
            r#"{"openai-codex":{"type":"oauth","access":"a","refresh":"r","expires":1}}"#,
        )
        .unwrap();
        write_api_key(&path, "deepseek", "secret").unwrap();
        let value: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(value["deepseek"]["type"], "api_key");
        assert_eq!(value["deepseek"]["key"], "secret");
        assert_eq!(value["openai-codex"]["type"], "oauth");
        assert!(!path.with_extension("json.lock").exists());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn rejects_empty_keys_and_invalid_provider_ids() {
        let path = temp_auth_path();
        assert!(write_api_key(&path, "deepseek", " ").is_err());
        assert!(write_api_key(&path, "../deepseek", "key").is_err());
    }
}
