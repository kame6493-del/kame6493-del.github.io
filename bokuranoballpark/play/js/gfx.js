// 見た目の作り(11/18): 画質の段(最高/高画質/標準/軽量)・空(物理の空と雲・星)・空から作る環境の光・太陽の影(カメラについて行く)・
// 後処理(SSAO・ブルーム・色の補正)・地面(芝と土)の細かさ・球場の材質。引き継ぎは docs/画質の引き継ぎ.md。
// 光源は増やさない(平行光 1・半球光 1・スポット 4 まで。Windows の Chrome はユニフォーム 1024 ベクトルが上限)。
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// ---------------------------------------------------------------- 画質の段
// pr: 画面の細かさ(端末の倍率 d から)/ shadow: 影の地図の大きさ(0 = 影なし)と範囲(半分の幅 m)/ ao: SSAO / bloom / detail: 地面の細かさの絵
export const QUALS = {
  ultra: { label: '最高', pr: (d, touch) => (touch ? Math.min(d, 3) : Math.min(Math.max(d, 2), 3)), shadow: 4096, S: 105, ao: { half: false, n: 16, k: 1.0, r: 0.75 }, bloom: true, detail: '2k', aniso: 16, post: true, msaa: 4, crowd: 'ultra', lod: 150, clouds: 6 },
  high: { label: '高画質', pr: (d, touch) => (touch ? Math.min(d, 2) : Math.min(Math.max(d, 1.5), 2)), shadow: 4096, S: 140, ao: { half: true, n: 10, k: 0.8, r: 0.6 }, bloom: true, detail: '1k', aniso: 16, post: true, msaa: 4, crowd: 'std', lod: 120, clouds: 5 },
  std: { label: '標準', pr: (d, touch) => (touch ? Math.min(d, 1.5) : Math.min(d, 2)), shadow: 4096, S: 170, ao: null, bloom: false, detail: '1k', aniso: 8, post: false, msaa: 0, crowd: 'std', lod: 110, clouds: 4 },
  lite: { label: '軽量', pr: (d) => Math.min(d, 1.25), shadow: 0, S: 170, ao: null, bloom: false, detail: '1k', aniso: 4, post: false, msaa: 0, crowd: 'lite', lod: 60, clouds: 3 },
};
export const QUAL_ORDER = ['ultra', 'high', 'std', 'lite'];

// ---------------------------------------------------------------- スマホ(11/19 午後 持ち主「スマホで最高画質だとめっちゃ重かった。要らない」。docs/スマホ対応の引き継ぎ.md)
// スマホ(タッチ)の札は 自動・標準・軽量 だけ(最高・高画質の後処理と 4096 の影はスマホでは重い)。初めは「自動」。
// 自動: 模型は軽量と同じ lite の glb。遊んでいる間の fps を 2 秒ずつ測り、落ちたら段を下げ、余裕が続けば 1 段上げる(下の AUTO_LV)。
export const TOUCH_ORDER = ['auto', 'std', 'lite'];
QUALS.auto = { label: '自動', pr: (d) => Math.min(d, 1.25), shadow: 0, S: 70, ao: null, bloom: false, detail: '1k', aniso: 4, post: false, msaa: 0, crowd: 'lite', lod: 45, clouds: 3, auto: true };
// 自動の段。pr: 画面の細かさの上限 / crowd: 近くの観客の人の形(lite 7m・std 15m)/ lod: 選手を骨入りの体で描く距離 / walk: 歩く人の形の数 /
// cull: 小さい物(半径 2.5m まで)を描く距離(0 = 全部)/ indoor: 屋内の物(コンコース・売店・裏の部屋)を描く距離 [席・グラウンドにいる時(壁の向こう), コンコースにいる時] / detail: 芝・土の細かさの絵 / shadow: 太陽の影(上の段だけ。入れ切りは止まっている間に)
export const AUTO_LV = [
  { pr: 0.8, crowd: 'min', lod: 18, walk: 3, cull: 40, indoor: [25, 60], detail: 0, shadow: 0 },
  { pr: 1.0, crowd: 'lite', lod: 28, walk: 5, cull: 65, indoor: [30, 80], detail: 1, shadow: 0 },
  { pr: 1.25, crowd: 'lite', lod: 45, walk: 8, cull: 100, indoor: [40, 100], detail: 1, shadow: 0 },   // 初め(前の「軽量」と同じ細かさ)
  { pr: 1.5, crowd: 'lite', lod: 60, walk: 8, cull: 150, indoor: [55, 140], detail: 1, shadow: 0 },
  { pr: 2.0, crowd: 'std', lod: 80, walk: 8, cull: 0, indoor: null, detail: 1, shadow: 2048, S: 70 },
];
const AUTO_START = 2, AUTO_DOWN = 44, AUTO_UP = 57;   // 目標は 1 秒 45〜60 こま(描くのは 60 まで)

