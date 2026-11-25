// 11/25 軽く(持ち主「機能を入れてるのでアプリが重くなってきている」): 描かない人(visible = false)の行列を、毎こまの計算で飛ばす。
// スタンドで捕る・ボールパークで過ごすでは、隠れている人(遠くの簡単な形・骨入りの体・歩く人の控え)が 4,000 を超え、
// renderer が毎こま呼ぶ scene.updateMatrixWorld() の行列の計算が、スマホ相当で CPU の 3 割を使っていた。
// - 印を付けた物(skipHidden(o))だけを飛ばす。飛ばした時は matrixWorldNeedsUpdate を立てるので、見えるようになったこまで計算し直す。
// - 飛ばすのは renderer の毎こまの計算の中だけ。自分で呼ぶ o.updateMatrixWorld(true)・getWorldPosition は今までどおり計算する。
// - ?nohidskip=1 で前の形(全部計算する)
const S = { on: false, off: typeof location !== 'undefined' && /[?&]nohidskip=/.test(location.search) };
export function hookScene(scene) {
  if (S.off || !scene || scene.userData.hidSkip) return;
  scene.userData.hidSkip = true;
  const f = scene.updateMatrixWorld;
  scene.updateMatrixWorld = function (force) {
    if (force) return f.call(this, force);
    S.on = true;
    try { f.call(this, force); } finally { S.on = false; }
  };
}
export function skipHidden(o) {
  if (S.off || !o || o.userData.hidSkip) return o;
  o.userData.hidSkip = true;
  const f = o.updateMatrixWorld;
  o.updateMatrixWorld = function (force) {
    if (S.on && !this.visible) { this.matrixWorldNeedsUpdate = true; return; }
    f.call(this, force);
  };
  return o;
}
