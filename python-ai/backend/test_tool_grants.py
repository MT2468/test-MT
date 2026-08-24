import os
import unittest
from unittest.mock import patch

from tool_grants import (
    GrantDenied,
    GrantUnavailable,
    GrantValidationError,
    clear_grants_for_tests,
    issue_grant,
    list_grant_audit,
    resolve_grant,
    revoke_grant,
)


class ToolGrantTests(unittest.TestCase):
    def setUp(self):
        clear_grants_for_tests()

    def test_issuance_disabled_without_configured_secret(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(GrantUnavailable):
                issue_grant(['tools.read.basic'], 300, 'anything')
        event = list_grant_audit(1)[0]
        self.assertEqual((event['action'], event['status']), ('issue', 'denied'))
        self.assertEqual(event['error_type'], 'GrantUnavailable')

    def test_wrong_secret_is_denied_without_leaking_secret(self):
        wrong = 'wrong-SUPER-SECRET-value'
        with patch.dict(os.environ, {'PYTHON_AI_TOOL_GRANT_SECRET': 'correct'}):
            with self.assertRaises(GrantDenied):
                issue_grant(['tools.read.basic'], 300, wrong)
        self.assertNotIn(wrong, repr(list_grant_audit()))

    def test_grant_resolves_only_requested_allowed_permission(self):
        with patch.dict(os.environ, {'PYTHON_AI_TOOL_GRANT_SECRET': 'correct'}):
            issued = issue_grant(['tools.read.basic'], 300, 'correct')
        token = issued['grant_token']
        self.assertGreaterEqual(len(token), 32)
        self.assertEqual(resolve_grant(token), {'tools.read.basic'})
        self.assertNotIn(token, repr(issued['permissions']))

    def test_grants_are_single_use_by_default(self):
        with patch.dict(os.environ, {'PYTHON_AI_TOOL_GRANT_SECRET': 'correct'}):
            issued = issue_grant(['tools.read.basic'], 300, 'correct')
        token = issued['grant_token']
        self.assertEqual(issued['max_uses'], 1)
        self.assertEqual(resolve_grant(token), {'tools.read.basic'})
        with self.assertRaises(GrantDenied):
            resolve_grant(token)

    def test_tool_scope_is_enforced_when_resolving_for_a_tool(self):
        with patch.dict(os.environ, {'PYTHON_AI_TOOL_GRANT_SECRET': 'correct'}):
            issued = issue_grant(
                ['tools.read.basic'],
                300,
                'correct',
                tool_names=['calculator.evaluate'],
                max_uses=2,
            )
        token = issued['grant_token']
        with self.assertRaises(GrantDenied):
            resolve_grant(token, 'time.now')
        self.assertEqual(resolve_grant(token, 'calculator.evaluate'), {'tools.read.basic'})
        events = list_grant_audit(3)
        self.assertTrue(any(e['action'] == 'consume' and e['status'] == 'denied' and e['tool_name'] == 'time.now' for e in events))
        self.assertTrue(any(e['action'] == 'consume' and e['status'] == 'success' and e['tool_name'] == 'calculator.evaluate' for e in events))

    def test_usage_limit_is_bounded_and_enforced(self):
        with patch.dict(os.environ, {'PYTHON_AI_TOOL_GRANT_SECRET': 'correct'}):
            with self.assertRaises(GrantValidationError):
                issue_grant(['tools.read.basic'], 300, 'correct', max_uses=0)
            with self.assertRaises(GrantValidationError):
                issue_grant(['tools.read.basic'], 300, 'correct', max_uses=101)
            issued = issue_grant(['tools.read.basic'], 300, 'correct', max_uses=2)
        token = issued['grant_token']
        resolve_grant(token)
        resolve_grant(token)
        with self.assertRaises(GrantDenied):
            resolve_grant(token)

    def test_unknown_tool_scope_is_rejected(self):
        with patch.dict(os.environ, {'PYTHON_AI_TOOL_GRANT_SECRET': 'correct'}):
            with self.assertRaises(GrantValidationError):
                issue_grant(
                    ['tools.read.basic'],
                    300,
                    'correct',
                    tool_names=['browser.navigate'],
                )

    def test_unknown_permission_is_rejected(self):
        with patch.dict(os.environ, {'PYTHON_AI_TOOL_GRANT_SECRET': 'correct'}):
            with self.assertRaises(GrantValidationError):
                issue_grant(['browser.write.anywhere'], 300, 'correct')

    def test_ttl_is_bounded(self):
        with patch.dict(os.environ, {'PYTHON_AI_TOOL_GRANT_SECRET': 'correct'}):
            with self.assertRaises(GrantValidationError):
                issue_grant(['tools.read.basic'], 901, 'correct')
            with self.assertRaises(GrantValidationError):
                issue_grant(['tools.read.basic'], 29, 'correct')

    def test_revocation_is_immediate_and_audited(self):
        with patch.dict(os.environ, {'PYTHON_AI_TOOL_GRANT_SECRET': 'correct'}):
            issued = issue_grant(['tools.read.basic'], 300, 'correct')
        token = issued['grant_token']
        self.assertTrue(revoke_grant(token))
        with self.assertRaises(GrantDenied):
            resolve_grant(token)
        event = next(e for e in list_grant_audit() if e['action'] == 'revoke')
        self.assertEqual(event['status'], 'success')
        self.assertNotIn(token, repr(event))

    def test_audit_records_usage_counts_without_tokens_or_hashes(self):
        with patch.dict(os.environ, {'PYTHON_AI_TOOL_GRANT_SECRET': 'correct'}):
            issued = issue_grant(
                ['tools.read.basic'], 300, 'correct',
                tool_names=['time.now'], max_uses=2,
            )
        token = issued['grant_token']
        resolve_grant(token, 'time.now')
        events = list_grant_audit()
        consume = next(e for e in events if e['action'] == 'consume' and e['status'] == 'success')
        self.assertEqual(consume['max_uses'], 2)
        self.assertEqual(consume['remaining_uses'], 1)
        serialized = repr(events)
        self.assertNotIn(token, serialized)
        self.assertNotIn('token_hash', serialized)
        self.assertNotIn('grant_token', serialized)

    def test_audit_limit_is_validated_and_bounded(self):
        with self.assertRaises(GrantValidationError):
            list_grant_audit(0)
        with self.assertRaises(GrantValidationError):
            list_grant_audit(201)
        with patch.dict(os.environ, {'PYTHON_AI_TOOL_GRANT_SECRET': 'correct'}):
            for _ in range(205):
                issue_grant(['tools.read.basic'], 300, 'correct')
        self.assertEqual(len(list_grant_audit(200)), 200)

    def test_expiration_is_audited_without_exposing_identity(self):
        import tool_grants
        with patch.dict(os.environ, {'PYTHON_AI_TOOL_GRANT_SECRET': 'correct'}):
            issued = issue_grant(['tools.read.basic'], 30, 'correct')
        token = issued['grant_token']
        original_now = tool_grants._now
        future = original_now() + tool_grants.dt.timedelta(seconds=31)
        with patch.object(tool_grants, '_now', return_value=future):
            with self.assertRaises(GrantDenied):
                resolve_grant(token, 'time.now')
        events = list_grant_audit()
        self.assertTrue(any(e['action'] == 'expire' and e['status'] == 'success' for e in events))
        self.assertNotIn(token, repr(events))

    def test_raw_tokens_are_not_kept_as_dictionary_keys(self):
        import tool_grants
        with patch.dict(os.environ, {'PYTHON_AI_TOOL_GRANT_SECRET': 'correct'}):
            issued = issue_grant(['tools.read.basic'], 300, 'correct')
        token = issued['grant_token']
        self.assertNotIn(token, tool_grants._GRANTS)
        self.assertTrue(all(len(key) == 64 for key in tool_grants._GRANTS))


if __name__ == '__main__':
    unittest.main()
