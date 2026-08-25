from __future__ import annotations

import datetime as dt
import secrets
import threading
import uuid
from collections import deque
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse


class BrowserPermissionError(Exception):
    pass


class BrowserPermissionDenied(BrowserPermissionError):
    pass


class BrowserPermissionValidationError(BrowserPermissionError):
    pass


@dataclass(frozen=True)
class BrowserGrant:
    grant_id: str
    token: str
    tab_id: str
    origin: str
    actions: frozenset[str]
    created_at: dt.datetime
    expires_at: dt.datetime


_ALLOWED_ACTIONS = frozenset({'read', 'navigate', 'interact'})
_SENSITIVE_ACTIONS = frozenset({'interact'})
_MAX_TTL_SECONDS = 900
_AUDIT_LIMIT = 200
_GRANTS: dict[str, BrowserGrant] = {}
_AUDIT: deque[dict[str, Any]] = deque(maxlen=_AUDIT_LIMIT)
_LOCK = threading.Lock()


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _normalize_origin(value: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise BrowserPermissionValidationError('origin obrigatório')
    parsed = urlparse(value.strip())
    if parsed.scheme not in {'http', 'https'} or not parsed.hostname:
        raise BrowserPermissionValidationError('origin deve ser HTTP(S) válido')
    port = f':{parsed.port}' if parsed.port else ''
    return f'{parsed.scheme}://{parsed.hostname.lower()}{port}'


def _audit_locked(action: str, status: str, *, tab_id: str | None = None, origin: str | None = None, reason: str | None = None) -> None:
    _AUDIT.append({
        'id': str(uuid.uuid4()),
        'timestamp': _now().isoformat(),
        'action': action,
        'status': status,
        'tab_id': tab_id,
        'origin': origin,
        'reason': reason,
    })


def issue_browser_grant(tab_id: str, origin: str, actions: list[str], ttl_seconds: int = 300) -> dict[str, Any]:
    if not isinstance(tab_id, str) or not tab_id.strip() or len(tab_id) > 200:
        raise BrowserPermissionValidationError('tab_id inválido')
    normalized_origin = _normalize_origin(origin)
    requested = frozenset(actions)
    if not requested or requested - _ALLOWED_ACTIONS:
        raise BrowserPermissionValidationError('ações de navegador inválidas')
    if isinstance(ttl_seconds, bool) or not isinstance(ttl_seconds, int) or not 30 <= ttl_seconds <= _MAX_TTL_SECONDS:
        raise BrowserPermissionValidationError(f'ttl_seconds deve estar entre 30 e {_MAX_TTL_SECONDS}')

    created_at = _now()
    grant = BrowserGrant(
        grant_id=str(uuid.uuid4()),
        token=secrets.token_urlsafe(32),
        tab_id=tab_id.strip(),
        origin=normalized_origin,
        actions=requested,
        created_at=created_at,
        expires_at=created_at + dt.timedelta(seconds=ttl_seconds),
    )
    with _LOCK:
        _GRANTS[grant.token] = grant
        _audit_locked('issue', 'success', tab_id=grant.tab_id, origin=grant.origin)
    return {
        'grant_token': grant.token,
        'grant_id': grant.grant_id,
        'tab_id': grant.tab_id,
        'origin': grant.origin,
        'actions': sorted(grant.actions),
        'created_at': grant.created_at.isoformat(),
        'expires_at': grant.expires_at.isoformat(),
    }


def authorize_browser_action(
    grant_token: str,
    *,
    tab_id: str,
    url: str,
    action: str,
    confirmed: bool = False,
) -> dict[str, Any]:
    if action not in _ALLOWED_ACTIONS:
        raise BrowserPermissionValidationError('ação de navegador inválida')
    origin = _normalize_origin(url)
    reference = _now()

    with _LOCK:
        grant = _GRANTS.get(grant_token)
        if grant is None or grant.expires_at <= reference:
            if grant is not None:
                _GRANTS.pop(grant_token, None)
            _audit_locked('authorize', 'denied', tab_id=tab_id, origin=origin, reason='invalid_or_expired_grant')
            raise BrowserPermissionDenied('Grant de navegador inválido ou expirado')
        if grant.tab_id != tab_id or grant.origin != origin:
            _audit_locked('authorize', 'denied', tab_id=tab_id, origin=origin, reason='scope_mismatch')
            raise BrowserPermissionDenied('Grant não autoriza esta aba/origem')
        if action not in grant.actions:
            _audit_locked('authorize', 'denied', tab_id=tab_id, origin=origin, reason='action_not_granted')
            raise BrowserPermissionDenied('Grant não autoriza esta ação')
        if action in _SENSITIVE_ACTIONS and not confirmed:
            _audit_locked('authorize', 'confirmation_required', tab_id=tab_id, origin=origin, reason='sensitive_action')
            raise BrowserPermissionDenied('Confirmação explícita obrigatória para ação sensível')
        _audit_locked('authorize', 'success', tab_id=tab_id, origin=origin)

    return {'authorized': True, 'tab_id': tab_id, 'origin': origin, 'action': action}


def revoke_browser_grant(grant_token: str) -> bool:
    if not isinstance(grant_token, str) or not grant_token:
        raise BrowserPermissionValidationError('grant_token obrigatório')
    with _LOCK:
        grant = _GRANTS.pop(grant_token, None)
        _audit_locked('revoke', 'success' if grant else 'not_found', tab_id=grant.tab_id if grant else None, origin=grant.origin if grant else None)
        return grant is not None


def list_browser_audit(limit: int = 50) -> list[dict[str, Any]]:
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= _AUDIT_LIMIT:
        raise BrowserPermissionValidationError(f'limit deve estar entre 1 e {_AUDIT_LIMIT}')
    with _LOCK:
        return [dict(item) for item in list(_AUDIT)[-limit:]][::-1]


def clear_browser_permissions_for_tests() -> None:
    with _LOCK:
        _GRANTS.clear()
        _AUDIT.clear()
