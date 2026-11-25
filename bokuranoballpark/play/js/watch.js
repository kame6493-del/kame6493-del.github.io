// 観戦のモード(11/18 夜 持ち主「試合観戦中で球場を歩けるような」「1回から9回まで1球ずつちゃんと投げられて」)
// 守備の試合の頭(defense.js・brain.js・rules.js)をそのまま使い、CPU 同士の試合を 1 球ずつ進める。自分(観客)は球場を自由に歩く。
// しくみ:
//  - defense.js は「自分の守る野手(this.my)」が要る作りなので、捕手(C)を「見えない操作の人」(proxy)に任せ、
//    その人を下の bot が自動で動かす。defense.ctx を、player・UI などを差し替えた ctx にしてから begin する。
//    本物の歩く人(main.js の player)は試合に関わらない(打球・送球・走者はすり抜ける)。
//  - 1 球ごと: 打球にならない球(ボール・見逃し・空振り・死球)は startPlay の投球の動きを使い、当たる瞬間(contact)を横取りして
//    捕手のミットへ。ファウル・打球は startPlay の打球をそのまま(野手・走者・判定・実況は defense.js のまま)。
//  - 投球の間は本物に近く(9〜13 秒、打者が替わる時は +5 秒、攻守交代は 45 秒)。?wfast=N で N 倍速(試験用)。
import * as R from './rules.js';
import { Walkers } from './walkers.js';   // コンコース・通路を歩く人・売店・売り子
import { Seiretsu } from './seiretsu.js';   // 11/21 試合の終わり・始まりの整列(高校野球)・ハイタッチ(プロ風)

const OF = ['LF', 'CF', 'RF'];
// ファウルの種類の割合。転がる・ライナーのファウルを野手が止めるとアウトに数えられることがあるので少なめ(1 試合 40 本のうちファウルフライのアウトが 2〜3 個になるように)
// foul_tip(バックネットへのチップ)は打球にすると捕手が捕ってアウトになるので、投球と同じ扱い(ミットの後ろへ・カウントだけ)。foul_line はフェアになりやすいので使わない
const FOUL_W = [['tip', 45], ['foul_stands', 42], ['foul_fly', 8], ['foul_grounder', 5]];

