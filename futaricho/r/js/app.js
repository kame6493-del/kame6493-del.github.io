// フタリチョウ 画面。素の JS。計算は calc.js、保存は store.js、購入は purchase.js、絵は card.js。
// 決まり: 大事なボタンは画面の下半分。記録は「＋ → 金額 → カテゴリ」の3タップ。言葉は相手を責めない言い方にそろえる。
import * as C from './calc.js';
import { loadLocal, saveLocal, savePrefs, newerFromPrefs } from './store.js';
import { createPurchase } from './purchase.js';
import { I, catIcon, catArt } from './icons.js';
import { settleCard, monthCard } from './card.js';
import { shareCanvas, shareText } from './share.js';

const cap = window.Capacitor;
const CFG = window.FUTARICHO_CONFIG || {};
const $ = s => document.querySelector(s);
const screen = $('#screen'), sheet = $('#sheet'), sheetIn = sheet.querySelector('.sheet-in'), toastEl = $('#toast'), tabsEl = $('#tabs'), fabEl = $('#fab'), coachEl = $('#coach');
const boot = Date.now();
// 画面写真のための日付の固定(tools/shoot.py だけが使う。機能の解放ではない)
const NOW = () => (window.__ftToday ? Date.parse(window.__ftToday + 'T12:00:00') + (Date.now() - boot) : Date.now());
const today = () => C.ymd(NOW());
function safeLs() { try { return window.localStorage; } catch (e) { return null; } }
let st = loadLocal(safeLs()).st;
const buy = createPurchase({ config: CFG });
const ui = { view: '', ym: null, inp: null, sheet: null, newId: null, recFilter: 'all', catOpen: null, pendingImport: null, cam: null, settledNow: false, prevBal: null };

function save() { const json = saveLocal(safeLs(), st); savePrefs(cap, json); }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const comma = n => Math.round(n).toLocaleString('ja-JP');
const yenH = n => `<span class="yen">¥</span>${comma(n)}`;
const other = r => (r === 'a' ? 'b' : 'a');
const full = () => !!(buy.owned || (st.book && st.book.full));
const N = r => esc(st.book.names[r]);
const dot = (r, cls = '') => `<span class="dot ${cls} c${r}">${esc((st.book.names[r] || '?').slice(0, 1))}</span>`;
const short = () => innerHeight < 700;
function haptic(kind = 'LIGHT') { try { const H = cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins.Haptics; if (H) H.impact({ style: kind }); else if (navigator.vibrate) navigator.vibrate(kind === 'LIGHT' ? 8 : 18); } catch (e) { /* なし */ } }
const SND = {};
function sound(name) { if (!st.prefs.sound) return; try { const a = SND[name] || (SND[name] = new Audio('snd/' + name + '.mp3')); a.volume = name === 'settle' ? .5 : .38; a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 音なし */ } }
const art = (name, cls = '') => `<img class="${cls}" src="img/${name}.png" alt="" draggable="false" onerror="this.style.display='none'">`;
const jaDate = d => { const [y, m, dd] = d.split('-').map(Number); return `${m}/${dd}`; };
const jaDateW = d => { const [y, m, dd] = d.split('-').map(Number); const w = '日月火水木金土'[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]; return `${m}月${dd}日(${w})`; };
const ymLabel = ym => { const [y, m] = ym.split('-').map(Number); return (String(y) === today().slice(0, 4) ? '' : y + '年') + m + '月'; };
const SPLIT_LABEL = { half: '半分ずつ', all: '全部相手の分', none: '自分の分だけ', amount: '金額で指定', ratio: '割合' };
function splitText(e) { return e.split.t === 'ratio' ? `割合 ${e.split.v}:${100 - e.split.v}` : SPLIT_LABEL[e.split.t]; }

function cats() {
  const over = new Map(st.cats.filter(c => !c.del).map(c => [c.id, c]));
  const list = C.DEFAULT_CATS.map(c => ({ ...c, name: over.has(c.id) ? over.get(c.id).name : c.name, def: true }));
  st.cats.filter(c => !c.del && !C.DEFAULT_CATS.some(d => d.id === c.id)).forEach(c => list.push({ id: c.id, name: c.name, def: false }));
  return list;
}
const catName = id => (cats().find(c => c.id === id) || { name: 'その他' }).name;
const catIdx = id => Math.max(0, cats().findIndex(c => c.id === id));
const catColor = id => catArt(id, catIdx(id)).c;

function applyLook() {
  document.body.classList.toggle('big', !!st.prefs.big);
  document.body.classList.toggle('short', short());
  if (st.book) { document.body.style.setProperty('--ca', C.COLORS[st.book.colors.a] || C.COLORS[0]); document.body.style.setProperty('--cb', C.COLORS[st.book.colors.b] || C.COLORS[1]); }
}

/* ---------- 共通 ---------- */
const TABS = [['home', 'ホーム', I.home], ['records', '記録', I.list], ['month', 'まとめ', I.chart], ['share', 'ふたりで', I.pair], ['settings', '設定', I.gear]];
function render(html, view, { fab = false, keepScroll = false } = {}) {
  const y = screen.scrollTop;
  if (ui.view !== view) hideToast(); ui.view = view; screen.innerHTML = html; screen.scrollTop = keepScroll ? y : 0;
  const tab = TABS.some(t => t[0] === view);
  tabsEl.hidden = !tab; screen.classList.toggle('has-tabs', tab);
  if (tab) tabsEl.innerHTML = TABS.map(([k, l, ic]) => `<button data-act="tab" data-tab="${k}" class="${k === view ? 'on' : ''}" aria-label="${l}">${ic}${l}${k === 'share' && needsSend() ? '<i class="badge"></i>' : ''}</button>`).join('');
  fabEl.innerHTML = fab ? `<div class="fab-wrap"><button class="fab press" data-act="add">${I.plus}記録する</button></div>` : '';
  requestAnimationFrame(() => { fitAll(); coach(); });
}
function bar(title, back = 'home', right = '') {
  return `<div class="bar"><button class="iconbtn" data-act="tab" data-tab="${back}" aria-label="戻る">${I.back}</button><div class="title">${title}</div>${right || '<div class="spacer"></div>'}</div>`;
}
function openSheet(html, name, cls = '') {
  hideToast(); ui.sheet = name; sheetIn.className = 'sheet-in ' + cls; sheetIn.innerHTML = `<div class="grab"></div>` + html; sheet.hidden = false; sheetIn.scrollTop = 0;
  requestAnimationFrame(() => fitAll()); coachEl.hidden = true; setTimeout(coach, 340);
}
function closeSheet() { stopCam(); ui.sheet = null; ui.inp = null; sheet.hidden = true; sheetIn.innerHTML = ''; coach(); }
let toastTimer = 0, toastUndo = null;
function hideToast() { toastEl.hidden = true; toastUndo = null; clearTimeout(toastTimer); }
function toast(msg, undo, top = false) {
  toastUndo = undo || null;
  toastEl.className = top || ui.sheet ? 'top' : '';
  toastEl.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button data-act="undo">取り消す</button>' : ''}`;
  toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; toastUndo = null; }, undo ? 5000 : 2800);
}
function fit(el, max, min = 24) {
  if (!el) return; const box = el.parentElement; const cs = getComputedStyle(box);
  const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (parseFloat(el.dataset.room) || 0);
  let s = max; el.style.fontSize = s + 'px'; while (el.scrollWidth > avail && s > min) { s -= 2; el.style.fontSize = s + 'px'; }
}
function fitAll() { document.querySelectorAll('[data-fit]').forEach(el => fit(el, +el.dataset.fit)); }
function countUp(el, from, to, ms = 650) {
  if (!el || from === to) return; const t0 = performance.now();
  const step = t => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.innerHTML = yenH(Math.round(from + (to - from) * e)); if (k < 1) requestAnimationFrame(step); else fit(el, +el.dataset.fit); };
  requestAnimationFrame(step);
}
function confetti() {
  const box = document.createElement('div'); box.className = 'confetti';
  const cols = [getComputedStyle(document.body).getPropertyValue('--ca'), getComputedStyle(document.body).getPropertyValue('--cb'), '#3BA57E', '#F2C14E'];
  for (let i = 0; i < 36; i++) { const p = document.createElement('i'); p.style.left = Math.random() * 100 + '%'; p.style.background = cols[i % 4]; p.style.animationDelay = (Math.random() * .4) + 's'; p.style.animationDuration = (1.2 + Math.random() * .8) + 's'; box.appendChild(p); }
  $('#app').appendChild(box); setTimeout(() => box.remove(), 2600);
}
function unsentCount() { return st.entries.filter(e => (e.upd || 0) > (st.sync.sentAt || 0) && (e.by === st.book.me || !e.by)).length + st.settles.filter(s => (s.upd || 0) > (st.sync.sentAt || 0) && s.by === st.book.me).length; }
function needsSend() { return st.book && unsentCount() > 0 && (st.entries.length > 0); }

/* ---------- はじめ(チュートリアル) ---------- */
function vIntro() {
  render(`<div class="page intro">
    <div>${art('welcome', 'art')}
      <h1>ふたりの立て替えを、<br>月末に1行で精算</h1>
      <p class="lead">払ったら3タップで記録。<br>どっちからどっちへいくらかが、すぐ分かります。</p>
      <div class="pts">
        <div class="pt"><span class="ci" style="background:var(--ca)">${I.plus}</span><div><b>片手で3タップ</b><span>＋ → 金額 → カテゴリで記録</span></div></div>
        <div class="pt"><span class="ci" style="background:var(--cb)">${I.people}</span><div><b>登録なしで相手と共有</b><span>メッセージで送る・となりなら QR</span></div></div>
        <div class="pt"><span class="ci" style="background:var(--ok)">${I.check}</span><div><b>精算がずれない</b><span>精算したら0に。ふたりの数字がそろう</span></div></div>
      </div>
    </div>
    <div class="mt20"><button class="btn main press" data-act="intro-start">はじめる</button>
      <button class="btn ghost mt8" data-act="intro-recv">相手から届いた記録で始める</button></div>
  </div>`, 'intro');
}
function vNames() {
  const d = ui.names || (ui.names = { me: '', pa: '', cm: 0, cp: 1 });
  const cols = (k, sel) => `<div class="colors">${C.COLORS.map((c, i) => `<button class="${i === sel ? 'on' : ''}" style="background:${c}" data-act="pick-color" data-k="${k}" data-i="${i}" aria-label="色${i + 1}"></button>`).join('')}</div>`;
  render(`<div class="page">
    ${bar('', 'intro')}
    <h1 style="font-size:calc(var(--fs) + 8px)">ふたりの呼び名</h1>
    <p class="sub mt8" style="line-height:1.6">画面と、相手に送る記録に出ます。あとで変えられます。</p>
    <label class="field"><span>あなた</span><input id="nmMe" maxlength="12" placeholder="例 ゆい" value="${esc(d.me)}" autocomplete="off"></label>
    ${cols('cm', d.cm)}
    <label class="field mt20"><span>相手</span><input id="nmPa" maxlength="12" placeholder="例 けん" value="${esc(d.pa)}" autocomplete="off"></label>
    ${cols('cp', d.cp)}
    <div class="grow"></div>
    <button class="btn main press mt24" data-act="names-ok">これで始める</button>
  </div>`, 'names');
}

