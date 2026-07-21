# SFT Course Copilot Gate — Design Spec

**Date:** 2026-07-21  
**Status:** Reframes after critic panel (v2) — ready for implementation planning  
**Scope:** Local-only course tutor: chat dock in the SFT interactive HTML course, backed by one durable Grok harness session via a small localhost gate.

## 0. Critic panel (8 critics) → evaluation → reframe

Eight critics reviewed the v1 draft against the real course player (`docs/sft-interactive-playbook.html`) and headless Grok behavior. Findings and dispositions:

| # | Critic | Weakness | Severity | Disposition |
|---|---|---|---|---|
| 1 | **Integration** | Player is a closed IIFE; `state` / `showLesson` / Reset are private. A bolt-on script cannot reliably know “where I am” without scraping DOM or re-reading only `localStorage.last` (misses home vs lesson, race with in-memory state). | High | **Fix:** minimal `window.SFTCoursePlayer` façade (getContext, subscribe, reset hooks). |
| 2 | **Browser / CORS** | Course today advertises `file://` works. `fetch('http://127.0.0.1:…')` from `file://` is inconsistent and often blocked; “optional static serve” under-specifies the only reliable path. | High | **Fix:** copilot **requires** course opened via gate origin. Gate static-serves `docs/`. `file://` keeps full course, dock shows “open via gate”. |
| 3 | **Session drift** | Durable Grok session remembers prior “you are on lesson X”; later turns inject new context but the model may still answer from stale session memory. | High | **Fix:** every turn starts with an authoritative **LOCATION OVERRIDE** block; rules: ignore prior location claims. Bootstrap full tutor rules only on session create; later turns = override + user message. |
| 4 | **Latency / cost** | Each `/chat` spawns headless Grok. Measured smoke: 1-turn `pong` with tool allowlist still ~30k input tokens and non-trivial cost/latency. No streaming → blank UI feels broken. | High | **Fix:** bound turns (`--max-turns`), hard request timeout, “Working…” UI, cost note in README; no streaming in v1 but must not look hung. Optional later: long-lived ACP (out of scope). |
| 5 | **Tool policy** | “Examples” of allow/deny leave implementers guessing; MCP meta-tools may remain available. | Medium | **Fix:** pin v1 flags: `--tools read_file,grep,list_dir` + `--disallowed-tools Agent` + `--max-turns 6` (tunable). Verify on install. |
| 6 | **Concurrency** | Client-side disable-send is not enough: two tabs can race the same session. | Medium | **Fix:** gate mutex; second chat returns `409 busy`. |
| 7 | **Local security** | Localhost HTTP with no auth means any local page could `POST /chat` and burn the user’s Grok quota / read repo via the agent. | Medium | **Fix:** prefer same-origin only (no open CORS to `null`/other origins). Optional `GATE_TOKEN` header if CORS ever widens. No `0.0.0.0`. |
| 8 | **Pedagogy / spoilers** | File-aware Grok can read `sft-course-data.js` quiz answers and spoil assessments. | Medium | **Fix:** tutor rules: do not reveal quiz correct options; give conceptual hints; point to lesson text instead of answer keys. |
| 9 | **Auth health** | Binary-on-PATH ≠ authenticated usable Grok. | Medium | **Fix:** `/health` reports `binary`, `authHint` (e.g. `~/.grok/auth.json` present), never auto-spend on every health poll. First chat surfaces auth errors clearly. |
| 10 | **Layout / regression** | Forcing a permanent third column can shrink lesson width and break existing `@media` breakpoints / print CSS. | Medium | **Fix:** dock is a collapsible right column (default open on wide screens, toggleable); print CSS hides dock; e2e still covers core course paths. |

**Reframe summary:** v2 keeps the same product shape (local gate + right dock + one session + read-heavy harness) but makes **player façade**, **same-origin serve**, **location override**, **turn bounds/timeouts**, **mutex**, **spoiler policy**, and **collapsible dock** first-class requirements.

---

## 1. Problem

The SFT interactive course (`docs/sft-interactive-playbook.html` + `sft-course-lib.js` + `sft-course-data.js`) is a standalone browser player. Learners often need answers about the current lesson, SFT concepts, TRL mechanics, and mentor-lab scripts without leaving the page.

We want a **course-side copilot plugin** that:

