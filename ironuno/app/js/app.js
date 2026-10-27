// イロヌノの画面。流れは ChatGPT の提案(design/chatgpt_v2/提案の要点.txt)どおり:
// 診断中は一本道(撮り方 → 白で補正 → 顔の位置 → 布で比べる ×12 → 質問 ×5 → 結果 → 結果カード)。
// 診断のあとは下の3タブ(ホーム・色の本棚・記録)。設定はホームの右上。
// 写真はこの端末の中だけで扱う。送信も保存もしない。記録に残すのは結果の数字だけ。
import { samplePatch, whiteGains, applyGains, applyGainsPixel, paperWarnings, cheekColor, rgbToHex, inkOn, plainName } from './color.js';
import { SEASONS, ORDER, FREE_COUNT, FAMILY_TEXT } from './seasons.js';
import { ROUNDS, makeRounds, drapeColor, QUESTIONS, judge, CLARITY_TEXT } from './judge.js';
import { openStore } from './storage.js';
import { createPurchase } from './purchase.js';
import { drawCard, cardLines, cardAssets } from './card.js';
import { shareCanvas, shareText } from './share.js';
import { paintDrape, drapeAssets, cropHead } from './drape.js';
import { parseFriend, compare, KIND_TEXT, FREE_FRIENDS, friendCode, SITE_SHORT } from './friends.js';

export const APP_NAME = 'イロヌノ';
const $ = (s, el = document) => el.querySelector(s);
const appEl = $('#app'), scr = $('#screen'), tabsEl = $('#tabs'), sheet = $('#sheet'), toastEl = $('#toast');
const store = openStore(safeLS());
const Buy = createPurchase();
const X = { incoming: readIncoming(), draft: null, screen: 'home', photo: null, white: null, face: null, head: null, skin: null, rounds: [], picks: [], step: 0, answers: {}, q: 0, result: null, saved: false, shelf: null, from: null };

// 友だちが共有したリンク(?f=sp.au)から来た時の季節。読んだらアドレスから消す
function readIncoming() {
  try { const f = parseFriend(location.search || ''); if (location.search && history.replaceState) history.replaceState(null, '', location.pathname); return f; } catch (e) { return null; }
}
function safeLS() { try { return window.localStorage; } catch (e) { return null; } }

// ---- 小さな部品
const ICON = {
  back: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M20 12H5M11 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arr: '<svg class="arr" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ok: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 2.8l1.6 2.3 2.7-.8.6 2.8 2.7 1-1 2.6 1.9 2-1.9 2 1 2.6-2.7 1-.6 2.8-2.7-.8L12 21.2l-1.6-2.3-2.7.8-.6-2.8-2.7-1 1-2.6-1.9-2 1.9-2-1-2.6 2.7-1 .6-2.8 2.7.8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 15V3.5M7.5 8L12 3.5 16.5 8M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  home: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M3.5 11L12 4l8.5 7v9h-6v-6h-5v6h-6z" fill="currentColor"/></svg>',
  book: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  side: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><ellipse cx="15.5" cy="11" rx="5" ry="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="2.5" y="7" width="7" height="9" rx=".8" fill="#fff" stroke="currentColor" stroke-width="1.6"/><path d="M3 20.5h18" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1.6 1.8"/></svg>',
  cam: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 8h3l1.6-2.2h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="13.2" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  rec: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
};
const STEP_NAMES = ['撮る', '白で補正', '顔の位置', '布で比べる', '質問'];
function stepsBar(n, back = true) {
  return `<div class="bar">${back ? `<button class="back" id="back" aria-label="戻る">${ICON.back}</button>` : ''}
    <ol class="steps" aria-label="進み具合">${STEP_NAMES.map((t, i) => `<li class="${i < n ? 'done' : i === n ? 'now' : ''}" ${i === n ? 'aria-current="step"' : ''}><i>${i < n ? ICON.check : ''}</i>${t}</li>`).join('')}</ol></div>`;
}
const privacy = (dark) => `<p class="privacy ${dark ? 'on-dark' : ''}">${ICON.lock}写真は端末の外に送られません</p>`;
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove('on'), 2600); }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- 画面の切り替え
const MODE = { friends: 'light', home: 'dark', result: 'dark', card: 'dark', prep: 'lab', white: 'lab', face: 'lab', quiz: 'lab', drape: 'neutral', shelf: 'light', history: 'light', settings: 'light' };
const TABBED = { friends: 'history', home: 'home', result: 'home', shelf: 'shelf', history: 'history' };
const SCREENS = {};
function go(name, opts = {}) {
  X.screen = name; closeSheet(true);
  appEl.dataset.mode = MODE[name] || 'light'; appEl.dataset.screen = name;
  document.querySelector('meta[name=theme-color]').setAttribute('content', MODE[name] === 'dark' ? '#152232' : '#FFFFFF');
  barStyle(MODE[name] === 'dark');
  SCREENS[name](opts);
  drawTabs();
  if (!opts.keepScroll) scr.scrollTop = 0;
}
// アプリ版: 上の時計・電波のマークの色を画面の地に合わせる(濃紺の画面は白い文字、白い画面は黒い文字)
function barStyle(dark) {
  try { const C = window.Capacitor; const SB = C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.SystemBars;
    if (SB && SB.setStyle) { const p = SB.setStyle({ style: dark ? 'DARK' : 'LIGHT' }); if (p && p.catch) p.catch(() => {}); } } catch (e) { }
}
function drawTabs() {
  const cur = TABBED[X.screen];
  // 診断を一度も終えていない時と、診断の途中はタブを出さない
  if (!cur || !store.latest()) { tabsEl.hidden = true; tabsEl.innerHTML = ''; return; }
  tabsEl.hidden = false;
  tabsEl.innerHTML = [['home', 'ホーム', ICON.home], ['shelf', '色の本棚', ICON.book], ['history', '記録', ICON.rec]]
    .map(([k, t, ic]) => `<button data-tab="${k}" ${cur === k ? 'aria-current="page"' : ''}>${ic}<span>${t}</span></button>`).join('');
  tabsEl.querySelectorAll('button').forEach(b => b.onclick = () => go(b.dataset.tab));
}
function onBack(fn) { const b = $('#back'); if (b) b.onclick = fn; }

