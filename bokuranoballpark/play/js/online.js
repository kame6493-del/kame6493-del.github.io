// 11/28 案3「球場にほかの人がいる」(持ち主 15 時「もっといい感じに進めて」)。docs/アプリ化の引き継ぎ.md の「11/28 球場にほかの人がいる」
// 球場めぐり(歩く)・客席・観戦の間だけ、同じ球場にいるほかの人の選手が見える。ユニフォーム・グラブ・カードの枠(名札の縁)・称号がそのまま見える。
// 文字のチャットは無い。決まったスタンプ 5 つと手を振るだけ。名前は短い表示名(使えない言葉は「名無しの野球好き」)。
// 仕組み: Firebase(らくがき運動会と同じ oekakirace)の Realtime Database を SDK なしの REST で使う(ブラウザ・iOS・Android で同じ)。
//   置き場所 bokura_online/v1/{球場}/{匿名ログインの uid} = { t: サーバーの時刻, x y z: 位置, h: 向き, a: 姿(0 立つ・歩く 1 座る), k: 列(x を 50 m ごと),
//                                                       n: 表示名, c: 見た目の id(グラブの色|柄|ユニフォーム|枠|称号), s: スタンプ, q: スタンプの番号, w: 手を振った番号 }
//   書く: 動いている間 2.5 秒に 1 回・止まっている間 15 秒に 1 回(PATCH、答えの中身なし)。スタンプ・手を振るはすぐ(ルールで 0.9 秒に 1 回まで)。
//   読む: 自分の列 ±1(左右 50〜100 m)の人だけを 1 本の流れ(EventSource)で受ける。列が替わったら読み直す。
//   消える: 閉じる・裏へ回す・守備を始める・タイトルへ戻る時に自分の行を消す(keepalive の DELETE)。消せずに落ちた時は、40 秒届かない人は出さず、
//          2 分より古い行は見た人が消す(ルールで 2 分より古い行だけは誰でも消せる)。
// 安全: 送るのは乱数の uid・位置・見た目の id・決まったスタンプの番号・表示名だけ。受けた名前も端末で汚い言葉を弾き直す。
//   迷惑な人は一時停止の「近くの人」から「見えなくする」(端末に覚える r4walk.online.v1 の hide)。一時停止で「ほかの人を表示しない」も選べる(表示しない時は送りもしない)。
// 軽さ: 近い順に PC 12 人・スマホ 8 人まで(50 m / 40 m の中)。近い人は 5 つの部品(体・手足)、22 m より遠い人は 1 つにまとめた軽い形。材質は全員で 1 つ。
// ?noonline=1 で入れない。試験は window.__online。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const API_KEY = 'AIzaSyC4yXnCeOvQZarFHz-0KKk5_szykky3yJk';   // 公開してよい識別子(js/ranking.js と同じ)
const DB = 'https://oekakirace-default-rtdb.asia-southeast1.firebasedatabase.app';
const ROOT = 'bokura_online/v1';
const AUTH_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + API_KEY;
const TOKEN_URL = 'https://securetoken.googleapis.com/v1/token?key=' + API_KEY;
const K_AUTH = 'r4walk.rank.auth';   // js/ranking.js と同じ匿名ログインを使う(1 端末 1 つの uid)
const K_SET = 'r4walk.online.v1';
const params = new URLSearchParams(location.search);
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const CELL = 50;                       // 列の幅(m)
const MOVE_MS = 2500, IDLE_MS = 15000, GAP_MS = 1000;
const STALE_MS = 40000, CLEAN_MS = 125000;
const DELAY_MS = 2800;                 // ほかの人の動きは 2.8 秒遅れで、届いた位置の間をなめらかにつなぐ
const MAX_N = +(params.get('onlinemax') || (IS_TOUCH ? 8 : 12));
const RADIUS = IS_TOUCH ? 40 : 50, FAR = 22, LABEL_FAR = 30;
const ROOMS = ['koshien', 'dome', 'park', 'ring', 'railside', 'bowl', 'north', 'roof', 'bay', 'shore', 'grove', 'canal'];
export const STAMPS = [
  { t: 'ナイス!', bg: '#ffd23a', fg: '#3a2300' },
  { t: '👏', bg: '#ffffff', fg: '#000' },
  { t: '⚾', bg: '#ffffff', fg: '#000' },
  { t: 'がんばれ!', bg: '#ff6b6b', fg: '#fff' },
  { t: 'ありがとう', bg: '#7fd4ff', fg: '#0b2a40' },
];
export const NONAME = '名無しの野球好き';
const BAD = /(死ね|しね|氏ね|殺す|ころす|ちんこ|ちんぽ|まんこ|セックス|せっくす|うんこ|きちがい|キチガイ|ガイジ|がいじ|fuck|shit|nigger|sex|porn|bitch|https?|www|\.com|line|ライン|ツイッター|インスタ|lineid)/i;
export function cleanName(n) {
  let s = String(n || '').normalize('NFKC').replace(/[^\p{L}\p{N}\p{M} ー・-]/gu, '').replace(/\s+/g, ' ').trim();
  s = [...s].slice(0, 8).join('');
  if (!s || BAD.test(s.replace(/\s/g, '')) || /\d{4,}/.test(s)) return NONAME;   // 数字の並び(電話・ID)も出さない
  return s;
}

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 残せなくても遊べる */ } },
};
const setting = () => Object.assign({ on: true, name: '', hide: [] }, LS.get(K_SET, {}));
const saveSetting = (s) => LS.set(K_SET, s);
const app = () => window.__app || null;
const cos = () => window.__bpCos || null;

export const stats = { writes: 0, writeFail: 0, events: 0, bytesIn: 0, bytesOut: 0, streams: 0, deletes: 0, cleaned: 0, t0: performance.now() };

// ---------------------------------------------------------------- 匿名ログイン(ranking.js と同じ形で覚える)
let tokP = null;
function token(force) { if (!tokP) tokP = token0(force).finally(() => { tokP = null; }); return tokP; }
async function post(url, body, json) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': json ? 'application/json' : 'application/x-www-form-urlencoded' }, body });
  if (!r.ok) throw new Error('auth ' + r.status);
  return r.json();
}
async function token0(force) {
  let a = LS.get(K_AUTH, null);
  if (!force && a && a.idToken && a.exp > Date.now() + 120000) return a;
  if (a && a.refreshToken) {
    try {
      const j = await post(TOKEN_URL, 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(a.refreshToken));
      a = { uid: j.user_id || a.uid, idToken: j.id_token, refreshToken: j.refresh_token || a.refreshToken, exp: Date.now() + (+j.expires_in || 3600) * 1000 };
      LS.set(K_AUTH, a); return a;
    } catch (e) { /* 作り直す */ }
  }
  const j = await post(AUTH_URL, JSON.stringify({ returnSecureToken: true }), true);
  a = { uid: j.localId, idToken: j.idToken, refreshToken: j.refreshToken, exp: Date.now() + (+j.expiresIn || 3600) * 1000 };
  LS.set(K_AUTH, a);
  return a;
}

