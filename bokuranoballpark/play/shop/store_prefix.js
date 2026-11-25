// ブラウザ版だけに入る(make_web.py が index.html のいちばん初めに差し込む)。ゲーム本体のコードは変えない。
// 端末に残す物(localStorage・sessionStorage・IndexedDB)の名前の頭に "bokuraweb." を付けて、アプリ版や同じサイトのほかのゲームの物とぶつからないようにする。
(function () {
  var P = 'bokuraweb.';
  try {
    var S = Storage.prototype, g = S.getItem, s = S.setItem, r = S.removeItem;
    var k = function (x) { x = String(x); return x.indexOf(P) === 0 ? x : P + x; };
    S.getItem = function (x) { return g.call(this, k(x)); };
    S.setItem = function (x, v) { return s.call(this, k(x), v); };
    S.removeItem = function (x) { return r.call(this, k(x)); };
  } catch (e) { /* なし */ }
  try {
    var F = IDBFactory.prototype, o = F.open, d = F.deleteDatabase;
    F.open = function (n) { var a = [].slice.call(arguments); a[0] = P + n; return o.apply(this, a); };
    F.deleteDatabase = function (n) { return d.call(this, P + n); };
  } catch (e) { /* なし */ }
})();