/* ---------- ホーム ---------- */
function syncChip() {
  if (!st.book.shared && !st.sync.sentAt) return `<button class="sync-chip press" data-act="tab" data-tab="share">${I.send}相手に送る</button>`;
  const n = unsentCount();
  if (n) return `<button class="sync-chip warn press" data-act="tab" data-tab="share">${I.send}未送信 ${n}件</button>`;
  const m = st.sync.match;
  if (m && m.r === 'ok') return `<button class="sync-chip ok press" data-act="tab" data-tab="share">${I.check}一致 ${jaDate(C.ymd(m.at))}</button>`;
  if (m && m.r === 'mine-more') return `<button class="sync-chip warn press" data-act="tab" data-tab="share">${I.send}送り返す</button>`;
  return `<button class="sync-chip press" data-act="tab" data-tab="share">${I.send}送った ${jaDate(C.ymd(st.sync.sentAt || NOW()))}</button>`;
}
function balCard(b, animateFrom) {
  const d = C.direction(b);
  if (!d.amount) {
    const last = C.liveSettles(st).slice(-1)[0];
    return `<button class="card bal even press" data-act="go-settle" style="width:100%;text-align:left">
      ${art('settled', 'even-art')}
      <div class="lbl">いまのふたり</div>
      <div class="amt">おあいこです</div>
      <div class="say">${last ? `${jaDate(last.date)} に精算しました` : 'まだ差はありません。払ったら記録しましょう'}</div>
    </button>`;
  }
  return `<button class="card bal press" data-act="go-settle" style="width:100%;text-align:left">
    <div class="lbl">いまの差</div>
    <div class="flow">${dot(d.from)}<span class="b">${N(d.from)}</span><span class="arrow"></span>${dot(d.to)}<span class="b">${N(d.to)}</span></div>
    <div class="amt num" data-fit="46" id="balAmt">${yenH(animateFrom != null ? Math.abs(animateFrom) : d.amount)}</div>
    <div class="say">精算すると、<b>${N(d.from)}さん</b>から<b>${N(d.to)}さん</b>へ</div>
    <span class="go">精算する${I.chev}</span>
  </button>`;
}
function pairMonth(sum) {
  const tot = sum.paid.a + sum.paid.b;
  const pa = tot ? sum.paid.a / tot * 100 : 50;
  const more = sum.tatekae.a > 0 ? 'a' : sum.tatekae.b > 0 ? 'b' : null;
  const note = !tot ? 'ふたりで使ったお金を入れると、ここに出ます' : more ? `今月は<b>${N(more)}さん</b>が多めに立て替え(${yenH(sum.tatekae[more])})` : '今月の立て替えは、ちょうど半分ずつです';
  return `<div class="card pad mt12">
    <div style="display:flex;justify-content:space-between;align-items:baseline"><b>今月ふたりで使ったお金</b><span class="num b">${yenH(sum.total)}</span></div>
    <div class="fat-bar mt12">${tot ? `<i class="ca" style="width:${Math.max(pa, 0)}%"><span>${pa >= 36 && pa <= 64 ? `${N('a')} ${yenH(sum.paid.a)}` : ''}</span></i><i class="cb" style="width:${100 - pa}%"><span>${pa >= 36 && pa <= 64 ? `${N('b')} ${yenH(sum.paid.b)}` : ''}</span></i>` : ''}</div>
    ${!tot || pa < 36 || pa > 64 ? `<div class="pairline"><span class="who">${dot('a', 's')}${N('a')} <b>${yenH(sum.paid.a)}</b></span><span class="who"><b>${yenH(sum.paid.b)}</b> ${N('b')}${dot('b', 's')}</span></div>` : ''}
    <div class="note">${note}</div>
  </div>`;
}
function rowEntry(e) {
  const o = C.owedBy(e), q = other(e.payer);
  const sub = e.split.t === 'none' ? `${N(e.payer)}の分だけ` : `${N(q)}の分 ${yenH(o)}`;
  return `<button class="rowi press ${ui.newId === e.id ? 'new' : ''}" data-act="edit" data-id="${e.id}">
    ${catIcon(e.cat, catIdx(e.cat))}
    <div class="mid"><div class="t1">${esc(e.memo || catName(e.cat))}</div><div class="t2"><span class="dot c${e.payer}"></span>${N(e.payer)}が払った · ${splitText(e)}</div></div>
    <div class="rt"><div class="a1">${yenH(e.amount)}</div><div class="a2">${sub}</div></div></button>`;
}
function rowSettle(s) {
  return `<button class="rowi settle press" data-act="go-settle">
    ${catIcon('settle')}
    <div class="mid"><div class="t1">精算</div><div class="t2">${N(s.from)} → ${N(other(s.from))}</div></div>
    <div class="rt"><div class="a1">${yenH(s.amount)}</div><div class="a2">${jaDate(s.date)}</div></div></button>`;
}
function vHome() {
  C.applyFixed(st, NOW()) .length && save();
  const b = C.balance(st), ym = today().slice(0, 7);
  const sum = C.monthSummary(st, ym);
  const recent = C.liveEntries(st).sort((x, y) => (y.date > x.date ? 1 : y.date < x.date ? -1 : y.t - x.t)).slice(0, short() ? 2 : 3);
  const favs = st.favs.filter(f => !f.del);
  const from = ui.prevBal; ui.prevBal = null;
  render(`<div class="page tabbed" style="padding-bottom:${short() ? 150 : 160}px">
    <div class="home-top"><span class="brand">フタリチョウ</span><span class="m">${ymLabel(ym)}</span>${syncChip()}</div>
    ${balCard(b, from)}
    ${pairMonth(sum)}
    <div class="sec-h"><h3>いつもの</h3><button data-act="favs">整える</button></div>
    <div class="favs">${favs.map(f => `<button class="fav press" data-act="fav-use" data-id="${f.id}">${catIcon(f.cat, catIdx(f.cat))}<div><b>${esc(f.name || catName(f.cat))}</b><span>${yenH(f.amount)} · ${N(f.payer)}</span></div></button>`).join('')}
      <button class="fav add press" data-act="fav-new">${I.plus}${favs.length ? '' : 'よく使う支払いを登録'}</button></div>
    <div class="sec-h"><h3>最近の記録</h3>${recent.length ? '<button data-act="tab" data-tab="records">すべて見る</button>' : ''}</div>
    <div class="card rows">${recent.length ? recent.map(rowEntry).join('') : `<div class="empty">${art('empty')}<p>まだ記録がありません</p><p class="small mt4">下の「記録する」から入れてみましょう</p></div>`}</div>
  </div>`, 'home', { fab: true });
  if (from != null && from !== b) { const el = $('#balAmt'); const d = C.direction(b); if (el && d.amount && Math.sign(from) === Math.sign(b)) countUp(el, Math.abs(from), d.amount); else if (el) { el.innerHTML = yenH(d.amount); fit(el, 46); } }
  ui.newId = null;
}

