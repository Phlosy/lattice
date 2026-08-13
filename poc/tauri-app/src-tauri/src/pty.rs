// PTY terminal commands for the Tauri Desktop Core.
// Uses portable-pty (cross-platform: ConPTY on Windows, openpty on Unix).

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::{AppHandle, Emitter, State};

struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState {
    sessions: Mutex<HashMap<String, PtySession>>,
    counter: std::sync::atomic::AtomicU32,
}

fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
}

#[tauri::command]
pub fn pty_spawn(app: AppHandle, state: State<PtyState>, cwd: Option<String>) -> Result<String, String> {
    let id = format!(
        "pty-{}",
        state.counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst)
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

    // Background thread: read PTY output and emit to the webview.
    let app_handle = app.clone();
    let id_clone = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_handle.emit("pty-data", serde_json::json!({ "id": id_clone, "data": data }));
                }
                Err(_) => break,
            }
        }
        let _ = app_handle.emit("pty-exit", serde_json::json!({ "id": id_clone }));
    });

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

    Ok(id)
}

#[tauri::command]
pub fn pty_write(state: State<PtyState>, id: String, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(session) = sessions.get_mut(&id) {
        session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pty_resize(state: State<PtyState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(session) = sessions.get(&id) {
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pty_kill(state: State<PtyState>, id: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = sessions.remove(&id) {
        let _ = session.child.kill();
    }
    Ok(())
}

pub fn init_state() -> PtyState {
    PtyState {
        sessions: Mutex::new(HashMap::new()),
        counter: std::sync::atomic::AtomicU32::new(0),
    }
}
