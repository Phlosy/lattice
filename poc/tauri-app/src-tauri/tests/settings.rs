// Headless test: complete settings shape and partial-patch persistence.

#[test]
fn settings_roundtrip() {
    let orig = poctauri_app_lib::settings::get_settings().unwrap_or_default();

    let saved = poctauri_app_lib::settings::set_settings(serde_json::json!({
        "theme": "light",
        "locale": "zh",
        "fontSize": 16,
    }))
    .unwrap();
    assert_eq!(saved.theme, "light");
    assert_eq!(saved.locale, "zh");
    assert_eq!(saved.font_size, 16);
    assert_eq!(saved.accent, orig.accent);

    let read = poctauri_app_lib::settings::get_settings().unwrap();
    assert_eq!(read.theme, "light");
    assert_eq!(read.locale, "zh");
    assert_eq!(read.font_size, 16);

    // Restore the original complete value.
    let _ = poctauri_app_lib::settings::set_settings(serde_json::to_value(orig).unwrap());
}
