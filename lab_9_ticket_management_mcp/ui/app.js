// Ticket Board UI — vanilla JS talking to the backend REST API (same origin).
const state = { statuses: [], users: [], projects: [], sprints: [], tickets: [], editingId: null };
const $ = (sel) => document.querySelector(sel);

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg, isError = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast${isError ? " err" : ""}`;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 2500);
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const label = (status) => status.replace(/_/g, " ");

function options(items, { valueKey = "id", text = (i) => i.name, empty, selected } = {}) {
  const head = empty !== undefined ? `<option value="">${esc(empty)}</option>` : "";
  return head + items
    .map((i) => {
      const value = typeof i === "string" ? i : i[valueKey];
      const txt = typeof i === "string" ? label(i) : text(i);
      return `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(txt)}</option>`;
    })
    .join("");
}

const sprintsFor = (projectId) => state.sprints.filter((s) => s.projectId === projectId);

// ---------- Loading ----------
async function loadMeta() {
  Object.assign(state, await api("/meta"));
  renderSidebar();
  renderFilterOptions();
}

async function loadTickets() {
  const params = new URLSearchParams();
  const pairs = { q: $("#fSearch").value, projectId: $("#fProject").value, sprintId: $("#fSprint").value, status: $("#fStatus").value, assignee: $("#fAssignee").value };
  for (const [k, v] of Object.entries(pairs)) if (v) params.set(k, v);
  state.tickets = await api(`/tickets?${params}`);
  renderTickets();
}

// ---------- Rendering ----------
function renderSidebar() {
  $("#userList").innerHTML = state.users
    .map((u) => `<li><span>${esc(u.name)}<small>${esc(u.email)}</small></span>
      <button class="link" data-del-user="${esc(u.id)}" title="Remove user">✕</button></li>`)
    .join("");

  $("#projectList").innerHTML = state.projects
    .map((p) => `<li><span>${esc(p.name)}<span class="sprints"> · ${sprintsFor(p.id).map((s) => esc(s.name)).join(", ") || "no sprints"}</span></span></li>`)
    .join("");

  $("#sprintForm [name=projectId]").innerHTML = options(state.projects, { empty: "Select project…" });
}

function renderFilterOptions() {
  const keep = (sel) => $(sel).value;
  const p = keep("#fProject"), s = keep("#fSprint"), st = keep("#fStatus"), a = keep("#fAssignee");
  $("#fProject").innerHTML = options(state.projects, { empty: "All projects", selected: p });
  const sprintList = p ? sprintsFor(p) : state.sprints;
  $("#fSprint").innerHTML = options(sprintList, {
    empty: "All sprints", selected: s,
    text: (sp) => p ? sp.name : `${sp.name} (${state.projects.find((x) => x.id === sp.projectId)?.name ?? "?"})`,
  });
  $("#fStatus").innerHTML = options(state.statuses, { empty: "All statuses", selected: st });
  $("#fAssignee").innerHTML = options(state.users, { empty: "All assignees", selected: a });
}

function renderTickets() {
  const rows = state.tickets.map((t) => `
    <tr class="status-${esc(t.status)}">
      <td>${t.id}</td>
      <td class="title" data-edit="${t.id}"><strong>${esc(t.title)}</strong><small>${esc(t.description)}</small></td>
      <td>${esc(t.project?.name ?? "—")}</td>
      <td>${esc(t.sprint?.name ?? "—")}</td>
      <td><select data-field="status" data-id="${t.id}">${options(state.statuses, { selected: t.status })}</select></td>
      <td><select data-field="assigneeId" data-id="${t.id}">${options(state.users, { empty: "Unassigned", selected: t.assigneeId ?? "" })}</select></td>
      <td><button class="link" data-del-ticket="${t.id}" title="Delete ticket">Delete</button></td>
    </tr>`);
  $("#ticketRows").innerHTML = rows.join("");
  $("#emptyState").hidden = state.tickets.length > 0;
}

// ---------- Ticket dialog ----------
function fillDialogSprints(projectId, selected) {
  $("#ticketForm [name=sprintId]").innerHTML = options(sprintsFor(projectId), { empty: projectId ? "No sprint" : "Pick a project first", selected });
}

function openDialog(ticket) {
  const form = $("#ticketForm").elements;
  state.editingId = ticket?.id ?? null;
  $("#dialogTitle").textContent = ticket ? `Edit ticket #${ticket.id}` : "New ticket";
  form.title.value = ticket?.title ?? "";
  form.description.value = ticket?.description ?? "";
  form.projectId.innerHTML = options(state.projects, { empty: "No project", selected: ticket?.projectId ?? "" });
  fillDialogSprints(ticket?.projectId ?? "", ticket?.sprintId ?? "");
  form.status.innerHTML = options(state.statuses, { selected: ticket?.status ?? "open" });
  form.assigneeId.innerHTML = options(state.users, { empty: "Unassigned", selected: ticket?.assigneeId ?? "" });
  $("#formError").hidden = true;
  $("#ticketDialog").showModal();
  form.title.focus();
}

