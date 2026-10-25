// ハルの冒険 2026-10-24 夜(持ち主「中間の 強敵の 動きを もっと・ボスの 動きを 多く・章ごとの ボスに 会う 時に 会話」)
// 1) 中ボス級(ex1016 の mid 6体)と つよい敵(ex1017 の strong 7体): こうげきの 前に「ため」(光る・ゆれる・!)と、新しい 技を 1つずつ。
// 2) ボス 12体: 体力 2/3 と 1/3 で おこって(ほえる・赤く 光る)新しい 技が ふえる。ため・攻撃・やられ・怒りの コマ(ChatGPT の 絵)。
// 3) ボスの 部屋に 入った 時の ハルと ボスの 掛け合い(はじめて=3〜4行、2回目から=ひとこと)と、たおした あとの ハルの ひとこと。
// 絵が 無い ときは 前の 絵の まま(光と ゆれと ! だけ)。game.js・ex1016.js・ex1017.js の 関数を つつんで 足す。
'use strict';

const M24_V = '20261025p';
const M24_MID = ['inoshishi', 'knight', 'taisho', 'hyogolem', 'oochochin', 'oyabun'];
const M24_ST = ['kuwagata', 'yukidaruma', 'raijin', 'ookami', 'gorira', 'kurekame', 'ryusei'];
// ポーズの 絵が ある ボスだけ 読む(10/24 は 3体、10/25 に のこり 9体も ChatGPT で 描いて 12体 そろった。無い ボスは 光と ゆれで ため を 見せる)
const M24_BOSS = ['boss_slime', 'boss_maou', 'boss_maou2', 'boss_karakara', 'boss_kabuto', 'boss_goronta', 'boss_yurei', 'boss_queen', 'boss_munyaru', 'boss_eye', 'boss_perari', 'boss_kage'];
const M24_POSES = ['tame', 'atk', 'hurt', 'angry'];
{
  const names = [];
  for (const k of M24_MID) names.push('xe_' + k + '_3', 'xe_' + k + '_4');
  for (const k of M24_ST) names.push('xf_' + k + '_3', 'xf_' + k + '_4');
  for (const b of M24_BOSS) for (const p of M24_POSES) names.push(b + '_' + p);
  for (const n of names) {
    const im = new Image();
    im.onload = () => { if (im.naturalWidth) ART[n] = im; };
    im.onerror = () => {};
    im.src = 'assets/chatgpt/' + n + '.png?v=' + M24_V;
  }
}

// ---------------- 小さな 道具 ----------------
function m24Grav(o, dt) { o.vy = Math.min((o.vy || 0) + GRAV * dt, MAXFALL); moveBody(o, dt); }
function m24Arena(o) { return o.arena ? [(o.arena[0] + 1) * TILE, o.arena[1] * TILE] : [o.x - 8 * TILE, o.x + 8 * TILE]; }
function m24Gy(x, o) { return groundYBelow(Math.floor(x / TILE), o && o.y !== undefined ? Math.max(0, Math.floor((o.y + o.h) / TILE) - 3) : 2) * TILE; }
// たまの 種類: magic(紫・青)/ spit(色)/ m24 の 落ちもの・はしら・かげ
function m24Magic(x, y, vx, vy, blue, life = 5) { world.ents.push({ id: ++uid, t: 'magic', x: x - 12, y: y - 12, w: 24, h: 24, vx, vy, life, blue: !!blue, b24: 1 }); }
function m24Spit(x, y, vx, vy, col, g = 1200, life = 3) { world.ents.push({ id: ++uid, t: 'spit', x: x - 10, y: y - 10, w: 20, h: 20, vx, vy, g, life, col, b24: 1 }); }
// 上から 落ちる 物(落ちる 場所に 影が 出て だんだん 濃くなる)
function m24Drop(x, gy, warn, kind) { world.ents.push({ id: ++uid, t: 'm24_drop', x: x - 16, y: -60, w: 32, h: 32, gy, warn, warn0: warn, vy: 0, kind, b24: 1 }); }
// 下から/上から の はしら(さきに 点線と 光の わで 知らせる)
function m24Col(x, gy, warn, dur, kind, w = 60) { world.ents.push({ id: ++uid, t: 'm24_col', x: x - w / 2, y: 0, w, h: gy, gy, warn, warn0: warn, dur, kind, b24: 1 }); }
// 地面を はしる なみ(とびこえる)
function m24Wave(x, y, dir, sp, kind = 'ice', life = 2.2) { world.ents.push({ id: ++uid, t: 'x_wave', x: x - 18, y: y - 30, w: 36, h: 30, vx: dir * sp, life, b24: 1, k24: kind }); }
// よこに とぶ 物(ペラリの ページ・かげの ぶんしん)
function m24Fly(x, y, vx, kind, w, h, life = 4) { world.ents.push({ id: ++uid, t: 'm24_fly', x: x - w / 2, y: y - h / 2, w, h, vx, vy: 0, life, kind, b24: 1 }); }
function m24Home(x, y, sp) { world.ents.push({ id: ++uid, t: 'm24_home', x: x - 12, y: y - 12, w: 24, h: 24, vx: 0, vy: 0, sp, life: 4.2, steer: 1.7, b24: 1 }); }
function m24Ring(o) { (world.ring24 = world.ring24 || []).push({ x: o.x + o.w / 2, y: o.y + o.h / 2, s: world.time }); }
// 試験用: 技を 何回 つかったか(window.__m24c)
function m24Count(k) { try { const c = window.__m24c = window.__m24c || {}; c[k] = (c[k] || 0) + 1; if (world) { const w = world.m24c = world.m24c || {}; w[k] = (w[k] || 0) + 1; } } catch (e) { /* なにもしない */ } }
function m24Pose(o, pose, t) { o.pose24 = pose; o.pose24T = t; }
// こうげきの まえの 合図(光+ゆれ+!)
function m24Tame(o, t) { o.tame24 = t; o.tame24max = t; sfx('powerup', 1.8); }

