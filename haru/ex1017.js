// ハルの冒険 — 2026-10-17 の 見直し(持ち主「ヌルゲー・ギミックが ジャンプで 済む・敵と ギミックを もっと 大量に」)
// 新しい 敵 22しゅ(うち つよい敵 7しゅ: 体力 3〜5・ふれると ハート 2つ・たおすと コインと いのちの かけら)
// 新しい しかけ 11しゅ(はこびどり・ゴンドラ・ほうせんかの たいほう・じょうき リフト・のびる はし・ほのおの ふきだし・せまる いわかべ・トゲまるた・くもの す・はぐるま・すなどけいの 足場)
// いのちの かけら(3つで 1UP)・いのちの みどりキノコ(u)の 置き方・ひみつの みちと ばったりバトルの ごほうび。
// game.js → ex1016.js の あとに 読む。ex1016 の 差し込み口(updateEnemyX など)を つつむ。
'use strict';

// ---------------- 敵の 表 ----------------
// fb: 絵が ないときの 代わり(前からの 素材+色替え)。strong: つよい敵(hp・ごほうび)
const XF = {
  momonga: { w: 40, h: 34, dh: 48, stomp: true, sword: true, fly: true, score: 200, fb: ['bat', 'sepia(1) saturate(1.4)'] },
  kuwagata: { w: 70, h: 52, dh: 70, speed: 46, stomp: true, sword: true, edge: true, score: 1500, strong: true, hp: 3, fb: ['beetle', 'hue-rotate(200deg) saturate(1.6) brightness(.8)'] },
  pengin: { w: 38, h: 42, dh: 52, speed: 52, stomp: true, sword: true, score: 200, fb: ['goomy', 'grayscale(1) brightness(.7)'] },
  yukidaruma: { w: 60, h: 80, dh: 96, stomp: true, sword: true, score: 1500, strong: true, hp: 3, fb: ['goomy', 'grayscale(1) brightness(1.9)'] },
  houtai: { w: 38, h: 50, dh: 60, speed: 28, stomp: true, sword: true, edge: true, score: 250, fb: ['skeleton', 'sepia(.6) brightness(1.3)'] },
  tokage: { w: 50, h: 34, dh: 44, stomp: true, sword: true, score: 250, fb: ['beetle', 'hue-rotate(-40deg) saturate(2)'] },
  tako: { w: 46, h: 46, dh: 70, stomp: true, sword: true, fly: true, score: 250, fb: ['ghost', 'hue-rotate(240deg) saturate(2)'] },
  raijin: { w: 56, h: 56, dh: 78, stomp: true, sword: true, fly: true, score: 1800, strong: true, hp: 3, fb: ['wizard', 'hue-rotate(90deg) saturate(2)'] },
  hitotsume: { w: 38, h: 50, dh: 60, stomp: true, sword: true, score: 250, fb: ['ghost', 'hue-rotate(180deg)'] },
  ookami: { w: 72, h: 50, dh: 70, speed: 60, stomp: true, sword: true, edge: true, score: 1800, strong: true, hp: 3, fb: ['beetle', 'brightness(.35) hue-rotate(250deg) saturate(2)'] },
  kamakiri: { w: 44, h: 54, dh: 66, stomp: true, sword: true, score: 300, fb: ['bee', 'hue-rotate(60deg) saturate(1.5)'] },
  gorira: { w: 74, h: 70, dh: 90, speed: 40, stomp: true, sword: true, edge: true, score: 2000, strong: true, hp: 4, fb: ['beetle', 'sepia(1) brightness(.6)'] },
  eisei: { w: 52, h: 34, dh: 50, stomp: true, sword: true, fly: true, score: 300, fb: ['eye', 'grayscale(1) brightness(1.4)'] },
  kurekame: { w: 76, h: 54, dh: 72, speed: 34, stomp: true, sword: true, edge: true, score: 2000, strong: true, hp: 4, fb: ['shell', 'grayscale(1) brightness(1.1)'] },
  kagehebi: { w: 56, h: 26, dh: 40, speed: 110, stomp: true, sword: true, edge: true, score: 300, fb: ['slime', 'brightness(.35) hue-rotate(220deg) saturate(2)'] },
  kagami: { w: 42, h: 54, dh: 64, stomp: true, sword: true, score: 400, fb: ['skeleton', 'hue-rotate(260deg) saturate(2)'] },
  seizagumo: { w: 48, h: 40, dh: 52, stomp: true, sword: true, fly: true, score: 350, fb: ['kumo', 'hue-rotate(200deg) brightness(.7)'] },
  ryusei: { w: 80, h: 60, dh: 84, stomp: true, sword: true, fly: true, score: 3000, strong: true, hp: 5, fb: ['bat', 'hue-rotate(200deg) saturate(2) brightness(1.2)'] },
  takara: { w: 36, h: 46, dh: 56, speed: 230, stomp: true, sword: true, score: 500, rare: true, fb: ['goomy', 'sepia(1) saturate(2) hue-rotate(10deg)'] },
  bakudanbana: { w: 40, h: 54, dh: 66, stomp: true, sword: true, score: 250, fb: ['plant', 'hue-rotate(-30deg) saturate(1.6)'] },
  shinobi: { w: 46, h: 40, dh: 54, stomp: true, sword: true, fly: true, score: 300, fb: ['bat', 'brightness(.4)'] },
  tatsuno: { w: 34, h: 50, dh: 60, stomp: true, sword: true, fly: true, score: 250, fb: ['fish', 'hue-rotate(-20deg) saturate(1.5)'] },
};
const XF_NAME = {
  momonga: 'むささびモモ', kuwagata: 'おおクワガタ', pengin: 'すべりペンギン', yukidaruma: 'ゆきだるマン', houtai: 'ほうたいミイラ', tokage: 'ひふきトカゲ', tako: 'たこあげダコ', raijin: 'ちびライジン',
  hitotsume: 'ひとつめこぞう', ookami: 'かげオオカミ', kamakiri: 'かまキリ', gorira: 'つたゴリラ', eisei: 'えいせいビット', kurekame: 'クレーターガメ', kagehebi: 'かげヘビ', kagami: 'まほうかがみ',
  seizagumo: 'せいざグモ', ryusei: 'りゅうせいドラゴン', takara: 'たからこぞう', bakudanbana: 'ばくだんばな', shinobi: 'しのびガラス', tatsuno: 'タツノコ',
};
const XF_EN = {
  momonga: 'Gliding Momo', kuwagata: 'Big Stag', pengin: 'Slide Penguin', yukidaruma: 'Snowmanoth', houtai: 'Wrap Mummy', tokage: 'Fire Lizard', tako: 'Kite Octo', raijin: 'Little Thunder',
  hitotsume: 'One-Eye', ookami: 'Shadow Wolf', kamakiri: 'Leaf Mantis', gorira: 'Vine Gorilla', eisei: 'Satellite Bit', kurekame: 'Crater Turtle', kagehebi: 'Shadow Snake', kagami: 'Magic Mirror',
  seizagumo: 'Star Spider', ryusei: 'Comet Dragon', takara: 'Treasure Imp', bakudanbana: 'Bomb Bloom', shinobi: 'Ninja Crow', tatsuno: 'Sea Pony',
};
const XF_WORLD = { momonga: '1', kuwagata: '1・6', pengin: '2', yukidaruma: '2', houtai: '3', tokage: '3', tako: '4', raijin: '4', hitotsume: '5', ookami: '5・8', kamakiri: '6', gorira: '6',
  eisei: '7', kurekame: '7', kagehebi: '8', kagami: '8', seizagumo: '9・10', ryusei: '9・10', takara: 'ひみつの みち・ばったり', bakudanbana: '3・8', shinobi: '5・8', tatsuno: '2・6' };
