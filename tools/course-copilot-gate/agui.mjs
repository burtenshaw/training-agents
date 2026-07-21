// tools/course-copilot-gate/agui.mjs
// Thin ESM re-export of docs/sft-course-agui.js for the gate + Node tests.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Agui = require(path.join(__dirname, "../../docs/sft-course-agui.js"));

export const EventType = Agui.EventType;
export const textToAguiEvents = Agui.textToAguiEvents;
export const errorToAguiEvents = Agui.errorToAguiEvents;
export const foldAguiEvents = Agui.foldAguiEvents;
export const primaryTextFromEvents = Agui.primaryTextFromEvents;
export const markdownToHtml = Agui.markdownToHtml;
export const renderMessageBodyHtml = Agui.renderMessageBodyHtml;
export const renderAssistantFromEvents = Agui.renderAssistantFromEvents;
export const escHtml = Agui.escHtml;
export default Agui;