// ---------- Events ----------
$("#newTicketBtn").onclick = () => openDialog(null);
$("#cancelBtn").onclick = () => $("#ticketDialog").close();
$("#ticketForm").elements.projectId.onchange = (e) => fillDialogSprints(e.target.value, "");

$("#ticketForm").onsubmit = async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  try {
    if (state.editingId) {
      await api(`/tickets/${state.editingId}`, { method: "PATCH", body });
      toast(`Ticket #${state.editingId} updated`);
    } else {
      const t = await api("/tickets", { method: "POST", body });
      toast(`Ticket #${t.id} created`);
    }
    $("#ticketDialog").close();
    loadTickets();
  } catch (err) {
    $("#formError").textContent = err.message;
    $("#formError").hidden = false;
  }
};

$("#ticketRows").addEventListener("change", async (e) => {
  const { field, id } = e.target.dataset;
  if (!field) return;
  try {
    await api(`/tickets/${id}`, { method: "PATCH", body: { [field]: e.target.value } });
    toast(`Ticket #${id} saved`);
    loadTickets();
  } catch (err) {
    toast(err.message, true);
  }
});

$("#ticketRows").addEventListener("click", async (e) => {
  const editId = e.target.closest("[data-edit]")?.dataset.edit;
  if (editId) return openDialog(state.tickets.find((t) => t.id === Number(editId)));
  const delId = e.target.dataset.delTicket;
  if (delId && confirm(`Delete ticket #${delId}?`)) {
    try {
      await api(`/tickets/${delId}`, { method: "DELETE" });
      toast(`Ticket #${delId} deleted`);
      loadTickets();
    } catch (err) { toast(err.message, true); }
  }
});

$("#userList").addEventListener("click", async (e) => {
  const id = e.target.dataset.delUser;
  if (!id || !confirm("Remove this user? Their tickets become unassigned.")) return;
  try {
    await api(`/users/${id}`, { method: "DELETE" });
    await loadMeta();
    loadTickets();
  } catch (err) { toast(err.message, true); }
});

function bindCreateForm(selector, path, successMsg) {
  $(selector).onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(path, { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
      e.target.reset();
      toast(successMsg);
      await loadMeta();
    } catch (err) { toast(err.message, true); }
  };
}
bindCreateForm("#userForm", "/users", "User added");
bindCreateForm("#projectForm", "/projects", "Project added");
bindCreateForm("#sprintForm", "/sprints", "Sprint added");

let searchTimer;
$("#fSearch").oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadTickets, 250); };
$("#fProject").onchange = () => { $("#fSprint").value = ""; renderFilterOptions(); loadTickets(); };
for (const id of ["#fSprint", "#fStatus", "#fAssignee"]) $(id).onchange = loadTickets;

loadMeta().then(loadTickets).catch((err) => toast(err.message, true));
