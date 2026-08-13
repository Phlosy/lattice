// Pi RPC sidecar management — lifecycle state machine, spawn, fire-and-forget
// commands, and request/response commands. The sidecar runs as a standalone
// Bun-compiled binary (bundled) with a Node fallback for development.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};

use tauri::{Emitter, Manager, State};

pub const PI_ENTRY: &str = "node_modules/@earendil-works/pi-coding-agent/dist/cli.js";
pub const SESSION_DIR: &str = "/tmp/pi-tauri-sessions";
const EXTENSION_REL: &str = "poc/tauri-app/extensions/permission-gate.ts";
const MAX_RESTARTS: u32 = 3;

/// Runtime lifecycle states.
#[repr(u32)]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PiState {
    Stopped = 0,
    Starting = 1,
    Ready = 2,
    Busy = 3,
    Crashed = 4,
    Restarting = 5,
    Failed = 6,
    Stopping = 7,
}

impl PiState {
    pub fn as_str(self) -> &'static str {
        match self {
            PiState::Stopped => "STOPPED",
            PiState::Starting => "STARTING",
            PiState::Ready => "READY",
            PiState::Busy => "BUSY",
            PiState::Crashed => "CRASHED",
            PiState::Restarting => "RESTARTING",
            PiState::Failed => "FAILED",
            PiState::Stopping => "STOPPING",
        }
    }
    fn from_u32(v: u32) -> PiState {
        match v {
            1 => PiState::Starting,
            2 => PiState::Ready,
            3 => PiState::Busy,
            4 => PiState::Crashed,
            5 => PiState::Restarting,
            6 => PiState::Failed,
            7 => PiState::Stopping,
            _ => PiState::Stopped,
        }
    }
}

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
    if cfg!(windows) {
        "pi.exe"
    } else {
        "pi"
    }
}

/// Dev-mode bundled sidecar at <src-tauri>/pi-sidecar/<platform>/pi.
fn dev_bundled_pi() -> Option<PathBuf> {
    let p = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("pi-sidecar")
        .join(platform_dir())
        .join(pi_bin_name());
    p.exists().then_some(p)
}

/// Shared sidecar state. Managed as `Arc<PiShared>` so the stdout reader thread
/// can detect crashes and trigger restarts.
pub struct PiShared {
    child: Mutex<Option<Child>>,
    pending: Mutex<HashMap<String, mpsc::Sender<serde_json::Value>>>,
    counter: AtomicU32,
    state: AtomicU32,
    stopping: AtomicBool,
    restart_count: AtomicU32,
    max_restarts: u32,
}

impl PiShared {
    pub fn new() -> Self {
        PiShared {
            child: Mutex::new(None),
            pending: Mutex::new(HashMap::new()),
            counter: AtomicU32::new(0),
            state: AtomicU32::new(PiState::Stopped as u32),
            stopping: AtomicBool::new(false),
            restart_count: AtomicU32::new(0),
            max_restarts: MAX_RESTARTS,
        }
    }

    fn set_state(&self, s: PiState) {
        self.state.store(s as u32, Ordering::SeqCst);
    }

    pub fn get_state(&self) -> PiState {
        PiState::from_u32(self.state.load(Ordering::SeqCst))
    }

    fn emit_state(&self, app: &tauri::AppHandle, s: PiState) {
        self.set_state(s);
        let _ = app.emit("pi-state", serde_json::json!({ "state": s.as_str() }));
    }
}

impl Drop for PiShared {
    fn drop(&mut self) {
        self.stopping.store(true, Ordering::SeqCst);
        if let Ok(mut guard) = self.child.lock() {
            if let Some(child) = guard.as_mut() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

/// Spawn the sidecar process and attach the stdout reader thread. Assumes the
/// child slot is empty and the state machine already transitioned to Starting.
fn spawn_pi(app: &tauri::AppHandle, shared: &Arc<PiShared>) -> Result<(), String> {
    // Resolve the sidecar: packaged resource → dev bundled → node fallback.
    let resource_bin = app
        .path()
        .resource_dir()
        .ok()
        .map(|r| {
            r.join("pi-sidecar")
                .join(platform_dir())
                .join(pi_bin_name())
        })
        .filter(|p| p.exists());

    let (mut cmd, extension) = if let Some(bin) = resource_bin.or_else(dev_bundled_pi) {
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

    let mut child = cmd
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
    *shared.child.lock().map_err(|e| e.to_string())? = Some(child);

    shared.emit_state(app, PiState::Ready);

    // stdout reader thread — also owns crash detection + restart.
    let app_handle = app.clone();
    let shared = Arc::clone(shared);
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
                        let ty = v["type"].as_str().unwrap_or("");
                        match ty {
                            "response" => {
                                if let Some(id) = v["id"].as_str() {
                                    if let Some(tx) = shared.pending.lock().unwrap().remove(id) {
                                        let _ = tx.send(v["data"].clone());
                                    }
                                }
                            }
                            "extension_ui_request" => {
                                let _ = app_handle.emit("ui-request", &v);
                            }
                            "agent_settled" => {
                                if shared.get_state() == PiState::Busy {
                                    shared.emit_state(&app_handle, PiState::Ready);
                                }
                                let _ = app_handle.emit("pi-event", &v);
                            }
                            _ => {
                                let _ = app_handle.emit("pi-event", &v);
                            }
                        }
                    }
                }
                Err(_) => break,
            }
        }
        // stdout closed → the sidecar exited.
        on_sidecar_exit(&app_handle, &shared);
    });

    Ok(())
}

