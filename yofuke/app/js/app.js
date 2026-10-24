// よふけの預かり所 画面。画面の流れは ChatGPT の案(design/chatgpt/提案の要点.txt)どおり。
import { AXES, TYPES, TYPE_ORDER, DETAIL_LABELS } from './types.js';
import { STORIES } from './story.js';
import { judge, compat } from './judge.js';
import { openStore } from './storage.js';
import { createPurchase } from './purchase.js';
import { drawCard } from './card.js';
import { shareCanvas, shareText, HASHTAG } from './share.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let ls = null; try { ls = window.localStorage; ls.getItem('x'); } catch (e) { ls = null; }
const store = openStore(ls);
const shop = createPurchase();
const view = $('#screen'), sheet = $('#sheet'), app = $('#app');
const S = { stack: [], cur: null, story: null, answers: [], idx: 0, result: null, card: null };
const CH_TINT = ['rain', 'amber', 'violet', 'dawn'];
const itemImg = k => `img/thumb_${k}.webp`;
const sceneImg = p => `img/scene_${p}.webp`;
const heroImg = k => `img/hero_${k}.webp`;
const thumbImg = k => `img/thumb_${k}.webp`;

function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2200); }
function go(name, arg, { push = true } = {}) {
  if (push && S.cur) S.stack.push(S.cur);
  S.cur = { name, arg };
  closeSheet(true);
  view.scrollTop = 0; window.scrollTo(0, 0);
  SCREENS[name](arg);
  view.focus({ preventScroll: true });
}
function back() {
  if (!sheet.hidden) { closeSheet(); return true; }
  const prev = S.stack.pop();
  if (!prev) { if (S.cur && S.cur.name !== 'home') { go('home', null, { push: false }); return true; } return false; }
  S.cur = prev; view.scrollTop = 0; SCREENS[prev.name](prev.arg); return true;
}
function home() { S.stack = []; go('home', null, { push: false }); }
function mode(m) { app.dataset.mode = m; }
const priceLine = () => `${esc(shop.price)}`;
const LEGAL = `<p class="legal"><a href="https://yurustudio.github.io/yofuke/privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a><span aria-hidden="true"> ・ </span><a href="https://yurustudio.github.io/yofuke/terms.html" target="_blank" rel="noopener">利用規約</a></p>`;
const playUrl = () => { const c = window.YF_CONFIG; return (c && c.playUrl) || ''; };
const tag = (t, cls = '') => `<span class="tagmark ${cls}" aria-hidden="true"></span>${t}`;

