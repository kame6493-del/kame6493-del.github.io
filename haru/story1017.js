// ハルの冒険 お話の たしまし(2026-10-17)。game.js・story5.js の あとに 読む。
// ・ない 面に だけ pre<面id> を たす(ある キーは 上書きしない)。
// ・ボスの pre は もとの 行を のこして、まえに 1行 たす。ending は もとの 行を のこして、おわりの まえに 3行 たす。
// ・英語は EN_DICT に まとめて たす。行の 形は ['話す人', '日本語', 'English']。
'use strict';

// ---- 新しい 話し手(絵は もう ある 物を つかう)----
const SPEAKERS1017 = {
  oba: { name: 'おばあちゃん', face: 'face_oba', alt: 'face_haru', col: '#d9a6c8', filter: 'grayscale(0.75) brightness(1.08)' },
  poko: { name: 'ポコ', face: null, alt: 'xe_donguri_0', col: '#d9a066' },
  kero: { name: 'ケロスケ', face: null, alt: 'xe_pyoko_0', col: '#8fd96a' },
  yuki: { name: 'ユキ', face: null, alt: 'xe_yukipyon_0', col: '#bfe6ff' },
  koro: { name: 'ころまる', face: null, alt: 'xe_azarashi_0', col: '#d6e2f0' },
  chuta: { name: 'チュウタ', face: null, alt: 'xe_nezumi_0', col: '#f0c27a' },
  gearbo: { name: 'ギアボ', face: null, alt: 'xe_gear_0', col: '#a8b4c8' },
  sabo: { name: 'サボじい', face: null, alt: 'xe_sabo_0', col: '#7cc46a' },
  futa: { name: 'フウタ', face: null, alt: 'xe_itachi_0', col: '#9fd4d0' },
  boo: { name: 'ボー', face: null, alt: 'xe_chochin_0', col: '#ffb070' },
  kasa: { name: 'カサコ', face: null, alt: 'xe_karakasa_0', col: '#e88aa8' },
  gya: { name: 'ギャーコ', face: null, alt: 'xe_oumu_0', col: '#ff6a5a' },
  gabu: { name: 'ガブじい', face: null, alt: 'xe_wani_0', col: '#6aa86a' },
  mimi: { name: 'ミミ', face: null, alt: 'xe_mochiusa_0', col: '#ffe0ec' },
  kurari: { name: 'クラリ', face: null, alt: 'xe_hoshikurage_0', col: '#b9a8ff' },
  ponpo: { name: 'ポンポ', face: null, alt: 'xe_piero_0', col: '#ff8ac8' },
  noir: { name: 'ノワ', face: null, alt: 'xe_kuroneko_0', col: '#7a6aa8' },
  kiki: { name: 'キキ', face: null, alt: 'star', col: '#ffc8ec', filter: 'hue-rotate(300deg) saturate(1.3)' },
};
const SPEAKERS1017_EN = {
  'おばあちゃん': 'Grandma', 'ポコ': 'Poko', 'ケロスケ': 'Kerosuke', 'ユキ': 'Yuki', 'ころまる': 'Koromaru', 'チュウタ': 'Chuta',
  'ギアボ': 'Gearbo', 'サボじい': 'Grandpa Sabo', 'フウタ': 'Futa', 'ボー': 'Bo', 'カサコ': 'Kasako', 'ギャーコ': 'Gyako',
  'ガブじい': 'Old Gabu', 'ミミ': 'Mimi', 'クラリ': 'Kurari', 'ポンポ': 'Pompo', 'ノワ': 'Noir', 'キキ': 'Kiki',
};

