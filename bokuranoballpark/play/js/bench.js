// ベンチ(ダグアウト)の人(11/20 夜 持ち主「ベンチに人が誰もいなくておかしいのでなんとかして」)。引き継ぎは docs/ベンチの人.md
// 一塁側・三塁側のベンチに、控えの選手・監督とコーチ・ヘルメットの次の打者を置く。攻める側のベンチの前のネクストバッターズサークルで素振り。
// 人の形は観客の近くの形(models/crowd/person.json = 選手の体を軽くした物、crowd.js と同じ)に背番号の板を足した物。遠くは figures.js の観客の形(胴と頭)。
// どちらも 1 塁側・3 塁側で 1 つずつの描画(InstancedBufferGeometry)。姿勢(座る・立つ・手すりに寄りかかる・拍手)はシェーダーの中で作る(crowd.js と同じ式)。
// 素振りの次の打者だけは選手の体(athletes.js の Athlete)。
// 置き場所: models/passages.json の「一塁ベンチ」「三塁ベンチ」の段の下の点から、当たり判定(bvh)に光線を落として床と長いすを探す(球場ごとの表は持たない)。
// 合図: audio.js の crowdEvent / celebrate を外から包んで読む(crowd.js と同じやり方)・window の gameend・defense.g の表裏。
import * as THREE from 'three';
import { Athlete } from './athletes.js';
import { KIT, crowdGeometries } from './figures.js';
import { schoolOf } from './uniform.js';
import { MeshBVH } from 'three-mesh-bvh';

const BACK = 1;   // 人の形の背中の向き(+z。crowd.js の人は前が -z)
const NO_BENCH = /[?&]nobench=1/.test(location.search);   // ?nobench=1 で出さない(比べる用)

