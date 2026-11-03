# Dynamic Island for Linux

## Cài đặt — một lệnh

Dành cho **Arch Linux / CachyOS, Fedora và Ubuntu chạy GNOME Shell 48–51**. Mở Terminal trong phiên GNOME rồi chạy:

```bash
curl -fsSL https://raw.githubusercontent.com/kimxuanhong/dynamic-island-linux/main/install.sh | bash
```

Installer tự cài dependency bằng `pacman`, `dnf` hoặc `apt-get`, chuẩn bị Go, build backend và cài extension. **Không thêm `sudo` vào lệnh trên**; script sẽ tự yêu cầu quyền khi cần.

Cài xong, **đăng xuất rồi đăng nhập lại**. Chạy lại lệnh trên để cập nhật bản GitHub.

Nếu đang sửa source trên máy, xem [cài từ source cục bộ](#cài-hoặc-cập-nhật-từ-source-cục-bộ).

---

<div align="center">

![Dynamic Island Linux](https://img.shields.io/badge/GNOME-Shell-4A86CF?style=for-the-badge&logo=gnome&logoColor=white)
![Go](https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

**Dynamic Island trên Linux - Lấy cảm hứng từ NotchNook cho macOS**

Một GNOME Shell Extension hiển thị thông tin phát nhạc, thông báo, và nhiều hơn nữa trong một "đảo động" đẹp mắt ngay trên thanh trạng thái.

[Tính năng](#-tính-năng) • [Cài đặt](#-cài-đặt) • [Sử dụng](#-sử-dụng) • [Phát triển](#-phát-triển)

</div>

---

## 📋 Mục lục

- [Giới thiệu](#-giới-thiệu)
- [Tính năng](#-tính-năng)
- [Yêu cầu hệ thống](#-yêu-cầu-hệ-thống)
- [Cài đặt](#-cài-đặt)
- [Sử dụng](#-sử-dụng)
- [Gỡ cài đặt](#-gỡ-cài-đặt)
- [Phát triển](#-phát-triển)
- [Đóng góp](#-đóng-góp)
- [Giấy phép](#-giấy-phép)

---

## 🎯 Giới thiệu

**Dynamic Island for Linux** là một GNOME Shell Extension mang trải nghiệm Dynamic Island từ iPhone và NotchNook (macOS) đến với Linux. Extension này tạo ra một "đảo động" thông minh trên thanh trạng thái GNOME, hiển thị thông tin về:

- 🎵 Phát nhạc (Media Player)
- 🔋 Pin và nguồn điện
- 🔊 Âm lượng và độ sáng
- 📷 Camera đang hoạt động
- 🎙️ Microphone đang ghi âm
- 🔔 Thông báo hệ thống
- 🪟 Thông báo mở/đóng cửa sổ
- 🔌 Bluetooth
- 🌐 Wi-Fi và Ethernet (NetworkManager)

Extension hoạt động với một **backend server** viết bằng Go để theo dõi các sự kiện hệ thống thông qua D-Bus.

---

## ✨ Tính năng

### 🎵 Media Player
- Hiển thị thông tin bài hát đang phát (tiêu đề, nghệ sĩ, album art)
- Điều khiển phát nhạc: Play/Pause, Next, Previous
- Thanh tiến trình (seek bar) với khả năng tua
- Hỗ trợ tất cả media player tương thích MPRIS (Spotify, VLC, Rhythmbox, v.v.)

### 🔋 Thông tin Pin
- Hiển thị phần trăm pin
- Trạng thái sạc/không sạc
- Không hiển thị pin hoặc nguồn AC khi hệ thống báo không có pin
- Khi không có pin và không có nội dung hoạt động, notch tự ẩn; nhạc và các sự kiện vẫn hiển thị bình thường

### 🔊 Điều khiển Âm lượng & Độ sáng
- Hiển thị mức âm lượng khi thay đổi
- Hiển thị độ sáng màn hình khi điều chỉnh
- Tự động ẩn sau vài giây
- Nếu thẻ đang mở rộng, thay nội dung âm lượng/độ sáng ngay tại chỗ; không chờ thu thẻ hiện tại rồi bung lại

### 📷 Thông báo Camera & Microphone
- Cảnh báo khi camera được kích hoạt
- Cảnh báo khi microphone đang ghi âm
- Loại bỏ nguồn monitor của loa khỏi chỉ báo microphone khi PulseAudio/PipeWire cung cấp thông tin nguồn
- Trong Preferences, thêm app ID, tên process hoặc tên app chính xác vào **Microphone Excluded Apps / Camera Excluded Apps**, phân cách bằng dấu phẩy rồi Apply; chỉ ảnh hưởng chỉ báo trong Island
- Nhiều app dùng đồng thời được theo dõi riêng; loại trừ app áp dụng ngay
- Giới hạn: nguồn âm thanh không xác định vẫn hiện chỉ báo; camera hiện được nhận diện qua process mở `/dev/video*`, nên app qua portal có thể hiện tên process trung gian

### 🔔 Thông báo
- Chọn **Off / Flying icon / Expanded card** tại Preferences → Notifications and Windows
- Icon bay có thể là icon app, thư hoặc máy bay; chỉnh thời gian animation từ 200–3000 ms
- Nếu đang ẩn và không có nội dung compact, mở notch compact trống trước rồi mới chạy icon; giữ notch đến hết thông báo rồi thu lại. Nếu đã có compact thì dùng ngay nội dung đang hiện.
- Thẻ mở rộng hiển thị tiêu đề và nội dung, tự ẩn sau 1–10 giây; thay banner GNOME khi được chọn. Thông báo vẫn còn trong lịch sử hệ thống và không bị đánh dấu đã đọc chỉ vì hiện trong Island.

### 🪟 Sự kiện cửa sổ
- Hiển thị thẻ có icon và tên app khi mở/đóng cửa sổ mới
- Đây là thông báo sự kiện, không phải danh sách ứng dụng đang chạy
- Bật/tắt bằng **Window Open and Close Events** trong Preferences

### 🌐 Kết nối mạng
- Hiển thị kết nối/ngắt kết nối Wi-Fi và Ethernet; ưu tiên SSID Wi-Fi thật, dùng tên connection profile khi không đọc được SSID
- Gom thay đổi liên tiếp khi chuyển mạng; không thông báo theo dao động cường độ sóng
- Không thông báo lại trạng thái sẵn có lúc bật extension
- Bật/tắt riêng Wi-Fi/Ethernet và Bluetooth trong Preferences → Connections
- NetworkManager là tùy chọn; nếu không có thì chỉ phần thông báo Wi-Fi/Ethernet không hoạt động

### 🎨 Giao diện
- Animation mượt mà, tự nhiên
- Tự động mở rộng/thu nhỏ dựa trên nội dung
- Split notch: quản lý đồng thời các phiên media, mic, camera và chia sẻ qua sequence hai notch
- Hover effects và transitions đẹp mắt
- Tích hợp hoàn hảo với GNOME Shell

---

## 💻 Yêu cầu hệ thống

### Hệ điều hành
- **GNOME Shell**: Phiên bản 48, 49, 50, hoặc 51
- **Linux Distribution**: Ubuntu, Fedora, Arch Linux, hoặc bất kỳ distro nào chạy GNOME

### Phần mềm cần thiết
- **Go**: Phiên bản 1.23 trở lên (để build backend server)
- **Git**: Để clone repository
- **systemd**: Để chạy backend server như một service

### Thư viện Go (tự động cài đặt khi build)
- `github.com/godbus/dbus/v5`: Để giao tiếp với D-Bus

---

## 🚀 Cài đặt

Làm theo [lệnh cài đặt](#cài-đặt--một-lệnh) ở đầu trang.

### Cài hoặc cập nhật từ source cục bộ

Nếu đã clone repository hoặc vừa sửa code, chạy trong thư mục chứa `install.sh`:

```bash
DYNAMIC_ISLAND_SOURCE_DIR="$PWD" bash ./install.sh
```

Installer build chính source hiện tại, thay binary backend, restart service và cài extension. Sau đó đăng xuất rồi đăng nhập lại. Chạy `bash install.sh` không có biến này sẽ tải/cập nhật source GitHub vào thư mục riêng.

### Cập nhật bản trên GitHub

Chạy lại lệnh cài đặt ở đầu trang, rồi đăng xuất/đăng nhập. Source GitHub được lưu tại `~/.local/share/dynamic-island/source` theo cấu hình mặc định.

### Dùng repository hoặc branch khác

```bash
curl -fsSL https://raw.githubusercontent.com/kimxuanhong/dynamic-island-linux/main/install.sh | \
  DYNAMIC_ISLAND_REPO_URL=https://github.com/USER/FORK.git \
  DYNAMIC_ISLAND_REPO_REF=my-branch bash
```

---

## 🎮 Sử dụng

### Cài đặt giao diện

Mở Preferences của Dynamic Island trong ứng dụng Extensions, hoặc chạy:

```sh
gnome-extensions prefs dynamic-island@xuanhong
```

- **Background Opacity**: độ đậm của nền từ 0–100%, mặc định 80%; không làm mờ chữ và icon.
- **Island Width / Island Height**: chỉnh riêng chiều rộng (120–320 px) và chiều cao (36–88 px) của compact, mặc định 130 × 36 px. Hai notch có cùng chiều cao; chữ và icon giữ kích thước gốc. Chỉ áp dụng cho compact; thẻ expanded giữ cố định 440 × 180 px.
- **Show Volume / Show Brightness**: bật/tắt thông báo thay đổi âm lượng/độ sáng trong Island.
- **Replace System Volume Overlay**: thay OSD âm lượng bằng Island khi Show Volume được bật; mặc định tắt. Show Brightness tự thay OSD độ sáng khi bật và trả lại OSD gốc khi tắt. Các OSD khác vẫn giữ nguyên.
- **Display Time**: thời gian hiển thị âm lượng/độ sáng từ 1–10 giây.
- **Default Content**: nội dung mặc định khi không có phiên hoạt động: Battery if present, Clock (24 giờ), Network speed hoặc Hidden. Media, microphone, camera và UxPlay luôn thay thế nội dung mặc định; chỉ các phiên hoạt động tham gia sequence hai notch. Khi tất cả kết thúc, nội dung mặc định tự trở lại. Chỉ chuyển trạng thái cắm/rút sạc mới hiện thẻ pin tạm thời kể cả khi pin đang bị thay thế; cập nhật phần trăm pin và các mốc dung lượng không kích hoạt animation. Với Hidden, notch về compact rồi khép hai đầu vào tâm đồng thời mờ dần; khi có sự kiện cần thẻ expanded thì bung và hiện dần trực tiếp từ tâm, không dừng ở compact. Chỉ nội dung compact và notify dạng icon mới dùng animation mở compact.

**Network speed** hiển thị tốc độ nhận (↓) và gửi (↑), cập nhật mỗi giây, đơn vị B/s, KB/s, MB/s. Thẻ mở rộng hiện tên Wi-Fi đang kết nối (hoặc Ethernet) cùng icon mạng riêng; thông tin tên mạng vẫn cập nhật kể cả khi tắt thông báo kết nối. Đây là lưu lượng tổng trên card mạng vật lý, gồm cả mạng LAN, không phải đo băng thông Internet. Không đếm lại lưu lượng trên loopback, VPN hay bridge. Nếu không đọc được dữ liệu thì hiển thị “—”.

### Tương tác cơ bản

- **Media Player**: Click vào đảo khi đang phát nhạc để mở rộng và điều khiển
- **Pin**: Click vào icon pin để xem thông tin chi tiết
- **Swap nội dung**: Khi có split notch (media + pin), click vào notch phụ để đổi vị trí nội dung

### Kiểm tra Backend Server

Kiểm tra xem backend server có đang chạy không:

```bash
systemctl --user status dynamic-island-server.service
```

Xem log của server:

```bash
journalctl --user -u dynamic-island-server.service -f
```

### Khởi động lại Extension

Nếu extension không hoạt động đúng:

```bash
# Tắt extension
gnome-extensions disable dynamic-island@xuanhong

# Bật lại
gnome-extensions enable dynamic-island@xuanhong

# Khởi động lại GNOME Shell (chỉ GNOME 48–49 trên X11)
# Alt + F2 -> gõ 'r' -> Enter
```

---

## 🗑️ Gỡ cài đặt

### Gỡ Extension

```bash
# Tắt extension
gnome-extensions disable dynamic-island@xuanhong

# Xóa extension
rm -rf ~/.local/share/gnome-shell/extensions/dynamic-island@xuanhong
```

### Gỡ Backend Server

```bash
# Dừng và vô hiệu hóa service
systemctl --user stop dynamic-island-server.service
systemctl --user disable dynamic-island-server.service

# Xóa file service
rm ~/.config/systemd/user/dynamic-island-server.service

# Reload systemd
systemctl --user daemon-reload

# Xóa binary
rm ~/.local/bin/dynamic-island-server
```

### Khởi động lại GNOME Shell

- **GNOME 48–49 trên X11**: `Alt + F2` -> `r` -> Enter
- **Wayland / GNOME 50–51**: Đăng xuất và đăng nhập lại

---

## 🛠️ Phát triển

### Cấu trúc dự án

```
dynamic-island-linux/
├── controllers/          # Điều khiển chính của extension
│   └── notchController.js
├── models/              # Models quản lý dữ liệu
│   ├── batteryManager.js
│   ├── bluetoothManager.js
│   ├── brightnessManager.js
│   ├── cameraManager.js
│   ├── mediaManager.js
│   ├── microphoneManager.js
│   ├── notificationManager.js
│   ├── volumeManager.js
│   └── windowManager.js
├── views/               # Giao diện UI
│   ├── batteryView.js
│   ├── bluetoothView.js
│   ├── brightnessView.js
│   ├── cameraView.js
│   ├── mediaView.js
│   ├── microphoneView.js
│   ├── notificationView.js
│   ├── volumeView.js
│   └── windowView.js
├── utils/               # Tiện ích
│   ├── animationController.js
│   ├── cycleManager.js
│   ├── notchConstants.js
│   ├── presenterRegistry.js
│   └── ...
├── server/              # Backend Go server
│   ├── main.go
│   ├── core/           # Core functionality
│   └── modules/        # Các module theo dõi hệ thống
│       ├── battery/
│       ├── bluetooth/
│       ├── brightness/
│       ├── camera/
│       ├── media/
│       ├── microphone/
│       ├── notification/
│       └── volume/
├── extension.js         # Entry point của extension
├── metadata.json        # Metadata của extension
└── stylesheet.css       # Styles
```

### Cài lại sau khi sửa code

Từ thư mục gốc repository:

```bash
DYNAMIC_ISLAND_SOURCE_DIR="$PWD" bash ./install.sh
```

Đăng xuất/đăng nhập lại để GNOME nạp JavaScript và stylesheet mới.

### Debug Extension

Xem log của GNOME Shell:

```bash
# Xem log real-time
journalctl -f /usr/bin/gnome-shell

# Hoặc sử dụng Looking Glass (Alt + F2 -> 'lg')
```

### Thêm tính năng mới

1. **Tạo Manager** trong `models/` để quản lý dữ liệu
2. **Tạo View** trong `views/` để hiển thị UI
3. **Đăng ký Presenter** trong `utils/presenterRegistry.js`
4. **Thêm module backend** trong `server/modules/` nếu cần

---

## 🤝 Đóng góp

Mọi đóng góp đều được hoan nghênh! Nếu bạn muốn đóng góp:

1. Fork repository
2. Tạo branch mới (`git checkout -b feature/AmazingFeature`)
3. Commit thay đổi (`git commit -m 'Add some AmazingFeature'`)
4. Push lên branch (`git push origin feature/AmazingFeature`)
5. Mở Pull Request

### Báo lỗi

Nếu bạn gặp lỗi, vui lòng tạo issue trên GitHub với thông tin:
- Phiên bản GNOME Shell
- Distribution Linux
- Log từ `journalctl --user -u dynamic-island-server.service`
- Các bước tái hiện lỗi

---

## 📝 Giấy phép

Dự án này được phát hành dưới giấy phép MIT. Xem file `LICENSE` để biết thêm chi tiết.

---

## 🙏 Cảm ơn

- Lấy cảm hứng từ **NotchNook** cho macOS
- **Apple** cho ý tưởng Dynamic Island
- Cộng đồng **GNOME** và **Go**

---

## 📧 Liên hệ

- **GitHub**: [@kimxuanhong](https://github.com/kimxuanhong)
- **Repository**: [dynamic-island-linux](https://github.com/kimxuanhong/dynamic-island-linux)

---

<div align="center">

**Nếu bạn thấy dự án này hữu ích, hãy cho một ⭐ trên GitHub!**

Made with ❤️ for the Linux community

</div>


### Input method announcement

Cooperating input methods can broadcast a session D-Bus signal when selected.
Island shows the name in an expanded card for two seconds, using its event queue.
No server change is required. Send only on a user switch, not on every focus event.

- Path: `/com/github/dynamic_island/InputMethod`
- Interface: `com.github.dynamic_island.InputMethod`
- Signal: `Activated`
- Signature: `(sss)` — stable ID, display name, themed icon name

```sh
gdbus emit --session --object-path /com/github/dynamic_island/InputMethod \
  --signal com.github.dynamic_island.InputMethod.Activated \
  areca 'Bộ gõ ArecaIME' org.fcitx.Fcitx5.fcitx-areca
```

Areca implements this signal through its Fcitx5 addon. Other input methods can
use the same interface without depending on Areca.
