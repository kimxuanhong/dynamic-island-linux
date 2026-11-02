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
    manager._last = undefined;
    let count = 0;
    manager.addCallback(() => count++);
    const wired = {connected: true, kind: 'wired', name: 'Wired connection'};
    const wifi = {connected: true, kind: 'wifi', name: 'Home Wi-Fi'};
    manager._acceptSnapshot(wired);
    if (count) throw new Error('Startup emitted network event');
    manager._acceptSnapshot(wifi);
    manager._acceptSnapshot(wifi);
    await Scripting.sleep(500);
    if (count !== 1 || !c.notch.visible || c.networkView.statusLabel.text !== 'Wi-Fi connected')
        throw new Error('Connection change missing or duplicate');
    manager._acceptSnapshot({connected: false, kind: '', name: ''});
    if (c.networkView.detailsLabel.text !== wifi.name || c.networkView.statusLabel.text !== 'Wi-Fi disconnected')
        throw new Error('Disconnect lost previous connection identity');
    e._settings.set_boolean('show-network', false);
    await Scripting.sleep(900);
    manager._acceptSnapshot(wired);
    if (c.notch.visible || c._expansionQueue.some(event => event.presenterName === 'network'))
        throw new Error('Disabled network event still visible');
    // A VPN must not hide the underlying Wi-Fi connection.
    const actualClient = manager._client;
    const state = manager._activatedState ?? 2;
    const connection = (type, name) => ({get_connection_type: () => type,
        get_state: () => state, get_id: () => name});
    const vpn = connection('vpn', 'VPN');
    const physical = connection('802-11-wireless', 'Home Wi-Fi');
    manager._activatedState = state;
    manager._client = {get_primary_connection: () => vpn, get_active_connections: () => [vpn, physical]};
    try {
        if (manager._readSnapshot().kind !== 'wifi') throw new Error('VPN hid physical connection');
    } finally { manager._client = actualClient; }
    e.disable();
    if (manager._timer || manager._signals.length || manager._connectionSignals.length)
        throw new Error('Network cleanup failed');
    print('DYNAMIC_ISLAND_NETWORK_PASS');
}
