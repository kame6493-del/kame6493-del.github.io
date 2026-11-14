'use strict';
// ブラウザ版だけの「アプリ版で遊ぶ」の案内(2026-11-14 持ち主の指示)。
// - アプリ版(Android・iOS)の www には入れない: scripts/copy_www.py がこの file と index.html の欄を外す。念のためアプリの中なら何もしない
// - 端末に合わせる: iPhone/iPad は App Store、Android は Google Play、PC は両方。押すと新しいタブで開く
// - 出すのはタイトルの控えめな帯と結果の画面の1行だけ(描く画面・レース中は画面ごと隠れているので出ない)
// - × で閉じたら、その日はこの端末で出さない(localStorage)。完全版の案内(fullWebBox)のボタンは閉じても残す
(function () {
  const C = window.Capacitor;
  try { if (C && C.isNativePlatform && C.isNativePlatform()) return; } catch (e) { }
  if (document.documentElement.classList.contains('in-app')) return;

  const KEY = 'rakugaki_undoukai_v1_apppromo_hide';
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const android = !ios && /Android/i.test(ua);
  const want = ios ? ['ios'] : android ? ['android'] : ['ios', 'android'];

  function today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function hiddenToday() { try { return localStorage.getItem(KEY) === today(); } catch (e) { return false; } }
  function hideToday() { try { localStorage.setItem(KEY, today()); } catch (e) { } }

  for (const a of document.querySelectorAll('[data-store]')) {
    if (!want.includes(a.dataset.store)) a.remove();
  }
  const boxes = ['appPromo', 'appPromoRes'].map(id => document.getElementById(id)).filter(Boolean);
  function render() { const off = hiddenToday(); for (const b of boxes) b.classList.toggle('hidden', off); }
  for (const b of boxes) {
    const x = b.querySelector('.apClose');
    if (x) x.addEventListener('click', () => { hideToday(); render(); });
  }
  render();
  window.AppPromo = { platform: ios ? 'ios' : android ? 'android' : 'pc', render };
})();
