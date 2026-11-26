// スタンドで捕る(11/25 持ち主「4. スタンドで捕る(観戦の延長)… どこかの客席を選べるかを決めて10球くらい飛んでくるようにして
//   良い感じに移動して取れるようにして 実況もいい感じに合わせるようにして」「4の要素はボールパークで過ごすみたいな感じのにも入れてください
//   チケット売り場とかでボールが飛んでくる権利みたいなのが売っていて … 使うと打ったボールが自分の方にボールが飛んでくる」)
//
// 2 つの入口があり、中身(打球を自分の方へ飛ばす・落下点の輪・捕る判定・実況)は同じ:
//  1) (11/25 夜 タイトルのボタンは外した。持ち主「モード要らない」「機能は残して」。begin/openPick は残すが入口なし) タイトルのモード「スタンドで捕る」: 客席を選ぶ → 観戦(watch.js)の試合の、打席ごとの打球を 10 球、自分のまわりの席へ飛ばす → 結果の画面
//  2) 「ボールパークで過ごす」: チケット売り場で「ボールが飛んでくる券」をゲームの中のお金で買う。客席で使う(B キー・ボタン)と、次の打球が自分の方へ
//
// しくみ(watch.js・defense.js・main.js は書き換えない。このファイルの中で包む):
//  - watch.nextPitch を包み、「次の打球を飛ばす」頼みがある時だけ、打席の決め球を自分の打球にする(defense.startPlay の make に、自分で解いた道筋を渡す)。
//    打球の物理は ballsim.js の predict(球場の当たり判定の上を飛び、段で跳ねる)。打者のスイング・野手の動き・ファウル/本塁打の判定・実況は defense.js のまま。
//  - 本塁打はフェンスを越えた所で defense が球を消すので、その先(スタンドに落ちて跳ねる所)は、同じ道筋をこのファイルの球で描き続ける。
//  - 捕る判定: 自分の胸の前を球が通ったら捕る(横 1.25 m・足もとから 0.2〜2.4 m、跳んでいれば 3.0 m まで)。席に落ちて跳ねた後は捕れない(落とした)。
//  - スタンドで捕る の間は試合を「自分の打球」の打席だけで進める(打球の間の待ちは、前の球が終わって 2 秒)。
import * as THREE from 'three';
import { predict, samplePath, pathDuration } from './ballsim.js';
import { BallView, ballVisScale } from './ball.js';
import { STADIUMS } from './stadiums.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const D2R = Math.PI / 180;
const P0 = () => V(-0.25, 0.95, -0.55);   // defense.startPlay の打者の打つ所(by: 'bat')
const N_BALLS = 10;
const KINEN_NEED = 6;   // 何球捕れば記念ボール(スタンドで捕る)
const TIX = { price: 2000, perDay: 3, carry: 3 };   // ボールが飛んでくる券: 値段(ゲームの中のお金)・1 日に買える枚数・持てる枚数
const ls = { get: (k, d) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 残せなくても遊べる */ } } };
const today = () => { const t = new Date(); return `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`; };

// 打球の種類。solve: 'la' は打ち出しの角度を決めて速さを解く(飛球)、'ev' は速さを決めて角度を解く(ライナー)
const KINDS = {
  hr: { name: 'ホームラン', type: 'fly', solve: 'la', la: [28, 34], rpm: 2200, bonus: 0 },
  hrHigh: { name: '高く上がったホームラン', type: 'fly', solve: 'la', la: [36, 44], rpm: 2300, bonus: 100 },
  hrLiner: { name: 'ライナーのホームラン', type: 'liner', solve: 'ev', ev: [47, 51], rpm: 1400, bonus: 300 },
  foulFly: { name: 'ファウルフライ', type: 'pop', solve: 'la', la: [48, 60], rpm: 2000, bonus: 0 },
  foulHigh: { name: '高いファウルフライ', type: 'pop', solve: 'la', la: [62, 72], rpm: 2200, bonus: 100 },
  foulLiner: { name: 'ファウルライナー', type: 'liner', solve: 'ev', ev: [30, 35], rpm: 1200, bonus: 300 },
  backHigh: { name: '後ろへの高いファウル', type: 'pop', solve: 'la', la: [70, 80], rpm: 2400, bonus: 150 },
};
// 客席の区画。a: 本塁から見た角度(度。0 = センター、+ = 一塁側)。fair: フェアの所(本塁打)、kinds: [種類, 重み]
const ZONES = [
  { k: 'lf', name: 'レフト外野席', br: 'レフト<br>外野席', a: [-44, -12], fair: true, fielder: 'LF', kinds: [['hr', 4], ['hrHigh', 3], ['hrLiner', 2]], tag: 'ホームランが来る', col: '#3b8cff' },
  { k: 'rf', name: 'ライト外野席', br: 'ライト<br>外野席', a: [12, 44], fair: true, fielder: 'RF', kinds: [['hr', 4], ['hrHigh', 3], ['hrLiner', 2]], tag: 'ホームランが来る', col: '#3b8cff' },
  { k: '3b', name: '三塁側内野席', br: '三塁側<br>内野席', a: [-115, -50], fair: false, fielder: '3B', kinds: [['foulFly', 5], ['foulHigh', 2], ['foulLiner', 3]], tag: 'ファウルとライナー', col: '#ffc23a' },
  { k: '1b', name: '一塁側内野席', br: '一塁側<br>内野席', a: [50, 115], fair: false, fielder: '1B', kinds: [['foulFly', 5], ['foulHigh', 2], ['foulLiner', 3]], tag: 'ファウルとライナー', col: '#ffc23a' },
  { k: 'bn', name: 'バックネット裏', a: [140, 220], fair: false, fielder: '1B', kinds: [['backHigh', 1]], tag: '真上から落ちる', col: '#ff4fb8' },
];
const angOf = (x, z) => Math.atan2(x, -z) / D2R;
const inZone = (Z, x, z) => { let a = angOf(x, z); if (Z.a[1] > 180 && a < 0) a += 360; return a >= Z.a[0] && a <= Z.a[1]; };
const pickW = (list, rnd = Math.random) => { const s = list.reduce((t, x) => t + x[1], 0); let r = rnd() * s; for (const [k, w] of list) { r -= w; if (r <= 0) return k; } return list[0][0]; };
const lerp = (r) => r[0] + Math.random() * (r[1] - r[0]);

class StandCatch {
  constructor(app) {
    this.a = app;
    this.mode = null;        // 'stand'(スタンドで捕る)のとき { zone, n, res: [], ... }
    this.want = null;        // 次の打席で飛ばす頼み { why: 'stand' | 'ticket' }
    this.cur = null;         // 飛んでいる自分の打球
    this.zones = null;       // 調べた区画(球場ごと)
    this.ring = null;
    this.bv = null;
    this.tix = ls.get('r4walk.sc.tix', { n: 0, day: '', bought: 0 });
    // 11/26 アプリで買った券(5・15・40 枚のまとめ売り。shop/shop.js が addPaid で足す)。ゲームの中のお金の券(1 日 3 枚・3 枚まで)とは別に数え、持てる数の上限は無い
    this.ptix = Math.max(0, Math.floor(+ls.get('r4walk.sc.ptix', 0) || 0));
    // 11/26 持ち主「ファールフライの打球取ったらボール袋にしまえるようにして」: 客席で捕った球(試合のファウル・券のファウル/ホームラン・席に飛んでくるファウル)を
    // ボール袋に入れて、いつ・どの球場で・どんな打球かを端末に覚える(r4walk.ballbag)。持ち物の窓の「ボール袋」で見る
    this.bag = ls.get('r4walk.ballbag', []);
    this.kinenN = ls.get('r4walk.sc.kinenN', 0);
    this.buildDom();
    // 別のモード(ボールパークで過ごすなど)で観戦の試合が始まったら、スタンドで捕るは終わり
    addEventListener('gamestart', () => { if (this.mode && !this._starting) this.stopMode(); });
    this.hookTitle();
    this.loop();
  }
  get W() { return this.a.watch; }
  get d() { return this.a.defense; }
  get fp() { return this.a.freeplay; }
  mmode() { const u = this.a.ui; return (u && u.app && u.app.mode) || ''; }
  get seats() { return (this.fp && this.fp.h && this.fp.h.seats) || (window.__crowd && window.__crowd.seats) || null; }

