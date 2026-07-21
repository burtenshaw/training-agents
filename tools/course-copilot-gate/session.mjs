// tools/course-copilot-gate/session.mjs
import fs from "node:fs";
import path from "node:path";

export function sessionPath(repoRoot) {
  return path.join(repoRoot, "workspaces", "course-copilot", "session.json");
}

export function loadSession(repoRoot) {
  const file = sessionPath(repoRoot);
  try {
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.name === "SyntaxError")) {
      return null;
    }
    throw err;
  }
}

export function saveSession(repoRoot, data) {
  const file = sessionPath(repoRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function resetSession(repoRoot) {
  const file = sessionPath(repoRoot);
  try {
    fs.unlinkSync(file);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      return;
    }
    throw err;
  }
}
