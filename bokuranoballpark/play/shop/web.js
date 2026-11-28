// ブラウザ版だけに入る(make_web.py が index.html に差し込む)。課金の部品(RevenueCat・Capacitor)は入れない。ゲーム本体のコードは変えない。
// ブラウザ版で遊べる球場は浜風だけ(gate.js が見る)。ほかの球場は選ぶ画面で鍵の札に「近日追加」を付け、決定しても「〜は近日追加します」と出すだけ(買う画面は無い)。
import { STADIUMS } from '../js/stadiums.js';

const $ = (s, r = document) => r.querySelector(s);
const NAME = Object.fromEntries(STADIUMS.map((s) => [s.id, s.name]));
const st = document.createElement('style');
st.textContent = '#stadiumScreen .stFree{display:none !important}#stadiumScreen .ipSoon{font-size:11px;font-weight:900;white-space:nowrap}';
document.head.appendChild(st);

function toast(text) {
  let t = $('#ippomeToast');
  if (!t) { t = document.createElement('div'); t.id = 'ippomeToast'; document.body.appendChild(t); }
  t.textContent = text; t.classList.add('on');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2600);
}
function openSheet(k) { toast(`${NAME[k] || 'この球場'}は近日追加します`); }

function decorate() {
  const scr = $('#stadiumScreen'); if (!scr) return;
  scr.querySelectorAll('.stLock').forEach((l) => { l.removeAttribute('title'); if (!$('.ipSoon', l)) l.insertAdjacentHTML('beforeend', '<span class="ipSoon">近日追加</span>'); });
  const go = $('.stGo', scr); if (go && go.classList.contains('locked')) go.textContent = '近日追加';
}
(function hookPicker(n) {
  const pk = window.__app && window.__app.ui && window.__app.ui.picker;
  if (pk && pk.pick && !pk.__ipHooked) {
    const orig = pk.pick.bind(pk); pk.pick = (id) => { const r = orig(id); try { decorate(); } catch (e) { /* なし */ } return r; }; pk.__ipHooked = true; decorate(); return;
  }
  if (n < 120) setTimeout(() => hookPicker(n + 1), 500);
})(0);

window.__ippomeShop = { openSheet, web: true };

// ------------------------------------------------ 11/25 結果を X に出す(window.IPPOME_APP.shareX が true の時だけ。make_web.py が shop/config.js に書く。アプリ版の make_www.py は書かないので出ない)
// 作戦: ios_release/promo/x_growth_1125/deep_strategy.md 2-1。ゲーム本体のコードは変えず、ここで ui.result を包んで数を受け取り、結果の画面に小さなボタンを1つ足す。
// 置く所: 守備の試合・ノックの結果(#result)、守備のキャリアの結果(#carRes)、写真モードの「この画面を保存」の横(#photoBar)。
// 文: 球場の名前・守った位置・捕った数・ノックの連続・ダイビングキャッチの数と「超えられる?」。タグは #ぼくらのボールパーク の1つ。実在の球団の名前・色は入れない。
// 開き方: スマホ(指で触る端末)で絵のファイルを共有できる時は端末の共有シート(絵 + 文)。返りは待たない(iOS の「画像を保存」で返りが来ない不具合)。
//         それ以外は https://x.com/intent/post?text=… を新しいタブで。押した回数は数えない。
import { POS_LABEL } from '../js/rules.js';
const SHARE_URL = 'https://yurustudio.github.io/bokuranoballpark/play/';
const SHARE_TAG = '#ぼくらのボールパーク';
const shareOn = () => !!(window.IPPOME_APP && window.IPPOME_APP.shareX);
const plays = { dive: 0, jump: 0 };
addEventListener('defense-eval', (e) => { const s = e.detail && e.detail.special; if (s === 'dive' || s === 'jump') plays[s]++; });
const stadiumName = () => { const a = window.__app; const id = a && a.ui && a.ui.app && a.ui.app.stadium; return NAME[id] || NAME.koshien || '浜風の球場'; };
const intentUrl = (text) => 'https://x.com/intent/post?text=' + encodeURIComponent(text);

