# Trace Schema

Store enough context to reconstruct agent behavior:

- task id
- split
- prompt/messages
- tools available
- model id
- generation parameters
- step index
- action or tool call
- observation or tool result
- intermediate reasoning field if intentionally collected
- terminal status
- reward components
- verifier output
- judge critique
- accepted/rejected flag

Conversions:

- SFT: user/system/tool messages plus accepted assistant actions.
- DPO: accepted trace as chosen, comparable failed trace as rejected.
- GRPO: prompt-only task plus reward/verifier function.