const DECL = /* glsl */`
attribute vec4 aP; attribute vec4 aC; attribute vec4 aH; attribute vec4 aE; attribute vec4 aF;
uniform float uT, uAtk, uMode, uLeanT, uKnee;
uniform vec4 uEvL, uEvR;
uniform vec3 uShR, uHip, uHead;
float hsh(float x) { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }
float evEnv(vec4 e, float t, float d) { float dt = t - e.x - d; if (dt < 0.0 || e.y <= 0.0) return 0.0; return clamp(dt / 0.35, 0.0, 1.0) * (1.0 - smoothstep(e.z * 0.6, e.z, dt)); }
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 rotZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z); }
`;
// 1 人の姿勢。role: 0 座る選手・1 手すりに寄りかかる選手・2 立って見る監督とコーチ(腕組み)・3 ヘルメットの次の打者(攻める時だけ)・4 座るコーチ
const POSE = /* glsl */`
  float ph = aE.x, role = aE.y, shinK = aE.z, drop = aE.w;
  float sideS = aF.w > 999.5 ? 1.0 : -1.0;
  float h1 = hsh(ph * 91.7), h2 = hsh(ph * 13.3 + 1.7), h3 = hsh(ph * 57.1 + 4.1), h4 = hsh(ph * 7.9 + 9.2);
  float t = uT;
  bool atk = abs(sideS - uAtk) < 0.5;
  bool seated = role < 0.5 || role > 3.5;
  float stand = seated ? 0.0 : 1.0, show = 1.0;
  float aR = 0.22 + h2 * 0.12, aL = 0.22 + h3 * 0.12, spr = 0.0, lean = 0.0;
  float sway = sin(t * (0.35 + h1 * 0.4) + h2 * 6.283) * 0.025;
  if (role < 0.5) {
    // ときどき立って少しして座る(1 人 40〜110 秒に 1 回、4 割の人)
    float c = fract(t / (40.0 + h1 * 70.0) + h2);
    stand = smoothstep(0.0, 0.025, c) * (1.0 - smoothstep(0.15, 0.175, c)) * step(h3, 0.4);
    lean = 0.04 + 0.1 * h4;
    if (h4 > 0.62) { aR = aL = 0.55; spr = -0.18; }          // 手をひざの上で組む
    if (uMode > 0.5 && h1 > 0.5) show = 0.0;               // ノック: 少人数
  } else if (role < 1.5) {
    aR = 1.2 + 0.12 * h2; aL = 1.15 + 0.12 * h3; spr = -0.2; lean = 0.2 + 0.08 * h3;   // 手すりに両腕をのせて前へ寄りかかる
    sway *= 0.5;
  } else if (role < 2.5) {
    aR = aL = 1.05; spr = -0.42; sway *= 0.6;               // 腕を組んで見る
  } else if (role < 3.5) {
    show = atk ? 1.0 : 0.0;                                // 攻める側だけヘルメットの人
    aR = 0.3; aL = 0.28;
  } else {
    lean = 0.08; aR = aL = 0.5; spr = -0.12;
  }
  if (uMode > 0.5 && role > 0.5) show = 0.0;
  // 場面の合図(人ごとに 0.1〜0.5 秒の遅れ)。w: 1 = 座ったまま拍手、2 = 立って拍手、3 = 得点(立って拍手、何人かは手を上げる)
  vec4 e = sideS > 0.0 ? uEvR : uEvL;
  float dly = 0.1 + h2 * 0.4;
  float env = evEnv(e, t, dly) * step(h4 * 0.7, e.y);
  if (env > 0.0 && (role < 2.5 || role > 3.5)) {
    float clap = 0.12 + 0.13 * sin(t * 23.0 + h1 * 6.0);
    if (e.w < 1.5) { aR = mix(aR, 1.2, env); aL = mix(aL, 1.2, env); spr = mix(spr, clap, env); lean = mix(lean, 0.06, env); }
    else {
      stand = max(stand, env * (role > 1.5 && role < 2.5 ? 0.0 : 1.0));
      float hi = step(h3, e.w > 2.5 ? 0.35 : 0.12);
      aR = mix(aR, hi > 0.5 ? 2.65 + 0.15 * sin(t * 8.0 + h1 * 6.0) : 1.3, env); aL = mix(aL, hi > 0.5 ? 2.55 : 1.3, env);
      spr = mix(spr, hi > 0.5 ? 0.3 : clap, env); lean = mix(lean, -0.02, env);
    }
  }
  float envL = evEnv(vec4(uLeanT, 1.0, 1.8, 0.0), t, dly * 0.3);
  lean = max(lean, 0.3 * envL * (role < 1.5 ? 1.0 : 0.4));
  stand = clamp(stand, 0.0, 1.0);
`;
const NEAR_VERT = /* glsl */`
  int part = int(aPart + 0.5);
  vec3 so = vec3(0.0, 0.45 - drop, -0.11) * stand;
  vec3 sp = position;
  if (part == 0 && aW.z > 0.5 && sp.y < uKnee) sp.y = uKnee + (sp.y - uKnee) * shinK;   // 座った形のすね(長いすの高さに合わせて縮める)
  vec3 p, nn;
  if (part == 0 || part == 5) { p = mix(sp, aS + vec3(0.0, -drop, 0.0), stand); nn = normalize(mix(normal, aNS, stand)); }
  else { p = position + so; nn = normal; }
  if (part == 5 && aH.w > 0.5) { vec3 hc = uHead + so; p = hc + (p - hc) * 1.09; }   // ヘルメット(帽子を少し大きく)
  if (aW.y > 0.0) {
    vec3 S0 = uShR + so, q = p - S0, qn = nn;
    q = rotX(rotZ(q, spr), aR); qn = rotX(rotZ(qn, spr), aR);
    p = mix(p, S0 + q, aW.y); nn = normalize(mix(nn, qn, aW.y));
  }
  if (aW.x > 0.0) {
    vec3 S0 = vec3(-uShR.x, uShR.y, uShR.z) + so, q = p - S0, qn = nn;
    q = rotX(rotZ(q, -spr), aL); qn = rotX(rotZ(qn, -spr), aL);
    p = mix(p, S0 + q, aW.x); nn = normalize(mix(nn, qn, aW.x));
  }
  vec3 H = uHip + so;
  float wu = 1.0 - aW.z;
  p = mix(p, H + rotZ(rotX(p - H, -lean), sway), wu); nn = normalize(mix(nn, rotZ(rotX(nn, -lean), sway), wu));
  if (seated) p.z -= 0.2 * stand;   // 長いすから立つ時は長いすの前へ出る(脚が長いすに重ならないように)
  p *= aC.w * show;
  vec3 myPos = rotY(p, aP.w) + aP.xyz;
  vec3 myNrm = rotY(nn, aP.w);
  int mt = int(aMat + 0.5);
  vec3 skin = vec3(0.78, 0.53, 0.40);
  vec3 col = aC.rgb;
  if (part == 0) col = mt == 0 ? skin : mt == 2 ? aF.rgb : mt == 3 ? vec3(0.02) : aC.rgb;
  else if (part == 5) col = aH.rgb;
  vCol = col;
  vNum = vec3(aUV, part == 16 ? mod(aF.w, 100.0) : -1.0);
  vNumCol = mod(floor(aF.w / 100.0), 10.0) > 0.5 ? vec3(0.93) : aH.rgb;   // 上着の人は白い番号、選手は帽子の色
`;
const FAR_VERT = /* glsl */`
  vec3 p = position;
  p.y += (0.45 - drop) * stand; p.z -= (seated ? 0.31 : 0.11) * stand;
  p = rotZ(rotX(p - uHip, -lean * 0.6), sway) + uHip;
  p *= aC.w * show;
  vec3 myPos = rotY(p, aP.w) + aP.xyz;
  vec3 myNrm = rotY(normal, aP.w);
  vCol = aPart > 0.5 ? aH.rgb : aC.rgb;
  vNum = vec3(0.0, 0.0, -1.0); vNumCol = vec3(0.0);
`;
const FRAG = /* glsl */`
  vec3 c = vCol;
  if (vNum.z >= 0.0) {
    float n = floor(vNum.z + 0.5), cx = mod(n, 10.0), cy = floor(n / 10.0);
    float m = texture2D(uNumTex, vec2((cx + vNum.x) / 10.0, 1.0 - (cy + 1.0 - vNum.y) / 10.0)).r;
    c = mix(c, vNumCol, m);
  }
  vec4 diffuseColor = vec4(c, opacity);
`;

// 背番号の絵(0〜99 を 10 x 10 に並べた 1 枚)。白 = 字
function numberAtlas() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 1024);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let n = 0; n < 100; n++) {
    const s = String(n); g.font = `900 ${s.length > 1 ? 74 : 86}px "Arial Black", Arial, sans-serif`;
    g.save(); g.translate((n % 10) * 102.4 + 51.2, Math.floor(n / 10) * 102.4 + 54); g.scale(s.length > 1 ? 0.78 : 1, 1); g.fillText(s, 0, 0); g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 2; return t;
}

