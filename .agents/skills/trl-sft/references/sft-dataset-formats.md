# SFT Dataset Formats

Use TRL-supported SFT shapes:

- language modeling: `text`
- conversational language modeling: `messages`
- prompt/completion: `prompt`, `completion`
- conversational prompt/completion: list-of-message `prompt`, list-of-message
  `completion`

Masking:

- Use assistant-only loss for multi-turn chat if the tokenizer chat template
  supports assistant generation spans.
- Use completion-only loss for prompt/completion examples where prompts should
  not be learned as targets.
- Use full LM loss for raw text corpora or trace transcripts only when every
  token is intended as target behavior.

Before training:

- inspect columns and a few examples
- confirm train/eval split policy
- verify chat template and EOS token
- run a tokenization smoke test
- verify truncation does not remove the decisive assistant/tool turn
