// 看板(字の入った絵)の向きの直し。11/18 持ち主「広告ですが、反転して読めなくなっているもの、各球場にとても多いので修正してください」
// 模型(blend・glb)は触らず、読み込んだ後にここで直す(9 球場とも同じ関数。当たり判定の collision.glb は通さないので影響しない)。
//
// 向きの決まり(glTF は UV の v = 0 が絵の上、three の GLTFLoader は flipY = false):
//   三角形の表の向き N(巻きの向き)・u が増える向き T・v が増える向き B を世界の向きで出すと、
//   表から見て字が正しく読める時は (N×T)·B < 0(T = 右、B = 下、N = こちら)。> 0 なら左右反転(鏡文字)。
//   縦の看板で B が上を向いていれば上下逆。
// 直し方:
//   ・鏡文字の面は、その面の島(頂点を共有してつながった三角形の組)の中で u を左右に折り返す。上下逆は v も折り返す。
//   ・両面(DoubleSide)の字の板は、裏から見ると必ず鏡文字になる。材質を片面にして、裏向きの写し(巻きを逆・u を折り返し)を足す。
//     これで表からも裏からも正しく読める(裏に壁がある板は、写しが壁の中を向くので見えない)。写しは同じジオメトリの後ろに足す(描く回数は増えない)。
export const TEXT_MAT = /^(r7_ad_|r7_aisle_|r9_round_|r7_gate_|r7_sign_|r7_scoreboard_face|r8_menu_|r8_shop_board_|r8_colnum|r11_notice_|r12_shop_name_|r12_shop_menu_|r12_shop_noren_|r12_conc_poster_|r12_conc_plate_|r12_conc_vending_|r12_dug_board|r12_dug_clock|r11_whiteboard|r11_interview_backdrop|r11_tv_screen|sign_|gate_plates|gate_number|conc_signs|screen_|ribbon_|scoreboard_screen|concourse_signs|conc_signs|dt_(?:menus|names|guide|plates|screens|menuboards|columnplates|passagenumbers|signs?|notice|poster)|kd_(?:plates|guide|menus|names|screens|signs?)|kb_kb_(?:menuboards|signboards_(?:drinks|queue)|shopsigns_names)|kt_tex_r21)/;   // kt_tex_r21: 11/19 作り込みE の誘導灯・柱の番号・名前の板(汽笛ヶ原 R21・白樺 R19・森かげ R9)   // kd_・kb_kb_: 11/19 舟灯の作り込みの看板   // dt_*: 11/19 作り込みの看板(メニュー・店の名前・案内・柱の番号)。字があるのに入っていなかった(tools/pricecheck.py で見つけた)
const SKIP_MAT = /^(sign_field_paint)/;   // 地面に描いた字は上から見る物で、向きの決まりが別(点検の表には出す)

const isText = (m) => !!(m && m.map && TEXT_MAT.test(m.name || ''));

// 三角形ごとの向きの点検。返す: [{ mesh, mat, tri, c:[x,y,z], n:[..], area, mirror, upside, flat }]
export function triInfo(o, m, groupFilter) {
  const g = o.geometry, P = g.attributes.position, UV = g.attributes.uv, I = g.index;
  if (!P || !UV) return [];
  o.updateMatrixWorld(true);
  const M = o.matrixWorld, det = M.determinant() < 0 ? -1 : 1;
  const flipV = m.map && m.map.flipY ? -1 : 1;   // flipY の絵は v が上向き
  const res = [];
  const n = I ? I.count : P.count;
  const idx = (k) => (I ? I.getX(k) : k);
  const p = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], e = M.elements;
  const wp = (i, out) => { const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    out[0] = e[0] * x + e[4] * y + e[8] * z + e[12]; out[1] = e[1] * x + e[5] * y + e[9] * z + e[13]; out[2] = e[2] * x + e[6] * y + e[10] * z + e[14]; };
  for (let k = 0; k + 2 < n; k += 3) {
    if (groupFilter && !groupFilter(k)) continue;
    const a = idx(k), b = idx(k + 1), c = idx(k + 2);
    wp(a, p[0]); wp(b, p[1]); wp(c, p[2]);
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    let N = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const len = Math.hypot(...N); if (len < 1e-9) continue;
    N = N.map((v) => (v / len) * det);
    const du1 = UV.getX(b) - UV.getX(a), dv1 = UV.getY(b) - UV.getY(a), du2 = UV.getX(c) - UV.getX(a), dv2 = UV.getY(c) - UV.getY(a);
    const d = du1 * dv2 - du2 * dv1; if (Math.abs(d) < 1e-12) continue;
    const T = [0, 1, 2].map((i) => (e1[i] * dv2 - e2[i] * dv1) / d);
    const B = [0, 1, 2].map((i) => ((e2[i] * du1 - e1[i] * du2) / d) * flipV);
    const NxT = [N[1] * T[2] - N[2] * T[1], N[2] * T[0] - N[0] * T[2], N[0] * T[1] - N[1] * T[0]];
    const s = NxT[0] * B[0] + NxT[1] * B[1] + NxT[2] * B[2];
    const bl = Math.hypot(...B) || 1;
    const flat = Math.abs(N[1]) > 0.7;   // 床・天井に寝ている面(上下の決まりは見ない)
    res.push({ mesh: o, mat: m, tri: k / 3, ia: a, ib: b, ic: c,
      c: [0, 1, 2].map((i) => (p[0][i] + p[1][i] + p[2][i]) / 3), n: N, area: len / 2,
      mirror: s > 0, upside: !flat && B[1] / bl > 0.3 });
  }
  return res;
}

