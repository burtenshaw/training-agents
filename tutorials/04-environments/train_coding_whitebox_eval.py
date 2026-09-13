# Copyright 2020-2026 The HuggingFace Team. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# /// script
# dependencies = [
#     "trl",
#     "trackio",
#     "openenv-coding_env @ git+https://huggingface.co/spaces/sergiopaniego/coding-env",
# ]
# ///


"""
Same white-box coding demo as `train_coding_whitebox.py`, plus a fixed held-out eval.

Why this second script exists: the training reward here averages only 4 problems per step, and
MBPP problem difficulty varies far more than the model improves over a run. Its step-to-step
noise is 0.189 while the real effect is +0.10, so the training curve cannot resolve the
learning (measured: +0.088 +- 0.057, t = 1.55). Scoring the same 64 held-out problems every
few steps removes the between-problem variance and the same run shows 0.498 -> 0.615,
t = 4.22. Watch `eval_reward`, not `reward`.

Launch on HF Jobs:

```sh
hf jobs uv run --flavor a100-large --timeout 90m -s HF_TOKEN \
  -e VLLM_USE_FLASHINFER_SAMPLER=0 --with "trl[vllm]" \
  "<resolve URL of this file>" \
  -- --model Qwen/Qwen3-1.7B \
     --env-url https://sergiopaniego-coding-env.hf.space \
     --trackio-space-id sergiopaniego/trackio-training-agents-4-eval-curve
```

The defaults reproduce the verified run: 170 train problems, 42 steps, 9 eval points, ~59 min.

Sizing note: the generation batch (per_device_train_batch_size x gradient_accumulation_steps)
equals the number of live websocket sessions held against the env Space at once, and
`prompts per step = per_device_train_batch_size x gradient_accumulation_steps / num_generations`.
The defaults give 16 sessions and 4 prompts per step. During an eval,
`per_device_eval_batch_size` sessions are held instead.
"""

import argparse
import functools

import openenv.core.env_client as _env_client
from coding_env import CodeAction, CodingEnv
from datasets import concatenate_datasets, load_dataset

from trl import GRPOConfig, GRPOTrainer, RichProgressCallback

# vLLM colocate starves the clients' background event loops during long
# generation stretches, so keepalive pings go unanswered and the websockets
# library closes healthy connections after 20s. Disable client-side pings
# (the env Space runs uvicorn with a relaxed --ws-ping-timeout for its side).
_env_client.ws_connect = functools.partial(_env_client.ws_connect, ping_interval=None)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run GRPO training on MBPP using the OpenEnv coding environment, with a held-out eval curve."
    )
    parser.add_argument(
        "--model",
        type=str,
        default="Qwen/Qwen3-1.7B",
        help="Model identifier passed to GRPOTrainer for fine-tuning.",
    )
    parser.add_argument(
        "--env-url",
        type=str,
        default="https://sergiopaniego-coding-env.hf.space",
        help="URL for the environment server.",
    )
    parser.add_argument(
        "--dataset-size",
        type=int,
        default=170,
        help="Number of MBPP problems to train on (sanitized train + validation + prompt is 170).",
    )
    parser.add_argument(
        "--eval-size",
        type=int,
        default=64,
        help="Problems in the fixed held-out eval set, spread evenly over the sanitized test split.",
    )
    parser.add_argument(
        "--eval-steps",
        type=int,
        default=5,
        help="Score the held-out set every N steps (the run also scores it before step 1).",
    )
    parser.add_argument(
        "--per-device-eval-batch-size",
        type=int,
        default=8,
        help="Eval micro-batch size, in rollouts. Must be divisible by --num-generations-eval.",
    )
    parser.add_argument(
        "--num-generations-eval",
        type=int,
        default=4,
        help="Rollouts per held-out problem. Eval noise is ~0.5/sqrt(eval_size x this).",
    )
    parser.add_argument(
        "--num-generations",
        type=int,
        default=4,
        help="Number of rollout generations per dataset prompt.",
    )
    parser.add_argument(
        "--num-epochs",
        type=int,
        default=1,
        help="Number of training epochs.",
    )
    parser.add_argument(
        "--learning-rate",
        type=float,
        default=1e-6,
        help="Learning rate for GRPO training.",
    )
    parser.add_argument(
        "--gradient-accumulation-steps",
        type=int,
        default=2,
        help="Gradient accumulation steps for GRPO training.",
    )
    parser.add_argument(
        "--per-device-train-batch-size",
        type=int,
        default=8,
        help="Training micro-batch size per device (lower it when raising max completion length).",
    )
    parser.add_argument(
        "--logging-steps",
        type=int,
        default=1,
        help="Frequency of logging steps for GRPO training.",
    )
    parser.add_argument(
        "--max-completion-length",
        type=int,
        default=1024,
        help="Maximum completion length per generation turn.",
    )
    parser.add_argument(
        "--lr-scheduler-type",
        type=str,
        default="linear",
        help="Learning rate scheduler ('constant' keeps the lr alive on short runs).",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Directory where training outputs and checkpoints are stored.",
    )
    parser.add_argument(
        "--trackio-space-id",
        type=str,
        default="coding-grpo",
        help="Trackio space identifier.",
    )
    parser.add_argument(
        "--vllm-mode",
        choices=("colocate", "server"),
        default="colocate",
        help="vLLM execution mode: 'colocate' or 'server'.",
    )
    parser.add_argument(
        "--push-to-hub",
        action="store_true",
        help="Push the trained model to the Hub after training.",
    )
    parser.add_argument(
        "--hub-model-id",
        type=str,
        default=None,
        help="Hub repo for the trained model (e.g. user/qwen3-1.7b-mbpp-grpo).",
    )
    parser.add_argument(
        "--vllm-server-url",
        type=str,
        default="http://localhost:8000",
        help="URL for the vLLM server (only used when --vllm-mode=server).",
    )
    return parser.parse_args()


