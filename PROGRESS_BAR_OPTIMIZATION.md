# Tối ưu hóa Progress Bar - Giảm lag khi expand

## Vấn đề:
Progress bar gây lag khi hover expand vì:
1. Build tất cả widgets ngay từ đầu (4 widgets + 2 labels)
2. Update liên tục mỗi giây ngay cả khi không visible
3. Update width/text ngay cả khi không thay đổi

## Giải pháp đã áp dụng:

### 1. **Hide by default** ✅
```javascript
const progressSection = new St.BoxLayout({
    visible: false, // Ẩn mặc định
});
```
- Progress bar được build nhưng ẩn đi
- Chỉ show khi có data hợp lệ (length > 0)
- Giảm render overhead khi expand lần đầu

### 2. **Conditional visibility** ✅
```javascript
updateProgress(position, length) {
    if (length > 0 && position >= 0) {
        if (!this._progressSection.visible) {
            this._progressSection.show(); // Chỉ show khi cần
        }
        // ... update logic
    } else {
        if (this._progressSection.visible) {
            this._progressSection.hide(); // Hide khi không có data
        }
    }
}
```

### 3. **Skip update when not visible** ✅
```javascript
_startProgressUpdate() {
    setInterval(() => {
        // Chỉ update nếu expanded view đang hiển thị
        if (!this.expandedContainer || !this.expandedContainer.visible) {
            return; // Skip update
        }
        // ... update logic
    }, 1000);
}
```
- Không update khi notch đang compact
- Tiết kiệm CPU khi không cần thiết

### 4. **Validate data before update** ✅
```javascript
updateMedia(mediaInfo) {
    // Chỉ update khi có data hợp lệ
    if (position !== undefined && length !== undefined && length > 0) {
        this.updateProgress(position, length);
    }
}
```

### 5. **Cache text to avoid unnecessary updates** ✅
```javascript
const currentTimeText = this._formatTime(position);
if (this._currentTimeLabel.text !== currentTimeText) {
    this._currentTimeLabel.text = currentTimeText; // Chỉ update khi khác
}
```

### 6. **Skip micro width updates** ✅
```javascript
const newWidth = Math.floor(bgWidth * percentage / 100);
if (Math.abs(this._progressBarFill.width - newWidth) > 1) {
    this._progressBarFill.set_width(newWidth); // Chỉ update nếu thay đổi > 1px
}
```

## Kết quả mong đợi:

| Metric | Trước | Sau | Cải thiện |
|--------|-------|-----|-----------|
| Expand lag | ~200ms | ~50ms | 75% |
| CPU khi compact | 2-3% | <1% | 66% |
| DOM updates/s | 3-4 | 1-2 | 50% |
| Render time | ~100ms | ~30ms | 70% |

## Cách test:

### 1. Test expand performance
```bash
# Hover vào notch nhiều lần liên tục
# Kiểm tra có lag không
```

### 2. Monitor CPU
```bash
# Mở System Monitor
# Xem CPU usage của gnome-shell
# Trước: 2-3% khi compact
# Sau: <1% khi compact
```

### 3. Test progress bar
```bash
# Phát nhạc
# Expand notch
# Kiểm tra progress bar có update mượt không
# Compact lại
# Kiểm tra CPU có giảm không
```

## Các tối ưu hóa khác có thể thực hiện:

### 1. Debounce width updates
```javascript
let updatePending = false;
if (!updatePending) {
    updatePending = true;
    imports.mainloop.idle_add(() => {
        this._progressBarFill.set_width(newWidth);
        updatePending = false;
        return false;
    });
}
```

### 2. Use CSS transitions thay vì set_width
```css
.media-progress-fill {
    transition: width 0.3s ease;
}
```

### 3. Batch updates
```javascript
this._progressBarFill.freeze_notify();
this._progressBarFill.set_width(newWidth);
this._currentTimeLabel.text = currentTime;
this._progressBarFill.thaw_notify();
```

## Rebuild và test:

```bash
# Reload extension
Alt+F2 -> r -> Enter

# Hoặc
gnome-extensions disable dynamic-island@xuanhong
gnome-extensions enable dynamic-island@xuanhong
```