  // ---------------------------------------------------------------- 区画を調べる(球場ごとに 1 回)
  // 席があって、球が当たり判定(ネット・屋根・壁)に止められずに届く区画だけを出す
  scanZones() {
    if (this.zones) return this.zones;
    const S = this.seats; if (!S || !S.n || !this.d) return [];
    const fd = this.a.fenceDist, out = [];
    for (const Z of ZONES) {
      const list = [];
      for (let i = 0; i < S.n; i++) {
        const x = S.x[i], z = S.z[i], y = S.y[i]; if (!(y > 0.6) || y > 40) continue;
        if (!inZone(Z, x, z)) continue;
        const r = Math.hypot(x, z);
        if (Z.fair) { if (r < fd(angOf(x, z)) + 2 || r > 175) continue; } else if (r > 95) continue;
        list.push(i);
      }
      const z0 = { ...Z, n: list.length, ok: false, seat: null };
      if (list.length >= 40) {
        // 始める席: 区画の真ん中の角度のあたりで、前から 3 割くらいの列(前すぎると球が低く、後ろすぎると屋根に近い)
        const am = list.map((i) => angOf(S.x[i], S.z[i])).sort((p, q) => p - q)[list.length >> 1];
        const rs = list.map((i) => Math.hypot(S.x[i], S.z[i])).sort((p, q) => p - q);
        const rWant = rs[Math.floor(rs.length * 0.3)];
        const cand = list.slice().sort((i, j) => {
          const ci = Math.abs(angOf(S.x[i], S.z[i]) - am) * 0.6 + Math.abs(Math.hypot(S.x[i], S.z[i]) - rWant);
          const cj = Math.abs(angOf(S.x[j], S.z[j]) - am) * 0.6 + Math.abs(Math.hypot(S.x[j], S.z[j]) - rWant);
          return ci - cj;
        });
        for (const i of cand.slice(0, 24)) {
          const c = V(S.x[i], S.y[i], S.z[i]);
          let good = 0;
          for (const [kk] of Z.kinds) if (this.planAt(c, KINDS[kk], Z)) good++;
          if (good) { z0.ok = true; z0.seat = i; z0.at = c; break; }
        }
      }
      out.push(z0);
    }
    this.zones = out;
    return out;
  }
  zoneByPos(p) {
    for (const Z of ZONES) if (inZone(Z, p.x, p.z)) return Z;
    // 区画の外(アルプス・上の階など): 角度でフェアの所なら本塁打、ファウルの所ならファウルフライ
    const a = Math.abs(angOf(p.x, p.z));
    return a <= 45 ? { ...ZONES[0], k: 'any', fair: true, fielder: angOf(p.x, p.z) < 0 ? 'LF' : 'RF' } : { ...ZONES[2], k: 'any', fair: false, fielder: angOf(p.x, p.z) < 0 ? '3B' : '1B', kinds: [['foulFly', 5], ['foulHigh', 3], ['backHigh', 1]] };
  }
  inStands(p) {
    const S = this.seats; if (!S || p.y < 1.0) return false;
    const r = Math.hypot(p.x, p.z), fd = this.a.fenceDist;
    if (Math.abs(angOf(p.x, p.z)) <= 45 && r < fd(angOf(p.x, p.z)) + 0.5) return false;
    for (let i = 0; i < S.n; i += 2) if (Math.abs(S.x[i] - p.x) < 3 && Math.abs(S.z[i] - p.z) < 3 && Math.abs(S.y[i] - p.y) < 2.5) return true;
    return false;
  }

