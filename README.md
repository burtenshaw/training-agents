# Training Agents

Public Codex context for agentic post-training work with TRL.

This repository contains reusable instructions, sub-agent definitions, skills,
lightweight guides, and practical tutorials for planning, implementing,
reviewing, and monitoring agent-training workflows.

It is not a training codebase. Keep checkpoints, datasets, logs, and experiment
outputs outside the tracked repo, usually under ignored `workspaces/`
directories or separate project repositories.

## Tutorials

Follow the four practical [Training Agents tutorials](tutorials/) in order:

1. [SFT on traces](tutorials/01-sft-on-traces/) — Gemma 4 fine-tuning on
   pi-mono coding-agent traces.
2. [Distillation](tutorials/02-distillation/) — off-policy logit KD and
   on-policy GKD.
3. [Reinforcement learning](tutorials/03-reinforcement-learning/) — GRPO with
   minimal, verifiable, and pathological reward examples.
4. [Environments](tutorials/04-environments/) — GRPO with stateful OpenEnv
   coding and Wordle environments, plus an agent-driven harness.

The course index links the session videos and public Session 1 slides. Class
2–4 imports retain their upstream README usage guides and Apache-2.0
provenance, revisions, and hashes in [tutorials/SOURCES.md](tutorials/SOURCES.md).

## Guides

- `program.md`: operating model for Training Agents.
- `docs/program.md`: staged challenge ladder from SFT to environment GRPO and
  self-distillation.
- `docs/looping-rl.md`: blog post on loop-shaped reinforcement learning for
  agent training systems.
- `docs/terminal-bench-loop.md`: loop-shaped automation contract for training
  an approximately 2B open model toward Terminal-Bench performance above 40.
