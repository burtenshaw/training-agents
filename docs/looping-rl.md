# Looping RL

Most reinforcement learning projects already have a loop at the center:

1. sample behavior
2. score it
3. update the policy
4. try again

That loop is necessary, but it is not enough for agentic models. The training
system around the model needs its own loop too. Otherwise the model may be
learning, while the research process around it keeps forgetting what it already
tried.

Looping RL is the practice of making the whole training operation iterative:
the model, the environment, the evaluator, the experiment runner, the memory
log, and the release gate all become part of the same feedback system.

## The Outer Loop

For Training Agents, the outer loop is simple:

`GOAL -> DISCOVER -> PLAN -> EXECUTE -> VERIFY -> ITERATE`

The goal is concrete: train an approximately 2B open model to score above 40 on
Terminal-Bench.

The discovery phase looks for current methods, not just convenient ones. It
reads TRL examples, OpenEnv environments, Hugging Face Papers, Harbor, Inspect,
and previous experiment logs. It should find the next rung, not restart the
same work.

The planning phase turns that research into a bounded experiment: model,
dataset, split policy, reward, evaluator, sweep size, Trackio project, artifact
path, and the exact score gate.

Execution launches the smallest run that can answer the question. If the smoke
test fails, the loop should not scale. If a sweep runs, it should leave job
ids, versions, logs, checkpoints, and artifacts.

Verification is the hard boundary. Training reward is not a benchmark result.
A checkpoint only matters if it improves on a held-out task, a proxy gate, or
the real benchmark.

Iteration closes the loop. If the score does not move, the next run should
change something material: model, reward, task grouping, data, environment,
evaluator, or method. A near-duplicate rerun is not progress.

## The Restaurant Test

One useful way to think about loops is service reliability.

A customer does not care that the kitchen made eggs, toast, and coffee in three
separate internal workflows. They care that the whole order arrives together,
warm, predictable, and complete.

Agent training has the same shape. A good loop does not merely produce a
checkpoint, a dashboard, or a clever reward function. It delivers the whole
order:

- a model
- a benchmark result
- a reproducible command
- an artifact location
- a dashboard
- a release decision
- a clear next step

If any part is missing, the loop has not completed.

## Why RL Needs This

Agentic RL is full of false progress.

A model can learn valid JSON without solving the task. It can call the right
tool with the wrong argument. It can create output files that look plausible
but fail hidden tests. It can get dense reward from a shaped proxy and still
score zero on the benchmark.

The answer is not just more compute. The answer is a better loop.

The training loop asks, "Did this completion get reward?"

The research loop asks harder questions:

- Did this improve over the base model?
- Did it improve on a held-out task?
- Did it transfer from the curriculum to the proxy?
- Did we avoid training on eval data?
- Did the model learn task semantics or just syntax?
- Did the failure mode change?
- What is the next controlled rung?

That second loop is what keeps RL from becoming a pile of disconnected sweeps.

## Roles In The Loop

The main agent should not do every role at once.

The implementer builds one coherent training path. The runner executes commands
and records failures. The tracker inspects Trackio, SLURM, logs, and artifacts.
The environment builder defines the OpenEnv contract. The distillation designer
turns verified traces into data. The evaluator checks whether the result is
real.

For now, the evaluator role can be handled by `integrity-reviewer`. It should
stay read-only and answer one question: is this score valid enough to change
the loop state or release a checkpoint?

That maker/checker split matters. Training jobs are allowed to be optimistic.
Evaluators are not.

## State Is The Difference

A prompt is stateless unless you paste the history back in.

A loop has memory.

For Training Agents, that memory lives in experiment logs, result tables,
issue tables, Trackio dashboards, job ids, checkpoint paths, and release notes.
Every run should begin by reading it. Every run should end by updating it.

Without state, the automation repeats failed variants. With state, it can say:

- this reward had no variance
- this syntax curriculum did not transfer
- this model appears capacity-limited
- this evaluator was too weak
- this checkpoint improved a proxy but not the target
- the next run should change the model, not the learning rate

That is the difference between automation and a loop.

## The Stop Condition

Loops need stop conditions.

For Terminal-Bench, the target stop condition is a score above 40 with
reproducible logs and a release-ready checkpoint. Proxy wins are useful, but
they are not final success unless they are clearly labeled as proxy results.

There are also temporary stop conditions:

- infrastructure is blocked
- the current model family is the bottleneck
- the evaluator is invalid
- the reward is being gamed
- the run produced no new information

Stopping is not failure. Stopping without recording why is failure.

## Looping RL In One Sentence

Looping RL means training the model and the training system at the same time:
the policy improves from rewards, and the research process improves from
verified outcomes.

The point is not to run forever. The point is to make each pass harder to waste
than the last.

## References

- Lauren, "Loops You Can Trust":
  https://x.com/poteto/status/2069824386283319343
- Anatoli Kopadze, "Loops explained":
  https://x.com/AnatoliKopadze/status/2068328135611822149
