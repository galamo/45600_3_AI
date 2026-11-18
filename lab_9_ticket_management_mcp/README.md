# Lab 9 — Ticket Management (UI + Backend + MCP)

```
ui/          Vanilla HTML/JS/CSS ticket board (served by the backend)
backend/     Node.js + Express REST API, data saved to backend/data/db.json
mcp-server/  MCP server (Streamable HTTP) that reads/writes via the backend API
```

```
Browser UI ──REST──▶ backend :4000 ◀──REST── mcp-server :3300 ◀──MCP── AI client
                         │
                  data/db.json
```

## Run

```bash
# terminal 1
cd backend && npm install && npm start        # http://localhost:4000

# terminal 2
cd mcp-server && npm install && npm start     # http://localhost:3300/mcp
```

Env vars: `PORT` (backend), `MCP_PORT`, `BACKEND_URL`, `MCP_AUTH_TOKEN` (mcp-server).

On first start the backend seeds dummy users, projects, sprints and tickets.
Delete `backend/data/db.json` to reset.

## UI

- Users: list, add (any email), remove
- Projects and sprints: add a project, add a sprint to a project
- Tickets: create or edit (title, description, project, sprint, status, assignee),
  change status or assignee inline, delete, filter by project, sprint, status, assignee or title

Statuses: `open`, `in_progress`, `in_review`, `done`, `closed`

## REST API (`/api`)

| Method | Path | Notes |
|---|---|---|
| GET | `/meta` | statuses, users, projects, sprints in one call |
| GET/POST | `/users` | POST `{ email, name? }` |
| DELETE | `/users/:id` | that user's tickets become unassigned |
| GET/POST | `/projects` | POST `{ name }` |
| GET/POST | `/sprints` | GET `?projectId=`; POST `{ name, projectId }` |
| GET | `/tickets` | filters: `q`, `assignee` (id/email/name), `status`, `projectId`, `sprintId` |
| GET/PATCH/DELETE | `/tickets/:id` | |
| POST | `/tickets` | `{ title, description, projectId, sprintId, status, assigneeId }` |

## MCP tools

| Tool | State | Auth |
|---|---|---|
| `get_ticket` | implemented: by `id`, `name` (title contains) and/or `assignee` (name/email) | none |
| `create_ticket` | implemented: project, sprint and assignee by name or id | `Authorization: Bearer dummy-ticket-token` |
| `close_ticket` | stub (schema ready, returns "not implemented") | — |
| `change_ticket_status` | stub | — |
| `delete_ticket` | stub | — |

The stubs are in `mcp-server/create-ticket-server.js` and each has `TODO` steps.

### Client config example (Cursor / Claude Code)

```json
{
  "mcpServers": {
    "tickets": {
      "url": "http://localhost:3300/mcp",
      "headers": { "Authorization": "Bearer dummy-ticket-token" }
    }
  }
}
```

# EX1 
- implement the missing tools and also get_users 