from __future__ import annotations

import datetime as dt
import hashlib
import secrets
import threading
import uuid
from collections import deque
from dataclasses import dataclass, replace
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
    token_hash: str
    tab_id: str
    origin: str
    actions: frozenset[str]
    created_at: dt.datetime
    expires_at: dt.datetime
    max_uses: int
    uses_consumed: int = 0


_ALLOWED_ACTIONS = frozenset({'read', 'navigate', 'interact'})
_SENSITIVE_ACTIONS = frozenset({'interact'})
_MAX_TTL_SECONDS = 900
_MAX_USES = 100
_AUDIT_LIMIT = 200
_GRANTS: dict[str, BrowserGrant] = {}
_AUDIT: deque[dict[str, Any]] = deque(maxlen=_AUDIT_LIMIT)
_LOCK = threading.Lock()


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def _normalize_origin(value: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise BrowserPermissionValidationError('origin obrigatório')
    parsed = urlparse(value.strip())
    if parsed.scheme not in {'http', 'https'} or not parsed.hostname:
        raise BrowserPermissionValidationError('origin deve ser HTTP(S) válido')
    port = f':{parsed.port}' if parsed.port else ''
    return f'{parsed.scheme}://{parsed.hostname.lower()}{port}'


def _validate_tab_id(tab_id: str) -> str:
    if not isinstance(tab_id, str) or not tab_id.strip() or len(tab_id) > 200:
        raise BrowserPermissionValidationError('tab_id inválido')
    return tab_id.strip()


def _audit_locked(
    action: str,
    status: str,
    *,
    tab_id: str | None = None,
    origin: str | None = None,
    reason: str | None = None,
    max_uses: int | None = None,
    remaining_uses: int | None = None,
) -> None:
    _AUDIT.append({
        'id': str(uuid.uuid4()),
        'timestamp': _now().isoformat(),
        'action': action,
        'status': status,
        'tab_id': tab_id,
        'origin': origin,
        'reason': reason,
        'max_uses': max_uses,
        'remaining_uses': remaining_uses,
    })


def issue_browser_grant(
    tab_id: str,
    origin: str,
    actions: list[str],
    ttl_seconds: int = 300,
    max_uses: int = 10,
) -> dict[str, Any]:
    normalized_tab_id = _validate_tab_id(tab_id)
    normalized_origin = _normalize_origin(origin)
    if not isinstance(actions, list) or not actions or any(not isinstance(action, str) for action in actions):
        raise BrowserPermissionValidationError('ações de navegador inválidas')
    requested = frozenset(actions)
    if requested - _ALLOWED_ACTIONS:
        raise BrowserPermissionValidationError('ações de navegador inválidas')
    if isinstance(ttl_seconds, bool) or not isinstance(ttl_seconds, int) or not 30 <= ttl_seconds <= _MAX_TTL_SECONDS:
        raise BrowserPermissionValidationError(f'ttl_seconds deve estar entre 30 e {_MAX_TTL_SECONDS}')
    if isinstance(max_uses, bool) or not isinstance(max_uses, int) or not 1 <= max_uses <= _MAX_USES:
        raise BrowserPermissionValidationError(f'max_uses deve estar entre 1 e {_MAX_USES}')

    created_at = _now()
    token = secrets.token_urlsafe(32)
    token_hash = _hash_token(token)
    grant = BrowserGrant(
        grant_id=str(uuid.uuid4()),
        token_hash=token_hash,
        tab_id=normalized_tab_id,
        origin=normalized_origin,
        actions=requested,
        created_at=created_at,
        expires_at=created_at + dt.timedelta(seconds=ttl_seconds),
        max_uses=max_uses,
    )
    with _LOCK:
        _GRANTS[token_hash] = grant
        _audit_locked(
            'issue',
            'success',
            tab_id=grant.tab_id,
            origin=grant.origin,
            max_uses=grant.max_uses,
            remaining_uses=grant.max_uses,
        )
    return {
        'grant_token': token,
        'grant_id': grant.grant_id,
        'tab_id': grant.tab_id,
        'origin': grant.origin,
        'actions': sorted(grant.actions),
        'max_uses': grant.max_uses,
        'remaining_uses': grant.max_uses,
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
    if not isinstance(grant_token, str) or not grant_token:
        raise BrowserPermissionDenied('Grant de navegador obrigatório')
    normalized_tab_id = _validate_tab_id(tab_id)
    if not isinstance(action, str) or action not in _ALLOWED_ACTIONS:
        raise BrowserPermissionValidationError('ação de navegador inválida')
    if not isinstance(confirmed, bool):
        raise BrowserPermissionValidationError('confirmed deve ser booleano')
    origin = _normalize_origin(url)
    reference = _now()
    token_hash = _hash_token(grant_token)

    with _LOCK:
        grant = _GRANTS.get(token_hash)
        if grant is None or grant.expires_at <= reference:
            if grant is not None:
                _GRANTS.pop(token_hash, None)
            _audit_locked('authorize', 'denied', tab_id=normalized_tab_id, origin=origin, reason='invalid_or_expired_grant')
            raise BrowserPermissionDenied('Grant de navegador inválido ou expirado')
        remaining_before = max(0, grant.max_uses - grant.uses_consumed)
        if grant.tab_id != normalized_tab_id or grant.origin != origin:
            _audit_locked(
                'authorize',
                'denied',
                tab_id=normalized_tab_id,
                origin=origin,
                reason='scope_mismatch',
                max_uses=grant.max_uses,
                remaining_uses=remaining_before,
            )
            raise BrowserPermissionDenied('Grant não autoriza esta aba/origem')
        if action not in grant.actions:
            _audit_locked(
                'authorize',
                'denied',
                tab_id=normalized_tab_id,
                origin=origin,
                reason='action_not_granted',
                max_uses=grant.max_uses,
                remaining_uses=remaining_before,
            )
            raise BrowserPermissionDenied('Grant não autoriza esta ação')
        if action in _SENSITIVE_ACTIONS and not confirmed:
            _audit_locked(
                'authorize',
                'confirmation_required',
                tab_id=normalized_tab_id,
                origin=origin,
                reason='sensitive_action',
                max_uses=grant.max_uses,
                remaining_uses=remaining_before,
            )
            raise BrowserPermissionDenied('Confirmação explícita obrigatória para ação sensível')
        if remaining_before < 1:
            _GRANTS.pop(token_hash, None)
            _audit_locked(
                'authorize',
                'denied',
                tab_id=normalized_tab_id,
                origin=origin,
                reason='grant_exhausted',
                max_uses=grant.max_uses,
                remaining_uses=0,
            )
            raise BrowserPermissionDenied('Grant de navegador esgotado')

        consumed = grant.uses_consumed + 1
        remaining_after = max(0, grant.max_uses - consumed)
        if remaining_after == 0:
            _GRANTS.pop(token_hash, None)
        else:
            _GRANTS[token_hash] = replace(grant, uses_consumed=consumed)
        _audit_locked(
            'authorize',
            'success',
            tab_id=normalized_tab_id,
            origin=origin,
            max_uses=grant.max_uses,
            remaining_uses=remaining_after,
        )

    return {
        'authorized': True,
        'tab_id': normalized_tab_id,
        'origin': origin,
        'action': action,
        'remaining_uses': remaining_after,
    }


def revoke_browser_grant(grant_token: str) -> bool:
    if not isinstance(grant_token, str) or not grant_token:
        raise BrowserPermissionValidationError('grant_token obrigatório')
    token_hash = _hash_token(grant_token)
    with _LOCK:
        grant = _GRANTS.pop(token_hash, None)
        _audit_locked(
            'revoke',
            'success' if grant else 'not_found',
            tab_id=grant.tab_id if grant else None,
            origin=grant.origin if grant else None,
            max_uses=grant.max_uses if grant else None,
            remaining_uses=max(0, grant.max_uses - grant.uses_consumed) if grant else None,
        )
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
