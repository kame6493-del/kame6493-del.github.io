// 結果カード(1080x1350)を端末の中で描く。サーバーは使わない。値段や「無料」は入れない。
// 見た目は ChatGPT の案(design/chatgpt_v2/iro2_08_card.png)。地の絹の絵はその案から切り出した物(img/card_<季節>.jpg)。
import { SEASONS, ORDER, FREE_COUNT } from './seasons.js';
import { SITE_SHORT } from './friends.js';

export const CARD_W = 1080, CARD_H = 1350;
const SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "Noto Serif JP", "Noto Serif CJK JP", serif';
const SANS = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic UI", "Yu Gothic", "Meiryo", sans-serif';
const LATIN = '"Cormorant Garamond", "Didot", "Times New Roman", Georgia, serif';
const MONO = '"SF Mono", Menlo, Consolas, "Roboto Mono", "Noto Sans Mono", monospace';
const INK = '#1E2A3A', SUB = '#5B6472';
const DEEP = { spring: '#D9563D', summer: '#B5577C', autumn: '#8E3A24', winter: '#2747C6' };
const TINT = { spring: '#FFF4F1', summer: '#FCF3F7', autumn: '#FAF1EF', winter: '#F2F4FC' };

const IMG = {};
function load(k, src) { if (typeof Image === 'undefined') return Promise.resolve(); const im = new Image(); IMG[k] = im; return new Promise(r => { im.onload = r; im.onerror = r; im.src = src; }); }
export const cardAssets = Promise.all([...ORDER.map(s => load(s, `img/card_${s}.jpg`))]);
const ok = im => im && im.complete && im.naturalWidth > 0;

export function cardLines(result, appName) {
  const T = SEASONS[result.top], T2 = SEASONS[result.second];
  return ['IRONUNO · MY COLOR', 'わたしの似合う色', T.name, T.en.toUpperCase(), '2番目に合う季節 ' + T2.name, T.tone,
    'あなたの得意な6色', ...T.best.slice(0, FREE_COUNT).map(c => `${c.name} ${c.hex}`),
    '4つの季節の傾向', ...ORDER.map(s => `${SEASONS[s].name} ${result.shares[s]}%`), '選んだ布と回答から出した目安です。',
    `#似合う色 #${T.name}`, 'あなたの似合う色も ' + SITE_SHORT, appName];
}

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function spaced(ctx, text, x, y, gap) { let cx = x; for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + gap; } return cx - gap; }
function wrap(ctx, text, maxW) {
  const out = []; let line = '';
  for (const ch of text) { if (ctx.measureText(line + ch).width > maxW && line) { if ('、。'.includes(ch)) { line += ch; continue; } out.push(line); line = ch; } else line += ch; }
  if (line) out.push(line); return out;
}

