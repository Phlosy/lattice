// Marketplace bridge commands for the Tauri Desktop Core.
// - pi_list/pi_install/pi_remove: spawn the Pi CLI (text output)
// - ext_list/ext_toggle: structured read/write of Pi's settings.json `packages`

use std::fs;
use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;
use tauri::Manager;

const PI_ENTRY: &str = "node_modules/@earendil-works/pi-coding-agent/dist/cli.js";

fn platform_dir() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => "darwin-arm64",
        ("macos", "x86_64") => "darwin-x64",
        ("linux", "x86_64") => "linux-x64",
        ("linux", "aarch64") => "linux-arm64",
        ("windows", "x86_64") => "windows-x64",
        ("windows", "aarch64") => "windows-arm64",
        _ => "unknown",
    }
}

fn run_pi(app: &tauri::AppHandle, cwd: &str, args: &[&str]) -> Result<String, String> {
    let binary_name = if cfg!(windows) { "pi.exe" } else { "pi" };
    let packaged = app
        .path()
        .resource_dir()
        .ok()
        .map(|path| {
            path.join("pi-sidecar")
                .join(platform_dir())
                .join(binary_name)
        })
        .filter(|path| path.exists());
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("pi-sidecar")
        .join(platform_dir())
        .join(binary_name);

    let mut command = if let Some(binary) = packaged.or_else(|| dev.exists().then_some(dev)) {
        Command::new(binary)
    } else {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let mut command = Command::new("node");
        command.arg(manifest.join("../../..").join(PI_ENTRY));
        command
    };
    let out = command
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("pi: {e}"))?;
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    if !out.status.success() {
        let detail = [stdout.trim(), stderr.trim()]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        return Err(if detail.is_empty() {
            format!("pi command failed with status {}", out.status)
        } else {
            detail
        });
    }
    Ok(stdout)
}

#[tauri::command]
pub fn pi_list(app: tauri::AppHandle, cwd: String) -> Result<String, String> {
    run_pi(&app, &cwd, &["list"])
}

#[tauri::command]
pub fn pi_install(app: tauri::AppHandle, cwd: String, source: String) -> Result<String, String> {
    run_pi(&app, &cwd, &["install", &source, "--approve"])
}

#[tauri::command]
pub fn pi_remove(app: tauri::AppHandle, cwd: String, source: String) -> Result<String, String> {
    run_pi(&app, &cwd, &["remove", &source, "--approve"])
}

#[derive(Serialize, Debug)]
pub struct InstalledPackage {
    pub source: String,
    pub name: String,
    pub location: String,
    pub kinds: Vec<String>,
    pub enabled: bool,
}

fn settings_path() -> PathBuf {
    crate::paths::pi_agent_dir().join("settings.json")
}

struct SettingsLock(PathBuf);

impl Drop for SettingsLock {
    fn drop(&mut self) {
        let _ = fs::remove_dir(&self.0);
    }
}

