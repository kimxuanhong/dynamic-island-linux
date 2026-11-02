import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {EventView} from './eventView.js';
import {formatRate} from '../utils/networkRate.js';

export class NetworkSpeedView extends EventView {
    constructor() {
        super('Network speed');
        this.compactContainer = new St.BoxLayout({x_expand: true, y_expand: true,
            style: 'padding: 0 10px; spacing: 10px; font-size: 11px;'});
        this._download = new St.Label({y_align: Clutter.ActorAlign.CENTER, x_expand: true});
        this._upload = new St.Label({y_align: Clutter.ActorAlign.CENTER});
        this.compactContainer.add_child(this._download);
        this.compactContainer.add_child(this._upload);
        this.updateSpeed({rx: 0, tx: 0, available: true});
    }
    updateSpeed({rx, tx, available}) {
        this._download.text = `↓ ${available ? formatRate(rx) : '—'}`;
        this._upload.text = `↑ ${available ? formatRate(tx) : '—'}`;
        this.update({title: 'Network speed',
            detail: `${this._download.text}    ${this._upload.text}`, icon: 'network-transmit-receive-symbolic'});
    }
    show() { this.compactContainer.show(); super.show(); }
    hide() { this.compactContainer.hide(); super.hide(); }
    destroy() { this.compactContainer.destroy(); super.destroy(); }
}
