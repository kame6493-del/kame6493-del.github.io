// 球場の名物(ギミック)。11/20 持ち主「ちゃんと写真を見て忠実にして各球場もギミック作ってください」。
// 12 球場それぞれの、来た人が「この球場だ」と分かる物を、本物の写真に合わせて形・色・字・置き場所を作る。根拠は docs\球場の名物.md。
// main.js からは new Gimmicks(hooks) と update(dt)・action(mode)・setLite(on) を呼ぶだけ。光源は足さない。
// 描く回数を増やさないよう、色だけの部品は球場ごとに 1 つの形にまとめる(頂点の色)。字の板は 1 枚の絵(アトラス)にまとめて 1 回。
// 軽い画質(lite・自動)では細かい部品(detail)を描かない。
// 地図に印を出す時は list() で { id, name, x, y, z, kind } の一覧を返す(wayfinding.js の作業者が読む)。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const D2R = Math.PI / 180;
const lsGet = (k, d) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 使えない環境 */ } };

// ---------------------------------------------------------------- 形を集めて 1 つにまとめる道具
// 部品はみな「置き場所の座標系」(原点 = 置く点の地面、+z = 前(見る人の方)、+x = 右)で作り、最後に世界へ写す。
class Kit {
  constructor() { this.parts = { base: [], detail: [], glow: [] }; this.signs = []; this.M = new THREE.Matrix4(); this.stack = []; }
  // 置き場所の座標系に入る(x, y, z と y 軸の回り ry 度)
  at(x, y, z, ry = 0) { this.stack.push(this.M.clone()); const m = new THREE.Matrix4().makeRotationY(ry * D2R).setPosition(x, y, z); this.M = this.M.clone().multiply(m); return this; }
  end() { this.M = this.stack.pop() || new THREE.Matrix4(); return this; }
  _add(g, col, o = {}) {
    const m = new THREE.Matrix4();
    const e = new THREE.Euler((o.rx || 0) * D2R, (o.ry || 0) * D2R, (o.rz || 0) * D2R);
    m.compose(V(o.x || 0, o.y || 0, o.z || 0), new THREE.Quaternion().setFromEuler(e), V(o.sx || 1, o.sy || 1, o.sz || 1));
    g.applyMatrix4(m); g.applyMatrix4(this.M);
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
    this.parts[o.glow ? 'glow' : o.detail ? 'detail' : 'base'].push(g);
    return this;
  }
  // 箱: 底の真ん中が (x, y, z)
  box(w, h, d, col, o = {}) { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return this._add(g, col, o); }
  // 円柱: 底の真ん中が (x, y, z)
  cyl(rt, rb, h, col, o = {}) { const g = new THREE.CylinderGeometry(rt, rb, h, o.seg || 12, 1, !!o.open, o.t0 || 0, o.tl || Math.PI * 2); g.translate(0, h / 2, 0); return this._add(g, col, o); }
  sphere(r, col, o = {}) { const g = new THREE.SphereGeometry(r, o.seg || 12, o.segv || 8, 0, Math.PI * 2, 0, o.half ? Math.PI / 2 : Math.PI); return this._add(g, col, o); }
  cone(r, h, col, o = {}) { const g = new THREE.ConeGeometry(r, h, o.seg || 12); g.translate(0, h / 2, 0); return this._add(g, col, o); }
  torus(R, r, col, o = {}) { const g = new THREE.TorusGeometry(R, r, o.segr || 6, o.seg || 24, o.arc || Math.PI * 2); return this._add(g, col, o); }
  plane(w, h, col, o = {}) { const g = new THREE.PlaneGeometry(w, h); return this._add(g, col, o); }
  // 押し出した形(xy の点の列、厚み d。+z へ押し出す)
  shape(pts, d, col, o = {}) { const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))); const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: o.cs || 8 }); return this._add(g, col, o); }
  // 字の板(絵は後で 1 枚の絵にまとめる)。draw(ctx, W, H) で描く。w×h m、(x, y, z) が板の真ん中、ry で向き
  sign(w, h, draw, o = {}) { const m = new THREE.Matrix4(); const e = new THREE.Euler((o.rx || 0) * D2R, (o.ry || 0) * D2R, 0); m.compose(V(o.x || 0, o.y || 0, o.z || 0), new THREE.Quaternion().setFromEuler(e), V(1, 1, 1)); this.signs.push({ w, h, draw, M: this.M.clone().multiply(m), px: o.px || 128, both: !!o.both, detail: !!o.detail }); return this; }
}

// 字を描く道具(canvas)
export function txt(ctx, s, x, y, size, col, o = {}) {
  ctx.font = `${o.weight || 700} ${size}px ${o.font || '"Hiragino Sans","Yu Gothic","Meiryo",sans-serif'}`;
  ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
  if (o.stroke) { ctx.lineWidth = o.stroke; ctx.strokeStyle = o.strokeCol || '#000'; ctx.strokeText(s, x, y, o.max); }
  ctx.fillStyle = col; ctx.fillText(s, x, y, o.max);
}

// ---------------------------------------------------------------- 球場ごとの名物(下の BUILD に球場の id で)
// 各関数は G(この class)を受け取り、G.kit に形を足し、G.spot(触れる所)・G.anim(動く物)・G.mark(地図の印)を登録する。
const BUILD = {};

export class Gimmicks {
  constructor(h) {
    this.h = h; this.scene = h.scene; this.id = h.stadium;
    this.spots = []; this.anims = []; this.marks = []; this.meshes = { base: null, detail: null, glow: null, signs: null, signsDetail: null };
    this.group = new THREE.Group(); this.group.name = 'gimmicks'; this.scene.add(this.group);
    this.t = 0; this.busy = null; this.lite = false;
    this.kit = new Kit();
    this.game = { g: null, half: null, us: 0, them: 0, over: false, hrUs: 0, hrThem: 0 };
    try { const f = BUILD[this.id]; if (f && !(h.params && h.params.has('nogimmick'))) f(this); } catch (e) { console.error('gimmicks', e); }
    this.finish();
  }
  // ---- 置く時に使う
  ground(x, z, from = 30, max = 60) { const y = this.h.groundAt(x, z, from, max); return y == null ? 0 : y; }
  spot(o) { this.spots.push(o); return o; }   // { x, z, y?, r, label, run, when?() }
  anim(f) { this.anims.push(f); return f; }   // f(dt, t)
  mark(id, name, x, y, z, kind = 'sight') { this.marks.push({ id, name, x, y, z, kind }); }
  say(msg, sub) { const fp = this.h.freeplay && this.h.freeplay(); if (fp && fp.say) fp.say(msg, sub); else if (this.h.toast) this.h.toast(msg, sub); }
  mat(o = {}) { return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.0, ...o }); }
  // 動く物・別の材質の物を足す(1 つずつ描く回数が増えるので、少なく)
  add(o, detail = false) { o.userData.gDetail = detail; this.group.add(o); return o; }

  finish() {
    const K = this.kit;
    const mk = (list, mat) => { if (!list.length) return null; const g = mergeGeometries(list, false); g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; this.group.add(m); return m; };
    this.meshes.base = mk(K.parts.base, this.mat());
    this.meshes.detail = mk(K.parts.detail, this.mat());
    this.meshes.glow = mk(K.parts.glow, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    if (this.meshes.glow) this.meshes.glow.castShadow = false;
    // 字の板: 1 枚の絵(アトラス)に並べ、1 つの形で描く(細かい物は別)
    for (const det of [false, true]) {
      const S = K.signs.filter((s) => s.detail === det); if (!S.length) continue;
      const W = 2048; let x = 0, y = 0, rowH = 0; const cells = [];
      for (const s of S) { const pw = Math.min(W, Math.round(s.px * s.w)), ph = Math.round(s.px * s.h); if (x + pw > W) { x = 0; y += rowH + 2; rowH = 0; } cells.push({ s, x, y, pw, ph }); x += pw + 2; rowH = Math.max(rowH, ph); }
      const H = Math.min(4096, THREE.MathUtils.ceilPowerOfTwo(y + rowH));
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
      const geos = [];
      for (const c of cells) {
        ctx.save(); ctx.beginPath(); ctx.rect(c.x, c.y, c.pw, c.ph); ctx.clip(); ctx.translate(c.x, c.y); c.s.draw(ctx, c.pw, c.ph); ctx.restore();
        const g = new THREE.PlaneGeometry(c.s.w, c.s.h); const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (c.x + uv.getX(i) * c.pw) / W, 1 - (c.y + (1 - uv.getY(i)) * c.ph) / H);
        g.applyMatrix4(c.s.M); geos.push(g);
        if (c.s.both) { const b = g.clone(); const idx = b.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; } const nn = b.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, -nn.getX(i), -nn.getY(i), -nn.getZ(i)); geos.push(b); }
      }
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const m = new THREE.Mesh(mergeGeometries(geos, false), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
      m.matrixAutoUpdate = false; m.receiveShadow = true; this.group.add(m);
      this.meshes[det ? 'signsDetail' : 'signs'] = m;
    }
    this.setLite(this.lite);
  }
  setLite(on) {
    this.lite = !!on;
    if (this.meshes.detail) this.meshes.detail.visible = !on;
    if (this.meshes.signsDetail) this.meshes.signsDetail.visible = !on;
    for (const o of this.group.children) if (o.userData.gDetail) o.visible = !on;
  }

  // ---- 地図の印の一覧(wayfinding.js の作業者が読む形)
  list() { return this.marks.map((m) => ({ ...m })); }

  // ---- 近くで E でできること
  action(mode) {
    if (this.busy) return this.busy.label ? { label: this.busy.label, run: () => this.busy && this.busy.stop && this.busy.stop() } : null;
    if (mode !== 'walk') return null;
    const p = this.h.player.pos; let best = null, bd = 1e9;
    for (const s of this.spots) {
      const d = Math.hypot(p.x - s.x, p.z - s.z); if (d > s.r) continue;
      if (s.y != null && Math.abs(p.y - s.y) > (s.dy || 2.5)) continue;
      if (s.when && !s.when()) continue;
      if (d < bd) { bd = d; best = s; }
    }
    return best ? { label: typeof best.label === 'function' ? best.label() : best.label, run: () => best.run() } : null;
  }

  // ---- 毎こま
  update(dt) {
    this.t += dt;
    for (const f of this.anims) f(dt, this.t);
    if (this.busy && this.busy.tick) this.busy.tick(dt);
    this.watchGame();
  }
  // 試合の流れを読む(defense.js の g を見るだけ)。onGame(ev) を球場ごとに付ける: 'start' 'half' 'runUs' 'runThem' 'hrUs' 'hrThem' 'end'
  watchGame() {
    if (!this.onGame) return;
    const d = this.h.defense && this.h.defense(), g = d && d.g;
    if (!g || d.kind !== 'game') { this.game.g = null; return; }
    const G = this.game, sc = g.score || { us: 0, them: 0 };
    const w = this.h.watch && this.h.watch(), st = w && w.on && w.stats && w.stats.HR ? w.stats.HR : null;
    if (G.g !== g) { G.g = g; G.half = g.inning + g.half; G.us = sc.us; G.them = sc.them; G.over = !!g.over; G.hrUs = st ? st.us : 0; G.hrThem = st ? st.them : 0; this.onGame('start', g); return; }
    const h = g.inning + g.half; if (h !== G.half) { G.half = h; this.onGame('half', g); }
    if (st && st.us > G.hrUs) { G.hrUs = st.us; this.onGame('hrUs', g); }
    if (st && st.them > G.hrThem) { G.hrThem = st.them; this.onGame('hrThem', g); }
    if (sc.us > G.us) { G.us = sc.us; this.onGame('runUs', g); }
    if (sc.them > G.them) { G.them = sc.them; this.onGame('runThem', g); }
    if (g.over && !G.over) { G.over = true; this.onGame('end', g); }
  }

  // ---- 共通の演出
  // カメラを決めた所に置いて見せる(歩きの人は動かない。動くか E で戻る)
  camShow(label, sec, setCam) {
    const c = this.h.camera; this.h.setCamOverride(true);
    const b = this.busy = { label, t: 0, stop: () => { this.h.setCamOverride(false); this.busy = null; } };
    b.tick = (dt) => { b.t += dt; setCam(c, b.t); const i = this.h.input && this.h.input(); if (b.t > sec || (b.t > 0.4 && i && (Math.abs(i.f) > 0.1 || Math.abs(i.r) > 0.1))) b.stop(); };
    setCam(c, 0);
  }
  // 音を合成して鳴らす(ファイルを足さない)
  audio() { const S = this.h.sound; return S && S.ctx && S.sfxBus ? S : null; }
}

