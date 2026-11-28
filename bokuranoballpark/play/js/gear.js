// 11/28 夜 道具ガチャ(持ち主「絶対に課金が増えるガチャ要素とか増やしてください」「オンラインで競わせるのなら良い感じになるように」)。
// 引けるのは守備の道具 4 種(グラブ・スパイク・リストバンド・アームスリーブ)× レア度 N/R/SR/SSR。付けると守備のキャリアの動きが少し良くなる(上限あり)。
//   効き方: 能力(肩・守備)に「その場だけ足す点」。付けた道具の点を足した能力で career.js の EFFECT を引く(99 まで)。能力そのものは増えない。
//     グラブ = 届く幅・飛び込み(守備) / スパイク = 一歩目・走る速さ(守備) / リストバンド = 送球の速さ(肩) / アームスリーブ = 送球の正確さ(肩)
//     点: N 1〜3・R 2〜5・SR 4〜8・SSR 6〜12(Lv1〜Lv5)。同じ物が出ると Lv が 1 上がる(Lv5 の後は天井の点に)。
//   確率: N 52%・R 33%・SR 12%・SSR 3%(同じレア度の中は同じ割合)。10 回は 10 回目が SR 以上(SR 80%・SSR 20%)。
//   天井: 1 回引くごとに 1 点。100 点で SSR を 1 つ選べる(点は引いた回数で、SSR が出ても減らない。選んだ時に 100 減る)。
//   全部そろえると何かもらえる形(コンプガチャ)は作らない。確率は引く前の画面に全部出す(ガチャの画面の「出る物と確率」)。
//   引く権利: アプリの課金(1 回・10 回。買ったらすぐ引く = 有償の券を持ち越さない)と、遊んでたまる無料の券(キャリアの初めての試合・昇格・キャリア完了)。
//   有償で買った分は「買った回数だけすぐ引く」。引く前にアプリが落ちた時は、次にガチャの画面を開いた時に引く(owed)。
// 保存は localStorage の r4walk.gear.v1(端末の中。サーバーに送るのはランキングの「一番いい道具」の 1 語と、オンラインの見た目の 1 語だけ)。
// 画面: ガチャ(#gcScreen)・道具を付け替える(同じ画面の下)。案内はショップの棚(アプリ)と守備のキャリアの結果の画面の 1 行だけ。
// ?nogear=1 で道具の効き目を 0(画面は出る。比べる試験用)。
const KEY = 'r4walk.gear.v1';
export const SLOTS = {
  glove: { name: 'グラブ', ab: 'field', eff: 'reach', what: 'グラブの届く幅・飛び込み' },
  spike: { name: 'スパイク', ab: 'field', eff: 'start', what: '一歩目・走る速さ' },
  band: { name: 'リストバンド', ab: 'arm', eff: 'arm', what: '送球の速さ' },
  sleeve: { name: 'アームスリーブ', ab: 'arm', eff: 'aim', what: '送球の正確さ' },
};
export const SLOT_KEYS = Object.keys(SLOTS);
export const RAR = {
  N: { p: 0.52, base: 1, max: 3, dupPt: 1, col: '#9aa7b8' },
  R: { p: 0.33, base: 2, max: 5, dupPt: 2, col: '#3f8cff' },
  SR: { p: 0.12, base: 4, max: 8, dupPt: 5, col: '#b45cff' },
  SSR: { p: 0.03, base: 6, max: 12, dupPt: 20, col: '#ffc21a' },
};
export const RAR_KEYS = ['SSR', 'SR', 'R', 'N'];
export const LV_MAX = 5, PITY = 100;
export const TEN_SR = { SR: 0.8, SSR: 0.2 };   // 10 回目(SR 以上 確定)の割合
// 道具の一覧(色は絵の色合わせ。hue は絵を回す角度)
export const ITEMS = [
  ['g_n1', 'glove', 'N', '練習用グラブ', '#8a5a2b', 0], ['g_n2', 'glove', 'N', '草野球グラブ', '#a0703a', 10],
  ['g_r1', 'glove', 'R', '硬式グラブ 赤土', '#b0402a', -20], ['g_r2', 'glove', 'R', '硬式グラブ 紺', '#24408a', 200],
  ['g_sr1', 'glove', 'SR', '職人のグラブ 金糸', '#6a3a1a', 0], ['g_sr2', 'glove', 'SR', '名手モデル 漆黒', '#222222', 0],
  ['g_ssr1', 'glove', 'SSR', '黄金のグラブ', '#e0a81a', 20],
  ['s_n1', 'spike', 'N', '練習用スパイク', '#333333', 0], ['s_n2', 'spike', 'N', '白のスパイク', '#e8e8e8', 0],
  ['s_r1', 'spike', 'R', '軽量スパイク 赤', '#c0282a', 0], ['s_r2', 'spike', 'R', '軽量スパイク 青', '#1f5fd0', 200],
  ['s_sr1', 'spike', 'SR', '俊足スパイク 稲妻', '#f0c020', 40], ['s_sr2', 'spike', 'SR', '一歩目スパイク 翠', '#1fa060', 120],
  ['s_ssr1', 'spike', 'SSR', '疾風のスパイク', '#ffd23a', 30],
  ['b_n1', 'band', 'N', '綿のリストバンド', '#e8e8e8', 0], ['b_n2', 'band', 'N', '二重リストバンド', '#2a3a6a', 210],
  ['b_r1', 'band', 'R', '強肩バンド 赤', '#c8323a', 0], ['b_r2', 'band', 'R', '強肩バンド 紺', '#1b2a6e', 220],
  ['b_sr1', 'band', 'SR', '剛腕バンド 炎', '#ff6a1a', 20], ['b_sr2', 'band', 'SR', '剛腕バンド 氷', '#5ac8ff', 190],
  ['b_ssr1', 'band', 'SSR', '豪腕の金バンド', '#ffcf3a', 40],
  ['a_n1', 'sleeve', 'N', '練習用スリーブ', '#e8e8e8', 0], ['a_n2', 'sleeve', 'N', '黒のスリーブ', '#222222', 0],
  ['a_r1', 'sleeve', 'R', '制球スリーブ 緑', '#2f8a4a', 120], ['a_r2', 'sleeve', 'R', '制球スリーブ 紺', '#1f3570', 220],
  ['a_sr1', 'sleeve', 'SR', '精密スリーブ 銀', '#c0c8d4', 0], ['a_sr2', 'sleeve', 'SR', '星のスリーブ', '#2a2a6a', 240],
  ['a_ssr1', 'sleeve', 'SSR', '必中のスリーブ', '#ffd23a', 40],
].map(([id, slot, rar, name, col, hue]) => ({ id, slot, rar, name, col, hue }));
export const BY_ID = Object.fromEntries(ITEMS.map((x) => [x.id, x]));
const inRar = (r) => ITEMS.filter((x) => x.rar === r);
// 1 つあたりの確率(表に出す数。合計 100%)
export function rateTable() {
  const one = {}, ten = {};
  for (const r of RAR_KEYS) { const L = inRar(r); for (const x of L) { one[x.id] = RAR[r].p / L.length; ten[x.id] = (TEN_SR[r] || 0) / L.length; } }
  return { one, ten };
}
export const bonusOf = (id, lv) => { const x = BY_ID[id]; if (!x) return 0; const R = RAR[x.rar], l = Math.max(1, Math.min(LV_MAX, lv || 1)); return Math.round((R.base + (R.max - R.base) * (l - 1) / (LV_MAX - 1)) * 2) / 2; };

