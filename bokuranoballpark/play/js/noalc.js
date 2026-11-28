// 11/28 持ち主「年齢制限指定これ無くしてほしい」(App Store 12+ → 4+): 模型に入っているお酒とたばこの物を、読み込んだ後に消す。
// 模型(blend・glb)は触らない(adfix.js・breakfix.js と同じやり方。当たり判定の GLB は通らないので歩ける所は変わらない)。
//   NOALC_HIDE: 材質の名前で当てて描かない(樽・注ぎ口・醸造のタンク・灰皿・喫煙所の絵の板)。名前は模型(GLB)の中の名前のまま
//   NOALC_PATCH(js/noalc_data.js、tools/noalc_1128_patchgen.py が作る): 絵(テクスチャ)の名前・大きさ・球場で当てて、絵の中の四角を
//     同じ絵の別の四角(字の無い地・別の札)で上書きする。写す元が無い四角は、四角のすぐ外のまわりの色(地の色)で塗る。
// ?alc=1 で消さない(前の見た目を見る時)。
import { NOALC_PATCH } from './noalc_data.js';
export { NOALC_PATCH };
// 樽(kb_keg・rc_keg・r17_keg_steel・r28_beer_keg)・ジョッキの中身(kb_beer)・注ぎ口(r12_shop_beertap)・醸造のタンク(kt_brew_tank)・灰皿(*ashtray*・*ash_top・*ash_foot)・
// 部屋の棚の色つきの瓶(room_bottle_*)。どれも色だけの材質で、その材質だけの部品(隠しても穴はあかない)。喫煙所の囲い(ガラス・枠・壁)は無地なので残す
export const NOALC_HIDE = /^(kb_keg|kb_beer|rc_keg|r17_keg_steel|r28_beer_keg|r12_shop_beertap|kt_brew_tank|r27_ashtray_steel|r22_ashtray_silver|r21_ashtray|r21_ash_top|r21_ash_foot|kt_r24_ash_top|room_bottle_(clear|green|amber))$/;
// 絵ごと別の絵に替える(同じ模型の中の絵): 浜風の店名板 5(ビール・ドリンク)→ 6、場内のポスター 0(禁煙)→ 1。店名板は歩く時に js/kanban.js が店名(ジュース・ドリンク)で描き直す
export const NOALC_COPY = [{ st: 'koshien', name: 'r12_shopname_5', from: 'r12_shopname_6' }, { st: 'koshien', name: 'r12_poster_0', from: 'r12_poster_1' }];

const done = new WeakSet();
// 試験のため(tools/noalc_1128_check.py): 直した絵の名前と canvas
const note = (name, c) => { if (typeof window === 'undefined') return; const s = window.__noalcStat || (window.__noalcStat = { hid: 0, patched: 0, names: [] }); s.names.push(name); (window.__noalcCanv || (window.__noalcCanv = [])).push({ name, c }); };
function ringColor(g, W, H, x0, y0, x1, y1) {
  const pad = 3, X0 = Math.max(0, x0 - pad), Y0 = Math.max(0, y0 - pad), X1 = Math.min(W, x1 + pad), Y1 = Math.min(H, y1 + pad);
  let d; try { d = g.getImageData(X0, Y0, X1 - X0, Y1 - Y0).data; } catch (e) { return '#808080'; }
  const w = X1 - X0, h = Y1 - Y0, rs = [], gs = [], bs = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ax = x + X0, ay = y + Y0; if (ax >= x0 && ax < x1 && ay >= y0 && ay < y1) continue;
    const i = (y * w + x) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]);
  }
  if (!rs.length) return '#808080';
  const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  return `rgb(${med(rs)},${med(gs)},${med(bs)})`;
}
function patchTexture(tex, rects) {
  const im = tex.image, W = im.width || im.naturalWidth, H = im.height || im.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
  try { g.drawImage(im, 0, 0, W, H); } catch (e) { return false; }
  const src = document.createElement('canvas'); src.width = W; src.height = H; src.getContext('2d').drawImage(c, 0, 0);   // 写す元は塗る前の絵から
  for (const r of rects) {
    const x0 = Math.round(r[0] * W), y0 = Math.round(r[1] * H), x1 = Math.round(r[2] * W), y1 = Math.round(r[3] * H), w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) continue;
    const f = r[4];
    if (f) g.drawImage(src, Math.round(f[0] * W), Math.round(f[1] * H), Math.max(1, Math.round((f[2] - f[0]) * W)), Math.max(1, Math.round((f[3] - f[1]) * H)), x0, y0, w, h);
    else { g.fillStyle = ringColor(g, W, H, x0, y0, x1, y1); g.fillRect(x0, y0, w, h); }
  }
  tex.image = c; tex.needsUpdate = true; return true;
}
export function noAlc(root, THREE, stadium) {
  if (typeof document === 'undefined') return { hid: 0, patched: 0 };
  const texs = new Set(); let hid = 0, patched = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m) continue;
      if (m.visible && NOALC_HIDE.test(m.name || '')) { m.visible = false; hid++; }
      for (const t of [m.map, m.emissiveMap]) if (t) texs.add(t);
    }
  });
  const byName = new Map(); for (const t of texs) if (t.name) byName.set(t.name, t);
  for (const q of NOALC_COPY) {
    if (q.st !== stadium) continue; const t = byName.get(q.name), f = byName.get(q.from); if (!t || !f || done.has(t) || !t.image || !f.image) continue;
    const W = t.image.width || t.image.naturalWidth, H = t.image.height || t.image.naturalHeight, c = document.createElement('canvas'); c.width = W; c.height = H;
    try { c.getContext('2d').drawImage(f.image, 0, 0, W, H); } catch (e) { continue; }
    t.image = c; t.needsUpdate = true; done.add(t); patched++; note(q.name + ' <- ' + q.from, c);
  }
  const mine = NOALC_PATCH.filter((p) => p.st === stadium);
  for (const t of texs) {
    if (done.has(t) || !t.image) continue;
    const W = t.image.width || t.image.naturalWidth, H = t.image.height || t.image.naturalHeight;
    const p = mine.find((q) => q.name === (t.name || '') && q.size[0] === W && q.size[1] === H);
    if (!p) continue;
    if (patchTexture(t, p.rects)) { done.add(t); patched++; note(p.name + ' ' + W + 'x' + H, t.image); }
  }
  if (typeof window !== 'undefined') { const s = window.__noalcStat || (window.__noalcStat = { hid: 0, patched: 0, names: [] }); s.hid += hid; s.patched += patched; }
  return { hid, patched };
}
if (typeof window !== 'undefined') window.__noalc = { HIDE: NOALC_HIDE, PATCH: NOALC_PATCH, COPY: NOALC_COPY };
