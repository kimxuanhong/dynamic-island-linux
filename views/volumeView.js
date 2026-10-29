import {LevelView} from './levelView.js';

export class VolumeView extends LevelView {
    constructor(volumeManager) {
        super({
            title: 'Sound', subtitle: 'Output volume',
            icon: 'audio-volume-high-symbolic', accent: 'blue',
            footer: 'Tap the speaker to mute', clickable: true,
        });
        this._volumeManager = volumeManager;
    }

    _onIconClick() { this._volumeManager.toggleMute(); }

    _onLevelChanged(value) {
        if (this._volumeManager.setVolume(value))
            this.updateVolume({volume: value, isMuted: this._volumeManager.isMuted()});
    }

    updateVolume({volume, isMuted}) {
        const level = isMuted ? 0 : volume;
        this.expandedIcon.icon_name = level === 0 ? 'audio-volume-muted-symbolic'
            : level < 33 ? 'audio-volume-low-symbolic'
            : level < 66 ? 'audio-volume-medium-symbolic' : 'audio-volume-high-symbolic';
        this.subtitleLabel.text = isMuted ? 'Muted' : 'Output volume';
        this.setLevel(level);
    }
}
