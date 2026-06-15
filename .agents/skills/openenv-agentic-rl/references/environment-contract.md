# Environment Contract

Minimum environment spec:

- `reset(seed, task_id) -> observation`
- `step(action) -> observation, reward_hint, done, info`
- `state() -> state_summary`
- action schema
- observation schema
- terminal success and failure conditions
- max steps
- task source and split policy

Keep `reward_hint` optional or diagnostic when the reward is owned elsewhere.
The training loop can compute the final scalar reward from environment state,
logs, tests, or a judge.

Package environments so a trainer can run them repeatedly and evaluation can
reuse the same interface.