fn acquire_settings_lock(path: &std::path::Path) -> Result<SettingsLock, String> {
    let lock_path = path.with_extension("json.lock");
    let recovery_path = PathBuf::from(format!("{}.recovery", lock_path.display()));
    for _ in 0..150 {
        if recovery_path.exists() {
            std::thread::sleep(std::time::Duration::from_millis(20));
            continue;
        }
        match fs::create_dir(&lock_path) {
            Ok(()) => {
                if recovery_path.exists() {
                    let _ = fs::remove_dir(&lock_path);
                    std::thread::sleep(std::time::Duration::from_millis(20));
                    continue;
                }
                return Ok(SettingsLock(lock_path));
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                let stale = fs::metadata(&lock_path)
                    .and_then(|metadata| metadata.modified())
                    .ok()
                    .and_then(|modified| modified.elapsed().ok())
                    .is_some_and(|age| age > std::time::Duration::from_secs(30));
                if stale && fs::create_dir(&recovery_path).is_ok() {
                    let still_stale = fs::metadata(&lock_path)
                        .and_then(|metadata| metadata.modified())
                        .ok()
                        .and_then(|modified| modified.elapsed().ok())
                        .is_some_and(|age| age > std::time::Duration::from_secs(30));
                    if still_stale {
                        let _ = fs::remove_dir_all(&lock_path);
                    }
                    let _ = fs::remove_dir(&recovery_path);
                    continue;
                }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            Err(error) => return Err(format!("lock Pi settings: {error}")),
        }
    }
    Err("timed out waiting for Pi settings lock".into())
}

fn package_source(value: &serde_json::Value) -> Option<&str> {
    value
        .as_str()
        .or_else(|| value.get("source").and_then(serde_json::Value::as_str))
}

fn package_sources(value: &serde_json::Value) -> Vec<String> {
    let packages = value
        .get("packages")
        .and_then(|package| package.as_array())
        .cloned()
        .unwrap_or_default();
    packages
        .iter()
        .filter_map(|package| package_source(package).map(str::to_string))
        .collect()
}

#[tauri::command]
pub fn ext_list() -> Result<Vec<InstalledPackage>, String> {
    let path = settings_path();
    if !path.exists() {
        return Ok(vec![]);
    }
    let _lock = acquire_settings_lock(&path)?;
    let content = fs::read_to_string(&path).map_err(|e| format!("read settings: {e}"))?;
    let value: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("parse settings: {e}"))?;
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
                kinds: vec![
                    "extension".into(),
                    "skill".into(),
                    "theme".into(),
                    "prompt".into(),
                ],
                enabled: true,
            }
        })
        .collect();
    Ok(out)
}

fn update_package_entry(
    value: &mut serde_json::Value,
    source: &str,
    enabled: bool,
) -> Result<(), String> {
    let packages = value
        .get_mut("packages")
        .and_then(serde_json::Value::as_array_mut);
    if packages.is_none() {
        value["packages"] = serde_json::json!([]);
    }
    let packages = value["packages"]
        .as_array_mut()
        .ok_or("packages must be an array")?;
    if enabled {
        if !packages
            .iter()
            .any(|entry| package_source(entry) == Some(source))
        {
            packages.push(serde_json::Value::String(source.to_string()));
        }
    } else {
        packages.retain(|entry| package_source(entry) != Some(source));
    }
    Ok(())
}

#[tauri::command]
pub fn ext_toggle(source: String, enabled: bool) -> Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir settings: {e}"))?;
    }
    let _lock = acquire_settings_lock(&path)?;
    let mut value: serde_json::Value = if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| format!("read settings: {e}"))?;
        serde_json::from_str(&content).map_err(|e| format!("parse settings: {e}"))?
    } else {
        serde_json::json!({})
    };

    update_package_entry(&mut value, &source, enabled)?;

    let content = serde_json::to_string_pretty(&value).map_err(|e| format!("serialize: {e}"))?;
    let temp = path.with_extension(format!("json.tmp-{}", std::process::id()));
    fs::write(&temp, content).map_err(|e| format!("write settings temp file: {e}"))?;
    #[cfg(windows)]
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("replace settings: {e}"))?;
    }
    fs::rename(&temp, &path).map_err(|e| format!("replace settings: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn toggling_preserves_filtered_package_objects() {
        let mut value = serde_json::json!({
            "packages": [
                {
                    "source": "npm:filtered",
                    "extensions": ["extensions/*.ts"],
                    "skills": []
                },
                "npm:plain"
            ]
        });
        update_package_entry(&mut value, "npm:plain", false).unwrap();
        assert_eq!(value["packages"].as_array().unwrap().len(), 1);
        assert_eq!(value["packages"][0]["source"], "npm:filtered");
        assert_eq!(value["packages"][0]["skills"], serde_json::json!([]));
        update_package_entry(&mut value, "npm:new", true).unwrap();
        assert_eq!(value["packages"][1], "npm:new");
    }
}