// ---- 01 ホーム
SCREENS.home = () => {
  const last = store.latest(); const inProgress = X.photo && !X.result;
  scr.innerHTML = `<section class="home">
    <div class="home-art" aria-hidden="true"><img src="img/home_silk.jpg" alt=""></div>
    <button class="gear" id="gear" aria-label="設定">${ICON.gear}</button>
    <div class="home-top">
      <p class="latin">Ironuno</p>
      <h1 class="logo">イロヌノ</h1>
      <p class="home-h serif">似合う色は、<br>あなたの目で見つける。</p>
      <p class="home-lead">白を整えて、季節の布を比べながら、<br>自分に似合う色の傾向を見つけます。</p>
    </div>
    <div class="home-cta">
      ${inProgress ? `<button class="btn btn-pearl" id="resume">つづきから再開${ICON.arr}</button><button class="btn-text on-dark" id="start">最初からやり直す</button>`
        : `<button class="btn btn-pearl" id="start">診断をはじめる${ICON.arr}</button>`}
      ${privacy(true)}
    </div>
    ${X.incoming ? `<button class="fr-in" id="frIn" style="--acc:${SEASONS[X.incoming.top].key}"><span class="k">友だちの似合う色が届きました</span>
        <b class="serif">${SEASONS[X.incoming.top].name}</b>${X.incoming.second ? `<small>2番目 ${SEASONS[X.incoming.second].name}</small>` : ''}
        <span class="go">${last ? '自分の色と並べて見る' : 'まず自分の色を比べてみる'}${ICON.arr}</span></button>` : ''}
    ${last ? `<button class="lastcard" id="lastRes" style="--acc:${SEASONS[last.top].key}">
        <span class="lc-k">前回の結果</span><i class="lc-line"></i>${ICON.arr}
        <b class="serif">${SEASONS[last.top].name}</b><small>2番目 ${SEASONS[last.second].name}</small>
        <span class="lc-dots">${SEASONS[last.top].best.slice(0, FREE_COUNT).map(c => `<i style="background:${c.hex}" title="${esc(c.name)} ${c.hex}"></i>`).join('')}</span>
        <img src="img/fabric_${last.top}.jpg" alt="">
      </button>` : `<ol class="home-flow" aria-label="診断の流れ"><li><b>1</b>白い紙と一緒に撮る</li><li><b>2</b>布を当てて12回見比べる</li><li><b>3</b>5つの質問に答える</li></ol>`}
    ${Buy.owned ? '' : `<button class="home-buy" id="homeBuy"><img src="img/po_all.jpg" alt="" aria-hidden="true"><span><b>色の本棚を全部ひらく</b><small>${Buy.isApp() ? '買い切り・月額なし' : 'アプリ版で買い切り'}</small></span>${priceTag('homePrice')}</button>`}
    <p class="fine on-dark">結果は見え方の目安です。照明・カメラ・画面によって変わります。</p>
  </section>`;
  const hb = $('#homeBuy'); if (hb) hb.onclick = () => paywall('home');
  const fi = $('#frIn'); if (fi) fi.onclick = () => { if (!store.latest()) { resetRun(); go('prep'); return; } X.draft = Object.assign({}, X.incoming); go('friends'); };
  $('#start').onclick = () => { resetRun(); go('prep'); };
  const r = $('#resume'); if (r) r.onclick = () => go(resumeScreen());
  $('#gear').onclick = () => go('settings');
  const lr = $('#lastRes'); if (lr) lr.onclick = () => { X.result = fromRecord(store.latest()); X.from = 'home'; go('result'); };
};
function resetRun() { Object.assign(X, { photo: null, white: null, face: null, head: null, skin: null, rounds: [], picks: [], step: 0, answers: {}, q: 0, result: null, saved: false }); }
function resumeScreen() { if (!X.face || !X.head) return X.white !== null || X.photo ? (X.face ? 'face' : 'white') : 'prep'; if (X.step < ROUNDS) return 'drape'; return 'quiz'; }
function fromRecord(r) { return { top: r.top, second: r.second, shares: r.shares, clarity: r.clarity, calibrated: r.calibrated, at: r.at, saved: true }; }

// ---- 02 撮り方
SCREENS.prep = () => {
  scr.innerHTML = `${stepsBar(0)}<section class="lab">
    <h1 class="h1 kp">白い紙を、<wbr>顔の横に並べて撮る。</h1>
    <p class="lead paper-why kp">紙の白を目印に、<wbr>部屋の明かりの色を合わせます</p>
    <div class="howto-pic"><img src="img/howto.jpg" alt="白い紙を顔の横、ほおの高さに並べて持って撮る見本">
      <span class="pin pin-paper" aria-hidden="true">白い紙</span><span class="pin pin-cheek" aria-hidden="true"><i>←</i>ほおの横に</span></div>
    <ol class="paper-steps" aria-label="白い紙の使い方">
      <li><img src="img/tip_paper.png" alt=""><span><b>何を</b>コピー用紙など、無地の白い紙。はがきより大きめ</span></li>
      <li><i class="ps-ic">${ICON.side}</i><span><b>どこに</b>顔の横、ほおの高さに並べる。顔にくっつけなくて大丈夫</span></li>
      <li><i class="ps-ic">${ICON.cam}</i><span><b>どう撮る</b>紙をカメラに向けて平らに持ち、顔と紙を一緒に1枚に写す</span></li>
    </ol>
    <p class="hint paper-tips">窓ぎわの明るい所で。紙に影を作らず、髪は顔にかけない。<br>撮ったあと、写真の中の紙をタップします。</p>
    <div class="stack">
      <label class="btn btn-navy file">カメラで撮る${ICON.arr}<input type="file" accept="image/*" capture="user" id="cam"></label>
      <label class="btn btn-line file">写真から選ぶ${ICON.arr}<input type="file" accept="image/*" id="pick"></label>
    </div>
    ${privacy(false)}
  </section>`;
  onBack(() => go('home'));
  for (const id of ['cam', 'pick']) $('#' + id).onchange = e => { const f = e.target.files && e.target.files[0]; if (f) loadPhoto(f); };
};
async function loadPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 1400 / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(im, 0, 0, w, h);
    X.photo = { w, h, orig: ctx.getImageData(0, 0, w, h), fixed: null, cv: null };
    X.white = null; X.face = null; X.head = null; setFixed(null);
    go('white');
  } catch (e) { toast('写真を読み込めませんでした。別の写真で試してください'); }
  finally { URL.revokeObjectURL(url); }
}
// 補正した写真(倍率なしなら元のまま)を作り直す
function setFixed(gains) {
  const P = X.photo; const data = gains ? applyGains(P.orig.data, gains) : new Uint8ClampedArray(P.orig.data);
  P.fixed = new ImageData(data, P.w, P.h);
  const cv = document.createElement('canvas'); cv.width = P.w; cv.height = P.h; cv.getContext('2d').putImageData(P.fixed, 0, 0); P.cv = cv;
}
// canvas の表示位置 → 写真の座標(表示は幅いっぱい、縦は比率どおり)
function toPhoto(cv, e) {
  const r = cv.getBoundingClientRect(); const k = Math.min(r.width / cv.width, r.height / cv.height);
  const ox = (r.width - cv.width * k) / 2, oy = (r.height - cv.height * k) / 2;
  return [Math.max(0, Math.min(cv.width - 1, (e.clientX - r.left - ox) / k)), Math.max(0, Math.min(cv.height - 1, (e.clientY - r.top - oy) / k))];
}
function toScreen(cv, x, y) {
  const r = cv.getBoundingClientRect(); const pr = cv.parentElement.getBoundingClientRect(); const k = Math.min(r.width / cv.width, r.height / cv.height);
  const ox = (r.width - cv.width * k) / 2, oy = (r.height - cv.height * k) / 2;
  return [r.left - pr.left + ox + x * k, r.top - pr.top + oy + y * k];
}

