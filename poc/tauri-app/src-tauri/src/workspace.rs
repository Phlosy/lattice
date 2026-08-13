// Workspace + filesystem commands for the Tauri Desktop Core.
// These replace the Electron main-process equivalents (WorkspaceManager,
// fs helpers) in the migration.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

const IGNORED_DIRS: &[&str] = &[
    "node_modules", ".git", "dist", "out", "build", "release", "target",
    ".next", ".cache", "coverage", ".venv", "__pycache__", ".DS_Store",
];

#[derive(Serialize)]
pub struct ProjectInfo {
    pub path: String,
    pub name: String,
}

/// Open (validate) a project directory.
#[tauri::command]
pub fn open_project(path: String) -> Result<ProjectInfo, String> {
    let p = Path::new(&path);
    if !p.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| path.clone());
    Ok(ProjectInfo { path, name })
}

/// Recursively list project files (relative paths), bounded.
#[tauri::command]
pub fn list_files(path: String, max_files: usize) -> Result<Vec<String>, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }
    let mut out = Vec::new();
    walk(&root, &root, &mut out, max_files.max(1), 0, 6);
    Ok(out)
}

/// Read a text file (bounded size).
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    let content = fs::read_to_string(&path).map_err(|e| format!("read {path}: {e}"))?;
    Ok(content)
}

/// Write a text file (create parent dirs).
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    fs::write(p, content).map_err(|e| format!("write {path}: {e}"))?;
    Ok(())
}

fn walk(root: &Path, dir: &Path, out: &mut Vec<String>, max: usize, depth: usize, max_depth: usize) {
    if depth > max_depth || out.len() >= max {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        if out.len() >= max {
            return;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy().to_string();
        if IGNORED_DIRS.contains(&name.as_str()) {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            walk(root, &path, out, max, depth + 1, max_depth);
        } else if let Ok(rel) = path.strip_prefix(root) {
            out.push(rel.to_string_lossy().to_string());
        }
    }
}
