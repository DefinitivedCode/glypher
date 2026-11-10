import { S, persist } from './settings';

type Kind = 'glyphs' | 'grid' | 'image' | 'quality' | undefined;
export interface UIHooks {
  fit(mode: 'fit' | 'fill'): void; saveGif(): void; change(kind: Kind): void; file(f: File): void; clear(): void; reset(): void; save(): void;
}
const $ = (id: string) => document.getElementById(id)!;
const el = (h: string) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild as HTMLElement; };

const SPEC: [string, any[]][] = [
  ['Glyphs', [
    { chips: true, items: [['hangul', 'Hangul'], ['hiragana', 'Hiragana'], ['katakana', 'Katakana'], ['hanzi', 'Traditional']], rebuild: 'glyphs' },
    { k: 'size', label: 'Glyph size', min: 5, max: 48, step: 0.5, fmt: v => v + ' px', rebuild: 'glyphs' },
    { k: 'spacing', label: 'Spacing', min: 0.8, max: 1.8, step: 0.05, fmt: v => v.toFixed(2) + 'x', rebuild: 'grid' },
    { k: 'weight', label: 'Weight', seg: [[300, 'Light'], [400, 'Regular'], [700, 'Bold']], rebuild: 'glyphs' },
  ]],
  ['Image', [
    { buttons: true },
    { k: 'mapping', label: 'Glyphs', seg: [['density', 'Density'], ['mixed', 'Mixed'], ['random', 'Random']], rebuild: 'image' },
    { k: 'sharpen', label: 'Sharpen', min: 0, max: 3, step: 0.1, fmt: v => v.toFixed(1), rebuild: 'image' },
    { k: 'auto', label: 'Auto levels', toggle: true, rebuild: 'image' },
    { k: 'scale', label: 'Scale', min: 0.2, max: 3, step: 0.02, fmt: v => Math.round(v * 100) + '%', rebuild: 'image' },
    { k: 'contrast', label: 'Contrast', min: 0.4, max: 2.5, step: 0.05, fmt: v => v.toFixed(2), rebuild: 'image' },
    { k: 'brightness', label: 'Brightness', min: -0.5, max: 0.5, step: 0.02, fmt: v => (v > 0 ? '+' : '') + v.toFixed(2), rebuild: 'image' },
    { k: 'invert', label: 'Invert tones', toggle: true, rebuild: 'image' },
    { k: 'bgDim', label: 'Surroundings', min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%', rebuild: 'image' },
  ]],
  ['Color', [
    { k: 'color', label: 'Mode', seg: [['mono', 'Mono'], ['accent', 'Accent'], ['duo', 'Duo'], ['image', 'Image']], rebuild: 'image' },
    { k: 'accent', label: 'Color 1', color: true, rebuild: 'image' },
    { k: 'accent2', label: 'Color 2 (Duo)', color: true, rebuild: 'image' },
    { k: 'vibrance', label: 'Image vibrance', min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%', rebuild: 'image' },
    { k: 'ambient', label: 'Base opacity', min: 0.04, max: 0.5, step: 0.01, fmt: v => Math.round(v * 100) + '%', rebuild: 'image' },
  ]],
  ['Performance', [
    { k: 'quality', label: 'Quality', min: 0, max: 5, step: 1, fmt: v => ['Auto', 'Lowest', 'Low', 'Medium', 'High', 'Ultra'][v], rebuild: 'quality' },
    { k: 'smooth', label: 'Smooth transitions', toggle: true },
  ]],
  ['Motion', [
    { k: 'hover', label: 'Cursor glow', toggle: true },
    { k: 'push', label: 'Push away', toggle: true },
    { k: 'radius', label: 'Reach', min: 60, max: 400, step: 5, fmt: v => v + ' px' },
    { k: 'ripple', label: 'Click ripples', toggle: true },
    { k: 'drift', label: 'Ambient drift', toggle: true },
    { k: 'sweep', label: 'Light sweep', toggle: true },
    { k: 'sweepSpeed', label: 'Sweep speed', min: 0.1, max: 2, step: 0.05, fmt: v => v.toFixed(2) + 'x' },
  ]],
];

const bind: Record<string, () => void> = {};
export const sync = (k?: string) => { for (const key in bind) if (!k || key === k) bind[key](); };
export function toast(m: string) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout((toast as any).h); (toast as any).h = setTimeout(() => t.classList.remove('show'), 2200); }

const panel = $('panel'), hint = $('hint');
export function openPanel(force?: boolean) {
  const open = force === undefined ? !panel.classList.contains('open') : force;
  panel.classList.toggle('open', open); panel.setAttribute('aria-hidden', String(!open)); hint.classList.toggle('hide', open);
}
let recentUrls: string[] = [];
/** Render the Recent thumbnails; hidden when there are none. */
export function showRecent(items: { id: number; name: string; blob: Blob }[], pick: (id: number) => void, clear: () => void) {
  recentUrls.forEach(URL.revokeObjectURL); recentUrls = [];
  const grid = $('recentGrid'); grid.replaceChildren();
  $('recent').hidden = !items.length;
  for (const it of items) {
    const b = el('<button type="button"><img alt=""></button>') as HTMLButtonElement, url = URL.createObjectURL(it.blob);
    recentUrls.push(url); (b.firstElementChild as HTMLImageElement).src = url; b.title = it.name; b.setAttribute('aria-label', `Use ${it.name}`);
    b.onclick = () => pick(it.id); grid.append(b);
  }
  ($('clearRecent') as HTMLButtonElement).onclick = clear;
}
export const setAnimated = (on: boolean) => { ($('saveGif') as HTMLButtonElement).hidden = !on; };
export const imageShown = (name: string | null, url?: string) => {
  $('thumb').classList.toggle('show', !!name); $('drop').style.display = name ? 'none' : '';
  if (name) { ($('thumbImg') as HTMLImageElement).src = url!; $('thumbName').textContent = name; }
};

export function initUI(h: UIHooks) {
  let raf = 0;
  const apply = (kind: Kind) => { persist(); cancelAnimationFrame(raf); raf = requestAnimationFrame(() => h.change(kind)); };

  for (const [title, rows] of SPEC) {
    const g = el(`<section class="group"><h2>${title}</h2><div class="card"></div></section>`), card = g.lastElementChild!;
    for (const c of rows) {
      if (c.chips) {
        const box = el('<div class="chips"></div>');
        for (const [key, name] of c.items) {
          const b = el(`<button class="chip" type="button">${name}</button>`);
          b.onclick = () => {
            if (S.sets[key] && Object.values(S.sets).filter(Boolean).length === 1) return;
            S.sets[key] = !S.sets[key]; sync(); apply(c.rebuild);
          };
          box.append(b); (bind['set_' + key] = () => b.classList.toggle('on', S.sets[key]))();
        }
        card.append(box); continue;
      }
      if (c.buttons) {
        const row = el('<div class="row"><label>Fit image</label><div class="ctl"></div></div>');
        for (const [m, name] of [['fit', 'Fit canvas'], ['fill', 'Fill canvas']]) { const b = el(`<button class="btn" type="button">${name}</button>`); b.onclick = () => h.fit(m as any); row.lastElementChild!.append(b); }
        card.append(row); continue;
      }
      const row = el(`<div class="row"><label>${c.label}</label><div class="ctl"></div></div>`), ctl = row.lastElementChild!;
      if (c.toggle) {
        const w = el('<span class="sw"><input type="checkbox"><i></i></span>'), inp = w.firstElementChild as HTMLInputElement;
        inp.setAttribute('aria-label', c.label); inp.onchange = () => { S[c.k] = inp.checked; apply(c.rebuild); };
        ctl.append(w); bind[c.k] = () => { inp.checked = S[c.k]; };
      } else if (c.seg) {
        const s = el('<div class="seg"></div>');
        for (const [v, name] of c.seg) { const b = el(`<button type="button">${name}</button>`); b.dataset.v = String(v); b.onclick = () => { S[c.k] = v; sync(); apply(c.rebuild); }; s.append(b); }
        ctl.append(s); bind[c.k] = () => [...s.children].forEach((b: any) => b.classList.toggle('on', b.dataset.v == S[c.k]));
      } else if (c.color) {
        const inp = el('<input type="color">') as HTMLInputElement; inp.setAttribute('aria-label', c.label);
        inp.oninput = () => { S[c.k] = inp.value; apply(c.rebuild); }; ctl.append(inp); bind[c.k] = () => { inp.value = S[c.k]; };
      } else {
        const o = el('<output></output>'), inp = el(`<input type="range" min="${c.min}" max="${c.max}" step="${c.step}">`) as HTMLInputElement;
        inp.setAttribute('aria-label', c.label);
        inp.oninput = () => { S[c.k] = +inp.value; o.textContent = c.fmt(S[c.k]); apply(c.rebuild); };
        ctl.append(o, inp); bind[c.k] = () => { inp.value = S[c.k]; o.textContent = c.fmt(S[c.k]); };
      }
      card.append(row);
    }
    $('groups').append(g);
  }
  sync();

  // image input: picker, drag and drop, paste
  const file = $('file') as HTMLInputElement;
  $('drop').onclick = () => file.click();
  $('drop').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
  file.onchange = () => { if (file.files![0]) h.file(file.files![0]); file.value = ''; };
  $('clearImg').onclick = h.clear; $('reset').onclick = h.reset; $('save').onclick = h.save; $('saveGif').onclick = h.saveGif; $('close').onclick = () => openPanel(false);
  hint.onclick = () => openPanel(true); hint.onkeydown = e => { if (e.key === 'Enter') openPanel(true); };
  let depth = 0;
  addEventListener('dragenter', e => { e.preventDefault(); depth++; document.body.classList.add('dragging'); openPanel(true); });
  addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; document.body.classList.remove('dragging'); } });
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => { e.preventDefault(); depth = 0; document.body.classList.remove('dragging'); if (e.dataTransfer?.files[0]) h.file(e.dataTransfer.files[0]); });
  addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/')); if (f) { openPanel(true); h.file(f); } });
  addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPanel(); }
    else if (e.key === 'Escape') openPanel(false);
  });
}
