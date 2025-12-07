const Main = imports.ui.main;
// Load modules using extension directory
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();


// Import controller (last, depends on all above)
const NotchController = Me.imports.controllers.notchController.NotchController;

// --- BIẾN TOÀN CỤC ---
let notchController;
let dateMenuActor = null;
let dateMenuOriginalParent = null;

// ============================================
// GNOME SHELL EXTENSION API
// ============================================

function init() {
    // Không làm gì nhiều ở đây theo quy ước
}

function enable() {
    notchController = new NotchController();

    // Di chuyển date panel của GNOME sang góc phải
    _moveDatePanelToRight();
}

function disable() {
    if (notchController) {
        notchController.destroy();
        notchController = null;
    }

    // Khôi phục date panel về vị trí ban đầu
    _restoreDatePanel();
}

function _moveDatePanelToRight() {
    const panel = Main.panel;
    if (!panel) {
        return;
    }

    // Tìm date menu trong statusArea
    let dateMenu = null;
    if (panel.statusArea && panel.statusArea.dateMenu) {
        dateMenu = panel.statusArea.dateMenu;
    }

    // Nếu không tìm thấy, thử tìm trong _centerBox
    if (!dateMenu) {
        if (panel._centerBox) {
            const children = panel._centerBox.get_children();
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                // Kiểm tra nếu có dateMenu trong child
                if (child._delegate && child._delegate.constructor &&
                    child._delegate.constructor.name === 'DateMenuButton') {
                    dateMenuActor = child;
                    dateMenuOriginalParent = panel._centerBox;
                    break;
                }
            }
        }
    } else {
        // Lấy actor của date menu
        dateMenuActor = dateMenu.actor || dateMenu;
        if (!dateMenuActor) {
            return;
        }
    }

    if (!dateMenuActor) {
        return;
    }

    // Lưu parent ban đầu nếu chưa có
    if (!dateMenuOriginalParent) {
        dateMenuOriginalParent = dateMenuActor.get_parent();
    }

    // Xóa khỏi vị trí hiện tại
    if (dateMenuOriginalParent && dateMenuActor.get_parent() === dateMenuOriginalParent) {
        dateMenuOriginalParent.remove_child(dateMenuActor);
    }

    // Thêm vào right box của panel
    if (panel._rightBox) {
        panel._rightBox.add_child(dateMenuActor);
    } else {
        // Khôi phục nếu không tìm thấy right box
        if (dateMenuOriginalParent) {
            dateMenuOriginalParent.add_child(dateMenuActor);
        }
    }
}

function _restoreDatePanel() {
    if (!dateMenuActor || !dateMenuOriginalParent) {
        return;
    }

    // Xóa khỏi right box
    const panel = Main.panel;
    if (panel && panel._rightBox && dateMenuActor.get_parent() === panel._rightBox) {
        panel._rightBox.remove_child(dateMenuActor);
    }

    // Khôi phục về vị trí ban đầu
    if (dateMenuOriginalParent) {
        dateMenuOriginalParent.add_child(dateMenuActor);
    }

    dateMenuActor = null;
    dateMenuOriginalParent = null;
}