/* ---------- 記録の入力(下から出る板) ---------- */
function openInput(mode = 'entry', id = null) {
  const me = st.book.me;
  if (mode === 'edit') {
    const e = st.entries.find(x => x.id === id); if (!e) return;
    ui.inp = { mode, id, v: String(e.amount), payer: e.payer, split: { ...e.split }, sv: e.split.t === 'amount' ? String(e.split.v) : '', tgt: 'amt', date: e.date, memo: e.memo || '', showMemo: !!e.memo, cat: e.cat };
  } else if (mode === 'fav-edit' || mode === 'fixed-edit') {
    const list = mode === 'fav-edit' ? st.favs : st.fixed; const f = list.find(x => x.id === id); if (!f) return;
    ui.inp = { mode, id, v: String(f.amount), payer: f.payer, split: { ...f.split }, sv: f.split.t === 'amount' ? String(f.split.v) : '', tgt: 'amt', date: today(), memo: f.name || '', showMemo: true, cat: f.cat, day: f.day || 27 };
  } else {
    // 払った人は自分、分け方は半分ずつ。前回の「全部相手の分」などが黙って引き継がれて間違えないように
    const sp = { t: 'half' };
    ui.inp = { mode, v: '', payer: me, split: sp, sv: '', tgt: 'amt', date: today(), memo: '', showMemo: mode !== 'entry', cat: mode === 'entry' ? null : 'rent', day: 27 };
  }
  openSheet(inputHtml(), 'input', 'full ' + (short() ? 'short' : ''));
}
function inputHtml() {
  const p = ui.inp; const amt = +p.v || 0;
  const titles = { entry: '記録する', edit: '記録を直す', fav: 'いつものを登録', 'fav-edit': 'いつものを直す', fixed: '毎月の固定費', 'fixed-edit': '固定費を直す' };
  const saveOnCat = p.mode === 'entry';
  const chips = ['half', 'all', 'none', 'amount', 'ratio'].map(t => `<button class="chip ${p.split.t === t ? 'on' : ''}" data-act="in-split" data-t="${t}">${t === 'ratio' && !full() ? I.lock : ''}${t === 'ratio' && p.split.t === 'ratio' ? `割合 ${p.split.v}:${100 - p.split.v}` : SPLIT_LABEL[t]}</button>`).join('');
  const isT = p.date === today(), yd = C.ymd(NOW() - 864e5), isY = p.date === yd;
  const dateRow = p.mode === 'fixed' || p.mode === 'fixed-edit'
    ? `<div class="in-row"><span class="lb">毎月</span><div class="chips">${[1, 5, 10, 15, 20, 25, 27, 31].map(d => `<button class="chip ${p.day === d ? 'on' : ''}" data-act="in-day" data-d="${d}">${d === 31 ? '月末' : d + '日'}</button>`).join('')}</div></div>`
    : p.mode === 'fav' || p.mode === 'fav-edit' || (short() && !p.showDate) ? '' : `<div class="in-row"><span class="lb">日付</span><div class="chips">
      <button class="chip ${isT ? 'on' : ''}" data-act="in-date" data-d="${today()}">今日</button>
      <button class="chip ${isY ? 'on' : ''}" data-act="in-date" data-d="${yd}">きのう</button>
      <label class="chip ${!isT && !isY ? 'on' : ''}" style="position:relative">${!isT && !isY ? jaDate(p.date) : 'ほかの日'}<input type="date" id="inDate" value="${p.date}" max="${today()}" style="position:absolute;inset:0;opacity:0"></label>
      ${p.showMemo ? '' : `<button class="chip" data-act="in-memo">${I.pen}メモ</button>`}</div></div>`;
  const nameRow = p.showMemo ? `<div class="in-row"><span class="lb">${p.mode === 'entry' || p.mode === 'edit' ? 'メモ' : '名前'}</span><input class="memo-in" id="inMemo" maxlength="${p.mode === 'entry' || p.mode === 'edit' ? 40 : 12}" placeholder="${p.mode === 'entry' || p.mode === 'edit' ? '例 スーパー' : '例 家賃'}" value="${esc(p.memo)}"></div>` : '';
  const ratioRow = p.split.t === 'ratio' && full() ? `<div class="in-row"><span class="lb">割合</span><div class="chips">${[70, 65, 60, 55, 45, 40, 35, 30].map(v => `<button class="chip ${p.split.v === v ? 'on' : ''}" data-act="in-ratio" data-v="${v}">${v}:${100 - v}</button>`).join('')}</div></div>` : '';
  const showSv = p.split.t === 'amount';
  const bottom = saveOnCat ? '' : `<div class="row2 mt12">${p.mode === 'edit' || p.mode === 'fav-edit' || p.mode === 'fixed-edit' ? `<button class="btn line press" data-act="in-del">${I.trash}消す</button>` : `<button class="btn ghost" data-act="close">やめる</button>`}<button class="btn main press" data-act="in-save" ${amt ? '' : 'disabled'}>${p.mode === 'edit' ? '保存' : '登録する'}</button></div>`;
  const topRight = short() && (p.mode === 'entry' || p.mode === 'edit') && !p.showDate ? `<div style="display:flex;gap:6px">${p.showMemo ? '' : `<button class="chip" data-act="in-memo">${I.pen}メモ</button>`}<button class="chip on" data-act="in-showdate">${isT ? '今日' : isY ? 'きのう' : jaDate(p.date)}</button></div>` : '<div class="spacer"></div>';
  return `<div class="sh-top"><button class="iconbtn" data-act="close" aria-label="閉じる">${I.close}</button><div class="title">${titles[p.mode]}</div>${topRight}</div>
    <button class="in-amt num ${amt ? '' : 'zero'} ${showSv && p.tgt === 'amt' ? '' : ''}" id="inAmt" data-act="in-tgt" data-t="amt" style="width:100%"><span class="yen">¥</span><span id="inAmtV">${comma(amt)}</span>${p.tgt === 'amt' ? '<span class="caret"></span>' : ''}</button>
    <div class="in-share" id="inShare">${shareLine()}</div>
    <div class="in-row"><span class="lb">払った</span><div class="payers">${['a', 'b'].map(r => `<button class="payer press p${r} ${p.payer === r ? 'on' : ''}" data-act="in-payer" data-r="${r}">${dot(r)}${N(r)}${r === st.book.me ? '' : ''}</button>`).join('')}</div></div>
    <div class="in-row"><span class="lb">分け方</span><div class="chips">${chips}</div></div>
    ${ratioRow}${dateRow}${nameRow}
    ${keypadHtml()}
    <div class="cat-h"><span>${saveOnCat ? 'カテゴリを押すと記録されます' : 'カテゴリ'}</span>${saveOnCat ? `<span class="dim">${I.check}</span>` : ''}</div>
    <div class="cats ${saveOnCat && !amt ? 'off' : ''}" id="inCats">${cats().map((c, i) => `<button class="cat press ${p.cat === c.id ? 'on' : ''}" data-act="in-cat" data-c="${c.id}">${catIcon(c.id, i)}<span>${esc(c.name)}</span></button>`).join('')}</div>
    ${bottom}`;
}
function keypadHtml() { const k = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0']; return `<div class="keypad">${k.map(x => `<button data-act="key" data-k="${x}">${x}</button>`).join('')}<button data-act="key" data-k="bs" aria-label="1文字消す">${I.bs}</button></div>`; }
function shareLine() {
  const p = ui.inp; const amt = +p.v || 0; const q = other(p.payer);
  if (p.split.t === 'amount') return `<button data-act="in-tgt" data-t="sv" style="color:inherit">${N(q)}の分 <b class="num" style="font-size:1.25em">${yenH(Math.min(+p.sv || 0, amt))}</b> ${p.tgt === 'sv' ? '<span class="caret" style="display:inline-block;height:16px;width:2px;background:var(--main);vertical-align:-2px"></span>' : `<span class="tca">${I.pen.replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px"')}</span>`}</button>`;
  if (!amt) return p.split.t === 'none' ? `${N(p.payer)}の分だけ(精算には入りません)` : '';
  const o = C.owedBy({ amount: amt, split: p.split.t === 'amount' ? { t: 'amount', v: +p.sv || 0 } : p.split });
  if (p.split.t === 'none') return `${N(p.payer)}の分だけ(精算には入りません)`;
  return `${N(q)}の分 <b>${yenH(o)}</b>${p.split.t === 'half' && amt % 2 ? ' <span class="dim">(1円は払った人が持ちます)</span>' : ''}`;
}
function refreshInput() {
  const p = ui.inp; if (!p) return; const amt = +p.v || 0;
  const v = $('#inAmtV'); if (v) v.textContent = comma(amt);
  const a = $('#inAmt'); if (a) { a.classList.toggle('zero', !amt); a.classList.remove('bump'); void a.offsetWidth; a.classList.add('bump'); }
  const s = $('#inShare'); if (s) s.innerHTML = shareLine();
  const cs = $('#inCats'); if (cs && p.mode === 'entry') { const was = cs.classList.contains('off'); cs.classList.toggle('off', !amt); if (was && amt) { cs.classList.add('ready'); } }
  const sv = sheetIn.querySelector('[data-act=in-save]'); if (sv) sv.disabled = !amt;
  coach();
}
function rerenderInput() { const y = sheetIn.scrollTop; const memo = $('#inMemo'); if (memo && ui.inp) ui.inp.memo = memo.value; sheetIn.innerHTML = '<div class="grab"></div>' + inputHtml(); sheetIn.scrollTop = y; coach(); }
function keyPress(k) {
  const p = ui.inp; if (!p) return; const f = p.tgt === 'sv' ? 'sv' : 'v';
  let v = p[f]; if (k === 'bs') v = v.slice(0, -1); else v = (v + k).replace(/^0+/, '');
  if (v.length > 8) { haptic('MEDIUM'); return; }
  p[f] = v; haptic(); refreshInput();
}
function commitInput(cat) {
  const p = ui.inp; const amount = +p.v || 0;
  const memoEl = $('#inMemo'); if (memoEl) p.memo = memoEl.value;
  if (!C.validAmount(amount)) { toast('先に金額を入れてください'); const kp = sheetIn.querySelector('.keypad'); kp && kp.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], 260); return; }
  const split = p.split.t === 'amount' ? { t: 'amount', v: Math.min(+p.sv || 0, amount) } : { ...p.split };
  const b0 = C.balance(st);
  if (p.mode === 'entry') {
    const e = C.addEntry(st, { amount, payer: p.payer, split, cat, memo: p.memo, date: p.date, now: NOW() });
    save(); closeSheet(); sound('save'); haptic('MEDIUM');
    ui.newId = e.id; ui.prevBal = b0;
    if (st.prefs.tutorial === 3) st.prefs.tutorial = 4, save();
    go('home');
    toast(`${C.yen(amount)} を記録しました`, () => { C.deleteEntry(st, e.id, NOW()); save(); go(ui.view); });
    return;
  }
  if (p.mode === 'edit') { C.editEntry(st, p.id, { amount, payer: p.payer, split, cat: p.cat, memo: p.memo, date: p.date }, NOW()); save(); closeSheet(); sound('save'); ui.prevBal = b0; go(ui.view); toast('直しました'); return; }
  if (p.mode === 'fav' || p.mode === 'fav-edit') {
    if (p.mode === 'fav-edit') { const f = st.favs.find(x => x.id === p.id); Object.assign(f, { name: C.clean(p.memo), amount, payer: p.payer, split, cat: p.cat || 'other', upd: NOW() }); }
    else if (!C.addFav(st, { name: p.memo, amount, payer: p.payer, split, cat: p.cat || 'other', now: NOW() })) { toast(`いつものは${C.MAX_FAVS}件までです`); return; }
    save(); closeSheet(); sound('save'); go(ui.view); toast('いつものに登録しました'); return;
  }
  if (p.mode === 'fixed' || p.mode === 'fixed-edit') {
    if (p.mode === 'fixed-edit') { const f = st.fixed.find(x => x.id === p.id); Object.assign(f, { name: C.clean(p.memo), amount, payer: p.payer, split, cat: p.cat || 'rent', day: p.day, upd: NOW() }); }
    else st.fixed.push({ id: C.rid(Math.random, 8), name: C.clean(p.memo) || catName(p.cat || 'rent'), day: p.day, amount, payer: p.payer, split, cat: p.cat || 'rent', from: today().slice(0, 7), upd: NOW(), by: st.book.me });
    const made = C.applyFixed(st, NOW()); save(); closeSheet(); sound('save'); go('fixed'); toast(made.length ? `今月の分を${made.length}件記録しました` : `毎月${p.day === 31 ? '月末' : p.day + '日'}に記録します`); return;
  }
}

/* ---------- 記録の一覧 ---------- */
function monthsList() { const ms = C.months(st, NOW()); return ms; }
function monthSw(view) {
  const ms = monthsList(); const ym = ui.ym || today().slice(0, 7); const i = ms.indexOf(ym);
  return `<div class="mon-sw"><button class="iconbtn" data-act="ym" data-d="1" ${i >= ms.length - 1 ? 'disabled' : ''} aria-label="前の月">${I.left}</button><div class="m">${ymLabel(ym)}</div><button class="iconbtn" data-act="ym" data-d="-1" ${i <= 0 ? 'disabled' : ''} aria-label="次の月">${I.right}</button></div>`;
}
function vRecords() {
  const ym = ui.ym || (ui.ym = today().slice(0, 7));
  const f = ui.recFilter;
  const es = C.liveEntries(st).filter(e => e.date.slice(0, 7) === ym && (f === 'all' || e.payer === f));
  const ss = f === 'all' ? C.liveSettles(st).filter(s => s.date.slice(0, 7) === ym) : [];
  const items = [...es.map(e => ({ k: 'e', d: e.date, t: e.t, e })), ...ss.map(s => ({ k: 's', d: s.date, t: s.at, s }))].sort((x, y) => (y.d > x.d ? 1 : y.d < x.d ? -1 : y.t - x.t));
  const total = es.filter(e => e.split.t !== 'none').reduce((a, e) => a + e.amount, 0);
  let html = '', cur = null, group = [];
  const flush = () => { if (!group.length) return; const dayTot = group.filter(x => x.k === 'e' && x.e.split.t !== 'none').reduce((a, x) => a + x.e.amount, 0); html += `<div class="datehead"><span>${jaDateW(cur)}</span><em>${dayTot ? yenH(dayTot) : ''}</em></div><div class="card rows">${group.map(x => (x.k === 'e' ? rowEntry(x.e) : rowSettle(x.s))).join('')}</div>`; group = []; };
  for (const it of items) { if (it.d !== cur) { flush(); cur = it.d; } group.push(it); }
  flush();
  render(`<div class="page tabbed" style="padding-bottom:150px">
    <div class="bar"><h1>記録</h1><div class="spacer"></div></div>
    ${monthSw('records')}
    <div class="seg"><button class="${f === 'all' ? 'on' : ''}" data-act="rec-f" data-f="all">すべて</button><button class="${f === 'a' ? 'on' : ''}" data-act="rec-f" data-f="a">${N('a')}が払った</button><button class="${f === 'b' ? 'on' : ''}" data-act="rec-f" data-f="b">${N('b')}が払った</button></div>
    <p class="sub small mt12" style="margin-left:6px">${es.length}件 · ふたりの分 ${yenH(total)}</p>
    ${html || `<div class="card empty mt12">${art('empty')}<p>この月の記録はありません</p></div>`}
  </div>`, 'records', { fab: true });
}