// ---------------------------------------------------------------- 見た目(着せ替えの id から色)
const DEF_UNI = { jersey: 0xf2f2ee, pants: 0xf2f2ee, under: 0x1b2a4e, sock: 0x1b2a4e, belt: 0x1b2a4e, pipe: 0x1b2a4e };
const FRAMES = {   // 名札の縁(locker.css の .bpFr-* と同じ色)
  basic: { g: ['#f6c437', '#fff3b0', '#b07a10'], b: '#082a72' }, wood: { g: ['#8a5a2b', '#c98f55', '#8a5a2b'], b: '#2a1a10' },
  silver: { g: ['#6d7684', '#f4f7fb', '#8d97a5', '#ffffff'], b: '#1a2230' }, gold: { g: ['#a8761a', '#ffe08a', '#c9971f', '#fff6c8'], b: '#2a1a02' },
  night: { g: ['#ffe9a3', '#3a7bff', '#0b1630'], b: '#050a18' }, field: { g: ['#2f7d32', '#4caf50', '#2f7d32'], b: '#1f3a12' },
  rainbow: { g: ['#ff4b4b', '#ffd23a', '#39d353', '#4fb3ff', '#b05cff'], b: '#0b0a30' }, snow: { g: ['#ffffff', '#bcd7ff', '#6f9ad8', '#ffffff'], b: '#061430' },
  newyear: { g: ['#c7202c', '#e9b923', '#ffffff', '#e9b923', '#c7202c'], b: '#3a0508' }, camp: { g: ['#9fd0ff', '#ffffff', '#7ea84a', '#4e7a2a'], b: '#1f4a20' },
  pass: { g: ['#4b1f7a', '#e9b923', '#b48cff', '#e9b923'], b: '#160828' }, ball: { g: ['#ffffff', '#c8102e', '#ffffff'], b: '#0b2160' },
  hof: { g: ['#1a1a1a', '#e9b923', '#5a4510', '#e9b923'], b: '#0a0806' },
};
function lookOf(c) {
  const [gc, gp, uni, fr, ti] = String(c || '').split('|');
  const C = cos(), get = (id, kind) => { const x = C && C.get(id); return x && x.kind === kind ? x : null; };
  const g = get(gc, 'gcolor') || { c: 0x8a5528, st: 0xf3ecdb }, p = get(gp, 'gpat') || { p: 0 }, u = get(uni, 'uni'), t = get(ti, 'title');
  const frame = FRAMES[String(fr || '').replace(/^frame_/, '')] ? String(fr).replace(/^frame_/, '') : 'basic';
  return { glove: g.c, stitch: g.st, pat: p.p ? (p.pc === -1 || p.pc == null ? null : p.pc) : null, patId: p.p || 0, uni: Object.assign({}, DEF_UNI, (u && u.u) || {}), frame, title: t && t.id !== 'title_none' ? t.name : '' };
}
// 自分の見た目(持っている物だけ。持っていない物は初めの物)
function myLook() {
  const C = cos(); if (!C) return 'gc_brown|gp_plain|uni_home|frame_basic|title_none';
  const e = C.eq(), ok = (id, d) => { try { return id && C.get(id) && C.owned(id) ? id : d; } catch (er) { return d; } };
  return [ok(e.gcolor, 'gc_brown'), ok(e.gpat, 'gp_plain'), ok(e.uni, 'uni_home'), ok(e.frame, 'frame_basic'), ok(e.title, 'title_none')].join('|');
}

