// 11/22 持ち主「ワープできる場所増やして なんかセンター側の裏とか回れないこと多いので 良い感じにして すぐにどこでも回れる感じで」
// ワープ先を球場ごとに手で置かず、当たり判定(BVH)を上から細かく調べて「立てる床」を集め、通路口・ゲート・売店・トイレ・席の位置から
// つながっている床だけを残し、場所(本塁の後ろ・一塁側・センター裏…)と階で分けて 1 か所ずつ選ぶ。全部の球場に同じやり方で効く。
//  ・立てるかの確かめ(standOK): 足もとに床・頭の上 1.95 m が空く・体(半径 0.34 m)が壁や柵に触れない・まわり 0.9 m に同じ高さの床・2 m 先まで歩ける向きがある
//  ・屋根の上・看板の上のような「行けない床」は、信頼できる印(通路口・ゲート・店・トイレ・席・今までの WARPS)から床をたどって届く物だけにして外す
//  ・組: 内野・外野・センター裏・球場の外・ゲート・グラウンドと裏・店・トイレ(main.js の refreshWarps が組のボタンにし、押すと中が開く)
//  ・地図(M)で押した所へ飛ぶ: standNear で押した所のまわりの一番近い立てる床を探す(js/wayfinding.js)
//  ・main.js の WARPS は変えない(並び・k の名前を他の仕組みが使う)。WARPS の行き先は組の先頭に、今までの並びのまま入る
const ZONES = [   // 本塁からの向き(度、0 = センター、+ = 一塁側)
  { k: 'home', name: '本塁の後ろ', g: 'infield' },
  { k: 'first', name: '一塁側', g: 'infield' },
  { k: 'third', name: '三塁側', g: 'infield' },
  { k: 'right', name: 'ライト', g: 'outfield' },
  { k: 'rc', name: '右中間', g: 'outfield' },
  { k: 'center', name: 'センター', g: 'center' },
  { k: 'lc', name: '左中間', g: 'outfield' },
  { k: 'left', name: 'レフト', g: 'outfield' },
];
export const WARP_GROUPS = [
  { k: 'infield', label: '内野' },
  { k: 'outfield', label: '外野' },
  { k: 'center', label: 'センター裏' },
  { k: 'outside', label: '球場の外' },
  { k: 'gate', label: 'ゲート' },
  { k: 'ground', label: 'グラウンド・裏' },
  { k: 'shop', label: '店' },
  { k: 'toilet', label: 'トイレ' },
];
const ROOM_K = /^(home|mound|bench|bullpen|tunnel|locker|interview|corridor|lounge|stairs)/;
const CAP = 24;   // 1 つの組に出す数の上限(スマホ縦で 1 画面に収まる数)

export function zoneOf(x, z) {
  const az = Math.atan2(x, -z) * 180 / Math.PI, A = Math.abs(az);
  if (A >= 125) return ZONES[0];
  if (A > 45) return az > 0 ? ZONES[1] : ZONES[2];
  if (A <= 12) return ZONES[5];
  if (A <= 28) return az > 0 ? ZONES[4] : ZONES[6];
  return az > 0 ? ZONES[3] : ZONES[7];
}

