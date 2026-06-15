# Resource Map

These are the source families this context is built around.

## Codex Context

- Codex sub-agents: https://developers.openai.com/codex/subagents
- Codex skills: https://developers.openai.com/codex/skills
- AGENTS.md guidance: https://developers.openai.com/codex/guides/agents-md

Implementation implications:

- keep durable project rules in `AGENTS.md`
- keep custom sub-agents in `.codex/agents/*.toml`
- keep repo skills in `.agents/skills/*/SKILL.md`
- explicitly ask for sub-agents before expecting parallel work

## TRL

- TRL docs: https://huggingface.co/docs/trl
- TRL CLI docs: https://huggingface.co/docs/trl/en/clis
- SFT trainer: https://huggingface.co/docs/trl/en/sft_trainer
- GRPO trainer: https://huggingface.co/docs/trl/en/grpo_trainer
- Dataset formats: https://huggingface.co/docs/trl/en/dataset_formats
- TRL skill example: https://github.com/huggingface/trl/tree/main/trl/skills/trl-training
- Hub agent traces: https://huggingface.co/docs/hub/agent-traces
- Synthetic trace dataset: https://huggingface.co/datasets/julien-c/synthtraces

Implementation implications:

- use conversational formats for chat and tool-calling agents
- review and redact raw agent traces before turning them into SFT data
- use prompt-only datasets for online RL methods such as GRPO
- use trainer config files or TRL CLI configs for reproducible challenges
- prefer maintained trainer APIs before custom loops

## Hugging Face Training Workflows

- LLM trainer skill references:
  https://github.com/huggingface/skills/tree/main/skills/huggingface-llm-trainer/references
- Hugging Face CLI docs: https://huggingface.co/docs/huggingface_hub/guides/cli
- Trackio docs: https://huggingface.co/docs/trackio

Implementation implications:

- validate dataset format before expensive jobs
- push models or artifacts explicitly from ephemeral runners
- use Trackio for long or remote training runs
- for remote HF Jobs, prefer a hosted Trackio Space via `space_id` so metrics
  survive ephemeral runners

## OpenEnv

- OpenEnv blog: https://huggingface.co/blog/openenv-agentic-rl
- OpenEnv repository: https://github.com/huggingface/OpenEnv

Implementation implications:

- treat OpenEnv as the environment interoperability layer
- keep reward definition in the training/eval layer
- expose familiar reset, step, and state semantics
- package environments so train and eval can use the same interface

## Prior Config Inspiration

- Pre-training config:
  https://github.com/burtenshaw/multiautoresearch/blob/main/pre-training/.codex/config.toml
- Agentic research lab note:
  https://x.com/ben_burtenshaw/status/2039340340658802849

Implementation implications:

- keep a small set of named agents
- separate planner, runner, reviewer, reporter, and researcher roles
- make memory updates explicit instead of mixing notes into transient logs
