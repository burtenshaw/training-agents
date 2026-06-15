---
name: agentic-self-distillation
description: Use when designing or reviewing self-distillation workflows for agentic models, including trace collection, teacher or judge feedback, rejection sampling, critique, conversion to SFT or preference data, iterative TRL training loops, and safeguards against self-reinforcing errors.
---

# Agentic Self-Distillation

Use this skill to turn verified agent behavior into better post-training data.

## Workflow

1. Define the task source and base policy.
2. Collect rollouts with full prompts, actions, observations, tool calls,
   outputs, and terminal result.
3. Verify or judge traces before using them as training data.
4. Convert accepted traces into SFT messages, chosen/rejected preference pairs,
   or prompt-only tasks with reward metadata.
5. Train the next model with TRL and evaluate on held-out tasks.
6. Compare against the previous model before promoting the new data recipe.

## Guardrails

- Do not distill unverified model outputs directly.
- Keep rejected traces; they are useful for DPO or reward modeling.
- Version teacher model, verifier, prompt, and filter.
- Avoid training on eval tasks or hidden benchmark labels.
- Watch for self-confirming errors where the teacher and judge share the same
  blind spot.

## References

- `references/distillation-loop.md`: loop design.
- `references/trace-schema.md`: trace fields and conversion targets.
