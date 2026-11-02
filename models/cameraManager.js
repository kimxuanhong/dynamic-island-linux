import {PrivacyManager} from './privacyManager.js';

export class CameraManager extends PrivacyManager {
    constructor(settings = null) { super('camera', settings); }
    isCameraInUse() { return this._info().active; }
    getCameraInfo() {
        const info = this._info();
        return info.active ? {...info, isCameraInUse: true,
            elapsedSeconds: Math.floor((Date.now() - info.startTime) / 1000)} : null;
    }
}
