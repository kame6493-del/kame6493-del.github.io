// 11/21 持ち主「タイトルとか雰囲気もっとド派手に」「ホームランの演出とか観客の盛り上がりとかもっと派手に 打った時とかなんか起こった時とか」
// タイトルの演出(回る光線・紙吹雪・花火・ロゴの登場と光の筋・押した時の打球音と歓声・画面の切り替え)と、
// 遊んでいる間の演出(ホームラン・サヨナラ・長打・得点・好守・併殺/三振・逆転・満塁・勝ち)。
// 作りは DOM と CSS と 2D の canvas 1 枚だけ(スマホで重くしない)。three の場面には触らず、打球の尾の色だけ替える。
// 守備で球を追っている間は真ん中をふさがない: 真ん中に出すのは、球が柵を越えた後・捕った後・攻撃中(自分が守っていない)の時だけ。
// 見た目は hype.css。?nohype=1 で全部出さない。音は今ある素材(audio/crack_barrel.mp3・audio/cheer.mp3)だけ
const Q = new URLSearchParams(location.search);
const OFF = Q.has('nohype');
const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const COLORS = ['#ffd23a', '#ffffff', '#3fb6ff', '#7dff6a', '#ff5fc8'];

// ---------------------------------------------------------------- 花火(2D canvas。粒は線で描くだけ。何も無い時は止まる)
class Fireworks {
  constructor(cv) {
    this.cv = cv; this.g = cv.getContext('2d'); this.p = []; this.r = []; this.run = false; this.auto = 0; this.nextAuto = 0;
    this.resize(); addEventListener('resize', () => this.resize());
  }
  resize() {
    const k = Math.min(1.25, devicePixelRatio || 1); this.k = k;
    this.cv.width = Math.round(innerWidth * k); this.cv.height = Math.round(innerHeight * k);
  }
  // 下から打ち上げて、(x, y) で開く。x, y は画面の割合(0〜1)
  launch(x, y, n = 54, delay = 0) {
    const W = this.cv.width, H = this.cv.height;
    this.r.push({ x: x * W, y: H * 1.02, tx: x * W + rnd(-30, 30) * this.k, ty: y * H, t: -delay, dur: rnd(0.55, 0.8), n, c: COLORS[(Math.random() * COLORS.length) | 0], c2: COLORS[(Math.random() * COLORS.length) | 0] });
    this.start();
  }
  burst(x, y, n, c, c2) {
    const sp = Math.min(this.cv.width, this.cv.height) * rnd(0.32, 0.46);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.05, 0.05), v = sp * rnd(0.75, 1.05);
      this.p.push({ x, y, px: x, py: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(1.0, 1.5), t: 0, c: i % 3 === 0 ? c2 : c });
    }
  }
  start() { if (!this.run) { this.run = true; this.last = performance.now(); requestAnimationFrame(this.loop); } }
  loop = (now) => {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const g = this.g, W = this.cv.width, H = this.cv.height, k = this.k;
    if (this.auto && now > this.nextAuto) { this.nextAuto = now + this.auto * rnd(0.7, 1.3); this.launch(rnd(0.12, 0.88), rnd(0.1, 0.34), 44); }
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    // 打ち上げの玉
    for (let i = this.r.length - 1; i >= 0; i--) {
      const r = this.r[i]; r.t += dt; if (r.t < 0) continue;
      const u = Math.min(1, r.t / r.dur), e = 1 - Math.pow(1 - u, 2);
      const x = r.x + (r.tx - r.x) * e, y = r.y + (r.ty - r.y) * e;
      g.strokeStyle = 'rgba(255,230,160,.9)'; g.lineWidth = 2.2 * k; g.beginPath(); g.moveTo(x, y + 26 * k * (1 - u)); g.lineTo(x, y); g.stroke();
      if (u >= 1) { this.burst(r.tx, r.ty, r.n, r.c, r.c2); this.r.splice(i, 1); }
    }
    // 開いた粒(重力と空気で減速、尾は前の位置からの線)
    g.lineCap = 'round';
    for (let i = this.p.length - 1; i >= 0; i--) {
      const p = this.p[i]; p.t += dt;
      if (p.t > p.life) { this.p.splice(i, 1); continue; }
      p.px = p.x; p.py = p.y;
      const drag = Math.pow(0.12, dt);
      p.vx *= drag; p.vy = p.vy * drag + 260 * k * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - p.t / p.life;
      g.globalAlpha = a; g.strokeStyle = p.c; g.lineWidth = (1.4 + 2.2 * a) * k;
      g.beginPath(); g.moveTo(p.px - (p.x - p.px) * 2.5, p.py - (p.y - p.py) * 2.5); g.lineTo(p.x, p.y); g.stroke();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    if (this.p.length || this.r.length || this.auto) requestAnimationFrame(this.loop);
    else { this.run = false; g.clearRect(0, 0, W, H); }
  };
  stopAuto() { this.auto = 0; }
}

