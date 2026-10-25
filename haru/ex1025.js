// ハルの冒険 2026-10-25 朝(持ち主「1up が 多すぎて 簡単すぎる。水の ステージは 上で ジャンプすると 水を 泳ぐ 必要が 無い」)
// 1) 1UP を へらす: 面の みどりキノコは 1面に 0〜1こ(とりにくい 所の 1こを のこす。つよい敵の おりは ハートに。章の さいしょの 面と しろ・とりでは おりの キノコを のこす)、
//    ひみつの へやは 1こ・ひみつの 面(✦)は 2こ。大きな かけら 5まいの 1UP は その面で はじめて そろえた 時だけ。コインの 1UP は 1面で 200まい(いのちの ほしで 160)。
//    のこりの 上限は 25(前は 99)。ファイルを ひらいた 時に 5より 少なければ 5 に(ゲームオーバーの 画面で やめても 0 で はじまらない)。
// 2) 水の 面: 水の 中の 面(オアシスの みずうみ・たきつぼの なか)と みずの神殿 は 画面の 上の そとを 天井に する(水面の 上を はねて 先へ 行けない)。
//    面の 形は levels.js(S.deep を 0行まで 水・S.water の くぐる かべ・S.tide の かべと しお)。
// game.js の 関数を つつむ 形(ex1024.js と 同じ)。課金・店の コードには さわらない。
'use strict';

const X25_LIVES_MAX = 25;
const X25_COIN_STEP = 200, X25_COIN_STEP_PERK = 160;
// 画面の 上の そとを 天井に する 面(0行目が 水か 石の 列だけ)
const X25_CAP_TOP = new Set([6, 57, 60, 71, 84]);  // 71・84(10/25 夕): しおの くぐる かべの 上を 画面の 上の そとから こえない

// ---------------- 水の 面の 天井 ----------------
{
  const _ta = tileAt;
  tileAt = function (tx, ty) {
    if (ty < 0 && level && level.def && X25_CAP_TOP.has(level.def.id) && tx >= 0 && tx < level.W) {
      const c = level.tiles[0][tx];
      return c === 'W' || c === 'S' ? 'S' : ' ';
    }
    return _ta(tx, ty);
  };
}

// ---------------- 面の 1UP(みどりキノコ u)を へらす ----------------
// 章の さいしょの 面と、むずかしい 面(しろ=ボス・とりで)は おりの キノコを のこす
function x25KeepCageLevel(def) { return String(def.num) === '1' || !!def.boss || def.kind === 'fort' || def.num === 'しろ' || def.num === 'とりで'; }
function x25ThinOneUps(lv) {
  const def = lv.def;
  if (!def || def.daily || def.tutorial || def.roam) return;
  const ents = lv.ents;
  const us = ents.filter(e => e.kind === 'u');
  if (!us.length) return;
  const gates = ents.filter(e => e.kind === 'hazard' && e.type === 'f7_gate');
  const goals = ents.filter(e => e.kind === '$');
  const isCage = u => gates.some(g => u.x - g.x >= 1 && u.x - g.x <= 5);
  const isRoom = u => goals.some(g => g.x - u.x >= 0 && g.x - u.x <= 5);
  if (def.num === '✦') {
    // ひみつの 面: ちずの 説明どおり 2こ(はじめの 2こ)。のこりは コイン
    us.sort((a, b) => a.x - b.x).slice(2).forEach(u => { u.kind = 'o'; });
    return;
  }
  const main = us.filter(u => !isCage(u) && !isRoom(u));
  const cages = us.filter(isCage);
  // 道の 上の キノコは 1こだけ(いちばん 高い=とりにくい 所。同じ 高さなら 右=おくの 方)
  main.sort((a, b) => (a.y - b.y) || (b.x - a.x));
  main.slice(1).forEach(u => { u.kind = 'o'; });
  // つよい敵の おりの キノコは ハートに(つよい敵の ごほうびは コイン・いのちの かけら・ハート)。
  // 章の さいしょの 面と しろ・とりでで 道の キノコが 無い ときは 1つめの おりの キノコを のこす
  cages.sort((a, b) => a.x - b.x);
  const keepCage = !main.length && x25KeepCageLevel(def) ? cages[0] : null;
  for (const u of cages) if (u !== keepCage) u.kind = 'h';
}
{
  const _bl = buildLevel;
  buildLevel = function (def) {
    const lv = _bl(def);
    try { x25ThinOneUps(lv); } catch (e) { try { console.error('[haru] x25 thin', e); } catch (e2) { /* 無視 */ } }
    return lv;
  };
}

// ---------------- のこり(残機) ----------------
{
  const _lives = lives;
  lives = function () { return Math.min(X25_LIVES_MAX, _lives()); };
  coinLifeStep = function () { return perkOn(2) ? X25_COIN_STEP_PERK : X25_COIN_STEP; };
  try { PERKS[2].desc = 'コイン ' + X25_COIN_STEP_PERK + 'まいで 1UP(ふつうは ' + X25_COIN_STEP + 'まい)'; } catch (e) { /* 無視 */ }
  const _lu = lifeUp;
  lifeUp = function (x, y, why) {
    if (livesOn() && world && world.def) {
      // かけら 5まいの 1UP は その面で はじめて そろえた 時だけ(2回目からは コイン 10まい)
      if (why === 'shard') {
        const prev = (save.shards || {})[world.def.id];
        if (prev && prev.filter(Boolean).length >= 5) {
          world.x25ShardAgain = true; world.coins += 10; world.score += 1000; sfx('coins');
          popText(x, y - 20, 'コイン +10', '#ffe066');
          return;
        }
      }
      // 上限: これ いじょう ふえない(ふえた かわりに 点)
      if (lives() >= X25_LIVES_MAX) {
        save.lives = X25_LIVES_MAX; writeSave();
        world.score += 5000; sfx('oneup'); world.lifePop = 0.6;
        popText(x, y - 20, 'のこり MAX  +5000', '#7dff8a');
        return;
      }
    }
    _lu(x, y, why);
    if (save && save.lives > X25_LIVES_MAX) { save.lives = X25_LIVES_MAX; writeSave(); }
  };
  const fixLives = () => {
    if (!save) return;
    if (!Number.isFinite(save.lives) || save.lives < LIVES0) save.lives = LIVES0;
    if (save.lives > X25_LIVES_MAX) save.lives = X25_LIVES_MAX;
  };
  const _ss = selectSlot;
  selectSlot = function (n) { _ss(n); fixLives(); writeSave(); };
  try { fixLives(); } catch (e) { /* 無視 */ }
  const _up = update;
  update = function (dt) {
    _up(dt);
    if (world && world.x25ShardAgain && toast && toast.sub === 'のこりが 1つ ふえた(1UP)') { toast.sub = '1UP は はじめて そろえた ときだけ。コイン +10'; world.x25ShardAgain = false; }
    if (save && save.lives > X25_LIVES_MAX) save.lives = X25_LIVES_MAX;
  };
}

if (typeof EN_DICT !== 'undefined') Object.assign(EN_DICT, {
  ['コイン ' + X25_COIN_STEP_PERK + 'まいで 1UP(ふつうは ' + X25_COIN_STEP + 'まい)']: '1UP every ' + X25_COIN_STEP_PERK + ' coins (normally ' + X25_COIN_STEP + ')',
  'コイン +10': 'Coins +10',
  '1UP は はじめて そろえた ときだけ。コイン +10': 'The 1UP is only for the first full set. Coins +10',
  'のこり MAX  +5000': 'Lives MAX  +5000',
  'みずの 中の かべは 下を くぐろう': 'Dive under the walls in the water',
});
