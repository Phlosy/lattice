//! Lattice Runtime Host — a headless WebSocket server that exposes the Pi RPC
//! sidecar (and later workspace/git/pty) to remote clients (mobile / desktop).
//!
//! Protocol: JSON over WebSocket.
//!   client → host:  { "id": "r1", "method": "prompt", "params": {...}, "token": "..." }
//!   host → client:  { "type": "response", "id": "r1", "data": {...} }
//!   host → client:  { "type": "event", "event": "pi-event", "payload": {...} }

use std::collections::HashMap;
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
const SESSION_DIR: &str = "/tmp/pi-runtime-sessions";

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

fn bundled_pi() -> Option<PathBuf> {
    let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("pi-sidecar")
        .join(platform_dir())
        .join(pi_bin_name());
    p.exists().then_some(p)
}

struct Runtime {
    stdin: Mutex<ChildStdin>,
    child: Mutex<Option<Child>>,
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<Value>>>>,
    counter: AtomicU32,
    events: broadcast::Sender<(String, Value)>,
}

fn spawn_pi(
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<Value>>>>,
) -> Result<(ChildStdin, Child, broadcast::Sender<(String, Value)>), String> {
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

    let mut child = cmd
        .arg("--mode")
        .arg("rpc")
        .arg("--session-dir")
        .arg(SESSION_DIR)
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
                            let _ = s.send(v["data"].clone());
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
        "prompt" => json!({ "type": "prompt", "message": get("text") }),
        "steer" => json!({ "type": "steer", "message": get("text") }),
        "follow_up" => json!({ "type": "follow_up", "message": get("text") }),
        "abort" => json!({ "type": "abort" }),
        "session.state" => json!({ "type": "get_state" }),
        "session.create" => json!({ "type": "new_session" }),
        "model.list" => json!({ "type": "get_available_models" }),
        "model.set" => json!({ "type": "set_model", "modelId": get("modelId") }),
        "thinking.set" => json!({ "type": "set_thinking_level", "level": get("level") }),
        "permission.respond" => json!({ "type": "extension_ui_response", "id": get("requestId"), "confirmed": get("action").as_str().map(|a| a.starts_with("allow")).unwrap_or(false) }),
        _ => return None,
    };
    Some(cmd)
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
        .map_err(|e| format!("timeout: {e}"))
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
                        if let Some(cmd) = method_to_rpc(method, &params) {
                            let resp = if matches!(method, "prompt" | "steer" | "follow_up" | "abort" | "permission.respond") {
                                send_rpc(&runtime, &cmd).map(|_| json!(true))
                            } else {
                                request_rpc(&runtime, &cmd)
                            };
                            let out = match resp {
                                Ok(data) => json!({"type":"response","id":id,"data":data}),
                                Err(e) => json!({"type":"response","id":id,"error":e}),
                            };
                            let _ = sink.send(Message::Text(out.to_string())).await;
                        } else {
                            let _ = sink.send(Message::Text(json!({"type":"response","id":id,"error":"unknown method"}).to_string())).await;
                        }
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

#[tokio::main]
async fn main() {
    let addr = std::env::var("LATTICE_RUNTIME_ADDR").unwrap_or_else(|_| "127.0.0.1:8787".into());
    let token = std::env::var("LATTICE_RUNTIME_TOKEN").ok().filter(|t| !t.is_empty());

    let pending: Arc<Mutex<HashMap<String, mpsc::Sender<Value>>>> = Arc::new(Mutex::new(HashMap::new()));

    let (stdin, child, events) = match spawn_pi(Arc::clone(&pending)) {
        Ok(x) => x,
        Err(e) => {
            eprintln!("[runtime] failed to spawn Pi: {e}");
            std::process::exit(1);
        }
    };

    let runtime = Arc::new(Runtime {
        stdin: Mutex::new(stdin),
        child: Mutex::new(Some(child)),
        pending,
        counter: AtomicU32::new(0),
        events,
    });

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("bind {addr}: {e}"));
    println!("[runtime] listening on ws://{addr} (auth: {})", if token.is_some() { "token" } else { "none" });

    loop {
        let Ok((stream, _)) = listener.accept().await else { continue };
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
