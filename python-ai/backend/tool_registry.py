from __future__ import annotations

import ast
import datetime as dt
import operator
import threading
import uuid
from collections import deque
from dataclasses import dataclass
from typing import Any, Callable


class ToolError(Exception):
    pass


class ToolNotFound(ToolError):
    pass


class ToolPermissionDenied(ToolError):
    pass


class ToolValidationError(ToolError):
    pass


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    permission: str
    risk: str
    mutates_state: bool
    schema: dict[str, Any]

    def public_dict(self) -> dict[str, Any]:
        return {
            'name': self.name,
            'description': self.description,
            'permission': self.permission,
            'risk': self.risk,
            'mutates_state': self.mutates_state,
            'schema': self.schema,
        }


@dataclass(frozen=True)
class RegisteredTool:
    spec: ToolSpec
    handler: Callable[[dict[str, Any]], Any]


_AUDIT_LIMIT = 200
_AUDIT: deque[dict[str, Any]] = deque(maxlen=_AUDIT_LIMIT)
_AUDIT_LOCK = threading.Lock()


def _audit(tool: str, status: str, error_type: str | None = None) -> None:
    # Deliberadamente não registra argumentos nem resultados: eles podem conter segredos.
    event = {
        'id': str(uuid.uuid4()),
        'timestamp': dt.datetime.now(dt.timezone.utc).isoformat(),
        'tool': tool,
        'status': status,
        'error_type': error_type,
    }
    with _AUDIT_LOCK:
        _AUDIT.append(event)


def list_audit(limit: int = 50) -> list[dict[str, Any]]:
    if not isinstance(limit, int) or isinstance(limit, bool) or limit < 1 or limit > 200:
        raise ToolValidationError('limit deve estar entre 1 e 200')
    with _AUDIT_LOCK:
        return [dict(event) for event in list(_AUDIT)[-limit:]][::-1]


def clear_audit_for_tests() -> None:
    with _AUDIT_LOCK:
        _AUDIT.clear()


OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _evaluate(node: ast.AST) -> int | float:
    if isinstance(node, ast.Expression):
        return _evaluate(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in OPS:
        left = _evaluate(node.left)
        right = _evaluate(node.right)
        if isinstance(node.op, ast.Pow) and abs(right) > 12:
            raise ToolValidationError('Expoente acima do limite permitido')
        result = OPS[type(node.op)](left, right)
        if abs(result) > 1e100:
            raise ToolValidationError('Resultado acima do limite permitido')
        return result
    if isinstance(node, ast.UnaryOp) and type(node.op) in OPS:
        return OPS[type(node.op)](_evaluate(node.operand))
    raise ToolValidationError('Expressão não permitida')


def _calculator(args: dict[str, Any]) -> int | float:
    expression = args.get('expression')
    if not isinstance(expression, str) or not expression.strip():
        raise ToolValidationError('expression é obrigatório')
    if len(expression) > 500:
        raise ToolValidationError('Expressão longa demais')
    try:
        tree = ast.parse(expression.replace('^', '**'), mode='eval')
    except (SyntaxError, ValueError) as exc:
        raise ToolValidationError('Expressão inválida') from exc
    return _evaluate(tree)


def _clock(args: dict[str, Any]) -> str:
    if args:
        raise ToolValidationError('time.now não aceita argumentos')
    return dt.datetime.now().astimezone().isoformat()


TOOLS: dict[str, RegisteredTool] = {
    'calculator.evaluate': RegisteredTool(
        ToolSpec(
            name='calculator.evaluate',
            description='Avalia uma expressão aritmética local sem executar código.',
            permission='tools.read.basic',
            risk='low',
            mutates_state=False,
            schema={
                'type': 'object',
                'properties': {'expression': {'type': 'string', 'maxLength': 500}},
                'required': ['expression'],
                'additionalProperties': False,
            },
        ),
        _calculator,
    ),
    'time.now': RegisteredTool(
        ToolSpec(
            name='time.now',
            description='Retorna a hora local do servidor em ISO 8601.',
            permission='tools.read.basic',
            risk='low',
            mutates_state=False,
            schema={'type': 'object', 'properties': {}, 'additionalProperties': False},
        ),
        _clock,
    ),
}


def list_tools() -> list[dict[str, Any]]:
    return [TOOLS[name].spec.public_dict() for name in sorted(TOOLS)]


def execute_tool(name: str, arguments: dict[str, Any] | None, granted_permissions: set[str] | None = None) -> dict[str, Any]:
    tool = TOOLS.get(name)
    if not tool:
        _audit(name, 'denied', 'ToolNotFound')
        raise ToolNotFound('Ferramenta desconhecida')
    granted = granted_permissions or set()
    if tool.spec.permission not in granted:
        _audit(name, 'denied', 'ToolPermissionDenied')
        raise ToolPermissionDenied(f'Permissão necessária: {tool.spec.permission}')
    args = arguments or {}
    try:
        if not isinstance(args, dict):
            raise ToolValidationError('arguments deve ser um objeto')
        allowed = set(tool.spec.schema.get('properties', {}))
        if tool.spec.schema.get('additionalProperties') is False:
            unexpected = set(args) - allowed
            if unexpected:
                raise ToolValidationError('Argumento não permitido')
        result = tool.handler(args)
    except Exception as exc:
        _audit(name, 'error', type(exc).__name__)
        raise
    _audit(name, 'success')
    return {
        'tool': tool.spec.name,
        'permission': tool.spec.permission,
        'risk': tool.spec.risk,
        'mutates_state': tool.spec.mutates_state,
        'result': result,
    }
