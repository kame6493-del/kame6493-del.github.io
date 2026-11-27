// 11/26 着せ替え(グラブ・ユニフォーム・選手カードの枠・称号)の一覧と、持っているか・使っているか・見た目へのつけ方。
// 持ち主「もっとジャブジャブ課金したくなるようなシステム」。守備のキャリアにはランキングがあるので、能力・UZR に効く物は入れない(見た目だけ)。
// 売る物の表は bokura_app_2026-11-18/store/iap_1126.md。値段はここに書かない(アプリの shop/shop.js がストアから読む)。
// 持っているか:
//   はじめから使える物(free)・コレクションのごほうび(comp)は、ブラウザ版でもアプリ版でも使える。
//   買う物は、アプリの shop/shop.js が window.__bpStore を用意する(RevenueCat の権利 cos_<id>)。ブラウザ版には無いので、見本(ためす)だけ。
//   季節の物は、シーズンパスの間は過ぎた季節の物も使え、パスの月にもらった物(claimed)はパスをやめても残る。
// 使っている物は localStorage の bp.cos.eq({ gcolor, gpat, uni, frame, title })。
import * as THREE from 'three';

const LS = {
  get(k, d) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 残せなくても遊べる */ } },
};
const K_EQ = 'bp.cos.eq', K_CLAIM = 'bp.cos.claimed', K_SEEN = 'bp.cos.seen';

