# Agent Instructions

This repository is the Codex context for Training Agents. It is not a training
codebase. Keep it focused on reusable instructions, sub-agents, skills,
challenge guides, and lightweight lab memory for post-training with TRL.

## Core Frame

- Treat "agents" in both senses: Codex agents doing the research work, and
  language models being post-trained for agentic behavior.
- Prefer TRL-native methods and APIs for training plans: SFT, DPO, GRPO, RLOO,
  reward modeling, PEFT/LoRA, Accelerate, Trackio, and Hugging Face Hub/Jobs.
- Optimize for agentic applications: tool calling, environment interaction,
  verifiable rewards, trace quality, task completion, recovery behavior, and
  reliable evaluation.
- Keep challenge work staged from SFT to GRPO, GRPO with environments, and
  self-distillation.

## Repository Boundaries

- Do not add large checkpoints, datasets, generated logs, or full experiment
  outputs to the tracked context repo.
- Put runnable experiments under ignored `workspaces/` directories or in a
  separate challenge repository unless the user explicitly asks to check in a
  minimal template.
- If adding code examples, keep them short, reusable, and clearly marked as
  templates rather than authoritative training artifacts.
- Do not claim a training result without a runnable command, logged output, and
  a clear eval protocol.

## Skills

Use repo-local skills when the task matches them:

- `$trl-post-training`: TRL methods, dataset formats, chat templates, loss
  masking, DPO/GRPO/RLOO/reward trainers, and script structure.
- `$trl-sft`: dedicated SFT workflows for chat, tool-calling, trace imitation,
  assistant-only loss, completion-only loss, and `trl sft` configs.
- `$trackio-observability`: Trackio projects, run naming, logs, metrics, grep,
  SFTP, and artifact inspection.
- `$hugging-face-cli-workflows`: `hf` CLI, Hub repos, Jobs, buckets, auth,
  upload/download, and remote artifacts.
- `$openenv-agentic-rl`: OpenEnv-style environment contracts for agentic RL.
- `$agentic-self-distillation`: trace collection, critique, teacher/student
  loops, rejection sampling, and iterative distillation.

Read the selected skill's `SKILL.md` and only load referenced files needed for
the current task.

## Sub-Agents

Codex sub-agents should be used only when explicitly requested. Available
project agents live in `.codex/agents/`.

Good decompositions:

- `training-planner`: read-only method queue and challenge design.
- `research-scout`: source and docs lookup.
- `trl-implementer`: write one coherent TRL implementation.
- `script-runner`: run commands, capture logs, and summarize failures.
- `tracking-reporter`: Trackio, logs, HF Jobs, SFTP, and artifact status.
- `integrity-reviewer`: leakage, eval, reproducibility, and benchmark review.
- `openenv-builder`: environment protocol and harness work.
- `self-distillation-designer`: distillation loops and teacher/student plans.

For parallel work, ask sub-agents to return compact findings, file references,
commands run, and open risks. Keep write-heavy work to one implementer at a
time to avoid conflicts.

## TRL Defaults

- Start with SFT unless there is already reliable preference data or a verified
  reward signal.
- Use `$trl-sft` for concrete SFT implementation, trace-training, or SFT
  debugging tasks.
- Use conversational datasets for chat and tool-calling work. Check the TRL
  dataset format before choosing trainer arguments.
- Prefer assistant-only or completion-only loss for instruction/chat data when
  the tokenizer chat template supports it.
- Use small smoke runs before long Jobs or multi-GPU runs.
- If `eval_strategy` is enabled, provide an `eval_dataset`; otherwise disable
  evaluation explicitly.
- For remote Hugging Face Jobs training, create or reuse a hosted Trackio
  Space with `trackio.init(..., space_id=...)`, report the dashboard URL, and
  push artifacts to persistent Hub storage. Short local smoke runs may use
  local Trackio logging or document why tracking is skipped.
- Separate reward functions from environment transport. OpenEnv is an
  environment interoperability layer, not the reward definition itself.

## Loop Automations

- For the recurring Terminal-Bench objective, follow
  `docs/terminal-bench-loop.md`.
- Treat recurring work as a stateful loop:
  `GOAL -> DISCOVER -> PLAN -> EXECUTE -> VERIFY -> ITERATE`.
- Start by reading the automation memory and repo research logs, then choose
  the next unblocked rung. Do not rerun a failed or completed variant unless
  the method, model, data, reward, evaluator, or infrastructure has materially
  changed.
- Keep the maker/checker split explicit: implementation and training can be
  done by the main agent or `trl-implementer`, but benchmark claims should be
  reviewed by `integrity-reviewer` and run state should be checked by
  `tracking-reporter` when sub-agents are requested.
- If the Terminal-Bench score does not beat 40, write the failure mode and the
  next loop state before ending the run.

## Reporting

When changing this repo, report the context files changed and the validation
performed. When planning or running experiments, report:

- method and model
- dataset format and split policy
- reward/eval definition
- exact command or Job invocation
- tracking location
- artifact location
- known risks or missing checks