// 近くの形: 観客の人の形(体と帽子)と背中の番号の板
function nearGeometry(J) {
  const P = [], N = [], S = [], NS = [], Q = [], M = [], W = [], UV = [];
  for (let i = 0; i < J.n; i++) {
    P.push(J.seat[i * 3], J.seat[i * 3 + 1], J.seat[i * 3 + 2]); N.push(J.nSeat[i * 3], J.nSeat[i * 3 + 1], J.nSeat[i * 3 + 2]);
    S.push(J.stand[i * 3], J.stand[i * 3 + 1], J.stand[i * 3 + 2]); NS.push(J.nStand[i * 3], J.nStand[i * 3 + 1], J.nStand[i * 3 + 2]);
    Q.push(J.part[i]); M.push(J.mat[i]); W.push(J.w[i * 3], J.w[i * 3 + 1], J.w[i * 3 + 2]); UV.push(0, 0);
  }
  // 背中の面(服の頂点の、背中の側のいちばん外)
  let zb = -1e9 * BACK;
  for (let i = 0; i < J.n; i++) if (J.mat[i] === 1 && Math.abs(J.seat[i * 3]) < 0.12 && J.seat[i * 3 + 1] > 0.24 && J.seat[i * 3 + 1] < 0.46) { const z = J.seat[i * 3 + 2]; if (BACK > 0 ? z > zb : z < zb) zb = z; }
  const plate = new THREE.PlaneGeometry(0.2, 0.2).toNonIndexed();
  if (BACK < 0) plate.rotateY(Math.PI);
  plate.translate(0, 0.35, zb + BACK * 0.012);
  const pp = plate.attributes.position, pn = plate.attributes.normal, pu = plate.attributes.uv;
  for (let i = 0; i < pp.count; i++) {
    P.push(pp.getX(i), pp.getY(i), pp.getZ(i)); N.push(pn.getX(i), pn.getY(i), pn.getZ(i));
    S.push(pp.getX(i), pp.getY(i), pp.getZ(i)); NS.push(pn.getX(i), pn.getY(i), pn.getZ(i));
    Q.push(16); M.push(1); W.push(0, 0, 0); UV.push(pu.getX(i), pu.getY(i));
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(S, 3));
  g.setAttribute('aNS', new THREE.Float32BufferAttribute(NS, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(Q, 1));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(M, 1));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(W, 3));
  g.setAttribute('aUV', new THREE.Float32BufferAttribute(UV, 2));
  return g;
}
// 遠くの形: figures.js の観客の形(胴と頭)
function farGeometry() {
  const { torso, head } = crowdGeometries();
  const P = [], N = [], Q = [];
  for (const [geo, part] of [[torso, 0], [head, 1]]) {
    const g = geo.index ? geo.toNonIndexed() : geo; const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); Q.push(part); }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(Q, 1));
  return g;
}

export class Bench {
  // o: { scene, camera, stadium, sound, bvh(), groundAt(x, z, fromY, max), defense(), watch(), mode(), getQuality() → 'ultra'|'std'|'lite'|'min' }
  constructor(o) {
    Object.assign(this, o);
    this.on = false; this.built = false; this.sides = [];
    this.U = {
      uT: { value: 0 }, uAtk: { value: -1 }, uMode: { value: 0 }, uLeanT: { value: -99 }, uKnee: { value: -0.02 },
      uEvL: { value: new THREE.Vector4(-99, 0, 1, 0) }, uEvR: { value: new THREE.Vector4(-99, 0, 1, 0) },
      uShR: { value: new THREE.Vector3(0.2, 0.55, 0.09) }, uHip: { value: new THREE.Vector3(0, 0.1, 0.03) }, uHead: { value: new THREE.Vector3(0, 0.68, 0.05) },
      uNumTex: { value: null },
    };
    this.group = new THREE.Group(); this.group.name = 'bench'; this.group.visible = false; this.scene.add(this.group);
    this.paths = fetch('models/passages.json').then((r) => r.json()).then((d) => (d[this.stadium] || []).filter((e) => e.side === 'bench' && e.pts && e.pts.length)).catch(() => []);
    this.person = fetch('models/crowd/person.json?v=20261122').then((r) => r.json()).catch(() => null);
    this._attachSound();
    addEventListener('gameend', (e) => { const sc = e.detail && e.detail.score; if (!sc) return; const t = this.now(); const win = (sc.us || 0) >= (sc.them || 0) ? 1 : -1; this.fire(win, 1, 8, 3, t); this.fire(-win, 0.5, 5, 1, t + 3); });
    window.__bench = this;
  }
  now() { return performance.now() / 1000; }