// ---- 面の まえの お話 ----
const STORY1017_SRC = {
  // ===== ワールド1 みどりの くに(ハルの むらの ちかく)=====
  pre1: ['grass', [
    ['oba', 'ハル、もう いくのかい。おにぎりは もったかい?', 'Off already, Haru? Did you pack your rice balls?'],
    ['haru', 'うん! おばあちゃん、まつりまでには かえるからね。', 'Yep! I\'ll be home before the festival, Grandma.'],
    ['oba', 'ほしうたの まつりは、ほしが ないと はじまらないからねえ。', 'The Star Song Festival can\'t start without stars, you know.'],
    ['oba', 'わたしは まいとし、あの うたを たのしみに してるんだよ。', 'Every year, that song is what I look forward to most.'],
    ['pipi', 'まかせて、おばあちゃん! ハルと かけらを もってくる!', 'Leave it to us, Grandma! Haru and I will bring the shards!'],
  ]],
  pre2: ['sky', [
    ['narr', 'くもの うえは、かぜが きもちいい。', 'Up above the clouds, the breeze feels lovely.'],
    ['pipi', 'ハル、つよい てきを たおすと「いのちの かけら」が でる ことが あるよ。', 'Haru, tough enemies sometimes drop a "life shard."'],
    ['pipi', 'みっつ あつめると、のこりが ひとつ ふえる。みどりの キノコでもね。', 'Get three and you gain a life. A green mushroom does that too.'],
    ['haru', 'のこりが なくなったら?', 'And if I run out of lives?'],
    ['pipi', 'いったん おしまい。でも また つづきから あそべるよ。', 'Then it\'s game over for now. But you can always continue!'],
  ]],
  pre3: ['cave', [
    ['poko', 'あっ、ハルねえちゃん! ほらあなに はいるの?', 'Oh, Haru! Are you going into the cave?'],
    ['poko', 'おくで ぴかって ひかったの、ぼく みたよ。かけらかな。', 'I saw something flash way in the back. Is it a shard?'],
    ['haru', 'ありがとう、ポコ。まつりの うた、れんしゅう しておいてね。', 'Thanks, Poko. Keep practicing the festival song, okay?'],
    ['poko', 'うん! ほしが もどったら、いちばん おおきな こえで うたう!', 'Okay! When the stars come back, I\'ll sing the loudest!'],
  ]],
  pre4: ['lava', [
    ['kero', 'ケロッ。ハルかい。まつりの たいこが、ずっと ねむってるんだ。', 'Ribbit. Haru, is it? The festival drum has been asleep for days.'],
    ['kero', 'ほしの ない よるに たたいても、だれも おどらないからね。', 'Beat it on a starless night, and nobody dances.'],
    ['haru', 'だから いそいでるの。やまの うえに ひかりが みえる!', 'That\'s why I\'m hurrying. I see a light on the mountain!'],
    ['pipi', 'あつい やまだよ。あしもとの マグマに きをつけて!', 'It\'s a hot mountain. Watch out for the lava!'],
  ]],
  pre70: ['grass', [
    ['poko', 'ハルねえちゃん、シーソーで どっちが たかく とぶか しょうぶ!', 'Haru, let\'s see who can fly higher on the seesaw!'],
    ['haru', 'いまは だめ。でも かえったら いっぱい あそぼうね。', 'Not now. But when I get back, let\'s play lots.'],
    ['pipi', 'かたほうに のると、もう かたほうが あがるよ。', 'Stand on one end, and the other end goes up.'],
  ]],
  pre52: ['crystal', [
    ['narr', 'くさむらの おくに、きいろく ひかる しんでんが あった。', 'Deep in the tall grass stood a temple glowing yellow.'],
    ['kero', 'ケロ。むかしから ふしぎな しかけの ある しんでんさ。', 'Ribbit. That temple\'s had strange gadgets since long ago.'],
    ['pipi', 'なにが おこるか、すすんで みよう!', 'Let\'s go in and see what happens!'],
  ]],
  pre47: ['grass', [
    ['poko', 'しーっ。ここ、ぼくの ひみつの あそびば なんだ。', 'Shh. This is my secret play spot.'],
    ['poko', 'みどりの キノコが よく はえてるの。げんきが でるよ。', 'Green mushrooms grow here a lot. They really perk you up.'],
    ['haru', 'いいこと きいた! ポコ、ないしょに しておくね。', 'Good to know! I\'ll keep it a secret, Poko.'],
  ]],

  // ===== ワールド2 こおりと みずの くに =====
  pre5: ['ice', [
    ['yuki', 'まあ、たびの かたですか。こんな よるに めずらしいです。', 'Oh, a traveler? How rare, on a night like this.'],
    ['yuki', 'この もりでは、ほしを みて みちを えらぶんです。', 'In this forest, we pick our path by the stars.'],
    ['yuki', 'いまは どっちが きたかも わからなくて…。', 'Now we can\'t even tell which way is north...'],
    ['haru', 'まかせて。ほしが もどれば、また みちが わかるよ。', 'Leave it to me. Once the stars return, you\'ll find the way.'],
  ]],
  pre6: ['ruins', [
    ['koro', 'きゅう…きゅう…。おかあさん、どこぉ…。', 'Kyuu... kyuu... Mommy, where are you...'],
    ['haru', 'まいごなの? どこから きたの?', 'Are you lost? Where did you come from?'],
    ['koro', 'こおりの みずうみ。ほしを たどって かえる はず だったの。', 'The frozen lake. I was going to follow the stars home.'],
    ['pipi', 'かけらを みつけたら、いっしょに おうちを さがそう!', 'Once we find a shard, we\'ll look for your home together!'],
  ]],
  pre7: ['night', [
    ['narr', 'まっくらな そらに、とうが ひとつ のびている。', 'A single tower rises into the pitch-black sky.'],
    ['haru', 'むらでも、こんな そらを みて おばあちゃんが ためいき ついてた。', 'Back home, Grandma sighed looking at a sky like this.'],
    ['pipi', 'とうの てっぺんなら、かけらが よく みえるはず!', 'From the top of the tower, we should spot the shards!'],
  ]],
  pre56: ['ghostmansion', [
    ['yuki', 'その やしきに いくんですか? …わたし、ここで まってます。', 'You\'re going into that mansion? ...I\'ll wait out here.'],
    ['yuki', 'ゆきの なかで、だれかが よぶ こえが するんです。', 'Someone\'s voice keeps calling from inside the snow.'],
    ['pipi', 'みつめると とまる おばけが いるかも。うしろも みてね!', 'There may be ghosts that freeze when you look. Check behind you!'],
    ['haru', 'こわくない、こわくない…。いってきます!', 'Not scary, not scary... Here I go!'],
  ]],
  pre48: ['ice', [
    ['koro', 'みて! そらに ほしが ひとつだけ ひかってる!', 'Look! There\'s one star shining in the sky!'],
    ['haru', 'みどりの くにで、かけらを かえした ときの ほしだ。', 'That\'s the star from the shard we returned in the green land.'],
    ['koro', 'あの ほしの したが、ぼくの おうちの ほう! かえれる!', 'My home is right under that star! I can go home!'],
    ['pipi', 'ひとつでも、ちゃんと みちしるべに なるんだね。', 'Even one star can show the way.'],
  ]],
  pre71: ['seacave', [
    ['narr', 'うみの においの する どうくつ。なみの おとが ひびく。', 'A cave that smells of the sea. Waves echo inside.'],
    ['haru', 'なみの おと、まつりの うたに にてる…。', 'The waves sound a bit like the festival song...'],
    ['pipi', 'ハルの うた、ききたいな。かけらを みつけたら うたってよ!', 'I want to hear you sing! Sing it when we find a shard!'],
  ]],
  pre72: ['ice', [
    ['yuki', 'ハルさん! ころまるくん、ぶじに おうちへ かえれたそうです。', 'Haru! I heard Koromaru made it home safe.'],
    ['yuki', 'ゆきだるマンが ゆきだまを ころがしてるって うわさです。', 'Rumor says a Snowdude rolls snowballs down this slope.'],
    ['yuki', 'この さかの うえが、まおうの おしろ。きを つけて。', 'The Demon King\'s castle is at the top. Please be careful.'],
    ['haru', 'ありがとう、ユキ。かけらを とったら、また くるね。', 'Thanks, Yuki. I\'ll come back once I get the shard.'],
  ]],
  pre53: ['crystal', [
    ['narr', 'こおりの したに、みどりに ひかる しんでんが ねむっていた。', 'Under the ice slept a temple glowing green.'],
    ['yuki', 'むかしの ひとが、ほしを まつった ばしょだと きいています。', 'They say people long ago worshipped the stars here.'],
    ['haru', 'ほしの おまつりって、むかしから あったんだね。', 'So star festivals go back a long, long way.'],
  ]],
  pre49: ['ice', [
    ['koro', 'ハルおねえちゃん、ここ とっておきの ばしょ!', 'Haru, this is my super special spot!'],
    ['koro', 'こおりの なかに、めずらしい たからこぞうが かくれてるの。', 'A rare Treasure Imp hides somewhere in the ice.'],
    ['koro', 'つかまえると、いいもの くれるって。ほんとだよ!', 'Catch it and it gives you something good. Really!'],
  ]],

  // ===== ワールド3 さばくと そらの くに =====
  pre9: ['sand', [
    ['chuta', 'おーい! そこの ひと! みちを しらないっすか!', 'Hey! You there! Do you know the way?'],
    ['chuta', 'おいらは キャラバンの チュウタ。よるに ほしを みて あるくんす。', 'I\'m Chuta of the caravan. We travel at night by the stars.'],
    ['chuta', 'ほしが きえてから、おなじ ところを ぐるぐる…。', 'Since the stars vanished, we\'ve been walking in circles...'],
    ['haru', 'わたしたちも かけらを さがしてるの。いっしょに いこう!', 'We\'re looking for the shards too. Come along!'],
  ]],
  pre10: ['factory', [
    ['gearbo', 'ガシャン。シンニュウシャ…デハ ナイ。オキャクサマ。', 'Clank. Intruder... no. Guest.'],
    ['gearbo', 'コノ コウジョウハ、ヨルニ ホシノ ヒカリデ トケイヲ アワセマス。', 'This factory sets its clocks by starlight each night.'],
    ['gearbo', 'イマハ ジカンガ バラバラ。ハグルマモ ナイテ イマス。', 'Now the times are all wrong. Even the gears are crying.'],
    ['haru', 'かけらが もどったら、とけいも なおるかな。', 'Maybe the clocks will be fixed when the shards come back.'],
  ]],
  pre57: ['underwater', [
    ['sabo', 'わしは この オアシスの ばんにん、サボじい じゃ。', 'I am Grandpa Sabo, keeper of this oasis.'],
    ['sabo', 'みずの そこで、よな よな なにかが ひかっておる。', 'Night after night, something glows at the bottom of the water.'],
    ['chuta', 'みずっす! おいら、のんで まってるっす!', 'Water! I\'ll drink up and wait here!'],
    ['haru', 'じゃあ、わたしが もぐって みてくる!', 'Then I\'ll dive in and take a look!'],
  ]],
  pre11: ['sky', [
    ['chuta', 'そらの しまって、ほんとに あったんすね…。', 'So the sky islands are real...'],
    ['chuta', 'じっちゃんが いってたっす。ほしに いちばん ちかい しまだって。', 'My grandpa said they\'re the islands closest to the stars.'],
    ['pipi', 'したを みないで、まえだけ みて とんでね!', 'Don\'t look down. Just look ahead and jump!'],
  ]],
  pre50: ['sand', [
    ['sabo', 'すなあらしじゃ。キャラバンも ここで よく まようての。', 'A sandstorm. Caravans often lose their way here.'],
    ['sabo', 'むかしは よるに なると、ほしが みちを おしえて くれた。', 'In the old days, the stars showed the way each night.'],
    ['haru', 'その よるを とりもどすんだ。いってきます、サボじい!', 'I\'m bringing those nights back. See you, Grandpa Sabo!'],
    ['sabo', 'うむ。とげに さわらんよう、きを つけての。', 'Mm. Mind you don\'t touch any thorns.'],
  ]],
  pre73: ['mine', [
    ['chuta', 'ハルさん! ゆうべ、そらに ほしが ふえてたっす!', 'Haru! Last night there were more stars in the sky!'],
    ['chuta', 'キャラバンの みんな、ほしを たどって まちに つけたっす!', 'The whole caravan followed them and reached town!'],
    ['haru', 'よかった! チュウタも トロッコで いっしょに いく?', 'Great! Want to ride the mine cart with us, Chuta?'],
    ['chuta', 'お、おいらは ここで まってるっす! はやいの にがてなんす…。', 'I-I\'ll wait here! I\'m not good with fast things...'],
  ]],
  pre51: ['sand', [
    ['sabo', 'ほう、ここを みつけたか。めざとい むすめじゃ。', 'Oho, you found this place. Sharp eyes, young one.'],
    ['sabo', 'すなの したには、むかしの たびびとの コインが ねむっておる。', 'Under the sand sleep coins left by travelers of old.'],
    ['sabo', 'ひろって いきなされ。たびには なにかと いるでな。', 'Take them along. A journey always needs a little.'],
  ]],

  // ===== ワールド4 あらしの こうげん =====
  pre13: ['storm', [
    ['futa', 'よう! おれは フウタ。この おかの ふうしゃの ばんを してるんだぜ。', 'Yo! I\'m Futa. I look after the windmills on this hill.'],
    ['futa', 'むかしから、ほしが かぜの むきを そろえて くれてたんだ。', 'The stars always kept the winds blowing the right way.'],
    ['futa', 'いまは かぜが あばれて、ふうしゃは ぜんぶ とまっちまった。', 'Now the wind runs wild, and every windmill has stopped.'],
    ['haru', 'かけらが もどったら、きっと かぜも おちつくよ。', 'Once the shards are back, the wind will calm down.'],
  ]],
  pre14: ['mansion', [
    ['narr', 'あらしの なかに、ぎしぎし なる おやしきが たっていた。', 'A creaky mansion stood in the middle of the storm.'],
    ['futa', 'ここの しかけは、ふうしゃの ちからで うごいてたんだぜ。', 'The gadgets here used to run on windmill power.'],
    ['futa', 'いまは とびらも ゆかも、かってに ばたばた してやがる。', 'Now the doors and floors flap around on their own.'],
    ['pipi', 'しかけを よく みて すすもう!', 'Let\'s watch the gadgets closely as we go!'],
  ]],
  pre59: ['storm', [
    ['pipi', 'わあ、そらの まんなかを はしる みちだ!', 'Wow, a road running right through the sky!'],
    ['haru', 'したは くもばかり…。おちたら たいへん。', 'Nothing but clouds below... Better not fall.'],
    ['futa', 'たこあげダコが かぜに のって とんでるって はなしだ。きを つけな!', 'They say Kite Octopi ride the wind up there. Watch it!'],
  ]],
  pre15: ['crystal', [
    ['narr', 'すいしょうの ほらあなに、ふしぎな あなが いくつも ひらいていた。', 'Strange holes opened all over the crystal cave.'],
    ['haru', 'どの あなに はいれば いいんだろう。', 'Which hole should I go in?'],
    ['pipi', 'まよったら、いろいろ ためして みよう!', 'If we\'re not sure, let\'s try them all!'],
  ]],
  pre16: ['storm', [
    ['futa', 'ちびライジンって ちっこいのが、かみなりを おとすらしいぜ。', 'I hear a tiny thing called Mini Raijin drops lightning.'],
    ['futa', 'ひかったら すぐ よけろよ。おれは ここで まってるぜ。', 'Dodge the second it flashes. I\'ll wait here.'],
    ['haru', 'フウタ、ふうしゃが まわるの、もうすぐ だからね!', 'Futa, the windmills will turn again soon!'],
  ]],
  pre74: ['crystal', [
    ['futa', 'みろよ! はしっこの ふうしゃが、すこし まわりだしたぜ!', 'Look! The windmill on the edge started turning a bit!'],
    ['pipi', 'あつめた かけらで、ほしが ふえてきたからだ!', 'It\'s because the shards brought back more stars!'],
    ['haru', 'やったね! つぎは あらしの しろ。いっきに いこう!', 'Yay! Next is the Storm Castle. Let\'s go all the way!'],
  ]],
  pre54: ['crystal', [
    ['narr', 'かぜの とどかない くぼちに、みずいろの しんでん。', 'In a hollow the wind can\'t reach stood a light-blue temple.'],
    ['futa', 'ここだけは むかしから しずかなんだ。ふしぎだろ?', 'It\'s always been quiet here. Weird, huh?'],
    ['pipi', 'おくに なにか ありそう。のぞいて みよう!', 'Something\'s inside. Let\'s peek!'],
  ]],
  pre18: ['sky', [
    ['futa', 'へへっ、ここは おれの ひみつの しまだぜ。', 'Heh, this is my secret island.'],
    ['futa', 'かぜに のって、コインが たくさん ふきよせられて くるんだ。', 'The wind blows lots of coins over here.'],
    ['futa', 'ひろえる だけ ひろって いきな。おれからの おれいだ!', 'Grab all you can. Call it my thanks!'],
  ]],

  // ===== ワールド5 ゆうやけと おばけの くに =====
  pre19: ['dusk', [
    ['boo', 'ふわぁ…。こんばんは…。いや、もう おはよう かな…。', 'Yawn... Good evening... or is it good morning...'],
    ['boo', 'ぼくは ちょうちんの ボー。おばけは ほしの こもりうたで ねるんだ。', 'I\'m Bo the lantern. Ghosts sleep to the stars\' lullaby.'],
    ['boo', 'ほしが ないから、もう なんにちも ねむれなくて…ふわぁ。', 'With no stars, I haven\'t slept for days... yawn.'],
    ['haru', 'こもりうた…。おばあちゃんも、むかし うたって くれたな。', 'A lullaby... Grandma used to sing me one too.'],
  ]],
  pre20: ['ghost', [
    ['kasa', 'からかさの カサコよ。あんた、にんげんの こ?', 'I\'m Kasako the umbrella. Are you a human kid?'],
    ['kasa', 'この もりの おばけ、みんな ねむれなくて いらいら してるの。', 'Every ghost in this forest is grumpy from no sleep.'],
    ['kasa', 'ぶつかって こられても、わるく おもわないで あげてね。', 'If they bump into you, try not to hold it against them.'],
    ['pipi', 'じゃあ はやく ほしを もどして、ねかせて あげよう!', 'Then let\'s bring the stars back fast and let them sleep!'],
  ]],
  pre22: ['ghostmansion', [
    ['boo', 'その やしき、いちばん おおきな おばけが すんでるんだ…。', 'The biggest ghost of all lives in that mansion...'],
    ['boo', 'みつめると とまるけど、めを はなすと すうっと くる。', 'It stops when you stare, but slides closer when you look away.'],
    ['haru', 'にげきれば いいんだね。ボー、まっててね。', 'So I just have to get away. Wait for me, Bo.'],
  ]],
  pre75: ['cave', [
    ['narr', 'あかりの ひとつも ない どうくつ。', 'A cave without a single light.'],
    ['haru', '…まっくら。まおうも、こういうのが こわかったのかな。', '...So dark. Maybe this is what scared the Demon King.'],
    ['pipi', 'だいじょうぶ。ぼくが すこし てらすよ。', 'It\'s okay. I\'ll light things up a little.'],
    ['haru', 'ありがとう、ピピ。ひとりじゃ ないって、いいね。', 'Thanks, Pipi. It\'s nice not being alone.'],
  ]],
  pre76: ['ruins', [
    ['kasa', 'ねえ、きいて。ゆうべ ボーが すこしだけ ねむれたって。', 'Hey, listen. Bo got a little sleep last night.'],
    ['kasa', 'ほしが ちょっと ふえて、こもりうたが きこえたらしいの。', 'A few more stars came out, and he heard the lullaby.'],
    ['haru', 'よかった! もっと ふやすからね。', 'Great! I\'ll bring back even more.'],
    ['kasa', 'この いせきは おもたい しかけだらけ。つぶされないでよ。', 'These ruins are full of heavy traps. Don\'t get squished.'],
  ]],
  pre24: ['dusk', [
    ['boo', 'ここ、ぼくが ひるねに つかう いわば なんだ…ふわぁ。', 'This is the rocky spot where I nap... yawn.'],
    ['boo', 'いわの かげに、みどりの キノコが よく はえてるよ…。', 'Green mushrooms like to grow in the rocks\' shade...'],
    ['boo', 'もって いきなよ…。ぼくは…もう ねる…ぐう。', 'Take some... I\'m... going to sleep... zzz.'],
  ]],

  // ===== ワールド6 ジャングルと たきの くに =====
  pre25: ['jungle', [
    ['gya', 'ギャー! ギャー! だれだ! だれだ!', 'SQUAWK! SQUAWK! Who\'s there! Who\'s there!'],
    ['gya', 'ほたる ひからない! ほたる ひからない! ギャー!', 'Fireflies won\'t glow! Fireflies won\'t glow! SQUAWK!'],
    ['haru', 'ほたるが ひからないの?', 'The fireflies stopped glowing?'],
    ['gya', 'ほしの ひかり もらって、ほたる ひかる! いま まっくら!', 'Fireflies glow with starlight! Now it\'s all dark!'],
    ['pipi', 'ほたるも、ほしと つながってたんだね…。', 'So the fireflies are tied to the stars too...'],
  ]],
  pre26: ['jungle', [
    ['gya', 'キノコ はねる! ハル とぶ! ギャー、たのしい!', 'Mushrooms bounce! Haru flies! SQUAWK, fun!'],
    ['haru', 'のって みるね。…わっ、たかい!', 'Let me try. ...Whoa, so high!'],
    ['pipi', 'つたゴリラが きを ゆらすって うわさだよ。きを つけて!', 'They say a Vine Gorilla shakes the trees. Be careful!'],
  ]],
  pre27: ['falls', [
    ['gabu', 'ふぉっふぉっ。わしは ワニの ガブじい。こわがらんで いい。', 'Ho ho. I\'m Old Gabu the gator. No need to be scared.'],
    ['gabu', 'むかしは よるの たきが、ほたるで きんいろに かがやいてのう。', 'Long ago, the falls shone gold with fireflies at night.'],
    ['gabu', 'もう いちど、あれを みたい もんだわい。', 'I\'d love to see that just once more.'],
    ['haru', 'みせて あげる。やくそく!', 'I\'ll show you. I promise!'],
  ]],
  pre60: ['underwater', [
    ['gya', 'たきつぼ! ふかい! ギャー、オウム およげない!', 'Plunge pool! Deep! SQUAWK, parrots can\'t swim!'],
    ['haru', 'じゃあ わたしが いってくるね。', 'Then I\'ll go.'],
    ['pipi', 'みずの なかは うごきが ゆっくりだよ。あせらないで。', 'You move slowly underwater. Don\'t rush.'],
  ]],
  pre28: ['jungle', [
    ['narr', 'つたの からまる たかい とう。うえの ほうが かすかに ひかった。', 'A tall tower wrapped in vines. Something glowed near the top.'],
    ['haru', 'いま…ひかったよね?', 'Did that just... glow?'],
    ['pipi', 'ほたるだ! いっぴきだけ、すこし ひかってる!', 'A firefly! Just one, glowing a little!'],
    ['haru', 'ほしが もどってきたから だ。もっと あつめよう!', 'It\'s because stars came back. Let\'s get more!'],
  ]],
  pre29: ['falls', [
    ['gabu', 'この おおきな きは、ジャングルで いちばん そらに ちかい きでのう。', 'This great tree reaches closer to the sky than any other.'],
    ['gabu', 'てっぺんで ねがいを いうと、ほしに とどくと いわれとる。', 'They say a wish made at the top reaches the stars.'],
    ['haru', 'じゃあ、おばあちゃんの ぶんも おねがい しよう。', 'Then I\'ll make a wish for Grandma too.'],
  ]],
  pre77: ['jungle', [
    ['gya', 'ぶらんこ! ぶらーん! ギャー!', 'Swing! Swiiing! SQUAWK!'],
    ['gya', 'ほたる、さっき ひかった! ちょっとだけ! ギャー!', 'A firefly glowed just now! Just a bit! SQUAWK!'],
    ['haru', 'うん。もうすぐ みんな ひかるよ。', 'Yep. Soon they\'ll all be glowing.'],
  ]],
  pre78: ['falls', [
    ['narr', 'たきの したから、まるい あわが ぷかぷか のぼってくる。', 'Round bubbles float up from the bottom of the falls.'],
    ['pipi', 'あわは ふむと ぽーんと はねるよ!', 'Step on a bubble and it bounces you up!'],
    ['haru', 'じょおうバチの すは、この たきの むこうだね。', 'The Queen Bee\'s hive is past these falls.'],
  ]],
  pre55: ['crystal', [
    ['narr', 'つたに うもれた、むらさきの しんでん。', 'A purple temple buried in vines.'],
    ['gabu', 'わしが ちいさい ころから、ここに あったのう。', 'It\'s been here since I was a little one.'],
    ['haru', 'どの くにも、ほしを だいじに してたんだね。', 'Every land took good care of its stars.'],
  ]],
  pre31: ['falls', [
    ['gabu', 'おや、よく ここが わかったのう。', 'Oh my, you found this place.'],
    ['gabu', 'この はなばたけには、たからこぞうが ときどき あそびに くるわい。', 'A Treasure Imp comes to play in this flower field now and then.'],
    ['gabu', 'すばしっこいが、つかまえると たんまり くれるそうな。', 'It\'s quick, but they say it pays well if you catch it.'],
  ]],

  // ===== ワールド7 つきと ほしぞらの くに =====
  pre32: ['moon', [
    ['mimi', 'ぺったん…ぺったん…。あれ、きねが とまっちゃった。', 'Pound... pound... Oh, the mallet stopped.'],
    ['mimi', 'あたし、ミミ。ほしあかりの したで もちを つくのが きまりなの。', 'I\'m Mimi. We always pound mochi under the starlight.'],
    ['mimi', 'くらいと、うすの まんなかが みえないのよ。', 'When it\'s dark, I can\'t see the middle of the mortar.'],
    ['haru', 'おもち! むらの まつりでも、さいごに おもちを たべるんだ。', 'Mochi! We eat mochi at the end of our festival too.'],
    ['mimi', 'あら、なかまね。ほしが もどったら、ひとつ あげる!', 'Oh, we\'re alike! When the stars return, I\'ll give you one!'],
  ]],
  pre33: ['space', [
    ['kurari', 'ふわ…ふわ…。わたし、ほしクラゲの クラリ。', 'Float... float... I\'m Kurari the star jelly.'],
    ['kurari', 'ほうき星は、まいごの ほしを おうちに とどけるの。', 'Comets carry lost stars back home.'],
    ['kurari', 'でも ランプが ないから、どこへ とどけて いいか わからなくて…。', 'But with no lamp, they don\'t know where home is...'],
    ['pipi', 'だから あんなに ぐるぐる とんでるのか!', 'So that\'s why they keep zooming around in circles!'],
  ]],
  pre61: ['space', [
    ['kurari', 'ほうき星の ながれは はやいの。おいて いかれないでね。', 'The comet stream is fast. Don\'t get left behind.'],
    ['haru', 'うん! ほうき星さん、すこしだけ まっててね。', 'Okay! Comets, wait for me just a little.'],
  ]],
  pre34: ['moon', [
    ['mimi', 'その たいほう、ほんとは おもちを とばす ための ものなの。', 'That cannon is actually for launching mochi.'],
    ['mimi', '…うそよ。でも とおくまで とべるのは ほんと。', '...Just kidding. But it really does fly you far.'],
    ['haru', 'ミミって、おもしろいね。', 'You\'re funny, Mimi.'],
  ]],
  pre35: ['space', [
    ['narr', 'ほしくずが つみかさなって、そらへ のびる かいだんに なっていた。', 'Stardust had piled up into stairs reaching the sky.'],
    ['pipi', 'この うえ、ぼくの うまれた ところの ちかくだ…。', 'Up there is near where I was born...'],
    ['haru', 'ピピの おうち? じゃあ、てっぺんまで いこう!', 'Your home, Pipi? Then let\'s climb to the top!'],
  ]],
  pre36: ['moon', [
    ['narr', 'つきの うらがわ。ここだけは ひかりが ほとんど とどかない。', 'The far side of the moon. Hardly any light reaches here.'],
    ['mimi', 'うらは さむいの。せいざグモの あみに ひっかからないでね。', 'It\'s cold back here. Don\'t get caught in a Star Spider\'s web.'],
    ['haru', 'いつも くらい ところで くらす ひとも いるんだね。', 'Some folks always live in the dark, huh.'],
    ['pipi', '…かげの おうも、こんな ところに いたのかな。', '...Maybe the Shadow King lived somewhere like this.'],
  ]],
  pre79: ['space', [
    ['mimi', 'きいて! きねが また うごいたの! ぺったん、って!', 'Listen! The mallet moved again! Pound, it went!'],
    ['mimi', 'ほしが ふえて、うすの まんなかが みえたのよ。', 'More stars came out, and I could see the mortar!'],
    ['haru', 'よかった! あと すこしだね。', 'Yay! We\'re almost there.'],
    ['pipi', 'ここは うえと したが さかさまの とう。めを まわさないでね!', 'This tower is upside down. Don\'t get dizzy!'],
  ]],
  pre38: ['space', [
    ['kurari', 'ここは ほしぞらの おくの、ちいさな ひろば。', 'This is a little plaza deep in the starry sky.'],
    ['kurari', 'ながれぼしの かけらが、ときどき コインに なって おちて くるの。', 'Bits of shooting stars sometimes fall here as coins.'],
    ['kurari', 'ほうき星からの おすそわけよ。ふわ…。', 'A little gift from the comets. Float...'],
  ]],

  // ===== ワールド8 かげの おうの くに =====
  pre39: ['kage', [
    ['ponpo', 'やあ! ばねピエロの ポンポだよ! …わらって くれない?', 'Hi! I\'m Pompo the spring clown! ...Won\'t you laugh?'],
    ['ponpo', 'この まちの ひと、ほしが きえてから だれも わらわないんだ。', 'Nobody in this town has laughed since the stars vanished.'],
    ['ponpo', 'ぼく、まいにち ぴょんぴょん はねてるのに…しょぼん。', 'And I bounce around every single day... sigh.'],
    ['haru', 'わたしは わらうよ。ポンポ、その はねかた すごく へん!', 'I\'ll laugh! Pompo, the way you bounce is so silly!'],
    ['ponpo', 'へん!? …えへへ、ありがと!', 'Silly!? ...Hehe, thanks!'],
  ]],
  pre40: ['kage', [
    ['noir', 'にゃあ。にんげんの こが こんな ところまで。もの ずきだね。', 'Meow. A human kid, all the way out here. How odd.'],
    ['noir', 'ぼくは ノワ。この まちじゃ、わらうと かげの おうに にらまれる。', 'I\'m Noir. In this town, laughing gets the Shadow King\'s glare.'],
    ['noir', 'だから みんな だまってるのさ。ほんとは わらいたい くせにね。', 'So everyone keeps quiet. Even though they want to laugh.'],
    ['haru', 'かげの おうは、わらいごえが きらいなの?', 'Does the Shadow King hate laughter?'],
    ['noir', '…さあね。うらやましいんじゃ ないの。', '...Who knows. Maybe he\'s just jealous.'],
  ]],
  pre63: ['ghostmansion', [
    ['noir', 'その やかたは、かげオオカミが うろつくって はなしだよ。', 'They say Shadow Wolves prowl that mansion.'],
    ['noir', 'とおぼえが きこえたら、ふりかえらずに はしりな。', 'If you hear howling, run and don\'t look back.'],
    ['pipi', 'ハル、ぼくが うしろを みてるから!', 'Haru, I\'ll keep watch behind us!'],
  ]],
  pre41: ['kagecastle', [
    ['ponpo', 'かんらんしゃ! むかしは この まちの にんきもの だったんだ!', 'The Ferris wheel! It used to be the town favorite!'],
    ['ponpo', 'てっぺんで ほしを みると、みんな にこにこ してたの。', 'Everyone smiled seeing the stars from the top.'],
    ['haru', 'また みんなで のれるように するね。', 'I\'ll make it so everyone can ride again.'],
  ]],
  pre42: ['kagecastle', [
    ['maou', 'ハル。この めいろは、わたしも いちど まよった。', 'Haru. I got lost in this maze once myself.'],
    ['maou', 'くらがりの まがりかどが こわくて…いや、なんでもない。', 'The dark corners scared me... er, never mind.'],
    ['haru', 'まおう、いっしょに いてくれて ありがとう。', 'Thanks for coming with us, Demon King.'],
    ['maou', 'ふ、ふん。ランタンを もってきて よかった だけだ。', 'H-hmph. I\'m just glad I brought my lantern.'],
  ]],
  pre43: ['kagecastle', [
    ['noir', 'きいたかい。さっき、まちで だれかが くすっと わらったよ。', 'Hear that? Someone in town just giggled.'],
    ['noir', 'ポンポの やつ、ないて よろこんでた。ばかだね…にゃは。', 'Pompo cried with joy. What a goof... heh.'],
    ['haru', 'ノワも いま わらった!', 'You just laughed too, Noir!'],
    ['noir', 'わらって ない。…さっさと いきなよ。', 'I did not. ...Just get going.'],
  ]],
  pre80: ['kagecastle', [
    ['maou', 'この とうの はぐるまは、かげの ちからで まわっている。', 'The gears in this tower turn by shadow power.'],
    ['pipi', 'まきこまれないように、タイミングを みてね!', 'Time it right so you don\'t get caught!'],
    ['haru', 'もうすぐ…かげの おうの おしろだ。', 'Almost there... the Shadow King\'s castle.'],
  ]],
  pre45: ['space', [
    ['narr', 'われた ランプの へや。ゆかに ちいさな ひかりが ころがっている。', 'The room of the broken lamp. Little lights roll on the floor.'],
    ['noir', 'ここ、おうさまが ひとりで すわってた へやさ。', 'This is where the king used to sit all alone.'],
    ['noir', 'すみっこに みどりの キノコが はえてる。ひかりが もれてるからね。', 'Green mushrooms grow in the corner, where the light leaks in.'],
    ['noir', 'もって いきなよ。おうさまも、だめとは いわないさ。', 'Take them. The king won\'t mind.'],
  ]],

  // ===== ワールド9 ほしの みち =====
  pre65: ['space', [
    ['kiki', 'ピピにいちゃん!? ほんとに ピピにいちゃん だ!', 'Big brother Pipi!? It really is you!'],
    ['pipi', 'キキ! よかった、ぶじ だったんだね!', 'Kiki! Thank goodness you\'re safe!'],
    ['kiki', 'ランプが われて、みんな ここで まいごに なっちゃったの。', 'When the lamp broke, we all got lost out here.'],
    ['haru', 'いっしょに いこう。さいごまで つれて いくから。', 'Come with us. We\'ll take you all the way.'],
  ]],
  pre66: ['space', [
    ['kiki', 'ハルちゃんの むらって、どんな ところ?', 'Haru, what\'s your village like?'],
    ['haru', 'ちいさい むら。ほしの でる よるに、みんなで うたうの。', 'It\'s small. On starry nights, everyone sings together.'],
    ['kiki', 'ほしに うたって くれるの? …きっと みんな きいてたよ。', 'You sing to the stars? ...I bet we were all listening.'],
  ]],
  pre67: ['space', [
    ['narr', 'みちの わきで、ちいさな ほしが ふたつ ちかちか ないている。', 'Two tiny stars flicker and cry beside the road.'],
    ['kiki', 'まいごの こたちだ。いっしょに おいで!', 'More lost little ones. Come with us!'],
    ['haru', 'みんなで いけば、こわくないよ。', 'If we all go together, it won\'t be scary.'],
  ]],
  pre68: ['space', [
    ['kiki', 'ハルちゃん、つかれてない? ぼく、すこし てらして あげる。', 'Haru, are you tired? I\'ll light the way a bit.'],
    ['haru', 'ありがとう、キキ。ピピに そっくりだね。', 'Thanks, Kiki. You\'re just like Pipi.'],
    ['pipi', 'えー、ぼくの ほうが ひかりが つよいもん!', 'Hey, my light is brighter!'],
  ]],
  pre69: ['space', [
    ['narr', 'みちの おわりに、ほしの ランプの ひかりが とどいていた。', 'At the end of the road, the star lamp\'s light shone through.'],
    ['kiki', 'あそこが おうち…! ハルちゃん、あと ひといき!', 'That\'s home...! Haru, just a little more!'],
    ['pipi', 'さいごの みちが いちばん むずかしいよ。ゆっくりで いいからね。', 'The last road is the hardest. Take it slow.'],
  ]],

  // ===== ワールド10 ほしの はての にわ =====
  pre81: ['space', [
    ['oboshi', 'この にわでは、ほしの たねが ねむっているの。', 'In this garden, the star seeds are sleeping.'],
    ['oboshi', 'たねは、やさしい あしおとで めを さますのよ。', 'Gentle footsteps wake them up.'],
    ['haru', 'そうっと あるくね。…ジャンプは いいのかな。', 'I\'ll walk softly. ...Is jumping okay?'],
    ['oboshi', 'ふふ。げんきな あしおとも、すきよ。', 'Hehe. I like lively footsteps too.'],
  ]],
  pre82: ['mine', [
    ['oboshi', 'ここは ほしの いしの ねむる ところ。ランプの いしも ここから でたの。', 'Star stones sleep here. The lamp\'s stone came from here too.'],
    ['haru', 'ランプの いし…。かげの いしも?', 'The lamp\'s stone... and the shadow stone too?'],
    ['kage', '(あしもとの かげが、すこし ゆらめいた)', '(The shadow at her feet flickered a little.)'],
    ['oboshi', 'ええ。ひかりの いしと かげの いしは、となりで ねむっていたわ。', 'Yes. The light stone and the shadow stone slept side by side.'],
  ]],
  pre83: ['cave', [
    ['narr', 'まっくらな ほらあな。でも、ハルは もう こわく なかった。', 'A pitch-dark cave. But Haru wasn\'t scared anymore.'],
    ['haru', 'くらい ところにも、ちゃんと だれかが いるんだもんね。', 'Because there\'s always someone in the dark places too.'],
    ['kage', '(かげが、こくりと うなずいた)', '(The shadow gave a little nod.)'],
  ]],
  pre84: ['kagecastle', [
    ['oboshi', 'さいごの にわ。ここで たねが そだてば、そらは もっと にぎやかに なる。', 'The last garden. If the seeds grow here, the sky will be livelier.'],
    ['haru', 'むらの みんなにも、あたらしい ほしを みせて あげたい。', 'I want to show the new stars to everyone back home.'],
    ['pipi', 'おばあちゃん、きっと びっくり するね!', 'Grandma will be so surprised!'],
  ]],
};

