#!/usr/bin/env python3
# /// script
# dependencies = [
#   "datasets>=3.0.0",
#   "transformers>=4.53.0",
# ]
# ///
"""Inspect an SFT dataset before training.

This is a learning utility. It prints columns, raw examples, optional chat-template
rendering, and token lengths so you can choose the right TRL SFT arguments.
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Mapping
from typing import Any

from datasets import load_dataset
from transformers import AutoTokenizer

SUPPORTED_COLUMNS = [
    {"text"},
    {"messages"},
    {"prompt", "completion"},
]


def compact(value: Any, limit: int = 1600) -> str:
    text = json.dumps(value, ensure_ascii=False, indent=2, default=str)
    if len(text) > limit:
        return text[:limit] + "\n... <truncated>"
    return text


def infer_shape(columns: set[str]) -> str:
    if "messages" in columns:
        return "conversational language modeling (`messages`)"
    if {"prompt", "completion"}.issubset(columns):
        return "prompt/completion"
    if "text" in columns:
        return "language modeling (`text`)"
    return "unknown; add a preprocessing or formatting function before SFT"


def maybe_format(row: Mapping[str, Any], tokenizer: Any) -> str | None:
    if "messages" in row and hasattr(tokenizer, "apply_chat_template"):
        return tokenizer.apply_chat_template(row["messages"], tokenize=False)
    if "prompt" in row and "completion" in row:
        prompt = row["prompt"]
        completion = row["completion"]
        if isinstance(prompt, list) and hasattr(tokenizer, "apply_chat_template"):
            messages = prompt + completion if isinstance(completion, list) else prompt
            return tokenizer.apply_chat_template(messages, tokenize=False)
        return f"{prompt}{completion}"
    if "text" in row:
        return str(row["text"])
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-name", default="trl-lib/Capybara")
    parser.add_argument("--split", default="train")
    parser.add_argument("--model-name", default="Qwen/Qwen2.5-0.5B-Instruct")
    parser.add_argument("--num-examples", type=int, default=3)
    parser.add_argument("--max-seq-length", type=int, default=1024)
    args = parser.parse_args()

    dataset = load_dataset(args.dataset_name, split=args.split)
    tokenizer = AutoTokenizer.from_pretrained(args.model_name, trust_remote_code=True)

    columns = set(dataset.column_names)
    print(f"dataset={args.dataset_name} split={args.split} rows={len(dataset)}")
    print(f"columns={dataset.column_names}")
    print(f"inferred_shape={infer_shape(columns)}")
    print(f"tokenizer={args.model_name} eos_token={tokenizer.eos_token!r} pad_token={tokenizer.pad_token!r}")

    for index in range(min(args.num_examples, len(dataset))):
        row = dataset[index]
        print("\n" + "=" * 80)
        print(f"example_index={index}")
        print("raw_example:")
        print(compact(row))
        formatted = maybe_format(row, tokenizer)
        if formatted is None:
            print("formatted_example=<not available for this shape>")
            continue
        token_count = len(tokenizer(formatted, add_special_tokens=False).input_ids)
        print(f"formatted_token_count={token_count} max_seq_length={args.max_seq_length}")
        if token_count > args.max_seq_length:
            print("WARNING: example is longer than max_seq_length and may be truncated")
        print("formatted_preview:")
        print(formatted[:1600] + ("\n... <truncated>" if len(formatted) > 1600 else ""))


if __name__ == "__main__":
    main()
