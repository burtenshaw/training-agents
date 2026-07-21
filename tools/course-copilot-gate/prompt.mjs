// tools/course-copilot-gate/prompt.mjs
export function formatLocationOverride(ctx) {
  const p = ctx.progress || {};
  const ids = (p.completedIds || []).join(", ");
  return [
    "## LOCATION OVERRIDE (authoritative; ignore any earlier location memory)",
    `course: ${ctx.course}`,
    `view: ${ctx.view}`,
    `lessonId: ${ctx.lessonId}`,
    `module: ${ctx.module}`,
    `lessonTitle: ${ctx.lessonTitle}`,
    `progress: ${p.completedCount}/${p.totalLessons} (${p.percent}%)`,
    `completedIds: ${ids}`,
    `capstoneComplete: ${!!ctx.capstoneComplete}`,
  ].join("\n");
}

export function buildCreatePrompt({ rulesText, context, message }) {
  return [
    rulesText.trim(),
    "",
    formatLocationOverride(context),
    "",
    "## User question",
    message.trim(),
  ].join("\n");
}

export function buildResumePrompt({ context, message }) {
  return [
    "You are the SFT course tutor. LOCATION OVERRIDE is ground truth. Do not spoil quiz answers.",
    "",
    formatLocationOverride(context),
    "",
    "## User question",
    message.trim(),
  ].join("\n");
}
