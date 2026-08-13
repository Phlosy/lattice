// Headless test: verifies the Rust Git/Worktree commands against a scratch repo.

use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn scratch() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("lattice-git-test-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("a.txt"), "hello\nworld\n").unwrap();
    run(&dir, &["init", "-q"]);
    run(&dir, &["config", "user.email", "t@t.co"]);
    run(&dir, &["config", "user.name", "t"]);
    run(&dir, &["add", "."]);
    run(&dir, &["commit", "-qm", "init"]);
    dir
}

fn run(dir: &PathBuf, args: &[&str]) -> String {
    let out = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .unwrap();
    String::from_utf8_lossy(&out.stdout).to_string()
}

#[test]
fn git_roundtrip() {
    let dir = scratch();
    let path = dir.to_string_lossy().to_string();

    // clean initial status
    let st = poctauri_app_lib::git::git_status(path.clone()).unwrap();
    assert!(st.clean, "initial should be clean");
    assert!(
        st.branch == "main" || st.branch == "master",
        "branch={}",
        st.branch
    );

    // modify a.txt (add 1 line) + create untracked b.txt
    fs::write(dir.join("a.txt"), "hello\nworld\nmore\n").unwrap();
    fs::write(dir.join("b.txt"), "new file\n").unwrap();

    let st = poctauri_app_lib::git::git_status(path.clone()).unwrap();
    assert!(!st.clean);
    assert!(
        st.files
            .iter()
            .any(|f| f.path == "a.txt" && f.status == "M"),
        "files: {:?}",
        st.files
            .iter()
            .map(|f| (&f.path, &f.status))
            .collect::<Vec<_>>()
    );
    assert!(
        st.files
            .iter()
            .any(|f| f.path == "b.txt" && f.status == "?"),
        "untracked b.txt expected"
    );

    // diff for a.txt contains the added line
    let diff = poctauri_app_lib::git::git_diff(path.clone(), "a.txt".into()).unwrap();
    assert!(diff.contains("+more"), "diff: {diff}");

    // branches contains main
    let branches = poctauri_app_lib::git::git_branches(path.clone()).unwrap();
    assert!(!branches.is_empty());

    // worktrees: initially 1
    let wts = poctauri_app_lib::git::git_worktrees(path.clone()).unwrap();
    assert_eq!(wts.len(), 1, "worktrees: {wts:?}");

    // create a worktree
    let target = dir.join("../wt-feature");
    let _ = fs::remove_dir_all(&target);
    poctauri_app_lib::git::git_create_worktree(
        path.clone(),
        "feature/x".into(),
        target.to_string_lossy().to_string(),
    )
    .unwrap();

    let wts = poctauri_app_lib::git::git_worktrees(path.clone()).unwrap();
    assert_eq!(wts.len(), 2, "worktrees after add: {wts:?}");
    assert!(wts.iter().any(|w| w.branch == "feature/x"));

    // cleanup
    let _ = fs::remove_dir_all(&target);
    let _ = fs::remove_dir_all(&dir);
}