// ---------------------------------------------------------------- 選手の形(簡単な形。色は頂点の色、材質は全員で 1 つ)
let MAT = null;
const mat = () => { if (!MAT) { MAT = new THREE.MeshLambertMaterial({ vertexColors: true }); MAT.color.setScalar(1.25); MAT.emissive.setHex(0x202020); } return MAT; };   // 逆光でも服の色が分かるよう少し明るく
const SKIN = 0xe0ac84;
function paint(geo, hex, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo; if (g !== geo) geo.dispose();
  const n = g.attributes.position.count, col = new Uint8Array(n * 3), c = new THREE.Color(), p = g.attributes.position;   // 色は 1 色 1 バイト(記憶を小さく)
  for (let i = 0; i < n; i += 3) {
    let h = hex;
    if (fn) { const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3; h = fn(cx, cy, cz, hex); }
    c.setHex(h).convertSRGBToLinear();
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r * 255; col[(i + k) * 3 + 1] = c.g * 255; col[(i + k) * 3 + 2] = c.b * 255; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
const at = (g, x, y, z, rx = 0) => { if (rx) g.rotateX(rx); g.translate(x, y, z); return g; };
function legGeo(L, side) {
  const u = L.uni;
  return mergeGeometries([
    paint(at(new THREE.CylinderGeometry(0.085, 0.075, 0.5, 6, 1, true), 0, -0.25, 0), u.pants),
    paint(at(new THREE.CylinderGeometry(0.07, 0.06, 0.36, 6, 1, true), 0, -0.67, 0), u.sock),
    paint(at(new THREE.BoxGeometry(0.11, 0.08, 0.25), 0, -0.88, -0.05), 0x161616),
  ]);
}
function armGeo(L, side, glove) {
  const u = L.uni, parts = [
    paint(at(new THREE.CylinderGeometry(0.068, 0.06, 0.26, 6, 1, true), 0, -0.12, 0), u.jersey),
    paint(at(new THREE.CylinderGeometry(0.048, 0.042, 0.3, 6, 1, true), 0, -0.4, 0), SKIN),
    paint(at(new THREE.SphereGeometry(0.05, 6, 4), 0, -0.58, 0), SKIN),
  ];
  if (glove) {   // グラブ(手に持つ)。柄は帯と点で
    const gg = new THREE.SphereGeometry(0.11, 8, 6); gg.scale(0.62, 1.15, 1); gg.translate(side * 0.04, -0.64, -0.02);
    const pat = L.pat, pid = L.patId;
    parts.push(paint(gg, L.glove, (x, y, z, h) => {
      if (pid && pat != null) {
        const ly = y + 0.64, lz = z + 0.02;
        if (pid === 6 && Math.abs((lz * 60) % 1) < 0.35) return pat;               // 縦じま
        if (pid === 7 && ((Math.floor(ly * 30) + Math.floor(lz * 30)) & 1)) return pat;   // 市松
        if (pid === 9 && lz < 0) return pat;                                       // 2 色
        if ((pid === 1 || pid === 2 || pid === 4 || pid === 8 || pid === 10) && Math.abs(Math.sin(ly * 90) * Math.cos(lz * 80)) > 0.82) return pat;   // 散らした柄
        if (pid === 5 && Math.sin(ly * 40 + lz * 30) > 0.3) return pat;           // 迷彩
      }
      if (pid === 3 && y < -0.66) return 0xff7a18;   // 炎
      return Math.abs(y + 0.64) < 0.012 ? L.stitch : h;   // 真ん中の糸
    }));
  }
  return mergeGeometries(parts);
}
function bodyGeo(L) {
  const u = L.uni, stripe = u.stripe;
  return mergeGeometries([
    paint(at(new THREE.CylinderGeometry(0.17, 0.165, 0.2, 10, 1, true), 0, 0.98, 0), u.pants),
    paint(at(new THREE.CylinderGeometry(0.175, 0.175, 0.05, 10, 1, true), 0, 1.09, 0), u.belt),
    paint(at(new THREE.CylinderGeometry(0.21, 0.175, 0.5, 20, 1), 0, 1.36, 0), u.jersey, stripe != null ? (x, y, z, h) => (Math.abs(Math.atan2(x, z) * 20 / Math.PI) % 2 < 0.5 ? stripe : h) : null),
    paint(at(new THREE.CylinderGeometry(0.215, 0.215, 0.04, 12, 1, true), 0, 1.6, 0), u.pipe),
    paint(at(new THREE.CylinderGeometry(0.05, 0.055, 0.08, 6, 1, true), 0, 1.65, 0), SKIN),
    paint(at(new THREE.SphereGeometry(0.12, 10, 7), 0, 1.76, 0), SKIN),
    paint(at(new THREE.SphereGeometry(0.128, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.79, 0), u.under),
    paint(at(new THREE.BoxGeometry(0.2, 0.018, 0.13), 0, 1.8, -0.15), u.under),
  ]);
}
const HIP = 0.92, SH_Y = 1.55, SH_X = 0.255;
function buildFigure(L) {
  const root = new THREE.Group(), near = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo(L), mat());
  const mk = (geo, x, y) => { const m = new THREE.Mesh(geo, mat()); m.position.set(x, y, 0); return m; };
  const legL = mk(legGeo(L, -1), -0.09, HIP), legR = mk(legGeo(L, 1), 0.09, HIP);
  const armL = mk(armGeo(L, -1, true), -SH_X, SH_Y), armR = mk(armGeo(L, 1, false), SH_X, SH_Y);
  near.add(body, legL, legR, armL, armR);
  // 遠い時の 1 つにまとめた形(手足は下ろしたまま)
  const place = (g, x, y) => { const c = g.clone(); c.translate(x, y, 0); return c; };
  const farGeo = mergeGeometries([body.geometry, place(legL.geometry, -0.09, HIP), place(legR.geometry, 0.09, HIP), place(armL.geometry, -SH_X, SH_Y), place(armR.geometry, SH_X, SH_Y)]);
  const far = new THREE.Mesh(farGeo, mat()); far.visible = false;
  root.add(near, far);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.matrixAutoUpdate = true; } });
  return { root, near, far, body, legL, legR, armL, armR };
}
function disposeFigure(F) { F.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); if (o.isSprite) { if (o.material.map && !o.material.map.userData.shared) o.material.map.dispose(); o.material.dispose(); } }); }

// 名札(カードの枠の色の縁・名前・称号)
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function nameSprite(name, L) {
  const W = 256, H = L.title ? 92 : 64, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), F = FRAMES[L.frame] || FRAMES.basic;
  const gr = g.createLinearGradient(0, 0, W, H); F.g.forEach((c, i) => gr.addColorStop(i / Math.max(1, F.g.length - 1), c));
  roundRect(g, 2, 2, W - 4, H - 4, 16); g.fillStyle = gr; g.fill();
  roundRect(g, 9, 9, W - 18, H - 18, 11); g.fillStyle = F.b; g.globalAlpha = 0.92; g.fill(); g.globalAlpha = 1;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  g.font = '900 28px "Dela Gothic One", "Hiragino Sans", "Yu Gothic", sans-serif';
  g.fillText(name, W / 2, L.title ? 34 : H / 2 + 1, W - 30);
  if (L.title) { g.font = '700 19px "Hiragino Sans", "Yu Gothic", sans-serif'; g.fillStyle = '#ffd65a'; g.fillText(L.title, W / 2, 66, W - 30); }
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.generateMipmaps = false; tx.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthWrite: false, transparent: true }));
  sp.scale.set(0.95, 0.95 * H / W, 1); sp.position.y = 2.12 + (L.title ? 0.05 : 0); sp.renderOrder = 5; sp.userData.ar = H / W;
  return sp;
}
// スタンプの絵(種類ごとに 1 枚、全員で使う)
const STAMP_TX = [];
function stampTex(i) {
  if (STAMP_TX[i]) return STAMP_TX[i];
  const S = STAMPS[i], cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  roundRect(g, 6, 6, 244, 100, 40); g.fillStyle = S.bg; g.fill(); g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.55)'; g.stroke();
  g.beginPath(); g.moveTo(112, 104); g.lineTo(128, 124); g.lineTo(144, 104); g.closePath(); g.fillStyle = S.bg; g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = S.fg;
  const emo = /\p{Extended_Pictographic}/u.test(S.t);
  g.font = emo ? '64px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif' : '900 40px "Dela Gothic One", "Hiragino Sans", "Yu Gothic", sans-serif';
  g.fillText(S.t, 128, 58, 220);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.generateMipmaps = false; tx.minFilter = THREE.LinearFilter;
  tx.userData.shared = true;
  return (STAMP_TX[i] = tx);
}
const WAVE_I = -1;   // 手を振った時の吹き出し(👋)
let WAVE_TX = null;
function waveTex() {
  if (WAVE_TX) return WAVE_TX;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; const g = cv.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '84px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'; g.fillText('👋', 64, 70);
  WAVE_TX = new THREE.CanvasTexture(cv); WAVE_TX.colorSpace = THREE.SRGBColorSpace; WAVE_TX.userData.shared = true; return WAVE_TX;
}