// ---------------------------------------------------------------- 一覧
// gcolor: グラブの革の色(c)と糸の色(st)。gpat: グラブの柄(p はシェーダーの番号、pc は柄の色)。茶の無地は元のスキャンの色のまま
// uni: jersey・pants・under・sock・belt・stripe(縦じま)・pipe。home は学校のユニフォームのまま
// frame: CSS の .bpFr-<id>(locker.css)
// season: { m: 月 } その月だけショップに並ぶ(毎年同じ月にまた並ぶ)。pass: シーズンパスの間だけ使える。comp: コレクションのごほうび
export const CAT = [
  // グラブ(11/26 ChatGPT の案 _chatgpt_shop_1126/2_locker.png: 色 8 つ × 柄 8 つ。色と柄を別々に持ち、組み合わせて使う)
  // 色: c 革・st 糸とひも。茶の無地は、スキャンしたままの色(いちばん本物らしい)
  { id: 'gc_brown', kind: 'gcolor', name: '茶', free: true, desc: '使いこんだ茶の革', c: 0x8a5528, st: 0xf3ecdb, scan: true },
  { id: 'gc_black', kind: 'gcolor', name: '黒', free: true, desc: '締まった黒に、白い糸', c: 0x1d1b1a, st: 0xd9d3c4 },
  { id: 'gc_red', kind: 'gcolor', name: '赤', desc: 'よく目立つ赤い革', c: 0xb8222b, st: 0xf6f1e6 },
  { id: 'gc_blue', kind: 'gcolor', name: '青', desc: '深い青に、金の糸', c: 0x1f3a9e, st: 0xf0c43a },
  { id: 'gc_green', kind: 'gcolor', name: '緑', desc: '芝の色の革', c: 0x1e7a36, st: 0xf6f1e6 },
  { id: 'gc_white', kind: 'gcolor', name: '白', desc: '白い革に、赤い糸', c: 0xefeee9, st: 0xc4262d },
  { id: 'gc_yellow', kind: 'gcolor', name: '黄', desc: '明るい黄色の革', c: 0xe7b416, st: 0x3a2a10 },
  { id: 'gc_pink', kind: 'gcolor', name: 'ピンク', desc: '桃色の革に、白い糸', c: 0xec6aa8, st: 0xffffff },
  // 柄: p シェーダーの番号・pc 柄の色(-1 は革の色を濃くした色)
  { id: 'gp_plain', kind: 'gpat', name: '無地', free: true, desc: '柄なし', p: 0 },
  { id: 'gp_star', kind: 'gpat', name: '星', desc: '金の星がちらばる', p: 1, pc: 0xf2c230 },
  { id: 'gp_bolt', kind: 'gpat', name: '稲妻', desc: '金の稲妻が走る', p: 2, pc: 0xf2c230 },
  { id: 'gp_flame', kind: 'gpat', name: '炎', desc: '手首から燃え上がる炎', p: 3, pc: 0xff7a18 },
  { id: 'gp_sakura', kind: 'gpat', name: '桜', desc: '桜の花びら', p: 4, pc: 0xf7a8c8 },
  { id: 'gp_camo', kind: 'gpat', name: 'カモフラ', desc: '迷彩の柄', p: 5, pc: 0x3a3f38 },
  { id: 'gp_stripe', kind: 'gpat', name: 'ストライプ', desc: '白い縦じま', p: 6, pc: 0xf4f4f0 },
  { id: 'gp_check', kind: 'gpat', name: 'チェック', desc: '濃い色との市松', p: 7, pc: -1 },
  // 季節の柄(12 月 冬・1 月 お正月・2 月 春のキャンプ。3 月から先は store/iap_1126.md の作り方で足す)
  { id: 'gp_snow', kind: 'gpat', name: '雪', season: { m: 12, name: '冬' }, desc: '雪の粒', p: 8, pc: 0xffffff },
  { id: 'gp_kohaku', kind: 'gpat', name: '紅白', season: { m: 1, name: 'お正月' }, desc: '指の側が白の 2 色', p: 9, pc: 0xf6f3ee },
  { id: 'gp_wakaba', kind: 'gpat', name: '若葉', season: { m: 2, name: '春のキャンプ' }, desc: '若葉がちらばる', p: 10, pc: 0x8fd14f },
  // ユニフォーム(自分の選手だけ。選手カードの絵と、試合で見える自分の選手)
  { id: 'uni_home', kind: 'uni', name: 'チームのまま', free: true, desc: '守るチームのユニフォーム' },
  { id: 'uni_gray', kind: 'uni', name: 'ビジターの灰', free: true, desc: '灰色の上下に紺', u: { jersey: 0x8f939a, pants: 0x8f939a, under: 0x1c2b4a, sock: 0x1c2b4a, belt: 0x1c2b4a, pipe: 0x1c2b4a } },
  { id: 'uni_pin', kind: 'uni', name: '紺の縦じま', desc: '白に紺の細い縦じま', u: { jersey: 0xf1f1ef, pants: 0xf1f1ef, under: 0x1b2440, sock: 0x1b2440, belt: 0x1b2440, stripe: 0x1b2440, pipe: 0x1b2440 } },
  { id: 'uni_red', kind: 'uni', name: '赤い上着', desc: '赤の上着に白いズボン', u: { jersey: 0xb5232b, pants: 0xeeeff1, under: 0x1a1a1c, sock: 0xb5232b, belt: 0x1a1a1c, pipe: 0xffffff } },
  { id: 'uni_sky', kind: 'uni', name: '空色', desc: '空色の上下に紺', u: { jersey: 0x8cc4ea, pants: 0x8cc4ea, under: 0x1c2b4a, sock: 0x1c2b4a, belt: 0x1c2b4a, pipe: 0x1c2b4a } },
  { id: 'uni_blackgold', kind: 'uni', name: '黒と金', desc: '黒の上下に金の縦じま', u: { jersey: 0x18181b, pants: 0x18181b, under: 0x18181b, sock: 0xd4a017, belt: 0xd4a017, stripe: 0xd4a017, pipe: 0xd4a017 } },
  // 選手カードの枠
  { id: 'frame_basic', kind: 'frame', name: 'いつもの紺', free: true, desc: '紺と金の、はじめの枠' },
  { id: 'frame_wood', kind: 'frame', name: '木のベンチ', free: true, desc: 'ベンチの板の色' },
  { id: 'frame_silver', kind: 'frame', name: '銀', desc: '光る銀の枠' },
  { id: 'frame_gold', kind: 'frame', name: '金', desc: '光る金の枠' },
  { id: 'frame_night', kind: 'frame', name: 'ナイター', desc: '夜の球場の照明' },
  { id: 'frame_field', kind: 'frame', name: '球場の芝と土', desc: '芝の縞と内野の土' },
  { id: 'frame_rainbow', kind: 'frame', name: '虹', desc: '7 色の虹の枠' },
  { id: 'frame_snow', kind: 'frame', name: '冬の夜空', season: { m: 12, name: '冬' }, desc: '雪の降る夜空' },
  { id: 'frame_newyear', kind: 'frame', name: '初日の出', season: { m: 1, name: 'お正月' }, desc: '紅白と金の、初日の出' },
  { id: 'frame_camp', kind: 'frame', name: '春のキャンプ', season: { m: 2, name: '春のキャンプ' }, desc: '若草と青空' },
  { id: 'frame_pass', kind: 'frame', name: 'シーズンパス', pass: true, desc: 'シーズンパスの間だけ使える、紫と金の枠' },
  { id: 'frame_ball', kind: 'frame', name: 'ボール袋の名人', comp: 'ball', desc: 'ボール袋の 4 種類の球をそろえた人の枠' },
  { id: 'frame_hof', kind: 'frame', name: '殿堂の常連', comp: 'hof', desc: '殿堂に 5 人の選手を残した人の枠' },
  // 称号(選手カードの名前の下)
  { id: 'title_none', kind: 'title', name: 'なし', free: true, desc: '称号を出さない' },
  { id: 'title_ball', kind: 'title', name: '客席の名手', comp: 'ball', desc: 'ボール袋の 4 種類の球をそろえた' },
  { id: 'title_hof', kind: 'title', name: '殿堂の常連', comp: 'hof', desc: '殿堂に 5 人の選手を残した' },
];
const BY = Object.fromEntries(CAT.map((c) => [c.id, c]));
export const KINDS = [['glove', 'グラブ'], ['uni', 'ユニフォーム'], ['frame', 'カードの枠']];   // ロッカーのタブ(グラブは色と柄)。称号はコレクションで選ぶ
const DEF = { gcolor: 'gc_brown', gpat: 'gp_plain', uni: 'uni_home', frame: 'frame_basic', title: 'title_none' };
// コレクションのごほうび(見た目だけ。買う物をそろえても何も当たらない: ボール袋と殿堂だけ)
export const BALL_KINDS = [['foul', 'game', '試合のファウル'], ['foul', 'seat', '席に飛んできたファウル'], ['foul', 'ticket', '券で飛んできたファウル'], ['hr', 'ticket', '券で飛んできたホームラン']];
export const HOF_NEED = 5;
export const HOF_BASE = 50, HOF_PASS = 300;   // 殿堂に残せる選手の数(シーズンパスの間は 300。パスをやめても、残した選手は消さない)

