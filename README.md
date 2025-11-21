# Dynamic Island for GNOME Shell

🏝️ Extension GNOME Shell lấy cảm hứng từ Dynamic Island trên iPhone và NotchNook trên macOS.

## ✨ Tính năng

- 🎵 Hiển thị thông tin bài hát đang phát (tên bài, nghệ sĩ)
- 🎨 Giao diện đẹp mắt với animation mượt mà
- 🔄 Tự động thu nhỏ khi không phát nhạc
- 🎮 Tích hợp MPRIS - hỗ trợ hầu hết các music player trên Linux
- 💫 Hiệu ứng hover và click tương tác

## 📋 Yêu cầu

- GNOME Shell 42, 43, 44, 45, hoặc 46
- Linux với DBus (có sẵn trên hầu hết các distro)
- Music player hỗ trợ MPRIS (Spotify, Rhythmbox, VLC, mpv, etc.)

## 🚀 Cài đặt

### Cách 1: Script tự động (Khuyên dùng)

```bash
chmod +x install.sh
./install.sh
```

### Cách 2: Cài đặt thủ công

1. Tạo thư mục extension:
```bash
mkdir -p ~/.local/share/gnome-shell/extensions/dynamic-island@xuanhong
```

2. Copy các file vào thư mục:
```bash
cp metadata.json extension.js stylesheet.css ~/.local/share/gnome-shell/extensions/dynamic-island@xuanhong/
```

3. Khởi động lại GNOME Shell:
   - Trên X11: `Alt + F2`, gõ `r`, nhấn Enter
   - Trên Wayland: Đăng xuất và đăng nhập lại

4. Bật extension:
```bash
gnome-extensions enable dynamic-island@xuanhong
```

Hoặc dùng GNOME Extensions app (gnome-tweaks hoặc Extension Manager).

## 🎮 Cách sử dụng

1. Sau khi cài đặt và bật extension, bạn sẽ thấy một "đảo" nhỏ màu đen ở giữa đầu màn hình
2. Mở music player của bạn (Spotify, Rhythmbox, VLC, etc.)
3. Phát nhạc - Dynamic Island sẽ tự động mở rộng và hiển thị thông tin bài hát
4. Khi tạm dừng, nó sẽ hiển thị trong 5 giây rồi thu nhỏ lại
5. Click vào island để tương tác (có thể mở rộng thêm tính năng sau)

## 🎨 Music Players được hỗ trợ

Dynamic Island hoạt động với bất kỳ music player nào hỗ trợ MPRIS:

- ✅ Spotify
- ✅ Rhythmbox
- ✅ VLC
- ✅ mpv (với script MPRIS)
- ✅ Lollypop
- ✅ GNOME Music
- ✅ Clementine
- ✅ Audacious
- ✅ Và nhiều player khác...

## 🛠️ Gỡ cài đặt

```bash
gnome-extensions disable dynamic-island@xuanhong
rm -rf ~/.local/share/gnome-shell/extensions/dynamic-island@xuanhong
```

## 🐛 Gỡ lỗi

Nếu extension không hoạt động:

1. Kiểm tra logs:
```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

2. Đảm bảo music player của bạn hỗ trợ MPRIS:
```bash
dbus-send --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus.ListNames | grep mpris
```

3. Khởi động lại GNOME Shell (Alt + F2, gõ 'r')

## 🎯 Tính năng tương lai

- [ ] Media controls (play/pause/next/previous)
- [ ] Album art/cover image
- [ ] Hiển thị notification
- [ ] Tùy chỉnh màu sắc và vị trí
- [ ] Animation nâng cao hơn
- [ ] Hỗ trợ thêm các loại thông báo khác (cuộc gọi, timer, etc.)

## 📝 License

MIT License - Tự do sử dụng và chỉnh sửa

## 🤝 Đóng góp

Contributions, issues và feature requests đều được chào đón!

## ⭐ Credits

Inspired by:
- Apple's Dynamic Island
- NotchNook for macOS
- GNOME Shell Extension development community