// ---------------------------------------------------------------- 空(three の物理の空 Preetham に、雲・星・夜の色を足す)
const SKY_FRAG_ADD = /* glsl */`
uniform float uGain, uTime, uCloud, uNight, uNoDisk;
uniform vec3 uCloudTint, uNightTop, uNightHorizon;
float sHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float sNoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1, 0)), u.x), mix(sHash(i + vec2(0, 1)), sHash(i + vec2(1, 1)), u.x), u.y); }
float sFbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < CLOUD_OCT; i++) { s += a * sNoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
`;
const SKY_FRAG_END = /* glsl */`
  vec3 sc = retColor * uGain;
  // 夜: 暗い空(照明の明かりで地平線が少し明るい)と星
  if (uNight > 0.0) {
    float hh = max(direction.y, 0.0);
    vec3 nc = mix(uNightHorizon, uNightTop, pow(hh, 0.45));
    vec3 q = floor(direction * 420.0);
    float st = step(0.9982, sHash(q.xy + q.z * 17.13)) * smoothstep(0.08, 0.3, direction.y) * (0.5 + 0.5 * sHash(q.yz));
    nc += vec3(0.85, 0.9, 1.0) * st * 0.9;
    sc = mix(sc, nc, uNight);
  }
  // 雲(高い所の薄い雲の層。地平線ほど薄く)
  if (uCloud > 0.0 && direction.y > 0.0) {
    vec2 cp = direction.xz / (direction.y + 0.12) * 1.15 + vec2(uTime * 0.004, uTime * 0.0015);
    float n = sFbm(cp * 1.4);
    float cov = smoothstep(0.62 - uCloud * 0.32, 0.95 - uCloud * 0.3, n);
    float shade = sFbm(cp * 2.3 + 3.1);
    float sunSide = pow(max(dot(direction, vSunDirection), 0.0), 6.0);
    vec3 cc = uCloudTint * (0.78 + 0.32 * shade + 0.45 * sunSide);
    float a = cov * smoothstep(0.0, 0.18, direction.y) * 0.9;
    sc = mix(sc, cc, a);
  }
  if (uNoDisk > 0.5) sc = min(sc, vec3(4.0));
  gl_FragColor = vec4(sc, 1.0);
`;
function makeSkyMaterial(oct) {
  const S = Sky.SkyShader;
  const uniforms = THREE.UniformsUtils.clone(S.uniforms);
  Object.assign(uniforms, {
    uGain: { value: 0.5 }, uTime: { value: 0 }, uCloud: { value: 0.4 }, uNight: { value: 0 }, uNoDisk: { value: 0 },
    uCloudTint: { value: new THREE.Color(1, 1, 1) }, uNightTop: { value: new THREE.Color(0x04060c) }, uNightHorizon: { value: new THREE.Color(0x1b2436) },
  });
  let frag = S.fragmentShader.replace('void main() {', SKY_FRAG_ADD + '\nvoid main() {')
    .replace('gl_FragColor = vec4( retColor, 1.0 );', SKY_FRAG_END);
  return new THREE.ShaderMaterial({
    name: 'SkyR11', uniforms, vertexShader: S.vertexShader, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, fog: false,
    defines: { CLOUD_OCT: oct },
  });
}

// 時間帯ごとの空。sky: Preetham の値 / gain: 明るさ / cloud: 雲の量と色 / env: 環境の光を空から作るか
const SKYS = {
  koshien: {
    day: { turbidity: 2.6, rayleigh: 1.1, mie: 0.004, g: 0.8, gain: 0.42, cloud: 0.42, tint: 0xf2f5fa, night: 0, env: 'sky' },
    night: { turbidity: 2, rayleigh: 1, mie: 0.003, g: 0.8, gain: 0.0, cloud: 0.25, tint: 0x232a38, night: 1, env: 'room' },
  },
  dome: {
    day: { turbidity: 2.6, rayleigh: 1.1, mie: 0.004, g: 0.8, gain: 0.42, cloud: 0.4, tint: 0xf2f5fa, night: 0, env: 'room' },
    night: { turbidity: 2, rayleigh: 1, mie: 0.003, g: 0.8, gain: 0.0, cloud: 0.2, tint: 0x1c222e, night: 1, env: 'room' },
  },
};

