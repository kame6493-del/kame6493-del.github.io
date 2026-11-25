// 簡単な人の形(野手・走者・打者・捕手)。顔は作らない。ユニフォームは無地の架空の色、名前・番号・ロゴなし。
// 関節は 腰・膝・肩・肘 だけ。向きは root.rotation.y(0 で -z を向く)。
import * as THREE from 'three';
import { skipHidden } from './hidskip.js';   // 11/25 軽く

const matCache = new Map();
function mat(color, rough = 0.85) {
  const k = color + '|' + rough;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough }));
  return matCache.get(k);
}
const cyl = (r1, r2, h, seg = 8) => { const g = new THREE.CylinderGeometry(r1, r2, h, seg, 1); g.translate(0, -h / 2, 0); return g; };
const GEO = {
  thigh: cyl(0.085, 0.07, 0.46), shin: cyl(0.065, 0.05, 0.46), foot: new THREE.BoxGeometry(0.1, 0.07, 0.24),
  torso: new THREE.CylinderGeometry(0.2, 0.16, 0.58, 10), pelvis: new THREE.CylinderGeometry(0.16, 0.15, 0.2, 10),
  upper: cyl(0.055, 0.048, 0.32), lower: cyl(0.047, 0.04, 0.3), head: new THREE.SphereGeometry(0.11, 14, 10),
  neck: cyl(0.05, 0.05, 0.08), cap: new THREE.SphereGeometry(0.118, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2),
  brim: new THREE.CylinderGeometry(0.1, 0.1, 0.012, 14, 1, false, -Math.PI / 2, Math.PI), glove: new THREE.BoxGeometry(0.13, 0.17, 0.08),
  hand: new THREE.SphereGeometry(0.045, 8, 6), bat: cyl(0.018, 0.033, 0.86, 10), mask: new THREE.BoxGeometry(0.2, 0.22, 0.08),
};

export const KIT = {
  home: { side: 'home', jersey: 0xeceef2, pants: 0xeceef2, cap: 0x1f3557, sock: 0x1f3557, under: 0x1f3557 },      // 守る側(架空の色)
  away: { side: 'away', jersey: 0x8a8f99, pants: 0x8a8f99, cap: 0x5a1f22, sock: 0x5a1f22, under: 0x5a1f22 },   // side: 学校の色と胸の文字は js/uniform.js      // 攻める側
};

