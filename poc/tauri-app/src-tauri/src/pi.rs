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

/// Candidate locations for an installed `pi` binary (PATH + common paths).
fn installed_pi_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            out.push(dir.join(pi_bin_name()));
        }
    }
    out.push(PathBuf::from("/opt/homebrew/bin").join(pi_bin_name()));
    out.push(PathBuf::from("/usr/local/bin").join(pi_bin_name()));
    if let Ok(home) = std::env::var("HOME") {
        out.push(
            PathBuf::from(home)
                .join(".local")
                .join("bin")
                .join(pi_bin_name()),
        );
    }
    out.push(PathBuf::from("/usr/bin").join(pi_bin_name()));
    out
}

/// Detect an installed Pi on this machine (InstalledPiProvider discovery).
#[tauri::command]
pub fn runtime_detect() -> serde_json::Value {
    for candidate in installed_pi_candidates() {
        if !candidate.is_file() {
            continue;
        }
        let version = Command::new(&candidate)
            .arg("--version")
            .output()
            .ok()
            .and_then(|out| String::from_utf8(out.stdout).ok())
            .map(|s| s.trim().to_string());
        return serde_json::json!({
            "found": true,
            "executablePath": candidate,
            "version": version,
            "compatibility": "unknown",
            "piHome": crate::paths::home_dir().join(".pi"),
        });
    }
    serde_json::json!({ "found": false })
}

/// Shared sidecar state. Managed as `Arc<PiShared>` so the stdout reader thread
/// can detect crashes and trigger restarts.
pub struct PiShared {
    child: Mutex<Option<Child>>,
    cwd: Mutex<Option<PathBuf>>,
    executable: Mutex<Option<PathBuf>>,
    lifecycle: Mutex<()>,
    pending: Mutex<HashMap<String, mpsc::Sender<Result<serde_json::Value, String>>>>,
    counter: AtomicU32,
    state: AtomicU32,
    stopping: AtomicBool,
    restart_count: AtomicU32,
    generation: AtomicU32,
    max_restarts: u32,
}

