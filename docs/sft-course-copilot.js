/**
 * Course copilot dock plugin — same-origin client for the local gate.
 * Open via gate: http://127.0.0.1:8787/sft-interactive-playbook.html
 */
(function () {
  "use strict";

  var UI_KEY = "sft-course-copilot-ui-v1";
  var COLLAPSED_KEY = "sft-course-copilot-collapsed-v1";
  var HEALTH_MS = 7000;
  var GATE_URL_HINT =
    "Start the gate, then open: http://127.0.0.1:8787/sft-interactive-playbook.html";

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

  function isSupportedOrigin() {
    return location.protocol === "http:" || location.protocol === "https:";
  }

  function agui() {
    return (
      (typeof window !== "undefined" && window.SFTCourseAgui) ||
      (typeof globalThis !== "undefined" && globalThis.SFTCourseAgui) ||
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
    var role = m.role || "user";
    var text = m.text != null ? String(m.text) : "";

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
      // Persist role/text only; AG-UI events are re-synthesized on render so
      // localStorage does not double-store large deltas.
      var slim = messages.map(function (m) {
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
      '  <div class="copilot-messages" id="copilotMessages" role="log" aria-live="polite"></div>' +
      '  <div class="copilot-working" id="copilotWorking" hidden>Working…</div>' +
      '  <div class="copilot-offline-help" id="copilotOfflineHelp" hidden></div>' +
      '  <footer class="copilot-compose">' +
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
      working: root.querySelector("#copilotWorking"),
      offlineHelp: root.querySelector("#copilotOfflineHelp"),
      input: root.querySelector("#copilotInput"),
      send: root.querySelector("#copilotSend"),
      clear: root.querySelector("#copilotClear"),
      collapse: root.querySelector("#copilotCollapse"),
      expand: root.querySelector("#copilotExpand"),
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

  function renderMessages() {
    if (!els || !els.messages) return;
    if (!messages.length) {
      els.messages.innerHTML =
        '<div class="copilot-empty">Ask where you are, what to try next, or how a concept maps to the lab scripts. No quiz spoilers.</div>';
      return;
    }
    els.messages.innerHTML = messages
      .map(function (m) {
        var role =
          m.role === "assistant"
            ? "assistant"
            : m.role === "system"
              ? "system"
              : "user";
        var label =
          role === "assistant" ? "Copilot" : role === "system" ? "System" : "You";
        var bodyClass =
          "copilot-msg-body" +
          (role === "assistant" ? " copilot-md" : " copilot-msg-body--plain");
        return (
          '<div class="copilot-msg copilot-msg--' +
          role +
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
    els.messages.scrollTop = els.messages.scrollHeight;
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
    els.send.disabled = !allow || !String(els.input.value || "").trim();
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

  function pushMessage(role, text, events) {
    var entry = {
      role: role,
      text: String(text || ""),
      ts: Date.now(),
    };
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
    renderMessages();
  }

  function clearTranscript() {
    messages = [];
    saveMessages();
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
      return;
    }
    var text = String(els.input.value || "").trim();
    if (!text) return;

    var ctx = null;
    try {
      ctx = player && typeof player.getContext === "function" ? player.getContext() : null;
    } catch (e) {
      console.warn(e);
    }

    pushMessage("user", text);
    els.input.value = "";
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
    if (isSupportedOrigin()) {
      try {
        await fetch("/session/reset", { method: "POST" });
      } catch (_) {}
    }
    pushMessage("system", "Session cleared.");
    pollHealth();
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
    els.clear.addEventListener("click", function () {
      clearSession();
    });
    els.collapse.addEventListener("click", function () {
      setCollapsed(true);
    });
    els.expand.addEventListener("click", function () {
      setCollapsed(false);
    });
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

  window.SFTCourseCopilot = {
    init: init,
    isSupportedOrigin: isSupportedOrigin,
  };
})();
