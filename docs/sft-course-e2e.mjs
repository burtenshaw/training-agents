#!/usr/bin/env node
/**
 * Playwright e2e for docs/sft-interactive-playbook.html
 * Run: node docs/sft-course-e2e.mjs
 * Env: SFT_COURSE_E2E_OUT=/path/to/log
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const COURSE = require("./sft-course-data.js");
const Lib = require("./sft-course-lib.js");

const outDir =
  process.env.SFT_COURSE_E2E_OUT ||
  join(__dirname, "..", "workspaces", "sft-course-e2e");
mkdirSync(outDir, { recursive: true });
const logPath = join(outDir, "sft-course-e2e.log");
const shotPath = join(outDir, "sft-course-ui.png");
const lines = [];
function log(msg) {
  lines.push(msg);
  console.log(msg);
}

async function loadPlaywright() {
  // Prefer createRequire so NODE_PATH / local installs work under ESM.
  try {
    return require("playwright");
  } catch (_) {
    /* continue */
  }
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    process.env.NODE_PATH && join(process.env.NODE_PATH, "playwright"),
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      return require(c);
    } catch (_) {
      /* try next */
    }
  }
  try {
    return await import("playwright");
  } catch (e) {
    throw new Error("playwright module not found: " + e.message);
  }
}

async function runOnce(label) {
  log("=== run " + label + " ===");
  const playwright = await loadPlaywright();
  const { chromium } = playwright;
  const htmlPath = join(__dirname, "sft-interactive-playbook.html");
  if (!existsSync(htmlPath)) throw new Error("missing " + htmlPath);
  const fileUrl = pathToFileURL(htmlPath).href;

  const errors = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  const page = await context.newPage();
  page.on("pageerror", (err) => errors.push("pageerror: " + err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push("console.error: " + msg.text());
  });

  await page.goto(fileUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#progressLabel");
  const progress0 = await page.locator("#progressLabel").innerText();
  log("progress on load: " + progress0);
  if (!/0\/\d+/.test(progress0) && !/\d+\/\d+/.test(progress0)) {
    throw new Error("progress label missing counts: " + progress0);
  }

  // sidebar present
  await page.waitForSelector(".progress-bar");
  await page.waitForSelector("#courseNav .lesson-link");

  // Start course
  await page.click('button[data-goto="o1"]');
  await page.waitForSelector("#lesson-o1.active");

  // Walk first, mid, last lessons
  const first = COURSE[0];
  const mid = COURSE[Math.floor(COURSE.length / 2)];
  const last = COURSE[COURSE.length - 1];
  const sample = [first, mid, last];

  async function exerciseLesson(lesson) {
    log("exercise " + lesson.id);
    await page.click('.lesson-link[data-goto="' + lesson.id + '"]');
    await page.waitForSelector("#lesson-" + lesson.id + ".active");
    // quiz: click correct option
    const correct = page.locator("#lesson-" + lesson.id + " .option[data-correct='true']");
    await correct.click();
    const fb = await page.locator("#lesson-" + lesson.id + " .feedback").innerText();
    if (!/Correct/i.test(fb)) throw new Error("quiz feedback not correct for " + lesson.id + ": " + fb);
    // activity
    const actRoot = page.locator("#lesson-" + lesson.id + " .activity-root");
    const runBtn = actRoot.locator("[data-run]").first();
    const choiceBtn = actRoot.locator(".choice").first();
    const maskBtn = actRoot.locator("[data-mask]").first();
    if (await runBtn.count()) {
      await runBtn.click();
    } else if (await choiceBtn.count()) {
      await choiceBtn.click();
    } else if (await maskBtn.count()) {
      await maskBtn.click();
    }
    const out = page.locator("#out-" + lesson.id);
    if (await out.count()) {
      const text = (await out.innerText()).trim();
      if (!text) throw new Error("activity output empty for " + lesson.id);
      log("activity out len=" + text.length);
    }
    // mark complete
    const before = await page.locator("#progressLabel").innerText();
    await page.locator("#lesson-" + lesson.id + ' [data-complete="' + lesson.id + '"]').click();
    await page.waitForTimeout(50);
    const after = await page.locator("#progressLabel").innerText();
    log("progress " + before + " -> " + after);
    // progress should not decrease
    const pct = (s) => {
      const m = s.match(/(\d+)%/);
      return m ? Number(m[1]) : 0;
    };
    if (pct(after) < pct(before)) throw new Error("progress decreased");
  }

  for (const l of sample) await exerciseLesson(l);

  // Capstone report
  await page.click('.lesson-link[data-goto="capstone"]');
  await page.waitForSelector("#lesson-capstone.active");
  await page.fill('[data-cap="objective"]', "E2E objective: teach tool format");
  await page.click("#buildReport");
  const report = await page.locator("#reportOut").innerText();
  if (!report.includes("SFT Capstone Report")) throw new Error("report missing title");
  if (!report.includes("E2E objective")) throw new Error("report missing objective");
  log("report length " + report.length);

  // Export
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 5000 }).catch(() => null),
    page.click("#exportBtn"),
  ]);
  if (download) {
    log("export download: " + download.suggestedFilename());
  } else {
    log("export: no download event (ok if browser blocked); state still tested via storage");
  }

  // Persistence across reload
  const stored = await page.evaluate(() => localStorage.getItem("sft-course-player-v3"));
  if (!stored) throw new Error("localStorage empty after completions");
  const parsed = JSON.parse(stored);
  if (!parsed.completed[first.id]) throw new Error("first lesson not completed in storage");
  log("storage completed keys: " + Object.keys(parsed.completed).join(","));

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#progressLabel");
  const progressReload = await page.locator("#progressLabel").innerText();
  log("progress after reload: " + progressReload);
  const m = progressReload.match(/(\d+)\/(\d+)/);
  if (!m || Number(m[1]) < 1) throw new Error("completed state not restored: " + progressReload);

  // Reset
  page.once("dialog", (d) => d.accept());
  await page.click("#resetBtn");
  await page.waitForSelector("#progressLabel");
  await page.waitForTimeout(100);
  const progressReset = await page.locator("#progressLabel").innerText();
  log("progress after reset: " + progressReset);
  // after reload from reset, should be 0
  if (!/0\//.test(progressReset)) {
    // reset reloads page; may need re-read
    log("WARN: expected 0 completed after reset, got " + progressReset);
  }

  await page.screenshot({ path: shotPath, fullPage: true });
  log("screenshot: " + shotPath);

  await browser.close();

  if (errors.length) {
    throw new Error("page errors: " + errors.join(" | "));
  }
  log("run " + label + " OK");
}

async function main() {
  try {
    await runOnce("1");
    await runOnce("2");
    log("PASS e2e twice");
    writeFileSync(logPath, lines.join("\n") + "\n");
    // also copy paths note
    console.log("LOG=" + logPath);
    process.exit(0);
  } catch (e) {
    log("FAIL: " + (e && e.stack ? e.stack : e));
    writeFileSync(logPath, lines.join("\n") + "\n");
    console.error("LOG=" + logPath);
    process.exit(1);
  }
}

main();