// ---------------------------------------------------------------- ほかの人 1 人
const _v = new THREE.Vector3();
const hashJit = (a, b) => { let h = 7; for (const ch of String(a) + String(b)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h) % 40000; };
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
class Peer {
  constructor(uid) { this.uid = uid; this.d = {}; this.buf = []; this.F = null; this.phase = Math.random() * 6; this.wave = 0; this.bub = null; this.bubT = 0; this.seenQ = null; this.seenW = null; this.pos = new THREE.Vector3(); this.yaw = 0; this.speed = 0; this.dist = 1e9; this.lastRecv = 0; this.lt = 0; }
  apply(d, now, off) {
    const first = this.d.t == null;
    Object.assign(this.d, d);
    const D = this.d; this.lastRecv = now;
    if (!Number.isFinite(D.x) || !Number.isFinite(D.z)) return;
    const lt = Number.isFinite(D.t) && off != null ? D.t - off : now;   // サーバーの時刻を端末の時刻へ
    if (!this.buf.length || lt > this.buf[this.buf.length - 1].lt + 1) this.buf.push({ lt, x: D.x, y: +D.y || 0, z: D.z, h: +D.h || 0, a: D.a | 0 });
    if (this.buf.length > 6) this.buf.shift();
    this.lt = lt;
    // スタンプ・手を振る(初めて見た時の値は昔の物なので出さない)
    if (first) { this.seenQ = D.q; this.seenW = D.w; }
    else {
      if (D.q != null && D.q !== this.seenQ) { this.seenQ = D.q; if (D.s >= 0 && D.s < STAMPS.length) this.pending = D.s; }
      if (D.w != null && D.w !== this.seenW) { this.seenW = D.w; this.pendingWave = true; }
    }
  }
  sample(now) {
    const B = this.buf, rt = now - DELAY_MS;
    if (!B.length) return null;
    if (rt <= B[0].lt || B.length === 1) return { ...B[0], v: 0 };
    for (let i = B.length - 1; i > 0; i--) {
      const a = B[i - 1], b = B[i];
      if (rt >= a.lt) {
        if (rt >= b.lt) return { ...b, v: 0 };
        const k = (rt - a.lt) / Math.max(1, b.lt - a.lt), dx = b.x - a.x, dz = b.z - a.z, dist = Math.hypot(dx, dz), dt = (b.lt - a.lt) / 1000;
        const v = dt > 0 ? dist / dt : 0;
        return { x: a.x + dx * k, y: a.y + (b.y - a.y) * k, z: a.z + dz * k, h: v > 0.4 ? Math.atan2(-dx, -dz) : a.h + angDiff(b.h, a.h) * k, a: k < 0.5 ? a.a : b.a, v: v > 12 ? 0 : v };
      }
    }
    return { ...B[B.length - 1], v: 0 };
  }
}

