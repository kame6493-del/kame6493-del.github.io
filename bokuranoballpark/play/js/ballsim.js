// 球場の中で球を飛ばす: 重力・空気抵抗・マグナス力(physics.js と同じ式)+ 当たり判定で跳ねる + 芝と土で違う転がり。
// 座標は three(x = 一塁側、y = 上、z = 本塁から捕手側が +、センターは -z)。本塁の後ろの頂点が原点。
import * as THREE from 'three';
import { PHYS, liftCoef } from './physics.js';

const G = PHYS.g;
// 地面ごとの性質: 跳ね返り(縦)、跳ねたときの横の残り、転がりの減速(m/s^2)
export const SURF = {
  s: { e: 0.40, keep: 0.80, roll: 2.6, name: '土' },
  g: { e: 0.33, keep: 0.70, roll: 3.6, name: '芝' },
  a: { e: 0.36, keep: 0.76, roll: 3.0, name: '人工芝' },   // ドーム(天然芝より約 9% よく跳ねる: Penn State の Pennbounce)
  t: { e: 0.40, keep: 0.72, roll: 3.2, name: '警告帯' },
  w: { e: 0.30, keep: 0.55, roll: 4.0, name: '壁' },
  x: { e: 0.32, keep: 0.65, roll: 3.0, name: 'その他' },
};

const _a = new THREE.Vector3(), _c = new THREE.Vector3(), _wp = new THREE.Vector3();
const _ray = new THREE.Ray();

export class BallSim {
  // world: { bvh, surfaceAt(x,z) -> 's'|'g'|'t'|'x', groundY(x,z) }
  constructor(world, opt = {}) {
    this.world = world;
    this.p = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.w = new THREE.Vector3();
    this.Cd = opt.Cd ?? 0.35;
    this.clScale = opt.clScale ?? 1.0;
    this.state = 'idle';       // fly | roll | stop | idle
    this.t = 0;
    this.bounces = 0;
    this.firstHit = null;      // 最初に何かに当たった所 { p, t, n, wall }
    this.events = [];
  }
  launch(p, v, w) {
    this.p.copy(p); this.v.copy(v); this.w.copy(w || _a.set(0, 0, 0));
    this.state = 'fly'; this.t = 0; this.bounces = 0; this.firstHit = null; this.events.length = 0;
    return this;
  }
  _accel(v, out) {
    const sp = v.length();
    const k = PHYS.k;
    out.copy(v).multiplyScalar(-k * this.Cd * sp);
    out.y -= G;
    if (sp > 0.5 && this.w.lengthSq() > 1) {
      const wv = this.w.dot(v) / (sp * sp);
      _wp.copy(this.w).addScaledVector(v, -wv);
      const wpl = _wp.length();
      if (wpl > 1e-3) {
        const S = PHYS.r * wpl / sp;
        const cl = liftCoef(S) * this.clScale;
        _c.crossVectors(_wp, v);
        out.addScaledVector(_c, k * cl * sp * sp / (wpl * sp));
      }
    }
    return out;
  }
  step(dt) {
    if (this.state === 'idle' || this.state === 'stop') return;
    this.t += dt;
    const bvh = this.world.bvh;
    if (this.state === 'fly') {
      // ドームの屋根: 膜の高さを超えたら下向きに跳ね返す(縦の反発 0.2。天井に当たってもボールインプレイ)
      if (this.world.roofAt && this.v.y > 0) {
        const rh = this.world.roofAt(this.p.x, this.p.z);
        if (rh != null && this.p.y >= rh - 0.1) { this.v.y = -Math.abs(this.v.y) * 0.2; this.v.x *= 0.7; this.v.z *= 0.7; this.events.push({ type: 'roof', t: this.t, p: this.p.clone() }); }
      }
      // 半分の刻みで速度を進める(中点法)
      const a1 = this._accel(this.v, new THREE.Vector3());
      const vm = this.v.clone().addScaledVector(a1, dt / 2);
      const a2 = this._accel(vm, new THREE.Vector3());
      const d = vm.clone().multiplyScalar(dt);
      const len = d.length();
      if (len > 1e-6 && bvh) {
        _ray.origin.copy(this.p); _ray.direction.copy(d).divideScalar(len);
        const hit = bvh.raycastFirst(_ray, THREE.DoubleSide, 0, len + PHYS.r);
        if (hit) {
          const n = hit.face.normal.clone();
          if (n.dot(_ray.direction) > 0) n.negate();
          this.p.copy(hit.point).addScaledVector(n, PHYS.r + 0.002);
          this._bounce(n, hit.point);
          return;
        }
      }
      this.p.add(d);
      this.v.addScaledVector(a2, dt);
      // 地面より下へ抜けない(念のため)
      const gy = this.world.groundY ? this.world.groundY(this.p.x, this.p.z, this.p.y + 0.5) : 0;
      if (gy != null && this.p.y < gy + PHYS.r) {
        this.p.y = gy + PHYS.r;
        this._bounce(new THREE.Vector3(0, 1, 0), this.p.clone().setY(gy));
      }
    } else if (this.state === 'roll') {
      const sp = Math.hypot(this.v.x, this.v.z);
      const sk = this.world.surfaceAt ? this.world.surfaceAt(this.p.x, this.p.z) : 'x';
      const S = SURF[sk] || SURF.x;
      const dec = S.roll + PHYS.k * this.Cd * sp * sp;
      const nsp = Math.max(0, sp - dec * dt);
      if (nsp < 0.05) { this.v.set(0, 0, 0); this.state = 'stop'; this.events.push({ type: 'stop', t: this.t, p: this.p.clone() }); return; }
      this.v.x *= nsp / sp; this.v.z *= nsp / sp; this.v.y = 0;
      const d = this.v.clone().multiplyScalar(dt);
      const len = d.length();
      if (bvh && len > 1e-6) {
        _ray.origin.copy(this.p); _ray.direction.copy(d).divideScalar(len);
        const hit = bvh.raycastFirst(_ray, THREE.DoubleSide, 0, len + PHYS.r);
        if (hit && Math.abs(hit.face.normal.y) < 0.6) {
          const n = hit.face.normal.clone(); n.y = 0; n.normalize();
          if (n.dot(_ray.direction) > 0) n.negate();
          const vn = this.v.dot(n);
          this.v.addScaledVector(n, -(1 + SURF.w.e) * vn).multiplyScalar(SURF.w.keep);
          this.events.push({ type: 'wall', t: this.t, p: this.p.clone() });
          if (!this.firstHit) this.firstHit = { p: hit.point.clone(), t: this.t, n, wall: true };
          return;
        }
      }
      this.p.add(d);
      const gy = this.world.groundY ? this.world.groundY(this.p.x, this.p.z, this.p.y + 0.6) : 0;
      if (gy != null) this.p.y = gy + PHYS.r;
    }
  }
  _bounce(n, at) {
    const wall = n.y < 0.6;
    const sk = wall ? 'w' : (this.world.surfaceAt ? this.world.surfaceAt(at.x, at.z) : 'x');
    const S = SURF[sk] || SURF.x;
    if (!this.firstHit) this.firstHit = { p: at.clone(), t: this.t, n: n.clone(), wall, surf: sk };
    const vn = this.v.dot(n);
    const vnv = n.clone().multiplyScalar(vn);
    const vt = this.v.clone().sub(vnv);
    this.bounces++;
    this.events.push({ type: wall ? 'wall' : 'bounce', t: this.t, p: at.clone(), surf: sk, speed: this.v.length() });
    this.v.copy(vt.multiplyScalar(S.keep)).addScaledVector(n, -vn * S.e);
    this.w.multiplyScalar(0.3);
    if (!wall && Math.abs(vn * S.e) < 1.2) {
      this.state = 'roll';
      this.v.y = 0;
      this.events.push({ type: 'roll', t: this.t, p: this.p.clone() });
    }
  }
}