const store = () => window.__bpStore || null;   // アプリ版だけ(shop/shop.js)
const ballBag = () => LS.get('r4walk.ballbag', []);
const hofN = () => { const a = LS.get('r4walk.career.hof.v1', []); return Array.isArray(a) ? a.length : 0; };
export function compDone(what) {
  if (what === 'ball') { const b = ballBag(); return BALL_KINDS.every(([k, h]) => b.some((x) => x.kind === k && x.how === h)); }
  if (what === 'hof') return hofN() >= HOF_NEED;
  return false;
}
export const passOn = () => { const s = store(); return !!(s && s.passActive && s.passActive()); };
export const nowMonth = () => new Date().getMonth() + 1;
// 季節の物が、もう出た(一度でも並んだ)か: 2026-12 から順に出す
export function released(c) {
  if (!c.season) return true;
  const d = new Date(), y = d.getFullYear(), m = d.getMonth() + 1;
  const first = c.season.m >= 12 ? [2026, c.season.m] : [2027, c.season.m];
  return y > first[0] || (y === first[0] && m >= first[1]);
}
export const inSeason = (c) => !!c.season && c.season.m === nowMonth();
// 11/26 サクサク: 持っているかの答えを少しの間(0.5 秒)覚える。ロッカー・コレクションを描くたびに、ボール袋・殿堂・受け取った物の記録を何十回も読み直していた。
// 着せ替えが変わった時(fire)・ストアの答えが来た時は忘れる
const OWN = new Map(); let ownT = 0;
export function forgetOwned() { OWN.clear(); }
export function owned(id) {
  const now = Date.now(); if (now - ownT > 500) { OWN.clear(); ownT = now; }
  if (OWN.has(id)) return OWN.get(id);
  const v = ownedNow(id); OWN.set(id, v); return v;
}
function ownedNow(id) {
  const c = BY[id]; if (!c) return false;
  if (c.free) return true;
  if (c.comp) return compDone(c.comp);
  if (c.pass) return passOn();
  const s = store();
  if (s && s.owns && s.owns(id)) return true;
  if (c.season && (LS.get(K_CLAIM, {})[id] || (passOn() && released(c)))) return true;
  return false;
}
// パスの月の季節の物を受け取る(パスの間に 1 回。受け取った物はパスをやめても残る)
export function passGifts() { return CAT.filter((c) => c.season && inSeason(c)); }
export function claimPassGifts() {
  if (!passOn()) return [];
  const cl = LS.get(K_CLAIM, {}), got = [];
  for (const c of passGifts()) if (!cl[c.id]) { cl[c.id] = Date.now(); got.push(c); }
  LS.set(K_CLAIM, cl); if (got.length) fire();
  return got;
}
export const claimed = (id) => !!LS.get(K_CLAIM, {})[id];
export function hofCap() { return passOn() ? HOF_PASS : HOF_BASE; }

