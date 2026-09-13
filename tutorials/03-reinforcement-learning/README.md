---
license: apache-2.0
tags:
  - trl
  - grpo
  - reinforcement-learning
  - training-agents
datasets:
  - google-research-datasets/mbpp
  - trl-lib/tldr
---

# Training Agents · Class 3 (GRPO) — training scripts

Three GRPO runs that build on each other, from the Training Agents live stream (Class 3).
Same trainer, same model, three rewards:

1. **`train_grpo_minimal.py`** — the smallest run that works, from the
   [TRL quickstart](https://huggingface.co/docs/trl/grpo_trainer): reward = be close to
   20 characters long. No task, no labels. GRPO optimizes whatever number you return, and
   the `completions/mean_length` curve shows it converging within a few steps.
2. **`train_grpo.py`** — a **verifiable reward**: the model writes a Python function for an
   [MBPP](https://huggingface.co/datasets/google-research-datasets/mbpp) problem, the reward
   executes the problem's own asserts, reward = fraction that pass. The knob to play with is
   `--num_generations` (the group size).
3. **`train_grpo_pathological.py`** — **reward hacking on purpose**: trains on a deliberately
   gameable reward (count the code blocks, run nothing) while logging the real tests reward
   with weight 0. The trained reward saturates, the tests reward collapses, completion length
   pins at the maximum: reward hacking, length gaming and collapse on one dashboard.

Class 1 (SFT) scripts: [`burtenshaw/gemma4-pi-mono-youtube-livestream-1-scripts`](https://huggingface.co/burtenshaw/gemma4-pi-mono-youtube-livestream-1-scripts) ·
Class 2 (distillation) scripts: [`sergiopaniego/pi-mono-youtube-livestream-2-scripts`](https://huggingface.co/sergiopaniego/pi-mono-youtube-livestream-2-scripts)

## Model & data

- **Model:** `Qwen/Qwen3-0.6B` (thinking mode disabled: the completion is just the code)
- **Data:** MBPP `full` (374 train problems, each with 3 asserts) for 2 and 3; `trl-lib/tldr`
  prompts for 1. GRPO only needs prompts: the reward function replaces the labels.
- Before training we checked the task gives signal: with k=4 samples at temperature 0.7 the
  base model gets mean reward 0.22 and half the prompt groups have **mixed** rewards. Mixed
  groups are the signal: if the whole group scores the same, the advantage is 0 and the step
  teaches nothing. You want the task at the edge of the model's ability.

## Run it (HF Jobs)

One A100 (`a100-large`), ~20 minutes per run.

```bash
# 1. Minimal: reward = be close to 20 characters
hf jobs uv run --flavor a100-large --secrets HF_TOKEN -d --timeout 1h train_grpo_minimal.py \
  --model_name_or_path Qwen/Qwen3-0.6B --dataset_name trl-lib/tldr \
  --dtype bfloat16 --bf16 True \
  --use_vllm --vllm_mode colocate --vllm_gpu_memory_utilization 0.3 \
  --num_generations 8 --per_device_train_batch_size 16 \
  --max_completion_length 256 --temperature 0.7 --learning_rate 2e-6 \
  --max_steps 300 --logging_steps 1 --log_completions \
  --report_to trackio --project minimal --run_name reward-len \
  --trackio_space_id sergiopaniego/trackio-training-agents-3 \
  --output_dir qwen3-0.6b-tldr-lenreward

# 2. Verifiable: sweep the group size
for k in 2 8 16; do
hf jobs uv run --flavor a100-large --secrets HF_TOKEN -d --timeout 2h train_grpo.py \
  --model_name_or_path Qwen/Qwen3-0.6B \
  --dataset_name google-research-datasets/mbpp --dataset_config full \
  --dtype bfloat16 --bf16 True \
  --use_vllm --vllm_mode colocate --vllm_gpu_memory_utilization 0.3 \
  --num_generations $k --per_device_train_batch_size 16 \
  --max_completion_length 512 --temperature 0.7 --learning_rate 2e-6 \
  --max_steps 300 --logging_steps 1 --log_completions \
  --report_to trackio --project grpo-sweep --run_name grpo-k$k \
  --trackio_space_id sergiopaniego/trackio-training-agents-3 \
  --output_dir qwen3-0.6b-mbpp-grpo-k$k --push_to_hub \
  --hub_model_id sergiopaniego/qwen3-0.6b-mbpp-grpo-k$k
done

# 3. Pathological: reward hacking on purpose
hf jobs uv run --flavor a100-large --secrets HF_TOKEN -d --timeout 2h train_grpo_pathological.py \
  --model_name_or_path Qwen/Qwen3-0.6B \
  --dataset_name google-research-datasets/mbpp --dataset_config full \
  --dtype bfloat16 --bf16 True \
  --use_vllm --vllm_mode colocate --vllm_gpu_memory_utilization 0.3 \
  --num_generations 8 --per_device_train_batch_size 16 \
  --max_completion_length 512 --temperature 0.7 --learning_rate 2e-6 \
  --max_steps 300 --logging_steps 1 --log_completions \
  --report_to trackio --project pathological --run_name hacked-reward \
  --trackio_space_id sergiopaniego/trackio-training-agents-3 \
  --output_dir qwen3-0.6b-mbpp-grpo-hacked
```

Run locally by dropping `hf jobs uv run --flavor ... --secrets HF_TOKEN -d --timeout ...` and
calling `uv run <script> ...`.

## Dashboard

One Trackio Space for the class, one project per run type (pick it in the project selector):
https://huggingface.co/spaces/sergiopaniego/trackio-training-agents-3

- `minimal` — the 20-characters reward
- `grpo-sweep` — the verifiable reward, k = 2 / 8 / 16
- `pathological` — the gameable reward

## What the sweep showed (300 steps, small illustrative runs)

| num_generations | reward (start → end) | groups with no variance |
|---|---|---|
| 2 | 0.41 → 0.58 | ~75% |
| 8 | 0.41 → **0.67** | ~40% |
| 16 | 0.39 → 0.61 | ~30% |

The group is the baseline, so the group size controls how many steps actually teach
something. But bigger is not free: with a fixed batch, more generations per prompt means
fewer distinct prompts per step (k=16 sees 1 prompt per step, k=2 sees 8).

Models: [`qwen3-0.6b-mbpp-grpo-k2`](https://huggingface.co/sergiopaniego/qwen3-0.6b-mbpp-grpo-k2) ·
[`k8`](https://huggingface.co/sergiopaniego/qwen3-0.6b-mbpp-grpo-k8) ·
[`k16`](https://huggingface.co/sergiopaniego/qwen3-0.6b-mbpp-grpo-k16)

## A note on executing generated code

`tests_reward` runs model-generated code in a plain subprocess with a timeout, with no
sandbox. Inside a disposable job container this is acceptable for a demo, but the container
still holds your `HF_TOKEN`: beyond a demo, run rewards in a real sandbox. The natural fit is
[Hugging Face Sandboxes](https://huggingface.co/docs/huggingface_hub/guides/sandbox), isolated
machines built on the same Jobs infrastructure, made for exactly this ("running untrusted or
AI-generated code"), with `SandboxPool` for fanning out RL rollouts:

```python
from huggingface_hub import Sandbox

with Sandbox.create() as sbx:
    result = sbx.run(["python", test_file], timeout=10)
```

E2B is the equivalent third-party option (it is what Open R1 uses for its code rewards).
