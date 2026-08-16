// Tauri PoC — Rust Desktop Core. Pi runs as an RPC sidecar; the Desktop Core
// provides workspace/git/pty/settings/marketplace/session/model commands and
// forwards agent events to the React (webview) frontend.

pub mod app;
pub mod git;
pub mod marketplace;
pub mod model;
pub mod paths;
pub mod pi;
pub mod projects;
#[cfg(desktop)]
pub mod pty;
pub mod session;
pub mod settings;
pub mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(std::sync::Arc::new(pi::PiShared::new()));
    #[cfg(desktop)]
    let builder = builder.manage(pty::init_state());
    builder
        .invoke_handler(tauri::generate_handler![
            app::app_info,
            pi::pi_set_cwd,
            pi::pi_prompt,
            pi::pi_respond_ui,
            pi::pi_steer,
            pi::pi_follow_up,
            pi::pi_abort,
            pi::pi_continue,
            pi::pi_crash,
            pi::pi_stop,
            pi::pi_status,
            pi::pi_set_executable,
            pi::runtime_detect,
            workspace::open_project,
            workspace::list_files,
            workspace::read_file,
            workspace::write_file,
            git::git_status,
            git::git_diff,
            git::git_commit,
            git::git_branches,
            git::git_checkout,
            git::git_worktrees,
            git::git_create_worktree,
            #[cfg(desktop)]
            pty::pty_spawn,
            #[cfg(desktop)]
            pty::pty_write,
            #[cfg(desktop)]
            pty::pty_resize,
            #[cfg(desktop)]
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
            session::open_session,
            session::rename_session,
            session::delete_session,
            model::get_models,
            model::get_providers,
            model::login,
            model::set_model,
            model::set_thinking_level,
            projects::get_projects,
            projects::remove_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
