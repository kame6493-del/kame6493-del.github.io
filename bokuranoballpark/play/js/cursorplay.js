// カーソルで打つ・投げる(11/20 夜 持ち主「ミートカーソルを合わせて打つみたいな…投げる方も同じ」)。docs/カーソルで打つ・投げる.md
// 打つ: ストライクゾーンの上のだ円(カーソル)を、球の来る所へ重ねて、ちょうどよい時に振る。
//   真ん中で当たるほど強い打球、端は詰まる・先っぽ・ファウル、外れたら空振り。早く振ると引っ張り、遅いと流し。強振はカーソルが小さく強い。
// 投げる: 球種を選び、ゾーンの上で投げたい所にカーソルを置いて投げる。球はそこへ向かい、少しぶれる。相手の打者は自動。
// 体の動き・守備・走者・判定・実況・点数の板は、今の守備の試合(defense.js)と観戦(watch.js)の物をそのまま使う。
//   ・投手の投げる動き(pitch)・打者の構え(bat)とスイング(swing)・捕手の構えと捕る(crouch / receive)・審判 は defense.js の人と動きのまま。
//   ・打った球は ballsim.js の物理で飛ばし、defense.js の startPlay(make)に渡して、野手・走者・判定は今の仕組みが自動で動かす。
//   ・見えない捕手(watch.js の proxy と bot)・数え方(rules.js)・ボール/ストライクの捕球(watch.js の arriveTick)も使い回す。
// 前の打席・マウンド(play.js・batter.js、自分でバットを振る形)は ?oldbat=1 で戻る(main.js)。
import * as THREE from 'three';
import * as R from './rules.js';
import { Watch } from './watch.js';
import { solvePitch, pitchSpin, sampleTraj, timeAtZ, PLATE_FRONT_Z } from './physics.js';
import { PITCH_TYPES } from './pitches.js';
import { predict, pathDuration } from './ballsim.js';
import { motionEvent } from './athletes.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ZONE = { x0: -0.2526, x1: 0.2526, y0: 0.50, y1: 1.07 };   // play.js と同じストライクゾーン(本塁の前の面)
const ZP = PLATE_FRONT_Z;          // カーソルとゾーンを置く面
const REL = [-0.18, 1.81, -17.46];   // 球の出る所(defense.js の preContact と同じ、投球の動きの放す時の右手)
const T_REL = 1.15;                 // 投球の動きを始めてから球が手を離れるまで(秒)
const BALL_TS = 0.8;                // 投げた球の時間の進み(少しゆっくり。本物の 0.8 倍)
const SWING_T = 0.2;                // 振ってからバットが本塁の前に来るまで(秒)
const TW = 0.12;                    // 当たる時の早い・遅いの幅(秒、±)
export const CURSOR = { meet: { rx: 0.135, ry: 0.10 }, power: { rx: 0.09, ry: 0.066 } };   // カーソルの横・縦の半径(m)。ゾーンは横 0.505・縦 0.57
const AI_CURSOR = CURSOR.meet;
// 投げられる球種(3〜4 個まで。持ち主の決まり)。速さは高校生の投手
export const MY_PITCHES = [['FF', 'ストレート', 141], ['CU', 'カーブ', 112], ['SL', 'スライダー', 125], ['FS', 'フォーク', 131]];
const AI_MIX = [['FF', 0.46], ['SL', 0.22], ['CU', 0.14], ['FS', 0.18]];
const OF = ['LF', 'CF', 'RF'];
const swingContact = (c) => motionEvent(c ? 'bat_swing_' + c : 'bat_swing', 'contact') ?? motionEvent('bat_swing', 'contact') ?? 0.6;
const randn = (rng) => { let u = 0, v = 0; while (u === 0) u = rng(); v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// 当たりの計算(打つ人が自分でも、自動の打者でも同じ)。
// bx, by: 球が本塁の前を通る所 / cx, cy: カーソルの真ん中 / te: 早い(−)・遅い(+)の秒 / hand: 打者の左右
export function hitResult({ bx, by, cx, cy, rx, ry, te, power, hand, rng = Math.random }) {
  const nx = (bx - cx) / rx, ny = (by - cy) / ry, r = Math.hypot(nx, ny), tq = Math.abs(te) / TW;
  if (r > 1 || tq > 1) return { miss: true, r, nx, ny, te, why: tq > 1 ? (te < 0 ? 'early' : 'late') : 'off' };
  const along = nx * (hand === 'L' ? -1 : 1);   // + = バットの先の側、− = 手元の側(詰まる)
  const core = 1 - Math.pow(r, 1.5);
  let ev = (power ? 46.5 : 41) * (0.36 + 0.64 * core) * (1 - 0.42 * tq * tq);   // m/s(最高で 167 / 148 km/h)
  let kind = r < 0.38 && tq < 0.5 ? 'sweet' : along < -0.5 ? 'jam' : along > 0.5 ? 'tip' : 'ok';
  if (kind === 'jam') ev *= 0.78; else if (kind === 'tip') ev *= 0.84;
  // 上下: 球がカーソルの真ん中より上 → バットが球の下をこする(上がる)。下 → 上をたたく(ゴロ)
  const la = (power ? 16 : 11) + ny * 36 + (rng() - 0.5) * 6;
  // 左右: 早いと引っ張り、遅いと流し(右打者の引っ張りは三塁側 = − の角度)。先っぽは少し流れ、詰まると少し引っ張る
  const hs = hand === 'L' ? -1 : 1;
  const spray = hs * (te / TW) * 56 + hs * along * 7 + (rng() - 0.5) * 8;
  return { miss: false, ev, la, spray, kind, r, nx, ny, te, along };
}

export class CursorGame extends Watch {
  constructor(o) {
    super(o);
    this.kind = null;
    this.cur = { x: 0, y: 0.8 };   // カーソル(本塁の前の面の x, y)
    this.power = false;
    this.ptype = 'FF';
    this.buildUI();
    this.bindInput();
  }

  // ================================================================ 始める・やめる
  enter(kind) {
    const b = this.base, d = this.d;
    if (this.on) this.exit(true);
    this.kind = kind;   // 'bat' | 'mound'
    b.setMode(kind === 'bat' ? 'cbat' : 'cmound');
    b.setCamOverride(true);
    try { document.exitPointerLock(); } catch (e) { /* */ }
    this.on = true;
    this.realCtx = d.ctx; d.ctx = this.pctx;
    this.patch();
    this.stats = { pitches: 0, H: { them: 0, us: 0 }, K: { them: 0, us: 0 }, BB: { them: 0, us: 0 }, HR: { them: 0, us: 0 }, PA: { them: 0, us: 0 }, games: 0, swings: 0, contacts: 0, misses: 0, log: [] };
    this.newGame();
    this.camK = 0; this.camAt = null;
    this.cur = { x: 0, y: 0.8 };
    this.ui.root.classList.remove('hide');
    this.ui.root.classList.toggle('bat', kind === 'bat'); this.ui.root.classList.toggle('mound', kind === 'mound');
    this.setPower(false); this.setType('FF');
    const ex = b.el('exitMode'); ex.textContent = kind === 'bat' ? '打席を出る' : 'マウンドを降りる'; ex.classList.remove('hide');
    b.hud(null);
    document.body.classList.add('cursorplay');
    const T = b.IS_TOUCH;
    b.toast(kind === 'bat' ? '打席' : 'マウンド', kind === 'bat' ? (T ? '左をなぞってカーソルを球へ・右で振る' : 'マウスでカーソルを球へ・クリックで振る') : (T ? '球種を選び、左をなぞって狙い・右で投げる' : '球種を選び、マウスで狙い・クリックで投げる'), { ms: 2600 });
  }
  newGame() {
    const d = this.d;
    this.simT = 0; this.gapUntil = null; this.paOpen = false; this.arr = null; this.overT = null; this.pc = null; this.pcWait = null; this.foulFly = null; this.waitUser = false;
    d.intruder = null; this.intr = null;
    d.begin({ mode: 'game', pos: 'C', diff: 'normal', mark: 'off', keepDiff: true });   // 見えない捕手(watch.js と同じ)
    d.watching = true;
    d.g.half = this.kind === 'bat' ? 'bottom' : 'top';   // 打つ時は自分(後攻)の攻撃だけ、投げる時は相手(先攻)の攻撃だけを続ける
    this.setKits(d.g.half);
    this.firstPitch = true;
    d.updateHUD();
    this.gap(1.2);
  }
  exit(silent) {
    if (!this.on) return;
    const b = this.base, d = this.d;
    this.on = false;
    this.ui.root.classList.add('hide');
    document.body.classList.remove('cursorplay');
    d.stop(true);
    this.setKits('top');
    this.unpatch();
    d.ctx = this.realCtx || b;
    d.watching = false;
    const ui = this.getUI(); if (ui) { ui.board(null); ui.digest(null); }
    b.el('exitMode').classList.add('hide');
    b.setCamOverride(false);
    b.camera.fov = 70; b.camera.updateProjectionMatrix();
    const was = this.kind; this.kind = null;
    if (b.mode === 'cbat' || b.mode === 'cmound') b.setMode('walk');
    if (!silent) { if (was === 'bat') b.placeAt(-1.3, 1.2, 0, -60, 1.5, 5); else b.placeAt(0, -17.2, 0, 0, 1.0, 5); }
  }
  stop() { this.exit(true); }
  startWalkers() {}   // 観戦の歩く人はここでは出さない

  // ================================================================ defense の関数を包む(watch.js の patch に足す)
  patch() {
    super.patch();
    const d = this.d, self = this;
    const pre0 = this.orig.preContact, con0 = this.orig.contact;
    d.preContact = function (pl, dt) { if (pl.cur) return self.pitchTick(pl, dt); return pre0.call(this, pl, dt); };
    d.contact = function (pl) {
      if (pl.cur) return;   // 投げている間は自分で進める(当たる・捕る は pitchTick)
      if (!pl.cursorHit) return con0.call(this, pl);
      const S = this.ctx.sound, own = Object.prototype.hasOwnProperty.call(S, 'hit'), h = S.hit; S.hit = () => {};
      try { con0.call(this, pl); } finally { if (own) S.hit = h; else delete S.hit; }
      const k = pl.cursorHit.kind;
      S.hit(k === 'sweet' ? 'barrel' : k === 'jam' ? 'jam' : k === 'tip' ? 'end' : 'solid', Math.min(1, pl.cursorHit.ev * 3.6 / 165));
    };
  }

  // ================================================================ 1 球ずつ(defense.nextPA から)
  nextPitch() {
    const d = this.d, g = d.g, rng = d.rng;
    if (!this.on) return;
    if (g.over) { this.gameOver(); return; }
    if (this.gapUntil == null) {
      if (g.outs >= 3) { this.changeSides(); return; }
      this.gap(this.kind === 'bat' ? 0.9 : 0.5);
      return;
    }
    if (this.simT < this.gapUntil) { d.wait = this.gapUntil - this.simT + 0.05; return; }
    this.gapUntil = null;
    if (g.outs >= 3) return this.nextPitch();
    if (this.firstPitch) { this.firstPitch = false; d.umpCall('play', 0); d.say(['play_ball'], { maxWait: 1 }); }
    if (!this.paOpen) {
      g.pa++; g.balls = 0; g.strikes = 0;
      g.hand = this.kind === 'bat' ? 'R' : (rng() < 0.35 ? 'L' : 'R');
      this.paOpen = true;
      d.layRunners();
      if (d.batter && d.batter.setNumber) d.batter.setNumber(String(d.batterNum()));
    }
    d.updateHUD();
    if (this.kind === 'bat') this.beginPitch(this.aiPitch());
    else { this.waitUser = true; d.wait = 600; this.ui.root.classList.add('ready'); }
  }
  // 相手の投手の球(打つ時): 球種と行き先。カウントで少し変える
  aiPitch() {
    if (this.forceNext) { const f = this.forceNext; this.forceNext = null; return f; }
    const rng = this.d.rng, g = this.d.g;
    let r = rng(), type = 'FF';
    for (const [k, w] of AI_MIX) { if ((r -= w) <= 0) { type = k; break; } }
    if (g.strikes >= 2 && rng() < 0.3) type = rng() < 0.5 ? 'FS' : 'SL';
    const strikeP = g.balls >= 3 ? 0.8 : g.strikes >= 2 ? 0.45 : 0.6;
    const inZ = rng() < strikeP;
    let x, y;
    if (inZ) { x = -0.2 + rng() * 0.4; y = 0.56 + rng() * 0.46; }
    else { const s = rng(); if (s < 0.4) { x = (rng() < 0.5 ? -1 : 1) * (0.31 + rng() * 0.16); y = 0.45 + rng() * 0.7; } else if (s < 0.75) { x = -0.25 + rng() * 0.5; y = 0.3 + rng() * 0.17; } else { x = -0.25 + rng() * 0.5; y = 1.12 + rng() * 0.2; } }
    if (type === 'FS' && rng() < 0.6) y = Math.min(y, 0.38 + rng() * 0.25);   // フォークは低めへ落とす
    const base = MY_PITCHES.find((p) => p[0] === type)[2] - 3;
    return { type, kmh: base + randn(rng) * 2, target: [x, y] };
  }
  // 1 球を始める: 投手が投げる動き(defense.js の preContact と同じ動き)を、球の出る時刻に合わせて流す
  beginPitch(spec) {
    const d = this.d;
    this.waitUser = false; this.ui.root.classList.remove('ready');
    const T = PITCH_TYPES[spec.type];
    const sol = solvePitch(REL, spec.kmh / 3.6, (dir) => pitchSpin(dir, T.rpm, T.eff, T.mv, 1), spec.target);
    const tP = timeAtZ(sol.tr, ZP) ?? 0.45;
    const B = sampleTraj(sol.tr, tP, [0, 0, 0]);
    const tMitt = timeAtZ(sol.tr, 0.72) ?? tP + 0.05;
    const strike = B[0] >= ZONE.x0 - 0.037 && B[0] <= ZONE.x1 + 0.037 && B[1] >= ZONE.y0 - 0.037 && B[1] <= ZONE.y1 + 0.037;
    d.startPlay({ fielder: 'SS', L: 0.2, by: 'bat', type: 'grounder', sitT: 0, plan: {} });   // 守備の割り当てはしない(watch.js の打球にならない球と同じ)
    const pl = d.play;
    pl.watchPitch = 'cursor'; pl.contactT = 99;
    pl.cur = { ...spec, tr: sol.tr, w: sol.w, tP, B, tMitt, strike, ts: null, res: null, course: '', shownBall: false, done: false };
    this.stats.pitches++;
    d.ballView.setSpin(sol.w);
    if (this.kind === 'mound') this.aiDecide(pl.cur);
    this.lastPitch = pl.cur;
  }
  // 本物の秒で、球が本塁の前を通る時刻(投球を始めてから)
  plateT(c) { return T_REL + c.tP / BALL_TS; }
  // 自動の打者(投げる時): 振るか・どこへ・いつ
  aiDecide(c) {
    const rng = this.d.rng, g = this.d.g;
    const bx = c.B[0], by = c.B[1];
    const far = Math.max(0, Math.abs(bx) - 0.25) + Math.max(0, ZONE.y0 - by, by - ZONE.y1);
    let p = c.strike ? (g.strikes >= 2 ? 0.86 : 0.68) : Math.max(0.03, (g.strikes >= 2 ? 0.42 : 0.28) - far * 1.6);
    if (g.balls >= 3 && !c.strike) p *= 0.6;
    if (rng() >= p) return;
    const brk = c.type === 'CU' || c.type === 'SL' ? 0.03 : c.type === 'FS' ? 0.02 : 0;
    const drop = c.type === 'FS' || c.type === 'CU' ? 0.045 : 0;
    const te = randn(rng) * (0.055 + (c.type === 'FF' ? 0 : 0.025)) + (c.type === 'FF' ? 0.01 : -0.02);   // 変化球は少し早めに振りがち
    c.ai = { cx: bx + randn(rng) * (0.055 + brk), cy: by + randn(rng) * (0.045 + drop * 0.5) + drop * 0.5, te };
    c.ts = this.plateT(c) - SWING_T + te;
  }

  // ---------------------------------------------------------------- 投げている間(defense.update → preContact から毎こま)
  pitchTick(pl, dt) {
    const d = this.d, c = pl.cur, lh = d.g && d.g.hand === 'L';
    // 投手: 投球の動き(セットポジション)。動きの「放す」が球の出る時刻に合うように
    const P = d.fig.P; P.setYawToward(0, 0); P.set('pitch', { t: (motionEvent('pitch_set', 'release') ?? 1.17) + (pl.t - T_REL) });
    // 打者: 構え → 振ったらスイング(動きの「当たる」がバットの来る時刻に合うように)
    if (c.ts != null && pl.t >= c.ts) {
      if (!c.course) c.course = this.swingCourse(c);
      const ce = swingContact(c.course);
      d.batter.set('swing', { t: Math.max(0, pl.t - c.ts - SWING_T + ce), course: c.course, lh });
    } else d.batter.set('bat', { lh });
    if (pl.t < T_REL) { d.ballView.show(false); return; }
    // 球: 本当の物理の軌道(physics.js)。少しゆっくり
    const bt = (pl.t - T_REL) * BALL_TS;
    if (!c.shownBall) { c.shownBall = true; d.ballView.show(true); d.ballView.clearTrail(); }
    // 本塁の前で: 振っていれば当たり・空振りを決める
    if (bt >= c.tP && !c.judged) {
      c.judged = true;
      if (c.ts != null) {
        const te = c.ts + SWING_T - this.plateT(c);
        const cc = c.ai ? { cx: c.ai.cx, cy: c.ai.cy, ...AI_CURSOR, power: false } : { cx: c.cx, cy: c.cy, ...(c.power ? CURSOR.power : CURSOR.meet), power: c.power };
        c.res = hitResult({ bx: c.B[0], by: c.B[1], ...cc, te: c.ai ? c.ai.te : te, hand: d.g.hand, rng: d.rng });
        this.stats.swings++;
        this.showWord(c);
        if (!c.res.miss) { this.stats.contacts++; this.launchHit(pl); return; }
        this.stats.misses++;
      }
    }
    const pos = sampleTraj(c.tr, Math.min(bt, c.tMitt), [0, 0, 0]);
    d.ballView.update(V(pos[0], pos[1], pos[2]), dt * BALL_TS, this.base.camera, 0.02, 0.22);
    if (bt >= c.tMitt && !c.done) {
      c.done = true;
      const kind = c.ts != null ? 'swinging' : c.strike ? 'called' : 'ball';
      this.stats.log.push({ type: c.type, B: c.B.map((v) => +v.toFixed(3)), kind, res: c.res ? { miss: c.res.miss, r: +c.res.r.toFixed(2) } : null });
      d.play = null; d.wait = 99;
      const at = V(pos[0], pos[1], pos[2]);
      this.arr = { t: 0, kind, dur: 0.001, from: at.clone(), to: at.clone() };   // 数え方・審判のコール・捕球の音は watch.js の arriveTick のまま
    }
  }
  // スイングの動きの種類(defense.js の打者の動き: low / high / in / out)
  swingCourse(c) {
    const x = c.ai ? c.ai.cx : c.cx, y = c.ai ? c.ai.cy : c.cy;
    const hs = this.d.g.hand === 'L' ? -1 : 1, inside = -x * hs;
    if (y < 0.66) return 'low';
    if (y > 0.98) return 'high';
    return inside > 0.1 ? 'in' : inside < -0.1 ? 'out' : '';
  }
  // 当たった: 打球を作って、守備の試合の打球として渡す(野手・走者・判定は defense.js のまま)
  launchHit(pl0) {
    const d = this.d, c = pl0.cur, h = c.res;
    const la = h.la * Math.PI / 180, sp = h.spray * Math.PI / 180;
    const p0 = V(c.B[0], c.B[1], ZP);
    const v = V(h.ev * Math.cos(la) * Math.sin(sp), h.ev * Math.sin(la), -h.ev * Math.cos(la) * Math.cos(sp));
    const vd = v.clone().normalize();
    const rpm = h.la > 6 ? 1300 + h.la * 38 : h.la > -4 ? 500 : -900;
    const w = new THREE.Vector3().crossVectors(vd, V(0, 1, 0)).normalize().multiplyScalar(rpm * Math.PI / 30);
    w.y += h.spray * 12 * Math.PI / 30 * 0.3;
    const path = predict(d.world, p0, v, w, 10, { Cd: 0.35, clScale: 1.0, dt: 1 / 240 });
    const type = h.la < 10 ? 'grounder' : h.la < 25 ? 'liner' : h.la > 50 ? 'pop' : 'fly';
    const batted = { path, type, v, w, p0: p0.clone() };
    const fh = path.firstHit ? path.firstHit.p : path.end;
    const ang = Math.atan2(fh.x, -fh.z) * 180 / Math.PI, dist = Math.hypot(fh.x, fh.z);
    h.ang = ang; h.dist = dist; h.type = type;
    this.stats.log.push({ type: c.type, B: c.B.map((x) => +x.toFixed(3)), kind: 'contact', res: { kind: h.kind, r: +h.r.toFixed(2), ev: Math.round(h.ev * 3.6), la: Math.round(h.la), spray: Math.round(h.spray), ang: Math.round(ang), dist: Math.round(dist) } });
    // はっきりしたファウル(本塁より後ろ・線の外へ大きく): 球だけ飛ばして、ファウルを数える
    if (fh.z > 0.3 || Math.abs(ang) > 48 || (dist < 4 && Math.abs(ang) > 40)) {
      d.play = null; d.wait = 99;
      const k = h.kind; this.base.sound.hit(k === 'sweet' ? 'barrel' : k === 'jam' ? 'jam' : k === 'tip' ? 'end' : 'tip', Math.min(1, h.ev * 3.6 / 165));
      d.ballView.clearTrail();
      this.foulFly = { path, t: 0, dur: Math.min(1.6, pathDuration(path)), course: c.course, ts: c.ts };
      h.foul = true;
      return;
    }
    // 捕りに行く野手: 一番早く球に触れられる人(defense.js の reachT)
    let best = 'SS', bt = 1e9;
    for (const k of ['P', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'C']) {
      if (k === 'C' && !(dist < 14 && (type === 'pop' || type === 'grounder'))) continue;
      const t = d.reachT(path, d.homeOf(k), k === 'C' ? 6.6 : 7.5) + (k === 'C' ? 0.3 : 0);
      if (t < bt) { bt = t; best = k; }
    }
    if (dist > 70 && OF.includes(best) === false) best = ang < -15 ? 'LF' : ang > 15 ? 'RF' : 'CF';
    const ofHit = OF.includes(best) && path.firstHit && bt > path.firstHit.t + 0.05;
    // 投げる前の声・歓声(startPlay の中)は打った瞬間には要らないので、その間だけ黙らせる
    const S = this.base.sound;
    const hush = [[d, 'say'], [S, 'crowdEvent'], [d, 'crowdPressure']].map(([o, k]) => { const own = Object.prototype.hasOwnProperty.call(o, k), f = o[k]; o[k] = () => {}; return () => { if (own) o[k] = f; else delete o[k]; }; });
    try { d.startPlay({ fielder: best, L: 0.5, by: 'bat', type, hit: !!ofHit, sitT: 0, make: () => batted }); }
    finally { hush.forEach((f) => f()); }
    const pl = d.play;
    pl.swingCourse = c.course || '';
    pl.cursorHit = h;
    pl.t = pl.contactT - 1e-4;   // 次のこまで当たる(contact)
  }
  // ファウルの球を飛ばす(野手は動かない)。終わったら数える
  foulTick(dt) {
    const F = this.foulFly, d = this.d;
    F.t += dt;
    const pts = F.path.pts, i = Math.min(F.path.n - 1, Math.floor(F.t / F.path.dt));
    d.ballView.show(true);
    d.ballView.update(V(pts[i * 4], pts[i * 4 + 1], pts[i * 4 + 2]), dt, this.base.camera, 0.03, 0.4);
    const lh = d.g && d.g.hand === 'L';
    if (F.course != null) d.batter.set('swing', { t: swingContact(F.course) + F.t, course: F.course, lh });
    if (F.t >= F.dur) {
      this.foulFly = null;
      const at = V(pts[i * 4], pts[i * 4 + 1], pts[i * 4 + 2]);
      this.arr = { t: 0, kind: 'foul', dur: 0.001, from: at.clone(), to: at.clone(), quiet: true };
      d.ballView.show(false);
    }
  }
  // 当たり・空振りの一言(カーソルの所に短く)
  showWord(c) {
    if (c.ai) return;
    const r = c.res;
    const t = r.miss ? '空振り' : r.kind === 'sweet' ? '芯' : r.kind === 'jam' ? '詰まり' : r.kind === 'tip' ? '先っぽ' : '';
    const el = this.ui.word;
    if (!t) return;
    el.textContent = t; el.dataset.k = r.miss ? 'miss' : r.kind;
    this.wordT = 0.9; this.wordAt = { x: c.cx, y: c.cy };
  }

  // ================================================================ 回・試合の区切り(watch.js の物を、片方の攻撃だけ続ける形に)
  changeSides() {
    const d = this.d, g = d.g, s = this.base.sound;
    const ui = d.ctx.ui; if (ui) ui.callBanner('チェンジ', 'play');
    d.say('change', { maxWait: 1 }); s.crowdEvent('change', 0.6);
    g.outs = 0; g.bases = [false, false, false]; g.balls = 0; g.strikes = 0;
    if (g.inning >= 9) { g.over = true; g.result = '試合終了'; this.gameOver(); return; }
    g.inning++;
    this.paOpen = false;
    d.layRunners(); d.snapHome(); d.updateHUD();
    d.later0(1.4, () => { if (d.ctx.ui) d.ctx.ui.callBanner(`${g.inning}回${g.half === 'top' ? '表' : '裏'}`, 'play'); });
    this.gap(2.4);
  }
  gameOver() {
    const d = this.d, g = d.g;
    if (this.overT != null) return;
    g.over = true; this.overT = this.simT; this.stats.games++;
    d.umpCall('game', 0); d.say('game_set', { maxWait: 3 });
    if (d.ctx.ui) d.ctx.ui.callBanner('試合終了', 'play');
    d.updateHUD();
  }
  watchdog() { if (this.waitUser) { this._wdT = this.simT; return; } super.watchdog(); }

  // ================================================================ 毎こま(main.js の stepWorld から)
  update(dt) {
    if (!this.on) return;
    const d = this.d;
    this.simT += dt;
    if (this.overT != null) {
      d.update(dt); this.drawCatcher(dt);
      if (this.simT - this.overT > 7) { this.overT = null; this.newGame(); }
    } else {
      this.autoTest();
      this.bot(dt);
      d.update(dt);
      if (this.foulFly) this.foulTick(dt);
      this.watchdog();
      if (this.arr) this.arriveTick(dt);
      this.drawCatcher(dt);
      // 球と球の間: 投手は投げる前の立ち姿(投球の動きの始まり)で待つ(守備の構えにしない)
      if (!d.play && !this.foulFly && d.fig.P) { const P = d.fig.P; P.setYawToward(0, 0); P.set('pitch', { t: (motionEvent('pitch_set', 'release') ?? 1.17) - T_REL }); }
    }
    this.camTick(dt);
    this.drawUI(dt);
  }
  arriveTick(dt) {
    const a = this.arr, S = this.base.sound;
    if (a && a.quiet && !a.done) { const own = Object.prototype.hasOwnProperty.call(S, 'hit'), h = S.hit; S.hit = () => {}; try { super.arriveTick(dt); } finally { if (own) S.hit = h; else delete S.hit; } }   // ファウルの打球音はもう鳴らした
    else super.arriveTick(dt);
    if (a && a.quiet) this.d.ballView.show(false);
  }
  // 捕手: ミットを球の来る所へ寄せ、球が入る時に「捕る」の動き(drawCatcher は watch.js のまま)
  drawCatcher(dt) {
    super.drawCatcher(dt);
    const d = this.d, F = d.fig.C, pl = d.play;
    if (!F || !pl || !pl.cur || pl.t < T_REL) return;
    const c = pl.cur, bt = (pl.t - T_REL) * BALL_TS;
    const k = clamp((bt - (c.tMitt - 0.32)) / 0.25, 0, 1);
    F.root.position.x += k * clamp(c.B[0] + 0.15, -0.8, 0.8);
    const left = (c.tMitt - bt) / BALL_TS, ec = motionEvent('catcher_receive', 'catch') ?? 0.2;
    if (left < ec && !(c.res && !c.res.miss)) F.set('receive', { t: ec - left });
  }
  // 投げる(マウンドの自分)
  throwNow() {
    if (!this.on || this.kind !== 'mound' || !this.waitUser) return false;
    const rng = this.d.rng, base = MY_PITCHES.find((p) => p[0] === this.ptype);
    const sc = this.ptype === 'FF' ? 0.045 : this.ptype === 'FS' ? 0.065 : 0.06;   // 狙いからのぶれ(m)
    const target = [clamp(this.cur.x + randn(rng) * sc, -0.9, 0.9), clamp(this.cur.y + randn(rng) * sc, 0.15, 1.8)];
    this.beginPitch({ type: this.ptype, kmh: base[2] + randn(rng) * 1.5, target, aim: [this.cur.x, this.cur.y] });
    return true;
  }
  // 振る(打席の自分)
  swingNow() {
    if (!this.on || this.kind !== 'bat') return false;
    const pl = this.d.play; if (!pl || !pl.cur || pl.cur.ts != null || pl.cur.judged) return false;
    if (pl.t < T_REL - 0.2) return false;   // 投げる前は振らない
    const c = pl.cur; c.ts = pl.t; c.cx = this.cur.x; c.cy = this.cur.y; c.power = this.power;
    return true;
  }
  // 試験用: 次の球と、振る所・時刻を決めておく(tools/cursortest.py)
  autoTest() {
    const A = this.auto; if (!A) return;
    const pl = this.d.play; if (!pl || !pl.cur || pl.cur.ts != null || pl.cur.judged || pl.cur.ai) return;
    const c = pl.cur;
    this.cur.x = c.B[0] + (A.dx || 0); this.cur.y = c.B[1] + (A.dy || 0); this.power = !!A.power;
    if (A.take) return;
    const ts = this.plateT(c) - SWING_T + (A.te || 0);
    if (pl.t + 1e-6 >= ts) this.swingNow();
  }

  // ================================================================ カメラ(打つ: 捕手の後ろの高い所 / 投げる: 投手の後ろ / 打った後: 本塁の後ろの高い所から球場全体)
  camTick(dt) {
    const cam = this.base.camera, d = this.d, pl = d.play, asp = innerWidth / Math.max(1, innerHeight);
    const live = !!((pl && !pl.cur && pl.phase !== 'pre') || (pl && pl.cursorHit) || this.foulFly || (this.arr && this.arr.kind === 'foul' && this.arr.quiet));
    const keepWide = live || (this.camK > 0.5 && !pl && (d.wait > 0 && d.wait < 5) && !this.waitUser && !(this.arr));
    const want = live || keepWide ? 1 : 0;
    this.camK += (want - this.camK) * (1 - Math.exp(-(want ? 6 : 4) * dt));
    if (Math.abs(this.camK - want) < 0.002) this.camK = want;
    const vfov = (hfov, minV) => Math.max(minV, 2 * Math.atan(Math.tan(hfov * Math.PI / 360) / asp) * 180 / Math.PI);
    let pos, look, fov;
    const O = this.camOpt && this.camOpt[this.kind];   // 試験で見え方を比べる時だけ
    if (O) { pos = V(...O.pos); look = V(...O.look); fov = vfov(asp < 1 ? O.hp : O.hl, O.mv); }
    else if (this.kind === 'bat') { pos = V(0, 2.9, 5.6); look = V(0, 0.45, -6); fov = vfov(asp < 1 ? 18 : 34, 26); }   // 捕手・審判の頭より上からゾーンを見る
    else { pos = V(asp < 1 ? 0.3 : 0.5, 1.95, -22.0); look = V(0, 1.0, 0); fov = vfov(asp < 1 ? 8.5 : 18, 10); }   // 投手の後ろから本塁を見る(投手の頭と肩が手前の横に入る)
    if (this.camK > 0) {
      const wp = V(0, 13.5, 23), wl = V(0, 0, -44), wf = vfov(78, 44);
      const k = this.camK * this.camK * (3 - 2 * this.camK);
      pos.lerp(wp, k); look.lerp(wl, k); fov += (wf - fov) * k;
    }
    cam.position.copy(pos); cam.lookAt(look);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }

  // ================================================================ 画面の部品(ゾーン・カーソル・振る/投げるのボタン・球種)
  buildUI() {
    const st = document.createElement('style');
    st.textContent = `
#cpUI{position:fixed;inset:0;z-index:8;pointer-events:none;font-family:"Hiragino Sans","Yu Gothic UI","Meiryo",sans-serif}
#cpUI.hide{display:none}
body.cursorplay #hint{display:none!important}
#cpUI svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
#cpUI .zone{fill:rgba(255,255,255,.06);stroke:rgba(255,255,255,.75);stroke-width:2}
#cpUI .grid{stroke:rgba(255,255,255,.28);stroke-width:1}
#cpUI .cur{fill:rgba(253,200,3,.16);stroke:#fdc803;stroke-width:3}
#cpUI.power .cur{fill:rgba(237,96,1,.2);stroke:#ff7a1a}
#cpUI .core{fill:#fdc803}
#cpUI.power .core{fill:#ff7a1a}
#cpUI .aim{fill:none;stroke:#fdc803;stroke-width:3}
#cpUI .aimdot{fill:#fff;stroke:#06264a;stroke-width:2}
#cpUI .word{position:absolute;transform:translate(-50%,-140%);font-weight:900;font-size:26px;color:#fff;-webkit-text-stroke:4px #06264a;paint-order:stroke fill;opacity:0;transition:opacity .15s}
#cpUI .word[data-k=sweet]{color:#fdc803}
#cpUI .word[data-k=miss]{color:#d1eefd}
#cpUI .btns{position:absolute;right:max(16px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));display:flex;flex-direction:column;align-items:flex-end;gap:10px;pointer-events:none}
#cpUI button{pointer-events:auto;border:3px solid #fff;color:#fff;font-family:inherit;font-weight:900;cursor:pointer;-webkit-text-stroke:3px #06264a;paint-order:stroke fill;touch-action:none;user-select:none;-webkit-user-select:none}
#cpUI .main{width:92px;height:92px;border-radius:50%;font-size:22px;background:radial-gradient(circle at 50% 35%,#ff8a2a,#ed6001);box-shadow:0 4px 0 rgba(0,0,0,.35)}
#cpUI .main:active,#cpUI .main.on{transform:translateY(3px);box-shadow:0 1px 0 rgba(0,0,0,.35)}
#cpUI .sub{min-width:92px;height:40px;border-radius:20px;font-size:16px;background:#0152ae;box-shadow:0 3px 0 rgba(0,0,0,.3)}
#cpUI.power .sub.pw{background:#ed6001}
#cpUI .types{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;max-width:220px}
#cpUI .types button{height:38px;padding:0 10px;border-radius:19px;font-size:14px;background:#0b3a66;border-width:2px;-webkit-text-stroke:2px #06264a}
#cpUI .types button.sel{background:#fdc803;color:#06264a;-webkit-text-stroke:0;border-color:#fff}
#cpUI.bat .types,#cpUI.mound .pw{display:none}
#cpUI.mound:not(.ready) .main{opacity:.45}
#cpUI.wide .btns,#cpUI.wide svg{opacity:0;transition:opacity .2s}
@media (orientation:landscape) and (max-height:500px){#cpUI .main{width:80px;height:80px;font-size:20px}#cpUI .types{max-width:300px}}
`;
    document.head.appendChild(st);
    const root = document.createElement('div'); root.id = 'cpUI'; root.className = 'hide';
    const NS = 'http://www.w3.org/2000/svg', mk = (tag, cls, par) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); par.appendChild(e); return e; };
    const svg = mk('svg', '', root);
    const zone = mk('polygon', 'zone', svg);
    const grid = [0, 1, 2, 3].map(() => mk('line', 'grid', svg));
    const cur = mk('ellipse', 'cur', svg), core = mk('circle', 'core', svg);
    const aim = mk('circle', 'aim', svg), aimDot = mk('circle', 'aimdot', svg);
    const word = document.createElement('div'); word.className = 'word'; root.appendChild(word);
    const btns = document.createElement('div'); btns.className = 'btns'; root.appendChild(btns);
    const types = document.createElement('div'); types.className = 'types'; btns.appendChild(types);
    const tBtns = MY_PITCHES.map(([k, name], i) => { const b = document.createElement('button'); b.textContent = name; b.dataset.k = k; b.title = `${i + 1}`; types.appendChild(b); return b; });
    const pw = document.createElement('button'); pw.className = 'sub pw'; pw.textContent = 'ミート'; btns.appendChild(pw);
    const main = document.createElement('button'); main.className = 'main'; main.textContent = '振る'; btns.appendChild(main);
    document.body.appendChild(root);
    this.ui = { root, svg, zone, grid, cur, core, aim, aimDot, word, main, pw, tBtns };
    const tap = (el, fn) => {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
      el.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
    };
    tap(main, () => { if (this.kind === 'bat') this.swingNow(); else this.throwNow(); main.classList.add('on'); setTimeout(() => main.classList.remove('on'), 120); });
    tap(pw, () => this.setPower(!this.power));
    tBtns.forEach((b) => tap(b, () => this.setType(b.dataset.k)));
  }
  setPower(on) { this.power = !!on; this.ui.root.classList.toggle('power', this.power); this.ui.pw.textContent = this.power ? '強振' : 'ミート'; }
  setType(k) { this.ptype = k; this.ui.tBtns.forEach((b) => b.classList.toggle('sel', b.dataset.k === k)); this.ui.main.textContent = this.kind === 'mound' ? '投げる' : '振る'; }
  // 世界の点 → 画面の px
  scr(x, y, z = ZP) { const v = V(x, y, z).project(this.base.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, v.z]; }
  // 画面の px → カーソルの面の点
  fromScreen(px, py) {
    const cam = this.base.camera, rc = new THREE.Raycaster();
    rc.setFromCamera({ x: px / innerWidth * 2 - 1, y: -(py / innerHeight) * 2 + 1 }, cam);
    const t = (ZP - rc.ray.origin.z) / rc.ray.direction.z;
    const p = rc.ray.origin.clone().addScaledVector(rc.ray.direction, t);
    return { x: clamp(p.x, -0.75, 0.75), y: clamp(p.y, 0.2, 1.5) };
  }
  // 1 px あたりの m(指でなぞった分だけカーソルを動かす時)
  mPerPx() { const a = this.scr(ZONE.x0, 0.8), b = this.scr(ZONE.x1, 0.8); return (ZONE.x1 - ZONE.x0) / Math.max(20, Math.abs(b[0] - a[0])); }
  drawUI(dt) {
    const U = this.ui, pl = this.d.play;
    const wide = this.camK > 0.35;
    U.root.classList.toggle('wide', wide);
    if (wide) { this.wordT = 0; U.word.style.opacity = 0; return; }
    const pts = [[ZONE.x0, ZONE.y0], [ZONE.x1, ZONE.y0], [ZONE.x1, ZONE.y1], [ZONE.x0, ZONE.y1]].map(([x, y]) => this.scr(x, y));
    U.zone.setAttribute('points', pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '));
    const gx = [1, 2].map((i) => ZONE.x0 + (ZONE.x1 - ZONE.x0) * i / 3), gy = [1, 2].map((i) => ZONE.y0 + (ZONE.y1 - ZONE.y0) * i / 3);
    [[gx[0], ZONE.y0, gx[0], ZONE.y1], [gx[1], ZONE.y0, gx[1], ZONE.y1], [ZONE.x0, gy[0], ZONE.x1, gy[0]], [ZONE.x0, gy[1], ZONE.x1, gy[1]]].forEach((L, i) => {
      const a = this.scr(L[0], L[1]), b = this.scr(L[2], L[3]);
      U.grid[i].setAttribute('x1', a[0]); U.grid[i].setAttribute('y1', a[1]); U.grid[i].setAttribute('x2', b[0]); U.grid[i].setAttribute('y2', b[1]);
    });
    const C = this.cur, c0 = this.scr(C.x, C.y);
    if (this.kind === 'bat') {
      // 振った後はカーソルを振った所で止めて見せる
      const c = pl && pl.cur && pl.cur.ts != null ? { x: pl.cur.cx, y: pl.cur.cy } : C;
      const sz = (pl && pl.cur && pl.cur.ts != null ? pl.cur.power : this.power) ? CURSOR.power : CURSOR.meet;
      const p = this.scr(c.x, c.y), px = this.scr(c.x + sz.rx, c.y), py = this.scr(c.x, c.y + sz.ry);
      U.cur.setAttribute('cx', p[0]); U.cur.setAttribute('cy', p[1]);
      U.cur.setAttribute('rx', Math.abs(px[0] - p[0])); U.cur.setAttribute('ry', Math.abs(py[1] - p[1]));
      U.core.setAttribute('cx', p[0]); U.core.setAttribute('cy', p[1]); U.core.setAttribute('r', 3.5);
      U.cur.style.display = U.core.style.display = ''; U.aim.style.display = U.aimDot.style.display = 'none';
    } else {
      const showAim = this.waitUser || (pl && pl.cur && !pl.cur.judged);
      const a = pl && pl.cur && pl.cur.aim ? { x: pl.cur.aim[0], y: pl.cur.aim[1] } : C;
      const p = this.waitUser ? c0 : this.scr(a.x, a.y), pr = this.scr(a.x + 0.06, a.y);
      U.aim.setAttribute('cx', p[0]); U.aim.setAttribute('cy', p[1]); U.aim.setAttribute('r', Math.max(9, Math.abs(pr[0] - p[0])));
      U.aimDot.setAttribute('cx', p[0]); U.aimDot.setAttribute('cy', p[1]); U.aimDot.setAttribute('r', 3.5);
      U.aim.style.display = U.aimDot.style.display = showAim ? '' : 'none';
      U.cur.style.display = U.core.style.display = 'none';
    }
    // 一言
    if (this.wordT > 0) {
      this.wordT -= dt;
      const w = this.scr(this.wordAt.x, this.wordAt.y + 0.1);
      U.word.style.left = w[0] + 'px'; U.word.style.top = w[1] + 'px'; U.word.style.opacity = Math.min(1, this.wordT / 0.3);
    } else U.word.style.opacity = 0;
  }

  // ================================================================ 入力(main.js より先に受ける。カーソルの遊びの間だけ)
  bindInput() {
    const canvas = this.base.canvas;
    const moveTo = (x, y) => { const p = this.fromScreen(x, y); this.cur.x = p.x; this.cur.y = p.y; };
    const act = () => (this.kind === 'bat' ? this.swingNow() : this.throwNow());
    const busy = () => !this.on || (window.__app && window.__app.overlay) || document.querySelector('#panel:not(.hide),#credits:not(.hide)');
    // 打席を出る・マウンドを降りる(main.js の同じボタンより先に受ける)
    addEventListener('click', (e) => { if (this.on && e.target && e.target.closest && e.target.closest('#exitMode')) { e.stopPropagation(); this.exit(); } }, true);
    addEventListener('mousemove', (e) => { if (busy() || this.base.IS_TOUCH) return; moveTo(e.clientX, e.clientY); }, true);
    addEventListener('mousedown', (e) => {
      if (busy() || e.target !== canvas) return;
      e.stopPropagation(); e.preventDefault();
      moveTo(e.clientX, e.clientY);
      if (e.button === 2) { if (this.kind === 'bat') this.setPower(!this.power); return; }
      act();
    }, true);
    addEventListener('keydown', (e) => {
      if (busy() || e.code === 'Escape') return;
      let used = true;
      if (e.code === 'Space' || e.code === 'Enter') { if (!e.repeat) act(); }
      else if (/^Digit[1-4]$/.test(e.code) && this.kind === 'mound') this.setType(MY_PITCHES[+e.code.slice(5) - 1][0]);
      else if ((e.code === 'KeyF' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && this.kind === 'bat') { if (!e.repeat) this.setPower(!this.power); }
      else if (e.code === 'KeyE' || e.code === 'KeyQ') this.exit();
      else if (/^(Arrow|Key[WASD])/.test(e.code)) { const s = 0.03, k = e.code; if (/Up|KeyW/.test(k)) this.cur.y += s; if (/Down|KeyS/.test(k)) this.cur.y -= s; if (/Left|KeyA/.test(k)) this.cur.x -= s; if (/Right|KeyD/.test(k)) this.cur.x += s; this.cur.x = clamp(this.cur.x, -0.75, 0.75); this.cur.y = clamp(this.cur.y, 0.2, 1.5); }
      else used = false;
      if (used) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    // 指: 画面の左半分をなぞるとカーソルが動く(なぞった分だけ)。右半分をたたくと 振る/投げる(ボタンでも)
    const T = { id: null, x: 0, y: 0 };
    addEventListener('touchstart', (e) => {
      if (busy()) return;
      let used = false;
      for (const t of e.changedTouches) {
        const el = document.elementFromPoint(t.clientX, t.clientY);
        if (el && (el.closest('#cpUI button') || el.closest('.corner,#exitMode,.screen'))) continue;
        used = true;
        if (t.clientX < innerWidth * 0.55) { if (T.id === null) { T.id = t.identifier; T.x = t.clientX; T.y = t.clientY; } }
        else act();
      }
      if (used) { e.preventDefault(); e.stopPropagation(); }
    }, { capture: true, passive: false });
    addEventListener('touchmove', (e) => {
      if (busy()) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== T.id) continue;
        const k = this.mPerPx() * 1.15;
        this.cur.x = clamp(this.cur.x + (t.clientX - T.x) * k, -0.75, 0.75); this.cur.y = clamp(this.cur.y - (t.clientY - T.y) * k, 0.2, 1.5);
        T.x = t.clientX; T.y = t.clientY;
        e.preventDefault(); e.stopPropagation();
      }
    }, { capture: true, passive: false });
    const end = (e) => { for (const t of e.changedTouches) if (t.identifier === T.id) T.id = null; };
    addEventListener('touchend', end, true); addEventListener('touchcancel', end, true);
  }
  summary() { return { ...super.summary(), kind: this.kind, swings: this.stats.swings, contacts: this.stats.contacts, misses: this.stats.misses, log: this.stats.log.slice(-20) }; }
}