// 看板の材質を持つメッシュと、その材質の三角形の範囲
export function textMeshes(root) {
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.geometry) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    if (Array.isArray(o.material)) {
      for (const gr of o.geometry.groups) { const m = ms[gr.materialIndex]; if (isText(m)) out.push({ o, m, from: gr.start, to: gr.start + gr.count }); }
    } else if (isText(o.material)) out.push({ o, m: o.material, from: 0, to: Infinity });
  });
  return out;
}

// 島ごとに束ねる。頂点の番号を共有するか、同じ位置で UV も同じ頂点(帯を別々の四角で作り、絵が続いている物)でつながる三角形の組。
// 帯が鏡文字の時は、帯全体の u の範囲で折り返さないと、四角ごとの絵の順番が逆になる。絵が続いていない四角(別の広告)は別の島。
function islands(tris, g) {
  const P = g && g.attributes.position, UV = g && g.attributes.uv, NA = g && g.attributes.normal;
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const add = (x) => { if (!parent.has(x)) parent.set(x, x); };
  const uni = (x, y) => { x = find(x); y = find(y); if (x !== y) parent.set(x, y); };
  const byKey = new Map();
  const key = (i) => `${Math.round(P.getX(i) * 500)},${Math.round(P.getY(i) * 500)},${Math.round(P.getZ(i) * 500)},${Math.round(UV.getX(i) * 2000)},${Math.round(UV.getY(i) * 2000)}` + (NA ? `,${Math.round(NA.getX(i) * 4)},${Math.round(NA.getY(i) * 4)},${Math.round(NA.getZ(i) * 4)}` : '');
  for (const t of tris) {
    add(t.ia); add(t.ib); add(t.ic); uni(t.ia, t.ib); uni(t.ia, t.ic);
    if (P && UV) for (const i of [t.ia, t.ib, t.ic]) { const k = key(i); const j = byKey.get(k); if (j === undefined) byKey.set(k, i); else uni(i, j); }
  }
  const gr = new Map();
  for (const t of tris) { const r = find(t.ia); if (!gr.has(r)) gr.set(r, []); gr.get(r).push(t); }
  return [...gr.values()];
}

// 点検: 看板の島ごとの向き。直す前・直した後の両方で使う
export function analyze(root) {
  const panels = [];
  for (const { o, m, from, to } of textMeshes(root)) {
    const tris = triInfo(o, m, (k) => k >= from && k < to);
    for (const isl of islands(tris, o.geometry)) {
      let A = 0, Am = 0, Au = 0; const c = [0, 0, 0], n = [0, 0, 0];
      for (const t of isl) { A += t.area; if (t.mirror) Am += t.area; if (t.upside) Au += t.area; for (let i = 0; i < 3; i++) { c[i] += t.c[i] * t.area; n[i] += t.n[i] * t.area; } }
      if (A <= 0) continue;
      const nl = Math.hypot(...n) || 1;
      panels.push({ mesh: o.name, mat: m.name, side: m.side, tris: isl.length, area: A, c: c.map((v) => v / A), n: n.map((v) => v / nl),
        mirror: Am / A > 0.5, upside: Au / A > 0.5, mixed: Am / A > 0.05 && Am / A < 0.95, _tris: isl, _o: o, _m: m });
    }
  }
  return panels;
}