// ---------------------------------------------------------------- 紙吹雪(DOM の小片を CSS で落とす。終わったら消す)
function confetti(root, n, { from = 'top', life = 2.6, spread = 1 } = {}) {
  const frag = document.createDocumentFragment(), els = [];
  for (let i = 0; i < n; i++) {
    const e = document.createElement('i');
    const x = from === 'sides' ? (i % 2 ? rnd(0, 18) : rnd(82, 100)) : from === 'center' ? 50 + rnd(-28, 28) * spread : rnd(0, 100);
    e.style.cssText = `left:${x}vw;--c:${COLORS[i % COLORS.length]};--dx:${rnd(-18, 18).toFixed(1)}vw;--r:${rnd(360, 1080).toFixed(0)}deg;--d:${rnd(life * 0.7, life).toFixed(2)}s;--w:${rnd(0, 0.35).toFixed(2)}s;--s:${rnd(0.7, 1.3).toFixed(2)}`;
    if (i % 4 === 0) e.className = 'rb';
    frag.appendChild(e); els.push(e);
  }
  root.appendChild(frag);
  setTimeout(() => els.forEach((e) => e.remove()), (life + 0.5) * 1000);
}

// 音: 押した時に今ある打球音と歓声を鳴らす(最初に押した時に作る。消音 ?mute=1 と、音の切り替えに従う)
const SND = {}, LIVE = new Set();
window.__hypeStop = () => { for (const a of LIVE) try { a.pause(); } catch (e) { } LIVE.clear(); };   // 11/23 アプリが裏へ回った時に止める(main.js の __bgAudio)
function sfx(name, gain) {
  if (Q.has('mute')) return;
  const s = window.__crowd && window.__crowd.sound; if (s && s.enabled === false) return;
  const url = { crack: 'audio/crack_barrel.mp3', cheer: 'audio/cheer.mp3' }[name];
  try {
    const a = (SND[name] = SND[name] || new Audio(url)).cloneNode();
    if (document.visibilityState === 'hidden') return;
    a.volume = gain; a.play().catch(() => {}); LIVE.add(a); a.onended = () => LIVE.delete(a);
    if (name === 'cheer') setTimeout(() => { let v = gain; const f = setInterval(() => { v -= 0.05; if (v <= 0) { a.pause(); clearInterval(f); } else a.volume = v; }, 90); }, 1900);
  } catch (e) { /* 音は飾り */ }
}

