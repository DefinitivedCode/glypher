import { S } from './settings';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCharCode(a + i));
const hangul = () => {
  const o: string[] = [];
  for (let l = 0; l < 19; l++) for (let v = 0; v < 21; v++) for (const t of [0, 1, 4, 8, 16, 21]) o.push(String.fromCharCode(0xAC00 + (l * 21 + v) * 28 + t));
  return o;
};
export const SETS: Record<string, string[]> = {
  hangul: hangul(),
  hiragana: range(0x3041, 0x3093),
  katakana: range(0x30A1, 0x30F6),
  hanzi: [...'的一是不了人我在有他這中大來上國個到說們為子和你地出道也時年得就那要下以生會自著去之過家學對可她裡後小麼心多天而能好都然沒日於起還發成事只作當想看文無開手十用主行方又如前所本見經頭面公同三已老從動兩長知民樣現分將外但身些與高意進把法此實回二理美點月明其種聲全工己話內項定相問新體象機關書愛電車東風雲雨山水火木金土花鳥魚龍虎馬夢光影夜星海空間門藝術語言讀寫聽歌舞畫琴詩酒茶飯麵歲華燈鏡紙筆墨硯龜鶴蓮櫻楓竹松梅蘭菊'],
};
export const FONT = '"Noto Sans TC","Noto Sans JP","Noto Sans KR","Microsoft JhengHei","Yu Gothic","Malgun Gothic","PingFang TC","Hiragino Sans","Apple SD Gothic Neo",sans-serif';

export interface Atlas {
  canvas: HTMLCanvasElement;
  glyphs: string[];
  order: number[];      // glyph indices sorted by ink coverage (light -> dense)
  cols: number;         // tiles per atlas row
  tilePx: number;       // raster tile size in atlas pixels
  tileCss: number;      // on-screen quad size in CSS px
}

export const activeGlyphs = () => {
  let g = Object.keys(SETS).filter(k => S.sets[k]).flatMap(k => SETS[k]);
  if (!g.length) { S.sets.hanzi = true; g = SETS.hanzi.slice(); }
  return g;
};

const orderCache = new Map<string, number[]>();

/**
 * Rasterise every glyph once into a texture atlas. `rs` rasterises at a higher resolution (used when zoomed in)
 * without changing the on-screen quad size. The ink-density order is measured once per glyph set and cached,
 * so re-rasterising never reshuffles which glyph represents which tone.
 */
export function makeAtlas(glyphs: string[], fs: number, dpr: number, tileCap = 64, rs = 1): Atlas {
  const base = Math.ceil(fs * dpr * 1.25), tileDev = Math.ceil(fs * dpr * rs * 1.25);
  const fit = Math.floor(4096 / Math.ceil(Math.sqrt(glyphs.length)));
  const tilePx = Math.max(8, Math.min(tileDev, tileCap, fit)), k = tilePx / tileDev;
  const cols = Math.floor(4096 / tilePx), rows = Math.ceil(glyphs.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * tilePx; canvas.height = rows * tilePx;
  const x = canvas.getContext('2d', { willReadFrequently: true })!;
  x.font = `${S.weight} ${fs * dpr * rs * k}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
  glyphs.forEach((g, i) => x.fillText(g, (i % cols) * tilePx + tilePx / 2, Math.floor(i / cols) * tilePx + tilePx / 2));

  const key = S.weight + glyphs.join('');
  let order = orderCache.get(key);
  if (!order) {
    const d = x.getImageData(0, 0, canvas.width, canvas.height).data, ink = new Float32Array(glyphs.length);
    for (let i = 0; i < glyphs.length; i++) {
      const ox = (i % cols) * tilePx, oy = Math.floor(i / cols) * tilePx; let sum = 0;
      for (let y = 0; y < tilePx; y++) for (let xx = 0; xx < tilePx; xx++) sum += d[((oy + y) * canvas.width + ox + xx) * 4 + 3];
      ink[i] = sum;
    }
    order = Array.from({ length: glyphs.length }, (_, i) => i).sort((p, q) => ink[p] - ink[q]);
    orderCache.set(key, order);
  }
  return { canvas, glyphs, order, cols, tilePx, tileCss: base / dpr };
}
