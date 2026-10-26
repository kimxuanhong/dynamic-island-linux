import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {NotchController} from './controllers/notchController.js';

export default class DynamicIslandExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._settingsSignals = [];
        this._dateMenuActor = null;
        this._dateMenuOriginalParent = null;
        this._dateMenuOriginalIndex = -1;

        this._notchController = new NotchController(this._settings);
        this._syncDatePanel();

        this._settingsSignals.push(
            this._settings.connect('changed::hide-datepanel', () =>
                this._syncDatePanel()),
            this._settings.connect('changed::datepanel-position', () =>
                this._syncDatePanel()),
            this._settings.connect('changed::notch-margin-top', () =>
                this._notchController?.updatePosition())
        );
    }

    disable() {
        this._notchController?.destroy();
        this._notchController = null;
        this._restoreDatePanel(true);

        for (const signalId of this._settingsSignals ?? [])
            this._settings?.disconnect(signalId);

        this._settingsSignals = null;
        this._settings = null;
    }

    _syncDatePanel() {
        if (!this._settings)
            return;

        if (this._settings.get_boolean('hide-datepanel')) {
            this._hideDatePanel();
            return;
        }

        this._restoreDatePanel();
        this._moveDatePanel();
    }

    _findDateMenuActor() {
        if (this._dateMenuActor)
            return this._dateMenuActor;

        const panel = Main.panel;
        const dateMenu = panel?.statusArea?.dateMenu;
        const actor = dateMenu?.actor ?? dateMenu ?? null;
        if (!actor)
            return null;

        this._dateMenuActor = actor;
        this._dateMenuOriginalParent = actor.get_parent();
        this._dateMenuOriginalIndex = this._dateMenuOriginalParent
            ?.get_children().indexOf(actor) ?? -1;
        return actor;
    }

    _moveDatePanel() {
        const panel = Main.panel;
        const actor = this._findDateMenuActor();
        if (!panel || !actor || !this._settings)
            return;

        const position = this._settings.get_string('datepanel-position');
        if (position === 'center') {
            this._restoreDatePanel();
            return;
        }

        const targetBox = position === 'left' ? panel._leftBox : panel._rightBox;
        if (!targetBox)
            return;

        actor.show();
        const currentParent = actor.get_parent();
        if (currentParent !== targetBox) {
            currentParent?.remove_child(actor);
            targetBox.add_child(actor);
        }
    }

    _hideDatePanel() {
        this._findDateMenuActor()?.hide();
    }

    _restoreDatePanel(resetReferences = false) {
        const actor = this._dateMenuActor;
        const originalParent = this._dateMenuOriginalParent;
        if (actor) {
            actor.show();
            if (originalParent && actor.get_parent() !== originalParent) {
                actor.get_parent()?.remove_child(actor);
                const index = Math.min(
                    this._dateMenuOriginalIndex,
                    originalParent.get_children().length
                );
                if (index >= 0)
                    originalParent.insert_child_at_index(actor, index);
                else
                    originalParent.add_child(actor);
            }
        }

        if (resetReferences) {
            this._dateMenuActor = null;
            this._dateMenuOriginalParent = null;
            this._dateMenuOriginalIndex = -1;
        }
    }
}
