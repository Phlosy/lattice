use std::path::PathBuf;

/// Resolve the user's home consistently for GUI-launched apps on Unix and
/// Windows. Explorer-launched Windows processes commonly do not define HOME.
pub fn home_dir() -> PathBuf {
    if let Some(home) = std::env::var_os("HOME").filter(|value| !value.is_empty()) {
        return PathBuf::from(home);
    }
    if let Some(profile) = std::env::var_os("USERPROFILE").filter(|value| !value.is_empty()) {
        return PathBuf::from(profile);
    }
    match (
        std::env::var_os("HOMEDRIVE").filter(|value| !value.is_empty()),
        std::env::var_os("HOMEPATH").filter(|value| !value.is_empty()),
    ) {
        (Some(drive), Some(path)) => {
            let mut home = PathBuf::from(drive);
            home.push(path);
            home
        }
        _ => std::env::temp_dir(),
    }
}

pub fn pi_agent_dir() -> PathBuf {
    home_dir().join(".pi").join("agent")
}

pub fn session_dir() -> PathBuf {
    home_dir().join(".lattice").join("sessions")
}

pub fn prepare_session_dir() -> Result<PathBuf, String> {
    let destination = session_dir();
    std::fs::create_dir_all(&destination)
        .map_err(|error| format!("create session directory: {error}"))?;

    // v1.1.0 used a temporary directory. Preserve any surviving history once,
    // rather than silently dropping it when moving to durable storage. A marker
    // prevents a subsequently deleted migrated session from being resurrected.
    let migration_marker = destination.join(".temp-session-migration-v1");
    if !migration_marker.exists() {
        let mut legacy_dirs = vec![std::env::temp_dir().join("pi-tauri-sessions")];
        #[cfg(unix)]
        legacy_dirs.push(PathBuf::from("/tmp/pi-tauri-sessions"));
        legacy_dirs.sort();
        legacy_dirs.dedup();
        for legacy in legacy_dirs {
            if legacy == destination || !legacy.is_dir() {
                continue;
            }
            let entries = std::fs::read_dir(&legacy)
                .map_err(|error| format!("read legacy session directory: {error}"))?;
            for entry in entries {
                let entry = entry.map_err(|error| format!("read legacy session entry: {error}"))?;
                let source = entry.path();
                if source.extension().and_then(|value| value.to_str()) != Some("jsonl") {
                    continue;
                }
                let target = destination.join(entry.file_name());
                if !target.exists() {
                    std::fs::copy(&source, &target).map_err(|error| {
                        format!("migrate session {}: {error}", source.display())
                    })?;
                }
            }
        }
        std::fs::write(&migration_marker, b"completed\n")
            .map_err(|error| format!("write session migration marker: {error}"))?;
    }
    Ok(destination)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derived_paths_are_absolute() {
        assert!(home_dir().is_absolute());
        assert!(pi_agent_dir().is_absolute());
        assert!(session_dir().is_absolute());
    }
}
