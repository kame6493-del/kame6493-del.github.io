// 通路口・入場ゲート・ベンチ裏の通路(11/18 夜、持ち主「コンコースから球場に続く道を全球場に」「入口が見当たらない」「下に落ちる」)
// 球場ごとの道の表(models/passages.json)から、読み込みの時に次を作る:
//   1) 道の形(床・階段・横の壁・天井・明るい口の枠・案内板・ゲートのひさしと番号の板)
//   2) 道が通る所の、元の模型の面(絵と当たり判定の両方)を切り抜く(口が開いて見え、普通に歩いて抜けられる)
//   3) 道の当たり判定(階段は段の鼻を結んだ坂にして、普通に歩いて上れる)
// 元の Blender を直して書き出すのではなく、ここで足す理由: 9 球場の模型は作りも版もばらばらで、Blender は同時に 1 つしか開けず、
// 同じ形の道を 9 球場で同じ作り・同じ見た目にそろえるには、読み込みの時に表から作る方が確かで、直しもすぐ効く(docs/通路口と歩きの直し.md)。
// 光源は足さない。明るさは発光の材質だけ。実在の名前・ロゴは出さない(字は「一塁側 内野席」「3 ゲート」のような汎用の物)。

const UP = [0, 1, 0];

export class Passages {
  constructor({ THREE, stadium, data, quality }) {
    this.T = THREE; this.stadium = stadium; this.def = (data && data[stadium]) || []; this.quality = quality;
    // 11/21 版で切り替える項目: skipIf = この URL の引数のどれかがあれば作らない、onlyIf = どれかがある時だけ作る(銀輪の ?ring_r21=1 などの前の版)
    try { const sp = new URLSearchParams((typeof location !== 'undefined' && location.search) || ''); this.def = this.def.filter((d) => !(d.skipIf && d.skipIf.some((k) => sp.has(k))) && !(d.onlyIf && !d.onlyIf.some((k) => sp.has(k)))); } catch (e) { /* 表のまま */ }
    this.segs = []; this.items = []; this.colTris = []; this.group = new THREE.Group(); this.group.name = 'passages';
    this.mats = null; this.nightMats = [];
  }

