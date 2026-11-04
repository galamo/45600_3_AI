# Cursor — Developer Guide

A practical reference for using [Cursor](https://cursor.com) as an AI-powered development environment: commands, modes, context, rules, skills, MCP, CLI, cloud agents, and team workflows.

Official docs: [https://cursor.com/docs](https://cursor.com/docs)

---

## Table of contents

1. [What Cursor is](#1-what-cursor-is)
2. [Core AI surfaces](#2-core-ai-surfaces)
3. [Agent modes](#3-agent-modes)
4. [Keyboard shortcuts](#4-keyboard-shortcuts)
5. [Chat input: `@` context and `/` commands](#5-chat-input--context-and--commands)
6. [How Agent works (tools & checkpoints)](#6-how-agent-works-tools--checkpoints)
7. [Rules](#7-rules)
8. [Skills & Custom Modes](#8-skills--custom-modes)
9. [Commands (slash prompts)](#9-commands-slash-prompts)
10. [MCP (Model Context Protocol)](#10-mcp-model-context-protocol)
11. [Hooks](#11-hooks)
12. [Plugins & Customize](#12-plugins--customize)
13. [Models](#13-models)
14. [Cloud Agents](#14-cloud-agents)
15. [Bugbot & code review](#15-bugbot--code-review)
16. [Cursor CLI](#16-cursor-cli)
17. [Privacy, security & ignore files](#17-privacy-security--ignore-files)
18. [VS Code compatibility](#18-vs-code-compatibility)
19. [Developer best practices](#19-developer-best-practices)
20. [Official links](#20-official-links)
21. [Document authorship](#21-document-authorship)

---

## 1. What Cursor is

Cursor is an AI-first code editor built on the VS Code foundation. It keeps the familiar editor, extensions, terminal, Git, and debugger, then adds agents that can read your codebase, edit files, run shell commands, browse the web, use MCP tools, and open pull requests.

For this course (Agentic AI Development), Cursor is the primary environment for experimenting with agents, MCP, skills, and rules.

**Download:** [https://cursor.com](https://cursor.com)

---

## 2. Core AI surfaces

| Surface | What it does | Typical use |
| --- | --- | --- |
| **Tab** | Inline autocomplete that predicts next edits from local context | Fast typing, multi-line completions, automatic imports (JS/TS) |
| **Inline edit** | Edit a selection or line with a prompt (classic Cmd/Ctrl+K style editing) | Local renames, rewrites, “fix this function” |
| **Agent (sidepanel)** | Multi-step assistant that searches, edits, runs commands, and uses tools | Features, refactors, debugging, migrations |
| **Agents Window / layout** | Dedicated agent workspace (`Cmd/Ctrl+E` toggles layout) | Longer tasks, parallel chats, cloud handoff |
| **Voice** | Dictate prompts | Hands-free prompting (`Cmd/Ctrl+Shift+Space`) |

Agent is accessed from the sidepanel (commonly `Cmd/Ctrl+I`). It is the main “coding agent” surface for multi-file work.

---

## 3. Agent modes

Switch modes with the mode menu (`Cmd/Ctrl+.`), the mode picker in chat, or **Shift+Tab** to rotate modes.

| Mode | Behavior | When to use |
| --- | --- | --- |
| **Agent** | Full tools: edit files, run terminal, search, MCP, browser | Default implementation work |
| **Plan** | Researches the codebase, asks clarifying questions, writes a reviewable plan *before* coding | Multi-file features, architecture choices, unclear scope |
| **Ask** | Read-only exploration; answers without editing | “How does X work?”, design Q&A, safe exploration |
| **Debug** | Hypotheses → instrumentation → you reproduce → log analysis → targeted fix | Tricky bugs, races, perf issues, regressions |

### Plan Mode flow

1. Clarifying questions  
2. Codebase research  
3. Written plan (editable in chat / markdown)  
4. You review → **Build** when ready  

Plans save under your home directory by default; **Save to workspace** keeps them in the repo for the team.

### Debug Mode flow

1. Explore + hypothesize  
2. Add temporary log instrumentation  
3. You reproduce the bug  
4. Agent analyzes runtime logs  
5. Targeted fix + cleanup of instrumentation  

---

## 4. Keyboard shortcuts

Baseline: VS Code keybindings. Remap anything under **Keyboard Shortcuts** (`Cmd/Ctrl+Shift+P` → “Keyboard Shortcuts”).

On Windows/Linux, use **Ctrl** where macOS uses **Cmd**, and **Alt** where macOS uses **Opt**, unless noted.

### General

| macOS | Action |
| --- | --- |
| `Cmd+I` | Toggle Sidepanel (unless bound to a mode) |
| `Cmd+L` or `Cmd+K` | Toggle Sidepanel (unless bound to a mode) |
| `Cmd+E` | Toggle Agent layout |
| `Cmd+.` | Mode menu |
| `Cmd+/` | Cycle AI models |
| `Cmd+Shift+J` | Cursor settings |
| `Cmd+Shift+Space` | Toggle Voice Mode |
| `Cmd+,` | General settings |
| `Cmd+Shift+P` | Command palette |
| `Cmd+R` then `Cmd+S` | Open keyboard shortcuts reference |

### Chat / Agent input

| macOS | Action |
| --- | --- |
| `Return` | Queue message (while agent is working) / send (default queue behavior) |
| `Cmd+Return` | Force send / send immediately (bypass queue) |
| `Cmd+Shift+Backspace` | Cancel generation / reject all suggested changes |
| `Cmd+Shift+L` | Add selected code as context |
| `Cmd+V` | Add clipboard code/log as context |
| `Cmd+Shift+V` | Paste clipboard into the input box |
| `Cmd+Return` (with suggestions) | Accept all changes |
| `Tab` | Cycle to next message |
| `Shift+Tab` | Rotate Agent modes |
| `Cmd+Opt+/` | Model toggle |
| `Cmd+N` / `Cmd+R` | New chat |
| `Cmd+T` | New chat tab |
| `Cmd+[` / `Cmd+]` | Previous / next chat |
| `Cmd+W` | Close chat |
| `Escape` | Unfocus field |

### Code selection & Tab

| macOS | Action |
| --- | --- |
| `@` | Open @-mentions |
| `/` | Shortcut commands / skills |
| `Cmd+Shift+L` | Add selection to Chat |
| `Cmd+L` or `Cmd+K` | Add selection to a new chat |
| `Tab` | Accept Tab suggestion |
| `Cmd+→` | Accept next word of suggestion |

See: [Keyboard Shortcuts](https://cursor.com/docs/reference/keyboard-shortcuts)

---

## 5. Chat input: `@` context and `/` commands

### `@` mentions (attach context)

Type `@` then filter. Useful mentions:

| Mention | Purpose |
| --- | --- |
| `@file` / `@folder` | Pin specific files or folders (`/` drills into a folder) |
| `@Terminals` | Include terminal output |
| `@Chats` | Pull context from a past conversation |
| `@Commit (Diff of Working State)` | Uncommitted local diff |
| `@Branch (Diff with Main)` | Full branch diff vs main |
| `@Browser` | Context from the built-in browser |
| `@rule-name` | Manually apply a project rule |

If you are unsure which files matter, skip `@` — Agent can search the codebase itself.

### Images & voice

- Drag/drop images or paste screenshots (`Cmd/Ctrl+V`) into chat  
- Microphone icon for voice dictation  

### Context window

Each chat has a fixed context budget. The **context ring** next to the input shows usage. Categories include system prompt, tools, rules, skills, MCP, subagents, summarized history, and live conversation. Near the limit, Cursor compresses older turns. Use `/summarize` (alias `/compress`) to free space intentionally.

### Side chats

`/side` or `/btw` opens a side conversation for a tangent without derailing the main thread. `@`-mention the side chat later to pull findings back.

### Goals & loops

```text
/goal fix all flaky tests and make CI green
```

`/goal` keeps a long-lived objective until complete (rolling out). Pair with `/loop` for recurring work on an interval.

### Queued vs immediate messages

While Agent is working:

- **Enter** → queue the next instruction  
- **Cmd/Ctrl+Enter** → send now / steer urgently  
- Reorder queued messages by dragging  

---

## 6. How Agent works (tools & checkpoints)

Agent = **instructions (rules/skills)** + **tools** + **model**.

### Built-in tools (high level)

- Search files/folders and keywords  
- Read files (including images for vision models)  
- Edit / apply file changes  
- Run shell commands (default terminal profile; set via “Terminal: Select Default Profile”)  
- Web search  
- Fetch rules  
- Browser control (screenshots, UI verification)  
- Image generation (defaults under `assets/`)  
- Ask clarifying questions mid-task  
- MCP tools you configured  

There is **no hard cap** on tool calls per task.

### Checkpoints

Before significant edits, Agent snapshots modified files. Click a checkpoint in the timeline to preview/restore. Restoring reverts **files only**, not chat messages. Checkpoints are local and separate from Git — use Git for real version control.

### Accept / reject diffs

Review proposed edits in the diff UI. Accept all / reject all via shortcuts above. Prefer reviewing multi-file refactors carefully before accepting.

### Projects (coordinator agents)

For large features or migrations, create a **Project**: a coordinator plans work and delegates to other agents.

Docs: [Agent overview](https://cursor.com/docs/agent/overview)

---

## 7. Rules

Rules inject persistent instructions into Agent context. They do **not** affect Tab autocomplete.

### Rule types

| Type | Where | Notes |
| --- | --- | --- |
| **Project rules** | `.cursor/rules/*.mdc` | Version-controlled; use frontmatter |
| **User rules** | Customize → Rules | Global preferences across projects |
| **Team rules** | Cursor dashboard | Team / Enterprise; can be enforced |
| **AGENTS.md** | Project root (and nested dirs) | Simple markdown alternative to `.mdc` |

Precedence when guidance conflicts: **Team → Project → User**.

### Project rule application modes

| UI type | Frontmatter behavior |
| --- | --- |
| Always Apply | `alwaysApply: true` |
| Apply to Specific Files | `globs:` set, `alwaysApply: false` |
| Apply Intelligently | `description:` set, no globs |
| Apply Manually | no description/globs → `@mention` only |

Example:

```md
---
description: React component conventions in this repo
globs: src/components/**/*.tsx
alwaysApply: false
---

- Use named exports
- Prefer composition over prop drilling
- Co-locate styles next to the component
```

Create with `/create-rule` in chat or **Customize → Rules → Add Rule**.

Plain `.md` files inside `.cursor/rules` are **ignored** (no frontmatter). Prefer `.mdc` or root `AGENTS.md`.

Nested `AGENTS.md` files combine with parents; more specific directories win.

Docs: [Rules](https://cursor.com/docs/rules)

---

## 8. Skills & Custom Modes

**Skills** package domain workflows in folders with a `SKILL.md` (Agent Skills open standard). Agent auto-discovers them and can invoke them when relevant, or you invoke with `/skill-name`.

### Discovery paths

| Location | Scope |
| --- | --- |
| `.cursor/skills/` or `.agents/skills/` | Project |
| `~/.cursor/skills/` or `~/.agents/skills/` | User (machine-local) |
| Also compatible | `.claude/skills/`, `.codex/skills/` |

Nested `.cursor/skills/` under packages is supported (monorepos). Skills under a nested project folder are scoped to that subtree.

### Built-in skills (invoke with `/`)

| Skill | Purpose |
| --- | --- |
| `/automate` | Create Automations (schedule, Slack, GitHub events, …) |
| `/autopilot` | Monitor a PR: feedback, conflicts, failing checks |
| `/canvas` | Interactive React artifacts beside the chat |
| `/create-hook` | Author hooks + `hooks.json` |
| `/create-rule` | Author project rules |
| `/create-skill` | Scaffold a new skill |
| `/create-subagent` | Define custom subagents |
| `/cursor-blame` | Investigate AI-authored changes |
| `/loop` | Repeat a prompt/skill on an interval |
| `/migrate-to-skills` | Convert dynamic rules / slash commands → skills |
| `/review` | Run the appropriate review agent |
| `/review-bugbot` | Bug-oriented review |
| `/review-security` | Security review |
| `/sdk` | Cursor SDK guidance |
| `/shell` | Run text as a literal shell command |
| `/split-to-prs` | Split large work into smaller PRs |
| `/statusline` | Configure CLI status line |
| `/update-cli-config` | Edit `~/.cursor/cli-config.json` |
| `/update-cursor-settings` | Update Cursor/VS Code settings |

### Custom Mode

From the `/` menu: **Enter** = attach skill for one message; **Opt/Alt+Enter** = keep skill as an active **Custom Mode** for the whole session (badge in input).

Minimal `SKILL.md`:

```markdown
---
name: tdd
description: Test-driven development playbook for this repo.
---

# TDD

1. Write a failing test first
2. Implement the minimum code to pass
3. Refactor with tests green
```

Optional frontmatter: `paths`, `disable-model-invocation`, `icon`, `color`.

Docs: [Agent Skills](https://cursor.com/docs/skills)

---

## 9. Commands (slash prompts)

**Commands** are reusable markdown prompts invoked with `/` in Agent chat. They are listed under Customize alongside rules, skills, and hooks. Prefer Skills for portable, progressive workflows; use Commands for short, explicit one-shot prompts. `/migrate-to-skills` can convert eligible commands.

Editor chat also exposes workflow slash helpers such as `/side`, `/btw`, `/goal`, and skill names above.

---

## 10. MCP (Model Context Protocol)

MCP connects Agent to external tools and data (GitHub, databases, Linear, Notion, custom APIs, …). Cursor supports MCP Apps (interactive UI in chat when available).

### Install

1. **One-click:** Customize → MCPs → Add to Cursor  
2. **Manual config** in JSON:

| File | Scope |
| --- | --- |
| `.cursor/mcp.json` | Project (commit for the team) |
| `~/.cursor/mcp.json` | User (all projects) |

Project config overrides global when names collide. Files are merged.

Local (stdio) example:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "mcp-server"],
      "env": {
        "API_KEY": "your-key-here"
      }
    }
  }
}
```

Remote URL example:

```json
{
  "mcpServers": {
    "my-service": {
      "url": "https://mcp.example.com/sse",
      "headers": {
        "Authorization": "Bearer your-token-here"
      }
    }
  }
}
```

Restart Cursor after manual edits. Toggle tools in the chat tools list. Approvals: Settings → Agents → Approvals & Execution (Auto-review / Allowlist). Fine-tune with `permissions.json`.

Troubleshoot: Output panel → **MCP Logs** (`Cmd/Ctrl+Shift+U`).

Browse servers: [Cursor Marketplace](https://cursor.com/marketplace), [cursor.directory](https://cursor.directory)

Help: [MCP integrations](https://cursor.com/help/customization/mcp)

---

## 11. Hooks

Hooks are scripts that observe or control the agent loop (and some Tab events). Configured in:

- Project: `.cursor/hooks.json`  
- User: `~/.cursor/hooks.json`  
- Or via plugins  

Communication: JSON over stdio. Common agent events include `preToolUse`, `beforeShellExecution`, `afterFileEdit`, `beforeSubmitPrompt`, `subagentStart` / `subagentStop`, `preCompact`, `stop`, and more. Tab-specific: `beforeTabFileRead`, `afterTabFileEdit`.

Use hooks for formatting, audit logging, blocking dangerous shell patterns, and policy enforcement. Cloud Agents run **repo** hooks from `.cursor/hooks.json` (not your home-directory hooks).

Create with `/create-hook`. Docs: [Hooks](https://cursor.com/docs/hooks)

---

## 12. Plugins & Customize

**Customize** (sidebar) is the hub for:

| Component | Role |
| --- | --- |
| Plugins | Bundles of rules, skills, subagents, commands, MCP, hooks |
| Rules / Skills / Commands / Hooks / Subagents | Individually managed |
| MCPs | External tool servers |
| Marketplace / team marketplaces | Discover & install |

Filter by user / workspace / team scope. Team leaderboards surface popular plugins and MCPs.

Docs: [Customize Cursor](https://cursor.com/docs/customize-cursor)

---

## 13. Models

- Pick a model from the chat model dropdown, or cycle with `Cmd/Ctrl+/`  
- Set a default under **Cursor Settings → Models**  
- Switch mid-conversation when needed (fast model for exploration → stronger model for hard refactors)  
- **Max Mode** (legacy request plans / CLI `/max-mode`) expands capability at higher usage cost  

Cloud Agents use a curated model set; context window size may be selectable and affects usage.

See Cursor’s **Models & Pricing** page in-product / on the site for the live catalog (models change frequently).

Prompting tips: [Prompting agents](https://cursor.com/docs/agent/prompting)

---

## 14. Cloud Agents

Formerly **Background Agents**. Same agent fundamentals, running in **isolated cloud VMs** with a full dev environment (clone, deps, secrets, network).

### Why use them

- Parallel agents without tying up your laptop  
- Build/test/verify in a real environment  
- Multi-repo coordinated changes + PRs  
- Artifacts (screenshots, videos, logs) and remote desktop control  
- MCP support (team/cloud dashboard configuration)  

### How to start

- Desktop: choose **Cloud** under the agent input  
- Web / mobile: [cursor.com/agents](https://cursor.com/agents)  
- Slack / Linear: `@cursor`  
- GitHub / Bitbucket: comment `@cursor` on issues/PRs  
- CLI: prepend `&` to hand off mid-conversation  
- API  

Admin must connect source control (GitHub, GitLab, Bitbucket, Azure DevOps, …) first. Environment setup (snapshot / Dockerfile / `.cursor/environment.json`) strongly improves results.

Plans: Cloud Agents require Premium+ / Teams / Enterprise (or legacy paid); Free and Plus do not include them.

Docs: [Cloud Agents](https://cursor.com/docs/cloud-agent)

---

## 15. Bugbot & code review

- **Bugbot** reviews PRs for likely bugs and regressions; can suggest or autofix via Cloud Agents depending on setup  
- In chat: `/review`, `/review-bugbot`, `/review-security`  
- Team model allowlists also constrain which models Bugbot may use  

Use review skills before merging AI-authored diffs, especially around auth, payments, and data handling.

---

## 16. Cursor CLI

Run the same Agent from the terminal for scripts, CI, or headless workflows.

### Modes

```bash
agent                          # interactive Agent mode
agent --mode=ask               # read-only
agent --plan "..."             # Plan mode
agent -p "..."                 # non-interactive / print
agent -p --output-format json "..."
agent --worktree "task..."     # edit in a git worktree under ~/.cursor/worktrees
agent resume                   # continue last chat
```

Cloud handoff from CLI:

```bash
& refactor the auth module and add comprehensive tests
```

### Useful CLI slash commands

| Command | Description |
| --- | --- |
| `/model` | Select model |
| `/plan` | Plan mode |
| `/ask` | Ask mode |
| `/debug` | Debug mode |
| `/goal` | Long-lived objective |
| `/run-everything` (`/auto-run`) | Auto-run terminal commands policy |
| `/summarize` (`/compress`) | Shrink context |
| `/mcp` | List MCP servers/tools |
| `/plugin` | Manage plugins |
| `/sandbox` | Sandbox / network settings |
| `/shell` (`/sh`, `/run`) | Shell mode |
| `/clear` (`/new`) | New session |
| `/resume` / `/fork` / `/rewind` | Session navigation |
| `/config` / `/about` / `/help` | Settings & help |
| `/quit` / `/exit` | Exit |

CLI shortcuts: **Shift+Tab** rotate modes; **Ctrl+R** review diffs; **@** attach files; approvals for shell by default (`y`/`n`). Non-interactive mode has full write access — use carefully in CI.

Docs: [Using Agent in CLI](https://cursor.com/docs/cli/using), [CLI slash commands](https://cursor.com/docs/cli/reference/slash-commands)

---

## 17. Privacy, security & ignore files

- **Privacy Mode:** with it enabled, Cursor and model providers do not train on your code (ZDR agreements for supported routed models). Enterprise often enforces this org-wide.  
- Some models require provider data retention for safety reviews; those need admin opt-in when Privacy Mode / Enterprise policies apply.  
- Prefer **Secrets** in the Cloud Agents dashboard over baking `.env` into snapshots.  
- Use **`.cursorignore`** (and standard `.gitignore`) to keep secrets, credentials, and regulated paths out of AI context.  
- Govern MCP/plugins; prefer allowlisted tools and Auto-review over “run everything” on shared machines.  
- Hooks can enforce formatting and block risky shell patterns.  

Enterprise hardening overview: [Security hardening](https://cursor.com/docs/enterprise/security-hardening)

---

## 18. VS Code compatibility

Cursor is VS Code–compatible for most extensions, themes, keybindings, and settings. You can import VS Code settings on first run. Prefer Cursor Settings (`Cmd/Ctrl+Shift+J`) for AI-specific options; use general settings (`Cmd/Ctrl+,`) for editor behavior.

Language tooling (TypeScript language service, ESLint, Prettier, debuggers) works as in VS Code and pairs well with Tab + Agent.

---

## 19. Developer best practices

1. **Start in Plan or Ask** for unfamiliar or large work; switch to Agent to implement.  
2. **Write rules only for repeated mistakes** — keep them short, concrete, and git-tracked.  
3. **Prefer Skills** for workflows with steps/scripts; keep `SKILL.md` lean and put detail in `references/`.  
4. **@-mention when you know the files**; otherwise let Agent search.  
5. **Watch the context ring** — summarize or start a fresh chat when quality drops.  
6. **Review diffs and use checkpoints** before accepting large changes; commit with Git yourself.  
7. **Use Debug Mode** when guessing fails; give reproduction steps.  
8. **Wire MCP** for real systems (GitHub, issue trackers, DBs) instead of pasting secrets into chat.  
9. **Cloud Agents** for long/parallel tasks once the cloud environment can build and test.  
10. **Never paste production secrets** into prompts; use env/secrets managers and `.cursorignore`.  

---

## 20. Official links

| Topic | URL |
| --- | --- |
| Docs home | https://cursor.com/docs |
| Agent | https://cursor.com/docs/agent/overview |
| Plan Mode | https://cursor.com/docs/agent/plan-mode |
| Debug Mode | https://cursor.com/docs/agent/debug-mode |
| Prompting & @ mentions | https://cursor.com/docs/agent/prompting |
| Keyboard shortcuts | https://cursor.com/docs/reference/keyboard-shortcuts |
| Rules | https://cursor.com/docs/rules |
| Skills | https://cursor.com/docs/skills |
| Customize / plugins | https://cursor.com/docs/customize-cursor |
| Hooks | https://cursor.com/docs/hooks |
| MCP help | https://cursor.com/help/customization/mcp |
| Cloud Agents | https://cursor.com/docs/cloud-agent |
| CLI | https://cursor.com/docs/cli/using |
| CLI slash commands | https://cursor.com/docs/cli/reference/slash-commands |
| Agents web UI | https://cursor.com/agents |
| Marketplace | https://cursor.com/marketplace |
| Community directory | https://cursor.directory |

---

## 21. Document authorship

| Field | Value |
| --- | --- |
| **Created for** | Course repo `45600_3_AI` — Agentic AI Development |
| **File** | `docs/cursor-readme.md` |
| **Sources** | Official Cursor documentation (docs.cursor.com / cursor.com/help), retrieved at authoring time |
| **Model that produced this document** | **Composer** (Cursor **Auto** agent router) |

> Model catalogs and shortcut bindings change over time. When in doubt, trust in-app Command Palette help and the live docs linked above.
