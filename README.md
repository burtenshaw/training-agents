# Training Agents

Public Codex context for agentic post-training work with TRL.

This repository contains reusable instructions, sub-agent definitions, skills,
and lightweight guides for planning, implementing, reviewing, and monitoring
agent training workflows.

It is not a training codebase. Keep checkpoints, datasets, logs, and experiment
outputs outside the tracked repo, usually under ignored `workspaces/`
directories or separate project repositories.

## Examples

- `examples/sft-mentor-lab/`: small scripts for inspecting SFT datasets, running
  a TRL + LoRA smoke train, and preparing baseline-vs-SFT rubric scoring.
- `examples/gemma4-pi-mono-sft/`: TRL SFT example for
  `google/gemma-4-E2B-it` on `badlogicgames/pi-mono`, with Hugging Face Jobs,
  LoRA, hosted Trackio logging, verified Job IDs, Inspect AI HumanEval/MBPP
  coding evals, and private adapter artifact repos.

## Guides

- `program.md`: operating model for Training Agents.
- `docs/program.md`: staged challenge ladder from SFT to environment GRPO and
  self-distillation.
- `docs/sft-interactive-playbook.html`: standalone interactive SFT course (21
  lessons + capstone) with progress bars, quizzes, labs, Module 7 on tasking
  agentic copilots, and a capstone report builder. Loads `sft-course-lib.js` +
  `sft-course-data.js` from the same folder (`file://` works). Optional
  right-dock copilot when served via the local course copilot gate.
- `tools/course-copilot-gate/README.md`: local gate for the playbook copilot
  (start command, session path, read-only tools, mock mode, cost/latency notes).
- `docs/sft-course-check.mjs`: structural + pure-logic verification for the course.
- `docs/sft-course-e2e.mjs`: Playwright UI e2e (progress, quiz, activity, persistence).
- `docs/looping-rl.md`: blog post on loop-shaped reinforcement learning for
  agent training systems.
- `docs/terminal-bench-loop.md`: loop-shaped automation contract for training
  an approximately 2B open model toward Terminal-Bench performance above 40.