// ---------------------------------------------------------------- 使っている物
let EQ = { ...DEF, ...LS.get(K_EQ, {}) };
export function eq() {
  // 使えなくなった物(パスが切れた・払い戻し)は、はじめの物に戻して見せる(記録は残す: また使えるようになったら戻る)
  const out = {};
  for (const k of Object.keys(DEF)) out[k] = EQ[k] && BY[EQ[k]] && BY[EQ[k]].kind === k && owned(EQ[k]) ? EQ[k] : DEF[k];
  return out;
}
export function equip(id) {
  const c = BY[id]; if (!c || !owned(id)) return false;
  EQ[c.kind] = id; LS.set(K_EQ, EQ); fire(); return true;
}
const LIS = new Set();
export function onChange(cb) { LIS.add(cb); }
export function fire() { OWN.clear(); for (const cb of LIS) { try { cb(); } catch (e) { console.warn(e); } } applyAll(); }
export const get = (id) => BY[id];
export const items = (kind) => CAT.filter((c) => c.kind === kind);
export const frameClass = (id) => `bpFr bpFr-${(id || eq().frame).replace(/^frame_/, '')}`;
export const titleText = (id) => { const t = BY[id || eq().title]; return t && t.id !== 'title_none' ? t.name : ''; };
// 新しく使えるようになった物(コレクションのごほうび)を一度だけ知らせる
export function newlyUnlocked() {
  const seen = LS.get(K_SEEN, {}), out = [];
  for (const c of CAT) if (c.comp && owned(c.id) && !seen[c.id]) { seen[c.id] = 1; out.push(c); }
  if (out.length) LS.set(K_SEEN, seen);
  return out;
}