/* ---------- 2人の残高と精算 ---------- */
function sinceLast() {
  const ls = C.liveSettles(st); const lastAt = ls.length ? ls[ls.length - 1].at : -Infinity;
  const es = C.liveEntries(st).filter(e => e.t > lastAt && e.split.t !== 'none');
  const paid = { a: 0, b: 0 }, share = { a: 0, b: 0 };
  for (const e of es) { const o = C.owedBy(e); paid[e.payer] += e.amount; share[e.payer] += e.amount - o; share[other(e.payer)] += o; }
  return { es, paid, share, last: ls[ls.length - 1] || null };
}
function vSettle() {
  const b = C.balance(st), d = C.direction(b), sl = sinceLast();
  const hist = C.liveSettles(st).slice().reverse().slice(0, 6);
  const histHtml = hist.length ? `<div class="sec-h"><h3>精算の記録</h3></div><div class="card rows">${hist.map(s => `<div class="rowi">${catIcon('settle')}<div class="mid"><div class="t1">${N(s.from)} → ${N(other(s.from))}</div><div class="t2">${jaDateW(s.date)}</div></div><div class="rt"><div class="a1">${yenH(s.amount)}</div><button class="a2" style="color:var(--main);font-weight:700" data-act="settle-undo" data-id="${s.id}">取り消す</button></div></div>`).join('')}</div>` : '';
  const bd = `<div class="card bd mt12">
    <span class="h">${sl.last ? `前回 ${jaDate(sl.last.date)} の精算から ${sl.es.length}件` : `これまでの ${sl.es.length}件`}</span><span class="h">払った</span><span class="h">それぞれの分</span>
    ${['a', 'b'].map(r => `<span class="who">${dot(r, 's')}${N(r)}</span><span class="n">${yenH(sl.paid[r])}</span><span class="n">${yenH(sl.share[r])}</span>`).join('')}
    <span class="line"></span>
    <span class="who tot">ふたりの分</span><span class="n tot">${yenH(sl.paid.a + sl.paid.b)}</span><span class="n tot">${yenH(sl.share.a + sl.share.b)}</span>
    ${d.amount ? `<div class="diff-row"><span>差額(精算する額)</span><span><b class="num">${yenH(d.amount)}</b><small>${N(d.from)} → ${N(d.to)}</small></span></div>` : ''}
  </div>
  <p class="tiny dim mt8" style="margin:8px 6px 0;line-height:1.6">差 = 払った額 − それぞれの分。半分ずつの1円の端数は、払った人が持ちます。</p>`;
  if (!d.amount) {
    render(`<div class="page" style="padding-bottom:28px">
      ${bar('精算', 'home')}
      <div class="card settled">${ui.settledNow ? `<div class="check-ring">${I.check}</div>` : art('settled')}
        <h2>${ui.settledNow ? 'おあいこになりました' : 'いまは、おあいこです'}</h2>
        <p class="sub mt8" style="line-height:1.6">${ui.settledNow ? '相手の端末にも精算を届けると、ふたりの数字がそろいます。' : sl.last ? `${jaDateW(sl.last.date)} に ${N(sl.last.from)}さんから ${N(other(sl.last.from))}さんへ ${yenH(sl.last.amount)}` : 'まだ精算する差はありません。'}</p>
      </div>
      ${ui.settledNow ? `<button class="btn main press mt16" data-act="send">${I.send}相手にも届ける</button><div class="row2 mt8"><button class="btn line press" data-act="settle-img">${I.image}画像で送る</button><button class="btn line press" data-act="settle-txt">${I.text}文で送る</button></div>` : ''}
      ${histHtml}
    </div>`, 'settle');
    ui.settledNow = false; return;
  }
  render(`<div class="page" style="padding-bottom:28px">
    ${bar('精算', 'home')}
    <div class="card st-hero">
      <div class="st-flow"><div class="who">${dot(d.from, 'xl')}<span>${N(d.from)}</span></div>
        <div class="mid"><svg viewBox="0 0 120 54" fill="none"><path d="M4 27h104" stroke="#CBD7EA" stroke-width="3" stroke-dasharray="6 6" stroke-linecap="round"/><path d="M104 19l10 8-10 8" stroke="#CBD7EA" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="coin"></span></div>
        <div class="who">${dot(d.to, 'xl')}<span>${N(d.to)}</span></div></div>
      <div class="st-amt num" data-fit="50">${yenH(d.amount)}</div>
      <p class="st-say">精算すると、<b>${N(d.from)}さん</b>から<b>${N(d.to)}さん</b>へ</p>
    </div>
    ${bd}
    <div class="row2 mt16"><button class="btn line press" data-act="settle-img">${I.image}画像で送る</button><button class="btn line press" data-act="settle-txt">${I.text}文で送る</button></div>
    <button class="btn ghost mt4" data-act="settle-part">一部だけ精算する</button>
    ${histHtml}
    <div class="stick"><button class="btn ok press" data-act="settle-ask">${I.check}精算した</button></div>
  </div>`, 'settle');
}
function askSettle(partAmount) {
  const d = C.direction(C.balance(st)); const amt = partAmount || d.amount;
  openSheet(`<div class="center" style="padding:6px 4px 4px">
    <div class="st-flow mt8">${dot(d.from, 'l')}<div class="mid" style="max-width:90px;height:40px"><svg viewBox="0 0 120 54" fill="none"><path d="M4 27h104" stroke="#CBD7EA" stroke-width="3" stroke-dasharray="6 6"/><path d="M104 19l10 8-10 8" stroke="#CBD7EA" stroke-width="3" stroke-linecap="round"/></svg></div>${dot(d.to, 'l')}</div>
    <h2 class="mt16" style="font-size:calc(var(--fs) + 3px);line-height:1.5">${N(d.from)}さんから ${N(d.to)}さんへ<br><span class="num" style="font-size:1.5em">${yenH(amt)}</span></h2>
    <p class="sub mt8">渡し終わったら「精算した」を押します。<br>押すと、差が${partAmount ? '少なくなります' : ' 0 に戻ります'}。記録はそのまま残ります。</p>
    <button class="btn ok press mt20" data-act="settle-do" data-amt="${partAmount || ''}">${I.check}精算した</button>
    <button class="btn ghost mt4" data-act="close">まだ</button></div>`, 'settle-ask');
}
function doSettle(part) {
  const s = C.settle(st, { now: NOW(), amount: part || undefined }); if (!s) return;
  save(); closeSheet(); sound('settle'); haptic('HEAVY'); confetti(); const even = C.balance(st) === 0; ui.settledNow = even; go('settle');
  if (!even) toast(`${C.yen(s.amount)} を精算しました`);
}
function partSettle() {
  ui.inp = { mode: 'part', v: '', tgt: 'amt' };
  const d = C.direction(C.balance(st));
  openSheet(`<div class="sh-top"><button class="iconbtn" data-act="close">${I.close}</button><div class="title">一部だけ精算</div><div class="spacer"></div></div>
    <p class="sub center">いまの差 ${yenH(d.amount)} のうち、渡した額</p>
    <button class="in-amt num zero" id="inAmt" style="width:100%"><span class="yen">¥</span><span id="inAmtV">0</span><span class="caret"></span></button>
    ${keypadHtml()}<button class="btn ok press mt12" data-act="part-ok">${I.check}この額を精算した</button>`, 'part');
}

/* ---------- 月ごとのまとめ ---------- */
function donut(list, total) {
  const R = 52, L = 2 * Math.PI * R; let off = 0;
  const segs = list.map(x => { const len = total ? x.v / total * L : 0; const s = `<circle cx="66" cy="66" r="${R}" fill="none" stroke="${x.color}" stroke-width="20" stroke-dasharray="${Math.max(0, len - 2)} ${L}" stroke-dashoffset="${-off}"/>`; off += len; return s; }).join('');
  return `<div class="donut"><svg viewBox="0 0 132 132"><circle cx="66" cy="66" r="${R}" fill="none" stroke="#E4EAF3" stroke-width="20"/>${segs}</svg><div class="c"><div>${list.length}つの<br>カテゴリ<b>${yenH(total)}</b></div></div></div>`;
}
function vMonth() {
  const ym = ui.ym || (ui.ym = today().slice(0, 7));
  const sum = C.monthSummary(st, ym), prev = C.monthSummary(st, C.prevMonths(ym, 2)[0]);
  const cmp = C.pairCompare(st, ym, 6);
  const list = Object.entries(sum.cats).map(([id, v]) => ({ id, v, name: catName(id), color: catColor(id) })).sort((a, b) => b.v - a.v);
  const diff = sum.total - prev.total;
  const more = sum.tatekae.a > 0 ? 'a' : sum.tatekae.b > 0 ? 'b' : null;
  const tot = sum.total || 1;
  const bars = (vals) => `<div class="split-bar"><i class="ca" style="width:${vals.a / ((vals.a + vals.b) || 1) * 100}%"></i><i class="cb" style="width:${vals.b / ((vals.a + vals.b) || 1) * 100}%"></i></div><div class="vals"><span class="tca">${yenH(vals.a)}</span><span class="tcb">${yenH(vals.b)}</span></div>`;
  const maxT = Math.max(1, ...cmp.months.map(m => m.total));
  const trend = `<div class="card trend ${full() ? '' : 'lock'}"><div style="display:flex;justify-content:space-between;align-items:baseline;padding:0 4px"><b>6か月のくらべ</b><span class="tiny sub lg2"><i class="ca"></i>${N('a')}の分<i class="cb"></i>${N('b')}の分</span></div>
    <div class="cols">${cmp.months.map(m => `<div class="col" title="${m.ym}"><i class="cb" style="height:${m.share.b / maxT * 100}%"></i><i class="ca" style="height:${m.share.a / maxT * 100}%"></i></div>`).join('')}</div>
    <div class="lbls">${cmp.months.map(m => `<span>${+m.ym.slice(5)}月</span>`).join('')}</div>
    ${full() ? `<p class="tiny sub mt8" style="padding:0 4px">${cmp.months.filter(m => m.total).map(m => `${+m.ym.slice(5)}月 ${m.ratio.a}:${m.ratio.b}`).join(' / ') || 'まだ記録がありません'}</p>` : `<div class="veil2"><span class="b">${I.lock.replace('<svg', '<svg style="width:22px;height:22px;color:var(--main)"')}</span><span class="small b">ふたりの負担の割合を<br>月ごとにくらべられます</span><button class="btn main press" data-act="paywall" data-why="compare">完全版で見る</button></div>`}
  </div>`;
  const hint = !full() && C.liveSettles(st).length >= 2 && !st.prefs.hint2 ? `<div class="card hint mt12">${catIcon('rent')}<div><b class="small">毎月の家賃や光熱費を自動で</b><p class="tiny sub mt4">固定費にすると、毎月その日に記録されます</p><button class="small b mt4" style="color:var(--main)" data-act="paywall" data-why="fixed">見てみる</button></div><button class="x iconbtn" data-act="hint-x" aria-label="閉じる">${I.close}</button></div>` : '';
  render(`<div class="page tabbed" style="padding-bottom:110px">
    <div class="bar"><h1>まとめ</h1><div class="spacer"></div></div>
    ${monthSw('month')}
    <div class="card total"><div class="lbl">ふたりで使ったお金</div><div class="v num" data-fit="38">${yenH(sum.total)}</div>
      <div class="cmp">${sum.count}件${prev.total ? ` · 前の月より <span class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '+' : '−'}${yenH(Math.abs(diff))}</span>` : ''}${sum.settled ? ` · 精算 ${yenH(sum.settled)}` : ''}</div></div>
    <div class="card pair2 mt12"><div class="p2h"><b>ふたりのくらべ</b><span>払った額</span><span>負担した額</span></div>
      ${['a', 'b'].map(r => { const mx = Math.max(1, sum.paid.a, sum.paid.b, sum.share.a, sum.share.b); return `<div class="p2r"><span class="who">${dot(r, 's')}${N(r)}</span><div class="p2b c${r}"><i style="width:${sum.paid[r] / mx * 100}%"></i><span>${yenH(sum.paid[r])}</span></div><div class="p2b soft c${r}"><i style="width:${sum.share[r] / mx * 100}%"></i><span>${yenH(sum.share[r])}</span></div></div>`; }).join('')}
      <div class="note">${!sum.total ? 'この月の、ふたりの分の記録はまだありません' : more ? `今月は<b>${N(more)}さん</b>が多めに立て替え(${yenH(sum.tatekae[more])})。負担は ${N('a')} ${sum.ratio.a}% : ${N('b')} ${sum.ratio.b}%` : `立て替えは、ちょうど半分ずつ。負担は ${sum.ratio.a}% : ${sum.ratio.b}%`}</div>
      ${sum.own.a || sum.own.b ? `<p class="tiny sub mt8">それぞれの分だけの記録(精算に入れない): ${N('a')} ${yenH(sum.own.a)} · ${N('b')} ${yenH(sum.own.b)}</p>` : ''}
    </div>
    <div class="sec-h"><h3>カテゴリ</h3><button data-act="go-cats">くわしく</button></div>
    <div class="card">${list.length ? `<div class="donut-wrap">${donut(list, sum.total)}<div class="legend">${list.slice(0, 5).map(x => `<div class="l"><i style="background:${x.color}"></i><span>${esc(x.name)}</span><b>${Math.round(x.v / tot * 100)}%</b></div>`).join('')}${list.length > 5 ? `<div class="l dim"><i style="background:#CBD7EA"></i><span>ほか ${list.length - 5}つ</span></div>` : ''}</div></div>
      <div style="border-top:1px solid var(--line)">${list.map(x => { const c = cmp.cats[x.id] || { a: 0, b: 0 }; return `<button class="catrow press" data-act="go-cats" data-c="${x.id}">${catIcon(x.id, catIdx(x.id))}<div><div class="nm"><span>${esc(x.name)}</span><em>${N('a')} ${Math.round(c.a / (x.v || 1) * 100)}% · ${N('b')} ${Math.round(c.b / (x.v || 1) * 100)}%</em></div><div class="bar2"><i class="ca" style="width:${c.a / list[0].v * 100}%"></i><i class="cb" style="width:${c.b / list[0].v * 100}%"></i></div></div><div class="v">${yenH(x.v)}</div></button>`; }).join('')}</div>`
      : `<div class="empty">${art('empty')}<p>この月の記録はまだありません</p></div>`}</div>
    <p class="tiny dim mt8" style="margin-left:6px">帯の色は、そのカテゴリを払った人の内わけです</p>
    <div class="sec-h"><h3>くらべ</h3></div>
    ${trend}
    ${hint}
    <button class="btn line press mt16" data-act="month-img">${I.image}この月のまとめを画像で送る</button>
  </div>`, 'month');
}

