// 投手: CC0 のリグ付き人体 (Quaternius Universal Base Characters) を
// 自前の姿勢ソルバー (体幹はオイラー角、手足は 2 骨 IK) とキーフレームで動かす。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { groundHeight, MOUND_TOP, RUBBER_FRONT_Z, drawBird } from './stadium.js';

const MODEL_H = 1.81;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const _m0 = new THREE.Matrix4(), _m1 = new THREE.Matrix4();

function eulerQ(p, y, r, out = new THREE.Quaternion()) {
  _e.set(p * Math.PI / 180, y * Math.PI / 180, r * Math.PI / 180, 'YXZ');
  return out.setFromEuler(_e);
}
// (a0,h0) を (a1,h1) へ写す回転
function frameAlign(a0, h0, a1, h1, out) {
  const A0 = a0.clone().normalize(), A1 = a1.clone().normalize();
  const H0 = h0.clone().sub(A0.clone().multiplyScalar(h0.dot(A0))).normalize();
  const H1 = h1.clone().sub(A1.clone().multiplyScalar(h1.dot(A1))).normalize();
  const C0 = A0.clone().cross(H0), C1 = A1.clone().cross(H1);
  _m0.makeBasis(A0, H0, C0);
  _m1.makeBasis(A1, H1, C1);
  _m0.transpose();
  _m1.multiply(_m0);
  return out.setFromRotationMatrix(_m1);
}
// 2 骨 IK: 根元 A、目標 T、膝/肘を向ける点 P → 中間点 B と先端 C
function solve2(A, T, P, l1, l2) {
  const d = T.clone().sub(A);
  let dist = d.length();
  const u = d.normalize();
  dist = Math.min(Math.max(dist, Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.9985);
  let w = P.clone().sub(A);
  w.sub(u.clone().multiplyScalar(w.dot(u)));
  if (w.lengthSq() < 1e-8) w = new THREE.Vector3(0, 0, 1).sub(u.clone().multiplyScalar(u.z));
  w.normalize();
  const ca = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const al = Math.acos(Math.max(-1, Math.min(1, ca)));
  const B = A.clone().add(u.clone().multiplyScalar(l1 * Math.cos(al))).add(w.clone().multiplyScalar(l1 * Math.sin(al)));
  const C = A.clone().add(u.clone().multiplyScalar(dist));
  return { B, C };
}

// ---- ユニフォーム -------------------------------------------------------
export function makeUniformDecal(team, number, backName) {
  const W = 1024, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  // 左半分: 胸 (チーム名 + 番号)、右半分: 背中 (名前 + 大きな番号)
  x.save();
  x.translate(256, 0);
  x.fillStyle = team.text || '#eef3ff';
  x.strokeStyle = team.accent; x.lineWidth = 10; x.lineJoin = 'round';
  x.font = 'italic 900 92px "Arial Black", Arial, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.save(); x.translate(0, 196); x.rotate(-0.06);
  x.strokeText(team.en, 0, 0); x.fillText(team.en, 0, 0);
  x.restore();
  x.font = 'bold 96px "Arial Black", Arial, sans-serif';
  x.strokeText(String(number), 92, 330); x.fillText(String(number), 92, 330);
  x.restore();
  x.save();
  x.translate(768, 0);
  x.fillStyle = team.text || '#eef3ff'; x.strokeStyle = team.accent; x.lineWidth = 12;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 64px Arial, sans-serif';
  x.fillText(backName, 0, 120);
  x.font = 'bold 230px "Arial Black", Arial, sans-serif';
  x.strokeText(String(number), 0, 300); x.fillText(String(number), 0, 300);
  x.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeCapTexture(team) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = team.cap; x.fillRect(0, 0, 256, 256);
  // 球面の UV で正面 (u=0.75 付近) に鳥の印
  drawBird(x, 192, 70, 70, team.logo || '#f0f4ff');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---- 体の領域ごとの色分け (バインド姿勢の位置からフラグメントごとに決める) ----
function classify(geo) {
  geo.setAttribute('bindPos', geo.attributes.position.clone());
  geo.setAttribute('bindNor', geo.attributes.normal.clone());
}

function uniformMaterial(baseMat, team, decal, rig) {
  const m = new THREE.MeshStandardMaterial({ map: baseMat.map, roughness: 0.8, metalness: 0 });
  const col = (h) => new THREE.Color(h);
  const U = {
    cJersey: { value: col(team.jersey) }, cBelt: { value: col(team.belt || '#1a2236') },
    cPants: { value: col(team.pants || '#eceef2') }, cShoe: { value: col(team.shoe || '#14161c') },
    cTrim: { value: col(team.accent) }, cUnder: { value: col(team.under || team.jersey) }, cPipe: { value: col(team.pipe || team.jersey) },
    cSock: { value: col(team.sock || team.jersey) },
    cSole: { value: col('#e4e4e4') }, decal: { value: decal },
    shX: { value: rig.shoulderX }, wrX: { value: rig.wristX },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 bindPos; attribute vec3 bindNor;
varying vec3 vBP; varying vec3 vBN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vBP = bindPos; vBN = bindNor;
// 服はふくらませる (体の線をやわらげる)
{ float ax = abs(bindPos.x); float infl = 0.0;
  // 高校生の体つきに: 肩・胸を細く、胸の厚みを薄く、腕を細く(骨は動かさず、形だけ)
  bool armV = ax > 0.24 && bindPos.y > 1.3;
  if (armV) {
    vec2 c = vec2(1.435, -0.05);
    vec2 d = vec2(transformed.y, transformed.z) - c;
    float k = mix(0.86, 0.8, smoothstep(0.3, 0.6, ax));
    transformed.y = c.x + d.x * k; transformed.z = c.y + d.y * k;
  } else if (bindPos.y > 1.02 && bindPos.y < 1.62) {
    float u = smoothstep(1.02, 1.3, bindPos.y);
    transformed.x *= mix(1.0, 0.9, u);
    transformed.z = -0.02 + (transformed.z + 0.02) * mix(1.0, 0.86, u);
  }
  // ユニフォームはゆったり(体の線がそのまま出ない)、ズボンも少し太め
  if (bindPos.y < 0.95 && bindPos.y > 0.17) infl = 0.03;
  else if (bindPos.y >= 0.95 && bindPos.y < 1.47 && !(ax > 0.66)) infl = 0.03 + 0.012 * (1.0 - smoothstep(0.95, 1.15, bindPos.y));
  if (ax > 0.19 && bindPos.y > 1.2 && ax < 0.66) infl = 0.022;
  transformed += normal * infl; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 cJersey, cBelt, cPants, cShoe, cTrim, cUnder, cPipe, cSock, cSole; uniform sampler2D decal; uniform float shX, wrX;
varying vec3 vBP; varying vec3 vBN;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec3 p = vBP; float ax = abs(p.x);
vec3 cc = cJersey; float cloth = 1.0;
bool arm = ax > 0.19 && p.y > 1.22;
if (arm) {
  if (ax > wrX) cloth = 0.0;
  else if (ax > shX + 0.2) cc = cUnder;
  else if (ax > shX + 0.18) cc = cTrim;
  else cc = cJersey;
} else {
  // 襟ぐり (前は浅い V)
  float neckY = 1.492 - (p.z > 0.0 ? 0.055 * max(0.0, 1.0 - ax / 0.075) : 0.0);
  if (p.y > neckY) cloth = 0.0;
  else if (p.y > neckY - 0.013) cc = cTrim;
  else if (p.y > 1.0) cc = cJersey;
  else if (p.y > 0.974) cc = cBelt;   // ベルトは細く(後ろから見て黒い帯が太く見えないように)
  else if (p.y > 0.2) {
    cc = cPants;
    float zc = -0.035 - (0.95 - p.y) * 0.03;
    float ang = atan(p.z - zc, ax - 0.112);
    if (abs(ang) < 0.11 + (p.y < 0.5 ? 0.04 : 0.0)) cc = cPipe;
  }
  else if (p.y > 0.07) cc = cSock;
  else if (p.y > 0.022) cc = cShoe;
  else cc = cSole;
}
// 胸と背中の文字
if (!arm && p.y > 1.0 && p.y < 1.48 && ax < 0.24) {
  if (vBN.z > 0.25) {
    vec2 uv = vec2(0.25 + p.x / 0.48 * 0.5, (p.y - 1.02) / 0.46);
    vec4 d = texture2D(decal, uv); cc = mix(cc, d.rgb, d.a * step(0.0, uv.y));
  } else if (vBN.z < -0.25) {
    vec2 uv = vec2(0.75 - p.x / 0.48 * 0.5, (p.y - 1.02) / 0.46);
    vec4 d = texture2D(decal, uv); cc = mix(cc, d.rgb, d.a * step(0.0, uv.y));
  }
}
// 布のむら
float wr = 0.95 + 0.05 * sin(p.x * 70.0 + p.y * 11.0) * sin(p.y * 27.0 + p.z * 33.0);
if (cloth > 0.5) diffuseColor.rgb = cc * wr;`);
  };
  m.customProgramCacheKey = () => 'uniform-v6';
  return m;
}

// ---- 帽子とグラブ --------------------------------------------------------
function makeCap(team) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: makeCapTexture(team), roughness: 0.7 });
  // 深くかぶる(後頭部の下・耳の上まで覆う)
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.112, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.66), mat);
  crown.scale.set(1.08, 0.98, 1.16);
  crown.position.y = -0.012;
  g.add(crown);
  // うなじの陰(帽子のふちの内側を暗く)
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.106, 0.1, 0.05, 20, 1, true, Math.PI * 0.6, Math.PI * 0.8), new THREE.MeshBasicMaterial({ color: 0x14100c, side: THREE.DoubleSide }));
  shade.position.set(0, -0.058, -0.012); shade.scale.set(1.05, 1, 1.1);
  g.add(shade);
  const brimGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.012, 24, 1, false, -Math.PI * 0.5, Math.PI);
  const brim = new THREE.Mesh(brimGeo, new THREE.MeshStandardMaterial({ color: team.cap, roughness: 0.7 }));
  brim.scale.set(1.0, 1, 1.0);
  brim.position.set(0, -0.004, 0.085); brim.rotation.x = 0.2;
  g.add(brim);
  const btn = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), mat);
  btn.position.y = 0.098; g.add(btn);
  return g;
}
function makeGlove() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x17130f, roughness: 0.55, metalness: 0.05 });
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), mat);
  palm.scale.set(0.62, 1.2, 0.36);
  palm.position.set(0, 0.11, 0.0);
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.12, 4, 8), mat);
    f.position.set(-0.04 + i * 0.027, 0.22, 0.0); f.rotation.z = (i - 1.5) * 0.08;
    g.add(f);
  }
  const web = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.012), mat);
  web.position.set(0.06, 0.2, 0); g.add(web);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.1, 4, 8), mat);
  thumb.position.set(0.08, 0.12, 0.0); thumb.rotation.z = -0.5; g.add(thumb);
  const lace = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.004, 4, 16), new THREE.MeshStandardMaterial({ color: 0xb08a50 }));
  lace.position.set(0, 0.06, 0.035); g.add(lace);
  return g;
}

// ---- 投手のリグ ---------------------------------------------------------
let _gltfPromise = null;
export function loadPitcherAsset() {
  if (!_gltfPromise) _gltfPromise = new GLTFLoader().loadAsync('models/pitcher.gltf');
  return _gltfPromise;
}

export class PitcherRig {
  constructor(gltf, cloneFn) {
    this.root = new THREE.Group();
    const sc = cloneFn ? cloneFn(gltf.scene) : gltf.scene;
    this.model = sc;
    this.root.add(sc);
    this.bones = {};
    sc.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    this.body = null;
    sc.traverse((o) => { if (o.isSkinnedMesh && o.name.indexOf('SuperHero') >= 0) this.body = o; });
    if (!this.body) sc.traverse((o) => { if (o.isSkinnedMesh && !this.body && o.geometry.attributes.position.count > 3000) this.body = o; });
    this.root.updateMatrixWorld(true);
    // バインド姿勢を記録
    this.bind = {};
    for (const [name, b] of Object.entries(this.bones)) {
      this.bind[name] = { q: b.getWorldQuaternion(new THREE.Quaternion()), p: b.getWorldPosition(V()) };
    }
    const P = (n) => this.bind[n].p;
    this.len = {
      thigh: P('thigh_l').distanceTo(P('calf_l')), calf: P('calf_l').distanceTo(P('foot_l')),
      upper: P('upperarm_l').distanceTo(P('lowerarm_l')), lower: P('lowerarm_l').distanceTo(P('hand_l')),
    };
    this.ankleH = P('foot_l').y;
    this.shoulderX = Math.abs(P('upperarm_l').x);
    this.elbowX = Math.abs(P('lowerarm_l').x);
    this.wristX = Math.abs(P('hand_l').x) + 0.02;
    this.leftSign = Math.sign(P('upperarm_l').x); // モデルの左が +x なら 1
    // 骨の向き (バインド)
    const dir = (a, b) => P(b).clone().sub(P(a)).normalize();
    this.bdir = {
      thigh_l: dir('thigh_l', 'calf_l'), calf_l: dir('calf_l', 'foot_l'), thigh_r: dir('thigh_r', 'calf_r'), calf_r: dir('calf_r', 'foot_r'),
      upperarm_l: dir('upperarm_l', 'lowerarm_l'), lowerarm_l: dir('lowerarm_l', 'hand_l'),
      upperarm_r: dir('upperarm_r', 'lowerarm_r'), lowerarm_r: dir('lowerarm_r', 'hand_r'),
    };
    // 関節の曲がる軸 (バインド)
    const ls = this.leftSign;
    this.hinge = { leg: V(1, 0, 0), arm_l: V(0, -ls, 0), arm_r: V(0, ls, 0) };
    this.scale = 1;
    this.hand = 1;
  }

  dress(team, number, backName) {
    if (!this.body) return;
    const geo = this.body.geometry;
    if (!geo.attributes.bindPos) classify(geo);
    const key = `${team.en}|${number}|${backName}`;
    if (this._dressKey === key) return; // 同じ投手なら作り直さない
    this._dressKey = key;
    const disposeTree = (o) => o && o.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); const ms = Array.isArray(m.material) ? m.material : [m.material]; ms.forEach((x) => { if (x.map) x.map.dispose(); x.dispose(); }); } });
    const decal = makeUniformDecal(team, number, backName);
    if (this._decal) this._decal.dispose();
    this._decal = decal;
    const oldMat = this.body.material;
    this.body.material = uniformMaterial(this._baseMat || (this._baseMat = this.body.material), team, decal, this);
    if (oldMat !== this._baseMat && oldMat !== this.body.material) oldMat.dispose();
    // 帽子 (頭の骨に付ける)
    if (this.cap) { this.cap.parent.remove(this.cap); disposeTree(this.cap); }
    this.cap = makeCap(team);
    const head = this.bones.Head;
    head.add(this.cap);
    this._placeOnBone(this.cap, head, V(0, 1.735, 0.012), V(0, 0, 1), V(0, 1, 0));
    this.cap.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    // グラブ (投げない側の手)
    if (this.glove) { this.glove.parent.remove(this.glove); disposeTree(this.glove); }
    this.glove = makeGlove();
    this.glove.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this._attachGlove();
  }

  // 骨のバインド姿勢を基準に、モデル空間の位置・向きで物を付ける
  _placeOnBone(obj, bone, posModel, fwdModel, upModel) {
    const bq = this.bind[bone.name].q, bp = this.bind[bone.name].p;
    const inv = bq.clone().invert();
    obj.position.copy(posModel.clone().sub(bp).applyQuaternion(inv));
    const m = new THREE.Matrix4().lookAt(V(), fwdModel, upModel);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    // lookAt は -z を前にするので反転
    const flip = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI);
    obj.quaternion.copy(inv.multiply(q).multiply(flip));
  }

  _attachGlove() {
    const gloveSide = this.hand === 1 ? 'l' : 'r';
    const hb = this.bones['hand_' + gloveSide];
    hb.add(this.glove);
    const s = gloveSide === 'l' ? this.leftSign : -this.leftSign;
    const hp = this.bind['hand_' + gloveSide].p;
    // 手のひらは下、指は外へ (バインドの T ポーズ)
    this._placeOnBone(this.glove, hb, V(hp.x + s * 0.06, hp.y - 0.01, hp.z), V(0, -1, 0), V(s, 0, 0));
    this.glove.scale.setScalar(1.05);
    const ball = this.bones['hand_' + (gloveSide === 'l' ? 'r' : 'l')];
    this.throwHand = ball;
    const bp = this.bind[ball.name].p;
    const so = -s;
    this.ballLocal = V(bp.x + so * 0.085, bp.y - 0.025, bp.z + 0.01).sub(bp).applyQuaternion(this.bind[ball.name].q.clone().invert());
  }

  setHand(hand) {
    if (this.hand === hand) return;
    this.hand = hand;
    if (this.glove) { this.glove.parent.remove(this.glove); this._attachGlove(); }
  }

  setHeight(h) {
    this.scale = h / MODEL_H;
    this.root.scale.setScalar(this.scale);
  }

  // ボールの位置 (ワールド)
  ballWorld(out = V()) {
    out.copy(this.ballLocal);
    return this.throwHand.localToWorld(out);
  }

  _setWorldQ(bone, qPose) {
    const parentQ = bone.parent.getWorldQuaternion(_q2);
    const rq = this.root.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(parentQ.invert().multiply(rq.multiply(qPose)));
    bone.updateMatrixWorld(true);
  }
  _poseToWorld(p) { return this.root.localToWorld(V(p[0], p[1], p[2])); }
  _jointPose(name) { return this.root.worldToLocal(this.bones[name].getWorldPosition(V())); }

  // モーションキャプチャの姿勢を当てる (mocap.js の sample の結果)
  applyMocap(P) {
    const B = this.bones, bind = this.bind, sc = this.scale;
    if (!this._mc) {
      const bp = bind.pelvis.p, hl = bind.thigh_l.p, hr = bind.thigh_r.p;
      this._mc = {
        pelOff: bp.clone().sub(hl.clone().add(hr).multiplyScalar(0.5)),
        handDir: { l: bind.middle_01_l.p.clone().sub(bind.hand_l.p).normalize(), r: bind.middle_01_r.p.clone().sub(bind.hand_r.p).normalize() },
      };
    }
    const M = this._mc;
    const ground = (x, z) => (groundHeight(this.root.position.x + x * sc, this.root.position.z + z * sc) - this.root.position.y) / sc;
    // 骨盤: 股関節の中点を合わせる。前足が坂の下へ着く分だけ腰も少し下げる
    const lead = this.hand === 1 ? 'al' : 'ar';
    const drop = Math.min(0, ground(P[lead].x, P[lead].z)) * 0.55;
    const hip = P.hip.clone(); hip.y += drop;
    const Qp = P.qp, Qt = P.qt;
    const pel = B.pelvis;
    pel.position.copy(pel.parent.worldToLocal(this._poseToWorld(hip.clone().add(M.pelOff.clone().applyQuaternion(Qp)).toArray())));
    this._setWorldQ(pel, Qp.clone().multiply(bind.pelvis.q));
    const fr = [0.3, 0.65, 1.0];
    ['spine_01', 'spine_02', 'spine_03'].forEach((n, i) => {
      this._setWorldQ(B[n], Qp.clone().slerp(Qt, fr[i]).multiply(bind[n].q));
    });
    // 頭は本塁 (捕手) を見続ける
    const headP = this._jointPose('Head');
    const tgt = this.root.worldToLocal(V(0, 0.95, -0.3));
    const want = tgt.sub(headP).normalize();
    const fwd = V(0, 0, 1).applyQuaternion(Qt);
    const look = new THREE.Quaternion().setFromUnitVectors(fwd, want);
    const Dh = new THREE.Quaternion().slerp(look, P.look != null ? P.look : 0.85).multiply(Qt);
    this._setWorldQ(B.neck_01, Qt.clone().slerp(Dh, 0.45).multiply(bind.neck_01.q));
    this._setWorldQ(B.Head, Dh.clone().multiply(bind.Head.q));
    // 鎖骨: 腕を上げると少し上がる
    for (const side of ['l', 'r']) {
      const u = P['u' + side];
      const lift = Math.max(0, Math.min(1, (u.y + 0.2) / 1.0)) * 16;
      const sgn = side === 'l' ? 1 : -1;
      const ax = V(0, 0, 1).applyQuaternion(Qt);
      this._setWorldQ(B['clavicle_' + side], new THREE.Quaternion().setFromAxisAngle(ax, sgn * lift * Math.PI / 180).multiply(Qt).multiply(bind['clavicle_' + side].q));
    }
    // 腕: 骨の向きをそのまま、モデルの骨の長さで
    for (const side of ['l', 'r']) {
      const A = this._jointPose('upperarm_' + side);
      const Bk = A.clone().add(P['u' + side].clone().multiplyScalar(this.len.upper));
      const C = Bk.clone().add(P['f' + side].clone().multiplyScalar(this.len.lower));
      let h1 = Bk.clone().sub(A).cross(C.clone().sub(Bk));
      if (h1.lengthSq() < 1e-6) h1 = this._lastH && this._lastH[side] ? this._lastH[side].clone() : V(0, side === 'l' ? -1 : 1, 0);
      h1.normalize();
      (this._lastH || (this._lastH = {}))[side] = h1.clone();
      const h0 = this.hinge['arm_' + side];
      const qU = frameAlign(this.bdir['upperarm_' + side], h0, Bk.clone().sub(A), h1, new THREE.Quaternion());
      this._setWorldQ(B['upperarm_' + side], qU.multiply(bind['upperarm_' + side].q));
      const qL = frameAlign(this.bdir['lowerarm_' + side], h0, C.clone().sub(Bk), h1, new THREE.Quaternion());
      this._setWorldQ(B['lowerarm_' + side], qL.clone().multiply(bind['lowerarm_' + side].q));
      // 手首: 手の向き (指の付け根への向き) に合わせる
      const hd = P['h' + side];
      const qH = frameAlign(M.handDir[side], h0, hd, h1, new THREE.Quaternion());
      this._setWorldQ(B['hand_' + side], qH.multiply(bind['hand_' + side].q));
    }
    // 脚: 足首の位置を坂に合わせ、膝の向きで IK
    for (const side of ['l', 'r']) {
      const A = this._jointPose('thigh_' + side);
      const T = P['a' + side].clone();
      T.y += ground(T.x, T.z);
      const K = P['k' + side].clone(); K.y += drop;
      const { B: Bk, C } = solve2(A, T, K, this.len.thigh, this.len.calf);
      const h1 = Bk.clone().sub(A).cross(C.clone().sub(Bk)).normalize();
      const qT = frameAlign(this.bdir['thigh_' + side], this.hinge.leg, Bk.clone().sub(A), h1, new THREE.Quaternion());
      this._setWorldQ(B['thigh_' + side], qT.multiply(bind['thigh_' + side].q));
      const qC = frameAlign(this.bdir['calf_' + side], this.hinge.leg, C.clone().sub(Bk), h1, new THREE.Quaternion());
      this._setWorldQ(B['calf_' + side], qC.multiply(bind['calf_' + side].q));
      // 足の向き: 立ったときのつま先の向き → 今のつま先の向き
      const toe = P['t' + side].clone();
      const Df = new THREE.Quaternion().setFromUnitVectors(P.toeRest, toe);
      this._setWorldQ(B['foot_' + side], Df.clone().multiply(bind['foot_' + side].q));
      // 地面に着いている間はつま先を地面に沿わせる
      const flat = toe.clone(); flat.y = Math.max(flat.y, P.toeRest.y); flat.normalize();
      const Dt = P['c' + side] ? new THREE.Quaternion().setFromUnitVectors(P.toeRest, flat) : Df;
      this._setWorldQ(B['ball_' + side], Dt.multiply(bind['ball_' + side].q));
    }
  }

  // 姿勢を当てる。P は投げる腕が右 (モデルの -x 側) の右投手の形で書き、左投手は mirror 済みで渡す
  apply(P) {
    const B = this.bones, bind = this.bind;
    const ls = this.leftSign;
    // 骨盤
    const Dp = eulerQ(P.pelvis.r[0], P.pelvis.r[1], P.pelvis.r[2]);
    const pel = B.pelvis;
    pel.position.copy(pel.parent.worldToLocal(this._poseToWorld(P.pelvis.p)));
    this._setWorldQ(pel, Dp.clone().multiply(bind.pelvis.q));
    // 体幹 (3 つの背骨に分ける)
    const Dt = eulerQ(P.trunk[0], P.trunk[1], P.trunk[2]);
    const fr = [0.3, 0.65, 1.0];
    const Ds = [];
    ['spine_01', 'spine_02', 'spine_03'].forEach((n, i) => {
      const part = new THREE.Quaternion().slerp(Dt, fr[i]);
      const D = Dp.clone().multiply(part);
      Ds.push(D);
      this._setWorldQ(B[n], D.clone().multiply(bind[n].q));
    });
    const D3 = Ds[2];
    this.trunkQ = D3.clone();
    // 首と頭: 本塁の方を見る
    const headP = this._jointPose('Head');
    const tgt = this.root.worldToLocal(V(0, 0.95, -0.3));
    const want = tgt.sub(headP).normalize();
    const fwd = V(0, 0, 1).applyQuaternion(D3);
    const look = new THREE.Quaternion().setFromUnitVectors(fwd, want);
    const lim = P.look != null ? P.look : 0.9;
    const Dh = new THREE.Quaternion().slerp(look, lim).multiply(D3);
    const Dn = D3.clone().slerp(Dh, 0.45);
    this._setWorldQ(B.neck_01, Dn.clone().multiply(bind.neck_01.q));
    this._setWorldQ(B.Head, Dh.clone().multiply(bind.Head.q));
    // 鎖骨 (腕を上げると少し上がる)
    for (const side of ['l', 'r']) {
      const arm = P.arms[side];
      const lift = arm.clav || 0;
      const sgn = (side === 'l' ? ls : -ls);
      const ax = V(0, 0, 1).applyQuaternion(D3);
      const cq = new THREE.Quaternion().setFromAxisAngle(ax, -sgn * lift * Math.PI / 180).multiply(D3);
      this._setWorldQ(B['clavicle_' + side], cq.multiply(bind['clavicle_' + side].q));
    }
    // 腕 (体幹の座標で書いた手先を IK)
    const tr = V(-1, 0, 0).applyQuaternion(D3).multiplyScalar(ls), tu = V(0, 1, 0).applyQuaternion(D3), tf = V(0, 0, 1).applyQuaternion(D3);
    // tr はモデルの「右」(ls=1 のとき -x)
    const sc = this.scale;
    for (const side of ['l', 'r']) {
      const arm = P.arms[side];
      const A = this._jointPose('upperarm_' + side);
      const off = (o) => A.clone().add(tr.clone().multiplyScalar(o[0])).add(tu.clone().multiplyScalar(o[1])).add(tf.clone().multiplyScalar(o[2]));
      const T = off(arm.hand), Pp = off(arm.elbow);
      const { B: Bk, C } = solve2(A, T, Pp, this.len.upper, this.len.lower);
      const h1 = Bk.clone().sub(A).cross(C.clone().sub(Bk)).normalize();
      // 腕の曲がる向きは体の左右で逆
      const h0 = this.hinge['arm_' + side];
      const qU = frameAlign(this.bdir['upperarm_' + side], h0, Bk.clone().sub(A), h1, new THREE.Quaternion());
      this._setWorldQ(B['upperarm_' + side], qU.multiply(bind['upperarm_' + side].q));
      const qL = frameAlign(this.bdir['lowerarm_' + side], h0, C.clone().sub(Bk), h1, new THREE.Quaternion());
      const Dl = qL.clone();
      this._setWorldQ(B['lowerarm_' + side], qL.multiply(bind['lowerarm_' + side].q));
      // 手首
      const wq = eulerQ(arm.wrist ? arm.wrist[0] : 0, arm.wrist ? arm.wrist[1] : 0, arm.wrist ? arm.wrist[2] : 0);
      this._setWorldQ(B['hand_' + side], Dl.multiply(wq).multiply(bind['hand_' + side].q));
    }
    // 脚 (足首の位置を IK)
    for (const side of ['l', 'r']) {
      const L = P.legs[side];
      const A = this._jointPose('thigh_' + side);
      const T = V(L.p[0], L.p[1], L.p[2]);
      if (L.ground) {
        const gx = this.root.position.x + T.x * sc, gz = this.root.position.z + T.z * sc;
        const gy = (groundHeight(gx, gz) - this.root.position.y) / sc;
        T.y = gy + this.ankleH + L.p[1] + Math.max(0, Math.sin((L.pitch || 0) * Math.PI / 180)) * 0.13;
      }
      const Pk = V(L.knee[0], L.knee[1], L.knee[2]);
      const { B: Bk, C } = solve2(A, T, Pk, this.len.thigh, this.len.calf);
      const h1 = Bk.clone().sub(A).cross(C.clone().sub(Bk)).normalize();
      const qT = frameAlign(this.bdir['thigh_' + side], this.hinge.leg, Bk.clone().sub(A), h1, new THREE.Quaternion());
      this._setWorldQ(B['thigh_' + side], qT.multiply(bind['thigh_' + side].q));
      const qC = frameAlign(this.bdir['calf_' + side], this.hinge.leg, C.clone().sub(Bk), h1, new THREE.Quaternion());
      this._setWorldQ(B['calf_' + side], qC.multiply(bind['calf_' + side].q));
      const Df = eulerQ(L.pitch || 0, L.yaw || 0, L.roll || 0);
      this._setWorldQ(B['foot_' + side], Df.clone().multiply(bind['foot_' + side].q));
      // つま先は地面に沿わせる
      const toe = B['ball_' + side];
      const Dtoe = eulerQ(L.toe != null ? L.toe : Math.min(0, -(L.pitch || 0) * 0.9) + (L.pitch || 0), L.yaw || 0, 0);
      this._setWorldQ(toe, Dtoe.multiply(bind['ball_' + side].q));
    }
  }
}

// ---- 投球フォーム (キーフレーム) -----------------------------------------
// 右投手で書く。モデル座標: 投手の右 = -x、本塁 = +z、y = 上 (投手板の前の上面が原点)
// arms の hand/elbow は肩からのずれを体幹の向きで [右, 上, 前] (m) と書く。
// legs の p は足首 (ground=true なら y は地面からの浮き)。
const STAND = 0.0;
function K(t, o) { return { t, ...o }; }

export function buildDelivery(style) {
  const slot = style.slot;          // 'over' | 'three' | 'side'
  const tempo = style.tempo || 1;   // 大きいほどゆったり
  const quick = !!style.quick;
  const kick = style.kick || 1;     // 足の上げ方
  // 腕の角度 (真上からの傾き)
  const slotDeg = slot === 'over' ? 22 : slot === 'side' ? 80 : 46;
  const sr = slotDeg * Math.PI / 180;
  const relDir = [Math.sin(sr) * 0.72, Math.cos(sr) * 0.72, 0.5];
  const nrm = Math.hypot(...relDir);
  const rel = relDir.map((v) => v / nrm * 0.52);
  // 体の傾き (オーバーはグラブ側へ大きく倒す、サイドは腕の側へ)
  // ロールは + で腕の側へ倒れるので、グラブ側へ倒すときは負
  const tilt = -(slot === 'over' ? 11 : slot === 'side' ? -16 : 0);
  const sideDrop = slot === 'side' ? 0.06 : 0;

  const setArms = {
    r: { hand: [-0.2, -0.3, 0.26], elbow: [0.25, -0.5, 0.0], wrist: [0, 0, 0] },
    l: { hand: [0.24, -0.28, 0.27], elbow: [-0.3, -0.5, 0.0], wrist: [0, 0, 0] },
  };
  const ankle = (x, z, o = {}) => ({ p: [x, o.lift || 0, z], ground: o.air ? false : true, yaw: o.yaw || 0, pitch: o.pitch || 0, knee: o.knee });
  const air = (x, y, z, o = {}) => ({ p: [x, y, z], ground: false, yaw: o.yaw || 0, pitch: o.pitch || 0, knee: o.knee });

  const keys = [];
  // 0: セット (体は三塁側を向く、左肩が本塁)
  keys.push(K(0, {
    pelvis: { p: [0.0, 0.925, 0.3], r: [4, -90, 0] }, trunk: [6, 0, 0],
    legs: { r: ankle(0.0, 0.07, { yaw: -90, knee: [-0.8, 0.5, 0.07] }), l: ankle(0.02, 0.6, { yaw: -72, knee: [-0.8, 0.5, 0.6] }) },
    arms: setArms,
  }));
  if (!quick) {
    // 1: 足を上げる
    keys.push(K(0.30, {
      pelvis: { p: [0.0, 0.94, 0.24], r: [2, -98, 2] }, trunk: [2, -4, 0],
      legs: { r: ankle(0.0, 0.07, { yaw: -90, knee: [-0.8, 0.5, 0.07] }), l: air(-0.12, 0.38 * kick, 0.3, { yaw: -100, pitch: 24, knee: [-0.9, 1.2, 0.3] }) },
      arms: { r: { hand: [-0.2, -0.24, 0.26], elbow: [0.25, -0.5, 0.0] }, l: { hand: [0.24, -0.22, 0.27], elbow: [-0.3, -0.5, 0.0] } },
    }));
    keys.push(K(0.46, {
      pelvis: { p: [0.0, 0.95, 0.22], r: [0, -108, 3] }, trunk: [-2, -8, 0],
      legs: { r: ankle(0.0, 0.07, { yaw: -90, knee: [-0.8, 0.5, 0.07] }), l: air(-0.16, 0.58 * kick, 0.2, { yaw: -112, pitch: 30, knee: [-0.9, 1.4, 0.24] }) },
      arms: { r: { hand: [-0.18, -0.2, 0.27], elbow: [0.25, -0.5, 0.0] }, l: { hand: [0.24, -0.18, 0.28], elbow: [-0.3, -0.5, 0.0] } },
    }));
    // 2: ため (膝が最も高い → 腰から本塁へ動き出す)
    keys.push(K(0.58, {
      pelvis: { p: [0.0, 0.93, 0.32], r: [-2, -106, 4] }, trunk: [-2, -8, 0],
      legs: { r: ankle(0.0, 0.07, { yaw: -90, pitch: 0, knee: [-0.8, 0.45, 0.1] }), l: air(-0.14, 0.52 * kick, 0.36, { yaw: -108, pitch: 30, knee: [-0.9, 1.3, 0.5] }) },
      arms: { r: { hand: [-0.12, -0.26, 0.24], elbow: [0.3, -0.5, 0.0] }, l: { hand: [0.2, -0.22, 0.27], elbow: [-0.3, -0.5, 0.0] } },
    }));
  } else {
    keys.push(K(0.16, {
      pelvis: { p: [0.0, 0.92, 0.34], r: [2, -95, 2] }, trunk: [2, -4, 0],
      legs: { r: ankle(0.0, 0.07, { yaw: -90, knee: [-0.8, 0.45, 0.07] }), l: air(-0.04, 0.16, 0.46, { yaw: -90, pitch: 10, knee: [-0.9, 0.8, 0.6] }) },
      arms: { r: { hand: [-0.14, -0.28, 0.24], elbow: [0.25, -0.5, 0.0] }, l: { hand: [0.22, -0.24, 0.27], elbow: [-0.3, -0.5, 0.0] } },
    }));
  }
  const t0 = quick ? 0.16 : 0.58;
  const S = (dt) => t0 + dt * (quick ? 0.72 : 1);
  // 3: 踏み出す (手が割れて腕が下から上へ)
  keys.push(K(S(0.16), {
    pelvis: { p: [0.0, 0.88, 0.62], r: [0, -100, 0] }, trunk: [0, -10, -3],
    legs: { r: ankle(0.0, 0.07, { yaw: -90, pitch: 4, knee: [-0.8, 0.4, 0.2] }), l: air(-0.1, 0.3, 0.98, { yaw: -70, pitch: 14, knee: [-0.6, 0.9, 1.4] }) },
    arms: { r: { hand: [0.25, -0.42, -0.02], elbow: [0.4, -0.2, -0.2], wrist: [0, 0, 0] }, l: { hand: [-0.12, -0.05, 0.36], elbow: [-0.2, -0.3, 0.2] } },
  }));
  keys.push(K(S(0.27), {
    pelvis: { p: [-0.02, 0.84, 0.82], r: [3, -92, -3] }, trunk: [0, -12, -4],
    legs: { r: ankle(0.0, 0.07, { yaw: -88, pitch: 12, knee: [-0.8, 0.35, 0.4] }), l: air(-0.08, 0.14, 1.28, { yaw: -40, pitch: 8, knee: [-0.4, 0.8, 1.8] }) },
    arms: { r: { hand: [0.42, -0.08, -0.14], elbow: [0.35, -0.3, -0.2] }, l: { hand: [-0.4, 0.02, 0.28], elbow: [-0.3, -0.3, 0.1] } },
  }));
  // 4: 着地 = 腕を振る直前 (肘が肩の高さ、手は上)
  const tPlant = S(0.36);
  keys.push(K(tPlant, {
    pelvis: { p: [-0.03, 0.80, 0.98], r: [8, -72, -4 - tilt * 0.1] }, trunk: [4, -26, -2 + tilt * 0.15],
    legs: { r: ankle(0.0, 0.08, { yaw: -80, pitch: 24, knee: [-0.6, 0.35, 0.8] }), l: ankle(-0.06, 1.46, { yaw: -18, pitch: 0, knee: [-0.15, 0.7, 2.4] }) },
    arms: { r: { hand: [0.26, 0.12 - sideDrop * 2, -0.2], elbow: [0.6, -0.08, -0.1], wrist: [-20, 0, 0] }, l: { hand: [-0.46, 0.06, 0.16], elbow: [-0.3, -0.25, 0.1] } },
  }));
  // 体が回って、腕がしなる (最大外旋)
  const tMER = tPlant + 0.085 * (quick ? 0.9 : 1);
  keys.push(K(tMER, {
    pelvis: { p: [-0.03, 0.76, 1.08], r: [14, -30, -2] }, trunk: [10, 6, tilt * 0.6],
    legs: { r: ankle(-0.02, 0.2, { yaw: -60, pitch: 46, lift: 0.02, knee: [-0.5, 0.3, 1.2] }), l: ankle(-0.06, 1.46, { yaw: -18, knee: [-0.1, 0.8, 2.4] }) },
    arms: { r: { hand: [0.2, 0.1 - sideDrop * 2, -0.3], elbow: [0.5, -0.02, 0.1], wrist: [-50, 0, 0] }, l: { hand: [-0.22, -0.12, 0.26], elbow: [-0.3, -0.3, 0.0] } },
  }));
  // 5: リリース
  const tRel = tMER + 0.05;
  keys.push(K(tRel, {
    pelvis: { p: [-0.02, 0.75, 1.16], r: [14, -6, 2] }, trunk: [14, 22, tilt],
    legs: { r: ankle(-0.04, 0.4, { yaw: -40, pitch: 62, lift: 0.04, knee: [-0.3, 0.3, 1.6] }), l: ankle(-0.06, 1.46, { yaw: -18, knee: [0.0, 0.8, 2.5] }) },
    arms: { r: { hand: rel, elbow: [0.42, -0.1, 0.1], wrist: [10, 0, 0] }, l: { hand: [0.02, -0.2, 0.22], elbow: [-0.3, -0.3, -0.1] } },
  }));
  // 6: フォロースルー (腕は反対の膝へ、後ろ足が跳ね上がる)
  keys.push(K(tRel + 0.12, {
    pelvis: { p: [0.0, 0.72, 1.24], r: [38, 10, 4] }, trunk: [32, 26, tilt * 0.6],
    legs: { r: air(-0.1, 0.62, 0.62, { yaw: -10, pitch: 80, knee: [-0.3, 0.2, 1.2] }), l: ankle(-0.06, 1.46, { yaw: -18, knee: [0.0, 0.8, 2.5] }) },
    arms: { r: { hand: [-0.38, -0.36, 0.3], elbow: [0.1, -0.3, 0.3], wrist: [20, 0, 0] }, l: { hand: [0.12, -0.3, 0.12], elbow: [-0.3, -0.3, -0.15] } },
  }));
  keys.push(K(tRel + 0.3, {
    pelvis: { p: [-0.02, 0.74, 1.3], r: [34, 14, 2] }, trunk: [28, 20, 4],
    legs: { r: air(-0.16, 0.95, 0.72, { yaw: 0, pitch: 70, knee: [-0.3, 0.6, 1.4] }), l: ankle(-0.06, 1.46, { yaw: -18, knee: [0.0, 0.8, 2.5] }) },
    arms: { r: { hand: [-0.36, -0.42, 0.24], elbow: [0.1, -0.3, 0.3] }, l: { hand: [0.14, -0.32, 0.14], elbow: [-0.3, -0.3, -0.15] } },
  }));
  // 着地して守備の構え
  keys.push(K(tRel + 0.6, {
    pelvis: { p: [-0.2, 0.82, 1.28], r: [18, 4, 0] }, trunk: [12, 4, 0],
    legs: { r: ankle(-0.44, 1.3, { yaw: 10, knee: [-0.5, 0.6, 2.4] }), l: ankle(0.02, 1.48, { yaw: -12, knee: [0.0, 0.7, 2.6] }) },
    arms: { r: { hand: [-0.12, -0.4, 0.3], elbow: [0.3, -0.4, 0.1] }, l: { hand: [0.12, -0.38, 0.32], elbow: [-0.3, -0.4, 0.1] } },
  }));
  keys.push(K(tRel + 1.1, {
    pelvis: { p: [-0.2, 0.86, 1.28], r: [12, 2, 0] }, trunk: [8, 0, 0],
    legs: { r: ankle(-0.44, 1.3, { yaw: 10, knee: [-0.5, 0.6, 2.4] }), l: ankle(0.02, 1.48, { yaw: -12, knee: [0.0, 0.7, 2.6] }) },
    arms: { r: { hand: [-0.1, -0.42, 0.28], elbow: [0.3, -0.4, 0.1] }, l: { hand: [0.12, -0.4, 0.3], elbow: [-0.3, -0.4, 0.1] } },
  }));
  // ワインドアップ: 本塁を向いて立ち、後ろへ小さく踏んで、軸足を投手板に沿わせてからセットの形へ
  let pre = 0;
  if (style.windup && !quick) {
    pre = 0.62;
    for (const k of keys) k.t += pre;
    const up = { r: { hand: [-0.12, 0.05, 0.3], elbow: [0.3, -0.35, 0.05] }, l: { hand: [0.12, 0.07, 0.31], elbow: [-0.3, -0.35, 0.05] } };
    keys.unshift(K(0.3, {
      pelvis: { p: [0.02, 0.93, 0.0], r: [3, -20, 0] }, trunk: [-4, -6, 0],
      legs: { r: ankle(-0.12, 0.02, { yaw: -40, knee: [-0.5, 0.5, 0.9] }), l: ankle(0.16, -0.16, { yaw: 5, pitch: 10, knee: [0.2, 0.5, 0.8] }) },
      arms: up,
    }));
    keys.unshift(K(0, {
      pelvis: { p: [0.0, 0.94, 0.06], r: [4, 0, 0] }, trunk: [5, 0, 0],
      legs: { r: ankle(-0.14, 0.04, { yaw: -6, knee: [-0.2, 0.5, 1.0] }), l: ankle(0.14, 0.06, { yaw: 6, knee: [0.2, 0.5, 1.0] }) },
      arms: { r: { hand: [-0.13, -0.28, 0.27], elbow: [0.3, -0.5, 0.0] }, l: { hand: [0.13, -0.27, 0.28], elbow: [-0.3, -0.5, 0.0] } },
    }));
  }
  // テンポ
  const sc = tempo;
  for (const k of keys) k.t *= sc;
  return { keys, tRelease: (tRel + pre) * sc, tPlant: (tPlant + pre) * sc, tLift: ((quick ? 0.16 : 0.46) + pre) * sc, tEnd: (tRel + 1.1 + pre) * sc, windup: pre > 0 };
}

// 構え (セット) だけを返す
export function setPose(d) { return d.keys[0]; }

// ---- 補間 -----------------------------------------------------------------
function flatten(k) {
  const a = [];
  const push = (v) => { if (Array.isArray(v)) a.push(...v); else a.push(v); };
  push(k.pelvis.p); push(k.pelvis.r); push(k.trunk);
  for (const s of ['l', 'r']) { const L = k.legs[s]; push(L.p); push(L.yaw); push(L.pitch); push(L.knee); push(L.ground ? 1 : 0); }
  for (const s of ['l', 'r']) { const A = k.arms[s]; push(A.hand); push(A.elbow); push(A.wrist || [0, 0, 0]); }
  return a;
}
function unflatten(a) {
  let i = 0;
  const g = (n) => { const r = a.slice(i, i + n); i += n; return n === 1 ? r[0] : r; };
  const P = { pelvis: { p: g(3), r: g(3) }, trunk: g(3), legs: {}, arms: {} };
  for (const s of ['l', 'r']) P.legs[s] = { p: g(3), yaw: g(1), pitch: g(1), knee: g(3), ground: g(1) > 0.5 };
  for (const s of ['l', 'r']) P.arms[s] = { hand: g(3), elbow: g(3), wrist: g(3) };
  return P;
}
// 地面に着いた足の高さは補間で浮かないように、ground の切り替えでは位置を直接つなぐ
export class DeliveryPlayer {
  constructor(delivery) {
    this.d = delivery;
    this.flat = delivery.keys.map((k) => ({ t: k.t, v: flatten(k), k }));
  }
  sample(t) {
    const F = this.flat;
    if (t <= F[0].t) return unflatten(F[0].v);
    if (t >= F[F.length - 1].t) return unflatten(F[F.length - 1].v);
    let i = 0;
    while (i < F.length - 2 && t > F[i + 1].t) i++;
    const p0 = F[Math.max(0, i - 1)], p1 = F[i], p2 = F[i + 1], p3 = F[Math.min(F.length - 1, i + 2)];
    const u = (t - p1.t) / (p2.t - p1.t);
    const out = new Array(p1.v.length);
    // 時間の間隔が違うキーでも滑らかな Catmull-Rom (接線は時間で割る)
    const dt = p2.t - p1.t;
    for (let j = 0; j < out.length; j++) {
      const m1 = p1 === p0 ? 0 : (p2.v[j] - p0.v[j]) / (p2.t - p0.t) * dt;
      const m2 = p3 === p2 ? 0 : (p3.v[j] - p1.v[j]) / (p3.t - p1.t) * dt;
      const a = p1.v[j], b = p2.v[j];
      // 地面フラグと着地中の足は補間で暴れないよう単調にする
      const u2 = u * u, u3 = u2 * u;
      let v = (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * b + (u3 - u2) * m2;
      const lo = Math.min(a, b), hi = Math.max(a, b);
      // 行き過ぎを抑える (Fritsch-Carlson ほどではないが、はみ出しを半分に)
      if (v < lo) v = lo - (lo - v) * 0.5; else if (v > hi) v = hi + (v - hi) * 0.5;
      out[j] = v;
    }
    const P = unflatten(out);
    // ground の切り替えは近い方のキー
    for (const s of ['l', 'r']) P.legs[s].ground = (u < 0.5 ? p1.k : p2.k).legs[s].ground;
    // 地面の足が浮き上がりへ移るときは高さを補う
    for (const s of ['l', 'r']) {
      const a = p1.k.legs[s], b = p2.k.legs[s];
      if (a.ground !== b.ground) {
        // 片方が地面: 地面側の y を足首の高さとして扱う
        const aY = a.ground ? 0.12 + a.p[1] : a.p[1];
        const bY = b.ground ? 0.12 + b.p[1] : b.p[1];
        const e = u * u * (3 - 2 * u);
        P.legs[s].p[1] = aY + (bY - aY) * e;
        P.legs[s].ground = false;
      }
    }
    return P;
  }
}

export function mirrorPose(P) {
  const m3 = (v) => [-v[0], v[1], v[2]];
  const mo = (v) => [-v[0], v[1], v[2]]; // 体幹座標 [右, 上, 前] の右も反転
  const Q = {
    pelvis: { p: m3(P.pelvis.p), r: [P.pelvis.r[0], -P.pelvis.r[1], -P.pelvis.r[2]] },
    trunk: [P.trunk[0], -P.trunk[1], -P.trunk[2]],
    legs: {}, arms: {}, look: P.look,
  };
  for (const [a, b] of [['l', 'r'], ['r', 'l']]) {
    const L = P.legs[a];
    Q.legs[b] = { p: m3(L.p), yaw: -L.yaw, pitch: L.pitch, knee: m3(L.knee), ground: L.ground };
    const A = P.arms[a];
    Q.arms[b] = { hand: mo(A.hand), elbow: mo(A.elbow), wrist: A.wrist ? [A.wrist[0], -A.wrist[1], -A.wrist[2]] : [0, 0, 0] };
  }
  return Q;
}

// 2 つの姿勢を混ぜる (u = 0 → a、1 → b)
export function blendPose(a, b, u) {
  const fa = flatten(a), fb = flatten(b);
  const P = unflatten(fa.map((v, i) => v + (fb[i] - v) * u));
  for (const s of ['l', 'r']) P.legs[s].ground = b.legs[s].ground;
  return P;
}
