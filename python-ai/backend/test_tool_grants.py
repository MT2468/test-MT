import os
import unittest
from unittest.mock import patch

from tool_grants import (
    GrantDenied,
    GrantUnavailable,
    GrantValidationError,
    clear_grants_for_tests,
    issue_grant,
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

    def test_wrong_secret_is_denied(self):
        with patch.dict(os.environ, {'PYTHON_AI_TOOL_GRANT_SECRET': 'correct'}):
            with self.assertRaises(GrantDenied):
                issue_grant(['tools.read.basic'], 300, 'wrong')

    def test_grant_resolves_only_requested_allowed_permission(self):
        with patch.dict(os.environ, {'PYTHON_AI_TOOL_GRANT_SECRET': 'correct'}):
            issued = issue_grant(['tools.read.basic'], 300, 'correct')
        token = issued['grant_token']
        self.assertGreaterEqual(len(token), 32)
        self.assertEqual(resolve_grant(token), {'tools.read.basic'})
        self.assertNotIn(token, repr(issued['permissions']))

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

    def test_revocation_is_immediate(self):
        with patch.dict(os.environ, {'PYTHON_AI_TOOL_GRANT_SECRET': 'correct'}):
            issued = issue_grant(['tools.read.basic'], 300, 'correct')
        token = issued['grant_token']
        self.assertTrue(revoke_grant(token))
        with self.assertRaises(GrantDenied):
            resolve_grant(token)

    def test_raw_tokens_are_not_kept_as_dictionary_keys(self):
        import tool_grants
        with patch.dict(os.environ, {'PYTHON_AI_TOOL_GRANT_SECRET': 'correct'}):
            issued = issue_grant(['tools.read.basic'], 300, 'correct')
        token = issued['grant_token']
        self.assertNotIn(token, tool_grants._GRANTS)
        self.assertTrue(all(len(key) == 64 for key in tool_grants._GRANTS))


if __name__ == '__main__':
    unittest.main()