impl PiShared {
    pub fn new() -> Self {
        PiShared {
            child: Mutex::new(None),
            cwd: Mutex::new(None),
            executable: Mutex::new(None),
            lifecycle: Mutex::new(()),
            pending: Mutex::new(HashMap::new()),
            counter: AtomicU32::new(0),
            state: AtomicU32::new(PiState::Stopped as u32),
            stopping: AtomicBool::new(false),
            restart_count: AtomicU32::new(0),
            generation: AtomicU32::new(0),
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

impl Default for PiShared {
    fn default() -> Self {
        Self::new()
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

const PROVIDER_ENV_KEYS: &[&str] = &[
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "DEEPSEEK_API_KEY",
    "GOOGLE_API_KEY",
    "GEMINI_API_KEY",
    "GROQ_API_KEY",
    "XAI_API_KEY",
    "MISTRAL_API_KEY",
    "OPENROUTER_API_KEY",
    "CEREBRAS_API_KEY",
    "ZAI_API_KEY",
    "AZURE_OPENAI_API_KEY",
];

fn parse_null_env(output: &[u8]) -> HashMap<String, String> {
    output
        .split(|b| *b == 0 || *b == b'\n')
        .filter_map(|entry| {
            let text = std::str::from_utf8(entry).ok()?;
            let (key, value) = text.split_once('=')?;
            Some((key.to_string(), value.to_string()))
        })
        .collect()
}

fn is_permission_request(value: &serde_json::Value) -> bool {
    value["type"].as_str() == Some("extension_ui_request")
        && value["method"].as_str() == Some("confirm")
}

/// Finder-launched macOS apps do not inherit variables exported by the user's
/// interactive shell. Import only known provider credential variables into the
/// Pi child; never expose the resulting environment to the renderer.
fn apply_login_shell_credentials(command: &mut Command) {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let missing: Vec<&str> = PROVIDER_ENV_KEYS
            .iter()
            .copied()
            .filter(|key| std::env::var_os(key).is_none())
            .collect();
        if missing.is_empty() {
            return;
        }
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        if let Ok(output) = Command::new(shell)
            .args(["-ilc", "env"])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
        {
            if output.status.success() {
                let values = parse_null_env(&output.stdout);
                for key in missing {
                    if let Some(value) = values.get(key).filter(|value| !value.is_empty()) {
                        command.env(key, value);
                    }
                }
            }
        }
    }
}

/// Spawn the sidecar process and attach the stdout reader thread. Assumes the
/// child slot is empty and the state machine already transitioned to Starting.
fn spawn_pi(app: &tauri::AppHandle, shared: &Arc<PiShared>) -> Result<(), String> {
    // Resolve the sidecar: packaged resource → dev bundled → node fallback.
    let working_dir = shared
        .cwd
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .unwrap_or_else(crate::paths::home_dir);
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

    // A user-selected installed Pi takes priority over the bundled binary.
    let configured_bin = shared
        .executable
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .filter(|p| p.exists());

    // The permission-gate extension always ships with Lattice (an installed
    // Pi binary does not include it).
    let bundled_extension = app
        .path()
        .resource_dir()
        .ok()
        .map(|r| {
            r.join("pi-sidecar")
                .join(platform_dir())
                .join("extensions")
                .join("permission-gate.ts")
        })
        .filter(|p| p.exists())
        .or_else(|| {
            let dev = Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("pi-sidecar")
                .join(platform_dir())
                .join("extensions")
                .join("permission-gate.ts");
            dev.exists().then_some(dev)
        });

    let (mut cmd, extension) =
        if let Some(bin) = configured_bin.or(resource_bin).or_else(dev_bundled_pi) {
            let ext = bundled_extension
                .clone()
                .or_else(|| {
                    bin.parent()
                        .map(|d| d.join("extensions").join("permission-gate.ts"))
                })
                .unwrap_or_else(|| {
                    bin.parent()
                        .unwrap_or(Path::new("."))
                        .join("permission-gate.ts")
                });
            let mut c = Command::new(&bin);
            c.current_dir(&working_dir);
            (c, ext.to_string_lossy().to_string())
        } else {
            let mut c = Command::new("node");
            let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
            let root = manifest.join("../../..");
            let extension = manifest
                .parent()
                .unwrap_or(manifest)
                .join("extensions")
                .join("permission-gate.ts");
            c.arg(root.join(PI_ENTRY)).current_dir(&working_dir);
            (c, extension.to_string_lossy().to_string())
        };

    apply_login_shell_credentials(&mut cmd);
    let session_dir = crate::paths::prepare_session_dir()?;

    let mut child = cmd
        .arg("--mode")
        .arg("rpc")
        .arg("--session-dir")
        .arg(&session_dir)
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
    let generation = shared.generation.load(Ordering::SeqCst);
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
                                        let result = if v["success"].as_bool() == Some(false) {
                                            Err(v["error"]
                                                .as_str()
                                                .unwrap_or("Pi RPC command failed")
                                                .to_string())
                                        } else {
                                            Ok(v["data"].clone())
                                        };
                                        let _ = tx.send(result);
                                    }
                                }
                            }
                            "extension_ui_request" => {
                                // Pi extensions also use this channel for status/widgets.
                                // Only confirm requests are permission dialogs.
                                if is_permission_request(&v) {
                                    let _ = app_handle.emit("ui-request", &v);
                                }
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
        on_sidecar_exit(&app_handle, &shared, generation);
    });

    Ok(())
}

fn fail_pending(shared: &Arc<PiShared>, message: &str) {
    if let Ok(mut pending) = shared.pending.lock() {
        for (_, sender) in pending.drain() {
            let _ = sender.send(Err(message.to_string()));
        }
    }
}