// ---------------------------------------------------------------- SSAO(深さだけから。人や観客の特別なシェーダーでも正しく効く)
const AO_FRAG = /* glsl */`
#include <packing>
uniform sampler2D tDepth; uniform mat4 uProj, uProjInv; uniform vec2 uRes; uniform float uRadius, uIntensity;
varying vec2 vUv;
vec3 vpos(vec2 uv) { float d = textureLod(tDepth, uv, 0.0).x; vec4 c = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return c.xyz / c.w; }
void main() {
  float d0 = textureLod(tDepth, vUv, 0.0).x;
  if (d0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 p = vpos(vUv);
  vec2 px = 1.0 / uRes;
  vec3 pr = vpos(vUv + vec2(px.x, 0.0)), pl = vpos(vUv - vec2(px.x, 0.0)), pu = vpos(vUv + vec2(0.0, px.y)), pd = vpos(vUv - vec2(0.0, px.y));
  vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl;
  vec3 dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
  vec3 n = normalize(cross(dx, dy));
  float z = -p.z;
  float rpx = uRadius * uProj[1][1] * 0.5 * uRes.y / z;
  if (rpx < 1.5 || z > 220.0) { gl_FragColor = vec4(1.0); return; }
  rpx = min(rpx, 90.0);
  float ang = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float occ = 0.0; float r2 = uRadius * uRadius;
  for (int i = 0; i < AO_N; i++) {
    float t = (float(i) + 0.5) / float(AO_N);
    float a = ang + float(i) * 2.3999632;
    vec2 suv = vUv + vec2(cos(a), sin(a)) * sqrt(t) * rpx * px;
    vec3 v = vpos(suv) - p;
    float vv = dot(v, v);
    float f = max(0.0, 1.0 - vv / r2);
    occ += f * f * max(0.0, dot(v, n) * inversesqrt(vv + 1e-6) - 0.12);
  }
  float ao = clamp(1.0 - uIntensity * 1.6 * occ / float(AO_N), 0.0, 1.0);
  ao = mix(ao, 1.0, smoothstep(120.0, 220.0, z));
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}`;
const AO_COMP = /* glsl */`
uniform sampler2D tDiffuse, tAO, tDepth; uniform vec2 uAORes; uniform float uNear, uFar;
varying vec2 vUv;
#include <packing>
float lz(vec2 uv) { return -perspectiveDepthToViewZ(textureLod(tDepth, uv, 0.0).x, uNear, uFar); }
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  c.rgb = clamp(c.rgb, vec3(0.0), vec3(60.0));   // NaN・極端な値を後ろ(ブルーム)へ流さない(流れると黒い四角に広がる)
  float z0 = lz(vUv);
  float s = 0.0, w = 0.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 uv = vUv + vec2(float(i), float(j)) / uAORes;
    float ww = exp(-abs(lz(uv) - z0) / (0.02 * z0 + 0.02)) * (1.0 - 0.12 * float(abs(i) + abs(j)));
    s += textureLod(tAO, uv, 0.0).r * ww; w += ww;
  }
  float ao = s / max(w, 1e-4);
  gl_FragColor = vec4(c.rgb * ao, c.a);
}`;
const QUAD_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
class AOPass extends Pass {
  constructor(camera, o) {
    super();
    this.camera = camera; this.o = o;
    this.aoRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.aoMat = new THREE.ShaderMaterial({ defines: { AO_N: o.n }, vertexShader: QUAD_VERT, fragmentShader: AO_FRAG,
      uniforms: { tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2() }, uRadius: { value: o.r }, uIntensity: { value: o.k } } });
    this.compMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: AO_COMP,
      uniforms: { tDiffuse: { value: null }, tAO: { value: this.aoRT.texture }, tDepth: { value: null }, uAORes: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 1000 } } });
    this.q1 = new FullScreenQuad(this.aoMat); this.q2 = new FullScreenQuad(this.compMat);
  }
  setSize(w, h) { const k = this.o.half ? 0.5 : 1; this.aoRT.setSize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))); this.compMat.uniforms.uAORes.value.set(this.aoRT.width, this.aoRT.height); this.aoMat.uniforms.uRes.value.set(this.aoRT.width, this.aoRT.height); }
  render(renderer, writeBuffer, readBuffer) {
    const c = this.camera, U = this.aoMat.uniforms;
    U.tDepth.value = readBuffer.depthTexture; U.uProj.value.copy(c.projectionMatrix); U.uProjInv.value.copy(c.projectionMatrixInverse);
    renderer.setRenderTarget(this.aoRT); this.q1.render(renderer);
    const V = this.compMat.uniforms;
    V.tDiffuse.value = readBuffer.texture; V.tDepth.value = readBuffer.depthTexture; V.uNear.value = c.near; V.uFar.value = c.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.q2.render(renderer);
  }
}
// 色の補正(表示の色で: 彩度・コントラストを少し・周りをほんの少し暗く・帯のむらを消す細かい揺らぎ)
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.07 }, uCon: { value: 1.04 }, uVig: { value: 0.18 } },
  vertexShader: QUAD_VERT,
  fragmentShader: /* glsl */`uniform sampler2D tDiffuse; uniform float uSat, uCon, uVig; varying vec2 vUv;
    void main() { vec4 t = texture2D(tDiffuse, vUv); vec3 c = t.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, uSat); c = (c - 0.5) * uCon + 0.5;
      float v = smoothstep(0.95, 0.3, length((vUv - 0.5) * vec2(1.25, 1.0))); c *= mix(1.0, v, uVig);
      c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), t.a); }`,
};

