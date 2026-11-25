// アプリ版だけに入る(tools/make_www.py が index.html の main.js より前に差し込む)。ゲーム本体(site)のコードは変えない。
// 起動の前に、まだ開いていない球場が選ばれていたら(前の選択・URL)、浜風の球場に戻す。
// 開いているかは localStorage の ippome.owned({ <球場の id>: true, all: true })。ストアの答えは shop.js が後から書き直す。
// 全部パック(all)を持っていれば、後から足した球場も含めてすべて開く(11/18 持ち主の決め)。
// 球場を選ぶ画面(site の js/stadium_picker.js・ui.js の decideStadium)は window.__ippomeOpen(id) で鍵を見て、
// 開いていなければ window.__ippomeShop.openSheet(id) を呼ぶ。ここではその __ippomeOpen を用意する。
(function () {
  var C = window.IPPOME_APP || { mode: 'koshien_only' };
  var owned = {};
  try { owned = JSON.parse(localStorage.getItem('ippome.owned') || '{}') || {}; } catch (e) { owned = {}; }
  window.__ippomeOwned = owned;   // shop.js がストアの答えで書き直す(同じ物を見る)
  var ok = function (k) {
    if (!k || k === 'koshien') return true;
    if (C.mode !== 'shop') return false;
    var o = window.__ippomeOwned || {};
    return !!(o.all || o[k]);
  };
  window.__ippomeOpen = ok;
  try {
    var u = new URL(location.href), q = u.searchParams.get('stadium');
    if (q && !ok(q)) { u.searchParams.delete('stadium'); history.replaceState(null, '', u.toString()); }
    var s = JSON.parse(localStorage.getItem('r4walk.sel') || '{}');
    if (s && s.stadium && !ok(s.stadium)) { s.stadium = 'koshien'; localStorage.setItem('r4walk.sel', JSON.stringify(s)); }
  } catch (e) { /* なし */ }
})();
