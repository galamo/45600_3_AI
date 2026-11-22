# Lab 9 — Ticket Agent (Chatbot + LangChain + MCP)

```
Browser chat UI ──REST──▶ Express :5000 ──▶ LangChain createAgent (OpenRouter model)
     │ login                         │ Bearer JWT on tools/chat
     ▼                               ▼
MCP POST /auth :3300 ──JWT──▶ MCP server :3300/mcp ──▶ backend :4000
```

- `agent.js`: `MultiServerMCPClient` connects to the ticket MCP server with the user's JWT and calls `getTools()`,
  so whatever tools the server exposes are discovered when the agent starts. No tool is hardcoded.
  The model is `ChatOpenRouter`, and the agent is built with `createAgent`.
- `server.js`: Express API, login proxy to MCP `/auth`, and static UI
- `public/`: chatbot UI (login gate, loaded tools, tools used per answer)

## Run

```bash
# 1. backend + MCP server (see ../lab_9_ticket_management_mcp)
cd ../lab_9_ticket_management_mcp/backend && npm start
cd ../lab_9_ticket_management_mcp/mcp-server && npm start

# 2. agent
cd lab_9_agent && npm install && npm start    # http://localhost:5000
```

Open the UI and sign in with an MCP user (`galamo` / `romanb` — passwords from the MCP server `.env`).
The JWT from `POST /auth` is stored in the browser and sent on every agent API call.

## .env

| Var | Default |
|---|---|
| `OPENROUTER_API_KEY` | required |
| `OPENROUTER_MODEL` | `openrouter:gpt-5.4` |
| `PORT` | `5000` |
| `MCP_URL` | `http://localhost:3300/mcp` |
| `MCP_AUTH_URL` | derived from `MCP_URL` → `…/auth` |

## API

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | public | `{ username, password }` → `{ token, role, username }` (via MCP `/auth`) |
| POST | `/api/auth/logout` | public | drops in-memory MCP agent session |
| GET | `/api/auth/me` | Bearer JWT | validates JWT by opening an MCP session |
| POST | `/api/chat` | Bearer JWT | `{ messages: [{role, content}] }` → `{ reply, toolCalls }` |
| GET | `/api/tools` | Bearer JWT | tools currently loaded from MCP |
| POST | `/api/tools/reload` | Bearer JWT | reconnect to MCP and reload tools |