// ---------------- 物の うごき と 描き方 ----------------
{
  const _ut = updateThingX;
  updateThingX = function (o, dt) {
    if (o.b24 && world.bossDone) { o.gone = true; return true; }
    const p = P;
    switch (o.t) {
      case 'm24_drop': {
        if (o.warn > 0) { o.warn -= dt; return true; }
        o.vy += 1800 * dt; o.y += o.vy * dt;
        if (!p.dead && overlap(p, { x: o.x + 4, y: o.y + 4, w: o.w - 8, h: o.h - 8 })) { o.gone = true; hurtPlayer(o.x + o.w / 2); return true; }
        if (o.y + o.h >= o.gy) { o.gone = true; const c = { star: '#fff3a0', wax: '#fff2c8', needle: '#ffd84a', ice: '#cdf3ff', rock: '#9a8a7a' }[o.kind] || '#fff'; burst(o.x + o.w / 2, o.gy - 6, c, 7, 150, 4); if (o.kind === 'rock') debris(o.x, o.gy - 40, 'boulder'); sfx(o.kind === 'rock' ? 'break' : 'bump', o.kind === 'rock' ? 0.7 : 1.6); }
        return true;
      }
      case 'm24_col': {
        if (o.warn > 0) { o.warn -= dt; if (o.warn <= 0) { sfx(o.kind === 'sand' ? 'break' : o.kind === 'shadow' ? 'fire' : 'zap', o.kind === 'sand' ? 0.8 : 0.9); cam.shake = Math.max(cam.shake, 0.15); } return true; }
        o.dur -= dt; if (o.dur <= 0) { o.gone = true; return true; }
        const top = o.kind === 'sand' || o.kind === 'shadow' ? o.gy - 3.2 * TILE : 0;
        if (!p.dead && overlap({ x: p.x + 4, y: p.y + 6, w: p.w - 8, h: p.h - 8 }, { x: o.x + 10, y: top, w: o.w - 20, h: o.gy - top })) hurtPlayer(o.x + o.w / 2);
        return true;
      }
      case 'm24_fly': {
        o.x += o.vx * dt; o.life -= dt;
        if (o.life <= 0 || (o.kind !== 'clone' && isSolid(Math.floor((o.x + (o.vx > 0 ? o.w : 0)) / TILE), Math.floor((o.y + o.h / 2) / TILE)))) { o.gone = true; burst(o.x + o.w / 2, o.y + o.h / 2, o.kind === 'page' ? '#fffdf2' : '#6a4a9a', 6, 120, 4); return true; }
        if (o.kind === 'clone' && Math.random() < dt * 20) parts.push({ x: o.x + rnd(0, o.w), y: o.y + rnd(0, o.h), vx: -o.vx * 0.1, vy: rnd(-40, -10), life: 0.35, max: 0.35, color: '#5a2aa0', size: rnd(3, 6), g: 0, puff: true });
        if (!p.dead && overlap({ x: p.x + 4, y: p.y + 6, w: p.w - 8, h: p.h - 8 }, { x: o.x + 4, y: o.y + 4, w: o.w - 8, h: o.h - 8 })) { if (o.kind !== 'clone') o.gone = true; hurtPlayer(o.x + o.w / 2); }
        return true;
      }
      case 'm24_home': {
        o.life -= dt;
        const ax = p.x + p.w / 2 - (o.x + 12), ay = p.y + p.h / 2 - (o.y + 12), d = Math.hypot(ax, ay) || 1;
        if (o.steer > 0) { o.steer -= dt; o.vx = lerp(o.vx, ax / d * o.sp, Math.min(1, dt * 2.2)); o.vy = lerp(o.vy, ay / d * o.sp, Math.min(1, dt * 2.2)); }
        o.x += o.vx * dt; o.y += o.vy * dt;
        if (Math.random() < dt * 30) parts.push({ x: o.x + 12, y: o.y + 12, vx: rnd(-20, 20), vy: rnd(-20, 20), life: 0.3, max: 0.3, color: Math.random() < 0.5 ? '#5a2aa0' : '#c79bff', size: 3, g: 0, star: true });
        if (o.life <= 0 || isSolid(Math.floor((o.x + 12) / TILE), Math.floor((o.y + 12) / TILE))) { o.gone = true; sparkle(o.x + 12, o.y + 12, 6); return true; }
        if (!p.dead && overlap(p, { x: o.x + 4, y: o.y + 4, w: 16, h: 16 })) { o.gone = true; hurtPlayer(o.x + 12); }
        return true;
      }
    }
    return _ut(o, dt);
  };
  const _dt = drawThingX;
  drawThingX = function (o, t) {
    switch (o.t) {
      case 'm24_drop': {
        const cx = o.x + o.w / 2;
        const k = o.warn > 0 ? clamp(1 - o.warn / Math.max(0.1, o.warn0), 0, 1) : 1;
        ctx.save(); ctx.globalAlpha = 0.25 + k * 0.4; ctx.fillStyle = '#1a1028'; ctx.beginPath(); ctx.ellipse(cx, o.gy - 2, 8 + k * 18, 3 + k * 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        if (o.warn > 0) return true;
        ctx.save(); ctx.translate(cx, o.y + o.h / 2);
        if (o.kind === 'rock') { ctx.rotate(t * 6); drawImg('boulder', -18, -18, 36, 34); }
        else if (o.kind === 'ice') drawImg('icicle', -14, -22, 28, 44);
        else if (o.kind === 'needle') { ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(-8, -14); ctx.lineTo(8, -14); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        else if (o.kind === 'wax') { ctx.shadowColor = '#ffd27a'; ctx.shadowBlur = 14; ctx.fillStyle = '#fff2c8'; ctx.beginPath(); ctx.moveTo(0, -16); ctx.quadraticCurveTo(14, 4, 0, 14); ctx.quadraticCurveTo(-14, 4, 0, -16); ctx.fill(); }
        else { ctx.shadowColor = '#fff36b'; ctx.shadowBlur = 18; ctx.fillStyle = '#fff6b0'; ctx.rotate(t * 5); ctx.fillRect(-14, -4, 28, 8); ctx.fillRect(-4, -14, 8, 28); }
        ctx.restore(); return true;
      }
      case 'm24_col': {
        const cx = o.x + o.w / 2, col = { sand: ['#e8c070', 'rgba(232,192,112,'], shadow: ['#9a6ad8', 'rgba(90,42,160,'], bolt: ['#fff36b', 'rgba(255,243,107,'], star: ['#fff6c8', 'rgba(255,246,200,'] }[o.kind] || ['#fff', 'rgba(255,255,255,'];
        const top = o.kind === 'sand' || o.kind === 'shadow' ? o.gy - 3.2 * TILE : 0;
        ctx.save();
        if (o.warn > 0) {
          const k = clamp(1 - o.warn / Math.max(0.1, o.warn0), 0, 1);
          ctx.globalAlpha = 0.35 + Math.sin(t * 24) * 0.2; ctx.strokeStyle = col[0]; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
          ctx.beginPath(); ctx.moveTo(o.x + 8, top); ctx.lineTo(o.x + 8, o.gy); ctx.moveTo(o.x + o.w - 8, top); ctx.lineTo(o.x + o.w - 8, o.gy); ctx.stroke();
          ctx.setLineDash([]); ctx.globalAlpha = 0.4 + k * 0.5; ctx.fillStyle = col[0]; ctx.beginPath(); ctx.ellipse(cx, o.gy - 3, 10 + k * (o.w / 2 - 10), 4 + k * 5, 0, 0, Math.PI * 2); ctx.fill();
        } else {
          const g = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0); g.addColorStop(0, col[1] + '0)'); g.addColorStop(0.5, col[1] + '.95)'); g.addColorStop(1, col[1] + '0)');
          ctx.fillStyle = g; ctx.fillRect(o.x, top, o.w, o.gy - top);
          if (Math.random() < 0.5) parts.push({ x: cx + rnd(-o.w / 3, o.w / 3), y: rnd(top, o.gy), vx: 0, vy: rnd(-200, -60), life: 0.3, max: 0.3, color: col[0], size: 3, g: 0, star: o.kind !== 'sand' });
        }
        ctx.restore(); return true;
      }
      case 'm24_fly': {
        ctx.save();
        if (o.kind === 'page') {
          ctx.translate(o.x + o.w / 2, o.y + o.h / 2); ctx.rotate(Math.sin(t * 14 + o.id) * 0.25);
          ctx.fillStyle = '#fffdf2'; ctx.strokeStyle = '#2a1a3a'; ctx.lineWidth = 3; rr(-o.w / 2, -o.h / 2, o.w, o.h, 4); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = '#9a8ab8'; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-o.w / 2 + 6, -o.h / 2 + 8 + i * 7); ctx.lineTo(o.w / 2 - 6, -o.h / 2 + 8 + i * 7); ctx.stroke(); }
        } else {
          const im = ART.boss_kage_atk || ART.boss_kage || IMG.hero_idle;
          ctx.globalAlpha = 0.55; ctx.translate(o.x + o.w / 2, o.y + o.h); ctx.scale(o.vx > 0 ? 1 : -1, 1);
          if (!ART.boss_kage) ctx.filter = 'brightness(0.18) sepia(1) hue-rotate(220deg) saturate(3)';
          ctx.shadowColor = '#a070ff'; ctx.shadowBlur = 20;
          if (im && im.naturalWidth) { const H = o.h + 14, W = im.naturalWidth / im.naturalHeight * H; ctx.drawImage(im, -W / 2, -H, W, H); }
        }
        ctx.restore(); return true;
      }
      case 'm24_home': { ctx.save(); ctx.shadowColor = '#a070ff'; ctx.shadowBlur = 16; ctx.fillStyle = '#3a1a6a'; ctx.beginPath(); ctx.arc(o.x + 12, o.y + 12, 11 + Math.sin(t * 20) * 2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#c79bff'; ctx.beginPath(); ctx.arc(o.x + 12, o.y + 12, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return true; }
      case 'x_wave': if (o.k24 === 'sand' || o.k24 === 'shadow' || o.k24 === 'mochi') {
        const c = { sand: ['rgba(232,192,112,.92)', '#9a6a2a'], shadow: ['rgba(120,70,200,.85)', '#3a1a6a'], mochi: ['rgba(255,252,240,.95)', '#b8a890'] }[o.k24];
        ctx.save(); ctx.fillStyle = c[0]; ctx.strokeStyle = c[1]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(o.x, o.y + o.h); for (let i = 0; i <= 4; i++) ctx.lineTo(o.x + i * o.w / 4, o.y + (i % 2 ? 0 : o.h * 0.4)); ctx.lineTo(o.x + o.w, o.y + o.h); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); return true;
      }
    }
    return _dt(o, t);
  };
}

// ======================================================================
// 中ボス級・つよい敵
// ======================================================================
// もとの うごきが その こうげきに 入った しゅんかんに「ため」を はさむ(状態を とっておいて、ためが おわったら もどす)
const M24_HOLD = { inoshishi: { charge: 0.55 }, knight: { charge: 0.5 }, kuwagata: { charge: 0.5 }, ookami: { charge: 0.5 } };
// 新しい 技の 間かく(びょう)
const M24_EVERY = { inoshishi: 5.5, knight: 5, taisho: 6, hyogolem: 6.5, oochochin: 7, oyabun: 6, kuwagata: 4.5, yukidaruma: 6, raijin: 5.5, ookami: 5.5, gorira: 6, kurekame: 6.5, ryusei: 6 };
function m24IsMS(o) { return o.d && (o.d.mid || o.d.strong) && !o.d.boss && (M24_EVERY[o.type] !== undefined); }
function m24Pre(o) { return (o.d.strong ? 'xf_' : 'xe_') + o.type + '_'; }
function m24Fr(o, f) { return ART[m24Pre(o) + f] ? f : null; }

