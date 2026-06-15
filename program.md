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
2. Add preference data and reward modeling where comparisons are available.
3. Move to GRPO for verifiable tasks with prompt-only datasets and reward
   functions.
4. Connect GRPO to OpenEnv-style environments for terminal, browser, API, or
   other agentic loops.
5. Distill from successful traces into future SFT or preference datasets.

## Operating Loop

For each challenge:

1. Ask `training-planner` for a method sketch and risk list.
2. Ask `research-scout` to verify the relevant TRL/OpenEnv/HF docs.
3. Ask `trl-implementer` or the main agent to write the minimal script.
4. Ask `script-runner` to run a smoke command and summarize failures.
5. Ask `tracking-reporter` to wire Trackio, grep logs, and inspect remote
   artifacts.
6. Ask `integrity-reviewer` to check leakage, eval validity, and result claims.
7. Record the durable lesson in `research/notes.md` or `research/results.tsv`.

Keep the main thread focused on decisions and final artifacts; delegate noisy
exploration, log inspection, and source lookup to sub-agents when the user asks
for parallel work.
