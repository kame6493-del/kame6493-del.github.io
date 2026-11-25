// 11/21 共通: 浜風(甲子園)のコンコースにあって、ほかの球場に足りない細かい物を、ゲームの側で置く(模型は変えない)。
//  ・トイレの入口の横に 自動販売機 2 台 と ごみの分別の台(燃える・プラ・缶びん・ペットの 4 つの口と、後ろの案内の板)
//  ・トイレの前に 吊り下げの案内(トイレのピクトと矢印。字は一般の言葉だけ)。天井の無い所は柱に付けた案内
//  ・入場ゲートの内側に ごみの分別の台 と 吊り下げの「出口」
//  ・通路口(passages の vom)の階段の両わきの壁に 手すり(1 m ごとの受け金具)
// 位置の決め方: 本物の写真(docs\コンコースの点検_1121.md の URL)では、自販機とごみ箱はトイレの並びとゲートの内側に寄り、
// 案内は通路の上に吊る。形は全部の球場で 1 種類ずつの InstancedMesh にまとめる(描く回数は 10 回ほど)。当たり判定は足さない(壁ぎわに置く)。
// ?noconcprops=1 で置かない。
export const CONC_PROPS_ST = ['ring', 'north', 'roof', 'bay', 'railside', 'canal', 'grove'];