- Lives **inside the course HTML UI**
- Uses the **real Grok harness** (not a bare xAI chat API)
- Knows **where the learner is** (module, lesson, progress)
- Stays **basic**: one session, no multi-session product surface

## 2. Goals

1. Answer course questions from a right-docked chat panel while the learner is on a lesson.
2. Preserve Grok agent capability for **read/search** of the course repo (file-aware).
3. Inject **live position + progress** so answers are grounded in the current module/lesson.
4. Keep the course fully usable when the gate is offline or when opened via `file://`.
5. One durable Grok session per machine/course workspace (create once, resume until reset).
6. Fail loudly and safely: timeouts, busy lock, auth errors, no silent tool write access.

## 3. Non-goals (v1)

- Multi-session UI or session switcher
- Multi-user / hosted / cloud deployment
- Full `--yolo` write autonomy for the tutor
- Token streaming / live tool-event theater
- Long-lived ACP process (noted as future cost/latency optimization)
- Iframe-hosted separate chat product
- Changing course pedagogy content beyond player façade hooks + dock shell
- Replacing Module 7 “task a copilot” teaching with this tutor
- Guaranteeing low cost per turn (document expected spend; do not hide it)

## 4. Decisions (locked, v2)

| Topic | Decision |
|---|---|
| Runtime | Local-only tutor: localhost gate + one Grok session |
| Knowledge | File-aware Grok with `cwd` = training-agents repo |
| Position awareness | Live context via player façade + LOCATION OVERRIDE every turn |
| Tool power | Read-heavy: pinned allowlist (see §8) |
| Session lifecycle | One durable session; rules bootstrap once; location override every turn |
| Offline / file:// | Course works; copilot requires same-origin gate URL |
| Layout | Collapsible right-docked panel |
| Architecture | Local HTTP gate + course JS plugin |
| Origin model | Same-origin preferred (gate serves `docs/`) |
| Concurrency | Gate mutex; one in-flight chat |
| Spoilers | Tutor must not reveal quiz answer keys |

## 5. Architecture

```text
Browser ── same origin ──► Gate :8787
  GET  /sft-interactive-playbook.html   (static docs/)
  GET  /health
  POST /chat
  POST /session/reset
                │
                │ mutex + timeout
                ▼
         headless grok
           -r sessionId | first-create
           --cwd <repo>
           --tools read_file,grep,list_dir
           --disallowed-tools Agent
           --max-turns 6
           --output-format json
```

**Rules**

- Course never calls xAI directly; only the gate invokes Grok.
- Gate binds `127.0.0.1` only.
- Exactly one durable session for this course workspace.
- If gate is down or page is `file://`, dock is offline/help; quizzes/progress/labs keep working.

## 6. Components

### 6.1 Player façade (required integration surface)

Expose a small API from the playbook (end of existing IIFE), e.g. `window.SFTCoursePlayer`:

| Method / event | Role |
|---|---|
| `getContext()` | Returns `CourseContext` from live in-memory state + active view |
| `getState()` | Read-only snapshot of player state (for progress fields) |
| `subscribe(fn)` | Called on lesson change, complete, quiz progress, reset |
| `onReset(fn)` / reset path | Course Reset clears progress **and** notifies copilot to reset session |

Implementation constraint: façade uses the same `state` object and `showLesson` already own—no second source of truth.

### 6.2 Course plugin (`docs/sft-course-copilot.js`)

- Injects collapsible right dock; CSS in playbook style block.
- Builds context only via `SFTCoursePlayer.getContext()` (not DOM scrape).
- UI transcript in `localStorage` key `sft-course-copilot-ui-v1` (display only).
- Health poll ~5–10s; does not invoke Grok.
- `POST /chat` with message + context; disable send while in-flight; show elapsed “Working… (Ns)”.
- Detect `file://` or non-gate origin → offline copy explaining how to start gate and open `http://127.0.0.1:8787/sft-interactive-playbook.html`.
- “Clear session” → `POST /session/reset` + clear UI transcript.
- On player reset notification → same as clear session.

### 6.3 Local gate (`tools/course-copilot-gate/`)

**Stack:** Node.js (stdlib `http` preferred; no heavy framework required).

