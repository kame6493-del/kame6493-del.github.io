// 友だちの色。端末の外に送るのは本人が共有した文の中の「季節の短い記号」だけ(例 ?f=sp.au)。写真・名前・割合は入らない。
// 比べる中身(二人とも似合う色・おそろいの色・贈るなら)はこの端末の中で、色見本の数字から出す。
import { SEASONS, ORDER, WARM } from './seasons.js';
import { hexToRgb, rgbToLab } from './color.js';

export const SITE_URL = 'https://yurustudio.github.io/ironuno/';
export const SITE_SHORT = 'yurustudio.github.io/ironuno';
export const APP_URL = SITE_URL + 'app/';
// 買う前に見られる友だちの数(1人目は全部見られる。2人目からは全部ひらくで)
export const FREE_FRIENDS = 1;
const CODE = { spring: 'sp', summer: 'su', autumn: 'au', winter: 'wi' };
const BACK = Object.fromEntries(Object.entries(CODE).map(([k, v]) => [v, k]));

export function friendCode(top, second) { return CODE[top] ? CODE[top] + (CODE[second] && second !== top ? '.' + CODE[second] : '') : ''; }
export function friendLink(result) { return APP_URL + '?f=' + friendCode(result.top, result.second); }

// 「?f=sp.au」・リンク全体・「sp.au」のどれからでも読む。読めなければ null
export function parseFriend(text) {
  if (typeof text !== 'string') return null;
  let s = text.trim(); const m = s.match(/[?&]f=([a-z.]+)/i); if (m) s = m[1];
  const p = s.toLowerCase().split('.');
  const top = BACK[p[0]]; if (!top) return null;
  const second = BACK[p[1]] && BACK[p[1]] !== top ? BACK[p[1]] : null;
  if (p.length > 2) return null;
  return { top, second };
}

const dE = (a, b) => { const x = rgbToLab(hexToRgb(a)), y = rgbToLab(hexToRgb(b)); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };

// 二人の色の重なり。both: 二人とも似合う色(自分の見本のうち、相手の見本にも近い色がある物)、
// match: おそろいで着るなら(服の土台の色で近い物、無ければ両方の見本に近い白・紺系)、gift: 相手に贈るなら(相手の得意な色)
export function compare(meTop, friendTop) {
  const A = SEASONS[meTop], B = SEASONS[friendTop]; if (!A || !B) return null;
  const same = meTop === friendTop;
  const scored = A.best.map(c => ({ c, d: Math.min(...B.best.map(o => dE(c.hex, o.hex))) })).sort((p, q) => p.d - q.d);
  const both = (same ? A.best.slice(0, 6) : scored.filter(x => x.d < 14).slice(0, 6).map(x => x.c));
  const fill = both.length < 3 ? scored.slice(0, 3).map(x => x.c).filter(c => !both.includes(c)) : [];
  const wear = A.wear.base.map(c => ({ c, d: Math.min(...B.wear.base.map(o => dE(c.hex, o.hex))) })).sort((p, q) => p.d - q.d).slice(0, 2).map(x => x.c);
  const kind = same ? 'same' : WARM[meTop] === WARM[friendTop] ? 'near' : 'far';
  return { kind, both: both.concat(fill).slice(0, 6), wear, gift: [B.best[0], B.best[1], { hex: B.makeup.lip[0].hex, name: 'リップ ' + B.makeup.lip[0].name }] };
}
export const KIND_TEXT = {
  same: '同じ季節です。おそろいの色がそのまま二人に似合います。',
  near: '黄み・青みの向きが同じ二人。明るさや深さを少しずつ変えると、並んだ時にきれいにそろいます。',
  far: '黄みと青みで向きが反対の二人。おそろいにするなら、二人の見本に近い色を選ぶと両方に似合います。',
};

export function seasonName(s) { return SEASONS[s] ? SEASONS[s].name : ''; }
export function validSeason(s) { return ORDER.includes(s); }
