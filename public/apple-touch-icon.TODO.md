# TODO: apple-touch-icon.png

`index.html` references `/apple-touch-icon.png` (180x180 PNG). iOS Safari does
not reliably honour SVG touch icons, so a PNG export of `monogram.svg` rendered
on `#000000` at 180x180 is required before launch.

Until this file exists at `public/apple-touch-icon.png`, "Add to Home Screen"
on iOS will fall back to the SVG monogram (which may render incorrectly).
