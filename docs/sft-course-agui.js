/**
 * AG-UI event mapping + lightweight markdown for the course copilot dock.
 * Dual export: browser global `SFTCourseAgui` and Node `module.exports`.
 *
 * Protocol shapes follow https://docs.ag-ui.com/concepts/events
 * (TEXT_MESSAGE_* lifecycle; optional TOOL_CALL_*; RUN_* lifecycle).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SFTCourseAgui = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var EventType = {
    RUN_STARTED: "RUN_STARTED",
    RUN_FINISHED: "RUN_FINISHED",
    RUN_ERROR: "RUN_ERROR",
    TEXT_MESSAGE_START: "TEXT_MESSAGE_START",
    TEXT_MESSAGE_CONTENT: "TEXT_MESSAGE_CONTENT",
    TEXT_MESSAGE_END: "TEXT_MESSAGE_END",
    TOOL_CALL_START: "TOOL_CALL_START",
    TOOL_CALL_ARGS: "TOOL_CALL_ARGS",
    TOOL_CALL_END: "TOOL_CALL_END",
    TOOL_CALL_RESULT: "TOOL_CALL_RESULT",
  };

  function nowTs() {
    return Date.now();
  }

  function newId(prefix) {
    prefix = prefix || "id";
    return (
      prefix +
      "-" +
      nowTs().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 10)
    );
  }

  /**
   * Map a complete assistant text blob into AG-UI events.
   * Non-streaming gate path: Start → single Content → End inside a Run.
   *
   * @param {string} text
   * @param {{ threadId?: string, runId?: string, messageId?: string, role?: string, timestamp?: number }} [opts]
   * @returns {Array<object>}
   */
  function textToAguiEvents(text, opts) {
    opts = opts || {};
    var body = text == null ? "" : String(text);
    var threadId = opts.threadId || "course-copilot";
    var runId = opts.runId || newId("run");
    var messageId = opts.messageId || newId("msg");
    var role = opts.role || "assistant";
    var ts = opts.timestamp != null ? Number(opts.timestamp) : nowTs();

    var events = [
      {
        type: EventType.RUN_STARTED,
        threadId: threadId,
        runId: runId,
        timestamp: ts,
      },
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: messageId,
        role: role,
        timestamp: ts,
      },
    ];

    if (body.length > 0) {
      events.push({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: messageId,
        delta: body,
        timestamp: ts,
      });
    }

    events.push(
      {
        type: EventType.TEXT_MESSAGE_END,
        messageId: messageId,
        timestamp: ts,
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: threadId,
        runId: runId,
        timestamp: ts,
      }
    );

    return events;
  }

  /**
   * Map a gate error into a minimal AG-UI run that ends in RUN_ERROR.
   * Optionally includes an assistant text message with the error string.
   */
  function errorToAguiEvents(message, opts) {
    opts = opts || {};
    var errText = message == null ? "error" : String(message);
    var threadId = opts.threadId || "course-copilot";
    var runId = opts.runId || newId("run");
    var messageId = opts.messageId || newId("msg");
    var ts = opts.timestamp != null ? Number(opts.timestamp) : nowTs();
    var includeMessage = opts.includeMessage !== false;

    var events = [
      {
        type: EventType.RUN_STARTED,
        threadId: threadId,
        runId: runId,
        timestamp: ts,
      },
    ];

    if (includeMessage) {
      events.push(
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: messageId,
          role: "assistant",
          timestamp: ts,
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: messageId,
          delta: errText,
          timestamp: ts,
        },
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: messageId,
          timestamp: ts,
        }
      );
    }

    events.push({
      type: EventType.RUN_ERROR,
      message: errText,
      code: opts.code || undefined,
      timestamp: ts,
    });

    return events;
  }

  /**
   * Fold AG-UI events into messages + run status.
   * @returns {{ messages: Array<{id:string,role:string,text:string}>, run: {threadId:*,runId:*,status:string}, tools: Array, error: string|null }}
   */
  function foldAguiEvents(events) {
    var list = Array.isArray(events) ? events : [];
    var byId = Object.create(null);
    var order = [];
    var tools = [];
    var toolById = Object.create(null);
    var run = { threadId: null, runId: null, status: "idle" };
    var error = null;

    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      if (!ev || typeof ev !== "object") continue;
      var type = ev.type;

      if (type === EventType.RUN_STARTED) {
        run.threadId = ev.threadId != null ? ev.threadId : run.threadId;
        run.runId = ev.runId != null ? ev.runId : run.runId;
        run.status = "running";
      } else if (type === EventType.RUN_FINISHED) {
        run.threadId = ev.threadId != null ? ev.threadId : run.threadId;
        run.runId = ev.runId != null ? ev.runId : run.runId;
        run.status = "finished";
      } else if (type === EventType.RUN_ERROR) {
        run.status = "error";
        error = ev.message != null ? String(ev.message) : "error";
      } else if (type === EventType.TEXT_MESSAGE_START) {
        var mid = String(ev.messageId || "");
        if (!mid) continue;
        if (!byId[mid]) {
          byId[mid] = {
            id: mid,
            role: ev.role || "assistant",
            text: "",
          };
          order.push(mid);
        } else if (ev.role) {
          byId[mid].role = ev.role;
        }
      } else if (type === EventType.TEXT_MESSAGE_CONTENT) {
        var cid = String(ev.messageId || "");
        if (!cid) continue;
        if (!byId[cid]) {
          byId[cid] = { id: cid, role: "assistant", text: "" };
          order.push(cid);
        }
        byId[cid].text += ev.delta != null ? String(ev.delta) : "";
      } else if (type === EventType.TEXT_MESSAGE_END) {
        // no-op; content already accumulated
      } else if (type === EventType.TOOL_CALL_START) {
        var tid = String(ev.toolCallId || "");
        if (!tid) continue;
        var tool = {
          id: tid,
          name: ev.toolCallName || "tool",
          args: "",
          result: null,
        };
        toolById[tid] = tool;
        tools.push(tool);
      } else if (type === EventType.TOOL_CALL_ARGS) {
        var taid = String(ev.toolCallId || "");
        if (toolById[taid]) {
          toolById[taid].args += ev.delta != null ? String(ev.delta) : "";
        }
      } else if (type === EventType.TOOL_CALL_RESULT) {
        var trid = String(ev.toolCallId || "");
        if (toolById[trid]) {
          toolById[trid].result =
            ev.content != null ? String(ev.content) : "";
        }
      }
    }

    return {
      messages: order.map(function (id) {
        return byId[id];
      }),
      run: run,
      tools: tools,
      error: error,
    };
  }

  /**
   * Primary assistant text from a folded event stream (first assistant message).
   */
  function primaryTextFromEvents(events) {
    var folded = foldAguiEvents(events);
    for (var i = 0; i < folded.messages.length; i++) {
      if (folded.messages[i].role === "assistant") {
        return folded.messages[i].text;
      }
    }
    if (folded.messages.length) return folded.messages[0].text;
    return "";
  }

  function escHtml(s) {
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

  function inlineMd(escaped) {
    // Input must already be HTML-escaped plain text.
    var s = escaped;
    // inline code
    s = s.replace(/`([^`\n]+)`/g, function (_, code) {
      return '<code class="copilot-md-code">' + code + "</code>";
    });
    // bold
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    // italic
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    return s;
  }

  /**
   * Minimal safe markdown → HTML (headings, lists, fenced code, inline code/bold).
   * Does not support raw HTML passthrough.
   */
  function markdownToHtml(md) {
    var src = md == null ? "" : String(md);
    if (!src) return "";

    var fences = [];
    var withPlaceholders = src.replace(
      /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g,
      function (_, lang, code) {
        var i = fences.length;
        fences.push({
          lang: lang || "",
          code: code.replace(/\n$/, ""),
        });
        return "\n\n@@FENCE" + i + "@@\n\n";
      }
    );

    var blocks = withPlaceholders.split(/\n{2,}/);
    var html = [];

    for (var b = 0; b < blocks.length; b++) {
      var block = blocks[b].replace(/^\n+|\n+$/g, "");
      if (!block) continue;

      var fenceMatch = block.match(/^@@FENCE(\d+)@@$/);
      if (fenceMatch) {
        var f = fences[Number(fenceMatch[1])];
        html.push(
          '<pre class="copilot-md-pre"><code class="copilot-md-codeblock"' +
            (f.lang ? ' data-lang="' + escHtml(f.lang) + '"' : "") +
            ">" +
            escHtml(f.code) +
            "</code></pre>"
        );
        continue;
      }

      var lines = block.split("\n");
      var first = lines[0];

      var heading = first.match(/^(#{1,3})\s+(.+)$/);
      if (heading && lines.length === 1) {
        var level = heading[1].length;
        html.push(
          "<h" +
            level +
            ' class="copilot-md-h">' +
            inlineMd(escHtml(heading[2])) +
            "</h" +
            level +
            ">"
        );
        continue;
      }

      var allUnordered = lines.every(function (ln) {
        return /^\s*[-*]\s+/.test(ln);
      });
      if (allUnordered) {
        html.push(
          '<ul class="copilot-md-ul">' +
            lines
              .map(function (ln) {
                var item = ln.replace(/^\s*[-*]\s+/, "");
                return (
                  '<li class="copilot-md-li">' +
                  inlineMd(escHtml(item)) +
                  "</li>"
                );
              })
              .join("") +
            "</ul>"
        );
        continue;
      }

      var allOrdered = lines.every(function (ln) {
        return /^\s*\d+\.\s+/.test(ln);
      });
      if (allOrdered) {
        html.push(
          '<ol class="copilot-md-ol">' +
            lines
              .map(function (ln) {
                var item = ln.replace(/^\s*\d+\.\s+/, "");
                return (
                  '<li class="copilot-md-li">' +
                  inlineMd(escHtml(item)) +
                  "</li>"
                );
              })
              .join("") +
            "</ol>"
        );
        continue;
      }

      html.push(
        '<p class="copilot-md-p">' +
          lines
            .map(function (ln) {
              return inlineMd(escHtml(ln));
            })
            .join("<br>") +
          "</p>"
      );
    }

    return html.join("");
  }

  /**
   * Render one transcript message body for the dock.
   * Assistant messages use markdown; user/system stay plain escaped.
   */
  function renderMessageBodyHtml(role, text) {
    var body = text == null ? "" : String(text);
    if (role === "assistant") {
      return markdownToHtml(body);
    }
    return escHtml(body);
  }

  /**
   * Apply an AG-UI event stream for one assistant turn and return the HTML body.
   * Event-driven path: fold events → primary assistant text → markdown.
   */
  function renderAssistantFromEvents(events) {
    var text = primaryTextFromEvents(events);
    return {
      text: text,
      html: markdownToHtml(text),
      folded: foldAguiEvents(events),
    };
  }

  return {
    EventType: EventType,
    textToAguiEvents: textToAguiEvents,
    errorToAguiEvents: errorToAguiEvents,
    foldAguiEvents: foldAguiEvents,
    primaryTextFromEvents: primaryTextFromEvents,
    markdownToHtml: markdownToHtml,
    renderMessageBodyHtml: renderMessageBodyHtml,
    renderAssistantFromEvents: renderAssistantFromEvents,
    escHtml: escHtml,
  };
});