export class WarpGen {
  // h: THREE・getBvh・fence(度)→m・seats・getMarks()(地図の印)・getFp()・WARPS・isField(x,y,z)・passages
  constructor(h) {
    this.h = h; const T = h.THREE;
    this.ray = new T.Ray(); this.seg = new T.Line3(); this.box = new T.Box3(); this.v1 = new T.Vector3(); this.v2 = new T.Vector3();
    this.ready = false; this.base = null; this.gen = null; this.cache = new Map();
  }
  bvh() { return this.h.getBvh(); }
  _first(x, y, z, dx, dy, dz, far) { const b = this.bvh(); this.ray.origin.set(x, y, z); this.ray.direction.set(dx, dy, dz).normalize(); return b.raycastFirst(this.ray, this.h.THREE.DoubleSide, 0, far); }
  _down(x, z, from, max) { const h = this._first(x, from, z, 0, -1, 0, max); return h ? h.point.y : null; }
  // 体(半径 r の筒、足もと + 0.55 〜 頭)が何かに触れるか
  _touch(x, y, z, r) {
    const b = this.bvh(), sg = this.seg, bx = this.box, tp = this.v1, cp = this.v2;
    sg.start.set(x, y + 0.55, z); sg.end.set(x, y + 1.5, z);
    bx.makeEmpty(); bx.expandByPoint(sg.start); bx.expandByPoint(sg.end); bx.min.addScalar(-r); bx.max.addScalar(r);
    let hit = false;
    b.shapecast({ intersectsBounds: (q) => q.intersectsBox(bx), intersectsTriangle: (tri) => { if (tri.closestPointToSegment(sg, tp, cp) < r) { hit = true; return true; } return false; } });
    return hit;
  }
  // 立てるか。立てるなら床の上の点 {x, y, z}
  standOK(x, y, z, relax = false) {
    const g = this._down(x, z, y + 0.7, 1.6); if (g == null || Math.abs(g - y) > 0.75) return null;
    if (this._first(x, g + 0.05, z, 0, 1, 0, 1.95)) return null;   // 頭の上
    if (this._touch(x, g, z, relax ? 0.3 : 0.36)) return null;   // 壁・柵・手すりの中
    let nb = 0, walk = 0;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, dx = Math.sin(a), dz = Math.cos(a);
      const h1 = this._down(x + dx * 0.9, z + dz * 0.9, g + 0.85, 1.7); if (h1 != null && Math.abs(h1 - g) <= 0.8) nb++;
      if (!this._first(x, g + 0.9, z, dx, 0, dz, 2.2)) { const h2 = this._down(x + dx * 2.0, z + dz * 2.0, g + 0.95, 1.9); if (h2 != null && Math.abs(h2 - g) <= 0.9) walk++; }
    }
    if (nb < (relax ? 4 : 6) || walk < (relax ? 1 : 2)) return null;
    return { x, y: g, z };
  }
  // (x, z) のまわり R m で一番近い立てる床(prefY に近い階を先に)。地図で押した所へ飛ぶ時
  standNear(x, z, prefY = null, R = 14) {
    if (!this.bvh()) return null;
    const top = this.top || 90;
    for (let r = 0; r <= R; r += r < 3 ? 1 : 1.5) {
      const n = r === 0 ? 1 : Math.max(8, Math.round(r * 4)), found = [];
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
        for (const y of this._floors(px, pz, top)) { if (y.roof) continue; const s = this.standOK(px, y.y, pz, false); if (s && this._reach(s)) found.push(s); }
      }
      if (found.length) {
        const k = (s) => (prefY == null ? 0 : Math.abs(s.y - prefY)) + Math.hypot(s.x - x, s.z - z) * 0.3;
        found.sort((a, b) => k(a) - k(b)); return found[0];
      }
    }
    return null;
  }
  // 調べた床の網につながっているか(網ができる前は通す)
  _reach(s) {
    const N = this.net; if (!N) return true;
    const i = Math.round((s.x - N.x0) / N.S), j = Math.round((s.z - N.z0) / N.S);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const c = N.col.get((i + di) * 100000 + (j + dj)); if (c) for (const n of c) if (n.ok && Math.abs(n.y - s.y) < 1.0) return true; }
    return false;
  }
  // 縦の 1 本で、上が 2 m 以上あいた上向きの床を上から全部
  _floors(x, z, top) {
    const b = this.bvh(); this.ray.origin.set(x, top, z); this.ray.direction.set(0, -1, 0);
    const hs = b.raycast(this.ray, this.h.THREE.DoubleSide, 0, top + 30); if (!hs.length) return [];
    hs.sort((p, q) => q.point.y - p.point.y);
    const out = []; let above = Infinity;
    for (const t of hs) {
      const y = t.point.y; if (above - y < 0.05) continue;
      const ny = t.face ? Math.abs(t.face.normal.y) : 1;
      if (ny > 0.8 && above - y >= 2.0 && y > -30) out.push({ y, head: above - y, roof: above === Infinity && y > this.roofY });
      above = y;
    }
    return out;
  }
  // 名前: 場所と階
  _lvName(y) { const L = this.levels; if (!L || L.length < 2) return ''; let bi = 0, bd = 1e9; L.forEach((l, i) => { const d = y < l.min ? l.min - y : y > l.max ? y - l.max : 0; if (d < bd) { bd = d; bi = i; } }); return `${bi + 1}階`; }
  _outside(x, y, z) {
    const fp = this.h.getFp && this.h.getFp();
    try { if (fp && fp._plan && fp.zoneIn) return !fp.zoneIn(x, z, 0); } catch (e) { /* まだ */ }
    return this.ringR ? Math.hypot(x, z + 40) > this.ringR : false;
  }
  _seatNear(x, y, z, d = 1.6) {
    const S = this.h.seats; if (!S || !S.n || !S.grid) return false;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const c = S.grid.get((Math.floor(x / 2) + a + 1000) * 4000 + (Math.floor(z / 2) + b + 1000)); if (!c) continue;
      for (const i of c) if (Math.abs(S.x[i] - x) < d && Math.abs(S.z[i] - z) < d && Math.abs(S.y[i] - y) < 1.6) return true;
    }
    return false;
  }
  describe(x, y, z) {
    if (this.h.isField && this.h.isField(x, y, z)) return 'グラウンド';
    const zn = zoneOf(x, z), lv = this._lvName(y);
    if (this._outside(x, y, z)) return `球場の外(${zn.name}側)`;
    if (this._seatNear(x, y, z)) return `${zn.name}の席${lv ? `(${lv})` : ''}`;
    return zn.k === 'center' ? `センター裏${lv ? ` ${lv}` : ''}` : `${zn.name} ${lv}コンコース`.replace('  ', ' ');
  }
  // ---------------------------------------------------------------- 作る(少しずつ。終わるまで next() を呼ぶ)
  start() { if (!this.gen && !this.ready) this.gen = this._build(); }
  step(ms = 8) { if (this.ready) return true; this.start(); const t0 = performance.now(); while (performance.now() - t0 < ms) { if (this.gen.next().done) { this.ready = true; this.gen = null; return true; } } return false; }
  finish() { while (!this.step(1e9)) { /* 続ける */ } }
  *_build() {
    const t0 = performance.now(), H = this.h, S = H.seats, W = H.WARPS;
    // 範囲: 席・印・WARPS のまわり 30 m
    let x0 = -80, z0 = -160, x1 = 80, z1 = 40, sy = 0;
    const add = (x, z) => { if (!isFinite(x) || !isFinite(z)) return; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
    if (S && S.n) for (let i = 0; i < S.n; i += 7) { add(S.x[i], S.z[i]); if (S.y[i] > sy) sy = S.y[i]; }
    const marks = (H.getMarks && H.getMarks()) || [];
    for (const m of marks) add(m.p[0], m.p[2]);
    for (const w of W) add(w.at[0], w.at[1]);
    x0 = Math.max(-380, x0 - 30); x1 = Math.min(380, x1 + 30); z0 = Math.max(-440, z0 - 30); z1 = Math.min(340, z1 + 30);
    this.roofY = sy + 2.5; this.top = Math.max(60, sy + 30);
    { let gr = 0, gn = 0; for (const m of marks) if (m.t === 'gate') { gr += Math.hypot(m.at[0], m.at[2] + 40); gn++; } this.ringR = gn ? gr / gn - 1 : 0; }
    yield;
    // 1) 上から調べる(2.5 m の目)
    const SS = 2.5, col = new Map(), nodes = [];
    const ni = Math.ceil((x1 - x0) / SS), nj = Math.ceil((z1 - z0) / SS);
    for (let i = 0; i <= ni; i++) {
      for (let j = 0; j <= nj; j++) {
        const x = x0 + i * SS, z = z0 + j * SS, L = this._floors(x, z, this.top);
        if (!L.length) continue;
        const c = []; for (const f of L) { if (f.roof) continue; const n = { i, j, x, z, y: f.y, head: f.head, ok: false }; c.push(n); nodes.push(n); }
        if (c.length) col.set(i * 100000 + j, c);
      }
      if (i % 6 === 5) yield;
    }
    const N = { x0, z0, S: SS, col }; this.net = null;
    // 2) 印からたどる(屋根の上などの行けない床を外す)
    const q = [];
    const seed = (x, y, z) => { const i = Math.round((x - x0) / SS), j = Math.round((z - z0) / SS); for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const c = col.get((i + di) * 100000 + (j + dj)); if (c) for (const n of c) if (!n.ok && Math.abs(n.y - y) < 1.3) { n.ok = true; q.push(n); } } };
    for (const m of marks) { seed(m.p[0], m.p[1], m.p[2]); if (m.at) seed(m.at[0], m.at[1], m.at[2]); }
    for (const w of W) { const y = this._down(w.at[0], w.at[1], w.fromY || 60, 120); if (y != null) seed(w.at[0], y, w.at[1]); }
    if (S && S.n) for (let i = 0; i < S.n; i += 5) if (S.y[i] > -100) seed(S.x[i], S.y[i], S.z[i]);
    yield;
    while (q.length) {
      const n = q.pop();
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue; const c = col.get((n.i + di) * 100000 + (n.j + dj)); if (!c) continue;
        for (const m of c) if (!m.ok && Math.abs(m.y - n.y) <= 0.75) { m.ok = true; q.push(m); }
      }
    }
    this.net = N;
    yield;
    // 3) 分ける: グラウンド・席・外・コンコース
    const ok = nodes.filter((n) => n.ok);
    for (const n of ok) {
      n.field = !!(H.isField && H.isField(n.x, n.y, n.z));
      { const az = Math.atan2(n.x, -n.z) * 180 / Math.PI; if (!n.field && Math.abs(az) <= 46 && n.y < 1.5 && Math.hypot(n.x, n.z) < H.fence(Math.max(-45, Math.min(45, az))) + 3) n.field = true; }   // フェンスの前(ウォーニングトラック)はグラウンド
      n.seat = !n.field && this._seatNear(n.x, n.y, n.z, 1.4);
      n.out = !n.field && this._outside(n.x, n.y, n.z);
      n.zone = zoneOf(n.x, n.z);
    }
    yield;
    // 階: 席でもグラウンドでもない床の高さを 2.6 m あいた所で区切る(8 点以上の段だけ)
    { const ys = ok.filter((n) => !n.field && !n.seat).map((n) => n.y).sort((a, b) => a - b), L = []; let cur = null;
      for (const y of ys) { if (!cur || y - cur.max > 2.6) { cur = { min: y, max: y, n: 0 }; L.push(cur); } cur.max = y; cur.n++; }
      this.levels = L.filter((l) => l.n >= 8); }
    yield;
    // 4) 組ごとに 1 か所ずつ選ぶ(まわりに同じ組の床が多い所 = 広い所を先に試す)
    const spots = [];
    const pick = (list, label, g, relax) => {
      const set = new Set(list), key = (n) => n.i * 100000 + n.j;
      const byCol = new Map(); for (const n of list) byCol.set(key(n), n);
      const sc = (n) => { let k = 0; for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) { const m = byCol.get((n.i + di) * 100000 + (n.j + dj)); if (m && set.has(m) && Math.abs(m.y - n.y) < 1) k++; } return k; };
      const cand = list.map((n) => [sc(n) - (n.dm || 0) * 0.6, n]).sort((a, b) => b[0] - a[0]).slice(0, 14);
      for (const [, n] of cand) { for (const [ox, oz] of [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]) { const s = this.standOK(n.x + ox, n.y, n.z + oz, relax); if (s) { spots.push({ g, label, ...s, gen: true }); return true; } } }
      return false;
    };
    // コンコースは、通路口・店・トイレ・ゲート・今までの行き先から 14 m 以内だけ(スタンドの下の何も無いすき間を選ばない)。外は空の開いた所
    const anchors = marks.filter((m) => m.t !== 'mascot').map((m) => m.p).concat(this._wp());
    const dMark = (n) => { let b = 1e9; for (const p of anchors) { if (Math.abs(p[1] - n.y) > 2.5) continue; const d = Math.hypot(p[0] - n.x, p[2] - n.z); if (d < b) b = d; } return b; };
    const strong = marks.filter((m) => m.t === 'shop' || m.t === 'toilet' || m.t === 'booth' || m.t === 'desk').map((m) => m.p).concat(this._wp());
    const dStrong = (n) => { let b = 1e9; for (const p of strong) { if (Math.abs(p[1] - n.y) > 2.5) continue; const d = Math.hypot(p[0] - n.x, p[2] - n.z); if (d < b) b = d; } return b; };
    const groups = new Map(); const put = (k, n) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n); };
    const lvIdx = (y) => { const L = this.levels; if (!L || L.length < 2) return 0; let bi = 0, bd = 1e9; L.forEach((l, i) => { const d = y < l.min ? l.min - y : y > l.max ? y - l.max : 0; if (d < bd) { bd = d; bi = i; } }); return bi; };
    for (const n of ok) {
      if (n.field) continue;
      if (n.seat) continue;   // 席は下で席の表から
      if (n.out) { if (n.head > 8) put(`out|${n.zone.k}|${lvIdx(n.y)}`, n); continue; }
      const lim = n.zone.k === 'center' || n.zone.k === 'rc' || n.zone.k === 'lc' ? 30 : 14;   // センター・中間の後ろは印が少ないので広く
      n.dm = dMark(n); if (n.dm > lim) continue;
      if (this._seatAbove(n) && dStrong(n) > lim) continue;   // スタンドの下のすき間(店もトイレも無い所)は選ばない
      // センターの後ろは細かく(左・まん中・右)
      let zk = n.zone.k; if (zk === 'center') { const az = Math.atan2(n.x, -n.z) * 180 / Math.PI; zk = az < -4 ? 'centerL' : az > 4 ? 'centerR' : 'center'; }
      put(`in|${zk}|${lvIdx(n.y)}`, n);
    }
    const ZN = { centerL: 'センター裏(左)', centerR: 'センター裏(右)', center: 'センター裏' };
    let gi = 0;
    for (const [k, list] of groups) {
      if (list.length < 3) continue;
      const [kind, zk, li] = k.split('|'), z = ZONES.find((q) => q.k === zk) || ZONES[5], lv = this.levels.length > 1 ? `${+li + 1}階` : '';
      if (kind === 'out') pick(list, `外(${z.name}側)${lv ? ` ${lv}` : ''}`, zk === 'center' ? 'center' : 'outside', false);   // センターの後ろの外もセンター裏の組に
      else if (ZN[zk]) pick(list, `${ZN[zk]}${lv ? ` ${lv}` : ''}`, 'center', false);
      else pick(list, `${z.name} ${lv}コンコース`.replace('  ', ' '), z.g, false);
      if (++gi % 3 === 0) yield;
    }
    // 席: 場所と段(下段・上段)ごとに
    if (S && S.n) {
      const sg = new Map();
      { const ys = []; for (let i = 0; i < S.n; i += 3) if (S.y[i] > -100) ys.push(S.y[i]); ys.sort((a, b) => a - b); const L = []; let cur = null; for (const y of ys) { if (!cur || y - cur.max > 3.5) { cur = { min: y, max: y, n: 0 }; L.push(cur); } cur.max = y; cur.n++; } this.seatLv = L.filter((l) => l.n >= 20); }
      const SL = this.seatLv, slName = (i) => (SL.length < 2 ? '' : SL.length === 2 ? ['下段', '上段'][i] : i === 0 ? '下段' : i === SL.length - 1 ? '上段' : SL.length === 3 ? '中段' : `${i + 1}段目`);
      const slIdx = (y) => { let bi = 0, bd = 1e9; SL.forEach((l, i) => { const d = y < l.min ? l.min - y : y > l.max ? y - l.max : 0; if (d < bd) { bd = d; bi = i; } }); return bi; };
      for (let i = 0; i < S.n; i += 2) { if (!(S.y[i] > -100)) continue; const z = zoneOf(S.x[i], S.z[i]), k = `${z.k}|${slIdx(S.y[i])}`; if (!sg.has(k)) sg.set(k, []); sg.get(k).push(i); }
      for (const [k, L] of sg) {
        if (L.length < 15) continue;
        const [zk, li] = k.split('|'), z = ZONES.find((q) => q.k === zk);
        let mx = 0, mz = 0; for (const i of L) { mx += S.x[i]; mz += S.z[i]; } mx /= L.length; mz /= L.length;
        const near = L.slice().sort((a, b) => Math.hypot(S.x[a] - mx, S.z[a] - mz) - Math.hypot(S.x[b] - mx, S.z[b] - mz)).slice(0, 30);
        const ln = slName(+li), what = z.g === 'infield' ? '内野席' : '外野席';
        const label = `${z.name} ${what}${ln ? `(${ln})` : ''}`;
        let done = false;
        for (const i of near) {
          const fx = -Math.sin(S.yaw ? S.yaw[i] : 0), fz = -Math.cos(S.yaw ? S.yaw[i] : 0);
          for (const d of [0.55, 0.9, 0.3, 1.3]) { const s = this.standOK(S.x[i] + fx * d, S.y[i], S.z[i] + fz * d, true); if (s && Math.abs(s.y - S.y[i]) < 1.2) { spots.push({ g: z.g, label, ...s, gen: true, seat: true }); done = true; break; } }
          if (done) break;
        }
        yield;
      }
    }
    // グラウンド: 芝の 3 か所とファウルの所
    for (const [az, r, label] of [[0, 0.78, 'センターの芝'], [-32, 0.72, 'レフトの芝'], [32, 0.72, 'ライトの芝'], [62, 0.42, '一塁のファウルゾーン'], [-62, 0.42, '三塁のファウルゾーン']]) {
      const t = az * Math.PI / 180, R = H.fence(Math.max(-45, Math.min(45, az))) * r, x = Math.sin(t) * R, z = -Math.cos(t) * R;
      const y = this._down(x, z, 3, 8); if (y == null) continue; const s = this.standOK(x, y, z, false); if (s) spots.push({ g: 'ground', label, ...s, gen: true, field: true });
    }
    yield;
    // ゲートの外と中
    const gates = marks.filter((m) => m.t === 'gate' && m.at && m.p).sort((a, b) => (a.n || 99) - (b.n || 99));
    const seenG = new Set();
    for (const m of gates) {
      const name = m.n ? `${m.n}ゲート` : (m.label || 'ゲート'); if (seenG.has(name)) continue; seenG.add(name);
      let ax = m.at[0], az = m.at[2], ay = m.at[1], bx = m.p[0], bz = m.p[2], by = m.p[1]; if (Math.hypot(bx, bz + 40) < Math.hypot(ax, az + 40)) [ax, az, ay, bx, bz, by] = [bx, bz, by, ax, az, ay];   // 外の口 = 球場のまん中から遠い方
      let ox = bx - ax, oz = bz - az; const L = Math.hypot(ox, oz) || 1; ox /= L; oz /= L;
      const o = this._near(bx + ox * 2.5, by, bz + oz * 2.5, 4); if (o) spots.push({ g: 'gate', label: `${name}の外`, ...o, lx: ax, lz: az, ly: o.y + 1.5, gen: true });
      const n = this._near(ax - ox * 2.5, ay, az - oz * 2.5, 4); if (n) spots.push({ g: 'gate', label: `${name}の中`, ...n, lx: ax - ox * 10, lz: az - oz * 10, ly: n.y + 1.5, gen: true });
      yield;
    }
    // WARPS と近すぎる物・同じ名前は外す
    const wpos = W.map((w) => { const y = this._down(w.at[0], w.at[1], w.fromY || 60, 120); return { x: w.at[0], y: y == null ? 0 : y, z: w.at[1] }; });
    const keep = [], names = new Set(W.map((w) => w.label));
    for (const s of spots) {
      if (names.has(s.label)) continue;
      if (wpos.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < 6 && Math.abs(p.y - s.y) < 2)) continue;
      names.add(s.label); keep.push(s);
    }
    this.wpos = wpos; this.base = keep;
    this.ms = Math.round(performance.now() - t0);
  }
  _seatAbove(n) {
    const S = this.h.seats; if (!S || !S.n || !S.grid || !(n.head < 30)) return false;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const c = S.grid.get((Math.floor(n.x / 2) + a + 1000) * 4000 + (Math.floor(n.z / 2) + b + 1000)); if (!c) continue;
      for (const i of c) if (Math.abs(S.x[i] - n.x) < 3 && Math.abs(S.z[i] - n.z) < 3 && S.y[i] > n.y + 2.5) return true;
    }
    return false;
  }
  _wp() { return this.h.WARPS.map((w) => { const y = this._down(w.at[0], w.at[1], w.fromY || 60, 120); return [w.at[0], y == null ? 0 : y, w.at[1]]; }); }
  _near(x, y, z, R) {
    for (let r = 0; r <= R; r += 0.75) {
      const n = r === 0 ? 1 : Math.max(8, Math.round(r * 6));
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r, g = this._down(px, pz, y + 1.5, 3.5); if (g == null) continue; const s = this.standOK(px, g, pz, false); if (s) return s; }
    }
    return null;
  }
  // WARPS の行き先の組(位置で決める。グラウンドと裏の部屋は名前で)
  _groupOfWarp(w, p) {
    if (ROOM_K.test(w.k) || (this.h.isField && this.h.isField(p.x, p.y, p.z))) return 'ground';
    if (/^(front|gate|plaza|walkway|seaview|mallgate)/.test(w.k) || this._outside(p.x, p.y, p.z)) return 'outside';
    if (/^(outfield|board)/.test(w.k) && zoneOf(p.x, p.z).g === 'infield') return 'outfield';
    return zoneOf(p.x, p.z).g;
  }
  // 店とトイレ(地図の印から。開いている店は遊ぶ間に変わるので、開くたびに作る。位置ごとに覚えておく)
  _dyn() {
    const marks = (this.h.getMarks && this.h.getMarks()) || [], out = [], seen = new Set();
    const tl = marks.filter((m) => m.t === 'toilet'), sh = marks.filter((m) => m.t === 'shop');
    const near = (m) => { const key = m.p.map((v) => v.toFixed(1)).join(','); if (this.cache.has(key)) return this.cache.get(key); const s = this._near(m.p[0], m.p[1], m.p[2], 3); this.cache.set(key, s); return s; };
    for (const m of tl) {
      const s = near(m); if (!s) continue; const z = zoneOf(s.x, s.z), lv = this._lvName(s.y), o = this._outside(s.x, s.y, s.z);
      let label = `トイレ(${o ? '外・' : ''}${z.name}${lv ? `・${lv}` : ''})`; if (seen.has(label)) continue; seen.add(label);
      out.push({ g: 'toilet', label, ...s, lx: m.at ? m.at[0] : m.p[0], lz: m.at ? m.at[2] : m.p[2], ly: s.y + 1.4, z0: z });
    }
    for (const m of sh) {
      const s = near(m); if (!s) continue; const z = zoneOf(s.x, s.z);
      let label = m.short || m.label || '売店'; if (seen.has(label)) label = `${label}(${z.name})`; if (seen.has(label)) continue; seen.add(label);
      out.push({ g: 'shop', label, ...s, lx: m.at ? m.at[0] : m.p[0], lz: m.at ? m.at[2] : m.p[2], ly: s.y + 1.3, z0: z });
    }
    const zo = (s) => ZONES.indexOf(s.z0);
    out.sort((a, b) => (a.g === b.g ? zo(a) - zo(b) || a.y - b.y : a.g < b.g ? -1 : 1));
    return out;
  }
  // 組の一覧: [{ k, label, items: [{ label, w(WARPS の番号) | spot }] }]。WARPS は組の先頭に今の並びで
  list() {
    if (!this.ready) this.finish();
    const W = this.h.WARPS, G = WARP_GROUPS.map((g) => ({ ...g, items: [] })), byK = (k) => G.find((g) => g.k === k);
    W.forEach((w, i) => { const p = (this.wpos && this.wpos[i]) || { x: w.at[0], y: 0, z: w.at[1] }; byK(this._groupOfWarp(w, p)).items.push({ label: w.label, w: i }); });
    const ZO = (s) => ZONES.indexOf(zoneOf(s.x, s.z));
    const gen = this.base.slice().sort((a, b) => ZO(a) - ZO(b) || a.y - b.y);
    for (const s of gen) byK(s.g).items.push({ label: s.label, spot: s });
    for (const s of this._dyn()) byK(s.g).items.push({ label: s.label, spot: s });
    for (const g of G) g.items = g.items.slice(0, CAP);
    return G.filter((g) => g.items.length);
  }
  // すべての行き先(試験用)
  all() { const out = []; for (const g of this.list()) for (const it of g.items) out.push({ g: g.k, ...it }); return out; }
}