// ---------------------------------------------------------------- グラブの色(main.js の fp_glove の材質に足すシェーダー)
// スキャンの絵の明るさ(陰影・しわ)はそのまま使い、色だけ替える。白っぽく色の薄い所(糸)は糸の色、とても暗い所は 2 色目
export function gloveUniforms() {
  return { uOn: { value: 0 }, uBase: { value: new THREE.Color() }, uAcc: { value: new THREE.Color() }, uSt: { value: new THREE.Color() }, uPc: { value: new THREE.Color() }, uPat: { value: 0 }, uDarkK: { value: 0.8 } };
}
// 色と柄(どちらも id。省くと今使っている物)
export function setGlove(U, mat, color, pat) {
  const e = eq(), c = BY[color || e.gcolor] || BY.gc_brown, p = BY[pat || e.gpat] || BY.gp_plain;
  U.uOn.value = c.scan && !p.p ? 0 : 1;
  const base = new THREE.Color(c.c);
  U.uBase.value.copy(base); U.uAcc.value.copy(base).multiplyScalar(0.35); U.uSt.value.setHex(c.st);
  if (p.pc === -1 || p.pc == null) U.uPc.value.copy(base).multiplyScalar(0.45); else U.uPc.value.setHex(p.pc);
  U.uPat.value = p.p || 0;
  if (mat) mat.roughness = c.id === 'gc_black' ? 0.42 : 0.56;
}
export function patchGlove(mat, U) {
  if (mat.userData.bpGlove) return;
  mat.userData.bpGlove = U;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vGP; uniform float uOn; uniform vec3 uBase; uniform vec3 uAcc; uniform vec3 uSt; uniform vec3 uPc; uniform float uPat; uniform float uDarkK;
float gH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gH(i), gH(i + vec3(1,0,0)), f.x), mix(gH(i + vec3(0,1,0)), gH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(gH(i + vec3(0,0,1)), gH(i + vec3(1,0,1)), f.x), mix(gH(i + vec3(0,1,1)), gH(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  if (uOn > 0.5) {
    vec3 tc = sampledDiffuseColor.rgb;
    float lum = dot(tc, vec3(0.2126, 0.7152, 0.0722));
    float mx = max(tc.r, max(tc.g, tc.b)), mn = min(tc.r, min(tc.g, tc.b));
    float sat = (mx - mn) / max(mx, 1e-3);
    float stitch = smoothstep(0.26, 0.4, lum) * (1.0 - smoothstep(0.3, 0.46, sat));
    float dark = 1.0 - smoothstep(0.02, 0.05, lum);
    float shade = clamp(pow(lum / 0.13, 0.85), 0.25, 1.25);
    vec3 base = uBase;
    vec2 q = vGP.xy; float pt = 0.0;
    int P = int(uPat + 0.5);
    if (P == 1) { vec2 g = q / 0.055; vec2 f = fract(g) - 0.5; float a = atan(f.y, f.x), r = length(f);
      float rr = mix(0.13, 0.3, pow(0.5 + 0.5 * cos(5.0 * a + 1.57), 2.0)); pt = 1.0 - smoothstep(rr - 0.03, rr + 0.03, r) ; pt *= step(0.3, gH(vec3(floor(g), 1.0))); }
    else if (P == 2) { float z = abs(fract(q.y / 0.07) - 0.5) * 0.05; float d = abs(q.x + 0.005 - z); pt = (1.0 - smoothstep(0.007, 0.011, d)) * step(-0.12, q.y) * step(q.y, 0.15); }
    else if (P == 3) { float h = q.y + 0.154; float edge = 0.08 + 0.05 * gN(vec3(q.x * 45.0, 0.0, 3.0)) + 0.02 * sin(q.x * 140.0); pt = 1.0 - smoothstep(edge - 0.008, edge + 0.008, h);
      base = mix(base, mix(vec3(1.0, 0.62, 0.05), vec3(0.85, 0.12, 0.03), smoothstep(edge * 0.3, edge, h)), pt); pt = 0.0; }
    else if (P == 4 || P == 10) { vec2 g = q / 0.06 + vec2(0.0, 0.5 * step(0.5, fract(floor(q.x / 0.06) * 0.5))); vec2 f = fract(g) - 0.5; float a = atan(f.y, f.x), r = length(f);
      float rr = 0.26 * (0.55 + 0.45 * abs(cos(2.5 * a))); pt = (1.0 - smoothstep(rr - 0.025, rr + 0.025, r)) * step(0.35, gH(vec3(floor(g), 2.0))); }
    else if (P == 5) { float n = gN(vGP * 34.0) * 0.65 + gN(vGP * 85.0) * 0.35; base = n < 0.43 ? uPc : n < 0.6 ? base : mix(base, vec3(0.6), 0.5); }
    else if (P == 6) { pt = step(0.7, abs(fract(q.x / 0.026) - 0.5) * 2.0); }
    else if (P == 7) { pt = mod(floor(q.x / 0.028) + floor(q.y / 0.028), 2.0); }
    else if (P == 8) { pt = smoothstep(0.78, 0.84, gN(vGP * 150.0)); }
    else if (P == 9) { pt = smoothstep(-0.006, 0.006, vGP.x - 0.02); }
    base = mix(base, uPc, pt);
    vec3 col = base * shade;
    col = mix(col, uAcc, dark * uDarkK * 0.6);
    col = mix(col, uSt * clamp(lum / 0.3, 0.75, 1.2), stitch);
    sampledDiffuseColor.rgb = col;
  }
  diffuseColor *= sampledDiffuseColor;
#endif`);
  };
  mat.customProgramCacheKey = () => 'bpGlove2';
  mat.needsUpdate = true;
}

// ---------------------------------------------------------------- 自分の選手のユニフォーム(js/uniform.js の uniformKit が kit.ownUni を見る)
export const uniOf = (id) => { const c = BY[id || eq().uni]; return (c && c.u) || null; };
// 選手カードの後ろ姿の絵(img/career_card_back.webp)の白い服の所だけを、そのユニフォームの色にした絵(ユニフォームごとに 1 回作って覚える)
const ART = new Map();
export function uniArt(id) {
  id = id || eq().uni; const u = uniOf(id);
  if (!u) return Promise.resolve(null);
  if (ART.has(id)) return ART.get(id);
  const p = new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      try {
        const W = im.naturalWidth, H = im.naturalHeight, c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, W, H), P = d.data;
        const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
        const J = rgb(u.jersey), Pn = rgb(u.pants), S = u.stripe != null ? rgb(u.stripe) : null;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4, r = P[i], gg = P[i + 1], b = P[i + 2];
          const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = (mx - mn) / Math.max(mx, 1), l = (r + gg + b) / 3;
          // 服の白(色が薄くて明るい)。光の縁(とても明るい)は少しだけ
          if (sat > 0.2 || l < 95 || b - r > 38 || x < W * 0.1 || x > W * 0.93 || y < H * 0.2) continue;   // 服の所だけ(後ろの光の筋は青みが強い・服の外)
          const k = Math.min(1, (0.2 - sat) / 0.08) * Math.min(1, (l - 95) / 40) * (l > 245 ? 0.5 : 1);
          let col = y > H * 0.72 ? Pn : J;
          if (S && x % 11 < 2 && sat < 0.12 && y > H * 0.24) col = S;
          const sh = l / 225;
          P[i] = r + (Math.min(255, col[0] * sh) - r) * k; P[i + 1] = gg + (Math.min(255, col[1] * sh) - gg) * k; P[i + 2] = b + (Math.min(255, col[2] * sh) - b) * k;
        }
        g.putImageData(d, 0, 0);
        res(c.toDataURL('image/jpeg', 0.86));
      } catch (e) { res(null); }
    };
    im.onerror = () => res(null);
    im.src = 'img/career_card_back.webp';
  });
  ART.set(id, p);
  return p;
}

