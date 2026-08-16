//! Lattice Runtime Host — a headless WebSocket server that exposes the Pi RPC
//! sidecar (and later workspace/git/pty) to remote clients (mobile / desktop).
//!
//! Desktop-only: mobile is a Remote Runtime Client, not a host.
//!
//! Protocol: JSON over WebSocket.
//!   client → host:  { "id": "r1", "method": "prompt", "params": {...}, "token": "..." }
//!   host → client:  { "type": "response", "id": "r1", "data": {...} }
//!   host → client:  { "type": "event", "event": "pi-event", "payload": {...} }

use std::collections::{BTreeSet, HashMap};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::sync::broadcast;
use tokio_tungstenite::tungstenite::Message;

const PI_ENTRY: &str = "node_modules/@earendil-works/pi-coding-agent/dist/cli.js";

fn session_dir() -> PathBuf {
    // Share the Desktop Core session directory so the headless host and the
    // desktop app list/open the same JSONL history.
    poctauri_app_lib::paths::session_dir()
}

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

fn bundled_pi() -> Option<PathBuf> {
    let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("pi-sidecar")
        .join(platform_dir())
        .join(pi_bin_name());
    p.exists().then_some(p)
}

type PendingRequests = Arc<Mutex<HashMap<String, mpsc::Sender<Result<Value, String>>>>>;

struct Runtime {
    stdin: Mutex<ChildStdin>,
    _child: Mutex<Option<Child>>,
    pending: PendingRequests,
    counter: AtomicU32,
    events: broadcast::Sender<(String, Value)>,
}

type SpawnedPi = (ChildStdin, Child, broadcast::Sender<(String, Value)>);

fn spawn_pi(pending: PendingRequests) -> Result<SpawnedPi, String> {
    let (tx, _rx) = broadcast::channel(256);

    let (mut cmd, ext) = if let Some(bin) = bundled_pi() {
        let dir = bin.parent().map(|d| d.to_path_buf()).unwrap_or_default();
        let ext = dir.join("extensions").join("permission-gate.ts");
        let mut c = Command::new(&bin);
        c.current_dir("../../..");
        (c, ext.to_string_lossy().to_string())
    } else {
        let mut c = Command::new("node");
        c.arg(PI_ENTRY).current_dir("../../..");
        (c, "poc/tauri-app/extensions/permission-gate.ts".to_string())
    };

    let session_dir = poctauri_app_lib::paths::prepare_session_dir()
        .map_err(|e| format!("prepare runtime session directory: {e}"))?;
    let mut child = cmd
        .arg("--mode")
        .arg("rpc")
        .arg("--session-dir")
        .arg(&session_dir)
        .arg("--approve")
        .arg("--extension")
        .arg(&ext)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("spawn Pi: {e}"))?;

    let stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let tx_thread = tx.clone();

    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            if let Ok(v) = serde_json::from_str::<Value>(&line) {
                let ty = v["type"].as_str().unwrap_or("");
                if ty == "response" {
                    if let Some(id) = v["id"].as_str() {
                        if let Some(s) = pending.lock().unwrap().remove(id) {
                            let result = if v["success"].as_bool() == Some(false) {
                                Err(v["error"]
                                    .as_str()
                                    .unwrap_or("Pi RPC command failed")
                                    .to_string())
                            } else {
                                Ok(v["data"].clone())
                            };
                            let _ = s.send(result);
                        }
                    }
                } else {
                    let event = ty.to_string();
                    let _ = tx_thread.send((event, v));
                }
            }
        }
    });

    let (p_stdin, p_child) = (stdin, child);
    Ok((p_stdin, p_child, tx))
}

fn method_to_rpc(method: &str, params: &Value) -> Option<Value> {
    let p = params.as_object().cloned().unwrap_or_default();
    let get = |k: &str| p.get(k).cloned().unwrap_or(Value::Null);
    let cmd = match method {
        "prompt" => json!({ "type": "prompt", "message": get("text"), "images": get("images") }),
        "steer" => json!({ "type": "steer", "message": get("text") }),
        "follow_up" => json!({ "type": "follow_up", "message": get("text") }),
        "abort" => json!({ "type": "abort" }),
        "continue" => json!({ "type": "continue" }),
        "session.state" => json!({ "type": "get_state" }),
        "session.create" => json!({ "type": "new_session" }),
        "session.open" => json!({ "type": "switch_session", "sessionPath": get("file") }),
        "session.rename" => json!({ "type": "set_session_name", "name": get("name") }),
        "model.list" => json!({ "type": "get_available_models" }),
        "model.set" => {
            json!({ "type": "set_model", "provider": get("providerId"), "modelId": get("modelId") })
        }
        "thinking.set" => json!({ "type": "set_thinking_level", "level": get("level") }),
        "permission.respond" => {
            json!({ "type": "extension_ui_response", "id": get("requestId"), "confirmed": get("action").as_str().map(|a| a.starts_with("allow")).unwrap_or(false) })
        }
        _ => return None,
    };
    Some(cmd)
}