// ---------------------------------------------------------------- 本体
class Online {
  constructor() {
    this.S = setting();
    this.peers = new Map();
    this.group = new THREE.Group(); this.group.name = 'online';
    this.active = false; this.room = null; this.col = null; this.es = null; this.uid = null;
    this.off = null;            // サーバーの時刻 − 端末の時刻
    this.last = { t: 0, x: 0, z: 0, h: 0, a: -1, c: '', n: '' };
    this.q = 0; this.w = 0; this.sendBusy = false; this.queued = null; this.backoff = 0; this.retryAt = 0; this.cleanT = 0;
    this.shown = [];
    this.myWave = 0;
    this.css(); this.hud();
    const tryUi = () => { if (document.querySelector('#panel .sheet') && app() && app().ui) this.injectPause(); else setTimeout(tryUi, 300); };
    tryUi();
    addEventListener('pagehide', () => this.leave(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.leave(true); });
    addEventListener('keydown', (e) => this.onKey(e), true);
    const C = () => { if (cos() && cos().onChange) cos().onChange(() => { this.forceSend = true; }); else setTimeout(C, 500); };
    C();
    let lastT = performance.now();
    const loop = () => { requestAnimationFrame(loop); const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now; try { this.tick(dt); } catch (e) { if (!this._warned) { this._warned = true; console.warn('online', e); } } };
    requestAnimationFrame(loop);
  }
  name() { const n = cleanName(this.S.name); return n; }
  // いま出してよいか: 球場めぐり・客席・観戦(歩く・座る・乗り物・休む)の最中だけ。守備・打席・タイトルの間は出さない
  want() {
    const A = app(); if (!A || !A.ui || !A.player) return false;
    if (!this.S.on || document.hidden || params.has('noonline')) return false;
    if (navigator.onLine === false) return false;
    const ui = A.ui, m = ui && ui.app ? ui.app.mode : null;
    if (!/^(walk|sit|drive|fprest)$/.test(m || '')) return false;
    if (!document.body.classList.contains('playing')) return false;   // タイトル・結果・選ぶ画面へ戻った(ui.playing(false))
    const title = document.getElementById('title'); if (title && !title.classList.contains('hide')) return false;
    if (A.replay && A.replay.on) return false;
    const room = ui.app.stadium || 'koshien'; if (!ROOMS.includes(room)) return false;
    return true;
  }
  mode() { const A = app(); return A && A.ui && A.ui.app ? A.ui.app.mode : null; }
  tick(dt) {
    const A = app(); if (!A || !A.scene) return;
    if (this.group.parent !== A.scene) A.scene.add(this.group);
    const want = this.want();
    if (want && !this.active) this.enter();
    else if (!want && this.active) this.leave();
    this.group.visible = this.active;
    this.paintHud();
    if (!this.active) return;
    const now = Date.now();
    this.maybeSend(now);
    if (!this.es && !this.listening && now > this.retryAt && this.uid) this.listen();
    else if (this.es) { const k = this.colOf(A.player.pos.x); if (k !== this.col && Math.abs(A.player.pos.x - (this.col * CELL + CELL / 2)) > CELL / 2 + 5) this.listen(); }
    this.render(dt, now);
  }
  colOf(x) { return Math.max(-100, Math.min(100, Math.floor(x / CELL))); }
  async enter() {
    this.active = true; this.room = app().ui.app.stadium || 'koshien';
    this.last.t = 0; this.forceSend = true;
    try { const a = await token(); this.uid = a.uid; } catch (e) { this.retryAt = Date.now() + 30000; this.uid = null; setTimeout(() => { if (this.active && !this.uid) { this.active = false; } }, 30000); }
  }
  leave(hard) {
    if (!this.active && !hard) return;
    const wasActive = this.active;
    this.active = false;
    if (this.es) { try { this.es.close(); } catch (e) { /* 閉じた */ } this.es = null; }
    for (const p of this.peers.values()) if (p.F) { this.group.remove(p.F.root); disposeFigure(p.F); }
    this.peers.clear(); this.shown = [];
    if (wasActive && this.uid && this.room) {   // 自分の行を消す(閉じる時も届くように keepalive)
      const a = LS.get(K_AUTH, null);
      if (a && a.idToken) { try { fetch(`${DB}/${ROOT}/${this.room}/${this.uid}.json?auth=${a.idToken}&print=silent`, { method: 'DELETE', keepalive: true }).catch(() => {}); stats.deletes++; } catch (e) { /* 消せなくても 40 秒で出なくなる */ } }
    }
    this.last.t = 0;
  }
  // ---------------------------------------------------------- 送る
  state() {
    const A = app(), P = A.player, m = this.mode();
    return { x: Math.round(P.pos.x * 10) / 10, y: Math.round(P.pos.y * 10) / 10, z: Math.round(P.pos.z * 10) / 10, h: Math.round((((P.yaw % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) * 100) / 100, a: m === 'sit' ? 1 : 0 };
  }
  maybeSend(now, extra) {
    if (!this.uid || this.sendBusy || now < (this.sendAt || 0)) { if (extra) this.queued = Object.assign(this.queued || {}, extra); return; }
    const s = this.state(), L = this.last;
    const moved = Math.hypot(s.x - L.x, s.z - L.z) > 0.25 || Math.abs(angDiff(s.h, L.h)) > 0.35 || s.a !== L.a;
    const ex = extra || this.queued;
    const due = !L.t || this.forceSend || ex ? true : now - L.t >= (moved ? MOVE_MS : IDLE_MS);
    if (!due || now - L.t < GAP_MS) return;
    this.queued = null;
    const c = myLook(), n = this.name(), k = this.colOf(s.x);
    const full = !L.t;
    const body = { t: { '.sv': 'timestamp' }, ...s, k };
    if (full || c !== L.c) body.c = c;
    if (full || n !== L.n) body.n = n;
    if (full) { body.c = c; body.n = n; }
    if (ex) Object.assign(body, ex);
    this.write(body, full, now, { ...s, c, n });
  }
  async write(body, full, now, snap) {
    this.sendBusy = true; this.forceSend = false;
    const room = this.room, uid = this.uid;
    try {
      const a = await token();
      const url = `${DB}/${ROOT}/${room}/${uid}.json?auth=${a.idToken}` + (full ? '' : '&print=silent');
      const txt = JSON.stringify(body); stats.bytesOut += txt.length;
      const t0 = Date.now();
      const r = await fetch(url, { method: full ? 'PUT' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: txt });
      if (r.status === 401) { await token(true); throw new Error('401'); }
      if (!r.ok) throw new Error('http ' + r.status);
      if (full) { const j = await r.json(); if (j && Number.isFinite(j.t)) this.off = j.t - (t0 + Date.now()) / 2; }
      stats.writes++;
      if (this.active && this.room === room) { Object.assign(this.last, snap, { t: Date.now() }); this.backoff = 0; }
    } catch (e) {
      stats.writeFail++;
      this.backoff = Math.min(60000, (this.backoff || 1000) * 2);
      this.sendAt = Date.now() + this.backoff;   // 少し待ってから、行を丸ごと書き直す(消されていた時も戻る)
      this.last.t = 0; this.last.c = '';
      if (body.q != null || body.w != null) this.queued = Object.assign(this.queued || {}, body.q != null ? { s: body.s, q: body.q } : {}, body.w != null ? { w: body.w } : {});
    } finally { this.sendBusy = false; }
  }
  stamp(i) {
    if (!this.active || !(i >= 0 && i < STAMPS.length)) return false;
    if (this._stampT && Date.now() - this._stampT < 1500) return false;   // 1.5 秒に 1 回まで
    this._stampT = Date.now();
    this.q = (Date.now() % 1000000000);
    this.maybeSend(Date.now(), { s: i, q: this.q });
    this.flash(STAMPS[i].t + ' を送りました');
    return true;
  }
  waveHand() {
    if (!this.active) return false;
    if (this._waveT && Date.now() - this._waveT < 1500) return false;
    this._waveT = Date.now();
    this.w = (Date.now() % 1000000000);
    this.maybeSend(Date.now(), { w: this.w });
    this.flash('手を振りました');
    return true;
  }
  // ---------------------------------------------------------- 受ける(自分の列 ±1 だけ)
  async listen() {
    if (this.es) { try { this.es.close(); } catch (e) { /* */ } this.es = null; }
    const A = app(); if (!A || !this.uid || this.listening) return;
    this.listening = true;
    let a; try { a = await token(); } catch (e) { this.retryAt = Date.now() + 30000; return; } finally { this.listening = false; }
    if (!this.active || this.es) return;
    this.col = this.colOf(A.player.pos.x);
    const url = `${DB}/${ROOT}/${this.room}.json?auth=${a.idToken}&orderBy=%22k%22&startAt=${this.col - 1}&endAt=${this.col + 1}`;
    const es = new EventSource(url); this.es = es; stats.streams++;
    const on = (ev) => (e) => { if (this.es !== es) return; stats.events++; stats.bytesIn += (e.data || '').length + 20; try { this.onEvent(ev, JSON.parse(e.data)); } catch (er) { /* 壊れた知らせは捨てる */ } };
    es.addEventListener('put', on('put')); es.addEventListener('patch', on('patch'));
    es.addEventListener('keep-alive', () => { stats.bytesIn += 30; });
    const again = (ms) => { if (this.es === es) { es.close(); this.es = null; this.retryAt = Date.now() + ms; } };
    es.addEventListener('auth_revoked', () => { token(true).catch(() => {}); again(500); });
    es.addEventListener('cancel', () => again(60000));
    es.onerror = () => { this.backoffR = Math.min(60000, (this.backoffR || 2500) * 2); again(this.backoffR); };
    es.onopen = () => { this.backoffR = 0; };
  }
  onEvent(kind, msg) {
    const now = Date.now(), path = String(msg.path || '/'), data = msg.data;
    const upd = (uid, d, patch) => {
      if (uid === this.uid) { if (d && Number.isFinite(d.t) && this.off == null) this.off = d.t - now; return; }
      if (d == null) { this.drop(uid); return; }
      if (typeof d !== 'object') return;
      let p = this.peers.get(uid);
      if (!p) { if (!patch) { p = new Peer(uid); this.peers.set(uid, p); } else return; }
      else if (!patch) { p.d = {}; }
      p.apply(sanitize(d), now, this.off);
    };
    if (path === '/') {
      if (kind === 'put') { const seen = new Set(); for (const [u, d] of Object.entries(data || {})) { seen.add(u); upd(u, d, false); } for (const u of [...this.peers.keys()]) if (!seen.has(u)) this.drop(u); }
      else for (const [u, d] of Object.entries(data || {})) upd(u, d, true);
    } else {
      const seg = path.split('/').filter(Boolean);
      if (seg.length === 1) upd(seg[0], data, kind === 'patch');
      else if (seg.length === 2) upd(seg[0], { [seg[1]]: data }, true);
    }
  }
  drop(uid) { const p = this.peers.get(uid); if (!p) return; if (p.F) { this.group.remove(p.F.root); disposeFigure(p.F); } this.peers.delete(uid); }
  serverNow() { return Date.now() + (this.off || 0); }
  // ---------------------------------------------------------- 描く
  render(dt, now) {
    const A = app(), me = A.player.pos, hide = new Set(this.S.hide || []), sn = this.serverNow(), cam = A.camera;
    const cand = [];
    for (const p of this.peers.values()) {
      const D = p.d;
      if (!Number.isFinite(D.t)) continue;
      const age = this.off != null ? sn - D.t : now - p.lastRecv;
      if (age > CLEAN_MS + (p.jit != null ? p.jit : (p.jit = hashJit(this.uid, p.uid)))) this.clean(p);   // 見た人みんなが同時に消しに行かないよう、人ごとに 0〜40 秒ずらす
      if (age > STALE_MS || now - p.lastRecv > STALE_MS + IDLE_MS) { if (p.F) p.F.root.visible = false; continue; }
      if (Number.isFinite(D.k) && Math.abs(D.k - this.col) > 1) { if (p.F) p.F.root.visible = false; continue; }   // 読む列から出た人
      if (hide.has(p.uid)) { if (p.F) p.F.root.visible = false; continue; }
      const s = p.sample(now); if (!s) continue;
      p.s = s; p.dist = Math.hypot(s.x - me.x, s.z - me.z);
      if (p.dist <= RADIUS) cand.push(p); else if (p.F) p.F.root.visible = false;
    }
    cand.sort((a, b) => a.dist - b.dist);
    const show = cand.slice(0, MAX_N);
    for (const p of cand.slice(MAX_N)) if (p.F) p.F.root.visible = false;
    // 長く出ていない人の形は捨てる(記憶)
    for (const p of this.peers.values()) if (p.F && !p.F.root.visible && !show.includes(p) && now - (p.hidAt || (p.hidAt = now)) > 8000) { this.group.remove(p.F.root); disposeFigure(p.F); p.F = null; p.hidAt = 0; }
    this.shown = show;
    let built = 0;
    for (const p of show) {
      p.hidAt = 0;
      const cKey = (p.d.c || '') + '#' + (p.d.n || '');
      if (!p.F || p.cKey !== cKey) {
        if (built >= 1) { if (!p.F) continue; }   // 1 こまで 1 人ずつ作る(作り直しの間は前の形のまま)
        else {
          built++;
          if (p.F) { this.group.remove(p.F.root); disposeFigure(p.F); }
          const L = lookOf(p.d.c); p.F = buildFigure(L); p.cKey = cKey;
          p.F.label = nameSprite(cleanName(p.d.n), L); p.F.root.add(p.F.label);
          this.group.add(p.F.root);
          p.pos.set(p.s.x, p.s.y, p.s.z); p.yaw = p.s.h;
        }
      }
      if (!p.F) continue;
      const F = p.F, s = p.s;
      F.root.visible = true;
      // なめらかに(届いた位置の間をつなぐ。急に遠くへ飛んだ時(ワープ)はそのまま移す)
      _v.set(s.x, s.y, s.z);
      if (p.pos.distanceTo(_v) > 12) p.pos.copy(_v);
      else p.pos.lerp(_v, Math.min(1, dt * 10));
      p.yaw += angDiff(s.h, p.yaw) * Math.min(1, dt * 8);
      const sit = s.a === 1;
      F.root.position.set(p.pos.x, p.pos.y + (sit ? -0.42 : 0), p.pos.z);
      F.root.rotation.y = p.yaw;
      const cd = cam ? _v.set(p.pos.x, p.pos.y + 1.2, p.pos.z).distanceTo(cam.position) : 9;
      if (cd < 1.3) { F.root.visible = false; continue; }   // カメラのすぐ前を通る人で画面をふさがない
      const nearOne = p.dist < FAR;
      F.near.visible = nearOne; F.far.visible = !nearOne;
      if (F.label) { F.label.visible = p.dist < LABEL_FAR && cd > 3.2; const ls = 1.15 * Math.max(1, Math.min(2.4, p.dist / 7)); F.label.scale.set(ls, ls * F.label.userData.ar, 1); F.label.position.y = 2.1 + ls * F.label.userData.ar * 0.5; }   // 遠くても名前が読める大きさに
      if (nearOne) {
        const v = sit ? 0 : s.v; p.speed += (v - p.speed) * Math.min(1, dt * 5);
        p.phase += dt * (2.2 + p.speed * 1.6);
        const sw = Math.min(1, p.speed / 3) * 0.62;
        F.legL.rotation.x = sit ? -1.45 : Math.sin(p.phase) * sw; F.legR.rotation.x = sit ? -1.45 : -Math.sin(p.phase) * sw;
        F.armL.rotation.x = sit ? -0.5 : -Math.sin(p.phase) * sw * 0.7; F.armR.rotation.x = sit ? -0.5 : Math.sin(p.phase) * sw * 0.7;
        F.armR.rotation.z = 0;
        if (p.wave > 0) { F.armR.rotation.z = 2.6 + Math.sin(p.wave * 13) * 0.35; F.armR.rotation.x = 0; }
      }
      if (p.wave > 0) p.wave = Math.max(0, p.wave - dt);
      if (p.pendingWave) { p.pendingWave = false; p.wave = 2.2; this.bubble(p, WAVE_I); }
      if (p.pending != null) { const i = p.pending; p.pending = null; this.bubble(p, i); }
      if (p.bub) {
        p.bubT += dt; const k = p.bubT;
        const pop = k < 0.18 ? k / 0.18 * 1.15 : k < 0.3 ? 1.15 - (k - 0.18) / 0.12 * 0.15 : 1;
        const w = p.bub.userData.w;
        const ds = 1.25 * Math.max(1, Math.min(2.2, p.dist / 7)), bh = w * 0.5 * pop * ds * (p.bub.userData.sq ? 2 : 1);
        p.bub.scale.set(w * pop * ds, bh, 1);
        p.bub.position.y = (F.label && F.label.visible ? F.label.position.y + F.label.scale.y / 2 : 2.05) + 0.12 + bh / 2;   // 名札の上
        p.bub.material.opacity = k > 2.3 ? Math.max(0, 1 - (k - 2.3) / 0.4) : 1;
        if (k > 2.7) { F.root.remove(p.bub); p.bub.material.dispose(); p.bub = null; }
      }
    }
    // スタンプが届いたのに出ていない人(遠い・見えなくした)は捨てる
    for (const p of this.peers.values()) if (!show.includes(p)) { p.pending = null; p.pendingWave = false; }
  }
  bubble(p, i) {
    const F = p.F; if (!F) return;
    if (p.bub) { F.root.remove(p.bub); p.bub.material.dispose(); }
    const sq = i === WAVE_I;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sq ? waveTex() : stampTex(i), depthWrite: false, transparent: true, depthTest: false }));
    sp.userData.w = sq ? 0.55 : 1.0; sp.userData.sq = sq;
    sp.position.y = 2.62; sp.renderOrder = 6; sp.scale.set(0.01, 0.01, 1);
    F.root.add(sp); p.bub = sp; p.bubT = 0;
    if (p.dist < 25 && window.__app && window.__app.sound && window.__app.sound.play) { try { window.__app.sound.play('tick', { gain: 0.12, rate: 1.4 }); } catch (e) { /* 音なし */ } }
  }
  clean(p) {   // 2 分より古い行(落ちて消せなかった人)を消す。30 秒に 2 件まで
    const now = Date.now();
    if (p.cleaning || now - this.cleanT < 15000) return;
    this.cleanT = now; p.cleaning = true;
    const a = LS.get(K_AUTH, null); if (!a || !a.idToken) return;
    fetch(`${DB}/${ROOT}/${this.room}/${p.uid}.json?auth=${a.idToken}&print=silent`, { method: 'DELETE' }).then((r) => { if (r.ok) { stats.cleaned++; this.drop(p.uid); } }).catch(() => {});
  }
  // ---------------------------------------------------------- 画面(スタンプ・手を振る・人数)
  css() {
    if (document.getElementById('onlCss')) return;
    const st = document.createElement('style'); st.id = 'onlCss';
    st.textContent = `
#onl{position:fixed;right:12px;top:50%;transform:translateY(-50%);z-index:30;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none;font-family:"Hiragino Sans","Yu Gothic",sans-serif}
#onl.hide{display:none}
#onl .ob{pointer-events:auto;width:48px;height:48px;border-radius:50%;border:2px solid rgba(255,255,255,.85);background:rgba(10,22,48,.72);color:#fff;font:700 22px/44px sans-serif;text-align:center;padding:0;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.35);position:relative}
#onl .ob small{position:absolute;right:-4px;bottom:-6px;font:800 10px/14px sans-serif;background:#ffd65a;color:#3a2300;border-radius:7px;padding:0 4px}
#onl .cnt{pointer-events:none;background:rgba(10,22,48,.72);color:#fff;border-radius:12px;padding:3px 9px;font:700 12px/18px sans-serif;border:1px solid rgba(255,255,255,.4)}
#onl .pal{pointer-events:auto;display:flex;gap:6px;background:rgba(10,22,48,.82);padding:6px;border-radius:14px;border:2px solid rgba(255,255,255,.6)}
#onl .pal.hide{display:none}
#onl .pal button{border:0;border-radius:10px;min-width:48px;height:40px;padding:0 8px;font:900 15px/40px "Dela Gothic One","Hiragino Sans",sans-serif;cursor:pointer;position:relative}
#onl .pal button i{position:absolute;left:3px;top:1px;font:700 9px/10px sans-serif;font-style:normal;opacity:.6}
#onl .msg{background:rgba(0,0,0,.6);color:#fff;border-radius:10px;padding:4px 10px;font:700 12px/18px sans-serif;opacity:0;transition:opacity .3s}
#onl .msg.on{opacity:1}
body.touch #onl{top:38%}
body.touch #onl .ob{width:44px;height:44px;font-size:20px;line-height:40px}
body.replayOn #onl,body.photo #onl{display:none!important}
#onlOpt .row{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}
#onlOpt input{flex:1;min-width:120px;height:38px;border-radius:10px;border:2px solid #8fb2e8;background:#fff;color:#12305e;padding:0 10px;font:700 15px sans-serif}
#onlOpt .who{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-top:1px solid rgba(18,48,94,.18);font:700 14px sans-serif;color:#12305e}
#onlOpt .who button,#onlOpt .row button{height:36px;padding:0 14px;border-radius:18px;border:2px solid #cfe0ff;background:linear-gradient(#24529e,#123a7a);color:#fff;font:800 13px sans-serif;cursor:pointer;box-shadow:0 2px 0 rgba(0,0,0,.25)}
#onlOpt .who button{background:linear-gradient(#8a2b2b,#5e1414);border-color:#f3c3c3}
#onlOpt .row button.hide{display:none}
#onlOpt .list:empty::before{content:"いま近くに人はいません";display:block;padding:6px 0;font:700 13px sans-serif;color:#4a6390}
#onlOpt small{display:block;margin-top:8px;font-size:11.5px;color:#2c4878;line-height:1.5}
`;
    document.head.appendChild(st);
  }
  hud() {
    const el = document.createElement('div'); el.id = 'onl'; el.className = 'hide';
    el.innerHTML = '<div class="cnt"></div><div class="pal hide"></div><button class="ob" data-o="stamp" aria-label="スタンプ">⚾<small>X</small></button><button class="ob" data-o="wave" aria-label="手を振る">👋<small>Z</small></button><div class="msg"></div>';
    const pal = el.querySelector('.pal');
    STAMPS.forEach((s, i) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.s = i; b.style.background = s.bg; b.style.color = s.fg; b.innerHTML = `<i>${i + 1}</i>${s.t}`; pal.appendChild(b); });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.o === 'stamp') pal.classList.toggle('hide');
      else if (b.dataset.o === 'wave') this.waveHand();
      else if (b.dataset.s != null) { this.stamp(+b.dataset.s); pal.classList.add('hide'); }
    });
    document.body.appendChild(el); this.el = el;
    if (IS_TOUCH) el.querySelectorAll('.ob small,.pal i').forEach((x) => x.remove());
  }
  paintHud() {
    const el = this.el; if (!el) return;
    const A = app(), overlay = A && A.overlay;
    const on = this.active && !overlay;
    el.classList.toggle('hide', !on);
    if (!on) { el.querySelector('.pal').classList.add('hide'); return; }
    const n = this.shown.length, t = n ? `近くに ${n} 人` : '近くにはまだ誰もいません';
    const c = el.querySelector('.cnt'); if (c.textContent !== t) c.textContent = t;
  }
  flash(t) { const m = this.el && this.el.querySelector('.msg'); if (!m) return; m.textContent = t; m.classList.add('on'); clearTimeout(this._fl); this._fl = setTimeout(() => m.classList.remove('on'), 1600); }
  onKey(e) {
    if (!this.active || e.repeat) return;
    const A = app(); if (A && A.overlay) return;
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    const pal = this.el.querySelector('.pal');
    if (e.code === 'KeyZ') { this.waveHand(); return; }
    if (e.code === 'KeyX') { pal.classList.toggle('hide'); return; }
    if (!pal.classList.contains('hide') && /^Digit[1-5]$/.test(e.code)) { e.stopImmediatePropagation(); e.preventDefault(); this.stamp(+e.code.slice(5) - 1); pal.classList.add('hide'); }
  }
  // ---------------------------------------------------------- 一時停止の段「ほかの人(オンライン)」
  injectPause() {
    if (this.opt) return;
    const sheet = document.querySelector('#panel .sheet'); if (!sheet) return;
    const o = document.createElement('div'); o.className = 'opt'; o.id = 'onlOpt';
    o.innerHTML = '<div class="lab"><i class="li li-eye"></i>ほかの人(オンライン)</div><div class="seg"><button type="button" data-v="on">表示する</button><button type="button" data-v="off">表示しない</button></div>'
      + '<div class="row"><input type="text" maxlength="8" placeholder="' + NONAME + '" aria-label="表示名"><button type="button" data-a="name">名前を決める</button></div>'
      + '<div class="list"></div><div class="row"><button type="button" data-a="unhide" class="hide">見えなくした人を戻す</button></div>'
      + '<small>文字のチャットはありません。送るのは 位置・見た目・スタンプ・表示名(8 字まで)だけで、端末ごとの乱数の番号を使います。守備の試合の間は出ません。表示しない を選ぶと、自分も送りません。</small>';
    const hud = document.getElementById('hudOpt');
    if (hud && hud.parentNode === sheet) hud.after(o); else { const tm = document.getElementById('times'), at = tm && tm.closest('.opt'); sheet.insertBefore(o, at && at.parentNode === sheet ? at : null); }
    const inp = o.querySelector('input');
    inp.value = this.S.name || '';
    for (const ev of ['keydown', 'keyup', 'keypress']) inp.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === 'keydown' && e.key === 'Enter') this.setName(inp.value); });
    o.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return; e.stopPropagation();
      if (b.dataset.v) { this.S.on = b.dataset.v === 'on'; saveSetting(this.S); if (!this.S.on) this.leave(); }
      else if (b.dataset.a === 'name') this.setName(inp.value);
      else if (b.dataset.a === 'unhide') { this.S.hide = []; saveSetting(this.S); }
      else if (b.dataset.hide) { const h = new Set(this.S.hide || []); h.add(b.dataset.hide); this.S.hide = [...h].slice(-200); saveSetting(this.S); const p = this.peers.get(b.dataset.hide); if (p && p.F) p.F.root.visible = false; }
      this.paintPause();
    });
    this.opt = o;
    const ui = app().ui, pz = ui.pause.bind(ui);
    ui.pause = (...a) => { const r = pz(...a); try { this.paintPause(); } catch (er) { /* 段が無い */ } return r; };
    this.paintPause();
  }
  setName(v) {
    const raw = String(v || '').trim();
    const n = raw ? cleanName(raw) : NONAME;
    this.S.name = n === NONAME ? '' : n; saveSetting(this.S);
    const inp = this.opt && this.opt.querySelector('input'); if (inp) inp.value = this.S.name;
    this.forceSend = true;
    this.flashOpt(raw && n === NONAME ? 'その名前は使えないので「' + NONAME + '」にしました' : '表示名を「' + n + '」にしました');
  }
  flashOpt(t) { const sm = this.opt && this.opt.querySelector('small'); if (!sm) return; const keep = sm.dataset.keep || sm.textContent; sm.dataset.keep = keep; sm.textContent = t; clearTimeout(this._fo); this._fo = setTimeout(() => { sm.textContent = keep; }, 2500); }
  paintPause() {
    const o = this.opt; if (!o) return;
    const m = this.mode(); o.classList.toggle('hide', m === 'defense' || m === 'bat' || m === 'pitch');
    for (const b of o.querySelectorAll('.seg button')) { const on = (b.dataset.v === 'on') === !!this.S.on; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    const list = o.querySelector('.list'); list.innerHTML = '';
    for (const p of this.shown.slice(0, 8)) {
      const r = document.createElement('div'); r.className = 'who';
      const nm = document.createElement('span'); nm.textContent = `${cleanName(p.d.n)}(${Math.round(p.dist)} m)`;
      const b = document.createElement('button'); b.type = 'button'; b.dataset.hide = p.uid; b.textContent = '見えなくする';
      r.append(nm, b); list.appendChild(r);
    }
    const n = (this.S.hide || []).length, ub = o.querySelector('[data-a="unhide"]');
    ub.classList.toggle('hide', !n); ub.textContent = `見えなくした人を戻す(${n} 人)`;
  }
}
// 受けた行は決まった形だけ残す(ルールで弾いているが、念のため)
function sanitize(d) {
  const o = {}, num = (k, lo, hi) => { if (d[k] != null && Number.isFinite(+d[k]) && +d[k] >= lo && +d[k] <= hi) o[k] = +d[k]; };
  num('t', 0, 1e14); num('x', -2000, 2000); num('y', -300, 600); num('z', -2000, 2000); num('h', -7, 7); num('a', 0, 3); num('k', -100, 100); num('s', 0, STAMPS.length - 1); num('q', 0, 1e9); num('w', 0, 1e9);
  if (typeof d.n === 'string') o.n = d.n.slice(0, 10);
  if (typeof d.c === 'string' && /^[a-z0-9_|]{0,80}$/.test(d.c)) o.c = d.c;
  return o;
}

