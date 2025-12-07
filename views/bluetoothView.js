const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

var BluetoothView = class BluetoothView {
    constructor() {
        this._buildCompactView();
        this._buildExpandedView();
    }

    _buildCompactView() {
        this.icon = new St.Icon({
            icon_name: 'bluetooth-active-symbolic',
            icon_size: 20,
        });

        this.compactContainer = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            visible: false,
        });
        this.compactContainer.set_child(this.icon);
    }

    _buildExpandedView() {
        // Icon lớn
        this.expandedIcon = new St.Icon({
            icon_name: 'bluetooth-active-symbolic',
            icon_size: 64,
        });

        this.expandedIconWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.expandedIconWrapper.set_child(this.expandedIcon);

        // Text
        this.statusLabel = new St.Label({
            text: 'Connected',
            style: 'color: white; font-size: 18px; font-weight: bold;'
        });

        this.deviceLabel = new St.Label({
            text: '',
            style: 'color: rgba(255,255,255,0.8); font-size: 14px; margin-top: 5px;'
        });

        const textBox = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.START,
        });
        textBox.add_child(this.statusLabel);
        textBox.add_child(this.deviceLabel);

        this.textWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.textWrapper.set_child(textBox);

        // ✅ TẠO SẴN EXPANDED CONTAINER NGAY TẠY ĐÂY
        this.expandedContainer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
            style: 'spacing: 20px; padding: 20px;',
            visible: false  // Ẩn mặc định
        });
        this.expandedContainer.add_child(this.expandedIconWrapper);
        this.expandedContainer.add_child(this.textWrapper);
    }

    /**
     * Cập nhật UI với thông tin Bluetooth mới.
     * @param {{deviceName: string, isConnected: boolean, deviceType: string}} bluetoothInfo
     */
    updateBluetooth(bluetoothInfo) {
        const {deviceName, isConnected, deviceType} = bluetoothInfo;

        // Xác định icon dựa trên loại thiết bị
        let iconName = this._getDeviceIcon(deviceType, isConnected);

        // FIX: Hiển thị rõ ràng cả trạng thái connected và disconnected
        if (isConnected) {
            this.statusLabel.set_text('✓ Connected!');
            this.expandedIcon.icon_name = iconName;
            this.expandedIcon.set_style('color: #00aaff;'); // Xanh dương
            this.icon.icon_name = iconName;
            this.icon.set_style('color: #00aaff;');
        } else {
            this.statusLabel.set_text('✗ Disconnected!');
            // Khi disconnect, vẫn giữ icon phù hợp nhưng chuyển sang disabled
            if (deviceType && deviceType.includes('audio')) {
                iconName = 'audio-headphones-symbolic';
            } else if (deviceType && deviceType.includes('mouse')) {
                iconName = 'input-mouse-symbolic';
            } else {
                iconName = 'bluetooth-disabled-symbolic';
            }
            this.expandedIcon.icon_name = iconName;
            this.expandedIcon.set_style('color: #ff6666;'); // Đỏ nhạt
            this.icon.icon_name = iconName;
            this.icon.set_style('color: #ff6666;');
        }

        this.deviceLabel.set_text(deviceName);
    }

    /**
     * Lấy icon phù hợp dựa trên loại thiết bị
     * @param {string} deviceType - Loại thiết bị từ BlueZ (vd: "audio-headset", "input-mouse")
     * @param {boolean} isConnected - Trạng thái kết nối
     * @returns {string} Tên icon
     */
    _getDeviceIcon(deviceType, isConnected) {
        if (!deviceType) {
            return isConnected ? 'bluetooth-active-symbolic' : 'bluetooth-disabled-symbolic';
        }

        // Phân biệt theo loại thiết bị
        if (deviceType.includes('mouse')) {
            return 'input-mouse-symbolic'; // Icon chuột
        } else if (deviceType.includes('audio-headset') ||
            deviceType.includes('audio-headphones') ||
            deviceType.includes('audio-earbuds')) {
            return 'audio-headphones-symbolic'; // Icon tai nghe/earpod
        } else if (deviceType.includes('audio')) {
            return 'audio-speakers-symbolic'; // Icon loa cho các thiết bị audio khác
        } else {
            // Các thiết bị khác (bàn phím, điện thoại, v.v.)
            return isConnected ? 'bluetooth-active-symbolic' : 'bluetooth-disabled-symbolic';
        }
    }

    show() {
        this.compactContainer.show();
        this.expandedContainer.show();  // Show cả expanded container
    }

    hide() {
        this.compactContainer.hide();
        this.expandedContainer.hide();  // Hide cả expanded container
    }

    destroy() {
        if (this.compactContainer) {
            this.compactContainer.destroy();
        }
        if (this.expandedContainer) {  // Destroy expanded container
            this.expandedContainer.destroy();
        }
    }
}