// ---- ボスの pre の まえに たす 1行(もとの 行は そのまま)----
const STORY1017_BEFORE = {
  pre46: [['haru', 'おばあちゃん、みてて。ひとつめの かけら、とってくるよ。', 'Watch, Grandma. I\'m getting the first shard.']],
  pre8: [['narr', 'おしろの まどで、ちいさな ランタンの ひが ゆれていた。', 'A small lantern flame flickered in the castle window.']],
  pre12: [['chuta', 'あの くろい とう、キャラバンの みんなも ちかよらないっす…。', 'Nobody in the caravan goes near that black tower...']],
  pre17: [['futa', 'あの しろの ぬしが、かぜを ひとりじめ してるんだぜ!', 'The boss of that castle is hogging all the wind!']],
  pre23: [['boo', 'おうさまは、ほんとは とても やさしい かた なんだ…ふわぁ。', 'The king is really very kind, you know... yawn.']],
  pre30: [['gya', 'じょおう キラキラ だいすき! ほたるも ねらってた! ギャー!', 'The queen loves sparkles! She wanted the fireflies too! SQUAWK!']],
  pre37: [['mimi', 'てんもんだいの めだまは、いちども まばたき しないんだって。', 'They say the eye in the observatory never blinks.']],
  pre44: [['haru', 'おばあちゃん、むらの みんな…。もうすぐ かえるからね。', 'Grandma, everyone back home... I\'ll be back soon.']],
};

