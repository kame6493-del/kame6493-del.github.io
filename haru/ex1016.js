// ハルの冒険 — 2026-10-16 の 大増量: 新しい 敵 36しゅ・新しい しかけ 20しゅ。
// game.js の あとに 読む。game.js には 差し込み口(spawnX / updateEnemyX / pveX / swordX / updateThingX / drawThingX / drawEnemyX)を 1行ずつ 足してある。
// 絵は ChatGPT で 作った assets/chatgpt/xe_<敵>_<0..2>.png(ポーズ 3つ)と g_<しかけ>.png。絵が 無いときは 前からの 絵の 色替えで 描く。
// 面への 置き方: levels.js の sections() を つつみ、(1) 前からの 敵の 一部を ワールドの 新しい 敵に おきかえ、(2) ゴール/ボス部屋の 前に「新しい しかけの 区間」を 足す。
'use strict';

// ---------------- 敵の 表 ----------------
// fb: 絵が ないときの 代わりの 絵(前からの 素材)と 色替え
const XE = {
  donguri: { w: 40, h: 38, dh: 48, speed: 50, stomp: true, sword: true, edge: true, score: 150, fb: ['goomy', 'sepia(1) saturate(1.5)'] },
  pyoko: { w: 40, h: 32, dh: 42, stomp: true, sword: true, score: 150, fb: ['slime', 'hue-rotate(20deg) saturate(1.3)'] },
  happa: { w: 40, h: 34, dh: 46, stomp: true, sword: true, fly: true, score: 150, fb: ['bee', 'hue-rotate(60deg)'] },
  tento: { w: 40, h: 40, dh: 50, speed: 38, stomp: true, sword: true, edge: true, score: 200, fb: ['beetle', 'hue-rotate(140deg) saturate(2)'] },
  imomushi: { w: 76, h: 32, dh: 52, speed: 42, stomp: true, sword: true, edge: true, score: 300, fb: ['slime', 'hue-rotate(40deg)'] },
  hiyakomori: { w: 44, h: 32, dh: 46, stomp: true, sword: true, fly: true, score: 200, fb: ['bat', 'hue-rotate(160deg) brightness(1.3)'] },
  yukipyon: { w: 38, h: 40, dh: 52, stomp: true, sword: true, score: 200, fb: ['goomy', 'grayscale(1) brightness(1.7)'] },
  kurage: { w: 40, h: 40, dh: 54, stomp: true, sword: true, fly: true, score: 200, fb: ['ghost', 'hue-rotate(250deg) saturate(2)'] },
  azarashi: { w: 46, h: 34, dh: 44, speed: 30, stomp: true, sword: true, edge: true, score: 200, fb: ['slime', 'grayscale(1) brightness(1.5)'] },
  sabo: { w: 38, h: 50, dh: 62, stomp: false, sword: true, score: 250, spiky: true, fb: ['plant', 'hue-rotate(60deg)'] },
  sasori: { w: 48, h: 34, dh: 46, speed: 44, stomp: true, sword: true, edge: true, score: 250, fb: ['beetle', 'hue-rotate(160deg) saturate(1.6)'] },
  gear: { w: 38, h: 42, dh: 52, speed: 60, stomp: true, sword: true, edge: true, score: 250, fb: ['bomb', 'hue-rotate(180deg)'] },
  sunazame: { w: 50, h: 36, dh: 50, stomp: true, sword: true, score: 300, fb: ['fish', 'sepia(1) saturate(1.2)'] },
  gorogumo: { w: 48, h: 34, dh: 52, stomp: true, sword: true, fly: true, score: 300, fb: ['ghost', 'grayscale(1) brightness(.8)'] },
  itachi: { w: 44, h: 32, dh: 44, stomp: true, sword: true, score: 250, fb: ['goomy', 'hue-rotate(60deg) saturate(1.4)'] },
  golem: { w: 48, h: 50, dh: 62, speed: 28, stomp: true, sword: true, edge: true, score: 350, fb: ['beetle', 'grayscale(1)'] },
  nezumi: { w: 40, h: 40, dh: 70, stomp: true, sword: true, fly: true, score: 300, fb: ['bee', 'grayscale(1)'] },
  chochin: { w: 40, h: 46, dh: 58, stomp: true, sword: true, fly: true, score: 300, fb: ['ghost', 'hue-rotate(-40deg) saturate(3)'] },
  karakasa: { w: 38, h: 50, dh: 62, stomp: true, sword: true, score: 250, fb: ['ghost', 'hue-rotate(200deg) saturate(2)'] },
  onibi: { w: 34, h: 34, dh: 46, stomp: false, sword: true, fly: true, score: 250, spiky: true, fb: ['firespirit', 'hue-rotate(180deg)'] },
  goroyado: { w: 44, h: 40, dh: 52, speed: 36, stomp: true, sword: true, edge: true, score: 300, fb: ['spiky', 'hue-rotate(220deg)'] },
  nisebako: { w: 54, h: 40, dh: 44, stomp: true, sword: true, score: 400, fb: ['chest', ''] },
  kakureon: { w: 46, h: 38, dh: 50, speed: 20, stomp: true, sword: true, edge: true, score: 300, fb: ['beetle', 'hue-rotate(80deg)'] },
  wani: { w: 96, h: 28, dh: 54, stomp: false, sword: true, score: 400, fb: ['fish', 'hue-rotate(90deg)'] },
  oumu: { w: 42, h: 36, dh: 50, stomp: true, sword: true, fly: true, score: 250, fb: ['bee', 'hue-rotate(-60deg) saturate(2)'] },
  jiro: { w: 44, h: 36, dh: 46, speed: 46, stomp: true, sword: true, edge: true, score: 300, fb: ['shell', 'sepia(1)'] },
  hoshikurage: { w: 44, h: 40, dh: 54, stomp: true, sword: true, fly: true, score: 200, fb: ['ghost', 'sepia(1) saturate(3) hue-rotate(10deg)'] },
  ufo: { w: 56, h: 34, dh: 50, stomp: true, sword: true, fly: true, score: 350, fb: ['eye', 'grayscale(1) brightness(1.3)'] },
  mochiusa: { w: 40, h: 46, dh: 58, stomp: true, sword: true, score: 300, fb: ['goomy', 'grayscale(1) brightness(1.8)'] },
  meteon: { w: 36, h: 36, dh: 48, stomp: false, sword: true, fly: true, score: 300, spiky: true, fb: ['firespirit', ''] },
  kuroneko: { w: 42, h: 38, dh: 50, stomp: true, sword: true, score: 350, fb: ['goomy', 'brightness(.3)'] },
  futago: { w: 56, h: 50, dh: 58, stomp: true, sword: true, score: 200, fb: ['slime', 'hue-rotate(260deg)'] },
  piero: { w: 44, h: 44, dh: 52, stomp: true, sword: true, score: 350, fb: ['chest', 'hue-rotate(200deg)'] },
  koma: { w: 44, h: 42, dh: 52, speed: 120, stomp: true, sword: true, score: 350, fb: ['spiky', 'hue-rotate(30deg)'] },
  inoshishi: { w: 76, h: 58, dh: 76, speed: 70, stomp: true, sword: true, edge: true, score: 2000, mid: true, fb: ['beetle', 'sepia(1) saturate(1.4)'] },
  knight: { w: 50, h: 72, dh: 90, speed: 40, stomp: true, sword: true, edge: true, score: 2500, mid: true, fb: ['skeleton', 'brightness(.35) hue-rotate(250deg) saturate(3)'] },
  // 中ボス級 その2(2026-10-16 夕方 持ち主「中ボスを増やす」)
  taisho: { w: 70, h: 66, dh: 84, stomp: true, sword: true, score: 2000, mid: true, hp: 3, fb: ['goomy', 'sepia(1) saturate(1.5)'] },
  hyogolem: { w: 72, h: 80, dh: 100, speed: 34, stomp: true, sword: true, edge: true, score: 2500, mid: true, hp: 4, fb: ['beetle', 'grayscale(1) brightness(1.4) hue-rotate(180deg)'] },
  oochochin: { w: 64, h: 70, dh: 90, stomp: true, sword: true, fly: true, score: 2500, mid: true, hp: 3, fb: ['ghost', 'hue-rotate(-40deg) saturate(3)'] },
  oyabun: { w: 60, h: 70, dh: 88, stomp: true, sword: true, score: 2500, mid: true, hp: 3, fb: ['goomy', 'grayscale(1) brightness(1.8)'] },
};
const XE_NAME = {
  donguri: 'どんぐりん', pyoko: 'ぴょこガエル', happa: 'はっぱチョウ', tento: 'テントガード', imomushi: 'いもむしトレイン', hiyakomori: 'ひやコウモリ', yukipyon: 'ゆきぴょん', kurage: 'ふわクラゲ', azarashi: 'ころアザラシ',
  sabo: 'トゲサボ', sasori: 'はさみサソリ', gear: 'ギアボット', sunazame: 'すなザメ', gorogumo: 'ゴロゴロぐも', itachi: 'つむじイタチ', golem: 'ちびゴーレム', nezumi: 'ふうせんネズミ',
  chochin: 'ちょうちんボー', karakasa: 'からかさん', onibi: 'おにび', goroyado: 'ゴロヤド', nisebako: 'にせばこ', kakureon: 'かくれオン', wani: 'がぶりワニ', oumu: 'ぎゃあオウム', jiro: 'まるまジロ',
  hoshikurage: 'ほしクラゲ', ufo: 'ちびUFO', mochiusa: 'もちつきウサギ', meteon: 'メテオン', kuroneko: 'クロかげネコ', futago: 'ふたごだま', piero: 'ばねピエロ', koma: 'こまコマ', inoshishi: 'ドスドスイノシシ', knight: 'かげナイト',
  taisho: 'どんぐり大将', hyogolem: 'こおりゴーレム', oochochin: 'おおちょうちん', oyabun: 'もちつき親分',
};
const XE_EN = {
  donguri: 'Acornel', pyoko: 'Hopfrog', happa: 'Leaflutter', tento: 'Ladyguard', imomushi: 'Caterpillar Train', hiyakomori: 'Frostbat', yukipyon: 'Snowbun', kurage: 'Zapjelly', azarashi: 'Slidey Seal',
  sabo: 'Needlecactus', sasori: 'Pinch Scorpion', gear: 'Gearbot', sunazame: 'Sand Shark', gorogumo: 'Rumblecloud', itachi: 'Whirl Weasel', golem: 'Mini Golem', nezumi: 'Balloon Mouse',
  chochin: 'Lantern Ghost', karakasa: 'Umbrella Hopper', onibi: 'Wisp', goroyado: 'Rock Hermit', nisebako: 'Fake Chest', kakureon: 'Hidechameleon', wani: 'Log Gator', oumu: 'Squawk Parrot', jiro: 'Rollodillo',
  hoshikurage: 'Starjelly', ufo: 'Mini UFO', mochiusa: 'Mochi Rabbit', meteon: 'Meteorling', kuroneko: 'Shadow Cat', futago: 'Twin Ball', piero: 'Spring Clown', koma: 'Spin Top', inoshishi: 'Stomp Boar', knight: 'Shadow Knight',
  taisho: 'Acorn General', hyogolem: 'Ice Golem', oochochin: 'Big Lantern', oyabun: 'Mochi Boss',
};
// ずかんの 文(ゲームの 中の うごきの とおりに 書く)
const XE_INFO = {
  donguri: { intro: 'どんぐりの こ。がけの はしで くるっと もどる。ふまれると ぼうしが とんで、はだかで 2ばいの はやさで はしりだす。', how: 'ふむと ぼうしが とれる。もう1回 ふむか けんで たおせる。' },
  pyoko: { intro: 'げんきな カエル。ちいさく 2かい はねてから、3かいめは 大ジャンプで ちかづいてくる。', how: 'ふめる・けんで たおせる。' },
  happa: { intro: 'はっぱの はねの チョウ。ひらひら なみうって とび、ときどき ふわっと 下へ おりてくる。', how: 'ふめる・けんで たおせる。' },
  tento: { intro: 'はっぱの たてを まえに もつ テントウムシ。まえからの けんは たてで はじく。ちかくに いると たてを かまえて とまる。', how: 'ふめる。けんは うしろから。' },
  imomushi: { intro: 'ながい からだの いもむし。がけの はしで もどる。あたまだけが よわく、からだを ふむと ぽよんと はねるだけ。', how: 'あたまを ふむ。けんは どこでも。' },
  hiyakomori: { intro: 'こおりの コウモリ。さかさまに ぶらさがって ねていて、真下に 来ると まっすぐ おちてくる。そのあと もとの ばしょへ もどる。', how: 'ふめる・けんで たおせる。' },
  yukipyon: { intro: 'ゆきうさぎ。たかく はねて、いちばん 上で ゆきだまを なげてくる。', how: 'ふめる・けんで たおせる。ゆきだまは けんで けせる。' },
  kurage: { intro: 'ふわふわ 上下する クラゲ。3びょうごとに 1びょう ビリビリ ひかる。', how: 'ひかって いない ときに ふむ。けんは いつでも。' },
  azarashi: { intro: 'アザラシの あかちゃん。まえに ハルを 見つけると おなかで すべって くる(こおりの 上は もっと はやい)。かべに ぶつかると 目を まわす。', how: 'ふめる・けんで たおせる。' },
  sabo: { intro: 'うごかない サボテン。2.5びょうごとに ふるえてから、トゲを 3ぼん(ひだり上・上・みぎ上)とばす。', how: 'ふめない(トゲ)。けんか スピンジャンプで。' },
  sasori: { intro: 'サソリ。まえに 来ると はさみを 上げて とっしん。かべに ぶつかると 目を まわす。', how: 'ふめる・けんで たおせる。' },
  gear: { intro: 'ゼンマイの ロボ。ふまれると バラバラに なるが、3びょうで もとに もどる。', how: 'ふんで バラバラの あいだに もう1回 ふむ。けんなら 1かいで。' },
  sunazame: { intro: 'すなの 中を ひれだけ 出して およぐ サメ。ちかくで すなから とびだして かみつく。', how: 'とびだした ときに ふむか けん。すなの 中の ときは きかない。' },
  gorogumo: { intro: 'ちいさな かみなり雲。上から ついてきて、きいろく ひかったら 真下に いなずまを おとす。', how: 'ふめる・けんで たおせる。ひかったら よこへ にげる。' },
  itachi: { intro: 'つむじかぜに のる イタチ。ハルを 見つけると よこに すっとんでくる。とまると 目を まわす。', how: 'ふめる・けんで たおせる。' },
  golem: { intro: 'いわの ちいさな ゴーレム。おそいが、まえからの けんは いわの うでで ふせぐ。', how: 'ふめる。けんは うしろから。' },
  nezumi: { intro: 'ふうせんで うかぶ ネズミ。真上から どんぐり ばくだんを おとす。ふむと ふうせんが われて、あわてて はしる。', how: '2かい ふむ。けんなら 1かいで。' },
  chochin: { intro: 'ちょうちんの おばけ。きえて ハルの ちかくに あらわれ、ゆっくりの 火の たまを うつ。きえかけの ときは さわれない。', how: 'ふめる・けんで たおせる。' },
  karakasa: { intro: '一本足の かさの おばけ。ぴょんと はねて、おちる ときは かさを ひらいて ふわふわ おりる。', how: 'ふめる・けんで たおせる。' },
  onibi: { intro: '青い 火の たまの こ。ななめに とんで、かべ・てんじょう・ゆかで はねかえる。', how: 'ふめない(あつい)。けんか スピンジャンプで。' },
  goroyado: { intro: 'いわの からの ヤドカリ。ちかづくと からに かくれて トゲを 出す。はなれると そっと のぞいて また あるく。', how: 'でている ときに ふむ。けんは いつでも。' },
  nisebako: { intro: 'たからばこの ふりを している。ちかづくと ふたを あけて、ぴょんぴょん おいかけてくる。たおすと コインが 3まい。', how: 'ふめる・けんで たおせる。とじている ときに ふむと おきるだけ。' },
  kakureon: { intro: 'ほとんど 見えない カメレオン。ちかくで すがたを 出し、したを のばして くる。', how: 'ふめる・けんで たおせる。' },
  wani: { intro: '水に うかぶ 丸太の ふりを している ワニ。のれるが、のって 0.8びょうで かみついて しずむ。', how: 'ふめない。けんで たおせる。のったら すぐ とびうつる。' },
  oumu: { intro: 'にぎやかな オウム。行ったり 来たり とんで、下に ハルが 来ると ななめに きゅうこうか。', how: 'ふめる・けんで たおせる。' },
  jiro: { intro: 'アルマジロ。まえに 来ると まるまって ころがってくる。ころがって いる ときは ふんでも はねかえる。', how: 'あるいて いる ときに ふむ。けんは いつでも。' },
  hoshikurage: { intro: '星の かさの クラゲ。ゆっくり ただよう。ふむと ぽーんと 高く はねられる(たおれない)。', how: 'けんで たおせる。ふむと ふみだいに なる。' },
  ufo: { intro: 'ちいさな UFO。真上に 来ると 光の わを おろし、わの 中の ハルを 上へ すいあげる。', how: 'ふめる・けんで たおせる。' },
  mochiusa: { intro: 'きねを もった うさぎ。おもちを ゆみなりに なげる。おちた おもちは 3びょう のこり、のると おそくなる。', how: 'ふめる・けんで たおせる。' },
  meteon: { intro: 'いん石の こ。火を まとって ななめに はねまわる。', how: 'ふめない(あつい)。けんか スピンジャンプで。' },
  kuroneko: { intro: 'かげの ネコ。けむりに なって きえ、ハルの うしろに あらわれて とびかかる。', how: 'ふめる・けんで たおせる。' },
  futago: { intro: 'ふむと 2つに わかれる ボール。大→中→小 と ふえていく。', how: '小さく なるまで ふむ。いちばん 小さいのを ふむと きえる。' },
  piero: { intro: 'びっくり箱。ちかづくと ばねで とびだして ゆれる。しばらくすると 箱に もどる。', how: 'でている ときに ふむか けん。' },
  koma: { intro: 'まわる こま。はやく まわっている ときは ふむと はじかれる。3びょうごとに ゆっくりに なる。', how: 'ゆっくりの ときに ふむ。けんは いつでも。' },
  inoshishi: { intro: 'ちゅうボスの 大イノシシ。行ったり 来たり とっしんし、ふまれるたびに はやく なる。たおすと ハートを おとす。', how: '3かい ふむか けんで。かべに ぶつかって 目を まわしたら チャンス。' },
  knight: { intro: 'かげの よろいの きし。ちゅうボス。まえからの けんは たてで ふせぎ、まえに 来ると やりで とっしんする。', how: '3かい ふむ。けんは うしろから。' },
  taisho: { intro: 'ちゅうボスの 大きな どんぐり。ぴょんぴょん はねて、3回目の 大ジャンプで 地面を ゆらし、どんぐりんを 2ひき よぶ。', how: '3かい ふむか けんで。' },
  hyogolem: { intro: 'ちゅうボスの こおりの ゴーレム。ゆっくり あるき、うでを ふりおろすと 地面を こおりの なみが 左右に はしる。', how: 'なみは ジャンプで よける。4かい ふむか けんで。' },
  oochochin: { intro: 'ちゅうボスの 大きな ちょうちん。きえては あらわれ、火の たまを 3つ まとめて うつ。', how: '見えている ときに 3かい ふむか けんで。' },
  oyabun: { intro: 'ちゅうボスの うさぎの 親分。おもちを 2つ まとめて なげ、ときどき 大きく はねる。', how: '3かい ふむか けんで。おちた おもちに のると おそくなる。' },
};
const XE_WORLD = { taisho: '1', hyogolem: '2・4', oochochin: '5・10', oyabun: '7', donguri: '1', pyoko: '1', happa: '1', tento: '1・2', imomushi: '1・6', hiyakomori: '2', yukipyon: '2', kurage: '2', azarashi: '2', sabo: '3', sasori: '3', gear: '3', sunazame: '3', gorogumo: '4', itachi: '4', golem: '4', nezumi: '4', chochin: '5・8', karakasa: '5', onibi: '5・8', goroyado: '5', nisebako: '5・8', kakureon: '6', wani: '6', oumu: '6', jiro: '6', hoshikurage: '7', ufo: '7', mochiusa: '7', meteon: '7', kuroneko: '8', futago: '8', piero: '8', koma: '8', inoshishi: '3・6', knight: '8' };

