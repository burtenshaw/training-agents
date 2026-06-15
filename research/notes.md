# Research Notes

Use this file for durable lessons about Training Agents challenge design.

Suggested entry format:

```md
## YYYY-MM-DD - Short Title

- Challenge:
- Method:
- Model:
- Dataset:
- Reward/eval:
- What worked:
- What failed:
- Next:
```

## 2026-06-15 - Gemma 4 Pi-Mono SFT Sweep

- Challenge: SFT a small Gemma 4 instruction model on public coding-agent traces.
- Method: TRL `SFTTrainer`, prompt/completion conversion, completion-only loss,
  PEFT LoRA, 4-bit loading, hosted Trackio logging, and HF Jobs on `l40sx1`.
- Model: `google/gemma-4-E2B-it`.
- Dataset: `badlogicgames/pi-mono`, raw JSONL sessions converted locally inside
  the Job runner.
- Reward/eval: held-out eval loss and mean token accuracy on 256 converted
  examples; no task-completion eval yet.
- What worked: hosted Trackio Space creation with `space_id`, local script
  upload through `hf jobs uv run`, and Gemma 4 language decoder LoRA targets.
- What failed: broad LoRA suffixes targeted unsupported Gemma 4 wrapper modules;
  targeting `model.language_model.layers.*` projections fixed it.
- Next: add a task-level eval harness before treating the best adapter as an
  agent-quality improvement.
