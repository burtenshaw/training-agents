# Gemma 4 E2B Pi-Mono SFT

Reusable SFT example for fine-tuning `google/gemma-4-E2B-it` on
`badlogicgames/pi-mono` coding-agent traces with TRL, PEFT LoRA, Hugging Face
Jobs, and a hosted Trackio dashboard.

This example is intentionally lightweight: it checks in the runnable script and
commands, not datasets, checkpoints, logs, or generated outputs.

## What It Does

- downloads raw `*.jsonl` traces from `badlogicgames/pi-mono`
- converts visible user, assistant, tool-call, and tool-result turns into
  prompt/completion rows
- excludes hidden reasoning by default
- omits images as `[image omitted]`
- trains with TRL `SFTTrainer` and completion-only loss
- applies LoRA only to Gemma 4 language decoder projections
- logs remote runs to Trackio Space `burtenshaw/pi-mono-sft-trackio`
- pushes adapters to private Hub model repos

## Files

- `train_sft.py`: PEP 723 UV script for local smoke runs and HF Jobs.

## Local Smoke

```bash
uv run examples/gemma4-pi-mono-sft/train_sft.py \
  --model-id google/gemma-4-E2B-it \
  --dataset-id badlogicgames/pi-mono \
  --max-examples 512 \
  --eval-size 32 \
  --max-length 2048 \
  --max-steps 1 \
  --gradient-accumulation-steps 1 \
  --logging-steps 1 \
  --eval-steps 1 \
  --save-steps 1 \
  --trackio-project training-agents-sft \
  --trackio-space-id burtenshaw/pi-mono-sft-trackio \
  --trackio-group pi-mono-sft-smoke \
  --run-name gemma4-e2b-pi-mono-smoke-targets
```

## HF Jobs Sweep

Use `hf auth whoami` first, then pass the local token by name with
`--secrets HF_TOKEN`. Do not print token values.

Baseline command:

```bash
hf jobs uv run \
  --flavor l40sx1 \
  --timeout 3h \
  -d \
  --secrets HF_TOKEN \
  --env HF_HUB_ENABLE_HF_TRANSFER=1 \
  --label project=pi-mono-sft \
  --label sweep=trackio-v1 \
  --label kind=sweep \
  --label variant=lr2e4-r16-len4k \
  examples/gemma4-pi-mono-sft/train_sft.py \
  --model-id google/gemma-4-E2B-it \
  --dataset-id badlogicgames/pi-mono \
  --output-dir outputs/gemma4-e2b-pi-mono-lr2e4-r16-len4k \
  --hub-model-id burtenshaw/gemma-4-E2B-it-pi-mono-lora-lr2e4-r16-len4k \
  --push-to-hub \
  --hub-private-repo \
  --max-length 4096 \
  --max-steps 200 \
  --learning-rate 2e-4 \
  --lora-r 16 \
  --lora-alpha 32 \
  --lora-dropout 0.05 \
  --gradient-accumulation-steps 16 \
  --per-device-train-batch-size 1 \
  --per-device-eval-batch-size 1 \
  --eval-size 256 \
  --logging-steps 5 \
  --eval-steps 50 \
  --save-steps 100 \
  --trackio-project training-agents-sft \
  --trackio-space-id burtenshaw/pi-mono-sft-trackio \
  --trackio-group pi-mono-sft-sweep-20260612-trackio \
  --run-name gemma4-e2b-pi-mono-sft-lr2e4-r16-len4k
```

Sweep variants:

| Variant | Learning rate | LoRA r/alpha | Hub model repo |
| --- | ---: | ---: | --- |
| `lr2e4-r16-len4k` | `2e-4` | `16/32` | `burtenshaw/gemma-4-E2B-it-pi-mono-lora-lr2e4-r16-len4k` |
| `lr1e4-r16-len4k` | `1e-4` | `16/32` | `burtenshaw/gemma-4-E2B-it-pi-mono-lora-lr1e4-r16-len4k` |
| `lr2e4-r8-len4k` | `2e-4` | `8/16` | `burtenshaw/gemma-4-E2B-it-pi-mono-lora-lr2e4-r8-len4k` |

## Verified Run Record

Dashboard: https://huggingface.co/spaces/burtenshaw/pi-mono-sft-trackio

Smoke Job:

- `6a2bec397c68f455eff13786`: completed 1 training step and verified 205
  Gemma 4 language decoder LoRA targets.

Sweep Jobs, verified completed on 2026-06-15:

| Job | Variant | Train loss | Final eval loss | Final eval token accuracy | Runtime |
| --- | --- | ---: | ---: | ---: | ---: |
| `6a2becfe7c68f455eff13796` | `lr2e4-r16-len4k` | `0.6465` | `0.5506` | `0.8624` | `3897s` |
| `6a2becfe7c68f455eff13798` | `lr1e4-r16-len4k` | `0.6914` | `0.5805` | `0.8585` | `3919s` |
| `6a2becfe871c005b5352b1cd` | `lr2e4-r8-len4k` | `0.6731` | `0.5648` | `0.8594` | `3880s` |

Dataset conversion for the 4k sweep:

- raw files: 627
- message events: 33,879
- assistant examples before length filtering: 15,251
- kept after `max_length=4096`: 6,727
- train/eval split: 6,471 / 256 with seed 42
- reasoning parts ignored: 12,451
- image parts omitted: 48

## Known Limits

- Metrics are held-out prompt/completion loss and token accuracy, not a
  task-completion benchmark.
- Raw traces should still be audited for secrets, private code, and policy
  concerns before treating this as a production recipe.
- Overlength filtering drops many long-context examples at 4k.
- The adapters are private Hub repos by default.
