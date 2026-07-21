# SFT Interactive Course Verification — Design

## Context

`docs/sft-interactive-playbook.html` is a self-contained interactive HTML
course for supervised fine-tuning (SFT) of agentic models: 18 lessons across
7 modules plus a capstone report builder, each lesson with objectives, an
explanation, an example, an interactive activity, a quiz, and a reflection
note. Progress, quiz results, notes, and capstone fields persist in
`localStorage`. A companion set of scripts lives in
`examples/sft-mentor-lab/` (`inspect_dataset.py`, `train_lora_sft.py`,
`score_generations.py`, `eval_prompts.jsonl`), mapped to a four-week mentor
path that the HTML course and the scripts' README cross-reference.

`README.md` and `docs/program.md` already have uncommitted diffs that wire
both into the repo's guide index, describing the HTML file as a finished
interactive playbook.

The course and scripts already exist and read as functionally complete on
inspection. The goal of this work is **not** to design or build new course
content — it is to verify that what exists actually works end-to-end, is
technically accurate, and is internally consistent, then commit the
already-drafted docs wiring.

## Goal

Confirm the SFT course works end-to-end and ship it. Concretely:

1. The HTML file has no structural defects (missing fields, orphaned
   activity kinds, broken quiz data).
2. The HTML file runs correctly in a real browser: every lesson, quiz,
   activity, and the capstone builder function without JavaScript errors,
   and progress persists correctly.
3. The course's technical content (SFT/TRL/masking/eval claims) is accurate.
4. The course's references to `examples/sft-mentor-lab/` scripts (commands,
   flags, workflow narrative) match what those scripts actually accept and
   do.
5. The uncommitted `README.md` / `docs/program.md` diffs accurately
   describe the verified state, and everything is committed together.

## Non-goals

- Adding new lessons, modules, or activities.
- Redesigning the UI, styling, or information architecture.
- Building new companion scripts or changing `sft-mentor-lab`'s scope.
- Any GRPO/environment/distillation course content (out of scope for this
  SFT-only course).

## Approach

One sequential verification pass, four checks, each able to surface fixes
that get applied inline before moving to the next. No new artifacts are
produced beyond fixes to existing files; the deliverable is a short findings
summary plus a commit.

### 1. Structural check (static, no browser)

Parse the embedded `course-data` JSON out of the HTML file and assert:

- No duplicate lesson `id` values.
- Every lesson has all required keys: `id`, `module`, `title`, `time`,
  `level`, `objectives`, `why`, `body`, `example`, `activity`, `quiz.q`,
  `quiz.options`, `reflection`.
- Every quiz has exactly one option with `true` as its correctness flag.
- Every distinct `activity` value referenced by a lesson has a matching
  branch in both `activityHTML()` and `runActivity()` in the page's
  `<script>`.

Any mismatch found here is a real bug (e.g., a lesson pointing at an activity
kind with no matching case renders a dead "Try it" block) and gets fixed
directly in the HTML file.

### 2. Headless browser pass (Playwright)

A throwaway Node script (deleted after use, not committed) using
`npx playwright` with Chromium to:

- Open the file via `file://`, collecting `console.error` and `pageerror`
  events for the whole session.
- Click "Start course," then walk all 18 lessons via "Next": answer the
  quiz (click an option), exercise the lesson's specific activity (fill
  whatever inputs/selects/textareas it has, click its run/choice button),
  type into the reflection textarea, click "Mark complete."
- Verify the sidebar progress percentage increments and the lesson's
  `state-dot` shows the completed state.
- Navigate to the capstone section, fill a field, click "Generate report,"
  confirm the report output is non-empty and contains expected section
  headers, click "Copy report" (grant clipboard permission in the script
  context).
- Exercise "Export" (intercept the download and confirm it's valid JSON),
  reload the page and confirm state survived the reload, then exercise
  "Reset" (auto-accept the confirm dialog) and confirm state cleared.

Any console error, thrown exception, or failed assertion (e.g., progress
not incrementing, report generation producing empty/malformed output) is a
bug — fixed directly in the HTML file, then the affected step is re-run to
confirm the fix.

### 3. Content accuracy review

Read all 18 lessons' `body`, `example`, and quiz text against known-correct
SFT/TRL/PEFT/evaluation practice: dataset formats (`messages` vs
`prompt`/`completion` vs `text`), loss masking semantics, tool-calling
representation, LoRA basics, training diagnostics, and evaluation/claims
discipline. Flag anything technically wrong, outdated, or overstated, and
correct it inline in the HTML file's course-data.

### 4. Cross-reference with `examples/sft-mentor-lab/`

Compare:

- The `config_builder` activity's generated command (model/dataset/output/
  steps flags for `train_lora_sft.py`) against that script's actual
  argparse definition.
- The course's mentions of `inspect_dataset.py`, `score_generations.py`,
  and `eval_prompts.jsonl` against those scripts' actual CLI flags and
  input/output expectations.
- The "Week 2 / Week 3 / Week 4" narrative in
  `examples/sft-mentor-lab/README.md` against what the HTML course tells
  learners to do at the corresponding point.

Fix any drift (renamed flag, changed default, mismatched file name) in
whichever side is stale.

### 5. Docs wiring and commit

Re-read the uncommitted `README.md` and `docs/program.md` diffs in light of
whatever was fixed above. Adjust wording only if a fix changes what's true
(for example, if the course description needs to change). Stage and commit
the HTML file, the `examples/sft-mentor-lab/` directory, and the
`README.md`/`docs/program.md` diffs together in a single commit.

## Testing / verification

Verification is the deliverable, not a separate phase. Success criteria:

- Structural check reports zero mismatches (or all found ones are fixed).
- The Playwright pass completes all steps above with zero console errors
  and zero failed assertions.
- Content review turns up no uncorrected technical inaccuracies.
- Script cross-reference turns up no uncorrected drift between the course
  narrative and the actual scripts.
- `git status` shows a single clean commit containing the HTML file, the
  mentor-lab example directory, and the README/program.md wiring.

## Deliverable

A short findings summary reported back to the user: what was checked, what
(if anything) was broken and got fixed, and confirmation of the final
commit. No new design documents or course content beyond inline fixes to
existing files.
