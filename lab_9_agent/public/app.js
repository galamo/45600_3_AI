const TOKEN_KEY = "ticketAgentJwt";
const USER_KEY = "ticketAgentUser";

const chatEl = document.getElementById("chat");
const form = document.getElementById("form");
const input = document.getElementById("input");
const toolsEl = document.getElementById("tools");
const loginGate = document.getElementById("login-gate");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const appEl = document.getElementById("app");
const sessionEl = document.getElementById("session");

let history = []; // { role, content }
let auth = loadAuth();

function loadAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    user = null;
  }
  return { token, ...user };
}

function saveAuth({ token, username, role }) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify({ username, role }));
  auth = { token, username, role };
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  auth = null;
}

function authHeaders(extra = {}) {
  return {
    ...extra,
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
  };
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: authHeaders({
      "Content-Type": "application/json",
      ...options.headers,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearAuth();
    showLogin(data.error || "Session expired. Sign in again.");
    throw new Error(data.error || "Unauthorized");
  }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function showLogin(message) {
  appEl.hidden = true;
  loginGate.hidden = false;
  loginError.hidden = !message;
  loginError.textContent = message || "";
  document.getElementById("login-user").focus();
}

function showApp() {
  loginGate.hidden = true;
  appEl.hidden = false;
  const who = [auth?.username, auth?.role].filter(Boolean).join(" · ");
  sessionEl.textContent = who || "Signed in";
  input.focus();
}

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
  try {
    const data = await api(reload ? "/api/tools/reload" : "/api/tools", {
      method: reload ? "POST" : "GET",
    });
    renderTools(data);
  } catch (err) {
    if (auth) renderTools({ error: err.message });
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const btn = loginForm.querySelector("button");
  const username = document.getElementById("login-user").value.trim();
  const password = document.getElementById("login-pass").value;
  btn.disabled = true;
  try {
    const data = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || res.statusText);
      return body;
    });
    saveAuth({ token: data.token, username: data.username, role: data.role });
    document.getElementById("login-pass").value = "";
    showApp();
    await loadTools();
  } catch (err) {
    loginError.hidden = false;
    loginError.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

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
    const data = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: history }),
    });
    pending.remove();
    addMessage("assistant", data.reply, data.toolCalls);
    history.push({ role: "assistant", content: data.reply });
  } catch (err) {
    pending.remove();
    if (auth) {
      addMessage("error", `Error: ${err.message}`);
      history.pop();
    }
  } finally {
    btn.disabled = input.disabled = false;
    if (auth) input.focus();
  }
});

document.getElementById("examples").addEventListener("click", (e) => {
  if (e.target.tagName === "LI") {
    input.value = e.target.textContent;
    input.focus();
  }
});
document.getElementById("reload").addEventListener("click", () => loadTools(true));
document.getElementById("clear").addEventListener("click", () => {
  history = [];
  chatEl.innerHTML = "";
});
document.getElementById("logout").addEventListener("click", async () => {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
  clearAuth();
  history = [];
  chatEl.innerHTML = "";
  showLogin();
});

async function boot() {
  if (!auth?.token) {
    showLogin();
    return;
  }
  showApp();
  try {
    await api("/api/auth/me");
    await loadTools();
  } catch {
    /* showLogin already handled on 401 */
  }
}

boot();