/// Dispatch the methods that are not Pi RPC commands but plain Desktop Core
/// functions (workspace, git, settings, session metadata, extension list,
/// projects). The host runs them directly on the remote machine.
fn method_to_local(method: &str, params: &Value) -> Option<Result<Value, String>> {
    let p = params.as_object().cloned().unwrap_or_default();
    let get_s = |k: &str| p.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let get = |k: &str| p.get(k).cloned().unwrap_or(Value::Null);
    let first_path = || {
        get("paths")
            .as_array()
            .and_then(|a| a.first())
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| get_s("file"))
    };

    macro_rules! plain {
        ($expr:expr) => {
            Some($expr.map(|v| serde_json::to_value(v).unwrap_or(Value::Null)))
        };
    }

    match method {
        "session.list" => plain!(poctauri_app_lib::session::list_sessions_in(&session_dir())),
        "session.messages" => {
            let id = get_s("sessionId");
            let file = poctauri_app_lib::session::list_sessions_in(&session_dir())
                .ok()
                .and_then(|sessions| sessions.into_iter().find(|s| s.id == id))
                .map(|s| s.file);
            match file {
                Some(file) => plain!(poctauri_app_lib::session::session_messages(file)),
                None => Some(Err(format!("session not found: {id}"))),
            }
        }
        "files.list" => plain!(poctauri_app_lib::workspace::list_files(get_s("cwd"), 400)),
        "git.status" => plain!(poctauri_app_lib::git::git_status(get_s("cwd"))),
        "git.diff" => plain!(poctauri_app_lib::git::git_diff(get_s("cwd"), first_path())),
        "git.commit" => plain!(poctauri_app_lib::git::git_commit(
            get_s("cwd"),
            get_s("message")
        )),
        "git.branches" => plain!(poctauri_app_lib::git::git_branches(get_s("cwd"))),
        "git.checkout" => plain!(poctauri_app_lib::git::git_checkout(
            get_s("cwd"),
            get_s("branch")
        )),
        "git.worktrees" => plain!(poctauri_app_lib::git::git_worktrees(get_s("cwd"))),
        "git.create_worktree" => {
            plain!(poctauri_app_lib::git::git_create_worktree(
                get_s("cwd"),
                get_s("branch"),
                get_s("path")
            ))
        }
        "settings.get" => plain!(poctauri_app_lib::settings::get_settings()),
        "settings.set" => plain!(poctauri_app_lib::settings::set_settings(get("patch"))),
        "ext.list" => plain!(poctauri_app_lib::marketplace::ext_list()),
        "ext.toggle" => plain!(poctauri_app_lib::marketplace::ext_toggle(
            get_s("source"),
            p.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false),
        )),
        "project.list" => plain!(Ok(poctauri_app_lib::projects::get_projects())),
        "project.remove" => plain!(poctauri_app_lib::projects::remove_project(get_s("path"))),
        "runtime.capabilities" => Some(Ok(json!({
            "chat": true,
            "sessions": true,
            "sessionResume": true,
            "filesystem": true,
            "git": true,
            "shell": true,
            "pty": false,
            "skills": true,
            "extensions": false,
            "subagents": true,
            "remoteFilesystem": true,
        }))),
        _ => None,
    }
}

fn providers_from_models(runtime: &Arc<Runtime>) -> Result<Value, String> {
    let data = request_rpc(runtime, &json!({ "type": "get_available_models" }))?;
    let models = data
        .get("models")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut seen = BTreeSet::new();
    let mut providers = Vec::new();
    for model in models {
        if let Some(id) = model.get("provider").and_then(|v| v.as_str()) {
            if seen.insert(id.to_string()) {
                providers.push(json!({ "id": id, "name": id, "hasAuth": true }));
            }
        }
    }
    serde_json::to_value(providers).map_err(|e| e.to_string())
}

fn send_rpc(runtime: &Arc<Runtime>, cmd: &Value) -> Result<(), String> {
    let mut stdin = runtime.stdin.lock().map_err(|e| e.to_string())?;
    writeln!(stdin, "{cmd}").map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())
}

fn request_rpc(runtime: &Arc<Runtime>, cmd: &Value) -> Result<Value, String> {
    let id = format!("rr_{}", runtime.counter.fetch_add(1, Ordering::SeqCst));
    let (tx, rx) = mpsc::channel();
    runtime
        .pending
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id.clone(), tx);

    let mut c = cmd.clone();
    if let Value::Object(ref mut o) = c {
        o.insert("id".to_string(), json!(id));
    }
    send_rpc(runtime, &c)?;

    rx.recv_timeout(std::time::Duration::from_secs(60))
        .map_err(|e| format!("timeout: {e}"))?
}

