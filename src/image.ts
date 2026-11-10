import { S } from './settings';

/** Draw the image into a cols x rows buffer (one pixel per grid cell), fitted and centred. */
export function sampleImage(img: CanvasImageSource & { width: number; height: number }, cols: number, rows: number, cw: number, ch: number, W: number, H: number, scale = S.scale) {
  const o = document.createElement('canvas'); o.width = cols; o.height = rows;
  const x = o.getContext('2d', { willReadFrequently: true })!;
  const s = Math.min(W / img.width, H / img.height) * scale;
  const w = img.width * s / cw, h = img.height * s / ch;
  x.drawImage(img, (cols - w) / 2, (rows - h) / 2, w, h);
  return x.getImageData(0, 0, cols, rows).data;
}

/** Per-cell luminance with auto-levels, unsharp mask, contrast/brightness/invert. -1 marks cells outside the image. */
export function prepTones(d: Uint8ClampedArray, cols: number, rows: number) {
  const N = cols * rows, L = new Float32Array(N).fill(-1), ins: number[] = [];
  for (let i = 0; i < N; i++) if (d[i * 4 + 3] > 20) { L[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255; ins.push(i); }
  if (!ins.length) return L;
  if (S.auto) {
    const hist = new Uint32Array(256); for (const i of ins) hist[Math.min(255, (L[i] * 255) | 0)]++;
    const pct = (p: number) => { let acc = 0; for (let b = 0; b < 256; b++) { acc += hist[b]; if (acc >= ins.length * p) return b / 255; } return 1; };
    const lo = pct(0.02), hi = pct(0.98), rg = Math.max(0.08, hi - lo);
    for (const i of ins) L[i] = Math.min(1, Math.max(0, (L[i] - lo) / rg));
  }
  const O = L.slice();
  if (S.sharpen > 0) for (const i of ins) {
    const cx = i % cols, cy = (i / cols) | 0; let sum = 0, c = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const xx = cx + ox, yy = cy + oy; if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
      const q = L[yy * cols + xx]; if (q >= 0) { sum += q; c++; }
    }
    O[i] = L[i] + S.sharpen * 1.5 * (L[i] - sum / c);
  }
  for (const i of ins) { const l = Math.min(1, Math.max(0, (O[i] - 0.5) * S.contrast + 0.5 + S.brightness)); O[i] = S.invert ? 1 - l : l; }
  return O;
}
