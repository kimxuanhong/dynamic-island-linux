"""Regression tests for event presentation and device state."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from island.state import Notice, NoticeQueue, State


class NoticeQueueTests(unittest.TestCase):
    def test_each_queued_notice_keeps_its_own_duration(self):
        queue = NoticeQueue()
        queue.push(Notice('volume', 'Volume', created=0), now=0, display_seconds=2)
        queue.push(Notice('notification:a', 'Message', created=0), now=0, display_seconds=7)
        self.assertEqual(queue.step(now=0).key, 'volume')
        self.assertEqual(queue.step(now=2).key, 'notification:a')
        self.assertEqual(queue.step(now=8).key, 'notification:a')
        self.assertIsNone(queue.step(now=9))

    def test_held_empty_queue_can_show_first_notice(self):
        queue = NoticeQueue()
        queue.push(Notice('volume', 'Volume', created=0), now=0)
        self.assertEqual(queue.step(held=True, now=0).key, 'volume')
        self.assertEqual(queue.step(held=True, now=5).key, 'volume')
        self.assertIsNone(queue.step(now=6))

    def test_updates_coalesce_and_extend_current_notice(self):
        queue = NoticeQueue()
        queue.push(Notice('volume', '40%', created=0), now=0, display_seconds=2)
        queue.step(now=0)
        queue.push(Notice('volume', '50%', created=1), now=1, display_seconds=3)
        self.assertEqual(queue.step(now=3).title, '50%')
        self.assertIsNone(queue.step(now=4))


class StateTests(unittest.TestCase):
    def test_media_notice_only_when_playing(self):
        state = State()
        self.assertIsNone(state.update('media_changed', '', {'status': 'Paused', 'title': 'Song'}))
        self.assertIsNotNone(state.update('media_changed', '', {'status': 'Playing', 'title': 'Next'}))

    def test_privacy_remains_active_until_last_client_stops(self):
        state = State()
        state.update('microphone_start', 'one', {})
        state.update('microphone_start', 'two', {})
        state.update('microphone_stop', 'one', {})
        self.assertEqual(state.sessions['microphone'], 'two')
        state.update('microphone_stop', 'two', {})
        self.assertNotIn('microphone', state.sessions)

    def test_privacy_tracks_processes_and_reapplies_exclusions(self):
        state = State()
        state.update('microphone_start', 'Recorder', {'_pid': 1, 'app_id': 'org.example.Recorder.desktop'})
        state.update('microphone_start', 'Recorder', {'_pid': 2, 'app_id': 'org.example.Recorder.desktop'})
        state.update('microphone_stop', 'Recorder', {'_pid': 1})
        self.assertIn(('microphone', 'Recorder'), state.privacy)
        state.privacy_exclusions['microphone'] = ['org.example.recorder']
        state.refresh_privacy()
        self.assertFalse(state.privacy)
        state.privacy_exclusions['microphone'] = []
        state.refresh_privacy()
        self.assertIn(('microphone', 'Recorder'), state.privacy)
        state.update('microphone_stop', 'Recorder', {'_pid': 2})
        self.assertFalse(state.privacy)

    def test_bluetooth_device_icon_and_disconnect_accent(self):
        state = State()
        notice = state.update('bluetooth_disconnected', 'Headset', {'device_type': 'headphone'})
        self.assertEqual(notice.icon, 'audio-headphones-symbolic')
        self.assertEqual(notice.accent, 'red')


if __name__ == '__main__':
    unittest.main()