  // ---------------------------------------------------------------- 打球を解く
  // 狙いの席 c(席の点)に、種類 K の打球を落とす道筋。届かない(ネット・屋根・壁に当たる、フェア/ファウルが区画と合わない)時は null
  planAt(c, K, Z) {
    const a = this.a, d = this.d; if (!d) return null;
    const floor = a.groundAt(c.x, c.z, c.y + 1.4) ?? c.y;
    if (floor < 0.5) { this._why = 'floor'; return null; }
    const Yc = floor + 1.25;   // 捕る高さ(胸)
    const p0 = P0(), dist = Math.hypot(c.x - p0.x, c.z - p0.z);
    const dir = V(c.x - p0.x, 0, c.z - p0.z).normalize();
    const flat = { bvh: null, surfaceAt: () => 's', groundY: () => -60 };
    const back = (rpm) => new THREE.Vector3().crossVectors(dir, V(0, 1, 0)).normalize().multiplyScalar(-rpm * Math.PI / 30);
    const w = back(K.rpm);
    // 狙いの横の距離を通る時の高さ(届かなければ -99)
    const hAt = (v) => {
      const pr = predict(flat, p0, v, w.clone(), 9, { Cd: 0.35, clScale: 1.0, dt: 1 / 120 });
      for (let i = 1; i < pr.n; i++) {
        const x = pr.pts[i * 4], z = pr.pts[i * 4 + 2];
        const r1 = Math.hypot(x - p0.x, z - p0.z);
        if (r1 >= dist) { const x0 = pr.pts[i * 4 - 4], z0 = pr.pts[i * 4 - 2], r0 = Math.hypot(x0 - p0.x, z0 - p0.z), u = (dist - r0) / Math.max(1e-6, r1 - r0); return pr.pts[i * 4 - 3] + (pr.pts[i * 4 + 1] - pr.pts[i * 4 - 3]) * u; }
        if (pr.pts[i * 4 + 1] < -20) break;
      }
      return -99;
    };
    const mk = (ev, la) => { const v = dir.clone().multiplyScalar(ev * Math.cos(la * D2R)); v.y = ev * Math.sin(la * D2R); return v; };
    let v;
    if (K.solve === 'la') {
      const la = lerp(K.la); let lo = 8, hi = 70;
      if (hAt(mk(hi, la)) < Yc) { this._why = 'far'; return null; }
      for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (hAt(mk(m, la)) < Yc) lo = m; else hi = m; }
      v = mk(hi, la);
    } else {
      const ev = lerp(K.ev); let lo = -6, hi = 40;
      if (hAt(mk(ev, hi)) < Yc) { this._why = 'far'; return null; }
      for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (hAt(mk(ev, m)) < Yc) lo = m; else hi = m; }
      v = mk(ev, hi);
    }
    const path = predict(d.world, p0, v, w.clone(), 10, { Cd: 0.35, clScale: 1.0, dt: 1 / 240 });
    const fh = path.firstHit; if (!fh) { this._why = 'nohit'; return null; }
    if (Math.hypot(fh.p.x - c.x, fh.p.z - c.z) > 3.2 || fh.p.y < floor - 1.6) { this._why = `blocked@${fh.p.x.toFixed(1)},${fh.p.y.toFixed(1)},${fh.p.z.toFixed(1)}`; return null; }   // 手前のネット・壁・屋根に当たった
    // 捕る所(胸の高さ)を通る時刻
    const C = V(c.x, Yc, c.z), q = V(); let best = 1e9, tC = null;
    const iHit = Math.min(path.n - 1, Math.round(fh.t / path.dt));
    for (let i = Math.max(0, iHit - 400); i <= iHit; i++) { q.set(path.pts[i * 4], path.pts[i * 4 + 1], path.pts[i * 4 + 2]); const dd = q.distanceTo(C); if (dd < best) { best = dd; tC = i * path.dt; } }
    if (best > 0.9) { this._why = 'pass'; return null; }
    // フェア/ファウルが区画と合っているか(落ちた所で)
    const la2 = angOf(fh.p.x, fh.p.z), fair = Math.abs(la2) <= 45 && Math.hypot(fh.p.x, fh.p.z) > a.fenceDist(la2);
    if (Z && Z.fair !== fair) { this._why = 'fairmix'; return null; }
    if (!fair && Math.abs(la2) < 46.5) { this._why = 'line'; return null; }   // 線のすぐ外(フェアかファウルか紛らわしい)は使わない
    return { path, v, w, p0, type: K.type, K, T: V(c.x, floor, c.z), Yc, tHit: fh.t, tCatch: tC, fair, Z };
  }
  // 自分のまわりの席を選んで打球を解く。around: 中心(自分の位置)、r: [近い, 遠い]
  planNear(around, Z, r) {
    const S = this.seats; if (!S) return null;
    const cand = [];
    for (let i = 0; i < S.n; i++) {
      const dx = S.x[i] - around.x, dz = S.z[i] - around.z, dd = Math.hypot(dx, dz);
      if (dd < r[0] || dd > r[1] || Math.abs(S.y[i] - around.y) > 4.5) continue;
      cand.push(i);
    }
    for (let k = cand.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [cand[k], cand[j]] = [cand[j], cand[k]]; }
    for (const i of cand.slice(0, 10)) {
      const pl = this.planAt(V(S.x[i], S.y[i], S.z[i]), KINDS[pickW(Z.kinds)], Z.k === 'any' ? null : Z);
      if (pl) return pl;
    }
    // 近くで見つからない: 自分の足もとへ(どの種類でも)
    for (const [kk] of Z.kinds) { const pl = this.planAt(around.clone().setY(around.y + 0.3), KINDS[kk], Z.k === 'any' ? null : Z); if (pl) return pl; }
    return null;
  }

  // ---------------------------------------------------------------- 試合に差し込む(watch.nextPitch を包む)
  patchWatch() {
    const W = this.W; if (!W || W._scPatched) return;
    W._scPatched = true;
    const self = this, orig = W.nextPitch, upd = W.update;
    W.nextPitch = function () {
      const d = this.d, g = d.g;
      if (!this.on || !g || g.over || (!self.want && !self.mode)) return orig.call(this);
      if (this.gapUntil == null) { if (g.outs >= 3) return orig.call(this); this.gap(self.mode ? 0.8 : 1.0 + d.rng() * 0.6); return; }
      if (this.simT < this.gapUntil) { d.wait = this.gapUntil - this.simT + 0.05; return; }
      if (!self.want) { if (self.mode) { d.wait = 0.25; return; } return orig.call(this); }   // スタンドで捕る: 次の球の頼みが来るまで試合を止めて待つ
      if (g.outs >= 3) return orig.call(this);
      const plan = self.makePlan();
      if (!plan) { if (self.mode) { d.wait = 0.5; return; } return orig.call(this); }   // 解けない(動いている途中など): 少し待って解き直す
      this.gapUntil = null; this.pcWait = null;
      if (this.firstPitch) { this.firstPitch = false; d.umpCall('play', 0); d.say(['play_ball'], { maxWait: 1 }); }
      if (!this.paOpen) {
        g.pa++; g.balls = 0; g.strikes = 0; g.hand = d.rng() < 0.35 ? 'L' : 'R';
        this.paOpen = true; d.layRunners();
        if (d.batter && d.batter.setNumber) d.batter.setNumber(String(d.batterNum()));
      }
      this.stats.pitches++; this.pcState().n++;
      d.updateHUD();
      self.launch(plan);
    };
    W.update = function (dt) { const r = upd.call(this, dt); try { self.tick(dt); } catch (e) { console.warn('standcatch', e); } return r; };
  }
  makePlan() {
    const why = this.want && this.want.why, pp = this.a.player.pos;
    if (why === 'stand') {
      const M = this.mode, i = M.n;   // 0 から。だんだん遠く
      const r = [Math.max(0.4, i * 0.45), 3.2 + i * 0.8];
      return this.planNear(pp, M.zone, r);
    }
    if (!this.inStands(pp)) return null;
    return this.planNear(pp, this.zoneByPos(pp), [0.8, 4.5]);   // 券: 近め(1〜4.5 m)
  }
  launch(plan) {
    const d = this.d, W = this.W, why = this.want.why;
    this.want = null;
    const Z = plan.Z || this.zoneByPos(plan.T);
    d.startPlay({ fielder: Z.fielder || '1B', L: 0.5, by: 'bat', type: plan.fair ? 'fly' : 'foulfly', sitT: 0, make: () => ({ path: plan.path, type: plan.type, v: plan.v, w: plan.w, p0: plan.p0 }) });
    const pl = d.play;
    for (const k of Object.keys(d.fig || {})) if (d.fig[k]) d.fig[k].noCatchUntil = 99;
    pl.myLock = true;   // 見えない捕手(観戦の操作の人)も捕らない(本塁の真上を通る後ろへのファウルを、打った直後に捕っていた)   // 野手はスタンドの球を捕らない(フェンス・ネットの手前で見送る)
    if (this.fp) this.fp.caughtPlay = pl;   // freeplay.js の「試合のファウルを捕った」と二重にしない
    this.cur = { pl, plan, why, t: null, tPrev: 0, caught: false, missed: false, done: false, at0: this.a.player.pos.clone(), said: false, endAt: null };
    W._scLast = { kind: plan.K.name, fair: plan.fair, tHit: +plan.tHit.toFixed(2), d: +Math.hypot(plan.T.x - this.a.player.pos.x, plan.T.z - this.a.player.pos.z).toFixed(1) };
  }

  // ---------------------------------------------------------------- 毎こま(観戦の update の後)
  tick(dt) {
    const C = this.cur, d = this.d, a = this.a;
    if (this.mode && this.mode.next != null) { this.mode.next -= dt; if (this.mode.next <= 0) { this.mode.next = null; if (this.mode.n < N_BALLS) this.want = { why: 'stand' }; else this.finish(); } }
    if (!C) return;
    const pl = C.pl, path = C.plan.path;
    const live = d.play === pl && d.ball && d.ball.path === path;
    if (C.t == null) { if (!live) { if (d.play !== pl) this.endBall(true); return; } C.t = pl.t - d.ball.t0; C.tPrev = C.t; this.onLaunch(); }
    else if (live) C.t = pl.t - d.ball.t0; else C.t += dt;
    // 自分の球(defense が描かなくなった後: 本塁打でフェンスを越えた・プレーが終わった)
    const p = V();
    if (!C.caught) {
      samplePath(path, C.t, p);
      const mine = !(live && d.ballView.mesh.visible);
      if (!this.bv) this.bv = new BallView(a.scene);
      if (mine && C.t < Math.min(pathDuration(path), C.plan.tHit + 3.0)) {
        this.bv.show(true); this.bv.update(p, dt, a.camera, 0.022, 0.25);
        const dd = p.distanceTo(a.camera.position); const s = ballVisScale(dd, a.camera); this.bv.mesh.scale.setScalar(s); this.bv.fitDot(p, dd, s, a.camera);
      } else this.bv.show(false);
    }
    // 捕る(席に落ちる前だけ)
    if (!C.caught && !C.missed) {
      const pp = a.player.pos, sit = this.mmode() === 'sit', q = V();
      for (let t = Math.max(0, C.tPrev); t <= C.t + 1e-6; t += 1 / 120) {
        if (t > C.plan.tHit + 0.02) break;
        samplePath(path, t, q);
        const dh = Math.hypot(q.x - pp.x, q.z - pp.z), hb = q.y - pp.y;
        const top = sit ? 2.0 : a.player.onGround ? 2.4 : 3.0;
        if (dh <= (sit ? 1.0 : 1.25) && hb >= 0.2 && hb <= top) { this.onCatch(q, t); break; }
      }
      if (!C.caught && C.t > C.plan.tHit + 0.05) this.onMiss();
    }
    C.tPrev = C.t;
    this.updateRing();
    if (C.endAt == null && (C.caught || C.missed)) C.endAt = C.t + (C.caught ? 0.2 : 2.2);
    if (C.endAt != null && C.t >= C.endAt) this.endBall(false);
  }
  onLaunch() {
    const C = this.cur, s = this.a.sound, K = C.plan.K;
    // 実況: ファウルは「スタンドの方へ」(foul_fly)と場内放送の「ファウルボールにご注意ください」、本塁打は defense.js の「伸びる・入った」に任せる
    if (!C.plan.fair) {
      if (s.voice) s.voice(['foul_fly'], { maxWait: 0.9 });
      if (s.paSay && (this._paT == null || performance.now() - this._paT > 25000)) { this._paT = performance.now(); s.paSay(Math.random() < 0.5 ? 'audio/pa/foul_caution.mp3' : 'audio/pa/foul_caution_2.mp3', 1.2); }
    }
    // 11/26 持ち主「飛んで来たら変な文字要らない」: 券の球は文字を出さない(球・音・実況で分かる)。スタンドで捕るの 10 球だけ区画の名前を出す
    if (this.mode) { this.flash(K.name, 'in'); this.mode.lastKind = K.name; }
  }
  onCatch(q, t) {
    const C = this.cur, d = this.d, a = this.a, s = a.sound, pl = C.pl;
    C.caught = true; C.t = t;
    if (this.bv) this.bv.show(false);
    if (d.play === pl && d.ball && d.ball.path === C.plan.path) {
      d.ball = null; d.ballView.show(false); if (d.shadow) d.shadow.visible = false;
      if (pl.endT == null && !pl.foulCalled && !pl.hr) { if (C.plan.fair) d.homeRun(pl); else d.foulCall(pl); }
    }
    if (s.mittMine) s.mittMine(); else if (s.mitt) s.mitt(q);
    const pp = a.player.pos, moved = Math.min(12, Math.hypot(pp.x - C.at0.x, pp.z - C.at0.z)), jump = !a.player.onGround;
    const nice = moved >= 4 || jump || C.plan.type === 'liner';
    const pts = Math.round((500 + 60 * moved + C.plan.K.bonus + (jump ? 300 : 0)) / 10) * 10;
    C.res = { caught: true, nice, pts, kind: C.plan.K.name, moved: +moved.toFixed(1), jump };
    // 客席の歓声と実況(「スタンドが沸きました!」など crowd_roar。自分が捕ったので野手の「ナイスキャッチ」は使わない)
    if (s.crowd) s.crowd(nice ? 'big' : 'cheer', nice ? 1 : 0.7);
    if (s.voice) s.voice(['crowd_roar'], { cut: !C.plan.fair, allowRepeat: true, maxWait: 1.6, delay: C.plan.fair ? 0.6 : 0.25 });
    if (C.why === 'stand') this.flash(nice ? 'ナイスキャッチ!' : 'キャッチ!', 'ok', `+${pts}`);
    if (C.why === 'ticket') { this.giveKinen(false); this.bagAdd(C.plan.fair ? 'hr' : 'foul', 'ticket'); }   // 11/26 券の球は大きな文字を出さず、ボール袋へ入れて小さく知らせる
  }
  onMiss() {
    const C = this.cur, s = this.a.sound;
    C.missed = true;
    C.res = { caught: false, nice: false, pts: 0, kind: C.plan.K.name };
    if (s.crowd) s.crowd('sigh', 0.45);
    if (this.mode) this.flash(C.plan.fair ? '届かなかった…' : '落とした…', 'ng');
    if (C.why === 'ticket' && this.fp) this.fp.say('惜しい…', null, { must: true, ms: 1400 });
  }
  endBall(lost) {
    const C = this.cur; this.cur = null;
    if (this.bv) this.bv.show(false);
    if (this.ring) this.ring.visible = false;
    this.setHud();
    if (!C) return;
    if (lost && !C.res) C.res = { caught: false, nice: false, pts: 0, kind: C.plan.K.name, lost: true };
    if (C.why === 'stand' && this.mode) { this.mode.res.push(C.res); this.mode.n++; this.mode.next = this.mode.n >= N_BALLS ? 1.2 : 2.0; this.setHud(); }
  }
  // 落下点の輪(設定の「落下点」r4walk.fallMark が on の時だけ)。間に合いそうなら金、遠ければだいだい
  updateRing() {
    const C = this.cur, a = this.a;
    const on = !!(C && C.t != null && !C.caught && !C.missed && ls.get('r4walk.fallMark', 'on') !== 'off');
    if (!this.ring) {
      const g = new THREE.Group(), mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
      const r1 = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.1, 40), mat(0xffd84a, 0.95)), r2 = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.22, 40), mat(0x3a1a05, 0.8)), dot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), mat(0xffffff, 0.9));
      for (const m of [r1, r2, dot]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 30; g.add(m); }
      g.visible = false; a.scene.add(g); this.ring = g; this.ringM = r1.material;
    }
    this.ring.visible = on;
    if (!on) { if (C && this.mode) this.setHud(); return; }
    const T = C.plan.T; this.ring.position.set(T.x, T.y + 0.06, T.z);
    const pp = a.player.pos, dist = Math.hypot(pp.x - T.x, pp.z - T.z), left = Math.max(0, C.plan.tCatch - C.t);
    const ok = dist / 6.5 <= left + 0.1 || dist < 1.2;
    this.ringM.color.setHex(ok ? 0xffd84a : 0xff7a2a);
    const k = 1 + 0.08 * Math.sin(performance.now() / 120); this.ring.scale.set(k, 1, k);
    this.setHud(dist);
  }

  // ---------------------------------------------------------------- スタンドで捕る(モード)
  begin(zoneK) {
    const a = this.a, Z = (this.scanZones() || []).find((z) => z.k === zoneK && z.ok); if (!Z) return;
    this.hidePick(); this.hideResult();
    const ui = a.ui; if (ui && ui.sel) ui.sel.mode = 'stand';
    a.startMode({ mode: 'stand', time: (ui && ui.sel && ui.sel.time) || 'day', view: (ui && ui.sel && ui.sel.view) || '3p' });
    const S = this.seats, i = Z.seat;
    a.placeAt(S.x[i], S.z[i], 0, 0, 1.2, S.y[i] + 1.6);
    this.patchWatch();
    this.mode = { zone: Z, n: 0, res: [], next: 3.0, t0: performance.now() };
    this.want = null; this.cur = null;
    this._starting = true; try { this.W.start(); } finally { this._starting = false; }
    if (this.fp) { this.fp.foulT = 1e9; this.fp.tktOn = false; }
    document.body.classList.add('scMode');
    const h = this.fp && this.fp.h; if (h && h.lockPointer) h.lockPointer();
    this.flash(Z.name, 'in', `${N_BALLS}球 飛んできます`);
    this.setHud();
    try { if (a.sound && a.sound.crowd) a.sound.crowd('applause', 0.3); } catch (e) { /* 音なし */ }
  }
  stopMode() {
    if (!this.mode) return;
    this.mode = null; this.want = null;
    if (this.cur) { this.cur = null; }
    if (this.bv) this.bv.show(false);
    if (this.ring) this.ring.visible = false;
    if (this.fp) this.fp.foulT = 40;
    document.body.classList.remove('scMode');
    clearTimeout(this._flT); this.elFlash.className = '';
    this.setHud();
  }
  finish() {
    const M = this.mode; if (!M) return;
    const a = this.a, res = M.res, n = res.filter((r) => r.caught).length, nice = res.filter((r) => r.nice).length, pts = res.reduce((t, r) => t + (r.pts || 0), 0);
    const key = `r4walk.sc.best.${(a.ui && a.ui.app && a.ui.app.stadium) || ''}.${M.zone.k}`, best = ls.get(key, null), newBest = !best || pts > best.pts;
    if (newBest) ls.set(key, { pts, n, at: Date.now() });
    const kinen = n >= KINEN_NEED; if (kinen) this.giveKinen(false);
    this.lastResult = { n, nice, pts, of: res.length, best: newBest ? pts : best.pts, newBest, kinen, zone: M.zone.k, kinds: res.map((r) => r.kind) };
    if (a.ui && a.ui.app && a.ui.app.setOverlay) a.ui.app.setOverlay(true);
    const h = this.fp && this.fp.h; if (h && h.releasePointer) h.releasePointer(); else try { document.exitPointerLock(); } catch (e) { /* なし */ }
    this.showResult(this.lastResult, M.zone);
  }
  giveKinen(hold) {
    this.kinenN++; ls.set('r4walk.sc.kinenN', this.kinenN);
    const fp = this.fp; if (!fp) return;
    fp.owned = fp.owned || {}; fp.owned.kinen = 1; ls.set('r4walk.fp.owned', fp.owned);
    if (hold) { try { fp.stow(true); fp.hold('kinen'); } catch (e) { /* 持てなくても数は残る */ } fp.say('記念ボールを手に入れた', `これまでに ${this.kinenN} 個`, { must: true, ms: 2600 }); }
  }

  // ---------------------------------------------------------------- ボール袋(11/26)
  stadiumId() { try { const q = new URLSearchParams(location.search).get('stadium'); if (q && STADIUMS.some((x) => x.id === q)) return q; const s = JSON.parse(localStorage.getItem('r4walk.sel') || '{}'); return STADIUMS.some((x) => x.id === s.stadium) ? s.stadium : 'koshien'; } catch (e) { return 'koshien'; } }
  // kind: 'foul' | 'hr'、how: 'game'(試合のファウル)| 'ticket'(券)| 'seat'(席に飛んでくるファウル)。quiet: 知らせは呼んだ側(お金の札)に任せる
  bagAdd(kind, how, quiet) {
    const g = this.d && this.d.g;
    this.bag.push({ t: Date.now(), st: this.stadiumId(), kind, how, inn: g ? `${g.inning}回${g.half === 'top' ? '表' : '裏'}` : null });
    while (this.bag.length > 300) this.bag.shift();
    ls.set('r4walk.ballbag', this.bag);
    if (!quiet && this.fp) this.fp.say(`${kind === 'hr' ? 'ホームランボール' : 'ファウルボール'}をボール袋へ`, null, { must: true, ms: 1500 });
    return this.bag.length;
  }
  openBallBag() {
    const fp = this.fp; if (!fp) return;
    const nm = (id) => (STADIUMS.find((x) => x.id === id) || {}).name || id;
    const howT = { game: '試合のファウル', ticket: '券で飛んできた球', seat: '席に飛んできた球' };
    const hr = this.bag.filter((b) => b.kind === 'hr').length;
    const rows = [{ head: `${this.bag.length} 球(ホームラン ${hr}・ファウル ${this.bag.length - hr})` }];
    for (const b of this.bag.slice().reverse().slice(0, 60)) {
      const d = new Date(b.t), dt = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
      rows.push({ label: `${b.kind === 'hr' ? 'ホームラン' : 'ファウル'} ・ ${nm(b.st)}`, sub: `${dt}${b.inn ? ' ' + b.inn : ''} ・ ${howT[b.how] || ''}`, tag: '', off: true, run: () => {} });
    }
    if (!this.bag.length) rows.push({ label: '空です(客席で捕った球が入ります)', tag: '', off: true, run: () => {} });
    if (this.kinenN > 0) rows.push({ label: `前に捕った記念ボール ${this.kinenN} 個`, tag: '', off: true, run: () => {} });
    rows.push({ label: 'もどる', tag: '', run: () => { fp.closeSheet(); fp.openBagSimple(); } });
    fp.sheet('ボール袋', rows);
  }
  // ---------------------------------------------------------------- ボールが飛んでくる券(ボールパークで過ごす)
  tixDay() { if (this.tix.day !== today()) { this.tix.day = today(); this.tix.bought = 0; ls.set('r4walk.sc.tix', this.tix); } }
  buyTix() {
    const fp = this.fp; this.tixDay();
    if (this.tix.bought >= TIX.perDay) { fp.closeSheet(); fp.say(`今日はもう買えません(1日 ${TIX.perDay} 枚まで)`, null, { must: true }); return false; }
    if (this.tix.n >= TIX.carry) { fp.closeSheet(); fp.say(`券は ${TIX.carry} 枚までしか持てません`, null, { must: true }); return false; }
    if (!fp.spend(TIX.price)) { fp.closeSheet(); fp.say('お金が足りません', null, { must: true }); return false; }
    this.tix.n++; this.tix.bought++; ls.set('r4walk.sc.tix', this.tix);
    fp.closeSheet(); fp.say('ボールが飛んでくる券を買った', '客席で「券を使う」(PC は B)', { must: true, ms: 2600 });
    if (fp.h.sound.sfx) fp.h.sound.sfx('base_step', { gain: 0.3, rate: 1.5 });
    return true;
  }
  tixRow() {
    this.tixDay();
    const left = TIX.perDay - this.tix.bought, full = this.tix.n >= TIX.carry;
    return { label: 'ボールが飛んでくる券', sub: `持っている ${this.tix.n} 枚${this.ptix ? `(ほかに買った券 ${this.ptix} 枚)` : ''}${left <= 0 ? '・今日は売り切れ' : full ? '・これ以上持てない' : ''}`, price: TIX.price, off: left <= 0 || full, run: () => this.fp.confirmBuy('ボールが飛んでくる券', TIX.price, () => this.buyTix()) };
  }
  tixAll() { return this.tix.n + this.ptix; }
  // 11/26 アプリで買った券を足す(shop/shop.js。購入の記録は shop.js が持ち、同じ購入で二度足さない)
  addPaid(k) { k = Math.floor(+k || 0); if (k <= 0) return this.ptix; this.ptix += k; ls.set('r4walk.sc.ptix', this.ptix); return this.ptix; }
  // アプリ版のまとめ売りの行(チケット売り場の窓。ブラウザ版には出さない)
  packRow() { const S = window.__bpStore; return S && S.openShop ? { label: 'ボールが飛んでくる券のまとめ売り', sub: '5 枚・15 枚・40 枚(1 日の枚数の決まりの外)', tag: '›', run: () => { this.fp.closeSheet(); S.openShop('tix'); } } : null; }
  canUseTix() {
    const W = this.W; return !!(W && W.on && !this.mode && this.tixAll() > 0 && !this.want && !this.cur && /^(walk|sit)$/.test(this.mmode()) && this.inStands(this.a.player.pos));
  }
  useTix() {
    if (!this.canUseTix()) { if (this.fp && this.tixAll() > 0 && this.W && this.W.on && !this.inStands(this.a.player.pos)) this.fp.say('券は客席で使えます', null, { must: true }); return false; }
    // 今いる所に飛ばせるかを先に確かめる(屋根の下・ネットの裏などは飛ばせない。その時は券を減らさない)
    if (!this.planNear(this.a.player.pos, this.zoneByPos(this.a.player.pos), [0.8, 4.5])) { if (this.fp) this.fp.say('ここには飛ばせません(屋根やネットの陰)', '少し動いてから使ってください', { must: true }); return false; }
    this.patchWatch();
    let paid = false;
    if (this.tix.n > 0) { this.tix.n--; ls.set('r4walk.sc.tix', this.tix); } else { this.ptix--; paid = true; ls.set('r4walk.sc.ptix', this.ptix); }   // ゲームの中のお金の券から先に使う
    this.want = { why: 'ticket', paid };
    if (this.fp) this.fp.say('券を使った', '次の打球があなたの方へ', { must: true, ms: 2400 });
    try { this.a.sound.crowd('chime'); } catch (e) { /* 音なし */ }
    return true;
  }
  // スタンドで捕るの間と、券の球を待つ・飛んでいる間は、自分のまわりの観客を広め(2.4 m)に消す(main.js の getHide は 1.4 m。走る所と、後ろからの視点の前をあける)
  hookCrowd() {
    const c = window.__crowd; if (!c || c._scHide || !c.getHide) return; c._scHide = true;
    const o = c.getHide; c.getHide = () => { const h = o(); if (h && (this.mode || this.cur || this.want)) h[3] = Math.max(h[3], 2.4); return h; };
  }
  hookFreeplay() {
    const fp = this.fp; if (!fp || fp._scHooked) return; fp._scHooked = true;
    const self = this, oTicket = fp.openTicket, oSheet = fp.sheet, oBag = fp.openBagSimple;
    // チケット売り場の窓に「ボールが飛んでくる券」の行を足す(入場のチケットを持っている時も売る)
    fp.sheet = function (title, rows, note) {
      if (self._inject) { self._inject = false; const i = rows.findIndex((r) => /やめる/.test(r.label || '')); const add = [self.tixRow(), self.packRow()].filter(Boolean); if (i >= 0) rows.splice(i, 0, ...add); else rows.push(...add); }
      if (self._injectBag) {
        self._injectBag = false;
        if (self.tixAll() > 0 || self.kinenN > 0 || self.bag.length) {
          rows = rows.filter((r) => !/^空です/.test(r.label || ''));
          if (self.tixAll() > 0) { rows.push({ head: '券' }); rows.push({ label: `ボールが飛んでくる券 ×${self.tixAll()}`, acts: [{ t: '使う', main: true, run: () => { fp.closeSheet(); self.useTix(); } }], run: () => { fp.closeSheet(); self.useTix(); } }); }
          // 11/26 ボール袋(捕った球)。前の「捕った記念ボール N 個」の行はボール袋の中へ
          rows.push({ head: 'ボール袋' }, { label: `捕った球 ${self.bag.length + (self.bag.length ? 0 : self.kinenN)} 球`, tag: '›', run: () => self.openBallBag() });
        }
      }
      return oSheet.call(this, title, rows, note);
    };
    fp.openTicket = function () {
      if (this.simple && this.ticket) { this.sheet('チケット売り場', [{ label: '入場チケット(持っています)', tag: '', off: true, run: () => {} }, self.tixRow(), ...[self.packRow()].filter(Boolean), { label: 'やめる', tag: '', run: () => this.closeSheet() }], `券は客席で使うと、次の打球が自分の方へ飛んできます(1日 ${TIX.perDay} 枚まで)`); return; }
      self._inject = true; try { return oTicket.call(this); } finally { self._inject = false; }
    };
    // 11/26 席・試合のファウルを捕った(freeplay.js の realFoul・席に飛んでくる球): 手に持たせずにボール袋へ入れる。知らせはお金の小さな札に「ボール袋へ」を足すだけ
    const oEarn = fp.earn;
    fp.earn = function (n, why) {
      if (/ファウルボールを捕った/.test(why || '')) {
        self.bagAdd('foul', /試合/.test(why) ? 'game' : 'seat', true);
        const r = oEarn.call(this, n, 'ファウルボールを捕った・袋へ');   // 左下のお金の札は 14 字まで(目標の「ファウルボールを捕った」も数えられる形のまま)
        if (this.held && this.held.id === 'ball') { this.heldRoot.remove(this.held.mesh); this.held = null; }
        return r;
      }
      return oEarn.call(this, n, why);
    };
    if (oBag) fp.openBagSimple = function () { self._injectBag = true; try { return oBag.call(this); } finally { self._injectBag = false; } };
  }

  // ---------------------------------------------------------------- 画面
  buildDom() {
    const mk = (tag, id, cls, html) => { const e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; if (html) e.innerHTML = html; document.body.appendChild(e); return e; };
    const head = (sub, icon) => `<div class="scLogo"><i class="scFw l"></i><i class="scFw r"></i><b>スタンドで捕る</b></div><div class="scSub"><i class="scI ${icon}"></i>${sub}</div>`;
    this.elPick = mk('section', 'scPick', 'scScreen hide', `${head('客席を選ぶ', 'seat')}
      <div class="scPanel"><p class="scLead">キャッチに挑戦する客席を選んでください</p><div class="scMap"><canvas></canvas><div class="scPins"></div></div>
      <div class="scInfo"></div><button class="scGo" disabled>この席でスタート</button><button class="scBack">タイトルへ戻る</button></div>`);
    this.elRes = mk('section', 'scResult', 'scScreen hide', `${head('プレイ結果', 'ball')}
      <div class="scPanel"><div class="scRibbon">結果発表!</div><div class="scBig"></div><div class="scTable"></div><div class="scReward"><div class="scRwHead">獲得報酬</div><i class="scBall"></i><div class="scRwName"></div></div>
      <div class="scRow"><button class="scGo again">もう一度</button><button class="scBlue change">席を変える</button></div><button class="scBack">タイトルへ</button></div>`);
    this.elHud = mk('div', 'scHud', 'hide', '<b></b><span></span>');
    this.elFlash = mk('div', 'scFlash', '', '<b></b><small></small>');
    this.elTix = mk('button', 'scTix', 'hide', '<i></i><b>券を使う</b><small></small>'); this.elTix.type = 'button';
    const tap = (el, fn) => { el.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); };
    tap(this.elPick.querySelector('.scGo'), () => { if (this.pickK) this.begin(this.pickK); });
    tap(this.elPick.querySelector('.scBack'), () => { this.hidePick(); const ui = this.a.ui; if (ui) ui.show('title', true); });
    tap(this.elRes.querySelector('.again'), () => { const k = this.lastResult && this.lastResult.zone; this.hideResult(); this.begin(k); });
    tap(this.elRes.querySelector('.change'), () => { this.hideResult(); this.toTitleQuiet(); this.openPick(); });
    tap(this.elRes.querySelector('.scBack'), () => { this.hideResult(); this.toTitleQuiet(); const ui = this.a.ui; if (ui) ui.show('title', true); });
    tap(this.elTix, () => this.useTix());
    this.elTix.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.useTix(); }, { passive: false });
    addEventListener('keydown', (e) => { if (e.code === 'KeyB' && !e.repeat && this.canUseTix() && !(this.a.overlay)) { e.preventDefault(); this.useTix(); } });
  }
  toTitleQuiet() { this.stopMode(); try { this.a.toTitle(); } catch (e) { console.warn(e); } }
  hookTitle() {
    const modes = document.getElementById('modes'); if (!modes) return;
    let b = modes.querySelector('[data-mode="stand"]');
    if (b) b.classList.remove('hide');
    const vis = modes.querySelectorAll('.mode:not(.hide)').length; modes.dataset.n = String(vis);
    // ui.js の押した時の処理(設定の画面へ)より先に受けて、客席を選ぶ画面を開く
    modes.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('[data-mode="stand"]'); if (!t) return; e.stopPropagation(); e.preventDefault(); this.openPick(); }, true);
    // 一時停止の「最初から」(ui.go)
    const ui = this.a.ui; if (ui && !ui._scGo) { ui._scGo = true; const og = ui.go.bind(ui); ui.go = (...x) => { if (this.mode && ui.sel && ui.sel.mode === 'stand') { const k = this.mode.zone.k; this.stopMode(); return this.begin(k); } return og(...x); }; }
  }
  openPick() {
    const a = this.a, ui = a.ui;
    if (!a.ready) return;
    if (ui) { for (const s of ['title', 'posScreen', 'setScreen', 'stadiumScreen', 'panel', 'result', 'credits']) { const e = document.getElementById(s); if (e) e.classList.add('hide'); } if (ui.app && ui.app.setOverlay) ui.app.setOverlay(true); }
    this.elPick.classList.remove('hide');
    { const ap = ui && ui.app, nm = ap && ap.stadiumNames ? ap.stadiumNames[ap.stadium] : ''; this.elPick.querySelector('.scLead').textContent = `${nm ? nm + ' ・ ' : ''}キャッチに挑戦する客席を選んでください`; }
    const Zs = this.scanZones();
    this.drawMap(Zs);
    const ok = Zs.filter((z) => z.ok);
    if (!this.pickK || !ok.find((z) => z.k === this.pickK)) this.pickK = ok.length ? (ok.find((z) => z.k === '1b') || ok[0]).k : null;
    this.refreshPick();
  }
  hidePick() { this.elPick.classList.add('hide'); }
  refreshPick() {
    const Zs = this.zones || [];
    this.elPick.querySelectorAll('.scPin').forEach((b) => b.classList.toggle('on', b.dataset.k === this.pickK));
    const Z = Zs.find((z) => z.k === this.pickK), info = this.elPick.querySelector('.scInfo');
    const best = Z ? ls.get(`r4walk.sc.best.${(this.a.ui && this.a.ui.app && this.a.ui.app.stadium) || ''}.${Z.k}`, null) : null;
    info.innerHTML = Z ? `<b>${Z.name}</b><span>${Z.tag}${best ? ` ・ ベスト ${best.pts} 点` : ''}</span>` : '<span>この球場には選べる客席がありません</span>';
    this.elPick.querySelector('.scGo').disabled = !Z;
    this.drawMap(Zs);
  }
  // 球場を上から見た図(席の点・フェンス・内野)。席の点の色は区画ごと、選んでいる区画は明るく
  drawMap(Zs) {
    const S = this.seats, cv = this.elPick.querySelector('canvas'), box = this.elPick.querySelector('.scMap'); if (!S || !cv) return;
    const W = box.clientWidth || 340, H = box.clientHeight || 300, dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    // 範囲: 本塁から 140 m まで(区画の席が入る所)
    let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
    for (let i = 0; i < S.n; i += 3) { const x = S.x[i], z = S.z[i]; if (Math.hypot(x, z) > 150) continue; mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mnz = Math.min(mnz, z); mxz = Math.max(mxz, z); }
    if (mnx > mxx) { mnx = -120; mxx = 120; mnz = -140; mxz = 50; }
    const pad = 10, sc = Math.min((W - pad * 2) / (mxx - mnx), (H - pad * 2) / (mxz - mnz));
    const ox = W / 2 - (mnx + mxx) / 2 * sc, oz = H / 2 - (mnz + mxz) / 2 * sc;
    const X = (x) => ox + x * sc, Y = (z) => oz + z * sc;
    this._mapXY = (x, z) => [X(x), Y(z)];
    // グラウンド: ファウルの所(席の前の縁まで)を濃い緑、フェアの所を明るい緑。縁は角度ごとに近い方から 5% の席(ベンチ・ブルペンの席に引っぱられない)
    const fd = this.a.fenceDist, bins = Array.from({ length: 72 }, () => []), front = new Array(72).fill(1e9);
    for (let i = 0; i < S.n; i += 2) { const r = Math.hypot(S.x[i], S.z[i]); if (r > 160) continue; bins[((Math.round(angOf(S.x[i], S.z[i]) / 5) % 72) + 72) % 72].push(r); }
    for (let k = 0; k < 72; k++) if (bins[k].length > 8) { bins[k].sort((p, q) => p - q); front[k] = bins[k][Math.floor(bins[k].length * 0.05)]; }
    g.beginPath(); for (let b = 0; b <= 72; b++) { const k = b % 72, an = k * 5 > 180 ? k * 5 - 360 : k * 5, inF = Math.abs(an) <= 45 ? fd(an) : 0, r = Math.max(inF, Math.min(front[k] < 1e8 ? front[k] - 1 : 30, 130)); const x = Math.sin(an * D2R) * r, z = -Math.cos(an * D2R) * r; if (b) g.lineTo(X(x), Y(z)); else g.moveTo(X(x), Y(z)); }
    g.closePath(); g.fillStyle = '#2b6f38'; g.fill();
    g.beginPath(); g.moveTo(X(0), Y(0)); for (let an = -45; an <= 45; an += 3) { const r = fd(an); g.lineTo(X(Math.sin(an * D2R) * r), Y(-Math.cos(an * D2R) * r)); } g.closePath();
    const gr = g.createLinearGradient(0, Y(-120), 0, Y(0)); gr.addColorStop(0, '#4cb854'); gr.addColorStop(1, '#3a9a45'); g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.5; g.stroke();
    g.save(); g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(80), Y(-80)); g.lineTo(X(-80), Y(-80)); g.closePath(); g.clip(); g.beginPath(); g.arc(X(0), Y(-18.44), 29 * sc, 0, Math.PI * 2); g.fillStyle = '#c98a55'; g.fill(); g.restore();
    g.beginPath(); g.arc(X(0), Y(0), 4 * sc, 0, Math.PI * 2); g.fillStyle = '#c98a55'; g.fill();
    const s27 = 27.43 / Math.SQRT2; g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(s27), Y(-s27)); g.lineTo(X(0), Y(-s27 * 2)); g.lineTo(X(-s27), Y(-s27)); g.closePath(); g.fillStyle = '#4fb45a'; g.fill();
    g.fillStyle = '#fff'; for (const [x, z] of [[0, 0], [s27, -s27], [0, -s27 * 2], [-s27, -s27]]) g.fillRect(X(x) - 2, Y(z) - 2, 4, 4);
    // 席の点(区画ごとの色。選んでいる区画は濃く)と、区画の真ん中
    const zoneOf = (x, z) => { for (const Z of Zs) if (Z.ok && inZone(Z, x, z)) { const r = Math.hypot(x, z); if (Z.fair ? r > fd(angOf(x, z)) + 2 : r <= 95) return Z; } return null; };
    const step = S.n > 30000 ? 3 : 2, dotS = Math.max(1.3, sc * 1.1), cen = {};
    for (let i = 0; i < S.n; i += step) {
      const x = S.x[i], z = S.z[i]; if (Math.hypot(x, z) > 160) continue;
      const Z = zoneOf(x, z);
      if (Z) { const c = cen[Z.k] || (cen[Z.k] = [0, 0, 0]); c[0] += X(x); c[1] += Y(z); c[2]++; }
      g.fillStyle = Z ? (Z.k === this.pickK ? Z.col : Z.col + '77') : 'rgba(150,170,205,.35)';
      g.fillRect(X(x) - dotS / 2, Y(z) - dotS / 2, dotS, dotS);
    }
    // 区画のボタン(図の上の HTML。字は画像にしない)。区画の真ん中から外へずらして置き、線で結ぶ
    const hx = X(0), hy = Y(-45), pos = {};
    for (const Z of Zs) {
      const c = cen[Z.k]; let px, py;
      if (c && c[2]) { px = c[0] / c[2]; py = c[1] / c[2]; } else if (Z.seat != null) [px, py] = this._mapXY(S.x[Z.seat], S.z[Z.seat]); else continue;
      const dx = px - hx, dy = py - hy, L = Math.hypot(dx, dy) || 1, off = Z.k === 'bn' ? 30 : 46;
      const bx = Math.max(48, Math.min(W - 48, px + dx / L * off)), by = Math.max(26, Math.min(H - 26, py + dy / L * off));
      pos[Z.k] = [bx, by];
      if (Z.ok) { g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(px, py); g.lineTo(bx, by); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(px, py, 4.5, 0, Math.PI * 2); g.fill(); }
    }
    const pins = this.elPick.querySelector('.scPins');
    if (pins.dataset.built !== String(W) + 'x' + H) {
      pins.innerHTML = ''; pins.dataset.built = String(W) + 'x' + H;
      for (const Z of Zs) {
        if (!pos[Z.k]) continue;
        const b = document.createElement('button'); b.className = 'scPin' + (Z.ok ? '' : ' off'); b.dataset.k = Z.k; b.type = 'button';
        b.innerHTML = `<b>${Z.br || Z.name}</b><em>${Z.ok ? Z.tag : 'この球場では飛ばない'}</em>`;
        b.style.left = pos[Z.k][0] + 'px'; b.style.top = pos[Z.k][1] + 'px';
        b.addEventListener('click', (e) => { e.stopPropagation(); if (!Z.ok) return; this.pickK = Z.k; this.refreshPick(); });
        pins.appendChild(b);
      }
    }
  }
  showResult(r, Z) {
    const el = this.elRes;
    el.querySelector('.scBig').innerHTML = `<span>${r.of}球中</span><b>${r.n}</b><span>球キャッチ</span>`;
    el.querySelector('.scTable').innerHTML = `<div><i class="scI glove"></i>ナイスキャッチ<b>${r.nice}</b></div><div><i class="scI crown"></i>点数<b class="gold">${r.pts}</b></div><div class="sm">${Z.name} ・ ${r.newBest ? 'ベスト更新!' : `ベスト ${r.best} 点`}</div>`;
    const rw = el.querySelector('.scReward');
    rw.classList.toggle('none', !r.kinen);
    el.querySelector('.scRwName').textContent = r.kinen ? `記念ボール(これまでに ${this.kinenN} 個)` : `あと ${KINEN_NEED - r.n} 球で記念ボール`;
    el.classList.remove('hide');
  }
  hideResult() { this.elRes.classList.add('hide'); const a = this.a; if (a.ui && a.ui.app && a.ui.app.setOverlay && !document.querySelector('.screen:not(.hide)')) a.ui.app.setOverlay(false); }
  setHud(dist) {
    const M = this.mode, el = this.elHud;
    if (!M) { el.classList.add('hide'); return; }
    el.classList.remove('hide');
    // 縦のスマホ: 上は点数板で埋まるので、点数板の下の右寄りに(左は小さな走者の図)
    if (((this._hk = (this._hk || 0) + 1) % 20) === 1) { const tall = innerWidth < 600 && innerHeight > innerWidth; el.classList.toggle('tall', tall); if (tall) { const bd = document.getElementById('board'), r = bd && bd.getBoundingClientRect(); el.style.top = `${Math.round((r && r.height ? r.bottom : 90) + 10)}px`; } else el.style.top = ''; }
    const caught = M.res.filter((r) => r.caught).length, n = Math.min(N_BALLS, M.n + (this.cur ? 1 : 0));
    const t = `${Math.max(1, n)}球目 / ${N_BALLS} ・ キャッチ ${caught}`;
    const b = el.querySelector('b'); if (b.textContent !== t) b.textContent = t;
    const s = dist != null ? `落下点まで ${dist < 1.2 ? 'ここ!' : dist.toFixed(1) + ' m'}` : (this.cur ? '' : M.n < N_BALLS ? '次の球を待っています' : '');
    const sp = el.querySelector('span'); if (sp.textContent !== s) sp.textContent = s;
  }
  flash(text, kind, sub) {
    const el = this.elFlash; el.querySelector('b').textContent = text; el.querySelector('small').textContent = sub || '';
    el.className = 'on ' + (kind || ''); void el.offsetWidth; clearTimeout(this._flT); this._flT = setTimeout(() => { el.className = ''; }, 1500);
  }
  // DOM の出し入れ(試合の外でも。軽い)
  loop() {
    const step = () => {
      requestAnimationFrame(step);
      const a = this.a; if (!a.ready) return;
      if (!this._hooked) { this._hooked = true; this.hookFreeplay(); this.patchWatch(); this.hookCrowd(); }
      const W = this.W;
      if (this.mode && !(W && W.on)) { this.stopMode(); }   // タイトルへ戻った・別のモードを始めた
      if (!this.mode && this.cur && !(W && W.on)) { this.cur = null; if (this.bv) this.bv.show(false); if (this.ring) this.ring.visible = false; }
      if (this.want && !(W && W.on)) { if (this.want.why === 'ticket') { if (this.want.paid) { this.ptix++; ls.set('r4walk.sc.ptix', this.ptix); } else { this.tix.n++; ls.set('r4walk.sc.tix', this.tix); } } this.want = null; }   // 使う前に観戦をやめた: 券を返す
      if (((this._k = (this._k || 0) + 1) % 15) === 0) {
        const can = !this.mode && this.tixAll() > 0 && W && W.on && !a.overlay && !(this.fp && this.fp.sheetOn);
        const show = can && this.canUseTix(), wait = !!(this.want && this.want.why === 'ticket') || !!(this.cur && this.cur.why === 'ticket');
        this.elTix.classList.toggle('hide', !(show || wait));
        this.elTix.classList.toggle('wait', wait);
        const sm = this.elTix.querySelector('small'), b = this.elTix.querySelector('b');
        const bt = wait ? '次の打球が来ます' : '券を使う', st = wait ? '' : `×${this.tixAll()}${!document.body.classList.contains('touch') ? ' ・ B' : ''}`;
        if (b.textContent !== bt) b.textContent = bt; if (sm.textContent !== st) sm.textContent = st;
      }
    };
    requestAnimationFrame(step);
  }
}

// 読み込みが終わってから作る(main.js の window.__app)
(function boot() {
  const a = window.__app;
  if (!a || !a.ui || !a.watch || !a.defense) { setTimeout(boot, 200); return; }
  if (!window.__standCatch) window.__standCatch = new StandCatch(a);
})();
