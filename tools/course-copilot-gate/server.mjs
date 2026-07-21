// tools/course-copilot-gate/server.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildCreatePrompt, buildResumePrompt } from "./prompt.mjs";
import { loadSession, saveSession, resetSession } from "./session.mjs";
import { runGrokTurn } from "./grok.mjs";
import { resolveDocsPath } from "./static.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOOL_POLICY = "read_file,grep,list_dir (Agent disallowed; no --yolo)";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function defaultRepoRoot() {
  // tools/course-copilot-gate → repo root is two levels up
  return path.resolve(__dirname, "../..");
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("body too large"), { code: "BODY_TOO_LARGE" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

function truncateId(id, n = 12) {
  if (id == null) return null;
  const s = String(id);
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

function binaryExists(grokBin) {
  if (!grokBin) return false;
  // Absolute or relative path that exists on disk.
  try {
    if (fs.existsSync(grokBin) && fs.statSync(grokBin).isFile()) {
      return true;
    }
  } catch {
    // continue
  }
  // PATH lookup (simple which).
  const pathEnv = process.env.PATH || "";
  const parts = pathEnv.split(path.delimiter).filter(Boolean);
  for (const dir of parts) {
    const candidate = path.join(dir, grokBin);
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return true;
      }
    } catch {
      // continue
    }
  }
  return false;
}

function authHintPresent() {
  try {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    if (!home) return false;
    return fs.existsSync(path.join(home, ".grok", "auth.json"));
  } catch {
    return false;
  }
}

/**
 * Create the course copilot gate HTTP server.
 *
 * @returns {{ server: http.Server, listen: () => Promise<void>, close: () => Promise<void>, state: object }}
 */
