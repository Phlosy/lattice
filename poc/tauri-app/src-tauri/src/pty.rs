// PTY terminal commands for the Tauri Desktop Core.
// Uses portable-pty (cross-platform: ConPTY on Windows, openpty on Unix).
// Desktop-only: portable-pty does not build on iOS/Android (no forkpty), and
// Mobile is a Remote Runtime Client (PTY runs on the Runtime Host).
#![cfg(desktop)]

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::{AppHandle, Emitter, State};

struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
    counter: std::sync::atomic::AtomicU32,
}

fn default_shell() -> String {
    #[cfg(windows)]
    {
        std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string())
    }
    #[cfg(not(windows))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

fn decode_pty_bytes(pending: &mut Vec<u8>, bytes: &[u8]) -> String {
    pending.extend_from_slice(bytes);
    let mut output = String::new();
    loop {
        match std::str::from_utf8(pending) {
            Ok(text) => {
                output.push_str(text);
                pending.clear();
                break;
            }
            Err(error) => {
                let valid = error.valid_up_to();
                if valid > 0 {
                    output.push_str(std::str::from_utf8(&pending[..valid]).unwrap_or_default());
                    pending.drain(..valid);
                }
                match error.error_len() {
                    Some(length) => {
                        output.push('\u{fffd}');
                        pending.drain(..length.min(pending.len()));
                    }
                    None => break,
                }
            }
        }
    }
    output
}

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: State<PtyState>,
    cwd: Option<String>,
) -> Result<String, String> {
    let id = format!(
        "pty-{}",
        state
            .counter
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
    );

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(default_shell());
    if let Some(cwd) = cwd {
        cmd.cwd(cwd);
    }
    cmd.env("TERM", "xterm-256color");

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let session = PtySession {
        writer,
        master: pair.master,
        child,
    };
    state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id.clone(), session);

    // Background thread: read PTY output and emit to the webview.
    let app_handle = app.clone();
    let id_clone = id.clone();
    let sessions = Arc::clone(&state.sessions);
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut pending_utf8 = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = decode_pty_bytes(&mut pending_utf8, &buf[..n]);
                    if !data.is_empty() {
                        let _ = app_handle.emit(
                            "pty-data",
                            serde_json::json!({ "id": id_clone, "data": data }),
                        );
                    }
                }
                Err(_) => break,
            }
        }
        if !pending_utf8.is_empty() {
            let _ = app_handle.emit(
                "pty-data",
                serde_json::json!({
                    "id": id_clone,
                    "data": String::from_utf8_lossy(&pending_utf8)
                }),
            );
        }
        let exit_code = sessions
            .lock()
            .ok()
            .and_then(|mut sessions| sessions.remove(&id_clone))
            .and_then(|mut session| session.child.wait().ok())
            .map(|status| status.exit_code() as i64)
            .unwrap_or(-1);
        let _ = app_handle.emit(
            "pty-exit",
            serde_json::json!({ "id": id_clone, "exitCode": exit_code }),
        );
    });

    Ok(id)
}

#[tauri::command]
pub fn pty_write(state: State<PtyState>, id: String, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get_mut(&id)
        .ok_or_else(|| format!("terminal not found: {id}"))?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    session.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(state: State<PtyState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&id)
        .ok_or_else(|| format!("terminal not found: {id}"))?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(state: State<PtyState>, id: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get_mut(&id)
        .ok_or_else(|| format!("terminal not found: {id}"))?;
    // The reader thread removes the entry and waits for the child, preserving
    // the real exit status for the pty-exit event.
    session.child.kill().map_err(|e| e.to_string())
}

pub fn init_state() -> PtyState {
    PtyState {
        sessions: Arc::new(Mutex::new(HashMap::new())),
        counter: std::sync::atomic::AtomicU32::new(0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_multibyte_text_split_across_reads() {
        let bytes = "中文".as_bytes();
        let mut pending = Vec::new();
        let first = decode_pty_bytes(&mut pending, &bytes[..2]);
        assert_eq!(first, "");
        let second = decode_pty_bytes(&mut pending, &bytes[2..]);
        assert_eq!(second, "中文");
        assert!(pending.is_empty());
    }
}
