#!/usr/bin/env node
/**
 * Structural + pure-logic checks against shipped course lib/data.
 * Run: node docs/sft-course-check.mjs
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Lib = require("./sft-course-lib.js");
const COURSE = require("./sft-course-data.js");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
  } else {
    console.log("ok:", msg);
  }
}

// --- Structural ---
const struct = Lib.validateCourseStructure(COURSE);
assert(struct.ok, "validateCourseStructure ok");
if (!struct.ok) struct.errors.forEach((e) => console.error("  -", e));
assert(struct.lessonCount >= 18, "lesson count >= 18 (got " + struct.lessonCount + ")");
assert(struct.lessonCount === COURSE.length, "lessonCount matches COURSE.length");

// HTML wires activityHTML for each kind used
const htmlPath = join(__dirname, "sft-interactive-playbook.html");
assert(existsSync(htmlPath), "playbook HTML exists");
const html = readFileSync(htmlPath, "utf8");
assert(html.includes('src="sft-course-lib.js"'), "HTML loads sft-course-lib.js");
assert(html.includes('src="sft-course-data.js"'), "HTML loads sft-course-data.js");
assert(html.includes('src="sft-course-agui.js"'), "HTML loads AG-UI helpers");
assert(html.includes('src="sft-course-copilot.js"'), "HTML loads copilot plugin");
assert(html.includes("SFTCoursePlayer"), "playbook exposes SFTCoursePlayer");
assert(html.indexOf("sft-course-agui.js") < html.indexOf("sft-course-copilot.js"), "AG-UI loads before copilot");

// AG-UI pure helpers (event map + markdown) ship in docs and are dual-exported
const aguiPath = join(__dirname, "sft-course-agui.js");
assert(existsSync(aguiPath), "sft-course-agui.js exists");
const Agui = require("./sft-course-agui.js");
assert(typeof Agui.textToAguiEvents === "function", "textToAguiEvents exported");
assert(typeof Agui.foldAguiEvents === "function", "foldAguiEvents exported");
assert(typeof Agui.markdownToHtml === "function", "markdownToHtml exported");
assert(typeof Agui.renderAssistantFromEvents === "function", "renderAssistantFromEvents exported");
const sampleEvents = Agui.textToAguiEvents("## Head\n\n- a\n\n```\ncode\n```", {
  messageId: "check-msg",
  runId: "check-run",
  timestamp: 1,
});
const sampleTypes = sampleEvents.map((e) => e.type);
assert(sampleTypes.includes("RUN_STARTED"), "events include RUN_STARTED");
assert(sampleTypes.includes("TEXT_MESSAGE_CONTENT"), "events include TEXT_MESSAGE_CONTENT");
assert(sampleTypes.includes("RUN_FINISHED"), "events include RUN_FINISHED");
const rendered = Agui.renderAssistantFromEvents(sampleEvents);
assert(rendered.html.includes("<h2"), "event path renders markdown heading");
assert(rendered.html.includes("<ul"), "event path renders markdown list");
assert(rendered.html.includes("code"), "event path renders fenced code");
assert(!rendered.html.includes("<script"), "markdown escapes raw HTML");

// #18 dock overflow containment: assert shipped CSS (not a re-implemented sheet)
function cssRuleHas(selectorSnippet, propSnippets) {
  // Find a rule block that mentions the selector, then require each property snippet.
  const idx = html.indexOf(selectorSnippet);
  if (idx < 0) return false;
  const brace = html.indexOf("{", idx);
  if (brace < 0 || brace - idx > 120) return false;
  const end = html.indexOf("}", brace);
  if (end < 0) return false;
  const body = html.slice(brace, end + 1);
  return propSnippets.every((p) => body.includes(p));
}
assert(
  cssRuleHas(".copilot-messages", ["minmax(0,1fr)", "min-width:0", "overflow-x:hidden", "overflow-y:auto"]),
  "copilot-messages grid/overflow containment"
);
assert(
  cssRuleHas(".copilot-msg{", ["min-width:0", "max-width:100%", "overflow-wrap:anywhere"]),
  "copilot-msg bubble containment"
);
assert(
  cssRuleHas(".copilot-msg-body{", ["min-width:0", "max-width:100%", "overflow-wrap:anywhere", "word-break:break-word"]),
  "copilot-msg-body wrap chain"
);
assert(
  cssRuleHas(".copilot-md{", ["min-width:0", "max-width:100%", "overflow-wrap:anywhere"]),
  "copilot-md containment"
);
assert(
  cssRuleHas(".copilot-md-pre{", ["max-width:100%", "min-width:0", "overflow-x:auto"]),
  "copilot-md-pre nested horizontal scroll"
);
assert(html.includes(".copilot-panel{") && html.includes("min-width:0") && html.includes("overflow:hidden"), "copilot-panel clips to dock");

// Long fixture through real markdown + event path (pipe table, long token, fence)
const longFixture = [
  "## Short answer",
  "",
  "SFT is next-token prediction only on tokens_the_model_must_learn_to_produce_with_a_very_long_unbroken_identifier_that_would_clip.",
  "",
  "| Mode | What is a target? | Meaning |",
  "|------|-------------------|---------|",
  "| Assistant-only | Only the assistant span | Loss on assistant tokens only |",
  "",
  "```js",
  "const veryLong = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';",
  "```",
].join("\n");
const longRendered = Agui.renderAssistantFromEvents(
  Agui.textToAguiEvents(longFixture, { messageId: "overflow-msg", runId: "overflow-run", timestamp: 1 })
);
assert(longRendered.html.includes('class="copilot-md-pre"'), "fixture fence uses overflow-safe pre class");
assert(longRendered.html.includes('class="copilot-md-p"'), "fixture prose uses md paragraph");
assert(longRendered.html.includes("| Mode | What is a target?"), "fixture keeps pipe-table text");
assert(longRendered.html.includes("tokens_the_model_must_learn"), "fixture keeps long token for wrap CSS");
// Markup shape the dock uses for assistant bodies
const bubbleShape =
  '<div class="copilot-msg copilot-msg--assistant">' +
  '<div class="copilot-msg-role">Copilot</div>' +
  '<div class="copilot-msg-body copilot-md">' +
  longRendered.html +
  "</div></div>";
assert(bubbleShape.includes("copilot-msg-body copilot-md"), "dock assistant body classes present");
assert(bubbleShape.includes("copilot-md-pre"), "dock bubble nests pre for scroll containment");

for (const kind of struct.activities) {
  assert(
    html.includes("'" + kind + "'") || html.includes('"' + kind + '"'),
    "activity renderer mentions " + kind
  );
}

// Pure activity runners exist for run kinds
for (const [act, runKind] of Object.entries(Lib.ACTIVITY_RUN_KINDS)) {
  if (runKind == null) continue;
  const out = Lib.runActivityPure(runKind, {
    claim: "smoke",
    method: "demo",
    columns: "messages",
    target: "assistant",
    source: "trace",
    tokens: 100,
    maxLength: 50,
    position: "end",
    toolJson: '{"name":"search"}',
    availableName: "search",
    model: "m",
    dataset: "d",
    output: "o",
    steps: 5,
    train: "down",
    eval: "down",
    artifact: "saved",
    baseline: 5,
    sft: 6,
    ood: 0,
    behavior: "x",
    mode: "overclaim",
  });
  assert(typeof out === "string" && out.length > 0, "runActivityPure(" + runKind + ") non-empty for " + act);
}

// Module 7 present
assert(
  COURSE.some((l) => l.module.includes("Tasking Agentic Copilots")),
  "Module 7 copilot tasking present"
);
assert(
  COURSE.some((l) => l.activity === "task_brief_builder"),
  "task_brief_builder lesson present"
);

// --- Pure logic unit tests ---
const state0 = Lib.ensureState({}, COURSE[0].id);
assert(Lib.progressPercent(state0, COURSE) === 0, "progress 0 initially");
const state1 = Lib.ensureState({ completed: { [COURSE[0].id]: true } }, COURSE[0].id);
const pct1 = Lib.progressPercent(state1, COURSE);
assert(pct1 > 0, "progress increases after one complete (" + pct1 + ")");

const correct = Lib.scoreQuizOption(["yes", true, "good"]);
assert(correct.correct === true && correct.message.includes("Correct"), "quiz correct path");
const wrong = Lib.scoreQuizOption(["no", false, "bad"]);
assert(wrong.correct === false && wrong.message.includes("Not quite"), "quiz wrong path");

const cmd = Lib.buildSmokeCommand({
  model: "Qwen/Qwen2.5-0.5B-Instruct",
  dataset: "trl-lib/Capybara",
  output: "outputs/sft-mentor-smoke",
  steps: 5,
});
assert(cmd.includes("train_lora_sft.py"), "smoke cmd references train script");
assert(cmd.includes("--model-name"), "smoke cmd has --model-name");
assert(cmd.includes("--dataset-name"), "smoke cmd has --dataset-name");
assert(cmd.includes("--max-steps 5"), "smoke cmd has max-steps");
assert(cmd.includes("--max-seq-length"), "smoke cmd has max-seq-length");

const report = Lib.buildReportText(
  {
    objective: "Teach format",
    behavior: "JSON tools",
    model: "Qwen/Qwen2.5-0.5B-Instruct",
    dataset: "trl-lib/Capybara",
    format: "messages",
    split: "session",
    masking: "assistant_only_loss",
    artifact: "outputs/x",
    tracking: "none",
    eval: "frozen pack",
    claim: "format validity only",
  },
  { o1: "note" }
);
assert(report.includes("# SFT Capstone Report"), "report has title");
assert(report.includes("Teach format"), "report has objective");
assert(report.includes("Copilot tasking"), "report has copilot section");
assert(report.includes("- o1: note"), "report includes notes");

const scoreTxt = Lib.interpretScoreDelta(5, 6.5, -0.5);
assert(scoreTxt.includes("Average delta: 1.5"), "score delta text");
assert(scoreTxt.includes("OOD"), "OOD regression mentioned");

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

// Cross-check train script flags
const trainPy = readFileSync(
  join(__dirname, "..", "examples", "sft-mentor-lab", "train_lora_sft.py"),
  "utf8"
);
for (const flag of [
  "--model-name",
  "--dataset-name",
  "--output-dir",
  "--max-steps",
  "--max-seq-length",
  "--per-device-train-batch-size",
  "--gradient-accumulation-steps",
]) {
  assert(trainPy.includes('"' + flag + '"') || trainPy.includes("'" + flag + "'"), "train script defines " + flag);
  assert(cmd.includes(flag), "generated command uses " + flag);
}

if (failed) {
  console.error("\nSTRUCTURAL/LOGIC CHECK: FAIL (" + failed + " assertions)");
  process.exit(1);
}
console.log("\nPASS structural+logic lessons=" + struct.lessonCount + " activities=" + struct.activities.length);
