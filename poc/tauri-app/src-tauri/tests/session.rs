// Headless test: session_list / session_messages against a scratch JSONL session file.

use std::fs;

#[test]
fn session_roundtrip() {
    let dir = std::env::temp_dir().join(format!("lattice-session-test-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();

    let file = dir.join("2024-01-01T00-00-00-000Z_abc123.jsonl");
    fs::write(
        &file,
        concat!(
            "{\"type\":\"session\",\"version\":3,\"id\":\"abc123\",\"timestamp\":\"2024-01-01T00:00:00.000Z\",\"cwd\":\"/tmp/proj\"}\n",
            "{\"type\":\"message\",\"id\":\"m1\",\"parentId\":null,\"timestamp\":\"t\",\"message\":{\"role\":\"user\",\"content\":\"hello\",\"timestamp\":1}}\n",
            "{\"type\":\"message\",\"id\":\"m2\",\"parentId\":\"m1\",\"timestamp\":\"t\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"hi\"}],\"timestamp\":2}}\n",
        ),
    )
    .unwrap();

    let list = poctauri_app_lib::session::session_list(dir.to_string_lossy().to_string()).unwrap();
    assert_eq!(list.len(), 1, "list: {list:?}");
    assert_eq!(list[0].id, "abc123");
    assert_eq!(list[0].cwd, "/tmp/proj");
    assert_eq!(list[0].message_count, 2);

    let msgs =
        poctauri_app_lib::session::session_messages(file.to_string_lossy().to_string()).unwrap();
    assert_eq!(msgs.len(), 2);
    assert_eq!(msgs[0]["role"], "user");
    assert_eq!(msgs[1]["role"], "assistant");

    let _ = fs::remove_dir_all(&dir);
}
