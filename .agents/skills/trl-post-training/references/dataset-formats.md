# Dataset Formats

TRL commonly uses these dataset shapes:

- language modeling: `text` or conversational `messages`
- prompt-only: `prompt`
- prompt/completion: `prompt` and `completion`
- preference: `prompt`, `chosen`, and `rejected`
- tool calling: messages plus tool-call and tool-result fields supported by the
  target model's chat template

Guidelines:

- Use conversational formats for chat agents.
- Use prompt-only data for GRPO/RLOO-style generation and reward methods.
- Use preference data for DPO and reward modeling.
- Preprocess bespoke datasets into one of the TRL-supported shapes before
  writing trainer code.
- Keep train, validation, and held-out eval splits explicit.

Loss masking:

- Assistant-only loss is appropriate for multi-turn chat when the chat template
  exposes assistant spans.
- Completion-only loss is appropriate for prompt/completion SFT when prompts
  should not contribute to the target loss.
- Padding and ignored labels should not contribute to reported loss.
