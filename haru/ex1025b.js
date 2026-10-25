// ハルの冒険 2026-10-25 昼(持ち主「ボスを 倒した 後も 前のような やりとりを」「運ぶ しかけは 待ち時間が 多い・着いた 時に こっちに 来てない」
//                          「最後の ボスだけは やりとりの ボリュームを 増やして。ストーリー的な 問題で」)
// 1) ボスを たおした あと: ハルの ひとこと だけ → 戦う 前と 同じ 会話の 画面で ボスと ハルの やりとり(はじめて 2〜4行、2回目から 2行で 自分で すすむ、スキップ できる)。
//    さいごの ボス(かげの おう)は 戦う 前 10行・たおした あと 12行。たおした あとの 会話を さいごまで 読んだら、同じ 中身の 幕間 post44 は とばす(スキップ したら 幕間で 読める)。
// 2) 運ぶ しかけ:
//    ゴンドラ・せんろの 足場 … ずっと 行き来 → ハルの いる がわの 駅で まって、のると 動きだす(来る ときは はやく、のって いる ときは 気持ちよい 速さ)。
//    はこびどり … とぶ 190→250、もどる 260→480。
//    ふうせん … のぼる 95→140、ながれる 150→210。とちゅうで 落ちたら すぐ われて 1.2びょうで もとの 場所に。
//    いかだ … すすむ 110→150、もどるまで 1.5→0.8びょう、もどる 220→380。
// game.js・ex1024.js の 関数を つつむ 形(ex1024.js の M24_BOSS と ボスの 絵の 一覧には さわらない)。
'use strict';

