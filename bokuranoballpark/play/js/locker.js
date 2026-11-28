// 11/26 ロッカー(着せ替えを選ぶ・買う前にためす)・コレクション(図鑑)・選手カードの絵を X に出す。
// 見た目は ChatGPT イメージの案(_chatgpt_shop_1126/2_locker.png・3_collection.png)。飾りの絵は案から切り出した img/shop2_*.webp、字はすべて HTML。
// 着せ替えの一覧と持っているかは js/cosmetics.js。買う所はアプリ版だけ(shop/shop.js の window.__bpStore)。
// ブラウザ版: はじめから使える物を選べて、ほかの物は「ためす」で見るだけ。「アプリ版で選べます」と App Store へ案内する。
import * as THREE from 'three';
import COS, { CAT, KINDS, BALL_KINDS, HOF_NEED } from './cosmetics.js';
import { STADIUMS } from './stadiums.js';

const APPSTORE = 'https://apps.apple.com/jp/app/id6837152603';
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const store = () => window.__bpStore || null;
const isApp = () => !!store();
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
const LS = { get(k, d) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : d; } catch (e) { return d; } } };
const stop = (el) => { for (const ev of ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'mousedown', 'keydown', 'wheel']) el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }); };

// ---------------------------------------------------------------- 画面の頭(案の形: 緑の「戻る」・月桂樹の題・花火)。ショップ(shop/shop.js)も使う
function head(title, sub, extra) {
  return `<div class="bpHead"><i class="bpFw l"></i><i class="bpFw r"></i><button class="bpBack" data-act="close"><b>←</b>戻る</button>
    <div class="bpTitle">${sub ? `<small>${esc(sub)}</small>` : ''}<i class="bpLaur l"></i><h1>${esc(title)}</h1><i class="bpLaur r"></i></div>${extra || ''}</div>`;
}
const shelf = (title, icon, right, body, cls) => `<section class="bpShelf ${cls || ''}"><div class="bpShelfHead">${icon ? `<i class="bpIco" style="background-image:url('img/shop2_${icon}.webp')"></i>` : ''}<b>${esc(title)}</b></div>${right ? `<span class="bpCnt">${right}</span>` : ''}${body}</section>`;

// ---------------------------------------------------------------- 枠の色(CSS の .bpFr-* と同じ。X に出す絵で使う)
const FR = {
  basic: ['#f6c437', '#fff3b0', '#b07a10'], wood: ['#8a5a2b', '#c98f55', '#5e3a18'], silver: ['#8d97a5', '#f4f7fb', '#6d7684'], gold: ['#a8761a', '#ffe08a', '#c9971f'],
  night: ['#0b1630', '#3a7bff', '#ffe9a3'], field: ['#2f7d32', '#6cc24a', '#b8763e'], rainbow: ['#ff4b4b', '#ffd23a', '#39d353', '#4fb3ff', '#b05cff'],
  snow: ['#0e2348', '#bcd7ff', '#ffffff'], newyear: ['#c7202c', '#ffffff', '#e9b923'], camp: ['#7ea84a', '#9fd0ff', '#ffffff'], pass: ['#4b1f7a', '#e9b923', '#b48cff'],
  ball: ['#ffffff', '#c8102e', '#ffffff'], hof: ['#1a1a1a', '#e9b923', '#5a4510'],
};
const frKey = (id) => String(id || 'frame_basic').replace(/^frame_/, '');

