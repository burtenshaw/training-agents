# Distillation Loop

Minimal loop:

1. Sample tasks from the train pool.
2. Generate multiple rollouts.
3. Verify task success with deterministic checks where possible.
4. Ask a stronger teacher or judge for critique only after basic verification.
5. Keep successful traces and representative failures.
6. Convert successful traces to SFT data.
7. Convert success/failure pairs to preference data.
8. Retrain and evaluate on held-out tasks.

Promotion rule:

- promote a distilled dataset only when it improves held-out task behavior or
  fixes a clearly measured failure mode.
