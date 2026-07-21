/**
 * Course copilot dock plugin — same-origin client for the local gate.
 * Dual export: browser global `SFTCourseCopilot` and Node `module.exports`
 * (pure scroll helpers + markup builders are testable without a live gate).
 * Long pastes become Grok-style chips via sft-course-paste-chips.js (issue #24).
 * Open via gate: http://127.0.0.1:8787/sft-interactive-playbook.html
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (typeof root !== "undefined") {
    root.SFTCourseCopilot = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var UI_KEY = "sft-course-copilot-ui-v1";
  var COLLAPSED_KEY = "sft-course-copilot-collapsed-v1";
  var HEALTH_MS = 7000;
  var GATE_URL_HINT =
    "Start the gate, then open: http://127.0.0.1:8787/sft-interactive-playbook.html";
  var NEAR_EDGE_PX = 48;
  var SPACER_PAD_PX = 12;
  var SCROLL_INTENT_MS = 450;

  /*
   * Scroll modes for the copilot transcript (.copilot-messages):
   * - follow: auto-scroll policy active; keep the current turn in view.
   * - history: learner intentionally scrolled up; no forced auto-scroll.
   * - pin-on-send: on a new user turn, re-enter follow and align that bubble
   *   near the top of the scrollport (ChatGPT-style), with a bottom spacer
   *   so there is room to pin while the assistant reply grows.
   * - Jump to latest: restores follow and returns to the live edge / pin.
   * Intent is detected from wheel/touch/keyboard, not from layout-only
   * scroll events caused by content growth or our own scrollTop writes.
   */

  var els = null;
  var player = null;
  var messages = [];
  var status = "offline"; // online | offline | busy | error
  var inFlight = false;
  var healthTimer = null;
  var workTimer = null;
  var workStartedAt = 0;
  var unsub = null;
  var lastError = null;
  /** @type {boolean} when true, auto pin/follow; when false, history mode */
  var followMode = true;
  /** pin last user after next render (send / jump / explicit) */
  var pendingPinUser = false;
  /** timestamp until which scroll events count as user intent */
  var scrollIntentUntil = 0;
  /** @type {Array<object>} Grok-style compose paste chips (issue #24) */
  var composeChips = [];
  /** chipId -> true when expanded in transcript */
  var transcriptExpanded = {};
  /** chipId -> true when expanded in composer */
  var composeExpanded = {};

  // ---------------------------------------------------------------------------
  // Pure helpers (Node + browser) — drive checks without a live gate
  // ---------------------------------------------------------------------------

  /**
   * Index where the "current turn" begins: last user message, or last message
   * if there is no user turn. Everything from this index is live; before is stale.
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

  /**
   * True when scroll position is within threshold of the live (bottom) edge.
   */
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

  function isSupportedOrigin() {
    if (typeof location === "undefined") return false;
    return location.protocol === "http:" || location.protocol === "https:";
  }

  function agui() {
    return (
      (typeof window !== "undefined" && window.SFTCourseAgui) ||
      (typeof globalThis !== "undefined" && globalThis.SFTCourseAgui) ||
      null
    );
  }

  function pasteChips() {
    return (
      (typeof window !== "undefined" && window.SFTCoursePasteChips) ||
      (typeof globalThis !== "undefined" && globalThis.SFTCoursePasteChips) ||
      null
    );
  }

  function esc(s) {
    var A = agui();
    if (A && typeof A.escHtml === "function") return A.escHtml(s);
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
   * Event-driven body HTML for a transcript row.
   * Prefer AG-UI events when present; otherwise synthesize events from text
   * so the paint path is never a single opaque string assignment.
   */
  function bodyHtmlForMessage(m) {
    var A = agui();
    var P = pasteChips();
    var role = m.role || "user";
    var text = m.text != null ? String(m.text) : "";

    if (role === "user" && P && typeof P.shouldRenderUserMessageCompact === "function") {
      if (P.shouldRenderUserMessageCompact(m)) {
        return P.renderCompactUserBodyHtml(m, {
          escHtml: esc,
          expandedIds: transcriptExpanded,
        });
      }
    }

    if (A && role === "assistant") {
      var events =
        Array.isArray(m.events) && m.events.length
          ? m.events
          : typeof A.textToAguiEvents === "function"
            ? A.textToAguiEvents(text)
            : null;
      if (events && typeof A.renderAssistantFromEvents === "function") {
        return A.renderAssistantFromEvents(events).html;
      }
      if (typeof A.markdownToHtml === "function") {
        return A.markdownToHtml(text);
      }
    }

    if (A && typeof A.renderMessageBodyHtml === "function") {
      return A.renderMessageBodyHtml(role, text);
    }
    return esc(text);
  }

  /**
   * Build full transcript HTML for msgs (shipped markup shape used by renderMessages).
   * Pure w.r.t. DOM: returns a string with live/stale hierarchy classes.
   * Does not include the bottom spacer (DOM-only height).
   */
  function buildTranscriptHtml(msgs) {
    if (!msgs || !msgs.length) {
      return '<div class="copilot-empty">Ask where you are, what to try next, or how a concept maps to the lab scripts. No quiz spoilers.</div>';
    }
    var P = pasteChips();
    return msgs
      .map(function (m, index) {
        var role = normalizeRole(m.role);
        var label = roleLabel(role);
        var compact =
          role === "user" &&
          P &&
          typeof P.shouldRenderUserMessageCompact === "function" &&
          P.shouldRenderUserMessageCompact(m);
        var bodyClass =
          "copilot-msg-body" +
          (role === "assistant"
            ? " copilot-md"
            : compact
              ? " copilot-msg-body--user-compact"
              : " copilot-msg-body--plain");
        var hierarchy = hierarchyClassForIndex(msgs, index);
        return (
          '<div class="copilot-msg copilot-msg--' +
          role +
          " " +
          hierarchy +
          '" data-msg-index="' +
          index +
          '">' +
          '<div class="copilot-msg-role">' +
          esc(label) +
          "</div>" +
          '<div class="' +
          bodyClass +
          '">' +
          bodyHtmlForMessage(m) +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function loadMessages() {
    try {
      var raw = localStorage.getItem(UI_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveMessages() {
    try {
      // Persist role/text (+ paste chips when present); AG-UI events are
      // re-synthesized on render so localStorage does not double-store deltas.
      var P = pasteChips();
      var slim = messages.map(function (m) {
        if (P && typeof P.slimMessageForStorage === "function") {
          return P.slimMessageForStorage(m);
        }
        return { role: m.role, text: m.text, ts: m.ts };
      });
      localStorage.setItem(UI_KEY, JSON.stringify(slim));
    } catch (_) {}
  }


  function loadCollapsed() {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function saveCollapsed(v) {
    try {
      localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
    } catch (_) {}
  }

  function defaultCollapsedForViewport() {
    return window.matchMedia && window.matchMedia("(max-width: 1050px)").matches;
  }

  function ensureDock() {
    var existing = document.getElementById("copilotDock");
    if (existing) return existing;

    var app = document.querySelector(".app");
    var aside = document.createElement("aside");
    aside.className = "copilot-dock";
    aside.id = "copilotDock";
    aside.setAttribute("aria-label", "Course copilot");
    aside.innerHTML =
      '<div class="copilot-rail" title="Open course copilot">' +
      '<button type="button" class="copilot-expand-btn" id="copilotExpand" aria-label="Expand copilot">✦</button>' +
      "</div>" +
      '<div class="copilot-panel">' +
      '  <header class="copilot-header">' +
      '    <div class="copilot-title-row">' +
      '      <strong class="copilot-title">Course copilot</strong>' +
      '      <span class="copilot-status" id="copilotStatus" data-status="offline">offline</span>' +
      '      <button type="button" class="copilot-icon-btn" id="copilotCollapse" aria-label="Collapse copilot" title="Collapse">›</button>' +
      "    </div>" +
      '    <div class="copilot-location" id="copilotLocation">On: —</div>' +
      "  </header>" +
      '  <div class="copilot-messages-shell">' +
      '    <div class="copilot-messages" id="copilotMessages" role="log" aria-live="polite" tabindex="0"></div>' +
      '    <button type="button" class="copilot-jump-latest" id="copilotJumpLatest" hidden aria-label="Jump to latest">Jump to latest</button>' +
      "  </div>" +
      '  <div class="copilot-working" id="copilotWorking" hidden>Working…</div>' +
      '  <div class="copilot-offline-help" id="copilotOfflineHelp" hidden></div>' +
      '  <footer class="copilot-compose">' +
      '    <div class="copilot-compose-chips" id="copilotComposeChips" hidden></div>' +
      '    <textarea id="copilotInput" class="copilot-input" rows="2" placeholder="Ask about this lesson…" aria-label="Message to copilot"></textarea>' +
      '    <div class="copilot-actions">' +
      '      <button type="button" class="btn ghost small" id="copilotClear">Clear session</button>' +
      '      <button type="button" class="btn small" id="copilotSend">Send</button>' +
      "    </div>" +
      "  </footer>" +
      "</div>";

    if (app) app.appendChild(aside);
    else document.body.appendChild(aside);
    return aside;
  }

  function cacheEls(root) {
    els = {
      root: root,
      status: root.querySelector("#copilotStatus"),
      location: root.querySelector("#copilotLocation"),
      messages: root.querySelector("#copilotMessages"),
      jump: root.querySelector("#copilotJumpLatest"),
      working: root.querySelector("#copilotWorking"),
      offlineHelp: root.querySelector("#copilotOfflineHelp"),
      composeChips: root.querySelector("#copilotComposeChips"),
      input: root.querySelector("#copilotInput"),
      send: root.querySelector("#copilotSend"),
      clear: root.querySelector("#copilotClear"),
      collapse: root.querySelector("#copilotCollapse"),
      expand: root.querySelector("#copilotExpand"),
    };
  }

  function renderComposeChips() {
    if (!els || !els.composeChips) return;
    var P = pasteChips();
    if (!composeChips.length || !P) {
      els.composeChips.hidden = true;
      els.composeChips.innerHTML = "";
      return;
    }
    els.composeChips.hidden = false;
    els.composeChips.innerHTML = composeChips
      .map(function (chip) {
        return P.renderPasteChipHtml(chip, {
          expanded: !!composeExpanded[chip.id],
          editable: true,
          escHtml: esc,
        });
      })
      .join("");
  }

  function clearCompose() {
    composeChips = [];
    composeExpanded = {};
    if (els && els.input) els.input.value = "";
    renderComposeChips();
  }

  function hasComposeContent() {
    var free = els && els.input ? String(els.input.value || "").trim() : "";
    return !!(free || composeChips.length);
  }

  /** Assemble free-text + full paste bodies for POST /chat (shipped entry). */
  function buildOutboundMessage() {
    var free = els && els.input ? String(els.input.value || "") : "";
    var P = pasteChips();
    if (P && typeof P.assembleComposeMessage === "function") {
      return {
        freeText: free.trim(),
        pastes: composeChips.slice(),
        message: P.assembleComposeMessage(free, composeChips),
      };
    }
    return {
      freeText: free.trim(),
      pastes: composeChips.slice(),
      message: free.trim(),
    };
  }

  function setCollapsed(collapsed) {
    var app = document.querySelector(".app");
    if (els && els.root) {
      els.root.classList.toggle("is-collapsed", collapsed);
    }
    if (app) {
      app.classList.toggle("copilot-collapsed", collapsed);
      app.classList.toggle("has-copilot", true);
    }
    saveCollapsed(collapsed);
  }

  function setStatus(next) {
    status = next;
    if (!els || !els.status) return;
    els.status.dataset.status = next;
    els.status.textContent = next;
  }

  function updateLocation(ctx) {
    if (!els || !els.location) return;
    if (!ctx) {
      els.location.textContent = "On: —";
      return;
    }
    if (ctx.view === "home") {
      els.location.textContent = "On: Home";
      return;
    }
    var module = ctx.module || (ctx.view === "capstone" ? "Final Project" : "—");
    var title =
      ctx.lessonTitle ||
      (ctx.view === "capstone" ? "Capstone report builder" : "—");
    els.location.textContent = "On: " + module + " · " + title;
  }

  // ---------------------------------------------------------------------------
  // Scroll policy (DOM)
  // ---------------------------------------------------------------------------

  function markUserScrollIntent() {
    scrollIntentUntil = Date.now() + SCROLL_INTENT_MS;
  }

  function hadUserScrollIntent() {
    return Date.now() < scrollIntentUntil;
  }

  function setFollowMode(on) {
    followMode = !!on;
    updateJumpControl();
  }

  function updateJumpControl() {
    if (!els || !els.jump) return;
    var show = !followMode && messages.length > 0;
    els.jump.hidden = !show;
  }

  function isNearLiveEdgeDom() {
    if (!els || !els.messages) return true;
    var c = els.messages;
    return isNearLiveEdgeMetrics(c.scrollTop, c.scrollHeight, c.clientHeight, NEAR_EDGE_PX);
  }

  function findLastUserBubble() {
    if (!els || !els.messages) return null;
    var nodes = els.messages.querySelectorAll(".copilot-msg--user");
    if (!nodes.length) return null;
    return nodes[nodes.length - 1];
  }

  function offsetTopWithin(el, container) {
    // Distance from container content top to element top.
    var top = 0;
    var node = el;
    while (node && node !== container) {
      top += node.offsetTop;
      node = node.offsetParent;
      // If offsetParent chain leaves the container, fall back to rect math.
      if (node && !container.contains(node) && node !== container) {
        var cRect = container.getBoundingClientRect();
        var eRect = el.getBoundingClientRect();
        return eRect.top - cRect.top + container.scrollTop;
      }
    }
    if (node === container) return top;
    var cr = container.getBoundingClientRect();
    var er = el.getBoundingClientRect();
    return er.top - cr.top + container.scrollTop;
  }

  function ensureBottomSpacer(pinEl) {
    if (!els || !els.messages) return null;
    var container = els.messages;
    var spacer = container.querySelector(".copilot-scroll-spacer");
    if (!spacer) {
      spacer = document.createElement("div");
      spacer.className = "copilot-scroll-spacer";
      spacer.setAttribute("aria-hidden", "true");
      container.appendChild(spacer);
    }
    if (pinEl && followMode) {
      var h = computePinSpacerHeight(container.clientHeight, pinEl.offsetHeight, SPACER_PAD_PX);
      spacer.style.height = h + "px";
    } else {
      spacer.style.height = "0px";
    }
    return spacer;
  }

  function pinElementNearTop(el) {
    if (!els || !els.messages || !el) return;
    var container = els.messages;
    var target = Math.max(0, offsetTopWithin(el, container) - 4);
    container.scrollTop = target;
  }

  function scrollToLiveEdge() {
    if (!els || !els.messages) return;
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  /**
   * Apply follow scroll policy after a structural render.
   * pinUser: align last user bubble near top (pin-on-send / jump / live follow).
   */
  function applyScrollPolicy(opts) {
    opts = opts || {};
    if (!els || !els.messages) return;
    if (!followMode) {
      // History mode: leave scroll position alone; ensure spacer does not yank.
      var staleSpacer = els.messages.querySelector(".copilot-scroll-spacer");
      if (staleSpacer) staleSpacer.style.height = "0px";
      updateJumpControl();
      return;
    }

    var lastUser = findLastUserBubble();
    if (opts.pinUser && lastUser) {
      ensureBottomSpacer(lastUser);
      pinElementNearTop(lastUser);
    } else if (lastUser) {
      ensureBottomSpacer(lastUser);
      pinElementNearTop(lastUser);
    } else {
      ensureBottomSpacer(null);
      scrollToLiveEdge();
    }
    updateJumpControl();
  }

  function jumpToLatest() {
    setFollowMode(true);
    pendingPinUser = true;
    applyScrollPolicy({ pinUser: true });
    pendingPinUser = false;
  }

  function onMessagesScroll() {
    if (!els || !els.messages) return;
    var intent = hadUserScrollIntent();
    var near = isNearLiveEdgeDom();
    var next = followModeAfterScrollIntent(followMode, intent, near);
    if (next !== followMode) {
      followMode = next;
    }
    updateJumpControl();
  }

  function renderMessages() {
    if (!els || !els.messages) return;
    els.messages.innerHTML = buildTranscriptHtml(messages);

    // Structural spacer for pin-on-send room (height applied in applyScrollPolicy).
    if (messages.length) {
      var spacer = document.createElement("div");
      spacer.className = "copilot-scroll-spacer";
      spacer.setAttribute("aria-hidden", "true");
      spacer.style.height = "0px";
      els.messages.appendChild(spacer);
    }

    if (followMode) {
      var pin = pendingPinUser || true;
      applyScrollPolicy({ pinUser: pin });
      pendingPinUser = false;
    } else {
      updateJumpControl();
    }
  }

  function showOfflineHelp(show) {
    if (!els || !els.offlineHelp) return;
    if (show) {
      els.offlineHelp.hidden = false;
      els.offlineHelp.textContent = GATE_URL_HINT;
    } else {
      els.offlineHelp.hidden = true;
      els.offlineHelp.textContent = "";
    }
  }

  function setComposeEnabled(enabled) {
    if (!els) return;
    var allow = enabled && isSupportedOrigin() && !inFlight && status !== "offline";
    // Allow typing offline so users can draft; only gate Send.
    els.input.disabled = false;
    els.send.disabled = !allow || !hasComposeContent();
    els.clear.disabled = inFlight;
  }

  function stopWorkTimer() {
    if (workTimer) {
      clearInterval(workTimer);
      workTimer = null;
    }
    if (els && els.working) {
      els.working.hidden = true;
      els.working.textContent = "Working…";
    }
  }

  function startWorkTimer() {
    workStartedAt = Date.now();
    if (els && els.working) {
      els.working.hidden = false;
      els.working.textContent = "Working… (0s)";
    }
    if (workTimer) clearInterval(workTimer);
    workTimer = setInterval(function () {
      var s = Math.floor((Date.now() - workStartedAt) / 1000);
      if (els && els.working) {
        els.working.textContent = "Working… (" + s + "s)";
      }
    }, 1000);
  }

  function pushMessage(role, text, events, extra) {
    var entry = {
      role: role,
      text: String(text || ""),
      ts: Date.now(),
    };
    if (extra && typeof extra === "object") {
      if (extra.freeText != null) entry.freeText = String(extra.freeText);
      if (Array.isArray(extra.pastes) && extra.pastes.length) {
        entry.pastes = extra.pastes;
      }
    }
    if (Array.isArray(events) && events.length) {
      // Keep a compact event list for re-render; drop large rawEvent blobs if any.
      entry.events = events.map(function (ev) {
        if (!ev || typeof ev !== "object") return ev;
        var copy = {};
        for (var k in ev) {
          if (Object.prototype.hasOwnProperty.call(ev, k) && k !== "rawEvent") {
            copy[k] = ev[k];
          }
        }
        return copy;
      });
    }
    messages.push(entry);
    // Cap transcript growth in localStorage
    if (messages.length > 200) messages = messages.slice(-200);
    saveMessages();

    // pin-on-send: new user turn re-enters follow and pins that bubble.
    if (role === "user") {
      setFollowMode(true);
      pendingPinUser = true;
    }
    renderMessages();
  }

  function clearTranscript() {
    messages = [];
    transcriptExpanded = {};
    saveMessages();
    setFollowMode(true);
    pendingPinUser = false;
    renderMessages();
  }

  async function pollHealth() {
    if (!isSupportedOrigin()) {
      setStatus("offline");
      showOfflineHelp(true);
      setComposeEnabled(false);
      return;
    }
    try {
      var res = await fetch("/health", { method: "GET", cache: "no-store" });
      if (!res.ok) {
        setStatus("error");
        showOfflineHelp(true);
        setComposeEnabled(false);
        return;
      }
      var data = await res.json();
      if (data && data.binary === false) {
        setStatus("error");
        showOfflineHelp(true);
        if (els && els.offlineHelp) {
          els.offlineHelp.hidden = false;
          els.offlineHelp.textContent =
            "Grok binary not found on the gate host. Install/authenticate Grok, or set GROK_BIN.";
        }
        setComposeEnabled(false);
        return;
      }
      showOfflineHelp(false);
      if (inFlight || (data && data.busy)) {
        setStatus("busy");
      } else if (data && data.ok) {
        setStatus("online");
        lastError = null;
      } else {
        setStatus("error");
      }
      setComposeEnabled(true);
    } catch (_) {
      setStatus(inFlight ? "busy" : "offline");
      showOfflineHelp(true);
      setComposeEnabled(false);
    }
  }

  async function sendMessage() {
    if (!els || inFlight) return;
    if (!isSupportedOrigin()) {
      setStatus("offline");
      showOfflineHelp(true);

      showOfflineHelp(true);
      return;
    }
    var outbound = buildOutboundMessage();
    var text = String(outbound.message || "").trim();
    if (!text) return;

    var ctx = null;
    try {
      ctx = player && typeof player.getContext === "function" ? player.getContext() : null;
    } catch (e) {
      console.warn(e);
    }

    pushMessage("user", text, null, {
      freeText: outbound.freeText,
      pastes: outbound.pastes,
    });
    clearCompose();
    inFlight = true;
    setStatus("busy");
    startWorkTimer();
    setComposeEnabled(false);

    try {
      var res = await fetch("/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, context: ctx || {} }),
      });

      if (res.status === 409) {
        pushMessage(
          "system",
          "Copilot is busy with another request. Wait a moment, then try again."
        );
        setStatus("busy");
        return;
      }

      var data = null;
      try {
        data = await res.json();
      } catch (_) {
        data = null;
      }

      if (!res.ok || !data || data.ok === false) {
        var err =
          (data && data.error) ||
          (res.status ? "HTTP " + res.status : "request failed");
        lastError = err;
        var errEvents =
          data && Array.isArray(data.events) && data.events.length
            ? data.events
            : null;
        pushMessage("assistant", "Error: " + err, errEvents);
        setStatus("error");
        return;
      }

      if (data.reset) {
        pushMessage(
          "system",
          "Session was invalid and was recreated. Continuing with a fresh Grok session."
        );
      }

      var events =
        Array.isArray(data.events) && data.events.length ? data.events : null;
      var reply = "";
      if (events && agui() && typeof agui().primaryTextFromEvents === "function") {
        reply = agui().primaryTextFromEvents(events);
      }
      if (!reply || !String(reply).trim()) {
        reply =
          data.text != null && String(data.text).trim()
            ? String(data.text)
            : "(empty response)";
      }
      // Always event-driven: synthesize if gate omitted events (older gate / offline path).
      if (!events && agui() && typeof agui().textToAguiEvents === "function") {
        events = agui().textToAguiEvents(reply);
      }
      pushMessage("assistant", reply, events);
      setStatus("online");
    } catch (e) {
      lastError = e && e.message ? e.message : String(e);
      pushMessage("assistant", "Error: " + lastError + ". " + GATE_URL_HINT);
      setStatus("error");
      showOfflineHelp(true);
    } finally {
      inFlight = false;
      stopWorkTimer();
      setComposeEnabled(true);
      // Refresh health chip after send
      pollHealth();
    }
  }

  async function clearSession() {
    if (inFlight) return;
    clearTranscript();
    clearCompose();
    if (isSupportedOrigin()) {
      try {
        await fetch("/session/reset", { method: "POST" });
      } catch (_) {}
    }
    pushMessage("system", "Session cleared.");
    pollHealth();
  }


  function handleComposerPaste(ev) {
    var P = pasteChips();
    if (!P || typeof P.applyPasteToCompose !== "function") return;
    var cd = ev.clipboardData || (window.clipboardData || null);
    if (!cd || typeof cd.getData !== "function") return;
    var pasted = "";
    try {
      pasted = cd.getData("text/plain") || cd.getData("text") || "";
    } catch (_) {
      pasted = "";
    }
    if (!pasted) return;
    if (!P.shouldBecomePasteChip(pasted)) {
      return;
    }
    ev.preventDefault();
    var free = els && els.input ? String(els.input.value || "") : "";
    var result = P.applyPasteToCompose(free, composeChips, pasted);
    composeChips = result.chips || [];
    if (result.action === "expand" && result.expandedChipId) {
      composeExpanded[result.expandedChipId] = true;
    } else if (result.action === "chip" && result.chip && result.chip.id) {
      composeExpanded[result.chip.id] = false;
    }
    if (els && els.input && result.freeText != null) {
      els.input.value = result.freeText;
    }
    renderComposeChips();
    setComposeEnabled(true);
  }

  function onComposeChipsClick(ev) {
    var toggle = ev.target.closest && ev.target.closest(".copilot-paste-chip-toggle");
    if (!toggle || !els.composeChips || !els.composeChips.contains(toggle)) return;
    var chipEl = toggle.closest(".copilot-paste-chip");
    if (!chipEl) return;
    var id = chipEl.getAttribute("data-chip-id");
    if (!id) return;
    composeExpanded[id] = !composeExpanded[id];
    renderComposeChips();
  }

  function onComposeChipsInput(ev) {
    var ta = ev.target;
    if (!ta || !ta.classList || !ta.classList.contains("copilot-paste-chip-edit")) {
      return;
    }
    var chipEl = ta.closest(".copilot-paste-chip");
    if (!chipEl) return;
    var id = chipEl.getAttribute("data-chip-id");
    var P = pasteChips();
    for (var i = 0; i < composeChips.length; i++) {
      if (composeChips[i] && composeChips[i].id === id) {
        var nextText = String(ta.value || "");
        if (P && typeof P.createPasteChip === "function") {
          composeChips[i] = P.createPasteChip(nextText, { id: id });
        } else {
          composeChips[i].text = nextText;
        }
        break;
      }
    }
    setComposeEnabled(true);
  }

  function onTranscriptChipClick(ev) {
    var toggle = ev.target.closest && ev.target.closest(".copilot-paste-chip-toggle");
    if (!toggle || !els.messages || !els.messages.contains(toggle)) return;
    var chipEl = toggle.closest(".copilot-paste-chip");
    if (!chipEl) return;
    var id = chipEl.getAttribute("data-chip-id");
    if (!id) return;
    transcriptExpanded[id] = !transcriptExpanded[id];
    renderMessages();
  }

  function bindEvents() {
    if (!els) return;
    els.send.addEventListener("click", function () {
      sendMessage();
    });
    els.input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        sendMessage();
      }
    });
    els.input.addEventListener("input", function () {
      setComposeEnabled(true);
    });
    els.input.addEventListener("paste", handleComposerPaste);
    if (els.composeChips) {
      els.composeChips.addEventListener("click", onComposeChipsClick);
      els.composeChips.addEventListener("input", onComposeChipsInput);
    }
    if (els.messages) {
      els.messages.addEventListener("click", onTranscriptChipClick);
    }
    els.clear.addEventListener("click", function () {
      clearSession();
    });
    els.collapse.addEventListener("click", function () {
      setCollapsed(true);
    });
    els.expand.addEventListener("click", function () {
      setCollapsed(false);
    });

    if (els.jump) {
      els.jump.addEventListener("click", function () {
        jumpToLatest();
      });
    }

    if (els.messages) {
      // Real user intent only (not layout-driven scroll from content growth).
      els.messages.addEventListener(
        "wheel",
        function () {
          markUserScrollIntent();
        },
        { passive: true }
      );
      els.messages.addEventListener(
        "touchmove",
        function () {
          markUserScrollIntent();
        },
        { passive: true }
      );
      els.messages.addEventListener("keydown", function (ev) {
        var k = ev.key;
        if (
          k === "ArrowUp" ||
          k === "ArrowDown" ||
          k === "PageUp" ||
          k === "PageDown" ||
          k === "Home" ||
          k === "End" ||
          k === " " ||
          k === "Spacebar"
        ) {
          markUserScrollIntent();
        }
      });
      els.messages.addEventListener("scroll", onMessagesScroll, { passive: true });
    }
  }

  function startHealthPoll() {
    if (healthTimer) clearInterval(healthTimer);
    pollHealth();
    healthTimer = setInterval(pollHealth, HEALTH_MS);
  }

  function init(opts) {
    opts = opts || {};
    player = opts.player || window.SFTCoursePlayer || null;

    var root = ensureDock();
    cacheEls(root);

    var collapsed =
      localStorage.getItem(COLLAPSED_KEY) != null
        ? loadCollapsed()
        : defaultCollapsedForViewport();
    setCollapsed(collapsed);

    messages = loadMessages();
    composeChips = [];
    composeExpanded = {};
    transcriptExpanded = {};
    followMode = true;
    pendingPinUser = true;
    renderComposeChips();
    renderMessages();

    if (!isSupportedOrigin()) {
      setStatus("offline");
      showOfflineHelp(true);
      setComposeEnabled(false);
    } else {
      showOfflineHelp(false);
      startHealthPoll();
    }

    bindEvents();

    if (unsub) {
      try {
        unsub();
      } catch (_) {}
      unsub = null;
    }
    if (player && typeof player.subscribe === "function") {
      unsub = player.subscribe(function (ctx) {
        updateLocation(ctx);
      });
    }
    try {
      if (player && typeof player.getContext === "function") {
        updateLocation(player.getContext());
      }
    } catch (_) {
      updateLocation(null);
    }

    setComposeEnabled(true);
  }

  /**
   * Test/debug hooks: simulate modes without network.
   * Used by scroll-check harness (Node pure path) and optional in-page checks.
   */
  function _testApi() {
    return {
      liveStartIndex: liveStartIndex,
      hierarchyClassForIndex: hierarchyClassForIndex,
      computePinSpacerHeight: computePinSpacerHeight,
      isNearLiveEdgeMetrics: isNearLiveEdgeMetrics,
      followModeAfterScrollIntent: followModeAfterScrollIntent,
      buildTranscriptHtml: buildTranscriptHtml,
      getFollowMode: function () {
        return followMode;
      },
      setFollowMode: setFollowMode,
      jumpToLatest: jumpToLatest,
      markUserScrollIntent: markUserScrollIntent,
      applyScrollPolicy: applyScrollPolicy,
      getMessages: function () {
        return messages.slice();
      },
      setMessagesForTest: function (msgs) {
        messages = Array.isArray(msgs) ? msgs.slice() : [];
      },
      renderMessages: renderMessages,
      pushMessage: pushMessage,
    };
  }

  return {
    init: init,
    isSupportedOrigin: isSupportedOrigin,
    // Pure helpers for automated checks (shipped entry points — not reimplemented in tests)
    liveStartIndex: liveStartIndex,
    hierarchyClassForIndex: hierarchyClassForIndex,
    computePinSpacerHeight: computePinSpacerHeight,
    isNearLiveEdgeMetrics: isNearLiveEdgeMetrics,
    followModeAfterScrollIntent: followModeAfterScrollIntent,
    buildTranscriptHtml: buildTranscriptHtml,
    _test: _testApi,
  };
});