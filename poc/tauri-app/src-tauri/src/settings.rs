// Settings commands for the Tauri Desktop Core.
// Persists the complete renderer AppSettings shape to ~/.lattice/tauri-settings.json.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub locale: String,
    pub font_size: u8,
    pub accent: String,
    pub sandbox_mode: String,
    pub auto_approve_read_only: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            theme: "dark".into(),
            locale: "en".into(),
            font_size: 13,
            accent: "#4f8cff".into(),
            sandbox_mode: "none".into(),
            auto_approve_read_only: true,
        }
    }
}

fn settings_path() -> PathBuf {
    crate::paths::home_dir()
        .join(".lattice")
        .join("tauri-settings.json")
}

fn load_from(path: &std::path::Path) -> Result<Settings, String> {
    if !path.exists() {
        return Ok(Settings::default());
    }
    let text = std::fs::read_to_string(path).map_err(|e| format!("read settings: {e}"))?;
    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("parse settings: {e}"))?;
    // Merge old two-field files and future partial files over defaults.
    merge_patch(Settings::default(), value)
}

fn merge_patch(current: Settings, patch: serde_json::Value) -> Result<Settings, String> {
    let patch = patch
        .as_object()
        .ok_or_else(|| "settings patch must be an object".to_string())?;
    let mut value = serde_json::to_value(current).map_err(|e| e.to_string())?;
    let target = value
        .as_object_mut()
        .ok_or_else(|| "invalid settings state".to_string())?;
    for (key, value) in patch {
        if target.contains_key(key) {
            target.insert(key.clone(), value.clone());
        }
    }
    let settings: Settings =
        serde_json::from_value(value).map_err(|e| format!("invalid settings: {e}"))?;
    validate(&settings)?;
    Ok(settings)
}

fn validate(settings: &Settings) -> Result<(), String> {
    if !matches!(settings.theme.as_str(), "dark" | "light") {
        return Err("theme must be dark or light".into());
    }
    if !matches!(settings.locale.as_str(), "en" | "zh") {
        return Err("locale must be en or zh".into());
    }
    if !(11..=18).contains(&settings.font_size) {
        return Err("fontSize must be between 11 and 18".into());
    }
    if !matches!(settings.sandbox_mode.as_str(), "none" | "docker") {
        return Err("sandboxMode must be none or docker".into());
    }
    if !settings.accent.starts_with('#') || settings.accent.len() != 7 {
        return Err("accent must be a #RRGGBB color".into());
    }
    Ok(())
}

#[tauri::command]
pub fn get_settings() -> Result<Settings, String> {
    load_from(&settings_path())
}

#[tauri::command]
pub fn set_settings(patch: serde_json::Value) -> Result<Settings, String> {
    let path = settings_path();
    let settings = merge_patch(load_from(&path)?, patch)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let text = serde_json::to_string_pretty(&settings).map_err(|e| format!("serialize: {e}"))?;
    std::fs::write(&path, text).map_err(|e| format!("write settings: {e}"))?;
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partial_patch_preserves_other_fields_and_uses_camel_case() {
        let next = merge_patch(
            Settings::default(),
            serde_json::json!({ "locale": "zh", "fontSize": 16 }),
        )
        .unwrap();
        assert_eq!(next.locale, "zh");
        assert_eq!(next.font_size, 16);
        assert_eq!(next.theme, "dark");
        assert!(serde_json::to_value(next)
            .unwrap()
            .get("fontSize")
            .is_some());
    }

    #[test]
    fn invalid_patch_is_rejected() {
        assert!(merge_patch(Settings::default(), serde_json::json!({ "fontSize": 99 })).is_err());
    }

    #[test]
    fn old_two_field_file_merges_over_defaults() {
        let next = merge_patch(
            Settings::default(),
            serde_json::json!({ "theme": "light", "locale": "zh" }),
        )
        .unwrap();
        assert_eq!(next.theme, "light");
        assert_eq!(next.font_size, 13);
        assert!(next.auto_approve_read_only);
    }
}
