# Terminal-Bench Loop Automation

Use this contract for the recurring post-training automation whose objective is
to train an approximately 2B open model to exceed 40 on Terminal-Bench.

The loop is:

`GOAL -> DISCOVER -> PLAN -> EXECUTE -> VERIFY -> ITERATE`

## Goal

Train a roughly 2B parameter open model to exceed 40 on Terminal-Bench. If full
Terminal-Bench scoring is blocked, use the strongest available proxy gate, such
as TB Lite, Harbor, Inspect, or an OpenEnv `tbench2`-style held-out subset, but
label it as a proxy and do not claim a full benchmark win.

The loop should stop only when one of these is true:

- a released checkpoint beats 40 on the target score with reproducible logs
- the current rung is blocked by infrastructure or benchmark access and the
  next unblock action is recorded
- the current model family is shown to be the bottleneck and the next model
  comparison is defined

## Discover

Read state before researching or launching anything:

- `/Users/ben/.codex/automations/post-training-agent-experiments/memory.md`
- `research/notes.md`
- `research/results.tsv`
- `research/issues.md` or any repo-local bug table that exists

Then discover current methods and sources:

- TRL examples and docs for SFT, GRPO, DAPO or Dr. GRPO loss variants, reward
  scaling, and OpenEnv environment rollouts
- OpenEnv examples and environments for terminal, coding, REPL, Terminus, and
  `tbench2`-style tasks
- Hugging Face Papers and Hub datasets for terminal-agent post-training,
  verified traces, RLVR, self-distillation, and executable task bundles
- Harbor and Inspect routes for evaluation

Avoid training on Terminal-Bench eval tasks, TB Lite eval tasks, public
leaderboard solutions, or official trajectory labels. Eval-only sources can be
used for schema inspection and scoring.

## Plan

Before launching jobs, write down the planned rung:

- model and tokenizer
- method: SFT, GRPO, environment GRPO, self-distillation, or comparison run
- dataset and train/eval split policy
- reward or eval definition
- smallest smoke command
- sweep size, seeds, learning rates, and node count
- Trackio project or Space
- artifact destination
- score gate and next decision

Use repo-local skills for the corresponding part of the plan:

| Stage | Skill |
| --- | --- |
| method and trainer shape | `$trl-post-training` |
| SFT warm starts or trace imitation | `$trl-sft` |
| OpenEnv contracts and environment rollouts | `$openenv-agentic-rl` |
| verified trace recycling | `$agentic-self-distillation` |
| Trackio and log inspection | `$trackio-observability` |
| Hub, Jobs, buckets, and artifact movement | `$hugging-face-cli-workflows` |

Use sub-agents when parallel work is helpful and available:

| Loop Role | Sub-agent |
| --- | --- |
| method queue and ablations | `training-planner` |
| current docs, papers, and source lookup | `research-scout` |
| one coherent TRL implementation | `trl-implementer` |
| command execution and failure summaries | `script-runner` |
| Trackio, SLURM, HF Jobs, and artifact status | `tracking-reporter` |
| environment protocol design | `openenv-builder` |
| self-distillation and trace filtering | `self-distillation-designer` |
| leakage, score validity, and release claims | `integrity-reviewer` |

Keep write-heavy work in one implementation path at a time.

Use `integrity-reviewer` as the evaluator sub-agent for now. Its job is not to
train or patch; its job is to decide whether the score, split, verifier, and
release claim are valid. Add a dedicated benchmark evaluator later only if eval
execution becomes repetitive enough to deserve its own agent.

## Execute

Run only experiments that advance the loop state.

Cluster requirements:

- use SLURM on `hpc-cluster-hopper-login-node-1`
- use `/opt/slurm/bin/squeue --me` for job inspection when `squeue` is not on
  the login shell path
- run 2-4 training jobs when capacity and project state allow
- use between 1 and 4 complete nodes
- jobs greater than 1 node must run on `hopper-extra`
- jobs of exactly 1 node must run on `hopper-prod`
- never allocate more than 1 node on `hopper-prod`
- use only `low` or `normal` priority for routine automation work
- prefer FSx-backed caches, virtualenvs, run roots, and temporary directories

Every remote run should have:

- exact launch command or SLURM script
- job id
- model, dataset, library versions, and commit if relevant
- Trackio Space for long or remote training
- persistent artifact path on FSx, Hub, bucket, or model repo
- checkpoint save before any in-process post-eval that might hang

## Verify

The verifier must be separate from the trainer whenever possible.

Verification order:

1. local or remote smoke that proves tokenization, reward parsing, logging, and
   checkpoint save
2. held-out task or proxy gate, such as TB Lite or OpenThoughts-style held-out
   tasks
3. Harbor, Inspect, or OpenEnv `tbench2` evaluation
4. full Terminal-Bench score when infrastructure is available

Do not promote a checkpoint from training reward alone. Promote only when a
held-out evaluation improves over the base model or the previous best adapter.
The evaluator sub-agent should check this gate before any Hub release or
benchmark claim.

## Iterate

If the score does not beat 40, the loop must feed the result back into the next
run.

Record:

- what changed
- what metric moved or failed to move
- failure mode
- whether the failure is model capacity, data, reward, environment, eval, or
  infrastructure
- the next harder or better-controlled rung

Iteration rules:

- do not repeat failed variants without a documented change in method, reward,
  model, data, or evaluator
- if a rung has no reward variance, redesign the prompt/task grouping before
  scaling
- if syntax improves but task success stays flat, move to semantic data or a
  stronger model comparison
- if a proxy score is still 0, avoid full Terminal-Bench claims
- if a checkpoint beats the gate, publish it to the Hub with a Trackio link and
  concise README report

## Run Report

Each automation run should report:

- current loop stage and score gate
- research findings used for the next decision
- experiments launched or skipped with reasons
- SLURM jobs, resources, and status
- Trackio dashboards
- eval results and whether they beat base or previous best
- artifact locations
- bugs or sharp edges, without opening PRs automatically
- memory/log files updated
- next loop state
