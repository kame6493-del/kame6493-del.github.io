// 選手・審判の 3D の人(v2): models/players_v2/player.glb(体と 53 本の動き。Blender で野球用に 1 から作った物)を
// 1 回読んで使い回す(SkeletonUtils.clone + AnimationMixer)。動きの名前・速さ・出来事の時刻は motions_v2.json。
// 外から見た使い方は figures.js の Person と同じ(root / set(kind, opt) / setYawToward / setNumber)。
// 遠い人と読み込み前は軽い簡単な人の形(figures.js)。動きの計算は遠い人ほど間引く。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Person } from './figures.js';
import { skipHidden } from './hidskip.js';   // 11/25 軽く: 隠れている人の行列を毎こま計算しない
import { uniformUniforms, uniformShader, buildUniform, dressUniform, uniformKit, drawNumber, preloadUniform } from './uniform.js';   // 11/18 ユニフォーム(学校・胸の文字・記章・背番号・パイピング・汚れ)

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ALL = [];
let THROW_LEFT = false;   // v2 の内野の送球は送球先が体の左 90 度(v3 は前)
let base = null;
const BAT_OFS = [-0.035, -0.02, -0.05];   // バットの形のずらし(glTF の座標、build_player.py の静止の形から): 手のひらの中・柄 12 cm
const GRIP_BAT = 1.5;   // バットを握る時の指の閉じ方(Grip_R/L の強さ。1 は球を持つ形)
const IN_PLACE_MADE = ['run_fast', 'run_sprint'];
// 11/19 夜: 体を Mixamo の骨組み(指の骨つき)に付け直した(models/players_mx、tools\mxbodyuild_mx.py)。?oldbody=1 で前の体(players_v3 + mx の差し替え)に戻す。
// 骨の名前の対応表(前の名前 → Mixamo の名前)。ゲームの中は前の名前で骨を探す(_build で同じ骨を前の名前でも引けるようにする)
const OLD_BODY = new URLSearchParams(location.search).has('oldbody');   // ?oldbody=1 で前の体(players_v3 + mx の差し替え)
const MX_BODY_V = '20261120m7';
const MX_ALIAS = { run_sprint: 'mx_run_sprint', run_fast: 'mx_run_fast', run_backpedal: 'mx_run_back', dive_forward: 'mx_dive_f' };   // 比べて Mixamo の方が自然だった物(docs\体の付け直し.md)
// 試す時: ?mxa=run_sprint:mx_run_sprint,run_fast:mx_run_fast(足す・替える)
for (const kv of (new URLSearchParams(location.search).get('mxa') || '').split(',')) { const [k, t] = kv.split(':'); if (k && t) MX_ALIAS[k] = t; }
const NO_FADE = /[?&]nofade=1/.test(location.search);   // 撮影の寄り(手の寄りなど)は透かさない
// 下半身の骨(上半身だけの動きを重ねる時に除く)。BONE_MAP の後で作る
export const BONE_MAP = { root: 'root', pelvis: 'mixamorigHips', spine_01: 'mixamorigSpine', spine_02: 'mixamorigSpine1', spine_03: 'mixamorigSpine2', neck_01: 'mixamorigNeck', Head: 'mixamorigHead' };
for (const [s, S] of [['l', 'Left'], ['r', 'Right']]) Object.assign(BONE_MAP, { ['clavicle_' + s]: `mixamorig${S}Shoulder`, ['upperarm_' + s]: `mixamorig${S}Arm`, ['lowerarm_' + s]: `mixamorig${S}ForeArm`, ['hand_' + s]: `mixamorig${S}Hand`, ['thigh_' + s]: `mixamorig${S}UpLeg`, ['calf_' + s]: `mixamorig${S}Leg`, ['foot_' + s]: `mixamorig${S}Foot`, ['ball_' + s]: `mixamorig${S}ToeBase` });
const LOCO_SWITCH = { walk: 2.0, run_jog: 3.8, run_fast: 6.3 };   // この速さで次の動きへ替える          // { scene, clips: {name: AnimationClip}, motions }
let LOD_FAR = 95;
export function setAthleteLod(far) { LOD_FAR = far; }
export function athletesReady() { return !!base; }

