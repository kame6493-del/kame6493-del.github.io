// 試合の終わり・始まりの整列(11/21 持ち主「試合終了後は整列させてください 高校野球なら それで次の試合が始まるみたいな感じで」)
// 観戦(watch.js)の試合だけ。守備の試合・ノック・打席/マウンド(cursorplay.js)では動かない。画面の札・字幕は足さない。カメラは触らない。
//  高校野球(hs):
//   終わり … 両チーム(先発 9 人 + ベンチから控え)が本塁をはさんで一塁側・三塁側に向かい合って一列。審判 4 人は本塁の後ろ。
//            そろったら一斉に礼 → 一歩出て握手 → 勝った方は本塁の前に横一列で外野(校歌の旗の方)を向く、負けた方は自分のベンチの前に並ぶ
//            → 両方ベンチへ走って下がる → 次の試合
//   始まり … 次の試合は、両チームがベンチから出て同じ所に整列 → 礼 → 守る側は守備位置へ走り、攻める側はベンチへ戻る → プレイボール
//  プロ風(pro): 勝ったチームがマウンドと本塁の間に横一列で集まり、ハイタッチ(右手を上げる)→ 軽く礼 → ベンチへ。負けたチームはすぐベンチへ下がる
// 時間は ?wfast(watch.fast)の倍で縮む(試験用)。人の動きは watch.update の dt で進める(試合の時計と同じ)
import * as THREE from 'three';
import { Athlete } from './athletes.js';
import { KIT } from './figures.js';
import { teamsNow } from './uniform.js';

const UMP_HOME = [[-0.3, 1.55], [23.5, -16.5], [-5, -45], [-23.5, -16.5]];   // defense.js の UMP_AT と同じ(審判の守備位置)
let PASS = null;
const loadPass = () => PASS || (PASS = fetch('models/passages.json').then((r) => r.json()).catch(() => ({})));
const sm = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const SIDE_S = { home: 1, away: -1 };   // 一塁側 = 後攻(home)、三塁側 = 先攻(away)

