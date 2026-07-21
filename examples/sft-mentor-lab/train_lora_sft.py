#!/usr/bin/env python3
# /// script
# dependencies = [
#   "accelerate>=1.0.0",
#   "datasets>=3.0.0",
#   "peft>=0.14.0",
#   "torch>=2.4.0",
#   "transformers>=4.53.0",
#   "trl>=0.19.0",
# ]
# ///
"""Minimal TRL SFT + LoRA smoke-training template.

This script is intentionally small and generic for learning. It assumes the
input dataset is already in a TRL-supported SFT format such as `messages`,
`text`, or `prompt`/`completion`.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from datasets import load_dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTConfig, SFTTrainer


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-name", default="Qwen/Qwen2.5-0.5B-Instruct")
    parser.add_argument("--dataset-name", default="trl-lib/Capybara")
    parser.add_argument("--dataset-split", default="train")
    parser.add_argument("--output-dir", default="outputs/sft-mentor-smoke")
    parser.add_argument("--eval-size", type=int, default=64)
    parser.add_argument("--max-steps", type=int, default=5)
    parser.add_argument("--max-seq-length", type=int, default=1024)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--per-device-train-batch-size", type=int, default=1)
    parser.add_argument("--gradient-accumulation-steps", type=int, default=1)
    parser.add_argument("--lora-r", type=int, default=8)
    parser.add_argument("--lora-alpha", type=int, default=16)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    dataset = load_dataset(args.dataset_name, split=args.dataset_split)
    split = dataset.train_test_split(test_size=args.eval_size, seed=args.seed, shuffle=True)

    tokenizer = AutoTokenizer.from_pretrained(args.model_name, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(args.model_name, trust_remote_code=True)

    peft_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
    )

    sft_config = SFTConfig(
        output_dir=str(output_dir),
        max_steps=args.max_steps,
        max_length=args.max_seq_length,
        learning_rate=args.learning_rate,
        per_device_train_batch_size=args.per_device_train_batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        logging_steps=1,
        save_steps=max(1, args.max_steps),
        eval_strategy="steps",
        eval_steps=max(1, args.max_steps),
        report_to="none",
        seed=args.seed,
    )

    trainer = SFTTrainer(
        model=model,
        args=sft_config,
        train_dataset=split["train"],
        eval_dataset=split["test"],
        processing_class=tokenizer,
        peft_config=peft_config,
    )
    trainer.train()
    trainer.save_model(str(output_dir / "final_adapter"))

    prompt = "Explain supervised fine-tuning in one sentence."
    messages = [{"role": "user", "content": prompt}]
    input_ids = tokenizer.apply_chat_template(messages, return_tensors="pt").to(model.device)
    output_ids = model.generate(input_ids, max_new_tokens=64, do_sample=False)
    print(tokenizer.decode(output_ids[0], skip_special_tokens=True))
    print(f"Saved adapter to {output_dir / 'final_adapter'}")


if __name__ == "__main__":
    main()
