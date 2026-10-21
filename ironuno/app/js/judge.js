// 見比べの順番と、結果の出し方。
// 決め手は本人が選んだ布(12回)。質問5問と頬の色は少しだけ足す。
import { ORDER, WARM, SEASONS } from './seasons.js';

export const ROUNDS = 12;

// 決まった種から同じ順番を作る(試験で再現できるように)
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// 4季節の6組 × 布の2系統 = 12回。同じ組が続かないように並べ、左右もばらす
export function makeRounds(seed = 1) {
  const rand = rng(seed);
  const pairs = [];
  for (let i = 0; i < ORDER.length; i++) for (let j = i + 1; j < ORDER.length; j++) pairs.push([ORDER[i], ORDER[j]]);
  const list = [];
  for (const family of ['rose', 'cool']) for (const p of pairs) list.push({ a: p[0], b: p[1], family });
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  // 前と同じ季節の組み合わせが続いたら、後ろと入れ替える
  for (let i = 1; i < list.length; i++) {
    const same = (x, y) => (x.a === y.a && x.b === y.b);
    if (same(list[i], list[i - 1])) { const k = list.findIndex((r, n) => n > i && !same(r, list[i - 1])); if (k > 0) [list[i], list[k]] = [list[k], list[i]]; }
  }
  return list.map(r => rand() < 0.5 ? { left: r.a, right: r.b, family: r.family } : { left: r.b, right: r.a, family: r.family });
}

export const drapeColor = (season, family) => SEASONS[season].drape[family];

// 質問。w は選んだ時に季節へ足す点
export const QUESTIONS = [
  { id: 'metal', q: '金と銀のアクセサリー、肌になじんで見えるのは?', opts: [
    { t: '金', w: { spring: 1, autumn: 1 } }, { t: '銀', w: { summer: 1, winter: 1 } }, { t: 'どちらも同じくらい', w: {} }] },
  { id: 'white', q: '白い服を顔に当てた時、きれいに見えるのは?', opts: [
    { t: '少し黄みのある、やわらかい白', w: { spring: 0.6, autumn: 1 } }, { t: '青みのある、真っ白', w: { winter: 1, summer: 0.6 } }, { t: 'よく分からない', w: {} }] },
  { id: 'sun', q: '日焼けをすると、肌はどうなりやすい?', opts: [
    { t: '赤くなって、すぐ戻る', w: { summer: 1, winter: 0.6 } }, { t: '小麦色になりやすい', w: { autumn: 1, spring: 0.6 } }, { t: '赤くなってから黒くなる', w: {} }] },
  { id: 'eyes', q: '鏡で見た時の、瞳の感じは?', opts: [
    { t: '明るい茶色で、つやがある', w: { spring: 1 } }, { t: 'やわらかい茶色・灰みのある色', w: { summer: 1 } },
    { t: '深いこげ茶で、落ち着いた感じ', w: { autumn: 1 } }, { t: '黒に近く、白目との差がはっきり', w: { winter: 1 } }] },
  { id: 'impression', q: '人によく言われる印象は?', opts: [
    { t: '明るい・かわいい', w: { spring: 1 } }, { t: 'やさしい・上品', w: { summer: 1 } },
    { t: '大人っぽい・落ち着いている', w: { autumn: 1 } }, { t: 'クール・はっきりしている', w: { winter: 1 } }] },
];

const DRAPE_WIN = 2, DRAPE_TIE = 1, QUIZ_SCALE = 1.2, SKIN_MAX = 0.6;

// picks: [{ left, right, family, pick: 'left'|'right'|'tie' }]
// answers: { id: 選んだ番号 }
// skinLab: 頬の Lab(白で合わせた時だけ使う)
// paperOk: 紙の写り方に注意が出なかったか(注意が出た時は頬の色を使わない)
// 本物の顔写真で確かめた結果(PLAN.md「本物の顔での確認」): 電球色の強い部屋や、紙でない物で合わせた時は頬の色相が大きくずれる。
// 暗い顔・逆光の顔は彩度が低く、色相が当てにならない。どちらも頬の色は使わず、布と質問だけで決める。
export function skinUsable(lab) {
  if (!Array.isArray(lab) || !lab.every(Number.isFinite)) return false;
  const chroma = Math.hypot(lab[1], lab[2]); const hue = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
  return lab[0] >= 25 && lab[0] <= 90 && chroma >= 8 && hue >= 15 && hue <= 95;
}
export function judge({ picks = [], answers = {}, skinLab = null, calibrated = false, paperOk = true } = {}) {
  const score = { spring: 0, summer: 0, autumn: 0, winter: 0 };
  const wins = { spring: 0, summer: 0, autumn: 0, winter: 0 };
  for (const p of picks) {
    if (!p) continue;
    if (p.pick === 'tie') { score[p.left] += DRAPE_TIE; score[p.right] += DRAPE_TIE; continue; }
    const w = p.pick === 'left' ? p.left : p.pick === 'right' ? p.right : null;
    if (w) { score[w] += DRAPE_WIN; wins[w]++; }
  }
  for (const Q of QUESTIONS) {
    const i = answers[Q.id]; const o = Number.isInteger(i) ? Q.opts[i] : null;
    if (o) for (const [k, v] of Object.entries(o.w)) score[k] += v * QUIZ_SCALE;
  }
  // 頬の黄み(b*)と赤み(a*)の釣り合い。白で合わせた写真だけで、ほんの少し
  let skin = null;
  if (calibrated && paperOk !== false && skinUsable(skinLab)) {
    const hue = Math.atan2(skinLab[2], skinLab[1]) * 180 / Math.PI; // 大きいほど黄み
    const t = Math.max(-1, Math.min(1, (hue - 55) / 15));
    skin = t;
    for (const s of ORDER) score[s] += (WARM[s] ? t : -t) * SKIN_MAX / 2;
  }
  const ranked = [...ORDER].sort((x, y) => (score[y] - score[x]) || (wins[y] - wins[x]) || (ORDER.indexOf(x) - ORDER.indexOf(y)));
  const shares = toShares(score);
  const gap = shares[ranked[0]] - shares[ranked[1]];
  const clarity = gap >= 15 ? 'clear' : gap >= 6 ? 'lean' : 'close';
  return { top: ranked[0], second: ranked[1], ranked, score, shares, clarity, skin, calibrated: !!calibrated };
}

// 点を割合(合計100)にする。最低の季節も0%にはしない
export function toShares(score) {
  const min = Math.min(...ORDER.map(s => score[s]));
  const raw = ORDER.map(s => Math.pow(score[s] - min + 1, 1.6));
  const sum = raw.reduce((a, b) => a + b, 0);
  const exact = raw.map(v => v / sum * 100);
  const out = exact.map(Math.floor);
  let rest = 100 - out.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0; k++, rest--) out[order[k % order.length][1]]++;
  return Object.fromEntries(ORDER.map((s, i) => [s, out[i]]));
}

export const CLARITY_TEXT = {
  clear: 'はっきり出ました',
  lean: 'やや寄っています',
  close: '2つの季節が近い結果です。光を変えてもう一度比べると、どちらに寄るかが見えてきます',
};
