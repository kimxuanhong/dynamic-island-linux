import {EventView} from './eventView.js';

export class NotificationView extends EventView {
    constructor() { super('Notification'); }
    updateNotification(info) {
        this.update({title: info.title || info.appName || 'Notification',
            detail: [info.appName, info.body].filter(Boolean).join(' — '),
            icon: 'mail-unread-symbolic', gicon: info.gicon});
    }
}