// ======================================================================
// ボスを たおした あとの 会話
// ======================================================================
// [だれ, 日本語, English]。first=はじめて / again=2回目から
const BOSS_WIN = {
  46: { first: [
    ['slime', 'ぷしゅう〜…。もう ぴょんぴょん できないもんね…。', 'Pfshhh... I can\'t bounce anymore...'],
    ['haru', 'だいじょうぶ? けがは ない?', 'Are you okay? Not hurt?'],
    ['slime', 'おなかが すいた だけ…。かけら、ぜんぜん あまく なかったもんね。', 'Just hungry... The shard wasn\'t even sweet.'],
    ['haru', 'じゃあ あとで、おいしい もの いっしょに たべよう!', 'Then let\'s eat something yummy together later!'],
  ], again: [
    ['slime', 'ぷしゅう…。また まけたもんね…。', 'Pfshhh... I lost again...'],
    ['haru', 'また あとで おにぎりね!', 'Rice balls later, okay?'],
  ] },
  8: { first: [
    ['maou', 'ぐぬぬ…! い、いまのは れんしゅうだ! ほんきでは ない!', 'Grr...! Th-that was just practice! I wasn\'t trying!'],
    ['haru', 'じゃあ かけら、かえして くれる?', 'Then will you give back the shard?'],
    ['maou', '…ひとつ だけだぞ! つぎは まけんからな!', '...Just one! I won\'t lose next time!'],
    ['haru', '(まおう、ランプを ずっと ぎゅっと にぎってる…。)', '(He\'s still holding his lantern so tightly...)'],
  ], again: [
    ['maou', 'ぐぬぬ…また まけた! おぼえていろ!', 'Grr... I lost again! Remember this!'],
    ['haru', 'うん、ちゃんと おぼえてるよ。', 'Sure, I\'ll remember.'],
  ] },
  12: { first: [
    ['maou', '……う…。あたまが いたい…。ここは…?', '...Ugh... My head hurts... Where am I...?'],
    ['haru', 'まおう! もとに もどったんだね!', 'Night Lord! You\'re back to normal!'],
    ['maou', 'ハル…か。わたしの せいで、すまなかった…。', 'Haru... I\'m so sorry for all this...'],
    ['haru', 'いいよ。たすけに きて よかった!', 'It\'s okay. I\'m glad I came to help!'],
  ], again: [
    ['maou', '……また せわを かけたな。すまない。', '...I troubled you again. I\'m sorry.'],
    ['haru', 'きに しないで!', 'Don\'t worry about it!'],
  ] },
  58: { first: [
    ['karakara', 'カ、カラ…。わがはいの ダンスが やぶれるとは…。', 'Cl-clack... My dance, defeated...'],
    ['haru', 'でも くるくる まわるの、すごかったよ!', 'But your spinning was amazing!'],
    ['karakara', 'ほほう! わかるかね? きみ、みる めが あるね!', 'Oho! You noticed? You have a good eye!'],
    ['karakara', 'では とくべつに、かけらを かえして しんぜよう。', 'Then, as a special favor, I shall return the shard.'],
  ], again: [
    ['karakara', 'カラカラ…。また まけて しまったよ。', 'Clack clack... I lost again.'],
    ['haru', 'また おどって みせてね!', 'Show me your dance again!'],
  ] },
  17: { first: [
    ['kabuto', 'ブオ…。おれの つのが とめられた…!', 'Bwoh... My horn was stopped...!'],
    ['haru', 'すごい ちからだった。わたし、ふらふら だよ。', 'You were so strong. I\'m all wobbly.'],
    ['kabuto', 'ハッハッハ! まけは まけだ。かけらは もってけ!', 'Hahaha! A loss is a loss. Take the shard!'],
    ['kabuto', 'つぎは うでずもうで しょうぶだぞ!', 'Next time, we arm-wrestle!'],
  ], again: [
    ['kabuto', 'ブオオ! また まけた! おまえ つよいな!', 'Bwooh! Lost again! You\'re strong!'],
    ['haru', 'また しょうぶ しようね!', 'Let\'s have another match!'],
  ] },
  21: { first: [
    ['goronta', 'うわーん! いわ、もう ないよお…。', 'Waaah! I\'m out of rocks...'],
    ['haru', 'いたかった? ごめんね。', 'Did that hurt? I\'m sorry.'],
    ['goronta', 'ぐすっ…。…ハル、おこって ないの?', 'Sniff... Haru, you\'re not mad?'],
    ['haru', 'おこって ないよ。いっしょに かけらを かえそう、ね?', 'I\'m not mad. Let\'s give the shard back together, okay?'],
  ], again: [
    ['goronta', 'ぐすっ…。また まけちゃった…。', 'Sniff... I lost again...'],
    ['haru', 'なかないで。ほら、ハンカチ。', 'Don\'t cry. Here\'s a hankie.'],
  ] },
  23: { first: [
    ['yurei', 'あっ…! ベールが…ずれちゃった…!', 'Oh...! My veil... slipped...!'],
    ['haru', 'わあ、やさしい かお。かくすの もったいないよ。', 'Wow, what a kind face. Don\'t hide it.'],
    ['yurei', '……ほんとう? へんじゃ ない…?', '...Really? It\'s not weird...?'],
    ['haru', 'ぜんぜん!', 'Not at all!'],
  ], again: [
    ['yurei', 'ま、また みられちゃった…。', 'Y-you saw me again...'],
    ['haru', 'やっぱり やさしい かおだね。', 'Still such a kind face.'],
  ] },
  30: { first: [
    ['queen', 'ブブ…! あたしが まけるなんて…!', 'Bzz...! Me, losing...!'],
    ['haru', 'かんむり、なくても すてきだよ。', 'You look lovely even without a crown.'],
    ['queen', '…ほんと? ま、まあ、とうぜんよね!', '...Really? W-well, of course I do!'],
    ['queen', 'しかたないわ。かけらは かえして あげる!', 'Fine. I\'ll give back the shard!'],
  ], again: [
    ['queen', 'ブブブ…! また まけた! くやしい!', 'Bzzz...! Lost again! So annoying!'],
    ['haru', 'また あそぼうね!', 'Let\'s play again!'],
  ] },
  62: { first: [
    ['munyaru', 'むにゃ…。まけた…。', 'Mmnya... I lost...'],
    ['haru', 'ねちゃ だめ! まだ おはなし あるよ!', 'Don\'t fall asleep! We\'re not done talking!'],
    ['munyaru', 'ふわあ…。じゃあ まくら かえして…。あ、ちがった、かけら かえす…。', 'Yaaawn... Then give my pillow back... oops, I mean, I\'ll give back the shard...'],
    ['munyaru', '……ぐう。', '...Zzz.'],
  ], again: [
    ['munyaru', 'むにゃ…。また まけた…。おやすみ…。', 'Mmnya... Lost again... Good night...'],
    ['haru', 'おやすみ!', 'Good night!'],
  ] },
  37: { first: [
    ['medama', '……みはりが、やぶられた……。', '...My watch... has been broken...'],
    ['haru', 'ずっと めを あけてて、つかれたでしょ?', 'You kept your eye open so long. Aren\'t you tired?'],
    ['medama', '……つかれる? そんな こと、かんがえた ことも なかった。', '...Tired? I never even thought about it.'],
    ['haru', 'ちょっと やすんで。わたしが かわりに みてるから。', 'Rest a bit. I\'ll keep watch for you.'],
  ], again: [
    ['medama', '……また、とおして しまった。', '...I let you through again.'],
    ['haru', 'ゆっくり やすんでね。', 'Get some good rest.'],
  ] },
  64: { first: [
    ['perari', 'あいたた! まけた まけた!', 'Ouch ouch! I lost, I lost!'],
    ['haru', 'もんばんの おしごと、もう いいの?', 'Are you done being the gatekeeper?'],
    ['perari', 'うん! だって もう はなしたくて うずうず してるもん!', 'Yep! I\'m itching to tell you everything!'],
    ['perari', 'おうさまの こと、とっておきの ひみつ おしえちゃう!', 'I\'ll tell you my best secret about the king!'],
  ], again: [
    ['perari', 'あいたた! また まけちゃった!', 'Ouch ouch! Lost again!'],
    ['haru', 'また おしゃべり しようね!', 'Let\'s chat again!'],
  ] },
  // さいごの ボス: かげの おう(物語の むすび。わけ・かけらの いみ・エンディングへ)
  44: { first: [
    ['kage', '……ひかりが……あたたかい……。', '...The light... is warm...'],
    ['kage', 'なぜだ。まけたのに、くるしく ない。', 'Why? I lost, yet it doesn\'t hurt.'],
    ['haru', 'もう ひとりで がんばらなくて いいから だよ。', 'Because you don\'t have to try all alone anymore.'],
    ['kage', '……わたしは まおうに ランプを こわさせた。ほしを けして、ピピも よわらせた。', '...I made the Night Lord break the lamp. I put out the stars and made Pipi weak.'],
    ['kage', 'なのに、なぜ おこらない?', 'So why aren\'t you angry?'],
    ['haru', 'ペラリが おしえて くれたの。ずっと ひとりで、したから ランプを ささえて くれてたって。', 'Perari told me. You held the lamp up from below, all alone.'],
    ['haru', 'かけらを ぜんぶ もどしても、そこに あなたが いないと、ひかりが まぶしすぎちゃう。', 'Even with every shard back, without you at the bottom, the light would be too bright.'],
    ['haru', 'ほしの ランプは、ひかりと かげが いっしょで はじめて やさしく ひかるんだよ。', 'The star lamp only shines gently when light and shadow are together.'],
    ['haru', 'だから いっしょに かえろう。ずっと、ありがとう。', 'So let\'s go back together. Thank you, for everything.'],
    ['kage', '……ありがとう、か。はじめて いわれた。', '..."Thank you," huh. No one ever said that to me before.'],
    ['narr', 'かげの おうは ちいさな かげに もどり、ハルの あしもとへ すべりこんだ。', 'The Shadow King shrank into a small shadow and slipped under Haru\'s feet.'],
    ['kage', '(ひるは おまえの あしもとに いよう。よるは、ランプの したへ。)', '(By day, I\'ll stay at your feet. By night, beneath the lamp.)'],
    ['haru', 'うん! さいごの かけらで、ランプを なおしに いこう!', 'Yes! Let\'s go fix the lamp with the last shard!'],
  ], again: [
    ['kage', '……また、ひかりに まけたな。', '...Beaten by the light again.'],
    ['haru', 'うん。いっしょに かえろう。', 'Yes. Let\'s go home together.'],
  ] },
};
// さいごの ボスの 戦う 前(部屋の 中。幕間 pre44 の あと)
if (typeof BOSS_TALK !== 'undefined' && BOSS_TALK[44]) {
  BOSS_TALK[44].first = [
    ['kage', 'きたか、ハル。ここが さいごの へやだ。', 'So you came, Haru. This is the final room.'],
    ['haru', 'ペラリから きいたよ。ずっと ランプの したに いたんでしょ?', 'Perari told me. You were under the lamp all this time, weren\'t you?'],
    ['kage', '…そうだ。わたしは ランプの そこの「かげの いし」から うまれた。', '...Yes. I was born from the shadow stone at the bottom of the lamp.'],
    ['kage', 'ひかりが つよすぎ ないように、ずっと したから ささえていた。', 'I held it up from below so its light would never be too strong.'],
    ['kage', 'だが、だれも したを みなかった。おまつりの よるも、わたしは ひとりだった。', 'But no one ever looked down. Even on festival nights, I was alone.'],
    ['haru', 'だから まおうに ランプを こわさせたの?', 'Is that why you made the Night Lord break the lamp?'],
    ['kage', 'ひかりが なければ、だれも わたしを わすれない。よるは ずっと まっくらで いい!', 'Without light, no one can forget me. Let the night stay dark forever!'],
    ['haru', 'ちがうよ。ほしが きえたら、あなたの ことも だれにも みえなく なっちゃう!', 'That\'s not true. If the stars go out, no one will be able to see you either!'],
    ['kage', 'だまれ! さいごの かけらは わたさぬ!', 'Silence! I will not give you the last shard!'],
    ['haru', 'じゃあ しょうぶ! ぜったい ひとりに しないから!', 'Then let\'s settle this! I\'ll never leave you alone!'],
  ];
  BOSS_TALK[44].again = ['kage', 'また きたか、ハル。なんど きても、かけらは わたさぬ。', 'You came again, Haru. No matter how often you come, the shard stays with me.'];
}

