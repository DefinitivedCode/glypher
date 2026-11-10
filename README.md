# Glypher

An interactive full-screen canvas of Korean, Japanese and Traditional Chinese glyphs. Drop in an image or an animated GIF and it is rebuilt out of characters.

Live at **https://glyph.masonmau.com**

## Use it

Press **Ctrl/Cmd + K** to open the panel. Then drop, paste or pick an image.

- **Glyphs:** toggle Hangul, Hiragana, Katakana and Traditional Chinese; set size, spacing and weight.
- **Image:** fit or fill the canvas, detail via glyph size, sharpen, auto-levels, contrast, brightness, invert. Glyph mapping is Density (most detail), Mixed or Random.
- **Color:** mono, accent, duotone or the image's own colors.
- **Motion:** cursor glow and push, click ripples, ambient drift, light sweep (all adjustable).
- **GIFs** play as real animations. **Export** gives a PNG at the image's native size, or an animated GIF.
- **Quality:** Auto steps down if your device struggles, or pick a fixed level.

Needs a browser with WebGL2. Animated GIF import needs a Chromium-based browser (it uses `ImageDecoder`); elsewhere you get the first frame.

## Develop

```bash
npm install
npm run dev        # local dev server
npm run build      # typecheck + production build into dist/
```

### How it stays smooth

- `src/glyphs.ts` rasterises every glyph once into a texture atlas and measures each glyph's ink density from it.
- `src/renderer.ts` draws every glyph in one instanced WebGL2 call. Hover, push, ripples, the sweep, drift and glyph swapping run in the vertex shader from a few uniforms, so the CPU does no per-glyph work per frame.
- `src/image.ts` maps image tones to glyphs (auto-levels, sharpen, contrast, brightness, invert).
- `src/main.ts` wires input, scene building, GIF playback and export; `src/ui.ts` is the settings panel.

## Deploy (Cloudflare Workers static assets)

`wrangler.json` serves `dist/` and attaches the custom domain `glyph.masonmau.com` (the zone must be in your Cloudflare account).

```bash
npx wrangler login
npm run deploy:dry   # validate
npm run deploy
```

With several Cloudflare accounts, set `CLOUDFLARE_ACCOUNT_ID`. To host it elsewhere, change or remove `routes` in `wrangler.json`. Security headers and caching live in `public/_headers`.

## Contributing

Issues and pull requests are welcome. Run `npm run build` (it typechecks) before opening a PR.

## License

[MIT](LICENSE)