/* ---------- カテゴリ ---------- */
function vCats() {
  const ym = ui.ym || today().slice(0, 7);
  const sum = C.monthSummary(st, ym);
  const all = cats();
  const counts = {}; for (const e of C.liveEntries(st)) if (e.date.slice(0, 7) === ym && e.split.t !== 'none') counts[e.cat] = (counts[e.cat] || 0) + 1;
  const max = Math.max(1, ...Object.values(sum.cats));
  const open = ui.catOpen;
  const rows = all.map((c, i) => {
    const v = sum.cats[c.id] || 0;
    const es = open === c.id ? C.liveEntries(st).filter(e => e.cat === c.id && e.date.slice(0, 7) === ym).sort((x, y) => (y.date > x.date ? 1 : -1)) : [];
    return `<button class="catrow press" data-act="cat-open" data-c="${c.id}">${catIcon(c.id, i)}<div><div class="nm"><span>${esc(c.name)}</span><em>${counts[c.id] || 0}件</em></div><div class="bar2"><i style="width:${v / max * 100}%;background:${catArt(c.id, i).c}"></i></div></div><div class="v">${yenH(v)}</div></button>
      ${open === c.id ? `<div style="background:var(--bg);margin:0 10px 10px;border-radius:16px">${es.length ? es.map(rowEntry).join('') : '<p class="small sub" style="padding:14px 16px">この月の記録はありません</p>'}
        <div style="display:flex;gap:8px;padding:8px 10px 10px"><button class="chip" data-act="cat-rename" data-c="${c.id}">${full() ? '' : I.lock}${I.pen}名前を変える</button></div></div>` : ''}`;
  }).join('');
  render(`<div class="page" style="padding-bottom:30px">
    ${bar('カテゴリ', ui.catBack || 'month')}
    ${monthSw('cats')}
    <div class="card rows">${rows}</div>
    <button class="btn line press mt16" data-act="cat-add">${full() ? I.plus : I.lock}カテゴリを足す</button>
    <p class="tiny dim center mt8">記録のときに押すカテゴリです。押した記録はそのまま残ります</p>
  </div>`, 'cats', { keepScroll: ui.view === 'cats' });
}

/* ---------- ふたりで(共有) ---------- */
function vShare() {
  const n = unsentCount(), m = st.sync.match;
  let state;
  if (!st.book.shared && !st.sync.sentAt) state = `<span class="sy-state none">${I.people}まだ相手とつながっていません</span>`;
  else if (n) state = `<span class="sy-state warn">${I.send}まだ送っていない記録 ${n}件</span>`;
  else if (m && m.r === 'ok') state = `<span class="sy-state ok">${I.check}ふたりの記録は一致しています</span>`;
  else if (m && m.r === 'mine-more') state = `<span class="sy-state warn">${I.send}こちらにだけある記録があります</span>`;
  else state = `<span class="sy-state none">${I.send}送りました。相手の記録も受け取りましょう</span>`;
  const when = t => (t ? jaDateW(C.ymd(t)) : 'まだ');
  render(`<div class="page tabbed" style="padding-bottom:110px">
    <div class="bar"><h1>ふたりで</h1><div class="spacer"></div></div>
    <div class="card sy-hero">
      <div class="sy-pair"><div>${dot('a', 'l')}<b>${N('a')}</b></div><span class="sw-ic">${I.repeat}</span><div>${dot('b', 'l')}<b>${N('b')}</b></div></div>
      ${state}
      <div class="sy-meta"><div>送った<b>${when(st.sync.sentAt)}</b></div><div>受け取った<b>${when(st.sync.recvAt)}</b></div></div>
    </div>
    <button class="big-act main-act press mt12" data-act="send"><span class="ci">${I.send}</span><div><b>記録を送る</b><span>メッセージのアプリで送ります。相手は「受け取る」で取り込みます</span></div>${I.chev.replace('<svg', '<svg class="chev"')}</button>
    <div class="card mt12">
      <button class="big-act press" data-act="qr"><span class="ci">${I.qr}</span><div><b>QR で見せる</b><span>となりにいる時は、相手のカメラで読むだけ</span></div>${I.chev.replace('<svg', '<svg class="chev"')}</button>
      <button class="big-act press" data-act="recv"><span class="ci">${I.inbox}</span><div><b>受け取る</b><span>相手から届いた文を貼るか、QR を読みます</span></div>${I.chev.replace('<svg', '<svg class="chev"')}</button>
    </div>
    <div class="card mt12">
      <button class="big-act press" data-act="settle-img"><span class="ci">${I.image}</span><div><b>精算の結果を画像で送る</b><span>どっちからどっちへいくらかを1枚に</span></div>${I.chev.replace('<svg', '<svg class="chev"')}</button>
    </div>
    <p class="tiny dim mt12" style="line-height:1.7;margin:12px 6px 0">記録はサーバーに預けません。ふたりの端末の間で、送った文や QR の中だけを受け渡します。同じ記録を何回取り込んでも、二重にはなりません。</p>
  </div>`, 'share');
}
async function doSend() {
  try {
    const p = C.buildPayload(st, { now: NOW(), mode: 'all' });
    const code = await C.encodePayload(p);
    const text = `フタリチョウの記録です(${p.e.filter(x => !x[10]).length}件)。\nアプリの「ふたりで」→「受け取る」で、この文をまるごと貼ってください。\n${(CFG.shareBase || '')}#${code}`;
    const r = await shareTextMsg(text);
    if (r === 'cancelled') return;
    st.sync.sentAt = NOW(); st.book.shared = true; save();
    if (r === 'copied') toast('コピーしました。メッセージに貼って送ってください', null, true); else toast('送りました');
    go(ui.view === 'settle' ? 'share' : ui.view);
  } catch (e) { toast('送る準備ができませんでした'); }
}
async function shareTextMsg(text) {
  const P = cap && cap.isNativePlatform && cap.isNativePlatform() ? cap.Plugins : null;
  try {
    if (P && P.Share) { await P.Share.share({ text, dialogTitle: '相手に送る' }); return 'shared'; }
    if (navigator.share) { await navigator.share({ text }); return 'shared'; }
  } catch (e) { if (e && (e.name === 'AbortError' || /cancel/i.test(e.message || ''))) return 'cancelled'; }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch (e) { /* なし */ }
  const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* なし */ } ta.remove(); return 'copied';
}
async function showQr() {
  const since = st.sync.sentQrAt || 0;
  const p = C.buildPayload(st, { now: NOW(), mode: since ? 'delta' : 'all', since });
  const code = await C.encodePayload(p);
  if (code.length > 1500) {
    openSheet(`<div class="center" style="padding:8px 4px">${art('share', 'art')}<h2 class="mt8" style="font-size:calc(var(--fs) + 3px)">記録が多いので、QR に入りません</h2><p class="sub mt8">リンクで送ると、全部をまとめて渡せます。</p><button class="btn main press mt20" data-act="send">${I.send}リンクで送る</button><button class="btn ghost mt4" data-act="close">閉じる</button></div>`, 'qr-big');
    return;
  }
  const qr = window.qrcode(0, 'L'); qr.addData(code); qr.make();
  const n = qr.getModuleCount(), sc = Math.max(4, Math.floor(600 / (n + 8)));
  const cv = document.createElement('canvas'); cv.width = cv.height = (n + 8) * sc; const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#1E2B42';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect((c + 4) * sc, (r + 4) * sc, sc, sc);
  openSheet(`<div class="sh-top"><button class="iconbtn" data-act="close">${I.close}</button><div class="title">QR で見せる</div><div class="spacer"></div></div>
    <div class="qr-box"><img src="${cv.toDataURL()}" alt="記録の QR"></div>
    <p class="center mt12 b">${p.e.length}件の記録${since ? '(前に見せた後に変わった分)' : ''}</p>
    <p class="sub small center mt4" style="line-height:1.6">相手のアプリで「ふたりで」→「受け取る」→<br>「カメラで QR を読む」を押してもらいます</p>
    <button class="btn main press mt16" data-act="qr-done">${I.check}読み取ってもらった</button>
    <button class="btn ghost mt4" data-act="qr-all">全部を QR にする</button>`, 'qr', 'white');
}
function openRecv(prefill = '') {
  openSheet(`<div class="sh-top"><button class="iconbtn" data-act="close">${I.close}</button><div class="title">受け取る</div><div class="spacer"></div></div>
    <p class="sub small" style="line-height:1.6;margin:0 4px 10px">相手から届いた文を、まるごと貼ってください。</p>
    <textarea class="paste" id="pasteBox" placeholder="ここに貼る">${esc(prefill)}</textarea>
    <div class="row2 mt12"><button class="btn line press" data-act="recv-clip">${I.inbox}貼り付け</button><button class="btn line press" data-act="recv-cam">${I.cam}QR を読む</button></div>
    <div id="camBox"></div>
    <button class="btn main press mt12" data-act="recv-go">取り込む</button>`, 'recv', 'full');
}
async function recvCode(text) {
  const p = await C.decodePayload(text);
  const bad = p ? C.checkPayload(p) : 'notours';
  if (bad) { toast(bad === 'notours' ? 'フタリチョウの記録が見つかりませんでした。文をまるごと貼ってください' : '記録が途中で切れているようです。もう一度送ってもらってください'); return; }
  stopCam();
  ui.pendingImport = p;
  const rel = C.relation(st, p);
  if (rel === 'same') return finishImport(C.mergePayload(st, p, NOW()));
  if (rel === 'other') {
    openSheet(`<div class="center" style="padding:8px 4px"><h2 style="font-size:calc(var(--fs) + 3px);line-height:1.5">別の帳面の記録です</h2>
      <p class="sub mt8" style="line-height:1.6">「${esc(p.b.n[0])}」と「${esc(p.b.n[1])}」の帳面です。いまの帳面とは別の物なので、そのままでは取り込めません。</p>
      <button class="btn line press mt20" data-act="imp-replace">いまの記録を消して、こちらに加わる</button>
      <button class="btn ghost mt4" data-act="close">取り込まない</button></div>`, 'imp-other');
    return;
  }
  ui.pickRole = p.by === 'a' ? 'b' : 'a';
  importWho();
}
function importWho() {
  const p = ui.pendingImport, r = ui.pickRole;
  const cc = i => C.COLORS[p.b.c[i]] || C.COLORS[i];
  openSheet(`<div style="padding:6px 2px"><h2 class="center" style="font-size:calc(var(--fs) + 3px)">あなたはどちらですか?</h2>
    <p class="sub small center mt8">${esc(p.b.n[p.by === 'a' ? 0 : 1])}さんから、${p.e.filter(x => !x[10]).length}件の記録が届きました</p>
    <div class="who-pick mt16">${['a', 'b'].map((k, i) => `<button class="press ${r === k ? 'on' : ''}" data-act="imp-role" data-r="${k}"><span class="dot l" style="background:${cc(i)}">${esc(String(p.b.n[i]).slice(0, 1))}</span>${esc(p.b.n[i])}</button>`).join('')}</div>
    ${st.book && st.entries.length ? `<p class="tiny sub center mt12">この端末で入れていた ${C.liveEntries(st).length}件の記録も、そのまま残ります</p>` : ''}
    <button class="btn main press mt20" data-act="imp-join">この帳面に加わる</button>
    <button class="btn ghost mt4" data-act="close">やめる</button></div>`, 'imp-who');
}
function finishImport(r) {
  save(); sound('import'); haptic('MEDIUM'); applyLook();
  const msg = r.match === 'ok' ? `<span class="sy-state ok">${I.check}ふたりの記録は一致しています</span>` : r.match === 'mine-more' ? `<span class="sy-state warn">${I.send}こちらにだけある記録があります</span>` : `<span class="sy-state none">${I.check}QR の分を取り込みました</span>`;
  openSheet(`<div class="center" style="padding:6px 4px">${art('share', 'art')}<h2 style="font-size:calc(var(--fs) + 4px)">取り込みました</h2>
    <div class="card imp-sum mt12"><div><b>${r.added}</b><span>新しい記録</span></div><div><b>${r.updated}</b><span>直された記録</span></div><div><b>${r.settles}</b><span>精算</span></div></div>
    <div class="mt12">${msg}</div>
    ${r.match === 'mine-more' ? `<p class="sub small mt8" style="line-height:1.6">相手にも送ると、ふたりの数字がそろいます。</p><button class="btn main press mt16" data-act="send">${I.send}相手に送り返す</button>` : ''}
    <button class="btn ${r.match === 'mine-more' ? 'ghost' : 'main press'} mt12" data-act="imp-close">ホームを見る</button></div>`, 'imp-done');
}
async function startCam() {
  const box = $('#camBox'); if (!box) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('この端末ではカメラが使えません。文を貼ってください'); return; }
  box.innerHTML = `<div class="cam mt12"><video playsinline muted></video><div class="frame"></div></div><p class="tiny sub center mt8">相手の QR を枠に入れてください</p>`;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const v = box.querySelector('video'); v.srcObject = stream; await v.play();
    const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true });
    ui.cam = { stream, on: true };
    const tick = async () => {
      if (!ui.cam || !ui.cam.on) return;
      if (v.videoWidth && window.jsQR) { cv.width = v.videoWidth; cv.height = v.videoHeight; g.drawImage(v, 0, 0); const img = g.getImageData(0, 0, cv.width, cv.height); const q = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' }); if (q && q.data && /F1/.test(q.data)) { haptic('MEDIUM'); await recvCode(q.data); return; } }
      setTimeout(() => requestAnimationFrame(tick), 120);
    };
    tick();
  } catch (e) { box.innerHTML = ''; toast('カメラを使えませんでした。設定でカメラを許可するか、文を貼ってください'); }
}
function stopCam() { if (ui.cam) { ui.cam.on = false; try { ui.cam.stream.getTracks().forEach(t => t.stop()); } catch (e) { /* なし */ } ui.cam = null; } }

