export const DEFAULTS = {
  sets: { hangul: true, hiragana: true, katakana: true, hanzi: true },
  size: 14, spacing: 1, weight: 400,
  ambient: 0.16, color: 'mono', accent: '#0a84ff',
  hover: true, radius: 150, push: true, ripple: false, drift: false, sweep: false,
  scale: 0.9, contrast: 1.15, brightness: 0, invert: false, bgDim: 0.35,
  auto: true, sharpen: 0.8, quality: 0,
  mapping: 'mixed', accent2: '#bf5af2', vibrance: 0.8, sweepSpeed: 0.5,
};
export type Settings = typeof DEFAULTS;

export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const S: Settings = structuredClone(DEFAULTS);
if (reduced) { S.drift = false; S.sweep = false; }
try {
  const saved = JSON.parse(localStorage.getItem('glypher3') || 'null');
  if (saved) Object.assign(S, saved, { sets: { ...S.sets, ...saved.sets } });
} catch { /* storage unavailable */ }

export const persist = () => { try { localStorage.setItem('glypher3', JSON.stringify(S)); } catch { /* ignore */ } };
export const resetSettings = () => { Object.assign(S, structuredClone(DEFAULTS)); };