// ---- ending: 「ひるは ハルの あしもと」の 行の まえに たす(もとの 行は そのまま)----
const STORY1017_ENDING = [
  ['narr', 'その よる、ハルの むらで ほしうたの まつりが ひらかれた。', 'That night, Haru\'s village held the Star Song Festival.'],
  ['oba', 'おかえり、ハル。ことしも ほしが よく みえるねえ。', 'Welcome home, Haru. The stars look lovely this year.'],
  ['haru', 'ただいま! おばあちゃん、いっしょに うたおう!', 'I\'m home! Grandma, let\'s sing together!'],
];

const STORY1017 = {};
const STORY1017_ENDICT = Object.assign({}, SPEAKERS1017_EN);
(function () {
  const two = l => [l[0], l[1]];
  const addEN = ls => { for (const l of ls) STORY1017_ENDICT[l[1]] = l[2]; };
  for (const k in STORY1017_SRC) {
    const [theme, ls] = STORY1017_SRC[k];
    STORY1017[k] = { theme, lines: ls.map(two) };
    addEN(ls);
  }
  for (const k in STORY1017_BEFORE) addEN(STORY1017_BEFORE[k]);
  addEN(STORY1017_ENDING);
  // 2026-10-17 夜: さいしょの 場面は おばあちゃんと ハルの 村の 一枚絵(ChatGPT)
  if (STORY1017.pre1) STORY1017.pre1.bg = 'ill_oba_open';

  if (typeof SPEAKERS !== 'undefined') Object.assign(SPEAKERS, SPEAKERS1017);
  if (typeof STORY !== 'undefined') {
    // ある キーは 上書きしない
    const add = {};
    for (const k in STORY1017) if (!STORY[k]) add[k] = STORY1017[k];
    Object.assign(STORY, add);
    for (const k in STORY1017_BEFORE) {
      const st = STORY[k];
      if (!st || !Array.isArray(st.lines)) continue;
      const pre = STORY1017_BEFORE[k].map(two).filter(l => !st.lines.some(o => o[1] === l[1]));
      st.lines = pre.concat(st.lines);
    }
    const ed = STORY.ending;
    if (ed && Array.isArray(ed.lines) && !ed.lines.some(o => o[1] === STORY1017_ENDING[0][1])) {
      let at = ed.lines.findIndex(o => typeof o[1] === 'string' && o[1].indexOf('ひるは ハルの あしもと') === 0);
      if (at < 0) at = Math.max(0, ed.lines.length - 1);
      ed.lines.splice(at, 0, ...STORY1017_ENDING.map(two));
    }
  }
  if (typeof EN_DICT !== 'undefined') Object.assign(EN_DICT, STORY1017_ENDICT);
})();