// ずかんの 2〜3行(ゲームの 中で ほんとうに そう うごく ことだけ)
const XF_DESC = {
  momonga: ['木の 上から ハルを 見はる ムササビ。', '真下に 来ると ななめに すべって おりてくる。', 'ふんでも けんでも たおせる。'],
  kuwagata: ['森の いばりんぼ。まえに 来ると あごを ひらいて とっしん。', 'かべに ぶつかると 目を まわす。ふれると ハート 2つ。', '3かい ふむか けんで。いのちの かけらを おとす。'],
  pengin: ['ペンギンの 子。ハルを 見つけると おなかで すべる。', 'がけでも とまらず、とびこえて くる。', 'ふんでも けんでも たおせる。'],
  yukidaruma: ['大きな ゆきだるま。ゆきだまを ゆみなりに なげる。', 'さいごの 1かいに なると あたまが かけて はやくなる。', '3かい ふむか けんで。いのちの かけらを おとす。'],
  houtai: ['ねぼけた ミイラ。ゆっくり あるく。', 'ふまれると ほうたいが ほどけて はやく はしる。', 'もう1かい ふむか けんで たおせる。'],
  tokage: ['火を ふく トカゲ。いきを すいこんだら あいず。', 'まえに まっすぐ 火を ふく。', 'ふんでも けんでも たおせる。'],
  tako: ['たこに つかまって とぶ タコ。', '真上から 青い 火花を おとす。', 'ふんでも けんでも たおせる。'],
  raijin: ['かみなりの 小鬼。たいこを たたくと 光の たまが 3つ とぶ。', 'ふれると ハート 2つ。', '3かい ふむか けんで。いのちの かけらを おとす。'],
  hitotsume: ['ひとつめの おばけの 子。', 'ハルが せなかを むけると かけよってくる。むきあうと とまる。', 'ふんでも けんでも たおせる。'],
  ookami: ['ゆうやけの 国の オオカミ。とびかかって くる。', 'とおぼえで おにびを よぶ。ふれると ハート 2つ。', '3かい ふむか けんで。いのちの かけらを おとす。'],
  kamakiri: ['はっぱの かまを もつ カマキリ。', 'ちかづくと かまを ふりあげて、まえを きる。', 'ふんでも けんでも たおせる。'],
  gorira: ['つたを まいた ゴリラ。むねを たたいてから ヤシの みを なげる。', 'ふれると ハート 2つ。', '4かい ふむか けんで。いのちの かけらを おとす。'],
  eisei: ['月の ちいさな 人工えいせい。ハルの 上を ついてくる。', 'ひかったら 真下に 光の せん。', 'ふんでも けんでも たおせる。'],
  kurekame: ['クレーターだらけの こうらの カメ。いしを うつ。', 'たたかれると こうらで ロケット とっしん。ふれると ハート 2つ。', '4かい ふむか けんで。いのちの かけらを おとす。'],
  kagehebi: ['かげの ヘビ。はやく はう。', 'ちかづくと まえへ とびかかる。', 'ふんでも けんでも たおせる。'],
  kagami: ['足の はえた かがみ。ハルと はんたいに うごく。', 'ハルが とぶと いっしょに とぶ。', '2かい ふむか けんで たおせる。'],
  seizagumo: ['星座の もようの クモ。糸で おりてくる。', 'ななめに 星の たまを 2つ うつ。', 'ふんでも けんでも たおせる。'],
  ryusei: ['流れ星の しっぽの 小さな ドラゴン。', '火の たまを 4つ おうぎに はく。ふれると ハート 2つ。', '5かい ふむか けんで。いのちの かけらを おとす。'],
  takara: ['めったに 会えない すばしっこい 小人。', 'ハルから にげる。しばらくすると きえる。', 'つかまえると コイン 20まいと いのちの かけら。'],
  bakudanbana: ['ばくだんの たねの 花。', 'ひらいて たねを ハルの ほうへ とばす。おちると ばくはつ。', 'ふんでも けんでも たおせる。'],
  shinobi: ['にんじゃの カラス。はねを まっすぐ なげる。', 'そのあと ななめに きゅうこうか。', 'ふんでも けんでも たおせる。'],
  tatsuno: ['水に すむ タツノオトシゴ。', 'あわの たまを まえに ふく。', 'ふんでも けんでも たおせる。'],
};
const XF_DESC_EN = {
  momonga: ['A flying squirrel that watches from the trees.', 'When you pass below, it glides down at an angle.', 'Stomp it or use the sword.'],
  kuwagata: ['A bossy stag beetle. It charges with its jaws open.', 'It gets dizzy when it hits a wall. Touching it costs 2 hearts.', 'Hit it 3 times. Drops a life piece.'],
  pengin: ['A young penguin. It belly-slides when it sees you.', 'It does not stop at ledges and hops right over.', 'Stomp it or use the sword.'],
  yukidaruma: ['A big snowman that lobs snowballs.', 'On its last hit, its head chips and it gets faster.', 'Hit it 3 times. Drops a life piece.'],
  houtai: ['A sleepy mummy that walks slowly.', 'Stomp it and its wraps come loose, and it runs fast.', 'Stomp again or use the sword.'],
  tokage: ['A fire-breathing lizard. Watch for the deep breath.', 'It breathes fire straight ahead.', 'Stomp it or use the sword.'],
  tako: ['An octopus riding a kite.', 'It drops blue sparks from above.', 'Stomp it or use the sword.'],
  raijin: ['A little thunder imp. Its drums fire three orbs.', 'Touching it costs 2 hearts.', 'Hit it 3 times. Drops a life piece.'],
  hitotsume: ['A one-eyed ghost kid.', 'It runs at you when you turn your back. Face it and it freezes.', 'Stomp it or use the sword.'],
  ookami: ['A wolf of the dusk lands. It pounces.', 'Its howl calls wisps. Touching it costs 2 hearts.', 'Hit it 3 times. Drops a life piece.'],
  kamakiri: ['A mantis with leaf blades.', 'Get close and it raises its blades and slashes.', 'Stomp it or use the sword.'],
  gorira: ['A gorilla wrapped in vines. It beats its chest, then throws coconuts.', 'Touching it costs 2 hearts.', 'Hit it 4 times. Drops a life piece.'],
  eisei: ['A tiny moon satellite that follows above you.', 'When it glows, a beam shoots straight down.', 'Stomp it or use the sword.'],
  kurekame: ['A turtle with a cratered shell. It shoots rocks.', 'Hit it and it rockets in its shell. Touching it costs 2 hearts.', 'Hit it 4 times. Drops a life piece.'],
  kagehebi: ['A fast shadow snake.', 'Get close and it lunges forward.', 'Stomp it or use the sword.'],
  kagami: ['A mirror with legs. It moves opposite to you.', 'When you jump, it jumps too.', 'Stomp it twice or use the sword.'],
  seizagumo: ['A spider with a constellation pattern. It drops on a thread.', 'It shoots two star orbs diagonally.', 'Stomp it or use the sword.'],
  ryusei: ['A little dragon with a comet tail.', 'It breathes four fireballs in a fan. Touching it costs 2 hearts.', 'Hit it 5 times. Drops a life piece.'],
  takara: ['A rare, speedy little imp.', 'It runs from you and vanishes after a while.', 'Catch it for 20 coins and a life piece.'],
  bakudanbana: ['A flower with bomb seeds.', 'It opens and flings a seed at you. It explodes when it lands.', 'Stomp it or use the sword.'],
  shinobi: ['A ninja crow that throws feathers straight.', 'Then it swoops diagonally.', 'Stomp it or use the sword.'],
  tatsuno: ['A sea pony that lives in water.', 'It spits bubble shots forward.', 'Stomp it or use the sword.'],
};
// せいかく・くらし
const XF_LORE = {
  momonga: 'ひるまは 木の あなで ねていて、夕方に なると 目が さえる。おちてくる どんぐりを くうちゅうで とるのが じまん。',
  kuwagata: '森で いちばん つよいと 思いこんでいる。あごを みがくのが 日課で、つやが くもると 一日じゅう きげんが わるい。',
  pengin: 'あるくより すべる ほうが すき。こおりの さかを 見ると、がまんが できない。',
  yukidaruma: '冬に 子どもたちが 作った ゆきだるまが、星の ない 夜に うごきだした。だれかと あそびたくて しかたがない。',
  houtai: 'いせきで 千年 ねていた。ほうたいが ほどけると はずかしくて、あわてて はしりだす。',
  tokage: 'さばくの 日なたが すきで、おなかが あったまると つい 火を ふいてしまう。',
  tako: 'たこあげ名人。風の 日は ごきげんで、なかまの 上を ぐるぐる まわる。',
  raijin: 'かみなりの 小鬼。たいこの 音が 大きいほど えらいと 思っている。ほめられると てれて 雲に かくれる。',
  hitotsume: 'こわがられたいのに、目が あうと はずかしくて かたまる。せなかを 見ると つい かけよってしまう。',
  ookami: 'ゆうやけを 見ながら とおぼえ するのが すき。星が きえてから、とおぼえの こたえが かえってこなくて さみしい。',
  kamakiri: 'かまの 手入れに うるさい。はっぱを 切るのが うまくて、ジャングルの 道を きりひらく しごとを している。',
  gorira: 'ジャングルの まもりがみ きどり。ヤシの みを なげるのは あいさつの つもり らしい。',
  eisei: 'だれかが 月に わすれていった きかい。ずっと 下を 見ていて、ハルを 見つけると ついて いきたくなる。',
  kurekame: 'こうらの クレーターは いん石と ぶつかった あと。ほこりに 思っていて、かずを かぞえるのが すき。',
  kagehebi: 'かげの 国の ほそい みちを すみかに する。音を たてずに はうのが とくい。',
  kagami: 'うつった ものを まねしたくて たまらない かがみ。ほんとうは 自分の かおを 見てみたい。',
  seizagumo: 'せなかの 星座を じまんに している。きえた 星の かわりに、いとで 夜空を つないで いる つもり。',
  ryusei: 'ながれ星から 生まれた 小さな ドラゴン。まだ とぶのが へたで、ときどき 自分の しっぽを おいかける。',
  takara: 'コインを あつめるのが いきがい。ひみつの みちや 人の いない 所に あらわれては、すぐ どこかへ きえる。',
  bakudanbana: 'たねを とおくへ とばしたい 花。ばくはつは たねまきの つもりで、わるぎは ない。',
  shinobi: 'にんじゃに あこがれる カラス。かっこいい ポーズの れんしゅうを かかさない。',
  tatsuno: 'さんごの 森で くらす。あわの たまで ともだちと キャッチボールを する。',
};
const XF_LORE_EN = {
  momonga: 'Sleeps in a tree hollow by day and wakes at dusk. It is proud of catching falling acorns in midair.',
  kuwagata: 'Thinks it is the strongest in the forest. It polishes its jaws every day and sulks all day if they lose their shine.',
  pengin: 'Prefers sliding to walking. It cannot resist an icy slope.',
  yukidaruma: 'A snowman the village kids built that started moving on a starless night. It just wants someone to play with.',
  houtai: 'Slept in the ruins for a thousand years. When its wraps come loose it gets embarrassed and runs.',
  tokage: 'Loves sunny sand. When its belly warms up, it breathes fire without meaning to.',
  tako: 'A kite-flying master. On windy days it loops happily above its friends.',
  raijin: 'A thunder imp that thinks louder drums mean more important. Praise makes it hide in its cloud.',
  hitotsume: 'Wants to be scary, but freezes when your eyes meet. It cannot help running up behind you.',
  ookami: 'Loves howling at the sunset. Since the stars vanished, no howl answers back, and it feels lonely.',
  kamakiri: 'Fussy about its blades. It cuts paths through the jungle for a living.',
  gorira: 'Acts as the guardian of the jungle. Throwing coconuts is its way of saying hello.',
  eisei: 'A machine someone left on the moon. It always looks down and wants to follow Haru.',
  kurekame: 'The craters on its shell are from meteor bumps. It is proud of them and likes to count them.',
  kagehebi: 'Lives on the narrow paths of the shadow land. It is good at slithering without a sound.',
  kagami: 'A mirror that cannot stop copying. It secretly wants to see its own face.',
  seizagumo: 'Proud of the constellation on its back. It thinks its threads link up the night sky in place of the lost stars.',
  ryusei: 'A little dragon born from a shooting star. Still bad at flying, it sometimes chases its own tail.',
  takara: 'Lives to collect coins. It shows up on secret paths and quiet places, then vanishes.',
  bakudanbana: 'A flower that wants to send its seeds far. The blasts are just its way of planting, nothing mean.',
  shinobi: 'A crow who dreams of being a ninja. It never skips practicing cool poses.',
  tatsuno: 'Lives in the coral forest and plays catch with friends using bubbles.',
};
for (const k in XF) {
  const d = XF[k];
  ENEMY[k] = Object.assign({ img: d.fb[0], filter: d.fb[1], ex: true, xf: true, walker: !!d.speed && !d.fly, art: 'xf_' + k + '_0' }, d);
}
for (const k in XF) if (!ZK_ENEMIES.includes(k)) ZK_ENEMIES.push(k);
Object.assign(ZK_NAME, XF_NAME);
for (const k in XF) if (!EINFO[k]) EINFO[k] = { name: XF_NAME[k], world: XF_WORLD[k], intro: XF_DESC[k].slice(0, 2).join(''), how: XF_DESC[k][2] };
if (typeof ZK_DESC !== 'undefined') Object.assign(ZK_DESC, XF_DESC);
if (typeof ZK_DESC_EN !== 'undefined') Object.assign(ZK_DESC_EN, XF_DESC_EN);
if (typeof ZK_LORE !== 'undefined') Object.assign(ZK_LORE, XF_LORE);
if (typeof ZK_LORE_EN !== 'undefined') Object.assign(ZK_LORE_EN, XF_LORE_EN);
if (typeof EN_DICT !== 'undefined') for (const k in XF) { EN_DICT[XF_NAME[k]] = XF_EN[k]; XF_DESC[k].forEach((t, i) => { EN_DICT[t] = XF_DESC_EN[k][i]; }); EN_DICT[XF_LORE[k]] = XF_LORE_EN[k]; EN_DICT[XF_DESC[k].slice(0, 2).join('')] = XF_DESC_EN[k].slice(0, 2).join(' '); }
if (typeof zkKind === 'function') { const _zkKind17 = zkKind; zkKind = k => (XF[k] && XF[k].strong ? ['つよい', '#ff8a4a'] : XF[k] && XF[k].rare ? ['めずらしい', '#ffe14d'] : _zkKind17(k)); }

// 絵(ChatGPT: xf_<敵>_<0..2>.png・g7_*.png・ill_gameover.png)
const XF_V = '20261017c';
const XF_ART = ['ill_gameover', 'g7_bird_0', 'g7_bird_1', 'g7_gondola', 'g7_station', 'g7_pod_0', 'g7_pod_1', 'g7_bucket', 'g7_pulley', 'g7_lever_0', 'g7_lever_1', 'g7_bridge', 'g7_vent', 'g7_flame',
  'g7_wall', 'g7_roller', 'g7_web', 'g7_steam', 'g7_lid', 'g7_cog', 'g7_vhang_0', 'g7_vhang_1', 'g7_vhang_2', 'g7_vtile', 'g7_vtop', 'g7_balloon_0', 'g7_balloon_1', 'g7_1up_0', 'g7_1up_1', 'g7_1uppiece'];
for (const k in XF) for (let f = 0; f < 3; f++) XF_ART.push('xf_' + k + '_' + f);
for (const n of XF_ART) {
  const im = new Image();
  im.onload = () => { if (!im.naturalWidth) return; ART[n] = im; if (n === 'g7_vtile') { ART.vine_tile = im; try { if (TB.groundTop) bakeTiles(); } catch (e) { /* なにもしない */ } } };
  im.onerror = () => {};
  im.src = 'assets/chatgpt/' + n + '.png?v=' + XF_V;
}

// ---------------- いのちの かけら ----------------
function lifeBit(x, y) {
  if (!livesOn()) return;
  save.lifeBits = (save.lifeBits || 0) + 1;
  if (save.lifeBits >= 3) { save.lifeBits = 0; lifeUp(x, y, 'bits'); } else { sfx('star', 1.3); popText(x, y - 20, 'いのちの かけら ' + save.lifeBits + '/3', '#7dff8a'); }
  writeSave();
  if (!save.seen.lifeBit1017) { save.seen.lifeBit1017 = true; writeSave(); toast = { text: 'いのちの かけら!', sub: '3つ あつめると 1UP', t: 2.6 }; }
}
function dropBit(o) { world.ents.push({ id: ++uid, t: 'f7_bit', x: o.x + o.w / 2 - 16, y: o.y, w: 32, h: 32, vx: 0, vy: -560, ph: 0 }); }
function dropCoins(o, n) { for (let i = 0; i < n; i++) world.ents.push({ id: ++uid, t: 'coin', x: o.x + o.w / 2 - 14, y: o.y - 6, w: 28, h: 32, ph: 0, vx: (i - (n - 1) / 2) * 60, vy: -380 - (i % 3) * 90 }); }

