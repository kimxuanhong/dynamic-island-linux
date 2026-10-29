import {LevelView} from './levelView.js';

export class BrightnessView extends LevelView {
    constructor(brightnessManager) {
        super({
            title: 'Display', subtitle: 'Screen brightness',
            icon: 'display-brightness-symbolic', accent: 'amber',
            footer: 'Drag to adjust brightness',
        });
        this._brightnessManager = brightnessManager;
    }

    _onLevelChanged(value) {
        if (this._brightnessManager.setBrightness(value))
            this.updateBrightness({brightness: value});
    }

    updateBrightness({brightness}) { this.setLevel(brightness); }
}
