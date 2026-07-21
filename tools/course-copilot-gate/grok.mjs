// tools/course-copilot-gate/grok.mjs
import { spawn } from "node:child_process";

/**
 * Run one headless Grok turn (create or resume).
 *
 * Spawn shape: spawn(grokBin, [...extraArgs, ...cliFlags])
 * For mock tests: grokBin=process.execPath, extraArgs=[pathToMockGrok]
 * Alias: grokArgs is accepted as a synonym for extraArgs.
 *
 * Never passes --yolo. Kills the child on timeout.
 *
 * @returns {Promise<{ ok: boolean, text: string|null, sessionId: string|null, error: string|null, durationMs: number, args?: string[] }>}
 */
export async function runGrokTurn({
  grokBin,
  cwd,
  prompt,
  sessionId = null,
  maxTurns = 6,
  timeoutMs = 180000,
  extraArgs = [],
  grokArgs,
  env,
} = {}) {
  if (!grokBin) {
    throw new TypeError("runGrokTurn: grokBin is required");
  }
  if (prompt == null) {
    throw new TypeError("runGrokTurn: prompt is required");
  }

  const prefix = Array.isArray(extraArgs) && extraArgs.length
    ? extraArgs
    : Array.isArray(grokArgs)
      ? grokArgs
      : [];

  const cliFlags = [
    "-p",
    String(prompt),
    "--cwd",
    cwd != null ? String(cwd) : process.cwd(),
    "--output-format",
    "json",
    "--tools",
    "read_file,grep,list_dir",
    "--disallowed-tools",
    "Agent",
    "--max-turns",
    String(maxTurns),
  ];

  if (sessionId) {
    cliFlags.push("-r", String(sessionId));
  }

  // Never --yolo in v1.
  const args = [...prefix, ...cliFlags];
  const start = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let stdout = "";
    let stderr = "";
    let forceKillTimer = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      resolve({
        ...result,
        durationMs: Date.now() - start,
      });
    };

    const child = spawn(grokBin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: env || process.env,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
      forceKillTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }, 1000);
      if (typeof forceKillTimer.unref === "function") {
        forceKillTimer.unref();
      }
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (err) => {
      finish({
        ok: false,
        text: null,
        sessionId: null,
        error: err && err.message ? err.message : String(err),
      });
    });

    child.on("close", (code) => {
      if (timedOut) {
        finish({
          ok: false,
          text: null,
          sessionId: null,
          error: "timeout",
        });
        return;
      }

      if (code !== 0) {
        const msg =
          (stderr && stderr.trim()) ||
          (stdout && stdout.trim()) ||
          `exit ${code}`;
        finish({
          ok: false,
          text: null,
          sessionId: null,
          error: msg,
        });
        return;
      }

      const trimmed = stdout.trim();
      if (!trimmed) {
        finish({
          ok: false,
          text: null,
          sessionId: null,
          error: "empty output",
        });
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        finish({
          ok: false,
          text: null,
          sessionId: null,
          error: "invalid json",
        });
        return;
      }

      const out = {
        ok: true,
        text: parsed.text != null ? String(parsed.text) : null,
        sessionId: parsed.sessionId != null ? String(parsed.sessionId) : null,
        error: null,
      };
      if (Array.isArray(parsed.args)) {
        out.args = parsed.args.map(String);
      }
      finish(out);
    });
  });
}
