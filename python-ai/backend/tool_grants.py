from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import os
import secrets
import threading
from dataclasses import dataclass
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
    created_at: dt.datetime
    expires_at: dt.datetime


_MAX_TTL_SECONDS = 900
_ALLOWED_PERMISSIONS = frozenset({'tools.read.basic'})
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


def issue_grant(permissions: Iterable[str], ttl_seconds: int, presented_secret: str | None) -> dict:
    _check_secret(presented_secret)
    requested = frozenset(permissions)
    if not requested:
        raise GrantValidationError('Informe ao menos uma permissão')
    unknown = requested - _ALLOWED_PERMISSIONS
    if unknown:
        raise GrantValidationError('Permissão não disponível para grant')
    if isinstance(ttl_seconds, bool) or not isinstance(ttl_seconds, int) or ttl_seconds < 30 or ttl_seconds > _MAX_TTL_SECONDS:
        raise GrantValidationError(f'ttl_seconds deve estar entre 30 e {_MAX_TTL_SECONDS}')
    created_at = _now()
    expires_at = created_at + dt.timedelta(seconds=ttl_seconds)
    token = secrets.token_urlsafe(32)
    token_hash = _hash_token(token)
    record = GrantRecord(token_hash, requested, created_at, expires_at)
    with _LOCK:
        _purge_expired_locked(created_at)
        _GRANTS[token_hash] = record
    return {
        'grant_token': token,
        'permissions': sorted(requested),
        'created_at': created_at.isoformat(),
        'expires_at': expires_at.isoformat(),
    }


def _purge_expired_locked(reference: dt.datetime) -> None:
    expired = [key for key, record in _GRANTS.items() if record.expires_at <= reference]
    for key in expired:
        _GRANTS.pop(key, None)


def resolve_grant(token: str | None) -> set[str]:
    if not token or not isinstance(token, str):
        raise GrantDenied('Grant obrigatório')
    token_hash = _hash_token(token)
    reference = _now()
    with _LOCK:
        _purge_expired_locked(reference)
        record = _GRANTS.get(token_hash)
    if not record:
        raise GrantDenied('Grant inválido, expirado ou revogado')
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
