import './style.css';
import { S, persist, resetSettings, reduced } from './settings';
import { activeGlyphs, makeAtlas, type Atlas } from './glyphs';
import { sampleImage, prepTones } from './image';
import { Renderer, type Frame } from './renderer';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { initUI, sync, toast, imageShown, setAnimated } from './ui';

const cv = document.getElementById('bg') as HTMLCanvasElement;
let renderer: Renderer;
try { renderer = new Renderer(cv); } catch (e) { document.body.append(Object.assign(document.createElement('p'), { textContent: 'WebGL2 is required.', style: 'padding:24px' })); throw e; }

let W = 0, H = 0, dpr = 1, cols = 0, rows = 0, N = 0, cw = 0, ch = 0, offX = 0, offY = 0, fs = 22;
/** Quality levels: render-resolution cap, max glyph count, atlas raster size. Level 0 (Auto) starts at 4 and steps down if frames run slow. */
const Q = [null, { dpr: 1, cells: 8000, tile: 32 }, { dpr: 1, cells: 20000, tile: 48 }, { dpr: 1.5, cells: 40000, tile: 64 }, { dpr: 2, cells: 60000, tile: 64 }, { dpr: 3, cells: 100000, tile: 96 }];
let qEff = 4, qCeil = 5;
const lvl = () => S.quality || qEff;
let atlas: Atlas, atlasKey = '', setsKey = '';
let gif: { frames: ImageBitmap[]; delays: number[]; i: number; next: number } | null = null;
let img: ImageBitmap | null = null;
let prevHome: Float32Array = new Float32Array(0), prevTone: Float32Array = new Float32Array(0), morphStart = -1e9;

