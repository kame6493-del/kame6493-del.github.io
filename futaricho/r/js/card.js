// 精算の結果と月のまとめを、端末の中で1枚の絵にする(外には送らない。送るかは本人が共有の画面で選ぶ)
import { COLORS, yen } from './calc.js';
const FONT = '"Hiragino Sans","Noto Sans JP","Yu Gothic UI","Meiryo",system-ui,sans-serif';
const NUM = '"SF Pro Rounded","Roboto","Segoe UI","Hiragino Sans","Noto Sans JP",system-ui,sans-serif';

function base(W = 1080, H = 1350) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#F3F6FB'; g.fillRect(0, 0, W, H);
  // やわらかい丸の模様(ふたりの色を薄く)
  return { c, g, W, H };
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function card(g, x, y, w, h) { g.save(); g.shadowColor = 'rgba(30,43,66,.08)'; g.shadowBlur = 40; g.shadowOffsetY = 12; g.fillStyle = '#fff'; rr(g, x, y, w, h, 48); g.fill(); g.restore(); }
function dot(g, x, y, r, col, ch) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.font = `800 ${Math.round(r * .9)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, x, y + 2); }
function fitText(g, s, max, size, weight = 800, fam = FONT) { let z = size; do { g.font = `${weight} ${z}px ${fam}`; z -= 2; } while (g.measureText(s).width > max && z > 20); }
function blobs(g, W, H, ca, cb) {
  g.save(); g.globalAlpha = .10; g.fillStyle = ca; g.beginPath(); g.arc(W * .1, H * .08, 260, 0, Math.PI * 2); g.fill();
  g.fillStyle = cb; g.beginPath(); g.arc(W * .95, H * .2, 220, 0, Math.PI * 2); g.fill(); g.restore();
}
function foot(g, W, H) { g.fillStyle = '#8C98AC'; g.font = `700 34px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText('フタリチョウ', W / 2, H - 56); }

