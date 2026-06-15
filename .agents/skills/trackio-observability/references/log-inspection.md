# Log Inspection

Prefer `rg` for local logs:

```bash
rg -n "ERROR|Traceback|CUDA|OOM|reward|eval|checkpoint|push_to_hub" logs/
```

For HF Jobs, use the configured CLI or project helper. Capture job id, status,
last relevant lines, and artifact path.

For SFTP, only connect when the user provides host, path, and credentials are
already configured. Do not echo connection secrets. Copy only the requested
logs or summaries.

When summarizing logs:

- include the command or path inspected
- quote only short diagnostic lines
- separate root cause from speculation
- suggest the smallest rerun or fix