function tex(THREE, w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const pict = (x, cx, cy, s, col, skirt) => { x.fillStyle = col; x.beginPath(); x.arc(cx, cy - s * 0.62, s * 0.16, 0, 7); x.fill(); if (skirt) { x.beginPath(); x.moveTo(cx - s * 0.12, cy - s * 0.42); x.lineTo(cx + s * 0.12, cy - s * 0.42); x.lineTo(cx + s * 0.3, cy + s * 0.15); x.lineTo(cx - s * 0.3, cy + s * 0.15); x.closePath(); x.fill(); } else x.fillRect(cx - s * 0.2, cy - s * 0.42, s * 0.4, s * 0.57); x.fillRect(cx - s * 0.17, cy + s * 0.13, s * 0.13, s * 0.4); x.fillRect(cx + s * 0.04, cy + s * 0.13, s * 0.13, s * 0.4); };

export function buildConcProps(fp, THREE) {
  if (fp._concProps || !CONC_PROPS_ST.includes(fp.h.stadium || fp.stadium)) return null;
  if ((fp.h.stadium || fp.stadium) === 'canal' && !(typeof location !== 'undefined' && /[?&]canal_r[2-6]\b/.test(location.search))) return null;   // 11/21 舟灯 R7: 案内・自販機・分別の台は模型(本物の位置)にある
  const H = fp.h, bvh = H.world.bvh, V = (x, y, z) => new THREE.Vector3(x, y, z);
  const ray = (o, d, max) => bvh.raycastFirst(new THREE.Ray(o, d.clone().normalize()), THREE.DoubleSide, 0, max);
  const floorAt = (x, y, z) => { const h = ray(V(x, y + 1.0, z), V(0, -1, 0), 1.6); return h && Math.abs(h.face.normal.y) > 0.6 ? h.point.y : null; };
  const wallBehind = (x, y, z, f) => { const h = ray(V(x + f.x * 0.9, y + 1.0, z + f.z * 0.9), V(-f.x, 0, -f.z), 1.3); return h ? h.distance : null; };
  // 置く物の表(位置・向き)
  const vend = [], recyc = [], hang = [], hangExit = [], post = [], rails = [];
  const used = [];
  const free = (x, y, z, r) => !used.some((q) => Math.hypot(q.x - x, q.z - z) < r && Math.abs(q.y - y) < 2);
  for (const t of fp.toilets || []) used.push(t.p);
  const sideItem = (p, f, off, kind) => {
    const tx = f.z, tz = -f.x, x = p.x + tx * off, z = p.z + tz * off, fy = floorAt(x + f.x * 0.6, p.y, z + f.z * 0.6);
    if (fy === null || Math.abs(fy - p.y) > 0.25) return false;
    const wd = wallBehind(x, fy, z, f); if (wd === null || wd < 0.6) return false;   // 後ろが壁(0.9 m 前から 0.3 m 以内に壁)
    if (!free(x, fy, z, 1.4)) return false;
    const q = V(x, fy, z); used.push(q); kind.push({ p: q, f: f.clone() }); return true;
  };
  for (const t of fp.toilets || []) {
    if (t.noProps) continue;   // 11/21 潮凪 R28: デッキ(外)のトイレの棟の前には置かない(toiletAt の 6 つ目が 1)
    // 自販機 2 台(入口の右)・分別の台(左)。壁が続かない時は反対の側も試す
    if (!sideItem(t.p, t.f, 2.4, vend)) sideItem(t.p, t.f, -2.4, vend);
    if (vend.length && vend[vend.length - 1].p.distanceTo(t.p) < 3) sideItem(t.p, t.f, (vend[vend.length - 1].p.clone().sub(t.p).dot(V(t.f.z, 0, -t.f.x)) > 0 ? 3.35 : -3.35), vend);
    if (!sideItem(t.p, t.f, -2.6, recyc)) sideItem(t.p, t.f, 4.6, recyc);
    // 吊り下げの案内: 入口の 3.2 m 前、天井から(天井が無い所は柱に付けた案内)
    const c = V(t.p.x + t.f.x * 3.2, t.p.y, t.p.z + t.f.z * 3.2), up = ray(V(c.x, c.y + 1.9, c.z), V(0, 1, 0), 4.5);
    if (up && up.point.y - c.y > 2.6) hang.push({ p: V(c.x, Math.min(up.point.y - 0.45, c.y + 3.2), c.z), f: V(t.f.z, 0, -t.f.x), top: up.point.y });
    else post.push({ p: V(t.p.x + t.f.x * 2.2 + t.f.z * 1.6, t.p.y, t.p.z + t.f.z * 2.2 - t.f.x * 1.6), f: t.f.clone() });
  }
  // 入場ゲートの内側: 分別の台と「出口」の案内
  for (const g of (fp.gateList ? fp.gateList() : []).filter((q) => !q.virt)) {
    const w = g.w.clone().setY(0).normalize(), inner = g.o.clone().addScaledVector(w, -6);
    const fy = floorAt(inner.x, g.o.y + 0.5, inner.z); if (fy === null) continue;
    const up = ray(V(inner.x, fy + 1.9, inner.z), V(0, 1, 0), 4.5);
    if (up && up.point.y - fy > 2.6) hangExit.push({ p: V(inner.x, Math.min(up.point.y - 0.45, fy + 3.2), inner.z), f: w.clone().negate(), top: up.point.y });
    // 分別の台: ゲートの内側の、壁ぎわ(横へ光線を出して当たった壁の前)
    const sd = V(w.z, 0, -w.x);
    for (const s of [1, -1]) {
      const h = ray(V(inner.x, fy + 1.0, inner.z), sd.clone().multiplyScalar(s), 7); if (!h || h.distance < 2.4) continue;
      const f = sd.clone().multiplyScalar(-s), p = h.point.clone().addScaledVector(f, 0.05); p.y = fy;
      const ff = floorAt(p.x + f.x * 0.6, fy, p.z + f.z * 0.6); if (ff === null || Math.abs(ff - fy) > 0.25 || !free(p.x, fy, p.z, 2)) continue;
      used.push(p); recyc.push({ p, f }); break;
    }
  }
  // 通路口の階段の手すり(両わきの壁ぞい、高さ 0.85 m)
  for (const it of (H.passages && H.passages.items) || []) {
    if (!(it.kind === 'vom' || (it.def && it.def.asVom)) || !it.segs) continue;
    for (const s of it.segs) {
      if (!s.stair) continue;
      const d = s.b.clone().sub(s.a), L = Math.hypot(d.x, d.z); if (L < 1) continue;
      const sx = -d.z / L, sz = d.x / L, half = (s.w || 2.2) / 2 - 0.07;
      for (const k of [1, -1]) rails.push({ a: V(s.a.x + sx * half * k, s.a.y + 0.85, s.a.z + sz * half * k), b: V(s.b.x + sx * half * k, s.b.y + 0.85, s.b.z + sz * half * k) });
    }
  }

  // 形と絵
  const M = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.6 }, o));
  const vendTex = tex(THREE, 128, 256, (x, w, h) => {
    x.fillStyle = '#e9edf1'; x.fillRect(0, 0, w, h); x.fillStyle = '#c8202e'; x.fillRect(0, 0, w, 26);
    x.fillStyle = '#1b2430'; x.fillRect(8, 32, w - 16, 118);
    const cols = ['#e04848', '#f0c020', '#3a8fd8', '#38b060', '#f08a2a', '#ffffff', '#8a5a3a', '#6ac8e8'];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) { x.fillStyle = cols[(r * 3 + c) % cols.length]; x.fillRect(14 + c * 17, 38 + r * 28, 11, 22); x.fillStyle = '#fafafa'; x.fillRect(14 + c * 17, 62 + r * 28, 11, 3); }
    x.fillStyle = '#9aa3ab'; for (let c = 0; c < 6; c++) x.fillRect(16 + c * 17, 156, 8, 5);
    x.fillStyle = '#2b2f36'; x.fillRect(14, 196, w - 28, 34); x.fillStyle = '#5c646d'; x.fillRect(92, 168, 22, 16);
  });
  const recTex = tex(THREE, 512, 192, (x, w, h) => {
    x.fillStyle = '#f4f6f8'; x.fillRect(0, 0, w, h); x.fillStyle = '#2b2f36'; x.fillRect(0, 0, w, 44);
    x.fillStyle = '#fff'; x.font = '900 30px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('ごみは分けてください', w / 2, 23);
    const L = [['燃えるごみ', '#d23b3b'], ['プラスチック', '#2f6fc2'], ['缶・びん', '#e0a800'], ['ペットボトル', '#2e9a58']];
    L.forEach(([t, c], i) => { x.fillStyle = c; x.fillRect(8 + i * 126, 58, 118, 120); x.fillStyle = '#fff'; x.font = '900 22px sans-serif'; x.fillText(t, 67 + i * 126, 118); });
  });
  const signTex = (txt, arrow) => tex(THREE, 512, 128, (x, w, h) => {
    x.fillStyle = '#1d2a3c'; x.fillRect(0, 0, w, h); x.strokeStyle = '#e8edf2'; x.lineWidth = 4; x.strokeRect(6, 6, w - 12, h - 12);
    if (txt === 'トイレ') { x.fillStyle = '#f4f6f8'; x.fillRect(20, 16, 150, 96); pict(x, 62, 70, 80, '#1d5fbf', false); pict(x, 128, 70, 80, '#d23b4a', true); }
    else { x.fillStyle = '#2e9a58'; x.fillRect(20, 16, 150, 96); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(60, 64); x.lineTo(100, 34); x.lineTo(100, 52); x.lineTo(150, 52); x.lineTo(150, 76); x.lineTo(100, 76); x.lineTo(100, 94); x.closePath(); x.fill(); }
    x.fillStyle = '#fff'; x.font = '900 64px sans-serif'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(txt, 196, 66);
    if (arrow) { x.beginPath(); x.moveTo(470, 64); x.lineTo(430, 34); x.lineTo(430, 94); x.closePath(); x.fill(); }
  });
  const mats = {
    vBody: M({ color: 0xdfe3e7, roughness: 0.4, metalness: 0.2 }), vFace: M({ map: vendTex, roughness: 0.35, emissive: 0xffffff, emissiveMap: vendTex, emissiveIntensity: 0.35 }),
    rBase: M({ color: 0x8a9096, roughness: 0.5, metalness: 0.3 }), rBoard: M({ map: recTex, roughness: 0.5 }), lid: M({ color: 0x2b2f36, roughness: 0.5 }),
    sToi: M({ map: signTex('トイレ', false), roughness: 0.5, emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0, side: THREE.FrontSide }),
    sExit: M({ map: signTex('出口', false), roughness: 0.5, side: THREE.FrontSide }),
    steel: M({ color: 0xb8bec4, roughness: 0.35, metalness: 0.6 }),
  };
  const group = new THREE.Group(); group.name = 'fp_concprops';
  const inst = (geo, mat, list, place) => {
    if (!list.length) return; const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
    list.forEach((q, i) => { place(o, q); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }); m.instanceMatrix.needsUpdate = true; m.castShadow = false; m.receiveShadow = true; m.computeBoundingSphere(); group.add(m);
  };
  const yawOf = (f) => Math.atan2(f.x, f.z);
  // 自販機: 幅 1.0・高さ 1.83・奥行き 0.7(壁から 0.05 離す)。前の面に絵
  inst(new THREE.BoxGeometry(1.0, 1.83, 0.7), mats.vBody, vend, (o, q) => { o.position.set(q.p.x + q.f.x * 0.4, q.p.y + 0.915, q.p.z + q.f.z * 0.4); o.rotation.set(0, yawOf(q.f), 0); o.scale.set(1, 1, 1); });
  inst(new THREE.PlaneGeometry(0.92, 1.74), mats.vFace, vend, (o, q) => { o.position.set(q.p.x + q.f.x * 0.756, q.p.y + 0.93, q.p.z + q.f.z * 0.756); o.rotation.set(0, yawOf(q.f), 0); });
  // 分別の台: 台 2.0×0.9×0.55、口 4 つ(上の黒いふた)、後ろの板 2.0×0.75(高さ 1.0〜1.75)
  inst(new THREE.BoxGeometry(2.0, 0.9, 0.55), mats.rBase, recyc, (o, q) => { o.position.set(q.p.x + q.f.x * 0.33, q.p.y + 0.45, q.p.z + q.f.z * 0.33); o.rotation.set(0, yawOf(q.f), 0); });
  inst(new THREE.BoxGeometry(1.96, 0.04, 0.5), mats.lid, recyc, (o, q) => { o.position.set(q.p.x + q.f.x * 0.33, q.p.y + 0.92, q.p.z + q.f.z * 0.33); o.rotation.set(0, yawOf(q.f), 0); });
  inst(new THREE.PlaneGeometry(2.0, 0.75), mats.rBoard, recyc, (o, q) => { o.position.set(q.p.x + q.f.x * 0.07, q.p.y + 1.38, q.p.z + q.f.z * 0.07); o.rotation.set(0, yawOf(q.f), 0); });
  // 吊り下げの案内: 板 1.6×0.4(両面)と吊りの棒 2 本
  const hangAll = hang.map((q) => Object.assign({ m: 'toi' }, q)).concat(hangExit.map((q) => Object.assign({ m: 'exit' }, q)));
  inst(new THREE.PlaneGeometry(1.6, 0.4), mats.sToi, hang, (o, q) => { o.position.copy(q.p); o.rotation.set(0, yawOf(q.f), 0); });
  inst(new THREE.PlaneGeometry(1.6, 0.4), mats.sToi, hang, (o, q) => { o.position.copy(q.p); o.rotation.set(0, yawOf(q.f) + Math.PI, 0); });   // 11/21 汽笛ヶ原の作業: 両面の板は裏から鏡文字になるので、片面の板を背中合わせに 2 枚
  inst(new THREE.PlaneGeometry(1.6, 0.4), mats.sExit, hangExit, (o, q) => { o.position.copy(q.p); o.rotation.set(0, yawOf(q.f), 0); });
  inst(new THREE.PlaneGeometry(1.6, 0.4), mats.sExit, hangExit, (o, q) => { o.position.copy(q.p); o.rotation.set(0, yawOf(q.f) + Math.PI, 0); });   // 11/21 汽笛ヶ原の作業: 両面の板は裏から鏡文字になるので、片面の板を背中合わせに 2 枚
  const rods = []; for (const q of hangAll) { const L = q.top - (q.p.y + 0.2); if (L <= 0.05) continue; const tx = q.f.z, tz = -q.f.x; for (const s of [-0.6, 0.6]) rods.push({ x: q.p.x + tx * s, z: q.p.z + tz * s, y: q.p.y + 0.2 + L / 2, L }); }
  inst(new THREE.CylinderGeometry(0.012, 0.012, 1, 5), mats.steel, rods, (o, q) => { o.position.set(q.x, q.y, q.z); o.rotation.set(0, 0, 0); o.scale.set(1, q.L, 1); });
  // 天井の無い所(外に開いたコンコース)は柱に付けた案内: 柱 2.6 m と板
  inst(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), mats.steel, post, (o, q) => { o.position.set(q.p.x, q.p.y + 1.3, q.p.z); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); });
  inst(new THREE.PlaneGeometry(1.2, 0.3), mats.sToi, post, (o, q) => { o.position.set(q.p.x, q.p.y + 2.45, q.p.z); o.rotation.set(0, yawOf(q.f) + Math.PI / 2, 0); o.scale.set(1, 1, 1); });
  inst(new THREE.PlaneGeometry(1.2, 0.3), mats.sToi, post, (o, q) => { o.position.set(q.p.x, q.p.y + 2.45, q.p.z); o.rotation.set(0, yawOf(q.f) - Math.PI / 2, 0); o.scale.set(1, 1, 1); });   // 11/21 汽笛ヶ原の作業: 両面の板は裏から鏡文字になるので、片面の板を背中合わせに 2 枚
  // 通路口の手すり: 棒(径 3.4 cm)と 1 m ごとの受け金具
  const bars = [], brk = [];
  for (const r of rails) { const d = r.b.clone().sub(r.a), L = d.length(); bars.push({ c: r.a.clone().add(r.b).multiplyScalar(0.5), d, L }); for (let u = 0.3; u < L; u += 1.0) brk.push(r.a.clone().addScaledVector(d, u / L)); }
  const up = new THREE.Vector3(0, 1, 0);
  inst(new THREE.CylinderGeometry(0.017, 0.017, 1, 6), mats.steel, bars, (o, q) => { o.position.copy(q.c); o.quaternion.setFromUnitVectors(up, q.d.clone().normalize()); o.scale.set(1, q.L, 1); });
  inst(new THREE.BoxGeometry(0.03, 0.08, 0.03), mats.steel, brk, (o, q) => { o.position.set(q.x, q.y - 0.05, q.z); o.quaternion.identity(); o.scale.set(1, 1, 1); });
  fp.group.add(group);
  fp._concProps = { group, vend: vend.length, recyc: recyc.length, hang: hang.length, hangExit: hangExit.length, post: post.length, rails: rails.length };
  return fp._concProps;
}
