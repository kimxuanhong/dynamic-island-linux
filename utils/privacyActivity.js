// Keep all sessions, including excluded apps, so changing exclusions is immediate.
export class PrivacyActivity {
    constructor() {
        this.sessions = new Map();
    }

    update(started, appName, pid, metadata = {}) {
        const key = `${pid}:${appName}`;
        if (started) {
            const previous = this.sessions.get(key);
            this.sessions.set(key, {appName, pid, ...metadata,
                startTime: previous?.startTime ?? Date.now()});
        } else {
            this.sessions.delete(key);
        }
    }

    visible(excluded = []) {
        const normalize = value => String(value ?? '').trim().toLowerCase().replace(/\.desktop$/, '');
        const ignored = new Set(excluded.map(normalize).filter(Boolean));
        return [...this.sessions.values()].filter(session =>
            ![session.app_id, session.process, session.appName].some(value => ignored.has(normalize(value))));
    }
}