export function drawCard(result, { appName = 'イロヌノ', face = null } = {}) {
  const cv = document.createElement('canvas'); cv.width = CARD_W; cv.height = CARD_H;
  const ctx = cv.getContext('2d'); const s = result.top; const T = SEASONS[s], T2 = SEASONS[result.second];
  // 地: 季節のごく淡い色+絹の写真
  ctx.fillStyle = TINT[s]; ctx.fillRect(0, 0, CARD_W, CARD_H);
  if (ok(IMG[s])) { const im = IMG[s]; const k = Math.max(CARD_W / im.naturalWidth, CARD_H / im.naturalHeight); ctx.drawImage(im, (CARD_W - im.naturalWidth * k) / 2, (CARD_H - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k); }
  const L = 104;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK; ctx.font = `500 26px ${LATIN}`; spaced(ctx, 'IRONUNO · MY COLOR', L, 96, 7);
  ctx.font = `500 58px ${SERIF}`; ctx.fillText('わたしの似合う色', L, 180);
  // 季節名
  if (face) {
    const r = 150, cx = CARD_W - 250, cy = 300;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.shadowColor = 'rgba(60,30,30,.25)'; ctx.shadowBlur = 30; ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r - 8, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(face, cx - r + 8, cy - r + 8, (r - 8) * 2, (r - 8) * 2); ctx.restore();
  }
  ctx.fillStyle = DEEP[s]; let size = 150; ctx.font = `500 ${size}px ${SERIF}`;
  const maxName = face ? 560 : 820; while (ctx.measureText(T.name).width > maxName && size > 90) { size -= 6; ctx.font = `500 ${size}px ${SERIF}`; }
  ctx.fillText(T.name, L - 8, 345);
  ctx.globalAlpha = 0.8; ctx.font = `500 34px ${LATIN}`; spaced(ctx, T.en.toUpperCase(), L + 170, 398, 16); ctx.globalAlpha = 1;
  // 2番目の札
  ctx.font = `500 32px ${SERIF}`; const a = '2番目に合う季節', b = T2.name; ctx.font = `500 30px ${SANS}`; const wa = ctx.measureText(a).width; ctx.font = `600 38px ${SERIF}`; const wb = ctx.measureText(b).width;
  const pw = wa + wb + 92; rr(ctx, L - 6, 428, pw, 72, 36); ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.fill(); ctx.strokeStyle = 'rgba(169,110,80,.45)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = SUB; ctx.font = `500 30px ${SANS}`; ctx.fillText(a, L + 30, 476); ctx.fillStyle = DEEP[result.second]; ctx.font = `600 38px ${SERIF}`; ctx.fillText(b, L + 30 + wa + 30, 478);
  // ひとこと
  ctx.fillStyle = INK; ctx.font = `600 46px ${SERIF}`; ctx.fillText(T.tone, L, 584);
  ctx.fillStyle = SUB; ctx.font = `400 28px ${SANS}`; const lines = wrap(ctx, T.about.split('。')[0] + '。', 640).slice(0, 2); lines.forEach((t, i) => ctx.fillText(t, L, 634 + i * 42));
  // 得意な6色
  const y0 = 700, cw = CARD_W - 2 * 66;
  rr(ctx, 66, y0, cw, 292, 26); ctx.fillStyle = 'rgba(255,255,255,.86)'; ctx.fill(); ctx.strokeStyle = 'rgba(30,42,58,.06)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = INK; ctx.font = `500 38px ${SERIF}`; ctx.fillText('あなたの得意な6色', 110, y0 + 62);
  ctx.fillStyle = SUB; ctx.font = `500 20px ${LATIN}`; ctx.textAlign = 'right'; spacedRight(ctx, 'COLOR PALETTE', CARD_W - 108, y0 + 58, 6); ctx.textAlign = 'left';
  const best = T.best.slice(0, FREE_COUNT); const step = (cw - 80) / 6;
  best.forEach((c, i) => {
    const cx = 66 + 40 + step * i + step / 2, cy = y0 + 122, r = Math.min(48, step / 2 - 10);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = c.hex; ctx.fill();
    const n = parseInt(c.hex.slice(1), 16); if (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255) > 690) { ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = INK; ctx.font = `500 24px ${SANS}`; ctx.textAlign = 'center';
    const nm = (c.name.length >= 5 ? [c.name.slice(0, Math.ceil(c.name.length / 2)), c.name.slice(Math.ceil(c.name.length / 2))] : wrap(ctx, c.name, step - 6)).slice(0, 2); nm.forEach((t, k) => ctx.fillText(t, cx, cy + r + 34 + k * 28));
    ctx.fillStyle = SUB; ctx.font = `600 23px ${MONO}`; ctx.fillText(c.hex, cx, y0 + 266); ctx.textAlign = 'left';
  });
  // 4つの季節の傾向
  const y1 = y0 + 306;
  rr(ctx, 66, y1, cw, 234, 26); ctx.fillStyle = 'rgba(255,255,255,.86)'; ctx.fill(); ctx.strokeStyle = 'rgba(30,42,58,.06)'; ctx.stroke();
  ctx.fillStyle = INK; ctx.font = `500 38px ${SERIF}`; ctx.fillText('4つの季節の傾向', 110, y1 + 54);
  ctx.fillStyle = SUB; ctx.font = `400 22px ${SANS}`; ctx.textAlign = 'right'; ctx.fillText('選んだ布と回答から出した目安です。', CARD_W - 106, y1 + 54); ctx.textAlign = 'left';
  const order = [...ORDER].sort((p, q) => result.shares[q] - result.shares[p]);
  order.forEach((k, i) => {
    const y = y1 + 96 + i * 38; ctx.fillStyle = INK; ctx.font = `500 26px ${SANS}`; ctx.fillText(SEASONS[k].name, 112, y + 9);
    const bx = 272, bw = 590; rr(ctx, bx, y - 11, bw, 22, 11); ctx.fillStyle = '#E9EBEE'; ctx.fill();
    rr(ctx, bx, y - 11, Math.max(22, bw * result.shares[k] / 100), 22, 11); ctx.fillStyle = SEASONS[k].key; ctx.fill();
    ctx.fillStyle = INK; ctx.font = `500 28px ${SANS}`; ctx.textAlign = 'right'; ctx.fillText(result.shares[k] + '%', CARD_W - 106, y + 10); ctx.textAlign = 'left';
  });
  // 下: ハッシュタグとアプリ名
  // 見た人が自分も比べられるように、ハッシュタグと診断のサイトの短い URL
  ctx.strokeStyle = 'rgba(30,42,58,.15)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(L, 1254); ctx.lineTo(720, 1254); ctx.stroke();
  ctx.fillStyle = INK; ctx.font = `600 30px ${SANS}`; ctx.fillText(`#似合う色  #${T.name}`, L, 1297);
  ctx.fillStyle = SUB; ctx.font = `500 22px ${SANS}`; ctx.fillText('あなたの似合う色も  ' + SITE_SHORT, L, 1333);
  ctx.textAlign = 'right'; ctx.font = `500 40px ${SERIF}`; spacedRight(ctx, appName, CARD_W - 60, 1312, 8);
  ctx.font = `500 15px ${LATIN}`; spacedRight(ctx, 'IRONUNO', CARD_W - 60, 1336, 8); ctx.textAlign = 'left';
  return cv;
}
function spacedRight(ctx, text, right, y, gap) {
  const al = ctx.textAlign; ctx.textAlign = 'left';
  let w = 0; for (const ch of text) w += ctx.measureText(ch).width + gap; w -= gap;
  spaced(ctx, text, right - w, y, gap); ctx.textAlign = al;
}
