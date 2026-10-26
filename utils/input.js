import Clutter from 'gi://Clutter';

// Keep legacy signals confined to the fallback for older GNOME releases.
export function connectMotion(actor, signal, callback) {
    if (Clutter.MotionController) {
        const controller = new Clutter.MotionController();
        controller.connect(signal, () => callback());
        actor.add_action(controller);
        return () => actor.remove_action(controller);
    }
    const id = actor.connect(`${signal}-event`, callback);
    return () => actor.disconnect(id);
}

export function connectClick(actor, callback) {
    if (Clutter.ClickGesture) {
        const gesture = new Clutter.ClickGesture({recognize_on_press: true});
        gesture.connect('recognize', () => callback());
        actor.add_action(gesture);
    } else {
        actor.connect('button-press-event', callback);
    }
}

export function blockScroll(actor) {
    if (Clutter.ScrollController) {
        actor.add_action(new Clutter.ScrollController({
            flags: Clutter.ScrollControllerFlags.SCROLL_HORIZONTAL |
                Clutter.ScrollControllerFlags.SCROLL_VERTICAL,
        }));
    } else {
        actor.connect('scroll-event', () => Clutter.EVENT_STOP);
    }
}

// Coordinates passed to onChange are actor-relative, including when scaled.
export function connectSlider(actor, onChange, onBegin = () => {}, onEnd = () => {}) {
    let grab = null;
    let dragging = false;
    const begin = () => {
        dragging = true;
        grab = global.stage.grab(actor);
        onBegin();
    };
    const end = () => {
        grab?.dismiss();
        grab = null;
        if (dragging) {
            dragging = false;
            onEnd();
        }
    };
    // Release the stage grab even if the view is destroyed during a drag.
    const destroyId = actor.connect('destroy', end);
    let disconnect;
    if (Clutter.PanGesture) {
        const gesture = new Clutter.PanGesture();
        gesture.set_begin_threshold(0);
        gesture.connect('recognize', () => {
            begin();
            onChange(gesture.get_centroid().x);
        });
        gesture.connect('pan-update', () => onChange(gesture.get_centroid().x));
        gesture.connect('end', end);
        gesture.connect('cancel', end);
        actor.add_action(gesture);
        disconnect = () => actor.remove_action(gesture);
    } else {
        const update = event => {
            const [stageX, stageY] = event.get_coords();
            const [ok, x] = actor.transform_stage_point(stageX, stageY);
            if (ok)
                onChange(x);
        };
        const ids = [
            actor.connect('button-press-event', (_actor, event) => {
                if (event.get_button() !== 1)
                    return Clutter.EVENT_PROPAGATE;
                begin();
                update(event);
                return Clutter.EVENT_STOP;
            }),
            actor.connect('motion-event', (_actor, event) => {
                if (!dragging)
                    return Clutter.EVENT_PROPAGATE;
                update(event);
                return Clutter.EVENT_STOP;
            }),
            actor.connect('button-release-event', (_actor, event) => {
                if (!dragging || event.get_button() !== 1)
                    return Clutter.EVENT_PROPAGATE;
                update(event);
                end();
                return Clutter.EVENT_STOP;
            }),
        ];
        disconnect = () => ids.forEach(id => actor.disconnect(id));
    }
    return () => {
        end();
        disconnect();
        actor.disconnect(destroyId);
    };
}
