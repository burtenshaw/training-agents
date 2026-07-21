# SFT Course Copilot Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local-only course copilot: Node gate on `127.0.0.1` that runs one durable read-heavy Grok session, plus a right-dock chat plugin that injects live lesson/progress context.

**Architecture:** Pure helpers in `sft-course-lib.js` build `CourseContext`. Playbook exposes `window.SFTCoursePlayer`. Gate (`tools/course-copilot-gate/`) static-serves `docs/`, mutexes `/chat`, spawns headless `grok` with pinned tools, LOCATION OVERRIDE prompts, and timeouts. Plugin talks same-origin only.

**Tech Stack:** Node.js (stdlib `http`/`child_process`/`fs`), existing browser course JS, headless Grok CLI, `node --test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-07-21-course-copilot-gate-design.md` (v2 reframed).

---

## Plan critic panel (8) → fixes applied in this plan

| # | Critic | Weakness in a naive plan | Fix applied below |
|---|---|---|---|
| 1 | **TDD order** | UI before pure logic → untestable mess | Tasks start with pure context/prompt + gate unit tests |
| 2 | **file:// trap** | Only document CORS; learners stay on file:// | Gate README + offline UI require same-origin URL as supported path |
| 3 | **Mock Grok** | Tests call real Grok → CI spend/flake | Injectable `runGrok` / `GROK_BIN=mock` script for tests |
| 4 | **Player façade scope creep** | Rewrite whole playbook | Minimal API at end of IIFE; only touch showLesson/reset/complete/quiz save paths for notify |
| 5 | **Static jail bugs** | `path.join` path traversal | Explicit resolve + `startsWith(docsRoot)` tests |
| 6 | **Timeout orphans** | Spawn without process group kill | Kill child on timeout; document macOS process-group note |
| 7 | **Check script drift** | Forget to assert new script include | Extend `sft-course-check.mjs` for copilot script + façade presence |
| 8 | **Prompt bloat** | Re-send full rules every turn | Separate `buildCreatePrompt` vs `buildResumePrompt` |

---

## File map

| Path | Responsibility |
|---|---|
| `docs/sft-course-lib.js` | Add pure `buildCourseContext(state, viewMeta, course)` |
| `docs/sft-course-copilot.js` | Dock UI, health client, chat client, offline UX |
| `docs/sft-interactive-playbook.html` | CSS dock, script tag, `SFTCoursePlayer` façade + notify hooks |
| `docs/sft-course-check.mjs` | Assert copilot wiring exists |
| `tools/course-copilot-gate/server.mjs` | HTTP server entry |
| `tools/course-copilot-gate/prompt.mjs` | Prompt builders |
| `tools/course-copilot-gate/session.mjs` | Session JSON load/save/reset |
| `tools/course-copilot-gate/grok.mjs` | Spawn headless Grok + timeout |
| `tools/course-copilot-gate/static.mjs` | Safe static file from docs/ |
| `tools/course-copilot-gate/tutor-rules.md` | Tutor system rules |
| `tools/course-copilot-gate/README.md` | Start instructions, cost note |
| `tools/course-copilot-gate/mock-grok.mjs` | Fake CLI for tests |
| `tools/course-copilot-gate/test/*.test.mjs` | Unit/integration tests |
| `workspaces/course-copilot/` | Runtime only (gitignored) |

---

### Task 1: Pure `buildCourseContext` in course lib

**Files:**
- Modify: `docs/sft-course-lib.js`
- Modify: `docs/sft-course-check.mjs`

- [ ] **Step 1: Write failing check for buildCourseContext**

Add to `docs/sft-course-check.mjs` (after existing pure checks):

