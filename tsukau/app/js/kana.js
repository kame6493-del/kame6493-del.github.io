// ひらがな・カタカナの表(基本46字 + 濁音・半濁音)。書き順は data/strokes.json(KanjiVG)に基本46字ぶんある
export const ROWS = [
  ['a', 'i', 'u', 'e', 'o'],
  ['ka', 'ki', 'ku', 'ke', 'ko'],
  ['sa', 'shi', 'su', 'se', 'so'],
  ['ta', 'chi', 'tsu', 'te', 'to'],
  ['na', 'ni', 'nu', 'ne', 'no'],
  ['ha', 'hi', 'fu', 'he', 'ho'],
  ['ma', 'mi', 'mu', 'me', 'mo'],
  ['ya', null, 'yu', null, 'yo'],
  ['ra', 'ri', 'ru', 're', 'ro'],
  ['wa', null, null, null, 'wo'],
  ['n', null, null, null, null],
];
const H = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもや_ゆ_よらりるれろわ___をん____';
const K = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤ_ユ_ヨラリルレロワ___ヲン____';
export const DAKU = [
  ['ga', 'が', 'ガ'], ['gi', 'ぎ', 'ギ'], ['gu', 'ぐ', 'グ'], ['ge', 'げ', 'ゲ'], ['go', 'ご', 'ゴ'],
  ['za', 'ざ', 'ザ'], ['ji', 'じ', 'ジ'], ['zu', 'ず', 'ズ'], ['ze', 'ぜ', 'ゼ'], ['zo', 'ぞ', 'ゾ'],
  ['da', 'だ', 'ダ'], ['de', 'で', 'デ'], ['do', 'ど', 'ド'],
  ['ba', 'ば', 'バ'], ['bi', 'び', 'ビ'], ['bu', 'ぶ', 'ブ'], ['be', 'べ', 'ベ'], ['bo', 'ぼ', 'ボ'],
  ['pa', 'ぱ', 'パ'], ['pi', 'ぴ', 'ピ'], ['pu', 'ぷ', 'プ'], ['pe', 'ぺ', 'ペ'], ['po', 'ぽ', 'ポ'],
];
// 基本46字: { r: 'ka', h: 'か', k: 'カ', row, col }
export const BASIC = [];
ROWS.forEach((row, ri) => row.forEach((r, ci) => {
  if (!r) return;
  const i = ri * 5 + ci;
  BASIC.push({ r, h: H[i], k: K[i], row: ri, col: ci });
}));
export function bySet(set) { return BASIC.map(x => ({ id: (set === 'k' ? 'K' : 'H') + x.r, ch: set === 'k' ? x.k : x.h, r: x.r, row: x.row })); }
// 4択の問題を作る。似た段から3つ間違いを選ぶ(rnd は 0..1 を返す関数。試験で固定できる)
export function makeQuiz(item, pool, rnd = Math.random) {
  const others = pool.filter(p => p.r !== item.r);
  const near = others.filter(p => Math.abs(p.row - item.row) <= 1);
  const pick = [];
  const src = near.length >= 3 ? near : others;
  const bag = src.slice();
  while (pick.length < 3 && bag.length) pick.push(bag.splice(Math.floor(rnd() * bag.length), 1)[0].r);
  const choices = [item.r, ...pick];
  for (let i = choices.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [choices[i], choices[j]] = [choices[j], choices[i]]; }
  return { q: item.ch, answer: item.r, choices };
}
