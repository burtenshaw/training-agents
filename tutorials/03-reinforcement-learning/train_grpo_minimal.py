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
The smallest GRPO run that works, from the TRL quickstart: the reward pushes completions
toward 20 characters. No task, no tests, no labels. The point: GRPO optimizes whatever
number the reward function returns.

Usage:

python train_grpo_minimal.py \
    --model_name_or_path Qwen/Qwen3-0.6B \
    --dataset_name trl-lib/tldr \
    --dtype bfloat16 --bf16 True \
    --use_vllm --vllm_mode colocate --vllm_gpu_memory_utilization 0.3 \
    --num_generations 8 --per_device_train_batch_size 16 \
    --max_completion_length 256 --temperature 0.7 --learning_rate 2e-6 \
    --max_steps 300 --logging_steps 1 --log_completions \
    --output_dir qwen3-0.6b-tldr-lenreward
"""

import os

# The HF Jobs image has no nvcc, so FlashInfer's JIT sampler cannot compile.
os.environ.setdefault("VLLM_USE_FLASHINFER_SAMPLER", "0")

from datasets import load_dataset

from trl import GRPOConfig, GRPOTrainer, ModelConfig, ScriptArguments, TrlParser


def reward_len(completions, **kwargs):
    """Reward completions for being close to 20 characters long. That is all."""
    return [-abs(20 - len(completion[0]["content"])) for completion in completions]


if __name__ == "__main__":
    parser = TrlParser((ScriptArguments, GRPOConfig, ModelConfig))
    script_args, training_args, model_args = parser.parse_args_and_config()

    # Disable Qwen3's thinking mode so the completion is just the answer.
    training_args.chat_template_kwargs = {"enable_thinking": False}

    # Chat format, so completions terminate naturally instead of hitting the length cap.
    dataset = load_dataset(script_args.dataset_name, split=script_args.dataset_train_split)
    dataset = dataset.map(lambda row: {"prompt": [{"role": "user", "content": row["prompt"]}]})

    trainer = GRPOTrainer(
        model=model_args.model_name_or_path,
        reward_funcs=reward_len,
        args=training_args,
        train_dataset=dataset,
    )
    trainer.train()

    trainer.save_model(training_args.output_dir)
