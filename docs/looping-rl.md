# Looping RL

The Terminal-Bench automation now has a target model size, a benchmark gate,
and a record of previous runs. That is enough to launch experiments. It is not
enough to make the experiments improve over time.

This post describes the loop around the training run. You will see how the
automation uses memory, planning, execution, evaluation, and release rules to
turn disconnected reinforcement learning experiments into a stateful training
system. The examples use Terminal-Bench, TRL, OpenEnv, Trackio, Harbor, and
Inspect, but the same pattern applies to other agent benchmarks.

## What Looping RL Means

Reinforcement learning, or RL, trains a policy from feedback. A policy is the
model behavior you get after the model chooses an action. The usual inner loop
samples behavior, scores it, updates the policy, and samples again.

Looping RL adds an outer loop around that process. The outer loop trains the
research system that trains the model. It records what the last run proved,
chooses the next experiment, executes it, checks the result, and writes down
the next state.

For the Training Agents project, the outer loop has six stages:

`GOAL -> DISCOVER -> PLAN -> EXECUTE -> VERIFY -> ITERATE`

The goal is concrete. Train an approximately 2B parameter open model to score
above 40 on Terminal-Bench. Terminal-Bench is a benchmark for terminal-using
agents. A proxy gate, such as TB Lite or a held-out OpenEnv taskset, can guide
the loop before full benchmark scoring is available, but the report must label
that result as a proxy.

## Why The Outer Loop Matters

Agentic RL trains models to act through tools, environments, or multi-step
workflows. It can show progress that does not transfer to the benchmark. A
model can learn valid JSON and still call the wrong tool. It can create a file
with the right name and the wrong contents. It can increase shaped reward and
still score zero on held-out tasks.

The inner training loop does not catch all of these failures. It asks whether a
completion received reward under the current setup. The outer loop asks whether
the setup measured the behavior you wanted.

Those questions are different. The outer loop should answer them explicitly:

- Did the checkpoint improve over the base model?
- Did the result hold on a held-out split?
- Did the model learn task semantics, or only action syntax?
- Did the reward have useful variance?
- Did the evaluator avoid training data and hidden labels?
- Did the failure mode change?
- What should the next run change?

When the automation answers these questions, each run can change the next run.
Without those answers, the system repeats similar sweeps and calls them
iteration.

## Goal And State

The goal gives the loop a stopping rule. For this project, the final stopping
rule is a Terminal-Bench score above 40 with reproducible logs and a
release-ready checkpoint.

State gives the loop memory. The automation reads prior state before it
researches or launches jobs. That state includes the automation memory file,
`research/notes.md`, `research/results.tsv`, issue tables, Trackio dashboards,
SLURM job ids, checkpoint paths, and release notes.

The state should be specific enough to prevent duplicate work. A useful entry
does not only say that a run failed. It says which model ran, which reward
profile it used, which evaluator scored it, what metric moved, and what
failure remained.

After a run, the automation should be able to make one of these decisions:

- scale the same rung because the smoke test passed
- change the reward because there was no reward variance
- change the evaluator because the proxy was too weak
- change the data because syntax improved but task success stayed flat
- change the model because capacity appears to be the bottleneck
- release the checkpoint because a valid held-out score improved

The next section turns that state into a plan.

## Planning The Run

The planning step converts the goal into one bounded experiment. A bounded
experiment has a clear input, a clear output, and a clear decision rule.

The plan should name the model and tokenizer, the training method, the dataset,
the train and eval split, the reward function, the evaluator, the sweep size,
the Trackio Space, the artifact path, and the score gate. It should also name
the smallest smoke command that can fail before the full job consumes cluster
time.

The project uses TRL-native methods. TRL is the Hugging Face library used here
for supervised fine-tuning, preference optimization, and reinforcement
learning. GRPO, or Group Relative Policy Optimization, is the main online RL
method in the current loop because it can score multiple completions for the
same prompt. OpenEnv provides environment boundaries for stateful tasks, such
as terminal tasks with `reset`, `step`, and `state` operations.

