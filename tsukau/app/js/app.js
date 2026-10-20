// Tsukau 本体。画面は view に描き直す方式(フレームワークなし)。
import { t, setLang } from './i18n.js';
import { S } from './state.js';
import { dayNumber, review, buildQueue, previewIvl, newCard, FREE_NEW_PER_DAY, MAX_NEW_PER_DAY } from './srs.js';
import { BASIC, bySet, makeQuiz } from './kana.js';
import { nameToKatakana } from './name.js';
import { Plus } from './plus.js';
import { TTS } from './tts.js';
import { Notify } from './notify.js';
import { drawCard, canvasBlob, shareImage } from './share.js';

const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1';
// 試験のときは日付をずらせる(?day=+3 で3日後)
const DAY_SHIFT = TEST ? parseInt(params.get('day') || '0', 10) || 0 : 0;
const today = () => dayNumber() + DAY_SHIFT;
const SITE = 'https://yurustudio.github.io/tsukau/'; // privacy.html・terms.html(まだ公開していない)
const PLAY_URL = (window.TSUKAU_CONFIG && window.TSUKAU_CONFIG.playUrl) || ''; // Play の参加ページ。config.js で入れる

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = () => $('#view');
const SPEAK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const IMG = { bird: 'img/bird.png', happy: 'img/bird_happy.png', think: 'img/bird_think.png', sleep: 'img/bird_sleep.png' };

// ---------- データ ----------
const D = { vocab: {}, kanji: {}, scenes: [], strokes: null, wod: [] };
async function json(p) { const r = await fetch(p); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); }
async function loadDeck(lv) {
  if (!D.vocab[lv]) D.vocab[lv] = await json(`data/vocab_${lv}.json`);
  if (!D.kanji[lv]) D.kanji[lv] = await json(`data/kanji_${lv}.json`);
}
async function strokes() { if (!D.strokes) D.strokes = await json('data/strokes.json'); return D.strokes; }

// 今日の1語: N5 の中から漢字を含む短い語を、日付で決めて出す(同じ日は誰でも同じ語)
function wordPool() { const n5 = D.vocab.n5 || []; const by = Object.fromEntries(n5.map(v => [v.id, v])); const cur = (D.wod || []).map(id => by[id]).filter(Boolean); return cur.length ? cur : n5.filter(v => /[一-龯]/.test(v.w) && v.w.length <= 3); }
function wordForDay(day) { const pool = wordPool(); if (!pool.length) return { w: '駅', r: 'えき', m: 'station' }; const i = ((day * 2654435761) >>> 0) % pool.length; return pool[i]; }

// ---------- 共通の部品 ----------
function toast(msg, ms = 2600) { const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toast.tm); toast.tm = setTimeout(() => el.classList.remove('on'), ms); }
function sayBtn(text, cls = '') { return TTS.available ? `<button class="say ${cls}" data-say="${esc(text)}" aria-label="${esc(t('listen'))}">${SPEAK}</button>` : ''; }
function birdImg(kind = 'bird', cls = 'bird') { return `<img class="${cls}" src="${IMG[kind] || IMG.bird}" alt="" onerror="this.style.visibility='hidden'">`; }
function lockChip() { return `<span class="chip plus">${esc(t('locked'))}</span>`; }
function sceneArt(id) { return `img/scene_${id}.jpg`; }
// 絵が無い時の地(場面ごとに色を変える)
const TINT = { konbini: '#2b5c8a', train: '#2f6b4f', ramen: '#8a3b2b', matsuri: '#8a2b4f', school: '#b0613a', hotel: '#4a3b8a', izakaya: '#8a5a2b', directions: '#2b6b8a' };
function sceneTint(id) { return `linear-gradient(160deg, ${TINT[id] || '#3a2a7a'}, #121a42)`; }
let curTab = 'home';
function setTabs(on, tab) {
  $('#tabs').classList.toggle('hidden', !on);
  view().classList.toggle('notabs', !on);
  if (tab) curTab = tab;
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === curTab));
}
function render(html, { tabs = true, tab } = {}) {
  closeSheet();
  view().innerHTML = html; view().scrollTop = 0;
  setTabs(tabs, tab);
  bindCommon(view());
}
function bindCommon(root) {
  $$('[data-say]', root).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); TTS.speak(b.dataset.say); }));
  $$('[data-go]', root).forEach(b => b.addEventListener('click', () => go(b.dataset.go, b.dataset.arg)));
}
function openSheet(html, onBind) {
  const sh = $('#sheet'); sh.innerHTML = `<div class="inner pop">${html}</div>`; sh.classList.remove('hidden');
  sh.onclick = e => { if (e.target === sh) closeSheet(); };
  bindCommon(sh); if (onBind) onBind(sh);
}
function closeSheet() { const sh = $('#sheet'); sh.classList.add('hidden'); sh.innerHTML = ''; }
function topBar(title, back = 'home') {
  return `<div class="top"><button class="iconbtn" data-go="${back}" aria-label="${esc(t('back'))}">‹</button><h1 class="h1" style="font-size:24px">${esc(title)}</h1><span class="sp"></span></div>`;
}

// ---------- 画面の切り替え ----------
const ROUTES = {};
function go(name, arg) { (ROUTES[name] || ROUTES.home)(arg); }