for (const k in XE) {
  const d = XE[k];
  ENEMY[k] = Object.assign({ img: d.fb[0], filter: d.fb[1], ex: true, walker: !!d.speed && !d.fly, art: 'xe_' + k + '_0' }, d);
  if (d.spiky) SPIKY_T.add(k);
}
// ずかん
for (const k in XE) if (!ZK_ENEMIES.includes(k)) ZK_ENEMIES.push(k);
Object.assign(ZK_NAME, XE_NAME);
for (const k in XE) if (!EINFO[k]) EINFO[k] = Object.assign({ name: XE_NAME[k], world: XE_WORLD[k] }, XE_INFO[k]);
if (typeof EN_DICT !== 'undefined') for (const k in XE) EN_DICT[XE_NAME[k]] = XE_EN[k];
// ずかんの 2〜3ぎょうの せつめい(ゲームの 中で ほんとうに そう うごく ことだけ)
const XZK_DESC = {
  donguri: ['ぼうしを かぶった どんぐりの こ。がけで もどる。', 'ふむと ぼうしが とんで、2ばいの はやさで はしる。', 'もう1かい ふむか けんで たおせる。'],
  pyoko: ['ちいさく 2かい はねて、3かいめは 大ジャンプ。', 'ハルの ほうへ よってくる カエル。', 'ふんでも けんでも たおせる。'],
  happa: ['はっぱの はねで ひらひら とぶ チョウ。', 'ときどき ふわっと 下へ おりてくる。', 'ふんでも けんでも たおせる。'],
  tento: ['はっぱの たてを もつ テントウムシ。', 'まえからの けんは たてで はじかれる。', 'ふむか、うしろから けんで。'],
  imomushi: ['ながい からだの いもむし。がけで もどる。', 'からだを ふむと はねるだけ。あたまを ふもう。', 'けんは どこに あてても たおせる。'],
  hiyakomori: ['さかさまに ぶらさがって ねている コウモリ。', '真下に 来ると まっすぐ おちて、また もどる。', 'ふんでも けんでも たおせる。'],
  yukipyon: ['たかく はねる ゆきうさぎ。', 'いちばん 上で ゆきだまを なげてくる。', 'ふんでも けんでも。ゆきだまは けんで けせる。'],
  kurage: ['ふわふわ 上下する クラゲ。', '3びょうに 1かい ビリビリ ひかる。その間は ふめない。', 'けんは いつでも きく。'],
  azarashi: ['まえに ハルを 見つけると おなかで すべってくる。', 'こおりの 上は もっと はやい。かべで 目を まわす。', 'ふんでも けんでも たおせる。'],
  sabo: ['うごかない サボテン。ふるえたら あいず。', 'トゲを 3ぼん(ひだり上・上・みぎ上)とばす。', 'ふめない。けんか スピンジャンプで。'],
  sasori: ['まえに 来ると はさみを 上げて とっしん。', 'かべに ぶつかると 目を まわす。', 'ふんでも けんでも たおせる。'],
  gear: ['ゼンマイで うごく ロボ。', 'ふむと バラバラ。3びょうで もとに もどる。', 'バラバラの 間に もう1かい ふむか、けんで。'],
  sunazame: ['すなの 中を ひれだけ 出して およぐ サメ。', 'ちかくで すなから とびだして かみつく。', 'でている 間に ふむか けんで。'],
  gorogumo: ['上から ついてくる かみなり雲。', 'きいろく ひかったら 真下に いなずま。', 'ふんでも けんでも たおせる。'],
  itachi: ['つむじかぜに のって よこに すっとぶ イタチ。', 'とまった あとは 目を まわす。', 'ふんでも けんでも たおせる。'],
  golem: ['いわの ちいさな ゴーレム。あるくのは おそい。', 'まえからの けんは いわの うでで ふせぐ。', 'ふむか、うしろから けんで。'],
  nezumi: ['ふうせんで うかぶ ネズミ。', '真上から どんぐり ばくだんを おとす。', 'ふむと ふうせんが われる。もう1かい ふめば たおせる。'],
  chochin: ['きえては ハルの ちかくに あらわれる ちょうちん。', 'ゆっくりの 火の たまを うつ。', 'みえている 間に ふむか けんで。'],
  karakasa: ['一本足で はねる かさの おばけ。', 'おちる ときは かさを ひらいて ふわふわ。', 'ふんでも けんでも たおせる。'],
  onibi: ['青い 火の たまの こ。', 'ななめに とんで かべや ゆかで はねかえる。', 'ふめない。けんか スピンジャンプで。'],
  goroyado: ['いわの からの ヤドカリ。', 'ちかづくと からに かくれて トゲを 出す。', 'でている 間に ふむ。けんは いつでも。'],
  nisebako: ['たからばこの ふり。ちかづくと ぴょんぴょん おってくる。', 'とじている 間に ふんでも おきるだけ。', 'たおすと コインが 3まい。'],
  kakureon: ['ほとんど 見えない カメレオン。', 'ちかくで すがたを 出し、したを のばしてくる。', 'ふんでも けんでも たおせる。'],
  wani: ['水に うかぶ 丸太の ふりを している ワニ。のれる。', 'のって 0.8びょうで かみついて しずむ。', 'ふめない。けんで たおせる。'],
  oumu: ['行ったり 来たり とぶ オウム。', '下に ハルが 来ると ななめに きゅうこうか。', 'ふんでも けんでも たおせる。'],
  jiro: ['まえに 来ると まるまって ころがる アルマジロ。', 'ころがって いる 間は ふんでも はねかえる。', 'あるいて いる 間に ふむ。けんは いつでも。'],
  hoshikurage: ['ゆっくり ただよう 星の クラゲ。', 'ふむと ぽーんと 高く はねる(たおれない)。', 'けんで たおせる。'],
  ufo: ['上を とぶ ちいさな UFO。', '真上に 来ると 光の わで ハルを 上へ すいあげる。', 'ふんでも けんでも たおせる。'],
  mochiusa: ['おもちを ゆみなりに なげる うさぎ。', 'おちた おもちに のると しばらく おそくなる。', 'ふんでも けんでも たおせる。'],
  meteon: ['火を まとった いん石の こ。', 'ななめに はねまわる。', 'ふめない。けんか スピンジャンプで。'],
  kuroneko: ['けむりに なって きえる かげの ネコ。', 'ハルの うしろに あらわれて とびかかる。', 'ふんでも けんでも たおせる。'],
  futago: ['ふむと 2つに わかれる 毛玉。', '大→中→小 と ふえていく。', 'いちばん 小さいのを ふむと きえる。'],
  piero: ['ちかづくと ばねで とびだす びっくり箱。', 'しばらく ゆれて、箱に もどる。', 'でている 間に ふむか けんで。'],
  koma: ['はやく まわる こま。ふむと はじかれる。', '3びょうごとに ゆっくりに なる。', 'ゆっくりの 間に ふむ。けんは いつでも。'],
  inoshishi: ['ちゅうボスの 大イノシシ。行ったり 来たり とっしん。', 'ふまれるたびに はやく なる。たおすと ハート。', '3かい ふむか けんで。'],
  knight: ['かげの よろいの きし。ちゅうボス。', 'まえからの けんは たてで ふせぎ、やりで とっしん。', '3かい ふむか、うしろから けんで。'],
  taisho: ['ちゅうボスの 大きな どんぐり。', '3回目の 大ジャンプで 地面を ゆらし、どんぐりんを よぶ。', '3かい ふむか けんで。'],
  hyogolem: ['ちゅうボスの こおりの ゴーレム。', 'うでを ふりおろすと こおりの なみが 左右に はしる。', 'なみは ジャンプで。4かい ふむか けんで。'],
  oochochin: ['ちゅうボスの 大きな ちょうちん。', 'きえては あらわれ、火の たまを 3つ うつ。', '見えている ときに 3かい ふむか けんで。'],
  oyabun: ['ちゅうボスの うさぎの 親分。', 'おもちを 2つ まとめて なげ、ときどき 大きく はねる。', '3かい ふむか けんで。'],
};
const XZK_DESC_EN = {
  donguri: ['An acorn kid in a cap. Turns at ledges.', 'Stomp it and the cap flies off; it runs twice as fast.', 'Stomp again or use the sword.'],
  pyoko: ['Two small hops, then a big jump', 'toward you.', 'Stomp it or use the sword.'],
  happa: ['A butterfly with leaf wings.', 'Sometimes it drifts down low.', 'Stomp it or use the sword.'],
  tento: ['A ladybug with a leaf shield.', 'The shield blocks the sword from the front.', 'Stomp it or hit it from behind.'],
  imomushi: ['A long caterpillar. Turns at ledges.', 'Its body just bounces you. Stomp the head!', 'The sword works anywhere.'],
  hiyakomori: ['An ice bat hanging upside down.', 'Drops straight down when you pass below, then flies back.', 'Stomp it or use the sword.'],
  yukipyon: ['A snow bunny that jumps high', 'and throws a snowball at the top.', 'Stomp it or use the sword. The sword clears snowballs.'],
  kurage: ['A jellyfish bobbing up and down.', 'Zaps for 1 second every 3. No stomping then.', 'The sword always works.'],
  azarashi: ['Slides on its belly when it sees you.', 'Faster on ice. Gets dizzy when it hits a wall.', 'Stomp it or use the sword.'],
  sabo: ['A cactus that never moves. It shakes first,', 'then shoots 3 needles (up-left, up, up-right).', 'No stomping. Use the sword or a spin jump.'],
  sasori: ['Raises its claws and charges when you are ahead.', 'Gets dizzy when it hits a wall.', 'Stomp it or use the sword.'],
  gear: ['A wind-up robot.', 'Stomp it and it falls apart, then rebuilds in 3 sec.', 'Stomp again while it is apart, or use the sword.'],
  sunazame: ['A shark swimming in sand with only its fin out.', 'Leaps out to bite when you get close.', 'Stomp or slash it while it is out.'],
  gorogumo: ['A little thundercloud that follows you.', 'When it glows, lightning strikes right below.', 'Stomp it or use the sword.'],
  itachi: ['A weasel riding a whirlwind sideways.', 'Gets dizzy after it stops.', 'Stomp it or use the sword.'],
  golem: ['A small rock golem. Slow walker.', 'Its rock arms block the sword from the front.', 'Stomp it or hit it from behind.'],
  nezumi: ['A mouse floating on a balloon.', 'Drops acorn bombs from above.', 'Stomp to pop the balloon, then stomp again.'],
  chochin: ['A lantern ghost that vanishes and reappears near you.', 'Shoots slow fireballs.', 'Stomp or slash it while it is visible.'],
  karakasa: ['A one-legged umbrella ghost that hops.', 'Opens its umbrella to float down.', 'Stomp it or use the sword.'],
  onibi: ['A blue fire wisp.', 'Flies diagonally and bounces off walls and floors.', 'No stomping. Use the sword or a spin jump.'],
  goroyado: ['A hermit crab in a rock shell.', 'Hides and pokes spikes out when you get close.', 'Stomp it when it is out. The sword always works.'],
  nisebako: ['Pretends to be a chest. Hops after you up close.', 'Stomping it while closed just wakes it.', 'Drops 3 coins when defeated.'],
  kakureon: ['A nearly invisible chameleon.', 'Appears up close and shoots out its tongue.', 'Stomp it or use the sword.'],
  wani: ['A gator pretending to be a floating log. You can stand on it.', 'It bites and sinks 0.8 sec after you land.', 'No stomping. Use the sword.'],
  oumu: ['A parrot flying back and forth.', 'Dives diagonally when you are below.', 'Stomp it or use the sword.'],
  jiro: ['An armadillo that curls up and rolls when you are ahead.', 'Stomping a rolling one just bounces you.', 'Stomp it while walking. The sword always works.'],
  hoshikurage: ['A star jellyfish drifting slowly.', 'Stomp it to bounce high (it stays).', 'The sword defeats it.'],
  ufo: ['A tiny UFO flying overhead.', 'Its light ring lifts you up from below.', 'Stomp it or use the sword.'],
  mochiusa: ['A rabbit that lobs mochi.', 'Landed mochi slows you down for a while.', 'Stomp it or use the sword.'],
  meteon: ['A meteor kid wrapped in fire.', 'Bounces around diagonally.', 'No stomping. Use the sword or a spin jump.'],
  kuroneko: ['A shadow cat that vanishes in smoke', 'and pounces from behind you.', 'Stomp it or use the sword.'],
  futago: ['A fuzzball that splits in two when stomped.', 'Big to medium to small.', 'Stomp the smallest ones to clear them.'],
  piero: ['A jack-in-the-box that springs out up close.', 'It sways for a bit, then hides again.', 'Stomp or slash it while it is out.'],
  koma: ['A fast spinning top. Stomping bounces you off.', 'It slows down every 3 seconds.', 'Stomp it while slow. The sword always works.'],
  inoshishi: ['Mini boss: a big boar charging back and forth.', 'Gets faster each hit. Drops a heart.', 'Stomp it 3 times or use the sword.'],
  knight: ['Mini boss: a knight in shadow armor.', 'Blocks the sword from the front and charges with a spear.', 'Stomp it 3 times or hit it from behind.'],
  taisho: ['Mini boss: a giant acorn.', 'Its third big jump shakes the ground and calls 2 Acornels.', 'Stomp it 3 times or use the sword.'],
  hyogolem: ['Mini boss: an ice golem.', 'Its arm slam sends ice waves both ways along the ground.', 'Jump the waves. Stomp it 4 times or use the sword.'],
  oochochin: ['Mini boss: a big lantern ghost.', 'Vanishes, reappears, and fires 3 fireballs at once.', 'Stomp it 3 times while visible, or use the sword.'],
  oyabun: ['Mini boss: the rabbit boss.', 'Throws 2 mochi at once and sometimes leaps high.', 'Stomp it 3 times or use the sword.'],
};
if (typeof ZK_DESC !== 'undefined') for (const k in XZK_DESC) ZK_DESC[k] = XZK_DESC[k];
if (typeof ZK_DESC_EN !== 'undefined') for (const k in XZK_DESC_EN) ZK_DESC_EN[k] = XZK_DESC_EN[k];
// ずかんの「せいかく・くらし」(2026-10-16 夜)。うごき(XZK_DESC)と くいちがわない ように
const XZK_LORE = {
  donguri: 'ぼうしが じまんの どんぐりの こ。ぼうしが とれると はずかしくて、まっかに なって はしりまわる。どんぐり大将の いうことは よく きく。',
  pyoko: '「いち、にの、さーん!」で とぶのが くちぐせの カエル。あめの ひは ごきげんで、うたいながら はねる。むしより ハルの ほうが きに なるらしい。',
  happa: 'はっぱの はねで ひらひら とぶ チョウ。かぜの ひは どこへ とんでいくか じぶんでも わからない。ほんものの はっぱに まぎれて ひるねする。',
  tento: 'はっぱの たてを ピカピカに みがく まじめな テントウムシ。まえから くる ものは ぜったいに とおさない。でも うしろは つい わすれがち。',
  imomushi: 'あたまが うんてんしゅ、からだが きゃくせきの つもりの いもむし。はっぱを たべながら ずっと すすむ。いつか チョウに なって そらを はしるのが ゆめ。',
  hiyakomori: 'こおりの どうくつで さかさまに ねている コウモリ。ゆきを かきごおりに して たべるのが すき。ねぞうが わるくて、すぐ おっこちる。',
  yukipyon: 'たかく とぶのが とくいな ゆきの うさぎ。ゆきがっせんが だいすきで、だれにでも ゆきだまを なげたがる。わるぎは ない。',
  kurage: 'こおりの うみを ただよう クラゲ。ねむく なると からだが ビリビリ ひかる くせが ある。とけない こおりの かけらを まくらに している。',
  azarashi: 'こおりの うえを おなかで すべるのが とくいな アザラシ。すべりだすと とまれず、よく かべに ごっつん。すべりんとは すべりかたの ライバル。',
  sabo: 'さばくの まんなかで ずっと じっと している サボテン。みずを ためるのが とくいで、なんにちも のまずに へいき。おこると トゲを とばす。',
  sasori: 'はさみを ちょきちょき ならすのが くせの サソリ。まえに だれかが いると、つい むきに なって つっこむ。かべに ぶつかって めを まわすのも いつもの こと。',
  gear: 'からくり こうばで うまれた ゼンマイの ロボ。バラバラに なっても じぶんで くみたてなおす がんばりや。あぶらを さして もらうと ごきげん。',
  sunazame: 'すなの うみを およぐ サメ。ほんものの うみを みた ことが なく、いつか いってみたいと おもっている。ひれだけ だすのは ちょっと はずかしがりだから。',
  gorogumo: 'あらしの こうげんに すむ ちいさな かみなりぐも。だれかの あとを ついていくのが すき。はりきると、すぐ いなずまを おとして しまう。',
  itachi: 'つむじかぜに のって すっとぶ イタチ。はやいのが じまんだけど、とまると めが まわる。かぜの つよい ひは いつも ごきげん。',
  golem: 'いわで できた ちいさな ゴーレム。あるくのは おそいけど、うでの ガードは てっぺき。せなかに こけが はえると ちょっと うれしい。',
  nezumi: 'ふうせんで そらを とぶのが ゆめだった ネズミ。どんぐりを ばくだんに して おとす いたずらずき。ふうせんが われると いちもくさんに にげる。',
  chochin: 'ゆうやけの たにに すむ ちょうちんの おばけ。ふっと きえては ちかくに あらわれて、おどかすのが しゅみ。くらく なると ちょっと ほこらしげ。',
  karakasa: 'いっぽんあしで はねる かさの おばけ。あめの ひが だいすきで、はれの ひは すこし しょんぼり。おちる ときに かさを ひらくのが じまん。',
  onibi: 'あおい ひの たまの こ。じっと して いられず、かべや ゆかで はねかえって あそぶ。めらりんとは とおい いとこ どうし。',
  goroyado: 'いわの からを せおった ヤドカリ。こわがりで、だれかが ちかづくと すぐ からに こもる。大きく なると からを ひっこしする。',
  nisebako: 'たからばこの ふりを して ねている いたずらもの。おなかの なかに コインを ためこむのが しゅみ。おこされると ぴょんぴょん おいかけてくる。',
  kakureon: 'まわりの いろに とけこむ カメレオン。かくれんぼでは いちども まけた ことが ない。ながい したで、とおくの むしも ぺろり。',
  wani: 'まるたの ふりを して ぷかぷか うかぶ ワニ。うえに のられると、つい かみつきたく なる。ほんとうの しゅみは ひなたぼっこ。',
  oumu: 'ジャングルの おしゃべりな オウム。きいた ことばを すぐ まねする。したに だれかが いると、きゅうこうかで あいさつに くる。',
  jiro: 'こわがりの アルマジロ。びっくりすると まるまって、そのまま ころころ ころがっていく。どこまで ころがったか わからなく なるのが なやみ。',
  hoshikurage: 'つきの そらを ただよう ほしの クラゲ。ふまれても へっちゃらで、ぽよんと はねかえすのが とくい。ピピの とおい しんせき らしい。',
  ufo: 'ほしぞらから やってきた ちいさな UFO。めずらしい ものを みつけると、ひかりの わで すいあげて しらべたがる。ハルは とても めずらしいらしい。',
  mochiusa: 'つきで もちつきを する ウサギ。つきたての おもちを みんなに くばりたくて、つい なげて しまう。おもちは ねばねばで なかなか とれない。',
  meteon: 'ほうき星から こぼれおちた いん石の こ。からだが あつくて じっと して いられず、ななめに はねまわる。いつか ほうき星に かえりたい。',
  kuroneko: 'かげの くにの きまぐれな ネコ。けむりに なって きえ、うしろから とびかかって おどかすのが だいすき。なでられるのは もっと すき。',
  futago: 'ふむと ふたつに わかれる ふしぎな けだま。なかまが ふえると たのしくて はねまわる。ちいさく なると ちょっと こころぼそい。',
  piero: 'はこの なかに すむ ばねの ピエロ。だれかが ちかづくと「ばあっ!」と とびだす。おどかすのが いきがいで、わらって もらえると もっと うれしい。',
  koma: 'まわりつづけるのが いきがいの こま。はやく まわって いる ときは さわられても へいき。つかれると ゆっくりに なって、ちょっと ねむそう。',
  inoshishi: 'いちど はしりだすと とまれない あわてんぼうの 大イノシシ。きのこが だいこうぶつ。ふまれると くやしくて、ますます はやく なる。',
  knight: 'かげの おうに つかえる きしの よろい。なかは からっぽで、かげが うごかしている。たてで まもるのは とくいだけど、うしろは ちょっと よわい。',
  taisho: 'どんぐりんたちの たいしょう。いちばん 大きな ぼうしが じまんだけど、大きすぎて まえが すこし みえにくい。ゆれる じめんの あいずで こぶんが あつまる。',
  hyogolem: 'こおりの くにを まもる 大きな ゴーレム。むくちで がんこ。あたたかい ところに くると、ひたいに みずの しずくが つく(とけている)。',
  oochochin: 'ちょうちんボーたちの おやぶん。みんなを おどかす けいかくを たてるのが しごと。ろうそくの ひが きえるのが いちばん こわい。',
  oyabun: 'つきの もちつきウサギの 親分。おもちを ふたつ まとめて なげる ちからもち。たたかいの あとは みんなで おもちを たべるのが きまり。',
};
const XZK_LORE_EN = {
  donguri: 'An acorn kid who is very proud of its cap. When the cap flies off, it turns bright red and runs around in a panic. It always listens to the Acorn Chief.',
  pyoko: 'A frog whose catchphrase is "One, two, and... THREE!" Rainy days put it in a great mood, and it sings as it hops. It seems more curious about Haru than about bugs.',
  happa: 'A butterfly with leaf wings. On windy days even it has no idea where it will end up. It naps hidden among real leaves.',
  tento: 'A serious ladybug that keeps its leaf shield shiny. Nothing gets past it from the front. It does tend to forget about its back, though.',
  imomushi: 'A caterpillar that thinks its head is the driver and its body is the passenger cars. It munches leaves as it goes, dreaming of becoming a butterfly train in the sky.',
  hiyakomori: 'A bat that sleeps upside down in icy caves and loves eating snow like shaved ice. It sleeps so restlessly that it keeps falling down.',
  yukipyon: 'A snow bunny that loves jumping high. It is crazy about snowball fights and wants to throw snowballs at everyone. It means no harm.',
  kurage: 'A jellyfish drifting in the icy sea. When it gets sleepy, its body starts to crackle and glow. It uses a chunk of never-melting ice as a pillow.',
  azarashi: 'A seal that is great at belly-sliding on ice. Once it gets going it cannot stop, and it bonks into walls all the time. Slidey the penguin is its sliding rival.',
  sabo: 'A cactus that sits perfectly still in the middle of the desert. It stores water so well that it can go days without a drink. Make it angry and it fires needles.',
  sasori: 'A scorpion that clicks its claws out of habit. If someone stands in front of it, it gets fired up and charges. Bonking into a wall and getting dizzy is just part of its day.',
  gear: 'A wind-up robot born in a gadget workshop. Even when it falls apart, it puts itself back together. A drop of oil makes its day.',
  sunazame: 'A shark that swims through a sea of sand. It has never seen the real ocean and dreams of visiting one day. It only shows its fin because it is a little shy.',
  gorogumo: 'A tiny thundercloud from the stormy highlands. It loves following people around. When it gets excited, lightning just slips out.',
  itachi: 'A weasel that zooms along on a whirlwind. It is proud of its speed, but gets dizzy every time it stops. Windy days always put it in a good mood.',
  golem: 'A little golem made of rock. It walks slowly, but its arm guard is rock solid. It is secretly happy when moss grows on its back.',
  nezumi: 'A mouse that always dreamed of flying with a balloon. It loves dropping acorn bombs as a prank. When the balloon pops, it runs for its life.',
  chochin: 'A lantern ghost from the sunset valley. Its hobby is vanishing and popping up right next to people to spook them. It gets a bit proud once it gets dark.',
  karakasa: 'A one-legged umbrella ghost that hops around. It loves rainy days and mopes a little when it is sunny. It is proud of opening its umbrella as it falls.',
  onibi: 'A little blue flame that cannot sit still. It plays by bouncing off walls and floors. It is a distant cousin of Flicker.',
  goroyado: 'A hermit crab carrying a rock shell. It is a scaredy-cat and hides in its shell the moment anyone comes close. When it grows, it moves to a bigger shell.',
  nisebako: 'A prankster that sleeps disguised as a treasure chest. Its hobby is stashing coins in its belly. Wake it up and it will come hopping after you.',
  kakureon: 'A chameleon that blends into its surroundings. It has never lost a game of hide-and-seek. Its long tongue can snatch bugs from far away.',
  wani: 'A gator that floats around pretending to be a log. When someone stands on it, it just cannot resist a chomp. Its real hobby is sunbathing.',
  oumu: 'A chatty jungle parrot that copies every word it hears. If someone is below it, it swoops down to say hello.',
  jiro: 'A timid armadillo. When startled it curls up and rolls away, and then has no idea how far it rolled. That is its biggest worry.',
  hoshikurage: 'A star jellyfish drifting in the moon sky. Being stomped does not bother it one bit; it loves bouncing people away. It may be a distant relative of Pipi.',
  ufo: 'A tiny UFO from the starry sky. When it finds something rare, it wants to beam it up and study it. Apparently Haru is very rare.',
  mochiusa: 'A rabbit that pounds mochi on the moon. It wants to share fresh mochi with everyone, so it ends up throwing it. The mochi is super sticky.',
  meteon: 'A little meteor that fell off a comet. Its body is so hot it cannot stay still, so it bounces around diagonally. It wishes it could go back to its comet.',
  kuroneko: 'A moody cat from the shadow land. It loves vanishing in smoke and pouncing from behind to startle you. It loves being petted even more.',
  futago: 'A mysterious fuzzball that splits in two when stomped. More friends means more fun, so it bounces all over. Getting smaller makes it a bit nervous.',
  piero: 'A spring clown that lives in a box. When someone comes near, it pops out with a "BOO!" Scaring people is its whole life, and a laugh makes it even happier.',
  koma: 'A spinning top that lives to spin. While spinning fast it does not mind being touched. When it gets tired it slows down and looks a little sleepy.',
  inoshishi: 'A big, hasty boar that cannot stop once it starts running. Mushrooms are its favorite food. Getting stomped makes it so frustrated that it runs even faster.',
  knight: 'A suit of knight armor serving the Shadow King. It is empty inside and moved by a shadow. Great at guarding with its shield, but a little weak from behind.',
  taisho: 'Leader of the Acornels. It is proud of having the biggest cap, though the cap is so big it can barely see. When the ground shakes, its followers come running.',
  hyogolem: 'A huge golem guarding the ice land. Quiet and stubborn. In warm places, drops of water form on its forehead (it is melting).',
  oochochin: 'Boss of the Lantern Ghosts. Its job is planning how to spook everyone. Its greatest fear is its candle going out.',
  oyabun: 'Boss of the mochi rabbits on the moon. Strong enough to throw two mochi at once. After every fight, everyone eats mochi together. That is the rule.',
};
if (typeof ZK_LORE !== 'undefined') for (const k in XZK_LORE) ZK_LORE[k] = XZK_LORE[k];
if (typeof ZK_LORE_EN !== 'undefined') for (const k in XZK_LORE_EN) ZK_LORE_EN[k] = XZK_LORE_EN[k];
// 描き直した がぶりそう は 植木鉢から 出てくる(2026-10-16)
if (typeof ZK_DESC !== 'undefined' && ZK_DESC.plant) ZK_DESC.plant = ZK_DESC.plant.map(t => t.replace('つちから でてきて', 'うえきばちから でてきて'));
if (typeof ZK_DESC_EN !== 'undefined' && ZK_DESC_EN.plant) ZK_DESC_EN.plant = ZK_DESC_EN.plant.map(t => t.replace('out of the ground', 'out of its pot'));
if (EINFO.plant && EINFO.plant.intro) EINFO.plant.intro = EINFO.plant.intro.replace('つちから にょきっと でて', 'うえきばちから にょきっと でて');
if (typeof zkKind === 'function') { const _zkKind = zkKind; zkKind = k => (ENEMY[k] && ENEMY[k].mid ? ['中ボス', '#7fc8ff'] : _zkKind(k)); }