| Method | Path | Role |
|---|---|---|
| `GET` | `/health` | up, grok binary resolvable, authHint, sessionPresent, busy |
| `GET` | `/status` | sessionId (may truncate), cwd, toolPolicy, lastError, lastDurationMs |
| `POST` | `/chat` | one turn; body `{ message, context }`; enforces mutex |
| `POST` | `/session/reset` | delete session store |
| `GET` | `/*` under docs | static files from `docs/` (and only that tree) |

**Defaults**

- `HOST=127.0.0.1`, `PORT=8787`
- `COURSE_REPO` = repo root (auto-detect from gate path or env)
- `GROK_BIN=grok`
- `CHAT_TIMEOUT_MS=180000` (3 min hard kill of child)
- `MAX_TURNS=6`
- Session store: `workspaces/course-copilot/session.json`

**Static security**

- Serve only under `docs/` (path traversal rejected).
- Do not enable open CORS for arbitrary origins in v1.
- Optional: `GATE_TOKEN` env; if set, require `X-Course-Copilot-Token` on `/chat` and `/session/reset`.

### 6.4 Session store

```json
{
  "sessionId": "<uuid>",
  "createdAt": "<iso>",
  "cwd": "<absolute repo path>",
  "course": "sft-interactive-playbook",
  "rulesBootstrapped": true
}
```

Path: `workspaces/course-copilot/session.json` (ignored via existing `workspaces/`).

**Create:** first chat runs headless without `-r`, captures `sessionId` from JSON, writes store. Prefer client-chosen UUID via `-s` only if create path is cleaner; resume always uses `-r`.

**Resume:** subsequent chats use `-r <sessionId>`.

**Invalid session:** delete store, recreate once, return `reset: true`.

### 6.5 Prompt construction

**Session create (once):**

1. Full tutor rules (§6.6)
2. LOCATION OVERRIDE from `CourseContext`
3. User message

**Session resume (every later turn):**

1. Short sticky reminder (2–4 lines: tutor + no spoilers + location override is ground truth)
2. LOCATION OVERRIDE block (full structured context)
3. User message

**LOCATION OVERRIDE format (canonical):**

```text
## LOCATION OVERRIDE (authoritative; ignore any earlier location memory)
course: sft-interactive-playbook
view: lesson
lessonId: m2l3
module: …
lessonTitle: …
progress: 4/21 (19%)
completedIds: o1, m1l1, …
capstoneComplete: false
```

### 6.6 Tutor rules (gate file `tutor-rules.md`)

Must include:

- Role: in-page tutor for this repo’s SFT interactive course.
- Prefer reading `docs/sft-course-data.js`, playbook, `examples/sft-mentor-lab/*` when unsure.
- LOCATION OVERRIDE is ground truth for position/progress.
- Integrity: no quality claims without eval artifacts; loss ≠ agent quality.
- Read-heavy: explain and point; do not edit course files or run training.
- **No spoilers:** do not reveal which quiz option is correct or paste answer keys; give conceptual hints and point to lesson sections.
- Concise, lesson-aware answers.

## 7. Data flow

```text
1. Learner opens http://127.0.0.1:8787/sft-interactive-playbook.html
2. Plugin health → online
3. On send: context = SFTCoursePlayer.getContext()
4. POST /chat { message, context }
5. Gate acquires mutex (else 409)
6. Gate builds prompt; spawns grok with timeout
7. Parse JSON text; release mutex; return { ok, text, sessionId, reset, durationMs }
8. Plugin appends assistant message; clears Working…
```

### 7.1 `CourseContext` (v1)

```json
{
  "course": "sft-interactive-playbook",
  "view": "lesson",
  "lessonId": "m2l3",
  "module": "Module 2 — …",
  "lessonTitle": "…",
  "progress": {
    "completedCount": 4,
    "totalLessons": 21,
    "percent": 19,
    "completedIds": ["o1", "m1l1", "m1l2", "m1l3"]
  },
  "capstoneComplete": false
}
```

`view`: `home` | `lesson` | `capstone`.  
On home: `lessonId` may be `null` or last visited; module/title describe home.

Navigation does **not** auto-call Grok; next user message carries new context.

### 7.2 Transcript storage

| Layer | Storage | Role |
|---|---|---|
| UI transcript | `localStorage` `sft-course-copilot-ui-v1` | Display only |
| Model memory | Grok session via `-r` | Continuity |
| Course progress | `sft-course-player-v3` | Unchanged |

