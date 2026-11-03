# Development layout inspector

Copy this directory into `dev/` in any static website. No framework or package dependency is required. Run from the project root:

```sh
python3 dev/preview.py --root public --port 8000
```

Use the directory containing your built HTML in place of `public`. The local server injects the inspector into HTML responses. Source HTML stays unchanged. The server binds only to loopback. The script also refuses to run on non-loopback hosts.

The overlay starts on. Red brackets label rendered sibling gaps. Green brackets label computed padding. Blue outlines show element border boxes; inline elements use their individual fragment rectangles. Hover shows dimensions, margins, corner radii, font size, line height, and display mode. Alt+G or the button toggles the overlay. The browser stores that preference.

Fractional values are actual CSS pixels, rounded to one decimal for display. They may come from em-based margins, fractional grid tracks, percentages, line-height, font metrics, or browser layout quantization. A fractional value alone is not a defect. Gaps measure rectangle-to-rectangle whitespace, not just CSS gap. Inline font rectangles are not line boxes or glyph ink bounds. There is no claim that all measured gaps should match.

## Production boundary

Publish only `public/` or your normal build output. Keep `dev/` outside that directory. Do not add an inspector script tag to source HTML. Do not copy `/__dev__/` into a build. The development server is not a production server. Before publishing, run `python3 dev/check-production.py public` (or your output directory). It fails if inspector code or references are present.

For a framework dev server, use this server against its static export. Live framework middleware and API proxying are not included. The inspector covers the main document, not cross-origin iframes or shadow roots. Transformed/rotated elements use axis-aligned rectangles. Dense pages can have overlapping labels and many outlines; toggle off to inspect the normal design.
