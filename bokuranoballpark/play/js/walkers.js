// 観戦のモードの「歩く人」(11/18 夜 持ち主「コンコースで人がいるとか、観客が動いて、出店とかも出ている」)
// - 歩ける所(当たり判定の床)を 1 m の目で調べた道(nav)の上だけを歩かせる。目と目の間は壁・柵・低い天井を光線で確かめてあるので、壁を抜けない。
//   調べる起点は、その球場のワープ先(コンコース・席)。席の 0.5 m 以内の目は通らない(席の段は通路だけ)。
// - 人の形は選手と同じ体(athletes.js)を普段着の色で。動かす(描く)のは自分に近い K 人だけ(PC 16・スマホ 8)。遠くの人は描かない(コンコースは段の陰で見えない)。
// - 売店: コンコースの壁ぎわに屋台(台・のれん・字の札)と店員、前に列。名前は架空の普通の言葉(焼きそば・からあげ…)。値段の数字は出さない。
// - 売り子: 席の通路を、背中にタンクを背負って上り下りする。
// - 自分が前をふさぐと、立ち止まって向きを変える(重ならない)。
// 光源は足さない(材質は MeshLambert と、札は MeshBasic)。
import { Athlete as Person } from './athletes.js';
import { skipHidden } from './hidskip.js';   // 11/25 軽く
import { kbSignTexture } from './kanban.js';   // 11/22 看板

