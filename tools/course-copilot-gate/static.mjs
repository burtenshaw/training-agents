// tools/course-copilot-gate/static.mjs
import path from "node:path";

/**
 * Resolve a URL path to an absolute file under docsRoot, or null if denied.
 *
 * - Strips query/hash
 * - Decodes URI components
 * - Rejects null bytes
 * - Ensures resolved path is docsRoot or a descendant (docsRoot + sep)
 */
export function resolveDocsPath(docsRoot, urlPath) {
  if (docsRoot == null || urlPath == null) return null;

  const root = path.resolve(String(docsRoot));
  let raw = String(urlPath);

  // Strip query and hash before any decoding/joining.
  const q = raw.indexOf("?");
  if (q >= 0) raw = raw.slice(0, q);
  const h = raw.indexOf("#");
  if (h >= 0) raw = raw.slice(0, h);

  // Reject embedded nulls in the raw form.
  if (raw.includes("\0")) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  if (decoded.includes("\0")) return null;

  // Drop leading slashes so path.join/resolve stays under root when possible.
  const relative = decoded.replace(/^[/\\]+/, "");

  // path.resolve(root, relative) collapses ".." segments.
  const resolved = path.resolve(root, relative);

  if (resolved === root) return resolved;

  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (!resolved.startsWith(prefix)) return null;

  return resolved;
}
