# Lab 9 — Ticket Agent (Chatbot + LangChain + MCP)

```
Browser chat UI ──REST──▶ Express :5000 ──▶ LangChain createAgent (OpenRouter model)
                                                  │ tools loaded at runtime
                                                  ▼
                                   MCP server :3300/mcp ──▶ backend :4000
```

- `agent.js`: `MultiServerMCPClient` connects to the ticket MCP server and calls `getTools()`,
  so whatever tools the server exposes are discovered when the agent starts. No tool is hardcoded.
  The model is `ChatOpenRouter`, and the agent is built with `createAgent`.
- `server.js`: Express API and static UI
- `public/`: chatbot UI (shows the loaded tools, and which tools each answer used)

## Run

```bash
# 1. backend + MCP server (see ../lab_9_ticket_management_mcp)
cd ../lab_9_ticket_management_mcp/backend && npm start
cd ../lab_9_ticket_management_mcp/mcp-server && npm start

# 2. agent
cd lab_9_agent && npm install && npm start    # http://localhost:5000
```

## .env

| Var | Default |
|---|---|
| `OPENROUTER_API_KEY` | required |
| `OPENROUTER_MODEL` | `openrouter:gpt-5.4` |
| `PORT` | `5000` |
| `MCP_URL` | `http://localhost:3300/mcp` |
| `MCP_AUTH_TOKEN` | `dummy-ticket-token` (needed by `create_ticket`) |

## API

| Method | Path | Notes |
|---|---|---|
| POST | `/api/chat` | `{ messages: [{role, content}] }` → `{ reply, toolCalls }` |
| GET | `/api/tools` | tools currently loaded from MCP |
| POST | `/api/tools/reload` | reconnect to MCP and reload tools (after you add a tool) |
