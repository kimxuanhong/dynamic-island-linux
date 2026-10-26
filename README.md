# Dynamic Island for Linux

## 🚀 CÀI ĐẶT TỰ ĐỘNG — CHỈ MỘT LỆNH

> Dành cho GNOME Shell 48, 49, 50 và 51. Installer sẽ tự cài dependency và Go, clone source, build backend, thiết lập systemd user service, build extension, cài đặt và bật extension.

```bash
curl -fsSL https://raw.githubusercontent.com/kimxuanhong/dynamic-island-linux/main/install.sh | bash
```

Chạy lại đúng lệnh trên để cập nhật lên phiên bản mới nhất. Installer không được chạy bằng `sudo`; nó chỉ yêu cầu mật khẩu `sudo` khi cần cài các gói hệ thống. Nếu muốn kiểm tra script trước khi chạy:

```bash
curl -fsSL https://raw.githubusercontent.com/kimxuanhong/dynamic-island-linux/main/install.sh -o install.sh
less install.sh
bash install.sh
```

Sau khi hoàn tất, nếu Dynamic Island chưa xuất hiện ngay, hãy đăng xuất rồi đăng nhập lại một lần.

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
- 🪟 Ứng dụng đang mở
- 🔌 Bluetooth

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
- Tự động ẩn trên máy tính để bàn (không có pin)

### 🔊 Điều khiển Âm lượng & Độ sáng
- Hiển thị mức âm lượng khi thay đổi
- Hiển thị độ sáng màn hình khi điều chỉnh
- Tự động ẩn sau vài giây

### 📷 Thông báo Camera & Microphone
- Cảnh báo khi camera được kích hoạt
- Cảnh báo khi microphone đang ghi âm
- Bảo vệ quyền riêng tư của bạn

### 🔔 Thông báo
- Hiển thị thông báo hệ thống với animation đẹp mắt
- Icon máy bay bay qua màn hình (có thể tùy chỉnh)

### 🎨 Giao diện
- Animation mượt mà, tự nhiên
- Tự động mở rộng/thu nhỏ dựa trên nội dung
- Split notch: hiển thị đồng thời media và pin
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

### Cài đặt tự động (khuyên dùng)

```bash
curl -fsSL https://raw.githubusercontent.com/kimxuanhong/dynamic-island-linux/main/install.sh | bash
```

Lệnh này tự động:

1. Kiểm tra GNOME Shell 48–51.
2. Cài Git, curl, công cụ build và Go 1.23+ nếu máy chưa có.
3. Clone hoặc cập nhật source tại `~/.local/share/dynamic-island/source`.
4. Build backend vào `~/.local/bin/dynamic-island-server`.
5. Cài và khởi động `dynamic-island-server.service` bằng systemd user.
6. Compile schema, đóng gói, cài và bật GNOME Shell extension.

Có thể đổi repository hoặc branch khi phát triển:

```bash
curl -fsSL https://raw.githubusercontent.com/kimxuanhong/dynamic-island-linux/main/install.sh | \
  DYNAMIC_ISLAND_REPO_URL=https://github.com/USER/FORK.git \
  DYNAMIC_ISLAND_REPO_REF=my-branch bash
```

### Cài đặt thủ công

### Bước 1: Clone Repository

```bash
cd ~/Documents
git clone https://github.com/kimxuanhong/dynamic-island-linux.git
cd dynamic-island-linux
```

### Bước 2: Build Backend Server

Backend server được viết bằng Go và cần được build trước:

```bash
cd server
go build -o dynamic-island-server main.go
```

### Bước 3: Cài đặt Backend Server

Di chuyển binary đã build vào thư mục local bin:

```bash
mkdir -p ~/.local/bin
cp dynamic-island-server ~/.local/bin/
chmod +x ~/.local/bin/dynamic-island-server
```

### Bước 4: Cài đặt Systemd Service

Tạo file service để backend tự động chạy khi đăng nhập:

```bash
mkdir -p ~/.config/systemd/user
cp dynamic-island-server.service ~/.config/systemd/user/
```

File service dùng `%h` nên hoạt động với mọi tên người dùng:

```ini
[Unit]
Description=Dynamic Island Server
PartOf=graphical-session.target
After=graphical-session.target

[Service]
ExecStart=%h/.local/bin/dynamic-island-server
Restart=always
RestartSec=3

[Install]
WantedBy=graphical-session.target
```

`%h` được systemd tự động thay bằng thư mục home của người dùng.

### Bước 5: Kích hoạt và Khởi động Service

```bash
# Reload systemd để nhận service mới
systemctl --user daemon-reload

# Kích hoạt service để tự động chạy khi đăng nhập
systemctl --user enable dynamic-island-server.service

# Khởi động service ngay
systemctl --user start dynamic-island-server.service

# Kiểm tra trạng thái
systemctl --user status dynamic-island-server.service
```

### Bước 6: Cài đặt GNOME Extension

Quay lại thư mục gốc và cài đặt extension:

```bash
cd ~/Documents/dynamic-island-linux

# Tạo thư mục extensions nếu chưa có
mkdir -p ~/.local/share/gnome-shell/extensions

# Copy extension vào thư mục extensions
cp -r . ~/.local/share/gnome-shell/extensions/dynamic-island@xuanhong/
```

### Bước 7: Kích hoạt Extension

Có 2 cách để kích hoạt extension:

#### Cách 1: Sử dụng GNOME Extensions App (Khuyên dùng)

1. Cài đặt GNOME Extensions app nếu chưa có:
   ```bash
   # Ubuntu/Debian
   sudo apt install gnome-shell-extension-prefs
   
   # Fedora
   sudo dnf install gnome-extensions-app
   
   # Arch Linux
   sudo pacman -S gnome-shell-extensions
   ```

2. Mở **Extensions** app từ menu ứng dụng
3. Tìm **Dynamic Island** trong danh sách
4. Bật extension lên

#### Cách 2: Sử dụng Command Line

```bash
gnome-extensions enable dynamic-island@xuanhong
```

### Bước 8: Khởi động lại GNOME Shell

- **GNOME 48–49 trên X11**: Nhấn `Alt + F2`, gõ `r`, nhấn Enter
- **Wayland / GNOME 50–51**: Đăng xuất và đăng nhập lại

---

## 🎮 Sử dụng

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

### Build lại Backend sau khi sửa code

```bash
cd ~/Documents/dynamic-island-linux/server
go build -o dynamic-island-server main.go
cp dynamic-island-server ~/.local/bin/
systemctl --user restart dynamic-island-server.service
```

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
