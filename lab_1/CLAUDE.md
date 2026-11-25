# CLAUDE.md — Lab 1

You are editing a **static Figma wireframe**, not an app. Prefer minimal diffs that preserve layout fidelity.

## Goal

Keep `index.html` a faithful, open-in-browser wireframe of the Figma frame. There is **no** agent, LLM call, API, build step, or interactive behavior to add unless the user explicitly asks.

## Hard constraints

Do **not**:

- Add a package manager, bundler, framework, or `node_modules`
- Introduce a linter, test suite, or CI for this lab
- Extract CSS/JS into separate modules unless asked
- Replace absolute positioning with flex/grid “refactors” that change pixel placement
- Remove or rename `data-node-id` attributes (they map to Figma layers)
- Invent runtime logic in `index.js` unless the user requests it

Do:

- Edit inline `<style>` and markup in `index.html` when changing visuals
- Keep the fixed `.frame` size and absolute coordinates unless the user changes the design
- Preserve Inter (or the fonts already linked) and existing class names when possible
- Open or reason about `index.html` directly in a browser — no install required

## Repo map

| Path | Role |
|------|------|
| `index.html` | Entire wireframe: inline CSS + markup + inline SVG |
| `index.js` | Empty placeholder only |
| `assets/` | Unused / empty |
| `readme.md` | Human-facing lab notes / diagram |

## Layout model (do not fight this)

```
body (centered page)
└── main.frame          fixed 323×303, position: relative
    ├── .table-box      absolute grey rect
    ├── .table-label    absolute "table" text
    └── .vector         absolute wrapper + inline SVG
```

Coordinates and sizes come from Figma. Treat them as source of truth unless the user provides new design values.

## Edit playbook

1. **Clarify intent** — visual tweak vs. structural rewrite vs. turning this into a real UI.
2. **Touch the smallest surface** — usually one CSS rule or one element in `index.html`.
3. **Keep Figma linkage** — leave `data-node-id` intact; add new ones only if mirroring new layers.
4. **Verify mentally** — frame size unchanged unless requested; text, colors, and SVG still match the wireframe.
5. **Skip ceremony** — no README rewrites, no new tooling, no comments that restate the obvious.

## When the user asks for something beyond a wireframe

If they want interactivity, components, or a build pipeline: confirm scope first, then implement **only what they asked**, still preferring vanilla HTML/CSS/JS unless they name a stack.

## Out of scope by default

MCP, auth, databases, agents, RAG, and other labs in this monorepo. Stay inside `lab_1/` unless the user points elsewhere.