  // ---------------------------------------------------------------- 置き場所を探す(初めて出す時に 1 回)
  async build() {
    if (this.building) return this.building;
    this.building = (async () => {
      const [paths, J] = await Promise.all([this.paths, this.person]);
      const bvh = this.bvh(); if (!bvh || !J || !paths.length) { this.failed = true; return; }
      this.U.uShR.value.fromArray(J.shoulderR); this.U.uHip.value.fromArray(J.hip); this.U.uHead.value.fromArray(J.head);
      this.U.uNumTex.value = numberAtlas();
      const near = nearGeometry(J), far = farGeometry();
      this.matNear = this._material('near'); this.matFar = this._material('far');
      for (const e of paths) {
        const P = e.pts[e.pts.length - 1], s = P[0] > 0 ? 1 : -1;
        if (this.sides.some((q) => q.s === s)) continue;
        this._seatAt = this._seatFinder(P);
        const L = this._layout(bvh, P, e.pts);
        if (!L) { (this.missed || (this.missed = [])).push({ s, P }); continue; }
        const side = { s, L, P };
        side.people = this._cast(side);
        this._makeMeshes(side, near, far);
        this.sides.push(side);
      }
      // 片側だけ見つからなかった時: 左右対称の球場(段の下の点が鏡の位置)なら、見つかった側を鏡に映して使う(灯台坂の三塁側は段の下の当たり判定が抜けている)
      for (const m of this.missed || []) {
        const o = this.sides.find((q) => q.s === -m.s);
        if (!o || Math.abs(o.P[0] + m.P[0]) > 0.6 || Math.abs(o.P[2] - m.P[2]) > 0.6) continue;
        const mir = (q) => ({ ...q, x: -q.x });
        const L0 = o.L;
        // 鏡に映した所に本当に床・長いすがあるか、見た目の形に光線を落として確かめる(三塁側の形が少し違う所は使わない)
        const vis = this._seatFinder(m.P, null), seatV = this._seatFinder(m.P);
        const okRail = (q) => { const h = vis ? vis(q.x, q.z, q.y + 1.5) : NaN; return Math.abs(h - q.y) < 0.15; };
        const okSeat = (q) => { const h1 = seatV ? seatV(q.x, q.z, q.y + 0.5) : NaN, h2 = vis ? vis(q.x, q.z, q.y + 0.5) : NaN; return Math.abs(h1 - q.y) < 0.1 || Math.abs(h2 - q.y) < 0.1; };
        const L = { ...L0, seats: L0.seats.map(mir).filter(okSeat), rails: L0.rails.map(mir).filter(okRail), yaw: -L0.yaw, u: [-L0.u[0], L0.u[1]], v: [-L0.v[0], L0.v[1]], center: new THREE.Vector3(-L0.center.x, L0.center.y, L0.center.z), stairs: L0.stairs.map(([x, z]) => [-x, z]), mirrored: true };
        const side = { s: m.s, L, P: m.P };
        side.people = this._cast(side);
        this._makeMeshes(side, near, far);
        this.sides.push(side);
      }
      this._makeOnDeck();
      this.built = true;
    })();
    return this.building;
  }
  // 当たり判定に光線を落として、ベンチの床(段の下の点と同じ高さ)・長いす(床から 0.3〜0.7 m 上の平ら)・前の壁の手前を探す
  _layout(bvh, P, pts) {
    const ray = new THREE.Ray(), down = new THREE.Vector3(0, -1, 0), up = new THREE.Vector3(0, 1, 0);
    let Y = P[1]; const G = 0.25, R = 14, n = Math.round(R / G) * 2 + 1, o = Math.round(R / G);
    const fy = new Float32Array(n * n).fill(NaN), cy = new Float32Array(n * n).fill(NaN);
    const at = (i, j) => [P[0] + (i - o) * G, P[2] + (j - o) * G];
    const cast = (x, y0, z, dir, max) => { ray.origin.set(x, y0, z); ray.direction.copy(dir); const h = bvh.raycastFirst(ray, THREE.DoubleSide, 0, max); return h ? h.point.y : NaN; };
    const getF = (i, j) => { const k = j * n + i; if (Number.isNaN(fy[k]) && !(fy[k] === -999)) { const [x, z] = at(i, j); const f = cast(x, Y + 1.6, z, down, 3.5); fy[k] = Number.isNaN(f) ? -999 : f; if (!Number.isNaN(f)) cy[k] = cast(x, f + 0.25, z, up, 4); } return fy[k]; };
    // 段の下の点から、床・長いすの高さの所だけを広げる(グラウンドの高さ・スタンドの下の高い所へは出ない)
    const ok = (f) => f > Y - 0.25 && f < Y + 1.3;   // 床から 1.3 m まで(段の上の長いす)
    // 段の向き(段の下の点 → 上の点 = グラウンドの方)。ベンチの奥行きはこの向きに -3.6〜+3.2 m、横は 13 m まで(裏の通路・部屋へ広がらない)
    let v0 = [pts[0][0] - P[0], (pts[0].length === 3 ? pts[0][2] : pts[0][1]) - P[2]]; { const l = Math.hypot(v0[0], v0[1]) || 1; v0 = [v0[0] / l, v0[1] / l]; }
    const inWin = (i, j) => { const dx = (i - o) * G, dz = (j - o) * G, b = dx * v0[0] + dz * v0[1], a = -dx * v0[1] + dz * v0[0]; return b > -3.6 && b < 3.2 && Math.abs(a) < 13; };
    const inReg = new Uint8Array(n * n), list = [];
    // 段の下の点に床が無い時(灯台坂は段の下の当たり判定が抜けていて、床は -0.77〜-0.87)は、1.5 m 以内のいちばん近い床から始め、その高さを床にする
    let i0 = o, j0 = o;
    { const f = getF(o, o); if (!(f > Y - 0.15 && f < Y + 0.15)) {
      let best = null;
      for (let di = -6; di <= 6; di++) for (let dj = -6; dj <= 6; dj++) { const f2 = getF(o + di, o + dj); const d = Math.hypot(di, dj); if (f2 > Y - 0.25 && f2 < Y + 0.3 && (!best || d < best.d)) best = { i: o + di, j: o + dj, d, f: f2 }; }
      if (!best) return null;
      i0 = best.i; j0 = best.j; Y = best.f;
    } }
    if (!ok(getF(i0, j0))) return null;
    const q = [[i0, j0]]; inReg[j0 * n + i0] = 1;
    while (q.length) {
      const [i, j] = q.pop(); list.push([i, j]);
      const f0 = getF(i, j);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= n || b >= n || inReg[b * n + a]) continue;
        if (!inWin(a, b)) continue;
        const f = getF(a, b); if (!ok(f) || Math.abs(f - f0) > 0.62) continue;
        const k = b * n + a; const c = cy[k]; if (!Number.isNaN(c) && c - f < 0.8) continue;   // 長いすの下・棚の下には入らない(汽笛ヶ原は長いすの上の屋根まで 1 m ほど)
        inReg[k] = 1; q.push([a, b]);
      }
    }
    const floor = list.filter(([i, j]) => Math.abs(getF(i, j) - Y) < 0.12);
    const benchC = list.filter(([i, j]) => { const h = getF(i, j) - Y; if (!(h > 0.3 && h < 1.25)) return false; if (h > 0.8) { const c = cy[j * n + i]; return !Number.isNaN(c) && c - (h + Y) < 2.6; } return true; });   // 0.8 m より高い所は屋根の下だけ(グラウンドを長いすと見ない)
    if (floor.length < 20) return null;
    // ベンチの長い向き(床と長いすの点の主軸)と、グラウンドへの向き
    const all = floor.map(([i, j]) => at(i, j));   // 床の帯の主軸
    let mx = 0, mz = 0; for (const [x, z] of all) { mx += x; mz += z; } mx /= all.length; mz /= all.length;
    let sxx = 0, sxz = 0, szz = 0; for (const [x, z] of all) { sxx += (x - mx) ** 2; sxz += (x - mx) * (z - mz); szz += (z - mz) ** 2; }
    const th = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    let u = [Math.cos(th), Math.sin(th)];
    let v = [-u[1], u[0]]; if (v[0] * v0[0] + v[1] * v0[1] < 0) v = [-v[0], -v[1]];   // グラウンドの方(段の上る向きと同じ側)
    if (Math.abs(v[0] * v0[0] + v[1] * v0[1]) < 0.6) v = v0;   // 主軸が奥行きの向きになった(短いベンチ)時は段の向き
    u = [-v[1], v[0]];
    const yaw = Math.atan2(-v[0], -v[1]);
    const key = (i, j) => (i >= 0 && j >= 0 && i < n && j < n ? inReg[j * n + i] : 0);
    const cellOf = (x, z) => [Math.round((x - P[0]) / G) + o, Math.round((z - P[2]) / G) + o];
    const fAt = (x, z) => { const [i, j] = cellOf(x, z); if (i < 0 || j < 0 || i >= n || j >= n) return NaN; const f = getF(i, j); return f === -999 ? NaN : f; };
    const stairs = pts.map((p) => [p[0], p[p.length === 3 ? 2 : 1]]);
    const nearStairs = (x, z, r) => stairs.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < r);
    // 長いす: グラウンドの側の縁(その前 0.25〜0.5 m が床)から 0.22 m 奥。高さは長いすの上
    const seats = [];
    for (const [i, j] of benchC) {
      const [x, z] = at(i, j), h = getF(i, j);
      const fx = x + v[0] * 0.3, fz = z + v[1] * 0.3, ff = fAt(fx, fz);
      if (!(Math.abs(ff - h) > 0.25)) continue;                     // 縁でない
      const foot = fAt(x + v[0] * 0.45, z + v[1] * 0.45);
      if (!(h - foot > 0.3 && h - foot < 0.86 && foot > Y - 0.1)) continue;
      if (Math.abs(fAt(x - v[0] * 0.2, z - v[1] * 0.2) - h) > 0.06) continue;   // 奥行きのある平ら(背もたれの上ではない)
      const c = cy[j * n + i]; if (!Number.isNaN(c) && c - h < 0.95) continue;  // 頭の上が低い(座った頭の上まで 0.9 m)
      if (nearStairs(x, z, 1.0)) continue;
      seats.push({ x: x - v[0] * 0.12, z: z - v[1] * 0.12, y: h, foot, a: (x - mx) * u[0] + (z - mz) * u[1] });
    }
    // 見た目の長いす・いす(当たり判定に入っていない球場: 杜ノ丘の 1 人ずつのいす など)
    const vs = this._seatAt;
    if (vs) for (const [i, j] of list) {
      const [x, z] = at(i, j), h = vs(x, z, Y + 1.4);
      if (Number.isNaN(h) || h - Y < 0.3 || h - Y > 1.25) continue;
      const hf = vs(x + v[0] * 0.3, z + v[1] * 0.3, Y + 1.4); if (Math.abs(hf - h) < 0.08) continue;   // 縁でない
      const hb = vs(x - v[0] * 0.15, z - v[1] * 0.15, Y + 1.4); if (!(Math.abs(hb - h) < 0.05)) continue;   // 奥行きのある平ら
      const foot = fAt(x + v[0] * 0.45, z + v[1] * 0.45);
      if (!(h - foot > 0.3 && h - foot < 0.86 && foot > Y - 0.1)) continue;   // 汽笛ヶ原・白樺の長いすは床から 0.8 m
      { const c = cy[j * n + i]; if (!Number.isNaN(c) && c - h < 0.95) continue; }
      if (nearStairs(x, z, 1.0)) continue;
      seats.push({ x: x - v[0] * 0.12, z: z - v[1] * 0.12, y: h, foot, a: (x - mx) * u[0] + (z - mz) * u[1], vis: true });
    }
    // 手すりの前(グラウンドの側の縁の床。その先 0.5 m が高い)
    const rails = [];
    for (const [i, j] of floor) {
      const [x, z] = at(i, j), h = getF(i, j);
      const f1 = fAt(x + v[0] * 0.5, z + v[1] * 0.5);
      if (!(Number.isNaN(f1) || f1 - h > 0.6)) continue;
      if (!(Math.abs(fAt(x - v[0] * 0.3, z - v[1] * 0.3) - h) < 0.15)) continue;   // 後ろに立つ幅がある(屋根の球場は手すりと長いすの段の間が 0.6 m)
      if (!(Math.abs(fAt(x - v[0] * 0.15 + u[0] * 0.3, z - v[1] * 0.15 + u[1] * 0.3) - h) < 0.1 && Math.abs(fAt(x - v[0] * 0.15 - u[0] * 0.3, z - v[1] * 0.15 - u[1] * 0.3) - h) < 0.1)) continue;
      const c = cy[j * n + i]; if (!Number.isNaN(c) && c - h < 1.95) continue;
      if (nearStairs(x, z, 1.3)) continue;
      rails.push({ x: x - v[0] * 0.18, z: z - v[1] * 0.18, y: h, a: (x - mx) * u[0] + (z - mz) * u[1] });
    }
    // 立つ所(床の真ん中あたり。コーチ・ヘルメットの人)
    const spaced = (arr, gap) => { arr.sort((p, q) => p.a - q.a); const out = []; for (const p of arr) if (!out.length || p.a - out[out.length - 1].a >= gap || Math.hypot(p.x - out[out.length - 1].x, p.z - out[out.length - 1].z) >= gap) out.push(p); return out; };
    // 同じ a に何列もあるときは 1 列だけ。手すりは前の縁。長いすは見た目のいすの材質の物、無ければ高い段(段の上に長いすが載っている所で、段の縁に座らせない)
    const front = (arr, seat) => { const m = new Map(); for (const p of arr) { const k = Math.round(p.a / 0.25); const b = p.x * v[0] + p.z * v[1]; const sc = seat ? (p.vis ? 10 : 0) + p.y * 2 + b * 0.01 : b; const c = m.get(k); if (!c || sc > c.sc) m.set(k, { ...p, b, sc }); } return [...m.values()]; };
    const anyVis = seats.some((p) => p.vis);
    const S = spaced(front(anyVis ? seats.filter((p) => p.vis) : seats, true), 0.68), Rl = spaced(front(rails), 0.85);
    const center = new THREE.Vector3(mx, Y + 0.8, mz);
    return { seats: S, rails: Rl, yaw, u, v, center, Y, stairs };
  }
  // 見た目の長いす・いすの上の高さ(材質の名前で探す。各球場の kit3d のベンチ: dug_seat・dg_seat・kt_dg_seat_*・bench_grey・bs_bench …)
  _seatFinder(P, re = /(dug|dg)_seat(?!_side)|dg_seat_(rail|roof|grove)|bench_grey|bs_bench|dug_bench|dg_bench/i) {
    const list = [], box = new THREE.Box3(new THREE.Vector3(P[0] - 15, P[1] - 1, P[2] - 15), new THREE.Vector3(P[0] + 15, P[1] + 2.5, P[2] + 15));
    this.scene.updateMatrixWorld(true);
    this.scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.geometry || !o.geometry.attributes.position || o.geometry.isInstancedBufferGeometry) return;
      const n = ((o.material && o.material.name) || '');
      if (re ? !re.test(n) : (!o.visible || /glass|net|light|lamp|ceiling|roof/i.test(n))) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); if (!bb.intersectsBox(box)) return;
      if (!o.geometry.boundsTree) o.geometry.boundsTree = new MeshBVH(o.geometry, { maxLeafTris: 8 });
      list.push({ o, inv: o.matrixWorld.clone().invert() });
    });
    if (!list.length) return null;
    const ray = new THREE.Ray(), lr = new THREE.Ray(), down = new THREE.Vector3(0, -1, 0), tmp = new THREE.Vector3();
    return (x, z, fromY) => {
      let best = NaN;
      for (const e of list) {
        ray.origin.set(x, fromY, z); ray.direction.copy(down); lr.copy(ray).applyMatrix4(e.inv);
        const h = e.o.geometry.boundsTree.raycastFirst(lr, THREE.DoubleSide); if (!h) continue;
        tmp.copy(h.point).applyMatrix4(e.o.matrixWorld);
        if (Number.isNaN(best) || tmp.y > best) best = tmp.y;
      }
      return best;
    };
  }
  // 人を決める(順番は大事な順。軽い画質では前から何人かだけ)
  _cast(side) {
    let seed = (side.s > 0 ? 7919 : 104729) + this.stadium.length * 31;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const { seats, rails } = side.L;
    const S = seats.slice(), Rl = rails.slice();
    const take = (arr, pick) => { if (!arr.length) return null; const i = pick === 'home' ? arr.reduce((b, p, k) => (Math.hypot(p.x, p.z) < Math.hypot(arr[b].x, arr[b].z) ? k : b), 0) : pick === 'stairs' ? arr.reduce((b, p, k) => (dS(p) < dS(arr[b]) ? k : b), 0) : Math.floor(rnd() * arr.length); return arr.splice(i, 1)[0]; };
    const dS = (p) => Math.min(...side.L.stairs.map(([x, z]) => Math.hypot(x - p.x, z - p.z)));
    // 隣どうしで重ならないよう、取った所の近く(0.6 m)の他の候補を消す
    const takeFree = (arr, pick) => { const p = take(arr, pick); if (!p) return null; for (const A of [S, Rl]) for (let k = A.length - 1; k >= 0; k--) if (Math.hypot(A[k].x - p.x, A[k].z - p.z) < 0.62) A.splice(k, 1); return p; };
    const people = [];
    const used = new Set();
    const num = () => { let k; do { k = 10 + Math.floor(rnd() * 60); } while (used.has(k)); used.add(k); return k; };
    const add = (spot, role, extra = {}) => { if (!spot) return; people.push({ spot, role, ph: rnd(), ...extra }); };
    const nPlayers = 8 + Math.floor(rnd() * 5);   // 控えの選手 8〜12 人
    add(takeFree(Rl, 'home'), 2, { jacket: true, number: side.s > 0 ? 77 : 81 });            // 監督(本塁寄りの手すり)
    add(takeFree(Rl, 'stairs'), 3, { helmet: true, number: num() });                           // 次の次の打者(段の近く)
    let seated = 0, railed = 0;
    for (let k = 0; k < nPlayers; k++) {
      const wantRail = railed < Math.round(nPlayers * 0.4) && (k % 3 === 1 || !S.length);
      const sp = wantRail ? takeFree(Rl) || takeFree(S) : takeFree(S) || takeFree(Rl);
      if (!sp) break;
      const isSeat = !wantRail && seats.includes(sp);
      add(sp, isSeat ? 0 : 1, { number: num() });
      if (isSeat) seated++; else railed++;
      if (k === 2) add(takeFree(Rl), 2, { jacket: true, number: side.s > 0 ? 72 : 86 });  // コーチ(手すり)
    }
    add(takeFree(S) || takeFree(Rl), S.length ? 4 : 2, { jacket: true, number: side.s > 0 ? 73 : 88 });   // コーチ(座る)
    add(takeFree(Rl, 'stairs'), 3, { helmet: true, number: num() });
    // 座る所が見つからなかった人は立つ(長いすの無いベンチ)
    for (const p of people) if ((p.role === 0 || p.role === 4) && !seats.includes(p.spot)) p.role = p.role === 4 ? 2 : 1;
    return people;
  }
  _fillAttrs(side) {
    const ppl = side.people, N = ppl.length;
    const A = { aP: new Float32Array(N * 4), aC: new Float32Array(N * 4), aH: new Float32Array(N * 4), aE: new Float32Array(N * 4), aF: new Float32Array(N * 4) };
    const S = schoolOf({ side: side.s > 0 ? 'home' : 'away' }).S;
    const c = new THREE.Color();
    const set3 = (arr, i, hex) => { c.setHex(hex); arr[i * 4] = c.r; arr[i * 4 + 1] = c.g; arr[i * 4 + 2] = c.b; };
    ppl.forEach((p, i) => {
      const seated = p.role === 0 || p.role === 4, sp = p.spot;
      const y = seated ? sp.y - 0.02 : sp.y + 0.35;
      A.aP.set([sp.x, y, sp.z, side.L.yaw + (seated ? (p.ph - 0.5) * 0.25 : (p.ph - 0.5) * 0.5)], i * 4);
      set3(A.aC, i, p.jacket ? S.cap : S.jersey); A.aC[i * 4 + 3] = 1;
      set3(A.aH, i, S.cap); A.aH[i * 4 + 3] = p.helmet ? 1 : 0;
      const seatH = seated ? sp.y - sp.foot : 0.8;
      A.aE.set([p.ph, p.role, Math.max(0.42, Math.min(1, (seatH - 0.06) / 0.75)), seated ? seatH - 0.35 : 0], i * 4);
      set3(A.aF, i, p.jacket ? 0x2a2d33 : S.pants); A.aF[i * 4 + 3] = (p.number % 100) + (p.jacket ? 100 : 0) + (side.s > 0 ? 1000 : 0);
    });
    return A;
  }
  _makeMeshes(side, near, far) {
    const A = this._fillAttrs(side);
    side.attrs = A;
    const mk = (base, mat) => {
      const g = new THREE.InstancedBufferGeometry();
      for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
      for (const k in A) g.setAttribute(k, new THREE.InstancedBufferAttribute(A[k], 4));
      g.instanceCount = side.people.length;
      g.boundingSphere = new THREE.Sphere(side.L.center.clone(), 15);
      g.boundingBox = new THREE.Box3().setFromCenterAndSize(side.L.center, new THREE.Vector3(30, 6, 30));
      const m = new THREE.Mesh(g, mat); m.frustumCulled = true; m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false;
      this.group.add(m); return m;
    };
    side.near = mk(near, this.matNear); side.far = mk(far, this.matFar);
    side.near.name = 'bench_near'; side.far.name = 'bench_far';
  }
  // 学校が替わった時に色を塗り直す
  recolor() {
    for (const side of this.sides) { const A = this._fillAttrs(side); for (const m of [side.near, side.far]) for (const k of ['aC', 'aH', 'aF']) { m.geometry.attributes[k].array.set(A[k]); m.geometry.attributes[k].needsUpdate = true; } }
  }
  _material(kind) {
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.U);
      const vary = 'varying vec3 vCol; varying vec3 vNum; varying vec3 vNumCol;';
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + DECL + (kind === 'near' ? 'attribute vec3 aS; attribute vec3 aNS; attribute float aPart; attribute float aMat; attribute vec3 aW; attribute vec2 aUV;' : 'attribute float aPart;') + vary)
        .replace('#include <beginnormal_vertex>', POSE + (kind === 'near' ? NEAR_VERT : FAR_VERT) + '\nvec3 objectNormal = myNrm;')
        .replace('#include <begin_vertex>', 'vec3 transformed = myPos;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uNumTex;' + vary)
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', FRAG);
    };
    m.customProgramCacheKey = () => 'bench_' + kind;
    return m;
  }
  // ネクストバッターズサークルの次の打者(選手の体。素振り)
  _makeOnDeck() {
    this.ondeck = new Athlete({ ...KIT.away, side: 'away' }, { bat: true, helmet: true, glove: false, number: '24' });
    this.ondeck.root.visible = false; this.ondeck.root.name = 'bench_ondeck';
    this.scene.add(this.ondeck.root);
    // サークルの位置: 白線の模型(chalk・line_white)の中に描いてある円があればその真ん中(浜風 (±10.7, 5.5)・銀輪など (±11.5, 9.5)・海鳴り (±12, 7.5))。
    // 無い球場(線を地面の絵に描いてある所)は (±11, 7)、そこがグラウンドの高さでなければ本塁とベンチを結ぶ線の上
    const ring = { 1: [], '-1': [] }, v = new THREE.Vector3();
    this.scene.updateMatrixWorld(true);
    this.scene.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position || !/chalk|line_white/i.test((o.material && o.material.name) || '')) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); if (Math.abs(v.x) > 8 && Math.abs(v.x) < 15 && v.z > 3 && v.z < 12 && v.y < 0.3) ring[v.x > 0 ? 1 : '-1'].push([v.x, v.z]); }
    });
    const ground = (x, z) => { const g = this.groundAt(x, z, 2, 4); return g != null && Math.abs(g) < 0.25 ? g : null; };
    for (const side of this.sides) {
      const R = ring[side.s > 0 ? 1 : '-1'];
      let best = null;
      if (R.length >= 12) { const x = R.reduce((a, p) => a + p[0], 0) / R.length, z = R.reduce((a, p) => a + p[1], 0) / R.length; const g = ground(x, z); if (g != null) best = { x, y: g, z, from: 'line' }; }
      if (!best) { const x = side.s * 11, z = 7, g = ground(x, z); if (g != null && Math.hypot(x - side.L.center.x, z - side.L.center.z) > 6) best = { x, y: g, z, from: 'default' }; }
      if (!best) {
        const c = side.L.center, d = Math.hypot(c.x, c.z), ux = c.x / d, uz = c.z / d;
        for (let r = 10; r >= 6; r -= 0.5) { const g = ground(ux * r, uz * r); if (g != null) { best = { x: ux * r, y: g, z: uz * r, from: 'line_to_bench' }; break; } }
      }
      side.ondeck = best;
    }
  }

  // ---------------------------------------------------------------- 合図
  fire(sideS, frac, dur, kind, t = this.now()) {
    const e = (sideS > 0 ? this.U.uEvR : this.U.uEvL).value;
    if (t - e.x < e.z * 0.55 && e.y > 0 && t >= e.x) { e.y = Math.max(e.y, frac); e.z = Math.max(e.z, t - e.x + dur); e.w = Math.max(e.w, kind); }
    else e.set(t, frac, dur, kind);
  }
  event(name) {
    if (!this.on) return;
    const S = this.atk, D = -S, t = this.now();
    switch (name) {
      case 'contact': case 'flyup': case 'ooh': this.U.uLeanT.value = t; break;
      case 'hit': case 'longhit': case 'walk': this.fire(S, name === 'walk' ? 0.4 : 1, 4, name === 'walk' ? 1 : 2); break;
      case 'hr': case 'sayonara': case 'score': this.fire(S, 1, name === 'score' ? 6 : 7, 3); break;
      case 'out': case 'dp': case 'strikeout': case 'escape': case 'fine': this.fire(D, name === 'out' ? 0.6 : 0.9, 3, 1); break;   // 守る側は座ったまま拍手。攻める側は座ったまま
      case 'change': this.fire(D, 0.5, 3, 1); break;
      default: break;
    }
  }
  _attachSound() {
    const s = this.sound; if (!s) return;
    const wrap = (name, fn) => { const orig = s[name]; if (typeof orig !== 'function') return; s[name] = function (...a) { const r = orig.apply(this, a); try { fn(...a); } catch (e) { /* 見た目だけ */ } return r; }; };
    let celebT = -99;
    wrap('crowdEvent', (name) => { if (name === 'hr' || name === 'score' || name === 'sayonara') celebT = this.now(); this.event(name); });
    wrap('celebrate', (k = 0.8, big = false) => { if (this.now() - celebT > 1) this.event(big ? 'hr' : 'score'); celebT = this.now(); });
  }

  // ---------------------------------------------------------------- 毎フレーム
  update(cam, dt) {
    const d = this.defense && this.defense(), w = this.watch && this.watch();
    const game = !!(d && d.active && d.g && (d.kind === 'game' || d.kind === 'knock') && (this.mode() === 'defense' || (w && w.on)));
    const want = game && !NO_BENCH;
    if (want && !this.built && !this.failed) this.build();
    this.on = want && this.built && this.sides.length > 0;
    this.group.visible = this.on;
    if (this.ondeck) this.ondeck.root.visible = false;
    if (!this.on) return;
    const knock = d.kind === 'knock';
    const U = this.U, t = this.now();
    U.uT.value = t; U.uMode.value = knock ? 1 : 0;
    this.atk = d.g.half === 'bottom' ? 1 : -1;
    U.uAtk.value = knock ? 0 : this.atk;
    const q = this.getQuality ? this.getQuality() : 'std';
    const nearR = q === 'ultra' ? 60 : q === 'std' ? 45 : q === 'min' ? 22 : 30;
    const cap = q === 'min' ? 7 : q === 'lite' ? 10 : 99;
    const sk = (schoolOf({ side: 'home' }).key || '') + (schoolOf({ side: 'away' }).key || '');
    if (sk !== this._sk) { if (this._sk !== undefined) this.recolor(); this._sk = sk; }
    for (const side of this.sides) {
      const n = Math.min(cap, side.people.length);
      side.near.geometry.instanceCount = n; side.far.geometry.instanceCount = n;
      const isNear = cam.position.distanceTo(side.L.center) < nearR;
      side.near.visible = isNear; side.far.visible = !isNear;
    }
    // ネクストバッターズサークルの素振り(攻める側。ノックでは出さない)
    const od = this.ondeck, side = this.sides.find((q2) => q2.s === this.atk);
    const odFar = side && side.ondeck ? Math.hypot(cam.position.x - side.ondeck.x, cam.position.z - side.ondeck.z) : 0;
    if (od && !knock && side && side.ondeck && !(w && w.sei && w.sei.on) && !(q === 'min' && odFar > 30) && odFar < (q === 'lite' ? 70 : 110)) {   // スマホのいちばん下の段・遠くでは素振りの人を描かない(遠くの形でも 13 回の描画)
      const p = side.ondeck;
      od.root.visible = true;
      od.root.position.set(p.x, p.y, p.z);
      const want2 = this.atk > 0 ? 'home' : 'away';
      if (od.kit.side !== want2) { od.kit = { ...od.kit, side: want2 }; if (od.dress) od.dress(); od.setNumber(String(10 + ((this.atk > 0 ? 7 : 3) + Math.floor(t / 300)) % 50)); }
      // 本塁の方(投手の方)へ振る向き
      const wx = -p.x * 0.6, wz = -18 - p.z, r = Math.atan2(-wx, -wz) - Math.PI / 2;
      od.root.rotation.y = r;
      const cyc = 5.2, u = (t % cyc);
      if (u < 3.4) od.set('bat', {});
      else od.set('swing', { t: Math.min(1.25, (u - 3.4) * 0.8), u: Math.min(1, (u - 3.4) / 1.5) });
    }
  }
}
