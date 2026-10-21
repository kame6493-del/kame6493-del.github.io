// イロヌノの画面。流れは ChatGPT の提案(design/chatgpt_v2/提案の要点.txt)どおり:
// 診断中は一本道(撮り方 → 白で補正 → 顔の位置 → 布で比べる ×12 → 質問 ×5 → 結果 → 結果カード)。
// 診断のあとは下の3タブ(ホーム・色の本棚・記録)。設定はホームの右上。
// 写真はこの端末の中だけで扱う。送信も保存もしない。記録に残すのは結果の数字だけ。
import { samplePatch, whiteGains, applyGains, applyGainsPixel, paperWarnings, cheekColor, rgbToHex, inkOn } from './color.js';
import { SEASONS, ORDER, FREE_COUNT, FAMILY_TEXT } from './seasons.js';
import { ROUNDS, makeRounds, drapeColor, QUESTIONS, judge, CLARITY_TEXT } from './judge.js';
import { openStore } from './storage.js';
import { createPurchase } from './purchase.js';
import { drawCard, cardLines, cardAssets } from './card.js';
import { shareCanvas, shareText } from './share.js';
import { paintDrape, drapeAssets, cropHead } from './drape.js';

export const APP_NAME = 'イロヌノ';
const $ = (s, el = document) => el.querySelector(s);
const appEl = $('#app'), scr = $('#screen'), tabsEl = $('#tabs'), sheet = $('#sheet'), toastEl = $('#toast');
const store = openStore(safeLS());
const Buy = createPurchase();
const X = { screen: 'home', photo: null, white: null, face: null, head: null, skin: null, rounds: [], picks: [], step: 0, answers: {}, q: 0, result: null, saved: false, shelf: null, from: null };

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
const MODE = { home: 'dark', result: 'dark', card: 'dark', prep: 'lab', white: 'lab', face: 'lab', quiz: 'lab', drape: 'neutral', shelf: 'light', history: 'light', settings: 'light' };
const TABBED = { home: 'home', result: 'home', shelf: 'shelf', history: 'history' };
const SCREENS = {};
function go(name, opts = {}) {
  X.screen = name; closeSheet(true);
  appEl.dataset.mode = MODE[name] || 'light'; appEl.dataset.screen = name;
  document.querySelector('meta[name=theme-color]').setAttribute('content', MODE[name] === 'dark' ? '#152232' : '#FFFFFF');
  SCREENS[name](opts);
  drawTabs();
  if (!opts.keepScroll) scr.scrollTop = 0;
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
    ${last ? `<button class="lastcard" id="lastRes" style="--acc:${SEASONS[last.top].key}">
        <span class="lc-k">前回の結果</span><i class="lc-line"></i>${ICON.arr}
        <b class="serif">${SEASONS[last.top].name}</b><small>2番目 ${SEASONS[last.second].name}</small>
        <span class="lc-dots">${SEASONS[last.top].best.slice(0, FREE_COUNT).map(c => `<i style="background:${c.hex}"></i>`).join('')}</span>
        <img src="img/fabric_${last.top}.jpg" alt="">
      </button>` : `<ol class="home-flow" aria-label="診断の流れ"><li><b>1</b>白い紙と一緒に撮る</li><li><b>2</b>布を当てて12回見比べる</li><li><b>3</b>5つの質問に答える</li></ol>`}
    <p class="fine on-dark">結果は見え方の目安です。照明・カメラ・画面によって変わります。</p>
  </section>`;
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
    <h1 class="h1">白い紙を、顔のそばに。</h1>
    <div class="howto-pic"><img src="img/howto.jpg" alt="白い紙を顔の横に持って撮る見本"></div>
    <ul class="tips">
      <li><img src="img/tip_light.png" alt="">窓ぎわなど、顔に均一な光を</li>
      <li><img src="img/tip_paper.png" alt="">紙に影がかからないように</li>
      <li><img src="img/tip_hair.png" alt="">髪は顔にかからないように・メイクは薄めで</li>
    </ul>
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
      <div class="wb"><i class="dot" style="background:${shot}" title="${shot}"></i><span>写った白</span><span aria-hidden="true">→</span><i class="dot" style="background:${fixed}" title="${fixed}"></i><span>合わせた白</span>
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
    <p class="lead">鼻のあたりをタップ。大きさはつまみで合わせます</p>
    <div class="photo"><canvas id="fc" width="${P.w}" height="${P.h}" aria-label="写真。鼻のあたりをタップ"></canvas></div>
    <label class="slider"><b>顔の大きさ</b><input type="range" id="fs" min="8" max="45" value="${v}" style="--v:${(v - 8) / 37 * 100}%"><small><span>小さく</span><span>大きく</span></small></label>
    <button class="btn btn-navy" id="fOk" ${X.face.set ? '' : 'disabled'}>布で比べる${ICON.arr}</button>
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
  cv.onclick = e => { const [x, y] = toPhoto(cv, e); X.face.cx = x; X.face.cy = y; X.face.set = true; X.head = null; $('#fOk').disabled = false; draw(); };
  $('#fs').oninput = e => { X.face.rx = P.w * e.target.value / 100; X.face.ry = X.face.rx * 1.32; X.head = null; e.target.style.setProperty('--v', (e.target.value - 8) / 37 * 100 + '%'); draw(); };
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
    <div class="pair">${['left', 'right'].map(side => `<button class="drape" data-side="${side}" data-season="${p[side]}" data-hex="${drapeColor(p[side], p.family)}" aria-label="${side === 'left' ? '左' : '右'}を選ぶ"><canvas width="420" height="780"></canvas><span>${side === 'left' ? '左' : '右'}</span></button>`).join('')}</div>
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
const softName = n => n.length >= 5 ? esc(n.slice(0, Math.ceil(n.length / 2))) + '<wbr>' + esc(n.slice(Math.ceil(n.length / 2))) : esc(n);
function swatchRow(list, cls = '') {
  return `<ul class="sw ${cls}">${list.map(c => `<li><button class="chip" data-hex="${c.hex}" data-name="${esc(c.name)}" style="--c:${c.hex}" aria-label="${esc(c.name)}"><i></i></button><span>${softName(c.name)}</span></li>`).join('')}</ul>`;
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
    ${Buy.owned ? `<button class="shelf-cta owned" id="toShelf"><span class="serif">色の本棚をひらく</span><small>メイク・服の色・髪色・顔から離したい色</small>${ICON.arr}</button>` : `
    <div class="shelf-cta" id="promo">
      <img src="img/promo_silk.jpg" alt="" aria-hidden="true">
      <p class="serif">似合う色を、<br>毎日の選択へ。</p>
      <p class="sub">コスメ、服、髪色まで。あなたの季節の色をもっと詳しく。</p>
      <ul class="locks"><li><img src="img/lk_makeup.png" alt="">メイク${ICON.lock}</li><li><img src="img/lk_wear.png" alt="">服の色${ICON.lock}</li><li><img src="img/lk_hair.png" alt="">髪色${ICON.lock}</li></ul>
      <button class="btn btn-pearl" id="openAll">色の本棚を全部ひらく${ICON.arr}</button>
    </div>`}
    <button class="btn-text on-dark" id="again">もう一度比べる</button>
  </section>`;
  bindChips();
  onBack(() => go('home'));
  $('#toCard').onclick = $('#shareTop').onclick = () => go('card');
  const oa = $('#openAll'); if (oa) oa.onclick = () => paywall('result');
  const ts = $('#toShelf'); if (ts) ts.onclick = () => { X.shelf = r.top; go('shelf'); };
  $('#again').onclick = () => { resetRun(); go('prep'); };
};

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
  } catch (e) { toast('保存できませんでした'); }
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
  const body = (k, v) => k === 'best' ? swatchRow(v, 'dots') : k === 'makeup' ? makeupCols(v) : Array.isArray(v) ? swatchRow(v, 'named') : Object.entries(v).map(([sk, list]) => `<h4>${SUB[sk]}</h4>${swatchRow(list, 'named')}`).join('');
  scr.innerHTML = `<section class="shelf">
    <div class="sh-art" aria-hidden="true"><img src="img/card_${s}.jpg" alt=""></div>
    <header class="sh-head"><p class="latin dark">Color library</p><h1 class="serif">色の本棚</h1>
      <p class="lead-l">${last ? `あなたの季節は <b>${SEASONS[last.top].name}</b>。<br>ほかの季節も見られます。` : 'まだ診断していません。<br>季節を選ぶと見本を見られます。'}</p></header>
    <div class="seg" role="tablist">${ORDER.map(x => `<button role="tab" data-s="${x}" aria-selected="${x === s}">${SEASONS[x].name}</button>`).join('')}</div>
    ${SHELF.map(([k, title, get, desc]) => {
      const v = get(s);
      if (k === 'best') {
        const rest = T.best.slice(palette.length);
        return `<section class="book" data-k="best"><h2 class="serif">${title} ${T.best.length}色</h2>
          ${palette.length ? body('best', palette) : ''}
          ${rest.length ? `<div class="lockwrap">${palette.length ? '<p class="desc more">ここから先の色</p>' : `<p class="desc">${desc}</p>`}<div class="veil" aria-hidden="true">${body('best', rest.slice(0, 12))}</div><button class="btn btn-navy sm unlock" data-k="best">${ICON.lock}全部ひらく</button></div>` : ''}</section>`;
      }
      return `<section class="book ${own ? 'open' : 'locked'}" data-k="${k}"><h2 class="serif">${own ? '' : ICON.lock}${title}</h2><p class="desc">${desc}</p>
        ${own ? body(k, v) : `<div class="lockwrap"><div class="veil" aria-hidden="true">${body(k, v)}</div><button class="btn btn-navy sm unlock" data-k="${k}">${ICON.lock}全部ひらく</button></div>`}</section>`;
    }).join('')}
    <p class="fine">色をタップすると、大きく見られます。色は画面によって少しずつ違って見えるので、お店では実物を顔の近くに当てて確かめてください。</p>
  </section>`;
  scr.querySelectorAll('.seg button').forEach(b => b.onclick = () => { X.shelf = b.dataset.s; go('shelf'); });
  scr.querySelectorAll('.unlock').forEach(b => b.onclick = () => paywall('shelf'));
  bindChips();
};
// 色をタップすると大きく出す(お店で見せる用)
function bindChips() {
  scr.querySelectorAll('.chip').forEach(b => b.onclick = () => {
    if (b.closest('.veil')) return;
    const hex = b.dataset.hex;
    openSheet(`<div class="big" style="background:${hex};color:${inkOn(hex)}"><button class="x" id="shClose" aria-label="閉じる">×</button><b class="serif">${b.dataset.name}</b><small>${hex}</small></div>`, 'bigcolor');
    $('#shClose').onclick = () => closeSheet();
  });
}

