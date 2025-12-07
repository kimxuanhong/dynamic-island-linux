const Volume = imports.ui.status.volume;

var VolumeManager = class VolumeManager {
    constructor() {
        this._callbacks = [];
        this._currentVolume = 0;
        this._isMuted = false;
        this._control = null;
        this._streamChangedId = null;
        this._destroyed = false;
        this._isInitializing = true; // Flag để skip notification khi khởi tạo
        this._lastStreamId = null; // Lưu stream ID để phân biệt stream mới vs volume change

        this._initVolumeControl();
    }

    _initVolumeControl() {
        // Lấy MixerControl từ Volume indicator
        this._control = Volume.getMixerControl();

        if (!this._control) {
            return;
        }

        // Lấy giá trị ban đầu TRƯỚC khi setup listener (để không trigger notification)
        this._updateVolume();

        // Sau đó mới setup listener
        this._streamChangedId = this._control.connect('stream-changed', () => {
            this._onVolumeChanged();
        });

        // Đánh dấu đã khởi tạo xong
        this._isInitializing = false;
    }

    _onVolumeChanged() {
        if (this._destroyed) return;
        this._updateVolume();
    }

    _updateVolume() {
        if (!this._control) return;

        const stream = this._control.get_default_sink();
        if (!stream) return;

        const oldVolume = this._currentVolume;
        const oldMuted = this._isMuted;
        const newStreamId = stream.id;

        this._currentVolume = Math.round(stream.volume / this._control.get_vol_max_norm() * 100);
        // Đảm bảo isMuted là boolean
        this._isMuted = Boolean(stream.is_muted);

        const volumeChanged = (this._currentVolume !== oldVolume || this._isMuted !== oldMuted);
        const streamChanged = (newStreamId !== this._lastStreamId);

        // Cập nhật stream ID
        if (streamChanged) {
            this._lastStreamId = newStreamId;
        }

        // Chỉ notify khi:
        // 1. Không phải đang khởi tạo
        // 2. Volume thực sự thay đổi
        // 3. Stream ID không đổi (không phải stream mới được tạo)
        if (!this._isInitializing && volumeChanged && !streamChanged) {
            this._notifyCallbacks({
                volume: this._currentVolume,
                isMuted: this._isMuted
            });
        }
    }

    addCallback(callback) {
        this._callbacks.push(callback);
    }

    _notifyCallbacks(info) {
        this._callbacks.forEach(cb => cb(info));
    }

    /**
     * Kiểm tra xem audio có đang bị mute không
     * @returns {boolean}
     */
    isMuted() {
        return this._isMuted;
    }

    /**
     * Lấy default sink stream
     * @returns {object|null}
     */
    getDefaultSink() {
        if (!this._control) return null;
        return this._control.get_default_sink();
    }

    /**
     * Lấy giá trị volume max normalized
     * @returns {number}
     */
    getVolMaxNorm() {
        if (!this._control) return 0;
        return this._control.get_vol_max_norm();
    }

    /**
     * Toggle mute/unmute
     * @returns {boolean} Trạng thái mute mới
     */
    toggleMute() {
        const stream = this.getDefaultSink();
        if (!stream) return this._isMuted;

        try {
            const newMutedState = !stream.is_muted;
            if (stream.change_is_muted) {
                stream.change_is_muted(newMutedState);
            }
            return newMutedState;
        } catch (e) {
            log(`[DynamicIsland] VolumeManager: Error toggling mute: ${e.message || e}`);
            return this._isMuted;
        }
    }

    /**
     * Set volume theo percentage (0-100)
     * @param {number} percentage - Volume percentage (0-100)
     * @returns {boolean} True nếu thành công
     */
    setVolume(percentage) {
        const stream = this.getDefaultSink();
        if (!stream) return false;

        try {
            const volMax = this.getVolMaxNorm();
            const targetVolume = Math.round((percentage / 100) * volMax);

            stream.volume = targetVolume;
            if (stream.push_volume) {
                stream.push_volume(); // QUAN TRỌNG: Phải push để apply thay đổi
            }

            // Unmute nếu đang mute và volume > 0
            if (this._isMuted && percentage > 0) {
                if (stream.change_is_muted) {
                    stream.change_is_muted(false);
                }
            }

            return true;
        } catch (e) {
            log(`[DynamicIsland] VolumeManager: Error setting volume: ${e.message || e}`);
            return false;
        }
    }

    destroy() {
        this._destroyed = true;

        if (this._streamChangedId && this._control) {
            this._control.disconnect(this._streamChangedId);
            this._streamChangedId = null;
        }

        this._control = null;
        this._callbacks = [];
    }
}