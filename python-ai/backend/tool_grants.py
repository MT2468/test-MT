from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import os
import secrets
import threading
from dataclasses import dataclass, replace
from typing import Iterable


class GrantError(Exception):
    pass


class GrantUnavailable(GrantError):
    pass


class GrantDenied(GrantError):
    pass


class GrantValidationError(GrantError):
    pass


@dataclass(frozen=True)
class GrantRecord:
    token_hash: str
    permissions: frozenset[str]
    tool_names: frozenset[str]
    created_at: dt.datetime
    expires_at: dt.datetime
    max_uses: int
    uses_consumed: int = 0


_MAX_TTL_SECONDS = 900
_MAX_USES = 100
_ALLOWED_PERMISSIONS = frozenset({'tools.read.basic'})
_ALLOWED_TOOL_NAMES = frozenset({'calculator.evaluate', 'time.now'})
_GRANTS: dict[str, GrantRecord] = {}
_LOCK = threading.Lock()


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def _configured_secret() -> str:
    return os.getenv('PYTHON_AI_TOOL_GRANT_SECRET', '').strip()


def _check_secret(presented_secret: str | None) -> None:
    configured = _configured_secret()
    if not configured:
        raise GrantUnavailable('Emissão de grants desativada: configure PYTHON_AI_TOOL_GRANT_SECRET')
    candidate = (presented_secret or '').strip()
    if not candidate or not hmac.compare_digest(candidate, configured):
        raise GrantDenied('Credencial de autorização inválida')


def issue_grant(
    permissions: Iterable[str],
    tool_names: Iterable[str],
    ttl_seconds: int,
    max_uses: int,
    presented_secret: str | None,
) -> dict:
    _check_secret(presented_secret)
    requested_permissions = frozenset(permissions)
    requested_tools = frozenset(tool_names)
    if not requested_permissions:
        raise GrantValidationError('Informe ao menos uma permissão')
    if not requested_tools:
        raise GrantValidationError('Informe ao menos uma ferramenta')
    if requested_permissions - _ALLOWED_PERMISSIONS:
        raise GrantValidationError('Permissão não disponível para grant')
    if requested_tools - _ALLOWED_TOOL_NAMES:
        raise GrantValidationError('Ferramenta não disponível para grant')
    if isinstance(ttl_seconds, bool) or not isinstance(ttl_seconds, int) or ttl_seconds < 30 or ttl_seconds > _MAX_TTL_SECONDS:
        raise GrantValidationError(f'ttl_seconds deve estar entre 30 e {_MAX_TTL_SECONDS}')
    if isinstance(max_uses, bool) or not isinstance(max_uses, int) or max_uses < 1 or max_uses > _MAX_USES:
        raise GrantValidationError(f'max_uses deve estar entre 1 e {_MAX_USES}')

    created_at = _now()
    expires_at = created_at + dt.timedelta(seconds=ttl_seconds)
    token = secrets.token_urlsafe(32)
    token_hash = _hash_token(token)
    record = GrantRecord(
        token_hash=token_hash,
        permissions=requested_permissions,
        tool_names=requested_tools,
        created_at=created_at,
        expires_at=expires_at,
        max_uses=max_uses,
    )
    with _LOCK:
        _purge_expired_locked(created_at)
        _GRANTS[token_hash] = record
    return {
        'grant_token': token,
        'permissions': sorted(requested_permissions),
        'tool_names': sorted(requested_tools),
        'max_uses': max_uses,
        'remaining_uses': max_uses,
        'created_at': created_at.isoformat(),
        'expires_at': expires_at.isoformat(),
    }


def _purge_expired_locked(reference: dt.datetime) -> None:
    expired = [key for key, record in _GRANTS.items() if record.expires_at <= reference]
    for key in expired:
        _GRANTS.pop(key, None)


def resolve_grant(token: str | None, tool_name: str) -> set[str]:
    if not token or not isinstance(token, str):
        raise GrantDenied('Grant obrigatório')
    if not tool_name or not isinstance(tool_name, str):
        raise GrantDenied('Ferramenta inválida para o grant')

    token_hash = _hash_token(token)
    reference = _now()
    with _LOCK:
        _purge_expired_locked(reference)
        record = _GRANTS.get(token_hash)
        if not record:
            raise GrantDenied('Grant inválido, expirado ou revogado')
        if tool_name not in record.tool_names:
            raise GrantDenied('Grant não autoriza esta ferramenta')
        if record.uses_consumed >= record.max_uses:
            _GRANTS.pop(token_hash, None)
            raise GrantDenied('Grant esgotado')
        consumed = record.uses_consumed + 1
        if consumed >= record.max_uses:
            _GRANTS.pop(token_hash, None)
        else:
            _GRANTS[token_hash] = replace(record, uses_consumed=consumed)
    return set(record.permissions)


def revoke_grant(token: str | None) -> bool:
    if not token or not isinstance(token, str):
        raise GrantValidationError('grant_token é obrigatório')
    token_hash = _hash_token(token)
    with _LOCK:
        return _GRANTS.pop(token_hash, None) is not None


def clear_grants_for_tests() -> None:
    with _LOCK:
        _GRANTS.clear()
