// Headless test: settings get/set roundtrip (with restore to avoid side effects).

use poctauri_app_lib::settings::Settings;

#[test]
fn settings_roundtrip() {
    let orig = poctauri_app_lib::settings::get_settings().unwrap_or_default();

    let test = Settings {
        theme: "light".into(),
        locale: "zh".into(),
    };
    let saved = poctauri_app_lib::settings::set_settings(test).unwrap();
    assert_eq!(saved.theme, "light");
    assert_eq!(saved.locale, "zh");

    let read = poctauri_app_lib::settings::get_settings().unwrap();
    assert_eq!(read.theme, "light");
    assert_eq!(read.locale, "zh");

    // restore original
    let _ = poctauri_app_lib::settings::set_settings(orig);
}
