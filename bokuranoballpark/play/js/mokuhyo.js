// 目標と道案内(11/21 23 時 持ち主「観戦モードはまず何をするかがわかるように」「GTA みたいにある程度お使いゲーに」
// 「目標を作って指示する ただし無視しても良いように 目標・ルートガイドは隠せるボタンも」「あくまでもプレイヤーが選べるように」)。
// 「ボールパークで過ごす」(watch)・「球場を歩く」(walk)の時だけ動く。
//  ・はじめの案内: 初めて始めた時だけ、短い段(歩く・見回す → 地図 → チケット → ゲート → 店で 1 品買って食べる → 席で試合を見る)。1 つできたら次へ。いつでも「とばす」
//  ・目標: 11/22 作り直し。中身は js/mokuhyo_data.js の表(章・ごほうび・次の目標)。表に 1 行足すだけで増やせる。
//    やってもいいことの一覧として出し、どれをやっても(順番どおりでなくても)達成。一覧から好きな物を選べる。ごほうびはお金・称号・手に持てる物・観戦の席
//    はじめの案内を終えた時に 1 回だけ「目標と道案内を出しますか?」(r4walk.mk.ask に答えを覚える)
//  ・道案内: 今の目標の所まで、地面の金色の矢印の列と、画面の端の向きの印。地図(M)にも印(wayfinding.js が window.__mkTarget を読む)
//  ・隠せる: 左上の「目標」の小さなボタン(PC は G)で札と道案内を出す/隠す。一時停止の画面にも「目標」の段。選んだ値は覚える
//  ・観戦のしかた: 「ボールパークで過ごす」で初めて席に座った時に 1 回だけ、できることを短く
// main.js からは new Mokuhyo(hooks) と、update()・onStart(kind)・onTitle() を呼ぶだけ。光源は足さない(地面の矢印は 1 回で描く)。?nomokuhyo=1 で入れない
import * as THREE from 'three';
import { ITEMS } from './freeplay.js';
import { CHAPTERS, GOALS, BADGES, SEAT_REWARDS, mkEv, mkEvGet } from './mokuhyo_data.js';   // 11/22 目標の表(章・ごほうび)
import { STADIUMS } from './stadiums.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lsGet = (k, d) => { try { const s = localStorage.getItem(k); return s == null ? d : JSON.parse(s); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 使えない環境 */ } };
const GOLD = 0xffcc3a;
const N_CHEV = 30, CHEV_GAP = 1.7;

export class Mokuhyo {
  // h: THREE の物と main.js の様子を読む関数(player・camera・scene・IS_TOUCH・stadium・stadiumName・seats・WARPS・groundAt・
  //    getMode・isPlaying・fp・watch・wayfind・gimmicks・passages・wayState・sound・setOverlay・releasePointer・lockPointer)
  constructor(h) {
    this.h = h; this.kind = null; this.on = lsGet('r4walk.mk.on', true);
    this.st = h.stadium;
    this.prog = lsGet('r4walk.mk.p.' + this.st, {});   // { 目標の id: 1 }(この球場の目標)
    this.progAll = lsGet('r4walk.mk.p.all', {});        // 全部の球場で 1 回の目標(all: true)
    this.rw = Object.assign({ badges: {}, goods: {}, seats: {}, title: null }, lsGet('r4walk.mk.rw', {}));   // もらったごほうび
    this.pick = null; this.cur = null; this.tut = null; this.nChk = 0; this.route = null; this.t = 0; this.tR = 0; this.tPos = 0;
    this.moved = 0; this.turned = 0; this.lastP = null; this.lastYaw = null; this.ate = null; this.mapSeen = false; this.win = 0;
    window.__mk = this;
    this.ui(); this.buildChev();
    addEventListener('keydown', (e) => {
      if (!this.kind || !this.h.isPlaying() || e.repeat) return;
      if (e.code === 'KeyG') { this.setOn(!this.on); e.preventDefault(); }
      else if (e.code === 'KeyJ') { this.openList(); e.preventDefault(); }
    });
  }

