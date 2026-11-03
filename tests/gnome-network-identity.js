import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
export const METRICS = {};
export async function run() {
    const extension = Main.extensionManager.lookup('dynamic-island@xuanhong');
    for (let i = 0; i < 20 && !extension?.stateObj; i++) await Scripting.sleep(250);
    const e = extension?.stateObj;
    if (!e) throw new Error('Extension failed');
    Main.overview.hide();
    await Scripting.sleep(1000);
    const c = e._notchController;
    const manager = c.networkManager;
    const actualClient = manager._client;
    const actualNm = manager._nm;
    manager._nm = (await import('gi://NM')).default;
    manager._activatedState ??= 2;
    let ssid = GLib.Bytes.new(new TextEncoder().encode('Cafe Lab'));
    let type = '802-11-wireless';
    const connection = {get_connection_type: () => type, get_state: () => manager._activatedState,
        get_id: () => 'Saved profile', get_devices: () => [{get_active_access_point: () => ({get_ssid: () => ssid})}]};
    manager._client = {get_primary_connection: () => connection, get_active_connections: () => [connection]};
    let snapshot;
    try {
        snapshot = manager._readSnapshot();
        if (snapshot.name !== 'Cafe Lab') throw new Error('SSID was replaced by connection profile name');
        ssid = null;
        if (manager._readSnapshot().name !== 'Saved profile') throw new Error('Missing SSID did not fall back to profile');
        type = '802-3-ethernet';
        if (manager._readSnapshot().kind !== 'wired') throw new Error('Ethernet identity was not recognized');
    } finally { manager._client = actualClient; manager._nm = actualNm; }
    e._settings.set_boolean('show-network', false);
    e._settings.set_string('default-content', 'network-speed');
    let events = 0;
    manager.addCallback(() => events++);
    manager._last = undefined;
    manager._acceptSnapshot(snapshot);
    if (events || c.networkSpeedView.statusLabel.text !== 'Wi-Fi · Cafe Lab')
        throw new Error('Initial network identity missing or triggered connection event');
    c.networkSpeedView.updateSpeed({rx: 6700, tx: 139400, available: true});
    if (!c.networkSpeedView.detailsLabel.text.includes('6.7 KB/s') || !c.networkSpeedView.statusLabel.text.includes('Cafe Lab') ||
        !c.networkSpeedView.expandedIcon.gicon.to_string().endsWith('/icons/network-wireless-symbolic.svg'))
        throw new Error('Speed update lost Wi-Fi identity or bundled icon');
    manager._acceptSnapshot({connected: true, kind: 'wired', name: 'Ethernet profile'});
    if (!c.networkSpeedView.statusLabel.text.startsWith('Ethernet ·') ||
        !c.networkSpeedView.expandedIcon.gicon.to_string().endsWith('/icons/network-wired-symbolic.svg'))
        throw new Error('Ethernet label/icon did not update');
    manager._acceptSnapshot({connected: false, kind: '', name: ''});
    if (c.networkSpeedView.statusLabel.text !== 'Network speed' ||
        !c.networkSpeedView.expandedIcon.gicon.to_string().endsWith('/icons/network-transmit-receive-symbolic.svg'))
        throw new Error('Disconnected identity/icon remained stale');
    e.disable();
    if (manager._stateCallbacks.length) throw new Error('Network identity listener leaked');
    print('DYNAMIC_ISLAND_NETWORK_IDENTITY_PASS');
}
