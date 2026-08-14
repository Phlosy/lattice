# Interactive testing (dev + manual)

Run the whole app locally and exercise it by hand. This uses the debug Rust
build with the pre-built React frontend.

## Prerequisites (once)

```bash
npm ci --ignore-scripts
```

## Run

```bash
# 1. Build the frontend (this config has no HMR, so rebuild after UI changes)
npm run build:ui

# 2. Launch the app (debug Rust build; Rust recompiles on change)
npm run dev
```

Then interact manually. To keep evidence, dump screenshots / logs under
`testing/artifacts/dev/` (git-ignored):

```bash
screencapture -x testing/artifacts/dev/00-welcome.png
```

## Manual checklist

- [ ] Open a folder / git repo (sidebar → 打开文件夹 / Open folder)
- [ ] Create a session (＋ 新建 / New)
- [ ] Select a model (选择模型) — DeepSeek / OpenAI appear when credentials exist
- [ ] Send a prompt → streamed text + reasoning block + tool card
- [ ] Trigger a permission dialog (bash / write) → Allow once / Deny
- [ ] Terminal (⌘ 终端): run a command
- [ ] Git panel: status / diff / commit
- [ ] Settings → switch theme + language (en / zh) → survives app restart
- [ ] Quit (Cmd+Q) → confirm no leftover sidecar process:

```bash
ps -axo command | grep 'pi --mode rpc' | grep -v grep   # empty = OK
```