// 絵
const XART = [];
for (const k in XE) for (let f = 0; f < 3; f++) XART.push('xe_' + k + '_' + f);
const XG_ART = ['g_bumper_0', 'g_bumper_1', 'g_tree_0', 'g_tree_1', 'g_paint_0', 'g_paint_1', 'g_pend', 'g_raft', 'g_fall_0', 'g_fall_1', 'g_qsand', 'g_elev',
  'g_piston_head', 'g_piston_rod', 'g_mortar', 'g_mshell', 'g_sidespring', 'g_thunder', 'g_bolt', 'g_ring', 'g_bell_0', 'g_bell_1', 'g_flip_0', 'g_flip_1', 'g_rspike',
  'g_honey', 'g_inflate_0', 'g_inflate_1', 'g_rocket', 'g_phantom'];
const XV = '20261018b';
for (const n of [...XART, ...XG_ART]) {
  const im = new Image();
  im.onload = () => { if (im.naturalWidth) ART[n] = im; };
  im.onerror = () => {};
  im.src = 'assets/chatgpt/' + n + '.png?v=' + XV;
}

// ---------------- 敵の うごき ----------------
const xGrav = (o, dt) => { o.vy = Math.min(o.vy + GRAV * dt, MAXFALL); };
function xWalk(o, dt, sp) {
  xGrav(o, dt); o.vx = o.face * sp; moveBody(o, dt);
  if (o.hitWall) { o.face = -o.hitWall; }
  if (o.d.edge && o.onGround) {
    const ahead = Math.floor((o.face > 0 ? o.x + o.w + 2 : o.x - 2) / TILE), below = Math.floor((o.y + o.h + 4) / TILE);
    if (!isSolid(ahead, below) && !isOneWay(ahead, below)) o.face *= -1;
  }
}
const xFront = (o, px, py, ex, ey, dist, dy = 60) => (px - ex) * o.face > 0 && Math.abs(px - ex) < dist && Math.abs(py - ey) < dy;
function xShot(x, y, vx, vy, col, g = 900, t = 'spit', w = 20) { world.ents.push({ id: ++uid, t, x: x - w / 2, y: y - w / 2, w, h: w, vx, vy, g, life: 4, col }); }
function xFreeMove(o, dt) {
  // はねかえりの いどう(おにび・メテオン)
  const nx = o.x + o.vx * dt, ny = o.y + o.vy * dt;
  const hit = (x, y) => isSolid(Math.floor(x / TILE), Math.floor(y / TILE));
  if (hit(nx, o.y + 4) || hit(nx + o.w, o.y + 4) || hit(nx, o.y + o.h - 4) || hit(nx + o.w, o.y + o.h - 4) || nx < (o.minX ?? -1e9) || nx + o.w > (o.maxX ?? 1e9)) { o.vx = -o.vx; o.bounceT = 0.15; } else o.x = nx;
  if (hit(o.x + 4, ny) || hit(o.x + o.w - 4, ny) || hit(o.x + 4, ny + o.h) || hit(o.x + o.w - 4, ny + o.h) || ny < 1.2 * TILE || ny + o.h > ROWS * TILE - 4) { o.vy = -o.vy; o.bounceT = 0.15; } else o.y = ny;
}
function initEnemyX(o, e) {
  const d = o.d, op = e.opt || {};
  o.fr = 0; o.alpha = 1; o.timer = rnd(0.6, 1.6);
  switch (o.type) {
    case 'pyoko': o.hops = 0; break;
    case 'happa': case 'oumu': case 'hoshikurage': case 'kurage': o.x0 = o.x; o.y0 = o.y; break;
    case 'hiyakomori': o.y0 = o.y; o.state = 'hang'; break;
    case 'sunazame': o.state = 'under'; o.gy = o.y; break;
    case 'gorogumo': case 'ufo': case 'nezumi': o.x0 = o.x; o.y0 = o.y; o.timer = 2; o.range = (op.range || 8) * TILE; break;
    case 'itachi': o.y0 = o.y; o.state = 'idle'; break;
    case 'chochin': o.state = 'show'; o.timer = 2.2; break;
    case 'onibi': case 'meteon': { const sp = o.type === 'meteon' ? 210 : 150; o.vx = -sp; o.vy = sp * 0.8; o.minX = o.x - (op.range || 7) * TILE; o.maxX = o.x + (op.range || 7) * TILE; break; }
    case 'nisebako': o.state = 'sleep'; break;
    case 'kakureon': o.alpha = 0.12; break;
    case 'wani': o.state = 'float'; o.plat = true; o.dx = 0; o.dy = 0; o.y0 = o.y; break;
    case 'jiro': case 'koma': case 'golem': case 'tento': break;
    case 'kuroneko': o.state = 'sit'; break;
    case 'futago': o.size = op.size ?? 2; xSize(o); break;
    case 'piero': o.state = 'box'; o.rise = 0; o.by = o.y + o.h; break;
    case 'inoshishi': case 'knight': o.hp = 3; o.maxHp = 3; o.invT = 0; break;
    case 'taisho': case 'hyogolem': case 'oochochin': case 'oyabun': o.hp = d.hp || 3; o.maxHp = o.hp; o.invT = 0; o.timer = 1.5; o.hops = 0; o.state = 'walk'; o.y0 = o.y; break;
  }
}
function xSize(o) {
  const S = [[28, 26, 32], [40, 36, 44], [56, 50, 58]][o.size];
  const bot = o.y + o.h, cx = o.x + o.w / 2;
  o.w = S[0]; o.h = S[1]; o.dhx = S[2]; o.x = cx - o.w / 2; o.y = bot - o.h;
}
// 敵の 1こま。処理したら true
function updateEnemyX(o, dt, px, py, ex, ey) {
  const d = o.d;
  if (o.sleepT > 0 && !d.boss) { o.sleepT -= dt; if (!d.fly) { xGrav(o, dt); o.vx = 0; moveBody(o, dt); } return true; }
  if (!d.ex) return false;
  const fr = (a, b) => (Math.floor(o.ph * a) % 2 ? b : 0);
  switch (o.type) {
    case 'donguri': xWalk(o, dt, o.bald ? 110 : d.speed); o.fr = o.bald ? 2 : fr(6, 1); break;
    case 'tento': case 'golem': {
      const guard = xFront(o, px, py, ex, ey, 130);
      if (guard) { xGrav(o, dt); o.vx = 0; moveBody(o, dt); o.fr = 2; } else { xWalk(o, dt, d.speed); o.fr = fr(5, 1); }
      break;
    }
    case 'imomushi': xWalk(o, dt, d.speed); o.fr = fr(4, 1); break;
    case 'pyoko': {
      xGrav(o, dt); moveBody(o, dt);
      if (o.onGround) {
        o.vx *= 0.7; if (o.landT > 0) o.landT -= dt; if (!o.wasG) o.landT = 0.25; o.timer -= dt;
        if (o.timer <= 0 && Math.abs(px - ex) < 480) { o.face = px < ex ? -1 : 1; const big = ++o.hops % 3 === 0; o.vx = o.face * (big ? 170 : 90); o.vy = big ? -700 : -380; o.timer = big ? 1.2 : 0.55; }
        o.fr = o.landT > 0 ? 2 : 0;
      } else o.fr = 1;
      o.wasG = o.onGround; break;
    }
    case 'happa': {
      if (o.state === 'drop') { o.timer -= dt; o.y += 70 * dt; o.fr = 2; if (o.timer <= 0) o.state = 'up'; }
      else if (o.state === 'up') { o.y = lerp(o.y, o.y0, dt * 1.5); o.fr = fr(8, 1); if (Math.abs(o.y - o.y0) < 3) { o.state = 'walk'; o.timer = rnd(3, 5); } }
      else { o.timer -= dt; o.y = o.y0 + Math.sin(o.ph * 2.2) * 18; o.fr = fr(8, 1); if (o.timer <= 0) { o.state = 'drop'; o.timer = 1; } }
      o.x = o.x0 + Math.sin(o.ph * 0.8) * 70; o.face = Math.cos(o.ph * 0.8) > 0 ? 1 : -1; break;
    }
    case 'hiyakomori': {
      if (o.state === 'hang') { o.fr = 0; o.y = o.y0; if (Math.abs(px - ex) < 70 && py > ey) { o.state = 'drop'; o.vy = 0; sfx('dash', 1.6); } }
      else if (o.state === 'drop') { o.vy = Math.min(o.vy + 1500 * dt, 700); o.y += o.vy * dt; o.fr = 1; if (o.y > o.y0 + 7 * TILE || isSolid(Math.floor(ex / TILE), Math.floor((o.y + o.h) / TILE))) { o.state = 'rise'; } }
      else { o.y -= 150 * dt; o.fr = 2; o.x += Math.sin(o.ph * 6) * 40 * dt; if (o.y <= o.y0) { o.y = o.y0; o.state = 'hang'; } }
      o.face = px < ex ? -1 : 1; break;
    }
    case 'yukipyon': {
      xGrav(o, dt); moveBody(o, dt);
      if (o.onGround) { o.vx *= 0.7; o.timer -= dt; o.thrown = false; o.fr = o.throwT > 0 ? 2 : 0; if (o.timer <= 0 && Math.abs(px - ex) < 460) { o.face = px < ex ? -1 : 1; o.vy = -760; o.vx = o.face * 40; o.timer = 1.8; } }
      else { o.fr = 1; if (!o.thrown && o.vy > -60) { o.thrown = true; o.throwT = 0.35; const dx = px - ex; xShot(ex, ey, clamp(dx * 1.1, -260, 260), -260, '#ffffff'); sfx('swing', 1.2); } }
      if (o.throwT > 0) { o.throwT -= dt; o.fr = 2; }
      break;
    }
    case 'kurage': {
      o.cyc = ((o.cyc || rnd(0, 3)) + dt) % 3; o.glow = o.cyc > 2;
      const prevY = o.y; o.y = o.y0 + Math.sin(o.ph * 1.5) * 40; o.x0 += clamp(px - ex, -1, 1) * 18 * dt; o.x = o.x0;
      o.fr = o.glow ? 1 : (o.y < prevY ? 2 : 0); if (o.glow && Math.random() < dt * 20) sparkle(ex + rnd(-20, 20), ey + rnd(-20, 20), 1);
      break;
    }
    case 'azarashi': {
      if (o.state === 'slide') { o.timer -= dt; const ice = o.onGround && tileAt(Math.floor(ex / TILE), Math.floor((o.y + o.h + 2) / TILE)) === 'I'; xGrav(o, dt); o.vx = o.face * (ice ? 400 : 300); moveBody(o, dt); o.fr = 1; if (Math.random() < dt * 12) dust(ex, o.y + o.h, 1); if (o.hitWall) { o.state = 'dizzy'; o.timer = 1.4; sfx('bump'); o.face = -o.face; } else if (o.timer <= 0) { o.state = 'walk'; } }
      else if (o.state === 'dizzy') { o.timer -= dt; xGrav(o, dt); o.vx = 0; moveBody(o, dt); o.fr = 2; if (o.timer <= 0) o.state = 'walk'; }
      else { xWalk(o, dt, d.speed); o.fr = 0; o.cool = (o.cool || 0) - dt; if (o.cool <= 0 && xFront(o, px, py, ex, ey, 300)) { o.state = 'slide'; o.timer = 2; o.cool = 2.5; sfx('dash', 1.3); } }
      break;
    }
    case 'sabo': {
      xGrav(o, dt); o.vx = 0; moveBody(o, dt); o.face = px < ex ? -1 : 1;
      if (Math.abs(px - ex) < 520) o.timer -= dt;
      o.fr = o.timer < 0.45 && o.timer > 0 ? 2 : o.shotT > 0 ? 1 : 0;
      if (o.shotT > 0) o.shotT -= dt;
      if (o.timer <= 0) { o.timer = 2.5; o.shotT = 0.3; for (const vx of [-170, 0, 170]) xShot(ex, o.y + 6, vx, -560, '#7ed957'); sfx('fire', 1.7); }
      break;
    }
    case 'sasori': case 'inoshishi': case 'knight': {
      const mid = d.mid;
      if (mid && o.invT > 0) o.invT -= dt;
      if (o.state === 'charge') {
        o.timer -= dt; xGrav(o, dt); o.vx = o.face * (o.type === 'sasori' ? 330 : 300 + (3 - (o.hp || 3)) * 70); moveBody(o, dt); o.fr = 1;
        if (Math.random() < dt * 14) dust(ex - o.face * 20, o.y + o.h, 1);
        const ahead = Math.floor((o.face > 0 ? o.x + o.w + 2 : o.x - 2) / TILE), below = Math.floor((o.y + o.h + 4) / TILE);
        if (o.hitWall) { o.state = 'dizzy'; o.timer = mid ? 1.6 : 1.3; sfx('bump'); cam.shake = Math.max(cam.shake, mid ? 0.2 : 0.08); }
        else if (o.timer <= 0 || (o.onGround && !isSolid(ahead, below) && !isOneWay(ahead, below))) { o.state = 'walk'; o.face *= -1; }
      } else if (o.state === 'dizzy') { o.timer -= dt; xGrav(o, dt); o.vx = 0; moveBody(o, dt); o.fr = 2; if (o.timer <= 0) { o.state = 'walk'; o.face *= -1; } }
      else {
        xWalk(o, dt, d.speed); o.fr = fr(5, 0) ? 0 : 0;
        o.cool = (o.cool || 0) - dt;
        if (o.cool <= 0 && xFront(o, px, py, ex, ey, mid ? 360 : 280, mid ? 90 : 55)) { o.state = 'charge'; o.timer = mid ? 2.4 : 1.6; o.cool = mid ? 1.4 : 2; sfx('dash', mid ? 0.8 : 1.2); }
        if (mid && o.state === 'walk' && o.cool <= -2.5) { o.face = px < ex ? -1 : 1; o.cool = 0; }
      }
      break;
    }
    case 'gear': {
      if (o.state === 'broken') { o.timer -= dt; xGrav(o, dt); o.vx = 0; moveBody(o, dt); o.fr = 2; if (o.timer <= 0) { o.state = 'walk'; sparkle(ex, ey, 6); sfx('bump', 1.6); } }
      else { xWalk(o, dt, d.speed); o.fr = fr(6, 1); }
      break;
    }
    case 'sunazame': {
      if (o.state === 'under') {
        o.fr = 0; o.vy = 0; const dir = Math.sign(px - ex) || -1; o.face = dir;
        const ahead = Math.floor((dir > 0 ? o.x + o.w + 4 : o.x - 4) / TILE), below = Math.floor((o.gy + o.h + 4) / TILE);
        if (isSolid(ahead, below) && !isSolid(ahead, below - 1)) o.x += dir * 110 * dt;
        o.y = o.gy;
        if (Math.random() < dt * 8) dust(ex, o.y + o.h, 1);
        o.cool = (o.cool || 0) - dt;
        if (o.cool <= 0 && Math.abs(px - ex) < 120 && Math.abs(py - ey) < 120) { o.state = 'air'; o.vy = -640; o.vx = dir * 160; sfx('jump', 0.7); burst(ex, o.y + o.h, '#e8c890', 10, 180, 4); }
      } else if (o.state === 'air') { xGrav(o, dt); moveBody(o, dt); o.fr = 1; if (o.onGround && o.vy >= 0) { o.state = 'flop'; o.timer = 0.7; } }
      else { o.timer -= dt; xGrav(o, dt); o.vx = 0; moveBody(o, dt); o.fr = 2; if (o.timer <= 0) { o.state = 'under'; o.gy = o.y; o.cool = 1.2; } }
      break;
    }
    case 'gorogumo': case 'ufo': case 'nezumi': {
      if (o.type === 'nezumi' && o.state === 'run') { xWalk(o, dt, 150); o.fr = 2; break; }
      const tx = clamp(px - o.w / 2, o.x0 - o.range, o.x0 + o.range);
      const sp = o.type === 'ufo' ? 110 : 85;
      if (!(o.type === 'gorogumo' && o.state === 'warn')) o.x += clamp(tx - o.x, -sp * dt, sp * dt);
      o.y = o.y0 + Math.sin(o.ph * 2) * 6; o.face = px < ex ? -1 : 1;
      o.timer -= dt;
      if (o.type === 'gorogumo') {
        if (o.state === 'warn') { o.fr = 1; if (o.timer <= 0) { o.state = 'walk'; o.timer = 3.2; o.fr = 0; o.boltT = 0.35; const gy = groundYBelow(Math.floor(ex / TILE), Math.floor((o.y + o.h) / TILE) + 1); world.ents.push({ id: ++uid, t: 'x_bolt', x: ex - 14, y: o.y + o.h, w: 28, h: Math.max(TILE, gy * TILE - (o.y + o.h)), life: 0.35 }); sfx('boom', 1.6); cam.shake = Math.max(cam.shake, 0.1); } }
        else { o.fr = 0; if (o.boltT > 0) o.boltT -= dt; if (o.timer <= 0 && Math.abs(px - ex) < 360) { o.state = 'warn'; o.timer = 0.8; sfx('select', 0.6); } }
      } else if (o.type === 'ufo') {
        if (o.state === 'beam') { o.fr = 0; if (o.timer <= 0) { o.state = 'walk'; o.timer = 2.4; o.dizzyT = 0.6; }
          if (!P.dead && Math.abs(px - ex) < 34 && py > ey && py - ey < 7 * TILE) { P.vy = lerp(P.vy, -260, dt * 6); P.onGround = false; if (Math.random() < dt * 20) sparkle(px + rnd(-14, 14), py, 1); } }
        else { o.fr = o.dizzyT > 0 ? 2 : 0; if (o.dizzyT > 0) o.dizzyT -= dt; if (o.timer <= 0 && Math.abs(px - ex) < 40 && py > ey) { o.state = 'beam'; o.timer = 1.5; sfx('star', 1.6); } }
      } else {
        o.fr = o.dropT > 0 ? 1 : 0; if (o.dropT > 0) o.dropT -= dt;
        if (o.timer <= 0 && Math.abs(px - ex) < 70 && py > ey) { o.timer = 2.4; o.dropT = 0.35; xShot(ex, o.y + o.h, 0, 60, '#8a5a2a', 1100, 'spit', 22); sfx('swing', 0.9); }
      }
      break;
    }
    case 'itachi': {
      if (o.state === 'idle') { o.fr = 0; o.y = o.y0; o.face = px < ex ? -1 : 1; o.cool = (o.cool || 0) - dt; if (o.cool <= 0 && Math.abs(px - ex) < 420 && Math.abs(py - ey) < 150) { o.state = 'dash'; o.timer = 1.6; sfx('dash', 1); } }
      else if (o.state === 'dash') { o.timer -= dt; o.x += o.face * 380 * dt; o.y = o.y0 + Math.sin(o.ph * 10) * 4; o.fr = 1; if (Math.random() < dt * 25) dust(ex - o.face * 20, ey, 1);
        if (o.timer <= 0 || isSolid(Math.floor((o.face > 0 ? o.x + o.w : o.x) / TILE), Math.floor(ey / TILE))) { o.state = 'dizzy'; o.timer = 1; } }
      else { o.timer -= dt; o.fr = 2; if (o.timer <= 0) { o.state = 'idle'; o.cool = 0.8; } }
      break;
    }
    case 'chochin': {
      o.timer -= dt; o.y += Math.sin(o.ph * 3) * 10 * dt; o.face = px < ex ? -1 : 1;
      if (o.state === 'show') { o.alpha = Math.min(1, o.alpha + dt * 3); o.fr = o.shotT > 0 ? 2 : 0; if (o.shotT > 0) o.shotT -= dt;
        if (o.timer < 1.2 && !o.shot && Math.abs(px - ex) < 520) { o.shot = true; o.shotT = 0.35; const a = Math.atan2(py - ey, px - ex); world.ents.push({ id: ++uid, t: 'magic', x: ex - 12, y: ey - 12, w: 24, h: 24, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, life: 4 }); sfx('fire', 1.3); }
        if (o.timer <= 0) { o.state = 'fade'; o.timer = 0.5; } }
      else if (o.state === 'fade') { o.alpha = Math.max(0, o.alpha - dt * 2.4); o.fr = 1; if (o.timer <= 0) {
        // ハルの ちかくへ(かべの 中には 出ない)
        for (let k = 0; k < 6; k++) { const nx = px + (Math.random() < 0.5 ? -1 : 1) * rnd(130, 220), ny = py - rnd(40, 110); if (!isSolid(Math.floor(nx / TILE), Math.floor(ny / TILE)) && ny > 1.5 * TILE) { o.x = nx - o.w / 2; o.y = ny - o.h / 2; break; } }
        o.state = 'show'; o.timer = 2.2; o.shot = false; o.alpha = 0; } }
      break;
    }
    case 'karakasa': {
      o.vy = Math.min(o.vy + GRAV * dt, o.vy > 0 ? 95 : MAXFALL); moveBody(o, dt);
      if (o.onGround) { o.vx *= 0.75; o.fr = 0; o.timer -= dt; if (o.timer <= 0 && Math.abs(px - ex) < 460) { o.face = px < ex ? -1 : 1; o.vy = -620; o.vx = o.face * 110; o.timer = 1.4; } }
      else o.fr = o.vy > 0 ? 2 : 1;
      break;
    }
    case 'onibi': case 'meteon': {
      xFreeMove(o, dt); o.face = o.vx > 0 ? 1 : -1;
      if (o.bounceT > 0) o.bounceT -= dt;
      o.fr = o.type === 'meteon' ? (o.bounceT > 0 ? 2 : 1) : (Math.floor(o.ph * 5) % 3 === 2 ? 2 : fr(9, 1));
      if (Math.random() < dt * 20) parts.push({ x: ex + rnd(-8, 8), y: ey + rnd(-8, 8), vx: -o.vx * 0.2, vy: -o.vy * 0.2, life: 0.35, max: 0.35, color: o.type === 'meteon' ? '#ff9a3a' : '#9fe0ff', size: rnd(3, 6), g: 0, puff: true });
      break;
    }
    case 'goroyado': {
      const near = Math.abs(px - ex) < 130 && Math.abs(py - ey) < 100;
      if (o.state === 'hide') { xGrav(o, dt); o.vx = 0; moveBody(o, dt); o.fr = 1; if (!(Math.abs(px - ex) < 190 && Math.abs(py - ey) < 120)) { o.state = 'peek'; o.timer = 0.7; } }
      else if (o.state === 'peek') { o.timer -= dt; xGrav(o, dt); o.vx = 0; moveBody(o, dt); o.fr = 2; if (near) { o.state = 'hide'; } else if (o.timer <= 0) o.state = 'walk'; }
      else { xWalk(o, dt, d.speed); o.fr = 0; if (near) { o.state = 'hide'; sfx('bump', 1.8); } }
      break;
    }
    case 'nisebako': case 'futago': {
      if (o.type === 'nisebako' && o.state === 'sleep') { xGrav(o, dt); o.vx = 0; moveBody(o, dt); o.fr = 0; if (Math.abs(px - ex) < 150 && Math.abs(py - ey) < 120) { o.state = 'walk'; o.vy = -420; sfx('door', 1.4); } break; }
      xGrav(o, dt); moveBody(o, dt);
      if (o.onGround) { o.vx *= 0.75; o.timer -= dt; o.fr = o.type === 'futago' ? 0 : 1; if (o.timer <= 0 && Math.abs(px - ex) < 480) { o.face = px < ex ? -1 : 1; o.vx = o.face * (o.type === 'futago' ? 120 + (2 - o.size) * 40 : 150); o.vy = o.type === 'futago' ? -420 - (2 - o.size) * 60 : -480; o.timer = o.type === 'futago' ? 0.9 : 0.7; } }
      else o.fr = o.type === 'futago' ? 1 : 2;
      if (o.splitT > 0) { o.splitT -= dt; o.fr = 2; }
      break;
    }
    case 'kakureon': {
      const near = Math.abs(px - ex) < 210 && Math.abs(py - ey) < 120;
      o.alpha = lerp(o.alpha, near ? 1 : 0.12, dt * 5);
      if (o.tongueT > 0) { o.tongueT -= dt; o.fr = 1; xGrav(o, dt); o.vx = 0; moveBody(o, dt);
        const tb = { x: o.face > 0 ? o.x + o.w : o.x - 80, y: o.y + 8, w: 80, h: 16 };
        if (!P.dead && o.tongueT < 0.3 && overlap(P, tb)) hurtPlayer(ex); break; }
      xWalk(o, dt, near ? 0 : d.speed); o.fr = o.alpha < 0.6 ? 2 : 0;
      if (near) o.face = px < ex ? -1 : 1;
      o.cool = (o.cool || 0) - dt;
      if (o.cool <= 0 && o.alpha > 0.8 && xFront(o, px, py, ex, ey, 125, 50)) { o.tongueT = 0.45; o.cool = 1.6; sfx('swing', 1.5); }
      break;
    }
    case 'wani': {
      const prevY = o.y;
      const onIt = !P.dead && P.onGround && Math.abs(P.y + P.h - o.y) < 6 && P.x + P.w > o.x + 4 && P.x < o.x + o.w - 4;
      if (o.state === 'float') { o.fr = 0; o.y = o.y0 + Math.sin(o.ph * 2) * 3; o.plat = true; if (onIt) { o.state = 'warn'; o.timer = 0.8; } }
      else if (o.state === 'warn') { o.timer -= dt; o.fr = 0; o.y = o.y0 + Math.sin(o.ph * 40) * 2; if (o.timer <= 0) { o.state = 'bite'; o.timer = 1.4; o.plat = false; sfx('stomp', 0.6); if (onIt) hurtPlayer(o.x + o.w / 2); } }
      else { o.timer -= dt; o.fr = 1; o.y = Math.min(o.y0 + 46, o.y + 120 * dt); if (o.timer <= 0) { o.state = 'float'; o.y = o.y0; } }
      o.dx = 0; o.dy = o.y - prevY;
      break;
    }
    case 'oumu': {
      if (o.state === 'swoop') { o.timer -= dt; o.x += o.vx * dt; o.y += o.vy * dt; o.fr = 2; if (o.timer <= 0 || o.y > o.y0 + 5 * TILE || isSolid(Math.floor(ex / TILE), Math.floor((o.y + o.h) / TILE))) o.state = 'back'; }
      else if (o.state === 'back') { o.x = lerp(o.x, o.x0, dt * 1.6); o.y = lerp(o.y, o.y0, dt * 2); o.fr = fr(8, 1); if (Math.abs(o.y - o.y0) < 5) { o.state = 'walk'; o.cool = 1.6; } }
      else { o.x = o.x0 + Math.sin(o.ph * 0.9) * 100; o.y = o.y0 + Math.sin(o.ph * 3) * 8; o.fr = fr(8, 1); o.face = Math.cos(o.ph * 0.9) > 0 ? 1 : -1; o.cool = (o.cool || 0) - dt;
        if (o.cool <= 0 && Math.abs(px - ex) < 220 && py > ey + 40) { o.state = 'swoop'; o.timer = 0.9; const a = Math.atan2(py - ey, px - ex); o.vx = Math.cos(a) * 380; o.vy = Math.sin(a) * 380; o.face = o.vx > 0 ? 1 : -1; sfx('dash', 1.4); } }
      break;
    }
    case 'jiro': case 'koma': {
      if (o.type === 'koma') {
        o.cyc = ((o.cyc ?? rnd(0, 3)) + dt) % 4.5; o.fast = o.cyc < 3;
        xGrav(o, dt); o.vx = o.face * (o.fast ? 150 : 40); moveBody(o, dt); if (o.hitWall) { o.face = -o.hitWall; sfx('bump', 1.7); }
        o.fr = o.fast ? 0 : (o.cyc > 4 ? 2 : 1); break;
      }
      if (o.state === 'curl') { o.timer -= dt; xGrav(o, dt); o.vx = 0; moveBody(o, dt); o.fr = 1; if (o.timer <= 0) { o.state = 'roll'; o.timer = 2.4; sfx('dash', 1.1); } }
      else if (o.state === 'roll') { o.timer -= dt; xGrav(o, dt); o.vx = o.face * 340; moveBody(o, dt); o.fr = 2; if (o.hitWall) { o.face = -o.hitWall; sfx('bump', 1.4); } if (o.timer <= 0) { o.state = 'walk'; o.cool = 2; } }
      else { xWalk(o, dt, d.speed); o.fr = 0; o.cool = (o.cool || 0) - dt; if (o.cool <= 0 && xFront(o, px, py, ex, ey, 230)) { o.state = 'curl'; o.timer = 0.4; } }
      break;
    }
    case 'hoshikurage': {
      if (o.squishT > 0) { o.squishT -= dt; o.fr = 1; break; }
      const prevY = o.y; o.y = o.y0 + Math.sin(o.ph * 1.2) * 28; o.x = o.x0 + Math.sin(o.ph * 0.5) * 40; o.fr = o.y < prevY ? 2 : 0; break;
    }
    case 'mochiusa': {
      xGrav(o, dt); o.vx = 0; moveBody(o, dt); o.face = px < ex ? -1 : 1;
      if (o.shotT > 0) { o.shotT -= dt; o.fr = 1; } else o.fr = 0;
      if (Math.abs(px - ex) < 500) o.timer -= dt;
      if (o.timer <= 0) { o.timer = 2.2; o.shotT = 0.35; const T = 1.0, dx = clamp(px - ex, -330, 330); world.ents.push({ id: ++uid, t: 'x_mochi', x: ex - 14, y: o.y - 10, w: 28, h: 22, vx: dx / T, vy: -0.5 * 1100 * T, life: 6, state: 'fly' }); sfx('swing', 1.1); }
      break;
    }
    case 'kuroneko': {
      if (o.state === 'sit') { xGrav(o, dt); o.vx = 0; moveBody(o, dt); o.fr = 0; o.face = px < ex ? -1 : 1; o.timer -= dt; if (o.timer <= 0 && Math.abs(px - ex) < 360 && Math.abs(py - ey) < 160) { o.state = 'vanish'; o.timer = 0.4; burst(ex, ey, '#3a1a5a', 12, 160, 5); sfx('door', 1.8); } }
      else if (o.state === 'vanish') { o.timer -= dt; o.alpha = Math.max(0, o.alpha - dt * 3); o.fr = 2; if (o.timer <= 0) {
        const bx = P.x + P.w / 2 - (P.face || 1) * 130, gy = groundYBelow(Math.floor(bx / TILE), Math.max(0, Math.floor(P.y / TILE)));
        if (gy < ROWS && !isSolid(Math.floor(bx / TILE), gy - 1)) { o.x = bx - o.w / 2; o.y = gy * TILE - o.h; }
        o.state = 'ready'; o.timer = 0.5; o.alpha = 1; o.face = px < o.x + o.w / 2 ? -1 : 1; burst(o.x + o.w / 2, o.y + o.h / 2, '#3a1a5a', 10, 140, 5); } }
      else if (o.state === 'ready') { o.timer -= dt; xGrav(o, dt); o.vx = 0; moveBody(o, dt); o.fr = 0; if (o.timer <= 0) { o.state = 'pounce'; o.vy = -480; o.vx = o.face * 260; sfx('jump', 1.4); } }
      else { xGrav(o, dt); moveBody(o, dt); o.fr = 1; if (o.onGround && o.vy >= 0) { o.state = 'sit'; o.timer = 1.6; o.vx = 0; } }
      break;
    }
    case 'piero': {
      xGrav(o, dt); o.vx = 0;
      if (o.state === 'box') { o.rise = Math.max(0, o.rise - dt * 3); o.fr = 0; o.cool = (o.cool || 0) - dt; if (o.cool <= 0 && Math.abs(px - ex) < 150 && Math.abs(py - ey) < 160) { o.state = 'pop'; o.timer = 1.8; sfx('spring', 1.2); } }
      else { o.timer -= dt; o.rise = Math.min(1, o.rise + dt * 6); o.fr = o.timer > 1.4 ? 1 : 2; if (o.timer <= 0) { o.state = 'box'; o.cool = 1.2; } }
      // 箱は 地面に おいたまま、とびでた ときは 上に のびる
      moveBody(o, dt); o.by = o.y + o.h;
      { const nh = o.rise > 0.5 ? 66 : 44; if (nh !== o.h) { o.y = o.by - nh; o.h = nh; } }
      break;
    }
    case 'taisho': case 'hyogolem': case 'oochochin': case 'oyabun': xMidAI(o, dt, px, py, ex, ey); break;
    default: return false;
  }
  return true;
}
// 中ボス級 その2 の うごき
function xMidAI(o, dt, px, py, ex, ey) {
  const d = o.d;
  if (o.invT > 0) o.invT -= dt;
  if (o.state === 'dizzy') { o.timer -= dt; if (!d.fly) { xGrav(o, dt); o.vx = 0; moveBody(o, dt); } o.fr = 2; if (o.timer <= 0) { o.state = 'walk'; o.timer = 1.2; } return; }
  o.face = px < ex ? -1 : 1;
  if (o.type === 'taisho') {
    xGrav(o, dt); moveBody(o, dt);
    if (o.onGround) {
      if (!o.wasG && o.big) { o.big = false; cam.shake = Math.max(cam.shake, 0.3); sfx('boom', 0.8); dust(ex, o.y + o.h, 12);
        if (!P.dead && P.onGround && Math.abs(px - ex) < 260) { P.vy = -320; P.onGround = false; }
        if (world.ents.filter(e => e.type === 'donguri' && !e.dying && !e.gone).length < 4) for (const s of [-1, 1]) { const c = X_spawnEnemy('donguri', ex + s * 60, o.y); if (c) { c.vy = -300; c.face = s; } } }
      o.vx *= 0.75; o.timer -= dt; o.fr = 0;
      if (o.timer <= 0 && Math.abs(px - ex) < 520) { const big = ++o.hops % 3 === 0; o.big = big; o.vy = big ? -820 : -420; o.vx = o.face * (big ? 140 : 110); o.timer = big ? 1.4 : 0.8; sfx('jump', 0.6); }
    } else o.fr = 1;
    o.wasG = o.onGround;
  } else if (o.type === 'hyogolem') {
    if (o.state === 'slam') { o.timer -= dt; xGrav(o, dt); o.vx = 0; moveBody(o, dt); o.fr = 1;
      if (!o.slammed && o.timer < 0.35) { o.slammed = true; cam.shake = Math.max(cam.shake, 0.3); sfx('boom', 0.7); for (const s of [-1, 1]) world.ents.push({ id: ++uid, t: 'x_wave', x: ex + s * 30 - 18, y: o.y + o.h - 30, w: 36, h: 30, vx: s * 300, life: 2.2 }); }
      if (o.timer <= 0) { o.state = 'walk'; o.timer = 2.6; } }
    else { xWalk(o, dt, d.speed); o.fr = 0; o.timer -= dt; if (o.timer <= 0 && Math.abs(px - ex) < 420) { o.state = 'slam'; o.timer = 0.9; o.slammed = false; } }
  } else if (o.type === 'oochochin') {
    o.timer -= dt; o.y = o.y0 + Math.sin(o.ph * 2) * 10;
    if (o.state === 'fade') { o.alpha = Math.max(0, (o.alpha ?? 1) - dt * 2.5); o.fr = 0; if (o.timer <= 0) {
        const nx = clamp(px + (Math.random() < 0.5 ? -1 : 1) * rnd(170, 260), cam.x + 60, cam.x + VW - 60);
        if (!isSolid(Math.floor(nx / TILE), Math.floor(o.y0 / TILE))) o.x = nx - o.w / 2;
        o.state = 'walk'; o.timer = 2.2; o.shot = false; } }
    else { o.alpha = Math.min(1, (o.alpha ?? 1) + dt * 2.5); o.fr = o.shotT > 0 ? 1 : 0; if (o.shotT > 0) o.shotT -= dt;
      if (!o.shot && o.timer < 1.2 && Math.abs(px - ex) < 560) { o.shot = true; o.shotT = 0.4; const a = Math.atan2(py - ey, px - ex); for (const da of [-0.35, 0, 0.35]) world.ents.push({ id: ++uid, t: 'magic', x: ex - 12, y: ey - 12, w: 24, h: 24, vx: Math.cos(a + da) * 150, vy: Math.sin(a + da) * 150, life: 4 }); sfx('fire', 1.1); }
      if (o.timer <= 0) { o.state = 'fade'; o.timer = 0.6; } }
  } else if (o.type === 'oyabun') {
    xGrav(o, dt); moveBody(o, dt);
    if (o.onGround) { o.vx *= 0.8; o.timer -= dt; o.fr = o.shotT > 0 ? 1 : 0; if (o.shotT > 0) o.shotT -= dt;
      if (o.timer <= 0 && Math.abs(px - ex) < 560) {
        if (++o.hops % 3 === 0) { o.vy = -760; o.vx = o.face * 160; o.timer = 1.2; sfx('jump', 0.7); }
        else { o.timer = 1.8; o.shotT = 0.4; const T2 = 1.0; for (const k of [0.8, 1.15]) { const dx = clamp((px - ex) * k, -380, 380); world.ents.push({ id: ++uid, t: 'x_mochi', x: ex - 14, y: o.y - 10, w: 28, h: 22, vx: dx / T2, vy: -0.5 * 1100 * T2, life: 6, state: 'fly' }); } sfx('swing', 0.9); } } }
    else o.fr = 1;
  }
}
function X_spawnEnemy(type, x, y) { const e = spawn({ kind: 'enemy', type, x: Math.floor(x / TILE), y: undefined, opt: {} }); if (!e) return null; e.x = x - e.w / 2; e.y = y; e.awake = true; e.zk = 1; world.ents.push(e); return e; }