/// Called when the sidecar's stdout closes. Distinguishes an intentional stop
/// from a crash, and triggers a bounded restart on crash.
fn on_sidecar_exit(app: &tauri::AppHandle, shared: &Arc<PiShared>, generation: u32) {
    // A deliberate credential refresh replaces the child before the old reader
    // observes EOF. Ignore that stale reader rather than treating it as a crash.
    if generation != shared.generation.load(Ordering::SeqCst) {
        return;
    }
    let _lifecycle = match shared.lifecycle.lock() {
        Ok(lock) => lock,
        Err(error) => {
            eprintln!("[pi] lifecycle lock poisoned after sidecar exit: {error}");
            return;
        }
    };
    if generation != shared.generation.load(Ordering::SeqCst) {
        return;
    }
    fail_pending(shared, "Pi sidecar exited");
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
    let _lifecycle = shared.lifecycle.lock().map_err(|e| e.to_string())?;
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

/// Restart the RPC sidecar after credential storage changes. The generation
/// counter prevents the old stdout reader from reporting a false crash.
pub fn restart_pi(
    app: &tauri::AppHandle,
    shared: &Arc<PiShared>,
    restore_session: Option<&str>,
) -> Result<(), String> {
    let _lifecycle = shared.lifecycle.lock().map_err(|e| e.to_string())?;
    shared.generation.fetch_add(1, Ordering::SeqCst);
    fail_pending(shared, "Pi sidecar is restarting");
    shared.stopping.store(true, Ordering::SeqCst);
    {
        let mut guard = shared.child.lock().map_err(|e| e.to_string())?;
        if let Some(child) = guard.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
        *guard = None;
    }
    shared.stopping.store(false, Ordering::SeqCst);
    shared.restart_count.store(0, Ordering::SeqCst);
    shared.emit_state(app, PiState::Starting);
    spawn_pi(app, shared)?;
    if let Some(path) = restore_session.filter(|path| !path.is_empty()) {
        pi_request(
            shared,
            serde_json::json!({ "type": "switch_session", "sessionPath": path }),
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn pi_set_cwd(
    app: tauri::AppHandle,
    shared: State<Arc<PiShared>>,
    cwd: String,
) -> Result<bool, String> {
    // Empty cwd resets to the home directory (standalone conversations).
    let resolved = if cwd.trim().is_empty() {
        crate::paths::home_dir()
    } else {
        PathBuf::from(cwd.trim())
    };
    if !resolved.is_dir() {
        return Err(format!("Not a directory: {}", resolved.display()));
    }
    let changed = {
        let mut current = shared.cwd.lock().map_err(|e| e.to_string())?;
        if current.as_ref() == Some(&resolved) {
            false
        } else {
            *current = Some(resolved);
            true
        }
    };
    if changed && shared.child.lock().map_err(|e| e.to_string())?.is_some() {
        restart_pi(&app, &shared, None)?;
    }
    Ok(changed)
}

/// Send a one-way protocol message such as an extension UI response.
pub fn pi_send(shared: &Arc<PiShared>, command: &serde_json::Value) -> Result<(), String> {
    let mut guard = shared.child.lock().map_err(|e| e.to_string())?;
    let child = guard.as_mut().ok_or("pi not running")?;
    let stdin = child.stdin.as_mut().ok_or("no stdin")?;
    writeln!(stdin, "{command}").map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())?;
    drop(guard);
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

    let send_result = (|| -> Result<(), String> {
        let mut guard = shared.child.lock().map_err(|e| e.to_string())?;
        let child = guard.as_mut().ok_or("pi not running")?;
        let stdin = child.stdin.as_mut().ok_or("no stdin")?;
        writeln!(stdin, "{cmd}").map_err(|e| e.to_string())?;
        stdin.flush().map_err(|e| e.to_string())
    })();
    if let Err(error) = send_result {
        let _ = shared.pending.lock().map(|mut pending| pending.remove(&id));
        return Err(error);
    }

    match rx.recv_timeout(std::time::Duration::from_secs(60)) {
        Ok(result) => result,
        Err(error) => {
            let _ = shared.pending.lock().map(|mut pending| pending.remove(&id));
            Err(format!("pi request timeout: {error}"))
        }
    }
}

// ---- Tauri commands ----

type SharedState<'a> = State<'a, Arc<PiShared>>;

#[tauri::command]
pub fn pi_prompt(
    app: tauri::AppHandle,
    shared: SharedState,
    text: String,
    images: Option<Vec<serde_json::Value>>,
) -> Result<String, String> {
    ensure_spawned(&app, &shared)?;
    shared.emit_state(&app, PiState::Busy);
    let result = pi_request(
        &shared,
        serde_json::json!({ "type": "prompt", "message": text, "images": images.unwrap_or_default() }),
    );
    if let Err(error) = result {
        shared.emit_state(&app, PiState::Ready);
        return Err(error);
    }
    Ok("prompt sent".into())
}

#[tauri::command]
pub fn pi_steer(
    app: tauri::AppHandle,
    shared: SharedState,
    message: String,
) -> Result<String, String> {
    ensure_spawned(&app, &shared)?;
    pi_request(
        &shared,
        serde_json::json!({ "type": "steer", "message": message }),
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
    pi_request(
        &shared,
        serde_json::json!({ "type": "follow_up", "message": message }),
    )?;
    Ok("follow_up sent".into())
}

#[tauri::command]
pub fn pi_abort(app: tauri::AppHandle, shared: SharedState) -> Result<String, String> {
    ensure_spawned(&app, &shared)?;
    pi_request(&shared, serde_json::json!({ "type": "abort" }))?;
    Ok("abort sent".into())
}

#[tauri::command]
pub fn pi_continue(app: tauri::AppHandle, shared: SharedState) -> Result<String, String> {
    ensure_spawned(&app, &shared)?;
    shared.emit_state(&app, PiState::Busy);
    let result = pi_request(
        &shared,
        serde_json::json!({ "type": "prompt", "message": "Continue from the previous interruption." }),
    );
    if let Err(error) = result {
        shared.emit_state(&app, PiState::Ready);
        return Err(error);
    }
    Ok("continue sent".into())
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
    let _lifecycle = shared.lifecycle.lock().map_err(|e| e.to_string())?;
    fail_pending(&shared, "Pi sidecar was force-killed");
    let mut guard = shared.child.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.as_mut() {
        child.kill().map_err(|e| e.to_string())?;
    }
    // Keep the handle installed until the stdout reader observes EOF. That
    // reader owns crash cleanup and bounded restart; clearing it here would let
    // ensure_spawned race in a replacement child under the old generation.
    Ok("pi killed".into())
}

/// Gracefully stop the sidecar (App Exit).
#[tauri::command]
pub fn pi_stop(shared: SharedState) -> Result<String, String> {
    let _lifecycle = shared.lifecycle.lock().map_err(|e| e.to_string())?;
    shared.stopping.store(true, Ordering::SeqCst);
    shared.set_state(PiState::Stopping);
    fail_pending(&shared, "Pi sidecar stopped");
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

/// Select an installed Pi executable (empty path clears the override back to
/// the bundled binary). Restarts the sidecar when running.
#[tauri::command]
pub fn pi_set_executable(
    app: tauri::AppHandle,
    shared: SharedState,
    path: String,
) -> Result<(), String> {
    let resolved = if path.trim().is_empty() {
        None
    } else {
        Some(PathBuf::from(path.trim()))
    };
    *shared.executable.lock().map_err(|e| e.to_string())? = resolved;
    if shared.get_state() != PiState::Stopped {
        restart_pi(&app, &shared, None)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_null_delimited_shell_environment() {
        let env = parse_null_env(b"PATH=/bin\0DEEPSEEK_API_KEY=secret\0BAD\0");
        assert_eq!(env.get("PATH").map(String::as_str), Some("/bin"));
        assert_eq!(
            env.get("DEEPSEEK_API_KEY").map(String::as_str),
            Some("secret")
        );
        assert!(!env.contains_key("BAD"));
    }

    #[test]
    fn credential_whitelist_contains_deepseek_and_openai() {
        assert!(PROVIDER_ENV_KEYS.contains(&"DEEPSEEK_API_KEY"));
        assert!(PROVIDER_ENV_KEYS.contains(&"OPENAI_API_KEY"));
    }

    #[test]
    fn only_confirm_ui_requests_are_permissions() {
        let confirm = serde_json::json!({ "type": "extension_ui_request", "method": "confirm" });
        let widget = serde_json::json!({ "type": "extension_ui_request", "method": "setWidget" });
        assert!(is_permission_request(&confirm));
        assert!(!is_permission_request(&widget));
    }

    #[test]
    fn installed_candidates_include_common_paths_and_use_pi_bin_name() {
        let candidates = installed_pi_candidates();
        assert!(!candidates.is_empty());
        // Every candidate targets the platform pi binary name.
        assert!(candidates.iter().all(|c| c.ends_with(pi_bin_name())));
        // Common install locations are always probed.
        assert!(candidates
            .iter()
            .any(|c| c.starts_with("/opt/homebrew/bin")));
        assert!(candidates.iter().any(|c| c.starts_with("/usr/bin")));
    }
}
