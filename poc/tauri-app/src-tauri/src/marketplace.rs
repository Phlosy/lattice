// Marketplace bridge commands for the Tauri Desktop Core.
// - pi_list/pi_install/pi_remove: spawn the Pi CLI (text output)
// - ext_list/ext_toggle: structured read/write of Pi's settings.json `packages`

use std::fs;
use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;

const PI_ENTRY: &str = "node_modules/@earendil-works/pi-coding-agent/dist/cli.js";
const WORKSPACE: &str = "../../.."; // lattice workspace root

fn run_pi(args: &[&str]) -> Result<String, String> {
    let out = Command::new("node")
        .arg(PI_ENTRY)
        .args(args)
        .current_dir(WORKSPACE)
        .output()
        .map_err(|e| format!("pi: {e}"))?;
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    if !out.status.success() && stdout.is_empty() {
        return Err(if stderr.is_empty() { "pi command failed".into() } else { stderr });
    }
    Ok(stdout)
}

#[tauri::command]
pub fn pi_list() -> Result<String, String> {
    run_pi(&["list"])
}

#[tauri::command]
pub fn pi_install(source: String) -> Result<String, String> {
    run_pi(&["install", &source, "--approve"])
}

#[tauri::command]
pub fn pi_remove(source: String) -> Result<String, String> {
    run_pi(&["remove", &source, "--approve"])
}

#[derive(Serialize, Debug)]
pub struct InstalledPackage {
    pub source: String,
    pub name: String,
    pub location: String,
    pub enabled: bool,
}

fn settings_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    PathBuf::from(home).join(".pi/agent/settings.json")
}

fn package_sources(value: &serde_json::Value) -> Vec<String> {
    let packages = value.get("packages").and_then(|p| p.as_array()).cloned().unwrap_or_default();
    packages
        .iter()
        .filter_map(|p| {
            if let Some(s) = p.as_str() {
                Some(s.to_string())
            } else {
                p.get("source").and_then(|s| s.as_str()).map(|s| s.to_string())
            }
        })
        .collect()
}

#[tauri::command]
pub fn ext_list() -> Result<Vec<InstalledPackage>, String> {
    let path = settings_path();
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("read settings: {e}"))?;
    let value: serde_json::Value = serde_json::from_str(&content).map_err(|e| format!("parse settings: {e}"))?;
    let out = package_sources(&value)
        .into_iter()
        .map(|source| {
            let name = source
                .trim_start_matches("npm:")
                .trim_start_matches("git:")
                .to_string();
            InstalledPackage {
                source,
                name,
                location: "user".into(),
                enabled: true,
            }
        })
        .collect();
    Ok(out)
}

#[tauri::command]
pub fn ext_toggle(source: String, enabled: bool) -> Result<(), String> {
    let path = settings_path();
    let mut value: serde_json::Value = if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| format!("read settings: {e}"))?;
        serde_json::from_str(&content).map_err(|e| format!("parse settings: {e}"))?
    } else {
        serde_json::json!({})
    };

    let mut sources = package_sources(&value);
    if enabled {
        if !sources.contains(&source) {
            sources.push(source);
        }
    } else {
        sources.retain(|s| s != &source);
    }
    value["packages"] = serde_json::json!(sources);

    let content = serde_json::to_string_pretty(&value).map_err(|e| format!("serialize: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("write settings: {e}"))?;
    Ok(())
}
