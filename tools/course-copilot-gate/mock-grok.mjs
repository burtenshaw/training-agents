#!/usr/bin/env node
// tools/course-copilot-gate/mock-grok.mjs
// Fake headless Grok CLI for unit/integration tests.

function parseArgv(argv) {
  let prompt = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-p") {
      prompt = argv[i + 1] ?? "";
      i += 1;
    }
  }
  return { prompt };
}

function extractLessonId(prompt) {
  if (!prompt) return null;
  // Prefer the LOCATION OVERRIDE block when present.
  const overrideIdx = prompt.indexOf("LOCATION OVERRIDE");
  const slice = overrideIdx >= 0 ? prompt.slice(overrideIdx) : prompt;
  const m = slice.match(/lessonId:\s*(\S+)/);
  return m ? m[1] : null;
}

const sleepMs = Number(process.env.MOCK_SLEEP_MS || 0);
const sessionId =
  process.env.MOCK_SESSION_ID || "00000000-0000-4000-8000-000000000001";

async function main() {
  if (Number.isFinite(sleepMs) && sleepMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }

  const args = process.argv.slice(2);
  const { prompt } = parseArgv(args);
  const lessonId = extractLessonId(prompt);

  const text = lessonId
    ? `Mock tutor reply for lessonId ${lessonId}.`
    : "Mock tutor reply (no lessonId in LOCATION OVERRIDE).";

  const result = {
    text,
    sessionId,
    stopReason: "EndTurn",
    // Echo argv so tests can assert flags without a real CLI.
    args,
  };

  process.stdout.write(JSON.stringify(result) + "\n");
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err) + "\n");
  process.exit(1);
});