/* ---------- 画像 ---------- */
async function shareImg(kind) {
  let cv;
  if (kind === 'settle') { const sl = sinceLast(); cv = settleCard({ names: st.book.names, colors: st.book.colors, dir: C.direction(C.balance(st)), paid: sl.paid, share: sl.share, date: jaDateW(today()), count: sl.es.length }); }
  else { const ym = ui.ym || today().slice(0, 7); const sum = C.monthSummary(st, ym); const catList = Object.entries(sum.cats).map(([id, v]) => ({ id, v, name: catName(id), color: catColor(id) })).sort((a, b) => b.v - a.v); cv = monthCard({ names: st.book.names, colors: st.book.colors, ym, sum, catList }); }
  openSheet(`<div class="sh-top"><button class="iconbtn" data-act="close">${I.close}</button><div class="title">${kind === 'settle' ? '精算の結果' : '月のまとめ'}</div><div class="spacer"></div></div>
    <img id="cardImg" src="${cv.toDataURL('image/png')}" style="width:100%;border-radius:18px;box-shadow:var(--shadow);display:block" alt="">
    <button class="btn main press mt16" data-act="card-share">${I.send}送る・保存する</button>`, 'card');
  ui.card = { cv, kind };
}

/* ---------- 設定 ---------- */
function sw(on) { return `<span class="sw ${on ? 'on' : ''}"></span>`; }
function setRow(act, ic, t, s = '', right = '', extra = '') { return `<button class="set-r press" data-act="${act}" ${extra}><span class="ci" style="background:var(--main-t);color:var(--main);width:36px;height:36px;border-radius:12px">${ic}</span><span class="t"><b>${t}</b>${s ? `<span>${s}</span>` : ''}</span>${right || I.chev.replace('<svg', '<svg class="chev"')}</button>`; }
const fb = () => (full() ? '' : `<span class="full-badge">${I.lock}完全版</span>`);
function vSettings() {
  render(`<div class="page tabbed" style="padding-bottom:110px">
    <div class="bar"><h1>設定</h1><div class="spacer"></div></div>
    <div class="set-h">ふたり</div>
    <div class="card">${setRow('names-edit', I.people, '呼び名と色', `${N('a')} と ${N('b')}(あなたは${N(st.book.me)})`)}</div>
    <div class="set-h">入力</div>
    <div class="card">${setRow('favs', I.star, 'いつもの', 'よく使う支払いを1タップで記録')}${setRow('go-fixed', I.repeat, '毎月の固定費' + fb(), '家賃・光熱費などを毎月自動で記録')}${setRow('go-cats', I.tag, 'カテゴリ', '今月のカテゴリごとの額・名前を変える')}</div>
    <div class="set-h">見た目と音</div>
    <div class="card">${setRow('set-sound', I.sound, '効果音', '記録・精算・受け取りの時に小さく鳴ります', sw(st.prefs.sound))}${setRow('set-big', I.type, '文字を大きく', '', sw(st.prefs.big))}${setRow('coach-again', I.info, '使い方の案内をもう一度見る')}</div>
    <div class="set-h">計算の決まり</div>
    <div class="card">${setRow('rule', I.coin, '端数と精算の決まり', '半分ずつの1円は、払った人が持ちます')}</div>
    <div class="set-h">データ</div>
    <div class="card">${setRow('backup-out', I.download, 'バックアップを書き出す', '機種変更の時に。ファイルを保存します')}${setRow('backup-in', I.upload, 'バックアップから戻す')}${setRow('csv', I.table, '表(CSV)で書き出す' + fb(), '表計算のアプリで開けます')}</div>
    <div class="set-h">完全版</div>
    <div class="card">${setRow('paywall', I.star, full() ? '完全版になっています' : '完全版について', full() ? 'ありがとうございます' : '割合で分ける・固定費・6か月のくらべ など', '', 'data-why="settings"')}${setRow('restore', I.repeat, '購入を復元')}</div>
    <div class="set-h">このアプリについて</div>
    <div class="card">${setRow('about', I.info, '出典とプライバシー', '記録は端末の中だけに保存します')}${setRow('link-terms', I.text, '利用規約')}${setRow('link-privacy', I.shield, 'プライバシーポリシー')}</div>
    <button class="btn ghost mt16" style="color:var(--red)" data-act="reset">はじめからやり直す</button>
    <p class="tiny dim center mt8">フタリチョウ 1.0.0</p>
    <input type="file" id="fileIn" accept="application/json,.json" hidden>
  </div>`, 'settings', { keepScroll: ui.view === 'settings' });
}
function vFixed() {
  const fs = st.fixed.filter(f => !f.del);
  render(`<div class="page" style="padding-bottom:30px">
    ${bar('毎月の固定費', 'settings')}
    <p class="sub small" style="line-height:1.6;margin:0 6px 12px">家賃や光熱費など、毎月同じ物を登録すると、その日に自動で記録されます。ふたりの端末で同じ物が二重にできることはありません。</p>
    <div class="card rows">${fs.length ? fs.map(f => `<button class="rowi press" data-act="fixed-edit" data-id="${f.id}">${catIcon(f.cat, catIdx(f.cat))}<div class="mid"><div class="t1">${esc(f.name || catName(f.cat))}</div><div class="t2"><span class="dot c${f.payer}"></span>毎月${f.day === 31 ? '月末' : f.day + '日'} · ${N(f.payer)}が払う · ${splitText(f)}</div></div><div class="rt"><div class="a1">${yenH(f.amount)}</div></div></button>`).join('') : `<div class="empty">${catIcon('rent')}<p class="mt8">まだ登録がありません</p></div>`}</div>
    <button class="btn main press mt16" data-act="fixed-new">${I.plus}固定費を足す</button>
  </div>`, 'fixed');
}
function favsSheet() {
  const fs = st.favs.filter(f => !f.del); const sug = C.favSuggestions(st);
  openSheet(`<div class="sh-top"><button class="iconbtn" data-act="close">${I.close}</button><div class="title">いつもの</div><div class="spacer"></div></div>
    <p class="sub small" style="margin:0 4px 10px;line-height:1.6">ホームのボタンを押すと、その場で記録されます(${C.MAX_FAVS}件まで)。</p>
    <div class="card rows">${fs.length ? fs.map(f => `<button class="rowi press" data-act="fav-edit" data-id="${f.id}">${catIcon(f.cat, catIdx(f.cat))}<div class="mid"><div class="t1">${esc(f.name || catName(f.cat))}</div><div class="t2"><span class="dot c${f.payer}"></span>${N(f.payer)}が払う · ${splitText(f)}</div></div><div class="rt"><div class="a1">${yenH(f.amount)}</div></div></button>`).join('') : '<p class="small sub" style="padding:16px">まだありません</p>'}</div>
    ${sug.length ? `<div class="sec-h"><h3>よく入れている組み合わせ</h3></div><div class="card rows">${sug.map((s, i) => `<div class="rowi">${catIcon(s.cat, catIdx(s.cat))}<div class="mid"><div class="t1">${esc(catName(s.cat))} ${yenH(s.amount)}</div><div class="t2">${N(s.payer)}が払った · ${s.n}回</div></div><button class="chip on" data-act="fav-sug" data-i="${i}">${I.plus}登録</button></div>`).join('')}</div>` : ''}
    <button class="btn main press mt16" data-act="fav-new">${I.plus}いつものを足す</button>`, 'favs', 'full');
}
function namesSheet() {
  const b = st.book; ui.ned = { a: b.names.a, b: b.names.b, ca: b.colors.a, cb: b.colors.b };
  const cols = (k, sel) => `<div class="colors">${C.COLORS.map((c, i) => `<button class="${i === sel ? 'on' : ''}" style="background:${c}" data-act="ned-color" data-k="${k}" data-i="${i}"></button>`).join('')}</div>`;
  openSheet(`<div class="sh-top"><button class="iconbtn" data-act="close">${I.close}</button><div class="title">呼び名と色</div><div class="spacer"></div></div>
    ${['a', 'b'].map(r => `<label class="field"><span>${r === b.me ? 'あなた' : '相手'}</span><input id="ned_${r}" maxlength="12" value="${esc(b.names[r])}"></label>${cols('c' + r, b.colors[r])}`).join('<div class="mt12"></div>')}
    <p class="tiny sub mt16" style="line-height:1.6">変えた呼び名は、次に記録を送った時に相手にも届きます。</p>
    <button class="btn main press mt16" data-act="ned-ok">保存</button>`, 'names', 'full');
}