## 8. Tool policy (pinned)

```bash
grok -p "$PROMPT" \
  -r "$SESSION_ID" \
  --cwd "$COURSE_REPO" \
  --output-format json \
  --tools "read_file,grep,list_dir" \
  --disallowed-tools "Agent" \
  --max-turns 6
```

First create omits `-r` (or uses `-s <uuid>` once).  
Never pass `--yolo` in v1.  
Implementation plan verifies these flags on the installed CLI (already smoke-tested for allowlist path).

## 9. UI

- Wide screens: collapsible right dock (default expanded).
- Toggle control in dock header; remember preference in `localStorage`.
- Narrow (`max-width: 1050px` or similar): dock stacks under main content or collapses by default.
- Print CSS: hide dock (extend existing `@media print` rules).
- Chrome: title, status chip (`online` | `offline` | `busy` | `error`), messages, input, Send, Clear session.
- In-flight: disable Send, show “Working… (Ns)” with elapsed timer.
- Visual language: existing course CSS variables.

## 10. Error handling

| Situation | Behavior |
|---|---|
| Gate down | Offline chip + start instructions |
| `file://` or wrong origin | Offline + “open via gate URL” |
| Grok binary missing | health `binary: false`; chat disabled |
| Auth failure on chat | error text in dock; keep session file unless create never succeeded |
| Timeout | kill child; `ok: false`, `error: "timeout"` |
| Busy (mutex) | HTTP 409; plugin “wait for current reply” |
| Invalid session | recreate once; `reset: true` banner |
| Empty message | client reject |
| Grok non-zero / parse error | surface message; no silent empty success |

## 11. Security & privacy

- `127.0.0.1` only; static path jail under `docs/`.
- Same-origin usage is the supported mode; do not advertise open CORS.
- Optional shared token for `/chat` and `/session/reset`.
- Logs: no full prompts/responses in tracked paths; optional debug under `workspaces/course-copilot/logs/`.
- User’s Grok account still processes prompts (course location + questions + files Grok reads).
- Spoiler policy is prompt-level (not cryptographic).

## 12. Testing & validation

| Layer | Check |
|---|---|
| Unit | `buildCourseContext(state, view, course)` pure helper |
| Unit | Prompt assembly: create vs resume; LOCATION OVERRIDE present |
| Unit | Path jail rejects `../` |
| Unit | Mutex: second concurrent chat → 409 |
| Integration (mock grok) | Gate invokes wrapper with expected args; timeout kills |
| Integration (real grok, optional) | “what lesson am I on?” with injected context references lesson |
| Regression | `node docs/sft-course-check.mjs`; e2e still passes |
| Manual | Gate serve → open playbook → dock online → chat → navigate → chat uses new location → reset clears both |

Tests that call real Grok are **opt-in** (env flag) so CI without auth does not spend money.

## 13. Repo boundaries (Agents.md)

- No checkpoints/datasets/logs in tracked repo.
- Session + logs under ignored `workspaces/course-copilot/`.
- Minimal gate README with start command and cost/latency note.
- No learning-outcome claims without eval protocol.

## 14. Implementation sketch

1. Pure context + prompt builders (TDD).
2. Gate scaffold: health, static docs, path jail.
3. Session store + grok wrapper (mockable) + mutex + timeout.
4. Player façade in playbook + reset/subscribe hooks.
5. Copilot plugin UI + client.
6. Wire CSS dock; print/collapse.
7. Tests + README; optional live smoke.

## 15. Success criteria

v1 is done when:

1. Opening the course **through the gate**, the right dock is online and answers reflect **current lesson + progress** (LOCATION OVERRIDE).
2. Grok can read course files under the pinned tool policy.
3. `file://` and gate-down modes leave the course fully usable with a clear offline dock.
4. Concurrent chat returns busy; long runs timeout instead of hanging forever.
5. Quiz spoiler policy is present in tutor rules.
6. Existing course verification scripts still pass.
7. README documents start URL, single-session model, and that each turn invokes headless Grok (latency/cost).

## 16. Open risks (accepted)

- Per-turn process spawn cost/latency remains high without ACP; v1 optimizes honesty + bounds, not minimum spend.
- Spoiler resistance is soft (prompt policy).
- Local same-machine processes can still hit the gate; token is optional hardening only.