export class Person {
  constructor(kit = KIT.home, opt = {}) {
    this.root = skipHidden(new THREE.Group()); this.root.userData.person = true;   // 11/25 軽く: 隠れている間は行列を計算しない(js/hidskip.js)
      // 11/22 夜 動く人の印(js/propsolid.js は人を当たり判定にしない)
    const skin = mat(0xc99a78), shoe = mat(0x16181c), j = mat(kit.jersey), p = mat(kit.pants), c = mat(kit.cap, 0.7), u = mat(kit.under);
    const add = (parent, geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
    this.hips = new THREE.Group(); this.hips.position.y = 0.95; this.root.add(this.hips);
    add(this.hips, GEO.pelvis, p, 0, 0.02, 0);
    this.spine = new THREE.Group(); this.spine.position.y = 0.1; this.hips.add(this.spine);
    const torso = add(this.spine, GEO.torso, j, 0, 0.29, 0); torso.scale.z = 0.72;
    add(this.spine, GEO.neck, skin, 0, 0.66, 0);
    this.headG = new THREE.Group(); this.headG.position.y = 0.7; this.spine.add(this.headG);
    add(this.headG, GEO.head, mat(0x2b211c), 0, 0, 0);   // 後ろ・横から見える髪の色。顔は作らない
    if (opt.helmet) add(this.headG, GEO.cap, mat(kit.cap, 0.35), 0, 0.01, 0).scale.set(1.08, 1.08, 1.08);
    else add(this.headG, GEO.cap, c, 0, 0.01, 0);
    const brim = add(this.headG, GEO.brim, c, 0, 0.02, -0.1);
    brim.scale.set(1, 1, 0.9);
    if (opt.mask) add(this.headG, GEO.mask, mat(0x202226, 0.5), 0, -0.02, -0.1);
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.095, -0.02, 0); this.hips.add(hip);
      add(hip, GEO.thigh, p);
      const knee = new THREE.Group(); knee.position.y = -0.46; hip.add(knee);
      add(knee, GEO.shin, mat(kit.sock));
      add(knee, GEO.foot, shoe, 0, -0.47, -0.05);
      this.legs.push({ hip, knee });
    }
    this.arms = [];
    for (const s of [-1, 1]) {   // s = -1: 左腕(グラブ)、+1: 右腕
      const sh = new THREE.Group(); sh.position.set(s * 0.225, 0.52, 0); this.spine.add(sh);
      add(sh, GEO.upper, u);
      const el = new THREE.Group(); el.position.y = -0.32; sh.add(el);
      add(el, GEO.lower, skin);
      const hand = new THREE.Group(); hand.position.y = -0.31; el.add(hand);
      if (s < 0 && opt.glove !== false) add(hand, GEO.glove, mat(opt.mitt ? 0x3a2416 : 0x5a3a20, 0.6), 0, -0.04, -0.02);
      else add(hand, GEO.hand, skin);
      this.arms.push({ sh, el, hand });
    }
    if (opt.bat) {
      this.bat = add(this.arms[1].hand, GEO.bat, mat(0xc8a274, 0.5), 0, 0, 0);
      this.bat.rotation.x = Math.PI;   // 手から上へ
    }
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    // 11/19 スマホ対応: 遠くでは小さい部品(首・つば・手・足・面)を描かない(1 人 17 回 → 11 回の描画。遠くの選手が多い観戦で効く)
    this.small = []; this.root.traverse((o) => { if (o.isMesh && [GEO.neck, GEO.brim, GEO.hand, GEO.foot, GEO.mask].includes(o.geometry)) this.small.push(o); });
    this.t = 0;
    this.pose = 'stand';
    this.phase = 0;
  }
  setFar(on) { if (this._far === on) return; this._far = on; for (const o of this.small) o.visible = !on; }
  // 姿勢を作る(毎フレーム呼ぶ)。kind: stand | ready | run | crouch | point | throw | bat | swing | catch
  set(kind, opt = {}) {
    const L = this.legs, A = this.arms;
    const z = (g) => g.rotation.set(0, 0, 0);
    [L[0].hip, L[0].knee, L[1].hip, L[1].knee, A[0].sh, A[0].el, A[1].sh, A[1].el, this.spine, this.hips].forEach(z);
    this.hips.position.y = 0.95;
    A[0].sh.rotation.z = -0.12; A[1].sh.rotation.z = 0.12;
    if (kind === 'run') {
      const ph = opt.phase || 0, k = Math.min(1, opt.speed ?? 1);
      const s = Math.sin(ph);
      L[0].hip.rotation.x = s * 0.75 * k; L[1].hip.rotation.x = -s * 0.75 * k;
      L[0].knee.rotation.x = Math.max(0, -s) * 1.2 * k + 0.2; L[1].knee.rotation.x = Math.max(0, s) * 1.2 * k + 0.2;
      A[0].sh.rotation.x = -s * 0.9 * k; A[1].sh.rotation.x = s * 0.9 * k;
      A[0].el.rotation.x = -1.3 * k; A[1].el.rotation.x = -1.3 * k;
      this.spine.rotation.x = -0.18 * k;
      this.hips.position.y = 0.93 + Math.abs(Math.cos(ph)) * 0.04 * k;
    } else if (kind === 'ready') {
      // 低く構える(野手)
      this.hips.position.y = 0.78;
      L[0].hip.rotation.set(-0.55, 0, 0.18); L[1].hip.rotation.set(-0.55, 0, -0.18);
      L[0].knee.rotation.x = 0.85; L[1].knee.rotation.x = 0.85;
      this.spine.rotation.x = -0.45;
      A[0].sh.rotation.set(-0.9, 0, -0.25); A[1].sh.rotation.set(-0.9, 0, 0.25);
      A[0].el.rotation.x = -0.4; A[1].el.rotation.x = -0.4;
    } else if (kind === 'crouch') {
      // 捕手の構え
      this.hips.position.y = 0.5;
      L[0].hip.rotation.set(-1.45, 0, 0.45); L[1].hip.rotation.set(-1.45, 0, -0.45);
      L[0].knee.rotation.x = 2.3; L[1].knee.rotation.x = 2.3;
      this.spine.rotation.x = -0.2;
      A[0].sh.rotation.set(-1.25, 0, -0.1); A[0].el.rotation.x = -0.5;
      A[1].sh.rotation.set(-0.3, 0, 0.3); A[1].el.rotation.x = -1.2;
    } else if (kind === 'point') {
      // 右腕で dir(体から見た向き、ローカル)を指す。左腕は胸の前
      const d = opt.dir || new THREE.Vector3(0, 0, -1);
      const yaw = Math.atan2(d.x, -d.z), pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      A[1].sh.rotation.set(-(Math.PI / 2 + pitch), 0, 0);
      A[1].sh.rotation.order = 'YXZ'; A[1].sh.rotation.y = -yaw;
      A[0].sh.rotation.set(-0.5, 0, -0.2); A[0].el.rotation.x = -1.4;
    } else if (kind === 'throw') {
      // u: 0 = 引いた、1 = 投げ終わり
      const u = opt.u ?? 0;
      this.spine.rotation.y = 0.6 - 1.4 * u;
      this.spine.rotation.x = -0.1 - 0.35 * u;
      A[1].sh.rotation.set(-0.4 - 2.9 * Math.sin(Math.min(1, u) * Math.PI * 0.75) , 0, 1.2 - 0.9 * u);
      A[1].el.rotation.x = -1.6 + 1.3 * u;
      A[0].sh.rotation.set(-1.4 + 0.6 * u, 0, -0.3);
      L[0].hip.rotation.x = -0.4 * u; L[1].hip.rotation.x = 0.3 * u;
    } else if (kind === 'catch') {
      // グラブを差し出す(高さ h: -1 = 地面、0 = 胸、1 = 頭の上)
      const h = opt.h ?? 0;
      if (h < -0.3) {
        this.hips.position.y = 0.7;
        L[0].hip.rotation.set(-0.9, 0, 0.3); L[1].hip.rotation.set(-0.6, 0, -0.3);
        L[0].knee.rotation.x = 1.3; L[1].knee.rotation.x = 1.0;
        this.spine.rotation.x = -0.8;
        A[0].sh.rotation.set(-1.1, 0, 0); A[1].sh.rotation.set(-1.0, 0, 0);
      } else {
        A[0].sh.rotation.set(-1.4 - h * 1.4, 0, -0.1); A[0].el.rotation.x = -0.3;
        A[1].sh.rotation.set(-1.2 - h * 1.2, 0, 0.1); A[1].el.rotation.x = -0.6;
      }
    } else if (kind === 'bat' || kind === 'swing') {
      // 右打者の構え(体は一塁の方 = +x を向いて立つので、root を回してから使う)
      const u = kind === 'swing' ? Math.min(1, opt.u ?? 0) : 0;
      L[0].hip.rotation.set(-0.15, 0, 0.22); L[1].hip.rotation.set(0.1, 0, -0.22);
      L[0].knee.rotation.x = 0.3; L[1].knee.rotation.x = 0.3;
      this.hips.position.y = 0.9;
      this.spine.rotation.x = -0.25;
      this.spine.rotation.y = -0.2 + u * 1.9;
      A[1].sh.rotation.set(-1.2 - 0.5 * (1 - u), 0, 0.6); A[1].el.rotation.x = -1.6 + u * 1.2;
      A[0].sh.rotation.set(-1.0 - 0.4 * (1 - u), 0, -0.2); A[0].el.rotation.x = -1.2 + u * 0.8;
      if (this.bat) this.bat.rotation.set(Math.PI - 0.6 + u * 0.9, 0, 0.8 - u * 2.2);
    } else if (kind === 'ump_out') {
      // 審判のアウト・ストライク: 右のこぶしを上げる
      A[1].sh.rotation.set(-2.5, 0, 0.5); A[1].el.rotation.x = -1.7;
      A[0].sh.rotation.set(-0.2, 0, -0.15);
      this.spine.rotation.x = -0.05;
    } else if (kind === 'ump_safe') {
      // セーフ: 両手を横に広げる
      A[0].sh.rotation.set(-0.15, 0, -1.5); A[1].sh.rotation.set(-0.15, 0, 1.5);
      this.hips.position.y = 0.88; L[0].hip.rotation.set(-0.3, 0, 0.25); L[1].hip.rotation.set(-0.3, 0, -0.25); L[0].knee.rotation.x = 0.5; L[1].knee.rotation.x = 0.5;
    } else if (kind === 'ump_point') {
      // プレイ・ゲーム: 右手で前を指す
      A[1].sh.rotation.set(-1.5, 0, 0.1);
    } else if (kind === 'stand') {
      A[0].sh.rotation.x = 0.05; A[1].sh.rotation.x = 0.05;
    }
    this._flip();
  }
  // 上の値は「前へ = マイナス」で書いたが、この体では前へ振るのが +x 回り(-z が前)なので、手足だけ符号を反転する
  _flip() {
    for (const g of [this.legs[0].hip, this.legs[0].knee, this.legs[1].hip, this.legs[1].knee, this.arms[0].sh, this.arms[0].el, this.arms[1].sh, this.arms[1].el]) g.rotation.x = -g.rotation.x;
  }
  setYawToward(x, z) {
    const dx = x - this.root.position.x, dz = z - this.root.position.z;
    if (Math.hypot(dx, dz) > 1e-3) this.root.rotation.y = Math.atan2(-dx, -dz);
  }
}

// 遠くの観客(座った人の形)。胴と頭だけの InstancedMesh を 2 つ
export function crowdGeometries() {
  const torso = new THREE.CylinderGeometry(0.14, 0.19, 0.56, 6, 1, true);
  torso.scale(1, 1, 0.75);
  torso.translate(0, 0.32, 0.06);
  const head = new THREE.IcosahedronGeometry(0.1, 0);
  head.scale(0.95, 1.08, 1);
  head.translate(0, 0.73, 0.05);
  return { torso, head };
}
