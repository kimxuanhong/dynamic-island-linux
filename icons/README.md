# Island icon set

Original 24×24 SVG artwork for Dynamic Island, drawn on a shared grid with
1.8-unit rounded strokes. Media transport uses solid shapes for clarity at
small sizes. The extension colors these symbolic icons using its own styles.

These assets ship inside the extension. `utils/islandIcon.js` resolves built-in
icon names to `Gio.FileIcon` assets here, including runtime state changes.
Unknown names use the bundled application glyph.
Album art and application-provided GIcons are preserved. No system icon theme
is installed or modified.

Preview: [icon sheet](../docs/previews/island-icons.svg).