// 見る位置から、看板の島が見えるか・表と裏のどちらが見えるか(光線で塞がりを調べる)。
// occ: [{ o, bvh }](塞ぐ物)。eyes: [[x,y,z], ...]。結果は panel.seen = { front: [目の番号], back: [...] }
export function visibility(panels, occ, eyes, THREE) {
  const ray = new THREE.Ray(), inv = new THREE.Matrix4(), lr = new THREE.Ray();
  const sph = new THREE.Sphere();
  for (const p of panels) {
    p.seen = { front: [], back: [] };
    // 島の中の点(真ん中に一番近い三角形の重心)を、表と裏に少し浮かせて狙う
    let best = p._tris[0], bd = Infinity;
    for (const t of p._tris) { const d = Math.hypot(t.c[0] - p.c[0], t.c[1] - p.c[1], t.c[2] - p.c[2]); if (d < bd) { bd = d; best = t; } }
    const tc = best.c, tn = best.n;
    eyes.forEach((E, ei) => {
      const dv = [E[0] - tc[0], E[1] - tc[1], E[2] - tc[2]]; const dist = Math.hypot(...dv); if (dist < 0.3 || dist > 260) return;
      const facing = dv[0] * tn[0] + dv[1] * tn[1] + dv[2] * tn[2];
      if (Math.abs(facing) / dist < 0.08) return;   // 真横から(ほぼ見えない)
      const fs = facing > 0 ? 1 : -1;
      const tgt = new THREE.Vector3(tc[0] + tn[0] * 0.03 * fs, tc[1] + tn[1] * 0.03 * fs, tc[2] + tn[2] * 0.03 * fs);
      const from = new THREE.Vector3(...E);
      ray.origin.copy(from); ray.direction.copy(tgt).sub(from); const L = ray.direction.length(); ray.direction.normalize();
      let blocked = false;
      for (const q of occ) {
        if (q.o === p._o) continue;
        sph.copy(q.sphere); if (!ray.intersectsSphere(sph)) continue;
        inv.copy(q.o.matrixWorld).invert(); lr.copy(ray).applyMatrix4(inv);
        const h = q.bvh.raycastFirst(lr, THREE.DoubleSide);
        if (h) { h.point.applyMatrix4(q.o.matrixWorld); if (h.point.distanceTo(from) < L - 0.05) { blocked = true; break; } }
      }
      if (blocked) return;
      // 片面の材質で裏から見る時は描かれない(見えない)
      if (fs < 0 && p.side === THREE.FrontSide) return;
      (fs > 0 ? p.seen.front : p.seen.back).push(ei);
    });
  }
}

// 頂点を後ろに足す。add: [[元の頂点, (属性の名前, 成分, 値) => 新しい値], ...]
function appendVerts(g, add, THREE) {
  const nV = g.attributes.position.count;
  for (const name of Object.keys(g.attributes)) {
    const A = g.attributes[name], sz = A.itemSize, arr = new Float32Array((nV + add.length) * sz);
    for (let i = 0; i < nV; i++) for (let c = 0; c < sz; c++) arr[i * sz + c] = A.getComponent(i, c);
    for (let j = 0; j < add.length; j++) { const [src, fn] = add[j]; for (let c = 0; c < sz; c++) arr[(nV + j) * sz + c] = fn(name, c, A.getComponent(src, c)); }
    g.setAttribute(name, new THREE.BufferAttribute(arr, sz));
  }
}

