# MirroredVisualizer Component

A reusable mirrored audio visualizer component for GNOME Shell extensions.

## Features

- ✨ Symmetric top-bottom mirrored design
- 🎨 Random color generation with customizable colors
- 🎵 Smooth animation with configurable speed
- 🔧 Fully customizable parameters
- 🎯 Easy to integrate into any view

## Usage

### Basic Example

```javascript
const Visualizer = Me.imports.utils.visualizer;

// Create visualizer with default settings
this._visualizer = new Visualizer.MirroredVisualizer();

// Add to your container
this.container.add_child(this._visualizer.container);

// Start animation
this._visualizer.start();

// Stop animation
this._visualizer.stop();
```

### Advanced Example with Custom Configuration

```javascript
const Visualizer = Me.imports.utils.visualizer;

// Create visualizer with custom settings
this._visualizer = new Visualizer.MirroredVisualizer({
    barCount: 8,                    // Number of bars per row
    pattern: [2, 4, 6, 8, 6, 4, 2, 2], // Height pattern for bars
    barWidth: 4,                    // Width of each bar in pixels
    barSpacing: 4,                  // Spacing between bars in pixels
    rowHeight: 20,                  // Height of each row in pixels
    maxOffset: 3,                   // Maximum animation offset
    animationSpeed: 60              // Animation interval in milliseconds
});

// Add to your container
this.container.add_child(this._visualizer.container);
```

## API Reference

### Constructor

```javascript
new MirroredVisualizer(config)
```

**Parameters:**
- `config` (Object, optional): Configuration object
  - `barCount` (Number): Number of bars per row (default: 6)
  - `pattern` (Array): Height pattern for bars (default: [4, 6, 8, 6, 4, 2])
  - `barWidth` (Number): Width of each bar in pixels (default: 3)
  - `barSpacing` (Number): Spacing between bars in pixels (default: 3)
  - `rowHeight` (Number): Height of each row in pixels (default: 16)
  - `maxOffset` (Number): Maximum animation offset (default: 2)
  - `animationSpeed` (Number): Animation interval in milliseconds (default: 80)

### Methods

#### `start()`
Start the visualizer animation.

```javascript
this._visualizer.start();
```

#### `stop()`
Stop the visualizer animation and return to idle state.

```javascript
this._visualizer.stop();
```

#### `setColor(color)`
Change the visualizer color.

**Parameters:**
- `color` (String, optional): RGB color string (e.g., '255, 100, 100'). If null or omitted, generates a random color.

```javascript
// Set specific color
this._visualizer.setColor('255, 100, 100'); // Red

// Set random color
this._visualizer.setColor(); // or this._visualizer.setColor(null);
```

#### `getColor()`
Get the current visualizer color.

**Returns:** String - Current RGB color string

```javascript
const currentColor = this._visualizer.getColor();
```

#### `show()`
Show the visualizer container.

```javascript
this._visualizer.show();
```

#### `hide()`
Hide the visualizer container.

```javascript
this._visualizer.hide();
```

#### `destroy()`
Destroy the visualizer and clean up resources.

```javascript
this._visualizer.destroy();
```

### Properties

#### `container`
The main St.BoxLayout container that holds the visualizer. Add this to your parent container.

```javascript
this.myContainer.add_child(this._visualizer.container);
```

## Complete Integration Example

```javascript
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Visualizer = Me.imports.utils.visualizer;

var MyView = class MyView {
    constructor() {
        this._buildUI();
    }

    _buildUI() {
        // Create main container
        this.container = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
        });

        // Create visualizer
        this._visualizer = new Visualizer.MirroredVisualizer({
            barCount: 6,
            pattern: [4, 6, 8, 6, 4, 2],
            barWidth: 3,
            barSpacing: 3,
            rowHeight: 16,
            maxOffset: 2,
            animationSpeed: 80
        });

        // Wrap visualizer in a container
        const visualizerWrapper = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        visualizerWrapper.set_child(this._visualizer.container);

        // Add to main container
        this.container.add_child(visualizerWrapper);
    }

    onMediaPlay() {
        // Change color when new track starts
        this._visualizer.setColor();
        // Start animation
        this._visualizer.start();
    }

    onMediaPause() {
        // Stop animation
        this._visualizer.stop();
    }

    destroy() {
        if (this._visualizer) {
            this._visualizer.destroy();
            this._visualizer = null;
        }
        if (this.container) {
            this.container.destroy();
        }
    }
};
```

## Color Palette

The default random colors include:
- Red: `255, 100, 100`
- Blue: `100, 200, 255`
- Green: `100, 255, 150`
- Orange: `255, 200, 100`
- Pink: `255, 100, 200`
- Purple: `200, 100, 255`
- Cyan: `100, 255, 255`
- Yellow: `255, 255, 100`
- Coral: `255, 150, 100`
- Mint: `150, 255, 200`

## Tips

1. **Performance**: The animation runs at the specified `animationSpeed` interval. Lower values (faster animation) may impact performance.

2. **Customization**: Adjust the `pattern` array to create different visualizer shapes. The pattern repeats for each bar.

3. **Color Changes**: Call `setColor()` without parameters to get a random color from the palette, or pass a specific RGB string for custom colors.

4. **Memory Management**: Always call `destroy()` when you're done with the visualizer to prevent memory leaks.

## License

Part of the Dynamic Island GNOME Shell Extension.
