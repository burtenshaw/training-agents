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
#     "trl[vllm]==1.8.0",
#     "trackio",
# ]
# ///

"""
Reward hacking on purpose: same setup as train_grpo.py, but training on a deliberately
gameable reward (how many python code blocks the completion contains, capped at 4) while
the real tests reward is only logged (weight 0.0). Watch the trained reward climb while
the tests reward collapses.

Usage:

python train_grpo_pathological.py \
    --model_name_or_path Qwen/Qwen3-0.6B \
    --dataset_name google-research-datasets/mbpp --dataset_config full \
    --dtype bfloat16 --bf16 True \
    --use_vllm --vllm_mode colocate --vllm_gpu_memory_utilization 0.3 \
    --num_generations 8 --per_device_train_batch_size 16 \
    --max_completion_length 512 --temperature 0.7 --learning_rate 2e-6 \
    --max_steps 300 --logging_steps 1 --log_completions \
    --output_dir qwen3-0.6b-mbpp-grpo-hacked
"""

import os

# The HF Jobs image has no nvcc, so FlashInfer's JIT sampler cannot compile.
os.environ.setdefault("VLLM_USE_FLASHINFER_SAMPLER", "0")

import re
import subprocess
import sys
import tempfile

from datasets import load_dataset

from trl import GRPOConfig, GRPOTrainer, ModelConfig, ScriptArguments, TrlParser


def extract_code(completion: str) -> str:
    """Take the last ```python ...``` block, or the raw text if there is none."""
    blocks = re.findall(r"```(?:python)?\n(.*?)```", completion, re.DOTALL)
    return blocks[-1] if blocks else completion


def gameable_reward(completions, **kwargs):
    """Number of python code blocks in the completion, capped at 4. Deliberately gameable."""
    rewards = []
    for completion in completions:
        blocks = re.findall(r"```(?:python)?\n.*?```", completion[0]["content"], re.DOTALL)
        rewards.append(min(len(blocks), 4) / 4)
    return rewards


def tests_reward(completions, test_list, test_setup_code, **kwargs):
    """Fraction of the problem's asserts that pass. Logged with weight 0: it does not train."""
    rewards = []
    for completion, tests, setup in zip(completions, test_list, test_setup_code):
        code = extract_code(completion[0]["content"])
        passed = 0
        for test in tests:
            script = f"{code}\n{setup}\n{test}\n"
            with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
                f.write(script)
                path = f.name
            try:
                result = subprocess.run([sys.executable, path], capture_output=True, timeout=10)
                if result.returncode == 0:
                    passed += 1
            except subprocess.TimeoutExpired:
                pass
        rewards.append(passed / len(tests))
    return rewards


def to_prompt(row):
    tests = "\n".join(row["test_list"])
    content = (
        f"{row['text']}\n\n"
        f"Your code should pass these tests:\n```python\n{tests}\n```\n"
        f"Write only the Python function, inside a ```python code block."
    )
    return {"prompt": [{"role": "user", "content": content}]}


if __name__ == "__main__":
    parser = TrlParser((ScriptArguments, GRPOConfig, ModelConfig))
    script_args, training_args, model_args = parser.parse_args_and_config()

    # Disable Qwen3's thinking mode: we want the completion to be just the code.
    training_args.chat_template_kwargs = {"enable_thinking": False}
    # Train ONLY on the gameable reward; the tests reward is logged but has no weight.
    training_args.reward_weights = [1.0, 0.0]

    dataset = load_dataset(script_args.dataset_name, name=script_args.dataset_config)
    dataset = dataset.map(to_prompt)

    trainer = GRPOTrainer(
        model=model_args.model_name_or_path,
        reward_funcs=[gameable_reward, tests_reward],
        args=training_args,
        train_dataset=dataset[script_args.dataset_train_split],
    )
    trainer.train()

    trainer.save_model(training_args.output_dir)
