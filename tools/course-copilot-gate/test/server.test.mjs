// tools/course-copilot-gate/test/server.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.mjs";
import { loadSession, resetSession } from "../session.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gateDir = path.resolve(__dirname, "..");
const mockPath = path.join(gateDir, "mock-grok.mjs");
const repoRootReal = path.resolve(gateDir, "../..");
const docsRoot = path.join(repoRootReal, "docs");

function tempRepoRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "course-copilot-server-"));
}

async function withServer(options, fn) {
  const created = createServer({
    host: "127.0.0.1",
    port: 0,
    docsRoot,
    grokBin: process.execPath,
    extraArgs: [mockPath],
    maxTurns: 2,
    timeoutMs: 15_000,
    chatTimeoutMs: 15_000,
    ...options,
  });
  await created.listen();
  const { port } = created.server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    return await fn({ base, created, port });
  } finally {
    await created.close();
  }
}

async function jsonFetch(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body, text };
}

test("GET /health reports ok, binary, busy, sessionPresent", async () => {
  const root = tempRepoRoot();
  resetSession(root);
  await withServer({ repoRoot: root }, async ({ base }) => {
    const { res, body } = await jsonFetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.binary, true);
    assert.equal(typeof body.authHint, "boolean");
    assert.equal(body.sessionPresent, false);
    assert.equal(body.busy, false);
  });
});

test("GET /status returns session metadata and tool policy", async () => {
  const root = tempRepoRoot();
  resetSession(root);
  await withServer({ repoRoot: root }, async ({ base }) => {
    const { res, body } = await jsonFetch(`${base}/status`);
    assert.equal(res.status, 200);
    assert.equal(body.sessionId, null);
    assert.equal(body.cwd, root);
    assert.match(String(body.toolPolicy), /read_file/);
    assert.equal(body.lastError, null);
    assert.ok(
      body.lastDurationMs === null || typeof body.lastDurationMs === "number",
    );
  });
});

test("POST /chat empty message returns 400", async () => {
  const root = tempRepoRoot();
  await withServer({ repoRoot: root }, async ({ base }) => {
    const { res, body } = await jsonFetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "   ", context: { course: "sft" } }),
    });
    assert.equal(res.status, 400);
    assert.equal(body.ok, false);
  });
});

test("POST /chat create saves session and returns tutor text", async () => {
  const root = tempRepoRoot();
  resetSession(root);
  await withServer({ repoRoot: root }, async ({ base }) => {
    const ctx = {
      course: "sft-interactive-playbook",
      view: "lesson",
      lessonId: "m1l1",
      module: "Module 1",
      lessonTitle: "SFT as target-token imitation",
      progress: {
        completedCount: 1,
        totalLessons: 21,
        percent: 5,
        completedIds: ["o1"],
      },
      capstoneComplete: false,
    };
    const { res, body } = await jsonFetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Where am I?", context: ctx }),
    });
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.ok(body.sessionId);
    assert.match(String(body.text), /m1l1/);
    assert.equal(typeof body.durationMs, "number");
    assert.equal(body.error, null);
    assert.ok(Array.isArray(body.events), "chat response includes AG-UI events");
    const types = body.events.map((e) => e && e.type);
    assert.ok(types.includes("RUN_STARTED"));
    assert.ok(types.includes("TEXT_MESSAGE_START"));
    assert.ok(types.includes("TEXT_MESSAGE_CONTENT"));
    assert.ok(types.includes("TEXT_MESSAGE_END"));
    assert.ok(types.includes("RUN_FINISHED"));
    const content = body.events.find((e) => e.type === "TEXT_MESSAGE_CONTENT");
    assert.match(String(content.delta), /m1l1/);

    const stored = loadSession(root);
    assert.ok(stored);
    assert.equal(stored.sessionId, body.sessionId);
    assert.equal(stored.course, "sft-interactive-playbook");
    assert.equal(stored.rulesBootstrapped, true);
    assert.equal(stored.cwd, root);
    assert.ok(stored.createdAt);

    const health = await jsonFetch(`${base}/health`);
    assert.equal(health.body.sessionPresent, true);
  });
});

