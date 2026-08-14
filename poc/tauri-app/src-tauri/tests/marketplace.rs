// Headless test: structured marketplace listing does not require Node or a GUI.

#[test]
fn marketplace_list_works() {
    let out = poctauri_app_lib::marketplace::ext_list();
    assert!(out.is_ok(), "extension list should succeed: {:?}", out);
}
