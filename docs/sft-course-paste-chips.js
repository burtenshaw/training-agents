/**
 * Pure paste-chip helpers for the course copilot dock (Grok-style).
 * Dual export: browser global `SFTCoursePasteChips` and Node `module.exports`.
 *
 * Long pastes become compact chips for display; full text is retained for
 * model-facing assembleComposeMessage and localStorage transcript.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SFTCoursePasteChips = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** Pastes at or above either threshold become chips instead of textarea text. */
  var PASTE_CHIP_MIN_CHARS = 240;
  var PASTE_CHIP_MIN_LINES = 4;
  var PREVIEW_MAX = 48;

  function countLines(text) {
    var s = text == null ? "" : String(text);
    if (!s) return 0;
    return s.split(/\r\n|\r|\n/).length;
  }

  function resolveThresholds(thresholds) {
    thresholds = thresholds || {};
    return {
      minChars:
        thresholds.minChars != null
          ? Number(thresholds.minChars)
          : PASTE_CHIP_MIN_CHARS,
      minLines:
        thresholds.minLines != null
          ? Number(thresholds.minLines)
          : PASTE_CHIP_MIN_LINES,
    };
  }

  /**
   * @param {string} text
   * @param {{ minChars?: number, minLines?: number }} [thresholds]
   * @returns {boolean}
   */
  function shouldBecomePasteChip(text, thresholds) {
    var body = text == null ? "" : String(text);
    if (!body) return false;
    var t = resolveThresholds(thresholds);
    var lines = countLines(body);
    return body.length >= t.minChars || lines >= t.minLines;
  }

  function newChipId() {
    return (
      "paste-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 10)
    );
  }

  function previewFromText(text) {
    var body = text == null ? "" : String(text);
    var line =
      body
        .split(/\r\n|\r|\n/)
        .map(function (ln) {
          return ln.trim();
        })
        .find(function (ln) {
          return ln.length > 0;
        }) || body.trim();
    line = String(line || "").replace(/\s+/g, " ");
    if (line.length <= PREVIEW_MAX) return line;
    return line.slice(0, PREVIEW_MAX - 1) + "…";
  }

  /**
   * @param {string} text
   * @param {{ id?: string }} [opts]
   * @returns {{ id: string, text: string, lines: number, chars: number, preview: string }}
   */
  function createPasteChip(text, opts) {
    opts = opts || {};
    var body = text == null ? "" : String(text);
    return {
      id: opts.id || newChipId(),
      text: body,
      lines: countLines(body),
      chars: body.length,
      preview: previewFromText(body),
    };
  }

  /**
   * @param {{ lines?: number, chars?: number, text?: string }} chip
   * @returns {string}
   */
  function chipMetaLabel(chip) {
    chip = chip || {};
    var lines =
      chip.lines != null
        ? Number(chip.lines)
        : countLines(chip.text != null ? chip.text : "");
    var chars =
      chip.chars != null
        ? Number(chip.chars)
        : chip.text != null
          ? String(chip.text).length
          : 0;
    var lineWord = lines === 1 ? "line" : "lines";
    return "pasted · " + lines + " " + lineWord + " · " + chars + " chars";
  }

  /**
   * @param {Array<{ text?: string, id?: string }>} chips
   * @param {string} text
   * @returns {{ id?: string, text?: string }|null}
   */
  function findChipByExactText(chips, text) {
    var body = text == null ? "" : String(text);
    var list = Array.isArray(chips) ? chips : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].text) === body) return list[i];
    }
    return null;
  }

  /**
   * Apply a paste into compose state. Over-threshold → chip (or expand existing
   * same-content chip); under-threshold → insert into free text.
   *
   * @param {string} freeText
   * @param {Array<object>} chips
   * @param {string} pastedText
   * @param {{ minChars?: number, minLines?: number }} [thresholds]
   * @returns {{ freeText: string, chips: Array<object>, action: string, chip?: object, expandedChipId?: string }}
   */
  function applyPasteToCompose(freeText, chips, pastedText, thresholds) {
    var free = freeText == null ? "" : String(freeText);
    var list = Array.isArray(chips) ? chips.slice() : [];
    var pasted = pastedText == null ? "" : String(pastedText);
    if (!pasted) {
      return { freeText: free, chips: list, action: "noop" };
    }
    if (!shouldBecomePasteChip(pasted, thresholds)) {
      return {
        freeText: free + pasted,
        chips: list,
        action: "insert",
      };
    }
    var existing = findChipByExactText(list, pasted);
    if (existing) {
      return {
        freeText: free,
        chips: list,
        action: "expand",
        expandedChipId: existing.id,
        chip: existing,
      };
    }
    var chip = createPasteChip(pasted);
    list.push(chip);
    return {
      freeText: free,
      chips: list,
      action: "chip",
      chip: chip,
    };
  }

  /**
   * Build the full model-facing `/chat` message string from free text + chips.
   * Full paste bodies are always included (not previews).
   *
   * @param {string} freeText
   * @param {Array<{ text?: string }>} chips
   * @returns {string}
   */
  function assembleComposeMessage(freeText, chips) {
    var free = freeText == null ? "" : String(freeText).trim();
    var list = Array.isArray(chips) ? chips : [];
    var bodies = [];
    for (var i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      var t = list[i].text == null ? "" : String(list[i].text);
      if (t) bodies.push(t);
    }
    if (!bodies.length) return free;
    if (!free) {
      if (bodies.length === 1) return bodies[0];
      return bodies
        .map(function (t, idx) {
          return "--- pasted " + (idx + 1) + " ---\n" + t;
        })
        .join("\n\n");
    }
    var parts = [free];
    for (var j = 0; j < bodies.length; j++) {
      var label =
        bodies.length > 1
          ? "--- pasted content " + (j + 1) + " ---"
          : "--- pasted content ---";
      parts.push(label + "\n" + bodies[j]);
    }
    return parts.join("\n\n");
  }

  /**
   * Whether a stored user message should render compact (chips) by default.
   * @param {{ pastes?: Array, text?: string }} message
   * @returns {boolean}
   */
  function shouldRenderUserMessageCompact(message) {
    if (!message || typeof message !== "object") return false;
    return Array.isArray(message.pastes) && message.pastes.length > 0;
  }

  function defaultEscHtml(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return (
        {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[m] || m
      );
    });
  }

  /**
   * Compact HTML for one paste chip (compose or transcript).
   * @param {object} chip
   * @param {{ expanded?: boolean, editable?: boolean, escHtml?: function }} [opts]
   * @returns {string}
   */
  function renderPasteChipHtml(chip, opts) {
    opts = opts || {};
    var esc = typeof opts.escHtml === "function" ? opts.escHtml : defaultEscHtml;
    var expanded = !!opts.expanded;
    var editable = !!opts.editable;
    var id = chip && chip.id != null ? String(chip.id) : "";
    var label = chipMetaLabel(chip);
    var preview = chip && chip.preview != null ? String(chip.preview) : "";
    var full = chip && chip.text != null ? String(chip.text) : "";
    var bodyInner = editable
      ? '<textarea class="copilot-paste-chip-edit" rows="6" aria-label="Edit pasted content">' +
        esc(full) +
        "</textarea>"
      : '<pre class="copilot-paste-chip-full">' + esc(full) + "</pre>";
    return (
      '<div class="copilot-paste-chip' +
      (expanded ? " is-expanded" : "") +
      '" data-chip-id="' +
      esc(id) +
      '" data-expanded="' +
      (expanded ? "true" : "false") +
      '">' +
      '<button type="button" class="copilot-paste-chip-toggle" aria-expanded="' +
      (expanded ? "true" : "false") +
      '">' +
      '<span class="copilot-paste-chip-label">' +
      esc(label) +
      "</span>" +
      (preview
        ? '<span class="copilot-paste-chip-preview">' + esc(preview) + "</span>"
        : "") +
      "</button>" +
      '<div class="copilot-paste-chip-body"' +
      (expanded ? "" : " hidden") +
      ">" +
      bodyInner +
      "</div>" +
      "</div>"
    );
  }

  /**
   * Compact default HTML for a user transcript row with pastes.
   * @param {{ freeText?: string, pastes?: Array, text?: string }} message
   * @param {{ escHtml?: function, expandedIds?: Object }} [opts]
   * @returns {string}
   */
  function renderCompactUserBodyHtml(message, opts) {
    opts = opts || {};
    var esc = typeof opts.escHtml === "function" ? opts.escHtml : defaultEscHtml;
    var expandedIds = opts.expandedIds || {};
    var free =
      message && message.freeText != null
        ? String(message.freeText)
        : "";
    var pastes =
      message && Array.isArray(message.pastes) ? message.pastes : [];
    var parts = [];
    if (free.trim()) {
      parts.push(
        '<div class="copilot-user-free-text">' + esc(free) + "</div>"
      );
    }
    for (var i = 0; i < pastes.length; i++) {
      var chip = pastes[i];
      var exp = !!(chip && chip.id && expandedIds[chip.id]);
      parts.push(renderPasteChipHtml(chip, { expanded: exp, escHtml: esc }));
    }
    if (!parts.length && message && message.text) {
      return esc(String(message.text));
    }
    return parts.join("");
  }

  /**
   * Slim message for localStorage — keeps full paste text for reload compact UI.
   * @param {object} m
   * @returns {object}
   */
  function slimMessageForStorage(m) {
    if (!m || typeof m !== "object") return m;
    var out = {
      role: m.role,
      text: m.text,
      ts: m.ts,
    };
    if (m.freeText != null) out.freeText = m.freeText;
    if (Array.isArray(m.pastes) && m.pastes.length) {
      out.pastes = m.pastes.map(function (p) {
        if (!p || typeof p !== "object") return p;
        return {
          id: p.id,
          text: p.text,
          lines: p.lines,
          chars: p.chars,
          preview: p.preview,
        };
      });
    }
    return out;
  }

  return {
    PASTE_CHIP_MIN_CHARS: PASTE_CHIP_MIN_CHARS,
    PASTE_CHIP_MIN_LINES: PASTE_CHIP_MIN_LINES,
    countLines: countLines,
    shouldBecomePasteChip: shouldBecomePasteChip,
    createPasteChip: createPasteChip,
    chipMetaLabel: chipMetaLabel,
    findChipByExactText: findChipByExactText,
    applyPasteToCompose: applyPasteToCompose,
    assembleComposeMessage: assembleComposeMessage,
    shouldRenderUserMessageCompact: shouldRenderUserMessageCompact,
    renderPasteChipHtml: renderPasteChipHtml,
    renderCompactUserBodyHtml: renderCompactUserBodyHtml,
    slimMessageForStorage: slimMessageForStorage,
  };
});
