import unittest

from tool_registry import (
    ToolNotFound,
    ToolPermissionDenied,
    ToolValidationError,
    clear_audit_for_tests,
    execute_tool,
    list_audit,
    list_tools,
)


class ToolRegistryTests(unittest.TestCase):
    def setUp(self):
        clear_audit_for_tests()

    def test_registry_only_exposes_safe_read_only_tools(self):
        tools = list_tools()
        self.assertEqual({tool['name'] for tool in tools}, {'calculator.evaluate', 'time.now'})
        self.assertTrue(all(tool['permission'] == 'tools.read.basic' for tool in tools))
        self.assertTrue(all(tool['risk'] == 'low' for tool in tools))
        self.assertTrue(all(tool['mutates_state'] is False for tool in tools))

    def test_permission_is_required(self):
        with self.assertRaises(ToolPermissionDenied):
            execute_tool('calculator.evaluate', {'expression': '2+2'}, set())
        event = list_audit(1)[0]
        self.assertEqual(event['status'], 'denied')
        self.assertEqual(event['error_type'], 'ToolPermissionDenied')

    def test_calculator_executes_with_explicit_permission(self):
        result = execute_tool(
            'calculator.evaluate',
            {'expression': '(12 + 3) * 4'},
            {'tools.read.basic'},
        )
        self.assertEqual(result['result'], 60)
        self.assertFalse(result['mutates_state'])
        self.assertEqual(list_audit(1)[0]['status'], 'success')

    def test_calculator_rejects_code_execution(self):
        secret = "__import__('os').system('echo TOP_SECRET')"
        with self.assertRaises(ToolValidationError):
            execute_tool('calculator.evaluate', {'expression': secret}, {'tools.read.basic'})
        event = list_audit(1)[0]
        self.assertEqual(event['status'], 'error')
        self.assertNotIn('TOP_SECRET', repr(event))
        self.assertNotIn('expression', event)
        self.assertNotIn('result', event)

    def test_calculator_rejects_unexpected_arguments(self):
        with self.assertRaises(ToolValidationError):
            execute_tool(
                'calculator.evaluate',
                {'expression': '1+1', 'secret': 'should-not-be-forwarded'},
                {'tools.read.basic'},
            )

    def test_time_rejects_arguments(self):
        with self.assertRaises(ToolValidationError):
            execute_tool('time.now', {'timezone': 'UTC'}, {'tools.read.basic'})

    def test_unknown_tool_fails_closed_and_is_audited(self):
        with self.assertRaises(ToolNotFound):
            execute_tool('browser.navigate', {'url': 'https://example.com'}, {'tools.read.basic'})
        event = list_audit(1)[0]
        self.assertEqual(event['tool'], 'browser.navigate')
        self.assertEqual(event['status'], 'denied')
        self.assertEqual(event['error_type'], 'ToolNotFound')

    def test_audit_limit_validation(self):
        for invalid in (0, 201, True, '10'):
            with self.assertRaises(ToolValidationError):
                list_audit(invalid)

    def test_audit_is_bounded_to_200_events(self):
        for _ in range(205):
            execute_tool('time.now', {}, {'tools.read.basic'})
        self.assertEqual(len(list_audit(200)), 200)


if __name__ == '__main__':
    unittest.main()
