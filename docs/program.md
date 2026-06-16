# Challenge Ladder

Use this ladder to grow post-training tasks from simple supervised learning to
agentic reinforcement learning and distillation.

## 1. SFT

Goal: teach the model the interaction format and basic task behavior.

Use:

- conversational `messages` data for chat
- prompt/completion data for direct instruction tasks
- assistant-only or completion-only loss where supported
- small eval split and a smoke generation script
- Trackio for loss, token accuracy, and throughput
- trace training with reviewed Hub agent traces, for example
  `trl sft --dataset_name julien-c/synthtraces`
- reusable trace-training examples under `examples/`, such as the Gemma 4
  Pi-Mono SFT runbook

Agentic variants:

- tool-call formatting
- tool-result recovery
- concise planning traces
- terminal/browser instruction following

## 2. GRPO

Goal: learn from generated groups and verifiable rewards.

Use:

- prompt-only datasets
- deterministic reward functions where possible
- small group sizes for smoke tests
- explicit generation parameters
- metric logging for reward mean, variance, length, and completion validity

Good early rewards:

- exact answer checks
- unit tests
- parser validity
- tool-call schema validity
- environment task success

## 3. GRPO With Environments

Goal: train agents that interact with a stateful harness.

Use:

- OpenEnv-style reset/step/state environment boundaries
- separate environment transport, reward logic, and trainer code
- tasksets backed by datasets
- train/eval environments with controlled seeds or held-out tasks
- rollout traces that can later become distillation data

## 4. Self-Distillation

Goal: improve future SFT/RL data from successful agent traces.

Use:

- verified successful rollouts
- judge or critic annotations
- rejection sampling
- contrastive chosen/rejected pairs
- trace compression into teachable messages
- periodic eval against a frozen task set

Do not distill unverified completions back into the model without filtering.
