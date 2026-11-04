"""UI-independent state and a bounded, coalescing event queue."""
from collections import deque
from dataclasses import dataclass, field
import time


@dataclass
class Notice:
    key: str
    title: str
    body: str = ""
    icon: str = "dialog-information-symbolic"
    level: float | None = None
    created: float = field(default_factory=time.monotonic)
    accent: str = "blue"
    display_seconds: float = 3.5


class NoticeQueue:
    def __init__(self):
        self.pending = deque(maxlen=12)
        self.current = None
        self.until = 0

    def push(self, notice, now=None, display_seconds=3.5):
        now = time.monotonic() if now is None else now
        notice.display_seconds = display_seconds
        if self.current and self.current.key == notice.key:
            self.current = notice
            self.until = now + display_seconds
        else:
            self.pending = deque((n for n in self.pending if n.key != notice.key), maxlen=12)
            self.pending.append(notice)

    def step(self, held=False, now=None, display_seconds=3.5):
        now = time.monotonic() if now is None else now
        if held and self.current:
            self.until = max(self.until, now + 1)
            return self.current
        if self.current and now >= self.until:
            self.current = None
        while not self.current and self.pending:
            notice = self.pending.popleft()
            if now - notice.created < 30:
                self.current = notice
                self.until = now + notice.display_seconds
        return self.current


@dataclass
class State:
    connected: bool = False
    media: dict = field(default_factory=dict)
    battery: dict = field(default_factory=dict)
    volume: int = 0
    muted: bool = False
    brightness: int | None = None
    privacy: set = field(default_factory=set)
    sessions: dict = field(default_factory=dict)
    privacy_records: dict = field(default_factory=dict)
    privacy_exclusions: dict = field(default_factory=dict)
    bluetooth: dict = field(default_factory=dict)
    network: dict = field(default_factory=dict)
    uxplay: bool = False
    position_at: float = field(default_factory=time.monotonic)

    def position(self):
        position = self.media.get("position", 0) / 1_000_000
        if self.media.get("status") == "Playing":
            position += time.monotonic() - self.position_at
        return min(max(0, position), self.media.get("length", 0) / 1_000_000)

    @staticmethod
    def normalize_app(value):
        value = str(value or "").strip().lower()
        return value.removesuffix(".desktop")

    def refresh_privacy(self):
        self.privacy.clear()
        self.sessions.clear()
        for (device, _pid, app), metadata in self.privacy_records.items():
            ignored = {self.normalize_app(value) for value in self.privacy_exclusions.get(device, [])}
            names = (app, metadata.get("app_id"), metadata.get("process"))
            if any(self.normalize_app(name) in ignored for name in names if name):
                continue
            self.privacy.add((device, app))
            self.sessions[device] = app

    def update(self, kind, app, data):
        if kind == "media_changed":
            old_title = self.media.get("title")
            self.media = data
            self.position_at = time.monotonic()
            if data.get("status") == "Playing" and data.get("title") and data.get("title") != old_title:
                return Notice("media", data["title"], artist(data), "audio-x-generic-symbolic")
        elif kind == "battery_changed":
            old = self.battery
            self.battery = data
            if old and old.get("isCharging") != data.get("isCharging"):
                return Notice("battery", "Đang sạc" if data.get("isCharging") else "Đã ngắt sạc", f'{data.get("percentage", 0)}%', "battery-good-symbolic")
            if data.get("isPresent") and data.get("percentage", 100) <= 20 and not data.get("isCharging") and old.get("percentage", 100) > 20:
                return Notice("battery", "Pin yếu", f'{data["percentage"]}%', "battery-caution-symbolic")
        elif kind.startswith("volume_"):
            self.volume = int(data.get("level", self.volume))
            self.muted = bool(data.get("muted", self.muted))
            return Notice("volume", "Đã tắt âm" if self.muted else "Âm lượng", f"{self.volume}%", "audio-volume-muted-symbolic" if self.muted else "audio-volume-high-symbolic", 0 if self.muted else self.volume / 100)
        elif kind == "brightness_changed":
            self.brightness = int(data.get("level", 0))
            return Notice("brightness", "Độ sáng", f"{self.brightness}%", "display-brightness-symbolic", self.brightness / 100)
        elif kind in ("camera_start", "microphone_start", "camera_stop", "microphone_stop"):
            device, action = kind.rsplit("_", 1)
            key = (device, data.get("_pid", 0), app)
            visible_before = (device, app) in self.privacy
            if action == "start":
                self.privacy_records[key] = data
            else:
                self.privacy_records.pop(key, None)
            self.refresh_privacy()
            if not visible_before and (device, app) not in self.privacy:
                return None
            if action == "stop" and any(kind == device for kind, _ in self.privacy):
                return None
            return Notice(device, ("Camera" if device == "camera" else "Micro") + (" đang bật" if action == "start" else " đã tắt"), app, "camera-web-symbolic" if device == "camera" else "audio-input-microphone-symbolic")
        elif kind.startswith("bluetooth_"):
            connected = kind.endswith("_connected")
            if connected:
                self.bluetooth[app] = data
            else:
                self.bluetooth.pop(app, None)
            device_type = data.get("device_type", "")
            icons = {"headphone": "audio-headphones-symbolic", "speaker": "audio-speakers-symbolic", "mouse": "input-mouse-symbolic", "keyboard": "input-keyboard-symbolic"}
            icon = icons.get(device_type, "bluetooth-active-symbolic" if connected else "bluetooth-disabled-symbolic")
            return Notice("bluetooth", "Đã kết nối" if connected else "Đã ngắt kết nối", app, icon,
                          accent="blue" if connected else "red")
        elif kind in ("network_connected", "network_disconnected"):
            connected = kind == "network_connected"
            self.network = data if connected else {}
            medium = data.get("kind", "wifi")
            label = "Wi-Fi" if medium in ("wifi", "802-11-wireless") else "Ethernet"
            return Notice("network", f"{label} {'đã kết nối' if connected else 'đã ngắt kết nối'}", data.get("name", app), "network-wireless-symbolic" if label == "Wi-Fi" else "network-wired-symbolic")
        elif kind == "notification":
            return Notice("notification:" + app, data.get("summary", app), data.get("body", ""), "preferences-system-notifications-symbolic")
        elif kind == "input_method":
            return Notice("input_method", "Bộ gõ", data.get("name", app), "input-keyboard-symbolic")
        elif kind == "uxplay_sharing":
            self.uxplay = bool(data.get("isSharing"))
            return Notice("uxplay", "Đang chia sẻ màn hình" if self.uxplay else "Đã dừng chia sẻ", app, "video-display-symbolic")
        return None


def artist(media):
    value = media.get("artist", "")
    return ", ".join(str(x) for x in value) if isinstance(value, list) else str(value)


def duration(seconds):
    seconds = max(0, int(seconds))
    return f"{seconds // 60}:{seconds % 60:02d}"
