/**
 * Pure scroll / hierarchy helpers for the course copilot dock (#25).
 * Dual export: browser global `SFTCourseCopilotScroll` and Node `module.exports`.
 *
 * Scroll modes (used by sft-course-copilot.js):
 * - follow: auto-scroll policy active; keep the current turn in view.
 * - history: learner intentionally scrolled up; no forced auto-scroll.
 * - pin-on-send: on a new user turn, re-enter follow and align that bubble
 *   near the top of the scrollport (ChatGPT-style), with a bottom spacer
 *   so there is room to pin while the assistant reply grows.
 * - Jump to latest: restores follow and returns to the live edge / pin.
 * Intent is detected from wheel/touch/keyboard, not from layout-only
 * scroll events caused by content growth or programmatic scrollTop writes.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SFTCourseCopilotScroll = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var NEAR_EDGE_PX = 48;
  var SPACER_PAD_PX = 12;

  /**
   * Index where the current turn begins: last user message, or last message
   * if there is no user turn. From this index inclusive → live; before → stale.
   */
  function liveStartIndex(msgs) {
    if (!msgs || !msgs.length) return 0;
    for (var i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i] && msgs[i].role === "user") return i;
    }
    return msgs.length - 1;
  }

  /** CSS hierarchy class for message at index: live vs stale. */
  function hierarchyClassForIndex(msgs, index) {
    if (!msgs || !msgs.length) return "copilot-msg--live";
    return index >= liveStartIndex(msgs) ? "copilot-msg--live" : "copilot-msg--stale";
  }

  /**
   * Bottom spacer so a pinned user bubble can sit near the top of the scrollport.
   * viewportH / pinH are CSS pixels (clientHeight / offsetHeight).
   */
  function computePinSpacerHeight(viewportH, pinH, pad) {
    if (pad == null) pad = SPACER_PAD_PX;
    viewportH = Number(viewportH) || 0;
    pinH = Number(pinH) || 0;
    return Math.max(0, Math.floor(viewportH - pinH - pad));
  }

  /** True when scroll position is within threshold of the live (bottom) edge. */
  function isNearLiveEdgeMetrics(scrollTop, scrollHeight, clientHeight, threshold) {
    if (threshold == null) threshold = NEAR_EDGE_PX;
    scrollTop = Number(scrollTop) || 0;
    scrollHeight = Number(scrollHeight) || 0;
    clientHeight = Number(clientHeight) || 0;
    return scrollHeight - scrollTop - clientHeight <= threshold;
  }

  /**
   * After intentional user scroll: leave follow when not near live edge;
   * re-enter follow when the learner scrolls back to the live edge.
   * Does not change mode when there was no user intent (programmatic scroll).
   */
  function followModeAfterScrollIntent(currentFollow, hadIntent, nearEdge) {
    if (!hadIntent) return !!currentFollow;
    return !!nearEdge;
  }

  function normalizeRole(role) {
    if (role === "assistant") return "assistant";
    if (role === "system") return "system";
    return "user";
  }

  function roleLabel(role) {
    if (role === "assistant") return "Copilot";
    if (role === "system") return "System";
    return "You";
  }

  /**
   * Build one bubble outer class list (role + live/stale). Used by render and checks.
   */
  function bubbleClassList(msgs, index, role) {
    role = normalizeRole(role);
    return (
      "copilot-msg copilot-msg--" +
      role +
      " " +
      hierarchyClassForIndex(msgs, index)
    );
  }

  /**
   * Build full transcript HTML using a bodyHtml(m) callback (shipped paint path).
   * Does not include the bottom spacer (DOM-measured height).
   */
  function buildTranscriptHtml(msgs, bodyHtmlFn, escHtmlFn) {
    var esc =
      typeof escHtmlFn === "function"
        ? escHtmlFn
        : function (s) {
            return String(s)
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#39;");
          };
    var bodyFn =
      typeof bodyHtmlFn === "function"
        ? bodyHtmlFn
        : function (m) {
            return esc(m && m.text != null ? m.text : "");
          };

    if (!msgs || !msgs.length) {
      return '<div class="copilot-empty">Ask where you are, what to try next, or how a concept maps to the lab scripts. No quiz spoilers.</div>';
    }

    return msgs
      .map(function (m, index) {
        var role = normalizeRole(m.role);
        var label = roleLabel(role);
        var compact =
          role === "user" &&
          m &&
          ((Array.isArray(m.pastes) && m.pastes.length) ||
            (m.freeText != null && String(m.freeText) !== String(m.text || "")));
        var bodyClass =
          "copilot-msg-body" +
          (role === "assistant"
            ? " copilot-md"
            : compact
              ? " copilot-msg-body--user-compact"
              : " copilot-msg-body--plain");
        // Prefer explicit compact only when caller path already decided via body;
        // class still must include copilot-msg-body for overflow chain.
        if (role === "user" && !compact) {
          bodyClass = "copilot-msg-body copilot-msg-body--plain";
        }
        return (
          '<div class="' +
          bubbleClassList(msgs, index, role) +
          '" data-msg-index="' +
          index +
          '">' +
          '<div class="copilot-msg-role">' +
          esc(label) +
          "</div>" +
          '<div class="' +
          bodyClass +
          '">' +
          bodyFn(m) +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  return {
    NEAR_EDGE_PX: NEAR_EDGE_PX,
    SPACER_PAD_PX: SPACER_PAD_PX,
    liveStartIndex: liveStartIndex,
    hierarchyClassForIndex: hierarchyClassForIndex,
    computePinSpacerHeight: computePinSpacerHeight,
    isNearLiveEdgeMetrics: isNearLiveEdgeMetrics,
    followModeAfterScrollIntent: followModeAfterScrollIntent,
    normalizeRole: normalizeRole,
    roleLabel: roleLabel,
    bubbleClassList: bubbleClassList,
    buildTranscriptHtml: buildTranscriptHtml,
  };
});
