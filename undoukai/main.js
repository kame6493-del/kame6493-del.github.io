'use strict';
// らくがき運動会: 画面・絵・音・共有。形の読み取りとレースの計算は sim.js(RU)。
const { Creature, Challenge, analyze, COURSES, FINISH, groundH, simulate, STATE_NAME, CPU_DEFS, cpuCreature, clamp, mulberry32, hashStr, timeAttack } = RU;

const CFG = {
  SHARE_URL: 'https://yurustudio.github.io/undoukai/', // 公開する場所(公開前はこの URL を予定として入れてある)
  TAG: '#らくがき運動会',
  AUTHOR: '@apkderete', // 共有文に作った人を入れる(遊んだ人の投稿に気づける)
  STORE_KEY: 'rakugaki_undoukai_v1',
  SIZE: 120,          // レースでの生き物の大きさ(世界の単位。画面の高さ = 760)
  VIEW_TOP: 240, VIEW_H: 760,
  COUNTDOWN: 2.4,     // 「よーい」から「ドン」まで
  VS_SIZE: 3,
  PER_BYTES: 380,     // URL に詰める1体の上限(バイト)。3体で約1,550文字
};
const FONT = '"Hiragino Maru Gothic ProN","Hiragino Sans","BIZ UDPGothic","Yu Gothic UI","Meiryo",sans-serif';
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function hash3(a, b, c) { let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const $ = id => document.getElementById(id);
const CALM = ['albumScreen', 'petScreen', 'taScreen', 'rankScreen', 'galleryScreen'];
function show(id) { if (CALM.includes(id) && scene) { scene = null; playing = false; if (!titleScene) titleScene = makeTitleScene(); bgm('bgm_title'); } for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden'); $('hud').classList.add('hidden'); if (id) { $(id).classList.remove('hidden'); Ads.load($(id)); } curScreen = id || 'race'; if (typeof Persist !== 'undefined') Persist.save(); }
let curScreen = 'titleScreen';
function toast(msg, ms) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms || 2600); }
let rnd = mulberry32(params.has('seed') ? Number(params.get('seed')) : (Date.now() & 0x7fffffff));
const newSeed = () => { if (window.__nextSeed != null) { const v = window.__nextSeed >>> 0; window.__nextSeed = null; return v; } return (Math.floor(rnd() * 4294967295) >>> 0); }; // __nextSeed は試験・動画撮影用

// ---------- 絵(ChatGPT の絵が届いたら assets/ に置くだけで使う。無ければ手描き風に描く) ----------
const ASSET_NAMES = ['bg_sky', 'bg_far', 'flags', 'logo', 'hurdle', 'beam', 'item_onigiri', 'ribbon', 'course_track', 'course_obstacle', 'course_slope', 'course_water'];
const IMG = {};
function loadAssets() {
  if (params.has('noimg')) return Promise.resolve();
  return Promise.all(ASSET_NAMES.map(n => new Promise(res => {
    const im = new Image();
    im.onload = () => { IMG[n] = im; res(); }; im.onerror = () => { IMG[n] = null; res(); };
    im.src = 'assets/' + n + '.png';
  })));
}

// ---------- 音(すべて CC0。出典は CREDITS.md) ----------
const SND = { ctx: null, buf: {}, master: null, bgmNode: null, bgmName: '', on: true, rec: null };
// 曲は OpenTracks(旧 DOVA-SYNDROME)、効果音は効果音ラボ。出典は CREDITS.md
const SND_FILES = { bgm_title: 'audio/bgm_title.mp3', bgm_race: 'audio/bgm_race.mp3' };
for (const k of ['click', 'select', 'whistle', 'pistol', 'cheer', 'clap', 'firework', 'trip', 'bonk', 'knock', 'item', 'gust', 'splash', 'jump', 'spurt', 'tap', 'kiai', 'shutter', 'last', 'fanfare', 'chan', 'prep']) SND_FILES[k] = 'audio/se_' + k + '.mp3';
try { SND.on = localStorage.getItem(CFG.STORE_KEY + '_snd') !== '0'; } catch (e) { }
function audioInit() {
  if (SND.ctx) { if (SND.ctx.state === 'suspended') SND.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  SND.ctx = new AC(); SND.master = SND.ctx.createGain(); SND.master.gain.value = SND.on ? 1 : 0; SND.master.connect(SND.ctx.destination);
  for (const [k, f] of Object.entries(SND_FILES)) {
    fetch(f).then(r => r.arrayBuffer()).then(a => SND.ctx.decodeAudioData(a)).then(b => { SND.buf[k] = b; if (k === SND.wantBgm) bgm(k, true); }).catch(() => { });
  }
}
function se(name, vol) {
  if (!SND.ctx || !SND.buf[name]) return;
  const s = SND.ctx.createBufferSource(); s.buffer = SND.buf[name];
  const g = SND.ctx.createGain(); g.gain.value = vol == null ? 0.55 : vol; s.connect(g); g.connect(SND.master); s.start();
}
function bgm(name, force) {
  SND.wantBgm = name;
  if (!SND.ctx || (!force && SND.bgmName === name)) return;
  if (SND.bgmNode) { try { SND.bgmNode.stop(); } catch (e) { } SND.bgmNode = null; }
  SND.bgmName = name;
  if (!name || !SND.buf[name]) return;
  const s = SND.ctx.createBufferSource(); s.buffer = SND.buf[name]; s.loop = true; s.loopStart = 0.05; s.loopEnd = s.buffer.duration - 0.03;
  const g = SND.ctx.createGain(); g.gain.value = 0.32; s.connect(g); g.connect(SND.master); s.start(); SND.bgmNode = s;
}
function setSound(on) { SND.on = on; if (SND.master) SND.master.gain.value = on ? 1 : 0; $('soundBtn').textContent = '音: ' + (on ? 'ON' : 'OFF'); try { localStorage.setItem(CFG.STORE_KEY + '_snd', on ? '1' : '0'); } catch (e) { } }
document.addEventListener('pointerdown', () => audioInit(), { capture: true });
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('button')) se('click', 0.35); }, { capture: true });

const BUSY_MSG = 'いまは混み合っていて、みんなの絵とランキングが一時的に見られません';
// ---------- 生き物の保存・読み込み(ここ1か所にまとめる。みんなのらくがきは online.js) ----------
const Store = {
  saveMine(cr) { try { const a = Store.listMine(); a.unshift(cr); localStorage.setItem(CFG.STORE_KEY + '_mine', JSON.stringify(a.slice(0, 12))); } catch (e) { } },
  listMine() { try { const a = JSON.parse(localStorage.getItem(CFG.STORE_KEY + '_mine') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } },
  online: null,
  busyShown: false,
  // 無料枠切れ(混み合い)の時は短く1回だけ知らせる。ひとりで遊ぶ・描く・共有はそのまま
  busy(e) {
    if (!(e && e.busy)) return false;
    if (!Store.busyShown) { Store.busyShown = true; toast(BUSY_MSG, 4000); }
    return true;
  },
  // init(ログイン)をしないで online.js だけ読む。覚えた物・pool.json だけで済む時、読む関数が自分で init する時に使う
  mod() { return import('./online.js'); },
  // アプリ版は、みんなに見える物(みんなのらくがき・部屋・ランキング)を初めて使う時に利用規約への同意をもらう
  termsOk() {
    if (!Full.native()) return true;
    try { if (localStorage.getItem(CFG.STORE_KEY + '_terms') === '1') return true; } catch (e) { }
    if (!confirm('みんなのらくがき・3人の部屋・ランキングでは、描いた絵と名前がほかの人にも見えます。\n利用規約(不快な絵・名前・いやがらせの禁止など)に同意して使いますか?\n規約はタイトル画面の「利用規約・配信について」で読めます。不快な絵は「通報」「見ない」で消せます。')) return false;
    try { localStorage.setItem(CFG.STORE_KEY + '_terms', '1'); } catch (e) { }
    return true;
  },
  async remote() {
    if (!Store.termsOk()) throw Object.assign(new Error('利用規約に同意すると使えます'), { terms: true });
    if (Store.online) return Store.online;
    const m = await import('./online.js');
    await m.init();
    Store.online = m; return m;
  },
};

// ---------- 完全版(買い切り。Android・iOS のアプリ版だけ RevenueCat の Purchases プラグインで買える) ----------
// できること: 縦動画の保存・ペンと色のパック・自分の図鑑(300匹)・キラキラ。どれも見た目だけで、走る速さ・強さは変わらない。
// ブラウザ版は買えない(今のまま遊べて、完全版の所には「アプリ版で使えます」とストアの案内を出す)。
const Full = {
  PID: 'jp.rakugakiundoukai.app.full', ENT: 'full',
  RC_KEYS: { android: 'goog_AkAbslCFlJUVfYzPYBVuZHIIJch', ios: 'appl_iugBYTchEgxZYmoYPaooSPtiOlZ' }, // RevenueCat の公開キー(秘密の鍵ではない)。scripts/rc_setup.py の結果
  PLAY_URL: 'https://yurustudio.github.io/blog/android-testers-6apps.html',
  KEY: CFG.STORE_KEY + '_full', FX_KEY: CFG.STORE_KEY + '_fx',
  owned: false, pkg: null, price: '', busy: false, ready: null, prev: null,
  platform() { const C = window.Capacitor; try { if (C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform) return C.getPlatform(); } catch (e) { } return 'web'; },
  native() { const p = Full.platform(); return p === 'android' || p === 'ios'; },
  has() { return (Full.native() && Full.owned) || (TEST && params.get('full') === '1'); },
  plugin() { if (!Full.native()) return null; const C = window.Capacitor; return (C && C.Plugins && C.Plugins.Purchases) || null; },
  isFull(info) { return !!(info && info.entitlements && info.entitlements.active && info.entitlements.active[Full.ENT]); },
  cancelled(e) { return !!(e && (e.userCancelled || (e.data && e.data.userCancelled) || String(e.code) === '1')); },
  pending(e) { return !!(e && (String(e.code) === '20' || /pending/i.test(String(e.message || '')))); },
  offline() { return navigator.onLine === false; },
  init() {
    const Pur = Full.plugin(); if (!Pur) return Promise.resolve(null);
    const key = Full.RC_KEYS[Full.platform()];
    if (!key) return Promise.reject(new Error('no key'));
    if (!Full.ready) Full.ready = Promise.resolve(Pur.configure({ apiKey: key })).then(() => Pur, e => { Full.ready = null; throw e; });
    return Full.ready;
  },
  // 値段(ストアの表示のまま)と、もう買ってあるか。入れ直した時は Android は購入の記録を自動で読み直す(iOS は「購入を復元」)
  async load() {
    const Pur = await Full.init(); if (!Pur) return;
    try {
      const offers = await Pur.getOfferings();
      const all = [];
      if (offers && offers.current) all.push(...(offers.current.availablePackages || []));
      if (offers && offers.all) for (const o of Object.values(offers.all)) all.push(...((o && o.availablePackages) || []));
      const pkg = all.find(p => p && p.product && String(p.product.identifier || '').split(':')[0] === Full.PID) || null;
      if (pkg) { Full.pkg = pkg; Full.price = pkg.product.priceString || ''; }
    } catch (e) { /* 値段が読めない時は値段なしで出す */ }
    try {
      let r = await Pur.getCustomerInfo();
      if (!Full.isFull(r && r.customerInfo) && Full.platform() === 'android' && !Full.owned && Pur.syncPurchases) { await Pur.syncPurchases(); r = await Pur.getCustomerInfo(); }
      if (Full.isFull(r && r.customerInfo)) Full.own(true);
    } catch (e) { /* つながらない時は前の記録のまま */ }
    Full.render();
  },
  own(quiet) {
    Full.owned = true; try { localStorage.setItem(Full.KEY, '1'); } catch (e) { }
    Full.refreshUi();
    if (!quiet) { se('fanfare', 0.45); toast('完全版になりました。ありがとうございます!', 3500); }
  },
  msg(t) { const el = $('fullStatus'); if (el) el.textContent = t || ''; },
  async buy() {
    const Pur = Full.plugin();
    if (!Pur) { Full.msg(Full.native() ? 'ストアにつなげませんでした' : '完全版はアプリ版(Android)で使えます'); return; }
    if (Full.busy) return;
    if (Full.offline()) { Full.msg('ネットにつながっていません。つながる所でもう一度どうぞ'); return; }
    Full.busy = true; Full.msg('ストアにつないでいます…'); Full.render();
    try {
      if (!Full.pkg) await Full.load();
      if (Full.owned) { Full.msg('完全版です。ありがとうございます'); return; }
      if (!Full.pkg) throw new Error('no package');
      const r = await Pur.purchasePackage({ aPackage: Full.pkg });
      if (Full.isFull(r && r.customerInfo)) { Full.own(); Full.msg('完全版になりました。ありがとうございます!'); }
      else Full.msg('購入の手続きが終わると完全版になります');
    } catch (e) {
      Full.msg(Full.cancelled(e) ? '購入をやめました' : Full.pending(e) ? '支払いの手続き中です。終わると完全版になります(「購入を復元」で確かめられます)'
        : Full.offline() ? 'ネットにつながっていません。つながる所でもう一度どうぞ' : '購入できませんでした。しばらくしてからもう一度ためしてください');
    } finally { Full.busy = false; Full.render(); }
  },
  async restore() {
    const Pur = Full.plugin();
    if (!Pur) { Full.msg(Full.native() ? 'ストアにつなげませんでした' : '購入の復元はアプリ版でできます'); return; }
    if (Full.busy) return;
    if (Full.offline()) { Full.msg('ネットにつながっていません。つながる所でもう一度どうぞ'); return; }
    Full.busy = true; Full.msg('購入のきろくをさがしています…'); Full.render();
    try {
      await Full.init();
      const r = await Pur.restorePurchases();
      if (Full.isFull(r && r.customerInfo)) { Full.own(true); Full.msg('完全版をもどしました'); toast('完全版をもどしました', 3000); }
      else Full.msg('購入のきろくが見つかりませんでした(買った時と同じストアのアカウントか確かめてください)');
    } catch (e) { Full.msg(Full.offline() ? 'ネットにつながっていません。つながる所でもう一度どうぞ' : 'ストアにつなげませんでした。しばらくしてからもう一度ためしてください'); }
    finally { Full.busy = false; Full.render(); }
  },
  // 案内の画面
  open(from) {
    Full.prev = { screen: curScreen, from };
    Full.msg(''); Full.render(); show('fullScreen');
    if (Full.native() && !Full.pkg) Full.load().catch(() => { });
  },
  back() {
    const p = Full.prev && Full.prev.screen; Full.prev = null;
    if (p === 'prepScreen' && G.me) openPrep(); else if (p === 'albumScreen') openAlbum(); else if (p === 'petScreen') openPet(G.petId) || openAlbum();
    else if (p === 'drawScreen' || p === 'resultScreen') show(p); else goTitle();
  },
  render() {
    if (!$('fullScreen')) return;
    const nat = Full.native();
    $('fullWebBox').classList.toggle('hidden', nat);
    $('fullBuyBox').classList.toggle('hidden', !nat);
    $('fullOwned').classList.toggle('hidden', !Full.has());
    $('fullBuyBtn').classList.toggle('hidden', Full.has());
    $('fullBuyBtn').disabled = Full.busy; $('fullRestoreBtn').disabled = Full.busy;
    $('fullBuyBtn').textContent = Full.price ? `完全版にする ${Full.price}` : '完全版にする';
  },
  refreshUi() {
    Full.render();
    const tb = $('fullBtn'); if (tb) tb.textContent = Full.has() ? '完全版(購入済み)' : Full.native() ? '完全版' : '完全版(アプリ版)';
    document.documentElement.classList.toggle('full', Full.has());
    if (typeof buildPenPanel === 'function') buildPenPanel();
  },
  fx() { try { const v = localStorage.getItem(Full.FX_KEY) || ''; return RU.Creature.FX.indexOf(v) > 0 ? v : ''; } catch (e) { return ''; } },
  setFx(v) { try { localStorage.setItem(Full.FX_KEY, v || ''); } catch (e) { } },
};
try { Full.owned = Full.native() && localStorage.getItem(Full.KEY) === '1'; } catch (e) { }
if (Full.native()) setTimeout(() => { Full.load().catch(e => { try { console.warn('[rakugaki] store', e && e.message); } catch (e2) { } }); }, 1200);
function blobToB64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => { const s = String(r.result); res(s.slice(s.indexOf(',') + 1)); }; r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); }
// 動画を端末に保存(Android は Documents/RakugakiUndoukai へ。できない時・iOS は共有の画面から「保存」)
async function saveToDevice(blob, name, type) {
  const C = window.Capacitor, P = (C && C.Plugins) || {};
  if (Full.platform() === 'android' && P.Filesystem) {
    try {
      try { const st = await P.Filesystem.checkPermissions(); if (st && st.publicStorage && st.publicStorage !== 'granted') await P.Filesystem.requestPermissions(); } catch (e) { }
      await P.Filesystem.writeFile({ path: 'RakugakiUndoukai/' + name, data: await blobToB64(blob), directory: 'DOCUMENTS', recursive: true });
      return 'saved';
    } catch (e) { console.warn('[rakugaki] save', e && e.message); }
  }
  await shareOrSave(blob, name, type);
  return 'shared';
}