export function settleCard({ names, colors, dir, paid, share, date, count }) {
  const { c, g, W, H } = base();
  const ca = COLORS[colors.a] || COLORS[0], cb = COLORS[colors.b] || COLORS[1];
  blobs(g, W, H, ca, cb);
  g.fillStyle = '#56657E'; g.font = `800 40px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillText(date + ' の精算', W / 2, 150);
  card(g, 70, 210, W - 140, 640);
  const col = r => (r === 'a' ? ca : cb);
  if (dir.amount) {
    dot(g, 300, 380, 82, col(dir.from), names[dir.from].slice(0, 1));
    dot(g, W - 300, 380, 82, col(dir.to), names[dir.to].slice(0, 1));
    g.strokeStyle = '#CBD7EA'; g.lineWidth = 8; g.setLineDash([18, 16]); g.beginPath(); g.moveTo(410, 380); g.lineTo(W - 420, 380); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#CBD7EA'; g.beginPath(); g.moveTo(W - 400, 380); g.lineTo(W - 432, 360); g.lineTo(W - 432, 400); g.fill();
    g.fillStyle = '#1E2B42'; g.font = `800 38px ${FONT}`; g.fillText(names[dir.from] + 'さん', 300, 520); g.fillText(names[dir.to] + 'さん', W - 300, 520);
    g.fillStyle = '#1E2B42'; fitText(g, yen(dir.amount), W - 240, 150, 800, NUM); g.fillText(yen(dir.amount), W / 2, 700);
    g.fillStyle = '#56657E'; g.font = `700 36px ${FONT}`; g.fillText(`${names[dir.from]}さんから ${names[dir.to]}さんへ`, W / 2, 790);
  } else {
    g.fillStyle = '#3BA57E'; g.font = `800 96px ${FONT}`; g.fillText('おあいこです', W / 2, 560);
  }
  card(g, 70, 900, W - 140, 300);
  g.textAlign = 'left'; g.fillStyle = '#8C98AC'; g.font = `700 30px ${FONT}`; g.fillText(`前回の精算から ${count}件`, 130, 975);
  ['a', 'b'].forEach((r, i) => {
    const y = 1055 + i * 90;
    dot(g, 150, y - 12, 30, col(r), names[r].slice(0, 1));
    g.textAlign = 'left'; g.fillStyle = '#1E2B42'; g.font = `800 36px ${FONT}`; g.fillText(names[r], 200, y);
    g.textAlign = 'right'; g.fillStyle = '#56657E'; g.font = `700 32px ${FONT}`; g.fillText('払った ' + yen(paid[r]) + '  /  分 ' + yen(share[r]), W - 130, y);
  });
  foot(g, W, H);
  return c;
}

export function monthCard({ names, colors, ym, sum, catList }) {
  const { c, g, W, H } = base();
  const ca = COLORS[colors.a] || COLORS[0], cb = COLORS[colors.b] || COLORS[1];
  blobs(g, W, H, ca, cb);
  const [y, m] = ym.split('-').map(Number);
  g.fillStyle = '#56657E'; g.font = `800 40px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillText(`${y}年${m}月のふたり`, W / 2, 150);
  card(g, 70, 200, W - 140, 520);
  g.fillStyle = '#8C98AC'; g.font = `700 32px ${FONT}`; g.fillText('ふたりの出費', W / 2, 290);
  g.fillStyle = '#1E2B42'; fitText(g, yen(sum.total), W - 260, 120, 800, NUM); g.fillText(yen(sum.total), W / 2, 420);
  // 負担の帯
  const bx = 150, bw = W - 300, by = 480;
  const ra = sum.total ? sum.share.a / sum.total : .5;
  g.fillStyle = '#E4EAF3'; rr(g, bx, by, bw, 36, 18); g.fill();
  g.save(); rr(g, bx, by, bw, 36, 18); g.clip(); g.fillStyle = ca; g.fillRect(bx, by, bw * ra, 36); g.fillStyle = cb; g.fillRect(bx + bw * ra, by, bw * (1 - ra), 36); g.restore();
  g.font = `800 36px ${FONT}`; g.textAlign = 'left'; g.fillStyle = ca; g.fillText(`${names.a} ${sum.ratio.a}%`, bx, 590);
  g.textAlign = 'right'; g.fillStyle = cb; g.fillText(`${sum.ratio.b}% ${names.b}`, bx + bw, 590);
  g.textAlign = 'center'; g.fillStyle = '#56657E'; g.font = `700 32px ${FONT}`;
  const more = sum.tatekae.a > 0 ? 'a' : sum.tatekae.b > 0 ? 'b' : null;
  g.fillText(more ? `今月は${names[more]}さんが多めに立て替え` : '今月の立て替えは、ちょうど半分ずつ', W / 2, 670);
  card(g, 70, 760, W - 140, 460);
  g.textAlign = 'left'; g.fillStyle = '#8C98AC'; g.font = `700 30px ${FONT}`; g.fillText('カテゴリ', 130, 830);
  const top = catList.slice(0, 5); const max = top.length ? top[0].v : 1;
  top.forEach((x, i) => {
    const yy = 900 + i * 64;
    g.fillStyle = '#1E2B42'; g.font = `800 32px ${FONT}`; g.textAlign = 'left'; g.fillText(x.name, 130, yy);
    g.fillStyle = '#E4EAF3'; rr(g, 330, yy - 22, 420, 20, 10); g.fill();
    g.fillStyle = x.color; rr(g, 330, yy - 22, Math.max(20, 420 * x.v / max), 20, 10); g.fill();
    g.fillStyle = '#56657E'; g.font = `700 30px ${NUM}`; g.textAlign = 'right'; g.fillText(yen(x.v), W - 130, yy);
  });
  if (!top.length) { g.fillStyle = '#8C98AC'; g.textAlign = 'center'; g.font = `700 32px ${FONT}`; g.fillText('この月の記録はまだありません', W / 2, 990); }
  foot(g, W, H);
  return c;
}
