// 11/28 今日の守備チャレンジ(持ち主 13 時「全部いい感じにしてくれませんかね」。認知度を上げる案「遊んだ人が自分で広めてくれる仕組みをゲームに足す」)
// - お題は日付(日本の時間)から決まり、同じ日は全員同じ: 球場 × 守備位置 × 打球の種類 × 5 本(と昼・ナイター)。打球の種の乱数も日付から決める。
//   守備位置は内野の日と外野の日が交互、位置と打球は日付の種から。
// - 遊び方はノック(defense.js の knock)を 5 本。能力・成長の課金・キャリアの能力は効かない(ノックは標準の野手 DIFF.std のまま。全員同じ)。
//   守備の最中に案内(課金・ショップ)は出さない。くじ引きなし。初めの練習(チュートリアル)は飛ばす(代わりにタイトルの札の下に操作の 1 行)。
// - 結果: 捕った数・アウトの数・UZR(career.js の 11/28 の本物の基準の式と同じ: 範囲・失策・併殺・外野の補殺、位置ごとの片寄りを引く)・
//   一番の好プレー(名場面)・ランク S〜D(能力の段と同じ字の形)・毎日の連続参加の数(端末の r4walk.chal.v1)。
// - シェア: 結果の画面の「X でシェア」= js/share_x.js の challenge(絵、録れる所は名場面のリプレイの動画)。文は
//   「今日の守備チャレンジ 11/28 観覧車の丘スタジアム・ライト・外野フライ5本 / 5本中4本アウト ランク A・UZR +0.42 ⚾ 連続 3 日」+ タグ + iPhone とブラウザの URL。
// - 球場が今と違う時は読み直して始める(ui.go と同じ r4walk.go の流れ。読み終えたら ui.go をここで横取りしてチャレンジを始める)。
//   球場は POOL の中から日付で回す。今は浜風だけ: ブラウザ版(make_web.py)は浜風の模型しか入れておらず、アプリでもほかの球場は買った人だけなので、
//   全員が同じ球場で遊べるのは浜風だけ(ブラウザ版にほかの球場を入れたら POOL に足せば、12 日で一巡する回し方のまま広がる)。
//   念のため、アプリで鍵のかかった球場にいる時にタイトルへ戻ったら、前の球場へ読み直す(leaveLocked)。
// - 試験: ?chalday=2026-11-29 でその日のお題。window.__chal。
import { STADIUMS, STADIUM_NAMES } from './stadiums.js';
const POOL = STADIUMS.filter((s) => s.id === 'koshien');   // 全員が遊べる球場(上の説明)

const KEY = 'r4walk.chal.v1';
const N = 5;
const POS7 = ['1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
const POS_JA = { '1B': 'ファースト', '2B': 'セカンド', '3B': 'サード', SS: 'ショート', LF: 'レフト', CF: 'センター', RF: 'ライト' };
const OFS = ['LF', 'CF', 'RF'];
// 打球の種類(内野はゴロだけ: 本物の UZR は内野のライナー・小飛球を数えないので、内野のお題はゴロにする)
const TYPES_IF = [{ k: 'grounder', name: 'ゴロ', w: 1 }];
const TYPES_OF = [{ k: 'fly', name: '外野フライ', w: 3 }, { k: 'liner', name: 'ライナー', w: 1 }];
const RANKS = ['S', 'A', 'B', 'C', 'D'];
const RANK_N = { S: 5, A: 4, B: 3, C: 2, D: 1 };
const TAG = '#今日の守備チャレンジ';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sgn2 = (x) => (x >= 0 ? '+' : '−') + Math.abs(+x || 0).toFixed(2);
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const params = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); } })();

// ------------------------------------------------------------ 日付とお題
// 日本の時間の日付(YYYY-MM-DD)。?chalday= で試験の日
export function today() {
  const q = params.get('chalday') || (window.__chalDay || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}
const dayNum = (day) => { const [y, m, d] = day.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 864e5); };
const dayOf = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
const hashR = (n, salt) => mulberry(((n * 2654435761) ^ (salt * 40503)) >>> 0);
// 守備位置: 内野の日と外野の日を 1 日ずつ交互に(続けて同じ位置にならない)。その中の位置は日付の種から
const IF4 = ['1B', '2B', '3B', 'SS'], OF3 = ['LF', 'CF', 'RF'];
const posOf = (n) => { const G = ((n % 2) + 2) % 2 ? IF4 : OF3; return G[Math.floor(hashR(n, 1)() * G.length)]; };
export function spec(day = today()) {
  const n = dayNum(day), r = hashR(n, 7);
  const st = POOL[(((n * 5 + 3) % POOL.length) + POOL.length) % POOL.length];   // 5 と 12 は互いに素: 12 球場なら 12 日で一巡し、前の日と同じにならない
  const pos = posOf(n);
  const of = OFS.includes(pos), T = of ? TYPES_OF : TYPES_IF;
  let x = r() * T.reduce((a, b) => a + b.w, 0), type = T[0];
  for (const t of T) { if ((x -= t.w) <= 0) { type = t; break; } }
  const time = r() < 0.5 ? 'day' : 'night';
  const [, mm, dd] = day.split('-').map(Number);
  return { day, md: `${mm}/${dd}`, stadium: st.id, stName: STADIUM_NAMES[st.id] || st.name, pos, posName: POS_JA[pos], type: type.k, typeName: type.name, n: N, time,
    seed: ((n * 7919 + 13) >>> 0), label: `${STADIUM_NAMES[st.id] || st.name}・${POS_JA[pos]}・${type.name}${N}本` };
}

