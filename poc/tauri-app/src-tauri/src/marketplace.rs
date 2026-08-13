// Marketplace bridge commands for the Tauri Desktop Core.
// Bridges Pi's package manager (`pi install/list/remove`) by spawning the
// Pi CLI as a subprocess and returning its stdout.

use std::process::Command;

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
