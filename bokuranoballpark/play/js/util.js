// 共通の小道具: 乱数(シード付き)・補間・URL 引数
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
export const Q = {
  seed: params.has('seed') ? parseInt(params.get('seed'), 10) : null,
  auto: params.get('auto'),          // hit | take | whiff | hr
  pitch: params.get('pitch'),        // 球種を固定
  slow: params.has('slow') ? parseFloat(params.get('slow')) : null,
  view: params.get('view'),          // 撮影用の視点
  debug: params.has('debug'),
  promo: params.has('promo'),
  nosave: params.has('nosave'),
  fastSeason: params.has('fast'),
  diff: params.get('diff'),
  pid: params.has('pid') ? +params.get('pid') : null,
  side: params.get('side'),
  check: params.has('check'),
};

let _rng = mulberry32(Q.seed != null ? Q.seed : (Date.now() ^ 0x5bd1e995));
export function setSeed(s) { _rng = mulberry32(s); }
export const rand = () => _rng();
export const randRange = (a, b) => a + (b - a) * _rng();
export function randn() { // 標準正規
  let u = 0, v = 0;
  while (u === 0) u = _rng();
  while (v === 0) v = _rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function pickWeighted(items, wfn) {
  let s = 0; for (const it of items) s += Math.max(0, wfn(it));
  let r = _rng() * s;
  for (const it of items) { r -= Math.max(0, wfn(it)); if (r <= 0) return it; }
  return items[items.length - 1];
}
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const deg = Math.PI / 180;

export function store(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
}
export function load(key, def) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch (e) { return def; }
}