export { BUILD, Kit, V, D2R, lsGet, lsSet };

// ================================================================ 共通の部品
// 置き場所の外向き: 球場の真ん中 (0, -40) から見た向き(度)。at(..., outRy(x, z)) で +z が外を向く
const outRy = (x, z) => Math.atan2(x, z + 40) / D2R;
// 字の板の地と字
const plate = (bg, lines, o = {}) => (ctx, W, H) => {
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  if (o.border) { ctx.strokeStyle = o.border; ctx.lineWidth = Math.max(2, H * 0.06); ctx.strokeRect(H * 0.05, H * 0.05, W - H * 0.1, H - H * 0.1); }
  const n = lines.length;
  lines.forEach((l, i) => { const s = typeof l === 'string' ? { t: l } : l; txt(ctx, s.t, W / 2, H * (i + 0.5) / n + (s.dy || 0) * H, (s.size || 0.55 / Math.max(1, n * 0.8)) * H, s.col || o.col || '#fff', { max: W * 0.92, weight: s.w || 700, font: s.font || o.font }); });
};
// 縦書き
const vplate = (bg, s, col, o = {}) => (ctx, W, H) => {
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const ch = [...s], sz = Math.min(W * 0.78, H / (ch.length + 0.6));
  ch.forEach((c, i) => txt(ctx, c, W / 2, H * 0.5 + (i - (ch.length - 1) / 2) * sz * 1.08, sz, col, { font: o.font, weight: o.w || 700 }));
};
const MINCHO = '"Yu Mincho","Hiragino Mincho ProN","MS Mincho",serif';

// モーターサイレン(高校野球の試合の始め・終わり)。約 16 秒(記事で測った長さ)。ファイルを足さずに合成する
function motorSiren(S, sec = 16, gain = 0.32) {
  const c = S.ctx, t0 = c.currentTime + 0.05, up = 3.2, down = 4.0, hold = Math.max(1, sec - up - down);
  const out = c.createGain(); out.gain.value = 0; out.connect(S.ambBus || S.sfxBus);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; lp.Q.value = 0.7; lp.connect(out);
  const oscs = [];
  for (const [type, mul, g] of [['sawtooth', 1, 0.5], ['square', 1.006, 0.25], ['sine', 2, 0.25]]) {
    const o = c.createOscillator(); o.type = type; const og = c.createGain(); og.gain.value = g; o.connect(og); og.connect(lp);
    const f = o.frequency; f.setValueAtTime(80 * mul, t0); f.exponentialRampToValueAtTime(560 * mul, t0 + up); f.setValueAtTime(560 * mul, t0 + up + hold); f.exponentialRampToValueAtTime(70 * mul, t0 + up + hold + down);
    o.start(t0); o.stop(t0 + sec + 0.2); oscs.push(o);
  }
  const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5.5; lg.gain.value = 6; lfo.connect(lg); for (const o of oscs) lg.connect(o.frequency); lfo.start(t0); lfo.stop(t0 + sec + 0.2);
  const G = out.gain; G.setValueAtTime(0, t0); G.linearRampToValueAtTime(gain, t0 + 1.2); G.setValueAtTime(gain, t0 + up + hold); G.linearRampToValueAtTime(0, t0 + sec);
}
// 打ち上げ花火の音(どん・ぱらぱら)。合成
function boom(S, at = 0, gain = 0.5) {
  const c = S.ctx, t0 = c.currentTime + at, n = c.sampleRate * 1.6 | 0, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) { const t = i / c.sampleRate; d[i] = (Math.random() * 2 - 1) * (Math.exp(-t * 7) + 0.25 * Math.exp(-t * 2) * (Math.random() < 0.02 ? 3 : 0.3)); }
  const s = c.createBufferSource(); s.buffer = b; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; const g = c.createGain(); g.gain.value = gain;
  s.connect(lp); lp.connect(g); g.connect(S.ambBus || S.sfxBus); s.start(t0);
}

// 丸い粒の絵(1 つを使い回す)
let _dot = null;
function dotTex() { if (_dot) return _dot; const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.55, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); _dot = new THREE.CanvasTexture(c); return _dot; }
// 小さな粒(土・紙吹雪・花火)を 1 回の描画で飛ばす。光源なし
class Burst {
  constructor(G, n, size, colors, o = {}) {
    const g = new THREE.BufferGeometry(); this.n = n;
    this.p = new Float32Array(n * 3).fill(-999); this.v = new Float32Array(n * 3); this.c = new Float32Array(n * 3); this.life = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.c, 3));
    this.colors = colors.map((x) => new THREE.Color(x));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size, map: dotTex(), alphaTest: o.glow ? 0 : 0.3, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false, toneMapped: !o.glow, blending: o.glow ? THREE.AdditiveBlending : THREE.NormalBlending, fog: !o.glow }));
    this.pts.frustumCulled = false; this.pts.visible = false; this.grav = o.grav ?? -9.8; this.drag = o.drag ?? 0; this.k = 0;
    G.group.add(this.pts); G.anim((dt) => this.step(dt));
  }
  emit(at, vel, spread, count, life = 2.5, col) {
    for (let j = 0; j < count; j++) {
      const i = this.k = (this.k + 1) % this.n;
      this.p[i * 3] = at.x; this.p[i * 3 + 1] = at.y; this.p[i * 3 + 2] = at.z;
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u), s = spread * (0.6 + Math.random() * 0.4);
      this.v[i * 3] = vel.x + Math.cos(a) * r * s; this.v[i * 3 + 1] = vel.y + u * s; this.v[i * 3 + 2] = vel.z + Math.sin(a) * r * s;
      const cc = col != null ? new THREE.Color(col) : this.colors[(Math.random() * this.colors.length) | 0]; this.c[i * 3] = cc.r; this.c[i * 3 + 1] = cc.g; this.c[i * 3 + 2] = cc.b;
      this.life[i] = life * (0.7 + Math.random() * 0.3);
    }
    this.pts.visible = true; this.alive = true;
  }
  step(dt) {
    if (!this.alive) return; let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue; this.life[i] -= dt;
      if (this.life[i] <= 0) { this.p[i * 3 + 1] = -999; continue; } any = true;
      const d = Math.max(0, 1 - this.drag * dt); this.v[i * 3] *= d; this.v[i * 3 + 2] *= d; this.v[i * 3 + 1] = this.v[i * 3 + 1] * d + this.grav * dt;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
    }
    this.pts.geometry.attributes.position.needsUpdate = true; this.pts.geometry.attributes.color.needsUpdate = true;
    if (!any) { this.alive = false; this.pts.visible = false; }
  }
}
// 置き場所の座標系の点 (lx, lz) を世界へ
const toWorld = (C, ry, lx, lz) => { const s = Math.sin(ry * D2R), c = Math.cos(ry * D2R); return { x: C.x + lx * c + lz * s, z: C.z - lx * s + lz * c }; };

