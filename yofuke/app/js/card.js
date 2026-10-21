// 結果カード 1080x1350。作りは ChatGPT の案(design/chatgpt/yf_06_card.png): 夜紺の地・細い金の枠・四隅の預かり札、
// 上に作品名、中ほどに夜明けの品の絵、紙の預かり札に品の名前、一行と短い説明、ハッシュタグ、奥付。4つの軸や値段は入れない。
import { TYPES } from './types.js';
import { HASHTAG } from './share.js';

export const W = 1080, H = 1350;
const SERIF = "'YF Serif', 'Noto Serif JP', 'Yu Mincho', serif";
const SANS = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic UI', 'Meiryo', sans-serif";

function loadImg(src) {
  return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
// 一行に収まる大きさ(下限 min)
export function fitSize(ctx, text, font, max, start, min) {
  let s = start;
  for (; s > min; s -= 2) { ctx.font = font.replace('#', s); if (ctx.measureText(text).width <= max) break; }
  return s;
}
// 文を幅で折る(句読点の前では折らない)
export function wrap(ctx, text, max) {
  const lines = []; let cur = '';
  for (const ch of text) {
    const t = cur + ch;
    if (ctx.measureText(t).width > max && cur) {
      if ('、。」』)!?'.includes(ch)) { lines.push(t); cur = ''; continue; }
      lines.push(cur); cur = ch;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
function star(ctx, x, y, r, color) {
  ctx.save(); ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + r * .12, y - r * .12, x + r, y); ctx.quadraticCurveTo(x + r * .12, y + r * .12, x, y + r);
  ctx.quadraticCurveTo(x - r * .12, y + r * .12, x - r, y); ctx.quadraticCurveTo(x - r * .12, y - r * .12, x, y - r); ctx.fill(); ctx.restore();
}
function rule(ctx, y, half) {
  const g = ctx.createLinearGradient(W / 2 - half, 0, W / 2 + half, 0);
  g.addColorStop(0, 'rgba(229,183,121,0)'); g.addColorStop(.5, 'rgba(229,183,121,.75)'); g.addColorStop(1, 'rgba(229,183,121,0)');
  ctx.fillStyle = g; ctx.fillRect(W / 2 - half, y, half - 22, 1.5); ctx.fillRect(W / 2 + 22, y, half - 22, 1.5);
  star(ctx, W / 2, y, 11, '#E5B779');
}

export async function drawCard(key, { doc = (typeof document !== 'undefined' ? document : null) } = {}) {
  const T = TYPES[key];
  const c = doc.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  try { if (doc.fonts && doc.fonts.load) await Promise.all([doc.fonts.load(`500 40px 'YF Serif'`), doc.fonts.load(`700 40px 'YF Serif'`)]); } catch (e) { /* 字が無い時はほかの明朝 */ }
  const [hero, tag] = await Promise.all([loadImg(`img/hero_${key}.webp`), loadImg('img/ui_tag.png')]);

  // 地
  ctx.fillStyle = '#142235'; ctx.fillRect(0, 0, W, H);
  // 品の絵(上下を夜紺へなじませる)
  const hx = 34, hy = 222, hw = W - 68, hh = 600;
  if (hero) {
    const k = Math.max(hw / hero.width, hh / hero.height);
    const sw = hw / k, sh = hh / k, sx = (hero.width - sw) / 2, sy = (hero.height - sh) * 0.3;
    ctx.drawImage(hero, sx, sy, sw, sh, hx, hy, hw, hh);
  }
  let g = ctx.createLinearGradient(0, hy, 0, hy + 90); g.addColorStop(0, 'rgba(20,34,53,1)'); g.addColorStop(1, 'rgba(20,34,53,0)');
  ctx.fillStyle = g; ctx.fillRect(hx, hy, hw, 90);
  g = ctx.createLinearGradient(0, hy + hh - 150, 0, hy + hh); g.addColorStop(0, 'rgba(20,34,53,0)'); g.addColorStop(1, 'rgba(20,34,53,1)');
  ctx.fillStyle = g; ctx.fillRect(hx, hy + hh - 150, hw, 151);
  g = ctx.createLinearGradient(hx, 0, hx + 90, 0); g.addColorStop(0, 'rgba(20,34,53,.9)'); g.addColorStop(1, 'rgba(20,34,53,0)'); ctx.fillStyle = g; ctx.fillRect(hx, hy, 90, hh);
  g = ctx.createLinearGradient(hx + hw, 0, hx + hw - 90, 0); g.addColorStop(0, 'rgba(20,34,53,.9)'); g.addColorStop(1, 'rgba(20,34,53,0)'); ctx.fillStyle = g; ctx.fillRect(hx + hw - 90, hy, 90, hh);

  // 枠と四隅の札
  ctx.strokeStyle = 'rgba(229,183,121,.75)'; ctx.lineWidth = 2; ctx.strokeRect(22, 22, W - 44, H - 44);
  ctx.strokeStyle = 'rgba(229,183,121,.35)'; ctx.lineWidth = 1; ctx.strokeRect(32, 32, W - 64, H - 64);
  if (tag) {
    const s = 74;
    [[40, 40, -0.25], [W - 40 - s, 40, 0.25], [40, H - 40 - s * 1.3, 0.2], [W - 40 - s, H - 40 - s * 1.3, -0.2]].forEach(([x, y, r]) => {
      ctx.save(); ctx.translate(x + s / 2, y + s * .65); ctx.rotate(r); ctx.drawImage(tag, -s / 2, -s * .65, s, s * 1.3); ctx.restore();
    });
  }
  [[150, 70], [930, 74], [120, 1270], [960, 1262], [300, 300], [790, 280]].forEach(([x, y]) => star(ctx, x, y, 7, 'rgba(240,207,152,.85)'));

  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  // 作品名
  ctx.fillStyle = '#EDF1F4'; ctx.font = `500 56px ${SERIF}`; ctx.fillText('よふけの預かり所', W / 2, 112);
  ctx.strokeStyle = 'rgba(229,183,121,.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(W / 2 - 200, 138); ctx.quadraticCurveTo(W / 2, 124, W / 2 + 200, 138); ctx.stroke();
  ctx.font = `500 34px ${SERIF}`; ctx.fillStyle = '#EDF1F4'; ctx.save(); ctx.shadowColor = 'rgba(20,34,53,.9)'; ctx.shadowBlur = 12;
  ctx.fillText('夜明けに見つかった、あなたの品', W / 2, 200); ctx.restore();

  // 紙の預かり札
  const name = T.name;
  const ns = fitSize(ctx, name, `700 #px ${SERIF}`, 700, 76, 48);
  ctx.font = `700 ${ns}px ${SERIF}`;
  const tw = Math.min(900, ctx.measureText(name).width + 170), th = 128, tx = (W - tw) / 2 + 10, ty = 812;
  ctx.save(); ctx.translate(W / 2, ty + th / 2); ctx.rotate(-0.018); ctx.translate(-W / 2, -(ty + th / 2));
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8;
  const pg = ctx.createLinearGradient(0, ty, 0, ty + th); pg.addColorStop(0, '#f0e4c9'); pg.addColorStop(1, '#dcc79c');
  ctx.fillStyle = pg; ctx.beginPath(); ctx.moveTo(tx + 44, ty); ctx.lineTo(tx + tw, ty); ctx.lineTo(tx + tw, ty + th); ctx.lineTo(tx + 44, ty + th); ctx.lineTo(tx, ty + th / 2); ctx.closePath(); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#142235'; ctx.beginPath(); ctx.arc(tx + 40, ty + th / 2, 9, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#b99a68'; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = 'rgba(160,130,90,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx + 40, ty + th / 2); ctx.bezierCurveTo(tx - 10, ty + th / 2 + 6, tx - 30, ty + th - 6, tx - 46, ty + th + 18); ctx.stroke();
  ctx.fillStyle = '#2b2116'; ctx.font = `700 ${ns}px ${SERIF}`; ctx.fillText(name, tx + 44 + (tw - 44) / 2, ty + th / 2 + ns * 0.36);
  ctx.restore();

  rule(ctx, 984, 380);
  // 一行
  ctx.fillStyle = '#f0cf98';
  const cs = fitSize(ctx, T.catch, `500 #px ${SERIF}`, 960, 42, 32);
  ctx.font = `500 ${cs}px ${SERIF}`;
  const cl = ctx.measureText(T.catch).width > 960 ? wrap(ctx, T.catch, 940) : [T.catch];
  let y = 1052; cl.forEach(l => { ctx.fillText(l, W / 2, y); y += cs * 1.3; });
  // 短い説明(最初の2文から、2行まで)
  ctx.fillStyle = '#EDF1F4'; ctx.font = `400 30px ${SANS}`;
  const sents = T.short.split('。').filter(Boolean).map(s => s + '。');
  let lines = wrap(ctx, sents[0] + (sents[1] || ''), 900);
  if (lines.length > (cl.length > 1 ? 1 : 2)) lines = wrap(ctx, sents[0], 900);
  y += 18; lines.slice(0, 2).forEach(l => { ctx.fillText(l, W / 2, y); y += 46; });

  rule(ctx, 1206, 380);
  ctx.fillStyle = '#EDF1F4';
  const ht = `${HASHTAG}  #${name}`;
  const hs = fitSize(ctx, ht, `500 #px ${SANS}`, 900, 32, 24); ctx.font = `500 ${hs}px ${SANS}`; ctx.fillText(ht, W / 2, 1260);
  ctx.fillStyle = 'rgba(229,183,121,.9)'; ctx.font = `500 22px ${SERIF}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
  ctx.fillText('よふけの預かり所', W / 2, 1306);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.fillStyle = 'rgba(229,183,121,.6)'; ctx.fillRect(W / 2 - 230, 1298, 90, 1); ctx.fillRect(W / 2 + 140, 1298, 90, 1);
  return c;
}
