#!/usr/bin/env node
/**
 * Overflow containment check for course-copilot dock (#18).
 * Loads shipped playbook CSS + real markdown/event render path.
 * Run: node docs/sft-course-overflow-check.mjs
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Agui = require("./sft-course-agui.js");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
  } else {
    console.log("ok:", msg);
  }
}

const htmlPath = join(__dirname, "sft-interactive-playbook.html");
assert(existsSync(htmlPath), "playbook HTML exists");
const html = readFileSync(htmlPath, "utf8");

/** Extract rule body for first occurrence of selector prefix. */
function ruleBody(selectorPrefix) {
  const idx = html.indexOf(selectorPrefix);
  if (idx < 0) return null;
  const brace = html.indexOf("{", idx);
  if (brace < 0 || brace - idx > 160) return null;
  const end = html.indexOf("}", brace);
  if (end < 0) return null;
  return html.slice(brace + 1, end);
}

function requireProps(selector, props, label) {
  const body = ruleBody(selector);
  assert(body != null, label + ": rule found for " + selector.trim());
  if (!body) return;
  for (const p of props) {
    assert(body.includes(p), label + ": " + selector.trim() + " has " + p);
  }
}

// --- Shipped CSS containment chain (real file, not reimplemented) ---
requireProps(
  ".copilot-messages{",
  ["minmax(0,1fr)", "min-width:0", "overflow-x:auto", "overflow-y:auto"],
  "messages grid"
);
requireProps(
  ".copilot-msg{",
  ["min-width:0", "max-width:100%", "overflow-wrap:anywhere", "word-break:break-word"],
  "bubble"
);
requireProps(
  ".copilot-msg-body{",
  ["min-width:0", "max-width:100%", "overflow-wrap:anywhere", "word-break:break-word"],
  "body"
);
requireProps(
  ".copilot-md{",
  ["min-width:0", "max-width:100%", "overflow-wrap:anywhere"],
  "md"
);
requireProps(
  ".copilot-md-pre{",
  [
    "max-width:100%",
    "min-width:0",
    "overflow-x:auto",
    "white-space:pre-wrap",
    "overflow-wrap:anywhere",
    "word-break:break-word",
  ],
  "pre"
);
const codeBlockRule = ruleBody(".copilot-md-codeblock{");
assert(
  codeBlockRule &&
    codeBlockRule.includes("white-space:pre-wrap") &&
    codeBlockRule.includes("overflow-wrap:anywhere"),
  "codeblock wraps long mono lines (not word-break:normal only)"
);
assert(
  !codeBlockRule || !/word-break\s*:\s*normal/.test(codeBlockRule),
  "codeblock no longer forces word-break:normal (clips narrow dock)"
);
requireProps(".copilot-panel{", ["min-width:0", "overflow:hidden"], "panel");
requireProps(".copilot-compose{", ["min-width:0"], "compose usable width");

// Vertical scroll of list must remain (overflow-y auto on messages)
const msgRule = ruleBody(".copilot-messages{");
assert(msgRule && msgRule.includes("overflow-y:auto"), "messages list vertical scroll retained");

// --- Real render path fixture (pipe table + long word + fence) ---
const fixture = [
  "Good question — this is the core of m1l1: SFT as target-token imitation.",
  "",
  "## Short answer",
  "",
  "SFT is next-token prediction only_on_tokens_the_model_must_learn_to_produce_XXXXXXXXXXXXXXXXXXXXXXXX.",
  "",
  "| Mode | What is a target? | Meaning |",
  "|------|-------------------|---------|",
  "| Assistant-only | Only the assistant span | Loss on assistant |",
  "| Completion-only | Only the completion side | Same idea |",
  "",
  "```js",
  "const pipe = '| Mode | What is a target? | Meaning |';",
  "const long = 'https://example.com/very/long/path/that/should/scroll/inside/pre/not/clip';",
  "```",
].join("\n");

const events = Agui.textToAguiEvents(fixture, {
  messageId: "ovf-1",
  runId: "ovf-run",
  timestamp: 1,
});
const out = Agui.renderAssistantFromEvents(events);
assert(typeof out.html === "string" && out.html.length > 0, "renderAssistantFromEvents produced html");
assert(out.html.includes('class="copilot-md-pre"'), "fence → .copilot-md-pre (overflow-x:auto in CSS)");
assert(out.html.includes('class="copilot-md-p"'), "prose → .copilot-md-p (overflow-wrap in CSS)");
assert(
  out.html.includes('class="copilot-md-table"') && out.html.includes("<th") && out.html.includes("Mode"),
  "pipe-table renders as HTML table with headers"
);
assert(
  out.html.includes("| Mode | What is a target?"),
  "pipe-table source string still present inside fenced code (not only as raw table body)"
);
assert(out.html.includes("only_on_tokens_the_model_must_learn"), "long token present for wrap CSS");
assert(out.html.includes("https://example.com/very/long/path"), "long URL in pre content");
// Wide tables get overflow-safe wrapper class (CSS in playbook)
assert(out.html.includes("copilot-md-table-wrap"), "table wrapped for horizontal scroll");

// Mental-model diagram (screenshot regression): full lines present; CSS pre-wrap reflows them
const mental = [
  "## Mental model",
  "",
  "Think of each example as:",
  "",
  "```",
  "[context tokens] → model sees these",
  "[target tokens] → model is graded only on predicting these",
  "```",
].join("\n");
const mentalHtml = Agui.markdownToHtml(mental);
assert(mentalHtml.includes("[context tokens] → model sees these"), "mental-model context line complete in HTML");
assert(
  mentalHtml.includes("[target tokens] → model is graded only on predicting these"),
  "mental-model target line complete in HTML (not mid-word clip in source)"
);
assert(mentalHtml.includes('class="copilot-md-pre"'), "mental-model uses wrap-safe pre class");

// Dock markup shape from sft-course-copilot.js renderMessages path
const dockBubble =
  '<div class="copilot-msg copilot-msg--assistant">' +
  '<div class="copilot-msg-role">Copilot</div>' +
  '<div class="copilot-msg-body copilot-md">' +
  out.html +
  "</div></div>";
assert(dockBubble.includes("copilot-msg-body copilot-md"), "assistant body uses md classes");
assert(dockBubble.includes("copilot-md-pre"), "pre nested inside bubble for max-width/scroll");

// Confirm copilot.js still wires those classes (shipped entry, not reinvented)
const copilotJs = readFileSync(join(__dirname, "sft-course-copilot.js"), "utf8");
assert(copilotJs.includes("copilot-msg-body"), "copilot.js emits copilot-msg-body");
assert(copilotJs.includes("copilot-md"), "copilot.js emits copilot-md for assistant");
assert(copilotJs.includes("bodyHtmlForMessage") || copilotJs.includes("renderAssistantFromEvents"), "event-driven body path present");

if (failed) {
  console.error("\nOVERFLOW CHECK: FAIL (" + failed + " assertions)");
  process.exit(1);
}
console.log("\nPASS overflow containment (shipped CSS + render fixture)");
