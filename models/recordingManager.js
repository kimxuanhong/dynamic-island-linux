import {PrivacyManager} from './privacyManager.js';

export class RecordingManager extends PrivacyManager {
    constructor(settings = null) { super('microphone', settings); }
    isRecording() { return this._info().active; }
    getRecordingInfo() {
        const info = this._info();
        return info.active ? {...info, isRecording: true} : null;
    }
}
