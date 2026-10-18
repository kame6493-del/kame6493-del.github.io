// ワールドマップとお話のデータ。絵は game/assets/chatgpt/ に置けば差し替わる(map_w4.png など)。
// nodes: 道の順にならべた面(id は levels.js の id)。x,y は 960×540 の画面の上の場所。
// secret: { from: 面id, id: 隠し面id, x, y } … from の面の「ひみつのゴール」で 隠し道が ひらく。
'use strict';

// 道の上の 面(nodes)は 左から 順に つながる。kind: normal / water / sky / fort(とりで)/ ghost(おばけやしき)/ boss(しろ)
// extra: 道から わかれた マス。cond: secret=from の面の ひみつのゴール / clear=from の面を クリア / warp=ほしの あな(from の面を クリア)
//   dir は 親の マスから どちらへ のびるか(up / down / right)。kind: secret / switch(しんでん)/ warp
// マスの 場所(x,y)は 下の layoutWorlds() が 960×540 の 画面に ならべる。
const WORLDS = [
  { n: 1, name: 'みどりの くに', theme: 'grass', deco: ['tree', 'fence', 'sign'], line: 'はじまりの くさはら。もこりゅうの たまごが どこかに…',
    nodes: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 70 }, { id: 46 }],
    // 2026-10-18 夜 持ち主「1面の ほしのあなは いらない」「行く メリットの ない 別ルートは 消す」→ 1-3 の ひみつの へや・1-✦・ほしの あな・きいろの しんでんを なくした
    extra: [],
    roam: [{ a: 2, b: 3, type: 'goomy' }] },
  { n: 2, name: 'こおりと みずの くに', theme: 'ice', deco: ['crystal', 'tree', 'pillar'], line: 'つるつるの こおりと、ゆきの おばけやしき。',
    nodes: [{ id: 5 }, { id: 6 }, { id: 7 }, { id: 56 }, { id: 48 }, { id: 71 }, { id: 72 }, { id: 8 }],
    extra: [{ id: 49, from: 6, cond: 'secret', dir: 'up', kind: 'secret' }, { warp: 2, from: 49, cond: 'clear', dir: 'right', kind: 'warp' }], // しんでん・近道の つつは なくした(2026-10-18 夜)
    roam: [{ a: 1, b: 2, type: 'suberin' }] },
  { n: 3, name: 'さばくと そらの くに', theme: 'sand', deco: ['pillar', 'rocks', 'torch'], line: 'あつい すなの みち。オアシスの そこにも かけらが ひかる。',
    nodes: [{ id: 9 }, { id: 10 }, { id: 57 }, { id: 11 }, { id: 50 }, { id: 73 }, { id: 58 }, { id: 12 }],
    extra: [{ id: 51, from: 10, cond: 'secret', dir: 'up', kind: 'secret' }, { warp: 3, from: 51, cond: 'clear', dir: 'right', kind: 'warp' }],
    roam: [{ a: 1, b: 2, type: 'beetle' }] },
  { n: 4, name: 'あらしの こうげん', theme: 'storm', deco: ['tree', 'lamp', 'crystal'], line: 'かぜが ふきあれる こうげん。そらの みちは とまらない!',
    nodes: [{ id: 13 }, { id: 14 }, { id: 59 }, { id: 15 }, { id: 16 }, { id: 74 }, { id: 17 }],
    extra: [{ id: 18, from: 15, cond: 'secret', dir: 'up', kind: 'secret' }, { warp: 4, from: 18, cond: 'clear', dir: 'right', kind: 'warp' }], // みずいろの しんでんは なくした
    roam: [{ a: 3, b: 4, type: 'bat' }] },
  { n: 5, name: 'ゆうやけと おばけの くに', theme: 'dusk', deco: ['rocks', 'pillar', 'lamp'], line: 'ゆうやけの たに。とりでと おばけやしきが まっている。',
    nodes: [{ id: 19 }, { id: 20 }, { id: 21, kind: 'fort' }, { id: 22, kind: 'ghost' }, { id: 75 }, { id: 76 }, { id: 23 }],
    extra: [{ id: 24, from: 20, cond: 'secret', dir: 'up', kind: 'secret' }, { warp: 5, from: 24, cond: 'clear', dir: 'right', kind: 'warp' }],
    roam: [{ a: 0, b: 1, type: 'ghost' }] },
  { n: 6, name: 'ジャングルと たきの くに', theme: 'jungle', deco: ['tree', 'tree', 'crystal'], line: 'たきの おとが ひびく ジャングル。たきつぼの なかへも。',
    nodes: [{ id: 25 }, { id: 26 }, { id: 27 }, { id: 60 }, { id: 28 }, { id: 29 }, { id: 77 }, { id: 78 }, { id: 30 }],
    extra: [{ id: 31, from: 27, cond: 'secret', dir: 'up', kind: 'secret' }, { warp: 6, from: 31, cond: 'clear', dir: 'right', kind: 'warp' }], // しんでん・近道の つつは なくした
    roam: [{ a: 0, b: 1, type: 'bee' }, { a: 3, b: 4, type: 'bukugani' }] },
  { n: 7, name: 'つきと ほしぞらの くに', theme: 'moon', deco: ['crystal', 'rocks', 'pillar'], line: 'からだが かるい つきの くに。ほうき星の ながれに のって。',
    nodes: [{ id: 32 }, { id: 33 }, { id: 61 }, { id: 34 }, { id: 35 }, { id: 36 }, { id: 79 }, { id: 62 }, { id: 37 }],
    extra: [{ id: 38, from: 33, cond: 'secret', dir: 'up', kind: 'secret' }, { warp: 7, from: 38, cond: 'clear', dir: 'right', kind: 'warp' }],
    roam: [{ a: 1, b: 2, type: 'eye' }, { a: 4, b: 5, type: 'slime' }] },
  { n: 8, name: 'かげの おうの くに', theme: 'kage', deco: ['torch', 'lamp', 'pillar'], line: 'ひかりの とどかない くに。さいごの たびが はじまる。',
    nodes: [{ id: 39 }, { id: 40 }, { id: 63 }, { id: 41 }, { id: 42 }, { id: 43 }, { id: 80 }, { id: 64 }, { id: 44 }],
    extra: [{ id: 45, from: 42, cond: 'secret', dir: 'up', kind: 'secret' }, { warp: 8, from: 45, cond: 'clear', dir: 'right', kind: 'warp' }],
    roam: [{ a: 2, b: 3, type: 'skeleton' }] },
  // ほしの みち: 各ワールドの「ほしの あな」から 来る 上級コース。ワールドの 矢印では 来られない
  { n: 9, star: true, name: 'ほしの みち', theme: 'space', deco: ['crystal', 'crystal', 'pillar'], line: 'ほしの あなの むこうの、ひかる みち。うでに じしんの ある ひとへ。',
    nodes: [{ id: 65 }, { id: 66 }, { id: 67 }, { id: 68 }, { id: 69 }],
    extra: [{ back: 1, from: 65, cond: 'open', dir: 'left', kind: 'warp' }, { bonus: 1, from: 69, cond: 'clear', dir: 'up', kind: 'warp' }] },
  // おまけの ワールド: ほしの みちを さいごまで まわると ひらく(ほしの みちの「おまけの あな」から)
  { n: 10, star: true, bonus: true, name: 'ほしの はての にわ', theme: 'space', deco: ['crystal', 'crystal', 'pillar'], line: 'ぜんぶの くにを まわった ひとだけが こられる、ほしの はての にわ。',
    nodes: [{ id: 81 }, { id: 82 }, { id: 83 }, { id: 84 }],
    extra: [{ back: 1, from: 81, cond: 'open', dir: 'left', kind: 'warp' }] },
];

