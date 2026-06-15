# TRL Rollouts

For GRPO with environments:

1. Load prompt-only tasks.
2. Generate action text or structured tool calls.
3. Apply actions to the environment.
4. Collect observations, terminal state, and trace metadata.
5. Score the rollout with a verifier or reward function.
6. Return rewards to the trainer and log components.

Start with one-step or short-horizon tasks. Increase horizon only after
validity, logging, and reward variance are confirmed.

Save successful traces in a format that can become SFT messages or preference
pairs later.