// ---------- ホーム ----------
ROUTES.home = () => {
  const day = today(); const w = wordForDay(day); const st = S.streakNow(day);
  const q = queueFor('n5', 'words');
  const kanaGot = Object.keys(S.d.kana).filter(k => k[0] === 'H' && S.d.kana[k] > 0).length;
  const n5 = D.vocab.n5 || []; const n5got = n5.filter(v => S.d.cards[v.id]).length;
  const scenes = D.scenes.map(s => `<button class="scard" style="background-image:url(${sceneArt(s.id)}), ${sceneTint(s.id)}" data-go="scene" data-arg="${s.id}">
      ${!s.free && !Plus.has() ? `<span class="lock">${lockChip()}</span>` : ''}<span class="nm"><span class="jp">${esc(s.jp)}</span>${esc(s.title)}</span></button>`).join('');
  render(`
    <div class="top"><h1 class="logo"><img class="logoimg" src="img/logo.png" alt="Tsukau" width="185" height="50"></h1><span class="sp"></span>
      ${Plus.has() ? lockChip() : `<button class="chip plus" data-go="paywall" data-arg="home">${esc(t('locked'))}</button>`}</div>
    <section class="panel wod" aria-label="${esc(t('wordOfDay'))}">
      <div class="art"></div>
      <div class="txt">
        <span class="label">${esc(t('wordOfDay'))}</span>
        <div class="big ${w.w.length > 2 ? 'long' : ''}" lang="ja">${esc(w.w)}</div>
        <div class="rd" lang="ja">${esc(w.r)} ${sayBtn(w.w)}</div>
        <div class="mn">${esc(w.m)}</div>
      </div>
      <div class="acts"><button class="say" id="shareWod" aria-label="${esc(t('shareWord'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 15V3M7 8l5-5 5 5M5 13v7h14v-7"/></svg></button></div>
    </section>
    <section class="panel streak"><div class="art"></div><span class="flame">🔥</span>
      ${st ? `<span class="n">${st}</span><span class="t">${esc(t('streakDays', { n: '' }).trim())}</span>` : `<span class="t">${esc(t('streakZero'))}</span>`}</section>
    <button class="cta ${q.reviews.length + q.fresh.length ? '' : 'done'}" id="today5">${esc(q.reviews.length + q.fresh.length ? t('today5') : t('today5Done'))}</button>
    <h2 class="h2">${esc(t('scenes'))}<button class="iconbtn" style="width:38px;height:38px" data-go="scenes" aria-label="${esc(t('seeAll'))}">›</button></h2>
    <div class="hscroll">${scenes}</div>
    <div class="tiles">
      <button class="tile" data-go="learn"><span class="k">${esc(t('reviewDue'))}</span><span class="v">${q.reviews.length}</span></button>
      <button class="tile" data-go="kana"><span class="k">${esc(t('kana'))}</span><span class="v" lang="ja">あ</span><span class="bar"><i style="width:${Math.round(kanaGot / 46 * 100)}%"></i></span><span class="muted">${kanaGot} / 46</span></button>
      <button class="tile" data-go="learn"><span class="k">${esc(t('jlpt'))}</span><span class="v">N5</span><span class="bar purple"><i style="width:${n5.length ? Math.round(n5got / n5.length * 100) : 0}%"></i></span></button>
    </div>`, { tab: 'home' });
  $('#today5').onclick = () => startSession('n5', 'words');
  $('#shareWod').onclick = () => shareWord(w);
};