```js
assert(typeof Lib.buildCourseContext === "function", "buildCourseContext exported");
const ctx = Lib.buildCourseContext(
  { completed: { o1: true, m1l1: true }, quiz: {}, notes: {}, activities: {}, capstone: {}, last: "m1l1" },
  { view: "lesson", lessonId: "m1l1" },
  COURSE
);
assert(ctx.course === "sft-interactive-playbook", "context course id");
assert(ctx.view === "lesson", "context view");
assert(ctx.lessonId === "m1l1", "context lessonId");
assert(ctx.module && ctx.lessonTitle, "context has module and title");
assert(ctx.progress.completedCount === 2, "completedCount");
assert(ctx.progress.totalLessons === Lib.lessonCount(COURSE), "totalLessons");
assert(Array.isArray(ctx.progress.completedIds) && ctx.progress.completedIds.includes("o1"), "completedIds");
assert(ctx.capstoneComplete === false, "capstoneComplete false");
```

- [ ] **Step 2: Run check — expect FAIL (missing export)**

Run: `node docs/sft-course-check.mjs`  
Expected: `FAIL: buildCourseContext exported`

- [ ] **Step 3: Implement buildCourseContext**

In `docs/sft-course-lib.js`, add and export:

```js
function buildCourseContext(state, viewMeta, course) {
  const s = ensureState(state, course[0] && course[0].id);
  const view = (viewMeta && viewMeta.view) || "home";
  const lessonId = viewMeta && viewMeta.lessonId != null ? viewMeta.lessonId : null;
  const lesson =
    lessonId && lessonId !== "capstone"
      ? course.find(function (l) { return l.id === lessonId; })
      : null;
  const completedIds = Object.keys(s.completed || {}).filter(function (id) {
    return s.completed[id];
  });
  const total = lessonCount(course);
  const done = completedCount(s);
  return {
    course: "sft-interactive-playbook",
    view: view,
    lessonId: lessonId,
    module: view === "capstone" ? "Final Project" : lesson ? lesson.module : null,
    lessonTitle: view === "capstone" ? "Capstone report builder" : lesson ? lesson.title : null,
    progress: {
      completedCount: done,
      totalLessons: total,
      percent: progressPercent(s, course),
      completedIds: completedIds,
    },
    capstoneComplete: !!s.completed.capstone,
  };
}
```

Export `buildCourseContext` on the returned object.

- [ ] **Step 4: Run check — expect PASS for new asserts**

Run: `node docs/sft-course-check.mjs`  
Expected: all `ok:` including buildCourseContext lines

- [ ] **Step 5: Commit**

```bash
git add docs/sft-course-lib.js docs/sft-course-check.mjs
git commit -m "feat(course): add pure buildCourseContext helper"
```

---

### Task 2: Gate prompt builders (create vs resume)

**Files:**
- Create: `tools/course-copilot-gate/prompt.mjs`
- Create: `tools/course-copilot-gate/tutor-rules.md`
- Create: `tools/course-copilot-gate/test/prompt.test.mjs`

- [ ] **Step 1: Write tutor-rules.md**

Create `tools/course-copilot-gate/tutor-rules.md` with the full tutor rules from the design spec §6.6 (role, file-aware, LOCATION OVERRIDE, integrity, read-heavy, **no quiz spoilers**, concise).

- [ ] **Step 2: Write failing prompt tests**

```js
// tools/course-copilot-gate/test/prompt.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { buildCreatePrompt, buildResumePrompt, formatLocationOverride } from "../prompt.mjs";

const ctx = {
  course: "sft-interactive-playbook",
  view: "lesson",
  lessonId: "m1l1",
  module: "Module 1",
  lessonTitle: "SFT as target-token imitation",
  progress: { completedCount: 1, totalLessons: 21, percent: 5, completedIds: ["o1"] },
  capstoneComplete: false,
};

test("location override includes lesson id", () => {
  const block = formatLocationOverride(ctx);
  assert.match(block, /LOCATION OVERRIDE/);
  assert.match(block, /lessonId: m1l1/);
  assert.match(block, /completedIds: o1/);
});

test("create prompt includes full rules and user message", () => {
  const p = buildCreatePrompt({
    rulesText: "RULES_MARKER",
    context: ctx,
    message: "Where am I?",
  });
  assert.match(p, /RULES_MARKER/);
  assert.match(p, /LOCATION OVERRIDE/);
  assert.match(p, /Where am I\?/);
});

test("resume prompt omits full rules dump", () => {
  const p = buildResumePrompt({
    context: ctx,
    message: "Explain masking",
  });
  assert.match(p, /LOCATION OVERRIDE/);
  assert.match(p, /Explain masking/);
  assert.ok(p.length < 4000);
});
```