// ---------- 01 入口 / 07 帳場 ----------
function screenHome() {
  mode('night');
  const last = store.latest('main');
  const prog = store.progress('main');
  if (!last) {
    view.innerHTML = `
    <section class="entry">
      <button id="gear" class="iconbtn gear" aria-label="設定"></button>
      <div class="entry-art"><img src="img/entrance.webp" alt="運河ぞいの階段を下りた所にある、灯りのともる小さな店"></div>
      <div class="pad">
        <h1 class="title">よふけの預かり所</h1>
        <p class="sub">夜だけひらく、わすれものの店。</p>
        ${prog ? `<p class="lead">おかえりなさい。夜は、まだ続いています。</p>` : `<p class="lead">今夜は、あなたが一晩だけの係です。<br>訪ねてくる人たちに、あなたならどう応えますか。</p>`}
        ${prog ? `<button id="resume" class="btn lamp">続きから(${prog.answers.length + 1} / ${STORIES.main.count})</button>
                  <button id="start" class="btn ghost">はじめから</button>`
               : `<button id="start" class="btn lamp">今夜の係をはじめる</button>`}
        <p class="fine">登録なし・回答はこの端末の中だけ<br>物語を楽しむための遊びの診断です</p>
      </div>
    </section>`;
  } else {
    const T = TYPES[last.key];
    const sec = store.latest('second');
    const sprog = store.progress('second');
    view.innerHTML = `
    <section class="desk">
      <div class="desk-art"><img src="img/desk.webp" alt="">
        <header class="desk-h"><p class="eyebrow">帳場</p><h1 class="title">よふけの預かり所</h1></header>
        <button id="gear" class="iconbtn gear" aria-label="設定"></button>
      </div>
      <div class="desk-card">
        <p class="dc-h">${tag('あなたの品')}</p>
        <button id="lastRes" class="desk-last">
          <img src="${thumbImg(last.key)}" alt="">
          <span class="dl-txt"><span class="dl-name">${esc(T.name)}</span><span class="dl-catch">${esc(T.catch)}</span></span>
        </button>
      </div>
      ${prog ? `<button id="resume" class="btn lamp moon">続きから(${prog.answers.length + 1} / ${STORIES.main.count})</button>` : ''}
      <button id="again" class="btn ${prog ? 'ghost' : 'lamp moon'}">もう一度、係になる</button>
      <h2 class="sec-h">${tag('この町に、もう少し')}</h2>
      <div class="desk-grid">
        ${deskItem('toDetail', 'detail', 'あなたの品の<br>詳しいお話')}
        ${deskItem('toCompat', 'compat', 'ふたりの<br>わすれもの')}
        ${deskItem('toZukan', 'zukan', '16の<br>わすれもの図鑑')}
        ${deskItem('toSecond', 'second', sec ? '夜明けの配達<br>もう一度' : sprog ? '夜明けの配達<br>続きから' : 'もう一つの<br>物語')}
      </div>
      ${shop.owned ? `<p class="fine center">買い切り済み。すべて開いています。</p>` : `<button id="openShop" class="shopline"><span class="key" aria-hidden="true"></span><span><span class="sl-1">4つとも <b class="price">${priceLine()}</b> の買い切り</span><span class="sl-2">1回払い・月額なし</span></span></button>`}
      <div class="rule-star" aria-hidden="true"></div>
      <p class="fine center">物語を楽しむための遊びの診断です。結果は目安です。</p>
    </section>`;
    $('#lastRes').onclick = () => { S.result = { story: 'main', key: last.key, lean: last.lean }; go('result', 'main'); };
    $('#again').onclick = () => startStory('main', true);
    $('#toDetail').onclick = () => paid(() => go('detail', last.key));
    $('#toCompat').onclick = () => go('compat', last.key);
    $('#toZukan').onclick = () => go('zukan');
    $('#toSecond').onclick = () => paid(() => startStory('second', !sprog));
    const os = $('#openShop'); if (os) os.onclick = () => openPaywall();
  }
  $('#gear').onclick = () => go('settings');
  const st = $('#start'); if (st) st.onclick = () => startStory('main', true);
  const rs = $('#resume'); if (rs) rs.onclick = () => startStory('main', false);
}
function deskItem(id, ic, t) {
  return `<button id="${id}" class="desk-item"><span class="di-pic pic-${ic}" aria-hidden="true">${shop.owned || ic === 'compat' ? '' : '<i class="tagbadge"></i>'}</span><span class="di-t">${t}</span><span class="mi-go" aria-hidden="true"></span></button>`;
}
function paid(fn) { if (shop.owned) fn(); else openPaywall(); }