// ================================================================ 浜風(甲子園)
// 1 野球塔(左翼の外周、歴史館の入口の前。高さ 15 m の灰色の角柱と、まわりに円く並ぶ 20 本の柱=優勝校の銘板)
// 2 大運動場の記念碑(開場当時の姿の浮き彫りをはめ込んだ御影石。野球塔のそば)
// 3 試合の始め・終わりのサイレン(高校野球。銀傘の下の真ん中のモーターサイレン、約 16 秒)
// 4 ベンチ前で土を袋に詰める(高校野球の、試合のあとの習わし。E)
BUILD.koshien = (G) => {
  const K = G.kit;
  // ---- 1・2 野球塔の広場: 17 号門の跡(16 号門 (-86, -131) と 18 号門 (-28, -156) の間)の外
  const C = { x: -62.5, z: -161.5 }, ry = outRy(C.x, C.z), y0 = G.ground(C.x, C.z);
  K.at(C.x, y0, C.z, ry);
  // 円い敷石(灰色と赤茶のれんがの同心円)。地面の 3 cm 上に寝かせた板
  K.sign(22, 22, (ctx, W, H) => {
    ctx.fillStyle = '#8e8a84'; ctx.fillRect(0, 0, W, H);
    for (let r = 11, k = 0; r > 0; r -= 1.1, k++) { ctx.beginPath(); ctx.arc(W / 2, H / 2, r / 22 * W, 0, Math.PI * 2); ctx.fillStyle = k % 3 === 0 ? '#9c6a52' : (k % 2 ? '#a7a39b' : '#8f8b85'); ctx.fill(); }
    ctx.strokeStyle = 'rgba(60,55,50,0.35)'; ctx.lineWidth = 1; for (let a = 0; a < 48; a++) { ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.lineTo(W / 2 + Math.cos(a / 48 * Math.PI * 2) * W, H / 2 + Math.sin(a / 48 * Math.PI * 2) * W); ctx.stroke(); }
  }, { y: 0.03, rx: -90, px: 24 });
  // 野球塔: 台(2.6 m 角・0.9 m)と、灰色のコンクリートの角柱(下 1.7 m → 上 1.3 m、高さ 15 m)。上の方に縦書きの「野球塔」
  K.box(2.6, 0.9, 2.6, 0x8b8984, { y: 0.03 });
  { const g = new THREE.CylinderGeometry(0.92, 1.2, 14.1, 4, 1); g.rotateY(Math.PI / 4); g.translate(0, 0.93 + 7.05, 0); K._add(g, 0xa9a7a1); }
  K.box(1.95, 0.35, 1.95, 0x9a9893, { y: 15.0 });   // 頭の縁
  K.sign(0.9, 3.6, vplate('#6f6d68', '野球塔', '#ecebe6', { font: MINCHO }), { y: 11.6, z: 0.97, px: 80 });
  // まわりの柱: 20 本を球場の壁の側に円く。四角い柱(0.95×2.8×0.5)、内側に黒い銘板
  for (let i = 0; i < 20; i++) {
    const a = (-100 + i * 200 / 19) * D2R, R = 8.5;
    K.at(Math.sin(a) * R, 0, -Math.cos(a) * R, -a / D2R);
    K.box(0.95, 2.8, 0.5, 0xb5b3ad, {}); K.box(1.1, 0.18, 0.6, 0x9c9a95, { y: 2.8 });
    K.box(0.62, 0.9, 0.03, 0x2a2a2a, { y: 1.35, z: 0.26, detail: true });
    K.end();
  }
  // 柱の間をつなぐ低い板(写真の、柱の間の板)
  for (let i = 0; i < 19; i++) { const a = (-100 + (i + 0.5) * 200 / 19) * D2R, R = 8.6; K.at(Math.sin(a) * R, 0, -Math.cos(a) * R, -a / D2R); K.box(0.55, 2.2, 0.2, 0xc3c1bb, { z: -0.1 }); K.end(); }
  // 大運動場の記念碑: 濃い灰色の御影石、上に開場当時の姿の浮き彫り(ブロンズ)、黒い名の板、下に銅色の板
  K.at(-6.2, 0, 6.5, 25);
  K.box(1.7, 0.25, 0.85, 0x5e5d5b, {}); K.box(1.55, 1.75, 0.7, 0x6b6a67, { y: 0.25 });
  K.shape([[-0.62, 0], [0.62, 0], [0.62, 0.55], [0.35, 0.82], [-0.35, 0.82], [-0.62, 0.55]], 0.08, 0x5a4a32, { y: 1.02, z: 0.33 });   // 浮き彫りの台(本塁形の枠)
  K.cyl(0.4, 0.4, 0.06, 0x7a6440, { y: 1.42, z: 0.4, rx: 90, seg: 20 });   // 球場の輪の浮き彫り
  K.torus(0.33, 0.05, 0x8a734c, { y: 1.42, z: 0.45, seg: 20 });
  K.sign(0.9, 0.16, plate('#1c1c1c', [{ t: '大運動場', col: '#d8d2c0', size: 0.7 }], { font: MINCHO }), { y: 0.93, z: 0.356, px: 200 });
  K.box(1.0, 0.55, 0.03, 0xd2661e, { y: 0.32, z: 0.35 });   // 銅色の板(写真のだいだい)
  K.end();
  // 円い植え込み(記念碑の横の、低い円い縁と緑)
  K.at(-9.5, 0, 4.0); K.cyl(1.6, 1.6, 0.45, 0xa8a49c, { seg: 18 }); K.cyl(1.5, 1.5, 0.55, 0x3f6a33, { seg: 18 }); K.end();
  K.end();
  G.mark('yakyutou', '野球塔', C.x, y0, C.z, 'sight');
  const pm = toWorld(C, ry, -6.2, 6.5);
  G.spot({ x: pm.x, z: pm.z, r: 2.6, label: '記念碑を読む', run: () => G.say('大運動場の記念碑', '開場した時の球場の姿を写した浮き彫り') });
  G.spot({ x: C.x, z: C.z, r: 4.0, label: '野球塔を見上げる', run: () => {
    const p = G.h.player.pos.clone(); G.camShow('もどる', 6, (c, t) => { const k = Math.min(1, t / 2.5); c.position.set(p.x, p.y + 1.5, p.z); c.lookAt(C.x, y0 + 2 + 13 * k, C.z); });
    G.say('野球塔', 'まわりの 20 本の柱に、春と夏の優勝校の名前の板がはめてある');
  } });

  // ---- 3 サイレン(高校野球の応援の時だけ。11/21 持ち主「最初のサイレン要らない、最後だけ」で試合終了だけ鳴らす)
  G.onGame = (ev) => {
    const hs = !window.__crowd || window.__crowd.style !== 'pro';
    return;   // 11/22 持ち主「サイレンはいらないね」始めも終わりも鳴らさない
    if (!hs || ev !== 'end') return;
    const S = G.audio(); if (S) motorSiren(S, 16);
    G.say('サイレン', '試合終了');
  };
  G.test = { siren: () => { const S = G.audio(); if (S) motorSiren(S, 16); } };
  { const o = toWorld(C, ry, 0, 30), o2 = toWorld(C, ry, -2, 13), m = toWorld(C, ry, -6.2, 6.5), far = toWorld(C, ry, 25, 70);
    G.views = [
      { name: '野球塔の広場(外から)', cam: [o.x, y0 + 4, o.z], look: [C.x, y0 + 6, C.z], fov: 65 },
      { name: '記念碑と野球塔', cam: [o2.x, y0 + 1.6, o2.z], look: [m.x, y0 + 1.2, m.z], fov: 60 },
      { name: '球場との位置', cam: [far.x, y0 + 35, far.z], look: [C.x, y0, C.z], fov: 60 },
      { name: 'ベンチ前の土', walk: [25.5, 1.4, 25.5, -3, 0.2], act: '土を袋に詰める', step: 2.4, fromY: 3 },
    ]; }

  // ---- 4 ベンチ前の土。1 塁側のベンチ (28, 4.5) と 3 塁側 (-28, 4.5) の前の土の上
  const bag = new THREE.Group();
  { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.34, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0x1f4fa0, roughness: 0.9, side: THREE.DoubleSide })); b.position.y = 0.17; bag.add(b);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 10), new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 1 })); s.position.y = 0.02; s.name = 'soil'; bag.add(s); }
  bag.visible = false; G.add(bag);
  const dust = new Burst(G, 160, 0.05, [0x2b2520, 0x3a3029, 0x4a3d33]);
  let bags = lsGet('r4walk.gm.soil', 0);
  for (const sx of [28, -28]) {
    G.spot({ x: sx * 0.93, z: 1.2, r: 4.5, y: 0, dy: 0.8, label: '土を袋に詰める', run: () => {
      const P = G.h.player, p = P.pos.clone(), yaw = P.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const gp = V(p.x + fx * 0.6, G.ground(p.x + fx * 0.6, p.z + fz * 0.6, p.y + 1, 3), p.z + fz * 0.6);
      bag.position.set(gp.x + fz * 0.25, gp.y, gp.z - fx * 0.25); bag.visible = true; const soil = bag.getObjectByName('soil'); soil.position.y = 0.02;
      let n = 0, done = false;
      G.camShow('やめる', 4.4, (c, t) => {
        const k = Math.min(1, t / 0.6); c.position.set(p.x - fx * (0.3 + 0.9 * k), p.y + 1.55 - 0.45 * k, p.z - fz * (0.3 + 0.9 * k)); c.lookAt(gp.x + fx * 1.2 * k, gp.y + 0.15 + 0.5 * k, gp.z + fz * 1.2 * k);
        if (t > 0.6 && t < 3.6 && (t * 4 | 0) > n) { n = t * 4 | 0; dust.emit(V(gp.x - fz * 0.15, gp.y + 0.05, gp.z + fx * 0.15), V(fz * 0.9, 1.6, -fx * 0.9), 0.5, 6, 0.6); soil.position.y = Math.min(0.3, 0.02 + (t - 0.6) * 0.09); }
        if (t >= 4.1 && !done) { done = true; bags++; lsSet('r4walk.gm.soil', bags); G.say('土を袋に詰めた', `持ち帰った袋 ${bags}`); }
      });
      setTimeout(() => { bag.visible = false; }, 9000);
    } });
  }
};

// ================================================================ 共通の演出(球場をまたいで使う)
// 観客の席(crowd.js の seats を読むだけ)。filter(x, y, z) に合う席の番号
function seatList(filter, max = 400) {
  const c = window.__crowd, s = c && c.seats; if (!s) return [];
  const all = []; for (let i = 0; i < s.n; i++) if (s.y[i] > -100 && filter(s.x[i], s.y[i], s.z[i])) all.push(i);   // 隠した席(y = -1000)は除く
  if (all.length <= max) return all.map((i) => V(s.x[i], s.y[i], s.z[i]));
  const out = [], step = all.length / max; for (let k = 0; k < max; k++) { const i = all[Math.floor(k * step)]; out.push(V(s.x[i], s.y[i], s.z[i])); }
  return out;
}
const angOf = (x, z) => Math.atan2(x, z) / D2R;   // 本塁の後ろ 0・一塁側 +・センター ±180

// 打ち上げ花火(光る粒。光源なし)。show(n 発, 秒, 打ち上げる所の点の配列)
class Fireworks {
  constructor(G, o = {}) { this.G = G; this.b = new Burst(G, o.n || 2400, o.size || 1.1, [0xff5a4a, 0xffd34a, 0x6ad6ff, 0xb98bff, 0x7dff8a, 0xffffff], { glow: true, grav: -2.2, drag: 1.1 }); this.q = []; this.t = 0; G.anim((dt) => this.step(dt)); }
  show(n, sec, from, o = {}) {
    for (let i = 0; i < n; i++) { const p = from[(Math.random() * from.length) | 0]; this.q.push({ at: this.t + (i / n) * sec + Math.random() * 0.4, p, h: (o.h || 70) + Math.random() * (o.hr || 30), col: [0xff5a4a, 0xffd34a, 0x6ad6ff, 0xb98bff, 0x7dff8a, 0xff8ad8][(Math.random() * 6) | 0] }); }
  }
  step(dt) {
    this.t += dt; if (!this.q.length) return;
    const lite = this.G.lite, S = this.G.audio();
    for (let k = this.q.length - 1; k >= 0; k--) {
      const s = this.q[k]; if (s.at > this.t) continue; this.q.splice(k, 1);
      const top = V(s.p.x, s.p.y + s.h, s.p.z);
      if (s.burst) { this.b.emit(top, V(0, 0, 0), 16 + Math.random() * 6, lite ? 40 : 110, 2.2, s.col); if (S) boom(S, 0, 0.35); continue; }
      this.b.emit(V(s.p.x, s.p.y + s.h * 0.55, s.p.z), V(0, s.h * 0.35, 0), 0.4, lite ? 3 : 8, 0.7, 0xffe6b0);   // 上がる筋
      this.q.push({ ...s, at: this.t + 0.65, burst: true });   // 0.65 秒後に開く(試合の時間で数える)
    }
  }
}

// ジェット風船(細長い風船が笛の音で上がって、くねって落ちる)。1 回の描画
class JetBalloons {
  constructor(G, o = {}) {
    this.G = G; this.n = o.n || 360; this.cols = (o.colors || [0xd9262e]).map((c) => new THREE.Color(c));
    const g = new THREE.CapsuleGeometry(0.07, 0.75, 3, 6); g.rotateX(Math.PI / 2);   // 本物(約 5 cm × 60 cm)より少し大きく(遠くの席から見えるように)
    this.m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.05 }), this.n);
    this.m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.m.frustumCulled = false; this.m.visible = false; this.m.castShadow = false;
    for (let i = 0; i < this.n; i++) this.m.setColorAt(i, this.cols[i % this.cols.length]);
    G.add(this.m); this.st = []; this.on = false; G.anim((dt) => this.step(dt));
    this.o = new THREE.Object3D();
  }
  // from: 席の点の配列
  launch(from) {
    if (!from.length) return;
    const n = this.G.lite ? Math.min(150, this.n) : this.n; this.st = [];
    for (let i = 0; i < n; i++) { const p = from[(Math.random() * from.length) | 0]; this.st.push({ p: V(p.x + (Math.random() - 0.5) * 1.5, p.y + 1.6, p.z + (Math.random() - 0.5) * 1.5), v: V((Math.random() - 0.5) * 3, 13 + Math.random() * 7, (Math.random() - 0.5) * 3), t: -Math.random() * 0.8, w: Math.random() * 6 }); }
    this.m.count = n; this.m.visible = true; this.on = true; this.t = 0;
    const S = this.G.audio(); if (S && S.balloons) S.balloons();
  }
  step(dt) {
    if (!this.on) return; this.t += dt; const o = this.o;
    for (let i = 0; i < this.st.length; i++) {
      const s = this.st[i]; s.t += dt;
      if (s.t < 0) { o.position.set(0, -999, 0); } else {
        if (s.t < 2.2) { s.v.y -= 2.5 * dt; } else { s.v.y = Math.max(-3, s.v.y - 9 * dt); s.v.x += Math.sin(s.t * 7 + s.w) * 6 * dt; s.v.z += Math.cos(s.t * 6 + s.w) * 6 * dt; }
        s.p.addScaledVector(s.v, dt); o.position.copy(s.p);
        o.lookAt(s.p.x + s.v.x, s.p.y + s.v.y, s.p.z + s.v.z);
      }
      o.updateMatrix(); this.m.setMatrixAt(i, o.matrix);
    }
    this.m.instanceMatrix.needsUpdate = true;
    if (this.t > 7) { this.on = false; this.m.visible = false; }
  }
}

