# GRPO Agent Rewards

Good first rewards are verifiable and cheap:

- exact answer checks
- unit tests
- JSON or schema validity
- tool-call argument validation
- environment terminal success
- bounded judge scores with rubrics

Log reward components separately. A single scalar is useful for optimization,
but debugging needs the component metrics.

Avoid rewards that are easy to exploit:

- response length alone
- formatting without task success
- judge prompts that reveal the answer
- environment state unavailable at deployment time
- training on held-out eval tasks

For environment rewards, keep the trainer consuming rewards while the
environment exposes state and transitions. Do not hide task labels in
observations.
