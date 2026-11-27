// 11/23 持ち主「1プレー終わった後一時停止したらリプレイボタンでリプレイを見れるようにして 動画再生みたいな感じで
// 自分の動きを色んな視点から見れるような感じで」
// 守備の 1 プレー(打球が飛ぶ前から 15 秒まで)の、選手の骨・体の向き・球の位置を 1 秒 20 こまで覚えておき、
// 一時停止の画面の「リプレイ」で、動画のように(再生・止める・巻き戻し・遅く)いろいろな視点から見る。
// 覚えるのは今のプレーと 1 つ前のプレーだけ(スマホのメモリを食わないように)。
import * as THREE from 'three';
import { ballVisScale } from './ball.js';

const FPS = 20, MAXT = 15;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// 11/26 持ち主「リプレイを見た後とか … 打者の向きとか 走者の向きとか ピッチャーの向きとかなんかおかしい向きになっている」:
// 覚えた向き(四元数)を当てると、three.js は回り(Euler XYZ)を作り直す。後ろ半分(90 度より大きい向き)では
// (x, y, z) = (π, π − 向き, π) の形になり、その後で選手の向きを rotation.y = … で決めると、x と z の π が残って
// 見た目の向きが π − 決めた向き(左右の鏡)になっていた(逆向きで走る・逆向きで構える)。同じ回りの (x − π, π − y, z − π) に直して、
// x・z を 0 に近い形へ戻す。
const PI = Math.PI, wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const OLD = typeof location !== 'undefined' && /[?&]oldreplay=1/.test(location.search);   // 試験で直す前の形を見る
export function tidyEuler(o) {
  if (OLD) return;
  const r = o.rotation;
  if (Math.abs(r.x) > PI / 2 && Math.abs(r.z) > PI / 2) r.set(wrap(r.x - Math.sign(r.x) * PI), wrap(PI - r.y), wrap(r.z - Math.sign(r.z) * PI));
}
// 11/28 足の骨と、骨から足の裏・つま先の表面までの厚み(m)。athletes.js の GROUND_PTS の足の分と同じ
const FEET = [['foot_l', 0.07], ['foot_r', 0.07], ['ball_l', 0.04], ['ball_r', 0.04]];
// 骨から引いた厚みは少し厚め: 立った形(体の網の足の裏がちょうど地面)で、骨から引いた一番低い所は地面の 0.025 m 下になる(11/28 測った)。その分は許す
const SOLE = 0.025;
const _fv = new THREE.Vector3(), _fw = new THREE.Vector3();
const VIEWS = [
  ['fp', '自分の目'], ['behind', '後ろから'], ['side', '横から'], ['high', '上から'], ['tv', 'バックネット裏'], ['ball', '球を追う'], ['free', '自由'],
];