test("POST /chat concurrent second request gets 409", async () => {
  const root = tempRepoRoot();
  resetSession(root);
  await withServer(
    {
      repoRoot: root,
      // inject env so mock sleeps long enough for overlap
      grokEnv: { ...process.env, MOCK_SLEEP_MS: "800" },
      chatTimeoutMs: 10_000,
    },
    async ({ base }) => {
      const payload = JSON.stringify({
        message: "slow turn",
        context: {
          course: "sft-interactive-playbook",
          view: "home",
          lessonId: null,
          module: null,
          lessonTitle: null,
          progress: {
            completedCount: 0,
            totalLessons: 21,
            percent: 0,
            completedIds: [],
          },
          capstoneComplete: false,
        },
      });

      const first = fetch(`${base}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
      });

      // Small delay so first request acquires mutex.
      await new Promise((r) => setTimeout(r, 50));

      const secondRes = await fetch(`${base}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
      });
      const secondBody = await secondRes.json();
      assert.equal(secondRes.status, 409);
      assert.equal(secondBody.ok, false);
      assert.match(String(secondBody.error || ""), /busy/i);

      const firstRes = await first;
      assert.equal(firstRes.status, 200);
      const firstBody = await firstRes.json();
      assert.equal(firstBody.ok, true);
    },
  );
});

test("POST /chat mutex holds during body read (held-body concurrency)", async () => {
  const http = await import("node:http");
  const root = tempRepoRoot();
  resetSession(root);
  await withServer(
    {
      repoRoot: root,
      grokEnv: { ...process.env, MOCK_SLEEP_MS: "0" },
      chatTimeoutMs: 10_000,
    },
    async ({ base, port }) => {
      const payload = Buffer.from(
        JSON.stringify({
          message: "held body",
          context: {
            course: "sft-interactive-playbook",
            view: "home",
            lessonId: null,
            module: null,
            lessonTitle: null,
            progress: {
              completedCount: 0,
              totalLessons: 21,
              percent: 0,
              completedIds: [],
            },
            capstoneComplete: false,
          },
        }),
      );

      function postHeldBody(delayMs) {
        return new Promise((resolve, reject) => {
          const req = http.request(
            {
              hostname: "127.0.0.1",
              port,
              path: "/chat",
              method: "POST",
              headers: {
                "content-type": "application/json",
                "content-length": payload.length,
              },
            },
            (res) => {
              const chunks = [];
              res.on("data", (c) => chunks.push(c));
              res.on("end", () => {
                const text = Buffer.concat(chunks).toString("utf8");
                let body = null;
                try {
                  body = JSON.parse(text);
                } catch {
                  body = text;
                }
                resolve({ status: res.statusCode, body });
              });
            },
          );
          req.on("error", reject);
          // Flush headers immediately so the server handler (and mutex) runs
          // before the delayed body arrives. Without this, Node may not deliver
          // the request until write()/end(), collapsing the concurrency window.
          req.flushHeaders();
          // Hold the body so two handlers would both pass a late mutex if buggy.
          setTimeout(() => {
            req.write(payload);
            req.end();
          }, delayMs);
        });
      }

      const a = postHeldBody(120);
      // Start second while first has acquired mutex but not finished body read.
      await new Promise((r) => setTimeout(r, 30));
      const b = postHeldBody(0);

      const [ra, rb] = await Promise.all([a, b]);
      const statuses = [ra.status, rb.status].sort();
      assert.deepEqual(statuses, [200, 409]);
      const busy = [ra, rb].find((r) => r.status === 409);
      assert.match(String(busy.body.error || ""), /busy/i);
    },
  );
});

test("POST /session/reset clears store", async () => {
  const root = tempRepoRoot();
  await withServer({ repoRoot: root }, async ({ base }) => {
    // Create a session via chat first.
    await jsonFetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "hi",
        context: {
          course: "sft-interactive-playbook",
          view: "home",
          lessonId: null,
          module: null,
          lessonTitle: null,
          progress: {
            completedCount: 0,
            totalLessons: 21,
            percent: 0,
            completedIds: [],
          },
          capstoneComplete: false,
        },
      }),
    });
    assert.ok(loadSession(root));

    const { res, body } = await jsonFetch(`${base}/session/reset`, {
      method: "POST",
    });
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(loadSession(root), null);
  });
});

test("static GET serves playbook html under docs", async () => {
  const root = tempRepoRoot();
  await withServer({ repoRoot: root }, async ({ base }) => {
    const res = await fetch(`${base}/sft-interactive-playbook.html`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /<!DOCTYPE html>/i);
    assert.match(res.headers.get("content-type") || "", /text\/html/);
  });
});

test("static GET denies path traversal", async () => {
  const root = tempRepoRoot();
  await withServer({ repoRoot: root }, async ({ base }) => {
    const res = await fetch(`${base}/../package.json`);
    // Traversal should be denied — 403 or 404, not file contents of outside docs.
    assert.ok(res.status === 403 || res.status === 404);
  });
});