// 光の演出(屋根の縁の灯りが色を変えて回り、光の筋がグラウンドをなでる)。光源は足さない(足すとシェーダーの上限を超える)
class LightShow {
  constructor(G, o) {
    this.G = G; this.R = o.R || 100; this.y = o.y || 45; this.c = o.c || V(0, 0, -40); this.cols = (o.colors || [0x2a7bff, 0xffffff]).map((c) => new THREE.Color(c));
    const N = 240, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; pos[i * 3] = this.c.x + Math.sin(a) * this.R * (o.ex || 1); pos[i * 3 + 1] = this.y; pos[i * 3 + 2] = this.c.z - Math.cos(a) * this.R; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.ring = new THREE.Points(g, new THREE.PointsMaterial({ size: o.dot || 3.2, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
    this.ring.frustumCulled = false; this.ring.visible = false; G.add(this.ring);
    // 光の筋: 細長い円すい(加算)8 本
    const cg = new THREE.ConeGeometry(4, 1, 12, 1, true); cg.translate(0, -0.5, 0);
    this.beams = new THREE.InstancedMesh(cg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false }), 8);
    this.beams.frustumCulled = false; this.beams.visible = false; G.add(this.beams);
    this.on = false; this.o = new THREE.Object3D(); G.anim((dt) => this.step(dt));
  }
  play(sec = 20) { this.on = true; this.t = 0; this.sec = sec; this.ring.visible = true; this.beams.visible = !this.G.lite; }
  step(dt) {
    if (!this.on) return; this.t += dt; const t = this.t, N = 240, col = this.ring.geometry.attributes.color, k = this.cols.length;
    const fade = Math.min(1, t / 0.6, (this.sec - t) / 1.2);
    for (let i = 0; i < N; i++) { const ph = (i / N * 6 - t * 1.6) % 1, c = this.cols[(Math.floor(i / N * 6 - t * 1.6) % k + k) % k]; const v = (ph < 0.5 ? 1 : 0.25) * (0.7 + 0.3 * Math.sin(t * 12 + i)) * fade; col.setXYZ(i, c.r * v, c.g * v, c.b * v); }
    col.needsUpdate = true;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + t * 0.7, top = V(this.c.x + Math.sin(a) * this.R * 0.9, this.y, this.c.z - Math.cos(a) * this.R * 0.9);
      const tgt = V(this.c.x + Math.sin(a * 2.3 + t) * 35, 0, this.c.z + 10 - Math.cos(a * 1.7 - t) * 35), d = tgt.clone().sub(top), L = d.length();
      this.o.position.copy(top); this.o.quaternion.setFromUnitVectors(V(0, -1, 0), d.normalize()); this.o.scale.set(1, L, 1); this.o.updateMatrix(); this.beams.setMatrixAt(i, this.o.matrix);
      this.beams.setColorAt(i, this.cols[i % k]);
    }
    this.beams.instanceMatrix.needsUpdate = true; if (this.beams.instanceColor) this.beams.instanceColor.needsUpdate = true;
    this.beams.material.opacity = 0.16 * fade;
    if (t > this.sec) { this.on = false; this.ring.visible = false; this.beams.visible = false; }
  }
}

// 傘を上下に振る(神宮)。観客の席の上に開いた小さな傘。1 回の描画
class Umbrellas {
  constructor(G, pts, colors) {
    this.G = G; this.pts = pts; const n = pts.length;
    const g = new THREE.ConeGeometry(0.48, 0.22, 8, 1, true); g.translate(0, 0.11, 0);
    const stick = new THREE.CylinderGeometry(0.012, 0.012, 0.7, 4); stick.translate(0, -0.25, 0);
    const geo = mergeGeometries([g.toNonIndexed(), stick.toNonIndexed()].map((x) => { for (const k of Object.keys(x.attributes)) if (!['position', 'normal'].includes(k)) x.deleteAttribute(k); return x; }));
    this.m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.55, side: THREE.DoubleSide }), Math.max(1, n));
    this.m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.m.frustumCulled = false; this.m.visible = false; this.m.castShadow = false;
    const cs = colors.map((c) => new THREE.Color(c)); for (let i = 0; i < n; i++) this.m.setColorAt(i, cs[(i * 7919) % cs.length]);
    this.ph = pts.map(() => Math.random() * 0.25); G.add(this.m); this.on = false; this.o = new THREE.Object3D(); G.anim((dt) => this.step(dt));
  }
  play(sec = 40) { if (!this.pts.length) return; this.on = true; this.t = 0; this.sec = sec; this.m.visible = true; this.m.count = this.G.lite ? Math.min(160, this.pts.length) : this.pts.length; }
  step(dt) {
    if (!this.on) return; this.t += dt; const t = this.t, o = this.o, beat = 2.0;   // 1 秒に 2 回(盆踊りの曲の拍に合わせて上下)
    const up = Math.min(1, t / 1.5, (this.sec - t) / 1.5);
    for (let i = 0; i < this.m.count; i++) {
      const p = this.pts[i], s = Math.sin((t + this.ph[i]) * Math.PI * beat);
      o.position.set(p.x, p.y + 1.25 + 0.55 * up + 0.32 * s * up, p.z); o.rotation.set(0.15 * s, i, 0.1 * Math.cos(t * 3 + i)); o.scale.setScalar(Math.max(0.01, up)); o.updateMatrix(); this.m.setMatrixAt(i, o.matrix);
    }
    this.m.instanceMatrix.needsUpdate = true;
    if (t > this.sec) { this.on = false; this.m.visible = false; }
  }
}
// 攻める側(裏 = ホーム)が来た回の、変わり目を拾う道具
const isHalf = (g, inning, half) => g && g.inning === inning && g.half === half;

// 夜か
const isNight = (G) => { try { return G.h.timeKey && G.h.timeKey() === 'night'; } catch (e) { return false; } };
// 球場の外の、本塁から見た角度 ang(度)・距離 r の点(地面の高さ)
const outPt = (G, ang, r) => { const x = Math.sin(ang * D2R) * r, z = Math.cos(ang * D2R) * r; return V(x, G.ground(x, z, 80, 160), z); };
// 地元(裏に攻める側)の応援の席: ビジターの外野(左翼の外野 -180〜-110 度)を除いた席
const homeSeats = (max, exclude = [-180, -112]) => seatList((x, y, z) => { const a = angOf(x, z); return y > 1 && !(a >= exclude[0] && a <= exclude[1]); }, max);
// E で「持っている物を振る」(傘・タオル)。頭の上で上下に動く小さな物
function heldWave(G, mesh, sec, label) {
  const P = G.h.player; mesh.visible = true; let t = 0;
  G.busy = { label: 'やめる', stop: () => { mesh.visible = false; G.busy = null; }, tick: (dt) => {
    t += dt; const yaw = P.yaw; mesh.position.set(P.pos.x - Math.sin(yaw) * 0.35, P.pos.y + 2.0 + 0.3 * Math.sin(t * Math.PI * 2), P.pos.z - Math.cos(yaw) * 0.35); mesh.rotation.set(0.2 * Math.sin(t * Math.PI * 2), yaw, 0);
    if (t > sec) G.busy.stop(); } };
  G.say(label);
}

// ================================================================ 杜ノ丘(神宮)
// 1 傘の応援: 地元が点を取った時と 7 回裏の前に、観客が小さな傘を曲の拍に合わせて上下に振る(緑・紺・透明・赤…)
// 2 夏のナイターの花火: 5 回裏が終わると、球場の外から夜空に上がる
// どちらも観戦・守備の試合で起きる。傘の応援の間は E で自分も傘を振れる
BUILD.park = (G) => {
  let um = null;
  const make = () => um || (um = new Umbrellas(G, seatList((x, y, z) => { const an = angOf(x, z); return y > 1 && an > 12; }, 2400), [0x2f9a4a, 0x2f9a4a, 0x1f3a7a, 0x7fd07a, 0xdfe8ea, 0xd8382a, 0x2f9a4a, 0xf2d03a]));
  const fw = new Fireworks(G);
  const mine = new THREE.Group(); { const c = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.2, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0x2f9a4a, side: THREE.DoubleSide })); c.position.y = 0.1; mine.add(c); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 4), new THREE.MeshStandardMaterial({ color: 0x222222 })); s.position.y = -0.25; mine.add(s); }
  mine.visible = false; G.add(mine);
  const umbrellaShow = (sec) => { make().play(sec); G.say('傘の応援', '地元のファンが小さな傘を上下に振る'); };
  const fireworks = () => { const from = [-25, -10, 5, 20, 35].map((a) => outPt(G, a + 180, 175)); fw.show(G.lite ? 30 : 60, 40, from, { h: 80, hr: 40 }); G.say('花火', '5 回裏が終わって、夜空に花火'); };
  G.onGame = (ev, g) => {
    if (ev === 'half' && isHalf(g, 7, 'bottom')) umbrellaShow(40);
    if (ev === 'runUs') umbrellaShow(25);
    if (ev === 'half' && isHalf(g, 6, 'top') && isNight(G)) fireworks();
  };
  G.spot({ x: 0, z: 0, r: 1e9, label: '傘を振る', when: () => um && um.on && G.h.player.pos.y > 1.0, run: () => heldWave(G, mine, Math.max(2, um.sec - um.t), '傘を振った') });
  G.test = { umbrellas: () => umbrellaShow(40), fireworks };
  G.views = [
    { name: '傘の応援(一塁側の上から)', cam: [62, 22, 30], look: [20, 6, -70], run: 'G.test.umbrellas();', step: 4 },
    { name: '傘の応援(ライトの外野)', cam: [20, 8, -40], look: [70, 10, -100], run: 'G.test.umbrellas();', step: 4.3 },
    { name: '5 回裏の花火(夜・内野から)', cam: [0, 6, 30], look: [0, 60, -150], fov: 70, run: 'G.h.timeKey = () => "night"; window.__app.setTime("night"); G.test.fireworks();', step: 4.5 },
  ];
};

// ================================================================ 汽笛ヶ原(マツダ)
// 1 7 回裏の前の赤いジェット風船: 球場じゅうの地元のファンが歌い終わりで一斉に手を離す(赤一色)
// 2 寝そべる席(外野の人工芝に赤いマットの席): E で寝そべって試合を見る
BUILD.railside = (G) => {
  const jb = new JetBalloons(G, { n: 600, colors: [0xd9262e, 0xd9262e, 0xe8463a, 0xb81d26] });
  const launch = () => { jb.launch(homeSeats(1500)); G.say('ジェット風船', '7 回裏の前、赤い風船が一斉に上がった'); };
  G.onGame = (ev, g) => { if (ev === 'half' && isHalf(g, 7, 'bottom')) launch(); if (ev === 'end' && g.score && g.score.us > g.score.them) launch(); };
  G.test = { balloons: launch };
  G.views = [
    { name: '7 回裏の前の赤い風船(内野から)', cam: [0, 4, 12], look: [0, 25, -60], fov: 75, run: 'G.test.balloons();', step: 1.6 },
    { name: '赤い風船(外野から本塁へ)', cam: [0, 12, -100], look: [0, 18, 20], fov: 75, run: 'G.test.balloons();', step: 1.8 },
  ];
  railNeso(G);
};

// 入場ゲートの一覧(passages.js の nav。a = 中の口、b = 外の口)
const gatesOf = (G) => { try { const ps = G.h.passages && G.h.passages(); return ps ? ps.nav().filter((g) => g.kind === 'gate' && g.a && g.b) : []; } catch (e) { return []; } };

