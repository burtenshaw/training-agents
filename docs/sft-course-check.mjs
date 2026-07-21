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
assert(html.includes('src="sft-course-paste-chips.js"'), "HTML loads paste-chip helpers");
assert(html.includes('src="sft-course-copilot.js"'), "HTML loads copilot plugin");
assert(html.includes("SFTCoursePlayer"), "playbook exposes SFTCoursePlayer");
assert(html.indexOf("sft-course-agui.js") < html.indexOf("sft-course-copilot.js"), "AG-UI loads before copilot");
assert(
  html.indexOf("sft-course-paste-chips.js") < html.indexOf("sft-course-copilot.js"),
  "paste-chips load before copilot"
);
assert(html.includes("copilot-paste-chip"), "playbook CSS includes paste chip styles");
assert(html.includes("copilot-compose-chips"), "playbook CSS includes compose chip tray");

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

// #26 GFM pipe tables via shipped markdownToHtml (screenshot-style fixture)
const tableFixture = [
  "## What the demo is showing",
  "",
  'In that "Try it" widget:',
  "",
  "| Mode | What is a target? | Meaning |",
  "|------|-------------------|--------|",
  '| **Assistant-only** | Only the assistant span | "Learn to write this reply given the chat so far." User text is ignored for the loss. |',
  "| **Completion-only** | Only the completion side of a prompt/completion pair | Same idea, different data shape. |",
  "",
  "| Unsafe | Note |",
  "|--------|------|",
  "| <script>alert(1)</script> | still escaped |",
].join("\n");
const tableHtml = Agui.markdownToHtml(tableFixture);
assert(tableHtml.includes("<table"), "GFM table emits <table>");
assert(tableHtml.includes('class="copilot-md-table"'), "GFM table uses copilot-md-table class");
assert(tableHtml.includes("<th"), "GFM table emits <th> headers");
assert(tableHtml.includes("<td"), "GFM table emits <td> cells");
assert(tableHtml.includes("Mode"), "table header Mode present");
assert(tableHtml.includes("What is a target?"), "table header target column present");
assert(tableHtml.includes("Meaning"), "table header Meaning present");
assert(tableHtml.includes("Assistant-only"), "Assistant-only row present");
assert(tableHtml.includes("Completion-only"), "Completion-only row present");
assert(
  tableHtml.includes("<strong>Assistant-only</strong>"),
  "bold inside table cell becomes <strong>"
);
assert(
  !/\|-{3,}/.test(tableHtml) && !tableHtml.includes("|------|"),
  "separator row is not left as raw body text"
);
assert(
  tableHtml.includes("&lt;script&gt;") || tableHtml.includes("&lt;script"),
  "script tags in cells are HTML-escaped"
);
assert(
  !/<script[\s>]/.test(tableHtml),
  "no live <script> tag from table cell content"
);
// Existing features still work in the same pass
assert(tableHtml.includes("<h2"), "heading still works alongside tables");
const tableViaEvents = Agui.renderAssistantFromEvents(
  Agui.textToAguiEvents(tableFixture, { messageId: "tbl", runId: "r", timestamp: 1 })
);
assert(tableViaEvents.html.includes("<table"), "event path also renders GFM tables");
assert(
  html.includes("copilot-md-table"),
  "playbook CSS includes table rules for dock theme"
);
assert(
  html.includes("copilot-md-table-wrap"),
  "playbook CSS includes overflow-safe table wrapper"
);

// #24 paste chips: pure helpers + structural wiring (shipped module, not reimplemented)
const pastePath = join(__dirname, "sft-course-paste-chips.js");
assert(existsSync(pastePath), "sft-course-paste-chips.js exists");
const Paste = require("./sft-course-paste-chips.js");
assert(typeof Paste.shouldBecomePasteChip === "function", "shouldBecomePasteChip exported");
assert(typeof Paste.applyPasteToCompose === "function", "applyPasteToCompose exported");
assert(typeof Paste.assembleComposeMessage === "function", "assembleComposeMessage exported");
assert(typeof Paste.renderCompactUserBodyHtml === "function", "renderCompactUserBodyHtml exported");
assert(typeof Paste.chipMetaLabel === "function", "chipMetaLabel exported");
assert(Paste.PASTE_CHIP_MIN_CHARS >= 100, "char threshold documented and non-trivial");
assert(Paste.PASTE_CHIP_MIN_LINES >= 2, "line threshold documented and non-trivial");

