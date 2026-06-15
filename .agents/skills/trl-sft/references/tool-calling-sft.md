# Tool-Calling SFT

Tool-calling SFT examples should include:

- conversation messages
- assistant tool calls in the model's expected structure
- tool role messages or tool results
- a `tools` column containing available tool schemas when required by the
  model/template

Checks:

- tool names in messages match tool schemas
- arguments are valid JSON or the model's expected structured format
- tool result observations do not leak held-out labels
- examples include both successful and recovery behavior
- evaluation checks tool-call validity separately from final answer quality

Use short examples first. Tool-call formatting bugs often appear before model
quality matters.