  // ---------------------------------------------------------------- 1) 道の形を決める(切り抜く前の当たり判定で高さを調べる)
  plan(bvh) {
    const T = this.T, ray = new T.Ray(new T.Vector3(), new T.Vector3(0, -1, 0));
    const floorBelow = (x, y, z, max = 6) => {
      ray.origin.set(x, y, z); ray.direction.set(0, -1, 0);
      const hs = bvh.raycast(ray, T.DoubleSide); let best = null;
      for (const h of hs) if (h.distance <= max && h.face && h.face.normal.y > 0.5 && (best === null || h.point.y > best)) best = h.point.y;
      // 上向きの面が無い時は、向きが逆に書き出された床(観覧車の丘 R15 の地面・床は法線が下向き)も床とみなす: 上から当たる最初の水平な面
      if (best === null) for (const h of hs) if (h.distance <= max && h.face && h.face.normal.y < -0.5 && (best === null || h.point.y > best)) best = h.point.y;
      return best;
    };
    const firstUp = (x, y, z, max) => { ray.origin.set(x, y, z); ray.direction.set(0, 1, 0); const h = bvh.raycastFirst(ray, T.DoubleSide, 0, max); return h ? h.point.y : null; };
    const hor = (x, y, z, dx, dz, max) => { ray.origin.set(x, y, z); ray.direction.set(dx, 0, dz).normalize(); const h = bvh.raycastFirst(ray, T.DoubleSide, 0, max); return h ? h.distance : null; };
    this._floorBelow = floorBelow; this._firstUp = firstUp; this._hor = hor;
    for (const d of this.def) {
      try {
        const it = { def: d, kind: d.k, label: d.label || '', segs: [] };
        if (d.k === 'vom') this._planVom(it, d, floorBelow);
        else if (d.k === 'gate' || d.k === 'path') this._planPath(it, d, floorBelow);
        else if (d.k === 'rail') {
          // 席の最前列の前の柵(手すり)。pts = [[x, z, 柵の上の高さ], ...]。道(通路口・ベンチの段)の中は作らない
          it.rail = d.pts.map((q) => this._v(q[0], q[2], q[1])); it.mouthIn = it.rail[0]; it.mouthOut = it.rail[it.rail.length - 1]; it.dir = [1, 0]; it.hidden = true;
          this.items.push(it); continue;
        }
        else if (d.k === 'plaza') {
          // 外周の広場・デッキ(内の線 inner と外の線 outer の間の帯。点の数は同じ。y = 高さ)
          it.plaza = d; it.mouthIn = this._v(d.inner[0][0], d.y, d.inner[0][1]); it.mouthOut = this._v(d.outer[0][0], d.y, d.outer[0][1]); it.dir = [1, 0]; it.hidden = true;
          this.items.push(it); continue;
        }
        else if (d.k === 'solid') {
          // 当たり判定だけの建物(模型の外に絵はあるが当たり判定が無い周りの建物)。boxes = [{ poly: [[x, z], ...], y0, y1 }, ...]。横の面だけ
          const p0 = d.boxes[0].poly[0]; it.solid = d; it.mouthIn = this._v(p0[0], 0, p0[1]); it.mouthOut = it.mouthIn.clone(); it.dir = [1, 0]; it.hidden = true;
          this.items.push(it); continue;
        }
        else if (d.k === 'hide') {
          // 模型の材質を見せない(本物と違う所にある号門の番号の板・描いただけの扉など)。mat = 材質名の正規表現。形も当たり判定も変えない
          it.hide = d; it.mouthIn = this._v(0, 0, 0); it.mouthOut = it.mouthIn.clone(); it.dir = [1, 0]; it.hidden = true;
          this.items.push(it); continue;
        }
        else if (d.k === 'patch') {
          // 床の穴をふさぐ板(グラウンドの穴・床の無い囲いの中)。box = [x0, z0, x1, z1]、y = 高さ
          it.patch = d; it.mouthIn = this._v(d.box[0], d.y, d.box[1]); it.mouthOut = this._v(d.box[2], d.y, d.box[3]); it.dir = [1, 0]; it.hidden = true;
          this.items.push(it); continue;
        }
        else if (d.k === 'mark') {
          // 元の模型にある通路口(形は作らない。案内の地図と矢印にだけ使う)。a = コンコースの側、b = 席の側
          it.mouthIn = this._v(...d.a); it.mouthOut = this._v(...d.b); const l = Math.hypot(d.b[0] - d.a[0], d.b[2] - d.a[2]) || 1; it.dir = [(d.b[0] - d.a[0]) / l, (d.b[2] - d.a[2]) / l]; it.hidden = true;
          this.items.push(it); continue;
        }
        else if (d.k === 'void') {
          // 当たり判定だけを消す(見えない床・見えない壁。例: ベンチの上に張った地面の板)。y0〜y1 の高さの間だけ
          const P = d.pts.map((q) => this._v(q[0], d.y0 - 0.05, q[1]));
          for (let i = 0; i + 1 < P.length; i++) it.segs.push({ a: P[i], b: P[i + 1].clone(), w: d.w ?? 3, h: d.y1 - d.y0 + 0.05, stair: false, colOnly: true });
          it.mouthIn = P[0]; it.mouthOut = P[P.length - 1]; it.dir = [1, 0]; it.hidden = true;
        }
        if (it.segs.length && !it.face && (d.look || d.k === 'gate' || d.gate)) {
          // 外壁の面(門の形を付ける所): 口の始まりから道の向きに、切り抜く前の壁を探す(道の長さまで)
          const s0 = it.segs[0], L0 = Math.hypot(s0.b.x - s0.a.x, s0.b.z - s0.a.z) || 1, fx = (s0.b.x - s0.a.x) / L0, fz = (s0.b.z - s0.a.z) / L0;
          const dw = this._hor(s0.a.x, s0.a.y + 1.2, s0.a.z, fx, fz, Math.min(L0, 12));
          if (dw !== null) { it.face = this._v(s0.a.x + fx * dw, s0.a.y, s0.a.z + fz * dw); it.faceDir = [fx, fz]; }
        }
        if (!it.segs.length) { (this.fails || (this.fails = [])).push({ label: d.label, err: it.err || 'no path' }); console.warn('通路口を作れませんでした', d.label, it.err); continue; }
        for (const s of it.segs) { s.item = it; this.segs.push(s); }
        this.items.push(it);
      } catch (e) { console.warn('通路口の表の読み違い', d, e); }
    }
    for (const s of this.segs) this._prism(s);
    // 自動で作った通路口(vom)が、手で置いた道(階段・通路・ゲート)と重なる時は、通路口の方を作らない(床や天井が道をふさぐため)
    const drop = new Set();
    for (const it of this.items) {
      if (it.kind !== 'vom') continue;
      for (const s of it.segs) for (let t = 0; t <= 1.001 && !drop.has(it); t += 0.1) {
        const x = s.a.x + (s.b.x - s.a.x) * t, y = s.a.y + (s.b.y - s.a.y) * t + 1.2, z = s.a.z + (s.b.z - s.a.z) * t;
        if (this.segs.some((q) => q.item !== it && q.item.kind === 'path' && !q.colOnly && this._in(q, x, y, z, 0.6))) drop.add(it);
      }
    }
    if (drop.size) { for (const it of drop) (this.fails || (this.fails = [])).push({ label: it.label, err: 'overlaps a path (手で置いた道と重なるので作らない)' }); this.items = this.items.filter((it) => !drop.has(it)); this.segs = this.segs.filter((s) => !drop.has(s.item)); }
    // 覆われているか(上に天井・席があるか)を、道の上の点で調べる(切り抜く前の形で)
    for (const s of this.segs) {
      s.cov = [];
      const n = Math.max(2, Math.ceil(s.len / 0.5));
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = s.a.x + (s.b.x - s.a.x) * t, z = s.a.z + (s.b.z - s.a.z) * t, y = s.a.y + (s.b.y - s.a.y) * t;
        const u = firstUp(x, y + 0.4, z, s.h + 6);
        s.cov.push(u !== null);
      }
      // 横が本物の部屋・廊下(同じ高さの床があり、天井が 2〜4.5 m)の所は、横の壁を作らない(既にある廊下をふさがない)
      s.open = [];
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, x = s.a.x + (s.b.x - s.a.x) * t, z = s.a.z + (s.b.z - s.a.z) * t, y = s.a.y + (s.b.y - s.a.y) * t;
        const o = [];
        for (const sd of [-1, 1]) {
          let room = !s.stair;
          for (const off of [s.w / 2 + 0.8, s.w / 2 + 1.8]) {
            const px = x + s.r[0] * off * sd, pz = z + s.r[1] * off * sd;
            const f = floorBelow(px, y + 0.6, pz, 1.2); const c = f === null ? null : firstUp(px, f + 0.3, pz, 6);
            if (f === null || Math.abs(f - y) > 0.35 || c === null || c - f < 2.0 || c - f > 4.5) { room = false; break; }
          }
          o.push(room);
        }
        s.open.push(o);
      }
    }
    return this.items.length;
  }
  _v(x, y, z) { return new this.T.Vector3(x, y, z); }
  _planVom(it, d, floorBelow) {
    // コンコース(または外)の a から、to(場内)の方へ: 平らな通路 lead m → 階段(勾配 slope)→ 席の段に出た所 → 1.2 m の踊り場
    // c(コンコースの中の点)を書いた時は、場内の向きの壁の 0.8 m 手前まで寄せて始める
    let [ax, az] = d.a || d.c; const fromY = d.fromY ?? 2;
    let dx = d.to[0] - ax, dz = d.to[1] - az; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
    let y0 = floorBelow(ax, fromY + 0.6, az, fromY + 8);
    if (y0 === null) { it.err = 'no floor at c'; return; }
    if (d.c) {
      const head = this._firstUp(ax, y0 + 0.3, az, 8);
      if (head !== null && head - y0 < 2.2) { it.err = 'c is not in a corridor (head ' + (head - y0).toFixed(2) + ')'; return; }
      const dw = this._hor(ax, y0 + (d.rayY ?? 1.2), az, dx, dz, 40);   // rayY: 低い手すり・ガラスの柵の所は低い高さで壁を探す
      if (dw === null) { it.err = 'no inner wall'; return; }
      ax += dx * Math.max(0, dw - 0.8); az += dz * Math.max(0, dw - 0.8);
      y0 = floorBelow(ax, y0 + 0.6, az, 2) ?? y0;
    }
    const lead = d.lead ?? 2.0, slope = d.slope ?? 0.6, w = d.w ?? 2.2, h = d.h ?? 2.6;
    let eu = null, ey = null;
    for (let u = lead + 0.5; u < (d.max ?? 45); u += 0.2) {
      const ly = d.level ? y0 : y0 + (u - lead) * slope, x = ax + dx * u, z = az + dz * u;
      // 階段の線の高さに歩ける面があり、その上 h に何も無い(= 席の段の上に出た)
      const f = floorBelow(x, ly + h, z, h + 0.5 + Math.max(0, (d.drop ?? 0.35) - 0.35));
      if (f !== null && f > ly - (d.drop ?? 0.35) && f < ly + 0.6 && (d.level ? f > y0 - 1.2 : f > y0 + 0.6) && this._firstUp(x, f + 0.25, z, d.open ?? 3.5) === null) { eu = u; ey = f; break; }
      if (eu === null && u > lead + 0.5) { /* 続ける */ }
    }
    if (eu === null) { it.err = 'no stand surface met'; return; }
    const P0 = this._v(ax, y0, az), P1 = this._v(ax + dx * lead, y0, az + dz * lead);
    const yTop = ey;   // 階段の上の端 = 席の段の高さ
    const runLen = d.level ? Math.max(0.5, eu - lead) : (yTop - y0) / slope, uTop = lead + runLen;   // level: ほぼ同じ高さの席の通路へ、平らか緩い坂で出る
    const P2 = this._v(ax + dx * uTop, yTop, az + dz * uTop);
    const land = d.land ?? 1.4;
    const P3 = this._v(ax + dx * (uTop + land), yTop, az + dz * (uTop + land));
    it.segs.push({ a: P0, b: P1, w, h, stair: false, role: 'in' });
    if (runLen > 0.3) it.segs.push({ a: P1, b: P2, w, h, stair: Math.abs(yTop - y0) / runLen > 0.2, role: 'stair' });
    it.segs.push({ a: P2, b: P3, w, h, stair: false, role: 'out' });
    let end = P3;
    // 踊り場の先の段が低い時は、段を 1 つ足して下りやすくする(戻る時に高い段をよじ登らなくてよい)
    const nx = P3.x + dx * 1.3, nz = P3.z + dz * 1.3, f2 = floorBelow(nx, yTop + 0.4, nz, 3);
    if (f2 !== null && f2 < yTop - 0.25 && f2 > yTop - 2.0) { const P4 = this._v(nx, f2, nz); it.segs.push({ a: P3, b: P4, w, h, stair: true, role: 'out2' }); end = P4; }
    it.mouthIn = P0.clone(); it.mouthOut = end.clone(); it.dir = [dx, dz];
  }
  _planPath(it, d, floorBelow) {
    let pts = d.pts || [d.a, d.b];
    if (d.k === 'gate' && d.to) {
      // 外の点 a から to の向きへ: 外壁(ファサード)を探し、その 2.5 m 外から、壁の内へ in m 入った所まで
      let [gx, gz] = d.a; let dx = d.to[0] - gx, dz = d.to[1] - gz; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      const gy = floorBelow(gx, (d.outY ?? 1) + 0.6, gz, (d.outY ?? 1) + 8) ?? 0;
      if (d.scan) {
        // 外壁の開いた口(元の模型の門)を横に探す: 壁までの距離がいちばん遠い所(0.5 m おき、幅 1.5 m の 3 本が全部遠い所)
        const rx = -dz, rz = dx; let best = 0, bd = -1; const D = (o) => this._hor(gx + rx * o, gy + 1.2, gz + rz * o, dx, dz, 60) ?? 99;
        for (let o = -d.scan; o <= d.scan; o += 0.5) { const v = Math.min(D(o - 0.75), D(o), D(o + 0.75)); if (v > bd + 0.3) { bd = v; best = o; } }
        gx += rx * best; gz += rz * best; it.scanOff = best;
      }
      let df = this._hor(gx, gy + 1.2, gz, dx, dz, 60);
      if (d.scan) { const rx = -dz, rz = dx; const s1 = this._hor(gx + rx * 2.8, gy + 1.2, gz + rz * 2.8, dx, dz, 60), s2 = this._hor(gx - rx * 2.8, gy + 1.2, gz - rz * 2.8, dx, dz, 60); const fa = Math.min(s1 ?? 99, s2 ?? 99); if (fa < 90) df = fa; }
      if (df === null) { it.err = 'no facade'; return; }
      const a0 = Math.max(0, df - 2.5), b0 = df + (d.in ?? 3.5);
      it.face = this._v(gx + dx * df, gy, gz + dz * df); it.faceDir = [dx, dz];   // 外壁の面(門の枠・柱・看板を壁に付ける所)
      const bx = gx + dx * b0, bz = gz + dz * b0;
      const by = floorBelow(bx, gy + (d.inY ?? 1.2) + 0.6, bz, 6);
      if (by === null) { it.err = 'no floor inside'; return; }
      const ay = floorBelow(gx + dx * a0, gy + 1.0, gz + dz * a0, 4) ?? gy;
      pts = [[gx + dx * a0, ay, gz + dz * a0], [bx, by, bz]];
      if (Math.abs(by - ay) > 0.25) {   // 高さが違う時は、外で平らに 2 m → 坂か階段
        pts = [[gx + dx * a0, ay, gz + dz * a0], [gx + dx * (a0 + 1.5), ay, gz + dz * (a0 + 1.5)], [bx, by, bz]];
      }
    }
    const w = d.w ?? (d.k === 'gate' ? 4.0 : 2.4), h = d.h ?? (d.k === 'gate' ? 3.4 : 2.6);
    const P = [];
    for (const p of pts) {
      if (p.length === 3) P.push(this._v(p[0], p[1], p[2]));
      else { const y = floorBelow(p[0], (d.fromY ?? 2) + 0.6, p[1], (d.fromY ?? 2) + 8); P.push(this._v(p[0], y ?? 0, p[1])); }
    }
    if (d.reach && P.length === 2) {
      // reach: 終わりの点に床が無い時は、同じ向きに最大 reach m 先まで、始まりより 5 m 下〜0.6 m 上の床を探して、そこで終える(柵の向こうの席の段まで)
      const A = P[0], dx = P[1].x - A.x, dz = P[1].z - A.z, l = Math.hypot(dx, dz) || 1;
      const f0 = floorBelow(P[1].x, A.y + 0.6, P[1].z, 5.6);
      if (f0 === null) {
        let found = false;
        for (let u = l; u <= d.reach && !found; u += 0.25) { const x = A.x + dx / l * u, z = A.z + dz / l * u, f = floorBelow(x, A.y + 0.6, z, 5.6); if (f !== null) { P[1] = this._v(x + dx / l * 1.2, f, z + dz / l * 1.2); P[1].y = floorBelow(P[1].x, f + 0.6, P[1].z, 2) ?? f; found = true; } }
        if (!found) { it.err = 'no seats beyond (柵の向こうに席の段が無い。口を開けると落ちるので作らない)'; return; }
      } else P[1].y = f0;
    }
    for (let i = 0; i + 1 < P.length; i++) {
      const dy = Math.abs(P[i + 1].y - P[i].y), hl = Math.hypot(P[i + 1].x - P[i].x, P[i + 1].z - P[i].z);
      it.segs.push({ a: P[i], b: P[i + 1], w, h, stair: dy / Math.max(hl, 0.01) > 0.2, role: i === 0 ? 'in' : 'mid' });
    }
    it.mouthIn = P[0].clone(); it.mouthOut = P[P.length - 1].clone();
    const dx = P[1].x - P[0].x, dz = P[1].z - P[0].z, l = Math.hypot(dx, dz) || 1; it.dir = [dx / l, dz / l];
  }
  _prism(s) {
    // 切り抜く箱(道の向きに沿った、床から h までの斜めの角柱)。平面は外向きの法線と定数(n·p > c が外)
    const T = this.T;
    const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z; s.len = Math.hypot(dx, dz);
    const fx = dx / s.len, fz = dz / s.len; s.f = [fx, fz]; s.r = [-fz, fx];
    const slope = (s.b.y - s.a.y) / s.len; s.slope = slope;
    const ext = 0.02;   // 端は少し重ねる(隣の区間とすき間を作らない)
    const pl = [];
    const add = (nx, ny, nz, px, py, pz) => { const n = new T.Vector3(nx, ny, nz).normalize(); pl.push({ n, c: n.x * px + n.y * py + n.z * pz }); };
    add(-fx, 0, -fz, s.a.x - fx * ext, 0, s.a.z - fz * ext);           // 始まりの面の手前は外
    add(fx, 0, fz, s.b.x + fx * ext, 0, s.b.z + fz * ext);             // 終わりの面の先は外
    add(s.r[0], 0, s.r[1], s.a.x + s.r[0] * s.w / 2, 0, s.a.z + s.r[1] * s.w / 2);
    add(-s.r[0], 0, -s.r[1], s.a.x - s.r[0] * s.w / 2, 0, s.a.z - s.r[1] * s.w / 2);
    // 床の面(坂): 法線は (−slope·f, 1, ...) を下へ向けた物。床 +0.05 より下は外(元の床を残す)
    const bot = s.stair ? 0.12 : 0.05;
    add(slope * fx, -1, slope * fz, s.a.x, s.a.y + bot, s.a.z);
    add(-slope * fx, 1, -slope * fz, s.a.x, s.a.y + s.h, s.a.z);
    s.planes = pl;
    const xs = [s.a.x, s.b.x], zs = [s.a.z, s.b.z];
    const bx0 = Math.min(...xs) - s.w, bx1 = Math.max(...xs) + s.w, bz0 = Math.min(...zs) - s.w, bz1 = Math.max(...zs) + s.w;
    s.box = new T.Box3(new T.Vector3(bx0, Math.min(s.a.y, s.b.y) - 0.5, bz0), new T.Vector3(bx1, Math.max(s.a.y, s.b.y) + s.h + 0.5, bz1));
  }
  _in(s, x, y, z, margin = 0) { for (const p of s.planes) if (p.n.x * x + p.n.y * y + p.n.z * z - p.c > margin) return false; return true; }
  inside(x, y, z, margin = 0) {
    for (const s of this.segs) {
      if (s.colOnly) continue;
      let ok = true;
      for (const p of s.planes) if (p.n.x * x + p.n.y * y + p.n.z * z - p.c > margin) { ok = false; break; }
      if (ok) return s;
    }
    return null;
  }

  // ---------------------------------------------------------------- 2) 切り抜き(三角形を角柱の外の部分だけ残す)
  // verts: 1 頂点 = 数の並び(先頭 3 つが位置)。planes は同じ座標の平面。戻りは残す多角形の並び
  static clipOut(poly, planes, out) {
    let inside = poly;
    for (const p of planes) {
      const dist = (v) => p.n.x * v[0] + p.n.y * v[1] + p.n.z * v[2] - p.c;
      const front = [], back = []; const n = inside.length;
      for (let i = 0; i < n; i++) {
        const A = inside[i], B = inside[(i + 1) % n], da = dist(A), db = dist(B);
        if (da >= 0) front.push(A); if (da <= 0) back.push(A);
        if ((da > 0 && db < 0) || (da < 0 && db > 0)) { const t = da / (da - db); const V = A.map((a, k) => a + (B[k] - a) * t); front.push(V); back.push(V); }
      }
      if (front.length >= 3) out.push(front);
      if (back.length < 3) return;   // 角柱の中の部分が無い
      inside = back;
    }
    // 残った inside は角柱の中 → 捨てる
  }
  // 当たり判定(世界座標・位置だけ)を切り抜き、道の当たり判定を足した新しいジオメトリを返す
  // 11/21 読み込みの固まりの直し: carveCollisionGen・carveSceneGen は少しずつ進められる形(main.js が 1 こまずつ譲りながら回す)。結果は同じ
  carveCollision(geo) { const it = this.carveCollisionGen(geo); let r; do { r = it.next(); } while (!r.done); return r.value; }
  carveScene(root) { const it = this.carveSceneGen(root); let r; do { r = it.next(); } while (!r.done); return r.value; }
  *carveCollisionGen(geo) {
    const T = this.T, src = geo.index ? geo.toNonIndexed() : geo, P = src.attributes.position, out = [];
    const tb = new T.Box3(), a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
    let cut = 0;
    for (let i = 0; i < P.count; i += 3) {
      if (i % 12288 === 12285) yield;
      a.fromBufferAttribute(P, i); b.fromBufferAttribute(P, i + 1); c.fromBufferAttribute(P, i + 2);
      tb.makeEmpty(); tb.expandByPoint(a); tb.expandByPoint(b); tb.expandByPoint(c);
      let polys = [[a.toArray(), b.toArray(), c.toArray()]];
      for (const s of this.segs) {
        if (!s.box.intersectsBox(tb)) continue;
        const next = [];
        for (const pg of polys) Passages.clipOut(pg, s.planes, next);
        polys = next; cut++;
        if (!polys.length) break;
      }
      for (const pg of polys) for (let k = 1; k + 1 < pg.length; k++) out.push(...pg[0], ...pg[k], ...pg[k + 1]);
    }
    for (const t of this.colTris) out.push(...t);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(out, 3));
    this.cutCol = cut;
    return g;
  }
  // 絵の模型を切り抜く(各メッシュの自分の座標で。属性は全部線形に補間する)
  *carveSceneGen(root) {
    // 速さのため: 元の三角形は道に掛かる物だけ潰し(3 つの頂点を 1 点に)、切り抜いた残りは子のメッシュとして足す
    const T = this.T;
    const hides = this.items.filter((it) => it.hide).map((it) => new RegExp(it.hide.mat));
    if (hides.length) root.traverse((o) => { if (!o.isMesh || (o.parent && o.parent.name === 'passages')) return; for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m && hides.some((r) => r.test(m.name || ''))) m.visible = false; });
    const segs0 = this.segs.filter((s) => !s.colOnly); if (!segs0.length) return 0;
    root.updateMatrixWorld(true);
    let changed = 0; const wb = new T.Box3(), inv = new T.Matrix4();
    const meshes = [], uses = new Map(); root.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && !o.userData.passagePiece && !(o.parent && o.parent.name === 'passages')) { meshes.push(o); uses.set(o.geometry, (uses.get(o.geometry) || 0) + 1); } });
    let nY = 0;
    for (const o of meshes) {
      if ((++nY & 15) === 0) yield;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      wb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      if (o.isInstancedMesh) { this._carveInstanced(o); continue; }
      const mats = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => (m && m.name) || '').join('|');
      const segs = segs0.filter((s) => s.box.intersectsBox(wb)).concat(this.segs.filter((s) => s.colOnly && s.item.def.vis && new RegExp(s.item.def.vis).test(mats) && s.box.intersectsBox(wb)));
      if (!segs.length) continue;
      inv.copy(o.matrixWorld).invert();
      const lp = segs.map((s) => { const b = s.box.clone().applyMatrix4(inv); return { b: [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z], planes: s.planes.map((p) => { const pl = new T.Plane(p.n.clone(), -p.c).applyMatrix4(inv); return { n: pl.normal, c: -pl.constant }; }) }; });
      const U = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (const s of lp) for (let k = 0; k < 3; k++) { U[k] = Math.min(U[k], s.b[k]); U[k + 3] = Math.max(U[k + 3], s.b[k + 3]); }
      if (uses.get(o.geometry) > 1) o.geometry = o.geometry.clone();   // ほかのメッシュと共有している形は、自分の分を写してから潰す(重い時は下で潰した物が無ければ元に戻す)
      const g = o.geometry, idx = g.index, pos = g.attributes.position, PA = pos.array, st = pos.itemSize;
      if (pos.isInterleavedBufferAttribute) continue;   // 使っていない形(念のため)
      const names = Object.keys(g.attributes).filter((n) => !g.attributes[n].isInterleavedBufferAttribute);
      const pi = names.indexOf('position'); names.splice(pi, 1); names.unshift('position');
      const sizes = names.map((n) => g.attributes[n].itemSize), tot = sizes.reduce((a, b) => a + b, 0);
      const get = (vi) => { const v = []; for (let k = 0; k < names.length; k++) { const A = g.attributes[names[k]]; for (let j = 0; j < sizes[k]; j++) v.push(A.getComponent(vi, j)); } return v; };
      const triCount = (idx ? idx.count : pos.count) / 3;
      const groups = g.groups.length ? g.groups : [{ start: 0, count: triCount * 3, materialIndex: 0 }];
      const pieces = new Map(); let any = false;
      for (const gr of groups) {
        for (let t = gr.start / 3; t < (gr.start + gr.count) / 3 && t < triCount; t++) {
          if ((t & 8191) === 8191) yield;
          const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
          const ax = PA[i0 * st], ay = PA[i0 * st + 1], az = PA[i0 * st + 2], bx = PA[i1 * st], by = PA[i1 * st + 1], bz = PA[i1 * st + 2], cx = PA[i2 * st], cy = PA[i2 * st + 1], cz = PA[i2 * st + 2];
          const x0 = Math.min(ax, bx, cx), x1 = Math.max(ax, bx, cx), y0 = Math.min(ay, by, cy), y1 = Math.max(ay, by, cy), z0 = Math.min(az, bz, cz), z1 = Math.max(az, bz, cz);
          if (x1 < U[0] || x0 > U[3] || y1 < U[1] || y0 > U[4] || z1 < U[2] || z0 > U[5]) continue;
          let hit = null;
          for (const s of lp) { const b = s.b; if (x1 < b[0] || x0 > b[3] || y1 < b[1] || y0 > b[4] || z1 < b[2] || z0 > b[5]) continue; (hit || (hit = [])).push(s); }
          if (!hit) continue;
          // 本当に角柱に掛かるか(3 点とも 1 つの面の外なら掛からない)
          const cut = hit.filter((s) => !s.planes.some((p) => { const d = (x, y, z) => p.n.x * x + p.n.y * y + p.n.z * z - p.c; return d(ax, ay, az) > 0 && d(bx, by, bz) > 0 && d(cx, cy, cz) > 0; }));
          if (!cut.length) continue;
          let polys = [[get(i0), get(i1), get(i2)]];
          for (const s of cut) { const next = []; for (const pg of polys) Passages.clipOut(pg, s.planes, next); polys = next; if (!polys.length) break; }
          // 元の三角形を潰す
          if (idx) { idx.setX(t * 3 + 1, i0); idx.setX(t * 3 + 2, i0); } else { for (const vi of [i1, i2]) for (let k = 0; k < 3; k++) PA[vi * st + k] = PA[i0 * st + k]; }
          any = true;
          let arr = pieces.get(gr.materialIndex); if (!arr) pieces.set(gr.materialIndex, arr = []);
          for (const pg of polys) for (let k = 1; k + 1 < pg.length; k++) arr.push(...pg[0], ...pg[k], ...pg[k + 1]);
        }
      }
      if (!any) continue;
      if (idx) idx.needsUpdate = true; else pos.needsUpdate = true;
      for (const [mi, outV] of pieces) {
        if (!outV.length) continue;
        const ng = new T.BufferGeometry(), n = outV.length / tot; let off = 0;
        for (let k = 0; k < names.length; k++) {
          const sz = sizes[k], A = g.attributes[names[k]], arr = new A.array.constructor(n * sz);
          for (let v = 0; v < n; v++) for (let j = 0; j < sz; j++) arr[v * sz + j] = outV[v * tot + off + j];
          ng.setAttribute(names[k], new T.BufferAttribute(arr, sz, A.normalized)); off += sz;
        }
        ng.computeBoundingBox(); ng.computeBoundingSphere();
        const mat = Array.isArray(o.material) ? o.material[mi] : o.material;
        // 切り抜いた残りは元の物と別に描くので、元の物の中に同じ面に重なる三角形があると、補った頂点のわずかな違いでちらつく(屋根の球場の 1 階コンコース)。
        // 少し奥へずらした写しの材質で描き、色・明るさ・テクスチャは毎回元の材質から写す(夜の切り替えや崩れの直しに付いて行く)
        const cm = mat.clone(); cm.polygonOffset = true; cm.polygonOffsetFactor = (mat.polygonOffset ? mat.polygonOffsetFactor : 0) + 1; cm.polygonOffsetUnits = (mat.polygonOffset ? mat.polygonOffsetUnits : 0) + 1;
        const m = new T.Mesh(ng, cm);
        m.onBeforeRender = () => { for (const k of ['map', 'lightMap', 'lightMapIntensity', 'emissiveMap', 'emissiveIntensity', 'opacity', 'transparent', 'visible', 'aoMap', 'envMapIntensity', 'roughness', 'metalness']) if (k in mat && cm[k] !== mat[k]) cm[k] = mat[k]; if (mat.color) cm.color.copy(mat.color); if (mat.emissive) cm.emissive.copy(mat.emissive); }; m.userData.passagePiece = true; m.castShadow = o.castShadow; m.receiveShadow = o.receiveShadow; m.renderOrder = o.renderOrder; m.name = (o.name || '') + '_cut';
        o.add(m);
      }
      changed++;
      yield;
    }
    return changed;
  }
  _carveInstanced(o) {
    const T = this.T, m = new T.Matrix4(), p = new T.Vector3(), z = new T.Matrix4().makeScale(0, 0, 0);
    let n = 0;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m); p.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld);
      if (this.inside(p.x, p.y + 0.3, p.z, 0.35)) { o.setMatrixAt(i, z); n++; }
    }
    if (n) o.instanceMatrix.needsUpdate = true;
  }
  // 席(seats.bin の並び)のうち、道の中にある物を外す(観客が通路口の中に座らないように)
  seatMask(seats) {
    const keep = new Uint8Array(seats.n);
    for (let i = 0; i < seats.n; i++) keep[i] = this.inside(seats.x[i], seats.y[i] + 0.3, seats.z[i], 0.45) ? 0 : 1;
    return keep;
  }

  // ---------------------------------------------------------------- 3) 道の形(絵と当たり判定)
  _materials() {
    if (this.mats) return this.mats;
    const T = this.T;
    const std = (c, o = {}) => new T.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, side: T.DoubleSide, ...o });
    this.mats = {
      floor: std(0xc9b48a),                 // 通路の床(コンコースの灰色と違う、明るい砂色)
      stair: std(0xb8a27a),
      nosing: std(0xffd21f, { emissive: 0xffc400, emissiveIntensity: 0.55 }),   // 段の鼻の黄色い線(暗くても段が分かる)
      wall: std(0xe9e4da),
      ceil: std(0xf2efe8),
      lamp: std(0xffffff, { emissive: 0xfff4dc, emissiveIntensity: 1.6 }),       // 天井の灯り(発光の材質)
      frame: std(0x1f6f52, { emissive: 0x2bd38f, emissiveIntensity: 0.0 }),     // 口の枠(昼は緑、夜は少し光る)
      frameGlow: std(0xffffff, { emissive: 0xfff2c8, emissiveIntensity: 1.25 }), // 口の上の明るい帯
      canopy: std(0x2d3a40, { roughness: 0.6 }),
      // 球場ごとの門の形(look)に使う色(11/19 午後 持ち主「現実のものを検索して再現」)
      archStone: std(0xd8d0bd, { roughness: 0.9 }),     // 浜風: アーチの明るい縁(模型のアーチの縁の色)
      archGreen: std(0x1e5a40, { roughness: 0.7 }),     // 浜風: アーチの上の緑の半円(模型の paint_green_dark に近い色)
      brick: std(0x8e3b2b, { roughness: 0.95 }),        // 観覧車の丘: 赤いれんがの門柱
      brickCap: std(0xc9c2b4, { roughness: 0.9 }),      // 門柱の笠石
      mullion: std(0x3b4248, { metalness: 0.5, roughness: 0.4 }),   // ガラスの枠・自動ドアの枠(暗い金属)
      glass: std(0x9fc4d6, { metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.32, depthWrite: false }),
      shutter: std(0xa9adb0, { metalness: 0.45, roughness: 0.5 }),  // 巻き上げたシャッターの箱
      steel: std(0xe8e8e4, { metalness: 0.3, roughness: 0.5 }),     // 白い鉄骨のひさし(汽笛ヶ原)
      steelRed: std(0x9b1b30, { metalness: 0.3, roughness: 0.5 }),  // えんじの鉄骨の門(観覧車の丘: 写真では、入口の上にえんじのトラスの門と GATE の字)
      tent: std(0xf6f6f4, { roughness: 0.8, side: T.DoubleSide }),   // 入口の前の白いテントのひさし(汽笛ヶ原・森かげ)
      gatePost: std(0x9aa3a8, { metalness: 0.4, roughness: 0.4 }),
      rail: std(0x7d868c, { metalness: 0.5, roughness: 0.35 }),
      patch: std(0x3a3f38, { roughness: 0.95 }),
      plaza: std(0x9a958c, { roughness: 0.95 }),      // 外の地面(舗装)
      deck: std(0xb9b2a4, { roughness: 0.9 }),        // デッキの床
      deckSide: std(0x8b8f93, { roughness: 0.8 }),
    };
    this.nightMats = [this.mats.frame];
    return this.mats;
  }
  build() {
    const T = this.T, M = this._materials();
    const parts = {};   // 材質ごとに三角形を集めて、1 つのメッシュにする(描く回数を減らす)
    const push = (mk, tris) => { (parts[mk] || (parts[mk] = [])).push(...tris); };
    const col = this.colTris;
    // 箱(中心 c、向き f・r、幅 w、奥行き d、高さ y0〜y1)を三角形にして積む
    const box = (mk, cx, cz, f, r, hw, hd, y0, y1, collide = false) => {
      const P = (sr, sf, y) => [cx + r[0] * sr * hw + f[0] * sf * hd, y, cz + r[1] * sr * hw + f[1] * sf * hd];
      const q = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
      const t = [];
      const p000 = P(-1, -1, y0), p100 = P(1, -1, y0), p110 = P(1, 1, y0), p010 = P(-1, 1, y0);
      const p001 = P(-1, -1, y1), p101 = P(1, -1, y1), p111 = P(1, 1, y1), p011 = P(-1, 1, y1);
      t.push(...q(p001, p101, p111, p011), ...q(p000, p010, p110, p100), ...q(p000, p100, p101, p001), ...q(p110, p010, p011, p111), ...q(p100, p110, p111, p101), ...q(p010, p000, p001, p011));
      push(mk, t);
      // 'sides': 当たり判定は横の面だけ(壁の上の細い面に乗れないように。乗れると格子の試験も壁の上を道にしてしまう)
      if (collide === 'sides') col.push(t.slice(36)); else if (collide) col.push(t);
    };
    // 斜めの板(a→b に沿って、横 ±hw、厚み 0)
    const slab = (mk, a, b, r, hw, dy = 0, collide = false, flip = false) => {
      const A = [a.x - r[0] * hw, a.y + dy, a.z - r[1] * hw], B = [a.x + r[0] * hw, a.y + dy, a.z + r[1] * hw];
      const C = [b.x + r[0] * hw, b.y + dy, b.z + r[1] * hw], D = [b.x - r[0] * hw, b.y + dy, b.z - r[1] * hw];
      const t = flip ? [...A, ...B, ...C, ...A, ...C, ...D] : [...A, ...C, ...B, ...A, ...D, ...C];
      push(mk, t); if (collide) col.push(t);
    };
    for (const s of this.segs) {
      if (s.colOnly) continue;
      const f = s.f, r = s.r, hw = s.w / 2, n = s.cov.length - 1;
      const at = (t) => this._v(s.a.x + (s.b.x - s.a.x) * t, s.a.y + (s.b.y - s.a.y) * t, s.a.z + (s.b.z - s.a.z) * t);
      if (s.stair) {
        // 段: 蹴上げ 0.16〜0.2 m に割る。当たり判定は段の鼻を結んだ坂
        const rise = s.b.y - s.a.y, steps = Math.max(2, Math.round(Math.abs(rise) / 0.18)), run = s.len / steps, sh = rise / steps;
        for (let i = 0; i < steps; i++) {
          const cx = s.a.x + f[0] * run * (i + 0.5), cz = s.a.z + f[1] * run * (i + 0.5), y = s.a.y + sh * (i + (sh > 0 ? 1 : 0));
          box('stair', cx, cz, f, r, hw, run / 2, Math.min(s.a.y, s.b.y) - 0.3 + (sh > 0 ? sh * i : 0), y);
          box('nosing', s.a.x + f[0] * run * (sh > 0 ? i : i + 1) + f[0] * 0.05, s.a.z + f[1] * run * (sh > 0 ? i : i + 1) + f[1] * 0.05, f, r, hw - 0.05, 0.05, y - 0.01, y + 0.012);
        }
        slab('stair', s.a, s.b, r, hw, 0.0, true);   // 当たり判定だけ使う(絵は段の箱)。見えない坂
        parts.stair.length -= 18;
      } else {
        slab('floor', s.a, s.b, r, hw, 0.035, true);
        if (s.item.def.hideFloor) parts.floor.length -= 18;   // 床の絵は出さず当たり判定だけ(浜風のベンチ: グラウンドの土とベンチの床がそのまま見える。11/19)
      }
      // 横の壁と天井: 覆われている所は天井まで、外は 1.1 m の手すりの壁
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n, p0 = at(t0), p1 = at(t1), covered = s.cov[i] && s.cov[i + 1];
        const wh = covered ? s.h : (s.item.kind === 'gate' ? 0 : 1.1);
        // nowalls: true = 壁も天井も作らない。数 n = はじめの n 区間だけ作らない(ベンチの中は壁なし、その先の地面の下のトンネルは天井あり。観覧車の丘の選手の通路)
        const nw = s.item.def.nowalls === true || (typeof s.item.def.nowalls === 'number' && s.item.segs.indexOf(s) < s.item.def.nowalls);
        if (wh > 0 && !nw) for (const sd of [-1, 1]) {
          if (s.open && s.open[i] && s.open[i][sd < 0 ? 0 : 1] && !s.item.def.walls) continue;
          const ox = r[0] * (hw + 0.1) * sd, oz = r[1] * (hw + 0.1) * sd;
          const cx = (p0.x + p1.x) / 2 + ox, cz = (p0.z + p1.z) / 2 + oz, y0 = Math.min(p0.y, p1.y) - 0.3, y1 = Math.max(p0.y, p1.y) + wh;
          // ほかの道と交わる所には壁を作らない(交わった道どうしをふさがない)
          if (this.segs.some((q) => q.item !== s.item && !q.colOnly && this._in(q, cx, (p0.y + p1.y) / 2 + 1.0, cz, 0.15))) continue;
          box(covered ? this._tone(s.item.def, 'wall', push) : 'rail', cx, cz, f, r, 0.1, s.len / n / 2 + 0.01, y0, y1, 'sides');
        }
        // 階段が上の階の床へ上がって出る道は、上の階の床より高い所に天井を張らない(天井が床の上に出っぱって段になり、乗れてしまうため。まわりの壁が手すり代わり)
        const topY = s.item.topY ?? (s.item.topY = Math.max(...s.item.segs.map((q) => Math.max(q.a.y, q.b.y))));
        const ceilOk = !((s.item.def.side === 'staff' || s.item.def.gate || /階段/.test(s.item.label)) && (p0.y + p1.y) / 2 + s.h > topY + 0.3);
        if (covered && ceilOk && !nw) {
          slab(this._tone(s.item.def, 'ceil'), p0, p1, r, hw + 0.2, s.h, true, true);
          // 天井の灯り(2 m おき)
          if (i % 4 === 0) box('lamp', (p0.x + p1.x) / 2, (p0.z + p1.z) / 2, f, r, hw * 0.55, 0.12, (p0.y + p1.y) / 2 + s.h - 0.04, (p0.y + p1.y) / 2 + s.h - 0.01);
        }
      }
    }
    // 外周の広場・デッキ(当たり判定と舗装の絵。デッキは厚み 0.4 m の縁と裏も描く)
    for (const it of this.items) {
      if (!it.plaza) continue;
      const { inner: I, outer: O, y } = it.plaza, n = I.length, t = [], side = [];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n; if (!it.plaza.closed && j === 0) break;
        const a = [I[i][0], y, I[i][1]], b = [I[j][0], y, I[j][1]], c = [O[j][0], y, O[j][1]], e = [O[i][0], y, O[i][1]];
        t.push(...a, ...c, ...b, ...a, ...e, ...c);
        if (y > 0.5) { const e2 = [e[0], y - 0.4, e[2]], c2 = [c[0], y - 0.4, c[2]]; side.push(...e, ...e2, ...c2, ...e, ...c2, ...c); const a2 = [a[0], y - 0.4, a[2]], b2 = [b[0], y - 0.4, b[2]]; side.push(...a2, ...b2, ...c2, ...a2, ...c2, ...e2); }
      }
      // vis: false = 当たり判定だけ(模型に外の地面の絵がある所。同じ高さに 2 枚描くとちらつくため)
      if (it.plaza.vis !== false) { push(y > 0.5 ? 'deck' : 'plaza', t); if (side.length) push('deckSide', side); }
      col.push(t);
    }
    // 当たり判定だけの建物(横の面)
    for (const it of this.items) {
      if (!it.solid) continue;
      for (const bx of it.solid.boxes) {
        const P = bx.poly, n = P.length, t = [], y0 = bx.y0 ?? -0.5, y1 = bx.y1 ?? 8;
        for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; t.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y0, a[1], b[0], y1, b[1], a[0], y1, a[1]); }
        col.push(t);
      }
    }
    // 床の穴をふさぐ板(当たり判定と、暗い色の床の絵)
    for (const it of this.items) {
      if (!it.patch) continue;
      const [x0, z0, x1, z1] = it.patch.box, y = it.patch.y;
      const t = [x0, y, z0, x1, y, z1, x1, y, z0, x0, y, z0, x0, y, z1, x1, y, z1];
      push('patch', t); col.push(t);
    }
    // 席の最前列の柵: 当たり判定の板(高さ 1.1 m)と、見える手すり(上の棒と 2 m おきの柱)
    for (const it of this.items) {
      if (!it.rail) continue;
      for (let i = 0; i + 1 < it.rail.length; i++) {
        const a = it.rail[i], b = it.rail[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 0.05 || L > 4) continue;
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, top = Math.max(a.y, b.y);
        if (this.segs.some((q) => !q.colOnly && this._in(q, mx, top - 0.6, mz, 0.4))) continue;
        const f = [(b.x - a.x) / L, (b.z - a.z) / L], r = [-f[1], f[0]];
        box('rail', mx, mz, f, r, 0.03, L / 2 + 0.02, top - 0.06, top, false);
        const t = []; const P = (sr, sf, y) => [mx + r[0] * sr * 0.05 + f[0] * sf * (L / 2), y, mz + r[1] * sr * 0.05 + f[1] * sf * (L / 2)];
        const q = (A, B, C, D) => [...A, ...B, ...C, ...A, ...C, ...D];
        for (const sr of [-1, 1]) t.push(...q(P(sr, -1, top - 1.6), P(sr, 1, top - 1.6), P(sr, 1, top + 0.9), P(sr, -1, top + 0.9)));   // 見えない所まで 0.9 m 高く(跳んで柵の上に乗れないように)
        col.push(t);
        if (i % 2 === 0) box('rail', a.x, a.z, f, r, 0.03, 0.03, top - 1.1, top, false);
      }
    }
    // 口の枠・案内板・ゲート
    for (const it of this.items) if (!it.hidden && !it.def.plain) this._decorate(it, box, push); else if (it.def.plain && it.def.sign) this._plainSign(it);
    for (const [mk, tris] of Object.entries(parts)) {
      if (!tris.length) continue;
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(tris, 3)); g.computeVertexNormals();
      const m = new T.Mesh(g, M[mk]); m.name = 'passage_' + mk; m.receiveShadow = true; m.castShadow = mk === 'canopy';
      if (mk === 'floor' || mk === 'nosing') { M[mk].polygonOffset = true; M[mk].polygonOffsetFactor = -2; M[mk].polygonOffsetUnits = -2; }
      this.group.add(m);
    }
    return this.group;
  }
  // 道ごとの壁・天井の色(wallColor / ceilColor。周りの内装に合わせる時。例: 白樺の木の天井)
  _tone(d, mk) {
    const c = d[mk === 'wall' ? 'wallColor' : 'ceilColor']; if (!c) return mk;
    const key = mk + '_' + c; if (!this.mats[key]) this.mats[key] = this.mats[mk].clone(), this.mats[key].color.setHex(+c);
    return key;
  }
  _decorate(it, box, push) {
    const T = this.T, d = it.def, f = it.dir, r = [-f[1], f[0]];
    const s0 = it.segs[0], sN = it.segs[it.segs.length - 1];
    const hw = s0.w / 2, h = s0.h;
    // 入口の口(はじまり): 両脇の柱・上の梁(緑)と、明るい帯
    const mouth = (p, fdir, sw, sh, sign) => {
      const rr = [-fdir[1], fdir[0]];
      for (const sd of [-1, 1]) box('frame', p.x + rr[0] * (sw / 2 + 0.2) * sd, p.z + rr[1] * (sw / 2 + 0.2) * sd, fdir, rr, 0.2, 0.25, p.y, p.y + sh + 0.35);
      box('frame', p.x, p.z, fdir, rr, sw / 2 + 0.4, 0.25, p.y + sh, p.y + sh + 0.35);
      box('frameGlow', p.x - fdir[0] * 0.27, p.z - fdir[1] * 0.27, fdir, rr, sw / 2 + 0.15, 0.02, p.y + sh + 0.05, p.y + sh + 0.3);
      if (sign) this._sign(sign, p.x - fdir[0] * 0.3, p.y + sh + 0.45, p.z - fdir[1] * 0.3, Math.atan2(-fdir[0], -fdir[1]), sw + 0.8);
    };
    if (it.kind === 'vom' && d.look === 'plate') {
      // 杜ノ丘の「N 入口」: 本物は緑の枠も光る帯も無く、口の上に紺の番号の板だけ(公式の座席ビュー・入口の写真)
      const num = d.n || ((d.label || '').match(/(\d+)\s*入口/) || [])[1];
      if (!d.noPlate) this._plate({ text: num ? `${num}` : '入口', sub: '入口', bg: d.signColor || '#1d2b5a', fg: '#ffffff', shape: 'rect' }, s0.a.x - f[0] * 0.08, s0.a.y + s0.h + 0.15, s0.a.z - f[1] * 0.08, Math.atan2(-f[0], -f[1]), 1.6, 0.6);
      const top = sN.a;
      this._sign({ pict: 'exit', big: d.back || 'コンコース・出口', small: '' }, top.x - f[0] * 0.6, top.y + 1.4, top.z - f[1] * 0.6, Math.atan2(f[0], f[1]), 2.6, true);
    } else if (it.kind === 'vom') {
      mouth(s0.a, f, s0.w, s0.h, { pict: 'stairs', big: d.label || '席', small: '席へ' });
      // 席の側の口: 最後の段の上の端に低い枠と「コンコース・出口」
      const top = sN.a, back = [-f[0], -f[1]];
      this._sign({ pict: 'exit', big: d.back || 'コンコース・出口', small: '' }, top.x - f[0] * 0.6, top.y + 1.4, top.z - f[1] * 0.6, Math.atan2(f[0], f[1]), 2.6, true);
    } else if ((it.kind === 'gate' || d.gate) && d.look === 'arch') {
      // look: 'arch' = 模型にもとからある本物らしい門(浜風のレンガのアーチと緑の扉)をそのまま開けて使う。緑の枠・ひさしの箱は作らず、
      // 番号の札だけ門の上に小さく、改札(腰の高さの柱)は門の内側(出口の 1.5 m 手前)に置く
      // archFrame: 模型にアーチの無い所(浜風の 2・6・13・16・23 号門)は、外壁の面に同じ形のアーチの枠(明るい縁と緑の半円)を描く
      if (d.archFrame && it.face) this._archFrame(it, box, push);
      const sy = d.archFrame ? s0.a.y + s0.h + s0.w / 2 + 0.55 : s0.a.y + (d.signY ?? 3.3);
      const fp = it.face ? [it.face.x - it.faceDir[0] * 0.12, it.face.z - it.faceDir[1] * 0.12] : [s0.a.x + f[0] * 2.3, s0.a.z + f[1] * 2.3];
      this._sign({ pict: 'gate', big: d.small || (d.n ? `${d.n} ゲート` : '入場口'), small: '', num: d.n }, fp[0], sy, fp[1], Math.atan2(-f[0], -f[1]), 1.8);
      this._turnstiles(it, box);
    } else if ((it.kind === 'gate' || d.gate) && d.look) {
      this._gateLook(it, box, push);
    } else if (it.kind === 'gate' || d.gate) {
      mouth(s0.a, f, s0.w, s0.h, { pict: 'gate', big: d.label || 'ゲート', small: d.small || (d.n ? `${d.n} ゲート` : '入場口'), num: d.n });
      if (d.back) this._sign({ pict: 'exit', big: d.back, small: '' }, sN.b.x + f[0] * 0.3, sN.b.y + sN.h + 0.45, sN.b.z + f[1] * 0.3, Math.atan2(f[0], f[1]), sN.w + 0.8);
      // ひさし(外へ 3 m 張り出す)
      box('canopy', s0.a.x - f[0] * 1.6, s0.a.z - f[1] * 1.6, f, r, hw + 1.2, 1.8, s0.a.y + s0.h + 0.35, s0.a.y + s0.h + 0.6);
      box('frameGlow', s0.a.x - f[0] * 1.6, s0.a.z - f[1] * 1.6, f, r, hw + 0.6, 1.4, s0.a.y + s0.h + 0.32, s0.a.y + s0.h + 0.35);
      // 改札(腰の高さの柱。当たり判定なし=間を通れる)は門の内側に(11/19 持ち主の頼み「改札は門の内側へ」)
      this._turnstiles(it, box);
      if (d.inSign) mouth(sN.b, [-f[0], -f[1]], sN.w, sN.h, null);
    } else if (it.kind === 'path') {
      if (d.label) mouth(s0.a, f, s0.w, s0.h, { pict: d.pict || 'walk', big: d.label, small: d.small || '' });
      if (d.back) this._sign({ pict: d.backPict || 'walk', big: d.back, small: '' }, sN.b.x + f[0] * 0.3, sN.b.y + sN.h + 0.45, sN.b.z + f[1] * 0.3, Math.atan2(f[0], f[1]), sN.w + 0.8);
    }
  }
  // 改札(腰の高さの柱 5 本、当たり判定なし)を門の内側に: 道の最後の区間の出口の 1.5 m 手前(短い時は真ん中)
  _turnstiles(it, box) {
    const sN = it.segs[it.segs.length - 1], fs = sN.f || it.dir, r = [-fs[1], fs[0]], L = sN.len ?? 3;
    const back = Math.min(1.5, L / 2), m = this._v(sN.b.x - fs[0] * back, sN.b.y - (sN.b.y - sN.a.y) * back / Math.max(L, 0.01), sN.b.z - fs[1] * back);
    const w = Math.min(sN.w, 6), n = w > 4.5 ? 7 : 5, hk = (n - 1) / 2;
    for (let k = -hk; k <= hk; k++) box('gatePost', m.x + r[0] * k * (w / n), m.z + r[1] * k * (w / n), fs, r, 0.08, 0.45, m.y, m.y + 1.0);
  }
  // 外壁の面の座標(face = 壁の面の足元、f = 中への向き)。u = 横(右が +)、v = 高さ、o = 壁から外へ出す量
  _facePt(it, u, v, o) { const F = it.face, f = it.faceDir, r = [-f[1], f[0]]; return [F.x + r[0] * u - f[0] * o, F.y + v, F.z + r[1] * u - f[1] * o]; }
  // 浜風: 模型のアーチと同じ形の枠(明るい縁の柱と半円、上の緑の半円)を外壁の面に描く
  _archFrame(it, box, push) {
    const s0 = it.segs[0], W = s0.w, H = s0.h, R = W / 2, B = 0.38, f = it.faceDir, r = [-f[1], f[0]];
    const F = it.face, o = 0.06, N = 16;
    for (const sd of [-1, 1]) box('archStone', F.x + r[0] * (R + B / 2) * sd - f[0] * o, F.z + r[1] * (R + B / 2) * sd - f[1] * o, f, r, B / 2, 0.1, F.y - 0.05, F.y + H, true);
    const ring = [], fan = [];
    for (let k = 0; k < N; k++) {
      const a0 = Math.PI * k / N, a1 = Math.PI * (k + 1) / N;
      const P = (rad, a, oo) => this._facePt(it, -rad * Math.cos(a), H + rad * Math.sin(a), oo);
      const i0 = P(R, a0, o + 0.1), i1 = P(R, a1, o + 0.1), e0 = P(R + B, a0, o + 0.1), e1 = P(R + B, a1, o + 0.1);
      ring.push(...i0, ...e0, ...e1, ...i0, ...e1, ...i1);
      const c = this._facePt(it, 0, H, o + 0.05), g0 = P(R, a0, o + 0.05), g1 = P(R, a1, o + 0.05);
      fan.push(...c, ...g0, ...g1);
    }
    push('archStone', ring); push('archGreen', fan);
    // 起拱の高さの横の帯(緑の半円の下の縁)
    const m = this._facePt(it, 0, H, o + 0.08);
    box('archStone', m[0], m[2], f, r, R, 0.04, H + F.y - 0.08, H + F.y);
  }
  // 球場ごとの門の形(passages.json の look。本物の写真で見た形。番号と汎用の字だけ。実在の名前・ロゴは出さない)
  //   brick: 赤いれんがの門柱 2 本と笠石、門の上に青い丸の「GATE」番号の看板(観覧車の丘)
  //   glass: 暗い金属の枠の大きなガラスの開口(左右に開いた自動ドアのガラス、上の欄間のガラス)、canopy: true で大きなひさし(白樺)
  //   number: 枠を作らず、口の上に番号の板だけ(signColor・signShape)。shutter: true で巻き上げたシャッターの箱
  //   steel: 白い鉄骨の門形(柱 2 本と梁)と番号の板(汽笛ヶ原の外の門)
  _gateLook(it, box, push) {
    const d = it.def, s0 = it.segs[0], f = it.faceDir || it.dir, r = [-f[1], f[0]], W = s0.w, H = s0.h;
    if (!it.face) it.face = this._v(s0.a.x + f[0] * 2.5, s0.a.y, s0.a.z + f[1] * 2.5), it.faceDir = f;
    const F = it.face, yaw = Math.atan2(-f[0], -f[1]);
    const label = d.signText || (d.n ? String(d.n) : '');
    const at = (u, v, o) => this._facePt(it, u, v, o);
    const plate = d.noPlate ? () => null : this._plate.bind(this);   // noPlate: 模型に番号の板がもとからある所(銀輪・潮凪)は足さない
    if (d.look === 'brick') {
      // noPillars: 模型にもとかられんがの門(gate_brick_red の棟と暗い扉)がある所は柱を足さず、その門を開けて番号の看板だけ
      if (!d.noPillars) for (const sd of [-1, 1]) {
        const p = at((W / 2 + 0.5) * sd, 0, 0.45);
        box('brick', p[0], p[2], f, r, 0.5, 0.45, F.y - 0.05, F.y + H + 0.7, 'sides');
        box('brickCap', p[0], p[2], f, r, 0.58, 0.53, F.y + H + 0.7, F.y + H + 0.86);
      }
      const p = at(0, 0, d.noPillars ? 0.12 : 0.9);
      if (d.signShape === 'band') plate({ text: label, sub: d.signSub || 'GATE', bg: d.signColor || '#1f4fa0', fg: '#ffffff', shape: 'band' }, p[0], F.y + (d.signY ?? H + 0.25), p[2], yaw, 3.6, 0.7);   // 11/20 灯台坂: 写真どおりの青い帯
      else plate({ text: label, sub: 'GATE', bg: d.signColor || '#1f5fae', fg: '#ffffff', shape: 'round' }, p[0], F.y + (d.signY ?? H + 0.25), p[2], yaw, 1.4, 1.4);
    } else if (d.look === 'glass') {
      const hw = W / 2, gh = H + (d.transom ?? 1.0), side = d.sidePane ?? 1.6;
      for (const sd of [-1, 1]) {
        let p = at((hw + 0.08) * sd, 0, 0.1); box('mullion', p[0], p[2], f, r, 0.08, 0.1, F.y, F.y + gh);
        p = at((hw + side + 0.24) * sd, 0, 0.1); box('mullion', p[0], p[2], f, r, 0.08, 0.1, F.y, F.y + gh);
        // 左右へ開いた自動ドアのガラス(壁の前に寄せた板)
        p = at((hw + 0.16 + side / 2) * sd, 0, 0.16); box('glass', p[0], p[2], f, r, side / 2, 0.015, F.y + 0.02, F.y + H - 0.02);
      }
      let p = at(0, 0, 0.1); box('mullion', p[0], p[2], f, r, hw + side + 0.32, 0.1, F.y + H, F.y + H + 0.12);
      box('mullion', p[0], p[2], f, r, hw + side + 0.32, 0.1, F.y + gh, F.y + gh + 0.14);
      p = at(0, 0, 0.12); box('glass', p[0], p[2], f, r, hw + side + 0.24, 0.015, F.y + H + 0.12, F.y + gh);
      if (d.canopy) {
        const cd = d.canopy === true ? 3.0 : d.canopy; p = at(0, 0, cd / 2 + 0.1);
        box('canopy', p[0], p[2], f, r, hw + side + 1.2, cd / 2, F.y + gh + 0.3, F.y + gh + 0.55);
      }
      p = at(0, 0, 0.2);
      if (d.signShape === 'band') plate({ text: label, sub: d.signSub || 'GATE', bg: d.signColor || '#6b3a24', fg: '#ffffff', shape: 'band' }, p[0], d.signInTransom ? F.y + H + 0.12 + (gh - H - 0.12) / 2 : F.y + gh + (d.canopy ? 0.6 : 0.2), p[2], yaw, 3.6, 0.7);   // signInTransom: 上の欄間のガラスの前に帯(白樺: 写真では入口のガラスの上に暗い帯の看板)。11/20 銀輪: 写真どおりの茶色の帯に白い丸の番号
      else plate({ text: label, sub: d.signSub || '', bg: d.signColor || '#20262b', fg: '#ffffff', shape: 'rect' }, p[0], F.y + gh + (d.canopy ? 0.6 : 0.2), p[2], yaw, 1.8, 0.7);
    } else if (d.look === 'steel') {
      const sm = d.steelCol === 'red' ? 'steelRed' : 'steel';
      if (d.truss) {   // トラスの門: 太い柱 2 本と、上に 2 本の梁の間を斜めの材でつなぐ(観覧車の丘)
        for (const sd of [-1, 1]) { const p = at((W / 2 + 0.5) * sd, 0, 0.5); box(sm, p[0], p[2], f, r, 0.3, 0.3, F.y - 0.05, F.y + H + 1.6, 'sides'); }
        let p = at(0, 0, 0.5); box(sm, p[0], p[2], f, r, W / 2 + 0.8, 0.22, F.y + H + 0.5, F.y + H + 0.68); box(sm, p[0], p[2], f, r, W / 2 + 0.8, 0.22, F.y + H + 1.42, F.y + H + 1.6);
        const nD = Math.max(3, Math.round((W + 1) / 1.0));
        for (let k = 0; k <= nD; k++) { const u = -W / 2 - 0.3 + k * (W + 0.6) / nD; p = at(u, 0, 0.5); box(sm, p[0], p[2], f, r, 0.06, 0.08, F.y + H + 0.68, F.y + H + 1.42); }
        p = at(0, 0, 0.75);
        plate({ text: label, sub: d.signSub || 'GATE', bg: d.signColor || '#9b1b30', fg: '#ffffff', shape: d.signShape || 'rect' }, p[0], F.y + H + 1.05, p[2], yaw, 2.4, 0.7);
      } else {
      for (const sd of [-1, 1]) { const p = at((W / 2 + 0.25) * sd, 0, 0.5); box(sm, p[0], p[2], f, r, 0.18, 0.18, F.y - 0.05, F.y + H + 0.9, 'sides'); }
      let p = at(0, 0, 0.5); box(sm, p[0], p[2], f, r, W / 2 + 0.45, 0.2, F.y + H + 0.5, F.y + H + 0.9);
      p = at(0, 0, 0.75);
      plate({ text: label, sub: d.signSub || 'GATE', bg: d.signColor || '#c8102e', fg: '#ffffff', shape: d.signShape || 'rect' }, p[0], F.y + H + 0.95, p[2], yaw, 1.8, 0.75);
      }
    } else {   // number
      if (d.shutter) { const p = at(0, 0, 0.18); box('shutter', p[0], p[2], f, r, W / 2 + 0.15, 0.18, F.y + H, F.y + H + 0.45); }
      const p = at(0, 0, d.shutter ? 0.4 : 0.08);
      const sh = d.signShape || 'rect', sw = sh === 'round' ? 1.2 : 1.8, shh = sh === 'round' ? 1.2 : 0.7;
      plate({ text: label, sub: d.signSub || '', bg: d.signColor || '#1d2b5a', fg: d.signFg || '#ffffff', shape: sh }, p[0], F.y + H + (d.shutter ? 0.5 : 0.15), p[2], yaw, sw, shh);
    }
    if (d.tent) {   // 入口の前の白いテントのひさし(汽笛ヶ原・森かげの写真: 入場の確かめをする所に白い長いテント)。細い柱 4 本と平らな幕
      const tw = W / 2 + (d.tent.w ?? 2.0), td = d.tent.d ?? 3.0, th = d.tent.h ?? 2.6, near = 0.6, far = near + td;
      for (const sd of [-1, 1]) for (const dd of [near + 0.1, far - 0.1]) { const p = at((tw - 0.1) * sd, 0, dd); box('mullion', p[0], p[2], f, r, 0.04, 0.04, F.y, F.y + th, 'sides'); }
      const p = at(0, 0, (near + far) / 2); box('tent', p[0], p[2], f, r, tw, td / 2, F.y + th, F.y + th + 0.12);
      const q = at(0, 0, far); box('tent', q[0], q[2], f, r, tw, 0.02, F.y + th - 0.3, F.y + th);
    }
    if (d.back) { const sN = it.segs[it.segs.length - 1]; this._sign({ pict: 'exit', big: d.back, small: '' }, sN.b.x + sN.f[0] * 0.3, sN.b.y + sN.h + 0.45, sN.b.z + sN.f[1] * 0.3, Math.atan2(sN.f[0], sN.f[1]), Math.min(sN.w + 0.8, 3.2)); }
    this._turnstiles(it, box);
  }
  // 番号の板(四角 rect か丸 round)。字は番号と汎用の字(GATE・入口)だけ。発光の材質(夜も読める)、表裏 2 枚
  _plate(o, x, y, z, yaw, wid, hgt) {
    const T = this.T, c = document.createElement('canvas'), round = o.shape === 'round';
    c.width = round ? 256 : 512; c.height = round ? 256 : Math.round(512 * hgt / wid);
    const g = c.getContext('2d'), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H); g.fillStyle = o.bg;
    if (round) { g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 4, 0, 7); g.fill(); g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 14, 0, 7); g.stroke(); }
    else { g.fillRect(0, 0, W, H); }
    if (o.shape === 'band') {   // 帯の真ん中に白い丸、その中に番号(帯の色)。横に小さく GATE
      const r0 = H * 0.42; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(W / 2, H / 2, r0, 0, 7); g.fill();
      g.fillStyle = o.bg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold ${Math.round(r0 * 1.3)}px sans-serif`; g.fillText(String(o.text ?? ''), W / 2, H / 2 + 2);
      if (o.sub) { g.fillStyle = '#ffffff'; g.font = `bold ${Math.round(H * 0.32)}px sans-serif`; g.fillText(o.sub, W / 2 + r0 + H * 0.7, H / 2 + 2); g.fillText(o.sub, W / 2 - r0 - H * 0.7, H / 2 + 2); }
    }
    g.fillStyle = o.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const text = String(o.text ?? ''), sub = o.sub || '';
    if (round) {
      if (sub) { g.font = 'bold 40px sans-serif'; g.fillText(sub, W / 2, H * 0.3); }
      let fs = 120; g.font = `bold ${fs}px sans-serif`; while (g.measureText(text).width > W * 0.7 && fs > 40) { fs -= 6; g.font = `bold ${fs}px sans-serif`; }
      g.fillText(text, W / 2, sub ? H * 0.62 : H / 2);
    } else if (o.shape !== 'band') {
      const measure = (s) => { g.font = `bold ${s}px sans-serif`; const a = g.measureText(text).width; if (!sub) return a; g.font = `bold ${Math.round(s * 0.55)}px sans-serif`; return a + 14 + g.measureText(sub).width; };
      let fs = Math.round(H * 0.72); while (measure(fs) > W * 0.86 && fs > 20) fs -= 4;
      g.font = `bold ${fs}px sans-serif`;
      if (sub) {
        const t1 = g.measureText(text).width; g.font = `bold ${Math.round(fs * 0.55)}px sans-serif`; const t2 = g.measureText(sub).width, gap = 14, x0 = W / 2 - (t1 + gap + t2) / 2;
        g.textAlign = 'left'; g.font = `bold ${fs}px sans-serif`; g.fillText(text, x0, H / 2 + 2); g.font = `bold ${Math.round(fs * 0.55)}px sans-serif`; g.fillText(sub, x0 + t1 + gap, H / 2 + fs * 0.12);
      } else g.fillText(text, W / 2, H / 2 + 2);
    }
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    const m = new T.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.7, transparent: round, alphaTest: round ? 0.5 : 0, side: T.FrontSide });
    const p = new T.Mesh(new T.PlaneGeometry(wid, hgt), m);
    p.position.set(x, y + hgt / 2, z); p.rotation.y = yaw; p.name = 'passage_sign';
    this.group.add(p);
    const q = new T.Mesh(p.geometry, m); q.position.copy(p.position); q.rotation.y = yaw + Math.PI; q.translateZ(0.02); q.name = 'passage_sign_back';
    this.group.add(q);
    return p;
  }
  _plainSign(it) {
    // 元の模型の門をそのまま使う時: 口の上に小さな光る案内だけ(夜でも入口と分かる)
    const s0 = it.segs[0], f = it.dir, d = it.def;
    const p = s0.b; const back = d.signAt ?? 2.5;
    this._sign({ pict: 'gate', big: d.label || 'ゲート', small: d.small || (d.n ? `${d.n} ゲート` : '入場口'), num: d.n }, s0.a.x + f[0] * back, s0.a.y + (d.signY ?? 3.2), s0.a.z + f[1] * back, Math.atan2(-f[0], -f[1]), 2.4);
  }
  // 案内板(絵文字に頼らない、汎用の図と字)。canvas で描いて、発光の材質(夜も読める)
  _sign(o, x, y, z, yaw, wid, low = false) {
    const T = this.T, c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = o.pict === 'gate' ? '#0f5132' : o.pict === 'exit' ? '#1b4f8a' : '#14532d'; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.strokeRect(6, 6, 500, 116);
    // 図(左の白い四角に、階段・人・門)
    g.fillStyle = '#ffffff'; g.fillRect(16, 14, 100, 100); g.fillStyle = g.strokeStyle = '#14532d'; g.lineWidth = 7;
    if (o.num) { g.font = 'bold 74px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(o.num), 66, 68); }
    else if (o.pict === 'stairs' || o.pict === 'exit') {
      g.beginPath(); g.moveTo(26, 100); for (let k = 0; k < 4; k++) { g.lineTo(26 + k * 20, 100 - k * 18); g.lineTo(26 + (k + 1) * 20, 100 - k * 18); } g.stroke();
      g.beginPath(); g.arc(78, 30, 8, 0, 7); g.fill();
      g.beginPath(); g.moveTo(76, 40); g.lineTo(70, 66); g.lineTo(82, 82); g.moveTo(70, 66); g.lineTo(58, 80); g.moveTo(74, 48); g.lineTo(90, 56); g.stroke();
    } else {
      g.beginPath(); g.arc(66, 30, 9, 0, 7); g.fill();
      g.beginPath(); g.moveTo(64, 42); g.lineTo(60, 72); g.lineTo(76, 102); g.moveTo(60, 72); g.lineTo(46, 102); g.moveTo(62, 50); g.lineTo(82, 64); g.moveTo(62, 50); g.lineTo(44, 62); g.stroke();
    }
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    const big = o.big || ''; let fs = 54; g.font = `bold ${fs}px sans-serif`; while (g.measureText(big).width > 370 && fs > 26) { fs -= 2; g.font = `bold ${fs}px sans-serif`; }
    g.fillText(big, 132, o.small ? 50 : 64);
    if (o.small) { g.font = '30px sans-serif'; g.fillStyle = '#ffe066'; g.fillText(o.small, 134, 98); }
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    const m = new T.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.7, side: T.FrontSide });   // 片面(裏から鏡文字に見えないよう、裏は別の 1 枚)
    const hgt = wid / 4;
    const p = new T.Mesh(new T.PlaneGeometry(wid, hgt), m);
    p.position.set(x, y + hgt / 2, z); p.rotation.y = yaw; p.name = 'passage_sign';
    this.group.add(p);
    // 裏向きの札(同じ字を、裏から読める向きで 2 cm 後ろに)
    const q = new T.Mesh(p.geometry, m); q.position.copy(p.position); q.rotation.y = yaw + Math.PI; q.translateZ(0.02); q.name = 'passage_sign_back';
    this.group.add(q);
    return p;
  }
  setNight(on) { for (const m of this.nightMats) m.emissiveIntensity = on ? 0.7 : 0.0; }
  // 案内(小さな地図・矢印)に使う: 近い口の一覧
  nav() {
    return this.items.map((it) => ({ kind: it.kind === 'mark' || it.def.asVom ? 'vom' : it.def.gate ? 'gate' : it.kind, existing: it.kind === 'mark', label: it.label, a: it.mouthIn && it.mouthIn.toArray(), b: it.mouthOut && it.mouthOut.toArray(), pts: it.segs.length ? [it.segs[0].a.toArray(), ...it.segs.map((q) => q.b.toArray())] : [it.mouthIn.toArray(), it.mouthOut.toArray()], dir: it.dir, n: it.def.n || null, side: it.def.side || null }));
  }
}
