# /// script
# dependencies = [
#     "trl[peft]",
#     "bitsandbytes",
#     "trackio",
# ]
# ///

"""Training Agents · Class 2 — Gemma off-policy distillation.

Separate from `train_gkd.py` (the Qwen script) because Gemma-4 is multimodal
(`Gemma4ForConditionalGeneration`): we instantiate the student and teacher ourselves
and pass the objects to `GKDTrainer` (its string path assumes a plain CausalLM), and we
target the `language_model` submodule with LoRA.

Off-policy only (`--lmbda 0`). On-policy (`--lmbda 1`) currently crashes on Gemma-4 in
`GKDTrainer`: `generate()` hits a device-side assert (the model's generation_config
leaks into the sampler, and the multimodal generate path returns logits the sampler
does not handle). Use the Qwen script for the on-policy demo.
"""

import argparse

import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import LoraConfig

from trl.experimental.gkd import GKDConfig, GKDTrainer


# Gemma-4 language-decoder LoRA targets (matches the language_model submodule inside the
# multimodal wrapper; same modules as the Class 1 SFT).
LORA_TARGET_REGEX = (
    r".*language_model\.layers\.\d+\."
    r"(self_attn\.(q_proj|k_proj|v_proj|o_proj)|mlp\.(gate_proj|up_proj|down_proj))$"
)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--student", default="google/gemma-4-E2B-it")
    p.add_argument("--teacher", default="google/gemma-4-31B-it")
    p.add_argument("--dataset", default="sergiopaniego/pi-mono-chat")
    p.add_argument("--train-split", default="train")
    p.add_argument("--eval-split", default="test")
    p.add_argument("--lmbda", type=float, default=0.0)
    p.add_argument("--beta", type=float, default=0.0)
    p.add_argument("--max-steps", type=int, default=150)
    p.add_argument("--max-length", type=int, default=2048)
    p.add_argument("--learning-rate", type=float, default=2e-4)
    p.add_argument("--grad-accum", type=int, default=1)
    p.add_argument("--teacher-4bit", action="store_true")
    p.add_argument("--run-name", default="offpolicy")
    p.add_argument("--trackio-project", default=None)
    p.add_argument("--trackio-space-id", default=None)
    p.add_argument("--output-dir", default="outputs/gemma-offpolicy")
    p.add_argument("--push-hub-id", default=None)
    args = p.parse_args()

    tokenizer = AutoTokenizer.from_pretrained(args.student, padding_side="left")
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # AutoModelForCausalLM resolves the multimodal Gemma-4 checkpoint; we pass the
    # instantiated objects (not strings) so GKDTrainer skips its CausalLM-only loader.
    student = AutoModelForCausalLM.from_pretrained(args.student, dtype=torch.bfloat16)

    teacher_kwargs = dict(dtype=torch.bfloat16)
    if args.teacher_4bit:
        teacher_kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_compute_dtype=torch.bfloat16
        )
        teacher_kwargs["device_map"] = "auto"
    teacher = AutoModelForCausalLM.from_pretrained(args.teacher, **teacher_kwargs).eval()

    train_dataset = load_dataset(args.dataset, split=args.train_split)
    eval_dataset = load_dataset(args.dataset, split=args.eval_split) if args.eval_split else None

    training_args = GKDConfig(
        output_dir=args.output_dir,
        lmbda=args.lmbda,
        beta=args.beta,
        temperature=0.9,
        max_length=args.max_length,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=args.grad_accum,
        max_steps=args.max_steps,
        learning_rate=args.learning_rate,
        lr_scheduler_type="constant_with_warmup",
        warmup_steps=5,
        logging_steps=1,
        eval_strategy="steps" if eval_dataset is not None else "no",
        eval_steps=25,
        per_device_eval_batch_size=1,
        bf16=True,
        report_to="trackio" if args.trackio_project else "none",
        run_name=args.run_name,
        push_to_hub=bool(args.push_hub_id),
        hub_model_id=args.push_hub_id,
    )
    if args.trackio_project:
        training_args.trackio_project = args.trackio_project
        if args.trackio_space_id:
            training_args.trackio_space_id = args.trackio_space_id

    peft_config = LoraConfig(
        r=16, lora_alpha=32, lora_dropout=0.05,
        target_modules=LORA_TARGET_REGEX, task_type="CAUSAL_LM",
    )

    trainer = GKDTrainer(
        model=student,
        teacher_model=teacher,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        processing_class=tokenizer,
        peft_config=peft_config,
    )
    trainer.train()

    if args.push_hub_id:
        trainer.save_model(args.output_dir)
        trainer.push_to_hub()


if __name__ == "__main__":
    main()
