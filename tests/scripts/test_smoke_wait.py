import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('smoke_wait', Path(__file__).resolve().parents[2] / 'scripts/smoke.py')
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class SmokeWaitTests(unittest.TestCase):
    def test_delayed_state_is_waited_for_without_resending_input(self):
        fetch = Mock(side_effect=[{'blocked': True}, {'blocked': True}, {'blocked': False}])
        with patch.object(smoke.time, 'sleep'):
            self.assertEqual(smoke.wait_for_state(fetch, lambda s: not s['blocked'], 'expected input'), {'blocked': False})
        self.assertEqual(fetch.call_count, 3)

    def test_failure_includes_the_last_observed_state(self):
        with self.assertRaisesRegex(AssertionError, 'expected input.*blocked.*true'):
            smoke.wait_for_state(lambda: {'blocked': True}, lambda s: not s['blocked'], 'expected input', timeout=0)

    def test_transport_errors_are_not_hidden_as_state_delays(self):
        fetch = Mock(side_effect=ConnectionError('disconnected'))
        with self.assertRaises(ConnectionError):
            smoke.wait_for_state(fetch, lambda s: True, 'expected input')
        fetch.assert_called_once()
