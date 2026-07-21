# SFT Mentor Lab

Small templates for the four-week SFT mentor path. These scripts are intended
for learning and smoke tests, not for claiming a benchmark result.

Generated checkpoints, logs, and datasets should stay outside the tracked repo,
for example under `workspaces/sft-mentor-lab/` or `outputs/`.

For the theory and mentor workflow, open `../../docs/sft-interactive-playbook.html` in a browser.
Module 7 covers writing copilot task briefs, acceptance checks, and review
failure modes so you can direct agents without writing trainers from scratch.

## Files

- `inspect_dataset.py`: inspect dataset columns, examples, chat formatting, and
  token lengths before training.
- `train_lora_sft.py`: minimal TRL `SFTTrainer` + LoRA template.
- `score_generations.py`: score baseline-vs-SFT generations with the mentor
  rubric.
- `eval_prompts.jsonl`: tiny starter prompt set for behavioral comparison.

## Setup

These scripts use PEP 723 metadata and can be run with `uv`:

```bash
uv run examples/sft-mentor-lab/inspect_dataset.py --dataset-name trl-lib/Capybara
```

If running in Colab or another environment, install equivalent packages:

```bash
pip install -U "trl>=0.19.0" "transformers>=4.53.0" datasets peft accelerate torch
```

## Week 2: Inspect Data

```bash
uv run examples/sft-mentor-lab/inspect_dataset.py \
  --dataset-name trl-lib/Capybara \
  --split train \
  --model-name Qwen/Qwen2.5-0.5B-Instruct \
  --num-examples 3
```

Look for:

- supported columns such as `messages`, `text`, `prompt`, or `completion`
- valid roles for chat examples
- target assistant/completion content
- formatted text that matches the model chat template
- token lengths below your planned `max_seq_length`

## Week 3: Smoke Train

Run a tiny smoke job first:

```bash
uv run examples/sft-mentor-lab/train_lora_sft.py \
  --model-name Qwen/Qwen2.5-0.5B-Instruct \
  --dataset-name trl-lib/Capybara \
  --output-dir outputs/sft-mentor-smoke \
  --max-steps 5 \
  --max-seq-length 1024 \
  --per-device-train-batch-size 1 \
  --gradient-accumulation-steps 1
```

Then run a modest experiment by increasing `--max-steps` and logging to your
preferred tracker. The script always builds a held-out eval split via
`--eval-size`; keep it enabled and make sure the split stays truly held out.

## Week 4: Score Generations

Create a JSONL file where each row contains baseline and SFT answers:

```jsonl
{"id":"in_domain_001","category":"in_domain","prompt":"Explain SFT in one paragraph.","baseline":"...","sft":"..."}
```

Then score manually or bootstrap a scoring sheet:

```bash
uv run examples/sft-mentor-lab/score_generations.py \
  --generations path/to/generations.jsonl \
  --output workspaces/sft-mentor-lab/scores.csv
```

The generated CSV contains rubric columns for baseline and SFT outputs. Fill the
scores, summarize averages, and copy the result into your capstone report.