// ------------------------------------------------------------ 記録(端末だけ)
function load() {
  const d = { days: {}, last: null, streak: 0, maxStreak: 0, total: 0 };
  try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && typeof j === 'object' && !Array.isArray(j)) { const o = { ...d, ...j }; if (!o.days || typeof o.days !== 'object' || Array.isArray(o.days)) o.days = {}; return o; } } catch (e) { /* 壊れていたら新しく */ }
  return d;
}
function save(D) { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { /* 残せなくても遊べる */ } }
// 今の連続の数(最後に遊んだ日が今日か昨日なら続いている。それより前なら 0)
export function streakNow(D = load(), day = today()) {
  if (!D.last) return 0;
  const gap = dayNum(day) - dayNum(D.last);
  return gap === 0 || gap === 1 ? D.streak : 0;
}
const better = (a, b) => !b || (RANK_N[a.rank] - RANK_N[b.rank] || a.outs - b.outs || a.uzr - b.uzr) > 0;
function record(res) {
  const D = load(), day = res.day, n = dayNum(day);
  if (D.last !== day) {
    const gap = D.last ? n - dayNum(D.last) : 99;
    D.streak = gap === 1 ? (D.streak || 0) + 1 : gap === 0 ? D.streak : 1;
    if (gap < 0) D.streak = Math.max(1, D.streak || 1);   // 端末の日付を戻した時は数え直さない
    D.last = day;
  }
  D.maxStreak = Math.max(D.maxStreak || 0, D.streak);
  D.total = (D.total || 0) + 1;
  const prev = D.days[day], cur = { rank: res.rank, outs: res.outBalls, caught: res.caught, uzr: Math.round(res.uzr * 100) / 100, tries: ((prev && prev.tries) || 0) + 1 };
  const isBest = better(cur, prev);
  D.days[day] = isBest ? cur : { ...prev, tries: cur.tries };
  // 60 日より前は消す
  for (const k of Object.keys(D.days)) if (n - dayNum(k) > 60) delete D.days[k];
  save(D);
  return { streak: D.streak, dayBest: D.days[day], isBest: isBest && !!prev, tries: cur.tries };
}

// ------------------------------------------------------------ 本体
const S = { cur: null, pending: null, seeded: false, lib: null, inVB: false, open: false, last: null };

// career.js の UZR の式(outProb・片寄りなど)を、index.html が読み込んだのと同じ URL で読む(版の ?v= が変わっても 2 つ目を作らない)
async function careerLib() {
  if (S.lib) return S.lib;
  const sc = [...document.querySelectorAll('script[type="module"]')].map((s) => s.getAttribute('src') || '').find((s) => /(^|\/)js\/career\.js/.test(s));
  if (!sc) return null;
  try { S.lib = await import(new URL(sc, location.href).href); } catch (e) { console.warn('challenge career lib', e); S.lib = null; }
  return S.lib;
}

function appUI() { return window.__app && window.__app.ui; }

// チャレンジを始める(タイトルの札・結果の「もう一度」・一時停止の「最初から」)
export function start() {
  const A = window.__app, ui = appUI(); if (!A || !ui || !A.ready) return false;
  const sp = spec();
  if (ui.app.stadium !== sp.stadium && ui.app.setStadium) {
    // 違う球場: 読み直して、読み終えたら始める(main.js が r4walk.go を見て ui.go を呼ぶ → 下の包みでここへ)
    try {
      sessionStorage.setItem('r4walk.go', '1');
      sessionStorage.setItem('bp.chal.go', sp.day);
      if (!sessionStorage.getItem('bp.chal.prev')) sessionStorage.setItem('bp.chal.prev', ui.app.stadium || 'koshien');
    } catch (e) { /* 使えない環境 */ }
    ui.app.setStadium(sp.stadium);
    return true;
  }
  hideRes();
  S.pending = sp;
  ui.hideAll();
  try { window.__career && window.__career.ui && window.__career.ui.hide(); } catch (e) { /* */ }
  if (ui.app.setTime) ui.app.setTime(sp.time);
  ui.app.startMode({ mode: 'knock', pos: sp.pos, count: N, time: sp.time, view: ui.sel.view, mark: ui.sel.mark, diff: 'std', bd: 'mix' });
  return true;
}