// 回転ドア(屋根を空気で支える球場の出入口): ガラスの筒と 4 枚の羽根。近づくと回り、中から外へ抜けると背中を風に押される
function revolvingDoor(G, x, y, z, ry, o = {}) {
  const R = o.R || 1.5, H = 2.5, K = G.kit;
  K.at(x, y, z, ry);
  K.cyl(R + 0.12, R + 0.12, 0.35, 0x34383c, { seg: 20, y: H });            // 天井の円盤(ステンレス)
  K.cyl(R + 0.1, R + 0.1, 0.05, 0x2b2e31, { seg: 20 });                    // 床の輪
  K.cyl(0.09, 0.09, H, 0x34383c, { seg: 8 });                                // 軸
  for (const s of [1, -1]) K.cyl(R + 0.05, R + 0.05, H, 0x3a3f44, { seg: 10, open: true, t0: (s > 0 ? 0.35 : Math.PI + 0.35), tl: Math.PI - 0.7, detail: true });   // 左右の曲がったガラス(脇の半分)
  K.end();
  return { x, y, z, ry, R, H, rot: ry * D2R, spin: 0 };
}

// 回転ドアの羽根(4 枚のガラスと上下の枠)を、全部のドアで 2 回の描画にまとめる(InstancedMesh)
function doorWings(G, doors) {
  if (!doors.length) return null;
  const R = doors[0].R, H = doors[0].H, gl = [], fr = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Matrix4().makeRotationY(i * Math.PI / 2);
    const g = new THREE.BoxGeometry(R - 0.1, H - 0.2, 0.03); g.translate((R - 0.1) / 2 + 0.08, H / 2, 0); g.applyMatrix4(m); gl.push(g.toNonIndexed());
    for (const y of [H - 0.1, 0.06]) { const f = new THREE.BoxGeometry(R - 0.05, 0.08, 0.06); f.translate((R - 0.05) / 2 + 0.05, y, 0); f.applyMatrix4(m); fr.push(f.toNonIndexed()); }
  }
  const strip = (l) => l.map((x) => { for (const k of Object.keys(x.attributes)) if (!['position', 'normal'].includes(k)) x.deleteAttribute(k); return x; });
  const gm = new THREE.MeshStandardMaterial({ color: 0xbcd3de, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2, depthWrite: false });
  const fm = new THREE.MeshStandardMaterial({ color: 0x34383c, metalness: 0.5, roughness: 0.4 });
  const A = new THREE.InstancedMesh(mergeGeometries(strip(gl)), gm, doors.length), B = new THREE.InstancedMesh(mergeGeometries(strip(fr)), fm, doors.length);
  for (const m of [A, B]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.castShadow = false; G.add(m); }
  const o = new THREE.Object3D();
  const set = (i) => { const d = doors[i]; o.position.set(d.x, d.y, d.z); o.rotation.set(0, d.rot, 0); o.updateMatrix(); A.setMatrixAt(i, o.matrix); B.setMatrixAt(i, o.matrix); };
  doors.forEach((d, i) => set(i)); A.instanceMatrix.needsUpdate = B.instanceMatrix.needsUpdate = true;
  return { update() { let ch = false; doors.forEach((d, i) => { if (d.spin > 0.001) { set(i); ch = true; } }); if (ch) { A.instanceMatrix.needsUpdate = true; B.instanceMatrix.needsUpdate = true; } } };
}

// ================================================================ 屋根の球場(東京ドーム)
// 1 回転ドア: 屋根は中の空気の圧で浮いている(外より 0.3% 高い)ので、出入口はみな回転ドア。中から外へ出ると背中を風に押される
// 2 ホームランの光の演出: 屋根の縁の灯りと光の筋が色を変えて回る(地元のホームラン・勝った時)
// 3 正面のゲートの両脇の浮き彫り: 三塁側に打者の大きな浮き彫り(縦 3.0×横 2.2 m、黒っぽいアルミ)、一塁側にバットと月桂樹の横長の碑(1.12×3.12 m)
BUILD.dome = (G) => {
  G.views = [];
  {
    // 模型の 9 つのゲート(番号の板 sign_gate_numbers の位置、高さ 13.8 m = 2 階のデッキの入口)。ゲートごとに回転ドアを 3 つ並べる(写真: 黒っぽい枠の円筒のドアが横に並ぶ)
    const GATES = [[-98, -53], [-73, 19], [-68, -108], [-47, 56], [0, 71], [44, 52], [67, -108], [80, 21], [100, -53]];
    const gs = GATES.map(([x, z]) => { const L = Math.hypot(x, z + 40); return { b: [x, 13.8, z], ux: x / L, uz: (z + 40) / L }; });
    const doors = [];
    for (const g of gs) {
      const ux = g.ux, uz = g.uz, ry = Math.atan2(ux, uz) / D2R;
      for (const k of [-1, 0, 1]) {
        const px = g.b[0] + ux * 2.2 + uz * k * 3.4, pz = g.b[2] + uz * 2.2 - ux * k * 3.4, y = G.ground(px, pz, 13.5, 8);
        const d = revolvingDoor(G, px, y, pz, ry); d.ux = ux; d.uz = uz; doors.push(d);
      }
    }
    G.doors = doors; G.wings = doorWings(G, doors);
    // 正面(本塁の後ろに近い)ゲートの両脇に浮き彫り
    const front = gs[4];
    if (front) {
      const bx = front.b[0] + front.ux * 6, bz = front.b[2] + front.uz * 6, o = Math.atan2(bx, bz + 40) / D2R, y = G.ground(bx, bz, 13.5, 8), K = G.kit;
      K.at(bx, y, bz, o);
      // 三塁側(外から見て右 = 本塁から見て三塁側): 打者の浮き彫り
      K.at(-5.2, 0, 0.6);
      K.box(2.6, 1.4, 0.8, 0x9c9b97, {}); K.box(2.2, 3.0, 0.2, 0xb4b3ae, { y: 1.4 });
      K.sign(2.0, 2.8, (ctx, W, H) => { const gr = ctx.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#c9c8c3'); gr.addColorStop(1, '#a3a29d'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
        // 振り抜いた打者の浮き彫り(写真: 片足を上げた打撃の形の、銀色のアルミの浮き彫り)。影を右下、光を左上に付けて浮き出させる
        const body = (c, dx, dy) => { c.save(); c.translate(dx, dy); c.fillStyle = c._f; c.strokeStyle = c._f; c.lineCap = 'round'; c.lineJoin = 'round';
          const P = (x, y) => [x * W, y * H];
          c.beginPath(); c.arc(...P(0.52, 0.16), 0.075 * W, 0, 7); c.fill();                       // 頭(帽子)
          c.beginPath(); c.moveTo(...P(0.44, 0.24)); c.lineTo(...P(0.62, 0.25)); c.lineTo(...P(0.6, 0.5)); c.lineTo(...P(0.42, 0.52)); c.closePath(); c.fill();   // 胴
          c.lineWidth = W * 0.085; c.beginPath(); c.moveTo(...P(0.46, 0.5)); c.lineTo(...P(0.36, 0.7)); c.lineTo(...P(0.33, 0.92)); c.stroke();   // 軸足
          c.beginPath(); c.moveTo(...P(0.56, 0.5)); c.lineTo(...P(0.7, 0.62)); c.lineTo(...P(0.66, 0.78)); c.stroke();   // 上げた足
          c.lineWidth = W * 0.06; c.beginPath(); c.moveTo(...P(0.6, 0.29)); c.lineTo(...P(0.74, 0.3)); c.lineTo(...P(0.8, 0.2)); c.stroke();   // 腕
          c.lineWidth = W * 0.035; c.beginPath(); c.moveTo(...P(0.8, 0.2)); c.lineTo(...P(0.3, 0.05)); c.stroke();   // バット(振り抜いて肩の後ろへ)
          c.restore(); };
        ctx._f = 'rgba(70,70,66,0.55)'; body(ctx, W * 0.015, H * 0.01);
        ctx._f = '#e2e1dc'; body(ctx, -W * 0.008, -H * 0.006);
        ctx._f = '#b9b8b2'; body(ctx, 0, 0);
      }, { y: 2.9, z: 0.11, px: 120 });
      K.end();
      // 一塁側: 横長の碑(バットと月桂樹の浮き彫り)
      K.at(5.6, 0, 0.6);
      K.box(3.4, 0.6, 0.7, 0x9c9b97, {}); K.box(3.12, 1.12, 0.3, 0xb4b3ae, { y: 0.6 });
      K.sign(3.0, 1.0, (ctx, W, H) => { ctx.fillStyle = '#b8b7b2'; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = '#6f6e69'; ctx.lineCap = 'round';
        ctx.lineWidth = H * 0.08; ctx.beginPath(); ctx.moveTo(W * 0.18, H * 0.75); ctx.lineTo(W * 0.82, H * 0.25); ctx.stroke();   // バット
        ctx.lineWidth = H * 0.04; for (const s of [-1, 1]) for (let i = 0; i < 7; i++) { const cx = W * 0.5 + s * W * (0.12 + i * 0.045), cy = H * (0.5 + 0.05 * Math.sin(i)); ctx.beginPath(); ctx.ellipse(cx, cy - H * 0.12, W * 0.018, H * 0.09, s * 0.6, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.ellipse(cx, cy + H * 0.12, W * 0.018, H * 0.09, -s * 0.6, 0, 7); ctx.stroke(); }   // 月桂樹
      }, { y: 1.16, z: 0.16, px: 120 });
      K.end();
      K.end();
      G.mark('dome_relief', 'ゲートの浮き彫り', bx, y, bz, 'sight');
      const r1 = toWorld({ x: bx, z: bz }, o, -5.2, 2), r2 = toWorld({ x: bx, z: bz }, o, 5.6, 2);
      G.spot({ x: r1.x, z: r1.z, r: 2.2, label: '浮き彫りを見る', run: () => G.say('打者の浮き彫り', '高さ 3 m・1 枚 500 kg のアルミの浮き彫り') });
      G.spot({ x: r2.x, z: r2.z, r: 2.2, label: '碑を見る', run: () => G.say('バットと月桂樹の碑', '昔のブロンズの板を組み込んだ横長の碑') });
      const v1 = toWorld({ x: bx, z: bz }, o, 0, 14);
      G.views.unshift({ name: '正面のゲートの浮き彫りと回転ドア', cam: [v1.x, y + 2.2, v1.z], look: [bx, y + 1.6, bz], fov: 70 });
    }
  };
  // 回転ドア: 近づくと羽根が回る。中の口の側から外の口の側へ抜けたら、背中を押す(1.2 秒)
  let push = 0, pdir = null, lastSide = new Map();
  G.anim((dt) => {
    if (!G.doors) return; const P = G.h.player, p = P.pos;
    for (const d of G.doors) {
      const dx = p.x - d.x, dz = p.z - d.z, dist = Math.hypot(dx, dz);
      d.spin = THREE.MathUtils.lerp(d.spin, dist < 3.5 ? 1.6 : 0.0, Math.min(1, dt * 3)); if (d.spin < 0.002) d.spin = 0; d.rot += d.spin * dt;
      const side = dx * d.ux + dz * d.uz, prev = lastSide.get(d);
      if (dist < 2.2 && prev != null && prev < -0.3 && side >= 0.3) { push = 1.2; pdir = V(d.ux, 0, d.uz); G.say('背中を風に押された', '中の空気の圧が外より高い(屋根を浮かせている)'); const S = G.audio(); if (S) whoosh(S); }
      if (dist < 3) lastSide.set(d, side); else lastSide.delete(d);
    }
    if (G.wings) G.wings.update();
    if (push > 0 && pdir) { push -= dt; P.pos.addScaledVector(pdir, dt * 3.2 * Math.min(1, push)); }
  });
  const ls = new LightShow(G, { R: 105, y: 50, colors: [0xff7a1a, 0xffffff, 0xffb000] });
  G.onGame = (ev, g) => { if (ev === 'hrUs') { ls.play(14); G.say('ホームランの光の演出'); } if (ev === 'end' && g.score && g.score.us > g.score.them) ls.play(24); };
  G.test = { show: () => ls.play(20) };
  G.views.push({ name: 'ホームランの光の演出(グラウンドから)', cam: [12, 1.7, -8], look: [-10, 22, -90], fov: 80, run: 'G.test.show();', step: 2.5 });
};
// 風の音(回転ドアを抜けた時)
function whoosh(S) {
  const c = S.ctx, n = c.sampleRate * 1.2 | 0, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) { const t = i / n; d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * t) * 0.8; }
  const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6; const g = c.createGain(); g.gain.value = 0.35;
  s.connect(f); f.connect(g); g.connect(S.sfxBus); s.start();
}