// ---------------------------------------------------------------- 地面の細かさ(芝・土。世界の位置で並べる絵 + 大きなむら + 芝の刈り目)
const GROUND_COMMON = /* glsl */`
uniform sampler2D uGDet; uniform float uGK;
varying vec3 vGWorld;
float gHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gNoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), u.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), u.x), u.y); }
`;
function groundPatch(m, opt, U) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uGDet = U[opt.kind].tex; sh.uniforms.uGK = U.k;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const D = `#define GTILE ${opt.tile.toFixed(2)}\n#define GALB ${opt.alb.toFixed(2)}\n#define GNRM ${opt.nrm.toFixed(2)}\n#define GVAR ${opt.vary.toFixed(3)}\n#define GFAR ${opt.far.toFixed(1)}\n${opt.stripe ? '#define GSTRIPE 1\n' : ''}${opt.noTex ? '#define GNOTEX 1\n' : ''}`;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + D + GROUND_COMMON)
      .replace('#include <map_fragment>', /* glsl */`#include <map_fragment>
        vec2 gp = vGWorld.xz;
        float gdist = length(vGWorld - cameraPosition);
        float gk = uGK * (1.0 - smoothstep(GFAR * 0.45, GFAR, gdist));
        vec3 gd1 = vec3(0.5, 0.5, 0.5), gd2 = vec3(0.5, 0.5, 0.5);
        #ifndef GNOTEX
        if (gk > 0.001) { gd1 = texture2D(uGDet, gp / GTILE).rgb; gd2 = texture2D(uGDet, mat2(0.8, -0.6, 0.6, 0.8) * gp / (GTILE * 3.7) + 0.37).rgb; }
        #endif
        float gr = 1.0 + ((gd1.b * 2.0 - 1.0) + (gd2.b * 2.0 - 1.0) * 0.6) * GALB * gk;
        float gvn = gNoise(gp * 0.045) * 0.6 + gNoise(gp * 0.19) * 0.4;
        gr *= 1.0 + (gvn - 0.5) * GVAR * step(0.001, uGK);
        #ifdef GSTRIPE
        { // 刈り目: 本塁から中堅へ向かう線に直角の帯(見る向きで明るさが入れ替わる)
          float band = gp.y / 4.6; float s = smoothstep(0.42, 0.58, abs(fract(band) - 0.5) * 2.0) * 2.0 - 1.0;
          vec2 vd = normalize(cameraPosition.xz - gp + 1e-4);
          gr *= 1.0 + s * (0.035 + 0.05 * vd.y) * step(0.001, uGK);
        }
        #endif
        diffuseColor.rgb *= gr;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * (1.0 + (0.5 - gd1.b) * 0.5 * gk), 0.35, 1.0);')
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
        #ifndef GNOTEX
        if (gk > 0.001) { vec2 gn2 = (gd1.rg * 2.0 - 1.0) + (gd2.rg * 2.0 - 1.0) * 0.5; vec3 gdw = vec3(gn2.x, 0.0, gn2.y) * gk * GNRM; normal = normalize(normal + (viewMatrix * vec4(gdw, 0.0)).xyz); }
        #endif`);
  };
  const key = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => '';
  m.customProgramCacheKey = () => key() + '|ground:' + JSON.stringify(opt);
  m.needsUpdate = true;
}

