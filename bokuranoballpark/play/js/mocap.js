// 実際の投球のモーションキャプチャ (CMU Graphics Lab Motion Capture Database, 被験者 124 の 2 本) を
// ゲームの投手へ移す。関節の「位置と向き」を書き出したデータ (models/pitch_mocap.json) を読み、
// 骨盤・上半身は向き、腕は骨の方向、脚は足首の位置 + 膝の向きで、モデルの骨の長さのまま IK で当てる。
import * as THREE from 'three';

let _clips = null;
export async function loadMocap() {
  if (_clips) return _clips;
  const r = await fetch('models/pitch_mocap.json');
  const raw = await r.json();
  _clips = {};
  for (const [k, c] of Object.entries(raw)) {
    _clips[k] = { 1: pack(c, false), [-1]: pack(c, true) };
  }
  return _clips;
}

const V3 = ['hip', 'head', 'ul', 'fl', 'hl', 'ur', 'fr', 'hr', 'al', 'ar', 'kl', 'kr', 'tl', 'tr'];
// 左投げは左右を入れ替えて x を反転する (向きの四元数は (x, -y, -z, w))
function pack(c, mirror) {
  const n = c.n;
  const o = { n, fps: c.fps, release: c.release, plant: c.plant, lift: c.lift };
  const sw = (k) => (mirror ? k.replace(/l$/, '#').replace(/r$/, 'l').replace(/#$/, 'r') : k);
  for (const key of V3) {
    const src = c[sw(key)];
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = mirror ? -src[i][0] : src[i][0]; a[i * 3 + 1] = src[i][1]; a[i * 3 + 2] = src[i][2]; }
    o[key] = a;
  }
  for (const key of ['qp', 'qt']) {
    const a = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const q = c[key][i];
      a[i * 4] = q[0]; a[i * 4 + 1] = mirror ? -q[1] : q[1]; a[i * 4 + 2] = mirror ? -q[2] : q[2]; a[i * 4 + 3] = q[3];
    }
    o[key] = a;
  }
  for (const key of ['cl', 'cr']) o[key] = Uint8Array.from(c[sw(key)]);
  const tr = c.toeRest;
  o.toeRest = new THREE.Vector3(mirror ? -tr[0] : tr[0], tr[1], tr[2]).normalize();
  o.mirror = mirror;
  return o;
}

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

