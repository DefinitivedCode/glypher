# Contributing to Glypher

Thanks for your interest. Glypher is a small project and contributions of any size are welcome: bug reports, fixes, ideas and new features.

## Reporting a bug or suggesting something

Open an [issue](https://github.com/DefinitivedCode/glypher/issues). For a bug, include:

- What you did, what you expected and what happened
- Your browser and version, and your operating system
- Whether it involves an image or GIF (and roughly its size), plus the settings you changed
- Any message in the browser console (F12, then Console)

## Setting up

You need [Node.js](https://nodejs.org) 20.19 or newer (22 recommended).

```bash
git clone https://github.com/<your-username>/glypher.git
cd glypher
npm install
npm run dev
```

The dev server prints a local URL; changes reload automatically.

## Where things live

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Input, scene building, GIF playback, export |
| `src/renderer.ts` | WebGL2 renderer and the GLSL shaders |
| `src/glyphs.ts` | Glyph sets and the texture atlas |
| `src/image.ts` | Image sampling and tone mapping |
| `src/ui.ts` | Settings panel and its controls |
| `src/settings.ts` | Defaults and persistence |

Good places to start:

- **A new setting:** add a default in `settings.ts`, a row in the `SPEC` list in `ui.ts`, then use `S.yourSetting` where it applies.
- **A new glyph set:** add it to `SETS` in `glyphs.ts`, to the default `sets` in `settings.ts`, and as a chip in `ui.ts`.
- **A new visual effect:** add the math to the vertex shader in `renderer.ts` and pass what it needs as uniforms.

## Making a change

1. Fork the repo and create a branch, such as `fix-gif-timing` or `add-hiragana-only-preset`.
2. Keep the change focused. One fix or feature per pull request makes review quicker.
3. Follow the style of the surrounding code: TypeScript, two-space indent, short comments that explain why.
4. Run the checks before you push:

   ```bash
   npm run build
   ```

   This typechecks and builds. There is no test suite yet, so also try your change in the browser: load an image, move the cursor, and check the console for errors. If you touched rendering or export, try a GIF too.
5. Update the README if you changed user-visible behavior.
6. Open a pull request describing what changed and why. A screenshot or short recording helps for visual changes.

## Guidelines

- **Performance matters.** Glypher keeps per-frame CPU work near zero. Avoid per-glyph work in the frame loop; prefer the shader or a one-time rebuild.
- **Keep dependencies minimal.** The project has one runtime dependency (`gifenc`). Explain why in your pull request if you need to add another.
- **Accessibility and UI.** Keep controls labelled and keyboard reachable. The UI is a clean charcoal theme with slightly rounded corners, minimal line icons and no emojis.
- **Privacy.** Everything runs locally. Do not add network requests or analytics.
- **No secrets.** Never commit tokens, keys or credentials.

## Code of conduct

Be kind and constructive. Harassment and personal attacks are not tolerated. Maintainers may remove comments or contributions that cross the line.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
