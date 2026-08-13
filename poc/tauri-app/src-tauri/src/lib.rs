// Tauri PoC — Rust Desktop Core. Pi runs as an RPC sidecar; the Desktop Core
// provides workspace/git/pty/settings/marketplace/session/model commands and
// forwards agent events to the React (webview) frontend.

pub mod pi;
pub mod workspace;
pub mod git;
pub mod pty;
pub mod settings;
pub mod marketplace;
pub mod session;
pub mod model;
pub mod projects;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(pi::PiShared::new())
        .manage(pty::init_state())
        .invoke_handler(tauri::generate_handler![
            pi::pi_prompt,
            pi::pi_respond_ui,
            pi::pi_steer,
            pi::pi_follow_up,
            pi::pi_abort,
            pi::pi_crash,
            pi::pi_status,
            workspace::open_project,
            workspace::list_files,
            workspace::read_file,
            workspace::write_file,
            git::git_status,
            git::git_diff,
            git::git_commit,
            git::git_branches,
            git::git_worktrees,
            git::git_create_worktree,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            settings::get_settings,
            settings::set_settings,
            marketplace::pi_list,
            marketplace::pi_install,
            marketplace::pi_remove,
            marketplace::ext_list,
            marketplace::ext_toggle,
            session::session_list,
            session::session_messages,
            session::get_session_state,
            session::create_session,
            model::get_models,
            model::set_model,
            model::set_thinking_level,
            projects::get_projects,
            projects::remove_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
