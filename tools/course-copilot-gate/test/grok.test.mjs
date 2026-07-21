// tools/course-copilot-gate/test/grok.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runGrokTurn } from "../grok.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mockPath = path.join(__dirname, "../mock-grok.mjs");

const baseOpts = {
  grokBin: process.execPath,
  extraArgs: [mockPath],
  cwd: process.cwd(),
};

const locationPrompt = [
  "## LOCATION OVERRIDE (authoritative; ignore any earlier location memory)",
  "course: sft-interactive-playbook",
  "view: lesson",
  "lessonId: m1l1",
  "module: Module 1",
  "lessonTitle: SFT as target-token imitation",
  "",
  "## User question",
  "Where am I?",
].join("\n");

test("create (sessionId null) returns ok and a sessionId", async () => {
  const result = await runGrokTurn({
    ...baseOpts,
    prompt: locationPrompt,
    sessionId: null,
    timeoutMs: 10_000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.error, null);
  assert.ok(result.sessionId, "sessionId should be returned on create");
  assert.match(result.text, /m1l1/);
  assert.equal(typeof result.durationMs, "number");
  assert.ok(result.durationMs >= 0);
  // Create must not pass -r
  assert.ok(Array.isArray(result.args));
  assert.equal(result.args.includes("-r"), false);
});

test("resume passes -r and --tools allowlist in argv", async () => {
  const sid = "11111111-2222-3333-4444-555555555555";
  const result = await runGrokTurn({
    ...baseOpts,
    prompt: locationPrompt,
    sessionId: sid,
    timeoutMs: 10_000,
  });

  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.args), "mock should echo args");

  const args = result.args;
  assert.ok(args.includes("-r"), "resume should pass -r");
  const rIdx = args.indexOf("-r");
  assert.equal(args[rIdx + 1], sid);

  assert.ok(args.includes("--tools"));
  const toolsIdx = args.indexOf("--tools");
  assert.equal(args[toolsIdx + 1], "read_file,grep,list_dir");

  assert.ok(args.includes("--disallowed-tools"));
  const disIdx = args.indexOf("--disallowed-tools");
  assert.equal(args[disIdx + 1], "Agent");

  assert.ok(args.includes("--output-format"));
  assert.ok(args.includes("--max-turns"));
  assert.equal(args.includes("--yolo"), false, "must never pass --yolo");
});

test("short timeout + MOCK_SLEEP_MS yields ok false timeout", async () => {
  const result = await runGrokTurn({
    ...baseOpts,
    prompt: "ping",
    sessionId: null,
    timeoutMs: 80,
    env: {
      ...process.env,
      MOCK_SLEEP_MS: "3000",
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "timeout");
  assert.equal(result.text, null);
  assert.equal(result.sessionId, null);
  assert.ok(result.durationMs < 3000, "should not wait full mock sleep");
});