// ---------- 02 プロローグ / 03 物語 / 04 夜明け ----------
function startStory(id, fresh) {
  const st = STORIES[id];
  const p = store.progress(id);
  S.story = id;
  S.answers = fresh || !p ? [] : p.answers.slice(0, st.count);
  if (fresh) store.clearProgress(id);
  if (S.answers.length >= st.count) S.answers.length = st.count - 1;
  if (S.answers.length === 0) go('prologue', id); else go('scene', S.answers.length);
}
function screenPrologue(id) {
  mode('night');
  const st = STORIES[id];
  view.innerHTML = `
  <section class="prologue">
    <header class="bar"><button id="back" class="iconbtn backbtn" aria-label="戻る"></button><span class="bar-t">${id === 'main' ? 'プロローグ' : 'もう一つの物語'}</span><span></span></header>
    <figure class="plate"><img src="${sceneImg(id === 'main' ? 'door' : 'morning')}" alt=""></figure>
    <div class="pad">
      <h1 class="title md">${esc(st.title)}</h1>
      ${st.opening.map(t => `<p class="prose">${esc(t)}</p>`).join('')}
      <button id="enter" class="btn lamp">${id === 'main' ? '店に入る' : 'かばんを持って出る'}</button>
    </div>
  </section>`;
  $('#back').onclick = back;
  $('#enter').onclick = () => go('scene', 0);
}
function lights(st, i) {
  const per = st.count / 4; let h = '';
  for (let g = 0; g < 4; g++) {
    h += '<span class="lg">';
    for (let j = 0; j < per; j++) { const n = g * per + j; h += `<i class="${n < i ? 'on' : n === i ? 'now' : ''}"></i>`; }
    h += '</span>';
  }
  return h;
}
function screenScene(i) {
  const st = STORIES[S.story];
  if (i >= st.count) { go('dawn', null, { push: false }); return; }
  S.idx = i;
  const sc = st.scenes[i];
  const ch = Math.floor(i / (st.count / 4));
  mode('night'); app.dataset.tint = CH_TINT[ch];
  const nums = ['一', '二', '三', '四'];
  view.innerHTML = `
  <section class="scene">
    <header class="bar">
      <button id="prev" class="iconbtn backbtn" aria-label="ひとつ前へ"></button>
      <span class="bar-c"><span id="chap" class="chap">第${nums[ch]}章 ${esc(st.chapters[ch])}</span><span id="count" class="count">${String(i + 1).padStart(2, '0')} / ${st.count}</span></span>
      <button id="menu" class="iconbtn menubtn" aria-label="メニュー"></button>
    </header>
    <div class="lights" aria-hidden="true">${lights(st, i)}</div>
    <figure class="plate"><img src="${sceneImg(sc.pic)}" alt=""></figure>
    <p class="prose scene-t">${esc(sc.text)}</p>
    <p class="ask">あなたなら、どうしますか。</p>
    <div class="opts">${sc.opts.map((o, k) => `<button class="opt${S.answers[i] === k ? ' was' : ''}" data-i="${k}">${esc(o.t)}</button>`).join('')}</div>
  </section>`;
  view.querySelectorAll('.opt').forEach(b => b.onclick = () => {
    if (view.dataset.busy) return; view.dataset.busy = '1';
    b.classList.add('picked');
    S.answers[i] = Number(b.dataset.i); S.answers.length = Math.max(S.answers.length, i + 1);
    store.setProgress(S.story, S.answers);
    setTimeout(() => { delete view.dataset.busy; if (i + 1 >= st.count) go('dawn', null, { push: false }); else go('scene', i + 1, { push: false }); }, 260);
  });
  $('#prev').onclick = () => { if (i === 0) { go('prologue', S.story, { push: false }); } else go('scene', i - 1, { push: false }); };
  $('#menu').onclick = () => openMenu();
}
function openMenu() {
  openSheet(`<div class="menu-sheet"><h2 class="sheet-h">${tag('ひと休み')}</h2>
    <p class="fine">答えは1つ選ぶごとに、この端末に残しています。次に開いた時は、この場面から続けられます。</p>
    <button id="saveClose" class="btn lamp">ここまでを保存して閉じる</button>
    <button id="keep" class="btn ghost">物語にもどる</button></div>`);
  $('#saveClose').onclick = () => { store.setProgress(S.story, S.answers); home(); };
  $('#keep').onclick = () => closeSheet();
}
function screenDawn() {
  const st = STORIES[S.story];
  const r = judge(st, S.answers);
  S.result = { story: S.story, key: r.key, lean: r.lean };
  store.addResult(S.story, r); store.clearProgress(S.story);
  mode('dawn'); delete app.dataset.tint;
  view.innerHTML = `
  <section class="dawn">
    <figure class="plate"><img src="${sceneImg(S.story === 'main' ? 'dawnend' : 'return')}" alt=""></figure>
    <div class="pad">
      ${st.ending.map(t => `<p class="prose">${esc(t)}</p>`).join('')}
      <button id="reveal" class="btn lamp">品を受け取る</button>
    </div>
  </section>`;
  $('#reveal').onclick = () => { S.stack = []; S.cur = { name: 'home' }; go('result', S.story); };
}

