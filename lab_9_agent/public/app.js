const chatEl = document.getElementById("chat");
const form = document.getElementById("form");
const input = document.getElementById("input");
const toolsEl = document.getElementById("tools");

let history = []; // { role, content }

function addMessage(role, text, toolCalls = []) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  if (toolCalls.length) {
    const d = document.createElement("details");
    d.className = "tools-used";
    const s = document.createElement("summary");
    s.textContent = `Tools used: ${toolCalls.map((t) => t.name).join(", ")}`;
    const pre = document.createElement("pre");
    pre.textContent = toolCalls.map((t) => `${t.name}(${JSON.stringify(t.args)})`).join("\n");
    d.append(s, pre);
    div.append(d);
  }
  chatEl.append(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

function renderTools(data) {
  toolsEl.innerHTML = "";
  if (data.error) {
    toolsEl.innerHTML = `<li class="error"></li>`;
    toolsEl.firstChild.textContent = data.error;
    return;
  }
  for (const t of data.tools) {
    const li = document.createElement("li");
    const code = document.createElement("code");
    code.textContent = t.name;
    const desc = document.createElement("span");
    desc.className = "desc";
    desc.textContent = t.description;
    li.append(code, desc);
    toolsEl.append(li);
  }
}

async function loadTools(reload = false) {
  toolsEl.innerHTML = `<li class="muted">Loading…</li>`;
  const res = await fetch(reload ? "/api/tools/reload" : "/api/tools", { method: reload ? "POST" : "GET" });
  renderTools(await res.json());
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  addMessage("user", text);
  history.push({ role: "user", content: text });

  const btn = form.querySelector("button");
  btn.disabled = input.disabled = true;
  const pending = addMessage("assistant", "Thinking…");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });
    const data = await res.json();
    pending.remove();
    if (!res.ok) throw new Error(data.error || res.statusText);
    addMessage("assistant", data.reply, data.toolCalls);
    history.push({ role: "assistant", content: data.reply });
  } catch (err) {
    pending.remove();
    addMessage("error", `Error: ${err.message}`);
    history.pop();
  } finally {
    btn.disabled = input.disabled = false;
    input.focus();
  }
});

document.getElementById("examples").addEventListener("click", (e) => {
  if (e.target.tagName === "LI") { input.value = e.target.textContent; input.focus(); }
});
document.getElementById("reload").addEventListener("click", () => loadTools(true));
document.getElementById("clear").addEventListener("click", () => { history = []; chatEl.innerHTML = ""; });

loadTools();
