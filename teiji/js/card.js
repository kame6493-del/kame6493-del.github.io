/* 結果カード(1200x675)を canvas に描く。絵は切り出し画像、文字はすべてここで描く */
(function () {
  'use strict';
  const W = 1200, H = 675;
  const cache = {};
  function img(src) {
    if (!cache[src]) cache[src] = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    return cache[src];
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function cover(ctx, im, x, y, w, h, fx = 0.5, fy = 0.5) {
    const s = Math.max(w / im.width, h / im.height);
    const sw = w / s, sh = h / s;
    ctx.drawImage(im, (im.width - sw) * fx, (im.height - sh) * fy, sw, sh, x, y, w, h);
  }
  function panel(ctx, x, y, w, h, r = 18, border = 'rgba(90,140,255,.85)') {
    ctx.save();
    rr(ctx, x, y, w, h, r);
    ctx.fillStyle = 'rgba(8,14,46,.86)'; ctx.fill();
    ctx.shadowColor = 'rgba(70,120,255,.8)'; ctx.shadowBlur = 14; ctx.lineWidth = 3; ctx.strokeStyle = border; ctx.stroke();
    ctx.restore();
  }
  function setFont(ctx, size, font) {
    const m = /^(\d{3}) (.*)$/.exec(font);
    ctx.font = m ? (m[1] + ' ' + size + 'px ' + m[2]) : (size + 'px ' + font);
  }
  function goldText(ctx, text, x, y, size, font, align = 'left', maxW) {
    ctx.save();
    setFont(ctx, size, font); ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    let s = 1;
    if (maxW) { const m = ctx.measureText(text).width; if (m > maxW) s = maxW / m; }
    ctx.translate(x, y); ctx.scale(s, 1);
    const g = ctx.createLinearGradient(0, -size * 0.85, 0, size * 0.1);
    g.addColorStop(0, '#fffbe0'); g.addColorStop(0.45, '#ffe04a'); g.addColorStop(0.8, '#f2a100'); g.addColorStop(1, '#ffd75a');
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.16; ctx.strokeStyle = '#3a1d00'; ctx.strokeText(text, 0, 0);
    ctx.shadowColor = 'rgba(255,190,40,.8)'; ctx.shadowBlur = size * 0.25;
    ctx.fillStyle = g; ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  function whiteText(ctx, text, x, y, size, font, align = 'left', color = '#fff', stroke = '#0a1130', maxW) {
    ctx.save();
    setFont(ctx, size, font); ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    let s = 1;
    if (maxW) { const m = ctx.measureText(text).width; if (m > maxW) s = maxW / m; }
    ctx.translate(x, y); ctx.scale(s, 1);
    if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * 0.14); ctx.strokeStyle = stroke; ctx.strokeText(text, 0, 0); }
    ctx.fillStyle = color; ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  function laurel(ctx, cx, cy, dir) {
    // 月桂冠: 弧に沿って葉を並べる
    ctx.save(); ctx.translate(cx, cy); ctx.scale(dir, 1);
    const R = 92, ox = 70;
    ctx.strokeStyle = '#e0a000'; ctx.lineWidth = 4; ctx.shadowColor = 'rgba(255,200,60,.8)'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(ox, 0, R, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke();
    for (let k = 0; k < 8; k++) {
      const a = Math.PI * (0.66 + k * 0.095);
      const px = ox + Math.cos(a) * R, py = Math.sin(a) * R;
      for (const side of [-1, 1]) {
        ctx.save(); ctx.translate(px, py); ctx.rotate(a + Math.PI / 2 + side * 0.55);
        const g = ctx.createLinearGradient(0, -20, 0, 0); g.addColorStop(0, '#fff3a6'); g.addColorStop(1, '#e09a00');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, -11, 6, 13, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }
  const ROUND = '"M PLUS Rounded 1c", sans-serif';
  const DISP = '"Dela Gothic One", "M PLUS Rounded 1c", sans-serif';

  async function draw(res, h) {
    try {
      await Promise.all([
        document.fonts.load('80px "Dela Gothic One"', '定時帰さない称号売上'),
        document.fonts.load('900 30px "M PLUS Rounded 1c"', '社員の状態あなたは'),
        document.fonts.load('700 24px "M PLUS Rounded 1c"', '翌朝当日'),
      ]);
    } catch (e) { }
    const T = window.STR;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const happy = res.title === 'white' || res.title === 'normal' || res.title === 'nothing';
    const [bg, art] = await Promise.all([img('img/card_bg.webp'), img(happy ? 'img/card_white.webp' : 'img/card_black.webp')]);
    const faces = await Promise.all(res.stages.map((st, i) => img(h.faceSrc(i, st))));

    // 背景
    cover(ctx, bg, 0, 0, W, H, 0.5, 0.35);
    ctx.fillStyle = 'rgba(5,9,30,.62)'; ctx.fillRect(0, 0, W, H);
    // 右の絵
    const ax = 560, aw = W - ax, ah = 470;
    ctx.save();
    cover(ctx, art, ax, 0, aw, ah, 0.5, happy ? 0.35 : 0.3);
    const fade = ctx.createLinearGradient(ax, 0, ax + 200, 0);
    fade.addColorStop(0, 'rgba(6,10,34,1)'); fade.addColorStop(1, 'rgba(6,10,34,0)');
    ctx.fillStyle = fade; ctx.fillRect(ax, 0, 200, ah);
    const fadeB = ctx.createLinearGradient(0, ah - 120, 0, ah);
    fadeB.addColorStop(0, 'rgba(6,10,34,0)'); fadeB.addColorStop(1, 'rgba(6,10,34,1)');
    ctx.fillStyle = fadeB; ctx.fillRect(ax, ah - 120, aw, 120);
    ctx.restore();

    // ゲーム名
    whiteText(ctx, T.title, 40, 82, 58, DISP, 'left', '#ffffff', '#101a4a');
    whiteText(ctx, T.cardTagline, 44, 118, 20, '800 ' + ROUND, 'left', '#dfe7ff', '#0a1130');

    // 称号
    const tx = 300;
    ctx.save();
    rr(ctx, tx - 70, 140, 140, 38, 19);
    const bgB = ctx.createLinearGradient(0, 140, 0, 178); bgB.addColorStop(0, '#3a2a00'); bgB.addColorStop(1, '#140d00');
    ctx.fillStyle = bgB; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#ffcf4a'; ctx.stroke();
    ctx.restore();
    whiteText(ctx, '♛ ' + T.titleLabel, tx, 168, 22, '900 ' + ROUND, 'center', '#ffe27a', null);
    laurel(ctx, tx - 250, 238, 1);
    laurel(ctx, tx + 250, 238, -1);
    const tname = T.TITLE[res.title][0];
    goldText(ctx, tname, tx, 282, tname.length > 6 ? 72 : 88, DISP, 'center', 420);
    whiteText(ctx, '― ' + T.TITLE[res.title][1] + ' ―', tx, 326, 20, '800 ' + ROUND, 'center', '#e8eeff', '#0a1130', 520);

    // 売上
    panel(ctx, 30, 350, 545, 128);
    whiteText(ctx, T.sales, 58, 430, 40, DISP, 'left', '#ffe69a', '#5a3000');
    const ys = h.yenShare(res.rev);
    goldText(ctx, ys, 160, 438, ys.length > 9 ? 62 : 72, DISP, 'left', 395);
    ctx.fillStyle = 'rgba(120,160,255,.35)'; ctx.fillRect(52, 452, 500, 2);
    whiteText(ctx, T.cardMorale(res.morale.toFixed(1), res.day), 58, 470, 18, '800 ' + ROUND, 'left', '#9fc0ff', null);

    // 退社時刻
    panel(ctx, 590, 350, 220, 128);
    const morning = res.minutes >= 360;
    whiteText(ctx, (res.minutes >= 660 ? '☀ ' : '☾ ') + T.cardLeave, 700, 385, 21, '900 ' + ROUND, 'center', '#ffe27a', null);
    whiteText(ctx, h.clockStr(res.minutes), 700, 446, 56, DISP, 'center', '#ffffff', '#0a1130');
    whiteText(ctx, morning ? T.cardNextMorning : T.cardSameDay, 700, 470, 17, '800 ' + ROUND, 'center', '#a9b8e6', null);

    // 社員の状態
    ctx.save();
    rr(ctx, 30, 494, 190, 52, 12);
    ctx.fillStyle = 'rgba(20,40,120,.9)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#5f8dff'; ctx.stroke();
    ctx.restore();
    whiteText(ctx, T.staffState, 125, 530, 26, '900 ' + ROUND, 'center', '#ffffff', null);
    const cw = 230, ch = 132, cy = 488;
    res.stages.forEach((st, i) => {
      const x = 240 + i * (cw + 12);
      ctx.save();
      rr(ctx, x, cy, cw, ch, 12); ctx.clip();
      ctx.fillStyle = '#0c1440'; ctx.fillRect(x, cy, cw, ch);
      const e = h.emp[i];
      ctx.save();
      if (e.filter && e.filter !== 'none') try { ctx.filter = e.filter; } catch (er) { }
      if (e.flip) { ctx.translate(x * 2 + cw, 0); ctx.scale(-1, 1); }
      cover(ctx, faces[i], x, cy, cw, ch, 0.5, st === 10 ? 0.75 : 0.36);
      ctx.restore();
      const gr = ctx.createLinearGradient(0, cy + 84, 0, cy + ch);
      gr.addColorStop(0, 'rgba(4,8,30,0)'); gr.addColorStop(1, 'rgba(4,8,30,.92)');
      ctx.fillStyle = gr; ctx.fillRect(x, cy + 84, cw, ch - 84);
      ctx.restore();
      ctx.save(); rr(ctx, x, cy, cw, ch, 12); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(110,150,255,.9)'; ctx.stroke(); ctx.restore();
      const label = res.gone[i] ? T.goneHome : T.STAGES[st - 1];
      whiteText(ctx, label, x + 12, cy + 111, 18, '900 ' + ROUND, 'left', '#ffffff', '#050a24', cw - 24);
      // 疲れのバー
      const f = res.gone[i] ? 0.05 : Math.min(1, st / 10);
      ctx.fillStyle = 'rgba(255,255,255,.18)'; rr(ctx, x + 12, cy + 117, cw - 24, 8, 4); ctx.fill();
      ctx.fillStyle = st >= 10 ? '#a77bff' : st >= 7 ? '#ff5a5a' : st >= 4 ? '#ffb43a' : '#5fe08a';
      rr(ctx, x + 12, cy + 117, Math.max(8, (cw - 24) * f), 8, 4); ctx.fill();
      // 段階の番号
      ctx.beginPath(); ctx.arc(x + 22, cy + 22, 16, 0, Math.PI * 2); ctx.fillStyle = 'rgba(10,16,48,.9)'; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffd24a'; ctx.stroke();
      whiteText(ctx, String(st), x + 22, cy + 29, 18, '900 ' + ROUND, 'center', '#ffe27a', null);
    });

    // 下の帯
    const by = 630;
    const band = ctx.createLinearGradient(0, by, W, by);
    band.addColorStop(0, '#5a0414'); band.addColorStop(0.5, '#c3122c'); band.addColorStop(1, '#5a0414');
    ctx.fillStyle = band; ctx.fillRect(0, by, W, H - by);
    ctx.fillStyle = 'rgba(255,140,120,.8)'; ctx.fillRect(0, by, W, 2);
    whiteText(ctx, T.cardCatch, 40, by + 34, 28, DISP, 'left', '#ffffff', '#4a0010');
    whiteText(ctx, '#' + window.CFG.hashtag + '  yurustudio.github.io/teiji', W - 30, by + 32, 20, '800 ' + ROUND, 'right', '#ffe0da', null);
    return c;
  }
  window.TeijiCard = { draw };
})();