function hook() {
  const A = window.__app, d = A && A.defense, ui = A && A.ui;
  if (!d || !ui || S.hooked) return !!S.hooked;
  S.hooked = true;
  careerLib();
  // 始める: チャレンジなら 5 本・練習なし・日付の種
  const ob = d.begin;
  d.begin = function (sel) {
    const sp = S.pending; S.pending = null;
    const on = !!(sp && sel && sel.mode === 'knock');
    if (on) {
      sel = { ...sel, pos: sp.pos, count: N, noTut: true };
      this.rng = mulberry(sp.seed); S.seeded = true;
      this._lastKinds = []; this._lastLabels = [];   // 打球の種類の散らし(直前の打球)も毎回まっさらから(同じ日は同じ 5 本)
      // ノックの記録(前回との比べ・自己ベスト)をチャレンジで書き換えないように、前の値を覚えておく
      const hk = `r4walk.evalHist.knock.${sp.pos}`;
      let hv = null; try { hv = localStorage.getItem(hk); } catch (e) { /* */ }
      S.cur = { sp, plays: [], uzr: 0, parts: { rng: 0, dpr: 0, arm: 0, err: 0 }, chances: 0, hk, hv, kb: JSON.stringify((this.best || {})[`${sp.pos}_${N}`] ?? null) };
    } else {
      S.cur = null;
      if (S.seeded) { this.rng = mulberry(Date.now() & 0xffffff); S.seeded = false; }
    }
    const r = ob.call(this, sel);
    if (on && this.kind === 'knock' && !this.tut) {
      this.wait = 2.4;   // 始めの札(お題)を読む間
      try { const CU = window.__career && window.__career.ui; if (CU && CU.intro) CU.intro('今日の守備チャレンジ', sp.label, 2300); } catch (e) { /* 飾り */ }
    } else if (on) S.cur = null;
    return r;
  };
  // 打球: お題の種類だけ(抜ける当たり・ファウル・線ぎりぎりは出さない)
  const vb = d.varietyBall;
  d.varietyBall = function (cat, want) {
    const C = S.cur;
    if (!C || this.kind !== 'knock' || this.tut || S.inVB) return vb.call(this, cat, want);
    S.inVB = true;
    try {
      const t = C.sp.type, cat2 = t === 'grounder' ? 'grounder' : 'fly';
      const okT = (b) => (t === 'grounder' ? b.type === 'grounder' : t === 'fly' ? b.type === 'fly' || b.type === 'fence' : b.type === t);
      let b = null;
      for (let i = 0; i < 16; i++) {
        b = vb.call(this, cat2, want);
        if (okT(b) && b.kind !== 'through' && b.kind !== 'foul' && !/ファウル|ぎりぎり|ライン際|バント/.test(b.label)) return b;
      }
      return b;
    } finally { S.inVB = false; }
  };
  // 1 本ずつの打球と場面(走者・アウト)は、その本の番号と日付の種から決める(遊び方・画面の速さで乱数の進みが変わっても、同じ日の n 本目は同じ打球)
  const nk = d.nextKnock;
  d.nextKnock = function (...x) {
    const C = S.cur;
    if (C && this.kind === 'knock' && !this.tut && this.knock) this.rng = mulberry((C.sp.seed ^ Math.imul(this.knock.n + 1, 0x9e3779b1)) >>> 0);
    return nk.apply(this, x);
  };
  // 1 本ごと: 普通の野手がアウトにする割合(UZR の基準)
  const sp0 = d.startPlay;
  d.startPlay = function (...x) {
    const r = sp0.apply(this, x);
    try {
      const C = S.cur, pl = this.play;
      if (C && this.kind === 'knock' && !this.tut && pl && pl.opt.fielder === this.my && pl.batted && !pl.steal && S.lib) {
        pl._chal = { p: S.lib.outProb(this, pl), sit: { r1: !!(this.g && this.g.bases && this.g.bases[0]), outs: (this.g && this.g.outs) || 0 } };
      }
    } catch (e) { console.warn('challenge', e); }
    return r;
  };
  const ep = d.evalPlay;
  d.evalPlay = function (pl) {
    const r = ep.call(this, pl);
    try { if (S.cur && this.kind === 'knock' && !this.tut && !pl._chalDone) { pl._chalDone = true; afterPlay(this, pl); } } catch (e) { console.warn('challenge', e); }
    return r;
  };
  // 結果: チャレンジならチャレンジの結果の画面
  const ores = ui.result.bind(ui);
  ui.result = function (r) { try { if (onResult(r)) return; } catch (e) { console.warn('challenge result', e); } return ores(r); };
  // 一時停止の「最初から」・読み直した後の始まり(r4walk.go)はチャレンジを続ける
  const og = ui.go.bind(ui);
  ui.go = function (...x) {
    let g = null; try { g = sessionStorage.getItem('bp.chal.go'); sessionStorage.removeItem('bp.chal.go'); } catch (e) { /* */ }
    if ((g && g === today()) || (S.cur && window.__app.defense && window.__app.defense.active)) { if (start()) return; }
    return og(...x);
  };
  // タイトルへ: チャレンジの印を消す。アプリで鍵のかかった球場なら前の球場へ読み直す
  const ot = ui.app.toTitle;
  ui.app.toTitle = function (...x) {
    const was = !!S.cur || !!S.last; S.cur = null; hideRes();
    const r = ot.apply(this, x);
    if (was) leaveLocked();
    return r;
  };
  const oi = ui.isOpen.bind(ui);
  ui.isOpen = function () { return oi() || S.open; };
  const os = ui.show.bind(ui);
  ui.show = function (id, ...x) { const r = os(id, ...x); if (id === 'title') renderBanner(); return r; };
  buildBanner();
  return true;
}
// アプリで、その日のチャレンジの間だけ開けた球場から出る時は、前の球場へ戻す
function leaveLocked() {
  S.last = null;
  const A = window.__app, ui = appUI(); if (!ui) return;
  const st = ui.app.stadium;
  if (typeof window.__ippomeOpen !== 'function' || window.__ippomeOpen(st)) return;
  let prev = 'koshien'; try { prev = sessionStorage.getItem('bp.chal.prev') || 'koshien'; sessionStorage.removeItem('bp.chal.prev'); } catch (e) { /* */ }
  if (!window.__ippomeOpen(prev)) prev = 'koshien';
  try { ui.sel.stadium = prev; A && ui.app.store && ui.app.store('r4walk.sel', ui.sel); } catch (e) { /* */ }
  ui.app.setStadium(prev);
}