const SHIRTS = [0xf2f2ee, 0x1d2430, 0x3a6ea5, 0xc8423a, 0x6b8f4e, 0xe0c25a, 0x8a5a9e, 0x2f7f86, 0xd9875b, 0x9aa3ad, 0xf0a8b8, 0x444a52];
const PANTS = [0x2c3e5c, 0x3a3f47, 0x7a6a55, 0x1f2328, 0x4d5d77, 0xb9ab8e];
// 11/20 持ち主「女性、子供とかも観戦に来ている人で分かるように」: 歩く人の見た目(女性・子供・男性)。顔は作らない
const F_SHIRTS = [0xf4f2ee, 0xf0a8b8, 0xe8d6c0, 0x9fc4e6, 0xc9b6e4, 0x2b3550, 0xf2d45c, 0x9fd8c0, 0xd96a6a, 0x1f1f24];
const F_LOWER = [0x2c3e5c, 0x1f2328, 0xb9ab8e, 0xe9e4d8, 0x4d5d77, 0x7a3a46];
const HAIR_COL = [0x0b0a0a, 0x1a120d, 0x2e1c12, 0x47301f];
const KID_CAPS = [0x14a39a, 0x6b3fb8, 0xc0392b, 0x1f2f5a, 0xf5f5f2, 0xf39a2b];
let HAIR_GEO = null;   // 女性の髪: 頭の上と後ろ(長い・肩まで)。頭の真ん中を原点、前は -z
function hairGeo(THREE) {
  if (HAIR_GEO) return HAIR_GEO;
  const make = (len) => {
    const cap = new THREE.SphereGeometry(0.118, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.6).rotateX(0.45).toNonIndexed();
    const back = new THREE.BoxGeometry(0.2, len, 0.075).translate(0, 0.02 - len / 2, 0.065).toNonIndexed();
    const P = [], N = [];
    for (const g of [cap, back]) { P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    return g;
  };
  HAIR_GEO = { long: make(0.3), bob: make(0.17) };
  return HAIR_GEO;
}
const STALLS = [
  { name: 'やきそば', col: 0xd2462e }, { name: 'からあげ', col: 0xe39a1e }, { name: 'お弁当', col: 0x3b7d4f },
  { name: 'ドリンク', col: 0x2f72b8 }, { name: 'かき氷', col: 0x49a7c9 }, { name: 'グッズ', col: 0x7b4fa0 }, { name: 'ホットドッグ', col: 0xb8452f }, { name: 'たこやき', col: 0xb8652a },
];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
// 11/20 売店の種類を実在の球場の配置に合わせる: freeplay.js が window.__fpStallKind(x, y, z, i) を置いていれば、その場所の種類(無ければ今までどおり順に)
const KIND_COL = { 'カレー': 0xb8742a, 'ラーメン': 0xc8323a, 'たこやき': 0xb8652a, '甘い物': 0xe07aa0, 'おべんとう': 0x3b7d4f, 'ドリンク': 0x2f72b8, '売店': 0x7a5a3a };
const stallInfo = (x, y, z, i) => { const k = typeof window !== 'undefined' && window.__fpStallKind ? window.__fpStallKind(x, y, z, i) : null; if (!k) return STALLS[i % STALLS.length]; return STALLS.find((s) => s.name === k) || { name: k, col: KIND_COL[k] ?? 0x7a5a3a }; };

export class Walkers {
  constructor({ THREE, scene, ctx, seats, lite }) {
    Object.assign(this, { THREE, scene, ctx, seats, lite });
    this.group = skipHidden(new THREE.Group()); this.group.name = 'walkers'; scene.add(this.group);   // 11/25 軽く: 歩く人を出さない場面では行列を計算しない(js/hidskip.js)
    this.nodes = []; this.key = new Map(); this.agents = []; this.stalls = [];
    this.K = lite ? 8 : 16;
    this.pool = [];
    this.built = false; this.building = null;
    this._ray = new THREE.Ray(); this._v = new THREE.Vector3(); this._d = new THREE.Vector3();
    this.seatGrid = new Map();
    for (let i = 0; i < seats.n; i++) { const k = Math.floor(seats.x[i]) * 4001 + Math.floor(seats.z[i]); let q = this.seatGrid.get(k); if (!q) this.seatGrid.set(k, q = []); q.push(i); }
  }
  // ---------------------------------------------------------------- 道を調べる(数フレームに分けて)
  hit(ox, oy, oz, dx, dy, dz, far) {
    const bvh = this.ctx.bvh; if (!bvh) return null;
    this._ray.origin.set(ox, oy, oz); this._ray.direction.set(dx, dy, dz).normalize();
    return bvh.raycastFirst(this._ray, this.THREE.DoubleSide, 0, far);
  }
  nearSeat(x, y, z, r = 0.55) {
    const S = this.seats;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const q = this.seatGrid.get((Math.floor(x) + a) * 4001 + Math.floor(z) + b); if (!q) continue;
      for (const i of q) if (Math.abs(S.y[i] - y) < 1.2 && Math.hypot(S.x[i] - x, S.z[i] - z) < r) return true;
    }
    return false;
  }
  onField(x, y, z) {
    if (y > 0.6) return false;
    const r = Math.hypot(x, z), ang = Math.atan2(x, -z) * 180 / Math.PI;
    if (r < 40) return true;
    if (Math.abs(ang) <= 48 && this.ctx.fenceDist && r < this.ctx.fenceDist(ang) + 3) return true;
    return false;
  }
  // 当たり判定が替わった時(通路口・ゲートの道の作り直し、球場の作り込みの差し替え)に道から作り直す。売店・人・店員も作り直す
  rebuild(seeds) {
    this.setVisible(false);
    for (const p of this.pool) this.group.remove(p.root);
    for (const st of this.stalls) { if (st.g) this.group.remove(st.g); if (st.clerk) this.group.remove(st.clerk.root); }
    for (const g of this.shutters || []) this.group.remove(g); this.shutters = [];
    this.nodes = []; this.key = new Map(); this.agents = []; this.stalls = []; this.pool = []; this.walkable = null; this.built = false;
    this.startBuild(seeds || this._seeds || []);
    this.group.visible = true;
  }
  // 席の通路の起点: 席を 40 ほど選び、列の横へ 0.5〜4 m ずらして、席から離れた床(段の通路)を探す
  standSeeds(n = 40) {
    const S = this.seats, out = [], g = this.ctx.groundAt; if (!S.n) return out;
    let seed = 3; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let t = 0; t < n * 4 && out.length < n; t++) {
      const i = Math.floor(r() * S.n), yaw = S.yaw[i], sx = Math.cos(yaw), sz = -Math.sin(yaw);   // 列の横
      for (const sgn of [1, -1]) {
        let done = false;
        for (let d = 0.5; d <= 4 && !done; d += 0.25) {
          const x = S.x[i] + sx * d * sgn, z = S.z[i] + sz * d * sgn, gy = g(x, z, S.y[i] + 0.6, 1.5);
          if (gy == null || Math.abs(gy - (S.y[i] - 0.42)) > 0.5) break;
          if (!this.nearSeat(x, gy + 0.42, z, 0.6)) { out.push({ x, y: gy, z, kind: 'stand' }); done = true; }
        }
        if (done) break;
      }
    }
    return out;
  }
  // seeds: [{ x, y, z, kind: 'concourse' | 'stand' }]
  startBuild(seeds) {
    this._seeds = seeds; this._bvh = this.ctx.bvh;
    seeds = seeds.filter((s) => s.kind !== 'stand').concat(this.standSeeds(this.lite ? 20 : 40));
    { const ex = typeof window !== 'undefined' && window.__fpWalkSeeds; if (ex) seeds = ex.map((q) => ({ x: q[0], y: q[1], z: q[2], kind: 'concourse' })).concat(seeds); }   // 11/21 汽笛ヶ原: 一周のコンコースの数か所からも道を広げる(席の道が先にコンコースを取ってしまい、外野まで広がらなかった)
    const q = [];
    for (const s of seeds) {
      const n = this.addNode(Math.round(s.x), s.y, Math.round(s.z), s.kind);
      if (n) { n.seed = true; q.push(n); }
    }
    this.building = { q, count: { concourse: 0, stand: 0 }, seeds };
  }
  addNode(ix, y, iz, kind) {
    const k = `${ix},${iz},${Math.round(y / 2.2)}`;
    if (this.key.has(k)) return null;
    const n = { i: this.nodes.length, x: ix, y, z: iz, kind, nb: [], wall: [] };
    this.key.set(k, n.i); this.nodes.push(n);
    return n;
  }
  // ms: 1 回に使う時間(11/25 重さの直し: 読み込みの画面の間・タイトルで待っている間は長く進める)
  buildStep(budget = 160, ms = 0) {
    const B = this.building; if (!B) return;
    const g = this.ctx.groundAt;
    const WM = typeof window !== 'undefined' && window.__fpWalkMax;   // 11/21 汽笛ヶ原: 一周 620 m のコンコースを端まで道にする(freeplay.js の SITES の walkMax)
    const MAX = { concourse: WM ? (this.lite ? WM.cl : WM.c) : (this.lite ? 900 : 2200), stand: this.lite ? 500 : 1200 };
    // 11/20 夜 持ち主「ボールパークで過ごすを始めるとめっちゃ固まる」: 数だけでなく時間でも区切る(1 こまに 6 ms まで)。遅いスマホでもこまが止まらない
    const tEnd = performance.now() + (ms || (this.lite ? 5 : (WM ? 12 : 8))); if (WM) budget *= 3;   // 11/21 汽笛ヶ原: 目が 3 倍あるので 1 こまに進める数も増やす(スマホは時間の区切りを変えない)
    while (budget-- > 0 && B.q.length && performance.now() < tEnd) {
      const n = B.q.shift();
      const stand = n.kind === 'stand', tol = stand ? 0.65 : 0.4;
      for (const [dx, dz] of DIRS) {
        const nx = n.x + dx, nz = n.z + dz, len = Math.hypot(dx, dz);
        const gy = g(nx, nz, n.y + (stand ? 1.0 : 0.6), stand ? 2.2 : 1.6);
        if (gy == null || Math.abs(gy - n.y) > tol) { if (gy == null || gy - n.y > tol) n.wall.push([dx, dz]); continue; }
        // 壁・柵(膝と胸の高さ)と、頭の上(1.9 m)
        if (this.hit(n.x, n.y + 0.55, n.z, dx, (gy - n.y) / len, dz, len + 0.35) || this.hit(n.x, n.y + 1.35, n.z, dx, (gy - n.y) / len, dz, len + 0.35)) { n.wall.push([dx, dz]); continue; }
        if (this.hit(nx, gy + 0.1, nz, 0, 1, 0, 1.95)) continue;
        // 目と目の間(1/4・1/2・3/4)にも床がある(段の切れ目・すき間を渡らない)
        let gap = false;
        for (const f of [0.25, 0.5, 0.75]) { const gm = g(n.x + dx * f, n.z + dz * f, Math.max(n.y, gy) + 0.6, 1.6); if (gm == null || gm < Math.min(n.y, gy) - 0.3) { gap = true; break; } }
        if (gap) continue;
        if (this.onField(nx, gy, nz)) continue;
        if (this.nearSeat(nx, gy + 0.42, nz)) continue;
        const k = `${nx},${nz},${Math.round(gy / 2.2)}`;
        let m = this.key.has(k) ? this.nodes[this.key.get(k)] : null;
        if (!m) {
          if (B.count[n.kind] >= MAX[n.kind]) continue;
          m = this.addNode(nx, gy, nz, n.kind); if (!m) continue;
          B.count[n.kind]++;
          q_push(B.q, m);
        }
        if (!n.nb.includes(m.i)) n.nb.push(m.i);
        if (!m.nb.includes(n.i)) m.nb.push(n.i);
      }
    }
    if (!B.q.length) { this.building = null; this.finish(); }
  }
  // 11/25 重さの直し: 遊び始めてから 1 こま 5〜12 ms ずつ道を調べていた(スマホ相当で 13 秒ほど重く、自動の画質も下がった)。
  // 読み込みの画面の間に、まとめて進める(sliceMs ずつ、間で 1 度譲る)。終わったら true
  async finishBuild(sliceMs = 40, alive = () => true) {
    while (this.building && alive()) { this.buildStep(1e9, sliceMs); await new Promise((r) => setTimeout(r, 0)); }
    return !this.building;
  }
  // ---------------------------------------------------------------- 売店・人を置く
  finish() {
    const THREE = this.THREE;
    // 行き止まりの多い小さな島(段の端など)は使わない: 3 つ以上つながった目だけ
    this.walkable = this.nodes.filter((n) => n.nb.length >= 3);
    const conc = this.walkable.filter((n) => n.kind === 'concourse'), stand = this.walkable.filter((n) => n.kind === 'stand');
    // 売店: 模型にもとからある売店(台の材質の名前)を先に使い、その前に店員と列を置く。屋台は屋根の無い外周・広場だけ
    this.useModelShops(conc);
    const SIMPLE0 = typeof window !== 'undefined' && window.__fpSimple;
    // すっきり: 模型の店が描かれない軽い画質(浜風の lite など)でもコンコースに店があるよう、屋根の下の壁ぞいにも屋台(店員つき)を出す
    const cand = conc.filter((n) => n.wall.some(([dx, dz]) => dx === 0 || dz === 0) && (SIMPLE0 && this.modelShops === 0 || !this.hit(n.x, n.y + 2.2, n.z, 0, 1, 0, 25)));
    let si = 0;
    const SIMPLE = typeof window !== 'undefined' && window.__fpSimple;
    const maxStall = this.stalls.length + (SIMPLE ? 12 : (this.lite ? 2 : 3));   // すっきり: 屋台(模型の店が無い球場のコンコースの店)も増やす
    for (const n of shuffle(cand, 11)) {
      if (this.stalls.length >= maxStall) break;
      if (typeof window !== 'undefined' && window.__fpStallOk && !window.__fpStallOk(n.x, n.y, n.z)) continue;   // 11/20 実在に無い所(売り場の前など)には屋台を出さない(freeplay.js)
      if (this.stalls.some((s) => Math.hypot(s.x - n.x, s.z - n.z) < (SIMPLE ? 20 : 12) && Math.abs(s.y - n.y) < 2)) continue;
      const w = n.wall.find(([dx, dz]) => dx === 0 || dz === 0);
      const fx = -w[0], fz = -w[1];   // 壁から通路へ
      // 前に 3 m 歩ける目が続く
      let ok = true;
      for (let s = 1; s <= 3; s++) { const k = `${n.x + fx * s},${n.z + fz * s},${Math.round(n.y / 2.2)}`; if (!this.key.has(k) || this.nodes[this.key.get(k)].nb.length < 3) { ok = false; break; } }
      if (!ok) continue;
      // 11/21 店員: 店員の立つ所(道の目の 0.3 m 壁の側)の体のまわり 0.35 m に壁・物が無いこと(壁に埋まっていた)
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([qx, qz]) => [0.5, 1.2, 1.6].some((hy) => this.hit(n.x - fx * 0.3, n.y + hy, n.z - fz * 0.3, qx, 0, qz, 0.35)))) continue;
      if (SIMPLE && typeof window !== 'undefined' && window.__fpStallClear && !window.__fpStallClear(n.x, n.y, n.z)) continue;
      this.addStall(n, fx, fz, stallInfo(n.x, n.y, n.z, si++));
    }
    // 歩く人
    const NC = conc.length ? (this.lite ? 26 : 56) : 0, NS = stand.length ? (this.lite ? 10 : 22) : 0;
    let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    this.rnd = rnd;
    for (let i = 0; i < NC; i++) this.agents.push(this.newAgent(conc[Math.floor(rnd() * conc.length)], 'walk'));
    for (let i = 0; i < NS; i++) this.agents.push(this.newAgent(stand[Math.floor(rnd() * stand.length)], i < 4 ? 'vendor' : 'walk'));
    // 席を立つ人: 通路の目のすぐ横の席(通路側の端の席)に座っている人が、ときどき立って通路を歩き、また戻る
    const crowd = window.__crowd, S = this.seats;
    if (crowd && crowd.setSeatAway && stand.length) {
      const want = this.lite ? 4 : 10;
      for (const n of shuffle(stand, 21)) {
        if (this.agents.filter((x) => x.kind === 'seat').length >= want) break;
        let best = -1, bd = 1.1;
        for (let a2 = -1; a2 <= 1; a2++) for (let b2 = -1; b2 <= 1; b2++) {
          const q = this.seatGrid.get((Math.floor(n.x) + a2) * 4001 + Math.floor(n.z) + b2); if (!q) continue;
          for (const i of q) { const d = Math.hypot(S.x[i] - n.x, S.z[i] - n.z); if (d < bd && Math.abs(S.y[i] - 0.42 - n.y) < 0.35 && crowd.seatShown(i)) { bd = d; best = i; } }
        }
        if (best < 0 || this.agents.some((x) => x.seat === best)) continue;
        const a = this.newAgent(n, 'seat'); a.seat = best; a.home = n; a.state = 'seated'; a.t = 0; a.wait = 15 + rnd() * 60; a.speed = 0.9 + rnd() * 0.3;
        this.agents.push(a);
      }
    }
    // 売店の列
    for (const s of this.stalls) {
      const nq = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < nq && k < s.queue.length; k++) { const a = this.agents.find((x) => x.kind === 'walk' && x.n.kind === 'concourse' && !x.stall); if (!a) break; if (this.joinQueue(a, s, true)) { a.pos.copy(s.queue[a.qi].p); a.n = s.queue[a.qi].node; } }
    }
    for (let i = 0; i < this.K; i++) this.pool.push(this.makePerson(i));
    this.built = true;
  }
  newAgent(n, kind) {
    const THREE = this.THREE, r = this.rnd;
    return { n, to: null, pos: new THREE.Vector3(n.x, n.y, n.z), dir: [1, 0], speed: kind === 'vendor' ? 0.9 : 0.95 + r() * 0.5, kind, state: 'walk', t: r() * 5, item: kind === 'walk' && r() < 0.25, p: null, yaw: r() * 6.28, look: 0 };
  }
  makePerson(i) {
    // 服の色は人の番号から決める(乱数の並びに頼らない。スマホの 8 人でも色がばらける)
    const kit = { jersey: SHIRTS[(i * 5 + 2) % SHIRTS.length], pants: PANTS[(i * 3 + 1) % PANTS.length], cap: i % 3 === 0 ? 0x20242a : SHIRTS[(i * 7 + 4) % SHIRTS.length], sock: 0x2a2a2a, under: 0xe8c4a0 };
    const p = new Person(kit, { glove: false, number: '' });
    p.root.visible = false; this.group.add(p.root);
    const THREE = this.THREE;
    // 手の食べ物(紙の箱)と、売り子のタンク(体の後ろ)
    p._cup = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.12), new THREE.MeshLambertMaterial({ color: 0xf3e6c8 }));
    p._tank = new THREE.Group();
    const tk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.55, 10), new THREE.MeshLambertMaterial({ color: 0xc9ccd2, emissive: 0x15161a }));
    tk.position.set(0, 1.18, 0.22); p._tank.add(tk);
    const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    hose.position.set(0.18, 1.0, 0.05); hose.rotation.z = 0.5; p._tank.add(hose);
    p._tank.visible = false; p.root.add(p._tank);
    p._cup.visible = false; p.root.add(p._cup);
    this.addHair(p);
    return p;
  }
  // 11/20 女性の髪(頭の骨に付ける。男性・帽子の子供では隠す)と、子供の頭を大きくする仕掛け(骨の行列を作る直前に頭の骨だけ倍率を掛ける。動きの値は変えない)
  addHair(p) {
    const THREE = this.THREE, r = p.rig, hb = r && (r.bones.Head || r.bones.mixamorigHead); if (!hb) return;
    p.root.updateMatrixWorld(true);
    const hw = new THREE.Vector3(); hb.getWorldPosition(hw);
    const c = p.root.worldToLocal(hw.clone()).add(new THREE.Vector3(0, 0.1, -0.01));   // 頭の真ん中(頭の骨の 10 cm 上)
    const hair = new THREE.Mesh(hairGeo(THREE).long, new THREE.MeshLambertMaterial({ color: 0x0b0a0a }));
    hair.matrixAutoUpdate = false;
    hair.matrix.copy(hb.matrixWorld).invert().multiply(p.root.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(c.x, c.y, c.z));
    hair.castShadow = true; hair.frustumCulled = false; hair.visible = false;
    hb.add(hair); p._hair = hair;
    const up = hb.updateMatrix.bind(hb);
    hb.updateMatrix = function () { const k = p._headK || 1; if (k !== 1) { this.scale.multiplyScalar(k); up(); this.scale.divideScalar(k); } else up(); };
  }
  // 見た目を決める(1 回だけ)。席を立った人は席の観客の見た目(crowd.js の年代・女性)を引き継ぐ。コンコースの一部は親子連れ(子供が親の横を歩く)
  giveLooks() {
    this._looked = this.agents;   // 作り直し(rebuild)で agents が替わったら決め直す
    let s = 17; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const pick = (A) => A[Math.floor(r() * A.length)];
    const F = window.__crowd && window.__crowd.data && window.__crowd.data.aF;
    const mk = (fem, kid) => {
      const L = { fem, kid, low: 0, long: r() < 0.6, cap: !fem || r() < 0.3, hair: pick(HAIR_COL) };
      if (kid) { L.jersey = pick(SHIRTS); L.pants = pick(PANTS); L.cap = r() < 0.8; L.capCol = pick(KID_CAPS); L.long = r() < 0.5; }
      else if (fem) { L.jersey = pick(F_SHIRTS); L.pants = pick(F_LOWER); const u = r(); L.low = u < 0.45 ? 0 : u < 0.78 ? 1 : 2; L.tights = r() < 0.3; L.capCol = pick([0xf5f5f2, 0xd8c38f, 0x2a3352, 0x1f1f22]); }
      else { L.jersey = pick(SHIRTS); L.pants = pick(PANTS); L.capCol = r() < 0.35 ? 0x20242a : pick(SHIRTS); }
      return L;
    };
    let nc = 0;
    for (const a of this.agents) {
      if (a.look) continue;
      if (a.kind === 'seat' && F && a.seat >= 0) { const z = F[a.seat * 4 + 2]; a.look = mk(z > 3.5, z % 4 < 0.5); continue; }
      if (a.kind === 'vendor') { a.look = mk(r() < 0.8, false); if (a.look.fem) a.look.low = 1; continue; }   // 売り子は女性が多い(スカートに近い短い下)
      a.look = mk(r() < 0.42, false);
      // コンコースを歩く人の 8 人に 1 人の割合で、前の人の子供にする(並んでいない人だけ)
      if (a.kind === 'walk' && a.n.kind === 'concourse') {
        nc++;
        const par = this.agents[this.agents.indexOf(a) - 1];
        if (nc % 8 === 4 && par && par.kind === 'walk' && !par.follow && !par.stall && !a.stall && par.n.kind === 'concourse') {
          a.look = mk(r() < 0.48, true); a.follow = par; a.side = r() < 0.5 ? 1 : -1; a.kind = 'kid'; a.item = false;
          a.pos.copy(par.pos); a.n = par.n;
        }
      }
    }
  }
  // 子供は親の横(やや後ろ)を歩く。横に壁があれば真後ろ
  followMove(a, dt) {
    const q = a.follow, y = q.yaw, fx = -Math.sin(y), fz = -Math.cos(y), sx = Math.cos(y) * a.side, sz = -Math.sin(y) * a.side;
    let tx = q.pos.x - fx * 0.3 + sx * 0.42, tz = q.pos.z - fz * 0.3 + sz * 0.42;
    if (this.hit(q.pos.x, q.pos.y + 0.6, q.pos.z, tx - q.pos.x, 0, tz - q.pos.z, 0.75)) { tx = q.pos.x - fx * 0.6; tz = q.pos.z - fz * 0.6; }
    const k = Math.min(1, dt * 6);
    a.pos.x += (tx - a.pos.x) * k; a.pos.z += (tz - a.pos.z) * k;
    const g = this.ctx.groundAt(a.pos.x, a.pos.z, q.pos.y + 0.5, 1.4); a.pos.y = g != null ? g : q.pos.y;
    a.yaw = q.yaw; a.moving = q.moving && q.state !== 'queue'; a.state = q.state === 'walk' ? 'walk' : 'stop'; a.n = q.n;
  }
  applyLook(p, L) {
    if (p._lookOf === L) return; p._lookOf = L;
    if (!L) return;
    const skin = 0xd9a98a;
    const kit = { ...p.kit, jersey: L.jersey, pants: L.low === 2 ? L.jersey : L.pants, cap: L.capCol, under: 0xe8c4a0,
      sock: L.fem && L.low ? (L.tights ? 0x1a1a1e : skin) : L.fem ? L.pants : L.kid ? 0xf2f2ee : 0x2a2a2a };
    p.kit = kit; if (p.dress) p.dress();
    if (p.parts && p.parts.Cap) p.parts.Cap.forEach((m) => (m.visible = !!L.cap));
    if (p._hair) { p._hair.visible = !!L.fem; p._hair.geometry = hairGeo(this.THREE)[L.long && !L.kid ? 'long' : 'bob']; p._hair.material.color.setHex(L.hair); }
    p._headK = L.kid ? 1.2 : 1;
    if (L.kid) p.root.scale.setScalar(0.64); else if (L.fem) p.root.scale.set(0.9, 0.95, 0.9); else p.root.scale.setScalar(1);
  }
  // 模型の売店の台(材質の名前が shop_counter・kiosk_front・shop_front・conc_counter)を 3D の 1.5 m の目でかたまりに分け、
  // かたまりごとに、一番近い道の目(4 m 以内・高さ 0.8 m 以内)の側を「前」として、台の後ろに店員・前に列を置く
  useModelShops(conc) {
    // 11/21 店員: freeplay.js に今の模型の店員の表(models/shop_clerks.json)があれば、模型の店はそちらで全部開ける(ここでは店員もふたも置かない)。
    // modelShops は表の店の数にして、屋根の下の壁ぞいの屋台(addStall)は出さない(模型の店の前をふさがない)
    { const n = typeof window !== 'undefined' && window.__fpSimple && window.__fpClerkJson ? window.__fpClerkJson(this) : 0; if (n) { this.clerkModelSkip = true; this.modelShops = n; this.shopDbg = { json: n }; return; } }
    const THREE = this.THREE, RE =/shop_counter|kiosk_front|kiosk_counter|dt_counter|conc_counter|shop_front_lit/i, pts = new Map(), v = new THREE.Vector3();
    this.scene.updateMatrixWorld(true);
    this.scene.traverse((o) => {
      if (!o.isMesh || !o.visible && !o.parent) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      if (!ms.some((m) => m && RE.test(m.name || ''))) return;
      const P = o.geometry.attributes.position; if (!P) return;
      const step = Math.max(1, Math.floor(P.count / 6000));
      for (let i = 0; i < P.count; i += step) {
        v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld);
        const k = `${Math.floor(v.x / 1.5)},${Math.floor(v.y / 1.5)},${Math.floor(v.z / 1.5)}`;
        let c = pts.get(k); if (!c) pts.set(k, c = { n: 0, x: 0, y: 0, z: 0, ymin: 1e9, xx: 0, zz: 0, xz: 0 });
        c.n++; c.x += v.x; c.y += v.y; c.z += v.z; c.ymin = Math.min(c.ymin, v.y); c.xx += v.x * v.x; c.zz += v.z * v.z; c.xz += v.x * v.z;
      }
    });
    // 台の目(1.5 m)を 5 m 以上はなして選び、まわり 2.5 m の目の点の広がりから台の長い向きを求める(台が 1 つの大きなメッシュにまとまっていても、曲がった並びでも使える)
    const cells = [...pts.values()].map((c) => ({ ...c, cx: c.x / c.n, cy: c.y / c.n, cz: c.z / c.n }));
    let seed = 9; const rr = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    const picked = [], dbg = this.shopDbg = { cells: 0, noFront: 0, noNode: 0, noFloor: 0, wall: 0, ok: 0, ex: [] };
    this.modelShops = cells.length;
    let used = 0;
    for (const c of cells) {
      // 11/20 23 時 持ち主「買える場所多く」: 開ける店を増やし(前は 4/8)、開いた店どうしは 14 m はなしてまんべんなく
      const SIMPLE = typeof window !== 'undefined' && window.__fpSimple;
      if (used >= (SIMPLE ? (this.lite ? 16 : 30) : (this.lite ? 4 : 8))) break;
      if (picked.some((q) => Math.hypot(q.cx - c.cx, q.cz - c.cz) < (SIMPLE ? 14 : 5) && Math.abs(q.cy - c.cy) < 2)) continue;
      let n = 0, x = 0, z = 0, xx = 0, zz = 0, xz = 0, ymin = 1e9;
      for (const d of cells) { if (Math.hypot(d.cx - c.cx, d.cz - c.cz) > 2.5 || Math.abs(d.cy - c.cy) > 1.5) continue; n += d.n; x += d.x; z += d.z; xx += d.xx; zz += d.zz; xz += d.xz; ymin = Math.min(ymin, d.ymin); }
      x /= n; z /= n;
      const vxx = xx / n - x * x, vzz = zz / n - z * z, vxz = xz / n - x * z, th = 0.5 * Math.atan2(2 * vxz, vxx - vzz);
      const along = [Math.cos(th), Math.sin(th)], cx = x, cz = z, cl = { ymin };
      {
        // 前 = 3.5 m 以内の同じ階の道の目への向きの平均(通路の側)。軸の向き(縦横)に寄せる
        let ax = 0, az = 0;
        for (const n of conc) { if (Math.abs(n.y - cl.ymin) > 0.8) continue; const rx = n.x - cx, rz = n.z - cz, d = Math.hypot(rx, rz); if (d < 3.5 && d > 0.3) { ax += rx / d; az += rz / d; } }
        dbg.cells++;
        const al = Math.hypot(ax, az); if (al < 1.5) { dbg.noFront++; continue; }
        let fx = ax / al, fz = az / al;
        if (Math.abs(fx) > 0.92) { fx = Math.sign(fx); fz = 0; } else if (Math.abs(fz) > 0.92) { fz = Math.sign(fz); fx = 0; }
        c._shut = { cx, cz, ymin: cl.ymin, fx, fz, along };   // 店員が置けなかった時のふた(シャッター)の材料
        let best = null, bd = 9;
        for (const n of conc) { if (Math.abs(n.y - cl.ymin) > 0.8) continue; const rx = n.x - cx, rz = n.z - cz, fwd = rx * fx + rz * fz; if (fwd < 0.8) continue; const d = Math.hypot(rx - fx * 1.4, rz - fz * 1.4); if (d < bd) { bd = d; best = n; } }
        if (!best || bd > 2.5) { dbg.noNode++; continue; }
        // 店員: 台の後ろ 0.8 m(床があって、台の向こう側)
        const bx = cx - fx * 0.8, bz = cz - fz * 0.8, by = this.ctx.groundAt(bx, bz, cl.ymin + 1.2, 2.5);
        if (by == null || Math.abs(by - cl.ymin) > 0.5) { dbg.noFloor++; if (dbg.ex.length < 6) dbg.ex.push([+cx.toFixed(1), +cl.ymin.toFixed(2), +cz.toFixed(1), fx, fz, by]); continue; }   // 台の後ろに同じ高さの床が無い(壁・別の階)所は使わない
        // 台の後ろ(店員の所)から通路の目まで、胸の高さで壁が無いこと
        const hd = Math.hypot(best.x - bx, best.z - bz);
        // (当たり判定では売店の台が箱になっている球場があるので、台を越える見通しは見ない)
        if (false) { dbg.wall++; if (dbg.ex.length < 8) dbg.ex.push(['wall', +bx.toFixed(1), +by.toFixed(2), +bz.toFixed(1), best.x, best.z]); continue; }
        // 店員の所が壁の中でない(まわり 4 方向のうち 2 つ以上が 0.3 m 開いている)
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([qx, qz]) => !this.hit(bx, by + 1.0, bz, qx, 0, qz, 0.3)).length < 2) { dbg.wall++; continue; }
        const info = stallInfo(best.x, best.y, best.z, this.stalls.length);
        const clerk = new Person({ jersey: [0xf4f4f0, 0x2a2f3a, info.col][used % 3], pants: 0x2a2a2a, cap: info.col, sock: 0x222222, under: 0xe8c4a0 }, { glove: false, number: '' });
        clerk.root.position.set(bx, by ?? cl.ymin, bz); clerk.root.rotation.y = Math.atan2(-fx, -fz); clerk.set('stand');
        this.group.add(clerk.root);
        // 列: 道の目の上を、台から離れる向きへ 3 つ
        const queue = [{ p: new THREE.Vector3(best.x, best.y, best.z), who: null, node: best }];
        let cur = best;
        for (let k = 0; k < 2; k++) {
          let nx = null, nb = -1;
          for (const j of cur.nb) { const m = this.nodes[j]; const dd = (m.x - cur.x) * fx + (m.z - cur.z) * fz; if (dd > nb && !queue.some((q) => q.node === m)) { nb = dd; nx = m; } }
          if (!nx || nb < 0.5) break;
          queue.push({ p: new THREE.Vector3(nx.x, nx.y, nx.z), who: null, node: nx }); cur = nx;
        }
        this.stalls.push({ x: best.x, y: best.y, z: best.z, fx, fz, g: null, clerk, queue, info, t: 0, model: true });
        picked.push(c); used++; c._open = true;
      }
    }
    // 11/20 夜 持ち主「開いてる店ちゃんとふたして」: 店員を置かなかった模型の売店の台は、前にシャッターを下ろす(すっきりの形。window.__fpSimple)
    if (typeof window !== 'undefined' && window.__fpSimple) this.shutModelShops(cells, picked, conc);
  }
  // 台のかたまり(5 m おき)ごとに、台の点の広がり(長い向き)の幅で、台の前の縁に、床から 2.6 m のシャッターを立てる。開けた店(picked)の 5 m 以内は閉めない
  shutModelShops(cells, picked, conc) {
    const THREE = this.THREE, done = [];
    const tx = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#9aa1a8'; x.fillRect(0, 0, 64, 256); x.fillStyle = '#7d848b'; for (let k = 0; k < 256; k += 12) x.fillRect(0, k, 64, 3); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
    this.shutters = [];
    for (const c of cells) {
      if (picked.some((q) => Math.hypot(q.cx - c.cx, q.cz - c.cz) < 5 && Math.abs(q.cy - c.cy) < 2)) continue;
      if (done.some((q) => Math.hypot(q.cx - c.cx, q.cz - c.cz) < 5 && Math.abs(q.cy - c.cy) < 2)) continue;
      // まわり 2.5 m の台の点から、前の向き(通路の側)と長い向き
      let n = 0, x = 0, z = 0, xx = 0, zz = 0, xz = 0, ymin = 1e9; const near = [];
      for (const d of cells) { if (Math.hypot(d.cx - c.cx, d.cz - c.cz) > 2.5 || Math.abs(d.cy - c.cy) > 1.5) continue; n += d.n; x += d.x; z += d.z; xx += d.xx; zz += d.zz; xz += d.xz; ymin = Math.min(ymin, d.ymin); near.push(d); }
      if (!n) continue; x /= n; z /= n;
      const th = 0.5 * Math.atan2(2 * (xz / n - x * z), xx / n - x * x - (zz / n - z * z)), al = [Math.cos(th), Math.sin(th)];
      // 前 = 3.5 m 以内の同じ階の道の目への向き(店員を置く時と同じ)。道が無い台(人の通らない所)は閉めなくてよい
      let ax = 0, az = 0; for (const q of conc) { if (Math.abs(q.y - ymin) > 0.8) continue; const rx = q.x - x, rz = q.z - z, d = Math.hypot(rx, rz); if (d < 3.5 && d > 0.3) { ax += rx / d; az += rz / d; } }
      const aL = Math.hypot(ax, az); if (aL < 1.5) continue;
      let fx = ax / aL, fz = az / aL; if (Math.abs(fx) > 0.92) { fx = Math.sign(fx); fz = 0; } else if (Math.abs(fz) > 0.92) { fz = Math.sign(fz); fx = 0; }
      const sx = -fz, sz = fx;
      let lo = 1e9, hi = -1e9, fr = -1e9; for (const d of near) { const u = (d.cx - x) * sx + (d.cz - z) * sz, f = (d.cx - x) * fx + (d.cz - z) * fz; lo = Math.min(lo, u); hi = Math.max(hi, u); fr = Math.max(fr, f); }
      const W = Math.min(9, Math.max(1.8, hi - lo + 1.5)), mid = (lo + hi) / 2, F = fr + 0.78;
      const g = new THREE.Group(), Hh = 3.2;
      const tex = tx.clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(1, W / 1.2), 1);
      // 11/20 23 時 持ち主「使わないお店あるなら存在ごと消してもいい」: シャッターでなく、壁と同じ明るい灰色の板でふさいで店に見えないようにする
      const m = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), this._coverMat || (this._coverMat = new THREE.MeshLambertMaterial({ color: 0xb9bdc0, side: THREE.DoubleSide })));
      m.position.y = Hh / 2; g.add(m);
      g.position.set(x + sx * mid + fx * F, ymin, z + sz * mid + fz * F); g.rotation.y = Math.atan2(fx, fz);
      this.group.add(g); this.shutters.push(g); done.push(c);
    }
  }
  addStall(n, fx, fz, info) {
    const THREE = this.THREE, g = new THREE.Group();
    const yaw = Math.atan2(-fx, -fz);   // 前(-z)を通路へ
    const wx = n.x - fx * 0.45, wz = n.z - fz * 0.45;   // 壁から少し離す
    g.position.set(wx, n.y, wz); g.rotation.y = yaw + Math.PI;   // 台の前面(+z)を通路へ
    const wood = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 0.6), new THREE.MeshLambertMaterial({ color: 0xe9e2d4 }));
    counter.position.set(0, 0.5, 0.75); g.add(counter);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.05, 0.7), wood); top.position.set(0, 1.02, 0.75); g.add(top);
    for (const sx of [-1.2, 1.2]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.3, 0.08), wood); post.position.set(sx, 1.15, 1.0); g.add(post); }
    const awn = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 1.0), new THREE.MeshLambertMaterial({ color: info.col, emissive: new THREE.Color(info.col).multiplyScalar(0.25) }));
    awn.position.set(0, 2.3, 0.85); awn.rotation.x = -0.18; g.add(awn);
    // のれん(字の札): キャンバスに字だけ(値段は書かない)
    const tex = kbSignTexture(THREE, info.name, { w: 512, h: 128 });   // 11/22 看板(js/kanban.js: ChatGPT の絵の地・店の印+字体の店名)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    sign.position.set(0, 1.95, 1.36); g.add(sign);
    // 台の上の品(色の箱)
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.18), new THREE.MeshLambertMaterial({ color: [0xf2d36b, 0xc65a3a, 0xf6f1e6, 0x6aa86a][k] })); b.position.set(-0.8 + k * 0.53, 1.11, 0.7); g.add(b); }
    this.group.add(g);
    // 店員(台の後ろ)
    const clerk = new Person({ jersey: info.col, pants: 0x2a2a2a, cap: info.col, sock: 0x222222, under: 0xe8c4a0 }, { glove: false, number: '' });
    const cp = new THREE.Vector3(0, 0, 0.15).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    clerk.root.position.copy(cp); clerk.root.rotation.y = yaw; clerk.set('stand');
    this.group.add(clerk.root);
    // 列の場所: 台の前から通路へまっすぐの道の目の上(1・2・3 m)。目の上なので壁の中に立たない
    const queue = [];
    for (let k = 1; k <= 3; k++) { const m = this.nodes[this.key.get(`${n.x + fx * k},${n.z + fz * k},${Math.round(n.y / 2.2)}`)]; if (m) queue.push({ p: new THREE.Vector3(m.x, m.y, m.z), who: null, node: m }); }
    this.stalls.push({ x: n.x, y: n.y, z: n.z, fx, fz, g, clerk, queue, info, t: 0 });
  }
  // 道の目をたどる道順(幅優先、近くだけ)
  pathTo(from, to, limit = 800) {
    if (from === to) return [];
    const prev = new Map([[from.i, -1]]), q = [from.i];
    for (let h = 0; h < q.length && q.length < limit; h++) {
      const i = q[h];
      for (const j of this.nodes[i].nb) { if (prev.has(j)) continue; prev.set(j, i); if (j === to.i) { const path = []; let k = j; while (k !== from.i) { path.push(this.nodes[k]); k = prev.get(k); } return path.reverse(); } q.push(j); }
    }
    return null;
  }
  joinQueue(a, s, warp) {
    const qi = s.queue.findIndex((q) => !q.who); if (qi < 0) return false;
    if (!warp) { const path = this.pathTo(a.n, s.queue[qi].node); if (!path) return false; a.path = path; }
    s.queue[qi].who = a; a.stall = s; a.qi = qi; a.state = 'queue'; a.t = 0; a.wait = this.rnd() * 8;
    return true;
  }
  leaveQueue(a) {
    const s = a.stall; if (!s) return;
    s.queue[a.qi].who = null;
    // 後ろの人を前へ
    for (let k = a.qi; k < s.queue.length - 1; k++) { const w = s.queue[k + 1].who; if (w) { s.queue[k].who = w; s.queue[k + 1].who = null; w.qi = k; } }
    a.n = s.queue[Math.max(0, Math.min(a.qi, s.queue.length - 1))].node || a.n; a.to = null;
    a.stall = null; a.qi = -1; a.state = 'walk'; a.item = true; a.t = 0;
  }

  // ---------------------------------------------------------------- 毎こま
  update(dt, player, cam) {
    if (this.building) { this.buildStep(this.lite ? 90 : 160); return; }
    if (!this.built || !this.group.visible) return;
    const r = this.rnd, P = player;
    for (const s of this.stalls) {
      s.t += dt;
      // 先頭の人は 6〜14 秒で買い終わる
      const head = s.queue[0].who;
      if (head && head.t > 6 + (head.wait || 0)) this.leaveQueue(head);
    }
    for (const a of this.agents) {
      a.t += dt;
      if (a.follow) { this.followMove(a, dt); continue; }   // 11/20 親子連れの子供は親について歩く
      if (a.state === 'queue') {
        if (a.path && a.path.length) { const m = a.path[0]; if (this.moveTo(a, m.x, m.y, m.z, dt, a.speed)) { a.n = m; a.path.shift(); } a.t = 0; continue; }
        const q = a.stall.queue[a.qi].p; this.moveTo(a, q.x, q.y, q.z, dt, 0.9);
        const s = a.stall; a.yaw = Math.atan2(s.fx, s.fz); continue;   // 台の方を向く
      }
      if (a.state === 'stop') { if (a.t > a.wait) { a.state = 'walk'; a.t = 0; } continue; }
      if (a.kind === 'seat') {
        if (a.state === 'seated') {
          if (a.t > a.wait) { window.__crowd && window.__crowd.setSeatAway(a.seat, true); a.n = a.home; a.to = null; a.pos.set(a.home.x, a.home.y, a.home.z); a.state = 'walk'; a.t = 0; a.wait = 20 + r() * 35; a.item = false; }
          continue;
        }
        if (a.state === 'walk' && a.t > a.wait) { a.path = this.pathTo(a.n, a.home) || []; a.state = 'back'; }
        if (a.state === 'back') {
          if (a.path.length) { const m = a.path[0]; if (this.moveTo(a, m.x, m.y, m.z, dt, a.speed)) { a.n = m; a.path.shift(); } continue; }
          window.__crowd && window.__crowd.setSeatAway(a.seat, false); a.state = 'seated'; a.t = 0; a.wait = 30 + r() * 90; a.item = r() < 0.5; continue;
        }
      }
      // 次の目へ
      if (!a.to) a.to = this.pickNext(a);
      if (!a.to) { a.state = 'stop'; a.wait = 2; a.t = 0; continue; }
      // 自分(歩く人)が前をふさいでいたら止まって向きを変える
      if (P && Math.abs(P.y - a.pos.y) < 1.5) {
        const dx = P.x - a.pos.x, dz = P.z - a.pos.z, d = Math.hypot(dx, dz);
        if (d < 1.1) {
          const fx = a.to.x - a.pos.x, fz = a.to.z - a.pos.z, fl = Math.hypot(fx, fz) || 1;
          if ((dx * fx + dz * fz) / (fl * (d || 1)) > 0.2) { a.dir = [-a.dir[0], -a.dir[1]]; a.to = a.n; a.state = 'stop'; a.wait = 0.6 + r() * 0.8; a.t = 0; a.yaw = Math.atan2(-dx, -dz) + Math.PI; continue; }
        }
      }
      if (this.moveTo(a, a.to.x, a.to.y, a.to.z, dt, a.speed)) {
        a.n = a.to; a.to = null;
        // ときどき止まる・売店に並ぶ
        if (a.kind === 'walk' && r() < 0.012) { a.state = 'stop'; a.wait = 1.5 + r() * 4; a.t = 0; }
        else if (a.kind === 'walk' && a.n.kind === 'concourse' && !a.item && r() < 0.05) {
          const s = this.stalls.find((s) => Math.hypot(s.x - a.pos.x, s.z - a.pos.z) < 14 && Math.abs(s.y - a.pos.y) < 1.5 && s.queue.some((q) => !q.who));
          if (s) this.joinQueue(a, s);
        } else if (a.item && r() < 0.01) a.item = false;
      }
    }
    this.assign(cam);
  }
  moveTo(a, x, y, z, dt, sp) {
    const dx = x - a.pos.x, dz = z - a.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { a.pos.y = y; a.moving = false; return true; }
    const st = Math.min(d, sp * dt);
    a.pos.x += dx / d * st; a.pos.z += dz / d * st;
    a.pos.y += (y - a.pos.y) * Math.min(1, st / Math.max(d, 1e-3));
    // 足は本当の床(階段の段)に置く
    // 11/25 軽く: 形を割り当てていない(描かない)人は床を光線で調べない(目と目の間は高さを直線でつなぐ。止まる所は目の上なので床の高さになる)
    if (a.p) { const g = this.ctx.groundAt(a.pos.x, a.pos.z, a.pos.y + 0.5, 1.4); if (g != null) a.pos.y = g; }
    const want = Math.atan2(-dx, -dz); let dy = want - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.yaw += dy * Math.min(1, dt * 8);
    a.moving = true;
    return d - st < 0.05;
  }
  pickNext(a) {
    const n = a.n, r = this.rnd; if (!n.nb.length) return null;
    // 前の向きに近い目を選ぶ(行き交う)。ときどき曲がる
    let best = null, bs = -9;
    for (const j of n.nb) {
      const m = this.nodes[j]; if (m.nb.length < 3 && r() < 0.8) continue;
      const dx = m.x - n.x, dz = m.z - n.z, l = Math.hypot(dx, dz) || 1;
      const s = (dx * a.dir[0] + dz * a.dir[1]) / l + r() * 0.9;
      if (s > bs) { bs = s; best = m; }
    }
    if (!best) best = this.nodes[n.nb[Math.floor(r() * n.nb.length)]];
    const dx = best.x - n.x, dz = best.z - n.z, l = Math.hypot(dx, dz) || 1;
    a.dir = [dx / l, dz / l];
    return best;
  }
  // 近い K 人だけに形を当てる
  assign(cam) {
    if (this._looked !== this.agents) this.giveLooks();   // 11/20 女性・子供の見た目
    const R = this.lite ? 22 : 30, cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    const near = [];
    for (const a of this.agents) { if (a.state === 'seated') continue; const d = Math.hypot(a.pos.x - cx, (a.pos.y - cy) * 2, a.pos.z - cz); if (d < R) near.push([d, a]); }
    near.sort((p, q) => p[0] - q[0]);
    const want = new Set(near.slice(0, this.K).map((x) => x[1]));
    for (const p of this.pool) if (p._a && !want.has(p._a)) { p._a.p = null; p._a = null; p.root.visible = false; }
    for (const a of want) {
      if (!a.p) { const p = this.pool.find((q) => !q._a); if (!p) continue; p._a = a; a.p = p; p.lastPos = null; p.root.visible = true; }
      const p = a.p;
      p.root.position.copy(a.pos); p.root.rotation.y = a.yaw;
      if (a.moving && a.state !== 'stop') p.set('run'); else p.set('stand');
      this.applyLook(p, a.look);
      p._tank.visible = a.kind === 'vendor';
      p._cup.visible = !!a.item && a.kind !== 'vendor';
      if (p._cup.visible) { p._cup.position.set(0.22, 1.0, -0.25); }
    }
  }
  setVisible(on) {
    this.group.visible = on;
    if (!on) {
      for (const p of this.pool) { if (p._a) p._a.p = null; p._a = null; p.root.visible = false; }
      // 席を立っていた人は席へ戻す(ほかのモードで空席が残らないように)
      for (const a of this.agents) if (a.kind === 'seat' && a.state !== 'seated') { window.__crowd && window.__crowd.setSeatAway(a.seat, false); a.state = 'seated'; a.t = 0; a.pos.set(a.home.x, a.home.y, a.home.z); a.n = a.home; a.path = null; }
    }
  }
  info() { return { seatAgents: this.agents.filter((a) => a.kind === 'seat').length, seatAway: this.agents.filter((a) => a.kind === 'seat' && a.state !== 'seated').length, modelShops: this.modelShops || 0, modelStalls: this.stalls.filter((s) => s.model).length, nodes: this.nodes.length, walkable: this.walkable ? this.walkable.length : 0, concourse: this.nodes.filter((n) => n.kind === 'concourse').length, stand: this.nodes.filter((n) => n.kind === 'stand').length, agents: this.agents.length, stalls: this.stalls.length, shown: this.pool.filter((p) => p._a).length, building: !!this.building }; }
}
function q_push(q, m) { q.push(m); }
function shuffle(A, s) { const a = A.slice(); let seed = s; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
