## Cài đặt tự động (khuyên dùng)

```bash
curl -fsSL https://raw.githubusercontent.com/kimxuanhong/dynamic-island-linux/main/install.sh | bash
```

Installer tự cài dependency/Go, clone source, build backend, cấu hình systemd user service, build và bật extension. Phần dưới đây dành cho cài đặt hoặc debug thủ công.

## Cài đặt thủ công

# Tạo thư mục binary cục bộ nếu chưa có
mkdir -p ~/.local/bin

# Copy binary vào thư mục user
cp dynamic-island-server ~/.local/bin/

# Cấp quyền thực thi
chmod +x ~/app/dynamic-island-server

# Tạo thư mục systemd user nếu chưa có
mkdir -p ~/.config/systemd/user

# Copy service file
cp dynamic-island-server.service ~/.config/systemd/user/

# Reload systemd user
systemctl --user daemon-reload

# Enable auto start
systemctl --user enable dynamic-island-server.service

# Start service
systemctl --user start dynamic-island-server.service

# Xem trạng thái
systemctl --user status dynamic-island-server.service

# Xem log real-time
journalctl --user -u dynamic-island-server.service -f

# Restart server
systemctl --user restart dynamic-island-server.service

# Stop server
systemctl --user stop dynamic-island-server.service

###### Remove

# Stop + disable service
systemctl --user stop dynamic-island-server.service
systemctl --user disable dynamic-island-server.service

# Xóa service file
rm ~/.config/systemd/user/dynamic-island-server.service

# Xóa binary
rm ~/.local/bin/dynamic-island-server

# Reload systemd user
systemctl --user daemon-reload



####


cd ~/Documents/dynamic-island-linux/server

# Build lại
go build -o dynamic-island-server .

# Copy binary mới
cp dynamic-island-server ~/.local/bin/

# Restart service
systemctl --user restart dynamic-island-server.service

# Xem log debug
journalctl --user -u dynamic-island-server.service -f