// ---------- 05 結果 ----------
function leanWord(ax, v) {
  if (v >= 75) return `${ax.left}寄り`;
  if (v > 50) return `やや${ax.left}寄り`;
  if (v === 50) return 'まんなか';
  if (v > 25) return `やや${ax.right}寄り`;
  return `${ax.right}寄り`;
}
function screenResult(storyId) {
  mode('night');
  const R = S.result; const T = TYPES[R.key];
  const other = storyId === 'second' ? store.latest('main') : null;
  view.innerHTML = `
  <section class="result" style="--tc:${T.color}">
    <div class="res-hero">
      <img src="${heroImg(R.key)}" alt="${esc(T.name)}の絵">
      <header class="bar"><button id="back" class="iconbtn backbtn" aria-label="戻る"></button><span class="bar-t">${storyId === 'second' ? '夜明けの配達' : '今夜の係'}</span><button id="shareTop" class="iconbtn sharebtn" aria-label="共有"></button></header>
      <p class="res-eyebrow">夜明けに見つかった、あなたの品</p>
    </div>
    <h1 id="typeName" class="papertag" style="${nameSize(T.name, 30, 104)}">${esc(T.name)}</h1>
    <p class="tcatch">${esc(T.catch)}</p>
    <p class="akari"><span class="who">灯さん</span><span class="say">「${esc(T.akari)}」</span></p>
    <p class="prose">${esc(T.short)}</p>
    ${other ? `<p class="fine center">${other.key === R.key ? '最初の夜と、同じ品でした。' : `最初の夜は「${esc(TYPES[other.key].name)}」でした。`}</p>` : ''}
    <button id="toCard" class="btn lamp">結果カードを作る</button>
    <p class="fine center">${HASHTAG} で、友達の品と見せ合えます</p>
    ${teaser(R.key)}
    <div class="axes"><h2 class="axes-h">4つの傾向</h2>${AXES.map(ax => { const v = R.lean[ax.id]; return `
      <div class="axis" data-ax="${ax.id}"><span class="ax-l">${ax.left}</span><div class="ax-bar"><b style="left:${100 - v}%">${leanWord(ax, v)}</b><i style="left:${100 - v}%"></i></div><span class="ax-r">${ax.right}</span></div>`; }).join('')}</div>
    <p class="fine center">物語の中で選んだことから出した目安です。占いや検査ではありません。</p>
    <div class="divider"><span>この品にまつわる話を、もう少し。</span></div>
    <div class="more">
      ${moreItem('detail', 'あなたの品の、詳しいお話', '得意なこと・つまずきやすい所・疲れた時の戻り方')}
      ${moreItem('compat', 'ふたりのわすれもの', shop.owned ? '友達の品を選んで、相性を読む' : '1組目の相性は、そのまま読めます')}
      ${moreItem('zukan', '16のわすれもの図鑑', '棚に並ぶ、すべての品')}
      ${storyId === 'main' ? moreItem('second', 'もう一つの物語', '夜明けの町へ、品を返しに 全12場面') : ''}
    </div>
    ${shop.owned ? '' : `<p class="fine center">${tag('追加の読み物は')} <b class="price">${priceLine()}</b> の買い切り(1回払い・月額なし)</p>`}
    <button id="toHome" class="btn ghost">帳場へ</button>
  </section>`;
  $('#back').onclick = () => home();
  $('#toHome').onclick = () => home();
  $('#toCard').onclick = () => go('card', R.key);
  $('#readMore').onclick = () => paid(() => go('detail', R.key));
  $('#shareTop').onclick = () => go('card', R.key);
  view.querySelectorAll('.more-item').forEach(b => b.onclick = () => {
    const g = b.dataset.go;
    if (g === 'zukan') return go('zukan');
    if (g === 'compat') return go('compat', R.key);
    paid(() => g === 'second' ? startStory('second', true) : go(g, R.key));
  });
}
// 結果の直後に見せる、詳しいお話の冒頭。買う前は1つ目を読めて、2つ目からぼかす(中身は本物)
function teaser(key) {
  const T = TYPES[key];
  if (shop.owned) return `<button id="readMore" class="teaser owned"><span class="tz-h">${tag('あなたの品の、詳しいお話')}</span><span class="tz-go">6つの話を読む</span></button>`;
  const [k1, l1] = DETAIL_LABELS[0], [k2, l2] = DETAIL_LABELS[1], [k5, l5] = DETAIL_LABELS[4];
  return `<div class="teaser" id="teaser">
    <p class="tz-h">${tag('あなたの品の、詳しいお話')}</p>
    <div class="tz-sec"><b>${l1}</b><p>${esc(T.detail[k1])}</p></div>
    <div class="tz-blur" aria-hidden="true"><div class="tz-sec"><b>${l2}</b><p>${esc(T.detail[k2])}</p></div><div class="tz-sec"><b>${l5}</b><p>${esc(T.detail[k5])}</p></div></div>
    <p class="tz-list">このあと: つまずきやすい所・疲れた時の戻り方・人といる時・好きな人との距離・向いている仕事</p>
    <button id="readMore" class="btn lamp keyed">続きを読む</button>
    <p class="fine center">${tag('')}<b class="price">${priceLine()}</b> の買い切りで、ほかの3つと一緒に開きます(1回払い・月額なし)</p>
  </div>`;
}
// 品名が一行に収まる字の大きさ(画面の幅から)
function nameSize(name, max, pad, frac) {
  const n = [...name].length;
  return frac ? `font-size:min(${max}px, calc(${frac * 100}vw / ${n + 1}))` : `font-size:min(${max}px, calc((min(100vw, 520px) - ${pad}px) / ${n + 0.5}))`;
}
function moreItem(go, t, s) {
  return `<button class="more-item" data-go="${go}"><span class="mi-ic ic-${go}" aria-hidden="true"></span><span class="mi-txt"><span class="mi-t">${t}</span><span class="mi-s">${s}</span></span>${shop.owned || go === 'compat' ? '<span class="mi-go" aria-hidden="true"></span>' : '<i class="lock" aria-label="買い切りで開きます"></i>'}</button>`;
}

