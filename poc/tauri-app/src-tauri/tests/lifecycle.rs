// Lifecycle tests: PiState enum + PiShared initial state + bundled sidecar
// crash/restart capability (the primitive behind on_sidecar_exit).

use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};

use poctauri_app_lib::pi::{PiShared, PiState};

#[test]
fn state_names_complete() {
    let cases = [
        (PiState::Stopped, "STOPPED"),
        (PiState::Starting, "STARTING"),
        (PiState::Ready, "READY"),
        (PiState::Busy, "BUSY"),
        (PiState::Crashed, "CRASHED"),
        (PiState::Restarting, "RESTARTING"),
        (PiState::Failed, "FAILED"),
        (PiState::Stopping, "STOPPING"),
    ];
    for (s, name) in cases {
        assert_eq!(s.as_str(), name, "state name mismatch");
    }
}

#[test]
fn initial_state_is_stopped() {
    let shared = PiShared::new();
    assert_eq!(shared.get_state(), PiState::Stopped);
}

/// Returns the bundled sidecar binary if it was built (scripts/build-pi-sidecar.sh).
fn bundled_pi() -> Option<std::path::PathBuf> {
    let plat = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => "darwin-arm64",
        ("macos", "x86_64") => "darwin-x64",
        ("linux", "x86_64") => "linux-x64",
        ("linux", "aarch64") => "linux-arm64",
        ("windows", "x86_64") => "windows-x64",
        ("windows", "aarch64") => "windows-arm64",
        _ => return None,
    };
    let bin = if cfg!(windows) { "pi.exe" } else { "pi" };
    let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("pi-sidecar")
        .join(plat)
        .join(bin);
    p.exists().then_some(p)
}

fn spawn_bundled(bin: &std::path::Path) -> std::process::Child {
    Command::new(bin)
        .arg("--mode")
        .arg("rpc")
        .arg("--session-dir")
        .arg("/tmp/pi-lifecycle-test")
        .arg("--approve")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn bundled pi")
}

fn wait_for_state(stdout: &mut impl BufRead, stdin: &mut impl Write) {
    stdin
        .write_all(b"{\"type\":\"get_state\",\"id\":\"t\"}\n")
        .unwrap();
    stdin.flush().unwrap();
    let mut line = String::new();
    for _ in 0..100 {
        line.clear();
        if stdout.read_line(&mut line).unwrap() == 0 {
            panic!("sidecar stdout closed unexpectedly");
        }
        if line.contains("sessionId") {
            return;
        }
    }
    panic!("did not receive get_state response");
}

#[test]
fn bundled_sidecar_spawns_and_restarts_after_kill() {
    let Some(bin) = bundled_pi() else {
        eprintln!("skipping: bundled sidecar not built");
        return;
    };

    // First spawn.
    let mut child = spawn_bundled(&bin);
    let mut stdin = child.stdin.take().unwrap();
    let mut stdout = BufReader::new(child.stdout.take().unwrap());
    wait_for_state(&mut stdout, &mut stdin);

    // Kill it (simulates a crash).
    child.kill().unwrap();
    let _ = child.wait();
    drop(stdin);
    drop(stdout);

    // Respawn — the restart primitive behind on_sidecar_exit.
    let mut child2 = spawn_bundled(&bin);
    let mut stdin2 = child2.stdin.take().unwrap();
    let mut stdout2 = BufReader::new(child2.stdout.take().unwrap());
    wait_for_state(&mut stdout2, &mut stdin2);

    let _ = child2.kill();
    let _ = child2.wait();
}