// 1 プレーの UZR(career.js の afterPlay の 11/28 の形と同じ式。打球は全部自分の所へ来るので、ピボットは無い)
function afterPlay(d, pl) {
  const C = S.cur, L = S.lib; if (!C) return;
  if (pl.label === 'ホームラン') return;
  const mine = !!pl._chal, caught = pl.fieldedBy === 'me' && !pl.missed;
  if (pl.label === 'ファウル' && !caught) return;
  const lt = pl.lastThrow, of = OFS.includes(d.my);
  // ノックは打者走者を走らせない場面があり、捕ったフライ・正しい塁へ投げた時は pl.outs が 0 のことがある(defense.js の evalPlay の outMade と同じ見方で 1 つと数える)
  const outs = Math.max(pl.outs || 0, caught && pl.decisionOk !== false ? 1 : 0);
  let err = 0;
  if (pl.evalKind === 'miss' && mine && !caught && pl.label !== '悪送球' && (pl.myMin ?? 99) < d.D.reach * 0.9) err = 1;
  if (pl.label === '悪送球' && lt && !lt.self) err = 1;
  if (pl.dropped && mine) err = 1;
  const part = { rng: 0, dpr: 0, arm: 0, err: 0 };
  if (L) {
    const RV = of ? 0.83 : 0.75, EAVG = of ? L.EAVG_OF : L.EAVG_IF, base = L.UZR_BASE[d.my] || 0;
    const ty = pl.batted && pl.batted.type, sit = (pl._chal && pl._chal.sit) || {};
    const ifLine = !of && ty === 'liner', ifAir = (!of && (ty === 'pop' || ty === 'foulfly' || pl.label === 'ファウル')) || (of && (ty === 'grounder' || ty === 'bunt'));
    if (mine && !ifLine) {
      const p = pl._chal.p, ok = caught && outs > 0;
      if (err) part.err -= (1 - EAVG) * RV;
      else { if (!ifAir) part.rng += ok ? (1 - p) * RV : -p * RV; part.err += EAVG * RV; }
      if (pl._carDpR != null && caught && !err && sit.r1 && sit.outs < 2) part.dpr += (outs >= 2 ? 1 - pl._carDpR : -pl._carDpR) * L.DP_RV[sit.outs];
      if (!ifAir) { C.chances++; part.rng -= base; }
    } else if (err && !mine) part.err -= 0.3;
    // 外野の補殺(フライを捕って走者も刺した・ゴロを拾って刺した)
    if (of && caught && lt && !lt.self && outs > (pl.fly ? 1 : 0)) part.arm += 0.45;
  }
  const du = part.rng + part.dpr + part.arm + part.err;
  for (const k in part) C.parts[k] += part[k];
  C.uzr += du;
  C.plays.push({ n: C.plays.length + 1, label: pl.opt.kb || '', type: pl.batted && pl.batted.type, caught, outs, out: outs > 0, err, du: Math.round(du * 1000) / 1000, kind: pl.evalKind || null, special: pl.special || null, p: pl._chal ? Math.round(pl._chal.p * 100) / 100 : null });
}

