import unittest

import server
from tool_registry import clear_audit_for_tests


class ToolApiTests(unittest.TestCase):
    def setUp(self):
        clear_audit_for_tests()

    def test_tools_endpoint_only_lists_safe_registry_tools(self):
        payload = server.tools()
        names = {tool['name'] for tool in payload['tools']}
        self.assertEqual(names, {'calculator.evaluate', 'time.now'})
        self.assertTrue(all(tool['risk'] == 'low' for tool in payload['tools']))
        self.assertTrue(all(tool['mutates_state'] is False for tool in payload['tools']))

    def test_execute_requires_explicit_permission(self):
        request = server.ToolExecuteRequest(name='calculator.evaluate', arguments={'expression': '2+2'}, permissions=[])
        with self.assertRaises(server.HTTPException) as denied:
            server.tool_execute(request)
        self.assertEqual(denied.exception.status_code, 403)
        audit = server.tool_audit(1)['events'][0]
        self.assertEqual(audit['status'], 'denied')
        self.assertEqual(audit['tool'], 'calculator.evaluate')

    def test_execute_succeeds_with_permission(self):
        request = server.ToolExecuteRequest(
            name='calculator.evaluate',
            arguments={'expression': '(8+2)*5'},
            permissions=['tools.read.basic'],
        )
        result = server.tool_execute(request)
        self.assertEqual(result['result'], 50)
        self.assertEqual(result['permission'], 'tools.read.basic')
        self.assertFalse(result['mutates_state'])

    def test_unknown_tool_is_404_not_arbitrary_execution(self):
        request = server.ToolExecuteRequest(
            name='browser.navigate',
            arguments={'url': 'https://example.com'},
            permissions=['tools.read.basic'],
        )
        with self.assertRaises(server.HTTPException) as missing:
            server.tool_execute(request)
        self.assertEqual(missing.exception.status_code, 404)

    def test_audit_does_not_expose_arguments_or_results(self):
        secret = 'SUPER_PRIVATE_VALUE'
        request = server.ToolExecuteRequest(
            name='calculator.evaluate',
            arguments={'expression': "__import__('os').system('echo %s')" % secret},
            permissions=['tools.read.basic'],
        )
        with self.assertRaises(server.HTTPException):
            server.tool_execute(request)
        event = server.tool_audit(1)['events'][0]
        self.assertNotIn(secret, repr(event))
        self.assertNotIn('arguments', event)
        self.assertNotIn('result', event)

    def test_invalid_audit_limit_is_400(self):
        with self.assertRaises(server.HTTPException) as invalid:
            server.tool_audit(201)
        self.assertEqual(invalid.exception.status_code, 400)


if __name__ == '__main__':
    unittest.main()