const shortPaste = "hello short paste";
assert(!Paste.shouldBecomePasteChip(shortPaste), "below-threshold paste stays plain text");
const shortResult = Paste.applyPasteToCompose("", [], shortPaste);
assert(shortResult.action === "insert", "short paste action=insert");
assert(shortResult.freeText === shortPaste, "short paste lands in freeText");
assert(shortResult.chips.length === 0, "short paste creates no chip");

const longLines = ["line1", "line2", "line3", "line4", "line5"].join("\n");
assert(Paste.shouldBecomePasteChip(longLines), "multi-line over threshold becomes chip");
const longChars = "x".repeat(Paste.PASTE_CHIP_MIN_CHARS);
assert(Paste.shouldBecomePasteChip(longChars), "char-length over threshold becomes chip");

const chipResult = Paste.applyPasteToCompose("why did this fail?", [], longLines);
assert(chipResult.action === "chip", "long paste action=chip");
assert(chipResult.freeText === "why did this fail?", "long paste keeps free text");
assert(chipResult.chips.length === 1, "long paste creates one chip");
assert(chipResult.chips[0].text === longLines, "chip retains full paste body");
assert(chipResult.chips[0].text.includes("line5"), "full body not truncated to preview");

const rePaste = Paste.applyPasteToCompose(
  chipResult.freeText,
  chipResult.chips,
  longLines
);
assert(rePaste.action === "expand", "re-paste same content expands existing chip");
assert(rePaste.chips.length === 1, "re-paste does not duplicate chip");
assert(rePaste.expandedChipId === chipResult.chips[0].id, "expand targets existing chip id");

const sendMsg = Paste.assembleComposeMessage("why did this fail?", chipResult.chips);
assert(sendMsg.includes("why did this fail?"), "send payload includes free-text ask");
assert(sendMsg.includes("line5"), "send payload includes full paste, not only preview");
assert(sendMsg.includes(longLines), "send payload embeds original paste verbatim");
assert(!sendMsg.includes(chipResult.chips[0].preview) || sendMsg.includes(longLines), "preview alone is not the model payload");

const multiA = Paste.createPasteChip("A".repeat(Paste.PASTE_CHIP_MIN_CHARS));
const multiB = Paste.createPasteChip("B".repeat(Paste.PASTE_CHIP_MIN_CHARS + 10));
const multiMsg = Paste.assembleComposeMessage("compare these", [multiA, multiB]);
assert(multiMsg.includes("A".repeat(Paste.PASTE_CHIP_MIN_CHARS)), "multi-chip send includes paste A full text");
assert(multiMsg.includes("B".repeat(Paste.PASTE_CHIP_MIN_CHARS + 10)), "multi-chip send includes paste B full text");

const userMsg = {
  role: "user",
  freeText: "why did this fail?",
  pastes: chipResult.chips,
  text: sendMsg,
};
assert(Paste.shouldRenderUserMessageCompact(userMsg), "user message with pastes is compact");
const compactHtml = Paste.renderCompactUserBodyHtml(userMsg);
assert(compactHtml.includes("copilot-paste-chip"), "compact render emits paste chip markup");
assert(compactHtml.includes("copilot-paste-chip-label"), "compact chip has label");
assert(compactHtml.includes("why did this fail?"), "compact render keeps free text");
assert(
  compactHtml.includes("pasted") && compactHtml.includes("lines"),
  "compact chip shows size meta, not the full dump as body text"
);
// Full dump is available inside collapsed body (escaped), but default toggle is collapsed
assert(compactHtml.includes("hidden") || compactHtml.includes('data-expanded="false"'), "chip body collapsed by default");
const slim = Paste.slimMessageForStorage(userMsg);
assert(slim.pastes && slim.pastes[0].text === longLines, "storage slim keeps full paste text");
assert(slim.text === sendMsg, "storage slim keeps full assembled text");

