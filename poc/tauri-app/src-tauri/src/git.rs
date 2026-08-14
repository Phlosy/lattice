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
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    pub path: String,
    pub index: String,
    pub working_dir: String,
    pub staged: bool,
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
    pub locked: bool,
}

#[tauri::command]
pub fn git_status(path: String) -> Result<GitStatus, String> {
    let branch = run_git(&path, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();
    let porcelain = run_git(
        &path,
        &["-c", "core.quotepath=false", "status", "--porcelain=v1"],
    )?;

    // Combine staged and unstaged line counts.
    let mut numstat_map: std::collections::HashMap<String, (u32, u32)> =
        std::collections::HashMap::new();
    for args in [
        ["-c", "core.quotepath=false", "diff", "--numstat"].as_slice(),
        [
            "-c",
            "core.quotepath=false",
            "diff",
            "--cached",
            "--numstat",
        ]
        .as_slice(),
    ] {
        for line in run_git(&path, args)?.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 3 {
                let added = parts[0].parse::<u32>().unwrap_or(0);
                let removed = parts[1].parse::<u32>().unwrap_or(0);
                let entry = numstat_map.entry(parts[2].to_string()).or_default();
                entry.0 += added;
                entry.1 += removed;
            }
        }
    }

    let mut files = Vec::new();
    for line in porcelain.lines() {
        if line.len() < 4 {
            continue;
        }
        let index = line[0..1].to_string();
        let working_dir = line[1..2].to_string();
        let raw_path = line[3..].trim();
        let file_path = raw_path
            .rsplit_once(" -> ")
            .map(|(_, destination)| destination)
            .unwrap_or(raw_path)
            .trim_matches('"')
            .to_string();
        let mut added = 0;
        let mut removed = 0;
        if index == "?" && working_dir == "?" {
            if let Ok(content) =
                std::fs::read_to_string(std::path::Path::new(&path).join(&file_path))
            {
                added = content.lines().count() as u32;
            }
        } else if let Some((file_added, file_removed)) = numstat_map.get(&file_path) {
            added = *file_added;
            removed = *file_removed;
        }
        let staged = index != " " && index != "?";
        files.push(GitFileStatus {
            path: file_path,
            index,
            working_dir,
            staged,
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
    let mut diff = run_git(&path, &["diff", "--cached", "--", &file])?;
    diff.push_str(&run_git(&path, &["diff", "--", &file])?);
    let status = run_git(&path, &["status", "--porcelain", "--", &file])?;
    if status.starts_with("??") {
        let full = std::path::Path::new(&path).join(&file);
        if let Ok(content) = std::fs::read_to_string(full) {
            let lines: Vec<&str> = content.lines().collect();
            diff.push_str(&format!(
                "diff --git a/{file} b/{file}\nnew file mode 100644\n--- /dev/null\n+++ b/{file}\n@@ -0,0 +1,{} @@\n",
                lines.len()
            ));
            for line in lines {
                diff.push('+');
                diff.push_str(line);
                diff.push('\n');
            }
        }
    }
    Ok(diff)
}

#[tauri::command]
pub fn git_commit(path: String, message: String) -> Result<String, String> {
    if message.trim().is_empty() {
        return Err("commit message cannot be empty".into());
    }
    // The UI presents one project-level Commit action and has no staging
    // controls, so its contract is to commit the currently displayed changes.
    run_git(&path, &["add", "-A"])?;
    run_git(&path, &["commit", "-m", message.trim()])?;
    run_git(&path, &["rev-parse", "HEAD"]).map(|hash| hash.trim().to_string())
}

#[tauri::command]
pub fn git_branches(path: String) -> Result<Vec<String>, String> {
    let out = run_git(&path, &["branch", "--format=%(refname:short)"])?;
    Ok(out.lines().map(|l| l.trim().to_string()).collect())
}

#[tauri::command]
pub fn git_checkout(path: String, branch: String) -> Result<(), String> {
    run_git(&path, &["checkout", &branch])?;
    Ok(())
}

#[tauri::command]
pub fn git_worktrees(path: String) -> Result<Vec<Worktree>, String> {
    let out = run_git(&path, &["worktree", "list", "--porcelain"])?;
    let mut worktrees = Vec::new();
    let mut current_path = String::new();
    let mut current_branch = String::new();
    let mut current_locked = false;
    for line in out.lines() {
        if let Some(p) = line.strip_prefix("worktree ") {
            if !current_path.is_empty() {
                worktrees.push(Worktree {
                    path: std::mem::take(&mut current_path),
                    branch: std::mem::take(&mut current_branch),
                    locked: current_locked,
                });
            }
            current_path = p.trim().to_string();
            current_locked = false;
        } else if let Some(b) = line.strip_prefix("branch ") {
            current_branch = b.trim().trim_start_matches("refs/heads/").to_string();
        } else if line == "locked" || line.starts_with("locked ") {
            current_locked = true;
        }
    }
    if !current_path.is_empty() {
        worktrees.push(Worktree {
            path: current_path,
            branch: current_branch,
            locked: current_locked,
        });
    }
    Ok(worktrees)
}

#[tauri::command]
pub fn git_create_worktree(path: String, branch: String, target: String) -> Result<(), String> {
    run_git(&path, &["worktree", "add", "-b", &branch, &target])?;
    Ok(())
}
