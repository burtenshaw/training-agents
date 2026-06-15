---
name: trl-sft
description: Use when designing, implementing, reviewing, or debugging supervised fine-tuning with TRL SFTTrainer or `trl sft`, especially for agentic models trained on chat messages, prompt/completion data, tool-calling examples, assistant-only loss, completion-only loss, LoRA/PEFT adapters, Trackio logging, or agent trace datasets such as `julien-c/synthtraces`.
---

# TRL SFT

Use this skill for the first rung of the Training Agents ladder: supervised
fine-tuning models to follow chat formats, use tools, and imitate verified
agent traces.

## Workflow

1. Confirm the target behavior: chat, tool calling, trace imitation, domain
   instruction following, or recovery behavior.
2. Inspect the dataset shape before choosing trainer arguments.
3. Pick loss masking: assistant-only for conversational data when the chat
   template supports it, completion-only for prompt/completion data, full LM
   only when intentional.
4. Start with a smoke run that loads the dataset, tokenizes examples, trains for
   a few steps, evaluates or generates one sample, and saves an artifact.
5. Add Trackio for non-trivial local runs or any remote run.
6. Record the exact model, dataset, split, command, seed, and output path.

## Defaults

- Prefer `SFTTrainer` and `SFTConfig` for Python scripts.
- Prefer `trl sft --config sft_config.yaml` once a command has more than a few
  arguments.
- Use `--dataset_name` in TRL CLI examples; the current TRL docs use underscore
  argument names.
- Use LoRA/PEFT for fast challenge iteration unless full fine-tuning is the
  explicit goal.
- If `eval_strategy` is enabled, provide an `eval_dataset`.
- Keep generated checkpoints, processed datasets, and logs out of this context
  repository.

## Agent Trace Training

Agent traces can become SFT data when they are reviewed, redacted, filtered, and
converted into teachable message sequences. Do not train directly on raw private
traces without checking for secrets, personal data, private code, and tool output
that should not be learned.

Minimal trace-dataset command pattern:

```bash
trl sft \
  --model_name_or_path Qwen/Qwen2.5-0.5B \
  --dataset_name julien-c/synthtraces \
  --output_dir outputs/sft-synthtraces-smoke
```

Treat this as a starting point, not a final recipe. Inspect the dataset columns
and write a formatting function or preprocessing step if the raw trace rows are
not already in a TRL-supported SFT format.

## References

- `references/sft-dataset-formats.md`: SFT dataset shapes and masking choices.
- `references/tool-calling-sft.md`: tool-call examples and schema checks.
- `references/trace-sft.md`: training on Hub agent traces and synthtraces.
- `references/sft-commands.md`: CLI and config patterns.
