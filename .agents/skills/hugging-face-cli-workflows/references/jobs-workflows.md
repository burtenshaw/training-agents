# Jobs Workflows

HF Jobs are useful for cloud GPU training and smoke tests.

Before launch:

- check auth
- verify paid account or available compute
- confirm dataset access
- estimate runtime and timeout
- ensure output pushes to Hub or persistent storage
- pass required secrets without printing values

For TRL scripts:

- include dependencies or use a maintained script URL
- log remote training with Trackio and a hosted Space via `space_id`
- write model artifacts to `output_dir`
- push to Hub when the runner is ephemeral
- capture exact command, job id, dashboard Space URL, and artifact repo

When inspecting Jobs, summarize status and last relevant log lines rather than
dumping full logs.