// ---------------------------------------------------------------- タイトル
function setupTitle() {
  const T = $('title'); if (!T) return;
  T.classList.add('hy');
  const fx = document.createElement('div'); fx.className = 'hyT';
  fx.innerHTML = '<div class="hyRays"></div><div class="hyGlow"></div><canvas class="hyFw"></canvas><div class="hyConf"></div>';
  T.insertBefore(fx, T.querySelector('.titleBox'));
  // 降り続ける紙吹雪(数は少なめ、CSS の無限の動き)
  const conf = fx.querySelector('.hyConf');
  for (let i = 0; i < 22; i++) {
    const e = document.createElement('i');
    e.style.cssText = `left:${rnd(0, 100).toFixed(1)}%;--c:${COLORS[i % COLORS.length]};--dx:${rnd(-12, 12).toFixed(1)}vw;--r:${rnd(360, 900).toFixed(0)}deg;--d:${rnd(5, 9).toFixed(2)}s;--w:-${rnd(0, 9).toFixed(2)}s;--s:${rnd(0.7, 1.2).toFixed(2)}`;
    if (i % 4 === 0) e.className = 'rb';
    conf.appendChild(e);
  }
  const fw = new Fireworks(fx.querySelector('.hyFw'));
  // ロゴの光の筋は、ロゴの絵を型(mask)にして上を流す
  const placeRays = () => {
    const lg = T.querySelector('.logoWrap .logo') || T.querySelector('.logoWrap');
    if (!lg) return;
    const im = lg.querySelector('img');
    if (im && im.currentSrc && !lg.dataset.hyMask) { lg.dataset.hyMask = '1'; lg.style.setProperty('--hy-logo', `url("${im.currentSrc}")`); lg.classList.add('hyShine'); }
    const r = lg.getBoundingClientRect();
    if (r.width) { fx.style.setProperty('--cx', (r.left + r.width / 2) + 'px'); fx.style.setProperty('--cy', (r.top + r.height / 2) + 'px'); }
  };
  let shown = false;
  const onShow = () => {
    const vis = !T.classList.contains('hide');
    if (vis && !shown) {
      shown = true;
      T.classList.remove('hyIn'); void T.offsetWidth; T.classList.add('hyIn');
      placeRays(); setTimeout(placeRays, 120); setTimeout(placeRays, 900);
      fw.auto = 1500; fw.nextAuto = performance.now() + 500; fw.start();
      fw.launch(0.25, 0.2, 60, 0.15); fw.launch(0.75, 0.16, 60, 0.45);
    } else if (!vis && shown) { shown = false; fw.stopAuto(); }
  };
  new MutationObserver(onShow).observe(T, { attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', placeRays);
  const img = T.querySelector('.logoWrap img'); if (img) img.addEventListener('load', placeRays);
  onShow();
  // ボタン: 押したら打球音と歓声、押した所から光が弾けて次の画面へ
  T.addEventListener('click', (e) => {
    const b = e.target.closest('.mode'); if (!b) return;
    sfx('crack', 0.75); sfx('cheer', 0.5);
    wipe(e.clientX || innerWidth / 2, e.clientY || innerHeight / 2, b.dataset.mode === 'game' ? 'gold' : 'blue');
  }, true);
  // 「プレイボール」等(設定の画面の決定)も同じ切り替えに
  const go = $('setGo');
  if (go) go.addEventListener('click', (e) => { sfx('crack', 0.8); sfx('cheer', 0.6); wipe(e.clientX || innerWidth / 2, e.clientY || innerHeight / 2, 'gold', go.textContent.trim()); }, true);
}

// 画面の切り替え: 押した所から光の輪が広がって画面を覆い、抜ける(0.6 秒)。text があれば大きく一瞬出す
function wipe(x, y, tone = 'gold', text = '') {
  const w = document.createElement('div'); w.className = 'hyWipe ' + tone;
  w.style.setProperty('--x', x + 'px'); w.style.setProperty('--y', y + 'px');
  w.innerHTML = '<i class="ring"></i><i class="streak"></i>' + (text ? `<b>${text.replace(/[<>&]/g, '')}</b>` : '');
  document.body.appendChild(w);
  setTimeout(() => w.remove(), text ? 1100 : 700);
}

// ---------------------------------------------------------------- 遊んでいる間
let G = null;   // { root, fw, conf, big }
function gameLayer() {
  if (G) return G;
  const root = document.createElement('div'); root.id = 'hyGame';
  root.innerHTML = '<div class="hyFlash"></div><div class="hyEdge"></div><div class="hyBurst"></div><canvas class="hyFw"></canvas><div class="hyConf"></div><div class="hyBig"></div>';
  document.body.appendChild(root);
  G = { root, fw: new Fireworks(root.querySelector('.hyFw')), conf: root.querySelector('.hyConf'), big: root.querySelector('.hyBig') };
  return G;
}
const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
function flash(tone) { const L = gameLayer(); const f = L.root.querySelector('.hyFlash'); f.dataset.tone = tone; restart(f, 'on'); }
function edge(tone) { const L = gameLayer(); const f = L.root.querySelector('.hyEdge'); f.dataset.tone = tone; restart(f, 'on'); }
function burstRays() { const L = gameLayer(); restart(L.root.querySelector('.hyBurst'), 'on'); }
let bigT = 0;
function big(text, sub = '', tone = 'gold') {
  const L = gameLayer(), el = L.big;
  if (document.getElementById('hrBanner')?.classList.contains('show')) return;   // ホームランの題字と重ねない
  // アウト・セーフ等の札(#callBanner、1 秒)が出ている時は、消えてから出す
  if (document.getElementById('callBanner')?.classList.contains('show') && !big._wait) { big._wait = true; setTimeout(() => { big._wait = false; big(text, sub, tone); }, 700); return; }
  el.dataset.tone = tone;
  el.innerHTML = (sub ? `<small>${sub}</small>` : '') + `<b>${text}</b>`;
  restart(el, 'on'); clearTimeout(bigT); bigT = setTimeout(() => el.classList.remove('on'), 1500);
}
function shake() { const c = $('view'); if (!c) return; restart(c, 'hyShake'); setTimeout(() => c.classList.remove('hyShake'), 600); }

const app = () => window.__app;
function quietNow() {
  const A = app(), d = A && A.defense;
  if (document.body.classList.contains('photo')) return true;
  if (!document.body.classList.contains('playing')) return true;
  return !!(d && (d.ffw || d.dg));   // 早送り・まとめの間は出さない
}
// 自分が守っていて、まだ球が生きている(追っている・投げる前)か
function fielding() {
  const A = app(), d = A && A.defense;
  if (!d || !d.active || !d.play) return false;
  const pl = d.play;
  return !!(d.ball && !pl.hr && pl.endT == null);
}

let lastHR = -9;
function onEvent(name, k = 1) {
  if (OFF || quietNow()) return;
  const now = performance.now() / 1000;
  const L = gameLayer();
  switch (name) {
    case 'hr': case 'sayonara': {
      if (now - lastHR < 3) return; lastHR = now;
      const sayo = name === 'sayonara';
      shake();   // 11/23 持ち主「試合勝った時ホームランを打った時の演出がビカビカ光るけどこの演出要らない」: 画面の光・光の筋・縁の光は出さない(花火と紙吹雪は残す)
      const n = sayo ? 9 : 6;
      for (let i = 0; i < n; i++) L.fw.launch(rnd(0.12, 0.88), rnd(0.1, 0.36), sayo ? 64 : 52, i * 0.28);
      confetti(L.conf, sayo ? 110 : 70, { life: 3.2 });
      setTimeout(() => confetti(L.conf, sayo ? 60 : 30, { from: 'sides', life: 2.8 }), 900);
      if (sayo) setTimeout(() => big('サヨナラ!', '', 'gold'), 1800);
      break;
    }
    case 'score':
      edge('gold');
      if (!fielding()) { confetti(L.conf, 34, { from: 'sides', life: 2.4 }); L.fw.launch(0.2, 0.2, 40); L.fw.launch(0.8, 0.22, 40, 0.3); }
      break;
    case 'longhit': edge('gold'); break;
    case 'hit': if (!fielding()) edge('gold'); break;
    case 'fine':
      edge('green'); flash('soft');
      confetti(L.conf, 30, { from: 'sides', life: 2.2 });
      break;
    case 'dp': case 'strikeout': case 'escape':
      edge('blue'); flash('soft');
      break;
    default: break;
  }
}

// 試合の流れを見る(4 回/秒): 逆転・満塁・勝ち。打球の尾はホームランの間だけ金色
let prev = { g: null, lead: 0, full: false, over: false };
function watchGame() {
  const A = app(), d = A && A.defense, g = d && d.g;
  try {
    // 打球の尾: ホームランの時は金色で太く
    const bv = d && d.ballView;
    if (bv && bv.trailMat) {
      const hr = !!(d.play && d.play.hr);
      const U = bv.trailMat.uniforms;
      if (hr && !bv._hyGold) { bv._hyGold = U.color.value.getHex(); U.color.value.setHex(0xffc23a); }
      else if (!hr && bv._hyGold != null) { U.color.value.setHex(bv._hyGold); bv._hyGold = null; }
    }
  } catch (e) { /* 飾り */ }
  if (!g || !d.active || d.kind !== 'game') { prev.g = null; return; }
  if (prev.g !== g) { prev = { g, lead: g.score.us - g.score.them, full: false, over: !!g.over }; return; }
  const lead = g.score.us - g.score.them;
  const W = A.watch && A.watch.on;
  if (!quietNow()) {
    if (!W && prev.lead <= 0 && lead > 0 && !g.over) { if (prev.lead < 0) big('逆転!', '', 'gold'); else big('勝ち越し!', '', 'gold'); }
    const full = !!(g.bases && g.bases[0] && g.bases[1] && g.bases[2]);
    if (full && !prev.full) { edge('gold'); try { window.__crowd && window.__crowd.event('ooh', 1); } catch (e) { } }
    prev.full = full;
  }
  if (g.over && !prev.over) {
    prev.over = true;
    const L = gameLayer();
    if (W || lead > 0) {
      for (let i = 0; i < 8; i++) L.fw.launch(rnd(0.12, 0.88), rnd(0.1, 0.35), 56, i * 0.3);
      confetti(L.conf, 110, { life: 3.4 });   // 11/23 画面の光・光の筋は出さない
      if (!W) setTimeout(() => big('勝利!', 'ゲームセット', 'gold'), 400);
    }
  }
  prev.lead = lead;
}

// audio.js の合図を外から包む(crowd.js と同じやり方。audio.js は触らない)
function attach() {
  const C = window.__crowd, s = C && C.sound;
  if (!s || s._hy) return false;
  s._hy = true;
  const wrap = (name, fn) => { const o = s[name]; if (typeof o !== 'function') return; s[name] = function (...a) { const r = o.apply(this, a); try { fn(...a); } catch (e) { /* 飾り */ } return r; }; };
  wrap('crowdEvent', (name, k) => { if (!(s.isSkipping && s.isSkipping())) onEvent(name, k); });
  // 打席(play.js)のホームラン: 打った瞬間の呼び出しは飛ばし、球が着いた時(_flyDirect)に出す(audio.js の crowd と同じ見分け方)
  wrap('crowd', (kind) => {
    if (kind !== 'hr') return;
    const p = app() && app().play;
    if (!s._flyDirect && p && p.batted && p.batted.t === 0 && p.batted.label) return;
    onEvent('hr', 1);
  });
  return true;
}

if (!OFF) {
  const boot = () => {
    setupTitle();
    const iv = setInterval(() => { if (attach()) clearInterval(iv); }, 500);
    setInterval(watchGame, 250);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
}
