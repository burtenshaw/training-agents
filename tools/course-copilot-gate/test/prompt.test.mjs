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
