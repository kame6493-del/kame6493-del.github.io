// ハルの冒険 — 横スクロールアクション。素材は assets/sprites(素材集の1枚絵から切り抜き)、音は Kenney(CC0)と Juhani Junkala(CC0)。
'use strict';
const TILE = 48, VW = 960, VH = 540, ROWS = 12;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
let scale = 1;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const s = Math.min(innerWidth / VW, innerHeight / VH);
  cv.style.width = Math.floor(VW * s) + 'px';
  cv.style.height = Math.floor(VH * s) + 'px';
  cv.width = Math.round(VW * s * dpr);
  cv.height = Math.round(VH * s * dpr);
  scale = s * dpr;
}
addEventListener('resize', resize);
resize();

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ---------- 保存 ----------
// セーブは 3つの ファイル(1つめは 前の版と 同じ 名前なので そのまま 引きつぐ)
const SAVE_BASE = 'haru_save_v1';
let saveSlot = 1;
try { saveSlot = Number(localStorage.getItem('haru_slot') || 1) || 1; } catch (e) { /* 無視 */ }
const slotKey = n => n === 1 ? SAVE_BASE : SAVE_BASE + '_' + n;
let SAVE_KEY = slotKey(saveSlot);
const NEW_SAVE = () => ({ unlocked: 1, stars: {}, best: {}, sound: true, wallet: 0, full: false, bag: {}, cleared: {}, secret: {}, seen: {}, shards: {}, reserve: null, palace: {}, roads: null, starOpen: false });
let save = NEW_SAVE();
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* 保存が使えない環境でも遊べる */ }
// ---------- 課金(完全版)と店 ----------
// ワールド1(4面)は無料。完全版(買い切り)でワールド2・3が遊べる。
// アプリ版(Capacitor + RevenueCat の Purchases プラグイン)では本当に買える。ブラウザ版では買えないので案内を出す。
// 手元の試験だけは URL に ?dev=1 を付けると「テストで解放」が出る(本番では出ない)。
const FULL_PRICE = '¥480';
const DEV = false; // ネット版はテスト用のボタンを出さない
// 進みぐあい: クリアした面(save.cleared)と 見つけた ひみつのゴール(save.secret)で ちずの道が ひらく
function fixSave() {
  for (const k of ['cleared', 'secret', 'seen', 'stars', 'best', 'bag', 'shards', 'palace']) if (!save[k] || typeof save[k] !== 'object') save[k] = {};
  // 前の版の保存(unlocked の数)から クリア済みを 起こす
  if (save.unlocked > 1 && !Object.keys(save.cleared).length) for (let i = 0; i < save.unlocked - 1 && i < LEVELS.length; i++) save.cleared[LEVELS[i].id] = true;
  for (const id in save.stars) save.cleared[id] = true;
}
LEVELS.forEach(d => { if (!d.world) { d.world = Math.ceil(d.id / 4); d.num = (d.id - 1) % 4 + 1; } });
const LV_BY_ID = {}; LEVELS.forEach((d, i) => { LV_BY_ID[d.id] = i; });
// 面の 番号: ワールドの 道の 順に ふつうの面(みず・そら も)を 1,2,3… と ふる。とりで・おばけやしき・しんでん・しろ・ひみつ は 名前で
const KIND_LABEL = { fort: 'とりで', ghost: 'おばけ', switch: 'しんでん', boss: 'しろ' };
WORLDS.forEach((W, wi) => {
  let n = 0;
  W.nodes.forEach(nd => { const d = LEVELS[LV_BY_ID[nd.id]]; if (!d) return; d.world = W.n; d.kind = d.kind || nd.kind || (d.boss ? 'boss' : 'normal'); nd.kind = d.kind; if (d.boss) nd.boss = true; d.num = KIND_LABEL[d.kind] || String(++n); });
  for (const ex of W.extra || []) { const d = LEVELS[LV_BY_ID[ex.id]]; if (!d) continue; d.world = W.n; d.kind = d.kind || ex.kind || 'normal'; ex.kind = ex.kind || d.kind; d.num = ex.kind === 'secret' ? '★' : (KIND_LABEL[d.kind] || '★'); }
  if (W.star) W.nodes.forEach((nd, k) => { const d = LEVELS[LV_BY_ID[nd.id]]; if (d) { d.label = 'ほし' + (k + 1); } });
});
fixSave();
const isCleared = id => !!save.cleared[id];
const needsFull = i => LEVELS[i].world > 1 && !save.full;
const canPlay = i => isOpenId(LEVELS[i].id) && !needsFull(i);
const SHOP_ITEMS = [
  { key: 'heart', name: 'ハート +1', desc: 'つぎのステージで ハートが1つふえる', price: 150, img: 'ui_heart' },
  { key: 'shield', name: 'まもりのたて', desc: '1回だけ ダメージをふせぐ', price: 120, img: 'shield' },
  { key: 'magnet', name: 'コインじしゃく', desc: '30びょう コインをひきよせる', price: 80, img: 'p_magnet' },
  { key: 'jet', name: 'ジェットつばさ', desc: '20びょう 3だんジャンプ', price: 200, img: 'p_speed' },
];
let shopMsg = null;
const Store = {
  plugin() { const C = window.Capacitor; return C && C.Plugins && C.Plugins.Purchases; },
  async buyFull() {
    const Pur = this.plugin();
    if (Pur) {
      try {
        const offers = await Pur.getOfferings();
        const pkg = offers && offers.current && offers.current.availablePackages && offers.current.availablePackages[0];
        if (!pkg) throw new Error('no package');
        const r = await Pur.purchasePackage({ aPackage: pkg });
        if (r && r.customerInfo && r.customerInfo.entitlements.active.full) this.unlock();
      } catch (e) { if (!(e && e.userCancelled)) shopMsg = { text: 'こうにゅうできませんでした', t: 3 }; }
      return;
    }
    shopMsg = { text: 'この版では かえません', sub: 'アプリ版は じゅんびちゅうです', t: 3.5 };
  },
  async restore() {
    const Pur = this.plugin();
    if (Pur) {
      try { const r = await Pur.restorePurchases(); if (r && r.customerInfo && r.customerInfo.entitlements.active.full) { this.unlock(); return; } } catch (e) { /* 下で知らせる */ }
      shopMsg = { text: 'かったきろくが みつかりません', t: 3 }; return;
    }
    shopMsg = { text: 'この版では ふくげんできません', sub: 'アプリ版は じゅんびちゅうです', t: 3 };
  },
  unlock() { save.full = true; writeSave(); sfx('clear'); shopMsg = { text: '完全版に なりました!', sub: 'ワールド2から さきが あそべます', t: 3.5 }; },
};
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 無視 */ } }
function shardCount(id) { return ((save.shards || {})[id] || []).filter(Boolean).length; }
// セーブの ファイルを えらぶ(1〜3)
function selectSlot(n) {
  saveSlot = n; SAVE_KEY = slotKey(n);
  try { localStorage.setItem('haru_slot', String(n)); } catch (e) { /* 無視 */ }
  save = NEW_SAVE();
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* 無視 */ }
  fixSave();
}
function slotInfo(n) {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(slotKey(n)) || 'null'); } catch (e) { d = null; }
  if (!d || !(d.cleared || d.stars) || (!Object.keys(d.cleared || {}).length && !Object.keys(d.stars || {}).length && !(d.seen && d.seen.intro))) return null;
  const stars = Object.values(d.stars || {}).reduce((a, s2) => a + s2.filter(Boolean).length, 0);
  const shards = Object.values(d.shards || {}).reduce((a, s2) => a + s2.filter(Boolean).length, 0);
  const cl = Object.keys(d.cleared || {}).length;
  const at = whereIs(d.lastId || 1);
  return { stars, shards, cl, wallet: d.wallet || 0, world: at ? WORLDS[at.wi] : WORLDS[0], palace: d.palace || {} };
}

// ---------- 画像 ----------
const SPRITES = ['hero_idle', 'hero_run', 'hero_jump', 'hero_attack', 'goomy', 'shell', 'bee', 'bat', 'slime', 'ghost',
  'spiky', 'plant', 'turret', 'skeleton', 'firespirit', 'bomb', 'coin', 'coin_side', 'star', 'gem', 'heart', 'key',
  'potion', 'shield', 'brick', 'question', 'ground', 'cliff', 'floating', 'fence', 'crate', 'ladder', 'water', 'ice',
  'oneway', 'cloud', 'spring', 'movplat', 'lift', 'fallplat', 'checkpoint', 'goal', 'spikes', 'flame', 'saw', 'axe',
  'crusher', 'cannon', 'mushroom', 'door', 'lamp', 'sign', 'rocks', 'pillar', 'tree', 'torch', 'crystal',
  'ui_heart', 'ui_heart_empty', 'ui_coin', 'ui_star', 'conveyor',
  'p_boots', 'p_wing', 'p_1up', 'p_magnet', 'p_speed', 'thorn', 'zapper', 'antigrav', 'balloon', 'bubble', 'sand', 'eye', 'beetle', 'wizard', 'fish', 'orb', 'stoneblk', 'ladder2', 'lava',
  'metal', 'trampoline', 'booster', 'icicle', 'geyser', 'firebar', 'chest', 'bouncepad',
  'fan', 'switch', 'portal', 'boulder', 'disappear', 'plate', 'timer',
  'vine', 'rope', 'springy', 'cannon', 'bridge'];
const IMG = {};
let loaded = 0;
const total = SPRITES.length;
for (const n of SPRITES) {
  const im = new Image();
  im.onload = () => { loaded++; if (loaded === total) bakeTiles(); };
  // 読みこみに失敗したら 1回だけ やりなおす(それでも だめなら その絵なしで進める)
  im.onerror = () => { if (!im.retried) { im.retried = true; setTimeout(() => { im.src = 'assets/sprites/' + n + '.png?r=1'; }, 200); return; } loaded++; if (loaded === total) bakeTiles(); };
  im.src = 'assets/sprites/' + n + '.png';
  IMG[n] = im;
}

// ChatGPT で作る絵(game/assets/chatgpt/<名前>.png)。置いてあれば使い、なければ 今の素材の色替えで代わりに描く。
// 名前の一覧と頼み文は chatgpt_requests.md。既存の絵と同じ名前(例: beetle)を置くと その絵の差し替えになる。
const ART_NAMES = ['title_bg', 'title_logo', 'face_haru', 'face_pipi', 'face_maou', 'face_kabuto', 'face_yurei',
  'story_intro', 'story_w4', 'story_w5', 'story_ending',
  'map_w1', 'map_w2', 'map_w3', 'map_w4', 'map_w5', 'map_node', 'map_node_boss', 'map_node_secret',
  'bg_storm', 'bg_mansion', 'bg_crystal', 'bg_stormcastle', 'bg_dusk', 'bg_ghost', 'bg_fort', 'bg_ghostmansion',
  'boss_kabuto', 'boss_yurei', 'boss_slime', 'face_slime',
  // ワールド6〜8
  'face_queen', 'face_kage', 'story_w6', 'story_w7', 'story_w8', 'map_w6', 'map_w7', 'map_w8',
  'bg_jungle', 'bg_moon', 'bg_kage', 'bg_falls', 'bg_space', 'bg_kagecastle', 'boss_queen', 'boss_eye', 'boss_kage',
  'seed_block', 'vine_tile', 'zipline', 'note_block', 'star_cannon', 'comet', 'wheel_plat', 'bridge_plank', 'kage_haru',
  // 第4段階(スーパーマリオワールド風の 作り込み)
  'big_shard', 'goal_post', 'goal_tape', 'mid_gate', 'mid_gate_open', 'reserve_box', 'p_cape', 'cape_back', 'hero_spin', 'hero_fly',
  'moko_idle', 'moko_run', 'moko_eat', 'moko_wing', 'moko_egg', 'egg_block', 'cape_block', 'turn_block', 'silver_switch', 'silver_block',
  'throw_block', 'palace_switch', 'dot_y', 'dot_g', 'dot_b', 'dot_p', 'blk_y', 'blk_g', 'blk_b', 'blk_p', 'rail_plat', 'ball_chain', 'ceil_crusher', 'well',
  'en_mogura', 'en_nageko', 'en_kumo', 'en_fugu', 'en_oobake', 'boss_hone',
  'map_castle', 'map_castle_broken', 'map_fort', 'map_ghost', 'map_switch', 'map_warp', 'map_w9',
  'bg_underwater', 'file_card'];
const ART = {};
for (const n of ART_NAMES) {
  const im = new Image();
  im.onload = () => { if (im.naturalWidth) ART[n] = im; if (TB.groundTop && ['seed_block', 'vine_tile', 'note_block', 'egg_block', 'cape_block', 'turn_block', 'silver_block', 'blk_y', 'blk_g', 'blk_b', 'blk_p'].includes(n)) bakeTiles(); };
  im.onerror = () => {};
  im.src = 'assets/chatgpt/' + n + '.png';
}

// マス目の絵は 48px に焼いておく(毎フレームの縮小を避ける)
const TB = {};
function bake(name, w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w * 2; c.height = h * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  g.imageSmoothingQuality = 'high';
  try { fn(g, w, h); } catch (e) { /* 絵が読めなかったときは 空のまま */ }
  TB[name] = c;
}
function stoneBlock(g, w, h, base, hi, lo) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  g.fillStyle = hi; g.fillRect(0, 0, w, 5); g.fillRect(0, 0, 5, h);
  g.fillStyle = lo; g.fillRect(0, h - 5, w, 5); g.fillRect(w - 5, 0, 5, h);
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
  g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(10, 12, 8, 4); g.fillRect(28, 30, 10, 4);
}
function bakeTiles() {
  const gr = IMG.ground;
  bake('groundTop', TILE, TILE, (g, w, h) => g.drawImage(gr, 0, 0, gr.width, gr.height, -2, 0, w + 4, h + 2));
  bake('dirt', TILE, TILE, (g, w, h) => g.drawImage(gr, 0, gr.height * 0.48, gr.width, gr.height * 0.5, -2, 0, w + 4, h + 1));
  bake('brick', TILE, TILE, (g, w, h) => g.drawImage(IMG.brick, 0, 0, w, h));
  bake('question', TILE, TILE, (g, w, h) => g.drawImage(IMG.question, 0, 0, w, h));
  bake('used', TILE, TILE, (g, w, h) => {
    g.drawImage(IMG.question, 0, 0, w, h);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(120,80,40,.82)'; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(14, 14, w - 28, h - 28);
  });
  bake('crate', TILE, TILE, (g, w, h) => g.drawImage(IMG.crate, 0, 0, w, h));
  bake('ice', TILE, TILE, (g, w, h) => g.drawImage(IMG.ice, 0, 0, w, h));
  bake('water', TILE, TILE, (g, w, h) => { g.globalAlpha = 0.85; g.drawImage(IMG.water, 0, IMG.water.height * 0.25, IMG.water.width, IMG.water.height * 0.6, 0, 0, w, h); });
  bake('waterTop', TILE, TILE, (g, w, h) => { g.globalAlpha = 0.85; g.drawImage(IMG.water, 0, 0, IMG.water.width, IMG.water.height * 0.7, 0, 0, w, h); });
  bake('stone', TILE, TILE, (g, w, h) => stoneBlock(g, w, h, '#6d6a86', '#8f8cab', '#4a4762'));
  bake('caveTop', TILE, TILE, (g, w, h) => { stoneBlock(g, w, h, '#5b5574', '#7e78a0', '#3d3853'); g.fillStyle = '#8fe0ff'; g.globalAlpha = .35; g.fillRect(0, 0, w, 3); });
  bake('caveFill', TILE, TILE, (g, w, h) => stoneBlock(g, w, h, '#433d5a', '#55506f', '#2f2a42'));
  bake('lavaTop', TILE, TILE, (g, w, h) => { stoneBlock(g, w, h, '#5a3a33', '#7a5248', '#3a221d'); g.fillStyle = '#ff7a2a'; g.globalAlpha = .45; g.fillRect(0, 0, w, 3); });
  bake('lavaFill', TILE, TILE, (g, w, h) => stoneBlock(g, w, h, '#45292a', '#563535', '#2e1a1b'));
  bake('snowTop', TILE, TILE, (g, w, h) => { stoneBlock(g, w, h, '#9cc7e6', '#d6ecff', '#6f9cc0'); g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, 12); for (let x = w; x >= 0; x -= 8) g.lineTo(x, 10 + (x / 8 % 2) * 6); g.closePath(); g.fill(); });
  bake('snowFill', TILE, TILE, (g, w, h) => stoneBlock(g, w, h, '#7fa9cc', '#98bfe0', '#5d86aa'));
  bake('castleTop', TILE, TILE, (g, w, h) => stoneBlock(g, w, h, '#4b3d6b', '#6c5a96', '#2f2547'));
  bake('castleFill', TILE, TILE, (g, w, h) => stoneBlock(g, w, h, '#3a2f55', '#4a3d6b', '#261d3a'));
  bake('sandTop', TILE, TILE, (g, w, h) => { g.drawImage(IMG.sand, 0, 0, w, h); g.fillStyle = 'rgba(255,240,190,.5)'; g.fillRect(0, 0, w, 4); });
  bake('sandFill', TILE, TILE, (g, w, h) => { g.drawImage(IMG.sand, 0, 0, w, h); g.fillStyle = 'rgba(120,70,20,.35)'; g.fillRect(0, 0, w, h); });
  bake('factoryTop', TILE, TILE, (g, w, h) => { stoneBlock(g, w, h, '#4f5a73', '#6c7894', '#353d52'); for (let x = -8; x < w; x += 16) { g.fillStyle = '#ffcc33'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 8, 0); g.lineTo(x + 2, 7); g.lineTo(x - 6, 7); g.fill(); } });
  bake('factoryFill', TILE, TILE, (g, w, h) => stoneBlock(g, w, h, '#3a4256', '#4a546c', '#2a3040'));
  bake('thorn', TILE, TILE, (g, w, h) => g.drawImage(IMG.thorn, -2, -4, w + 4, h + 4));
  bake('sand', TILE, TILE, (g, w, h) => g.drawImage(IMG.sand, 0, 0, w, h));
  bake('metal', TILE, TILE, (g, w, h) => g.drawImage(IMG.metal, 0, 0, w, h));
  bake('ladder', TILE, TILE, (g, w, h) => g.drawImage(IMG.ladder2, 6, -2, w - 12, h + 4));
  bake('conveyor', TILE, TILE, (g, w, h) => { const im = IMG.conveyor; g.drawImage(im, im.width * 0.3, 0, im.width * 0.4, im.height, 0, 6, w, h - 6); });
  bake('spikes', TILE, TILE, (g, w, h) => g.drawImage(IMG.spikes, 0, h * 0.3, w, h * 0.7));
  bake('plank', TILE, TILE, (g, w, h) => g.drawImage(IMG.oneway, IMG.oneway.width * 0.05, 0, IMG.oneway.width * 0.3, IMG.oneway.height * 0.38, 0, 0, w, 20));
  // ワールド4: 赤と青のブロックは鉄のブロックの色替え。スイッチは素材集のボタン(左が赤・右が青)を石のブロックに乗せる
  const tint = (name, src, col, sx = 0, sy = 0, sw = src.width, sh = src.height) => bake(name, TILE, TILE, (g, w, h) => {
    g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = col; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
  });
  tint('redBlk', IMG.metal, 'rgba(255,40,70,.55)');
  tint('blueBlk', IMG.metal, 'rgba(40,110,255,.55)');
  const sw = IMG.switch;
  bake('swRed', TILE, TILE, (g, w, h) => { g.drawImage(IMG.stoneblk, 0, 0, w, h); g.drawImage(sw, 0, 0, sw.width * 0.5, sw.height, 0, 0, w, h); });
  bake('swBlue', TILE, TILE, (g, w, h) => { g.drawImage(IMG.stoneblk, 0, 0, w, h); g.drawImage(sw, sw.width * 0.5, 0, sw.width * 0.5, sw.height, 0, 0, w, h); });
  bake('stormTop', TILE, TILE, (g, w, h) => { g.drawImage(TB.groundTop, 0, 0, w, h); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(30,40,80,.35)'; g.fillRect(0, 0, w, h); });
  bake('stormFill', TILE, TILE, (g, w, h) => { g.drawImage(TB.dirt, 0, 0, w, h); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(30,40,80,.4)'; g.fillRect(0, 0, w, h); });
  bake('mansionTop', TILE, TILE, (g, w, h) => { stoneBlock(g, w, h, '#8a5a34', '#b07a4a', '#5a3818'); g.fillStyle = '#c0304a'; g.fillRect(0, 0, w, 7); g.fillStyle = '#ffd36b'; g.fillRect(0, 7, w, 2); });
  bake('mansionFill', TILE, TILE, (g, w, h) => stoneBlock(g, w, h, '#6e4426', '#83543a', '#4a2c14'));
  bake('crystalTop', TILE, TILE, (g, w, h) => { stoneBlock(g, w, h, '#3b4f8a', '#5a74c0', '#26335c'); g.fillStyle = '#9ff4ff'; g.globalAlpha = .55; g.fillRect(0, 0, w, 3); });
  bake('crystalFill', TILE, TILE, (g, w, h) => stoneBlock(g, w, h, '#2d3b6b', '#3c4c85', '#1d2647'));
  // ワールド6〜8(素材の色替え。ChatGPT の絵 seed_block / vine_tile / note_block があれば そちらを使う)
  const artTile = (name, fb) => bake(name, TILE, TILE, (g, w, h) => { if (ART[name]) g.drawImage(ART[name], 0, 0, w, h); else fb(g, w, h); });
  artTile('seed_block', (g, w, h) => { g.drawImage(IMG.question, 0, 0, w, h); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(40,200,60,.5)'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over'; const v = IMG.vine; g.drawImage(v, v.width * 0.42, v.height * 0.05, v.width * 0.2, v.height * 0.5, w * 0.3, h * 0.1, w * 0.4, h * 0.8); });
  artTile('vine_tile', (g, w, h) => { const v = IMG.vine; g.drawImage(v, v.width * 0.4, 0, v.width * 0.24, v.height * 0.9, 4, -2, w - 8, h + 4); });
  artTile('note_block', (g, w, h) => { g.drawImage(IMG.springy, 2, 0, w - 4, h); });
  bake('jungleTop', TILE, TILE, (g, w, h) => { g.drawImage(TB.groundTop, 0, 0, w, h); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(0,90,40,.3)'; g.fillRect(0, 0, w, h); });
  bake('jungleFill', TILE, TILE, (g, w, h) => { g.drawImage(TB.dirt, 0, 0, w, h); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(40,30,0,.3)'; g.fillRect(0, 0, w, h); });
  bake('moonTop', TILE, TILE, (g, w, h) => { stoneBlock(g, w, h, '#8a86a8', '#b8b4d6', '#5e5a7c'); g.fillStyle = 'rgba(60,50,90,.35)'; g.beginPath(); g.ellipse(14, 24, 7, 4, 0, 0, 7); g.ellipse(34, 36, 5, 3, 0, 0, 7); g.fill(); g.fillStyle = '#e8e4ff'; g.fillRect(0, 0, w, 3); });
  bake('moonFill', TILE, TILE, (g, w, h) => stoneBlock(g, w, h, '#64607e', '#78749a', '#46425e'));
  bake('kageTop', TILE, TILE, (g, w, h) => { stoneBlock(g, w, h, '#3a2a52', '#5a4480', '#22183a'); g.fillStyle = '#ffd84a'; g.globalAlpha = .5; g.fillRect(0, 0, w, 2); });
  bake('kageFill', TILE, TILE, (g, w, h) => stoneBlock(g, w, h, '#261c3a', '#33264c', '#170f26'));
  // 第4段階: たまごブロック・マントの ハテナ・くるくるブロック・ぎんの ブロック・しんでんの ブロック(ChatGPT の 絵が あれば それ)
  artTile('egg_block', (g, w, h) => { g.drawImage(IMG.question, 0, 0, w, h); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,120,190,.45)'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#fff6f0'; g.strokeStyle = '#4a2a3a'; g.lineWidth = 2; g.beginPath(); g.ellipse(w / 2, h / 2 + 2, 9, 12, 0, 0, 7); g.fill(); g.stroke(); });
  artTile('cape_block', (g, w, h) => { g.drawImage(IMG.question, 0, 0, w, h); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(150,80,255,.5)'; g.fillRect(0, 0, w, h); });
  bake('turn_block', TILE, TILE, (g, w, h) => { if (ART.turn_block) { g.drawImage(ART.turn_block, 0, 0, w, h); return; } stoneBlock(g, w, h, '#f0b030', '#ffd870', '#b07810'); g.strokeStyle = 'rgba(90,50,0,.6)'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, 10, 0.3, 5.6); g.stroke(); g.beginPath(); g.arc(w / 2, h / 2, 4, 0, 7); g.stroke(); });
  bake('silver', TILE, TILE, (g, w, h) => { if (ART.silver_block) { g.drawImage(ART.silver_block, 0, 0, w, h); return; } stoneBlock(g, w, h, '#b8c4d4', '#eef4ff', '#7a8698'); g.fillStyle = '#e8ecf4'; g.beginPath(); g.ellipse(w / 2, h / 2, 8, 12, 0, 0, 7); g.fill(); g.strokeStyle = '#7a8698'; g.lineWidth = 2; g.stroke(); });
  for (const [c, base, hi2, lo] of [['y', '#e8b820', '#ffe070', '#a07c08'], ['g', '#3cb84a', '#7ae286', '#1f7a2a'], ['b', '#2a9ae0', '#7ad0ff', '#14609a'], ['p', '#8a4ad8', '#c08aff', '#5a2a9a']]) {
    bake('blk_' + c, TILE, TILE, (g, w, h) => { if (ART['blk_' + c]) { g.drawImage(ART['blk_' + c], 0, 0, w, h); return; } stoneBlock(g, w, h, base, hi2, lo); g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); for (let a = 0; a < 10; a++) { const r2 = a % 2 ? 5 : 11, an = -Math.PI / 2 + a * Math.PI / 5; g.lineTo(w / 2 + Math.cos(an) * r2, h / 2 + Math.sin(an) * r2); } g.closePath(); g.fill(); });
  }
}

// ---------- 音 ----------
const SFX_NAMES = ['jump', 'jump2', 'coin', 'coins', 'stomp', 'swing', 'hit', 'hurt', 'powerup', 'star', 'bump', 'break', 'item', 'spring',
  'checkpoint', 'key', 'door', 'select', 'click', 'pause', 'clear', 'die', 'gameover', 'fire', 'shield', 'firework', 'dash', 'boom', 'oneup'];
const VOL = { jump: .45, jump2: .45, coin: .4, coins: .5, stomp: .7, swing: .4, hit: .6, hurt: .7, bump: .5, break: .6, fire: .35, click: .5, select: .55, clear: .8, firework: .35, dash: .45, boom: .6 };
let actx = null;
const sfxBuf = {};
let bgmEl = null, bgmName = '';
function initAudio() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    for (const n of SFX_NAMES) {
      fetch('assets/sfx/' + n + '.mp3').then(r => r.arrayBuffer()).then(b => actx.decodeAudioData(b)).then(buf => { sfxBuf[n] = buf; }).catch(() => {});
    }
  } catch (e) { actx = null; }
}
// 同じ音が ほぼ同時に 何度も鳴ると 大きく 割れるので、40ms 以内の 同じ音は 1つに まとめる
const sfxLast = {};
function sfx(n, rate = 1) {
  if (!save.sound || !actx || !sfxBuf[n]) return;
  const now = actx.currentTime;
  if (sfxLast[n] !== undefined && now - sfxLast[n] < 0.04) return;
  sfxLast[n] = now;
  const s = actx.createBufferSource();
  s.buffer = sfxBuf[n];
  s.playbackRate.value = rate;
  const g = actx.createGain();
  g.gain.value = VOL[n] ?? 0.6;
  s.connect(g).connect(actx.destination);
  s.start();
}
function bgm(name) {
  if (bgmName === name && bgmEl) { if (save.sound && bgmEl.paused) bgmEl.play().catch(() => {}); return; }
  if (bgmEl) { bgmEl.pause(); }
  bgmName = name;
  if (!name) { bgmEl = null; return; }
  bgmEl = new Audio('assets/sfx/' + name + '.mp3');
  bgmEl.loop = name !== 'bgm_end' || true;
  bgmEl.volume = 0.42;
  if (save.sound) bgmEl.play().catch(() => {});
}
function setSound(on) {
  save.sound = on; writeSave();
  if (bgmEl) { if (on) bgmEl.play().catch(() => {}); else bgmEl.pause(); }
}

// ---------- 入力 ----------
const keys = {};
const pressed = {};
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyZ: 'jump', KeyK: 'jump', KeyX: 'attack', KeyJ: 'attack', KeyC: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash', KeyL: 'dash', Escape: 'pause', KeyP: 'pause', Enter: 'ok',
  KeyV: 'spin', KeyI: 'spin', KeyQ: 'item', KeyE: 'item', Backspace: 'item',
};
addEventListener('keydown', e => {
  const k = KEYMAP[e.code];
  if (!k) return;
  e.preventDefault();
  initAudio();
  usingTouch = false;
  if (!keys[k]) pressed[k] = true;
  keys[k] = true;
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });

let usingTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const pointers = new Map();
let uiButtons = [];
function canvasPos(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * VW, y: (e.clientY - r.top) / r.height * VH };
}
const TOUCH = {
  left: { x: 84, y: 470, r: 50 }, right: { x: 204, y: 470, r: 50 },
  attack: { x: 752, y: 476, r: 46 }, jump: { x: 870, y: 436, r: 58 }, dash: { x: 772, y: 366, r: 40 }, spin: { x: 650, y: 488, r: 34 },
};
function touchButtonAt(p) {
  for (const [k, b] of Object.entries(TOUCH)) {
    if (k === 'dash' && !hasPower('dash') && !nearCarry()) continue;
    if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 14) return k;
  }
  // 左右の帯はゆるく取る(指がずれても動けるように)
  if (p.y > 340 && p.x < 300) return p.x < 154 ? 'left' : 'right';
  return null;
}
function refreshTouchKeys() {
  const held = new Set([...pointers.values()].filter(Boolean));
  for (const k of ['left', 'right', 'jump', 'attack', 'dash', 'spin']) {
    const on = held.has(k);
    if (on && !touchKeys[k]) pressed[k] = true;
    touchKeys[k] = on;
  }
}
const touchKeys = { left: false, right: false, jump: false, attack: false, dash: false, spin: false };
cv.addEventListener('pointerdown', e => {
  e.preventDefault();
  initAudio();
  if (e.pointerType === 'touch') usingTouch = true;
  const p = canvasPos(e);
  for (const b of uiButtons) {
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { sfx('click'); b.fn(); return; }
  }
  if (scene === 'title') { openFiles(); return; }
  if (scene === 'ending' && titleT > 2) { goMap(); return; }
  if (scene === 'story') { storyNext(); return; }
  if (scene === 'play' && usingTouch) {
    pointers.set(e.pointerId, touchButtonAt(p));
    refreshTouchKeys();
    cv.setPointerCapture(e.pointerId);
  }
});
cv.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, touchButtonAt(canvasPos(e)));
  refreshTouchKeys();
});
const endPointer = e => { pointers.delete(e.pointerId); refreshTouchKeys(); };
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
const held = k => keys[k] || touchKeys[k];
function consume(k) { const v = pressed[k]; pressed[k] = false; return v; }

// ---------- 面を組み立てる ----------
let level = null;
function buildLevel(def) {
  const tiles = [];
  for (let y = 0; y < ROWS; y++) tiles.push([]);
  const ents = [];
  const decos = [];
  let maxX = 0;
  const set = (x, y, ch) => { if (y < 0 || y >= ROWS || x < 0) return; tiles[y][x] = ch; maxX = Math.max(maxX, x); };
  // @ 大きな ほしの かけら / t なげブロック / & ぎんの スイッチ / y もこりゅう(はじめから いる)/ ! しんでんの スイッチ
  const ENT = 'o*hpkgPCGTmFwbnucY><Jf$@t&y!';
  let starIdx = 0;
  const put = (x, y, ch) => {
    if (ENT.includes(ch)) {
      maxX = Math.max(maxX, x);
      const e = { kind: ch, x, y };
      if (ch === '*') e.idx = starIdx++;
      ents.push(e);
    } else set(x, y, ch);
  };
  const L = {
    ground(x0, x1, top = 10) { for (let x = x0; x <= x1; x++) for (let y = top; y < ROWS; y++) set(x, y, '#'); },
    put, maxX: () => maxX,
    row(x, y, s) { for (let i = 0; i < s.length; i++) if (s[i] !== ' ') put(x + i, y, s[i]); },
    deco(x, name, h) { decos.push({ x, name, h }); },
    enemy(x, kind, opt = {}) { ents.push({ kind: 'enemy', type: kind, x, y: opt.y, opt }); maxX = Math.max(maxX, x); },
    mover(x, y, type, opt = {}) { ents.push({ kind: 'mover', type, x, y, opt }); },
    hazard(x, type, opt = {}) { ents.push({ kind: 'hazard', type, x, y: opt.y, opt }); },
    door(x, y) { ents.push({ kind: 'door', x, y }); },
    hint(x, text, sub = '') { ents.push({ kind: 'hint', x, y: 0, text, sub }); },
    // いど(↓で 入る): (x,gy) の 地面の 上 → (tx,ty) の 地面の 上。back=true なら かえりの いども 置く
    well(x, gy, tx, ty, back = true) { ents.push({ kind: 'well', x, y: gy, to: [tx, ty] }); if (back) ents.push({ kind: 'well', x: tx, y: ty, to: [x, gy], back: true }); maxX = Math.max(maxX, x, tx); },
    // おばけやしきの とびら(↑で 入る): 2つで 1組
    wdoor(x, y, tx, ty) { ents.push({ kind: 'wdoor', x, y, to: [tx, ty] }); ents.push({ kind: 'wdoor', x: tx, y: ty, to: [x, y] }); maxX = Math.max(maxX, x, tx); },
    // ワープ: (x,y) のマスにさわると (tx,ty) へ。one=true なら行きだけ(出口はとびこめない)。y は足元の1つ上の行
    portal(x, y, tx, ty, opt = {}) {
      ents.push({ kind: 'portal', x, y, to: [tx, ty], hue: opt.hue || 0, exit: false });
      ents.push({ kind: 'portal', x: tx, y: ty, to: [x, y], hue: opt.hue || 0, exit: !!opt.one });
      maxX = Math.max(maxX, x, tx);
    },
    wall(x, y0, y1, ch = 'S') { for (let y = y0; y <= y1; y++) set(x, y, ch); },
    ceiling(x0, x1, rows) { for (let x = x0; x <= x1; x++) for (let y = 0; y < rows; y++) set(x, y, 'S'); },
    lava(x0, x1, top = 10) { for (let x = x0; x <= x1; x++) for (let y = top; y < ROWS; y++) set(x, y, 'V'); },
    water(x0, x1, top = 9, bottom = ROWS - 2) { for (let x = x0; x <= x1; x++) for (let y = top; y <= bottom; y++) set(x, y, 'W'); },
    ladder(x, y0, y1) { for (let y = y0; y <= y1; y++) set(x, y, 'L'); },
    fill(x0, x1, y0, y1, ch) { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) set(x, y, ch); },
    stairs(x, top, n, dir, ch = '#') {
      for (let i = 0; i < n; i++) { const hgt = i + 1; for (let k = 0; k < hgt; k++) set(x + i, top - 1 - k, ch); }
    },
  };
  def.build(L);
  const W = maxX + 6;
  placeShards(def, ents, tiles, W);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < W; x++) if (!tiles[y][x]) tiles[y][x] = ' ';
  // 天井の飾りを残すため、天井は面の幅に合わせて切る
  const hasBlink = tiles.some(r => r.includes('3') || r.includes('4'));
  return { def, tiles, ents, decos, W, hasBlink };
}

// 大きな ほしの かけら(1面に 5まい)。面の データに @ が なければ、面を 5つに わけて それぞれの いちばん 高い コインを かけらに かえる
// (コインは 取れる 場所に 置いてあるので、かけらも かならず 取れる。高い 所ほど 見つけにくい)。コインが なければ 足場の 上に 置く
function placeShards(def, ents, tiles, W) {
  if (def.noShards) return;
  const isS = (x, y) => y >= 0 && y < ROWS && x >= 0 && x < W && tiles[y][x] !== undefined && SOLID.has(tiles[y][x]);
  const boss = ents.find(e => e.kind === 'enemy' && ENEMY[e.type] && ENEMY[e.type].boss);
  const goal = ents.find(e => e.kind === 'G');
  const xEnd = boss ? boss.opt.arena[0] - 2 : goal ? goal.x - 6 : W - 10, xStart = 12;
  let seed = def.id * 977 + 13; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const seg = (xEnd - xStart) / 5;
  for (let r = 0; r < 5; r++) {
    const a = xStart + seg * r, b = a + seg;
    if (ents.some(e => e.kind === '@' && e.x >= a && e.x < b)) continue;
    const near = e => ents.some(s2 => (s2.kind === '*' || s2.kind === '@') && Math.abs(s2.x - e.x) < 3 && Math.abs(s2.y - e.y) < 3);
    const coins = ents.filter(e => e.kind === 'o' && e.x >= a && e.x < b && e.y >= 2 && !near(e));
    if (coins.length) {
      let best = null, bs = 1e9;
      for (const c of coins) { const sc = c.y * 10 + R() * 6; if (sc < bs) { bs = sc; best = c; } }
      best.kind = '@';
      continue;
    }
    // コインが ない: まんなかから さがして、立てる 所の 2つ上(ジャンプで とどく)
    for (let k = 0; k < seg; k++) {
      const x = Math.floor(a + seg / 2 + (k % 2 ? -1 : 1) * Math.ceil(k / 2));
      let gy = -1; for (let y = 3; y < ROWS; y++) if (isS(x, y)) { gy = y; break; }
      if (gy < 4 || isS(x, gy - 1) || isS(x, gy - 2) || isS(x, gy - 3)) continue;
      ents.push({ kind: '@', x, y: Math.max(2, gy - 3) }); break;
    }
  }
  ents.filter(e => e.kind === '@').sort((p, q) => p.x - q.x).forEach((e, i) => { e.idx = i; });
}

// ---------- 地形の判定 ----------
// % スイッチ(下から叩くか剣で 赤⇔青 が入れかわる) / 1 赤ブロック(はじめは出ている) / 2 青ブロック(はじめは消えている)
// N たねブロック(たたくと つるが のびる) / 7 はねる ブロック(のると ぽーんと はねる)
// e たまごブロック(もこりゅう) / q マントの ハテナ / j くるくるブロック(たたくと まわって とおれる) / z ぎんの ブロック(ぎんの スイッチの 間だけ)
// 6 8 9 0 しんでんの 点線ブロック(きいろ・みどり・みずいろ・むらさき。しんでんの スイッチを おすと 出る)
const SOLID = new Set(['#', 'B', 'S', 'I', 'X', '?', 'H', 'Q', 'U', 'M', '}', '{', 'K', 'D', 'A', 'E', 'R', '%', 'O', 'N', '7', 'e', 'q', 'j', 'z']);
const PALACE_TILE = { '6': 'y', '8': 'g', '9': 'b', '0': 'p' };
function tileAt(tx, ty) {
  if (ty < 0) return ' ';
  if (ty >= ROWS || tx < 0 || tx >= level.W) return tx < 0 ? 'S' : ' ';
  return level.tiles[ty][tx];
}
// 3・4 じかんで きえる ブロック(2びょうごとに 入れかわる) / 5 じかんスイッチの とびら(ふむと しばらく ひらく) / O ひかりブロック
const blinkPhase = () => (world ? Math.floor(world.time / 2) % 2 : 0);
const isSolid = (tx, ty) => {
  const c = tileAt(tx, ty);
  if (c === '1') return !(world && world.sw);
  if (c === '2') return !!(world && world.sw);
  if (c === '3') return blinkPhase() === 0;
  if (c === '4') return blinkPhase() === 1;
  if (c === '5') return !(world && world.gateT > 0);
  if (c === 'j') return !(world && world.spinBlk && world.spinBlk[tx + ',' + ty] > 0);
  if (PALACE_TILE[c]) return !!save.palace[PALACE_TILE[c]];
  return SOLID.has(c);
};
// 出てきたブロックに 主人公が 重なったら 上へ 押し出す
function pushOutOf(chars) {
  const p = P;
  const x0 = Math.floor((p.x + 2) / TILE), x1 = Math.floor((p.x + p.w - 2) / TILE), y0 = Math.floor(p.y / TILE), y1 = Math.floor((p.y + p.h - 1) / TILE);
  let top = null;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (chars.includes(tileAt(x, y)) && isSolid(x, y)) top = top === null ? y : Math.min(top, y);
  if (top !== null) { p.y = top * TILE - p.h; p.vy = Math.min(p.vy, 0); }
}
function overlapsTile(chars) {
  const p = P;
  const x0 = Math.floor((p.x + 2) / TILE), x1 = Math.floor((p.x + p.w - 2) / TILE), y0 = Math.floor(p.y / TILE), y1 = Math.floor((p.y + p.h - 1) / TILE);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (chars.includes(tileAt(x, y))) return true;
  return false;
}
// L はしご / Z まめの つる(たねブロックを たたくと のびる。はしごと 同じ)
const isLadder = c => c === 'L' || c === 'Z';
const isOneWay = (tx, ty) => { const c = tileAt(tx, ty); return c === '=' || c === '~' || (isLadder(c) && !isLadder(tileAt(tx, ty - 1))); };

// ---------- ゲームの状態 ----------
let scene = 'title';
let world = null; // 遊んでいる面の中身
let P = null;     // 主人公
let cam = { x: 0, y: 0, shake: 0 };
let parts = [];
let toast = null;
let titleT = 0;
let clearInfo = null;
let pauseSel = 0;

const stageLabel = d => d.label || `${d.world}-${d.num}`;
function startLevel(idx, fromCheckpoint = false) {
  const def = LEVELS[idx];
  level = buildLevel(def);
  const keep = fromCheckpoint && world ? { cp: world.checkpoint, coins: world.cpCoins || 0, score: world.cpScore || 0, stars: world.cpStars || [false, false, false], shards: world.cpShards || [false, false, false, false, false], time: world.time, deaths: world.deaths + 1, cpIdx: world.cpIdx, cpCoins: world.cpCoins || 0, cpScore: world.cpScore || 0, cpStars: world.cpStars, cpShards: world.cpShards, maxHearts: world.cpMaxHearts || baseHearts(), powers: world.cpPowers || [], cpPowers: world.cpPowers } : null;
  world = {
    idx, def, ents: [], coins: 0, score: 0, stars: [false, false, false], shards: [false, false, false, false, false], time: 0, deaths: 0, keyHeld: false,
    checkpoint: null, cpIdx: -1, clear: false, clearT: 0, bumps: new Map(), spawned: new Set(), spinBlk: {}, introT: fromCheckpoint ? 0 : 1.25,
  };
  let start = { x: 2 * TILE, y: 9 * TILE };
  for (const e of level.ents) {
    const o = spawn(e);
    if (o) world.ents.push(o);
    if (e.kind === 'P') start = { x: e.x * TILE + 10, y: (e.y + 1) * TILE - 54 };
  }
  if (keep) {
    Object.assign(world, { coins: keep.coins, score: keep.score, stars: [...keep.stars], shards: [...keep.shards], time: keep.time, deaths: keep.deaths, checkpoint: keep.cp, cpIdx: keep.cpIdx, cpCoins: keep.cpCoins, cpScore: keep.cpScore, cpStars: keep.cpStars, cpShards: keep.cpShards, cpMaxHearts: keep.maxHearts, cpPowers: keep.cpPowers });
    // 取った星・かけらは出さない。通った中間旗は立てたまま
    world.ents = world.ents.filter(o => !(o.t === 'star' && keep.stars[o.idx]) && !(o.t === 'shard' && keep.shards[o.idx]));
    for (const o of world.ents) if (o.t === 'checkpoint' && o.idx <= keep.cpIdx) o.on = true;
    if (keep.cp) start = { x: keep.cp.x, y: keep.cp.y };
  }
  P = {
    x: start.x, y: start.y, w: 28, h: 54, vx: 0, vy: 0, face: 1, onGround: false, coyote: 0, jumpBuf: 0,
    attackT: 0, attackCD: 0, inv: 0, hearts: 3, maxHearts: 3, shield: false, dead: false, deadT: 0, anim: 0,
    standOn: null, wasGround: false, swim: false, hitIds: new Set(), squash: 1,
    airJumps: 0, climb: false, bootsT: 0, magnetT: 0, boostT: 0, jetT: 0, dashT: 0, dashCD: 0, airDash: 1, lockT: 0, wallSlide: 0, gliding: false, powers: [], keptOnce: false,
    spin: false, runM: 0, fly: null, mount: null, mountCD: 0, carry: null,
  };
  P.maxHearts = baseHearts(); P.hearts = P.maxHearts;
  if (perkOn(3)) P.shield = true;
  if (keep) { P.maxHearts = keep.maxHearts; P.hearts = keep.maxHearts; P.powers = [...(keep.powers || [])]; P.inv = 1.2; }
  // おたすけ: 同じ面で 4回 やられたら、たてを 持って やりなおす(小さい子でも 先へ すすめるように)
  if (keep && keep.deaths >= 4 && !P.shield) { P.shield = true; toast = { text: 'おたすけ たて!', sub: '1回だけ ダメージを ふせいでくれるよ', t: 2.4 }; }
  if (!fromCheckpoint && save.bag) {
    const used = [];
    if (save.bag.heart > 0) { save.bag.heart--; P.maxHearts = Math.min(6, P.maxHearts + 1); P.hearts = P.maxHearts; used.push('ハート+1'); }
    if (save.bag.shield > 0) { save.bag.shield--; P.shield = true; used.push('たて'); }
    if (save.bag.magnet > 0) { save.bag.magnet--; P.magnetT = 30; used.push('じしゃく'); }
    if (save.bag.jet > 0) { save.bag.jet--; P.jetT = 20; used.push('ジェットつばさ'); }
    if (used.length) { writeSave(); toast = { text: toast ? toast.text : '', sub: 'つかった: ' + used.join('・'), t: 3.2 }; }
  }
  if (def.auto) { world.auto = { x: fromCheckpoint && keep && keep.cp ? Math.max(0, keep.cp.x - 200) : 0, sp: def.auto }; }
  cam.fx = undefined; cam.lookT = undefined; camSnap();
  parts = [];
  scene = 'play';
  bgm(def.bgm);
  if (!fromCheckpoint) {
    toast = { text: `${stageLabel(def)}  ${def.name}`, sub: idx === 0 ? (usingTouch ? '左下でいどう / ジャンプ / けん' : '←→ いどう   スペース ジャンプ   X けん') : 'ほしを3つあつめよう', t: 3.2 };
  } else if (!(keep && keep.deaths >= 4 && toast && toast.text === 'おたすけ たて!')) {
    toast = null;
  }
}

function groundYBelow(tx, fromRow = 0) {
  for (let y = fromRow; y < ROWS; y++) if (isSolid(tx, y)) return y;
  return ROWS;
}

const ENEMY = {
  goomy: { w: 40, h: 36, img: 'goomy', dh: 44, speed: 55, stomp: true, sword: true, walker: true, score: 100 },
  shell: { w: 40, h: 36, img: 'shell', dh: 44, speed: 45, stomp: true, sword: true, walker: true, score: 100, edge: true },
  bee: { w: 38, h: 34, img: 'bee', dh: 48, stomp: true, sword: true, fly: true, score: 150 },
  bat: { w: 44, h: 30, img: 'bat', dh: 40, stomp: true, sword: true, fly: true, score: 150 },
  slime: { w: 40, h: 30, img: 'slime', dh: 38, stomp: true, sword: true, score: 120 },
  ghost: { w: 40, h: 40, img: 'ghost', dh: 50, stomp: false, sword: true, fly: true, score: 200 },
  spiky: { w: 40, h: 34, img: 'spiky', dh: 46, speed: 40, stomp: false, sword: true, walker: true, score: 150, edge: true },
  plant: { w: 34, h: 64, img: 'plant', dh: 80, stomp: false, sword: true, score: 200 },
  turret: { w: 46, h: 40, img: 'turret', dh: 44, stomp: false, sword: false, solid: true, score: 0 },
  skeleton: { w: 34, h: 50, img: 'skeleton', dh: 62, speed: 45, stomp: true, sword: true, walker: true, score: 250, edge: true },
  firespirit: { w: 34, h: 36, img: 'firespirit', dh: 50, stomp: false, sword: true, score: 200 },
  bomb: { w: 38, h: 36, img: 'bomb', dh: 46, speed: 50, stomp: true, sword: true, walker: true, score: 150, edge: true },
  eye: { w: 40, h: 34, img: 'eye', dh: 46, stomp: true, sword: true, fly: true, score: 150 },
  beetle: { w: 46, h: 36, img: 'beetle', dh: 46, speed: 38, stomp: true, sword: false, walker: true, edge: true, score: 250 },
  wizard: { w: 40, h: 60, img: 'wizard', dh: 74, stomp: true, sword: true, score: 500 },
  fish: { w: 40, h: 34, img: 'fish', dh: 46, stomp: false, sword: true, score: 200 },
  orb: { w: 40, h: 40, img: 'orb', dh: 58, stomp: false, sword: false, fly: true, score: 0 },
  boss: { w: 64, h: 100, img: 'wizard', dh: 130, stomp: true, sword: true, score: 5000, boss: true, name: 'まおう' },
  // ワールド4のボス: カブトムシの絵を大きくして色を変えたもの。突進して壁にぶつかると目を回す
  // ワールド1のボス: スライムの絵を大きくしたもの。はねて ちかづき、ときどき 大ジャンプ(着地の場所に かげ)。いつでも ふめる(はじめての ボス)
  slimeking: { w: 104, h: 74, img: 'slime', dh: 96, stomp: true, sword: true, score: 4000, boss: true, name: 'スライム大王' },
  kabuto: { w: 112, h: 72, img: 'beetle', dh: 104, stomp: true, sword: true, score: 6000, boss: true, name: 'おおカブト' },
  // ワールド5のボス: おばけの絵を大きくしたもの。ひかりブロックで 目を回させてから こうげき
  yurei: { w: 84, h: 84, img: 'ghost', dh: 118, stomp: true, sword: true, score: 7000, boss: true, name: 'ゆうれい王', fly: true },
  // ワールド6のボス: ハチの絵を大きくしたもの。とっしんして 針が 地面に ささると うごけない
  queen: { w: 88, h: 76, img: 'bee', dh: 112, stomp: true, sword: true, score: 8000, boss: true, name: 'じょおうバチ', fly: true },
  // ワールド7のボス: めだまの絵を大きくしたもの。光の柱を うつと つかれて 下に おりてくる
  medama: { w: 96, h: 76, img: 'eye', dh: 108, stomp: true, sword: true, score: 9000, boss: true, name: 'ほしめだま', fly: true },
  // ワールド8(さいご)のボス: 主人公の絵を まっくろにして 大きくしたもの
  kage: { w: 56, h: 96, img: 'hero_idle', dh: 128, stomp: true, sword: true, score: 12000, boss: true, name: 'かげの おう' },
  // ---- 第4段階の 敵(絵は ChatGPT の en_* が なければ 色替え) ----
  // もぐらん: 地面に もぐって ちかづき、とびだして おいかける
  mogura: { w: 40, h: 36, img: 'goomy', art: 'en_mogura', dh: 44, speed: 80, stomp: true, sword: true, score: 200, filter: 'sepia(0.8) hue-rotate(-20deg) saturate(1.4) brightness(0.9)' },
  // なげっこ: たかい 所から 木の実を なげる。ときどき はねる
  nageko: { w: 38, h: 40, img: 'goomy', art: 'en_nageko', dh: 48, stomp: true, sword: true, score: 200, filter: 'hue-rotate(-40deg) saturate(1.6)' },
  // ぶらさがりぐも: 糸で 上から おりてくる(トゲが あるので スピンか けんで)
  kumo: { w: 40, h: 36, img: 'spiky', art: 'en_kumo', dh: 46, stomp: false, sword: true, fly: true, score: 200, filter: 'hue-rotate(220deg) saturate(1.3)' },
  // ぷくぷく: 水の 中で ゆっくり ちかづいて、ときどき ふくらむ
  fugu: { w: 40, h: 34, img: 'fish', art: 'en_fugu', dh: 46, stomp: false, sword: true, score: 200, filter: 'hue-rotate(160deg) saturate(1.2)' },
  // おおおばけ: おばけやしきの 大きな おばけ。見ていると とまる。かべも すりぬける
  oobake: { w: 96, h: 96, img: 'ghost', art: 'en_oobake', dh: 120, stomp: false, sword: false, fly: true, score: 0, filter: 'hue-rotate(250deg) saturate(1.3)' },
  // とりでの ぬし「ほねほね だいしょう」: ほねを 3本 なげる・大ジャンプ。3回 ふむか けんで
  hone: { w: 64, h: 92, img: 'skeleton', dh: 118, stomp: true, sword: true, score: 3000, boss: true, name: 'ほねほね だいしょう' },
};
const BOSS_TYPES = ['boss', 'kabuto', 'yurei', 'queen', 'medama', 'kage', 'slimeking', 'hone'];

let uid = 0;
function spawn(e) {
  const id = ++uid;
  const X = e.x * TILE, Y = e.y * TILE;
  switch (e.kind) {
    case 'o': return { id, t: 'coin', x: X + 10, y: Y + 8, w: 28, h: 32, ph: Math.random() * 6 };
    case '*': return { id, t: 'star', x: X + 4, y: Y + 4, w: 40, h: 40, idx: e.idx, ph: 0 };
    case '@': return { id, t: 'shard', x: X + 2, y: Y - 6, w: 44, h: 54, idx: e.idx, ph: e.idx };
    case 't': return { id, t: 'tblock', x: X + 2, y: Y + 4, w: 44, h: 44, vx: 0, vy: 0, carry: true };
    case '&': return { id, t: 'pswitch', x: X + 4, y: Y + 14, w: 40, h: 34, vx: 0, vy: 0, carry: true };
    case 'y': return { id, t: 'mount', x: X + 2, y: Y + 4, w: 44, h: 44, vx: 0, vy: 0, face: 1, state: 'idle', timer: 0, fire: 0, flyT: 0 };
    case '!': return { id, t: 'palace', x: X - 24, y: Y + 6, w: 96, h: 42, color: e.color || (world && world.def.palace) || 'y', down: 0 };
    case 'h': return { id, t: 'heart', x: X + 8, y: Y + 10, w: 32, h: 30, ph: 0 };
    case 'p': return { id, t: 'potion', x: X + 8, y: Y + 6, w: 32, h: 36, ph: 0 };
    case 'k': return { id, t: 'key', x: X + 8, y: Y + 6, w: 32, h: 36, ph: 0 };
    case 'g': return { id, t: 'gem', x: X + 10, y: Y + 8, w: 28, h: 34, ph: 0 };
    case 'C': return { id, t: 'checkpoint', x: X + 4, y: Y - 40, w: 40, h: 88, on: false, idx: e.x };
    case 'G': return { id, t: 'goal', x: X, y: Y - 96, w: 48, h: 144, ph: 0 };
    case '$': return { id, t: 'goal', x: X, y: Y - 96, w: 48, h: 144, secret: true, ph: 0.8 };
    case 'T': return { id, t: 'spring', x: X + 4, y: Y + 10, w: 40, h: 38, sq: 0, power: 1050, carry: true, vx: 0, vy: 0 };
    case 'm': return { id, t: 'mushroom', x: X + 2, y: Y + 4, w: 44, h: 44, sq: 0, power: 940 };
    case 'w': return { id, t: 'wing', x: X + 4, y: Y + 8, w: 40, h: 34, ph: 0 };
    case 'b': return { id, t: 'boots', x: X + 6, y: Y + 8, w: 36, h: 34, ph: 0 };
    case 'n': return { id, t: 'magnet', x: X + 6, y: Y + 8, w: 36, h: 34, ph: 0 };
    case 'u': return { id, t: 'oneup', x: X + 6, y: Y + 8, w: 36, h: 36, ph: 0 };
    case 'c': return { id, t: 'chest', x: X + 4, y: Y + 6, w: 40, h: 42, open: false };
    case 'Y': return { id, t: 'trampoline', x: X - 4, y: Y + 22, w: 56, h: 26, sq: 0, power: 1250 };
    case 'f': return { id, t: 'fire', x: X + 6, y: Y + 6, w: 36, h: 36, ph: 0 };
    case 'J': return { id, t: 'jet', x: X + 4, y: Y + 8, w: 40, h: 34, ph: 0 };
    case '>': return { id, t: 'booster', x: X, y: Y + 30, w: 48, h: 18, dir: 1 };
    case '<': return { id, t: 'booster', x: X, y: Y + 30, w: 48, h: 18, dir: -1 };
    case 'F': return { id, t: 'fallplat', x: X, y: Y, w: 96, h: 18, x0: X, y0: Y, state: 'idle', timer: 0, plat: true };
    case 'hint': return { id, t: 'hint', x: X, y: 0, w: 1, h: 1, text: e.text, sub: e.sub, shown: false };
    case 'well': return { id, t: 'well', x: X, y: e.y * TILE - 16, w: 48, h: 16, to: e.to, back: !!e.back };
    case 'wdoor': return { id, t: 'wdoor', x: X, y: (e.y - 1) * TILE, w: 48, h: 96, to: e.to };
    case 'door': return { id, t: 'door', x: X, y: (e.y - 1) * TILE, w: 48, h: 96, solid: true, open: 0 };
    case 'portal': return { id, t: 'portal', x: X + 6, y: (e.y - 1) * TILE + 8, w: 36, h: 88, to: e.to, hue: e.hue, exitOnly: e.exit, ph: Math.random() * 6 };
    case 'mover': {
      const r = (e.opt.range || 3) * TILE;
      if (e.type === 'balloon') return { id, t: 'balloon', x: X, y: Y, w: 80, h: 16, x0: X, y0: Y, r, state: 'idle', timer: 0, plat: true, dx: 0, dy: 0 };
      if (e.type === 'bubble') return { id, t: 'bubble', x: X, y: Y, w: 72, h: 16, x0: X, y0: Y, state: 'idle', timer: 0, plat: true, ph: Math.random() * 6, dx: 0, dy: 0 };
      if (e.type === 'lift') return { id, t: 'lift', x: X, y: Y, w: 96, h: 18, x0: X, y0: Y, r, ph: 0, plat: true };
      // かんらんしゃの 足場: 中心(cx,cy)の まわりを まわる
      if (e.type === 'wheel') { const o = e.opt; return { id, t: 'wheelplat', x: X, y: Y, w: 96, h: 18, cx: o.cx * TILE + 24, cy: o.cy * TILE + 24, r: o.r * TILE, a0: o.a0 || 0, sp: o.sp || 0.7, plat: true, dx: 0, dy: 0 }; }
      // せんろの 上を うごく 足場: path(マスの ずれ)を 行ったり 来たり
      if (e.type === 'rail') { const pts = [[X, Y], ...(e.opt.path || []).map(([dx, dy]) => [X + dx * TILE, Y + dy * TILE])]; let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return { id, t: 'rail', x: X, y: Y, w: 96, h: 18, pts, len, s: 0, dir: 1, sp: e.opt.sp || 110, plat: true, dx: 0, dy: 0 }; }
      return { id, t: 'move', x: X, y: Y, w: 144, h: 18, x0: X, y0: Y, r, ph: 0, plat: true };
    }
    case 'hazard': {
      const o = e.opt;
      if (e.type === 'flame') { const gy = groundYBelow(e.x); return { id, t: 'flame', x: X + 4, y: (gy - 1) * TILE - 52, w: 40, h: 100, gy, ph: (o.phase || 0) * 1.2 }; }
      if (e.type === 'crusher') { const gy = groundYBelow(e.x, e.y + 2); return { id, t: 'crusher', x: X - 6, y: e.y * TILE, w: 60, h: 60, y0: e.y * TILE, gy, state: 'wait', timer: (o.phase || 0), solid: true }; }
      if (e.type === 'saw') return { id, t: 'saw', x: X, y: e.y * TILE, w: 52, h: 52, x0: X, y0: e.y * TILE, r: (o.range || 2) * TILE, horiz: !!o.horiz, ph: 0 };
      if (e.type === 'zapper') return { id, t: 'zapper', x: X, y: e.y * TILE + 14, w: (o.len || 3) * TILE, h: 20, ph: (o.phase || 0) * 1.3, on: false };
      if (e.type === 'updraft') { const gy = groundYBelow(e.x); const hh = (o.h || 5) * TILE; return { id, t: 'updraft', x: X, y: gy * TILE - hh, w: (o.w || 1) * TILE, h: hh, gy }; }
      if (e.type === 'firebar') return { id, t: 'firebar', px: X + 24, py: e.y * TILE + 24, n: o.n || 5, ang: o.ang || 0, sp: o.speed || 1.7, x: X, y: e.y * TILE, w: 48, h: 48 };
      if (e.type === 'icicle') return { id, t: 'icicle', x: X + 10, y: e.y * TILE, w: 28, h: 46, x0: X + 10, y0: e.y * TILE, state: 'hang', timer: 0 };
      if (e.type === 'geyser') { const gy = (o.top || 10) * TILE; return { id, t: 'geyser', x: X + 4, y: gy - (o.h || 4) * TILE, w: 40, h: (o.h || 4) * TILE, gy, ph: (o.phase || 0) * 1.5 }; }
      if (e.type === 'axe') return { id, t: 'axe', px: X + 24, py: e.y * TILE, len: 250, ang: 0, ph: 0, x: X, y: e.y * TILE, w: 1, h: 1 };
      if (e.type === 'roller') { const gy = groundYBelow(e.x); return { id, t: 'roller', x: X, y: (gy - 2) * TILE, w: TILE, h: 2 * TILE, gy, dir: o.dir || -1, every: o.every || 2.8, timer: o.phase || 0.6, sp: o.speed || 190 }; }
      if (e.type === 'plate') { const gy = groundYBelow(e.x); return { id, t: 'plate', x: X + 2, y: gy * TILE - 14, w: 44, h: 14, dur: o.dur || 6, down: 0 }; }
      // ---- ワールド6〜8 ----
      if (e.type === 'zip') { const ax = X + 24, ay = e.y * TILE, bx = o.tx * TILE + 24, by = o.ty * TILE; return { id, t: 'zip', ax, ay, bx, by, len: Math.hypot(bx - ax, by - ay), s: 0, v: 0, state: 'idle', x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: 1 }; }
      if (e.type === 'cannon') { const gy = groundYBelow(e.x); return { id, t: 'cannon', x: X, y: gy * TILE - TILE, w: TILE, h: TILE, ang: (o.ang ?? -55) * Math.PI / 180, power: o.power || 1100, fireT: 0, recoil: 0 }; }
      if (e.type === 'lowgrav') return { id, t: 'lowgrav', x: X, y: 0, w: (o.w || 8) * TILE, h: ROWS * TILE };
      if (e.type === 'comet') return { id, t: 'comet', x: X, y: (o.row || 8) * TILE, w: (o.w || 10) * TILE, h: TILE, row: o.row || 8, every: o.every || 2.6, timer: o.phase ?? 1.6, warn: false };
      if (e.type === 'wheelhub') return { id, t: 'wheelhub', x: X, y: e.y * TILE, w: TILE, h: TILE, cx: X + 24, cy: e.y * TILE + 24, r: (o.r || 3) * TILE, n: o.n || 4, sp: o.sp || 0.7 };
      if (e.type === 'shadow') return { id, t: 'shadowzone', x: X, y: 0, w: (o.w || 20) * TILE, h: ROWS * TILE, delay: o.delay || 1.6, active: false, rec: [], sx: 0, sy: 0, sf: 1, alpha: 0 };
      // トゲてっきゅう: 中心の まわりを まわる 大きな トゲの 玉
      if (e.type === 'ballchain') return { id, t: 'ballchain', x: X, y: e.y * TILE, w: 48, h: 48, cx: X + 24, cy: e.y * TILE + 24, r: (o.r || 3) * TILE, ang: o.ang || 0, sp: o.sp || 1.3 };
      // つぶす 天井: 上から ゆっくり おりてくる(notch の 列は くぼみで 安全)
      if (e.type === 'ceil') { const gy = groundYBelow(e.x + 1); return { id, t: 'ceil', x: X, y: 0, w: (o.w || 6) * TILE, h: 1, gy, stop: (gy - 1) * TILE, notch: o.notch || [], yb: (o.top || 2) * TILE, y0: (o.top || 2) * TILE, state: 'wait', timer: o.phase || 1.2 }; }
      if (e.type === 'crumb') { const gy = e.y; return { id, t: 'crumb', x: X, y: gy * TILE, w: TILE, h: 18, x0: X, y0: gy * TILE, g: o.g, i: o.i, n: o.n, state: 'idle', plat: true, dx: 0, dy: 0, vy: 0 }; }
      if (e.type === 'wind') {
        // 横風: 扇風機から dir の向きに吹く。on/off を決めると吹く・止むをくり返す(止む前後は弱く吹いて知らせる)
        const dir = o.dir || 1, w = (o.w || 5) * TILE, fx = o.fx !== undefined ? o.fx : (dir > 0 ? e.x - 1 : e.x + (o.w || 5));
        return { id, t: 'wind', x: X, y: (e.y ?? 2) * TILE, w, h: (o.h || 8) * TILE, dir, v: o.v || 170, on: o.on || 0, off: o.off || 0, ph: o.phase || 0, fx: fx * TILE + 24, fgy: groundYBelow(fx) * TILE, blow: 1 };
      }
      return null;
    }
    case 'enemy': {
      const d = ENEMY[e.type];
      if (!d) return null;
      let y;
      if (e.y !== undefined) y = e.y * TILE + (TILE - d.h) / 2;
      else y = groundYBelow(e.x) * TILE - d.h;
      const o = { id, t: 'enemy', type: e.type, d, x: X + (TILE - d.w) / 2, y, w: d.w, h: d.h, vx: -(d.speed || 0), vy: 0, face: -1, hp: 1, x0: X, y0: y, ph: Math.random() * 6, state: 'walk', timer: rnd(0.5, 1.5) };
      if (e.type === 'plant') { o.y = groundYBelow(e.x) * TILE - d.h; o.y0 = o.y; o.state = 'hidden'; o.timer = 1; o.rise = 0; }
      if (e.type === 'turret') { o.face = e.opt.dir || -1; o.timer = 1.5; }
      if (e.type === 'fish') { o.y0 = ROWS * TILE - 10; o.y = o.y0; o.state = 'under'; o.timer = rnd(0.5, 1.8) + (e.opt.phase || 0); o.jump = e.opt.jump || 900; }
      if (e.type === 'orb') { o.cx = X + 24; o.cy = (e.y || 6) * TILE + 24; o.rad = (e.opt.r || 1.6) * TILE; o.ang = e.opt.ang || 0; o.sp = e.opt.speed || 1.8; }
      if (e.type === 'wizard') { o.timer = 1.5; o.casts = 0; o.alpha = 1; }
      o.v = e.opt.v || '';
      if (e.type === 'slime' && o.v === 'big') { o.big = true; o.w = 60; o.h = 44; o.x = X - 6; o.y = groundYBelow(e.x) * TILE - o.h; }
      if (e.type === 'goomy' && o.v === 'para') { o.timer = 0.6; }
      if (e.type === 'bee' && o.v === 'circle') { o.cx = o.x0; o.cy = o.y0; }
      if (e.type === 'orb' && o.v === 'line') { o.lx0 = X - (e.opt.r || 3) * TILE; o.lx1 = X + (e.opt.r || 3) * TILE; o.dirx = 1; }
      if (e.type === 'yurei') { o.hp = e.opt.hp || 6; o.maxHp = o.hp; o.timer = 2; o.invT = 0; o.alpha = 0.3; o.state = 'sleep'; o.arena = e.opt.arena; o.y = 3 * TILE; o.y0 = o.y; o.vx = 0; o.casts = 0; }
      if (e.type === 'slimeking') { o.hp = e.opt.hp || 4; o.maxHp = o.hp; o.timer = 1.2; o.invT = 0; o.alpha = 1; o.state = 'sleep'; o.arena = e.opt.arena; o.x = X; o.y = groundYBelow(e.x) * TILE - o.h; o.vx = 0; o.hops = 0; o.sq = 0; }
      if (e.type === 'kabuto') { o.hp = e.opt.hp || 6; o.maxHp = o.hp; o.timer = 1.5; o.invT = 0; o.alpha = 1; o.state = 'sleep'; o.arena = e.opt.arena; o.x = X; o.y = groundYBelow(e.x) * TILE - o.h; o.vx = 0; }
      if (e.type === 'queen' || e.type === 'medama') { o.hp = e.opt.hp || 6; o.maxHp = o.hp; o.timer = 2; o.invT = 0; o.alpha = 1; o.state = 'sleep'; o.arena = e.opt.arena; o.y = 2.5 * TILE; o.y0 = o.y; o.vx = 0; o.vy = 0; o.casts = 0; }
      if (e.type === 'kage') { o.hp = e.opt.hp || 8; o.maxHp = o.hp; o.timer = 1.5; o.invT = 0; o.alpha = 1; o.state = 'sleep'; o.arena = e.opt.arena; o.x = X; o.y = groundYBelow(e.x) * TILE - o.h; o.vx = 0; o.casts = 0; }
      if (e.type === 'boss') { o.hp = e.opt.hp || 8; o.maxHp = o.hp; o.timer = 2; o.casts = 0; o.alpha = 1; o.invT = 0; o.state = 'sleep'; o.arena = e.opt.arena || [e.x - 12, e.x + 12]; }
      if (e.type === 'hone') { o.hp = e.opt.hp || 3; o.maxHp = o.hp; o.timer = 1.2; o.invT = 0; o.alpha = 1; o.state = 'sleep'; o.arena = e.opt.arena; o.x = X; o.y = groundYBelow(e.x) * TILE - o.h; o.vx = 0; o.casts = 0; }
      if (e.type === 'mogura') { o.state = 'under'; o.timer = 1; o.vx = 0; }
      if (e.type === 'nageko') { o.timer = 1.2; o.vx = 0; }
      if (e.type === 'kumo') { o.ay = (e.opt.top !== undefined ? e.opt.top : 2) * TILE; o.y = o.ay + 10; o.y0 = o.y; o.state = 'up'; o.drop = (e.opt.drop || 5) * TILE; o.vx = 0; }
      if (e.type === 'fugu') { o.y = (e.y !== undefined ? e.y : 8) * TILE; o.y0 = o.y; o.vx = 0; o.puff = 0; o.timer = rnd(1, 3); }
      if (e.type === 'oobake') { o.y = (e.y !== undefined ? e.y : 4) * TILE; o.vx = 0; }
      if (d.solid) o.solid = true;
      return o;
    }
  }
  return null;
}

// ---------- 細かい演出 ----------
function burst(x, y, color, n = 10, sp = 220, size = 5) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2), s = rnd(sp * 0.3, sp);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: rnd(0.35, 0.7), max: 0.7, color, size: rnd(size * 0.6, size), g: 600 });
  }
}
function sparkle(x, y, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2), s = rnd(40, 160);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.3, 0.6), max: 0.6, color: i % 2 ? '#fff6a8' : '#ffffff', size: rnd(2, 4), g: 0, star: true });
  }
}
function dust(x, y, n = 5) {
  for (let i = 0; i < n; i++) parts.push({ x: x + rnd(-10, 10), y, vx: rnd(-60, 60), vy: rnd(-60, -10), life: rnd(0.25, 0.45), max: 0.45, color: 'rgba(255,255,255,.8)', size: rnd(3, 6), g: 0, puff: true });
}
function popText(x, y, text, color = '#fff') { parts.push({ x, y, vx: 0, vy: -70, life: 0.9, max: 0.9, text, color, g: 0 }); }
function debris(x, y, img) {
  for (let i = 0; i < 4; i++) parts.push({ x: x + (i % 2) * 24, y: y + Math.floor(i / 2) * 24, vx: (i % 2 ? 1 : -1) * rnd(80, 160), vy: rnd(-520, -300), life: 1.1, max: 1.1, img, size: 22, g: 1600, rot: 0, vr: rnd(-8, 8) });
}

// ---------- 主人公 ----------
const GRAV = 2300, MAXFALL = 860, ACC = 2800, AIRACC = 2200, MAXV = 300, JUMPV = 800, FRICT = 2600;
// 主人公の重力: 上がる間ボタンを押している / 離した / ばねなどで飛ばされた / 落ちる
const GRAV_UP = 1650, GRAV_CUT = 4200, GRAV_LAUNCH = 1900, GRAV_DOWN = 2500;

// 星の合計で育つ力(ずっと残る)
function totalStars() { return Object.values(save.stars || {}).reduce((s2, a) => s2 + a.filter(Boolean).length, 0); }
const PERKS = [
  { need: 4, name: 'ハートの うつわ', desc: 'ハートの さいだい +1' },
  { need: 10, name: 'ながい けん', desc: 'けんが とどく はんいが ひろがる' },
  { need: 16, name: 'ハートの うつわ', desc: 'ハートの さいだい +1' },
  { need: 22, name: 'かぜの マント', desc: 'すべての ステージを たてを もって はじめる' },
  { need: 30, name: 'ほしの まもり', desc: 'ちからを なくしても 1かいは のこる' },
  { need: 45, name: 'ハートの うつわ', desc: 'ハートの さいだい +1' },
  { need: 60, name: 'ほしの コンパス', desc: '画面の外の 星の 方向が わかる' },
  { need: 90, name: 'ほしの じしゃく', desc: 'ちかくの コインを いつも ひきよせる' },
];
function perkOn(i) { return totalStars() >= PERKS[i].need; }
function baseHearts() { return 3 + (perkOn(0) ? 1 : 0) + (perkOn(2) ? 1 : 0) + (perkOn(5) ? 1 : 0); }
const POWER_INFO = {
  wing: { name: 'つばさ', img: 'p_wing', sub: '空中で もう1回ジャンプ・おちるとき ジャンプ長押しで ふわっと' },
  dash: { name: 'ダッシュブーツ', img: 'p_boots', sub: () => usingTouch ? '「ダッシュ」ボタンで 空中でも ダッシュ' : 'C か Shift で 空中でも ダッシュ' },
  fire: { name: 'ほのおの けん', img: 'firespirit', sub: 'けんを ふると ほのおが とぶ' },
  cape: { name: 'ほしの マント', img: 'p_cape', sub: () => 'はしって メーターが たまったら ジャンプで とぶ。とびながら ←→で のぼる・きゅうこうか' },
};
// 予備の アイテム(画面の上の 箱に 1つ しまえる)。同じ 力を もう1つ 取ると しまう。やられそうな ときに おちてくる / Q・E で 出す
const RESERVE_INFO = {
  heart: { img: 'ui_heart', t: 'heart', name: 'ハート' }, shield: { img: 'shield', t: 'shield', name: 'たて' },
  wing: { img: 'p_wing', t: 'wing', name: 'つばさ' }, dash: { img: 'p_boots', t: 'boots', name: 'ダッシュブーツ' },
  fire: { img: 'firespirit', t: 'fire', name: 'ほのおの けん' }, cape: { img: 'p_cape', t: 'cape', name: 'ほしの マント' },
};
const RES_RANK = { heart: 1, shield: 2, dash: 3, fire: 4, wing: 5, cape: 6 };
function stashReserve(kind, cx, cy) {
  if (save.reserve && RES_RANK[save.reserve] > RES_RANK[kind]) { world.score += 500; popText(cx, cy - 20, '+500', '#fff'); return; }
  save.reserve = kind; writeSave(); world.resPop = 0.5;
  sfx('item', 1.3); sparkle(cx, cy, 12);
  popText(cx, cy - 20, RESERVE_INFO[kind].name + 'を しまった', '#bff4ff');
  if (!world.seenRes) { world.seenRes = true; toast = { text: 'よびの はこに しまった!', sub: usingTouch ? '上の はこを タップで 出せる' : 'Q か E で 出せる(ピンチの ときは じどうで おちてくる)', t: 2.8 }; }
}
function dropReserve() {
  if (!save.reserve || !world || world.clear || P.dead) return false;
  const k = save.reserve, info = RESERVE_INFO[k]; save.reserve = null; writeSave();
  world.ents.push({ id: ++uid, t: info.t, x: clamp(P.x + P.w / 2, cam.x + 40, cam.x + VW - 40) - 18, y: cam.y + 40, w: 36, h: 36, ph: 0, falling: true, fromRes: true });
  sfx('item', 0.9); sfx('select');
  return true;
}
function drawItemIcon(kind, x, y, w, h) {
  if (kind === 'p_cape' && !ART.p_cape) {
    // マントの 仮の 絵: 星の もようの 紫の マント
    ctx.save(); ctx.translate(x + w / 2, y + h / 2);
    ctx.fillStyle = '#8a4ad8'; ctx.strokeStyle = '#2a1a3a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-w * 0.18, -h * 0.42); ctx.lineTo(w * 0.18, -h * 0.42); ctx.quadraticCurveTo(w * 0.5, h * 0.1, w * 0.42, h * 0.44); ctx.lineTo(-w * 0.42, h * 0.44); ctx.quadraticCurveTo(-w * 0.5, h * 0.1, -w * 0.18, -h * 0.42); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd84a'; ctx.fillRect(-w * 0.22, -h * 0.46, w * 0.44, h * 0.1);
    ctx.fillStyle = '#ffe66b'; for (const [sx, sy] of [[-0.15, 0.05], [0.18, 0.2], [0, 0.3]]) { ctx.beginPath(); ctx.arc(sx * w, sy * h, w * 0.05, 0, 7); ctx.fill(); }
    ctx.restore(); return;
  }
  drawImg(kind, x, y, w, h);
}
function hasPower(k) { return P && P.powers && P.powers.includes(k); }
function gainPower(k, cx, cy) {
  if (!P.powers.includes(k)) P.powers.push(k);
  else { P.powers = P.powers.filter(x => x !== k); P.powers.push(k); }
  if (k === 'wing') P.airJumps = maxAirJumps();
  if (k === 'dash') P.airDash = 1;
  sfx('star'); sparkle(cx, cy, 24); burst(cx, cy, '#ffffff', 14, 240, 5);
  const info = POWER_INFO[k];
  if (!world.seenPower) world.seenPower = {};
  toast = { text: info.name + 'を てにいれた!', sub: typeof info.sub === 'function' ? info.sub() : info.sub, t: world.seenPower[k] ? 1.6 : 3.2 };
  world.seenPower[k] = true;
}
function hurtPlayer(fromX, big = false) {
  if (P.inv > 0 || P.dead || world.clear) return;
  P.fly = null; P.spin = false;
  if (P.carry) dropCarry(false);
  // もこりゅうに のっていたら、もこりゅうが にげるだけ(ハートは へらない)
  if (P.mount) { mountOff('hurt', fromX); return; }
  const hadPow = P.powers && P.powers.length;
  if (P.shield) {
    P.shield = false; P.inv = 1.2; sfx('shield', 0.8); sparkle(P.x + P.w / 2, P.y + P.h / 2, 14);
  } else if (P.powers && P.powers.length && !(perkOn(4) && P.powers.length === 1 && !P.keptOnce)) {
    // 力を持っていれば、ハートの代わりに いちばん新しい力を1つ なくす
    const lost = P.powers.pop();
    P.inv = 1.6; sfx('hurt'); cam.shake = 0.2; hitStop(0.07); world.hurtFlash = 0.25;
    popText(P.x + P.w / 2, P.y - 10, POWER_INFO[lost].name + 'を なくした', '#ff8fa8');
    burst(P.x + P.w / 2, P.y + P.h / 2, '#ffffff', 10, 200, 4);
    P.airJumps = Math.min(P.airJumps, maxAirJumps());
  } else if (P.powers && P.powers.length && perkOn(4) && !P.keptOnce) {
    P.keptOnce = true; P.inv = 1.6; sfx('shield', 0.9); popText(P.x + P.w / 2, P.y - 10, 'ほしの まもり!', '#ffe066');
  } else {
    P.hearts -= big ? 2 : 1;
    P.inv = 1.6;
    sfx('hurt');
    cam.shake = 0.25; hitStop(0.08); world.hurtFlash = 0.3;
    if (P.hearts <= 0) { killPlayer(); return; }
  }
  // ピンチ(ハート1つ / 力を なくした)なら よびの アイテムが おちてくる
  if (save.reserve && (P.hearts <= 1 || (hadPow && P.powers.length < hadPow))) dropReserve();
  P.vx = (P.x + P.w / 2 < fromX ? -1 : 1) * 170;
  P.vy = -360;
}
function killPlayer() {
  if (P.dead) return;
  if (P.mount) { P.mount.gone = true; P.mount = null; P.h = 54; P.y += 26; }
  if (P.carry) dropCarry(false);
  P.fly = null; P.spin = false;
  P.dead = true; P.deadT = 0; P.vy = -760; P.vx = 0; P.hearts = 0;
  bgm('');
  sfx('die');
  cam.shake = 0.3;
}

function solidRects() {
  const out = [];
  for (const o of world.ents) if (o.solid && !o.gone && !(o.t === 'door' && o.open > 0.5)) out.push(o);
  return out;
}

const BUMPABLE = '?HQAERB%ON7eqj';
function moveBody(b, dt, opts = {}) {
  // 横(ext は風などで外から押される速さ)
  const mvx = b.vx + (opts.ext || 0);
  b.x += mvx * dt;
  b.hitWall = 0;
  let x0 = Math.floor(b.x / TILE), x1 = Math.floor((b.x + b.w - 0.01) / TILE);
  let y0 = Math.floor(b.y / TILE), y1 = Math.floor((b.y + b.h - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    if (mvx > 0 && isSolid(x1, ty)) { b.x = x1 * TILE - b.w; b.hitWall = 1; }
    else if (mvx < 0 && isSolid(x0, ty)) { b.x = (x0 + 1) * TILE; b.hitWall = -1; }
  }
  if (opts.ents) {
    for (const s of solidRects()) {
      if (s === b) continue;
      if (overlap(b, s)) {
        if (b.x + b.w / 2 < s.x + s.w / 2) { b.x = s.x - b.w; b.hitWall = 1; } else { b.x = s.x + s.w; b.hitWall = -1; }
      }
    }
  }
  if (b.hitWall) b.vx = 0;
  // 縦
  const prevBottom = b.y + b.h;
  b.y += b.vy * dt;
  b.onGround = false;
  b.groundTile = null;
  b.headHit = null;
  x0 = Math.floor((b.x + 2) / TILE); x1 = Math.floor((b.x + b.w - 2.01) / TILE);
  y0 = Math.floor(b.y / TILE); y1 = Math.floor((b.y + b.h - 0.01) / TILE);
  if (b.vy >= 0) {
    for (let tx = x0; tx <= x1; tx++) {
      const solid = isSolid(tx, y1);
      const ow = !solid && isOneWay(tx, y1) && prevBottom <= y1 * TILE + 2 && !opts.drop;
      if (solid || ow) { b.y = y1 * TILE - b.h; b.vy = 0; b.onGround = true; b.groundTile = tileAt(tx, y1); break; }
    }
  } else {
    // 頭の角だけが ブロックの角に ひっかかったときは 横にずらして 通す(12px まで)
    // (たたける ブロック ? % O などは ずらさない。ちゃんと たたけるように)
    if (opts.corner && x0 !== x1 && isSolid(x0, y0) !== isSolid(x1, y0) && !BUMPABLE.includes(tileAt(isSolid(x0, y0) ? x0 : x1, y0))) {
      const rows = [];
      for (let ty = y0; ty <= y1; ty++) rows.push(ty);
      if (isSolid(x0, y0)) {
        const ov = (x0 + 1) * TILE - (b.x + 2), nx = b.x + ov, nc = Math.floor((nx + b.w - 0.01) / TILE);
        if (ov > 0 && ov <= 10 && rows.every(ty => !isSolid(nc, ty))) { b.x = nx; x0 = x1; }
      } else {
        const ov = (b.x + b.w - 2) - x1 * TILE, nx = b.x - ov, nc = Math.floor(nx / TILE);
        if (ov > 0 && ov <= 10 && rows.every(ty => !isSolid(nc, ty))) { b.x = nx; x1 = x0; }
      }
    }
    let best = null, bestD = 1e9;
    for (let tx = x0; tx <= x1; tx++) {
      if (isSolid(tx, y0)) {
        const d = Math.abs((tx + 0.5) * TILE - (b.x + b.w / 2));
        if (d < bestD) { bestD = d; best = tx; }
      }
    }
    if (best !== null) { b.y = (y0 + 1) * TILE; b.vy = 0; b.headHit = { tx: best, ty: y0 }; }
  }
  if (opts.ents) {
    for (const s of solidRects()) {
      if (s === b || !overlap(b, s)) continue;
      if (b.vy >= 0 && prevBottom <= s.y + 12) { b.y = s.y - b.h; b.vy = 0; b.onGround = true; b.standOn = s; }
      else if (b.vy < 0) { b.y = s.y + s.h; b.vy = 0; }
    }
    // 乗れる足場(動く床・落ちる床)
    if (b.vy >= 0 && !opts.drop) {
      for (const s of world.ents) {
        if (!s.plat || s.gone) continue;
        if (b.x + b.w > s.x + 4 && b.x < s.x + s.w - 4 && prevBottom <= s.y + 6 + Math.max(0, s.dy || 0) && b.y + b.h >= s.y) {
          b.y = s.y - b.h; b.vy = 0; b.onGround = true; b.standOn = s;
        }
      }
    }
  }
}

function bumpTile(tx, ty) {
  const c = tileAt(tx, ty);
  world.bumps.set(tx + ',' + ty, 0.18);
  // 上に乗っている敵は飛ばす
  for (const o of world.ents) {
    if (o.t === 'enemy' && !o.dying && o.y + o.h >= ty * TILE - 4 && o.y + o.h <= ty * TILE + 6 && o.x + o.w > tx * TILE && o.x < (tx + 1) * TILE) defeat(o, true);
  }
  if (c === '?' || c === 'H' || c === 'Q' || c === 'A' || c === 'E' || c === 'R') {
    level.tiles[ty][tx] = 'U';
    if (c === '?') {
      world.coins++; world.score += 100; sfx('coin');
      parts.push({ x: tx * TILE + 10, y: ty * TILE - 30, vx: 0, vy: -520, life: 0.45, max: 0.45, img: 'coin', size: 28, g: 1800, spin: true });
      popText(tx * TILE + 24, ty * TILE - 30, '+100', '#ffe066');
    } else {
      sfx('item');
      const it = c === 'H' ? { t: 'heart', w: 32, h: 30 } : c === 'A' ? { t: 'wing', w: 40, h: 34 } : c === 'E' ? { t: 'boots', w: 36, h: 34 } : c === 'R' ? { t: 'fire', w: 36, h: 36 } : { t: 'shield', w: 32, h: 36 };
      world.ents.push({ id: ++uid, ...it, x: tx * TILE + 8, y: ty * TILE - it.h - 2, ph: 0, rising: 0.3 });
    }
  } else if (c === '%') {
    toggleSwitch(tx, ty);
  } else if (c === 'O') {
    lightUp(tx, ty);
  } else if (c === 'N') {
    growVine(tx, ty);
  } else if (c === 'e') {
    // たまごブロック: もこりゅうの たまご
    level.tiles[ty][tx] = 'U'; sfx('item'); sfx('powerup', 0.8);
    world.ents.push({ id: ++uid, t: 'egg', x: tx * TILE + 6, y: ty * TILE - 44, w: 36, h: 42, vx: 0, vy: -420, timer: 1.0 });
  } else if (c === 'q') {
    level.tiles[ty][tx] = 'U'; sfx('item');
    world.ents.push({ id: ++uid, t: 'cape', w: 40, h: 36, x: tx * TILE + 4, y: ty * TILE - 38, ph: 0, rising: 0.3 });
  } else if (c === 'j') {
    // くるくるブロック: たたくと しばらく まわって とおりぬけられる
    world.spinBlk[tx + ',' + ty] = 3.5; sfx('bump', 1.5); sfx('swing', 1.8);
  } else if (c === '7') {
    world.bumps.set('n' + tx + ',' + ty, 0.18); sfx('spring', 1.3);
  } else if (c === 'B') {
    level.tiles[ty][tx] = ' ';
    sfx('break');
    debris(tx * TILE, ty * TILE, 'brick');
    world.score += 50;
    cam.shake = Math.max(cam.shake, 0.08);
  } else {
    sfx('bump', 0.9);
  }
}

// 赤⇔青 を入れかえる。出てきたブロックに主人公が重なっていたら 上に押し出す
function toggleSwitch(tx, ty) {
  if ((world.swCD || 0) > world.time) return;
  world.swCD = world.time + 0.25;
  world.sw = !world.sw; world.swFlash = 0.35;
  sfx('click', world.sw ? 0.8 : 1.1); sfx('door', world.sw ? 1.5 : 1.7); hitStop(0.05); cam.shake = Math.max(cam.shake, 0.12);
  sparkle(tx * TILE + 24, ty * TILE + 24, 12);
  pushOutOf('12');
}
// ひかりブロック: たたくと 部屋が ぴかっと 光り、ゆうれいが 目を回す(4びょうで また つかえる)
function lightUp(tx, ty) {
  if ((world.lightCD || 0) > world.time) { sfx('bump', 0.9); return; }
  world.lightCD = world.time + 4; world.lightFlash = 0.6;
  sfx('powerup', 1.3); sfx('star', 0.8); sparkle(tx * TILE + 24, ty * TILE + 24, 24); hitStop(0.06);
  for (const o of world.ents) if (o.t === 'enemy' && o.type === 'yurei' && !o.dying && o.state !== 'sleep') { o.state = 'stun'; o.timer = 3.0; o.vy = 0; o.vx = 0; }
  for (const o of world.ents) if (o.t === 'enemy' && o.type === 'ghost' && !o.dying) defeat(o, true);
}
// たねブロック: たたくと 上に まめの つる(のぼれる)が のびていく。てっぺんは 2行目まで(HUD に かくれないように)
// (たねブロックは つるの 根もとになって、地面から 上まで 1本の つるに なる)
function growVine(tx, ty) {
  level.tiles[ty][tx] = ' ';
  let top = ty;
  while (top > 2 && !isSolid(tx, top - 1)) top--;
  let bottom = ty;
  while (bottom < ROWS - 1 && !isSolid(tx, bottom + 1) && tileAt(tx, bottom + 1) !== 'V') bottom++;
  world.grow = world.grow || [];
  world.grow.push({ x: tx, y: bottom, top, t: 0 });
  world.vineN = (world.vineN || 0) + 1;
  sfx('powerup', 0.9); sfx('item'); sparkle(tx * TILE + 24, ty * TILE - 10, 16); hitStop(0.05);
  if (!world.seenVine) { world.seenVine = true; toast = { text: 'まめの つるが のびた!', sub: '↑で のぼれるよ', t: 2.4 }; }
}
function updateGrow(dt) {
  if (!world.grow) return;
  for (const g of world.grow) {
    if (g.y < g.top) continue;
    g.t -= dt;
    if (g.t > 0) continue;
    if (tileAt(g.x, g.y) === ' ') level.tiles[g.y][g.x] = 'Z';
    if (Math.random() < 0.7) parts.push({ x: g.x * TILE + rnd(10, 38), y: g.y * TILE + 24, vx: rnd(-40, 40), vy: rnd(-60, -20), life: 0.5, max: 0.5, color: '#7dff8a', size: rnd(3, 5), g: 200 });
    g.y--; g.t = 0.06;
  }
}
function breakTile(tx, ty) {
  const c = tileAt(tx, ty);
  if (c === 'X' || c === 'B') {
    level.tiles[ty][tx] = ' ';
    sfx('break');
    debris(tx * TILE, ty * TILE, c === 'X' ? 'crate' : 'brick');
    world.score += 50;
    if (c === 'X' && Math.random() < 0.6) world.ents.push({ id: ++uid, t: 'coin', x: tx * TILE + 10, y: ty * TILE + 8, w: 28, h: 32, ph: 0 });
    return true;
  }
  return false;
}

function defeat(o, flip = false, combo = 1, poof = false) {
  if (o.dying) return;
  if (o.d.boss) { bossHit(o); return; }
  if (P && P.carry === o) P.carry = null;
  if (poof) {
    // スピンジャンプ: けむりに なって きえる
    o.gone = true; const pts = o.d.score * Math.min(8, 2 ** Math.max(0, combo - 1)); world.score += pts;
    popText(o.x + o.w / 2, o.y - 6, '+' + pts, '#fff');
    for (let i = 0; i < 9; i++) parts.push({ x: o.x + o.w / 2 + rnd(-16, 16), y: o.y + o.h / 2 + rnd(-12, 12), vx: rnd(-80, 80), vy: rnd(-90, -10), life: 0.5, max: 0.5, color: 'rgba(240,240,255,.85)', size: rnd(6, 10), g: 0, puff: true });
    sparkle(o.x + o.w / 2, o.y + o.h / 2, 8);
    return;
  }
  o.dying = true; o.dyingT = 0;
  o.vy = flip ? -520 : -300; o.vx = flip ? (Math.random() < 0.5 ? -1 : 1) * 120 : 0;
  const mul = Math.min(8, 2 ** Math.max(0, combo - 1)), pts = o.d.score * mul;
  world.score += pts;
  popText(o.x + o.w / 2, o.y - 6, '+' + pts + (mul > 1 ? ' ×' + mul : ''), mul > 1 ? '#ffe066' : '#fff');
  burst(o.x + o.w / 2, o.y + o.h / 2, '#ffd34d', 8, 200, 4);
  sparkle(o.x + o.w / 2, o.y + o.h / 2, 6);
}

function updatePlayer(dt) {
  const p = P;
  // 風(前のフレームで 風の中にいた分)とワープの出口のロック
  const wind = p.windAcc || 0; p.windAcc = 0;
  p.warpLock = !!p.touchPortal; p.touchPortal = false;
  if (p.dead) {
    p.deadT += dt;
    if (p.deadT > 0.45) { p.vy = Math.min(p.vy + GRAV * dt, MAXFALL); p.y += p.vy * dt; }
    if (p.deadT > 1.8) startLevel(world.idx, true);
    return;
  }
  if (world.clear) {
    p.vx = 0; p.vy = Math.min(p.vy + GRAV * dt, MAXFALL); p.face = 1;
    moveBody(p, dt, { ents: true });
    if (p.onGround && world.clearT > 0.4) { p.vy = -520; p.squash = 0.8; sparkle(p.x + p.w / 2, p.y, 6); }
    world.fwT -= dt;
    if (world.fwT <= 0 && world.clearT < 3.2) { world.fwT = rnd(0.22, 0.38); firework(cam.x + rnd(120, VW - 120), cam.y + rnd(70, 260)); }
    if (Math.random() < dt * 3 && world.clearT < 3) confetti(6);
    return;
  }
  // ひくい じゅうりょく(前のフレームで その中に いたか)
  p.inLow = !!p.lowFlag; p.lowFlag = false;
  if (p.zipCD > 0) p.zipCD -= dt;
  if (p.cannonCD > 0) p.cannonCD -= dt;
  if (p.inv > 0 && (p.zip || p.inCannon)) p.inv -= dt;
  // ジップライン: とってに ぶらさがって すべる(うごかすのは updateThing の zip)。ジャンプで はなす
  if (p.zip) {
    p.vx = 0; p.vy = 0; p.onGround = false; p.climb = false; p.standOn = null;
    if (consume('jump') || consume('up')) zipRelease(p.zip, true);
    consume('attack'); consume('dash');
    return;
  }
  // ほしの たいほう: 中に入ると 少しして とびだす(ジャンプで すぐ うてる)
  if (p.inCannon) {
    const c = p.inCannon;
    p.x = c.x + c.w / 2 - p.w / 2; p.y = c.y + c.h - p.h; p.vx = 0; p.vy = 0; p.onGround = false;
    c.fireT -= dt;
    const jumpNow = consume('jump') && c.fireT < 0.35;
    consume('attack'); consume('dash'); consume('up');
    if (c.fireT <= 0 || jumpNow) fireCannon(c);
    return;
  }
  if (consume('item')) dropReserve();
  if (p.mountCD > 0) p.mountCD -= dt;
  if (p.swim && p.mount) mountOff('quiet');
  updateCarry(p);
  const L = held('left'), R = held('right');
  let dir = (R ? 1 : 0) - (L ? 1 : 0);
  if (p.lockT > 0) { p.lockT -= dt; dir = 0; }
  if (p.launchT > 0) p.launchT -= dt;
  const onIce = p.onGround && p.groundTile === 'I';
  const jet = p.jetT > 0;
  const fast = (p.bootsT > 0 ? 1.35 : 1) * (jet ? 1.15 : 1);
  if (p.jetT > 0) p.jetT -= dt;
  const acc = (p.onGround ? (onIce ? 760 : ACC) : AIRACC) * (fast > 1 ? 1.25 : 1);
  if (p.dashT <= 0) {
    if (dir) {
      p.vx += dir * acc * dt;
      if (p.attackT <= 0) p.face = dir;
    } else if (p.onGround) {
      const f = (onIce ? 420 : FRICT) * dt;
      p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
    } else if (!(p.launchT > 0)) {
      // 空中で手を離したら少しずつ止まる(動きを決めやすく)
      const f = 600 * dt;
      p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
    }
    // たいほう・ジップラインで とんでいる間は 速さを おさえない
    const lim = p.launchT > 0 ? 1300 : p.boostT > 0 ? 640 : MAXV * fast * (p.swim ? 0.65 : 1) * (p.mount ? 1.12 : 1);
    if (Math.abs(p.vx) > lim) p.vx = lerp(p.vx, Math.sign(p.vx) * lim, Math.min(1, dt * (p.onGround ? 14 : 4)));
  }
  if (p.boostT > 0) { p.boostT -= dt; if (Math.random() < dt * 30) parts.push({ x: p.x + p.w / 2 - p.face * 16, y: p.y + rnd(10, 50), vx: -p.face * 120, vy: 0, life: 0.3, max: 0.3, color: '#ffd84a', size: 4, g: 0 }); }
  if (p.bootsT > 0) { p.bootsT -= dt; if (Math.abs(p.vx) > 200 && Math.random() < dt * 20) parts.push({ x: p.x + p.w / 2, y: p.y + p.h - 6, vx: -p.vx * 0.2, vy: -20, life: 0.3, max: 0.3, color: '#7fd8ff', size: 4, g: 0 }); }
  if (p.magnetT > 0) p.magnetT -= dt;
  const cx = Math.floor((p.x + p.w / 2) / TILE), cy = Math.floor((p.y + p.h / 2) / TILE);
  // はしご
  const ladderHere = isLadder(tileAt(cx, cy)) || isLadder(tileAt(cx, Math.floor((p.y + p.h - 2) / TILE)));
  const ladderBelow = isLadder(tileAt(cx, Math.floor((p.y + p.h + 4) / TILE)));
  if (!p.climb && !p.mount && ((ladderHere && held('up')) || (ladderBelow && held('down') && p.onGround))) {
    if (p.carry) dropCarry(false);
    p.climb = true; p.fly = null; p.spin = false; p.vx = 0; p.x = cx * TILE + (TILE - p.w) / 2; if (ladderBelow && !ladderHere) p.y += 6;
  }
  if (p.climb) {
    const ud = (held('down') ? 1 : 0) - (held('up') ? 1 : 0);
    p.vy = ud * 230; p.vx = dir * 90;
    p.anim += dt * (ud ? 3 : 0);
    if (consume('jump')) { p.climb = false; p.vy = -JUMPV * 0.85; p.jumping = true; sfx('jump'); }
    p.standOn = null;
    moveBody(p, dt, { ents: true, drop: true });
    const still = isLadder(tileAt(cx, Math.floor((p.y + p.h / 2) / TILE))) || isLadder(tileAt(cx, Math.floor((p.y + p.h - 2) / TILE)));
    if (!still || (p.onGround && ud > 0)) { p.climb = false; if (!still && ud < 0) { p.vy = -300; } }
    consume('up'); consume('attack');
    p.airJumps = maxAirJumps(); p.airDash = 1;
    if (p.inv > 0) p.inv -= dt;
    return;
  }
  // 壁: 空中で壁に向かって押すと、ゆっくり滑り落ちる
  const midY = Math.floor((p.y + p.h * 0.5) / TILE), lowY = Math.floor((p.y + p.h - 8) / TILE);
  const wallL = isSolid(Math.floor((p.x - 3) / TILE), midY) || isSolid(Math.floor((p.x - 3) / TILE), lowY);
  const wallR = isSolid(Math.floor((p.x + p.w + 3) / TILE), midY) || isSolid(Math.floor((p.x + p.w + 3) / TILE), lowY);
  p.wallSlide = !p.onGround && !p.swim && p.vy > 0 && ((dir < 0 && wallL) || (dir > 0 && wallR)) ? dir : 0;
  if (p.wallSlide) { p.airJumps = Math.max(p.airJumps, 0); if (Math.random() < dt * 14) dust(p.wallSlide > 0 ? p.x + p.w : p.x, p.y + p.h - 10, 1); }
  // おばけやしきの とびら: ↑で 入る(ジャンプより 先に みる)
  if (pressed.up && p.onGround) { const dr = world.ents.find(o => o.t === 'wdoor' && o.near); if (dr) { consume('up'); dr.open = 1; warpPlayer(dr.to[0], dr.to[1], 0.2); const back = world.ents.find(o => o.t === 'wdoor' && Math.abs(o.x - dr.to[0] * TILE) < 2); if (back) { back.open = 1; back.near = true; } } }
  // ジャンプ(先行入力と崖のゆとり)。スピンジャンプは V。もこりゅうに のっているときは とびおりる(ふみ台に して 高く)
  if (consume('spin')) { if (p.mount) mountOff('jump'); else { p.jumpBuf = 0.15; p.spinReq = true; } }
  if (consume('jump') || consume('up')) { p.jumpBuf = 0.15; p.spinReq = false; }
  p.jumpBuf -= dt;
  p.coyote = p.onGround ? 0.12 : p.coyote - dt;
  if (p.onGround) { p.airJumps = maxAirJumps(); p.airDash = 1; }
  p.swim = tileAt(cx, cy) === 'W';
  if (p.jumpBuf > 0) {
    if (p.coyote > 0 || p.swim) {
      const drop = held('down') && p.onGround && isOneWay(Math.floor((p.x + p.w / 2) / TILE), Math.floor((p.y + p.h + 2) / TILE));
      if (drop) { p.dropT = 0.25; p.y += 4; p.jumpBuf = 0; }
      else {
        // 水面の近くなら水をけって高く跳ぶ(岸に上がれるように)
        p.vy = p.swim ? (tileAt(cx, cy - 1) === 'W' ? -440 : -780) : -JUMPV;
        p.jumpBuf = 0; p.coyote = 0; p.onGround = false; p.jumping = true;
        if (p.spinReq && !p.swim) { p.vy = -JUMPV * 0.94; p.spin = true; sfx('jump', 0.78); sfx('swing', 1.4); }
        else if (hasPower('cape') && p.runM >= 1 && !p.swim && !p.mount && !p.carry) { p.fly = 'rise'; p.flyT = 0.85; p.vy = -JUMPV * 1.06; sfx('dash', 0.8); sfx('jump2', 1.2); if (!world.seenFly) { world.seenFly = true; toast = { text: 'ほしの マントで とんだ!', sub: 'すすむ むきを おすと きゅうこうか・はんたいを おすと のぼる', t: 3 }; } }
        else sfx('jump', p.swim ? 0.8 : 1);
        if (!p.swim) { dust(p.x + p.w / 2, p.y + p.h, 4); p.squash = 0.8; }
      }
    } else if (!p.swim && (p.wallSlide || ((wallL || wallR) && p.vy > -200))) {
      // 壁ジャンプ
      const away = wallL ? 1 : -1;
      p.vx = away * 340; p.vy = -JUMPV * 0.95; p.face = away; p.lockT = 0.14; p.jumping = true; p.jumpBuf = 0;
      p.airJumps = maxAirJumps(); p.airDash = 1;
      sfx('jump', 1.15); dust(wallL ? p.x : p.x + p.w, p.y + p.h - 12, 5);
    } else if (!p.swim && p.airJumps > 0) {
      // 二段ジャンプ(つばさ)・三段ジャンプ(ジェットつばさ)
      p.airJumps--; p.jumpBuf = 0; p.vy = -JUMPV * 0.9; p.jumping = true; p.flapT = 0.35; p.fly = null; p.spin = !!p.spinReq;
      sfx('jump2', jet && p.airJumps === 0 ? 1.25 : 1);
      for (let i = 0; i < 8; i++) parts.push({ x: p.x + p.w / 2 + rnd(-14, 14), y: p.y + p.h - 10, vx: rnd(-90, 90), vy: rnd(20, 120), life: 0.5, max: 0.5, color: jet ? '#ffe066' : '#ffffff', size: rnd(3, 5), g: 200, puff: true });
    }
  }
  if (p.flapT > 0) p.flapT -= dt;
  if (p.vy >= 0) p.jumping = false;
  // 空中ダッシュ(ダッシュブーツを取ったあと)
  p.dashCD = (p.dashCD || 0) - dt;
  if (!p.carry && consume('dash') && hasPower('dash') && p.dashCD <= 0 && (p.onGround || p.airDash > 0) && !p.swim) {
    if (!p.onGround) p.airDash--;
    p.dashT = 0.17; p.dashCD = 0.38; p.vx = (dir || p.face) * 780; p.face = dir || p.face; p.vy = Math.min(p.vy, 0) * 0.2;
    sfx('dash'); dust(p.x + p.w / 2, p.y + p.h - 6, 4);
  }
  if (p.dashT > 0) {
    p.dashT -= dt; p.vy = 0;
    parts.push({ x: p.x + p.w / 2, y: p.y + p.h / 2, vx: 0, vy: 0, life: 0.18, max: 0.18, ghost: true, face: p.face });
    if (p.dashT <= 0) p.vx = p.face * MAXV;
  }
  // 剣
  p.attackCD -= dt;
  if (p.mount) { if (consume('attack') && p.attackCD <= 0) { p.attackCD = 0.3; mountAttack(p.mount); } }
  else if (p.carry) consume('attack');
  else if (consume('attack') && p.attackCD <= 0) {
    p.attackT = 0.22; p.attackCD = 0.3; p.hitIds.clear(); p.swHit = false;
    sfx('swing', rnd(0.95, 1.1));
    if (hasPower('fire')) { world.ents.push({ id: ++uid, t: 'wave', x: p.x + p.w / 2 + p.face * 20 - 16, y: p.y + 10, w: 32, h: 34, vx: p.face * 520, life: 0.55, face: p.face, hit: new Set() }); sfx('fire', 1.3); }
  }
  if (p.attackT > 0) {
    p.attackT -= dt;
    const reach = perkOn(1) ? 78 : 60;
    const hb = { x: p.face > 0 ? p.x + p.w - 4 : p.x - reach + 4, y: p.y + 2, w: reach, h: 50 };
    // 木箱とレンガ
    const tx0 = Math.floor(hb.x / TILE), tx1 = Math.floor((hb.x + hb.w) / TILE), ty0 = Math.floor(hb.y / TILE), ty1 = Math.floor((hb.y + hb.h) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (tileAt(tx, ty) === 'X') breakTile(tx, ty);
      else if (tileAt(tx, ty) === '%' && !p.swHit) { p.swHit = true; world.bumps.set(tx + ',' + ty, 0.18); toggleSwitch(tx, ty); }
    }
    for (const o of world.ents) {
      if ((o.t === 'magic' || o.t === 'ball' || o.t === 'bone' || o.t === 'spit') && overlap(hb, o)) { o.gone = true; sparkle(o.x + 12, o.y + 12, 8); sfx('hit', 1.3); world.score += 50; continue; }
      if (o.t !== 'enemy' || o.dying || p.hitIds.has(o.id) || !overlap(hb, o)) continue;
      p.hitIds.add(o.id);
      if (!o.d.sword) { sfx('bump', 1.3); burst(o.x + o.w / 2, o.y + o.h / 2, '#ddd', 5, 150, 3); continue; }
      if (o.type === 'skeleton' && o.face === -p.face && o.state !== 'stun') {
        sfx('bump', 1.4); sparkle(hb.x + (p.face > 0 ? hb.w : 0), hb.y + 20, 6);
        p.vx = -p.face * 300; o.vx = p.face * 120; o.state = 'stun'; o.timer = 0.5;
        continue;
      }
      if (o.type === 'bomb') { lightBomb(o, p.face * 340); continue; }
      if (o.d.boss) { if (bossHit(o) === false) p.vx = -p.face * 260; continue; }
      if (o.type === 'slime' && o.big) { splitSlime(o); continue; }
      sfx('hit'); defeat(o, true); hitStop(0.05);
      cam.shake = Math.max(cam.shake, 0.08);
    }
  }
  // 重力: 上がる間はボタンを押していれば軽く、離すと重く。落ちるときは少し重く
  let g, maxFall = MAXFALL;
  if (p.swim) { g = GRAV * 0.28; maxFall = 160; }
  else if (p.dashT > 0) { g = 0; }
  else if (p.vy < 0) g = p.launchT > 0 && !p.jumping ? GRAV_LAUNCH : held('jump') || held('up') ? GRAV_UP : (p.jumping ? GRAV_CUT : GRAV_LAUNCH);
  else {
    g = GRAV_DOWN;
    if (p.wallSlide) maxFall = 170;
    // つばさで滑空(落ちるときにジャンプを押し続ける)
    if (hasPower('wing') && held('jump') && p.airJumps === 0 && !p.onGround) { maxFall = 120; p.gliding = true; if (Math.random() < dt * 10) parts.push({ x: p.x + p.w / 2 + rnd(-20, 20), y: p.y + 20, vx: rnd(-30, 30), vy: 40, life: 0.4, max: 0.4, color: '#ffffff', size: 3, g: 0, puff: true }); }
    else p.gliding = false;
  }
  // ほしの マント: おちるとき ジャンプを おしていると ゆっくり(とんでいる 間は 下の capeFly で)
  if (hasPower('cape') && !p.fly && !p.onGround && !p.swim && p.vy > 0 && held('jump') && !p.spin) { maxFall = Math.min(maxFall, 130); p.gliding = true; }
  // もこりゅうが 空を とべる(ハチなどを たべた)あいだ: ジャンプ長押しで はばたく
  if (p.mount && p.mount.flyT > 0 && !p.onGround && held('jump') && p.vy > -260) { g = 0; p.vy = Math.max(p.vy - 2400 * dt, -300); p.mount.flap = 0.2; }
  if (p.fly) { const r = capeFly(p, dt, dir); g = r.g; maxFall = r.maxFall; }
  // ひくい じゅうりょく: ふわっと 高く・ゆっくり おちる
  if (p.inLow && !p.swim) { g *= 0.6; maxFall = Math.min(maxFall, 380); if (Math.random() < dt * 6) parts.push({ x: p.x + p.w / 2 + rnd(-16, 16), y: p.y + p.h, vx: rnd(-20, 20), vy: rnd(-40, -10), life: 0.6, max: 0.6, color: '#d8c8ff', size: 2.5, g: 0, star: true }); }
  p.vy = Math.min(p.vy + g * dt, maxFall);
  // 足場に乗っていたら一緒に動く
  if (p.standOn && p.standOn.dx !== undefined && p.onGround) { p.x += p.standOn.dx; p.y += p.standOn.dy || 0; }
  p.standOn = null;
  p.dropT = (p.dropT || 0) - dt;
  const wasGround = p.onGround;
  const vyBefore = p.vy;
  // ベルトコンベアも 外から押す速さとして足す(壁に めりこまないように)
  const belt = wasGround && (p.groundTile === '}' || p.groundTile === '{') ? (p.groundTile === '}' ? 130 : -130) : 0;
  moveBody(p, dt, { ents: true, drop: p.dropT > 0, ext: wind + belt, corner: true });
  if (p.onGround) p.launchT = 0;
  // スピンジャンプで 落ちてきたら、下の レンガ・くるくるブロックを こわして そのまま おちる / トゲの ブロックの 上では はねる
  if (p.spin && p.onGround && vyBefore > 150) {
    const fy = Math.floor((p.y + p.h + 2) / TILE), xa = Math.floor((p.x + 4) / TILE), xb = Math.floor((p.x + p.w - 4) / TILE);
    let broke = false;
    for (let tx = xa; tx <= xb; tx++) { const c = tileAt(tx, fy); if (c === 'B' || c === 'j') { level.tiles[fy][tx] = ' '; debris(tx * TILE, fy * TILE, c === 'B' ? 'brick' : 'metal'); broke = true; } }
    if (broke) { sfx('break'); world.score += 50; cam.shake = Math.max(cam.shake, 0.1); p.onGround = false; p.vy = Math.max(260, vyBefore * 0.7); }
    else if (p.groundTile === 'K') { p.vy = -620; p.onGround = false; p.spinSafe = 0.15; sfx('stomp', 1.3); sparkle(p.x + p.w / 2, p.y + p.h, 8); }
  }
  if (p.spinSafe > 0) p.spinSafe -= dt;
  // ほしの マントの きゅうこうかで 地面に おりたら 地ひびき(近くの 地面の 敵を たおす)
  if (p.fly && (p.onGround || p.swim || p.climb)) { if (p.onGround && vyBefore > 420 && p.fly === 'dive') capeQuake(p); p.fly = null; }
  if (p.fly && p.hitWall) p.fly = null;
  if (p.onGround && !p.fly) p.spin = false;
  if (p.swim || p.climb) p.spin = false;
  // はしる メーター(マント): 地面を はやく 走りつづけると たまる
  if (hasPower('cape')) {
    if (p.onGround && Math.abs(p.vx) >= MAXV * 0.92 && dir) p.runM = Math.min(1, p.runM + dt / 0.75);
    else if (p.onGround) p.runM = Math.max(0, p.runM - dt * 2.5);
    else if (!p.fly) p.runM = Math.max(0, p.runM - dt * 0.6);
  } else p.runM = 0;
  // はねる ブロック: のると ぽーんと はねる(ジャンプを おしていると もっと 高く)
  if (p.onGround && p.groundTile === '7') {
    const ntx = Math.floor((p.x + p.w / 2) / TILE), nty = Math.floor((p.y + p.h + 2) / TILE);
    p.vy = held('jump') ? -1080 : -700; p.jumping = false; p.onGround = false; p.coyote = 0; p.airJumps = maxAirJumps(); p.airDash = 1;
    world.bumps.set('n' + ntx + ',' + nty, 0.18); sfx('spring', 1.15 + Math.random() * 0.1); dust(p.x + p.w / 2, p.y + p.h, 4);
    p.combo = 0;
  }
  if (p.onGround && !wasGround) {
    p.combo = 0;
    // 着地: 落ちた速さに合わせて つぶれと 土けむり
    if (vyBefore > 250) { dust(p.x + p.w / 2, p.y + p.h, vyBefore > 600 ? 6 : 3); p.squash = 1 + Math.min(0.24, vyBefore / 3400); }
  }
  if (p.headHit) bumpTile(p.headHit.tx, p.headHit.ty);
  p.squash = lerp(p.squash, 1, Math.min(1, dt * 12));
  p.anim += dt * (Math.abs(p.vx) > 20 ? Math.abs(p.vx) / 160 : 1);
  if (p.inv > 0) p.inv -= dt;
  // 走ると時々ほこり
  if (p.onGround && Math.abs(p.vx) > 200 && Math.random() < dt * 8) dust(p.x + p.w / 2 - p.face * 10, p.y + p.h, 1);
  // トゲ
  const fx0 = Math.floor((p.x + 4) / TILE), fx1 = Math.floor((p.x + p.w - 4) / TILE), fy = Math.floor((p.y + p.h - 6) / TILE);
  for (let tx = fx0; tx <= fx1; tx++) if (tileAt(tx, fy) === '^' && p.y + p.h > fy * TILE + 22) { hurtPlayer(tx * TILE + 24); p.vy = -620; }
  // トゲのブロック(さわると痛い)
  for (const [tx, ty, below] of [[Math.floor((p.x - 2) / TILE), midY], [Math.floor((p.x + p.w + 2) / TILE), midY], [cx, Math.floor((p.y + p.h + 2) / TILE), 1], [cx, Math.floor((p.y - 2) / TILE)]]) if (tileAt(tx, ty) === 'K' && !(below && (p.spinSafe > 0 || p.spin))) { hurtPlayer(tx * TILE + 24); break; }
  // 溶岩
  for (let tx = fx0; tx <= fx1; tx++) if (tileAt(tx, Math.floor((p.y + p.h - 14) / TILE)) === 'V') { burst(p.x + p.w / 2, p.y + p.h, '#ff7a1f', 16, 260, 6); killPlayer(); break; }
  // 落ちた
  if (p.y > ROWS * TILE + 60) killPlayer();
  if (p.x < 0) { p.x = 0; p.vx = 0; }
  if (p.x > level.W * TILE - p.w) p.x = level.W * TILE - p.w;
}
// ワープ(いど・とびら): (tx,ty) の 地面の 上へ
function warpPlayer(tx, ty, flash = 0.3) {
  const p = P;
  sparkle(p.x + p.w / 2, p.y + p.h / 2, 12);
  p.x = tx * TILE + 24 - p.w / 2; p.y = (ty + 1) * TILE - p.h; p.vx = 0; p.vy = 0; p.standOn = null; p.climb = false; p.fly = null;
  if (p.carry) { p.carry.x = p.x; p.carry.y = p.y; }
  world.warpFlash = flash; camSnap(); if (world.auto) world.auto.x = clamp(p.x - 300, 0, Math.max(0, level.W * TILE - VW));
  sfx('door', 1.2);
}
function zipRelease(o, jumped) {
  o.state = 'back';
  if (P.zip !== o) return;
  P.zip = null;
  const ux = (o.bx - o.ax) / o.len, uy = (o.by - o.ay) / o.len;
  P.vx = ux * o.v * 0.95; P.vy = uy * o.v * 0.6 + (jumped ? -640 : -200);
  P.jumping = false; P.zipCD = 0.4; P.launchT = 0.7; P.airJumps = maxAirJumps(); P.airDash = 1; P.face = ux >= 0 ? 1 : -1;
  sfx(jumped ? 'jump' : 'jump2', 1.1);
}
function fireCannon(c) {
  const p = P;
  p.inCannon = null; p.cannonCD = 0.5;
  p.vx = Math.cos(c.ang) * c.power; p.vy = Math.sin(c.ang) * c.power; p.face = p.vx >= 0 ? 1 : -1;
  p.launchT = 2; p.lockT = 0.3; p.jumping = false; p.airJumps = maxAirJumps(); p.airDash = 1;
  p.x = c.x + c.w / 2 - p.w / 2 + Math.cos(c.ang) * 20; p.y = c.y - p.h + 10;
  c.recoil = 1; sfx('boom', 1.2); sfx('dash', 0.9); cam.shake = Math.max(cam.shake, 0.18);
  const mx = c.x + 24 + Math.cos(c.ang) * 40, my = c.y + 24 + Math.sin(c.ang) * 40;
  burst(mx, my, '#ffd84a', 12, 260, 5);
  for (let i = 0; i < 8; i++) parts.push({ x: mx + rnd(-10, 10), y: my + rnd(-10, 10), vx: rnd(-40, 40), vy: rnd(-60, -10), life: 0.7, max: 0.7, color: 'rgba(200,200,220,.7)', size: rnd(8, 12), g: 0, puff: true });
}
function maxAirJumps() { return (hasPower('wing') ? 1 : 0) + (P && P.jetT > 0 ? 1 : 0); }

// ---------- もこりゅう(のれる あいぼう) ----------
// たまごブロック(e)を たたくと たまごが 出て、もこりゅうが うまれる。ふれると のれる。
// のっている間: X で したを のばして 敵を たべる(ほのおの 敵 → ほのおを はく / とぶ 敵 → しばらく とべる / こうら → はきだす)。
// ぶつかると にげていくので おいかけて のりなおす。V で とびおりると 高く とべる(ふみ台)。
function mountRide(m) {
  const p = P;
  if (p.mount || p.climb || p.swim || p.zip || p.inCannon || p.dead || p.mountCD > 0) return;
  // 頭の 上が ふさがっていたら のれない
  const x0 = Math.floor((p.x + 2) / TILE), x1 = Math.floor((p.x + p.w - 2) / TILE), ty = Math.floor((p.y - 26) / TILE);
  for (let tx = x0; tx <= x1; tx++) if (isSolid(tx, ty)) return;
  if (p.carry) dropCarry(false);
  p.mount = m; m.state = 'ridden'; m.vx = 0; m.timer = 0;
  p.y -= 26; p.h = 80; p.fly = null; p.spin = false;
  sfx('powerup', 1.25); sfx('jump2', 0.7); sparkle(m.x + m.w / 2, m.y, 12);
  if (!save.seen.moko) { save.seen.moko = true; writeSave(); toast = { text: 'もこりゅうに のった!', sub: usingTouch ? 'けん: したで たべる / スピン: とびおりる' : 'X: したを のばして たべる  V: とびおりる(高く とべる)', t: 3.4 }; }
}
function mountOff(how, fromX) {
  const p = P, m = p.mount;
  if (!m) return;
  p.mount = null; p.h = 54; p.y += 26;
  m.x = p.x + p.w / 2 - m.w / 2; m.y = p.y + p.h - m.h; m.tongue = null; m.vy = 0;
  if (how === 'jump') {
    // ふみ台に して 高く とぶ
    p.vy = -JUMPV * 1.08; p.jumping = true; p.onGround = false; p.coyote = 0; p.mountCD = 0.6; p.airJumps = maxAirJumps();
    m.state = 'idle'; m.vy = 380; m.y = p.y + p.h + 2;
    sfx('jump', 1.2); dust(m.x + m.w / 2, m.y, 5);
  } else if (how === 'hurt') {
    const away = fromX !== undefined && fromX > p.x + p.w / 2 ? -1 : 1;
    m.state = 'flee'; m.timer = 2.2; m.face = away; m.vx = away * 250; m.vy = -380;
    p.vy = -460; p.vx = -away * 120; p.inv = 1.4; p.mountCD = 0.7;
    sfx('hurt', 1.2); cam.shake = 0.2; hitStop(0.06);
    if (!world.seenFlee) { world.seenFlee = true; toast = { text: 'もこりゅうが にげた!', sub: 'おいかけて ふれると また のれる', t: 2.4 }; }
  } else { m.state = 'idle'; p.mountCD = 0.6; }
}
function mountAttack(m) {
  const p = P, mx = p.x + p.w / 2 + p.face * 22, my = p.y + p.h - 34;
  if (m.fire > 0) {
    m.fire--; sfx('fire', 1.0); sfx('boom', 1.8);
    for (const dy of [-60, 0, 60]) world.ents.push({ id: ++uid, t: 'wave', x: mx - 16, y: my - 18, w: 32, h: 34, vx: p.face * 480, vy: dy, life: 0.7, face: p.face, hit: new Set(), moko: true });
    return;
  }
  if (m.held) {
    // くわえた こうらを はきだす
    const e = spawn({ kind: 'enemy', type: 'shell', x: Math.floor(mx / TILE), opt: {} });
    e.x = mx - e.w / 2 + p.face * 20; e.y = my - e.h / 2; e.state = 'slide'; e.face = p.face; e.vx = p.face * 520; e.kickT = 0.3; e.awake = true;
    world.ents.push(e); m.held = null; sfx('stomp', 1.3); return;
  }
  m.tongue = { t: 0, got: null }; m.face = p.face; sfx('swing', 1.6);
}
const MOKO_FIRE = new Set(['firespirit', 'plant', 'bomb']);
const MOKO_FLY = new Set(['bee', 'bat', 'eye']);
const MOKO_SHELL = new Set(['shell', 'beetle', 'spiky']);
function mountEat(m, e) {
  const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
  e.gone = true; world.score += 200; popText(ex, ey - 10, '+200');
  sfx('stomp', 1.6); sparkle(ex, ey, 8);
  if (MOKO_FIRE.has(e.type)) { m.fire = 3; popText(ex, ey - 34, 'ほのおが はける!', '#ff9a2e'); if (!world.seenMokoFire) { world.seenMokoFire = true; toast = { text: 'ほのおの てきを たべた!', sub: 'X で ほのおを 3かい はける', t: 2.4 }; } }
  else if (MOKO_FLY.has(e.type)) { m.flyT = 10; popText(ex, ey - 34, 'しばらく とべる!', '#bff4ff'); if (!world.seenMokoFly) { world.seenMokoFly = true; toast = { text: 'とぶ てきを たべた!', sub: '10びょう ジャンプ長押しで はばたける', t: 2.4 }; } }
  else if (MOKO_SHELL.has(e.type)) { m.held = e.type; popText(ex, ey - 34, 'くわえた!', '#fff'); }
  else { world.coins++; sfx('coin', 1.2); }
}
function updateMount(m, dt) {
  const p = P;
  m.ph = (m.ph || 0) + dt;
  if (m.flyT > 0) m.flyT -= dt;
  if (m.flap > 0) m.flap -= dt;
  if (m.state === 'ridden') {
    if (p.mount !== m) { m.state = 'idle'; return; }
    m.face = p.face; m.x = p.x + p.w / 2 - m.w / 2; m.y = p.y + p.h - m.h;
    if (m.tongue) {
      const tg = m.tongue; tg.t += dt;
      const len = Math.sin(Math.min(1, tg.t / 0.26) * Math.PI) * 130;
      const tx = m.x + m.w / 2 + m.face * (18 + len), ty = m.y + 12;
      tg.x = tx; tg.y = ty; tg.len = len;
      if (!tg.got) {
        const box = { x: tx - 16, y: ty - 16, w: 32, h: 32 };
        for (const e of world.ents) {
          if (e.t === 'enemy' && !e.dying && !e.d.boss && !['orb', 'turret', 'wizard', 'ghost'].includes(e.type) && overlap(box, e)) { tg.got = e.type; mountEat(m, e); break; }
          if ((e.t === 'coin' || e.t === 'heart' || e.t === 'shard' || e.t === 'star') && overlap(box, e)) { collect(e); break; }
        }
      }
      if (tg.t > 0.26) m.tongue = null;
    }
    return;
  }
  // のっていない とき: じゅうりょくで うごく
  m.vy = Math.min((m.vy || 0) + GRAV * dt, MAXFALL);
  if (m.state === 'flee') {
    m.timer -= dt; m.vx = m.face * 250;
    if (m.timer <= 0) { m.state = 'wait'; m.timer = 7; m.vx = 0; }
  } else if (m.state === 'wait') {
    m.timer -= dt; m.vx = 0;
    if (m.timer <= 0) { m.state = 'leave'; m.timer = 1.2; m.vy = -500; sfx('jump2', 0.6); }
  } else if (m.state === 'leave') {
    m.timer -= dt; m.vx = m.face * 200; if (m.timer <= 0) { m.gone = true; sparkle(m.x + m.w / 2, m.y, 10); }
  } else m.vx *= 0.8;
  if (tileAt(Math.floor((m.x + m.w / 2) / TILE), Math.floor((m.y + m.h / 2) / TILE)) === 'W') { m.vy = Math.min(m.vy, 60); if (m.state !== 'leave') m.vy -= 900 * dt; }
  moveBody(m, dt);
  if ((m.state === 'flee') && m.hitWall) { m.vy = -560; }
  if (m.y > ROWS * TILE + 80) { m.gone = true; return; }
  if (m.state !== 'leave' && !p.dead && !p.mount && p.mountCD <= 0 && overlap(p, m)) mountRide(m);
}
function updateEgg(o, dt) {
  o.vy = Math.min((o.vy || 0) + 1600 * dt, MAXFALL); moveBody(o, dt);
  o.timer -= dt;
  if (o.timer <= 0) {
    o.gone = true;
    sfx('oneup'); sparkle(o.x + o.w / 2, o.y + o.h / 2, 18); burst(o.x + o.w / 2, o.y + o.h / 2, '#ffffff', 10, 200, 5);
    if (world.ents.some(e => e.t === 'mount' && !e.gone)) { world.ents.push({ id: ++uid, t: 'oneup', x: o.x, y: o.y, w: 36, h: 36, ph: 0, vy: -300 }); return; }
    world.ents.push({ id: ++uid, t: 'mount', x: o.x - 4, y: o.y - 4, w: 44, h: 44, vx: 0, vy: -200, face: 1, state: 'idle', timer: 0, fire: 0, flyT: 0 });
    if (!save.seen.mokoBorn) { save.seen.mokoBorn = true; writeSave(); toast = { text: 'もこりゅうが うまれた!', sub: 'ふれると のれるよ', t: 2.6 }; }
  }
}

// ---------- ほしの マント ----------
// はしる メーターが たまったら ジャンプで とびあがる(rise)。てっぺんから(soar)は すすむ むきを おすと きゅうこうか(dive)、
// はんたいを おすと 上へ(のぼる 力は きゅうこうかで ためる)。きゅうこうかで 地面に おりると 地ひびき。
function capeFly(p, dt, dir) {
  if (p.fly === 'rise') {
    p.flyT -= dt;
    if (p.flyT <= 0 || !held('jump') || p.vy > -120) { p.fly = 'soar'; p.flyE = 0.6; }
    p.vx = p.face * Math.max(Math.abs(p.vx), 330);
    return { g: GRAV_UP * 0.4, maxFall: MAXFALL };
  }
  const fwd = dir === p.face, back = dir && dir !== p.face;
  if (p.fly === 'soar' || p.fly === 'dive' || p.fly === 'pull') {
    if (fwd) { p.fly = 'dive'; p.vy = Math.min(p.vy + 1700 * dt, 640); p.vx = p.face * Math.min(470, Math.abs(p.vx) + 400 * dt); p.flyE = Math.min(1.4, (p.flyE || 0) + dt * 1.2); }
    else if (back && p.flyE > 0) { p.fly = 'pull'; p.flyE -= dt; p.vy = Math.max(p.vy - 2200 * dt, -360); p.vx = p.face * Math.max(200, Math.abs(p.vx) - 300 * dt); }
    else { p.fly = 'soar'; p.vy += (70 - p.vy) * Math.min(1, dt * 3); p.vx = p.face * Math.max(300, Math.abs(p.vx) - 60 * dt); }
    if (Math.random() < dt * 14) parts.push({ x: p.x + p.w / 2 - p.face * 20, y: p.y + 20, vx: -p.face * 60, vy: rnd(-20, 20), life: 0.5, max: 0.5, color: Math.random() < 0.5 ? '#ffe066' : '#c78bff', size: 3, g: 0, star: true });
    return { g: 0, maxFall: 640 };
  }
  return { g: GRAV_DOWN, maxFall: MAXFALL };
}
function capeQuake(p) {
  sfx('boom', 0.7); sfx('break', 0.6); cam.shake = 0.45; hitStop(0.08);
  dust(p.x + p.w / 2 - 30, p.y + p.h, 8); dust(p.x + p.w / 2 + 30, p.y + p.h, 8);
  let n = 0;
  for (const o of world.ents) if (o.t === 'enemy' && !o.dying && !o.d.boss && !o.d.fly && Math.abs(o.x + o.w / 2 - (p.x + p.w / 2)) < 6 * TILE && Math.abs(o.y + o.h - (p.y + p.h)) < 2 * TILE) { defeat(o, true, ++n); }
  if (n) popText(p.x + p.w / 2, p.y - 20, 'じひびき!', '#ffe066');
}

// ---------- もちはこび(こうら・なげブロック・ばね・ぎんの スイッチ) ----------
// C / Shift(ダッシュの ボタン)を おしたまま ふれると もつ。はなすと なげる(↑を おしていると 上へ、↓で そっと おく)。
const canCarry = o => o && !o.gone && !o.held && ((o.t === 'enemy' && o.type === 'shell' && o.state === 'shell') || ((o.t === 'tblock' || o.t === 'pswitch' || o.t === 'spring') && o.carry && !(o.t === 'pswitch' && o.pressed)));
function nearCarry() {
  if (!P || !world || scene !== 'play') return false;
  if (P.carry) return true;
  const box = { x: P.x - 10, y: P.y, w: P.w + 20, h: P.h + 4 };
  return world.ents.some(o => canCarry(o) && overlap(box, o));
}
function updateCarry(p) {
  if (p.carry) {
    const o = p.carry;
    if (o.gone) { p.carry = null; return; }
    o.x = p.x + p.w / 2 + p.face * 18 - o.w / 2; o.y = p.y + 14 - (o.h - 34) / 2; o.vx = 0; o.vy = 0;
    if (!held('dash')) throwCarry(p);
    return;
  }
  if (!held('dash') || p.mount || p.climb || p.swim || p.zip || p.inCannon) return;
  const box = { x: p.x - 8, y: p.y + 4, w: p.w + 16, h: p.h };
  for (const o of world.ents) if (canCarry(o) && overlap(box, o)) {
    p.carry = o; o.held = true; o.thrown = false; if (o.t === 'enemy') { o.state = 'carried'; o.timer = 6; }
    sfx('click', 0.9); sfx('item', 1.5);
    if (!world.seenCarry) { world.seenCarry = true; toast = { text: 'もちあげた!', sub: 'ボタンを はなすと なげる(↑で 上へ・↓で そっと おく)', t: 2.6 }; }
    break;
  }
}
function throwCarry(p) {
  const o = p.carry; p.carry = null; o.held = false;
  const up = held('up'), down = held('down');
  if (o.t === 'enemy') {
    o.awake = true;
    if (down) { o.state = 'shell'; o.timer = 6; o.x = p.x + p.w / 2 + p.face * 34 - o.w / 2; o.y = p.y + p.h - o.h; return; }
    if (up) { o.state = 'shell'; o.vx = p.vx * 0.4; o.vy = -980; o.timer = 6; o.tossed = true; sfx('swing', 0.9); return; }
    o.state = 'slide'; o.face = p.face; o.vx = p.face * 560; o.kickT = 0.25; o.x = p.x + p.w / 2 + p.face * 26 - o.w / 2; sfx('stomp', 1.3); return;
  }
  if (down) { o.vx = 0; o.vy = 0; o.x = p.x + p.w / 2 + p.face * 34 - o.w / 2; o.y = p.y + p.h - o.h; o.thrown = false; return; }
  o.thrown = true; o.combo = 0;
  if (up) { o.vx = p.vx * 0.4; o.vy = -980; } else { o.vx = p.face * 480; o.vy = -180; }
  sfx('swing', 0.9);
}
function dropCarry() { const p = P; if (!p || !p.carry) return; const o = p.carry; p.carry = null; o.held = false; if (o.t === 'enemy') { o.state = 'shell'; o.timer = 6; } o.vx = 0; o.vy = 0; }
// 投げた物・地面に ある 物の うごき(なげブロック・ばね・ぎんの スイッチ)
function updateLoose(o, dt) {
  if (o.held) return;
  o.vy = Math.min((o.vy || 0) + GRAV * dt, MAXFALL);
  const vx0 = o.vx || 0;
  moveBody(o, dt);
  if (o.thrown) {
    // 投げた物は 敵を たおす(つづけて たおすと 点が ふえる)
    for (const e of world.ents) if (e.t === 'enemy' && !e.dying && !e.d.boss && overlap(o, e)) { o.combo = (o.combo || 0) + 1; defeat(e, true, o.combo); sfx('hit'); }
    if (o.hitWall) { if (o.t === 'tblock') { breakLoose(o); return; } o.vx = -vx0 * 0.3; }
    if (o.onGround && o.t !== 'tblock') { o.vx *= 0.93; if (Math.abs(o.vx) < 20) { o.vx = 0; o.thrown = false; } }
    if (o.t === 'tblock') { o.life = (o.life || 4) - dt; if (o.life <= 0) { breakLoose(o); return; } }
  } else if (o.onGround) o.vx = 0;
  if (o.y > ROWS * TILE + 60) o.gone = true;
}
function breakLoose(o) { o.gone = true; debris(o.x, o.y, 'crate'); sfx('break'); }

// ---------- ぎんの スイッチ(ふむと しばらく コインと レンガが 入れかわる) ----------
function pressSilver(o) {
  if (o.pressed) return;
  o.pressed = true; o.carry = false; o.timer = 1.0;
  sfx('door', 1.4); sfx('click', 0.7); cam.shake = 0.2; hitStop(0.06);
  if (world.pT > 0) { world.pT = 9; return; }
  world.pT = 9; world.pSwap = [];
  // レンガ(B)は コインに、コインは ぎんの ブロック(z)に
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < level.W; tx++) if (level.tiles[ty][tx] === 'B') { level.tiles[ty][tx] = ' '; world.ents.push({ id: ++uid, t: 'coin', x: tx * TILE + 10, y: ty * TILE + 8, w: 28, h: 32, ph: 0, fromBrick: [tx, ty] }); }
  for (const c of world.ents) if (c.t === 'coin' && !c.fromBrick && c.vy === undefined) { const tx = Math.floor((c.x + 14) / TILE), ty = Math.floor((c.y + 16) / TILE); if (level.tiles[ty] && level.tiles[ty][tx] === ' ') { level.tiles[ty][tx] = 'z'; world.pSwap.push([tx, ty]); c.gone = true; } }
  pushOutOf('z');
  if (!world.seenP) { world.seenP = true; toast = { text: 'ぎんの スイッチ!', sub: 'しばらく コインが ブロックに、レンガが コインに なる', t: 2.6 }; }
}
function updateSilverTimer(dt) {
  if (!(world.pT > 0)) return;
  const before = Math.ceil(world.pT);
  world.pT -= dt;
  if (Math.ceil(world.pT) !== before && world.pT > 0) sfx('click', world.pT < 3 ? 2.0 : 1.6);
  if (world.pT > 0) return;
  // もどす: ぎんの ブロックは コインに、のこった コインは レンガに
  for (const [tx, ty] of world.pSwap || []) if (level.tiles[ty][tx] === 'z') { level.tiles[ty][tx] = ' '; world.ents.push({ id: ++uid, t: 'coin', x: tx * TILE + 10, y: ty * TILE + 8, w: 28, h: 32, ph: 0 }); }
  for (const c of world.ents) if (c.t === 'coin' && c.fromBrick && !c.gone) { const [tx, ty] = c.fromBrick; level.tiles[ty][tx] = 'B'; c.gone = true; }
  pushOutOf('B');
  world.pSwap = []; sfx('door', 0.9);
}
function lightBomb(o, kick = 0) {
  if (o.state === 'lit') return;
  o.state = 'lit'; o.timer = 1.5; o.vx = kick; o.vy = kick ? -260 : 0;
  sfx('fire', 0.8);
}
function explode(o) {
  o.gone = true;
  sfx('boom');
  cam.shake = 0.35;
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  burst(cx, cy, '#ff9a2e', 22, 380, 7);
  burst(cx, cy, '#fff2a8', 12, 260, 5);
  for (let i = 0; i < 10; i++) parts.push({ x: cx + rnd(-20, 20), y: cy + rnd(-20, 20), vx: rnd(-40, 40), vy: rnd(-90, -30), life: 0.8, max: 0.8, color: 'rgba(80,70,90,.7)', size: rnd(8, 14), g: 0, puff: true });
  const R = 90;
  for (let ty = Math.floor((cy - R) / TILE); ty <= Math.floor((cy + R) / TILE); ty++)
    for (let tx = Math.floor((cx - R) / TILE); tx <= Math.floor((cx + R) / TILE); tx++)
      if (Math.hypot((tx + 0.5) * TILE - cx, (ty + 0.5) * TILE - cy) < R) breakTile(tx, ty);
  for (const e of world.ents) if (e.t === 'enemy' && e !== o && !e.dying && Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) < R) defeat(e, true);
  if (Math.hypot(P.x + P.w / 2 - cx, P.y + P.h / 2 - cy) < R) hurtPlayer(cx);
}

// ---------- 敵・しかけ ----------
function updateEnemy(o, dt) {
  const d = o.d;
  if (o.dying) {
    o.dyingT += dt; o.vy += GRAV * dt; o.x += o.vx * dt; o.y += o.vy * dt;
    if (o.dyingT > 1.6) o.gone = true;
    return;
  }
  const px = P.x + P.w / 2, py = P.y + P.h / 2;
  const ex = o.x + o.w / 2, ey = o.y + o.h / 2;
  const near = Math.abs(px - ex) < VW * 0.7;
  if (!near && o.type !== 'bee') { if (!o.awake) return; }
  o.awake = true;
  o.ph += dt;
  switch (o.type) {
    case 'goomy': case 'spiky': case 'skeleton': case 'bomb': case 'shell': case 'beetle': {
      // 羽つきグーミーは跳ねながら近づく
      if (o.type === 'goomy' && o.v === 'para' && o.onGround) { o.timer -= dt; if (o.timer <= 0) { o.vy = -620; o.face = px < ex ? -1 : 1; o.timer = 0.9; } }
      // ガイコツは骨を投げる
      if (o.type === 'skeleton' && o.state === 'walk' && Math.abs(px - ex) < 360 && Math.abs(py - ey) < 140) {
        o.throwT = (o.throwT ?? 1.4) - dt;
        if (o.throwT <= 0) { o.throwT = 2.2; const dx = px - ex; world.ents.push({ id: ++uid, t: 'bone', x: ex - 10, y: o.y + 4, w: 20, h: 20, vx: clamp(dx * 1.1, -260, 260), vy: -520, life: 3, rot: 0 }); sfx('swing', 0.7); }
      }
      // カブトムシは前にいると突進する
      if (o.type === 'beetle') { const ahead = (px - ex) * o.face > 0 && Math.abs(px - ex) < 240 && Math.abs(py - ey) < 50; o.charge = ahead ? Math.min(1, (o.charge || 0) + dt * 2) : Math.max(0, (o.charge || 0) - dt); if (o.charge > 0.5 && Math.random() < dt * 10) dust(ex - o.face * 20, o.y + o.h, 1); }
      if (o.type === 'bomb' && o.state === 'lit') {
        o.timer -= dt; o.vx *= 0.96;
        o.vy = Math.min(o.vy + GRAV * dt, MAXFALL); moveBody(o, dt);
        if (o.timer <= 0) explode(o);
        return;
      }
      if (o.type === 'shell' && o.state === 'shell') {
        o.vx *= 0.9; o.timer -= dt; o.vy = Math.min(o.vy + GRAV * dt, MAXFALL); moveBody(o, dt);
        if (o.tossed) { for (const e of world.ents) if (e !== o && e.t === 'enemy' && !e.dying && !e.d.boss && overlap(o, e)) { defeat(e, true); sfx('hit'); } if (o.onGround) o.tossed = false; }
        if (o.timer <= 0) { o.state = 'walk'; o.vx = o.face * d.speed; } break;
      }
      if (o.type === 'shell' && o.state === 'slide') {
        o.vy = Math.min(o.vy + GRAV * dt, MAXFALL);
        const v = o.vx;
        moveBody(o, dt);
        if (o.hitWall) { o.vx = -v; sfx('bump', 1.2); }
        for (const e of world.ents) if (e !== o && e.t === 'enemy' && !e.dying && overlap(o, e)) { defeat(e, true); sfx('hit'); }
        o.kickT -= dt;
        return;
      }
      if (o.state === 'stun') { o.timer -= dt; o.vx *= 0.9; if (o.timer <= 0) { o.state = 'walk'; o.vx = o.face * d.speed; } }
      if (o.type === 'skeleton' && o.state !== 'stun' && Math.abs(px - ex) < 260 && Math.abs(py - ey) < 80) { o.face = px < ex ? -1 : 1; o.vx = o.face * d.speed; }
      o.vy = Math.min(o.vy + GRAV * dt, MAXFALL);
      moveBody(o, dt);
      if (o.hitWall) { o.face = -o.hitWall; o.vx = o.face * d.speed; }
      if (d.edge && o.onGround && o.state === 'walk') {
        const ahead = Math.floor((o.face > 0 ? o.x + o.w + 2 : o.x - 2) / TILE);
        const below = Math.floor((o.y + o.h + 4) / TILE);
        if (!isSolid(ahead, below) && !isOneWay(ahead, below)) { o.face *= -1; o.vx = o.face * d.speed; }
      }
      if (o.state === 'walk') o.vx = o.face * d.speed * (o.type === 'beetle' && o.charge > 0.5 ? 3.4 : 1) * (o.v === 'fast' ? 1.8 : 1);
      break;
    }
    case 'bee': {
      if (o.v === 'circle') { o.x = o.cx + Math.cos(o.ph * 1.6) * 90; o.y = o.cy + Math.sin(o.ph * 1.6) * 70; o.face = -Math.sin(o.ph * 1.6) > 0 ? 1 : -1; break; }
      if (o.v === 'dive') {
        if (o.state === 'walk') { o.x = o.x0 + Math.sin(o.ph * 1.2) * 50; o.y = o.y0 + Math.sin(o.ph * 3) * 10; if (Math.abs(px - ex) < 120 && py > ey) { o.state = 'dive'; o.vx = (px - ex) * 1.2; o.vy = 520; sfx('dash', 1.5); } }
        else if (o.state === 'dive') { o.x += o.vx * dt; o.y += o.vy * dt; if (o.y > o.y0 + 220 || isSolid(Math.floor(ex / TILE), Math.floor((o.y + o.h) / TILE))) o.state = 'back'; }
        else { o.x = lerp(o.x, o.x0, dt * 2); o.y = lerp(o.y, o.y0, dt * 2); if (Math.abs(o.y - o.y0) < 6) o.state = 'walk'; }
        o.face = px < ex ? -1 : 1; break;
      }
      o.x = o.x0 + Math.sin(o.ph * 0.9) * 80;
      o.y = o.y0 + Math.sin(o.ph * 3) * 26;
      o.face = Math.cos(o.ph * 0.9) > 0 ? 1 : -1;
      break;
    }
    case 'bat': {
      if (o.state === 'walk' && Math.abs(px - ex) < 260) o.state = 'chase';
      if (o.state === 'chase') {
        o.vx = lerp(o.vx, Math.sign(px - ex) * 120, dt * 2);
        o.vy = lerp(o.vy, clamp(py - ey, -1, 1) * 70 + Math.sin(o.ph * 5) * 60, dt * 3);
        o.x += o.vx * dt; o.y += o.vy * dt;
        o.face = o.vx > 0 ? 1 : -1;
      } else o.y = o.y0 + Math.sin(o.ph * 2) * 6;
      break;
    }
    case 'slime': {
      o.vy = Math.min(o.vy + GRAV * dt, MAXFALL);
      moveBody(o, dt);
      if (o.onGround) {
        o.vx *= 0.8;
        o.timer -= dt;
        if (o.timer <= 0 && Math.abs(px - ex) < 420) { o.face = px < ex ? -1 : 1; o.vx = o.face * 120; o.vy = -460; o.timer = 1.2; }
      }
      break;
    }
    case 'ghost': {
      const looking = (P.face > 0 && ex > px) || (P.face < 0 && ex < px);
      o.shy = looking;
      if (!looking && Math.abs(px - ex) < 420) {
        const a = Math.atan2(py - ey, px - ex);
        o.x += Math.cos(a) * 70 * dt; o.y += Math.sin(a) * 70 * dt;
        o.face = px < ex ? -1 : 1;
      }
      break;
    }
    case 'plant': {
      if (o.v === 'spit' && o.state === 'out' && !o.spat && o.timer < 0.9) { o.spat = true; const a = Math.atan2(py - o.y, px - ex); world.ents.push({ id: ++uid, t: 'spit', x: ex - 10, y: o.y + 6, w: 20, h: 20, vx: Math.cos(a) * 240, vy: -380, g: 900, life: 3, col: '#ff8a2a' }); sfx('fire'); }
      if (o.state === 'hidden') o.spat = false;
      o.timer -= dt;
      const playerClose = Math.abs(px - ex) < 70;
      if (o.state === 'hidden' && o.timer <= 0 && !playerClose) { o.state = 'up'; }
      if (o.state === 'up') { o.rise = Math.min(1, o.rise + dt * 2.5); if (o.rise >= 1) { o.state = 'out'; o.timer = 1.6; } }
      if (o.state === 'out' && o.timer <= 0) o.state = 'down';
      if (o.state === 'down') { o.rise = Math.max(0, o.rise - dt * 2.5); if (o.rise <= 0) { o.state = 'hidden'; o.timer = 1.6; } }
      o.y = o.y0 + (1 - o.rise) * o.h;
      break;
    }
    case 'turret': {
      o.timer -= dt;
      o.face = px < ex ? -1 : 1;
      if (o.timer <= 0 && Math.abs(px - ex) < 520) {
        o.timer = 2.6;
        sfx('fire');
        const aim = o.v === 'aim' ? Math.atan2(py - (o.y + 18), px - ex) : (o.face > 0 ? 0 : Math.PI);
        const b = { id: ++uid, t: 'ball', x: ex + o.face * 30 - 12, y: o.y + 6, w: 24, h: 24, vx: Math.cos(aim) * 230, vy: Math.sin(aim) * 230, life: 6 };
        world.ents.push(b);
        burst(ex + o.face * 30, o.y + 18, '#ccc', 5, 120, 4);
      }
      break;
    }
    case 'eye': {
      const chase = Math.abs(px - ex) < 360;
      o.x0 += (chase ? Math.sign(px - ex) * 40 : 0) * dt;
      o.x = o.x0 + Math.sin(o.ph * 1.2) * 60;
      o.y = o.y0 + Math.sin(o.ph * 2.6) * 34;
      o.face = px < ex ? -1 : 1;
      // 真上に来たら涙の弾を落とす
      o.dropT = (o.dropT ?? 1.5) - dt;
      if (o.dropT <= 0 && Math.abs(px - ex) < 70 && py > ey) { o.dropT = 1.6; world.ents.push({ id: ++uid, t: 'spit', x: ex - 10, y: o.y + o.h, w: 20, h: 20, vx: 0, vy: 120, g: 900, life: 3, col: '#7fd8ff' }); sfx('fire', 1.6); }
      break;
    }
    case 'wizard': {
      o.face = px < ex ? -1 : 1;
      o.timer -= dt;
      if (o.state === 'fade') { o.alpha = Math.max(0, o.alpha - dt * 3); if (o.alpha <= 0) { teleportWizard(o); o.state = 'appear'; } break; }
      if (o.state === 'appear') { o.alpha = Math.min(1, o.alpha + dt * 3); if (o.alpha >= 1) { o.state = 'walk'; o.timer = 1.2; } break; }
      o.vy = Math.min(o.vy + GRAV * dt, MAXFALL); moveBody(o, dt);
      if (o.timer <= 0 && Math.abs(px - ex) < 560) {
        if (o.casts >= 2) { o.casts = 0; o.state = 'fade'; sparkle(ex, ey, 10); break; }
        o.casts++; o.timer = 1.7;
        const a = Math.atan2(py - (o.y + 20), px - ex);
        world.ents.push({ id: ++uid, t: 'magic', x: ex - 12, y: o.y + 8, w: 24, h: 24, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, life: 4 });
        sfx('fire', 1.4); sparkle(ex, o.y + 20, 8);
      }
      break;
    }
    case 'boss': {
      o.face = px < ex ? -1 : 1;
      if (o.invT > 0) o.invT -= dt;
      if (o.state === 'sleep') {
        if (P.x > o.arena[0] * TILE + 2 * TILE) { o.state = 'walk'; o.timer = 1.6; bgm('bgm_end'); toast = { text: 'まおう が あらわれた!', sub: 'ふむか けんで こうげき!', t: 2.4 }; cam.shake = 0.4; sfx('door', 0.6); }
        break;
      }
      if (o.state === 'fade') { o.alpha = Math.max(0, o.alpha - dt * 3); if (o.alpha <= 0) { const tx = Math.round(rnd(o.arena[0] + 2, o.arena[1] - 2)); o.x = tx * TILE; o.y = groundYBelow(tx, 2) * TILE - o.h; o.state = 'appear'; } break; }
      if (o.state === 'appear') { o.alpha = Math.min(1, o.alpha + dt * 2.5); if (o.alpha >= 1) { o.state = 'walk'; o.timer = 0.9; } break; }
      o.vy = Math.min(o.vy + GRAV * dt, MAXFALL); moveBody(o, dt);
      o.timer -= dt;
      const angry = o.hp <= o.maxHp / 2;
      if (o.timer <= 0) {
        if (o.casts >= (angry ? 4 : 3)) { o.casts = 0; o.state = 'fade'; sparkle(ex, ey, 16); break; }
        o.casts++; o.timer = angry ? 0.95 : 1.35;
        const a0 = Math.atan2(py - (o.y + 30), px - ex);
        const n = angry ? 5 : 3, spread = angry ? 0.22 : 0.28;
        for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * spread; world.ents.push({ id: ++uid, t: 'magic', x: ex - 12, y: o.y + 24, w: 24, h: 24, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, life: 5 }); }
        sfx('fire', 1.2); sparkle(ex, o.y + 30, 12);
        if (angry && Math.random() < 0.5) { o.vy = -700; }
      }
      break;
    }
    case 'yurei': {
      if (o.invT > 0) o.invT -= dt;
      const L0 = (o.arena[0] + 2) * TILE, R0 = (o.arena[1] - 1) * TILE;
      if (o.state === 'sleep') {
        o.y = o.y0 + Math.sin(o.ph * 2) * 8;
        if (P.x > (o.arena[0] + 2) * TILE) { o.state = 'float'; o.timer = 2; bossWake(o, 'ひかりブロックで てらして、目を回したら ふもう'); }
        break;
      }
      const angry = o.hp <= o.maxHp / 2;
      const looking = (P.face > 0 && ex > px) || (P.face < 0 && ex < px);
      if (o.state === 'float') {
        // 見られていると はずかしがって 止まる。見ていないと ちかづく
        o.shy = looking;
        const tx = px + (ex < px ? -170 : 170), ty = P.y - 150;
        const sp = looking ? 20 : (angry ? 120 : 85);
        o.x += clamp(tx - ex, -1, 1) * sp * dt; o.y += clamp(ty - o.y, -1, 1) * sp * 0.8 * dt;
        o.alpha = lerp(o.alpha, looking ? 0.22 : 0.5, dt * 4);
        o.face = px < ex ? -1 : 1;
        o.timer -= dt;
        if (o.timer <= 0) {
          o.casts++;
          if (o.casts % 3 === 0) { o.state = 'aim'; o.timer = 0.6; sfx('fire', 0.6); }
          else {
            o.timer = angry ? 1.5 : 2.1;
            const a0 = Math.atan2(py - ey, px - ex), n = angry ? 5 : 3;
            for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * 0.32; world.ents.push({ id: ++uid, t: 'magic', x: ex - 12, y: ey - 12, w: 24, h: 24, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: 5, blue: true }); }
            sfx('fire', 1.6); sparkle(ex, ey, 8);
          }
        }
      } else if (o.state === 'aim') {
        o.timer -= dt; o.alpha = 0.7;
        if (o.timer <= 0) { o.state = 'swoop'; const a = Math.atan2(py - ey, px - ex); o.vx = Math.cos(a) * 520; o.vy = Math.sin(a) * 520; o.timer = 0.9; sfx('dash', 0.7); }
      } else if (o.state === 'swoop') {
        o.x += o.vx * dt; o.y += o.vy * dt; o.vx *= 0.985; o.vy *= 0.985; o.timer -= dt;
        if (o.timer <= 0) { o.state = 'float'; o.timer = angry ? 1.2 : 1.6; }
      } else if (o.state === 'stun') {
        // 光で 目を回して 床に おちる
        o.alpha = 1; o.vy = Math.min(o.vy + GRAV * 0.6 * dt, 600); o.y += o.vy * dt;
        const gy = groundYBelow(Math.floor(ex / TILE), 2) * TILE;
        if (o.y + o.h > gy) { o.y = gy - o.h; o.vy = 0; }
        o.timer -= dt; if (o.timer <= 0) { o.state = 'flee'; o.timer = 0.8; o.vy = -200; }
      } else if (o.state === 'flee') {
        o.y -= 160 * dt; o.alpha = lerp(o.alpha, 0.4, dt * 3); o.timer -= dt;
        if (o.timer <= 0) { o.state = 'float'; o.timer = 1.5; }
      }
      o.x = clamp(o.x, L0, R0 - o.w); o.y = clamp(o.y, TILE, 9 * TILE);
      if (Math.random() < dt * 8) parts.push({ x: ex + rnd(-30, 30), y: o.y + o.h - 10, vx: 0, vy: rnd(10, 40), life: 0.5, max: 0.5, color: 'rgba(190,240,255,.6)', size: rnd(3, 6), g: 0, puff: true });
      break;
    }
    case 'slimeking': {
      if (o.invT > 0) o.invT -= dt;
      o.sq = Math.max(0, (o.sq || 0) - dt * 3);
      if (o.state === 'sleep') { if (P.x > (o.arena[0] + 2) * TILE) { o.state = 'wait'; o.timer = 1.4; bossWake(o, 'ジャンプして 上から ふもう!'); } break; }
      const angry = o.hp <= o.maxHp / 2;
      const L0 = (o.arena[0] + 1) * TILE, R0 = o.arena[1] * TILE;
      if (o.state === 'wait') {
        o.vx = 0; o.timer -= dt; o.face = px < ex ? -1 : 1;
        if (o.timer <= 0) {
          o.hops++;
          const big = o.hops % 3 === 0;
          o.state = big ? 'bigjump' : 'hop';
          o.vy = big ? -1150 : -640;
          const tx = big ? px : ex + o.face * (angry ? 220 : 170);
          o.vx = clamp((tx - ex) / (big ? 1.1 : 0.62), -380, 380);
          o.landX = clamp(tx, L0 + o.w / 2, R0 - o.w / 2);
          sfx('jump', big ? 0.5 : 0.7);
        }
      }
      o.vy = Math.min(o.vy + GRAV * dt, MAXFALL);
      const wasAir = o.state === 'hop' || o.state === 'bigjump';
      moveBody(o, dt);
      if (o.x < L0) { o.x = L0; o.vx = Math.abs(o.vx) * 0.5; }
      if (o.x + o.w > R0) { o.x = R0 - o.w; o.vx = -Math.abs(o.vx) * 0.5; }
      if (wasAir && o.onGround && o.vy >= 0) {
        const big = o.state === 'bigjump';
        o.state = 'wait'; o.timer = angry ? 0.7 : 1.0; o.vx = 0; o.sq = 1;
        sfx('stomp', big ? 0.5 : 0.7); dust(o.x + 10, o.y + o.h, 6); dust(o.x + o.w - 10, o.y + o.h, 6);
        if (big) {
          cam.shake = 0.45; hitStop(0.05);
          // 大ジャンプの 着地は 地面が ゆれる。地面に いると いたい(ジャンプで よける)
          if (P.onGround && Math.abs(px - (o.x + o.w / 2)) < 170) hurtPlayer(o.x + o.w / 2);
          for (const sd of [-1, 1]) for (let k = 0; k < 6; k++) parts.push({ x: o.x + o.w / 2 + sd * (30 + k * 22), y: o.y + o.h - 4, vx: sd * 120, vy: -60 - k * 10, life: 0.4, max: 0.4, color: '#8cff6a', size: 5, g: 600 });
        } else cam.shake = Math.max(cam.shake, 0.12);
      }
      break;
    }
    case 'kabuto': {
      if (o.invT > 0) o.invT -= dt;
      const L0 = (o.arena[0] + 1) * TILE, R0 = o.arena[1] * TILE;
      if (o.state === 'sleep') {
        if (P.x > (o.arena[0] + 2) * TILE) { o.state = 'walk'; o.timer = 1.6; bossWake(o, 'とっしんを とびこえて、かべに ぶつけよう'); }
        break;
      }
      const angry = o.hp <= o.maxHp / 2;
      if (o.state === 'walk') {
        o.face = px < ex ? -1 : 1; o.vx = o.face * 70; o.timer -= dt;
        if (o.timer <= 0) { o.state = 'aim'; o.timer = angry ? 0.5 : 0.8; o.vx = 0; sfx('dash', 0.6); }
      } else if (o.state === 'aim') {
        // 足をかいて ためる(とっしんの合図)
        o.vx = 0; o.timer -= dt; if (Math.random() < dt * 30) dust(ex - o.face * 40, o.y + o.h, 1);
        if (o.timer <= 0) { o.state = 'charge'; o.vx = o.face * (angry ? 600 : 500); sfx('dash', 0.8); }
      } else if (o.state === 'charge') {
        o.vx = o.face * (angry ? 600 : 500);
        if (Math.random() < dt * 30) dust(ex - o.face * 40, o.y + o.h, 1);
      } else if (o.state === 'stun') {
        o.vx *= 0.92; o.timer -= dt;
        if (o.timer <= 0) { o.state = 'walk'; o.timer = angry ? 0.7 : 1.2; }
      } else if (o.state === 'recover') {
        o.timer -= dt; if (o.onGround) o.vx *= 0.85;
        if (o.timer <= 0) { o.state = 'walk'; o.timer = angry ? 0.6 : 1.0; }
      }
      o.vy = Math.min(o.vy + GRAV * dt, MAXFALL); moveBody(o, dt);
      // 部屋のはしを かべにする
      let wall = o.hitWall !== 0;
      if (o.x < L0) { o.x = L0; wall = true; }
      if (o.x + o.w > R0) { o.x = R0 - o.w; wall = true; }
      if (o.state === 'charge' && wall) {
        o.state = 'stun'; o.timer = angry ? 1.7 : 2.2; o.vx = -o.face * 160; o.vy = -300;
        cam.shake = 0.5; sfx('boom', 0.7); sfx('break', 0.5); hitStop(0.08);
        dust(o.face > 0 ? o.x + o.w : o.x, o.y + o.h / 2, 10);
        // 天井から いわが おちてくる(影で 落ちる場所を知らせる)
        const n = angry ? 4 : 3, ptx = Math.floor(px / TILE);
        const spots = [ptx + (Math.random() < 0.5 ? -1 : 1)];
        for (let k = 0; spots.length < n && k < 30; k++) { const tx = Math.round(rnd(o.arena[0] + 2, o.arena[1] - 2)); if (spots.every(s2 => Math.abs(s2 - tx) > 2)) spots.push(tx); }
        spots.forEach((tx, i) => { const gy = groundYBelow(tx, 2); world.ents.push({ id: ++uid, t: 'rock', x: tx * TILE + 2, y: -60, w: 44, h: 44, gy: gy * TILE, state: 'warn', timer: 0.75 + i * 0.22, vy: 0, rot: 0 }); });
      }
      break;
    }
    case 'queen': {
      if (o.invT > 0) o.invT -= dt;
      const L0 = (o.arena[0] + 2) * TILE, R0 = (o.arena[1] - 1) * TILE;
      if (o.state === 'sleep') {
        o.y = o.y0 + Math.sin(o.ph * 3) * 6;
        if (P.x > (o.arena[0] + 2) * TILE) { o.state = 'float'; o.timer = 1.6; bossWake(o, 'とっしんを よけて、はりが ささったら ふもう'); }
        break;
      }
      const angry = o.hp <= o.maxHp / 2;
      if (o.state === 'float') {
        // 部屋の 上を 左右に とびまわって、はりを おとす
        if (o.tx === undefined || Math.abs(o.tx - ex) < 20) o.tx = ex < (L0 + R0) / 2 ? R0 - rnd(60, 180) : L0 + rnd(60, 180);
        o.x += clamp(o.tx - ex, -1, 1) * (angry ? 230 : 170) * dt;
        o.y = lerp(o.y, o.y0 + Math.sin(o.ph * 2.4) * 20, Math.min(1, dt * 3));
        o.face = o.tx > ex ? 1 : -1;
        o.timer -= dt;
        if (o.timer <= 0) {
          o.casts++;
          if (o.casts % 3 === 0) { o.state = 'aim'; o.timer = angry ? 0.6 : 0.85; o.tgx = clamp(px, L0 + 40, R0 - 40); sfx('dash', 1.3); }
          else {
            o.timer = angry ? 1.1 : 1.5;
            const n = angry ? 3 : 2;
            for (let i = 0; i < n; i++) world.ents.push({ id: ++uid, t: 'spit', x: ex - 10 + (i - (n - 1) / 2) * 30, y: o.y + o.h - 6, w: 20, h: 20, vx: (i - (n - 1) / 2) * 70, vy: 40, g: 900, life: 3, col: '#ffd84a' });
            sfx('fire', 1.5);
          }
        }
      } else if (o.state === 'aim') {
        // ねらいを さだめる(赤く ひかって ふるえる)→ とっしん
        o.timer -= dt; o.face = o.tgx > ex ? 1 : -1;
        if (o.timer <= 0) { o.state = 'dive'; const gy = groundYBelow(Math.floor(o.tgx / TILE), 2) * TILE; const a = Math.atan2(gy - (o.y + o.h), o.tgx - ex); o.vx = Math.cos(a) * 640; o.vy = Math.sin(a) * 640; sfx('dash', 0.8); }
      } else if (o.state === 'dive') {
        o.x += o.vx * dt; o.y += o.vy * dt;
        const gy = groundYBelow(Math.floor((o.x + o.w / 2) / TILE), 2) * TILE;
        if (o.y + o.h >= gy) { o.y = gy - o.h; o.state = 'stun'; o.timer = angry ? 1.8 : 2.4; o.vx = 0; o.vy = 0; cam.shake = 0.35; sfx('boom', 0.8); dust(o.x + o.w / 2, gy, 10); hitStop(0.06); }
      } else if (o.state === 'stun') {
        o.timer -= dt; if (o.timer <= 0) { o.state = 'rise'; o.timer = 0.9; }
      } else if (o.state === 'rise') {
        o.y = lerp(o.y, o.y0, Math.min(1, dt * 3)); o.timer -= dt;
        if (o.timer <= 0) { o.state = 'float'; o.timer = angry ? 0.9 : 1.3; }
      }
      o.x = clamp(o.x, L0, R0 - o.w);
      break;
    }
    case 'medama': {
      if (o.invT > 0) o.invT -= dt;
      const L0 = (o.arena[0] + 2) * TILE, R0 = (o.arena[1] - 1) * TILE;
      if (o.state === 'sleep') {
        o.y = o.y0 + Math.sin(o.ph * 2) * 8;
        if (P.x > (o.arena[0] + 2) * TILE) { o.state = 'float'; o.timer = 1.8; bossWake(o, 'ひかりの はしらを よけて、つかれて おりてきたら ふもう'); }
        break;
      }
      const angry = o.hp <= o.maxHp / 2;
      if (o.state === 'float') {
        o.x += clamp(px - ex, -1, 1) * (angry ? 120 : 85) * dt;
        o.y = lerp(o.y, o.y0 + Math.sin(o.ph * 1.8) * 26, Math.min(1, dt * 3));
        o.face = px < ex ? -1 : 1;
        o.timer -= dt;
        if (o.timer <= 0) {
          o.casts++;
          if (o.casts % 3 === 0) { o.state = 'charge'; o.timer = 1.0; o.beamX = ex; sfx('powerup', 0.6); }
          else {
            o.timer = angry ? 1.2 : 1.6;
            const n = angry ? 5 : 3, a0 = Math.atan2(py - ey, px - ex);
            for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * 0.3; world.ents.push({ id: ++uid, t: 'magic', x: ex - 12, y: ey - 12, w: 24, h: 24, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, life: 5, blue: true }); }
            sfx('fire', 1.4);
          }
        }
      } else if (o.state === 'charge') {
        // 光の柱の 合図: 下に 点線と 光の 円(この 列から にげる)
        o.timer -= dt;
        if (o.timer <= 0) { o.state = 'beam'; o.timer = 0.7; sfx('boom', 1.6); cam.shake = 0.25; }
      } else if (o.state === 'beam') {
        o.timer -= dt;
        if (!P.dead && Math.abs(px - o.beamX) < 40 && P.y > o.y) hurtPlayer(o.beamX);
        if (Math.random() < dt * 40) parts.push({ x: o.beamX + rnd(-30, 30), y: rnd(o.y + o.h, 10 * TILE), vx: 0, vy: rnd(-200, -80), life: 0.3, max: 0.3, color: '#fff6c8', size: 3, g: 0, star: true });
        if (o.timer <= 0) { o.state = 'stun'; o.timer = angry ? 2.2 : 2.8; o.vy = 0; toastOnce(o, 'つかれて おりてきた!', 'いまだ! ふむか けんで こうげき'); }
      } else if (o.state === 'stun') {
        // つかれて 床に おりる(目を とじる)
        o.vy = Math.min(o.vy + 900 * dt, 500); o.y += o.vy * dt;
        const gy = groundYBelow(Math.floor(ex / TILE), 2) * TILE;
        if (o.y + o.h > gy) { o.y = gy - o.h; o.vy = 0; }
        o.timer -= dt; if (o.timer <= 0) { o.state = 'rise'; o.timer = 1.0; }
      } else if (o.state === 'rise') {
        o.y = lerp(o.y, o.y0, Math.min(1, dt * 2.5)); o.timer -= dt;
        if (o.timer <= 0) { o.state = 'float'; o.timer = 1.2; }
      }
      o.x = clamp(o.x, L0, R0 - o.w);
      break;
    }
    case 'kage': {
      if (o.invT > 0) o.invT -= dt;
      const L0 = (o.arena[0] + 1) * TILE, R0 = o.arena[1] * TILE;
      if (o.state === 'sleep') {
        if (P.x > (o.arena[0] + 2) * TILE) { o.state = 'walk'; o.timer = 1.4; bossWake(o, 'かげの なみを とびこえて、ふらついたら こうげき'); }
        break;
      }
      const angry = o.hp <= o.maxHp / 2;
      if (o.state === 'walk') {
        o.face = px < ex ? -1 : 1; o.vx = o.face * (angry ? 150 : 105); o.timer -= dt;
        if (o.timer <= 0) { o.casts++; o.vx = 0; if (o.casts % 3 === 0) { o.state = 'crouch'; o.timer = 0.55; sfx('dash', 0.6); } else { o.state = 'throw'; o.timer = 0.45; } }
      } else if (o.state === 'throw') {
        o.vx = 0; o.timer -= dt;
        if (o.timer <= 0) {
          const mk = d2 => world.ents.push({ id: ++uid, t: 'swave', x: ex + d2 * 30 - 16, y: o.y + o.h - 40, w: 32, h: 40, vx: d2 * (angry ? 360 : 290), life: 4 });
          mk(o.face); if (angry) setTimeout(() => { if (world && !o.dying && o.state !== 'stun') mk(o.face); }, 450);
          sfx('fire', 0.7); o.state = 'walk'; o.timer = angry ? 0.9 : 1.3;
        }
      } else if (o.state === 'crouch') {
        o.vx = 0; o.timer -= dt;
        if (o.timer <= 0) { o.tgx = clamp(px, L0 + 30, R0 - 30); o.state = 'leap'; o.vy = -980; o.vx = clamp((o.tgx - ex) / 0.85, -560, 560); o.left = true; sfx('jump', 0.6); }
      } else if (o.state === 'leap') {
        if (o.onGround && o.vy >= 0 && !o.left) {
          o.state = 'stun'; o.timer = angry ? 1.5 : 2.1; o.vx = 0; cam.shake = 0.45; sfx('boom', 0.7); dust(ex, o.y + o.h, 12); hitStop(0.06);
          for (const d2 of [-1, 1]) world.ents.push({ id: ++uid, t: 'swave', x: ex + d2 * 30 - 12, y: o.y + o.h - 26, w: 24, h: 26, vx: d2 * 240, life: 0.9, small: true });
        }
        o.left = false;
      } else if (o.state === 'stun') {
        o.vx = 0; o.timer -= dt; if (o.timer <= 0) { o.state = 'walk'; o.timer = angry ? 0.8 : 1.2; }
      } else if (o.state === 'recover') {
        o.timer -= dt; if (o.onGround) o.vx *= 0.85; if (o.timer <= 0) { o.state = 'walk'; o.timer = 0.9; }
      }
      o.vy = Math.min(o.vy + GRAV * dt, MAXFALL); moveBody(o, dt);
      if (o.x < L0) o.x = L0; if (o.x + o.w > R0) o.x = R0 - o.w;
      break;
    }
    case 'mogura': {
      // under: 地面の 下を すすむ(さわれない) → pop: とびだす → walk: おいかける → dig: もぐる
      if (o.state === 'under') {
        o.vy = 0; o.timer -= dt; const dirx = Math.sign(px - ex); o.vx = dirx * 95; o.face = dirx || o.face;
        const nx = o.x + o.vx * dt, ahead = Math.floor((dirx > 0 ? nx + o.w : nx) / TILE), gy = groundYBelow(Math.floor(ex / TILE), Math.floor(o.y / TILE));
        if (isSolid(ahead, gy) && !isSolid(ahead, gy - 1)) o.x = nx;
        o.y = gy * TILE - o.h;
        if (Math.random() < dt * 16) dust(ex, o.y + o.h, 1);
        if (o.timer <= 0 && Math.abs(px - ex) < 70 && Math.abs(py - ey) < 120) { o.state = 'pop'; o.vy = -560; o.vx = 0; sfx('break', 1.4); dust(ex, o.y + o.h, 6); }
        break;
      }
      o.vy = Math.min(o.vy + GRAV * dt, MAXFALL); moveBody(o, dt);
      if (o.state === 'pop' && o.onGround) { o.state = 'walk'; o.timer = 3; }
      if (o.state === 'walk') { o.face = px < ex ? -1 : 1; o.vx = o.face * d.speed; o.timer -= dt; if (o.hitWall && o.onGround) o.vy = -460; if (o.timer <= 0 && o.onGround) { o.state = 'under'; o.timer = 2; sfx('break', 1.6); dust(ex, o.y + o.h, 6); } }
      break;
    }
    case 'nageko': {
      o.face = px < ex ? -1 : 1;
      o.vy = Math.min(o.vy + GRAV * dt, MAXFALL); moveBody(o, dt);
      o.timer -= dt;
      if (o.timer <= 0 && Math.abs(px - ex) < 440) {
        o.timer = 1.9; o.throws = (o.throws || 0) + 1;
        if (o.throws % 3 === 0 && o.onGround) { o.vy = -560; }
        const dx = px - ex; world.ents.push({ id: ++uid, t: 'spit', x: ex - 10, y: o.y, w: 20, h: 20, vx: clamp(dx * 1.05, -280, 280), vy: -560, g: 1300, life: 3, col: '#a8642a' }); sfx('swing', 0.8);
      }
      break;
    }
    case 'kumo': {
      // 糸で ぶらさがる: 主人公が 下に 来ると おりる
      const below = Math.abs(px - ex) < 110 && py > o.ay;
      if (o.state === 'up') { o.y = Math.max(o.ay + 10, o.y - 160 * dt); if (below) o.state = 'down'; }
      else { o.y = Math.min(o.ay + o.drop, o.y + 260 * dt); if (!below && o.y >= o.ay + o.drop - 1) o.state = 'up'; }
      o.face = px < ex ? -1 : 1;
      break;
    }
    case 'fugu': {
      o.puff = Math.max(0, o.puff - dt); o.timer -= dt;
      if (o.timer <= 0) { o.timer = rnd(2.4, 3.4); o.puff = 1.2; sfx('spring', 0.6); }
      const inW = tileAt(Math.floor(ex / TILE), Math.floor(ey / TILE)) === 'W';
      const a = Math.atan2(py - ey, px - ex), sp = o.puff > 0 ? 20 : 55;
      if (Math.abs(px - ex) < 500) { o.x += Math.cos(a) * sp * dt; o.y += Math.sin(a) * sp * dt * 0.7; }
      if (!inW) o.y += 120 * dt;
      o.y = clamp(o.y, TILE, (ROWS - 2) * TILE); o.face = px < ex ? -1 : 1;
      break;
    }
    case 'oobake': {
      const looking = (P.face > 0 && ex > px) || (P.face < 0 && ex < px);
      o.shy = looking;
      if (!looking && Math.abs(px - ex) < 700) { const a = Math.atan2(py - ey, px - ex); o.x += Math.cos(a) * 46 * dt; o.y += Math.sin(a) * 46 * dt; o.face = px < ex ? -1 : 1; }
      break;
    }
    case 'hone': {
      if (o.invT > 0) o.invT -= dt;
      const L0 = (o.arena[0] + 1) * TILE, R0 = o.arena[1] * TILE;
      if (o.state === 'sleep') { if (P.x > (o.arena[0] + 2) * TILE) { o.state = 'walk'; o.timer = 1.2; bossWake(o, 'ほねを よけて、うえから ふもう!'); } break; }
      const angry = o.hp <= 1;
      if (o.state === 'walk') {
        o.face = px < ex ? -1 : 1; o.vx = o.face * (angry ? 110 : 75); o.timer -= dt;
        if (o.timer <= 0) {
          o.casts++; o.vx = 0;
          if (o.casts % 3 === 0) { o.state = 'leap'; o.vy = -900; o.vx = clamp((px - ex) / 0.8, -420, 420); sfx('jump', 0.6); o.left = true; }
          else { o.state = 'throw'; o.timer = 0.4; }
        }
      } else if (o.state === 'throw') {
        o.vx = 0; o.timer -= dt;
        if (o.timer <= 0) {
          for (let i = 0; i < 3; i++) world.ents.push({ id: ++uid, t: 'bone', x: ex - 10, y: o.y + 8, w: 20, h: 20, vx: o.face * (140 + i * 90), vy: -560 - i * 60, life: 3, rot: 0 });
          sfx('swing', 0.6); o.state = 'walk'; o.timer = angry ? 1.0 : 1.5;
        }
      } else if (o.state === 'leap') {
        if (o.onGround && o.vy >= 0 && !o.left) { o.state = 'walk'; o.timer = 1.0; o.vx = 0; cam.shake = 0.35; sfx('boom', 0.8); dust(ex, o.y + o.h, 10); if (P.onGround && Math.abs(px - ex) < 150) hurtPlayer(ex); }
        o.left = false;
      } else if (o.state === 'recover') {
        o.timer -= dt; if (o.onGround) o.vx *= 0.85; if (o.timer <= 0) { o.state = 'walk'; o.timer = 0.8; }
      }
      o.vy = Math.min(o.vy + GRAV * dt, MAXFALL); moveBody(o, dt);
      if (o.x < L0) o.x = L0; if (o.x + o.w > R0) o.x = R0 - o.w;
      break;
    }
    case 'fish': {
      if (o.state === 'under') { o.y = o.y0; o.timer -= dt; if (o.timer <= 0 && Math.abs(px - ex) < 520) { o.state = 'jump'; o.vy = -o.jump; sfx('fire', 0.7); burst(ex, o.y0 - 30, '#ff8a2a', 8, 160, 4); } }
      else { o.vy += GRAV * 0.75 * dt; o.y += o.vy * dt; o.face = o.vy < 0 ? -1 : 1; if (o.y >= o.y0 && o.vy > 0) { o.state = 'under'; o.timer = rnd(1.4, 2.4); } }
      break;
    }
    case 'orb': {
      if (o.v === 'line') { o.x += o.dirx * 110 * dt; if (o.x < o.lx0) o.dirx = 1; if (o.x > o.lx1) o.dirx = -1; o.y = o.cy - o.h / 2 + Math.sin(o.ph * 3) * 6; }
      else { o.ang += o.sp * dt;
      o.x = o.cx + Math.cos(o.ang) * o.rad - o.w / 2; o.y = o.cy + Math.sin(o.ang) * o.rad - o.h / 2; }
      if (Math.random() < dt * 10) parts.push({ x: ex + rnd(-20, 20), y: ey + rnd(-20, 20), vx: rnd(-40, 40), vy: rnd(-40, 40), life: 0.25, max: 0.25, color: '#9fe8ff', size: 2.5, g: 0, star: true });
      break;
    }
    case 'firespirit': {
      o.vy = Math.min(o.vy + GRAV * 0.8 * dt, MAXFALL);
      moveBody(o, dt);
      if (o.onGround) { o.timer -= dt; o.vx = 0; if (o.timer <= 0) { o.vy = -640; o.timer = 0.9; if (o.v === 'chase') { o.vx = Math.sign(px - ex) * 110; o.vy = -560; } } }
      if (Math.random() < dt * 14) parts.push({ x: ex + rnd(-8, 8), y: o.y + 6, vx: rnd(-20, 20), vy: rnd(-80, -40), life: 0.4, max: 0.4, color: Math.random() < 0.5 ? '#ffb02e' : '#ff5a1f', size: rnd(3, 5), g: 0 });
      break;
    }
  }
}

function toastOnce(o, text, sub) { if (!o.toasted) { o.toasted = true; toast = { text, sub, t: 2.2 }; } }
function bossWake(o, sub) {
  bgm('bgm_end'); cam.shake = 0.45; sfx('door', 0.6); sfx('boom', 0.6);
  toast = { text: o.d.name + ' が あらわれた!', sub, t: 3 };
  // うしろの入り口を とじる
  const gy = groundYBelow(o.arena[0], 2);
  world.ents.push({ id: ++uid, t: 'gate', x: o.arena[0] * TILE, y: (gy - 3) * TILE, w: TILE, h: 3 * TILE, solid: true, drop: 1 });
}
function bossHit(o) {
  if (o.invT > 0 || o.state === 'sleep' || o.alpha < 0.6) return;
  if (o.type === 'yurei' && o.state !== 'stun') {
    sparkle(o.x + o.w / 2, o.y + o.h / 2, 6); sfx('bump', 1.4);
    if (!o.hinted) { o.hinted = true; toast = { text: 'すりぬけて しまう!', sub: 'ひかりブロックを たたいて てらそう', t: 2.4 }; }
    return false;
  }
  if ((o.type === 'queen' || o.type === 'medama' || o.type === 'kage') && o.state !== 'stun') {
    sfx('bump', 0.8); sparkle(o.x + o.w / 2, o.y + 10, 6); hitStop(0.04);
    if (!o.hinted) { o.hinted = true; toast = { text: 'まだ きかない!', sub: o.type === 'queen' ? 'とっしんして はりが ささったら チャンス' : o.type === 'medama' ? 'ひかりの はしらの あと、おりてきたら チャンス' : 'ジャンプの あと ふらついたら チャンス', t: 2.4 }; }
    return false;
  }
  if (o.type === 'kabuto' && o.state !== 'stun') {
    // かたい からで はじかれる(目を回していないときは きかない)
    sfx('bump', 0.7); sparkle(o.x + o.w / 2, o.y + 10, 6); hitStop(0.04);
    if (!o.hinted) { o.hinted = true; toast = { text: 'かたくて きかない!', sub: 'かべに ぶつけて 目を回させよう', t: 2.2 }; }
    return false;
  }
  o.hp--; o.invT = 1.1;
  sfx('hit'); sfx('stomp', 0.7); cam.shake = 0.3; hitStop(0.12);
  burst(o.x + o.w / 2, o.y + o.h / 2, '#d38cff', 18, 300, 6); sparkle(o.x + o.w / 2, o.y + 20, 14);
  if (o.hp <= 0) {
    o.dying = true; o.dyingT = 0; o.vy = -500; o.vx = 0;
    world.score += o.d.score; popText(o.x + o.w / 2, o.y - 10, '+' + o.d.score, '#ffe066');
    for (let i = 0; i < 6; i++) setTimeout(() => { if (world) firework(o.x + o.w / 2 + rnd(-80, 80), o.y + rnd(-60, 60)); }, i * 160);
    cam.shake = 0.6; bgm('');
    for (const e of world.ents) if (e.t === 'magic' || e.t === 'rock' || e.t === 'swave' || e.t === 'spit' || (e.t === 'enemy' && e !== o)) e.gone = true;
    for (const e of world.ents) if (e.t === 'gate') e.opening = true;
    const g = spawn({ kind: 'G', x: o.arena[1] - 2, y: 9 });
    world.ents.push(g);
    toast = { text: o.d.name + 'を たおした!', sub: 'ゴールの はたへ!', t: 3 };
    return;
  }
  if (o.type === 'slimeking') {
    o.sq = 1; o.state = 'wait'; o.timer = 0.9; o.vx = 0;
    if (o.hp === Math.floor(o.maxHp / 2) && !o.split) {
      o.split = true;
      for (const sd of [-1, 1]) { const e = spawn({ kind: 'enemy', type: 'slime', x: Math.floor((o.x + o.w / 2) / TILE), opt: {} }); e.x = o.x + o.w / 2 - 20 + sd * 30; e.y = o.y; e.vx = sd * 180; e.vy = -420; e.timer = 0.8; e.awake = true; world.ents.push(e); }
      toast = { text: 'スライムが ふえた!', sub: 'こぶんも ふんで やっつけよう', t: 2 };
    }
    return;
  }
  if (o.type === 'kabuto') { o.state = 'recover'; o.timer = 0.7; o.vx = -o.face * 220; o.vy = -380; return; }
  if (o.type === 'yurei') { o.state = 'flee'; o.timer = 1.2; o.vy = -260; return; }
  if (o.type === 'queen') { o.state = 'rise'; o.timer = 1.0; return; }
  if (o.type === 'medama') { o.state = 'rise'; o.timer = 1.1; return; }
  if (o.type === 'kage') { o.state = 'recover'; o.timer = 0.8; o.vx = -o.face * 260; o.vy = -460; return; }
  if (o.type === 'hone') { o.state = 'recover'; o.timer = 0.7; o.vx = -o.face * 240; o.vy = -420; return; }
  o.state = 'fade'; o.casts = 0;
}
function splitSlime(o) {
  sfx('stomp', 0.8); burst(o.x + o.w / 2, o.y + o.h / 2, '#6ee05a', 12, 220, 5);
  o.gone = true; world.score += 150; popText(o.x + o.w / 2, o.y, '+150');
  for (const s of [-1, 1]) {
    const e = spawn({ kind: 'enemy', type: 'slime', x: Math.floor((o.x + o.w / 2) / TILE), opt: {} });
    e.x = o.x + o.w / 2 - 20 + s * 18; e.y = o.y; e.vx = s * 160; e.vy = -420; e.timer = 0.8; e.awake = true; world.ents.push(e);
  }
}
function teleportWizard(o) {
  for (let k = 0; k < 12; k++) {
    const tx = Math.floor((P.x + P.w / 2) / TILE) + Math.round(rnd(3, 6)) * (Math.random() < 0.5 ? -1 : 1);
    const gy = groundYBelow(tx, 2);
    if (gy < ROWS && !isSolid(tx, gy - 1) && !isSolid(tx, gy - 2) && tileAt(tx, gy) !== 'V') { o.x = tx * TILE + 4; o.y = gy * TILE - o.h; o.vy = 0; return; }
  }
}
const SPIKY_T = new Set(['spiky', 'firespirit', 'plant', 'kumo']);
function playerVsEnemy(o) {
  const p = P;
  if (p.dead || o.dying || world.clear || o.held) return;
  if (o.type === 'plant' && o.rise < 0.3) return;
  if (o.type === 'fish' && o.state === 'under') return;
  if (o.type === 'wizard' && o.alpha < 0.6) return;
  // 当たり判定は 見た目より 少し小さく(かすっただけで やられないように)。ふむ判定は 今のまま
  if (!overlap(p, o)) return;
  const fair = { x: p.x + 4, y: p.y + 6, w: p.w - 8, h: p.h - 8 };
  const falling = p.vy > 60 && p.y + p.h - p.vy * (1 / 60) <= o.y + 14;
  // スピンジャンプ・もこりゅうなら トゲの 敵も ふめる
  if (falling && (p.spin || p.mount) && SPIKY_T.has(o.type) && !o.d.boss && !(o.type === 'plant' && o.rise < 0.5)) {
    p.vy = held('jump') || held('spin') ? -560 : -400; p.jumping = held('jump');
    p.combo = (p.combo || 0) + 1; sfx('stomp', 1 + Math.min(8, p.combo - 1) * 0.07); hitStop(0.035);
    defeat(o, false, p.combo, !!p.spin); return;
  }
  if (o.type === 'shell' && o.state === 'shell') {
    if (held('dash') && !p.carry && !p.mount) return; // もちあげる(updateCarry)
    // 止まった甲羅は蹴る
    o.state = 'slide'; o.face = p.x + p.w / 2 < o.x + o.w / 2 ? 1 : -1; o.vx = o.face * 520; o.kickT = 0.25;
    sfx('stomp', 1.3);
    if (falling) p.vy = -420;
    return;
  }
  if (o.type === 'shell' && o.state === 'slide') {
    if (falling) { o.state = 'shell'; o.vx = 0; o.timer = 6; p.vy = -460; sfx('stomp'); return; }
    if (o.kickT > 0) return;
    hurtPlayer(o.x + o.w / 2); return;
  }
  if (o.type === 'bomb' && o.state === 'lit') { if (falling) { p.vy = -420; } return; }
  if (o.type === 'yurei') {
    if (o.state === 'sleep') return;
    if (o.state === 'stun') { if (falling) { p.vy = -700; p.jumping = held('jump'); bossHit(o); } return; }
    if (o.invT > 0 || o.state === 'flee') return;
    hurtPlayer(o.x + o.w / 2); return;
  }
  if (o.type === 'slimeking') {
    if (o.state === 'sleep') return;
    if (falling) { p.vy = held('jump') ? -760 : -620; p.jumping = held('jump'); bossHit(o); return; }
    if (o.invT > 0) return;
    if (overlap({ x: p.x + 4, y: p.y + 6, w: p.w - 8, h: p.h - 8 }, { x: o.x + 8, y: o.y + 10, w: o.w - 16, h: o.h - 10 })) hurtPlayer(o.x + o.w / 2);
    return;
  }
  if (o.type === 'mogura' && o.state === 'under') return;
  if (o.type === 'oobake') { if (!o.shy && overlap({ x: p.x + 4, y: p.y + 6, w: p.w - 8, h: p.h - 10 }, { x: o.x + 12, y: o.y + 12, w: o.w - 24, h: o.h - 24 })) hurtPlayer(o.x + o.w / 2); return; }
  if (o.type === 'fugu' && o.puff <= 0 && falling) { p.vy = -480; defeat(o, false, 1); sfx('stomp'); return; }
  if (o.type === 'hone') {
    if (o.state === 'sleep') return;
    if (falling) { p.vy = held('jump') ? -760 : -620; p.jumping = held('jump'); bossHit(o); return; }
    if (o.invT > 0 || o.state === 'recover') return;
    if (overlap({ x: p.x + 4, y: p.y + 6, w: p.w - 8, h: p.h - 8 }, { x: o.x + 8, y: o.y + 10, w: o.w - 16, h: o.h - 10 })) hurtPlayer(o.x + o.w / 2);
    return;
  }
  if (o.type === 'kabuto' || o.type === 'queen' || o.type === 'medama' || o.type === 'kage') {
    if (o.state === 'sleep') return;
    // 目を回している間は さわっても いたくない。ふむか けんで こうげき
    if (falling) { p.vy = -700; p.jumping = held('jump'); if (bossHit(o) === false) { p.vy = -560; } return; }
    if (o.state === 'stun' || o.invT > 0) return;
    hurtPlayer(o.x + o.w / 2); return;
  }
  if (o.type === 'boss') {
    if (o.state === 'sleep' || o.alpha < 0.6) return;
    if (falling) { p.vy = -700; p.jumping = held('jump'); bossHit(o); return; }
    hurtPlayer(o.x + o.w / 2); return;
  }
  if (falling && o.d.stomp && p.spin && !o.d.boss && o.type !== 'bomb') {
    // スピンで ふむと けむりに なって きえる(はねかえりは 小さい)
    p.vy = held('spin') || held('jump') ? -460 : -300; p.jumping = false;
    p.combo = (p.combo || 0) + 1; sfx('stomp', 0.85 + Math.min(8, p.combo - 1) * 0.07); hitStop(0.035);
    defeat(o, false, p.combo, true); return;
  }
  if (falling && o.d.stomp) {
    p.vy = held('jump') ? -760 : -480;
    p.jumping = held('jump');
    // 着地せずに続けて ふむと 音が上がって 点が ふえる
    p.combo = (p.combo || 0) + 1;
    sfx('stomp', 1 + Math.min(8, p.combo - 1) * 0.07);
    dust(o.x + o.w / 2, o.y, 6); hitStop(0.035);
    if (o.type === 'shell') { o.state = 'shell'; o.vx = 0; o.timer = 6; world.score += 100; popText(o.x + o.w / 2, o.y, '+100'); return; }
    if (o.type === 'bomb') { lightBomb(o); return; }
    if (o.type === 'slime' && o.big) { splitSlime(o); return; }
    o.squashT = 0.3;
    defeat(o, false, p.combo);
    return;
  }
  if (o.type === 'ghost' && o.shy) return;
  if (overlap(fair, o)) hurtPlayer(o.x + o.w / 2);
}

function updateThing(o, dt) {
  const p = P;
  o.ph = (o.ph || 0) + dt;
  switch (o.t) {
    case 'enemy':
      if (o.held) { for (const e of world.ents) if (e !== o && e.t === 'enemy' && !e.dying && !e.d.boss && overlap(o, e)) { defeat(e, true); defeat(o, true); sfx('hit'); P.carry = null; break; } break; }
      updateEnemy(o, dt); playerVsEnemy(o); break;
    case 'shard': if (!P.dead && overlap(P, o)) collect(o); break;
    case 'mount': updateMount(o, dt); break;
    case 'egg': updateEgg(o, dt); break;
    case 'tblock': updateLoose(o, dt); break;
    case 'pswitch': {
      if (o.pressed) { o.timer -= dt; if (o.timer <= 0) { o.gone = true; sparkle(o.x + 20, o.y + 20, 8); } break; }
      updateLoose(o, dt);
      if (!o.held && !P.dead && P.vy > 60 && overlap(P, o) && P.y + P.h - P.vy / 60 <= o.y + 14) { P.vy = -420; pressSilver(o); }
      break;
    }
    case 'palace': {
      // しんでんの 大きな スイッチ: ふむと その色の 点線ブロックが 出る(どの 面でも)
      if (!o.pressed && !P.dead && P.vy > 60 && overlap(P, { x: o.x, y: o.y - 10, w: o.w, h: 30 }) && P.y + P.h - P.vy / 60 <= o.y + 16) pressPalace(o);
      if (o.pressed) o.down = Math.min(1, o.down + dt * 6);
      break;
    }
    case 'ball': {
      o.x += o.vx * dt; o.y += (o.vy || 0) * dt; o.life -= dt;
      if (o.life <= 0 || isSolid(Math.floor((o.x + o.w / 2) / TILE), Math.floor((o.y + o.h / 2) / TILE))) { o.gone = true; burst(o.x + 12, o.y + 12, '#999', 5, 120, 3); }
      if (!p.dead && overlap(p, o)) {
        if (p.vy > 60 && p.y + p.h - 18 < o.y + 8) { o.gone = true; p.vy = -480; sfx('stomp'); world.score += 100; popText(o.x, o.y, '+100'); }
        else hurtPlayer(o.x + 12);
      }
      break;
    }
    case 'coin': case 'star': case 'heart': case 'potion': case 'key': case 'gem': case 'shield':
    case 'wing': case 'boots': case 'magnet': case 'oneup': case 'jet': case 'fire': case 'cape': {
      if (o.rising > 0) { o.rising -= dt; o.y -= 40 * dt; }
      // よびの 箱から おちてくる 物: ゆっくり おちて 主人公の ほうへ よる
      if (o.falling) { o.y += 120 * dt; o.x += clamp(P.x + P.w / 2 - (o.x + o.w / 2), -1, 1) * 70 * dt; if (o.y > cam.y + VH + 40) o.gone = true; if (!P.dead && overlap(P, o)) collect(o); break; }
      if (o.vy !== undefined) { o.vy += 1400 * dt; o.y += o.vy * dt; o.x += (o.vx || 0) * dt; const gy = groundYBelow(Math.floor((o.x + o.w / 2) / TILE), Math.max(0, Math.floor(o.y / TILE))); if (o.vy > 0 && o.y + o.h > gy * TILE) { o.y = gy * TILE - o.h; o.vy = 0; o.vx = 0; } }
      if (o.t === 'coin' && (p.magnetT > 0 || perkOn(7))) {
        const dx = p.x + p.w / 2 - (o.x + o.w / 2), dy = p.y + p.h / 2 - (o.y + o.h / 2), d = Math.hypot(dx, dy);
        if (d < (p.magnetT > 0 ? 240 : 110)) { o.x += dx / d * 420 * dt; o.y += dy / d * 420 * dt; }
      }
      if (!p.dead && overlap(p, o)) collect(o);
      break;
    }
    case 'hint': { if (!o.shown && p.x > o.x) { o.shown = true; toast = { text: o.text, sub: o.sub, t: 3.2 }; sfx('select'); } break; }
    case 'checkpoint': {
      if (!o.on && !p.dead && overlap(p, o)) {
        o.on = true; world.checkpoint = { x: o.x + 6, y: o.y + o.h - 54 }; world.cpIdx = o.idx;
        world.cpCoins = world.coins; world.cpScore = world.score; world.cpStars = [...world.stars]; world.cpShards = [...world.shards]; world.cpMaxHearts = p.maxHearts; world.cpPowers = [...p.powers];
        sfx('checkpoint'); sparkle(o.x + 20, o.y + 10, 16);
        if (p.hearts < p.maxHearts) p.hearts = p.maxHearts;
        // ちゅうかんゲート: 力も たても ないときは たてを もらえる(すこし 強くなる)
        const gift = !p.shield && !(p.powers && p.powers.length);
        if (gift) { p.shield = true; sfx('shield', 1.1); }
        o.tapeT = 0.6;
        toast = { text: 'ちゅうかんゲート!', sub: gift ? 'ここから やりなおせる。たてを もらった!' : 'ここからやりなおせます', t: 1.8 };
      }
      break;
    }
    case 'goal': {
      if (!world.clear && !p.dead && p.x + p.w > o.x + 14 && p.x < o.x + 3 * TILE) levelClear(o);
      if (o.tapeFall) { o.tapeFall.vy += 900 * dt; o.tapeFall.y += o.tapeFall.vy * dt; o.tapeFall.rot += dt * 3; }
      break;
    }
    case 'wave': {
      o.x += o.vx * dt; o.y += (o.vy || 0) * dt; o.life -= dt;
      if (o.life <= 0 || isSolid(Math.floor((o.x + o.w / 2) / TILE), Math.floor((o.y + o.h / 2) / TILE))) { o.gone = true; burst(o.x + 16, o.y + 16, '#ff8a2a', 6, 140, 4); break; }
      if (Math.random() < dt * 40) parts.push({ x: o.x + 16, y: o.y + rnd(4, 30), vx: -o.vx * 0.1, vy: rnd(-40, 40), life: 0.25, max: 0.25, color: Math.random() < .5 ? '#ffcf3a' : '#ff6a1f', size: rnd(3, 5), g: 0 });
      for (const e of world.ents) {
        if ((e.t === 'magic' || e.t === 'ball' || e.t === 'bone' || e.t === 'spit') && overlap(o, e)) { e.gone = true; sparkle(e.x + 10, e.y + 10, 6); continue; }
        if (e.t !== 'enemy' || e.dying || o.hit.has(e.id) || !overlap(o, e)) continue;
        o.hit.add(e.id);
        if (e.d.boss) { bossHit(e); o.gone = true; break; }
        if (!e.d.sword || e.type === 'orb') { o.gone = true; sfx('bump', 1.3); break; }
        if (e.type === 'bomb') { lightBomb(e, o.face * 300); continue; }
        if (e.type === 'slime' && e.big) { splitSlime(e); continue; }
        sfx('hit'); defeat(e, true);
      }
      break;
    }
    case 'bone': case 'spit': {
      o.vy += (o.g || 1200) * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.life -= dt; o.rot = (o.rot || 0) + dt * 14;
      if (o.life <= 0 || isSolid(Math.floor((o.x + 10) / TILE), Math.floor((o.y + 10) / TILE))) { o.gone = true; burst(o.x + 10, o.y + 10, o.t === 'bone' ? '#eee' : o.col, 5, 120, 3); }
      if (!p.dead && overlap(p, { x: o.x + 3, y: o.y + 3, w: 14, h: 14 })) { o.gone = true; hurtPlayer(o.x + 10); }
      break;
    }
    case 'magic': {
      o.x += o.vx * dt; o.y += o.vy * dt; o.life -= dt;
      if (Math.random() < dt * 30) parts.push({ x: o.x + 12, y: o.y + 12, vx: rnd(-30, 30), vy: rnd(-30, 30), life: 0.3, max: 0.3, color: Math.random() < .5 ? '#d38cff' : '#ffffff', size: 3, g: 0, star: true });
      if (o.life <= 0 || isSolid(Math.floor((o.x + 12) / TILE), Math.floor((o.y + 12) / TILE))) { o.gone = true; sparkle(o.x + 12, o.y + 12, 6); }
      if (!p.dead && overlap(p, { x: o.x + 4, y: o.y + 4, w: 16, h: 16 })) { o.gone = true; hurtPlayer(o.x + 12); }
      break;
    }
    case 'chest': {
      if (!o.open && !p.dead && overlap(p, o)) {
        o.open = true; sfx('door'); sfx('coins');
        for (let i = 0; i < 8; i++) world.ents.push({ id: ++uid, t: 'coin', x: o.x + 6, y: o.y - 10, w: 28, h: 32, ph: 0, vx: rnd(-160, 160), vy: rnd(-620, -380) });
        sparkle(o.x + 20, o.y, 16); world.score += 500; popText(o.x + 20, o.y - 20, 'たからばこ! +500', '#ffe066');
      }
      break;
    }
    case 'trampoline': {
      o.sq = Math.max(0, o.sq - dt * 4);
      if (!p.dead && p.vy > 0 && overlap(p, o) && p.y + p.h - p.vy * (1 / 60) <= o.y + 14) {
        p.y = o.y - p.h; p.vy = -o.power; p.jumping = false; o.sq = 1; p.airJumps = maxAirJumps(); p.airDash = 1;
        sfx('spring', 0.8); dust(o.x + o.w / 2, o.y, 8); sparkle(o.x + o.w / 2, o.y, 6);
      }
      break;
    }
    case 'booster': {
      if (!p.dead && overlap(p, o) && p.onGround) {
        if (p.boostT <= 0.05) { sfx('spring', 1.6); dust(p.x + p.w / 2, p.y + p.h, 6); }
        p.boostT = 0.7; p.vx = o.dir * 640; p.face = o.dir;
      }
      break;
    }
    case 'zapper': {
      const cyc = o.ph % 2.6; o.warn = cyc > 1.0 && cyc <= 1.4; o.on = cyc > 1.4;
      if (o.on && !p.dead && overlap(p, { x: o.x + 20, y: o.y, w: o.w - 40, h: o.h })) hurtPlayer(p.x + p.w / 2 + (p.vx > 0 ? -1 : 1));
      if (o.on && Math.random() < dt * 20) parts.push({ x: o.x + rnd(20, o.w - 20), y: o.y + 10, vx: rnd(-40, 40), vy: rnd(-60, 60), life: 0.2, max: 0.2, color: '#bff4ff', size: 2.5, g: 0, star: true });
      break;
    }
    case 'updraft': {
      if (!p.dead && overlap(p, o)) { p.vy = Math.max(p.vy - 3400 * dt, -460); p.airJumps = maxAirJumps(); p.airDash = 1; p.inDraft = true; }
      if (Math.random() < dt * 14) parts.push({ x: o.x + rnd(6, o.w - 6), y: o.gy * TILE - 10, vx: 0, vy: rnd(-260, -180), life: o.h / 220, max: o.h / 220, color: 'rgba(170,240,255,.8)', size: rnd(2, 4), g: 0 });
      break;
    }
    case 'balloon': {
      const py0 = o.y;
      const standing = p.onGround && p.x + p.w > o.x + 4 && p.x < o.x + o.w - 4 && Math.abs(p.y + p.h - o.y) < 4;
      if (o.state === 'idle') { o.y = o.y0 + Math.sin(o.ph * 2) * 4; if (standing) o.state = 'rise'; }
      else if (o.state === 'rise') { o.y -= 95 * dt; if (o.y < o.y0 - o.r) { o.state = 'pop'; o.timer = 3; sfx('boom', 1.8); burst(o.x + o.w / 2, o.y - 40, '#ff6b8b', 14, 220, 5); o.plat = false; } }
      else if (o.state === 'pop') { o.timer -= dt; if (o.timer <= 0) { o.state = 'idle'; o.y = o.y0; o.plat = true; sparkle(o.x + o.w / 2, o.y - 30, 8); } }
      o.dx = 0; o.dy = o.y - py0;
      break;
    }
    case 'bubble': {
      const py0 = o.y, px0 = o.x;
      const standing = p.onGround && p.x + p.w > o.x + 4 && p.x < o.x + o.w - 4 && Math.abs(p.y + p.h - o.y) < 4;
      if (o.state === 'idle') { o.y = o.y0 + Math.sin(o.ph * 1.8) * 14; o.x = o.x0 + Math.sin(o.ph * 0.9) * 20; if (standing) { o.state = 'wob'; o.timer = 0.9; } }
      else if (o.state === 'wob') { o.timer -= dt; o.y = o.y0 + Math.sin(o.ph * 1.8) * 14 + Math.sin(o.ph * 40) * 1.5; if (o.timer <= 0) { o.state = 'pop'; o.timer = 2.5; o.plat = false; sfx('boom', 2.2); sparkle(o.x + o.w / 2, o.y, 12); } }
      else if (o.state === 'pop') { o.timer -= dt; if (o.timer <= 0) { o.state = 'idle'; o.plat = true; } }
      o.dx = o.x - px0; o.dy = o.y - py0;
      break;
    }
    case 'firebar': {
      o.ang += o.sp * dt;
      if (!p.dead) for (let i = 1; i <= o.n; i++) {
        const bx = o.px + Math.cos(o.ang) * i * 20, by = o.py + Math.sin(o.ang) * i * 20;
        if (bx > p.x - 6 && bx < p.x + p.w + 6 && by > p.y - 6 && by < p.y + p.h + 6) { hurtPlayer(bx); break; }
      }
      break;
    }
    case 'icicle': {
      if (o.state === 'hang') { if (Math.abs(p.x + p.w / 2 - (o.x + o.w / 2)) < 70 && p.y > o.y) { o.state = 'shake'; o.timer = 0.35; } }
      else if (o.state === 'shake') { o.timer -= dt; o.shake = Math.sin(o.ph * 70) * 2; if (o.timer <= 0) { o.state = 'fall'; o.vy = 0; o.shake = 0; } }
      else if (o.state === 'fall') {
        o.vy += 2000 * dt; o.y += o.vy * dt;
        if (!p.dead && overlap(p, o)) hurtPlayer(o.x + o.w / 2);
        if (isSolid(Math.floor((o.x + o.w / 2) / TILE), Math.floor((o.y + o.h) / TILE)) || o.y > ROWS * TILE) { o.state = 'gone'; o.timer = 3; burst(o.x + o.w / 2, o.y + o.h, '#bfefff', 10, 200, 4); sfx('break', 1.4); }
      } else if (o.state === 'gone') { o.timer -= dt; if (o.timer <= 0) { o.state = 'hang'; o.x = o.x0; o.y = o.y0; } }
      break;
    }
    case 'geyser': {
      const cyc = o.ph % 3.2;
      o.warn = cyc > 1.4 && cyc <= 2.0; o.on = cyc > 2.0;
      if (o.warn && Math.random() < dt * 20) parts.push({ x: o.x + o.w / 2 + rnd(-14, 14), y: o.gy - 4, vx: rnd(-20, 20), vy: rnd(-120, -40), life: 0.4, max: 0.4, color: '#ffb02e', size: rnd(3, 5), g: 0 });
      if (o.on) {
        if (Math.random() < dt * 30) parts.push({ x: o.x + o.w / 2 + rnd(-12, 12), y: o.y + rnd(0, o.h), vx: rnd(-40, 40), vy: rnd(-220, -80), life: 0.4, max: 0.4, color: Math.random() < .5 ? '#ffcf3a' : '#ff5a1f', size: rnd(3, 6), g: 0 });
        if (!p.dead && overlap(p, { x: o.x + 6, y: o.y, w: o.w - 12, h: o.h })) hurtPlayer(o.x + o.w / 2);
      }
      break;
    }
    case 'spring': case 'mushroom': {
      o.sq = Math.max(0, o.sq - dt * 4);
      if (!p.dead && p.vy > 0 && overlap(p, o) && p.y + p.h - p.vy * (1 / 60) <= o.y + 16) {
        p.y = o.y - p.h; p.vy = -o.power; p.jumping = false; o.sq = 1; p.airJumps = maxAirJumps(); p.airDash = 1;
        sfx('spring'); dust(o.x + o.w / 2, o.y, 6);
      }
      break;
    }
    case 'move': case 'lift': {
      const px0 = o.x, py0 = o.y;
      if (o.t === 'move') o.x = o.x0 + (Math.sin(o.ph * 0.9) * 0.5 + 0.5) * o.r;
      else o.y = o.y0 - (Math.sin(o.ph * 0.9) * 0.5 + 0.5) * o.r;
      o.dx = o.x - px0; o.dy = o.y - py0;
      break;
    }
    case 'fallplat': {
      const prevY = o.y;
      const standing = p.onGround && p.x + p.w > o.x + 4 && p.x < o.x + o.w - 4 && Math.abs(p.y + p.h - o.y) < 3;
      if (o.state === 'idle' && standing) { o.state = 'shake'; o.timer = 0.85; }
      if (o.state === 'shake') { o.timer -= dt; o.shake = Math.sin(o.ph * 60) * 2; if (o.timer <= 0) { o.state = 'fall'; o.vy = 0; } }
      if (o.state === 'fall') { o.vy = (o.vy || 0) + 1600 * dt; o.y += o.vy * dt; if (o.y > ROWS * TILE + 100) { o.state = 'gone'; o.gone2 = true; o.timer = 3; } }
      if (o.state === 'gone') { o.timer -= dt; if (o.timer <= 0) { o.state = 'idle'; o.x = o.x0; o.y = o.y0; o.vy = 0; o.shake = 0; sparkle(o.x + o.w / 2, o.y, 6); } }
      o.dx = 0; o.dy = o.y - prevY;
      o.plat = o.state !== 'gone';
      break;
    }
    case 'door': {
      if (o.open > 0) { o.open = Math.min(1, o.open + dt * 2); break; }
      const near = p.x + p.w >= o.x - 4 && p.x <= o.x + o.w + 4 && p.y + p.h > o.y && p.y < o.y + o.h;
      if (near && world.keyHeld) { world.keyHeld = false; o.open = 0.01; sfx('door'); sparkle(o.x + 24, o.y + 48, 14); toast = { text: 'とびらがひらいた!', sub: '', t: 1.4 }; }
      else if (near && !world.keyHeld && !o.hinted) { o.hinted = true; toast = { text: 'カギがかかっている', sub: 'どこかにカギがあるはず…', t: 2 }; }
      break;
    }
    case 'flame': {
      const cyc = (o.ph % 2.4);
      o.on = cyc > 1.2;
      o.warn = cyc > 0.9 && cyc <= 1.2;
      if (o.on && !p.dead && overlap(p, { x: o.x + 6, y: o.y, w: o.w - 12, h: o.h - 40 })) hurtPlayer(o.x + o.w / 2);
      if (o.on && Math.random() < dt * 20) parts.push({ x: o.x + o.w / 2 + rnd(-8, 8), y: o.y + 40, vx: rnd(-20, 20), vy: rnd(-200, -120), life: 0.4, max: 0.4, color: Math.random() < .5 ? '#ffcf3a' : '#ff6a1f', size: rnd(3, 6), g: 0 });
      break;
    }
    case 'crusher': {
      const under = Math.abs(p.x + p.w / 2 - (o.x + o.w / 2)) < 60 && p.y > o.y;
      if (o.state === 'wait') { o.timer -= dt; if (o.timer <= 0 && under) { o.state = 'shake'; o.timer = 0.3; } }
      else if (o.state === 'shake') { o.timer -= dt; o.shake = Math.sin(o.ph * 70) * 2; if (o.timer <= 0) { o.state = 'fall'; o.vy = 0; o.shake = 0; } }
      else if (o.state === 'fall') {
        o.vy += 2600 * dt; o.y += o.vy * dt;
        const floor = o.gy * TILE - o.h;
        if (!p.dead && overlap(p, o) && p.y > o.y + 10) hurtPlayer(o.x + o.w / 2, true);
        if (o.y >= floor) { o.y = floor; o.state = 'land'; o.timer = 0.9; sfx('break', 0.5); cam.shake = 0.25; dust(o.x + 10, o.y + o.h, 6); dust(o.x + o.w - 10, o.y + o.h, 6); }
      } else if (o.state === 'land') { o.timer -= dt; if (o.timer <= 0) o.state = 'up'; }
      else if (o.state === 'up') { o.y -= 90 * dt; if (o.y <= o.y0) { o.y = o.y0; o.state = 'wait'; o.timer = 0.4; } }
      break;
    }
    case 'saw': {
      const s = Math.sin(o.ph * 1.6) * 0.5 + 0.5;
      if (o.horiz) o.x = o.x0 + s * o.r; else o.y = o.y0 + s * o.r;
      if (!p.dead && Math.hypot(p.x + p.w / 2 - (o.x + 26), p.y + p.h / 2 - (o.y + 26)) < 40) hurtPlayer(o.x + 26);
      break;
    }
    case 'wind': {
      // 吹く強さ: 1=吹いている / 0.25=止む前後の弱い風(合図) / 0=止んでいる
      if (o.on > 0 && o.off > 0) {
        const cyc = o.ph % (o.on + o.off);
        o.blow = cyc < o.on ? (cyc > o.on - 0.5 ? 0.25 : 1) : (cyc > o.on + o.off - 0.6 ? 0.25 : 0);
      } else o.blow = 1;
      if (o.blow > 0 && !p.dead && !p.climb && overlap(p, o)) p.windAcc = (p.windAcc || 0) + o.dir * o.v * (o.blow === 1 ? 1 : 0.25);
      if (o.blow > 0 && Math.abs(o.x + o.w / 2 - (cam.x + VW / 2)) < VW) {
        const rate = o.w * o.h / 9000 * o.blow;
        if (Math.random() < dt * rate) parts.push({ x: o.dir > 0 ? o.x + rnd(0, o.w * 0.4) : o.x + o.w - rnd(0, o.w * 0.4), y: o.y + rnd(10, o.h - 10), vx: o.dir * rnd(420, 560), vy: rnd(-20, 20), life: o.w / 520, max: o.w / 520, color: 'rgba(235,250,255,.7)', size: rnd(18, 40), g: 0, streak: true });
      }
      break;
    }
    case 'portal': {
      if (p.dead || !overlap({ x: p.x + 6, y: p.y + 10, w: p.w - 12, h: p.h - 20 }, o)) break;
      p.touchPortal = true;
      if (p.warpLock || o.exitOnly) break;
      const fromX = p.x + p.w / 2, fromY = p.y + p.h / 2;
      p.x = o.to[0] * TILE + 24 - p.w / 2; p.y = (o.to[1] + 1) * TILE - p.h; p.vy = 0; p.vx *= 0.3;
      p.standOn = null; p.climb = false; p.warpLock = true;
      sparkle(fromX, fromY, 16); sparkle(p.x + p.w / 2, p.y + p.h / 2, 20); burst(p.x + p.w / 2, p.y + p.h / 2, '#9fe8ff', 10, 200, 4);
      sfx('door', 1.6); sfx('powerup', 1.5);
      camSnap();
      world.warpFlash = 0.35;
      break;
    }
    case 'rock': {
      if (o.state === 'warn') { o.timer -= dt; if (o.timer <= 0) { o.state = 'fall'; o.y = -50; } break; }
      o.vy += 2200 * dt; o.y += o.vy * dt; o.rot += dt * 6;
      if (!p.dead && overlap(p, { x: o.x + 6, y: o.y + 6, w: o.w - 12, h: o.h - 10 })) hurtPlayer(o.x + o.w / 2);
      if (o.y + o.h >= o.gy) { o.gone = true; debris(o.x, o.gy - 40, 'boulder'); dust(o.x + o.w / 2, o.gy, 8); sfx('break', 0.6); cam.shake = Math.max(cam.shake, 0.15); }
      break;
    }
    case 'roller': {
      // ころがる いわを ときどき おくりだす
      if (Math.abs(o.x - p.x) > VW * 0.9) break;
      o.timer -= dt;
      if (o.timer <= 0) {
        o.timer = o.every;
        world.ents.push({ id: ++uid, t: 'rollrock', x: o.x + 2, y: o.gy * TILE - 46, w: 44, h: 44, vx: o.dir * o.sp, vy: 0, rot: 0, sp: o.sp, dir: o.dir });
        sfx('boom', 1.4); dust(o.x + 24, o.gy * TILE, 4);
      }
      break;
    }
    case 'rollrock': {
      o.vy = Math.min(o.vy + GRAV * dt, MAXFALL); o.vx = o.dir * o.sp;
      moveBody(o, dt); o.rot += o.vx / 22 * dt;
      if (o.onGround && Math.random() < dt * 10) dust(o.x + o.w / 2, o.y + o.h, 1);
      if (o.hitWall || o.y > ROWS * TILE + 40) { o.gone = true; if (o.hitWall) { debris(o.x, o.y, 'boulder'); sfx('break', 0.7); } break; }
      if (!p.dead && overlap(p, { x: o.x + 4, y: o.y + 4, w: o.w - 8, h: o.h - 4 })) {
        if (p.vy > 60 && p.y + p.h - p.vy / 60 <= o.y + 16) { p.vy = held('jump') ? -720 : -480; p.jumping = held('jump'); sfx('stomp', 0.8); dust(o.x + 22, o.y, 4); }
        else hurtPlayer(o.x + o.w / 2);
      }
      break;
    }
    case 'plate': {
      // じかんスイッチ: ふむと とびら(5)が しばらく ひらく
      const on = !p.dead && p.onGround && overlap(p, { x: o.x, y: o.y - 6, w: o.w, h: o.h + 6 });
      o.down = on ? 1 : Math.max(0, o.down - dt * 4);
      if (on && !(world.gateT > o.dur - 0.5)) {
        if (!(world.gateT > 0)) { sfx('door', 1.2); sfx('select'); toast = { text: 'とびらが ひらいた!', sub: o.dur + 'びょうで しまるよ。いそげ!', t: 1.6 }; }
        world.gateT = o.dur; world.gateMax = o.dur;
      }
      break;
    }
    case 'gate': {
      // ボス部屋の入り口: 上から落ちてきて とじる。たおすと 上に あがる
      if (o.drop > 0) { o.drop = Math.max(0, o.drop - dt * 5); if (o.drop === 0) { sfx('break', 0.5); dust(o.x + 24, o.y + o.h, 8); } }
      if (o.opening) { o.y -= 120 * dt; o.solid = false; if (o.y < -o.h) o.gone = true; }
      break;
    }
    // ---------- ワールド6〜8 ----------
    case 'zip': {
      // ジップライン: とってに さわると つかまって 下へ すべる
      const hx = lerp(o.ax, o.bx, o.s), hy = lerp(o.ay, o.by, o.s);
      if (o.state === 'idle') {
        if (!p.dead && !p.zip && !(p.zipCD > 0) && !p.inCannon && overlap(p, { x: hx - 24, y: hy + 6, w: 48, h: 70 })) {
          o.state = 'ride'; o.v = Math.max(120, Math.abs(p.vx) * 0.5); p.zip = o; p.climb = false; sfx('door', 1.8); sfx('jump2', 0.8);
          if (!world.seenZip) { world.seenZip = true; toast = { text: 'ジップライン!', sub: 'ジャンプで いつでも はなせる', t: 2.2 }; }
        }
      } else if (o.state === 'ride') {
        o.v = Math.min(o.v + 900 * dt, 520); o.s = Math.min(1, o.s + o.v * dt / o.len);
        const nx = lerp(o.ax, o.bx, o.s), ny = lerp(o.ay, o.by, o.s);
        if (p.zip === o) { p.x = nx - p.w / 2; p.y = ny + 26; if (Math.random() < dt * 20) parts.push({ x: nx, y: ny, vx: rnd(-60, 60), vy: rnd(-60, 0), life: 0.25, max: 0.25, color: '#ffd84a', size: 2.5, g: 400 }); }
        if (o.s >= 1 || p.zip !== o) zipRelease(o, false);
      } else if (o.state === 'back') {
        o.s = Math.max(0, o.s - 300 * dt / o.len); if (o.s <= 0) o.state = 'idle';
      }
      break;
    }
    case 'cannon': {
      if (o.recoil > 0) o.recoil = Math.max(0, o.recoil - dt * 3);
      if (!p.dead && !p.inCannon && !p.zip && !(p.cannonCD > 0) && overlap({ x: p.x + 4, y: p.y + 10, w: p.w - 8, h: p.h - 10 }, { x: o.x + 6, y: o.y + 6, w: o.w - 12, h: o.h - 6 })) {
        p.inCannon = o; o.fireT = 0.55; p.vx = 0; p.vy = 0; sfx('door', 1.3); sfx('click', 0.8);
        if (!world.seenCannon) { world.seenCannon = true; toast = { text: 'ほしの たいほう!', sub: 'すこし まつと とびだす(ジャンプで すぐ うてる)', t: 2.2 }; }
      }
      break;
    }
    case 'lowgrav': {
      if (!p.dead && overlap(p, o)) p.lowFlag = true;
      if (Math.abs(o.x + o.w / 2 - (cam.x + VW / 2)) < VW && Math.random() < dt * o.w / 60) parts.push({ x: o.x + rnd(0, o.w), y: rnd(2 * TILE, 10 * TILE), vx: 0, vy: rnd(-40, -15), life: 1.6, max: 1.6, color: '#e2d6ff', size: rnd(1.5, 3), g: 0, star: true });
      if (!world.seenLow && overlap(p, o)) { world.seenLow = true; toast = { text: 'ふわふわ ゾーン', sub: 'からだが かるい! たかく とべて ゆっくり おちる', t: 2.6 }; }
      break;
    }
    case 'comet': {
      // ほうき星: 画面の 右の 外から とんでくる。来る前に 右の はしに「!」と 線で 知らせる
      const inRange = p.x > o.x - VW * 0.3 && p.x < o.x + o.w;
      if (!inRange) { o.warn = false; break; }
      o.timer -= dt; o.warn = o.timer < 1.0;
      if (o.timer <= 0) {
        o.timer = o.every; o.warn = false;
        world.ents.push({ id: ++uid, t: 'cometx', x: cam.x + VW + 40, y: o.row * TILE + 6, w: 40, h: 36, vx: -430, rot: 0, x0: o.x });
        sfx('dash', 1.6);
      }
      break;
    }
    case 'cometx': {
      o.x += o.vx * dt; o.rot += dt * 8;
      if (Math.random() < dt * 40) parts.push({ x: o.x + o.w, y: o.y + o.h / 2 + rnd(-8, 8), vx: rnd(60, 160), vy: rnd(-20, 20), life: 0.35, max: 0.35, color: Math.random() < 0.5 ? '#ffd84a' : '#ff9a2e', size: rnd(3, 5), g: 0 });
      if (o.x < cam.x - 160 || o.x < o.x0 - 2 * VW) { o.gone = true; break; }
      if (!p.dead && overlap(p, { x: o.x + 4, y: o.y + 4, w: o.w - 8, h: o.h - 8 })) {
        if (p.vy > 60 && p.y + p.h - p.vy / 60 <= o.y + 14) { p.vy = held('jump') ? -720 : -480; p.jumping = held('jump'); sfx('stomp', 1.2); sparkle(o.x + 20, o.y, 8); }
        else hurtPlayer(o.x + o.w / 2);
      }
      break;
    }
    case 'rail': {
      // せんろの 上を 行ったり 来たり
      const px0 = o.x, py0 = o.y;
      o.s += o.dir * o.sp * dt;
      if (o.s >= o.len) { o.s = o.len; o.dir = -1; } else if (o.s <= 0) { o.s = 0; o.dir = 1; }
      let d = o.s, i = 1;
      while (i < o.pts.length - 1 && d > Math.hypot(o.pts[i][0] - o.pts[i - 1][0], o.pts[i][1] - o.pts[i - 1][1])) { d -= Math.hypot(o.pts[i][0] - o.pts[i - 1][0], o.pts[i][1] - o.pts[i - 1][1]); i++; }
      const a = o.pts[i - 1], b = o.pts[i], sl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, k = Math.min(1, d / sl);
      o.x = a[0] + (b[0] - a[0]) * k; o.y = a[1] + (b[1] - a[1]) * k;
      o.dx = o.x - px0; o.dy = o.y - py0;
      break;
    }
    case 'ballchain': {
      o.ang += o.sp * dt;
      o.bx = o.cx + Math.cos(o.ang) * o.r; o.by = o.cy + Math.sin(o.ang) * o.r;
      if (!p.dead && Math.hypot(p.x + p.w / 2 - o.bx, p.y + p.h / 2 - o.by) < 40) hurtPlayer(o.bx);
      break;
    }
    case 'ceil': {
      // つぶす 天井: wait → shake → down → stay → up
      o.timer -= dt;
      if (o.state === 'wait') { if (o.timer <= 0 && Math.abs(p.x - (o.x + o.w / 2)) < VW) { o.state = 'shake'; o.timer = 0.6; } }
      else if (o.state === 'shake') { o.shake = Math.sin(o.ph * 70) * 2; if (o.timer <= 0) { o.state = 'down'; o.shake = 0; sfx('door', 0.5); } }
      else if (o.state === 'down') { o.yb = Math.min(o.stop, o.yb + 170 * dt); if (o.yb >= o.stop) { o.state = 'stay'; o.timer = 0.9; cam.shake = Math.max(cam.shake, 0.25); sfx('break', 0.5); } }
      else if (o.state === 'stay') { if (o.timer <= 0) o.state = 'up'; }
      else if (o.state === 'up') { o.yb = Math.max(o.y0, o.yb - 90 * dt); if (o.yb <= o.y0) { o.state = 'wait'; o.timer = 1.6; } }
      // あたり: くぼみ(notch)の 列は 2マス 高い
      if (!p.dead && p.x + p.w > o.x && p.x < o.x + o.w) {
        const c0 = Math.floor((p.x + 6 - o.x) / TILE), c1 = Math.floor((p.x + p.w - 6 - o.x) / TILE);
        let bot = 0; for (let c = c0; c <= c1; c++) bot = Math.max(bot, o.yb - (o.notch.includes(c) ? 2 * TILE : 0));
        if (p.y < bot - 4) { if (p.onGround) hurtPlayer(o.x + o.w / 2, true); p.y = Math.max(p.y, bot); if (p.vy < 0) p.vy = 0; }
      }
      break;
    }
    case 'well': {
      // いど: 上に 立って ↓で 入る
      const on = !p.dead && p.onGround && Math.abs(p.x + p.w / 2 - (o.x + 24)) < 18 && Math.abs(p.y + p.h - o.y - 16) < 6;
      o.on = on;
      if (on && pressed.down) { pressed.down = false; warpPlayer(o.to[0], o.to[1] - 1, o.back ? 0.25 : 0.3); sfx('jump2', 0.6); }
      break;
    }
    case 'wdoor': {
      o.near = !p.dead && p.onGround && overlap({ x: p.x + 8, y: p.y, w: p.w - 16, h: p.h }, { x: o.x + 8, y: o.y, w: 32, h: o.h });
      if (o.open > 0) o.open = Math.max(0, o.open - dt * 2);
      break;
    }
    case 'wheelplat': {
      const px0 = o.x, py0 = o.y, a = o.a0 + world.time * o.sp;
      o.x = o.cx + Math.cos(a) * o.r - o.w / 2; o.y = o.cy + Math.sin(a) * o.r;
      if (o.init) { o.dx = o.x - px0; o.dy = o.y - py0; } else { o.dx = 0; o.dy = 0; o.init = true; }
      break;
    }
    case 'crumb': {
      // くずれる つりばし: だれかが のると じゅんに おちていく。しばらくして もどる
      const B = (world.bridges = world.bridges || {}), g = B[o.g] || (B[o.g] = { t0: -1, k0: 0 });
      const standing = p.onGround && p.x + p.w > o.x + 4 && p.x < o.x + o.w - 4 && Math.abs(p.y + p.h - o.y) < 4;
      if (standing && g.t0 < 0) { g.t0 = world.time; g.k0 = o.i; sfx('break', 1.6); if (!world.seenCrumb) { world.seenCrumb = true; toast = { text: 'くずれる つりばし!', sub: 'とまらずに はしりぬけよう', t: 2.2 }; } }
      const prevY = o.y;
      if (g.t0 >= 0) {
        const when = g.t0 + 0.45 + Math.max(0, o.i - g.k0) * 0.17, el = world.time - when;
        o.shake = el > -0.3 && el < 0 ? Math.sin(o.ph * 70) * 2 : 0;
        if (el >= 0 && o.state === 'idle') { o.state = 'fall'; o.vy = 0; }
        if (o.state === 'fall') { o.vy += 1800 * dt; o.y += o.vy * dt; if (o.y > ROWS * TILE + 60) o.state = 'gone'; }
        if (world.time > g.t0 + 0.45 + o.n * 0.17 + 2.6) g.t0 = -1;
      } else if (o.state !== 'idle') { o.state = 'idle'; o.y = o.y0; o.vy = 0; sparkle(o.x + 24, o.y, 3); }
      o.plat = o.state !== 'gone'; o.dx = 0; o.dy = o.y - prevY;
      break;
    }
    case 'shadowzone': {
      // かげハル: この区間に 入ると、すこし おくれて 自分と 同じ うごきで おいかけてくる
      const inside = !p.dead && p.x > o.x && p.x < o.x + o.w;
      if (inside && !o.active) { o.active = true; o.rec = []; o.alpha = 0; o.shown = false; sfx('powerup', 0.5); if (!world.seenShadow) { world.seenShadow = true; toast = { text: 'かげが おいかけてくる!', sub: 'たちどまらずに すすもう', t: 2.4 }; } }
      if (!o.active) break;
      if (!inside) { o.alpha = Math.max(0, o.alpha - dt * 3); if (o.alpha <= 0) { o.active = false; o.rec = []; o.shown = false; } break; }
      o.rec.push([p.x, p.y, p.face]);
      const lag = Math.round(o.delay * 120);
      if (o.rec.length > lag) { const r = o.rec.shift(); o.sx = r[0]; o.sy = r[1]; o.sf = r[2]; o.alpha = Math.min(0.85, o.alpha + dt * 2); o.shown = true; }
      if (o.shown && o.alpha > 0.5 && !p.dead && overlap({ x: p.x + 4, y: p.y + 6, w: p.w - 8, h: p.h - 10 }, { x: o.sx + 6, y: o.sy + 8, w: 16, h: 40 })) hurtPlayer(o.sx + 14);
      break;
    }
    case 'swave': {
      o.x += o.vx * dt; o.life -= dt;
      if (o.life <= 0 || isSolid(Math.floor((o.x + (o.vx > 0 ? o.w : 0)) / TILE), Math.floor((o.y + o.h / 2) / TILE))) { o.gone = true; burst(o.x + o.w / 2, o.y + o.h / 2, '#6a4a9a', 6, 140, 4); break; }
      if (Math.random() < dt * 30) parts.push({ x: o.x + rnd(0, o.w), y: o.y + rnd(0, o.h), vx: -o.vx * 0.1, vy: rnd(-60, -10), life: 0.35, max: 0.35, color: Math.random() < .5 ? '#4a2a7a' : '#a07ad8', size: rnd(3, 6), g: 0, puff: true });
      if (!p.dead && overlap(p, { x: o.x + 4, y: o.y + 6, w: o.w - 8, h: o.h - 6 })) hurtPlayer(o.x + o.w / 2);
      break;
    }
    case 'axe': {
      o.ang = Math.sin(o.ph * 1.8) * 1.1;
      const hx = o.px + Math.sin(o.ang) * o.len, hy = o.py + Math.cos(o.ang) * o.len;
      o.hx = hx; o.hy = hy;
      if (!p.dead && Math.hypot(p.x + p.w / 2 - hx, p.y + p.h / 2 - hy) < 42) hurtPlayer(hx);
      break;
    }
  }
}

function collect(o) {
  o.gone = true;
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  switch (o.t) {
    case 'coin': world.coins++; world.score += 100; sparkle(cx, cy, 5);
      // 続けて取ると 音が少しずつ 高くなる
      world.coinChain = (world.coinChainT > 0 ? (world.coinChain || 0) + 1 : 0); world.coinChainT = 0.4; world.coinPop = 0.18;
      sfx('coin', 1 + Math.min(12, world.coinChain) * 0.035);
      if (world.coins % 50 === 0 && P.maxHearts < 5) { P.maxHearts++; P.hearts = P.maxHearts; toast = { text: 'ハートがふえた!', sub: 'コイン50まい', t: 1.6 }; sfx('powerup'); }
      break;
    case 'star': world.stars[o.idx] = true; world.score += 1000; sfx('star'); sparkle(cx, cy, 20); burst(cx, cy, '#ffe14d', 14, 260, 5);
      popText(cx, cy - 20, `ほし ${world.stars.filter(Boolean).length}/3`, '#ffe14d'); break;
    case 'heart':
      if (P.hearts >= P.maxHearts && !o.fromRes && !save.reserve) { stashReserve('heart', cx, cy); break; }
      P.hearts = Math.min(P.maxHearts, P.hearts + 1); world.score += 200; sfx('powerup'); sparkle(cx, cy, 10); break;
    case 'shard': {
      world.shards[o.idx] = true;
      const n = world.shards.filter(Boolean).length, pts = [1000, 2000, 4000, 8000, 10000][n - 1] || 1000;
      world.score += pts; sfx('star', 0.9 + n * 0.1); sparkle(cx, cy, 24); burst(cx, cy, '#d8b8ff', 14, 260, 5);
      popText(cx, cy - 24, 'かけら ' + n + '/5  +' + pts, '#e6c8ff');
      if (n === 5) {
        P.maxHearts = Math.min(6, P.maxHearts + 1); P.hearts = P.maxHearts; sfx('oneup');
        toast = { text: 'ほしの かけら 5まい ぜんぶ!', sub: 'ハートの さいだいが ふえた(この ステージ)', t: 2.6 };
        for (let i = 0; i < 3; i++) setTimeout(() => { if (world && scene === 'play') firework(cx + rnd(-80, 80), cy - 60 + rnd(-40, 20)); }, i * 200);
      } else if (!world.seenShard) { world.seenShard = true; toast = { text: '大きな ほしの かけら!', sub: '1つの ステージに 5まい。ぜんぶ あつめると ハート+1', t: 2.6 }; }
      break;
    }
    case 'potion': P.hearts = P.maxHearts; world.score += 300; sfx('powerup'); sparkle(cx, cy, 12); popText(cx, cy - 20, 'ぜんかいふく!', '#ff8fa8'); break;
    case 'key': world.keyHeld = true; sfx('key'); sfx('item'); sparkle(cx, cy, 14); toast = { text: 'カギをてにいれた!', sub: 'とびらをあけよう', t: 1.8 }; break;
    case 'gem': world.score += 500; sfx('item'); sparkle(cx, cy, 10); popText(cx, cy - 10, '+500', '#ff6b8b'); break;
    case 'wing': case 'boots': case 'fire': case 'cape': {
      const k = { wing: 'wing', boots: 'dash', fire: 'fire', cape: 'cape' }[o.t];
      if (hasPower(k) && !o.fromRes) stashReserve(k, cx, cy); else gainPower(k, cx, cy);
      break;
    }
    case 'jet': P.jetT = 15; P.airJumps = maxAirJumps(); sfx('powerup', 1.2); sparkle(cx, cy, 20); popText(cx, cy - 20, 'ジェットつばさ! 3だんジャンプ', '#ffe066'); break;
    case 'magnet': P.magnetT = 12; sfx('powerup'); sparkle(cx, cy, 14); popText(cx, cy - 20, 'コインじしゃく!', '#ff6b8b'); break;
    case 'oneup': P.maxHearts = Math.min(6, P.maxHearts + 1); P.hearts = P.maxHearts; sfx('oneup'); sparkle(cx, cy, 18); popText(cx, cy - 20, 'ハート +1!', '#7dff8a'); break;
    case 'shield': if (P.shield && !o.fromRes) { stashReserve('shield', cx, cy); break; } P.shield = true; world.score += 300; sfx('shield'); sparkle(cx, cy, 14); popText(cx, cy - 20, 'まもりのたて!', '#7fd0ff'); break;
  }
}

const FW_COLORS = ['#ff5a7a', '#ffd84a', '#5ee0ff', '#8cff6a', '#c78bff', '#ff9a2e', '#ffffff'];
function firework(x, y) {
  const col = FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)], col2 = FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)];
  const n = 36;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, sp = rnd(180, 330);
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.9, 1.3), max: 1.3, color: i % 3 ? col : col2, size: rnd(3, 5), g: 220, drag: true, star: i % 4 === 0 });
  }
  for (let i = 0; i < 10; i++) parts.push({ x, y, vx: rnd(-60, 60), vy: rnd(-60, 60), life: 0.5, max: 0.5, color: '#ffffff', size: 6, g: 0 });
  sfx('firework', rnd(0.9, 1.15));
}
function confetti(n = 60) {
  for (let i = 0; i < n; i++) parts.push({ x: cam.x + rnd(0, VW), y: cam.y - rnd(10, 160), vx: rnd(-60, 60), vy: rnd(60, 160), life: rnd(2.2, 3.4), max: 3.4, color: FW_COLORS[i % FW_COLORS.length], size: rnd(4, 7), g: 60, confetti: true, rot: rnd(0, 6), vr: rnd(-8, 8) });
}
// ゴールの テープ: 2本の 柱の 間を 上下に うごく。くぐった 高さで ごほうびが かわる(上ほど 多い)
function goalTape(o) {
  const bottom = o.y + o.h, top = bottom - 6 * TILE + 20, lo = bottom - 26, hi2 = top + 22;
  const u = (o.ph * 0.42) % 2, k = u > 1 ? 2 - u : u;
  return { y: lo - (lo - hi2) * k, k, top, bottom };
}
function pressPalace(o) {
  o.pressed = true; save.palace[o.color] = true; writeSave();
  P.vy = -300; sfx('door', 0.7); sfx('boom', 0.9); sfx('powerup', 0.8); cam.shake = 0.5; hitStop(0.12);
  world.lightFlash = 0.5; burst(o.x + o.w / 2, o.y, PALACE_COL[o.color], 30, 360, 6); confetti(40);
  toast = { text: PALACE_NAME[o.color] + 'の スイッチを おした!', sub: 'どの ステージでも ' + PALACE_NAME[o.color] + 'の 点線ブロックが 本物に なる', t: 3.2 };
  world.palaceT = 2.6; world.palaceGoal = { x: o.x + 24, y: o.y - 100, palace: true };
}
function levelClear(goal) {
  world.clear = true; world.clearT = 0; world.flash = 1; world.fwT = 0.5; world.goalX = goal.x;
  toast = null;
  bgm('');
  sfx('clear');
  // テープを くぐったか
  let tape = null;
  if (goal.t === 'goal') {
    const g = goalTape(goal);
    if (g.y >= P.y - 12 && g.y <= P.y + P.h + 8) {
      const k = g.k, pts = (1 + Math.round(k * 9)) * 1000, coins = Math.round(k * 20);
      tape = { k, pts, coins, top: k > 0.85 };
      world.score += pts; world.coins += coins;
      goal.tapeFall = { y: g.y, vy: -200, rot: 0 };
      popText(goal.x + 30, g.y - 20, (tape.top ? 'てっぺん! ' : 'テープ ') + '+' + pts, tape.top ? '#ffe066' : '#fff');
      if (tape.top) { sfx('oneup'); if ((save.bag.heart || 0) < 3) save.bag.heart = (save.bag.heart || 0) + 1; }
    }
  }
  const prevSh = save.shards[world.def.id] || [false, false, false, false, false];
  save.shards[world.def.id] = prevSh.map((v, i) => v || !!world.shards[i]);
  sparkle(goal.x + 24, goal.y + 10, 30);
  burst(goal.x + 24, goal.y + 40, '#ffe14d', 30, 360, 6);
  cam.shake = 0.2;
  confetti(80);
  const timeBonus = Math.max(0, Math.floor((world.def.time - world.time)) * 10);
  world.score += timeBonus + P.hearts * 500;
  const id = world.def.id;
  const beforeStars = totalStars();
  const prev = save.stars[id] || [false, false, false];
  save.stars[id] = prev.map((v, i) => v || world.stars[i]);
  save.best[id] = Math.max(save.best[id] || 0, world.score);
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, world.idx + 2));
  const firstClear = !save.cleared[id];
  save.cleared[id] = true;
  const secretNew = !!goal.secret && !save.secret[id];
  if (goal.secret) save.secret[id] = true;
  save.wallet = (save.wallet || 0) + world.coins;
  writeSave();
  const afterStars = totalStars();
  const newPerk = PERKS.find(pk => beforeStars < pk.need && afterStars >= pk.need);
  clearInfo = { timeBonus, heartBonus: P.hearts * 500, newPerk, secret: !!goal.secret, secretNew, firstClear, tape, palace: !!goal.palace, saved: ['fort', 'boss', 'switch', 'ghost'].includes(world.def.kind) };
}

// ---------- 1フレーム ----------
function update(dt) {
  if (scene === 'play') {
    if (consume('pause')) { scene = 'pause'; pauseSel = 0; sfx('pause'); if (bgmEl) bgmEl.pause(); return; }
    if (hitStopT > 0) { hitStopT -= dt; cam.shake = Math.max(0, cam.shake - dt * 0.5); return; }
    world.time += world.clear ? 0 : dt;
    for (const k of ['warpFlash', 'hurtFlash', 'coinPop', 'swFlash', 'lightFlash']) if (world[k] > 0) world[k] = Math.max(0, world[k] - dt);
    const bp = blinkPhase();
    if (world.lastBlink !== undefined && bp !== world.lastBlink && !P.dead) { pushOutOf('34'); if (level.hasBlink) sfx('click', bp ? 1.5 : 1.3); }
    world.lastBlink = bp;
    if (world.gateT > 0) {
      const before = Math.ceil(world.gateT);
      world.gateT -= dt;
      if (world.gateT <= 0 && overlapsTile('5')) world.gateT = 0.05; // 主人公が とびらの中に いる間は しめない
      if (world.gateT > 0 && Math.ceil(world.gateT) !== before) sfx('click', world.gateT < 2 ? 2.2 : 1.8);
      if (world.gateT <= 0) { sfx('door', 0.8); cam.shake = Math.max(cam.shake, 0.1); }
    }
    if (world.coinChainT > 0) world.coinChainT -= dt; else world.coinChain = 0;
    for (const k in world.spinBlk) { world.spinBlk[k] -= dt; if (world.spinBlk[k] <= 0) { const [tx, ty] = k.split(',').map(Number); if (overlap(P, { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE })) world.spinBlk[k] = 0.1; else delete world.spinBlk[k]; } }
    updateSilverTimer(dt);
    if (world.palaceT > 0) { world.palaceT -= dt; if (world.palaceT <= 0 && !world.clear) levelClear(world.palaceGoal); }
    if (world.introT > 0) world.introT -= dt;
    if (world.resPop > 0) world.resPop -= dt;
    for (const [k, t] of world.bumps) { if (t - dt <= 0) world.bumps.delete(k); else world.bumps.set(k, t - dt); }
    updatePlayer(dt);
    updateGrow(dt);
    for (const o of world.ents) if (!o.gone) updateThing(o, dt);
    world.ents = world.ents.filter(o => !o.gone);
    updateCamera(dt);
    // ゴールの演出は 1.2秒 たったら ボタンで とばせる
    if (world.clear && world.clearT > 1.2 && world.clearT < 3.4 && (consume('ok') || consume('jump'))) world.clearT = 3.39;
    if (world.clear) { world.clearT += dt; world.flash = Math.max(0, (world.flash || 0) - dt * 2.5); if (world.clearT > 3.4 && scene === 'play') { scene = 'clear'; world.shownScore = 0; world.shownCoins = 0; world.starPop = [false, false, false]; } }
  } else if (scene === 'pause') {
    if (consume('pause')) resume();
    if (consume('down')) pauseSel = (pauseSel + 1) % 4;
    if (consume('up')) pauseSel = (pauseSel + 3) % 4;
    if (consume('ok') || consume('jump')) PAUSE_ITEMS[pauseSel].fn();
  } else if (scene === 'title') {
    titleT += dt;
    if (consume('ok') || consume('jump')) openFiles();
  } else if (scene === 'files') {
    titleT += dt;
    if (consume('right')) { files.sel = (files.sel + 1) % 3; sfx('click'); }
    if (consume('left')) { files.sel = (files.sel + 2) % 3; sfx('click'); }
    if (consume('pause')) { scene = 'title'; }
    if ((consume('ok') || consume('jump')) && titleT > 0.2) chooseFile(files.sel + 1);
    if (files.del && files.del.t > 0) files.del.t -= dt;
  } else if (scene === 'map') {
    titleT += dt;
    updateMap(dt);
  } else if (scene === 'story') {
    titleT += dt; story.shown += dt * 28;
    if (consume('ok') || consume('jump') || consume('attack')) storyNext();
    if (consume('pause')) storyEnd();
  } else if (scene === 'clear') {
    world.clearT += dt;
    world.shownScore = Math.min(world.score, (world.shownScore || 0) + Math.max(40, world.score * dt * 0.8));
    world.shownCoins = Math.min(world.coins, (world.shownCoins || 0) + dt * 40);
    for (let i = 0; i < 3; i++) if (!world.starPop[i] && world.clearT > 3.8 + i * 0.4) { world.starPop[i] = true; if (world.stars[i]) { sfx('star', 1 + i * 0.12); burstScreen(VW / 2 - 90 + i * 90, 190); } else sfx('bump', 0.8); }
    if (Math.random() < dt * 2.5) firework(cam.x + rnd(80, VW - 80), cam.y + rnd(60, 200));
    if (world.clearT > 4.4 && (consume('ok') || consume('jump'))) nextFromClear();
  } else if (scene === 'shop') {
    titleT += dt;
    if (consume('pause')) goMap();
  } else if (scene === 'ending') {
    titleT += dt;
    if (titleT > 2 && (consume('ok') || consume('jump'))) goMap();
  }
  // 演出
  for (const q of parts) {
    q.life -= dt; q.vy += (q.g || 0) * dt; q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.drag) { q.vx *= 1 - dt * 1.8; q.vy *= 1 - dt * 1.2; }
    if (q.confetti) q.x += Math.sin(q.life * 6 + q.rot) * 40 * dt;
    if (q.vr) q.rot += q.vr * dt;
  }
  parts = parts.filter(q => q.life > 0);
  if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }
  cam.shake = Math.max(0, cam.shake - dt);
  for (const k in pressed) pressed[k] = false;
}
// ヒットストップ: 当たった瞬間に ほんの少し 時間を止めて 手ごたえを出す
let hitStopT = 0;
function hitStop(t) { hitStopT = Math.max(hitStopT, t); }
function goSelect() { goMap(); }
function resume() { scene = 'play'; sfx('pause'); if (bgmEl && save.sound && !P.dead && !world.clear) bgmEl.play().catch(() => {}); }
const PAUSE_ITEMS = [
  { label: 'つづける', fn: () => resume() },
  { label: 'さいしょから', fn: () => startLevel(world.idx) },
  { label: () => save.sound ? 'おと: オン' : 'おと: オフ', fn: () => setSound(!save.sound) },
  { label: 'ちずに もどる', fn: () => goMap(world.def.id) },
];
function burstScreen(x, y) {
  // 画面の座標で光る(カメラ分をずらして粒を置く)
  for (let i = 0; i < 18; i++) { const a = rnd(0, Math.PI * 2), sp = rnd(80, 260); parts.push({ x: x + cam.x, y: y + cam.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.7, max: 0.7, color: i % 2 ? '#ffe14d' : '#ffffff', size: rnd(3, 5), g: 0, star: true, drag: true }); }
}
function nextFromClear() {
  sfx('select');
  const id = world.def.id;
  const at = whereIs(id);
  // つぎの面: 同じワールドの つぎ。さいごなら つぎのワールドの はじめ(ほしの みちは つぎの ワールドへ 行かない)
  let nextId = null;
  if (at && typeof at.k === 'number') { const W = WORLDS[at.wi]; nextId = at.k + 1 < W.nodes.length ? W.nodes[at.k + 1].id : (!W.star && WORLDS[at.wi + 1] && !WORLDS[at.wi + 1].star ? WORLDS[at.wi + 1].nodes[0].id : null); }
  const last = at && typeof at.k === 'number' && !nextId && !WORLDS[at.wi].star;
  const after = () => {
    if (last) { playStory('ending', () => { scene = 'ending'; titleT = 0; bgm('bgm_end'); }); return; }
    if (nextId && needsFull(LV_BY_ID[nextId]) && !(clearInfo && clearInfo.secretNew)) { scene = 'shop'; bgm('bgm_title'); shopMsg = { text: 'ワールド' + LEVELS[world.idx].world + ' クリア おめでとう!', sub: 'つづきは 完全版で あそべます', t: 4 }; return; }
    // ひみつのゴールを みつけたら その道へ。ふつうは つぎの マスへ 歩く
    let to = nextId;
    if (clearInfo && clearInfo.secretNew && at) { const W = WORLDS[at.wi], ex = (W.extra || []).find(e => e.cond === 'secret' && e.from === id); if (ex) to = ex.id; }
    if (clearInfo && clearInfo.saved) map.saved = 2.6;
    goMap(id, to);
  };
  playStory('post' + id, after);
}

// ---------- ワールドマップ ----------
// すごろくの 道: 道の マス(nodes)は 左から 右へ。わかれ道の マス(extra)は 親の マスから 上・下・右へ。
// マスの 場所は k(数=道の マス / 'x'+番号=わかれ道)で あらわす。クリアで 道が のびる(ビーズが 1つずつ ならぶ)。
const map = { wi: 0, k: 0, hx: 0, hy: 0, path: [], walk: null, slide: 0, face: 1, reveals: [], rv: null };
const isMain = k => typeof k === 'number';
function mapNode(wi, k) { const W = WORLDS[wi]; return isMain(k) ? W.nodes[k] : (W.extra || [])[+String(k).slice(1)]; }
function mapNodeXY(wi, k) { return mapNode(wi, k); }
function mapNodeId(wi, k) { const n = mapNode(wi, k); return n && n.id; }
function parentKey(wi, ex) {
  const W = WORLDS[wi];
  const k = W.nodes.findIndex(n => n.id === ex.from); if (k >= 0) return k;
  const j = (W.extra || []).findIndex(e => e.id !== undefined && e.id === ex.from); return j >= 0 ? 'x' + j : 0;
}
function extraOpen(ex) {
  if (ex.cond === 'secret') return !!save.secret[ex.from];
  if (ex.cond === 'clear') return isCleared(ex.from);
  if (ex.cond === 'open') return true;
  return false;
}
function nodeOpen(wi, k) {
  const W = WORLDS[wi];
  if (!W) return false;
  if (!isMain(k)) { const ex = mapNode(wi, k); return !!ex && extraOpen(ex); }
  if (W.star) return k === 0 ? !!save.starOpen : isCleared(W.nodes[k - 1].id);
  if (wi === 0 && k === 0) return true;
  if (k > 0) return isCleared(W.nodes[k - 1].id);
  const pw = WORLDS[wi - 1]; return isCleared(pw.nodes[pw.nodes.length - 1].id);
}
function whereIs(id) {
  for (let wi = 0; wi < WORLDS.length; wi++) {
    const W = WORLDS[wi];
    const k = W.nodes.findIndex(n => n.id === id);
    if (k >= 0) return { wi, k };
    const j = (W.extra || []).findIndex(e => e.id !== undefined && e.id === id);
    if (j >= 0) return { wi, k: 'x' + j };
  }
  return null;
}
function isOpenId(id) { const w = whereIs(id); return w ? nodeOpen(w.wi, w.k) : false; }
// その マスから 行ける となりの マス(all=false なら 道が ひらいているものだけ)
function mapLinks(wi, k, all = false) {
  const W = WORLDS[wi], out = [];
  if (isMain(k)) {
    if (k > 0) out.push(k - 1);
    if (k + 1 < W.nodes.length && (all || nodeOpen(wi, k + 1))) out.push(k + 1);
  } else out.push(parentKey(wi, mapNode(wi, k)));
  (W.extra || []).forEach((ex, j) => { if (String(parentKey(wi, ex)) === String(k) && (all || extraOpen(ex))) out.push('x' + j); });
  return out;
}
// 道の 一覧(親 → 子)。子の マスが ひらいたら その道も ひらく
function mapEdges(wi) {
  const W = WORLDS[wi], out = [];
  for (let k = 0; k + 1 < W.nodes.length; k++) out.push({ a: k, b: k + 1, key: wi + ':' + (k + 1), main: true });
  (W.extra || []).forEach((ex, j) => out.push({ a: parentKey(wi, ex), b: 'x' + j, key: wi + ':x' + j, ex }));
  return out;
}
const edgeOpen = (wi, e) => nodeOpen(wi, e.b);
function bfsPath(wi, from, to) {
  const prev = new Map([[String(from), null]]), q = [from];
  while (q.length) {
    const c = q.shift();
    if (String(c) === String(to)) break;
    for (const nb of mapLinks(wi, c)) if (!prev.has(String(nb))) { prev.set(String(nb), c); q.push(nb); }
  }
  if (!prev.has(String(to))) return null;
  const out = []; let c = to;
  while (String(c) !== String(from)) { out.unshift(c); c = prev.get(String(c)); }
  return out;
}
function secretFromK(wi) { const W = WORLDS[wi]; const ex = (W.extra || []).find(e => e.cond === 'secret'); return ex ? W.nodes.findIndex(n => n.id === ex.from) : 0; }
// 新しく ひらいた 道を さがして のびる 演出に ならべる(前の版の 保存は いま ひらいている 道を 見たことに する)
function queueReveals(wi) {
  if (!save.roads || typeof save.roads !== 'object') {
    save.roads = {};
    for (let w2 = 0; w2 < WORLDS.length; w2++) for (const e of mapEdges(w2)) if (edgeOpen(w2, e)) save.roads[e.key] = 1;
    writeSave();
  }
  map.reveals = mapEdges(wi).filter(e => edgeOpen(wi, e) && !save.roads[e.key]);
  map.rv = null;
}
function goMap(fromId, walkTo) {
  scene = 'map'; bgm('bgm_title'); titleT = 0; toast = null;
  const at = whereIs(fromId || save.lastId || 1) || { wi: 0, k: 0 };
  map.wi = at.wi; map.k = at.k; map.walk = null; map.path = [];
  const n = mapNode(map.wi, map.k); map.hx = n.x; map.hy = n.y;
  queueReveals(map.wi);
  if (walkTo !== undefined && walkTo !== null && isOpenId(walkTo)) {
    const t2 = whereIs(walkTo);
    if (t2 && t2.wi === map.wi) map.path = bfsPath(map.wi, map.k, t2.k) || [];
    else if (t2) map.path = [{ wi: t2.wi }];
  }
  // はじめて 来た ワールドなら ワールドの 札を 出す
  showWorldCard();
}
function showWorldCard() { if (!save.seen['card' + map.wi]) { map.card = 2.6; save.seen['card' + map.wi] = true; writeSave(); sfx('select'); } }
const DIRV = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };
function mapStep(dir) {
  const W = WORLDS[map.wi], a = mapNode(map.wi, map.k), v = DIRV[dir];
  let best = null, bs = 0.35;
  for (const nb of mapLinks(map.wi, map.k, true)) {
    const b = mapNode(map.wi, nb), dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, sc = (dx * v[0] + dy * v[1]) / d;
    if (sc > bs) { bs = sc; best = nb; }
  }
  if (best !== null) {
    const back = isMain(best) && isMain(map.k) && best < map.k;
    if (back || nodeOpen(map.wi, best)) map.path = [best]; else bumpMap();
    return;
  }
  // ワールドの はしから となりの ワールドへ(ほしの みちは ほしの あなから だけ)
  if (W.star) { bumpMap(); return; }
  if (dir === 'right' && isMain(map.k) && map.k === W.nodes.length - 1) {
    if (WORLDS[map.wi + 1] && !WORLDS[map.wi + 1].star && nodeOpen(map.wi + 1, 0)) map.path = [{ wi: map.wi + 1 }]; else bumpMap();
  } else if (dir === 'left' && map.k === 0 && map.wi > 0) map.path = [{ wi: map.wi - 1, last: true }];
  else bumpMap();
}
function bumpMap() { sfx('bump', 0.9); map.nope = 0.3; }
function updateMap(dt) {
  if (map.nope > 0) map.nope -= dt;
  if (map.flash > 0) map.flash -= dt;
  if (map.slide > 0) map.slide = Math.max(0, map.slide - dt * 3);
  if (map.card > 0) { map.card -= dt; if (map.card < 2.0 && (consume('ok') || consume('jump'))) map.card = Math.min(map.card, 0.3); return; }
  if (map.saved > 0) map.saved -= dt;
  // 道が のびる 演出(ビーズが 1つずつ ならぶ)
  if (map.reveals.length || map.rv) {
    if (!map.rv) { const e = map.reveals.shift(); const A = mapNode(map.wi, e.a), B = mapNode(map.wi, e.b); map.rv = { e, k: 0, len: Math.hypot(B.x - A.x, B.y - A.y), beads: 0 }; }
    const rv = map.rv;
    rv.k = Math.min(1, rv.k + dt * 230 / Math.max(60, rv.len));
    const nb = Math.floor(rv.k * rv.len / 22);
    if (nb > rv.beads) { rv.beads = nb; sfx('click', 1.2 + Math.min(0.8, nb * 0.05)); }
    if (consume('ok') || consume('jump')) rv.k = 1;
    if (rv.k >= 1) {
      save.roads[rv.e.key] = 1; writeSave(); map.rv = null;
      const B = mapNode(map.wi, rv.e.b); sfx(rv.e.ex && rv.e.ex.cond !== 'clear' ? 'star' : 'select'); map.pop = { x: B.x, y: B.y, t: 0.7 };
    }
    return;
  }
  if (map.pop) { map.pop.t -= dt; if (map.pop.t <= 0) map.pop = null; }
  if (map.walk) {
    const w = map.walk; w.t += dt / w.dur;
    const k = Math.min(1, w.t);
    map.hx = lerp(w.x0, w.x1, k); map.hy = lerp(w.y0, w.y1, k);
    if (w.t >= 1) { map.k = w.k; map.walk = null; sfx('click', 1.3); }
    return;
  }
  if (map.path.length) {
    const nx = map.path.shift();
    if (typeof nx === 'object' && nx !== null) {
      // となりの ワールドへ(画面を すべらせる)
      map.wi = nx.wi; map.k = nx.k !== undefined ? nx.k : nx.last ? WORLDS[nx.wi].nodes.length - 1 : 0; map.slide = 1;
      const n = mapNode(map.wi, map.k); map.hx = n.x; map.hy = n.y; sfx('select');
      queueReveals(map.wi); showWorldCard();
      return;
    }
    const a = mapNode(map.wi, map.k), b = mapNode(map.wi, nx);
    map.walk = { x0: a.x, y0: a.y, x1: b.x, y1: b.y, t: 0, dur: Math.max(0.25, Math.hypot(b.x - a.x, b.y - a.y) / 420), k: nx };
    if (b.x !== a.x) map.face = b.x > a.x ? 1 : -1;
    return;
  }
  if (consume('right')) mapStep('right');
  else if (consume('left')) mapStep('left');
  else if (consume('up')) mapStep('up');
  else if (consume('down')) mapStep('down');
  else if (consume('ok') || consume('jump')) enterNode();
  else if (consume('pause')) { scene = 'title'; bgm('bgm_title'); }
}
// ほしの あな: ほしの みちへ とぶ / かえりの あな: きた ワールドへ もどる
function warpTo(wi, k) {
  sfx('powerup', 1.4); sfx('door', 1.6); map.flash = 0.5;
  map.path = [{ wi, k }];
}
function enterNode() {
  if (map.walk || map.path.length || map.rv || map.reveals.length) return;
  const nd = mapNode(map.wi, map.k);
  if (nd.warp) {
    const sw = WORLDS.findIndex(W => W.star);
    if (needsFull(LV_BY_ID[WORLDS[sw].nodes[0].id])) { scene = 'shop'; sfx('select'); return; }
    save.starOpen = true; save.lastWorld = map.wi; writeSave();
    warpTo(sw, 0); return;
  }
  if (nd.back) {
    const wi = save.lastWorld || 0, j = (WORLDS[wi].extra || []).findIndex(e => e.warp);
    warpTo(wi, j >= 0 ? 'x' + j : 0); return;
  }
  const id = nd.id, i = LV_BY_ID[id];
  if (i === undefined) return;
  if (needsFull(i) && isOpenId(id)) { scene = 'shop'; sfx('select'); return; }
  if (!canPlay(i)) { bumpMap(); return; }
  sfx('select'); save.lastId = id; writeSave();
  const d = LEVELS[i];
  const first = map.k === 0 && d.world > 1 && d.world <= 8 ? 'w' + d.world : null;
  playStory(first, () => playStory('pre' + id, () => startLevel(i)));
}
function mapTap(wi, k) {
  if (map.walk || map.path.length || wi !== map.wi || map.rv || map.reveals.length) return;
  if (String(k) === String(map.k)) { enterNode(); return; }
  if (!nodeOpen(wi, k)) { bumpMap(); return; }
  const p = bfsPath(wi, map.k, k);
  if (p) map.path = p; else bumpMap();
}
function walkSeq(a, b) { const out = []; if (a < b) for (let k = a + 1; k <= b; k++) out.push(k); else for (let k = a - 1; k >= b; k--) out.push(k); return out; }
function startGame() {
  sfx('select');
  playStory('intro', () => goMap());
}

// ---------- お話(幕間) ----------
const story = { key: null, i: 0, shown: 0, then: null };
function playStory(key, then) {
  const st = key && STORY[key];
  if (!st || save.seen[key]) { if (then) then(); return; }
  story.key = key; story.i = 0; story.shown = 0; story.then = then;
  scene = 'story'; titleT = 0; toast = null;
  sfx('select');
}
function storyNext() {
  const st = STORY[story.key]; const line = st.lines[story.i];
  if (story.shown < line[1].length) { story.shown = line[1].length; return; }
  story.i++; story.shown = 0; sfx('click', 1.2);
  if (story.i >= st.lines.length) storyEnd();
}
function storyEnd() {
  if (!story.key) return;
  save.seen[story.key] = true; writeSave();
  const f = story.then; story.then = null; story.key = null;
  if (f) f(); else goMap();
}


// ---------- 描画 ----------
function font(px, w = 800) { return `${w} ${px}px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Yu Gothic", sans-serif`; }
function titleFont(px) { return `${px}px "Dela Gothic One", "M PLUS Rounded 1c", sans-serif`; }
function outlined(text, x, y, fill, stroke = '#2a1a3a', lw = 6, f = null, align = 'center') {
  if (f) ctx.font = f;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function woodPlate(x, y, w, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#b8743a'); g.addColorStop(0.5, '#9a5a28'); g.addColorStop(1, '#7a421a');
  rr(x, y, w, h, 10); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#4a2410'; ctx.stroke();
  rr(x + 4, y + 4, w - 8, h - 8, 7); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,220,160,.35)'; ctx.stroke();
}
function button(x, y, w, h, label, fn, opts = {}) {
  uiButtons.push({ x, y, w, h, fn });
  const sel = opts.sel;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  const c1 = opts.c1 || (sel ? '#ffd84a' : '#ffffff'), c2 = opts.c2 || (sel ? '#ff9f1a' : '#d9e6ff');
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.save();
  if (sel) { ctx.shadowColor = 'rgba(255,200,40,.7)'; ctx.shadowBlur = 18; }
  rr(x, y + 5, w, h, h / 2); ctx.fillStyle = 'rgba(30,20,60,.35)'; ctx.fill();
  rr(x, y, w, h, h / 2); ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  ctx.lineWidth = 4; ctx.strokeStyle = '#2a1a3a'; rr(x, y, w, h, h / 2); ctx.stroke();
  ctx.fillStyle = '#2a1a3a'; ctx.font = font(opts.size || 26); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
}
function drawImg(name, x, y, w, h, flip = false, alpha = 1) {
  const im = ART[name] || IMG[name];
  if (!im || !im.complete || !im.naturalWidth) return;
  ctx.save();
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  if (flip) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(im, 0, 0, w, h); }
  else ctx.drawImage(im, x, y, w, h);
  ctx.restore();
}
// 高さを決めて、縦横比を保って足元に置く
function drawFit(name, cx, bottom, h, flip = false, alpha = 1) {
  const im = ART[name] || IMG[name];
  if (!im || !im.naturalWidth) return 0;
  const w = im.naturalWidth / im.naturalHeight * h;
  drawImg(name, cx - w / 2, bottom - h, w, h, flip, alpha);
  return w;
}

const THEMES = {
  grass: { sky: ['#56c3ff', '#bfeeff'], far: '#8fc7e8', near: '#7fcf6a', near2: '#5fb64e' },
  sky: { sky: ['#6a8bff', '#ffd1e8'], far: '#c7b8ff', near: '#ffffff', near2: '#efe6ff' },
  cave: { sky: ['#251b45', '#0f0b20'], far: '#2f2752', near: '#3a3160', near2: '#2a2348' },
  lava: { sky: ['#4a1010', '#160404'], far: '#5a1d14', near: '#3a0f0a', near2: '#2a0a06' },
  ice: { sky: ['#9fd8ff', '#eef8ff'], far: '#c9e6ff', near: '#ffffff', near2: '#e2f2ff' },
  ruins: { sky: ['#3fb7a6', '#cff3dc'], far: '#7cc7a8', near: '#4f9e74', near2: '#3e8a62' },
  night: { sky: ['#14183f', '#4b3a7a'], far: '#2a2d63', near: '#3a3a78', near2: '#2b2b5e' },
  castle: { sky: ['#2a1238', '#0c0614'], far: '#3a1f4d', near: '#2c1840', near2: '#1f1030' },
  sand: { sky: ['#ffb35a', '#ffe9b8'], far: '#eab06a', near: '#dca055', near2: '#c98a40' },
  factory: { sky: ['#2b3346', '#11151f'], far: '#323b52', near: '#262d40', near2: '#1c2232' },
  // ワールド4
  storm: { sky: ['#2b3550', '#7a8aa6'], far: '#4a5876', near: '#3d6b4c', near2: '#2f5a3e', rain: true },
  mansion: { sky: ['#3a2440', '#1a1020'], far: '#4a2c3c', near: '#2c1a26', near2: '#20121c' },
  crystal: { sky: ['#1a2050', '#0a0c24'], far: '#26306a', near: '#2a3474', near2: '#1e2658', base: 'cave' },
  stormcastle: { sky: ['#1e1a38', '#08060f'], far: '#2e2448', near: '#241a3a', near2: '#1a122c', base: 'castle', rain: true },
  // ワールド5
  dusk: { sky: ['#5a3a8a', '#ff9a5a'], far: '#b0607a', near: '#8a4a5a', near2: '#6a3a4a', base: 'sand' },
  ghost: { sky: ['#0e1a24', '#2a4a4a'], far: '#1e3a3a', near: '#183030', near2: '#102424', base: 'night', fog: true },
  fort: { sky: ['#4a2a5a', '#d0704a'], far: '#5a3040', near: '#3a2030', near2: '#2a1622', base: 'castle' },
  ghostmansion: { sky: ['#1a1428', '#08060f'], far: '#2a1e34', near: '#1a1222', near2: '#120c18', base: 'mansion', fog: true },
  // ワールド6〜8
  jungle: { sky: ['#3aa86a', '#c8f0a0'], far: '#3f8f5a', near: '#2f7a40', near2: '#24622f', base: 'grass', vines: true },
  falls: { sky: ['#4ab8d8', '#d8f6e0'], far: '#4a9a8a', near: '#2f8050', near2: '#246a3e', base: 'grass', vines: true },
  moon: { sky: ['#0e0c2a', '#3a2a6a'], far: '#2a2458', near: '#3a3470', near2: '#2a2458', base: 'night', planet: true },
  space: { sky: ['#06061a', '#26164a'], far: '#1e1844', near: '#2c2460', near2: '#1e1844', base: 'night', planet: true },
  kage: { sky: ['#1a0e2a', '#3a1a3a'], far: '#2a1438', near: '#1e0e2a', near2: '#14081e', base: 'castle', fog: true },
  kagecastle: { sky: ['#0a0614', '#2a0e2a'], far: '#22102e', near: '#180a22', near2: '#100616', base: 'castle', fog: true, rain: true },
  // 第4段階: みずの なか
  underwater: { sky: ['#2a90d8', '#0a2458'], far: '#1a5a8a', near: '#164a78', near2: '#103a62', base: 'underwater' },
};
// ChatGPT で作った背景(game/assets/chatgpt/bg_<テーマ>.png)があれば それを使う。なければ 下の 手続きの背景
function drawBackground(theme, cx, t) {
  const art = ART['bg_' + theme];
  if (art) {
    const w = art.naturalWidth / art.naturalHeight * VH, off = -((cx * 0.3) % w);
    for (let x = off; x < VW; x += w) ctx.drawImage(art, x, 0, w, VH);
  } else drawBackground0(theme, cx, t);
  const th = THEMES[theme];
  if (th.fog) {
    // きり
    for (let i = 0; i < 6; i++) { const x = ((i * 230 - cx * 0.5 + t * 14) % (VW + 300) + VW + 300) % (VW + 300) - 150; ctx.fillStyle = 'rgba(200,230,230,.08)'; ctx.beginPath(); ctx.ellipse(x, 380 + (i % 3) * 40, 200, 40, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  if (th.vines) {
    // ジャングル: 上から たれる つる(素材の つるの絵)
    for (let i = -1; i < 7; i++) { const x = i * 170 - (cx * 0.5) % 170 + 40; const im = IMG.vine; if (im.naturalWidth) { ctx.save(); ctx.globalAlpha = 0.55; ctx.drawImage(im, im.naturalWidth * 0.4, 0, im.naturalWidth * 0.24, im.naturalHeight, x, -10, 34, 120 + (i % 3) * 40); ctx.restore(); } }
  }
  if (th.planet) {
    // 大きな わくせいと 地球
    ctx.save(); ctx.globalAlpha = 0.9; const px = 760 - cx * 0.03, g = ctx.createRadialGradient(px - 30, 110, 10, px, 130, 90); g.addColorStop(0, '#ffd8a8'); g.addColorStop(1, '#c0608a'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, 130, 80, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,200,.6)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(px, 130, 130, 26, -0.3, 0, 7); ctx.stroke(); ctx.restore();
  }
  if (th.rain) {
    // 雨と ときどき いなずま
    ctx.save(); ctx.strokeStyle = 'rgba(190,210,255,.35)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < 70; i++) { const x = ((i * 137 + t * 260 - cx * 0.6) % (VW + 60) + VW + 60) % (VW + 60) - 30, y = (i * 61 + t * 900) % (VH + 40) - 20; ctx.moveTo(x, y); ctx.lineTo(x - 7, y + 20); }
    ctx.stroke(); ctx.restore();
    const ph = t % 9;
    if (ph < 0.09 || (ph > 0.18 && ph < 0.24)) { ctx.fillStyle = 'rgba(230,240,255,.35)'; ctx.fillRect(0, 0, VW, VH); }
  }
}
function drawBackground0(theme, cx, t) {
  const th = THEMES[theme];
  theme = th.base || theme;
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  if (theme === 'lava') {
    for (let i = -1; i < 5; i++) {
      const x = i * 300 - (cx * 0.15) % 300;
      ctx.fillStyle = th.far; ctx.beginPath(); ctx.moveTo(x - 160, VH); ctx.lineTo(x, 230); ctx.lineTo(x + 40, 230); ctx.lineTo(x + 200, VH); ctx.fill();
      ctx.fillStyle = 'rgba(255,110,30,.5)'; ctx.fillRect(x + 4, 230, 32, 8);
    }
    const lg = ctx.createLinearGradient(0, VH - 160, 0, VH); lg.addColorStop(0, 'rgba(255,90,20,0)'); lg.addColorStop(1, 'rgba(255,90,20,.45)');
    ctx.fillStyle = lg; ctx.fillRect(0, VH - 160, VW, 160);
    for (let i = 0; i < 26; i++) { const x = (i * 97 + t * 30 * (1 + i % 3)) % VW, y = VH - ((t * 40 * (1 + i % 4) + i * 53) % VH); ctx.fillStyle = i % 2 ? 'rgba(255,170,60,.7)' : 'rgba(255,90,30,.6)'; ctx.fillRect(x, y, 3, 3); }
    return;
  }
  if (theme === 'underwater') {
    // 水の 中: 上から さしこむ 光・のぼる あわ・海そうの かげ
    for (let i = 0; i < 6; i++) { const x = ((i * 190 - cx * 0.1) % (VW + 200) + VW + 200) % (VW + 200) - 100; ctx.save(); ctx.globalAlpha = 0.08 + Math.sin(t * 0.8 + i) * 0.04; ctx.fillStyle = '#e8fbff'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 70, 0); ctx.lineTo(x + 170, VH); ctx.lineTo(x + 60, VH); ctx.closePath(); ctx.fill(); ctx.restore(); }
    for (let i = -1; i < 9; i++) { const x = i * 130 - (cx * 0.3) % 130; ctx.fillStyle = 'rgba(10,40,60,.45)'; ctx.beginPath(); ctx.moveTo(x, VH); for (let k = 0; k <= 8; k++) ctx.lineTo(x + Math.sin(t * 1.5 + k * 0.7 + i) * 8 + (k % 2 ? 10 : 0), VH - k * 22 - (i % 3) * 30); ctx.lineTo(x + 18, VH); ctx.fill(); }
    for (let i = 0; i < 26; i++) { const x = (i * 97 + Math.sin(t + i) * 10 - cx * 0.2) % VW, y = VH - ((t * 40 * (1 + i % 3) + i * 71) % VH); ctx.strokeStyle = 'rgba(220,250,255,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc((x + VW) % VW, y, 2 + i % 3, 0, 7); ctx.stroke(); }
    return;
  }
  if (theme === 'factory') {
    for (let i = -1; i < 7; i++) { const x = i * 170 - (cx * 0.2) % 170; ctx.fillStyle = '#3a445e'; ctx.fillRect(x + 40, 0, 26, VH); ctx.fillStyle = '#4a5674'; ctx.fillRect(x + 44, 0, 6, VH); }
    for (let i = -1; i < 6; i++) { const x = i * 240 - (cx * 0.35) % 240 + 80, y = 180 + (i % 2) * 120; ctx.save(); ctx.translate(x, y); ctx.rotate(t * (i % 2 ? 0.6 : -0.6)); ctx.fillStyle = 'rgba(120,135,170,.35)'; for (let k = 0; k < 8; k++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-10, -62, 20, 24); } ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(20,24,36,.8)'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    for (let i = 0; i < 8; i++) { ctx.fillStyle = `rgba(255,200,80,${0.25 + Math.sin(t * 3 + i) * 0.15})`; ctx.fillRect((i * 137 - cx * 0.2) % VW, 60 + (i % 3) * 30, 10, 4); }
    return;
  }
  if (theme === 'mansion') {
    // おやしきの かべ: しまもようの かべ紙・窓・ランプ
    for (let i = -1; i < 12; i++) { const x = i * 90 - (cx * 0.2) % 90; ctx.fillStyle = i % 2 ? 'rgba(255,200,220,.05)' : 'rgba(0,0,0,.08)'; ctx.fillRect(x, 0, 45, VH); }
    for (let i = -1; i < 5; i++) {
      const x = i * 260 - (cx * 0.3) % 260 + 90;
      ctx.fillStyle = '#1b2a55'; rr(x, 90, 90, 150, 44); ctx.fill();
      ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(x + 58, 140, 16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6e4426'; ctx.lineWidth = 8; rr(x, 90, 90, 150, 44); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + 45, 92); ctx.lineTo(x + 45, 238); ctx.moveTo(x, 170); ctx.lineTo(x + 90, 170); ctx.stroke();
      ctx.save(); ctx.globalAlpha = 0.85; drawFit('lamp', x + 175, 360, 110); ctx.restore();
    }
    const rg = ctx.createRadialGradient(VW / 2, VH * 0.4, 60, VW / 2, VH * 0.4, VW * 0.7);
    rg.addColorStop(0, 'rgba(255,190,120,.08)'); rg.addColorStop(1, 'rgba(0,0,0,.45)'); ctx.fillStyle = rg; ctx.fillRect(0, 0, VW, VH);
    return;
  }
  if (theme === 'castle') {
    for (let i = -1; i < 8; i++) { const x = i * 180 - (cx * 0.25) % 180; ctx.globalAlpha = 0.3; drawFit('pillar', x + 60, VH - 40, 300); ctx.globalAlpha = 1; }
    for (let i = 0; i < 4; i++) { const x = i * 260 - (cx * 0.3) % 260 + 100; ctx.fillStyle = 'rgba(255,220,120,.18)'; rr(x, 120, 50, 90, 25); ctx.fill(); }
    const rg = ctx.createRadialGradient(VW / 2, VH * 0.4, 50, VW / 2, VH * 0.4, VW * 0.7);
    rg.addColorStop(0, 'rgba(160,60,200,.12)'); rg.addColorStop(1, 'rgba(0,0,0,.4)'); ctx.fillStyle = rg; ctx.fillRect(0, 0, VW, VH);
    return;
  }
  if (theme === 'night') {
    for (let i = 0; i < (th.planet ? 120 : 60); i++) { const x = (i * 157) % VW, y = (i * 89) % 300; ctx.globalAlpha = 0.4 + Math.sin(t * 2 + i) * 0.3; ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 2, 2); }
    ctx.globalAlpha = 1; ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(760 - cx * 0.02, 100, 40, 0, Math.PI * 2); ctx.fill();
  }
  if (theme === 'cave') {
    // 遠くの柱と光る結晶
    for (let i = -1; i < 8; i++) {
      const x = i * 180 - (cx * 0.25) % 180;
      ctx.globalAlpha = 0.35; drawFit('pillar', x + 60, VH - 60, 260); ctx.globalAlpha = 1;
    }
    for (let i = -1; i < 7; i++) {
      const x = i * 210 - (cx * 0.4) % 210 + 40;
      ctx.save(); ctx.globalAlpha = 0.55 + Math.sin(t * 2 + i) * 0.15; drawFit('crystal', x, VH - 70, 60); ctx.restore();
    }
    const rg = ctx.createRadialGradient(VW / 2, VH * 0.4, 50, VW / 2, VH * 0.4, VW * 0.7);
    rg.addColorStop(0, 'rgba(120,90,200,.12)'); rg.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, VW, VH);
    return;
  }
  // 太陽
  if (theme === 'grass') {
    ctx.fillStyle = 'rgba(255,250,200,.55)'; ctx.beginPath(); ctx.arc(780 - cx * 0.02, 90, 50, 0, Math.PI * 2); ctx.fill();
  }
  // 遠い山
  ctx.fillStyle = th.far;
  ctx.beginPath(); ctx.moveTo(0, VH);
  for (let x = 0; x <= VW + 40; x += 40) {
    const wx = x + cx * 0.15;
    ctx.lineTo(x, 300 - Math.abs(Math.sin(wx * 0.004)) * 120 - Math.sin(wx * 0.011) * 25);
  }
  ctx.lineTo(VW, VH); ctx.fill();
  // 雲
  for (let i = 0; i < 6; i++) {
    const span = VW + 300;
    const x = ((i * 260 - cx * 0.3 - t * 12) % span + span) % span - 150;
    drawFit('cloud', x, 120 + (i % 3) * 50 + (theme === 'sky' ? 80 : 0), theme === 'sky' ? 70 : 50, false, theme === 'night' ? 0.35 : theme === 'sky' ? 0.9 : 0.8);
  }
  // 近い丘
  ctx.fillStyle = th.near;
  ctx.beginPath(); ctx.moveTo(0, VH);
  for (let x = 0; x <= VW + 30; x += 30) {
    const wx = x + cx * 0.4;
    ctx.lineTo(x, 400 - Math.abs(Math.sin(wx * 0.006)) * 70);
  }
  ctx.lineTo(VW, VH); ctx.fill();
  if (theme === 'sand') {
    ctx.fillStyle = 'rgba(255,240,200,.6)'; ctx.beginPath(); ctx.arc(780 - cx * 0.02, 110, 60, 0, Math.PI * 2); ctx.fill();
    for (let i = -1; i < 4; i++) { const x = i * 380 - (cx * 0.25) % 380 + 120; ctx.fillStyle = '#d99550'; ctx.beginPath(); ctx.moveTo(x - 90, 400); ctx.lineTo(x, 300); ctx.lineTo(x + 90, 400); ctx.fill(); ctx.fillStyle = '#c4823f'; ctx.beginPath(); ctx.moveTo(x, 300); ctx.lineTo(x + 90, 400); ctx.lineTo(x + 20, 400); ctx.fill(); }
  }
  if (theme === 'ice') {
    for (let i = 0; i < 40; i++) { const x = (i * 131 + t * 20) % VW, y = (i * 71 + t * (30 + i % 5 * 10)) % VH; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(x, y, 2 + i % 3, 0, Math.PI * 2); ctx.fill(); }
  }
  if (theme === 'sky' || theme === 'night') {
    for (let i = 0; i < 5; i++) {
      const span = VW + 400;
      const x = ((i * 330 - cx * 0.55) % span + span) % span - 200;
      drawFit('cloud', x, 470 + (i % 2) * 30, 110, false, theme === 'night' ? 0.5 : 0.95);
    }
  }
}

function drawTiles() {
  const th = world.def.theme;
  const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1), x1 = Math.min(level.W - 1, Math.floor((cam.x + VW) / TILE) + 1);
  // 板と雲は横につながったまとまりで描く
  for (let ty = 0; ty < ROWS; ty++) {
    let tx = x0;
    while (tx <= x1) {
      const c = level.tiles[ty][tx];
      if (c === '~' || c === '=') {
        let n = 0; while (tx + n <= x1 + 6 && level.tiles[ty][tx + n] === c) n++;
        const X = tx * TILE, Y = ty * TILE;
        if (c === '~') drawImg('cloud', X - 8, Y - 10, n * TILE + 16, 44);
        else {
          for (let i = 0; i < n; i++) ctx.drawImage(TB.plank, X + i * TILE, Y, TILE, TILE);
          ctx.fillStyle = 'rgba(60,30,10,.25)'; ctx.fillRect(X, Y + 18, n * TILE, 3);
        }
        tx += n; continue;
      }
      tx++;
    }
  }
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const c = level.tiles[ty][tx];
      if (c === ' ' || c === '~' || c === '=') continue;
      let X = tx * TILE, Y = ty * TILE;
      const b = world.bumps.get(tx + ',' + ty);
      if (b) Y -= Math.sin((b / 0.18) * Math.PI) * 10;
      let img = null;
      switch (c) {
        case '#': {
          const fill = tileAt(tx, ty - 1) === '#';
          if (th === 'cave') img = fill ? TB.caveFill : TB.caveTop;
          else if (th === 'lava') img = fill ? TB.lavaFill : TB.lavaTop;
          else if (th === 'ice') img = fill ? TB.snowFill : TB.snowTop;
          else if (th === 'castle') img = fill ? TB.castleFill : TB.castleTop;
          else if (th === 'sand') img = fill ? TB.sandFill : TB.sandTop;
          else if (th === 'factory') img = fill ? TB.factoryFill : TB.factoryTop;
          else if (th === 'storm') img = fill ? TB.stormFill : TB.stormTop;
          else if (th === 'mansion') img = fill ? TB.mansionFill : TB.mansionTop;
          else if (th === 'crystal') img = fill ? TB.crystalFill : TB.crystalTop;
          else if (th === 'stormcastle' || th === 'fort') img = fill ? TB.castleFill : TB.castleTop;
          else if (th === 'dusk') img = fill ? TB.sandFill : TB.sandTop;
          else if (th === 'ghost') img = fill ? TB.stormFill : TB.stormTop;
          else if (th === 'ghostmansion') img = fill ? TB.mansionFill : TB.mansionTop;
          else if (th === 'jungle' || th === 'falls') img = fill ? TB.jungleFill : TB.jungleTop;
          else if (th === 'moon' || th === 'space') img = fill ? TB.moonFill : TB.moonTop;
          else if (th === 'kage' || th === 'kagecastle') img = fill ? TB.kageFill : TB.kageTop;
          else if (th === 'underwater') img = fill ? TB.sandFill : TB.sandTop;
          else img = fill ? TB.dirt : TB.groundTop;
          break;
        }
        case 'M': img = TB.metal; break;
        case 'K': img = TB.thorn; break;
        case 'D': img = TB.sand; break;
        case 'L': img = TB.ladder; break;
        case 'Z': img = TB.vine_tile; break;
        case 'N': img = TB.seed_block; Y += Math.sin(performance.now() / 300 + tx) * 1.2; break;
        case '7': { const nb = world.bumps.get('n' + tx + ',' + ty); ctx.save(); ctx.translate(X + 24, Y + TILE); if (nb) ctx.scale(1 + nb * 1.2, 1 - nb * 2); ctx.drawImage(TB.note_block, -24, -TILE, TILE, TILE); ctx.restore(); continue; }
        case '}': case '{': {
          ctx.drawImage(TB.conveyor, X, Y, TILE, TILE);
          ctx.save(); ctx.globalAlpha = 0.8; ctx.fillStyle = '#ffd84a';
          const off = ((performance.now() / 8) % 24) * (c === '}' ? 1 : -1);
          for (let k = -1; k < 3; k++) { const ax = X + ((k * 24 + off) % TILE + TILE) % TILE; ctx.beginPath(); ctx.moveTo(ax, Y + 18); ctx.lineTo(ax + (c === '}' ? 8 : -8), Y + 24); ctx.lineTo(ax, Y + 30); ctx.fill(); }
          ctx.restore(); continue;
        }
        case 'V': {
          const im = IMG.lava, top = tileAt(tx, ty - 1) !== 'V';
          const sh = (performance.now() / 40 + tx * 13) % (im.naturalWidth * 0.5);
          ctx.drawImage(im, sh, top ? 0 : im.naturalHeight * 0.4, im.naturalWidth * 0.5, im.naturalHeight * (top ? 1 : 0.6), X, Y + (top ? 6 : 0), TILE, TILE - (top ? 6 : 0));
          if (top) { ctx.fillStyle = `rgba(255,200,80,${0.25 + Math.sin(performance.now() / 300 + tx) * 0.15})`; ctx.fillRect(X, Y + 4, TILE, 6); }
          continue;
        }
        case 'B': img = TB.brick; break;
        case 'e': img = TB.egg_block; Y += Math.sin(performance.now() / 300 + tx) * 1.2; break;
        case 'q': img = TB.cape_block; Y += Math.sin(performance.now() / 300 + tx) * 1.2; break;
        case 'z': img = TB.silver; break;
        case 'j': {
          const sp = world.spinBlk[tx + ',' + ty];
          ctx.save(); ctx.translate(X + 24, Y + 24); if (sp > 0) ctx.scale(1, Math.cos(performance.now() / 45)); ctx.drawImage(TB.turn_block, -24, -24, TILE, TILE); ctx.restore(); continue;
        }
        case '6': case '8': case '9': case '0': {
          const col = PALACE_TILE[c];
          if (save.palace[col]) { img = TB['blk_' + col]; break; }
          if (ART['dot_' + col]) { ctx.drawImage(ART['dot_' + col], X, Y, TILE, TILE); continue; }
          ctx.save(); ctx.globalAlpha = 0.7; ctx.strokeStyle = PALACE_COL[col]; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.strokeRect(X + 4, Y + 4, TILE - 8, TILE - 8); ctx.restore(); continue;
        }
        case '?': case 'H': case 'Q': case 'A': case 'E': case 'R': img = TB.question; Y += Math.sin(performance.now() / 300 + tx) * 1.2; break;
        case 'U': img = TB.used; break;
        case 'X': img = TB.crate; break;
        case 'S': img = th === 'cave' ? TB.stone : TB.stone; break;
        case 'I': img = TB.ice; break;
        case '%': img = world.sw ? TB.swBlue : TB.swRed; break;
        case '1': case '2': {
          const on = (c === '1') !== !!world.sw;
          if (on) { img = c === '1' ? TB.redBlk : TB.blueBlk; if (world.swFlash > 0) { ctx.drawImage(img, X, Y, TILE, TILE); ctx.fillStyle = `rgba(255,255,255,${world.swFlash * 1.6})`; ctx.fillRect(X, Y, TILE, TILE); continue; } break; }
          // 消えているときは 点線のわくだけ
          ctx.save(); ctx.globalAlpha = 0.55; ctx.strokeStyle = c === '1' ? '#ff6b88' : '#6fa8ff'; ctx.lineWidth = 3; ctx.setLineDash([7, 5]);
          ctx.strokeRect(X + 4, Y + 4, TILE - 8, TILE - 8); ctx.restore(); continue;
        }
        case '3': case '4': {
          // じかんで きえる ブロック(素材集の きえる足場の絵)。消える前は ちかちか
          const on = isSolid(tx, ty), left = 2 - (world.time % 2);
          ctx.save();
          if (on) { ctx.globalAlpha = left < 0.5 ? (Math.floor(left * 16) % 2 ? 0.35 : 1) : 1; ctx.filter = c === '4' ? 'hue-rotate(110deg)' : 'none'; drawImg('disappear', X - 2, Y + 2, TILE + 4, TILE - 4); }
          else { ctx.globalAlpha = 0.5; ctx.strokeStyle = c === '3' ? '#8fe0ff' : '#b8ff8f'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.strokeRect(X + 5, Y + 6, TILE - 10, TILE - 12); }
          ctx.restore(); continue;
        }
        case '5': {
          // じかんスイッチの とびら
          const open = world.gateT > 0, k = open ? Math.min(1, (world.gateMax - world.gateT) * 6) : 0;
          if (k >= 1) { ctx.save(); ctx.globalAlpha = 0.35; ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]); ctx.strokeRect(X + 8, Y + 2, TILE - 16, TILE - 4); ctx.restore(); continue; }
          ctx.save(); ctx.translate(0, -k * TILE); ctx.drawImage(TB.metal, X, Y, TILE, TILE); ctx.fillStyle = 'rgba(255,200,40,.35)'; ctx.fillRect(X, Y, TILE, TILE);
          ctx.fillStyle = '#3a2a10'; for (let i = 0; i < 3; i++) ctx.fillRect(X + 8 + i * 13, Y + 4, 5, TILE - 8); ctx.restore(); continue;
        }
        case 'O': {
          const ready = !((world.lightCD || 0) > world.time);
          ctx.drawImage(ready ? TB.question : TB.used, X, Y, TILE, TILE);
          ctx.save(); ctx.globalAlpha = ready ? 0.9 + Math.sin(performance.now() / 150) * 0.1 : 0.4; ctx.shadowColor = '#fff6a8'; ctx.shadowBlur = ready ? 18 : 0; drawFit('lamp', X + 24, Y + 44, 40); ctx.restore(); continue;
        }
        case 'W': continue;
        case '^': img = TB.spikes; break;
      }
      if (img) ctx.drawImage(img, X, Y, TILE, TILE);
    }
  }
}

// 水は主人公より手前に、すけて見えるように描く
function drawWater(t) {
  const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1), x1 = Math.min(level.W - 1, Math.floor((cam.x + VW) / TILE) + 1);
  for (let ty = 0; ty < ROWS; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (level.tiles[ty][tx] !== 'W') continue;
    const X = tx * TILE, Y = ty * TILE, top = tileAt(tx, ty - 1) !== 'W';
    ctx.fillStyle = top ? 'rgba(80,190,255,.42)' : 'rgba(40,140,230,.48)';
    ctx.fillRect(X, Y + (top ? 8 : 0), TILE, TILE - (top ? 8 : 0));
    if (top) {
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      const w = Math.sin(t * 3 + tx * 0.8) * 3;
      ctx.fillRect(X, Y + 8 + w, TILE, 3);
    }
  }
}
function drawDecos(back) {
  for (const d of level.decos) {
    const X = d.x * TILE + 24;
    if (X < cam.x - 200 || X > cam.x + VW + 200) continue;
    const gy = groundYBelow(d.x) * TILE;
    const h = { tree: 150, sign: 70, fence: 56, lamp: 110, rocks: 60, torch: 70, crystal: 64, pillar: 140 }[d.name] || 80;
    if (d.name === 'torch') {
      ctx.save(); const rg = ctx.createRadialGradient(X, gy - h + 16, 4, X, gy - h + 16, 90);
      rg.addColorStop(0, 'rgba(255,190,90,.35)'); rg.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = rg; ctx.fillRect(X - 90, gy - h - 74, 180, 180); ctx.restore();
    }
    drawFit(d.name, X, gy + 4, h);
  }
}

function drawPlayer() {
  const p = P;
  if (p.inCannon) return;
  // はしる メーター(マント): 頭の 上に 小さく
  if (hasPower('cape') && p.runM > 0.05 && !p.fly && !p.dead) { const w = 40, x = p.x + p.w / 2 - w / 2, y = p.y - 16; ctx.save(); ctx.globalAlpha = 0.85; rr(x, y, w, 7, 3); ctx.fillStyle = 'rgba(20,10,40,.6)'; ctx.fill(); rr(x, y, w * p.runM, 7, 3); ctx.fillStyle = p.runM >= 1 ? (Math.floor(performance.now() / 80) % 2 ? '#ffe066' : '#ff8a3a') : '#c78bff'; ctx.fill(); ctx.restore(); }
  if (p.inv > 0 && !p.dead && Math.floor(p.inv * 20) % 2 === 0) return;
  // ほしの マント(せなか)
  if (hasPower('cape') && !p.dead && !p.climb && !(p.fly && ART.hero_fly)) { // とぶ 絵には マントが 入って いる
    const air = !p.onGround, fl = Math.sin(performance.now() / 90) * (air ? 0.25 : 0.08), ang = p.fly ? 1.25 : air ? 0.7 + fl : 0.25 + Math.min(0.5, Math.abs(p.vx) / 900) + fl;
    const bx = p.x + p.w / 2 - p.face * 6, by = p.mount ? p.y + 6 : p.y + 16;
    ctx.save(); ctx.translate(bx, by); ctx.scale(-p.face, 1); ctx.rotate(ang);
    if (ART.cape_back) drawImg('cape_back', -17, -6, 36, 56);
    else { ctx.fillStyle = '#8a4ad8'; ctx.strokeStyle = '#2a1a3a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.quadraticCurveTo(16, 22, 12, 42); ctx.lineTo(-12, 42); ctx.quadraticCurveTo(-16, 22, -8, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(0, 26, 3, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  let name = 'hero_idle';
  if (p.dead) name = 'hero_jump';
  else if (p.attackT > 0) name = 'hero_attack';
  else if (!p.onGround) name = 'hero_jump';
  else if (Math.abs(p.vx) > 30) name = Math.floor(p.anim * 2.2) % 2 ? 'hero_run' : 'hero_idle';
  const im = IMG[name], base = IMG.hero_idle;
  if (!im.naturalWidth) return;
  const H = 74 * (im.naturalHeight / base.naturalHeight);
  const W = im.naturalWidth / im.naturalHeight * H;
  const sx = p.squash, sy = 2 - p.squash;
  const bob = p.onGround && Math.abs(p.vx) > 30 ? Math.abs(Math.sin(p.anim * 7)) * -3 : 0;
  const cx = p.x + p.w / 2, bottom = (p.mount ? p.y + 48 : p.y + p.h + 4) + bob;
  // 攻撃の絵は剣の分だけ右に長いので、体の真ん中をそろえる
  const bodyX = name === 'hero_attack' ? 0.36 : 0.5;
  if (hasPower('wing') && !p.onGround && !p.dead && !p.climb) {
    const flap = p.flapT > 0 ? Math.sin(p.flapT * 40) * 0.5 : Math.sin(performance.now() / 120) * 0.15;
    ctx.save(); ctx.translate(cx - p.face * 10, p.y + 22); ctx.scale(-p.face, 1); ctx.rotate(-0.3 + flap);
    ctx.globalAlpha = 0.95; drawImg('p_wing', -6, -26, 40, 34); ctx.restore();
  }
  if (p.climb) name = 'hero_jump';
  ctx.save();
  ctx.translate(cx, bottom);
  if (p.dead) ctx.rotate(Math.min(p.deadT * 6, Math.PI));
  if (p.climb) ctx.scale(Math.floor(p.anim * 2) % 2 ? -1 : 1, 1);
  // スピンジャンプ: くるくる まわる / マントで とぶ: まえに かたむく
  if (p.spin && !p.dead) { ctx.translate(0, -H / 2); ctx.scale(Math.cos(performance.now() / 32), 1); ctx.translate(0, H / 2); }
  if (p.fly && !p.dead) { ctx.translate(0, -H / 2); ctx.rotate(p.face * clamp(0.35 + p.vy / 900, -0.2, 1.1)); ctx.translate(0, H / 2); }
  if (p.mount) ctx.scale(0.92, 0.92);
  ctx.scale(p.face * sx, sy);
  const spinArt = p.spin && ART.hero_spin ? ART.hero_spin : p.fly && ART.hero_fly ? ART.hero_fly : null;
  if (spinArt) { const W2 = spinArt.naturalWidth / spinArt.naturalHeight * 74; ctx.drawImage(spinArt, -W2 / 2, -74, W2, 74); }
  else ctx.drawImage(im, -W * bodyX, -H, W, H);
  ctx.restore();
  if (p.spin && !p.dead) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; const a0 = performance.now() / 60; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(cx, p.y + p.h / 2, 30, 12, 0, a0 + i * Math.PI, a0 + i * Math.PI + 1.6); ctx.stroke(); } ctx.restore(); }
  if (p.shield) {
    ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(performance.now() / 150) * 0.1;
    ctx.strokeStyle = '#7fd8ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(cx, p.y + p.h / 2, 34, 44, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  if (p.attackT > 0) {
    const k = 1 - p.attackT / 0.22;
    ctx.save(); ctx.globalAlpha = 0.6 * (1 - k);
    ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx + p.face * 10, p.y + 28, 46, p.face > 0 ? -1.2 + k * 0.6 : Math.PI + 1.2 - k * 0.6, p.face > 0 ? 0.9 : Math.PI - 0.9, p.face < 0);
    ctx.stroke(); ctx.restore();
  }
}

// 大きな ほしの かけら の 絵(ChatGPT の big_shard が なければ 星の 絵を むらさきに)
function drawShardIcon(cx, cy, r, t, gray) {
  if (ART.big_shard) { const im = ART.big_shard, h = r * 2.3, w = im.naturalWidth / im.naturalHeight * h; ctx.drawImage(im, cx - w / 2, cy - h / 2, w, h); return; }
  ctx.save(); ctx.filter = gray ? 'grayscale(1) brightness(1.4)' : 'hue-rotate(215deg) saturate(1.7) brightness(1.15)';
  drawImg('star', cx - r, cy - r, r * 2, r * 1.92); ctx.restore();
}
// もこりゅう(ChatGPT の moko_* が なければ スライムの 色替え+角と つばさ)
function drawMount(o, t) {
  const ridden = o.state === 'ridden';
  if (o.state === 'wait' && o.timer < 2 && Math.floor(t * 12) % 2) return;
  const cx = o.x + o.w / 2, bottom = o.y + o.h + 3, face = o.face || 1;
  const run = (ridden ? Math.abs(P.vx) > 30 && P.onGround : Math.abs(o.vx) > 30);
  const bob = run ? Math.abs(Math.sin(t * 16)) * 3 : Math.sin(t * 3) * 1;
  // とべる 間は つばさ
  if (o.flyT > 0) { const fl = o.flap > 0 ? Math.sin(t * 40) * 0.6 : Math.sin(t * 6) * 0.2; for (const sd of [-1, 1]) { ctx.save(); ctx.translate(cx - face * 6 + sd * 10, o.y + 10); ctx.scale(sd * face, 1); ctx.rotate(-0.5 + fl); drawImg(ART.moko_wing ? 'moko_wing' : 'p_wing', -4, -26, 34, 30); ctx.restore(); } }
  const art = o.tongue && ART.moko_eat ? 'moko_eat' : run && ART.moko_run && Math.floor(t * 8) % 2 ? 'moko_run' : ART.moko_idle ? 'moko_idle' : null;
  ctx.save(); ctx.translate(cx, bottom - bob);
  if (art) { drawFit(art, 0, 0, 66, face < 0); }
  else {
    ctx.scale(face, 1);
    ctx.filter = 'hue-rotate(205deg) saturate(1.25) brightness(1.15)'; drawFit('slime', 0, 0, 50, true); ctx.filter = 'none';
    // つの・しっぽ・目
    ctx.fillStyle = '#ffe9a8'; ctx.strokeStyle = '#4a2a10'; ctx.lineWidth = 2;
    for (const hx of [-2, 10]) { ctx.beginPath(); ctx.moveTo(hx - 5, -40); ctx.lineTo(hx, -54); ctx.lineTo(hx + 5, -40); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#ff9a2e'; ctx.beginPath(); ctx.moveTo(-22, -12); ctx.quadraticCurveTo(-36, -18 + Math.sin(t * 8) * 4, -34, -30); ctx.quadraticCurveTo(-28, -20, -20, -20); ctx.fill();
    if (o.fire > 0) { ctx.fillStyle = '#ff6a1f'; ctx.globalAlpha = 0.5 + Math.sin(t * 20) * 0.3; ctx.beginPath(); ctx.arc(22, -18, 5, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  }
  ctx.restore();
  // した
  if (o.tongue && o.tongue.len > 4) {
    const tg = o.tongue, mx = cx + face * 18, my = o.y + 12;
    ctx.save(); ctx.strokeStyle = '#ff6b9a'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(tg.x, tg.y); ctx.stroke();
    ctx.fillStyle = '#ff4a86'; ctx.beginPath(); ctx.arc(tg.x, tg.y, 8, 0, 7); ctx.fill(); ctx.restore();
  }
  if (!ridden && o.state !== 'leave' && Math.random() < 0.04) sparkle(cx, o.y, 1);
}
function drawThing(o, t) {
  const cx = o.x + o.w / 2;
  switch (o.t) {
    case 'shard': {
      const y = o.y + o.h / 2 + Math.sin(t * 2.6 + o.ph) * 5;
      ctx.save(); ctx.shadowColor = 'rgba(210,170,255,.95)'; ctx.shadowBlur = 24; ctx.translate(cx, y); ctx.rotate(Math.sin(t * 1.8 + o.ph) * 0.15);
      drawShardIcon(0, 0, 25, t); ctx.restore();
      if (Math.random() < 0.08) sparkle(cx + rnd(-18, 18), y + rnd(-20, 20), 1);
      break;
    }
    case 'cape': ctx.save(); ctx.shadowColor = '#c78bff'; ctx.shadowBlur = 18; drawItemIcon('p_cape', cx - 20, o.y + Math.sin(t * 4) * 4, 40, 38); ctx.restore(); if (Math.random() < 0.08) sparkle(cx, o.y + 10, 1); break;
    case 'mount': drawMount(o, t); break;
    case 'egg': {
      const wob = o.timer < 0.5 ? Math.sin(t * 50) * 0.15 : 0;
      ctx.save(); ctx.translate(cx, o.y + o.h); ctx.rotate(wob);
      if (ART.moko_egg) drawFit('moko_egg', 0, 0, 44);
      else { ctx.fillStyle = '#fff6f0'; ctx.strokeStyle = '#4a2a3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, -21, 17, 21, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ff8fc0'; for (const [sx, sy] of [[-6, -28], [7, -18], [-3, -10]]) { ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 7); ctx.fill(); } }
      ctx.restore(); break;
    }
    case 'tblock': {
      if (ART.throw_block) drawImg('throw_block', o.x - 2, o.y - 2, o.w + 4, o.h + 4);
      else { ctx.save(); ctx.drawImage(TB.crate, o.x - 2, o.y - 2, o.w + 4, o.h + 4); ctx.globalCompositeOperation = 'source-atop'; ctx.restore(); ctx.save(); ctx.strokeStyle = '#5ac8ff'; ctx.lineWidth = 3; ctx.strokeRect(o.x + 2, o.y + 2, o.w - 4, o.h - 4); ctx.fillStyle = '#5ac8ff'; ctx.beginPath(); ctx.moveTo(cx - 8, o.y + 14); ctx.lineTo(cx + 8, o.y + 22); ctx.lineTo(cx - 8, o.y + 30); ctx.fill(); ctx.restore(); }
      break;
    }
    case 'pswitch': {
      const flat = o.pressed ? 0.3 : 1;
      if (ART.silver_switch) { ctx.save(); ctx.translate(cx, o.y + o.h); ctx.scale(1, flat); drawFit('silver_switch', 0, 0, 40); ctx.restore(); break; }
      ctx.save(); ctx.translate(cx, o.y + o.h);
      ctx.fillStyle = '#7a8296'; ctx.strokeStyle = '#2a1a3a'; ctx.lineWidth = 3; rr(-20, -10, 40, 10, 3); ctx.fill(); ctx.stroke();
      ctx.scale(1, flat); const g = ctx.createLinearGradient(0, -34, 0, -10); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#a8b4c8'); ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-17, -10); ctx.quadraticCurveTo(-17, -34, 0, -34); ctx.quadraticCurveTo(17, -34, 17, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5a6278'; ctx.beginPath(); ctx.arc(0, -21, 6, 0, 7); ctx.fill();
      ctx.restore(); break;
    }
    case 'palace': {
      const col = PALACE_COL[o.color] || '#fff';
      if (ART.palace_switch) { ctx.save(); ctx.filter = { y: 'none', g: 'hue-rotate(70deg)', b: 'hue-rotate(160deg)', p: 'hue-rotate(230deg)' }[o.color]; ctx.translate(cx, o.y + o.h); ctx.scale(1, 1 - o.down * 0.6); drawFit('palace_switch', 0, 0, 80); ctx.restore(); break; }
      ctx.save(); ctx.translate(cx, o.y + o.h);
      ctx.fillStyle = '#e8e0f0'; ctx.strokeStyle = '#2a1a3a'; ctx.lineWidth = 4; rr(-48, -14, 96, 14, 4); ctx.fill(); ctx.stroke();
      ctx.scale(1, 1 - o.down * 0.7);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-40, -14); ctx.quadraticCurveTo(-40, -58, 0, -58); ctx.quadraticCurveTo(40, -58, 40, -14); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); for (let a = 0; a < 10; a++) { const r2 = a % 2 ? 6 : 14, an = -Math.PI / 2 + a * Math.PI / 5; ctx.lineTo(Math.cos(an) * r2, -34 + Math.sin(an) * r2); } ctx.closePath(); ctx.fill();
      ctx.restore();
      if (!o.pressed && Math.random() < 0.1) sparkle(cx + rnd(-40, 40), o.y - 20, 1);
      break;
    }
    case 'coin': {
      const s = Math.abs(Math.cos(t * 4 + o.ph));
      const name = s < 0.35 ? 'coin_side' : 'coin';
      const w = name === 'coin' ? 30 * Math.max(s, 0.5) : 16;
      drawImg(name, cx - w / 2, o.y + Math.sin(t * 3 + o.ph) * 2, w, 34);
      break;
    }
    case 'star': {
      ctx.save(); ctx.translate(cx, o.y + o.h / 2 + Math.sin(t * 3) * 4); ctx.rotate(Math.sin(t * 2) * 0.12);
      ctx.shadowColor = 'rgba(255,230,80,.9)'; ctx.shadowBlur = 20;
      drawImg('star', -26, -26, 52, 50); ctx.restore();
      break;
    }
    case 'heart': drawFit('heart', cx, o.y + o.h + Math.sin(t * 4) * 2, 30); break;
    case 'potion': drawFit('potion', cx, o.y + o.h + Math.sin(t * 4) * 2, 38); break;
    case 'key': ctx.save(); ctx.shadowColor = '#ffe066'; ctx.shadowBlur = 14; drawFit('key', cx, o.y + o.h + Math.sin(t * 4) * 3, 40); ctx.restore(); break;
    case 'gem': drawFit('gem', cx, o.y + o.h + Math.sin(t * 4 + o.x) * 2, 34); break;
    case 'shield': drawFit('shield', cx, o.y + o.h + Math.sin(t * 4) * 2, 38); break;
    case 'wing': ctx.save(); ctx.shadowColor = '#fff'; ctx.shadowBlur = 18; drawFit('p_wing', cx, o.y + o.h + Math.sin(t * 4) * 5, 40); ctx.restore(); if (Math.random() < 0.08) sparkle(cx, o.y + 10, 1); break;
    case 'boots': drawFit('p_boots', cx, o.y + o.h + Math.sin(t * 4) * 3, 38); break;
    case 'magnet': drawFit('p_magnet', cx, o.y + o.h + Math.sin(t * 4) * 3, 36); break;
    case 'oneup': drawFit('p_1up', cx, o.y + o.h + Math.sin(t * 4) * 2, 38); break;
    case 'fire': ctx.save(); ctx.shadowColor = '#ff8a2a'; ctx.shadowBlur = 18; drawFit('firespirit', cx, o.y + o.h + Math.sin(t * 5) * 4, 40); ctx.restore(); break;
    case 'jet': ctx.save(); ctx.shadowColor = '#ffe066'; ctx.shadowBlur = 18; drawFit('p_speed', cx, o.y + o.h + Math.sin(t * 5) * 4, 40); ctx.restore(); break;
    case 'chest': drawFit('chest', cx, o.y + o.h + 2, 46, false, o.open ? 0.55 : 1); if (!o.open && Math.random() < 0.05) sparkle(cx, o.y + 10, 1); break;
    case 'trampoline': { ctx.save(); ctx.translate(cx, o.y + o.h + 2); ctx.scale(1 + o.sq * 0.12, 1 - o.sq * 0.35); drawFit('trampoline', 0, 0, 40); ctx.restore(); break; }
    case 'booster': drawImg('booster', o.x, o.y - 14, o.w, 34, o.dir < 0); break;
    case 'wave': { ctx.save(); ctx.translate(o.x + 16, o.y + 17); ctx.scale(o.face, 1); ctx.shadowColor = '#ff8a2a'; ctx.shadowBlur = 16; const g = ctx.createLinearGradient(-16, 0, 16, 0); g.addColorStop(0, 'rgba(255,90,20,0)'); g.addColorStop(1, '#ffd84a'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(-6, 0, 20, -1.2, 1.2); ctx.arc(-14, 0, 16, 1.0, -1.0, true); ctx.fill(); ctx.restore(); break; }
    case 'bone': { ctx.save(); ctx.translate(o.x + 10, o.y + 10); ctx.rotate(o.rot); ctx.fillStyle = '#f4f0e6'; ctx.strokeStyle = '#6b5a4a'; ctx.lineWidth = 2; rr(-12, -3, 24, 6, 3); ctx.fill(); ctx.stroke(); for (const sx of [-12, 12]) for (const sy of [-4, 4]) { ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } ctx.restore(); break; }
    case 'spit': { ctx.save(); ctx.shadowColor = o.col; ctx.shadowBlur = 12; ctx.fillStyle = o.col; ctx.beginPath(); ctx.arc(o.x + 10, o.y + 10, 9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(o.x + 7, o.y + 7, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore(); break; }
    case 'magic': { ctx.save(); ctx.shadowColor = o.blue ? '#8fe8ff' : '#d38cff'; ctx.shadowBlur = 16; ctx.fillStyle = o.blue ? '#bff4ff' : '#e9b8ff'; ctx.beginPath(); ctx.arc(o.x + 12, o.y + 12, 10 + Math.sin(t * 20) * 2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(o.x + 12, o.y + 12, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); break; }
    case 'firebar': {
      ctx.drawImage(TB.metal, o.px - 24, o.py - 24, 48, 48);
      ctx.save(); ctx.shadowColor = '#ff8a1f'; ctx.shadowBlur = 14;
      for (let i = 1; i <= o.n; i++) {
        const bx = o.px + Math.cos(o.ang) * i * 20, by = o.py + Math.sin(o.ang) * i * 20;
        const g = ctx.createRadialGradient(bx, by, 1, bx, by, 11); g.addColorStop(0, '#fff6b0'); g.addColorStop(0.5, '#ffb02e'); g.addColorStop(1, '#ff4a12');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, 10, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore(); break;
    }
    case 'zapper': {
      drawImg('zapper', o.x - 14, o.y - 18, 40, 52); drawImg('zapper', o.x + o.w - 26, o.y - 18, 40, 52, true);
      if (o.on) { ctx.save(); ctx.shadowColor = '#7fe8ff'; ctx.shadowBlur = 18; ctx.strokeStyle = '#e8fdff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(o.x + 20, o.y + 10); for (let xx = o.x + 20; xx < o.x + o.w - 20; xx += 12) ctx.lineTo(xx, o.y + 10 + rnd(-6, 6)); ctx.lineTo(o.x + o.w - 20, o.y + 10); ctx.stroke(); ctx.restore(); }
      else if (o.warn) { ctx.strokeStyle = 'rgba(127,232,255,.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(o.x + 20, o.y + 10); ctx.lineTo(o.x + o.w - 20, o.y + 10); ctx.stroke(); ctx.setLineDash([]); }
      break;
    }
    case 'updraft': { ctx.save(); ctx.globalAlpha = 0.85; drawImg('antigrav', o.x - 4, o.gy * TILE - 40, o.w + 8, 44); ctx.globalAlpha = 0.12 + Math.sin(t * 4) * 0.04; ctx.fillStyle = '#bff4ff'; ctx.fillRect(o.x + 4, o.y, o.w - 8, o.h - 30); ctx.restore(); break; }
    case 'balloon': if (o.state !== 'pop') { drawFit('balloon', o.x + o.w / 2, o.y + 2, 74); ctx.fillStyle = '#9a5a28'; rr(o.x, o.y, o.w, 12, 5); ctx.fill(); ctx.strokeStyle = '#4a2410'; ctx.lineWidth = 2; ctx.stroke(); } break;
    case 'bubble': if (o.state !== 'pop') { ctx.save(); ctx.globalAlpha = 0.9; drawImg('bubble', o.x - 4, o.y - 30, o.w + 8, 62); ctx.restore(); } break;
    case 'icicle': if (o.state !== 'gone') drawImg('icicle', o.x - 8 + (o.shake || 0), o.y, o.w + 16, o.h); break;
    case 'geyser': {
      if (o.on) { const k = 1 + Math.sin(t * 25) * 0.05; ctx.save(); ctx.translate(o.x + o.w / 2, o.gy); ctx.scale(k, 1); drawImg('geyser', -o.w / 2 - 8, -o.h, o.w + 16, o.h); ctx.restore(); }
      else if (o.warn) { ctx.fillStyle = `rgba(255,150,40,${0.4 + Math.random() * 0.3})`; ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.gy + 2, 22, 6, 0, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case 'checkpoint': {
      if (ART.mid_gate) { drawFit(o.on && ART.mid_gate_open ? 'mid_gate_open' : 'mid_gate', cx, o.y + o.h + 4, 110); break; }
      drawFit('checkpoint', cx + 6, o.y + o.h + 4, 92, false, o.on ? 1 : 0.85);
      // ちゅうかんゲートの テープ(くぐると きれる)
      if (!o.on) { ctx.save(); ctx.strokeStyle = '#ff6b9a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(o.x - 6, o.y + 44); ctx.lineTo(o.x + o.w + 6, o.y + 44 + Math.sin(t * 3) * 2); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore(); }
      if (!o.on) { ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.restore(); }
      if (o.on && Math.random() < 0.1) sparkle(cx + 14, o.y + 14, 1);
      break;
    }
    case 'goal': {
      // ゴールゲート: 2本の 柱と 上下に うごく テープ。旗は 右の 柱の よこ
      const g = goalTape(o), lx = o.x - 14, rx = o.x + 62;
      if (o.secret) { ctx.save(); ctx.filter = 'hue-rotate(200deg) saturate(1.4)'; ctx.shadowColor = '#e6b8ff'; ctx.shadowBlur = 24; drawFit('goal', rx + 44, o.y + o.h + 4, 130); ctx.restore(); if (Math.random() < 0.15) sparkle(cx + rnd(-20, 30), o.y + rnd(0, 80), 1); }
      else drawFit('goal', rx + 44, o.y + o.h + 4, 130);
      for (const px of [lx, rx]) {
        if (ART.goal_post) {
          // てっぺんの 星は 形を たもち、柱の 部分だけ のばす
          const im = ART.goal_post, iw = im.naturalWidth, cap = Math.round(iw * 1.05), PW = 26, PH = g.bottom - g.top + 18, ch = PW * cap / iw;
          ctx.drawImage(im, 0, 0, iw, cap, px - PW / 2, g.top - 20, PW, ch);
          ctx.drawImage(im, 0, cap, iw, im.naturalHeight - cap, px - PW / 2, g.top - 20 + ch, PW, PH + 6 - ch);
        }
        else { ctx.save(); const pg = ctx.createLinearGradient(px - 7, 0, px + 7, 0); pg.addColorStop(0, '#c8873a'); pg.addColorStop(1, '#7a4a1a'); ctx.fillStyle = pg; ctx.strokeStyle = '#3a1a08'; ctx.lineWidth = 3; rr(px - 7, g.top, 14, g.bottom - g.top + 2, 5); ctx.fill(); ctx.stroke(); ctx.fillStyle = o.secret ? '#e6b8ff' : '#ffd84a'; ctx.beginPath(); ctx.arc(px, g.top - 4, 9, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); }
      }
      const ty = o.tapeFall ? o.tapeFall.y : g.y;
      if (!o.tapeFall || o.tapeFall.y < g.bottom + 200) {
        ctx.save(); ctx.translate((lx + rx) / 2, ty); if (o.tapeFall) ctx.rotate(o.tapeFall.rot * 0.3);
        if (ART.goal_tape) drawImg('goal_tape', -(rx - lx) / 2 - 2, -7, rx - lx + 4, 14);
        else { const tg = ctx.createLinearGradient(-38, 0, 38, 0); tg.addColorStop(0, o.secret ? '#c78bff' : '#ff5a7a'); tg.addColorStop(0.5, '#fff6a8'); tg.addColorStop(1, o.secret ? '#c78bff' : '#ff5a7a'); ctx.fillStyle = tg; ctx.strokeStyle = '#3a1a08'; ctx.lineWidth = 2; rr(-(rx - lx) / 2, -7, rx - lx, 14, 5); ctx.fill(); ctx.stroke(); }
        ctx.restore();
      }
      break;
    }
    case 'spring': {
      const sy = 1 - o.sq * 0.35;
      ctx.save(); ctx.translate(cx, o.y + o.h); ctx.scale(1, sy); drawFit('spring', 0, 0, 48); ctx.restore();
      break;
    }
    case 'mushroom': {
      const sy = 1 - o.sq * 0.3;
      ctx.save(); ctx.translate(cx, o.y + o.h + 2); ctx.scale(1 + o.sq * 0.15, sy); drawFit('mushroom', 0, 0, 52); ctx.restore();
      break;
    }
    case 'move': drawImg('movplat', o.x - 6, o.y - 18, o.w + 12, 48); break;
    case 'lift': drawImg('floating', o.x - 4, o.y - 6, o.w + 8, 66); break;
    case 'fallplat':
      if (o.state === 'gone') break;
      drawImg('fallplat', o.x + (o.shake || 0), o.y - 8, o.w, 46, false, o.state === 'fall' ? 0.85 : 1); break;
    case 'door': {
      const a = 1 - o.open;
      if (a > 0) drawImg('door', o.x - 6, o.y - 4, o.w + 12, o.h + 6, false, a);
      break;
    }
    case 'flame': {
      // 火が出ていないときは土台だけ
      const im = IMG.flame;
      const H = 100, W = im.naturalWidth / im.naturalHeight * H;
      const X = cx - W / 2, Y = o.gy * TILE - H + 4;
      if (o.on) {
        ctx.save(); ctx.translate(0, 0); const s = 1 + Math.sin(t * 30) * 0.05;
        ctx.translate(cx, Y + H); ctx.scale(1, s); ctx.drawImage(im, -W / 2, -H, W, H); ctx.restore();
      } else {
        const cut = 0.55;
        ctx.drawImage(im, 0, im.naturalHeight * cut, im.naturalWidth, im.naturalHeight * (1 - cut), X, Y + H * cut, W, H * (1 - cut));
        if (o.warn) { ctx.fillStyle = 'rgba(255,120,40,.6)'; ctx.beginPath(); ctx.arc(cx, Y + H * cut + 4, 8 + Math.random() * 3, 0, Math.PI * 2); ctx.fill(); }
      }
      break;
    }
    case 'crusher': drawImg('crusher', o.x + (o.shake || 0), o.y, o.w, o.h); break;
    case 'saw': {
      ctx.save(); ctx.translate(o.x + 26, o.y + 26); ctx.rotate(t * 10);
      const im = IMG.saw;
      // 刃の部分だけを回す(土台の左下は切る)
      ctx.drawImage(im, im.naturalWidth * 0.2, 0, im.naturalWidth * 0.8, im.naturalHeight * 0.8, -30, -30, 60, 60);
      ctx.restore();
      break;
    }
    case 'axe': {
      ctx.save();
      ctx.strokeStyle = '#5b5b6b'; ctx.lineWidth = 5; ctx.setLineDash([8, 5]);
      ctx.beginPath(); ctx.moveTo(o.px, o.py); ctx.lineTo(o.hx, o.hy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#777'; ctx.beginPath(); ctx.arc(o.px, o.py, 8, 0, Math.PI * 2); ctx.fill();
      ctx.translate(o.hx, o.hy); ctx.rotate(-o.ang);
      const im = IMG.axe;
      ctx.drawImage(im, im.naturalWidth * 0.52, im.naturalHeight * 0.15, im.naturalWidth * 0.48, im.naturalHeight * 0.75, -40, -36, 80, 72);
      ctx.restore();
      break;
    }
    case 'ball': {
      ctx.fillStyle = '#1e1e28'; ctx.beginPath(); ctx.arc(o.x + 12, o.y + 12, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(o.x + 8, o.y + 8, 4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'wind': {
      // 扇風機(素材集)と 風の帯
      const spin = o.blow === 1 ? 1 : o.blow > 0 ? 0.4 : 0;
      ctx.save(); ctx.globalAlpha = 0.08 * spin + 0.02; ctx.fillStyle = '#dff6ff'; ctx.fillRect(o.x, o.y, o.w, o.h); ctx.restore();
      const im = IMG.fan; if (!im.naturalWidth) break;
      const H = 66, W = im.naturalWidth / im.naturalHeight * H;
      ctx.save(); ctx.translate(o.fx, o.fgy + 2); if (o.dir < 0) ctx.scale(-1, 1);
      if (spin) ctx.translate(Math.sin(t * 60) * spin, 0);
      ctx.drawImage(im, -W / 2, -H, W, H); ctx.restore();
      break;
    }
    case 'portal': {
      ctx.save(); ctx.translate(cx, o.y + o.h / 2);
      if (o.hue) ctx.filter = `hue-rotate(${o.hue}deg)`;
      ctx.globalAlpha = o.exitOnly ? 0.45 : 1;
      ctx.rotate(Math.sin(t * 2 + o.ph) * 0.05); ctx.scale(1 + Math.sin(t * 4 + o.ph) * 0.04, 1);
      drawImg('portal', -34, -50, 68, 100);
      ctx.restore();
      if (!o.exitOnly && Math.random() < 0.08) sparkle(cx + rnd(-20, 20), o.y + rnd(0, o.h), 1);
      break;
    }
    case 'rock': {
      if (o.state === 'warn') {
        const k = 1 - Math.max(0, o.timer) / 0.9;
        ctx.save(); ctx.globalAlpha = 0.25 + k * 0.4; ctx.fillStyle = '#1a1028'; ctx.beginPath(); ctx.ellipse(cx, o.gy - 2, 10 + k * 20, 4 + k * 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        break;
      }
      ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = '#1a1028'; ctx.beginPath(); ctx.ellipse(cx, o.gy - 2, 30, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(cx, o.y + o.h / 2); ctx.rotate(o.rot); drawImg('boulder', -26, -26, 52, 50); ctx.restore();
      break;
    }
    case 'roller': { ctx.save(); ctx.globalAlpha = 0.9; drawFit('rocks', o.x + 24, o.gy * TILE + 4, 60, o.dir > 0); ctx.restore(); break; }
    case 'rollrock': { ctx.save(); ctx.translate(o.x + 22, o.y + 22); ctx.rotate(o.rot); drawImg('boulder', -24, -24, 48, 46); ctx.restore(); break; }
    case 'plate': { drawImg('plate', o.x - 6, o.y - 8 + o.down * 6, o.w + 12, 26 - o.down * 6); break; }
    case 'gate': drawImg('door', o.x - 6, o.y - (o.drop || 0) * 3 * TILE - 4, o.w + 12, o.h + 6); break;
    // ---------- ワールド6〜8 ----------
    case 'zip': {
      const hx = lerp(o.ax, o.bx, o.s), hy = lerp(o.ay, o.by, o.s);
      ctx.save(); ctx.lineCap = 'round';
      ctx.strokeStyle = '#5a3414'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(o.ax, o.ay); ctx.lineTo(o.bx, o.by); ctx.stroke();
      ctx.strokeStyle = '#c98a40'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(o.ax, o.ay); ctx.lineTo(o.bx, o.by); ctx.stroke(); ctx.setLineDash([]);
      // はしらの 木
      for (const [x, y] of [[o.ax, o.ay], [o.bx, o.by]]) { const gy = groundYBelow(Math.floor(x / TILE), Math.max(0, Math.floor(y / TILE))) * TILE; ctx.fillStyle = '#7a4a1e'; ctx.fillRect(x - 5, y - 6, 10, gy - y + 6); ctx.strokeStyle = '#3a2008'; ctx.lineWidth = 2; ctx.strokeRect(x - 5, y - 6, 10, gy - y + 6); }
      ctx.restore();
      if (ART.zipline) drawImg('zipline', hx - 28, hy - 14, 56, 64);
      else { const im = IMG.rope; if (im.naturalWidth) ctx.drawImage(im, im.naturalWidth * 0.36, 0, im.naturalWidth * 0.28, im.naturalHeight, hx - 18, hy - 12, 36, 62); }
      if (o.state === 'idle' && Math.random() < 0.05) sparkle(hx, hy + 40, 1);
      break;
    }
    case 'cannon': {
      ctx.save(); ctx.translate(o.x + 24, o.y + 34);
      const left = Math.cos(o.ang) < 0;
      if (left) ctx.scale(-1, 1);
      const a = left ? Math.PI - o.ang : o.ang, im = ART.star_cannon || IMG.cannon;
      if (im && im.naturalWidth) {
        // だいざ(下)と つつ(角度に 合わせて まわす)
        ctx.drawImage(im, 0, im.naturalHeight * 0.55, im.naturalWidth * 0.7, im.naturalHeight * 0.45, -34, -4, 64, 22);
        ctx.save(); ctx.rotate(a); ctx.translate(-o.recoil * 8, 0);
        ctx.drawImage(im, 0, 0, im.naturalWidth * 0.82, im.naturalHeight * 0.58, -22, -20, 66, 36); ctx.restore();
      }
      ctx.restore();
      // ねらう向きを 点で 知らせる
      if (!P.inCannon) { ctx.save(); ctx.globalAlpha = 0.45 + Math.sin(t * 5) * 0.2; ctx.fillStyle = '#ffe066'; for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(o.x + 24 + Math.cos(o.ang) * (40 + i * 22), o.y + 30 + Math.sin(o.ang) * (40 + i * 22), 4, 0, 7); ctx.fill(); } ctx.restore(); }
      else if (P.inCannon === o) { const k = 1 - o.fireT / 0.55; ctx.save(); ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(o.x + 24, o.y - 6, 14, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke(); ctx.restore(); }
      break;
    }
    case 'lowgrav': {
      ctx.save(); ctx.fillStyle = 'rgba(190,160,255,.10)'; ctx.fillRect(o.x, 0, o.w, ROWS * TILE);
      ctx.strokeStyle = 'rgba(220,200,255,.55)'; ctx.lineWidth = 3; ctx.setLineDash([10, 10]);
      ctx.beginPath(); ctx.moveTo(o.x, 0); ctx.lineTo(o.x, ROWS * TILE); ctx.moveTo(o.x + o.w, 0); ctx.lineTo(o.x + o.w, ROWS * TILE); ctx.stroke(); ctx.restore();
      break;
    }
    case 'cometx': {
      ctx.save(); ctx.translate(o.x + 20, o.y + 18); ctx.shadowColor = '#ff9a2e'; ctx.shadowBlur = 22;
      if (ART.comet) drawImg('comet', -30, -24, 70, 48);
      else { ctx.rotate(o.rot); ctx.filter = 'hue-rotate(-25deg) saturate(1.5)'; drawImg('star', -22, -21, 44, 42); }
      ctx.restore(); break;
    }
    case 'wheelhub': {
      ctx.save(); ctx.strokeStyle = 'rgba(255,230,160,.55)'; ctx.lineWidth = 5;
      for (let i = 0; i < o.n; i++) { const a = i / o.n * Math.PI * 2 + world.time * o.sp; ctx.beginPath(); ctx.moveTo(o.cx, o.cy); ctx.lineTo(o.cx + Math.cos(a) * o.r, o.cy + Math.sin(a) * o.r); ctx.stroke(); }
      ctx.lineWidth = 3; ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.arc(o.cx, o.cy, o.r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.drawImage(TB.metal, o.cx - 20, o.cy - 20, 40, 40); ctx.restore();
      break;
    }
    case 'wheelplat': if (ART.wheel_plat) drawImg('wheel_plat', o.x - 4, o.y - 8, o.w + 8, 40); else { ctx.save(); ctx.filter = 'hue-rotate(220deg) saturate(1.2)'; drawImg('floating', o.x - 4, o.y - 6, o.w + 8, 60); ctx.restore(); } break;
    case 'crumb': {
      if (o.state === 'gone') break;
      const X = o.x + (o.shake || 0);
      if (ART.bridge_plank) drawImg('bridge_plank', X, o.y - 6, TILE, 30);
      else { const im = IMG.bridge; if (im.naturalWidth) ctx.drawImage(im, im.naturalWidth * (0.22 + (o.i % 3) * 0.16), im.naturalHeight * 0.1, im.naturalWidth * 0.16, im.naturalHeight * 0.45, X - 2, o.y - 8, TILE + 4, 34); }
      if (o.i === 0 || o.i === o.n - 1) { ctx.strokeStyle = '#6b3e16'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(o.x0 + (o.i === 0 ? 2 : TILE - 2), o.y0 - 30); ctx.lineTo(o.x0 + (o.i === 0 ? 2 : TILE - 2), o.y0 + 4); ctx.stroke(); }
      break;
    }
    case 'shadowzone': {
      if (!o.active || !o.shown || o.alpha <= 0) break;
      const im = ART.kage_haru || IMG.hero_jump;
      if (!im.naturalWidth) break;
      const H = 74, W = im.naturalWidth / im.naturalHeight * H;
      ctx.save(); ctx.globalAlpha = o.alpha; ctx.translate(o.sx + 14, o.sy + 58); ctx.scale(o.sf, 1);
      if (!ART.kage_haru) ctx.filter = 'brightness(0.15) sepia(1) hue-rotate(220deg) saturate(3)';
      ctx.shadowColor = '#b080ff'; ctx.shadowBlur = 18;
      ctx.drawImage(im, -W / 2, -H, W, H); ctx.restore();
      if (Math.random() < 0.3) parts.push({ x: o.sx + 14 + rnd(-12, 12), y: o.sy + rnd(10, 50), vx: 0, vy: rnd(-40, -10), life: 0.4, max: 0.4, color: 'rgba(120,80,200,.6)', size: rnd(3, 6), g: 0, puff: true });
      break;
    }
    case 'swave': {
      ctx.save(); ctx.translate(o.x + o.w / 2, o.y + o.h); ctx.scale(Math.sign(o.vx) || 1, 1);
      ctx.shadowColor = '#b080ff'; ctx.shadowBlur = 16; const g = ctx.createLinearGradient(-o.w / 2, 0, o.w / 2, 0); g.addColorStop(0, 'rgba(60,20,110,0)'); g.addColorStop(1, '#5a2aa0');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-o.w / 2, 0); ctx.quadraticCurveTo(o.w / 2, -o.h * 0.2, o.w / 2 - 4, -o.h); ctx.quadraticCurveTo(0, -o.h * 0.4, -o.w / 2, 0); ctx.fill();
      ctx.restore(); break;
    }
    case 'enemy': drawEnemy(o, t); break;
    case 'rail': {
      ctx.save(); ctx.strokeStyle = 'rgba(60,40,30,.7)'; ctx.lineWidth = 5; ctx.setLineDash([10, 6]); ctx.beginPath();
      o.pts.forEach(([x, y], i) => { if (i) ctx.lineTo(x + 48, y + 6); else ctx.moveTo(x + 48, y + 6); }); ctx.stroke(); ctx.setLineDash([]);
      for (const [x, y] of [o.pts[0], o.pts[o.pts.length - 1]]) { ctx.fillStyle = '#5a4030'; ctx.beginPath(); ctx.arc(x + 48, y + 6, 7, 0, 7); ctx.fill(); }
      ctx.restore();
      if (ART.rail_plat) drawImg('rail_plat', o.x - 4, o.y - 3, o.w + 8, 38);
      else { ctx.save(); ctx.filter = 'hue-rotate(160deg) saturate(1.3)'; drawImg('movplat', o.x - 6, o.y - 18, o.w + 12, 48); ctx.restore(); ctx.fillStyle = '#3a2a20'; ctx.beginPath(); ctx.arc(o.x + 48, o.y + 6, 9, 0, 7); ctx.fill(); ctx.fillStyle = '#c8a070'; ctx.beginPath(); ctx.arc(o.x + 48, o.y + 6, 4, 0, 7); ctx.fill(); }
      break;
    }
    case 'ballchain': {
      ctx.save(); ctx.drawImage(TB.metal, o.cx - 20, o.cy - 20, 40, 40);
      ctx.fillStyle = '#6a6a7a'; for (let i = 1; i < 7; i++) { const k = i / 7; ctx.beginPath(); ctx.arc(o.cx + (o.bx - o.cx) * k, o.cy + (o.by - o.cy) * k, 5, 0, 7); ctx.fill(); }
      if (ART.ball_chain) drawImg('ball_chain', o.bx - 42, o.by - 42, 84, 84);
      else {
        ctx.translate(o.bx, o.by); ctx.rotate(o.ang * 2);
        ctx.fillStyle = '#c8ccd8'; ctx.strokeStyle = '#2a2a3a'; ctx.lineWidth = 3;
        ctx.beginPath(); for (let a = 0; a < 16; a++) { const r2 = a % 2 ? 26 : 38, an = a * Math.PI / 8; ctx.lineTo(Math.cos(an) * r2, Math.sin(an) * r2); } ctx.closePath(); ctx.fill(); ctx.stroke();
        const g = ctx.createRadialGradient(-8, -8, 4, 0, 0, 26); g.addColorStop(0, '#9aa0b0'); g.addColorStop(1, '#3a3e4e'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 25, 0, 7); ctx.fill(); ctx.stroke();
      }
      ctx.restore(); break;
    }
    case 'ceil': {
      const X = o.x + (o.shake || 0);
      ctx.save();
      for (let c = 0; c < o.w / TILE; c++) {
        const bot = o.yb - (o.notch.includes(c) ? 2 * TILE : 0), x = X + c * TILE;
        if (ART.ceil_crusher) { ctx.drawImage(ART.ceil_crusher, x, bot - 3 * TILE, TILE, 3 * TILE); for (let y = bot - 4 * TILE; y > -TILE; y -= TILE) ctx.drawImage(TB.castleFill || TB.stone, x, y, TILE, TILE); continue; }
        for (let y = bot - TILE; y > -TILE; y -= TILE) ctx.drawImage(TB.castleFill || TB.stone, x, y, TILE, TILE);
        ctx.fillStyle = '#d8d8e0'; ctx.strokeStyle = '#2a1a3a'; ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x + k * 16, bot); ctx.lineTo(x + k * 16 + 8, bot + 14); ctx.lineTo(x + k * 16 + 16, bot); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      }
      ctx.restore();
      if (o.state === 'shake') { ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#ff3a3a'; ctx.fillRect(o.x, o.yb, o.w, o.stop - o.yb + TILE); ctx.restore(); }
      break;
    }
    case 'well': {
      if (ART.well) { drawImg('well', o.x - 8, o.y - 30, 64, 50); }
      else {
        ctx.save(); ctx.fillStyle = '#7a7a8a'; ctx.strokeStyle = '#2a1a3a'; ctx.lineWidth = 3; rr(o.x - 4, o.y - 4, 56, 22, 8); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#1a1028'; ctx.beginPath(); ctx.ellipse(o.x + 24, o.y + 4, 20, 6, 0, 0, 7); ctx.fill();
        ctx.restore();
      }
      if (o.on) { ctx.save(); ctx.globalAlpha = 0.6 + Math.sin(t * 8) * 0.4; outlined('↓', o.x + 24, o.y - 70, '#fff', '#2a1a3a', 5, titleFont(26)); ctx.restore(); }
      break;
    }
    case 'wdoor': {
      drawImg('door', o.x - 6, o.y - 4, o.w + 12, o.h + 6, false, 1 - (o.open || 0) * 0.6);
      if (o.near) { ctx.save(); ctx.globalAlpha = 0.6 + Math.sin(t * 8) * 0.4; outlined('↑', o.x + 24, o.y - 18, '#fff', '#2a1a3a', 5, titleFont(26)); ctx.restore(); }
      break;
    }
  }
}

function drawEnemy(o, t) {
  const d = o.d;
  const cx = o.x + o.w / 2, bottom = o.y + o.h + 3;
  let name = d.img, h = d.dh, flip = o.face > 0;
  ctx.save();
  if (o.dying) {
    if (o.squashT !== undefined && o.vy > -400 && o.dyingT < 0.3) {
      ctx.translate(cx, bottom); ctx.scale(1.3, 0.35); drawFit(name, 0, 0, h, flip); ctx.restore(); return;
    }
    ctx.translate(cx, o.y + o.h / 2); ctx.rotate(Math.PI); ctx.globalAlpha = Math.max(0, 1 - o.dyingT / 1.6);
    drawFit(name, 0, h / 2, h, flip); ctx.restore(); return;
  }
  // 第4段階の 敵: ChatGPT の 絵が あれば それ、なければ 色替え
  if (d.art) {
    const art = ART[d.art];
    if (o.type === 'mogura' && o.state === 'under') { ctx.fillStyle = '#7a4a24'; ctx.beginPath(); ctx.ellipse(cx, o.y + o.h, 26, 10 + Math.sin(t * 12) * 2, 0, Math.PI, 0); ctx.fill(); ctx.restore(); return; }
    if (o.type === 'kumo') { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, o.ay); ctx.lineTo(cx, o.y + 6); ctx.stroke(); }
    if (o.type === 'oobake') ctx.globalAlpha = o.shy ? 0.45 : 0.85;
    let h2 = h; if (o.type === 'fugu' && o.puff > 0) { h2 = h * 1.5; ctx.translate(cx, bottom - (h2 - h) / 2); ctx.scale(1, 1); ctx.translate(-cx, -bottom); }
    if (!art) ctx.filter = d.filter || 'none';
    drawFit(art ? d.art : name, cx, bottom - (o.type === 'nageko' || o.type === 'mogura' ? Math.abs(Math.sin(o.ph * 8)) * 2 : 0) + (o.type === 'oobake' ? Math.sin(t * 2) * 6 : 0), h2, flip);
    ctx.filter = 'none';
    if (o.type === 'fugu' && o.puff > 0 && !art) { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 3; for (let a = 0; a < 8; a++) { const an = a * Math.PI / 4; ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * 22, o.y + o.h / 2 + Math.sin(an) * 20); ctx.lineTo(cx + Math.cos(an) * 34, o.y + o.h / 2 + Math.sin(an) * 30); ctx.stroke(); } }
    ctx.restore(); return;
  }
  switch (o.type) {
    case 'hone': {
      ctx.globalAlpha = o.invT > 0 && Math.floor(o.invT * 20) % 2 ? 0.45 : 1;
      ctx.translate(cx, bottom); if (o.state === 'recover') ctx.rotate(Math.sin(t * 20) * 0.08);
      ctx.shadowColor = o.hp <= 1 ? '#ff4a4a' : '#ffd84a'; ctx.shadowBlur = 20;
      if (ART.boss_hone) drawFit('boss_hone', 0, 0, 124, flip);
      else { ctx.filter = o.hp <= 1 ? 'sepia(1) hue-rotate(-30deg) saturate(2)' : 'sepia(0.5) saturate(1.2) brightness(1.1)'; drawFit(name, 0, 0, h, flip); ctx.filter = 'none'; }
      ctx.shadowBlur = 0;
      // かぶとは 絵に あるので 仮の 王冠は 絵が ない ときだけ
      if (!ART.boss_hone) { ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 2; const hy = -h - 2; ctx.beginPath(); ctx.moveTo(-18, hy + 12); ctx.lineTo(-18, hy - 2); ctx.lineTo(-9, hy + 6); ctx.lineTo(0, hy - 8); ctx.lineTo(9, hy + 6); ctx.lineTo(18, hy - 2); ctx.lineTo(18, hy + 12); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      break;
    }
    case 'plant': {
      // 土管の中から出てくる(地面より下は見せない)
      ctx.beginPath(); ctx.rect(o.x - 30, o.y0 - 60, o.w + 60, o.h + 60); ctx.clip();
      drawFit(name, cx, o.y + o.h + 6, h, false);
      ctx.restore();
      drawPipeLip(cx, o.y0 + o.h);
      return;
    }
    case 'yurei': {
      if (ART.boss_yurei) { name = 'boss_yurei'; h = 130; }
      ctx.globalAlpha = o.alpha * (o.invT > 0 && Math.floor(o.invT * 20) % 2 ? 0.4 : 1);
      ctx.translate(cx, bottom + Math.sin(t * 3) * 6);
      if (o.state === 'stun') ctx.rotate(Math.sin(t * 9) * 0.1);
      ctx.shadowColor = o.state === 'aim' ? '#ff6a8a' : '#bff4ff'; ctx.shadowBlur = 30;
      ctx.filter = ART.boss_yurei ? (o.hp <= o.maxHp / 2 ? 'saturate(1.5)' : 'none') : o.hp <= o.maxHp / 2 ? 'hue-rotate(250deg) saturate(1.6)' : 'hue-rotate(160deg) saturate(1.3)';
      drawFit(name, 0, 0, h, flip);
      ctx.filter = 'none'; ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffd84a'; ctx.globalAlpha = Math.max(0.3, o.alpha);
      ctx.beginPath(); ctx.moveTo(-24, -h + 2); ctx.lineTo(-24, -h - 12); ctx.lineTo(-12, -h - 4); ctx.lineTo(0, -h - 16); ctx.lineTo(12, -h - 4); ctx.lineTo(24, -h - 12); ctx.lineTo(24, -h + 2); ctx.closePath(); ctx.fill();
      if (o.state === 'stun') for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.1; drawImg('ui_star', Math.cos(a) * 34 - 10, -h - 26 + Math.sin(a) * 8, 20, 18); }
      break;
    }
    case 'slimeking': {
      ctx.globalAlpha = o.invT > 0 && Math.floor(o.invT * 20) % 2 ? 0.45 : 1;
      const air = o.state === 'hop' || o.state === 'bigjump';
      const sq = o.sq || 0, sx2 = 1 + sq * 0.25 - (air ? 0.08 : 0), sy2 = 1 - sq * 0.25 + (air ? 0.1 : 0);
      if (o.state === 'bigjump' && o.landX !== undefined) {
        // 大ジャンプの 着地点に かげ
        const gy = groundYBelow(Math.floor(o.landX / TILE), 2) * TILE;
        ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#1a3010'; ctx.beginPath(); ctx.ellipse(o.landX, gy - 2, 70, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      ctx.translate(cx, bottom); ctx.scale(sx2, sy2);
      if (ART.boss_slime) drawFit('boss_slime', 0, 0, 110, flip);
      else { ctx.filter = o.hp <= o.maxHp / 2 ? 'hue-rotate(-80deg) saturate(1.5)' : 'saturate(1.3)'; drawFit(name, 0, 0, h, flip); ctx.filter = 'none'; }
      ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 2;
      const hy = -h + 6; ctx.beginPath(); ctx.moveTo(-20, hy + 12); ctx.lineTo(-20, hy - 2); ctx.lineTo(-10, hy + 6); ctx.lineTo(0, hy - 8); ctx.lineTo(10, hy + 6); ctx.lineTo(20, hy - 2); ctx.lineTo(20, hy + 12); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'kabuto': {
      if (ART.boss_kabuto) { name = 'boss_kabuto'; h = 110; }
      ctx.globalAlpha = o.invT > 0 && Math.floor(o.invT * 20) % 2 ? 0.45 : 1;
      const shake = o.state === 'aim' ? Math.sin(t * 80) * 3 : 0;
      ctx.translate(cx + shake, bottom);
      if (o.state === 'stun') ctx.rotate(Math.sin(t * 10) * 0.06);
      ctx.shadowColor = o.state === 'aim' || o.state === 'charge' ? '#ff4a4a' : (o.hp <= o.maxHp / 2 ? '#ff8a2a' : '#7fd0ff'); ctx.shadowBlur = 24;
      ctx.filter = ART.boss_kabuto ? (o.hp <= o.maxHp / 2 ? 'hue-rotate(-40deg) saturate(1.4)' : 'none') : o.hp <= o.maxHp / 2 ? 'hue-rotate(-30deg) saturate(1.6)' : 'hue-rotate(210deg) saturate(1.3)';
      drawFit(name, 0, 0, h, flip);
      ctx.filter = 'none'; ctx.shadowBlur = 0;
      if (o.state === 'stun') {
        // 目を回している: 頭の上で 星が回る
        for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.1; drawImg('ui_star', Math.cos(a) * 34 - 10, -h - 6 + Math.sin(a) * 8, 20, 18); }
      }
      break;
    }
    case 'queen': case 'medama': {
      const art = ART['boss_' + (o.type === 'queen' ? 'queen' : 'eye')];
      if (art) { name = 'boss_' + (o.type === 'queen' ? 'queen' : 'eye'); h = 120; }
      // とっしんの ねらい・光の柱の 合図
      if (o.state === 'aim') { const gy = groundYBelow(Math.floor(o.tgx / TILE), 2) * TILE; ctx.save(); ctx.globalAlpha = 0.5 + Math.sin(t * 20) * 0.3; ctx.fillStyle = '#ff3a5a'; ctx.beginPath(); ctx.ellipse(o.tgx, gy - 3, 30, 8, 0, 0, 7); ctx.fill(); ctx.restore(); }
      if (o.state === 'charge') { const gy = 10 * TILE; ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(t * 24) * 0.25; ctx.strokeStyle = '#fff6a8'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(o.beamX - 40, o.y + o.h); ctx.lineTo(o.beamX - 40, gy); ctx.moveTo(o.beamX + 40, o.y + o.h); ctx.lineTo(o.beamX + 40, gy); ctx.stroke(); ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.ellipse(o.beamX, gy - 3, 40, 9, 0, 0, 7); ctx.fill(); ctx.restore(); }
      if (o.state === 'beam') { ctx.save(); const g = ctx.createLinearGradient(o.beamX - 40, 0, o.beamX + 40, 0); g.addColorStop(0, 'rgba(255,246,168,0)'); g.addColorStop(0.5, 'rgba(255,255,230,.95)'); g.addColorStop(1, 'rgba(255,246,168,0)'); ctx.fillStyle = g; ctx.fillRect(o.beamX - 40, o.y + o.h / 2, 80, 10 * TILE - o.y - o.h / 2); ctx.restore(); }
      ctx.globalAlpha = o.invT > 0 && Math.floor(o.invT * 20) % 2 ? 0.4 : 1;
      const shake = o.state === 'aim' || o.state === 'charge' ? Math.sin(t * 80) * 3 : 0;
      ctx.translate(cx + shake, bottom + (o.state === 'float' ? Math.sin(t * 6) * 3 : 0));
      if (o.state === 'stun') ctx.rotate(Math.sin(t * 9) * 0.08);
      ctx.shadowColor = o.state === 'aim' || o.state === 'charge' ? '#ff4a6a' : o.type === 'queen' ? '#ffd84a' : '#c79bff'; ctx.shadowBlur = 26;
      const angry = o.hp <= o.maxHp / 2;
      ctx.filter = art ? (angry ? 'saturate(1.5)' : 'none') : o.type === 'queen' ? (angry ? 'hue-rotate(-30deg) saturate(1.6)' : 'saturate(1.3)') : (angry ? 'hue-rotate(-60deg) saturate(1.6)' : 'hue-rotate(250deg) saturate(1.3)');
      if (o.type === 'medama' && o.state === 'stun') ctx.filter += ' brightness(0.7)';
      drawFit(name, 0, 0, h, flip);
      ctx.filter = 'none'; ctx.shadowBlur = 0;
      // かんむり(じょおう) / 目を とじる(めだま)
      if (o.type === 'queen') { ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-20, -h + 6); ctx.lineTo(-20, -h - 8); ctx.lineTo(-10, -h); ctx.lineTo(0, -h - 12); ctx.lineTo(10, -h); ctx.lineTo(20, -h - 8); ctx.lineTo(20, -h + 6); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      if (o.state === 'stun') for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.1; drawImg('ui_star', Math.cos(a) * 34 - 10, -h - 14 + Math.sin(a) * 8, 20, 18); }
      break;
    }
    case 'kage': {
      if (ART.boss_kage) { name = 'boss_kage'; h = 132; }
      if (o.state === 'leap' && o.tgx) { const gy = groundYBelow(Math.floor(o.tgx / TILE), 2) * TILE; ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = '#2a103a'; ctx.beginPath(); ctx.ellipse(o.tgx, gy - 3, 36, 9, 0, 0, 7); ctx.fill(); ctx.restore(); }
      ctx.globalAlpha = o.invT > 0 && Math.floor(o.invT * 20) % 2 ? 0.4 : 1;
      const sq = o.state === 'crouch' ? 0.85 : 1;
      ctx.translate(cx, bottom); ctx.scale(o.face < 0 ? -1 : 1, sq);
      if (o.state === 'stun') ctx.rotate(Math.sin(t * 9) * 0.07);
      const angry = o.hp <= o.maxHp / 2;
      ctx.shadowColor = angry ? '#ff4a8a' : '#a070ff'; ctx.shadowBlur = 30;
      if (!ART.boss_kage) ctx.filter = 'brightness(0.18) sepia(1) hue-rotate(220deg) saturate(3)';
      const im = ART.boss_kage || IMG.hero_idle;
      if (im.naturalWidth) { const W = im.naturalWidth / im.naturalHeight * h; ctx.drawImage(im, -W / 2, -h, W, h); }
      ctx.filter = 'none'; ctx.shadowBlur = 0;
      // 光る 目
      if (!ART.boss_kage) { ctx.fillStyle = angry ? '#ff6a9a' : '#ffe066'; ctx.beginPath(); ctx.arc(10, -h * 0.74, 4, 0, 7); ctx.arc(22, -h * 0.74, 4, 0, 7); ctx.fill(); }
      if (o.state === 'stun') for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.1; drawImg('ui_star', Math.cos(a) * 30 - 10, -h - 12 + Math.sin(a) * 8, 20, 18); }
      break;
    }
    case 'boss': {
      ctx.globalAlpha = o.alpha * (o.invT > 0 && Math.floor(o.invT * 20) % 2 ? 0.4 : 1);
      ctx.shadowColor = o.hp <= o.maxHp / 2 ? '#ff4a6a' : '#b06cff'; ctx.shadowBlur = 30;
      ctx.filter = 'hue-rotate(60deg) saturate(1.4)';
      drawFit(name, cx, bottom, h, flip);
      ctx.filter = 'none'; ctx.shadowBlur = 0;
      ctx.globalAlpha = o.alpha;
      // かんむり
      ctx.fillStyle = '#ffd84a'; const hx = cx, hy = bottom - h - 4;
      ctx.beginPath(); ctx.moveTo(hx - 22, hy + 14); ctx.lineTo(hx - 22, hy); ctx.lineTo(hx - 11, hy + 8); ctx.lineTo(hx, hy - 6); ctx.lineTo(hx + 11, hy + 8); ctx.lineTo(hx + 22, hy); ctx.lineTo(hx + 22, hy + 14); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 2; ctx.stroke();
      break;
    }
    case 'wizard': ctx.globalAlpha = o.alpha; drawFit(name, cx, bottom, h, flip); if (o.timer < 0.4 && o.state === 'walk') { ctx.fillStyle = '#e9b8ff'; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(cx + o.face * 26, o.y + 14, 8 + Math.random() * 4, 0, Math.PI * 2); ctx.fill(); } break;
    case 'fish': { ctx.translate(cx, o.y + o.h / 2); ctx.rotate(o.vy * 0.0008 * -o.face); drawFit(name, 0, h / 2, h, o.vy > 0); break; }
    case 'orb': ctx.shadowColor = '#7fe0ff'; ctx.shadowBlur = 20; drawFit(name, cx, bottom + 8, h, false); break;
    case 'eye': drawFit(name, cx, bottom, h, flip); break;
    case 'ghost': ctx.globalAlpha = o.shy ? 0.55 : 0.9; drawFit(name, cx, bottom + Math.sin(t * 3) * 4, h, flip); break;
    case 'shell': {
      if (o.state === 'shell' || o.state === 'slide') {
        const im = IMG.shell;
        // 甲羅だけ(頭の部分を見せない)
        const W = 44;
        ctx.translate(cx, o.y + o.h);
        if (o.state === 'slide') ctx.rotate(Math.sin(t * 40) * 0.08);
        ctx.drawImage(im, im.naturalWidth * 0.35, 0, im.naturalWidth * 0.65, im.naturalHeight * 0.85, -W / 2, -38, W, 38);
        break;
      }
      drawFit(name, cx, bottom, h, flip); break;
    }
    case 'bomb': {
      if (o.state === 'lit') { const k = Math.floor(o.timer * (o.timer < 0.6 ? 16 : 8)) % 2; ctx.filter = k ? 'brightness(1.8) saturate(.4)' : 'none'; const s = 1 + (1.5 - o.timer) * 0.12; ctx.translate(cx, bottom); ctx.scale(s, s); drawFit(name, 0, 0, h, flip); break; }
      drawFit(name, cx, bottom - Math.abs(Math.sin(o.ph * 8)) * 2, h, flip); break;
    }
    case 'bee': case 'bat': drawFit(name, cx, bottom, h, flip); break;
    case 'goomy': if (o.v === 'para') { const fl = Math.sin(o.ph * 18) * 0.4; for (const sd of [-1, 1]) { ctx.save(); ctx.translate(cx + sd * 16, o.y + 6); ctx.scale(sd, 1); ctx.rotate(-0.4 + fl); drawImg('p_wing', -4, -22, 30, 26); ctx.restore(); } } drawFit(name, cx, bottom - (o.onGround ? Math.abs(Math.sin(o.ph * 8)) * 2 : 0), h, flip); break;
    case 'beetle': if (o.charge > 0.5) { ctx.filter = 'saturate(1.6) brightness(1.15)'; } drawFit(name, cx, bottom - (o.charge > 0.5 ? Math.abs(Math.sin(o.ph * 30)) * 3 : 0), h, flip); break;
    case 'slime': { const s = o.onGround ? 1 + Math.sin(o.ph * 8) * 0.06 : 0.9; ctx.translate(cx, bottom); ctx.scale(2 - s, s); drawFit(name, 0, 0, o.big ? 58 : h, flip); break; }
    case 'turret': drawFit(name, cx, bottom, h, o.face > 0); break;
    default: drawFit(name, cx, bottom - (d.walker ? Math.abs(Math.sin(o.ph * 8)) * 2 : 0), h, flip);
  }
  ctx.restore();
}
function drawPipeLip(cx, y) {
  const im = IMG.plant;
  // 植物の絵の下の土管の口を、地面の上にもう一度描いて手前に見せる
  const H = 80, W = im.naturalWidth / im.naturalHeight * H;
  ctx.drawImage(im, 0, im.naturalHeight * 0.66, im.naturalWidth, im.naturalHeight * 0.34, cx - W / 2, y - H * 0.34 + 6, W, H * 0.34);
}

function drawParts() {
  for (const q of parts) {
    const a = Math.max(0, q.life / q.max);
    if (q.text) { ctx.globalAlpha = a; const k = 1 + Math.max(0, q.life - q.max + 0.12) * 3; ctx.save(); ctx.translate(q.x, q.y); ctx.scale(k, k); outlined(q.text, 0, 0, q.color, '#2a1a3a', 5, font(20)); ctx.restore(); ctx.globalAlpha = 1; continue; }
    if (q.streak) { ctx.globalAlpha = Math.min(1, a * 2) * 0.7; ctx.strokeStyle = q.color; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - Math.sign(q.vx) * q.size, q.y); ctx.stroke(); ctx.globalAlpha = 1; continue; }
    if (q.ghost) { const im = IMG.hero_jump; if (im.naturalWidth) { const H = 74, W = im.naturalWidth / im.naturalHeight * H; ctx.save(); ctx.globalAlpha = a * 0.45; ctx.translate(q.x, q.y + 31); ctx.scale(q.face, 1); ctx.filter = 'brightness(1.8) saturate(0.4)'; ctx.drawImage(im, -W / 2, -H, W, H); ctx.restore(); } continue; }
    if (q.img) {
      ctx.save(); ctx.globalAlpha = Math.min(1, a * 2); ctx.translate(q.x + q.size / 2, q.y + q.size / 2);
      if (q.rot) ctx.rotate(q.rot);
      if (q.spin) ctx.scale(Math.cos(q.life * 30), 1);
      ctx.drawImage(IMG[q.img], -q.size / 2, -q.size / 2, q.size, q.size); ctx.restore(); continue;
    }
    ctx.globalAlpha = a; ctx.fillStyle = q.color;
    if (q.star) { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.life * 8); ctx.fillRect(-q.size, -q.size / 4, q.size * 2, q.size / 2); ctx.fillRect(-q.size / 4, -q.size, q.size / 2, q.size * 2); ctx.restore(); }
    else if (q.confetti) { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.scale(1, Math.cos(q.life * 9)); ctx.fillRect(-q.size, -q.size / 2, q.size * 2, q.size); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(q.x, q.y, q.puff ? q.size * (1.6 - a * 0.6) : q.size, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
}

function drawHUD() {
  // HUD の 後ろに 主人公・星・敵が 入ったら うすくする(見切れ対策)
  // (左上の ハート・コイン、まんなかの 面の札、右上の 点数と 一時停止の 3か所)
  const under = (o) => { const x = o.x - cam.x, y = o.y - cam.y, r = x + (o.w || 0), b = y + (o.h || 0); if (b <= 0) return false;
    return (x < 330 && y < 140 && r > 0) || (x < VW / 2 + 110 && r > VW / 2 - 110 && y < 70) || (r > VW - 240 && x < VW && y < 115); };
  const hudFade = under(P) || world.ents.some(o => (o.t === 'star' || o.t === 'enemy' || o.t === 'magic' || o.t === 'spit' || o.t === 'cometx') && under(o));
  world.hudA = lerp(world.hudA ?? 1, hudFade ? 0.4 : 1, 0.15);
  ctx.save(); ctx.globalAlpha = world.hudA;
  drawHUD0();
  ctx.restore();
  drawProgress();
}
// すすみぐあい: 面の はじめから ゴールまでの 棒。中間ポイントと 取った星を しるす
function drawProgress() {
  if (!level.goalX) { const g = world.ents.find(o => o.t === 'goal' && !o.secret) || world.ents.find(o => o.t === 'enemy' && o.d && o.d.boss); level.goalX = g ? g.x : level.W * TILE; }
  const bw = 180, bx = VW / 2 - bw / 2, by = 58, k = clamp((P.x - 2 * TILE) / Math.max(1, level.goalX - 2 * TILE), 0, 1);
  ctx.save(); ctx.globalAlpha = 0.85;
  rr(bx, by, bw, 8, 4); ctx.fillStyle = 'rgba(20,10,40,.55)'; ctx.fill();
  rr(bx, by, Math.max(8, bw * k), 8, 4); ctx.fillStyle = '#7dff8a'; ctx.fill();
  for (const o of world.ents) if (o.t === 'checkpoint') { const cx = bx + bw * clamp((o.x - 2 * TILE) / Math.max(1, level.goalX - 2 * TILE), 0, 1); ctx.fillStyle = o.on ? '#ffd84a' : '#ffffff'; ctx.fillRect(cx - 1.5, by - 3, 3, 14); }
  ctx.fillStyle = '#ff6b6b'; ctx.fillRect(bx + bw - 2, by - 4, 4, 16);
  drawFit('hero_idle', bx + bw * k, by + 12, 22);
  ctx.restore();
}
function drawHUD0() {
  // ハート
  for (let i = 0; i < P.maxHearts; i++) {
    const full = i < P.hearts;
    const bounce = full && P.hearts === 1 ? Math.abs(Math.sin(performance.now() / 160)) * 3 : 0;
    drawImg(full ? 'ui_heart' : 'ui_heart_empty', 18 + i * 40, 14 - bounce, 36, 32);
  }
  if (P.shield) drawImg('shield', 18 + P.maxHearts * 40 + 4, 10, 30, 36);
  // コインと星
  { const k = 1 + (world.coinPop || 0) * 1.6; drawImg('ui_coin', 35 - 17 * k, 73 - 17 * k, 34 * k, 34 * k); }
  outlined('×' + String(world.coins).padStart(3, '0'), 58, 74, '#fff', '#2a1a3a', 6, titleFont(24), 'left');
  drawImg('ui_star', 150, 55, 36, 34);
  outlined('×' + world.stars.filter(Boolean).length + '/3', 192, 74, '#ffe14d', '#2a1a3a', 6, titleFont(24), 'left');
  if (world.keyHeld) drawImg('key', 280, 54, 28, 36);
  let ix = 18;
  const timed = (img, tLeft, tMax) => {
    drawImg(img, ix, 96, 34, 32);
    if (tMax) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(ix + 17, 112, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, tLeft / tMax)); ctx.stroke(); }
    ix += 44;
  };
  for (const k of P.powers || []) { if (k === 'cape') { drawItemIcon('p_cape', ix, 96, 34, 32); ix += 44; } else timed(POWER_INFO[k].img, 0, 0); }
  if (P.jetT > 0) timed('p_speed', P.jetT, 15);
  if (P.bootsT > 0) timed('p_boots', P.bootsT, 10);
  const boss = world.ents.find(o => o.t === 'enemy' && o.d.boss && o.state !== 'sleep' && !o.dying);
  if (boss) {
    const bw = 360, bx = VW / 2 - bw / 2, by = 104;
    rr(bx - 4, by - 4, bw + 8, 30, 10); ctx.fillStyle = 'rgba(20,10,40,.8)'; ctx.fill();
    rr(bx, by, bw * boss.hp / boss.maxHp, 22, 8); const g = ctx.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, '#ff4a6a'); g.addColorStop(1, '#b06cff'); ctx.fillStyle = g; ctx.fill();
    outlined(boss.d.name, bx - 12, by + 11, '#fff', '#2a1a3a', 5, font(18), 'right');
  }
  if (P.magnetT > 0) timed('p_magnet', P.magnetT, 12);
  if (world.gateT > 0) {
    // とびらが しまるまでの のこり
    const k = world.gateT / (world.gateMax || 6), bx = VW / 2 - 90, by = 72;
    drawFit('timer', bx - 18, by + 34, 34);
    rr(bx, by + 8, 180, 18, 8); ctx.fillStyle = 'rgba(20,10,40,.7)'; ctx.fill();
    rr(bx, by + 8, 180 * k, 18, 8); ctx.fillStyle = k < 0.34 ? '#ff5a6a' : '#ffd84a'; ctx.fill();
    outlined(Math.ceil(world.gateT) + '', bx + 200, by + 17, '#fff', '#2a1a3a', 5, titleFont(20));
  }
  // ぎんの スイッチの のこり
  if (world.pT > 0) {
    const k = world.pT / 9, bx = VW / 2 - 90, by = world.gateT > 0 ? 100 : 72;
    rr(bx, by + 8, 180, 18, 8); ctx.fillStyle = 'rgba(20,10,40,.7)'; ctx.fill();
    rr(bx, by + 8, 180 * k, 18, 8); ctx.fillStyle = k < 0.34 ? '#ff5a6a' : '#d8e4f0'; ctx.fill();
    outlined('ぎん ' + Math.ceil(world.pT), bx - 30, by + 17, '#fff', '#2a1a3a', 5, font(15));
  }
  // よびの 箱(タップ・Q・E で 出す)
  { const bx = VW / 2 - 172, by = 8, s2 = 1 + (world.resPop > 0 ? Math.sin(world.resPop / 0.5 * Math.PI) * 0.18 : 0);
    ctx.save(); ctx.translate(bx + 30, by + 26); ctx.scale(s2, s2);
    if (ART.reserve_box) ctx.drawImage(ART.reserve_box, -30, -26, 60, 52);
    else { rr(-28, -24, 56, 48, 10); ctx.fillStyle = 'rgba(20,10,40,.55)'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#ffe9a8'; ctx.stroke(); rr(-22, -18, 44, 36, 7); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,233,168,.45)'; ctx.stroke(); }
    if (save.reserve) drawItemIcon(RESERVE_INFO[save.reserve].img, -17, -17, 34, 34);
    ctx.restore();
    uiButtons.push({ x: bx, y: by, w: 60, h: 52, fn: () => { if (scene === 'play') dropReserve(); } });
  }
  // 大きな ほしの かけら(5まい)
  for (let i = 0; i < 5; i++) { const got = world.shards[i]; ctx.save(); if (!got) ctx.globalAlpha = 0.3; drawShardIcon(VW / 2 + 118 + i * 21, 30, 9, performance.now() / 1000, !got); ctx.restore(); }
  // もこりゅうの ちから
  if (P.mount) { const m = P.mount; let mx = VW / 2 + 118; if (m.fire > 0) { for (let i = 0; i < m.fire; i++) drawImg('firespirit', mx + i * 18, 44, 18, 20); mx += m.fire * 18 + 6; } if (m.flyT > 0) { drawImg('p_wing', mx, 44, 24, 20); ctx.fillStyle = '#fff'; ctx.font = font(13, 800); ctx.textAlign = 'left'; ctx.fillText(Math.ceil(m.flyT) + '', mx + 26, 56); } }
  // 点数の札と面の札
  woodPlate(VW - 228, 12, 212, 46);
  outlined(String(world.score).padStart(7, '0'), VW - 122, 36, '#fff', '#3a1a08', 6, titleFont(28));
  woodPlate(VW / 2 - 100, 12, 200, 42);
  outlined('World ' + stageLabel(world.def), VW / 2, 34, '#fff', '#3a1a08', 6, titleFont(22));
  // 一時停止
  button(VW - 66, 66, 50, 44, 'Ⅱ', () => { if (scene === 'play') { scene = 'pause'; pauseSel = 0; sfx('pause'); if (bgmEl) bgmEl.pause(); } }, { size: 22 });
}

function drawTouch() {
  if (!usingTouch) return;
  const draw = (b, label, on) => {
    ctx.save();
    // ふだんは うすく(下の 敵や アイテムが 見えるように)、押している間だけ こく
    ctx.globalAlpha = on ? 0.7 : 0.26;
    ctx.fillStyle = on ? '#ffe066' : '#ffffff';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.lineWidth = 4; ctx.strokeStyle = '#2a1a3a'; ctx.stroke();
    ctx.fillStyle = '#2a1a3a'; ctx.font = font(label.length > 1 ? 22 : 34); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, b.x, b.y + 2);
    ctx.restore();
  };
  draw(TOUCH.left, '◀', touchKeys.left);
  draw(TOUCH.right, '▶', touchKeys.right);
  draw(TOUCH.attack, 'けん', touchKeys.attack);
  draw(TOUCH.jump, 'ジャンプ', touchKeys.jump);
  draw(TOUCH.spin, 'スピン', touchKeys.spin);
  if (hasPower('dash') || nearCarry()) draw(TOUCH.dash, nearCarry() ? 'もつ' : 'ダッシュ', touchKeys.dash);
}

function drawToast() {
  if (!toast) return;
  const a = Math.min(1, toast.t * 3, (toast.max || 9));
  ctx.save(); ctx.globalAlpha = Math.min(1, a);
  // 説明の札は 画面の上の はし(HUD の すぐ下)に 小さく出して、しかけに かぶらないようにする
  const inPlay = scene === 'play' && world;
  const bossBar = inPlay && world.ents.some(o => o.t === 'enemy' && o.d && o.d.boss && o.state !== 'sleep' && !o.dying);
  // 主人公が 画面の上の方に いるときは 札を 下に出す
  const heroHigh = inPlay && P && P.y - cam.y < 240;
  const w = 440, h = toast.sub ? 66 : 44, x = VW / 2 + 30 - w / 2;
  let y = !inPlay ? 120 : heroHigh ? VH - h - 96 : (bossBar ? 136 : (world.gateT > 0 ? 110 : 74));
  if (inPlay) {
    // 札の 下に 星・ワープ・道具が かくれるときは 反対がわ(上⇔下)に うつす
    const hides = yy => world.ents.some(o => (o.t === 'star' || o.t === 'portal' || o.t === 'wing' || o.t === 'boots' || o.t === 'fire' || o.t === 'cometx' || o.t === 'chest') && o.x - cam.x + o.w > x && o.x - cam.x < x + w && o.y - cam.y + o.h > yy && o.y - cam.y < yy + h) || (P && P.x - cam.x + P.w > x && P.x - cam.x < x + w && P.y - cam.y + P.h > yy && P.y - cam.y < yy + h);
    if (hides(y)) { const alt = [y < VH / 2 ? VH - h - 96 : 74, 180, 250].find(a => !hides(a)); if (alt !== undefined) y = alt; else ctx.globalAlpha *= 0.55; }
  }
  rr(x, y, w, h, 14); ctx.fillStyle = 'rgba(30,20,60,.66)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke();
  outlined(toast.text, x + w / 2, y + 22, '#fff', '#2a1a3a', 5, font(23));
  if (toast.sub) { ctx.fillStyle = '#ffe9a8'; ctx.font = font(16, 700); ctx.textAlign = 'center'; ctx.fillText(toast.sub, x + w / 2, y + 50); }
  ctx.restore();
}

// 画面の外から くる物(ころがる岩)を 画面の はしの 矢印で 知らせる
function drawOffscreen(t) {
  for (const o of world.ents) {
    if (o.t === 'comet' && o.warn) {
      // ほうき星が くる 列: 右の はしに「!」、画面に うすい 点線
      const sy = o.row * TILE + 24 - cam.y, k = 1 - o.timer;
      ctx.save(); ctx.globalAlpha = 0.25 + k * 0.3; ctx.strokeStyle = '#ffb04a'; ctx.lineWidth = 3; ctx.setLineDash([14, 12]); ctx.lineDashOffset = t * 60;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(VW, sy); ctx.stroke(); ctx.restore();
      const ax = VW - 30, a = 0.6 + Math.sin(t * 16) * 0.4;
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#ff9a2e'; ctx.strokeStyle = '#2a1a3a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ax + 18, sy); ctx.lineTo(ax - 8, sy - 16); ctx.lineTo(ax - 8, sy + 16); ctx.closePath(); ctx.fill(); ctx.stroke();
      outlined('!', ax - 22, sy, '#fff', '#2a1a3a', 4, titleFont(22)); ctx.restore();
      continue;
    }
    if (o.t === 'star' && perkOn(6)) {
      // ほしの コンパス(せいちょう): 画面の外の 星の 方向を 小さく 知らせる
      const sx = o.x + 20 - cam.x, sy = o.y + 20 - cam.y;
      if (sx > -20 && sx < VW + 20 && sy > -20 && sy < VH + 20) continue;
      if (Math.abs(sx - VW / 2) > VW * 2.2) continue;
      const ex = clamp(sx, 26, VW - 26), ey = clamp(sy, 140, VH - 26);
      ctx.save(); ctx.globalAlpha = 0.55 + Math.sin(t * 5) * 0.2; drawImg('ui_star', ex - 12, ey - 11, 24, 22);
      ctx.restore();
      continue;
    }
    if (o.t !== 'rollrock') continue;
    const sx = o.x - cam.x, sy = o.y + o.h / 2 - cam.y;
    if (sx > -o.w && sx < VW) continue;
    if (Math.abs(sx < 0 ? sx : sx - VW) > 520) continue;
    const right = sx >= VW, ax = right ? VW - 30 : 30, a = 0.6 + Math.sin(t * 12) * 0.4;
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#ff5a5a'; ctx.strokeStyle = '#2a1a3a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(ax + (right ? 18 : -18), sy); ctx.lineTo(ax + (right ? -8 : 8), sy - 16); ctx.lineTo(ax + (right ? -8 : 8), sy + 16); ctx.closePath(); ctx.fill(); ctx.stroke();
    outlined('!', ax + (right ? -22 : 22), sy, '#fff', '#2a1a3a', 4, titleFont(22)); ctx.restore();
  }
}
const BACK_T = new Set(['goal', 'checkpoint', 'door', 'axe', 'geyser', 'updraft', 'wind', 'portal', 'gate', 'roller', 'lowgrav', 'wheelhub', 'zip', 'wdoor', 'well']);
// ---------- カメラ ----------
// 横: 画面の まんなかに 遊び(±44px)を作り、そこを出たときだけ 追う。先読みは 同じ向きに 0.35秒 走りつづけたときだけ ゆっくり ふやす(ふりむくだけでは 画面を ふらない)。
// 縦: 着地した高さを 目標にする。ジャンプ中は 画面の 上の はしに 近づいたときだけ 追い、落ちるときは 下が 見えるよう 早めに 追う。
// どれも 1 - exp(-dt*速さ) の 時間基準なので 画面の なめらかさ(60Hz / 144Hz)で 速さが 変わらない。ヒットストップ中・やられた後は 止まる。
const CAM_ANCHOR = 0.42, CAM_DEAD = 44, CAM_LOOK = 110;
function camSnap() {
  cam.look = P.face * CAM_LOOK * 0.5; cam.runT = 0; cam.runDir = P.face;
  cam.fx = P.x + P.w / 2 + cam.look;
  cam.x = clamp(cam.fx - VW * CAM_ANCHOR, 0, Math.max(0, level.W * TILE - VW));
  cam.gy = P.y; cam.y = clamp(P.y - VH * 0.55, 0, ROWS * TILE - VH);
}
function updateCamera(dt) {
  if (!P || P.dead || world.clear) return;
  if (world.auto) { autoScroll(dt); return; }
  if (cam.fx === undefined) camSnap();
  const ease = sp => 1 - Math.exp(-dt * sp);
  const px = P.x + P.w / 2;
  // 先読み: 同じ向きに 走りつづけたら その向きへ
  const dir = Math.abs(P.vx) > 120 ? Math.sign(P.vx) : 0;
  if (dir && dir === cam.runDir) cam.runT += dt; else if (dir) { cam.runDir = dir; cam.runT = 0; }
  const fast = Math.min(1, Math.max(0, (Math.abs(P.vx) - 300) / 300));
  if (cam.runT > 0.35) cam.lookT = cam.runDir * (CAM_LOOK + fast * 90);
  if (cam.lookT === undefined) cam.lookT = cam.look;
  cam.look += (cam.lookT - cam.look) * ease(fast > 0 ? 2.2 : 1.3);
  // 遊びの外に出たときだけ 追う
  const want = px + cam.look;
  let goal = cam.fx;
  if (want > cam.fx + CAM_DEAD) goal = want - CAM_DEAD; else if (want < cam.fx - CAM_DEAD) goal = want + CAM_DEAD;
  cam.fx += (goal - cam.fx) * ease(7);
  // 主人公が 画面の はしに 寄りすぎないように(すきまを かならず のこす)
  const maxX = Math.max(0, level.W * TILE - VW);
  let cx = clamp(cam.fx - VW * CAM_ANCHOR, 0, maxX);
  cx = clamp(cx, px - (VW - 220), px - 160);
  cam.x = clamp(cx, 0, maxX); cam.fx = cam.x + VW * CAM_ANCHOR;
  // 縦
  if (P.onGround || P.climb || P.swim) cam.gy = P.y;
  let gy = cam.gy;
  const sy = P.y - cam.y;
  if (!P.onGround && sy < 90) gy = Math.min(gy, P.y);           // 上の はしに 近い
  if (!P.onGround && P.vy > 300 && P.y > cam.gy) gy = P.y;       // 下へ 落ちている
  const ty = clamp(gy - VH * 0.55, 0, ROWS * TILE - VH);
  cam.y += (ty - cam.y) * ease(P.vy > 300 ? 6 : 3);
}
// 強制スクロール: 画面が 一定の 速さで 右へ すすむ。主人公は 画面の 左の はしに おされる(かべとの 間に はさまると やられる)
function autoScroll(dt) {
  const a = world.auto, maxX = Math.max(0, level.W * TILE - VW);
  const goal = world.ents.find(o => o.t === 'goal' && !o.secret);
  const stopX = goal ? Math.min(maxX, goal.x - VW * 0.55) : maxX;
  a.x = Math.min(stopX, a.x + a.sp * dt);
  cam.x = a.x;
  const ty = clamp((P.onGround || P.swim ? P.y : Math.min(cam.gy ?? P.y, P.y)) - VH * 0.55, 0, ROWS * TILE - VH);
  if (P.onGround || P.swim) cam.gy = P.y;
  cam.y += (ty - cam.y) * (1 - Math.exp(-dt * 4));
  if (P.x < cam.x + 4) {
    P.x = cam.x + 4; if (P.vx < 0) P.vx = 0;
    const x1 = Math.floor((P.x + P.w - 1) / TILE), y0 = Math.floor(P.y / TILE), y1 = Math.floor((P.y + P.h - 1) / TILE);
    for (let y = y0; y <= y1; y++) if (isSolid(x1, y)) { killPlayer(); return; }
  }
  if (P.x > cam.x + VW - P.w - 6) { P.x = cam.x + VW - P.w - 6; if (P.vx > 0) P.vx = 0; }
  cam.fx = cam.x + VW * CAM_ANCHOR;
}
function drawPlay(t) {
  const sx = cam.shake > 0 ? rnd(-6, 6) * cam.shake * 3 : 0, sy = cam.shake > 0 ? rnd(-6, 6) * cam.shake * 3 : 0;
  // カメラは updateCamera(固定の時間きざみ)で 動かす。ここでは 描くだけ
  drawBackground(world.def.theme, cam.x, t);
  ctx.save();
  ctx.translate(-Math.round(cam.x) + sx, -Math.round(cam.y) + sy);
  drawDecos(true);
  const backLayer = o => BACK_T.has(o.t) || (o.t === 'enemy' && o.type === 'fish');
  for (const o of world.ents) if (backLayer(o)) drawThing(o, t);
  drawTiles();
  for (const o of world.ents) {
    if (backLayer(o)) continue;
    if (o.x + (o.w || 0) < cam.x - 100 || o.x > cam.x + VW + 100) continue;
    drawThing(o, t);
  }
  drawPlayer();
  drawWater(t);
  drawParts();
  ctx.restore();
  if (world.def.theme === 'cave' || world.def.theme === 'crystal') {
    // 主人公のまわりだけ明るく
    const px = P.x + P.w / 2 - cam.x, py = P.y + P.h / 2 - cam.y;
    const rg = ctx.createRadialGradient(px, py, 120, px, py, 560);
    rg.addColorStop(0, 'rgba(10,6,24,0)'); rg.addColorStop(1, 'rgba(10,6,24,.55)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, VW, VH);
  }
  drawOffscreen(t);
  drawHUD();
  drawTouch();
  drawToast();
  // 面の はじめの 札(1.6秒で きえる。あそびは 止めない)
  if (world.introT > 0 && !world.clear) {
    const a = Math.min(1, world.introT * 3), d = world.def;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(0, -70);
    ctx.fillStyle = 'rgba(10,6,24,.72)'; ctx.fillRect(0, VH / 2 - 62, VW, 116);
    const kindName = { fort: 'とりで', ghost: 'おばけやしき', switch: 'しんでん', boss: 'ボスの しろ', water: 'みずの なか', sky: 'そらの みち' }[d.kind] || '';
    outlined((d.label || (d.kind === 'switch' ? 'しんでん' : 'World ' + stageLabel(d))) + (kindName && /^\d+$/.test(String(d.num)) ? '  ' + kindName : ''), VW / 2, VH / 2 - 30, '#ffe14d', '#2a1a3a', 7, titleFont(28));
    outlined(d.name, VW / 2, VH / 2 + 20, '#fff', '#2a1a3a', 9, titleFont(44));
    ctx.restore();
  }
  if (world.clear && scene === 'play') {
    if (world.flash > 0) { ctx.fillStyle = `rgba(255,255,240,${world.flash * 0.7})`; ctx.fillRect(0, 0, VW, VH); }
    const k = Math.min(1, world.clearT * 3);
    const bounce = 1 + Math.sin(Math.min(1, world.clearT * 2) * Math.PI) * 0.25;
    ctx.save(); ctx.translate(VW / 2, 200); ctx.scale(k * bounce, k * bounce); ctx.rotate(Math.sin(world.clearT * 3) * 0.04);
    ctx.shadowColor = 'rgba(255,200,40,.9)'; ctx.shadowBlur = 30;
    outlined('ゴール!', 0, 0, '#fff', '#2a1a3a', 18, titleFont(96));
    const g = ctx.createLinearGradient(0, -50, 0, 50); g.addColorStop(0, '#fff36b'); g.addColorStop(1, '#ff7a1f');
    ctx.shadowBlur = 0; ctx.fillStyle = g; ctx.fillText('ゴール!', 0, 0);
    ctx.restore();
  }
  if (world.lightFlash > 0) { ctx.fillStyle = `rgba(255,250,210,${world.lightFlash})`; ctx.fillRect(0, 0, VW, VH); }
  if (world.warpFlash > 0) { ctx.fillStyle = `rgba(200,245,255,${world.warpFlash * 2})`; ctx.fillRect(0, 0, VW, VH); }
  if (world.hurtFlash > 0) { ctx.fillStyle = `rgba(255,40,60,${world.hurtFlash})`; ctx.fillRect(0, 0, VW, VH); }
  if (P.hearts === 1 && !P.dead) { ctx.fillStyle = `rgba(255,40,60,${0.08 + Math.sin(t * 6) * 0.05})`; ctx.fillRect(0, 0, VW, VH); }
}

function drawTitle(t) {
  if (ART.title_bg) ctx.drawImage(ART.title_bg, 0, 0, VW, VH); else drawBackground('grass', t * 60, t);
  // 地面
  for (let x = -1; x < VW / TILE + 2; x++) {
    const X = x * TILE - (t * 60) % TILE;
    ctx.drawImage(TB.groundTop || IMG.ground, X, VH - TILE * 2, TILE, TILE);
    ctx.drawImage(TB.dirt || IMG.ground, X, VH - TILE, TILE, TILE);
  }
  // 走る主人公と敵
  const run = Math.floor(t * 8) % 2;
  drawFit(run ? 'hero_run' : 'hero_idle', 260, VH - TILE * 2 + 4 - Math.abs(Math.sin(t * 8)) * 4, 84);
  drawFit('goomy', 520 + Math.sin(t) * 30, VH - TILE * 2 + 3, 46);
  drawFit('bee', 680, 330 + Math.sin(t * 3) * 14, 52);
  drawFit('slime', 800, VH - TILE * 2 + 3, 40);
  drawFit('star', 120, 330 + Math.sin(t * 2) * 8, 56);
  // ロゴ
  ctx.save();
  // ロゴ: 上から 落ちてきて はねる
  const drop = Math.max(0, 1 - t * 1.6), bounce = drop > 0 ? 0 : Math.max(0, Math.sin(Math.min(1, (t - 0.62) * 3) * Math.PI)) * 0.08;
  ctx.translate(VW / 2, 120 + Math.sin(t * 2) * 4 - drop * drop * 260);
  ctx.rotate(-0.03); ctx.scale(1 + bounce, 1 - bounce);
  if (ART.title_logo) { const w = 560, h = ART.title_logo.naturalHeight / ART.title_logo.naturalWidth * w; ctx.drawImage(ART.title_logo, -w / 2, -h / 2, w, h); }
  else {
    outlined('ハルの冒険', 0, 0, '#fff', '#2a1a3a', 16, titleFont(84));
    const g = ctx.createLinearGradient(0, -40, 0, 40);
    g.addColorStop(0, '#fff36b'); g.addColorStop(1, '#ff8a1f');
    ctx.fillStyle = g; ctx.fillText('ハルの冒険', 0, 0);
  }
  ctx.restore();
  // ほしの かけらが ときどき 流れる
  for (let i = 0; i < 3; i++) { const k = (t * 0.35 + i / 3) % 1; const x = VW * (1.1 - k * 1.3), y = 30 + k * 160 + i * 30; ctx.save(); ctx.globalAlpha = Math.sin(k * Math.PI); drawImg('ui_star', x, y, 22, 20); ctx.strokeStyle = 'rgba(255,240,170,.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 22, y + 10); ctx.lineTo(x + 90, y - 30); ctx.stroke(); ctx.restore(); }
  outlined('〜 ほしのかけらを あつめよう 〜', VW / 2, 196, '#fff', '#2a1a3a', 6, font(24));
  const pulse = 1 + Math.sin(t * 4) * 0.03;
  ctx.save(); ctx.translate(VW / 2, 300); ctx.scale(pulse, pulse); ctx.translate(-VW / 2, -300);
  button(VW / 2 - 130, 272, 260, 60, 'はじめる', openFiles, { sel: true, size: 30 });
  ctx.restore();
  button(VW / 2 - 90, 348, 180, 46, save.sound ? 'おと: オン' : 'おと: オフ', () => setSound(!save.sound), { size: 20 });
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = font(15, 700); ctx.textAlign = 'center';
  ctx.fillText(usingTouch ? 'がめんをタップしてはじめる' : 'Enter / スペースではじめる', VW / 2, 412);
}

// ちずの 色(海と 島)。ChatGPT の map_w<n> が あれば その絵の 上に 道と マスだけ 描く
const MAP_PAL = {
  grass: { sea: ['#2f8fe0', '#5cc2ff'], land: ['#8ad66e', '#5fb64e'], rim: '#f3e2a8', wave: 'rgba(255,255,255,.55)' },
  ice: { sea: ['#3a7cc8', '#8fd0ff'], land: ['#f2f8ff', '#bfdcf2'], rim: '#ffffff', wave: 'rgba(255,255,255,.6)' },
  sand: { sea: ['#2aa0c8', '#6fd8e8'], land: ['#f2c879', '#d9a050'], rim: '#fff0c0', wave: 'rgba(255,255,255,.55)' },
  storm: { sea: ['#24304e', '#4a5a80'], land: ['#5a8a5a', '#3d6b4c'], rim: '#9aa8b8', wave: 'rgba(200,215,255,.45)' },
  dusk: { sea: ['#5a3a7a', '#e08a6a'], land: ['#c88a5a', '#9a5a4a'], rim: '#ffd0a0', wave: 'rgba(255,220,200,.5)' },
  jungle: { sea: ['#1f8a8a', '#4ac8a8'], land: ['#4aa85a', '#2f7a40'], rim: '#d8e8a0', wave: 'rgba(255,255,255,.5)' },
  moon: { sea: ['#0a0a24', '#2a1e5a'], land: ['#9a96b8', '#6a6688'], rim: '#d8d4ff', wave: 'rgba(220,210,255,.35)', stars: true },
  kage: { sea: ['#120a1e', '#3a1a3a'], land: ['#4a3a62', '#2a1e3e'], rim: '#8a6ab8', wave: 'rgba(190,150,255,.35)', stars: true },
  space: { sea: ['#05051a', '#22124a'], land: ['rgba(255,240,180,.16)', 'rgba(200,170,255,.12)'], rim: 'rgba(255,240,170,.7)', wave: 'rgba(255,240,200,.4)', stars: true },
};
const PALACE_COL = { y: '#ffd84a', g: '#5ee06a', b: '#5ac8ff', p: '#c78bff' };
const PALACE_NAME = { y: 'きいろ', g: 'みどり', b: 'みずいろ', p: 'むらさき' };
function drawMapBase(W, t) {
  const pal = MAP_PAL[W.theme] || MAP_PAL.grass;
  const g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, pal.sea[0]); g.addColorStop(1, pal.sea[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  if (pal.stars) for (let i = 0; i < 90; i++) { const x = (i * 157) % VW, y = (i * 89 + 13) % VH; ctx.globalAlpha = 0.35 + Math.sin(t * 2 + i) * 0.3; ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 2, 2); }
  ctx.globalAlpha = 1;
  // 波(海の 上を ゆっくり ながれる)
  ctx.save(); ctx.strokeStyle = pal.wave; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  for (let i = 0; i < 34; i++) {
    const row = i % 6, x = ((i * 173 + t * (14 + row * 3)) % (VW + 80)) - 40, y = [70, 96, 392, 412, 470, 520][row] + Math.sin(t * 1.5 + i) * 3;
    const a = 0.5 + Math.sin(t * 2 + i * 1.7) * 0.5; ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(x, y, 9, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 16, y, 9, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  }
  ctx.restore();
  // 島: なみうつ ふちの 大きな 島
  const isle = (pad, wob) => {
    ctx.beginPath();
    const x0 = 28 - pad, x1 = VW - 28 + pad, y0 = 104 - pad, y1 = 384 + pad, n = 64;
    for (let i = 0; i <= n; i++) {
      const u = i / n * Math.PI * 2, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
      const sq = 0.28, cs = Math.cos(u), sn = Math.sin(u);
      const px = cx + rx * Math.sign(cs) * Math.pow(Math.abs(cs), sq), py = cy + ry * Math.sign(sn) * Math.pow(Math.abs(sn), sq);
      const w = Math.sin(u * 7 + W.n) * wob + Math.sin(u * 13) * wob * 0.5;
      ctx.lineTo(px + cs * w, py + sn * w);
    }
    ctx.closePath();
  };
  ctx.save();
  isle(10, 8); ctx.fillStyle = pal.rim; ctx.globalAlpha = 0.9; ctx.fill();
  ctx.globalAlpha = 0.35 + Math.sin(t * 1.2) * 0.1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; isle(16, 8); ctx.stroke();
  ctx.globalAlpha = 1;
  isle(0, 8); const lg = ctx.createLinearGradient(0, 100, 0, 390); lg.addColorStop(0, pal.land[0]); lg.addColorStop(1, pal.land[1]); ctx.fillStyle = lg; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(40,30,60,.35)'; ctx.stroke();
  ctx.restore();
  // かざり(素材集の絵)
  const deco = W.deco || [];
  for (let i = 0; i < 9; i++) { const n = deco[i % deco.length]; if (!n) continue; const x = 70 + i * 104 + (i % 2) * 26, y = i % 2 ? 372 : 150; if (WORLDS[map.wi].nodes.some(nd => Math.abs(nd.x - x) < 46 && Math.abs(nd.y - y) < 60)) continue; drawFit(n, x, y, i % 2 ? 52 : 46, false, 0.75); }
}
// 雲(島の 上を ながれる。かげも 落とす)
function drawMapClouds(t) {
  for (let i = 0; i < 4; i++) {
    const span = VW + 360, x = ((i * 300 + t * (10 + i * 4)) % span) - 180, y = 120 + (i % 3) * 90;
    ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = '#1a1030'; ctx.beginPath(); ctx.ellipse(x + 30, y + 70, 60, 14, 0, 0, 7); ctx.fill(); ctx.restore();
    drawFit('cloud', x, y + 34, 54, false, 0.82);
  }
}
// 道: ビーズの ならんだ 道。ひみつの 道は 金、わかれ道(しんでん・ほしの あな)は 白
function drawRoad(a, b, k, kind) {
  const len = Math.hypot(b.x - a.x, b.y - a.y), ex = a.x + (b.x - a.x) * k, ey = a.y + (b.y - a.y) * k;
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(70,40,20,.55)'; ctx.lineWidth = 22; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.strokeStyle = kind === 'secret' ? '#ffe9a0' : kind === 'side' ? '#e8f0ff' : '#f3d9a0'; ctx.lineWidth = 15; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(ex, ey); ctx.stroke();
  const n = Math.floor(len * k / 22);
  for (let i = 1; i <= n; i++) {
    const u = i * 22 / len; if (u > 0.94) break;
    const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u;
    ctx.fillStyle = kind === 'secret' ? '#ff6b9a' : kind === 'side' ? '#5ac8ff' : '#c0402a'; ctx.beginPath(); ctx.arc(x, y, 4.2, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(x - 1.2, y - 1.4, 1.5, 0, 7); ctx.fill();
  }
  ctx.restore();
}
function drawRoadClosed(a, b) {
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 6; ctx.setLineDash([3, 13]); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore();
}
// マスの 記号: しろ・とりで・おばけやしき・しんでん・ほしの あな・ふつうの 面
function drawNodeIcon(nd, kind, open, clr, t, d) {
  const art = ART['map_' + (kind === 'boss' ? (clr ? 'castle_broken' : 'castle') : kind)];
  ctx.save();
  if (!open) ctx.globalAlpha = 0.55;
  ctx.fillStyle = 'rgba(30,20,60,.35)'; ctx.beginPath(); ctx.ellipse(0, 20, 34, 11, 0, 0, 7); ctx.fill();
  if (art && kind !== 'normal') { ctx.drawImage(art, -40, -58, 80, 80); ctx.restore(); return; }
  ctx.strokeStyle = '#2a1a3a'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
  if (kind === 'boss') {
    // しろ: 2本の 塔と 旗。たおすと くずれる
    const c1 = { 1: '#b0a0d0', 2: '#a8c8e8', 3: '#e0b080', 4: '#8a90b0', 5: '#b07a8a', 6: '#7ab07a', 7: '#9a96c8', 8: '#5a4a7a' }[d.world] || '#a0a0c0';
    if (clr) {
      ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(-26, 18); ctx.lineTo(-24, -6); ctx.lineTo(-14, -2); ctx.lineTo(-8, -14); ctx.lineTo(4, -4); ctx.lineTo(14, -10); ctx.lineTo(26, 0); ctx.lineTo(28, 18); ctx.closePath(); ctx.fill(); ctx.stroke();
      for (let i = 0; i < 4; i++) { ctx.fillStyle = c1; ctx.fillRect(-30 + i * 17, 14 - (i % 2) * 4, 9, 7); ctx.strokeRect(-30 + i * 17, 14 - (i % 2) * 4, 9, 7); }
      ctx.globalAlpha *= 0.5 + Math.sin(t * 2) * 0.2; ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.arc(-4 + Math.sin(t) * 3, -22 - (t * 8) % 14, 6, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = c1; ctx.fillRect(-28, -26, 16, 44); ctx.strokeRect(-28, -26, 16, 44); ctx.fillRect(12, -26, 16, 44); ctx.strokeRect(12, -26, 16, 44);
      ctx.fillRect(-14, -12, 28, 30); ctx.strokeRect(-14, -12, 28, 30);
      ctx.fillStyle = '#3a2440'; rr(-7, 2, 14, 16, 6); ctx.fill();
      for (const sx of [-28, 12]) { ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.moveTo(sx - 2, -26); ctx.lineTo(sx + 8, -42); ctx.lineTo(sx + 18, -26); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.strokeStyle = '#2a1a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(20, -42); ctx.lineTo(20, -56); ctx.stroke();
      ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.moveTo(20, -56); ctx.lineTo(34 + Math.sin(t * 6) * 3, -52); ctx.lineTo(20, -48); ctx.fill();
    }
  } else if (kind === 'fort') {
    ctx.fillStyle = clr ? '#9a8a7a' : '#b09a80'; ctx.fillRect(-16, -22, 32, 40); ctx.strokeRect(-16, -22, 32, 40);
    for (let i = 0; i < 3; i++) { ctx.fillRect(-16 + i * 12, -30, 8, 8); ctx.strokeRect(-16 + i * 12, -30, 8, 8); }
    ctx.fillStyle = '#2a1a1a'; rr(-6, 2, 12, 16, 5); ctx.fill();
    if (clr) { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-10, -12); ctx.lineTo(10, 4); ctx.moveTo(10, -12); ctx.lineTo(-10, 4); ctx.stroke(); }
  } else if (kind === 'ghost') {
    ctx.fillStyle = '#6a4a6a'; ctx.fillRect(-22, -12, 44, 30); ctx.strokeRect(-22, -12, 44, 30);
    ctx.fillStyle = '#3a2a4a'; ctx.beginPath(); ctx.moveTo(-28, -10); ctx.lineTo(0, -36); ctx.lineTo(28, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = `rgba(255,236,140,${0.7 + Math.sin(t * 3) * 0.3})`; ctx.fillRect(-14, -4, 9, 9); ctx.fillRect(6, -4, 9, 9);
    if (!clr) { ctx.globalAlpha *= 0.6 + Math.sin(t * 2) * 0.3; drawFit('ghost', 26 + Math.sin(t * 2) * 4, -18 + Math.sin(t * 3) * 3, 26); }
  } else if (kind === 'switch') {
    const col = PALACE_COL[nd.color] || '#fff', on = save.palace[nd.color];
    ctx.fillStyle = '#e8e0f0'; ctx.fillRect(-24, 4, 48, 14); ctx.strokeRect(-24, 4, 48, 14);
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 4, 20, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (on) { ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(t * 4) * 0.2; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -2, 34, 0, 7); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); for (let a = 0; a < 10; a++) { const r2 = a % 2 ? 4 : 9, an = -Math.PI / 2 + a * Math.PI / 5; ctx.lineTo(Math.cos(an) * r2, -6 + Math.sin(an) * r2); } ctx.closePath(); ctx.fill();
  } else if (kind === 'warp') {
    // ほしの あな: うずまく 穴
    ctx.fillStyle = '#1a0e3a'; ctx.beginPath(); ctx.ellipse(0, 4, 26, 14, 0, 0, 7); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 5; i++) { const a = t * 3 + i * 1.26; ctx.fillStyle = i % 2 ? '#ffe066' : '#c78bff'; ctx.beginPath(); ctx.arc(Math.cos(a) * 16, 4 + Math.sin(a) * 7, 3, 0, 7); ctx.fill(); }
    ctx.save(); ctx.translate(0, -14 + Math.sin(t * 3) * 3); ctx.rotate(t); drawImg('ui_star', -11, -10, 22, 20); ctx.restore();
  } else if (kind === 'secret') {
    const r = 28; ctx.fillStyle = !open ? '#8a86a0' : clr ? '#ffd84a' : '#c78bff';
    ctx.beginPath(); for (let a = 0; a < 10; a++) { const r2 = a % 2 ? r * 0.55 : r * 1.1, an = -Math.PI / 2 + a * Math.PI / 5; ctx.lineTo(Math.cos(an) * r2, Math.sin(an) * r2); } ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    // ふつうの 面: まるい マス。ひみつの ゴールが まだの 面は 赤、クリア済みは 金
    const r = 22, hasSec = d && d.secretGoal && !save.secret[nd.id];
    const nodeArt = ART.map_node;
    if (nodeArt) ctx.drawImage(nodeArt, -r * 1.4, -r * 1.4, r * 2.8, r * 2.8);
    else {
      ctx.fillStyle = !open ? '#8a86a0' : clr ? (hasSec ? '#ff8a5a' : '#ffd84a') : (hasSec ? '#ff4a5a' : '#ff8a3a');
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(-6, -8, 8, 5, -0.5, 0, 7); ctx.fill();
      if (kind === 'water') { ctx.strokeStyle = '#2a7ad8'; ctx.lineWidth = 3; ctx.beginPath(); for (let x = -12; x <= 12; x += 2) ctx.lineTo(x, 4 + Math.sin(x * 0.5 + t * 4) * 3); ctx.stroke(); }
      if (kind === 'sky') { drawFit('cloud', 0, 10, 18); ctx.fillStyle = '#2a1a3a'; ctx.beginPath(); ctx.moveTo(6, -10); ctx.lineTo(14, -6); ctx.lineTo(6, -2); ctx.fill(); }
    }
  }
  ctx.restore();
}
function drawMap(t) {
  const W = WORLDS[map.wi];
  const slide = map.slide > 0 ? (1 - Math.cos(map.slide * Math.PI)) * 0.5 : 0;
  ctx.save();
  if (slide) ctx.translate(slide * 120, 0);
  const art = ART['map_w' + W.n];
  if (art) ctx.drawImage(art, 0, 0, VW, VH); else drawMapBase(W, t);
  // 道
  for (const e of mapEdges(map.wi)) {
    const A = mapNode(map.wi, e.a), B = mapNode(map.wi, e.b), kind = e.ex ? (e.ex.cond === 'secret' || e.ex.warp ? 'secret' : 'side') : 'main';
    if (map.rv && map.rv.e.key === e.key) { drawRoad(A, B, map.rv.k, kind); continue; }
    const open = edgeOpen(map.wi, e) && save.roads && (save.roads[e.key] || !map.reveals.some(r => r.key === e.key));
    if (open) drawRoad(A, B, 1, kind);
    else if (e.main) drawRoadClosed(A, B);
  }
  // となりのワールドへの道
  const lastN = W.nodes[W.nodes.length - 1];
  if (!W.star && WORLDS[map.wi + 1] && !WORLDS[map.wi + 1].star) { if (isCleared(lastN.id)) drawRoad(lastN, { x: VW + 30, y: lastN.y }, 1, 'main'); else drawRoadClosed(lastN, { x: VW + 30, y: lastN.y }); }
  if (map.wi > 0 && !W.star) drawRoad({ x: -30, y: W.nodes[0].y }, W.nodes[0], 1, 'main');
  // マス
  const list = W.nodes.map((n, k) => [n, k]);
  (W.extra || []).forEach((ex, j) => { const k = 'x' + j; const shown = extraOpen(ex) && !(map.rv && String(map.rv.e.b) === k) && !map.reveals.some(r => String(r.b) === k); if (shown) list.push([ex, k]); });
  for (const [n, k] of list) {
    const i = n.id !== undefined ? LV_BY_ID[n.id] : undefined, d = i !== undefined ? LEVELS[i] : null;
    const kind = n.warp || n.back ? 'warp' : n.kind || (d && d.kind) || 'normal';
    const open = nodeOpen(map.wi, k), clr = n.id !== undefined && isCleared(n.id), sel = String(k) === String(map.k) && !map.walk;
    const pop = map.pop && map.pop.x === n.x && map.pop.y === n.y ? 1 + Math.sin((1 - map.pop.t / 0.7) * Math.PI) * 0.35 : 1;
    ctx.save(); ctx.translate(n.x, n.y + (sel ? Math.sin(t * 5) * 2 : 0)); ctx.scale(pop, pop);
    drawNodeIcon(n, kind, open, clr, t, d || {});
    if (d && !open && kind === 'normal') drawFit('key', 0, 14, 26, false, 0.9);
    else if (i !== undefined && needsFull(i) && open) drawFit('chest', 0, 14, 28, false, 0.95);
    ctx.restore();
    const label = n.warp ? 'ほしの あな' : n.back ? 'かえりの あな' : kind === 'switch' ? PALACE_NAME[n.color] + 'の しんでん' : d ? (d.label || (d.kind === 'boss' ? d.world + '-しろ' : d.num === '★' ? '★' : stageLabel(d))) : '';
    outlined(label, n.x, n.y + 36, '#fff', '#2a1a3a', 5, titleFont(kind === 'switch' || n.warp || n.back ? 13 : 16));
    if (clr) {
      // クリアの しるし: 小さな 旗
      ctx.save(); ctx.strokeStyle = '#2a1a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(n.x + 22, n.y - 2); ctx.lineTo(n.x + 22, n.y - 26); ctx.stroke();
      ctx.fillStyle = '#7dff8a'; ctx.beginPath(); ctx.moveTo(n.x + 22, n.y - 26); ctx.lineTo(n.x + 36 + Math.sin(t * 5 + n.x) * 2, n.y - 21); ctx.lineTo(n.x + 22, n.y - 16); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      const st = save.stars[n.id] || []; for (let s2 = 0; s2 < 3; s2++) drawImg('star', n.x - 30 + s2 * 20, n.y - 46, 18, 17, false, st[s2] ? 1 : 0.25);
      if (st.filter(Boolean).length === 3) { ctx.save(); ctx.strokeStyle = `rgba(255,225,77,${0.6 + Math.sin(t * 4) * 0.3})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(n.x, n.y, 30, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
      if (shardCount(n.id) >= 5) drawShardIcon(n.x - 28, n.y + 2, 13, t);
    }
    if (sel && d && d.secretGoal && !save.secret[n.id] && clr) outlined('?', n.x + 30, n.y - 30, '#ff8fd0', '#2a1a3a', 5, titleFont(20));
    uiButtons.push({ x: n.x - 32, y: n.y - 32, w: 64, h: 64, fn: () => mapTap(map.wi, k) });
  }
  drawMapClouds(t);
  // ハルと ピピ
  const walking = !!map.walk;
  const bob = walking ? -Math.abs(Math.sin(t * 14)) * 6 : Math.sin(t * 3) * 1.5;
  const nm = walking ? (Math.floor(t * 9) % 2 ? 'hero_run' : 'hero_idle') : 'hero_idle';
  ctx.save(); ctx.translate(map.hx, map.hy - 6 + bob); ctx.scale(map.face, 1); if (map.nope > 0) ctx.translate(Math.sin(t * 60) * 4, 0); drawFit(nm, 0, 0, 58); ctx.restore();
  drawFit(ART.face_pipi ? 'face_pipi' : 'star', map.hx - map.face * 32 + Math.sin(t * 2) * 4, map.hy - 50 + Math.sin(t * 3) * 6, 26);
  ctx.restore();
  // 上の札
  woodPlate(VW / 2 - 230, 10, 460, 50);
  outlined((W.star ? '' : 'ワールド' + W.n + '  ') + W.name, VW / 2, 36, '#fff', '#3a1a08', 6, titleFont(24));
  for (let i = 0; i < 8; i++) {
    const open2 = nodeOpen(i, 0), x = VW / 2 - 7 * 11 + i * 22, y = 72;
    ctx.beginPath(); ctx.arc(x, y, i === map.wi ? 7 : 5, 0, 7); ctx.fillStyle = i === map.wi ? '#ffd84a' : open2 ? '#ffffff' : 'rgba(255,255,255,.3)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#2a1a3a'; ctx.stroke();
  }
  { const ids = W.nodes.map(n => n.id).concat((W.extra || []).filter(e => e.id !== undefined).map(e => e.id)); const got = ids.reduce((a, id) => a + (save.stars[id] || []).filter(Boolean).length, 0);
    drawImg('ui_star', VW / 2 + 120, 62, 20, 19); outlined(got + '/' + ids.length * 3, VW / 2 + 144, 72, '#ffe14d', '#2a1a3a', 4, titleFont(14), 'left'); }
  const total = totalStars();
  drawImg('ui_star', 16, 16, 30, 28); outlined(`${total}/${LEVELS.filter(d => !d.noStars).length * 3}`, 52, 31, '#ffe14d', '#2a1a3a', 5, titleFont(18), 'left');
  const next = PERKS.find(pk => total < pk.need);
  ctx.textAlign = 'left'; ctx.font = font(13, 800); ctx.fillStyle = '#fff';
  ctx.fillText(next ? `つぎの せいちょう ★${next.need}: ${next.name}` : 'せいちょう コンプリート!', 16, 62);
  drawImg('ui_coin', VW - 130, 16, 28, 28); outlined('×' + save.wallet, VW - 96, 31, '#fff', '#2a1a3a', 5, titleFont(18), 'left');
  // しんでんの スイッチ(おした 色)
  ['y', 'g', 'b', 'p'].forEach((c, i) => { ctx.save(); ctx.globalAlpha = save.palace[c] ? 1 : 0.25; ctx.fillStyle = PALACE_COL[c]; ctx.strokeStyle = '#2a1a3a'; ctx.lineWidth = 2; rr(VW - 130 + i * 26, 50, 20, 16, 5); ctx.fill(); ctx.stroke(); ctx.restore(); });
  // ワールドを かえる矢印
  const canL = map.wi > 0 && !W.star, canR = !W.star && WORLDS[map.wi + 1] && !WORLDS[map.wi + 1].star && nodeOpen(map.wi + 1, 0);
  if (canL) button(10, 240, 46, 60, '◀', () => { if (!map.walk && !map.path.length) map.path = [{ wi: map.wi - 1, last: true }]; }, { size: 22 });
  if (canR) button(VW - 56, 240, 46, 60, '▶', () => { if (!map.walk && !map.path.length) map.path = [{ wi: map.wi + 1 }]; }, { size: 22 });
  // 下の札: えらんでいる マス
  const nd = mapNode(map.wi, map.k), id = nd.id, i = id !== undefined ? LV_BY_ID[id] : undefined, d = i !== undefined ? LEVELS[i] : null;
  rr(VW / 2 - 300, 404, 600, 56, 16); ctx.fillStyle = 'rgba(30,20,60,.72)'; ctx.fill();
  if (d) {
    const kindName = { fort: 'とりで', ghost: 'おばけやしき', switch: 'しんでん', boss: 'しろ', water: 'みずの なか', sky: 'そらの みち' }[d.kind] || '';
    outlined((d.label ? d.label + '  ' : d.kind === 'switch' ? '' : d.num === '★' ? 'ひみつ ' : stageLabel(d) + '  ') + d.name, VW / 2, 424, '#fff', '#2a1a3a', 5, font(22));
    ctx.fillStyle = '#ffe9a8'; ctx.font = font(14, 700); ctx.textAlign = 'center';
    const best = save.best[id], sh = shardCount(id);
    ctx.fillText(!isOpenId(id) ? 'まだ みちが ひらいていない' : needsFull(i) ? '完全版で あそべます' : (kindName ? '[' + kindName + ']  ' : '') + (best ? 'ベスト ' + best : 'はじめての ステージ') + '  かけら ' + sh + '/5' + (d.secretGoal && isCleared(id) && !save.secret[id] ? '  ・ひみつの ゴールが あるらしい…' : ''), VW / 2, 448);
  } else {
    outlined(nd.warp ? 'ほしの あな' : 'かえりの あな', VW / 2, 424, '#fff', '#2a1a3a', 5, font(22));
    ctx.fillStyle = '#ffe9a8'; ctx.font = font(14, 700); ctx.textAlign = 'center';
    ctx.fillText(nd.warp ? 'とびこむと「ほしの みち」へ ワープ!' : 'もとの ワールドへ もどる', VW / 2, 448);
  }
  const ok = d ? canPlay(i) : true, nf = d && needsFull(i) && isOpenId(id);
  button(VW / 2 - 110, 472, 220, 54, ok ? (d ? 'あそぶ!' : 'とびこむ!') : nf ? '完全版を見る' : 'まだ', () => enterNode(), { sel: ok || nf, size: 24 });
  button(VW / 2 + 130, 476, 120, 46, 'おみせ', () => { scene = 'shop'; sfx('select'); }, { size: 20 });
  button(24, 476, 120, 46, 'もどる', () => { scene = 'title'; bgm('bgm_title'); }, { size: 20 });
  if (DEV) button(VW - 200, 76, 186, 30, '(テスト)ぜんぶ ひらく', () => { for (const L2 of LEVELS) save.cleared[L2.id] = true; for (const W2 of WORLDS) for (const e of W2.extra || []) if (e.cond === 'secret') save.secret[e.from] = true; save.full = true; save.starOpen = true; writeSave(); }, { size: 13 });
  if (!usingTouch) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = font(12, 700); ctx.textAlign = 'right'; ctx.fillText('←→↑↓ いどう  Enter あそぶ', VW - 16, 398); }
  if (map.flash > 0) { ctx.fillStyle = `rgba(255,250,220,${map.flash * 1.6})`; ctx.fillRect(0, 0, VW, VH); }
  if (map.saved > 0) { const a = Math.min(1, map.saved * 2); ctx.save(); ctx.globalAlpha = a; rr(VW / 2 - 150, 92, 300, 40, 14); ctx.fillStyle = 'rgba(30,20,60,.8)'; ctx.fill(); outlined('ファイル' + saveSlot + 'に きろくしました', VW / 2, 112, '#7dff8a', '#2a1a3a', 5, font(18)); ctx.restore(); }
  if (map.card > 0) drawWorldCard(W, t);
}
// ワールドの はじめの 一言の 画面
function drawWorldCard(W, t) {
  const a = Math.min(1, map.card * 2.5, (2.6 - map.card) * 4);
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(10,6,24,.86)'; ctx.fillRect(0, 0, VW, VH);
  const k = Math.min(1, (2.6 - map.card) * 3);
  ctx.translate(VW / 2, 230); ctx.scale(0.8 + k * 0.2, 0.8 + k * 0.2);
  outlined(W.star ? 'ほしの みち' : 'ワールド ' + W.n, 0, -40, '#ffe14d', '#2a1a3a', 10, titleFont(40));
  outlined(W.star ? '〜 じょうきゅう コース 〜' : W.name, 0, 20, '#fff', '#2a1a3a', 9, titleFont(48));
  ctx.fillStyle = '#ffe9a8'; ctx.font = font(20, 800); ctx.textAlign = 'center'; ctx.fillText(W.line || '', 0, 84);
  for (let i = 0; i < 7; i++) { const an = t * 0.8 + i * 0.9; drawImg('ui_star', Math.cos(an) * 330 - 10, Math.sin(an) * 120 - 10, 20, 18, false, 0.6); }
  ctx.restore();
}
function drawStory(t) {
  const st = STORY[story.key]; if (!st) return;
  const line = st.lines[story.i]; if (!line) return;
  const sp = SPEAKERS[line[0]] || SPEAKERS.narr;
  const art = st.bg && ART[st.bg];
  if (art) ctx.drawImage(art, 0, 0, VW, VH);
  else { drawBackground(st.theme || 'night', t * 20, t); ctx.fillStyle = 'rgba(10,8,30,.35)'; ctx.fillRect(0, 0, VW, VH); }
  // 仮の一枚絵: 登場する人を 大きく ならべる
  if (!art) {
    const who = [...new Set(st.lines.map(l => l[0]).filter(w => w !== 'narr'))];
    who.forEach((w, i) => {
      const s2 = SPEAKERS[w], x = VW / 2 + (i - (who.length - 1) / 2) * Math.min(260, 800 / Math.max(1, who.length - 1)), talking = w === line[0];
      const img = ART[s2.face] ? s2.face : s2.alt;
      ctx.save(); ctx.globalAlpha = talking ? 1 : 0.55;
      const bob = talking ? Math.sin(t * 6) * 4 : 0;
      if (s2.filter && !ART[s2.face]) ctx.filter = s2.filter;
      drawFit(img, x, 330 + bob, w === 'kabuto' || w === 'queen' ? 120 : w === 'pipi' ? 90 : 170, w === 'kage' ? false : i > 0 && w !== 'pipi');
      ctx.restore();
    });
  }
  // ふきだし
  const bx = 40, by = 360, bw = VW - 80, bh = 150;
  rr(bx, by, bw, bh, 22); ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#2a1a3a'; ctx.stroke();
  let tx = bx + 30;
  if (sp.face || sp.alt) {
    const img = ART[sp.face] ? sp.face : sp.alt;
    rr(bx + 18, by + 18, 112, 112, 18); ctx.fillStyle = sp.col; ctx.fill(); ctx.lineWidth = 4; ctx.stroke();
    ctx.save(); rr(bx + 18, by + 18, 112, 112, 18); ctx.clip(); if (sp.filter && !ART[sp.face]) ctx.filter = sp.filter; drawFit(img, bx + 74, by + 128 + (ART[sp.face] ? 0 : 8), ART[sp.face] ? 110 : 96); ctx.restore();
    tx = bx + 150;
  }
  if (sp.name) { rr(tx - 6, by - 20, 160, 38, 14); ctx.fillStyle = sp.col; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#2a1a3a'; ctx.stroke(); outlined(sp.name, tx + 74, by - 1, '#fff', '#2a1a3a', 5, font(20)); }
  const text = line[1].slice(0, Math.floor(story.shown));
  ctx.fillStyle = '#2a1a3a'; ctx.font = font(24, 800); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  // 折り返し
  const maxW = bx + bw - 30 - tx; let row = '', y = by + 34;
  // 行のはじめに 「。、!?」などが こないように(はみだしても 前の行に つける)。区切りの 空白で 折れるときは そこで 折る
  for (const ch of text) {
    if (ctx.measureText(row + ch).width > maxW && !'。、!?！？)」ー'.includes(ch)) {
      const sp = row.lastIndexOf(' ');
      if (sp > row.length * 0.6) { ctx.fillText(row.slice(0, sp), tx, y); row = row.slice(sp + 1); } else { ctx.fillText(row, tx, y); row = ''; }
      y += 36;
    }
    row += ch;
  }
  ctx.fillText(row, tx, y);
  ctx.textBaseline = 'middle';
  if (story.shown >= line[1].length) { ctx.fillStyle = '#ff7a1f'; ctx.beginPath(); const ay = by + bh - 22 + Math.sin(t * 8) * 3; ctx.moveTo(bx + bw - 40, ay); ctx.lineTo(bx + bw - 24, ay); ctx.lineTo(bx + bw - 32, ay + 10); ctx.fill(); }
  button(VW - 150, 14, 130, 40, 'スキップ', () => storyEnd(), { size: 18 });
}

function drawShop(t) {
  drawBackground('grass', t * 20, t);
  outlined('おみせ', VW / 2, 44, '#fff', '#2a1a3a', 10, titleFont(38));
  drawImg('ui_coin', VW - 220, 22, 34, 34);
  outlined('× ' + save.wallet, VW - 140, 40, '#fff', '#2a1a3a', 6, titleFont(26));
  // 完全版
  woodPlate(40, 80, 400, 380);
  outlined('ハルの冒険 完全版', 240, 118, '#fff36b', '#3a1a08', 7, titleFont(26));
  ctx.fillStyle = '#fff'; ctx.font = font(18, 800); ctx.textAlign = 'center';
  const lines = ['ワールド2〜8・ほしの みちの ' + LEVELS.filter(d => d.world > 1).length + 'ステージが あそべる', 'まおうの城・あらしの城 ほか', 'かいきり(1かいだけ)'];
  lines.forEach((l, i) => ctx.fillText(l, 240, 170 + i * 32));
  drawFit('wizard', 165, 340, 64); drawFit('goal', 315, 340, 78);
  if (save.full) outlined('こうにゅうずみ', 240, 382, '#7dff8a', '#3a1a08', 6, font(26));
  else button(110, 352, 260, 56, '完全版を かう ' + FULL_PRICE, () => Store.buyFull(), { sel: true, size: 22 });
  button(150, 414, 180, 38, 'こうにゅうを ふくげん', () => Store.restore(), { size: 15 });
  if (DEV && !save.full) button(40, 470, 180, 40, '(テスト)完全版にする', () => Store.unlock(), { size: 14 });
  // コインで買う道具(つぎのステージで使う)
  woodPlate(470, 80, 450, 380);
  outlined('つぎのステージで つかう', 695, 112, '#fff', '#3a1a08', 6, font(22));
  SHOP_ITEMS.forEach((it, i) => {
    const y = 140 + i * 78;
    drawFit(it.img, 515, y + 56, 46);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = font(20, 800); ctx.fillText(it.name, 552, y + 26);
    ctx.font = font(14, 700); ctx.fillStyle = '#ffe9c8'; ctx.fillText(it.desc, 552, y + 50);
    const have = save.bag[it.key] || 0;
    if (have) { ctx.fillStyle = '#7dff8a'; ctx.font = font(15, 800); ctx.fillText('もっている ×' + have, 552, y + 70); }
    const ok = save.wallet >= it.price && have < 3;
    button(790, y + 12, 112, 42, it.price + 'コイン', () => {
      if (save.wallet < it.price) { shopMsg = { text: 'コインが たりません', t: 2 }; sfx('bump'); return; }
      if ((save.bag[it.key] || 0) >= 3) { shopMsg = { text: 'もう もてません(3こまで)', t: 2 }; return; }
      save.wallet -= it.price; save.bag[it.key] = (save.bag[it.key] || 0) + 1; writeSave(); sfx('coins');
    }, { sel: ok, size: 17 });
  });
  button(24, 476, 120, 44, 'もどる', () => goMap(), { size: 20 });
  if (shopMsg) {
    shopMsg.t -= 1 / 60;
    if (shopMsg.t <= 0) shopMsg = null;
    else { rr(VW / 2 - 260, 230, 520, shopMsg.sub ? 90 : 60, 18); ctx.fillStyle = 'rgba(30,20,60,.9)'; ctx.fill(); outlined(shopMsg.text, VW / 2, 262, '#fff', '#2a1a3a', 6, font(26)); if (shopMsg.sub) { ctx.fillStyle = '#ffe9a8'; ctx.font = font(17, 700); ctx.textAlign = 'center'; ctx.fillText(shopMsg.sub, VW / 2, 300); } }
  }
}
// ---------- セーブの ファイル(3つ) ----------
const files = { sel: 0, del: null };
function openFiles() { sfx('select'); scene = 'files'; titleT = 0; files.sel = Math.max(0, Math.min(2, saveSlot - 1)); files.del = null; }
function chooseFile(n) {
  selectSlot(n); sfx('select');
  if (!save.seen.intro) startGame(); else goMap();
}
function deleteFile(n) {
  if (!files.del || files.del.n !== n || files.del.t <= 0) { files.del = { n, t: 3 }; sfx('bump'); return; }
  try { localStorage.removeItem(slotKey(n)); } catch (e) { /* 無視 */ }
  files.del = null; sfx('break');
  if (n === saveSlot) selectSlot(n);
}
function drawFiles(t) {
  if (ART.title_bg) ctx.drawImage(ART.title_bg, 0, 0, VW, VH); else drawBackground('grass', t * 30, t);
  ctx.fillStyle = 'rgba(15,10,35,.35)'; ctx.fillRect(0, 0, VW, VH);
  outlined('ファイルを えらんでね', VW / 2, 56, '#fff', '#2a1a3a', 9, titleFont(36));
  for (let i = 0; i < 3; i++) {
    const n = i + 1, info = slotInfo(n), x = 50 + i * 296, y = 100, w = 268, h = 330, sel = files.sel === i;
    ctx.save();
    if (sel) { ctx.translate(x + w / 2, y + h / 2); ctx.scale(1.03, 1.03); ctx.translate(-x - w / 2, -y - h / 2); }
    if (ART.file_card) ctx.drawImage(ART.file_card, x, y, w, h); else woodPlate(x, y, w, h);
    if (sel) { ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 5; rr(x - 4, y - 4, w + 8, h + 8, 14); ctx.stroke(); }
    outlined('ファイル ' + n, x + w / 2, y + 34, '#fff36b', '#3a1a08', 6, titleFont(26));
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    if (!info) {
      ctx.font = font(20, 800); ctx.fillText('あたらしく はじめる', x + w / 2, y + 150);
      drawFit('hero_idle', x + w / 2, y + 260, 80, false, 0.8);
    } else {
      ctx.font = font(18, 800);
      drawImg('ui_star', x + 30, y + 70, 28, 26); ctx.textAlign = 'left'; ctx.fillText(info.stars + ' / ' + LEVELS.length * 3, x + 66, y + 90);
      drawShardIcon(x + 44, y + 122, 13, t); ctx.fillText(info.shards + ' / ' + LEVELS.length * 5, x + 66, y + 130);
      drawImg('ui_coin', x + 30, y + 146, 28, 28); ctx.fillText('×' + info.wallet, x + 66, y + 168);
      ctx.fillText('クリア ' + info.cl + ' / ' + LEVELS.length, x + 30, y + 206);
      ctx.textAlign = 'center'; ctx.font = font(15, 800); ctx.fillStyle = '#ffe9a8';
      ctx.fillText(info.world.star ? 'ほしの みち' : 'ワールド' + info.world.n + ' ' + info.world.name, x + w / 2, y + 240);
      ['y', 'g', 'b', 'p'].forEach((c, k) => { ctx.save(); ctx.globalAlpha = info.palace[c] ? 1 : 0.22; ctx.fillStyle = PALACE_COL[c]; ctx.strokeStyle = '#2a1a3a'; ctx.lineWidth = 2; rr(x + w / 2 - 52 + k * 27, y + 256, 22, 16, 5); ctx.fill(); ctx.stroke(); ctx.restore(); });
    }
    ctx.restore();
    uiButtons.push({ x, y, w, h: h - 40, fn: () => { files.sel = i; chooseFile(n); } });
    if (info) button(x + w / 2 - 60, y + h - 44, 120, 34, files.del && files.del.n === n && files.del.t > 0 ? 'ほんとうに けす?' : 'けす', () => deleteFile(n), { size: 14 });
  }
  button(24, 470, 120, 46, 'もどる', () => { scene = 'title'; }, { size: 20 });
  if (!usingTouch) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = font(14, 700); ctx.textAlign = 'center'; ctx.fillText('←→ えらぶ   Enter きめる', VW / 2, 470); }
}
function drawPause() {
  ctx.fillStyle = 'rgba(15,10,35,.6)'; ctx.fillRect(0, 0, VW, VH);
  woodPlate(VW / 2 - 200, 90, 400, 370);
  outlined('いちじていし', VW / 2, 138, '#fff', '#3a1a08', 8, titleFont(36));
  PAUSE_ITEMS.forEach((it, i) => {
    const label = typeof it.label === 'function' ? it.label() : it.label;
    button(VW / 2 - 150, 180 + i * 66, 300, 52, label, () => { pauseSel = i; it.fn(); }, { sel: i === pauseSel, size: 24 });
  });
}

function drawClear(t) {
  ctx.fillStyle = 'rgba(15,10,35,.5)'; ctx.fillRect(0, 0, VW, VH);
  const k = Math.min(1, (world.clearT - 3.4) * 4);
  const pop = 1 + Math.sin(Math.min(1, (world.clearT - 3.4) * 3) * Math.PI) * 0.06;
  ctx.save(); ctx.translate(VW / 2, VH / 2); ctx.scale((0.7 + k * 0.3) * pop, (0.7 + k * 0.3) * pop); ctx.translate(-VW / 2, -VH / 2);
  ctx.globalAlpha = Math.max(0, k);
  // 後ろで回る光
  ctx.save(); ctx.translate(VW / 2, 190); ctx.rotate(t * 0.6);
  for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.fillStyle = 'rgba(255,230,120,.10)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40, -420); ctx.lineTo(40, -420); ctx.fill(); }
  ctx.restore();
  woodPlate(VW / 2 - 270, 50, 540, 440);
  outlined('ステージクリア!', VW / 2, 100, '#fff36b', '#3a1a08', 10, titleFont(46));
  for (let i = 0; i < 3; i++) {
    const got = world.stars[i];
    const since = world.clearT - (3.8 + i * 0.4);
    const appear = since < 0 ? 0 : Math.min(1.25, since * 6) - Math.max(0, Math.min(0.25, (since - 0.2) * 2));
    ctx.save(); ctx.translate(VW / 2 - 100 + i * 100, 185); ctx.scale(appear, appear); ctx.rotate(got ? Math.sin(t * 3 + i) * 0.08 : 0);
    if (got) { ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = 26; }
    if (!got) ctx.filter = 'grayscale(1) brightness(0.45)';
    drawImg('star', -40, -38, 80, 76, false, got ? 1 : 0.5);
    ctx.filter = 'none';
    ctx.restore();
  }
  ctx.fillStyle = '#fff'; ctx.font = font(21, 800);
  const rows = [['コイン', Math.floor(world.shownCoins || 0) + 'まい'], ['タイム', Math.floor(world.time) + 'びょう'], ['のこりハート', '+' + clearInfo.heartBonus], ['タイムボーナス', '+' + clearInfo.timeBonus],
    ['ゴールテープ', clearInfo.tape ? (clearInfo.tape.top ? 'てっぺん! ' : '') + '+' + clearInfo.tape.pts : clearInfo.palace ? 'スイッチ!' : '—']];
  rows.forEach(([a, b], i) => { ctx.textAlign = 'left'; ctx.fillText(a, VW / 2 - 210, 262 + i * 27); ctx.textAlign = 'right'; ctx.fillText(b, VW / 2 + 210, 262 + i * 27); });
  // かけら
  for (let i = 0; i < 5; i++) { ctx.save(); if (!world.shards[i]) ctx.globalAlpha = 0.3; drawShardIcon(VW / 2 - 52 + i * 26, 238, 10, t, !world.shards[i]); ctx.restore(); }
  const sc = Math.floor(world.shownScore || 0);
  const done = sc >= world.score;
  ctx.save(); ctx.translate(VW / 2, 408); if (done) ctx.scale(1 + Math.sin(t * 6) * 0.03, 1 + Math.sin(t * 6) * 0.03);
  outlined('スコア ' + sc, 0, 0, done ? '#fff36b' : '#ffffff', '#3a1a08', 7, titleFont(34));
  ctx.restore();
  if (clearInfo.secret && world.clearT > 4.2) { ctx.save(); ctx.translate(VW / 2, 136); ctx.scale(1 + Math.sin(t * 5) * 0.05, 1 + Math.sin(t * 5) * 0.05); outlined(clearInfo.secretNew ? 'ひみつの ゴール! かくれた みちが ひらいた!' : 'ひみつの ゴール!', 0, 0, '#e6b8ff', '#3a1a08', 6, font(20)); ctx.restore(); }
  if (clearInfo.newPerk && world.clearT > 5) { ctx.save(); ctx.translate(VW / 2, 446); ctx.scale(1 + Math.sin(t * 5) * 0.04, 1 + Math.sin(t * 5) * 0.04); outlined('せいちょう! ' + clearInfo.newPerk.name + '(' + clearInfo.newPerk.desc + ')', 0, 0, '#7dff8a', '#3a1a08', 6, font(19)); ctx.restore(); }
  const best = save.best[world.def.id];
  if (done && best === world.score) { ctx.save(); ctx.translate(VW / 2 + 200, 430); ctx.rotate(-0.12); outlined('ベスト こうしん!', 0, 0, '#ff8fb0', '#3a1a08', 5, font(17)); ctx.restore(); }
  ctx.restore();
  if (world.clearT > 4.4) {
    button(VW / 2 + 10, 456, 240, 54, 'ちずへ すすむ', nextFromClear, { sel: true, size: 24 });
    button(VW / 2 - 250, 456, 240, 54, 'もういちど', () => startLevel(world.idx), { size: 24 });
  }
}

function drawEnding(t) {
  drawBackground('sky', t * 40, t);
  outlined('ぜんぶクリア!', VW / 2, 110, '#fff36b', '#2a1a3a', 14, titleFont(70));
  const total = Object.values(save.stars).reduce((s, a) => s + a.filter(Boolean).length, 0);
  outlined(`あつめた ほし ${total} / ${LEVELS.length * 3}`, VW / 2, 190, '#fff', '#2a1a3a', 7, font(30));
  drawFit('hero_jump', VW / 2, 380 - Math.abs(Math.sin(t * 3)) * 40, 110);
  for (let i = 0; i < 5; i++) drawFit('star', VW / 2 + Math.cos(t + i * 1.26) * 200, 320 + Math.sin(t + i * 1.26) * 60, 44);
  outlined('ほしの ランプが もとに もどった!  おしまい', VW / 2, 236, '#ffe9a8', '#2a1a3a', 6, font(22));
  outlined('あそんでくれて ありがとう!', VW / 2, 440, '#fff', '#2a1a3a', 6, font(26));
  if (t > 2) button(VW / 2 - 120, 470, 240, 52, 'ステージをえらぶ', goSelect, { sel: true, size: 22 });
}

function drawLoading() {
  ctx.fillStyle = '#1b1f3a'; ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = '#fff'; ctx.font = font(24); ctx.textAlign = 'center';
  ctx.fillText('よみこみちゅう… ' + Math.floor(loaded / total * 100) + '%', VW / 2, VH / 2);
}

let last = performance.now();
let acc = 0;
let t0 = 0;
function frame(now) {
  const real = Math.min(0.05, (now - last) / 1000);
  last = now;
  t0 += real;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  uiButtons = [];
  if (loaded < total || !TB.groundTop) { drawLoading(); requestAnimationFrame(frame); return; }
  acc += real;
  const STEP = 1 / 120;
  while (acc >= STEP) { update(STEP); acc -= STEP; }
  if (scene === 'title') drawTitle(titleT);
  else if (scene === 'map') drawMap(titleT);
  else if (scene === 'story') drawStory(titleT);
  else if (scene === 'ending') drawEnding(titleT);
  else if (scene === 'shop') drawShop(titleT);
  else if (scene === 'files') drawFiles(titleT);
  else { drawPlay(t0); if (scene === 'pause') drawPause(); if (scene === 'clear') drawClear(t0); }
  if (usingTouch && innerHeight > innerWidth * 1.1) {
    // スマホを縦に持っているときは横向きをすすめる
    ctx.fillStyle = 'rgba(20,15,40,.88)'; ctx.fillRect(0, 0, VW, VH);
    drawFit('hero_idle', VW / 2, VH / 2 - 10, 120);
    outlined('よこむきにしてね', VW / 2, VH / 2 + 50, '#fff', '#2a1a3a', 8, titleFont(44));
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// 最初の操作で音を出せるようにする
const firstGesture = () => { initAudio(); if (scene === 'title') bgm('bgm_title'); removeEventListener('pointerdown', firstGesture); removeEventListener('keydown', firstGesture); };
addEventListener('pointerdown', firstGesture);
addEventListener('keydown', firstGesture);
document.addEventListener('visibilitychange', () => { if (document.hidden && scene === 'play') { scene = 'pause'; pauseSel = 0; if (bgmEl) bgmEl.pause(); } });
// 試験用: 画面の外から状態を読めるようにする
window.__game = {
  get scene() { return scene; }, get P() { return P; }, get world() { return world; }, get level() { return level; }, get save() { return save; }, get cam() { return cam; },
  startLevel, LEVELS, keys, pressed, WORLDS, BOSS_TYPES,
  goMap, playStory, get map() { return map; },
  toast(v) { toast = v; },
  get clearInfo() { return clearInfo; },
  // 試験用: 中の 関数
  fns: { openFiles: () => openFiles(), spawn, dropReserve, stashReserve, mountRide, mountOff, goalTape, nodeOpen, extraOpen, mapStep, enterNode, mapEdges, whereIs, isOpenId, queueReveals, updateMap, isSolid, tileAt, collect, levelClear, totalStars, shardCount: id => shardCount(id), hurtPlayer, pressSilver, selectSlot: n => selectSlot(n) },
  reloadSave() { try { save = Object.assign({ unlocked: 1, stars: {}, best: {}, sound: true, wallet: 0, full: false, bag: {}, cleared: {}, secret: {}, seen: {} }, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* 無視 */ } },
  toggle() { const p = P; toggleSwitch(Math.floor((p.x + p.w / 2) / TILE), Math.floor(p.y / TILE) - 1); },
  lightUp() { lightUp(0, 0); },
  hurt() { P.inv = 0; P.powers = []; P.shield = false; hurtPlayer(P.x + 100); },
  // 試験用: 描かずに時間だけ進める・状態を写して戻す
  step(n) { for (let i = 0; i < n; i++) update(1 / 120); },
  snapshot() { const { def, ...rest } = world; return structuredClone({ w: rest, P: { ...P, standOn: null }, tiles: level.tiles, scene }); },
  restore(snap) { const c = structuredClone(snap); world = { ...c.w, def: level.def }; P = c.P; level.tiles = c.tiles; scene = c.scene; parts = []; toast = null; },
};