export function shareTextFor(r, extra = {}) {
  const s = r.stats || {}, pos = POS_LABEL[r.pos] || '', st = extra.stadium || stadiumName();
  const dv = extra.dive != null ? extra.dive : plays.dive, jp = extra.jump != null ? extra.jump : plays.jump;
  const fine = [dv ? `ダイビングキャッチ ${dv}回` : '', jp ? `ジャンピングキャッチ ${jp}回` : ''].filter(Boolean).join('・');
  let head;
  if (r.kind === 'knock') head = `${st}で${pos}のノック ${r.caught}/${r.done}本 捕った⚾ 連続 ${r.streak || 0}本${fine ? '・' + fine : ''}`;
  else if (extra.career) head = `守備のキャリア、${st}で${pos}を守って 守備評価 ${extra.career}・捕った ${s.caught || 0}・アウト ${s.outs || 0}⚾${fine ? ' ' + fine : ''}`;
  else head = `${st}で${pos}を守って 捕った ${s.caught || 0}・アウト ${s.outs || 0}⚾${fine ? ' ' + fine : ''}`;
  return `${head}。超えられる? ${SHARE_TAG} ${SHARE_URL}`;
}

// 3D の画面をその場で絵にする(写真モード・結果の絵)。描いた直後に写すので preserveDrawingBuffer は要らない
function grabScene() {
  const a = window.__app; if (!a || !a.renderer) return null;
  try {
    a.render(1);
    const src = a.renderer.domElement, cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
    cv.getContext('2d').drawImage(src, 0, 0); return cv;
  } catch (e) { return null; }
}
function canvasFile(cv, name) {
  try {
    const d = cv.toDataURL('image/jpeg', 0.9), bin = atob(d.split(',')[1]), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new File([u], name, { type: 'image/jpeg' });
  } catch (e) { return null; }
}
// 結果の絵(1200x630): 球場の画面の下に、題名と今回の数の帯
function resultCard(text) {
  const sc = grabScene(); if (!sc) return null;
  const W = 1200, H = 630, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const k = Math.max(W / sc.width, H / sc.height); g.drawImage(sc, (W - sc.width * k) / 2, (H - sc.height * k) / 2, sc.width * k, sc.height * k);
  const band = g.createLinearGradient(0, H - 200, 0, H); band.addColorStop(0, 'rgba(8,20,40,0)'); band.addColorStop(0.45, 'rgba(8,20,40,.78)'); band.addColorStop(1, 'rgba(8,20,40,.9)');
  g.fillStyle = band; g.fillRect(0, H - 200, W, 200);
  g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
  g.font = "900 40px 'Dela Gothic One', system-ui, sans-serif"; g.fillText('ぼくらのボールパーク', 36, H - 92);
  const line = text.split('。超えられる?')[0];
  let fs = 30; g.font = `800 ${fs}px system-ui, sans-serif`;
  while (g.measureText(line).width > W - 72 && fs > 18) { fs -= 1; g.font = `800 ${fs}px system-ui, sans-serif`; }
  g.fillText(line, 36, H - 40);
  return canvasFile(cv, 'ballpark_result.jpg');
}
function shareNow(text, file) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  try {
    if (coarse && file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], text }).catch(() => {});   // 返りを待たない
      window.__shareX = 'sheet'; return 'sheet';
    }
  } catch (e) { /* 下の X の画面へ */ }
  window.open(intentUrl(text), '_blank', 'noopener');
  window.__shareX = 'intent'; return 'intent';
}

const XSVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 2H22l-7.4 8.5L23.3 22h-6.8l-5.3-7-6.1 7H2l7.9-9.1L1.6 2h7l4.8 6.4L18.9 2Zm-1.2 18h1.9L7.4 3.9h-2L17.7 20Z"/></svg>';
function mkBtn(id, onClick) {
  const b = document.createElement('button'); b.id = id; b.className = 'ipShareX'; b.type = 'button';
  b.innerHTML = XSVG + '<span>X に出す</span>';
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(b); });
  return b;
}

