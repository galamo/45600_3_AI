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

| Variable                  | Description                            |
| ------------------------- | -------------------------------------- |
| `OPENROUTER_API_KEY`      | Required OpenRouter API key            |
| `OPENROUTER_VISION_MODEL` | Vision model (default `openai/gpt-4o`) |
| `PORT`                    | Server port (default `3000`)           |

## API

- `GET /api/health` → `{ "status": "ok" }`
- `POST /upload-image` — multipart field `image` (PNG/JPEG, ≤5MB); optional `isAiAuthenticity`
- `POST /api/classifications` — save user AI/real label + model rankings for an image
- `GET /api/classifications` — assessment stats (`?userClassification=&model=`)
- `GET /assessment` — Agent assessment charts UI

Upload success response:

```json
{
  "success": true,
  "imageId": "....jpg",
  "imageUrl": "/uploads/....jpg",
  "tags": ["..."],
  "description": "...",
  "aiAuthenticity": { "...": "optional when requested" }
}
```

Uploaded files are stored under `uploads/` and served at `/uploads/<filename>`.
User classifications are stored in `data/classifications.json` (image id, user label, agent verdict, per-model rankings).

## User classification & assessment

After an authenticity run, the UI shows a dropdown with **strong labels only** (no inconclusive):

- `likely_real` — not AI
- `likely_ai` — created or edited by AI

Saving posts those labels with the image id and each model’s ranking. Open **[Agent assessment](http://localhost:3000/assessment)** for:

1. Per-model agree/disagree vs user
2. Final agent result vs user (wrong-case count + accuracy)
3. Label distribution and model accuracy %
4. Filters by user label / model / wrong-only cases
