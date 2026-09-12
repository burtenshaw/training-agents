# Training Agents

Public Codex context for agentic post-training work with TRL.

This repository contains reusable instructions, sub-agent definitions, skills,
and lightweight guides for planning, implementing, reviewing, and monitoring
agent training workflows.

It is not a training codebase. Keep checkpoints, datasets, logs, and experiment
outputs outside the tracked repo, usually under ignored `workspaces/`
directories or separate project repositories.

## Examples

- `examples/gemma4-pi-mono-sft/`: TRL SFT example for
  `google/gemma-4-E2B-it` on `badlogicgames/pi-mono`, with Hugging Face Jobs,
  LoRA, hosted Trackio logging, verified Job IDs, Inspect AI HumanEval/MBPP
  coding evals, and private adapter artifact repos.

## Guides

- `program.md`: operating model for Training Agents.
- `docs/program.md`: staged challenge ladder from SFT to environment GRPO and
  self-distillation.
- `docs/looping-rl.md`: blog post on loop-shaped reinforcement learning for
  agent training systems.
- `docs/terminal-bench-loop.md`: loop-shaped automation contract for training
  an approximately 2B open model toward Terminal-Bench performance above 40.

- `examples/sergio-training-agents/`: source-preserving Apache-2.0 imports of
  Sergio Paniego's Training Agents Class 2 (distillation), Class 3 (GRPO), and
  Class 4 (RL environments) examples, with source revisions and file hashes.
