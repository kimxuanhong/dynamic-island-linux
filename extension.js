const Main = imports.ui.main;

// Import modules
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Notch = Me.imports.notch.Notch;
const BatteryPresenter = Me.imports.batteryPresenter.BatteryPresenter;
const MediaPresenter = Me.imports.mediaPresenter.MediaPresenter;
const BluetoothPresenter = Me.imports.bluetoothPresenter.BluetoothPresenter;
const VolumePresenter = Me.imports.volumePresenter.VolumePresenter;

let notch;
let batteryPresenter;
let mediaPresenter;
let bluetoothPresenter;
let volumePresenter;
let monitorsChangedId;
let stageResizeId;

function _reposition() {
    if (!notch) return;

    notch.syncPosition();
}

function enable() {
    notch = new Notch();
    Main.uiGroup.add_child(notch);



    _reposition();

    // Initialize battery display
    batteryPresenter = new BatteryPresenter(notch);
    batteryPresenter.enable();

    // Initialize media display
    mediaPresenter = new MediaPresenter(notch);
    mediaPresenter.enable();

    // Initialize bluetooth display
    bluetoothPresenter = new BluetoothPresenter(notch);
    bluetoothPresenter.enable();

    // Initialize volume display
    volumePresenter = new VolumePresenter(notch);
    volumePresenter.enable();

    // Wire up presenter dependencies
    batteryPresenter.setPresenters(mediaPresenter, bluetoothPresenter, volumePresenter);
    mediaPresenter.setBatteryPresenter(batteryPresenter);
    bluetoothPresenter.setPresenters(mediaPresenter, batteryPresenter);
    volumePresenter.setPresenters(mediaPresenter, bluetoothPresenter, batteryPresenter);

    monitorsChangedId = Main.layoutManager.connect('monitors-changed', _reposition);
    stageResizeId = global.stage.connect('notify::allocation', _reposition);
}

function disable() {
    if (monitorsChangedId) {
        Main.layoutManager.disconnect(monitorsChangedId);
        monitorsChangedId = null;
    }

    if (stageResizeId) {
        global.stage.disconnect(stageResizeId);
        stageResizeId = null;
    }

    if (mediaPresenter) {
        mediaPresenter.destroy();
        mediaPresenter = null;
    }

    if (batteryPresenter) {
        batteryPresenter.destroy();
        batteryPresenter = null;
    }

    if (bluetoothPresenter) {
        bluetoothPresenter.destroy();
        bluetoothPresenter = null;
    }

    if (volumePresenter) {
        volumePresenter.destroy();
        volumePresenter = null;
    }

    if (notch) {

        notch.destroy();
        notch = null;
    }
}

function init() { }
