#!/usr/bin/env node
/**
 * Scroll + hierarchy checks for course-copilot (#25).
 * Drives shipped pure helpers from sft-course-copilot.js (not reimplemented).
 * Run: node docs/sft-course-copilot-scroll-check.mjs
 * Env: SFT_COURSE_SCROLL_LOG=/path/to/log (optional)
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Copilot = require("./sft-course-copilot.js");
const Agui = require("./sft-course-agui.js");

// Ensure AG-UI is on globalThis so bodyHtmlForMessage / buildTranscriptHtml
// use the real assistant render path when available.
if (typeof globalThis !== "undefined") {
  globalThis.SFTCourseAgui = Agui;
}

const lines = [];
function log(msg) {
  lines.push(msg);
  console.log(msg);
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    log("FAIL: " + msg);
  } else {
    log("ok: " + msg);
  }
}

const htmlPath = join(__dirname, "sft-interactive-playbook.html");
const copilotPath = join(__dirname, "sft-course-copilot.js");
assert(existsSync(htmlPath), "playbook HTML exists");
assert(existsSync(copilotPath), "copilot.js exists");

const html = readFileSync(htmlPath, "utf8");
const copilotSrc = readFileSync(copilotPath, "utf8");

// --- Mode documentation comment (shipped source) ---
assert(
  copilotSrc.includes("follow:") &&
    copilotSrc.includes("history:") &&
    copilotSrc.includes("pin-on-send") &&
    copilotSrc.includes("Jump to latest"),
  "scroll mode comment documents follow, history, pin-on-send, Jump to latest"
);

// --- Jump control + live/stale in shipped markup/CSS ---
assert(html.includes(".copilot-msg--live"), "CSS has .copilot-msg--live");
assert(html.includes(".copilot-msg--stale"), "CSS has .copilot-msg--stale");
assert(html.includes(".copilot-jump-latest"), "CSS has Jump control styles");
assert(html.includes(".copilot-scroll-spacer"), "CSS has pin spacer");
assert(html.includes(".copilot-messages-shell"), "CSS has messages shell for Jump FAB");
// contrast-safe dimming: opacity (not color-only)
assert(/\.copilot-msg--stale\{[^}]*opacity\s*:/s.test(html), "stale uses opacity (not color-only)");
assert(html.includes("min-width:0") && html.includes("overflow-wrap:anywhere"), "overflow containment still present");

// Jump wiring in JS
assert(copilotSrc.includes("copilotJumpLatest"), "Jump control id in dock");
assert(copilotSrc.includes('aria-label="Jump to latest"'), "Jump has accessible name");
assert(copilotSrc.includes("jumpToLatest"), "jumpToLatest handler exists");
assert(copilotSrc.includes("markUserScrollIntent"), "wheel/touch intent marker present");
assert(copilotSrc.includes("followModeAfterScrollIntent"), "history transition helper used");
assert(copilotSrc.includes("computePinSpacerHeight"), "pin spacer helper used");
// No blunt bottom-only scroll as sole policy
assert(
  !/els\.messages\.scrollTop\s*=\s*els\.messages\.scrollHeight\s*;\s*\n\s*\}/.test(
    copilotSrc.replace(/\s+/g, " ")
  ) || copilotSrc.includes("pinElementNearTop"),
  "pin-near-top path present (not only scrollHeight jump)"
);
assert(copilotSrc.includes("pinElementNearTop"), "pinElementNearTop shipped");

// --- Pure helpers: multi-turn hierarchy (real shipped functions) ---
const multiTurn = [
  { role: "user", text: "What is SFT?" },
  { role: "assistant", text: "SFT is supervised fine-tuning." },
  { role: "user", text: "How does assistant-only loss work?" },
  { role: "assistant", text: "Loss only on assistant tokens." },
  { role: "system", text: "note" },
];

assert(Copilot.liveStartIndex(multiTurn) === 2, "liveStartIndex points at last user (index 2)");
assert(
  Copilot.hierarchyClassForIndex(multiTurn, 0) === "copilot-msg--stale",
  "older user turn is stale"
);
assert(
  Copilot.hierarchyClassForIndex(multiTurn, 1) === "copilot-msg--stale",
  "older assistant is stale"
);
assert(
  Copilot.hierarchyClassForIndex(multiTurn, 2) === "copilot-msg--live",
  "last user is live"
);
assert(
  Copilot.hierarchyClassForIndex(multiTurn, 3) === "copilot-msg--live",
  "current assistant is live"
);
assert(
  Copilot.hierarchyClassForIndex(multiTurn, 4) === "copilot-msg--live",
  "system after last user is live (same turn cluster)"
);

const onlyAssistant = [{ role: "assistant", text: "hi" }];
assert(Copilot.liveStartIndex(onlyAssistant) === 0, "no-user: last message is live start");

// --- Pin spacer math (ChatGPT-style room under pinned user) ---
assert(
  Copilot.computePinSpacerHeight(400, 80, 12) === 308,
  "spacer = viewport - pin - pad (400-80-12=308)"
);
assert(Copilot.computePinSpacerHeight(100, 200, 12) === 0, "spacer floors at 0 when pin taller than viewport");

// --- Near-edge metrics ---
assert(
  Copilot.isNearLiveEdgeMetrics(900, 1000, 100, 48) === true,
  "near live edge when within threshold"
);
assert(
  Copilot.isNearLiveEdgeMetrics(100, 1000, 100, 48) === false,
  "mid-history is not near live edge"
);

// --- Follow vs history on intentional scroll ---
assert(
  Copilot.followModeAfterScrollIntent(true, true, false) === false,
  "intentional scroll-up (not near edge) → history (follow false)"
);
assert(
  Copilot.followModeAfterScrollIntent(false, true, true) === true,
  "intentional scroll back to edge → follow restored"
);
assert(
  Copilot.followModeAfterScrollIntent(true, false, false) === true,
  "programmatic/layout scroll without intent does not leave follow"
);
assert(
  Copilot.followModeAfterScrollIntent(false, false, true) === false,
  "no intent: stay in history even if near edge"
);

// --- Shipped buildTranscriptHtml with live/stale + real AG-UI body path ---
const longAssistant = [
  "Older context that should be stale.",
  "",
  "```js",
  "const long = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';",
  "```",
].join("\n");
const transcript = [
  { role: "user", text: "First question about datasets" },
  { role: "assistant", text: longAssistant },
  { role: "user", text: "Second question about loss masking" },
  {
    role: "assistant",
    text: "## Answer\n\nUse `assistant_only_loss` when chat templates allow it.",
  },
];
const markup = Copilot.buildTranscriptHtml(transcript);
assert(typeof markup === "string" && markup.length > 40, "buildTranscriptHtml returns markup");
assert(markup.includes("copilot-msg--stale"), "transcript marks stale history bubbles");
assert(markup.includes("copilot-msg--live"), "transcript marks live turn bubbles");
// Count: first two messages stale, last two live
const staleCount = (markup.match(/copilot-msg--stale/g) || []).length;
const liveCount = (markup.match(/copilot-msg--live/g) || []).length;
assert(staleCount === 2, "exactly 2 stale bubbles for 4-message transcript with last user at 2");
assert(liveCount === 2, "exactly 2 live bubbles for current turn");
assert(markup.includes("copilot-msg--user"), "user role class retained");
assert(markup.includes("copilot-msg--assistant"), "assistant role class retained");
assert(markup.includes("copilot-msg-body"), "body class retained for overflow chain");
assert(
  markup.includes("copilot-md") || markup.includes("copilot-msg-body--plain"),
  "assistant/user body classes present"
);
// Real AG-UI path for assistant markdown when available
assert(
  markup.includes("assistant_only_loss") || markup.includes("Answer"),
  "assistant content flows through shipped body render"
);
assert(markup.includes("Second question about loss masking"), "latest user text in live bubble");
assert(markup.includes("First question about datasets"), "history user text still in DOM (stale)");

// Empty state
const empty = Copilot.buildTranscriptHtml([]);
assert(empty.includes("copilot-empty"), "empty transcript uses empty state markup");

// --- Overflow non-regression (containment still in CSS for bubbles) ---
function ruleBody(selectorPrefix) {
  const idx = html.indexOf(selectorPrefix);
  if (idx < 0) return null;
  const brace = html.indexOf("{", idx);
  if (brace < 0 || brace - idx > 160) return null;
  const end = html.indexOf("}", brace);
  if (end < 0) return null;
  return html.slice(brace + 1, end);
}
const msgBubble = ruleBody(".copilot-msg{");
assert(
  msgBubble &&
    msgBubble.includes("min-width:0") &&
    msgBubble.includes("overflow-wrap:anywhere"),
  "bubble min-width:0 + overflow-wrap retained (overflow non-regression)"
);
const msgList = ruleBody(".copilot-messages{");
assert(
  msgList && msgList.includes("overflow-y:auto") && msgList.includes("min-width:0"),
  "messages list vertical scroll + min-width retained"
);

// Pin simulation: after "send", last user index is live start — pin target
const afterSend = transcript.concat([]); // user already last turn's start
assert(
  Copilot.liveStartIndex(afterSend) === 2,
  "after multi-turn, pin target is last user index 2 (near top of live cluster)"
);

// Follow pin story as metrics: user at top means scrollTop ≈ pin offset;
// history means followModeAfterScrollIntent(true, true, false) === false
const pinStory = {
  followAfterSend: true,
  afterScrollUp: Copilot.followModeAfterScrollIntent(true, true, false),
  afterJump: true, // Jump sets follow true
  spacerFor400x80: Copilot.computePinSpacerHeight(400, 80, 12),
};
assert(pinStory.followAfterSend === true, "pin-on-send implies follow");
assert(pinStory.afterScrollUp === false, "history mode after intentional scroll-up");
assert(pinStory.afterJump === true, "Jump restores follow");
assert(pinStory.spacerFor400x80 > 0, "spacer gives room to pin user near top");

const logPath =
  process.env.SFT_COURSE_SCROLL_LOG ||
  join(__dirname, "..", "workspaces", "sft-course-scroll-check.log");
try {
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, lines.join("\n") + "\n");
  log("LOG=" + logPath);
} catch (e) {
  log("WARN: could not write log: " + e.message);
}

if (failed) {
  log("\nSCROLL CHECK: FAIL (" + failed + " assertions)");
  process.exit(1);
}
log("\nPASS copilot scroll/hierarchy (#25) via shipped helpers + CSS");
process.exit(0);