// ---------------------------------------------------------------- 柄の見本(選んだ色の上に描く。3D の柄 js/cosmetics.js のシェーダーと同じ形)
const SW = new Map();
function patSwatch(colorId, patId, W = 120, H = 80) {
  const key = colorId + '|' + patId + '|' + W; if (SW.has(key)) return SW.get(key);
  const c = COS.get(colorId) || COS.get('gc_brown'), p = COS.get(patId) || COS.get('gp_plain');
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const base = hex(c.c), pc = p.pc == null || p.pc === -1 ? null : hex(p.pc);
  const lg = g.createLinearGradient(0, 0, 0, H); lg.addColorStop(0, base); lg.addColorStop(1, shade(c.c, 0.7)); g.fillStyle = lg; g.fillRect(0, 0, W, H);
  const rnd = mulb(p.p * 97 + 3);
  g.fillStyle = pc || shade(c.c, 0.45);
  if (p.p === 1) for (let i = 0; i < 7; i++) star(g, rnd() * W, rnd() * H, 5 + rnd() * 9);
  else if (p.p === 2) { g.beginPath(); g.moveTo(W * 0.62, 0); g.lineTo(W * 0.38, H * 0.5); g.lineTo(W * 0.55, H * 0.5); g.lineTo(W * 0.3, H); g.lineTo(W * 0.72, H * 0.42); g.lineTo(W * 0.55, H * 0.42); g.lineTo(W * 0.82, 0); g.closePath(); g.fill(); }
  else if (p.p === 3) { const fg = g.createLinearGradient(0, H, 0, H * 0.2); fg.addColorStop(0, '#ffb21a'); fg.addColorStop(1, '#d81e06'); g.fillStyle = fg; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += W / 8) g.lineTo(x, H * (0.25 + 0.35 * rnd())); g.lineTo(W, H); g.fill(); }
  else if (p.p === 4 || p.p === 10) for (let i = 0; i < 6; i++) flower(g, rnd() * W, rnd() * H, 6 + rnd() * 7);
  else if (p.p === 5) for (let i = 0; i < 26; i++) { g.fillStyle = [pc, shade(c.c, 1.0), '#7a7a72'][i % 3]; g.beginPath(); g.ellipse(rnd() * W, rnd() * H, 6 + rnd() * 12, 4 + rnd() * 8, rnd() * 3, 0, 7); g.fill(); }
  else if (p.p === 6) for (let x = 4; x < W; x += 12) g.fillRect(x, 0, 4, H);
  else if (p.p === 7) for (let y = 0; y < H; y += 14) for (let x = 0; x < W; x += 14) if (((x + y) / 14) % 2 === 0) g.fillRect(x, y, 14, 14);
  else if (p.p === 8) for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(rnd() * W, rnd() * H, 1 + rnd() * 2.2, 0, 7); g.fill(); }
  else if (p.p === 9) g.fillRect(W * 0.5, 0, W * 0.5, H);
  const u = cv.toDataURL('image/png'); SW.set(key, u); return u;
}
function shade(h, k) { const r = Math.round(((h >> 16) & 255) * k), g = Math.round(((h >> 8) & 255) * k), b = Math.round((h & 255) * k); return `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`; }
function mulb(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function star(g, x, y, r) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }
function flower(g, x, y, r) { for (let i = 0; i < 5; i++) { const a = i * Math.PI * 0.4; g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.5, r * 0.32, a, 0, 7); g.fill(); } g.save(); g.fillStyle = '#ffe08a'; g.beginPath(); g.arc(x, y, r * 0.18, 0, 7); g.fill(); g.restore(); }

// ---------------------------------------------------------------- 選手カードのユニフォームの絵(cosmetics.uniArt の答えを覚えておき、すぐ出せるように)
const ART = {};
function artNow(id) {
  id = id || COS.eq().uni;
  if (!COS.uniOf(id)) return null;
  if (ART[id] === undefined) { ART[id] = null; COS.uniArt(id).then((u) => { ART[id] = u; try { const C = window.__career; if (C && C.ui && C.ui.card && !C.ui.card.classList.contains('hide')) C.ui.renderCard(false); } catch (e) { /* なし */ } if (L.el && !L.el.classList.contains('hide')) L.render(); }); }
  return ART[id];
}

