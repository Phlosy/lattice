// Headless test: verifies the Rust Workspace/Filesystem commands work on a
// scratch project (open_project / list_files / read_file / write_file).

use std::fs;
use std::path::PathBuf;

fn scratch() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("lattice-ws-test-{}", std::process::id()));
    fs::create_dir_all(dir.join("src")).unwrap();
    fs::create_dir_all(dir.join("node_modules")).unwrap(); // should be ignored
    fs::write(dir.join("README.md"), "# test\n").unwrap();
    fs::write(dir.join("src/main.rs"), "fn main() {}\n").unwrap();
    fs::write(dir.join("node_modules/x.js"), "ignored").unwrap();
    dir
}

#[test]
fn workspace_filesystem_roundtrip() {
    let dir = scratch();
    let path = dir.to_string_lossy().to_string();

    // open_project
    let info = poctauri_app_lib::workspace::open_project(path.clone()).unwrap();
    assert!(info.path == path);
    assert!(
        info.name.starts_with("lattice-ws-test"),
        "name={}",
        info.name
    );

    // list_files (should skip node_modules, return relative paths)
    let files = poctauri_app_lib::workspace::list_files(path.clone(), 100).unwrap();
    assert!(files.contains(&"README.md".to_string()), "files: {files:?}");
    assert!(
        files.contains(&"src/main.rs".to_string()),
        "files: {files:?}"
    );
    assert!(
        !files.iter().any(|f| f.contains("node_modules")),
        "should ignore node_modules"
    );

    // read_file
    let content = poctauri_app_lib::workspace::read_file(format!("{path}/README.md")).unwrap();
    assert!(content.contains("# test"));

    // write_file
    let new_file = format!("{path}/src/lib.rs");
    poctauri_app_lib::workspace::write_file(new_file.clone(), "pub fn x() {}\n".into()).unwrap();
    let written = poctauri_app_lib::workspace::read_file(new_file).unwrap();
    assert!(written.contains("pub fn x()"));

    // cleanup
    let _ = fs::remove_dir_all(&dir);
}
