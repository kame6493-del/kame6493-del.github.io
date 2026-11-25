// 11/21 共通: スマホ(軽量・自動)で読む中の建物 interior.glb を、本塁の後ろ (0,-40) から見た向きで区切って細かい形に分ける。
// interior.glb は 1 つの形に材質が 100 以上で、材質ごとの形が球場をぐるっと一周しているため、gfx.cullIndoor(遠くの屋内を描かない)が効かない。
// 区切ると、近くの区切りだけを描く(当たり判定は分けた形を全部足すので、三角形の数は同じ)。?nosplit=1 で分けない。
export function splitSectors(THREE, root, { n = 16, cx = 0, cz = -40, rings = [70, 110], far = 50 } = {}) {   // far: 区切りを描く距離の上限(m。gfx.js の cullMax)
  const list = []; root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.geometry && o.geometry.attributes.position) list.push(o); });
  let made = 0;
  for (const o of list) {
    const g = o.geometry, P = g.attributes.position, I = g.index, nt = (I ? I.count : P.count) / 3;
    if (nt < 60) continue;
    o.updateMatrixWorld(true);
    const m = o.matrixWorld.elements, vi = (t, k) => (I ? I.getX(t * 3 + k) : t * 3 + k);
    const key = new Int16Array(nt); const used = new Set();
    for (let t = 0; t < nt; t++) {
      let sx = 0, sz = 0; for (let k = 0; k < 3; k++) { const v = vi(t, k), x = P.getX(v), y = P.getY(v), z = P.getZ(v); sx += m[0] * x + m[4] * y + m[8] * z + m[12]; sz += m[2] * x + m[6] * y + m[10] * z + m[14]; }
      const dx = sx / 3 - cx, dz = sz / 3 - cz, r = Math.hypot(dx, dz);
      let s = Math.floor(((Math.atan2(dx, dz) / (2 * Math.PI)) + 1) * n) % n, b = 0; while (b < rings.length && r > rings[b]) b++;
      key[t] = s + b * n; used.add(key[t]);
    }
    if (used.size < 2) continue;
    const names = Object.keys(g.attributes), parent = o.parent;
    for (const kk of used) {
      const map = new Map(); const idx = [];
      for (let t = 0; t < nt; t++) if (key[t] === kk) for (let k = 0; k < 3; k++) { const v = vi(t, k); let j = map.get(v); if (j === undefined) { j = map.size; map.set(v, j); } idx.push(j); }
      const ng = new THREE.BufferGeometry(), nv = map.size;
      for (const nm of names) {
        const A = g.attributes[nm], sz = A.itemSize, arr = new A.array.constructor(nv * sz);
        for (const [v, j] of map) for (let c = 0; c < sz; c++) arr[j * sz + c] = A.isInterleavedBufferAttribute ? A.getComponent(v, c) : A.array[v * sz + c];
        ng.setAttribute(nm, new THREE.BufferAttribute(arr, sz, A.normalized));
      }
      ng.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
      ng.computeBoundingSphere(); ng.computeBoundingBox();
      const q = new THREE.Mesh(ng, o.material); q.name = `${o.name}_s${kk}`; q.position.copy(o.position); q.quaternion.copy(o.quaternion); q.scale.copy(o.scale);
      q.castShadow = o.castShadow; q.receiveShadow = o.receiveShadow; Object.assign(q.userData, o.userData); if (far) q.userData.cullMax = far;
      parent.add(q); made++;
    }
    parent.remove(o); g.dispose();
  }
  return made;
}
