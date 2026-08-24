from __future__ import annotations

import time
from typing import Any

from tool_grants import resolve_grant
from tool_registry import TOOLS, execute_tool


class AgentError(Exception):
    pass


class AgentValidationError(AgentError):
    pass


class AgentSafetyError(AgentError):
    pass


class AgentTimeoutError(AgentError):
    pass


MAX_AGENT_STEPS = 6
MAX_AGENT_RUNTIME_SECONDS = 5.0


def _validate_step(step: Any) -> tuple[str, dict[str, Any]]:
    if not isinstance(step, dict):
        raise AgentValidationError('Cada passo deve ser um objeto')
    unexpected = set(step) - {'name', 'arguments'}
    if unexpected:
        raise AgentValidationError('Campo não permitido no passo do agente')
    name = step.get('name')
    arguments = step.get('arguments', {})
    if not isinstance(name, str) or not name or len(name) > 120:
        raise AgentValidationError('Nome de ferramenta inválido')
    if not isinstance(arguments, dict):
        raise AgentValidationError('arguments deve ser um objeto')
    return name, arguments


def _assert_agent_safe_tool(name: str) -> None:
    tool = TOOLS.get(name)
    if tool is None:
        raise AgentSafetyError('Ferramenta não disponível para o agente')
    spec = tool.spec
    if spec.risk != 'low' or spec.mutates_state:
        raise AgentSafetyError('O agente só pode usar ferramentas low-risk e somente leitura')


def run_agent_plan(
    steps: list[dict[str, Any]],
    grant_token: str,
    *,
    max_steps: int = MAX_AGENT_STEPS,
    max_runtime_seconds: float = MAX_AGENT_RUNTIME_SECONDS,
) -> dict[str, Any]:
    if isinstance(max_steps, bool) or not isinstance(max_steps, int) or not 1 <= max_steps <= MAX_AGENT_STEPS:
        raise AgentValidationError(f'max_steps deve estar entre 1 e {MAX_AGENT_STEPS}')
    if isinstance(max_runtime_seconds, bool) or not isinstance(max_runtime_seconds, (int, float)) or not 0 < max_runtime_seconds <= MAX_AGENT_RUNTIME_SECONDS:
        raise AgentValidationError(f'max_runtime_seconds deve ser maior que 0 e no máximo {MAX_AGENT_RUNTIME_SECONDS}')
    if not isinstance(steps, list) or not steps:
        raise AgentValidationError('Informe ao menos um passo')
    if len(steps) > max_steps:
        raise AgentValidationError('Plano excede o limite de passos')
    if not isinstance(grant_token, str) or len(grant_token) < 20:
        raise AgentValidationError('grant_token inválido')

    started = time.monotonic()
    results: list[dict[str, Any]] = []
    for index, raw_step in enumerate(steps):
        if time.monotonic() - started > max_runtime_seconds:
            raise AgentTimeoutError('Tempo máximo do agente excedido')
        name, arguments = _validate_step(raw_step)
        _assert_agent_safe_tool(name)
        granted = resolve_grant(grant_token, name)
        output = execute_tool(name, arguments, granted)
        results.append({'step': index + 1, **output})

    elapsed = time.monotonic() - started
    return {
        'ok': True,
        'steps_executed': len(results),
        'max_steps': max_steps,
        'elapsed_ms': round(elapsed * 1000, 3),
        'results': results,
    }