function m24MidStart(o, px, py, ex, ey) {
  const dx = px - ex, adx = Math.abs(dx), face = dx < 0 ? -1 : 1;
  const ok = (() => {
    switch (o.type) {
      case 'inoshishi': return o.onGround && adx < 300 && adx > 40;
      case 'knight': return o.onGround && adx < 380;
      case 'taisho': return o.onGround && adx < 460;
      case 'hyogolem': return o.onGround && adx < 460;
      case 'oochochin': return (o.alpha ?? 1) >= 1 && adx < 480;
      case 'oyabun': return o.onGround && adx < 420;
      case 'kuwagata': return o.onGround && adx < 140 && Math.abs(py - ey) < 70;
      case 'yukidaruma': return o.onGround && adx < 520;
      case 'raijin': return adx < 480;
      case 'ookami': return o.onGround && adx < 300 && adx > 60;
      case 'gorira': return o.onGround && adx < 460;
      case 'kurekame': return o.onGround && adx < 420;
      case 'ryusei': return adx < 420 && py > ey;
    }
    return false;
  })();
  if (!ok) return false;
  o.face = face; o.vx = 0;
  o.mv24 = { k: o.type, step: 0, t: 0, px, py, sv: o.state }; m24Count('mid_' + o.type);
  o.state = 'm24';
  m24Tame(o, { inoshishi: 0.6, knight: 0.6, taisho: 0.55, hyogolem: 0.7, oochochin: 0.65, oyabun: 0.6, kuwagata: 0.45, yukidaruma: 0.65, raijin: 0.75, ookami: 0.5, gorira: 0.6, kurekame: 0.6, ryusei: 0.85 }[o.type]);
  o.fr = m24Fr(o, 3) ?? o.fr;
  if (o.type === 'raijin') o.mv24.tx = px; // かみなりは ためた 時の ハルの 場所に
  if (o.type === 'ryusei') { o.mv24.tx = px; o.mv24.ty = m24Gy(px, P); }
  // とびかかる 先・おちてくる 先に 赤い しるし
  if (o.type === 'ryusei' || o.type === 'ookami' || o.type === 'inoshishi') o.mv24.mark = { x: px, gy: m24Gy(px, P) };
  return true;
}
// 技の なかみ。おわったら true
function m24MidMove(o, dt, px, py, ex, ey) {
  const m = o.mv24, d = o.d;
  const fly = !!d.fly;
  if (o.tame24 <= 0) m.t += dt; // m.t は ため の あとから 数える
  if (o.tame24 > 0) {
    // ため: 止まって 光る(空を とぶ 物は その場で ゆれる)
    if (!fly) { o.vx = 0; m24Grav(o, dt); }
    o.fr = m24Fr(o, 3) ?? o.fr;
    if (o.type === 'kurekame' || o.type === 'gorira' || o.type === 'oyabun') { if (Math.random() < dt * 20) dust(ex + rnd(-20, 20), o.y + o.h, 1); }
    return false;
  }
  const atk = m24Fr(o, 4) ?? (o.d.strong ? 1 : 1);
  switch (o.type) {
    case 'inoshishi': { // ふみつけジャンプ: 立ち上がって とび、着地で 左右に 土の なみ
      if (m.step === 0) { m.step = 1; o.vy = -760; o.vx = clamp((m.px - ex) / 0.8, -300, 300); sfx('jump', 0.6); m.air = true; }
      o.fr = atk; m24Grav(o, dt);
      if (m.step === 1 && o.onGround && o.vy >= 0 && m.t > 0.15) { m.step = 2; o.vx = 0; cam.shake = Math.max(cam.shake, 0.3); sfx('boom', 0.8); dust(ex, o.y + o.h, 12); for (const s of [-1, 1]) m24Wave(ex + s * 30, o.y + o.h, s, 260, 'sand', 1.4); m.end = m.t + 0.45; }
      return m.step === 2 && m.t > m.end;
    }
    case 'knight': { // 剣を ふりおろして 前へ かげの なみ
      o.vx = 0; m24Grav(o, dt); o.fr = atk;
      if (m.step === 0) { m.step = 1; sfx('swing', 0.7); cam.shake = Math.max(cam.shake, 0.15); world.ents.push({ id: ++uid, t: 'swave', x: ex + o.face * 30 - 16, y: o.y + o.h - 40, w: 32, h: 40, vx: o.face * 280, life: 1.6, b24: 1 }); }
      return m.t > 0.45;
    }
    case 'taisho': { // どんぐりを 3つ なげる(ゆみなり)
      o.vx = 0; m24Grav(o, dt); o.fr = atk;
      if (m.step === 0) { m.step = 1; const dx = px - ex; for (const k of [0.7, 1.0, 1.3]) m24Spit(ex, o.y + 10, clamp(dx * k * 0.95, -320, 320), -600, '#a8642a', 1300); sfx('swing', 0.9); }
      return m.t > 0.45;
    }
    case 'hyogolem': { // うでを あげて つらら 3本(落ちる 場所に 影)
      o.vx = 0; m24Grav(o, dt); o.fr = atk;
      if (m.step === 0) { m.step = 1; sfx('swing', 1.5); for (let i = 0; i < 3; i++) { const x = px + (i - 1) * 120; m24Drop(x, m24Gy(x, P), 0.75 + i * 0.12, 'ice'); } }
      return m.t > 0.6;
    }
    case 'oochochin': { // 火の わ(6つ、ゆっくり ひろがる)
      o.fr = atk;
      if (m.step === 0) { m.step = 1; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + 0.26; m24Magic(ex, ey, Math.cos(a) * 120, Math.sin(a) * 120, false, 4); } sfx('fire', 0.9); m24Ring(o); }
      return m.t > 0.5;
    }
    case 'oyabun': { // きねで 地面を たたく → 左右に おもちの なみ
      o.vx = 0; m24Grav(o, dt); o.fr = atk;
      if (m.step === 0) { m.step = 1; cam.shake = Math.max(cam.shake, 0.3); sfx('boom', 0.9); dust(ex + o.face * 30, o.y + o.h, 10); for (const s of [-1, 1]) m24Wave(ex + s * 30, o.y + o.h, s, 240, 'mochi', 1.5); }
      return m.t > 0.5;
    }
    case 'kuwagata': { // 大あごで はさむ(前 だけ)
      o.vx = 0; m24Grav(o, dt); o.fr = atk;
      if (m.step === 0) { m.step = 1; fHit(o.face > 0 ? o.x + o.w - 10 : o.x - 60, o.y + 2, 70, o.h - 4, 0.22, 'slash'); sfx('swing', 1.3); cam.shake = Math.max(cam.shake, 0.1); }
      return m.t > 0.4;
    }
    case 'yukidaruma': { // 大きな ゆきだまを ころがす(とびこえる)
      o.vx = 0; m24Grav(o, dt); o.fr = atk;
      if (m.step === 0) { m.step = 1; world.ents.push({ id: ++uid, t: 'rollrock', x: ex + o.face * 34 - 22, y: o.y + o.h - 46, w: 44, h: 44, vx: o.face * 220, vy: 0, rot: 0, sp: 220, dir: o.face, snow24: 1, b24: 1 }); sfx('swing', 0.7); }
      return m.t > 0.5;
    }
    case 'raijin': { // かみなりを おとす(ためた 時の ハルの 場所に はしら)
      o.fr = atk;
      if (m.step === 0) { m.step = 1; m24Col(m.tx, m24Gy(m.tx, P), 0.55, 0.45, 'bolt', 56); sfx('zap', 1.2); }
      return m.t > 0.8;
    }
    case 'ookami': { // とびかかり(ためた 場所へ ゆみなりに)
      if (m.step === 0) { m.step = 1; o.vy = -620; o.vx = clamp((m.px - ex) / 0.75, -380, 380); sfx('swing', 1.4); }
      o.fr = atk; m24Grav(o, dt);
      if (m.t > 0.15 && o.onGround && o.vy >= 0) { o.vx = 0; dust(ex, o.y + o.h, 6); return true; }
      return m.t > 1.6;
    }
    case 'gorira': { // 両こぶしで 地面を たたく → 上から いし 2つ
      o.vx = 0; m24Grav(o, dt); o.fr = atk;
      if (m.step === 0) { m.step = 1; cam.shake = Math.max(cam.shake, 0.3); sfx('boom', 0.8); dust(ex, o.y + o.h, 10); for (const s of [-1, 1]) { const x = px + s * 70; m24Drop(x, m24Gy(x, P), 0.7 + (s > 0 ? 0.25 : 0), 'rock'); } }
      return m.t > 0.55;
    }
    case 'kurekame': { // こうらで まわって すべる(かべ・がけで とまって 目を まわす)
      o.fr = atk;
      if (m.step === 0) { m.step = 1; sfx('dash', 0.9); }
      const r = fWalk(o, dt, 360, { dizzy: true });
      if (Math.random() < dt * 20) dust(ex, o.y + o.h, 1);
      if (r === 'wall' || m.t > 1.5) { o.vx = 0; if (r === 'wall') { sfx('bump'); cam.shake = Math.max(cam.shake, 0.15); o.state = 'dizzy'; o.timer = 1.0; o.mv24 = null; return 'keep'; } return true; }
      return false;
    }
    case 'ryusei': { // ためた 場所へ きゅうこうか → もとの 高さへ
      o.fr = atk;
      if (m.step === 0) { m.step = 1; const a = Math.atan2(m.ty - 30 - ey, m.tx - ex); m.vx = Math.cos(a) * 520; m.vy = Math.sin(a) * 520; sfx('dash', 1.1); }
      if (m.step === 1) { o.x0 += m.vx * dt; o.x += m.vx * dt; o.y += m.vy * dt; if (o.y + o.h >= m.ty - 6 || m.t > 1.2) { m.step = 2; dust(ex, m.ty, 8); cam.shake = Math.max(cam.shake, 0.15); } return false; }
      o.y = lerp(o.y, o.y0, Math.min(1, dt * 3)); o.fr = m24Fr(o, 2) ?? 0;
      return Math.abs(o.y - o.y0) < 4 || m.t > 2.6;
    }
  }
  return true;
}
function m24MidEnd(o) {
  o.mv24 = null; o.tame24 = 0;
  o.state = 'walk'; o.timer = Math.max(o.timer || 0, 0.8); o.cool = Math.max(o.cool || 0, 1.0);
  o.mvT24 = M24_EVERY[o.type] * (o.hp <= 1 ? 0.75 : 1);
}
{
  const _upd = updateEnemyX;
  updateEnemyX = function (o, dt, px, py, ex, ey) {
    if (!m24IsMS(o) || o.sleepT > 0 || o.dying) return _upd(o, dt, px, py, ex, ey);
    if (o.tame24 > 0) o.tame24 = Math.max(0, o.tame24 - dt);
    if (o.pose24T > 0) o.pose24T -= dt;
    if (o.state === 'dizzy' && (o.hold24 || o.tame24 > 0) && !o.mv24) { o.hold24 = null; o.tame24 = 0; }
    // たたかれて 目を まわしたら 技は おしまい
    if (o.mv24 && o.state !== 'm24' && o.state !== 'hold24') { o.mv24 = null; o.tame24 = 0; }
    // もとの こうげきの まえの ため
    if (o.state === 'hold24') {
      if (o.invT > 0 && o.hold24 && o.hold24.hit !== o.hp) { o.state = 'dizzy'; o.timer = 0.9; o.hold24 = null; o.tame24 = 0; return _upd(o, dt, px, py, ex, ey); }
      if (!o.d.fly) { o.vx = 0; m24Grav(o, dt); }
      o.fr = m24Fr(o, 3) ?? o.fr;
      if (o.tame24 <= 0) { const h = o.hold24; o.hold24 = null; o.state = h.state; o.timer = h.timer; o.vx = h.vx; o.vy = h.vy; o.face = h.face; o.fr = m24Fr(o, 4) ?? o.fr; }
      return true;
    }
    if (o.mv24) {
      if (o.invT > 0 && o.mv24.hp !== undefined && o.mv24.hp !== o.hp) { o.mv24 = null; o.tame24 = 0; return _upd(o, dt, px, py, ex, ey); }
      o.mv24.hp = o.hp;
      const r = m24MidMove(o, dt, px, py, ex, ey);
      if (r === 'keep') return true;
      if (r) m24MidEnd(o);
      return true;
    }
    // 新しい 技の 番
    o.mvT24 = (o.mvT24 ?? (1.8 + (o.id % 5) * 0.4)) - dt;
    const awake = Math.abs(px - ex) < VW * 0.6;
    if (o.mvT24 <= 0 && awake && o.state !== 'dizzy' && !(o.invT > 0) && (o.state === 'walk' || o.state === undefined || o.type === 'taisho' || o.type === 'oyabun' || o.type === 'oochochin')) {
      if (o.type !== 'oochochin' || o.state === 'walk') {
        if (m24MidStart(o, px, py, ex, ey)) { o.mv24.hp = o.hp; return true; }
        o.mvT24 = 0.5;
      }
    }
    const s0 = o.state, big0 = o.big;
    const r = _upd(o, dt, px, py, ex, ey);
    // もとの とっしんに 入った しゅんかん → ため
    const hold = M24_HOLD[o.type];
    if (hold && o.state !== s0 && hold[o.state]) {
      o.hold24 = { state: o.state, timer: o.timer, vx: o.vx, vy: o.vy, face: o.face, hit: o.hp };
      o.state = 'hold24'; o.vx = 0; o.vy = 0; m24Tame(o, hold[o.hold24.state]); o.fr = m24Fr(o, 3) ?? o.fr;
    }
    // どんぐり大将の 大ジャンプにも ため
    if (o.type === 'taisho' && o.big && !big0) { o.hold24 = { state: o.state, timer: o.timer, vx: o.vx, vy: o.vy, face: o.face, hit: o.hp }; o.state = 'hold24'; o.vx = 0; o.vy = 0; o.y += 1; m24Tame(o, 0.45); o.fr = m24Fr(o, 3) ?? o.fr; }
    // もとの こうげきの コマ(ため=3・攻撃=4)を 絵が ある ときだけ
    m24MidFrames(o);
    return r;
  };
}
function m24MidFrames(o) {
  const f3 = m24Fr(o, 3), f4 = m24Fr(o, 4);
  switch (o.type) {
    case 'inoshishi': case 'knight': case 'kuwagata': case 'ookami': if (o.state === 'charge' && f4 !== null) o.fr = f4; break;
    case 'hyogolem': if (o.state === 'slam') o.fr = (o.slammed ? f4 : f3) ?? o.fr; break;
    case 'oochochin': if (o.state === 'walk' && !o.shot && o.timer < 1.65 && o.timer > 1.2) { o.fr = f3 ?? o.fr; o.glow24 = 1; } else if (o.shotT > 0) o.fr = f4 ?? o.fr; break;
    case 'oyabun': if (o.onGround && o.shotT > 0) o.fr = f4 ?? o.fr; else if (o.onGround && o.timer < 0.45 && o.hops % 3 !== 2) { o.fr = f3 ?? o.fr; o.glow24 = 1; } break;
    case 'taisho': break;
    case 'yukidaruma': if (o.state !== 'dizzy') { if (o.timer < 0.45) { o.fr = f3 ?? o.fr; o.glow24 = 1; } else if (o.timer > (o.hp <= 1 ? 1.0 : 1.6)) o.fr = f4 ?? o.fr; } break;
    case 'raijin': case 'ryusei': if (o.state !== 'dizzy') { if (o.timer < 0.5) { o.fr = f3 ?? o.fr; o.glow24 = 1; } else if (o.timer > (o.type === 'raijin' ? 2.15 : 2.7)) o.fr = f4 ?? o.fr; } break;
    case 'gorira': case 'kurekame': if (o.state === 'act') o.glow24 = 1; if (o.type === 'gorira' && o.state === 'act') o.fr = f3 ?? o.fr; break;
  }
}
// 描き方: ため の 間は 光って ゆれて 頭の 上に「!」
{
  const _de = drawEnemyX;
  drawEnemyX = function (o, t) {
    if (!m24IsMS(o) || o.dying) return _de(o, t);
    const tame = o.tame24 > 0 || o.glow24;
    o.glow24 = 0;
    if (!tame) return _de(o, t);
    ctx.save();
    const sh = Math.sin(t * 70) * 2.5;
    ctx.translate(sh, 0);
    ctx.shadowColor = o.d.strong ? '#ff6a2a' : '#ff3a5a'; ctx.shadowBlur = 22 + Math.sin(t * 20) * 8;
    const r = _de(o, t);
    ctx.restore();
    m24Bang(o.x + o.w / 2, o.y - 44, t);
    if (o.mv24 && o.mv24.mark && o.tame24 > 0) { const mk = o.mv24.mark; ctx.save(); ctx.globalAlpha = 0.45 + Math.sin(t * 20) * 0.25; ctx.fillStyle = '#ff3a5a'; ctx.beginPath(); ctx.ellipse(mk.x, mk.gy - 3, 34, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    return r;
  };
}
function m24Bang(x, y, t) {
  ctx.save(); ctx.translate(x, y + Math.sin(t * 12) * 2);
  ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = '#2a1a3a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2a1a3a'; ctx.font = '900 18px "M PLUS Rounded 1c", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', 0, 1);
  ctx.restore();
}
// ゆきだるマンの ゆきだまは 白く
{
  const _dt2 = drawThing;
  drawThing = function (o, t) {
    if (o.t === 'rollrock' && o.snow24) {
      ctx.save(); ctx.translate(o.x + 22, o.y + 22); ctx.rotate(o.rot || 0);
      if (ART.snowball) drawImg('snowball', -24, -24, 48, 48);
      else { ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#9ab8d8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      ctx.restore(); return;
    }
    return _dt2(o, t);
  };
}

// ======================================================================
// ボス
// ======================================================================
function m24BossBase(o) {
  switch (o.type) {
    case 'slimeking': return 'boss_slime';
    case 'boss': return world.def.id === 12 ? 'boss_maou2' : 'boss_maou';
    case 'hone': { const bi = bossInfo(); return bi && bi.art ? bi.art : null; }
    case 'yurei': return 'boss_yurei';
    case 'kabuto': return 'boss_kabuto';
    case 'queen': return 'boss_queen';
    case 'medama': return 'boss_eye';
    case 'kage': return 'boss_kage';
  }
  return null;
}
// ふつうの 状態(この 時だけ 新しい 技を はじめる)
const M24_IDLE = { slimeking: 'wait', boss: 'walk', hone: 'walk', kabuto: 'walk', yurei: 'float', queen: 'float', medama: 'float', kage: 'walk' };
const M24_FLYB = { yurei: 1, queen: 1, medama: 1 };
// 体力 2/3 で A、1/3 で B が ふえる。sub は 名札の 下の よけかた
const M24_BMOVES = {
  46: { A: 'slime_spray', B: 'slime_roll', subA: 'みどりの つぶが とぶ! おちる ばしょを よけよう', subB: 'ころがって くる! ジャンプで とびこえよう' },
  8: { A: 'maou_wave', B: 'maou_ring', subA: 'つえで ゆかを たたくと なみ! とびこえよう', subB: 'まほうの わ! すきまに 入るか けんで けそう' },
  12: { A: 'maou2_home', B: 'maou2_warp', subA: 'おいかける やみだま! けんで けせるよ', subB: 'むらさきの わの 上に あらわれる! はなれよう' },
  58: { A: 'kara_pebble', B: 'kara_geyser', subA: 'すなの つぶて! よく みて よけよう', subB: 'ゆかが ひかったら すなが ふきだす! はなれよう' },
  17: { A: 'kabuto_leap', B: 'kabuto_kids', subA: 'かげの ばしょに おちてくる! 着地の あとが チャンス', subB: 'こカブトを よんだ! ふんで やっつけよう' },
  21: { A: 'goro_stomp', B: 'goro_boulder', subA: 'じだんだ! 足を あげたら ジャンプ!', subB: 'いわが 2つ ころがる! じゅんばんに とびこえよう' },
  23: { A: 'yurei_ring', B: 'yurei_wax', subA: 'ひの わ! すきまに 入ろう', subB: 'ろうの しずく! 影の ばしょから はなれよう' },
  30: { A: 'queen_needle', B: 'queen_double', subA: 'はりの あめ! 影の ない ところへ', subB: 'とっしんが 2かい! 2かいめの あとが チャンス' },
  62: { A: 'munya_pillow', B: 'munya_roll', subA: 'まくらが とんでくる! ゆっくりだよ', subB: 'ねがえりで ころがる! とびこえて、ねたら チャンス' },
  37: { A: 'eye_dust', B: 'eye_double', subA: 'ほしくずが ふる! 影から はなれよう', subB: 'はしらが 2本! 点線の 外へ' },
  64: { A: 'perari_pages', B: 'perari_ink', subA: 'ひくい ページは ジャンプ、たかい ページは しゃがまず そのまま!', subB: 'インクの たま! よく みて よけよう' },
  44: { A: 'kage_clone', B: 'kage_hands', subA: 'かげの ぶんしんが はしる! とびこえよう', subB: 'ゆかから かげの て! まるい 影から はなれよう' },
};
function m24BossDef() { return world && world.def && M24_BMOVES[world.def.id]; }

function m24BossPose(o) {
  if (o.roar24 > 0) return 'angry';
  if (o.pose24T > 0 && o.pose24) return o.pose24;
  if (o.mv24 && o.tame24 > 0) return 'tame';
  if (o.mv24) return 'atk';
  const s = o.state, ty = o.type;
  if (o.invT > (ty === 'hone' ? 1.3 : 0.7)) return 'hurt';
  if (s === 'stun' || s === 'recover' || s === 'dizzy') return 'hurt';
  const TAME = { kabuto: ['aim'], queen: ['aim'], medama: ['charge'], yurei: ['aim'], kage: ['crouch', 'throw'], hone: ['throw'] }[ty] || [];
  const ATK = { kabuto: ['charge'], queen: ['dive'], medama: ['beam'], yurei: ['swoop'], kage: ['leap'], hone: ['leap', 'burrow'], slimeking: ['bigjump'] }[ty] || [];
  if (TAME.includes(s)) return 'tame';
  if (ATK.includes(s)) return 'atk';
  if (ty === 'slimeking' && s === 'wait' && o.timer < 0.3) return 'tame';
  if (ty === 'boss' && s === 'walk' && o.timer < 0.3) return 'tame';
  if ((o.phase24 || 1) >= 3) return 'angry';
  return null;
}
function m24BossTick(o, dt) {
  if (o.pose24T > 0) o.pose24T -= dt;
  if (o.tame24 > 0) o.tame24 = Math.max(0, o.tame24 - dt);
  if (o.say24) { o.say24.t -= dt; if (o.say24.t <= 0) { bossSay(o, o.say24.key); o.say24 = null; } }
  // もとの こうげきを うった しゅんかん → 攻撃の コマ
  if (o.casts !== undefined && o.c24 !== undefined && o.casts !== o.c24 && !o.mv24) m24Pose(o, ['yurei', 'queen', 'medama'].includes(o.type) && o.state === 'aim' ? 'tame' : 'atk', 0.35);
  o.c24 = o.casts;
  const max = o.maxHp || 1, ph = o.hp <= max / 3 ? 3 : o.hp <= max * 2 / 3 ? 2 : 1;
  o.phase24 = o.phase24 || 1;
  if (ph > o.phase24 && !o.dying) { o.phase24 = ph; o.roarWait24 = ph; o.mv24 = null; o.tame24 = 0; }
  // 3だんかいめ: あたまから 湯気
  if ((o.phase24 >= 3 || o.roar24 > 0) && Math.random() < dt * 6) parts.push({ x: o.x + o.w / 2 + rnd(-o.w / 3, o.w / 3), y: o.y + 6, vx: rnd(-20, 20), vy: rnd(-90, -50), life: 0.6, max: 0.6, color: 'rgba(255,255,255,.75)', size: rnd(4, 7), g: 0, puff: true });
}
function m24ReadyFor(o) {
  const idle = M24_IDLE[o.type];
  if (o.state !== idle) return false;
  if (o.type === 'boss' && (o.alpha ?? 1) < 1) return false;
  if (!M24_FLYB[o.type] && !o.onGround) return false;
  return true;
}
function m24StartRoar(o) {
  const ph = o.roarWait24; o.roarWait24 = 0; m24Count('roar' + ph);
  o.roar24 = 1.0; o.invT = Math.max(o.invT || 0, 1.15); o.vx = 0;
  cam.shake = Math.max(cam.shake, 0.5); sfx('boom', 0.6); sfx('powerup', 0.7); hitStop(0.06);
  m24Ring(o);
  // ちかくに いる ハルは そっと おしもどす(いたくない)
  const ex = o.x + o.w / 2, px = P.x + P.w / 2;
  if (!P.dead && Math.abs(px - ex) < 140 && Math.abs(P.y + P.h / 2 - (o.y + o.h / 2)) < 140) { P.vx = Math.sign(px - ex || 1) * 420; P.vy = Math.min(P.vy, -300); P.onGround = false; }
  // せりふは 札(よけかた)が きえてから
  o.saidHalf = true; if (ph >= 3) o.saidPinch = true; o.say24 = { key: ph === 2 ? 'half' : 'pinch', t: 2.3 };
  const bd = m24BossDef();
  if (bd) toast = { text: isEN() ? T(bossName(o)) + ' is angry!' : bossName(o) + 'が おこった!', sub: ph === 2 ? bd.subA : bd.subB, t: 2.2 };
  o.mvT24 = 1.6;
}
{
  const _be = bossExtra;
  bossExtra = function (o, dt, px, py, ex, ey) {
    m24BossTick(o, dt);
    if (o.roar24 > 0) {
      o.roar24 -= dt; o.vx = 0;
      if (!M24_FLYB[o.type]) m24Grav(o, dt);
      if (o.roar24 <= 0) { o.timer = Math.max(o.timer || 0, 0.6); }
      return true;
    }
    if (o.roarWait24 && m24ReadyFor(o)) { m24StartRoar(o); return true; }
    if (o.mv24) {
      // たたかれて 状態が かわったら おしまい
      if (o.state !== 'm24') { o.mv24 = null; o.tame24 = 0; }
      else { const r = m24BossMove(o, dt, px, py, ex, ey); if (r) m24BossEnd(o, r); return true; }
    }
    const bd = m24BossDef();
    if (bd && (o.phase24 || 1) >= 2 && !o.roarWait24) {
      o.mvT24 = (o.mvT24 ?? 2) - dt;
      if (o.mvT24 <= 0 && m24ReadyFor(o)) {
        const k = o.phase24 >= 3 ? ((o.mvN24 = (o.mvN24 || 0) + 1) % 3 === 0 ? bd.A : bd.B) : bd.A;
        o.mv24 = { k, t: 0, step: 0, px, py, sv: o.state };
        o.state = 'm24'; o.vx = 0; m24Count(k);
        m24Tame(o, k === 'queen_double' || k === 'eye_double' ? 0.5 : 0.75);
        return true;
      }
    }
    return _be(o, dt, px, py, ex, ey);
  };
}
// r: true=もとの 状態へ / 'stun'=目を まわす(チャンス)/ 'keep'=技の 中で 状態を きめた
function m24BossEnd(o, r) {
  const sv = o.mv24 ? o.mv24.sv : M24_IDLE[o.type];
  o.mv24 = null; o.tame24 = 0;
  o.mvT24 = (o.phase24 >= 3 ? 5.2 : 6.5) + rnd(0, 1.2);
  if (r === 'keep') return;
  if (r === 'stun') { o.state = 'stun'; o.timer = 1.4; o.vx = 0; return; }
  o.state = sv; o.timer = Math.max(o.timer || 0, 0.7);
  if (o.type === 'queen' || o.type === 'medama') o.timer = Math.max(o.timer, 1.0);
}
function m24BossMove(o, dt, px, py, ex, ey) {
  const m = o.mv24; if (!(o.tame24 > 0)) m.t += dt; // m.t は ため の あとから 数える
  const [L0, R0] = m24Arena(o);
  const fly = !!M24_FLYB[o.type];
  if (o.tame24 > 0) {
    if (!fly) { o.vx = 0; m24Grav(o, dt); }
    if (o.type === 'slimeking') o.sq = 0.6;
    if (Math.random() < dt * 14) parts.push({ x: ex + rnd(-o.w / 2, o.w / 2), y: o.y + rnd(0, o.h), vx: 0, vy: rnd(-60, -20), life: 0.3, max: 0.3, color: '#ff8aa0', size: 3, g: 0, star: true });
    // ため の 間に ねらいを きめる
    if (m.tx === undefined) m.tx = clamp(px, L0 + 40, R0 - 40);
    return false;
  }
  const gyP = m24Gy(px, P);
  switch (m.k) {
    // ---- スライム大王 ----
    case 'slime_spray': {
      if (m.step === 0) { m.step = 1; o.vy = -520; o.vx = 0; sfx('jump', 0.7); }
      m24Grav(o, dt);
      if (m.step === 1 && m.t > 0.15 && o.onGround && o.vy >= 0) {
        m.step = 2; o.sq = 1; sfx('stomp', 0.6); cam.shake = Math.max(cam.shake, 0.2);
        for (const v of [-260, -130, 130, 260]) m24Spit(ex, o.y + 10, v, -560, '#8cff6a', 1200, 3);
        m.end = m.t + 0.5;
      }
      return m.step === 2 && m.t > m.end;
    }
    case 'slime_roll': {
      if (m.step === 0) { m.step = 1; m.dir = px > ex ? 1 : -1; sfx('dash', 0.6); }
      o.vx = m.dir * 340; o.sq = 0.35; m24Grav(o, dt);
      if (Math.random() < dt * 20) dust(ex - m.dir * 30, o.y + o.h, 1);
      if (o.x <= L0 + 2 || o.x + o.w >= R0 - 2 || o.hitWall || m.t > 2.4) { o.x = clamp(o.x, L0, R0 - o.w); o.vx = 0; cam.shake = Math.max(cam.shake, 0.3); sfx('boom', 0.8); dust(m.dir > 0 ? o.x + o.w : o.x, o.y + o.h / 2, 8); o.state = 'wait'; o.timer = 1.5; o.sq = 1; return 'keep'; }
      return false;
    }
    // ---- まおう ----
    case 'maou_wave': {
      o.vx = 0; m24Grav(o, dt);
      if (m.step === 0) { m.step = 1; cam.shake = Math.max(cam.shake, 0.25); sfx('boom', 1.1); for (const s of [-1, 1]) m24Wave(ex + s * 30, o.y + o.h, s, 250, 'ice', 2.4); }
      return m.t > 0.6;
    }
    case 'maou_ring': {
      o.vx = 0; m24Grav(o, dt);
      if (m.step === 0) { m.step = 1; const a0 = Math.atan2(py - ey, px - ex) + Math.PI / 8; for (let i = 0; i < 8; i++) { const a = a0 + i * Math.PI / 4; m24Magic(ex, o.y + 30, Math.cos(a) * 140, Math.sin(a) * 140, false, 5); } sfx('fire', 0.8); m24Ring(o); }
      return m.t > 0.7;
    }
    case 'maou2_home': {
      o.vx = 0; m24Grav(o, dt);
      if (m.step === 0) { m.step = 1; for (const s of [-1, 1]) m24Home(ex + s * 30, o.y + 30, 120); sfx('fire', 0.6); }
      return m.t > 0.6;
    }
    case 'maou2_warp': {
      // すうっと きえて、ハルの うしろの むらさきの わに あらわれ、左右に かげの なみ
      if (m.step === 0) { m.step = 1; m.wx = clamp(px - (P.face || 1) * 150, L0 + 40, R0 - 40); m.warn = 0.85; sfx('fire', 0.5); }
      if (m.step === 1) { o.alpha = Math.max(0, (o.alpha ?? 1) - dt * 3); m.warn -= dt; if (m.warn <= 0) { m.step = 2; o.x = m.wx - o.w / 2; o.y = m24Gy(m.wx, o) - o.h; o.vy = 0; o.alpha = 1; sparkle(m.wx, o.y + o.h / 2, 14); sfx('boom', 1.2); for (const s of [-1, 1]) world.ents.push({ id: ++uid, t: 'swave', x: m.wx + s * 30 - 12, y: o.y + o.h - 30, w: 24, h: 30, vx: s * 250, life: 1.3, small: true, b24: 1 }); m.end = m.t + 0.6; } return false; }
      m24Grav(o, dt);
      return m.t > m.end;
    }
    // ---- とりでの ぬし(ほね) ----
    case 'kara_pebble': {
      o.vx = 0; m24Grav(o, dt);
      if (m.step === 0) { m.step = 1; const dx = px - ex; for (const k of [0.55, 0.85, 1.15, 1.45]) m24Spit(ex, o.y + 10, clamp(dx * k, -380, 380), -620, '#d8a050', 1300, 3); sfx('swing', 0.8); }
      return m.t > 0.55;
    }
    case 'kara_geyser': {
      o.vx = 0; m24Grav(o, dt);
      if (m.step === 0) { m.step = 1; sfx('break', 1.2); const xs = [px, px - 150, px + 150]; xs.forEach((x, i) => { const xx = clamp(x, L0 + 30, R0 - 30); m24Col(xx, m24Gy(xx, P), 0.85 + i * 0.25, 0.5, 'sand', 64); }); }
      return m.t > 0.7;
    }
    case 'goro_stomp': {
      o.vx = 0; m24Grav(o, dt);
      if (m.step === 0) { m.step = 1; cam.shake = Math.max(cam.shake, 0.5); sfx('boom', 0.6); hitStop(0.05); for (const s of [-1, 1]) for (let k = 0; k < 7; k++) parts.push({ x: ex + s * (30 + k * 30), y: o.y + o.h - 4, vx: s * 140, vy: -80 - k * 8, life: 0.45, max: 0.45, color: '#c9a27a', size: 5, g: 600 }); if (!P.dead && P.onGround && Math.abs(px - ex) < 260 && Math.abs(P.y + P.h - (o.y + o.h)) < TILE) hurtPlayer(ex); }
      return m.t > 0.6;
    }
    case 'goro_boulder': {
      o.vx = 0; m24Grav(o, dt);
      const dir = m.dir || (m.dir = px > ex ? 1 : -1);
      if (m.step === 0 || (m.step === 1 && m.t > 0.75)) { m.step++; world.ents.push({ id: ++uid, t: 'rollrock', x: ex + dir * 44 - 22, y: o.y + o.h - 46, w: 44, h: 44, vx: dir * 230, vy: 0, rot: 0, sp: 230, dir, b24: 1 }); sfx('boom', 1.3); }
      return m.t > 1.2;
    }
    case 'munya_pillow': {
      o.vx = 0; m24Grav(o, dt);
      if (m.step === 0) { m.step = 1; const dx = px - ex; for (const k of [0.6, 1.0, 1.4]) world.ents.push({ id: ++uid, t: 'spit', x: ex - 13, y: o.y, w: 26, h: 26, vx: clamp(dx * k * 0.6, -200, 200), vy: -380, g: 450, life: 5, col: '#f4f0ff', b24: 1 }); sfx('swing', 0.6); world.bossSay = { o, text: 'むにゃ… まくら なげ…', t: 1.4 }; }
      return m.t > 0.6;
    }
    case 'munya_roll': {
      if (m.step === 0) { m.step = 1; m.dir = px > ex ? 1 : -1; sfx('dash', 0.5); }
      o.vx = m.dir * 300; m24Grav(o, dt);
      if (Math.random() < dt * 16) dust(ex, o.y + o.h, 1);
      if (o.x <= L0 + 2 || o.x + o.w >= R0 - 2 || o.hitWall || m.t > 1.6) { o.x = clamp(o.x, L0, R0 - o.w); o.vx = 0; sfx('bump', 0.7); o.state = 'recover'; o.timer = 2.0; o.doze = true; world.bossSay = { o, text: 'むにゃ… すや…', t: 1.6 }; return 'keep'; }
      return false;
    }
    case 'perari_pages': {
      o.vx = 0; m24Grav(o, dt);
      const gy = o.y + o.h, dir = m.dir || (m.dir = px > ex ? 1 : -1);
      if (m.step === 0) { m.step = 1; m24Fly(ex + dir * 40, gy - 24, dir * 250, 'page', 44, 34, 4); sfx('swing', 1.4); world.bossSay = { o, text: 'ひくい ページ!', t: 1.0 }; }
      if (m.step === 1 && m.t > 1.0) { m.step = 2; m24Fly(ex + dir * 40, gy - 118, dir * 250, 'page', 44, 34, 4); sfx('swing', 1.4); world.bossSay = { o, text: 'たかい ページ!', t: 1.0 }; }
      return m.t > 1.4;
    }
    case 'perari_ink': {
      o.vx = 0; m24Grav(o, dt);
      if (m.step === 0) { m.step = 1; const dx = px - ex; for (const k of [0.7, 1.0, 1.3]) m24Spit(ex, o.y + 10, clamp(dx * k, -360, 360), -600, '#3a2a5a', 1300, 3); sfx('fire', 1.3); }
      return m.t > 0.55;
    }
    // ---- おおカブト ----
    case 'kabuto_leap': {
      if (m.step === 0) { m.step = 1; o.vy = -900; o.vx = clamp((m.tx - ex) / 0.9, -420, 420); sfx('jump', 0.5); }
      m24Grav(o, dt); o.x = clamp(o.x, L0, R0 - o.w);
      if (m.t > 0.2 && o.onGround && o.vy >= 0) {
        cam.shake = Math.max(cam.shake, 0.45); sfx('boom', 0.7); hitStop(0.05); dust(ex, o.y + o.h, 12);
        if (!P.dead && P.onGround && Math.abs(px - ex) < 120) hurtPlayer(ex);
        o.vx = 0; o.timer = 1.4; return 'stun';
      }
      return false;
    }
    case 'kabuto_kids': {
      o.vx = 0; m24Grav(o, dt);
      if (m.step === 0) { m.step = 1; sfx('dash', 0.5); const n = world.ents.filter(e => e.t === 'enemy' && e.type === 'beetle' && !e.dying && !e.gone).length; for (const s of [-1, 1]) { if (n >= 2) break; const e = spawn({ kind: 'enemy', type: 'beetle', x: Math.floor((s < 0 ? L0 + 40 : R0 - 40) / TILE), y: 2, opt: {} }); if (e) { e.awake = true; e.face = -s; world.ents.push(e); } } }
      return m.t > 0.6;
    }
    // ---- ゆうれい王 ----
    case 'yurei_ring': {
      o.alpha = lerp(o.alpha ?? 0.5, 0.7, dt * 4);
      if (m.step === 0) { m.step = 1; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + 0.2; m24Magic(ex, ey, Math.cos(a) * 125, Math.sin(a) * 125, true, 5); } sfx('fire', 1.4); m24Ring(o); }
      return m.t > 0.7;
    }
    case 'yurei_wax': {
      if (m.step === 0) { m.step = 1; sfx('swing', 1.2); [0, -1, 1].forEach((s, i) => { const x = clamp(px + s * 130, L0 + 20, R0 - 20); m24Drop(x, m24Gy(x, P), 0.8 + i * 0.18, 'wax'); }); }
      return m.t > 0.7;
    }
    // ---- じょおうバチ ----
    case 'queen_needle': {
      if (m.step === 0) { m.step = 1; sfx('swing', 1.5); const off = rnd(0, 1.5 * TILE); for (let i = 0; i < 5; i++) { const x = L0 + off + (i + 0.5) * (R0 - L0 - 1.5 * TILE) / 5; m24Drop(x, m24Gy(x, P), 0.8 + i * 0.12, 'needle'); } }
      return m.t > 0.8;
    }
    case 'queen_double': {
      // 1かいめの とっしんは はねかえって もどる → 2かいめは もとの とっしん(ささって チャンス)
      if (m.step === 0) { m.step = 1; const gy = m24Gy(m.tx, o); const a = Math.atan2(gy - (o.y + o.h), m.tx - ex); m.vx = Math.cos(a) * 600; m.vy = Math.sin(a) * 600; m.y0 = o.y; sfx('dash', 0.8); }
      if (m.step === 1) { o.x += m.vx * dt; o.y += m.vy * dt; o.x = clamp(o.x, L0, R0 - o.w); const gy = m24Gy(ex, o); if (o.y + o.h >= gy - 30 || m.t > 1.3) { m.step = 2; dust(ex, gy, 8); sfx('bump', 0.8); } return false; }
      o.y = lerp(o.y, o.y0, Math.min(1, dt * 4));
      if (Math.abs(o.y - o.y0) < 10 || m.t > 2.4) { o.state = 'aim'; o.timer = 0.55; o.tgx = clamp(px, L0 + 40, R0 - 40); sfx('dash', 1.3); return 'keep'; }
      return false;
    }
    // ---- ほしめだま ----
    case 'eye_dust': {
      if (m.step === 0) { m.step = 1; sfx('star', 1.2); const off = rnd(0, 2 * TILE); for (let i = 0; i < 5; i++) { const x = L0 + off + (i + 0.5) * (R0 - L0 - 2 * TILE) / 5; m24Drop(x, m24Gy(x, P), 0.85 + ((i * 2) % 5) * 0.1, 'star'); } }
      return m.t > 0.8;
    }
    case 'eye_double': {
      // もとの ひかりの はしら と いっしょに、にげる がわにも もう1本
      const other = clamp(px + (px < (L0 + R0) / 2 ? 170 : -170), L0 + 40, R0 - 40);
      m24Col(other, m24Gy(other, P), 1.0, 0.7, 'star', 80);
      o.state = 'charge'; o.timer = 1.0; o.beamX = clamp(px, L0 + 40, R0 - 40); sfx('powerup', 0.6);
      return 'keep';
    }
    // ---- かげの おう ----
    case 'kage_clone': {
      o.vx = 0; m24Grav(o, dt);
      const gy = o.y + o.h;
      if (m.step === 0) { m.step = 1; m24Fly(L0 - 30, gy - 45, 360, 'clone', 44, 90, (R0 - L0 + 60) / 360); sfx('dash', 0.6); }
      if (m.step === 1 && m.t > 0.9) { m.step = 2; m24Fly(R0 + 30, gy - 45, -360, 'clone', 44, 90, (R0 - L0 + 60) / 360); sfx('dash', 0.6); }
      return m.t > 1.3;
    }
    case 'kage_hands': {
      o.vx = 0; m24Grav(o, dt);
      if (m.step === 0) { m.step = 1; sfx('fire', 0.5); [0, -1, 1].forEach((s, i) => { const x = clamp(px + s * 150, L0 + 30, R0 - 30); pushShand(x, Math.floor(m24Gy(x, P) / TILE), 0.85 + i * 0.22); }); }
      return m.t > 0.8;
    }
  }
  return true;
}
// ボスの 絵: いまの ポーズの コマが あれば それで 描く(同じ 縮尺で 切ってある)
let M24_POSE = null;
{
  const _df = drawFit;
  drawFit = function (name, cx, bottom, h, flip = false, alpha = 1) {
    if (M24_POSE && name === M24_POSE.base) {
      const pim = ART[M24_POSE.name], bim = ART[name];
      if (pim && bim && bim.naturalHeight) return _df(M24_POSE.name, cx, bottom, h * pim.naturalHeight / bim.naturalHeight, flip, alpha);
    }
    return _df(name, cx, bottom, h, flip, alpha);
  };
  const _de = drawEnemy;
  drawEnemy = function (o, t) {
    if (!o.d || !o.d.boss || o.dying || o.state === 'sleep') return _de(o, t);
    const base = m24BossBase(o), pose = m24BossPose(o);
    let swap = null;
    if (base && pose && ART[base + '_' + pose]) {
      M24_POSE = { base, name: base + '_' + pose };
      if (o.type === 'kage') { swap = ART.boss_kage; ART.boss_kage = ART[M24_POSE.name]; }
    }
    const tame = o.tame24 > 0 || (pose === 'tame');
    try {
      if (tame || o.roar24 > 0) {
        ctx.save(); ctx.translate(Math.sin(t * 70) * (o.roar24 > 0 ? 4 : 2.5), 0);
        _de(o, t);
        ctx.restore();
      } else _de(o, t);
    } finally { M24_POSE = null; if (swap) ART.boss_kage = swap; }
    // 怒りの 光(赤い わ)と「!」
    if (o.roar24 > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, o.roar24 * 2) * 0.5; ctx.strokeStyle = '#ff4a6a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w * (1.4 - o.roar24 * 0.5), o.h * (1.2 - o.roar24 * 0.4), 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    if (o.mv24 && o.tame24 > 0) m24Bang(o.x + o.w / 2, o.y - 34, t);
    // ため の 間の ねらい(カブトの ジャンプ・じょおうの 2かい とっしん)
    if (o.mv24 && o.mv24.tx !== undefined && (o.mv24.k === 'kabuto_leap' || o.mv24.k === 'queen_double') && o.mv24.step <= 1) {
      const gy = m24Gy(o.mv24.tx, o); ctx.save(); ctx.globalAlpha = 0.45 + Math.sin(t * 20) * 0.25; ctx.fillStyle = '#ff3a5a'; ctx.beginPath(); ctx.ellipse(o.mv24.tx, gy - 3, 40, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    if (o.mv24 && o.mv24.k === 'maou2_warp' && o.mv24.step === 1) {
      const gy = m24Gy(o.mv24.wx, o); ctx.save(); ctx.globalAlpha = 0.45 + Math.sin(t * 20) * 0.25; ctx.fillStyle = '#9a6ad8'; ctx.beginPath(); ctx.ellipse(o.mv24.wx, gy - 3, 44, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  };
}
// 怒りの わ(画面の 中の 広がる わ)
{
  const _dbu = drawBossUI;
  drawBossUI = function (t) {
    if (world.ring24 && world.ring24.length) {
      for (const r of world.ring24) { r.t = world.time - r.s; const k = r.t / 0.6; if (k >= 1) continue; ctx.save(); ctx.globalAlpha = (1 - k) * 0.7; ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(r.x, r.y, 30 + k * 160, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
      world.ring24 = world.ring24.filter(r => r.t < 0.6);
    }
    return _dbu(t);
  };
}

// ======================================================================
// ボスの 部屋の 会話
// ======================================================================
// [だれ, 日本語, English]。first=はじめて(3〜4行)/ again=2回目から(ひとこと)/ after=たおした あとの ハルの ひとこと
const BOSS_TALK = {
  46: { who: 'slime', first: [
    ['slime', 'もぐもぐ… あっ! ここまで きちゃったの?', 'Munch munch... Oh! You made it all the way here?'],
    ['haru', 'かけらを かえして! それは そらの ほしだよ。', 'Give back the shard! It belongs to the sky.'],
    ['slime', 'やだもんね! さいごの ひとくち なんだもん!', 'No way! It\'s my very last bite!'],
  ], again: ['slime', 'また きたの? おやつは わたさないもんね!', 'You again? I\'m not sharing my snack!'],
  after: ['haru', 'おなかが すいたら、おにぎり わけて あげるね。', 'If you get hungry, I\'ll share my rice ball.'] },
  8: { who: 'maou', first: [
    ['maou', 'ふはは! わたしの しろを ぬけてくるとは なかなかだ。', 'Hah! Not bad, getting through my castle.'],
    ['haru', 'ほしの ひかりを ひとりじめ しないで!', 'Stop keeping the starlight to yourself!'],
    ['maou', 'ひとりじめ では ない! あずかって いるのだ!', 'I\'m not keeping it! I\'m... looking after it!'],
    ['maou', 'さあ、まおうさまの まほうを みよ!', 'Now, behold the Night Lord\'s magic!'],
  ], again: ['maou', 'また きたか! なんど きても おなじだ!', 'Back again? It will end the same way!'],
  after: ['haru', 'まおう… ほんとうは なにか こわいの?', 'Night Lord... are you scared of something?'] },
  12: { who: 'maou', first: [
    ['maou', '……ハル……か……。', '...Haru...is it...'],
    ['haru', 'まおう! その くろい もやから はなれて!', 'Night Lord! Get away from that black mist!'],
    ['maou', '……ひかりは……やみに……。(にげ…ろ…)', '...all light...into darkness... (run...away...)'],
    ['haru', 'にげないよ。ぜったい たすける!', 'I won\'t run. I\'ll save you!'],
  ], again: ['maou', '……ひかりを……よこせ……。', '...give...me...the light...'],
  after: ['haru', 'もう だいじょうぶ。もやは きえたよ。', 'You\'re okay now. The mist is gone.'] },
  58: { who: 'karakara', first: [
    ['karakara', 'カラカラ。とりでの おくまで よく きたね。', 'Clack clack. You made it deep into my fort.'],
    ['haru', 'ほねを みがくのは もう おしまい!', 'No more polishing bones with the shard!'],
    ['karakara', 'では わがはいの すなの ダンスを みせて しんぜよう!', 'Then allow me to show you my sand dance!'],
  ], again: ['karakara', 'カラカラ。また おどりに きたのかね?', 'Clack clack. Back for another dance?'],
  after: ['haru', 'ダンス、ちょっと たのしかったよ。', 'Your dance was kind of fun.'] },
  17: { who: 'kabuto', first: [
    ['kabuto', 'ブオオ! あらしを ぬけて きたか! いい こんじょうだ!', 'Bwooh! You came through the storm! Good guts!'],
    ['haru', 'かけらを かえして。しょうぶなら うけるよ!', 'Give back the shard. I\'ll take your challenge!'],
    ['kabuto', 'よし! おれの つのを とめて みろ!', 'Good! Try to stop my horn!'],
  ], again: ['kabuto', 'ブオオ! もう いっかい しょうぶだ!', 'Bwooh! One more match!'],
  after: ['haru', 'つよかった! でも かけらは もらうね。', 'You were strong! But I\'m taking the shard.'] },
  21: { who: 'goronta', first: [
    ['goronta', 'ひっく…。ここまで おいかけて きたの…?', 'Hic... you followed me all the way here...?'],
    ['haru', 'こわく ないよ。かけらを そらに かえそう?', 'It\'s okay. Shall we give the shard back to the sky?'],
    ['goronta', 'やだー! いわ ころがして とおせんぼ するもん!', 'Nooo! I\'ll roll rocks and block the way!'],
  ], again: ['goronta', 'うわーん! また きたあ!', 'Waaah! You came back!'],
  after: ['haru', 'もう なかないで。よるも ほしが いっしょだよ。', 'Don\'t cry. The stars will be with you at night.'] },
  23: { who: 'yurei', first: [
    ['yurei', 'ひっ…! こ、ここまで きちゃったの…?', 'Eek...! Y-you came all the way here...?'],
    ['haru', 'かくれなくて いいよ。おはなし したいの。', 'You don\'t have to hide. I just want to talk.'],
    ['yurei', 'だめ…! みられたら、はずかしくて きえちゃう…!', 'No...! If you see me, I\'ll fade away from shame!'],
  ], again: ['yurei', 'み、みないでって いったのに…!', 'I-I told you not to look...!'],
  after: ['haru', 'ほら、だれも わらって ないよ。', 'See? No one is laughing.'] },
  30: { who: 'queen', first: [
    ['queen', 'ブブブ! あたしの すまで くるなんて、なまいきね!', 'Bzzz! Coming all the way to my hive? How cheeky!'],
    ['haru', 'かけらの かんむりは つくらせないよ!', 'I won\'t let you make a crown out of the shards!'],
    ['queen', 'ほしい ものは ほしいの! はりで おいはらうわ!', 'I want what I want! I\'ll chase you off with my stinger!'],
  ], again: ['queen', 'ブブブ! また かんむりの じゃまを しに きたの?', 'Bzzz! Here to ruin my crown again?'],
  after: ['haru', 'キラキラは よぞらで いっしょに みようね。', 'Let\'s watch the sparkles together in the night sky.'] },
  62: { who: 'munyaru', first: [
    ['munyaru', 'むにゃ… また おこされた…。', 'Mmnya... woken up again...'],
    ['haru', 'その まくら、ほしの かけらでしょ!', 'That pillow is a star shard, isn\'t it!'],
    ['munyaru', 'ふわあ…。ねむい けど… ちょっとだけ あいて する…。', 'Yaaawn... I\'m sleepy, but... I\'ll play a little...'],
  ], again: ['munyaru', 'むにゃ…。また きたの…? ねかせて…。', 'Mmnya... you again...? Let me sleep...'],
  after: ['haru', 'おやすみ。まくらは ふつうの にしてね。', 'Good night. Please use a normal pillow.'] },
  37: { who: 'medama', first: [
    ['medama', 'みている。ここまでの こと、ぜんぶ みていたぞ。', 'I see. I saw everything you did to get here.'],
    ['haru', 'みてたなら わかるでしょ。とおして!', 'Then you know why I\'m here. Let me through!'],
    ['medama', 'めいれいは めいれい。ここは とおさない!', 'Orders are orders. You shall not pass!'],
  ], again: ['medama', 'みている…。また きたな。', 'I see you... You came back.'],
  after: ['haru', 'すこし めを とじて やすもうね。', 'Close your eye and rest a little.'] },
  64: { who: 'perari', first: [
    ['perari', 'やあやあ! ここまで きた! すごい すごい!', 'Hey hey! You made it! Amazing, amazing!'],
    ['haru', 'かげの おうの ところへ いかせて!', 'Let me go to the Shadow King!'],
    ['perari', 'だめだめ! もんばんの しごと しなきゃ! …たぶん!', 'Nope nope! I have to do my gatekeeper job! ...Probably!'],
  ], again: ['perari', 'やあやあ! また きたね! しょうぶ しょうぶ!', 'Hey hey! You\'re back! Let\'s battle!'],
  after: ['haru', 'おしゃべり、また ゆっくり きかせてね。', 'Tell me more stories some other time.'] },
  44: { who: 'kage', first: [
    ['kage', 'きたか、ハル。ここが さいごの へやだ。', 'So you came, Haru. This is the final room.'],
    ['haru', 'あなたの こと、かべの えで みたよ。', 'I saw you in the wall paintings.'],
    ['kage', '…みた だと? ならば わかるだろう。ひかりは いらぬ!', '...You saw? Then you understand. I need no light!'],
    ['haru', 'ちがう。いっしょに いようって いいに きたの!', 'No. I came to say let\'s be together!'],
  ], again: ['kage', 'また きたか、ハル。', 'You came again, Haru.'],
  after: ['haru', 'もう ひとりじゃ ないよ。', 'You\'re not alone anymore.'] },
};
const talk24 = { on: false, lines: null, i: 0, shown: 0, t: 0, key: null, o: null, short: false };
function m24NoTalk() { return typeof window !== 'undefined' && window.__noBossTalk; }
function m24StartTalk(o) {
  const id = world.def.id, d = BOSS_TALK[id];
  if (!d || m24NoTalk() || world.def.roam || world.def.daily || world.def.tutorial) return false;
  const key = 'talk24_' + id, seen = save.seen && save.seen[key];
  talk24.on = true; talk24.key = key; talk24.o = o; talk24.i = 0; talk24.shown = 0; talk24.t = 0;
  talk24.short = !!seen; talk24.lines = seen ? [d.again] : d.first;
  world.bossSay = null;
  return true;
}
function m24TalkLine() { const l = talk24.lines && talk24.lines[talk24.i]; return l ? (isEN() ? l[2] : l[1]) : ''; }
function m24TalkNext() {
  const len = m24TalkLine().length;
  if (talk24.shown < len) { talk24.shown = len; return; }
  talk24.i++; talk24.shown = 0; sfx('click', 1.2);
  if (talk24.i >= talk24.lines.length) m24TalkEnd();
}
function m24TalkEnd() {
  if (!talk24.on) return;
  talk24.on = false;
  if (talk24.key && save.seen && !save.seen[talk24.key]) { save.seen[talk24.key] = true; writeSave(); }
  if (world && world.bossCard) world.bossCard.t = 0;
  sfx('door', 0.6);
}
{
  const _bi = bossIntro;
  bossIntro = function (o) {
    _bi(o);
    if (m24StartTalk(o)) { /* 名札は 会話の あとで 出す(会話の 間は 時間が 止まる) */ }
  };
  const _bs = bossSay;
  bossSay = function (o, key) {
    _bs(o, key);
    if (key === 'defeat') { const d = BOSS_TALK[world.def.id]; if (d && d.after) world.after24 = { t: 3.2, line: d.after }; }
  };
  const _up = update;
  update = function (dt) {
    if (scene === 'play' && talk24.on && world) {
      if (consume('pause')) { m24TalkEnd(); for (const k in pressed) pressed[k] = false; return; }
      talk24.t += dt; talk24.shown += dt * (isEN() ? 55 : 28);
      if (consume('jump') || consume('ok') || consume('attack')) m24TalkNext();
      else if (talk24.short && talk24.t > 2.4) m24TalkEnd(); // 2回目からは ひとことで すぐ たたかう
      for (const q of parts) { q.life -= dt; q.vy += (q.g || 0) * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
      parts = parts.filter(q => q.life > 0);
      cam.shake = Math.max(0, cam.shake - dt);
      for (const k in pressed) pressed[k] = false;
      return;
    }
    if (scene === 'play' && world && world.bossDone && !world.clean24) { world.clean24 = true; for (const e of world.ents) if (e.b24) e.gone = true; }
    if (scene === 'play' && world && world.after24) {
      const a = world.after24; a.t -= dt;
      if (a.t <= 0) { world.after24 = null; if (!P.dead) world.bossSay = { o: P, text: isEN() ? a.line[2] : a.line[1], t: 3.0 }; }
    }
    return _up(dt);
  };
  const _dbc = drawBossCard;
  drawBossCard = function (t) { if (talk24.on) return; return _dbc(t); };
  const _dp = drawPlay;
  drawPlay = function (t) {
    _dp(t);
    if (talk24.on && world && scene === 'play') m24DrawTalk(t);
  };
}
// ハルの ひとことは ことばを そのまま(bossSay の 文は T() を 通すので 英語は そのまま 返る)
function m24DrawTalk(t) {
  const line = talk24.lines[talk24.i]; if (!line) return;
  const sp = SPEAKERS[line[0]] || SPEAKERS.narr;
  ctx.save();
  // すこし 暗く(へやは 見える)
  ctx.fillStyle = 'rgba(10,6,24,.32)'; ctx.fillRect(0, 0, VW, VH);
  // ふたりの 顔(話して いる 方を 明るく)
  const faceOf = w => { const s2 = SPEAKERS[w]; return s2 ? (ART[s2.face] ? s2.face : s2.alt) : null; };
  const left = 'haru', right = BOSS_TALK[world.def.id].who;
  for (const [w, x, flip] of [[left, 120, false], [right, VW - 120, true]]) {
    const s2 = SPEAKERS[w]; if (!s2) continue;
    const talking = w === line[0];
    ctx.save(); ctx.globalAlpha = talking ? 1 : 0.5;
    const bob = talking ? Math.sin(t * 6) * 3 : 0;
    rr(x - 70, 230 + bob, 140, 140, 22); ctx.fillStyle = s2.col; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#2a1a3a'; ctx.stroke();
    ctx.save(); rr(x - 70, 230 + bob, 140, 140, 22); ctx.clip(); if (s2.filter && !ART[s2.face]) ctx.filter = s2.filter;
    const img = faceOf(w); if (img) drawContain(img, x, 366 + bob, 132, 132, flip && !ART[s2.face] ? true : false, 1, 0);
    ctx.restore(); ctx.restore();
  }
  // ふきだし
  const bx = 40, by = VH - 150, bw = VW - 80, bh = 128;
  rr(bx, by, bw, bh, 22); ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#2a1a3a'; ctx.stroke();
  const tx = bx + 30, nx = line[0] === 'haru' ? tx : bx + bw - 230;
  if (sp.name) { rr(nx - 6, by - 20, 200, 38, 14); ctx.fillStyle = sp.col; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#2a1a3a'; ctx.stroke(); outlined(T(sp.name), nx + 94, by - 1, '#fff', '#2a1a3a', 5, fitFont(T(sp.name), 186, 20)); }
  const full = m24TalkLine(), shown = full.slice(0, Math.floor(talk24.shown)), maxW = bw - 60;
  ctx.fillStyle = '#2a1a3a'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  if (isEN()) {
    let fs = 24; ctx.font = font(fs, 800); let ls = wrapWords(ctx, full, maxW);
    while (ls.length > 2 && fs > 17) { fs--; ctx.font = font(fs, 800); ls = wrapWords(ctx, full, maxW); }
    let left2 = Math.floor(talk24.shown), y2 = by + 30;
    for (const ln of ls) { if (left2 <= 0) break; ctx.fillText(ln.slice(0, left2), tx, y2); left2 -= ln.length + 1; y2 += fs * 1.45; }
  } else {
    ctx.font = font(25, 800); let row = '', y = by + 32;
    for (const ch of shown) { if (ctx.measureText(row + ch).width > maxW && !'。、!?！？)」ー…'.includes(ch)) { const s = row.lastIndexOf(' '); if (s > row.length * 0.6) { ctx.fillText(row.slice(0, s), tx, y); row = row.slice(s + 1); } else { ctx.fillText(row, tx, y); row = ''; } y += 38; } row += ch; }
    ctx.fillText(row, tx, y);
  }
  ctx.textBaseline = 'middle';
  if (talk24.shown >= full.length) { ctx.fillStyle = '#ff7a1f'; ctx.beginPath(); const ay = by + bh - 22 + Math.sin(t * 8) * 3; ctx.moveTo(bx + bw - 40, ay); ctx.lineTo(bx + bw - 24, ay); ctx.lineTo(bx + bw - 32, ay + 10); ctx.fill(); }
  ctx.restore();
  // ふきだしを タップしても すすむ(スマホ)
  uiButtons.push({ x: bx, y: by - 20, w: bw, h: bh + 20, fn: () => m24TalkNext(), gesture: false });
  button(VW - 150, 14, 130, 40, 'スキップ', () => m24TalkEnd(), { size: 18 });
}

// 英語(toast・ふきだしは T() を 通る)
if (typeof EN_DICT !== 'undefined') Object.assign(EN_DICT, {
  'みどりの つぶが とぶ! おちる ばしょを よけよう': 'Green blobs fly! Stay away from where they land',
  'ころがって くる! ジャンプで とびこえよう': 'It rolls at you! Jump over it',
  'つえで ゆかを たたくと なみ! とびこえよう': 'A staff slam sends waves! Jump over them',
  'まほうの わ! すきまに 入るか けんで けそう': 'A ring of magic! Slip into a gap or cut it',
  'おいかける やみだま! けんで けせるよ': 'Chasing dark orbs! Your sword can cut them',
  'むらさきの わの 上に あらわれる! はなれよう': 'It appears on the purple circle! Move away',
  'すなの つぶて! よく みて よけよう': 'Sand pebbles! Watch and dodge',
  'ゆかが ひかったら すなが ふきだす! はなれよう': 'When the floor glows, sand bursts up! Move away',
  'かげの ばしょに おちてくる! 着地の あとが チャンス': 'It lands on the shadow! Strike after it lands',
  'こカブトを よんだ! ふんで やっつけよう': 'It called little beetles! Stomp them',
  'じだんだ! 足を あげたら ジャンプ!': 'Stomp quake! Jump when it lifts its foot',
  'いわが 2つ ころがる! じゅんばんに とびこえよう': 'Two rocks roll! Jump them one by one',
  'ひの わ! すきまに 入ろう': 'A ring of flames! Slip into a gap',
  'ろうの しずく! 影の ばしょから はなれよう': 'Wax drops! Move away from the shadows',
  'はりの あめ! 影の ない ところへ': 'Needle rain! Go where there is no shadow',
  'とっしんが 2かい! 2かいめの あとが チャンス': 'Two dives! Strike after the second one',
  'まくらが とんでくる! ゆっくりだよ': 'Pillows fly! They are slow',
  'ねがえりで ころがる! とびこえて、ねたら チャンス': 'It rolls in its sleep! Jump over, strike when it dozes',
  'ほしくずが ふる! 影から はなれよう': 'Stardust falls! Move away from the shadows',
  'はしらが 2本! 点線の 外へ': 'Two pillars! Get outside the dotted lines',
  'ひくい ページは ジャンプ、たかい ページは しゃがまず そのまま!': 'Jump the low page, stay on the ground for the high page!',
  'インクの たま! よく みて よけよう': 'Ink blobs! Watch and dodge',
  'かげの ぶんしんが はしる! とびこえよう': 'Shadow clones run! Jump over them',
  'ゆかから かげの て! まるい 影から はなれよう': 'Shadow hands from the floor! Move away from the round shadows',
  'むにゃ… まくら なげ…': 'Mmnya... pillow toss...',
  'ひくい ページ!': 'Low page!',
  'たかい ページ!': 'High page!',
});