// ---------- 06 結果カード ----------
async function screenCard(key) {
  mode('night');
  const T = TYPES[key];
  view.innerHTML = `
  <section class="cardscr">
    <header class="bar"><button id="back" class="iconbtn backbtn" aria-label="戻る"></button><span class="bar-t">結果カード</span><span></span></header>
    <div class="card-frame"><img id="cardImg" alt="${esc(T.name)}の結果カード"></div>
    <div class="row2"><button id="save" class="btn ghost">画像を保存</button><button id="share" class="btn lamp">共有する</button></div>
    <p class="fine center">${esc(HASHTAG)} #${esc(T.name)}<br>共有する先は、あなたが選びます。</p>
  </section>`;
  $('#back').onclick = back;
  const c = await drawCard(key);
  S.card = c; const img = $('#cardImg'); if (img) img.src = c.toDataURL('image/png');
  const run = async m => { try { const r = await shareCanvas(c, { text: shareText(key), filename: `yofuke_${key}.png`, mode: m }); if (r === 'downloaded') toast('画像を保存しました'); } catch (e) { toast('うまく保存できませんでした'); } };
  $('#save').onclick = () => run('save');
  $('#share').onclick = () => run('share');
}

// ---------- 08 買い切り案内(下から出るシート) ----------
function openPaywall(note) {
  const mine = (store.latest('main') || {}).key;
  const opened = shop.owned ? 16 : mine ? 1 : 0;
  const html = () => `<div class="paywall">
    <button id="pwClose" class="iconbtn closebtn" aria-label="閉じる"></button>
    <div class="pw-art"><img src="${mine ? heroImg(mine) : 'img/paywall.webp'}" alt=""></div>
    <h2 class="title md">もう少し、この町に。</h2>
    ${note ? `<p class="pw-note">${esc(note)}</p>` : ''}
    <p class="lead">夜が明けても、物語は少しだけ続きます。</p>
    <div class="pw-grid">
      <div class="pw-card"><b>あなたの品の、詳しいお話</b><img src="img/pv_detail.webp" alt=""><small>6つの話(好きな人との距離・向いている仕事も)</small></div>
      <div class="pw-card"><b>ふたりのわすれもの</b><img src="img/pv_compat.webp" alt=""><small>16の品すべてと相性</small></div>
      <div class="pw-card"><b>16のわすれもの図鑑</b><img src="img/pv_zukan.webp" alt=""><small>棚に並ぶすべての品と、その話</small></div>
      <div class="pw-card"><b>もう一つの物語 全12場面</b><img src="img/pv_second.webp" alt=""><small>夜明けの町へ、品を返しに行く</small></div>
    </div>
    <p class="pw-count">${tag('')}開いている品 <b>${opened} / 16</b>${shop.owned ? '' : ' → <b>16 / 16</b>'}</p>
    <div class="pw-pricebox"><b id="pwPrice">${priceLine()}</b><span>一度だけのお支払い</span><small>月額料金なし・自動更新なし・無料体験なし</small></div>
    ${shop.owned ? `<p class="okmsg">すべて開いています。ありがとうございます。</p>`
      : shop.isApp() ? `<button id="buy" class="btn lamp" ${shop.busy ? 'disabled' : ''}>${shop.busy ? '手続き中…' : `${priceLine()} ですべて開く`}</button>`
      : `<p class="webnote">ブラウザ版では購入できません。Android のアプリ版で開けます。</p>${playUrl() ? `<p class="center"><a id="playLink" class="link" href="${esc(playUrl())}" target="_blank" rel="noopener">Android 版のテストに参加する</a></p>` : ''}`}
    ${shop.message ? `<p class="msg" role="status">${esc(shop.message)}</p>` : ''}
    <div class="pw-links">${shop.isApp() ? '<button id="restore" class="link">購入を復元</button>' : ''}<button id="later" class="link">今は見ない</button></div>
    ${LEGAL}
  </div>`;
  openSheet(html());
  const bind = () => {
    $('#pwClose').onclick = () => closeSheet(); $('#later').onclick = () => closeSheet();
    const b = $('#buy'); if (b) b.onclick = () => shop.buy();
    const r = $('#restore'); if (r) r.onclick = () => shop.restore();
  };
  bind();
  sheet.rerender = () => { $('.sheet-in', sheet).innerHTML = html(); bind(); };
}
function openSheet(inner) {
  sheet.innerHTML = `<div class="sheet-bg"></div><div class="sheet-in" role="dialog" aria-modal="true">${inner}</div>`;
  sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add('on'));
  $('.sheet-bg', sheet).onclick = () => closeSheet();
}
function closeSheet(now) {
  if (sheet.hidden) return;
  sheet.rerender = null; sheet.classList.remove('on');
  const refresh = () => { if (shop.owned && S.cur && view.querySelector('.lock, .tagbadge, .zk.locked, #openShop')) SCREENS[S.cur.name](S.cur.arg); };
  if (now) { sheet.hidden = true; sheet.innerHTML = ''; return; }
  setTimeout(() => { if (!sheet.classList.contains('on')) { sheet.hidden = true; sheet.innerHTML = ''; refresh(); } }, 220);
}
shop.onChange = () => {
  if (sheet.rerender && !sheet.hidden) sheet.rerender();
  if (shop.owned && S.cur && ['home', 'result', 'zukan'].includes(S.cur.name) && sheet.hidden) SCREENS[S.cur.name](S.cur.arg);
  const p = document.getElementById('price'); if (p) p.textContent = shop.price;
};