// ------------------------------------------------------------ 保存
const fresh = () => ({ v: 1, own: {}, eq: { glove: null, spike: null, band: null, sleeve: null }, pt: 0, free: 0, pulls: 0, owed: [], grants: {}, hist: [], seen: 0 });
export function load() {
  try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && typeof j === 'object') { const d = fresh(); return { ...d, ...j, eq: { ...d.eq, ...(j.eq || {}) }, own: j.own || {}, grants: j.grants || {}, owed: Array.isArray(j.owed) ? j.owed : [] }; } } catch (e) { /* 新しく */ }
  return fresh();
}
export function save(S) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 残せなくても遊べる */ } try { window.dispatchEvent(new CustomEvent('bp:gear')); } catch (e) { /* */ } }
const off = () => { try { return /[?&]nogear=1/.test(location.search); } catch (e) { return false; } };

// 付けている道具の点(能力に足す)。{ reach, start, arm, aim }
export function bonus(S0) {
  const S = S0 || load(), out = { reach: 0, start: 0, arm: 0, aim: 0 };
  if (off()) return out;
  for (const k of SLOT_KEYS) { const id = S.eq[k], o = id && S.own[id]; if (o) out[SLOTS[k].eff] = bonusOf(id, o.lv); }
  return out;
}
// 付けている中で一番いい道具(ランキング・オンラインに出す 1 語「id:lv」)
export function bestTag(S0) {
  const S = S0 || load(); let best = null, bv = -1;
  for (const k of SLOT_KEYS) { const id = S.eq[k], o = id && S.own[id]; if (!o) continue; const v = RAR_KEYS.length - RAR_KEYS.indexOf(BY_ID[id].rar) + o.lv / 10; if (v > bv) { bv = v; best = `${id}:${o.lv}`; } }
  return best;
}
export const parseTag = (t) => { const m = /^([a-z0-9_]{1,12}):([1-5])$/.exec(String(t || '')); return m && BY_ID[m[1]] ? { id: m[1], lv: +m[2], item: BY_ID[m[1]] } : null; };