// ランク: 5 本全部アウトで UZR +0.30 以上(難しい打球を 1 つは決めた)= S、全部 = A、1 本のがして UZR がプラス = A、4 本(UZR マイナス)・3 本 = B、2 本 = C、それ以下 = D
export function rankOf(outBalls, uzr, n = N) {
  if (outBalls >= n && uzr >= 0.30) return 'S';
  if (outBalls >= n || (outBalls >= n - 1 && uzr >= 0)) return 'A';   // 1 本のがしても、難しい打球を決めて UZR がプラスなら A
  if (outBalls >= n - 2) return 'B';
  if (outBalls >= n - 3) return 'C';
  return 'D';
}

function onResult(r) {
  const C = S.cur;
  if (!C || !r || r.kind !== 'knock') return false;
  S.cur = null;
  // ノックの記録を戻す(チャレンジはノックの自己ベスト・前回との比べに入れない)
  try { if (C.hv == null) localStorage.removeItem(C.hk); else localStorage.setItem(C.hk, C.hv); } catch (e) { /* */ }
  try { const d = window.__app.defense, k = `${C.sp.pos}_${N}`, prev = JSON.parse(C.kb); if (d && d.best) { if (prev == null) delete d.best[k]; else d.best[k] = prev; d.ctx.store('r4walk.knockBest', d.best); } } catch (e) { /* */ }
  const plays = C.plays, outBalls = plays.filter((p) => p.out).length, outsTotal = plays.reduce((a, p) => a + p.outs, 0);
  const caught = plays.filter((p) => p.caught).length;
  const ev = r.ev || {};
  const stopped = !!r.stopped || (r.done || 0) < N;
  const res = { day: C.sp.day, sp: C.sp, n: N, done: Math.min(N, r.done ?? plays.length), caught, outBalls, outsTotal, uzr: C.uzr, parts: C.parts, chances: C.chances, plays,
    best: ev.best || null, fine: ev.fine || 0, rank: rankOf(outBalls, C.uzr), stopped, evRank: ev.rank };
  if (!stopped) Object.assign(res, record(res)); else res.streak = streakNow();
  S.last = res;
  showRes(res);
  return true;
}

