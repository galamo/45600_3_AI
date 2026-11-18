/**
 * Lab 9 Ticket backend — REST API + static UI.
 *   UI:  http://localhost:4000
 *   API: http://localhost:4000/api/...
 */
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as store from "./lib/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "ui")));

app.use("/api", (req, _res, next) => {
  console.log(`[API] ${req.method} ${req.originalUrl}`);
  next();
});

// Wraps a handler so store errors map to proper HTTP status codes.
const handle = (fn, okStatus = 200) => (req, res) => {
  try {
    res.status(okStatus).json(fn(req));
  } catch (err) {
    if (err instanceof store.ValidationError) return res.status(400).json({ error: err.message });
    if (err instanceof store.NotFoundError) return res.status(404).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
};

app.get("/api/meta", handle(() => ({
  statuses: store.STATUSES,
  users: store.listUsers(),
  projects: store.listProjects(),
  sprints: store.listSprints(),
})));

app.get("/api/statuses", handle(() => store.STATUSES));

app.get("/api/users", handle(() => store.listUsers()));
app.post("/api/users", handle((req) => store.addUser(req.body), 201));
app.delete("/api/users/:id", handle((req) => store.deleteUser(req.params.id)));

app.get("/api/projects", handle(() => store.listProjects()));
app.post("/api/projects", handle((req) => store.addProject(req.body), 201));

app.get("/api/sprints", handle((req) => store.listSprints(req.query.projectId)));
app.post("/api/sprints", handle((req) => store.addSprint(req.body), 201));

app.get("/api/tickets", handle((req) => store.listTickets(req.query)));
app.get("/api/tickets/:id", handle((req) => store.getTicket(req.params.id)));
app.post("/api/tickets", handle((req) => store.createTicket(req.body), 201));
app.patch("/api/tickets/:id", handle((req) => store.updateTicket(req.params.id, req.body)));
app.delete("/api/tickets/:id", handle((req) => store.deleteTicket(req.params.id)));

app.get("/health", (_req, res) => res.json({ ok: true, service: "ticket-backend" }));

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`Lab 9 Ticket backend + UI on http://localhost:${PORT}`);
});
