// Counters are keyed by interface to avoid spikes when interfaces appear/reset.
export function parseNetworkCounters(text, include = () => true) {
    const counters = new Map();
    for (const line of text.split('\n')) {
        const colon = line.indexOf(':');
        if (colon < 0) continue;
        const name = line.slice(0, colon).trim();
        const fields = line.slice(colon + 1).trim().split(/\s+/);
        const rx = Number(fields[0]);
        const tx = Number(fields[8]);
        if (name === 'lo' || fields.length < 16 || !include(name) ||
            !Number.isFinite(rx) || !Number.isFinite(tx)) continue;
        counters.set(name, {rx, tx});
    }
    return counters;
}

export function networkRate(previous, current, seconds) {
    let rx = 0;
    let tx = 0;
    if (!previous || seconds <= 0) return {rx, tx};
    for (const [name, count] of current) {
        const before = previous.get(name);
        if (!before) continue;
        rx += Math.max(0, count.rx - before.rx) / seconds;
        tx += Math.max(0, count.tx - before.tx) / seconds;
    }
    return {rx, tx};
}

export function formatRate(bytes) {
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
    let unit = 0;
    while (bytes >= 1000 && unit < units.length - 1) { bytes /= 1000; unit++; }
    return `${bytes.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}
