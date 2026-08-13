// Settings commands for the Tauri Desktop Core.
// Persists app settings (theme/locale) to ~/.lattice/tauri-settings.json.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct Settings {
    pub theme: String,  // "dark" | "light"
    pub locale: String, // "en" | "zh"
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            theme: "dark".into(),
            locale: "en".into(),
        }
    }
}

fn settings_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    PathBuf::from(home)
        .join(".lattice")
        .join("tauri-settings.json")
}

#[tauri::command]
pub fn get_settings() -> Result<Settings, String> {
    let path = settings_path();
    if path.exists() {
        let s = std::fs::read_to_string(&path).map_err(|e| format!("read settings: {e}"))?;
        serde_json::from_str(&s).map_err(|e| format!("parse settings: {e}"))
    } else {
        Ok(Settings::default())
    }
}

#[tauri::command]
pub fn set_settings(settings: Settings) -> Result<Settings, String> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let s = serde_json::to_string_pretty(&settings).map_err(|e| format!("serialize: {e}"))?;
    std::fs::write(&path, s).map_err(|e| format!("write settings: {e}"))?;
    Ok(settings)
}