const hash = (i: number, s = 0) => { let h = (i * 374761393 + s * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const hex = (c: string): [number, number, number] => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255) as [number, number, number];

interface Scene { cols: number; rows: number; N: number; cw: number; ch: number; offX: number; offY: number; data: Float32Array; home: Float32Array; tone: Float32Array; changed: boolean }
/** Lay out a glyph grid for a W x H surface and map the image (if any) onto it. Reused for on-screen and export renders. */
function buildScene(Wv: number, Hv: number, fsv: number, at: Atlas, scale: number, prev: { home: Float32Array<ArrayBufferLike>; tone: Float32Array<ArrayBufferLike> } | null, src: ImageBitmap | null, maxCells = Q[lvl()]!.cells): Scene {
  let cw = fsv * 1.12 * S.spacing, ch = fsv * 1.22 * S.spacing;
  while (Math.ceil(Wv / cw) * Math.ceil(Hv / ch) > maxCells) { cw *= 1.1; ch *= 1.1; }
  const cols = Math.ceil(Wv / cw) + 1, rows = Math.ceil(Hv / ch) + 1, N = cols * rows;
  const offX = (Wv - (cols - 1) * cw) / 2, offY = (Hv - (rows - 1) * ch) / 2;
  const samp = src ? sampleImage(src, cols, rows, cw, ch, Wv, Hv, scale) : null, L = samp ? prepTones(samp, cols, rows) : null;
  const n = at.glyphs.length, data = new Float32Array(N * 7), canMorph = !!prev && prev.home.length === N;
  const home = new Float32Array(N), tone = new Float32Array(N), c1 = hex(S.accent), c2 = hex(S.accent2);
  let changed = false;
  for (let i = 0; i < N; i++) {
    let g: number, t: number, r = -1, gg = -1, b = -1;
    if (samp && L![i] >= 0) {
      const l = L![i], al = Math.min(1, samp[i * 4 + 3] / 255);
      const jit = S.mapping === 'mixed' ? (hash(i, 2) - 0.5) * 0.3 : 0;
      g = S.mapping === 'random' ? Math.floor(hash(i, 1) * n) : at.order[Math.min(n - 1, Math.max(0, Math.round((l + jit) * (n - 1))))];
      t = (0.08 + 0.92 * l) * al;
      if (S.color === 'image') {
        const R = samp[i * 4] / 255, G = samp[i * 4 + 1] / 255, B = samp[i * 4 + 2] / 255, m = Math.max(R, G, B, 0.001), k = S.vibrance;
        r = R + (R / m - R) * k; gg = G + (G / m - G) * k; b = B + (B / m - B) * k;
      } else if (S.color === 'duo') { r = c1[0] + (c2[0] - c1[0]) * l; gg = c1[1] + (c2[1] - c1[1]) * l; b = c1[2] + (c2[2] - c1[2]) * l; }
    } else {
      g = Math.floor(hash(i, 1) * n); t = S.ambient * (0.55 + 0.9 * hash(i, 3)); if (samp) t *= S.bgDim;
    }
    home[i] = g; tone[i] = t;
    const og = canMorph ? prev!.home[i] : g, ot = canMorph ? prev!.tone[i] : t; if (og !== g) changed = true;
    data.set([g, og, t, ot, r, gg, b], i * 7);
  }
  return { cols, rows, N, cw, ch, offX, offY, data, home, tone, changed: canMorph && changed };
}

function rebuild() {
  fs = S.size;
  const sk = JSON.stringify(S.sets) + S.weight, ak = `${sk}|${fs}|${dpr}|${Q[lvl()]!.tile}`;
  if (ak !== atlasKey) { atlas = makeAtlas(activeGlyphs(), fs, dpr, Q[lvl()]!.tile); renderer.setAtlas(atlas); atlasKey = ak; }
  const sameSets = sk === setsKey; setsKey = sk;
  const sc = buildScene(W, H, fs, atlas, S.scale, sameSets ? { home: prevHome, tone: prevTone } : null, img);
  ({ cols, rows, N, cw, ch, offX, offY } = sc); prevHome = sc.home; prevTone = sc.tone;
  morphStart = sc.changed ? performance.now() : -1e9;
  renderer.setInstances(sc.data, N);
}

function resize() {
  dpr = Math.min(devicePixelRatio || 1, Q[lvl()]!.dpr); W = innerWidth; H = innerHeight;
  renderer.resize(W, H, dpr); prevHome = new Float32Array(0); rebuild();
}

/* ---------------------------------------------------------------- input */
const ptr = { x: 0, y: 0, on: false, down: false, press: 0 };
const trail: { x: number; y: number; t: number }[] = []; let lastSample = 0;
const ripples: { x: number; y: number; t: number }[] = [];
const onPanel = (t: EventTarget | null) => t instanceof Element && !!t.closest('.panel');
addEventListener('pointermove', e => { if (onPanel(e.target)) { ptr.on = false; return; } ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true; });
addEventListener('pointerdown', e => { if (e.target !== cv) return; ptr.down = true; if (S.ripple) { ripples.push({ x: e.clientX, y: e.clientY, t: performance.now() }); if (ripples.length > 4) ripples.shift(); } });
addEventListener('pointerup', () => ptr.down = false);
document.addEventListener('pointerleave', () => ptr.on = false);

/* ---------------------------------------------------------------- frame */
const trailU = new Float32Array(36), ripU = new Float32Array(16);
let sweepAt = performance.now() + 3000, sweepStart = 0, last = performance.now();
const t0 = performance.now();
let slow = 0, frames = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  const raw = now - last, dt = Math.min(0.05, raw / 1000); last = now;
  if (!S.quality && raw < 100) {                       // Auto: step quality down when the average frame is slow
    slow += raw; frames++;
    if (frames === 90) { if (slow / 90 > 24 && qEff > 1) { qEff--; qCeil = qEff; resize(); } slow = 0; frames = 0; }
  }
  ptr.press += ((ptr.down ? 1 : 0) - ptr.press) * Math.min(1, dt * 8);

  if (ptr.on && now - lastSample > 40) { trail.unshift({ x: ptr.x, y: ptr.y, t: now }); lastSample = now; if (trail.length > 11) trail.pop(); }
  trailU.fill(0); for (let i = 0; i < 12; i++) trailU[i * 3 + 2] = -1;
  if (ptr.on) { trailU.set([ptr.x, ptr.y, 0], 0); trail.forEach((p, i) => { const age = (now - p.t) / 1000; if (age < 1.5) trailU.set([p.x, p.y, age], (i + 1) * 3); }); }

  while (ripples.length && now - ripples[0].t > 2600) ripples.shift();
  ripU.fill(0); ripples.forEach((r, i) => ripU.set([r.x, r.y, (now - r.t) / 1000, 1], i * 4));

  if (S.sweep && !sweepStart && now > sweepAt) sweepStart = now;
  let sp = 0, sweepOn = 0;
  if (sweepStart) { const k = (now - sweepStart) / (4200 / S.sweepSpeed); if (k > 1) { sweepStart = 0; sweepAt = now + 8000 + Math.random() * 7000; } else { sp = -220 + k * (W + H * 0.6 + 440); sweepOn = 1; } }

  if (gif && now >= gif.next) {
    gif.i = (gif.i + 1) % gif.frames.length; img = gif.frames[gif.i]; gif.next = now + gif.delays[gif.i]; rebuild();
  }
  renderer.draw(makeFrame((now - t0) / 1000, now, sp, sweepOn));
}
function makeFrame(time: number, now: number, sp: number, sweepOn: number): Frame {
  return {
    time, cols, rows, cw, ch, offX, offY, drift: S.drift && !img, wave: gif ? 0 : 1, morph: gif ? Math.min(3, (now - morphStart) / Math.min(gif.delays[gif.i] * 0.7, 140) * 0.8) : Math.min(3, (now - morphStart) / 1000 * 3.5),
    radius: S.radius * (1 + 0.5 * ptr.press), push: S.push, hover: S.hover, trail: trailU, rip: ripU, sweep: [sp, sweepOn],
    base: S.color === 'accent' ? hex(S.accent) : [0.839, 0.843, 0.855], hi: S.color === 'accent' ? [1, 1, 1] : [0.957, 0.957, 0.965],
  };
}

