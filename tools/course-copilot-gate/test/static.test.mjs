// tools/course-copilot-gate/test/static.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDocsPath } from "../static.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// tools/course-copilot-gate/test → repo root is 3 levels up
const repoRoot = path.resolve(__dirname, "../../..");
const docsRoot = path.join(repoRoot, "docs");

test("resolveDocsPath allows sft-interactive-playbook.html", () => {
  const resolved = resolveDocsPath(docsRoot, "/sft-interactive-playbook.html");
  assert.ok(resolved, "should allow playbook path");
  assert.equal(resolved, path.join(docsRoot, "sft-interactive-playbook.html"));
  assert.ok(fs.existsSync(resolved), "playbook file should exist on disk");
});

test("resolveDocsPath allows nested docs paths without leading slash", () => {
  const resolved = resolveDocsPath(docsRoot, "superpowers/plans/2026-07-21-course-copilot-gate.md");
  assert.ok(resolved);
  assert.equal(
    resolved,
    path.join(docsRoot, "superpowers", "plans", "2026-07-21-course-copilot-gate.md"),
  );
});

test("resolveDocsPath strips query and hash", () => {
  const resolved = resolveDocsPath(
    docsRoot,
    "/sft-interactive-playbook.html?x=1#section",
  );
  assert.equal(resolved, path.join(docsRoot, "sft-interactive-playbook.html"));
});

test("resolveDocsPath denies parent traversal", () => {
  assert.equal(resolveDocsPath(docsRoot, "/../.git/config"), null);
  assert.equal(resolveDocsPath(docsRoot, "../.git/config"), null);
  assert.equal(resolveDocsPath(docsRoot, "/../../etc/passwd"), null);
});

test("resolveDocsPath denies encoded traversal", () => {
  assert.equal(resolveDocsPath(docsRoot, "/%2e%2e/%2e%2e/.git/config"), null);
  assert.equal(resolveDocsPath(docsRoot, "/%2e%2e/.git/config"), null);
  assert.equal(resolveDocsPath(docsRoot, "/..%2f..%2f.git/config"), null);
  assert.equal(resolveDocsPath(docsRoot, "/%2e%2e%2f.git/config"), null);
});

test("resolveDocsPath denies null bytes", () => {
  assert.equal(resolveDocsPath(docsRoot, "/sft-interactive-playbook.html%00.js"), null);
  assert.equal(resolveDocsPath(docsRoot, "/sft\0evil"), null);
});

test("resolveDocsPath allows docsRoot itself for empty or slash path", () => {
  const a = resolveDocsPath(docsRoot, "/");
  const b = resolveDocsPath(docsRoot, "");
  assert.equal(a, path.resolve(docsRoot));
  assert.equal(b, path.resolve(docsRoot));
});
