// Headless test: marketplace bridge (pi_list is a local operation, no network).

#[test]
fn marketplace_list_works() {
    let out = poctauri_app_lib::marketplace::pi_list();
    assert!(out.is_ok(), "pi list should succeed: {:?}", out);
}
