# Agent Lab Guide

Training Agents uses Codex context surfaces rather than a training framework.

## Context Surfaces

- `AGENTS.md`: always-loaded repository guidance.
- `.codex/config.toml`: project-scoped Codex settings.
- `.codex/agents/*.toml`: custom sub-agents for explicit delegation.
- `.agents/skills/*/SKILL.md`: repo-local skills for reusable workflows.

Codex sub-agents are not automatic. Ask for them explicitly when the work can be
split cleanly.

## Useful Delegations

Research and planning:

```text
Spawn training-planner and research-scout. Have them design an SFT challenge for
a tool-calling customer-support agent and cite the TRL docs they rely on.
```

Implementation and validation:

```text
Use trl-implementer for the script and script-runner for the smoke test. Wait
for both and summarize the patch, command, and failure risks.
```

Integrity review:

```text
Spawn integrity-reviewer to audit this GRPO environment plan for leakage,
reward hacking, and eval comparability before implementation.
```

Long-running runs:

```text
Spawn tracking-reporter to inspect the Trackio dashboard, grep the run log, and
summarize the latest HF Job artifact state.
```

## Coordination Rules

- Use one writer at a time for code changes.
- Use read-only agents for planning, research, and review.
- Ask noisy agents to return compact summaries, not full logs.
- Keep command outputs, stack traces, and raw source lookups out of the main
  thread unless they drive a decision.
- Record durable lessons in `research/notes.md` and structured outcomes in
  `research/results.tsv`.
