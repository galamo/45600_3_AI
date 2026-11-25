# Lab 09 b — Multi-Agent Router with Agents as Tools

> ▶ **Animated flows:** [L09b-router-agents-as-tools.html](../../demo/Flows/L09b-router-agents-as-tools.html) (docs + diagram routes and the fallback) · [L16-multi-agent-router-sql-rag.html](../../demo/Flows/L16-multi-agent-router-sql-rag.html) (the SQL route; same architecture as Lab 16).

The **router uses each agent as a tool**. The LLM decides which tool to call; there is no `if/else` routing in application code.

| Tool | Agent | What it does |
|------|-------|--------------|
| `answer_with_html_rag` | HTML RAG agent | Answers documentation questions from `server/content/*.html` (pgvector `html_vectors`) |
| `run_sql_agent` | SQL pipeline | Schema RAG → generate SQL → execute (`SELECT` only) → natural-language answer |
| `use_mermaid_diagram` | Mermaid MCP agent | Connects to the Mermaid MCP server and draws diagrams |

If the model returns no tool call, the router falls back to the HTML RAG agent.

---

## How to launch

### Prerequisites

- Node.js 20+
- Docker Desktop (running)
- An OpenRouter API key

### 1. Start PostgreSQL + pgvector

```bash
cd labs/lab_09_b
docker compose up -d
```

This starts Postgres with pgvector on **5432** (`admin` / `admin123`, database `vectordb`) and pgAdmin on **http://localhost:5050**.

> Labs 14, 16 and 09 b use the same container name (`pgvector-db`) and port. If one of them is already running, skip this step.

### 2. Configure the server

```bash
cd server
cp .env.example .env
```

Edit `server/.env`:

| Key | Required | Notes |
|-----|----------|-------|
| `OPENROUTER_API_KEY` | ✅ | Used for the chat models and embeddings |
| `PG_HOST` `PG_PORT` `PG_USER` `PG_PASSWORD` `PG_DATABASE` | ✅ | Defaults match `docker-compose.yml` |
| `MCP_MERMAID_AUTH` | Only for diagrams | Authorization header for `https://mcp.mermaid.ai/mcp` |
| `PORT` | – | Server port, default `3002` |

### 3. Install and load the data (first time only)

```bash
npm install
npm run init-db        # create tables + load sample data (schema.sql, data.sql)
npm run index-schema   # embed the DB schema for the SQL agent
npm run index-html     # embed server/content/*.html for the HTML RAG agent
```

Re-run `npm run index-html` whenever you change files in `server/content/`.

### 4. Start the server

```bash
npm start
```

→ **http://localhost:3002** (also serves the built UI from `server/public/`).

### 5. Start the client (dev mode, optional)

In a second terminal:

```bash
cd labs/lab_09_b/client
npm install
npm run dev
```

→ **http://localhost:5175** (proxies `/query` and `/health` to the server).

`npm run build` rebuilds the UI and copies it into `server/public/`.

> Lab 09 b uses the same ports as Lab 16 (3002 / 5175), and Lab 18 also uses 3002. Run only one of them at a time.

### 6. Try it

```bash
curl -s localhost:3002/health
curl -s -X POST localhost:3002/query \
  -H "Content-Type: application/json" \
  -d '{"question":"How many active users exist in the system?"}'
```

Expected: `"route": "sql_agent"` and the answer **24**. More test questions with expected answers are in [readme.questions.md](readme.questions.md).

| Ask something like… | Expected route |
|---------------------|----------------|
| "What is this system for?" | `html_rag` |
| "Which users booked tennis resources?" | `sql_agent` |
| "Draw a diagram of users, permissions and bookings" | `mermaid_diagram` |

### Response shape

```json
{
  "route": "html_rag | sql_agent | mermaid_diagram",
  "answer": "Natural-language answer or diagram result",
  "sql": "SELECT ... or null",
  "rows": [],
  "rowCount": 0,
  "error": null
}
```

### Reading the console logs

Every `/query` prints its whole flow to the server console, from `lib/logger.js`:

```text
==========================================================================================
                                   NEW REQUEST c79094ba
  question: How many users are there?
==========================================================================================
---------------------------------------- ▶ Router ----------------------------------------
[c79094ba +  998ms] [Router] ✔ LLM route decision (998ms · tokens in=412 out=18)
[c79094ba +  998ms] [Router] 🔧 tool call run_sql_agent {"question":"How many users?"}
-------------------------------------- ▶ SQL Agent ---------------------------------------
[c79094ba +  998ms] [SQL Agent] → step 1/4 · schema retrieval (RAG)
[c79094ba + 1457ms] [Schema Retriever] 📚 retrieved 8 chunks from schema_vectors (k=8)
[c79094ba + 1457ms] [Schema Retriever]     #1 dist=0.6211 {"type":"table","table":"users"} CREATE TABLE users ( …
[c79094ba + 3230ms] [SQL Generator]       SELECT COUNT(*) FROM users;
[c79094ba + 3258ms] [DB Executor] ✔ 1 row(s) returned
---------------------------------- ◀ SQL Agent (3125ms) ----------------------------------
==========================================================================================
                             REQUEST c79094ba DONE in 4123ms
==========================================================================================
```

- `=====` frames one request. `----- ▶ / ◀` marks entering and leaving an agent, with its duration.
- `[id +ms]` is the request id and the time since the request started, so concurrent requests stay readable.
- 🤖 is an LLM call (model, ms, tokens), 🔧 a tool call (router tool or `mcp:<tool>`), and 📚 a retrieval. A retrieval always shows the **number of chunks** returned, then each chunk's cosine distance (lower is closer), metadata and a preview.
- Env knobs: `LOG_CHUNKS=0` (count only), `LOG_PREVIEW=200`, `FORCE_COLOR=1` (docker), `NO_COLOR=1`.

### Stop

```bash
docker compose down        # keep the data
docker compose down -v     # also delete the database volume
```

---

## API Query Flow

When a user queries the API, `server/index.js` handles the HTTP request and delegates all question handling to the router agent.

```mermaid
flowchart TD
    A[Client sends POST /query] --> B[Express receives request in server/index.js]
    B --> C[Parse JSON body]
    C --> D{Is question present and a string?}
    D -- No --> E[Return 400 JSON error]
    D -- Yes --> F[Call routeWithTools(question)]

    F --> G[Create router tools]
    G --> G1[answer_with_html_rag]
    G --> G2[run_sql_agent]
    G --> G3[use_mermaid_diagram]
    G --> H[Create ChatOpenAI router model]
    H --> I[Bind tools to model]
    I --> J[Send system prompt + user question]
    J --> K{Did model return a tool call?}

    K -- No --> L[Fallback to answerWithHtmlRag(question)]
    L --> L1[Retrieve HTML chunks]
    L1 --> L2[Ask model to answer from context]
    L2 --> Z[Return JSON response]

    K -- Yes --> M{Which tool was selected?}

    M -- answer_with_html_rag --> N[answerWithHtmlRag(question)]
    N --> N1[Load HTML retriever]
    N1 --> N2[Retrieve relevant HTML docs]
    N2 --> N3[Build context]
    N3 --> N4[Ask model for grounded answer]
    N4 --> N5[Return route html_rag with answer]
    N5 --> Z

    M -- run_sql_agent --> O[runSqlAgent(question)]
    O --> O1[retrieveSchemaContext(question)]
    O1 --> O2[generateSQL(question, schemaContext)]
    O2 --> O3{Was SQL generated?}
    O3 -- No --> O4[Return unable-to-generate answer]
    O4 --> Z
    O3 -- Yes --> O5[runQuery(sql)]
    O5 --> O6[executeQuery allows SELECT only]
    O6 --> O7[(PostgreSQL database)]
    O7 --> O8[Rows or query error]
    O8 --> O9[answer(question, execution, sql)]
    O9 --> O10[Return route sql_agent with answer, sql, rows, rowCount, error]
    O10 --> Z

    M -- use_mermaid_diagram --> P[runMermaidMcpAgent(question)]
    P --> P1{Is MCP_MERMAID_AUTH set?}
    P1 -- No --> P2[Return configuration error]
    P2 --> Z
    P1 -- Yes --> P3[Connect to Mermaid MCP server]
    P3 --> P4{Connection successful?}
    P4 -- No --> P5[Return connection error]
    P5 --> Z
    P4 -- Yes --> P6[List MCP tools]
    P6 --> P7[Convert MCP tools to LangChain tools]
    P7 --> P8[Run Mermaid tool-calling agent]
    P8 --> P9[Close MCP transport]
    P9 --> P10[Return route mermaid_diagram with answer or error]
    P10 --> Z

    F -. throws .-> Q[Catch server error]
    Q --> R[Return 500 JSON error]
```

### Response Shape

All successful tool routes return the same top-level shape:

```json
{
  "route": "html_rag | sql_agent | mermaid_diagram",
  "answer": "Natural-language answer or diagram result",
  "sql": "SELECT ... or null",
  "rows": [],
  "rowCount": 0,
  "error": null
}
```

## Adding HTML for RAG

Put `.html` files in `server/content/`. Run `npm run index-html` after adding or changing them.


flowchart TD
    A[Client POST /query] --> B[index.js Express route]
    B --> C{Valid question?}
    C -- No --> C1[Return 400 error]
    C -- Yes --> D[routeWithTools question]

    D --> E[Create router tools]
    E --> E1[answer_with_html_rag]
    E --> E2[run_sql_agent]
    E --> E3[use_mermaid_diagram]

    D --> F[ChatOpenAI router model + bound tools]
    F --> G{Model selects tool?}

    G -- No tool call --> H[Fallback: answerWithHtmlRag]
    G -- answer_with_html_rag --> H

    H --> H1[getHtmlRetriever]
    H1 --> H2[(html_vectors pgvector table)]
    H2 --> H3[Retrieve HTML chunks]
    H3 --> H4[ChatOpenAI answers from context]
    H4 --> Z[Return JSON response]

    G -- run_sql_agent --> I[runSqlAgent]

    I --> I1[retrieveSchemaContext]
    I1 --> I2[getSchemaRetriever]
    I2 --> I3[(schema_vectors pgvector table)]
    I3 --> I4[Relevant schema context]

    I4 --> I5[generateSQL]
    I5 --> I6[ChatOpenAI SQL generator]
    I6 --> I7{SQL generated?}

    I7 -- No --> I8[Return cannot-generate answer]
    I8 --> Z

    I7 -- Yes --> I9[runQuery]
    I9 --> I10[executeQuery]
    I10 --> I11{SELECT only?}
    I11 -- No --> I12[Return query error]
    I11 -- Yes --> I13[(PostgreSQL sso_db)]
    I13 --> I14[Rows + rowCount]

    I12 --> I15[answer agent]
    I14 --> I15
    I15 --> I16[ChatOpenAI summarizes result]
    I16 --> Z

    G -- use_mermaid_diagram --> M[runMermaidMcpAgent]
    M --> M1{MCP_MERMAID_AUTH set?}
    M1 -- No --> M2[Return config error]
    M1 -- Yes --> M3[Connect Streamable HTTP transport]
    M3 --> M4[Mermaid MCP server]
    M4 --> M5[List MCP tools]
    M5 --> M6[Convert MCP schemas to LangChain tools]
    M6 --> M7[Tool-calling Mermaid agent]
    M7 --> M8[Return diagram answer or tool result]
    M2 --> Z
    M8 --> Z

    Z --> R[index.js sends JSON]

---

## Exercises

### 🟢 Easy — Teach the router something new

1. Run the lab and ask 5 questions from [readme.questions.md](readme.questions.md). For each one, write down the `route` you got.
2. Add a new HTML page to `server/content/`, for example `booking-policy.html` with cancellation rules, opening hours and a max of 2 bookings per user per day. Then run `npm run index-html`.
3. Ask *"Can I cancel a booking on the same day?"* and check that the answer comes from your page (`html_rag`).
4. In `server/agents/router-agent.js`, add one line to the router's system prompt so that questions starting with "how many / list / show" always go to `run_sql_agent`. Log the chosen tool and the time each request takes.

**Done when:** your new page is answered through `html_rag`, and the console shows which tool was chosen for each request.

### 🟡 Medium — Add a 4th agent-tool: `build_chart`

1. Add a new router tool, `build_chart`, for questions like *"Show bookings per resource as a bar chart"*.
2. It calls the existing SQL pipeline to get `rows`, then asks the LLM to return a small **chart spec** (`{ type, labels, values, title }`) through structured output.
3. Return it with `route: "chart"` and render it in the client with any chart library (Chart.js, Recharts).
4. Update the router's system prompt so it can tell a *chart* question apart from a *table* question.

**Done when:** a "chart" question draws a chart, while "how many…" questions still return plain SQL answers.

### 🔴 Hard — Clinic operations assistant

Recreate the "router with agents as tools" pattern for a **medical clinic**.
The docs RAG holds clinic procedures (pre-visit instructions, insurance rules). The SQL agent works over a DB of doctors, appointments and rooms. The third tool should be something other than diagrams, such as a "find next free slot" tool.
The router must pick the right agent for questions like *"What should I bring to an MRI?"* vs *"Which doctors have free slots tomorrow?"*.