const X25B_WIN_DELAY = 1.6;     // たおして から 会話が はじまるまで(花火と たおれる ところを 見せる)
const X25B_SHORT_LINE = 2.2;    // 2回目から: 1行を 自分で すすめる 時間
{
  const _bs = bossSay;
  bossSay = function (o, key) {
    _bs(o, key);
    if (key !== 'defeat' || !world) return;
    const d = BOSS_WIN[world.def.id];
    if (!d || m24NoTalk() || world.def.roam || world.def.daily || world.def.tutorial) return;
    world.after24 = null;           // ex1024 の ハルの ひとことは 会話に まとめる
    world.win25 = { t: X25B_WIN_DELAY };
  };
  const _end = m24TalkEnd;
  m24TalkEnd = function () {
    if (!talk24.on || !talk24.win) return _end();
    talk24.on = false; talk24.win = false;
    const id = world && world.def.id;
    if (talk24.key && save.seen && !save.seen[talk24.key]) {
      save.seen[talk24.key] = true;
      // さいごの ボスの 会話を さいごまで 読んだら、同じ 中身の 幕間は とばす
      if (id === 44 && talk24.i >= talk24.lines.length) save.seen.post44 = true;
      writeSave();
    }
    sfx('click', 1.0);
  };
  // 面を 出入り したら 会話は のこさない(たおした あとの 会話の まま 地図・べつの 面へ 行った とき)
  const _sl = startLevel;
  startLevel = function (...a) { if (talk24.win) { talk24.on = false; talk24.win = false; } return _sl(...a); };
  const _up = update;
  update = function (dt) {
    if (talk24.on && talk24.win && (scene !== 'play' || !world || talk24.w25 !== world)) { talk24.on = false; talk24.win = false; }
    if (scene === 'play' && world && world.win25 && !talk24.on) {
      const w = world.win25; w.t -= dt;
      if (w.t <= 0) {
        world.win25 = null;
        const d = BOSS_WIN[world.def.id];
        if (d && !P.dead) {
          const key = 'talk25win_' + world.def.id, seen = save.seen && save.seen[key];
          talk24.on = true; talk24.win = true; talk24.w25 = world; talk24.key = key; talk24.o = null; talk24.i = 0; talk24.shown = 0; talk24.t = 0;
          talk24.short = !!seen; talk24.lines = seen ? d.again : d.first; talk24.lineT = 0;
          world.bossSay = null;
        }
      }
    }
    // 2回目からは 1行ずつ 自分で すすむ(ex1024 の 2.4びょうで おわる しくみより 先に)
    if (scene === 'play' && talk24.on && talk24.win && talk24.short) {
      talk24.lineT = (talk24.lineT || 0) + dt;
      talk24.t = 0;
      if (talk24.lineT > X25B_SHORT_LINE) { talk24.lineT = 0; talk24.shown = 1e9; m24TalkNext(); }
    }
    if (talk24.on && talk24.win) { const i0 = talk24.i; const r = _up(dt); if (talk24.i !== i0) talk24.lineT = 0; return r; }
    return _up(dt);
  };
}