/* ---------------------------------------------------------------- image + ui hooks */
let thumbUrl = '';
const setImage = (bmp: ImageBitmap) => { if (img && !gif?.frames.includes(img)) img.close(); img = bmp; };
function stopGif() { gif?.frames.forEach(f => f.close()); gif = null; }
/** Decode every frame of an animated GIF with the browser's ImageDecoder, downscaled (the grid only needs a few hundred px). */
async function decodeGif(file: File) {
  const dec = new (window as any).ImageDecoder({ data: await file.arrayBuffer(), type: 'image/gif' });
  await dec.tracks.ready;
  const count = Math.min(dec.tracks.selectedTrack.frameCount, 150), frames: ImageBitmap[] = [], delays: number[] = [];
  for (let i = 0; i < count; i++) {
    const { image } = await dec.decode({ frameIndex: i }), k = Math.min(1, 420 / Math.max(image.displayWidth, image.displayHeight));
    frames.push(await createImageBitmap(image, { resizeWidth: Math.round(image.displayWidth * k), resizeHeight: Math.round(image.displayHeight * k), resizeQuality: 'medium' }));
    delays.push(Math.max(40, (image.duration || 100000) / 1000)); image.close();
  }
  dec.close(); return { frames, delays };
}
async function loadFile(file: File) {
  if (!file.type.startsWith('image/')) return toast('That is not an image file');
  try {
    stopGif();
    if (file.type === 'image/gif' && 'ImageDecoder' in window) {
      const g = await decodeGif(file);
      if (g.frames.length > 1) { gif = { ...g, i: 0, next: performance.now() + g.delays[0] }; img = g.frames[0]; }
      else setImage(g.frames[0]);
    } else {
      if (file.type === 'image/gif') toast('Animated GIFs need a Chromium-based browser');
      setImage(await createImageBitmap(file));
    }
    if (thumbUrl) URL.revokeObjectURL(thumbUrl); thumbUrl = URL.createObjectURL(file);
    imageShown(file.name || 'Pasted image', thumbUrl); setAnimated(!!gif); rebuild();
  } catch { toast('Could not read that image'); }
}
/* ---------------------------------------------------------------- export */
const compose = (src: HTMLCanvasElement) => {
  const o = document.createElement('canvas'); o.width = src.width; o.height = src.height; const x = o.getContext('2d', { willReadFrequently: true })!;
  x.fillStyle = getComputedStyle(document.body).backgroundColor; x.fillRect(0, 0, o.width, o.height); x.drawImage(src, 0, 0);
  return o;
};
const download = (c: HTMLCanvasElement, ext: string) => c.toBlob(b => save_blob(b!, ext));
const save_blob = (b: Blob, ext: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `glyph-canvas.${ext}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
/** Offscreen renderer at the image's own resolution, with glyph size scaled so the composition matches the screen. */
function exporter(ref: ImageBitmap, size: number, upscale: boolean) {
  const longest = Math.max(ref.width, ref.height), k = upscale ? size / longest : Math.min(1, size / longest);
  const EW = Math.round(ref.width * k), EH = Math.round(ref.height * k);
  const efs = Math.max(3, S.size / (Math.min(W / ref.width, H / ref.height) * S.scale) * k);
  const tc = document.createElement('canvas'), tr = new Renderer(tc); tr.resize(EW, EH, 1);
  const a = makeAtlas(activeGlyphs(), efs, 1, 96); tr.setAtlas(a);
  return {
    tc, EW, EH,
    render(src: ImageBitmap) {
      const sc = buildScene(EW, EH, efs, a, 1, null, src, 100000); tr.setInstances(sc.data, sc.N);
      tr.draw({ ...makeFrame(0, performance.now(), 0, 0), cols: sc.cols, rows: sc.rows, cw: sc.cw, ch: sc.ch, offX: sc.offX, offY: sc.offY, drift: false, morph: 3, wave: 1, hover: false });
    },
    dispose() { tr.gl.getExtension('WEBGL_lose_context')?.loseContext(); },
  };
}
let encoding = false;
async function exportGif() {
  if (!gif || encoding) return;
  encoding = true;
  try {
    const frames = gif.frames, delays = gif.delays, ex = exporter(frames[0], 720, true), enc = GIFEncoder();
    for (let i = 0; i < frames.length; i++) {
      toast(`Encoding GIF ${i + 1} / ${frames.length}`);
      ex.render(frames[i]);
      const { data } = compose(ex.tc).getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, ex.EW, ex.EH);
      const pal = quantize(data, 256);
      enc.writeFrame(applyPalette(data, pal), ex.EW, ex.EH, { palette: pal, delay: delays[i] });
      await new Promise(r => setTimeout(r));          // keep the page responsive
    }
    enc.finish(); ex.dispose(); save_blob(new Blob([enc.bytes()], { type: 'image/gif' }), 'gif'); toast(`Exported ${ex.EW} x ${ex.EH} GIF`);
  } catch { toast('GIF export failed'); } finally { encoding = false; }
}
initUI({
  change: kind => { if (kind === 'quality') { qEff = 4; qCeil = 5; resize(); } else rebuild(); }, file: loadFile, saveGif: exportGif,
  fit(mode) {
    if (!img) return toast('Add an image first');
    const a = W / img.width, b = H / img.height;
    S.scale = mode === 'fit' ? 1 : Math.min(3, Math.max(a, b) / Math.min(a, b)); sync('scale'); persist(); rebuild();
  },
  clear() { stopGif(); setAnimated(false); img?.close(); img = null; imageShown(null); prevHome = new Float32Array(0); rebuild(); },
  reset() { resetSettings(); if (reduced) { S.drift = false; S.sweep = false; } sync(); persist(); rebuild(); toast('Settings reset'); },
  save() {
    const now = performance.now();
    if (!img) { renderer.draw(makeFrame((now - t0) / 1000, now, 0, 0)); download(compose(cv), 'png'); toast('Exported PNG'); return; }
    const ex = exporter(img, gif ? 1080 : 8192, !!gif); ex.render(img); download(compose(ex.tc), 'png'); ex.dispose(); toast(`Exported ${ex.EW} x ${ex.EH} PNG`);
  },
});
let rz = 0; addEventListener('resize', () => { clearTimeout(rz); rz = window.setTimeout(resize, 120); });
resize(); requestAnimationFrame(frame);
