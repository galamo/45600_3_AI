/**
 * JSON-file data store for users, projects, sprints and tickets.
 * Data lives in backend/data/db.json and is seeded with dummy data on first run.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

export const STATUSES = ["open", "in_progress", "in_review", "done", "closed"];

function seed() {
  const now = new Date().toISOString();
  const users = [
    { id: "u1", name: "Alice Cohen", email: "alice@example.com" },
    { id: "u2", name: "Ben Levi", email: "ben@example.com" },
    { id: "u3", name: "Dana Mizrahi", email: "dana@example.com" },
    { id: "u4", name: "Omer Katz", email: "omer@example.com" },
  ];
  const projects = [
    { id: "p1", name: "Web App" },
    { id: "p2", name: "Mobile App" },
    { id: "p3", name: "AI Platform" },
  ];
  const sprints = [
    { id: "s1", name: "Sprint 1", projectId: "p1" },
    { id: "s2", name: "Sprint 2", projectId: "p1" },
    { id: "s3", name: "Sprint 1", projectId: "p2" },
    { id: "s4", name: "Sprint 1", projectId: "p3" },
  ];
  const tickets = [
    {
      id: 1,
      title: "Login page layout broken on Safari",
      description: "The login button overflows its container on Safari 17.",
      projectId: "p1",
      sprintId: "s1",
      status: "open",
      assigneeId: "u1",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 2,
      title: "Add push notifications",
      description: "Send a push notification when a ticket is assigned.",
      projectId: "p2",
      sprintId: "s3",
      status: "in_progress",
      assigneeId: "u2",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 3,
      title: "Build MCP server for tickets",
      description: "Expose ticket tools to AI agents over Streamable HTTP.",
      projectId: "p3",
      sprintId: "s4",
      status: "in_review",
      assigneeId: "u3",
      createdAt: now,
      updatedAt: now,
    },
  ];
  return { users, projects, sprints, tickets, nextTicketId: 4 };
}

let db = load();

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    const fresh = seed();
    persist(fresh);
    return fresh;
  }
}

function persist(data = db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

export class ValidationError extends Error {}
export class NotFoundError extends Error {}

const required = (value, field) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`"${field}" is required`);
  }
  return value.trim();
};

// ---------- Users ----------
export const listUsers = () => db.users;

export function addUser({ name, email }) {
  const cleanEmail = required(email, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new ValidationError("Invalid email address");
  }
  if (db.users.some((u) => u.email === cleanEmail)) {
    throw new ValidationError(`User with email ${cleanEmail} already exists`);
  }
  const user = {
    id: randomUUID().slice(0, 8),
    name: name?.trim() || cleanEmail.split("@")[0],
    email: cleanEmail,
  };
  db.users.push(user);
  persist();
  return user;
}

export function deleteUser(id) {
  const idx = db.users.findIndex((u) => u.id === id);
  if (idx === -1) throw new NotFoundError(`User ${id} not found`);
  const [removed] = db.users.splice(idx, 1);
  db.tickets.forEach((t) => {
    if (t.assigneeId === id) t.assigneeId = null;
  });
  persist();
  return removed;
}

// ---------- Projects & sprints ----------
export const listProjects = () => db.projects;

export function addProject({ name }) {
  const project = { id: randomUUID().slice(0, 8), name: required(name, "name") };
  db.projects.push(project);
  persist();
  return project;
}

export const listSprints = (projectId) =>
  projectId ? db.sprints.filter((s) => s.projectId === projectId) : db.sprints;

export function addSprint({ name, projectId }) {
  if (!db.projects.some((p) => p.id === projectId)) {
    throw new ValidationError("A valid projectId is required");
  }
  const sprint = { id: randomUUID().slice(0, 8), name: required(name, "name"), projectId };
  db.sprints.push(sprint);
  persist();
  return sprint;
}

// ---------- Tickets ----------
function validateRefs({ projectId, sprintId, assigneeId, status }) {
  if (projectId != null && !db.projects.some((p) => p.id === projectId)) {
    throw new ValidationError(`Unknown projectId: ${projectId}`);
  }
  if (sprintId) {
    const sprint = db.sprints.find((s) => s.id === sprintId);
    if (!sprint) throw new ValidationError(`Unknown sprintId: ${sprintId}`);
    if (projectId && sprint.projectId !== projectId) {
      throw new ValidationError("Sprint does not belong to the selected project");
    }
  }
  if (assigneeId && !db.users.some((u) => u.id === assigneeId)) {
    throw new ValidationError(`Unknown assigneeId: ${assigneeId}`);
  }
  if (status != null && !STATUSES.includes(status)) {
    throw new ValidationError(`Invalid status. Use one of: ${STATUSES.join(", ")}`);
  }
}

/** Ticket with resolved project/sprint/assignee objects, handy for UI and MCP. */
export function expandTicket(t) {
  return {
    ...t,
    project: db.projects.find((p) => p.id === t.projectId) ?? null,
    sprint: db.sprints.find((s) => s.id === t.sprintId) ?? null,
    assignee: db.users.find((u) => u.id === t.assigneeId) ?? null,
  };
}

