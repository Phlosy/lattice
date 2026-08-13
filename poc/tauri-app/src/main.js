// Tauri PoC frontend — minimal prompt UI driving the Pi sidecar via Rust.
// Verifies the full chain: webview → Tauri IPC → Rust → Pi RPC → streaming events back.

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

let outputEl;
let inputEl;

function log(msg) {
  const div = document.createElement("div");
  div.textContent = msg;
  outputEl.appendChild(div);
  outputEl.scrollTop = outputEl.scrollHeight;
}

async function prompt() {
  const text = inputEl.value.trim();
  if (!text) return;
  log(`> ${text}`);
  inputEl.value = "";
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

async function status() {
  const s = await invoke("pi_status");
  log(`status: ${s}`);
}

window.addEventListener("DOMContentLoaded", () => {
  outputEl = document.querySelector("#output");
  inputEl = document.querySelector("#input");
  document.querySelector("#send").addEventListener("click", prompt);
  document.querySelector("#abort").addEventListener("click", abort);
  document.querySelector("#crash").addEventListener("click", crash);
  document.querySelector("#status").addEventListener("click", status);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") prompt();
  });

  // Stream Pi events from Rust → webview
  listen("pi-event", (event) => {
    const e = event.payload;
    if (e.type === "message_update" && e.assistantMessageEvent?.type === "text_delta") {
      // Append streaming text (no newline per delta)
      const last = outputEl.lastElementChild;
      if (last && last.dataset.stream) {
        last.textContent += e.assistantMessageEvent.delta;
      } else {
        const div = document.createElement("div");
        div.dataset.stream = "1";
        div.textContent = e.assistantMessageEvent.delta;
        outputEl.appendChild(div);
      }
      outputEl.scrollTop = outputEl.scrollHeight;
    } else if (e.type === "tool_execution_start") {
      log(`[tool] ${e.toolName}`);
    } else if (e.type === "agent_start") {
      log("(agent started)");
    } else if (e.type === "agent_settled") {
      log("(agent settled)");
      const last = outputEl.lastElementChild;
      if (last?.dataset.stream) delete last.dataset.stream;
    }
  });

  listen("pi-exit", () => {
    log("(pi process exited — crash detected by Rust)");
  });

  status();
});