// ---- 04 白で補正
const PAPER_TEXT = {
  small: '紙の範囲が小さすぎます。紙の真ん中をタップしてください',
  dark: '紙が暗く写っています。窓ぎわなど明るい所で撮ると、色が見分けやすくなります',
  clipped: '紙が白く飛んでいます。少し暗めに撮るか、光が直接当たらない所で',
  uneven: '色のむらが大きい所です。白い紙の上をタップしてください',
  cast: '明かりの色が強く出ています(電球色の部屋など)。昼間の窓ぎわがおすすめです',
  limit: '明かりの色が強すぎて、合わせきれていません。昼間の窓ぎわで撮り直すと、比べやすくなります',
};
SCREENS.white = () => {
  if (!X.photo) return go('prep');
  const P = X.photo;
  scr.innerHTML = `${stepsBar(1)}<section class="lab">
    <h1 class="h1">写真の中の、白い紙をタップ</h1>
    <p class="lead">紙の白を基準に、部屋の明かりの色を合わせます</p>
    <div class="photo" id="wbox"><canvas id="wc" width="${P.w}" height="${P.h}" aria-label="写真。白い紙をタップ"></canvas></div>
    <div id="after"></div>
    <button class="btn btn-navy" id="wOk" ${X.white ? '' : 'disabled'}>この白で合わせる${ICON.arr}</button>
    <button class="btn-text" id="wSkip">紙が写っていない時は、合わせずに進む</button>
  </section>`;
  const cv = $('#wc'); const ctx = cv.getContext('2d');
  const r = Math.max(6, Math.round(Math.min(P.w, P.h) * 0.025));
  ctx.putImageData(P.orig, 0, 0);
  const showRing = () => {
    const old = $('#wbox .ring'); if (old) old.remove(); if (!X.white) return;
    const [sx, sy] = toScreen(cv, X.white.x, X.white.y); const ring = document.createElement('i'); ring.className = 'ring'; ring.style.left = sx + 'px'; ring.style.top = sy + 'px'; $('#wbox').appendChild(ring);
  };
  const after = () => {
    const w = X.white; const box = $('#after'); if (!w) { box.innerHTML = '<p class="hint">紙の真ん中あたりをタップしてください</p>'; return; }
    const shot = rgbToHex(w.patch.mean), fixed = rgbToHex(applyGainsPixel(w.patch.mean, w.wb.gains));
    box.innerHTML = `<div class="split" id="split" style="--cut:50%"><canvas id="sb" width="${P.w}" height="${P.h}"></canvas><canvas class="after" id="sa" width="${P.w}" height="${P.h}"></canvas>
        <i class="knob"></i><span class="tag l">補正前</span><span class="tag r">補正後</span><input type="range" min="0" max="100" value="50" id="cut" aria-label="補正前と補正後の境目"></div>
      <div class="wb"><i class="dot" style="background:${shot}" title="${shot}"></i><span>写った白<small class="hx-t">${shot}</small></span><span aria-hidden="true">→</span><i class="dot" style="background:${fixed}" title="${fixed}"></i><span>合わせた白<small class="hx-t">${fixed}</small></span>
        ${w.warns.length ? `<ul class="warns">${w.warns.map(k => `<li data-w="${k}">${PAPER_TEXT[k]}</li>`).join('')}</ul>` : `<span class="sep"></span><span class="ok good">${ICON.ok}光の具合は問題なさそうです</span>`}</div>`;
    $('#sb').getContext('2d').putImageData(P.orig, 0, 0); $('#sa').getContext('2d').putImageData(P.fixed, 0, 0);
    const sp = $('#split'); const setCut = v => sp.style.setProperty('--cut', v + '%');
    $('#cut').oninput = e => setCut(e.target.value);
    // 写真の顔のあたりが見えるように、比べる帯の縦位置を決める
    const fy = X.white ? Math.min(85, Math.max(15, 40)) : 40; sp.querySelectorAll('canvas').forEach(c => c.style.objectPosition = `50% ${fy}%`);
  };
  after(); showRing();
  cv.onclick = e => {
    const [x, y] = toPhoto(cv, e); const patch = samplePatch(P.orig.data, P.w, P.h, x, y, r); const wb = whiteGains(patch.mean);
    X.white = { x, y, patch, wb, warns: paperWarnings(patch, wb) };
    setFixed(wb.gains); X.head = null; after(); showRing(); $('#wOk').disabled = false;
  };
  onBack(() => go('prep'));
  $('#wOk').onclick = () => go('face');
  $('#wSkip').onclick = () => { X.white = null; setFixed(null); X.head = null; go('face'); };
};

