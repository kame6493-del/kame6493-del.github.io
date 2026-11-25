// 打者: 木製バット (旋盤形状 + 木目)、手袋、スイングの動き、当たりの計算
import * as THREE from 'three';
import { mulberry32, clamp, randn, rand } from './util.js';

export const SWING_TIME = 0.15;   // 振り出しから当たるまで (秒、ゲーム内時間)
export const CONTACT_Z = -0.62;   // ジャストのときに当たる面 (本塁の前の辺より 19cm 投手寄り)
const BAT_LEN = 0.86;

function woodTexture() {
  const W = 1024, H = 128;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const rnd = mulberry32(8);
  // u = バットの長さ方向 (0 = グリップ端、1 = 先端)
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0.0, '#1a1a1c');   // テープ
  g.addColorStop(0.24, '#1a1a1c');
  g.addColorStop(0.245, '#d9b98a'); // 白木
  g.addColorStop(0.5, '#d2ae7c');
  g.addColorStop(0.56, '#2b1d14');  // 黒塗りへ
  g.addColorStop(0.62, '#141110');
  g.addColorStop(1.0, '#0f0d0c');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // 木目
  for (let i = 0; i < 60; i++) {
    const y = rnd() * H;
    x.strokeStyle = `rgba(120,80,40,${0.08 + rnd() * 0.12})`;
    x.lineWidth = 1 + rnd() * 2;
    x.beginPath(); x.moveTo(W * 0.245, y);
    for (let u = 0.25; u <= 0.6; u += 0.02) x.lineTo(W * u, y + Math.sin(u * 30 + i) * 3);
    x.stroke();
  }
  // テープの巻き目
  for (let u = 0.01; u < 0.24; u += 0.012) {
    x.strokeStyle = 'rgba(255,255,255,0.07)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(W * u, 0); x.lineTo(W * (u + 0.01), H); x.stroke();
  }
  // 黒塗りのつや (縞)
  x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(W * 0.6, H * 0.35, W * 0.4, H * 0.12);
  // ロゴの文字は入れない(この版は名前・ロゴを出さない)
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function batGeometry() {
  // 半径プロファイル (m): グリップ端の膨らみ → 細いグリップ → テーパー → 太い芯 → 丸い先端
  const prof = [
    [0.0, 0.0], [0.0, 0.026], [0.006, 0.03], [0.014, 0.027], [0.03, 0.0135], [0.12, 0.0128], [0.25, 0.0135],
    [0.38, 0.017], [0.5, 0.024], [0.6, 0.0305], [0.7, 0.0328], [0.8, 0.033], [0.845, 0.031], [0.855, 0.026], [0.86, 0.0],
  ];
  const pts = prof.map(([y, r]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 28);
  // UV の v を長さ方向に (Lathe の uv.y = 点の順番の割合 → 長さに置き換え)
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getY(i) / BAT_LEN, uv.getX(i));
  // テクスチャは u が長さ方向なので入れ替え済み
  return g;
}

function gloveHand(color, wrist) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), m);
  fist.scale.set(1.0, 1.15, 0.95);
  g.add(fist);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.04, 0.04, 16), new THREE.MeshStandardMaterial({ color: wrist, roughness: 0.7 }));
  band.position.set(0, 0, 0.05); band.rotation.x = Math.PI / 2;
  g.add(band);
  return g;
}

