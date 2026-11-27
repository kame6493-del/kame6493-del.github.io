// 縫い目の見える球 + うすい残像
import * as THREE from 'three';
import { PHYS } from './physics.js';
import { mulberry32 } from './util.js';

function seamPoint(t, out) {
  // テニスボール型の縫い目 (a + b = 1)
  const a = 0.62, b = 0.38;
  const x = a * Math.cos(t) + b * Math.cos(3 * t);
  const y = a * Math.sin(t) - b * Math.sin(3 * t);
  const z = 2 * Math.sqrt(a * b) * Math.sin(2 * t);
  const l = Math.hypot(x, y, z);
  out[0] = x / l; out[1] = y / l; out[2] = z / l;
  return out;
}

function makeBallTexture() {
  const W = 1024, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#f3f0e8'; x.fillRect(0, 0, W, H);
  const rnd = mulberry32(42);
  for (let i = 0; i < 6000; i++) {
    x.fillStyle = rnd() < 0.5 ? 'rgba(200,190,175,0.18)' : 'rgba(255,255,255,0.25)';
    x.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
  // 3D の点 → 正距円筒 (three の SphereGeometry の UV に合わせる)
  const toUV = (p) => {
    const lon = Math.atan2(p[2], -p[0]); // three: x = -cos(u*2π) sin, z = sin(u*2π) sin
    let u = lon / (2 * Math.PI); if (u < 0) u += 1;
    const v = Math.acos(Math.max(-1, Math.min(1, p[1]))) / Math.PI;
    return [u * W, v * H];
  };
  const N = 1400;
  const p = [0, 0, 0], q = [0, 0, 0];
  // 縫い目の溝
  x.strokeStyle = 'rgba(150,120,110,0.55)'; x.lineWidth = 3;
  for (let i = 0; i < N; i++) {
    seamPoint(i / N * Math.PI * 2, p); seamPoint((i + 1) / N * Math.PI * 2, q);
    const A = toUV(p), B = toUV(q);
    if (Math.abs(A[0] - B[0]) > W / 2) continue;
    x.beginPath(); x.moveTo(A[0], A[1]); x.lineTo(B[0], B[1]); x.stroke();
  }
  // 赤い糸 (縫い目に直角の短い斜線、108 針)
  x.strokeStyle = '#c8202a'; x.lineWidth = 3.2; x.lineCap = 'round';
  const M = 108;
  for (let i = 0; i < M; i++) {
    const t = i / M * Math.PI * 2;
    seamPoint(t, p); seamPoint(t + 0.002, q);
    const tan = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    const tl = Math.hypot(...tan); tan.forEach((v, k) => (tan[k] = v / tl));
    // 法線 = p、横向き = p × tan
    const side = [p[1] * tan[2] - p[2] * tan[1], p[2] * tan[0] - p[0] * tan[2], p[0] * tan[1] - p[1] * tan[0]];
    for (const s of [-1, 1]) {
      const a = [p[0] + side[0] * 0.09 * s + tan[0] * 0.03, p[1] + side[1] * 0.09 * s + tan[1] * 0.03, p[2] + side[2] * 0.09 * s + tan[2] * 0.03];
      const b = [p[0] + side[0] * 0.025 * s - tan[0] * 0.01, p[1] + side[1] * 0.025 * s - tan[1] * 0.01, p[2] + side[2] * 0.025 * s - tan[2] * 0.01];
      const A = toUV(a.map((v) => v / Math.hypot(...a))), B = toUV(b.map((v) => v / Math.hypot(...b)));
      if (Math.abs(A[0] - B[0]) > W / 2) continue;
      x.beginPath(); x.moveTo(A[0], A[1]); x.lineTo(B[0], B[1]); x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// 11/20 持ち主「試合中に使われているボールの大きさ…かなり大きい気がするので忠実な感じに」: 見た目の拡大は 20 m まで等倍、
// それより遠くは少しずつ大きく 2 倍まで(前は距離に比例して 40 m で約 5 倍・100 m で約 12 倍)。遠くの球は大きさでなく、
// 細い残像の線(画面で 1.5 px くらいは残る太さ)・明るさ(遠いほど白く光る)・地面の薄い影(defense.js)で見失わないようにする。当たり判定(PHYS.r)は変えない
// 11/20 夜 持ち主「だいぶ小さくて見えづらくなった…見えて認知できるくらいのサイズに」: 画面の上で直径が 6.5 px(CSS の px)より小さくならないだけ大きくする。
// 上限は最初の作り(距離 × 0.0045 / r: 40 m で 4.9 倍・100 m で 12 倍)の 1.5 倍。近くは本物の大きさ。
// 例(試験の撮影): PC(高さ 720)は直径 6.5 px を保つ、スマホ縦(844)は 5〜6.5 px、スマホ横(390)は遠くで 3.7 px(画素の細かい本物のスマホでは 7〜11 画素)
// 11/26 サクサク: 画面の高さは大きさが変わった時だけ読む(毎こま window.innerHeight を読むと、そのたびに配置の計算が走ることがあった)
let _vh = 0;
if (typeof window !== 'undefined') { const f = () => { _vh = window.innerHeight || 0; }; f(); window.addEventListener('resize', f); window.addEventListener('orientationchange', f); }
export const BALL_MIN_PX = 6.5;
export const BALL_MAX_SCALE = 8;   // 球の見た目は本物の 8 倍まで(調整役の決まり)
function screenH() { return _vh || 720; }   // 11/26 サクサク: 大きさが変わった時に覚えた値(下の _vh)
export function ballVisScale(dist, cam) {
  if (dist <= 0.5) return 1;
  const H = _vh || 720, fov = (cam && cam.fov) || 60;
  const px = 2 * PHYS.r * H / (2 * dist * Math.tan(fov * Math.PI / 360));   // 本物の大きさの時の直径(px)
  return Math.max(1, Math.min(BALL_MIN_PX / px, BALL_MAX_SCALE));   // 11/20 夜 球そのものは本物の 8 倍まで。それでも 6.5 px に届かない時(スマホの横画面の遠く)は、下の BallView の「点」で 6.5 px にする
}
export class BallView {
  constructor(scene) {
    this.tex = makeBallTexture();
    this.visScale = 1.0;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(PHYS.r, 32, 16),
      new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.55, emissive: 0x222222 }));
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    this.mesh.visible = false;
    // 残像 (直近の位置をつなぐ帯)
    this.N = 40;
    this.hist = [];
    const g = new THREE.BufferGeometry();
    this.trailPos = new Float32Array(this.N * 2 * 3);
    this.trailAlpha = new Float32Array(this.N * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.trailAlpha, 1));
    const idx = [];
    for (let i = 0; i < this.N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.trailMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide,   // 11/20 足し算の光(空の前で消えていた)から、薄い灰色の線に。土・芝・空のどれの前でも細く見える
      uniforms: { color: { value: new THREE.Color(0xc4cad3) }, strength: { value: 0.35 } },
      vertexShader: 'attribute float alpha; varying float va; void main(){ va = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 color; uniform float strength; varying float va; void main(){ gl_FragColor = vec4(color * (0.82 + 0.18 * va), min(0.85, va * strength * 1.9)); }',
    });
    this.trail = new THREE.Mesh(g, this.trailMat);
    this.trail.frustumCulled = false;
    scene.add(this.trail);
    this.trail.visible = false;
    this.spin = new THREE.Vector3();
    // 遠くの球の「点」(11/20 夜 持ち主「見えて認知できるくらい」): 球を 8 倍にしても画面で 6.5 px に届かない時だけ、
    // 球の所に画面で直径 6.5 px の白い丸(縁を少し灰色にして空の前でも見える)を重ねる。大きさは画面の px で決まる(距離で小さくならない)
    {
      const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
      const gr = g.createRadialGradient(13, 12, 2, 16, 16, 15); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.7, '#eef0f2'); gr.addColorStop(0.92, '#8d949c'); gr.addColorStop(1, 'rgba(90,96,104,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(16, 16, 15.5, 0, Math.PI * 2); g.fill();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      this.dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, sizeAttenuation: false, transparent: true, depthWrite: false }));
      this.dot.visible = false; this.dot.renderOrder = 2; scene.add(this.dot);
    }
  }
  show(v) { this.mesh.visible = v; if (!v) { this.trail.visible = false; this.hist.length = 0; if (this.dot) this.dot.visible = false; } }
  setSpin(w) { this.spin.set(w[0], w[1], w[2]); }
  update(pos, dt, cam, width = 0.03, strength = 0.35) {
    if (!this.mesh.visible) { this.trail.visible = false; return; }
    this.mesh.position.copy(pos);
    // 回転は本当の回転軸のまま (スロー時に縫い目が回って見える)
    const om = this.spin.length();
    if (om > 0 && dt > 0) {
      const ax = this.spin.clone().divideScalar(om);
      this.mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(ax, om * dt));
    }
    // 見かけの大きさ: 20 m までは本物の大きさ、遠くは 2 倍まで(ballVisScale)。遠いほど明るく(白く光らせて見失わない)
    const dist = pos.distanceTo(cam.position);
    const s = Math.max(this.visScale, ballVisScale(dist, cam));
    this.mesh.scale.setScalar(s);
    this.fitDot(pos, dist, s, cam);
    const glow = 0.13 + Math.min(0.3, Math.max(0, dist - 15) / 150);
    this.mesh.material.emissive.setRGB(glow, glow, glow);
    // 残像
    this.hist.unshift(pos.clone());
    if (this.hist.length > this.N) this.hist.length = this.N;
    if (this.hist.length < 3) { this.trail.visible = false; return; }
    this.trail.visible = true;
    this.trailMat.uniforms.strength.value = strength;
    const camPos = cam.position;
    for (let i = 0; i < this.N; i++) {
      const p = this.hist[Math.min(i, this.hist.length - 1)];
      const q = this.hist[Math.min(i + 1, this.hist.length - 1)] || p;
      const dir = p.clone().sub(q);
      if (dir.lengthSq() < 1e-10) dir.set(0, 0, 1);
      const view = p.clone().sub(camPos);
      const side = dir.cross(view).normalize().multiplyScalar(Math.max(width * Math.sqrt(s), width > 0 ? view.length() * 0.0011 : 0) * (1 - i / this.N));   // 遠くの残像は画面で細い線が残る太さ(距離 × 0.0011)
      this.trailPos.set([p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z], i * 6);
      const a = i < this.hist.length ? Math.pow(1 - i / this.N, 1.6) : 0;
      this.trailAlpha[i * 2] = a; this.trailAlpha[i * 2 + 1] = a;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.alpha.needsUpdate = true;
  }
  // 球の見た目(倍率 s)が画面で BALL_MIN_PX に届かない時だけ、その大きさの点を重ねる(defense.js が倍率を替えた後にも呼ぶ)
  fitDot(pos, dist, s, cam) {
    if (!this.dot) return;
    const fovT = 2 * Math.tan(((cam && cam.fov) || 60) * Math.PI / 360), H = screenH();
    const px = 2 * PHYS.r * s * H / (dist * fovT);
    const need = this.mesh.visible && s > 0.01 && dist > 3 && px < BALL_MIN_PX - 0.2;
    this.dot.visible = need;
    if (need) { this.dot.position.copy(pos); this.dot.scale.setScalar(BALL_MIN_PX / H * fovT); }
  }
  clearTrail() { this.hist.length = 0; this.trail.visible = false; }
}
