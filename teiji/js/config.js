/* 定時で帰さない — バランスと素材の設定はすべてここ。
   社員の顔シートを差し替えるときは EMPLOYEES の sheet を1行変える
   (tools/build_assets.py の FACE_SHEETS に足して切り出したフォルダ名)。 */
(function (root) {
  const CFG = {
    version: 1,
    saveKey: 'teiji_save_v1',
    url: 'https://yurustudio.github.io/teiji/',
    hashtag: '定時で帰さない',

    // ---- 時計 ----
    clock: {
      startMin: 0,          // 18:00 を 0 とした分
      minPerSec: 2.2,       // 実時間1秒あたりのゲーム内の分(24:00≒2分44秒・5:00≒5分・9:00≒6分49秒)
      lastTrainMin: 360,    // 24:00 終電
      sunriseMin: 660,      // 5:00 朝日
      endMin: 900,          // 9:00 翌日の始業
      whiteUntilMin: 60,    // 19:00 未満で帰せばホワイト
    },

    // ---- 売上 ----
    tapBase: 100,           // 1タップの基本額(円)
    costGrowth: 1.15,       // 買うたびに値段 ×1.15
    offlineMaxSec: 8 * 3600,
    offlineRate: 1.0,
    sleepPenalty: 0.85,     // 机で寝ている社員1人につき全体 ×0.85

    // 強化。type: tap=タップ額+% / auto=自動で稼ぐ(円/秒) / idle=自動の稼ぎ+% / all=全体+%
    UPGRADES: [
      { id: 'coffee',    icon: 'coffee',    type: 'tap',  value: 0.5,   cost: 1200 },
      { id: 'energy',    icon: 'energy',    type: 'tap',  value: 1.5,   cost: 8000 },
      { id: 'manager',   icon: 'manager',   type: 'auto', value: 400,   cost: 20000 },
      { id: 'timecard',  icon: 'timecard',  type: 'idle', value: 1.0,   cost: 120000,  growth: 3 },
      { id: 'chat',      icon: 'chat',      type: 'tap',  value: 5.0,   cost: 300000 },
      { id: 'naproom',   icon: 'naproom',   type: 'auto', value: 8000,  cost: 800000 },
      { id: 'meeting',   icon: 'meeting',   type: 'all',  value: 0.5,   cost: 4000000, growth: 3 },
      { id: 'paidleave', icon: 'paidleave', type: 'auto', value: 120000, cost: 12000000 },
      { id: 'poster',    icon: 'poster',    type: 'tap',  value: 30.0,  cost: 60000000 },
      { id: 'chorei',    icon: 'chorei',    type: 'idle', value: 2.0,   cost: 250000000, growth: 3 },
      { id: 'papers',    icon: 'papers',    type: 'auto', value: 1500000, cost: 1000000000 },
      { id: 'lasttrain', icon: 'lasttrain', type: 'all',  value: 1.0,   cost: 4000000000, growth: 3, needMin: 360 },
      { id: 'deadline',  icon: 'deadline',  type: 'auto', value: 3.0e7, cost: 3.0e10 },
      { id: 'ai',        icon: 'ai',        type: 'all',  value: 10.0,  cost: 2.0e11, growth: 10, max: 3, sendsHome: true },
    ],

    // ---- 疲れ(0〜100) ----
    fatigue: {
      basePerSec: 0.04,     // 何もしなくても夜は疲れる
      perLogPerSec: 0.032,  // 稼ぐ勢い(円/秒の桁数)1桁ごとに上乗せ。売上が上がるほど疲れる
      perTap: 0.05,         // タップされた社員に
      stages: 10,
    },

    // ---- 出来事 ----
    events: { minSec: 30, maxSec: 60, firstSec: 22 },

    // ---- 称号と翌日のボーナス(morale は士気の永続 +倍率、startFatigue は翌日の疲れの持ち越し、fatigueMul は翌日の疲れやすさ) ----
    TITLES: {
      nothing: { morale: 0.05, startFatigue: 0,  fatigueMul: 1.0 },
      white:   { morale: 1.0,  startFatigue: 0,  fatigueMul: 0.8 },
      normal:  { morale: 0.3,  startFatigue: 0,  fatigueMul: 1.0 },
      gray:    { morale: 0.25, startFatigue: 5,  fatigueMul: 1.0 },
      black:   { morale: 0.3,  startFatigue: 15, fatigueMul: 1.0 },
      legend:  { morale: 0.4,  startFatigue: 25, fatigueMul: 1.0 },
    },
    achievementMorale: 0.02, // 実績1つにつき 士気 +2%

    // 売上の節目(トースト)
    MILESTONES: [1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13],

    // ---- 社員(顔の10段階シート) ----
    // 顔のシートは tools/build_assets.py の FACE_SHEETS で切り出したフォルダ。filter/flip は使わない時 'none'/false。
    EMPLOYEES: [
      { id: 'e0', sheet: 'img/emp/boy/',    filter: 'none', flip: false, toughness: 1.12 },
      { id: 'e1', sheet: 'img/emp/bun/',    filter: 'none', flip: false, toughness: 1.0 },
      { id: 'e2', sheet: 'img/emp/purple/', filter: 'none', flip: false, toughness: 0.9 },
      { id: 'e3', sheet: 'img/emp/gray/',   filter: 'none', flip: false, toughness: 1.05 },
    ],
    // 顔の段階ごとの見せ方(切り出し画像のどこを中心に見せるか)
    STAGE_FOCUS_Y: [46, 46, 46, 46, 46, 46, 46, 48, 46, 80],

    SOUNDS: {
      tap: ['snd/tap1.mp3', 'snd/tap2.mp3', 'snd/tap3.mp3'],
      buy: 'snd/buy.mp3', toast: 'snd/toast.mp3', event: 'snd/event.mp3', error: 'snd/error.mp3',
      home: 'snd/home.mp3', unit: 'snd/unit.mp3', title: 'snd/title.mp3', pop: 'snd/pop.mp3',
    },
  };
  root.CFG = CFG;
  if (typeof module !== 'undefined') module.exports = CFG;
})(typeof window !== 'undefined' ? window : globalThis);
