// 布で比べる絵: 同じ顔のまわりを布の色でくるむ。まわりは無彩色の灰色だけ。
// 布のひだの陰影は、ChatGPT の画面案から切り出した灰色の布の写真(img/drape_folds.jpg)をうすく重ねるだけ。色そのものは指定の色のまま。
const BG = '#C9CBCD';
const folds = typeof Image === 'undefined' ? null : new Image();
export const drapeAssets = folds ? new Promise(r => { folds.onload = r; folds.onerror = r; folds.src = 'img/drape_folds.jpg'; }) : Promise.resolve();
const ready = () => folds && folds.complete && folds.naturalWidth > 0;

// 顔のまわり(髪と首を少し含む)を切り出し、ふちをぼかした canvas
export function cropHead(src, f) {
  const ex = f.rx * 1.7, top = f.cy - f.ry * 1.55, bottom = f.cy + f.ry * 1.7;
  const W = Math.max(2, Math.round(ex * 2)), H = Math.max(2, Math.round(bottom - top));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(src, f.cx - ex, top, W, H, 0, 0, W, H);
  // 髪と顔の外は灰色に溶かす(背景の色が見比べに入らないように)
  const g = ctx.createRadialGradient(W / 2, (f.cy - top) - f.ry * 0.1, f.rx * 1.15, W / 2, (f.cy - top) - f.ry * 0.1, f.rx * 1.6);
  g.addColorStop(0, 'rgba(201,203,205,0)'); g.addColorStop(1, 'rgba(201,203,205,1)');
  ctx.save(); ctx.translate(0, 0); ctx.fillStyle = g;
  ctx.setTransform(1, 0, 0, f.ry / f.rx, 0, ((f.cy - top) - f.ry * 0.1) * (1 - f.ry / f.rx));
  ctx.fillRect(0, -H, W, H * 3); ctx.restore();
  cv.meta = { cy: f.cy - top, rx: f.rx, ry: f.ry };
  return cv;
}

// cv: 描く先の canvas、hex: 布の色、head: cropHead の結果
export function paintDrape(cv, hex, head) {
  const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  if (head) {
    const m = head.meta; const s = (W * 0.35) / m.rx; const w = head.width * s, h = head.height * s;
    const cy = H * 0.39; ctx.drawImage(head, W / 2 - w / 2, cy - m.cy * s, w, h);
  }
  // 布: 首の下で重なる V 字。両わきは顔の外側まで上がる
  const p = new Path2D();
  p.moveTo(0, H * 0.61);
  p.bezierCurveTo(W * 0.14, H * 0.63, W * 0.2, H * 0.67, W * 0.3, H * 0.71);
  p.bezierCurveTo(W * 0.38, H * 0.75, W * 0.45, H * 0.80, W * 0.5, H * 0.83);
  p.bezierCurveTo(W * 0.55, H * 0.80, W * 0.62, H * 0.75, W * 0.7, H * 0.71);
  p.bezierCurveTo(W * 0.8, H * 0.67, W * 0.86, H * 0.63, W, H * 0.61);
  p.lineTo(W, H); p.lineTo(0, H); p.closePath();
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = W * 0.03; ctx.shadowOffsetY = -2;
  ctx.fillStyle = hex; ctx.fill(p); ctx.restore();
  // ひだ(うすく)。明るさの差だけを重ね、平均の色は変えない
  if (ready()) {
    ctx.save(); ctx.clip(p); ctx.globalAlpha = 0.22; ctx.globalCompositeOperation = 'soft-light';
    ctx.drawImage(folds, 0, H * 0.6, W, H * 0.4); ctx.restore();
  }
  // 重なりの線
  ctx.save(); ctx.clip(p); ctx.strokeStyle = 'rgba(0,0,0,.10)'; ctx.lineWidth = W * 0.012;
  ctx.beginPath(); ctx.moveTo(W * 0.5, H * 0.83); ctx.bezierCurveTo(W * 0.62, H * 0.88, W * 0.78, H * 0.93, W * 0.95, H); ctx.stroke(); ctx.restore();
}