TASK_TEMPLATE = """You are an expert Python programmer solving a task inside a live Python session.

Rules:
1. Use the tool `run_python` to write and test your code. Variables and functions persist between calls.
2. Define exactly the function the task asks for. The example test shows the expected signature.
3. Hidden tests will run in this same session after you finish, so your final function must be defined and correct.

Task: {task}

Example test: {example_test}
"""


def to_prompts(split):
    return split.map(
        lambda x: {
            "prompt": [
                {
                    "role": "user",
                    "content": TASK_TEMPLATE.format(task=x["prompt"], example_test=x["test_list"][0]),
                }
            ],
            "tests": x["test_list"],
            "test_imports": x["test_imports"],
        },
        remove_columns=split.column_names,
    )


def main() -> None:
    args = parse_args()

    env_url = args.env_url

    class MBPPEnv:
        def __init__(self):
            self.client = None

        def _close_session(self):
            # Closing when the episode is scored keeps the server session count
            # bounded; without this the server accumulates sessions until
            # CAPACITY_REACHED.
            try:
                self.client.close()
            except Exception:
                pass
            self.client = None

        def reset(self, tests=None, test_imports=None, **kwargs) -> None:
            # GRPOTrainer pools env instances and reuses them across generation
            # batches, so a client closed after a scored episode is recreated
            # here. .sync() runs the async client on a dedicated background
            # event loop, so the websocket stays bound to one loop.
            if self.client is None:
                self.client = CodingEnv(base_url=env_url, message_timeout_s=300).sync()
            self.client.reset()
            self._tests = tests or []
            self._test_imports = test_imports or []
            return None

        def run_python(self, code: str) -> str:
            """
            Run Python code in the live session. Variables and functions persist across calls.

            Args:
                code: The Python code to execute.

            Returns:
                The stdout and stderr produced by the code.
            """
            result = self.client.step(CodeAction(code=code))
            output = (result.observation.stdout or "") + (result.observation.stderr or "")
            if not output.strip():
                output = f"(no output, exit_code={result.observation.exit_code})"
            return output[:1000]

        def get_reward(self) -> float:
            # The environment owns the reward: run the hidden tests in the same
            # session where the model defined its function, one step per test,
            # and score the fraction that pass.
            try:
                for imp in self._test_imports:
                    self.client.step(CodeAction(code=imp))
                if not self._tests:
                    return 0.0
                passed = 0
                for test in self._tests:
                    result = self.client.step(CodeAction(code=test))
                    passed += int(result.observation.exit_code == 0)
                return passed / len(self._tests)
            finally:
                self._close_session()

    output_dir = args.output_dir or f"{args.model.split('/')[-1].lower()}-mbpp-grpo"

    # Train on every hand-verified MBPP problem that is not in the eval split: sanitized train
    # (120) + validation (43) + prompt (7) = 170. The eval comes from sanitized test, whose
    # task_ids are disjoint from all three.
    mbpp = concatenate_datasets(
        [
            load_dataset("google-research-datasets/mbpp", "sanitized", split=split)
            for split in ("train", "validation", "prompt")
        ]
    )
    mbpp = mbpp.select(range(min(args.dataset_size, len(mbpp))))
    dataset = to_prompts(mbpp)

    mbpp_test = load_dataset("google-research-datasets/mbpp", "sanitized", split="test").sort("task_id")
    eval_raw = mbpp_test.select(range(0, 4 * args.eval_size, 4))
    eval_dataset = to_prompts(eval_raw)
    overlap = set(mbpp["task_id"]) & set(eval_raw["task_id"])
    print(f"[data] train {len(dataset)} | eval {len(eval_dataset)} held out | task_id overlap {len(overlap)}", flush=True)

    trainer = GRPOTrainer(
        model=args.model,
        train_dataset=dataset,
        eval_dataset=eval_dataset,
        args=GRPOConfig(
            output_dir=output_dir,
            use_vllm=True,
            vllm_mode=args.vllm_mode,
            vllm_server_base_url=args.vllm_server_url if args.vllm_mode == "server" else None,
            report_to="trackio",
            trackio_space_id=args.trackio_space_id,
            log_completions=True,
            num_completions_to_print=2,
            logging_steps=args.logging_steps,
            num_train_epochs=args.num_epochs,
            num_generations=args.num_generations,
            learning_rate=args.learning_rate,
            lr_scheduler_type=args.lr_scheduler_type,
            push_to_hub=args.push_to_hub,
            hub_model_id=args.hub_model_id,
            gradient_accumulation_steps=args.gradient_accumulation_steps,
            per_device_train_batch_size=args.per_device_train_batch_size,
            chat_template_kwargs={"enable_thinking": False},
            max_completion_length=args.max_completion_length,
            eval_strategy="steps",
            eval_steps=args.eval_steps,
            eval_on_start=True,
            per_device_eval_batch_size=args.per_device_eval_batch_size,
            num_generations_eval=args.num_generations_eval,
        ),
        environment_factory=MBPPEnv,
        callbacks=[RichProgressCallback()],
    )
    trainer.train()
    if args.push_to_hub:
        trainer.push_to_hub()


if __name__ == "__main__":
    main()
