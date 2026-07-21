# Course copilot gate

Local HTTP gate that serves the SFT interactive playbook and backs the optional
right-dock course copilot. Each chat turn spawns a headless Grok CLI process
with a single durable session and a read-only tool policy.

Assistant replies are mapped into **[AG-UI](https://docs.ag-ui.com/introduction)**
events (`RUN_*` + `TEXT_MESSAGE_*`) so the dock can render markdown via an
event-driven path rather than painting one opaque `text` string.

## Start

From the repository root:

```bash
node tools/course-copilot-gate/server.mjs
```

Default listen address is `http://127.0.0.1:8787/`. Override with `PORT`.

## Open the course

With the gate running, open:

```text
http://127.0.0.1:8787/sft-interactive-playbook.html
```

The playbook HTML/JS is also usable over `file://` for reading and local
progress. The copilot dock needs the gate URL so it can call `/health`,
`/status`, `/chat`, and `/session/reset`.

Optional `GATE_TOKEN` header auth from the design spec is **not implemented in
v1** (localhost trust only).

## Durable session

One durable session is stored at:

```text
workspaces/course-copilot/session.json
```

The gate creates this on the first successful chat turn and resumes it on later
turns (`-r <sessionId>`). Session metadata is local to the repo workspace and
is not committed (under ignored `workspaces/`).

## Tool policy

Headless Grok is invoked with a read-heavy tool set only:

- allowed: `read_file`, `grep`, `list_dir`
- disallowed: `Agent`
- never passes `--yolo` (v1)

This keeps the tutor able to inspect course/docs files without write or
unrestricted agent tools.

## Cost and latency

Each chat message spawns a headless Grok process (`grok -p ... --output-format
json ...`). Turns can be slow and can spend API/account usage. Prefer short
questions; reset the session if the thread drifts.

Default chat timeout is 180s (`CHAT_TIMEOUT_MS`); default max turns is 6
(`MAX_TURNS`).

## Mock vs live Grok

| Mode | How | What you get |
|------|-----|----------------|
| **Mock** (tests / smoke) | `GROK_BIN=node` + `GROK_EXTRA_ARGS` pointing at `mock-grok.mjs` | Deterministic tutor text; no API cost; full gate HTTP + AG-UI events |
| **Live** | Install/authenticate Grok CLI; leave `GROK_BIN` unset (or set to `grok`) | Real headless Grok; same `/chat` shape and AG-UI events |

### Mock mode (tests / smoke)

For unit tests and smoke runs without a real Grok binary, point the gate at the
repo mock CLI via `GROK_BIN` and `GROK_EXTRA_ARGS`:

```bash
# Spawn: node mock-grok.mjs <cli flags...>
export GROK_BIN="$(which node)"
export GROK_EXTRA_ARGS='["tools/course-copilot-gate/mock-grok.mjs"]'
# or space-separated:
# export GROK_EXTRA_ARGS="tools/course-copilot-gate/mock-grok.mjs"

node tools/course-copilot-gate/server.mjs
```

Implementation notes (see `server.mjs` / `grok.mjs`):

- `GROK_BIN` defaults to `grok` when unset.
- `GROK_EXTRA_ARGS` may be a JSON array string or whitespace-separated tokens.
- Spawn shape is `spawn(grokBin, [...extraArgs, ...cliFlags])`, so mock mode
  runs as `node mock-grok.mjs -p ... --tools read_file,grep,list_dir ...`.
- Tests under `tools/course-copilot-gate/test/` use the same mock path without
  requiring a live CLI.

Optional mock helpers:

- `MOCK_SESSION_ID` — fixed session id returned by the mock
- `MOCK_SLEEP_MS` — artificial latency for timeout/concurrency tests

### Live mode

```bash
# Requires `grok` on PATH and authenticated host (~/.grok/auth.json typically).
unset GROK_EXTRA_ARGS
export GROK_BIN=grok   # optional; this is the default
node tools/course-copilot-gate/server.mjs
```

## Reset

- Course **Reset** (sidebar): clears local course progress and also POSTs
  `/session/reset` when the page is served from the gate.
- Dock **Clear session**: deletes the durable Grok session file only
  (`workspaces/course-copilot/session.json`) via `/session/reset`.

After reset, the next chat message creates a fresh Grok session.

## file:// vs gate URL

| Mode | Course UI | Copilot dock |
|------|-----------|--------------|
| `file://.../docs/sft-interactive-playbook.html` | Works (progress, quizzes, labs) | Offline — needs gate for API |
| `http://127.0.0.1:8787/sft-interactive-playbook.html` | Works | Online when gate + Grok (or mock) available |

The course shell (lessons, quizzes, progress) does **not** require the gate.
Copilot is progressive enhancement: when opened over `file://` or when the gate
is down, the dock shows offline help and the rest of the playbook stays usable.

## AG-UI reply rendering

`POST /chat` still returns `{ ok, text, ... }` for compatibility and also
returns an `events` array shaped like AG-UI:

1. `RUN_STARTED`
2. `TEXT_MESSAGE_START` → `TEXT_MESSAGE_CONTENT` → `TEXT_MESSAGE_END`
3. `RUN_FINISHED` (or `RUN_ERROR` on failure)

Shared pure helpers live in `docs/sft-course-agui.js` (browser + Node):

- `textToAguiEvents` / `foldAguiEvents` / `primaryTextFromEvents`
- `markdownToHtml` / `renderAssistantFromEvents`

The dock (`docs/sft-course-copilot.js`) folds events and renders markdown
(headings, lists, fenced code, inline code/bold). If `events` is missing, the
client synthesizes them from `text` so the paint path stays event-driven.

Gate re-export for Node tests: `tools/course-copilot-gate/agui.mjs`.

Streaming JSON from headless Grok is out of scope for this change (see issue #8);
v1 maps the completed JSON blob into the full event lifecycle at once.

## Verification

```bash
node docs/sft-course-check.mjs
node --test tools/course-copilot-gate/test/*.test.mjs
```