- [ ] **Step 3: Run tests — expect FAIL (module missing)**

Run: `node --test tools/course-copilot-gate/test/prompt.test.mjs`  
Expected: fail to load `../prompt.mjs`

- [ ] **Step 4: Implement prompt.mjs**

```js
// tools/course-copilot-gate/prompt.mjs
export function formatLocationOverride(ctx) {
  const p = ctx.progress || {};
  const ids = (p.completedIds || []).join(", ");
  return [
    "## LOCATION OVERRIDE (authoritative; ignore any earlier location memory)",
    `course: ${ctx.course}`,
    `view: ${ctx.view}`,
    `lessonId: ${ctx.lessonId}`,
    `module: ${ctx.module}`,
    `lessonTitle: ${ctx.lessonTitle}`,
    `progress: ${p.completedCount}/${p.totalLessons} (${p.percent}%)`,
    `completedIds: ${ids}`,
    `capstoneComplete: ${!!ctx.capstoneComplete}`,
  ].join("\n");
}

export function buildCreatePrompt({ rulesText, context, message }) {
  return [
    rulesText.trim(),
    "",
    formatLocationOverride(context),
    "",
    "## User question",
    message.trim(),
  ].join("\n");
}

export function buildResumePrompt({ context, message }) {
  return [
    "You are the SFT course tutor. LOCATION OVERRIDE is ground truth. Do not spoil quiz answers.",
    "",
    formatLocationOverride(context),
    "",
    "## User question",
    message.trim(),
  ].join("\n");
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `node --test tools/course-copilot-gate/test/prompt.test.mjs`  
Expected: 3 pass

- [ ] **Step 6: Commit**

```bash
git add tools/course-copilot-gate/prompt.mjs tools/course-copilot-gate/tutor-rules.md tools/course-copilot-gate/test/prompt.test.mjs
git commit -m "feat(copilot-gate): add tutor prompt builders"
```

---

### Task 3: Session store

**Files:**
- Create: `tools/course-copilot-gate/session.mjs`
- Create: `tools/course-copilot-gate/test/session.test.mjs`

- [ ] **Step 1: Write session tests** using a temp dir (`fs.mkdtempSync`)

Cover: missing file → null; save → load; reset → null.

- [ ] **Step 2: Implement session.mjs**

```js
export function sessionPath(repoRoot) {
  return join(repoRoot, "workspaces", "course-copilot", "session.json");
}
export function loadSession(repoRoot) { /* read JSON or null */ }
export function saveSession(repoRoot, data) { /* mkdir + write */ }
export function resetSession(repoRoot) { /* unlink if exists */ }
```

- [ ] **Step 3: Run tests PASS; commit**

```bash
git add tools/course-copilot-gate/session.mjs tools/course-copilot-gate/test/session.test.mjs
git commit -m "feat(copilot-gate): durable single session store"
```

---

### Task 4: Grok runner with timeout + mock

**Files:**
- Create: `tools/course-copilot-gate/grok.mjs`
- Create: `tools/course-copilot-gate/mock-grok.mjs`
- Create: `tools/course-copilot-gate/test/grok.test.mjs`

- [ ] **Step 1: mock-grok.mjs**

CLI that parses argv, optional `MOCK_SLEEP_MS`, writes one JSON object to stdout:

- `text` mentions `lessonId` from LOCATION OVERRIDE when present
- `sessionId` from env `MOCK_SESSION_ID` or fixed UUID
- `stopReason: "EndTurn"`

- [ ] **Step 2: Tests**

- spawn mock create (no `-r`) → sessionId returned
- resume includes `-r` and `--tools` allowlist flags in argv
- short timeout + sleep → `{ ok: false, error: "timeout" }`

- [ ] **Step 3: Implement grok.mjs**

```js
export async function runGrokTurn({
  grokBin,
  cwd,
  prompt,
  sessionId, // null = create
  maxTurns = 6,
  timeoutMs = 180000,
}) {
  const args = [
    "-p", prompt,
    "--cwd", cwd,
    "--output-format", "json",
    "--tools", "read_file,grep,list_dir",
    "--disallowed-tools", "Agent",
    "--max-turns", String(maxTurns),
  ];
  if (sessionId) args.push("-r", sessionId);
  // spawn, collect stdout, kill on timeout, parse JSON
  // return { ok, text, sessionId, error, durationMs }
}
```

Never pass `--yolo`. On timeout: kill child. On non-JSON/non-zero: `{ ok: false, error }`.

- [ ] **Step 4: Tests PASS; commit**

```bash
git add tools/course-copilot-gate/grok.mjs tools/course-copilot-gate/mock-grok.mjs tools/course-copilot-gate/test/grok.test.mjs
git commit -m "feat(copilot-gate): headless grok runner with timeout and mock"
```

---

### Task 5: Static path jail + HTTP server core

**Files:**
- Create: `tools/course-copilot-gate/static.mjs`
- Create: `tools/course-copilot-gate/server.mjs`
- Create: `tools/course-copilot-gate/test/static.test.mjs`
- Create: `tools/course-copilot-gate/test/server.test.mjs`

- [ ] **Step 1: static tests**

- resolve `/sft-interactive-playbook.html` under docs → ok
- resolve `/../.git/config` or encoded traversal → deny

- [ ] **Step 2: Implement static.mjs**

```js
export function resolveDocsPath(docsRoot, urlPath) {
  // decode, reject null bytes, normalize, ensure resolved path starts with docsRoot + path.sep
}
```

- [ ] **Step 3: server with injectable deps**

Endpoints:

- `GET /health` → `{ ok, binary, authHint, sessionPresent, busy }`
- `GET /status`
- `POST /chat` → mutex; 400 empty; 409 busy; runGrokTurn
- `POST /session/reset`
- static GET for docs files
- bind `127.0.0.1` only

Chat flow:

1. Validate message non-empty
2. Load session
3. Load tutor-rules.md at startup
4. `prompt = session ? buildResumePrompt : buildCreatePrompt`
5. `runGrokTurn`
6. On create success, `saveSession`
7. Return JSON `{ ok, text, sessionId, reset, durationMs, error }`

- [ ] **Step 4: server.test.mjs** starts server on ephemeral port with mock grok; health + chat + concurrent 409.

- [ ] **Step 5: Commit**

```bash
git add tools/course-copilot-gate/
git commit -m "feat(copilot-gate): HTTP gate with static docs, chat mutex, health"
```

---

### Task 6: Player façade in playbook

**Files:**
- Modify: `docs/sft-interactive-playbook.html`
- Modify: `docs/sft-course-check.mjs`

- [ ] **Step 1: Add view tracking + notify**

```js
let currentView = "home";
const playerListeners = [];
function notifyPlayer() {
  playerListeners.forEach((fn) => {
    try { fn(window.SFTCoursePlayer.getContext()); } catch (e) { console.warn(e); }
  });
}
```

- [ ] **Step 2: Update showLesson / home / complete / quiz / reset**

Set `currentView` correctly (`home` | `lesson` | `capstone`), call `notifyPlayer()` after navigation and progress changes.

- [ ] **Step 3: Expose façade**

```js
window.SFTCoursePlayer = {
  getState() { return JSON.parse(JSON.stringify(state)); },
  getContext() {
    return Lib.buildCourseContext(state, {
      view: currentView,
      lessonId: state.last || null,
    }, COURSE);
  },
  subscribe(fn) {
    playerListeners.push(fn);
    return () => {
      const i = playerListeners.indexOf(fn);
      if (i >= 0) playerListeners.splice(i, 1);
    };
  },
  async resetProgressAndCopilot() {
    localStorage.removeItem(KEY);
    localStorage.removeItem("sft-course-copilot-ui-v1");
    try { await fetch("/session/reset", { method: "POST" }); } catch (_) {}
    location.reload();
  },
};
```

Wire `resetBtn` through confirm → `resetProgressAndCopilot()`.

- [ ] **Step 4: Assert façade in check**

```js
assert(html.includes("SFTCoursePlayer"), "playbook exposes SFTCoursePlayer");
```

- [ ] **Step 5: Run check; commit**

```bash
git add docs/sft-interactive-playbook.html docs/sft-course-check.mjs
git commit -m "feat(course): expose SFTCoursePlayer façade for copilot context"
```

---

### Task 7: Copilot plugin UI + client

**Files:**
- Create: `docs/sft-course-copilot.js`
- Modify: `docs/sft-interactive-playbook.html`
- Modify: `docs/sft-course-check.mjs`

- [ ] **Step 1: CSS for collapsible right dock**

Add `.copilot-dock`, collapse state, status chips, print hide, narrow stack. Prefer third column on wide layouts without breaking sidebar.

- [ ] **Step 2: Implement sft-course-copilot.js**

- `isSupportedOrigin()` → http(s) only
- health poll 5–10s
- transcript in `sft-course-copilot-ui-v1`
- send: `SFTCoursePlayer.getContext()` + POST `/chat`
- 409 → busy message; Working… timer; Clear session
- subscribe for “On: module · title” header line

- [ ] **Step 3: Script include + init after façade**

```html
<script src="sft-course-lib.js"></script>
<script src="sft-course-data.js"></script>
<script src="sft-course-copilot.js"></script>
```

After façade:

```js
if (window.SFTCourseCopilot) window.SFTCourseCopilot.init({ player: window.SFTCoursePlayer });
```

- [ ] **Step 4: check asserts script tag**

```js
assert(html.includes('src="sft-course-copilot.js"'), "HTML loads copilot plugin");
```

- [ ] **Step 5: Smoke with mock gate (manual or scripted curl)**

```bash
GROK_BIN="node tools/course-copilot-gate/mock-grok.mjs" node tools/course-copilot-gate/server.mjs
curl -s http://127.0.0.1:8787/health
```

- [ ] **Step 6: Commit**

```bash
git add docs/sft-course-copilot.js docs/sft-interactive-playbook.html docs/sft-course-check.mjs
git commit -m "feat(course): right-dock copilot plugin with gate client"
```

---

### Task 8: README + regression

**Files:**
- Create: `tools/course-copilot-gate/README.md`
- Modify: `README.md`

- [ ] **Step 1: Gate README**

```bash
node tools/course-copilot-gate/server.mjs
# open http://127.0.0.1:8787/sft-interactive-playbook.html
```

Document single session, read-heavy tools, cost/latency, mock mode, reset.

- [ ] **Step 2: Root README bullet** under Guides pointing to gate README + playbook.

- [ ] **Step 3: Full verification**

```bash
node docs/sft-course-check.mjs
node --test tools/course-copilot-gate/test/*.test.mjs
```

Expected: all pass. Optional e2e if Playwright available.

- [ ] **Step 4: Commit**

```bash
git add tools/course-copilot-gate/README.md README.md
git commit -m "docs: course copilot gate usage and cost notes"
```

---

### Task 9: Optional live Grok smoke (manual, not CI)

- [ ] Authenticated Grok: start gate, open playbook via gate URL, ask “What lesson am I on?”, navigate, re-ask. Expect location-aware answers. Do not put secrets or spend claims in the repo.

---

## Definition of done

- Spec §15 success criteria met
- `node docs/sft-course-check.mjs` pass
- `node --test tools/course-copilot-gate/test/*.test.mjs` pass
- CI tests need no real Grok / no spend
- `file://` course still loads; dock explains gate URL

---

## Execution handoff

After approval, implement with **subagent-driven development** (recommended) or **inline executing-plans**.