// 根っこの移動を消す(体はゲームが動かす)。向きの回転は残す
function inPlace(clip) {
  const c = clip.clone();
  for (const t of c.tracks) if (t.name === 'root.position') for (let i = 0; i < t.values.length; i += 3) { t.values[i] = 0; t.values[i + 2] = 0; }
  return c;
}
export function loadAthletes() {
  preloadUniform();
  // 動き v3(モーションキャプチャ入り)。?pv2=1 で v2 に戻せる
  const v2 = new URLSearchParams(location.search).has('pv2');
  if (!v2 && !OLD_BODY) {   // Mixamo の骨組みの体(動きは全部この 1 つに入っている)。読めない時は前の体
    return Promise.all([new GLTFLoader().loadAsync('models/players_mx/player.glb?v=' + MX_BODY_V), fetch('models/players_mx/motions.json?v=' + MX_BODY_V).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })])
      .then(([g, motions]) => setupBase(g, motions, false)).catch((e) => { console.warn('人のモデル(Mixamo の骨組み)の読み込みに失敗、前の体にする', e); return loadOldBody(false); });
  }
  return loadOldBody(v2);
}
function loadOldBody(v2) {
  const url = v2 ? 'models/players_v2/' : 'models/players_v3/';
  // Mixamo(Adobe)の野球の動きを今の骨に移した物(打撃など、2026-11-19)。同じ名前の動きを差し替える。?nomx=1 で前の物に戻せる
  const mx = v2 || new URLSearchParams(location.search).has('nomx') ? Promise.resolve(null)
    : Promise.all([new GLTFLoader().loadAsync('models/players_v3/mx/player.glb?v=20261119f'), fetch('models/players_v3/mx/motions.json?v=20261119f').then((r) => r.json())]).catch((e) => { console.warn('Mixamo の動きの読み込みに失敗', e); return null; });
  return Promise.all([new GLTFLoader().loadAsync(url + 'player.glb'), fetch(url + (v2 ? 'motions_v2.json' : 'motions_v3.json')).then((r) => r.json()), mx])
    .then(([g, motions, mxr]) => {
      if (mxr) { g.animations = g.animations.filter((a) => !mxr[0].animations.some((b) => b.name === a.name)).concat(mxr[0].animations); Object.assign(motions, mxr[1]); }
      return setupBase(g, motions, v2);
    }).catch((e) => console.warn('人のモデル(v2)の読み込みに失敗', e));
}
function setupBase(g, motions, v2) {
  // ループの動きの速さ(表に無い物は、根っこが 1 回で進む距離 ÷ 長さ)
  for (const M of Object.values(motions)) if (M.loop && !M.speed && M.root && M.root.length > 1) { const L = M.root[M.root.length - 1]; const d = Math.hypot(L[1], L[2]); if (d > 0.3) M.speed = d / M.dur; }
  THROW_LEFT = v2;
  const clips = {};
  for (const a of g.animations) clips[a.name] = IN_PLACE_MADE.includes(a.name) ? a : inPlace(a);   // run_fast・run_sprint はその場で作ってあるので根っこはそのまま
  // 指を動かさない動き(CMU・手のキー)からは指の線を除く(指は静止のまま。計算を軽く。Mixamo の動きから替わる時は three.js が指を元の形へ戻す)
  for (const [n, c] of Object.entries(clips)) if (!(motions[n] && motions[n].fingers)) c.tracks = c.tracks.filter((t) => !/Hand(Thumb|Index|Middle|Ring|Pinky)\d/.test(t.name));
  // Mixamo の骨組みの体: ゲームの動きの名前を Mixamo の動き(mx_*)に差し替える(比べて自然だった物。?mxalias=0 で使わない)
  if (!v2 && !OLD_BODY && !/mxalias=0/.test(location.search)) for (const [k, t] of Object.entries(MX_ALIAS)) if (clips[t] && motions[t]) { clips[k] = clips[t]; motions[k] = { ...motions[t], aliasOf: t }; }
  mergeBody(g.scene);
  base = { scene: g.scene, clips, motions };
  for (const a of ALL) a._build();
  return base;
}