// 勝ったか(地元 = us)
const homeWin = (g) => !!(g && g.score && g.score.us > g.score.them);
// 模型の、名前が re に合う材質の物を、点 c のまわりに回す(観覧車の丘のメリーゴーラウンド)。模型のファイルは直さず、読み込んだ後の行列だけ替える
function spinModelParts(G, re, c) {
  const parts = []; G.scene.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material) && re.test(o.material.name || '')) { o.updateMatrixWorld(true); parts.push({ o, w0: o.matrixWorld.clone(), pinv: o.parent ? o.parent.matrixWorld.clone().invert() : new THREE.Matrix4() }); } });
  const T = new THREE.Matrix4(), R = new THREE.Matrix4(), Ti = new THREE.Matrix4();
  return { n: parts.length, set(a) { T.makeTranslation(c.x, 0, c.z); R.makeRotationY(a); Ti.makeTranslation(-c.x, 0, -c.z); const M = T.clone().multiply(R).multiply(Ti);
    for (const p of parts) { p.o.matrixAutoUpdate = false; p.o.matrix.copy(p.pinv).multiply(M).multiply(p.w0); p.o.matrixWorldNeedsUpdate = true; } } };
}

// ================================================================ 銀輪ドーム(バンテリンドーム)
// 1 勝った時の光の演出: 地元が勝つと、屋根の下の灯りが青と白で回り、光の筋がグラウンドをなでる(約 20 秒)
// 2 ホームランの時も短く光る
BUILD.ring = (G) => {
  const ls = new LightShow(G, { R: 98, y: 36, colors: [0x1f5fe0, 0xffffff, 0x58a8ff] });
  G.onGame = (ev, g) => { if (ev === 'end' && homeWin(g)) { ls.play(22); G.say('勝った時の光の演出'); } if (ev === 'hrUs') ls.play(9); };
  G.test = { show: () => ls.play(20) };
  G.views = [{ name: '勝った時の光の演出(グラウンドから)', cam: [12, 1.7, -8], look: [-10, 22, -90], fov: 80, run: 'G.test.show();', step: 2.5 }];
};

// ================================================================ 灯台坂スタジアム(横浜スタジアム)
// 1 ホームランの花火: 地元の選手がホームランを打つと、球場の外から花火が上がる
// 2 公園のチューリップの花壇: 球場をかこむ公園に、赤・だいだい・黄・白・桃・紫の帯に植えた花壇(春の名物。写真: 横浜市の観光の公式)
BUILD.bowl = (G) => {
  const fw = new Fireworks(G);
  const hr = () => { const from = [-150, 180, 150].map((a) => outPt(G, a, 165)); fw.show(G.lite ? 8 : 14, 6, from, { h: 60, hr: 25 }); G.say('ホームランの花火'); };
  G.onGame = (ev) => { if (ev === 'hrUs') hr(); };
  G.test = { hr };
  // 花壇: 色の帯ごとに、花(小さな球)と葉(緑の箱)を並べる。1 つの形にまとめる
  const K = G.kit, cols = [0xd8262a, 0xf07a1a, 0xf2c81e, 0xf4f1ea, 0xf08fb0, 0x8a4fc0];
  const beds = G.beds = [[-40, 72, 0], [-66, 63, 0], [-125, -45, 0]];   // 球場をかこむ公園の芝の上(正面の左と、三塁側の外)
  for (const [bx, bz, r0] of beds) {
    const y = G.ground(bx, bz, 5, 10), ry = outRy(bx, bz) + r0;
    K.at(bx, y, bz, ry);
    K.box(14.4, 0.18, 6.4, 0x9a9488, {});   // 縁石
    K.box(14.0, 0.2, 6.0, 0x4a3a2a, {});    // 土
    for (let row = 0; row < 6; row++) {
      const c = cols[row], z = -2.5 + row;
      K.box(13.6, 0.32, 0.8, 0x3f7a35, { z, y: 0.2, detail: true });   // 葉
      for (let i = 0; i < 44; i++) for (const dz of [-0.22, 0.22]) K.cyl(0.1, 0.06, 0.17, c, { x: -6.6 + i * 0.3 + (dz > 0 ? 0.15 : 0), z: z + dz, y: 0.5 + ((i * 7) % 3) * 0.03, seg: 5, detail: true });
      K.box(13.6, 0.1, 0.75, c, { z, y: 0.5 });   // 花の帯の地(軽い画質ではこれだけ)
    }
    K.end();
  }
  G.mark('tulips', 'チューリップの花壇', beds[0][0], 0, beds[0][1], 'sight');
  G.spot({ x: beds[0][0], z: beds[0][1], r: 9, label: '花壇を見る', run: () => G.say('チューリップの花壇', '球場をかこむ公園の春の名物。色ごとの帯に植えてある') });
  const b0 = beds[0], v = toWorld({ x: b0[0], z: b0[1] }, outRy(b0[0], b0[1]), 4, 12);
  G.views = [
    { name: 'チューリップの花壇と球場', cam: [v.x, 2.2, v.z], look: [b0[0], 0.5, b0[1]], fov: 70 },
    { name: '花壇(上から)', cam: [b0[0] + 6, 25, b0[1] + 30], look: [b0[0] + 15, 0, b0[1]], fov: 60 },
    { name: 'ホームランの花火', cam: [0, 4, 10], look: [0, 40, -150], fov: 75, run: 'G.test.hr();', step: 2.2 },
  ];
};

// ================================================================ 観覧車の丘スタジアム(楽天モバイルパーク)
// 1 メリーゴーラウンド: 観覧車の隣(左中間の後ろの遊び場)。模型にあるメリーゴーラウンドを回し、E で乗れる
// 2 7 回裏の前のジェット風船: 地元のファンが一斉に赤い風船を飛ばす
BUILD.north = (G) => {
  const C = { x: -91.5, z: -119.5 };
  const sp = spinModelParts(G, /^carousel_(roof|pole|horse|floor)/, C); let ang = 0, speed = 0, riding = false;
  G.anim((dt) => { if (!sp.n) return; const p = G.h.player.pos, near = Math.hypot(p.x - C.x, p.z - C.z) < 30; speed = THREE.MathUtils.lerp(speed, near || riding ? 0.55 : 0.0, Math.min(1, dt * 0.8)); if (speed > 0.001) { ang += speed * dt; sp.set(ang); } });
  G.spot({ x: C.x, z: C.z, r: 8, label: 'メリーゴーラウンドに乗る', run: () => {
    riding = true; const y0 = G.ground(C.x + 4.5, C.z, 5, 8);
    G.camShow('降りる', 40, (c, t) => { const a = ang + 0.3; c.position.set(C.x + Math.sin(a) * 4.6, y0 + 1.9 + 0.25 * Math.sin(t * 2.2), C.z + Math.cos(a) * 4.6); c.lookAt(-74, 16, -143); if (t > 39.5) riding = false; });   // 回りながら、隣の観覧車の方を見る
    const b = G.busy, st = b.stop; b.stop = () => { riding = false; st(); };
    G.say('メリーゴーラウンドに乗った', '観覧車の隣の遊び場');
  } });
  G.mark('carousel', 'メリーゴーラウンド', C.x, 0, C.z, 'play');
  const jb = new JetBalloons(G, { n: 600, colors: [0xd4202e, 0xd4202e, 0xe03a44, 0xc01828] });   // 球団の売る「ラッキー7の赤いジェット風船」(楽天市場の球団の店)
  const launch = () => { jb.launch(homeSeats(1500)); G.say('ジェット風船', '7 回裏の前、赤い風船が一斉に上がった'); };
  G.onGame = (ev, g) => { if (ev === 'half' && isHalf(g, 7, 'bottom')) launch(); };
  G.test = { balloons: launch, spin: () => { ang += 1.2; sp.set(ang); } };
  G.views = [
    { name: 'メリーゴーラウンドと観覧車(上から)', cam: [C.x + 10, 24, C.z - 10], look: [C.x - 2, 2, C.z], fov: 60, run: 'G.test.spin();' },
    { name: 'メリーゴーラウンドに乗る', walk: [C.x + 6, C.z + 2, C.x, C.z, 2], act: 'メリーゴーラウンドに乗る', step: 2, fromY: 10 },
    { name: '7 回裏の前の風船', cam: [0, 4, 12], look: [0, 25, -60], fov: 75, run: 'G.test.balloons();', step: 1.6 },
  ];
};

// ================================================================ 潮凪ドーム(みずほ PayPay ドーム)
// 1 勝利の演出: 地元が勝つと、場内の灯りを落とし、屋根の下で花火、光の筋、最後に屋根が開く(閉じている時)。写真: 西日本新聞の「ドーム内花火」
// 2 7 回裏の前のジェット風船(黄色。2023 年から専用のポンプで再開)
BUILD.bay = (G) => {
  const ls = new LightShow(G, { R: 92, y: 30, colors: [0xffd400, 0xffffff, 0xff4040] });
  const fw = new Fireworks(G, { size: 1.0 });
  const victory = () => {
    ls.play(26); G.say('勝利の演出', '屋根の下で花火');
    const from = [V(-30, 30, -50), V(0, 34, -45), V(30, 30, -50), V(0, 30, -20)]; fw.show(G.lite ? 14 : 30, 18, from, { h: 4, hr: 10 });
    const R = G.h.roof; if (R && R.has && R.has() && R.closed && R.closed()) setTimeout(() => { try { R.set(false); G.say('屋根が開いた'); } catch (e) { /* 無い時 */ } }, 20000);
  };
  const jb = new JetBalloons(G, { n: 600, colors: [0xf6d21a, 0xf6d21a, 0xffe45a] });
  const launch = () => { jb.launch(homeSeats(1500)); G.say('ジェット風船', '7 回裏の前、黄色い風船が一斉に上がった'); };
  G.onGame = (ev, g) => { if (ev === 'end' && homeWin(g)) victory(); if (ev === 'half' && isHalf(g, 7, 'bottom')) launch(); };
  G.test = { victory, balloons: launch };
  G.views = [
    { name: '7 回裏の前の黄色い風船', cam: [0, 4, 12], look: [0, 25, -60], fov: 75, run: 'G.test.balloons();', step: 1.6 },
    { name: '勝利の演出(屋根の下の花火)', cam: [0, 8, 25], look: [0, 30, -60], fov: 80, run: 'window.__app.setTime("night"); G.test.victory();', step: 3.2 },
  ];
};

