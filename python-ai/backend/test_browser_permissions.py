import unittest

from browser_permissions import (
    BrowserPermissionDenied,
    BrowserPermissionValidationError,
    authorize_browser_action,
    clear_browser_permissions_for_tests,
    issue_browser_grant,
    list_browser_audit,
    revoke_browser_grant,
)


class BrowserPermissionTests(unittest.TestCase):
    def setUp(self):
        clear_browser_permissions_for_tests()

    def test_grant_is_scoped_to_tab_and_origin(self):
        grant = issue_browser_grant('tab-1', 'https://Example.com/path', ['read'])
        result = authorize_browser_action(
            grant['grant_token'],
            tab_id='tab-1',
            url='https://example.com/other',
            action='read',
        )
        self.assertTrue(result['authorized'])
        self.assertEqual(result['origin'], 'https://example.com')

        with self.assertRaises(BrowserPermissionDenied):
            authorize_browser_action(
                grant['grant_token'],
                tab_id='tab-2',
                url='https://example.com',
                action='read',
            )

        with self.assertRaises(BrowserPermissionDenied):
            authorize_browser_action(
                grant['grant_token'],
                tab_id='tab-1',
                url='https://other.example',
                action='read',
            )

    def test_sensitive_interaction_requires_confirmation(self):
        grant = issue_browser_grant('tab-1', 'https://example.com', ['interact'])
        with self.assertRaises(BrowserPermissionDenied):
            authorize_browser_action(
                grant['grant_token'],
                tab_id='tab-1',
                url='https://example.com/form',
                action='interact',
            )

        result = authorize_browser_action(
            grant['grant_token'],
            tab_id='tab-1',
            url='https://example.com/form',
            action='interact',
            confirmed=True,
        )
        self.assertTrue(result['authorized'])

    def test_ungranted_action_is_denied(self):
        grant = issue_browser_grant('tab-1', 'https://example.com', ['read'])
        with self.assertRaises(BrowserPermissionDenied):
            authorize_browser_action(
                grant['grant_token'],
                tab_id='tab-1',
                url='https://example.com',
                action='navigate',
            )

    def test_revoke_invalidates_grant(self):
        grant = issue_browser_grant('tab-1', 'https://example.com', ['read'])
        self.assertTrue(revoke_browser_grant(grant['grant_token']))
        with self.assertRaises(BrowserPermissionDenied):
            authorize_browser_action(
                grant['grant_token'],
                tab_id='tab-1',
                url='https://example.com',
                action='read',
            )

    def test_audit_never_contains_grant_token(self):
        grant = issue_browser_grant('tab-1', 'https://example.com', ['read'])
        authorize_browser_action(
            grant['grant_token'],
            tab_id='tab-1',
            url='https://example.com',
            action='read',
        )
        audit = list_browser_audit(10)
        serialized = repr(audit)
        self.assertNotIn(grant['grant_token'], serialized)
        self.assertTrue(any(item['action'] == 'authorize' for item in audit))

    def test_invalid_origin_and_ttl_are_rejected(self):
        with self.assertRaises(BrowserPermissionValidationError):
            issue_browser_grant('tab-1', 'javascript:alert(1)', ['read'])
        with self.assertRaises(BrowserPermissionValidationError):
            issue_browser_grant('tab-1', 'https://example.com', ['read'], ttl_seconds=10)


if __name__ == '__main__':
    unittest.main()
