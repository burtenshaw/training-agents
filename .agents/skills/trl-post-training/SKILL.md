---
name: trl-post-training
description: Use when building, reviewing, or editing TRL post-training workflows for agentic applications, including SFT, DPO, GRPO, RLOO, reward modeling, dataset formats, chat templates, assistant/completion-only losses, tool-calling data, reward functions, and challenge progression from SFT to environment-based RL.
---

# TRL Post-Training

Use this skill to design or implement post-training tasks with TRL for models
that will act as agents.

## Workflow

1. Identify the training stage: SFT, DPO, reward modeling, GRPO, RLOO,
   environment RL, or distillation-fed retraining.
2. Confirm the dataset format before choosing trainer arguments.
3. Pick the smallest smoke run that exercises tokenization, generation, reward,
   logging, and saving.
4. Add Trackio for anything long-running or remote.
5. Document the eval protocol before claiming model improvement.

## Method Selection

- Use SFT first for new formats, tools, domains, and chat behavior.
- Use `$trl-sft` for implementation-level SFT tasks, including trace datasets
  and `trl sft` configs.
- Use DPO when there are high-quality chosen/rejected pairs.
- Use reward modeling when a learned scorer will be reused.
- Use GRPO when prompts can be scored by a verifier, test, parser, environment,
  or judge.
- Use environment GRPO when success depends on multi-step interaction.
- Use self-distillation to recycle verified traces into later SFT or preference
  data.

## Implementation Rules

- Prefer TRL trainer/config classes or TRL CLI configs over custom loops.
- Use conversational `messages` data for chat and tool-calling agents.
- Use prompt-only data for online RL methods such as GRPO.
- For SFT chat data, use assistant-only loss only when the chat template
  supports assistant span masking.
- If `eval_strategy` is enabled, provide an `eval_dataset`; otherwise set
  evaluation to off explicitly.
- Keep reward functions deterministic where possible and log reward components.
- Keep generated checkpoints and datasets outside this context repo.

## References

Read only the needed reference:

- `references/method-ladder.md`: stage selection and challenge sequence.
- `references/dataset-formats.md`: TRL dataset and chat-template constraints.
- `references/grpo-agent-rewards.md`: reward functions for agentic GRPO.
- `references/script-patterns.md`: script and config patterns.
