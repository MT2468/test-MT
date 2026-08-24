import unittest

from tool_registry import (
    ToolNotFound,
    ToolPermissionDenied,
    ToolValidationError,
    execute_tool,
    list_tools,
)


class ToolRegistryTests(unittest.TestCase):
    def test_registry_only_exposes_safe_read_only_tools(self):
        tools = list_tools()
        self.assertEqual({tool['name'] for tool in tools}, {'calculator.evaluate', 'time.now'})
        self.assertTrue(all(tool['permission'] == 'tools.read.basic' for tool in tools))
        self.assertTrue(all(tool['risk'] == 'low' for tool in tools))
        self.assertTrue(all(tool['mutates_state'] is False for tool in tools))

    def test_permission_is_required(self):
        with self.assertRaises(ToolPermissionDenied):
            execute_tool('calculator.evaluate', {'expression': '2+2'}, set())

    def test_calculator_executes_with_explicit_permission(self):
        result = execute_tool(
            'calculator.evaluate',
            {'expression': '(12 + 3) * 4'},
            {'tools.read.basic'},
        )
        self.assertEqual(result['result'], 60)
        self.assertFalse(result['mutates_state'])

    def test_calculator_rejects_code_execution(self):
        with self.assertRaises(ToolValidationError):
            execute_tool(
                'calculator.evaluate',
                {'expression': "__import__('os').system('echo nope')"},
                {'tools.read.basic'},
            )

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

    def test_unknown_tool_fails_closed(self):
        with self.assertRaises(ToolNotFound):
            execute_tool('browser.navigate', {'url': 'https://example.com'}, {'tools.read.basic'})


if __name__ == '__main__':
    unittest.main()
