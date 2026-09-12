# Copyright 2020-2026 The HuggingFace Team. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# /// script
# dependencies = [
#     "vllm",
#     "openai",
#     "datasets>=3.2",
#     "openenv-coding_env @ git+https://huggingface.co/spaces/sergiopaniego/coding-env",
# ]
# ///

"""
Held-out eval for the Class 4 white-box coding demo.

Runs each model on the MBPP sanitized TEST split (never seen in training) with the
same prompt, the same run_python tool loop, and the same env-side scoring as the
training script (fraction of hidden tests passed, executed in the session where the
model defined its function). Serves each model with vLLM in turn and reports the
mean score, so the comparison is one clean number per model.
"""

import argparse
import concurrent.futures
import json
import statistics
import subprocess
import sys
import time

from datasets import load_dataset
from openai import OpenAI

from coding_env import CodeAction, CodingEnv

TASK_TEMPLATE = """You are an expert Python programmer solving a task inside a live Python session.

Rules:
1. Use the tool `run_python` to write and test your code. Variables and functions persist between calls.
2. Define exactly the function the task asks for. The example test shows the expected signature.
3. Hidden tests will run in this same session after you finish, so your final function must be defined and correct.

Task: {task}

Example test: {example_test}
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "run_python",
            "description": "Run Python code in the live session. Variables and functions persist across calls.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "The Python code to execute."}
                },
                "required": ["code"],
            },
        },
    }
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Held-out MBPP eval with the coding env.")
    parser.add_argument("--models", nargs="+", required=True, help="Model ids to evaluate in turn.")
    parser.add_argument("--env-url", type=str, default="https://sergiopaniego-coding-env.hf.space")
    parser.add_argument("--num-problems", type=int, default=257)
    parser.add_argument("--temperature", type=float, default=1.0, help="Same as training rollouts.")
    parser.add_argument("--max-turns", type=int, default=6)
    parser.add_argument("--concurrency", type=int, default=16)
    return parser.parse_args()


def solve_one(client: OpenAI, model: str, env_url: str, problem: dict, temperature: float, max_turns: int) -> float:
    env = CodingEnv(base_url=env_url, message_timeout_s=300).sync()
    try:
        env.reset()
        messages = [
            {
                "role": "user",
                "content": TASK_TEMPLATE.format(task=problem["prompt"], example_test=problem["test_list"][0]),
            }
        ]
        for _ in range(max_turns):
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                tools=TOOLS,
                temperature=temperature,
                max_tokens=2048,
                extra_body={"chat_template_kwargs": {"enable_thinking": False}},
            )
            message = response.choices[0].message
            messages.append(message.model_dump(exclude_none=True))
            if not message.tool_calls:
                break
            for call in message.tool_calls:
                try:
                    code = json.loads(call.function.arguments)["code"]
                    result = env.step(CodeAction(code=code))
                    output = (result.observation.stdout or "") + (result.observation.stderr or "")
                    if not output.strip():
                        output = f"(no output, exit_code={result.observation.exit_code})"
                except Exception as e:
                    output = f"(tool error: {type(e).__name__})"
                messages.append({"role": "tool", "tool_call_id": call.id, "content": output[:1000]})
        for imp in problem["test_imports"]:
            env.step(CodeAction(code=imp))
        passed = 0
        for test in problem["test_list"]:
            result = env.step(CodeAction(code=test))
            passed += int(result.observation.exit_code == 0)
        return passed / len(problem["test_list"])
    finally:
        try:
            env.close()
        except Exception:
            pass


def evaluate_model(model: str, problems: list, args: argparse.Namespace) -> list[float]:
    server = subprocess.Popen(
        ["vllm", "serve", model, "--port", "8000", "--enable-auto-tool-choice", "--tool-call-parser", "hermes"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    client = OpenAI(base_url="http://localhost:8000/v1", api_key="none")
    try:
        for _ in range(120):
            time.sleep(10)
            try:
                client.models.list()
                break
            except Exception:
                continue
        else:
            raise RuntimeError(f"vLLM server for {model} never came up")
        print(f"[eval] {model}: server up, evaluating {len(problems)} problems", flush=True)
        scores = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
            futures = [
                pool.submit(solve_one, client, model, args.env_url, p, args.temperature, args.max_turns)
                for p in problems
            ]
            for i, future in enumerate(concurrent.futures.as_completed(futures), 1):
                try:
                    scores.append(future.result())
                except Exception as e:
                    print(f"[eval] problem failed: {type(e).__name__}: {e}", flush=True)
                    scores.append(0.0)
                if i % 25 == 0:
                    print(f"[eval] {model}: {i}/{len(problems)} · running mean {statistics.mean(scores):.4f}", flush=True)
        return scores
    finally:
        server.terminate()
        server.wait(timeout=60)
        time.sleep(10)


def main() -> None:
    args = parse_args()
    test = load_dataset("google-research-datasets/mbpp", "sanitized", split="test")
    problems = [test[i] for i in range(min(args.num_problems, len(test)))]

    results = {}
    for model in args.models:
        scores = evaluate_model(model, problems, args)
        results[model] = statistics.mean(scores)
        print(f"[eval] RESULT {model}: mean fraction of hidden tests passed = {results[model]:.4f}", flush=True)

    print("\n[eval] FINAL COMPARISON", flush=True)
    for model, score in results.items():
        print(f"  {model}: {score:.4f}", flush=True)


if __name__ == "__main__":
    main()
