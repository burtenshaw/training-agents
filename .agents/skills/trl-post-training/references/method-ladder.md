# Method Ladder

## SFT

Use SFT to teach the interaction format and baseline task behavior. Favor
conversational datasets for chat agents and prompt/completion datasets for
single-turn instruction tasks. For tool use, include tool schemas, tool calls,
and tool responses in the message structure where the target tokenizer and chat
template support it.

## DPO And Reward Modeling

Use DPO when chosen/rejected pairs exist and the objective is preference
alignment after SFT. Use reward modeling when a reusable scorer is needed for a
later RL loop. Check that preferences do not reward shortcuts such as length,
format-only compliance, or leaked labels.

## GRPO

Use GRPO for online RL where the model samples multiple completions for a prompt
and receives rewards from a verifier, function, judge, or environment. Start
with prompt-only data and small generation settings before scaling.

## Environment GRPO

Use environments when agent success depends on state and actions. Keep the
environment interface separate from reward logic and trainer logic. Record
rollouts because successful traces can become distillation data.

## Self-Distillation

Use self-distillation after there are verified successful traces. Convert traces
into SFT messages, chosen/rejected preference pairs, or prompt-only tasks with
reward metadata. Filter aggressively.
