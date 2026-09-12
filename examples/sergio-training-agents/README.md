# Sergio Paniego's Training Agents examples

A source-preserving import of the executable examples used in three Training
Agents sessions. The scripts and their upstream READMEs are copied without
functional changes from the Apache-2.0 Hugging Face repositories listed in
[SOURCES.md](SOURCES.md).

## Sessions

- [Class 2 — distillation](class-2-distillation/): GKD training and Inspect AI
  evaluation scripts for pi-mono coding-agent traces.
- [Class 3 — GRPO](class-3-grpo/): minimal, verifiable MBPP, and intentionally
  pathological reward examples.
- [Class 4 — RL environments](class-4-rl-environments/): white-box OpenEnv
  coding and Wordle examples, a held-out evaluator, and the black-box OpenCode
  launcher.

Each directory's `README.md` is the upstream usage guide and is the source of
truth for that session's commands, assumptions, datasets, and expected
hardware. The source snapshots and hashes are recorded in
[SOURCES.md](SOURCES.md).

## Before running anything

These are training and evaluation examples; this repository does not run them
in CI. Read the session README and inspect the script before launching it.
Several commands intentionally submit paid Hugging Face Jobs, use an A100 or
H200, run model-generated code, create logging runs, or publish models. Use
an account and output/model/Trackio IDs that you control; do not submit the
source-owned IDs verbatim. No credentials, checkpoints, datasets, job logs, or
model artifacts are included here.

The scripts rely on the dependencies imported in their source files (notably
`trl`, `transformers`, `datasets`, and, depending on the session, `torch`,
`peft`, `openenv`, `openai`, or a compatible environment package). Upstream
does not provide a lockfile or pinned dependency set, so resolve and test
versions in an isolated environment before attempting a training run.

## Attribution and license

Copyright remains with the original authors. The three upstream repositories
identify their content as Apache-2.0; this import retains that license
provenance. See [SOURCES.md](SOURCES.md) and the repository
[LICENSE](../../LICENSE).