export class Batter {
  constructor(scene) {
    this.side = 'L'; // 左打ち (本塁の一塁側に立つ)
    this.group = new THREE.Group();
    scene.add(this.group);
    const wood = woodTexture();
    this.bat = new THREE.Mesh(batGeometry(), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.42, metalness: 0.05 }));
    // バットの長さ方向 = ローカル +y、原点 = グリップ端
    this.batPivot = new THREE.Group();
    this.batPivot.add(this.bat);
    this.bat.position.y = -0.07; // 手の位置をグリップ端から 7cm
    this.group.add(this.batPivot);
    this.handTop = gloveHand(0xf2f2f2, 0x16264d);
    this.handBot = gloveHand(0xf2f2f2, 0x16264d);
    this.batPivot.add(this.handTop); this.batPivot.add(this.handBot);
    this.handTop.position.set(0, 0.04, 0); this.handBot.position.set(0, -0.05, 0);
    this.handTop.rotation.x = -Math.PI / 2; this.handBot.rotation.x = -Math.PI / 2;
    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    this.swingT = -1;
    this.aim = new THREE.Vector3(0, 0.8, CONTACT_Z);
    this.keys = null;
    this.idleT = 0;
    this.camM = null; // 構えはカメラから見た位置で決める
  }
  setCameraBase(pos, look) {
    const m = new THREE.Matrix4().lookAt(pos, look, new THREE.Vector3(0, 1, 0));
    m.setPosition(pos);
    this.camM = m;
    this.camQ = new THREE.Quaternion().setFromRotationMatrix(m);
  }
  _cam(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(this.camM); }
  _camDir(x, y, z) { return new THREE.Vector3(x, y, z).normalize().applyQuaternion(this.camQ); }
  get tipDir() { return this.side === 'L' ? -1 : 1; } // 先端が向く x 方向 (当たる瞬間)
  setSide(s) { this.side = s; }

  // 構え・スイングの姿勢 (手の位置と、バットの向き)
  _keys(aim) {
    const sx = this.side === 'L' ? 1 : -1; // 打者のいる側
    const dirAt = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
    // 当たる瞬間: 芯 (グリップから 0.66m) が狙いの点へ。バットはほぼ水平、先端が少し下がり前へ
    const low = clamp((0.85 - aim.y) * 0.9, -0.3, 0.6);
    const dC = dirAt(-sx, -0.12 - low * 0.55, -0.18);
    const hC = aim.clone().sub(dC.clone().multiplyScalar(0.66));
    return [
      // 構え (画面の右下から、先端は右上へ抜ける)
      { t: -1, h: this._cam(sx * 0.1, -0.3, -0.36), d: this._camDir(sx * 0.0, 0.21, -0.85) },
      { t: 0.0, h: this._cam(sx * 0.1, -0.3, -0.36), d: this._camDir(sx * 0.0, 0.21, -0.85) },
      // テイクバック (バットが後ろへ寝る)
      { t: 0.05, h: new THREE.Vector3(sx * 0.42, 1.0, 0.75), d: dirAt(-sx * 0.2, 0.55, 0.8) },
      // バットが下りて水平へ
      { t: 0.11, h: hC.clone().add(new THREE.Vector3(sx * 0.12, 0.08, 0.32)), d: dirAt(sx * 0.35, -0.05, 0.94) },
      { t: SWING_TIME, h: hC, d: dC },
      // フォロースルー (左へ抜けて、肩の上へ)
      { t: 0.2, h: hC.clone().add(new THREE.Vector3(-sx * 0.3, 0.12, 0.1)), d: dirAt(-sx * 0.3, 0.05, 0.95) },
      { t: 0.32, h: new THREE.Vector3(-sx * 0.4, 1.25, 1.0), d: dirAt(sx * 0.4, 0.55, 0.75) },
      { t: 0.6, h: new THREE.Vector3(-sx * 0.55, 1.3, 1.3), d: dirAt(sx * 0.5, 0.5, 0.7) },
    ];
  }
  startSwing(aim) {
    this.aim.copy(aim);
    this.keys = this._keys(aim);
    this.swingT = 0;
  }
  reset() { this.swingT = -1; this.keys = null; }
  // 当たった瞬間: バットの芯を球に合わせ直し、当たる姿勢にそろえる
  snapContact(ballPos) {
    const a = ballPos.clone();
    a.z = ballPos.z;
    this.keys = this._keys(a);
    this.swingT = SWING_TIME;
    this.freeze = true; // この 1 コマは当たった姿勢のまま見せる
  }
  _orient(d, up) {
    // ローカル +y を d に向け、ねじれは up で決める
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    return q;
  }
  update(dt, idleSway = true) {
    let h, d;
    if (this.swingT < 0) {
      this.idleT += dt;
      const k = this._keys(this.aim);
      h = k[1].h.clone(); d = k[1].d.clone();
      // 構えのわずかな揺れ (バットを小さく回す)
      if (idleSway) {
        const s = Math.sin(this.idleT * 2.2) * 0.02, c2 = Math.cos(this.idleT * 1.7) * 0.015;
        d.x += s; d.z += c2; d.normalize(); h.y += Math.sin(this.idleT * 1.3) * 0.008;
      }
    } else {
      if (this.freeze) this.freeze = false; else this.swingT += dt;
      const K = this.keys;
      let i = 1;
      while (i < K.length - 2 && this.swingT > K[i + 1].t) i++;
      const a = K[i], b = K[Math.min(i + 1, K.length - 1)];
      let u = clamp((this.swingT - a.t) / Math.max(1e-4, b.t - a.t), 0, 1);
      // 振り出しはゆっくり、当たる前は速く
      if (b.t <= SWING_TIME) u = u * u * (1.6 - 0.6 * u);
      else u = 1 - Math.pow(1 - u, 2);
      h = a.h.clone().lerp(b.h, u);
      const qa = this._orient(a.d), qb = this._orient(b.d);
      const q = qa.slerp(qb, u);
      this.batPivot.position.copy(h);
      this.batPivot.quaternion.copy(q);
      return;
    }
    this.batPivot.position.copy(h);
    this.batPivot.quaternion.copy(this._orient(d));
  }
}