// マスを 画面に ならべる: 道の マスは 左から 右へ 波の 形。わかれ道の マスは 親の 上・下・右
function layoutWorlds() {
  for (const [wi, W] of WORLDS.entries()) {
    const n = W.nodes.length, x0 = W.star ? 200 : 96, x1 = W.star ? 860 : 866;
    W.nodes.forEach((nd, k) => { nd.x = Math.round(n > 1 ? x0 + (x1 - x0) * k / (n - 1) : 480); nd.y = Math.round(222 + 70 * Math.sin(k * 2.0 + wi * 0.9)); });
    for (const ex of W.extra || []) {
      const par = [...W.nodes, ...W.extra].find(m => (m.id !== undefined && m.id === ex.from)) || W.nodes[0];
      if (ex.dir === 'up') { ex.x = par.x + 4; ex.y = Math.max(126, par.y - 92); }
      else if (ex.dir === 'down') { ex.x = par.x + 6; ex.y = Math.min(350, par.y + 92); }
      else if (ex.dir === 'right') { ex.x = par.x + 78; ex.y = par.y - 6; }
      else { ex.x = Math.max(60, par.x - 120); ex.y = par.y + 30; }
      // 上と下の マスが 道の マスに 近すぎるときは よこに ずらす
      for (const nd of W.nodes) if (nd !== par && Math.hypot(nd.x - ex.x, nd.y - ex.y) < 70) ex.x += ex.x < nd.x ? -40 : 40;
    }
  }
}
layoutWorlds();

