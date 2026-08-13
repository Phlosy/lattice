// Git / Worktree commands for the Tauri Desktop Core.
// Wraps the system `git` binary (same approach as the Electron simple-git layer).

use std::process::Command;

use serde::Serialize;

fn run_git(cwd: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("git: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

#[derive(Serialize, Debug)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String, // M / A / D / ? / R
    pub added: u32,
    pub removed: u32,
}

#[derive(Serialize, Debug)]
pub struct GitStatus {
    pub branch: String,
    pub files: Vec<GitFileStatus>,
    pub clean: bool,
    pub added: u32,
    pub removed: u32,
}

#[derive(Serialize, Debug)]
pub struct Worktree {
    pub path: String,
    pub branch: String,
}

#[tauri::command]
pub fn git_status(path: String) -> Result<GitStatus, String> {
    let branch = run_git(&path, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();
    let porcelain = run_git(&path, &["status", "--porcelain"])?;
    let numstat = run_git(&path, &["diff", "--numstat"])?;

    // Parse numstat: added\tremoved\tpath
    let mut numstat_map = std::collections::HashMap::new();
    for line in numstat.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 3 {
            let added = parts[0].parse::<u32>().unwrap_or(0);
            let removed = parts[1].parse::<u32>().unwrap_or(0);
            numstat_map.insert(parts[2].to_string(), (added, removed));
        }
    }

    let mut files = Vec::new();
    for line in porcelain.lines() {
        if line.len() < 4 {
            continue;
        }
        let status = &line[0..2];
        let file_path = line[3..].trim().to_string();
        let code = if status.contains('?') {
            '?'
        } else if status.contains('A') {
            'A'
        } else if status.contains('D') {
            'D'
        } else if status.contains('R') {
            'R'
        } else {
            'M'
        };
        let mut added = 0;
        let mut removed = 0;
        if code == '?' {
            // untracked: count lines as added
            if let Ok(content) = std::fs::read_to_string(format!("{path}/{file_path}")) {
                added = content.lines().count() as u32;
            }
        } else if let Some((a, r)) = numstat_map.get(&file_path) {
            added = *a;
            removed = *r;
        }
        files.push(GitFileStatus {
            path: file_path,
            status: code.to_string(),
            added,
            removed,
        });
    }

    let clean = files.is_empty();
    let total_added = files.iter().map(|f| f.added).sum();
    let total_removed = files.iter().map(|f| f.removed).sum();

    Ok(GitStatus {
        branch,
        files,
        clean,
        added: total_added,
        removed: total_removed,
    })
}

#[tauri::command]
pub fn git_diff(path: String, file: String) -> Result<String, String> {
    run_git(&path, &["diff", "--", &file])
}

#[tauri::command]
pub fn git_commit(path: String, message: String) -> Result<String, String> {
    let hash = run_git(&path, &["commit", "-m", &message])?;
    Ok(hash.trim().to_string())
}

#[tauri::command]
pub fn git_branches(path: String) -> Result<Vec<String>, String> {
    let out = run_git(&path, &["branch", "--format=%(refname:short)"])?;
    Ok(out.lines().map(|l| l.trim().to_string()).collect())
}

#[tauri::command]
pub fn git_worktrees(path: String) -> Result<Vec<Worktree>, String> {
    let out = run_git(&path, &["worktree", "list", "--porcelain"])?;
    let mut worktrees = Vec::new();
    let mut current_path = String::new();
    let mut current_branch = String::new();
    for line in out.lines() {
        if let Some(p) = line.strip_prefix("worktree ") {
            if !current_path.is_empty() {
                worktrees.push(Worktree {
                    path: std::mem::take(&mut current_path),
                    branch: std::mem::take(&mut current_branch),
                });
            }
            current_path = p.trim().to_string();
        } else if let Some(b) = line.strip_prefix("branch ") {
            current_branch = b.trim().trim_start_matches("refs/heads/").to_string();
        }
    }
    if !current_path.is_empty() {
        worktrees.push(Worktree { path: current_path, branch: current_branch });
    }
    Ok(worktrees)
}

#[tauri::command]
pub fn git_create_worktree(path: String, branch: String, target: String) -> Result<(), String> {
    run_git(&path, &["worktree", "add", "-b", &branch, &target])?;
    Ok(())
}