// ハルが 敵に ふれた とき(ふむ・よこから)。処理したら true
function pveX(o, falling) {
  const p = P, d = o.d;
  const bounce = (v = -480) => { p.vy = held('jump') ? -760 : v; p.jumping = held('jump'); p.combo = (p.combo || 0) + 1; sfx('stomp', 1 + Math.min(8, p.combo - 1) * 0.07); hitStop(0.035); dust(o.x + o.w / 2, o.y, 6); };
  // ねむって いる 敵: ふめば たおれる(トゲでも)。よこは いたくない
  if (o.sleepT > 0 && !d.boss) { if (falling) { bounce(); defeat(o, false, p.combo); } return true; }
  if (!d.ex) return false;
  switch (o.type) {
    case 'donguri': if (falling && !o.bald) { bounce(); o.bald = true; o.vy = -200; world.score += 100; popText(o.x + o.w / 2, o.y, '+100'); parts.push({ x: o.x + o.w / 2, y: o.y, vx: rnd(-80, 80), vy: -420, life: 1, max: 1, img: 'xe_donguri_0', size: 18, g: 1400, rot: 0, vr: 6 }); return true; } return false;
    case 'gear': if (falling && o.state !== 'broken') { bounce(); o.state = 'broken'; o.timer = 3; sfx('break', 1.4); burst(o.x + o.w / 2, o.y + 10, '#9ab4d8', 8, 160, 4); return true; } if (o.state === 'broken') { if (falling) { bounce(); defeat(o, false, p.combo); } return true; } return false;
    case 'nezumi': if (falling && o.state !== 'run') { bounce(); o.state = 'run'; o.face = p.x < o.x ? 1 : -1; o.vy = 0; sfx('boom', 2.2); burst(o.x + o.w / 2, o.y, '#ff5a5a', 10, 160, 4); return true; } return false;
    case 'sunazame': return o.state === 'under';
    case 'oochochin': if ((o.alpha ?? 1) < 0.6) return true; if (falling) { bounce(-620); if (!(o.invT > 0)) xMidHit(o); return true; } if (o.invT > 0 || o.state === 'dizzy') return true; return false;
    case 'chochin': return o.alpha < 0.6;
    case 'kakureon': return o.alpha < 0.5;
    case 'piero': if (o.rise < 0.5) return true; return false;
    case 'nisebako': if (o.state === 'sleep') { if (falling) { p.vy = -420; o.state = 'walk'; o.vy = -300; sfx('door', 1.4); } return true; } if (falling) { bounce(); xChestCoins(o); defeat(o, false, p.combo); return true; } return false;
    case 'wani': if (o.state === 'bite' && overlap({ x: p.x + 4, y: p.y + 6, w: p.w - 8, h: p.h - 8 }, o)) hurtPlayer(o.x + o.w / 2); return true;
    case 'kurage': if (o.glow) { hurtPlayer(o.x + o.w / 2); return true; } return false;
    case 'goroyado': if (o.state === 'hide') { if (falling && (p.spin || p.mount)) { p.vy = -420; sfx('bump', 1.6); return true; } hurtPlayer(o.x + o.w / 2); return true; } return false;
    case 'jiro': if (o.state === 'roll' || o.state === 'curl') { if (falling) { p.vy = -560; sfx('bump', 1.5); return true; } hurtPlayer(o.x + o.w / 2); return true; } return false;
    case 'koma': if (o.fast) { if (falling) { p.vy = -620; sfx('bump', 1.8); sparkle(o.x + o.w / 2, o.y, 6); return true; } hurtPlayer(o.x + o.w / 2); return true; } return false;
    case 'hoshikurage': if (falling) { p.vy = held('jump') ? -1000 : -820; p.jumping = held('jump'); p.launchT = 0.25; o.squishT = 0.35; sfx('spring', 1.1); sparkle(o.x + o.w / 2, o.y, 8); tutFlag && tutFlag('stomp'); return true; } return false;
    case 'futago': if (falling) { bounce(); xSplit(o); return true; } return false;
    case 'imomushi': {
      // あたま(すすむ 向きの 前 4わり)だけ ふめる。からだは ぽよんと はねる
      if (!falling) return false;
      const pc = p.x + p.w / 2, headX = o.face < 0 ? o.x + o.w * 0.4 : o.x + o.w * 0.6;
      const onHead = o.face < 0 ? pc < headX : pc > headX;
      if (onHead) return false;
      p.vy = held('jump') ? -720 : -480; sfx('spring', 1.3); return true;
    }
    case 'inoshishi': case 'knight': case 'taisho': case 'hyogolem': case 'oyabun':
      if (falling) { bounce(-620); if (o.invT > 0) return true; xMidHit(o); return true; }
      if (o.invT > 0 || o.state === 'dizzy') return true;
      return false;
  }
  return false;
}
function xChestCoins(o) { for (let i = 0; i < 3; i++) world.ents.push({ id: ++uid, t: 'coin', x: o.x + o.w / 2 - 14, y: o.y - 10, w: 28, h: 32, ph: 0, vx: (i - 1) * 110, vy: -420 }); }
function xMidHit(o) {
  o.hp -= P && P.hipHitT > 0 && o.hp > 1 ? 2 : 1; o.invT = 1.0; sfx('hit'); hitStop(0.06); cam.shake = Math.max(cam.shake, 0.15);
  if (o.hp <= 0) {
    defeat(o, true); sfx('boom', 0.8); world.ents.push({ id: ++uid, t: 'heart', x: o.x + o.w / 2 - 16, y: o.y, w: 32, h: 30, ph: 0, vy: -500, vx: 0 });
    return;
  }
  o.state = 'dizzy'; o.timer = 0.9; o.vx = 0;
  popText(o.x + o.w / 2, o.y - 10, 'あと ' + o.hp, '#ffe066');
}
function xSplit(o) {
  if ((o.size || 0) <= 0) { defeat(o, false, P.combo); return; }
  world.score += 100; popText(o.x + o.w / 2, o.y, '+100');
  for (const s of [-1, 1]) {
    const c = Object.assign({}, o, { id: ++uid, size: o.size - 1, vx: s * 170, vy: -420, timer: 0.8, splitT: 0.3, face: s, zk: 1 });
    xSize(c); c.x = o.x + o.w / 2 - c.w / 2 + s * 10; world.ents.push(c);
  }
  o.gone = true; sfx('spring', 1.6); burst(o.x + o.w / 2, o.y + o.h / 2, '#ff8ad8', 10, 180, 4);
}
// けんが 敵に あたった とき。処理したら true(ほかの 処理を とばす)
function swordX(o, p) {
  const d = o.d;
  if (!d.ex) return false;
  if (o.type === 'sunazame' && o.state === 'under') return true;
  if (o.type === 'piero' && o.rise < 0.5) return true;
  if ((o.type === 'chochin' || o.type === 'oochochin') && (o.alpha ?? 1) < 0.6) return true;
  // たてもち: まえからは はじく
  if ((o.type === 'tento' || o.type === 'golem' || o.type === 'knight') && o.face === -p.face && o.state !== 'dizzy') {
    sfx('bump', 1.4); sparkle(o.x + o.w / 2 + o.face * 10, o.y + o.h / 2, 6); p.vx = -p.face * 300; return true;
  }
  if (o.type === 'nisebako') xChestCoins(o);
  if (o.type === 'futago' && o.size > 0) { xSplit(o); return true; }
  if (d.mid) { if (o.invT <= 0) xMidHit(o); return true; }
  return false;
}