// 先読み: 同じ条件で sec 秒ぶん回して、刻みごとの位置と出来事を返す(描画用の軌道にも使う)
export function predict(world, p, v, w, sec, opt = {}) {
  const b = new BallSim(world, opt).launch(p, v, w);
  const dt = opt.dt || 1 / 240;
  const pts = [];
  for (let t = 0; t < sec; t += dt) {
    pts.push(b.p.x, b.p.y, b.p.z, b.state === 'fly' ? 1 : b.state === 'roll' ? 2 : 3);
    b.step(dt);
    if (b.state === 'stop') { pts.push(b.p.x, b.p.y, b.p.z, 3); break; }
  }
  return { dt, pts: new Float32Array(pts), n: pts.length / 4, events: b.events, firstHit: b.firstHit, end: b.p.clone() };
}

export function samplePath(path, t, out) {
  const f = t / path.dt;
  let i = Math.floor(f);
  if (i >= path.n - 1) { i = path.n - 1; return out.set(path.pts[i * 4], path.pts[i * 4 + 1], path.pts[i * 4 + 2]); }
  if (i < 0) i = 0;
  const u = f - i, a = i * 4, b = a + 4;
  return out.set(path.pts[a] + (path.pts[b] - path.pts[a]) * u, path.pts[a + 1] + (path.pts[b + 1] - path.pts[a + 1]) * u,
    path.pts[a + 2] + (path.pts[b + 2] - path.pts[a + 2]) * u);
}
export const pathDuration = (path) => (path.n - 1) * path.dt;

// 送球: 届く強さで、受け手の胸(高さ h)へ。速さ speed(m/s)で、角度を二分法で合わせる(空気抵抗込み、地面は無視)
export function solveThrow(from, to, speed, h = 1.3) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  const ux = dx / dist, uz = dz / dist;
  const k = PHYS.k * 0.35;
  const heightAt = (ang) => {
    let x = 0, y = from.y, vx = Math.cos(ang) * speed, vy = Math.sin(ang) * speed, t = 0;
    const dt = 1 / 240;
    while (x < dist && t < 6) {
      const sp = Math.hypot(vx, vy);
      vx += -k * sp * vx * dt; vy += (-k * sp * vy - G) * dt;
      x += vx * dt; y += vy * dt; t += dt;
      if (vx <= 0.1) return { y: -99, t };
    }
    return { y, t };
  };
  let lo = -0.3, hi = 0.75;
  for (let i = 0; i < 28; i++) {
    const m = (lo + hi) / 2;
    if (heightAt(m).y < to.y + h) lo = m; else hi = m;
  }
  const ang = (lo + hi) / 2;
  const r = heightAt(ang);
  // 送球の回転(バックスピン): 進行方向 × 上
  const v = new THREE.Vector3(ux * Math.cos(ang) * speed, Math.sin(ang) * speed, uz * Math.cos(ang) * speed);
  // 解くときに揚力を入れていないので、回転は付けない(見た目の回転は描画側で)
  return { v, w: new THREE.Vector3(), t: r.t, ang };
}
