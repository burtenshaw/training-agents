// tools/course-copilot-gate/test/agui.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  EventType,
  textToAguiEvents,
  errorToAguiEvents,
  foldAguiEvents,
  primaryTextFromEvents,
  markdownToHtml,
  renderAssistantFromEvents,
  renderMessageBodyHtml,
} from "../agui.mjs";

test("textToAguiEvents emits RUN + TEXT_MESSAGE lifecycle", () => {
  const events = textToAguiEvents("Hello **world**", {
    threadId: "t1",
    runId: "r1",
    messageId: "m1",
    timestamp: 1,
  });
  const types = events.map((e) => e.type);
  assert.deepEqual(types, [
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.RUN_FINISHED,
  ]);
  assert.equal(events[0].threadId, "t1");
  assert.equal(events[0].runId, "r1");
  assert.equal(events[1].messageId, "m1");
  assert.equal(events[1].role, "assistant");
  assert.equal(events[2].delta, "Hello **world**");
});

test("textToAguiEvents empty text skips CONTENT but keeps lifecycle", () => {
  const events = textToAguiEvents("", {
    runId: "r",
    messageId: "m",
    timestamp: 0,
  });
  const types = events.map((e) => e.type);
  assert.ok(!types.includes(EventType.TEXT_MESSAGE_CONTENT));
  assert.ok(types.includes(EventType.TEXT_MESSAGE_START));
  assert.ok(types.includes(EventType.TEXT_MESSAGE_END));
  assert.equal(primaryTextFromEvents(events), "");
});

test("foldAguiEvents reconstructs assistant text from content deltas", () => {
  const events = [
    { type: EventType.RUN_STARTED, threadId: "t", runId: "r" },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: "m",
      role: "assistant",
    },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m", delta: "Hel" },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m", delta: "lo" },
    { type: EventType.TEXT_MESSAGE_END, messageId: "m" },
    { type: EventType.RUN_FINISHED, threadId: "t", runId: "r" },
  ];
  const folded = foldAguiEvents(events);
  assert.equal(folded.run.status, "finished");
  assert.equal(folded.messages.length, 1);
  assert.equal(folded.messages[0].text, "Hello");
  assert.equal(primaryTextFromEvents(events), "Hello");
});

test("errorToAguiEvents ends with RUN_ERROR", () => {
  const events = errorToAguiEvents("boom", {
    runId: "r",
    messageId: "m",
    timestamp: 1,
  });
  assert.equal(events[events.length - 1].type, EventType.RUN_ERROR);
  assert.equal(events[events.length - 1].message, "boom");
  const folded = foldAguiEvents(events);
  assert.equal(folded.run.status, "error");
  assert.equal(folded.error, "boom");
});

test("markdownToHtml renders headings, lists, and fenced code", () => {
  const md = [
    "## Title",
    "",
    "- item one",
    "- item two",
    "",
    "```js",
    "const x = 1;",
    "```",
    "",
    "Use `code` and **bold**.",
  ].join("\n");
  const html = markdownToHtml(md);
  assert.match(html, /<h2 class="copilot-md-h">Title<\/h2>/);
  assert.match(html, /<ul class="copilot-md-ul">/);
  assert.match(html, /item one/);
  assert.match(html, /<pre class="copilot-md-pre">/);
  assert.match(html, /const x = 1;/);
  assert.match(html, /<code class="copilot-md-code">code<\/code>/);
  assert.match(html, /<strong>bold<\/strong>/);
});

test("markdownToHtml escapes raw HTML (no script injection)", () => {
  const html = markdownToHtml('<script>alert(1)</script>\n\nSafe **ok**');
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<strong>ok<\/strong>/);
});

test("renderAssistantFromEvents is event-driven (not opaque text paint)", () => {
  const events = textToAguiEvents("# Hello\n\n- a\n- b", {
    messageId: "m9",
    runId: "r9",
    timestamp: 1,
  });
  const out = renderAssistantFromEvents(events);
  assert.equal(out.text.includes("# Hello"), true);
  assert.match(out.html, /<h1 /);
  assert.match(out.html, /<ul /);
  assert.equal(out.folded.messages[0].id, "m9");
  // Proves path went through fold, not a single opaque assignment:
  assert.equal(out.folded.messages[0].text, out.text);
});

test("renderMessageBodyHtml uses markdown only for assistant", () => {
  const a = renderMessageBodyHtml("assistant", "## H");
  const u = renderMessageBodyHtml("user", "## H");
  assert.match(a, /<h2 /);
  assert.equal(u.includes("<h2"), false);
  assert.equal(u, "## H");
});

test("tool call events fold into tools array", () => {
  const events = [
    { type: EventType.RUN_STARTED, threadId: "t", runId: "r" },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: "tc1",
      toolCallName: "read_file",
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: "tc1",
      delta: '{"path":"x"}',
    },
    { type: EventType.TOOL_CALL_END, toolCallId: "tc1" },
    {
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: "tc1",
      content: "file body",
      messageId: "tm",
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: "m",
      role: "assistant",
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: "m",
      delta: "done",
    },
    { type: EventType.TEXT_MESSAGE_END, messageId: "m" },
    { type: EventType.RUN_FINISHED, threadId: "t", runId: "r" },
  ];
  const folded = foldAguiEvents(events);
  assert.equal(folded.tools.length, 1);
  assert.equal(folded.tools[0].name, "read_file");
  assert.equal(folded.tools[0].args, '{"path":"x"}');
  assert.equal(folded.tools[0].result, "file body");
  assert.equal(primaryTextFromEvents(events), "done");
});
