// 11/27 持ち主「レビューお願いしますみたいなのをゲーム内で出したい」
// iOS・Android のアプリだけ、OS 標準のレビューの窓(iOS SKStoreReviewController / Android Play In-App Review)を、
// 気持ちよく終わった直後(キャリアの昇格・キャリア完了・ファインプレーのあった勝ち試合の結果)にだけ頼む。ブラウザ版では何もしない。
// Apple 5.6.1: 自前の「楽しんでますか?」の前置きは作らない(満足した人だけを選んで送る作りは禁止)。星やレビューと引き換えに何も渡さない。
// OS の側でも出す回数は絞られる(iOS は 1 年 3 回まで・Android は割り当て)。こちらでも 1 回頼んだら 60 日あけ、1 年 3 回まで、起動 3 回目以降・遊んで 1 回目の頼みは出さない。
// 殻の部品: @capacitor-community/in-app-review(InAppReview.requestReview)。@capawesome/capacitor-app-review(AppReview.requestReview)でも動く。無ければ何もしない。
// あわせて、一時停止の画面の「不具合・要望を送る」(index.html の #supportLink)を外のブラウザで開く。
const KEY = 'r4walk.reviewAsk.v1';
const GAP_DAYS = 60, MAX_YEAR = 3, MIN_LAUNCH = 3, DELAY_MS = 1600;
export const SUPPORT_URL = 'https://yurustudio.github.io/support/';
const cap = () => window.Capacitor;
const isNative = () => { try { const C = cap(); return !!(C && (C.isNativePlatform ? C.isNativePlatform() : C.getPlatform && C.getPlatform() !== 'web')); } catch (e) { return false; } };
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || { launches: 0, asks: [] }; } catch (e) { return { launches: 0, asks: [] }; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* なし */ } };
function plugin() {
  const P = (cap() && cap().Plugins) || {};
  if (P.InAppReview && P.InAppReview.requestReview) return P.InAppReview;
  if (P.AppReview && P.AppReview.requestReview) return P.AppReview;
  return null;
}
// 起動の回数(アプリの時だけ数える)
{ const s = load(); if (isNative()) { s.launches = (s.launches || 0) + 1; save(s); } }

const now = () => Date.now();
export function canAsk(t = now()) {
  if (!isNative() || !plugin()) return false;
  const s = load(), year = (s.asks || []).filter((x) => t - x < 365 * 864e5);
  if ((s.launches || 0) < MIN_LAUNCH) return false;
  if (year.length >= MAX_YEAR) return false;
  if (year.length && t - Math.max(...year) < GAP_DAYS * 864e5) return false;
  return true;
}
let pending = null;
// why: 'promote' | 'careerDone' | 'finewin'。結果の画面が出てから少し待って頼む。守備の最中(結果の画面が閉じている)なら出さない
export function maybeAsk(why) {
  window.__bpReviewLast = { why, can: canAsk(), t: now() };
  if (!canAsk() || pending) return false;
  pending = setTimeout(async () => {
    pending = null;
    const onResult = ['result', 'carRes'].some((id) => { const e = document.getElementById(id); return e && !e.classList.contains('hide'); });
    if (!onResult || !canAsk()) return;
    const s = load(); s.asks = [...(s.asks || []).filter((x) => now() - x < 365 * 864e5), now()]; s.lastWhy = why; save(s);
    try { await plugin().requestReview(); window.__bpReviewAsked = why; } catch (e) { console.warn('review', e); }
  }, DELAY_MS);
  return true;
}

// ---------------------------------------------------------------- きっかけ(ファイルは触らず、結果を出す関数を外から包む)
function hookCareer() {
  const C = window.__career; if (!C || !C.ui || C.ui.__rvHooked) return !!(C && C.ui && C.ui.__rvHooked);
  const or = C.ui.result.bind(C.ui);
  C.ui.result = function (r) { const x = or(r); try { if (r && r.done) maybeAsk('careerDone'); else if (r && r.promoted) maybeAsk('promote'); } catch (e) { /* なし */ } return x; };
  C.ui.__rvHooked = true; return true;
}
function hookGame() {
  const a = window.__app, ui = a && a.ui; if (!ui || ui.__rvHooked) return !!(ui && ui.__rvHooked);
  const or = ui.result.bind(ui);
  ui.result = function (r) {
    const x = or(r);
    try { const g = r && r.g, fine = r && r.stats && r.stats.ev && r.stats.ev.fine; if (r && r.kind === 'game' && !r.stopped && g && g.score && g.score.us > g.score.them && fine > 0) maybeAsk('finewin'); } catch (e) { /* なし */ }
    return x;
  };
  ui.__rvHooked = true; return true;
}
{ let n = 0; const t = setInterval(() => { const a = hookCareer(), b = hookGame(); if ((a && b) || ++n > 240) clearInterval(t); }, 500); }

// ---------------------------------------------------------------- 不具合・要望を送る
export function openSupport() {
  try { const B = cap() && cap().Plugins && cap().Plugins.Browser; if (isNative() && B && B.open) { B.open({ url: SUPPORT_URL }); return 'browser'; } } catch (e) { /* 下へ */ }
  const w = window.open(SUPPORT_URL, '_blank', 'noopener'); if (!w && isNative()) location.href = SUPPORT_URL;
  return 'open';
}
{ const l = document.getElementById('supportLink'); if (l) l.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openSupport(); }); }

window.__bpReview = { maybeAsk, canAsk, openSupport, KEY, SUPPORT_URL, _reset: () => localStorage.removeItem(KEY) };
