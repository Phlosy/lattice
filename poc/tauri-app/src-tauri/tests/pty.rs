// Headless test: verifies the portable-pty spawn/write/read roundtrip that
// the pty.rs commands wrap.

use std::io::{Read, Write};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};

#[test]
fn pty_roundtrip() {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .unwrap();

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.env("TERM", "xterm-256color");
    let mut child = pair.slave.spawn_command(cmd).unwrap();

    let mut writer = pair.master.take_writer().unwrap();
    let mut reader = pair.master.try_clone_reader().unwrap();

    // Send a command and read back its output.
    writer.write_all(b"echo hello-pty-ok\r").unwrap();
    writer.flush().unwrap();

    let mut buf = [0u8; 4096];
    let mut collected = String::new();
    let start = std::time::Instant::now();
    while start.elapsed() < std::time::Duration::from_secs(4) {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                collected.push_str(&String::from_utf8_lossy(&buf[..n]));
                if collected.contains("hello-pty-ok") {
                    break;
                }
            }
            Err(_) => break,
        }
    }

    assert!(
        collected.contains("hello-pty-ok"),
        "pty output should echo the command; got: {collected}"
    );

    let _ = child.kill();
}
