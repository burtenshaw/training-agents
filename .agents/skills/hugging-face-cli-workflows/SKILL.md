---
name: hugging-face-cli-workflows
description: Use when working with Hugging Face CLI or Hub workflows for TRL training, including auth, repositories, uploads, downloads, Jobs, buckets, model persistence, dataset checks, Space links, and remote artifact movement.
---

# Hugging Face CLI Workflows

Use this skill for Hub, CLI, Jobs, buckets, and artifact workflows around TRL
training.

## Workflow

1. Check auth with `hf auth whoami` before remote actions.
2. Identify the target type: model repo, dataset repo, Space, Job, or bucket.
3. Keep scripts portable: remote Jobs cannot read local files unless the script
   is uploaded, inlined, or available by URL.
4. Ensure ephemeral runners push or upload artifacts before completion.
5. Summarize exact repo ids, job ids, paths, and commands.

## Safety

- Never print `HF_TOKEN` or credentials.
- Use private repos or buckets for non-public data by default.
- Confirm before deleting or overwriting Hub artifacts.
- Keep large checkpoints outside this context repository.

## References

- `references/hub-workflows.md`: auth, repos, upload/download, and artifacts.
- `references/jobs-workflows.md`: HF Jobs conventions for TRL runs.