// ---------------- 敵の うごき ----------------
const fGrav = (o, dt) => { o.vy = Math.min(o.vy + GRAV * dt, MAXFALL); };
function fWalk(o, dt, sp, opts = {}) {
  fGrav(o, dt); o.vx = o.face * sp; moveBody(o, dt);
  if (o.hitWall) { o.face = -o.hitWall; if (opts.dizzy) return 'wall'; }
  if (o.d.edge && o.onGround && !opts.noEdge) {
    const ahead = Math.floor((o.face > 0 ? o.x + o.w + 2 : o.x - 2) / TILE), below = Math.floor((o.y + o.h + 4) / TILE);
    if (!isSolid(ahead, below) && !isOneWay(ahead, below)) o.face *= -1;
  }
  return '';
}
const fFront = (o, px, py, ex, ey, dist, dy = 70) => (px - ex) * o.face > 0 && Math.abs(px - ex) < dist && Math.abs(py - ey) < dy;
function fShot(x, y, vx, vy, col, g = 0, w = 20) { world.ents.push({ id: ++uid, t: 'spit', x: x - w / 2, y: y - w / 2, w, h: w, vx, vy, g, life: 4, col }); }
// ほのお・光の せん・かまの 当たり(しばらく のこる 四角)
function fHit(x, y, w, h, life, kind) { world.ents.push({ id: ++uid, t: 'f7_hit', x, y, w, h, life, max: life, kind }); }
function initEnemyF(o, e) {
  const d = o.d, op = e.opt || {};
  o.fr = 0; o.alpha = 1; o.timer = rnd(0.8, 1.8); o.state = 'walk'; o.x0 = o.x; o.y0 = o.y;
  if (d.strong) { o.hp = d.hp; o.maxHp = d.hp; o.invT = 0; o.gate = op.gate || 0; }
  switch (o.type) {
    case 'momonga': o.state = 'perch'; break;
    case 'houtai': o.loose = false; break;
    case 'raijin': case 'eisei': case 'tako': case 'shinobi': case 'ryusei': o.timer = 2; break;
    case 'kagami': o.hp = 2; break;
    case 'seizagumo': o.state = 'up'; o.topY = o.y; break;
    case 'takara': o.life = op.life || 14; o.state = 'idle'; break;
    case 'tatsuno': o.timer = 1.5; break;
  }
}
function fStrongHit(o) {
  o.hp--; o.invT = 0.9; sfx('hit'); hitStop(0.06); cam.shake = Math.max(cam.shake, 0.15);
  if (o.hp <= 0) {
    defeat(o, true); sfx('boom', 0.8);
    dropCoins(o, 10); dropBit(o);
    if (o.gate) for (const g of world.ents) if (g.t === 'f7_gate' && g.g === o.gate) g.open = true;
    return;
  }
  o.state = 'dizzy'; o.timer = 0.8; o.vx = 0;
  popText(o.x + o.w / 2, o.y - 10, 'あと ' + o.hp, '#ffe066');
}
function updateEnemyF(o, dt, px, py, ex, ey) {
  const d = o.d;
  if (o.invT > 0) o.invT -= dt;
  const fr = (a, b) => (Math.floor(o.ph * a) % 2 ? b : 0);
  const near = Math.abs(px - ex) < 620;
  switch (o.type) {
    case 'momonga': {
      if (o.state === 'perch') { o.fr = 0; o.y = o.y0 + Math.sin(o.ph * 2) * 2; if (Math.abs(px - ex) < 260 && py > ey + 40) { o.state = 'glide'; o.face = px < ex ? -1 : 1; o.vx = o.face * 230; o.vy = 170; sfx('swing', 1.4); } }
      else if (o.state === 'glide') { o.fr = 1; o.x += o.vx * dt; o.y += o.vy * dt; if (o.y > o.y0 + 5 * TILE || isSolid(Math.floor(ex / TILE), Math.floor((o.y + o.h) / TILE))) { o.state = 'back'; } }
      else { o.fr = 2; o.y -= 140 * dt; o.x += (o.x0 - o.x) * dt * 1.2; if (o.y <= o.y0) { o.y = o.y0; o.state = 'perch'; } }
      return true;
    }
    case 'kuwagata': case 'ookami': case 'gorira': case 'kurekame': {
      if (o.state === 'dizzy') { o.timer -= dt; fGrav(o, dt); o.vx = 0; moveBody(o, dt); o.fr = 0; if (o.timer <= 0) o.state = 'walk'; return true; }
      if (o.state === 'charge') {
        o.timer -= dt; const sp = o.type === 'kurekame' ? 420 : o.type === 'ookami' ? 340 : 330;
        if (fWalk(o, dt, sp, { dizzy: true, noEdge: o.type === 'ookami' }) === 'wall') { o.state = 'dizzy'; o.timer = 1.2; sfx('bump'); cam.shake = 0.15; }
        else if (o.timer <= 0) o.state = 'walk';
        o.fr = 2; if (Math.random() < dt * 14) dust(ex, o.y + o.h, 1); return true;
      }
      if (o.state === 'act') {
        o.timer -= dt; fGrav(o, dt); o.vx = 0; moveBody(o, dt); o.fr = 1;
        if (o.timer <= 0) {
          o.state = 'walk'; o.cool = o.type === 'gorira' ? 2.4 : 2.8;
          if (o.type === 'gorira') { const dx = px - ex; fShot(ex, o.y + 10, clamp(dx * 1.05, -320, 320), -560, '#8a5a2a', 1300, 26); sfx('swing', 0.9); }
          else if (o.type === 'kurekame') { fShot(ex + o.face * 30, o.y + 20, o.face * 330, 0, '#9aa0a8', 0, 22); sfx('boom', 1.8); }
          else if (o.type === 'ookami') { if (world.ents.filter(e => e.t === 'enemy' && e.type === 'onibi' && !e.gone && !e.dying && e.summoned).length < 2) { const w = X_spawnEnemy('onibi', ex, o.y - 30); if (w) { w.summoned = true; w.minX = o.x - 6 * TILE; w.maxX = o.x + 6 * TILE; } } sfx('swing', 0.6); }
        }
        return true;
      }
      fWalk(o, dt, d.speed); o.fr = fr(5, 1);
      o.cool = (o.cool || 1.5) - dt;
      if (o.cool <= 0 && near) {
        if ((o.type === 'kuwagata' || o.type === 'ookami') && fFront(o, px, py, ex, ey, 300)) { o.state = 'charge'; o.timer = 1.4; o.cool = 2.4; sfx('dash', 0.9); if (o.type === 'ookami') { o.vy = -620; } }
        else if (o.type === 'gorira' || o.type === 'kurekame' || o.type === 'ookami') { o.face = px < ex ? -1 : 1; o.state = 'act'; o.timer = o.type === 'gorira' ? 0.8 : 0.6; if (o.type === 'gorira') sfx('stomp', 0.6); }
      }
      return true;
    }
    case 'pengin': {
      if (o.state === 'slide') { o.timer -= dt; fGrav(o, dt); o.vx = o.face * 360; moveBody(o, dt); o.fr = 2; if (o.onGround) { const ahead = Math.floor((o.face > 0 ? o.x + o.w + 2 : o.x - 2) / TILE), below = Math.floor((o.y + o.h + 4) / TILE); if (!isSolid(ahead, below) && !isOneWay(ahead, below)) o.vy = -520; } if (o.hitWall || o.timer <= 0) { o.state = 'walk'; o.face = o.hitWall ? -o.hitWall : o.face; } return true; }
      fWalk(o, dt, d.speed); o.fr = fr(5, 1); o.cool = (o.cool || 1) - dt;
      if (o.cool <= 0 && fFront(o, px, py, ex, ey, 320)) { o.state = 'slide'; o.timer = 1.6; o.cool = 2.6; sfx('dash', 1.4); }
      return true;
    }
    case 'yukidaruma': {
      fGrav(o, dt); o.face = px < ex ? -1 : 1;
      if (o.state === 'dizzy') { o.timer -= dt; o.vx = 0; moveBody(o, dt); o.fr = 2; if (o.timer <= 0) o.state = 'walk'; return true; }
      const fast = o.hp <= 1;
      o.vx = fast ? o.face * 70 : 0; moveBody(o, dt);
      o.timer -= dt; o.fr = o.timer < 0.4 ? 1 : (fast ? 2 : 0);
      if (o.timer <= 0 && near) { o.timer = fast ? 1.2 : 1.8; const dx = px - ex; fShot(ex, o.y + 6, clamp(dx * 1.1, -340, 340), -620, '#ffffff', 1300, 26); sfx('swing', 1.1); }
      return true;
    }
    case 'houtai': fWalk(o, dt, o.loose ? 150 : d.speed); o.fr = o.loose ? 2 : fr(4, 1); return true;
    case 'tokage': {
      fGrav(o, dt); o.vx = 0; moveBody(o, dt); if (o.state !== 'fire') o.face = px < ex ? -1 : 1;
      o.timer -= dt;
      if (o.state === 'walk') { o.fr = 0; if (o.timer <= 0 && near) { o.state = 'breath'; o.timer = 0.6; } }
      else if (o.state === 'breath') { o.fr = 1; if (o.timer <= 0) { o.state = 'fire'; o.timer = 0.8; const fx = o.face > 0 ? o.x + o.w : o.x - 4 * TILE; fHit(fx, o.y + 2, 4 * TILE, o.h - 6, 0.8, 'fire'); sfx('fire', 0.9); } }
      else { o.fr = 2; if (o.timer <= 0) { o.state = 'walk'; o.timer = 2.0; } }
      return true;
    }
    case 'tako': {
      o.x = o.x0 + Math.sin(o.ph * 0.7) * 110; o.y = o.y0 + Math.sin(o.ph * 1.6) * 16; o.face = Math.cos(o.ph * 0.7) > 0 ? 1 : -1;
      o.timer -= dt; o.fr = o.timer < 0.3 ? 2 : fr(3, 1);
      if (o.timer <= 0 && Math.abs(px - ex) < 160 && py > ey) { o.timer = 2.0; fShot(ex, o.y + o.h, 0, 160, '#7fd8ff', 500, 18); sfx('zap', 1.4); }
      else if (o.timer <= 0) o.timer = 0.3;
      return true;
    }
    case 'raijin': {
      if (o.state === 'dizzy') { o.timer -= dt; o.fr = 2; if (o.timer <= 0) o.state = 'walk'; return true; }
      o.x0 += clamp(px - ex, -1, 1) * 40 * dt; o.x = o.x0; o.y = o.y0 + Math.sin(o.ph * 1.4) * 20; o.face = px < ex ? -1 : 1;
      o.timer -= dt; o.fr = o.timer < 0.5 ? 1 : 0;
      if (o.timer <= 0 && near) { o.timer = 2.4; for (const a of [-0.6, 0, 0.6]) fShot(ex, o.y + o.h, Math.sin(a) * 260, Math.cos(a) * 260, '#fff36b', 0, 22); sfx('zap'); }
      return true;
    }
    case 'hitotsume': {
      fGrav(o, dt);
      const facing = (P.face > 0) === (ex > px);
      if (Math.abs(px - ex) < 520 && !facing) { o.face = px < ex ? -1 : 1; o.vx = o.face * 190; o.fr = 2; }
      else { o.vx = 0; o.fr = Math.abs(px - ex) < 520 ? 1 : 0; }
      moveBody(o, dt); if (o.hitWall && o.onGround) o.vy = -520;
      return true;
    }
    case 'kamakiri': {
      fGrav(o, dt); o.vx = 0; moveBody(o, dt); o.timer -= dt;
      if (o.state === 'walk') { o.face = px < ex ? -1 : 1; o.fr = 0; if (fFront(o, px, py, ex, ey, 130) && o.timer <= 0) { o.state = 'raise'; o.timer = 0.35; } }
      else if (o.state === 'raise') { o.fr = 1; if (o.timer <= 0) { o.state = 'slash'; o.timer = 0.3; fHit(o.face > 0 ? o.x + o.w - 6 : o.x - 64, o.y + 4, 70, o.h - 8, 0.25, 'slash'); sfx('swing', 1.3); } }
      else { o.fr = 2; if (o.timer <= 0) { o.state = 'walk'; o.timer = 1.0; } }
      return true;
    }
    case 'eisei': {
      o.x0 += clamp(px - ex, -1, 1) * 70 * dt; o.x = o.x0; o.y = o.y0 + Math.sin(o.ph * 2) * 6; o.face = px < ex ? -1 : 1;
      o.timer -= dt;
      if (o.state === 'walk') { o.fr = 0; if (o.timer <= 0 && near) { o.state = 'charge'; o.timer = 0.8; } }
      else if (o.state === 'charge') { o.fr = 1; if (o.timer <= 0) { o.state = 'beam'; o.timer = 0.9; const gy = groundYBelow(Math.floor(ex / TILE), Math.floor((o.y + o.h) / TILE) + 1) * TILE; fHit(ex - 14, o.y + o.h, 28, Math.max(10, gy - o.y - o.h), 0.9, 'beam'); sfx('zap', 0.8); } }
      else { o.fr = 2; if (o.timer <= 0) { o.state = 'walk'; o.timer = 2.4; } }
      return true;
    }
    case 'kagehebi': {
      if (o.state === 'lunge') { fGrav(o, dt); moveBody(o, dt); o.fr = 2; if (o.onGround && o.vy >= 0) { o.state = 'walk'; o.cool = 1.4; } return true; }
      fWalk(o, dt, d.speed); o.fr = fr(6, 1); o.cool = (o.cool || 0) - dt;
      if (o.cool <= 0 && fFront(o, px, py, ex, ey, 160)) { o.state = 'lunge'; o.vx = o.face * 300; o.vy = -420; sfx('swing', 1.5); }
      return true;
    }
    case 'kagami': {
      fGrav(o, dt);
      if (Math.abs(px - ex) < 420) { o.vx = -P.vx * 0.85; if (P.vy < -500 && o.onGround) o.vy = -720; o.face = px < ex ? -1 : 1; } else o.vx = 0;
      moveBody(o, dt); o.fr = o.hp <= 1 ? 2 : (o.onGround ? 0 : 1);
      return true;
    }
    case 'seizagumo': {
      o.timer -= dt; o.face = px < ex ? -1 : 1;
      if (o.state === 'up') { o.fr = 0; o.y = Math.max(o.topY, o.y - 120 * dt); if (Math.abs(px - ex) < 140 && py > ey) o.state = 'down'; }
      else { o.fr = 1; o.y = Math.min(o.topY + 4 * TILE, o.y + 160 * dt); if (Math.abs(px - ex) > 260) o.state = 'up'; }
      if (o.timer <= 0 && near) { o.timer = 2.2; o.fr = 2; for (const s of [-1, 1]) fShot(ex, o.y + o.h / 2, s * 200, 160, '#c8b8ff', 0, 18); sfx('zap', 1.6); }
      return true;
    }
    case 'ryusei': {
      if (o.state === 'dizzy') { o.timer -= dt; o.fr = 2; if (o.timer <= 0) o.state = 'walk'; return true; }
      o.x0 += clamp(px - ex, -1, 1) * 50 * dt; o.x = o.x0 + Math.sin(o.ph * 0.9) * 90; o.y = o.y0 + Math.sin(o.ph * 1.8) * 30; o.face = px < ex ? -1 : 1;
      o.timer -= dt; o.fr = o.timer < 0.5 ? 2 : fr(4, 1);
      if (o.timer <= 0 && near) { o.timer = 3; const a0 = Math.atan2(py - ey, px - ex); for (const k of [-0.36, -0.12, 0.12, 0.36]) fShot(ex, ey, Math.cos(a0 + k) * 280, Math.sin(a0 + k) * 280, '#ff8a3a', 0, 22); sfx('fire'); }
      return true;
    }
    case 'takara': {
      fGrav(o, dt);
      o.life -= dt;
      if (o.life <= 0) { o.gone = true; for (let i = 0; i < 9; i++) parts.push({ x: ex + rnd(-16, 16), y: ey + rnd(-12, 12), vx: rnd(-80, 80), vy: rnd(-90, -10), life: 0.5, max: 0.5, color: 'rgba(255,240,160,.9)', size: rnd(6, 10), g: 0, puff: true }); if (Math.abs(px - ex) < 700) popText(ex, ey - 20, 'にげられた…', '#fff'); return true; }
      const close = Math.abs(px - ex) < 300 && Math.abs(py - ey) < 200;
      if (close) { o.state = 'run'; o.face = px < ex ? 1 : -1; }
      o.vx = o.state === 'run' ? o.face * d.speed : 0;
      moveBody(o, dt);
      if (o.state === 'run' && o.onGround && (o.hitWall || !isSolid(Math.floor((o.face > 0 ? o.x + o.w + 4 : o.x - 4) / TILE), Math.floor((o.y + o.h + 4) / TILE)))) o.vy = -700;
      if (o.hitWall && o.onGround) o.face = -o.face;
      o.fr = o.state === 'run' ? fr(8, 1) : 2;
      if (Math.random() < dt * 6) sparkle(ex + rnd(-10, 10), o.y + rnd(0, o.h), 1);
      return true;
    }
    case 'bakudanbana': {
      fGrav(o, dt); o.vx = 0; moveBody(o, dt); o.timer -= dt;
      o.fr = o.timer < 0.5 ? 1 : 0;
      if (o.timer <= 0 && near) { o.timer = 3; o.fr = 2; const dx = px - ex; world.ents.push({ id: ++uid, t: 'x_shellbomb', x: ex - 12, y: o.y - 10, w: 24, h: 24, vx: clamp(dx * 0.9, -300, 300), vy: -560, ty: ROWS * TILE + 99 }); sfx('swing', 0.8); }
      return true;
    }
    case 'shinobi': {
      o.timer -= dt; o.face = px < ex ? -1 : 1;
      if (o.state === 'dive') { o.x += o.vx * dt; o.y += o.vy * dt; o.vy -= 500 * dt; o.fr = 2; if (o.vy < -200 && o.y <= o.y0) { o.state = 'walk'; o.y = o.y0; o.x0 = o.x; } return true; }
      o.x = o.x0 + Math.sin(o.ph * 1.2) * 60; o.y = o.y0 + Math.sin(o.ph * 2.4) * 10; o.fr = fr(6, 1);
      if (o.timer <= 0 && near) { const a = Math.atan2(py - ey, px - ex); fShot(ex, ey, Math.cos(a) * 300, Math.sin(a) * 300, '#2a2a3a', 0, 16); sfx('swing', 1.6); o.timer = 2.2; if (Math.abs(px - ex) < 300) { o.state = 'dive'; o.vx = o.face * 220; o.vy = 380; } }
      return true;
    }
    case 'tatsuno': {
      o.y = o.y0 + Math.sin(o.ph * 1.5) * 18; o.face = px < ex ? -1 : 1; o.timer -= dt; o.fr = o.timer < 0.3 ? 2 : fr(3, 1);
      if (o.timer <= 0 && near) { o.timer = 2.2; fShot(ex + o.face * 20, ey - 6, o.face * 170, 0, '#bdf2ff', 0, 22); sfx('bubble', 1.2); }
      return true;
    }
  }
  return false;
}
// ハルが ふれた とき。処理したら true
function pveF(o, falling) {
  const p = P, d = o.d;
  const bounce = (v = -480) => { p.vy = held('jump') ? -760 : v; p.jumping = held('jump'); p.combo = (p.combo || 0) + 1; sfx('stomp', 1 + Math.min(8, p.combo - 1) * 0.07); hitStop(0.035); dust(o.x + o.w / 2, o.y, 6); };
  if (d.strong) {
    if (falling) { bounce(-640); if (!(o.invT > 0)) fStrongHit(o); return true; }
    if (o.invT > 0 || o.state === 'dizzy') return true;
    if (overlap({ x: p.x + 4, y: p.y + 6, w: p.w - 8, h: p.h - 8 }, { x: o.x + 6, y: o.y + 6, w: o.w - 12, h: o.h - 8 })) hurtPlayer(o.x + o.w / 2, true);
    return true;
  }
  switch (o.type) {
    case 'houtai': if (falling && !o.loose) { bounce(); o.loose = true; world.score += 100; popText(o.x + o.w / 2, o.y, '+100'); return true; } return false;
    case 'kagami': if (falling && o.hp > 1) { bounce(); o.hp--; sfx('break', 1.8); sparkle(o.x + o.w / 2, o.y + 10, 8); return true; } return false;
    case 'takara': if (falling) { bounce(); dropCoins(o, 20); dropBit(o); defeat(o, false, p.combo); return true; } return true; // よこから さわっても いたくない
  }
  return false;
}
function swordF(o, p) {
  const d = o.d;
  if (d.strong) { if (!(o.invT > 0)) fStrongHit(o); return true; }
  if (o.type === 'takara') { dropCoins(o, 20); dropBit(o); }
  return false;
}