/* ---------- 完全版 ---------- */
const PW_ITEMS = [['ratio', I.ratio, '割合で分ける', '家賃は 60:40 など、ふたりの決まりに合わせて'], ['fixed', I.repeat, '毎月の固定費を自動で', '家賃・光熱費・ネットを、その日に記録'], ['catEdit', I.tag, 'カテゴリを足す・名前を変える', 'ペット・旅行など、ふたりの暮らしに合わせて'], ['compare', I.bars, '6か月のくらべ', 'ふたりの負担の割合を、月ごとに'], ['csv', I.table, '表(CSV)で書き出す', '表計算のアプリで、まとめて見返せます']];
function openPaywall(why = 'settings', preview = '') {
  if (full() && why !== 'settings') return false;
  const plans = buy.plans();
  const btns = full() ? `<div class="sy-state ok" style="margin:0 auto">${I.check}完全版になっています</div>`
    : plans.length ? plans.map(pl => `<button class="btn main press" data-act="buy" data-id="${pl.id}" ${pl.offline || buy.busy ? 'disabled' : ''}><span>完全版にする ${esc(pl.price)}</span><small>${esc(pl.label)}</small></button>`).join('')
    : `<button class="btn main" disabled>${buy.isApp() ? 'ストアにつながると購入できます' : '購入はスマホのアプリでできます'}</button>`;
  openSheet(`<div class="pw">
    <div class="sh-top" style="margin-bottom:-10px"><div class="spacer"></div><div class="title"></div><button class="iconbtn" data-act="close" aria-label="閉じる">${I.close}</button></div>
    ${art('paywall', 'art')}
    <h2>フタリチョウ 完全版</h2>
    <p class="lead">記録・精算・送り合いは、このままずっと使えます。<br>ふたりの決まりに合わせて、もう少し細かく。</p>
    ${preview}
    <div class="card pw-list">${PW_ITEMS.map(([k, ic, t, s]) => `<div class="it" ${k === why ? 'style="background:var(--main-t)"' : ''}><span class="ci">${ic}</span><div><b>${t}</b><span>${s}</span></div></div>`).join('')}</div>
    <div class="pw-buy">${btns}</div>
    <p class="pw-fine">一度の支払いで、ずっと使えます。定期の支払いはありません。<br>ひとりが買えば、記録を受け取った相手の端末でも使えます。</p>
    ${buy.message ? `<p class="small b mt8" style="color:var(--main)">${esc(buy.message)}</p>` : ''}
    <div class="row2 mt12"><button class="btn line press" data-act="restore">${I.repeat}購入を復元</button><button class="btn line press" data-act="close">あとで</button></div>
    <div class="pw-links"><button data-act="link-terms">利用規約</button><button data-act="link-privacy">プライバシー</button></div>
  </div>`, 'paywall', 'full white');
  ui.pwWhy = why;
  return true;
}
function ratioPreview() {
  const p = ui.inp; const amt = +p.v || 85000; const q = other(p.payer);
  const ex = [60, 70].map(v => `${N(p.payer)} ${v}% : ${N(q)} ${100 - v}% → ${N(q)}の分 <b>${yenH(C.owedBy({ amount: amt, split: { t: 'ratio', v } }))}</b>`).join('<br>');
  return `<div class="preview">${+p.v ? `この記録 ${yenH(amt)} を割合で分けると` : `たとえば家賃 ${yenH(amt)} を割合で分けると`}<br>${ex}<br><span class="tiny sub">半分ずつなら ${N(q)}の分 ${yenH(Math.floor(amt / 2))}</span></div>`;
}

/* ---------- 案内(指さし) ---------- */
// 0: まだ / 1: ＋を押す / 2: 金額 / 3: カテゴリ / 4: ふたりの差 / 5: ふたりで / 9: 終わり
function coach() {
  const step = st.prefs.tutorial;
  if (!st.book || !step || step >= 9) { coachEl.hidden = true; coachEl.innerHTML = ''; return; }
  let target = null, text = '', sub = '', next = false;
  const inp = ui.sheet === 'input' && ui.inp && ui.inp.mode === 'entry';
  if (step === 1 && ui.view === 'home' && !ui.sheet) { target = $('.fab'); text = '払ったら、ここを押します'; sub = 'レジの後に片手で'; }
  else if ((step === 1 || step === 2) && inp && !(+ui.inp.v)) { st.prefs.tutorial = 2; target = sheetIn.querySelector('.keypad'); text = '金額を入れます'; sub = 'たとえば 2,480'; }
  else if ((step === 2 || step === 3) && inp && +ui.inp.v) { st.prefs.tutorial = 3; target = sheetIn.querySelector('.cats'); text = 'カテゴリを押すと、その場で記録されます'; sub = '払った人は自分、分け方は半分ずつが選ばれています'; }
  else if (step === 4 && ui.view === 'home' && !ui.sheet) { target = $('.bal'); text = 'ふたりの差は、いつもここに出ます'; sub = '押すと精算の画面へ'; next = true; }
  else if (step === 5 && ui.view === 'home' && !ui.sheet) { target = tabsEl.querySelector('[data-tab=share]'); text = '相手に送るのは「ふたりで」から'; sub = 'メッセージで送るか、となりなら QR で'; next = true; }
  if (!target) { coachEl.hidden = true; coachEl.innerHTML = ''; return; }
  const r = target.getBoundingClientRect(), app = $('#app').getBoundingClientRect();
  const pad = 6, top = r.top - app.top - pad, left = r.left - app.left - pad, w = r.width + pad * 2, h = r.height + pad * 2;
  const below = top + h / 2 < app.height / 2;
  const inSheet = ui.sheet === 'input';
  const bubbleY = inSheet ? 'top:calc(8px + var(--safe-t))' : below ? `top:${top + h + 14}px` : `bottom:${app.height - top + 14}px`;
  coachEl.hidden = false;
  coachEl.className = 'coach';
  coachEl.innerHTML = `<div class="hole" style="top:${top}px;left:${left}px;width:${w}px;height:${h}px"></div>
    ${next ? '' : `<img class="finger" src="img/finger.png" alt="" style="left:${Math.max(4, Math.min(app.width - 70, left + w / 2 - 34))}px;top:${Math.min(app.height - 70, top + h * .55)}px" onerror="this.style.display='none'">`}
    <div class="bubble" style="${bubbleY}">${text}<small>${sub}</small>${next ? `<button class="btn main press mt12" style="min-height:44px" data-act="coach-next">${step === 5 ? 'わかった' : '次へ'}</button>` : ''}<button class="skip" data-act="coach-skip">あとで</button></div>`;
}

/* ---------- 画面の切り替え ---------- */
function go(view) {
  applyLook();
  if (!st.book) return view === 'names' ? vNames() : vIntro();
  ({ home: vHome, records: vRecords, month: vMonth, share: vShare, settings: vSettings, settle: vSettle, cats: vCats, fixed: vFixed }[view] || vHome)();
}