// ================================================================ 海鳴りスタジアム(ZOZO マリンスタジアム)
// 1 風速計と風の表示: バックスクリーンの上の右寄りに、黒い板の表示(「上空 ○m」と、ダイヤモンドの形に風の向きの矢印)、その真上に風車形の風速計が回る。表示は 30 秒ごとに変わる
// 2 5 回が終わると、スコアボードの裏の海の側から花火(夏のナイター)
BUILD.shore = (G) => {
  const K = G.kit, P = { x: 11, y: 24, z: -134.2 };
  // 風速計: 柱と、尾の羽根のついた胴、前のプロペラ(回る)
  K.at(P.x, P.y + 2.0, P.z - 0.4, 0);
  K.cyl(0.08, 0.1, 3.4, 0x2a2c2e, { seg: 8 });
  K.end();
  const vane = new THREE.Group(); vane.position.set(P.x, P.y + 5.5, P.z - 0.4);
  { const m = new THREE.MeshStandardMaterial({ color: 0xd8dadc, roughness: 0.5, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 10), m); body.rotation.x = Math.PI / 2; vane.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.7), m); tail.position.z = -0.95; vane.add(tail);
    const prop = new THREE.Group(); prop.position.z = 0.85; for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.62, 0.03), m); b.position.y = 0.33; const h = new THREE.Group(); h.rotation.z = i * Math.PI / 2; h.add(b); prop.add(h); } vane.add(prop); vane.userData.prop = prop; }
  G.add(vane);
  // 表示の板(黒、緑の字)。canvas を 30 秒ごとに描き直す
  // 模型の風の板(sign_wind_fictional: x 8〜14・y 24〜26)にちょうど重ねる(横長なので、左に矢印のダイヤモンド、右に「上空 ○m」)
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 192; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.4), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  board.position.set(P.x, P.y + 1.0, P.z + 0.9); G.add(board);   // 模型の板(z -134)の本塁側の前(板に厚みがあるので 0.9 m 前)
  let ws = 8, wd = 0.7, tNext = 0;
  const draw = () => {
    const c = cv.getContext('2d'); c.fillStyle = '#0b0d0c'; c.fillRect(0, 0, 512, 192);
    txt(c, '上空', 330, 58, 54, '#7dff9a', { weight: 800 }); txt(c, `${ws}m`, 330, 132, 74, '#7dff9a', { weight: 800 });
    c.save(); c.translate(110, 100); c.rotate(Math.PI / 4); c.strokeStyle = '#d9f5e2'; c.lineWidth = 6; c.strokeRect(-48, -48, 96, 96); c.restore();
    c.save(); c.translate(110, 100); c.scale(0.8, 0.8); c.rotate(wd); c.strokeStyle = '#ffffff'; c.fillStyle = '#ffffff'; c.lineWidth = 12; c.beginPath(); c.moveTo(0, -60); c.lineTo(0, 45); c.stroke(); c.beginPath(); c.moveTo(0, 70); c.lineTo(-24, 34); c.lineTo(24, 34); c.closePath(); c.fill(); c.restore();
    tex.needsUpdate = true;
  };
  draw();
  G.anim((dt, t) => {
    if (t > tNext) { tNext = t + 30; ws = Math.max(2, Math.round(7 + Math.sin(t * 0.013) * 4 + Math.random() * 4)); wd = 0.5 + Math.sin(t * 0.007) * 0.5 + (Math.random() - 0.5) * 0.4; draw(); }
    vane.rotation.y = THREE.MathUtils.lerp(vane.rotation.y, Math.PI - wd, Math.min(1, dt * 0.5)); vane.userData.prop.rotation.z += dt * ws * 1.6;
  });
  G.mark('anemometer', '風速計', P.x, P.y, P.z, 'sight');
  const fw = new Fireworks(G);
  const fireworks = () => { const from = [-30, -12, 0, 12, 30].map((x) => V(x, 0, -210)); fw.show(G.lite ? 30 : 60, 35, from, { h: 80, hr: 40 }); G.say('花火', '5 回が終わって、海の側から花火'); };
  G.onGame = (ev, g) => { if (ev === 'half' && isHalf(g, 6, 'top') && isNight(G)) fireworks(); };
  G.test = { fireworks };
  G.views = [
    { name: '風速計と風の表示(本塁の後ろから)', cam: [0, 8, 10], look: [P.x, P.y + 3, P.z], fov: 22 },
    { name: '風速計(外野から)', cam: [P.x - 8, P.y + 4, P.z + 22], look: [P.x, P.y + 4, P.z], fov: 55 },
    { name: '5 回のあとの花火(夜)', cam: [0, 6, 30], look: [0, 60, -150], fov: 75, run: 'window.__app.setTime("night"); G.test.fireworks();', step: 4.5 },
  ];
};