// ---------------------------------------------------------------- グラブの 3D(台の上に飾る/一人称の目線。ロッカーと X の絵で使う。閉じたら捨てる)
class GloveView {
  constructor(canvas, opt = {}) {
    this.c = canvas; this.opt = opt; this.fp = !!opt.fp;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!opt.keep });
    this.r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 0.85;
    this.s = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(36, 1, 0.01, 10);
    this.s.add(new THREE.HemisphereLight(0xdfeeff, 0x3a5a2a, 1.4));
    const d = new THREE.DirectionalLight(0xffffff, 2.4); d.position.set(0.6, 1.2, 1.0); this.s.add(d);
    const d2 = new THREE.DirectionalLight(0xffd890, 1.1); d2.position.set(-1, 0.2, 0.6); this.s.add(d2);
    this.U = COS.gloveUniforms();
    this.g = new THREE.Group(); this.s.add(this.g);
    this.yaw = 0; this.pitch = 0; this.drag = null; this.t0 = performance.now();
    canvas.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch }; try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* なし */ } });
    canvas.addEventListener('pointermove', (e) => { if (!this.drag) return; this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.01; this.pitch = Math.max(-0.8, Math.min(0.6, this.drag.pitch + (e.clientY - this.drag.y) * 0.006)); this.t0 = performance.now(); });
    const up = () => { this.drag = null; }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    this.mode(this.fp);
    this.ready = this.load();
  }
  // 台の上(正面から少し見上げる)か、一人称の目線(捕った時に左下に見える向き・球が入っている)
  mode(fp) {
    this.fp = fp; this.yaw = 0; this.pitch = 0;
    if (fp) { this.cam.position.set(0.1, 0.24, 0.5); this.cam.lookAt(-0.02, 0.16, 0); this.base = [-0.25, -0.55, -0.35]; }
    else { this.cam.position.set(0.0, 0.17, 0.64); this.cam.lookAt(0.0, 0.155, 0); this.base = [-0.3, 2.8, 0.1]; }   // 台の上: 背の側(指と網が見える向き)
    if (this.ball) this.ball.visible = this.seam.visible = fp;
  }
  async load() {
    const [{ GLTFLoader }, { RoomEnvironment }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/environments/RoomEnvironment.js')]);
    const pm = new THREE.PMREMGenerator(this.r); this.s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    const g = await new GLTFLoader().loadAsync('models/fp_glove.glb');
    const inner = g.scene; inner.position.set(0, 0.154, 0);
    inner.traverse((o) => { if (o.isMesh) { const m = o.material; m.metalness = 0; m.envMapIntensity = 0.35; m.color.setRGB(0.84, 0.8, 0.78); this.mat = m; COS.patchGlove(m, this.U); } });
    this.g.add(inner);
    // 球(手のひらの前。本物の比: 半径 3.66cm)
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.0366, 32, 20), new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.55 }));
    this.ball.position.set(-0.004, 0.17, 0.05); this.g.add(this.ball);
    this.seam = new THREE.Mesh(new THREE.TorusGeometry(0.0368, 0.0016, 6, 48), new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.6 }));
    this.seam.position.copy(this.ball.position); this.seam.rotation.set(0.5, 0.9, 0); this.g.add(this.seam);
    this.ball.visible = this.seam.visible = this.fp;
    this.set(this.color, this.pat);
    this.loop();
  }
  set(color, pat) { this.color = color; this.pat = pat; if (this.mat) COS.setGlove(this.U, this.mat, color, pat); }
  size() {
    const w = this.c.clientWidth || 300, h = this.c.clientHeight || 200;
    if (this._w !== w || this._h !== h) { this._w = w; this._h = h; this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  }
  frame() {
    this.size();
    const t = (performance.now() - this.t0) / 1000, sway = this.drag || this.opt.still ? 0 : Math.sin(t * 0.7) * (this.fp ? 0.06 : 0.35) * Math.min(1, t / 2);
    this.g.rotation.set(this.base[0] + this.pitch, this.base[1] + this.yaw + sway, this.base[2]);
    this.r.render(this.s, this.cam);
  }
  loop() { if (this.dead) return; this.frame(); if (!this.opt.still) requestAnimationFrame(() => this.loop()); }
  dispose() {
    this.dead = true;
    this.s.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); const m = o.material; for (const k of ['map', 'normalMap']) if (m[k]) m[k].dispose(); m.dispose(); } });
    if (this.s.environment) this.s.environment.dispose();
    this.r.dispose(); try { this.r.forceContextLoss(); } catch (e) { /* なし */ }
  }
}

// ---------------------------------------------------------------- 見本の小さな絵
function swatch(c, curColor) {
  if (c.kind === 'gcolor') return `<i class="lkDot" style="--c:${hex(c.c)}"></i>`;
  if (c.kind === 'gpat') return `<i class="lkPat" style="background-image:url('${patSwatch(curColor || COS.eq().gcolor, c.id)}')"></i>`;
  if (c.kind === 'uni') {
    const u = c.u; if (!u) return '<i class="lkSw uni team"><b>学校</b></i>';
    const bg = u.stripe != null ? `repeating-linear-gradient(90deg,${hex(u.jersey)} 0 5px,${hex(u.stripe)} 5px 6.5px)` : hex(u.jersey);
    return `<i class="lkSw uni" style="--j:${bg};--p:${hex(u.pants)};--u:${hex(u.under)}"><s></s></i>`;
  }
  if (c.kind === 'frame') return `<i class="lkSw frame ${COS.frameClass(c.id)}"></i>`;
  return `<i class="lkSw title">${c.id === 'title_none' ? '—' : '称'}</i>`;
}
const tag = (c) => (c.free ? 'はじめから' : c.comp ? 'コレクション' : c.pass ? 'シーズンパス' : c.season ? `${c.season.m}月・${c.season.name}` : '');
const visible = (x) => !x.season || COS.released(x) || COS.inSeason(x) || COS.owned(x.id);

