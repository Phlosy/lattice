#[tauri::command]
pub fn app_info(app: tauri::AppHandle) -> serde_json::Value {
    let package = app.package_info();
    serde_json::json!({
        "name": package.name,
        "version": package.version.to_string(),
        "platform": std::env::consts::OS,
    })
}