// 体の 7 つの材質(上着・ズボン・アンダー・ソックス・ベルト・靴・肌)を 1 つにまとめる(描画の呼び出しを 1 回に)。
// 色は頂点の「部位の番号」で、人ごとの 7 色の表から選ぶ
const SLOTS = ['M_Jersey', 'M_Pants', 'M_Under', 'M_Sock', 'M_Belt', 'M_Shoe', 'M_Skin'];
function mergeBody(scene) {
  const parts = [];
  scene.traverse((o) => { if (o.isSkinnedMesh && o.material && SLOTS.includes(o.material.name)) parts.push(o); });
  if (parts.length < 2) return;
  const keep = ['position', 'normal', 'skinIndex', 'skinWeight'];
  const geos = parts.map((m) => {
    const g = new THREE.BufferGeometry();
    for (const k of keep) g.setAttribute(k, m.geometry.attributes[k].clone());
    if (m.geometry.index) g.setIndex(m.geometry.index.clone());
    const n = g.attributes.position.count;
    g.setAttribute('slot', new THREE.Float32BufferAttribute(new Float32Array(n).fill(SLOTS.indexOf(m.material.name)), 1));
    if (m.geometry.morphAttributes.position) g.morphAttributes.position = m.geometry.morphAttributes.position.map((a) => a.clone());
    g.morphTargetsRelative = m.geometry.morphTargetsRelative;
    return g;
  });
  const merged = mergeGeometries(geos, false);
  if (!merged) return;
  merged.morphTargetsRelative = geos[0].morphTargetsRelative;   // まとめる関数はこれを引き継がない(引き継がないと手の形で体が崩れる)
  const mesh = new THREE.SkinnedMesh(merged, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0 }));
  mesh.name = 'Body';
  mesh.bind(parts[0].skeleton, parts[0].bindMatrix);
  mesh.morphTargetDictionary = { ...parts[0].morphTargetDictionary };
  mesh.morphTargetInfluences = new Array(Object.keys(mesh.morphTargetDictionary).length).fill(0);
  const parent = parts[0].parent;
  for (const m of parts) m.parent.remove(m);
  parent.add(mesh);
}
// 人ごとの体の材質(部位の番号で色を選ぶ)
// 11/18 画質: 部位ごとの粗さ(布・ベルト・靴・肌)と、布の細かい織り目・しわ(体の元の形の位置で 3 方向から貼る。近い時だけ)。gfx.js が setAthleteDetail で絵と強さを渡す
const FAB = { uFab: { value: null }, uFabK: { value: 0 } };
export function setAthleteDetail(tex, k) { if (tex) FAB.uFab.value = tex; FAB.uFabK.value = k; }
function bodyMaterial(cols) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0 });
  m.userData.cols = { value: cols };
  m.userData.uni = uniformUniforms();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.cols = m.userData.cols;
    sh.uniforms.uFab = FAB.uFab; sh.uniforms.uFabK = FAB.uFabK;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute float slot; uniform vec3 cols[7]; varying vec3 vSlotCol; varying float vSlot; varying vec3 vObjP; varying vec3 vObjN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSlotCol = cols[int(slot + 0.5)]; vSlot = slot; vObjP = position; vObjN = normal;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vSlotCol; varying float vSlot; varying vec3 vObjP; varying vec3 vObjN; uniform sampler2D uFab; uniform float uFabK;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= vSlotCol * (vSlot < 3.5 ? 0.82 : 1.0);   // 白い布でも陰影が残るよう、布の反射率を本物の布くらいに`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = vSlot < 3.5 ? 0.86 : vSlot < 4.5 ? 0.42 : vSlot < 5.5 ? 0.36 : 0.56;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float fDist = length(vViewPosition);
        float fK = uFabK * (1.0 - smoothstep(7.0, 22.0, fDist));
        if (fK > 0.001 && vSlot < 3.5) {
          vec3 w = pow(abs(normalize(vObjN)), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-4);
          float s = 1.0 / 0.04;
          float h = (texture2D(uFab, vObjP.yz * s).b * w.x + texture2D(uFab, vObjP.xz * s).b * w.y + texture2D(uFab, vObjP.xy * s).b * w.z) * 0.0012;
          // しわ(体の上下に流れるゆるい波。ズボンとアンダーは少し強く)
          float fold = sin(vObjP.y * 34.0 + sin(vObjP.x * 19.0 + vObjP.z * 7.0) * 2.1) * sin(vObjP.y * 11.0 + vObjP.z * 23.0);
          h += fold * (vSlot > 0.5 && vSlot < 2.5 ? 0.0075 : 0.0055);
          vec3 sp = -vViewPosition;
          vec3 dpx = dFdx(sp), dpy = dFdy(sp);
          vec3 R1 = cross(dpy, normal), R2 = cross(normal, dpx);
          float det = dot(dpx, R1) * faceDirection;
          vec3 grad = sign(det) * (dFdx(h) * R1 + dFdy(h) * R2) * fK;
          vec3 nn = abs(det) * normal - grad;
          if (dot(nn, nn) > 1e-20) normal = normalize(nn);   // 0 の長さを正規化すると NaN になり、ブルームで黒い四角に広がる
        }`);
    uniformShader(sh, m.userData.uni);
  };
  m.customProgramCacheKey = () => 'player-body-v4';
  return m;
}
// 帽子・ヘルメット・グラブ・バットの材質(粗さと光沢)
function finishMat(m, meshName) {
  const n = (meshName || '') + ' ' + (m.name || '');
  if (/Helmet/i.test(n)) { m.roughness = 0.2; m.metalness = 0; m.envMapIntensity = 1.3; }
  else if (/Cap/i.test(n)) { m.roughness = 0.8; }
  else if (/Glove|Mitt/i.test(n)) { m.roughness = 0.48; m.envMapIntensity = 1.1; }
  else if (/Bat/i.test(n)) { m.roughness = 0.26; m.metalness = 0.85; m.envMapIntensity = 1.2; }
  return m;
}

// ゲームの姿勢の名前 → 動き
// loop: その場で繰り返す / scrub: 外から進み具合(u・t)で時刻を決める / once: 1 回だけ再生
function pick(kind, o, me) {
  switch (kind) {
    case 'stand': return { clip: 'stand_idle', mode: 'loop' };
    case 'ready': return { clip: me.isUmp ? 'ump_set' : 'fld_ready_idle', mode: 'loop' };
    case 'crouch': return { clip: me.isUmp ? 'ump_plate_set' : 'catcher_set', mode: 'loop' };
    case 'point': return { clip: 'cutoff_call', mode: 'loop' };
    case 'bat': { const c = 'bat_stance' + (o.lh && base.clips.bat_stance_lh ? '_lh' : ''); return { clip: c, mode: 'loop' }; }   // 左打ちは *_lh
    case 'run': return { clip: 'run', mode: 'run' };
    case 'throw': {
      const c = me.opt.mitt ? 'catcher_throw' : o.toss && base.clips.toss_under ? 'toss_under' : me.opt.of ? 'throw_of' : 'throw_inf';   // 近い二塁へは下手のトス(CMU 124_12、11/19 夜)
      const rel = base.motions[c].events.release.t;
      // u: 腕を引いてから放すまで(0.35 秒、放すのは u≈0.63)。放す時刻に合わせる
      return { clip: c, mode: 'scrub', time: Math.max(0, rel - 0.22 + (o.u || 0) * 0.35), yaw: c === 'throw_inf' && THROW_LEFT ? Math.PI / 2 : 0 };
    }
    case 'pitch': return { clip: o.windup ? 'pitch_windup' : 'pitch_set', mode: 'scrub', time: Math.max(0, Math.min(base.clips[o.windup ? 'pitch_windup' : 'pitch_set'].duration - 0.01, o.t || 0)) };
    case 'receive': return { clip: 'catcher_receive', mode: 'scrub', time: Math.max(0, Math.min(0.69, o.t || 0)) };
    case 'through': return { clip: 'run_through_1b', mode: 'scrub', time: Math.min(1.89, 0.25 + (o.t || 0)) };
    case 'ump_strike': return { clip: 'ump_strike', mode: 'once', start: 0.15 };
    case 'swing': if (o.t != null) { let c = o.course ? 'bat_' + (o.course === 'bunt' ? 'bunt' : 'swing_' + o.course) : 'bat_swing'; if (!base.clips[c]) c = 'bat_swing'; if (o.lh && base.clips[c + '_lh']) c += '_lh'; return { clip: c, mode: 'scrub', time: Math.max(0, Math.min(base.clips[c].duration - 0.01, o.t)) }; }   // コース(high・low・in・out・miss・bunt)と左打ち
      { const ce = (base.motions.bat_swing && base.motions.bat_swing.events && base.motions.bat_swing.events.contact && base.motions.bat_swing.events.contact.t) || 0.6;   // ノックの打者: 当たる時刻の 0.13 秒前から(動きを替えても合うように)
        return { clip: 'bat_swing', mode: 'scrub', time: Math.min(base.clips.bat_swing.duration - 0.01, ce - 0.13 + Math.max(0, o.u || 0) * 0.18) }; }
    case 'catch': {
      if (o.clip) return { clip: o.clip, mode: 'once', start: o.start || 0, id: o.id };
      const h = o.h || 0;
      const c = h > 0.72 ? 'fly_catch' : h < -0.35 ? 'gb_front' : 'tag';   // 頭の上(地面から約 1.75 m 超)だけ両手を上げる。胸・腰の高さは tag の形
      const ct = base.motions[c].events.catch.t;
      return { clip: c, mode: 'once', start: Math.max(0, ct - 0.08), catchT: ct };
    }
    case 'jump': return { clip: 'jump_catch', mode: 'scrub', time: Math.min(1.19, 0.12 + (o.t || 0)) };
    case 'dive':
      // 11/26 正面へ頭から飛ぶ(main.js の frontDivePose が体を前へ倒す): 腕を頭の上へ伸ばした形(fly_catch の捕る所)。起き上がる時は構えの形へ
      if (o.front) { const ct = (base.motions.fly_catch && base.motions.fly_catch.events && base.motions.fly_catch.events.catch && base.motions.fly_catch.events.catch.t) || 0.7; return (o.lt ?? 0) < 1.0 ? { clip: 'fly_catch', mode: 'scrub', time: ct } : { clip: 'fld_ready_idle', mode: 'loop' }; }
      return { clip: 'dive_forward', mode: 'scrub', time: Math.min(2.09, 0.3 + (o.t || 0)) };
    case 'slide': { const ev = base.motions.slide_feet && base.motions.slide_feet.events, d0 = ev && ev.drop ? ev.drop.t : 0.33; return { clip: 'slide_feet', mode: 'scrub', time: Math.min(base.clips.slide_feet.duration - 0.01, d0 + (o.t ?? 0.5)) }; }   // 倒れ込む時刻から(動きを替えても合うように)
    case 'ump_out': return { clip: 'ump_out', mode: 'once', start: 0.15 };
    case 'ump_safe': return { clip: 'ump_safe', mode: 'once', start: 0.15 };
    case 'ump_point': return { clip: 'ump_foul', mode: 'once', start: 0.1 };
    default: return { clip: 'stand_idle', mode: 'loop' };
  }
}

// 動きの根っこの移動(表の 0.1 秒ごとの値を間で補う): [前, 右, 向き(度)]
export function motionRoot(name, t) {
  const M = base && base.motions[name]; if (!M || !M.root) return [0, 0, 0];
  const R = M.root; const i = Math.max(0, Math.min(R.length - 2, Math.floor(t / 0.1)));
  const u = Math.max(0, Math.min(1, (t - R[i][0]) / 0.1));
  return [1, 2, 3].map((j) => R[i][j] + (R[i + 1][j] - R[i][j]) * u);
}
export function motionEvent(name, ev) { const M = base && base.motions[name]; return M && M.events && M.events[ev] ? M.events[ev].t : null; }

export class Athlete {
  // kit: figures.js の KIT と同じ形(色は数値)。opt: { mitt, mask, bat, helmet, glove, number, numColor, of }
  constructor(kit, opt = {}) {
    this.root = skipHidden(new THREE.Group());   // 11/25 軽く(js/hidskip.js)
    this.simple = new Person(kit, opt);
    this.root.add(this.simple.root);
    this.kit = kit; this.opt = opt;
    this.isUmp = opt.glove === false && !opt.bat && !opt.helmet;
    this.kind = 'stand'; this.popt = {};
    this.number = opt.number || '';
    this.holding = false;
    this.lastPos = null;
    ALL.push(this);
    if (base) this._build();
  }
  get spine() { return this.simple.spine; }
  get arms() {
    const self = this;
    const hand = (side) => ({ getWorldPosition: (out) => (self.rig && self.rig.model.visible ? self.rig.bones['hand_' + side].getWorldPosition(out) : self.simple.arms[side === 'l' ? 0 : 1].hand.getWorldPosition(out)) });
    return [{ hand: hand('l') }, { hand: hand('r') }];
  }
  _build() {
    if (this.rig || !base) return;
    const model = skClone(base.scene);
    const holder = new THREE.Group();   // 向き合わせ(GLB の前 +Z を、この形の前 -Z へ)
    holder.rotation.y = Math.PI;
    holder.add(model);
    const bones = {}, meshes = {};
    model.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        // 材質は人ごとに複製して色を替える(体は部位の番号で色を選ぶ 1 つの材質)
        o.material = o.name === 'Body' && o.geometry.attributes.slot ? bodyMaterial(Array.from({ length: 7 }, () => new THREE.Color(1, 1, 1))) : finishMat(o.material.clone(), o.name + ' ' + (o.parent ? o.parent.name : ''));
        const KN = ['Body', 'Cap', 'Glove', 'Mitt', 'BatOld', 'BatL', 'Bat', 'Helmet'];   // BatOld・BatL は Mixamo の骨組みの体だけ(先に名前で分ける)
        const top = KN.includes(o.name) ? o.name : o.parent && KN.includes(o.parent.name) ? o.parent.name : KN.find((k) => o.name.startsWith(k)) || (o.morphTargetDictionary && 'Grip_R' in o.morphTargetDictionary ? 'Body' : o.name);
        (meshes[top] = meshes[top] || []).push(o);
      }
    });
    for (const [o, n] of Object.entries(BONE_MAP)) if (!bones[o] && bones[n]) bones[o] = bones[n];   // 前の名前でも引ける
    const findMesh = (name) => meshes[name] || Object.entries(meshes).find(([k]) => k.startsWith(name))?.[1] || [];
    this.parts = { Body: findMesh('Body'), Cap: findMesh('Cap'), Glove: findMesh('Glove'), Mitt: findMesh('Mitt'), Bat: findMesh('Bat'), Helmet: findMesh('Helmet'), BatL: meshes.BatL || [], BatOld: meshes.BatOld || [] };
    this.mxBody = this.parts.BatOld.length > 0;
    // バットを握りの側へ 5 cm ずらす(右手の下に左手が入る柄の長さを 7 → 12 cm に。2026-11-19、Mixamo の打撃で左手を右手の 10 cm 下に握らせるため)
    // 形の座標は glTF(Y 上)。Blender の +Y(柄の端の側)= glTF の -Z
    if (!this.mxBody) for (const m of this.parts.Bat) if (!m.userData.slid) { m.geometry = m.geometry.clone(); m.geometry.translate(BAT_OFS[0], BAT_OFS[1], BAT_OFS[2]); m.userData.slid = true; }   // x: 手首から指の付け根の方へ、y: 手のひらの側へ(握りこぶしの中を通す、11/19 夜)
    const show = (k, v) => this.parts[k].forEach((m) => (m.visible = v));
    const o = this.opt;
    show('Glove', o.glove !== false && !o.mitt && !o.bat);
    show('Mitt', !!o.mitt);
    show('Bat', !!o.bat); show('BatL', false); show('BatOld', false); this.batShown = 'Bat';
    show('Helmet', !!(o.helmet || o.bat) && !this.isUmp);
    show('Cap', !(o.helmet || o.bat));
    this.rig = { model: holder, inner: model, bones, mixer: new THREE.AnimationMixer(model), actions: {}, cur: null, curName: null };
    this._makePlate();
    buildUniform(this);
    this.dress();
    holder.visible = false; skipHidden(holder);   // 11/25 軽く: 遠くて簡単な形の間は、骨入りの体の行列を計算しない(js/hidskip.js)
    this.root.add(holder);
  }
  // 色: 上着・ズボン・帽子・ソックス・アンダー(材質の名前で)
  dress() {
    if (!this.rig) return;
    const k = uniformKit(this.kit);   // 学校の色(uniform.js)
    const col = { M_Jersey: k.jersey, M_Pants: k.pants, M_Cap: k.cap, M_Sock: k.sock, M_Under: k.under, M_Belt: k.belt ?? 0x15171c, M_Shoe: 0x14161c, M_Skin: 0xc79a7a };
    this.rig.inner.traverse((m) => {
      if (!m.isMesh) return;
      if (m.material.userData && m.material.userData.cols) { SLOTS.forEach((n, i) => m.material.userData.cols.value[i].setHex(col[n])); return; }
      const ms = Array.isArray(m.material) ? m.material : [m.material];
      for (const x of ms) if (col[x.name] != null) x.color.setHex(col[x.name]);
    });
    dressUniform(this);
    this._number();
  }
  // 背番号: 背中に薄い板(布の上に少し浮かせる)。置き場所は読み込み直後の立ち姿で 1 回だけ決める
  _makePlate() {
    const r = this.rig;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const sp = r.bones.spine_03 || r.bones.spine_02;
    r.inner.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(sp.matrixWorld).invert();
    plate.position.copy(V(0, 1.27, -0.16).applyMatrix4(r.inner.matrixWorld).applyMatrix4(inv));
    const q = new THREE.Quaternion(); sp.getWorldQuaternion(q);
    const qm = new THREE.Quaternion(); r.inner.getWorldQuaternion(qm);
    plate.quaternion.copy(q.invert().multiply(qm).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI)));
    sp.add(plate);
    plate.visible = false;
    r.numPlate = plate; r.numCanvas = c; r.numTex = tex;
  }
  _number() {
    const r = this.rig; if (!r) return;
    const show = !!this.number && !this.isUmp;
    r.numPlate.visible = show;
    if (!show) return;
    if (drawNumber(this, r.numCanvas, String(this.number), this.opt.numColor)) { r.numTex.needsUpdate = true; return; }   // ChatGPT の数字の絵(uniform.js)
    const g = r.numCanvas.getContext('2d'); g.clearRect(0, 0, 128, 128);
    g.font = '900 104px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tc = '#' + ((this.opt.numColor ?? this.kit.sock ?? 0x1f3557) >>> 0).toString(16).padStart(6, '0');
    g.lineWidth = 8; g.strokeStyle = '#f4f2ea'; g.strokeText(String(this.number), 64, 70); g.fillStyle = tc; g.fillText(String(this.number), 64, 70);
    r.numTex.needsUpdate = true;
  }
  setNumber(n) { if (this.number === n) return; this.number = n; this._number(); }
  setCapColor(c) { this.kit = { ...this.kit, cap: c }; this.dress(); }
  setHolding(v) { this.holding = !!v; }
  set(kind, opt = {}) {
    this.simple.set(kind, opt);
    this.kind = kind; this.popt = opt;
  }
  setYawToward(x, z) {
    const dx = x - this.root.position.x, dz = z - this.root.position.z;
    if (Math.hypot(dx, dz) > 1e-3) this.root.rotation.y = Math.atan2(-dx, -dz);
  }
  _action(name) {
    const r = this.rig;
    let a = r.actions[name];
    if (!a) { a = r.mixer.clipAction(base.clips[name]); r.actions[name] = a; }
    return a;
  }
  // オーライ: 右手を頭の上へ上げる(上半身だけ。走り・構えはそのまま続ける)。docs/動きの一覧_v3.md の call_mine
  callMine() {
    const r = this.rig; if (!r || !base.clips.call_mine) return false;
    if (!r.callAction) {
      const LOWER = LOWER_BONES;
      const clip = base.clips.call_mine.clone(); clip.name = 'call_mine_upper';
      clip.tracks = clip.tracks.filter((t) => !LOWER.has(t.name.split('.')[0]));
      r.callAction = r.mixer.clipAction(clip);
      r.callAction.setLoop(THREE.LoopOnce, 1); r.callAction.clampWhenFinished = false;
    }
    const a = r.callAction; a.reset(); a.enabled = true; a.setEffectiveWeight(9); a.fadeIn(0.08).play();   // 上半身は call_mine が勝つように(走りの腕振りと 9:1)
    return true;
  }
  // 動きを切り替える(0.15 秒でつなぐ)
  _play(spec) {
    const r = this.rig;
    const name = spec.clip;
    const key = name + '|' + spec.mode + '|' + (spec.id || '');
    if (r.curKey === key) return r.cur;
    const a = this._action(name);
    const M = base.motions[name] || {};
    a.reset();
    a.setLoop(spec.mode === 'loop' || spec.mode === 'run' ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = true;
    a.enabled = true; a.setEffectiveWeight(1);
    a.paused = spec.mode === 'scrub';
    if (spec.mode === 'once') a.time = spec.start || 0;
    a.play();
    if (r.cur && r.cur !== a) { r.cur.crossFadeTo(a, 0.15, false); }
    r.cur = a; r.curKey = key; r.curName = name; r.spec = spec; r.M = M;
    return a;
  }
  _update(cam, dt) {
    const vis = this.root.visible && this.root.parent && isShown(this.root);
    if (!vis) return;
    const wp = this.root.getWorldPosition(_v);
    const dist = wp.distanceTo(cam.position);
    const useRig = !!this.rig && dist <= LOD_FAR;
    this.simple.root.visible = !useRig;
    if (!useRig && this.simple.setFar) this.simple.setFar(dist > 30);   // 11/19 遠くの簡単な形は小さい部品を描かない(figures.js)
    if (dt > 0) {
      const moved = this.lastPos ? Math.hypot(wp.x - this.lastPos.x, wp.z - this.lastPos.z) : 0;
      this.lastPos = (this.lastPos || V()).copy(wp);
      this.spAcc = (this.spAcc || 0) * 0.8 + moved / dt * 0.2;   // 速さ(なめらかに)
      if (this.lastP2) { const vx = (wp.x - this.lastP2.x) / dt, vz = (wp.z - this.lastP2.z) / dt; this.vel = this.vel || { x: 0, z: 0 }; this.vel.x = this.vel.x * 0.8 + vx * 0.2; this.vel.z = this.vel.z * 0.8 + vz * 0.2; }
      this.lastP2 = (this.lastP2 || V()).copy(wp);
    }
    if (!this.rig) return;
    this.rig.model.visible = useRig;
    if (useRig) this._fadeNear(cam, wp);
    if (!useRig || dt <= 0) return;
    // 遠い人ほど動きの計算を間引く(25 m より先は 2 回に 1 回、50 m より先は 3 回に 1 回)
    this.acc = (this.acc || 0) + dt; this.tick = (this.tick || 0) + 1;
    const every = dist > 50 ? 3 : dist > 25 ? 2 : 1;
    if (this.tick % every !== 0 && this.rig.cur) return;
    dt = this.acc; this.acc = 0;
    const r = this.rig;
    let spec = pick(this.kind, this.popt, this);
    r.now = (r.now || 0) + dt;
    if (r.upA && !(this.kind === 'catch' && spec.clip === r.upName)) this._upperOff();
    const sp = Math.max(0.3, this.popt.v != null ? this.popt.v : this.spAcc);   // 速さを渡されていればそれ(止めて撮る時も足が合う)
    const wasRun = r.lastKind === 'run';
    r.lastKind = this.kind;
    r.model.scale.x = 1;
    if (spec.mode === 'run' && this.popt.back && base.clips.run_backpedal) {
      // フライを追う最初の数歩: 打球の方を向いたまま後ろへ下がる
      this._locoOff();
      const a = this._play({ clip: 'run_backpedal', mode: 'run' });
      a.timeScale = clampN(sp / ((base.motions.run_backpedal && base.motions.run_backpedal.loco_speed) || LOCO_SPEED.run_backpedal), 0.6, 1.7);
    } else if (spec.mode === 'run') {
      // 止まった所からの走り出しは run_start(加速の前傾)。思ったより速くならない時(歩き)はやめる
      if (!wasRun && sp < 1.2 && base.clips.run_start) r.startAt = r.now;
      const ts = r.startAt != null ? r.now - r.startAt : 99;
      if (ts < 0.88 && !(ts > 0.35 && sp < 1.8)) {
        this._locoOff();
        const a = this._play({ clip: 'run_start', mode: 'once', id: 's' + r.startAt });
        a.timeScale = 1;
      } else { r.startAt = null; this._loco(sp); }
    } else {
      // 走ってきて止まる時は run_stop_mocap の終わりの方(残りの移動 0.4 m 程)を流す
      if (wasRun && sp > 2.2 && (this.kind === 'ready' || this.kind === 'stand') && base.clips.run_stop_mocap) r.stopAt = r.now;
      const tStop = r.stopAt != null ? r.now - r.stopAt : 99;
      // リードの横歩き(第二リード・戻り): 体の横へ動いている時は lead_shuffle。左へは鏡
      const lat = this._lateral();
      if (tStop < 1.0 && (this.kind === 'ready' || this.kind === 'stand')) {
        this._locoOff();
        const a = this._play({ clip: 'run_stop_mocap', mode: 'once', start: 1.15, id: 'p' + r.stopAt });
        a.timeScale = 1;
      } else if (this.kind === 'ready' && Math.abs(lat) > 0.45 && base.clips.lead_shuffle) {
        r.stopAt = null;
        this._locoOff();
        const a = this._play({ clip: 'lead_shuffle', mode: 'loop' });
        // 左へは逆再生(鏡にするとグラブが右手に移るので使わない。横歩きは逆に流しても左への横歩きになる)
        a.timeScale = clampN(Math.abs(lat) / LOCO_SPEED.lead_shuffle, 0.5, 1.5) * (lat < 0 ? -1 : 1);
      } else if (this.kind === 'catch' && spec.mode === 'once' && !this.popt.clip && sp > 1.6) {
        // 走りながら捕る: 足は走りのまま、上半身だけ捕る形を重ねる(捕る形のまま横へすべらない、11/19 夜)
        r.stopAt = null;
        this._loco(sp);
        this._upperPlay(spec);
      } else {
        r.stopAt = null;
        this._locoOff();
        const a = this._play(spec);
        a.timeScale = 1;
        if (spec.mode === 'scrub') a.time = Math.max(0, Math.min(base.clips[spec.clip].duration - 0.001, spec.time));
      }
    }
    // 向き合わせ(内野の送球は送球先が体の左 90 度なので、体を右へ 90 度回しておく)
    r.model.rotation.y = Math.PI + (spec.yaw || 0);
    r.mixer.update(dt);
    this._hands(spec);
    if (this.lean) this._applyLean();   // 11/21 整列の礼・握手・ハイタッチ(js/seiretsu.js)
    if (this.reach) this._applyReach(this.reach);   // 11/26 正面の飛び込み: 両腕を頭の先へまっすぐ伸ばす(main.js の frontDivePose が 0〜1 を入れる)
  }
  // 腕(上腕 → 前腕)を、背骨の上の向き(頭の方)へ向ける。w は効き具合。グラブの左腕はまっすぐ、右腕は少し低く・内へ
  _applyReach(w) {
    const r = this.rig; if (!r) return; const B = r.bones;
    if (!B.spine_03 || !B.Head) return;
    r.model.updateMatrixWorld(true);
    const s0 = B.spine_03.getWorldPosition(new THREE.Vector3()), h0 = B.Head.getWorldPosition(new THREE.Vector3());
    const up = h0.sub(s0).normalize();
    this.root.getWorldQuaternion(_lq); const right = new THREE.Vector3(1, 0, 0).applyQuaternion(_lq);
    const fwdDown = new THREE.Vector3().crossVectors(right, up).normalize();   // 体の前(腹)の向き
    const aim = (bone, child, dir) => {
      if (!bone || !child || !bone.parent) return;
      const a = bone.getWorldPosition(new THREE.Vector3()), b = child.getWorldPosition(new THREE.Vector3());
      const cur = b.sub(a).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(cur, dir);
      q.slerp(new THREE.Quaternion(), 1 - w);
      bone.parent.getWorldQuaternion(_lqp);
      _lqt.copy(_lqp).invert().multiply(q).multiply(_lqp);
      bone.quaternion.premultiply(_lqt);
      bone.updateMatrixWorld(true);
    };
    for (const [s, k] of [['l', 0], ['r', 1]]) {
      const dir = up.clone().addScaledVector(fwdDown, k ? 0.28 : 0.12).addScaledVector(right, (s === 'l' ? -1 : 1) * 0.1).normalize();
      aim(B['upperarm_' + s], B['lowerarm_' + s], dir);
      aim(B['lowerarm_' + s], B['hand_' + s], dir);
    }
  }
  // 体を前へ倒す(礼)・右腕を前/上へ上げる(握手・ハイタッチ)。動きの後に骨を回して足す。lean = { bow: 倒す角度(rad), arm: 右腕を上げる角度(rad) }
  _applyLean() {
    const L = this.lean, r = this.rig; if (!r) return;
    this.root.getWorldQuaternion(_lq);
    _lax.set(1, 0, 0).applyQuaternion(_lq);   // 体の右の向き(前は -Z)
    const rot = (bone, ang) => {
      if (!bone || !bone.parent || !ang) return;
      bone.parent.getWorldQuaternion(_lqp);
      _lqw.setFromAxisAngle(_lax, ang);
      _lqt.copy(_lqp).invert().multiply(_lqw).multiply(_lqp);
      bone.quaternion.premultiply(_lqt);
    };
    if (L.bow) { const B = r.bones; rot(B.spine_01, -L.bow * 0.3); rot(B.spine_02, -L.bow * 0.35); rot(B.spine_03, -L.bow * 0.35); }
    if (L.arm) rot(r.bones.upperarm_r, L.arm);
    if (L.fore) { r.model.updateMatrixWorld(true); rot(r.bones.lowerarm_r, L.fore); }   // 11/21 肘を曲げて前腕を前へ(観戦で品を手に持つ時。js/freeplay.js)
  }
  // カメラのすぐ近く(水平 1.2 m 以内)の人は透かす(一人称で味方の頭が画面にかぶらないように、11/19 夜)
  _fadeNear(cam, wp) {
    if (NO_FADE) return;
    const hd = Math.hypot(cam.position.x - wp.x, cam.position.z - wp.z);
    const up = cam.position.y - wp.y;
    const k = hd < 1.2 && up > -0.3 && up < 2.4 ? clampN((hd - 0.4) / 0.8, 0.12, 1) : 1;
    if (Math.abs(k - (this.fadeK ?? 1)) < 0.02) return;
    this.fadeK = k;
    if (!this.fadeMats) { this.fadeMats = []; this.rig.inner.traverse((o) => { if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.userData.op0 = m.opacity; m.userData.tr0 = m.transparent; m.userData.dw0 = m.depthWrite; this.fadeMats.push(m); } }); }
    for (const m of this.fadeMats) {
      const f = k < 0.999;
      m.opacity = m.userData.op0 * k; m.transparent = f || m.userData.tr0; m.depthWrite = f ? false : m.userData.dw0;
    }
  }
  // 上半身だけの動き(走りの上に重ねる)
  _upperPlay(spec) {
    const r = this.rig;
    const key = spec.clip + '|' + (spec.start || 0) + '|' + (spec.id || '');
    if (r.upKey === key && r.upA) return r.upA;
    r.upClips = r.upClips || {};
    if (!r.upClips[spec.clip]) { const c = base.clips[spec.clip].clone(); c.name = spec.clip + '_upper'; c.tracks = c.tracks.filter((t) => !LOWER_BONES.has(t.name.split('.')[0])); r.upClips[spec.clip] = c; }
    if (r.upA) r.upA.fadeOut(0.1);
    const a = r.mixer.clipAction(r.upClips[spec.clip]);
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.enabled = true; a.time = spec.start || 0;
    a.setEffectiveWeight(9); a.fadeIn(0.1).play();
    r.upA = a; r.upKey = key; r.upName = spec.clip; r.spec = spec;
    return a;
  }
  _upperOff() { const r = this.rig; if (r.upA) r.upA.fadeOut(0.15); r.upA = null; r.upKey = null; r.upName = null; }
  // 体の右(+)・左(-)への速さ
  _lateral() {
    const v = this.vel; if (!v) return 0;
    const y = this.root.rotation.y;
    return v.x * Math.cos(y) - v.z * Math.sin(y);
  }
  // 歩き・小走り・全力を速さで重み付けして混ぜる。再生の速さはそれぞれ「物体の速さ ÷ 元の速さ」(syncWith は使わない)
  _loco(sp) {
    const r = this.rig;
    const W = {};
    // 隣どうしは、切り替わる速さの前後 0.25 m/s だけ混ぜる。元の速さの間を全部混ぜると、歩数の周期が違う 2 つの足が二重になり
    // 着いた足が 2.7〜3.8 m/s 滑った(11/18 測定)。1 つだけで速さを合わせれば 0.2〜0.5
    const L = LOCO.filter((k) => base.clips[k]);
    let i = 0; while (i < L.length - 1 && sp > LOCO_SWITCH[L[i]] + 0.25) i++;
    const sw = LOCO_SWITCH[L[i]];
    if (i < L.length - 1 && sp > sw - 0.25) { const u = (sp - (sw - 0.25)) / 0.5; W[L[i]] = 1 - u; W[L[i + 1]] = u; }
    else W[L[i]] = 1;
    let prim = null; for (const k in W) if (!prim || W[k] > W[prim]) prim = k;
    const key = prim + '|run|';
    if (r.curKey !== key) {
      if (LOCO.includes(r.curName)) {   // 歩き・走りどうしは重みで混ぜているので、そのまま主を替える
        const a = this._action(prim);
        if (!a.isRunning()) { a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.enabled = true; a.play(); }
        r.cur = a; r.curKey = key; r.curName = prim; r.spec = { clip: prim, mode: 'run' }; r.M = base.motions[prim] || {};
      } else this._play({ clip: prim, mode: 'run' });
    }
    r.locoOn = true;
    for (const k of LOCO) {
      const a = r.actions[k];
      const w = W[k] || 0;
      if (w > 0) {
        const b = this._action(k);
        if (!b.isRunning()) { b.reset(); b.setLoop(THREE.LoopRepeat, Infinity); b.enabled = true; b.play(); }
        if (b !== r.cur && b.getEffectiveWeight() < w * 0.5 && b._weightInterpolant) b.stopFading();   // 消えかけの物を戻す
        b.setEffectiveWeight(w);
        b.timeScale = clampN(sp / ((base.motions[k] && base.motions[k].loco_speed) || LOCO_SPEED[k]), 0.55, 1.75);   // Mixamo のその場の走りは表の速さ(loco_speed)
      } else if (a && a.isRunning() && a !== r.cur) a.stop();
    }
  }
  _locoOff() {
    const r = this.rig;
    if (!r.locoOn) return;
    r.locoOn = false;
    for (const k of LOCO) { const a = r.actions[k]; if (a && a !== r.cur && a.isRunning()) a.fadeOut(0.15); }
  }
  // 手の形: 捕った瞬間にグラブを閉じ、球を持っている間は投げ手を握る
  _hands(spec) {
    const r = this.rig;
    const t = r.upA && r.upName === spec.clip ? r.upA.time : r.cur ? r.cur.time : 0;
    const M = base.motions[spec.clip] || {};
    const ev = M.events || {};
    let close = 0, grip = this.holding ? 1 : 0;
    if (ev.catch && (spec.mode === 'once' || spec.mode === 'scrub')) close = t >= ev.catch.t ? Math.max(0, 1 - (t - ev.catch.t) / 0.5) : 0;
    if (ev.release) grip = t < ev.release.t ? 1 : 0;
    if (spec.clip === 'transfer') grip = t >= (ev.ball_in_hand ? ev.ball_in_hand.t : 0.12) ? 1 : 0;
    for (const m of this.parts.Glove.concat(this.parts.Mitt)) if (m.morphTargetDictionary && 'Close' in m.morphTargetDictionary) m.morphTargetInfluences[m.morphTargetDictionary.Close] = close;
    let gripL = this.opt.bat && /^bat_/.test(spec.clip) ? GRIP_BAT : 0;   // バットは両手で握る(左手も指を閉じる、2026-11-19)
    if (gripL) grip = GRIP_BAT;
    if (M.fingers) { grip = 0; gripL = 0; }   // Mixamo の動き(指の骨が動く)は形のキーで握らない
    if (this.mxBody && this.opt.bat && !this.batHidden) {   // バットの形: Mixamo の打撃は右打ち Bat(右手)・左打ち BatL(左手)、ほかの動きは前の形 BatOld(右手)
      const want = M.fingers && /^bat_/.test(spec.clip) ? (/_lh$/.test(spec.clip) ? 'BatL' : 'Bat') : 'BatOld';
      if (want !== this.batShown) { for (const k of ['Bat', 'BatL', 'BatOld']) this.parts[k].forEach((m) => (m.visible = k === want)); this.batShown = want; }
    }
    for (const m of this.parts.Body) if (m.morphTargetDictionary && 'Grip_R' in m.morphTargetDictionary) { m.morphTargetInfluences[m.morphTargetDictionary.Grip_R] = grip; if ('Grip_L' in m.morphTargetDictionary) m.morphTargetInfluences[m.morphTargetDictionary.Grip_L] = gripL; }
  }
}
const _v = V();
const _lq = new THREE.Quaternion(), _lqp = new THREE.Quaternion(), _lqw = new THREE.Quaternion(), _lqt = new THREE.Quaternion(), _lax = V();
const LOWER_BONES = new Set(['root', 'pelvis', 'spine_01', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r'].flatMap((n) => [n, BONE_MAP[n]]));
// 歩き・走りの元の速さ(m/s)。表(docs動きの一覧_v3.md)の値ではなく、実測の表(11/18 作り直し)
const LOCO = ['walk', 'run_jog', 'run_fast', 'run_sprint'];
const LOCO_SPEED = { walk: 1.25, run_jog: 2.77, run_fast: 5.0, run_sprint: 8.0, run_mocap: 3.5, run_backpedal: 2.4, lead_shuffle: 2.6 };
const clampN = (x, a, b) => Math.max(a, Math.min(b, x));
function isShown(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }
export function updateAthletes(cam, dt) { for (const a of ALL) a._update(cam, dt); }