// ---------------------------------------------------------------- ロッカー
const L = {
  el: null, tab: 'glove', sel: {}, view: null, after: null, fp: false,
  build() {
    if (this.el) return;
    const el = document.createElement('section'); el.id = 'bpLocker'; el.className = 'bpScreen hide';
    document.body.appendChild(el); this.el = el; stop(el);
    el.addEventListener('click', (e) => this.onClick(e));
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && !el.classList.contains('hide')) { e.stopPropagation(); this.close(); } }, true);
    COS.onChange(() => { if (!el.classList.contains('hide')) this.render(); });
  },
  open(tab, after) {
    this.build(); this.tab = tab || this.tab; this.sel = {}; this.fp = false; this.after = after || null;
    this.el.classList.remove('hide'); this.render();
    try { const a = window.__app; if (a && a.ui) a.ui.app.setOverlay(true); } catch (e) { /* なし */ }
  },
  close() {
    if (!this.el) return;
    this.el.classList.add('hide'); this.sel = {};
    this._vtok = (this._vtok || 0) + 1;
    if (this.view) { this.view.dispose(); this.view = null; }
    const f = this.after; this.after = null; if (f) try { f(); } catch (e) { /* なし */ }
  },
  // 今見ている物(選んだ物・なければ使っている物)
  cur(k) { return this.sel[k] || COS.eq()[k]; },
  kinds() { return this.tab === 'glove' ? ['gcolor', 'gpat'] : [this.tab]; },
  stageHtml() {
    if (this.tab === 'glove') return `<div class="lkStage${this.fp ? ' fp' : ''}"${this.fp ? ` style="background-image:linear-gradient(180deg,rgba(6,20,50,.1),rgba(6,20,50,.5)),url('${this.stadiumBg()}')"` : ''}>${this.fp ? '' : '<i class="lkRays"></i><i class="lkPed"></i>'}<canvas class="lkGl"></canvas>
      <div class="lkEye">${this.fp ? '自分の目線(捕った時に見えるグラブ)' : '指で回せます'}</div></div>`;
    const e = COS.eq(), fr = this.cur('frame'), uni = this.cur('uni'), D = (window.__career && window.__career.data) || {};
    const art = artNow(uni);
    return `<div class="lkStage card"><i class="lkRays"></i><div class="lkCard ${COS.frameClass(fr)}"><div class="lkArt"${art ? ` style="background-image:url('${art}')"` : ''}><span>${esc(D.num ?? 6)}</span></div>
      <div class="lkCardTx"><b>${esc(D.name || 'あなた')}</b>${COS.titleText(e.title) ? `<small>${esc(COS.titleText(e.title))}</small>` : ''}</div></div></div>`;
  },
  stadiumBg() { let s = 'park'; try { const x = window.__app.ui.app.stadium; if (x && x !== 'koshien') s = x; } catch (e) { /* なし */ } return `img/stadium_thumbs/${s}.jpg`; },
  bodyHtml() {
    const e = COS.eq();
    if (this.tab === 'glove') {
      const cc = this.cur('gcolor'), cp = this.cur('gpat');
      const cols = CAT.filter((x) => x.kind === 'gcolor').map((x) => `<button class="lkC${x.id === cc ? ' sel' : ''}${COS.owned(x.id) ? '' : ' lock'}${e.gcolor === x.id ? ' on' : ''}" data-k="gcolor" data-id="${x.id}" aria-label="${esc(x.name)}">${swatch(x)}</button>`).join('');
      const pats = CAT.filter((x) => x.kind === 'gpat' && visible(x)).map((x) => `<button class="lkP${x.id === cp ? ' sel' : ''}${COS.owned(x.id) ? '' : ' lock'}${e.gpat === x.id ? ' on' : ''}" data-k="gpat" data-id="${x.id}">${swatch(x, cc)}<b>${esc(x.name)}</b>${x.season ? `<em>${x.season.m}月</em>` : ''}</button>`).join('');
      const nC = CAT.filter((x) => x.kind === 'gcolor').length, oC = CAT.filter((x) => x.kind === 'gcolor' && COS.owned(x.id)).length;
      const pl = CAT.filter((x) => x.kind === 'gpat' && visible(x));
      return shelf('色', '', `${oC} / ${nC}`, `<div class="lkCols">${cols}</div><div class="lkCname">${esc((COS.get(cc) || {}).name || '')}</div>`, 'tight')
        + shelf('柄', '', `${pl.filter((x) => COS.owned(x.id)).length} / ${pl.length}`, `<div class="lkPats">${pats}</div>`, 'tight');
    }
    const k = this.tab, cur = this.cur(k);
    const list = CAT.filter((x) => x.kind === k && visible(x));
    const grid = list.map((x) => `<button class="lkP big${x.id === cur ? ' sel' : ''}${COS.owned(x.id) ? '' : ' lock'}${e[k] === x.id ? ' on' : ''}" data-k="${k}" data-id="${x.id}">${swatch(x)}<b>${esc(x.name)}</b><em>${e[k] === x.id ? '使用中' : esc(COS.owned(x.id) ? '' : tag(x))}</em></button>`).join('');
    return shelf(k === 'uni' ? 'ユニフォーム' : 'カードの枠', '', `${list.filter((x) => COS.owned(x.id)).length} / ${list.length}`, `<div class="lkPats">${grid}</div>`, 'tight');
  },
  barHtml() {
    const S = store(), e = COS.eq(), ks = this.kinds();
    const locked = ks.map((k) => this.cur(k)).filter((id) => !COS.owned(id));
    const same = ks.every((k) => this.cur(k) === e[k]);
    const tryB = this.tab === 'glove' ? `<button class="lkTry${this.fp ? ' on' : ''}" data-act="try">${this.fp ? '台に戻す' : 'ためす'}</button>` : '<button class="lkTry" data-act="coll">コレクション</button>';
    let main, note = '';
    if (!locked.length) main = same ? '<button class="lkBuy" disabled>使っています</button>' : '<button class="lkBuy" data-act="equip">これを使う</button>';
    else {
      const c = COS.get(locked[0]);
      if (c.comp) { main = '<button class="lkBuy" data-act="coll">コレクションで</button>'; note = `${esc(c.name)}: ${esc(c.desc)}(コレクションのごほうび)`; }
      else if (!S) { main = `<a class="lkBuy" href="${APPSTORE}" target="_blank" rel="noopener">アプリ版で選べます</a>`; note = `ためしています: ${locked.map((id) => esc(COS.get(id).name)).join('・')}。アプリ版で選べます(ブラウザ版は、はじめから使える物だけ)`; }
      else if (c.pass) { main = '<button class="lkBuy" data-act="shop" data-f="pass">シーズンパス</button>'; note = 'シーズンパスの間だけ使える枠です'; }
      else if (c.season && !COS.inSeason(c)) { main = '<button class="lkBuy" data-act="shop" data-f="pass">シーズンパス</button>'; note = `${c.season.m}月の着せ替え。シーズンパスの間は使えます。毎年 ${c.season.m}月にショップへ戻ります`; }
      else {
        const ps = locked.map((id) => S.priceOf && S.priceOf(id));
        main = ps.every(Boolean) ? `<button class="lkBuy" data-act="buy">買う ${ps.map(esc).join(' + ')}</button>` : '<button class="lkBuy" disabled>準備中</button>';
        note = `ためしています: ${locked.map((id) => esc(COS.get(id).name)).join('・')}${locked.length > 1 ? '(色と柄を両方買います)' : ''}。<button class="lkLink" data-act="shop" data-f="cos">セット・まとめを見る</button>`;
      }
    }
    return `${note ? `<p class="lkNote2">${note}</p>` : ''}<div class="lkBar">${tryB}${main}</div>`;
  },
  render() {
    const S = store();
    const keep = this.tab === 'glove' && this.view && this.el.contains(this.view.c) && this.view.fp === this.fp;
    const tabs = KINDS.map(([k, t]) => `<button class="${k === this.tab ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('');
    const sc = ($('.bpSheet', this.el) || {}).scrollTop || 0;
    const html = `<div class="bpSheet lk">${head('ロッカー', 'ぼくらのボールパーク', S ? '<button class="bpShopBtn" data-act="shop" data-f="">ショップ</button>' : '')}
      <div class="lkTabs">${tabs}</div>${this.stageHtml()}${this.bodyHtml()}
      <p class="lkNote">着せ替えは見た目だけです。守備の能力・UZR・ランキングには関係しません。${S ? '' : `ブラウザ版では、はじめから使える物を選べます。ほかは<a href="${APPSTORE}" target="_blank" rel="noopener">アプリ版</a>で。`}</p>
      ${this.barHtml()}</div>`;
    if (keep) { const cv = this.view.c; cv.remove(); this.el.innerHTML = html; $('.lkStage canvas', this.el).replaceWith(cv); }
    else {
      this._vtok = (this._vtok || 0) + 1;
      if (this.view) { this.view.dispose(); this.view = null; }
      this.el.innerHTML = html;
      // 11/26 サクサク: グラブの 3D(描く所を新しく作る・模型と光を読む)は、ロッカーの画面を先に出してから作る(押してから画面が出るまで、スマホ相当で 0.5 秒かかっていた)
      if (this.tab === 'glove') { const cv = $('.lkGl', this.el); if (cv) { const tok = this._vtok, fp = this.fp; requestAnimationFrame(() => setTimeout(() => {
        if (tok !== this._vtok || this.view || !this.el.contains(cv) || this.el.classList.contains('hide')) return;
        this.view = new GloveView(cv, { fp }); this.view.set(this.cur('gcolor'), this.cur('gpat'));
      }, 0)); } }
    }
    const sh = $('.bpSheet', this.el); if (sh) sh.scrollTop = sc;
    if (this.view) this.view.set(this.cur('gcolor'), this.cur('gpat'));
  },
  onClick(ev) {
    const b = ev.target.closest('button,a'); if (!b) return;
    if (b.tagName === 'A') return;   // App Store(外のブラウザで開く)
    ev.stopPropagation();
    if (b.dataset.tab) { this.tab = b.dataset.tab; this.sel = {}; this.fp = false; this.render(); return; }
    if (b.dataset.id) { this.sel[b.dataset.k] = b.dataset.id; this.render(); return; }
    const a = b.dataset.act, S = store();
    if (a === 'close') this.close();
    else if (a === 'try') { this.fp = !this.fp; this.render(); }
    else if (a === 'equip') { for (const k of this.kinds()) COS.equip(this.cur(k)); this.sel = {}; this.render(); }
    else if (a === 'coll') { this.close(); Coll.open(); }
    else if (a === 'buy') { if (S && S.buyItems) S.buyItems(this.kinds().map((k) => this.cur(k)).filter((id) => !COS.owned(id)), () => { for (const k of this.kinds()) if (COS.owned(this.cur(k))) COS.equip(this.cur(k)); this.render(); }); }
    else if (a === 'shop') { if (S && S.openShop) S.openShop(b.dataset.f || ''); }
  },
};

// ---------------------------------------------------------------- コレクション(図鑑。案: 頭に「あと◯個でコンプリート」、棚ごとに 持っている数 / 全部、持っていない物は影と「?」)
const Coll = {
  el: null,
  open() {
    if (!this.el) {
      const el = document.createElement('section'); el.id = 'bpColl'; el.className = 'bpScreen hide'; document.body.appendChild(el); stop(el);
      this.el = el;
      el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; e.stopPropagation(); const a = b.dataset.act; if (a === 'close') this.close(); else if (a === 'locker') { this.close(); L.open(b.dataset.tab || 'glove'); } else if (b.dataset.use) { COS.equip(b.dataset.use); this.render(); } });
      addEventListener('keydown', (e) => { if (e.code === 'Escape' && !el.classList.contains('hide')) { e.stopPropagation(); this.close(); } }, true);
    }
    this.el.classList.remove('hide'); this.render();
    try { const a = window.__app; if (a && a.ui) a.ui.app.setOverlay(true); } catch (e) { /* なし */ }
  },
  close() { if (this.el) this.el.classList.add('hide'); },
  render() {
    const cell = (has, inner, label) => `<div class="clCell${has ? '' : ' shadow'}">${inner}${has ? '' : '<b class="clQ">?</b>'}<small>${has ? esc(label) : '?'}</small></div>`;
    const list = (kinds) => CAT.filter((c) => kinds.includes(c.kind) && !c.comp && (!c.season || COS.released(c) || COS.inSeason(c)));
    const gl = list(['gcolor', 'gpat']), un = list(['uni']), fr = CAT.filter((c) => c.kind === 'frame' && (!c.season || COS.released(c) || COS.inSeason(c)));
    const cnt = (a) => a.filter((c) => COS.owned(c.id)).length;
    const bag = LS.get('r4walk.ballbag', []);
    const bn = BALL_KINDS.filter(([k, h]) => bag.some((x) => x.kind === k && x.how === h)).length;
    const H = LS.get('r4walk.career.hof.v1', []); const hn = Math.min(HOF_NEED, Array.isArray(H) ? H.length : 0);
    const total = gl.length + un.length + fr.length + BALL_KINDS.length + HOF_NEED;
    const have = cnt(gl) + cnt(un) + cnt(fr) + bn + hn;
    const rw = (what) => { const f = CAT.find((c) => c.comp === what && c.kind === 'frame'), t = CAT.find((c) => c.comp === what && c.kind === 'title'); const done = COS.compDone(what);
      return `<div class="clRw">${done ? 'コンプリート!' : 'そろえると'} 枠「${esc(f.name)}」と称号「${esc(t.name)}」${done ? ` <button class="bpMini" data-use="${f.id}">枠を使う</button><button class="bpMini" data-use="${t.id}">称号を使う</button>` : ''}</div>`; };
    const gcells = gl.map((c) => cell(COS.owned(c.id), c.kind === 'gcolor' ? `<i class="clGl" style="--c:${hex(c.c)}"></i>` : `<i class="lkPat sm" style="background-image:url('${patSwatch(COS.eq().gcolor, c.id, 72, 48)}')"></i>`, c.name)).join('');
    const ucells = un.map((c) => cell(COS.owned(c.id), swatch(c), c.name)).join('');
    const fcells = fr.map((c) => cell(COS.owned(c.id), swatch(c), c.name)).join('');
    const bcells = BALL_KINDS.map(([k, h, t]) => { const n = bag.filter((x) => x.kind === k && x.how === h).length; return cell(n > 0, `<i class="clBall ${k}"></i>`, `${t} ×${n}`); }).join('');
    const hcells = Array.from({ length: HOF_NEED }, (_, i) => { const c = H[i]; return c ? cell(true, `<i class="clMini ${COS.frameClass(c.fr)}"><span>${esc(c.num)}</span></i>`, `${c.name || ''} ${c.grade || ''}`) : cell(false, '<i class="clMini"><span></span></i>', ''); }).join('');
    const sc = ($('.bpSheet', this.el) || {}).scrollTop || 0;
    this.el.innerHTML = `<div class="bpSheet cl">${head('コレクション', 'ぼくらのボールパーク')}
      <div class="clBanner"><i class="clTrophy"></i><b>${have >= total ? 'コンプリート!' : `あと <em>${total - have}</em> 個でコンプリート`}</b></div>
      ${shelf('グラブ', 'i_gl', `${cnt(gl)} / ${gl.length}`, `<div class="clRow">${gcells}</div>`)}
      ${shelf('ユニフォーム', '', `${cnt(un)} / ${un.length}`, `<div class="clRow">${ucells}</div>`)}
      ${shelf('カードの枠', 'i_fr', `${cnt(fr)} / ${fr.length}`, `<div class="clRow">${fcells}</div>`)}
      ${shelf('ボール袋の球', 'i_bag', `${bn} / ${BALL_KINDS.length}`, `<div class="clRow">${bcells}</div><p class="clHint">ボールパークで過ごす中で、客席に飛んできた球を捕るとボール袋に入ります(球を捕った球場 ${STADIUMS.filter((s) => bag.some((x) => x.st === s.id)).length} / ${STADIUMS.length})</p>${rw('ball')}`)}
      ${shelf('殿堂の選手', 'i_crown', `${hn} / ${HOF_NEED}`, `<div class="clRow">${hcells}</div><p class="clHint">守備のキャリアのプロで 5 試合を終えた選手が、殿堂に残ります</p>${rw('hof')}`)}
      <div class="clFoot"><button class="lkTry" data-act="locker">ロッカーへ</button></div>
      <p class="lkNote">ごほうびは見た目(枠と称号)だけで、ボール袋と殿堂だけに付きます。くじ引きや、買った物をそろえると何かが当たる仕組みはありません。</p></div>`;
    const sh = $('.bpSheet', this.el); if (sh) sh.scrollTop = sc;
  },
};

// ---------------------------------------------------------------- 選手カードの絵を X に出す(枠・ユニフォーム・グラブ・名前・UZR)
// 11/27 カードの面(枠・ユニフォームの絵・背番号)だけを描く所を分けた(js/share_x.js のキャリア完了の絵でも使う)
async function drawCard(g, D, cx, cy, cw, ch) {
  const e = COS.eq(), fr = FR[frKey(D.fr || e.frame)] || FR.basic, k = cw / 420, rr = 28 * k, m = 14 * k;
  const rect = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const fg = g.createLinearGradient(cx, cy, cx + cw, cy + ch); fr.forEach((c, i) => fg.addColorStop(i / Math.max(1, fr.length - 1), c));
  rect(cx, cy, cw, ch, rr); g.fillStyle = fg; g.fill();
  rect(cx + m, cy + m, cw - 2 * m, ch - 2 * m, rr - 10 * k); g.save(); g.clip();
  const art = await COS.uniArt(D.uni || e.uni);
  await new Promise((res) => { const im = new Image(); im.onload = () => { const s = Math.max((cw - 2 * m) / im.width, (ch - 2 * m) / im.height); g.drawImage(im, cx + m + ((cw - 2 * m) - im.width * s) / 2, cy + m, im.width * s, im.height * s); res(); }; im.onerror = res; im.src = art || 'img/career_card_back.webp'; });
  g.font = `900 ${Math.round(120 * k)}px "Arial Black",sans-serif`; g.textAlign = 'center'; g.fillStyle = 'rgba(37,58,104,.92)'; g.strokeStyle = '#e8eef8'; g.lineWidth = 5 * k;
  g.strokeText(String(D.num ?? ''), cx + cw * 0.56, cy + ch * 0.5); g.fillText(String(D.num ?? ''), cx + cw * 0.56, cy + ch * 0.5);
  g.restore();
}
async function shareCard(src) {
  const D = src || (window.__career && window.__career.data) || {};
  const e = COS.eq(), W = 1200, H = 675;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0a1f4d'); bg.addColorStop(0.62, '#123a7a'); bg.addColorStop(0.63, '#1f6b2c'); bg.addColorStop(1, '#14501f'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  await drawCard(g, D, 60, 50, 420, 575);
  try {
    const gc = document.createElement('canvas'); gc.width = 420; gc.height = 360; gc.style.cssText = 'position:fixed;left:-9999px;top:0;width:420px;height:360px'; document.body.appendChild(gc);
    const v = new GloveView(gc, { keep: true, still: true }); v.color = D.gc || e.gcolor; v.pat = D.gp || e.gpat; await v.ready; v.frame();
    g.drawImage(gc, 720, 300, 420, 360); v.dispose(); gc.remove();
  } catch (er) { /* グラブなしで */ }
  const K = (window.__career && window.__career.K) || {};
  g.textAlign = 'left'; g.fillStyle = '#ffe08a'; g.font = '900 30px "Dela Gothic One",sans-serif'; g.fillText('ぼくらのボールパーク', 530, 95);
  g.fillStyle = '#fff'; g.font = '900 64px "Dela Gothic One",sans-serif'; g.fillText(String(D.name || 'あなた'), 530, 180);
  const ttl = COS.titleText(D.ttl || e.title); if (ttl) { g.fillStyle = '#ffd23a'; g.font = '700 30px sans-serif'; g.fillText(`〈${ttl}〉`, 530, 228); }
  g.fillStyle = '#cfe0ff'; g.font = '700 32px sans-serif';
  const pos = (K.POS_NAME && K.POS_NAME[D.pos]) || D.pos || '';
  const P = D.pro; const line = P ? `${pos} ・ プロ ${P.games} 試合 ・ UZR ${P.adj >= 0 ? '+' : '−'}${Math.abs(P.adj).toFixed(2)}${D.grade ? ` ・ 評価 ${D.grade}` : ''}` : `${pos}`;
  g.fillText(line, 530, 280);
  const gn = `${(COS.get(D.gc || e.gcolor) || {}).name || ''}${(D.gp || e.gpat) !== 'gp_plain' ? '・' + ((COS.get(D.gp || e.gpat) || {}).name || '') : ''}`;
  g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '600 22px sans-serif'; g.fillText(`枠: ${(COS.get(D.fr || e.frame) || {}).name || ''} ・ グラブ: ${gn}`, 530, 640);
  window.__bpLastShare = cv.toDataURL('image/jpeg', 0.85);   // 試験で見る
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  const text = `${D.name || ''}の選手カード #ぼくらのボールパーク`;
  const file = blob && new File([blob], 'bokura_card.png', { type: 'image/png' });
  // 11/27 共有の出し方(アプリの部品・スマホの共有・PC の X の投稿画面)は js/share_x.js にまとめた。無い時は前の形
  if (window.__bpShareX && blob) { window.__bpShareX.sheet({ blob, name: 'bokura_card.png', text: window.__bpShareX.withTags(`${D.name || ''}の選手カード`), alt: '選手カードの絵' }); return 'sheet'; }
  try { if (file && matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], text }).catch(() => {}); return 'shared'; } } catch (er) { /* 下へ */ }
  showShare(cv.toDataURL('image/png'), text);
  return 'shown';
}
function showShare(url, text) {
  let el = $('#bpShare');
  if (!el) { el = document.createElement('div'); el.id = 'bpShare'; document.body.appendChild(el); stop(el); el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-x]')) { e.stopPropagation(); el.classList.add('hide'); } }); }
  const x = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
  el.innerHTML = `<div class="shBox"><img src="${url}" alt="選手カードの絵"><p>絵を保存して(長押し・右クリック)、X の投稿に付けてください</p>
    <div class="shRow"><a class="lkTry" href="${url}" download="bokura_card.png">絵を保存</a><a class="lkBuy" href="${x}" target="_blank" rel="noopener">X で投稿する</a><button class="lkTry" data-x="1">閉じる</button></div></div>`;
  el.classList.remove('hide');
}

