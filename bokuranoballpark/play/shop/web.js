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