// お話。who: haru / pipi / maou / kabuto / yurei / narr(ナレーション)。文は 短く、ひらがな多め。
// 出る場所: intro=はじめて あそぶとき / w<n>=そのワールドに はじめて 入るとき / pre<id>=ボスの面の前 / post<id>=ボスを たおした後 / ending
const STORY = {
  intro: { bg: 'story_intro', theme: 'night', lines: [
    ['narr', 'ある よる、そらの ほしが ぜんぶ きえてしまった。'],
    ['narr', 'まどの そとに、ちいさな ひかりが ころがりおちてきた。'],
    ['pipi', 'いたた…。ぼく、ほしの子の ピピ。'],
    ['pipi', 'まおうが ほしの ランプを こわして、ほしの かけらが せかいじゅうに ちらばったんだ。'],
    ['haru', 'ほしが ないと、よるが まっくらで さみしいね。'],
    ['haru', 'よし! わたしが かけらを あつめて、そらに かえしてあげる!'],
    ['pipi', 'ありがとう、ハル! いっしょに いこう!'],
  ] },
  pre46: { theme: 'grass', lines: [
    ['narr', 'おかの うえで、おおきな スライムが ほしの かけらを ひとりじめしている。'],
    ['slime', 'ぷるるん! この かけらは ぼくの おやつ だもんね!'],
    ['pipi', 'はねて くるよ! 大ジャンプの ときは 地面が ゆれるから、ハルも ジャンプ!'],
    ['haru', 'うえから ふめば いいんだね。いくよ!'],
  ] },
  post46: { theme: 'grass', lines: [
    ['pipi', 'やったね! はじめての かけらだ!'],
    ['haru', 'まおうの おしろは まだ ずっと さき。こおりの くにへ いこう!'],
  ] },
  w2: { theme: 'ice', lines: [
    ['pipi', 'さむい! ここは こおりと みずの くにだよ。'],
    ['haru', 'まおうの おしろは この さきだね。すべらないように いこう。'],
  ] },
  pre8: { theme: 'castle', lines: [
    ['maou', 'ほしの かけらは わたさんぞ! よるは ずっと くらいままで いいのだ!'],
    ['haru', 'くらいのが すきでも、ほしを ひとりじめしちゃ だめ!'],
  ] },
  post8: { theme: 'castle', lines: [
    ['maou', 'ぐぬぬ…。だが ランプの かけらは もう とおくへ とんでいったぞ…。'],
    ['pipi', 'まおうは にげちゃった。さばくの ほうへ いったみたい!'],
  ] },
  w3: { theme: 'sand', lines: [
    ['pipi', 'あつい さばくだ。そらの しまにも かけらが ひかってる!'],
    ['haru', 'まおうの やみの とうも みえるね。こんどこそ!'],
  ] },
  pre12: { theme: 'castle', lines: [
    ['maou', 'しつこい こどもだ! この とうの ちからで おいはらってくれる!'],
    ['haru', 'ピピの ともだちの ほしを かえして!'],
  ] },
  post12: { theme: 'castle', lines: [
    ['maou', 'まいった…。ほんとうは、くらい よるが こわくて、ランプの ひかりが ほしかっただけなんだ…。'],
    ['haru', 'それなら、みんなで ほしを もどせば いいよ。よるも あかるくなるから!'],
    ['pipi', 'でも のこりの かけらは あらしの むこうへ とばされちゃった。'],
  ] },
  w4: { bg: 'story_w4', theme: 'storm', lines: [
    ['narr', 'あらしが ふきあれる こうげん。かぜが ほしの かけらを まきあげている。'],
    ['pipi', 'かぜに おされると とおくまで とべるよ。むかいかぜの ときは まってから!'],
    ['haru', 'あかと あおの スイッチ、ワープの あなも あるみたい。おもしろそう!'],
  ] },
  pre17: { theme: 'stormcastle', lines: [
    ['kabuto', 'ブオオオ! ここは おれの しろだ! かけらは ぜんぶ おれの たからもの!'],
    ['pipi', 'すごい いきおいで つっこんでくるよ! かべに ぶつかると 目を まわすみたい。'],
    ['haru', 'よけて、よけて… めが まわったら チャンスだね!'],
  ] },
  post17: { theme: 'stormcastle', lines: [
    ['kabuto', 'ま、まいった…。あらしの くもに あやつられて いたんだ…。'],
    ['kabuto', 'かけらの ひかりが、ゆうやけの たにの ほうへ ながれていったぞ。'],
    ['haru', 'おしえてくれて ありがとう! ピピ、いこう!'],
  ] },
  w5: { bg: 'story_w5', theme: 'dusk', lines: [
    ['narr', 'ゆうやけいろの たに。くらくなると おばけが でてくる という。'],
    ['pipi', 'ごろごろ ころがる いわに きをつけて! きえる あしばも あるよ。'],
    ['haru', 'じかんスイッチを ふんだら、とびらが しまる まえに いそごう!'],
  ] },
  pre23: { theme: 'ghost', lines: [
    ['yurei', 'ひっひっひ…。ひかりの かけらは まぶしすぎる…。ぜんぶ かくしてやる…。'],
    ['pipi', 'ゆうれいは みえないし、さわれないよ! どうしよう…。'],
    ['haru', 'ひかりの ブロックを たたけば、すがたが みえるかも!'],
  ] },
  post23: { theme: 'ghost', lines: [
    ['yurei', 'まぶしい…。でも…すこし あたたかいね…。'],
    ['yurei', 'そうそう、みどりの ジャングルで、ハチたちが ひかる ものを あつめていたよ。'],
    ['pipi', 'かけらだ! ハル、そらが すこし あかるくなってきたよ。'],
    ['haru', 'のこりの かけらも きっと みつけよう。ぼうけんは まだまだ つづく!'],
  ] },
  w6: { bg: 'story_w6', theme: 'jungle', lines: [
    ['narr', 'たきの おとが ひびく ふかい ジャングル。'],
    ['pipi', 'あの たねブロック、たたくと つるが のびるんだって!'],
    ['haru', 'ロープの ジップラインも ある! たきの むこうまで いけそう。'],
  ] },
  pre30: { theme: 'jungle', lines: [
    ['queen', 'ブブブ! ひかる かけらは あたしの すの たからもの! ハチミツより きれいなの!'],
    ['haru', 'それは そらの ほしなの。かえしてもらうよ!'],
    ['pipi', 'とっしんしてくるよ! はりが じめんに ささったら チャンス!'],
  ] },
  post30: { theme: 'jungle', lines: [
    ['queen', 'わかったわよ…。でもね、よるの そらから くろい かげが おりてきて、かけらを ねらっていたわ。'],
    ['pipi', 'くろい かげ…? かけらの ひかりが つきの ほうへ のびていく!'],
    ['haru', 'つきまで いくの!? たのしみ!'],
  ] },
  w7: { bg: 'story_w7', theme: 'moon', lines: [
    ['narr', 'ほしに いちばん ちかい、つきと ほしぞらの くに。'],
    ['pipi', 'ここでは からだが ふわっと かるくなるよ。ほうき星にも きをつけて!'],
    ['haru', 'ほしの たいほうで、びゅーんと とんでいこう!'],
  ] },
  pre37: { theme: 'space', lines: [
    ['narr', 'てんもんだいの まんなかで、おおきな めだまが こちらを にらんでいる…。'],
    ['pipi', 'あれは かげの おうの みはりだ! ひかりの はしらを うってくるよ!'],
    ['haru', 'うったあと つかれて おりてくるはず。そこを ねらう!'],
  ] },
  post37: { theme: 'space', lines: [
    ['pipi', 'わかった! ランプを こわしたのは まおうじゃない。かげの おうが まおうを そそのかしたんだ!'],
    ['maou', 'そうだ…。わたしは くらやみが こわくて、かげの おうの ことばに のってしまった。'],
    ['maou', 'すまなかった。かげの おうの しろへの みちを おしえよう。'],
    ['haru', 'ありがとう、まおう! さいごの かけらを とりもどしに いこう!'],
  ] },
  w8: { bg: 'story_w8', theme: 'kage', lines: [
    ['narr', 'そらの はての、ひかりの とどかない くに。かげの おうの しろが そびえている。'],
    ['maou', 'きをつけろ。ここでは じぶんの かげが おいかけてくる。たちどまるな!'],
    ['pipi', 'くずれる つりばしも、まわる かんらんしゃも ある…。'],
    ['haru', 'こわくないよ。みんなが まってる!'],
  ] },
  pre44: { theme: 'kagecastle', lines: [
    ['kage', 'よくきたな、ハル。わたしは おまえの かげ。ひかりが あるから かげが うまれる。'],
    ['kage', 'ほしなど いらぬ。よるは ずっと まっくらで いいのだ!'],
    ['haru', 'ひかりと かげは いつも いっしょだよ。だから ほしを かえして!'],
    ['pipi', 'ジャンプの あと ふらついたら チャンス! かげの なみは とびこえて!'],
  ] },
  post44: { theme: 'kagecastle', lines: [
    ['kage', 'ひかりが…あたたかい…。わたしも…ほんとうは さみしかったのかもしれない…。'],
    ['narr', 'かげの おうは ちいさな かげに もどり、ハルの あしもとに そっと かさなった。'],
    ['pipi', 'さいごの かけら! これで ほしの ランプが なおせるよ!'],
  ] },
  ending: { bg: 'story_ending', theme: 'night', lines: [
    ['narr', 'ハルと ピピが あつめた かけらで、ほしの ランプが ふたたび ひかりだした。'],
    ['pipi', 'みて! そらいっぱいに ほしが もどってきた!'],
    ['maou', 'よるが…こんなに あかるくて きれいだったとは…。'],
    ['queen', 'キラキラ! ハチミツより ずっと きれいね!'],
    ['haru', 'まおうも、おおカブトも、ゆうれい王も、じょおうバチも、みんなで みられて よかった。'],
    ['kage', '(ハルの あしもとで、ちいさな かげが うれしそうに ゆれた)'],
    ['pipi', 'ありがとう、ハル。きみは ぼくの いちばんの ともだちだよ!'],
    ['narr', 'こうして よぞらに ほしが もどった。ハルの だいぼうけんは、これで おしまい。'],
  ] },
};

// 話す人の名前と、顔の絵(ChatGPT の face_* があれば それ。なければ 素材集の絵で代わりに)
const SPEAKERS = {
  haru: { name: 'ハル', face: 'face_haru', alt: 'hero_idle', col: '#ff9f6b' },
  pipi: { name: 'ピピ', face: 'face_pipi', alt: 'star', col: '#ffe14d' },
  maou: { name: 'まおう', face: 'face_maou', alt: 'wizard', col: '#c78bff' },
  slime: { name: 'スライム大王', face: 'face_slime', alt: 'slime', col: '#8cff6a' },
  kabuto: { name: 'おおカブト', face: 'face_kabuto', alt: 'beetle', col: '#7fd0ff' },
  yurei: { name: 'ゆうれい王', face: 'face_yurei', alt: 'ghost', col: '#b8f0ff' },
  queen: { name: 'じょおうバチ', face: 'face_queen', alt: 'bee', col: '#ffd84a' },
  kage: { name: 'かげの おう', face: 'face_kage', alt: 'hero_idle', col: '#9a7ad8', filter: 'brightness(0.18) sepia(1) hue-rotate(220deg) saturate(3)' },
  narr: { name: '', face: null, alt: null, col: '#ffffff' },
};
