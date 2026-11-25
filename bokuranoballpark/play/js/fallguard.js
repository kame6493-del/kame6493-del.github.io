// 変な落下を無くす・グラウンドへ降りても戻されない(11/21 持ち主「球場内に降りても戻されないようにして 変な落下がしないように作ってください 空白というか」)
// 1) 見えない床と柵: js/fallguard/<球場>.json の箱(当たり判定だけ。描かない)。tools/fallscan.py で 12 球場の歩ける所の縁を調べて作った
//    std = PC の模型(中の建物つき)、lite = スマホの軽い模型。箱は [x0, y0, z0, x1, y1, z1]
// 2) グラウンド(フェンスの内とファウルの所、空の開いた低い所)へ落ちた・降りた時は「落ちたので戻しました」をしない(isField)
// 3) グラウンドから客席へ: フェンス・壁の前で E「客席へよじ登る」。客席の最前列で手すりの前に立つと E「グラウンドへ降りる」
// ?nofg=1 で 1)〜3) を全部外す(前の形)。?fgshow=1 で見えない箱を赤く描く(点検用)
export async function loadFallGuard(stadium, lite) {
  try {
    const r = await fetch(`js/fallguard/${stadium}.json?v=202611211100`); if (!r.ok) return [];
    const s = await r.json();
    return (lite ? s.lite : s.std) || [];
  } catch (e) { console.warn('見えない床の表を読めませんでした', e); return []; }
}
// 箱の並び → 当たり判定のジオメトリ(position だけ・index なし)
export function fallGuardGeometry(THREE, boxes) {
  if (!boxes || !boxes.length) return null;
  const P = [], F = [[0, 2, 1, 0, 3, 2], [4, 5, 6, 4, 6, 7], [0, 1, 5, 0, 5, 4], [3, 7, 6, 3, 6, 2], [0, 4, 7, 0, 7, 3], [1, 2, 6, 1, 6, 5]];
  for (const [x0, y0, z0, x1, y1, z1] of boxes) {
    const v = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    for (const f of F) for (const i of f) P.push(v[i][0], v[i][1], v[i][2]);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  return g;
}

export class FieldFall {
  constructor(h) {
    this.h = h;   // { THREE, getBvh, groundAt, fenceDist, player }
    this.T = h.THREE; this.ray = new h.THREE.Ray(new h.THREE.Vector3(), new h.THREE.Vector3());
    this.bd = null; this.cache = null; this.cacheT = 0;
  }
  bvh() { return this.h.getBvh(); }
  // グラウンドの縁: 真ん中 (0, -45) から 0.5 度ごとに、高さ 0.5・1.5・3.0 m の水平の線を出し、最初に当たる壁(フェンス・スタンドの前の壁・バックネット)までの近い方。
  // 細い物(ポール)で欠けないよう、となり ±2 本の中の値をとる。ベンチ・車の出入口は上の線がスタンドに当たるので外れる
  bound() {
    if (this.bd) return this.bd;
    const N = 720, raw = new Float32Array(N), cy = this.h.groundAt(0, -45, 5, 20) ?? 0;
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2, dx = Math.sin(a), dz = -Math.cos(a); let m = 260;
      for (const hh of [0.5, 1.5, 3.0]) { const h = this.hit(0, cy + hh, -45, dx, 0, dz, 260); if (h && h.distance < m) m = h.distance; }
      raw[i] = m;
    }
    const bd = new Float32Array(N);
    for (let i = 0; i < N; i++) { const w = []; for (let k = -2; k <= 2; k++) w.push(raw[(i + k + N) % N]); w.sort((p, q) => p - q); bd[i] = w[2]; }
    this.cy = cy;
    return (this.bd = bd);
  }
  hit(x, y, z, dx, dy, dz, far) { const b = this.bvh(); if (!b) return null; this.ray.origin.set(x, y, z); this.ray.direction.set(dx, dy, dz).normalize(); return b.raycastFirst(this.ray, this.T.DoubleSide, 0, far); }
  // グラウンド(フェアはフェンスの内、ファウルの所も含む。上の縁の内)。グラウンドの高さ ±0.6 m(最前列の低い席 1.0 m は外れる)で、頭の上 4.5 m まで何も無い所(ベンチの中・スタンドの下の部屋は外れる)
  isField(x, y, z) {
    const bd = this.bound();
    if (y < this.cy - 1.0 || y > this.cy + 0.6) return false;
    const dx = x, dz = z + 45, r = Math.hypot(dx, dz);
    let a = Math.atan2(dx, -dz); if (a < 0) a += Math.PI * 2;
    if (r > bd[Math.round(a / (Math.PI * 2) * 720) % 720] + 0.5) return false;
    return !this.hit(x, y + 1.9, z, 0, 1, 0, 2.6);   // 頭の上 4.5 m まで空いている
  }
  // 足もとから len まで上が空いているか・体(半径 0.33)の入る広さか
  room(x, y, z) {
    if (this.hit(x, y + 0.05, z, 0, 1, 0, 1.8)) return false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const hh of [0.45, 1.2]) if (this.hit(x, y + hh, z, dx, 0, dz, 0.34)) return false;
    return true;
  }
  // E でできること(歩く時だけ。0.2 秒ごとに調べ直す)
  action(mode) {
    if (mode !== 'walk') return null;
    const pl = this.h.player; if (!pl.onGround) return null;
    const now = performance.now();
    if (this.cache && now - this.cacheT < 200 && Math.hypot(pl.pos.x - this.cache.px, pl.pos.z - this.cache.pz) < 0.15 && Math.abs(pl.yaw - this.cache.yaw) < 0.08) return this.cache.a;
    const a = this.find();
    this.cache = { a, px: pl.pos.x, pz: pl.pos.z, yaw: pl.yaw }; this.cacheT = now;
    return a;
  }
  find() {
    const pl = this.h.player, p = pl.pos, fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
    if (this.isField(p.x, p.y, p.z)) {
      // グラウンド → 客席: 前 1.2 m に壁(フェンス・スタンドの前の壁)があり、その向こうに 0.9〜7 m 上の床(頭の上が空いて体の入る所)がある
      const w = this.hit(p.x, p.y + 0.5, p.z, fx, 0, fz, 1.2); if (!w) return null;
      for (const d of [0.35, 0.6, 0.9, 1.3, 1.8, 2.4, 3.0]) {
        const t = w.distance + d, x = p.x + fx * t, z = p.z + fz * t;
        const g = this.h.groundAt(x, z, p.y + 7.5, 8); if (g === null || g - p.y < 0.9 || g - p.y > 7) continue;
        const g2 = this.h.groundAt(x + fx * 0.6, z + fz * 0.6, g + 0.8, 1.6); if (g2 === null || Math.abs(g2 - g) > 0.85) continue;   // 塀の上の細い縁ではない(先へ床が続く)
        if (!this.room(x, g, z)) continue;
        return { label: '客席へよじ登る', run: () => this.move(x, g, z, '客席へ上がった') };
      }
      return null;
    }
    if (p.y < 0.9) return null;
    // 客席の最前列 → グラウンド: 前 1 m に手すり・柵・ガラスがあり、その先 4 m の内にグラウンドの床がある
    let w = this.hit(p.x, p.y + 1.0, p.z, fx, 0, fz, 1.0) || this.hit(p.x, p.y + 0.5, p.z, fx, 0, fz, 1.0); if (!w) return null;
    for (const d of [0.4, 0.8, 1.2, 1.6, 2.0, 2.5, 3.0, 3.5, 4.0]) {
      const t = w.distance + d, x = p.x + fx * t, z = p.z + fz * t;
      const g = this.h.groundAt(x, z, p.y + 0.4, p.y + 3); if (g === null) continue;
      if (!this.isField(x, g, z)) { if (g > p.y - 0.6) return null; continue; }   // 同じ高さの床(まだ客席)なら降りる所ではない
      if (!this.room(x, g, z)) continue;
      return { label: 'グラウンドへ降りる', run: () => this.move(x, g, z, 'グラウンドに降りた') };
    }
    return null;
  }
  move(x, y, z, msg) {
    const pl = this.h.player;
    pl.pos.set(x, y + 0.02, z); pl.vel.set(0, 0, 0); pl.onGround = true;
    if (this.h.afterMove) this.h.afterMove();
    this.cache = null;
    if (this.h.toast) this.h.toast(msg);
  }
}