  // ---------------------------------------------------------------- 画面の部品
  ui() {
    const mk = (tag, id, html) => { const e = document.createElement(tag); e.id = id; if (html) e.innerHTML = html; document.body.appendChild(e); return e; };
    this.elCard = mk('div', 'mkCard', '<button class="mkT" type="button" aria-label="目標と道案内を出す・隠す">目標</button><div class="mkB" role="button" tabindex="0"><small class="mkK"></small><b class="mkH"></b><span class="mkS"></span><i class="mkW"></i></div><button class="mkSkip" type="button">とばす</button>');
    this.elCard.classList.add('hide');
    this.elPin = mk('div', 'mkPin', '<i></i><span></span>'); this.elPin.classList.add('hide');
    this.elTips = mk('div', 'mkTips', ''); this.elTips.classList.add('hide');
    this.elList = mk('div', 'mkList', ''); this.elList.classList.add('hide');
    const tap = (el, fn) => { el.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); el.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true }); };
    tap(this.elCard.querySelector('.mkT'), () => this.setOn(!this.on));
    tap(this.elCard.querySelector('.mkB'), () => this.openList());
    tap(this.elCard.querySelector('.mkSkip'), () => this.skipTut());
    for (const el of [this.elCard, this.elTips, this.elList]) { el.addEventListener('pointerdown', (e) => e.stopPropagation()); el.addEventListener('mousedown', (e) => e.stopPropagation()); }
    // 一時停止の画面に「目標」の段(walkOnly: 歩く・座る時だけ ui.js が出す)
    const panel = document.querySelector('#panel .sheet'), cred = document.getElementById('credBtn');
    if (panel) {
      const o = document.createElement('div'); o.className = 'opt walkOnly'; o.id = 'mkOpt';
      o.innerHTML = '<div class="lab">目標</div><div class="seg wrap"><button data-mk="on">道案内 オン</button><button data-mk="off">オフ</button><button data-mk="list">目標の一覧</button><button data-mk="tut">はじめの案内</button></div>';
      panel.insertBefore(o, cred && cred.parentNode === panel ? cred : null);
      o.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return; e.stopPropagation();
        const k = b.dataset.mk;
        if (k === 'on' || k === 'off') this.setOn(k === 'on');
        else if (k === 'list') { const ui = window.__app && window.__app.ui; if (ui && ui.resume) ui.resume(); setTimeout(() => this.openList(), 30); }
        else if (k === 'tut') { if (this.tut) this.skipTut(); else { this.restartTut(); const ui = window.__app && window.__app.ui; if (ui && ui.resume) ui.resume(); } }
        this.refreshOpt();
      });
      this.elOpt = o; this.refreshOpt();
    }
  }
  refreshOpt() {
    const o = this.elOpt; if (!o) return;
    o.querySelector('[data-mk="on"]').classList.toggle('on', this.on);
    o.querySelector('[data-mk="off"]').classList.toggle('on', !this.on);
    o.querySelector('[data-mk="tut"]').textContent = this.tut ? 'はじめの案内をとばす' : 'はじめの案内をもう一度';
  }
  setOn(v) {
    this.on = !!v; lsSet('r4walk.mk.on', this.on); this.refreshOpt();
    if (!this.on) { this.chev.visible = false; this.elPin.classList.add('hide'); }
    this.paint(true);
  }
  // 地面の矢印(金色の山形を 30 個、1 回で描く)
  buildChev() {
    const s = new THREE.Shape();
    s.moveTo(0, 0.34); s.lineTo(0.34, 0.0); s.lineTo(0.34, -0.2); s.lineTo(0, 0.12); s.lineTo(-0.34, -0.2); s.lineTo(-0.34, 0.0); s.closePath();
    const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    const im = new THREE.InstancedMesh(g, m, N_CHEV); im.count = 0; im.frustumCulled = false; im.renderOrder = 6; im.name = 'mokuhyo_chev';
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N_CHEV * 3), 3);
    im.visible = false; this.h.scene.add(im); this.chev = im; this.chevN = 0; this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._c = new THREE.Color();
  }

  // ---------------------------------------------------------------- 始める・やめる
  onStart(kind) {
    if (kind !== 'watch' && kind !== 'walk') { this.onTitle(); return; }
    this.kind = kind; this.cur = null; this.route = null; this.pick = null; this.ate = null; this.mapSeen = false; this.moved = 0; this.turned = 0; this.lastP = null; this.lastYaw = null;
    this.photoSeen = false; this.t0 = performance.now(); { const L0 = this.h.lap(); this.lap0 = L0 ? L0.last : null; }
    { const v = lsGet('r4walk.mk.visited', {}); v[this.st] = 1; lsSet('r4walk.mk.visited', v); }
    this._goals = null; this._curC = null;
    this.patchFp(); this.isMeibutsu('');   // 名物の品の表を先に読む
    const tk = 'r4walk.mk.tut.' + kind, saved = lsGet(tk, 0);
    this.tut = saved === 'done' ? null : { i: 0, steps: this.tutSteps(kind), key: tk };
    if (this.tut) { this.tut.i = Math.min(+saved || 0, this.tut.steps.length - 1); if (kind === 'watch') { const ti = this.tut.steps.findIndex((s) => s.id === 'ticket'); if (ti >= 0 && this.tut.i > ti) this.tut.i = ti; } }
    this.refreshOpt(); this.paint(true);
  }
  onTitle() { this.kind = null; this.tut = null; this.cur = null; this.route = null; this.hideAll(); this.askHide(); }
  hideAll() { this.elCard.classList.add('hide'); this.elPin.classList.add('hide'); this.elTips.classList.add('hide'); this.chev.visible = false; window.__mkTarget = null; }
  skipTut() { if (!this.tut) return; lsSet(this.tut.key, 'done'); this.tut = null; this.cur = null; this.route = null; this._curC = null; this.refreshOpt(); this.paint(true); this.askMaybe(); }
  restartTut() { if (!this.kind) return; lsSet('r4walk.mk.tut.' + this.kind, 0); lsSet('r4walk.mk.watchTips', 0); this.tut = { i: 0, steps: this.tutSteps(this.kind), key: 'r4walk.mk.tut.' + this.kind }; this.moved = 0; this.turned = 0; this.mapSeen = false; this.ate = null; this.cur = null; this.route = null; this._curC = null; this.refreshOpt(); this.paint(true); }
  // 出来事を数える(この球場と、全部の合計)
  ev(name, n = 1) { mkEv(name, n, this.st); this._evDirty = true; }
  evN(name, all) { return mkEvGet(name, all ? null : this.st); }
  // 食べた・買った・仕事・演出などを知る(freeplay.js・gimmicks.js の関数を包む。書き換えない)
  patchFp() {
    const self = this;
    { const wf = this.h.wayfind(); if (wf && !wf._mkOpen) { wf._mkOpen = true; const om = wf.openMap.bind(wf); wf.openMap = function (...a) { const r = om(...a); if (r) self.mapSeen = true; return r; }; } }   // 地図を開いたのを知る
    const G = this.h.gimmicks();
    if (G && !G._mkWrap) {
      G._mkWrap = true;
      const os = G.say.bind(G); G.say = function (msg, sub) { if (msg && self.kind) self.ev('show:' + msg); return os(msg, sub); };
    }
    this.wrapSpots();
    if (!this._gameEv) { this._gameEv = true; addEventListener('gameend', () => { if (this.kind === 'watch') this.ev('game_seen'); }); }
    const fp = this.h.fp(); if (!fp || fp._mkUse) return; fp._mkUse = true;
    const SWEET = /アイス|ソフト|かき氷|クレープ|チュロス|パフェ|ケーキ|プリン|だんご|団子|まんじゅう|わらび|大福|ドーナツ|ワッフル|シェイク|もみじ|ずんだ|大学いも|タルト|ジェラート/;
    const orig = fp.use.bind(fp);
    fp.use = function (...a) {
      const h = this.held, id = h && h.id, it = id && ITEMS[id];
      const r = orig(...a);
      if (it && (it.use === 'eat' || it.use === 'drink')) {
        self.ate = { id, t: performance.now() };
        if (self.kind && self._lastEat !== h) {   // 1 品につき 1 回(1 口目)
          self._lastEat = h;
          self.ev(it.use === 'eat' ? 'eat' : 'drink');
          if (self.isMeibutsu(id)) { self.ev('eat_meib'); if (self.meib0 && id === self.meib0) self.ev('eat_meib0'); }
          if (it.use === 'eat' && SWEET.test(it.name || '')) self.ev('eat_sweet');
          if (self.h.getMode() === 'sit') self.ev('eat_sit');
          if (self.isOut(self.h.player.pos) || self.nearOutShop()) self.ev('eat_out');
        }
      }
      if (it && self.kind) { if (it.use === 'cheer' || it.use === 'wave') self.ev('cheer'); if (it.use === 'release') self.ev('balloon'); }
      return r;
    };
    const osp = fp.spend.bind(fp); fp.spend = function (...a) { const r = osp(...a); if (r) self._spendT = performance.now(); return r; };
    const oh = fp.hold.bind(fp); fp.hold = function (id, ...a) { const r = oh(id, ...a); if (self.kind && performance.now() - (self._spendT || 0) < 200 && ['megaphone', 'towel', 'plush', 'keychain', 'minibat', 'kinen', 'balloon'].includes(id)) self.ev('goods'); return r; };
    const og = fp.jobGain.bind(fp); fp.jobGain = function (n, why) { const j = this.job; const r = og(n, why); if (j && self.kind) { self.ev('job'); self.ev('job:' + j.k); } return r; };
    const oe = fp.endJob.bind(fp); fp.endJob = function (quit) { const j = this.job; const r = oe(quit); if (j && !quit && self.kind) self.ev('job_done'); return r; };
    const oen = fp.earn.bind(fp); fp.earn = function (n, why) {
      const r = oen(n, why);
      if (self.kind && why && !/^目標|はじめの案内/.test(why)) {
        if (/本塁打を見た/.test(why)) { self.ev('hr_seen'); if (self.h.getMode() === 'sit' && self.isOuenSec(self.secHere())) self.ev('hr_ouen'); }
        else if (/安打を見た/.test(why)) self.ev('hit_seen');
        if (/ファウルボールを捕った/.test(why)) self.ev('foul');
      }
      return r;
    };
    const ow = fp.warpToPoint.bind(fp); fp.warpToPoint = function (...a) { const r = ow(...a); if (r && self.kind) self.ev('warp'); return r; };
  }
  // 名物の触れる所(G.spot)の run を包む。後から足された所も(0.3 秒ごとに見る)
  wrapSpots() {
    const G = this.h.gimmicks(), self = this; if (!G || !G.spots) return;
    for (const sp of G.spots) { if (sp._mk || typeof sp.run !== 'function') continue; sp._mk = true; const or = sp.run; sp.run = function (...a) { if (self.kind) { self.ev('spot'); self.ev('spot:' + sp.label); } return or.apply(this, a); }; }
  }
  nearOutShop() { const p = this.h.player.pos; return this.shops().some((s) => s.out && Math.hypot(s.x - p.x, s.z - p.z) < 7 && Math.abs(s.y - p.y) < 3); }   // 外の店の前(ひさしの下で外と見なされない所も)
  isOuenSec(sec) { return sec === 'outfield' || sec === 'alps'; }

  // ---------------------------------------------------------------- はじめの案内の段
  tutSteps(kind) {
    const T = this.h.IS_TOUCH, E = T ? '緑のボタン' : 'E';
    const L = [];
    L.push({ id: 'look', h: '歩いて、見回してみよう', s: T ? '左下で歩く ・ 画面をなぞって見回す' : 'WASD で歩く ・ マウスで見回す', done: () => this.moved > 5 && this.turned > 1.0 });
    L.push({ id: 'map', h: '地図を開いてみよう', s: T ? '右上の丸い地図を押す' : 'M キー(右上の丸い地図)', done: () => this.mapSeen });
    if (kind === 'watch') {
      L.push({ id: 'ticket', h: 'チケットを買おう', s: `チケット売り場の前で ${E}`, target: () => this.tBooth(), done: () => { const fp = this.h.fp(); return !!(fp && (fp.ticket || !fp.tktOn)); } });
      L.push({ id: 'gate', h: 'ゲートから球場に入ろう', s: 'チケットを持って改札を通る', target: () => this.tGate(), done: () => { const fp = this.h.fp(); if (!fp || !fp.tktOn) return true; if (!fp.ticket) return false; if (!fp.outside()) return true; const g = this._gateT; return !!(g && g.inn && this.near(g.inn, 2.2)); } });
      L.push({ id: 'eat', h: '店で 1 品買って食べよう', s: `店の前で ${E} → 品を選ぶ → 食べる`, target: () => this.tShop(false), done: () => !!this.ate, skipIf: () => !this.tShop(false) && this.sessT() > 40 });
    }
    L.push({ id: 'sit', h: kind === 'watch' ? '席に座って試合を見よう' : '席に座ってみよう', s: `席の前で ${E}`, target: () => this.tSeat('infield'), done: () => this.h.getMode() === 'sit' });
    return L;
  }
  sessT() { return (performance.now() - (this.t0 || 0)) / 1000; }

  // ---------------------------------------------------------------- 目標(js/mokuhyo_data.js の表から作る)
  // 表の 1 行 → { id, ch, h, s, sub(), target(), done(), reward, next, auto, all }
  goals() {
    if (this._goals && this._goalsKind === this.kind) return this._goals;
    const T = this.h.IS_TOUCH, E = T ? '緑のボタン' : 'E';
    const G = this.h.gimmicks(); let marks = []; try { marks = G && G.list ? G.list() : []; } catch (e) { marks = []; }
    const fill = (t) => String(t || '').replace(/\{E\}/g, E).replace(/\{PHOTO\}/g, T ? '一時停止 → 写真' : 'P キーで写真モード')
      .replace(/\{OUEN\}/g, this.st === 'koshien' ? 'アルプス席か外野席で' : '外野の応援席で').replace(/\{NST\}/g, `${STADIUMS.length} こ`)
      .replace(/\{meib0\}/g, () => (this.meib0 && ITEMS[this.meib0] ? ITEMS[this.meib0].name : '名物'));
    const L = [];
    for (const d of GOALS) {
      if (d.kinds && !d.kinds.includes(this.kind)) continue;
      if (d.st && !d.st.includes(this.st)) continue;
      const g = { id: d.id, ch: d.ch, d, all: !!d.all, auto: d.auto !== false, reward: d.reward || {}, next: d.next || null, where: d.where || null };
      Object.defineProperty(g, 'h', { get: () => fill(d.h) });
      Object.defineProperty(g, 's', { get: () => fill(d.s) });
      if (d.where) g.target = () => this.targetOf(d, marks);
      if (d.where === 'outgate') g.sub = () => { const t = this.tOutGate(); return t ? `${t.label}まで(外の広場を回る)` : ''; };
      g.need = () => this.needOk(d, marks);
      g.done = () => this.doneOf(d, g, marks);
      L.push(g);
    }
    this._goals = L; this._goalsKind = this.kind;
    return L;
  }
  needOk(d, marks) {
    if (d.need === 'meib') return !!this.meib0;
    if (d.where === 'outgate') return !!this.tOutGate();   // 反対側のゲートが見つからない球場では出さない
    if (d.need === 'relief') { const fp = this.h.fp(); return !!(fp && fp.vehicles && fp.vehicles.some((v) => v.kind === 'relief')); }
    if (d.where && d.where.startsWith('mark:')) return marks.some((m) => m.id === d.where.slice(5));
    if (d.where && d.where.startsWith('spot:')) { const G = this.h.gimmicks(); return !!(G && G.spots && G.spots.some((s) => s.label === d.where.slice(5))); }
    return true;
  }
  doneOf(d, g, marks) {
    const c = d.done || {};
    if (c.ev) return this.evN(c.ev, d.all) >= (c.n || 1);
    if (c.evSt) { let k = 0; for (const s of STADIUMS) if (mkEvGet(c.evSt, s.id) > 0) k++; return k >= (c.n || 1); }
    if (c.visited) return Object.keys(lsGet('r4walk.mk.visited', {})).length >= Math.min(c.visited, STADIUMS.length);
    if (c.goals) return this.doneCount() >= c.goals;
    if (c.ticket) { const fp = this.h.fp(); return !!(fp && (fp.ticket || !fp.tktOn)); }
    if (c.at) { const t = this.targetOf(d, marks, true); return !!(t && this.near(t.p, d.r || t.r || 9, d.dy || 5)); }
    return false;
  }
  // 行き先(道案内)。raw: 着いたかを見る時(席の目標でも位置を返す)
  targetOf(d, marks, raw) {
    const w = d.where; if (!w) return null;
    if (w.startsWith('seat:')) { const k = w.slice(5); return k === 'top' ? this.tTop() : this.tSeat(k === 'ouen' ? (this.st === 'koshien' ? 'alps' : 'outfield') : k === 'any' ? 'infield' : k, k === 'any'); }
    if (w.startsWith('shop:')) return this.tShop(w.slice(5));
    if (w === 'desk') return this.tDesk(raw);
    if (w === 'booth') return this.tBooth();
    if (w === 'outgate') return this.tOutGate();
    if (w === 'home') return { p: V(0, 0, 0.5), label: '本塁', r: 2.5, field: true };
    if (w.startsWith('mark:')) { const m = marks.find((x) => x.id === w.slice(5)); return m ? { p: V(m.x, m.y, m.z), label: m.name, r: d.r || 9, out: this.outAt(m.x, m.z) } : null; }
    if (w.startsWith('spot:')) { const G = this.h.gimmicks(), lab = w.slice(5); const s = G && G.spots && G.spots.find((x) => x.label === lab && x.r < 100); if (!s) return null; const y = s.y != null ? s.y : (this.h.groundAt(s.x, s.z, 40, 80) ?? 0); return { p: V(s.x, y, s.z), label: lab.replace(/を?(見上げる|読む|見る|詰める|乗る|撮る)$/, '') || lab, r: Math.max(1.5, Math.min(s.r * 0.8, 6)), out: this.outAt(s.x, s.z) }; }
    return null;
  }
  isDone(g) { return !!(g.all ? this.progAll[g.id] : this.prog[g.id]); }
  doneCount() { let n = Object.keys(this.progAll).length; for (const s of STADIUMS) n += Object.keys(s.id === this.st ? this.prog : lsGet('r4walk.mk.p.' + s.id, {})).filter((k) => GOALS.some((x) => x.id === k && !x.all)).length; return n; }
  // いまの目標(選んだ物があればそれ。無ければ表の順で、まだの物・自分から出してよい物・行き先が分かる物)
  current() {
    if (this.tut) return this.tut.steps[this.tut.i];
    const now = performance.now();
    if (this._curC && now - this._curC.t < 300 && this._curC.pick === this.pick) return this._curC.g;
    const L = this.goals(); let out = null;
    if (this.pick) { const g = L.find((x) => x.id === this.pick); if (g && !this.isDone(g) && g.need()) out = g; else this.pick = null; }
    if (!out) for (const g of L) {
      if (this.isDone(g) || !g.auto || !g.need()) continue;
      if (g.target && !/^seat:/.test(g.where) && !g.target()) continue;   // 行き先が今は分からない(席の目標は、座っている時は行き先なしでよい)
      out = g; break;
    }
    this._curC = { t: now, g: out, pick: this.pick };
    return out;
  }
  isMeibutsu(id) {
    if (!this.meib) {
      this.meib = new Set();
      import('./menus_real.js').then((m) => { const M = m.STADIUM_MENUS || {}, cnt = {}; for (const [k, v] of Object.entries(M)) for (const s of v.shops || []) for (const i of s.items || []) (cnt[i] = cnt[i] || new Set()).add(k); const my = M[this.st]; if (my) for (const s of my.shops || []) for (const i of s.items || []) if (cnt[i] && cnt[i].size === 1 && ITEMS[i]) { this.meib.add(i); if (!this.meib0 && ITEMS[i].use === 'eat') this.meib0 = i; } this._goals = null; }).catch(() => {});
    }
    return this.meib.has(id);
  }

  // ---------------------------------------------------------------- 行き先を探す
  near(p, r, dy = 5) { const q = this.h.player.pos; return Math.hypot(p.x - q.x, p.z - q.z) < r && Math.abs(p.y - q.y) < dy; }
  tBooth() { const fp = this.h.fp(), pl = fp && fp._plan; if (!pl || !fp.tktOn || fp.ticket) return null; const q = fp.boothFront || pl.booth; return { p: V(q.x, q.y, q.z), label: 'チケット売り場', out: true, r: 2.6 }; }
  tGate() {
    const fp = this.h.fp(), pl = fp && fp._plan; if (!pl || !fp.tktOn || !fp.outside()) return null;
    const g = this.pickGate(this.h.player.pos, null); if (!g) return null;
    this._gateT = g; const q = g.inn || g.o; return { p: V(q.x, q.y, q.z), label: g.n ? `${g.n} ゲート` : '入場ゲート', r: g.inn ? 1.8 : 2.5, gate: g };
  }
  tDesk(raw) { const fp = this.h.fp(); const q = fp && (fp.jobDesk || fp.jobDeskLook); if (!q || (fp.job && !raw)) return null;   // 11/22 仕事の間は道案内を出さない(前は稼いだ後に目標ごと飛ばされ、達成にならなかった)
    return { p: V(q.x, q.y, q.z), label: 'アルバイト受付', out: true, r: 1.8 }; }
  shops() {
    const fp = this.h.fp(); if (!fp) return [];
    const W = fp.walkers && fp.walkers();
    return ((W && W.stalls) || []).concat(fp.wagons || [], fp.simple ? (fp.mopen || []) : (fp.mshops || []), fp.outStores || []).filter((s) => s && isFinite(s.x));
  }
  // 店。kind: false / 'food'(食べ物の店)・true / 'meib'(名物)・'item'(名物の品 meib0)・'drink'・'sweet'・'out'(外の店)・'goods'・'balloon'
  tShop(kind) {
    const fp = this.h.fp(); if (!fp || !fp.stallMenu) return null;
    if (kind === true) kind = 'meib'; if (!kind) kind = 'food';
    const food = (id) => ITEMS[id] && (ITEMS[id].use === 'eat' || ITEMS[id].use === 'drink');
    const SW = /アイス|ソフト|かき氷|クレープ|チュロス|パフェ|ケーキ|プリン|だんご|団子|まんじゅう|わらび|大福|ドーナツ|ワッフル|シェイク|もみじ|ずんだ|大学いも|タルト|ジェラート/;
    const want = {
      food: (ids) => ids.some(food), meib: (ids) => ids.some((i) => this.isMeibutsu(i)), item: (ids) => ids.includes(this.meib0),
      drink: (ids) => ids.some((i) => ITEMS[i] && ITEMS[i].use === 'drink' && !ITEMS[i].adult), sweet: (ids) => ids.some((i) => ITEMS[i] && ITEMS[i].use === 'eat' && SW.test(ITEMS[i].name || '')),
      out: (ids) => ids.some(food), goods: (ids) => ids.some((i) => ITEMS[i] && ITEMS[i].keep), balloon: (ids) => ids.includes('balloon'),
    }[kind] || ((ids) => ids.some(food));
    const p = this.h.player.pos, inside = !this.isOut(p);
    const pass = () => {
      let best = null, bd = 1e9;
      for (const s of this.shops()) {
        if (kind === 'out' && !s.out) continue;
        let ids; try { ids = fp.stallMenu(s).ids || []; } catch (e) { continue; }
        if (!want(ids)) continue;
        const d = Math.hypot(s.x - p.x, s.z - p.z) + Math.abs(s.y - p.y) * 3 + (inside && s.out && kind !== 'out' ? 60 : 0) + (kind === 'food' && ids.filter((i) => ITEMS[i] && ITEMS[i].use === 'eat').length < 2 ? 150 : 0);   // はじめの案内は食べ物の店を先に
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    };
    let best = pass();
    if (!best && kind === 'item' && this.meib && this.meib.size && !this._meib0Tried) {   // 名物の品を売る店が無い: 売っている名物の品に替える
      this._meib0Tried = true;
      for (const id of this.meib) { if (!ITEMS[id] || ITEMS[id].use !== 'eat') continue; this.meib0 = id; best = pass(); if (best) { this._goals = null; break; } }
    }
    if (!best) return null;
    let name = ''; try { name = fp.stallMenu(best).title || ''; } catch (e) { /* */ }
    const fx = best.fx || 0, fz = best.fz || 0;
    return { p: V(best.x + fx * 1.4, best.y, best.z + fz * 1.4), label: name ? `${name}の店` : '売店', r: 2.2, out: !!best.out, shop: best };
  }
  // いちばん上の段の席(上から 2.5 m の中で、いまの所に近い席)
  topY() { if (this._topY == null) { const S = this.h.seats; let m = -1e9; if (S && S.n) for (let i = 0; i < S.n; i++) if (S.y[i] > m) m = S.y[i]; this._topY = m; } return this._topY; }
  tTop() {
    const S = this.h.seats; if (!S || !S.n) return null; const top = this.topY(), p = this.h.player.pos;
    if (!this._topT || this._topT.from.distanceTo(p) > 30) { let bi = -1, bd = 1e9; for (let i = 0; i < S.n; i += 2) { if (S.y[i] < top - 2.5) continue; const d = Math.hypot(S.x[i] - p.x, S.z[i] - p.z); if (d < bd) { bd = d; bi = i; } } this._topT = bi >= 0 ? { q: V(S.x[bi], S.y[bi], S.z[bi]), from: p.clone() } : null; }
    if (!this._topT) return null; const q = this._topT.q;
    return { p: V(q.x, q.y - 0.42, q.z), label: 'いちばん上の段', r: 2.0, stand: true, sec: null };   // sec を付けない(通路口の近くの席に置き換えない)
  }
  tSeat(sec, any) {
    const fp = this.h.fp(), S = this.h.seats; if (!fp || !S || !S.n || !fp.sectionPoint) return null;
    if (this.h.getMode() === 'sit' && (any || this.secHere() === sec || (sec === 'alps' && this.secHere() === 'outfield'))) return null;
    const p = this.h.player.pos;
    if (!this._seatT || this._seatT.sec !== sec || this._seatT.p.distanceTo(p) > 40) { const q = fp.sectionPoint(sec, p); this._seatT = q ? { sec, q: q.clone(), p: p.clone() } : null; }
    if (!this._seatT) return null;
    const q = this._seatT.q;
    return { p: V(q.x, q.y - 0.42, q.z), label: sec === 'alps' ? 'アルプス席' : sec === 'outfield' ? '外野席' : sec === 'back' ? 'バックネット裏の席' : any ? '席' : '内野席', r: 1.6, stand: true, sec: sec === 'infield' ? 'any' : sec };
  }
  secHere() {   // 座っている時は、座った席の区画(席を 1 回だけ探す)
    const fp = this.h.fp(), p = this.h.player.pos; if (!fp || !fp.sectionOf) return null;
    if (this.h.getMode() === 'sit') {
      { const si = this.h.seatIdx ? this.h.seatIdx() : -1, S = this.h.seats; if (si >= 0 && S && si < S.n) return fp.sectionOf(S.x[si], S.z[si]); }   // 11/22 座っている席(体の位置は座る前の所のまま)
      if (!this._sitSec || this._sitSec.p.distanceTo(p) > 0.5) { const S = this.h.seats; let bi = -1, bd = 3; if (S && S.n) for (let i = 0; i < S.n; i++) { const dx = S.x[i] - p.x; if (dx > 3 || dx < -3) continue; const d = Math.hypot(dx, S.z[i] - p.z) + Math.abs(S.y[i] - p.y) * 0.3; if (d < bd) { bd = d; bi = i; } } this._sitSec = { p: p.clone(), sec: bi >= 0 ? fp.sectionOf(S.x[bi], S.z[bi]) : fp.sectionOf(p.x, p.z) }; }
      return this._sitSec.sec;
    }
    return fp.sectionOf(p.x, p.z);
  }
  // 外を歩く目標: 売り場のゲートから 90〜170 度回った所のゲート(外の口)
  tOutGate() {
    const fp = this.h.fp(), pl = fp && fp._plan; if (!pl || !fp.gateList) return null;
    if (!this._outG) {
      const a0 = Math.atan2(pl.out.x, pl.out.z + 40); let best = null, bd = -1;
      for (const g of fp.gateList()) { if (g.virt || g.inner) continue; let d = Math.atan2(g.o.x, g.o.z + 40) - a0; d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); const gy = this.h.groundAt(g.o.x + g.w.x * 2.5, g.o.z + g.w.z * 2.5, g.o.y + 2); if (gy == null || Math.abs(gy - g.o.y) > 1.2) continue; const sc = d > Math.PI * 0.95 ? -1 : d; if (sc > bd && d <= Math.PI * 0.95) { bd = sc; best = g; } }
      this._outG = best && bd > 0.9 ? best : false;
    }
    const g = this._outG; if (!g) return null;
    const q = g.o.clone().addScaledVector(g.w, 2.5); q.y = this.h.groundAt(q.x, q.z, g.o.y + 2) ?? g.o.y;
    const n = g.it && g.it.def && g.it.def.n;
    return { p: q, label: n ? `${n} ゲートの前` : '反対側のゲートの前', out: true, r: 5 };
  }
  // ゲートを選ぶ(外の口 o・中の口 inn・通る点の列)。virt: 定義の無い球場の入場の所(E で入る)
  pickGate(from, to) {
    const fp = this.h.fp(); if (!fp || !fp.gateList) return null;
    const L = [];
    for (const g of fp.gateList()) {
      if (g.inner) continue;
      if (g.virt) { L.push({ o: g.o, w: g.w, virt: true, pts: [g.o.clone().addScaledVector(g.w, 3), g.o.clone()] }); continue; }
      const it = g.it; let pts = it.segs && it.segs.length ? [it.segs[0].a, ...it.segs.map((s) => s.b)].map((q) => q.clone()) : [g.o.clone(), (it.mouthIn || g.o).clone()];
      if (pts[0].distanceTo(g.o) > pts[pts.length - 1].distanceTo(g.o)) pts.reverse();
      const inn = pts[pts.length - 1];
      { const gy = this.h.groundAt(g.o.x + g.w.x * 2.5, g.o.z + g.w.z * 2.5, g.o.y + 2); if (gy == null || Math.abs(gy - g.o.y) > 1.2) continue; }   // 外の口の前に床が無い(段の上の宙の口)
      pts.unshift(g.o.clone().addScaledVector(g.w, 2.5));
      L.push({ o: g.o, w: g.w, inn, pts, n: it.def && it.def.n });
    }
    if (!L.length) return null;
    let best = null, bd = 1e9;
    for (const g of L) { const d = Math.hypot(g.o.x - from.x, g.o.z - from.z) + (to ? Math.hypot((g.inn || g.o).x - to.x, (g.inn || g.o).z - to.z) * 0.7 : 0) - (g.virt ? 0 : 0.01); if (d < bd) { bd = d; best = g; } }
    return best;
  }

  // ---------------------------------------------------------------- 道を作る
  // 道の目(walkers.js の 1 m の目。観戦の時)があればそれをたどる。無い時・つながらない時は、ゲート・通路口を通る直線
  graph() { const fp = this.h.fp(), W = fp && fp.walkers && fp.walkers(); return W && W.built && W.nodes && W.nodes.length ? W : null; }
  nodeAt(W, p, r = 2) {
    const ix = Math.round(p.x), iz = Math.round(p.z), iy = Math.round(p.y / 2.2); let best = null, bd = 1e9;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) for (let dy = -1; dy <= 1; dy++) {
      const k = W.key.get(`${ix + dx},${iz + dz},${iy + dy}`); if (k == null) continue; const n = W.nodes[k]; if (!n.nb.length) continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z) + Math.abs(n.y - p.y) * 2; if (d < bd && Math.abs(n.y - p.y) < 1.6) { bd = d; best = n; }
    }
    return best;
  }
  // 近くに道の目が無い時(店の前の奥まった所など): 4 m 以内で、間に壁の無い目
  nodeSeen(W, p) {
    const bvh = window.__app && window.__app.bvh; let best = null, bd = 1e9;
    const ix = Math.round(p.x), iz = Math.round(p.z), iy = Math.round(p.y / 2.2);
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) for (let dy = -1; dy <= 1; dy++) {
      const k = W.key.get(`${ix + dx},${iz + dz},${iy + dy}`); if (k == null) continue; const n = W.nodes[k]; if (!n.nb.length || Math.abs(n.y - p.y) > 1.6) continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z); if (d >= bd) continue;
      if (bvh) { const dir = V(n.x - p.x, 0, n.z - p.z); const L = dir.length(); if (L > 0.05 && bvh.raycastFirst(new THREE.Ray(V(p.x, p.y + 0.6, p.z), dir.normalize()), THREE.DoubleSide, 0, L)) continue; }
      bd = d; best = n;
    }
    return best;
  }
  bfs(W, a, b) {
    if (a === b) return [a];
    const prev = new Int32Array(W.nodes.length).fill(-2); prev[a.i] = -1; const q = [a.i];
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      for (const j of W.nodes[i].nb) { if (prev[j] !== -2) continue; prev[j] = i; if (j === b.i) { const out = []; let k = j; while (k !== -1) { out.push(W.nodes[k]); k = prev[k]; } return out.reverse(); } q.push(j); }
    }
    return null;
  }
  leg(a, b, out) {   // a から b へ(a は入れない)
    const W = this.graph();
    if (W && !out) {
      const na = this.nodeAt(W, a) || this.nodeSeen(W, a), nb = this.nodeAt(W, b, 3);
      if (na && nb) { const P = this.bfs(W, na, nb); if (P && P.length > 1) { const L = []; let last = P[0]; for (let k = 1; k < P.length - 1; k++) { const n = P[k], nx = P[k + 1]; if ((nx.x - n.x) !== (n.x - last.x) || (nx.z - n.z) !== (n.z - last.z) || Math.abs(n.y - last.y) > 0.3) L.push(V(n.x, n.y, n.z)); last = n; } L.push(b.clone()); return L; } }
    }
    // 外: 球場のまわりの輪の道(ringGraph)をたどる
    if (out) { const rg = this.ringPath(a, b); if (rg) { rg.push(b.clone()); return rg; } }
    // 道の目が無い所・つながらない所: その場で 1 m の目を調べる道(astar。少しずつ。できるまでは直線)
    if (!out) { const c = this.astarGet(a, b); if (c) return c.concat([b.clone()]); }
    // 直線(球場の真ん中を横切る外の道は、外の輪にそって回る)
    const L = [];
    if (out) {
      const c = V(0, 0, -40), R = this.outRing();
      const aa = Math.atan2(a.x, a.z + 40), ab = Math.atan2(b.x, b.z + 40); let d = Math.atan2(Math.sin(ab - aa), Math.cos(ab - aa));
      if (R && Math.abs(d) > 0.5) { const n = Math.ceil(Math.abs(d) / 0.3); for (let k = 1; k < n; k++) { const t = aa + d * k / n, x = c.x + Math.sin(t) * (R + 6), z = c.z + Math.cos(t) * (R + 6); const y = this.h.groundAt(x, z, a.y + 6) ?? a.y; L.push(V(x, y, z)); } }
    }
    L.push(b.clone());
    return L;
  }
  // 球場のまわりの外の道: 4 度ごとに、外の輪から外へ 3 つの距離の点(床があり、まわり 0.6 m に壁が無い所)。となりの角度の点どうしを、
  // 間に壁・柵が無く床が続いていればつなぐ。最初に要った時に 1 回だけ作る(光線 2,000 本ほど)
  ringGraph() {
    if (this._ring !== undefined) return this._ring;
    if (!this._ringGen) { const g = this.ringGen(); if (!g) return (this._ring = null); this._ringGen = g; }
    return null;   // 作っている間は null(update が少しずつ進める)
  }
  ringTick(budget) {   // 1 こまに budget ms まで(スマホでこまを止めない)
    const g = this._ringGen; if (!g) return; const tEnd = performance.now() + budget;
    while (performance.now() < tEnd) { const r = g.next(); if (r.done) { this._ring = r.value; this._ringGen = null; this.route = null; return; } }
  }
  *ringGenBody(pl, R0, bvh) {
    const t0 = performance.now(), y0 = pl.out.y, N = 90, RS = [3, 9, 16, 24, 34], nodes = [], ray = new THREE.Ray(), dirs = [V(1, 0, 0), V(-1, 0, 0), V(0, 0, 1), V(0, 0, -1)];
    const hit = (o, d, L) => { ray.origin.copy(o); ray.direction.copy(d).normalize(); return bvh.raycastFirst(ray, THREE.DoubleSide, 0, L); };
    for (let i = 0; i < N; i++) {
      const t = i / N * Math.PI * 2;
      for (const dr of RS) {
        const x = Math.sin(t) * (R0 + dr), z = -40 + Math.cos(t) * (R0 + dr), gy = this.h.groundAt(x, z, y0 + 8, 16);
        if (gy == null || Math.abs(gy - y0) > 4.5) continue;
        if (this.seatCell(x, z)) continue;   // 客席の上(外の輪の外まで出ている席)は外の道にしない
        const o = V(x, gy + 0.5, z); if (dirs.some((d) => hit(o, d, 0.6))) continue;
        nodes.push({ i: nodes.length, a: i, x, y: gy, z, nb: [] });
      }
      yield;
    }
    const byA = []; for (const n of nodes) (byA[n.a] = byA[n.a] || []).push(n);
    const clear = (p, q) => { const d = V(q.x - p.x, q.y - p.y, q.z - p.z), L = d.length(); if (L < 0.1) return true; if (Math.abs(q.y - p.y) > L * 0.6) return false; for (const h of [0.5, 1.3]) if (hit(V(p.x, p.y + h, p.z), d, L)) return false; const m = this.h.groundAt((p.x + q.x) / 2, (p.z + q.z) / 2, Math.max(p.y, q.y) + 1.5, 4); return m != null && m > Math.min(p.y, q.y) - 1.2; };
    for (let i = 0; i < N; i++) {
      const A = byA[i] || [], B = byA[(i + 1) % N] || [];
      for (const p of A) { for (const q of B) if (clear(p, q)) { p.nb.push(q.i); q.nb.push(p.i); } }
      for (let k = 0; k + 1 < A.length; k++) if (clear(A[k], A[k + 1])) { A[k].nb.push(A[k + 1].i); A[k + 1].nb.push(A[k].i); }
      yield;
    }
    return { nodes, ms: Math.round(performance.now() - t0) };
  }
  ringGen() {
    const fp = this.h.fp(), pl = fp && fp._plan, R0 = this.outRing(), bvh = window.__app && window.__app.bvh;
    if (!R0 || !bvh) return null;
    return this.ringGenBody(pl || { out: { y: this._gateY || 0 } }, R0, bvh);
  }
  seatCell(x, z) {
    if (!this._seatCells) { const S = this.h.seats, C = new Set(); if (S && S.n) for (let i = 0; i < S.n; i++) C.add(Math.floor(S.x[i] / 3) * 10007 + Math.floor(S.z[i] / 3)); this._seatCells = C; }
    const C = this._seatCells, ix = Math.floor(x / 3), iz = Math.floor(z / 3);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (C.has((ix + a) * 10007 + iz + b)) return true;
    return false;
  }
  inStand(x, y, z) { return this.standAt(V(x, y, z)); }
  ringPath(a, b) {
    const G = this.ringGraph(); if (!G || !G.nodes.length) return null;
    const bvh = window.__app && window.__app.bvh, ray = new THREE.Ray();
    const seen = (p, n) => { const d = V(n.x - p.x, 0, n.z - p.z), L = d.length(); if (L < 0.2) return true; if (Math.abs(n.y - p.y) > 2.5) return false; ray.origin.set(p.x, p.y + 0.7, p.z); ray.direction.copy(d).normalize(); return !bvh.raycastFirst(ray, THREE.DoubleSide, 0, L); };
    const near = (p) => { let best = null, bd = 1e9; for (const n of G.nodes) { const d = Math.hypot(n.x - p.x, n.z - p.z) + Math.abs(n.y - p.y) * 2; if (d < bd && d < 40 && seen(p, n)) { bd = d; best = n; } } return best; };
    const na = near(a), nb = near(b); if (!na || !nb) return null;
    if (Math.hypot(a.x - b.x, a.z - b.z) < Math.hypot(a.x - na.x, a.z - na.z) + Math.hypot(b.x - nb.x, b.z - nb.z) && seen(a, { x: b.x, y: b.y, z: b.z })) return [];   // まっすぐ行ける
    // 短い道(ダイクストラ。点は 450 まで)
    const n = G.nodes.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n); dist[na.i] = 0;
    for (;;) { let u = -1, ud = Infinity; for (let i = 0; i < n; i++) if (!done[i] && dist[i] < ud) { ud = dist[i]; u = i; } if (u < 0 || u === nb.i) break; done[u] = 1; const U = G.nodes[u]; for (const j of U.nb) { const V2 = G.nodes[j], d = ud + Math.hypot(V2.x - U.x, V2.z - U.z) + Math.abs(V2.y - U.y); if (d < dist[j]) { dist[j] = d; prev[j] = u; } } }
    if (!isFinite(dist[nb.i])) return null;
    const out = []; for (let k = nb.i; k !== -1; k = prev[k]) out.push(V(G.nodes[k].x, G.nodes[k].y, G.nodes[k].z));
    return out.reverse();
  }
  // 外の輪の半径(本塁の 40 m 後ろが真ん中)。観戦はチケットの決まりと同じ。歩く時はゲートの外の口のいちばん内側
  // ---------------------------------------------------------------- その場で調べる道(1 m の目、床・壁・頭の上を光線で見る。js/walkers.js の道と同じ見方を少しゆるく)
  lineClear(a, b) {
    const bvh = window.__app && window.__app.bvh; if (!bvh) return true; const d = V(b.x - a.x, 0, b.z - a.z), L = d.length(); if (L < 0.5) return true; d.normalize();
    const ray = new THREE.Ray(); for (const hgt of [0.6, 1.3]) { ray.origin.set(a.x, a.y + hgt, a.z); ray.direction.set(d.x, (b.y - a.y) / L, d.z).normalize(); if (bvh.raycastFirst(ray, THREE.DoubleSide, 0, L)) return false; }
    for (let t = 2; t < L; t += 2) { const x = a.x + d.x * t, z = a.z + d.z * t, yi = a.y + (b.y - a.y) * t / L, g = this.h.groundAt(x, z, yi + 1.2, 3); if (g == null || Math.abs(g - yi) > 1.0) return false; }
    return true;
  }
  astarGet(a, b) {
    const key = `${Math.round(b.x)},${Math.round(b.z)},${Math.round(b.y)}`;   // 行き先ごと。調べた道の近く(3 m)にいる間は、その道の残りを使う
    const C = this._astarC || (this._astarC = new Map());
    const c = C.get(key);
    if (c) { if (!c.path) { if (c.from.distanceTo(a) < 3) return null; } else { let k = -1, kd = 3; c.path.forEach((q, i) => { const d = Math.hypot(q.x - a.x, q.z - a.z) + Math.abs(q.y - a.y); if (d < kd) { kd = d; k = i; } }); if (k >= 0 || c.from.distanceTo(a) < 3) return c.path.slice(k + 1); } }
    if (this.lineClear(a, b)) return null;
    if (!this._astar || this._astar.key !== key) this._astar = { key, from: a.clone(), gen: this.astarGen(a.clone(), b.clone()) };
    return null;
  }
  astarTick(budget) {
    const J = this._astar; if (!J) return; const tEnd = performance.now() + budget;
    while (performance.now() < tEnd) { const r = J.gen.next(); if (r.done) { const C = this._astarC; C.set(J.key, { path: r.value, from: J.from }); if (C.size > 24) C.delete(C.keys().next().value); this._astar = null; this.route = null; return; } }
  }
  *astarGen(a, b) {
    const bvh = window.__app && window.__app.bvh, H = this.h; if (!bvh) return null;
    const ray = new THREE.Ray(), hit = (ox, oy, oz, dx, dy, dz, L) => { ray.origin.set(ox, oy, oz); ray.direction.set(dx, dy, dz).normalize(); return bvh.raycastFirst(ray, THREE.DoubleSide, 0, L); };
    const DIR = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    const kOf = (x, z, y) => `${x},${z},${Math.round(y / 1.5)}`;
    const sy = H.groundAt(Math.round(a.x), Math.round(a.z), a.y + 1.0, 2.5) ?? a.y;
    const start = { x: Math.round(a.x), z: Math.round(a.z), y: sy, g: 0, p: null };
    const hf = (n) => Math.hypot(n.x - b.x, n.z - b.z) + Math.abs(n.y - b.y);
    const open = [start], seen = new Map([[kOf(start.x, start.z, start.y), start]]); start.f = hf(start);
    let best = start, it = 0;
    while (open.length && it < 2600) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const n = open[bi]; open[bi] = open[open.length - 1]; open.pop(); if (n.closed) continue; n.closed = true; it++;
      if (hf(n) < hf(best)) best = n;
      if (Math.hypot(n.x - b.x, n.z - b.z) < 1.6 && Math.abs(n.y - b.y) < 1.6) { best = n; break; }
      for (const [dx, dz] of DIR) {
        const nx = n.x + dx, nz = n.z + dz, len = Math.hypot(dx, dz);
        const gy = H.groundAt(nx, nz, n.y + 1.0, 2.4); if (gy == null || gy - n.y > 0.8 || n.y - gy > 1.2) continue;
        const k = kOf(nx, nz, gy); const old = seen.get(k); if (old && old.closed) continue;
        if (hit(n.x, n.y + 0.55, n.z, dx, (gy - n.y) / len, dz, len + 0.3) || hit(n.x, n.y + 1.35, n.z, dx, (gy - n.y) / len, dz, len + 0.3)) continue;
        if (hit(nx, gy + 0.1, nz, 0, 1, 0, 1.85)) continue;
        { const gm = H.groundAt(n.x + dx * 0.5, n.z + dz * 0.5, Math.max(n.y, gy) + 0.6, 1.8); if (gm == null || gm < Math.min(n.y, gy) - 0.4) continue; }
        const g = n.g + len + Math.abs(gy - n.y) * 0.5;
        if (old && old.g <= g) continue;
        const m = old || { x: nx, z: nz, y: gy }; m.g = g; m.p = n; m.f = g + hf(m) * 1.15; if (!old) seen.set(k, m); open.push(m);
      }
      if ((it & 15) === 0) yield;
    }
    if (Math.hypot(best.x - b.x, best.z - b.z) > 3) return null;   // 着かない(この道は直線のまま)
    const P = []; for (let n = best; n; n = n.p) P.push(n); P.reverse();
    const out = []; let last = P[0];
    for (let k = 1; k < P.length - 1; k++) { const n = P[k], nx = P[k + 1]; if ((nx.x - n.x) !== (n.x - last.x) || (nx.z - n.z) !== (n.z - last.z) || Math.abs(n.y - last.y) > 0.3) out.push(V(n.x, n.y, n.z)); last = n; }
    return out;
  }
  outRing() {
    const fp = this.h.fp(), pl = fp && fp._plan; try { if (pl) return fp.outR(); } catch (e) { return null; }
    if (this._gateR !== undefined) return this._gateR;
    let r = Infinity, ys = []; for (const g of (fp && fp.gateList ? fp.gateList() : [])) { if (g.virt || g.inner) continue; r = Math.min(r, Math.hypot(g.o.x, g.o.z + 40)); ys.push(g.o.y); }
    ys.sort((a, b) => a - b); this._gateY = ys.length ? ys[ys.length >> 1] : 0;
    return (this._gateR = isFinite(r) && r > 60 ? r : null);
  }
  walkOut() { const fp = this.h.fp(); return !(fp && fp.tktOn && fp._plan) && !!this.outRing(); }   // 歩く(チケットの決まりが無い)時も、外の輪で外と中を分ける
  vomFor(from, to, toStand, all) {
    const P = this.h.passages(); if (!P || !P.nav) return null;
    if (!this._voms) this._voms = P.nav().filter((it) => it.kind === 'vom' && it.a && it.b).map((it) => { const a = V(...it.a), b = V(...it.b); let pts = (it.pts || []).map((q) => V(...q)); if (pts.length >= 2 && pts[0].distanceTo(a) > pts[pts.length - 1].distanceTo(a)) pts.reverse(); if (pts.length < 2) pts = [a, b];
      { const n = pts.length, e = pts[n - 1], f = pts[n - 2], d = V(e.x - f.x, 0, e.z - f.z); if (d.lengthSq() > 0.01) { d.normalize(); const q = e.clone().addScaledVector(d, 1.8), gy = this.h.groundAt(q.x, q.z, e.y + 1.5, 3); if (gy != null && Math.abs(gy - e.y) < 1.2) { q.y = gy; pts.push(q); } } }   // 客席の側の口の前 1.8 m(手すりの横から入らない)
      return { a, b, pts }; });
    let best = null, bd = 1e9;
    const dd = (q, p) => Math.hypot(q.x - p.x, q.z - p.z) + Math.abs(q.y - p.y) * 3, cand = [];
    for (const v of this._voms) {
      const L = toStand ? v.pts.slice() : v.pts.slice().reverse();
      if (v.st === undefined) { const e = v.pts[v.pts.length - 1], S = this.h.seats; let ok = false; if (S && S.n) for (let i = 0; i < S.n && !ok; i += 2) { const dy = S.y[i] - 0.42 - e.y; if (Math.abs(S.x[i] - e.x) < 8 && Math.abs(S.z[i] - e.z) < 8 && dy > -6 && dy < 2.5) ok = true; } v.st = ok; }
      if (!v.st) continue;   // 客席の側の口のまわりに席が無い通路口(コンコースの中の口)は使わない
      let k = 0, kd = 1e9; for (let i = 0; i < L.length - 1; i++) { const d = dd(L[i], from); if (d < kd) { kd = d; k = i; } }   // 通路の途中の、いまの所にいちばん近い点から入る
      const d = toStand ? kd + 2 * dd(L[L.length - 1], to) : 2 * kd + dd(L[L.length - 1], to); cand.push([d, L.slice(k)]); if (d < bd) { bd = d; best = L.slice(k); }   // 客席を出る時は近くの通路口、入る時は行き先の席に近い通路口
    }
    if (all) return cand.sort((x, y) => x[0] - y[0]).map((x) => x[1]);
    return best;   // 通る点の列(入る点 → 出る口)
  }
  outAt(x, z) { if (this.walkOut()) return Math.hypot(x, z + 40) > this.outRing() + 1; const fp = this.h.fp(); try { return !!(fp && fp.tktOn && fp._plan && !fp.zoneIn(x, z, 3)); } catch (e) { return false; } }
  // 外にいるか。freeplay.js の outside() はゲートのまわり 12 m を外とみなすので、ゲートの中の側(外の口より 1.5 m 以上中)は中とする
  isOut(P) {
    if (this.walkOut()) return Math.hypot(P.x, P.z + 40) > this.outRing() + 1 && !this.standAt(P);
    const fp = this.h.fp(); if (!fp || !fp.tktOn || !fp._plan) return false;
    if (!fp.outside()) { const R0 = this.outRing(); if (!(R0 && !fp.fenceZone() && Math.hypot(P.x, P.z + 40) > R0 + 3)) return false; }   // 外の輪より外は、ひさしの下でも外
    for (const g of fp.gateList()) { if (g.virt) continue; const dx = P.x - g.o.x, dz = P.z - g.o.z; if (Math.hypot(dx, dz) < 18 && Math.abs(P.y - g.o.y) < 4 && dx * g.w.x + dz * g.w.z < -1.5) return false; }
    return true;
  }
  standAt(q) {   // 客席の段の上か(まわり 2.5 m に席)
    const S = this.h.seats; if (!S || !S.n) return false;
    for (let i = 0; i < S.n; i++) { const dx = S.x[i] - q.x; if (dx > 1.8 || dx < -1.8) continue; const dz = S.z[i] - q.z; if (dz > 1.8 || dz < -1.8) continue; if (Math.abs(S.y[i] - 0.42 - q.y) < 1.0 && dx * dx + dz * dz < 3.3) return true; }
    return false;
  }
  // グラウンドの上か(フェンスの内とファウルの所の低い所)
  onField(P) {
    if (P.y > 1.3) return false; const fd = window.__app && window.__app.fenceDist; const r = Math.hypot(P.x, P.z), ang = Math.atan2(P.x, -P.z) * 180 / Math.PI;
    if (!(P.z < 14 && r < (fd ? fd(Math.max(-50, Math.min(50, ang))) : 100) + 1)) return false;
    const bvh = window.__app && window.__app.bvh; if (bvh && bvh.raycastFirst(new THREE.Ray(V(P.x, P.y + 2.2, P.z), V(0, 1, 0)), THREE.DoubleSide, 0, 14)) return false;   // 頭の上に屋根(コンコース・ベンチの中)はグラウンドではない
    return !this.standAt(P);
  }
  // 席はどこでもよい時: 通路口を出た所(q)にいちばん近い、同じ高さの段の席(区画の中)
  seatNear(q, sec) {
    const S = this.h.seats, fp = this.h.fp(); if (!S || !S.n) return null; let bi = -1, bd = 1e9;
    for (let i = 0; i < S.n; i++) { const dy = S.y[i] - 0.42 - q.y; if (dy < -4 || dy > 1.0) continue; const d = Math.hypot(S.x[i] - q.x, S.z[i] - q.z) + Math.max(0, -dy) * 0.4; if (d < bd && d < 25 && (!sec || !fp || fp.sectionOf(S.x[i], S.z[i]) === sec)) { bd = d; bi = i; } }   // 下の段(通路を下りる)も
    return bi >= 0 ? V(S.x[bi], S.y[bi], S.z[bi]) : null;
  }
  // 中の道: 道の目がつながっていればそれ。客席 ⇔ コンコースは通路口を通る(道の目は客席とコンコースで別の島のことが多い)
  inLeg(from, T, toP, toStand) {
    const out = []; let cur = from; const push = (L) => { for (const q of L) { out.push(q); cur = q; } };
    const W = this.graph();
    if (W) { const na = this.nodeAt(W, cur) || this.nodeSeen(W, cur), nb = this.nodeAt(W, toP, 3); if (na && nb && this.bfs(W, na, nb)) { push(this.leg(cur, toP, false)); return out; } }
    if (!!toStand !== this.standAt(cur)) {
      let v = null; const L0 = this.vomFor(cur, toP, !!toStand, true) || [];
      if (W) { const na = this.nodeAt(W, cur) || this.nodeSeen(W, cur); if (na) for (const c of L0.slice(0, 8)) { const nb = this.nodeAt(W, c[0], 3); if (nb && this.bfs(W, na, nb)) { v = c; break; } } }   // 道の目でいまの所から行ける通路口
      if (!v) v = L0[0] || null;
      if (v) { push(this.leg(cur, v[0], false)); push(v.slice(1));
        if (toStand && T && T.sec && toP === T.p) { const q = this.seatNear(cur, T.sec === 'any' ? null : T.sec); if (q) { if (this._seatT) this._seatT.q = q.clone(); T.p.set(q.x, q.y - 0.42, q.z); } } }   // 席はどこでもよいので、通路口を出た所にいちばん近い席にする
    }
    push(this.leg(cur, toP, false));
    return out;
  }
  makeRoute(T) {
    const H = this.h, fp = H.fp(), P = H.player.pos.clone(), pts = [];
    const pl = fp && fp._plan, tk = !!(fp && fp.tktOn && pl) || this.walkOut();
    const pOut = tk && this.isOut(P), tOut = !!T.out;
    let cur = P;
    const push = (L) => { for (const q of L) { pts.push(q); cur = q; } };
    if (!T.field && this.onField(P)) {   // グラウンドの上: 行き先の方のフェンス・壁の前へ(E でよじ登る。js/fallguard.js)
      const bvh = window.__app && window.__app.bvh; let dir = V(T.p.x - P.x, 0, T.p.z - P.z); if (dir.lengthSq() < 1) dir = V(P.x, 0, P.z + 40); dir.normalize();
      let best = null;   // よじ登れる壁(向こうに 0.9〜7 m 上の床がある。js/fallguard.js と同じ見方)のうち、行き先の向きに近く、近い所
      for (const a of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2, 3.0]) {
        const d = dir.clone().applyAxisAngle(V(0, 1, 0), a), h = bvh ? bvh.raycastFirst(new THREE.Ray(V(P.x, P.y + 0.5, P.z), d), THREE.DoubleSide, 0, 140) : null; if (!h) continue;
        let ok = false; for (const k of [0.35, 0.6, 0.9, 1.3, 1.8, 2.4, 3.0]) { const x = P.x + d.x * (h.distance + k), z = P.z + d.z * (h.distance + k), g = H.groundAt(x, z, P.y + 7.5, 8); if (g != null && g - P.y >= 0.9 && g - P.y <= 7) { ok = true; break; } }
        if (!ok) continue; const sc = h.distance + Math.abs(a) * 15; if (!best || sc < best.sc) best = { L: h.distance, d, sc };
      }
      if (best) { this.routeNote = 'フェンスの前で ' + (H.IS_TOUCH ? '緑のボタン' : 'E') + '(よじ登る)'; return [V(P.x + best.d.x * Math.max(0, best.L - 0.8), P.y, P.z + best.d.z * Math.max(0, best.L - 0.8)), V(P.x + best.d.x * (best.L + 1.5), P.y, P.z + best.d.z * (best.L + 1.5))]; }
    }
    if (T.gate) { push(this.leg(cur, T.gate.pts[0], true)); push(T.gate.pts.slice(1)); return pts; }
    if (tk && pOut && !tOut) {   // 外 → 中: ゲートを通る
      const g = this.pickGate(P, T.p);
      if (g) { push(this.leg(cur, g.pts[0], true)); push(g.pts.slice(1)); if (g.virt) { this.routeNote = '入場の所で ' + (H.IS_TOUCH ? '緑のボタン' : 'E'); return pts; } }
      push(this.inLeg(cur, T, T.p, T.stand)); return pts;
    }
    if (tk && !pOut && tOut) {   // 中 → 外: ゲートの中の口まで中の道、ゲートを抜けて、外の道
      const g = this.pickGate(P, null);   // 近くのゲートから出て、外を回る
      if (g && !g.virt) { const r = g.pts.slice().reverse(); push(this.inLeg(cur, null, r[0], false)); push(r.slice(1)); }
      push(this.leg(cur, T.p, true)); return pts;
    }
    if (tOut) { push(this.leg(cur, T.p, true)); return pts; }
    push(this.inLeg(cur, T, T.p, T.stand));
    return pts;
  }

  // ---------------------------------------------------------------- 毎こま(main.js の updateUI から)
  update() {
    const H = this.h;
    if (!this.kind) return;
    const playing = H.isPlaying(), mode = H.getMode(), photo = document.body.classList.contains('photo');
    const free = playing && (mode === 'walk' || mode === 'sit' || mode === 'fprest' || mode === 'drive');
    const now = performance.now(), dt = Math.min(0.2, (now - (this.tNow || now)) / 1000); this.tNow = now;
    // 見ている物(試験の step でも動くよう、こまごとに足す)
    const p = H.player.pos, yaw = H.player.yaw;
    if (this.lastP && mode === 'walk') this.moved += Math.min(2, Math.hypot(p.x - this.lastP.x, p.z - this.lastP.z));
    if (this.lastYaw != null) { let d = yaw - this.lastYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.turned += Math.min(0.5, Math.abs(d)); }
    this.lastP = p.clone(); this.lastYaw = yaw;
    { const wf = H.wayfind(); if (wf && wf.mapOn) this.mapSeen = true; }
    if (photo && !this.photoSeen) { this.photoSeen = true; this.ev('photo'); }
    if (!photo) this.photoSeen = false;
    this.watchEvents(mode);
    if (!free || photo) { this.elCard.classList.add('hide'); this.elPin.classList.add('hide'); this.chev.visible = false; if (!playing) this.elTips.classList.add('hide'); return; }
    // 観戦のしかた(初めて席に座った時に 1 回)
    if (this.kind === 'watch' && mode === 'sit' && !lsGet('r4walk.mk.watchTips', 0) && !this.tipsOn) this.showTips();
    if (this.tipsOn && now > this.tipsUntil) this.hideTips();
    // できたかを 0.2 秒ごとに見る
    if (now - this.t > 200 || ++this.nChk >= 6) { this.t = now; this.nChk = 0; this.check(); }
    if (this._ringGen) this.ringTick(H.IS_TOUCH ? 2 : 3);
    else if (this._astar) this.astarTick(H.IS_TOUCH ? 2 : 3);
    this.paint(false);
    this.guide(now, dt);
  }
  // 座った区画・いちばん上の段・グラウンド・一周(0.3 秒ごと)
  watchEvents(mode) {
    const now = performance.now(); if ((this._wN = (this._wN || 0) + 1) % 4 && now - (this._wT || 0) < 300) return; this._wT = now;   // 4 こまか 0.3 秒ごと
    const H = this.h, p = H.player.pos;
    this.wrapSpots();
    if (mode === 'sit') {
      const sec = this.secHere();
      if (this._sitK !== sec) { this._sitK = sec; if (sec) { this.ev('sit:' + sec); if (this.isOuenSec(sec)) this.ev('sit:ouen'); } }
    } else this._sitK = null;
    if ((mode === 'sit' || mode === 'walk') && p.y >= this.topY() - 4.5 && (mode === 'sit' || this.standAt(p))) { if (!this._topK) { this._topK = 1; this.ev('top'); } } else this._topK = 0;   // いちばん上の席から 4 m ほどの中(上の 2〜3 段)
    if (this.kind === 'walk' && mode === 'walk') { const f = this.onField(p); if (f && !this._fieldK) this.ev('field'); this._fieldK = f; }
    { const L0 = H.lap(); const last = L0 ? L0.last : null; if (last != null && last !== this.lap0) { this.lap0 = last; this.ev('lap'); } }
  }
  check() {
    if (this.tut) {
      const s = this.tut.steps[this.tut.i]; if (!s) return;
      if (s.skipIf && s.skipIf()) { this.nextTut(); return; }
      if (s.done()) { this.cheer(s.h); this.nextTut(); }
      return;
    }
    // どの目標も、やったら達成(順番どおりでなくてよい)。1 回に 1 つずつ褒める
    const L = this.goals(), cur = this.current();
    for (const g of L) {
      if (this.isDone(g) || !g.need()) continue;
      let ok = false; try { ok = g.done(); } catch (e) { ok = false; }
      if (!ok) continue;
      this.complete(g, cur);
      break;
    }
  }
  // 達成: 進み具合に残す・ごほうび・小さく褒める・次の目標
  complete(g, cur) {
    if (g.all) { this.progAll[g.id] = 1; lsSet('r4walk.mk.p.all', this.progAll); } else { this.prog[g.id] = 1; lsSet('r4walk.mk.p.' + this.st, this.prog); }
    const rw = g.reward || {}, got = [];
    const fp = this.h.fp();
    if (rw.yen && fp && fp.earn) { fp.earn(rw.yen, `目標「${g.h}」`); if (!fp.noPrice) got.push(`+${rw.yen.toLocaleString()}円`); }
    if (rw.badge && BADGES[rw.badge]) { this.rw.badges[rw.badge] = 1; if (!this.rw.title) this.rw.title = rw.badge; got.push(`称号「${BADGES[rw.badge].name}」`); }
    if (rw.goods && ITEMS[rw.goods]) { this.rw.goods[rw.goods] = 1; if (fp) { fp.owned[rw.goods] = 1; lsSet('r4walk.fp.owned', fp.owned); } got.push(`${ITEMS[rw.goods].name}`); }
    if (rw.seat && SEAT_REWARDS[rw.seat]) { this.rw.seats[rw.seat] = 1; got.push(`${SEAT_REWARDS[rw.seat].replace(/(.*)$/, '')}へ行ける`); }
    lsSet('r4walk.mk.rw', this.rw);
    this.lastDone = { id: g.id, got };
    this.cheer(g.h, got.join(' ・ '));
    // 次: 今の目標(選んだ物)を達成したら、表の next か順番の次へ。ほかの目標がついでに達成されただけなら、今の目標のまま
    if (!cur || cur.id === g.id) { this.pick = null; const L = this.goals(), nx = g.next && L.find((x) => x.id === g.next); if (nx && !this.isDone(nx) && nx.need()) this.pick = nx.id; }
    this._curC = null; this.cur = null; this.route = null; this.lastT = null;
    this.paint(true);
  }
  nextTut() {
    const t = this.tut; t.i++; this.route = null; this.cur = null; this._curC = null;
    if (t.i >= t.steps.length) { lsSet(t.key, 'done'); this.tut = null; this.refreshOpt(); const fp = this.h.fp(); if (fp && fp.earn) fp.earn(1000, 'はじめの案内を終えた'); this.cheer('はじめの案内 おわり', ''); this.askMaybe(); return; }
    lsSet(t.key, t.i);
  }
  cheer(txt, got) {
    this.win = performance.now() + 3000; this.winTxt = txt;
    const S = this.h.sound; if (S && S.sfx) { S.sfx('base_step', { gain: 0.3, rate: 1.6 }); setTimeout(() => S.sfx('base_step', { gain: 0.3, rate: 2.0 }), 160); }
    const w = this.elCard.querySelector('.mkW');
    w.innerHTML = ''; const b = document.createElement('b'); b.textContent = `できた! ${txt}`; w.appendChild(b);
    if (got) { const s = document.createElement('span'); s.textContent = `ごほうび ${got}`; w.appendChild(s); }
    w.classList.remove('on'); void w.offsetWidth; w.classList.add('on');
  }
  chName(id) { const c = CHAPTERS.find((x) => x.id === id); return c ? c.name : ''; }
  // 札(左上、点数板・お金の札の下)
  paint(force) {
    const H = this.h, el = this.elCard, g = this.current();
    if (!this.kind) { el.classList.add('hide'); return; }
    const free = H.isPlaying() && ['walk', 'sit', 'fprest', 'drive'].includes(H.getMode()) && !document.body.classList.contains('photo');
    el.classList.toggle('hide', !free);
    el.classList.toggle('off', !this.on);
    el.classList.toggle('tut', !!this.tut);
    const k = this.tut ? `はじめの案内 ${this.tut.i + 1}/${this.tut.steps.length}` : g ? `やってみよう ・ ${this.chName(g.ch)}` : 'やってみよう';
    const hh = g ? g.h : (this.tut ? '' : '好きに過ごそう');
    let ss = g ? (g.sub ? g.sub() || g.s : g.s) : '押すと、やってみたいことの一覧';
    const T = this.lastT;
    if (g && T && this.on && !(this.tut && !g.target)) { const p = H.player.pos, d = Math.hypot(T.p.x - p.x, T.p.z - p.z); if (d > (T.r || 2)) ss = `${T.label}へ ${Math.round(d)} m${this.routeNote ? ' ・ ' + this.routeNote : ''}`; else ss = g.s || ss; }
    const set = (sel, v) => { const e = el.querySelector(sel); if (e.textContent !== v) e.textContent = v; };
    set('.mkK', k); set('.mkH', hh); set('.mkS', ss);
    if (force || !this._posT || performance.now() - this._posT > 500) { this._posT = performance.now(); this.place(); }
  }
  place() {
    // 左上の札(点数板・小さな図・お金・一周の札)の下に置く。重なる物が無ければ左上の端
    let top = 10; const L = innerWidth;
    for (const id of ['board', 'runMap', 'hud', 'fpWallet']) { const e = document.getElementById(id); if (!e || e.classList.contains('hide')) continue; const r = e.getBoundingClientRect(); if (!r.width || !r.height || r.left > L * 0.5 || r.top > innerHeight * 0.5) continue; for (const c of [e, ...e.querySelectorAll('*')]) { const q = c.getBoundingClientRect(); if (q.width && q.height && q.left < L * 0.5 && q.top < innerHeight * 0.5 && getComputedStyle(c).visibility !== 'hidden') top = Math.max(top, q.bottom + 8); } }
    const v = `${Math.round(top)}px`; if (this.elCard.style.top !== v) this.elCard.style.top = v;
    this._cardR = this.elCard.classList.contains('hide') ? null : this.elCard.getBoundingClientRect();
  }
  // 道案内: 地面の矢印・画面の端の印・地図の印
  guide(now, dt) {
    const H = this.h, g = this.current();
    const want = this.on && g && g.target;
    let T = null;
    const gid = g ? (this.tut ? 't:' : '') + g.id : null; if (gid !== this.tId) { this.tId = gid; this.lastT = null; this.route = null; }
    if (want && (now - this.tR > 500 || !this.lastT)) { this.tR = now; T = g.target(); this.lastT = T; }
    else T = want ? this.lastT : null;
    if (!want) this.lastT = null;
    const sit = H.getMode() === 'sit';
    window.__mkTarget = T && this.on ? { p: [T.p.x, T.p.y, T.p.z], label: T.label, route: this.route ? this.route.map((q) => [q.x, q.z]) : null } : null;
    if (!T || sit) { this.chev.visible = false; this.elPin.classList.add('hide'); this.route = null; return; }
    const p = H.player.pos;
    const moved = !this.routeP || this.routeP.distanceTo(p) > 1.5;
    if (!this.route || this.routeT !== T.label || (moved && now - this.tPos > 400) || now - this.tPos > 3000) {
      this.tPos = now; this.routeT = T.label; this.routeP = p.clone(); this.routeNote = '';
      try { this.route = this.makeRoute(T); } catch (e) { console.warn('目標の道', e); this.route = [T.p.clone()]; }
      this.layChev();
    }
    // 着いた所の点は捨てる
    while (this.route.length > 1 && Math.hypot(this.route[0].x - p.x, this.route[0].z - p.z) < 1.4 && Math.abs(this.route[0].y - p.y) < 2.5) { this.route.shift(); this.layChev(); }
    this.flowChev(now);
    this.pin(T);
  }
  // 道の先の点(試験の自動の歩きもこれを目指す)
  carrot(dist = 3) {
    const R = this.route; if (!R || !R.length) return null; const p = this.h.player.pos;
    let prev = V(p.x, p.y, p.z), left = dist;
    for (const q of R) { const d = Math.hypot(q.x - prev.x, q.z - prev.z); if (d >= left) { const t = left / d; return V(prev.x + (q.x - prev.x) * t, prev.y + (q.y - prev.y) * t, prev.z + (q.z - prev.z) * t); } left -= d; prev = q; }
    return R[R.length - 1].clone();
  }
  layChev() {
    const R = this.route, im = this.chev, H = this.h; if (!R || !R.length) { im.count = 0; im.visible = false; return; }
    const p = H.player.pos; let prev = V(p.x, p.y - 0.0, p.z), acc = -1.6, n = 0;
    const m = this._m4, q = this._q, s = V(1, 1, 1), up = V(0, 1, 0);
    for (const w of R) {
      const dx = w.x - prev.x, dz = w.z - prev.z, L = Math.hypot(dx, dz); if (L < 1e-3) { prev = w; continue; }
      const yaw = Math.atan2(-dx, -dz); q.setFromAxisAngle(up, yaw);
      let t = CHEV_GAP - (acc < 0 ? CHEV_GAP + acc : acc);
      for (; t < L && n < N_CHEV; t += CHEV_GAP) {
        const x = prev.x + dx * t / L, z = prev.z + dz * t / L, yi = prev.y + (w.y - prev.y) * t / L;
        const gy = H.groundAt(x, z, yi + 1.3, 3.5); const y = (gy != null && Math.abs(gy - yi) < 2.2 ? gy : yi) + 0.07;
        m.compose(V(x, y, z), q, s); im.setMatrixAt(n, m); n++;
      }
      acc = (L - (t - CHEV_GAP)); prev = w; if (n >= N_CHEV) break;
    }
    im.count = n; im.instanceMatrix.needsUpdate = true; im.visible = n > 0;
  }
  flowChev(now) {
    const im = this.chev; if (!im.visible) return;
    if (now - (this._flowT || 0) < 66) return; this._flowT = now;
    const ph = (now / 1000) * 3.2, c = this._c;
    for (let i = 0; i < im.count; i++) { const k = 0.72 + 0.28 * Math.max(0, Math.cos((i * 0.9 - ph))); const fade = i > im.count - 5 ? (im.count - i) / 5 : 1; c.setRGB(1.0 * k * fade, 0.72 * k * fade, 0.1 * k * fade); im.setColorAt(i, c); }
    im.instanceColor.needsUpdate = true;
  }
  // 画面の端の印: 行き先が見えていればその上に、見えていなければ画面の端にその向きの矢印
  pin(T) {
    const H = this.h, el = this.elPin, cam = H.camera;
    const c = this.carrot(6) || T.p, goal = T.p;
    const p = H.player.pos, d = Math.hypot(goal.x - p.x, goal.z - p.z);
    const v = V(goal.x, goal.y + 1.2, goal.z).project(cam), front = v.z < 1;
    const W = innerWidth, Hh = innerHeight, m = H.IS_TOUCH ? 34 : 40;
    let x, y, ang = null;
    if (front && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.86) { x = (v.x + 1) / 2 * W; y = (1 - v.y) / 2 * Hh; }
    else {
      const cv = V(c.x, c.y + 1.0, c.z).applyMatrix4(cam.matrixWorldInverse); let ax = cv.x, ay = cv.y; if (cv.z > 0) { ax = -ax; ay = -ay; if (Math.abs(ax) < 1e-3) ax = 1e-3; }   // 後ろ: 反対へ
      const a = Math.atan2(ax, ay); ang = a;
      const hw = W / 2 - m, hh = Hh / 2 - m - (H.IS_TOUCH ? 60 : 30), s = Math.min(hw / Math.abs(Math.sin(a) || 1e-6), hh / Math.abs(Math.cos(a) || 1e-6));
      x = W / 2 + Math.sin(a) * s; y = Hh / 2 - Math.cos(a) * s;
    }
    { const r = this._cardR; if (r && x > r.left - 30 && x < r.right + 30 && y > r.top - 40 && y < r.bottom + 40) y = r.bottom + 44; }   // 目標の札に重ねない
    el.classList.remove('hide'); el.classList.toggle('edge', ang != null);
    el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
    el.querySelector('i').style.transform = ang != null ? `rotate(${ang.toFixed(2)}rad)` : '';
    const t = d > (T.r || 2) ? `${Math.round(d)} m` : 'ここ'; const sp = el.querySelector('span'); if (sp.textContent !== t) sp.textContent = t;
  }

  // ---------------------------------------------------------------- 観戦のしかた(1 回だけ)
  showTips() {
    const T = this.h.IS_TOUCH, E = T ? '緑のボタン' : 'E';
    const rows = [
      ['視点', T ? '右上の「視点」で 自分の目 ⇔ 後ろから' : 'V キー(右上の「視点」)で 自分の目 ⇔ 後ろから'],
      ['席', `動くか ${E} で立つ ・ ほかの席へは地図(M)から飛べる`],
      ['音', T ? '一時停止(II)で 実況・応援歌・歓声の音量' : 'Esc(右上の II)で 実況・応援歌・歓声の音量'],
      ['食べる', '店で買った物は席で食べられる'],
    ];
    this.elTips.innerHTML = `<div class="hd"><b>観戦のしかた</b><button type="button" class="x">わかった</button></div>${rows.map(([a, b]) => `<div class="r"><em>${a}</em><span>${b}</span></div>`).join('')}`;
    this.elTips.querySelector('.x').addEventListener('click', (e) => { e.stopPropagation(); this.hideTips(); });
    this.elTips.classList.remove('hide'); this.tipsOn = true; this.tipsUntil = performance.now() + 15000;
    lsSet('r4walk.mk.watchTips', 1);
  }
  hideTips() { this.tipsOn = false; this.elTips.classList.add('hide'); }

  // ---------------------------------------------------------------- やってみようの一覧(章ごと。押すとその目標の道案内)と、ごほうび
  openList(tab) {
    if (!this.kind || this.listOn) return;
    const H = this.h; if (window.__app && window.__app.overlay) return;
    this.listTab = tab || this.listTab || 'goals';
    this.drawList();
    this.elList.classList.remove('hide'); this.listOn = true;
    this.fitTitles();
    H.setOverlay(true); H.releasePointer();
  }
  drawList() {
    const H = this.h, L = this.goals(), cur = this.tut ? null : this.current();
    const esc = (t) => String(t || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const vis = L.filter((g) => g.need());
    const done = vis.filter((g) => this.isDone(g)).length;
    const fp = H.fp(), money = !(fp && fp.noPrice);
    const chip = (rw) => { const a = []; if (rw.yen && money) a.push(`<em class="y">+${rw.yen.toLocaleString()}</em>`); if (rw.badge && BADGES[rw.badge]) a.push(`<em class="b">称号</em>`); if (rw.goods && ITEMS[rw.goods]) a.push(`<em class="g">${esc(ITEMS[rw.goods].name)}</em>`); if (rw.seat) a.push('<em class="s">観戦の席</em>'); return a.join(''); };
    const row = (g) => { const ok = this.isDone(g), now = cur && cur.id === g.id; return `<button type="button" class="it${ok ? ' ok' : ''}${now ? ' now' : ''}" data-id="${g.id}"><i>${ok ? '✓' : now ? '▶' : ''}</i><span><b>${esc(g.h)}</b><small>${esc(g.sub ? g.sub() || g.s : g.s)}</small></span><u>${chip(g.reward)}</u></button>`; };
    let body = '';
    if (this.listTab === 'goals') {
      body += `<div class="tu">${this.tut ? `はじめの案内の途中です(${this.tut.i + 1}/${this.tut.steps.length})。押した目標から始めると、はじめの案内はとばします。` : 'やらなくても大丈夫。気になった物を押すと、そこまで道案内します。'}</div>`;
      for (const c of CHAPTERS) {
        const gs = vis.filter((g) => g.ch === c.id); if (!gs.length) continue;
        const n = gs.filter((g) => this.isDone(g)).length;
        body += `<div class="ch"><b>${esc(c.name)}</b><small>${esc(c.desc)}</small><span>${n} / ${gs.length}</span></div>` + gs.map(row).join('');
      }
    } else {
      const title = this.rw.title && BADGES[this.rw.title] ? BADGES[this.rw.title].name : 'まだ無し';
      body += `<div class="tu">称号: <b class="ttl">${esc(title)}</b> ・ 持っている称号を押すと、それを称号にできます</div><div class="bg">`;
      for (const [id, b] of Object.entries(BADGES)) { const have = !!this.rw.badges[id]; body += `<button type="button" class="bd${have ? '' : ' lock'}${this.rw.title === id ? ' on' : ''}" data-b="${id}"><i style="background:${have ? b.col : '#3a4a66'}">${have ? b.c : '?'}</i><b>${have ? esc(b.name) : '???'}</b><small>${esc(b.how)}</small></button>`; }
      body += '</div><div class="ch"><b>手に持てる物</b><small>目標のごほうび</small></div>';
      const gl = Object.keys(this.rw.goods).filter((id) => ITEMS[id]);
      body += gl.length ? gl.map((id) => `<div class="rr"><span>${esc(ITEMS[id].name)}</span><button type="button" data-hold="${id}">持つ</button></div>`).join('') : '<div class="rr off"><span>まだありません(「応援席に座ってみよう」などで もらえます)</span></div>';
      body += '<div class="ch"><b>観戦の席</b><small>目標のごほうびで行ける席・眺め</small></div>';
      body += Object.entries(SEAT_REWARDS).map(([k, nm]) => this.rw.seats[k] ? `<div class="rr"><span>${esc(nm)}</span><button type="button" data-seat="${k}">行く</button></div>` : `<div class="rr off"><span>${esc(nm)}</span><small>${k === 'front' ? '試合を最後まで見てみよう' : k === 'ofront' ? '10 回 応援してみよう' : '5 つの球場をめぐってみよう'}</small></div>`).join('');
    }
    this.elList.innerHTML = `<div class="box" role="dialog" aria-label="やってみようの一覧"><div class="hd"><h3>やってみよう<small>${esc(H.stadiumName || '')} ・ ${done} / ${vis.length} 達成</small></h3><button type="button" class="x">閉じる</button></div>
<div class="tb"><button type="button" data-tab="goals" class="${this.listTab === 'goals' ? 'on' : ''}">目標</button><button type="button" data-tab="rw" class="${this.listTab === 'rw' ? 'on' : ''}">ごほうび</button></div>
<div class="ls">${body}</div>
<div class="ft"><button type="button" class="tg">${this.on ? '目標と道案内を隠す' : '目標と道案内を出す'}</button><span>${H.IS_TOUCH ? '' : 'G で出す・隠す ・ J で一覧'}</span></div></div>`;
    const q = (s) => this.elList.querySelector(s);
    q('.x').addEventListener('click', () => this.closeList());
    q('.tg').addEventListener('click', () => { this.setOn(!this.on); this.closeList(); });
    if (!this._listBg) { this._listBg = true; this.elList.addEventListener('click', (e) => { if (e.target === this.elList) this.closeList(); }); }
    for (const b of this.elList.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { this.listTab = b.dataset.tab; this.drawList(); });
    for (const b of this.elList.querySelectorAll('.it')) b.addEventListener('click', () => { const g = L.find((x) => x.id === b.dataset.id); if (!g || this.isDone(g)) return; if (this.tut) { lsSet(this.tut.key, 'done'); this.tut = null; this.refreshOpt(); } this.pick = g.id; this._curC = null; this.route = null; this.lastT = null; if (!this.on) this.setOn(true); this.closeList(); });
    for (const b of this.elList.querySelectorAll('[data-b]')) b.addEventListener('click', () => { if (!this.rw.badges[b.dataset.b]) return; this.rw.title = b.dataset.b; lsSet('r4walk.mk.rw', this.rw); this.drawList(); });
    for (const b of this.elList.querySelectorAll('[data-hold]')) b.addEventListener('click', () => { const fp = H.fp(), id = b.dataset.hold; if (fp) { if (fp.stow) fp.stow(true); fp.hold(id); fp.owned[id] = 1; lsSet('r4walk.fp.owned', fp.owned); if (fp.say) fp.say(ITEMS[id].name, fp.useHint ? fp.useHint(id) : ''); } this.closeList(); });
    for (const b of this.elList.querySelectorAll('[data-seat]')) b.addEventListener('click', () => { const fp = H.fp(); this.closeList(); if (fp && fp.goSeat) fp.goSeat(b.dataset.seat); });
    if (this.listOn) this.fitTitles();
    if (!this._fitRs) { this._fitRs = true; window.addEventListener('resize', () => { if (this.listOn) this.fitTitles(); }); }
  }
  // 11/22 目標の題は 1 行に収める(スマホ縦で「う」だけ次の行に落ちた)。はみ出す時だけ字を 0.5px ずつ小さく(11px まで)
  fitTitles() {
    for (const b of this.elList.querySelectorAll('.it b')) {
      b.style.fontSize = '';
      let fs = parseFloat(getComputedStyle(b).fontSize) || 15;
      while (b.scrollWidth > b.clientWidth + 0.5 && fs > 11) { fs -= 0.5; b.style.fontSize = fs + 'px'; }
    }
  }
  closeList() {
    if (!this.listOn) return; this.listOn = false; this.elList.classList.add('hide');
    const H = this.h; H.setOverlay(false); if (!H.IS_TOUCH && H.getMode() === 'walk' && !this.askOn) H.lockPointer();
    this.paint(true);
  }

  // ---------------------------------------------------------------- はじめの案内の後に 1 回だけ「目標と道案内を出しますか?」(答えは覚える)
  askMaybe() {
    if (lsGet('r4walk.mk.ask', 0) || this.askOn || !this.kind) return;
    if (!this.elAsk) {
      const e = document.createElement('div'); e.id = 'mkAsk'; e.className = 'hide';
      e.innerHTML = '<b>目標と道案内を出しますか?</b><div class="bt"><button type="button" data-a="on">出す</button><button type="button" data-a="off">出さない</button></div><small>あとで左上の「目標」や一時停止の画面から変えられます</small>';
      document.body.appendChild(e); this.elAsk = e;
      for (const ev of ['pointerdown', 'mousedown', 'touchstart']) e.addEventListener(ev, (x) => x.stopPropagation(), { passive: true });
      e.addEventListener('click', (x) => { x.stopPropagation(); const b = x.target.closest('button'); if (b) this.askAnswer(b.dataset.a === 'on'); });
    }
    this.elAsk.classList.remove('hide'); this.askOn = true;
    this.h.releasePointer();
  }
  askAnswer(on) {
    lsSet('r4walk.mk.ask', on ? 'on' : 'off'); this.setOn(on); this.askHide();
    if (!this.h.IS_TOUCH && this.h.getMode() === 'walk' && !this.listOn) this.h.lockPointer();
  }
  askHide() { if (this.elAsk) this.elAsk.classList.add('hide'); this.askOn = false; }
}