export class Seiretsu {
  constructor(w) {
    this.w = w; this.pool = []; this.on = false; this.done = false; this.actors = [];
    loadPass().then((d) => { this.passData = d; });
  }
  get d() { return this.w.d; }
  style() {
    const c = window.__crowd && window.__crowd.style; if (c === 'pro' || c === 'hs') return c;
    try { return teamsNow().style; } catch (e) { return 'hs'; }
  }
  lite() { try { return /lite|auto|min/.test(String(window.__app.state().quality)); } catch (e) { return false; } }
  gy(x, z, y = 0) { const g = this.w.base.groundAt(x, z, y + 1.4, 4); return g ?? y; }
  // ベンチの出入り口(models/passages.json の「ベンチ」の段: 0 番目がグラウンドの側、最後がベンチの床)
  exits() {
    if (this.ex) return this.ex;
    const st = this.w.base.stadium, list = ((this.passData && this.passData[st]) || []).filter((e) => e.side === 'bench' && e.pts && e.pts.length);
    const ex = {};
    for (const s of [1, -1]) {
      const e = list.find((q) => Math.sign(q.pts[0][0]) === s);
      const pts = e ? e.pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])) : [new THREE.Vector3(s * 22, 0, 2)];
      ex[s] = { top: pts[0], path: pts };
    }
    if (this.passData) this.ex = ex;
    return ex;
  }
  // 控え・攻める側の選手の体(使い回す)
  take(side, num) {
    let a = this.pool.find((q) => !q.busy);
    if (!a) { a = new Athlete({ ...KIT[side], side }, { number: String(num) }); a.busy = false; this.pool.push(a); }
    if (a.root.parent !== this.d.group) this.d.group.add(a.root);
    a.busy = true;
    if (!a.kit || a.kit.side !== side) { a.kit = { ...KIT[side], side }; if (a.dress) a.dress(); }
    a.setNumber(String(num));
    a.root.visible = true; a.lean = null; a.set('stand');
    return a;
  }
  actor(f, team, o = {}) { const A = { f, team, legs: [], delay: 0, face: null, arrived: true, vanish: false, ...o }; this.actors.push(A); return A; }
  // ベンチの中から出てくる人: ベンチの床に置き、段を上がってグラウンドへ
  fromBench(A, s, delay) {
    const E = this.exits()[s], P = E.path, last = P[P.length - 1];
    A.f.root.position.copy(last); A.f.root.visible = true;
    A.f.root.rotation.y = Math.atan2(-(P[0].x - last.x), -(P[0].z - last.z));
    A.delay = delay; A.hideWait = delay > 0;
    if (A.hideWait) A.f.root.visible = false;
    for (let i = P.length - 2; i >= 0; i--) this.leg(A, P[i].x, P[i].z, 3.2, P[i].y);
  }
  toBench(A, s, v) {
    const P = this.exits()[s].path;
    this.leg(A, P[0].x, P[0].z, v);
    for (let i = 1; i < P.length; i++) this.leg(A, P[i].x, P[i].z, Math.min(v, 3.2), P[i].y);
    A.vanish = true;
  }
  leg(A, x, z, v, y = null) { A.legs.push({ x, z, v, y }); A.arrived = false; }
  // 動かす(時間は早回しの倍を掛けた後)
  move(A, t) {
    const f = A.f, p = f.root.position;
    if (!f.root.visible && A.vanished) return;
    if (A.delay > 0) { A.delay -= t; f.set('stand'); if (A.hideWait) f.root.visible = false; return; }
    if (A.hideWait) { A.hideWait = false; f.root.visible = true; }
    const L = A.legs[0];
    if (!L) {
      A.arrived = true;
      if (A.face) { const want = Math.atan2(-(A.face[0] - p.x), -(A.face[1] - p.z)); f.root.rotation.y += wrapA(want - f.root.rotation.y) * Math.min(1, t * 8); }
      f.set(A.pose || 'stand');
      return;
    }
    const dx = L.x - p.x, dz = L.z - p.z, dist = Math.hypot(dx, dz), step = L.v * t;
    if (dist <= step + 1e-4) {
      p.x = L.x; p.z = L.z; p.y = L.y != null ? L.y : this.gy(p.x, p.z, p.y);
      A.legs.shift();
      if (!A.legs.length) { A.arrived = true; if (A.vanish) { f.root.visible = false; A.vanished = true; } }
      return;
    }
    const y0 = p.y;
    p.x += dx / dist * step; p.z += dz / dist * step;
    p.y = L.y != null ? y0 + (L.y - y0) * Math.min(1, step / dist) : this.gy(p.x, p.z, y0);
    const want = Math.atan2(-dx, -dz);
    f.root.rotation.y += wrapA(want - f.root.rotation.y) * Math.min(1, t * 10);
    f.set('run', { v: L.v });
  }
  allArrived(filter) { return this.actors.every((A) => (filter && !filter(A)) || A.arrived || A.vanished); }
  setLean(A, bow, arm) { A.f.lean = bow || arm ? { bow: bow || 0, arm: arm || 0 } : null; }
  // 礼の深さ(0 → 1 → 0): 0.5 秒で倒し、1.1 秒止め、0.6 秒で戻す
  bowK(t) { return t < 0.5 ? sm(t / 0.5) : t < 1.6 ? 1 : 1 - sm((t - 1.6) / 0.6); }

  // ---------------------------------------------------------------- 共通の始め・終わり
  reset(kind) {
    const d = this.d;
    this.cleanActors();
    this.kind = kind; this.on = true; this.done = false; this.phase = 'wait'; this.pt = 0; this.ct = 0; this.log = [];
    this.stl = this.style();
    this.R = this.lite() ? 2 : 3;   // 控え(各チーム)。スマホは少なめ
    this.ex = null; this.exits();
  }
  hideBall() {
    const d = this.d;
    if (d.ballView) d.ballView.show(false);
    for (const k of ['ring', 'shadow', 'landMark']) if (d[k]) d[k].visible = false;
    (d.glows || []).forEach((g) => (g.visible = false));
    (d.bglows || []).forEach((g) => (g.visible = false));
  }
  // 審判を守備位置へ(整列で本塁の後ろに集まったまま次の試合が始まる時など)
  restoreUmps() {
    for (const [b, u] of Object.entries(this.d.ump || {})) { const h = UMP_HOME[+b]; if (!h) continue; u.root.position.set(h[0], this.gy(h[0], h[1]), h[1]); u.setYawToward(0, +b === 0 ? -20 : 0); }
  }
  cleanActors() {
    for (const A of this.actors) A.f.lean = null;
    for (const a of this.pool) { a.busy = false; a.root.visible = false; a.lean = null; }
    this.actors = [];
  }
  go(phase) { this.phase = phase; this.pt = 0; this.log.push([phase, +this.ct.toFixed(2)]); }
  // 終わらせる(次の試合へ・観戦をやめた時)
  finish() {
    const d = this.d;
    for (const A of this.actors) { A.f.lean = null; if (A.ump) A.f.set('stand'); }
    this.cleanActors();
    this.on = false;
    this.last = { kind: this.kind, style: this.stl, log: this.log, sec: +this.ct.toFixed(2) };
    (this.history = this.history || []).push(this.last);
    if (this.kind === 'open') {
      // 守備位置へ置き直し、打者を打席へ。審判は守備位置へ
      d.snapHome();
      for (const [k, f] of Object.entries(d.fig)) { f.root.visible = true; f.set(k === 'C' ? 'crouch' : 'ready'); }
      d.batter.root.visible = true;
      this.restoreUmps();
      if (d.applyAlignment) d.applyAlignment();
    }
  }
  abort() {
    if (!this.on) return;
    const d = this.d;
    this.cleanActors();
    this.restoreUmps();
    this.on = false; this.done = false;
  }

  // ---------------------------------------------------------------- 試合の終わり
  beginEnd() {
    this.reset('end');
    const g = this.d.g;
    this.winner = g.score.us > g.score.them ? 'home' : g.score.them > g.score.us ? 'away' : null;
  }
  // 両チームの人を集める(守る側 = d.fig、攻める側 = 打者・走者の所から + ベンチから。控えもベンチから)
  castTeams(allAtt) {
    const d = this.d, R = this.R;
    const def = (d.fig.P && d.fig.P.kit && d.fig.P.kit.side) || 'home', att = def === 'home' ? 'away' : 'home';
    this.def = def; this.att = att;
    const team = { home: [], away: [] };
    for (const k of Object.keys(d.fig)) { const f = d.fig[k]; f.root.visible = true; f.lean = null; team[def].push(this.actor(f, def, { pos: k })); }
    const onField = [d.batter, ...(d.runnerFigs || [])].filter((f) => f && f.root.visible);
    let n = 1;
    if (allAtt) {
      for (const f of onField) { const a = this.take(att, n++); a.root.position.copy(f.root.position); a.root.rotation.y = f.root.rotation.y; f.root.visible = false; team[att].push(this.actor(a, att)); }
      let i = 0;
      while (n <= 9) { const A = this.actor(this.take(att, n++), att); this.fromBench(A, SIDE_S[att], 0.2 + i++ * 0.3); team[att].push(A); }
    } else {
      for (const f of onField) { const a = this.take(att, n++); a.root.position.copy(f.root.position); a.root.rotation.y = f.root.rotation.y; f.root.visible = false; team[att].push(this.actor(a, att)); }
    }
    return team;
  }
  addReserves(team, side, delay0 = 0.3, gap = 0.3) {
    for (let i = 0; i < this.R; i++) { const A = this.actor(this.take(side, 10 + i), side, { reserve: true }); this.fromBench(A, SIDE_S[side], delay0 + i * gap); team[side].push(A); }
  }
  // 高校野球の整列の場所: 本塁をはさんで x = ±2.4、本塁の前から投手の方へ 1 m おき
  rowSlot(side, i) { return [SIDE_S[side] * 2.4, -0.9 - i * 1.0]; }
  sendToRows(team, vmax = 9.5, vmin = 5, k = 7.5) {
    for (const side of ['home', 'away']) {
      // 本塁に近い人ほど本塁寄りの場所へ(ベンチから出る人は、後から出る人ほど本塁寄り。追い越さないように)
      const key = (A) => this.endZ(A) + (A.delay || 0) * 0.01;
      const L = team[side].slice().sort((a, b) => key(b) - key(a));
      L.forEach((A, i) => {
        const [x, z] = this.rowSlot(side, i); A.slot = i;
        const p = this.endP(A), dist = Math.hypot(x - p.x, z - p.z);
        this.leg(A, x, z, Math.min(vmax, Math.max(vmin, dist / k)));
        A.face = [0, z]; A.pose = 'stand';
      });
    }
    // 審判は本塁の後ろに横一列(本塁側を向く)
    const d = this.d;
    Object.entries(d.ump).forEach(([b, u], i) => {
      u.root.visible = true; u.anim = null;
      const A = this.actor(u, 'ump', { ump: true }), x = -1.5 + i * 1.0, z = 1.5;
      const dist = Math.hypot(x - u.root.position.x, z - u.root.position.z);
      if (dist > 0.2) this.leg(A, x, z, Math.min(7, Math.max(2.2, dist / 8.5)));
      A.face = [x, -10]; A.pose = 'stand';
    });
  }
  // 足の行き先(段の途中なら最後の行き先)
  endP(A) { const L = A.legs[A.legs.length - 1]; return L ? { x: L.x, z: L.z } : A.f.root.position; }
  endZ(A) { return A.f.root.position.z; }

  update(dt) {
    if (!this.on) return;
    const d = this.d, w = this.w, t = dt * w.fast;
    this.ct += t; this.pt += t;
    if (this.phase === 'wait') {
      // 最後のプレー(サヨナラの走者など)が終わるまでは、今までどおり守備の動きを進める
      d.update(dt); w.drawCatcher(dt);
      if (this.kind === 'end' && (this.pt < 0.8 || (d.play && this.pt < 1.6))) return;
      d.play = null; d.ball = null; this.hideBall(); this.pt = 0;
      if (this.kind === 'end') { if (this.stl === 'pro') this.proSetup(); else this.hsSetup(); }
      else this.openSetup();
      return;
    }
    for (const A of this.actors) this.move(A, t);
    if (this.kind === 'open') this.openTick(t);
    else if (this.stl === 'pro') this.proTick(t);
    else this.hsTick(t);
  }

  // ---- 高校野球の終わり
  hsSetup() {
    const team = this.castTeams(true);
    this.addReserves(team, this.def, 0.3); this.addReserves(team, this.att, 0.3 + 9 * 0.3);
    this.team = team;
    this.sendToRows(team);
    this.go('gather');
  }
  hsTick(t) {
    const S = this.d.ctx.sound || this.w.base.sound;
    if (this.phase === 'gather') {
      if (this.allArrived() && this.pt > 0.3) this.go('face');
      else if (this.pt > 12) { this.snapAll(); this.go('face'); }
    } else if (this.phase === 'face') {
      if (this.pt > 0.7) { this.go('bow'); try { S.crowdEvent('walk', 1); } catch (e) { /* 音なし */ } }
    } else if (this.phase === 'bow') {
      const k = this.bowK(this.pt);
      for (const A of this.actors) this.setLean(A, (A.ump ? 0.45 : 0.8) * k, 0);
      if (this.pt > 2.3) {
        for (const A of this.actors) this.setLean(A, 0, 0);
        // 一歩出て握手(向かい合う相手と。右手どうしが合うよう三塁側は 0.35 m ずらす)
        for (const A of this.actors) if (!A.ump) { const [x, z] = this.rowSlot(A.team, A.slot); this.leg(A, SIDE_S[A.team] * 0.5, z + (A.team === 'away' ? -0.35 : 0), 1.8); A.face = [-SIDE_S[A.team] * 5, z + (A.team === 'away' ? -0.35 : 0)]; }
        this.go('shake');
      }
    } else if (this.phase === 'shake') {
      for (const A of this.actors) if (!A.ump) { const k = A.arrived ? Math.min(1, (A.armT = (A.armT || 0) + t) / 0.3) : 0; this.setLean(A, 0, 0.9 * k * (this.pt < 2.3 ? 1 : Math.max(0, 1 - (this.pt - 2.3) / 0.3))); }
      if (this.pt > 2.6) { for (const A of this.actors) this.setLean(A, 0, 0); this.songSetup(); this.go('song'); }
    } else if (this.phase === 'song') {
      const wOK = this.allArrived((A) => A.team === this.winner);
      if (wOK && this.songAt == null) this.songAt = this.pt;
      if ((this.songAt != null && this.pt - this.songAt > 2.2) || this.pt > 6.5) {
        this.exitAll(6.8);
        for (const A of this.actors) if (A.ump) A.face = [A.f.root.position.x, -10];
        this.go('exit');
      }
    } else if (this.phase === 'exit') {
      if (this.allArrived((A) => !A.ump) || this.pt > 6.0) this.done = true;
    }
  }
  // 全員(審判は除く)をベンチへ。ベンチの入口に近い人から順に、少しずつ間をあけて段を下りる
  exitAll(v, filter = (A) => !A.ump) {
    for (const side of ['home', 'away']) {
      const E = this.exits()[SIDE_S[side]].top;
      const L = this.actors.filter((A) => A.team === side && filter(A)).sort((a, b) => a.f.root.position.distanceTo(E) - b.f.root.position.distanceTo(E));
      L.forEach((A, i) => { A.legs = []; A.face = null; A.delay = i * 0.15; this.toBench(A, SIDE_S[side], v); });
    }
  }
  snapAll() {
    for (const A of this.actors) { const L = A.legs[A.legs.length - 1]; if (L) { A.f.root.position.set(L.x, L.y != null ? L.y : this.gy(L.x, L.z), L.z); A.legs = []; A.arrived = true; } A.delay = 0; }
  }
  // 勝った方: 本塁の前に横一列で外野(校歌の旗)を向く。負けた方(引き分けは両方): 自分のベンチの前に並んで本塁の方を向く
  songSetup() {
    this.songAt = null;
    for (const side of ['home', 'away']) {
      const L = this.actors.filter((A) => A.team === side);
      if (side === this.winner) {
        const n = L.length; L.sort((a, b) => a.f.root.position.z - b.f.root.position.z);
        L.forEach((A, i) => { const x = (i - (n - 1) / 2) * 1.0; this.leg(A, x, -1.25, 3.6); A.face = [x, -120]; A.delay = 0.7; });
      } else {
        const s = SIDE_S[side], E = this.exits()[s].top, dl = Math.hypot(E.x, E.z), ux = -E.x / dl, uz = -E.z / dl;
        const tx = -uz, tz = ux;   // 本塁を中心にした円の向き
        const n = L.length; L.sort((a, b) => (a.f.root.position.x * tx + a.f.root.position.z * tz) - (b.f.root.position.x * tx + b.f.root.position.z * tz));
        let back = 3.2;
        for (let tries = 0; tries < 4; tries++) {   // 並ぶ所がグラウンドの高さか確かめ、だめなら本塁の方へ寄せる
          const ok = L.every((A, i) => { const o = i - (n - 1) / 2, x = E.x + ux * back + tx * o, z = E.z + uz * back + tz * o, g = this.w.base.groundAt(x, z, 1.5, 4); return g != null && Math.abs(g) < 0.35; });
          if (ok) break; back += 1.5;
        }
        L.forEach((A, i) => { const o = i - (n - 1) / 2, x = E.x + ux * back + tx * o, z = E.z + uz * back + tz * o; this.leg(A, x, z, 4.5); A.face = [0, -4]; });
      }
    }
  }

  // ---- プロ風の終わり
  proSetup() {
    const win = this.winner, d = this.d;
    const def = (d.fig.P && d.fig.P.kit && d.fig.P.kit.side) || 'home';
    const team = this.castTeams(win != null && win !== def);   // 攻める側が勝った(サヨナラ)ならベンチから全員出てくる
    if (win) this.addReserves(team, win, win === def ? 0.2 : 0.3 + 9 * 0.3);
    this.team = team;
    for (const side of ['home', 'away']) {
      const L = team[side];
      if (side === win) {
        // マウンドと本塁の間に横一列(本塁の方を向く)
        const n = L.length; L.sort((a, b) => this.endP(a).x - this.endP(b).x);
        L.forEach((A, i) => { const x = (i - (n - 1) / 2) * 1.15, z = -9, p = this.endP(A), dist = Math.hypot(x - p.x, z - p.z); this.leg(A, x, z, Math.min(8.5, Math.max(4.5, dist / 8))); A.face = [x, 10]; A.slot = i; });
      } else {
        // 負けた方はベンチへ下がる(小走り)
        const E = this.exits()[SIDE_S[side]].top;
        L.sort((a, b) => a.f.root.position.distanceTo(E) - b.f.root.position.distanceTo(E)).forEach((A, i) => { A.delay = 0.6 + i * 0.2; this.toBench(A, SIDE_S[side], 4.6); });
      }
    }
    for (const u of Object.values(d.ump)) { u.anim = null; const A = this.actor(u, 'ump', { ump: true }); A.face = [0, 0]; A.pose = 'stand'; }
    this.go('gather');
  }
  proTick(t) {
    const S = this.w.base.sound, win = this.winner;
    const W = (A) => A.team === win;
    if (this.phase === 'gather') {
      if (!win) { if (this.allArrived((A) => !A.ump) || this.pt > 20) this.go('rest'); return; }
      if ((this.allArrived(W) && this.pt > 0.3) || this.pt > 12) { if (this.pt > 12) for (const A of this.actors) if (W(A) && A.legs.length) { const L = A.legs[A.legs.length - 1]; A.f.root.position.set(L.x, this.gy(L.x, L.z), L.z); A.legs = []; A.arrived = true; } this.go('five'); try { S.crowdEvent('walk', 1); } catch (e) { /* 音なし */ } }
    } else if (this.phase === 'five') {
      // ハイタッチ: 隣どうし向き合って右手を上で合わせる(1 回目は 0-1・2-3…、2 回目は 1-2・3-4…の組)
      const WL = this.actors.filter(W).sort((a, b) => a.slot - b.slot);
      const round = this.pt < 1.7 ? 0 : 1, r0 = round ? 1.8 : 0.1;
      WL.forEach((A, i) => {
        const B = WL[i % 2 === round ? i + 1 : i - 1], p = A.f.root.position;
        A.face = B ? [B.f.root.position.x, p.z] : [p.x, 10];
        const u = (this.pt - r0 - 0.3) / 1.0;
        this.setLean(A, 0, B && u > 0 && u < 1 ? 2.6 * Math.sin(u * Math.PI) : 0);
      });
      if (this.pt > 3.3) { for (const A of WL) { this.setLean(A, 0, 0); A.face = [A.f.root.position.x, 10]; } this.go('bow'); }
    } else if (this.phase === 'bow') {
      const k = this.bowK(this.pt);
      for (const A of this.actors) if (W(A)) this.setLean(A, 0.55 * k, 0);
      if (this.pt > 2.3) { for (const A of this.actors) this.setLean(A, 0, 0); this.exitAll(4.2, W); this.go('rest'); }
    } else if (this.phase === 'rest') {
      // 次の試合まで(今までどおり 30 秒)待つ
      if (this.ct > 30) this.done = true;
    }
  }

  // ---------------------------------------------------------------- 試合の始まり(高校野球の次の試合)
  beginOpen() {
    this.reset('open');
    this.phase = 'wait';
  }
  openSetup() {
    const d = this.d;
    // 守る側も攻める側もベンチの中から出てくる(打者・走者は出さない)
    d.batter.root.visible = false; (d.runnerFigs || []).forEach((f) => (f.root.visible = false));
    const team = this.castTeams(false);
    for (const A of team[this.def]) this.fromBench(A, SIDE_S[this.def], 0.1 + this.actors.indexOf(A) * 0.16);
    for (let n = 1; n <= 9; n++) { const A = this.actor(this.take(this.att, n), this.att); this.fromBench(A, SIDE_S[this.att], 0.1 + (n - 1) * 0.16); team[this.att].push(A); }
    this.addReserves(team, 'home', 0.1 + 9 * 0.16, 0.16); this.addReserves(team, 'away', 0.1 + 9 * 0.16, 0.16);
    this.team = team;
    this.sendToRows(team, 8, 6, 6);
    this.go('gather');
  }
  openTick(t) {
    const d = this.d, S = this.w.base.sound;
    if (this.phase === 'gather') {
      if (this.allArrived() && this.pt > 0.3) this.go('face');
      else if (this.pt > 10) { this.snapAll(); this.go('face'); }
    } else if (this.phase === 'face') {
      if (this.pt > 0.5) { this.go('bow'); try { S.crowdEvent('walk', 1); } catch (e) { /* 音なし */ } }
    } else if (this.phase === 'bow') {
      const k = this.bowK(this.pt);
      for (const A of this.actors) this.setLean(A, (A.ump ? 0.45 : 0.8) * k, 0);
      if (this.pt > 2.3) {
        for (const A of this.actors) {
          this.setLean(A, 0, 0); A.face = null;
          if (A.ump) { const h = UMP_HOME[this.actors.filter((q) => q.ump).indexOf(A)]; const dist = Math.hypot(h[0] - A.f.root.position.x, h[1] - A.f.root.position.z); this.leg(A, h[0], h[1], Math.min(7, Math.max(2.5, dist / 8))); }
          else if (A.pos) { const h = d.homeOf(A.pos), dist = Math.hypot(h.x - A.f.root.position.x, h.z - A.f.root.position.z); this.leg(A, h.x, h.z, Math.min(9.2, Math.max(5, dist / 8.5))); A.face = [0, 0]; A.pose = A.pos === 'C' ? 'crouch' : 'ready'; }
        }
        this.exitAll(6.5, (A) => !A.ump && !A.pos);   // 攻める側と控えはベンチへ
        this.go('take');
      }
    } else if (this.phase === 'take') {
      if (this.allArrived((A) => !!A.pos) || this.pt > 9.5) this.done = true;
    }
  }
}
