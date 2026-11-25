// 守備のガイドモードと守備の練習(チュートリアル) 11/21 夜 持ち主
//   「守備モードは落下地点有り無しをやっぱり作ってください ガイドモードありなしを設定して 前へ!後ろへ!横へ!みたいなのを押して
//    どこに投げるかを全部指示するようにしてください …あくまでもプレイヤーが選べるようにして」
// ガイド有り: 打った瞬間に落下点(ゴロは捕る所)の印・動く向きの矢印と短い言葉・捕る時の合図・投げる先(その場面の正しい塁)と投げる先の野手の印。
// ガイド無し: 何も出さない(defense.js の初めの 8 本の助け HELP_K はそのまま)。
// 設定は r4walk.guide('on' / 'off'、初めは 'on')。試合の設定と一時停止の画面に 1 つずつ(この中で作って差し込む)。
// 練習は守備を初めて始めた時に 1 回(r4walk.defTut)。動く → フライ → ゴロ → 投げる、ノックの打球で 1 本ずつ。いつでも「とばす」。
// 11/22 落下点の印は地面の輪だけ(光の柱をやめた)と「あと ○m」。練習の後かガイド有りで 10 本守った後に 1 回「ガイドはまだ必要ですか?」
import * as THREE from 'three';
import { samplePath, pathDuration } from './ballsim.js';
import * as R from './rules.js';
import { mkEv } from './mokuhyo_data.js';   // 11/22 目標の出来事(守備の練習)

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const BASEP = R.BASE_XZ.map((a) => V(a[0], 0, a[1]));
const BTN = { 1: '一塁', 2: '二塁', 3: '三塁', 0: '本塁', 5: '中継' };
const KEYN = { 1: '1', 2: '2', 3: '3', 0: '4', 5: '5' };
export const THROW_WORD = { 1: '一塁へ!', 2: '二塁へ!', 3: '三塁へ!', 0: 'バックホーム!', 5: '中継へ!' };
const AIR = new Set(['fly', 'pop', 'liner', 'fence', 'foulfly']);
const GOLD = 0xffd84a, ORANGE = 0xff7a2a, ONSPOT = 0xfff6c8;
const DEG = 180 / Math.PI;

const CSS = `
#gd{position:fixed;left:50%;bottom:118px;z-index:13;pointer-events:none;text-align:center;transform:translateX(-50%);opacity:0;transition:opacity .12s;white-space:nowrap}
#gd.show{opacity:1}
#gd .ga{display:block;margin:0 auto 2px;width:62px;height:62px;filter:drop-shadow(0 3px 0 rgba(0,0,0,.35)) drop-shadow(0 0 10px rgba(255,190,40,.8));transition:transform .08s linear}
#gd .ga.hide{visibility:hidden}
#gd b{display:block;font-family:var(--v4-body,sans-serif);font-weight:900;font-style:italic;font-size:40px;line-height:1.05;color:#fff;-webkit-text-stroke:7px #5a4300;paint-order:stroke fill;text-shadow:0 0 18px rgba(255,190,40,.9),0 4px 0 rgba(0,0,0,.35)}
#gd b:empty{display:none}
#gd.fo span{margin-top:0;font-size:15px}
#gd b.now{color:#ffd84a;-webkit-text-stroke-color:#3a1a05;animation:gdNow .35s ease-in-out infinite alternate}
#gd span{display:inline-block;margin-top:6px;font:800 16px/1.2 var(--v4-body,sans-serif);color:#fff;background:rgba(40,26,0,.72);border:2px solid #ffd84a;border-radius:10px;padding:5px 11px}
#gd span:empty{display:none}
#gd kbd{font:inherit;background:#ffd84a;color:#3a1a05;border-radius:5px;padding:0 6px;margin:0 2px}
@keyframes gdNow{from{transform:scale(1)}to{transform:scale(1.12)}}
body.touch #gd{bottom:auto;top:58%}
body.gd3p #gd{left:25%;bottom:auto;top:44%}
body.touch.gd3p #gd{left:50%;top:26%;bottom:auto}
body.touch #gd b{font-size:36px}
body.touch #gd .ga{width:56px;height:56px}
@media (orientation:landscape) and (max-height:500px){ body.touch #gd{top:auto;bottom:16px} body.touch #gd b{font-size:30px} body.touch #gd .ga{width:44px;height:44px} }
body.photo #gd,body.photo #gdTut{display:none!important}
#gdAsk{position:fixed;left:50%;top:calc(max(10px,env(safe-area-inset-top)) + 84px);transform:translateX(-50%);z-index:17;width:min(340px,calc(100vw - 130px));min-width:220px;box-sizing:border-box;display:none;
  background:rgba(40,26,0,.9);border:3px solid #ffd84a;border-radius:16px;padding:10px 12px 8px;color:#fff;text-align:center;font-family:var(--v4-body,sans-serif);box-shadow:0 0 22px rgba(255,190,40,.45)}
#gdAsk.show{display:block}
#gdAsk b{display:block;font-size:17px;font-weight:900;color:#ffd84a}
#gdAsk .bt{display:flex;gap:8px;margin:8px 0 5px}
#gdAsk button{flex:1;min-height:42px;border-radius:999px;border:0;font:800 15px/1 var(--v4-body,sans-serif);cursor:pointer;pointer-events:auto}
#gdAsk button[data-a="on"]{background:#ffd84a;color:#3a1a05}
#gdAsk button[data-a="off"]{background:rgba(255,255,255,.16);color:#fff;border:2px solid #fff}
#gdAsk small{display:block;font-size:11.5px;font-weight:700;opacity:.85}
body.touch #gdAsk{width:min(340px,calc(100vw - 40px));top:calc(env(safe-area-inset-top) + 215px)}
@media (orientation:landscape) and (max-height:500px){ body.touch #gdAsk{top:calc(env(safe-area-inset-top) + 8px);width:min(320px,46vw)} }
body.photo #gdAsk{display:none!important}
#gdTut{position:fixed;left:50%;top:max(10px,env(safe-area-inset-top));transform:translateX(-50%);z-index:16;width:min(560px,calc(100vw - 150px));min-width:220px;box-sizing:border-box;
  background:rgba(40,26,0,.86);border:3px solid #ffd84a;border-radius:16px;padding:10px 14px 12px;color:#fff;font-family:var(--v4-body,sans-serif);box-shadow:0 0 22px rgba(255,190,40,.45);display:none}
#gdTut.show{display:block}
#gdTut .tn{display:flex;gap:6px;align-items:center;margin-bottom:4px}
#gdTut .tn i{flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.25)}
#gdTut .tn i.on{background:#ffd84a}
#gdTut .tn i.ok{background:#7be08a}
#gdTut h3{margin:2px 0 4px;font-size:21px;font-weight:900;color:#ffd84a}
#gdTut p{margin:0;font-size:15px;font-weight:700;line-height:1.45;white-space:normal}
#gdTut .ok{color:#7be08a}
#gdTut button{position:absolute;right:10px;top:10px;pointer-events:auto;font:800 14px/1 var(--v4-body,sans-serif);color:#3a1a05;background:#ffd84a;border:0;border-radius:999px;padding:8px 13px;cursor:pointer}
#gdTut.done button{display:none}
body.touch #gdTut{width:calc(100vw - 112px);padding:8px 12px 10px}
body.touch #gdTut h3{font-size:18px;padding-right:62px}
body.touch #gdTut p{font-size:14px}
.gdRow .gdTutBtn{margin-top:8px;font:800 14px/1 var(--v4-body,sans-serif);color:#3a1a05;background:#ffd84a;border:0;border-radius:999px;padding:9px 16px;cursor:pointer}
`;