// ------------------------------------------------------------ 画面
const CSS = `
#chalBan{display:none;width:min(560px,100%);margin:auto 0 12px;padding:9px 14px 10px 12px;border-radius:18px;border:3px solid #fff;cursor:pointer;
  background:linear-gradient(180deg,#ff5a3c,#c8141e 60%,#9c0d18);box-shadow:0 0 0 2px #7a0a10,0 5px 0 rgba(0,0,0,.35),0 0 18px rgba(255,90,60,.45);
  color:#fff;font-family:var(--v5-head,"Hiragino Sans","Yu Gothic UI",sans-serif);text-align:left;align-items:center;gap:10px;-webkit-tap-highlight-color:transparent}
body.ready #chalBan.on{display:flex}
#title #chalBan + .modes{margin-top:0}
#chalBan:active{transform:translateY(3px);box-shadow:0 0 0 2px #7a0a10,0 2px 0 rgba(0,0,0,.35)}
#chalBan .cbDay{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;width:58px;height:58px;border-radius:12px;background:#fff;color:#c8141e;line-height:1}
#chalBan .cbDay small{font-size:11px;font-weight:900;color:#7a0a10}
#chalBan .cbDay b{font-size:22px;font-weight:900;margin-top:3px}
#chalBan .cbMid{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
#chalBan .cbHead{font-size:19px;font-weight:900;letter-spacing:.04em;-webkit-text-stroke:3px #5a0610;paint-order:stroke fill;white-space:nowrap}
#chalBan .cbSpec{font-size:14px;font-weight:900;color:#ffe9a8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#chalBan .cbSub{font-size:12px;font-weight:700;color:#ffd6cc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#chalBan .cbGo{flex:0 0 auto;padding:8px 12px;border-radius:999px;background:linear-gradient(180deg,#8cf05a,#2fb81a 50%,#13820f);border:2px solid #fff;font-size:16px;font-weight:900;-webkit-text-stroke:3px #0b4a08;paint-order:stroke fill;white-space:nowrap}
#chalBan .cbGo.done{background:linear-gradient(180deg,#fff1a0,#f6c437 50%,#e39b00);-webkit-text-stroke:0;color:#3a1e00}
@media (min-width:900px) and (min-height:560px){ #chalBan{margin-bottom:18px;padding:10px 18px 11px 14px} #chalBan .cbHead{font-size:22px} #chalBan .cbSpec{font-size:16px} }
@media (max-height:559px), (max-width:899px) and (orientation:landscape){ #chalBan{width:300px;margin:0 0 8px;padding:5px 8px;gap:6px;border-radius:14px} #chalBan .cbDay{width:40px;height:40px} #chalBan .cbDay b{font-size:16px} #chalBan .cbDay small{font-size:9px}
  #chalBan .cbHead{font-size:14px} #chalBan .cbSpec{font-size:11px} #chalBan .cbSub{display:none} #chalBan .cbGo{font-size:13px;padding:6px 8px} }
#chalRes .chHead{text-align:center;font-size:clamp(26px,7.4vw,36px);font-weight:900;font-style:italic;color:#fff;-webkit-text-stroke:6px var(--c-ink,#061a46);paint-order:stroke fill;margin-top:6px}
#chalRes .chSpec{text-align:center;font-size:15px;font-weight:900;color:#ffe9a8;margin-top:2px}
#chalRes .chMain{display:flex;align-items:center;justify-content:center;gap:18px;padding:6px 0 2px}
#chalRes .chBig{text-align:center;color:var(--c-ink,#061a46)}
#chalRes .chBig b{display:block;font:900 64px/1 var(--v5-head,sans-serif)}
#chalRes .chBig small{font-size:16px;font-weight:900}
#chalRes .chRank{display:flex;flex-direction:column;align-items:center}
#chalRes .chRank .cLetter{font-size:96px;-webkit-text-stroke:8px #0b2558;line-height:1;padding:0 8px}
#chalRes .chRank small{font-size:14px;font-weight:900;color:var(--c-ink,#061a46)}
#chalRes .chTiles{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}
#chalRes .chTile{border-radius:12px;background:rgba(6,26,70,.85);color:#fff;text-align:center;padding:7px 2px 6px}
#chalRes .chTile b{display:block;font-size:22px;font-weight:900}
#chalRes .chTile b.pos{color:#7dff9e} #chalRes .chTile b.neg{color:#ff9a8a}
#chalRes .chTile span{font-size:11.5px;font-weight:700;color:#cfe0ff}
#chalRes .chScene{margin-top:8px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.75);color:var(--c-ink,#061a46);font-size:14px;font-weight:700}
#chalRes .chScene b{color:#c8141e;margin-right:6px}
#chalRes .chPlays{display:flex;justify-content:center;gap:6px;margin-top:8px}
#chalRes .chPlays i{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:900;font-size:15px;border:2px solid #fff}
#chalRes .chPlays i.o{background:#2fbf1f;color:#fff} #chalRes .chPlays i.x{background:#8a93a6;color:#fff} #chalRes .chPlays i.f{background:#f6c437;color:#3a1e00}
#chalRes .chStreak{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:2px;font-weight:900;color:#fff;font-size:17px}
#chalRes .chStreak b{font-size:30px;color:#ffd23a;-webkit-text-stroke:4px #5a2a00;paint-order:stroke fill}
#chalRes .chNote{text-align:center;font-size:12px;color:#cfe0ff;font-weight:700}
#chalRes .chShare{min-height:62px;border-radius:999px;border:3px solid #fff;background:#000;color:#fff;font-family:inherit;font-size:22px;font-weight:900;cursor:pointer;box-shadow:0 5px 0 rgba(0,0,0,.4)}
#chalRes .chShare:active{transform:translateY(3px)}
#chalRes .chSide{display:flex;flex-direction:column;gap:12px}
/* PC・横長(キャリアと同じ条件): 左に結果の板、右に連続の日数とボタン */
@media (min-width:900px) and (min-aspect-ratio:4/3){
  #chalRes .carSheet{max-width:980px;grid-template-columns:1fr 1fr;column-gap:22px;align-items:start}
  #chalRes .chHead,#chalRes .chSpec{grid-column:1 / -1}
  #chalRes .chHead{font-size:38px}
  #chalRes .chSpec{font-size:18px;margin-top:-6px}
  #chalRes .carSheet>.cPanel{grid-column:1;margin-top:20px}
  #chalRes .chSide{grid-column:2;margin-top:20px}
  #chalRes .chStreak{font-size:22px}#chalRes .chStreak b{font-size:44px}
}
`;
function ensureCss() { if ($('chalCss')) return; const s = document.createElement('style'); s.id = 'chalCss'; s.textContent = CSS; document.head.appendChild(s); }

