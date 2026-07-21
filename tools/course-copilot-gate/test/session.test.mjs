// tools/course-copilot-gate/test/session.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  sessionPath,
  loadSession,
  saveSession,
  resetSession,
} from "../session.mjs";

function tempRepoRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "course-copilot-session-"));
}

const sample = {
  sessionId: "11111111-2222-3333-4444-555555555555",
  createdAt: "2026-07-21T12:00:00.000Z",
  cwd: "/tmp/repo",
  course: "sft-interactive-playbook",
  rulesBootstrapped: true,
};

test("sessionPath points at workspaces/course-copilot/session.json", () => {
  const root = "/repo/root";
  assert.equal(
    sessionPath(root),
    path.join(root, "workspaces", "course-copilot", "session.json"),
  );
});

test("loadSession returns null when file is missing", () => {
  const root = tempRepoRoot();
  assert.equal(loadSession(root), null);
});

test("saveSession then loadSession round-trips JSON", () => {
  const root = tempRepoRoot();
  saveSession(root, sample);
  const loaded = loadSession(root);
  assert.deepEqual(loaded, sample);
  assert.ok(fs.existsSync(sessionPath(root)));
});

test("resetSession removes the store so load returns null", () => {
  const root = tempRepoRoot();
  saveSession(root, sample);
  assert.ok(loadSession(root));
  resetSession(root);
  assert.equal(loadSession(root), null);
  assert.equal(fs.existsSync(sessionPath(root)), false);
});

test("resetSession is a no-op when file is missing", () => {
  const root = tempRepoRoot();
  assert.doesNotThrow(() => resetSession(root));
  assert.equal(loadSession(root), null);
});
