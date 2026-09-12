# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "trl @ git+https://github.com/huggingface/trl.git",
#   "openenv @ git+https://github.com/huggingface/OpenEnv.git",
#   "openenv-opencode-env @ git+https://github.com/huggingface/OpenEnv.git#subdirectory=envs/opencode_env",
#   "vllm>=0.22,<0.26",
#   "datasets>=3.2",
#   "trackio",
#   "bitsandbytes",
#   "kernels>=0.15.2,<0.16.0",
#   "transformers>=5.2",
#   "huggingface_hub>=1.22",
# ]
# ///
"""One-command Hugging Face Jobs launcher for `opencode_hf_sandbox.py`.

The training script is just the trainer: it needs a vLLM the remote sandboxes can reach. On HF Jobs you submit
a single script, so this launcher wraps the three pieces into one job:

  1. serve vLLM on GPU 0 (localhost, NCCL weight-sync with the trainer),
  2. expose that vLLM publicly with a cloudflared tunnel (so the remote sandboxes can reach it),
  3. download `opencode_hf_sandbox.py` and run it on GPU 1, one remote HF sandbox per rollout.

Run (needs an HF token with Jobs + Sandbox access):

    hf jobs uv run --flavor h200x2 --secrets HF_TOKEN --timeout 7200s launcher.py

Configure with environment variables (all optional):

    MODEL             policy to train           (default: Qwen/Qwen3-8B)
    N_PROMPTS         dataset size              (default: 32)
    MAX_STEPS         training steps            (default: 10)
    HUB_MODEL_ID      push the trained model    (default: no push)   e.g. your-username/opencode-grpo
    TRACKIO_SPACE_ID  trackio dashboard Space   (default: local)     e.g. your-username/opencode-hf-sandbox

8B is full fine-tuned on a single trainer GPU via an 8-bit optimizer + gradient checkpointing (see the flags
below); drop them for a smaller policy, or shard across GPUs with FSDP for a larger one.
"""

import os
import re
import signal
import subprocess
import sys
import time
import urllib.request


# Fetch the training script straight from the repo so this launcher stays a thin, up-to-date wrapper.
SCRIPT_URL = (
    "https://raw.githubusercontent.com/huggingface/trl/"
    "main/examples/async_grpo_opencode/opencode_hf_sandbox.py"
)
CLOUDFLARED = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"

MODEL = os.environ.get("MODEL", "Qwen/Qwen3-8B")
N_PROMPTS = os.environ.get("N_PROMPTS", "32")
MAX_STEPS = os.environ.get("MAX_STEPS", "10")
HUB_MODEL_ID = os.environ.get("HUB_MODEL_ID")
TRACKIO_SPACE_ID = os.environ.get("TRACKIO_SPACE_ID")


def _log(m):
    print(">>> " + m, flush=True)


def _kill_pg(p):
    try:
        os.killpg(os.getpgid(p.pid), signal.SIGKILL)
    except Exception:
        try:
            p.kill()
        except Exception:
            pass


def main():
    urllib.request.urlretrieve(CLOUDFLARED, "cloudflared")
    os.chmod("cloudflared", 0o755)
    urllib.request.urlretrieve(SCRIPT_URL, "opencode_hf_sandbox.py")
    _log("downloaded cloudflared + training script")

    _log(f"launching vLLM for {MODEL} on GPU 0 (localhost)...")
    vllm = subprocess.Popen(
        ["vllm", "serve", MODEL, "--max-model-len", "40960", "--logprobs-mode", "processed_logprobs",
         "--return-tokens-as-token-ids", "--enable-auto-tool-choice", "--tool-call-parser", "hermes",
         "--weight-transfer-config", '{"backend":"nccl"}'],
        env={**os.environ, "CUDA_VISIBLE_DEVICES": "0", "VLLM_SERVER_DEV_MODE": "1", "VLLM_USE_FLASHINFER_SAMPLER": "0"},
        start_new_session=True,
    )
    cf = None
    try:
        for _ in range(300):
            if vllm.poll() is not None:
                _log(f"vLLM died early rc={vllm.returncode}")
                return 1
            try:
                urllib.request.urlopen("http://localhost:8000/health", timeout=3)
                break
            except Exception:
                time.sleep(2)
        else:
            _log("vLLM never became healthy")
            return 1
        _log("vLLM healthy (local)")

        cflog = open("cf.log", "w")
        cf = subprocess.Popen(["./cloudflared", "tunnel", "--no-autoupdate", "--url", "http://localhost:8000"],
                              stdout=cflog, stderr=subprocess.STDOUT, start_new_session=True)
        tunnel = None
        for _ in range(120):
            m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", open("cf.log").read())
            if m:
                tunnel = m.group(0)
                break
            time.sleep(1)
        if not tunnel:
            _log("cloudflared did not produce a public URL")
            return 1
        _log(f"tunnel: {tunnel}")

        cmd = [
            sys.executable, "opencode_hf_sandbox.py",
            "--model", MODEL,
            "--vllm-url", "http://localhost:8000",   # trainer <-> vLLM: localhost, NCCL weight-sync
            "--sandbox-vllm-url", tunnel,             # remote sandboxes -> vLLM: through the tunnel
            "--n-prompts", N_PROMPTS,
            "--max-steps", MAX_STEPS,
            "--optim", "paged_adamw_8bit",            # fit 8B full fine-tune on a single trainer GPU
            "--gradient-checkpointing",
        ]
        if HUB_MODEL_ID:
            cmd += ["--push-to-hub", "--hub-model-id", HUB_MODEL_ID]
        if TRACKIO_SPACE_ID:
            cmd += ["--trackio-space-id", TRACKIO_SPACE_ID]

        _log("running the trainer on GPU 1 (one remote HF sandbox per rollout)...")
        r = subprocess.run(cmd, env={**os.environ, "CUDA_VISIBLE_DEVICES": "1"})
        _log(f"trainer exit={r.returncode}")
        return r.returncode
    finally:
        _log("shutting down vLLM + cloudflared...")
        _kill_pg(vllm)
        if cf is not None:
            _kill_pg(cf)


if __name__ == "__main__":
    sys.exit(main())
