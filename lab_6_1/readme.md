# lab_6_1 — Image Vision Agent

Express + LangChain OpenRouter vision lab: upload one PNG/JPEG (≤1MB), save and serve it statically, and return structured `{ tags, description }` from a vision model. Dark native HTML/CSS/JS client shows tags immediately and reveals the description via **Explain**.

## Setup

```bash
cd lab_6_1
cp .env.example .env
# set OPENROUTER_API_KEY in .env
npm install
```

## Run

One command starts the API and serves the client:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Production-style start:

```bash
npm start
```

## Env

| Variable | Description |
| --- | --- |
| `OPENROUTER_API_KEY` | Required OpenRouter API key |
| `OPENROUTER_VISION_MODEL` | Vision model (default `openai/gpt-4o`) |
| `PORT` | Server port (default `3000`) |

## API

- `GET /api/health` → `{ "status": "ok" }`
- `POST /upload-image` — multipart field `image` (PNG/JPEG, ≤1MB)

Success response:

```json
{
  "success": true,
  "imageUrl": "/uploads/....jpg",
  "tags": ["..."],
  "description": "..."
}
```

Uploaded files are stored under `uploads/` and served at `/uploads/<filename>`.
