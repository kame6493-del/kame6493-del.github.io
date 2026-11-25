// 球の物理: 重力 + 空気抵抗 + マグナス力(揚力係数は回転÷速度で決める)
// 座標: x = 一塁側(打者から見て右)、y = 上、z = 捕手側(投手 → 本塁が +z)
// 本塁の後ろの頂点が原点。本塁の前の辺は z = -0.432。投手板の前の辺は z = -18.44。

export const PHYS = {
  g: 9.80665,
  rho: 1.20,          // 空気密度 kg/m^3
  r: 0.0366,          // 半径 m
  m: 0.145,           // 質量 kg
  Cd: 0.35,           // 抗力係数
  clScale: 1.4,       // 揚力係数の倍率 (Sawicki 型を Statcast の変化量に合わせる)
  dt: 0.001,
};
PHYS.A = Math.PI * PHYS.r * PHYS.r;
PHYS.k = 0.5 * PHYS.rho * PHYS.A / PHYS.m; // 1/m

export const PLATE_FRONT_Z = -0.4318;
export const PLATE_MID_Z = -0.216;
export const RUBBER_Z = -18.44;
export const MOUND_H = 0.254;

// 揚力係数 (Sawicki 型): CL = 1 / (2 + 1/S), S = r|ω⊥| / v
export function liftCoef(S) {
  if (S <= 1e-6) return 0;
  return 1 / (2 + 1 / S);
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function accel(v, w, out, opt) {
  const sp = len(v);
  const k = PHYS.k;
  const cd = opt && opt.Cd != null ? opt.Cd : PHYS.Cd;
  let ax = -k * cd * sp * v[0];
  let ay = -k * cd * sp * v[1] - PHYS.g;
  let az = -k * cd * sp * v[2];
  if (w && sp > 0.5) {
    // 進行方向に平行な回転(ジャイロ成分)は曲がりに効かない
    const wv = dot(w, v) / (sp * sp);
    const wp = [w[0] - wv * v[0], w[1] - wv * v[1], w[2] - wv * v[2]];
    const wpl = len(wp);
    if (wpl > 1e-3) {
      const S = PHYS.r * wpl / sp;
      const cl = liftCoef(S) * (opt && opt.clScale != null ? opt.clScale : PHYS.clScale);
      const c = cross(wp, v); // |c| = wpl*sp
      const f = k * cl * sp * sp / (wpl * sp);
      ax += f * c[0]; ay += f * c[1]; az += f * c[2];
    }
  }
  out[0] = ax; out[1] = ay; out[2] = az;
}

// 位置・速度を dt で積分 (RK4)。stop(p, v, t) が true で止める。
export function simulate(p0, v0, w, opt = {}) {
  const dt = opt.dt || PHYS.dt;
  const tMax = opt.tMax || 1.2;
  const n = Math.ceil(tMax / dt) + 1;
  const pos = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  let p = p0.slice(), v = v0.slice();
  const a1 = [0, 0, 0], a2 = [0, 0, 0], a3 = [0, 0, 0], a4 = [0, 0, 0];
  let i = 0;
  for (; i < n; i++) {
    pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
    vel[i * 3] = v[0]; vel[i * 3 + 1] = v[1]; vel[i * 3 + 2] = v[2];
    if (opt.stop && opt.stop(p, v, i * dt)) { i++; break; }
    if (i === n - 1) { i++; break; }
    accel(v, w, a1, opt);
    const v2 = [v[0] + a1[0] * dt / 2, v[1] + a1[1] * dt / 2, v[2] + a1[2] * dt / 2];
    accel(v2, w, a2, opt);
    const v3 = [v[0] + a2[0] * dt / 2, v[1] + a2[1] * dt / 2, v[2] + a2[2] * dt / 2];
    accel(v3, w, a3, opt);
    const v4 = [v[0] + a3[0] * dt, v[1] + a3[1] * dt, v[2] + a3[2] * dt];
    accel(v4, w, a4, opt);
    for (let j = 0; j < 3; j++) {
      p[j] += dt * (v[j] + v2[j] * 2 + v3[j] * 2 + v4[j]) / 6;
      v[j] += dt * (a1[j] + 2 * a2[j] + 2 * a3[j] + a4[j]) / 6;
    }
  }
  return { dt, n: i, pos, vel, w };
}

// 軌道上の時刻 t の位置
export function sampleTraj(tr, t, out) {
  const f = t / tr.dt;
  let i = Math.floor(f);
  if (i < 0) i = 0;
  if (i >= tr.n - 1) { i = tr.n - 1; out[0] = tr.pos[i * 3]; out[1] = tr.pos[i * 3 + 1]; out[2] = tr.pos[i * 3 + 2]; return out; }
  const u = f - i;
  for (let j = 0; j < 3; j++) out[j] = tr.pos[i * 3 + j] * (1 - u) + tr.pos[(i + 1) * 3 + j] * u;
  return out;
}
export function sampleVel(tr, t, out) {
  let i = Math.round(t / tr.dt);
  i = Math.max(0, Math.min(tr.n - 1, i));
  out[0] = tr.vel[i * 3]; out[1] = tr.vel[i * 3 + 1]; out[2] = tr.vel[i * 3 + 2];
  return out;
}
// z 座標を最初に越える時刻 (+z 方向に進む球)
export function timeAtZ(tr, z) {
  for (let i = 1; i < tr.n; i++) {
    const z0 = tr.pos[(i - 1) * 3 + 2], z1 = tr.pos[i * 3 + 2];
    if (z0 < z && z1 >= z) return (i - 1 + (z - z0) / (z1 - z0)) * tr.dt;
  }
  return null;
}

// 投球の回転ベクトル (rad/s)
// moveDeg: マグナスで動かしたい向き (0 = 真上、+ = 腕の側)、hand: 右投げ 1 / 左投げ -1
// eff: 回転効率 (1 = 全部が揚力に効く、0 = 純ジャイロ)
export function pitchSpin(vdir, rpm, eff, moveDeg, hand) {
  const th = moveDeg * Math.PI / 180;
  const m = [-hand * Math.sin(th), Math.cos(th), 0];
  // m を進行方向に垂直にする
  const vd = norm(vdir);
  const md = dot(m, vd);
  const mp = norm([m[0] - md * vd[0], m[1] - md * vd[1], m[2] - md * vd[2]]);
  const axis = cross(vd, mp); // ω⊥ × v が m 向きになる軸
  const om = rpm * 2 * Math.PI / 60;
  const g = Math.sqrt(Math.max(0, 1 - eff * eff));
  return [om * (eff * axis[0] + g * vd[0]), om * (eff * axis[1] + g * vd[1]), om * (eff * axis[2] + g * vd[2])];
}

// リリース位置から、目標点 (x, y) を z=zt で通る初速の向きを解く (撃ち込み法)
export function solvePitch(p0, speed, spinFn, target, opt = {}) {
  const zt = opt.zt != null ? opt.zt : PLATE_FRONT_Z;
  let dx = target[0] - p0[0], dy = target[1] - p0[1], dz = zt - p0[2];
  let yaw = Math.atan2(dx, dz);
  let pitch = Math.atan2(dy, Math.hypot(dx, dz)) + 0.035; // 重力ぶん少し上へ
  let tr = null, w = null;
  for (let it = 0; it < 6; it++) {
    const dir = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
    const v0 = [dir[0] * speed, dir[1] * speed, dir[2] * speed];
    w = spinFn(dir);
    tr = simulate(p0, v0, w, { tMax: 1.4, stop: (p) => p[2] > zt + 1.5 || p[1] < -0.2 });
    const t = timeAtZ(tr, zt);
    if (t == null) { pitch += 0.02; continue; }
    const q = sampleTraj(tr, t, [0, 0, 0]);
    const ex = target[0] - q[0], ey = target[1] - q[1];
    const dist = Math.hypot(zt - p0[2], target[0] - p0[0]);
    yaw += ex / dist;
    pitch += ey / dist;
    if (Math.abs(ex) < 0.002 && Math.abs(ey) < 0.002) break;
  }
  const dir = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
  const v0 = [dir[0] * speed, dir[1] * speed, dir[2] * speed];
  // 本番の軌道 (捕手の先まで)
  w = spinFn(dir);
  tr = simulate(p0, v0, w, { tMax: 1.6, stop: (p) => p[2] > 1.6 || p[1] < 0.0 });
  return { tr, v0, w, dir };
}

// 打球: 地面で弾ませて転がすところまで (見た目用)。着地点と飛距離も返す。
export function simulateBatted(p0, v0, w, opt = {}) {
  const dt = 0.004;
  const fly = simulate(p0, v0, w, { dt, tMax: 9, stop: (p) => p[1] < PHYS.r || (opt.wall && opt.wall(p)) });
  return fly;
}
