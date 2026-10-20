// 今日の1語・名前のカードを 1080x1350 の画像にする(端末の中で描く。サーバーは使わない)
const W = 1080, H = 1350;
const JP_FONT = '"Shippori Mincho B1", "Noto Serif JP", "Yu Mincho", serif';
const EN_FONT = '"Fraunces", Georgia, serif';

function loadImg(src) { return new Promise(res => { if (!src) return res(null); const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }); }

function cover(ctx, im, x, y, w, h) {
  const s = Math.max(w / im.width, h / im.height); const iw = im.width * s, ih = im.height * s;
  ctx.drawImage(im, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}
function fitText(ctx, text, maxW, size, font, weight = 700) {
  let s = size; do { ctx.font = `${weight} ${s}px ${font}`; s -= 4; } while (ctx.measureText(text).width > maxW && s > 24); return s + 4;
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// opts: { big, reading, meaning, label, streakText, footer, bg, mascot }
export async function drawCard(opts) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  try { await Promise.all([document.fonts.load(`700 200px ${JP_FONT}`, opts.big), document.fonts.load(`600 60px ${EN_FONT}`)]); } catch (e) { }
  // 地: アプリの藍色。絵があれば上に敷く
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0d1433'); g.addColorStop(1, '#1b1240'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const bg = await loadImg(opts.bg);
  if (bg) { cover(ctx, bg, 0, 0, W, H); const sh = ctx.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, 'rgba(8,12,34,.1)'); sh.addColorStop(.5, 'rgba(8,12,34,.3)'); sh.addColorStop(1, 'rgba(8,12,34,.8)'); ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H); }
  // 金の枠
  ctx.strokeStyle = 'rgba(232,192,120,.85)'; ctx.lineWidth = 4; rr(ctx, 48, 48, W - 96, H - 96, 44); ctx.stroke();
  ctx.strokeStyle = 'rgba(232,192,120,.35)'; ctx.lineWidth = 2; rr(ctx, 64, 64, W - 128, H - 128, 36); ctx.stroke();
  if (bg) { rr(ctx, 170, 100, W - 340, 980, 40); ctx.fillStyle = 'rgba(10,15,44,.8)'; ctx.fill(); ctx.strokeStyle = 'rgba(232,192,120,.8)'; ctx.lineWidth = 3; ctx.stroke(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  // 見出し
  ctx.fillStyle = '#f2cf8a'; ctx.font = `600 50px ${EN_FONT}`; ctx.fillText(opts.label || '', W / 2, 190);
  // 大きな日本語
  const bigSize = fitText(ctx, opts.big, bg ? W - 420 : W - 220, opts.big.length <= 2 ? 330 : 260, JP_FONT);
  ctx.font = `700 ${bigSize}px ${JP_FONT}`;
  ctx.shadowColor = 'rgba(255,190,120,.55)'; ctx.shadowBlur = 40; ctx.fillStyle = '#fff6e8';
  ctx.fillText(opts.big, W / 2, 560); ctx.shadowBlur = 0;
  if (opts.reading) { ctx.fillStyle = '#ffe2b8'; ctx.font = `500 ${fitText(ctx, opts.reading, W - 420, 92, JP_FONT, 500)}px ${JP_FONT}`; ctx.fillText(opts.reading, W / 2, 700); }
  if (opts.meaning) { ctx.fillStyle = '#ffffff'; ctx.font = `600 ${fitText(ctx, opts.meaning, W - 420, 84, EN_FONT, 600)}px ${EN_FONT}`; ctx.fillText(opts.meaning, W / 2, 820); }
  // ストリーク
  if (opts.streakText) {
    ctx.font = `600 54px ${EN_FONT}`; const tw = ctx.measureText(opts.streakText).width + 150;
    rr(ctx, (W - tw) / 2, 930, tw, 110, 55); ctx.fillStyle = 'rgba(214,64,52,.92)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText('🔥 ' + opts.streakText, W / 2, 1004);
  }
  const lg = await loadImg(opts.logo);
  const ms = lg ? null : await loadImg(opts.mascot);
  if (ms) ctx.drawImage(ms, W - 300, H - 330, 220, 220 * ms.height / ms.width);
  ctx.textAlign = 'left';
  if (lg) ctx.drawImage(lg, 116, H - 228, 340, 340 * lg.height / lg.width);
  else { ctx.fillStyle = '#f2cf8a'; ctx.font = `700 56px ${EN_FONT}`; ctx.fillText(opts.footer || 'Tsukau', 120, H - 130); }
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = `400 34px ${EN_FONT}`; ctx.fillText('Japanese you will actually use', 120, H - 100);
  return cv;
}

export function canvasBlob(cv) { return new Promise(res => cv.toBlob(b => res(b), 'image/png')); }
function blobToB64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => { const s = String(r.result); res(s.slice(s.indexOf(',') + 1)); }; r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); }

// 共有。アプリ版は Filesystem に書いて Share、ブラウザは Web Share(ファイル)、できなければ保存
export async function shareImage(blob, name, text) {
  const C = window.Capacitor, P = (C && C.Plugins) || {};
  const native = C && C.isNativePlatform && C.isNativePlatform();
  if (native && P.Filesystem && P.Share) {
    const w = await P.Filesystem.writeFile({ path: name, data: await blobToB64(blob), directory: 'CACHE' });
    await P.Share.share({ title: 'Tsukau', text, files: [w.uri] });
    return 'shared';
  }
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'saved';
}