// ------------------------------------------------------------ 引く
function rnd() { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; } catch (e) { return Math.random(); } }
function pickRar(table) { let u = rnd(), acc = 0; for (const r of RAR_KEYS) { acc += table[r] || 0; if (u < acc) return r; } return 'N'; }
function draw1(sure) {
  const r = sure ? pickRar(TEN_SR) : pickRar(Object.fromEntries(RAR_KEYS.map((k) => [k, RAR[k].p])));
  const L = inRar(r); return L[Math.min(L.length - 1, Math.floor(rnd() * L.length))];
}
// 手に入れる(新しい・Lv が上がる・Lv5 の後は天井の点)。付けている物より強ければ付け替える
function gain(S, x) {
  const o = S.own[x.id]; let kind = 'new', pt = 0;
  if (!o) S.own[x.id] = { lv: 1, n: 1, t: Date.now() };
  else { o.n++; if (o.lv < LV_MAX) { o.lv++; kind = 'lvup'; } else { pt = RAR[x.rar].dupPt; S.pt += pt; kind = 'max'; } }
  const cur = S.eq[x.slot], cb = cur && S.own[cur] ? bonusOf(cur, S.own[cur].lv) : -1;
  let eq = false;
  if (bonusOf(x.id, S.own[x.id].lv) > cb) { S.eq[x.slot] = x.id; eq = true; }
  return { id: x.id, rar: x.rar, kind, lv: S.own[x.id].lv, pt, eq };
}
// n 回引く(10 回なら 10 回目は SR 以上)。src: 'free' | 'paid'
export function pull(n, src) {
  const S = load(), out = [];
  if (src === 'free') { if (S.free < n) return null; S.free -= n; }
  for (let i = 0; i < n; i++) { const x = draw1(n >= 10 && i === n - 1); out.push(gain(S, x)); S.pt += 1; S.pulls++; }
  S.hist = out.map((r) => ({ id: r.id, t: Date.now() })).concat(S.hist).slice(0, 30);
  save(S);
  return out;
}
// 天井: SSR を 1 つ選ぶ
export function exchange(id) {
  const S = load(), x = BY_ID[id]; if (!x || x.rar !== 'SSR' || S.pt < PITY) return null;
  S.pt -= PITY; const r = gain(S, x); r.pity = true; save(S); return r;
}
export function equip(slot, id) { const S = load(); if (!SLOTS[slot]) return; if (id && (!S.own[id] || BY_ID[id].slot !== slot)) return; S.eq[slot] = id || null; save(S); }
// 遊んでたまる無料の券(キャリアの節目。同じ節目は 1 回だけ)
export function grant(key, n) {
  const S = load(); if (S.grants[key]) return 0;
  S.grants[key] = Date.now(); S.free += n; save(S);
  return n;
}
// アプリの課金: 買った回数だけ、すぐ引く(引く前に落ちた時のために owed に残し、引いたら消す)
export function owe(n, tid) { const S = load(); if (tid && S.owed.some((o) => o.tid === tid)) return; S.owed.push({ n, tid: tid || String(Date.now()), t: Date.now() }); save(S); }
export function settleOwed() {
  const S = load(); if (!S.owed.length) return [];
  const all = [];
  for (const o of S.owed.slice()) { const r = pull(o.n, 'paid'); const S2 = load(); S2.owed = S2.owed.filter((x) => x.tid !== o.tid); save(S2); all.push(...r); }
  return all;
}

