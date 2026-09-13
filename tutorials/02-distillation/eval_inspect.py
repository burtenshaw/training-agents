# /// script
# dependencies = [
#     "inspect-ai",
#     "inspect-evals @ git+https://github.com/UKGovernmentBEIS/inspect_evals",
#     "vllm",
#     "peft",
#     "transformers",
#     "torch",
# ]
# ///

"""Training Agents · Class 2 — HumanEval / MBPP evaluation (Inspect AI + vLLM).

Evaluates a model on HumanEval and/or MBPP with Inspect AI, served through vLLM.

Two HF-Jobs-specific settings this script handles for you:
  - `VLLM_USE_FLASHINFER_SAMPLER=0`: the job image has no `nvcc`, so the FlashInfer
    sampler cannot JIT-compile. The native sampler works.
  - `--sandbox local`: Inspect's code-execution sandbox defaults to Docker, which is
    not available inside a Job. `local` runs the generated code in-process.

Full models (e.g. the Qwen sweep outputs, or a base model) evaluate directly. A LoRA
`--adapter` is merged into `--base` first. NOTE: merging a Gemma-4 adapter drops some
`k_norm` weights on save and vLLM then refuses the checkpoint, so the Gemma off-policy
adapters cannot be evaluated this way yet (use the training `eval/loss` instead).
"""

import argparse
import os
import subprocess

import torch


def merge_adapter(base, adapter, out_dir):
    from transformers import AutoModelForCausalLM, AutoTokenizer, AutoProcessor
    from peft import PeftModel

    model = AutoModelForCausalLM.from_pretrained(base, dtype=torch.bfloat16)
    model = PeftModel.from_pretrained(model, adapter).merge_and_unload()
    model.save_pretrained(out_dir)
    # vLLM serve needs the full aux files (processor / chat_template), not just the tokenizer.
    try:
        AutoProcessor.from_pretrained(base).save_pretrained(out_dir)
    except Exception:
        pass
    AutoTokenizer.from_pretrained(base).save_pretrained(out_dir)
    return out_dir


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base", default="google/gemma-4-E2B-it")
    p.add_argument("--adapter", default=None, help="LoRA adapter to merge into --base; omit for a full model")
    p.add_argument("--tasks", default="humaneval,mbpp", help="comma list: humaneval,mbpp")
    p.add_argument("--limit", type=int, default=0, help="cap number of problems (0 = full)")
    p.add_argument("--max-model-len", type=int, default=4096)
    args = p.parse_args()

    os.environ["VLLM_USE_FLASHINFER_SAMPLER"] = "0"
    os.environ["VLLM_ATTENTION_BACKEND"] = "FLASH_ATTN"

    model_path = merge_adapter(args.base, args.adapter, "/tmp/merged_model") if args.adapter else args.base

    for task in (t.strip() for t in args.tasks.split(",")):
        cmd = [
            "inspect", "eval", f"inspect_evals/{task}",
            "--model", f"vllm/{model_path}",
            "--sandbox", "local",
            "-M", "enforce_eager=True",
            "-M", f"max_model_len={args.max_model_len}",
            "-M", "gpu_memory_utilization=0.85",
        ]
        if args.limit:
            cmd += ["--limit", str(args.limit)]
        subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
