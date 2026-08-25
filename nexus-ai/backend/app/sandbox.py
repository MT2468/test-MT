from __future__ import annotations

import asyncio
import os
import sys
import tempfile

MAX_CODE = 40_000
MAX_OUTPUT = 20_000


async def run_python(code: str, timeout: int = 8) -> dict:
    if len(code) > MAX_CODE:
        raise ValueError("Code is too large for the sandbox.")
    with tempfile.TemporaryDirectory(prefix="nexus-") as tmp:
        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            "-I",
            "-c",
            code,
            cwd=tmp,
            env={"PATH": os.environ.get("PATH", ""), "PYTHONIOENCODING": "utf-8"},
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=max(1, min(timeout, 20)))
        except TimeoutError:
            proc.kill()
            await proc.communicate()
            return {"ok": False, "exit_code": None, "stdout": "", "stderr": "Execution timed out."}
    out = stdout.decode("utf-8", "replace")[:MAX_OUTPUT]
    err = stderr.decode("utf-8", "replace")[:MAX_OUTPUT]
    return {"ok": proc.returncode == 0, "exit_code": proc.returncode, "stdout": out, "stderr": err}