const ARROW = '<svg class="ga" viewBox="0 0 64 64"><path d="M32 4 L58 34 H42 V60 H22 V34 H6 Z" fill="#ffd84a" stroke="#5a4300" stroke-width="4" stroke-linejoin="round"/></svg>';

export class Guide {
  constructor(d) {
    this.d = d; this.ctx = d.ctx;
    this.st = null; this.tut = null; this.forceTut = false;
    this._tg = null; this._tgT = -1; this._tgPl = null;
    // 落下点・捕る所の印: 地面の輪だけ(11/22 持ち主「柱みたいなのは要らない」)。輪を大きく太く、濃い縁どりと、外へ広がる波の輪で目立たせる。色で近さ
    const S = this.ctx.scene;
    const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, toneMapped: false });
    const m = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.42, 56), mat(GOLD, 0.97)); ring.rotation.x = -Math.PI / 2;
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.95, 48), mat(GOLD, 0.32)); inner.rotation.x = -Math.PI / 2;
    const edge = new THREE.Mesh(new THREE.RingGeometry(1.42, 1.58, 56), mat(0x3a1a05, 0.85)); edge.rotation.x = -Math.PI / 2;
    const inEdge = new THREE.Mesh(new THREE.RingGeometry(0.86, 0.95, 56), mat(0x3a1a05, 0.6)); inEdge.rotation.x = -Math.PI / 2;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), mat(0xffffff, 0.95)); dot.rotation.x = -Math.PI / 2; dot.position.y = 0.004;   // 真ん中の点(ここで止まる)
    const wave = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.46, 56), mat(GOLD, 0.6)); wave.rotation.x = -Math.PI / 2; wave.position.y = -0.002;
    m.add(ring, inner, edge, inEdge, dot, wave); m.visible = false; S.add(m);
    this.mark = m; this.mk = { ring, inner, edge, wave, dot };
    // 投げる先の野手: 足もとの金の輪と、頭の上の下向きの三角
    const r2 = new THREE.Group();
    const rr = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.15, 40), mat(GOLD, 0.9)); rr.rotation.x = -Math.PI / 2;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 16), mat(GOLD, 0.95)); cone.rotation.x = Math.PI; cone.position.y = 2.75;
    r2.add(rr, cone); r2.visible = false; S.add(r2);
    this.recv = r2; this.recvCone = cone;
    // 練習の動く先の印(同じ形を使い回さず、別に 1 つ)
    const sp = new THREE.Group();
    const sr = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.1, 40), mat(GOLD, 0.95)); sr.rotation.x = -Math.PI / 2;
    const se = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.22, 40), mat(0x3a1a05, 0.8)); se.rotation.x = -Math.PI / 2;
    sp.add(sr, se); sp.visible = false; S.add(sp); this.spot = sp;   // 柱は付けない(11/22)
    this.t = 0;
    // 「今だ!」を出す間合い(球がいちばん近づくまでの秒)。人が見てから押すまで約 0.2 秒かかる分、早めに出す(試験 tools/_guide_cue_1121.py で合わせる)
    this.cfg = { jumpLo: 0.1, jumpHi: 0.34, diveLo: 0.08, diveHi: 0.3 };
    this.initDom();
  }

  // ------------------------------------------------ 設定
  value() { const v = this.ctx.load('r4walk.guide', 'on'); return v === 'off' ? 'off' : 'on'; }
  setValue(v) {
    this.ctx.store('r4walk.guide', v === 'off' ? 'off' : 'on');
    const ui = this.ctx.ui; if (ui && ui.sel) { ui.sel.guide = this.value(); }
    this.syncButtons();
    if (this.value() === 'off') this.hide();
  }
  on() { return !!(this.d.active && !this.d.watching && (this.value() === 'on' || this.tut)); }   // 観戦の裏の守備には出さない
  syncButtons() { const v = this.value(), f = this.fallValue(); document.querySelectorAll('.gdSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === v)); document.querySelectorAll('.fallSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === f)); }
  // 11/22 持ち主「落下地点のオンオフが出来るようにしてください」: 落下点の輪と「あと ○m」だけを、ガイドとは別に出す/出さない(r4walk.fallMark 'on'/'off'、初めは 'on')。
  // ガイド有りで落下点だけ消す・ガイド無しで落下点だけ出す、の両方ができる。練習の間は出す
  fallValue() { const v = this.ctx.load('r4walk.fallMark', 'on'); return v === 'off' ? 'off' : 'on'; }
  setFall(v) { this.ctx.store('r4walk.fallMark', v === 'off' ? 'off' : 'on'); this.syncButtons(); if (this.fallValue() === 'off' && this.mark && !this.tut) this.mark.visible = false; }
  fallOn() { return !!(this.d.active && !this.d.watching && (this.fallValue() === 'on' || this.tut)); }

  initDom() {
    if (!document.getElementById('gdCss')) { const st = document.createElement('style'); st.id = 'gdCss'; st.textContent = CSS; document.head.appendChild(st); }
    this.el = document.createElement('div'); this.el.id = 'gd'; this.el.setAttribute('aria-live', 'polite');
    this.el.innerHTML = ARROW + '<b></b><span></span>';
    document.body.appendChild(this.el);
    this.elA = this.el.querySelector('.ga'); this.elW = this.el.querySelector('b'); this.elS = this.el.querySelector('span');
    this.card = document.createElement('div'); this.card.id = 'gdTut';
    this.card.innerHTML = '<div class="tn"><i></i><i></i><i></i><i></i></div><h3></h3><p></p><button type="button">とばす</button>';
    document.body.appendChild(this.card);
    const skip = (e) => { e.preventDefault(); e.stopPropagation(); this.endTut(true); };
    this.card.querySelector('button').addEventListener('click', skip);
    this.card.querySelector('button').addEventListener('touchstart', skip, { passive: false });
    // 設定の行は UI ができてから差し込む
    const tryRows = () => { if (this.ctx.ui && document.getElementById('setScreen')) this.injectRows(); else setTimeout(tryRows, 200); };
    tryRows();
  }
  injectRows() {
    if (this._rows) return; this._rows = true;
    const ui = this.ctx.ui, $ = (id) => document.getElementById(id);
    if (ui.sel) ui.sel.guide = this.value();
    const row = (id, tutId) => {
      const o = document.createElement('div'); o.className = 'opt gdRow'; o.id = id;
      o.innerHTML = '<div class="lab"><i class="li li-eye"></i>ガイド</div><div class="seg gdSeg"><button data-v="on" type="button">有り</button><button data-v="off" type="button">無し</button></div>'
        + `<button class="gdTutBtn" id="${tutId}" type="button">守備の練習をする</button>`;
      o.querySelectorAll('.gdSeg button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.setValue(b.dataset.v); }));
      return o;
    };
    // 試合の設定(視点の行の下)
    const sv = $('optView');
    if (sv) {
      const o = row('optGuide', 'gdTutSet'); sv.after(o);
      o.querySelector('.gdTutBtn').addEventListener('click', (e) => { e.stopPropagation(); this.forceTut = true; ui.go(); });
      // 11/22 落下点の行(ガイドの行の下)。一時停止では「画面に出すもの」(js/hudprefs.js)の中に置く
      const f = document.createElement('div'); f.className = 'opt gdRow'; f.id = 'optFall';
      f.innerHTML = '<div class="lab"><i class="li li-eye"></i>落下点</div><div class="seg fallSeg"><button data-v="on" type="button">出す</button><button data-v="off" type="button">出さない</button></div>';
      f.querySelectorAll('.fallSeg button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.setFall(b.dataset.v); }));
      o.after(f);
    }
    // 一時停止(視点の行の下)。守備の間だけ
    const pv = document.querySelector('#panel #views');
    if (pv) {
      const o = row('pzGuide', 'gdTutPz'); pv.closest('.opt').after(o);
      o.querySelector('.gdTutBtn').addEventListener('click', (e) => { e.stopPropagation(); this.forceTut = true; ui.hideAll(); ui.go(); });
    }
    // ui の画面の出し入れに合わせて、守備の時だけ見せる
    const rf = ui.refresh.bind(ui);
    ui.refresh = (...a) => {
      ui.sel.guide = this.value();
      const r = rf(...a);
      $('optGuide')?.classList.toggle('hide', ui.sel.mode !== 'game' && ui.sel.mode !== 'knock');
      $('optFall')?.classList.toggle('hide', ui.sel.mode !== 'game' && ui.sel.mode !== 'knock');
      $('pzGuide')?.classList.toggle('hide', this.ctx.mode !== 'defense');
      this.syncButtons();
      return r;
    };
    const pz = ui.pause.bind(ui);
    ui.pause = (...a) => { const r = pz(...a); $('pzGuide')?.classList.toggle('hide', this.ctx.mode !== 'defense'); this.syncButtons(); return r; };
    ui.refresh();
  }

  // ------------------------------------------------ 練習(チュートリアル)
  // defense.begin の初めに呼ぶ。練習をするなら sel を練習用(ノック)に書き換え、終わった後に始める設定を返す
  tutGate(sel) {
    const want = (sel.mode === 'game' || sel.mode === 'knock') && !sel.noTut && !sel.keepDiff && sel.pos !== 'C' && sel.pos !== 'P'   // 観戦(watch.js)が裏で使う守備では出さない
      && (this.forceTut || (!this.ctx.load('r4walk.defTut', false) && !this.ctx.params.has('shot')) || this.ctx.params.has('tut'));
    this.forceTut = false;
    this.tut = null;
    if (!want) return null;
    const after = { ...sel, noTut: true };
    sel.mode = 'knock'; sel.count = 999;
    this.tut = { i: 0, okT: null, after, n: 0, ok: [false, false, false, false], spot: null, c0: 0 };
    return after;
  }
  tutSteps() {
    const T = this.ctx.IS_TOUCH, of = this.d.my && ['LF', 'CF', 'RF'].includes(this.d.my);
    return [
      { h: '1/4 動いてみよう', p: T ? '左下のスティックで、金色の印まで走ろう。' : 'W A S D で、金色の印まで走ろう。' },
      { h: '2/4 フライを捕ろう', p: T ? '打球が上がったら金色の印へ。着いたら止まって「オーライ」。' : '打球が上がったら金色の印へ。着いたら止まって E(オーライ)。' },
      { h: '3/4 ゴロを捕ろう', p: '転がってくる球の前へ。印の所で止まって構えれば捕れる。' },
      { h: '4/4 投げよう', p: (of ? '捕ったら、光っている野手へ投げる。' : '捕ったら一塁へ投げる。') + (T ? '下のボタンか、光る野手をタップ。' : '光る野手をクリックか、数字キー。') },
    ];
  }
  // defense.nextKnock の初めに呼ぶ。練習の間は打球をここで決める(true を返したら nextKnock は何もしない)
  tutBall() {
    const tu = this.tut, d = this.d; if (!tu) return false;
    if (tu.okT != null) return true;   // 成功の札を見せている間は次を出さない
    if (tu.i === 0) {
      if (!tu.spot) {
        const h = d.homeOf(d.my), out = V(h.x, 0, h.z).normalize(), side = V(-out.z, 0, out.x);
        tu.spot = h.clone().addScaledVector(side, 5).addScaledVector(out, -2); tu.spot.y = 0;
      }
      return true;
    }
    const g = d.g; g.bases = [false, false, false]; g.outs = 0; g.half = 'top'; g.balls = g.strikes = 0; g.hand = 'R';
    d.layRunners(); d.applyAlignment();
    const of = ['LF', 'CF', 'RF'].includes(d.my);
    const kb = tu.i === 1 ? d.varietyBall('fly', 'step') : tu.i === 2 ? d.varietyBall('grounder', of ? 'charge' : 'easy') : d.varietyBall(of ? 'fly' : 'grounder', 'easy');
    d.startPlay({ fielder: d.my, by: 'knock', star: 1, kb: kb.label, kind: kb.kind, make: kb.make, L: kb.L, type: kb.type, sitT: 0.3, randEV: true });
    tu.c0 = d.stats.caught; tu.pl = d.play;
    return true;
  }
  tutTick(dt) {
    const tu = this.tut, d = this.d; if (!tu) return;
    const steps = this.tutSteps();
    const P = this.ctx.player.pos;
    if (tu.okT != null) {
      tu.okT -= dt;
      if (tu.okT <= 0) {
        tu.okT = null; tu.i++;
        if (tu.i >= 4) { this.endTut(false); return; }
        d.wait = 0.4;
      }
    } else if (tu.i === 0 && tu.spot) {
      this.spot.visible = true;
      this.spot.position.set(tu.spot.x, d.gy(tu.spot) + 0.03, tu.spot.z);
      this.spot.scale.setScalar(1 + 0.08 * Math.sin(this.t * 6));
      if (Math.hypot(P.x - tu.spot.x, P.z - tu.spot.z) < 1.0) this.tutOk();
    } else if (tu.i >= 1 && tu.pl) {
      const pl = tu.pl;
      if (tu.i <= 2 && pl.holder === 'me' && !pl.missed) this.tutOk();
      else if (tu.i === 3 && pl.lastThrow && pl.thrown && pl.lastThrow.correct) this.tutOk();
      else if (tu.i === 3 && pl.lastThrow && pl.lastThrow.self && pl.lastThrow.correct) this.tutOk();
    }
    if (tu.i !== 0 || tu.okT != null) this.spot.visible = false;
    // 札(段が進んだ後の段で書く)
    const ok = tu.okT != null, s = steps[Math.min(tu.i, 3)];
    const key = `${tu.i}|${ok}|${this.ctx.IS_TOUCH}`;
    if (key !== this._cardKey) {
      this._cardKey = key;
      this.card.classList.add('show'); this.card.classList.remove('done');
      this.card.querySelectorAll('.tn i').forEach((x, i) => { x.className = i < tu.i || (i === tu.i && ok) ? 'ok' : i === tu.i ? 'on' : ''; });
      this.card.querySelector('h3').textContent = s.h;
      const p = this.card.querySelector('p');
      p.className = ok ? 'ok' : ''; p.textContent = ok ? (tu.i >= 3 ? 'できた! これで練習はおしまい。' : 'できた! 次へ') : s.p;
    }
  }
  tutOk() {
    const tu = this.tut; if (!tu || tu.okT != null) return;
    tu.ok[tu.i] = true; tu.okT = tu.i >= 3 ? 1.6 : 1.1;
    try { this.ctx.sound.play('tick', { gain: 0.35, rate: 1.4 }); } catch (e) { /* 音なし */ }
    if (tu.i === 0) this.spot.visible = false;
  }
  endTut(skipped) {
    const tu = this.tut; if (!tu) return;
    this.ctx.store('r4walk.defTut', true);
    this.tut = null; this.d.tut = null; this._cardKey = null;
    this.card.classList.remove('show'); this.spot.visible = false; this.hide();
    const after = tu.after;
    this.lastTut = { skipped: !!skipped, ok: tu.ok.slice() };
    if (!skipped) mkEv('def_tut');
    this.askPend = true;   // 練習を終えたら(とばしても)、1 回だけ「ガイドはまだ必要ですか?」
    // 守備を選んだ設定で始め直す(練習で動いた体・打球は全部置き直される)
    this.d.stop(true);
    this.d.begin(after);
  }

  // ------------------------------------------------ 「ガイドはまだ必要ですか?」(11/22 持ち主「1回終わったらガイド必要ですか?みたいな感じのを入れて」)
  // 練習を終えた時か、ガイド有りで 10 本(試合を最後まで守ったら 10 本と数える)守った後に 1 回だけ。答えは r4walk.guideAsk に覚えて二度と聞かない。
  // 札は小さく、上の真ん中。プレーの最中には出さない(打球の合間に出す)。止めない
  askTick() {
    const d = this.d, pl = d.play;
    if (this.ctx.load('r4walk.guideAsk', null)) { this.askHide(); return; }
    if (this.value() !== 'on' && !this.tut) { this.askHide(); return; }
    if (pl && pl !== this._cntPl && pl.batted && !this.tut && !d.watching && (d.kind === 'game' || d.kind === 'knock')) {
      this._cntPl = pl; const n = (+this.ctx.load('r4walk.guideN', 0) || 0) + 1; this.ctx.store('r4walk.guideN', n);
    }
    if (!this.askPend && (+this.ctx.load('r4walk.guideN', 0) || 0) >= 10) this.askPend = true;
    if (!this.askPend || this.tut || this.askOn) return;
    const calm = !pl || pl.endT != null || pl.phase === 'pre' || (!pl.batted && !pl.holder);
    if (calm) this.askShow();
  }
  askShow() {
    if (!this.elAsk) {
      const e = document.createElement('div'); e.id = 'gdAsk';
      e.innerHTML = '<b>ガイドはまだ必要ですか?</b><div class="bt"><button type="button" data-a="on">つづける</button><button type="button" data-a="off">なしにする</button></div><small>あとで設定の「ガイド」から戻せます</small>';
      document.body.appendChild(e); this.elAsk = e;
      for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup']) e.addEventListener(ev, (x) => x.stopPropagation(), { passive: true });
      e.addEventListener('click', (x) => { x.stopPropagation(); const b = x.target.closest('button'); if (b) this.askAnswer(b.dataset.a); });
    }
    this.elAsk.classList.add('show'); this.askOn = true;
  }
  askAnswer(v) {
    this.ctx.store('r4walk.guideAsk', v === 'off' ? 'off' : 'on');
    if (v === 'off') this.setValue('off');
    this.askPend = false; this.askHide();
  }
  askHide() { if (this.elAsk) this.elAsk.classList.remove('show'); this.askOn = false; }

  // ------------------------------------------------ 毎こま(defense.update から)
  tick(dt) {
    this.t += dt;
    if (!this.d.active) { this.hide(); this.askHide(); return; }
    if (this.d.watching) this.askHide(); else this.askTick();   // 11/22 観戦の裏の守備では札を出さない(答えていなければ次に守備をした時にまた出す)
    if (this.tut) this.tutTick(dt); else if (this.card.classList.contains('show')) this.card.classList.remove('show');
    if (!this.d.active) return;
    const g = this.on(), f = this.fallOn();
    if ((!g && !f) || this.d.ffw) { this.hide(); return; }
    let st = this.compute();
    if (!g) st = this.fallOnly(st); else if (!f) st = this.noFall(st);   // 11/22 落下点だけ / 落下点なしのガイド
    this.st = st;
    this.render(st);
  }
  // ガイド無しで落下点だけ: 輪だけ(向きの言葉・矢印・投げる先は出さない)
  fallOnly(st) {
    if (!st || !st.mark || !st.target) return null;
    return { target: st.target, dist: st.dist, fly: st.fly, mark: true, state: 'fall', word: '', sub: '', ang: null, now: false };   // 11/22 夜 Discord の感想「あと少し・何メートルはガイドの時だけ」: 落下点だけの時は輪だけ
  }
  // ガイド有りで落下点なし: 輪と「あと少し」を外す(向きの言葉・矢印・合図・投げる先はそのまま)
  noFall(st) {
    if (!st) return st;
    const s = { ...st, mark: false };
    if (typeof s.sub === 'string') s.sub = s.sub.replace(/^(あと少し|あと \d+m)( ・ )?/, '');
    return s;
  }
  hide() {
    this.st = null;
    if (this.mark) this.mark.visible = false;
    if (this.recv) this.recv.visible = false;
    if (this.el) this.el.classList.remove('show');
    if (!this.tut && this.spot) this.spot.visible = false;
  }

  // 投げる先: その場面の正しい塁(defense.correctBase の先頭)。外野から遠い塁(62 m より先)は中継へ
  throwBase(pl) {
    const d = this.d, cb = d.correctBase(pl);
    let b = cb[0];
    const of = ['LF', 'CF', 'RF'].includes(d.my), P = this.ctx.player.pos;
    if (of && b !== 5 && cb.includes(5) && Math.hypot(P.x - BASEP[b].x, P.z - BASEP[b].z) > 62) b = 5;
    if (b === 5 && !of) b = cb.find((x) => x !== 5) ?? 1;
    return b;
  }
  // カメラの向きから見た向き(度。0 = 前、+ = 右)
  relAngle(dx, dz) {
    const cam = this.ctx.camera, v = cam.getWorldDirection(V());
    let fx = v.x, fz = v.z; const fl = Math.hypot(fx, fz);
    if (fl < 1e-3) { const y = this.ctx.player.yaw; fx = -Math.sin(y); fz = -Math.cos(y); } else { fx /= fl; fz /= fl; }
    const fw = dx * fx + dz * fz, rt = dx * -fz + dz * fx;
    return Math.atan2(rt, fw) * DEG;
  }
  dirWord(a) { const b = Math.abs(a); return b <= 40 ? '前へ!' : b >= 140 ? '後ろへ!' : a > 0 ? '右へ!' : '左へ!'; }
  keysFor(a) {
    const r = a / DEG, f = Math.cos(r), s = Math.sin(r), k = [];
    if (f > 0.38) k.push('W'); if (f < -0.38) k.push('S'); if (s > 0.38) k.push('D'); if (s < -0.38) k.push('A');
    return k.map((x) => `<kbd>${x}</kbd>`).join('');
  }
  // 捕る所(ゴロ・転がる球): 走って間に合う一番早い所。間に合わなければ一番遅れの少ない所
  // yHi: 手の届く高さ(跳べば 3.2 m、フェンス際 3.9 m)
  catchSpot(pl, yHi = 2.4) {
    const d = this.d, b = d.ball, P = this.ctx.player.pos, path = b.path, tb = pl.t - b.t0, R0 = d.D.reach * 0.6, vmax = d.fullSpeed();
    let best = null, bestSl = -1e9;
    const dur = pathDuration(path), q = V();
    for (let tt = Math.max(0, tb); tt < dur; tt += 0.05) {
      samplePath(path, tt, q);
      if (q.y > 2.4 && (yHi <= 2.4 || q.y > (yHi > 3.5 && this.fenceGap(q) < 1.4 ? 3.9 : 3.2))) continue;
      const sl = (tt - tb) - d.runTime(Math.max(0, Math.hypot(q.x - P.x, q.z - P.z) - R0), vmax);
      if (sl >= 0) return { p: V(q.x, 0, q.z), t: tt, late: false };
      if (sl > bestSl) { bestSl = sl; best = { p: V(q.x, 0, q.z), t: tt, late: true }; }
    }
    if (best) return best;
    samplePath(path, dur, q); return { p: V(q.x, 0, q.z), t: dur, late: true };
  }
  fenceGap(q) { const a = Math.atan2(q.x, -q.z) * DEG; if (Math.abs(a) > 50) return 99; return this.d.fenceInfo(a).dist - Math.hypot(q.x, q.z); }
  // これからの球で、自分にいちばん近づく時(秒先)と距離。高さの条件 yLo〜yHi の間だけ
  closest(pl, horizon, yLo, yHi) {
    const d = this.d, b = d.ball, P = this.ctx.player.pos, tb = pl.t - b.t0, dur = pathDuration(b.path), q = V();
    let bt = null, bd = 1e9, bp = null;
    for (let tt = tb; tt < Math.min(dur, tb + horizon); tt += 0.02) {
      samplePath(b.path, tt, q);
      if (q.y < yLo + P.y || q.y > yHi + P.y) continue;
      const dd = Math.hypot(q.x - P.x, q.z - P.z);
      if (dd < bd) { bd = dd; bt = tt - tb; bp = q.clone(); }
    }
    return bt == null ? null : { dt: bt, dist: bd, p: bp };
  }

  compute() {
    const d = this.d, pl = d.play, c = this.ctx, P = c.player.pos, T = c.IS_TOUCH;
    // 練習の「動いてみよう」: 印の方へ矢印
    const tu = this.tut;
    if (tu && tu.i === 0 && tu.spot && tu.okT == null && !pl) {
      const dx = tu.spot.x - P.x, dz = tu.spot.z - P.z, dist = Math.hypot(dx, dz);
      if (dist < 1.0) return null;
      const a = this.relAngle(dx, dz);
      return { word: this.dirWord(a), sub: `${dist < 3 ? 'あと少し ・ ' : ''}${T ? 'スティックを矢印の向きへ' : this.keysFor(a)}`, ang: a, dir: [dx / dist, dz / dist], state: 'tut' };
    }
    if (!pl || d.dg || pl.endT != null) return null;
    if (pl.phase === 'pre') return null;
    // 球を持った: 投げる先
    if (pl.holder === 'me') {
      if (pl.releasing) return null;
      const g = d.g;
      if (d.kind === 'game' && g && g.outs + (pl.outs || 0) >= 3) return { word: 'スリーアウト!', sub: '投げなくてよい', state: 'done' };
      if (!pl.choiceOpen) return { word: '起き上がって…', sub: '', state: 'up' };
      const b = this.throwBase(pl), t = d.throwTargets().find((x) => x.base === b);
      const self = b !== 5 && (Math.hypot(P.x - BASEP[b].x, P.z - BASEP[b].z) < (b === 1 && d.my === '1B' ? 7 : 5) || (b === 1 && !!d.selfFirst && d.selfFirst()));   // 11/22 カバーの人より一塁に近い一塁手は自分で踏む
      const word = self ? `${BTN[b]}を踏め!` : THROW_WORD[b];
      const sub = self ? (T ? `「${BTN[b]}」ボタンで踏みに行く` : `キー <kbd>${KEYN[b]}</kbd> で踏みに行く`)
        : (T ? `「${BTN[b]}」ボタンか、光る選手をタップ` : `光る選手をクリック(キー <kbd>${KEYN[b]}</kbd>)`);
      return { word, sub, state: 'throw', throwBase: b, recvK: t && !self ? t.k : null };
    }
    const b = d.ball;
    const mine = !!(b && pl.batted && b.path === pl.batted.path && !pl.thrown && !pl.holder && pl.opt.fielder === d.my);
    if (!mine) {
      const cs = pl.coverSpot;
      if (cs && !pl.coverDone && !pl.holder && pl.t > pl.contactT) {
        const dx = cs.p.x - P.x, dz = cs.p.z - P.z, dist = Math.hypot(dx, dz);
        const nm = cs.base != null && BTN[cs.base] ? `${BTN[cs.base]}の` : '';
        if (dist < 1.2) return { word: 'そのまま!', sub: `${nm}カバーに入った`, state: 'cover' };
        const a = this.relAngle(dx, dz);
        return { word: 'カバーへ!', sub: `${nm}カバー ・ ${this.dirWord(a).replace('!', '')}`, ang: a, dir: [dx / dist, dz / dist], state: 'cover', target: cs.p };
      }
      return null;
    }
    // 自分の打球: 落下点(フライ)か捕る所(ゴロ)
    const tb = pl.t - b.t0;
    const bounced = b.path.events.some((e) => (e.type === 'bounce' || e.type === 'roll' || e.type === 'wall') && e.t <= tb);
    // 11/22 夜 Discord の感想「外した時は出さなくていい」: 捕り損ねた後(抜けた・フライを落とした・横や後ろを通り過ぎた)は案内も輪も出さない
    if (pl.missed || pl.throughK || pl._gMiss) return null;
    if (d.ballPos && pl.p0) {
      const bp = d.ballPos, dB = Math.hypot(bp.x - pl.p0.x, bp.z - pl.p0.z), dM = Math.hypot(P.x - pl.p0.x, P.z - pl.p0.z);
      const flyDrop = AIR.has(pl.batted.type) && bounced;
      if (flyDrop || (dB > dM + 4 && Math.hypot(bp.x - P.x, bp.z - P.z) > 3 && tb > 0.8)) { pl._gMiss = true; return null; }
    }
    const fly = AIR.has(pl.batted.type) && !bounced && d.ballPos && d.ballPos.y > 0.6;
    // 捕る所: 走って間に合う一番早い所(フライは落ちてくる所)。走っても届かず跳べば届くなら、跳ぶ所(フェンス際など)
    let tg, late = false;
    if (this._tgPl !== pl || !this._tg || pl.t - this._tgT > 0.1) {
      let cs = this.catchSpot(pl), jmp = false;
      if (cs.late && fly) { const cj = this.catchSpot(pl, 3.9); if (!cj.late) { cs = cj; jmp = true; } }
      if (this._tgPl !== pl || !this._tg) this._tg = cs.p.clone();
      this._tgPl = pl; this._tgT = pl.t; this._tgN = cs.p; this._late = cs.late; this._jmp = jmp;
    }
    this._tg.lerp(this._tgN, 0.35); tg = this._tg; late = this._late;
    const dx = tg.x - P.x, dz = tg.z - P.z, dist = Math.hypot(dx, dz);
    const Rr = d.D.reach;
    const st = { target: tg, dist, fly, state: 'chase', mark: true, late };
    // 合図: 飛び込む・跳ぶ・今だ
    const low = this.closest(pl, 0.7, -0.2, 1.3);
    const high = this.closest(pl, 0.9, 2.4, d.nearFence() < 1.4 ? 3.95 : 3.2);
    const near = this.closest(pl, 0.6, -0.1, 2.4), nearL = this.closest(pl, 1.4, -0.1, 2.4);   // nearL: 落ちてきて手の届く高さで近くを通るなら、跳ばずに待てばよい
    if (!d.meAct && high && high.dist < Rr * 0.95 && (!nearL || nearL.dist > Rr * 1.1) && high.dt > this.cfg.jumpLo && high.dt < this.cfg.jumpHi) {
      return { ...st, word: '今だ!', sub: T ? '「ジャンプ」を押す' : '<kbd>Space</kbd> でジャンプ', cue: 'jump', now: true };
    }
    if (!d.meAct && low && (!near || near.dist > Rr * 0.9) && low.dist > Rr * 0.85 && low.dist < Rr + 1.75 && low.dt > this.cfg.diveLo && low.dt < this.cfg.diveHi) {
      return { ...st, word: '今だ!', sub: T ? '「飛び込む」を押す' : '<kbd>F</kbd> で飛び込む', cue: 'dive', now: true, diveP: low.p };
    }
    if (near && near.dist < Rr && near.dt < 0.4) return { ...st, word: '今だ!', sub: '構えたまま捕る', cue: 'now', now: true };
    const arrive = fly ? 0.9 : 0.7;
    if (dist <= arrive) {
      if (fly && d.flyUp && d.flyUp() && !pl.called) return { ...st, word: 'そのまま!', sub: T ? '止まって「オーライ」を押す' : '止まって <kbd>E</kbd> でオーライ', cue: 'call', ang: null };
      if (this._jmp && (!nearL || nearL.dist > Rr * 1.1)) return { ...st, word: 'ジャンプの用意!', sub: T ? '頭の上に来たら「ジャンプ」' : '頭の上に来たら <kbd>Space</kbd>', ang: null };
      return { ...st, word: '止まって構えて!', sub: fly ? 'ここに落ちてくる' : 'ここで捕る', ang: null };
    }
    const a = this.relAngle(dx, dz);
    let sub = dist < 3 ? 'あと少し' : '';   // 11/22 夜 Discord の感想「何メートルとかも要らない」: 距離の数字は出さない(近い時の「あと少し」だけ)
    if (late && !fly) sub = '急いで! 届かなければ飛び込む';
    else if (late && fly && dist > 4) sub = '全力で';
    const how = T ? 'スティックを矢印の向きへ' : this.keysFor(a);
    sub = sub ? `${sub} ・ ${how}` : how;
    return { ...st, word: this.dirWord(a), sub, ang: a, dir: [dx / dist, dz / dist] };
  }

  render(st) {
    const d = this.d;
    // 地面の印
    if (st && st.mark && st.target) {
      const m = this.mark, tg = st.target;
      if (!m.visible) m.position.set(tg.x, 0, tg.z);
      m.position.x += (tg.x - m.position.x) * 0.3; m.position.z += (tg.z - m.position.z) * 0.3;
      m.position.y = d.gy(m.position) + 0.035;
      const on = st.dist <= (st.fly ? 0.9 : 0.7), mid = st.dist < 4;
      const col = on ? ONSPOT : mid ? GOLD : ORANGE;
      this.mk.ring.material.color.setHex(col); this.mk.inner.material.color.setHex(col); this.mk.wave.material.color.setHex(col);
      this.mk.inner.material.opacity = on ? 0.55 : 0.3;
      // 外へ広がって消える波の輪(0.9 秒ごと)。着いたら止める
      { const w = (this.t / 0.9) % 1; this.mk.wave.visible = !on; this.mk.wave.scale.setScalar(1 + w * 0.9); this.mk.wave.material.opacity = 0.65 * (1 - w); }
      // 遠いほど大きく(遠くからでも見える)、近づくと小さく締まる
      const k = Math.min(1, st.dist / 20);
      m.scale.set(0.9 + 1.0 * k + (on ? 0.06 * Math.sin(this.t * 10) : 0), 1, 0.9 + 1.0 * k + (on ? 0.06 * Math.sin(this.t * 10) : 0));
      m.visible = true;
    } else this.mark.visible = false;
    // 投げる先の野手
    if (st && st.recvK && d.fig[st.recvK]) {
      const p = d.fig[st.recvK].root.position;
      this.recv.position.set(p.x, d.gy(p) + 0.04, p.z);
      { const P = this.ctx.player.pos, k = THREE.MathUtils.clamp(Math.hypot(p.x - P.x, p.z - P.z) / 22, 1, 2.6); this.recv.scale.setScalar(k); }   // 遠い野手ほど大きく(遠くても見える)
      this.recvCone.position.y = 2.75 + 0.15 * Math.sin(this.t * 7);
      this.recv.visible = true;
    } else this.recv.visible = false;
    // 言葉と矢印
    if (!st || (!st.word && !st.sub)) { this.el.classList.remove('show'); return; }
    const key = `${st.word}|${st.sub}|${!!st.now}`;
    if (key !== this._key) { this._key = key; this.elW.textContent = st.word; this.elW.classList.toggle('now', !!st.now); this.elS.innerHTML = st.sub || ''; }
    if (st.ang != null && !st.now) { this.elA.classList.remove('hide'); this.elA.style.transform = `rotate(${st.ang.toFixed(0)}deg)`; }
    else this.elA.classList.add('hide');
    this.el.classList.toggle('fo', st.state === 'fall');
    document.body.classList.toggle('gd3p', this.ctx.view === '3p');   // 後ろからの視点は自分の体が画面の下の真ん中にいるので、言葉を横へ
    this.el.classList.add('show');
  }
}
