const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

/**
 * MirroredVisualizer - A mirrored audio visualizer component
 * Creates a symmetric top-bottom visualizer with animated bars
 */
var MirroredVisualizer = class MirroredVisualizer {
    constructor(config = {}) {
        this._barCount = config.barCount || 6;
        this._pattern = config.pattern || [4, 6, 8, 6, 4, 2];
        this._barWidth = config.barWidth || 3;
        this._barSpacing = config.barSpacing || 3;
        this._rowHeight = config.rowHeight || 16;
        this._maxOffset = config.maxOffset || 2;
        this._animationSpeed = config.animationSpeed || 80;
        
        this._visualizerBars = [];
        this._visualizerAnimation = null;
        this._currentColor = this._generateRandomColor();
        
        this._buildVisualizer();
    }

    /**
     * Generate a random vibrant color for visualizer
     * @returns {string} RGB color string
     */
    _generateRandomColor() {
        const colors = [
            '255, 100, 100',   // Red
            '100, 200, 255',   // Blue
            '100, 255, 150',   // Green
            '255, 200, 100',   // Orange
            '255, 100, 200',   // Pink
            '200, 100, 255',   // Purple
            '100, 255, 255',   // Cyan
            '255, 255, 100',   // Yellow
            '255, 150, 100',   // Coral
            '150, 255, 200',   // Mint
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    /**
     * Build the visualizer UI
     */
    _buildVisualizer() {
        // Container chính - vertical để chứa 2 hàng
        this.container = new St.BoxLayout({
            style_class: 'media-visualizer-box',
            vertical: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'spacing: 0px; padding: 0px; margin: 0px;',
        });

        // Hàng trên (lộn ngược - dính trần)
        const topRow = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.END,
            style: `spacing: ${this._barSpacing}px; padding: 0px; margin: 0px;`,
        });
        topRow.set_height(this._rowHeight);

        for (let i = 0; i < this._barCount; i++) {
            const height = this._pattern[i % this._pattern.length];

            const bar = new St.Widget({
                style_class: 'media-visualizer-bar',
                style: `
                width: ${this._barWidth}px;
                background-color: rgba(255,255,255,0.5);
                border-radius: 1.5px 1.5px 0px 0px;
                margin: 0px;
                padding: 0px;
            `,
            });

            bar.set_height(height);
            bar.set_y_align(Clutter.ActorAlign.END);

            this._visualizerBars.push(bar);
            topRow.add_child(bar);
        }

        // Hàng dưới (bình thường - dính đáy)
        const bottomRow = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START,
            style: `spacing: ${this._barSpacing}px; padding: 0px; margin: 0px;`,
        });
        bottomRow.set_height(this._rowHeight);

        for (let i = 0; i < this._barCount; i++) {
            const height = this._pattern[i % this._pattern.length];

            const bar = new St.Widget({
                style_class: 'media-visualizer-bar',
                style: `
                width: ${this._barWidth}px;
                background-color: rgba(255,255,255,0.5);
                border-radius: 0px 0px 1.5px 1.5px;
                margin: 0px;
                padding: 0px;
            `,
            });

            bar.set_height(height);
            bar.set_y_align(Clutter.ActorAlign.START);

            this._visualizerBars.push(bar);
            bottomRow.add_child(bar);
        }

        this.container.add_child(topRow);
        this.container.add_child(bottomRow);
    }

    /**
     * Start visualizer animation
     */
    start() {
        if (this._visualizerAnimation) return;

        const states = this._visualizerBars.map((_, i) => ({
            base: this._pattern[i % this._barCount],
            offset: 0,
            dir: Math.random() > 0.5 ? 1 : -1
        }));

        this._visualizerAnimation = setInterval(() => {
            this._visualizerBars.forEach((bar, i) => {
                const state = states[i];

                const step = Math.random() > 0.7 ? 2 : 1;
                state.offset += step * state.dir;

                if (state.offset > this._maxOffset) {
                    state.offset = this._maxOffset;
                    state.dir = -1;
                }
                if (state.offset < -this._maxOffset) {
                    state.offset = -this._maxOffset;
                    state.dir = 1;
                }

                let height = state.base + state.offset;

                // Giữ form: chỉ check trong cùng hàng
                const indexInRow = i % this._barCount;
                if (indexInRow > 0) {
                    const prevBar = this._visualizerBars[i - 1];
                    height = Math.max(height, prevBar.height - 2);
                }

                const opacity = 0.7 + (height / 10) * 0.3;
                const borderRadius = i < this._barCount ? '1.5px 1.5px 0px 0px' : '0px 0px 1.5px 1.5px';

                bar.set_height(height);
                bar.set_style(`
                width: ${this._barWidth}px;
                background-color: rgba(${this._currentColor},${opacity});
                border-radius: ${borderRadius};
                margin: 0px;
                padding: 0px;
            `);
            });
        }, this._animationSpeed);
    }

    /**
     * Stop visualizer animation
     */
    stop() {
        if (this._visualizerAnimation) {
            clearInterval(this._visualizerAnimation);
            this._visualizerAnimation = null;

            this._visualizerBars.forEach((bar, i) => {
                const height = this._pattern[i % this._barCount];
                const borderRadius = i < this._barCount ? '1.5px 1.5px 0px 0px' : '0px 0px 1.5px 1.5px';
                
                bar.set_height(height);
                bar.set_style(`
                width: ${this._barWidth}px;
                background-color: rgba(${this._currentColor},0.4);
                border-radius: ${borderRadius};
                margin: 0px;
                padding: 0px;
            `);
            });
        }
    }

    /**
     * Change visualizer color
     * @param {string} color - RGB color string (e.g., '255, 100, 100') or null for random
     */
    setColor(color = null) {
        this._currentColor = color || this._generateRandomColor();
        
        // Update all bars immediately
        this._visualizerBars.forEach((bar, i) => {
            const currentHeight = bar.height || this._pattern[i % this._barCount];
            const isAnimating = this._visualizerAnimation !== null;
            const opacity = isAnimating ? (0.7 + (currentHeight / 10) * 0.3) : 0.4;
            const borderRadius = i < this._barCount ? '1.5px 1.5px 0px 0px' : '0px 0px 1.5px 1.5px';
            
            bar.set_style(`
                width: ${this._barWidth}px;
                background-color: rgba(${this._currentColor},${opacity});
                border-radius: ${borderRadius};
                margin: 0px;
                padding: 0px;
            `);
        });
    }

    /**
     * Get current color
     * @returns {string} Current RGB color string
     */
    getColor() {
        return this._currentColor;
    }

    /**
     * Show visualizer
     */
    show() {
        if (this.container) {
            this.container.show();
        }
    }

    /**
     * Hide visualizer
     */
    hide() {
        if (this.container) {
            this.container.hide();
        }
    }

    /**
     * Destroy visualizer and clean up
     */
    destroy() {
        this.stop();
        
        if (this.container) {
            this.container.destroy();
            this.container = null;
        }
        
        this._visualizerBars = [];
    }
};
