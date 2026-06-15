---
name: openenv-agentic-rl
description: Use when designing, reviewing, or implementing OpenEnv-style environment interfaces for agentic RL with TRL, including reset/step/state contracts, tasksets, Docker or HTTP/WebSocket serving, MCP compatibility, reward separation, and GRPO environment rollouts.
---

# OpenEnv Agentic RL

Use this skill when an agent training task needs an interactive environment
rather than a static prompt.

OpenEnv should be treated as an interoperability layer between harness,
environment, and trainer. It should not own the reward definition or training
algorithm.

## Workflow

1. Define the task and whether stateful interaction is actually needed.
2. Specify `reset`, `step`, `state`, terminal state, action schema, and
   observation schema.
3. Keep reward logic in the trainer/eval layer or a clearly versioned scorer.
4. Add a small taskset with train/eval separation.
5. Connect rollouts to TRL GRPO or a similar online RL method.
6. Record traces for later self-distillation.

## Checks

- Observations must not leak labels or future state.
- Train and eval tasks should be separated.
- The local smoke environment should run without cloud infrastructure.
- Environment transport should match deployment needs: local process, Docker,
  HTTP, WebSocket, or MCP.
- The same interface should support both training and evaluation.

## References

- `references/environment-contract.md`: environment design checklist.
- `references/trl-rollouts.md`: connecting environment rollouts to TRL.