// ======================================================================
// 運ぶ しかけ
// ======================================================================
const X25B_CARRY = {
  ride: 270,        // ゴンドラ: のって いる とき(px/びょう)
  fetch: 520,       // ゴンドラ・せんろ: だれも のって いない とき、ハルの がわの 駅へ むかう 速さ
  accel: 700,       // 動きだしの 加速
  startDelay: 0.25, // のってから 動きだすまで
  arriveWait: 0.6,  // 向こうに 着いて、おりてから もどりだすまで
  railMin: 160,     // せんろの のって いる ときの 速さの 下限
  birdFly: 250, birdBack: 480,
  balRise: 140, balDrift: 210, balRespawn: 1.2,
  raftGo: 150, raftIdle: 0.8, raftBack: 380,
};
// ハルが その 足場に のって いるか(ジャンプで 上に いる 間も のって いる ことに する)
function x25bRiding(o) {
  const p = P; if (!p || p.dead) return false;
  const overX = p.x + p.w > o.x - 6 && p.x < o.x + o.w + 6;
  const feet = p.y + p.h;
  if (p.onGround && overX && Math.abs(feet - o.y) < 10) return true;
  // ジャンプ中: 足場の 真上 6マス 以内に いて、下に 落ちて いない
  if (!p.onGround && overX && feet <= o.y + 6 && o.y - feet < 6 * TILE && o.ride25) return true;
  return false;
}
// 足場の 速さを ゆっくり 上げて、着く 前に ゆるめる
function x25bSpeed(o, top, rem, dt) {
  o.v25 = Math.min(top, (o.v25 || 0) + X25B_CARRY.accel * dt);
  return Math.max(30, Math.min(o.v25, 40 + rem * 2.2));
}
{
  const _ut = updateThing;
  updateThing = function (o, dt) {
    if (typeof window !== 'undefined' && window.__x25bCarryOff) return _ut(o, dt); // 試験で 前の 動きと くらべる とき だけ
    switch (o.t) {
      case 'f7_gondola': o.ph = (o.ph || 0) + dt; x25bGondola(o, dt); return;
      case 'rail': o.ph = (o.ph || 0) + dt; x25bRail(o, dt); return;
      case 'f7_bird': o.ph = (o.ph || 0) + dt; x25bBird(o, dt); return;
      case 'balloon': o.ph = (o.ph || 0) + dt; x25bBalloon(o, dt); return;
      case 'x_raft': o.ph = (o.ph || 0) + dt; x25bRaft(o, dt); return;
    }
    return _ut(o, dt);
  };
}
// ゴンドラ / せんろ 共通: 0〜len の 位置 s を 動かす。のって いれば のった がわと 反対の はしへ、いなければ ハルに 近い はしへ
function x25bShuttle(o, dt, len, posAt, rideSp) {
  const px0 = o.x, py0 = o.y, C = X25B_CARRY;
  const on = x25bRiding(o);
  if (on && !o.ride25) { o.ride25 = true; o.from25 = o.s25 < len / 2 ? 0 : len; o.hold25 = o.s25 === o.from25 ? C.startDelay : 0; }
  if (!on && o.ride25) { o.ride25 = false; o.arr25 = C.arriveWait; }
  let target, top;
  if (o.ride25) { target = len - o.from25; top = rideSp; }
  else {
    // ハルに 近い 駅(足場の まん中から 見て)。落ちて やりなおした ときも 手前の 駅へ もどって くる
    const a = posAt(0), b = posAt(len), hx = P.x + P.w / 2;
    target = Math.abs(hx - (a.x + o.w / 2)) <= Math.abs(hx - (b.x + o.w / 2)) ? 0 : len;
    top = C.fetch;
  }
  if (o.hold25 > 0) o.hold25 -= dt;
  else if (!o.ride25 && o.arr25 > 0 && (o.s25 === 0 || o.s25 === len)) o.arr25 -= dt; // 着いた 駅で すこし まつ(おりる 間)
  else if (o.s25 !== target) {
    const rem = Math.abs(target - o.s25), v = x25bSpeed(o, top, rem, dt), d = Math.min(rem, v * dt);
    o.s25 += Math.sign(target - o.s25) * d; o.dir = Math.sign(target - o.s25) || o.dir;
    if (Math.abs(target - o.s25) < 0.5) { o.s25 = target; o.v25 = 0; }
  } else o.v25 = 0;
  const q = posAt(o.s25); o.x = q.x; o.y = q.y;
  o.dx = o.x - px0; o.dy = o.y - py0;
}
function x25bGondola(o, dt) {
  const len = Math.hypot(o.bx - o.ax, o.by - o.ay);
  if (o.s25 === undefined) { o.s25 = 0; o.k = 0; o.stop = 0; }
  x25bShuttle(o, dt, len, s => ({ x: lerp(o.ax, o.bx, s / len), y: lerp(o.ay, o.by, s / len) }), X25B_CARRY.ride);
  o.k = o.s25 / len;
}
function x25bRail(o, dt) {
  if (o.s25 === undefined) o.s25 = 0;
  const pos = s => {
    let d = s, i = 1;
    while (i < o.pts.length - 1 && d > Math.hypot(o.pts[i][0] - o.pts[i - 1][0], o.pts[i][1] - o.pts[i - 1][1])) { d -= Math.hypot(o.pts[i][0] - o.pts[i - 1][0], o.pts[i][1] - o.pts[i - 1][1]); i++; }
    const a = o.pts[i - 1], b = o.pts[i], sl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, k = Math.min(1, d / sl);
    return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k };
  };
  x25bShuttle(o, dt, o.len, pos, Math.max(X25B_CARRY.railMin, o.sp));
  o.s = o.s25;
}
// はこびどり(ex1017.js と 同じ 動きで 速さだけ)
function x25bBird(o, dt) {
  const p = P, C = X25B_CARRY, px0 = o.x, py0 = o.y;
  const on = !p.dead && p.onGround && Math.abs(p.y + p.h - o.y) < 8 && p.x + p.w > o.x + 2 && p.x < o.x + o.w - 2;
  if (o.state === 'wait') { o.y = o.y0 + Math.sin(o.ph * 3) * 4; if (on) { o.state = 'fly'; sfx('swing', 0.8); } }
  else if (o.state === 'fly') { o.x = Math.min(o.x0 + o.dist, o.x + C.birdFly * dt); o.y = o.y0 + Math.sin(o.ph * 2.2) * 22; if (o.x >= o.x0 + o.dist) { o.state = 'land'; o.timer = 1.5; } }
  else if (o.state === 'land') { o.timer -= dt; o.y = lerp(o.y, o.y0, dt * 4); if (!on) { o.timer = Math.min(o.timer, 1.0); if (o.timer <= 0) o.state = 'back'; } }
  else if (o.state === 'back') { o.x = Math.max(o.x0, o.x - C.birdBack * dt); o.y = o.y0 - 60 + Math.sin(o.ph * 2) * 10; if (o.x <= o.x0) { o.state = 'wait'; o.y = o.y0; } }
  if (o.state === 'fly' && !on && (p.dead || p.y > o.y + 2 * TILE)) o.state = 'back';
  o.dx = o.x - px0; o.dy = o.y - py0;
}
// ふうせん(game.js と 同じ 動き。速く、とちゅうで 落ちたら すぐ われて もどる)
function x25bBalloon(o, dt) {
  const p = P, C = X25B_CARRY, py0 = o.y, px0 = o.x;
  const standing = p.onGround && p.x + p.w > o.x + 4 && p.x < o.x + o.w - 4 && Math.abs(p.y + p.h - o.y) < 4;
  const pop = t => { o.state = 'pop'; o.timer = t; sfx('boom', 1.8); burst(o.x + o.w / 2, o.y - 40, '#ff6b8b', 14, 220, 5); o.plat = false; };
  if (o.state === 'idle') { o.y = o.y0 + Math.sin(o.ph * 2) * 4; o.x = o.x0; if (standing) o.state = 'rise'; }
  else if (o.state === 'rise' && o.drift && o.y < o.y0 - o.r) { o.y = o.y0 - o.r; o.state = 'drift'; }
  else if (o.state === 'drift') { o.y = o.y0 - o.r + Math.sin(o.ph * 2) * 3; if (o.x < o.x0 + o.drift) o.x = Math.min(o.x0 + o.drift, o.x + C.balDrift * dt); else { o.state = 'hover'; o.timer = 1.8; } }
  else if (o.state === 'hover') { o.timer -= dt; o.y = o.y0 - o.r + Math.sin(o.ph * 2) * 3 + (o.timer < 0.6 ? Math.sin(o.ph * 40) * 1.5 : 0); if (o.timer <= 0) pop(C.balRespawn); }
  else if (o.state === 'rise') { o.y -= C.balRise * dt; if (o.y < o.y0 - o.r && !o.drift) pop(3); }
  else if (o.state === 'pop') { o.timer -= dt; if (o.timer <= 0) { o.state = 'idle'; o.y = o.y0; o.x = o.x0; o.plat = true; sparkle(o.x + o.w / 2, o.y - 30, 8); } }
  // ながれて いる とちゅうで 落ちたら(やられた・下へ 落ちた)すぐ われて、もとの 場所で まつ
  if ((o.state === 'drift' || o.state === 'rise') && o.drift && !standing && (p.dead || p.y > o.y + 2 * TILE)) pop(C.balRespawn);
  o.dx = o.x - px0; o.dy = o.y - py0;
}
// いかだ(ex1016.js と 同じ 動きで 速さだけ)
function x25bRaft(o, dt) {
  const C = X25B_CARRY, prevX = o.x, prevY = o.y;
  const onR = pFeetOn(o, 8); if (onR) { o.moving = true; o.idleT = 0; } else o.idleT = (o.idleT || 0) + dt;
  if (onR && o.x < o.xEnd) o.x = Math.min(o.xEnd, o.x + C.raftGo * dt);
  else if (!onR && o.idleT > C.raftIdle && o.x > o.x0) o.x = Math.max(o.x0, o.x - C.raftBack * dt);
  o.y = o.y0 + Math.sin(o.ph * 2.2) * 3;
  o.dx = o.x - prevX; o.dy = o.y - prevY;
}
if (typeof window !== 'undefined') window.__x25b = { BOSS_WIN, CARRY: X25B_CARRY, talk: talk24 };
if (typeof window !== 'undefined' && window.__game) window.__game.talk = talk24; // 試験用(会話中か)