function buildBanner() {
  ensureCss();
  const modes = $('modes'); if (!modes || $('chalBan')) return;
  const b = document.createElement('button');
  b.id = 'chalBan'; b.type = 'button';
  modes.before(b);
  b.addEventListener('click', (e) => { e.stopPropagation(); start(); });
  renderBanner();
  // 読み終わるまでは出さない(body.ready は main.js が付ける。念のため __app.ready も見る)
  const tick = () => { if (window.__app && window.__app.ready) { b.classList.add('on'); renderBanner(); } else setTimeout(tick, 300); };
  tick();
}
function renderBanner() {
  const b = $('chalBan'); if (!b) return;
  const sp = spec(), D = load(), st = streakNow(D, sp.day), td = D.days[sp.day];
  const sub = td ? `今日のベスト ランク ${td.rank} ・ ${N}本中${td.outs}本アウト` : st ? `連続 ${st} 日 ・ 今日もつなごう` : '1 日 1 回 全員同じお題 ・ 1 分で終わる';
  b.innerHTML = `<span class="cbDay"><small>今日</small><b>${esc(sp.md)}</b></span><span class="cbMid"><span class="cbHead">今日の守備チャレンジ</span>`
    + `<span class="cbSpec">${esc(sp.label)}</span><span class="cbSub">${esc(sub)}</span></span><span class="cbGo${td ? ' done' : ''}">${td ? 'もう一度' : '挑戦'}</span>`;
  b.setAttribute('aria-label', `今日の守備チャレンジ ${sp.label}`);
  b.dataset.day = sp.day;
}

let resEl = null;
function hideRes() { if (resEl) resEl.classList.add('hide'); S.open = false; }
function showRes(res) {
  ensureCss();
  const ui = appUI();
  if (!resEl) {
    resEl = document.createElement('section'); resEl.id = 'chalRes'; resEl.className = 'carScreen hide';
    document.body.appendChild(resEl);
    resEl.addEventListener('click', (e) => onResClick(e));
    resEl.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    resEl.addEventListener('mousedown', (e) => e.stopPropagation());
  }
  const sp = res.sp, st = sp.stadium;
  const icons = Array.from({ length: N }, (_, i) => { const p = res.plays[i]; if (!p) return '<i class="x">-</i>'; return p.out ? (p.special || p.kind === 'fine' ? `<i class="f">${i + 1}</i>` : `<i class="o">${i + 1}</i>`) : `<i class="x">${i + 1}</i>`; }).join('');
  const hasRp = !!pickRec();
  resEl.innerHTML = `<div class="carBg" style="--st:url('img/stadium_thumbs/${esc(st)}.jpg')"><i class="fwL"></i><i class="fwR"></i></div>
    <div class="carSheet">
      <div class="chHead">今日の守備チャレンジ</div>
      <div class="chSpec">${esc(sp.md)} ${esc(sp.label)}</div>
      <div class="cPanel cLight"><div class="cRibbon green">${res.stopped ? '途中まで' : '結果'}</div>
        <div class="chMain"><div class="chBig"><b>${res.outBalls}<small style="font-size:30px"> / ${N}</small></b><small>本アウト</small></div>
          <div class="chRank"><span class="cLetter g${esc(res.rank)}">${esc(res.rank)}</span><small>ランク</small></div></div>
        <div class="chPlays" aria-label="1 本ずつの結果">${icons}</div>
        <div class="chTiles"><div class="chTile"><b>${res.caught}</b><span>捕った</span></div><div class="chTile"><b>${res.outsTotal}</b><span>アウト</span></div>
          <div class="chTile"><b class="${res.uzr >= 0 ? 'pos' : 'neg'}">${sgn2(res.uzr)}</b><span>UZR</span></div><div class="chTile"><b>${res.fine}</b><span>ファインプレー</span></div></div>
        ${res.best ? `<div class="chScene"><b>名場面</b>${esc(res.best)}</div>` : ''}
      </div>
      <div class="chSide">
      ${res.stopped ? '<div class="chNote">5 本を守り切ると、連続の日数に入ります</div>' : `<div class="chStreak">連続 <b>${res.streak}</b> 日${res.isBest ? ' ・ 今日のベスト更新' : ''}</div>`}
      ${res.stopped ? '' : '<button class="chShare" data-act="share" type="button">X でシェア</button>'}
      ${hasRp ? '<button class="cBtn" data-act="replay" type="button">名場面のリプレイ</button>' : ''}
      <div class="cRow2"><button class="cBtn" data-act="again" type="button">もう一度</button><button class="cBtn" data-act="title" type="button">タイトルへ</button></div>
      <div class="chNote">UZR は同じ守備位置の平均の野手と比べた点(平均 0)。ランクは 5 本中のアウトの数と UZR で決まります(全部アウトで UZR +0.30 以上が S)。能力は全員同じです。お題は毎日 0 時(日本時間)に変わります</div>
      </div>
    </div>`;
  ui && ui.hideAll();
  ui && ui.app.setOverlay(true);
  resEl.classList.remove('hide'); resEl.scrollTop = 0; S.open = true;
}
function pickRec() { try { const X = window.__bpShareX, rp = window.__app.replay; return X && X.bestRec ? X.bestRec(rp) : null; } catch (e) { return null; } }
function onResClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  e.stopPropagation();
  const a = b.dataset.act, ui = appUI();
  if (a === 'again') { start(); }
  else if (a === 'title') { hideRes(); ui.app.toTitle(); ui.show('title', true); }
  else if (a === 'share') { share(S.last); }
  else if (a === 'replay') {
    const R = pickRec(), rp = window.__app.replay; if (!R || !rp) return;
    resEl.classList.add('hide');
    rp.open(R, () => { resEl.classList.remove('hide'); ui && ui.app.setOverlay(true); });
  }
}

