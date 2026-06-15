# Script Patterns

## SFT Skeleton

Use `SFTTrainer` with `SFTConfig`, a clear `output_dir`, Trackio reporting for
long runs, and a small eval split when monitoring is enabled.

Critical checks:

- dataset loads
- tokenizer applies the intended chat template
- loss masking matches the dataset type
- one smoke step completes
- model or adapter saves

## GRPO Skeleton

Use `GRPOTrainer` with prompt-only data and a reward function.

Critical checks:

- generated completions parse
- reward function handles malformed completions
- reward variance is non-zero
- group size and max completion length fit memory
- smoke run logs reward metrics

## CLI Configs

Use YAML configs for reproducibility when commands become long. Keep model,
dataset, trainer arguments, tracking, output path, and seed in the config. Use
command-line overrides only for deliberate sweeps.