// ---------- 描いた絵 → 走る生き物 ----------
class Doodle {
  constructor(creature, info, size) {
    this.cr = creature; this.info = info;
    const [x0, y0, x1, y1] = info.bbox;
    const W = Math.max(24, x1 - x0), H = Math.max(24, y1 - y0);
    const k = size / Math.max(W, H);
    const cx = (x0 + x1) / 2;
    const T = q => [(q[0] - cx) * k, (q[1] - y1) * k, (q[0] - x0) / W, (q[1] - y0) / H];
    this.w = W * k; this.h = H * k; this.k = k;
    const S = creature.strokes.filter(s => s && s.p && s.p.length);
    const body = S[info.bodyIndex] ? S[info.bodyIndex] : S[0];
    let bcx = 0, bcy = 0; for (const q of body.p) { bcx += q[0]; bcy += q[1]; } bcx /= body.p.length; bcy /= body.p.length;
    let legN = 0;
    const legs = [];
    this.parts = S.map((s, i) => {
      const role = info.roles[i] || 'other';
      let pivot = null;
      if (role === 'leg') { let top = s.p[0]; for (const q of s.p) if (q[1] < top[1]) top = q; pivot = T(top); legs.push(i); }
      if (role === 'wing' || role === 'tail') { let best = s.p[0], bd = 1e9; for (const q of s.p) { const d = (q[0] - bcx) ** 2 + (q[1] - bcy) ** 2; if (d < bd) { bd = d; best = q; } } pivot = T(best); }
      return { c: s.c, k: s.k || '', w: clamp(s.w * k * 1.1, 2.6, 8) * (size > 200 ? size / 210 : 1), role, pivot, li: 0, side: pivot ? (pivot[0] < 0 ? -1 : 1) : 1, p: s.p.map(T) };
    });
    // 足の番号は左から
    const lp = this.parts.filter(p => p.role === 'leg').sort((a, b) => a.pivot[0] - b.pivot[0]);
    lp.forEach((p, i) => p.li = i);
    this.legCount = lp.length;
  }
  // o: {mode, phase, state, t, x, air, alpha, shake}
  draw(ctx, x, ground, S, o) {
    const t = o.t, mode = this.info.mode, ph = o.phase || 0, st = o.state || 'run';
    const TAU = Math.PI * 2;
    let air = (o.air || 0), rot = 0, sx = 1, sy = 1, dx = 0;
    const moving = st === 'run' || st === 'burst';
    const runK = o.idle ? 0.35 : 1;
    if (moving) {
      if (mode === 'run1' || mode === 'jelly') { const h = Math.abs(Math.sin(ph * Math.PI)); air += h * (mode === 'jelly' ? 26 : 20) * runK; sy = 1 + (h - 0.5) * 0.16 * runK; sx = 1 / sy; }
      if (mode === 'run2') { air += Math.abs(Math.sin(ph * TAU)) * 6 * runK; rot = 0.08 * runK; }
      if (mode === 'many') { air += Math.abs(Math.sin(ph * TAU * 2)) * 3 * runK; }
      if (mode === 'fly') { air += Math.sin(t * 5) * 7; }
      if (mode === 'guru') { rot = Math.sin(t * 6.3 + ph) * 0.2 + (hash3(o.seedK || 1, Math.floor(t * 6), 3) - 0.5) * 0.25; }
      if (mode === 'roll') rot = (o.x || 0) / Math.max(20, this.h * 0.5 * S);
      if (st === 'burst') { dx = Math.sin(t * 50) * 2; }
    }
    if (o.idle && mode === 'roll') rot = Math.sin(t * 2) * 0.15;
    if (st === 'down') { rot = -1.35; air = 0; }
    if (st === 'fall') { rot = 1.1; }
    if (st === 'bonk') { rot = -0.25 + Math.sin(t * 40) * 0.08; }
    if (st === 'climb') { rot = -0.35; }
    if (st === 'jump' || st === 'hop' || st === 'knock') rot = -0.18;
    if (st === 'fly') rot = -0.1;
    if (o.wiggle) { sx *= 1 + Math.sin(t * 30) * 0.04; sy *= 1 - Math.sin(t * 30) * 0.04; }
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    // 影
    ctx.fillStyle = 'rgba(25,38,61,0.22)';
    ctx.beginPath(); ctx.ellipse(x, ground, this.w * S * 0.42 / (1 + air * 0.01), 7 * S, 0, 0, TAU); ctx.fill();
    const fxKind = this.cr.fx, fxY = ground - (this.h * 0.5 + air) * S, fxR = Math.max(this.w, this.h) * 0.62 * S;
    if (fxKind) drawFx(ctx, fxKind, x, fxY, fxR, t, 'back');
    ctx.translate(x + dx, ground - air * S);
    ctx.scale(S * sx, S * sy);
    const cy = -this.h / 2;
    if (mode === 'roll' && moving) { ctx.translate(0, cy); ctx.rotate(rot); ctx.translate(0, -cy); }
    else if (st === 'down' || st === 'fall') { ctx.rotate(rot); }
    else { ctx.translate(0, cy * 0.0); ctx.rotate(rot); }
    const step = Math.floor(t * 8);
    const legAmp = mode === 'many' ? 0.5 : 0.7;
    const legFreq = mode === 'many' ? 2 : 1;
    const deform = (part, q, i, j) => {
      let [px, py, u, v] = q;
      if (part.role === 'leg' && part.pivot && (moving || o.idle)) {
        const a = Math.sin(ph * TAU * legFreq + part.li * (mode === 'many' ? 1.9 : Math.PI)) * legAmp * runK;
        const ox = part.pivot[0], oy = part.pivot[1], ddx = px - ox, ddy = py - oy, c = Math.cos(a), s = Math.sin(a);
        px = ox + ddx * c - ddy * s; py = oy + ddx * s + ddy * c;
      }
      if (part.role === 'wing' && part.pivot) {
        const a = Math.sin(t * (mode === 'fly' ? 16 : 6) + (part.side > 0 ? 0 : 0)) * 0.55 * part.side;
        const ox = part.pivot[0], oy = part.pivot[1], ddx = px - ox, ddy = py - oy, c = Math.cos(a), s = Math.sin(a);
        px = ox + ddx * c - ddy * s; py = oy + ddx * s + ddy * c;
      }
      if (part.role === 'tail' && part.pivot && (moving || o.idle)) { // しっぽ・ひれをふる
        const a = Math.sin(t * (o.idle ? 4 : 11) + j) * 0.22 * runK;
        const ox = part.pivot[0], oy = part.pivot[1], ddx = px - ox, ddy = py - oy, c = Math.cos(a), s = Math.sin(a);
        px = ox + ddx * c - ddy * s; py = oy + ddx * s + ddy * c;
      }
      if (mode === 'worm' && (moving || o.idle)) {
        py += Math.sin(u * TAU * 1.3 - ph * TAU * 1.5) * 6 * runK;
        px += Math.sin(ph * TAU * 1.5) * (u - 0.5) * 8 * runK;
      }
      if (mode === 'guru') { px += (hash3(i, j + 77, step) - 0.5) * 5; py += (hash3(j, i + 5, step) - 0.5) * 5; }
      px += (hash3(i, j, step) - 0.5) * 2.4; py += (hash3(j + 977, i, step) - 0.5) * 2.4;
      return [px, py];
    };
    const paths = this.parts.map((part, j) => part.p.map((q, i) => deform(part, q, i, j)));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // シールのような白いふち → 色の線
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < this.parts.length; j++) {
        const part = this.parts[j], pts = paths[j];
        if (pass) { penPaint(ctx, part, pts, part.w, t); continue; }
        ctx.strokeStyle = '#ffffff'; ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = part.w + 7;
        pathOrDot(ctx, pts, ctx.lineWidth);
      }
    }
    ctx.restore();
    if (fxKind) drawFx(ctx, fxKind, x, fxY, fxR, t, 'front');
    // 転んだ時の星
    if (st === 'down' || st === 'bonk' || st === 'fall') {
      ctx.save(); ctx.translate(x, ground - this.h * S * 0.9 - air * S);
      for (let k = 0; k < 3; k++) { const a = t * 5 + k * 2.1; drawStar(ctx, Math.cos(a) * 26 * S, Math.sin(a) * 8 * S, 7 * S, '#ffd54f'); }
      ctx.restore();
    }
  }
}
function smoothPath(ctx, pts) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 2) { ctx.lineTo(pts[1][0], pts[1][1]); return; }
  for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); }
  const l = pts[pts.length - 1]; ctx.lineTo(l[0], l[1]);
}
function drawStar(ctx, x, y, r, c) {
  ctx.save(); ctx.translate(x, y); ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#19263d'; ctx.stroke(); ctx.restore();
}
// ---------- 完全版のペンとキラキラ(見た目だけ。形の読み取りとレースの計算には入らない) ----------
function pathOrDot(ctx, pts, lw) { ctx.beginPath(); if (pts.length === 1) { ctx.arc(pts[0][0], pts[0][1], lw / 2, 0, Math.PI * 2); ctx.fill(); } else { smoothPath(ctx, pts); ctx.stroke(); } }
// s: {c, k(ペンの種類)}。pts は描く座標。白いふちは呼ぶ側
function penPaint(ctx, s, pts, lw, t) {
  const k = s.k || ''; t = t || 0;
  ctx.lineWidth = lw;
  if (k === 'rainbow' && pts.length > 1) {
    const n = pts.length;
    for (let i = 0; i < n - 1; i++) { ctx.strokeStyle = `hsl(${Math.round((i / Math.max(1, n - 1)) * 300 + t * 90) % 360},88%,55%)`; ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke(); }
    return;
  }
  ctx.strokeStyle = k === 'rainbow' ? '#e2483d' : s.c; ctx.fillStyle = ctx.strokeStyle;
  pathOrDot(ctx, pts, lw);
  if (k === 'gold' || k === 'silver') { // つやの線
    ctx.save(); ctx.globalAlpha *= 0.85; ctx.strokeStyle = ctx.fillStyle = k === 'gold' ? '#fff3b0' : '#ffffff'; ctx.lineWidth = Math.max(1, lw * 0.3);
    ctx.translate(-lw * 0.17, -lw * 0.17); pathOrDot(ctx, pts, lw * 0.3); ctx.restore();
  }
  if (k === 'glitter' || k === 'gold' || k === 'silver') { // きらめく粒
    ctx.save();
    const step = Math.max(1, Math.floor(pts.length / 14)), a0 = ctx.globalAlpha;
    for (let i = 0; i < pts.length; i += step) {
      const h = hash3(i, pts.length, 91); if (k !== 'glitter' && h > 0.4) continue;
      const tw = 0.5 + 0.5 * Math.sin(t * 6 + h * 20);
      ctx.fillStyle = h > 0.5 ? '#ffffff' : '#fff176'; ctx.globalAlpha = a0 * (0.45 + 0.55 * tw);
      ctx.beginPath(); ctx.arc(pts[i][0] + (hash3(i, 3, 7) - 0.5) * lw * 0.6, pts[i][1] + (hash3(i, 5, 2) - 0.5) * lw * 0.6, Math.max(0.8, lw * (0.16 + 0.18 * tw)), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
function twinkle(ctx, x, y, r, c, a) {
  ctx.save(); ctx.globalAlpha *= 0.35 + 0.65 * a; ctx.fillStyle = c; ctx.strokeStyle = 'rgba(25,38,61,0.55)'; ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}
// キラキラ(完全版): kira=光の粒 / aura=オーラ / star=流れ星 / petal=花びら。layer back=体のうしろ・front=前
function drawFx(ctx, kind, cx, cy, R, t, layer) {
  if (!kind || !(R > 0)) return;
  ctx.save();
  if (kind === 'aura' && layer === 'back') {
    const p = 1 + Math.sin(t * 3) * 0.06, rr = R * 1.25 * p;
    const g = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, rr);
    g.addColorStop(0, 'rgba(255,240,140,0.8)'); g.addColorStop(0.55, 'rgba(255,213,79,0.42)'); g.addColorStop(1, 'rgba(255,213,79,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 6; i++) { const ph = (t * 0.7 + i / 6) % 1; ctx.globalAlpha = (1 - ph) * 0.95; ctx.fillStyle = '#fffbe0'; ctx.beginPath(); ctx.arc(cx + (hash3(i, 1, 4) - 0.5) * R * 1.5, cy + R * 0.7 - ph * R * 1.7, R * 0.055, 0, Math.PI * 2); ctx.fill(); }
  }
  if (kind === 'star' && layer === 'back') {
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const y = cy + (i - 1) * R * 0.38, x0 = cx - R * 0.35, len = R * (1.25 + 0.3 * Math.sin(t * 5 + i));
      const g = ctx.createLinearGradient(x0, y, x0 - len, y); g.addColorStop(0, 'rgba(255,213,79,0.95)'); g.addColorStop(1, 'rgba(255,213,79,0)');
      ctx.strokeStyle = g; ctx.lineWidth = R * 0.11; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 - len, y); ctx.stroke();
    }
    for (let i = 0; i < 4; i++) { const ph = (t * 1.4 + i / 4) % 1; ctx.globalAlpha = 1 - ph * 0.7; drawStar(ctx, cx - R * 0.55 - ph * R * 1.4, cy + (hash3(i, 2, 9) - 0.5) * R, R * 0.14 * (1 - ph * 0.5), '#ffd54f'); }
  }
  if (kind === 'kira' && layer === 'front') {
    for (let i = 0; i < 9; i++) {
      const a = hash3(i, 7, 1) * Math.PI * 2 + t * 0.6, rr = R * (0.75 + hash3(i, 3, 3) * 0.45), tw = 0.5 + 0.5 * Math.sin(t * 7 + i * 1.7);
      twinkle(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.85, R * 0.12 * (0.45 + tw), i % 3 ? '#fff176' : '#ffffff', tw);
    }
  }
  if (kind === 'petal' && layer === 'front') {
    for (let i = 0; i < 9; i++) {
      const ph = (t * 0.35 + hash3(i, 4, 4)) % 1, x = cx + (hash3(i, 8, 2) - 0.5) * R * 2.2 + Math.sin(t * 2 + i) * R * 0.15, y = cy - R * 1.1 + ph * R * 2.2;
      ctx.save(); ctx.globalAlpha *= Math.min(1, (1 - ph) * 2.5); ctx.translate(x, y); ctx.rotate(t * 2 + i);
      ctx.fillStyle = i % 2 ? '#ffc2d8' : '#ff8fb8'; ctx.strokeStyle = 'rgba(25,38,61,0.5)'; ctx.lineWidth = Math.max(1, R * 0.015);
      ctx.beginPath(); ctx.ellipse(0, 0, R * 0.1, R * 0.055, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
// 手描き風の線(少しゆれる)
function wline(ctx, x0, y0, x1, y1, seed, amp) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 40));
  ctx.moveTo(x0, y0);
  for (let i = 1; i <= n; i++) { const t = i / n; ctx.lineTo(lerp(x0, x1, t) + (hash3(seed, i, 1) - 0.5) * amp, lerp(y0, y1, t) + (hash3(seed, i, 2) - 0.5) * amp); }
}
// 小さな絵(一覧・カード用)
function drawThumb(cv, cr, opt) {
  const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  if (opt && opt.bg) { ctx.fillStyle = opt.bg; ctx.fillRect(0, 0, W, H); }
  const S = cr.strokes.filter(s => s.p && s.p.length); if (!S.length) return;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const s of S) for (const [x, y] of s.p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pad = 0.12, k = Math.min(W * (1 - pad * 2) / Math.max(20, x1 - x0), H * (1 - pad * 2) / Math.max(20, y1 - y0));
  const fxR = Math.max((x1 - x0) * k, (y1 - y0) * k) * 0.55, ft = opt && opt.t != null ? opt.t : 0.6;
  if (cr.fx) drawFx(ctx, cr.fx, W / 2, H / 2, fxR, ft, 'back');
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(k, k); ctx.translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of S) penPaint(ctx, s, s.p, Math.max(s.w, 2.2 / k), ft);
  ctx.restore();
  if (cr.fx) drawFx(ctx, cr.fx, W / 2, H / 2, fxR, ft, 'front');
}

// ---------- 運動場 ----------
function laneLayout(n) {
  const top = 560, bot = 905;
  const ys = [], sc = [];
  for (let i = 0; i < n; i++) { const f = n === 1 ? 0.5 : i / (n - 1); ys.push(lerp(top, bot, f)); sc.push((n <= 3 ? 0.98 : 0.82) + f * (n <= 3 ? 0.14 : 0.18)); }
  return { ys, sc };
}
function drawBackground(ctx, cam, W, H, course, t) {
  const viewW = W / cam.s;
  // 空
  const sky = IMG.bg_sky;
  if (sky) { const k = Math.max(W / sky.naturalWidth, H / sky.naturalHeight); ctx.drawImage(sky, (W - sky.naturalWidth * k) / 2, 0, sky.naturalWidth * k, sky.naturalHeight * k); }
  else { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#7fd3fb'); g.addColorStop(0.55, '#b9e9ff'); g.addColorStop(1, '#d8f4ff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  ctx.save(); ctx.scale(cam.s, cam.s); ctx.translate(-cam.x, -cam.y);
  // 雲
  if (!sky) {
    const par = 0.15, base = cam.x * (1 - par);
    for (let i = Math.floor((cam.x - base) / 600) - 1; i < Math.floor((cam.x - base + viewW) / 600) + 2; i++) {
      const cx = base + i * 600 + hash3(i, 3, 3) * 200, cy = 280 + hash3(i, 4, 4) * 90;
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = 'rgba(25,38,61,0.35)'; ctx.lineWidth = 3;
      ctx.beginPath(); for (let k = 0; k < 4; k++) { ctx.moveTo(cx + k * 40 + 34, cy); ctx.arc(cx + k * 40, cy - (k % 2) * 16, 34 + (k % 2) * 8, 0, 7); } ctx.fill(); ctx.stroke();
    }
  }
  // 遠くの校舎とテント
  const far = IMG.bg_far;
  if (far) {
    const fh = 200, fw = fh * far.naturalWidth / far.naturalHeight, par = 0.4, base = cam.x * par;
    const i0 = Math.floor((cam.x - base) / fw) - 1;
    for (let i = i0; i < i0 + Math.ceil(viewW / fw) + 3; i++) ctx.drawImage(far, base + i * fw, 452 - fh, fw + 1, fh);
  } else {
    const par = 0.4, base = cam.x * par, tile = 1500;
    const i0 = Math.floor((cam.x - base) / tile) - 1;
    for (let i = i0; i < i0 + Math.ceil(viewW / tile) + 3; i++) drawSchoolTile(ctx, base + i * tile, i);
  }
  // 万国旗
  if (IMG.flags) {
    const im = IMG.flags, par = 0.7, base = cam.x * par, fw = 760, fh = fw * im.naturalHeight / im.naturalWidth;
    const i0 = Math.floor((cam.x - base) / fw) - 1;
    for (let i = i0; i < i0 + Math.ceil(viewW / fw) + 3; i++) ctx.drawImage(im, base + i * fw, 290 + (i % 2) * 14, fw + 2, fh);
  } else {
    const par = 0.7, base = cam.x * par, gap = 520;
    const i0 = Math.floor((cam.x - base) / gap) - 1;
    for (let i = i0; i < i0 + Math.ceil(viewW / gap) + 3; i++) {
      const x0 = base + i * gap, x1 = x0 + gap, y = 300;
      ctx.strokeStyle = '#19263d'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo(x0 + gap / 2, y + 60, x1, y); ctx.stroke();
      const cols = ['#e2483d', '#ffd54f', '#35b8e8', '#65c982', '#ffffff', '#f08a24', '#8a4fd8'];
      for (let k = 1; k < 9; k++) {
        const u = k / 9, fx = lerp(x0, x1, u), fy = y + 4 * u * (1 - u) * 60 * 0.5 * 2 - 0;
        const sw = Math.sin(t * 3 + k + i) * 3;
        ctx.fillStyle = cols[(k + i * 3) % cols.length];
        ctx.beginPath(); ctx.moveTo(fx - 13, fy); ctx.lineTo(fx + 13, fy); ctx.lineTo(fx + sw, fy + 30); ctx.closePath(); ctx.fill();
        ctx.lineWidth = 2; ctx.stroke();
      }
    }
  }
  ctx.restore();
}
function drawSchoolTile(ctx, x, i) {
  ctx.save(); ctx.translate(x, 0);
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(25,38,61,0.55)';
  // 木
  for (let k = 0; k < 3; k++) { const tx = 80 + k * 520 + hash3(i, k, 9) * 60; ctx.fillStyle = '#4fb36e'; ctx.beginPath(); ctx.arc(tx, 400, 52, 0, 7); ctx.arc(tx + 46, 412, 40, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#7a5236'; ctx.fillRect(tx + 14, 430, 12, 40); }
  if (i % 2 === 0) {
    // 校舎
    ctx.fillStyle = '#e6eef7'; ctx.beginPath(); ctx.rect(300, 230, 760, 240); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d3dfec'; ctx.beginPath(); ctx.rect(620, 170, 120, 70); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(680, 205, 24, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(680, 205); ctx.lineTo(680, 190); ctx.moveTo(680, 205); ctx.lineTo(692, 210); ctx.stroke();
    ctx.fillStyle = '#8fd0f0';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) { ctx.beginPath(); ctx.rect(326 + c * 82, 252 + r * 66, 56, 40); ctx.fill(); ctx.stroke(); }
  } else {
    // テントと応援の人たち
    for (let k = 0; k < 2; k++) {
      const tx = 260 + k * 560;
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(tx, 360); ctx.lineTo(tx + 380, 360); ctx.lineTo(tx + 350, 320); ctx.lineTo(tx + 30, 320); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = k ? '#e2483d' : '#35b8e8';
      for (let s = 0; s < 6; s++) { ctx.beginPath(); ctx.rect(tx + s * 63, 360, 31, 14); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(tx + 10, 360); ctx.lineTo(tx + 10, 470); ctx.moveTo(tx + 370, 360); ctx.lineTo(tx + 370, 470); ctx.stroke();
      for (let p = 0; p < 7; p++) {
        const px = tx + 40 + p * 48, py = 430 + hash3(i, p, k) * 8;
        ctx.fillStyle = ['#ffd54f', '#f6b8a0', '#e2483d', '#35b8e8', '#65c982'][p % 5];
        ctx.beginPath(); ctx.arc(px, py, 15, 0, 7); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.rect(px - 14, py + 14, 28, 26); ctx.fill(); ctx.stroke();
      }
    }
  }
  ctx.restore();
}
function drawTrack(ctx, cam, W, H, course, lanes, opt) {
  const viewW = W / cam.s;
  ctx.save(); ctx.scale(cam.s, cam.s); ctx.translate(-cam.x, -cam.y);
  const xa = cam.x - 50, xb = cam.x + viewW + 50;
  const gh = x => groundH(course, x);
  const topY = 470;
  // 芝生(坂は持ち上がる)
  ctx.fillStyle = '#65c982';
  ctx.beginPath(); ctx.moveTo(xa, 1100);
  for (let x = xa; x <= xb; x += 25) ctx.lineTo(x, topY - 34 - gh(x));
  ctx.lineTo(xb, 1100); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(25,38,61,0.6)'; ctx.lineWidth = 3; ctx.beginPath();
  for (let x = xa; x <= xb; x += 25) (x === xa ? ctx.moveTo : ctx.lineTo).call(ctx, x, topY - 34 - gh(x)); ctx.stroke();
  // トラック
  ctx.fillStyle = '#ea8359';
  ctx.beginPath(); ctx.moveTo(xa, 1100);
  for (let x = xa; x <= xb; x += 25) ctx.lineTo(x, topY - gh(x));
  ctx.lineTo(xb, 1100); ctx.closePath(); ctx.fill();
  ctx.beginPath(); for (let x = xa; x <= xb; x += 25) (x === xa ? ctx.moveTo : ctx.lineTo).call(ctx, x, topY - gh(x)); ctx.stroke();
  // 土のつぶ
  ctx.fillStyle = 'rgba(160,70,40,0.25)';
  for (let x = Math.floor(xa / 90) * 90; x < xb; x += 90) for (let k = 0; k < 4; k++) { const px = x + hash3(x, k, 1) * 90, py = 500 + hash3(x, k, 2) * 480; ctx.beginPath(); ctx.arc(px, py - gh(px), 3, 0, 7); ctx.fill(); }
  // レーンの白線(手描き風)
  const { ys } = lanes;
  const gapY = ys.length > 1 ? (ys[1] - ys[0]) : 120;
  const lineYs = [ys[0] - gapY * 0.55].concat(ys.map(y => y + gapY * 0.45));
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 5;
  for (let li = 0; li < lineYs.length; li++) {
    ctx.beginPath();
    for (let x = xa, k = 0; x <= xb; x += 40, k++) { const y = lineYs[li] - gh(x) + (hash3(Math.floor(x / 40), li, 7) - 0.5) * 3; (x === xa ? ctx.moveTo : ctx.lineTo).call(ctx, x, y); }
    ctx.stroke();
  }
  // スタートとゴールの線
  for (const [lx, col] of [[0, '#ffffff'], [FINISH, '#ffffff']]) {
    if (lx < xa - 40 || lx > xb + 40) continue;
    ctx.strokeStyle = col; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(lx, lineYs[0] - gh(lx)); ctx.lineTo(lx + 30, lineYs[lineYs.length - 1] - gh(lx)); ctx.stroke();
  }
  // 水たまり
  for (const w of course.water) {
    if (w[1] < xa || w[0] > xb) continue;
    for (let li = 0; li < ys.length; li++) {
      const y = ys[li] + 4, cx = (w[0] + w[1]) / 2, rx = (w[1] - w[0]) / 2 + 20;
      ctx.fillStyle = '#35b8e8'; ctx.strokeStyle = 'rgba(25,38,61,0.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(cx, y, rx, gapY * 0.32, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3;
      for (let k = 0; k < 4; k++) { const px = w[0] + 40 + k * (w[1] - w[0] - 80) / 3; ctx.beginPath(); ctx.moveTo(px, y - 6); ctx.lineTo(px + 26, y - 6); ctx.stroke(); }
    }
  }
  // あみくぐり(上から網がかぶさる)
  if (course.net && !(course.net[1] < xa || course.net[0] > xb)) {
    const [a, b] = course.net;
    for (let li = 0; li < ys.length; li++) {
      const y = ys[li];
      ctx.fillStyle = 'rgba(25,38,61,0.06)'; ctx.fillRect(a, y - 70, b - a, 70);
    }
  }
  // ゴールの柱
  if (FINISH + 40 > xa && FINISH - 40 < xb) {
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#19263d'; ctx.lineWidth = 4;
    for (const py of [lineYs[0] - 8, lineYs[lineYs.length - 1] + 6]) { ctx.beginPath(); ctx.rect(FINISH + (py > 700 ? 30 : 0) - 8, py - 260, 16, 260); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.rect(FINISH - 60, lineYs[0] - 300, 150, 52); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#19263d'; ctx.font = `bold 34px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('ゴール', FINISH + 15, lineYs[0] - 274);
  }
  ctx.restore();
  return lineYs;
}
// 各レーンの手前に描く物(ハードル・平均台・網)
function drawLaneProps(ctx, course, li, y, S, xa, xb, race, t, fg) {
  const gh = x => groundH(course, x);
  if (!fg) {
    if (course.beam && !(course.beam[1] < xa || course.beam[0] > xb)) {
      const [a, b] = course.beam, h = 38 * S;
      if (IMG.beam) { const im = IMG.beam, bh = (h + 14 * S) * 1.0; ctx.drawImage(im, a - 6, y - bh - 2 * S, b - a + 12, bh + 6 * S); }
      else {
        ctx.fillStyle = '#5b8bd6'; ctx.strokeStyle = '#19263d'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.rect(a, y - h - 12 * S, b - a, 14 * S); ctx.fill(); ctx.stroke();
        for (const lx of [a + 30, (a + b) / 2, b - 30]) { ctx.beginPath(); ctx.moveTo(lx - 12, y); ctx.lineTo(lx, y - h); ctx.lineTo(lx + 12, y); ctx.stroke(); }
      }
    }
    course.hurdles.forEach((hx, hi) => {
      if (hx < xa - 60 || hx > xb + 60) return;
      const kt = race && race.knocked[li + '_' + hi];
      const down = kt != null && t >= kt;
      ctx.save(); ctx.translate(hx, y - gh(hx));
      ctx.strokeStyle = '#19263d'; ctx.lineWidth = 4;
      if (down) { if (IMG.hurdle) { const im = IMG.hurdle, hw = 84 * S, hh = hw * im.naturalHeight / im.naturalWidth; ctx.save(); ctx.translate(10 * S, 0); ctx.rotate(1.35); ctx.drawImage(im, -hw / 2, -hh, hw, hh); ctx.restore(); } else { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.rect(-36 * S, -10 * S, 72 * S, 10 * S); ctx.fill(); ctx.stroke(); } }
      else if (IMG.hurdle) { const im = IMG.hurdle, hw = 84 * S, hh = hw * im.naturalHeight / im.naturalWidth; ctx.drawImage(im, -hw / 2, -hh + 4 * S, hw, hh); }
      else {
        const h = 52 * S;
        ctx.beginPath(); ctx.moveTo(-30 * S, 0); ctx.lineTo(-30 * S, -h); ctx.moveTo(30 * S, 0); ctx.lineTo(30 * S, -h); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.rect(-38 * S, -h - 6 * S, 76 * S, 13 * S); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e2483d'; for (let k = 0; k < 3; k++) ctx.fillRect(-30 * S + k * 24 * S, -h - 4 * S, 10 * S, 9 * S);
      }
      ctx.restore();
    });
  } else if (course.net && !(course.net[1] < xa || course.net[0] > xb)) {
    // 網は生き物の上にかぶせる
    const [a, b] = course.net, top = y - 64 * S;
    ctx.save(); ctx.strokeStyle = 'rgba(25,38,61,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = a; x <= b; x += 22) { ctx.moveTo(x, top + Math.sin(x * 0.05 + t * 2) * 4); ctx.lineTo(x + 30, y); }
    for (let k = 0; k <= 3; k++) { const yy = top + k * (y - top) / 3; ctx.moveTo(a, yy); ctx.lineTo(b, yy + Math.sin(t * 2 + k) * 3); }
    ctx.stroke();
    ctx.strokeStyle = '#19263d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(a, top); ctx.quadraticCurveTo((a + b) / 2, top - 8, b, top); ctx.stroke();
    ctx.restore();
  }
}

// ---------- レースの場面 ----------
// scene: { ents:[{doodle,name,color,isMe,cpu}], race, course, me, lanes }
function racerAt(scene, i, t) {
  const fr = scene.race.frames, fps = scene.race.fps;
  if (t <= 0) return { x: 0, air: 0, state: 'run', phase: 0, v: 0, idle: true };
  const f = t * fps, k = Math.min(fr.length - 1, Math.floor(f)), k2 = Math.min(fr.length - 1, k + 1), u = clamp(f - k, 0, 1);
  const a = fr[k][i], b = fr[k2][i];
  return { x: lerp(a[0], b[0], u), air: lerp(a[1], b[1], u), state: STATE_NAME[a[2]] || 'run', phase: lerp(a[3], b[3], u), v: a[4] };
}
function renderScene(ctx, W, H, scene, t, cam, opt) {
  opt = opt || {};
  const course = COURSES[scene.course];
  drawBackground(ctx, cam, W, H, course, t);
  const lanes = scene.lanes;
  const lineYs = drawTrack(ctx, cam, W, H, course, lanes, opt);
  ctx.save(); ctx.scale(cam.s, cam.s); ctx.translate(-cam.x, -cam.y);
  const viewW = W / cam.s, xa = cam.x - 100, xb = cam.x + viewW + 100;
  const tapeBroken = scene.race.times.some(x => x != null && x <= t);
  for (let li = 0; li < scene.ents.length; li++) {
    const e = scene.ents[li], y = lanes.ys[li], S = lanes.sc[li];
    drawLaneProps(ctx, course, li, y, S, xa, xb, scene.race, t, false);
    const r = racerAt(scene, li, t);
    drawLaneItems(ctx, scene, li, y, S, xa, xb, t, r.x);
    const gx = r.x, ground = y - groundH(course, gx);
    if (gx > xa - 200 && gx < xb + 200) {
      // 走っている時の砂ぼこり(ui_race の見本に合わせる)
      if (t > 0 && r.v > 60 && r.air < 5 && (r.state === 'run' || r.state === 'burst')) {
        ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.strokeStyle = 'rgba(25,38,61,0.35)'; ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          const ph2 = ((t * 3 + k / 3 + li * 0.21) % 1);
          const px = gx - e.doodle.w * S * 0.5 - ph2 * 50 * S, py = ground - 6 * S - ph2 * 10 * S, rr = (5 + ph2 * 9) * S;
          ctx.globalAlpha = 1 - ph2; ctx.beginPath(); ctx.arc(px, py, rr, 0, 7); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
      }
      // 水しぶき
      const inW = course.water.some(w => gx >= w[0] && gx <= w[1]);
      e.doodle.draw(ctx, gx, ground + (inW && e.doodle.info.mode !== 'fly' ? 8 * S : 0), S, { t: t + li * 0.37, phase: r.phase, state: t <= 0 ? 'run' : r.state, air: r.air, x: gx, idle: t <= 0, seedK: li + 1, wiggle: opt.wiggle });
      if (inW && r.v > 30 && e.doodle.info.mode !== 'fly') {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        for (let k = 0; k < 5; k++) { const a = hash3(li, k, Math.floor(t * 12)); ctx.beginPath(); ctx.arc(gx - 30 * S + a * 60 * S, ground - 8 * S - hash3(k, li, Math.floor(t * 12)) * 30 * S, 4 * S, 0, 7); ctx.fill(); }
      }
      // 名札
      if (e.isMe || scene.ents.length <= 4 || opt.allTags) {
        const ty = ground - (e.doodle.h + 26) * S - r.air * S;
        ctx.font = `bold ${Math.round(24 * S)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const label = e.isMe && scene.ents.filter(x => x.isMe).length === 1 && scene.mode === 'solo' ? 'あなた' : e.name;
        const tw = ctx.measureText(label).width + 18 * S;
        ctx.fillStyle = e.isMe ? '#ffd54f' : 'rgba(255,255,255,0.92)'; ctx.strokeStyle = '#19263d'; ctx.lineWidth = e.isMe ? 3.5 : 2.5;
        roundRect(ctx, gx - tw / 2, ty - 17 * S, tw, 34 * S, 12 * S); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gx - 7 * S, ty + 17 * S); ctx.lineTo(gx + 7 * S, ty + 17 * S); ctx.lineTo(gx, ty + 27 * S); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#19263d'; ctx.fillText(label, gx, ty + 1);
      }
    }
    drawLaneProps(ctx, course, li, y, S, xa, xb, scene.race, t, true);
  }
  // ゴールテープ
  if (FINISH + 40 > xa && FINISH - 40 < xb) {
    ctx.strokeStyle = '#e2483d'; ctx.lineWidth = 7; ctx.beginPath();
    if (!tapeBroken) { ctx.moveTo(FINISH, lineYs[0] - 120); ctx.quadraticCurveTo(FINISH + 10, (lineYs[0] + lineYs[lineYs.length - 1]) / 2 - 100, FINISH + 30, lineYs[lineYs.length - 1] - 120); }
    else { ctx.moveTo(FINISH, lineYs[0] - 120); ctx.lineTo(FINISH + 40, lineYs[0] - 40); ctx.moveTo(FINISH + 30, lineYs[lineYs.length - 1] - 120); ctx.lineTo(FINISH + 70, lineYs[lineYs.length - 1] - 30); }
    ctx.stroke();
  }
  // 紙ふぶき
  if (scene.confetti) for (const p of scene.confetti) {
    const dt = t - p.t0; if (dt < 0 || dt > 2.5) continue;
    ctx.save(); ctx.translate(p.x + p.vx * dt, p.y + p.vy * dt + 350 * dt * dt); ctx.rotate(p.r + dt * 6); ctx.fillStyle = p.c; ctx.fillRect(-8, -4, 16, 8); ctx.restore();
  }
  ctx.restore();
  // 「よーい、ドン!」
  if (t < 0.8 && !opt.noCount) {
    const tc = t + CFG.COUNTDOWN;
    let text = '', p = 0;
    if (tc < 0.9) { text = '位置について'; p = tc / 0.25; }
    else if (tc < CFG.COUNTDOWN) { text = 'よーい'; p = (tc - 0.9) / 0.25; }
    else { text = 'ドン!'; p = (tc - CFG.COUNTDOWN) / 0.18; }
    const fs = Math.min(W * 0.16, H * 0.12) * (text === 'ドン!' ? 1.35 : 0.8);
    ctx.save(); ctx.translate(W / 2, H * 0.36); const sc = easeOutBack(clamp(p, 0, 1)); ctx.scale(sc, sc); ctx.rotate(-0.05);
    ctx.font = `900 ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = fs * 0.18; ctx.strokeStyle = '#19263d'; ctx.lineJoin = 'round'; ctx.strokeText(text, 0, 0);
    ctx.fillStyle = text === 'ドン!' ? '#e2483d' : '#ffffff'; ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  // 写真判定
  if (scene.photoT != null && t >= scene.photoT && t < scene.photoT + 1.6 && !opt.noBanner && opt.photoBanner) {
    const fs = Math.min(W * 0.12, H * 0.09);
    ctx.save(); ctx.translate(W / 2, H * 0.28); ctx.rotate(-0.04);
    ctx.font = `900 ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = fs * 0.16; ctx.strokeStyle = '#19263d'; ctx.strokeText('写真判定!', 0, 0); ctx.fillStyle = '#ffd54f'; ctx.fillText('写真判定!', 0, 0); ctx.restore();
  }
}
function sceneCam(scene, t, W, H, followX) {
  let s = H / CFG.VIEW_H;
  let fx = followX;
  if (fx == null) { const i = scene.meIndex >= 0 ? scene.meIndex : 0; fx = racerAt(scene, i, t).x; }
  // 接戦のゴール: ゴールの線に寄る
  let z = 0;
  const sw = scene.slow;
  if (sw && !scene.noZoom) { z = t < sw.a - 0.5 ? 0 : t < sw.a ? (t - sw.a + 0.5) / 0.5 : t < sw.b + 0.4 ? 1 : t < sw.b + 1.2 ? 1 - (t - sw.b - 0.4) / 0.8 : 0; z = clamp(z, 0, 1); z = z * z * (3 - 2 * z); }
  if (z > 0) { s *= 1 + 0.4 * z; fx = lerp(fx, FINISH, 0.55 * z); }
  const viewW = W / s;
  let x = fx - viewW * (W < H ? 0.45 : 0.36) * (1 - z) - viewW * 0.5 * z;
  x = clamp(x, -viewW * 0.25, FINISH + 360 - viewW);
  const vh = H / s;
  let y = CFG.VIEW_TOP + (CFG.VIEW_H - vh) * 0.72;
  if (scene.shake > 0) { x += (Math.random() - 0.5) * scene.shake * 14; y += (Math.random() - 0.5) * scene.shake * 10; }
  return { x, y, s };
}

// ---------- 実況 ----------
const LINES = {
  trip: ['おおっと、○○が転んだ!', '○○、自分の足に引っかかった!', '○○、まだ起き上がらない!'],
  burst: ['○○、なぜか加速している!', '○○、意外と速いぞ!', '○○、ここで謎の大ジャンプ!'],
  stall: ['○○、空中で止まった!?', '○○、走り方がちょっと怖い!'],
  flyover: ['○○、空中に浮いたー!', '○○、これは走っているのか!?'],
  bonk: ['○○、ハードルにぶつかった!', '○○、向きがおかしくないか!?'],
  knock: ['○○、ハードルをなぎ倒した!'],
  climb: ['○○、ハードルをよじのぼる!', '○○、体が伸びているー!'],
  fall: ['○○、平均台から落ちたー!'],
  splash: ['○○、水たまりに突っ込んだ!'],
  lead: ['○○、まさかの先頭争い!', '○○が先頭に!', '○○が先頭に出た!'],
  last: ['○○、ゴールが見えてきた!', '○○、ここから巻き返せるか!'],
  item: ['○○、おにぎりを拾った!', '○○、おにぎりで元気100倍!', '○○、もぐもぐダッシュ!'],
  gust: ['うしろから追い風だー!', 'ここで追い風! うしろの子が迫る!'],
  spurt: ['○○、ラストスパート!', '○○、ここで ギアが上がった!', '○○、最後の力をふりしぼる!'],
  recover: ['○○、すぐ起き上がった!', '○○、転んでもくじけない!'],
  cheer: ['○○に応援が届いた!', '○○、気合いが入った!'],
};
function pickLine(type, name, k) { const a = LINES[type]; if (!a) return ''; return a[k % a.length].replace('○○', name); }

// ---------- 画面の大きさ ----------
const stage = $('stage'), sctx = stage.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
function resize() { DPR = Math.min(window.devicePixelRatio || 1, 2); CW = window.innerWidth; CH = window.innerHeight; stage.width = Math.round(CW * DPR); stage.height = Math.round(CH * DPR); }
window.addEventListener('resize', resize);

// ---------- 描く板 ----------
const pad = $('pad'), pctx = pad.getContext('2d');
const COLORS = Creature.PALETTE;
let penColor = COLORS[0], penWidth = 14;
let strokes = [], cur = null;
function renderPad() {
  pctx.clearRect(0, 0, 600, 600);
  pctx.lineCap = 'round'; pctx.lineJoin = 'round';
  for (const s of strokes) penPaint(pctx, s, s.p, s.w, 0.6);
  $('padHint').style.display = strokes.length ? 'none' : '';
  $('drawDoneBtn').disabled = !strokes.length;
}
// 描いている形の名前・特徴は見せない(どう描けば速いかは、走らせて考える)。ここでは描きかけを覚えるだけ
function updateLiveType() { if (typeof Persist !== 'undefined') Persist.save(); }
function padXY(e) { const r = pad.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width * 600, 0, 600), clamp((e.clientY - r.top) / r.height * 600, 0, 600)]; }
pad.addEventListener('pointerdown', e => {
  e.preventDefault(); if (!$('penPanel').classList.contains('hidden')) { $('penPanel').classList.add('hidden'); return; }
  pad.setPointerCapture && pad.setPointerCapture(e.pointerId);
  const k = Full.has() ? penKind : '';
  cur = { c: k && k !== 'glitter' ? Creature.PEN_COLOR[k] : penColor, w: Full.has() || penWidth === 14 || penWidth === 7 ? penWidth : 14, p: [padXY(e)] };
  if (k) cur.k = k;
  strokes.push(cur); renderPad();
});
pad.addEventListener('pointermove', e => {
  if (!cur) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ce of (evs.length ? evs : [e])) { const q = padXY(ce), l = cur.p[cur.p.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) >= 3) cur.p.push(q); }
  renderPad();
});
const endStroke = () => { if (!cur) return; if (cur.p.length > 300) cur.p = cur.p.filter((_, i) => i % 2 === 0 || i === cur.p.length - 1); cur.p = cur.p.map(q => [Math.round(q[0]), Math.round(q[1])]); cur = null; updateLiveType(); };
pad.addEventListener('pointerup', endStroke); pad.addEventListener('pointercancel', endStroke); pad.addEventListener('pointerleave', endStroke);
function buildColorButtons() {
  const box = $('colors');
  COLORS.forEach((c, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sw' + (i ? '' : ' on'); b.style.background = c; b.setAttribute('aria-label', '色 ' + (i + 1));
    b.onclick = () => { penColor = c; if (penKind && penKind !== 'glitter') penKind = ''; box.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === b)); updatePenBtn(); };
    box.appendChild(b);
  });
}
// 完全版のペン(金・銀・虹・ラメ・ピンク・水色・レモン)と太さ(極細・極太)。見た目だけ
let penKind = '';
const PEN_LIST = [['gold', '金'], ['silver', '銀'], ['rainbow', '虹'], ['glitter', 'ラメ'], ['pink', 'ピンク'], ['sky', '水色'], ['lemon', 'レモン']];
const WIDTH_NAMES = { 4: '極細', 7: '細い線', 14: '太い線', 22: '極太' };
function updatePenBtn() {
  const pb = $('penBtn'); if (!pb) return;
  const k = Full.has() ? penKind : '';
  pb.textContent = k ? (PEN_LIST.find(x => x[0] === k) || ['', 'ペン'])[1] + 'のペン' : 'とくべつなペン';
  pb.classList.toggle('on', !!k);
  $('widthBtn').textContent = WIDTH_NAMES[penWidth] || '太い線';
  const panel = $('penPanel');
  if (panel) panel.querySelectorAll('[data-pen]').forEach(b => b.classList.toggle('on', b.dataset.pen === k));
  if (panel) panel.querySelectorAll('[data-w]').forEach(b => b.classList.toggle('on', +b.dataset.w === penWidth));
}
function buildPenPanel() {
  const panel = $('penPanel'); if (!panel) return;
  const full = Full.has();
  panel.innerHTML = `<p class="pp">とくべつなペン${full ? '' : '<small>完全版</small>'}</p>`;
  const grid = document.createElement('div'); grid.className = 'penGrid';
  const item = (key, label, img, onPick) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'penIt' + (full || !key ? '' : ' lock');
    if (img) { const im = document.createElement('img'); im.alt = ''; im.src = img; im.onerror = () => im.remove(); b.appendChild(im); }
    else { const dot = document.createElement('i'); dot.className = 'penDot'; dot.style.background = key ? Creature.PEN_COLOR[key] : penColor; b.appendChild(dot); }
    const s = document.createElement('span'); s.textContent = label; b.appendChild(s);
    b.onclick = () => { if (!Full.has() && key) { $('penPanel').classList.add('hidden'); Full.open('pens'); return; } onPick(); updatePenBtn(); };
    grid.appendChild(b); return b;
  };
  item('', 'ふつう', '', () => { penKind = ''; }).dataset.pen = '';
  const ICON = { gold: 1, silver: 1, rainbow: 1, glitter: 1 };
  for (const [k, label] of PEN_LIST) item(k, label, ICON[k] ? `assets/pen_${k}.png` : '', () => { penKind = k; }).dataset.pen = k;
  panel.appendChild(grid);
  const wl = document.createElement('p'); wl.className = 'pp'; wl.textContent = '線の太さ'; panel.appendChild(wl);
  const wg = document.createElement('div'); wg.className = 'penGrid w';
  for (const w of [4, 7, 14, 22]) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.w = w; b.className = 'penIt wd' + (full || w === 7 || w === 14 ? '' : ' lock');
    b.innerHTML = (w === 4 || w === 22 ? `<img alt="" src="assets/pen_${w === 4 ? 'thin' : 'thick'}.png" onerror="this.remove()">` : '') + `<i style="height:${Math.max(3, w * 0.6)}px"></i><span>${WIDTH_NAMES[w]}</span>`;
    b.onclick = () => { if (!Full.has() && (w === 4 || w === 22)) { $('penPanel').classList.add('hidden'); Full.open('pens'); return; } penWidth = w; updatePenBtn(); };
    wg.appendChild(b);
  }
  panel.appendChild(wg);
  const note = document.createElement('p'); note.className = 'pn'; note.textContent = full ? '見た目だけ変わります。走る速さは変わりません' : '完全版で使えます。見た目だけで、走る速さは変わりません'; panel.appendChild(note);
  const close = document.createElement('button'); close.type = 'button'; close.className = 'sub'; close.textContent = 'とじる'; close.onclick = () => panel.classList.add('hidden'); panel.appendChild(close);
  updatePenBtn();
}
$('penBtn').onclick = () => { buildPenPanel(); $('penPanel').classList.toggle('hidden'); };
$('widthBtn').onclick = () => { penWidth = penWidth === 14 ? 7 : 14; updatePenBtn(); };
$('undoBtn').onclick = () => { strokes.pop(); renderPad(); updateLiveType(); };
$('clearBtn').onclick = () => { strokes = []; renderPad(); updateLiveType(); };

// ---------- 進行 ----------
// G: いまの遊び。mode = solo | link | room | gallery | view
const G = { mode: 'solo', me: null, meInfo: null, course: 'track', seed: 0, challenge: null, room: null, opponent: null, lastResult: null };
const NG = /(死ね|しね|殺す|ころす|ちんこ|ちんぽ|まんこ|セックス|せっくす|うんこ|きちがい|キチガイ|fuck|shit|nigger|sex)/i;
function cleanName(s) { s = String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 10); return NG.test(s) ? '' : s; }

function startDraw(mode, opts) {
  G.mode = mode; opts = opts || {};
  playing = false; scene = null; if (!titleScene) titleScene = makeTitleScene();
  strokes = []; renderPad(); updateLiveType();
  $('penPanel').classList.add('hidden'); updatePenBtn();
  $('nameInput').value = opts.keepName ? $('nameInput').value : '';
  $('drawTitle').textContent = opts.title || '生き物を1匹描いてね';
  const rs = $('rivalStrip'); rs.innerHTML = '';
  if (opts.rivals && opts.rivals.length) {
    rs.classList.remove('hidden');
    for (const cr of opts.rivals) { const d = document.createElement('div'); d.className = 'rv'; const c = document.createElement('canvas'); c.width = 80; c.height = 80; drawThumb(c, cr); d.appendChild(c); d.appendChild(document.createTextNode(cr.name || '名なし')); rs.appendChild(d); }
  } else rs.classList.add('hidden');
  $('drawTimer').classList.toggle('hidden', !opts.timer);
  show('drawScreen');
  bgm('bgm_title');
}
function myCreature() {
  const name = cleanName($('nameInput').value) || '名なしのらくがき';
  // URL に詰めた形に一度通す(対戦相手の端末と同じ線でレースするため)
  const cr = Creature.roundTrip(Creature.make(strokes, name, Full.has() ? Full.fx() : ''), CFG.PER_BYTES);
  cr.created = new Date().toISOString().slice(0, 10);
  return cr;
}
$('drawDoneBtn').onclick = () => {
  if (!strokes.length) return;
  const cr = myCreature();
  const info = analyze(cr.strokes);
  if (!info) { toast('もう少し描いてね'); return; }
  G.me = cr; G.meInfo = info;
  Store.saveMine(cr);
  if (G.mode === 'room') { Room.submit(cr); return; }
  if (G.mode === 'link' && G.challenge) { joinChallenge(cr); return; }
  openPrep();
};
$('drawBackBtn').onclick = () => { if (G.mode === 'room') Room.leave(); goTitle(); };

// 準備運動とコース選び(能力・型・得意不得意は見せない。見せるのはこの子の自己ベストだけ)
let prepAnim = null;
function openPrep() {
  const pet = Rec.pet(G.me);
  if (!Full.has()) delete G.me.fx;
  buildFxRow();
  $('prepName').textContent = G.me.name || '名なし';
  $('prepRec').innerHTML = pet && pet.n ? `これまで <b>${pet.n}</b> 戦 <b>${pet.wins}</b> 勝` : 'はじめてのレース';
  const box = $('courses'); box.innerHTML = '';
  for (const id of RU.COURSE_IDS) {
    const c = COURSES[id], b = document.createElement('button'); b.type = 'button'; b.className = 'course' + (id === G.course ? ' on' : '');
    const best = pet && pet.best && pet.best[id];
    b.innerHTML = `<span class="cn">${c.name}</span><span class="cs">${c.sub}</span><span class="pb">${best ? '自己ベスト ' + best.t.toFixed(2) + '秒・' + best.r + '位' : 'まだ走っていない'}</span>`;
    const cv = document.createElement("canvas"); cv.width = 360; cv.height = 120; drawCourseIcon(cv, id); b.appendChild(cv);
    b.onclick = () => { G.course = id; box.querySelectorAll('.course').forEach(x => x.classList.toggle('on', x === b)); Persist.save(); };
    box.appendChild(b);
  }
  const link = G.mode === 'link';
  $('courseTitle').textContent = link ? '挑戦状のコースをえらぶ' : 'コースをえらぶ';
  $('prepGoBtn').textContent = link ? 'このコースで挑戦状をつくる' : 'このコースに決定!';
  show('prepScreen');
  if (G.mode === 'solo') prefetchGalleryPool();
  const d = new Doodle(G.me, G.meInfo, 210);
  const cv = $('prepCanvas'), ctx = cv.getContext('2d');
  cancelAnimationFrame(prepAnim);
  const t0 = performance.now();
  const tick = () => {
    const t = (performance.now() - t0) / 1000;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#ea8359'; ctx.fillRect(0, 262, cv.width, 38);
    d.draw(ctx, 180, 268, 1, { t, phase: t * 1.2, state: 'run', idle: t < 1.2, wiggle: t < 1.2, x: t * 60 });
    if (!$('prepScreen').classList.contains('hidden')) prepAnim = requestAnimationFrame(tick);
  };
  tick();
  se('prep', 0.4);
}
// キラキラ(完全版)をえらぶ。準備運動の絵ですぐ見られる。見た目だけ
const FX_LIST = [['', 'なし'], ['kira', '光の粒'], ['aura', 'オーラ'], ['star', '流れ星'], ['petal', '花びら']];
function buildFxRow() {
  const box = $('fxRow'); if (!box) return;
  const full = Full.has(), curFx = (G.me && G.me.fx) || '';
  box.innerHTML = `<p class="fxT">キラキラ${full ? '' : '<small>完全版</small>'}</p>`;
  const row = document.createElement('div'); row.className = 'fxBtns';
  for (const [id, label] of FX_LIST) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.fx = id;
    b.className = 'fxIt' + (id === curFx ? ' on' : '') + (!full && id ? ' lock' : '');
    if (id) { const im = document.createElement('img'); im.alt = ''; im.src = `assets/fx_${id}.png`; im.onerror = () => im.remove(); b.appendChild(im); }
    const s = document.createElement('span'); s.textContent = label; b.appendChild(s);
    b.onclick = () => {
      if (id && !Full.has()) { Full.open('kira'); return; }
      if (!G.me) return;
      if (id) G.me.fx = id; else delete G.me.fx;
      Full.setFx(id);
      row.querySelectorAll('.fxIt').forEach(x => x.classList.toggle('on', x === b));
      if (id) se('select', 0.4);
      Persist.save();
    };
    row.appendChild(b);
  }
  box.appendChild(row);
}
function drawCourseIcon(cv, id) {
  const im = IMG['course_' + id], ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  if (im) { const k = Math.max(W / im.naturalWidth, H / im.naturalHeight); ctx.drawImage(im, (W - im.naturalWidth * k) / 2, (H - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k); return; }
  ctx.fillStyle = '#b9e9ff'; ctx.fillRect(0, 0, W, H);
  const c = COURSES[id];
  ctx.fillStyle = '#ea8359'; ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 6) ctx.lineTo(x, H - 18 - groundH(c, x / W * FINISH) * 0.16);
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#19263d'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#35b8e8'; for (const w of c.water) { ctx.beginPath(); ctx.ellipse((w[0] + w[1]) / 2 / FINISH * W, H - 9, (w[1] - w[0]) / 2 / FINISH * W, 6, 0, 0, 7); ctx.fill(); }
  ctx.strokeStyle = '#19263d'; for (const hx of c.hurdles) { const x = hx / FINISH * W; ctx.beginPath(); ctx.moveTo(x - 4, H - 18); ctx.lineTo(x - 4, H - 30); ctx.lineTo(x + 4, H - 30); ctx.lineTo(x + 4, H - 18); ctx.stroke(); }
  if (c.beam) { ctx.fillStyle = '#5b8bd6'; ctx.fillRect(c.beam[0] / FINISH * W, H - 28, (c.beam[1] - c.beam[0]) / FINISH * W, 5); }
  if (c.net) { ctx.strokeStyle = 'rgba(25,38,61,.6)'; for (let x = c.net[0] / FINISH * W; x < c.net[1] / FINISH * W; x += 4) { ctx.beginPath(); ctx.moveTo(x, H - 30); ctx.lineTo(x + 4, H - 18); ctx.stroke(); } }
}
$('prepBackBtn').onclick = () => { cancelAnimationFrame(prepAnim); startDraw(G.mode, { keepName: true }); };
$('prepGoBtn').onclick = () => {
  cancelAnimationFrame(prepAnim);
  if (G.mode === 'link') { makeChallenge(); return; }
  if (G.mode === 'gallery' && G.opponent) { runVs([G.opponent, G.me], G.course, newSeed(), 1, 'gallery'); return; }
  soloRace();
};

// ひとりで: 毎回ちがう相手5匹(みんなのらくがきから取れていれば、そのうち最大3匹は本物の絵)
G.cpuRecent = { kinds: [], names: [] };
G.galPool = [];
// みんなの絵は Firestore から読まない(pool.json と、みんなのらくがきを開いた時に端末に覚えた1ページ目)。ログインもしない。
let galPoolAt = 0;
async function prefetchGalleryPool() {
  if (Date.now() - galPoolAt < 5 * 60 * 1000) return;
  galPoolAt = Date.now();
  try {
    const m = await Store.mod();
    const items = await m.poolCreatures();
    G.galPool = (items || []).map(it => it.creature).filter(c => c && c.strokes && c.strokes.length);
  } catch (e) { Store.busy(e); }
}
function soloRace() {
  const seed = newSeed();
  const pool = G.galPool.filter(c => !(G.me && c.name === G.me.name && JSON.stringify(c.strokes).length === JSON.stringify(G.me.strokes).length));
  const nGal = Math.min(pool.length, 1 + Math.floor(Math.random() * 3));
  const gal = [];
  while (gal.length < nGal) { const c = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; gal.push(Object.assign({}, c, { cpu: 'gal' })); }
  const gen = RU.randomCpus(seed, 5 - gal.length, G.cpuRecent);
  const cpus = gal.concat(gen).sort(() => Math.random() - 0.5);
  G.cpuRecent = { kinds: gen.map(c => c.cpu), names: cpus.map(c => c.name) };
  const ents = cpus.slice(0, 3).concat([G.me], cpus.slice(3));
  startRace(ents.map((cr, i) => ({ cr, isMe: i === 3, cpu: !!cr.cpu })), G.course, seed, 'solo');
}
// 対戦(挑戦状・部屋・みんなのらくがき): 人が足りなければ CPU で 3体にする(種から決まるので、同じ挑戦状は同じ相手)
function fillCpu(creatures, seed) {
  const out = creatures.slice();
  if (out.length < CFG.VS_SIZE) out.push(...RU.randomCpus(seed, CFG.VS_SIZE - out.length));
  return out;
}
function runVs(creatures, course, seed, meIndex, mode) {
  const all = fillCpu(creatures, seed);
  startRace(all.map((cr, i) => ({ cr, isMe: i === meIndex, cpu: !!cr.cpu })), course, seed, mode);
}

// ---------- レース ----------
let scene = null, raceClock = 0, manual = false, lastTs = 0, playing = false;
const TA_SEED = { track: 16001, obstacle: 16002, slope: 16003, water: 16004 }; // タイムアタックは決まった種(だれが走らせても同じ)
function buildScene(ents, course, seed, mode, cheers) {
  const infos = ents.map(e => analyze(e.cr.strokes));
  const lanes = laneLayout(ents.length);
  const sc = {
    mode, course, seed, lanes, cheers: (cheers || []).slice(), infos,
    ents: ents.map((e, i) => ({ cr: e.cr, info: infos[i], doodle: new Doodle(e.cr, infos[i], CFG.SIZE), name: e.cr.name || '名なし', isMe: !!e.isMe, cpu: !!e.cpu })),
    meIndex: ents.findIndex(e => e.isMe),
    evIdx: 0, ticker: [], tickT: -9, said: {}, lastLine: '',
    pops: [], fx: [], shake: 0, prevRank: 0, rankHold: 0, cheerTaps: 0, lastCheerT: -9,
  };
  sc.race = runSim(sc);
  decorate(sc);
  return sc;
}
function runSim(sc) { return simulate(sc.infos.map(info => ({ info })), sc.course, sc.seed, { cheers: sc.cheers, solo: sc.mode === 'ta' }); }
// 写真判定・スロー・紙ふぶき(レースの結果から決める)
function decorate(sc) {
  const race = sc.race;
  sc.photoT = null; sc.slow = null;
  for (const [a, b] of race.photo) if (a === sc.meIndex || b === sc.meIndex || sc.mode !== 'solo') { sc.photoT = race.times[b]; break; }
  // 接戦のゴール(0.35秒差以内。1・2着か、自分がからむ所)はスローで見せる
  const ord = race.order;
  for (let k = 1; k < ord.length; k++) {
    const a = ord[k - 1], b = ord[k], gap = race.times[b] - race.times[a];
    if (gap < 0.35 && (k === 1 || a === sc.meIndex || b === sc.meIndex)) {
      const tf = race.times[b];
      if (!sc.slow || a === sc.meIndex || b === sc.meIndex) sc.slow = { a: race.times[a] - 1.1, b: tf + 0.25, tf, pair: [a, b], photo: gap < 0.12 };
      if (a === sc.meIndex || b === sc.meIndex) break;
    }
  }
  if (sc.mode === 'ta' || sc.mode === 'title') sc.slow = null;
  const w = ord[0]; sc.confetti = [];
  const r2 = mulberry32(sc.seed ^ 77);
  for (let i = 0; i < 70; i++) sc.confetti.push({ x: FINISH + (r2() - 0.5) * 300, y: 420 + r2() * 60, vx: (r2() - 0.5) * 420, vy: -r2() * 420 - 120, r: r2() * 6, c: ['#e2483d', '#ffd54f', '#35b8e8', '#65c982', '#ffffff'][Math.floor(r2() * 5)], t0: race.times[w] });
}
function startRace(ents, course, seed, mode, cheers) {
  scene = buildScene(ents, course, seed, mode, cheers);
  G.course = course; G.seed = seed;
  G.lastRace = { ents: ents.map(e => ({ cr: e.cr, isMe: !!e.isMe, cpu: !!e.cpu })), course, seed, mode };
  raceClock = -CFG.COUNTDOWN - 0.4;
  playing = true; scene.ended = false;
  show(null); $('hud').classList.remove('hidden');
  $('ticker').textContent = '';
  buildProg();
  const cheerOk = mode === 'solo' && scene.meIndex >= 0;
  $('cheerBtn').classList.toggle('hidden', !cheerOk);
  updateCheerBtn();
  $('skipBtn').textContent = 'スキップ';
  bgm('');
  scene.beeps = 0;
}
function buildProg() {
  const p = $('prog'); p.innerHTML = '<span class="goal">ゴール</span>';
  scene.dots = scene.ents.map((e, i) => { const d = document.createElement('div'); d.className = 'dot' + (e.isMe ? ' me' : ''); d.style.background = e.isMe ? '#ffd54f' : (e.cr.strokes[0] && e.cr.strokes[0].c) || '#fff'; p.appendChild(d); return d; });
  // 順位の札(小さな絵が入れ替わる)
  const o = $('order'); o.innerHTML = '';
  scene.chips = scene.ents.map((e, i) => {
    const d = document.createElement('div'); d.className = 'chip' + (e.isMe ? ' me' : '');
    const c = document.createElement('canvas'); c.width = 56; c.height = 44; drawThumb(c, e.cr); d.appendChild(c);
    const n = document.createElement('b'); d.appendChild(n); o.appendChild(d); return d;
  });
  $('order').classList.toggle('hidden', scene.ents.length < 2);
}
function stepRace(dt) {
  if (!scene || !playing) return;
  const sc = scene;
  if (sc.freeze > 0) { sc.freeze -= dt; return; }
  const before = raceClock;
  raceClock += dt;
  const t = raceClock;
  const tc = t + CFG.COUNTDOWN;
  if (before + CFG.COUNTDOWN < 0.9 && tc >= 0.9) se('whistle', 0.45);
  if (before + CFG.COUNTDOWN < CFG.COUNTDOWN - 0.05 && tc >= CFG.COUNTDOWN - 0.05 && false) se('select', 0.5);
  if (before < 0 && t >= 0) { se('pistol', 0.6); se('cheer', 0.25); bgm('bgm_race'); say(sc.mode === 'ta' ? 'タイムアタック、スタート!' : sc.mode === 'solo' ? 'よーい、ドン!' : '3人対戦、スタート!', 9); }
  const evs = sc.race.events;
  while (sc.evIdx < evs.length && evs[sc.evIdx].t <= t) { onRaceEvent(evs[sc.evIdx], t); sc.evIdx++; }
  const me = sc.meIndex >= 0 ? racerAt(sc, sc.meIndex, t) : null;
  if (me && me.x > FINISH - 520 && !sc.said.last) { sc.said.last = 1; say(pickLine('last', sc.ents[sc.meIndex].name, Math.floor(sc.seed % 2)), 3); }
  if (me && me.x > FINISH - 600 && !sc.said.final && sc.mode !== 'ta') { sc.said.final = 1; pop('ラスト20m!', '', '#ffffff', 1.1, 0.8); se('last', 0.5); }
  sc.shake = Math.max(0, sc.shake - dt * 2.5);
  // 写真判定: 2匹目がゴールした瞬間に止めて光らせる
  if (sc.slow && sc.slow.photo && !sc.said.photo && t >= sc.slow.tf) { sc.said.photo = 1; sc.freeze = 1.0; sc.flashT = performance.now(); se('shutter', 0.8); }
  const endT = sc.meIndex >= 0 ? sc.race.times[sc.meIndex] : sc.race.times[sc.race.order[0]];
  const tail = sc.slow ? Math.max(endT, sc.slow.b) : endT;
  if (!sc.ended && t > tail + 2.2) { sc.ended = true; finishRace(); }
  updateHud(t);
}
function rankAt(sc, t) {
  const xs = sc.ents.map((e, i) => racerAt(sc, i, t).x), myX = xs[sc.meIndex];
  return 1 + xs.filter((x, i) => i !== sc.meIndex && (x > myX || (sc.race.times[i] != null && t >= sc.race.times[i]))).length;
}
// 時間の流れ(接戦のゴールはゆっくり)
function timeScale(sc, t) {
  if (!sc || !sc.slow || manual && !sc.slowInManual) return 1;
  const w = sc.slow;
  if (t < w.a - 0.4 || t > w.b + 0.3) return 1;
  if (t < w.a) return 1 - 0.7 * (t - w.a + 0.4) / 0.4;
  if (t > w.b) return 0.3 + 0.7 * (t - w.b) / 0.3;
  return 0.3;
}
// 画面の真ん中に大きく出す字(優勝! など)
function pop(text, sub, color, size, dur, delayMs) { if (!scene) return; scene.pops.push({ text, sub, color, size: size || 1, dur: dur || 1, t0: performance.now() + (delayMs || 0) }); }
function say(text, pri) {
  if (!text) return;
  const now = raceClock;
  if (now - scene.tickT < 1.3 && (pri || 0) < (scene.tickPri || 0)) return;
  scene.tickT = now; scene.tickPri = pri || 0; scene.lastLine = text;
  const el = $('ticker'); el.textContent = text; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
function onRaceEvent(e, t) {
  const sc = scene;
  if (e.type === 'start') return;
  if (e.type === 'gust') { se('gust', 0.5); say(pickLine('gust', '', Math.floor(t)), (e.lanes || []).includes(sc.meIndex) ? 6 : 3); sc.gustOn = { t0: e.t, lanes: e.lanes || [] }; return; }
  const ent = sc.ents[e.who]; if (!ent) return;
  const mine = e.who === sc.meIndex;
  const pri = mine ? 5 : 1;
  const k = (sc.said[e.type] = (sc.said[e.type] || 0) + 1);
  const near = sc.meIndex < 0 || Math.abs(racerAt(sc, e.who, t).x - racerAt(sc, sc.meIndex, t).x) < 900;
  switch (e.type) {
    case 'trip': se('trip', mine ? 0.6 : 0.2); if (mine) sc.shake = 1; if (mine || near) say(pickLine('trip', ent.name, k), pri); break;
    case 'burst': if (mine) se('spurt', 0.45); if (mine || near) say(pickLine('burst', ent.name, k), pri); break;
    case 'stall': if (mine || near) say(pickLine('stall', ent.name, k), pri); break;
    case 'flyover': se('jump', mine ? 0.5 : 0.2); if (mine || near) say(pickLine('flyover', ent.name, k), pri); break;
    case 'bonk': se('bonk', mine ? 0.6 : 0.25); if (mine) sc.shake = 0.7; if (mine || near) say(pickLine('bonk', ent.name, k), pri); break;
    case 'knock': se('knock', mine ? 0.55 : 0.2); if (mine || near) say(pickLine('knock', ent.name, k), pri); break;
    case 'climb': if (mine) say(pickLine('climb', ent.name, k), pri); break;
    case 'fall': se('trip', mine ? 0.6 : 0.2); if (mine) sc.shake = 1.2; if (mine || near) say(pickLine('fall', ent.name, k), pri + 1); break;
    case 'splash': if (e.k === 1) { se('splash', mine ? 0.5 : 0.2); if (mine) say(pickLine('splash', ent.name, k), pri); } break;
    case 'item': se('item', mine ? 0.6 : 0.2); if (mine) { pop('おにぎり!', 'ダッシュ!', '#ffffff', 0.9, 0.7); say(pickLine('item', ent.name, k), pri); } break;
    case 'spurt': if (mine) { se('spurt', 0.5); say(pickLine('spurt', ent.name, k), pri + 1); } else if (near && sc.race.rank[e.who] <= 2) say(pickLine('spurt', ent.name, k), 2); break;
    case 'recover': if (mine) say(pickLine('recover', ent.name, k), pri); break;
    case 'cheer': if (mine) { se('kiai', 0.5); pop('気合い注入!', '', '#ff8fb1', 1.1, 0.9); say(pickLine('cheer', ent.name, k), 7); } break;
    case 'lead': if (t > 2) say(pickLine('lead', ent.name, k), mine ? 6 : 2); break;
    case 'finish': {
      const rank = sc.race.rank[e.who];
      if (rank === 1) { se('firework', 0.6); se('cheer', 0.4); if (sc.mode !== 'ta') say(`${ent.name}、1着でゴール!`, 8); burstFireworks(mine ? 7 : 3); }
      if (mine) {
        se(rank <= 3 || sc.mode === 'ta' ? 'fanfare' : 'chan', 0.55); bgm('');
        if (sc.mode === 'ta') { pop('ゴール!', sc.race.times[e.who].toFixed(2) + '秒', '#ffd54f', 1.4, 2.2); say(`${ent.name}、${sc.race.times[e.who].toFixed(2)}秒でゴール!`, 9); }
        else {
          say(`${ent.name}、${rank}位でゴール!`, 9);
          // 写真判定がある時は、判定のあとに出す
          const wait = sc.slow && sc.slow.photo && sc.slow.pair.includes(e.who) && !sc.said.photo ? 2300 : 0;
          if (rank === 1) pop('優勝!', 'この絵が優勝でいいのか', '#ffd54f', 1.6, 2.4, wait); else if (rank <= 3) pop(`${rank}位!`, '表彰台!', '#ffffff', 1.3, 1.8, wait); else pop(`${rank}位`, '', '#ffffff', 1.0, 1.2, wait);
        }
      }
      break;
    }
  }
}
// 花火(画面の上に。見た目だけ)
function burstFireworks(n) {
  if (!scene) return;
  const now = performance.now();
  for (let k = 0; k < n; k++) {
    const cx = 0.15 + Math.random() * 0.7, cy = 0.12 + Math.random() * 0.25, col = ['#ffd54f', '#e2483d', '#35b8e8', '#65c982', '#ff8fb1', '#ffffff'][k % 6];
    const t0 = now + k * 260;
    for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, sp = 0.18 + Math.random() * 0.12; scene.fx.push({ kind: 'spark', cx, cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, c: col, t0, life: 1.3 }); }
  }
}
function updateHud(t) {
  const sc = scene; if (!sc || !sc.dots) return;
  const xs = sc.ents.map((e, i) => racerAt(sc, i, t).x);
  sc.dots.forEach((d, i) => { d.style.left = (3 + clamp(xs[i] / FINISH, 0, 1) * 88) + '%'; });
  // 順位の札: 今の並び(ゴールした子はゴール順)
  const fin = i => sc.race.times[i] != null && t >= sc.race.times[i];
  const ord = sc.ents.map((e, i) => i).sort((a, b) => (fin(a) && fin(b)) ? sc.race.times[a] - sc.race.times[b] : fin(a) ? -1 : fin(b) ? 1 : xs[b] - xs[a]);
  // 並びが 0.4 秒続いた時だけ札を入れ替える(横並びで毎フレーム入れ替わり、札が重なって見えるのを防ぐ)
  const key = ord.join(',');
  if (!sc.chipOrd) sc.chipOrd = ord;
  if (key !== sc.chipOrd.join(',')) {
    if (sc.pendKey !== key) { sc.pendKey = key; sc.pendT = t; }
    else if (t - sc.pendT >= 0.4 || t < 0) sc.chipOrd = ord;
  } else sc.pendKey = '';
  const cw = sc.chips && sc.chips[0] ? sc.chips[0].offsetWidth + 4 : 52;
  sc.chipOrd.forEach((i, k) => {
    const c = sc.chips[i], tx = `translateX(${k * cw}px)`;
    // すべらせずに入れ替える(途中で札が重ならない)。動いた札だけ少しふわっと出す
    if (c.style.transform !== tx) { const moved = !!c.style.transform; c.style.transform = tx; if (moved) { c.classList.remove('swap'); void c.offsetWidth; c.classList.add('swap'); } }
    c.lastChild.textContent = (k + 1); c.classList.toggle('gold', k === 0);
  });
  if (sc.meIndex >= 0) {
    const myX = xs[sc.meIndex];
    if (sc.mode === 'ta') { $('rankNow').textContent = Math.max(0, t).toFixed(1) + '秒'; }
    else {
      const rank = fin(sc.meIndex) ? sc.race.rank[sc.meIndex] : sc.chipOrd ? sc.chipOrd.indexOf(sc.meIndex) + 1 : rankAt(sc, t); // 札と同じ並びから
      $('rankNow').innerHTML = `<small>いま</small>${rank}位`;
    }
    const left = Math.max(0, Math.ceil((FINISH - myX) / 30));
    $('leftM').textContent = fin(sc.meIndex) ? 'ゴール!' : t <= 0 ? '100m' : `のこり ${left}m`;
    if (sc.meIndex >= 0 && sc.ents.length > 1 && !fin(sc.meIndex)) {
      // 前の子との差
      const ahead = xs.filter((x, i) => i !== sc.meIndex && x > myX && !fin(i)).sort((a, b) => a - b)[0];
      if (ahead != null && t > 0) $('leftM').textContent += `  前まで ${Math.max(1, Math.round((ahead - myX) / 30))}m`;
    }
  } else { $('rankNow').textContent = '観戦'; $('leftM').textContent = ''; }
  updateCheerBtn();
}
// 応援: 8回押すと気合いが1回入る(1レース3回まで・4秒あけて)。ひとりで走る時だけ。押した時刻を種と一緒に計算に入れるので、同じ応援なら同じ結果
const CHEER_TAPS = 8, CHEER_MAX = 3;
function updateCheerBtn() {
  if (!scene) return;
  const used = scene.cheers.length, left = CHEER_MAX - used;
  $('cheerFill').style.width = (left > 0 ? Math.min(1, scene.cheerTaps / CHEER_TAPS) * 100 : 100) + '%';
  $('cheerLeft').textContent = left > 0 ? `あと${left}回` : 'おしまい';
  $('cheerBtn').disabled = left <= 0 || scene.ended;
}
$('cheerBtn').addEventListener('pointerdown', e => {
  e.preventDefault();
  const sc = scene; if (!sc || sc.mode !== 'solo' || sc.meIndex < 0 || sc.ended) return;
  const t = raceClock, myT = sc.race.times[sc.meIndex];
  if (t < 0.3 || (myT != null && t >= myT - 0.3) || sc.cheers.length >= CHEER_MAX) return;
  sc.cheerTaps++;
  sc.fx.push({ kind: 'heart', t0: performance.now(), life: 0.9, x: Math.random() });
  se('tap', 0.3);
  if (sc.cheerTaps >= CHEER_TAPS && t - sc.lastCheerT > 4) {
    sc.cheerTaps = 0; sc.lastCheerT = t;
    sc.cheers.push({ s: Math.ceil(t * 60) + 1, who: sc.meIndex });
    const oldIdx = sc.evIdx;
    sc.race = runSim(sc); decorate(sc);
    // ここまでの出来事は同じなので、続きから読む
    let i = 0; const evs = sc.race.events; while (i < evs.length && evs[i].t <= t) i++; sc.evIdx = Math.max(i, Math.min(oldIdx, i));
    Persist.save();
  }
  updateCheerBtn();
});
$('skipBtn').onclick = () => { if (scene && playing && !scene.ended) { const evs = scene.race.events; scene.evIdx = evs.length; scene.slow = null; scene.freeze = 0; raceClock = Math.max(raceClock, (scene.meIndex >= 0 ? scene.race.times[scene.meIndex] : scene.race.times[scene.race.order[0]]) + 0.3); bgm(''); } };

// ---------- 結果 ----------
const TITLES = ['この絵が優勝でいいのか', 'あと一歩で伝説だった', 'なんか惜しい生き物', '走り方に問題あり', '参加したことに意味がある', 'まず生物として頑張ろう'];
// 珍プレー賞: レースで起きた出来事だけから決める(形や能力のことは言わない)
function awardFor(sc, i) {
  const s = sc.race.stats[i], rank = sc.race.rank[i], n = sc.ents.length;
  if (sc.photoT != null && sc.race.photo.some(p => p.includes(i))) return '写真判定で賞';
  if (sc.mode !== 'ta' && rank === 1 && s.trips + s.falls + s.bonks >= 1) return '転んでも勝ったで賞';
  if (s.falls) return '平均台にきらわれたで賞';
  if (s.trips >= 2) return 'よく転んだで賞';
  if (s.bonks >= 1) return 'ハードルとけんかしたで賞';
  if (s.knocked >= 2) return 'ハードルなぎ倒しで賞';
  if (s.items >= 2) return 'おにぎり食べすぎで賞';
  if (sc.cheers && sc.cheers.length >= 3 && i === sc.meIndex) return '応援パワーで賞';
  if (rank === n && n > 1) return '最後まであきらめなかったで賞';
  if (s.bursts) return 'なぜか急に速くなったで賞';
  if (s.flyovers) return 'ふわっと越えたで賞';
  if (s.drafts > 300) return 'ずっと背中を追いかけたで賞';
  if (s.splashes >= 3) return 'びしょぬれで賞';
  return 'ぶじに走りきったで賞';
}
function resultInfoFor(sc) {
  const i = sc.meIndex >= 0 ? sc.meIndex : sc.race.order[0];
  const rank = sc.race.rank[i], n = sc.ents.length;
  const title = sc.mode === 'ta' ? 'タイムアタック' : n === 6 ? TITLES[rank - 1] : (rank === 1 ? TITLES[0] : rank === n ? TITLES[5] : TITLES[2]);
  return { i, rank, n, title, name: sc.ents[i].name, time: sc.race.times[i], award: awardFor(sc, i), course: COURSES[sc.course].name, mode: sc.mode };
}
let result = null;
async function finishRace(opts) {
  opts = opts || {};
  playing = true;
  const sc = scene, info = resultInfoFor(sc);
  result = { info, scene: sc };
  G.lastResult = result;
  // きろく(自分の子が走った時だけ)
  const badges = opts.restored ? (G.lastBadges || []) : Rec.addRace(sc, info);
  G.lastBadges = badges;
  const card = makeCard(sc, info, badges);
  result.canvas = card;
  const blob = await new Promise(r => card.toBlob(r, 'image/png'));
  result.blob = blob;
  if (result.url) URL.revokeObjectURL(result.url);
  result.url = URL.createObjectURL(blob);
  $('resultImg').src = result.url;
  const vs = sc.mode === 'link' || sc.mode === 'room' || sc.mode === 'view';
  $('vsResultBox').classList.toggle('hidden', !vs);
  result.link = vs && sc.challengeStr ? shareBase() + '#c=' + sc.challengeStr : '';
  $('xBtn').href = intentUrl(result); $('xNote').textContent = '';
  $('videoNote').textContent = '';
  $('videoBtn').disabled = !canRecord();
  if (!canRecord()) $('videoNote').textContent = 'この端末のブラウザでは動画を作れません';
  result.vvideo = null; $('vVideoBox').classList.add('hidden'); $('vVideoNote').textContent = ''; $('vVideoBtn').disabled = false;
  $('vVideoBtn').textContent = Full.has() ? '縦動画をつくる' : '縦動画を保存';
  $('vVideoBtn').classList.toggle('lock', !Full.has());
  const mine = sc.meIndex >= 0;
  $('retryBtn').classList.toggle('hidden', !mine || vs);
  $('retryBtn').textContent = sc.mode === 'ta' ? 'もう一回タイムアタック' : 'もう一回!';
  $('againBtn').classList.toggle('hidden', !mine || sc.mode === 'view');
  $('taBtn').classList.toggle('hidden', !mine);
  $('postBtn').classList.toggle('hidden', !mine);
  $('postBtn').disabled = false; $('postBtn').textContent = 'みんなのらくがきに出す';
  $('nextChallengeBtn').classList.toggle('hidden', !mine);
  renderBadges(badges);
  show('resultScreen');
  $('hud').classList.add('hidden');
  bgm('bgm_title');
  if (mine && !opts.restored && (info.rank <= 3 || sc.mode === 'ta')) se('clap', 0.35);
  if (sc.mode === 'ta' && mine && !opts.restored) submitTA(sc);
}
function renderBadges(badges) {
  const box = $('resBadges'); box.innerHTML = '';
  for (const b of badges) { const d = document.createElement('span'); d.className = 'badge ' + (b.c || ''); d.textContent = b.t; box.appendChild(d); }
  box.classList.toggle('hidden', !badges.length);
}
function shareBase() { const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:'; return (!local && CFG.SHARE_URL) || location.href.split(/[?#]/)[0].replace(/index\.html$/, ''); }
function shareParts(res) {
  const r = res.info, sc = res.scene;
  let text;
  if (sc.mode === 'ta') text = `わたしのらくがき「${r.name}」が${r.course}のタイムアタックで${r.time != null ? r.time.toFixed(2) : '-'}秒!\n${CFG.TAG}`;
  else if (sc.mode === 'solo') text = `わたしのらくがき「${r.name}」が${r.course}で${r.n}匹中${r.rank}位!\n${CFG.TAG} ${r.rank}位`;
  else if (sc.meIndex >= 0) {
    const others = sc.ents.filter((e, i) => i !== sc.meIndex && !e.cpu).map(e => e.name);
    const won = r.rank === 1;
    text = `${others.length ? others.join('・') + ' と' : ''}3人対戦で「${r.name}」が${r.rank}位でした${won ? '。勝った!' : ''}\n${CFG.TAG} ${r.rank}位`;
  } else text = `らくがき3人対戦の結果: 1位は「${sc.ents[sc.race.order[0]].name}」\n${CFG.TAG}`;
  text += `\n作った人 ${CFG.AUTHOR}`;
  return { text, url: res.link || shareBase() };
}
function intentUrl(res) {
  const p = shareParts(res);
  return 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(p.text) + '&url=' + encodeURIComponent(p.url);
}

// 結果の1枚(1080x1350)
function makeCard(sc, r, badges) {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  // 背景: 空・旗・運動場
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#7fd3fb'); g.addColorStop(0.5, '#b9e9ff'); g.addColorStop(1, '#d8f4ff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (IMG.bg_sky) { const im = IMG.bg_sky, k = Math.max(W / im.naturalWidth, H / im.naturalHeight); ctx.drawImage(im, (W - im.naturalWidth * k) / 2, 0, im.naturalWidth * k, im.naturalHeight * k); }
  // 旗
  ctx.strokeStyle = '#19263d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-10, 455); ctx.quadraticCurveTo(W / 2, 530, W + 10, 455); ctx.stroke();
  const cols = ['#e2483d', '#ffd54f', '#35b8e8', '#65c982', '#ffffff', '#f08a24'];
  for (let k = 0; k < 13; k++) { const u = (k + 0.5) / 13, x = u * W, y = 455 + 4 * u * (1 - u) * 38; ctx.fillStyle = cols[k % cols.length]; ctx.beginPath(); ctx.moveTo(x - 22, y); ctx.lineTo(x + 22, y); ctx.lineTo(x, y + 50); ctx.closePath(); ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke(); }
  // 運動場
  ctx.fillStyle = '#65c982'; ctx.fillRect(0, 700, W, 40); ctx.fillStyle = '#ea8359'; ctx.fillRect(0, 735, W, 220);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 6; for (const y of [790, 880]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + 4); ctx.stroke(); }
  ctx.strokeStyle = '#19263d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 735); ctx.lineTo(W, 735); ctx.stroke();
  // 題名
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  const logoTxt = (txt, x, y, fs, fill) => { ctx.font = `900 ${fs}px ${FONT}`; ctx.lineWidth = fs * 0.2; ctx.strokeStyle = '#19263d'; ctx.strokeText(txt, x, y); ctx.fillStyle = fill; ctx.fillText(txt, x, y); };
  if (IMG.logo) { const im = IMG.logo, h = 132, w = h * im.naturalWidth / im.naturalHeight; ctx.drawImage(im, (W - w) / 2, 6, w, h); }
  else { logoTxt('らくがき', W / 2 - 110, 100, 64, '#ffffff'); logoTxt('運', W / 2 + 70, 104, 74, '#e2483d'); logoTxt('動', W / 2 + 150, 108, 74, '#ffd54f'); logoTxt('会', W / 2 + 230, 102, 74, '#35b8e8'); }
  // コースの札
  ctx.font = `bold 30px ${FONT}`; const ctext = sc.mode === 'ta' ? `${r.course}・タイムアタック` : (sc.mode === 'solo' || sc.mode === 'gallery' && sc.ents.length !== 3) ? `${r.course}(${sc.ents.length}匹)` : `${r.course}・${sc.ents.length}人対戦`;
  const cw = ctx.measureText(ctext).width + 40; ctx.fillStyle = '#ffffff'; roundRect(ctx, (W - cw) / 2, 140, cw, 46, 23); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#19263d'; ctx.stroke();
  ctx.fillStyle = '#19263d'; ctx.fillText(ctext, W / 2, 174);
  // 順位
  ctx.save(); ctx.translate(W / 2, 330); ctx.rotate(-0.04);
  if (sc.mode === 'ta') logoTxt(`${r.time != null ? r.time.toFixed(2) : '-'}秒`, 0, 0, 140, '#ffd54f'); else logoTxt(`第${r.rank}位!`, 0, 0, 150, '#ffd54f');
  ctx.restore();
  // 称号はリボンの札に(ui_result の見本に合わせる)
  ctx.font = `900 44px ${FONT}`;
  const tw = Math.min(W - 120, ctx.measureText(r.title).width + 90), tx = (W - tw) / 2, ty = 372;
  ctx.fillStyle = '#e2483d'; ctx.strokeStyle = '#19263d'; ctx.lineWidth = 4;
  for (const sgn of [-1, 1]) { const ex = sgn < 0 ? tx : tx + tw; ctx.beginPath(); ctx.moveTo(ex, ty + 14); ctx.lineTo(ex + sgn * 60, ty + 14); ctx.lineTo(ex + sgn * 40, ty + 44); ctx.lineTo(ex + sgn * 60, ty + 74); ctx.lineTo(ex, ty + 74); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.rect(tx, ty, tw, 70); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#19263d'; ctx.fillText(r.title, W / 2, ty + 50, tw - 30);
  // 自分のらくがき(大きく)
  const e = sc.ents[r.i];
  const probe = new Doodle(e.cr, e.info, 100);
  const big = new Doodle(e.cr, e.info, 100 * Math.min(380 / probe.h, 600 / probe.w));
  big.thick = 2.2;
  big.draw(ctx, W / 2, 800, 1, { t: 0.4, phase: 0.25, state: 'run', idle: true, x: 0 });
  if (r.rank === 1 && sc.mode !== 'ta' && IMG.ribbon) { const im = IMG.ribbon, h = 190, w = h * im.naturalWidth / im.naturalHeight; ctx.drawImage(im, W / 2 + 260 - w / 2, 510, w, h); ctx.fillStyle = '#19263d'; ctx.font = `900 54px ${FONT}`; ctx.textBaseline = 'middle'; ctx.fillText('1', W / 2 + 260, 510 + h * 0.36); ctx.textBaseline = 'alphabetic'; }
  else if (r.rank <= 3 && sc.mode !== 'ta') {
    const mc = ['#ffd54f', '#d6dde6', '#e0a46a'][r.rank - 1];
    ctx.fillStyle = '#e2483d'; ctx.beginPath(); ctx.moveTo(W / 2 + 230, 520); ctx.lineTo(W / 2 + 260, 600); ctx.lineTo(W / 2 + 290, 520); ctx.fill();
    ctx.fillStyle = mc; ctx.strokeStyle = '#19263d'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(W / 2 + 260, 625, 52, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#19263d'; ctx.font = `900 50px ${FONT}`; ctx.textBaseline = 'middle'; ctx.fillText(String(r.rank), W / 2 + 260, 628); ctx.textBaseline = 'alphabetic';
  }
  // 名前・型・タイム
  ctx.font = `900 44px ${FONT}`; ctx.lineWidth = 9; ctx.strokeStyle = '#ffffff';
  let nm = r.name; while (ctx.measureText(nm).width > W - 140 && nm.length > 2) nm = nm.slice(0, -1);
  ctx.strokeText(nm, W / 2, 920); ctx.fillStyle = '#19263d'; ctx.fillText(nm, W / 2, 920);
  // 下の札: 順位表と珍プレー賞
  roundRect(ctx, 40, 960, W - 80, 330, 30); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#19263d'; ctx.stroke();
  ctx.textAlign = 'left'; ctx.font = `bold 30px ${FONT}`; ctx.fillStyle = '#19263d';
  const bt = (badges || []).filter(b => b.c === 'gold' || b.c === 'red').map(b => b.t)[0];
  ctx.fillText(`タイム ${r.time != null ? r.time.toFixed(2) + '秒' : '-'}${bt ? '  ・  ' + bt : ''}`, 80, 1010, W - 160);
  const order = sc.race.order, cols2 = order.length > 3 ? 2 : 1, rows = Math.ceil(order.length / cols2);
  order.forEach((idx, k) => {
    const col = Math.floor(k / rows), row = k % rows;
    const x = 80 + col * 470, y = 1040 + row * (order.length > 3 ? 62 : 70);
    const en = sc.ents[idx];
    if (idx === r.i) { ctx.fillStyle = '#ffd54f'; roundRect(ctx, x - 12, y - 4, 440, 56, 14); ctx.fill(); }
    const rc = ['#ffd54f', '#35b8e8', '#f08a24'][k];
    if (rc) { ctx.fillStyle = rc; roundRect(ctx, x - 6, y + 4, 76, 46, 10); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#19263d'; ctx.stroke(); }
    ctx.fillStyle = '#19263d'; ctx.font = `900 34px ${FONT}`; ctx.fillText(`${k + 1}位`, x, y + 38);
    const tc = document.createElement('canvas'); tc.width = 70; tc.height = 54; drawThumb(tc, en.cr); ctx.drawImage(tc, x + 86, y);
    ctx.font = `bold 28px ${FONT}`; let n2 = en.name; while (ctx.measureText(n2).width > 250 && n2.length > 2) n2 = n2.slice(0, -1);
    ctx.fillText(n2, x + 166, y + 37);
  });
  // 珍プレー賞
  ctx.textAlign = 'center';
  ctx.font = `900 34px ${FONT}`; const aw = `珍プレー賞: ${r.award}`; const aww = ctx.measureText(aw).width + 50;
  ctx.fillStyle = '#e2483d'; roundRect(ctx, (W - aww) / 2, 1236, aww, 54, 27); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.fillText(aw, W / 2, 1275);
  ctx.font = `bold 26px ${FONT}`; ctx.fillStyle = '#19263d'; ctx.fillText(`${CFG.TAG}   yurustudio.github.io/undoukai`, W / 2, 1328);
  return c;
}

// 保存・投稿
function fileBase() { return 'rakugaki-undoukai-' + (result.info.name || 'rakugaki').replace(/[\\/:*?"<>|\s]/g, ''); }
function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
async function shareOrSave(blob, name, type) {
  const touch = matchMedia('(pointer:coarse)').matches;
  try { const file = new File([blob], name, { type }); if (touch && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  downloadBlob(blob, name);
}
// X で見せびらかす: 画像が付けられる端末(スマホ)は共有シートに画像+本文+URL。出来なければ今までどおり投稿画面を開き、画像の保存を案内する
$('xBtn').addEventListener('click', async (ev) => {
  if (!result || !result.blob) return;
  const note = $('xNote'); note.textContent = '';
  const touch = matchMedia('(pointer:coarse)').matches;
  try {
    const file = new File([result.blob], fileBase() + '.png', { type: 'image/png' });
    if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
      ev.preventDefault();
      const p = shareParts(result);
      try { await navigator.share({ files: [file], text: p.text, url: p.url }); } catch (e) { if (!e || e.name !== 'AbortError') window.open(intentUrl(result), '_blank', 'noopener'); }
      return;
    }
  } catch (e) { /* 下の通常の動きへ */ }
  note.textContent = '投稿画面が開いたら、「画像を保存」した絵を添えてください';
});
$('saveBtn').onclick = () => { if (result && result.blob) shareOrSave(result.blob, fileBase() + '.png', 'image/png'); };
$('videoBtn').onclick = async () => {
  if (!result || $('videoBtn').disabled) return;
  $('videoBtn').disabled = true;
  try {
    const v = await makeVideo(result.scene, result.canvas, s => { $('videoNote').textContent = `動画を作っています… あと ${s} 秒`; });
    result.video = v;
    $('videoNote').textContent = v.type.includes('mp4') ? '動画ができました(mp4)' : '動画ができました(webm。X に貼れない時は画像を使ってね)';
    await shareOrSave(v.blob, fileBase() + (v.type.includes('mp4') ? '.mp4' : '.webm'), v.type.split(';')[0]);
  } catch (e) { $('videoNote').textContent = '動画を作れませんでした'; console.error(e); }
  $('videoBtn').disabled = false;
};
// 完全版: 縦動画(作ったら「端末に保存」「X・TikTok などへ」)
$('vVideoBtn').onclick = async () => {
  if (!result) return;
  if (!Full.has()) { Full.open('video'); return; }
  if (!canRecord()) { $('vVideoNote').textContent = 'この端末では動画を作れません'; return; }
  $('vVideoBtn').disabled = true;
  try {
    const v = await makeVideo(result.scene, result.canvas, s => { $('vVideoNote').textContent = `縦動画を作っています… あと ${s} 秒`; }, { vertical: true });
    result.vvideo = v;
    $('vVideoNote').textContent = v.type.includes('mp4') ? '縦動画ができました' : '縦動画ができました(webm。アプリによっては貼れないことがあります)';
    $('vVideoBox').classList.remove('hidden');
  } catch (e) { $('vVideoNote').textContent = '動画を作れませんでした'; console.error(e); }
  $('vVideoBtn').disabled = false;
};
function vFile() { const v = result.vvideo; return [v.blob, fileBase() + '-tate' + (v.type.includes('mp4') ? '.mp4' : '.webm'), v.type.split(';')[0]]; }
$('vSaveBtn').onclick = async () => {
  if (!result || !result.vvideo) return;
  const r = await saveToDevice(...vFile()).catch(() => 'err');
  if (r === 'saved') $('vVideoNote').textContent = '端末の「Documents/RakugakiUndoukai」に保存しました';
};
$('vShareBtn').onclick = async () => {
  if (!result || !result.vvideo) return;
  const [blob, name, type] = vFile();
  try { const file = new File([blob], name, { type }); if (navigator.canShare && navigator.canShare({ files: [file] })) { const p = shareParts(result); await navigator.share({ files: [file], text: p.text, url: p.url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  downloadBlob(blob, name);
};
$('againBtn').onclick = () => { if (!G.me) return; if (G.mode === 'ta') { openTA(G.me); return; } G.mode = G.mode === 'gallery' && G.opponent ? 'gallery' : 'solo'; openPrep(); };
$('newBtn').onclick = () => startDraw('solo');
$('homeBtn').onclick = () => goTitle();
$('resLinkBtn').onclick = () => { if (result && result.link) sendLink(result.link, '3人対戦の結果'); };
$('nextChallengeBtn').onclick = () => { if (!G.me) return; G.mode = 'link'; G.challenge = null; openPrep(); };
$('postBtn').onclick = async () => {
  if (!G.me) return;
  $('postBtn').disabled = true;
  try { const m = await Store.remote(); await m.postCreature(G.me, G.meInfo); toast('みんなのらくがきに出しました'); $('postBtn').textContent = '出しました'; }
  catch (e) { toast(e && e.busy ? 'いまは混み合っていて出せません。少したってからもう一度どうぞ' : (e && e.message ? e.message : '出せませんでした'), 3500); $('postBtn').disabled = false; }
};

// ---------- 動画(レースの見どころ + 結果の1枚。MediaRecorder) ----------
function recMime() {
  if (!window.MediaRecorder) return '';
  for (const m of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}
function canRecord() { return !!recMime() && !!HTMLCanvasElement.prototype.captureStream; }
function videoTimeline(sc) {
  const i = sc.meIndex >= 0 ? sc.meIndex : sc.race.order[0];
  const T = sc.race.times[i];
  // [動画の秒数, レースの時刻の始まり, 速さ]
  const segs = [[2.6, -1.4, 1]];          // よーい、ドン
  const midA = 1.2, midB = Math.max(midA, T - 2.4);
  segs.push([(midB - midA) / 3.2, midA, 3.2]); // 早送り
  segs.push([3.4, midB, 1]);                // ゴール前
  return { segs, cardSec: 2.4 };
}
// opt.vertical: 完全版の縦動画(720x1280、TikTok・リール・ショート向け)。自分の子に寄って走る所 → 結果の1枚
function makeVideo(sc, card, onProg, opt) {
  opt = opt || {};
  return new Promise((resolve, reject) => {
    const W = 720, H = opt.vertical ? 1280 : 900;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
    const mime = recMime();
    const stream = cv.captureStream(30);
    audioInit();
    let dest = null;
    if (SND.ctx) { dest = SND.ctx.createMediaStreamDestination(); SND.master.connect(dest); for (const tr of dest.stream.getAudioTracks()) stream.addTrack(tr); }
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3_000_000 });
    const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => { if (dest) try { SND.master.disconnect(dest); } catch (e) { } resolve({ blob: new Blob(chunks, { type: mime }), type: mime }); };
    const tl = videoTimeline(sc);
    const total = tl.segs.reduce((a, s) => a + s[0], 0) + tl.cardSec;
    const prevBgm = SND.bgmName; bgm('');
    const evs = sc.race.events; let ei = 0; const said = {};
    let start = null, lastSec = -1, ended = false;
    const drawAt = (vt) => {
      let acc = 0;
      for (const [dur, t0, sp] of tl.segs) {
        if (vt < acc + dur) {
          const t = t0 + (vt - acc) * sp;
          const cam = sceneCam(sc, t, W, H);
          renderScene(ctx, W, H, sc, t, cam, { noCount: t > 0.8 });
          // 実況の帯
          while (ei < evs.length && evs[ei].t <= t) { const e = evs[ei++]; if (sp === 1) { if (e.type === 'finish' && e.who === sc.meIndex) se('fanfare', 0.5); if (e.type === 'trip' || e.type === 'bonk' || e.type === 'fall') se('trip', 0.4); } if (e.who === sc.meIndex && LINES[e.type]) said.text = pickLine(e.type, sc.ents[e.who].name, 0), said.t = t; }
          if (t >= 0 && !said.go) { said.go = 1; se('pistol', 0.6); bgm('bgm_race', true); }
          if (opt.vertical) vHead(ctx, W, sc);
          if (sp > 1) { tag(ctx, W, '早送り ▶▶', 24, opt.vertical ? 132 : 24, '#ffffff'); }
          if (said.text && t - said.t < 1.6) banner(ctx, W, H - (opt.vertical ? 60 : 0), said.text);
          tag(ctx, W, CFG.TAG, W - 24, H - 24, '#ffd54f', 'right');
          return;
        }
        acc += dur;
      }
      // 結果の1枚
      if (!said.card) { said.card = 1; bgm(''); se('clap', 0.5); }
      ctx.fillStyle = '#b9e9ff'; ctx.fillRect(0, 0, W, H);
      if (opt.vertical) { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#7fd3fb'); g.addColorStop(1, '#d8f4ff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
      const k = Math.min(W / card.width, H / card.height); ctx.drawImage(card, (W - card.width * k) / 2, (H - card.height * k) / 2, card.width * k, card.height * k);
      if (opt.vertical) { vHead(ctx, W, sc); tag(ctx, W, CFG.TAG, W / 2, H - 60, '#ffd54f', 'center'); }
    };
    const frame = (now) => {
      if (start == null) start = now;
      const vt = (now - start) / 1000;
      if (vt >= total) { if (!ended) { ended = true; rec.stop(); bgm(prevBgm); } return; }
      drawAt(vt);
      const left = Math.ceil(total - vt); if (left !== lastSec) { lastSec = left; onProg && onProg(left); }
      requestAnimationFrame(frame);
    };
    drawAt(0);
    rec.start(250);
    requestAnimationFrame(frame);
    setTimeout(() => { if (!ended) { ended = true; try { rec.stop(); } catch (e) { reject(e); } } }, (total + 4) * 1000);
  });
}
// 縦動画の上の帯: 自分の子の名前とコース
function vHead(ctx, W, sc) {
  const i = sc.meIndex >= 0 ? sc.meIndex : sc.race.order[0], e = sc.ents[i];
  ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = '#19263d'; ctx.lineWidth = 4;
  roundRect(ctx, 20, 20, W - 40, 96, 22); ctx.fill(); ctx.stroke();
  ctx.font = `900 40px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#19263d';
  ctx.fillText(`「${e.name}」の${COURSES[sc.course].name}`, W / 2, 68, W - 80); ctx.restore();
}
function tag(ctx, W, text, x, y, color, align) {
  ctx.save(); ctx.font = `900 28px ${FONT}`; ctx.textAlign = align || 'left'; ctx.textBaseline = align ? 'bottom' : 'top';
  ctx.lineWidth = 7; ctx.strokeStyle = '#19263d'; ctx.lineJoin = 'round'; ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.restore();
}
function banner(ctx, W, H, text) {
  ctx.save(); ctx.font = `900 34px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = Math.min(W - 30, ctx.measureText(text).width + 40);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#19263d'; ctx.lineWidth = 4; roundRect(ctx, (W - w) / 2, H - 120, w, 62, 16); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#19263d'; ctx.fillText(text, W / 2, H - 89, W - 50); ctx.restore();
}

// ---------- 挑戦状リンク(サーバー無し。URL の # 以降にだけ入れる) ----------
$('linkVsBtn').onclick = () => { G.challenge = null; startDraw('link', { title: '挑戦状を出す生き物を描いてね' }); };
function makeChallenge() {
  const ch = { course: G.course, seed: newSeed(), size: CFG.VS_SIZE, creatures: [G.me], perBytes: CFG.PER_BYTES };
  G.challenge = ch;
  openLinkScreen(ch, 0);
}
function challengeUrl(ch) { return shareBase() + '#c=' + Challenge.encode(Object.assign({ perBytes: CFG.PER_BYTES }, ch)); }
function openLinkScreen(ch, myIdx) {
  const url = challengeUrl(ch);
  G.linkUrl = url;
  const left = ch.size - ch.creatures.length;
  $('linkTitle').textContent = ch.creatures.length === 1 ? '挑戦状ができました' : `${ch.creatures.length}人そろいました`;
  $('linkNote').textContent = `あと ${left} 人。このリンクを送ると、相手は描いて参加できます(コース: ${COURSES[ch.course].name})`;
  renderEntrants($('linkEntrants'), ch.creatures, ch.size);
  $('linkText').value = url;
  const text = `らくがき運動会の挑戦状です。生き物を描いて参加してね(あと${left}人・${COURSES[ch.course].name})\n${CFG.TAG}\n作った人 ${CFG.AUTHOR}`;
  $('linkXBtn').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url);
  show('linkScreen');
}
function renderEntrants(box, creatures, size) {
  box.innerHTML = '';
  for (let i = 0; i < size; i++) {
    const d = document.createElement('div');
    if (creatures[i]) { d.className = 'ent'; const c = document.createElement('canvas'); c.width = 192; c.height = 160; drawThumb(c, creatures[i]); d.appendChild(c); d.appendChild(document.createTextNode(creatures[i].name || '名なし')); }
    else { d.className = 'ent empty'; d.textContent = `${i + 1}人目 まち`; }
    box.appendChild(d);
  }
}
async function sendLink(url, title) {
  try { if (navigator.share && matchMedia('(pointer:coarse)').matches) { await navigator.share({ title: 'らくがき運動会', text: title, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); toast('リンクをコピーしました'); } catch (e) { $('linkText').select(); toast('リンクを選んだのでコピーしてね'); }
}
$('linkShareBtn').onclick = () => sendLink(G.linkUrl, 'らくがき運動会の挑戦状');
$('linkCopyBtn').onclick = async () => { try { await navigator.clipboard.writeText(G.linkUrl); toast('リンクをコピーしました'); } catch (e) { $('linkText').select(); } };
$('linkCpuBtn').onclick = () => { const ch = G.challenge; if (!ch) return; const meIdx = ch.creatures.length - 1; ch.size = ch.creatures.length; startLinkRace(ch, meIdx); };
$('linkHomeBtn').onclick = () => goTitle();
function startLinkRace(ch, meIdx) {
  const full = Object.assign({}, ch, { size: Math.max(ch.size, ch.creatures.length) });
  const str = Challenge.encode(Object.assign({ perBytes: CFG.PER_BYTES }, full));
  // 結果のリンクから読み直した線で走らせる(だれが開いても同じ線・同じ結果になるように)
  const dec = Challenge.decode(str);
  runVs(dec.creatures, dec.course, dec.seed, meIdx, meIdx >= 0 ? 'link' : 'view');
  scene.challengeStr = str;
}
// 受け取った人
function joinChallenge(cr) {
  const ch = G.challenge;
  ch.creatures.push(cr);
  const meIdx = ch.creatures.length - 1;
  if (ch.creatures.length >= ch.size) { startLinkRace(ch, meIdx); }
  else openLinkScreen(ch, meIdx);
}
function readHash() {
  const h = location.hash || '';
  const m = h.match(/[#&]c=([A-Za-z0-9_-]+)/);
  if (m) { try { return { challenge: Challenge.decode(m[1]) }; } catch (e) { toast('挑戦状のリンクが読めませんでした'); } }
  const r = h.match(/[#&]room=([A-Za-z0-9]{4,6})/);
  if (r) return { room: r[1].toUpperCase() };
  return null;
}
function showInvite(ch) {
  const box = $('inviteBox');
  const full = ch.creatures.length >= ch.size;
  box.innerHTML = `<p class="h2">${full ? '3人対戦の結果が届きました' : `${ch.creatures[0].name} から挑戦状!`}</p>`;
  const ents = document.createElement('div'); ents.className = 'entrants'; renderEntrants(ents, ch.creatures, ch.size); box.appendChild(ents);
  const note = document.createElement('p'); note.className = 'note'; note.textContent = full ? `コース: ${COURSES[ch.course].name}。だれが開いても同じ結果になります` : `コース: ${COURSES[ch.course].name}。あと ${ch.size - ch.creatures.length} 人。あなたも描いて参加しよう`;
  box.appendChild(note);
  const b = document.createElement('button'); b.className = 'go'; b.type = 'button';
  b.textContent = full ? 'レースを見る' : '描いて参加する';
  b.onclick = () => {
    G.challenge = ch;
    if (full) { startLinkRace(ch, -1); }
    else startDraw('link', { title: '参加する生き物を描いてね', rivals: ch.creatures });
  };
  box.appendChild(b);
  box.classList.remove('hidden');
}

// ---------- 部屋(3人同時。online.js の Firestore で同期) ----------
const Room = {
  code: '', unsub: null, isHost: false, data: null, entries: {}, drawEnd: 0, submitted: false, raced: false, timer: null,
  async create() {
    try { const m = await Store.remote(); Room.isHost = true; const code = await m.createRoom(); Room.enter(code, m); }
    catch (e) { roomFail(e); }
  },
  async join(code) {
    try { const m = await Store.remote(); Room.isHost = false; await m.joinRoom(code); Room.enter(code, m); }
    catch (e) { roomFail(e); }
  },
  enter(code, m) {
    Room.code = code; Room.submitted = false; Room.raced = false; Room.entries = {};
    $('roomCode').textContent = code;
    show('roomScreen');
    history.replaceState(null, '', location.pathname + location.search + '#room=' + code);
    Room.unsub && Room.unsub();
    Room.unsub = m.watchRoom(code, (data, entries, err) => Room.onUpdate(data, entries, err));
  },
  onUpdate(data, entries, err) {
    Room.data = data; Room.entries = entries || {};
    if (!data) { $('roomStatus').textContent = err && /resource-exhausted|quota/i.test(String(err.code || err.message)) ? 'いまは混み合っていて部屋につながりません。「挑戦状リンクを回す」なら遊べます' : 'この部屋は見つかりません'; return; }
    const m = Store.online;
    const members = data.members || [];
    const mineIn = members.includes(m.uid());
    renderEntrants($('roomMembers'), members.map((u, i) => ({ name: entries[u] ? entries[u].creature.name : (u === m.uid() ? 'あなた' : (i === 0 ? '部屋をつくった人' : (i + 1) + '人目')) + (entries[u] ? '' : (data.state === 'drawing' ? '(描いています)' : '')), strokes: entries[u] ? entries[u].creature.strokes : [] })), CFG.VS_SIZE);
    $('roomShareBtn').classList.toggle('hidden', data.state !== 'lobby');
    $('roomStartBtn').classList.toggle('hidden', !(Room.isHost && data.state === 'lobby'));
    $('roomStartBtn').textContent = members.length < CFG.VS_SIZE ? `${members.length}人で描きはじめる(残りはCPU)` : 'みんなで描きはじめる';
    if (data.state === 'lobby') {
      $('roomStatus').textContent = `${members.length} / ${CFG.VS_SIZE} 人。${Room.isHost ? 'そろったら「描きはじめる」を押してね' : '部屋をつくった人が始めるのを待っています'}`;
      $('roomHelp').textContent = 'つながらない時(会社や学校の回線など)は、タイトルの「挑戦状リンクを回す」で遊べます';
    }
    if (data.state === 'drawing' && mineIn && !Room.submitted && $('drawScreen').classList.contains('hidden')) {
      Room.drawEnd = Date.now() + Math.max(5, (data.drawSec || 40) - (Date.now() - (data.drawStartLocal || Date.now())) / 1000) * 1000;
      Room.drawEnd = Date.now() + (data.drawSec || 40) * 1000;
      startDraw('room', { title: `部屋 ${Room.code}: ${data.drawSec || 40}秒で描いてね`, timer: true });
      Room.tick();
    }
    if (data.state === 'drawing' && Room.submitted) {
      const n = members.filter(u => entries[u]).length;
      $('roomStatus').textContent = `描けた人 ${n} / ${members.length}。そろうとレースが始まります`;
      if (Room.isHost && (n >= members.length)) m.startRace(Room.code, members.filter(u => entries[u]));
    }
    if (data.state === 'race' && !Room.raced) {
      Room.raced = true; clearInterval(Room.timer);
      setTimeout(() => { if (Room.raced && Room.unsub) { Room.unsub(); Room.unsub = null; } }, 0);
      const order = data.order || [];
      const crs = order.map(u => entries[u] && entries[u].creature).filter(Boolean);
      const meIdx = order.indexOf(m.uid());
      const ch = { course: data.course || 'track', seed: data.seed >>> 0, size: CFG.VS_SIZE, creatures: crs };
      G.challenge = ch;
      startLinkRace(ch, meIdx);
      scene.mode = meIdx >= 0 ? 'room' : 'view';
    }
  },
  tick() {
    clearInterval(Room.timer);
    Room.timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((Room.drawEnd - Date.now()) / 1000));
      $('drawTimer').textContent = left + '秒';
      if (left <= 0) {
        clearInterval(Room.timer);
        if (!Room.submitted) {
          if (!strokes.length) strokes = [{ c: COLORS[0], w: 14, p: [[290, 300], [310, 300]] }];
          const cr = myCreature(); G.me = cr; G.meInfo = analyze(cr.strokes); Room.submit(cr);
        }
        // 部屋をつくった人: 時間切れから8秒たったら、描けた人だけでレース
        if (Room.isHost) setTimeout(() => { const d = Room.data; if (d && d.state === 'drawing') Store.online.startRace(Room.code, (d.members || []).filter(u => Room.entries[u])); }, 8000);
      }
    }, 250);
  },
  async submit(cr) {
    Room.submitted = true;
    try { await Store.online.submitEntry(Room.code, cr); } catch (e) { toast('送れませんでした'); }
    show('roomScreen'); $('roomStatus').textContent = 'ほかの人を待っています…';
  },
  leave() { Room.unsub && Room.unsub(); Room.unsub = null; clearInterval(Room.timer); if (Store.online && Room.code) Store.online.leaveRoom(Room.code).catch(() => { }); Room.code = ''; history.replaceState(null, '', location.pathname + location.search); },
};
function roomFail(e) {
  console.error(e);
  if (e && e.terms) { toast('3人の部屋は利用規約に同意すると使えます', 3500); goTitle(); return; }
  if (e && e.busy) { toast('いまは混み合っていて部屋につながりません。「挑戦状リンクを回す」なら遊べます', 4500); goTitle(); return; }
  toast((e && e.message ? e.message + '。' : '') + '部屋につながりません。「挑戦状リンクを回す」なら遊べます', 4500);
  goTitle();
}
$('roomMakeBtn').onclick = () => Room.create();
$('roomJoinBtn').onclick = () => { const c = $('roomCodeInput').value.trim().toUpperCase(); if (c.length >= 4) Room.join(c); else toast('部屋コードを入れてね'); };
$('roomStartBtn').onclick = async () => { try { await Store.online.startDrawing(Room.code, 40); } catch (e) { roomFail(e); } };
$('roomShareBtn').onclick = () => sendLink(shareBase() + '#room=' + Room.code, `らくがき運動会の部屋 ${Room.code} に来てね`);
$('roomLeaveBtn').onclick = () => { Room.leave(); goTitle(); };

// ---------- みんなのらくがき ----------
const Gal = { cursor: null, items: [] };
async function openGallery() {
  show('galleryScreen'); $('galStatus').textContent = '読みこみ中…'; $('galGrid').innerHTML = ''; Gal.cursor = null; Gal.items = [];
  try { await galleryMore(); } catch (e) { $('galStatus').textContent = e && e.busy ? BUSY_MSG + '。ひとりで走る・描く・共有はそのまま遊べます' : 'いまは読みこめません(' + (e.message || e) + ')。ひとりで走る・描く・共有はそのまま遊べます'; $('galMoreBtn').classList.add('hidden'); }
}
async function galleryMore() {
  const m = await Store.mod();
  const { items, cursor, stale } = await m.listCreatures(Gal.cursor);
  Gal.cursor = cursor;
  $('galStatus').textContent = stale ? (stale === 'busy' ? 'いまは混み合っているので' : 'いまはつながらないので') + '、少し前のみんなの絵を出しています。さわって「走る」で対戦できます' : items.length || Gal.items.length ? 'さわって「走る」で対戦できます' : 'まだだれも出していません';
  $('galMoreBtn').classList.toggle('hidden', !cursor);
  for (const it of items) {
    Gal.items.push(it);
    const d = document.createElement('div'); d.className = 'gi';
    const c = document.createElement('canvas'); c.width = 240; c.height = 200; drawThumb(c, it.creature); d.appendChild(c);
    const n = document.createElement('div'); n.textContent = it.creature.name || '名なし'; d.appendChild(n);
    const tt = document.createElement('div'); tt.className = 'gt'; tt.textContent = it.created ? it.created + ' に出た子' : ''; d.appendChild(tt);
    const row = document.createElement('div'); row.className = 'row';
    const b = document.createElement('button'); b.textContent = '走る'; b.onclick = () => vsGallery(it.creature);
    const rp = document.createElement('button'); rp.className = 'rp'; rp.textContent = '通報';
    rp.onclick = async () => { if (!confirm('この絵を通報しますか?(不快な絵・名前など)')) return; try { await m.report(it.id); d.style.opacity = 0.3; rp.disabled = true; toast('通報しました'); } catch (e) { toast(e.message || '通報できませんでした'); } };
    const bk = document.createElement('button'); bk.className = 'rp'; bk.textContent = '見ない';
    bk.onclick = () => { if (!confirm('この人の絵をこの端末ではもう出さないようにしますか?(みんなのらくがき・相手・ランキング)')) return; m.block(it); d.remove(); toast('この人の絵を出さないようにしました'); };
    row.appendChild(b); row.appendChild(rp); row.appendChild(bk); d.appendChild(row);
    $('galGrid').appendChild(d);
  }
}
function vsGallery(cr) { G.opponent = cr; startDraw('gallery', { title: `「${cr.name}」と走る生き物を描いてね`, rivals: [cr] }); }
$('galleryBtn').onclick = () => openGallery();
$('galMoreBtn').onclick = () => galleryMore().catch(e => toast(e && e.busy ? BUSY_MSG : e.message, 3500));
$('galRandomBtn').onclick = async () => { try { const m = await Store.mod(); const it = await m.randomCreature(); if (!it) { toast('まだだれもいません'); return; } vsGallery(it.creature); } catch (e) { toast(e && e.busy ? BUSY_MSG : (e.message || '読みこめません'), 3500); } };
$('galBackBtn').onclick = () => goTitle();

// ---------- タイトル ----------
let titleScene = null, titleClock = 0;
function makeTitleScene() {
  const cpus = CPU_DEFS.map(d => cpuCreature(d, 0));
  const sc = buildScene(cpus.map(cr => ({ cr, cpu: true })), 'track', 4242, 'title');
  sc.meIndex = -1; return sc;
}
function goTitle() {
  playing = false; scene = null;
  show('titleScreen');
  $('mainMenu').classList.remove('hidden'); $('vsMenu').classList.add('hidden');
  $('inviteBox').classList.add('hidden');
  if (!titleScene) titleScene = makeTitleScene();
  titleClock = 0.5;
  bgm('bgm_title');
}
$('soloBtn').onclick = () => startDraw('solo');
$('vsBtn').onclick = () => { $('mainMenu').classList.add('hidden'); $('vsMenu').classList.remove('hidden'); };
$('vsBackBtn').onclick = () => { $('mainMenu').classList.remove('hidden'); $('vsMenu').classList.add('hidden'); };
$('soundBtn').onclick = () => setSound(!SND.on);
$('creditBtn').onclick = () => $('creditBox').classList.toggle('hidden');
$('fullBtn').onclick = () => Full.open('title');
$('fullBuyBtn').onclick = () => Full.buy();
$('fullRestoreBtn').onclick = () => Full.restore();
$('fullBackBtn').onclick = () => Full.back();
$('fullPlayLink').href = Full.PLAY_URL;

// ---------- ループ ----------
function frame(dt) {
  const W = stage.width, H = stage.height;
  if (scene) {
    stepRace(dt * timeScale(scene, raceClock));
    const t = raceClock;
    renderScene(sctx, W, H, scene, t, sceneCam(scene, t, W, H));
    if (!scene.ended || curScreen === 'race') drawOverlay(sctx, W, H, scene, t);
  } else if (titleScene) {
    titleClock += dt;
    const T = titleScene.race.times[titleScene.race.order[0]] + 1.5;
    if (titleClock > T) titleClock = -1;
    const t = titleClock;
    const xs = titleScene.ents.map((e, i) => racerAt(titleScene, i, t).x);
    const lead = Math.max(...xs);
    renderScene(sctx, W, H, titleScene, t, sceneCam(titleScene, t, W, H, lead - 120), { noCount: true });
  }
}
function loop(ts) {
  const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 1 / 60;
  lastTs = ts;
  if (!manual) frame(dt);
  requestAnimationFrame(loop);
}

// 試験と動画撮影のための入口(遊ぶ人には関係ない)
window.__RU = {
  setManual(v) { manual = !!v; },
  step(dt, n) { for (let i = 0; i < (n || 1); i++) frame(dt); },
  state() { return scene && { mode: scene.mode, t: raceClock, ended: !!scene.ended, me: scene.meIndex, times: scene.race.times, rank: scene.race.rank, order: scene.race.order, n: scene.ents.length, types: scene.ents.map(e => e.info.mode), line: scene.lastLine }; },
  result() { return result && Object.assign({}, result.info, { intent: $('xBtn').href, link: result.link }); },
  strokes() { return strokes; },
  setStrokes(s) { strokes = s; renderPad(); updateLiveType(); },
  analyze(s) { return analyze(s || strokes); },
  events() { return scene && scene.race.events; },
  G, Room, makeVideo: () => makeVideo(result.scene, result.canvas, () => { }),
  canRecord, recMime, makeVVideo: () => makeVideo(result.scene, result.canvas, () => { }, { vertical: true }), Full, buildFxRow,
  // 仮のアイコン(ChatGPT の絵が届くまで): いま描いてある絵を空とトラックの上に大きく
  icon(W, H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H || W; const ctx = c.getContext('2d'); H = c.height;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#7fd3fb'); g.addColorStop(1, '#d8f4ff'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#65c982'; ctx.fillRect(0, H * 0.70, W, H * 0.06); ctx.fillStyle = '#ea8359'; ctx.fillRect(0, H * 0.75, W, H * 0.25);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = H * 0.015; ctx.beginPath(); ctx.moveTo(0, H * 0.9); ctx.lineTo(W, H * 0.9); ctx.stroke();
    const cr = Creature.make(strokes, ''), info = analyze(cr.strokes), probe = new Doodle(cr, info, 100);
    const d = new Doodle(cr, info, 100 * Math.min(H * 0.62 / probe.h, W * 0.82 / probe.w));
    d.draw(ctx, W / 2, H * 0.86, 1, { t: 0.3, phase: 0.2, state: 'run', idle: true, x: 0 });
    return c.toDataURL('image/png');
  },
  challengeUrl: () => G.linkUrl,
  scene: () => scene, get Rec() { return Rec; }, get Persist() { return Persist; }, setSlowInManual(v) { if (scene) scene.slowInManual = !!v; },
  cheer(n) { const b = $('cheerBtn'); for (let i = 0; i < (n || 1); i++) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return scene && scene.cheers.length; },
};

// ---------- コースの上のおにぎり・追い風 ----------
function drawLaneItems(ctx, sc, li, y, S, xa, xb, t, rx) {
  const items = sc.race.items || [];
  const gh = x => groundH(COURSES[sc.course], x);
  for (const it of items) {
    if (!it.lanes.includes(li) || it.x < xa - 60 || it.x > xb + 60) continue;
    if (rx >= it.x && t > 0) continue; // もう拾った
    const bob = Math.sin(t * 4 + li) * 5 * S, sz = 46 * S, gx = it.x, gy = y - gh(gx) - sz * 0.75 + bob;
    if (IMG.item_onigiri) { const im = IMG.item_onigiri, w = sz * 1.25, h = w * im.naturalHeight / im.naturalWidth; ctx.drawImage(im, gx - w / 2, gy - h / 2, w, h); }
    else {
      ctx.save(); ctx.translate(gx, gy); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#19263d'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -sz * 0.45); ctx.lineTo(sz * 0.42, sz * 0.32); ctx.lineTo(-sz * 0.42, sz * 0.32); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#19263d'; ctx.fillRect(-sz * 0.16, sz * 0.05, sz * 0.32, sz * 0.27); ctx.restore();
    }
  }
  // 追い風: 対象のレーンに白い風の線
  const g = sc.race.gust;
  if (g && t >= g.t && t < g.t + g.dur && sc.gustOn && sc.gustOn.lanes.includes(li)) {
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4 * S; ctx.lineCap = 'round';
    for (let k = 0; k < 4; k++) { const ph = ((t * 1.6 + k / 4 + li * 0.13) % 1); const x0 = rx - 260 * S + ph * 420 * S, yy = y - (30 + k * 18) * S - gh(rx); ctx.globalAlpha = 1 - Math.abs(ph - 0.5) * 2; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.quadraticCurveTo(x0 + 50 * S, yy - 10 * S, x0 + 100 * S, yy); ctx.stroke(); }
    ctx.restore();
  }
}
// 画面の上に重ねる物(花火・応援のハート・スピード線・写真判定の光)
function drawOverlay(ctx, W, H, sc, t) {
  const now = performance.now(), u = Math.min(W, H);
  // 自分が加速している時のスピード線
  if (sc.meIndex >= 0 && t > 0) {
    const r = racerAt(sc, sc.meIndex, t);
    if (r.state === 'burst') {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(2, u * 0.006);
      for (let k = 0; k < 14; k++) { const yy = hash3(k, 5, 9) * H, ph = (now / 260 + hash3(k, 7, 3)) % 1, x0 = W * (1.1 - ph * 1.4), len = W * (0.15 + hash3(k, 2, 2) * 0.2); ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + len, yy); ctx.stroke(); }
      ctx.restore();
    }
  }
  // 写真判定: 白く光ってから、ゴールの線とスタンプ
  if (sc.flashT) {
    const a = (now - sc.flashT) / 1000;
    if (a < 0.25) { ctx.fillStyle = `rgba(255,255,255,${1 - a / 0.25})`; ctx.fillRect(0, 0, W, H); }
    if (a < 2.0) {
      const fs = u * 0.11;
      ctx.save(); ctx.translate(W / 2, H * 0.27); ctx.rotate(-0.05); const sc2 = easeOutBack(clamp(a / 0.3, 0, 1)); ctx.scale(sc2, sc2);
      ctx.font = `900 ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.lineWidth = fs * 0.16; ctx.strokeStyle = '#19263d'; ctx.strokeText('写真判定!', 0, 0); ctx.fillStyle = '#ffd54f'; ctx.fillText('写真判定!', 0, 0);
      if (a > 0.9 && sc.slow) { const [p, q] = sc.slow.pair; const gap = sc.race.times[q] - sc.race.times[p]; ctx.font = `900 ${fs * 0.42}px ${FONT}`; ctx.lineWidth = fs * 0.09; const tx = `${sc.ents[p].name} が ${gap.toFixed(3)}秒 先!`; ctx.strokeText(tx, 0, fs * 0.8); ctx.fillStyle = '#fff'; ctx.fillText(tx, 0, fs * 0.8); }
      ctx.restore();
    }
  }
  // スロー中の印
  if (sc.slow && timeScale(Object.assign({}, sc, { slowInManual: true }), t) < 0.6 && !sc.flashT) {
    ctx.save(); ctx.fillStyle = 'rgba(25,38,61,0.75)'; const fs = u * 0.045; ctx.font = `900 ${fs}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('スロー ▶', u * 0.04, H * 0.16); ctx.restore();
  }
  // 優勝! など
  sc.pops = sc.pops.filter(p => now - p.t0 < p.dur * 1000 + 300);
  const photoBusy = sc.flashT && now - sc.flashT < 2000;
  const p = photoBusy ? null : sc.pops.filter(q => q.t0 <= now).pop();
  if (p) {
    const a = (now - p.t0) / 1000, fs = u * 0.12 * p.size;
    const alpha = a > p.dur ? 1 - (a - p.dur) / 0.3 : 1;
    ctx.save(); ctx.globalAlpha = clamp(alpha, 0, 1); ctx.translate(W / 2, H * 0.38); ctx.rotate(-0.04); const k = easeOutBack(clamp(a / 0.22, 0, 1)); ctx.scale(k, k);
    ctx.font = `900 ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = fs * 0.18; ctx.strokeStyle = '#19263d'; ctx.strokeText(p.text, 0, 0); ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0);
    if (p.sub) { const f2 = fs * 0.36; ctx.font = `900 ${f2}px ${FONT}`; ctx.lineWidth = f2 * 0.22; ctx.strokeText(p.sub, 0, fs * 0.72); ctx.fillStyle = '#ffffff'; ctx.fillText(p.sub, 0, fs * 0.72); }
    ctx.restore();
  }
  // 花火・ハート
  sc.fx = sc.fx.filter(f => now - f.t0 < f.life * 1000);
  for (const f of sc.fx) {
    const a = (now - f.t0) / 1000; if (a < 0) continue;
    if (f.kind === 'spark') {
      const x = (f.cx + f.vx * a) * W, y = (f.cy + f.vy * a + 0.12 * a * a) * H;
      ctx.globalAlpha = 1 - a / f.life; ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(x, y, u * 0.009, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    } else if (f.kind === 'heart') {
      const x = W * (0.72 + f.x * 0.2), y = H * (0.86 - a * 0.35);
      ctx.globalAlpha = 1 - a / f.life; ctx.font = `900 ${u * 0.06}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#ff5d8f'; ctx.fillText('♥', x, y); ctx.globalAlpha = 1;
    }
  }
}

// ---------- きろく(端末に保存。壊れていても起動する) ----------
const Rec = {
  KEY: CFG.STORE_KEY + '_rec',
  data: null,
  load() {
    if (Rec.data) return Rec.data;
    let d = null;
    try { d = JSON.parse(localStorage.getItem(Rec.KEY) || 'null'); } catch (e) { d = null; }
    if (!d || typeof d !== 'object' || !d.pets || typeof d.pets !== 'object') d = { v: 1, pets: {}, streak: 0, bestStreak: 0, races: 0, wins: 0 };
    // 図鑑の番号(前の版で保存した子には描いた順に付ける)
    if (!d.nextNo) { let n = 0; Object.values(d.pets).filter(p => p && !p.no).sort((a, b) => String(a.born).localeCompare(String(b.born)) || (a.last || 0) - (b.last || 0)).forEach(p => { p.no = ++n; }); d.nextNo = Math.max(n, ...Object.values(d.pets).map(p => (p && p.no) || 0), 0); }
    Rec.data = d; return d;
  },
  // 何匹まで残すか: ふつう 60匹 / 完全版の「自分の図鑑」300匹(お気に入りは消さない)
  cap() { return Full.has() ? 300 : 60; },
  trim(cap) {
    const d = Rec.load(), ids = Object.keys(d.pets);
    if (ids.length <= cap) return;
    ids.filter(k => !d.pets[k].fav).sort((a, b2) => d.pets[a].last - d.pets[b2].last).slice(0, ids.length - cap).forEach(k => delete d.pets[k]);
  },
  save() {
    for (let k = 0; k < 4; k++) {
      try { localStorage.setItem(Rec.KEY, JSON.stringify(Rec.data)); return true; }
      catch (e) { const n = Object.keys(Rec.data.pets).length; if (n <= 20) return false; Rec.trim(Math.floor(n * 0.9)); } // 端末の入れ物がいっぱい: 古い子から少し減らす
    }
    return false;
  },
  idOf(cr) { return (hashStr(JSON.stringify(cr.strokes.map(s => s.k ? [s.c, s.w, s.p, s.k] : [s.c, s.w, s.p]))) >>> 0).toString(36); },
  pet(cr) { if (!cr) return null; const d = Rec.load(); return d.pets[Rec.idOf(cr)] || null; },
  ensure(cr) {
    const d = Rec.load(), id = Rec.idOf(cr);
    if (!d.pets[id]) d.pets[id] = { id, no: (d.nextNo = (d.nextNo || 0) + 1), cr: { name: cr.name, strokes: cr.strokes }, born: new Date().toISOString().slice(0, 10), n: 0, wins: 0, pod: 0, sumRank: 0, best: {}, ta: {}, races: [], last: Date.now() };
    const p = d.pets[id]; p.cr.name = cr.name || p.cr.name;
    if (cr.fx) p.cr.fx = cr.fx; else delete p.cr.fx;
    return p;
  },
  // レースが終わったら1行足す。返り値は結果に出す札(連勝・自己ベストなど)
  addRace(sc, info) {
    const badges = [];
    try {
      if (sc.meIndex < 0) return badges;
      const d = Rec.load(), e = sc.ents[sc.meIndex], p = Rec.ensure(e.cr), t = info.time;
      p.last = Date.now();
      const row = { d: new Date().toISOString().slice(0, 16).replace('T', ' '), c: sc.course, r: info.rank, n: info.n, t: t == null ? null : Math.round(t * 100) / 100, m: sc.mode };
      p.races.unshift(row); p.races = p.races.slice(0, 40);
      if (sc.mode === 'ta') {
        const old = p.ta[sc.course];
        if (t != null && (!old || t < old)) { p.ta[sc.course] = Math.round(t * 1000) / 1000; badges.push({ t: old ? 'タイム自己ベスト更新!' : 'タイムを記録!', c: 'gold' }); }
      } else {
        p.n++; d.races++; p.sumRank += info.rank;
        if (info.rank === 1) { p.wins++; d.wins++; if (p.wins === 1) badges.push({ t: 'この子の初勝利!', c: 'gold' }); }
        if (info.rank <= 3) p.pod++;
        const b = p.best[sc.course];
        if (t != null && info.n === 6 && (!b || t < b.t)) { p.best[sc.course] = { t: Math.round(t * 100) / 100, r: info.rank }; if (b) badges.push({ t: `自己ベスト更新! ${b.t.toFixed(2)}→${t.toFixed(2)}秒`, c: 'gold' }); }
        else if (b && info.rank < b.r) b.r = info.rank;
        if (sc.mode === 'solo') {
          if (info.rank === 1) { d.streak++; if (d.streak >= 2) badges.push({ t: `${d.streak}連勝中!`, c: 'red' }); if (d.streak > d.bestStreak) { d.bestStreak = d.streak; if (d.streak >= 2) badges.push({ t: '連勝記録を更新!', c: 'red' }); } }
          else { if (d.streak >= 2) badges.push({ t: `連勝は ${d.streak} でストップ`, c: '' }); d.streak = 0; }
        }
        badges.push({ t: `この子 通算 ${p.wins}勝 / ${p.n}戦`, c: 'blue' });
      }
      // 多すぎたら古い子から消す(60匹まで。完全版の図鑑は300匹まで・お気に入りは消さない)
      Rec.trim(Rec.cap());
      Rec.save();
    } catch (err) { console.error(err); }
    return badges;
  },
  list() { const d = Rec.load(); return Object.values(d.pets).filter(p => p && p.cr && Array.isArray(p.cr.strokes)).sort((a, b) => b.last - a.last); },
};

// ---------- 広告(忍者AdMax のタグを ad.html の枠の中で出す) ----------
// 枠に入れる理由: スマホで画面の下に貼りつく広告(オーバーレイ)がレース中・描いている最中に出て、押し間違えで飛ばないように。
// タグそのものは書き換えない。見えている画面(タイトル・結果)の枠だけ読み込む。
const Ads = {
  load(screen) {
    if (params.has('noads')) return;
    for (const f of screen.querySelectorAll('iframe.adFrame')) {
      const last = +(f.dataset.at || 0);
      if (!f.src || (Date.now() - last > 90000 && screen.id === 'resultScreen')) { f.src = f.dataset.src + '?r=' + Date.now(); f.dataset.at = Date.now(); }
    }
  },
};

// ---------- いまの画面を覚えておく(広告などで別のページへ行って戻っても元どおり) ----------
const Persist = {
  KEY: CFG.STORE_KEY + '_resume',
  restoring: false, ready: false,
  snapshot() {
    const keep = ['titleScreen', 'drawScreen', 'prepScreen', 'resultScreen', 'albumScreen', 'petScreen', 'taScreen', 'rankScreen', 'race'];
    if (!keep.includes(curScreen)) return null;
    if (G.mode === 'room' || G.mode === 'link' && curScreen !== 'resultScreen') return { at: Date.now(), screen: 'titleScreen' };
    const st = { at: Date.now(), screen: curScreen, mode: G.mode, course: G.course, strokes, name: $('nameInput').value, me: G.me, opp: G.opponent, petId: G.petId, rankTab: G.rankTab, taPet: G.taPet };
    if ((curScreen === 'race' || curScreen === 'resultScreen') && scene && G.lastRace) st.race = Object.assign({}, G.lastRace, { cheers: scene.cheers, challengeStr: scene.challengeStr || '' }), st.badges = G.lastBadges || [];
    return st;
  },
  save() {
    if (Persist.restoring || !Persist.ready) return;
    try { const st = Persist.snapshot(); if (!st) return; const j = JSON.stringify(st); sessionStorage.setItem(Persist.KEY, j); localStorage.setItem(Persist.KEY, j); } catch (e) { }
  },
  read() {
    for (const store of [sessionStorage, localStorage]) {
      try { const st = JSON.parse(store.getItem(Persist.KEY) || 'null'); if (st && st.at && Date.now() - st.at < 12 * 3600 * 1000) return st; } catch (e) { }
    }
    return null;
  },
  restore() {
    const st = Persist.read(); if (!st || st.screen === 'titleScreen') return false;
    Persist.restoring = true;
    try {
      G.course = st.course || 'track'; G.opponent = st.opp || null; G.petId = st.petId; G.rankTab = st.rankTab; G.taPet = st.taPet || null;
      if (st.me && st.me.strokes) { G.me = st.me; G.meInfo = analyze(st.me.strokes); }
      const sm = st.mode === 'gallery' && st.opp ? 'gallery' : 'solo';
      switch (st.screen) {
        case 'drawScreen': startDraw(sm, st.opp ? { title: `「${st.opp.name}」と走る生き物を描いてね`, rivals: [st.opp] } : {}); strokes = Array.isArray(st.strokes) ? st.strokes : []; renderPad(); $('nameInput').value = st.name || ''; break;
        case 'prepScreen': if (!G.me) return false; G.mode = sm; openPrep(); break;
        case 'race': case 'resultScreen': {
          const r = st.race; if (!r || !r.ents) return false;
          G.mode = r.mode === 'view' || r.mode === 'link' || r.mode === 'room' ? 'solo' : r.mode;
          startRace(r.ents, r.course, r.seed >>> 0, r.mode, r.cheers);
          scene.challengeStr = r.challengeStr || '';
          // レースの途中だった時も、結果まで進める(もう一度見たい時は「もう一回」)
          scene.evIdx = scene.race.events.length; scene.slow = null; raceClock = Math.max(...scene.race.times.filter(x => x != null)) + 2.5;
          G.lastBadges = st.badges || [];
          scene.ended = true; finishRace({ restored: true });
          break;
        }
        case 'albumScreen': openAlbum(); break;
        case 'petScreen': openPet(st.petId) || openAlbum(); break;
        case 'taScreen': if (G.taPet) openTA(G.taPet); else openAlbum(); break;
        case 'rankScreen': openRank(); break;
        default: return false;
      }
      return true;
    } catch (e) { console.error(e); return false; }
    finally { Persist.restoring = false; Persist.save(); }
  },
};
window.addEventListener('pagehide', () => Persist.save());
$('nameInput').addEventListener('input', () => Persist.save());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Persist.save(); else { lastTs = 0; if (SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume(); } });
window.addEventListener('pageshow', e => { if (e.persisted) { lastTs = 0; if (SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume(); } });
setInterval(() => { if (curScreen === 'drawScreen') Persist.save(); }, 3000);

// ---------- アルバム・1匹のきろく ----------
function fmtCourse(id) { return COURSES[id] ? COURSES[id].name : id; }
function openAlbum() {
  const d = Rec.load(), full = Full.has();
  let pets = Rec.list();
  const sort = G.albumSort || 'new';
  if (full && sort === 'no') pets = pets.slice().sort((a, b) => (a.no || 0) - (b.no || 0));
  if (full && sort === 'win') pets = pets.slice().sort((a, b) => b.wins - a.wins || b.n - a.n);
  if (full && sort === 'fav') pets = pets.filter(p => p.fav);
  $('albumTitle').textContent = full ? '自分の図鑑・きろく' : 'きろく・アルバム';
  const zb = $('zukanBar'); zb.innerHTML = '';
  const all = Object.keys(d.pets).length;
  if (full) {
    zb.innerHTML = `<p class="note strong">自分の図鑑 <b>${all}</b> / ${Rec.cap()} 匹(お気に入りの子は消えません)</p>`;
    const tabs = document.createElement('div'); tabs.className = 'tabs small';
    for (const [id, label] of [['new', '新しい順'], ['no', '番号順'], ['win', '勝った数'], ['fav', 'お気に入り']]) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tab' + (sort === id ? ' on' : ''); b.textContent = label; b.onclick = () => { G.albumSort = id; openAlbum(); }; tabs.appendChild(b); }
    zb.appendChild(tabs);
  } else {
    zb.innerHTML = `<p class="note">${all} / ${Rec.cap()} 匹。いっぱいになると古い子から消えます</p>`;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sub lock'; b.textContent = '自分の図鑑(300匹まで・お気に入り)'; b.onclick = () => Full.open('zukan'); zb.appendChild(b);
  }
  $('albumTotals').innerHTML = `<span><b>${pets.length}</b>匹</span><span><b>${d.races || 0}</b>戦</span><span><b>${d.wins || 0}</b>勝</span><span>いまの連勝 <b>${d.streak || 0}</b></span><span>最高 <b>${d.bestStreak || 0}</b>連勝</span>`;
  const g = $('albumGrid'); g.innerHTML = '';
  if (!pets.length) g.innerHTML = full && sort === 'fav' ? '<p class="note">お気に入りはまだいません。1匹のきろくの「お気に入り」から入れられます</p>' : '<p class="note">まだだれも走っていません。タイトルの「ひとりで走る」から描いてみよう</p>';
  for (const p of pets) {
    const it = document.createElement('button'); it.type = 'button'; it.className = 'gi pet';
    const c = document.createElement('canvas'); c.width = 240; c.height = 200; drawThumb(c, p.cr); it.appendChild(c);
    const n = document.createElement('div'); n.textContent = (full && p.no ? `No.${p.no} ` : '') + (p.cr.name || '名なし') + (full && p.fav ? ' ★' : ''); it.appendChild(n);
    const tt = document.createElement('div'); tt.className = 'gt'; tt.textContent = `${p.wins}勝 / ${p.n}戦` + (p.n ? `・平均${(p.sumRank / p.n).toFixed(1)}位` : ''); it.appendChild(tt);
    it.onclick = () => openPet(p.id);
    g.appendChild(it);
  }
  show('albumScreen');
}
function openPet(id) {
  const d = Rec.load(), p = d.pets[id]; if (!p) return false;
  G.petId = id;
  drawThumb($('petCanvas'), p.cr, { bg: '#ffffff' });
  $('petName').textContent = p.cr.name || '名なし';
  $('petBorn').textContent = (Full.has() && p.no ? `図鑑 No.${p.no}・` : '') + `${p.born} に描いた子`;
  $('petFavBtn').textContent = !Full.has() ? 'お気に入り' : p.fav ? '★ お気に入り' : '☆ お気に入りにする';
  $('petFavBtn').classList.toggle('lock', !Full.has());
  $('petTotals').innerHTML = `<span><b>${p.n}</b>戦</span><span><b>${p.wins}</b>勝</span><span>表彰台 <b>${p.pod}</b></span><span>平均 <b>${p.n ? (p.sumRank / p.n).toFixed(1) : '-'}</b>位</span>`;
  const b = $('petBests'); b.innerHTML = '';
  for (const c of RU.COURSE_IDS) {
    const bb = p.best[c], ta = p.ta && p.ta[c], runs = p.races.filter(r => r.c === c && r.m !== 'ta');
    const el = document.createElement('div'); el.className = 'best';
    el.innerHTML = `<b>${fmtCourse(c)}</b><span>${bb ? bb.t.toFixed(2) + '秒(最高' + bb.r + '位)' : '—'}</span><small>${runs.length}回${ta ? '・タイムアタック ' + ta.toFixed(2) + '秒' : ''}</small>`;
    b.appendChild(el);
  }
  const rl = $('petRaces'); rl.innerHTML = '';
  if (!p.races.length) rl.innerHTML = '<p class="note">まだ走っていません</p>';
  for (const r of p.races.slice(0, 30)) {
    const el = document.createElement('div'); el.className = 'race' + (r.r === 1 && r.m !== 'ta' ? ' win' : '');
    const kind = r.m === 'ta' ? 'タイムアタック' : r.m === 'solo' ? 'ひとり' : r.m === 'gallery' ? 'みんな' : '対戦';
    el.innerHTML = `<span class="rd">${r.d.slice(5)}</span><span class="rc">${fmtCourse(r.c)}<small>${kind}</small></span><span class="rr">${r.m === 'ta' ? '' : r.r + '位/' + r.n}</span><span class="rt">${r.t != null ? r.t.toFixed(2) + '秒' : ''}</span>`;
    rl.appendChild(el);
  }
  show('petScreen');
  return true;
}
function petCreature(id) { const p = Rec.load().pets[id]; if (!p) return null; const cr = { v: 1, name: p.cr.name, created: p.born, strokes: p.cr.strokes }; if (p.cr.fx && Full.has()) cr.fx = p.cr.fx; return cr; }
$('petFavBtn').onclick = () => {
  if (!Full.has()) { Full.open('zukan'); return; }
  const p = Rec.load().pets[G.petId]; if (!p) return;
  p.fav = !p.fav; Rec.save(); openPet(G.petId);
};
$('albumBtn').onclick = () => openAlbum();
$('albumBtn2').onclick = () => openAlbum();
$('albumBackBtn').onclick = () => goTitle();
$('petBackBtn').onclick = () => openAlbum();
$('petRunBtn').onclick = () => { const cr = petCreature(G.petId); if (!cr) return; G.me = cr; G.meInfo = analyze(cr.strokes); G.mode = 'solo'; openPrep(); };
$('petTaBtn').onclick = () => { const cr = petCreature(G.petId); if (cr) openTA(cr); };

// ---------- タイムアタック ----------
function taCreature(cr) {
  // ランキングに送る形(文字にした線)に一度通してから走らせる。表示する人の端末と同じ線になる
  try { const packed = b64urlBytes(Creature.fitBytes(cr, CFG.PER_BYTES)); const back = Creature.fromBytes(unb64urlBytes(packed), 0)[0]; back.name = cr.name; back.packed = packed; if (cr.fx) back.fx = cr.fx; return back; } catch (e) { return cr; }
}
function b64urlBytes(bytes) { let s = ''; for (const x of bytes) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64urlBytes(str) { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)); const a = []; for (let i = 0; i < s.length; i++) a.push(s.charCodeAt(i)); return a; }
function openTA(cr) {
  G.taPet = cr;
  const p = Rec.pet(cr);
  const box = $('taCourses'); box.innerHTML = '';
  for (const id of RU.COURSE_IDS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'course';
    const ta = p && p.ta && p.ta[id];
    b.innerHTML = `<span class="cn">${fmtCourse(id)}</span><span class="pb">${ta ? 'ベスト ' + ta.toFixed(2) + '秒' : 'まだ'}</span>`;
    const cv = document.createElement('canvas'); cv.width = 360; cv.height = 120; drawCourseIcon(cv, id); b.appendChild(cv);
    b.onclick = () => startTA(cr, id);
    box.appendChild(b);
  }
  $('taNote').textContent = '';
  show('taScreen');
}
function startTA(cr, course) {
  const c2 = taCreature(cr);
  G.me = c2; G.meInfo = analyze(c2.strokes); G.mode = 'ta'; G.course = course;
  startRace([{ cr: c2, isMe: true }], course, TA_SEED[course], 'ta');
}
$('taAll4Btn').onclick = async () => {
  const cr = taCreature(G.taPet); if (!cr) return;
  const ts = RU.COURSE_IDS.map(c => timeAttack(cr.strokes, c, TA_SEED[c]));
  if (ts.some(x => x == null)) { toast('走りきれませんでした'); return; }
  const sum = Math.round(ts.reduce((a, b) => a + b, 0) * 1000) / 1000;
  $('taNote').textContent = `4種目の合計 ${sum.toFixed(2)}秒(${RU.COURSE_IDS.map((c, i) => fmtCourse(c) + ' ' + ts[i].toFixed(2)).join(' / ')})。送っています…`;
  try { const m = await Store.remote(); const r = await m.submitRank('all4', cr, sum, st => verifyTime('all4', st)); $('taNote').textContent += r.improved ? ' ランキングに登録しました' : ' (前のタイムの方が速いので、そのまま)'; G.rankTab = { course: 'all4', period: 'all' }; }
  catch (e) { $('taNote').textContent += e && e.busy ? ' いまは混み合っていてランキングに送れません(記録は端末に残ります)。' : ' ランキングに送れませんでした(ネットにつながっていないかも)。'; }
};
$('taBackBtn').onclick = () => { if (G.petId) openPet(G.petId) || openAlbum(); else goTitle(); };
$('taBtn').onclick = () => { if (G.me) openTA(G.me); };
async function submitTA(sc) {
  const e = sc.ents[sc.meIndex], t = sc.race.times[sc.meIndex];
  if (t == null) return;
  const add = (txt, c) => { const box = $('resBadges'); const d = document.createElement('span'); d.className = 'badge ' + (c || ''); d.textContent = txt; box.appendChild(d); box.classList.remove('hidden'); };
  try {
    const m = await Store.remote();
    const r = await m.submitRank(sc.course, e.cr, Math.round(t * 1000) / 1000, st => verifyTime(sc.course, st));
    add(r.improved ? 'ランキングに登録しました' : 'ランキングは前のタイムのまま', 'blue');
  } catch (err) { add(err && err.terms ? 'ランキングは利用規約に同意すると使えます' : err && err.busy ? 'いまは混み合っていてランキングに送れません' : 'ランキングに送れませんでした(オフラインかも)', ''); }
}

// ---------- ランキング ----------
// 送るのは絵(線)と名前とタイム。表示する時に、絵からもう一度走らせてタイムが合う物だけ出す(ズル対策)
const RANK_COURSES = ['track', 'obstacle', 'slope', 'water', 'all4'];
const RANK_PERIODS = [['d', '今日'], ['w', '今週'], ['all', '全期間']];
function verifyTime(course, strokes) {
  if (course === 'all4') { let s = 0; for (const c of RU.COURSE_IDS) { const t = timeAttack(strokes, c, TA_SEED[c]); if (t == null) return null; s += t; } return Math.round(s * 1000) / 1000; }
  return timeAttack(strokes, course, TA_SEED[course]);
}
async function openRank() {
  G.rankTab = G.rankTab || { course: 'track', period: 'd' };
  const tabs = (box, list, key) => {
    box.innerHTML = '';
    for (const [id, label] of list) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tab' + (G.rankTab[key] === id ? ' on' : ''); b.textContent = label; b.onclick = () => { G.rankTab[key] = id; openRank(); }; box.appendChild(b); }
  };
  tabs($('rankCourseTabs'), RANK_COURSES.map(c => [c, c === 'all4' ? '4種目合計' : fmtCourse(c)]), 'course');
  tabs($('rankPeriodTabs'), RANK_PERIODS, 'period');
  show('rankScreen');
  const ol = $('rankList'); ol.innerHTML = ''; $('rankMine').classList.add('hidden');
  $('rankStatus').textContent = '読みこみ中…';
  const myTurn = (G.rankSeq = (G.rankSeq || 0) + 1);
  try {
    const m = await Store.mod();
    const { course, period } = G.rankTab;
    const rows = await m.listRank(course, period, st => verifyTime(course, st));
    if (myTurn !== G.rankSeq) return;
    let shown = 0, dropped = 0, mine = null;
    for (const r of rows) {
      let cr = null; try { cr = m.unpackCreature(r.data); } catch (e) { }
      const tv = cr ? verifyTime(course, cr.strokes) : null;
      if (r.uid !== m.uid() && m.isBlocked({ uid: r.uid })) continue;
      if (tv == null || Math.abs(tv - r.t) > 0.002) { dropped++; continue; }
      if (shown >= (m.RANK_LIMIT || 50)) break;
      shown++;
      const li = document.createElement('li'); li.className = 'rk' + (r.uid === m.uid() ? ' me' : '') + (shown <= 3 ? ' top' + shown : '');
      const c = document.createElement('canvas'); c.width = 72; c.height = 56; drawThumb(c, cr);
      li.innerHTML = `<span class="no">${shown}</span>`; li.appendChild(c);
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name || '名なし'; li.appendChild(nm);
      const tm = document.createElement('span'); tm.className = 'tm'; tm.textContent = tv.toFixed(2) + '秒'; li.appendChild(tm);
      if (r.uid !== m.uid()) { const bk = document.createElement('button'); bk.className = 'tiny rkBlock'; bk.textContent = '見ない'; bk.onclick = () => { if (!confirm('この人の絵をこの端末ではもう出さないようにしますか?(みんなのらくがき・相手・ランキング)')) return; m.block({ uid: r.uid }); li.remove(); toast('この人の絵を出さないようにしました'); }; li.appendChild(bk); }
      ol.appendChild(li);
      if (r.uid === m.uid()) mine = { rank: shown, t: tv, name: r.name };
    }
    const label = RANK_PERIODS.find(p => p[0] === period)[1];
    $('rankStatus').textContent = (shown ? `${label}の上位 ${shown} 匹(みんなの端末で走らせ直して確かめたタイムだけ)` + (dropped ? ` / 合わない ${dropped} 件は出していません` : '') : `${label}はまだだれも記録していません。一番乗りのチャンス!`) + (rows.stale ? '。いまは混み合っているので少し前の表です' : '');
    const mb = $('rankMine');
    if (mine) { mb.innerHTML = `あなたは <b>${mine.rank}位</b>(${mine.name}・${mine.t.toFixed(2)}秒)`; mb.classList.remove('hidden'); }
    else { const my = await m.myRank(course, period).catch(() => null); if (my) { mb.innerHTML = `あなたの記録 ${my.t.toFixed(2)}秒(上位${m.RANK_LIMIT || 20}位の外)`; mb.classList.remove('hidden'); } }
  } catch (e) {
    console.error(e);
    const perm = /permission/i.test(String(e && (e.code || e.message)));
    $('rankStatus').textContent = e && e.busy ? BUSY_MSG + '。ひとりで走る・描く・共有はそのまま遊べます' : perm ? 'ランキングはただいま準備中です。ほかの遊びはそのまま遊べます' : 'いまはランキングを読みこめません(ネットにつながっていないかも)。ほかの遊びはそのまま遊べます';
  }
}
$('rankBtn').onclick = () => openRank();
$('rankBackBtn').onclick = () => goTitle();
$('rankJoinBtn').onclick = () => { const pets = Rec.list(); if (!pets.length) { toast('まず1匹描いて走らせてね'); startDraw('solo'); return; } toast('アルバムから走らせる子をえらんでね'); openAlbum(); };
$('retryBtn').onclick = () => {
  if (!G.lastRace) return;
  const r = G.lastRace;
  if (r.mode === 'ta') { startRace(r.ents, r.course, r.seed, 'ta'); return; }
  if (r.mode === 'gallery' && G.opponent) { runVs([G.opponent, G.me], r.course, newSeed(), 1, 'gallery'); return; }
  G.mode = 'solo'; G.course = r.course; soloRace();
};

loadAssets().then(() => {
  resize();
  buildColorButtons();
  Full.refreshUi();
  renderPad();
  setSound(SND.on);
  if (IMG.logo) { $('logoImg').src = 'assets/logo.png'; $('logoImg').classList.remove('hidden'); $('logoText').classList.add('hidden'); }
  goTitle();
  const h = readHash();
  if (!h && !TEST && !params.has('fresh')) Persist.restore();
  Persist.ready = true; Persist.save();
  if (h && h.challenge) showInvite(h.challenge);
  if (h && h.room) { $('mainMenu').classList.add('hidden'); $('vsMenu').classList.remove('hidden'); $('roomCodeInput').value = h.room; }
  requestAnimationFrame(loop);
  document.documentElement.dataset.ready = '1';
});
window.addEventListener('hashchange', () => { const h = readHash(); if (h && h.challenge) { goTitle(); showInvite(h.challenge); } });
