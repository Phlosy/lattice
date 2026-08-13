// Tauri PoC — Rust Desktop Core spawns and manages a Pi RPC sidecar.
// Verifies: Rust can Start / Prompt / Stream / Abort / Crash-detect the Pi
// process, forwarding agent events to the React (webview) frontend over IPC.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::{Emitter, State};

// Path to Pi's CLI entry, resolved relative to the workspace root (lattice/).
const PI_ENTRY: &str = "node_modules/@earendil-works/pi-coding-agent/dist/cli.js";
const SESSION_DIR: &str = "/tmp/pi-tauri-sessions";

struct PiState(Mutex<Option<Child>>);

fn ensure_spawned(app: &tauri::AppHandle, state: &PiState) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok(());
    }

    let mut child = Command::new("node")
        .arg(PI_ENTRY)
        .arg("--mode")
        .arg("rpc")
        .arg("--session-dir")
        .arg(SESSION_DIR)
        .arg("--approve")
        .current_dir("../../..") // lattice workspace root
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("failed to spawn Pi: {e}"))?;

    eprintln!("[pi] spawned pid={}", child.id());

    let stdout = child.stdout.take().ok_or("no stdout")?;
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
                        let _ = app_handle.emit("pi-event", &v);
                    }
                }
                Err(_) => break,
            }
        }
        // Process stdout closed → emit crash/exit signal.
        let _ = app_handle.emit("pi-exit", ());
    });

    *guard = Some(child);
    Ok(())
}

#[tauri::command]
fn pi_prompt(app: tauri::AppHandle, state: State<PiState>, text: String) -> Result<String, String> {
    eprintln!("[pi] pi_prompt called: {text}");
    ensure_spawned(&app, &state)?;
    eprintln!("[pi] ensure_spawned ok");
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let child = guard.as_mut().ok_or("pi not running")?;
    let stdin = child.stdin.as_mut().ok_or("no stdin")?;
    let cmd = serde_json::json!({ "type": "prompt", "message": text });
    writeln!(stdin, "{cmd}").map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())?;
    Ok("prompt sent".into())
}

#[tauri::command]
fn pi_abort(state: State<PiState>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.as_mut() {
        let stdin = child.stdin.as_mut().ok_or("no stdin")?;
        writeln!(stdin, r#"{{"type":"abort"}}"#).map_err(|e| e.to_string())?;
        stdin.flush().map_err(|e| e.to_string())?;
    }
    Ok("abort sent".into())
}

#[tauri::command]
fn pi_crash(state: State<PiState>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.as_mut() {
        let _ = child.kill(); // SIGKILL to test crash isolation
    }
    *guard = None;
    Ok("pi killed".into())
}

#[tauri::command]
fn pi_status(state: State<PiState>) -> Result<String, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(match guard.as_ref() {
        Some(child) => format!("running (pid={})", child.id()),
        None => "stopped".into(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PiState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![pi_prompt, pi_abort, pi_crash, pi_status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
