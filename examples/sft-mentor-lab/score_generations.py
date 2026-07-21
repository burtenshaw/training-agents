#!/usr/bin/env python3
# /// script
# dependencies = [
#   "pandas>=2.0.0",
# ]
# ///
"""Create a rubric scoring sheet for baseline-vs-SFT generations.

Input JSONL rows need at least: id, prompt, baseline, sft. The script does not
judge automatically; it creates a CSV with rubric columns to fill manually.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

RUBRIC_FIELDS = [
    "correctness_0_2",
    "instruction_following_0_2",
    "format_validity_0_2",
    "helpfulness_0_2",
    "brevity_control_0_1",
    "safety_no_fake_tools_0_1",
]


def read_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            missing = {"id", "prompt", "baseline", "sft"} - set(row)
            if missing:
                raise ValueError(f"line {line_number} missing fields: {sorted(missing)}")
            rows.append(row)
    return rows


def build_sheet(rows: list[dict]) -> pd.DataFrame:
    output_rows: list[dict] = []
    for row in rows:
        for model_label in ("baseline", "sft"):
            output = {
                "id": row["id"],
                "category": row.get("category", ""),
                "model": model_label,
                "prompt": row["prompt"],
                "answer": row[model_label],
                "notes": "",
            }
            for field in RUBRIC_FIELDS:
                output[field] = ""
            output["total_0_10"] = ""
            output_rows.append(output)
    return pd.DataFrame(output_rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--generations", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    rows = read_jsonl(args.generations)
    sheet = build_sheet(rows)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.to_csv(args.output, index=False)
    print(f"Wrote scoring sheet with {len(sheet)} rows to {args.output}")


if __name__ == "__main__":
    main()
