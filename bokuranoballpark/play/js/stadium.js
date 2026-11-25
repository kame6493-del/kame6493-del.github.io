// 投手のリグ(pitcher.js)が使う球場の寸法だけを置く小さな差し替え。
// 元の「打者一人称野球」では stadium.js が球場の絵も作っていたが、ここでは R4 のモデルを使うので寸法だけ。
export const RUBBER_FRONT_Z = -18.44;
export const MOUND_TOP = 0.254;
export const MOUND_CENTER_Z = RUBBER_FRONT_Z + 0.457;
export const MOUND_R = 2.74;
export const CAM_Z = 1.9;

// マウンドの高さ (投手板の前から本塁へ 1/12 の下り)
export function groundHeight(x, z) {
  const dx = x, dz = z - MOUND_CENTER_Z;
  const r = Math.hypot(dx, dz);
  if (r >= MOUND_R) return 0;
  const u = z - RUBBER_FRONT_Z;
  const plane = MOUND_TOP - Math.max(0, u - 0.15) / 12;
  const e = Math.min(1, Math.max(0, (MOUND_R - r) / (MOUND_R - 1.35)));
  const edge = MOUND_TOP * (e * e * (3 - 2 * e));
  return Math.max(0, Math.min(plane, edge));
}

// 帽子のマーク(鳥)は描かない(ロゴを出さない方針)
export function drawBird() {}
