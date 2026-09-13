---
license: apache-2.0
---

# Training Agents · Class 4 · RL Environments · scripts

Everything we ran in [Class 4](https://www.youtube.com/live/nJV3yUuz6DU) of the
[Training Agents series](https://www.youtube.com/playlist?list=PLo2EIpI_JMQvQZm-kVlz4wY1vWF0LBcf5),
on training coding agents inside RL environments with [TRL](https://github.com/huggingface/trl)
and [OpenEnv](https://github.com/huggingface/OpenEnv).

Two demos, one per way of connecting an agent to a trainer.

| | Demo | Who drives the loop | Script |
|---|---|---|---|
| 1 | White box, MBPP in a live Python session | the trainer | `train_coding_whitebox.py` |
| 2 | Black box, the opencode agent in remote sandboxes | the agent | `launcher.py` |

Demo 1 also ships a variant, `train_coding_whitebox_eval.py`, that adds a fixed held-out eval
curve. If you want to see the model improve while it trains, start there and read
[Reading the reward curve](#reading-the-reward-curve).

## Demo 1 · White box: MBPP with `environment_factory`

The model solves MBPP problems inside a live Python session served by an OpenEnv Space. The
`run_python` tool executes code in that session and state persists across calls, so the model
can define a function, test it, and fix it. The environment owns the reward: `get_reward` runs
the task's hidden tests in the same session and returns the fraction that pass, which is why
there are no `reward_funcs` in the script. `GRPOTrainer` picks `get_reward` up on its own.

```sh
hf jobs uv run --flavor a100-large --timeout 3h -s HF_TOKEN \
  -e VLLM_USE_FLASHINFER_SAMPLER=0 --with "trl[vllm]" \
  "https://huggingface.co/sergiopaniego/rl-envs-youtube-livestream-4-scripts/resolve/main/train_coding_whitebox.py" \
  -- --model Qwen/Qwen3-1.7B \
     --env-url https://sergiopaniego-coding-env.hf.space \
     --trackio-space-id sergiopaniego/trackio-training-agents-4 \
     --push-to-hub --hub-model-id sergiopaniego/qwen3-1.7b-mbpp-grpo
```

- Environment Space: [coding-env](https://huggingface.co/spaces/sergiopaniego/coding-env)
- Dashboard: [trackio-training-agents-4](https://huggingface.co/spaces/sergiopaniego/trackio-training-agents-4),
  one run, `mbpp-grpo`: the same run that produced the model below and the eval numbers in this
  README, so the weights, the curve and the score all come from one measurement
- Trained model: [qwen3-1.7b-mbpp-grpo](https://huggingface.co/sergiopaniego/qwen3-1.7b-mbpp-grpo)

### Held-out eval

`eval_coding_whitebox.py` scores models on the MBPP sanitized **test** split, which never
appears in training, using the same prompt, the same `run_python` loop and the same env-side
scoring as training. It serves each model with vLLM in turn and reports one mean score per
model, so the comparison is a single clean number.

```sh
python eval_coding_whitebox.py \
  --models Qwen/Qwen3-1.7B sergiopaniego/qwen3-1.7b-mbpp-grpo \
  --num-problems 257
```

Result, fraction of hidden tests passed on 257 unseen problems, both models scored in the same
pass so the difference is not comparing across eval runs:

| Model | Score |
|---|---|
| Qwen3-1.7B (base) | 0.518 |
| qwen3-1.7b-mbpp-grpo | 0.582 |

Defaults worth knowing: `--num-problems 257`, `--temperature 1.0` (same as the training
rollouts), `--max-turns 6`, `--concurrency 16`.

### Reading the reward curve

If you open the dashboard above, the training `reward` looks flat. That is real, and it is not
a training failure: it is the wrong instrument for the question.

Each GRPO step here scores only a handful of MBPP problems, and problem difficulty varies far
more than the model improves over one run. So the step-to-step swing measures which problems
were drawn, not how good the model is. Measured on the 42-step run: step-to-step noise 0.213
against a real effect of about +0.06, which means the training curve has no power to resolve
it. Scoring the same held-out problems every few steps removes that term entirely.

`train_coding_whitebox_eval.py` is the same script plus a fixed `eval_dataset` of 64 problems
from the sanitized **test** split (disjoint `task_id`s from training, checked at startup). It
logs `eval/reward`, `eval/frac_reward_zero_std`, `eval/tools/call_frequency` and friends (the
job log prints the same metrics with underscores, as `eval_reward`).

```sh
hf jobs uv run --flavor a100-large --timeout 90m -s HF_TOKEN \
  -e VLLM_USE_FLASHINFER_SAMPLER=0 --with "trl[vllm]" \
  "https://huggingface.co/sergiopaniego/rl-envs-youtube-livestream-4-scripts/resolve/main/train_coding_whitebox_eval.py" \
  -- --model Qwen/Qwen3-1.7B \
     --env-url https://sergiopaniego-coding-env.hf.space \
     --trackio-space-id sergiopaniego/trackio-training-agents-4
```

The same run, measured both ways, both curves on the dashboard above:

| Instrument | Points | Rise | t |
|---|---|---|---|
| `train/reward` | 42 | +0.092 ± 0.065 | 1.41, not significant |
| `eval/reward`, 64 fixed held-out problems | 10 | 0.541 → 0.635 | 5.18 |

Same run, same GPU, same weights. The +0.095 measured on the held-out curve is consistent with the
+0.064 of the 257-problem table above, which is the cross-check worth having: two different
held-out sets, two different code paths, same answer. Step-to-step noise on `train/reward` is 0.213
and eval noise is about 0.027 per point, so do not read individual bumps, read the slope.

Defaults reproduce that run exactly: 170 train problems, 42 steps, 10 eval points, about 60
minutes on one A100. Each eval adds about 3.7 minutes.

Two runs of this same config gave held-out rises of +0.095 and +0.118, both at t ~ 5.2, and
257-problem deltas of +0.064 and +0.100. The rise reproduces, its size moves by about a third
between runs. Worth knowing before you read one run's number as the number.

### Sizing gotcha

The generation batch (`per_device_train_batch_size` x `gradient_accumulation_steps`) equals the
number of live websocket sessions held against the env Space at the same time, and it also
sets how many problems each step sees:

```
prompts per step = per_device_train_batch_size x gradient_accumulation_steps / num_generations
```

`train_coding_whitebox.py`'s defaults (8 x 8, 4 generations) give 64 sessions and 16 prompts
per step. `train_coding_whitebox_eval.py`'s defaults (8 x 2) give 16 sessions and 4 prompts
per step, which is what the published numbers were produced with. Keep the generation batch
modest or the Space runs out of sessions. During an eval, `per_device_eval_batch_size`
sessions are held instead.

Two more things that cost us runs:

- `--dataset-size` defaults to **120**. If you want the full 170 hand-verified problems, pass
  it explicitly. Silently training on 120 changes the step count and breaks comparability.
- `hf jobs logs <id>` without `--tail` returns the **start** of the log and truncates the rest,
  so a finished run can look like it died early. Use `hf jobs logs --tail 4000 <id>`.

### What the dataset can actually give you

Running MBPP's own reference solutions inside this environment's sandbox, 156 of the 170
training problems pass all their tests and **14 are impossible**, so the ceiling is **0.918**,
not 1.0. Eleven fail because the env builds its executor with an empty import allowlist
(`heapq`, `bisect`, `operator`, `cmath`, `sys`), three for interpreter limitations (a solution
that binds `sum` as a variable, one `yield from`).

Also worth knowing when you read the reward: the "Example test" shown in the prompt is
`test_list[0]`, and `test_list[0]` is one of the roughly 3.2 tests that get scored, in all 170
problems. So about **32%** of the reward is a test the model was handed.

## Demo 2 · Black box: the opencode harness in HF sandboxes

Here the agent owns its loop. `opencode` runs untouched in its own remote Hugging Face sandbox,
one per rollout, and an in-sandbox proxy forwards its model calls to vLLM while capturing the
exact `(token_ids, logprobs)` of every call. TRL reads that trace, rebuilds the training rows,
scores the workspace with a held-out verifier and trains with async GRPO. TRL never calls
`step()`.

The trainer needs a vLLM the remote sandboxes can reach, and HF Jobs takes one script per job,
so `launcher.py` wraps the three pieces into a single job: vLLM on GPU 0, a cloudflared tunnel
so the sandboxes can reach it, and the trainer on GPU 1.

```sh
MODEL=Qwen/Qwen3-8B \
MAX_STEPS=10 \
TRACKIO_SPACE_ID=sergiopaniego/opencode-hf-sandbox \
HUB_MODEL_ID=sergiopaniego/Qwen3-8B-opencode-deepcoder-grpo \
hf jobs uv run --flavor h200x2 --secrets HF_TOKEN --timeout 7200s launcher.py
```

All configuration is environment variables: `MODEL` (default `Qwen/Qwen3-8B`), `N_PROMPTS`
(default 32), `MAX_STEPS` (default 10), `HUB_MODEL_ID`, `TRACKIO_SPACE_ID`. The 8B policy is
full fine-tuned on a single trainer GPU with an 8-bit optimizer and gradient checkpointing.

- Task data: [DeepCoder-Preview-Dataset](https://huggingface.co/datasets/agentica-org/DeepCoder-Preview-Dataset)
- Training script (maintained upstream in TRL): [examples/async_grpo_opencode/opencode_hf_sandbox.py](https://github.com/huggingface/trl/blob/main/examples/async_grpo_opencode/opencode_hf_sandbox.py)
- Local-subprocess variant of the same path: [examples/async_grpo_opencode/async_grpo_opencode.py](https://github.com/huggingface/trl/blob/main/examples/async_grpo_opencode/async_grpo_opencode.py)
- Dashboard: [opencode-hf-sandbox](https://huggingface.co/spaces/sergiopaniego/opencode-hf-sandbox)
- Trained model: [Qwen3-8B-opencode-deepcoder-grpo](https://huggingface.co/sergiopaniego/Qwen3-8B-opencode-deepcoder-grpo)
- Write-up: [Training a coding agent using the OpenCode harness](https://huggingface.co/blog/sergiopaniego/trl-openenv-harness-training)

Reward in class, fraction of hidden test cases passed, climbed from about 0.27 to about 0.71
over 10 steps.

`launcher.py` downloads the training script from TRL `main` at run time, so a file move upstream
breaks it silently. If you are reproducing this months from now and the download fails, check
the path above.

## Extra · Wordle, not shown in class

`train_wordle_whitebox.py` is the same white-box hookup against a text game instead of a coding
task, useful if you want the simplest possible environment.

```sh
hf jobs uv run --flavor a100-large --timeout 3h -s HF_TOKEN \
  -e VLLM_USE_FLASHINFER_SAMPLER=0 --with "trl[vllm]" \
  "https://huggingface.co/sergiopaniego/rl-envs-youtube-livestream-4-scripts/resolve/main/train_wordle_whitebox.py" \
  -- --model Qwen/Qwen3-1.7B \
     --env-url https://sergiopaniego-wordle-env.hf.space \
     --trackio-space-id sergiopaniego/trackio-training-agents-4 \
     --dataset-size 2000 \
     --push-to-hub --hub-model-id sergiopaniego/qwen3-1.7b-wordle-grpo
```

- Environment Space: [wordle-env](https://huggingface.co/spaces/sergiopaniego/wordle-env), a
  duplicate of `openenv/wordle` with `max_concurrent_envs=8`, because the public one caps at one
  session
- Trained model: [qwen3-1.7b-wordle-grpo](https://huggingface.co/sergiopaniego/qwen3-1.7b-wordle-grpo)
