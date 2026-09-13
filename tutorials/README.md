# Training Agents tutorials

Four practical sessions for training agents with traces, distillation,
reinforcement learning, and environments. Follow them in order: each class
builds on the training signal introduced by the previous one.

## Learning order

1. [01 — SFT on traces](01-sft-on-traces/) — fine-tune Gemma 4 on pi-mono
   coding-agent traces with completion-only loss. [Session video](https://www.youtube.com/watch?v=rNgUoH7Wbv8)
   · [public slides](https://docs.google.com/presentation/d/1hcGZ4U9TjZZzcGNbH2K6wYD45qwZTyo_gosCQsnHlnc/edit)
2. [02 — Distillation](02-distillation/) — train a smaller policy against a
   teacher with off-policy logit KD and on-policy GKD. [Session video](https://www.youtube.com/watch?v=distillGZT_oNQnLV4)
3. [03 — Reinforcement learning](03-reinforcement-learning/) — introduce
   GRPO through minimal, verifiable, and deliberately pathological rewards.
   [Session video](https://www.youtube.com/watch?v=RLztdTed5egrM)
4. [04 — Environments](04-environments/) — connect GRPO to stateful OpenEnv
   environments for white-box and agent-driven rollouts. [Session video](https://www.youtube.com/watch?v=envnJV3yUuz6DU)

## Requirements and usage

Read the README in the tutorial directory before running any command; it is
the source of truth for that session's dependencies, hardware, datasets,
commands, and safety notes. The runnable scripts use the dependencies they
import, including TRL, Transformers, Datasets, and session-specific packages.
The imported Class 2–4 guides do not provide a lockfile, so use an isolated
environment and resolve compatible versions before a real run.

These tutorials are not CI jobs. Their example commands can submit paid Hugging
Face Jobs, use GPUs, execute model-generated code, create tracking runs, or
publish model artifacts. Do not run source-owned output IDs; use an account and
outputs you control. No credentials, datasets, checkpoints, logs, or artifacts
are included.

- Start with [SFT usage](01-sft-on-traces/README.md#local-smoke).
- Then use the upstream [distillation](02-distillation/README.md),
  [reinforcement-learning](03-reinforcement-learning/README.md), and
  [environments](04-environments/README.md) guides.
- See [SOURCES.md](SOURCES.md) for Apache-2.0 provenance, immutable source
  revisions, and SHA-256 hashes for all 11 imported Sergio scripts.