export class Watch {
  constructor({ THREE, defense, ctx, params, getUI, getScoreboard }) {
    Object.assign(this, { THREE, d: defense, base: ctx, params, getUI, getScoreboard });
    this.on = false;
    this.fast = Math.max(1, +(params.get('wfast') || 1));
    this.stats = null;
    this.proxy = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: true, mv: new THREE.Vector3(), lastSafe: new THREE.Vector3() };
    this.pctx = this.makeCtx();
    this.sei = new Seiretsu(this);   // ?noseiretsu=1 で前の形(試合終了の札のあと 30 秒で次の試合)
  }
  // ---------------------------------------------------------------- defense に渡す ctx(本物の ctx を元に、自分に関わる所だけ差し替える)
  makeCtx() {
    const b = this.base, px = Object.create(b), self = this, P = this.proxy;
    const def = (k, v) => Object.defineProperty(px, k, { value: v, writable: true, configurable: true });
    const get = (k, f) => Object.defineProperty(px, k, { get: f, configurable: true });
    get('mode', () => 'defense');
    def('player', P);
    def('input', { f: 0, r: 0, jump: false });
    def('setMode', () => {});
    def('placeAt', (x, z) => { const g = b.groundAt(x, z, 3, 10); P.pos.set(x, g ?? 0, z); P.vel.set(0, 0, 0); });
    def('setCamOverride', () => {});
    def('setViewQuiet', () => {});
    def('releasePointer', () => {});
    def('lockPointer', () => {});
    def('hud', () => {});
    def('refreshHint', () => {});
    def('myHandPos', () => P.pos.clone().add(new this.THREE.Vector3(0, 1.2, 0)));
    def('meFig', () => self.d.fig.C);
    def('meYaw', () => P.yaw);
    def('lookIdle', () => 0);
    get('fixedView', () => true);
    get('view', () => 'tv');
    const noop = () => {};
    get('ui', () => {
      const ui = self.getUI(); if (!ui) return null;
      if (!self._ui || self._ui.src !== ui) {
        self._ui = {
          src: ui,
          board: (g) => ui.board(g), callBanner: (...a) => ui.callBanner && ui.callBanner(...a), homeRun: (...a) => ui.homeRun && ui.homeRun(...a),
          situation: noop, pad: (...a) => { if (self.intr && self.intr.holding) ui.pad(...a); else ui.pad('hide'); }, padHint: noop, acts: noop, skip: noop, digest: (s) => { if (!s) ui.digest(null); }, evalPop: noop, result: noop,
        };
      }
      return self._ui;
    });
    return px;
  }

  // ---------------------------------------------------------------- 始める・やめる
  start() {
    const d = this.d;
    if (this.on) this.stop();
    this.on = true;
    this.realCtx = d.ctx;
    d.ctx = this.pctx;
    this.patch();
    this.stats = { pitches: 0, H: { them: 0, us: 0 }, K: { them: 0, us: 0 }, BB: { them: 0, us: 0 }, HR: { them: 0, us: 0 }, PA: { them: 0, us: 0 }, games: 0 };
    this.simT = 0; this.gapUntil = null; this.paOpen = false; this.arr = null; this.overT = null; this.pc = null; this.pcWait = null;
    d.begin({ mode: 'game', pos: 'C', diff: 'normal', mark: 'off', keepDiff: true });   // 見えない捕手の手の届く所は ふつう(1.2 m)のまま。1.4 m だと打った瞬間の球を捕ってしまう
    d.watching = true;
    this.base.sound.watchMode = true;
    this.gameT0 = this.simT;
    this.setKits('top');
    this.firstPitch = true;
    this.startWalkers();
    this.gap(this.fast > 1 ? 1 : 2.5);
    // 11/20 試合が始まる合図(最初の試合も、終わって次の試合が自動で始まる時も)。detail: { game(この観戦で何試合目か、1 から), restart(次の試合なら true), stadium }
    this.gameNo = (this.gameNo || 0) + 1;
    try { window.dispatchEvent(new CustomEvent('gamestart', { detail: { game: this.gameNo, restart: this.gameNo > 1, stadium: (this.base && this.base.stadium) || null } })); } catch (e) { /* 聞く人がいなくても試合は始まる */ }
    // 11/21 高校野球で、前の試合から続けて始まる時は、両チームがベンチから出て整列・礼をしてから(js/seiretsu.js)
    if (this._restarting && !this.params.has('noseiretsu') && this.sei.style() === 'hs') this.sei.beginOpen(); else this.sei.restoreUmps();
    // 乱入(11/20 持ち主「守備人として乱入できる感じに」): グラウンドに降りた自分が打球を先に捕れる。捕ったら 1〜4 のキー・送球のボタンで投げる
    this.intr = { holding: false, pl: null, n: 0 };
    d.intruder = { grab: (pl, p, tt) => this.intrGrab(pl, p, tt) };
    this._kd = (e) => {
      if (!this.intr || !this.intr.holding) return;
      const m = /^Digit([1-4])$/.exec(e.code); if (!m) return;
      const pl = this.d.play; if (!pl || pl.holder !== 'me' || !pl.choiceOpen) return;
      e.preventDefault(); e.stopPropagation(); const k = +m[1]; this.d.chooseBase(k === 4 ? 0 : k);
    };
    addEventListener('keydown', this._kd, true);
    window.__watch = this;
  }
  // 自分がグラウンド(フェアの所はフェンスの内側、ファウルの所は本塁・一塁・三塁のまわり)に立っているか
  intrOnField() {
    const b = this.base; if (b.mode !== 'walk') return false;
    const pp = b.player.pos; if (pp.y > 1.6 || pp.y < -1) return false;
    const r = Math.hypot(pp.x, pp.z), ang = Math.atan2(pp.x, -pp.z) * 180 / Math.PI;
    if (Math.abs(ang) <= 45) { const f = b.fenceDist ? b.fenceDist(ang) : 100; return r <= f + 0.5; }
    return Math.abs(ang) < 135 ? r < 42 : r < 20;
  }
  // 打球が自分の手の届く所(横 1.1 m、足もとから 2.35 m。跳べばその分高く)を通ったら、自分が捕る
  intrGrab(pl, p, tt) {
    const I = this.intr;
    if (!I || I.holding || pl.watchPitch || !pl.batted || pl.endT != null || !this.intrOnField()) return false;
    const pp = this.base.player.pos;
    const dh = Math.hypot(p.x - pp.x, p.z - pp.z), hb = p.y - pp.y;
    const air = !this.base.player.onGround;   // 跳んでいる時は腕を上へ伸ばす分も届く(フェンス際でホームランを奪える)
    // フェンス際(1.4 m 以内)で跳んだ時は、守備の試合と同じくフェンスに手をかけて上へグラブを伸ばせる(地面から 3.95 m まで。ホームランを奪える)
    const r = Math.hypot(pp.x, pp.z), ang = Math.atan2(pp.x, -pp.z) * 180 / Math.PI;
    const nearF = Math.abs(ang) <= 45 && this.base.fenceDist && this.base.fenceDist(ang) - r < 1.4;
    const gy = this.base.groundAt(pp.x, pp.z, pp.y + 2, 10) ?? 0;
    // 11/20 観戦では跳ぶ高さを上げた(0.93 m)。フェンス際の届く高さは守備の試合と同じ地面から 3.95 m のまま(ホームランを奪いやすくなりすぎないように)
    const top = air ? (nearF ? Math.max(gy + 3.95 - pp.y, 2.95) : 2.95) : 2.35;
    if (dh > 1.1 || hb < -0.15 || hb > top) return false;
    const P = this.proxy;
    P.pos.copy(pp); P.vel.set(0, 0, 0); P.yaw = this.base.player.yaw;
    I.holding = true; I.pl = pl; I.n++;
    pl.intruder = true;
    if (pp.y - (this.base.groundAt(pp.x, pp.z, pp.y + 2, 10) ?? 0) > 0.25 || p.y - pp.y > 2.0) pl.special = 'jump';   // 跳んで・高い所で捕った: ファインプレー(実況・歓声)
    return true;
  }
  stop() {
    if (!this.on) return;
    const d = this.d;
    this.on = false;
    this.sei.abort();   // 整列の途中でやめた時(控え・攻める側の体を隠し、審判を守備位置へ)
    d.intruder = null; this.intr = null;
    if (this._kd) { removeEventListener('keydown', this._kd, true); this._kd = null; }
    d.stop(true);
    this.setKits('top');   // 守備の試合へ戻った時のために元へ
    const S = this.base.sound; S.watchMode = false; S.batDistK = null; if (S.muffleK) S.setMuffle(0);
    d.watching = false;
    if (this.walkers) this.walkers.setVisible(false);
    this.unpatch();
    d.ctx = this.realCtx || this.base;
    const ui = this.getUI(); if (ui) { ui.board(null); ui.digest(null); }
  }
  // defense の関数を観戦の間だけ包む(defense.js は書き換えない)
  patch() {
    const d = this.d, self = this;
    this.orig = { nextPA: d.nextPA, endGame: d.endGame, contact: d.contact, preContact: d.preContact, homeRun: d.homeRun, applyResult: d.applyResult };
    d.nextPA = function () { return self.nextPitch(); };
    d.endGame = function () { return self.gameOver(); };
    d.contact = function (pl) { if (pl.watchPitch) return self.pitchArrive(pl); return self.orig.contact.call(this, pl); };
    d.preContact = function (pl, dt) {
      self.orig.preContact.call(this, pl, dt);
      if (pl.watchPitch && pl.watchPitch !== 'swinging' && pl.watchPitch !== 'foul') this.batter.set('bat', { lh: this.g && this.g.hand === 'L' });   // 見送る球は振らない
    };
    // 本塁打: 観戦では入ってから 3 秒見せて次へ(defense.js の 1.5 秒を 3 秒に替える。11/18 夜 持ち主「テンポ」)
    d.homeRun = function (pl) {
      const n0 = (pl.timers || []).length;
      self.orig.homeRun.call(this, pl);
      if (pl.timers && pl.timers.length > n0) pl.timers.splice(n0);
      this.later(3.0, () => { if (this.play === pl && pl.endT == null) this.finishPlay(pl, 'ホームラン'); });   // 入ったら 3 秒で次へ(一周は待たない)
    };
    d.applyResult = function (pl) {
      const g = this.g, half = g.half, side = half === 'top' ? 'them' : 'us';
      const br = this.batterRunner, foul = pl.label === 'ファウル';
      if (pl.opt && /^foul_/.test(pl.opt.type || '')) { const F = self.stats.foulEnd || (self.stats.foulEnd = {}); const k = pl.label || (br && br.out ? 'out' : 'other'); F[k] = (F[k] || 0) + 1; }
      const score0 = this.g.score[side];
      self.orig.applyResult.call(this, pl);
      if (!foul) {
        self.paOpen = false;
        self.stats.PA[side]++;
        if (pl.label === 'ホームラン') { self.stats.H[side]++; self.stats.HR[side]++; }
        else if (br && !br.out && !pl.fieldedByError) {
          self.stats.H[side]++;
          // 安打の歓声(点が入った時は defense.js が score を鳴らすので、点が無い時だけ。長打は大きく)
          if (this.g.score[side] === score0) this.ctx.sound.crowdEvent(br.from >= 2 ? 'longhit' : 'hit', br.from >= 2 ? 0.8 : 0.6);
        }
      } else if (this.contPA) { /* 打席は続く */ }
      if (g.outs >= 3 || g.over) self.paOpen = false;
      this.contPA = false;
    };
  }
  unpatch() {
    const d = this.d;
    if (!this.orig) return;
    for (const k of Object.keys(this.orig)) delete d[k];   // 自分の物(インスタンスの上書き)を消すと、元の prototype の関数に戻る
    this.orig = null;
  }
  gap(sec) { this.gapUntil = this.simT + sec / this.fast; this.d.wait = sec / this.fast + 0.05; }

  // ---------------------------------------------------------------- 投手交代(11/20)
  // 守っている側の今の投手: 球数・この投手で取られた点・背番号・交代の回数。side は 'home'(後攻 = 表に守る)/ 'away'
  pcState() {
    const g = this.d.g, side = g.half === 'top' ? 'home' : 'away';
    if (!this.pc) this.pc = {};
    if (!this.pc[side]) { const rng = this.d.rng; this.pc[side] = { side, n: 0, num: 1, starter: true, changes: 0, limit: 90 + Math.round(rng() * 20), runs0: 0, lateChecked: null }; }
    return this.pc[side];
  }
  // 打席の間に、交代するかを決める。交代したら合図(window の 'pitcherchange')を出して、救援投手がマウンドに着くまで待つ
  //   合図: new CustomEvent('pitcherchange', { detail: { side, from, to, inning, half, pitches, runs, why, waitSec, maxWaitSec } })
  //   聞いた側(リリーフカーなど)は window.__watch.holdForReliever(秒) で待ち時間を延ばし(最長 maxWaitSec)、着いたら window.__watch.relieverArrived() を呼ぶ。
  //   誰も何もしなければ、救援投手が歩いて(小走りで)来る waitSec 秒で再開する
  pitcherChange() {
    const d = this.d, g = d.g, rng = d.rng, P = this.pcState();
    const bat = g.half === 'top' ? 'them' : 'us', runs = g.score[bat] - P.runs0;
    const total = Object.values(this.pc).reduce((a, x) => a + x.changes, 0);
    if (P.changes >= 2 || total >= 3 || g.outs >= 3) return false;
    let why = null;
    if (P.n >= P.limit) why = '球数';
    else if (runs >= (P.starter ? 6 : 4)) why = '失点';
    else if (g.inning >= 7 && P.starter && P.n >= 70 && P.lateChecked !== `${g.inning}${g.half}`) { P.lateChecked = `${g.inning}${g.half}`; if (rng() < 0.45) why = '終盤'; }
    if (!why) return false;
    const from = P.num, to = P.changes === 0 ? 10 + Math.floor(rng() * 2) * 8 : 11 + Math.floor(rng() * 3);   // 救援投手の背番号(10・18、二人目は 11〜13)
    Object.assign(P, { n: 0, num: to, starter: false, changes: P.changes + 1, limit: 25 + Math.round(rng() * 25), runs0: g.score[bat] });
    const waitSec = 18, maxWaitSec = 38;
    const detail = { side: P.side, from, to, inning: g.inning, half: g.half, pitches: this.stats.pitches, runs, why, waitSec, maxWaitSec };
    (this.pcLog = this.pcLog || []).push({ ...detail, simT: +this.simT.toFixed(1) });
    if (d.ctx.ui) d.ctx.ui.callBanner('ピッチャー交代', 'play');
    this.base.sound.crowdEvent('change', 0.4);
    if (d.fig.P && d.fig.P.setNumber) d.fig.P.setNumber(String(to));
    this.pcWait = { t0: this.simT, max: this.simT + maxWaitSec / this.fast };
    this.gap(waitSec);
    try { window.dispatchEvent(new CustomEvent('pitcherchange', { detail })); } catch (e) { /* 聞く人がいなくても試合は続く */ }
    return true;
  }
  // 救援投手を運ぶ側(リリーフカー)から: 待ち時間を延ばす(秒。合図から数えて最長 maxWaitSec)・着いたので再開する
  holdForReliever(sec) { if (!this.pcWait) return false; this.gapUntil = Math.min(this.pcWait.max, Math.max(this.gapUntil ?? this.simT, this.simT + sec / this.fast)); this.d.wait = this.gapUntil - this.simT + 0.05; return true; }
  relieverArrived() { if (!this.pcWait) return false; this.pcWait = null; this.gapUntil = Math.min(this.gapUntil ?? this.simT, this.simT + 1.2 / this.fast); this.d.wait = this.gapUntil - this.simT + 0.05; return true; }

  // ---------------------------------------------------------------- 1 球ずつ
  nextPitch() {
    const d = this.d, g = d.g, rng = d.rng;
    if (!this.on) return;
    if (g.over) { this.gameOver(); return; }
    if (this.gapUntil == null) {
      // 前の打席(プレー)が終わった: 次の打席までの間(打席の間 2〜3 秒、攻守交代 5〜8 秒。11/18 夜 持ち主「テンポが悪い」)
      const changing = g.outs >= 3;
      if (changing) { this.changeSides(); return; }   // 3 アウト: すぐ交代(間は changeSides が決める)
      this.gap(1.0 + rng() * 0.6);   // 11/20 持ち主「なるべくサクサクに」: 打席の間 1.5〜2.5 → 1.0〜1.6 秒(プレーの後の 1.15 秒はそのまま)
      return;
    }
    if (this.simT < this.gapUntil) { d.wait = this.gapUntil - this.simT + 0.05; return; }
    this.gapUntil = null; this.pcWait = null;
    if (g.outs >= 3) return this.nextPitch();
    if (this.firstPitch) { this.firstPitch = false; d.umpCall('play', 0); d.say(['play_ball'], { maxWait: 1 }); }
    if (!this.paOpen && this.pitcherChange()) return;   // 投手交代(救援投手がマウンドに着くまで待つ)
    if (!this.paOpen) {
      g.pa++; g.balls = 0; g.strikes = 0; g.hand = rng() < 0.35 ? 'L' : 'R';
      this.paOpen = true;
      d.layRunners();
      if (d.batter && d.batter.setNumber) d.batter.setNumber(String(d.batterNum()));
    }
    // 打席の中の球は裏で 1 球ずつ数えて飛ばし、打席を決める 1 球(打球・三振の最後の球・四球・死球)だけを見せる
    for (let n = 0; n < 40; n++) {
      // 盗塁(一塁走者だけ。結果は規則で決めて、走者を置き直す)
      if (R.stealChance(g) && rng() < 0.03) {
        const t = R.resolveSteal(g, rng);
        d.layRunners();
        if (d.ctx.ui) d.ctx.ui.callBanner(/成功/.test(t) ? '盗塁成功' : '盗塁失敗', /成功/.test(t) ? 'safe' : 'out');
        d.say('steal', { cut: true });
        if (g.outs >= 3) { this.paOpen = false; this.gap(1.5); return; }
      }
      const k = R.pitchKind(rng, g);
      this.stats.pitches++;
      this.pcState().n++;   // 今の投手の球数
      if (k === 'inplay') { d.updateHUD(); return this.ballInPlay(R.chooseBIP(rng, g)); }
      const final = k === 'hbp' || (k === 'ball' && g.balls >= 3) || ((k === 'called' || k === 'swinging') && g.strikes >= 2);
      if (final) {
        d.updateHUD();
        d.startPlay({ fielder: 'SS', L: 0.2, by: 'bat', type: 'grounder', sitT: 0, plan: {} });   // 11/20 打球にならない球: 守備の割り当てをしない(前は遊撃ゴロの割り当てで、毎球 投手が一塁の後ろへ走っていた)
        const pl = d.play;
        pl.watchPitch = k;
        if (k === 'swinging') pl.swingCourse = 'miss';
        return;
      }
      const res = R.applyPitch(g, k, rng);   // ボール・ストライク・ファウル(数えるだけ)。暴投・捕逸は走者を進める
      if (res) { d.layRunners(); if (g.over) { this.gameOver(); return; } }
    }
    this.paOpen = false; this.gap(1);
  }
  ballInPlay(bip) {
    const d = this.d, rng = d.rng;
    if (bip.type === 'hr') {
      const ang = (bip.zone === 'LF' ? -28 : bip.zone === 'RF' ? 28 : 0) + (rng() * 2 - 1) * 12;
      d.startPlay({ fielder: bip.zone, L: 0.5, by: 'bat', type: 'fly', sitT: 0, make: (p0) => d.makeFenceBall(ang, 2 + rng() * 9, p0) });
      return;
    }
    let of = OF.includes(bip.zone);
    // 内野を抜ける安打(rules.js の resolveBIP と同じ割合: ゴロ 72%・ライナー 90%)は、抜けた先の外野の前へ
    if (bip.hit && !of && (bip.type === 'grounder' || bip.type === 'liner') && rng() < (bip.type === 'grounder' ? 0.72 : 0.9)) {
      const thru = { '3B': 'LF', SS: rng() < 0.6 ? 'LF' : 'CF', P: 'CF', '2B': rng() < 0.5 ? 'CF' : 'RF', '1B': 'RF', C: 'CF' }[bip.zone] || 'CF';
      bip = { ...bip, zone: thru, type: 'grounder', thru: true }; of = true;
    }
    if (bip.hit && of && bip.type !== 'bunt') {
      // 外野の安打: 外野手の前・間に落とす(defense.js の coverScene と同じ作り)
      const type = bip.thru ? 'grounder' : rng() < 0.65 ? 'liner' : 'grounder';
      d.startPlay({ fielder: bip.zone, L: 0.3, by: 'bat', type, hit: true, sitT: 0 });
      const pl = d.play, h = d.homeOf(bip.zone).setY(0), side = new this.THREE.Vector3(-h.z, 0, h.x).normalize().multiplyScalar((rng() * 2 - 1) * 9);
      pl.batted = d.makeBall(type, h.lerp(new this.THREE.Vector3(0, 0, -40), 0.12 + rng() * 0.2).add(side), 0.4, pl.p0);
      pl.fly = false; pl.ofHit = true;
      d.fig[bip.zone].noCatchUntil = 99;
      return;
    }
    const L = bip.hit ? 0.8 + rng() * 0.2 : 0.05 + rng() * 0.45;
    d.startPlay({ fielder: bip.zone, L, by: 'bat', type: bip.type, hit: !!bip.hit, sitT: 0, randEV: true });
  }
  // 投げた球が捕手のミットに届いた(打球にならない球)
  pitchArrive(pl) {
    const d = this.d;
    d.play = null;
    d.wait = 99;
    const C = this.proxy.pos;
    this.arr = { t: 0, kind: pl.watchPitch, dur: 0.09, from: new this.THREE.Vector3(0, 0.95, -0.55), to: new this.THREE.Vector3(C.x + 0.05, 0.75, C.z - 0.35) };
    if (pl.watchPitch === 'foul') { this.arr.to.set((d.rng() * 2 - 1) * 4, 3.5 + d.rng() * 3, 16); this.arr.dur = 0.5; }   // チップはバックネットへ
  }
  arriveTick(dt) {
    const a = this.arr, d = this.d, g = d.g;
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    d.ballView.show(true);
    d.ballView.update(a.from.clone().lerp(a.to, k), dt, this.base.camera, 0.02, 0.2);
    if (k < 1 || a.done) { if (a.done && a.t > a.done + 0.6) { d.ballView.show(false); this.arr = null; this.afterPitch(a); } return; }
    a.done = a.t;
    const s = this.base.sound, kind = a.kind;
    if (kind === 'foul') { s.hit('tip', 0.6); d.umpCall('foul', 0); s.crowdEvent('foul', 0.4); }
    else s.sfx('mitt', { gain: 0.8, pos: a.to });
    const res = R.applyPitch(g, kind, d.rng);
    const side = g.half === 'top' ? 'them' : 'us';
    const at = d.ump[0] ? d.ump[0].root.position.clone().setY(1.6) : a.to;
    if (res && /三振/.test(res)) {
      d.umpCall('strike_out', 0); this.stats.K[side]++; this.stats.PA[side]++; this.paOpen = false;
      d.say(kind === 'called' ? 'strikeout_looking' : 'strikeout', { cut: true });
      s.crowdEvent('strikeout', 0.8);
    } else if (res && /振り逃げ/.test(res)) {
      this.stats.K[side]++; this.stats.PA[side]++; this.paOpen = false;
      if (d.ctx.ui) d.ctx.ui.callBanner(/アウト/.test(res) ? '三振' : '振り逃げ', 'out');
    } else if (res === '四球' || res === '死球') {
      s.call(res === '四球' ? 'ball' : 'hbp', at);
      this.stats.BB[side]++; this.stats.PA[side]++; this.paOpen = false;
      if (d.ctx.ui) d.ctx.ui.callBanner(res === '四球' ? 'フォアボール' : 'デッドボール', 'safe');
      d.say('walk', { maxWait: 1 }); s.crowdEvent('walk', 0.6);
      d.layRunners();
    } else if (res) {   // 暴投・捕逸(打席は続く)
      d.layRunners();
      d.say(/暴投/.test(res) ? 'wild_pitch' : 'passed_ball', { maxWait: 1 });
    } else {
      if (kind === 'ball') s.call('ball', at);
      else { s.call('strike', at); if (d.ump[0]) d.ump[0].anim = { kind: 'strike', t: 0.9 }; }
      if (d.rng() < 0.35 && g.balls + g.strikes > 0) { const key = g.balls === 3 && g.strikes === 2 ? 'full_count' : `count_${g.balls}${g.strikes}`; d.say(key, { maxWait: 1.5 }); }
    }
    if (g.over) return;
    if (g.outs >= 3) this.paOpen = false;
  }
  afterPitch() {
    const d = this.d;
    d.crowdPressure && d.crowdPressure();
    if (!this.paOpen) d.afterPA();   // 次の打者の番号・塁の人
    d.updateHUD();
    d.wait = 0.05;   // → next() → nextPitch() が間をとる
  }
  // 守る側・攻める側のユニフォーム(表 = 後攻が守る、裏 = 先攻が守る)。athletes.js の dress() で学校の色・胸の字を替える
  setKits(half) {
    const d = this.d, def = half === 'bottom' ? 'away' : 'home', att = def === 'home' ? 'away' : 'home';
    const put = (a, side) => { if (!a || !a.kit || !a.kit.side || a.kit.side === side) return; a.kit = { ...a.kit, side }; if (a.dress) a.dress(); };
    for (const f of Object.values(d.fig || {})) put(f, def);
    put(d.batter, att);
    for (const f of d.runnerFigs || []) put(f, att);
  }
  // 攻守交代(本物は 2 分ほど。観戦では 45 秒)
  changeSides() {
    const d = this.d, g = d.g, s = this.base.sound;
    if (d.ctx.ui) d.ctx.ui.callBanner('チェンジ', 'play');
    d.say('change', { maxWait: 1 });
    s.crowdEvent('change', 0.6);
    const r = R.endHalf(g); const rng3 = d.rng;
    if (r === 'over') { this.gameOver(); return; }
    this.paOpen = false;
    this.setKits(g.half);
    if (d.fig.P && d.fig.P.setNumber) d.fig.P.setNumber(String(this.pcState().num));   // 守る側の今の投手の背番号
    d.layRunners(); d.snapHome(); d.updateHUD();
    d.later0(1.5 / this.fast, () => { if (d.ctx.ui) d.ctx.ui.callBanner(`${g.inning}回${g.half === 'top' ? '表' : '裏'}`, 'play'); });
    d.later0(1.6 / this.fast, () => d.say([g.half === 'top' ? `inn_top_${g.inning}` : `inning_${g.inning}`], { maxWait: 3 }));
    this.gap(2.6 + rng3() * 0.6);   // 攻守交代は 3 秒ほど(「チェンジ」の札と歓声の一区切り。選手は守備位置へ置き直し、歩いて戻るのを待たない。11/18 夜 持ち主「サクサク」)
  }
  gameOver() {
    const d = this.d, g = d.g;
    if (this.overT != null) return;
    g.over = true;
    this.overT = this.simT;
    this.stats.games++;
    d.umpCall('game', 0);
    d.say('game_set', { maxWait: 3 });
    if (d.ctx.ui) d.ctx.ui.callBanner('試合終了', 'play');
    this.lastGame = { sec: Math.round(this.simT - (this.gameT0 || 0)), score: { ...g.score }, inning: g.inning, half: g.half, result: g.result, stats: JSON.parse(JSON.stringify(this.stats)) };
    (this.games = this.games || []).push(this.lastGame);
    try { window.dispatchEvent(new CustomEvent('gameend', { detail: { game: this.gameNo || 1, score: { ...g.score }, result: g.result, nextInSec: 30 } })); } catch (e) { /* なくてよい */ }
    d.updateHUD();
    if (!this.params.has('noseiretsu')) this.sei.beginEnd();   // 11/21 整列(高校野球)・ハイタッチ(プロ風)。終わったら次の試合(30 秒の中)
  }
  // 試合が終わってしばらくしたら、次の試合を始める(観客は歩き続けられる)
  restartGame() {
    const keep = this.games || [], n = this.gameNo || 0, st = this.stuck || [];
    this.gameNo = n;
    this._restarting = true;
    try { this.start(); } finally { this._restarting = false; }
    this.games = keep; this.stuck = st;
  }

  // 聞こえ方: 本塁からの距離で打球音を小さく、コンコース(頭の上がふさがっていて、6 m 以内に席が無い所)では球場の音をこもらせる
  listenTick(dt) {
    const S = this.base.sound, cam = this.base.camera; if (!S || !cam) return;
    const p = cam.position, d = Math.hypot(p.x, p.y, p.z);
    S.batDistK = 0.35 + 0.65 * 25 / (25 + d);
    this._lt = (this._lt || 0) - dt; if (this._lt > 0) return; this._lt = 0.5;
    const W = this.walkers, covered = W ? !!W.hit(p.x, p.y, p.z, 0, 1, 0, 10) : false;
    let seat = false;
    if (covered && W) { const Sx = W.seats; for (let a = -6; a <= 6 && !seat; a++) for (let b = -6; b <= 6 && !seat; b++) { const q = W.seatGrid.get((Math.floor(p.x) + a) * 4001 + Math.floor(p.z) + b); if (q) for (const i of q) if (Math.abs(Sx.y[i] - p.y) < 5) { seat = true; break; } } }
    const m = covered && !seat ? 1 : 0;
    this.inConcourse = !!m;
    if (m !== (S.muffleK || 0)) S.setMuffle(m);
  }
  // 歩く人(初めての時だけ道を調べる。数フレームに分ける)
  startWalkers() {
    if (!this.prepWalkers()) return;
    this.walkers.setVisible(true);
  }
  // 11/25 重さの直し: 歩く人を作って道を調べ始める(見せない)。タイトルで待っている間に先に進めておける(main.js の idleBuild)
  prepWalkers() {
    if (this.params.has('nowalkers')) return false;
    const b = this.base;
    if (!this.walkers) {
      const seats = window.__crowd && window.__crowd.seats;
      if (!seats || !b.bvh) return false;
      const lite = /lite|auto/.test(String(window.__app && window.__app.state && window.__app.state().quality));   // 11/19 スマホの「自動」も軽量と同じ数
      this.walkers = new Walkers({ THREE: this.THREE, scene: b.scene, ctx: b, seats, lite });
      const seeds = [];
      for (const w of (window.__app.WARPS || [])) {
        const kind = /^(concourse|gate)/.test(w.k) ? 'concourse' : /^(infield|alps|outfield|upper)/.test(w.k) ? 'stand' : null;
        if (!kind) continue;
        const y = b.groundAt(w.at[0], w.at[1], w.fromY || 60, 120);
        if (y != null) seeds.push({ x: w.at[0], y, z: w.at[1], kind });
      }
      this.walkers.startBuild(seeds);
      this.walkers.setVisible(false);   // 見せるのは startWalkers の時
    }
    // 当たり判定(bvh)が前に道を作った時と替わっていたら、新しい床で道から作り直す
    if (this.walkers._bvh && b.bvh && this.walkers._bvh !== b.bvh) { const v = this.walkers.group.visible; this.walkers.rebuild(); if (!v) this.walkers.setVisible(false); }
    return true;
  }
  rebuildWalkers() { if (this.walkers) this.walkers.rebuild(); }   // ほかの作業者が当たり判定を差し替えた後に呼べる(window.__watch.rebuildWalkers())
  // ---------------------------------------------------------------- 毎こま(main.js の stepWorld から)
  update(dt) {
    if (!this.on) return;
    const d = this.d;
    this.simT += dt;
    if (this.walkers) this.walkers.update(dt, this.base.player.pos, this.base.camera);
    this.listenTick(dt);
    // 11/21 整列(js/seiretsu.js): 試合の終わりは終わったら次の試合へ、始まりは終わったらプレイボール
    if (this.sei.on) {
      this.sei.update(dt);
      if (this.sei.done) {
        const k = this.sei.kind; this.sei.finish();
        if (k === 'end') { this.overT = null; this.restartGame(); }
        else { this._wdT = this.simT; this._wdKey = null; this.gap(1.2); }
      }
      return;
    }
    if (this.overT != null) {
      d.update(dt); this.drawCatcher(dt);
      if (this.simT - this.overT > 30 / this.fast) { this.overT = null; this.restartGame(); }   // 試合終了のあいさつ・歓声のあと 30 秒で次の試合(11/20 持ち主「1試合が丸々終わると再度また試合始まる」)
      return;
    }
    // 乱入して捕った後: 投げる・踏む・タッチは自分の場所から(見えない操作の人を自分に重ねる)。プレーが終わったら元の捕手に戻る
    const I = this.intr;
    if (I && I.holding) {
      if (d.play !== I.pl) { I.holding = false; I.pl = null; const ui = this.getUI(); if (ui) ui.pad('hide'); }
      else { const P = this.proxy, pp = this.base.player.pos; P.vel.set(pp.x - P.pos.x, 0, pp.z - P.pos.z).multiplyScalar(dt > 0 ? 1 / dt : 0); P.pos.copy(pp); P.yaw = this.base.player.yaw; }
    }
    this.bot(dt);
    d.update(dt);
    this.watchdog();
    // 球場のスコアボードの安打の数: 観戦は表・裏とも本当に打っているので、こちらの数で
    const sb = this.getScoreboard && this.getScoreboard();
    if (sb && sb.trk && sb.trk.g === d.g) sb.trk.H = { ...this.stats.H };
    if (this.arr) this.arriveTick(dt);
    this.drawCatcher(dt);
  }
  // 詰まりの逃げ道(11/20 持ち主「観戦モードですが試合止まることある」): 次の球に進まないまま 25 秒(本物の秒)たったら、
  // 今のプレーを終わらせる・待ちを解いて次へ。投手交代の待ち(最長 38 秒)と試合の後(30 秒)は除く。起きた事は this.stuck に残す
  watchdog() {
    const d = this.d;
    // プレーの中で、球も走者も野手も 4 秒動かない(打って 3 秒より後)のは詰まり: そのプレーを終わらせる(前は defense.js の 25 秒の打ち切りまで待っていた)
    const pl0 = d.play;
    if (pl0 && !pl0.watchPitch && pl0.contactT != null && pl0.endT == null && pl0.t - pl0.contactT > 3 && !d.anyMoving() && !Object.values(d.fig).some((f) => f.root.visible && (f.spd || 0) > 0.5)) {   // 野手が球へ歩いている間は詰まりではない
      const bp = d.ballPos ? `${d.ballPos.x.toFixed(1)},${d.ballPos.z.toFixed(1)}` : '-', hk = `${bp}|${pl0.holder || ''}|${pl0.thrown ? 1 : 0}`;
      if (hk !== this._stillK) { this._stillK = hk; this._stillT = this.simT; }
      else if (this.simT - this._stillT > 4) { (this.stuck = this.stuck || []).push({ simT: +this.simT.toFixed(1), why: 'still:' + (pl0.holder || (d.ball ? 'ball' : 'none')), pitches: this.stats.pitches, inning: d.g && d.g.inning }); d.finishPlay(pl0, null); this._stillK = null; }
    } else this._stillK = null;
    const key = `${this.stats.pitches}|${d.play ? 1 : 0}|${d.play && d.play.endT != null ? 1 : 0}|${d.g ? d.g.outs + ',' + d.g.inning : ''}`;
    if (key !== this._wdKey) { this._wdKey = key; this._wdT = this.simT; return; }
    if (this.overT != null || this.pcWait) { this._wdT = this.simT; return; }
    if (this.simT - (this._wdT ?? this.simT) < 25) return;   // 試合の時計で 25 秒(プレーは ?wfast でも等倍で進むので倍速を掛けない)
    const pl = d.play;
    const why = pl ? (pl.endT != null ? 'play_end_wait' : pl.holder ? 'holder:' + pl.holder : pl.thrown ? 'thrown' : d.ball ? 'ball' : 'play') : this.arr ? 'pitch_arrive' : this.gapUntil != null ? 'gap' : 'wait';
    (this.stuck = this.stuck || []).push({ simT: +this.simT.toFixed(1), why, pitches: this.stats.pitches, inning: d.g && d.g.inning });
    if (pl && pl.endT == null) d.finishPlay(pl, null);
    else if (pl && pl.endT != null) pl.endT = Math.min(pl.endT, 0.05);
    else { this.arr = null; this.gapUntil = null; d.wait = 0.05; }
    this._wdT = this.simT;
  }
  // 捕手の形(見えない操作の人の所に描く)
  drawCatcher(dt) {
    const d = this.d, F = d.fig.C, P = this.proxy; if (!F) return;
    if (this.intr && this.intr.holding) { F.root.visible = false; return; }   // 乱入して球を持っている間は、見えない操作の人が自分の所にいるので捕手は描かない
    F.root.visible = true;
    F.root.position.set(P.pos.x, P.pos.y, P.pos.z);
    const pl = d.play, sp = Math.hypot(P.vel.x, P.vel.z);
    if (this.arr) { F.setYawToward(0, -18); F.set('receive', { t: 0.2 + this.arr.t }); }
    else if (!pl || pl.phase === 'pre') { F.setYawToward(0, -18); F.set('crouch'); }
    else if (sp > 0.6) { F.root.rotation.y = P.yaw; F.set('run'); }
    else { const b = d.ballWorld(); if (b) F.setYawToward(b.x, b.z); F.set('ready'); }
  }
  // 見えない捕手の動き(tools/bot.js と同じ考え: 自分の球へ・カバーの所へ・捕ったら正しい塁へ)
  bot(dt) {
    const d = this.d, P = this.proxy, pl = d.play;
    let tgt = null;
    if (this.intr && this.intr.holding) {   // 乱入して捕った: 投げる先は自分で選ぶ(3 秒選ばなければ正しい塁へ)
      if (pl && pl.holder === 'me' && pl.choiceOpen && pl.t - pl.caughtT > 3.0) { const cb = d.correctBase(pl); d.chooseBase(cb[0] === 5 ? 1 : cb[0]); }
      return;
    }
    if (pl && pl.phase !== 'pre') {
      if (pl.holder === 'me' && pl.choiceOpen) {
        if (pl.t - pl.caughtT > 0.5) { const cb = d.correctBase(pl); d.chooseBase(cb[0] === 5 ? 1 : cb[0]); }
      } else if (d.ball && !pl.thrown && pl.opt.fielder === d.my) {
        const path = d.ball.path, tb = pl.t - d.ball.t0, n = path.n;
        for (let i = Math.max(0, Math.floor(tb / path.dt)); i < n; i += 4) {
          const x = path.pts[i * 4], y = path.pts[i * 4 + 1], z = path.pts[i * 4 + 2];
          if (y - P.pos.y > 2.0) continue;
          if (Math.hypot(x - P.pos.x, z - P.pos.z) / 7.5 * 1.08 + 0.12 <= i * path.dt - tb) { tgt = [x, z]; break; }
        }
        if (!tgt) { const i = n - 1; tgt = [path.pts[i * 4], path.pts[i * 4 + 2]]; }
      } else if (pl.coverSpot && !pl.coverDone) tgt = [pl.coverSpot.p.x, pl.coverSpot.p.z];
      else if (d.ball && pl.loosePick && pl.opt.fielder === d.my) { const e = d.ball.path; tgt = [e.pts[0], e.pts[2]]; }
      else if (pl.thrown && pl.thrown.base === 0) tgt = [0, -0.3];   // 本塁への送球: 本塁で受ける
    }
    if (tgt) {
      const dx = tgt[0] - P.pos.x, dz = tgt[1] - P.pos.z, dist = Math.hypot(dx, dz);
      if (dist > 0.25) {
        const v = Math.min(dist / dt, dist > 1.5 ? 7.5 : 3);
        P.yaw = Math.atan2(-dx, -dz);
        P.vel.set(dx / dist * v, 0, dz / dist * v);
        P.pos.x += P.vel.x * dt; P.pos.z += P.vel.z * dt;
        const g = this.base.groundAt(P.pos.x, P.pos.z, P.pos.y + 2, 10); if (g != null) P.pos.y = g;
        P.mv.copy(P.vel);
        return;
      }
    }
    P.vel.set(0, 0, 0); P.mv.set(0, 0, 0);
  }
  // 試験・報告用
  summary() { return { stats: this.stats, games: this.games || [], g: this.d.g && { inning: this.d.g.inning, half: this.d.g.half, outs: this.d.g.outs, balls: this.d.g.balls, strikes: this.d.g.strikes, score: { ...this.d.g.score }, bases: this.d.g.bases.slice(), over: this.d.g.over } }; }
}