// ---------------- 差し込み口を つつむ ----------------
{
  const _init = initEnemyX, _upd = updateEnemyX, _pve = pveX, _sw = swordX, _de = drawEnemyX;
  initEnemyX = function (o, e) { if (o.d.xf) return initEnemyF(o, e); return _init(o, e); };
  updateEnemyX = function (o, dt, px, py, ex, ey) {
    if (o.d.xf && !(o.sleepT > 0)) return updateEnemyF(o, dt, px, py, ex, ey);
    return _upd(o, dt, px, py, ex, ey);
  };
  pveX = function (o, falling) {
    if (o.d.xf && !(o.sleepT > 0)) return pveF(o, falling);
    const r = _pve(o, falling);
    // 中ボス級: よこから ふれると ハート 2つ(前は 1つで ふめば 勝てた)
    if (!r && o.d.mid && !falling && !(o.sleepT > 0)) { const p = P; if (overlap({ x: p.x + 4, y: p.y + 6, w: p.w - 8, h: p.h - 8 }, { x: o.x + 6, y: o.y + 6, w: o.w - 12, h: o.h - 8 })) hurtPlayer(o.x + o.w / 2, true); return true; }
    return r;
  };
  // 中ボス級を たおすと コイン 10まいと いのちの かけら(前は ハート1つ だけで 戦う 理由が うすかった)
  if (typeof xMidHit === 'function') { const _mh = xMidHit; xMidHit = function (o) { _mh(o); if (o.hp <= 0 && !o.f7rew) { o.f7rew = true; dropCoins(o, 10); dropBit(o); } }; }
  swordX = function (o, p) { if (o.d.xf) return swordF(o, p); return _sw(o, p); };
  drawEnemyX = function (o, t) { if (o.d.xf) return drawEnemyF(o, t); return _de(o, t); };
}

