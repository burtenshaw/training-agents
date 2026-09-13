---
license: apache-2.0
tags:
  - trl
  - distillation
  - gkd
  - training-agents
datasets:
  - sergiopaniego/pi-mono-chat
---

# Training Agents · Class 2 (Distillation) — training script

Distill a small student from a larger teacher on the [pi-mono](https://huggingface.co/datasets/badlogicgames/pi-mono)
coding-agent traces, using TRL's `GKDTrainer`. **One script spans the whole distillation
spectrum**: `--lmbda` moves you from off-policy (learn from the teacher's data) to on-policy (the
student generates and the teacher scores live), and `--beta` picks the divergence.

- `--lmbda 0` → off-policy · `--lmbda 1` → on-policy
- `--beta 0` → forward-KL · `--beta 0.5` → JSD · `--beta 1` → reverse-KL

Companion to the Training Agents live stream (Class 2). Class 1 (SFT) script:
[`burtenshaw/gemma4-pi-mono-youtube-livestream-1-scripts`](https://huggingface.co/burtenshaw/gemma4-pi-mono-youtube-livestream-1-scripts).

## What it is

`train_gkd.py` is TRL's [`examples/scripts/gkd.py`](https://github.com/huggingface/trl/blob/main/examples/scripts/gkd.py)
with two fixes (upstreamed to TRL) and the `kernels` dependency removed so it runs cleanly on HF
Jobs:

- teacher now receives `device_map`/`quantization_config` under `--load_in_4bit` (was a copy-paste bug),
- `LogCompletionsCallback` is only attached when the eval dataset has a `prompt` column (it crashed
  on conversational `messages` datasets during eval),
- `kernels` removed from the inline deps (a transformers×kernels version skew crashes the import;
  unrelated to distillation).

## Models & data

- **Student:** `Qwen/Qwen3-0.6B`  · **Teacher:** `Qwen/Qwen3-4B`
- Same family → **same `vocab_size` (151936)**, required for white-box logit KD. (Gotcha: not every
  same-family pair matches, e.g. Qwen2.5-0.5B is 151936 but 7B is 152064, and multimodal Gemma-4 /
  Qwen3.5 are `...ForConditionalGeneration`, which `GKDTrainer` does not load as a CausalLM.)
- **Dataset:** [`sergiopaniego/pi-mono-chat`](https://huggingface.co/datasets/sergiopaniego/pi-mono-chat)
  (pi-mono session JSONL converted to `messages`, train/test split).

## Hardware

1× A100 80GB (`a100-large` on HF Jobs). Off-policy runs in a few minutes; on-policy is slower
because the student generates each step.

## Run it (HF Jobs)

Off-policy logit KD and on-policy GKD, three learning rates each, logged to two separate Trackio
Spaces so each method's curves are read on its own dashboard.

On-policy is **generation-bound** (the student generates every step), so it is capped with
`--max_steps` and a smaller `--max_new_tokens` to fit a single A100 hour; off-policy is fast and
runs the full 3 epochs.

```bash
DATA=sergiopaniego/pi-mono-chat
STUDENT=Qwen/Qwen3-0.6B
TEACHER=Qwen/Qwen3-4B

for lr in 1e-5 2e-5 5e-5; do
  tag=${lr//[.-]/}   # 1e-5 -> 1e5

  # Off-policy · logit KD  (lmbda=0, beta=0), 3 epochs
  hf jobs uv run --flavor a100-large --secrets HF_TOKEN -d --timeout 1h train_gkd.py \
    --model_name_or_path $STUDENT --teacher_model_name_or_path $TEACHER --dataset_name $DATA \
    --lmbda 0.0 --beta 0.0 --dtype bfloat16 --bf16 True \
    --learning_rate $lr --per_device_train_batch_size 2 --gradient_accumulation_steps 8 \
    --num_train_epochs 3 --eval_strategy steps --eval_steps 10 --logging_steps 1 \
    --report_to trackio --project off-policy --run_name logit-kd-lr$lr \
    --trackio_space_id sergiopaniego/c2-offpolicy-trackio \
    --output_dir qwen3-0.6b-pimono-logit-kd-lr$tag --push_to_hub \
    --hub_model_id sergiopaniego/qwen3-0.6b-pimono-logit-kd-lr$tag

  # On-policy · GKD  (lmbda=1, beta=0.5), capped at 60 steps / 128 new tokens
  hf jobs uv run --flavor a100-large --secrets HF_TOKEN -d --timeout 1h train_gkd.py \
    --model_name_or_path $STUDENT --teacher_model_name_or_path $TEACHER --dataset_name $DATA \
    --lmbda 1.0 --beta 0.5 --temperature 0.9 --max_new_tokens 128 --dtype bfloat16 --bf16 True \
    --learning_rate $lr --per_device_train_batch_size 2 --gradient_accumulation_steps 8 \
    --max_steps 60 --eval_strategy steps --eval_steps 10 --logging_steps 1 \
    --report_to trackio --project on-policy --run_name gkd-lr$lr \
    --trackio_space_id sergiopaniego/c2-onpolicy-trackio \
    --output_dir qwen3-0.6b-pimono-gkd-lr$tag --push_to_hub \
    --hub_model_id sergiopaniego/qwen3-0.6b-pimono-gkd-lr$tag
done
```

Run locally instead of HF Jobs by dropping `hf jobs uv run --flavor ... --secrets HF_TOKEN -d`
and calling `uv run train_gkd.py ...` (or `python train_gkd.py ...`).

## Dashboards

- **Off-policy** (logit KD, 3 lr): https://huggingface.co/spaces/sergiopaniego/c2-offpolicy-trackio
- **On-policy** (GKD, 3 lr): https://huggingface.co/spaces/sergiopaniego/c2-onpolicy-trackio

The two methods' losses are **not comparable** in absolute value (forward-KL over fixed data vs JSD
over the student's own generations), which is why they live on separate dashboards. Read the
`eval/loss` curves and compare learning rates *within* each method.

## Generated models

Off-policy (logit KD):
- https://huggingface.co/sergiopaniego/qwen3-0.6b-pimono-logit-kd-lr1e5
- https://huggingface.co/sergiopaniego/qwen3-0.6b-pimono-logit-kd-lr2e5
- https://huggingface.co/sergiopaniego/qwen3-0.6b-pimono-logit-kd-lr5e5

On-policy (GKD):
- https://huggingface.co/sergiopaniego/qwen3-0.6b-pimono-gkd-lr1e5
- https://huggingface.co/sergiopaniego/qwen3-0.6b-pimono-gkd-lr2e5
- https://huggingface.co/sergiopaniego/qwen3-0.6b-pimono-gkd-lr5e5

## Gemma variant (off-policy)

`train_gkd_gemma.py` runs the same off-policy logit KD on the Class 1 model family:
student `google/gemma-4-E2B-it` from teacher `google/gemma-4-31B-it` (4-bit). It is a
**separate script** from `train_gkd.py` because Gemma-4 is multimodal
(`Gemma4ForConditionalGeneration`): it instantiates the models and passes the objects to
`GKDTrainer`, and targets the `language_model` submodule with LoRA. **Off-policy only** —
on-policy `generate()` currently crashes on Gemma-4 in `GKDTrainer` (device-side assert),
so use the Qwen script for the on-policy demo.

```bash
for pair in "5e-5:lr5e5" "1e-4:lr1e4" "2e-4:lr2e4"; do
  lr=${pair%%:*}; tag=${pair##*:}
  hf jobs uv run --flavor a100-large --secrets HF_TOKEN -d --timeout 2h train_gkd_gemma.py \
    --student google/gemma-4-E2B-it --teacher google/gemma-4-31B-it --teacher-4bit \
    --lmbda 0 --beta 0 --max-steps 150 --max-length 2048 --learning-rate $lr \
    --run-name offpolicy-$tag \
    --trackio-project c2-gemma-offpolicy --trackio-space-id sergiopaniego/c2-gemma-offpolicy-trackio \
    --push-hub-id sergiopaniego/gemma-4-E2B-offpolicy-kd-$tag
done
```

- **Dashboard:** https://huggingface.co/spaces/sergiopaniego/c2-gemma-offpolicy-trackio
- **Models:** `sergiopaniego/gemma-4-E2B-offpolicy-kd-lr{5e5,1e4,2e4}` (best `eval/loss` at `lr 2e-4`).

The open teacher is a generalist (not a pi-mono specialist), so this is a **mechanism
demo**, not a win over the Class 1 SFT (which learned from a much stronger closed
teacher). Read the `eval/loss` on held-out pi-mono, not an absolute quality claim.

## Evaluation (HumanEval / MBPP)

`eval_inspect.py` evaluates a model on HumanEval / MBPP with [Inspect AI](https://inspect.aisi.org.uk),
served through vLLM.

```bash
# base model or full fine-tune (e.g. a Qwen sweep output)
hf jobs uv run --flavor a100-large --secrets HF_TOKEN -d --timeout 1h eval_inspect.py \
  --base sergiopaniego/qwen3-0.6b-pimono-logit-kd-lr1e5 --tasks humaneval,mbpp
```

Two HF-Jobs quirks the script sets for you: `VLLM_USE_FLASHINFER_SAMPLER=0` (the job image
has no `nvcc` for FlashInfer's JIT sampler) and `--sandbox local` (Inspect's code sandbox
defaults to Docker, unavailable inside a Job). A `--adapter` is merged into `--base` first,
but merging a Gemma-4 adapter drops some `k_norm` weights and vLLM then refuses the
checkpoint, so Gemma off-policy is measured by training `eval/loss` instead.

Qwen retention (pass@1): base HumanEval **0.457** / MBPP **0.395** → off-policy KD **0.427** /
**0.380**. Distillation targets pi-mono, so generic coding drifts slightly; the trained-task
signal is the `eval/loss`, not this table.
