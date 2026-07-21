/** Auto-maintained course lessons for the SFT interactive playbook. */
(function(root, factory){
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SFT_COURSE_DATA = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  return [
  {
    "id": "o1",
    "module": "Orientation",
    "title": "What this course teaches",
    "time": "5 min",
    "level": "Beginner",
    "objectives": [
      "See the full path from SFT concept to evaluated run and copilot tasking.",
      "Understand the capstone report and acceptance checks you will produce."
    ],
    "why": "A training run is only useful if you understand what was optimized, what data was used, and what evidence supports the result.",
    "body": [
      "This course is a self-contained interactive HTML course for supervised fine-tuning agentic models. Each lesson has objectives, explanation, example, activity, quiz, reflection, and local progress.",
      "You will learn SFT theory, TRL dataset formats, chat templates, tokenization, loss masking (assistant_only_loss / completion_only_loss), agentic traces, tool calling, LoRA/QLoRA smoke runs, training diagnostics, behavioral evaluation, and how to task agentic copilots and accept or reject their training work.",
      "Companion scripts in examples/sft-mentor-lab/ support inspect → smoke train → score workflows. The capstone is a cautious reproducible report, not a leaderboard claim."
    ],
    "example": "Final capstone claim style: 'The adapter improved format validity on 35 frozen held-out prompts from 61% to 86%; OOD score was unchanged; task success remains unproven.'",
    "activity": "behavior_picker",
    "quiz": {
      "q": "What should the final capstone include?",
      "options": [
        [
          "Only a lower train loss screenshot.",
          false,
          "Loss alone is not behavior evidence."
        ],
        [
          "A reproducible SFT run plus baseline-vs-SFT evaluation and risks.",
          true,
          "Correct. The report combines run evidence and behavior evidence."
        ],
        [
          "A checkpoint path with no config or eval.",
          false,
          "Artifacts need configs, logs, and evaluation outputs."
        ]
      ]
    },
    "reflection": "Which agentic behavior do you want to train first?"
  },
  {
    "id": "m1l1",
    "module": "Module 1 — SFT Mental Model",
    "title": "SFT as target-token imitation",
    "time": "8 min",
    "level": "Beginner",
    "objectives": [
      "Explain SFT in plain English.",
      "Identify context and target tokens."
    ],
    "why": "Every later decision depends on understanding what SFT optimizes at the token level.",
    "body": [
      "Supervised fine-tuning trains a model to imitate target tokens in curated examples. Given context tokens, the model is optimized to assign higher probability to the desired continuation.",
      "For chat data, the targets are usually assistant tokens. For agentic data, targets may be tool calls, recovery turns, concise summaries of tool observations, or final answers."
    ],
    "example": "User: 'Why did the command fail?' Assistant: 'The file path is missing. Check the directory and retry.' In assistant-only SFT, the assistant response is target behavior and the user prompt is context.",
    "activity": "token_highlight",
    "quiz": {
      "q": "Train loss decreased after SFT. What can you safely claim?",
      "options": [
        [
          "The model is now a better agent.",
          false,
          "That requires behavioral or task-level evaluation."
        ],
        [
          "The model fit the supervised target tokens better under this setup.",
          true,
          "Correct. Loss measures fit to targets."
        ],
        [
          "The eval split has no leakage.",
          false,
          "Leakage must be audited separately."
        ]
      ]
    },
    "reflection": "In one sentence, what does SFT optimize?"
  },
  {
    "id": "m1l2",
    "module": "Module 1 — SFT Mental Model",
    "title": "What SFT can and cannot prove",
    "time": "7 min",
    "level": "Beginner",
    "objectives": [
      "Name behaviors SFT can teach.",
      "Avoid overclaiming from training metrics."
    ],
    "why": "SFT is a strong first rung, but it is not a reward optimizer or benchmark proof.",
    "body": [
      "SFT can teach format, instruction style, tool-call shape, trace summarization, and recovery patterns when demonstrations show those behaviors.",
      "SFT does not directly optimize task success. A model can learn the style of a good trace while still failing the real task."
    ],
    "example": "A fine-tuned model may produce valid JSON more often but still choose the wrong tool. Score format validity separately from tool choice and task correctness.",
    "activity": "claim_classifier",
    "quiz": {
      "q": "Which claim needs more than SFT loss?",
      "options": [
        [
          "The smoke script ran and saved an adapter.",
          false,
          "Logs can support this mechanical claim."
        ],
        [
          "Held-out target-token loss improved on a clean split.",
          false,
          "Eval loss can support this narrow claim."
        ],
        [
          "The model became a better coding agent.",
          true,
          "Correct. That needs task-level coding or agent evals."
        ]
      ]
    },
    "reflection": "What is one thing SFT can teach well, and one thing it cannot guarantee?"
  },
  {
    "id": "m1l3",
    "module": "Module 1 — SFT Mental Model",
    "title": "SFT vs DPO vs GRPO vs distillation",
    "time": "9 min",
    "level": "Beginner",
    "objectives": [
      "Choose a method from the available data and reward signal.",
      "Know why SFT often comes first."
    ],
    "why": "Agentic post-training is staged. Use demonstrations for SFT, preferences for DPO, verifiable rewards for GRPO, and filtered successful rollouts for distillation.",
    "body": [
      "Start with SFT when the model needs to learn the interaction protocol or imitate successful behavior. Move to DPO when you have reliable chosen/rejected pairs. Move to GRPO/RL when you have prompt-only tasks and a verifiable reward. Use self-distillation to turn verified successful traces into future training data.",
      "SFT before RL often makes rewards less sparse because the model can already produce parseable actions."
    ],
    "example": "If you have unit tests for generated code, GRPO can optimize pass/fail once the model can produce valid code attempts. If you only have successful examples, start with SFT.",
    "activity": "method_chooser",
    "quiz": {
      "q": "You have prompt-only tasks and deterministic unit-test rewards. What is a natural next method after basic SFT?",
      "options": [
        [
          "GRPO or another RL method using the verifier reward.",
          true,
          "Correct. Verifiable rewards enable RL optimization."
        ],
        [
          "Full LM SFT on raw logs.",
          false,
          "That ignores the reward and can teach noise."
        ],
        [
          "No eval; just train longer.",
          false,
          "Training longer is not a method choice."
        ]
      ]
    },
    "reflection": "When would you stop doing more SFT and move to GRPO?"
  },
  {
    "id": "m2l1",
    "module": "Module 2 — Dataset Formats",
    "title": "TRL SFT dataset shapes",
    "time": "10 min",
    "level": "Beginner",
    "objectives": [
      "Recognize `text`, `messages`, and `prompt`/`completion` rows.",
      "Know when custom traces need preprocessing."
    ],
    "why": "Wrong data shape can make the trainer learn the wrong tokens or fail silently.",
    "body": [
      "Common SFT shapes are: `text` for language modeling, `messages` for conversational data, `prompt` plus `completion` for direct instruction, and conversational prompt/completion lists for multi-turn context with a target continuation.",
      "Raw traces or custom JSON should be converted into one of these teachable forms before calling the trainer."
    ],
    "example": "`messages: [{role: user, content: ...}, {role: assistant, content: ...}]` is conversational. `prompt: ..., completion: ...` is direct prompt/completion. A raw terminal session needs filtering, redaction, and conversion.",
    "activity": "dataset_classifier",
    "quiz": {
      "q": "A row has `prompt` and `completion`, and only the answer should be learned. Which loss style fits?",
      "options": [
        [
          "Completion-only loss.",
          true,
          "Correct. Prompt conditions the model; completion is target."
        ],
        [
          "Full LM loss on both prompt and completion.",
          false,
          "That also trains prompt tokens as targets."
        ],
        [
          "No target tokens.",
          false,
          "The completion is the target."
        ]
      ]
    },
    "reflection": "What dataset shape will your first SFT dataset use?"
  },
  {
    "id": "m2l2",
    "module": "Module 2 — Dataset Formats",
    "title": "Clean splits and leakage",
    "time": "10 min",
    "level": "Practical",
    "objectives": [
      "Explain why row-level random splits can leak.",
      "Choose a split unit for traces, tasks, and conversations."
    ],
    "why": "A leaky eval split measures memorization or same-source overlap, not generalization.",
    "body": [
      "Split by the original contamination unit before converting one source into many SFT rows. For traces, split by session, source file, task ID, conversation ID, or benchmark problem ID — not by assistant turn.",
      "A credible split should include a manifest with IDs, seed, counts, and duplicate checks. Hash normalized prompts/completions and inspect near duplicates."
    ],
    "example": "One terminal session can produce 30 assistant-turn examples. If rows 1–20 go to train and 21–30 go to eval, the eval still contains the same task context.",
    "activity": "split_simulator",
    "quiz": {
      "q": "For agent traces, what is safer than random row splitting?",
      "options": [
        [
          "Split by session/task/source before creating many SFT rows.",
          true,
          "Correct. Split by contamination unit."
        ],
        [
          "Split every assistant message randomly.",
          false,
          "That can leak same-session context."
        ],
        [
          "Skip eval because traces are complex.",
          false,
          "Hard eval is not a reason to omit it."
        ]
      ]
    },
    "reflection": "What contamination unit would you split by?"
  },
  {
    "id": "m2l3",
    "module": "Module 2 — Dataset Formats",
    "title": "Convert examples into trainable rows",
    "time": "12 min",
    "level": "Practical",
    "objectives": [
      "Convert instruction/answer data to prompt/completion.",
      "Convert chat to messages.",
      "Filter raw traces into teachable turns."
    ],
    "why": "Dataset conversion is where you decide what the student should imitate and what it should ignore.",
    "body": [
      "For direct instruction data, use prompt/completion. For multi-turn chat, use messages. For traces, decide whether the target is final answers, tool calls, recovery behavior, summaries, or full transcripts.",
      "Do not train on hidden reasoning, secrets, private code, screenshots, irrelevant tool noise, held-out labels, or unreleased tests."
    ],
    "example": "Raw trace → clean messages: user task, sanitized failed observation, assistant diagnosis, corrected tool call, final answer. Drop unrelated logs and redact private paths.",
    "activity": "converter_lab",
    "quiz": {
      "q": "A raw trace contains a private API key in tool output. Completion-only loss is enabled. Is it safe?",
      "options": [
        [
          "Yes, masked context is impossible to leak.",
          false,
          "Masked context can still appear in logs, artifacts, and model context."
        ],
        [
          "No. Redact or reject before training, logging, or publishing.",
          true,
          "Correct. Masking is not a privacy boundary."
        ],
        [
          "Only if max length is small.",
          false,
          "Truncation is not a privacy policy."
        ]
      ]
    },
    "reflection": "What would you drop or redact from a raw trace?"
  },
  {
    "id": "m3l1",
    "module": "Module 3 — Templates And Masking",
    "title": "Chat templates and EOS",
    "time": "9 min",
    "level": "Practical",
    "objectives": [
      "Explain why raw messages become model-specific text.",
      "Inspect rendered examples and EOS/pad behavior."
    ],
    "why": "The model trains on rendered tokens, not your mental picture of JSON roles.",
    "body": [
      "A tokenizer chat template converts messages into the exact text and special tokens used by the model. Training and inference templates should match.",
      "Before training, inspect raw rows, rendered text, token lengths, EOS token, pad token, and decoded samples."
    ],
    "example": "The same messages row may render differently for Qwen, Llama, or Gemma. A mismatch can make the model fail to recognize the conversation format at inference time.",
    "activity": "template_renderer",
    "quiz": {
      "q": "Why inspect formatted examples instead of only raw rows?",
      "options": [
        [
          "The model trains on rendered/tokenized text.",
          true,
          "Correct. Rendering is the actual training input."
        ],
        [
          "Raw rows are always invalid.",
          false,
          "They may be valid but still need rendering checks."
        ],
        [
          "EOS tokens never matter.",
          false,
          "EOS/stop behavior matters for training and generation."
        ]
      ]
    },
    "reflection": "What template/tokenization issue would you check first?"
  },
  {
    "id": "m3l2",
    "module": "Module 3 — Templates And Masking",
    "title": "Truncation and target survival",
    "time": "8 min",
    "level": "Practical",
    "objectives": [
      "Detect when max length cuts off target behavior.",
      "Choose filtering, chunking, compression, or longer context."
    ],
    "why": "Long traces often put the decisive assistant/tool turn near the end. Truncation can remove what you wanted to teach.",
    "body": [
      "If an example exceeds `max_length`, verify that target tokens remain and the example does not become a zero-target row.",
      "For long traces, use shorter examples, summarize observations, filter by length, or increase max length if compute allows."
    ],
    "example": "A 4096-token trace with the final answer at token 3900 fails under max_length 2048 if the target is cut off.",
    "activity": "truncation_checker",
    "quiz": {
      "q": "A long trace is truncated before the assistant recovery turn. What should you do?",
      "options": [
        [
          "Train anyway; context is enough.",
          false,
          "The target behavior was removed."
        ],
        [
          "Filter, compress, chunk, or increase max length after verifying target survival.",
          true,
          "Correct. Preserve the target turn."
        ],
        [
          "Disable eval to avoid the issue.",
          false,
          "Eval does not fix training data truncation."
        ]
      ]
    },
    "reflection": "What is your max-length policy for long examples?"
  },
  {
    "id": "m3l3",
    "module": "Module 3 — Templates And Masking",
    "title": "Loss masking and label inspection",
    "time": "12 min",
    "level": "Practical",
    "objectives": [
      "Choose assistant-only, completion-only, or full LM loss.",
      "Understand ignored labels (`-100`) conceptually.",
      "Verify actual labels instead of trusting intent."
    ],
    "why": "The intended targets and the actual labels can differ. Assistant-only masking depends on chat-template support; completion-only depends on formatting.",
    "body": [
      "Ignored labels (default -100) do not contribute to loss. Target labels do. Inspect a tokenized batch and confirm which tokens are ignored and which are learned.",
      "TRL flags: assistant_only_loss=True for conversational data when the chat template supports {% generation %} spans (TRL patches known families). For prompt/completion data, completion_only_loss defaults to True (prompt ignored). Full LM loss is safe only when every token is intended imitation.",
      "Never assume the flag matched intent — decode labels for a sample batch."
    ],
    "example": "messages + assistant_only_loss=True: user/system tokens ignored, assistant tokens trained. prompt/completion: completion tokens trained by default. text: full sequence unless you preprocess masks.",
    "activity": "masking_simulator",
    "quiz": {
      "q": "What should you do before trusting a masking flag?",
      "options": [
        [
          "Inspect tokenized labels and verify ignored vs target tokens.",
          true,
          "Correct. Verify actual labels."
        ],
        [
          "Assume every tokenizer supports assistant spans.",
          false,
          "Template support varies."
        ],
        [
          "Use full LM loss to avoid decisions.",
          false,
          "Full LM can teach unintended or unsafe tokens."
        ]
      ]
    },
    "reflection": "Which tokens should receive loss in your planned data?"
  },
  {
    "id": "m4l1",
    "module": "Module 4 — Agentic Traces And Tools",
    "title": "Trace triage and privacy",
    "time": "12 min",
    "level": "Practical",
    "objectives": [
      "Decide what to imitate from a trace.",
      "Redact or reject unsafe trace content."
    ],
    "why": "Agent traces are valuable but can contain secrets, private code, local paths, screenshots, personal data, hidden tests, answer keys, and benchmark labels.",
    "body": [
      "Choose the target behavior: final answer, tool-call decision, repair behavior, concise observation summary, or full transcript only when every token is safe.",
      "Completion-only loss does not make private context safe. Masked tokens can still appear in context, logs, trackers, prepared examples, and artifacts."
    ],
    "example": "Keep a sanitized failed observation and the assistant’s recovery. Drop API tokens, private repo paths, screenshots, hidden labels, and irrelevant terminal noise.",
    "activity": "trace_triage",
    "quiz": {
      "q": "Which trace content must be removed or explicitly approved before training/logging/publishing?",
      "options": [
        [
          "Secrets, private code, personal data, hidden labels, unreleased tests, and answer keys.",
          true,
          "Correct. Trace privacy is non-optional."
        ],
        [
          "Only assistant messages.",
          false,
          "Tool outputs and prompts can leak too."
        ],
        [
          "Nothing if training is local.",
          false,
          "Local runs can still log or publish artifacts."
        ]
      ]
    },
    "reflection": "What is your trace redaction rule?"
  },
  {
    "id": "m4l2",
    "module": "Module 4 — Agentic Traces And Tools",
    "title": "Tool-calling SFT",
    "time": "11 min",
    "level": "Practical",
    "objectives": [
      "Represent tool calls, results, and schemas correctly.",
      "Evaluate tool-call validity separately from final answer quality."
    ],
    "why": "Valid-looking tool calls are not necessarily correct. Tool SFT must teach syntax, tool choice, arguments, observations, and recovery.",
    "body": [
      "Tool examples should include conversation messages, assistant tool calls in the model’s expected structure, tool-role messages or observations, and tool schemas when required.",
      "Train/eval tool schemas must match or the mismatch must be documented. Do not accept invented tool outputs."
    ],
    "example": "Bad: assistant calls `search_web` when only `search` exists. Better: exact tool name, valid JSON arguments, actual observation, and a grounded final answer.",
    "activity": "tool_validator",
    "quiz": {
      "q": "Valid JSON alone proves what?",
      "options": [
        [
          "Only that the format may be valid, not that the tool choice or answer is correct.",
          true,
          "Correct. Format and correctness are separate."
        ],
        [
          "The agent solved the task.",
          false,
          "Task success needs semantic or verifier evidence."
        ],
        [
          "Leakage is impossible.",
          false,
          "Leakage is unrelated."
        ]
      ]
    },
    "reflection": "What tool-call dimensions will you score separately?"
  },
  {
    "id": "m5l1",
    "module": "Module 5 — Running TRL SFT",
    "title": "SFTTrainer anatomy",
    "time": "10 min",
    "level": "Practical",
    "objectives": [
      "Identify the responsibilities of SFTTrainer, SFTConfig, tokenizer, dataset, PEFT config, eval dataset, logging, and output directory.",
      "Know what a smoke run proves."
    ],
    "why": "A training command has many moving parts. A small smoke run verifies mechanics before GPU spend.",
    "body": [
      "SFTTrainer orchestrates model, processing_class (tokenizer/processor), dataset, SFTConfig, optional peft_config / quantization_config, and evaluation. SFTConfig stores max_length, steps/epochs, batch size, eval_strategy, seed, packing, assistant_only_loss, completion_only_loss, and output_dir.",
      "A smoke run should load data/model, tokenize/format, train a few steps, save, and generate one sample. It should not claim benchmark improvement. If eval_strategy is enabled, provide an eval_dataset."
    ],
    "example": "If `eval_strategy` is enabled but the eval dataset is not clean, eval metrics are misleading. If artifacts are committed to the context repo, repo boundaries are violated.",
    "activity": "pipeline_match",
    "quiz": {
      "q": "What may a 5-step smoke run claim?",
      "options": [
        [
          "The model is production-ready.",
          false,
          "Smoke runs validate mechanics only."
        ],
        [
          "The script loaded, trained briefly, saved, and generated if logs show those steps.",
          true,
          "Correct. Keep smoke claims narrow."
        ],
        [
          "Benchmark score improved.",
          false,
          "That needs benchmark evaluation."
        ]
      ]
    },
    "reflection": "What must your smoke run verify?"
  },
  {
    "id": "m5l2",
    "module": "Module 5 — Running TRL SFT",
    "title": "LoRA basics and config",
    "time": "11 min",
    "level": "Practical",
    "objectives": [
      "Explain why LoRA/QLoRA is practical for beginner SFT.",
      "Build a minimal reproducible command/config and verify adapter reload."
    ],
    "why": "LoRA/PEFT lets you iterate cheaply by training adapter weights instead of all base model weights, but adapters must be loaded and evaluated correctly.",
    "body": [
      "LoRA/PEFT trains low-rank adapter weights while most base weights stay frozen, which is practical for iteration. Record rank, alpha, dropout, target modules if customized, trainable parameter count, dtype, max length, seed, output path, and package versions.",
      "QLoRA combines quantization (e.g. BitsAndBytesConfig via SFTTrainer quantization_config) with LoRA adapters to reduce memory. Same eval rule: verify the quantized base + adapter load path.",
      "An adapter path alone is not evidence. It must be reloadable, linked to config, and paired with eval outputs. False comparisons happen when the SFT adapter is not actually loaded during evaluation."
    ],
    "example": "A false comparison happens when the SFT adapter is not actually loaded during evaluation. Verify baseline has no adapter and SFT does.",
    "activity": "config_builder",
    "quiz": {
      "q": "During LoRA SFT, what usually changes?",
      "options": [
        [
          "Adapter weights while most base model weights stay frozen.",
          true,
          "Correct."
        ],
        [
          "Only dataset files.",
          false,
          "Training updates model parameters/adapters."
        ],
        [
          "All benchmark scores by definition.",
          false,
          "Scores require eval."
        ]
      ]
    },
    "reflection": "Where will you store artifacts, and how will you verify they reload?"
  },
  {
    "id": "m5l3",
    "module": "Module 5 — Running TRL SFT",
    "title": "Training-health diagnostics",
    "time": "12 min",
    "level": "Practical",
    "objectives": [
      "Interpret train loss, eval loss, train/eval gap, token accuracy, throughput, and artifacts.",
      "Map symptoms to likely debugging actions."
    ],
    "why": "Training metrics are health signals. They debug the run but do not prove behavior improvement.",
    "body": [
      "Flat loss can mean missing target labels, frozen/no trainable adapter modules, bad LR, or data problems. Rising eval loss with falling train loss suggests overfit or mismatch.",
      "No eval split means no held-out target-token fit claim. Missing artifacts mean the run cannot be audited or reused."
    ],
    "example": "Train loss falls, eval loss rises, and outputs become more templated but less correct: report specialization or overfit risk, not success.",
    "activity": "training_triage",
    "quiz": {
      "q": "Eval loss rises while train loss falls. What is the concern?",
      "options": [
        [
          "Overfitting or train/eval mismatch.",
          true,
          "Correct."
        ],
        [
          "Guaranteed generalization.",
          false,
          "It suggests the opposite risk."
        ],
        [
          "No need for behavior eval.",
          false,
          "Behavior eval is still needed."
        ]
      ]
    },
    "reflection": "What would you check first if train loss is flat?"
  },
  {
    "id": "m6l1",
    "module": "Module 6 — Evaluation And Claims",
    "title": "Freeze the behavioral evaluation",
    "time": "10 min",
    "level": "Practical",
    "objectives": [
      "Design a fixed baseline-vs-SFT protocol.",
      "Prevent prompt, rubric, and decoding cherry-picking."
    ],
    "why": "If you change prompts, decoding, or scoring after seeing outputs, your comparison becomes biased.",
    "body": [
      "Freeze prompts, rubric, evaluator version, decoding settings, chat template, system prompt, tool schemas, and scoring method before comparing baseline and SFT.",
      "Use the same base model, tokenizer, template, system prompt, tools, max tokens, temperature, top-p, stop strings, and evaluator. The SFT run should differ by loading the adapter."
    ],
    "example": "A good eval pack includes in-domain prompts, OOD prompts, format-stress prompts, tool-calling prompts, and recovery prompts. Report all categories, not cherry-picked wins.",
    "activity": "eval_protocol",
    "quiz": {
      "q": "When should the eval prompt set and rubric be frozen?",
      "options": [
        [
          "Before looking at baseline/SFT outputs.",
          true,
          "Correct. Freeze before comparison."
        ],
        [
          "After seeing which prompts the SFT model wins.",
          false,
          "That cherry-picks the eval."
        ],
        [
          "Only after publishing the adapter.",
          false,
          "Too late for valid comparison."
        ]
      ]
    },
    "reflection": "What categories will your held-out eval set include?"
  },
  {
    "id": "m6l2",
    "module": "Module 6 — Evaluation And Claims",
    "title": "Manual rubric and A/B scoring",
    "time": "11 min",
    "level": "Practical",
    "objectives": [
      "Score baseline and SFT outputs with separated dimensions.",
      "Distinguish format gains from correctness gains."
    ],
    "why": "Rubrics can reward degenerate success if they blur format, correctness, safety, and task success.",
    "body": [
      "Score correctness, instruction following, format validity, helpfulness, brevity/control, safety/no fake tools, and for agentic examples: tool-call validity, argument quality, recovery, and environment/test success.",
      "Valid JSON is not a correct tool call. A shorter answer is not necessarily better. A created file is not task success."
    ],
    "example": "If SFT raises format validity from 50% to 90% but correctness falls, the valid claim is formatting improvement with correctness regression risk, not better general ability.",
    "activity": "score_interpreter",
    "quiz": {
      "q": "The SFT output is valid JSON but uses the wrong tool. How should it be scored?",
      "options": [
        [
          "High format validity, lower tool-choice/task correctness.",
          true,
          "Correct. Score dimensions separately."
        ],
        [
          "Full success because JSON is valid.",
          false,
          "Format is not task success."
        ],
        [
          "Ignore tool choice because loss improved.",
          false,
          "Behavior scoring must inspect behavior."
        ]
      ]
    },
    "reflection": "Which rubric dimensions matter most for your target behavior?"
  },
  {
    "id": "m6l3",
    "module": "Module 6 — Evaluation And Claims",
    "title": "Writing cautious result claims",
    "time": "9 min",
    "level": "Practical",
    "objectives": [
      "Match claims to evidence.",
      "Record reproducibility metadata and residual risks."
    ],
    "why": "A strong report is conservative. It says exactly what improved, under what protocol, and what remains unproven.",
    "body": [
      "Every result claim should name the baseline, trained artifact, eval set, sample count, decoding settings, metric, score delta, and regressions.",
      "Scientific evidence comes from saved commands, configs, logs, artifacts, split manifests, and eval outputs. Course progress and manual notes are not evidence by themselves."
    ],
    "example": "Good: 'Held-out target-token loss improved from 1.21 to 1.05 on a session-level split; behavior score improved +1.3/10 on 35 frozen prompts, with OOD neutral.' Bad: 'The model is agentic now.'",
    "activity": "claim_builder",
    "quiz": {
      "q": "Which evidence is required to claim tool-calling improved?",
      "options": [
        [
          "Only lower train loss.",
          false,
          "Loss alone is not tool behavior evidence."
        ],
        [
          "Baseline-vs-SFT tool eval with fixed prompts, same schemas/settings, and separate validity/correctness scores.",
          true,
          "Correct."
        ],
        [
          "A course progress percentage.",
          false,
          "Course progress is not scientific evidence."
        ]
      ]
    },
    "reflection": "Write one cautious claim you would be comfortable defending."
  },
  {
    "id": "m7l1",
    "module": "Module 7 — Tasking Agentic Copilots",
    "title": "Write an SFT task brief a copilot can execute",
    "time": "12 min",
    "level": "Practical",
    "objectives": [
      "Draft a task brief with goal, constraints, deliverables, and non-claims.",
      "Point the copilot at real scripts/flags instead of inventing APIs."
    ],
    "why": "You do not need to write SFTTrainer from scratch when you have agentic copilots. You do need to specify the job so the agent produces an auditable run instead of a vague 'I fine-tuned it' reply.",
    "body": [
      "A good SFT task brief states: target behavior, base model + revision, dataset + shape, masking intent, smoke vs real-run budget, artifact location outside the tracked context repo, and eval expectations.",
      "Prefer copy-paste commands that match real CLIs (for example examples/sft-mentor-lab/train_lora_sft.py flags: --model-name, --dataset-name, --output-dir, --max-steps, --max-seq-length). Ask the agent to inspect data before training.",
      "Always include non-claims: a smoke run proves mechanics (load, train a few steps, save, sample generate), not agent quality."
    ],
    "example": "Brief snippet: 'Using uv run examples/sft-mentor-lab/train_lora_sft.py, smoke-train Qwen/Qwen2.5-0.5B-Instruct on trl-lib/Capybara for 5 steps with LoRA. Deliver: command, logs path, final_adapter path, one generation, and explicit list of claims you are NOT making.'",
    "activity": "task_brief_builder",
    "quiz": {
      "q": "What is the minimum a copilot SFT smoke brief should demand?",
      "options": [
        [
          "Only 'fine-tune the model until it is good'.",
          false,
          "Vague goals produce unauditable work."
        ],
        [
          "Exact command/script, inspect-before-train, artifact path, and non-claims for smoke vs eval.",
          true,
          "Correct. Briefs must be executable and bounded."
        ],
        [
          "A claim that the agent is production-ready after 5 steps.",
          false,
          "Smoke cannot prove production readiness."
        ]
      ]
    },
    "reflection": "Paste or outline the brief you would give a copilot for your first SFT smoke."
  },
  {
    "id": "m7l2",
    "module": "Module 7 — Tasking Agentic Copilots",
    "title": "Acceptance checks for agent training outputs",
    "time": "11 min",
    "level": "Practical",
    "objectives": [
      "Define mechanical acceptance vs behavioral acceptance.",
      "Reject incomplete agent deliverables with a checklist."
    ],
    "why": "Agents can produce confident prose without a reloadable adapter, clean split, or frozen eval. Your job is to accept or reject against checks.",
    "body": [
      "Mechanical acceptance: process exits cleanly; dataset shape recognized; if eval_strategy is on, eval_dataset exists; adapter path reloads; train log shows steps; generation sample exists; no secrets in logs.",
      "Behavioral acceptance: frozen prompt pack; baseline and SFT use same decoding/template/tools; separate format vs correctness scores; residual risks listed.",
      "Course progress percentage and chat summaries are not scientific evidence. Require commands, configs, logs, split manifests, and score sheets."
    ],
    "example": "Reject if the agent reports 'loss went down so tool calling improved' without a frozen tool eval and adapter-load verification.",
    "activity": "acceptance_checklist",
    "quiz": {
      "q": "An agent returns only a lower train-loss screenshot. Accept as behavior improvement?",
      "options": [
        [
          "Yes — lower loss always means better agents.",
          false,
          "Loss is target-token fit, not task success."
        ],
        [
          "No — require frozen baseline-vs-SFT behavior scores and reloadable artifacts.",
          true,
          "Correct. Separate mechanical fit from behavior claims."
        ],
        [
          "Yes if the course progress bar is 100%.",
          false,
          "Course progress is not experiment evidence."
        ]
      ]
    },
    "reflection": "List three acceptance checks you will never skip."
  },
  {
    "id": "m7l3",
    "module": "Module 7 — Tasking Agentic Copilots",
    "title": "Common failure modes when reviewing agent work",
    "time": "12 min",
    "level": "Practical",
    "objectives": [
      "Recognize silent wrong-shape training, missing eval, unloaded adapters, cherry-picked evals, and overclaims.",
      "Respond with a concrete fix request instead of redoing everything yourself."
    ],
    "why": "Review is a skill. Naming the failure mode lets you send the copilot a precise repair task.",
    "body": [
      "Silent wrong shape: columns are not messages/text/prompt+completion and the agent still 'trains'. Fix: force inspect_dataset.py (or equivalent) and conversion.",
      "Eval misconfiguration: eval_strategy enabled without eval_dataset, or random row splits of multi-turn sessions. Fix: held-out unit + explicit eval data.",
      "Unloaded adapter / cherry-picked prompts / overclaim from loss: fix with load checks, frozen packs, and claim-to-evidence matching.",
      "When something fails, re-task the agent with the failure name, the check that failed, and the artifact you expect next — do not restart from zero unless the brief was wrong."
    ],
    "example": "Repair brief: 'Failure mode: no_adapter_load. Re-run baseline without adapter and SFT with PeftModel load from outputs/.../final_adapter. Return both generation logs and confirm which path loaded the adapter.'",
    "activity": "review_failure_modes",
    "quiz": {
      "q": "Best next action when eval prompts were edited after seeing SFT outputs?",
      "options": [
        [
          "Keep the edited prompts; they show the model’s best side.",
          false,
          "That cherry-picks the eval."
        ],
        [
          "Name cherry_eval, restore the frozen pack, and re-score baseline and SFT under identical settings.",
          true,
          "Correct. Fix the protocol, then re-run comparison."
        ],
        [
          "Delete the adapter and abandon SFT.",
          false,
          "Protocol repair is enough; do not throw away a valid artifact without reason."
        ]
      ]
    },
    "reflection": "Which failure mode have you seen (or expect) most often from coding agents?"
  }
];
});