if (shareOn()) {
  const css = document.createElement('style');
  css.textContent = '.ipShareRow{display:flex;justify-content:center;grid-column:1/-1;margin-top:10px}'
    + '.ipShareX{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:6px 16px;min-height:36px;border-radius:999px;border:2px solid rgba(255,255,255,.8);background:rgba(10,18,30,.6);color:#fff;font-size:14px;font-weight:800;cursor:pointer;white-space:nowrap}'
    + '.ipShareX svg{width:14px;height:14px;flex:none}#photoBar .ipShareX{min-height:44px}';
  document.head.appendChild(css);
  const place = (r) => {
    const car = document.getElementById('carRes'), carOn = !!(car && !car.classList.contains('hide'));
    const rank = carOn ? ((car.querySelector('.cMain .cStamp span') || {}).textContent || '').trim() : '';
    const text = shareTextFor(r, carOn ? { career: rank || '-' } : {});
    let file = null; setTimeout(() => { file = resultCard(text); }, 350);   // 絵は先に作っておく(押した時は待たない)
    document.querySelectorAll('.ipShareRow').forEach((x) => x.remove());
    const row = document.createElement('div'); row.className = 'ipShareRow';
    const b = mkBtn('ipShareRes', () => shareNow(text, file)); b.dataset.text = text; row.appendChild(b);
    const host = carOn ? car.querySelector('.carSheet') : document.querySelector('#result .sheet');
    if (host) host.appendChild(row);
  };
  (function hookResult(n) {
    const a = window.__app, ui = a && a.ui;
    // 守備のキャリア(js/career.js)が ui.result を包み終わってから、その外側を包む(キャリアの試合の数も受け取るため)
    const careerReady = !!(ui && ui.result && /onResult/.test(String(ui.result)));
    if (ui && ui.result && a.ready && (careerReady || n > 40) && !ui.result.__ipShare) {
      const orig = ui.result;
      const wrapped = function (r) {
        const out = orig.apply(this, arguments);
        if (r && r.stats) setTimeout(() => { try { place(r); } catch (e) { console.warn('share', e); } plays.dive = 0; plays.jump = 0; }, 60);
        return out;
      };
      wrapped.__ipShare = true; ui.result = wrapped; return;
    }
    if (n < 400) setTimeout(() => hookResult(n + 1), 250);
  })(0);
  // 写真モード: 「この画面を保存」の横
  (function photo(n) {
    const save = document.getElementById('photoSave');
    if (save) {
      if (!document.getElementById('ipSharePhoto')) {
        save.insertAdjacentElement('afterend', mkBtn('ipSharePhoto', (b) => {
          const text = `${stadiumName()}で一枚📸 ここで守ってみる? ${SHARE_TAG} ${SHARE_URL}`; b.dataset.text = text;
          const cv = grabScene(); shareNow(text, cv ? canvasFile(cv, 'ballpark_photo.jpg') : null);
        }));
      }
      return;
    }
    if (n < 200) setTimeout(() => photo(n + 1), 300);
  })(0);
}
window.__ippomeShare = { shareTextFor, intentUrl, on: shareOn() };

// ------------------------------------------------ 11/28 作者のほかのゲーム(ブラウザ版だけ。アプリ版の make_www.py は web.js を入れないので出ない)
// 持ち主 11/28「とにかく頑張って宣伝」。一時停止の画面のいちばん下(「不具合・要望を送る」の下)に小さい1行。× で閉じたら、その端末では出さない。
// 行き先はビートぽん!のブラウザ版(その場で遊べる)。値段・「無料」の字は入れない。
(function xpromo() {
  const KEY = 'ippome_xpromo_closed_1128';
  try { if (localStorage.getItem(KEY)) return; } catch (e) { /* なし */ }
  const sheet = document.querySelector('#panel .sheet.pause');
  if (!sheet || document.getElementById('ipXpromo')) return;
  const css = document.createElement('style');
  css.textContent = '#ipXpromo{grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:6px;margin:10px 0 2px;font-size:12px;line-height:1.5;opacity:.85}'
    + '#ipXpromo a{color:inherit;text-decoration:underline;text-underline-offset:3px}'
    + '#ipXpromo button{all:unset;cursor:pointer;padding:2px 8px;font-size:14px;line-height:1;opacity:.7}';
  document.head.appendChild(css);
  const row = document.createElement('div');
  row.id = 'ipXpromo';
  row.innerHTML = '<span>作者のほかのゲーム: <a href="https://yurustudio.github.io/beatpon/play/?from=bokura_web" target="_blank" rel="noopener">リズムゲーム『ビートぽん!』</a></span>'
    + '<button type="button" aria-label="閉じる">×</button>';
  row.querySelector('button').addEventListener('click', () => { row.remove(); try { localStorage.setItem(KEY, '1'); } catch (e) { /* なし */ } });
  sheet.appendChild(row);
})();
