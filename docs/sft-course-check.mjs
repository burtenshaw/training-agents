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
assert(html.includes('src="sft-course-copilot.js"'), "HTML loads copilot plugin");
assert(html.includes("SFTCoursePlayer"), "playbook exposes SFTCoursePlayer");

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