/* ---------- 押した時 ---------- */
const A = {
  tab: el => { if (['records', 'month', 'cats'].includes(el.dataset.tab) && ui.view !== 'cats') { /* 月はそのまま */ } go(el.dataset.tab); },
  'intro-start': () => go('names'),
  'intro-recv': () => { openRecv(); },
  'pick-color': el => { ui.names.me = $('#nmMe').value; ui.names.pa = $('#nmPa').value; ui.names[el.dataset.k] = +el.dataset.i; if (ui.names.cm === ui.names.cp) ui.names[el.dataset.k === 'cm' ? 'cp' : 'cm'] = (+el.dataset.i + 1) % C.COLORS.length; vNames(); },
  'names-ok': () => {
    const me = C.clean($('#nmMe').value), pa = C.clean($('#nmPa').value);
    if (!me || !pa) { toast('ふたりの呼び名を入れてください'); (!me ? $('#nmMe') : $('#nmPa')).focus(); return; }
    C.createBook(st, { me: 'a', nameMe: me, namePartner: pa, colorMe: ui.names.cm, colorPartner: ui.names.cp, now: NOW() });
    st.prefs.tutorial = 1; save(); go('home');
  },
  add: () => openInput('entry'),
  key: el => keyPress(el.dataset.k),
  'in-tgt': el => { if (!ui.inp || ui.inp.mode === 'part') return; ui.inp.tgt = el.dataset.t; rerenderInput(); },
  'in-payer': el => { ui.inp.payer = el.dataset.r; haptic(); rerenderInput(); },
  'in-split': el => {
    const t = el.dataset.t; haptic();
    if (t === 'ratio' && !full()) { const memo = $('#inMemo'); if (memo) ui.inp.memo = memo.value; ui.backToInput = { ...ui.inp }; openPaywall('ratio', ratioPreview()); return; }
    ui.inp.split = t === 'ratio' ? { t, v: ui.inp.split.v || 60 } : { t };
    ui.inp.tgt = t === 'amount' ? 'sv' : 'amt'; rerenderInput();
  },
  'in-ratio': el => { ui.inp.split = { t: 'ratio', v: +el.dataset.v }; haptic(); rerenderInput(); },
  'in-date': el => { ui.inp.date = el.dataset.d; rerenderInput(); },
  'in-day': el => { ui.inp.day = +el.dataset.d; rerenderInput(); },
  'in-showdate': () => { ui.inp.showDate = true; rerenderInput(); },
  'in-memo': () => { ui.inp.showMemo = true; rerenderInput(); const m = $('#inMemo'); m && m.focus(); },
  'in-cat': el => { if (ui.inp.mode === 'entry') return commitInput(el.dataset.c); ui.inp.cat = el.dataset.c; haptic(); rerenderInput(); },
  'in-save': () => commitInput(ui.inp.cat),
  'in-del': () => {
    const p = ui.inp;
    if (p.mode === 'edit') { const b0 = C.balance(st); C.deleteEntry(st, p.id, NOW()); save(); closeSheet(); ui.prevBal = b0; go(ui.view); toast('記録を消しました', () => { C.undeleteEntry(st, p.id, NOW()); save(); go(ui.view); }); }
    else if (p.mode === 'fav-edit') { C.removeFav(st, p.id, NOW()); save(); closeSheet(); go(ui.view); toast('いつものから外しました'); }
    else if (p.mode === 'fixed-edit') { const f = st.fixed.find(x => x.id === p.id); f.del = true; f.upd = NOW(); save(); closeSheet(); go('fixed'); toast('固定費を外しました。入った記録は残ります'); }
  },
  edit: el => openInput('edit', el.dataset.id),
  'fav-use': el => { const b0 = C.balance(st); const e = C.entryFromFav(st, el.dataset.id, { now: NOW(), date: today() }); if (!e) return; save(); sound('save'); haptic('MEDIUM'); ui.newId = e.id; ui.prevBal = b0; go('home'); toast(`${e.memo || catName(e.cat)} ${C.yen(e.amount)} を記録しました`, () => { C.deleteEntry(st, e.id, NOW()); save(); go(ui.view); }); },
  'fav-new': () => { if (st.favs.filter(f => !f.del).length >= C.MAX_FAVS) { toast(`いつものは${C.MAX_FAVS}件までです`); return; } openInput('fav'); ui.inp.cat = 'food'; rerenderInput(); },
  'fav-edit': el => openInput('fav-edit', el.dataset.id),
  'fav-sug': el => { const s = C.favSuggestions(st)[+el.dataset.i]; if (!s) return; C.addFav(st, { ...s, name: catName(s.cat), now: NOW() }); save(); favsSheet(); toast('いつものに登録しました'); },
  favs: () => favsSheet(),
  'go-settle': () => go('settle'),
  'settle-ask': () => askSettle(),
  'settle-do': el => doSettle(+el.dataset.amt || 0),
  'settle-part': () => partSettle(),
  'part-ok': () => { const v = +ui.inp.v || 0; const d = C.direction(C.balance(st)); if (!v) { toast('渡した額を入れてください'); return; } if (v >= d.amount) { closeSheet(); askSettle(); return; } closeSheet(); askSettle(v); },
  'settle-undo': el => { C.undoSettle(st, el.dataset.id, NOW()); save(); go('settle'); toast('精算を取り消しました'); },
  'settle-img': () => shareImg('settle'),
  'settle-txt': async () => { const r = await shareTextMsg(C.settleText(st)); if (r === 'copied') toast('コピーしました', null, true); },
  'month-img': () => shareImg('month'),
  'card-share': async () => { try { await shareCanvas(ui.card.cv, { filename: ui.card.kind === 'settle' ? 'futaricho-settle.png' : 'futaricho-month.png' }); } catch (e) { toast('送れませんでした'); } },
  ym: el => { const ms = monthsList(); const i = ms.indexOf(ui.ym || today().slice(0, 7)); const j = i + (+el.dataset.d); if (j >= 0 && j < ms.length) { ui.ym = ms[j]; ui.catOpen = null; go(ui.view); } },
  'rec-f': el => { ui.recFilter = el.dataset.f; vRecords(); },
  'go-cats': el => { ui.catBack = ui.view === 'settings' ? 'settings' : 'month'; ui.catOpen = el.dataset.c || null; go('cats'); },
  'cat-open': el => { ui.catOpen = ui.catOpen === el.dataset.c ? null : el.dataset.c; vCats(); },
  'cat-add': () => { if (!full()) return openPaywall('catEdit'); catNameSheet(null); },
  'cat-rename': el => { if (!full()) return openPaywall('catEdit'); catNameSheet(el.dataset.c); },
  'cat-save': el => { const v = C.clean($('#catName').value); if (!v) { toast('名前を入れてください'); return; } const id = el.dataset.c; if (id) { const cur = st.cats.find(c => c.id === id); if (cur) Object.assign(cur, { name: v, upd: NOW() }); else st.cats.push({ id, name: v, upd: NOW() }); } else st.cats.push({ id: 'c' + C.rid(Math.random, 6), name: v, upd: NOW() }); save(); closeSheet(); vCats(); toast(id ? '名前を変えました' : 'カテゴリを足しました'); },
  'hint-x': () => { st.prefs.hint2 = true; save(); vMonth(); },
  send: () => { closeSheet(); doSend(); },
  qr: () => showQr(),
  'qr-done': () => { st.sync.sentQrAt = NOW(); st.sync.sentAt = NOW(); st.book.shared = true; save(); closeSheet(); go(ui.view); toast('送りました'); },
  'qr-all': async () => { st.sync.sentQrAt = 0; closeSheet(); showQr(); },
  recv: () => openRecv(),
  'recv-clip': async () => { try { const t = await navigator.clipboard.readText(); $('#pasteBox').value = t; if (/F1/.test(t)) recvCode(t); } catch (e) { toast('貼り付けできませんでした。長押しで貼ってください'); $('#pasteBox').focus(); } },
  'recv-cam': () => startCam(),
  'recv-go': () => recvCode($('#pasteBox').value),
  'imp-role': el => { ui.pickRole = el.dataset.r; importWho(); },
  'imp-join': () => { const r = C.joinBook(st, ui.pendingImport, ui.pickRole); st.sync.recvAt = NOW(); if (!st.prefs.tutorial) st.prefs.tutorial = 1; finishImport(r); },
  'imp-replace': () => { const keep = { prefs: st.prefs }; st = C.newState(); st.prefs = keep.prefs; ui.pickRole = ui.pendingImport.by === 'a' ? 'b' : 'a'; importWho(); },
  'imp-close': () => { closeSheet(); go('home'); },
  'names-edit': () => namesSheet(),
  'ned-color': el => { const k = el.dataset.k.slice(1); ['a', 'b'].forEach(r => { ui.ned[r] = $('#ned_' + r).value; }); ui.ned['c' + k] = +el.dataset.i; if (ui.ned.ca === ui.ned.cb) ui.ned[k === 'a' ? 'cb' : 'ca'] = (+el.dataset.i + 1) % C.COLORS.length; sheetIn.querySelectorAll('.colors').forEach((box, i) => { const kk = i ? 'cb' : 'ca'; box.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', j === ui.ned[kk])); }); },
  'ned-ok': () => { const a = C.clean($('#ned_a').value), b = C.clean($('#ned_b').value); if (!a || !b) { toast('呼び名を入れてください'); return; } st.book.names = { a, b }; st.book.colors = { a: ui.ned.ca, b: ui.ned.cb }; st.book.nu = NOW(); save(); closeSheet(); go('settings'); toast('保存しました'); },
  'set-sound': () => { st.prefs.sound = !st.prefs.sound; save(); vSettings(); if (st.prefs.sound) sound('save'); },
  'set-big': () => { st.prefs.big = !st.prefs.big; save(); applyLook(); vSettings(); },
  'coach-again': () => { st.prefs.tutorial = 1; save(); go('home'); },
  'coach-next': () => { st.prefs.tutorial = st.prefs.tutorial === 4 ? 5 : 9; save(); coach(); },
  'coach-skip': () => { st.prefs.tutorial = 9; save(); coach(); },
  rule: () => openSheet(`<div class="sh-top"><button class="iconbtn" data-act="close">${I.close}</button><div class="title">端数と精算の決まり</div><div class="spacer"></div></div>
    <div class="card pad" style="line-height:1.8">
      <p><b>半分ずつ</b>: 相手の分は額の半分(1円未満は切り捨て)。奇数の1円は、払った人が持ちます。</p>
      <p class="mt12"><b>割合</b>: 相手の分は、額 × 相手の割合(1円未満は切り捨て)。</p>
      <p class="mt12"><b>自分の分だけ</b>: 記録に残りますが、精算の差には入りません。</p>
      <p class="mt12"><b>精算した</b>: その時の差の額の「精算」を記録します。前の記録は消えません。後から届いた記録は、次の差に入ります。</p>
      <p class="mt12"><b>ふたりで同時に精算した時</b>: 同じ状態で押した精算は、1回分として数えます。</p></div>`, 'rule', 'full'),
  'backup-out': async () => { const d = new Date(NOW()); await shareText(JSON.stringify(st), { filename: `futaricho-backup-${C.ymd(NOW())}.json`, mime: 'application/json' }); toast('書き出しました'); },
  'backup-in': () => { const f = $('#fileIn'); f.value = ''; f.onchange = async () => { try { const txt = await f.files[0].text(); const o = JSON.parse(txt); if (!o || !Array.isArray(o.entries)) throw 0; openSheet(`<div class="center" style="padding:8px"><h2 style="font-size:calc(var(--fs) + 3px)">バックアップから戻しますか?</h2><p class="sub mt8">${o.entries.filter(e => !e.del).length}件の記録があります。いまの記録は、このファイルの中身に置き換わります。</p><button class="btn main press mt20" data-act="backup-yes">戻す</button><button class="btn ghost mt4" data-act="close">やめる</button></div>`, 'bk'); ui.backup = o; } catch (e) { toast('このファイルは読めませんでした'); } }; f.click(); },
  'backup-yes': () => { const { migrate } = C; st = migrate(ui.backup); save(); closeSheet(); go('home'); toast('戻しました'); },
  csv: async () => { if (!full()) return openPaywall('csv'); await shareText(C.toCsv(st, catName), { filename: `futaricho-${C.ymd(NOW())}.csv`, mime: 'text/csv', bom: true }); toast('書き出しました'); },
  'go-fixed': () => { if (!full()) return openPaywall('fixed'); go('fixed'); },
  'fixed-new': () => { openInput('fixed'); },
  'fixed-edit': el => openInput('fixed-edit', el.dataset.id),
  paywall: el => { openPaywall(el.dataset.why || 'settings'); },
  buy: async el => { const ok = await buy.buy(el.dataset.id); if (ok) afterBuy(); else openPaywall(ui.pwWhy || 'settings'); },
  restore: async () => { const ok = await buy.restore(); if (ok) afterBuy(); else toast(buy.message || '購入が見つかりませんでした'); },
  about: () => openSheet(`<div class="sh-top"><button class="iconbtn" data-act="close">${I.close}</button><div class="title">出典とプライバシー</div><div class="spacer"></div></div>
    <div class="card pad" style="line-height:1.8;font-size:calc(var(--fs) - 1px)">
      <p><b>記録の置き場所</b><br>記録はこの端末の中だけに保存します。サーバーには送りません。相手に送るのは、あなたが「送る」を押した時の文や QR だけです。</p>
      <p class="mt12"><b>集めない物</b><br>名前・メール・電話番号は聞きません。広告と解析の仕組みは入っていません。</p>
      <p class="mt12"><b>効果音</b><br>効果音ラボ(https://soundeffect-lab.info/)の素材を使っています。</p>
      <p class="mt12"><b>部品</b><br>QR の作成 qrcode-generator(MIT ライセンス)、QR の読み取り jsQR(Apache License 2.0)。</p></div>`, 'about', 'full'),
  'link-terms': () => openUrl(CFG.termsUrl),
  'link-privacy': () => openUrl(CFG.privacyUrl),
  reset: () => openSheet(`<div class="center" style="padding:8px"><h2 style="font-size:calc(var(--fs) + 3px)">はじめからやり直しますか?</h2><p class="sub mt8" style="line-height:1.6">この端末の記録と呼び名を、すべて消します。相手の端末の記録は消えません。</p><button class="btn line press mt20" style="color:var(--red)" data-act="reset-yes">すべて消す</button><button class="btn ghost mt4" data-act="close">やめる</button></div>`, 'reset'),
  'reset-yes': () => { st = C.newState(); save(); closeSheet(); ui.names = null; go('intro'); },
  close: () => { const back = ui.backToInput; ui.backToInput = null; closeSheet(); if (back && ui.sheet === null && back.mode) { ui.inp = back; openSheet(inputHtml(), 'input', 'full ' + (short() ? 'short' : '')); } },
  undo: () => { const u = toastUndo; hideToast(); if (u) u(); },
};
function catNameSheet(id) {
  const cur = id ? catName(id) : '';
  openSheet(`<div class="sh-top"><button class="iconbtn" data-act="close">${I.close}</button><div class="title">${id ? '名前を変える' : 'カテゴリを足す'}</div><div class="spacer"></div></div>
    <label class="field"><span>カテゴリの名前</span><input id="catName" maxlength="8" value="${esc(cur)}" placeholder="例 ペット"></label>
    <button class="btn main press mt20" data-act="cat-save" data-c="${id || ''}">保存</button>`, 'catname');
  setTimeout(() => { const i = $('#catName'); i && i.focus(); }, 300);
}
function afterBuy() {
  st.book.full = true; save(); sound('settle'); confetti();
  const back = ui.backToInput; ui.backToInput = null; closeSheet();
  if (back && back.mode) { ui.inp = back; if (ui.pwWhy === 'ratio') ui.inp.split = { t: 'ratio', v: 60 }; openSheet(inputHtml(), 'input', 'full ' + (short() ? 'short' : '')); }
  else go(ui.view === 'intro' ? 'home' : ui.view);
  toast('完全版になりました。ありがとうございます');
}
function openUrl(u) { if (!u) return; try { window.open(u, '_blank'); } catch (e) { /* なし */ } }

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) { if (e.target.classList.contains('veil')) A.close(); return; }
  if (el.disabled) return;
  const f = A[el.dataset.act]; if (f) { e.preventDefault(); f(el); }
});
document.addEventListener('change', e => { if (e.target.id === 'inDate' && ui.inp) { const v = e.target.value; if (v && v <= today()) { ui.inp.date = v; rerenderInput(); } } });
document.addEventListener('input', e => { if (e.target.id === 'inMemo' && ui.inp) ui.inp.memo = e.target.value; if ((e.target.id === 'nmMe' || e.target.id === 'nmPa') && ui.names) { ui.names.me = $('#nmMe').value; ui.names.pa = $('#nmPa').value; } });
document.addEventListener('keydown', e => { if (ui.sheet === 'input' || ui.sheet === 'part') { if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return; if (/^[0-9]$/.test(e.key)) keyPress(e.key); else if (e.key === 'Backspace') keyPress('bs'); } });
addEventListener('resize', () => { applyLook(); fitAll(); coach(); });

// Android の戻るボタン
try { const App = cap && cap.Plugins && cap.Plugins.App; if (App && App.addListener) App.addListener('backButton', () => { if (ui.sheet) A.close(); else if (!['home', 'intro'].includes(ui.view) && st.book) go(['settle', 'cats', 'fixed'].includes(ui.view) ? (ui.view === 'fixed' ? 'settings' : 'home') : 'home'); else App.exitApp && App.exitApp(); }); } catch (e) { /* なし */ }

/* ---------- 起動 ---------- */
(async function start() {
  try {
    window.__ftBooted = true;
    buy.onChange = () => { if (ui.sheet === 'paywall') openPaywall(ui.pwWhy || 'settings'); if (buy.owned && st.book && !st.book.full) { st.book.full = true; save(); } };
    go(st.book ? 'home' : 'intro');
    buy.init();
    const newer = await newerFromPrefs(cap, st); if (newer) { st = newer; go(ui.view); }
    const h = location.hash || ''; if (/F1[A-Za-z0-9_-]{8,}/.test(h)) { history.replaceState(null, '', location.pathname); openRecv(decodeURIComponent(h.slice(1))); recvCode(decodeURIComponent(h.slice(1))); }
  } catch (e) { console.error(e); try { localStorage.setItem('futaricho.v1.broken', JSON.stringify(st)); } catch (_) { /* なし */ } st = C.newState(); go('intro'); }
})();
window.__ft = { C, st: () => st, go, save: () => save(), reload: () => { st = loadLocal(safeLs()).st; go('home'); } };