// ---------- 09 詳しい解説 ----------
function screenDetail(key) {
  if (!shop.owned) { home(); return; }
  mode('night');
  const T = TYPES[key];
  view.innerHTML = `
  <section class="detail" style="--tc:${T.color}">
    <div class="strip"><img src="img/strip.webp" alt=""><header class="bar"><button id="back" class="iconbtn backbtn" aria-label="戻る"></button><span class="bar-t">詳しいお話</span><span></span></header></div>
    <div class="dt-head"><img src="${thumbImg(key)}" alt=""><div class="dt-side"><p class="no">No.${String(TYPE_ORDER.indexOf(key) + 1).padStart(2, '0')}</p><h1 class="papertag sm" style="font-size:min(18px, calc((0.6 * (min(100vw, 520px) - 44px) - 70px) / ${[...T.name].length}))">${esc(T.name)}</h1></div></div>
    <p class="tcatch">${esc(T.catch)}</p>
    <p class="prose">${esc(T.short)}</p>
    ${DETAIL_LABELS.map(([k, l]) => `<div class="detail-sec"><span class="ds-ic ds-${k}" aria-hidden="true"></span><div><h2 class="ds-h">${l}</h2><p>${esc(T.detail[k])}</p></div></div>`).join('')}
    <div class="row2"><button id="dtCompat" class="btn ghost">相性を見る</button><button id="dtCard" class="btn lamp">結果カード</button></div>
  </section>`;
  $('#back').onclick = back;
  $('#dtCompat').onclick = () => go('compat', key);
  $('#dtCard').onclick = () => go('card', key);
}

