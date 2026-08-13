// Tauri PoC frontend — Workspace (open/list/read) + Pi sidecar prompt.
// Verifies: webview → Tauri IPC → Rust → fs / Pi RPC → streaming events.

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

let currentPath = null;

function $(id) {
  return document.querySelector(id);
}

function log(msg) {
  const div = document.createElement("div");
  div.textContent = msg;
  $("#output").appendChild(div);
  $("#output").scrollTop = $("#output").scrollHeight;
}

async function openProject() {
  const path = $("#path").value.trim();
  if (!path) return;
  const info = await invoke("open_project", { path });
  currentPath = info.path;
  log(`opened project: ${info.path}`);
  await refreshFiles();
  await refreshGit();
}

async function refreshGit() {
  if (!currentPath) return;
  try {
    const st = await invoke("git_status", { path: currentPath });
    const changes = st.clean ? "clean" : `${st.files.length} changed (+${st.added} −${st.removed})`;
    $("#ws-name").textContent = `${$("#ws-name").textContent} · ${st.branch} ${changes}`;
  } catch {
    // not a git repo
  }
}

async function refreshFiles() {
  if (!currentPath) return;
  const files = await invoke("list_files", { path: currentPath, maxFiles: 400 });
  $("#files").innerHTML = "";
  for (const f of files) {
    const div = document.createElement("div");
    div.className = "file";
    div.textContent = f;
    div.onclick = () => viewFile(f);
    $("#files").appendChild(div);
  }
}

async function viewFile(rel) {
  const full = `${currentPath}/${rel}`;
  try {
    // Prefer git diff when the file has changes, else read raw content
    const diff = await invoke("git_diff", { path: currentPath, file: rel }).catch(() => null);
    if (diff) {
      $("#viewer").textContent = diff;
    } else {
      const content = await invoke("read_file", { path: full });
      $("#viewer").textContent = content;
    }
  } catch (e) {
    $("#viewer").textContent = `(binary or unreadable) ${e}`;
  }
}

async function prompt() {
  const text = $("#input").value.trim();
  if (!text) return;
  log(`> ${text}`);
  $("#input").value = "";
  await invoke("pi_prompt", { text });
}

async function abort() {
  await invoke("pi_abort");
  log("(abort sent)");
}

async function crash() {
  await invoke("pi_crash");
  log("(pi killed — crash isolation test)");
}

window.addEventListener("DOMContentLoaded", () => {
  $("#open").addEventListener("click", openProject);
  $("#send").addEventListener("click", prompt);
  $("#abort").addEventListener("click", abort);
  $("#crash").addEventListener("click", crash);
  $("#input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") prompt();
  });
  $("#path").addEventListener("keydown", (e) => {
    if (e.key === "Enter") openProject();
  });

  listen("pi-event", (event) => {
    const e = event.payload;
    if (e.type === "message_update" && e.assistantMessageEvent?.type === "text_delta") {
      const last = $("#output").lastElementChild;
      if (last && last.dataset.stream) {
        last.textContent += e.assistantMessageEvent.delta;
      } else {
        const div = document.createElement("div");
        div.dataset.stream = "1";
        div.textContent = e.assistantMessageEvent.delta;
        $("#output").appendChild(div);
      }
      $("#output").scrollTop = $("#output").scrollHeight;
    } else if (e.type === "tool_execution_start") {
      log(`[tool] ${e.toolName}`);
    } else if (e.type === "agent_settled") {
      log("(agent settled)");
      const last = $("#output").lastElementChild;
      if (last?.dataset.stream) delete last.dataset.stream;
    }
  });

  listen("pi-exit", () => {
    log("(pi process exited — crash detected by Rust)");
  });
});
