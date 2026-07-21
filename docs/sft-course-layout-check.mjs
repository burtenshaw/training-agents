#!/usr/bin/env node
/**
 * Layout check: wider open copilot track + collapsible progress sidebar.
 * Reads shipped playbook CSS + pure lib helpers (no reimplemented layout).
 * Run: node docs/sft-course-layout-check.mjs
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Lib = require("./sft-course-lib.js");

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

function ruleBody(selectorPrefix) {
  const idx = html.indexOf(selectorPrefix);
  if (idx < 0) return null;
  const brace = html.indexOf("{", idx);
  if (brace < 0 || brace - idx > 200) return null;
  const end = html.indexOf("}", brace);
  if (end < 0) return null;
  return html.slice(brace + 1, end);
}

// --- Wider open-copilot third track from shipped CSS ---
const openRule = ruleBody(".app.has-copilot{");
assert(openRule != null, "found .app.has-copilot rule");
const gridMatch = openRule && openRule.match(/grid-template-columns\s*:\s*([^;]+)/);
assert(!!gridMatch, "has-copilot declares grid-template-columns");
const thirdPx = Lib.parseOpenCopilotThirdTrackPx(gridMatch ? gridMatch[1] : "");
assert(thirdPx != null && thirdPx > 320, "open copilot track > 320px (got " + thirdPx + ")");
assert(
  thirdPx === Lib.COPILOT_OPEN_TRACK_PX,
  "lib COPILOT_OPEN_TRACK_PX matches CSS third track (" + thirdPx + ")"
);

// Progress collapsed shrinks left column
const sideOnly = ruleBody(".app.sidebar-collapsed{");
assert(sideOnly != null, "found .app.sidebar-collapsed rule");
assert(
  sideOnly && sideOnly.includes("52px") && sideOnly.includes("minmax(0,1fr)"),
  "sidebar-collapsed shrinks progress to rail"
);
const bothOpen = ruleBody(".app.has-copilot.sidebar-collapsed{");
// careful: more specific selector may be found by partial match of shorter ones
const bothIdx = html.indexOf(".app.has-copilot.sidebar-collapsed{");
assert(bothIdx >= 0, "found has-copilot.sidebar-collapsed combo");
const bothBody = bothIdx >= 0 ? ruleBody(".app.has-copilot.sidebar-collapsed{") : null;
assert(
  bothBody && bothBody.includes("52px") && bothBody.includes("440px"),
  "progress collapsed + copilot open → rail + main + 440px"
);
const allCollapsed = ruleBody(".app.has-copilot.sidebar-collapsed.copilot-collapsed{");
assert(
  allCollapsed && /52px.*52px/.test(allCollapsed.replace(/\s+/g, "")),
  "both collapsed → dual rails"
);

// Markup controls
assert(html.includes('id="sidebarCollapse"'), "collapse control present");
assert(html.includes('id="sidebarExpand"'), "expand control present");
assert(html.includes("sidebar-panel"), "sidebar panel wrapper");
assert(html.includes("sidebar-rail"), "sidebar rail");
assert(html.includes("initSidebarCollapse"), "playbook wires initSidebarCollapse");
assert(html.includes("setSidebarCollapsed"), "playbook defines setSidebarCollapsed");
assert(html.includes("Lib.SIDEBAR_COLLAPSED_KEY"), "uses pure lib storage key");

// Pure toggle helpers (drive real functions)
assert(Lib.SIDEBAR_COLLAPSED_KEY === "sft-course-sidebar-collapsed-v1", "storage key constant");
assert(Lib.parseSidebarCollapsed("1") === true, "parse collapsed true");
assert(Lib.parseSidebarCollapsed("0") === false, "parse collapsed false");
assert(Lib.parseSidebarCollapsed(null) === false, "parse null → expanded");
assert(Lib.sidebarCollapsedStorageValue(true) === "1", "storage value collapsed");
assert(Lib.sidebarCollapsedStorageValue(false) === "0", "storage value expanded");
const hide = Lib.sidebarCollapsedDomClasses(true);
assert(hide.appClass === "sidebar-collapsed", "hide applies app class");
assert(hide.sidebarClass === "is-collapsed", "hide applies sidebar is-collapsed");
const show = Lib.sidebarCollapsedDomClasses(false);
assert(show.appClass === "" && show.sidebarClass === "", "show clears classes");

// Round-trip hide → show via pure helpers (same path playbook uses for class/key)
let stored = Lib.sidebarCollapsedStorageValue(true);
let classes = Lib.sidebarCollapsedDomClasses(Lib.parseSidebarCollapsed(stored));
assert(classes.appClass === "sidebar-collapsed", "hide→storage→classes round trip");
stored = Lib.sidebarCollapsedStorageValue(false);
classes = Lib.sidebarCollapsedDomClasses(Lib.parseSidebarCollapsed(stored));
assert(classes.appClass === "", "show→storage→classes round trip");

if (failed) {
  console.error("\nLAYOUT CHECK: FAIL (" + failed + " assertions)");
  process.exit(1);
}
console.log("\nPASS layout: copilot track=" + thirdPx + "px, progress sidebar collapsible");