async fn handle_connection(
    runtime: Arc<Runtime>,
    stream: tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    expected_token: Option<String>,
) {
    let (mut sink, mut source) = stream.split();
    let mut events = runtime.events.subscribe();
    let mut authed = expected_token.is_none();

    loop {
        tokio::select! {
            incoming = source.next() => {
                match incoming {
                    Some(Ok(Message::Text(txt))) => {
                        let Ok(msg) = serde_json::from_str::<Value>(&txt) else { continue };
                        // First message carries the auth token.
                        if !authed {
                            if let Some(tok) = msg.get("token").and_then(|t| t.as_str()) {
                                authed = expected_token.as_deref() == Some(tok);
                            }
                            if !authed {
                                let _ = sink.send(Message::Text(json!({"type":"event","event":"auth","payload":{"ok":false}}).to_string())).await;
                                let _ = sink.close().await;
                                return;
                            }
                            let _ = sink.send(Message::Text(json!({"type":"event","event":"auth","payload":{"ok":true}}).to_string())).await;
                            continue;
                        }
                        let Some(method) = msg.get("method").and_then(|m| m.as_str()) else { continue };
                        let id = msg.get("id").cloned().unwrap_or(Value::Null);
                        let params = msg.get("params").cloned().unwrap_or(json!({}));

                        let response: Result<Value, String> = if let Some(cmd) = method_to_rpc(method, &params) {
                            if matches!(method, "prompt" | "steer" | "follow_up" | "abort" | "continue" | "permission.respond") {
                                send_rpc(&runtime, &cmd).map(|_| json!(true))
                            } else {
                                request_rpc(&runtime, &cmd)
                            }
                        } else if method == "model.providers" {
                            providers_from_models(&runtime)
                        } else if let Some(result) = method_to_local(method, &params) {
                            result
                        } else {
                            Err(format!("unknown method: {method}"))
                        };

                        let out = match response {
                            Ok(data) => json!({"type":"response","id":id,"data":data}),
                            Err(e) => json!({"type":"response","id":id,"error":e}),
                        };
                        let _ = sink.send(Message::Text(out.to_string())).await;
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
            ev = events.recv() => {
                if let Ok((event, payload)) = ev {
                    let out = json!({"type":"event","event":event,"payload":payload});
                    let _ = sink.send(Message::Text(out.to_string())).await;
                }
            }
        }
    }
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
#[tokio::main]
async fn main() {
    let addr = std::env::var("LATTICE_RUNTIME_ADDR").unwrap_or_else(|_| "127.0.0.1:8787".into());
    let token = std::env::var("LATTICE_RUNTIME_TOKEN")
        .ok()
        .filter(|t| !t.is_empty());

    let pending: PendingRequests = Arc::new(Mutex::new(HashMap::new()));

    let (stdin, child, events) = match spawn_pi(Arc::clone(&pending)) {
        Ok(x) => x,
        Err(e) => {
            eprintln!("[runtime] failed to spawn Pi: {e}");
            std::process::exit(1);
        }
    };

    let runtime = Arc::new(Runtime {
        stdin: Mutex::new(stdin),
        _child: Mutex::new(Some(child)),
        pending,
        counter: AtomicU32::new(0),
        events,
    });

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("bind {addr}: {e}"));
    println!(
        "[runtime] listening on ws://{addr} (auth: {})",
        if token.is_some() { "token" } else { "none" }
    );

    loop {
        let Ok((stream, _)) = listener.accept().await else {
            continue;
        };
        let ws = tokio_tungstenite::accept_async(stream).await;
        match ws {
            Ok(ws) => {
                let rt = Arc::clone(&runtime);
                let tk = token.clone();
                tokio::spawn(async move { handle_connection(rt, ws, tk).await });
            }
            Err(e) => eprintln!("[runtime] ws handshake failed: {e}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_set_forwards_provider_and_model() {
        let command = method_to_rpc(
            "model.set",
            &json!({ "providerId": "deepseek", "modelId": "deepseek-chat" }),
        )
        .unwrap();
        assert_eq!(command["provider"], "deepseek");
        assert_eq!(command["modelId"], "deepseek-chat");
    }

    #[test]
    fn prompt_forwards_images() {
        let command = method_to_rpc(
            "prompt",
            &json!({ "text": "inspect", "images": [{ "type": "image", "data": "abc", "mimeType": "image/png" }] }),
        )
        .unwrap();
        assert_eq!(command["images"].as_array().map(Vec::len), Some(1));
    }
}

// Mobile: the Runtime Host is desktop-only; provide a no-op entry so the bin
// still satisfies `cargo check --target <mobile>`.
#[cfg(any(target_os = "ios", target_os = "android"))]
fn main() {}