// ---------------- しかけ ----------------
function spawnX(e, X, Y, o, id) {
  const gyAt = x => groundYBelow(x, e.y !== undefined ? e.y : 0);
  switch (e.type) {
    case 'x_bumper': return { id, t: 'x_bumper', x: X, y: Y, w: 48, h: 48, cx: X + 24, cy: Y + 24, r: 24, sq: 0, cd: 0 };
    case 'x_tree': { const gy = gyAt(e.x); return { id, t: 'x_tree', x: X - 24, y: gy * TILE - 130, w: 96, h: 130, n: 0, cd: 0, shake: 0, plat: true, dx: 0, dy: 0 }; }
    case 'x_paint': { const gy = gyAt(e.x); return { id, t: 'x_paint', x: X + 2, y: gy * TILE - 8, w: 44, h: 10, g: o.g || 0, on: false }; }
    case 'x_gate': return { id, t: 'x_gate', x: X + 6, y: Y, w: 36, h: (o.h || 3) * TILE, y0: Y, g: o.g || 0, solid: true, open: false };
    case 'x_pend': { const ax = X + 24, ay = Y; return { id, t: 'x_pend', ax, ay, L: (o.len || 4) * TILE, amp: o.amp || 0.9, sp: o.sp || 1.6, phs: o.phase || 0, x: ax - 48, y: ay + (o.len || 4) * TILE, w: 96, h: 18, plat: true, dx: 0, dy: 0 }; }
    case 'x_raft': return { id, t: 'x_raft', x: X, y: Y + 6, y0: Y + 6, w: 120, h: 18, x0: X, xEnd: X + (o.dist || 10) * TILE, plat: true, dx: 0, dy: 0, moving: false };
    case 'x_fall': { const gy = gyAt(e.x); return { id, t: 'x_fall', x: X, y: 0, w: (o.w || 2) * TILE, h: gy * TILE, per: o.per || 4, phs: o.phase || 0, thick: true }; }
    case 'x_qsand': return { id, t: 'x_qsand', x: X, y: Y, w: (o.w || 3) * TILE, h: ROWS * TILE - Y, jp: false };
    case 'x_honey': { const gy = gyAt(e.x); return { id, t: 'x_honey', x: X, y: gy * TILE - 10, w: (o.w || 6) * TILE, h: 12 }; }
    case 'x_piston': return { id, t: 'x_piston', bx: o.dir > 0 ? X + TILE : X, x: X, y: Y + 4, w: 1, h: TILE - 8, dir: o.dir || -1, len: (o.len || 3) * TILE, ext: 0, phs: o.phase || 0, solid: true };
    case 'x_elev': return { id, t: 'x_elev', x: X, y: Y, y0: Y, top: Y - (o.rise || 6) * TILE, w: 96, h: 18, plat: true, dx: 0, dy: 0 };
    case 'x_mortar': { const gy = gyAt(e.x); return { id, t: 'x_mortar', x: X, y: gy * TILE - 48, w: 48, h: 48, timer: o.phase ?? 1.5, every: o.every || 3, face: o.dir || -1 }; }
    case 'x_sidespring': return { id, t: 'x_sidespring', x: X + (o.dir > 0 ? 0 : 24), y: Y, w: 24, h: 48, dir: o.dir || 1, sq: 0, cd: 0 };
    case 'x_thunder': return { id, t: 'x_thunder', x: X, y: Y, w: 96, h: 44, x0: X, x1: X + (o.range || 10) * TILE, vx: 70, timer: o.phase ?? 1.5, state: 'move' };
    case 'x_ring': return { id, t: 'x_ring', x: X, y: Y, w: 56, h: 56, ang: (o.ang ?? -20) * Math.PI / 180, power: o.power || 820, cd: 0 };
    case 'x_bell': return { id, t: 'x_bell', x: X + 6, y: Y + 2, w: 36, h: 40, cd: 0, ring: 0 };
    case 'x_flip': return { id, t: 'x_flip', x: X, y: Y, w: 96, h: 18, per: o.per || 4, phs: o.phase || 0, plat: true, dx: 0, dy: 0, flip: 0 };
    case 'x_rspike': { const gy = gyAt(e.x); return { id, t: 'x_rspike', x: X, y: gy * TILE - 26, w: (o.w || 4) * TILE, h: 26, per: o.per || 2.4, phs: o.phase || 0, up: 0 }; }
    case 'x_inflate': return { id, t: 'x_inflate', cx: X + 24, x: X - 36, y: Y, w: 120, h: 18, per: o.per || 3.2, phs: o.phase || 0, s: 1, plat: true, dx: 0, dy: 0 };
    case 'x_rocket': return { id, t: 'x_rocket', x: X, y: Y, y0: Y, top: Y - (o.rise || 6) * TILE, w: 96, h: 18, plat: true, dx: 0, dy: 0, state: 'idle', timer: 0 };
    case 'x_phantom': return { id, t: 'x_phantom', x: X, y: Y, w: (o.w || 2) * TILE, h: 18, plat: false, a: 0, dx: 0, dy: 0 };
  }
  return null;
}
const pFeetOn = (o, tol = 6) => !P.dead && P.onGround && Math.abs(P.y + P.h - o.y) < tol && P.x + P.w > o.x + 2 && P.x < o.x + o.w - 2;
function updateThingX(o, dt) {
  const p = P;
  switch (o.t) {
    case 'x_wave': { o.life -= dt; o.x += o.vx * dt; if (o.life <= 0 || isSolid(Math.floor((o.x + o.w / 2 + Math.sign(o.vx) * 20) / TILE), Math.floor((o.y + o.h - 4) / TILE))) { o.gone = true; return true; } if (Math.random() < dt * 30) parts.push({ x: o.x + o.w / 2, y: o.y + o.h, vx: rnd(-30, 30), vy: rnd(-120, -40), life: 0.4, max: 0.4, color: '#cdf3ff', size: rnd(3, 6), g: 600 }); if (!P.dead && overlap(P, { x: o.x + 6, y: o.y + 6, w: o.w - 12, h: o.h - 6 })) hurtPlayer(o.x + o.w / 2); return true; }
    case 'x_bolt': o.life -= dt; if (o.life <= 0) o.gone = true; if (!p.dead && overlap(p, { x: o.x + 4, y: o.y, w: o.w - 8, h: o.h })) hurtPlayer(o.x + o.w / 2); return true;
    case 'x_mochi': {
      o.life -= dt; if (o.life <= 0) { o.gone = true; return true; }
      if (o.state === 'fly') { o.vy += 1100 * dt; o.x += o.vx * dt; o.y += o.vy * dt;
        const gy = groundYBelow(Math.floor((o.x + o.w / 2) / TILE), Math.max(0, Math.floor(o.y / TILE)));
        if (o.vy > 0 && o.y + o.h >= gy * TILE) { o.y = gy * TILE - o.h; o.state = 'stick'; o.life = 3; sfx('stomp', 0.7); }
        if (o.y > ROWS * TILE) o.gone = true;
        if (!p.dead && overlap(p, o)) { hurtPlayer(o.x + o.w / 2); o.gone = true; } }
      else if (!p.dead && overlap(p, { x: o.x - 6, y: o.y - 4, w: o.w + 12, h: o.h + 4 })) { p.vx *= 0.82; if (p.vy < -400 && !o.slowJ) { p.vy *= 0.7; o.slowJ = true; } if (p.onGround) o.slowJ = false; }
      return true;
    }
    case 'x_shellbomb': {
      o.vy += 900 * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.rot = (o.rot || 0) + dt * 8;
      if (o.y + o.h >= o.ty || isSolid(Math.floor((o.x + o.w / 2) / TILE), Math.floor((o.y + o.h) / TILE))) {
        o.gone = true; burst(o.x + o.w / 2, o.y + o.h, '#ff9a3a', 16, 260, 6); sfx('boom', 1.1); cam.shake = Math.max(cam.shake, 0.12);
        if (!p.dead && Math.hypot(p.x + p.w / 2 - (o.x + o.w / 2), p.y + p.h / 2 - (o.y + o.h)) < 64) hurtPlayer(o.x + o.w / 2);
      } else if (!p.dead && overlap(p, o)) { o.gone = true; burst(o.x + 12, o.y + 12, '#ff9a3a', 12, 220, 5); sfx('boom', 1.2); hurtPlayer(o.x + o.w / 2); }
      if (p.attackT > 0 && overlap({ x: p.face > 0 ? p.x + p.w - 4 : p.x - 60, y: p.y, w: 64, h: 50 }, o)) { o.gone = true; sparkle(o.x + 12, o.y + 12, 8); sfx('hit', 1.3); }
      return true;
    }
    case 'x_bumper': {
      if (o.sq > 0) o.sq -= dt; if (o.cd > 0) o.cd -= dt;
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2, dx = cx - o.cx, dy = cy - o.cy, dd = Math.hypot(dx, dy);
      if (!p.dead && o.cd <= 0 && dd < o.r + 24) {
        const nx = dx / (dd || 1), ny = dy / (dd || 1);
        if (ny < -0.45) { p.vy = held('jump') ? -1050 : -880; p.jumping = held('jump'); p.launchT = 0.35; }
        else { p.vx = nx * 620; p.vy = Math.min(-300, ny * 620); p.launchT = 0.3; p.x += nx * 6; }
        o.sq = 0.25; o.cd = 0.15; sfx('spring', 1.35); sparkle(o.cx, o.cy, 8);
      }
      for (const e of world.ents) if (e.t === 'enemy' && !e.dying && !e.d.boss && !e.d.fly && overlap(e, { x: o.x, y: o.y, w: o.w, h: o.h })) { e.vy = -500; e.face = -e.face; }
      return true;
    }
    case 'x_tree': {
      // ゆらし方: けんで たたく か、木の 上(はっぱの 上)に とびのる。ヒップドロップは つかわない
      if (o.cd > 0) o.cd -= dt; if (o.shake > 0) o.shake -= dt;
      const near = !p.dead && Math.abs(p.x + p.w / 2 - (o.x + o.w / 2)) < 70 && p.y + p.h > o.y + 40 && p.y < o.y + o.h;
      const swordHit = p.attackT > 0 && near;
      const top = { x: o.x + 4, y: o.y, w: o.w - 8 };
      const onTop = pFeetOn(top, 8);
      const landed = onTop && !o.wasOn;
      o.wasOn = onTop;
      if ((swordHit || landed) && o.cd <= 0 && o.n < 3) {
        o.cd = 0.6; o.shake = 0.5; o.n++; sfx('bump', 0.8); cam.shake = Math.max(cam.shake, 0.06);
        const items = o.n < 3 ? [['coin', 28, 32], ['coin', 28, 32]] : [['heart', 32, 30]];
        items.forEach(([t, w, h], i) => world.ents.push({ id: ++uid, t, x: o.x + 20 + i * 36 + rnd(-6, 6), y: o.y + 40, w, h, ph: 0, vx: (i ? 1 : -1) * rnd(60, 110), vy: -300 }));
        for (let i = 0; i < 6; i++) parts.push({ x: o.x + rnd(10, o.w - 10), y: o.y + rnd(10, 60), vx: rnd(-60, 60), vy: rnd(-40, 40), life: 0.9, max: 0.9, color: '#5fbf4e', size: rnd(4, 7), g: 300 });
      }
      return true;
    }
    case 'x_paint': if (!o.on && pFeetOn({ x: o.x, y: o.y + 8, w: o.w }, 10)) { o.on = true; sfx('coin', 1.4); sparkle(o.x + o.w / 2, o.y, 6); world.score += 50; } return true;
    case 'x_gate': {
      if (!o.open) { const all = world.ents.filter(e => e.t === 'x_paint' && e.g === o.g); if (all.length && all.every(e => e.on)) { o.open = true; sfx('door'); sfx('star', 1.2); toast = { text: 'ぜんぶ ぬれた!', sub: 'とびらが ひらいた', t: 1.6 }; } }
      if (o.open) { o.y -= 140 * dt; o.solid = false; if (o.y < o.y0 - o.h - 10) o.gone = true; }
      return true;
    }
    case 'x_pend': {
      const prevX = o.x, prevY = o.y, th = Math.sin((o.ph + o.phs) * o.sp) * o.amp;
      o.x = o.ax + Math.sin(th) * o.L - o.w / 2; o.y = o.ay + Math.cos(th) * o.L;
      o.dx = o.x - prevX; o.dy = o.y - prevY; return true;
    }
    case 'x_raft': {
      const prevX = o.x, prevY = o.y;
      // 2026-10-17: のって いる 間だけ すすむ。だれも のって いないと 1.5びょうで もとの 岸へ もどる(水に おちても やりなおせる)
      const onR = pFeetOn(o, 8); if (onR) { o.moving = true; o.idleT = 0; } else o.idleT = (o.idleT || 0) + dt;
      if (onR && o.x < o.xEnd) o.x = Math.min(o.xEnd, o.x + 110 * dt);
      else if (!onR && o.idleT > 1.5 && o.x > o.x0) o.x = Math.max(o.x0, o.x - 220 * dt);
      o.y = o.y0 + Math.sin(o.ph * 2.2) * 3;
      o.dx = o.x - prevX; o.dy = o.y - prevY; return true;
    }
    case 'x_fall': {
      const c = (o.ph + o.phs) % o.per; o.thick = c < o.per - 1.4;
      if (!p.dead && o.thick && overlap(p, { x: o.x + 6, y: 0, w: o.w - 12, h: o.h })) { if (p.vy < 300) p.vy = Math.min(p.vy + 3400 * dt, 300); p.vx *= 0.92; if (Math.random() < dt * 20) parts.push({ x: p.x + rnd(0, p.w), y: p.y, vx: rnd(-40, 40), vy: 120, life: 0.4, max: 0.4, color: '#bfe8ff', size: 4, g: 600 }); }
      return true;
    }
    case 'x_qsand': {
      if (p.dead) return true;
      const inS = p.x + p.w > o.x + 8 && p.x < o.x + o.w - 8 && p.y + p.h > o.y + 2;
      if (inS) {
        if (p.vy > 50) p.vy = 50;
        p.vx *= 0.85; p.inSand = 0.1;
        if (held('jump') && !o.jp) { p.vy = -660; p.jumping = true; sfx('jump', 0.8); dust(p.x + p.w / 2, o.y, 6); }
        o.jp = held('jump');
        if (Math.random() < dt * 10) dust(p.x + p.w / 2, o.y, 1);
        if (p.y > o.y - 12) { hurtPlayer(o.x + o.w / 2); if (!p.dead) { p.vy = -760; p.y = o.y - p.h - 2; } }
      } else o.jp = held('jump');
      return true;
    }
    case 'x_honey': {
      if (!p.dead && p.onGround && p.y + p.h >= o.y && p.y + p.h <= o.y + 16 && p.x + p.w > o.x && p.x < o.x + o.w) { p.vx = clamp(p.vx, -150, 150); o.on = 0.12; if (Math.random() < dt * 6) parts.push({ x: p.x + p.w / 2, y: o.y, vx: 0, vy: -20, life: 0.4, max: 0.4, color: '#ffb81a', size: 3, g: 300 }); }
      else if (o.on > 0) { o.on -= dt; if (p.vy < -500) { p.vy *= 0.72; o.on = 0; } }
      for (const e of world.ents) if (e.t === 'enemy' && !e.dying && e.onGround && overlap(e, { x: o.x, y: o.y - 4, w: o.w, h: 20 })) e.x -= e.vx * dt * 0.5;
      return true;
    }
    case 'x_piston': {
      // ひっこむ 1.1 → のびる 0.25 → まつ 0.9 → もどる 0.6
      const c = (o.ph + o.phs) % 2.85;
      o.ext = c < 1.1 ? 0 : c < 1.35 ? (c - 1.1) / 0.25 : c < 2.25 ? 1 : 1 - (c - 2.25) / 0.6;
      const len = Math.max(1, o.len * o.ext);
      o.w = len; o.x = o.dir > 0 ? o.bx : o.bx - len;
      o.warn = c > 0.8 && c < 1.1;
      if (!p.dead && overlap(p, o)) {
        if (o.dir < 0) p.x = o.x - p.w - 0.5; else p.x = o.x + o.w + 0.5;
        p.vx = o.dir * 260;
        const tx = Math.floor((o.dir < 0 ? p.x : p.x + p.w) / TILE);
        if (isSolid(tx, Math.floor((p.y + p.h / 2) / TILE))) hurtPlayer(o.x + o.w / 2);
      }
      return true;
    }
    case 'x_elev': {
      const prevY = o.y;
      if (pFeetOn(o, 8)) o.y = Math.max(o.top, o.y - 130 * dt); else o.y = Math.min(o.y0, o.y + 170 * dt);
      o.dx = 0; o.dy = o.y - prevY; return true;
    }
    case 'x_mortar': {
      o.timer -= dt; o.face = p.x + p.w / 2 < o.x + 24 ? -1 : 1; if (o.recoil > 0) o.recoil -= dt;
      if (o.timer <= 0 && Math.abs(p.x - o.x) < 640 && !p.dead) {
        o.timer = o.every; o.recoil = 0.25;
        const sx = o.x + 24 + o.face * 18, sy = o.y + 4, tx = p.x + p.w / 2 + p.vx * 0.5, T = 1.35;
        const ty = groundYBelow(Math.floor(tx / TILE), Math.max(0, Math.floor(p.y / TILE))) * TILE;
        const vx = (tx - sx) / T, vy = (ty - sy - 0.5 * 900 * T * T) / T;
        world.ents.push({ id: ++uid, t: 'x_shellbomb', x: sx - 12, y: sy - 12, w: 24, h: 24, vx, vy, ty, tx, rot: 0 });
        sfx('boom', 1.5); burst(sx, sy, '#bbb', 6, 120, 4);
      }
      return true;
    }
    case 'x_sidespring': {
      if (o.sq > 0) o.sq -= dt; if (o.cd > 0) o.cd -= dt;
      if (!p.dead && o.cd <= 0 && overlap(p, o)) { p.vx = o.dir * 920; p.vy = Math.min(p.vy, -380); p.launchT = 0.6; p.face = o.dir; o.sq = 0.25; o.cd = 0.3; sfx('spring', 1.1); }
      return true;
    }
    case 'x_thunder': {
      o.timer -= dt;
      if (o.state === 'move') { o.x += o.vx * dt; if (o.x > o.x1) { o.x = o.x1; o.vx = -70; } if (o.x < o.x0) { o.x = o.x0; o.vx = 70; } if (o.timer <= 0) { o.state = 'warn'; o.timer = 0.9; } }
      else if (o.state === 'warn') { if (o.timer <= 0) { o.state = 'bolt'; o.timer = 0.35; sfx('boom', 1.7); cam.shake = Math.max(cam.shake, 0.1); } }
      else { const cx = o.x + o.w / 2, gy = groundYBelow(Math.floor(cx / TILE), Math.floor((o.y + o.h) / TILE) + 1); o.by = gy * TILE;
        if (!p.dead && overlap(p, { x: cx - 16, y: o.y + o.h, w: 32, h: o.by - o.y - o.h })) hurtPlayer(cx);
        if (o.timer <= 0) { o.state = 'move'; o.timer = 2.4; } }
      return true;
    }
    case 'x_ring': {
      if (o.cd > 0) o.cd -= dt;
      if (!p.dead && o.cd <= 0 && overlap({ x: p.x + 6, y: p.y + 6, w: p.w - 12, h: p.h - 12 }, { x: o.x + 8, y: o.y + 8, w: o.w - 16, h: o.h - 16 })) {
        p.vx = Math.cos(o.ang) * o.power; p.vy = Math.sin(o.ang) * o.power; p.launchT = 0.55; p.jumping = false; p.face = Math.cos(o.ang) >= 0 ? 1 : -1;
        if (typeof maxAirJumps === 'function') p.airJumps = maxAirJumps();
        o.cd = 0.6; sfx('dash', 0.9); sparkle(o.x + o.w / 2, o.y + o.h / 2, 14);
      }
      return true;
    }
    case 'x_bell': {
      if (o.cd > 0) o.cd -= dt; if (o.ring > 0) o.ring -= dt;
      const hb = p.attackT > 0 && overlap({ x: p.face > 0 ? p.x + p.w - 4 : p.x - 60, y: p.y, w: 64, h: 50 }, o);
      const head = !p.dead && p.vy < 0 && overlap(p, { x: o.x, y: o.y + o.h - 10, w: o.w, h: 14 });
      if ((hb || head) && o.cd <= 0) {
        o.cd = 1.2; o.ring = 1; sfx('checkpoint', 1.4); if (head) p.vy = 120;
        let n = 0;
        for (const e of world.ents) if (e.t === 'enemy' && !e.dying && !e.d.boss && Math.abs(e.x - cam.x - VW / 2) < VW / 2 + 60) { e.sleepT = 5; n++; }
        toast = { text: 'ねむりの かね!', sub: n ? '敵が 5びょう ねむる(トゲの 敵も ふめる)' : 'カーン…', t: 1.6 };
      }
      return true;
    }
    case 'x_flip': {
      const c = (o.ph + o.phs) % o.per, half = o.per / 2;
      o.flip = c < half ? 0 : 1; o.wob = (c > half - 0.45 && c < half) || c > o.per - 0.45;
      if (o.flip && pFeetOn(o, 8)) { hurtPlayer(o.x + o.w / 2); P.vy = -560; }
      return true;
    }
    case 'x_rspike': {
      const c = (o.ph + o.phs) % o.per; o.up = c < o.per * 0.45 ? 0 : c < o.per * 0.45 + 0.3 ? 0.25 : 1;
      if (o.up === 1 && !o.was) sfx('swing', 1.8); o.was = o.up === 1;
      if (!p.dead && o.up === 1 && overlap(p, { x: o.x + 4, y: o.y + 6, w: o.w - 8, h: o.h - 6 })) hurtPlayer(p.x + p.w / 2 - 1);
      return true;
    }
    case 'x_inflate': {
      const prevY = o.y;
      o.s = 0.6 + 0.45 * Math.sin((o.ph + o.phs) / o.per * Math.PI * 2);
      const w = 120 * clamp(o.s, 0.2, 1); o.w = w; o.x = o.cx - w / 2; o.plat = o.s > 0.42;
      o.dx = 0; o.dy = o.y - prevY; return true;
    }
    case 'x_rocket': {
      const prevY = o.y;
      if (o.state === 'idle') { if (pFeetOn(o, 8)) { o.timer += dt; if (o.timer > 0.8) { o.state = 'up'; o.v = 0; sfx('dash', 0.6); } } else o.timer = 0; }
      else if (o.state === 'up') { o.v = Math.min(700, o.v + 2200 * dt); o.y -= o.v * dt; if (Math.random() < dt * 40) parts.push({ x: o.x + o.w / 2 + rnd(-10, 10), y: o.y + 24, vx: rnd(-30, 30), vy: 160, life: 0.4, max: 0.4, color: Math.random() < 0.5 ? '#ff9a3a' : '#ffe066', size: rnd(4, 7), g: 0, puff: true });
        if (o.y <= o.top) { o.y = o.top; o.state = 'top'; o.timer = 1.4; } }
      else if (o.state === 'top') { o.timer -= dt; if (o.timer <= 0) o.state = 'down'; }
      else { o.y = Math.min(o.y0, o.y + 140 * dt); if (o.y >= o.y0) { o.state = 'idle'; o.timer = 0; } }
      o.dx = 0; o.dy = o.y - prevY; return true;
    }
    case 'x_phantom': {
      const near = !p.dead && Math.abs(p.x + p.w / 2 - (o.x + o.w / 2)) < 170 && Math.abs(p.y - o.y) < 6 * TILE;
      o.a = clamp(o.a + (near ? 4 : -2.5) * dt, 0, 1); o.plat = o.a > 0.5; return true;
    }
  }
  return false;
}