// ---- 当たりの計算 ------------------------------------------------------------
// timing: 秒 (+ = 遅れ)、ballAt: 当たる面での球の位置、aim: 狙った点、vPitch: その時の球速 m/s
// opts: assist (0..0.7)、power (強振)、side ('L'|'R')
// 難易度: タイミングの窓と、上下の許し (倍率)、狙いの補正、近いタップを球へ寄せる半径
export const DIFF = {
  easy: { win: 1.4, reach: 1.4, assist: 0.6, snap: 0.2, slow: 0.75, label: 'やさしい' },
  normal: { win: 1.25, reach: 1.25, assist: 0.5, snap: 0.12, slow: 0.82, label: 'ふつう' },
  hard: { win: 1.0, reach: 1.0, assist: 0.38, snap: 0, slow: 0.92, label: 'むずかしい' },
};
export function computeContact(timing, ballAt, aim, vPitch, opts) {
  const D = DIFF[opts.diff] || DIFF.normal;
  // 球の近くをタップしていれば、狙いを球の通る所へ少し寄せる
  if (D.snap > 0) {
    const ex = ballAt.x - aim.x, ey = ballAt.y - aim.y, e = Math.hypot(ex, ey);
    if (e < D.snap) { const k = 0.45 * (1 - e / D.snap); aim = { x: aim.x + ex * k, y: aim.y + ey * k }; }
  }
  const assist = opts.assist != null ? opts.assist : 0.45;
  const power = !!opts.power;
  const tipDir = opts.side === 'L' ? -1 : 1;
  const pullSign = opts.side === 'L' ? 1 : -1; // 引っ張りの向き (+ = 右翼)
  const res = { contact: false, foulTip: false };
  // 読み (狙い球・高さ): 当たればバットの準備が間に合う (タイミングと上下のずれが小さくなる)。
  // 外れると少し崩される。本塁打の確率を直接は変えない
  const gm = opts.guess || {};
  const kT = gm.typeHit === true ? 0.75 : gm.typeHit === false ? 1.15 : 1;
  const kW = gm.typeHit === true ? 1.1 : gm.typeHit === false ? 0.92 : 1;
  const kV = gm.hHit === true ? 0.75 : gm.hHit === false ? 1.1 : 1;
  timing *= kT;
  // ずれ (補正で狙いが球へ寄る)
  const dy = (ballAt.y - aim.y) * (1 - assist) * kV;
  const along = (ballAt.x - aim.x) * tipDir * (1 - assist * 0.8); // + = 先端側
  const win = (power ? 0.07 : 0.082) * D.win * kW;
  // タイミングの窓
  const absT = Math.abs(timing);
  if (absT > win) return res;
  // 上下: 球とバットの半径の和 + 少しの許し
  const reach = (0.072 + (power ? 0 : 0.006)) * D.reach;
  const sphi = dy / reach;
  if (Math.abs(sphi) > 1.08 || along > 0.2 || along < -0.42) return res;
  if (Math.abs(sphi) > 0.97) { res.contact = true; res.foulTip = true; res.timingMs = timing * 1000; res.along = along; res.sphi = sphi; return res; }
  // バットのどこに当たったか → 反発 (有効な反発係数 q) とその点の速さ
  let q;
  if (along >= 0) q = 0.215 - 2.2 * along * along;
  else q = 0.215 - 1.15 * along * along - 0.25 * Math.max(0, -along - 0.12);
  q = Math.max(-0.05, q);
  const vSweet = (power ? 36.0 : 33.5) * (1 + 0.9 * along);
  // タイミングで芯を外す (早い・遅いほどバットが面に対して斜め)
  const g = Math.max(0.35, 1 - 0.55 * Math.pow(absT / (0.045 * D.win), 2));
  const vBat = vSweet * g;
  let ev = q * vPitch + (1 + q) * vBat;
  // 上下のずれは斜めの衝突 → 速さが落ちる
  ev *= 1 - 0.62 * sphi * sphi;
  ev *= 1 + randn() * 0.02;
  ev = Math.max(8, ev);
  // 打球角度: バットの軌道 (+9度) + ずれの角度
  let la = 11 + Math.asin(clamp(sphi, -1, 1)) * 180 / Math.PI * 0.95 + randn() * 3;
  la = clamp(la, -75, 85);
  // 方向: 早い = 引っ張り
  let spray = pullSign * (-timing * 880) + randn() * 4;
  // 内角は引っ張り、外角は流し
  spray += pullSign * ((ballAt.x - aim.x) * 0 + (opts.inside || 0) * 12);
  spray -= pullSign * along * 25;
  // 回転: 下を叩くとバックスピン
  const back = clamp(1700 + 2900 * sphi, -1800, 4600);
  const side = -pullSign * spray * 12;
  res.contact = true;
  // 上や下のふちに当たると後ろへのファウルになりやすい
  if ((Math.abs(sphi) > 0.62 && rand() < 0.7) || (absT > 0.04 * D.win && rand() < 0.35)) { res.foulBack = true; spray = (rand() < 0.5 ? -1 : 1) * (125 + rand() * 40); }
  res.ev = ev; // m/s
  res.la = la; res.spray = spray;
  res.backRpm = back; res.sideRpm = side;
  res.sweet = Math.abs(along) < 0.05 && Math.abs(sphi) < 0.45 && absT < 0.02;
  res.timingMs = timing * 1000;
  res.along = along; res.sphi = sphi;
  return res;
}

// 打球速度と角度から「バレル」かどうか (Statcast の定義をそのまま km/h に)
export function isBarrel(evKmh, la) {
  const mph = evKmh / 1.609;
  if (mph < 98) return false;
  let lo, hi;
  if (mph < 100) { lo = 26 - (mph - 98); hi = 30 + 1.5 * (mph - 98); }
  else { lo = 24 - (mph - 100); hi = 33 + (mph - 100) * 17 / 16; }
  return la >= Math.max(8, lo) && la <= Math.min(50, hi);
}