// ------------------------------------------------------------ シェアの絵と文
export function shareBody(res) {
  const sp = res.sp;
  return `今日の守備チャレンジ ${sp.md} ${sp.label} / ${N}本中${res.outBalls}本アウト ランク ${res.rank}・UZR ${sgn2(res.uzr)} ⚾ 連続 ${res.streak} 日`;
}
async function shareImage(res) {
  const X = window.__bpShareX, G = X.draw; await G.fonts();
  const cv = G.newCanvas(), g = cv.getContext('2d'), W = cv.width, H = cv.height; G.ground(g, W, H); G.brand(g, W, H);
  const sp = res.sp;
  g.textAlign = 'left';
  G.rrect(g, 44, 124, 360, 50, 10); g.fillStyle = '#d62828'; g.fill(); g.fillStyle = '#fff'; G.fitText(g, '今日の守備チャレンジ', 324, 28, '900', G.FONT); g.fillText('今日の守備チャレンジ', 62, 160);
  g.fillStyle = '#ffe08a'; g.font = '900 28px sans-serif'; g.fillText(sp.md, 422, 160);
  g.fillStyle = '#fff'; G.fitText(g, sp.label, 760, 34, '900'); g.fillText(sp.label, 46, 222);
  g.font = `900 120px ${G.FONT}`; g.fillStyle = '#ffe08a'; g.fillText(`${res.outBalls} / ${N}`, 44, 350);
  g.fillStyle = '#fff'; g.font = '700 30px sans-serif'; g.fillText('本アウト', 50, 396);
  G.tiles(g, 44, 424, 760, [[res.caught, '捕った'], [res.outsTotal, 'アウト'], [sgn2(res.uzr), 'UZR', res.uzr >= 0 ? '#7dff9e' : '#ff9a8a'], [`${res.streak}日`, '連続', '#ffcf33']]);
  g.textAlign = 'left';
  if (res.best) { g.fillStyle = '#ffcf33'; g.font = '900 24px sans-serif'; g.fillText('名場面', 46, 584); g.fillStyle = '#fff'; G.fitText(g, res.best, 640, 24); g.fillText(res.best, 150, 584); }
  G.stamp(g, 1000, 300, 120, res.rank);
  g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '700 26px sans-serif'; g.fillText('ランク', 1000, 150);
  g.font = '700 22px sans-serif'; g.fillText('全員同じお題・同じ能力', 1000, 476);
  const body = shareBody(res);
  // 縦の画面(スマホ)は「横から」の視点が内野の横の壁に入ることがあるので、後ろからで録る
  return { canvas: cv, body, text: X.withTags(body, false, TAG), name: 'bokura_challenge.png', tag: TAG, view: innerHeight > innerWidth ? 'behind' : null };
}
export async function share(res) {
  const X = window.__bpShareX; if (!X || !res || !X.challenge || !X.draw) return null;
  return X.challenge(await shareImage(res));
}

// ------------------------------------------------------------ つなぐ
(function wait() { if (!hook()) setTimeout(wait, 200); })();
window.__chal = { spec, today, start, streakNow, rankOf, shareBody, share, load, get state() { return S; }, KEY, N };