// ---- 12 記録
SCREENS.history = () => {
  const list = store.data.results; const sm = store.summary(); const last = store.latest();
  scr.innerHTML = `<section class="shelf">
    <header class="sh-head"><h1 class="serif">診断の記録</h1><p class="lead-l">これまでの診断結果を、この端末に残せます。</p></header>
    ${last ? `<button class="rec-last" id="lastRes"><img src="img/fabric_${last.top}.jpg" alt="" aria-hidden="true"><span class="k">いちばん新しい結果</span><b class="serif">${SEASONS[last.top].name}<em class="latin">${SEASONS[last.top].en}</em></b><small>2番目 ${SEASONS[last.second].name}</small><small>${fmt(last.at)}</small></button>` : '<p class="lead-l">まだ記録がありません。診断をすると、ここに残ります。</p>'}
    ${list.length ? `<section class="book ${Buy.owned ? 'open' : 'locked'}" id="recs"><h2 class="serif">${Buy.owned ? '' : ICON.lock}これまでの記録<small>${sm.count}回</small></h2>
      ${Buy.owned ? recList(list, sm) : `<div class="lockwrap"><p class="desc">光や季節を変えて比べ直すと、どこに落ち着くかが見えてきます。</p><div class="veil" aria-hidden="true">${recList(list.length > 2 ? list : list.concat(list, list), sm)}</div><button class="btn btn-navy sm unlock" data-k="history">${ICON.lock}全部ひらく</button></div>`}</section>` : ''}
    <button class="btn btn-navy" id="again">もう一度比べる${ICON.arr}</button>
    <p class="fine">記録に残すのは結果の季節と割合、日時だけです。写真は残しません。</p>
  </section>`;
  const lr = $('#lastRes'); if (lr) lr.onclick = () => { X.result = fromRecord(last); X.from = 'history'; go('result'); };
  scr.querySelectorAll('.unlock').forEach(b => b.onclick = () => paywall('history'));
  $('#again').onclick = () => { resetRun(); go('prep'); };
};
function recList(list, sm) {
  return `<p class="sum">いちばん多いのは <b>${sm.top ? SEASONS[sm.top].name : '-'}</b>(${sm.times}回)です。</p>
    <ul class="hist">${list.slice(0, 20).map(h => `<li><time>${fmt(h.at)}</time><i style="background:${SEASONS[h.top].key}"></i><b>${SEASONS[h.top].name}</b><span class="hb"><i style="width:${h.shares[h.top]}%;background:${SEASONS[h.top].key}"></i></span><em>${h.shares[h.top]}%</em></li>`).join('')}</ul>`;
}
function fmt(t) { const d = new Date(t); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; }

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
const PERKS = [['pk_palette', '季節の色見本をすべて見る', '4つの季節、各24色'], ['pk_makeup', 'メイク・服・髪色のヒント', 'リップ・チーク・アイシャドウ、着回しの色'], ['pk_avoid', '避けたい色と取り入れ方', '顔から離して使うコツ'], ['pk_record', '再診断の記録を残す', 'いちばん多く出た季節も']];
function paywall(from) {
  const app = Buy.isApp();
  openSheet(`<div class="pw" data-from="${from}">
    <div class="pw-art" aria-hidden="true"><img src="img/paywall_silk.jpg" alt=""></div>
    <button class="x on-dark" id="pwClose" aria-label="閉じる">×</button>
    <p class="latin">Ironuno color library</p>
    <h2 class="serif">似合う色を、<br>毎日の味方に。</h2>
    <p class="pw-sub">診断で見つけた色を、もっと使いこなそう。</p>
    <ul class="perks">${PERKS.map(([ic, t, d]) => `<li><img src="img/${ic}.jpg" alt=""><span><b>${t}</b><small>${d}</small></span></li>`).join('')}</ul>
    ${app ? `<button class="btn btn-pearl" id="buy" ${Buy.busy ? 'disabled' : ''}>全部ひらく${Buy.price ? `<span class="price">${esc(Buy.price)}</span>` : ''}</button>
      <p class="once">一度の購入でずっと使える・月額料金なし</p>
      <div class="pw-links"><button class="btn-text on-dark" id="later">今は見ない</button><button class="btn-text on-dark" id="restore">購入を復元</button></div>`
      : `<p class="webonly" id="webOnly">全部ひらくのは、アプリ版でできます。ブラウザ版では購入できません。</p>
      ${playUrl() ? `<p class="once"><a class="on-dark" id="playLink" href="${esc(playUrl())}" target="_blank" rel="noopener">Android 版のテストに参加する</a></p>` : ''}
      <p class="once">アプリ版は一度の購入でずっと使えます・月額料金なし</p>
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
  else if (Buy.ready && ['result', 'shelf', 'history', 'settings'].includes(X.screen) && sheet.hidden) go(X.screen, { keepScroll: true });
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