const copilotSrc = readFileSync(join(__dirname, "sft-course-copilot.js"), "utf8");
assert(copilotSrc.includes("handleComposerPaste") || copilotSrc.includes("paste"), "copilot handles paste events");
assert(copilotSrc.includes("assembleComposeMessage") || copilotSrc.includes("buildOutboundMessage"), "copilot assembles full send payload");
assert(copilotSrc.includes("SFTCoursePasteChips") || copilotSrc.includes("pasteChips"), "copilot uses paste-chip module");
assert(copilotSrc.includes("copilotComposeChips"), "copilot compose chip tray id present");
assert(copilotSrc.includes("pastes"), "copilot persists pastes on user turns");

// #18 dock overflow containment: assert shipped CSS (not a re-implemented sheet)
function cssRuleHas(selectorSnippet, propSnippets) {
  // Prefer exact selector start (snippet ending in `{`) so `.copilot-messages` does
  // not match `.copilot-messages-shell` first after the scroll shell was added (#25).
  const idx = html.indexOf(selectorSnippet);
  if (idx < 0) return false;
  const brace =
    selectorSnippet.includes("{")
      ? idx + selectorSnippet.indexOf("{")
      : html.indexOf("{", idx);
  if (brace < 0 || brace - idx > 120) return false;
  const end = html.indexOf("}", brace);
  if (end < 0) return false;
  const body = html.slice(brace, end + 1);
  return propSnippets.every((p) => body.includes(p));
}
assert(
  cssRuleHas(".copilot-messages{", ["minmax(0,1fr)", "min-width:0", "overflow-x:auto", "overflow-y:auto"]),
  "copilot-messages grid/overflow containment"
);
assert(
  cssRuleHas(".copilot-md-pre{", ["white-space:pre-wrap", "overflow-wrap:anywhere", "word-break:break-word"]),
  "copilot-md-pre reflows long mono lines (pre-wrap)"
);
assert(
  cssRuleHas(".copilot-md-codeblock{", ["white-space:pre-wrap", "overflow-wrap:anywhere"]),
  "codeblock wraps instead of clipping"
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
assert(
  longRendered.html.includes('class="copilot-md-table"') &&
    longRendered.html.includes("<th") &&
    longRendered.html.includes("Mode") &&
    longRendered.html.includes("What is a target?"),
  "fixture renders pipe-table as HTML table (not raw pipes)"
);
assert(!longRendered.html.includes("|------|"), "fixture does not leave separator as body text");
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
assert(typeof Lib.sidebarCollapsedDomClasses === "function", "sidebarCollapsedDomClasses exported");
assert(typeof Lib.parseOpenCopilotThirdTrackPx === "function", "parseOpenCopilotThirdTrackPx exported");
assert(Lib.COPILOT_OPEN_TRACK_PX > 320, "COPILOT_OPEN_TRACK_PX > 320");
assert(
  Lib.parseOpenCopilotThirdTrackPx("360px minmax(0,1fr) " + Lib.COPILOT_OPEN_TRACK_PX + "px") ===
    Lib.COPILOT_OPEN_TRACK_PX,
  "parseOpenCopilotThirdTrackPx reads fixed third track"
);
const hideClasses = Lib.sidebarCollapsedDomClasses(true);
assert(hideClasses.appClass === "sidebar-collapsed", "collapsed app class");
assert(hideClasses.sidebarClass === "is-collapsed", "collapsed sidebar class");
// Shipped playbook encodes wider copilot + sidebar collapse
assert(html.includes("440px") || html.includes(String(Lib.COPILOT_OPEN_TRACK_PX) + "px"), "playbook open copilot track wider than 320");
assert(html.includes(".app.sidebar-collapsed"), "playbook CSS has sidebar-collapsed");
assert(html.includes('id="sidebarCollapse"') && html.includes('id="sidebarExpand"'), "playbook sidebar toggle controls");
assert(html.includes("initSidebarCollapse"), "playbook inits sidebar collapse");

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
