// Headless test: ext_list / ext_toggle against Pi's settings.json (with
// backup/restore to avoid side effects on the user's config).

use std::fs;
use std::path::PathBuf;

fn settings_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    PathBuf::from(home).join(".pi/agent/settings.json")
}

#[test]
fn ext_toggle_roundtrip() {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    let backup = if path.exists() {
        Some(fs::read_to_string(&path).unwrap())
    } else {
        None
    };

    // enable
    poctauri_app_lib::marketplace::ext_toggle("npm:lattice-test-pkg".into(), true).unwrap();
    let list = poctauri_app_lib::marketplace::ext_list().unwrap();
    assert!(
        list.iter().any(|p| p.source == "npm:lattice-test-pkg"),
        "list should contain test pkg: {list:?}"
    );

    // disable
    poctauri_app_lib::marketplace::ext_toggle("npm:lattice-test-pkg".into(), false).unwrap();
    let list = poctauri_app_lib::marketplace::ext_list().unwrap();
    assert!(!list.iter().any(|p| p.source == "npm:lattice-test-pkg"));

    // restore
    match backup {
        Some(content) => fs::write(&path, content).unwrap(),
        None => {
            let _ = fs::remove_file(&path);
        }
    }
}
