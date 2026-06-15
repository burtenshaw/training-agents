# SFT Commands

Minimal CLI smoke:

```bash
trl sft \
  --model_name_or_path Qwen/Qwen2.5-0.5B \
  --dataset_name trl-lib/Capybara \
  --max_steps 5 \
  --output_dir outputs/sft-smoke
```

Config pattern:

```yaml
model_name_or_path: Qwen/Qwen2.5-0.5B
dataset_name: trl-lib/Capybara
output_dir: outputs/sft-run
max_steps: 100
learning_rate: 2.0e-5
per_device_train_batch_size: 2
gradient_accumulation_steps: 8
report_to: trackio
```

Run:

```bash
trl sft --config sft_config.yaml
```

Prefer config files for shared challenges and command-line overrides for small
intentional sweeps.