/**
 * Filters: q (title contains), assignee (user id, email or name contains),
 * status, projectId, sprintId.
 */
export function listTickets({ q, assignee, status, projectId, sprintId } = {}) {
  let result = db.tickets;
  if (q) {
    const needle = q.toLowerCase();
    result = result.filter((t) => t.title.toLowerCase().includes(needle));
  }
  if (assignee) {
    const needle = assignee.toLowerCase();
    const ids = new Set(
      db.users
        .filter(
          (u) =>
            u.id === assignee ||
            u.email === needle ||
            u.name.toLowerCase().includes(needle)
        )
        .map((u) => u.id)
    );
    result = result.filter((t) => ids.has(t.assigneeId));
  }
  if (status) result = result.filter((t) => t.status === status);
  if (projectId) result = result.filter((t) => t.projectId === projectId);
  if (sprintId) result = result.filter((t) => t.sprintId === sprintId);
  return result.map(expandTicket);
}

export function getTicket(id) {
  const ticket = db.tickets.find((t) => t.id === Number(id));
  if (!ticket) throw new NotFoundError(`Ticket ${id} not found`);
  return expandTicket(ticket);
}

export function createTicket(input) {
  const ticket = {
    id: db.nextTicketId++,
    title: required(input.title, "title"),
    description: input.description?.trim() ?? "",
    projectId: input.projectId || null,
    sprintId: input.sprintId || null,
    status: input.status || "open",
    assigneeId: input.assigneeId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  validateRefs(ticket);
  db.tickets.push(ticket);
  persist();
  return expandTicket(ticket);
}

const EDITABLE = ["title", "description", "projectId", "sprintId", "status", "assigneeId"];

export function updateTicket(id, patch) {
  const ticket = db.tickets.find((t) => t.id === Number(id));
  if (!ticket) throw new NotFoundError(`Ticket ${id} not found`);
  const next = { ...ticket };
  for (const key of EDITABLE) {
    if (key in patch) next[key] = patch[key] === "" ? null : patch[key];
  }
  next.title = required(next.title, "title");
  next.description = next.description ?? "";
  // Changing project clears a sprint that belongs to another project.
  if (next.sprintId) {
    const sprint = db.sprints.find((s) => s.id === next.sprintId);
    if (sprint && sprint.projectId !== next.projectId && "projectId" in patch && !("sprintId" in patch)) {
      next.sprintId = null;
    }
  }
  validateRefs(next);
  next.updatedAt = new Date().toISOString();
  Object.assign(ticket, next);
  persist();
  return expandTicket(ticket);
}

export function deleteTicket(id) {
  const idx = db.tickets.findIndex((t) => t.id === Number(id));
  if (idx === -1) throw new NotFoundError(`Ticket ${id} not found`);
  const [removed] = db.tickets.splice(idx, 1);
  persist();
  return removed;
}
