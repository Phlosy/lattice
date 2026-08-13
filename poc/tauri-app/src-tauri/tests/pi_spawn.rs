// Headless integration test: verifies Rust can spawn Pi RPC sidecar and
// exchange JSONL (get_state + prompt + streaming). Bypasses GUI flakiness.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

const PI_ENTRY: &str = "node_modules/@earendil-works/pi-coding-agent/dist/cli.js";

struct Pi {
    stdin: ChildStdin,
    reader: BufReader<ChildStdout>,
    child: Child,
}

fn spawn_pi() -> Pi {
    let mut child = Command::new("node")
        .arg(PI_ENTRY)
        .arg("--mode")
        .arg("rpc")
        .arg("--session-dir")
        .arg("/tmp/pi-tauri-test-sessions")
        .arg("--approve")
        .current_dir("../../..")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("spawn Pi");
    let stdin = child.stdin.take().expect("stdin");
    let stdout = child.stdout.take().expect("stdout");
    Pi {
        stdin,
        reader: BufReader::new(stdout),
        child,
    }
}

fn read_line(pi: &mut Pi) -> String {
    let mut line = String::new();
    pi.reader.read_line(&mut line).expect("read line");
    line
}

#[test]
fn rust_spawns_pi_and_exchanges_rpc() {
    let mut pi = spawn_pi();
    // Let Pi finish startup (loads extensions via jiti, etc.)
    std::thread::sleep(std::time::Duration::from_secs(3));

    // Send get_state, expect a response with sessionId
    writeln!(pi.stdin, r#"{{"type":"get_state","id":"t1"}}"#).expect("write");
    pi.stdin.flush().expect("flush");

    let mut got_state = false;
    for _ in 0..50 {
        let line = read_line(&mut pi);
        if line.contains("\"command\":\"get_state\"") {
            assert!(
                line.contains("\"sessionId\""),
                "get_state should return sessionId: {line}"
            );
            got_state = true;
            break;
        }
    }
    assert!(got_state, "did not receive get_state response");

    // Prompt streaming requires a real model API key. Without one (e.g. in a
    // fresh CI runner), Pi errors immediately and the test would block/fail —
    // so only run the streaming assertion when a key is present.
    if std::env::var("DEEPSEEK_API_KEY").is_err() {
        eprintln!("skipping prompt streaming: no DEEPSEEK_API_KEY");
        let _ = pi.child.kill();
        return;
    }

    // Send prompt, expect agent_start + text_delta streaming
    writeln!(
        pi.stdin,
        r#"{{"type":"prompt","message":"reply with the word ok"}}"#
    )
    .expect("write");
    pi.stdin.flush().expect("flush");

    let mut saw_agent_start = false;
    let mut saw_text = false;
    for _ in 0..600 {
        let line = read_line(&mut pi);
        if line.contains("\"type\":\"agent_start\"") {
            saw_agent_start = true;
        }
        if line.contains("text_delta") {
            saw_text = true;
        }
        if line.contains("agent_settled") {
            break;
        }
    }
    assert!(
        saw_agent_start,
        "did not see agent_start (prompt not accepted/streaming)"
    );
    assert!(saw_text, "did not see text_delta (no streaming)");

    let _ = pi.child.kill();
}
