# Hướng dẫn cài đặt Dynamic Island Linux

## 1. Cài đặt GNOME Extension

### Cách 1: Sao chép thủ công
```bash
# Tạo thư mục extension nếu chưa có
mkdir -p ~/.local/share/gnome-shell/extensions/dynamic-island@xuanhong.dev

# Sao chép tất cả file từ thư mục hiện tại (trừ server)
rsync -av --exclude='server' --exclude='.git' --exclude='tasks' --exclude='.idea' \
  ~/Documents/dynamic-island-linux/ \
  ~/.local/share/gnome-shell/extensions/dynamic-island@xuanhong.dev/
```

### Cách 2: Sử dụng symlink (khuyến nghị cho development)
```bash
# Xóa thư mục cũ nếu có
rm -rf ~/.local/share/gnome-shell/extensions/dynamic-island@xuanhong.dev

# Tạo symlink
ln -s ~/Documents/dynamic-island-linux \
  ~/.local/share/gnome-shell/extensions/dynamic-island@xuanhong.dev
```

### Khởi động lại GNOME Shell
```bash
# Trên X11
Alt+F2, gõ 'r', Enter

# Trên Wayland (cần logout/login hoặc reboot)
# Hoặc dùng lệnh:
busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s 'Meta.restart("Restarting…")'
```

### Bật extension
```bash
gnome-extensions enable dynamic-island@xuanhong.dev
```

---

## 2. Build và cài đặt Server (Demon)

### Build server
```bash
cd ~/Documents/dynamic-island-linux/server

# Build binary
go build -o dynamic-island-server .
```

### Cài đặt server vào hệ thống
```bash
# Copy binary vào /usr/local/bin
sudo cp dynamic-island-server /usr/local/bin/

# Cấp quyền thực thi
sudo chmod +x /usr/local/bin/dynamic-island-server
```

### Cài đặt systemd service
```bash
# Copy service file
sudo cp dynamic-island-server.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Bật service tự động khởi động
sudo systemctl enable dynamic-island-server.service

# Khởi động service
sudo systemctl start dynamic-island-server.service
```

### Kiểm tra trạng thái server
```bash
# Xem trạng thái
sudo systemctl status dynamic-island-server.service

# Xem log
journalctl -u dynamic-island-server.service -f

# Khởi động lại server
sudo systemctl restart dynamic-island-server.service

# Dừng server
sudo systemctl stop dynamic-island-server.service
```

---

## 3. Gỡ cài đặt

### Gỡ extension
```bash
gnome-extensions disable dynamic-island@xuanhong.dev
rm -rf ~/.local/share/gnome-shell/extensions/dynamic-island@xuanhong.dev
```

### Gỡ server
```bash
sudo systemctl stop dynamic-island-server.service
sudo systemctl disable dynamic-island-server.service
sudo rm /etc/systemd/system/dynamic-island-server.service
sudo rm /usr/local/bin/dynamic-island-server
sudo systemctl daemon-reload
```

---

## 4. Development Workflow

### Sau khi sửa code Extension (JavaScript)
```bash
# Nếu dùng symlink, chỉ cần restart GNOME Shell
# X11:
Alt+F2, gõ 'r', Enter

# Wayland:
busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s 'Meta.restart("Restarting…")'
```

### Sau khi sửa code Server (Go)
```bash
cd ~/Documents/dynamic-island-linux/server

# Build lại
go build -o dynamic-island-server .

# Copy binary mới
sudo cp dynamic-island-server /usr/local/bin/

# Restart service
sudo systemctl restart dynamic-island-server.service

# Xem log để debug
journalctl -u dynamic-island-server.service -f
```

---

## 5. Quick Commands (Lệnh nhanh)

### Rebuild và restart toàn bộ
```bash
# Build server
cd ~/Documents/dynamic-island-linux/server && go build -o dynamic-island-server .

# Cài đặt server
sudo cp dynamic-island-server /usr/local/bin/
sudo systemctl restart dynamic-island-server.service

# Restart GNOME Shell (X11)
# Alt+F2, gõ 'r', Enter
```

### Xem log real-time
```bash
# Server log
journalctl -u dynamic-island-server.service -f

# GNOME Shell log (bao gồm extension)
journalctl -f /usr/bin/gnome-shell
```
