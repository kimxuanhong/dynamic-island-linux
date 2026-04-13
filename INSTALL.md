# Tạo thư mục app nếu chưa có
mkdir -p ~/app

# Copy binary vào thư mục user
cp dynamic-island-server ~/app/

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
rm ~/app/dynamic-island-server

# Reload systemd user
systemctl --user daemon-reload



####


cd ~/Documents/dynamic-island-linux/server

# Build lại
go build -o dynamic-island-server .

# Copy binary mới
cp dynamic-island-server ~/app/

# Restart service
systemctl --user restart dynamic-island-server.service

# Xem log debug
journalctl --user -u dynamic-island-server.service -f