// ---- 05 顔の位置
SCREENS.face = () => {
  if (!X.photo) return go('prep');
  const P = X.photo;
  if (!X.face) X.face = { cx: P.w / 2, cy: P.h * 0.42, rx: P.w * 0.2, ry: P.w * 0.2 * 1.32, set: false };
  const v = Math.round(X.face.rx / P.w * 100);
  scr.innerHTML = `${stepsBar(2)}<section class="lab">
    <h1 class="h1">顔を、だ円に合わせる。</h1>
    <p class="lead">鼻のあたりをタップするか、指でなぞって動かします。大きさはつまみで</p>
    <div class="photo"><canvas id="fc" width="${P.w}" height="${P.h}" aria-label="写真。鼻のあたりをタップ"></canvas></div>
    <label class="slider"><b>顔の大きさ</b><input type="range" id="fs" min="8" max="45" value="${v}" style="--v:${(v - 8) / 37 * 100}%"><small><span>小さく</span><span>大きく</span></small></label>
    <button class="btn btn-navy face-go" id="fOk">布で比べる${ICON.arr}</button>
  </section>`;
  const cv = $('#fc'); const ctx = cv.getContext('2d');
  const draw = () => {
    const f = X.face; ctx.putImageData(P.fixed, 0, 0);
    ctx.save(); ctx.fillStyle = 'rgba(20,24,30,.38)'; ctx.beginPath(); ctx.rect(0, 0, P.w, P.h); ctx.ellipse(f.cx, f.cy, f.rx, f.ry, 0, 0, Math.PI * 2); ctx.fill('evenodd'); ctx.restore();
    const lw = Math.max(2, P.w / 220); ctx.lineWidth = lw; ctx.strokeStyle = '#fff'; ctx.setLineDash(f.set ? [] : [lw * 5, lw * 4]);
    ctx.beginPath(); ctx.ellipse(f.cx, f.cy, f.rx, f.ry, 0, 0, Math.PI * 2); ctx.stroke();
    // 十字の細い点線と、布の当たる所の目印
    ctx.setLineDash([lw * 3, lw * 3]); ctx.lineWidth = lw * 0.6; ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.beginPath(); ctx.moveTo(f.cx, f.cy - f.ry); ctx.lineTo(f.cx, f.cy + f.ry); ctx.moveTo(f.cx - f.rx, f.cy - f.ry * 0.1); ctx.lineTo(f.cx + f.rx, f.cy - f.ry * 0.1); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(f.cx, f.cy + f.ry * 1.02, f.rx * 0.5, f.ry * 0.08, 0, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
    const ty = f.cy + f.ry * 1.12;
    if (ty < P.h - 30) {
      ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(f.cx, ty); ctx.lineTo(f.cx, ty + f.ry * 0.12); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(f.cx, ty, lw * 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.font = `${Math.round(P.w / 26)}px ${getComputedStyle(document.body).fontFamily}`; ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 6;
      ctx.fillText('布はここに当たります', f.cx, ty + f.ry * 0.12 + P.w / 22); ctx.shadowBlur = 0;
    }
  };
  draw();
  // 前はタップ(click)した時だけボタンが押せるようになっていた。だ円を指でなぞるとページがスクロールするだけで click が起きず、
  // 小さい画面ではボタンが画面の外で灰色のまま、押しても何も起きなかった(10/28 テスターの報告)。
  // 今は最初のだ円の位置のままでも進めて、タップでもなぞっても中心が動く。
  let dragId = null;
  const moveTo = e => { const [x, y] = toPhoto(cv, e); X.face.cx = x; X.face.cy = y; X.face.set = true; X.head = null; draw(); };
  cv.onpointerdown = e => { dragId = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch (_) { } moveTo(e); e.preventDefault(); };
  cv.onpointermove = e => { if (e.pointerId === dragId) moveTo(e); };
  cv.onpointerup = cv.onpointercancel = e => { if (e.pointerId === dragId) dragId = null; };
  $('#fs').oninput = e => { X.face.rx = P.w * e.target.value / 100; X.face.ry = X.face.rx * 1.32; X.face.set = true; X.head = null; e.target.style.setProperty('--v', (e.target.value - 8) / 37 * 100 + '%'); draw(); };
  onBack(() => go('white'));
  $('#fOk').onclick = () => {
    const f = X.face; X.skin = cheekColor(P.fixed.data, P.w, P.h, f).lab; X.head = cropHead(P.cv, f);
    if (!X.rounds.length || X.step === 0) { X.rounds = makeRounds((Date.now() & 0xffff) + 11); X.picks = []; X.step = 0; }
    go('drape');
  };
};

// ---- 06 布で比べる(白と灰色だけ。季節名は出さない)
SCREENS.drape = () => {
  if (!X.head) return go('face');
  if (X.step >= ROUNDS) return go('quiz');
  const p = X.rounds[X.step];
  scr.innerHTML = `<div class="cmp-top"><button class="back" id="back" aria-label="戻る">${ICON.back}</button><h2>布で比べる</h2><span class="n"><b id="dn">${X.step + 1}</b> / ${ROUNDS}</span></div>
  <div class="track" aria-hidden="true"><i style="width:${(X.step) / ROUNDS * 100}%"></i></div>
  <section class="lab neutral">
    <h1 class="h1">顔色が明るく見えるのは?</h1>
    <div class="pair">${['left', 'right'].map(side => `<button class="drape" data-side="${side}" data-season="${p[side]}" data-hex="${drapeColor(p[side], p.family)}" aria-label="${side === 'left' ? '左' : '右'}を選ぶ"><canvas width="420" height="780"></canvas><span>${side === 'left' ? '左' : '右'}<small class="dhx">${plainName(drapeColor(p[side], p.family))} ${drapeColor(p[side], p.family)}</small></span></button>`).join('')}</div>
    <p class="hint">くま・影・赤みが目立たず、輪郭がすっきり見える方を。</p>
    <p class="hint fam">${FAMILY_TEXT[p.family]}</p>
    <div class="row2"><button class="btn btn-gray" id="tie">どちらとも言えない</button><button class="btn btn-gray" id="undo" ${X.step ? '' : 'disabled'}>ひとつ戻る</button></div>
  </section>`;
  const paint = () => scr.querySelectorAll('.drape').forEach(b => paintDrape(b.querySelector('canvas'), b.dataset.hex, X.head));
  paint(); drapeAssets.then(() => { if (X.screen === 'drape') paint(); });
  const pick = v => { X.picks[X.step] = Object.assign({}, p, { pick: v }); X.step++; if (X.step >= ROUNDS) go('quiz'); else SCREENS.drape(); };
  scr.querySelectorAll('.drape').forEach(b => b.onclick = () => pick(b.dataset.side));
  $('#tie').onclick = () => pick('tie');
  $('#undo').onclick = () => { if (!X.step) return; X.step--; X.picks.length = X.step; SCREENS.drape(); };
  onBack(() => { if (X.step) { X.step--; X.picks.length = X.step; SCREENS.drape(); } else go('face'); });
};

// ---- 07 質問
const QPIC = { metal: ['img/q_gold.jpg', 'img/q_silver.jpg', 'img/q_both.jpg'] };
SCREENS.quiz = () => {
  if (X.q >= QUESTIONS.length) return finish();
  const Q = QUESTIONS[X.q]; const pics = QPIC[Q.id];
  scr.innerHTML = `${stepsBar(4)}<section class="lab">
    <p class="qn"><b id="qn">${X.q + 1}</b> / ${QUESTIONS.length}</p>
    <h1 class="h1">${Q.q.indexOf('、') > 0 && Q.q.indexOf('、') <= 13 ? Q.q.replace('、', '、<br>') : Q.q}</h1>
    <div class="opts ${pics ? 'opt-grid' : ''}">${Q.opts.map((o, i) => `<button class="opt" data-i="${i}" aria-pressed="${X.answers[Q.id] === i}">${pics ? `<img src="${pics[i]}" alt="">` : ''}${pics ? '<i class="rd"></i>' : ''}<span>${o.t}</span>${pics ? '' : '<i class="rd"></i>'}</button>`).join('')}</div>
    <p class="hint">布の結果を補う質問です。分からない時は近い方で大丈夫です。</p>
  </section>`;
  scr.querySelectorAll('.opt').forEach(b => b.onclick = () => {
    X.answers[Q.id] = +b.dataset.i; scr.querySelectorAll('.opt').forEach(o => o.setAttribute('aria-pressed', o === b));
    setTimeout(() => { X.q++; SCREENS.quiz(); scr.scrollTop = 0; }, 160);
  });
  onBack(() => { if (X.q > 0) { X.q--; SCREENS.quiz(); } else { X.step = ROUNDS - 1; X.picks.length = X.step; go('drape'); } });
};
function finish() {
  const r = judge({ picks: X.picks, answers: X.answers, skinLab: X.skin, calibrated: !!X.white, paperOk: !!(X.white && !X.white.warns.length) });
  X.result = r; if (!X.saved) { store.addResult(r); X.saved = true; }
  X.from = 'run'; go('result');
}

// ---- 08 結果
const softName = (n, min = 5) => n.length >= min ? esc(n.slice(0, Math.ceil(n.length / 2))) + '<wbr>' + esc(n.slice(Math.ceil(n.length / 2))) : esc(n);
// 色の見分けが弱い人のために、色見本には名前とカラーコード(#RRGGBB)を必ず添える。コードは押すとコピーできる。
// 似合う色(○)と顔から離したい色(△)は、色だけでなく印でも分かるようにする。
const MARK = { good: '○', avoid: '△' };
const KIND_LABEL = { good: '似合う色', avoid: '顔から離したい色' };
function chipBtn(c, kind = 'good', cls = '') {
  return `<button class="chip ${cls}" data-hex="${c.hex}" data-name="${esc(c.name)}" data-kind="${kind}" style="--c:${c.hex}" aria-label="${esc(c.name)}(${plainName(c.hex)}・${c.hex}・${KIND_LABEL[kind]})"><i></i>${kind === 'avoid' ? `<em class="mk-b" aria-hidden="true">${MARK.avoid}</em>` : ''}</button>`;
}
const hexBtn = hex => `<button class="hx" data-copy="${hex}" aria-label="${hex} をコピー">${hex}</button>`;
function swatchRow(list, cls = '', kind = 'good') {
  return `<ul class="sw ${cls}" data-kind="${kind}">${list.map(c => `<li>${chipBtn(c, kind)}<span>${kind === 'avoid' ? `<b class="mk">${MARK.avoid}</b>` : ''}${softName(c.name, cls === 'dots' ? 4 : 5)}</span>${hexBtn(c.hex)}</li>`).join('')}</ul>`;
}
SCREENS.result = () => {
  const r = X.result; if (!r) return go('home');
  const T = SEASONS[r.top], T2 = SEASONS[r.second];
  const bars = [...ORDER].sort((a, b) => r.shares[b] - r.shares[a]);
  scr.innerHTML = `<section class="res" style="--acc:${T.key}">
    <div class="res-art" aria-hidden="true"><img src="img/fabric_${r.top}.jpg" alt=""></div>
    <div class="res-bar"><button class="back on-dark" id="back" aria-label="戻る">${ICON.back}</button><button class="back on-dark" id="shareTop" aria-label="結果カードを作る">${ICON.share}</button></div>
    <div class="res-head">
      <p class="latin">Your color season</p>
      <p class="res-k">あなたに似合う色の傾向は</p>
      <div class="res-name-row"><h1 class="res-name serif" id="season" data-season="${r.top}">${T.name}</h1><p class="latin res-en">${T.en}</p></div>
      <p class="res-tone">${T.tone}</p>
      <p class="res-about">${T.about}</p>
      <div class="pills"><span class="pill" style="background:${T2.key}66;border-color:${T2.key}99">2番目に合う季節 <b id="second" data-season="${r.second}">${T2.name}</b></span><span class="pill clar" data-c="${r.clarity}">${r.clarity === 'close' ? '2つの季節が近い結果です' : CLARITY_TEXT[r.clarity]}</span></div>
    </div>
    <div class="card-w">
      <h2 class="serif">あなたの得意な6色</h2>
      ${swatchRow(T.best.slice(0, FREE_COUNT), 'free')}
    </div>
    <button class="btn btn-pearl" id="toCard">結果カードを作る${ICON.arr}</button>
    <div class="trend">
      <h2 class="serif">4つの季節の傾向</h2>
      ${bars.map(s => `<div class="tb" data-s="${s}"><span>${SEASONS[s].name}</span><b><i style="width:${r.shares[s]}%;background:${SEASONS[s].key}"></i></b><em>${r.shares[s]}%</em></div>`).join('')}
      <p class="note">選んだ布と回答から出した目安です。照明・カメラ・画面によって変わります。</p>
      ${r.clarity === 'close' ? `<p class="note">${CLARITY_TEXT.close}</p>` : ''}
      ${!r.calibrated ? '<p class="note">今回は白い紙で合わせずに比べました。紙を一緒に写すと、明かりの色を合わせてから比べられます。</p>' : ''}
    </div>
    ${Buy.owned ? `<button class="shelf-cta owned" id="toShelf"><span class="serif">色の本棚をひらく</span><small>メイク・服の色・髪色・顔から離したい色</small>${ICON.arr}</button>` : peekBlock(r.top)}
    <button class="fr-cta" id="toFriends"><img src="img/po_friends.jpg" alt="" aria-hidden="true"><span><b class="serif">友だちと比べる</b><small>二人とも似合う色・おそろいの色</small></span>${ICON.arr}</button>
    <button class="btn-text on-dark" id="again">もう一度比べる</button>
  </section>`;
  bindChips();
  onBack(() => go('home'));
  $('#toCard').onclick = $('#shareTop').onclick = () => go('card');
  scr.querySelectorAll('.peek-more').forEach(b => b.onclick = () => paywall('peek'));
  $('#toFriends').onclick = () => go('friends');
  const ts = $('#toShelf'); if (ts) ts.onclick = () => { X.shelf = r.top; go('shelf'); };
  $('#again').onclick = () => { resetRun(); go('prep'); };
};

// 結果の直後に見せる「続き」: 有料の中身の本物を少しだけ(各段の先頭)見せて、残りはぼかす
const PEEK = [
  ['all', '全部の色見本', 'po_all', T => [T.best.slice(FREE_COUNT, FREE_COUNT + 2), T.best.slice(FREE_COUNT + 2, FREE_COUNT + 8)], T => T.best.length - FREE_COUNT - 2],
  ['makeup', 'メイクの色', 'po_makeup', T => [T.makeup.lip.slice(0, 2), T.makeup.lip.slice(2).concat(T.makeup.cheek, T.makeup.eye).slice(0, 6)], T => T.makeup.lip.length + T.makeup.cheek.length + T.makeup.eye.length - 2],
  ['wear', '服の色', 'po_wear', T => [T.wear.base.slice(0, 1), T.wear.base.slice(1).concat(T.wear.accent).slice(0, 6)], T => T.wear.base.length + T.wear.accent.length - 1],
  ['hair', '髪色', 'po_hair', T => [T.hair.slice(0, 1), T.hair.slice(1)], T => T.hair.length - 1],
  ['avoid', '顔から離したい色', 'po_avoid', T => [T.avoid.slice(0, 1), T.avoid.slice(1)], T => T.avoid.length - 1],
];
function peekBlock(season) {
  const T = SEASONS[season];
  return `<section class="peek" id="peek">
    <p class="latin">Your colors, continued</p>
    <h2 class="serif">あなたの色の、続き</h2>
    <p class="sub">${T.name}のメイク・服・髪色を、各段の最初の色だけ先に見られます。</p>
    ${PEEK.map(([k, title, img, get, rest]) => { const [open, hid] = get(T); return `<div class="pk-row" data-k="${k}">
      <img class="pk-ic" src="img/${img}.jpg" alt="" aria-hidden="true">
      <div class="pk-body"><h3><span><b class="mk">${k === 'avoid' ? MARK.avoid : MARK.good}</b>${title}</span><small>${ICON.lock}あと${rest(T)}色</small></h3>
        <div class="pk-chips">${open.map(c => chipBtn(c, k === 'avoid' ? 'avoid' : 'good', 'pk-open')).join('')}<span class="pk-names">${open.map(c => `<span><b>${esc(c.name)}</b>${hexBtn(c.hex)}</span>`).join('')}</span>
        <span class="veil pk-hid" aria-hidden="true">${hid.map(c => `<i style="background:${c.hex}"></i>`).join('')}</span></div></div></div>`; }).join('')}
    <button class="btn btn-pearl peek-more" id="openAll">続きを見る${ICON.arr}</button>
  </section>`;
}
function priceTag(id) { return `<em class="pt" id="${id}">${Buy.isApp() ? esc(Buy.price || '') : ''}</em>`; }

// ---- 09 結果カード
SCREENS.card = () => {
  const r = X.result; if (!r) return go('home');
  const canFace = !!X.head;
  scr.innerHTML = `<section class="cardscr">
    <div class="res-bar"><button class="back on-dark" id="back" aria-label="戻る">${ICON.back}</button><h2 class="serif">結果カード</h2><span></span></div>
    <div class="preview"><img id="cardImg" alt="結果カード"></div>
    <label class="toggle ${canFace ? '' : 'off'}"><span><b>顔写真を入れる</b><small>${canFace ? '最初は写真なし' : 'いま撮った写真がある時だけ入れられます'}</small></span>
      <input type="checkbox" id="withFace" role="switch" ${store.data.showFace && canFace ? 'checked' : ''} ${canFace ? '' : 'disabled'}><i></i></label>
    <div class="row2"><button class="btn btn-line-dark" id="saveBtn">保存する</button><button class="btn btn-pearl" id="shareBtn">共有する</button></div>
    <div id="nudge"></div>
    <details class="post"><summary>Threads・X に添える文</summary><textarea id="postTxt" readonly rows="3">${esc(shareText(r))}</textarea><button class="btn-text on-dark" id="copyTxt">文をコピー</button></details>
  </section>`;
  const make = () => {
    X.card = drawCard(r, { appName: APP_NAME, face: $('#withFace').checked ? faceSquare() : null });
    $('#cardImg').src = X.card.toDataURL('image/png'); window.__iro.cardLines = cardLines(r, APP_NAME);
  };
  make(); cardAssets.then(() => { if (X.screen === 'card') make(); });
  $('#withFace').onchange = e => { store.data.showFace = e.target.checked; store.save(); make(); };
  onBack(() => go('result'));
  $('#saveBtn').onclick = () => doShare('save');
  $('#shareBtn').onclick = () => doShare('share');
  $('#copyTxt').onclick = async () => { try { await navigator.clipboard.writeText($('#postTxt').value); toast('コピーしました'); } catch (e) { $('#postTxt').select(); } };
};
function faceSquare() {
  const h = X.head; if (!h) return null; const s = Math.min(h.width, h.height);
  const cv = document.createElement('canvas'); cv.width = s; cv.height = s; cv.getContext('2d').drawImage(h, (h.width - s) / 2, 0, s, s, 0, 0, s, s); return cv;
}
async function doShare(mode) {
  try {
    const how = await shareCanvas(X.card, { text: shareText(X.result), filename: `ironunu-${X.result.top}.png`, mode });
    if (how === 'downloaded') toast('画像を保存しました');
    if (how !== 'cancelled') nudgeOnce();
  } catch (e) { toast('保存できませんでした'); }
}
// 保存・共有のあとに一度だけ(これまでに一度も出していない時だけ)、控えめに続きを案内する
function nudgeOnce() {
  if (Buy.owned || store.data.nudged || X.screen !== 'card') return;
  const box = $('#nudge'); if (!box) return;
  store.data.nudged = true; store.save();
  box.innerHTML = `<div class="nudge"><p>${esc(SEASONS[X.result.top].name)}のメイク・服・髪色の色も、色の本棚で見られます。</p><button class="btn-text on-dark" id="nudgeGo">続きを見る</button></div>`;
  $('#nudgeGo').onclick = () => paywall('card');
}

// ---- 11 色の本棚(白地の見本帳)
const SHELF = [
  ['best', '季節の色見本', s => SEASONS[s].best, '服や小物を選ぶ時に、そのまま見せられる見本'],
  ['makeup', 'メイクの色', s => SEASONS[s].makeup, 'リップ・チーク・アイシャドウの選び方の目安'],
  ['wear', '服の色', s => SEASONS[s].wear, '着回しの土台になる色と、差し色'],
  ['hair', '髪色', s => SEASONS[s].hair, '美容室で見せる時の色の目安'],
  ['avoid', '顔から離したい色', s => SEASONS[s].avoid, '着るなら顔から遠い所(ボトムや小物)に'],
];
const SUB = { lip: 'リップ', cheek: 'チーク', eye: 'アイシャドウ', base: '土台の色', accent: '差し色' };
SCREENS.shelf = () => {
  const last = store.latest();
  const s = X.shelf || (last ? last.top : 'spring'); X.shelf = s;
  const own = Buy.owned; const T = SEASONS[s];
  // 無料で見られるのは、自分の季節の得意な6色だけ
  const freeHere = !own && last && last.top === s;
  const palette = own ? T.best : freeHere ? T.best.slice(0, FREE_COUNT) : [];
  const makeupCols = v => `<div class="cols3">${Object.entries(v).map(([sk, list]) => `<div><h4>${SUB[sk]}</h4>${swatchRow(list, 'dots')}</div>`).join('')}</div>`;
  const kindOf = k => k === 'avoid' ? 'avoid' : 'good';
  const body = (k, v) => k === 'best' ? swatchRow(v, 'dots') : k === 'makeup' ? makeupCols(v) : Array.isArray(v) ? swatchRow(v, 'named', kindOf(k)) : Object.entries(v).map(([sk, list]) => `<h4>${SUB[sk]}</h4>${swatchRow(list, 'named')}`).join('');
  const mk = k => `<b class="mk" aria-hidden="true">${MARK[kindOf(k)]}</b>`;
  scr.innerHTML = `<section class="shelf">
    <div class="sh-art" aria-hidden="true"><img src="img/card_${s}.jpg" alt=""></div>
    <header class="sh-head"><p class="latin dark">Color library</p><h1 class="serif">色の本棚</h1>
      <p class="lead-l">${last ? `あなたの季節は <b>${SEASONS[last.top].name}</b>。<br>4つの季節の96色を集める見本帳です。` : 'まだ診断していません。<br>4つの季節の96色を集める見本帳です。'}</p></header>
    ${(() => { const got = own ? 96 : (last ? FREE_COUNT : 0); return `<div class="dex" id="dex"><span>集めた色</span><b><em id="dexGot">${got}</em> / 96</b><i><s style="width:${got / 96 * 100}%"></s></i></div>`; })()}
    <p class="mk-legend"><span><b class="mk">${MARK.good}</b>似合う色</span><span><b class="mk">${MARK.avoid}</b>顔から離したい色</span><span>#からの6けたは カラーコード</span></p>
    <div class="seg" role="tablist">${ORDER.map(x => { const lk = !own && !(last && last.top === x); return `<button role="tab" data-s="${x}" aria-selected="${x === s}" ${lk ? 'data-locked="1"' : ''}>${lk ? ICON.lock : ''}${SEASONS[x].name}</button>`; }).join('')}</div>
    ${SHELF.map(([k, title, get, desc]) => {
      const v = get(s);
      if (k === 'best') {
        // 図鑑のように24枠を番号つきで並べる。ひらいていない枠は色をぼかして鍵
        return `<section class="book" data-k="best"><h2 class="serif">${mk(k)}${title}<small>${palette.length} / ${T.best.length}</small></h2>
          ${!palette.length ? `<div class="lockbook" id="lockbook"><img src="img/locked_book.jpg" alt="" aria-hidden="true"><p>${T.name}の${T.best.length}色は、まだ閉じています</p></div>` : ''}
          <ol class="dexgrid">${T.best.map((c, i) => i < palette.length
            ? `<li class="got">${chipBtn(c)}<span>${softName(c.name)}</span>${hexBtn(c.hex)}</li>`
            : `<li class="lk"><i class="lkc" style="--c:${c.hex}" aria-hidden="true"></i>${ICON.lock}<span>No.${String(i + 1).padStart(2, '0')}</span></li>`).join('')}</ol>
          ${palette.length < T.best.length ? `<button class="btn btn-navy sm unlock-inline unlock" data-k="best">${ICON.lock}全部ひらく</button>` : ''}</section>`;
      }
      return `<section class="book ${own ? 'open' : 'locked'}" data-k="${k}"><h2 class="serif">${own ? '' : ICON.lock}${mk(k)}${title}</h2><p class="desc">${desc}</p>
        ${own ? body(k, v) : `<div class="lockwrap"><div class="veil" aria-hidden="true">${body(k, v)}</div><button class="btn btn-navy sm unlock" data-k="${k}">${ICON.lock}全部ひらく</button></div>`}</section>`;
    }).join('')}
    <p class="fine">色をタップすると、大きく見られます。色の下のコード(#から始まる6けた)を押すと、コピーできます。色は画面によって少しずつ違って見えるので、お店では実物を顔の近くに当てて確かめてください。</p>
  </section>`;
  scr.querySelectorAll('.seg button').forEach(b => b.onclick = () => { X.shelf = b.dataset.s; go('shelf'); });
  scr.querySelectorAll('.unlock').forEach(b => b.onclick = () => paywall('shelf'));
  bindChips();
};
// 色をタップすると大きく出す(お店で見せる用)
function bindChips() {
  scr.querySelectorAll('.chip').forEach(b => b.onclick = () => {
    if (b.closest('.veil')) return;
    const hex = b.dataset.hex; const kind = b.dataset.kind === 'avoid' ? 'avoid' : 'good';
    openSheet(`<div class="big" style="background:${hex};color:${inkOn(hex)}"><button class="x" id="shClose" aria-label="閉じる">×</button>
      <span class="big-mk" data-kind="${kind}">${MARK[kind]} ${KIND_LABEL[kind]}</span><b class="serif">${b.dataset.name}</b><span class="big-plain">${plainName(hex)}</span>
      <button class="big-copy" id="bigCopy" data-copy="${hex}">${hex}<small>コピー</small></button></div>`, 'bigcolor');
    $('#shClose').onclick = () => closeSheet();
    $('#bigCopy').onclick = () => copyHex(hex);
  });
  scr.querySelectorAll('.hx').forEach(b => b.onclick = e => { e.stopPropagation(); if (!b.closest('.veil')) copyHex(b.dataset.copy); });
}
// カラーコードを写す。クリップボードが使えない時は、選んだ文字をコピーする古い方法で
async function copyHex(hex) {
  let done = false;
  try { await navigator.clipboard.writeText(hex); done = true; } catch (e) {
    try { const ta = document.createElement('textarea'); ta.value = hex; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.appendChild(ta); ta.select(); done = document.execCommand('copy'); ta.remove(); } catch (e2) { done = false; }
  }
  window.__iro.copied = done ? hex : null;
  toast(done ? `${hex} をコピーしました` : `カラーコード ${hex}`);
}

// ---- 12 記録
SCREENS.history = () => {
  const list = store.data.results; const sm = store.summary(); const last = store.latest();
  scr.innerHTML = `<section class="shelf">
    <header class="sh-head"><h1 class="serif">診断の記録</h1><p class="lead-l">これまでの診断結果を、この端末に残せます。</p></header>
    ${last ? `<button class="rec-last" id="lastRes"><img src="img/fabric_${last.top}.jpg" alt="" aria-hidden="true"><span class="k">いちばん新しい結果</span><b class="serif">${SEASONS[last.top].name}<em class="latin">${SEASONS[last.top].en}</em></b><small>2番目 ${SEASONS[last.second].name}</small><small>${fmt(last.at)}</small></button>` : '<p class="lead-l">まだ記録がありません。診断をすると、ここに残ります。</p>'}
    ${list.length ? `<section class="book ${Buy.owned ? 'open' : 'locked'}" id="recs"><h2 class="serif">${Buy.owned ? '' : ICON.lock}これまでの記録<small>${sm.count}回</small></h2>
      ${Buy.owned ? recList(list, sm) : `<div class="lockwrap"><p class="desc">光や季節を変えて比べ直すと、どこに落ち着くかが見えてきます。</p><div class="veil" aria-hidden="true">${recList(list.length > 2 ? list : list.concat(list, list), sm)}</div><button class="btn btn-navy sm unlock" data-k="history">${ICON.lock}全部ひらく</button></div>`}</section>` : ''}
    <button class="fr-cta light" id="toFriends"><img src="img/po_friends.jpg" alt="" aria-hidden="true"><span><b class="serif">友だちと比べる</b><small>${store.data.friends.length ? `${store.data.friends.length}人の色` : '二人とも似合う色・おそろいの色'}</small></span>${ICON.arr}</button>
    <button class="btn btn-navy" id="again">もう一度比べる${ICON.arr}</button>
    <p class="fine">記録に残すのは結果の季節と割合、日時だけです。写真は残しません。</p>
  </section>`;
  const lr = $('#lastRes'); if (lr) lr.onclick = () => { X.result = fromRecord(last); X.from = 'history'; go('result'); };
  scr.querySelectorAll('.unlock').forEach(b => b.onclick = () => paywall('history'));
  $('#toFriends').onclick = () => go('friends');
  $('#again').onclick = () => { resetRun(); go('prep'); };
};
function recList(list, sm) {
  return `<p class="sum">いちばん多いのは <b>${sm.top ? SEASONS[sm.top].name : '-'}</b>(${sm.times}回)です。</p>
    <ul class="hist">${list.slice(0, 20).map(h => `<li><time>${fmt(h.at)}</time><i style="background:${SEASONS[h.top].key}"></i><b>${SEASONS[h.top].name}</b><span class="hb"><i style="width:${h.shares[h.top]}%;background:${SEASONS[h.top].key}"></i></span><em>${h.shares[h.top]}%</em></li>`).join('')}</ul>`;
}
function fmt(t) { const d = new Date(t); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; }

// ---- 12b 友だちと比べる(友だちの季節は、共有された文のリンクか、本人が選んで入れる。写真は使わない)
const chipsOf = list => swatchRow(list, 'named');
function friendCard(f, me, open) {
  const F = SEASONS[f.top]; const c = me ? compare(me.top, f.top) : null;
  const body = c ? `<p class="desc">${KIND_TEXT[c.kind]}</p><h4>二人とも似合う色</h4>${chipsOf(c.both)}<h4>おそろいで着るなら</h4>${chipsOf(c.wear)}<h4>${esc(f.name)}さんに贈るなら</h4>${chipsOf(c.gift)}`
    : `<p class="desc">自分の色を比べると、二人とも似合う色が出ます。</p><h4>${esc(f.name)}さんの得意な色</h4>${chipsOf(F.best.slice(0, 4))}`;
  return `<section class="book fr ${open ? 'open' : 'locked'}" data-id="${f.id}">
    <div class="fr-h"><span class="fr-dots" title="${me ? 'あなた ' + SEASONS[me.top].name + '・' : ''}${esc(f.name)} ${F.name}"><i style="background:${me ? SEASONS[me.top].key : '#CDD2D7'}"></i><i style="background:${F.key}"></i></span>
      <h2 class="serif">${esc(f.name)}<small>${F.name}${f.second ? ` ・ 2番目 ${SEASONS[f.second].name}` : ''}</small></h2>
      <button class="fr-del" data-id="${f.id}" aria-label="${esc(f.name)}を消す">×</button></div>
    ${open ? body : `<div class="lockwrap"><div class="veil" aria-hidden="true">${body}</div><button class="btn btn-navy sm unlock" data-k="friends">${ICON.lock}全部ひらく</button></div>`}
  </section>`;
}
SCREENS.friends = () => {
  const me = store.latest(); const list = store.data.friends; const d = X.draft || { top: null, second: null, name: '' };
  scr.innerHTML = `<section class="shelf friends">
    <div class="set-top"><button class="back" id="back" aria-label="戻る">${ICON.back}</button><h1 class="serif">友だちと比べる</h1><span></span></div>
    <p class="lead-l">友だちの季節を入れると、二人とも似合う色やおそろいの色が出ます。${Buy.owned ? '' : `<br><small>1人目はそのまま見られます。2人目からは全部ひらくで。</small>`}</p>
    ${me ? `<p class="fr-me">あなた <b>${SEASONS[me.top].name}</b></p>` : `<button class="btn btn-navy" id="frStart">まず自分の色を比べる${ICON.arr}</button>`}
    ${list.map((f, i) => friendCard(f, me, Buy.owned || i < FREE_FRIENDS)).join('')}
    <section class="book fr-add" id="frAdd"><h2 class="serif">友だちを入れる</h2>
      <p class="desc">友だちが共有した文のリンクを貼るか、季節を選んでください。</p>
      <label class="fr-field"><span>呼び名</span><input id="frName" maxlength="10" placeholder="例 ゆい" value="${esc(d.name || '')}"></label>
      <label class="fr-field"><span>リンク</span><input id="frLink" inputmode="url" placeholder="?f= のついたリンク"></label>
      <p class="fr-k">季節</p><div class="seg" id="frTop">${ORDER.map(x => `<button data-s="${x}" aria-pressed="${d.top === x}">${SEASONS[x].name}</button>`).join('')}</div>
      <p class="fr-k">2番目(分かれば)</p><div class="seg" id="frSec">${ORDER.map(x => `<button data-s="${x}" aria-pressed="${d.second === x}">${SEASONS[x].name}</button>`).join('')}</div>
      <button class="btn btn-navy" id="frSave" ${d.top ? '' : 'disabled'}>この友だちを入れる</button>
      <p class="fine">入れた友だちは、この端末の中だけに残ります。</p>
    </section>
    <p class="fine">${me ? `あなたのコード <b id="myCode">${friendCode(me.top, me.second)}</b>(結果カードの共有の文に、リンクとして入ります)` : 'あなたのコードは、診断のあとに出ます'}</p>
  </section>`;
  const keep = () => { X.draft = { top: d.top, second: d.second, name: $('#frName').value }; };
  onBack(() => { X.draft = null; go(store.latest() ? 'history' : 'home'); });
  const fs = $('#frStart'); if (fs) fs.onclick = () => { resetRun(); go('prep'); };
  scr.querySelectorAll('#frTop button').forEach(b => b.onclick = () => { d.top = b.dataset.s; if (d.second === d.top) d.second = null; keep(); SCREENS.friends(); });
  scr.querySelectorAll('#frSec button').forEach(b => b.onclick = () => { d.second = d.second === b.dataset.s || b.dataset.s === d.top ? null : b.dataset.s; keep(); SCREENS.friends(); });
  $('#frLink').oninput = e => { const f = parseFriend(e.target.value); if (f) { d.top = f.top; d.second = f.second; keep(); SCREENS.friends(); toast('リンクから季節を読みました'); } };
  $('#frSave').onclick = () => {
    if (!d.top) return; store.addFriend({ name: $('#frName').value, top: d.top, second: d.second });
    X.draft = null; X.incoming = null; toast('友だちを入れました'); go('friends');
  };
  scr.querySelectorAll('.fr-del').forEach(b => b.onclick = () => { store.removeFriend(b.dataset.id); SCREENS.friends(); });
  scr.querySelectorAll('.unlock').forEach(b => b.onclick = () => paywall('friends'));
  bindChips();
};

// ---- 13 設定
SCREENS.settings = () => {
  scr.innerHTML = `<section class="shelf settings">
    <div class="set-top"><button class="back" id="back" aria-label="戻る">${ICON.back}</button><h1 class="serif">設定</h1><span></span></div>
    <ul class="menu">
      <li><button id="howto"><b>撮り方を見る</b><small>白い紙と光のコツ</small>${ICON.arr}</button></li>
      ${Buy.isApp() ? `<li><button id="restore"><b>購入を復元</b><small>${Buy.owned ? 'ひらいています' : '前に買った時はこちら'}</small>${ICON.arr}</button></li>` : ''}
      <li><button id="wipe"><b>記録を消す</b><small>この端末の診断の記録を消します</small>${ICON.arr}</button></li>
    </ul>
    <div class="about"><h2 class="serif">写真について</h2><p>写真の読み込み・白の補正・見比べ・結果カードづくりは、すべてこの端末の中で行います。写真をどこかへ送ったり、保存したりはしません。記録に残すのは、結果の季節と割合と日時だけです。</p>
      <h2 class="serif">結果について</h2><p>結果は、選んだ布と回答から出した似合う色の目安です。照明・カメラ・画面の色によって見え方は変わります。気になる時は、光を変えてもう一度比べてみてください。</p>
      <p class="legal"><a href="https://yurustudio.github.io/ironuno/privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a><span aria-hidden="true"> ・ </span><a href="https://yurustudio.github.io/ironuno/terms.html" target="_blank" rel="noopener">利用規約</a></p></div>
    <p class="status" id="setStatus" role="status">${esc(Buy.message || "")}</p>
  </section>`;
  onBack(() => go('home'));
  $('#howto').onclick = () => { resetRun(); go('prep'); };
  const rs = $('#restore'); if (rs) rs.onclick = () => Buy.restore();
  $('#wipe').onclick = () => {
    openSheet(`<div class="confirm"><h2 class="serif">記録を消しますか</h2><p>これまでの診断の記録をこの端末から消します。元には戻せません。</p>
      <div class="row2"><button class="btn btn-line" id="cNo">やめる</button><button class="btn btn-navy" id="cYes">消す</button></div></div>`, 'confirm');
    $('#cNo').onclick = () => closeSheet();
    $('#cYes').onclick = () => { store.data.results = []; store.save(); X.result = null; closeSheet(); toast('記録を消しました'); };
  };
};

// ---- 10 全部ひらく(下から出るシート)
// 何がひらくかを絵で並べる(絵は ChatGPT に作らせた物 design/chatgpt_paywall)
const PERKS = [['po_makeup', 'メイクの色', 'リップ・チーク・アイシャドウ'], ['po_wear', '服の色', '土台の色と差し色'], ['po_hair', '髪色', '美容室で見せる見本'],
  ['po_avoid', '顔から離したい色', '着るなら顔から遠くに'], ['po_all', '4つの季節の96色', '色の本棚を全部'], ['po_friends', '友だちと比べる', '2人目からも何人でも']];
function paywall(from) {
  const app = Buy.isApp();
  openSheet(`<div class="pw" data-from="${from}">
    <button class="x on-dark" id="pwClose" aria-label="閉じる">×</button>
    <p class="latin">Ironuno color library</p>
    <h2 class="serif">色の本棚を、<br>全部ひらく。</h2>
    <p class="pw-sub">一度の購入で、ひらくのはこの6つです。</p>
    <ul class="tiles">${PERKS.map(([ic, t, d]) => `<li><img src="img/${ic}.jpg" alt=""><b>${t}</b><small>${d}</small></li>`).join('')}</ul>
    <p class="pw-rec">診断の記録の一覧(いちばん多く出た季節)もひらきます。</p>
    ${app ? `<div class="pw-price"><span>買い切り</span>${priceTag('pwPrice')}</div>
      <button class="btn btn-pearl" id="buy" ${Buy.busy ? 'disabled' : ''}>${Buy.price ? `${esc(Buy.price)}で全部ひらく` : '全部ひらく'}</button>
      <p class="once">一度の購入でずっと使える・月額なし・自動更新なし</p>
      <div class="pw-links"><button class="btn-text on-dark" id="later">今は見ない</button><button class="btn-text on-dark" id="restore">購入を復元</button></div>`
      : `<p class="webonly" id="webOnly">全部ひらくのは、アプリ版でできます。ブラウザ版では購入できません。</p>
      ${playUrl() ? `<p class="once"><a class="on-dark" id="playLink" href="${esc(playUrl())}" target="_blank" rel="noopener">Android 版のテストに参加する</a></p>` : ''}
      <p class="once">アプリ版は一度の購入でずっと使えます・月額なし</p>
      <div class="pw-links"><button class="btn-text on-dark" id="later">今は見ない</button></div>`}
    <p class="status" id="pwStatus" role="status">${esc(Buy.message || '')}</p>
    <p class="legal on-dark"><a href="https://yurustudio.github.io/ironuno/privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a><span aria-hidden="true"> ・ </span><a href="https://yurustudio.github.io/ironuno/terms.html" target="_blank" rel="noopener">利用規約</a></p>
  </div>`, 'paywall');
  $('#pwClose').onclick = $('#later').onclick = () => closeSheet();
  if (app) { $('#buy').onclick = () => Buy.buy(); $('#restore').onclick = () => Buy.restore(); }
}
function openSheet(html, kind) {
  sheet.innerHTML = `<div class="sheet-in ${kind}">${html}</div>`; sheet.dataset.kind = kind; sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add('on'));
  sheet.onclick = e => { if (e.target === sheet) closeSheet(); };
}
function closeSheet(quick) { if (sheet.hidden) return; sheet.classList.remove('on'); sheet.hidden = true; sheet.innerHTML = ''; Buy.message = ''; }
Buy.onChange = () => {
  const st = $('#pwStatus') || $('#setStatus'); if (st) st.textContent = Buy.message || '';
  const b = $('#buy'); if (b) b.disabled = Buy.busy;
  if (Buy.owned && sheet.dataset.kind === 'paywall' && !sheet.hidden) { const m = Buy.message; closeSheet(); if (m) toast(m); go(X.screen, { keepScroll: true }); }
  else if (Buy.ready && ['home', 'result', 'shelf', 'history', 'settings', 'friends'].includes(X.screen) && sheet.hidden) go(X.screen, { keepScroll: true });
};

function playUrl() { const c = window.IRO_CONFIG; return (c && c.playUrl) || ''; }
// Android の戻るボタン: シートを閉じる → 画面の戻る → ホームへ → アプリを閉じる
(() => {
  const C = window.Capacitor; const A = C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.App;
  if (!A || !A.addListener) return;
  A.addListener('backButton', () => {
    if (!sheet.hidden) return closeSheet();
    const b = $('#back'); if (b) return b.click();
    if (X.screen !== 'home') return go('home');
    A.exitApp();
  });
})();

window.__iro = { X, store, Buy, go, judge, cardLines: null };
go('home');
Buy.init();
