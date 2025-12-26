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
let settings = null;

// ============================================
// GNOME SHELL EXTENSION API
// ============================================

function init() {
    // Không làm gì nhiều ở đây theo quy ước
}

function enable() {
    settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.dynamic-island');
    
    notchController = new NotchController(settings);

    // Xử lý date panel dựa trên settings
    const hideDatePanel = settings.get_boolean('hide-datepanel');
    if (hideDatePanel) {
        _hideDatePanel();
    } else {
        _moveDatePanel();
    }

    // Lắng nghe thay đổi settings
    settings.connect('changed::hide-datepanel', () => {
        const hideDatePanel = settings.get_boolean('hide-datepanel');
        if (hideDatePanel) {
            _hideDatePanel();
        } else {
            _restoreDatePanel();
            _moveDatePanel();
        }
    });

    settings.connect('changed::datepanel-position', () => {
        const hideDatePanel = settings.get_boolean('hide-datepanel');
        if (!hideDatePanel) {
            _moveDatePanel();
        }
    });

    // Lắng nghe thay đổi notch settings
    settings.connect('changed::notch-margin-top', () => {
        if (notchController) {
            notchController.updatePosition();
        }
    });
}

function disable() {
    if (notchController) {
        notchController.destroy();
        notchController = null;
    }

    // Khôi phục date panel về vị trí ban đầu và reset references
    _restoreDatePanel(true);

    if (settings) {
        settings = null;
    }
}

function _moveDatePanel() {
    const panel = Main.panel;
    if (!panel || !settings) {
        return;
    }

    const position = settings.get_string('datepanel-position');
    
    // Nếu là center, khôi phục về vị trí mặc định của GNOME
    if (position === 'center') {
        _restoreDatePanel();
        return;
    }

    let targetBox = null;

    // Xác định box đích dựa trên position
    switch (position) {
        case 'left':
            targetBox = panel._leftBox;
            break;
        case 'right':
        default:
            targetBox = panel._rightBox;
            break;
    }

    if (!targetBox) {
        return;
    }

    // Nếu đã có dateMenuActor, chỉ cần di chuyển nó
    if (dateMenuActor) {
        // Hiện lại nếu đã ẩn
        dateMenuActor.show();
        
        // Xóa khỏi vị trí hiện tại
        const currentParent = dateMenuActor.get_parent();
        if (currentParent && currentParent !== targetBox) {
            currentParent.remove_child(dateMenuActor);
        }
        
        // Thêm vào box đích
        if (!dateMenuActor.get_parent()) {
            targetBox.add_child(dateMenuActor);
        }
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
    const currentParent = dateMenuActor.get_parent();
    if (currentParent && currentParent !== targetBox) {
        currentParent.remove_child(dateMenuActor);
    }

    // Thêm vào box đích
    if (!dateMenuActor.get_parent()) {
        targetBox.add_child(dateMenuActor);
    }
}

function _hideDatePanel() {
    const panel = Main.panel;
    if (!panel) {
        return;
    }

    // Nếu đã có dateMenuActor, chỉ cần ẩn nó
    if (dateMenuActor) {
        dateMenuActor.hide();
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

    // Ẩn date panel
    dateMenuActor.hide();
}

function _restoreDatePanel(resetReferences = false) {
    if (!dateMenuActor || !dateMenuOriginalParent) {
        return;
    }

    // Hiện lại date panel nếu đã ẩn
    if (dateMenuActor) {
        dateMenuActor.show();
    }

    // Xóa khỏi box hiện tại
    const panel = Main.panel;
    const currentParent = dateMenuActor.get_parent();
    if (panel && currentParent && 
        (currentParent === panel._leftBox || 
         currentParent === panel._centerBox || 
         currentParent === panel._rightBox)) {
        currentParent.remove_child(dateMenuActor);
    }

    // Khôi phục về vị trí ban đầu
    if (dateMenuOriginalParent) {
        // Chỉ thêm lại nếu chưa có parent
        if (!dateMenuActor.get_parent()) {
            dateMenuOriginalParent.add_child(dateMenuActor);
        }
    }

    // Chỉ reset references khi disable extension
    if (resetReferences) {
        dateMenuActor = null;
        dateMenuOriginalParent = null;
    }
}
