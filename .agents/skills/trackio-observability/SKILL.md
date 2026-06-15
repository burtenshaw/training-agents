---
name: trackio-observability
description: Use when instrumenting or inspecting TRL training runs with Trackio, run names, metric schemas, dashboards, logs, grep or ripgrep, SFTP, Hugging Face Job logs, remote artifacts, or experiment result summaries.
---

# Trackio Observability

Use this skill to make training runs observable and debuggable.

## Workflow

1. Define the run identity: project, run name, method, model, dataset, seed, and
   challenge.
2. Add Trackio. For any remote Hugging Face Job, initialize a hosted dashboard
   with `trackio.init(..., space_id="owner/space")`; only short local smoke
   tests may stay local or skip tracking with an explicit reason.
3. Make logs grep-friendly with clear phase markers.
4. Persist artifacts intentionally: model, adapter, config, metrics, traces, and
   evaluation outputs.
5. Inspect remote state with the narrowest tool: Trackio dashboard, HF CLI,
   `rg`, or SFTP when configured.

## Reporting Shape

Return:

- run id or job id
- Trackio dashboard or Space
- command or script inspected
- latest metrics
- artifact paths
- failure signatures
- next minimal action

Never print tokens, secrets, private credentials, or full logs unless the user
explicitly asks for a raw excerpt.

## References

- `references/tracking-schema.md`: run metadata and metric schema.
- `references/log-inspection.md`: grep, SFTP, and remote artifact triage.