// ---------------------------------------------------------------- 本体
export function createGfx({ renderer, scene, camera, sun, hemi, dome, touch, shot, onAuto, autoStore, openView }) {
  const stadium = dome ? 'dome' : 'koshien';
  const d = window.devicePixelRatio || 1;
  let qk = 'std', Q = QUALS.std, timeKey = 'day';
  const sunDir = new THREE.Vector3(0, 1, 0);
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 空
  let skyMat = makeSkyMaterial(4);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);
  // 環境の光(空から作る。夜とドームは部屋の環境)
  const pmrem = new THREE.PMREMGenerator(renderer);
  let roomRT = pmrem.fromScene(new RoomEnvironment(), 0.04), room = roomRT.texture, envKind = 'room';
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat);
  envScene.add(envSky);
  let envRT = null;
  function buildEnv(kind) {
    envKind = kind;
    if (kind !== 'sky') { scene.environment = room; return; }
    const u = skyMat.uniforms; const nd = u.uNoDisk.value, tm = u.uTime.value; u.uNoDisk.value = 1; u.uTime.value = 0;
    envSky.material = skyMat;
    const rt = pmrem.fromScene(envScene, 0, 0.1, 200);
    u.uNoDisk.value = nd; u.uTime.value = tm;
    if (envRT) envRT.dispose();
    envRT = rt; scene.environment = rt.texture;
  }

  // 地面の細かさの絵
  const loader = new THREE.TextureLoader();
  const GU = { soil: { tex: { value: null } }, grass: { tex: { value: null } }, k: { value: 0 } };
  const loaded = {};
  function loadDetail(size) {
    if (!size) return;
    for (const kind of ['soil', 'grass']) {
      const key = kind + size;
      if (loaded[key]) { GU[kind].tex.value = loaded[key]; continue; }
      const t = loader.load(`models/tex/detail_${kind}_${size}.jpg`, () => { if (Q.detail === size) GU[kind].tex.value = t; });
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 16;
      loaded[key] = t;
      if (!GU[kind].tex.value) GU[kind].tex.value = t;
    }
  }
  const fabric = loader.load('models/tex/detail_fabric_512.jpg');
  fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping; fabric.colorSpace = THREE.NoColorSpace; fabric.anisotropy = 8;

  // スマホ: 模型の絵を小さくしてから GPU に送る(浜風は絵が 200 枚・約 350MB あり、スマホでは落ちる元)。
  // 繰り返して貼る材質の絵(〜_albedo・床・壁など)は 512、看板・字の絵などそのほかは 1024 まで。?fulltex=1 で小さくしない
  const TEX_MAX = touch && !/[?&]fulltex=/.test(location.search) ? 1024 : 0;
  const TEX_TILE = /(_albedo|_normal|_rough|_orm|_ao$|floor|wall|tile|paving|ceiling|concrete|asphalt|brick|metal|steel|galvalume|louver|padding|chalk|turf|grass|soil)/i;
  let texSaved = 0;
  function shrinkTex(t) {
    if (!TEX_MAX || !t || !t.isTexture || t.isCompressedTexture || t.isDataTexture || t.isCanvasTexture || t.isVideoTexture || t.userData.shrunk) return;
    t.userData.shrunk = true;
    const im = t.image, w = im && im.width, h = im && im.height;
    if (!w || !h || typeof document === 'undefined' || !((typeof ImageBitmap !== 'undefined' && im instanceof ImageBitmap) || (typeof HTMLImageElement !== 'undefined' && im instanceof HTMLImageElement))) return;   // 後で描き直す絵(canvas)は触らない
    const lim = TEX_TILE.test(t.name || '') ? 512 : TEX_MAX, k = lim / Math.max(w, h);
    if (k >= 1) return;
    try {
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      t.image = c; t.needsUpdate = true; texSaved += w * h - c.width * c.height;
    } catch (e) { /* 描けない絵はそのまま */ }
  }
  // スマホの「自動」: 小さい物(半径 2.5m まで)を遠くでは描かない。visible をほかの所(屋内の出し入れなど)と取り合わないよう、
  // その物だけ visible を「ほかの所が決めた値 かつ 近い」に替える(当たり判定・光線は描く形と関係ないので変わらない)
  const culls = [];
  const _s = new THREE.Sphere();
  // indoor: 屋内の物(コンコース・売店・裏の部屋。main.js の indoorMeshes)は大きさによらず、席から遠い所を描かない(壁の向こうで見えない「遠くの店の中身」)
  function addCull(o, indoor) {
    const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    if (!g.boundingSphere) return;
    o.updateMatrixWorld(true);
    _s.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
    const old = culls.find((c) => c.o === o);
    if (old) { if (indoor) old.indoor = true; return; }
    if (!indoor && !(_s.radius <= 2.5)) return;
    const d = Object.getOwnPropertyDescriptor(o, 'visible'); if (!d || !('value' in d)) return;
    let want = d.value; const c = { o, x: _s.center.x, y: _s.center.y, z: _s.center.z, r: _s.radius, far: false, indoor: !!indoor, max: o.userData.cullMax || 0 };   // max: その物だけの描く距離の上限(11/21 スマホの interior.glb の区切り)
    Object.defineProperty(o, 'visible', { configurable: true, enumerable: true, get() { return want && !c.far; }, set(v) { want = v; } });
    culls.push(c);
  }

  // 材質の手直し(読み込んだ球場のモデルに 1 回だけ)
  const mapped = [];
  function patchModel(root) {
    if (touch) root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (touch && !o.isInstancedMesh && !o.isSkinnedMesh && o.geometry && !o.userData.cullK) { o.userData.cullK = 1; addCull(o); }
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (!m || m.userData.gfx) continue;
        m.userData.gfx = true;
        const n = m.name || '';
        if (TEX_MAX) for (const k in m) { const t = m[k]; if (t && t.isTexture && k !== 'envMap') shrinkTex(t); }
        for (const k of ['map', 'normalMap', 'roughnessMap']) if (m[k]) mapped.push(m[k]);
        // 芝・土
        if (n === 'grass' || n === 'turf') groundPatch(m, { kind: 'grass', tile: 2.2, alb: 0.75, nrm: 0.55, vary: 0.12, far: 90, stripe: !dome }, GU);
        else if (n === 'turf_stripe') groundPatch(m, { kind: 'grass', tile: 2.2, alb: 0.75, nrm: 0.55, vary: 0.08, far: 90, stripe: false }, GU);
        else if (n === 'soil_black' || n === 'dirt' || n === 'r8_mound') groundPatch(m, { kind: 'soil', tile: 3.0, alb: 2.6, nrm: 1.1, vary: 0.07, far: 70, stripe: false }, GU);
        else if (n.startsWith('ivy')) groundPatch(m, { kind: 'grass', tile: 1, alb: 0, nrm: 0, vary: 0.35, far: 1, stripe: false, noTex: true }, GU);
        // 金属(銀傘・鉄骨・手すり・ルーバー): 金属らしく
        else if (/galvalume|roof_under|steel|louver|r8_rail|seat_frame|r8_lamp_pole|r8_pipe|r8_duct|shutter/.test(n)) {
          if (m.metalness !== undefined) { m.metalness = Math.max(m.metalness, /roof_under|galvalume/.test(n) ? 0.65 : 0.55); m.roughness = Math.min(m.roughness, 0.42); }
        }
        // 座席: 樹脂の光沢
        else if (/^seat/.test(n)) { m.roughness = 0.34; }
        else if (/chainlink/.test(n)) { m.metalness = 0.7; m.roughness = 0.38; }
        else if (/padding/.test(n)) { m.roughness = 0.72; }
        else if (/foul_pole/.test(n)) { m.roughness = 0.32; }
      }
    });
    setAniso();
    // スマホ: 球場の模型は動かないので、毎フレームの行列の計算をやめる(浜風は 1,000 個を超える)。
    // 動かす物(列車など)は自分で matrix と matrixWorldNeedsUpdate を書くので、そのまま動く。?nofreeze=1 で止めない
    if (touch && !/[?&]nofreeze=/.test(location.search)) root.traverse((o) => { if (!o.isSkinnedMesh && !o.isBone) { o.updateMatrix(); o.matrixAutoUpdate = false; } });
  }
  function setAniso() { for (const t of mapped) if (t.anisotropy !== Q.aniso) { t.anisotropy = Q.aniso; t.needsUpdate = true; } }

  // 後処理
  let composer = null, aoPass = null, bloom = null, grade = null;
  function size() { const pr = Q.pr(d, touch); return { w: Math.round(innerWidth * pr), h: Math.round(innerHeight * pr), pr }; }
  function buildComposer() {
    if (composer) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); composer = null; }
    if (aoPass) { aoPass.aoRT.dispose(); aoPass = null; }
    if (bloom) { bloom.dispose(); bloom = null; }
    if (!Q.post) return;
    const { w, h } = size();
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: Q.msaa });
    rt.depthTexture = new THREE.DepthTexture(w, h, THREE.FloatType);
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    if (Q.ao) { aoPass = new AOPass(camera, Q.ao); composer.addPass(aoPass); }
    if (Q.bloom) { bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.2, 0.55, 1.0); composer.addPass(bloom); }
    composer.addPass(new OutputPass());
    grade = new ShaderPass(GradeShader); composer.addPass(grade);
    composer.setSize(w, h);
    applyBloom();
  }
  function applyBloom() {
    if (!bloom) return;
    const night = timeKey === 'night';
    bloom.strength = night ? 0.38 : 0.14;
    bloom.threshold = night ? 1.6 : 1.2;
    bloom.radius = night ? 0.6 : 0.45;
  }
  function resize() {
    const { w, h, pr } = size();
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight, false);
    if (composer) composer.setSize(w, h);
  }
  addEventListener('resize', () => setTimeout(resize, 0));

  function shadowOn(t) { return Q.shadow > 0 && (t.shadow || dome || timeKey === 'night'); }
  // 11/26 記憶(iOS で「重くて落ちる」): スマホの影の地図は 2048 まで(標準の 4096 は色と深さで 128MB → 32MB)。?fullshadow=1 で前の形
  const SH_MAX = touch && !/[?&]fullshadow=/.test(location.search) ? 2048 : 1e9;
  const shSize = () => Math.min(Q.shadow, SH_MAX);
  let curT = null, shadowMute = false;
  function applyShadow(t) {
    curT = t;
    if (Q.auto) { autoShadow(true); return; }
    shadowMute = false;
    const on = shadowOn(t);
    renderer.shadowMap.enabled = Q.shadow > 0;
    sun.castShadow = on;
    if (on && sun.shadow.mapSize.x !== shSize()) { sun.shadow.mapSize.set(shSize(), shSize()); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    const S = Q.S;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.035 * (S / 105);
  }

  // ---------------------------------------------------------------- 自動(スマホ)
  let autoLv = AUTO_START, autoCeil = AUTO_LV.length - 1, autoUpAt = -1e9, autoFps = 0;
  let memCeil = AUTO_LV.length - 1;   // 11/26 記憶の天井(前の起動が落ちた・描く所が失われた時に下げる。js/memguard.js)
  const aw = { t0: 0, last: 0, n: 0, sum: 0, good: 0, bad: 0, settle: 1, play: 0, keep: -1 }, autoLog = [];
  // 11/25 覚える段: 遊び始めて 15 秒の内に下げた段は、その場では使うが次の起動には残さない(始めの重さ・作りの引っかかりで下がった段を持ち越さない)。
  // 15 秒を過ぎても同じ段で遊べていたら、その時に覚える
  const KEEP_AFTER = 15000;
  function autoQ(i) {
    const L = AUTO_LV[i];
    return Object.assign({}, QUALS.auto, { pr: (dd) => Math.min(dd, L.pr), shadow: L.shadow || 0, S: L.S || 70, crowd: L.crowd, lod: L.lod, walk: L.walk, cull: L.cull, indoor: L.indoor, detailK: L.detail, lv: i });
  }
  // 影の入れ切りは、すべての材質の作り直し(スマホで 1〜数秒止まる)になるので、遊んでいる間はしない。
  // 切る時は、影を描く範囲を 0 にして(作り直さずに)すぐ消し、止まっている間(メニュー・一時停止・始める時)に本当に切る。入れる時も止まっている間だけ
  function autoShadow(idleNow) {
    const want = !!(Q.shadow > 0 && curT && (curT.shadow || dome || timeKey === 'night'));
    if (want === sun.castShadow) { shadowMute = false; }
    else if (!want) { shadowMute = true; if (idleNow) { sun.castShadow = false; renderer.shadowMap.enabled = false; shadowMute = false; } }
    else if (idleNow) {
      if (sun.shadow.mapSize.x !== shSize()) { sun.shadow.mapSize.set(shSize(), shSize()); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
      renderer.shadowMap.enabled = true; sun.castShadow = true; shadowMute = false;
      sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.035 * (Q.S / 105);
    } else shadowMute = !sun.castShadow ? false : shadowMute;
    if (sun.castShadow && !shadowMute) { const S = Q.S; Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S }); sun.shadow.camera.updateProjectionMatrix(); }
  }
  function setLv(i, why) {
    i = Math.max(0, Math.min(AUTO_LV.length - 1, i));
    if (i === autoLv && Q.lv === i) return;
    autoLog.push({ t: Math.round(performance.now() / 100) / 10, from: autoLv, to: i, fps: Math.round(autoFps), why });
    if (autoLog.length > 30) autoLog.shift();
    autoLv = i; Q = autoQ(i);
    GU.k.value = Q.detailK;
    resize();
    autoShadow(false);
    cullTick(true);
    if (why === 'down' && aw.play < KEEP_AFTER) aw.keep = i;   // まだ覚えない(下の autoTick で 15 秒を過ぎたら覚える)
    else { aw.keep = -1; if (autoStore) try { autoStore.set(i); } catch (e) { /* 使えない環境 */ } }
    if (onAuto) onAuto(Q);
  }
  // 遊んでいる間だけ、2 秒ずつの fps で決める(メニュー・一時停止・隠れている間は測らない)。fps は 0.25 秒を超える 1 こま(読み込み・作り直しの引っかかり)を除いた、ふだんの速さ。
  // 44 を下回るのが 2 回(4 秒)続いたら 1 段下げる(25 を下回ったら 1 回で)。57 以上が 3 回(6 秒)続いたら 1 段上げる。
  // 上げて 20 秒の内に落ちた段へは、その後は上げない(行ったり来たりしない)
  function autoTick(now, idle) {
    if (qk !== 'auto') return;
    if (idle) { aw.t0 = 0; aw.good = 0; aw.bad = 0; aw.settle = 1; aw.play = 0; aw.keep = -1; if (sun.castShadow !== !!(Q.shadow > 0 && curT && (curT.shadow || dome || timeKey === 'night'))) autoShadow(true); return; }
    if (!aw.t0) { aw.t0 = aw.last = now; aw.n = 0; aw.sum = 0; return; }
    const dtf = now - aw.last; aw.last = now;
    aw.play += Math.min(dtf, 250);
    if (aw.keep >= 0 && aw.play >= KEEP_AFTER) { if (aw.keep === autoLv && autoStore) try { autoStore.set(autoLv); } catch (e) { /* 使えない環境 */ } aw.keep = -1; }
    if (dtf <= 250) { aw.n++; aw.sum += dtf; }
    const span = now - aw.t0;
    if (span < 2000) return;
    const f = aw.sum > 400 ? aw.n * 1000 / aw.sum : 0, ok = aw.sum > 400; aw.t0 = now; aw.n = 0; aw.sum = 0;
    if (!ok) return;   // ほとんど止まっていた(裏に回った・長い読み込み)
    autoFps = f;
    if (aw.settle > 0) { aw.settle--; return; }   // 段を替えた直後・始めた直後は 1 回見送る
    if (f < AUTO_DOWN && autoLv > 0) {
      aw.good = 0;
      if (++aw.bad >= 2 || f < 25) {
        if (now - autoUpAt < 20000) autoCeil = Math.min(autoCeil, autoLv - 1);
        setLv(autoLv - 1, 'down'); aw.bad = 0; aw.settle = 1;
      }
    } else if (f >= AUTO_UP) {
      aw.bad = 0;
      if (++aw.good >= 3 && autoLv < autoCeil) { setLv(autoLv + 1, 'up'); autoUpAt = now; aw.good = 0; aw.settle = 1; }
    } else { aw.good = 0; aw.bad = 0; }
  }
  // 小さい物を遠くで描かない(自動の時だけ。0.25 秒ごと)
  let cullT = 0, cullOn = false;
  function cullTick(force) {
    const now = performance.now();
    if (!force && now - cullT < 250) return;
    cullT = now;
    // 自動は段ごと。スマホで選んだ「軽量」は自動の段 1 と同じ距離
    const L = qk === 'auto' ? Q : touch && qk === 'lite' ? AUTO_LV[1] : null;
    const D = L ? (L.cull || 0) : 0, DI = L && L.indoor ? L.indoor[openView && openView() ? 0 : 1] : 0;   // openView: 席・グラウンドにいる(main.js)
    if (!D && !DI) { if (cullOn) { for (const c of culls) c.far = false; cullOn = false; } return; }
    cullOn = true;
    const p = camera.position;
    for (const c of culls) { const d0 = c.indoor ? Math.min(DI || 1e9, D || 1e9, c.max || 1e9) : D; if (!d0 || d0 >= 1e9) { c.far = false; continue; } const dx = c.x - p.x, dy = c.y - p.y, dz = c.z - p.z, R = d0 + c.r; c.far = dx * dx + dy * dy + dz * dz > R * R; }
  }

  function setQuality(q) {
    qk = QUALS[q] ? q : 'std'; Q = QUALS[qk];
    if (qk === 'auto') {
      let s0 = AUTO_START; if (autoStore) try { const v = autoStore.get(); if (Number.isFinite(v)) s0 = Math.max(0, Math.min(3, v)); } catch (e) { /* 使えない環境 */ }
      s0 = Math.min(s0, memCeil); autoLv = s0; autoCeil = memCeil; Q = autoQ(autoLv); aw.settle = 1;
    }
    loadDetail(Q.detail);
    if (Q.detail) for (const kind of ['soil', 'grass']) if (loaded[kind + Q.detail]) GU[kind].tex.value = loaded[kind + Q.detail];
    GU.k.value = Q.auto ? Q.detailK : Q.detail ? 1 : 0;
    if (skyMat.defines.CLOUD_OCT !== Q.clouds) { skyMat.defines.CLOUD_OCT = Q.clouds; skyMat.needsUpdate = true; }
    setAniso();
    resize();
    buildComposer();
    if (curT) applyShadow(curT);
    cullTick(true);
    if (Q.auto && onAuto) onAuto(Q);
    return Q;
  }

  // 時間帯: t は main.js の TIMES の 1 つ
  function setTime(t, key) {
    timeKey = key;
    sunDir.set(...t.sunPos).normalize();
    const s = SKYS[stadium][key] || SKYS[stadium].day;
    const u = skyMat.uniforms;
    u.turbidity.value = s.turbidity; u.rayleigh.value = s.rayleigh; u.mieCoefficient.value = s.mie; u.mieDirectionalG.value = s.g;
    u.sunPosition.value.copy(sunDir);
    if (s.sunY != null) { const h = Math.hypot(sunDir.x, sunDir.z) || 1; u.sunPosition.value.set(sunDir.x / h, s.sunY, sunDir.z / h).normalize(); }
    u.uGain.value = s.gain; u.uCloud.value = s.cloud; u.uCloudTint.value.set(s.tint); u.uNight.value = s.night;
    u.uNightTop.value.set(t.top); u.uNightHorizon.value.set(t.horizon);
    buildEnv(s.env);
    applyShadow(t);
    applyBloom();
  }

  // 影の範囲をカメラの前について行かせる(選手の近くを細かく)。屋根の球場と夜は、高い所(屋根・照明塔)の影を落とさない
  const _f = new THREE.Vector3(), _c = new THREE.Vector3();
  let skyT = 0;
  function update(dt) {
    sky.position.copy(camera.position);
    if (!shot) { skyT += dt || 0; skyMat.uniforms.uTime.value = skyT; }
    cullTick(false);
    if (!sun.castShadow) return;
    camera.getWorldDirection(_f); _f.y = 0; if (_f.lengthSq() < 1e-6) _f.set(0, 0, -1); _f.normalize();
    const S = shadowMute ? 0.02 : Q.S;   // 自動で影を消す途中(作り直しを待つ間): 描く範囲を 0 に
    if (shadowMute) { Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S }); }
    _c.copy(camera.position).addScaledVector(_f, S * 0.55); _c.y = 0;
    // 影の地図の 1 画素に合わせて動かす(動いた時のちらつきを抑える)
    const texel = (2 * S) / (sun.shadow.mapSize.x || Q.shadow || 2048);
    _c.x = Math.round(_c.x / texel) * texel; _c.z = Math.round(_c.z / texel) * texel;
    const D = 450;
    sun.position.copy(_c).addScaledVector(sunDir, D);
    sun.target.position.copy(_c);
    sun.target.updateMatrixWorld();
    const cut = dome ? 34 : timeKey === 'night' ? 22 : 0;   // この高さより上の物は影を落とさない(屋根・照明塔)
    sun.shadow.camera.near = cut ? Math.max(10, D - cut / Math.max(sunDir.y, 0.2)) : 10;
    sun.shadow.camera.far = D + 300;
    sun.shadow.camera.updateProjectionMatrix();
  }

  function render() {
    if (composer) composer.render(); else renderer.render(scene, camera);
  }

  // 11/26 描く所(WebGL)が失われて戻った時: three は絵・形を元の絵から送り直すが、描いて作った絵(環境の光・後処理の絵)は空になるので作り直す
  function restore() {
    try { const old = roomRT; roomRT = pmrem.fromScene(new RoomEnvironment(), 0.04); room = roomRT.texture; old.dispose(); } catch (e) { /* 作れない時は前のまま */ }
    if (envRT) { try { envRT.dispose(); } catch (e) { } envRT = null; }
    try { buildEnv(envKind); } catch (e) { scene.environment = room; }
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    buildComposer(); resize();
  }
  // 11/26 記憶の天井: 自動の段をこの段より上げない(今それより上なら下げる)
  function setCeil(n) {
    memCeil = Math.max(0, Math.min(AUTO_LV.length - 1, n | 0));
    autoCeil = Math.min(autoCeil, memCeil);
    if (qk === 'auto' && autoLv > memCeil) setLv(memCeil, 'mem');
  }
  return {
    sky, setQuality, setTime, update, render, patchModel, resize, autoTick, setLv, restore, setCeil,
    get lv() { return autoLv; }, get ceil() { return memCeil; },
    cullIndoor: (list) => { if (!touch) return; for (const o of list) if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.geometry) addCull(o, true); cullTick(true); },
    autoInfo: () => (qk === 'auto' ? { lv: autoLv, ceil: autoCeil, memCeil, fps: Math.round(autoFps), log: autoLog.slice(-8), culled: culls.reduce((n, c) => n + (c.far ? 1 : 0), 0), culls: culls.length, mute: shadowMute } : null),
    texInfo: () => ({ max: TEX_MAX, savedMB: Math.round(texSaved * 4 * 1.33 / 1048576) }),
    get quality() { return qk; }, get Q() { return Q; }, fabric,
    info: () => ({ quality: qk, pr: renderer.getPixelRatio(), post: !!composer, ao: !!aoPass, bloom: !!bloom, shadow: sun.castShadow ? sun.shadow.mapSize.x : 0, S: Q.S }),
  };
}