// ------------------------------------------------------------ 画面
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (v) => (v * 100 >= 10 ? (v * 100).toFixed(1) : (v * 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')) + '%';
const store = () => { try { return window.__bpStore && window.__bpStore.gacha ? window.__bpStore : null; } catch (e) { return null; } };
const noPrice = () => { try { return new URLSearchParams(location.search).has('noprice'); } catch (e) { return false; } };
export function iconHtml(id, lv, cls) {
  const x = BY_ID[id]; if (!x) return '';
  return `<i class="gcIc r${x.rar} s-${x.slot}${cls ? ' ' + cls : ''}" style="--gc:${x.col}"><i class="gcArt" style="background-image:url('img/gear/items/${x.id}.webp')"></i><em>${x.rar}</em>${lv ? `<b>Lv${lv}</b>` : ''}</i>`;
}
let el = null, busy = false, onClose = null, view = 'main', lastRes = null;
function root() {
  if (el) return el;
  el = document.createElement('div'); el.id = 'gcScreen'; el.className = 'gcScreen hide';
  document.body.appendChild(el);
  for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend', 'wheel', 'keydown']) el.addEventListener(ev, (e) => e.stopPropagation());
  el.addEventListener('click', onClick);
  return el;
}
export function open(opt = {}) {
  root(); onClose = opt.onClose || null; view = 'main';
  // 買ったのに引けていない分(前に落ちた時)
  const got = settleOwed();
  el.classList.remove('hide'); render();
  if (got.length) showResults(got, '前の購入の分を引きました');
  try { window.__app && window.__app.setOverlay && window.__app.setOverlay(true); } catch (e) { /* */ }
}
export function close() { if (!el) return; el.classList.add('hide'); el.innerHTML = ''; const f = onClose; onClose = null; if (f) try { f(); } catch (e) { /* */ } }
export const isOpen = () => !!el && !el.classList.contains('hide');
function slotsHtml(S) {
  const B = bonus(S);
  return `<div class="gcSlots">${SLOT_KEYS.map((k) => { const id = S.eq[k], o = id && S.own[id];
    return `<button class="gcSlot" data-slot="${k}">${id ? iconHtml(id, o.lv) : '<i class="gcIc empty"><i class="gcArt"></i></i>'}<span><b>${esc(SLOTS[k].name)}</b><small>${id ? esc(BY_ID[id].name) : 'なし'}</small><small class="gcEff">${esc(SLOTS[k].what)} ${B[SLOTS[k].eff] ? '+' + B[SLOTS[k].eff] : '±0'}</small></span></button>`; }).join('')}</div>`;
}
function render() {
  if (!el) return;
  const S = load(), st = store(), np = noPrice();
  const p1 = st && st.price('bp_gacha_1'), p10 = st && st.price('bp_gacha_10');
  const lab = (p) => (np ? '' : p ? ` <small>${esc(p)}</small>` : '');
  if (view === 'rates') { el.innerHTML = ratesHtml(); return; }
  if (view.startsWith('slot:')) { el.innerHTML = slotPick(view.slice(5), S); return; }
  if (view === 'pity') { el.innerHTML = pityHtml(S); return; }
  const owned = Object.keys(S.own).length;
  el.innerHTML = `<div class="gcSheet">
    <div class="gcTop"><button class="gcBack" data-act="close">戻る</button><h1>道具ガチャ</h1></div>
    <div class="gcHero"><div class="gcHeroArt"></div><div class="gcHeroTx"><b>守備の道具</b><small>グラブ・スパイク・リストバンド・アームスリーブ</small><small>付けると 守備のキャリアの動きが少し良くなります</small></div></div>
    <div class="gcRates"><span class="rSSR">SSR 3%</span><span class="rSR">SR 12%</span><span class="rR">R 33%</span><span class="rN">N 52%</span><button class="gcLink" data-act="rates">出る物と確率 ›</button></div>
    <div class="gcPulls">
      ${S.free > 0 ? `<button class="gcPull free" data-pull="free1"${busy ? ' disabled' : ''}>無料の券で 1 回<small>持っている券 ${S.free} 枚</small></button>` : ''}
      ${st ? `<button class="gcPull" data-pull="paid1"${busy || !p1 ? ' disabled' : ''}>1 回引く${lab(p1)}</button>
      <button class="gcPull ten" data-pull="paid10"${busy || !p10 ? ' disabled' : ''}>10 回引く${lab(p10)}<em>10 回目は SR 以上</em></button>` : ''}
      ${!st && S.free <= 0 ? '<p class="gcNote">無料の券は 守備のキャリアの 初めての試合・昇格・キャリア完了 で もらえます。</p>' : ''}
    </div>
    <div class="gcPity"><div class="gcBar"><i style="width:${Math.min(100, S.pt)}%"></i></div><span>天井 ${Math.min(S.pt, PITY)} / ${PITY}</span>${S.pt >= PITY ? '<button class="gcPull sm" data-act="pity">SSR を選ぶ</button>' : `<small>あと ${PITY - S.pt} 回で SSR を 1 つ選べます</small>`}</div>
    <h2 class="gcH">付けている道具 <small>集めた ${owned} / ${ITEMS.length}</small></h2>
    ${slotsHtml(S)}
    <p class="gcNote">同じ道具が出ると Lv が上がります(Lv${LV_MAX} まで。その後は天井の点に)。道具の点は 能力に足して効き、上限は 1 つあたり +12 です。打球の読みと捕り方が一番効きます。</p>
    <p class="gcNote">${st ? '買った回数は その場で引きます(引く権利を持ち越しません)。' : ''}全部そろえても特別な物はもらえません。</p>
    <div class="gcRes hide"></div>
  </div>`;
}
function ratesHtml() {
  const { one, ten } = rateTable();
  const rows = (tbl, keys) => keys.map((r) => `<tr class="h"><th colspan="3">${r} 合計 ${pct(inRar(r).reduce((s, x) => s + tbl[x.id], 0))}</th></tr>${inRar(r).map((x) => `<tr><td>${iconHtml(x.id, 0, 'sm')}</td><td>${esc(x.name)}<small>${esc(SLOTS[x.slot].name)} ・ ${esc(SLOTS[x.slot].what)} +${bonusOf(x.id, 1)}〜+${bonusOf(x.id, LV_MAX)}</small></td><td class="p">${pct(tbl[x.id])}</td></tr>`).join('')}`).join('');
  return `<div class="gcSheet"><div class="gcTop"><button class="gcBack" data-act="main">戻る</button><h1>出る物と確率</h1></div>
    <p class="gcNote">1 回ずつ・10 回の 1〜9 回目は 左の表、10 回の 10 回目は 右の表(SR 以上)で決まります。</p>
    <div class="gcTbls"><table class="gcT"><caption>1 回ごと</caption>${rows(one, RAR_KEYS)}</table><table class="gcT"><caption>10 回目(SR 以上)</caption>${rows(ten, ['SSR', 'SR'])}</table></div>
    <p class="gcNote">天井: 1 回引くごとに 1 点。${PITY} 点で SSR を 1 つ選べます。同じ道具は Lv${LV_MAX} まで上がり、その後は天井の点(N 1・R 2・SR 5・SSR 20)になります。</p></div>`;
}
function pityHtml(S) {
  return `<div class="gcSheet"><div class="gcTop"><button class="gcBack" data-act="main">戻る</button><h1>SSR を選ぶ</h1></div><p class="gcNote">天井 ${S.pt} 点のうち ${PITY} 点を使います。</p>
    <div class="gcPick">${inRar('SSR').map((x) => `<button class="gcPickB" data-pity="${x.id}">${iconHtml(x.id, S.own[x.id] ? S.own[x.id].lv : 0)}<span><b>${esc(x.name)}</b><small>${esc(SLOTS[x.slot].name)} ・ ${esc(SLOTS[x.slot].what)}</small></span></button>`).join('')}</div></div>`;
}
function slotPick(slot, S) {
  const L = ITEMS.filter((x) => x.slot === slot && S.own[x.id]).sort((a, b) => bonusOf(b.id, S.own[b.id].lv) - bonusOf(a.id, S.own[a.id].lv));
  return `<div class="gcSheet"><div class="gcTop"><button class="gcBack" data-act="main">戻る</button><h1>${esc(SLOTS[slot].name)}</h1></div>
    <p class="gcNote">${esc(SLOTS[slot].what)} に効きます。</p>
    <div class="gcPick">${L.map((x) => `<button class="gcPickB${S.eq[slot] === x.id ? ' on' : ''}" data-eq="${slot}:${x.id}">${iconHtml(x.id, S.own[x.id].lv)}<span><b>${esc(x.name)}</b><small>+${bonusOf(x.id, S.own[x.id].lv)}</small></span></button>`).join('')}
    <button class="gcPickB${S.eq[slot] ? '' : ' on'}" data-eq="${slot}:">${'<i class="gcIc empty"><i class="gcArt"></i></i>'}<span><b>付けない</b><small>±0</small></span></button></div>
    ${L.length ? '' : '<p class="gcNote">まだ持っていません。</p>'}</div>`;
}
// 演出: 引いた数だけ札が出る(レア度の色で光る)。押すと飛ばせる。短く: 1 回 0.9 秒・10 回 2.2 秒ほど
function showResults(res, head) {
  lastRes = res;
  const box = el.querySelector('.gcRes'); if (!box) return;
  const best = res.reduce((b, r) => Math.min(b, RAR_KEYS.indexOf(r.rar)), 9), top = RAR_KEYS[best] || 'N';
  box.className = `gcRes play t${top}`;
  box.innerHTML = `<div class="gcResIn"><div class="gcFlash"></div><h2>${esc(head || (res.length > 1 ? `${res.length} 回の結果` : '結果'))}</h2>
    <div class="gcCards n${res.length}">${res.map((r, i) => `<div class="gcCard r${r.rar}" style="--d:${(res.length > 1 ? 0.55 + i * 0.13 : 0.45).toFixed(2)}s">${iconHtml(r.id, r.lv)}<b>${esc(BY_ID[r.id].name)}</b><small>${r.kind === 'new' ? '<i class="nw">NEW</i>' : r.kind === 'lvup' ? `Lv${r.lv} に` : `天井 +${r.pt}`}${r.eq ? ' ・ 付けた' : ''}</small></div>`).join('')}</div>
    <button class="gcOk" data-act="resok">OK</button><button class="gcSkip" data-act="skip">飛ばす</button></div>`;
  const sound = window.__app && window.__app.sound;
  try { if (sound && sound.crowdEvent && (top === 'SSR' || top === 'SR')) setTimeout(() => sound.crowdEvent('fine', top === 'SSR' ? 1 : 0.6), res.length > 1 ? 1500 : 500); } catch (e) { /* 音なし */ }
}
async function doPull(kind) {
  if (busy) return;
  if (kind === 'free1') { const r = pull(1, 'free'); if (r) { render(); showResults(r); } return; }
  const st = store(); if (!st) return;
  busy = true; render();
  let ok = false, msg = '';
  try { const a = await st.buyGacha(kind === 'paid10' ? 'bp_gacha_10' : 'bp_gacha_1'); ok = !!(a && a.ok); msg = (a && a.msg) || ''; } catch (e) { msg = '購入できませんでした'; }
  busy = false; render();
  if (ok) { const got = settleOwed(); render(); if (got.length) showResults(got); }
  else if (msg) { const n = el.querySelector('.gcNote'); if (n) n.textContent = msg; }
}
function onClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'close') return close();
  if (a === 'main') { view = 'main'; return render(); }
  if (a === 'rates') { view = 'rates'; return render(); }
  if (a === 'pity') { view = 'pity'; return render(); }
  if (a === 'skip') { const box = el.querySelector('.gcRes'); if (box) box.classList.add('skip'); return; }
  if (a === 'resok') { const box = el.querySelector('.gcRes'); if (box) box.className = 'gcRes hide'; return; }
  if (b.dataset.pull) return doPull(b.dataset.pull);
  if (b.dataset.slot) { view = 'slot:' + b.dataset.slot; return render(); }
  if (b.dataset.eq != null) { const [s, id] = b.dataset.eq.split(':'); equip(s, id); view = 'main'; return render(); }
  if (b.dataset.pity) { const r = exchange(b.dataset.pity); view = 'main'; render(); if (r) showResults([r], '天井で選びました'); }
}
window.addEventListener('keydown', (e) => { if (isOpen() && e.key === 'Escape') { e.stopPropagation(); close(); } }, true);
try { window.__bpGear = { open, close, isOpen, load, save, pull, exchange, equip, grant, owe, settleOwed, bonus, bestTag, parseTag, rateTable, ITEMS, BY_ID, SLOTS, RAR, iconHtml, bonusOf, PITY }; } catch (e) { /* */ }