export function createServer(options = {}) {
  const host = options.host || "127.0.0.1";
  const port = options.port != null ? Number(options.port) : 8787;
  const repoRoot = path.resolve(options.repoRoot || defaultRepoRoot());
  const docsRoot = path.resolve(options.docsRoot || path.join(repoRoot, "docs"));
  const grokBin = options.grokBin || process.env.GROK_BIN || "grok";
  const extraArgs = Array.isArray(options.extraArgs) ? options.extraArgs : [];
  const maxTurns =
    options.maxTurns != null
      ? Number(options.maxTurns)
      : Number(process.env.MAX_TURNS || 6);
  const timeoutMs =
    options.chatTimeoutMs != null
      ? Number(options.chatTimeoutMs)
      : options.timeoutMs != null
        ? Number(options.timeoutMs)
        : Number(process.env.CHAT_TIMEOUT_MS || process.env.TIMEOUT_MS || 180000);
  const rulesPath =
    options.rulesPath || path.join(__dirname, "tutor-rules.md");
  const grokEnv = options.grokEnv || undefined;

  let rulesText = "";
  try {
    rulesText = fs.readFileSync(rulesPath, "utf8");
  } catch (err) {
    throw new Error(
      `createServer: failed to load tutor rules at ${rulesPath}: ${err.message}`,
    );
  }

  const state = {
    busy: false,
    lastError: null,
    lastDurationMs: null,
  };

  async function handleHealth(_req, res) {
    const session = loadSession(repoRoot);
    sendJson(res, 200, {
      ok: true,
      binary: binaryExists(grokBin),
      authHint: authHintPresent(),
      sessionPresent: !!session,
      busy: state.busy,
    });
  }

  async function handleStatus(_req, res) {
    const session = loadSession(repoRoot);
    sendJson(res, 200, {
      sessionId: session ? truncateId(session.sessionId) : null,
      sessionIdFullPresent: !!(session && session.sessionId),
      cwd: session?.cwd || repoRoot,
      course: session?.course || null,
      createdAt: session?.createdAt || null,
      rulesBootstrapped: session ? !!session.rulesBootstrapped : false,
      toolPolicy: TOOL_POLICY,
      lastError: state.lastError,
      lastDurationMs: state.lastDurationMs,
      busy: state.busy,
    });
  }

  async function handleSessionReset(_req, res) {
    resetSession(repoRoot);
    state.lastError = null;
    sendJson(res, 200, { ok: true });
  }

  async function handleChat(req, res) {
    // Acquire mutex immediately so concurrent body-reads cannot both enter Grok.
    if (state.busy) {
      sendJson(res, 409, {
        ok: false,
        text: null,
        sessionId: null,
        reset: false,
        durationMs: 0,
        error: "busy",
      });
      return;
    }
    state.busy = true;

    let reset = false;
    try {
      let bodyRaw;
      try {
        bodyRaw = await readBody(req);
      } catch (err) {
        sendJson(res, err.code === "BODY_TOO_LARGE" ? 413 : 400, {
          ok: false,
          text: null,
          sessionId: null,
          reset: false,
          durationMs: 0,
          error: err.message || "bad body",
        });
        return;
      }

      let parsed;
      try {
        parsed = bodyRaw ? JSON.parse(bodyRaw) : {};
      } catch {
        sendJson(res, 400, {
          ok: false,
          text: null,
          sessionId: null,
          reset: false,
          durationMs: 0,
          error: "invalid json",
        });
        return;
      }

      const message =
        parsed && parsed.message != null ? String(parsed.message) : "";
      if (!message.trim()) {
        sendJson(res, 400, {
          ok: false,
          text: null,
          sessionId: null,
          reset: false,
          durationMs: 0,
          error: "empty message",
        });
        return;
      }

      const context =
        parsed && parsed.context && typeof parsed.context === "object"
          ? parsed.context
          : {
              course: "sft-interactive-playbook",
              view: "home",
              lessonId: null,
              module: null,
              lessonTitle: null,
              progress: {
                completedCount: 0,
                totalLessons: 0,
                percent: 0,
                completedIds: [],
              },
              capstoneComplete: false,
            };

      let session = loadSession(repoRoot);
      let isCreate = !session || !session.sessionId;

      const runOnce = async (createMode) => {
        const prompt = createMode
          ? buildCreatePrompt({ rulesText, context, message })
          : buildResumePrompt({ context, message });
        const sid = createMode ? null : session.sessionId;
        return runGrokTurn({
          grokBin,
          cwd: repoRoot,
          prompt,
          sessionId: sid,
          maxTurns,
          timeoutMs,
          extraArgs,
          env: grokEnv,
        });
      };

      let result = await runOnce(isCreate);

      // Optional single recreate if resume fails in a session-missing way (v1 simple).
      if (
        !result.ok &&
        !isCreate &&
        result.error &&
        /session|not found|unknown|invalid session|no such/i.test(
          String(result.error),
        )
      ) {
        resetSession(repoRoot);
        session = null;
        isCreate = true;
        reset = true;
        result = await runOnce(true);
      }

      state.lastDurationMs = result.durationMs;
      state.lastError = result.ok ? null : result.error || "error";

      if (result.ok && isCreate && result.sessionId) {
        saveSession(repoRoot, {
          sessionId: result.sessionId,
          createdAt: new Date().toISOString(),
          cwd: repoRoot,
          course: (context && context.course) || "sft-interactive-playbook",
          rulesBootstrapped: true,
        });
      }

      const stored = loadSession(repoRoot);
      sendJson(res, 200, {
        ok: !!result.ok,
        text: result.text,
        sessionId: result.sessionId || (stored && stored.sessionId) || null,
        reset,
        durationMs: result.durationMs,
        error: result.error,
      });
    } catch (err) {
      state.lastError = err && err.message ? err.message : String(err);
      sendJson(res, 500, {
        ok: false,
        text: null,
        sessionId: null,
        reset,
        durationMs: 0,
        error: state.lastError,
      });
    } finally {
      state.busy = false;
    }
  }

  async function handleStatic(req, res, urlPath) {
    const resolved = resolveDocsPath(docsRoot, urlPath);
    if (!resolved) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }

    let stat;
    try {
      stat = fs.statSync(resolved);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    if (stat.isDirectory()) {
      const indexPath = path.join(resolved, "index.html");
      if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
        streamFile(res, indexPath);
        return;
      }
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    if (!stat.isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    streamFile(res, resolved);
  }

  function streamFile(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    res.writeHead(200, {
      "content-type": type,
      "cache-control": "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const hostHeader = req.headers.host || `127.0.0.1:${port}`;
      const url = new URL(req.url || "/", `http://${hostHeader}`);
      const pathname = url.pathname;
      const method = (req.method || "GET").toUpperCase();

      if (method === "GET" && pathname === "/health") {
        await handleHealth(req, res);
        return;
      }
      if (method === "GET" && pathname === "/status") {
        await handleStatus(req, res);
        return;
      }
      if (method === "POST" && pathname === "/chat") {
        await handleChat(req, res);
        return;
      }
      if (method === "POST" && pathname === "/session/reset") {
        await handleSessionReset(req, res);
        return;
      }
      if (method === "GET") {
        await handleStatic(req, res, pathname + url.search + url.hash);
        return;
      }

      sendJson(res, 405, { ok: false, error: "method not allowed" });
    } catch (err) {
      if (!res.headersSent) {
        sendJson(res, 500, {
          ok: false,
          error: err && err.message ? err.message : String(err),
        });
      } else {
        res.end();
      }
    }
  });

  function listen() {
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
  }

  function close() {
    return new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  return {
    server,
    listen,
    close,
    state,
    options: { host, port, repoRoot, docsRoot, grokBin },
  };
}

export async function startFromEnv() {
  const host = process.env.HOST || "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "localhost") {
    console.error(
      `Refusing to bind non-loopback host "${host}". Use HOST=127.0.0.1.`,
    );
    process.exit(1);
  }
  const port = Number(process.env.PORT || 8787);
  const repoRoot = process.env.COURSE_REPO
    ? path.resolve(process.env.COURSE_REPO)
    : defaultRepoRoot();
  const docsRoot = process.env.DOCS_ROOT
    ? path.resolve(process.env.DOCS_ROOT)
    : path.join(repoRoot, "docs");
  const grokBin = process.env.GROK_BIN || "grok";

  let extraArgs = [];
  if (process.env.GROK_EXTRA_ARGS) {
    try {
      extraArgs = JSON.parse(process.env.GROK_EXTRA_ARGS);
    } catch {
      extraArgs = process.env.GROK_EXTRA_ARGS.split(/\s+/).filter(Boolean);
    }
  }

  const created = createServer({
    host,
    port,
    repoRoot,
    docsRoot,
    grokBin,
    extraArgs,
    maxTurns: process.env.MAX_TURNS ? Number(process.env.MAX_TURNS) : 6,
    chatTimeoutMs: process.env.CHAT_TIMEOUT_MS
      ? Number(process.env.CHAT_TIMEOUT_MS)
      : 180000,
  });

  await created.listen();
  const addr = created.server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;
  console.log(
    `course-copilot-gate listening on http://127.0.0.1:${actualPort}/`,
  );
  console.log(`  repoRoot: ${repoRoot}`);
  console.log(`  docsRoot: ${docsRoot}`);
  console.log(`  grokBin:  ${grokBin}`);
  console.log(
    `  open:     http://127.0.0.1:${actualPort}/sft-interactive-playbook.html`,
  );
  return created;
}

function isMain() {
  const entry = process.argv[1] && path.resolve(process.argv[1]);
  return entry && pathToFileURL(entry).href === import.meta.url;
}

if (isMain()) {
  startFromEnv().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