// 直す。root ごとに 1 回。戻り値は直した数
export function fixAds(root, THREE) {
  const stat = { mirror: 0, upside: 0, backCopies: 0, panels: 0 };
  if (!root || root.userData.adFixed) return stat;
  root.userData.adFixed = true;
  const list = textMeshes(root).filter((x) => !SKIP_MAT.test(x.m.name || ''));
  const done = new Set();
  const byMesh = new Map();
  for (const x of list) { if (!byMesh.has(x.o)) byMesh.set(x.o, []); byMesh.get(x.o).push(x); }
  for (const [o, parts] of byMesh) {
    // 同じジオメトリを別の物と共有していれば、この物だけの写しにする
    if (done.has(o.geometry)) o.geometry = o.geometry.clone();
    done.add(o.geometry);
    const g = o.geometry;
    let changed = false;
    const backTris = [];   // 両面の材質の三角形(裏向きの写しを作る)
    for (const { m, from, to } of parts) {
      let tris = triInfo(o, m, (k) => k >= from && k < to);
      // 帯の継ぎ目: 帯の中で 1 枚だけ u が 0.04→0.98 のように絵の端から端へ飛ぶ四角(絵全体が細く逆向きに詰まって見える)。
      // 島の多数と向きが逆で u の幅が 0.5 を超える三角形は、u の小さい角を +1 した別の頂点にして、隣と続くようにする(絵は繰り返しの設定)
      if (m.map && m.map.wrapS === THREE.RepeatWrapping && g.index) {
        const fixT = [];
        const UV0 = g.attributes.uv;
        for (const isl of islands(tris, g)) {
          if (isl.length < 4) continue;
          let A = 0, Am = 0; for (const t of isl) { A += t.area; if (t.mirror) Am += t.area; }
          const maj = Am / A > 0.5;
          for (const t of isl) { if (t.mirror === maj) continue; const us = [t.ia, t.ib, t.ic].map((i) => UV0.getX(i)); if (Math.max(...us) - Math.min(...us) > 0.5) fixT.push(t); }
        }
        if (fixT.length) {
          if (!g.userData.adOrigGeo) g.userData.adOrigGeo = g.clone();
          const I = g.index, nV = g.attributes.position.count, map = new Map(), add = [];
          for (const t of fixT) for (let c = 0; c < 3; c++) {
            const k = t.tri * 3 + c, i = I.getX(k);
            if (UV0.getX(i) >= 0.5) continue;
            if (!map.has(i)) { map.set(i, nV + add.length); add.push([i, (name, ci, v) => (name === 'uv' && ci === 0 ? v + 1 : v)]); }
            I.setX(k, map.get(i));
          }
          appendVerts(g, add, THREE); I.needsUpdate = true;
          stat.seams = (stat.seams || 0) + fixT.length;
          tris = triInfo(o, m, (k) => k >= from && k < to);
        }
      }
      const UV = g.attributes.uv;
      for (const isl of islands(tris, g)) {
        stat.panels++;
        let A = 0, Am = 0, Au = 0;
        for (const t of isl) { A += t.area; if (t.mirror) Am += t.area; if (t.upside) Au += t.area; }
        const flipU = Am / A > 0.5, upside = Au / A > 0.5;
        // 鏡文字 + 上が下 = v だけ逆。鏡文字だけ = u だけ逆。鏡でなく上が下 = 180 度回っている(u も v も逆)
        const fu = (flipU && !upside) || (!flipU && upside), fv = upside;
        if (fu || fv) {
          const vs = new Set(); for (const t of isl) { vs.add(t.ia); vs.add(t.ib); vs.add(t.ic); }
          let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
          for (const i of vs) { const u = UV.getX(i), v = UV.getY(i); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
          for (const i of vs) { if (fu) UV.setX(i, u0 + u1 - UV.getX(i)); if (fv) UV.setY(i, v0 + v1 - UV.getY(i)); }
          changed = true;
          if (flipU) stat.mirror++; if (upside) stat.upside++;
        }
        if (m.side === THREE.DoubleSide || m.userData.adWasDouble) for (const t of isl) backTris.push({ t, m });
      }
    }
    const UV = g.attributes.uv;
    if (changed) UV.needsUpdate = true;
    if (backTris.length) {
      // 両面の字の板: 材質を片面にし、裏向きの写し(巻きを逆・法線を逆・u を島の中で折り返し)を同じジオメトリの後ろに足す
      // (別の物にすると描く回数が看板の数だけ増えるので、同じ物の中に入れる)。当たり判定に使う時は元の形(userData.adOrigGeo)を使う
      if (!g.userData.adOrigGeo) g.userData.adOrigGeo = g.clone();
      const nV = g.attributes.position.count, add = [], byMat = new Map();
      for (const { t, m } of backTris) { if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(t); }
      const triByMat = new Map();
      for (const [m, ts] of byMat) {
        const tri = [];
        for (const isl of islands(ts, g)) {
          let u0 = Infinity, u1 = -Infinity;
          for (const t of isl) for (const i of [t.ia, t.ib, t.ic]) { const u = UV.getX(i); u0 = Math.min(u0, u); u1 = Math.max(u1, u); }
          const map = new Map();
          for (const t of isl) for (const i of [t.ia, t.ic, t.ib]) { if (!map.has(i)) { map.set(i, nV + add.length); add.push([i, u0 + u1]); } tri.push(map.get(i)); }
        }
        triByMat.set(m, tri);
        stat.backCopies += tri.length / 3;
      }
      appendVerts(g, add.map(([src, us]) => [src, (name, c, v) => (name === 'normal' || (name === 'tangent' && c < 3) ? -v : name === 'uv' && c === 0 ? us - v : v)]), THREE);
      const I = g.index, oldN = I ? I.count : nV;
      let extra = 0; for (const t of triByMat.values()) extra += t.length;
      const ni = new Uint32Array(oldN + extra);
      for (let i = 0; i < oldN; i++) ni[i] = I ? I.getX(i) : i;
      let k = oldN;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const [m, tri] of triByMat) {
        if (g.groups.length) g.addGroup(k, tri.length, Math.max(0, mats.indexOf(m)));
        ni.set(tri, k); k += tri.length;
      }
      g.setIndex(new THREE.BufferAttribute(ni, 1));
      for (const m of byMat.keys()) { m.userData.adWasDouble = true; m.side = THREE.FrontSide; m.needsUpdate = true; }
    }
  }
  return stat;
}
