// Pi RPC sidecar management — spawn, send fire-and-forget commands, and
// request/response commands (used by model/session queries). Shared between
// the agent commands and the model commands via Tauri managed state.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};

use tauri::{Emitter, Manager, State};

pub const PI_ENTRY: &str = "node_modules/@earendil-works/pi-coding-agent/dist/cli.js";
pub const SESSION_DIR: &str = "/tmp/pi-tauri-sessions";
const EXTENSION_REL: &str = "poc/tauri-app/extensions/permission-gate.ts";

/// Platform directory used by scripts/build-pi-sidecar.sh.
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

fn pi_bin_name() -> &'static str {
    if cfg!(windows) { "pi.exe" } else { "pi" }
}

/// Dev-mode bundled sidecar at <src-tauri>/pi-sidecar/<platform>/pi.
fn dev_bundled_pi() -> Option<PathBuf> {
    let p = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("pi-sidecar")
        .join(platform_dir())
        .join(pi_bin_name());
    p.exists().then_some(p)
}

pub struct PiShared {
    child: Mutex<Option<Child>>,
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<serde_json::Value>>>>,
    counter: AtomicU32,
}

impl PiShared {
    pub fn new() -> Self {
        PiShared {
            child: Mutex::new(None),
            pending: Arc::new(Mutex::new(HashMap::new())),
            counter: AtomicU32::new(0),
        }
    }
}

pub fn ensure_spawned(app: &tauri::AppHandle, shared: &PiShared) -> Result<(), String> {
    let mut guard = shared.child.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok(());
    }

    // Resolve the sidecar: packaged resource → dev bundled → node fallback.
    let resource_bin = app
        .path()
        .resource_dir()
        .ok()
        .map(|r| r.join("pi-sidecar").join(platform_dir()).join(pi_bin_name()))
        .filter(|p| p.exists());

    let (mut child, extension) = if let Some(bin) = resource_bin.or_else(dev_bundled_pi) {
        let dir = bin.parent().map(|d| d.to_path_buf()).unwrap_or_default();
        let ext = dir.join("extensions").join("permission-gate.ts");
        let mut c = Command::new(&bin);
        c.current_dir("../../.."); // lattice workspace root (matches node fallback)
        (c, ext.to_string_lossy().to_string())
    } else {
        let mut c = Command::new("node");
        c.arg(PI_ENTRY).current_dir("../../.."); // lattice workspace root
        (c, EXTENSION_REL.to_string())
    };

    let mut child = child
        .arg("--mode")
        .arg("rpc")
        .arg("--session-dir")
        .arg(SESSION_DIR)
        .arg("--approve")
        .arg("--extension")
        .arg(&extension)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("failed to spawn Pi: {e}"))?;

    eprintln!("[pi] spawned pid={} ext={}", child.id(), extension);

    let stdout = child.stdout.take().ok_or("no stdout")?;
    let app_handle = app.clone();
    let pending = Arc::clone(&shared.pending);
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
                        if v["type"] == "response" {
                            if let Some(id) = v["id"].as_str() {
                                if let Some(tx) = pending.lock().unwrap().remove(id) {
                                    let _ = tx.send(v["data"].clone());
                                }
                            }
                        } else if v["type"] == "extension_ui_request" {
                            let _ = app_handle.emit("ui-request", &v);
                        } else {
                            let _ = app_handle.emit("pi-event", &v);
                        }
                    }
                }
                Err(_) => break,
            }
        }
        let _ = app_handle.emit("pi-exit", ());
    });

    *guard = Some(child);
    Ok(())
}

/// Fire-and-forget command (prompt/abort/respond) — no response awaited.
pub fn pi_send(shared: &PiShared, command: serde_json::Value) -> Result<(), String> {
    let mut guard = shared.child.lock().map_err(|e| e.to_string())?;
    let child = guard.as_mut().ok_or("pi not running")?;
    let stdin = child.stdin.as_mut().ok_or("no stdin")?;
    writeln!(stdin, "{command}").map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// Request/response command (get_state/get_available_models/set_model/…).
pub fn pi_request(shared: &PiShared, command: serde_json::Value) -> Result<serde_json::Value, String> {
    let id = format!("req_{}", shared.counter.fetch_add(1, Ordering::SeqCst));
    let (tx, rx) = mpsc::channel();
    shared
        .pending
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id.clone(), tx);

    let mut cmd = command;
    if let serde_json::Value::Object(ref mut obj) = cmd {
        obj.insert("id".to_string(), serde_json::json!(id));
    }

    {
        let mut guard = shared.child.lock().map_err(|e| e.to_string())?;
        let child = guard.as_mut().ok_or("pi not running")?;
        let stdin = child.stdin.as_mut().ok_or("no stdin")?;
        writeln!(stdin, "{cmd}").map_err(|e| e.to_string())?;
        stdin.flush().map_err(|e| e.to_string())?;
    }

    rx.recv_timeout(std::time::Duration::from_secs(60))
        .map_err(|e| format!("pi request timeout: {e}"))
}

// ---- Tauri commands ----

#[tauri::command]
pub fn pi_prompt(app: tauri::AppHandle, shared: State<PiShared>, text: String) -> Result<String, String> {
    ensure_spawned(&app, &shared)?;
    pi_send(&shared, serde_json::json!({ "type": "prompt", "message": text }))?;
    Ok("prompt sent".into())
}

#[tauri::command]
pub fn pi_steer(app: tauri::AppHandle, shared: State<PiShared>, message: String) -> Result<String, String> {
    ensure_spawned(&app, &shared)?;
    pi_send(&shared, serde_json::json!({ "type": "steer", "message": message }))?;
    Ok("steer sent".into())
}

#[tauri::command]
pub fn pi_follow_up(app: tauri::AppHandle, shared: State<PiShared>, message: String) -> Result<String, String> {
    ensure_spawned(&app, &shared)?;
    pi_send(&shared, serde_json::json!({ "type": "follow_up", "message": message }))?;
    Ok("follow_up sent".into())
}

#[tauri::command]
pub fn pi_abort(app: tauri::AppHandle, shared: State<PiShared>) -> Result<String, String> {
    ensure_spawned(&app, &shared)?;
    pi_send(&shared, serde_json::json!({ "type": "abort" }))?;
    Ok("abort sent".into())
}

#[tauri::command]
pub fn pi_respond_ui(shared: State<PiShared>, id: String, confirmed: bool) -> Result<(), String> {
    pi_send(
        &shared,
        serde_json::json!({ "type": "extension_ui_response", "id": id, "confirmed": confirmed }),
    )
}

#[tauri::command]
pub fn pi_crash(shared: State<PiShared>) -> Result<String, String> {
    let mut guard = shared.child.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.as_mut() {
        let _ = child.kill();
    }
    *guard = None;
    Ok("pi killed".into())
}

#[tauri::command]
pub fn pi_status(shared: State<PiShared>) -> Result<String, String> {
    let guard = shared.child.lock().map_err(|e| e.to_string())?;
    Ok(match guard.as_ref() {
        Some(child) => format!("running (pid={})", child.id()),
        None => "stopped".into(),
    })
}