// ---------- 10 ふたりの相性 ----------
function screenCompat(key) {
  mode('night');
  const mine = key || (store.latest('main') || {}).key || 'NTMC';
  const draw = friend => {
    const T = TYPES[mine], F = friend ? TYPES[friend] : null;
    const c = friend ? compat(mine, friend) : null;
    view.innerHTML = `
    <section class="compat">
      <div class="strip"><img src="img/strip.webp" alt=""><header class="bar"><button id="back" class="iconbtn backbtn" aria-label="戻る"></button><span class="bar-t">ふたりのわすれもの</span><span></span></header></div>
      <div class="pair">
        <div class="pair-one"><span class="pl">あなたの品</span><img src="${thumbImg(mine)}" alt=""><b>${esc(T.name)}</b><small>${esc(T.catch)}</small></div>
        <span class="pair-x" aria-hidden="true"></span>
        <div class="pair-one ${F ? '' : 'empty'}"><span class="pl">友達の品</span>${F ? `<img src="${thumbImg(friend)}" alt=""><b>${esc(F.name)}</b><small>${esc(F.catch)}</small>` : '<span class="q">?</span><small>下から友達の品を選ぶと、ふたりの棚が分かります</small>'}</div>
      </div>
      ${c ? `<div id="compatRes" class="compat-res">
        <div class="cr-top"><img src="img/pic_compat_res.webp" alt=""><div><p class="cr-h">ふたりの棚</p><h2 class="papertag sm">${c.label}</h2><p class="cr-sum">${c.summary}</p></div></div>
        ${c.lines.map(l => { const ax = AXES.find(a => a.id === l.ax); return `<div class="cl ${l.same ? 'same' : 'diff'}"><span class="cl-l">${ax.left}</span><span class="cl-m"><b>${l.same ? '同じ向き' : 'ちがう向き'}</b><span>${l.text}</span></span><span class="cl-r">${ax.right}</span></div>`; }).join('')}</div>` : ''}
      <h2 class="sec-h">${tag('友達の品を選ぶ')}</h2>
      ${shop.owned ? '' : `<p class="fine free-note">${store.data.freePair ? `「${esc(TYPES[store.data.freePair].name)}」との相性は、そのまま読めます。ほかの15の品との相性は <b class="price">${priceLine()}</b> の買い切りで開きます。` : '1組目は、そのまま読めます。友達の品をひとつ選んでください。2組目からは買い切りで開きます。'}</p>`}
      <div class="pick-grid">${TYPE_ORDER.map(k => `<button class="pick${k === friend ? ' sel' : ''}${!shop.owned && store.data.freePair && store.data.freePair !== k ? ' locked' : ''}" data-k="${k}" aria-label="${esc(TYPES[k].name)}"><img src="${thumbImg(k)}" alt=""><span>${esc(TYPES[k].name)}</span></button>`).join('')}</div>
      <p class="fine center">遊びの読みものです。ふたりの仲を決めるものではありません。</p>
    </section>`;
    $('#back').onclick = back;
    view.querySelectorAll('.pick').forEach(b => b.onclick = () => {
      const k = b.dataset.k;
      if (!shop.owned) {
        const free = store.data.freePair;
        if (free && free !== k) { openPaywall('ほかの品との相性は、買い切りで開きます。'); return; }
        if (!free) { store.data.freePair = k; store.save(); }
      }
      draw(k); const r = $('#compatRes'); if (r) r.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };
  draw(shop.owned ? null : (store.data.freePair || null));
}

// ---------- 11 図鑑 ----------
function screenZukan() {
  mode('night');
  const mine = (store.latest('main') || {}).key;
  view.innerHTML = `
  <section class="zukan">
    <div class="strip tall"><img src="img/strip.webp" alt=""><header class="bar"><button id="back" class="iconbtn backbtn" aria-label="戻る"></button><span class="bar-t">わすれもの図鑑</span><span></span></header><p class="strip-sub">棚に並ぶ、16の品。</p></div>
    <p class="zk-count" id="zkCount">開いている品 <b>${shop.owned ? 16 : mine ? 1 : 0}</b> / 16</p>
    <div class="zk-grid">${TYPE_ORDER.map((k, i) => `<button class="zk${k === mine ? ' mine' : ''}${shop.owned || k === mine ? '' : ' locked'}" data-k="${k}">
      <span class="zk-no">No.${String(i + 1).padStart(2, '0')}</span><img src="${thumbImg(k)}" alt=""><span class="zk-name">${esc(TYPES[k].name)}</span>${k === mine ? '<span class="zk-me">あなた</span>' : ''}</button>`).join('')}</div>
    ${shop.owned ? '' : `<p class="fine center">${tag('ほかの品の話は')} <b class="price">${priceLine()}</b> の買い切りで読めます</p>`}
  </section>`;
  $('#back').onclick = back;
  view.querySelectorAll('.zk').forEach(b => b.onclick = () => {
    const k = b.dataset.k;
    if (shop.owned) go('detail', k);
    else if (k === mine) { S.result = Object.assign({ story: 'main' }, store.latest('main')); go('result', 'main'); }
    else openPaywall();
  });
}

// ---------- 12 設定 ----------
function screenSettings() {
  mode('night');
  // 物語を終える前は、値段と購入の案内を出さない(10/24 テスターの声: 最初から課金が見えて遊ぶ気がなくなる)
  const hasRes = !!store.latest('main');
  view.innerHTML = `
  <section class="settings">
    <div class="strip tall"><img src="img/strip_desk.webp" alt=""><header class="bar"><button id="back" class="iconbtn backbtn" aria-label="戻る"></button><span class="bar-t">設定</span><span></span></header></div>
    <div class="set-card"><h2 class="sec-h">${tag('記録')}</h2>
      <p class="fine">回答と結果は、この端末の中にだけ残しています。名前やメールは聞きません。外へ送ることもありません。アプリを消すと、記録も消えます。</p>
      <button id="clear" class="btn ghost ic-trash">保存した記録を消す</button></div>
    ${shop.owned || hasRes ? `<div class="set-card"><h2 class="sec-h">${tag('買い切り')}</h2>
      <p class="fine">${shop.owned ? 'すべて開いています。' : `詳しい解説・相性・図鑑・もう一つの物語は ${esc(shop.price)} の買い切りです。1回払い・月額なし・無料体験なし。`}</p>
      ${shop.isApp() ? '<button id="restore2" class="btn ghost ic-restore">購入を復元</button>' : ''}
      ${shop.owned ? '' : '<button id="seeShop" class="btn ghost">中身を見る</button>'}</div>`
      : shop.isApp() ? `<div class="set-card"><h2 class="sec-h">${tag('購入の復元')}</h2>
      <p class="fine">別の端末で買った方は、ここで開けます。</p>
      <button id="restore2" class="btn ghost ic-restore">購入を復元</button></div>` : ''}
    <div class="set-card"><h2 class="sec-h">${tag('この作品について')}</h2>
      <p class="fine">物語を楽しむための遊びの診断です。占い・医療・心理検査ではありません。結果は、物語の中で選んだことから出した目安です。物語・品・文章はすべてこのアプリのために作った物です。</p>${LEGAL}</div>
  </section>`;
  $('#back').onclick = back;
  $('#clear').onclick = () => { if (confirm('保存した回答と結果をすべて消します。よろしいですか?')) { store.clearAll(); toast('記録を消しました'); home(); } };
  const r = $('#restore2'); if (r) r.onclick = async () => { await shop.restore(); toast(shop.message || ''); };
  const s = $('#seeShop'); if (s) s.onclick = () => openPaywall();
}

const SCREENS = { home: screenHome, prologue: screenPrologue, scene: screenScene, dawn: screenDawn, result: screenResult, card: screenCard, detail: screenDetail, compat: screenCompat, zukan: screenZukan, settings: screenSettings };

// Android の戻るボタン: シートを閉じる → 画面の戻る → アプリを閉じる
const capApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
if (capApp && capApp.addListener) capApp.addListener('backButton', () => { if (!back() && capApp.exitApp) capApp.exitApp(); });

window.__yf = { S, store, shop, go, back, judge };
home();
shop.init();
