/**
 * Pure helpers for the SFT interactive course.
 * Usable from the browser (global SFTCourse) and Node tests (module.exports).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SFTCourse = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const REQUIRED_LESSON_KEYS = [
    "id",
    "module",
    "title",
    "time",
    "level",
    "objectives",
    "why",
    "body",
    "example",
    "activity",
    "quiz",
    "reflection",
  ];

  /** Activity kinds that only use choice grids (no data-run). */
  const CHOICE_ONLY_ACTIVITIES = new Set([
    "behavior_picker",
    "eval_protocol",
    "acceptance_checklist",
  ]);

  /** Map activity kind -> data-run kind (or null if choice-only / mask UI). */
  const ACTIVITY_RUN_KINDS = {
    behavior_picker: null,
    token_highlight: null,
    masking_simulator: null,
    claim_classifier: "claim",
    claim_builder: "claim",
    method_chooser: "method",
    dataset_classifier: "dataset",
    split_simulator: "split",
    converter_lab: "convert",
    trace_triage: "convert",
    template_renderer: "template",
    truncation_checker: "trunc",
    tool_validator: "tool",
    pipeline_match: "config",
    config_builder: "config",
    training_triage: "triage",
    eval_protocol: null,
    score_interpreter: "score",
    task_brief_builder: "brief",
    acceptance_checklist: null,
    review_failure_modes: "fail",
  };

  function ensureState(state, firstLessonId) {
    const s = state && typeof state === "object" ? state : {};
    return {
      completed: s.completed || {},
      quiz: s.quiz || {},
      notes: s.notes || {},
      activities: s.activities || {},
      capstone: s.capstone || {},
      last: s.last || firstLessonId || "o1",
    };
  }

  function lessonCount(course) {
    return course.length + 1; // + capstone
  }

  function completedCount(state) {
    return Object.values(state.completed || {}).filter(Boolean).length;
  }

  function progressPercent(state, course) {
    const total = lessonCount(course);
    if (!total) return 0;
    return Math.round((completedCount(state) / total) * 100);
  }

  function progressLabel(state, course) {
    const done = completedCount(state);
    const total = lessonCount(course);
    const pct = progressPercent(state, course);
    return done + "/" + total + " lessons complete · " + pct + "%";
  }

  function nextLessonTitle(state, course) {
    const n = course.find(function (l) {
      return !state.completed[l.id];
    });
    return n ? n.title : "Capstone / review";
  }

  function quizHasExactlyOneCorrect(quiz) {
    if (!quiz || !Array.isArray(quiz.options)) return false;
    const trues = quiz.options.filter(function (o) {
      return o && o[1] === true;
    });
    return trues.length === 1;
  }

  function scoreQuizOption(option) {
    // option: [text, correctBool, feedback]
    const correct = !!(option && option[1] === true);
    const feedback = option && option[2] ? String(option[2]) : "";
    return {
      correct: correct,
      message: (correct ? "Correct. " : "Not quite. ") + feedback,
    };
  }

  function interpretScoreDelta(baseline, sft, oodDelta) {
    const d = Number(sft) - Number(baseline);
    const o = Number(oodDelta);
    let txt =
      "Average delta: " +
      d.toFixed(1) +
      ". " +
      (d >= 1
        ? "Positive signal; inspect dimensions."
        : d > -1
          ? "Neutral."
          : "Regression risk.");
    if (o < 0) txt += " OOD regression: report specialization risk.";
    return txt;
  }

  function buildSmokeCommand(opts) {
    const o = opts || {};
    const model = o.model || "Qwen/Qwen2.5-0.5B-Instruct";
    const data = o.dataset || "trl-lib/Capybara";
    const path = o.output || "outputs/sft-mentor-smoke";
    const steps = o.steps != null ? o.steps : 5;
    return (
      "uv run examples/sft-mentor-lab/train_lora_sft.py \\\n" +
      "  --model-name " +
      model +
      " \\\n" +
      "  --dataset-name " +
      data +
      " \\\n" +
      "  --output-dir " +
      path +
      " \\\n" +
      "  --max-steps " +
      steps +
      " \\\n" +
      "  --max-seq-length 1024 \\\n" +
      "  --per-device-train-batch-size 1 \\\n" +
      "  --gradient-accumulation-steps 1"
    );
  }

  function runActivityPure(kind, inputs) {
    const i = inputs || {};
    if (kind === "claim") {
      const v = i.claim;
      if (v === "loss")
        return "Unsafe: loss alone supports target-token fit, not agent improvement.";
      if (v === "smoke")
        return "Safe if logs show it: mechanical smoke-run completion only.";
      return "Potentially safe if eval is frozen, adapter loaded, schemas match, and scores are reported.";
    }
    if (kind === "method") {
      const map = {
        demo: "Start with SFT: demonstrations teach format/behavior.",
        pref: "Use DPO/preference tuning after SFT if chosen/rejected pairs are reliable.",
        reward:
          "Use GRPO/RL when reward/tests are verifiable and attempts are parseable.",
        trace:
          "Use self-distillation: filter successful traces, convert to SFT/preference data, evaluate before accepting.",
      };
      return map[i.method] || "Choose a data/reward evidence type.";
    }
    if (kind === "dataset") {
      const c = i.columns;
      const t = i.target;
      let txt =
        c === "messages"
          ? "messages format; prefer assistant_only_loss=True when the chat template supports generation spans."
          : c === "pc"
            ? "prompt/completion; completion_only_loss defaults to True for this shape."
            : c === "text"
              ? "text; full LM only if every token is safe target behavior."
              : "raw trace; redact/filter/convert before SFT.";
      if (t === "tool") txt += " Validate tool schemas and recovery behavior.";
      return txt;
    }
    if (kind === "split") {
      return i.source === "independent"
        ? "Random split may be acceptable if rows are truly independent; still hash-check duplicates."
        : "Do not random row split. Split by session/task/source/problem before conversion; save split_manifest.json and duplicate checks.";
    }
    if (kind === "convert") {
      return "Conversion checklist: identify context vs target; drop noise; redact secrets/private paths/labels; choose messages or prompt/completion; verify no held-out label leakage.";
    }
    if (kind === "template") {
      return "Conceptual render: role markers + content + model-specific special tokens/EOS. For assistant_only_loss, templates need {% generation %}/{% endgeneration %} (TRL patches known families). Inspect actual tokenizer.apply_chat_template output before training.";
    }
    if (kind === "trunc") {
      const n = Number(i.tokens);
      const m = Number(i.maxLength);
      let txt =
        n > m ? "Risk: " + n + ">" + m + " tokens. " : "Length within limit. ";
      if (n > m && i.position === "end")
        txt += "High risk: target near end may be cut off.";
      return txt;
    }
    if (kind === "tool") {
      let name = "";
      try {
        name = JSON.parse(i.toolJson || "{}").name;
      } catch (e) {
        return "Malformed JSON. Fix syntax first.";
      }
      if (name === i.availableName)
        return "Tool name matches. Next validate required args, observations, and no fake tool outputs.";
      return (
        'Tool mismatch: call uses "' +
        name +
        '" but available tool is "' +
        i.availableName +
        '".'
      );
    }
    if (kind === "config") {
      return buildSmokeCommand({
        model: i.model,
        dataset: i.dataset,
        output: i.output,
        steps: i.steps,
      });
    }
    if (kind === "triage") {
      const notes = [];
      if (i.train === "flat")
        notes.push(
          "Flat loss: check target labels, trainable adapters, data, LR."
        );
      if (i.train === "nan") notes.push("Stop: debug LR/dtype/data/masking.");
      if (i.eval === "up") notes.push("Eval rising: overfit or mismatch.");
      if (i.eval === "none") notes.push("No eval: only mechanical claims.");
      if (i.artifact === "missing")
        notes.push("Missing artifact: cannot audit/reload.");
      if (i.artifact === "repo")
        notes.push("Move artifacts out of tracked repo.");
      return notes.length
        ? notes.join("\n")
        : "Healthy enough to proceed to behavior eval; do not overclaim.";
    }
    if (kind === "score") {
      return interpretScoreDelta(i.baseline, i.sft, i.ood);
    }
    if (kind === "brief") {
      const behavior = i.behavior || "tool-call formatting";
      const model = i.model || "Qwen/Qwen2.5-0.5B-Instruct";
      const dataset = i.dataset || "trl-lib/Capybara";
      return (
        "# Copilot task brief (SFT smoke)\n\n" +
        "## Goal\n" +
        "Run a TRL SFT + LoRA smoke that teaches: " +
        behavior +
        ".\n\n" +
        "## Constraints\n" +
        "- Base model: " +
        model +
        "\n" +
        "- Dataset: " +
        dataset +
        " (inspect shape first)\n" +
        "- Use examples/sft-mentor-lab/train_lora_sft.py or equivalent SFTTrainer + LoraConfig\n" +
        "- max_steps small for smoke (e.g. 5); do not claim benchmark wins\n" +
        "- Keep checkpoints/logs outside the tracked context repo\n\n" +
        "## Required deliverables\n" +
        "1. Exact command or script + SFTConfig/LoRA knobs\n" +
        "2. Dataset inspection notes (columns, template, length)\n" +
        "3. Train log path + final_adapter path\n" +
        "4. One generation sample\n" +
        "5. Explicit non-claims (what smoke does NOT prove)\n\n" +
        "## Acceptance checks\n" +
        "- Script exits 0; adapter reloads; eval_strategy has eval_dataset if enabled\n" +
        "- Flags match argparse of the real script\n" +
        "- No secrets in logged samples"
      );
    }
    if (kind === "fail") {
      const mode = i.mode || "silent_wrong_shape";
      const map = {
        silent_wrong_shape:
          "Failure: wrong columns still 'train'. Fix: inspect_dataset.py first; refuse if shape unknown; require formatting_func or conversion.",
        missing_eval:
          "Failure: eval_strategy set without eval_dataset. Fix: provide held-out split or disable eval explicitly.",
        no_adapter_load:
          "Failure: SFT eval without loading adapter. Fix: verify baseline has no adapter and SFT path loads PeftModel/adapter.",
        cherry_eval:
          "Failure: prompts changed after seeing outputs. Fix: freeze eval pack + rubric + decoding before comparison.",
        overclaim:
          "Failure: loss ↓ sold as 'better agent'. Fix: require frozen baseline-vs-SFT rubric scores and residual risks.",
      };
      return map[mode] || "Pick a failure mode to review.";
    }
    return "";
  }

  function buildReportText(capstone, notes) {
    const get = function (k, fallback) {
      const v = capstone && capstone[k];
      return v != null && v !== "" ? v : fallback || "";
    };
    const noteLines = Object.entries(notes || {})
      .filter(function (pair) {
        return pair[1];
      })
      .map(function (pair) {
        return "- " + pair[0] + ": " + pair[1];
      })
      .join("\n");
    return (
      "# SFT Capstone Report\n\n" +
      "## Summary\n" +
      "- Objective: " +
      get("objective") +
      "\n" +
      "- Target behavior: " +
      get("behavior") +
      "\n" +
      "- Base model: " +
      get("model") +
      "\n" +
      "- Dataset: " +
      get("dataset") +
      "\n" +
      "- Method: TRL SFT + LoRA\n" +
      "- Cautious claim: " +
      get("claim") +
      "\n\n" +
      "## Data and Split\n" +
      "- Format: " +
      get("format") +
      "\n" +
      "- Split policy: " +
      get("split") +
      "\n" +
      "- Leakage checks: source/session/task disjointness, exact/near-duplicate hashes, split_manifest.json.\n" +
      "- Trace privacy: secrets/private paths/code/labels redacted; trace-derived artifacts private unless reviewed.\n\n" +
      "## Masking and Tokenization\n" +
      "- Masking: " +
      get("masking") +
      "\n" +
      "- Label inspection: verify -100 ignored labels and target tokens; verify EOS/pad and truncation target survival.\n" +
      "- Flags: assistant_only_loss / completion_only_loss must match data shape and template support.\n\n" +
      "## Training\n" +
      "- Command/config: attach exact command or config.\n" +
      "- Tracking/logs: " +
      get("tracking") +
      "\n" +
      "- Artifact: " +
      get("artifact") +
      "\n" +
      "- Repro metadata: model/tokenizer/dataset revisions, seed, package versions, LoRA/QLoRA config, trainable params.\n\n" +
      "## Evaluation\n" +
      "- Protocol: " +
      get("eval") +
      "\n" +
      "- Baseline and SFT use same prompts, decoding, template, system prompt, tools, scorer.\n" +
      "- Behavior scores: attach scored CSV/JSON and raw generations.\n\n" +
      "## Copilot tasking (if used)\n" +
      "- Task brief, acceptance checks, and review notes attached or summarized.\n" +
      "- Agent output evaluated with the same frozen protocol as human runs.\n\n" +
      "## Risks and Next Step\n" +
      "- Known regressions:\n" +
      "- Unsupported claims:\n" +
      "- Next method: more SFT / DPO / GRPO / environment RL / self-distillation.\n\n" +
      "## Course notes\n" +
      (noteLines || "- No saved notes yet.") +
      "\n"
    );
  }

  function validateCourseStructure(course) {
    const errors = [];
    const ids = new Set();
    const activitiesUsed = new Set();

    if (!Array.isArray(course) || course.length === 0) {
      return { ok: false, errors: ["COURSE is empty"], lessonCount: 0, activities: [] };
    }

    course.forEach(function (lesson, idx) {
      REQUIRED_LESSON_KEYS.forEach(function (k) {
        if (lesson[k] === undefined || lesson[k] === null || lesson[k] === "") {
          errors.push("lesson[" + idx + "] missing " + k);
        }
      });
      if (!Array.isArray(lesson.objectives) || !lesson.objectives.length) {
        errors.push((lesson.id || idx) + ": objectives empty");
      }
      if (!Array.isArray(lesson.body) || !lesson.body.length) {
        errors.push((lesson.id || idx) + ": body empty");
      }
      if (ids.has(lesson.id)) {
        errors.push("duplicate id: " + lesson.id);
      }
      ids.add(lesson.id);
      if (lesson.quiz) {
        if (!lesson.quiz.q) errors.push(lesson.id + ": quiz.q missing");
        if (!quizHasExactlyOneCorrect(lesson.quiz)) {
          errors.push(lesson.id + ": quiz must have exactly one correct option");
        }
      }
      if (lesson.activity) {
        activitiesUsed.add(lesson.activity);
        if (!(lesson.activity in ACTIVITY_RUN_KINDS)) {
          errors.push(
            lesson.id + ": unknown activity kind '" + lesson.activity + "'"
          );
        }
      }
    });

    const activities = Array.from(activitiesUsed).sort();
    return {
      ok: errors.length === 0,
      errors: errors,
      lessonCount: course.length,
      activities: activities,
      activityHandlers: Object.keys(ACTIVITY_RUN_KINDS).sort(),
    };
  }

  function tokenMaskClass(role, mode) {
    // role: 'p' prompt/context, 'a' assistant/target
    if (mode === "full" || role === "a") return "target";
    return "masked";
  }

  /** localStorage key for left progress/nav sidebar collapse (mirrors copilot). */
  const SIDEBAR_COLLAPSED_KEY = "sft-course-sidebar-collapsed-v1";

  /** Open-copilot third-track width in px; must match playbook CSS `.app.has-copilot`. */
  const COPILOT_OPEN_TRACK_PX = 440;

  function parseSidebarCollapsed(stored) {
    return stored === "1" || stored === true || stored === 1;
  }

  function sidebarCollapsedStorageValue(collapsed) {
    return collapsed ? "1" : "0";
  }

  /**
   * Class fragments applied when the progress sidebar is collapsed.
   * @returns {{ appClass: string, sidebarClass: string }}
   */
  function sidebarCollapsedDomClasses(collapsed) {
    return {
      appClass: collapsed ? "sidebar-collapsed" : "",
      sidebarClass: collapsed ? "is-collapsed" : "",
    };
  }

  /**
   * Read the third track of a `grid-template-columns` value (open copilot column).
   * @param {string} gridValue e.g. "360px minmax(0,1fr) 440px"
   * @returns {number|null} pixel width or null if not a fixed px track
   */
  function parseOpenCopilotThirdTrackPx(gridValue) {
    const parts = String(gridValue || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length < 3) return null;
    const last = parts[parts.length - 1];
    const m = last.match(/^(\d+(?:\.\d+)?)px$/i);
    return m ? Number(m[1]) : null;
  }

  function buildCourseContext(state, viewMeta, course) {
    const s = ensureState(state, course[0] && course[0].id);
    const view = (viewMeta && viewMeta.view) || "home";
    const lessonId = viewMeta && viewMeta.lessonId != null ? viewMeta.lessonId : null;
    const lesson =
      lessonId && lessonId !== "capstone"
        ? course.find(function (l) { return l.id === lessonId; })
        : null;
    const completedIds = Object.keys(s.completed || {}).filter(function (id) {
      return s.completed[id];
    });
    const total = lessonCount(course);
    const done = completedCount(s);
    return {
      course: "sft-interactive-playbook",
      view: view,
      lessonId: lessonId,
      module: view === "capstone" ? "Final Project" : lesson ? lesson.module : null,
      lessonTitle: view === "capstone" ? "Capstone report builder" : lesson ? lesson.title : null,
      progress: {
        completedCount: done,
        totalLessons: total,
        percent: progressPercent(s, course),
        completedIds: completedIds,
      },
      capstoneComplete: !!s.completed.capstone,
    };
  }

  return {
    REQUIRED_LESSON_KEYS: REQUIRED_LESSON_KEYS,
    CHOICE_ONLY_ACTIVITIES: CHOICE_ONLY_ACTIVITIES,
    ACTIVITY_RUN_KINDS: ACTIVITY_RUN_KINDS,
    ensureState: ensureState,
    lessonCount: lessonCount,
    completedCount: completedCount,
    progressPercent: progressPercent,
    progressLabel: progressLabel,
    nextLessonTitle: nextLessonTitle,
    quizHasExactlyOneCorrect: quizHasExactlyOneCorrect,
    scoreQuizOption: scoreQuizOption,
    interpretScoreDelta: interpretScoreDelta,
    buildSmokeCommand: buildSmokeCommand,
    runActivityPure: runActivityPure,
    buildReportText: buildReportText,
    validateCourseStructure: validateCourseStructure,
    tokenMaskClass: tokenMaskClass,
    buildCourseContext: buildCourseContext,
    SIDEBAR_COLLAPSED_KEY: SIDEBAR_COLLAPSED_KEY,
    COPILOT_OPEN_TRACK_PX: COPILOT_OPEN_TRACK_PX,
    parseSidebarCollapsed: parseSidebarCollapsed,
    sidebarCollapsedStorageValue: sidebarCollapsedStorageValue,
    sidebarCollapsedDomClasses: sidebarCollapsedDomClasses,
    parseOpenCopilotThirdTrackPx: parseOpenCopilotThirdTrackPx,
  };
});
