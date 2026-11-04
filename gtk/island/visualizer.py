"""Mirrored visualizer motion based on the extension's bar and beat model.

The extension synthesizes movement at a fixed BPM; it does not sample audio.
"""
import random

PATTERN = (4, 6, 8, 6, 4, 2)


class Visualizer:
    def __init__(self, bpm=120, rng=None):
        self.bpm = bpm
        self.rng = rng or random.Random()
        self.reset()

    def reset(self):
        self.states = [dict(base=base, offset=0, direction=self.rng.choice((-1, 1)), boost=0.0)
                       for base in PATTERN]
        self.next_beat = None

    def step(self, now):
        if self.next_beat is None:
            self.next_beat = now + 60 / self.bpm
        elif now >= self.next_beat:
            self.next_beat = now + 60 / self.bpm
            for index, state in enumerate(self.states):
                boost = self.rng.random() * 2 + 1
                state['boost'] = boost * 1.3 if 2 <= index <= 4 else boost
        heights = []
        for index, state in enumerate(self.states):
            step = 2 if self.rng.random() > 0.7 else 1
            state['offset'] += step * state['direction']
            if state['offset'] > 2:
                state['offset'], state['direction'] = 2, -1
            elif state['offset'] < -2:
                state['offset'], state['direction'] = -2, 1
            state['boost'] = max(0, state['boost'] - 0.5)
            height = min(12, state['base'] + state['offset'] + state['boost'])
            if index:
                previous = self.states[index - 1]
                previous_height = min(12, previous['base'] + previous['offset'] + previous['boost'])
                height = max(height, previous_height - 2)
            # One centred GTK bar represents the two mirrored extension bars.
            heights.append(max(2, round(height * 2)))
        return heights