// 見た目(UI v5 の紺の地と、11/21 の派手な演出の金色に合わせる)
{
  const st = document.createElement('style');
  st.textContent = `
#mkCard{position:fixed;left:max(10px,env(safe-area-inset-left));top:10px;z-index:7;display:flex;align-items:flex-start;gap:6px;max-width:min(330px,62vw);pointer-events:none;font-family:var(--v5-head,"Meiryo",sans-serif)}
#mkCard.hide{display:none}
#mkCard .mkT{pointer-events:auto;flex:0 0 auto;min-width:46px;min-height:34px;padding:0 9px;border-radius:12px;border:2px solid #ffd65a;background:linear-gradient(180deg,#ffe58a,#f2b52c);color:#3a2300;font:inherit;font-weight:900;font-size:13px;cursor:pointer;box-shadow:0 2px 0 rgba(0,0,0,.35);touch-action:manipulation}
#mkCard .mkB{pointer-events:auto;position:relative;min-width:0;padding:5px 10px 6px;border-radius:12px;background:rgba(6,24,58,.78);border:2px solid rgba(255,206,74,.9);box-shadow:0 2px 0 rgba(0,0,0,.3),0 0 14px rgba(255,190,60,.25);color:#fff;cursor:pointer;line-height:1.25}
#mkCard .mkK{display:block;font-size:11px;font-weight:800;color:#ffd65a;letter-spacing:.04em}
#mkCard .mkH{display:block;font-size:15px;font-weight:900;text-shadow:0 1px 0 rgba(0,0,0,.5)}
#mkCard .mkS{display:block;font-size:12px;font-weight:700;opacity:.92}
#mkCard .mkS:empty{display:none}
#mkCard .mkW{position:absolute;left:8px;top:calc(100% + 6px);white-space:nowrap;font-style:normal;font-weight:900;font-size:14px;color:#3a2300;background:linear-gradient(180deg,#fff2b0,#ffc93a);border-radius:10px;padding:2px 10px;opacity:0;pointer-events:none;box-shadow:0 2px 8px rgba(255,170,30,.6)}
#mkCard .mkW.on{animation:mkWin 3s ease-out}
@keyframes mkWin{0%{opacity:0;transform:translateY(-6px) scale(.6)}12%{opacity:1;transform:translateY(2px) scale(1.12)}22%{transform:translateY(0) scale(1)}80%{opacity:1}100%{opacity:0;transform:translateY(6px)}}
#mkCard .mkSkip{pointer-events:auto;display:none;flex:0 0 auto;min-height:30px;padding:0 8px;border-radius:10px;border:2px solid rgba(255,255,255,.7);background:rgba(6,24,58,.7);color:#fff;font:inherit;font-weight:800;font-size:12px;cursor:pointer}
#mkCard.tut .mkSkip{display:block}
#mkCard.off .mkB,#mkCard.off .mkSkip{display:none}
#mkCard.off .mkT{background:rgba(6,24,58,.72);color:#ffd65a;opacity:.85}
#mkPin{position:fixed;left:0;top:0;z-index:6;pointer-events:none;width:0;height:0;font-family:var(--v5-head,"Meiryo",sans-serif)}
#mkPin.hide{display:none}
#mkPin i{position:absolute;left:-13px;top:-30px;width:26px;height:26px;background:linear-gradient(180deg,#fff0a0,#ffbf2a);clip-path:polygon(50% 100%,0 30%,22% 0,50% 22%,78% 0,100% 30%);filter:drop-shadow(0 2px 0 rgba(0,0,0,.4))}
#mkPin.edge i{top:-13px;clip-path:polygon(50% 0,100% 62%,66% 62%,66% 100%,34% 100%,34% 62%,0 62%)}
#mkPin span{position:absolute;left:0;top:2px;transform:translateX(-50%);white-space:nowrap;font-weight:900;font-size:12px;color:#fff;background:rgba(6,24,58,.75);border:1.5px solid #ffd65a;border-radius:8px;padding:0 6px}
#mkPin.edge span{top:16px}
#mkTips{position:fixed;left:auto;right:max(12px,env(safe-area-inset-right));top:214px;transform:none;z-index:8;width:min(400px,88vw);padding:8px 12px 10px;border-radius:14px;background:rgba(6,24,58,.86);border:2px solid #ffd65a;color:#fff;font-family:var(--v5-head,"Meiryo",sans-serif);box-shadow:0 6px 20px rgba(0,0,0,.4);animation:mkIn .35s ease-out}
#mkTips.hide{display:none}
#mkTips .hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
#mkTips .hd b{font-size:16px;color:#ffd65a}
#mkTips .x{min-height:34px;padding:0 12px;border-radius:10px;border:2px solid #fff;background:linear-gradient(180deg,#ffe58a,#f2b52c);color:#3a2300;font:inherit;font-weight:900;cursor:pointer}
#mkTips .r{display:flex;gap:8px;font-size:13px;font-weight:700;line-height:1.35;padding:2px 0}
#mkTips .r em{flex:0 0 3.6em;font-style:normal;font-weight:900;color:#ffd65a}
@keyframes mkIn{from{opacity:0;margin-top:8px}to{opacity:1;margin-top:0}}
@media (max-width:640px),(pointer:coarse){#mkTips{right:auto;left:50%;top:auto;bottom:calc(330px + env(safe-area-inset-bottom));transform:translateX(-50%)}}
@media (max-height:500px) and (pointer:coarse){#mkTips{bottom:auto;top:12px;width:min(380px,48vw)}}
#mkList{position:fixed;inset:0;z-index:31;display:flex;align-items:center;justify-content:center;background:rgba(2,12,35,.55);padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));font-family:var(--v5-head,"Meiryo",sans-serif)}
#mkList.hide{display:none}
#mkList .box{width:min(520px,100%);max-height:100%;display:flex;flex-direction:column;background:rgba(6,24,58,.96);border:3px solid #ffd65a;border-radius:18px;color:#fff;overflow:hidden;box-shadow:0 12px 30px rgba(0,0,0,.45)}
#mkList .hd{display:flex;align-items:center;gap:8px;padding:10px 10px 6px 14px}
#mkList h3{flex:1;margin:0;font-size:19px;font-weight:900;color:#ffd65a}
#mkList h3 small{display:block;font-size:12px;color:#fff;opacity:.85}
#mkList button{font:inherit;cursor:pointer}
#mkList .x{min-height:44px;padding:0 14px;border-radius:12px;border:2px solid #fff;background:rgba(1,82,174,.8);color:#fff;font-weight:900}
#mkList .ls{overflow-y:auto;padding:2px 10px 8px;display:flex;flex-direction:column;gap:6px}
#mkList .tu{font-size:12px;font-weight:700;opacity:.85;padding:2px 4px;text-wrap:pretty}
#mkList .it{display:flex;align-items:center;gap:10px;width:100%;text-align:left;min-height:48px;padding:6px 10px;border-radius:12px;border:2px solid rgba(209,238,253,.35);background:rgba(1,60,140,.45);color:#fff}
#mkList .it i{flex:0 0 26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:900;border:2px solid rgba(255,255,255,.6)}
#mkList .it>span{flex:1 1 auto;min-width:0}
#mkList .it b{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#mkList .it small{display:block;font-size:12px;opacity:.8;text-wrap:pretty}
#mkList .it.now{border-color:#ffd65a;background:rgba(120,80,0,.45)}
#mkList .it.now i{background:#ffd65a;color:#3a2300;border-color:#fff}
#mkList .it.ok{opacity:.6}
#mkList .it.ok i{background:#3ddc84;color:#06264a;border-color:#fff}
#mkList .ft{display:flex;align-items:center;gap:10px;padding:6px 12px 12px;font-size:12px;opacity:.95}
#mkList .tg{min-height:44px;padding:0 14px;border-radius:12px;border:2px solid #fff;background:linear-gradient(180deg,#ffe58a,#f2b52c);color:#3a2300;font-weight:900}
@media (max-width:640px),(pointer:coarse){#mkCard{max-width:min(300px,70vw)}#mkCard .mkH{font-size:14px}#mkCard .mkS{font-size:11.5px}#mkCard .mkT{min-height:32px;font-size:12px}}
body.photo #mkCard,body.photo #mkPin,body.photo #mkTips{display:none!important}
#mkCard .mkW b{display:block;font-weight:900}
#mkCard .mkW span{display:block;font-size:12px;font-weight:800;color:#5a3a00}
#mkList .tb{display:flex;gap:6px;padding:0 12px 6px}
#mkList .tb button{flex:1;min-height:40px;border-radius:12px;border:2px solid rgba(255,214,90,.6);background:rgba(1,60,140,.45);color:#fff;font-weight:900}
#mkList .tb button.on{background:linear-gradient(180deg,#ffe58a,#f2b52c);color:#3a2300;border-color:#fff}
#mkList .ch{display:flex;align-items:baseline;gap:8px;margin:8px 2px 0;padding:4px 4px 2px;border-bottom:2px solid rgba(255,214,90,.5)}
#mkList .ch b{font-size:15px;color:#ffd65a}
#mkList .ch small{flex:1;font-size:11px;opacity:.8}
#mkList .ch span{font-size:12px;font-weight:900}
#mkList .it u{flex:0 1 auto;max-width:42%;margin-left:auto;display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:3px;text-decoration:none}
#mkList .it u em{font-style:normal;font-size:11px;font-weight:900;border-radius:8px;padding:1px 6px;white-space:nowrap}
#mkList .it u em.y{background:#ffd65a;color:#3a2300}
#mkList .it u em.b{background:#e0503a;color:#fff}
#mkList .it u em.g{background:#2fa860;color:#fff}
#mkList .it u em.s{background:#2f8fe0;color:#fff}
#mkList .ttl{color:#ffd65a}
#mkList .bg{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px;padding:4px 0}
#mkList .bd{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;border-radius:12px;border:2px solid rgba(209,238,253,.35);background:rgba(1,60,140,.45);color:#fff;text-align:center}
#mkList .bd i{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:900;font-size:20px;color:#fff;border:3px solid #fff;box-shadow:0 2px 0 rgba(0,0,0,.35)}
#mkList .bd b{font-size:12px}
#mkList .bd small{font-size:10px;opacity:.75}
#mkList .bd.lock{opacity:.55}
#mkList .bd.on{border-color:#ffd65a;background:rgba(120,80,0,.5)}
#mkList .rr{display:flex;align-items:center;gap:8px;min-height:40px;padding:4px 8px;border-radius:10px;background:rgba(1,60,140,.35);margin-top:4px;font-size:13px;font-weight:700}
#mkList .rr span{flex:1}
#mkList .rr small{font-size:11px;opacity:.75}
#mkList .rr.off{opacity:.6}
@media (max-width:640px),(pointer:coarse){#mkList .it{gap:8px;padding:6px 8px}#mkList .it b{font-size:14px}#mkList .it u{max-width:32%}#mkList .it u em{font-size:10px;padding:1px 5px}}
#mkList .rr button{min-height:36px;padding:0 14px;border-radius:10px;border:2px solid #fff;background:linear-gradient(180deg,#ffe58a,#f2b52c);color:#3a2300;font-weight:900}
#mkAsk{position:fixed;left:50%;top:32%;transform:translateX(-50%);z-index:30;width:min(360px,86vw);box-sizing:border-box;padding:12px 14px 10px;border-radius:16px;background:rgba(6,24,58,.94);border:3px solid #ffd65a;color:#fff;text-align:center;font-family:var(--v5-head,"Meiryo",sans-serif);box-shadow:0 8px 24px rgba(0,0,0,.45);animation:mkIn .3s ease-out}
#mkAsk.hide{display:none}
#mkAsk b{display:block;font-size:17px;font-weight:900}
#mkAsk .bt{display:flex;gap:10px;justify-content:center;margin:10px 0 6px}
#mkAsk button{flex:1;min-height:46px;border-radius:12px;border:2px solid #fff;font:inherit;font-weight:900;font-size:16px;cursor:pointer}
#mkAsk button[data-a="on"]{background:linear-gradient(180deg,#ffe58a,#f2b52c);color:#3a2300}
#mkAsk button[data-a="off"]{background:rgba(1,82,174,.8);color:#fff}
#mkAsk small{display:block;font-size:11.5px;opacity:.85}
body.photo #mkAsk{display:none!important}
`;
  document.head.appendChild(st);
}
