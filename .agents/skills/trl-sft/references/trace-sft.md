# Training On Agent Traces

Hugging Face Hub supports viewing raw JSONL traces from Claude Code, Codex, and
Pi Agent. Local session locations include:

- Codex: `~/.codex/sessions`
- Pi: `~/.pi/agent/sessions`
- Claude Code: `~/.claude/projects`

The Hub docs warn that traces can contain prompts, tool inputs, command output,
local paths, screenshots, secrets, private code, and personal data. Review and
redact traces before public upload or training.

Upload patterns from the Hub docs:

```bash
hf upload <username>/<dataset-name> ~/.codex/sessions . --repo-type dataset
hf buckets sync ~/.codex/sessions hf://buckets/<username>/<bucket-name>/codex
```

SFT command pattern for a public synthetic trace dataset:

```bash
trl sft \
  --model_name_or_path Qwen/Qwen2.5-0.5B \
  --dataset_name julien-c/synthtraces \
  --output_dir outputs/sft-synthtraces-smoke
```

Use trace data only after deciding what the student should imitate:

- final assistant answers
- tool-call decisions
- repair behavior after failed commands
- concise summaries of tool results
- full transcripts, if and only if every role/token is appropriate as target
  behavior

If trace rows are not already in `messages` or `prompt`/`completion` format,
preprocess them before calling `SFTTrainer`.