/// Called when the sidecar's stdout closes. Distinguishes an intentional stop
/// from a crash, and triggers a bounded restart on crash.
fn on_sidecar_exit(app: &tauri::AppHandle, shared: &Arc<PiShared>) {
    let intentional = shared.stopping.load(Ordering::SeqCst);
    if intentional {
        shared.emit_state(app, PiState::Stopped);
        eprintln!("[pi] stopped");
        return;
    }

    // Unexpected exit → crash.
    shared.emit_state(app, PiState::Crashed);
    let _ = app.emit("pi-crash", ());
    eprintln!("[pi] crashed — attempting restart");

    // Clear the dead child handle so ensure_spawned can spawn a fresh one.
    {
        let mut guard = shared.child.lock().unwrap();
        if let Some(child) = guard.as_mut() {
            let _ = child.wait();
        }
        *guard = None;
    }

    let n = shared.restart_count.fetch_add(1, Ordering::SeqCst) + 1;
    if n > shared.max_restarts {
        shared.emit_state(app, PiState::Failed);
        eprintln!("[pi] restart limit reached — FAILED");
        return;
    }

    shared.emit_state(app, PiState::Restarting);
    shared.emit_state(app, PiState::Starting);
    if let Err(e) = spawn_pi(app, shared) {
        eprintln!("[pi] restart failed: {e}");
        shared.emit_state(app, PiState::Failed);
    }
}

pub fn ensure_spawned(app: &tauri::AppHandle, shared: &Arc<PiShared>) -> Result<(), String> {
    if shared.stopping.load(Ordering::SeqCst) {
        return Ok(());
    }
    if shared.get_state() == PiState::Failed {
        return Err("pi runtime failed (restart limit reached)".into());
    }
    {
        let guard = shared.child.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok(());
        }
    }
    shared.emit_state(app, PiState::Starting);
    spawn_pi(app, shared)
}

/// Fire-and-forget command (prompt/abort/respond) — no response awaited.
pub fn pi_send(shared: &Arc<PiShared>, command: &serde_json::Value) -> Result<(), String> {
    let mut guard = shared.child.lock().map_err(|e| e.to_string())?;
    let child = guard.as_mut().ok_or("pi not running")?;
    let stdin = child.stdin.as_mut().ok_or("no stdin")?;
    writeln!(stdin, "{command}").map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())?;
    drop(guard);

    if command["type"] == "prompt" && shared.get_state() == PiState::Ready {
        shared.set_state(PiState::Busy);
    }
    Ok(())
}

/// Request/response command (get_state/get_available_models/set_model/…).
pub fn pi_request(
    shared: &Arc<PiShared>,
    command: serde_json::Value,
) -> Result<serde_json::Value, String> {
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

type SharedState<'a> = State<'a, Arc<PiShared>>;

#[tauri::command]
pub fn pi_prompt(
    app: tauri::AppHandle,
    shared: SharedState,
    text: String,
) -> Result<String, String> {
    ensure_spawned(&app, &shared)?;
    pi_send(
        &shared,
        &serde_json::json!({ "type": "prompt", "message": text }),
    )?;
    Ok("prompt sent".into())
}

#[tauri::command]
pub fn pi_steer(
    app: tauri::AppHandle,
    shared: SharedState,
    message: String,
) -> Result<String, String> {
    ensure_spawned(&app, &shared)?;
    pi_send(
        &shared,
        &serde_json::json!({ "type": "steer", "message": message }),
    )?;
    Ok("steer sent".into())
}

#[tauri::command]
pub fn pi_follow_up(
    app: tauri::AppHandle,
    shared: SharedState,
    message: String,
) -> Result<String, String> {
    ensure_spawned(&app, &shared)?;
    pi_send(
        &shared,
        &serde_json::json!({ "type": "follow_up", "message": message }),
    )?;
    Ok("follow_up sent".into())
}

#[tauri::command]
pub fn pi_abort(app: tauri::AppHandle, shared: SharedState) -> Result<String, String> {
    ensure_spawned(&app, &shared)?;
    pi_send(&shared, &serde_json::json!({ "type": "abort" }))?;
    Ok("abort sent".into())
}

#[tauri::command]
pub fn pi_respond_ui(shared: SharedState, id: String, confirmed: bool) -> Result<(), String> {
    pi_send(
        &shared,
        &serde_json::json!({ "type": "extension_ui_response", "id": id, "confirmed": confirmed }),
    )
}

/// Force-kill the sidecar (used by tests to exercise crash/restart).
#[tauri::command]
pub fn pi_crash(shared: SharedState) -> Result<String, String> {
    let mut guard = shared.child.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.as_mut() {
        let _ = child.kill();
    }
    *guard = None;
    Ok("pi killed".into())
}

/// Gracefully stop the sidecar (App Exit).
#[tauri::command]
pub fn pi_stop(shared: SharedState) -> Result<String, String> {
    shared.stopping.store(true, Ordering::SeqCst);
    shared.set_state(PiState::Stopping);
    let mut guard = shared.child.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.as_mut() {
        let _ = child.kill();
        let _ = child.wait();
    }
    *guard = None;
    shared.set_state(PiState::Stopped);
    Ok("pi stopped".into())
}

#[tauri::command]
pub fn pi_status(shared: SharedState) -> Result<serde_json::Value, String> {
    let guard = shared.child.lock().map_err(|e| e.to_string())?;
    let pid = guard.as_ref().map(|c| c.id());
    Ok(serde_json::json!({
        "state": shared.get_state().as_str(),
        "pid": pid,
        "restartCount": shared.restart_count.load(Ordering::SeqCst),
    }))
}