// ---------------- 敵の 絵 ----------------
function fFrameDraw(type, f, cx, bottom, dh, flip, alpha = 1) {
  const n0 = 'xf_' + type + '_0', nf = 'xf_' + type + '_' + f, im0 = ART[n0], im = ART[nf] || im0;
  if (!im0) return false;
  const s = dh / im0.naturalHeight, h = im.naturalHeight * s, w = im.naturalWidth * s;
  drawImg(ART[nf] ? nf : n0, cx - w / 2, bottom - h, w, h, flip, alpha);
  return true;
}
function drawEnemyF(o, t) {
  const d = o.d, cx = o.x + o.w / 2, bottom = o.y + o.h + 3, flip = o.face > 0, dh = d.dh;
  ctx.save();
  if (o.dying) {
    ctx.translate(cx, o.y + o.h / 2); ctx.rotate(Math.PI); ctx.globalAlpha = Math.max(0, 1 - o.dyingT / 1.6);
    if (!fFrameDraw(o.type, 0, 0, dh / 2, dh, flip)) { ctx.filter = d.filter || 'none'; drawFit(d.img, 0, dh / 2, dh, flip); }
    ctx.restore(); return true;
  }
  let a = o.alpha ?? 1;
  if (d.strong && o.invT > 0 && Math.floor(o.invT * 20) % 2) a *= 0.45;
  ctx.globalAlpha = a;
  if (o.type === 'tako') { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, o.y - 20); ctx.lineTo(cx - 40, o.y - 120); ctx.stroke(); }
  if (o.type === 'seizagumo') { ctx.strokeStyle = 'rgba(200,190,255,.75)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, o.topY - 4 * TILE); ctx.lineTo(cx, o.y + 6); ctx.stroke(); }
  if ((o.type === 'eisei' && o.state === 'charge') || (o.type === 'tokage' && o.state === 'breath') || (o.type === 'raijin' && o.timer < 0.5)) { ctx.shadowColor = '#fff36b'; ctx.shadowBlur = 20; }
  if (o.type === 'takara') { ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = 14; }
  let by = bottom;
  if (!d.fly && o.onGround && Math.abs(o.vx || 0) > 5) by -= Math.abs(Math.sin(o.ph * 9)) * 2.5;
  if (!fFrameDraw(o.type, o.fr || 0, cx, by, dh, flip, 1)) { if (d.filter) ctx.filter = d.filter; drawFit(d.img, cx, by, dh, flip); ctx.filter = 'none'; }
  ctx.shadowBlur = 0;
  if (o.sleepT > 0) { ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2a2a4a'; ctx.lineWidth = 3; ctx.font = '800 16px "M PLUS Rounded 1c", sans-serif'; const zy = o.y - 8 - Math.sin(t * 3) * 4; ctx.strokeText('Zzz', cx - 12, zy); ctx.fillText('Zzz', cx - 12, zy); }
  if (d.strong) { ctx.globalAlpha = 1; for (let i = 0; i < o.maxHp; i++) { ctx.fillStyle = i < o.hp ? '#ff7a3a' : 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(cx - (o.maxHp - 1) * 9 + i * 18, o.y - 14, 6, 0, 7); ctx.fill(); ctx.strokeStyle = '#2a1a3a'; ctx.lineWidth = 2; ctx.stroke(); } }
  ctx.restore();
  return true;
}

// ---------------- しかけ ----------------
function spawnF(e, X, Y, o, id) {
  const gyAt = x => groundYBelow(x, e.y !== undefined ? e.y : 0);
  switch (e.type) {
    // はこびどり: せなかに のると 右へ とぶ。とまった あと だれも のって いないと もどる
    case 'f7_bird': return { id, t: 'f7_bird', x: X, y: Y, x0: X, y0: Y, w: 110, h: 18, dist: (o.dist || 28) * TILE, plat: true, dx: 0, dy: 0, state: 'wait', timer: 0 };
    // ゴンドラ: 2つの えきの 間を ずっと 行ったり 来たり(えきで 1.2びょう とまる)
    case 'f7_gondola': return { id, t: 'f7_gondola', x: X, y: Y, ax: X, ay: Y, bx: X + (o.dist || 28) * TILE, by: Y + (o.dy || 0) * TILE, w: 120, h: 18, plat: true, dx: 0, dy: 0, k: 0, dir: 1, stop: 1.2, phs: o.phase || 0 };
    // ほうせんかの たいほう: はいると 0.5びょうで きまった 向きに うちだす
    case 'f7_pod': return { id, t: 'f7_pod', x: X - 4, y: Y - 8, w: 56, h: 56, ang: (o.ang ?? -50) * Math.PI / 180, power: o.power || 1200, recoil: 0, fireT: 0 };
    // じょうき リフト: 3びょうごとに ふたが 上へ ふきあがり、上で 1.6びょう とまって おりる
    case 'f7_steam': { const gy = gyAt(e.x); return { id, t: 'f7_steam', x: X, y: gy * TILE - 18, y0: gy * TILE - 18, top: gy * TILE - 18 - (o.rise || 8) * TILE, w: 96, h: 18, plat: true, dx: 0, dy: 0, cyc: o.phase || 0, per: o.per || 6.4 }; }
    // のびる はし: レバー(けん・ふれる)で 右へ のびる。10びょうで はしから じゅんに ひっこむ
    case 'f7_lever': return { id, t: 'f7_lever', x: X + 6, y: Y + 6, w: 36, h: 42, g: o.g || 0, on: false, cd: 0 };
    case 'f7_bridge': return { id, t: 'f7_bridge', x: X, y: Y, w: (o.n || 28) * TILE, h: 16, n: o.n || 28, g: o.g || 0, ext: 0, hold: 0, plat: false, dx: 0, dy: 0 };
    // ほのおの ふきだし: やすみ → けむり(あいず)→ ほのお 3マス
    case 'f7_flame': { const gy = gyAt(e.x); return { id, t: 'f7_flame', x: X + 4, y: gy * TILE - 8, w: 40, h: 8, gy: gy * TILE, per: o.per || 2.6, phs: o.phase || 0, hgt: (o.hgt || 3) * TILE, state: 'off' }; }
    // せまる いわかべ: 上から いわが おりて くる(はさまれると ハート 2つ)
    case 'f7_walls': { const gy = gyAt(e.x); return { id, t: 'f7_walls', x: X, y: (o.top || 1) * TILE, y0: (o.top || 1) * TILE, gy: gy * TILE, w: (o.w || 2) * TILE, h: TILE * 2, per: o.per || 3.2, phs: o.phase || 0, ext: 0, solid: false }; }
    // トゲまるた: かべの 間を ころがって 行ったり 来たり
    case 'f7_roller': { const gy = gyAt(e.x); return { id, t: 'f7_roller', x: X, y: gy * TILE - 44, w: 44, h: 44, vx: (o.sp || 170) * (o.dir || -1), minX: X - (o.range || 8) * TILE, maxX: X + (o.range || 8) * TILE, rot: 0 }; }
    // くもの す: 中は おそくなる。けんで きると 6びょう きえる
    case 'f7_web': return { id, t: 'f7_web', x: X, y: Y, w: (o.w || 2) * TILE, h: (o.h || 2) * TILE, cut: 0 };
    // はぐるま: まるい 足場。上に のると まわる 向きに はこばれる(4びょうで 向きが かわる)
    case 'f7_cog': return { id, t: 'f7_cog', x: X - 24, y: Y, w: 96, h: 18, cx: X + 24, cy: Y + 48, plat: true, dx: 0, dy: 0, dir: o.dir || 1, per: o.per || 4, phs: o.phase || 0, rot: 0 };
    // すなどけいの 足場: のって 2びょうで くずれる。4びょうで もどる
    case 'f7_sand': return { id, t: 'f7_sand', x: X, y: Y, w: (o.w || 2) * TILE, h: 18, plat: true, dx: 0, dy: 0, t0: -1, gone2: 0 };
    // 力の いのちの かけらを まもる おり(つよい敵を たおすと ひらく)
    case 'f7_gate': return { id, t: 'f7_gate', x: X + 8, y: Y, y0: Y, w: 32, h: (o.h || 2) * TILE, g: o.g || 0, open: false, solid: true };
  }
  return null;
}
function updateThingF(o, dt) {
  const p = P;
  const feet = (tol = 8) => !p.dead && p.onGround && Math.abs(p.y + p.h - o.y) < tol && p.x + p.w > o.x + 2 && p.x < o.x + o.w - 2;
  switch (o.t) {
    case 'f7_bit': {
      o.vy = Math.min((o.vy || 0) + 1400 * dt, 600); o.y += o.vy * dt;
      const gy = groundYBelow(Math.floor((o.x + 16) / TILE), Math.max(0, Math.floor(o.y / TILE)));
      if (o.y + o.h > gy * TILE && o.vy > 0) { o.y = gy * TILE - o.h; o.vy = 0; }
      if (o.y > ROWS * TILE + 60) o.gone = true;
      if (!p.dead && overlap(p, o)) { o.gone = true; lifeBit(o.x + 16, o.y); sparkle(o.x + 16, o.y + 16, 14); }
      return true;
    }
    case 'f7_hit': {
      o.life -= dt; if (o.life <= 0) { o.gone = true; return true; }
      if (!p.dead && overlap({ x: p.x + 4, y: p.y + 6, w: p.w - 8, h: p.h - 8 }, o)) hurtPlayer(o.x + o.w / 2);
      return true;
    }
    case 'f7_bird': {
      const px0 = o.x, py0 = o.y, on = feet();
      if (o.state === 'wait') { o.y = o.y0 + Math.sin(o.ph * 3) * 4; if (on) { o.state = 'fly'; sfx('swing', 0.8); } }
      else if (o.state === 'fly') { o.x = Math.min(o.x0 + o.dist, o.x + 190 * dt); o.y = o.y0 + Math.sin(o.ph * 2.2) * 22; if (o.x >= o.x0 + o.dist) { o.state = 'land'; o.timer = 1.5; } }
      else if (o.state === 'land') { o.timer -= dt; o.y = lerp(o.y, o.y0, dt * 4); if (!on) { o.timer = Math.min(o.timer, 1.2); if (o.timer <= 0) o.state = 'back'; } }
      else if (o.state === 'back') { o.x = Math.max(o.x0, o.x - 260 * dt); o.y = o.y0 - 60 + Math.sin(o.ph * 2) * 10; if (o.x <= o.x0) { o.state = 'wait'; o.y = o.y0; } }
      // とちゅうで おちたら もどる
      if (o.state === 'fly' && !on && (p.dead || p.y > o.y + 2 * TILE)) o.state = 'back';
      o.dx = o.x - px0; o.dy = o.y - py0; return true;
    }
    case 'f7_gondola': {
      const px0 = o.x, py0 = o.y;
      if (o.stop > 0) o.stop -= dt;
      else { o.k += o.dir * dt * 160 / Math.hypot(o.bx - o.ax, o.by - o.ay); if (o.k >= 1) { o.k = 1; o.dir = -1; o.stop = 1.2; } else if (o.k <= 0) { o.k = 0; o.dir = 1; o.stop = 1.2; } }
      o.x = lerp(o.ax, o.bx, o.k); o.y = lerp(o.ay, o.by, o.k);
      o.dx = o.x - px0; o.dy = o.y - py0; return true;
    }
    case 'f7_pod': {
      // 中の うごきは ほしの たいほうと 同じ(p.inCannon → fireCannon)。ここでは 入るのを 見るだけ
      if (o.recoil > 0) o.recoil = Math.max(0, o.recoil - dt * 3);
      if (!p.dead && !p.inCannon && !p.zip && !(p.cannonCD > 0) && overlap({ x: p.x + 4, y: p.y + 10, w: p.w - 8, h: p.h - 10 }, { x: o.x + 6, y: o.y + 6, w: o.w - 12, h: o.h - 6 })) {
        p.inCannon = o; o.fireT = 0.5; p.vx = 0; p.vy = 0; sfx('spring', 0.8);
        if (!world.seenPod) { world.seenPod = true; toast = { text: 'ほうせんかの たいほう', sub: 'はいると はじけて とばされる', t: 2.2 }; }
      }
      return true;
    }
    case 'f7_steam': {
      const py0 = o.y; o.cyc = (o.cyc + dt) % o.per;
      // まって(2.0)→ のぼる(1.4)→ 上で とまる(1.6)→ おりる(1.4)。速さは 1こまで 5px より 小さく(のった ハルが ぬけおちない)
      const wait = 2.0, rise = 1.4, stay = 1.6, fall = 1.4, c = o.cyc - wait;
      if (c < 0) o.y = o.y0;
      else if (c < rise) o.y = lerp(o.y0, o.top, c / rise);
      else if (c < rise + stay) o.y = o.top;
      else if (c < rise + stay + fall) o.y = lerp(o.top, o.y0, (c - rise - stay) / fall);
      else o.y = o.y0;
      if (c >= 0 && c < rise && Math.random() < dt * 30) parts.push({ x: o.x + rnd(10, o.w - 10), y: o.y + 20, vx: rnd(-20, 20), vy: rnd(40, 120), life: 0.6, max: 0.6, color: 'rgba(240,240,255,.7)', size: rnd(10, 18), g: 0, puff: true });
      o.dx = 0; o.dy = o.y - py0; return true;
    }
    case 'f7_lever': {
      if (o.cd > 0) o.cd -= dt;
      const hit = !p.dead && overlap(p, o) || (p.attackT > 0 && Math.abs(p.x + p.w / 2 + p.face * 40 - (o.x + o.w / 2)) < 50 && Math.abs(p.y + p.h / 2 - (o.y + o.h / 2)) < 50);
      if (hit && o.cd <= 0) { o.cd = 1; o.on = !o.on || true; sfx('door', 1.3); for (const b of world.ents) if (b.t === 'f7_bridge' && b.g === o.g && !b.go) { if (b.x0 === undefined) b.x0 = b.x; b.a = 0; b.b = 0; b.hold = 10; b.go = true; } if (!world.seenLever) { world.seenLever = true; toast = { text: 'のびる はし!', sub: '10びょうで ひっこむよ。いそいで わたろう', t: 2.4 }; } }
      return true;
    }
    case 'f7_bridge': {
      // a〜b の マスだけ 板が ある。のびる: b が ふえる / 10びょう まって / ひっこむ: 手前(a)から きえる
      if (o.x0 === undefined) { o.x0 = o.x; o.a = 0; o.b = 0; }
      if (o.go) { o.b = Math.min(o.n, o.b + dt * 9); if (o.b >= o.n) { o.hold -= dt; if (o.hold <= 0) o.go = false; } }
      else if (o.b > 0) { o.a = Math.min(o.n, o.a + dt * 5); if (o.a >= o.n) { o.a = 0; o.b = 0; } }
      const A = Math.floor(o.a), B = Math.floor(o.b);
      o.x = o.x0 + A * TILE; o.w = Math.max(1, (B - A) * TILE); o.plat = B - A >= 1;
      o.dx = 0; o.dy = 0; return true;
    }
    case 'f7_flame': {
      const c = ((world.time + o.phs) % o.per + o.per) % o.per;
      o.state = c < o.per - 1.4 ? 'off' : c < o.per - 0.8 ? 'warn' : 'on';
      if (o.state === 'warn' && Math.random() < dt * 14) parts.push({ x: o.x + rnd(6, o.w - 6), y: o.y, vx: rnd(-10, 10), vy: rnd(-90, -40), life: 0.5, max: 0.5, color: 'rgba(90,80,90,.6)', size: rnd(8, 14), g: 0, puff: true });
      if (o.state === 'on' && !p.dead && overlap({ x: p.x + 4, y: p.y + 6, w: p.w - 8, h: p.h - 8 }, { x: o.x + 4, y: o.gy - o.hgt, w: o.w - 8, h: o.hgt })) hurtPlayer(o.x + o.w / 2);
      return true;
    }
    case 'f7_walls': {
      const c = ((world.time + o.phs) % o.per + o.per) % o.per;
      // 0〜1.4 上で まつ / 1.4〜1.8 ゆれる(あいず)/ 1.8〜2.1 おちる / 2.1〜2.5 下 / 2.5〜 もどる
      const maxE = o.gy - o.y0 - o.h;
      let e = 0;
      if (c < 1.8) e = 0; else if (c < 2.1) e = (c - 1.8) / 0.3; else if (c < 2.5) e = 1; else e = Math.max(0, 1 - (c - 2.5) / Math.max(0.1, o.per - 2.5));
      o.shake = c > 1.4 && c < 1.8; o.y = o.y0 + e * maxE; o.ext = e;
      if (e > 0.85 && c < 2.5 && !p.dead && overlap({ x: p.x + 6, y: p.y + 4, w: p.w - 12, h: p.h - 4 }, o)) hurtPlayer(o.x + o.w / 2, true);
      // ふだんは 下から 頭を うたない よう 当たりは 上の 面だけ
      return true;
    }
    case 'f7_roller': {
      o.x += o.vx * dt; o.rot += o.vx * dt / 22;
      if (o.x < o.minX || isSolid(Math.floor((o.x - 2) / TILE), Math.floor((o.y + o.h / 2) / TILE))) { o.vx = Math.abs(o.vx); }
      if (o.x + o.w > o.maxX || isSolid(Math.floor((o.x + o.w + 2) / TILE), Math.floor((o.y + o.h / 2) / TILE))) { o.vx = -Math.abs(o.vx); }
      if (!p.dead && overlap({ x: p.x + 4, y: p.y + 6, w: p.w - 8, h: p.h - 8 }, { x: o.x + 4, y: o.y + 4, w: o.w - 8, h: o.h - 4 })) hurtPlayer(o.x + o.w / 2);
      return true;
    }
    case 'f7_web': {
      if (o.cut > 0) { o.cut -= dt; return true; }
      if (p.attackT > 0 && overlap({ x: p.x + (p.face > 0 ? p.w : -60), y: p.y, w: 60, h: p.h }, o)) { o.cut = 6; sfx('swing', 1.6); burst(o.x + o.w / 2, o.y + o.h / 2, '#ffffff', 10, 160, 4); return true; }
      if (!p.dead && overlap(p, o)) { p.vx *= Math.pow(0.02, dt); if (p.vy < 0) p.vy *= Math.pow(0.05, dt); if (p.vy > 120) p.vy = 120; p.webT = 0.1; }
      return true;
    }
    case 'f7_cog': {
      const c = ((world.time + o.phs) % (o.per * 2) + o.per * 2) % (o.per * 2), dir = c < o.per ? o.dir : -o.dir;
      o.rot += dir * dt * 2.2; o.cdir = dir;
      o.dx = feet() ? dir * 110 * dt : 0; o.dy = 0;
      return true;
    }
    case 'f7_sand': {
      if (o.gone2 > 0) { o.gone2 -= dt; o.plat = false; if (o.gone2 <= 0) { o.plat = true; o.t0 = -1; } return true; }
      if (feet() && o.t0 < 0) o.t0 = 0;
      if (o.t0 >= 0) { o.t0 += dt; if (o.t0 > 2) { o.gone2 = 4; o.plat = false; sfx('break', 1.2); burst(o.x + o.w / 2, o.y + 6, '#e6c27a', 12, 160, 4); } }
      o.dx = 0; o.dy = 0; return true;
    }
    case 'f7_gate': {
      if (o.open) { o.y -= 160 * dt; o.solid = false; if (o.y < o.y0 - o.h - 20) o.gone = true; if (!o.told) { o.told = true; sfx('door'); toast = { text: 'おりが ひらいた!', sub: 'つよい 敵を たおした ごほうび', t: 2 }; } }
      return true;
    }
  }
  return false;
}
function drawThingF(o, t) {
  switch (o.t) {
    case 'f7_bit': { const k = 1 + Math.sin(t * 6) * 0.08; if (!ART.g7_1uppiece || !drawFit('g7_1uppiece', o.x + 16, o.y + 32, 32 * k)) { ctx.fillStyle = '#7dff8a'; ctx.beginPath(); ctx.moveTo(o.x + 16, o.y); ctx.lineTo(o.x + 30, o.y + 16); ctx.lineTo(o.x + 16, o.y + 32); ctx.lineTo(o.x + 2, o.y + 16); ctx.fill(); } return true; }
    case 'f7_hit': {
      const a = Math.min(1, o.life / 0.15);
      ctx.save(); ctx.globalAlpha = a;
      if (o.kind === 'fire') { const g = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0); g.addColorStop(0, 'rgba(255,220,80,.95)'); g.addColorStop(1, 'rgba(255,90,30,.6)'); ctx.fillStyle = g; rr(o.x, o.y + 4, o.w, o.h - 8, 14); ctx.fill(); }
      else if (o.kind === 'beam') { const g = ctx.createLinearGradient(0, o.y, 0, o.y + o.h); g.addColorStop(0, 'rgba(180,255,255,.95)'); g.addColorStop(1, 'rgba(120,200,255,.5)'); ctx.fillStyle = g; ctx.fillRect(o.x, o.y, o.w, o.h); }
      else { ctx.strokeStyle = 'rgba(220,255,200,.95)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, -1.2, 1.2); ctx.stroke(); }
      ctx.restore(); return true;
    }
    case 'f7_bird': {
      const f = Math.floor(t * (o.state === 'wait' ? 4 : 9)) % 2;
      if (!(ART.g7_bird_0 && drawFit(f ? 'g7_bird_1' : 'g7_bird_0', o.x + o.w / 2, o.y + 64, 110))) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y + 8, o.w / 2, 18, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#2a1a3a'; ctx.lineWidth = 3; ctx.stroke(); }
      return true;
    }
    case 'f7_gondola': {
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(o.ax + o.w / 2, o.ay - 70); ctx.lineTo(o.bx + o.w / 2, o.by - 70); ctx.stroke();
      for (const [sx, sy] of [[o.ax, o.ay], [o.bx, o.by]]) if (!(ART.g7_station && drawFit('g7_station', sx + o.w / 2 + (sx === o.ax ? -70 : 70), sy + 40, 130))) { ctx.fillStyle = '#7a4a2a'; ctx.fillRect(sx + o.w / 2 - 6 + (sx === o.ax ? -70 : 70), sy - 80, 12, 120); }
      if (!(ART.g7_gondola && drawFit('g7_gondola', o.x + o.w / 2, o.y + 34, 110))) { ctx.fillStyle = '#c0703a'; ctx.fillRect(o.x, o.y, o.w, 30); ctx.strokeStyle = '#3a2a1a'; ctx.beginPath(); ctx.moveTo(o.x + o.w / 2, o.y); ctx.lineTo(o.x + o.w / 2, o.y - 70); ctx.stroke(); }
      return true;
    }
    case 'f7_pod': { const open = o.recoil > 0.3; ctx.save(); ctx.translate(o.x + o.w / 2, o.y + o.h); ctx.rotate(o.ang + Math.PI / 2); if (!(ART.g7_pod_0 && drawFit(open ? 'g7_pod_1' : 'g7_pod_0', 0, 0, 84))) { ctx.fillStyle = '#5ac85a'; ctx.beginPath(); ctx.ellipse(0, -36, 24, 38, 0, 0, 7); ctx.fill(); } ctx.restore(); return true; }
    case 'f7_steam': {
      if (!(ART.g7_steam && drawFit('g7_steam', o.x + o.w / 2, o.y0 + 18 + 30, 54))) { ctx.fillStyle = '#5a5a6a'; ctx.fillRect(o.x + 20, o.y0 + 10, o.w - 40, 30); }
      if (o.y < o.y0 - 4) { ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#eef'; ctx.fillRect(o.x + 30, o.y + 16, o.w - 60, o.y0 - o.y); ctx.restore(); }
      if (!(ART.g7_lid && drawFit('g7_lid', o.x + o.w / 2, o.y + 30, 40))) { ctx.fillStyle = '#8a8a9a'; rr(o.x, o.y, o.w, o.h, 8); ctx.fill(); }
      return true;
    }
    case 'f7_lever': drawFit(ART.g7_lever_0 ? (o.on ? 'g7_lever_1' : 'g7_lever_0') : 'switch', o.x + o.w / 2, o.y + o.h, 46); return true;
    case 'f7_bridge': {
      if (!o.plat) return true;
      const n = Math.round(o.w / TILE), warn = !o.go && o.b >= o.n ? 0 : (o.go && o.hold < 3 && o.b >= o.n);
      for (let i = 0; i < n; i++) { const bx = o.x + i * TILE, sh = warn ? Math.sin(t * 40 + i) * 1.5 : 0; if (!gDraw('g7_bridge', bx - 2, o.y - 6 + sh, TILE + 4, 30)) { ctx.fillStyle = '#b07a3a'; ctx.fillRect(bx, o.y, TILE - 2, o.h); } }
      if (o.go && o.b >= o.n) outlined(Math.ceil(o.hold) + '', o.x0 + o.n * TILE / 2, o.y - 40, o.hold < 3 ? '#ff6a6a' : '#fff', '#2a1a3a', 5, titleFont(22));
      return true;
    }
    case 'f7_flame': {
      if (!(ART.g7_vent && drawFit('g7_vent', o.x + o.w / 2, o.gy + 4, 30))) { ctx.fillStyle = '#4a4040'; ctx.fillRect(o.x - 4, o.gy - 10, o.w + 8, 12); }
      if (o.state === 'on') { ctx.save(); const fl = 1 + Math.sin(t * 30) * 0.06; if (!gDraw('g7_flame', o.x - 8, o.gy - o.hgt * fl, o.w + 16, o.hgt * fl)) { const g = ctx.createLinearGradient(0, o.gy - o.hgt, 0, o.gy); g.addColorStop(0, 'rgba(255,230,90,.2)'); g.addColorStop(1, 'rgba(255,100,30,.95)'); ctx.fillStyle = g; ctx.fillRect(o.x, o.gy - o.hgt, o.w, o.hgt); } ctx.restore(); }
      return true;
    }
    case 'f7_walls': {
      const sx = o.shake ? Math.sin(t * 60) * 2 : 0;
      // つりさげの くさり
      ctx.strokeStyle = '#4a4050'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(o.x + o.w / 2, 0); ctx.lineTo(o.x + o.w / 2, o.y); ctx.stroke();
      ctx.save(); ctx.translate(o.x + o.w / 2 + sx, o.y + o.h / 2); ctx.rotate(Math.PI / 2);
      if (!gDraw('g7_wall', -o.h / 2 - 4, -o.w / 2 - 4, o.h + 8, o.w + 8)) { ctx.fillStyle = '#6a6070'; ctx.fillRect(-o.h / 2, -o.w / 2, o.h, o.w); }
      ctx.restore();
      if (o.shake) { ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#ff4a4a'; ctx.fillRect(o.x, o.gy - 8, o.w, 8); ctx.restore(); }
      return true;
    }
    case 'f7_roller': { ctx.save(); ctx.translate(o.x + o.w / 2, o.y + o.h / 2); ctx.rotate(o.rot); if (!gDraw('g7_roller', -30, -30, 60, 60)) { ctx.fillStyle = '#8a5a2a'; ctx.beginPath(); ctx.arc(0, 0, 22, 0, 7); ctx.fill(); ctx.fillStyle = '#ddd'; for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(18, -5); ctx.lineTo(30, 0); ctx.lineTo(18, 5); ctx.fill(); } } ctx.restore(); return true; }
    case 'f7_web': { if (o.cut > 0) return true; ctx.save(); ctx.globalAlpha = 0.85; if (!gDraw('g7_web', o.x, o.y, o.w, o.h)) { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(o.x + o.w / 2, o.y + o.h / 2); ctx.lineTo(o.x + o.w / 2 + Math.cos(i) * o.w / 2, o.y + o.h / 2 + Math.sin(i) * o.h / 2); ctx.stroke(); } } ctx.restore(); return true; }
    case 'f7_cog': { ctx.save(); ctx.translate(o.cx, o.cy); ctx.rotate(o.rot); if (!gDraw('g7_cog', -54, -54, 108, 108)) { ctx.fillStyle = '#d8a83a'; ctx.beginPath(); ctx.arc(0, 0, 48, 0, 7); ctx.fill(); } ctx.restore(); if (o.cdir) { outlined(o.cdir > 0 ? '▶' : '◀', o.cx, o.cy + 4, '#fff', '#2a1a3a', 4, font(16)); } return true; }
    case 'f7_sand': {
      if (!o.plat) return true;
      const k = o.t0 >= 0 ? Math.sin(t * 50) * 1.5 : 0;
      if (!gDraw('g7_bridge', o.x - 2 + k, o.y - 6, o.w + 4, 30)) { ctx.fillStyle = '#e6c27a'; ctx.fillRect(o.x, o.y, o.w, o.h); }
      ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = '#e6c27a'; ctx.fillRect(o.x, o.y - 2, o.w, 4); if (o.t0 >= 0) { ctx.fillStyle = '#ff6a4a'; ctx.fillRect(o.x, o.y - 6, o.w * Math.min(1, o.t0 / 2), 4); } ctx.restore();
      return true;
    }
    case 'f7_gate': { ctx.fillStyle = '#5a5a6a'; for (let i = 0; i < 3; i++) ctx.fillRect(o.x + 2 + i * 12, o.y, 6, o.h); ctx.fillRect(o.x, o.y, o.w, 6); ctx.fillRect(o.x, o.y + o.h - 6, o.w, 6); return true; }
  }
  return false;
}
{
  const _sp = spawnX, _ut = updateThingX, _dt = drawThingX;
  spawnX = function (e, X, Y, o, id) { return spawnF(e, X, Y, o, id) || _sp(e, X, Y, o, id); };
  updateThingX = function (o, dt) { if (o.t && o.t.startsWith('f7_')) return updateThingF(o, dt); return _ut(o, dt); };
  drawThingX = function (o, t) { if (o.t && o.t.startsWith('f7_')) return drawThingF(o, t); return _dt(o, t); };
}

// ---------------- 面への 置き方 ----------------
// ワールドごとの: 乗り物の しかけ(T)・あぶない しかけ(H)・ふつうの 新しい 敵(g 地面 / f 空 / w 水)・つよい敵(s)
const FW = {
  1: { T: ['bird'], H: ['roller', 'sand'], g: [], f: ['momonga'], s: 'kuwagata' },
  2: { T: ['gondola', 'bird'], H: ['roller', 'sand'], g: ['pengin'], f: [], s: 'yukidaruma', w: ['tatsuno'] },
  3: { T: ['pod', 'steam'], H: ['flame', 'sand'], g: ['houtai', 'tokage', 'bakudanbana'], f: [], s: 'kuwagata' },
  4: { T: ['steam', 'gondola'], H: ['walls', 'web'], g: [], f: ['tako'], s: 'raijin' },
  5: { T: ['bridge', 'bird'], H: ['web', 'flame'], g: ['hitotsume'], f: ['shinobi'], s: 'ookami' },
  6: { T: ['cog', 'gondola'], H: ['roller', 'web'], g: ['kamakiri'], f: [], s: 'gorira', w: ['tatsuno'] },
  7: { T: ['bird', 'steam'], H: ['sand', 'walls'], g: [], f: ['eisei'], s: 'kurekame' },
  8: { T: ['bridge', 'pod'], H: ['walls', 'flame'], g: ['kagehebi', 'kagami', 'bakudanbana'], f: ['shinobi'], s: 'ookami' },
  9: { T: ['pod', 'bridge', 'cog', 'steam'], H: ['walls', 'flame', 'web', 'roller'], g: ['kagami'], f: ['seizagumo', 'eisei'], s: 'ryusei' },
};
FW[10] = FW[9];
XF_WORLD.kuwagata = '1・3';
const F_HINT = {
  bird: ['はこびどり', 'せなかに のると むこう岸まで はこんでくれる'], gondola: ['ゴンドラ', 'えきで まって のりこもう'], pod: ['ほうせんかの たいほう', 'はいると はじけて とばされる'],
  steam: ['じょうき リフト', 'ふたに のって まつと 上へ ふきあがる'], bridge: ['のびる はし', 'レバーに さわると はしが のびる。10びょうで ひっこむ'],
  roller: ['トゲまるた', 'ころがってくる。ジャンプで よけよう'], sand: ['すなどけいの 足場', 'のって 2びょうで くずれる'], flame: ['ほのおの ふきだし', 'けむりが 出たら あいず'],
  walls: ['おちてくる いわ', 'ゆれたら おちてくる。下に いると ハート 2つ'], web: ['くもの す', '中は おそくなる。けんで きれる'], cog: ['はぐるま', 'のると まわる 向きに はこばれる'],
  arena: ['つよい 敵!', 'たおすと コインと いのちの かけら。おりも ひらく'],
};
if (typeof EN_DICT !== 'undefined') Object.assign(EN_DICT, {
  'はこびどり': 'Carrier Bird', 'せなかに のると むこう岸まで はこんでくれる': 'Ride on its back across the gap', 'ゴンドラ': 'Gondola', 'えきで まって のりこもう': 'Wait at the station and hop on',
  'ほうせんかの たいほう': 'Seed Pod Cannon', 'はいると はじけて とばされる': 'Hop in and it bursts you out', 'じょうき リフト': 'Steam Lift', 'ふたに のって まつと 上へ ふきあがる': 'Stand on the lid and wait to blast up',
  'のびる はし': 'Extending Bridge', 'レバーに さわると はしが のびる。10びょうで ひっこむ': 'Touch the lever to extend it. It pulls back in 10 sec',
  'トゲまるた': 'Spiked Log', 'ころがってくる。ジャンプで よけよう': 'It rolls at you. Jump over it', 'すなどけいの 足場': 'Hourglass Ledge', 'のって 2びょうで くずれる': 'Crumbles 2 sec after you step on',
  'ほのおの ふきだし': 'Flame Vent', 'けむりが 出たら あいず': 'Smoke means fire is coming', 'おちてくる いわ': 'Falling Slab', 'ゆれたら おちてくる。下に いると ハート 2つ': 'It shakes, then drops. Costs 2 hearts',
  'くもの す': 'Spider Web', '中は おそくなる。けんで きれる': 'Slows you down. Cut it with the sword', 'はぐるま': 'Cog', 'のると まわる 向きに はこばれる': 'It carries you the way it spins',
  'つよい 敵!': 'Tough enemy!', 'たおすと コインと いのちの かけら。おりも ひらく': 'Beat it for coins and a life piece. The cage opens too',
  'いのちの かけら!': 'Life piece!', '3つ あつめると 1UP': 'Collect 3 for a 1UP', 'おりが ひらいた!': 'The cage opened!', 'つよい 敵を たおした ごほうび': 'Your reward for beating a tough enemy',
  'のびる はし!': 'Extending bridge!', '10びょうで ひっこむよ。いそいで わたろう': 'It pulls back in 10 sec. Hurry!', 'にげられた…': 'It got away...',
  'ゲームオーバー': 'GAME OVER', 'ちゅうかんから つづける': 'Continue from checkpoint', 'この ステージの さいしょから': 'Restart this stage', 'ちずへ もどる': 'Back to map',
  '1UP!': '1UP!', 'のこりが 1つ ふえた。のこりが 0 に なると ゲームオーバー': 'One more life. At zero lives it is game over', 'のこりが 1つ ふえた(1UP)': 'One more life (1UP)',
  'いのちの ほし': 'Life Star', 'コイン 80まいで 1UP(ふつうは 100まい)': '1UP every 80 coins (normally 100)', 'みどりの おまもり': 'Green Charm', 'ゲームオーバーから つづけると のこり 7': 'Continue after game over with 7 lives',
  'めずらしい': 'Rare', 'ひみつの みち・ばったり': 'Secret paths, chance battles', 'ひみつの みち': 'Secret paths', 'ばったり': 'Chance battles',
});
if (typeof EN_PAT !== 'undefined') {
  EN_PAT.unshift([/^いのちの かけら (\d)\/3$/, m => 'Life piece ' + m[1] + '/3']);
  EN_PAT.unshift([/^あつめた コインと ずかんは そのまま。のこり (\d+) で つづけられるよ$/, m => 'Your coins and Monster Book stay. Continue with ' + m[1] + ' lives']);
}
const FSKIP_ID = new Set([85, 86, 900, 57, 60, 59, 61]);
// ほうせんかの たいほうの 力(穴を こえて むこう岸に おりる 力。tools/r1017_pod.js で はかる)
let F_POD_POWER = 1500;
function fSections(S, L, def) {
  const H = y => Math.max(3, y);
  const F = {};
  const cp = (x, top) => { if (!L.cpNear(x, 20)) L.put(x, top - 1, 'C'); };
  // 乗り物: どれも 穴は 28マス 以上(つばさの 二段ジャンプでも とどかない)
  F.bird = (x, top, w, o) => { L.ground(x, x + 4, top); cp(x + 1, top); L.hazard(x + 3, 'f7_bird', { y: top - 1, dist: 31 }); if (o.mush) L.put(x + 19, H(top - 5), 'u'); else L.row(x + 15, H(top - 4), 'ooo'); if (w.f[0]) L.enemy(x + 24, w.f[0], { y: H(top - 5) }); L.ground(x + 36, x + 40, top); return x + 41; };
  F.gondola = (x, top, w, o) => { L.ground(x, x + 5, top); cp(x + 1, top); L.hazard(x + 4, 'f7_gondola', { y: top - 1, dist: 30, dy: 0 }); if (o.mush) L.put(x + 20, H(top - 4), 'u'); else L.row(x + 17, H(top - 4), 'ooo'); L.ground(x + 36, x + 41, top); return x + 42; };
  F.pod = (x, top, w, o) => { L.ground(x, x + 4, top); cp(x + 1, top); L.hazard(x + 3, 'f7_pod', { y: top - 1, ang: -48, power: F_POD_POWER }); if (o.mush) L.put(x + 17, H(top - 7), 'u'); else L.row(x + 15, H(top - 7), 'ooo'); L.ground(x + 33, x + 39, top); return x + 40; };
  F.steam = (x, top, w, o) => {
    const wh = Math.min(top - 2, 8);
    L.ground(x, x + 8, top); cp(x + 1, top); L.hazard(x + 3, 'f7_steam', { rise: wh });
    // がけ: 左の 面は トゲ(かべジャンプで のぼれない)
    L.fill(x + 6, x + 6, top - wh + 1, top - 1, 'K'); L.fill(x + 6, x + 12, top - wh, top - wh, 'S'); L.fill(x + 7, x + 12, top - wh + 1, top - 1, 'S'); L.ground(x + 7, x + 12, top);
    if (o.mush) L.put(x + 10, top - wh - 1, 'u'); else L.row(x + 8, top - wh - 1, 'ooo');
    // おりる かいだん
    L.ground(x + 13, x + 19, top); for (let i = 0; i < wh - 1; i++) L.fill(x + 13 + Math.floor(i * 6 / (wh - 1)), x + 13 + Math.floor(i * 6 / (wh - 1)), top - wh + 1 + i, top - 1, 'S');
    return x + 20;
  };
  F.bridge = (x, top, w, o, g) => { L.ground(x, x + 4, top); cp(x + 1, top); L.hazard(x + 3, 'f7_lever', { y: top - 1, g }); L.hazard(x + 5, 'f7_bridge', { y: top, n: 29, g }); if (w.f[0]) L.enemy(x + 18, w.f[0], { y: H(top - 5) }); if (o.mush) L.put(x + 20, H(top - 4), 'u'); else L.row(x + 15, top - 3, 'ooooo'); L.ground(x + 34, x + 39, top); return x + 40; };
  F.cog = (x, top, w, o) => { L.ground(x, x + 3, top); cp(x + 1, top); for (let i = 0; i < 5; i++) L.hazard(x + 6 + i * 6, 'f7_cog', { y: top - 1 - (i % 2), dir: i % 2 ? -1 : 1, phase: i * 0.7 }); if (o.mush) L.put(x + 18, H(top - 6), 'u'); else L.row(x + 12, H(top - 4), 'oooo'); L.ground(x + 36, x + 40, top); return x + 41; };
  // あぶない しかけ(落ちる 以外で やられる 場所)
  F.roller = (x, top, w) => { L.ground(x, x + 21, top); L.wall(x, top - 2, top - 1); L.wall(x + 21, top - 2, top - 1); L.hazard(x + 15, 'f7_roller', { range: 10, sp: 170 }); L.hazard(x + 6, 'f7_roller', { range: 10, sp: 150, dir: 1 }); L.row(x + 8, top - 3, 'oooo'); if (w.g[0]) L.enemy(x + 11, w.g[0]); return x + 22; };
  F.sand = (x, top, w) => { L.ground(x, x + 2, top); L.lava(x + 3, x + 22, top + 1); for (let i = 0; i < 5; i++) L.hazard(x + 4 + i * 4, 'f7_sand', { y: top - 1 - (i % 2), w: 2 }); L.row(x + 6, top - 4, 'ooooo'); L.ground(x + 23, x + 26, top); return x + 27; };
  F.flame = (x, top, w) => { L.ground(x, x + 21, top); for (let i = 0; i < 5; i++) L.hazard(x + 3 + i * 4, 'f7_flame', { per: 2.6, phase: i * 0.55, hgt: 3 }); L.row(x + 4, top - 5, 'oooooo'); if (w.g[1] || w.g[0]) L.enemy(x + 19, w.g[1] || w.g[0]); return x + 22; };
  F.walls = (x, top, w) => { L.ground(x, x + 21, top); for (let i = 0; i < 4; i++) L.hazard(x + 3 + i * 5, 'f7_walls', { top: 1, w: 2, per: 3.2, phase: i * 0.8 }); L.row(x + 5, top - 1, 'o'); L.row(x + 15, top - 1, 'o'); if (w.f[0]) L.enemy(x + 12, w.f[0], { y: H(top - 6) }); return x + 22; };
  F.web = (x, top, w) => { L.ground(x, x + 21, top); L.hazard(x + 4, 'f7_web', { y: top - 3, w: 3, h: 3 }); L.hazard(x + 13, 'f7_web', { y: top - 3, w: 3, h: 3 }); L.hazard(x + 9, 'f7_flame', { per: 2.8, hgt: 3 }); L.hazard(x + 18, 'f7_flame', { per: 2.8, phase: 1.4, hgt: 3 }); if (w.g[0]) L.enemy(x + 11, w.g[0]); L.row(x + 5, top - 5, 'ooooo'); return x + 22; };
  // つよい 敵の ひろば: たおすと おりが ひらいて いのちの みどりキノコ。おりの 上を とおって 先へ すすめる(たおさなくても 先へ 行ける)
  F.arena = (x, top, w, o, g) => {
    L.ground(x, x + 31, top); L.wall(x, top - 2, top - 1);
    const fl = XF[w.s] && XF[w.s].fly;
    L.enemy(x + 13, w.s, fl ? { y: H(top - 5), gate: g } : { gate: g });
    L.fill(x + 22, x + 28, top - 3, top - 3, 'S'); L.fill(x + 28, x + 28, top - 2, top - 1, 'S');
    L.hazard(x + 22, 'f7_gate', { y: top - 2, h: 2, g }); L.put(x + 25, top - 1, 'u'); L.put(x + 24, top - 2, 'o'); L.put(x + 26, top - 2, 'o');
    L.fill(x + 20, x + 21, top - 1, top - 1, 'S');
    L.row(x + 6, H(top - 5), 'oooooo');
    return x + 32;
  };
  return F;
}
const fOrder = {};
(function () {
  if (typeof LEVELS === 'undefined') return;
  const cnt = {};
  for (const d of LEVELS) { if (!d || FSKIP_ID.has(d.id) || d.daily || d.roam || d.tutorial || d.num === '✦' || d.kind === 'switch') continue; const w = d.world || 1; cnt[w] = cnt[w] || 0; fOrder[d.id] = cnt[w]++; }
})();
// はじめて 出る 面だけ 札(ヒント)を 立てる(ワールドの 若い じゅん → ワールドの 中の じゅん)
let fFirst = null;
function fPlan(def) { const n = fOrder[def.id], w = FW[def.world] || FW[1]; return { t1: w.T[n % w.T.length], h1: w.H[n % w.H.length], h2: w.H[(n + 1) % w.H.length], arena: n % 2 === 0 || def.kind === 'boss' || def.kind === 'fort' }; }
function fFirstOf(k, id) {
  if (!fFirst) {
    fFirst = {};
    const ds = LEVELS.filter(d => d && fOrder[d.id] !== undefined).sort((a, b) => (a.world - b.world) || (fOrder[a.id] - fOrder[b.id]));
    for (const d of ds) { const pl = fPlan(d); for (const kk of [pl.t1, pl.h1, pl.arena ? 'arena' : pl.h2]) if (!fFirst[kk]) fFirst[kk] = d.id; }
  }
  return fFirst[k] === id;
}
function fBuildArea(S, L, def, x, top) {
  const n = fOrder[def.id];
  if (n === undefined) return x;
  const w = FW[def.world] || FW[1], F = fSections(S, L, def);
  const R = extRng(def.id * 7919 + 17);
  let g = 900 + def.id * 10;
  const t1 = w.T[n % w.T.length], h1 = w.H[n % w.H.length], h2 = w.H[(n + 1) % w.H.length];
  const arena = n % 2 === 0 || def.kind === 'boss' || def.kind === 'fort';
  const hint = (k, xx) => { if (F_HINT[k] && fFirstOf(k, def.id)) L.hint(xx, F_HINT[k][0], F_HINT[k][1]); };
  x = S.run(x, 6, { top });
  hint(t1, x); x = F[t1](x, top, w, { mush: !arena }, ++g); x = S.run(x, 4, { top });
  hint(h1, x); x = F[h1](x, top, w, {}, ++g); x = S.run(x, 4, { top, cp: 1 });
  if (arena) { hint('arena', x); x = F.arena(x, top, w, {}, ++g); x = S.run(x, 4, { top }); }
  else if (h2 !== h1) { x = F[h2](x, top, w, {}, ++g); x = S.run(x, 4, { top }); }
  if (R() < 0.13) L.enemy(x - 2, 'takara', {});
  return x;
}
// sections() を つつむ
const _fSectionsOrig = sections;
sections = function (L) {
  const S = _fSectionsOrig(L);
  const def = L._def;
  if (!def || def.daily || def.tutorial) return S;
  // ばったり バトル: その ワールドの つよい敵と めずらしい たからこぞう(会うと 得を する)
  if (def.roam) {
    const run0 = S.run;
    S.run = (x, w2, o = {}) => { const r = run0(x, w2, o); if (!L._fRoam && w2 >= 20) { L._fRoam = true; const w = FW[def.world] || FW[1]; const fl = XF[w.s] && XF[w.s].fly; L.enemy(x + 12, w.s, fl ? { y: 6 } : {}); L.enemy(x + 18, 'takara', { life: 20 }); } return r; };
    return S;
  }
  // ひみつの 面(✦): はじめに みどりキノコ 2つ・たからこぞう・コインの 山
  if (def.num === '✦') {
    const st = S.start;
    S.start = (x, o = {}) => { if (L._fSecret) return st(x, o); L._fSecret = true; const top = o.top ?? 10; x = st(x, o); L.ground(x, x + 17, top); L.row(x + 2, top - 3, 'oooooooooooo'); L.row(x + 2, H0(top - 5), 'oooooooooooo'); L.fill(x + 6, x + 8, top - 4, top - 4, 'S'); L.put(x + 7, top - 5, 'u'); L.put(x + 14, top - 1, 'u'); L.enemy(x + 11, 'takara', { life: 25 }); return x + 18; };
    return S;
  }
  if (FSKIP_ID.has(def.id)) return S;
  // (1) 敵の おきかえ(地面 20%・空 25%・とびうお 30%)
  if (!L._fEnemy) {
    L._fEnemy = true;
    const w = FW[def.world];
    if (w) {
      const R = extRng(def.id * 15485863 + 11);
      const orig = L.enemy; let gi = 0, fi = 0;
      L.enemy = (x, kind, opt = {}) => {
        if (XREP_G.has(kind) && w.g.length && R() < 0.2) { const k = w.g[(gi++) % w.g.length]; return orig(x, k, {}); }
        if (XREP_F.has(kind) && w.f.length && R() < 0.25) { const k = w.f[(fi++) % w.f.length]; return orig(x, k, { y: Math.max(4, opt.y !== undefined ? opt.y : 5) }); }
        if (kind === 'fish' && w.w && R() < 0.35) return orig(x, w.w[0], { y: 7 });
        return orig(x, kind, opt);
      };
    }
  }
  // (2) ゴール・ボス部屋の 前に 新しい 区間
  for (const nm of ['goal', 'boss', 'boss2', 'boss3', 'fortBoss']) {
    const f = S[nm];
    if (!f) continue;
    S[nm] = (x, ...a) => {
      if (!L._fArea) { L._fArea = true; const o = a.length && a[a.length - 1] && typeof a[a.length - 1] === 'object' ? a[a.length - 1] : {}; x = fBuildArea(S, L, def, x, o.top ?? 10); }
      return f(x, ...a);
    };
  }
  return S;
};
const H0 = y => Math.max(2, y);