// ---------- 学習 ----------
function deckIds(lv, mode) { const list = mode === 'kanji' ? (D.kanji[lv] || []) : (D.vocab[lv] || []); return list.map(x => x.id); }
function itemById(id) {
  for (const lv of Object.keys(D.vocab)) { const v = D.vocab[lv].find(x => x.id === id); if (v) return { type: 'word', ...v }; }
  for (const lv of Object.keys(D.kanji)) { const k = D.kanji[lv].find(x => x.id === id); if (k) return { type: 'kanji', ...k }; }
  return null;
}
function newLimit() { return Plus.has() ? Math.max(FREE_NEW_PER_DAY, Math.min(MAX_NEW_PER_DAY, S.d.newPerDay || FREE_NEW_PER_DAY)) : FREE_NEW_PER_DAY; }
function queueFor(lv, mode) {
  return buildQueue(S.d.cards, deckIds(lv, mode), today(), { newLimit: newLimit(), newDoneToday: S.newDoneToday(today(), mode) });
}
const DECKS = [{ lv: 'n5', free: true }, { lv: 'n4', free: false }, { lv: 'n3', free: false }];
ROUTES.learn = async () => {
  render(`<div class="top"><h1 class="h1">${esc(t('learnTitle'))}</h1></div><div class="muted">…</div>`, { tab: 'learn' });
  await Promise.all(DECKS.map(d => (d.free || Plus.has()) ? loadDeck(d.lv) : Promise.resolve()));
  const cards = DECKS.map(d => {
    const open = d.free || Plus.has();
    const v = D.vocab[d.lv], k = D.kanji[d.lv];
    const qW = open ? queueFor(d.lv, 'words') : null, qK = open ? queueFor(d.lv, 'kanji') : null;
    const got = open ? v.filter(x => S.d.cards[x.id]).length : 0;
    return `<section class="panel pad seigaiha" style="margin-top:12px">
      <div style="display:flex;align-items:center;gap:10px"><span class="label">${esc(t('deck' + d.lv.toUpperCase()))}</span><span class="sp" style="flex:1"></span>${open ? '' : lockChip()}</div>
      <div class="muted" style="margin:6px 0 10px">${open ? esc(t('words', { n: v.length })) + ' · ' + esc(t('kanjiN', { n: k.length })) + ' · ' + got + ' / ' + v.length : esc(t('plusF2', { w: '2,806', k: '533' }))}</div>
      ${open ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <button class="ghost" style="margin:0" data-start="${d.lv}:words">${esc(t('studyWords'))} · ${qW.reviews.length + qW.fresh.length}</button>
        <button class="ghost" style="margin:0" data-start="${d.lv}:kanji">${esc(t('studyKanji'))} · ${qK.reviews.length + qK.fresh.length}</button></div>`
        : `<button class="ghost" style="margin:0" data-go="paywall" data-arg="learn">${esc(t('plusName'))}</button>`}
    </section>`;
  }).join('');
  render(`<div class="top"><h1 class="h1">${esc(t('learnTitle'))}</h1><span class="sp"></span></div>
    <button class="panel pad" style="width:100%;text-align:left;display:flex;align-items:center;gap:14px" data-go="kana">
      <span style="font-family:var(--jp);font-size:44px;font-weight:800;color:var(--gold2)">あア</span>
      <span><b style="font-size:18px">${esc(t('kanaTitle'))}</b><br><span class="muted">${esc(t('learned', { n: Object.keys(S.d.kana).filter(k => S.d.kana[k] > 0).length, total: 92 }))}</span></span></button>
    <button class="panel pad" style="width:100%;text-align:left;display:flex;align-items:center;gap:14px;margin-top:12px" data-go="name">
      <span style="font-family:var(--jp);font-size:34px;font-weight:800;color:var(--gold2)">ナマエ</span>
      <span><b style="font-size:18px">${esc(t('nameTitle'))}</b><br><span class="muted">${esc(S.d.nameKana || t('nameWhy'))}</span></span></button>
    ${cards}
    <p class="muted" style="margin-top:14px">${esc(Plus.has() ? t('newPerDay') + ': ' + newLimit() : t('newPerDayFree', { n: FREE_NEW_PER_DAY }))}</p>`, { tab: 'learn' });
  $$('[data-start]').forEach(b => b.onclick = () => { const [lv, mode] = b.dataset.start.split(':'); startSession(lv, mode); });
};

let SES = null;
async function startSession(lv, mode) {
  if (lv !== 'n5' && !Plus.has()) return go('paywall', 'learn');
  await loadDeck(lv);
  const q = queueFor(lv, mode);
  const list = [...q.reviews.map(id => ({ id, isNew: false })), ...q.fresh.map(id => ({ id, isNew: true }))];
  // 新しい語を復習の間に混ぜる(最初の1枚は新しい語にして、すぐ手応えが出るように)
  const mixed = []; const rv = list.filter(x => !x.isNew), nw = list.filter(x => x.isNew);
  while (rv.length || nw.length) { if (nw.length) mixed.push(nw.shift()); if (rv.length) mixed.push(rv.shift()); if (rv.length) mixed.push(rv.shift()); }
  SES = { lv, mode, list: mixed, i: 0, done: 0, again: [], overflow: q.overflow };
  if (!mixed.length) return renderSessionEmpty();
  renderCard();
}
function renderSessionEmpty() {
  render(`${topBar(t('learnTitle'), 'learn')}<section class="panel pad" style="text-align:center;margin-top:30px">${birdImg('sleep')}<h2 class="h2" style="justify-content:center">${esc(t('nothingDue'))}</h2><p class="sub">${esc(t('nothingDueSub'))}</p></section>
    ${!Plus.has() ? `<button class="ghost" data-go="paywall" data-arg="learn">${esc(t('plusF3'))}</button>` : ''}`, { tab: 'learn' });
}
function renderCard(showBack = false) {
  lastRoute = null;
  const it = SES.list[SES.i]; const item = itemById(it.id);
  if (!item) { SES.i++; return SES.i < SES.list.length ? renderCard() : finishSession(); }
  const total = SES.list.length; const left = total - SES.i;
  const cardState = S.d.cards[it.id];
  const isK = item.type === 'kanji';
  const big = isK ? item.k : item.w;
  const wl = big.length > 6 ? 'xlong' : big.length > 3 ? 'long' : '';
  const reading = isK ? '' : (item.r !== item.w ? item.r : '');
  const showReading = !isK && reading && (showBack || S.d.furigana);
  const back = showBack ? (isK
    ? `<div class="m">${esc(item.m)}</div><div class="ex" lang="ja">${esc(t('onyomi'))}: ${esc(item.on.join('、') || '—')}<br>${esc(t('kunyomi'))}: ${esc(item.kun.join('、') || '—')}</div><div class="muted">${esc(t('strokes', { n: item.sc }))}</div>`
    : `<div class="m">${esc(item.m)}</div>`) : '';
  const ivl = g => { const d = previewIvl(cardState, g, today()); return d <= 0 ? t('soon') : t('inDays', { n: d }); };
  render(`
    <div class="top"><button class="iconbtn" id="quit" aria-label="${esc(t('close'))}">✕</button><span class="sp"></span><span class="chip">${esc(t('deck' + SES.lv.toUpperCase()))}</span></div>
    <section class="panel prog"><span class="flame" style="font-size:30px">🔥</span><span class="left"><b>${left}</b> <span class="muted">${esc(t('leftToday', { n: '' }).trim())}</span></span>
      <span class="mid"><div class="muted">${esc(t('cardOf', { i: SES.i + 1, n: total }))}</div><div class="bar"><i style="width:${Math.round(SES.i / total * 100)}%"></i></div></span></section>
    <section class="panel fcard" id="fcard"><div class="art"></div>
      <span class="chip tag">${it.isNew ? esc(t('newWord')) : (showBack ? esc(t('back')) : 'Front')}</span><span class="label tag2" style="font-size:15px">${esc(isK ? t('kanjiLabel') : t('vocab'))}</span>
      <div class="w ${wl}" lang="ja">${esc(big)}</div>
      ${showReading ? `<div class="r" lang="ja">${esc(reading)}</div>` : ''}
      ${back}
      ${showBack || !isK ? sayBtn(isK ? (item.kun[0] || item.on[0] || item.k).replace(/[.\-]/g, '') : item.w) : ''}
      ${isK && showBack ? `<button class="ghost" style="width:auto;padding:0 18px;min-height:44px" id="strokeBtn">${esc(t('strokeOrder'))}</button>` : ''}
    </section>
    ${showBack ? `<div class="grades">
      <button class="grade g0" data-g="0">${esc(t('again'))}<small>${ivl(0)}</small></button>
      <button class="grade g1" data-g="1">${esc(t('hard'))}<small>${ivl(1)}</small></button>
      <button class="grade g2" data-g="2">${esc(t('good'))}<small>${ivl(2)}</small></button>
      <button class="grade g3" data-g="3">${esc(t('easy'))}<small>${ivl(3)}</small></button></div>`
      : `<button class="cta noarrow" id="show">${esc(t('showAnswer'))}</button>`}
  `, { tabs: false });
  $('#quit').onclick = () => go('learn');
  if (!showBack) { $('#show').onclick = () => renderCard(true); $('#fcard').onclick = e => { if (!e.target.closest('button')) renderCard(true); }; }
  else {
    $$('[data-g]').forEach(b => b.onclick = () => grade(+b.dataset.g));
    const sb = $('#strokeBtn'); if (sb) sb.onclick = () => showStroke(item.k);
  }
}
function grade(g) {
  const it = SES.list[SES.i]; const day = today();
  const prev = S.d.cards[it.id] || newCard(day);
  if (it.isNew && !S.d.cards[it.id]) S.addNew(day, SES.mode);
  S.d.cards[it.id] = review(prev, g, day);
  if (g === 0 && SES.again.filter(x => x === it.id).length < 2) { SES.list.push({ id: it.id, isNew: false }); SES.again.push(it.id); }
  SES.done++; S.touch(day); S.save();
  SES.i++;
  if (SES.i < SES.list.length) renderCard(); else finishSession();
}
function finishSession() {
  const st = S.streakNow(today());
  render(`<div class="ob">${birdImg('happy')}<h1 class="h1">${esc(t('sessionDone'))}</h1>
    <p class="sub">${esc(t('sessionDoneSub', { n: SES.done }))}</p>
    ${SES.overflow ? `<p class="muted">${esc(t('overflowNote', { n: SES.overflow }))}</p>` : ''}
    <section class="panel streak" style="justify-content:center"><span class="flame">🔥</span><span class="n">${st}</span><span class="t">${esc(t('streakDays', { n: '' }).trim())}</span></section>
    <button class="cta" id="shareW">${esc(t('shareWord'))}</button>
    <button class="ghost" data-go="home">${esc(t('done'))}</button></div>`, { tabs: false });
  $('#shareW').onclick = () => shareWord(wordForDay(today()));
}

// ---------- 書き順 ----------
async function strokeSvg(ch) {
  const all = await strokes(); const paths = all[ch]; if (!paths) return '';
  return `<svg class="stroke" viewBox="0 0 109 109" aria-label="${esc(t('strokeOrder'))}">${paths.map(d => `<path class="guide" d="${d}"/>`).join('')}${paths.map((d, i) => `<path class="s" data-i="${i}" d="${d}"/>`).join('')}</svg>`;
}
function animateStroke(root) {
  const ps = $$('path.s', root); let delay = 0;
  ps.forEach(p => {
    const L = p.getTotalLength ? p.getTotalLength() : 100;
    p.style.transition = 'none'; p.style.strokeDasharray = L; p.style.strokeDashoffset = L;
    p.getBoundingClientRect();
    const dur = Math.max(.35, L / 110);
    p.style.transition = `stroke-dashoffset ${dur}s ease ${delay}s`; p.style.strokeDashoffset = 0;
    delay += dur + .15;
  });
}
async function showStroke(ch, romaji) {
  const svg = await strokeSvg(ch);
  openSheet(`<div style="text-align:center"><div style="font-family:var(--jp);font-size:64px;font-weight:800" lang="ja">${esc(ch)}</div>
    ${romaji ? `<div class="sub" style="font-size:22px;font-weight:800">${esc(romaji)}</div>` : ''}
    ${svg || ''}<div style="display:flex;gap:10px;justify-content:center;margin-top:14px">${svg ? `<button class="ghost" style="width:auto;padding:0 20px;margin:0" id="replay">${esc(t('replay'))}</button>` : ''}${sayBtn(ch)}</div>
    <button class="ghost" id="closeS">${esc(t('close'))}</button></div>`, sh => {
    animateStroke(sh); const r = $('#replay', sh); if (r) r.onclick = () => animateStroke(sh); $('#closeS', sh).onclick = closeSheet;
  });
}

// ---------- かな ----------
let KSET = 'h';
ROUTES.kana = () => {
  const items = bySet(KSET); const map = Object.fromEntries(items.map(x => [x.r, x]));
  const rows = [['a', 'i', 'u', 'e', 'o'], ['ka', 'ki', 'ku', 'ke', 'ko'], ['sa', 'shi', 'su', 'se', 'so'], ['ta', 'chi', 'tsu', 'te', 'to'], ['na', 'ni', 'nu', 'ne', 'no'], ['ha', 'hi', 'fu', 'he', 'ho'], ['ma', 'mi', 'mu', 'me', 'mo'], ['ya', null, 'yu', null, 'yo'], ['ra', 'ri', 'ru', 're', 'ro'], ['wa', null, null, null, 'wo'], ['n', null, null, null, null]];
  const cells = rows.flat().map(r => { if (!r) return '<span class="kcell empty"></span>'; const x = map[r]; return `<button class="kcell ${S.d.kana[x.id] ? 'got' : ''}" data-k="${x.ch}" data-r="${r}"><span class="c" lang="ja">${x.ch}</span><span class="r">${r}</span></button>`; }).join('');
  render(`${topBar(t('kanaTitle'), 'learn')}
    <div class="seg"><button class="${KSET === 'h' ? 'on' : ''}" data-set="h">${esc(t('hiragana'))}</button><button class="${KSET === 'k' ? 'on' : ''}" data-set="k">${esc(t('katakana'))}</button></div>
    <button class="cta" id="kq">${esc(t('kanaQuiz'))} · 10</button>
    <p class="muted" style="text-align:center">${esc(t('learned', { n: items.filter(x => S.d.kana[x.id]).length, total: 46 }))} · ${esc(t('strokeOrder'))}: tap</p>
    <div class="kgrid">${cells}</div>`, { tab: 'learn' });
  $$('[data-set]').forEach(b => b.onclick = () => { KSET = b.dataset.set; go('kana'); });
  $$('[data-k]').forEach(b => b.onclick = () => showStroke(b.dataset.k, b.dataset.r));
  $('#kq').onclick = () => kanaQuiz(KSET, 10, () => go('kana'));
};
// 10問。まだ覚えていない字を優先する
function kanaQuiz(set, n, onEnd, only, skipEnd) {
  const pool = bySet(set);
  let src = only ? pool.filter(x => only.includes(x.r)) : pool.slice().sort((a, b) => (S.d.kana[a.id] || 0) - (S.d.kana[b.id] || 0) || Math.random() - .5).slice(0, n);
  src = src.sort(() => Math.random() - .5);
  const Q = { list: src.map(it => makeQuiz(it, pool)), items: src, i: 0, ok: 0, set, onEnd, skipEnd };
  renderQ(Q);
}
function renderQ(Q, picked) {
  lastRoute = null;
  const q = Q.list[Q.i]; const it = Q.items[Q.i];
  const answered = picked !== undefined; const right = answered && picked === q.answer;
  render(`
    <div class="top"><button class="iconbtn" id="quitQ" aria-label="${esc(t('close'))}">✕</button><span class="sp"></span></div>
    <section class="panel prog"><span class="label" style="font-size:18px">${esc(t('kanaQuiz'))}</span><span class="mid"><div class="muted">${Q.i + 1} / ${Q.list.length}</div><div class="bar"><i style="width:${Math.round((Q.i + (answered ? 1 : 0)) / Q.list.length * 100)}%"></i></div></span></section>
    <section class="panel pad" style="margin-top:14px;padding-bottom:22px">
      <div class="qhead">${esc(t('whichReading'))}</div>
      <div class="qbig" lang="ja">${esc(q.q)}</div>
      <div class="choices">${q.choices.map(c => `<button class="choice ${answered && c === q.answer ? 'ok' : ''} ${answered && c === picked && c !== q.answer ? 'ng' : ''}" data-c="${c}" ${answered ? 'disabled' : ''}>${esc(c)}</button>`).join('')}</div>
      ${answered ? `<div class="cheer pop">${birdImg(right ? 'happy' : 'think', '')}<div class="msg ${right ? 'ok' : 'ng'}">${esc(right ? t('correct') : t('wrong', { a: q.answer }))}<small lang="ja">${esc(q.q)} = ${esc(q.answer)}</small></div></div>
        <button class="cta" id="nextQ">${esc(t('continue'))}</button>` : ''}
    </section>`, { tabs: false });
  $('#quitQ').onclick = () => Q.onEnd(Q);
  if (!answered) $$('[data-c]').forEach(b => b.onclick = () => {
    const ok = b.dataset.c === q.answer;
    if (ok) { Q.ok++; S.d.kana[it.id] = (S.d.kana[it.id] || 0) + 1; } else S.d.kana[it.id] = Math.max(0, (S.d.kana[it.id] || 0) - 1);
    S.touch(today()); S.save();
    if (TTS.available) TTS.speak(q.q);
    renderQ(Q, b.dataset.c);
  });
  else $('#nextQ').onclick = () => { Q.i++; if (Q.i < Q.list.length) renderQ(Q); else if (Q.skipEnd) Q.onEnd(Q); else quizEnd(Q); };
}
function quizEnd(Q) {
  render(`<div class="ob">${birdImg('happy')}<h1 class="h1">${esc(t('quizScore', { c: Q.ok, n: Q.list.length }))}</h1>
    <button class="cta" id="qe">${esc(t('continue'))}</button></div>`, { tabs: false });
  $('#qe').onclick = () => Q.onEnd(Q);
}

// ---------- 名前 ----------
const KPAD = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポャュョッァィゥェォヴー・'.split('');
const K2R = (() => { const m = {}; BASIC.forEach(x => m[x.k] = x.r); Object.assign(m, { ガ: 'ga', ギ: 'gi', グ: 'gu', ゲ: 'ge', ゴ: 'go', ザ: 'za', ジ: 'ji', ズ: 'zu', ゼ: 'ze', ゾ: 'zo', ダ: 'da', ヂ: 'ji', ヅ: 'zu', デ: 'de', ド: 'do', バ: 'ba', ビ: 'bi', ブ: 'bu', ベ: 'be', ボ: 'bo', パ: 'pa', ピ: 'pi', プ: 'pu', ペ: 'pe', ポ: 'po', ャ: 'ya', ュ: 'yu', ョ: 'yo', ッ: '(pause)', ァ: 'a', ィ: 'i', ゥ: 'u', ェ: 'e', ォ: 'o', ヴ: 'vu', ー: '(long)', '・': '·' }); return m; })();
function nameView({ onboarding = false } = {}) {
  let input = S.d.name || ''; let kana = S.d.nameKana || ''; let edited = false; let editing = false;
  const draw = () => {
    const res = nameToKatakana(input); if (!edited) kana = res.kana;
    const chars = [...kana];
    const html = `
      ${onboarding ? `<div class="top"><span class="sp"></span></div><p class="sub" style="text-align:center">${esc(t('obFirst'))}</p>` : topBar(t('nameTitle'), 'learn')}
      <section class="panel pad">
        <label class="muted" for="nm">${esc(t('namePrompt'))}</label>
        <input id="nm" class="field" style="margin-top:8px" autocomplete="given-name" maxlength="30" placeholder="${esc(t('namePlaceholder'))}" value="${esc(input)}">
      </section>
      <section class="panel pad" style="margin-top:12px;text-align:center">
        <span class="label">${esc(t('nameResult'))}</span>
        <div class="namebig" lang="ja" id="nb">${esc(kana)}</div>
        <div class="breakdown">${chars.map((c, i) => `<button data-ci="${i}"><span class="c" lang="ja">${esc(c)}</span><span class="r">${esc(K2R[c] || '')}</span></button>`).join('')}</div>
        <p class="muted">${esc(kana ? (res.known === res.words && !edited ? t('nameKnown') : t('nameGuess')) : t('nameWhy'))}</p>
        ${kana ? `<div style="display:flex;gap:10px;justify-content:center">${sayBtn(kana)}<button class="ghost" style="width:auto;padding:0 18px;margin:0;min-height:44px" id="edit">${esc(t('nameEdit'))}</button></div>` : ''}
        ${editing ? `<div class="keypad">${KPAD.map(k => `<button data-kp="${k}" lang="ja">${k}</button>`).join('')}<button data-kp="⌫" style="grid-column:span 2">⌫</button></div>` : ''}
      </section>
      ${onboarding ? `<button class="cta" id="nameNext" ${kana ? '' : 'disabled'}>${esc(t('next'))}</button>`
        : `<button class="cta" id="nameShare" ${kana ? '' : 'disabled'}>${esc(t('nameShare'))}</button>`}`;
    render(html, { tabs: !onboarding, tab: 'learn' });
    const inp = $('#nm');
    inp.oninput = () => { input = inp.value; edited = false; const pos = inp.selectionStart; draw(); const n = $('#nm'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { } };
    const ed = $('#edit'); if (ed) ed.onclick = () => { editing = !editing; draw(); };
    $$('[data-kp]').forEach(b => b.onclick = () => { edited = true; kana = b.dataset.kp === '⌫' ? [...kana].slice(0, -1).join('') : (kana + b.dataset.kp).slice(0, 16); draw(); });
    $$('[data-ci]').forEach(b => b.onclick = () => TTS.speak(b.querySelector('.c').textContent));
    const save = () => { S.d.name = input.trim(); S.d.nameKana = kana; S.save(); };
    if (onboarding) $('#nameNext').onclick = () => { save(); obKana(); };
    else $('#nameShare').onclick = async () => { save(); await shareName(); };
  };
  draw();
}
ROUTES.name = () => nameView();

// ---------- 場面 ----------
ROUTES.scenes = () => {
  render(`<div class="top"><h1 class="h1">${esc(t('scenesTitle'))}</h1></div><p class="sub" style="margin-top:-6px">${esc(t('scenesSub'))}</p>
    <div class="slist">${D.scenes.map(s => `<button class="scard" style="background-image:url(${sceneArt(s.id)}), ${sceneTint(s.id)}" data-go="scene" data-arg="${s.id}">
      ${!s.free && !Plus.has() ? `<span class="lock">${lockChip()}</span>` : ''}<span class="nm"><span class="jp">${esc(s.jp)}</span>${esc(s.title)}<br><span class="muted">${esc(s.sub)}</span></span></button>`).join('')}</div>`, { tab: 'scenes' });
};
// 場面の絵の上に、最初の「言われる一言」と「返す一言」を吹き出しで出す(無料で見せるのは1つ目だけ)
function bubbles(s, open) {
  const a = s.lines.find(l => l.who === 'staff') || s.lines[0];
  const b = open ? s.lines.find(l => l.who === 'you' && l !== a) : null;
  const one = (l, cls) => `<div class="bub ${cls}"><div class="jp" lang="ja">${esc(l.jp)}</div><div class="en">${esc(l.en)}</div></div>`;
  return (a ? one(a, 'b1') : '') + (b ? one(b, 'b2') : '');
}
ROUTES.scene = (id) => {
  const s = D.scenes.find(x => x.id === id) || D.scenes[0];
  const open = s.free || Plus.has();
  const lines = s.lines.map((l, i) => {
    const lock = !open && i > 0;
    return `<section class="panel line ${lock ? 'locked' : ''}" ${lock ? 'aria-hidden="true"' : ''}>
      <span class="who ${l.who}">${esc(l.who === 'staff' ? t('staff') : t('you'))}</span>
      <div class="body"><div class="jp" lang="ja">${esc(lock ? '・・・・・' : l.jp)}</div>${lock ? '' : `${S.d.furigana && l.kana !== l.jp ? `<div class="kn" lang="ja">${esc(l.kana)}</div>` : ''}<div class="en">${esc(l.en)}</div>${l.tip ? `<div class="tip">${esc(l.tip)}</div>` : ''}`}</div>
      ${lock ? '' : sayBtn(l.jp)}</section>`;
  }).join('');
  render(`${topBar(s.title, 'scenes')}
    <div class="scene-hero" style="background-image:url(${sceneArt(s.id)}), ${sceneTint(s.id)}">${bubbles(s, open)}<div class="t"><div class="jp" lang="ja">${esc(s.jp)}</div><div class="sub">${esc(s.sub)}</div></div></div>
    ${!open ? `<p class="muted">${esc(t('tryFirst'))}</p>` : ''}
    ${lines}
    ${!open ? `<button class="cta" data-go="paywall" data-arg="scene:${s.id}">${esc(t('plusName'))}</button>` : ''}`, { tab: 'scenes' });
  if (open) S.touch(today());
};

// ---------- 課金画面 ----------
let PW_FROM = 'home'; let PW_PICK = 'annual';
ROUTES.paywall = (from) => { PW_FROM = from || 'home'; drawPaywall(); if (Plus.native() && !Plus.pkgs.annual) Plus.load().catch(() => { }); };
function pwBack() { const f = PW_FROM || 'home'; if (f.startsWith('scene:')) go('scene', f.slice(6)); else go(f); }
function drawPaywall() {
  const nat = Plus.native();
  const a = Plus.pkgs.annual, m = Plus.pkgs.monthly, l = Plus.pkgs.lifetime;
  const trial = Plus.trialDays(a);
  const nScenes = D.scenes.length;
  const radio = on => `<span class="radio ${on ? 'on' : ''}" aria-hidden="true"></span>`;
  const plans = nat ? `
    <button class="plan ${PW_PICK === 'annual' ? 'on' : ''}" data-plan="annual" aria-pressed="${PW_PICK === 'annual'}">${trial ? `<span class="badge">🎁 ${esc(t('trialBadge', { n: trial }))}</span>` : ''}
      <span class="pl"><span class="nm">${esc(t('yearly'))}</span><span class="pm">${esc(Plus.price(a) ? t('billedYearly', { p: Plus.price(a) }) : '')}</span></span>
      <span class="pr">${esc(Plus.perMonth(a) ? t('perMonth', { p: Plus.perMonth(a) }) : Plus.price(a))}</span>${radio(PW_PICK === 'annual')}</button>
    <button class="plan small ${PW_PICK === 'monthly' ? 'on' : ''}" data-plan="monthly" aria-pressed="${PW_PICK === 'monthly'}"><span class="pl"><span class="nm">${esc(t('monthly'))}</span></span><span class="pr">${esc(Plus.price(m) ? t('perMonth', { p: Plus.price(m) }) : '')}</span>${radio(PW_PICK === 'monthly')}</button>
    ${l ? `<button class="link gold" data-plan="lifetime">${esc(t('lifetime'))} · ${esc(Plus.price(l))} ›</button>` : ''}` : `<p class="sub" style="margin-top:16px">${esc(t('webOnly'))}</p>${PLAY_URL ? `<a class="cta" href="${PLAY_URL}" target="_blank" rel="noopener">${esc(t('getAndroid'))}</a>` : ''}`;
  const buyLabel = PW_PICK === 'annual' && trial ? t('startTrial') : PW_PICK === 'lifetime' ? t('buyOnce') : t('subscribe');
  const fine = PW_PICK === 'annual' && trial && Plus.price(a) ? t('afterTrial', { n: trial, p: Plus.price(a) }) : PW_PICK === 'lifetime' ? '' : t('renewNote');
  render(`<div class="pwhero"><button class="iconbtn" id="pwClose" aria-label="${esc(t('close'))}">✕</button>
      <div class="pwt"><div class="h1">${esc(t('plusName'))} <span class="crown">♛</span></div><div class="sub">${esc(t('plusTitle'))}</div></div>${birdImg('happy', 'pwbird')}</div>
    <div class="pw">
      ${Plus.has() ? `<p class="sub" style="font-size:18px">${esc(t('plusActive'))}</p>` : plans}
      <div class="panel feat">
        <div><i class="fi f1">⛩</i>${esc(t('plusF1', { n: nScenes }))}</div>
        <div><i class="fi f2">▲</i>${esc(t('plusF2', { w: '2,806', k: '533' }))}</div>
        <div><i class="fi f3">✎</i>${esc(t('plusF3'))}</div></div>
      ${nat && !Plus.has() ? `<button class="cta" id="buy" ${Plus.busy ? 'disabled' : ''}>${esc(buyLabel)}</button><p class="fine">${esc(fine)}</p>` : ''}
      <div class="status" id="pwStatus">${esc(Plus.status)}</div>
      <div class="pwlinks small"><a class="link" href="${SITE}terms.html" target="_blank" rel="noopener">${esc(t('terms'))}</a><span class="sep"></span><a class="link" href="${SITE}privacy.html" target="_blank" rel="noopener">${esc(t('privacy'))}</a></div>
      <div class="pwlinks"><button class="link" id="notNow">${esc(t('notNow'))}</button>${nat ? `<span class="sep"></span><button class="link" id="restore">${esc(t('restore'))}</button>` : ''}</div>
    </div>`, { tabs: false });
  $('#pwClose').onclick = pwBack; $('#notNow').onclick = pwBack;
  $$('[data-plan]').forEach(b => b.onclick = () => { PW_PICK = b.dataset.plan; drawPaywall(); });
  const buy = $('#buy'); if (buy) buy.onclick = () => Plus.buy(PW_PICK);
  const rs = $('#restore'); if (rs) rs.onclick = () => Plus.restore();
}
Plus.onChange = () => { if ($('#pwStatus')) drawPaywall(); };

// ---------- 自分・設定 ----------
ROUTES.me = () => {
  const day = today(); const st = S.d.streak;
  const learned = Object.keys(S.d.cards).filter(k => k.startsWith('v')).length;
  const kanaN = Object.keys(S.d.kana).filter(k => S.d.kana[k] > 0).length;
  const rem = S.d.reminder; const hh = String(rem.hour).padStart(2, '0') + ':' + String(rem.minute).padStart(2, '0');
  render(`<div class="top"><h1 class="h1">${esc(t('meTitle'))}</h1><span class="sp"></span>${Plus.has() ? lockChip() : ''}</div>
    <div class="stats">
      <section class="panel stat"><div class="v">${S.streakNow(day)}</div><div class="k">${esc(t('statsStreak'))}</div></section>
      <section class="panel stat"><div class="v">${st.best}</div><div class="k">${esc(t('statsBest'))}</div></section>
      <section class="panel stat"><div class="v">${learned}</div><div class="k">${esc(t('statsLearned'))}</div></section>
      <section class="panel stat"><div class="v">${kanaN}</div><div class="k">${esc(t('statsKana'))}</div></section>
    </div>
    <h2 class="h2">${esc(t('settings'))}</h2>
    <section class="panel">
      <div class="row"><span class="k">${esc(t('dailyReminder'))}</span>${Notify.supported() ? `<button class="switch ${rem.on ? 'on' : ''}" id="remSw" role="switch" aria-checked="${rem.on}"></button>` : `<span class="muted">${esc(t('reminderWeb'))}</span>`}</div>
      ${Notify.supported() && rem.on ? `<div class="row"><span class="k">${esc(t('reminderTime'))}</span><input type="time" id="remT" value="${hh}"></div>` : ''}
      <div class="row"><span class="k">${esc(t('showFurigana'))}</span><button class="switch ${S.d.furigana ? 'on' : ''}" id="furi" role="switch" aria-checked="${S.d.furigana}"></button></div>
      ${Plus.has() ? `<div class="row"><span class="k">${esc(t('newPerDay'))}</span><select id="npd">${[5, 10, 15, 20, 30].map(n => `<option ${n === newLimit() ? 'selected' : ''}>${n}</option>`).join('')}</select></div>` : ''}
      ${!TTS.available ? `<div class="row"><span class="muted">${esc(t('speechOff'))}</span></div>` : ''}
    </section>
    <section class="panel" style="margin-top:12px">
      <div class="row"><button class="rowbtn" data-go="paywall" data-arg="me"><span class="k">${esc(t('plusName'))}</span><span class="v">›</span></button></div>
      <div class="row"><button class="rowbtn" data-go="credits"><span class="k">${esc(t('credits'))}</span><span class="v">›</span></button></div>
      <div class="row"><button class="rowbtn" id="reset"><span class="k" style="color:#ff9c8f">${esc(t('resetAll'))}</span></button></div>
    </section>`, { tab: 'me' });
  const sw = $('#remSw'); if (sw) sw.onclick = async () => {
    if (!S.d.reminder.on) { const r = await Notify.enable(); if (r !== 'ok') { toast(t('notifDenied')); return; } S.d.reminder.on = true; await scheduleReminders(); }
    else { S.d.reminder.on = false; await Notify.cancelAll(); }
    S.save(); go('me');
  };
  const rt = $('#remT'); if (rt) rt.onchange = async () => { const [h, m] = rt.value.split(':').map(Number); S.d.reminder.hour = h || 0; S.d.reminder.minute = m || 0; S.save(); await scheduleReminders(); };
  $('#furi').onclick = () => { S.d.furigana = !S.d.furigana; S.save(); go('me'); };
  const npd = $('#npd'); if (npd) npd.onchange = () => { S.d.newPerDay = +npd.value; S.save(); };
  $('#reset').onclick = () => { if (confirm(t('resetConfirm'))) { S.reset(); location.reload(); } };
};
async function scheduleReminders() {
  if (!S.d.reminder.on) return;
  await Notify.schedule(S.d.reminder.hour, S.d.reminder.minute, d => wordForDay(dayNumber(d)));
}
ROUTES.credits = () => {
  render(`${topBar(t('creditsTitle'), 'me')}<section class="panel pad credits">
    <p><b>Tsukau</b> is made by an independent developer in Japan. The Scenes phrases are written for this app.</p>
    <p><b>Vocabulary lists</b>: JLPT word lists by Jonathan Waller (tanos.co.uk, CC BY), via <a href="https://github.com/jamsinclair/open-anki-jlpt-decks" target="_blank" rel="noopener">open-anki-jlpt-decks</a> (MIT). English glosses may come from JMdict. We treat this data as CC BY-SA 4.0.</p>
    <p><b>Kanji readings and meanings</b>: <a href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project" target="_blank" rel="noopener">KANJIDIC2</a> by the Electronic Dictionary Research and Development Group, used under the <a href="https://www.edrdg.org/edrdg/licence.html" target="_blank" rel="noopener">EDRDG licence</a> (CC BY-SA 4.0). JLPT levels from <a href="https://github.com/davidluzgouveia/kanji-data" target="_blank" rel="noopener">kanji-data</a> (MIT).</p>
    <p><b>Stroke order</b>: <a href="https://kanjivg.tagaini.net/" target="_blank" rel="noopener">KanjiVG</a> by Ulrich Apel, CC BY-SA 3.0.</p>
    <p>The data files (in the app's <code>data</code> folder) are shared under the same licences. JLPT is a test run by the Japan Foundation and JEES; this app is not affiliated with them.</p>
    <p><a href="${SITE}privacy.html" target="_blank" rel="noopener">${esc(t('privacy'))}</a> · <a href="${SITE}terms.html" target="_blank" rel="noopener">${esc(t('terms'))}</a></p>
    <p><b>Privacy</b>: your progress stays on this device. The app does not create an account or collect personal data. Purchases are handled by Google Play and RevenueCat.</p>
  </section>`, { tab: 'me' });
};

// ---------- シェア ----------
async function shareWord(w) {
  try {
    const st = S.streakNow(today());
    const cv = await drawCard({ big: w.w, reading: w.r, meaning: w.m, label: t('wordOfDay'), streakText: st ? t(st === 1 ? 'streakDay' : 'streakDays', { n: st }) : '', bg: 'img/share_bg.jpg', mascot: IMG.bird, logo: 'img/logo.png' });
    const r = await shareImage(await canvasBlob(cv), `tsukau-${w.w}.png`, `${w.w} (${w.r}) — ${w.m}`);
    if (r === 'saved') toast(t('shareSaved'));
    return cv;
  } catch (e) { toast(t('shareFail')); }
}
async function shareName() {
  try {
    const cv = await drawCard({ big: S.d.nameKana, reading: S.d.name, meaning: '', label: t('nameTitle'), bg: 'img/share_bg.jpg', mascot: IMG.happy, logo: 'img/logo.png' });
    const r = await shareImage(await canvasBlob(cv), 'tsukau-name.png', `${S.d.name} → ${S.d.nameKana}`);
    if (r === 'saved') toast(t('shareSaved'));
  } catch (e) { toast(t('shareFail')); }
}

// ---------- 初回の流れ: あいさつ → 目的 → 名前 → ひらがな5字 → できた → 課金画面(1回だけ) ----------
ROUTES.onboard = () => {
  const goals = [['anime', 'goalAnime', '漫'], ['travel', 'goalTravel', '旅'], ['jlpt', 'goalJlpt', '試'], ['fun', 'goalFun', '楽']];
  render(`<div class="ob">${birdImg('bird')}<h1 class="h1">${esc(t('obHello'))}</h1><p class="sub">${esc(t('obSub'))}</p>
    <p class="label" style="justify-content:center;margin-top:14px">${esc(t('obGoal'))}</p>
    <div class="goals">${goals.map(([id, k, e]) => `<button data-goal="${id}" class="${S.d.goal === id ? 'on' : ''}"><span class="e" lang="ja">${e}</span>${esc(t(k))}</button>`).join('')}</div>
    <button class="cta" id="obStart" ${S.d.goal ? '' : 'disabled'}>${esc(t('start'))}</button></div>`, { tabs: false });
  $$('[data-goal]').forEach(b => b.onclick = () => { S.d.goal = b.dataset.goal; S.save(); go('onboard'); });
  $('#obStart').onclick = () => nameView({ onboarding: true });
};
function obKana() {
  kanaQuiz('h', 5, (Q) => {
    S.d.onboarded = true; S.save();
    render(`<div class="ob">${birdImg('happy')}<h1 class="h1">${esc(t('obDone'))}</h1>
      ${S.d.nameKana ? `<div class="namebig" lang="ja">${esc(S.d.nameKana)}</div>` : ''}
      <p class="sub">${esc(t('quizScore', { c: Q.ok, n: Q.list.length }))}</p>
      <button class="cta" id="obEnd">${esc(t('continue'))}</button></div>`, { tabs: false });
    $('#obEnd').onclick = () => {
      if (!S.d.paywallSeen && !Plus.has()) { S.d.paywallSeen = true; S.save(); go('paywall', 'home'); }
      else go('home');
    };
  }, ['a', 'i', 'u', 'e', 'o'], true);
}

// ---------- 起動 ----------
async function boot() {
  setLang((navigator.language || 'en').slice(0, 2));
  $$('[data-t]').forEach(el => el.textContent = t(el.dataset.t));
  $$('#tabs button').forEach(b => b.onclick = () => go(b.dataset.tab));
  S.load(); Plus.restoreLocal();
  const C = window.Capacitor;
  if (C && C.Plugins && C.Plugins.App && C.Plugins.App.addListener) C.Plugins.App.addListener('backButton', () => { if (!$('#sheet').classList.contains('hidden')) closeSheet(); else if (curTab !== 'home' || SES) { SES = null; go('home'); } else C.Plugins.App.exitApp(); });
  try { [D.scenes, D.wod] = await Promise.all([json('data/scenes.json'), json('data/wod.json'), loadDeck('n5')]); } catch (e) { view().innerHTML = '<p class="sub" style="padding:30px">Could not load data.</p>'; return; }
  TTS.init().then(ok => { if (ok && view().querySelector('.wod, .fcard, .line, .namebig')) { /* 聞くボタンを出すため描き直す */ const a = document.activeElement; if (!a || a.tagName !== 'INPUT') rerender(); } });
  if (Plus.native()) setTimeout(() => Plus.load().catch(() => { }), 800);
  if (S.d.reminder.on) scheduleReminders();
  const start = TEST && params.get('screen');
  if (start) go(start, params.get('arg') || undefined);
  else if (!S.d.onboarded) go('onboard');
  else go('home');
  window.__tsukau = { S, Plus, go, D, today, wordForDay, TTS, startSession, shareWord, drawCard };
}
let lastRoute = null;
const _go = go;
function rerender() { if (lastRoute) _go(lastRoute[0], lastRoute[1]); }
for (const k of Object.keys(ROUTES)) { const f = ROUTES[k]; ROUTES[k] = (a) => { lastRoute = [k, a]; return f(a); }; }
boot();