// ---------------------------------------------------------------- タイトルの小さなボタン(ロッカー・コレクション・アプリ版はショップも)
function dock() {
  const t = $('#title'); if (!t) return;
  let d = $('#bpDock');
  if (!d) {
    d = document.createElement('div'); d.id = 'bpDock'; t.appendChild(d); stop(d);
    d.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; e.stopPropagation(); const a = b.dataset.act; if (a === 'locker') L.open('glove'); else if (a === 'coll') Coll.open(); else if (a === 'shop') { const S = store(); if (S && S.openShop) S.openShop(''); } });
  }
  const want = `<button data-act="locker"><i style="background-image:url('img/shop2_i_gl.webp')"></i>ロッカー</button><button data-act="coll"><i style="background-image:url('img/shop2_trophy.webp')"></i>コレクション</button>${isApp() ? `<button data-act="shop"><i style="background-image:url('img/shop2_chest.webp')"></i>ショップ</button>` : ''}`;
  if (d.dataset.k !== String(isApp())) { d.innerHTML = want; d.dataset.k = String(isApp()); }
}
setInterval(() => { try { dock(); } catch (e) { /* なし */ } }, 800);
dock();
// コレクションのごほうびが新しく使えるようになったら、一度だけ小さく知らせる
setInterval(() => {
  const t = $('#title'); if (!t || t.classList.contains('hide')) return;
  const n = COS.newlyUnlocked(); if (!n.length) return;
  let el = $('#bpToast'); if (!el) { el = document.createElement('div'); el.id = 'bpToast'; document.body.appendChild(el); }
  el.textContent = `コレクションのごほうび: ${n.map((c) => c.name).join('・')} が使えます(ロッカー)`; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 4200);
}, 3000);

window.__bpLocker = { open: (t, after) => L.open(t, after), close: () => L.close(), coll: () => Coll.open(), share: shareCard, drawCard, artNow, head, shelf, patSwatch, GloveView,
  render: () => { if (L.el && !L.el.classList.contains('hide')) L.render(); if (Coll.el && !Coll.el.classList.contains('hide')) Coll.render(); }, FR };
COS.onChange(() => { try { const C = window.__career; if (C && C.ui && C.ui.card && !C.ui.card.classList.contains('hide')) C.ui.renderCard(false); } catch (e) { /* なし */ } });