// ================================================================ 森かげドーム(ベルーナドーム)
// 1 白いライオンの像: 駅の改札を出てすぐの、れんがの建物の上から、たてがみの白いライオンが身を乗り出してほえる(高さ約 4 m・長さ約 7 m。写真: 住協の紹介の頁ほか)
//   E で像の前で記念写真
// 2 勝った時、バックスクリーンの大きな画面に花火の映像
BUILD.grove = (G) => {
  const R11 = !(typeof location !== 'undefined' && /[?&]grove_r([3-9]|10)(=|&|$)/.test(location.search));   // 11/21 森かげ R11: メインゲートを広場の外へ出したので、像は駅からの道ぞい(屋台の並びの先、駅の側)へ。前の (30, -186) は広場の中のチームストアと重なる
  const R12 = !(typeof location !== 'undefined' && /[?&]grove_r([3-9]|1[01])(=|&|$)/.test(location.search));   // 11/21 R12 の獅子ビル: 写真のとおり、獅子ビル(方位を直した OSM の所)の屋上の角から広場へ身を乗り出す
  const K = G.kit, C = R12 ? { x: -60.2, z: -180.8 } : R11 ? { x: 86, z: -214 } : { x: 30, z: -186 }, yg = G.ground(R12 ? -52 : C.x, R12 ? -186 : C.z, 20, 20), y0 = R12 ? yg + 5 : yg, ry = R12 ? 66 : R11 ? 270 : 180 + 20;
  K.at(C.x, y0, C.z, ry);
  // れんがの建物(2 階ほど、前にアーチの口が 3 つ)。R12 は獅子ビルの屋上なので、低い台(屋上の手すりの所)だけ
  if (!R12) K.box(12, 7, 7, 0x9a4a35, {}); else K.box(8, 7, 5, 0x9a4a35, { z: -1 }); K.box(12.4, 0.4, 7.4, 0x6f6a62, { y: 7 });
  for (const x of [-3.6, 0, 3.6]) { K.box(2.4, 3.2, 0.1, 0x2a2a2a, { x, y: 0, z: 3.5 }); K.cyl(1.2, 1.2, 0.1, 0x2a2a2a, { x, y: 3.2, z: 3.52, rx: 90, seg: 14, tl: Math.PI, t0: -Math.PI / 2 }); }
  K.box(12.2, 1.1, 0.1, 0x3a3836, { y: 5.6, z: 3.55, detail: true }); for (let i = 0; i < 12; i++) K.box(0.05, 1.1, 0.25, 0x77736a, { x: -5.8 + i * 1.05, y: 7.4, z: 3.3 });   // 手すり
  // ライオン: 屋上から身を乗り出す上半身。白。胴・胸・頭・たてがみ・前足
  const W = 0xf2f2ee;
  K.at(0, 7.4, 1.2);
  K.sphere(1.7, W, { sx: 1.0, sy: 0.9, sz: 1.6, z: -1.0, y: 1.2 });          // 胴
  K.sphere(1.6, W, { y: 2.2, z: 1.2 });                                      // 胸
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; K.cone(0.55, 1.3, W, { x: Math.cos(a) * 1.1, y: 3.6 + Math.sin(a) * 1.1, z: 2.0, rx: 90 - Math.sin(a) * 40, rz: -Math.cos(a) * 40, seg: 6 }); }   // たてがみ
  K.sphere(1.05, W, { y: 3.6, z: 2.6 });                                     // 頭
  K.box(0.9, 0.55, 0.9, W, { y: 3.0, z: 3.4 });                              // 鼻と口のまわり
  K.box(0.8, 0.22, 0.75, 0x9a3a3a, { y: 2.95, z: 3.55 });                    // 開いた口
  K.sphere(0.12, 0x2a2a2a, { x: 0.35, y: 3.85, z: 3.45 }); K.sphere(0.12, 0x2a2a2a, { x: -0.35, y: 3.85, z: 3.45 });
  for (const s of [1, -1]) { K.cyl(0.42, 0.35, 3.0, W, { x: s * 0.9, y: 2.0, z: 2.0, rx: 70 }); K.sphere(0.5, W, { x: s * 0.9, y: 1.0, z: 4.7, sz: 1.3 }); }   // 前足(前へ伸ばす)
  K.end();
  K.end();
  G.mark('lion', '白いライオンの像', C.x, y0, C.z, 'sight');
  const f = toWorld(C, ry, 0, 11);
  G.spot({ x: f.x, z: f.z, r: 6, label: 'ライオンの前で記念写真', run: () => {
    const p = G.h.player.pos.clone(), cam = toWorld(C, ry, 2, 22);
    G.camShow('もどる', 3.5, (c, t) => { c.position.set(cam.x, (R12 ? yg : y0) + 3, cam.z); c.lookAt(C.x, y0 + 6, C.z); if (t > 1.0 && !G._flash) { G._flash = true; flash(); } });
    G._flash = false; G.say('記念写真を撮った', '白いライオンの前で');
  } });
  // 勝った時の画面の花火(バックスクリーンの大きな画面: x -23〜23、y 13〜26、z -137 の前に重ねる)
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 144; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(46, 13), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true }));
  scr.position.set(0, 19.5, -136.7); scr.visible = false; G.add(scr);
  let st = -1, sparks = [];
  G.anim((dt) => {
    if (st < 0) return; st += dt; const c = cv.getContext('2d'); c.fillStyle = 'rgba(5,8,20,0.35)'; c.fillRect(0, 0, 512, 144);
    if (Math.random() < dt * 3) { const x = 40 + Math.random() * 432, y = 30 + Math.random() * 60, col = ['#ff5a4a', '#ffd34a', '#6ad6ff', '#b98bff', '#7dff8a'][(Math.random() * 5) | 0]; for (let i = 0; i < 40; i++) { const a = Math.random() * 7, v = 20 + Math.random() * 40; sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: 1.4, col }); } }
    for (const s of sparks) { s.l -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 20 * dt; c.fillStyle = s.col; c.fillRect(s.x, s.y, 3, 3); }
    sparks = sparks.filter((s) => s.l > 0); tex.needsUpdate = true;
    if (st > 25) { st = -1; scr.visible = false; }
  });
  const screenFw = () => { st = 0; sparks = []; scr.visible = true; const c = cv.getContext('2d'); c.fillStyle = '#05081a'; c.fillRect(0, 0, 512, 144); G.say('勝った時の花火(大きな画面)'); };
  G.onGame = (ev, g) => { if (ev === 'end' && homeWin(g)) screenFw(); };
  G.test = { screen: screenFw };
  const v = toWorld(C, ry, -6, 26);
  G.views = [
    { name: '白いライオンの像(駅の側から)', cam: [v.x, (R12 ? yg : y0) + 2, v.z], look: [C.x, y0 + 7, C.z], fov: 65 },
    { name: 'ライオンの前で記念写真', walk: [f.x, f.z, C.x, C.z, y0 + 6], act: 'ライオンの前で記念写真', step: 1.5, fromY: y0 + 10 },
    { name: '勝った時の画面の花火', cam: [0, 6, 20], look: [0, 19, -137], fov: 45, run: 'G.test.screen();', step: 3 },
  ];
};
// 写真を撮った時の白い光(画面)
function flash() { try { const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0.85;pointer-events:none;z-index:9999;transition:opacity .5s'; document.body.appendChild(d); requestAnimationFrame(() => { d.style.opacity = '0'; }); setTimeout(() => d.remove(), 700); } catch (e) { /* 無い時 */ } }

// ================================================================ 舟灯ドーム(京セラドーム大阪)
// 1 記念の席: 一塁側の内野に、シーズン 55 本目のホームランが落ちた席が 1 つだけバラ色に替えてあり、ボールの形が刻んである。E で座って見る
// 2 左翼の下の段の記念の板(初めてのホームランが落ちた所)
BUILD.canal = (G) => {
  const K = G.kit;
  // 一塁側の内野の席から 1 つ(本塁から見て一塁側 30〜45 度、下の段)
  const c = window.__crowd, s = c && c.seats; let best = null;
  if (s) for (let i = 0; i < s.n; i++) { const a = angOf(s.x[i], s.z[i]); if (a > 32 && a < 42 && s.y[i] > 2.5 && s.y[i] < 4.5 && (!best || Math.abs(a - 37) < Math.abs(angOf(best.x, best.z) - 37))) best = { i, x: s.x[i], y: s.y[i], z: s.z[i], yaw: s.yaw[i] }; }
  if (best && best.i != null && c.setSeatAway) c.setSeatAway(best.i, true);   // 記念の席は空けておく(観客を座らせない)
  if (!best) best = { x: 40, y: 3, z: 8, yaw: 0 };
  const ry = Math.atan2(-best.x, -best.z) / D2R;   // 背もたれは本塁の反対側
  K.at(best.x, best.y - 0.45, best.z, ry);
  K.box(0.5, 0.08, 0.45, 0xe56b8c, { y: 0.4 });                 // 座面
  K.box(0.5, 0.5, 0.06, 0xe56b8c, { y: 0.45, z: -0.24 });       // 背もたれ
  K.cyl(0.11, 0.11, 0.02, 0xf6f2ec, { y: 0.75, z: -0.205, rx: 90, seg: 14 });   // ボールの形
  K.torus(0.11, 0.012, 0xc23a3a, { y: 0.75, z: -0.19, seg: 14, arc: Math.PI * 0.6, rz: 60 });
  K.end();
  G.mark('rose_seat', '記念の席(バラ色)', best.x, best.y, best.z, 'sight');
  G.spot({ x: best.x, z: best.z, y: best.y, dy: 2, r: 2.5, label: '記念の席を見る', run: () => G.say('バラ色の記念の席', 'シーズン 55 本目のホームランが落ちた席。背にボールの形') });
  // 左翼の下の段の記念の板: 左翼の外野の下の段のいちばん前(フェンスの上の壁)
  let lf = null; if (s) for (let i = 0; i < s.n; i++) { const a = angOf(s.x[i], s.z[i]); if (a < -120 && a > -155 && s.y[i] > 0 && s.y[i] < 6 && (!lf || s.y[i] < lf.y - 0.05 || (Math.abs(s.y[i] - lf.y) < 0.05 && Math.abs(a + 138) < Math.abs(angOf(lf.x, lf.z) + 138)))) lf = { x: s.x[i], y: s.y[i], z: s.z[i] }; }
  if (lf) {
    const r = Math.hypot(lf.x, lf.z), k = (r - 1.6) / r; lf.px = lf.x * k; lf.pz = lf.z * k;
    K.at(lf.px, lf.y - 1.3, lf.pz, Math.atan2(-lf.x, -lf.z) / D2R);   // 最前列の前の壁、本塁を向く
    K.sign(1.0, 0.6, plate('#c8a24a', [{ t: '初本塁打', col: '#2a2010', size: 0.38 }, { t: 'この辺りに', col: '#2a2010', size: 0.24 }], { border: '#8a6a24' }), { y: 0.5, z: 0.05, px: 200 });
    K.end();
    G.mark('lf_plate', '記念の板', lf.x, lf.y, lf.z, 'sight');
  }
  G.views = [
    { name: 'バラ色の記念の席(通路の上から)', cam: [best.x * 1.1, best.y + 2.4, best.z * 1.1], look: [best.x, best.y, best.z], fov: 50 },
    { name: '記念の席(横の通路から)', cam: [best.x + 2.2, best.y + 1.7, best.z - 1.5], look: [best.x, best.y + 0.3, best.z], fov: 55 },
  ];
  if (lf) G.views.push({ name: '左翼の記念の板', cam: [lf.px * 0.9, 1.7, lf.pz * 0.9], look: [lf.px, lf.y - 0.8, lf.pz], fov: 45 });
};

// 汽笛ヶ原の寝そべる席(模型の lounge_artificial_turf: センターの右隣、x 4〜22・z -131〜-120 の人工芝の段に赤いマット)。E で寝そべって見る
const railNeso = (G) => {
  const C = { x: 13, z: -125.5 }, y = G.ground(C.x, C.z, 8, 10);
  G.spot({ x: C.x, z: C.z, r: 7, label: '寝そべって見る', run: () => {
    // マットの段の高さ(模型: 前 z -120 で 2 m、奥 z -131 で 4 m)。当たり判定の床がまだらなので、段の高さで目の高さを決める
    const p = G.h.player.pos.clone(); p.x = THREE.MathUtils.clamp(p.x, 6, 20); p.z = THREE.MathUtils.clamp(p.z, -129, -122);
    const gy = Math.max(G.ground(p.x, p.z, 8, 10), 2 + THREE.MathUtils.clamp((-120 - p.z) / 11, 0, 1) * 2) + 0.3;
    G.camShow('起きる', 120, (c, t) => { const k = Math.min(1, t / 1.2); c.position.set(p.x, gy + 1.5 - 0.9 * k, p.z); c.lookAt(0, 2 + 6 * (1 - k), 0); });
    G.say('寝そべった', '赤いマットの寝そべる席。動くと起きる');
  } });
  G.mark('nesoberia', '寝そべる席', C.x, y, C.z, 'play');
  G.views.push({ name: '寝そべる席(外野から本塁を見る)', walk: [C.x, C.z, 0, 0, 2], act: '寝そべって見る', step: 1.6, fromY: 8 });
  G.views.push({ name: '寝そべる席(場所)', cam: [C.x - 10, y + 8, C.z + 30], look: [C.x, y, C.z], fov: 50 });
};

// ================================================================ 白樺ルーフパーク(エスコンフィールド)
// 1 試合が見えるサウナ: 左翼のスタンドの後ろ、屋根の下の建物(5 階建て。温泉・サウナ・ホテル。焦げ茶の木の枠と黒いガラス)の上の階に、グラウンドを見下ろすテラス席(ガラスの手すりと寝いすの列)。E で入ると、湯気の中から試合を見る
// 2 屋根は今までどおり(昼は開き、ナイターは閉じる)
BUILD.roof = (G) => {
  // 本物の建物は左翼の隅の屋根の下にある。模型ではそこにスタンドの外壁があるので、左翼のスタンドのいちばん上の後ろ(高さ約 16 m)に、
  // 建物の上の階を思わせる焦げ茶の木の枠と黒いガラスの壁を背に、テラス(木の床・ガラスの手すり・寝いすの列・サウナの小屋)を作った(置き場所は推定)
  // 床はスタンドのいちばん上から 4 m 上げる(前の広告の板の上から見えるように)。下は柱と黒いガラスの壁
  const K = G.kit, C = { x: -73, z: -111 }, y0 = G.ground(-73, -111, 25, 20) + 4, ry = outRy(C.x, C.z);
  K.at(C.x, y0 - 4, C.z, ry);
  K.box(18, 4, 0.5, 0x1f2326, { z: 3.0 }); for (const x of [-8.6, -3, 3, 8.6]) K.box(0.5, 4, 0.5, 0x4a3426, { x, z: -2.6 });
  K.end();
  K.at(C.x, y0, C.z, ry);
  K.box(18, 6.5, 0.5, 0x1f2326, { z: 3.0 });                                                 // 背の壁(黒いガラス)
  for (const y of [0, 3.2, 6.3]) K.box(18.4, 0.35, 0.7, 0x4a3426, { y, z: 3.0 });            // 焦げ茶の木の枠(横)
  for (let i = 0; i <= 6; i++) K.box(0.4, 6.5, 0.7, 0x4a3426, { x: -9 + i * 3, z: 3.0 });   // 縦
  K.box(18, 0.3, 6, 0x6b4a32, { y: 0.0, z: 0 });                                             // 木の床
  for (let i = 0; i <= 12; i++) K.box(0.05, 1.1, 0.05, 0x8e8a84, { x: -9 + i * 1.5, y: 0.3, z: -2.95, detail: true });   // 手すりの柱(ガラスは透けて見えるので、板は入れない)
  K.box(18, 0.08, 0.12, 0x8e8a84, { y: 1.4, z: -2.95 });
  for (let i = 0; i < 6; i++) { K.box(0.7, 0.25, 1.8, 0xe8e2d4, { x: -7.5 + i * 2.2, y: 0.35, z: -0.8, rx: -12 }); K.box(0.7, 0.5, 0.15, 0xe8e2d4, { x: -7.5 + i * 2.2, y: 0.6, z: 0.1, rx: -45, detail: true }); }
  K.box(3.6, 2.6, 2.4, 0x8a6342, { x: 6.6, y: 0.3, z: 1.4 }); K.box(3.9, 0.2, 2.7, 0x5e4430, { x: 6.6, y: 2.9, z: 1.4 });   // サウナの小屋(木)
  K.box(0.9, 1.9, 0.05, 0x5e4430, { x: 6.6, y: 0.3, z: 0.18 });
  K.cyl(0.15, 0.15, 1.2, 0x3a3a3a, { x: 7.8, y: 3.0, z: 1.4 });   // 煙突
  K.sign(4.6, 0.8, plate('#2a2420', [{ t: 'サウナ テラス', col: '#f0e6d2', size: 0.6 }]), { y: 4.6, z: 2.72, px: 120 });
  K.end();
  const steam = new Burst(G, 200, 0.9, [0xf4f4f4, 0xe8e8e8], { grav: 0.6, drag: 0.8 });
  const chim = toWorld(C, ry, 7.8, 1.4), terr = toWorld(C, ry, -2, -1.6);
  G.anim((dt) => { if (Math.random() < dt * (G.lite ? 1.5 : 4)) steam.emit(V(chim.x, y0 + 4.3, chim.z), V(0.3, 1.2, 0), 0.25, 1, 3.5); });
  G.spot({ x: C.x, z: C.z, r: 7, label: 'サウナのテラスで試合を見る', run: () => {
    G.camShow('もどる', 60, (c, t) => { c.position.set(terr.x, y0 + 2.6, terr.z); c.lookAt(0, 1, -20); if (Math.random() < 0.15) steam.emit(V(terr.x + (Math.random() - 0.5) * 3, y0 + 0.6, terr.z), V(0, 0.8, 0), 0.3, 1, 2.5); });
    G.say('サウナのテラス', '湯気の中から試合を見る。動くともどる');
  } });
  G.mark('sauna', 'サウナのテラス', C.x, y0, C.z, 'play');
  G.views = [
    { name: 'サウナのテラス(内野から)', cam: [8, 6, -6], look: [C.x, y0 + 2, C.z], fov: 35 },
    { name: 'サウナのテラス(近くから)', cam: [C.x + 14, y0 + 5, C.z + 10], look: [C.x, y0 + 2, C.z], fov: 60 },
    { name: 'テラスから試合を見る', cam: [terr.x, y0 + 2.6, terr.z], look: [0, 1, -20], fov: 70 },
  ];
};