let inst = null;
if (!params.has('noonline')) {
  inst = new Online();
  window.__online = { get inst() { return inst; }, stats, STAMPS, cleanName, lookOf, myLook, buildFigure,
    peers: () => [...inst.peers.values()].map((p) => ({ uid: p.uid, n: cleanName(p.d.n), c: p.d.c, dist: Math.round(p.dist * 10) / 10, shown: inst.shown.includes(p), visible: !!(p.F && p.F.root.visible), near: !!(p.F && p.F.near.visible), bub: !!p.bub, wave: p.wave > 0, a: p.d.a })),
    get active() { return inst.active; }, get uid() { return inst.uid; }, get room() { return inst.room; }, get col() { return inst.col; }, get off() { return inst.off; },
    setting: () => ({ ...inst.S }), setOn: (v) => { inst.S.on = !!v; saveSetting(inst.S); if (!v) inst.leave(); }, setName: (n) => inst.setName(n), hideUid: (u) => { inst.S.hide = [...new Set([...(inst.S.hide || []), u])]; saveSetting(inst.S); }, unhideAll: () => { inst.S.hide = []; saveSetting(inst.S); },
    stamp: (i) => inst.stamp(i), wave: () => inst.waveHand(), get group() { return inst.group; } };
}
export default inst;