// 時間の伸び縮み: ゲームの時刻 → クリップのコマ
// 区間: [0, 足の頂点] [頂点, 着地] [着地, リリース] [リリース, 終わり]
export class MocapPlayer {
  constructor(clip, style) {
    this.c = clip;
    this.style = style;
    const fps = clip.fps;
    const tempo = style.tempo || 1;
    const quick = !!style.quick;
    // 素材は着地 → リリースが遅め (素人の球速) なので、腕の加速を 1.35 倍速にする
    const sA = (quick ? 0.55 : 1.0) * tempo, sB = (quick ? 0.72 : 1.0) * tempo, sC = 0.74, sD = 0.92;
    const f = [0, clip.lift, clip.plant, clip.release, clip.n - 1];
    const s = [sA, sB, sC, sD];
    this.seg = [];
    let t = 0;
    for (let i = 0; i < 4; i++) {
      const dur = (f[i + 1] - f[i]) / fps * s[i];
      this.seg.push({ f0: f[i], f1: f[i + 1], t0: t, t1: t + dur });
      t += dur;
    }
    this.tLift = this.seg[1].t0; this.tPlant = this.seg[2].t0; this.tRelease = this.seg[3].t0; this.tEnd = t;
    // 腕の角度 (体幹を前後軸で倒す): オーバーはグラブ側へ、サイドは腕の側へ
    const armSide = clip.mirror ? -1 : 1;
    this.roll = (style.slot === 'over' ? -11 : style.slot === 'side' ? 26 : 0) * armSide * Math.PI / 180;
    this.stride = style.stride || 1.14;
    this.kick = style.kick || 1;
  }
  frameAt(t) {
    for (const s of this.seg) {
      if (t <= s.t1 || s === this.seg[3]) {
        const u = Math.max(0, Math.min(1, (t - s.t0) / Math.max(1e-6, s.t1 - s.t0)));
        return s.f0 + (s.f1 - s.f0) * u;
      }
    }
    return this.c.n - 1;
  }
  get tReleaseExact() { return this.tRelease; }
  sample(t) {
    const c = this.c;
    const fr = Math.max(0, Math.min(c.n - 1.001, this.frameAt(t)));
    const i = Math.floor(fr), u = fr - i;
    const v3 = (key) => {
      const a = c[key];
      return new THREE.Vector3(
        a[i * 3] + (a[i * 3 + 3] - a[i * 3]) * u, a[i * 3 + 1] + (a[i * 3 + 4] - a[i * 3 + 1]) * u, a[i * 3 + 2] + (a[i * 3 + 5] - a[i * 3 + 2]) * u);
    };
    const q4 = (key) => {
      const a = c[key];
      _qa.set(a[i * 4], a[i * 4 + 1], a[i * 4 + 2], a[i * 4 + 3]);
      _qb.set(a[i * 4 + 4], a[i * 4 + 5], a[i * 4 + 6], a[i * 4 + 7]);
      return _qa.clone().slerp(_qb, u);
    };
    const P = { mocap: true, frame: fr };
    for (const k of V3) P[k] = v3(k);
    for (const k of ['ul', 'fl', 'hl', 'ur', 'fr', 'hr', 'tl', 'tr']) P[k].normalize();
    P.qp = q4('qp'); P.qt = q4('qt');
    P.cl = c.cl[Math.round(fr)]; P.cr = c.cr[Math.round(fr)];
    P.toeRest = c.toeRest;
    // 踏み出しを大きく (足を上げた後から着地まで、z を伸ばす)
    const sk = 1 + (this.stride - 1) * smooth01((fr - c.lift) / Math.max(1, c.plant - c.lift));
    if (sk !== 1) for (const k of ['hip', 'al', 'ar', 'kl', 'kr']) P[k].z = 0.08 + (P[k].z - 0.08) * sk;
    // クイックは足を低く上げる
    const lead = c.mirror ? 'r' : 'l';
    if (this.style.quick || this.kick !== 1) {
      const kk = this.style.quick ? 0.4 : this.kick;
      const w = fr < c.plant ? 1 : 0;
      if (w) {
        const ay = P['a' + lead].y, ky = P['k' + lead].y;
        P['a' + lead].y = 0.0865 + (ay - 0.0865) * kk;
        P['k' + lead].y = 0.5 + (ky - 0.5) * (0.5 + 0.5 * kk);
      }
    }
    // 足を上げたときは膝をたたむ (足先を膝の下へ寄せる)
    {
      const w = bell(fr, c.lift - 55, c.lift, c.lift + 32) * (this.style.fold != null ? this.style.fold : 0.5);
      if (w > 0) {
        const a = P['a' + lead], k = P['k' + lead];
        a.x += (k.x - a.x) * w; a.z += (k.z - a.z) * w;
      }
    }
    // 腕の角度: 着地からリリースの少し後まで体幹を倒す
    if (this.roll) {
      const tt = this.timeOfFrame(fr);
      const w = bell(tt, this.tPlant - 0.18, this.tRelease, this.tRelease + 0.25);
      if (w > 0) {
        const r = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.roll * w);
        P.qt.premultiply(r);
        for (const k of ['ul', 'fl', 'hl', 'ur', 'fr', 'hr']) P[k].applyQuaternion(r);
      }
    }
    return P;
  }
  timeOfFrame(fr) {
    for (const s of this.seg) if (fr <= s.f1) return s.t0 + (fr - s.f0) / Math.max(1e-6, s.f1 - s.f0) * (s.t1 - s.t0);
    return this.tEnd;
  }
}
function smooth01(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
function bell(t, a, b, c) {
  if (t <= a || t >= c) return 0;
  return t < b ? smooth01((t - a) / (b - a)) : 1 - smooth01((t - b) / (c - b));
}

// 2 つの姿勢を混ぜる
export function blendMocap(a, b, u) {
  const P = { mocap: true };
  for (const k of V3) P[k] = a[k].clone().lerp(b[k], u);
  for (const k of ['ul', 'fl', 'hl', 'ur', 'fr', 'hr', 'tl', 'tr']) P[k].normalize();
  P.qp = a.qp.clone().slerp(b.qp, u); P.qt = a.qt.clone().slerp(b.qt, u);
  P.cl = 1; P.cr = 1; P.toeRest = b.toeRest;
  return P;
}

// サインをのぞく姿勢: 上体を前へ倒し、両腕を下ろす (グラブは膝のあたり)
export function signPose(set, mirror) {
  const P = blendMocap(set, set, 0);
  // 骨盤の向き (横向き) を保ったまま、その体の前へ倒す
  const fwdP = new THREE.Vector3(0, 0, 1).applyQuaternion(set.qp); fwdP.y = 0; fwdP.normalize();
  const side = new THREE.Vector3(0, 1, 0).cross(fwdP).normalize();
  const leanT = new THREE.Quaternion().setFromAxisAngle(side, 0.34);
  const leanPel = new THREE.Quaternion().setFromAxisAngle(side, 0.12);
  P.qt = set.qt.clone().premultiply(leanT);
  P.qp = set.qp.clone().premultiply(leanPel);
  P.hip = set.hip.clone().add(fwdP.clone().multiplyScalar(-0.04)); P.hip.y -= 0.02;
  // 腕を下ろす (前へ少し)
  const down = (fx) => new THREE.Vector3(0, -1, 0).add(fwdP.clone().multiplyScalar(fx)).normalize();
  P.ul = down(0.25); P.fl = down(0.55); P.ur = down(0.2); P.fr = down(0.5);
  P.hl = down(0.6); P.hr = down(0.6);
  return P;
}
