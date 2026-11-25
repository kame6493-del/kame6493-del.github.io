// 11/22 夜 Discord の感想「自分が物をすり抜ける。当たり判定が気になる」:
// ゲームの側で置いた物(売店の台・トイレの棟・自販機・ごみの分別の台・看板の板・ふさいだ店の板・仕事の道具 など。freeplay・walkers・gimmicks の group)は、
// 当たり判定(collision.glb の BVH)に入っていなかった。それらを床に立つ箱(向きつき)として集め、歩く時だけ体(半径 r の円柱)を箱の外へ押し出す。
// - 床から 0.6 m より上に浮いている物(ひさし・吊りの案内・のれん)、低い物(高さ 0.45 m 未満)、大きすぎる物(1 辺 12 m 超、まとめた形)は入れない
// - 人(Person・選手の形)と、作った後に動いた物(車・球・持ち物)は入れない
// - 4 m の升目に分けて、近くの箱だけを調べる(重くしない)。新しく置かれた物は 2 秒ごとに足す
// ?nosolid=1 で使わない
export class PropSolids {
  constructor(THREE, { scene, groundAt }) {
    this.THREE = THREE; this.scene = scene; this.groundAt = groundAt;
    this.cells = new Map(); this.seen = new WeakSet(); this.n = 0; this.t = 0;
    this._v = new THREE.Vector3(); this._b = new THREE.Box3(); this._out = new THREE.Vector3();
  }
  key(cx, cz) { return cx * 100003 + cz; }
  roots() { return this.scene.children.filter((o) => o.name === 'freeplay' || o.name === 'walkers' || o.name === 'gimmicks'); }
  update(dt) {
    this.t -= dt; if (this.t > 0) return; this.t = 2;
    for (const r of this.roots()) for (const top of r.children) this.scan(top);
  }
  scan(top) {
    if (this.seen.has(top)) return;
    if (!top.visible) return;   // 見えない物はあとで(見えた時に)調べる
    let skip = false;
    top.traverse((o) => { if (o.isSkinnedMesh || (o.userData && o.userData.person) || o.isPoints || o.isSprite) skip = true; });
    this.seen.add(top);
    if (skip) return;
    top.updateMatrixWorld(true);
    const THREE = this.THREE, ref = top.getWorldPosition(new THREE.Vector3());
    top.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material]; if (ms.every((m) => !m || m.visible === false || (m.transparent && m.opacity < 0.2))) return;   // 見えない板(当たりの印など)は入れない
      const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
      if (o.isInstancedMesh) {
        if (o.count > 600) return;
        const m = new THREE.Matrix4(), w = new THREE.Matrix4();
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); w.multiplyMatrices(o.matrixWorld, m); this.addBox(g.boundingBox, w, top, ref); }
      } else this.addBox(g.boundingBox, o.matrixWorld, top, ref);
    });
  }
  addBox(bb, mw, top, ref) {
    if (bb.isEmpty()) return;
    const e = mw.elements, yaw = Math.atan2(e[8], e[10]);   // 物の z 軸の向き(横に倒した物も、水平の向きで箱にする)
    const c = Math.cos(yaw), s = Math.sin(yaw), v = this._v;
    let ux0 = 1e9, ux1 = -1e9, uz0 = 1e9, uz1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let k = 0; k < 8; k++) {
      v.set(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z).applyMatrix4(mw);
      const ux = v.x * c - v.z * s, uz = v.x * s + v.z * c;   // 物の向きの座標(x 軸 = (c, -s)、z 軸 = (s, c))
      ux0 = Math.min(ux0, ux); ux1 = Math.max(ux1, ux); uz0 = Math.min(uz0, uz); uz1 = Math.max(uz1, uz); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    const hx = (ux1 - ux0) / 2, hz = (uz1 - uz0) / 2;
    if (y1 - y0 < 0.45 || hx > 6 || hz > 6 || (hx < 0.03 && hz < 0.03)) return;
    const mx = (ux0 + ux1) / 2, mz = (uz0 + uz1) / 2, cx = mx * c + mz * s, cz = -mx * s + mz * c;
    const fl = this.groundAt(cx, cz, y0 + 0.5, 3);
    if (fl === null || y0 - fl > 0.6 || y1 - fl < 0.45) return;   // 床に立っていない物(浮いている物)は入れない
    const box = { cx, cz, c, s, hx, hz, y0: Math.min(y0, fl), y1, top, ref: ref.clone(), dead: false };
    const r = Math.hypot(hx, hz);
    for (let i = Math.floor((cx - r) / 4); i <= Math.floor((cx + r) / 4); i++) for (let j = Math.floor((cz - r) / 4); j <= Math.floor((cz + r) / 4); j++) {
      const k = this.key(i, j); let q = this.cells.get(k); if (!q) this.cells.set(k, q = []); q.push(box);
    }
    this.n++;
  }
  // 足の位置 p(体の下の真ん中)・半径 r・高さ h。押し出す量を返す(押さなければ 0)
  push(p, r, h) {
    const out = this._out.set(0, 0, 0), q = this.cells.get(this.key(Math.floor(p.x / 4), Math.floor(p.z / 4)));
    if (!q) return out;
    let px = p.x, pz = p.z;
    for (const b of q) {
      if (b.dead || b.y1 < p.y + 0.4 || b.y0 > p.y + h) continue;   // 0.4 m より低い物はまたぐ(段と同じ)
      const dx = px - b.cx, dz = pz - b.cz, ux = dx * b.c - dz * b.s, uz = dx * b.s + dz * b.c;
      if (Math.abs(ux) > b.hx + r || Math.abs(uz) > b.hz + r) continue;
      // 作った後に動いた物・消えた物は外す
      if (!b.top.parent || !b.top.visible) { if (!b.top.parent) b.dead = true; continue; }
      const w = b.top.getWorldPosition(this._v); if (w.distanceToSquared(b.ref) > 0.01) { b.dead = true; continue; }
      const kx = Math.max(-b.hx, Math.min(b.hx, ux)), kz = Math.max(-b.hz, Math.min(b.hz, uz));
      let ex = ux - kx, ez = uz - kz, d = Math.hypot(ex, ez), nx, nz, depth;
      if (d > 1e-5) { if (d >= r) continue; nx = ex / d; nz = ez / d; depth = r - d; }
      else {   // 中に入っている: いちばん近い面から出す
        const ax = b.hx - Math.abs(ux), az = b.hz - Math.abs(uz);
        if (ax < az) { nx = Math.sign(ux) || 1; nz = 0; depth = ax + r; } else { nx = 0; nz = Math.sign(uz) || 1; depth = az + r; }
      }
      const wx = nx * b.c + nz * b.s, wz = -nx * b.s + nz * b.c;   // 物の向きの座標 → 世界
      px += wx * depth; pz += wz * depth;
    }
    out.set(px - p.x, 0, pz - p.z);
    return out;
  }
}
