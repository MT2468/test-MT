import os
import unittest
from unittest.mock import patch

import agent_executor
from agent_executor import AgentSafetyError, AgentTimeoutError, AgentValidationError, run_agent_plan
from tool_grants import GrantDenied, clear_grants_for_tests, issue_grant
from tool_registry import clear_audit_for_tests


class AgentExecutorTests(unittest.TestCase):
    def setUp(self):
        clear_grants_for_tests()
        clear_audit_for_tests()
        self.env = patch.dict(os.environ, {'PYTHON_AI_TOOL_GRANT_SECRET': 'correct'})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def grant(self, tools, max_uses):
        return issue_grant(
            ['tools.read.basic'],
            300,
            'correct',
            tool_names=tools,
            max_uses=max_uses,
        )['grant_token']

    def test_executes_bounded_read_only_plan(self):
        token = self.grant(['calculator.evaluate', 'time.now'], 2)
        result = run_agent_plan([
            {'name': 'calculator.evaluate', 'arguments': {'expression': '6*7'}},
            {'name': 'time.now', 'arguments': {}},
        ], token)
        self.assertTrue(result['ok'])
        self.assertEqual(result['steps_executed'], 2)
        self.assertEqual(result['results'][0]['result'], 42)
        self.assertTrue(all(item['risk'] == 'low' for item in result['results']))
        self.assertTrue(all(item['mutates_state'] is False for item in result['results']))

    def test_plan_cannot_exceed_six_steps(self):
        token = self.grant(['time.now'], 7)
        with self.assertRaises(AgentValidationError):
            run_agent_plan([{'name': 'time.now', 'arguments': {}}] * 7, token)

    def test_scope_is_enforced_per_step(self):
        token = self.grant(['calculator.evaluate'], 1)
        with self.assertRaises(AgentSafetyError):
            run_agent_plan([{'name': 'browser.navigate', 'arguments': {'url': 'https://example.com'}}], token)
        # A blocked unknown tool must not consume the valid calculator use.
        result = run_agent_plan([{'name': 'calculator.evaluate', 'arguments': {'expression': '2+3'}}], token)
        self.assertEqual(result['results'][0]['result'], 5)

    def test_entire_plan_is_preflighted_before_any_step_executes(self):
        token = self.grant(['calculator.evaluate'], 1)
        with self.assertRaises(AgentSafetyError):
            run_agent_plan([
                {'name': 'calculator.evaluate', 'arguments': {'expression': '40+2'}},
                {'name': 'browser.navigate', 'arguments': {'url': 'https://example.com'}},
            ], token)
        # Se o primeiro passo tivesse executado antes da falha do segundo, este uso já estaria esgotado.
        result = run_agent_plan([
            {'name': 'calculator.evaluate', 'arguments': {'expression': '40+2'}},
        ], token)
        self.assertEqual(result['results'][0]['result'], 42)

    def test_registered_tool_scope_failure_is_preflighted_before_any_step(self):
        token = self.grant(['calculator.evaluate'], 1)
        with self.assertRaises(GrantDenied):
            run_agent_plan([
                {'name': 'calculator.evaluate', 'arguments': {'expression': '20+22'}},
                {'name': 'time.now', 'arguments': {}},
            ], token)
        # O plano inteiro deve falhar antes de consumir o uso válido da calculadora.
        result = run_agent_plan([
            {'name': 'calculator.evaluate', 'arguments': {'expression': '20+22'}},
        ], token)
        self.assertEqual(result['results'][0]['result'], 42)

    def test_insufficient_grant_uses_are_preflighted_before_any_step(self):
        token = self.grant(['calculator.evaluate', 'time.now'], 1)
        with self.assertRaises(GrantDenied):
            run_agent_plan([
                {'name': 'calculator.evaluate', 'arguments': {'expression': '7*6'}},
                {'name': 'time.now', 'arguments': {}},
            ], token)
        # Capacidade insuficiente não pode consumir parcialmente o grant.
        result = run_agent_plan([
            {'name': 'calculator.evaluate', 'arguments': {'expression': '7*6'}},
        ], token)
        self.assertEqual(result['results'][0]['result'], 42)

    def test_registered_tool_still_needs_grant_scope(self):
        token = self.grant(['calculator.evaluate'], 1)
        with self.assertRaises(GrantDenied):
            run_agent_plan([{'name': 'time.now', 'arguments': {}}], token)

    def test_unexpected_step_fields_are_rejected_before_grant_use(self):
        token = self.grant(['calculator.evaluate'], 1)
        with self.assertRaises(AgentValidationError):
            run_agent_plan([{
                'name': 'calculator.evaluate',
                'arguments': {'expression': '2+2'},
                'permission': 'tools.read.basic',
            }], token)
        result = run_agent_plan([{'name': 'calculator.evaluate', 'arguments': {'expression': '2+2'}}], token)
        self.assertEqual(result['results'][0]['result'], 4)

    def test_invalid_later_step_is_rejected_before_grant_use(self):
        token = self.grant(['calculator.evaluate'], 1)
        with self.assertRaises(AgentValidationError):
            run_agent_plan([
                {'name': 'calculator.evaluate', 'arguments': {'expression': '3*3'}},
                {'name': 'calculator.evaluate', 'arguments': [],},
            ], token)
        result = run_agent_plan([{'name': 'calculator.evaluate', 'arguments': {'expression': '3*3'}}], token)
        self.assertEqual(result['results'][0]['result'], 9)

    def test_invalid_limits_are_rejected(self):
        token = self.grant(['time.now'], 1)
        with self.assertRaises(AgentValidationError):
            run_agent_plan([{'name': 'time.now', 'arguments': {}}], token, max_steps=7)
        with self.assertRaises(AgentValidationError):
            run_agent_plan([{'name': 'time.now', 'arguments': {}}], token, max_runtime_seconds=6)

    def test_timeout_is_checked_between_steps(self):
        token = self.grant(['time.now'], 2)
        with patch.object(agent_executor.time, 'monotonic', side_effect=[0.0, 0.0, 10.0]):
            with self.assertRaises(AgentTimeoutError):
                run_agent_plan([
                    {'name': 'time.now', 'arguments': {}},
                    {'name': 'time.now', 'arguments': {}},
                ], token, max_runtime_seconds=1.0)


if __name__ == '__main__':
    unittest.main()
