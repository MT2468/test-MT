import os
import unittest
from unittest.mock import patch

import server
from tool_grants import clear_grants_for_tests
from tool_registry import clear_audit_for_tests


class ToolApiTests(unittest.TestCase):
    def setUp(self):
        clear_audit_for_tests()
        clear_grants_for_tests()
        self.secret = 'local-test-secret'
        self.env = patch.dict(os.environ, {'PYTHON_AI_TOOL_GRANT_SECRET': self.secret})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def grant(self, tool_names=None, max_uses=1):
        body = server.ToolGrantRequest(
            permissions=['tools.read.basic'],
            tool_names=tool_names or ['calculator.evaluate', 'time.now'],
            ttl_seconds=300,
            max_uses=max_uses,
        )
        return server.tool_grant_issue(body, self.secret)['grant_token']

    def test_tools_endpoint_only_lists_safe_registry_tools(self):
        payload = server.tools()
        names = {tool['name'] for tool in payload['tools']}
        self.assertEqual(names, {'calculator.evaluate', 'time.now'})
        self.assertTrue(all(tool['risk'] == 'low' for tool in payload['tools']))
        self.assertTrue(all(tool['mutates_state'] is False for tool in payload['tools']))

    def test_client_cannot_self_declare_permissions(self):
        fields = set(server.ToolExecuteRequest.model_fields)
        self.assertNotIn('permissions', fields)
        self.assertIn('grant_token', fields)

    def test_grant_request_exposes_explicit_scope_and_usage_limit(self):
        fields = set(server.ToolGrantRequest.model_fields)
        self.assertIn('tool_names', fields)
        self.assertIn('max_uses', fields)
        body = server.ToolGrantRequest(
            permissions=['tools.read.basic'],
            tool_names=['calculator.evaluate'],
            max_uses=2,
        )
        issued = server.tool_grant_issue(body, self.secret)
        self.assertEqual(issued['tool_names'], ['calculator.evaluate'])
        self.assertEqual(issued['max_uses'], 2)
        self.assertEqual(issued['remaining_uses'], 2)

    def test_grant_issue_requires_server_secret(self):
        body = server.ToolGrantRequest(
            permissions=['tools.read.basic'],
            tool_names=['calculator.evaluate'],
            ttl_seconds=300,
        )
        with self.assertRaises(server.HTTPException) as denied:
            server.tool_grant_issue(body, 'wrong-secret')
        self.assertEqual(denied.exception.status_code, 403)

    def test_execute_succeeds_with_valid_grant(self):
        request = server.ToolExecuteRequest(
            name='calculator.evaluate',
            arguments={'expression': '(8+2)*5'},
            grant_token=self.grant(tool_names=['calculator.evaluate']),
        )
        result = server.tool_execute(request)
        self.assertEqual(result['result'], 50)
        self.assertEqual(result['permission'], 'tools.read.basic')
        self.assertFalse(result['mutates_state'])

    def test_grant_scope_blocks_other_registered_tool_without_consuming_use(self):
        token = self.grant(tool_names=['calculator.evaluate'], max_uses=1)
        denied_request = server.ToolExecuteRequest(name='time.now', arguments={}, grant_token=token)
        with self.assertRaises(server.HTTPException) as denied:
            server.tool_execute(denied_request)
        self.assertEqual(denied.exception.status_code, 403)

        allowed_request = server.ToolExecuteRequest(
            name='calculator.evaluate',
            arguments={'expression': '7*6'},
            grant_token=token,
        )
        result = server.tool_execute(allowed_request)
        self.assertEqual(result['result'], 42)

    def test_multi_use_grant_stops_exactly_at_limit(self):
        token = self.grant(tool_names=['time.now'], max_uses=2)
        request = server.ToolExecuteRequest(name='time.now', arguments={}, grant_token=token)
        server.tool_execute(request)
        server.tool_execute(request)
        with self.assertRaises(server.HTTPException) as exhausted:
            server.tool_execute(request)
        self.assertEqual(exhausted.exception.status_code, 403)

    def test_grant_cannot_be_replayed_through_api(self):
        token = self.grant(tool_names=['time.now'])
        request = server.ToolExecuteRequest(
            name='time.now',
            arguments={},
            grant_token=token,
        )
        server.tool_execute(request)
        with self.assertRaises(server.HTTPException) as replayed:
            server.tool_execute(request)
        self.assertEqual(replayed.exception.status_code, 403)

    def test_execute_rejects_invalid_grant(self):
        request = server.ToolExecuteRequest(
            name='calculator.evaluate',
            arguments={'expression': '2+2'},
            grant_token='x' * 32,
        )
        with self.assertRaises(server.HTTPException) as denied:
            server.tool_execute(request)
        self.assertEqual(denied.exception.status_code, 403)

    def test_revoked_grant_stops_working(self):
        token = self.grant(tool_names=['time.now'])
        result = server.tool_grant_revoke(server.ToolGrantRevokeRequest(grant_token=token))
        self.assertTrue(result['revoked'])
        request = server.ToolExecuteRequest(name='time.now', arguments={}, grant_token=token)
        with self.assertRaises(server.HTTPException) as denied:
            server.tool_execute(request)
        self.assertEqual(denied.exception.status_code, 403)

    def test_unknown_tool_is_denied_before_arbitrary_execution(self):
        request = server.ToolExecuteRequest(
            name='browser.navigate',
            arguments={'url': 'https://example.com'},
            grant_token=self.grant(),
        )
        with self.assertRaises(server.HTTPException) as missing:
            server.tool_execute(request)
        self.assertEqual(missing.exception.status_code, 403)

    def test_unknown_tool_cannot_be_placed_in_grant(self):
        with self.assertRaises(server.HTTPException) as invalid:
            server.tool_grant_issue(
                server.ToolGrantRequest(
                    permissions=['tools.read.basic'],
                    tool_names=['browser.navigate'],
                    ttl_seconds=300,
                ),
                self.secret,
            )
        self.assertEqual(invalid.exception.status_code, 400)

    def test_audit_does_not_expose_arguments_results_or_grant(self):
        secret_value = 'SUPER_PRIVATE_VALUE'
        token = self.grant(tool_names=['calculator.evaluate'])
        request = server.ToolExecuteRequest(
            name='calculator.evaluate',
            arguments={'expression': "__import__('os').system('echo %s')" % secret_value},
            grant_token=token,
        )
        with self.assertRaises(server.HTTPException):
            server.tool_execute(request)
        event = server.tool_audit(1)['events'][0]
        self.assertNotIn(secret_value, repr(event))
        self.assertNotIn(token, repr(event))
        self.assertNotIn('arguments', event)
        self.assertNotIn('result', event)

    def test_invalid_audit_limit_is_400(self):
        with self.assertRaises(server.HTTPException) as invalid:
            server.tool_audit(201)
        self.assertEqual(invalid.exception.status_code, 400)


if __name__ == '__main__':
    unittest.main()