// ---------------- 絵 ----------------
const xScale = {};
// 大きさの もとに する ポーズ(ふつうは 0。0 が ひれだけ などの ときは ほかの ポーズ)
const XREF = { sunazame: 1, wani: 1 };
function xFrameDraw(type, f, cx, bottom, dh, flip, alpha = 1) {
  const n0 = 'xe_' + type + '_' + (XREF[type] || 0), nf = 'xe_' + type + '_' + f, im0 = ART[n0] || ART['xe_' + type + '_0'], im = ART[nf] || im0;
  if (!im) return false;
  const s = dh / im0.naturalHeight;
  const h = im.naturalHeight * s, w = im.naturalWidth * s;
  drawImg(ART[nf] ? nf : (ART[n0] ? n0 : 'xe_' + type + '_0'), cx - w / 2, bottom - h, w, h, flip, alpha);
  return true;
}
function drawEnemyX(o, t) {
  const d = o.d;
  if (!d.ex) return false;
  const cx = o.x + o.w / 2, bottom = o.y + o.h + 3, flip = o.face > 0;
  const dh = o.type === 'futago' ? o.dhx : d.dh;
  ctx.save();
  if (o.dying) {
    ctx.translate(cx, o.y + o.h / 2); ctx.rotate(Math.PI); ctx.globalAlpha = Math.max(0, 1 - o.dyingT / 1.6);
    if (!xFrameDraw(o.type, 0, 0, dh / 2, dh, flip)) { ctx.filter = d.filter || 'none'; drawFit(d.img, 0, dh / 2, dh, flip); }
    ctx.restore(); return true;
  }
  let a = o.alpha ?? 1;
  if (d.mid && o.invT > 0 && Math.floor(o.invT * 20) % 2) a *= 0.45;
  ctx.globalAlpha = a;
  // とくべつな 描き方
  if (o.type === 'ufo' && o.state === 'beam') { ctx.save(); ctx.globalAlpha = 0.28 + Math.sin(t * 20) * 0.06; const g = ctx.createLinearGradient(0, o.y + o.h, 0, o.y + o.h + 7 * TILE); g.addColorStop(0, '#b8ffea'); g.addColorStop(1, 'rgba(184,255,234,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx - 14, o.y + o.h); ctx.lineTo(cx + 14, o.y + o.h); ctx.lineTo(cx + 46, o.y + o.h + 7 * TILE); ctx.lineTo(cx - 46, o.y + o.h + 7 * TILE); ctx.fill(); ctx.restore(); }
  if (o.type === 'hiyakomori' && o.state === 'hang') { ctx.strokeStyle = 'rgba(220,240,255,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, o.y - 30); ctx.lineTo(cx, o.y + 4); ctx.stroke(); }
  if (o.type === 'gorogumo' && o.state === 'warn') { ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(t * 30) * 0.2; ctx.fillStyle = '#ffe066'; const gy = groundYBelow(Math.floor(cx / TILE), Math.floor((o.y + o.h) / TILE) + 1) * TILE; ctx.fillRect(cx - 3, o.y + o.h, 6, gy - o.y - o.h); ctx.restore(); }
  if (o.type === 'kurage' && o.glow) { ctx.shadowColor = '#ffe066'; ctx.shadowBlur = 22; }
  if (o.type === 'koma' && o.fast && !ART.xe_koma_0) { ctx.save(); ctx.globalAlpha = 0.35; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(cx, o.y + o.h * 0.55, o.w * 0.65, 8, 0, t * 9 + i * 2, t * 9 + i * 2 + 1.4); ctx.stroke(); } ctx.restore(); }
  let by = bottom, ddh = dh;
  if (o.type === 'piero') by = o.by + 3;
    if (o.type === 'wani') by = o.y + o.h + 10;
  if (o.type === 'karakasa' || o.type === 'happa') by += Math.sin(t * 6 + o.id) * 1.5;
  // 動きの 味つけ(見た目だけ): 歩く敵は 足どりに 合わせて 少し はずむ、着地で つぶれる
  if (!d.fly && o.onGround && Math.abs(o.vx || 0) > 5 && o.type !== 'wani') by -= Math.abs(Math.sin(o.ph * 9)) * 2.5;
  if (!d.fly && o.onGround && !o.wasGd) o.landSq = 0.18; o.wasGd = o.onGround;
  if (o.landSq > 0) { o.landSq -= 1 / 60; const k = o.landSq / 0.18; ctx.translate(cx, by); ctx.scale(1 + 0.18 * k, 1 - 0.18 * k); ctx.translate(-cx, -by); }
  if (!xFrameDraw(o.type, o.fr || 0, cx, by, ddh, flip, 1)) {
    // 絵が まだ 無い: 前からの 絵を 色替えで
    if (d.filter) ctx.filter = d.filter;
    if (o.type === 'nisebako' || o.type === 'piero') drawImg('chest', o.x, o.y + o.h - 44, o.w, 44);
    else drawFit(d.img, cx, by, ddh, flip);
    ctx.filter = 'none';
  }
  ctx.shadowBlur = 0;
  if (o.sleepT > 0) { ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#2a2a4a'; ctx.lineWidth = 3; ctx.font = '800 16px "M PLUS Rounded 1c", sans-serif'; const zy = o.y - 8 - Math.sin(t * 3) * 4; ctx.strokeText('Zzz', cx - 12, zy); ctx.fillText('Zzz', cx - 12, zy); }
  if (o.type === 'gear' && o.state === 'broken') { ctx.globalAlpha = 1; ctx.fillStyle = '#ffe066'; ctx.fillRect(cx - 20, o.y - 14, 40 * Math.max(0, o.timer / 3), 5); }
  if (d.mid) { ctx.globalAlpha = 1; for (let i = 0; i < o.maxHp; i++) { ctx.fillStyle = i < o.hp ? '#ff5a7a' : 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(cx - (o.maxHp - 1) * 9 + i * 18, o.y - 14, 6, 0, 7); ctx.fill(); } }
  ctx.restore();
  return true;
}
function gDraw(name, x, y, w, h, flip = false, alpha = 1) { if (ART[name]) { drawImg(name, x, y, w, h, flip, alpha); return true; } return false; }
function drawThingX(o, t) {
  switch (o.t) {
    case 'x_wave': { ctx.save(); ctx.fillStyle = 'rgba(190,240,255,.9)'; ctx.strokeStyle = '#3a8ac8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(o.x, o.y + o.h); for (let i = 0; i <= 4; i++) ctx.lineTo(o.x + i * o.w / 4, o.y + (i % 2 ? 0 : o.h * 0.4)); ctx.lineTo(o.x + o.w, o.y + o.h); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); return true; }
    case 'x_bolt': {
      ctx.save(); ctx.globalAlpha = 0.85;
      if (!gDraw('g_bolt', o.x - 8, o.y, o.w + 16, o.h)) { ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 6; ctx.shadowColor = '#fff6a8'; ctx.shadowBlur = 16; ctx.beginPath(); let yy = o.y; ctx.moveTo(o.x + 14, yy); while (yy < o.y + o.h) { yy += 22; ctx.lineTo(o.x + 14 + rnd(-10, 10), yy); } ctx.stroke(); }
      ctx.restore(); return true;
    }
    case 'x_mochi': {
      if (o.state === 'fly') { if (!xFrameDraw('mochiusa', 2, o.x + o.w / 2, o.y + o.h, 24, false)) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(o.x + 14, o.y + 11, 14, 11, 0, 0, 7); ctx.fill(); } }
      else { ctx.save(); ctx.globalAlpha = Math.min(1, o.life); if (!xFrameDraw('mochiusa', 2, o.x + o.w / 2, o.y + o.h + 2, 20, false)) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(o.x + 14, o.y + 16, 22, 8, 0, 0, 7); ctx.fill(); } ctx.restore(); }
      return true;
    }
    case 'x_shellbomb': {
      ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ff3a3a'; ctx.lineWidth = 3; const tx = o.tx, ty = o.ty - 4; ctx.beginPath(); ctx.moveTo(tx - 12, ty - 8); ctx.lineTo(tx + 12, ty + 4); ctx.moveTo(tx + 12, ty - 8); ctx.lineTo(tx - 12, ty + 4); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.translate(o.x + 12, o.y + 12); ctx.rotate(o.rot); if (!gDraw('g_mshell', -16, -16, 32, 32)) { ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill(); } ctx.restore(); return true;
    }
    case 'x_bumper': {
      const s = 1 + (o.sq > 0 ? Math.sin(o.sq * 40) * 0.12 : 0);
      ctx.save(); ctx.translate(o.cx, o.cy); ctx.scale(s, 2 - s);
      if (!gDraw('g_bumper_0', -30, -30, 60, 60)) { ctx.fillStyle = '#ff7ab6'; ctx.strokeStyle = '#3a1a2a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-8, -8, 7, 0, 7); ctx.fill(); }
      ctx.restore(); return true;
    }
    case 'x_tree': {
      ctx.save(); ctx.translate(o.x + o.w / 2, o.y + o.h); if (o.shake > 0) ctx.rotate(Math.sin(o.shake * 40) * 0.05);
      if (!gDraw('g_tree_0', -o.w / 2 - 14, -o.h - 10, o.w + 28, o.h + 14)) { ctx.fillStyle = '#7a4a24'; ctx.fillRect(-10, -60, 20, 60); ctx.fillStyle = '#5fbf4e'; ctx.beginPath(); ctx.arc(0, -84, 46, 0, 7); ctx.fill(); }
      ctx.restore();
      if (o.n < 3) { ctx.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 3 - o.n; i++) { ctx.beginPath(); ctx.arc(o.x + o.w / 2 - 12 + i * 12, o.y + 8, 3, 0, 7); ctx.fill(); } }
      return true;
    }
    case 'x_paint': if (!gDraw(o.on ? 'g_paint_1' : 'g_paint_0', o.x - 4, o.y - 10, o.w + 8, 22)) { ctx.fillStyle = o.on ? '#4ad8ff' : '#9aa0aa'; ctx.fillRect(o.x, o.y, o.w, 10); } return true;
    case 'x_gate': { ctx.fillStyle = '#6a4a8a'; ctx.fillRect(o.x, o.y, o.w, o.h); ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 3; for (let yy = o.y + 8; yy < o.y + o.h; yy += 18) { ctx.beginPath(); ctx.moveTo(o.x + 4, yy); ctx.lineTo(o.x + o.w - 4, yy); ctx.stroke(); }
      const all = world.ents.filter(e => e.t === 'x_paint' && e.g === o.g), n = all.filter(e => e.on).length; ctx.fillStyle = '#fff'; ctx.font = '800 14px "M PLUS Rounded 1c", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(n + '/' + all.length, o.x + o.w / 2, o.y - 6); ctx.textAlign = 'left'; return true; }
    case 'x_pend': {
      ctx.strokeStyle = '#6a5a4a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(o.ax, o.ay); ctx.lineTo(o.x + o.w / 2, o.y); ctx.stroke();
      ctx.fillStyle = '#3a3a3a'; ctx.beginPath(); ctx.arc(o.ax, o.ay, 7, 0, 7); ctx.fill();
      if (!gDraw('g_pend', o.x - 6, o.y - 6, o.w + 12, 28)) drawImg('movplat', o.x - 6, o.y - 18, o.w + 12, 48);
      return true;
    }
    case 'x_raft': if (!gDraw('g_raft', o.x - 6, o.y - 10, o.w + 12, 44)) { ctx.fillStyle = '#a0703a'; ctx.fillRect(o.x, o.y, o.w, o.h); } return true;
    case 'x_fall': {
      ctx.save(); ctx.globalAlpha = o.thick ? 0.8 : 0.45;
      const w = o.thick ? o.w : o.w * 0.35, x = o.x + (o.w - w) / 2;
      const name = o.thick ? 'g_fall_0' : 'g_fall_1';
      if (ART[name]) { const im = ART[name], th = im.naturalHeight * (w / im.naturalWidth); const off = (t * 420) % th; ctx.beginPath(); ctx.rect(x, 0, w, o.h); ctx.clip(); for (let yy = -th + off; yy < o.h; yy += th) ctx.drawImage(im, x, yy, w, th); }
      else { ctx.fillStyle = '#9fdcff'; ctx.fillRect(x, 0, w, o.h); ctx.fillStyle = 'rgba(255,255,255,.6)'; for (let yy = (t * 400) % 40; yy < o.h; yy += 40) ctx.fillRect(x + w * 0.3, yy, 3, 18); }
      ctx.restore(); ctx.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(o.x + o.w / 2 + Math.sin(t * 7 + i) * o.w * 0.4, o.h - 4, 5 + Math.sin(t * 9 + i) * 2, 0, 7); ctx.fill(); }
      return true;
    }
    case 'x_qsand': {
      const h = Math.min(o.h, 2 * TILE);
      if (ART.g_qsand) { ctx.save(); ctx.beginPath(); ctx.rect(o.x, o.y, o.w, h); ctx.clip(); const im = ART.g_qsand, tw = im.naturalWidth * (h / im.naturalHeight); for (let xx = o.x - ((t * 20) % tw); xx < o.x + o.w; xx += tw) ctx.drawImage(im, xx, o.y - 6, tw, h + 6); ctx.restore(); }
      else { ctx.fillStyle = '#d8b878'; ctx.fillRect(o.x, o.y, o.w, h); ctx.strokeStyle = 'rgba(120,80,40,.5)'; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y + 18, o.w * 0.35 - i * 10, 6, 0, t * 2 + i, t * 2 + i + 4); ctx.stroke(); } }
      return true;
    }
    case 'x_honey': {
      if (ART.g_honey) { const im = ART.g_honey, th = 30, tw = im.naturalWidth * th / im.naturalHeight; ctx.save(); ctx.beginPath(); ctx.rect(o.x, o.y - 10, o.w, th + 4); ctx.clip(); for (let xx = o.x - 6; xx < o.x + o.w; xx += tw - 12) ctx.drawImage(im, xx, o.y - 8, tw, th); ctx.restore(); }
      else { ctx.fillStyle = '#ffb81a'; ctx.fillRect(o.x, o.y, o.w, 12); }
      return true;
    }
    case 'x_piston': {
      if (o.warn) { ctx.fillStyle = 'rgba(255,80,80,' + (0.3 + Math.sin(t * 40) * 0.2) + ')'; ctx.fillRect(o.dir < 0 ? o.bx - 10 : o.bx, o.y, 10, o.h); }
      if (o.w > 2) {
        if (ART.g_piston_rod) { const hw = Math.min(o.w, 30); const rx = o.dir < 0 ? o.x + hw : o.x; drawImg('g_piston_rod', rx, o.y + 8, Math.max(0, o.w - hw), o.h - 16); drawImg('g_piston_head', o.dir < 0 ? o.x : o.x + o.w - hw, o.y - 2, hw, o.h + 4, o.dir > 0); }
        else { ctx.fillStyle = '#8a8a9a'; ctx.fillRect(o.x, o.y + 8, o.w, o.h - 16); ctx.fillStyle = '#5a5a6a'; ctx.fillRect(o.dir < 0 ? o.x : o.x + o.w - 16, o.y, 16, o.h); }
      }
      return true;
    }
    case 'x_elev': if (!gDraw('g_elev', o.x - 4, o.y - 6, o.w + 8, 30)) drawImg('lift', o.x - 6, o.y - 18, o.w + 12, 48); return true;
    case 'x_mortar': { ctx.save(); ctx.translate(o.x + 24, o.y + 48); if (o.recoil > 0) ctx.translate(-o.face * 4, 2); if (!gDraw('g_mortar', -30, -54, 60, 56, o.face > 0)) { ctx.fillStyle = '#333'; ctx.fillRect(-20, -36, 40, 36); } ctx.restore(); return true; }
    case 'x_sidespring': { const sq = o.sq > 0 ? 0.7 : 1; ctx.save(); ctx.translate(o.dir > 0 ? o.x : o.x + o.w, o.y); ctx.scale((o.dir > 0 ? 1 : -1) * sq, 1); if (!gDraw('g_sidespring', -6, 0, 50, 48)) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(0, 4, 24, 40); } ctx.restore(); return true; }
    case 'x_thunder': {
      ctx.save(); if (o.state === 'warn') { ctx.shadowColor = '#ffe066'; ctx.shadowBlur = 20 + Math.sin(t * 30) * 10; }
      if (!gDraw('g_thunder', o.x - 4, o.y - 6, o.w + 8, o.h + 12)) { ctx.fillStyle = '#5a5a6a'; ctx.beginPath(); ctx.ellipse(o.x + 48, o.y + 22, 50, 22, 0, 0, 7); ctx.fill(); }
      ctx.restore();
      const cx = o.x + o.w / 2, gy = o.by || groundYBelow(Math.floor(cx / TILE), Math.floor((o.y + o.h) / TILE) + 1) * TILE;
      if (o.state === 'warn') { ctx.save(); ctx.globalAlpha = 0.25 + Math.sin(t * 30) * 0.15; ctx.fillStyle = '#ffe066'; ctx.fillRect(cx - 3, o.y + o.h, 6, gy - o.y - o.h); ctx.restore(); }
      if (o.state === 'bolt') { ctx.save(); if (!gDraw('g_bolt', cx - 24, o.y + o.h - 4, 48, gy - o.y - o.h + 4)) { ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 7; ctx.shadowColor = '#fff'; ctx.shadowBlur = 18; ctx.beginPath(); let yy = o.y + o.h; ctx.moveTo(cx, yy); while (yy < gy) { yy += 20; ctx.lineTo(cx + rnd(-12, 12), yy); } ctx.stroke(); } ctx.restore(); }
      return true;
    }
    case 'x_ring': {
      ctx.save(); ctx.translate(o.x + o.w / 2, o.y + o.h / 2); ctx.globalAlpha = o.cd > 0 ? 0.5 : 1; const s = 1 + Math.sin(t * 5) * 0.05; ctx.scale(s, s);
      ctx.rotate(o.ang);
      if (!gDraw('g_ring', -34, -34, 68, 68)) { ctx.strokeStyle = '#6aff9a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.stroke(); }
      if (!ART.g_ring) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(40, 0); ctx.lineTo(30, -8); ctx.lineTo(30, 8); ctx.fill(); }
      ctx.restore(); return true;
    }
    case 'x_bell': { ctx.save(); ctx.translate(o.x + o.w / 2, o.y); if (o.ring > 0) ctx.rotate(Math.sin(o.ring * 30) * 0.3 * o.ring); if (!gDraw(o.ring > 0 && ART.g_bell_1 ? 'g_bell_1' : 'g_bell_0', -24, -2, 48, 48)) { ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.moveTo(-16, 36); ctx.quadraticCurveTo(-16, 0, 0, 0); ctx.quadraticCurveTo(16, 0, 16, 36); ctx.fill(); } ctx.restore(); return true; }
    case 'x_flip': { ctx.save(); ctx.translate(o.x + o.w / 2, o.y + 9); if (o.wob) ctx.rotate(Math.sin(t * 40) * 0.05); const nm = o.flip ? 'g_flip_1' : 'g_flip_0'; if (!gDraw(nm, -o.w / 2 - 4, o.flip ? -26 : -16, o.w + 8, o.flip ? 44 : 34)) { ctx.fillStyle = o.flip ? '#888' : '#a0703a'; ctx.fillRect(-o.w / 2, -9, o.w, 18); if (o.flip) { ctx.fillStyle = '#ddd'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-o.w / 2 + i * 16, -9); ctx.lineTo(-o.w / 2 + i * 16 + 8, -22); ctx.lineTo(-o.w / 2 + i * 16 + 16, -9); ctx.fill(); } } } ctx.restore(); return true; }
    case 'x_rspike': {
      const hh = o.h * o.up;
      if (o.up > 0) { ctx.save(); ctx.beginPath(); ctx.rect(o.x, o.y + o.h - hh, o.w, hh); ctx.clip(); if (ART.g_rspike) { const im = ART.g_rspike, tw = im.naturalWidth * (o.h / im.naturalHeight); for (let xx = o.x; xx < o.x + o.w; xx += tw) ctx.drawImage(im, xx, o.y + o.h - hh, Math.min(tw, o.x + o.w - xx) , o.h); } else { ctx.fillStyle = '#d8dce8'; for (let xx = o.x; xx < o.x + o.w; xx += 16) { ctx.beginPath(); ctx.moveTo(xx, o.y + o.h); ctx.lineTo(xx + 8, o.y + o.h - hh); ctx.lineTo(xx + 16, o.y + o.h); ctx.fill(); } } ctx.restore(); }
      ctx.fillStyle = '#4a4a5a'; ctx.fillRect(o.x, o.y + o.h - 4, o.w, 4);
      return true;
    }
    case 'x_inflate': { const nm = o.s > 0.75 ? 'g_inflate_0' : 'g_inflate_1'; ctx.save(); ctx.globalAlpha = o.plat ? 1 : 0.5; if (!gDraw(nm, o.x - 4, o.y - 6, o.w + 8, (o.w + 8) / (o.s > 0.75 ? 2.1 : 2.6))) { ctx.fillStyle = '#ff9ad0'; ctx.beginPath(); ctx.ellipse(o.cx, o.y + 4, o.w / 2, 10 + 8 * o.s, 0, 0, 7); ctx.fill(); } ctx.restore(); return true; }
    case 'x_rocket': if (!gDraw('g_rocket', o.x - 4, o.y - 6, o.w + 8, (o.w + 8) / 1.58)) { ctx.fillStyle = '#c0c4d0'; ctx.fillRect(o.x, o.y, o.w, o.h); ctx.fillStyle = '#ff5a5a'; ctx.fillRect(o.x + o.w / 2 - 10, o.y + o.h, 20, 14); } return true;
    case 'x_phantom': { ctx.save(); ctx.globalAlpha = 0.12 + o.a * 0.88; if (!gDraw('g_phantom', o.x - 4, o.y - 8, o.w + 8, 34)) { ctx.fillStyle = '#b48aff'; ctx.fillRect(o.x, o.y, o.w, o.h); } ctx.restore(); return true; }
  }
  return false;
}