A plan should use skills and sub-agents as working roles:

- `$trl-post-training` selects the training method and trainer shape.
- `$openenv-agentic-rl` defines the environment contract.
- `$trackio-observability` defines run names, metrics, dashboards, and logs.
- `$hugging-face-cli-workflows` handles Hub, Jobs, buckets, and artifacts.
- `training-planner` proposes the rung and ablations.
- `trl-implementer` writes one coherent training path.
- `tracking-reporter` checks SLURM, Trackio, and artifacts.
- `integrity-reviewer` checks the evaluator and release claim.

The evaluator role is deliberately separate from implementation. The
implementer can be optimistic while building. The evaluator should stay
read-only and decide whether the result is valid enough to change the loop
state.

## Executing The Run

Execution should answer the planned question with the smallest useful run. The
first job should prove that tokenization, reward parsing, logging, and
checkpoint saving work. A larger sweep should run only after that smoke test
passes.

The Hopper cluster rules are part of the execution contract. One-node jobs run
on `hopper-prod`. Jobs larger than one node run on `hopper-extra`. Routine jobs
use only `low` or `normal` priority. The automation should use FSx-backed
caches, virtual environments, run roots, and temporary directories so a node
does not fail from local disk pressure.

Each remote run should leave these records:

- the exact command or SLURM script
- the SLURM job id
- model, dataset, and library versions
- the Trackio dashboard or reason tracking was skipped
- the checkpoint or artifact path
- the evaluator command
- the result summary

These records are not bookkeeping after the fact. They are the data the next
loop uses.

## Verifying The Result

Verification checks whether the run changed benchmark behavior. It should use a
separate evaluator whenever possible. A training reward can help optimize the
model, but it should not be the release gate.

The verification ladder is:

1. smoke test for tokenization, reward parsing, logging, and checkpoint save
2. held-out proxy gate, such as TB Lite or OpenThoughts-style held-out tasks
3. Harbor, Inspect, or OpenEnv `tbench2` evaluation
4. full Terminal-Bench score when infrastructure is available

Harbor and Inspect are evaluation tools. Trackio is the experiment tracking
surface. None of them replaces the benchmark gate. A checkpoint should move to
release only when the evaluator shows improvement over the base model or the
previous best adapter.

The `integrity-reviewer` sub-agent should check this point before publication.
It should look for train/eval leakage, hidden-label exposure, reward hacking,
missing commands, unsupported claims, and proxy results presented as full
benchmark results.

## Iterating After Failure

Most runs will not reach the final score. The loop still succeeds if it changes
the next decision.

A failed run should record the bottleneck. The bottleneck might be model
capacity, data quality, reward design, environment behavior, evaluator
coverage, or infrastructure. The next run should change the bottleneck, not
only the learning rate.

Some examples make the rule concrete. If reward variance is zero, redesign the
prompt grouping or task sampling. If action syntax improves but task success
stays flat, move to semantic data or a stronger model comparison. If a proxy
score remains zero, do not claim Terminal-Bench progress. If a checkpoint beats
the proxy but not the target, publish only if the README states the limitation.

This iteration rule keeps the automation from repeating the same experiment
with new labels.

## Summary

Looping RL treats the research operation as part of the training system. The
model improves from rewards, and the automation improves from verified
outcomes.

This post covered the outer loop, the role of durable state, the structure of a
bounded plan, the execution records each run must leave, and the evaluator gate
that protects benchmark claims. The next document,
`docs/terminal-bench-loop.md`, turns the same ideas into the operational
contract for the recurring Terminal-Bench automation.

## References

These posts inspired the framing around trusted loops and prompt-to-loop
systems:

- Lauren, "Loops You Can Trust":
  https://x.com/poteto/status/2069824386283319343
- Anatoli Kopadze, "Loops explained":
  https://x.com/AnatoliKopadze/status/2068328135611822149
