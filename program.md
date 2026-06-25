# Program

Training Agents is an agentic research-lab context for post-training models
with TRL.

The program has two tracks that should reinforce each other:

- Use Codex agents to produce better training plans, scripts, evaluations,
  monitoring, and reviews.
- Train models that become better agents through chat data, tool traces,
  verifiable rewards, environments, and distillation.

## Progression

1. Build SFT challenges for conversational and tool-calling datasets.
2. Move to GRPO for verifiable tasks with prompt-only datasets and reward
   functions.
3. Connect GRPO to OpenEnv-style environments for terminal, browser, API, or
   other agentic loops.
4. Distill from successful traces into future SFT or preference datasets.

## Operating Loop

For each challenge:

1. Define a measurable goal and stopping rule.
2. Ask `research-scout` to verify the relevant TRL/OpenEnv/HF docs and current
   papers.
3. Ask `training-planner` for a method sketch, ladder position, and risk list.
4. Ask `trl-implementer` or the main agent to write one minimal script.
5. Ask `script-runner` to run smoke commands and capture failures.
6. Ask `tracking-reporter` to wire Trackio, grep logs, and inspect remote
   artifacts.
7. Ask `integrity-reviewer` to check leakage, eval validity, and result claims.
8. Record the durable lesson in `research/notes.md` or `research/results.tsv`,
   then decide the next harder experiment.

Keep the main thread focused on decisions and final artifacts; delegate noisy
exploration, log inspection, and source lookup to sub-agents when the user asks
for parallel work.

## Terminal-Bench Loop

For recurring Terminal-Bench work, use `docs/terminal-bench-loop.md` as the
control contract. The automation should run as a loop:

`GOAL -> DISCOVER -> PLAN -> EXECUTE -> VERIFY -> ITERATE`

The target is an approximately 2B open model that can exceed 40 on
Terminal-Bench or a clearly identified Terminal-Bench proxy before a full score
is available. If the score gate is not met, the next run must use the recorded
failure mode to choose a materially different rung rather than repeating a
near-duplicate sweep.
