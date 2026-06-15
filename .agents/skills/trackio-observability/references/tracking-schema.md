# Tracking Schema

Use stable fields so runs can be compared:

- `project`: broad challenge family, such as `training-agents-grpo`
- `run_name`: concise method variant
- `group`: sweep or ladder stage when useful
- `space_id`: hosted Trackio Space for remote Jobs
- `model`
- `dataset`
- `method`
- `seed`
- `learning_rate`
- `batch_size`
- `max_length`
- `reward_version`
- `environment_version`

Useful metrics:

- train loss
- eval loss
- mean token accuracy
- reward mean and reward standard deviation
- completion length
- valid completion rate
- task success rate
- tool-call validity
- environment steps per success
- examples per second or tokens per second
- GPU memory

Keep custom metrics stable across a challenge series.
