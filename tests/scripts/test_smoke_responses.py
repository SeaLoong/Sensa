"""Bounded response collection with fake frames and a clock; no process or network."""
import unittest

from lab_contract_fixtures import load_script

smoke = load_script('smoke')


class FrameStream:
    def __init__(self, messages=(), *, after=None, frame_seconds=.25):
        self.messages = iter(messages)
        self.after, self.frame_seconds = after, frame_seconds
        self.now, self.reads = 0., 0

    def clock(self):
        return self.now

    def receive(self):
        self.now += self.frame_seconds
        self.reads += 1
        return next(self.messages, self.after)


class SmokeResponseContracts(unittest.TestCase):
    def test_continuous_unsolicited_states_do_not_extend_missing_id_deadline(self):
        frames = FrameStream([{'id': '0', 'ok': True}],
                             after={'type': 'state', 'data': {}}, frame_seconds=.25)
        with self.assertRaisesRegex(TimeoutError, 'Missing WebSocket response IDs: 1'):
            smoke.collect_responses(frames.receive, ['0', '1'], timeout=1, clock=frames.clock)
        self.assertEqual(frames.now, 1)
        self.assertEqual(frames.reads, 4)

    def test_all_thirty_out_of_order_ids_succeed_despite_noise_and_duplicates(self):
        messages = [{'type': 'state'}, None, {'id': 'unrelated', 'ok': True}]
        messages += [{'id': str(i), 'ok': True} for i in reversed(range(30))]
        messages.insert(6, {'id': '28', 'ok': True})
        frames = FrameStream(messages)
        result = smoke.collect_responses(frames.receive, (str(i) for i in range(30)),
                                         timeout=10, clock=frames.clock)
        self.assertEqual(result, {str(i) for i in range(30)})

    def test_unknown_ids_and_duplicate_ids_cannot_complete_missing_responses(self):
        frames = FrameStream([{'id': '0', 'ok': True}, {'id': 'unknown', 'ok': True}],
                             after={'id': '0', 'ok': True})
        with self.assertRaisesRegex(TimeoutError, 'Missing WebSocket response IDs: 1'):
            smoke.collect_responses(frames.receive, ['0', '1'], timeout=1, clock=frames.clock)
        self.assertEqual(frames.now, 1)

    def test_failure_for_an_expected_id_is_not_hidden_by_a_successful_response(self):
        frames = FrameStream([{'id': '0', 'ok': False, 'data': {'error': 'fixture failure'}}])
        with self.assertRaises(AssertionError):
            smoke.collect_responses(frames.receive, ['0'], clock=frames.clock)


if __name__ == '__main__':
    unittest.main()
