// 11/28 夜 一人称で見える自分のミット(持ち主「キャッチャーファーストですがミットになるようにしてください」)。
// グラブのスキャンを変形させるのはやめ、捕手用・一塁用の形を新しく作る(軽い形: 球・輪・筒・箱を組んだだけ。三角 約 1 万)。
// 座標はスキャンのグラブ(models/fp_glove.glb)と同じ「手首が原点・x 親指の側・y 指先・z 手のひらの向き(ポケットの口が +z)」。
// 球はポケットの中心(main.js の FPG.pocket = x −0.008・y 0.165・z 0.005)に置かれるので、そこがミットのくぼみの奥になるように作る。
//   捕手: 丸く厚いキャッチャーミット(丸い深い椀 + 太い詰め物の縁 + 縁を回る革ひも + 上の網の革ひも + 手首のバンド)。指の分かれ目は無い
//   一塁: 縦長のファーストミット(縦長の椀 + 縁 + 親指の部分が分かれていて、親指と本体の間を革ひもの網でつなぐ + 手首のバンド)
// 色は頂点の明るさ(革 1・縁 1.08・くぼみ 0.72・ひも 0.28・バンド 0.45)× 材質の色(着せ替えのグラブの色。初めは茶)。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const L = { leather: 1.0, pad: 1.08, pocket: 0.7, lace: 0.28, cuff: 0.45, palm: 0.85 };
function shade(g, v) {
  g = g.index ? g.toNonIndexed() : g;
  const n = g.attributes.position.count, col = new Float32Array(n * 3), p = g.attributes.position;
  for (let i = 0; i < n; i++) { const s = typeof v === 'function' ? v(p.getX(i), p.getY(i), p.getZ(i)) : v; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = s; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  return g;
}
// 口が +z の椀(半球の内側がくぼみ)。外は革、内は少し暗く(2 枚重ね: 外 = 革、内 = くぼみ)
function cup(sx, sy, sz, cx, cy, cz) {
  const outer = new THREE.SphereGeometry(1, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2); outer.rotateX(-Math.PI / 2); outer.scale(sx, sy, sz); outer.translate(cx, cy, cz);
  const inner = new THREE.SphereGeometry(1, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2); inner.rotateX(-Math.PI / 2); inner.scale(sx * 0.93, sy * 0.93, sz * 0.9); inner.translate(cx, cy, cz + 0.002);
  return [shade(outer, L.leather), shade(inner, (x, y) => { const r = Math.hypot((x - cx) / sx, (y - cy) / sy); return L.pocket + 0.18 * Math.min(1, r); })];
}
// 縁(輪)。tube は太さ(m)。lace: 縁を回る革ひもの数
function rim(rx, ry, tube, cx, cy, cz, lace, skipA) {
  const t = new THREE.TorusGeometry(1, 1, 14, 64); const P = t.attributes.position;
  // 太さを m で決めるため、輪の中心線を (rx, ry) の楕円に、管の太さを tube に置き直す
  const seg = 64, rad = 14; let k = 0;
  for (let j = 0; j <= rad; j++) for (let i = 0; i <= seg; i++) {
    const u = (i / seg) * Math.PI * 2, v = (j / rad) * Math.PI * 2;
    const ex = Math.cos(u) * rx, ey = Math.sin(u) * ry, nx = Math.cos(u) * ry, ny = Math.sin(u) * rx, nl = Math.hypot(nx, ny);
    P.setXYZ(k++, cx + ex + (nx / nl) * tube * Math.cos(v), cy + ey + (ny / nl) * tube * Math.cos(v), cz + tube * 1.15 * Math.sin(v));
  }
  t.computeVertexNormals();
  const parts = [shade(t, L.pad)];
  for (let i = 0; i < lace; i++) {   // 縁を巻く革ひも(縁の外を横切る短い帯)
    const u = (i / lace) * Math.PI * 2; if (skipA && skipA(u)) continue;
    const b = new THREE.TorusGeometry(tube * 1.08, tube * 0.2, 5, 12); b.rotateY(Math.PI / 2); b.rotateZ(u);
    b.translate(cx + Math.cos(u) * rx, cy + Math.sin(u) * ry, cz);
    parts.push(shade(b, L.lace));
  }
  return parts;
}
function bar(x0, y0, z0, x1, y1, z1, r, s) {
  const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), d = b.clone().sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, 8, 1); g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(x0, y0, z0);
  return shade(g, s ?? L.lace);
}
function cuff(cx, cy, cz, w, d) {
  const g = new THREE.CylinderGeometry(1, 1.05, 1, 24, 1, true); g.scale(w, 0.065, d); g.translate(cx, cy, cz);
  const strap = new THREE.BoxGeometry(w * 2.1, 0.022, d * 2.1); strap.translate(cx, cy + 0.005, cz);
  return [shade(g, L.cuff), shade(strap, L.cuff * 0.8)];
}
function backPad(sx, sy, cx, cy, cz) {   // 手の甲の側の詰め物(後ろから見えた時に丸い厚みが分かる)
  const g = new THREE.SphereGeometry(1, 28, 14); g.scale(sx, sy, 0.03); g.translate(cx, cy, cz);
  return shade(g, L.leather * 0.95);
}
export function buildMitt(kind) {
  const P = [];
  if (kind === 'c') {
    // キャッチャーミット: 丸い椀(幅 0.24・高さ 0.25 m・深さ 0.075)、太い縁、縁の革ひも 22、上の網(親指の側)の革ひも、手首
    const cx = -0.006, cy = 0.168, cz = 0.03;
    P.push(...cup(0.118, 0.124, 0.08, cx, cy, cz));
    P.push(backPad(0.122, 0.128, cx, cy, cz - 0.052));
    P.push(...rim(0.118, 0.124, 0.03, cx, cy, cz, 22, (u) => u > 0.15 && u < 1.25));
    // 上の親指の側の網(縁の切れ目を革ひもで編んだ所): 縁の 10〜70 度の間に斜めの帯
    for (let i = 0; i < 5; i++) { const u0 = 0.18 + i * 0.22, x = cx + Math.cos(u0) * 0.118, y = cy + Math.sin(u0) * 0.124; P.push(bar(x - 0.02, y - 0.02, cz + 0.01, x + 0.012, y + 0.012, cz + 0.03, 0.0055)); }
    // 手のひらの丸い当て革(くぼみの奥の目印)
    const pal = new THREE.CircleGeometry(0.05, 32); pal.translate(cx, cy - 0.01, cz - 0.074); P.push(shade(pal, L.palm * 0.8));
    P.push(...cuff(cx, 0.035, cz - 0.02, 0.05, 0.035));
  } else {
    // ファーストミット: 縦長の椀(幅 0.11・長さ 0.31 m)の本体と、本体の横に分かれて伸びる長い親指。間の隙間を革ひもの網でつなぐ
    const cx = -0.034, cy = 0.19, cz = 0.028, sx = 0.056, sy = 0.155, tb = 0.022;
    P.push(...cup(sx, sy, 0.068, cx, cy, cz));
    P.push(backPad(sx + 0.004, sy + 0.005, cx, cy, cz - 0.046));
    P.push(...rim(sx, sy, tb, cx, cy, cz, 24, (u) => u > -0.5 && u < 0.9));
    // 親指(本体の +x の側に分かれた長い袋。手首の近くで本体とつながる)
    const tx = 0.088, ty = 0.175;
    const th = new THREE.CapsuleGeometry(0.023, 0.16, 8, 18); th.scale(1, 1, 0.8); th.rotateZ(0.1); th.translate(tx, ty, cz - 0.002); P.push(shade(th, L.leather));
    // 親指の縁の革ひも(内側の縁に沿って)
    for (let i = 0; i < 7; i++) { const y = 0.12 + i * 0.026, x = tx - 0.022 - (y - ty) * 0.1; P.push(bar(x, y, cz + 0.012, x + 0.006, y + 0.012, cz + 0.018, 0.0035)); }
    // 根元(手首の側で本体と親指をつなぐ革)
    const root = new THREE.SphereGeometry(1, 20, 12); root.scale(0.06, 0.034, 0.032); root.translate(0.03, 0.07, cz - 0.012); P.push(shade(root, L.leather));
    // 網: 本体の右の縁と親指の内側の間、上の半分に横の革ひも 6 本と縦 2 本、奥に暗い当て革
    const x0 = cx + sx + tb * 0.5, x1 = tx - 0.018;
    const back = new THREE.PlaneGeometry(x1 - x0 + 0.01, 0.15); back.translate((x0 + x1) / 2, 0.255, cz - 0.004); P.push(shade(back, L.lace * 1.4));
    for (let i = 0; i < 6; i++) { const y = 0.19 + i * 0.024; P.push(bar(x0, y, cz + 0.008, x1, y + 0.004, cz + 0.008, 0.0048)); }
    P.push(bar(x0 + 0.007, 0.18, cz + 0.012, x0 + 0.009, 0.325, cz + 0.012, 0.0045));
    P.push(bar(x1 - 0.006, 0.18, cz + 0.012, x1 - 0.004, 0.32, cz + 0.012, 0.0045));
    const pal = new THREE.CircleGeometry(0.034, 32); pal.scale(1, 1.5, 1); pal.translate(cx, cy - 0.025, cz - 0.064); P.push(shade(pal, L.palm * 0.8));
    P.push(...cuff(0.0, 0.035, cz - 0.02, 0.055, 0.035));
  }
  for (const x of P) { const c = x.attributes.color, p = x.attributes.position; for (let i = 0; i < c.count; i++) { const n = 0.93 + 0.07 * Math.sin(p.getX(i) * 310 + p.getY(i) * 170) * Math.sin(p.getY(i) * 260 - p.getZ(i) * 120); c.setXYZ(i, c.getX(i) * n, c.getY(i) * n, c.getZ(i) * n); } }   // 革のむら
  const g = mergeGeometries(P.map((x) => { for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'color'].includes(k)) x.deleteAttribute(k); return x; }));
  for (const x of P) x.dispose();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, envMapIntensity: 0.8, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.name = 'fpMitt_' + kind;
  return mesh;
}
// 着せ替えのグラブの色(js/cosmetics.js。無ければ茶)
export function mittColor() {
  try { const C = window.__bpCos, e = C && C.eq(), c = e && C.get && C.get(e.gcolor); if (c && c.c != null) return c.c; } catch (er) { /* なし */ }
  return 0x8a5528;
}