// ---------------- 面への 置き方 ----------------
// ワールドごとの 新しい 敵(地面 / 空)
const XW = {
  1: { g: ['donguri', 'pyoko', 'tento', 'imomushi'], f: ['happa'], rate: 0.3 },
  2: { g: ['yukipyon', 'azarashi', 'tento'], f: ['hiyakomori', 'kurage'], rate: 0.38 },
  3: { g: ['sabo', 'sasori', 'gear', 'sunazame'], f: [], rate: 0.42 },
  4: { g: ['golem', 'itachi'], f: ['gorogumo', 'nezumi'], rate: 0.46 },
  5: { g: ['karakasa', 'goroyado', 'nisebako'], f: ['chochin', 'onibi'], rate: 0.5 },
  6: { g: ['kakureon', 'jiro', 'imomushi'], f: ['oumu'], rate: 0.5 },
  7: { g: ['mochiusa', 'futago'], f: ['hoshikurage', 'ufo', 'meteon'], rate: 0.55 },
  8: { g: ['kuroneko', 'futago', 'piero', 'koma'], f: ['onibi', 'chochin'], rate: 0.55 },
};
XW[9] = { g: ['sasori', 'golem', 'goroyado', 'jiro', 'kuroneko', 'koma', 'futago', 'gear'], f: ['ufo', 'meteon', 'gorogumo', 'oumu'], rate: 0.6 };
XW[10] = XW[9];
const XREP_G = new Set(['goomy', 'slime', 'spiky', 'skeleton', 'bomb', 'beetle', 'mogura', 'nageko', 'suberin', 'bukugani']);
const XREP_F = new Set(['bee', 'bat', 'eye', 'ghost']);
const XSKIP_ID = new Set([85, 86, 900]);
// 面ごとの 新しい しかけの 区間(design.md の 表)
const XPLAN = {
  1: ['bumper', 'tree'], 2: ['bumper'], 3: ['paint', 'tree'], 4: ['bumper', 'paint', 'mTaisho'], 70: ['tree', 'bumper'], 46: ['bumper'],
  5: ['pend', 'raft'], 6: ['fall', 'raft'], 7: ['pend', 'mGolem'], 48: ['raft', 'fall'], 71: ['pend', 'fall'], 72: ['pend'], 8: ['pend'],
  9: ['qsand', 'elev', 'boar'], 10: ['piston', 'mortar'], 11: ['side', 'elev'], 50: ['qsand', 'mortar', 'boar'], 73: ['piston', 'elev'], 12: ['mortar'],
  13: ['thunder', 'side'], 14: ['ring', 'side'], 15: ['ring', 'thunder', 'mGolem'], 16: ['thunder', 'ring'], 74: ['ring'], 17: ['thunder'],
  19: ['flip', 'pend'], 20: ['bell', 'rspike', 'mChochin'], 75: ['rspike'], 76: ['flip', 'bell'], 23: ['rspike'], 21: ['bell'],
  25: ['honey', 'tree'], 26: ['inflate', 'paint'], 27: ['fall', 'raft'], 28: ['inflate', 'honey', 'boar'], 29: ['fall', 'wani'], 77: ['raft', 'wani'], 78: ['fall', 'inflate'], 30: ['honey'],
  32: ['rocket', 'bumper'], 33: ['ring', 'inflate'], 34: ['rocket'], 35: ['ring', 'bumper', 'mOyabun'], 36: ['rocket', 'inflate'], 79: ['ring'], 37: ['rocket'],
  39: ['phantom', 'piston'], 40: ['flip', 'phantom'], 41: ['mortar', 'rspike'], 42: ['phantom', 'piston', 'knight'], 43: ['flip', 'mortar', 'rspike', 'knight'], 80: ['flip', 'mortar'], 44: ['phantom'],
  64: ['bumper', 'pend', 'qsand'], 65: ['piston', 'thunder', 'flip'], 66: ['raft', 'ring', 'rspike'], 67: ['honey', 'rocket', 'phantom'], 68: ['inflate', 'mortar', 'phantom', 'knight'],
  81: ['flip', 'ring', 'phantom'], 82: ['piston', 'mortar', 'elev'], 83: ['bell', 'rspike', 'qsand', 'mChochin'], 84: ['phantom', 'thunder', 'flip', 'knight'],
  58: ['piston'], 62: ['rspike'], 63: ['phantom'],  // 57(水の中)・61(強制スクロール)には 置かない
};
const XHINT = {
  bumper: ['ぽよんバンパー', 'ふれると はじかれる。上から のると 高く はねる'], tree: ['ゆさゆさの木', 'けんで たたくか 上に とびのると なにかが おちる'], paint: ['ぬりぬりパネル', 'ぜんぶ ふむと とびらが ひらく'],
  pend: ['ふりこの 足場', 'ゆれる 足場に のって わたる'], raft: ['いかだ', 'のると みぎへ すすむ'], fall: ['たき', '中に いると 下へ おされる。ほそく なった ときが チャンス'],
  qsand: ['りゅうさ', 'しずむ 前に ジャンプを くりかえして ぬける'], elev: ['よびだし リフト', 'のると 上へ。おりると もどる'], piston: ['おしだし ピストン', 'あかく ひかったら のびてくる'],
  mortar: ['ドカンほう', 'あかい しるしに ばくだんが おちる'], side: ['よこばね', 'ふれると よこへ びゅんと とぶ'], thunder: ['かみなりぐも', 'ひかったら 真下に いなずま'],
  ring: ['かぜのわ', 'くぐると やじるしの 向きに とぶ'], bell: ['ねむりの かね', 'たたくと 敵が 5びょう ねむる'], flip: ['くるりん床', 'うらがえると トゲ。ゆれたら 合図'],
  rspike: ['リズムトゲ', 'でたり ひっこんだり。リズムを よんで'], honey: ['はちみつ床', 'べたべたで おそくなる'], inflate: ['ふくらみ台', 'しぼむと のれない'],
  rocket: ['ロケット台', 'のって まつと 上へ とびあがる'], phantom: ['まぼろし床', 'ちかくに いる ときだけ 見えて のれる'], wani: ['がぶりワニ', 'のったら すぐ とびうつる'],
  boar: ['ドスドスイノシシ', 'ちゅうボス! 3かい ふむ'], knight: ['かげナイト', 'ちゅうボス! うしろか 上から'],
  mTaisho: ['どんぐり大将', 'ちゅうボス! 3かい ふむ'], mGolem: ['こおりゴーレム', 'ちゅうボス! こおりの なみは ジャンプで'], mChochin: ['おおちょうちん', 'ちゅうボス! 見えている ときに ふむ'], mOyabun: ['もちつき親分', 'ちゅうボス! おもちに 気をつけて'],
};
if (typeof EN_DICT !== 'undefined') Object.assign(EN_DICT, {
  'ぽよんバンパー': 'Boing Bumper', 'ゆさゆさの木': 'Shake Tree', 'ぬりぬりパネル': 'Paint Panels', 'ふりこの 足場': 'Pendulum', 'いかだ': 'Raft', 'たき': 'Waterfall', 'りゅうさ': 'Quicksand',
  'よびだし リフト': 'Call Lift', 'おしだし ピストン': 'Piston', 'ドカンほう': 'Mortar', 'よこばね': 'Side Spring', 'かみなりぐも': 'Thundercloud', 'かぜのわ': 'Wind Ring', 'ねむりの かね': 'Sleep Bell',
  'くるりん床': 'Flip Panel', 'リズムトゲ': 'Rhythm Spikes', 'はちみつ床': 'Honey Floor', 'ふくらみ台': 'Puff Pad', 'ロケット台': 'Rocket Pad', 'まぼろし床': 'Phantom Floor',
  'ふれると はじかれる。上から のると 高く はねる': 'Touch it to bounce. Land on top to fly high', 'けんで たたくか 上に とびのると なにかが おちる': 'Hit it with the sword or land on top to shake it',
  'ぜんぶ ふむと とびらが ひらく': 'Step on them all to open the gate', 'ゆれる 足場に のって わたる': 'Ride the swinging platform', 'のると みぎへ すすむ': 'Step on and it sails right',
  '中に いると 下へ おされる。ほそく なった ときが チャンス': 'It pushes you down. Go when it thins', 'しずむ 前に ジャンプを くりかえして ぬける': 'Keep jumping before you sink',
  'のると 上へ。おりると もどる': 'Rides up while you stand on it', 'あかく ひかったら のびてくる': 'It shoots out after a red flash', 'あかい しるしに ばくだんが おちる': 'Bombs land on the red mark',
  'ふれると よこへ びゅんと とぶ': 'Launches you sideways', 'ひかったら 真下に いなずま': 'Lightning strikes right below after a flash', 'くぐると やじるしの 向きに とぶ': 'Fly through to launch along the arrow',
  'たたくと 敵が 5びょう ねむる': 'Ring it and enemies sleep for 5 seconds', 'うらがえると トゲ。ゆれたら 合図': 'Spikes when flipped. It shakes first', 'でたり ひっこんだり。リズムを よんで': 'Read the rhythm',
  'べたべたで おそくなる': 'Sticky and slow', 'しぼむと のれない': "Can't stand on it when it shrinks", 'のって まつと 上へ とびあがる': 'Stand and wait to blast off', 'ちかくに いる ときだけ 見えて のれる': 'Only solid when you are near',
  'のったら すぐ とびうつる': 'Jump off quickly!', 'ちゅうボス! 3かい ふむ': 'Mini boss! Stomp it 3 times', 'ちゅうボス! うしろか 上から': 'Mini boss! Hit from behind or above',
  'ちゅうボス! こおりの なみは ジャンプで': 'Mini boss! Jump over the ice waves', 'ちゅうボス! 見えている ときに ふむ': 'Mini boss! Stomp it while it is visible',
  'ちゅうボス! おもちに 気をつけて': 'Mini boss! Watch out for the mochi', 'カーン…': 'Clang...',
  'ぜんぶ ぬれた!': 'All painted!', 'とびらが ひらいた': 'The gate opened', 'ねむりの かね!': 'Sleep Bell!', '敵が 5びょう ねむる(トゲの 敵も ふめる)': 'Enemies sleep 5 sec (even spiky ones can be stomped)',
});
// 中ボスの のこりの 数(あと 3 → 3 more)。2026-10-16 夜 英語版で 日本語が 出ていた
if (typeof EN_PAT !== 'undefined') EN_PAT.unshift([/^あと (\d+)$/, m => m[1] + ' more']);
// しかけの 区間を 組む。x から はじめて 次の x を かえす
function xSections(S, L) {
  // 上の HUD に かからない よう、高さは 3行目より 下に(見切れ対策)
  const H = y => Math.max(3, y);
  // 下りの 階段(左が 高い)
  const down = (x0, top, n) => { for (let i = 0; i < n; i++) L.fill(x0 + i, x0 + i, top - (n - i), top - 1, 'S'); };
  const en = (x, list) => list.forEach(([dx, tp, op]) => L.enemy(x + dx, tp, op || {}));
  const X = {};
  X.bumper = (x, top, w) => { L.ground(x, x + 15, top); L.hazard(x + 5, 'x_bumper', { y: H(top - 4) }); L.hazard(x + 10, 'x_bumper', { y: H(top - 6) + 1 }); L.row(x + 9, H(top - 8), 'ooo'); en(x, [[13, w.g[0]]]); return x + 16; };
  X.tree = (x, top, w) => { L.ground(x, x + 11, top); L.hazard(x + 5, 'x_tree', { y: top - 1 }); en(x, [[10, w.g[1 % w.g.length]]]); return x + 12; };
  X.paint = (x, top, w, g) => { L.ground(x, x + 19, top); for (const k of [2, 5, 8, 11]) L.hazard(x + k, 'x_paint', { y: top - 1, g }); L.fill(x + 14, x + 17, top - 4, top - 4, 'S'); L.fill(x + 17, x + 17, top - 3, top - 1, 'S'); L.hazard(x + 14, 'x_gate', { y: top - 3, h: 3, g }); L.put(x + 16, top - 1, 'c'); en(x, [[7, w.g[0]]]); return x + 20; };
  X.pend = (x, top) => { L.ground(x, x + 2, top); if (!L.cpNear(x)) L.put(x + 1, top - 1, 'C'); for (let i = 0; i < 4; i++) { L.hazard(x + 6 + i * 8, 'x_pend', { y: H(top - 7), len: Math.min(5, top - 2 - H(top - 7)), amp: 0.75, sp: 1.5, phase: i * 1.1 }); L.row(x + 5 + i * 8, H(top - 5), 'ooo'); } L.ground(x + 37, x + 39, top); return x + 40; };
  X.raft = (x, top, w) => { L.ground(x, x + 2, top); if (!L.cpNear(x)) L.put(x + 1, top - 1, 'C'); L.fill(x + 3, x + 30, top, ROWS - 1, ' '); L.water(x + 3, x + 30, top + 1, ROWS - 1); L.hazard(x + 3, 'wind', { y: top + 1, h: ROWS - top - 1, w: 28, dir: -1, v: 420, fx: x + 30, water: true }); L.hazard(x + 3, 'x_raft', { y: top - 0, dist: 25 }); L.row(x + 8, top - 3, 'oooo'); L.row(x + 20, top - 3, 'oooo'); L.ground(x + 31, x + 33, top); return x + 34; };
  X.fall = (x, top, w) => { L.ground(x, x + 15, top); L.fill(x + 7, x + 9, top - 2, top - 1, 'S'); L.hazard(x + 4, 'x_fall', { w: 2, per: 4 }); L.hazard(x + 11, 'x_fall', { w: 2, per: 4, phase: 2 }); L.row(x + 7, top - 4, 'ooo'); en(x, [[14, w.g[0]]]); return x + 16; };
  X.qsand = (x, top, w) => { L.ground(x, x + 3, top); L.fill(x + 4, x + 6, top, ROWS - 1, ' '); L.hazard(x + 4, 'x_qsand', { y: top, w: 3 }); L.ground(x + 7, x + 10, top); L.fill(x + 11, x + 13, top, ROWS - 1, ' '); L.hazard(x + 11, 'x_qsand', { y: top, w: 3 }); L.ground(x + 14, x + 17, top); L.row(x + 4, top - 3, 'ooo'); en(x, [[15, w.g[0]]]); return x + 18; };
  X.elev = (x, top) => { const wh = Math.min(6, top - 4); L.ground(x, x + 13, top); L.fill(x + 8, x + 13, top - wh, top - 1, 'S'); L.hazard(x + 5, 'x_elev', { y: top - 1, rise: wh - 1 }); L.row(x + 9, H(top - wh - 2), 'oooo'); L.ground(x + 14, x + 17, top - wh); L.fill(x + 14, x + 17, top - wh + 1, ROWS - 1, 'S'); L.ground(x + 18, x + 22, top); down(x + 18, top, wh - 1); return x + 23; };
  X.piston = (x, top) => { L.ground(x, x + 17, top); L.fill(x + 8, x + 8, top - 3, top - 1, 'S'); L.hazard(x + 8, 'x_piston', { y: top - 1, dir: -1, len: 3 }); L.fill(x + 16, x + 16, top - 3, top - 1, 'S'); L.hazard(x + 16, 'x_piston', { y: top - 1, dir: -1, len: 3, phase: 1.3 }); L.row(x + 9, top - 5, 'oooo'); return x + 18; };
  X.mortar = (x, top, w) => { L.ground(x, x + 19, top); L.hazard(x + 18, 'x_mortar', { dir: -1 }); L.fill(x + 7, x + 8, top - 2, top - 1, 'S'); L.row(x + 3, top - 3, 'ooo'); en(x, [[12, w.g[0]]]); return x + 20; };
  X.side = (x, top) => { L.ground(x, x + 3, top); L.hazard(x + 2, 'x_sidespring', { y: top - 1, dir: 1 }); L.row(x + 5, top - 3, 'ooooo'); L.ground(x + 10, x + 13, top); return x + 14; };
  X.thunder = (x, top, w) => { L.ground(x, x + 19, top); L.hazard(x + 3, 'x_thunder', { y: H(top - 6), range: 12 }); L.row(x + 6, top - 3, 'oooo'); en(x, [[16, w.g[0]]]); return x + 20; };
  X.ring = (x, top) => { L.ground(x, x + 3, top); L.hazard(x + 5, 'x_ring', { y: top - 3, ang: -25 }); L.row(x + 8, H(top - 6), 'ooo'); L.ground(x + 10, x + 13, top); return x + 14; };
  X.bell = (x, top, w) => { L.ground(x, x + 21, top); L.hazard(x + 4, 'x_bell', { y: top - 4 }); en(x, [[9, 'spiky'], [13, w.g[0]], [17, 'spiky']]); return x + 22; };
  X.flip = (x, top) => { L.ground(x, x + 2, top); for (let i = 0; i < 3; i++) L.hazard(x + 3 + i * 3, 'x_flip', { y: top - 1, per: 4, phase: i * 1.0 }); L.ground(x + 12, x + 14, top); L.row(x + 4, top - 4, 'ooooooo'); return x + 15; };
  X.rspike = (x, top, w) => { L.ground(x, x + 17, top); L.hazard(x + 3, 'x_rspike', { w: 5, per: 2.4 }); L.hazard(x + 10, 'x_rspike', { w: 5, per: 2.4, phase: 1.2 }); L.row(x + 4, top - 4, 'ooo'); return x + 18; };
  X.honey = (x, top, w) => { L.ground(x, x + 17, top); L.hazard(x + 3, 'x_honey', { w: 12 }); en(x, [[9, w.g[0]], [14, w.f[0] || w.g[1] || w.g[0], w.f[0] ? { y: top - 4 } : {}]]); L.row(x + 5, top - 3, 'oooo'); return x + 18; };
  X.inflate = (x, top) => { L.ground(x, x + 2, top); L.hazard(x + 5, 'x_inflate', { y: top - 1, per: 3.2 }); L.hazard(x + 9, 'x_inflate', { y: top - 2, per: 3.2, phase: 1.6 }); L.row(x + 5, top - 5, 'oooooo'); L.ground(x + 12, x + 14, top); return x + 15; };
  X.rocket = (x, top) => { const wh = Math.min(6, top - 4); L.ground(x, x + 15, top); L.fill(x + 8, x + 15, top - wh, top - 1, 'S'); L.hazard(x + 4, 'x_rocket', { y: top - 1, rise: wh - 1 }); L.row(x + 9, H(top - wh - 2), 'oooo'); L.ground(x + 16, x + 22, top); down(x + 16, top, wh - 1); return x + 23; };
  X.phantom = (x, top) => { L.ground(x, x + 2, top); for (let i = 0; i < 3; i++) L.hazard(x + 4 + i * 3, 'x_phantom', { y: top - 1 - (i % 2), w: 2 }); L.row(x + 5, top - 5, 'ooooo'); L.ground(x + 13, x + 15, top); return x + 16; };
  X.wani = (x, top) => { L.ground(x, x + 2, top); L.fill(x + 3, x + 15, top, ROWS - 1, ' '); L.water(x + 3, x + 15, top + 1, ROWS - 1); L.enemy(x + 4, 'wani', { y: top }); L.enemy(x + 8, 'wani', { y: top }); L.enemy(x + 12, 'wani', { y: top }); L.row(x + 5, top - 3, 'ooooo'); L.ground(x + 16, x + 18, top); return x + 19; };
  X.boar = (x, top) => { L.ground(x, x + 23, top); L.wall(x + 23, top - 3, top - 1); L.wall(x, top - 3, top - 1); L.enemy(x + 14, 'inoshishi'); L.row(x + 6, top - 5, 'ooooooooooo'); return x + 24; };
  X.mTaisho = (x, top) => { L.ground(x, x + 23, top); L.wall(x + 23, top - 3, top - 1); L.wall(x, top - 3, top - 1); L.enemy(x + 14, 'taisho'); L.row(x + 6, H(top - 6), 'ooooooooooo'); return x + 24; };
  X.mGolem = (x, top) => { L.ground(x, x + 23, top); L.wall(x + 23, top - 3, top - 1); L.wall(x, top - 3, top - 1); L.enemy(x + 15, 'hyogolem'); L.row(x + 6, H(top - 6), 'ooooooooooo'); return x + 24; };
  X.mChochin = (x, top) => { L.ground(x, x + 23, top); L.enemy(x + 15, 'oochochin', { y: H(top - 4) }); L.row(x + 6, H(top - 5), 'ooooooooooo'); return x + 24; };
  X.mOyabun = (x, top) => { L.ground(x, x + 23, top); L.wall(x + 23, top - 3, top - 1); L.enemy(x + 15, 'oyabun'); L.row(x + 6, H(top - 6), 'ooooooooooo'); return x + 24; };
  X.knight = (x, top) => { L.ground(x, x + 21, top); L.enemy(x + 14, 'knight'); L.row(x + 6, top - 5, 'ooooooooo'); return x + 22; };
  return X;
}
const xFirstOf = {};
(function () {
  const ord = [1, 2, 3, 4, 70, 46, 5, 6, 7, 48, 71, 72, 8, 9, 10, 11, 50, 73, 12, 13, 14, 15, 16, 74, 17, 19, 20, 75, 76, 21, 23, 25, 26, 27, 28, 29, 77, 78, 30, 32, 33, 34, 35, 36, 79, 37, 39, 40, 41, 42, 43, 80, 44];
  for (const id of ord) for (const k of XPLAN[id] || []) if (!xFirstOf[k]) xFirstOf[k] = id;
})();
function xBuildArea(S, L, def, x, top) {
  const plan = XPLAN[def.id];
  if (!plan) return x;
  const w = XW[def.world] || XW[1];
  const X = xSections(S, L);
  x = S.run(x, 8, { top, cp: 2 });
  let g = 0;
  for (const k of plan) {
    if (!X[k]) continue;
    if (xFirstOf[k] === def.id && XHINT[k]) L.hint(x, XHINT[k][0], XHINT[k][1]);
    x = X[k](x, top, w, ++g);
    x = S.run(x, 4, { top });
  }
  return x;
}
// sections() を つつむ
const _xSectionsOrig = sections;
sections = function (L) {
  const S = _xSectionsOrig(L);
  const def = L._def;
  if (!def || XSKIP_ID.has(def.id) || def.daily) return S;
  // (1) 敵の おきかえ
  if (!L._xEnemy) {
    L._xEnemy = true;
    const w = XW[def.world];
    if (w) {
      const R = extRng(def.id * 104729 + 3);
      const orig = L.enemy;
      let gi = 0, fi = 0;
      L.enemy = (x, kind, opt = {}) => {
        if (XREP_G.has(kind) && w.g.length && R() < w.rate) { const k = w.g[(gi++ + Math.floor(R() * 2)) % w.g.length]; return orig(x, k, opt.y !== undefined && !ENEMY[k].fly ? {} : {}); }
        if (XREP_F.has(kind) && w.f.length && R() < w.rate) { const k = w.f[(fi++) % w.f.length]; return orig(x, k, { y: Math.max(4, opt.y !== undefined ? opt.y : 5) }); }
        return orig(x, kind, opt);
      };
    }
  }
  // (2) ゴール・ボス部屋の 前に 新しい しかけの 区間
  if (XPLAN[def.id]) for (const nm of ['goal', 'boss', 'boss2', 'boss3', 'fortBoss']) {
    const f = S[nm];
    if (!f) continue;
    S[nm] = (x, ...a) => {
      if (!L._xArea) { L._xArea = true; const o = a.length && a[a.length - 1] && typeof a[a.length - 1] === 'object' ? a[a.length - 1] : {}; x = xBuildArea(S, L, def, x, o.top ?? 10); }
      return f(x, ...a);
    };
  }
  return S;
};
window.__ex1016 = { XE, XPLAN, XW, xFirstOf, spawn: e => spawn(e), drawEnemy: (o, t) => drawEnemy(o, t), drawThing: (o, t) => drawThing(o, t), hurtCount: () => P.hearts };
if (window.__game) window.__game.ex = window.__ex1016;