export class Replay {
  // h: { camera, roots(): Object3D[], me(): Athlete, ball(): Mesh, athletes(): Athlete[], render(dt), hide(on) }
  constructor(h) {
    this.h = h; this.cur = null; this.last = null; this.on = false;
    this.view = 'behind'; this.speed = 1; this.playing = true; this.t = 0;
    this.orb = { yaw: 0.6, pitch: 0.35, dist: 7 };
    this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion();
    this.camP = V(); this.camL = V(); this.snapCam = true;
  }
  // ---------------------------------------------------------------- 覚える
  begin() {
    if (this.on) return;
    if (this.cur && this.cur.frames.length > 4) this.last = this.cur;
    const nodes = [], bones = [];
    for (const r of this.h.roots()) if (r) r.traverse((o) => { if (o.isBone && o.parent && o.parent.isBone) bones.push(o); else nodes.push(o); });
    // 11/28 持ち主「リプレイ見たとき足が埋まっていることある」「6 秒くらいの時 人間の感じがおかしくなる」:
    // 骨は回りだけ覚えていて、腰の骨(体の根元の骨の子。Mixamo の Hips)の位置を覚えていなかった。動き(しゃがむ・飛び込む・止まる・投げる)の
    // 腰の上下・前後が、リプレイでは開いた時(止めた時)の位置のままになり、しゃがんだ形で腰が高いと足が地面の下へ、
    // 止まる・投げる動きで腰が前後へずれていると体が根元からずれて崩れて見えた。腰の骨の位置も覚える(?oldreplay=1 で前の形)
    const pbones = OLD ? [] : bones.filter((o) => !(o.parent.parent && o.parent.parent.isBone));
    const bm = this.h.ball && this.h.ball();
    this.cur = { nodes, bones, pbones, bi: bm ? nodes.indexOf(bm) : -1, frames: [], acc: 1 / FPS, t: 0, done: false };
  }
  capture(dt) {
    const R = this.cur;
    if (!R || R.done || this.on) return;
    R.t += dt; R.acc += dt;
    if (R.acc < 1 / FPS) return;
    R.acc = 0;
    if (R.t > MAXT) { R.done = true; return; }
    R.frames.push(this._grab(R, R.t));
  }
  _grab(R, t) {
    const nN = R.nodes.length, nB = R.bones.length;
    const P = new Float32Array(nN * 3), Q = new Int16Array((nN + nB) * 4), Vis = new Uint8Array(nN + nB);
    for (let i = 0; i < nN; i++) {
      const o = R.nodes[i];
      P[i * 3] = o.position.x; P[i * 3 + 1] = o.position.y; P[i * 3 + 2] = o.position.z;
      const q = o.quaternion; Q[i * 4] = q.x * 32767; Q[i * 4 + 1] = q.y * 32767; Q[i * 4 + 2] = q.z * 32767; Q[i * 4 + 3] = q.w * 32767;
      Vis[i] = o.visible ? 1 : 0;
    }
    for (let j = 0; j < nB; j++) {
      const o = R.bones[j], k = (nN + j) * 4, q = o.quaternion;
      Q[k] = q.x * 32767; Q[k + 1] = q.y * 32767; Q[k + 2] = q.z * 32767; Q[k + 3] = q.w * 32767;
      Vis[nN + j] = o.visible ? 1 : 0;
    }
    const pb = R.pbones || [], BP = new Float32Array(pb.length * 3);
    for (let j = 0; j < pb.length; j++) { const p = pb[j].position; BP[j * 3] = p.x; BP[j * 3 + 1] = p.y; BP[j * 3 + 2] = p.z; }
    const fly = this.h.ballFly ? !!this.h.ballFly() : true;   // 11/28 打球が飛んでいる・転がっている間(持っている球は残像を出さない)
    return { t, P, Q, Vis, BP, fly };
  }
  // 見せる物: 今のプレーが終わっていれば今の、まだなら 1 つ前の
  pick(playEnded) {
    const ok = (r) => r && r.frames.length > 10;
    if (playEnded && ok(this.cur)) return this.cur;
    if (ok(this.last)) return this.last;
    return ok(this.cur) ? this.cur : null;
  }
  // ---------------------------------------------------------------- 当てる
  _apply(R, F0, F1, u) {
    const nN = R.nodes.length, nB = R.bones.length, q0 = this._q, q1 = this._q2, s = 1 / 32767;
    for (let i = 0; i < nN; i++) {
      const o = R.nodes[i];
      if (!o.parent) continue;
      const a = i * 3, k = i * 4;
      o.position.set(F0.P[a] + (F1.P[a] - F0.P[a]) * u, F0.P[a + 1] + (F1.P[a + 1] - F0.P[a + 1]) * u, F0.P[a + 2] + (F1.P[a + 2] - F0.P[a + 2]) * u);
      q0.set(F0.Q[k] * s, F0.Q[k + 1] * s, F0.Q[k + 2] * s, F0.Q[k + 3] * s).normalize();
      q1.set(F1.Q[k] * s, F1.Q[k + 1] * s, F1.Q[k + 2] * s, F1.Q[k + 3] * s).normalize();
      o.quaternion.copy(q0).slerp(q1, u);
      tidyEuler(o);
      o.visible = !!(u < 0.5 ? F0.Vis[i] : F1.Vis[i]);
    }
    for (let j = 0; j < nB; j++) {
      const o = R.bones[j], k = (nN + j) * 4;
      q0.set(F0.Q[k] * s, F0.Q[k + 1] * s, F0.Q[k + 2] * s, F0.Q[k + 3] * s).normalize();
      q1.set(F1.Q[k] * s, F1.Q[k + 1] * s, F1.Q[k + 2] * s, F1.Q[k + 3] * s).normalize();
      o.quaternion.copy(q0).slerp(q1, u);
      o.visible = !!(u < 0.5 ? F0.Vis[nN + j] : F1.Vis[nN + j]);
    }
    const pb = R.pbones || [];
    if (F0.BP && F1.BP) for (let j = 0, a = 0; j < pb.length; j++, a += 3) pb[j].position.set(F0.BP[a] + (F1.BP[a] - F0.BP[a]) * u, F0.BP[a + 1] + (F1.BP[a + 1] - F0.BP[a + 1]) * u, F0.BP[a + 2] + (F1.BP[a + 2] - F0.BP[a + 2]) * u);
  }
  // 11/28 足が地面に埋まらないように: 選手ごとに、足・つま先の骨から厚みを引いた一番低い所が、その所の地面より下なら、その分だけ体を持ち上げる。
  // 下げはしない(飛び込み・跳ぶ形はそのまま)。体の位置は毎こま覚えた値から当て直すので、持ち上げは積もらない
  _feet() {
    if (OLD || !this.h.groundAt || !this.h.athletes) return;
    for (const a of this.h.athletes()) {
      const r = a && a.rig; if (!r || !r.bones || !a.root || !a.root.visible || !r.model.visible) continue;
      let vis = true; for (let q = a.root; q; q = q.parent) if (!q.visible) { vis = false; break; }
      if (!vis) continue;
      a.root.updateMatrixWorld(true);
      let lo = Infinity, fx = 0, fz = 0;
      for (const [n, rad] of FEET) { const b = r.bones[n]; if (!b) continue; b.getWorldPosition(_fv); if (_fv.y - rad < lo) { lo = _fv.y - rad; fx = _fv.x; fz = _fv.z; } }
      if (lo === Infinity) continue;
      a.root.getWorldPosition(_fw);
      const g = this.h.groundAt(fx, fz, _fw.y + 1.2);
      if (g == null || !isFinite(g)) continue;
      const up = g - lo - SOLE;
      if (up > 0.002 && up < 0.6) { a.root.position.y += up; a.root.updateMatrixWorld(true); }
    }
  }
  // 11/28 持ち主「リプレイこれ打球映ってないことある」: 球の見た目の大きさ(遠くは大きく・画面で 6.5 px の点)と残像は、遊んでいる間の
  // カメラで毎こま決めていて、リプレイでは止めた時の大きさのまま(遠い球は 1〜2 px、1 人称で手元の球は 0.001 倍)・点と残像は出なかった。
  // リプレイのカメラで決め直し、飛んでいる球には覚えた位置から残像(遊んでいる時と同じ薄い線)を描く
  _ballLook() {
    if (OLD) return;
    const bv = this.h.ballView && this.h.ballView(), R = this.rec; if (!bv || !R || R.bi < 0) return;
    const m = bv.mesh, cam = this.h.camera;
    if (!m.visible) { bv.trail.visible = false; if (bv.dot) bv.dot.visible = false; return; }
    const F = R.frames, t = F[0].t + this.t, fr = this._frameAt(t);
    const fly = fr ? fr.fly !== false : true;
    m.updateMatrixWorld(true);
    const pos = m.getWorldPosition(V()), dist = pos.distanceTo(cam.position);
    if (fly) {
      // 残像: 0.6 秒前までの覚えた位置(1/60 秒ごと)。飛んでいない(持っている・止まった)こまより前へは伸ばさない
      const hist = [];
      for (let k = 1; k < bv.N; k++) { const tt = t - k / 60; if (tt < F[0].t) break; const f2 = this._frameAt(tt); if (!f2 || f2.fly === false) break; const p = this._ballAt(tt); if (!p) break; hist.push(p); }
      bv.hist = hist;
      const sp = bv.spin.clone(); bv.spin.set(0, 0, 0);
      bv.update(pos, 0, cam, 0.022, 0.25);
      bv.spin.copy(sp);
    } else {
      bv.clearTrail();
      const s = Math.min(2.5, ballVisScale(dist, cam)); m.scale.setScalar(s); bv.fitDot(pos, dist, s, cam);
    }
  }
  _frameAt(t) { const F = this.rec.frames; let i = Math.min(F.length - 1, Math.max(0, Math.round((t - F[0].t) * FPS))); while (i > 0 && F[i].t > t + 0.5 / FPS) i--; while (i < F.length - 1 && F[i + 1].t <= t + 0.5 / FPS) i++; return F[i]; }
  _ballAt(t) {
    const R = this.rec, F = R.frames, a = R.bi * 3; if (R.bi < 0) return null;
    let i = Math.min(F.length - 2, Math.max(0, Math.floor((t - F[0].t) * FPS)));
    while (i > 0 && F[i].t > t) i--;
    while (i < F.length - 2 && F[i + 1].t < t) i++;
    const A = F[i], B = F[i + 1] || A, u = B.t > A.t ? Math.max(0, Math.min(1, (t - A.t) / (B.t - A.t))) : 0;
    if (!A.Vis[R.bi] && !B.Vis[R.bi]) return null;
    // 球は scene の直の子なので、位置がそのまま世界の位置
    return V(A.P[a] + (B.P[a] - A.P[a]) * u, A.P[a + 1] + (B.P[a + 1] - A.P[a + 1]) * u, A.P[a + 2] + (B.P[a + 2] - A.P[a + 2]) * u);
  }
  _seek(t) {
    const R = this.rec, F = R.frames, t0 = F[0].t, t1 = F[F.length - 1].t;
    t = Math.max(t0, Math.min(t1, t));
    let i = Math.min(F.length - 2, Math.max(0, Math.floor((t - t0) * FPS)));
    while (i > 0 && F[i].t > t) i--;
    while (i < F.length - 2 && F[i + 1].t < t) i++;
    const A = F[i], B = F[i + 1] || A, u = B.t > A.t ? Math.max(0, Math.min(1, (t - A.t) / (B.t - A.t))) : 0;
    this._apply(R, A, B, u);
    this._feet();
  }
  get dur() { const F = this.rec.frames; return F[F.length - 1].t - F[0].t; }
  // ---------------------------------------------------------------- 開く・閉じる
  open(R, onClose) {
    if (!R) return;
    this.rec = R; this.onClose = onClose;
    this.saved = this._grab(R, 0);   // 閉じたら今の形へ戻す
    { const bv = this.h.ballView && this.h.ballView(); this.ballSave = bv ? { s: bv.mesh.scale.x, dot: !!(bv.dot && bv.dot.visible), hist: bv.hist.slice() } : null; }
    this.on = true; this.t = 0; this.playing = true; this.snapCam = true;
    const cam = this.h.camera; this.camSave = { layers: cam.layers.mask };
    cam.layers.enable(31);   // 一人称で遊んだ時の自分の体(見えない層 31 で動きだけ付けていた)も映す
    this.h.hide(true);
    this.buildUI();
    this._seek(R.frames[0].t);
  }
  close() {
    if (!this.on) return;
    const R = this.rec;
    this._apply(R, this.saved, this.saved, 0);
    { const bv = this.h.ballView && this.h.ballView(), S = this.ballSave; if (bv && S) { bv.mesh.scale.setScalar(S.s); if (bv.dot) bv.dot.visible = S.dot; bv.hist = S.hist; } }
    this.h.camera.layers.mask = this.camSave.layers;
    this.on = false;
    if (this.ui) { this.ui.remove(); this.ui = null; }
    this.h.hide(false);
    if (this.onClose) this.onClose();
  }
  // ---------------------------------------------------------------- 毎こま
  tick(dt) {
    const R = this.rec, F = R.frames;
    if (this.playing) {
      this.t += dt * this.speed;
      if (this.t >= this.dur) { this.t = this.dur; this.playing = false; this.paintBtns(); }
    }
    this._seek(F[0].t + this.t);
    { const me = this.h.me(); if (me) { if (this.view === 'fp') { this._meVis = me.root.visible; me.root.visible = false; } } }   // 自分の目の時は自分の頭を映さない(位置は覚えた形のまま)
    this.place(dt);
    this._ballLook();
    // 近くの人を薄くする処理(カメラが体の中に入った時)を、リプレイのカメラで計り直す
    const cam = this.h.camera;
    for (const a of this.h.athletes()) if (a && a.rig && a._fadeNear && a.root.visible) { try { a._fadeNear(cam, a.root.getWorldPosition(V())); } catch (e) { } }
    this.h.render(dt);
    if (this.onFrame) this.onFrame();   // 11/27 X でシェアの動画を録る間だけ(js/share_x.js)。描いた直後に写す
    if (this.bar && !this.dragging) this.bar.value = String(Math.round(this.t / Math.max(0.01, this.dur) * 1000));
    if (this.tm) this.tm.textContent = this.t.toFixed(1) + ' / ' + this.dur.toFixed(1) + ' 秒';
  }
  // 視点
  place(dt) {
    const cam = this.h.camera, me = this.h.me(), ball = this.h.ball();
    me.root.updateMatrixWorld(true);
    const mp = me.root.getWorldPosition(V());
    const bv = ball && ball.visible;
    const bp = bv ? ball.getWorldPosition(V()) : null;
    if (bp) this.lastBall = bp.clone();
    const yaw = me.root.rotation.y, fwd = V(-Math.sin(yaw), 0, -Math.cos(yaw));
    const tgt = bp || this.lastBall || mp.clone().add(fwd.clone().multiplyScalar(10)).setY(1);
    let P, L;
    const toB = V(tgt.x - mp.x, 0, tgt.z - mp.z); if (toB.lengthSq() < 0.01) toB.copy(fwd); toB.normalize();
    if (this.recDir) toB.copy(this.recDir);   // 11/27 X でシェアの結果の動画を録る間だけ: 向きを捕った時の向きに決めて、カメラが回り込まないように(js/share_x.js)
    switch (this.view) {
      case 'fp': {
        P = mp.clone().setY(mp.y + 1.62).addScaledVector(fwd, 0.18);
        L = bv ? bp.clone() : P.clone().addScaledVector(fwd, 10).setY(P.y - 0.4);
        break;
      }
      case 'behind': P = mp.clone().addScaledVector(toB, -4.2).setY(mp.y + 2.3); L = mp.clone().addScaledVector(toB, 3).setY(mp.y + 1.0); break;
      case 'side': {
        const sd = V(-toB.z, 0, toB.x); P = mp.clone().addScaledVector(sd, 7).setY(mp.y + 1.6); L = mp.clone().setY(mp.y + 1.0);
        // 11/28 打球が画面の外へ出ていた(横からは自分だけを真ん中に見ていた): 球が見えている間は、自分と球の真ん中を見て、両方が入るだけ引く(45 m まで)
        if (bp && !OLD) { const half = Math.hypot(bp.x - L.x, bp.y - L.y, bp.z - L.z) / 2; if (half > 1.2) { const tv = Math.tan((cam.fov || 60) * Math.PI / 360), th = Math.min(tv, tv * (cam.aspect || 1)), need = Math.min(45, half / (th * 0.8) + 1); /* 縦長の画面は横の見える幅で決める */ L = L.clone().lerp(bp, 0.5); P = L.clone().addScaledVector(sd, Math.max(7, need)).setY(L.y + 1.6); } }
        break;
      }
      case 'high': { const c = mp.clone().lerp(V(tgt.x, 0, tgt.z), 0.35); P = c.clone().add(V(0.01, 26, 8)); L = c; break; }
      case 'tv': P = V(0, 7.5, 16); L = mp.clone().lerp(V(tgt.x, 0, tgt.z), 0.4).setY(1); break;
      case 'ball': {
        if (bp) { const dir = this.prevBall ? bp.clone().sub(this.prevBall) : V(); if (dir.lengthSq() > 1e-6) this.ballDir = dir.normalize(); this.prevBall = bp.clone(); }
        const d = this.ballDir || toB;
        P = tgt.clone().addScaledVector(V(d.x, 0, d.z).normalize(), -3.2).setY(tgt.y + 1.0); L = tgt.clone(); break;
      }
      default: {   // 自由: 自分のまわりを指で回す
        const o = this.orb, c = mp.clone().setY(mp.y + 1.0);
        P = c.clone().add(V(Math.sin(o.yaw) * Math.cos(o.pitch), Math.sin(o.pitch), Math.cos(o.yaw) * Math.cos(o.pitch)).multiplyScalar(o.dist)); L = c;
      }
    }
    if (P.y < 0.3) P.y = 0.3;
    // 11/28 「後ろから」「横から」で、高いフライ・打った直後の遠い球が画面の外に出ていた: 球が画面の内側(縁から 15%)に入るまで、見る所を球の方へ寄せる
    if (bp && !OLD && (this.view === 'behind' || this.view === 'side')) {
      const c = this._fitCam || (this._fitCam = new THREE.PerspectiveCamera());
      c.fov = cam.fov; c.aspect = cam.aspect; c.near = cam.near; c.far = cam.far; c.updateProjectionMatrix(); c.position.copy(P); c.up.set(0, 1, 0);
      for (let k = 0; k < 8; k++) {
        c.lookAt(L); c.updateMatrixWorld(true);
        const q = bp.clone().project(c), front = c.getWorldDirection(V()).dot(bp.clone().sub(P)) > 0;
        if (front && Math.abs(q.x) < 0.85 && Math.abs(q.y) < 0.85) break;
        L = L.clone().lerp(bp, 0.3);
      }
    }
    const k = this.snapCam || this.view === 'fp' || this.view === 'free' ? 1 : 1 - Math.exp(-8 * dt);
    this.camP.lerp(P, k); this.camL.lerp(L, k);
    if (this.snapCam) { this.camP.copy(P); this.camL.copy(L); this.snapCam = false; }
    cam.position.copy(this.camP); cam.up.set(0, 1, 0); cam.lookAt(this.camL); cam.updateMatrixWorld(true);
  }
  // ---------------------------------------------------------------- 画面
  buildUI() {
    const css = `body.replayOn>*:not(#rpUI):not(#view):not(#bpXShare):not(script):not(style):not(link){visibility:hidden!important}
#rpUI{position:fixed;inset:0;z-index:9000;touch-action:none;user-select:none;-webkit-user-select:none;font-family:system-ui,sans-serif}
#rpUI .rpTop{position:absolute;top:max(10px,env(safe-area-inset-top));left:10px;right:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
#rpUI .rpTag{background:#d62828;color:#fff;font-weight:900;padding:5px 10px;border-radius:6px;letter-spacing:.1em;font-size:14px}
#rpUI button{font:700 14px system-ui,sans-serif;color:#fff;background:rgba(10,16,40,.72);border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:8px 11px;cursor:pointer}
#rpUI button.on{background:#ffb703;color:#10162e;border-color:#ffb703}
#rpUI .rpShare{margin-left:auto;background:#000;border-color:#fff}
#rpUI .rpBot{position:absolute;left:10px;right:10px;bottom:max(12px,env(safe-area-inset-bottom));display:flex;gap:8px;align-items:center;background:rgba(10,16,40,.6);border-radius:10px;padding:8px 10px}
#rpUI .rpBot input{flex:1;accent-color:#ffb703;height:28px}
#rpUI .rpTm{color:#fff;font:600 13px system-ui;min-width:86px;text-align:right}
#rpUI .rpPlay{min-width:48px;font-size:18px}
#rpUI .rpHint{position:absolute;left:50%;bottom:78px;transform:translateX(-50%);color:#fff;background:rgba(10,16,40,.55);padding:4px 10px;border-radius:6px;font-size:12px;pointer-events:none}`;
    const ui = document.createElement('div'); ui.id = 'rpUI';
    ui.innerHTML = `<style>${css}</style><div class="rpTop"><span class="rpTag">REPLAY</span>${VIEWS.map(([k, n]) => `<button data-v="${k}">${n}</button>`).join('')}<button class="rpShare xShareBtn">X でシェア</button><button class="rpClose">とじる</button></div>
<div class="rpBot"><button class="rpPlay"></button><button class="rpBack" aria-label="最初から">⏮</button><input type="range" min="0" max="1000" value="0"><span class="rpTm"></span>${[0.25, 0.5, 1].map((s) => `<button data-s="${s}">${s === 1 ? '等速' : s === 0.5 ? '1/2' : '1/4'}</button>`).join('')}</div>`;
    document.body.appendChild(ui); this.ui = ui;
    const stop = (e) => e.stopPropagation();
    ui.querySelectorAll('button,input').forEach((b) => { b.addEventListener('pointerdown', stop); b.addEventListener('click', stop); });
    ui.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { this.view = b.dataset.v; this.snapCam = true; this.paintBtns(); }));
    ui.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { this.speed = +b.dataset.s; this.paintBtns(); }));
    ui.querySelector('.rpClose').addEventListener('click', () => this.close());
    // 11/27 X でシェア: 押した時だけリプレイを流しながら数秒を録る(録れない所は今の場面の絵)。js/share_x.js
    { const sb = ui.querySelector('.rpShare'); sb.addEventListener('click', () => { const S = window.__bpShareX; if (S && !this.recording) S.replay(this, sb); }); if (!window.__bpShareX) sb.remove(); }
    ui.querySelector('.rpPlay').addEventListener('click', () => { if (!this.playing && this.t >= this.dur - 0.01) this.t = 0; this.playing = !this.playing; this.paintBtns(); });
    ui.querySelector('.rpBack').addEventListener('click', () => { this.t = 0; this.playing = true; this.snapCam = true; this.paintBtns(); });
    const bar = this.bar = ui.querySelector('input'); this.tm = ui.querySelector('.rpTm');
    bar.addEventListener('input', () => { this.dragging = true; this.t = +bar.value / 1000 * this.dur; this.playing = false; this.snapCam = true; this.paintBtns(); });
    bar.addEventListener('change', () => { this.dragging = false; });
    // 自由の視点: 画面をなぞって回す・ホイールとつまむで寄る
    let drag = null; const pts = new Map();
    ui.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, [e.clientX, e.clientY]); drag = { x: e.clientX, y: e.clientY, d: null }; if (this.view !== 'free') { this.view = 'free'; this.orbFromCam(); this.paintBtns(); } });
    ui.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId) || !drag) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size >= 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (drag.d) this.orb.dist = Math.max(2, Math.min(40, this.orb.dist * drag.d / d)); drag.d = d; return; }
      this.orb.yaw -= (e.clientX - drag.x) * 0.008; this.orb.pitch = Math.max(-0.05, Math.min(1.45, this.orb.pitch + (e.clientY - drag.y) * 0.006));
      drag.x = e.clientX; drag.y = e.clientY;
    });
    const up = (e) => { pts.delete(e.pointerId); if (!pts.size) drag = null; else if (drag) drag.d = null; };
    ui.addEventListener('pointerup', up); ui.addEventListener('pointercancel', up);
    ui.addEventListener('wheel', (e) => { e.preventDefault(); if (this.view !== 'free') { this.view = 'free'; this.orbFromCam(); this.paintBtns(); } this.orb.dist = Math.max(2, Math.min(40, this.orb.dist * Math.exp(e.deltaY * 0.001))); }, { passive: false });
    this.paintBtns();
  }
  orbFromCam() {
    const me = this.h.me(), c = me.root.getWorldPosition(V()).setY(me.root.position.y + 1.0), d = this.h.camera.position.clone().sub(c);
    const dist = Math.max(2, Math.min(40, d.length()));
    this.orb = { dist, yaw: Math.atan2(d.x, d.z), pitch: Math.max(-0.05, Math.min(1.45, Math.asin(Math.max(-1, Math.min(1, d.y / dist))))) };
  }
  paintBtns() {
    if (!this.ui) return;
    this.ui.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === this.view));
    this.ui.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', +b.dataset.s === this.speed));
    this.ui.querySelector('.rpPlay').textContent = this.playing ? '❚❚' : '▶';
  }
}