// ---------------------------------------------------------------- 試合の中へつける
const GU = gloveUniforms();
let gloveMat = null;
function applyGlove() {
  const A = window.__app, G = A && A.fpGlove; if (!G) return false;
  if (!gloveMat) G.traverse((o) => { if (o.isMesh && !gloveMat) { gloveMat = o.material; patchGlove(gloveMat, GU); } });
  if (gloveMat) setGlove(GU, gloveMat);
  return !!gloveMat;
}
function applyUni() {
  const d = window.__app && window.__app.defense; if (!d || !d.fig) return;
  const u = uniOf();
  for (const k of Object.keys(d.fig)) {
    const f = d.fig[k]; if (!f || !f.kit) continue;
    const want = k === d.my ? u : null;
    if ((f.kit.ownUni || null) !== want) { f.kit = { ...f.kit }; if (want) f.kit.ownUni = want; else delete f.kit.ownUni; try { f.dress(); } catch (e) { /* 次で */ } }
  }
}
export function applyAll() { try { applyGlove(); } catch (e) { console.warn(e); } try { applyUni(); } catch (e) { console.warn(e); } }
// グラブは読み込みが後なので、つくまで見る。ユニフォームは守る位置が替わるので時々見る
setInterval(() => { if (!gloveMat) applyGlove(); applyUni(); }, 1000);

const api = { CAT, KINDS, BALL_KINDS, HOF_NEED, get, items, owned, eq, equip, onChange, fire, frameClass, titleText, uniArt, uniOf, compDone, passOn, passGifts, claimPassGifts, claimed, hofCap, inSeason, released, nowMonth, newlyUnlocked, patchGlove, gloveUniforms, setGlove, applyAll };
window.__bpCos = api;
export default api;
