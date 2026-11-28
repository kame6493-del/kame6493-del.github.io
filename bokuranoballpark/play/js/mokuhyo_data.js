// 目標の表(11/22 持ち主「ミッション達成してなんか報酬とか目標とかあった方が良い」「内容濃くして 作りやすくして」
// 「あくまで目標なので強制的にやる必要ないみたいな感じで」)。js/mokuhyo.js がこの表を読む。
//
// 目標を増やす時は GOALS に 1 行足すだけ。
//   id     : 変えない名前(進み具合の localStorage に入る)
//   ch     : 章(CHAPTERS の id)
//   h      : 題(「〜してみよう」の柔らかい形)。{mark0} {mark1} はその球場の名物の名前、{E} は「E」か「緑のボタン」に置き換わる
//   s      : 一言の説明(どこで・どうやって)
//   where  : 道案内の行き先(無ければ道案内なし)
//            seat:any / seat:back / seat:ouen / seat:top … 席 ・ shop:food / shop:meib / shop:drink / shop:sweet / shop:out / shop:goods … 店
//            shop:item … その球場の名物の品(meib0)の店
//            booth … チケット売り場 ・ desk … アルバイト受付 ・ mark:<id> … 名物の印(js/gimmicks.js の G.mark) ・ spot:<札の言葉> … 名物の触れる所(G.spot の label)
//            outgate … 外の反対側のゲート ・ home … 本塁
//   done   : 何をしたら達成
//            { ev: '名前', n: 回数 }      … 出来事の回数(この球場で。all: true の目標は全部の球場の合計)
//            { at: true }                 … where の所に着いたら
//            { evSt: '名前', n: 球場の数 } … その出来事をした球場の数
//            { visited: 球場の数 } ・ { goals: 達成した目標の数 } ・ { ticket: true } チケットを持っている
//   reward : ごほうび { yen: お金, badge: BADGES の id, goods: 手に持てる品(freeplay.js の ITEMS の id), seat: 観戦の席(front / ofront / sky) }
//   next   : 達成した後に、次に出す目標(無ければ表の順で次)
//   kinds  : 出すモード(watch = ボールパークで過ごす / walk = 球場を歩く)。無ければ両方
//   st     : 出す球場(['koshien'] など。無ければ全部の球場)
//   need   : 球場の条件(meib = その球場の名物の品がある・relief = リリーフカーを使う球場)。その球場で無理な目標は出さない
//   r / dy : at の目標の、着いたとみなす近さ(m)と高さの差(既定 9 m・5 m)
//   all    : true なら全部の球場で 1 回(進み具合を球場ごとに分けない)
//   auto   : false なら札に自分からは出さない(一覧から選んだ時だけ)
//
// 出来事の名前(js/mokuhyo.js が数える。守備は js/defense.js・js/guide.js から mkEv を呼ぶ)
//   show:<言葉> … 球場の演出の言葉(js/gimmicks.js の G.say の 1 つめ) ・ spot:<札の言葉> … 名物に触れた ・ sit:<区画>
//   eat drink eat_meib eat_meib0 eat_sweet eat_sit eat_out ・ sit:back sit:ouen top field lap ・ goods cheer balloon spot photo warp
//   job job:uriko job:shop job:ball job:relief job_done ・ hit_seen hr_seen hr_ouen game_seen foul
//   def_tut def_catch def_knock def_fine def_game def_win

export const CHAPTERS = [
  { id: 'hajime', name: 'はじめての観戦', desc: '席に座って、試合をゆっくり見る' },
  { id: 'gourmet', name: '球場グルメめぐり', desc: '名物から甘い物まで、食べ歩き' },
  { id: 'uriko', name: '売り子の一日', desc: 'アルバイトで球場の裏側へ' },
  { id: 'kono', name: 'この球場だけの名物', desc: 'ここでしか見られない物・できること' },
  { id: 'meisho', name: '見どころ', desc: '球場の外・いちばん上の段・グラウンド' },
  { id: 'ouen', name: '応援の日', desc: '応援席でグッズを持って声を出す' },
  { id: 'shubi', name: 'グラウンドに立つ', desc: '守備の練習・ノック・試合で(タイトル → 守備)' },
  { id: 'seiha', name: '全球場めぐり', desc: 'ほかの球場へも足をのばす' },
];

const DEF = 'タイトル → 守備 で';
export const GOALS = [
  // はじめての観戦
  { id: 'h_ticket', ch: 'hajime', h: 'チケットを買ってみよう', s: 'チケット売り場の前で {E}(球場に入るのに要る)', where: 'booth', kinds: ['watch'], done: { ticket: true }, reward: { yen: 100 }, next: 'h_back' },
  { id: 'h_back', ch: 'hajime', h: 'バックネット裏の席で見てみよう', s: '本塁のすぐ後ろの席に座る', where: 'seat:back', done: { ev: 'sit:back' }, reward: { yen: 300 }, next: 'h_hit' },
  { id: 'h_hit', ch: 'hajime', h: 'ヒットの瞬間を見てみよう', s: '席で試合を見ていれば', where: 'seat:any', kinds: ['watch'], done: { ev: 'hit_seen' }, reward: { yen: 200 }, next: 'h_hr' },
  { id: 'h_hr', ch: 'hajime', h: 'ホームランを見届けよう', s: '席で試合を見ていれば', where: 'seat:any', kinds: ['watch'], done: { ev: 'hr_seen' }, reward: { yen: 500 }, next: 'h_full' },
  { id: 'h_full', ch: 'hajime', h: '試合を最後まで見てみよう', s: '試合の終わりまで', where: 'seat:any', kinds: ['watch'], done: { ev: 'game_seen' }, reward: { yen: 1000, badge: 'kansen', seat: 'front' } },
  { id: 'h_photo', ch: 'hajime', h: '写真を 1 枚撮ってみよう', s: '{PHOTO}', done: { ev: 'photo' }, reward: { yen: 200, badge: 'camera' } },
  { id: 'h_warp', ch: 'hajime', h: '地図から ほかの場所へ行ってみよう', s: '地図(M)で行き先を押して「行く」', done: { ev: 'warp' }, reward: { yen: 200 } },

  // 球場グルメめぐり
  { id: 'g_eat', ch: 'gourmet', h: '店で 1 品 食べてみよう', s: '店の前で {E} → 品を選ぶ → 食べる', where: 'shop:food', kinds: ['watch'], done: { ev: 'eat' }, reward: { yen: 200 }, next: 'g_meib' },
  { id: 'g_meib', ch: 'gourmet', h: 'この球場の名物を食べてみよう', s: '名物のある店で', where: 'shop:meib', need: 'meib', kinds: ['watch'], done: { ev: 'eat_meib' }, reward: { yen: 500 }, next: 'g_drink' },
  { id: 'g_drink', ch: 'gourmet', h: '飲み物を 1 杯 飲んでみよう', s: '店で飲み物を選ぶ', where: 'shop:drink', kinds: ['watch'], done: { ev: 'drink' }, reward: { yen: 150 }, next: 'g_sweet' },
  { id: 'g_sweet', ch: 'gourmet', h: '甘い物を食べてみよう', s: 'アイス・かき氷・ソフトクリームなど', where: 'shop:sweet', kinds: ['watch'], done: { ev: 'eat_sweet' }, reward: { yen: 200 }, next: 'g_seat' },
  { id: 'g_seat', ch: 'gourmet', h: '席に座って食べてみよう', s: '買った物を持って席へ', where: 'seat:any', kinds: ['watch'], done: { ev: 'eat_sit' }, reward: { yen: 300 }, next: 'g_out' },
  { id: 'g_out', ch: 'gourmet', h: '球場の外の店で食べてみよう', s: 'ゲートの外の屋台・店', where: 'shop:out', kinds: ['watch'], done: { ev: 'eat_out' }, reward: { yen: 300 }, next: 'g_eat5' },
  { id: 'g_eat5', ch: 'gourmet', h: 'この球場で 5 品 食べてみよう', s: '店をはしごして', where: 'shop:food', kinds: ['watch'], done: { ev: 'eat', n: 5 }, reward: { yen: 500, badge: 'kuishinbo' } },
  { id: 'g_tour', ch: 'gourmet', h: '3 つの球場の名物を食べてみよう', s: 'ほかの球場の名物も', all: true, auto: false, done: { evSt: 'eat_meib', n: 3 }, reward: { yen: 2000, badge: 'gourmet' } },

  // 売り子の一日
  { id: 'u_desk', ch: 'uriko', h: 'アルバイト受付に行ってみよう', s: '球場の外の関係者入口', where: 'desk', r: 3.5, kinds: ['watch'], done: { at: true }, reward: { yen: 100 }, next: 'u_job' },
  { id: 'u_job', ch: 'uriko', h: 'アルバイトを 1 回 やってみよう', s: '受付で {E} → 好きな仕事', where: 'desk', kinds: ['watch'], done: { ev: 'job' }, reward: { yen: 300 }, next: 'u_beer' },
  { id: 'u_beer', ch: 'uriko', h: '売り子で客席を回ってみよう', s: '受付で「ドリンクの売り子」→ 手を挙げたお客さんへ', where: 'desk', kinds: ['watch'], done: { ev: 'job:uriko' }, reward: { yen: 300 }, next: 'u_shop' },
  { id: 'u_shop', ch: 'uriko', h: '売店の店員をやってみよう', s: '受付で「売店の店員」→ 注文の品を渡す', where: 'desk', kinds: ['watch'], done: { ev: 'job:shop' }, reward: { yen: 300 }, next: 'u_ball' },
  { id: 'u_ball', ch: 'uriko', h: 'ボールパーソンをやってみよう', s: '受付で「ボールパーソン」→ 転がる球を拾う', where: 'desk', kinds: ['watch'], done: { ev: 'job:ball' }, reward: { yen: 300 }, next: 'u_done' },
  { id: 'u_done', ch: 'uriko', h: '仕事を最後までやりとげよう', s: '途中でやめずに時間いっぱい', where: 'desk', kinds: ['watch'], done: { ev: 'job_done' }, reward: { yen: 500, badge: 'hataraki', goods: 'keychain' }, next: 'u_ten' },
  { id: 'u_ten', ch: 'uriko', h: 'アルバイトで 10 回 かせいでみよう', s: '売る・渡す・拾うで 1 回', where: 'desk', kinds: ['watch'], done: { ev: 'job', n: 10 }, reward: { yen: 1000, badge: 'urikostar' } },
  { id: 'u_relief', ch: 'uriko', h: 'リリーフカーで投手を送ってみよう', s: '受付で「リリーフカー」→ 投手交代で呼ばれる', where: 'desk', need: 'relief', kinds: ['watch'], auto: false, done: { ev: 'job:relief' }, reward: { yen: 1000, badge: 'relief' } },

  // この球場だけの名物(12 球場すべて。js/gimmicks.js の名物・演出と、その球場だけの品に合わせる)
  { id: 'k_meib0', ch: 'kono', h: '名物の「{meib0}」を食べてみよう', s: 'この球場でしか売っていない品', where: 'shop:item', need: 'meib', kinds: ['watch'], done: { ev: 'eat_meib0' }, reward: { yen: 500 } },
  // 浜風の球場
  { id: 'koshien_tou', st: ['koshien'], ch: 'kono', h: '野球塔を見上げてみよう', s: '塔の下で {E}', where: 'spot:野球塔を見上げる', done: { ev: 'spot:野球塔を見上げる' }, reward: { yen: 300 } },
  { id: 'koshien_hi', st: ['koshien'], ch: 'kono', h: '大運動場の記念碑を読んでみよう', s: '野球塔のそばの碑の前で {E}', where: 'spot:記念碑を読む', done: { ev: 'spot:記念碑を読む' }, reward: { yen: 300 } },
  { id: 'koshien_tsuchi', st: ['koshien'], ch: 'kono', h: 'ベンチ前の土を袋に詰めてみよう', s: 'グラウンドのベンチの前で {E}', where: 'spot:土を袋に詰める', kinds: ['walk'], done: { ev: 'spot:土を袋に詰める' }, reward: { yen: 500, badge: 'tsuchi' } },
  // 屋根の球場
  { id: 'dome_relief', st: ['dome'], ch: 'kono', h: 'ゲートの打者の浮き彫りを見てみよう', s: 'ゲートの外の壁の前で {E}', where: 'spot:浮き彫りを見る', done: { ev: 'spot:浮き彫りを見る' }, reward: { yen: 300 } },
  { id: 'dome_hi', st: ['dome'], ch: 'kono', h: 'バットと月桂樹の碑を見てみよう', s: '浮き彫りのそばの碑の前で {E}', where: 'spot:碑を見る', done: { ev: 'spot:碑を見る' }, reward: { yen: 300 } },
  { id: 'dome_kaze', st: ['dome'], ch: 'kono', h: '回転扉で 風に押されてみよう', s: '屋根の中は外より空気の圧が高い。出入口の回転扉を通る', done: { ev: 'show:背中を風に押された' }, reward: { yen: 300 } },
  { id: 'dome_hr', st: ['dome'], ch: 'kono', h: 'ホームランの光の演出を見よう', s: '席で試合を見ていれば', where: 'seat:any', kinds: ['watch'], done: { ev: 'show:ホームランの光の演出' }, reward: { yen: 500 } },
  // 杜ノ丘ボールパーク
  { id: 'park_kasa', st: ['park'], ch: 'kono', h: '傘の応援に加わってみよう', s: '7 回裏の前や点が入った時、席で {E}', where: 'seat:any', kinds: ['watch'], done: { ev: 'spot:傘を振る' }, reward: { yen: 500 } },
  { id: 'park_kasa2', st: ['park'], ch: 'kono', h: '傘の応援を見てみよう', s: '7 回裏の前や、地元に点が入った時', where: 'seat:any', kinds: ['watch'], done: { ev: 'show:傘の応援' }, reward: { yen: 300 } },
  { id: 'park_hanabi', st: ['park'], ch: 'kono', h: '夜の試合で花火を見よう', s: 'ナイターの 5 回裏の後', where: 'seat:any', kinds: ['watch'], done: { ev: 'show:花火' }, reward: { yen: 500 } },
  // 銀輪ドーム
  { id: 'ring_light', st: ['ring'], ch: 'kono', h: '勝った時の光の演出を見よう', s: '地元が勝つと屋根の下の灯りが回る', where: 'seat:any', kinds: ['watch'], done: { ev: 'show:勝った時の光の演出' }, reward: { yen: 800 } },
  { id: 'ring_gaiya', st: ['ring'], ch: 'kono', h: '広い外野の席から丸い屋根を見上げよう', s: '外野席に座る', where: 'seat:outfield', done: { ev: 'sit:outfield' }, reward: { yen: 300 } },
  // 汽笛ヶ原ボールパーク
  { id: 'railside_neso', st: ['railside'], ch: 'kono', h: '寝そべる席で試合を見てみよう', s: '外野の赤いマットの席で {E}', where: 'spot:寝そべって見る', done: { ev: 'spot:寝そべって見る' }, reward: { yen: 500 } },
  { id: 'railside_fusen', st: ['railside'], ch: 'kono', h: '赤いジェット風船を見よう', s: '7 回裏の前に一斉に上がる', where: 'seat:any', kinds: ['watch'], done: { ev: 'show:ジェット風船' }, reward: { yen: 500 } },
  // 灯台坂スタジアム
  { id: 'bowl_tulip', st: ['bowl'], ch: 'kono', h: 'チューリップの花壇を見てみよう', s: '球場をかこむ公園で {E}', where: 'spot:花壇を見る', done: { ev: 'spot:花壇を見る' }, reward: { yen: 300 } },
  { id: 'bowl_hanabi', st: ['bowl'], ch: 'kono', h: 'ホームランの花火を見よう', s: '地元の選手がホームランを打つと上がる', where: 'seat:any', kinds: ['watch'], done: { ev: 'show:ホームランの花火' }, reward: { yen: 500 } },
  // 観覧車の丘スタジアム
  { id: 'north_carousel', st: ['north'], ch: 'kono', h: 'メリーゴーラウンドに乗ってみよう', s: '観覧車の隣の遊び場で {E}', where: 'spot:メリーゴーラウンドに乗る', done: { ev: 'spot:メリーゴーラウンドに乗る' }, reward: { yen: 300 } },
  { id: 'north_fusen', st: ['north'], ch: 'kono', h: '赤いジェット風船を見よう', s: '7 回裏の前に一斉に上がる', where: 'seat:any', kinds: ['watch'], done: { ev: 'show:ジェット風船' }, reward: { yen: 500 } },
  // 白樺ルーフパーク
  { id: 'roof_sauna', st: ['roof'], ch: 'kono', h: 'サウナのテラスで試合を見てみよう', s: '左翼の後ろの建物で {E}', where: 'spot:サウナのテラスで試合を見る', done: { ev: 'spot:サウナのテラスで試合を見る' }, reward: { yen: 500 } },
  { id: 'roof_gaiya', st: ['roof'], ch: 'kono', h: '外野席からガラスの壁の方を見てみよう', s: '外野席に座る', where: 'seat:outfield', done: { ev: 'sit:outfield' }, reward: { yen: 300 } },
  // 潮凪ドーム
  { id: 'bay_win', st: ['bay'], ch: 'kono', h: '勝利の演出を見よう', s: '地元が勝つと屋根の下で花火', where: 'seat:any', kinds: ['watch'], done: { ev: 'show:勝利の演出' }, reward: { yen: 800 } },
  { id: 'bay_fusen', st: ['bay'], ch: 'kono', h: '黄色いジェット風船を見よう', s: '7 回裏の前に一斉に上がる', where: 'seat:any', kinds: ['watch'], done: { ev: 'show:ジェット風船' }, reward: { yen: 500 } },
  // 海鳴りスタジアム
  { id: 'shore_kaze', st: ['shore'], ch: 'kono', h: 'バックスクリーンの上の風速計を見に行こう', s: '外野の後ろから見上げる', where: 'mark:anemometer', r: 26, dy: 40, done: { at: true }, reward: { yen: 300 } },
  { id: 'shore_hanabi', st: ['shore'], ch: 'kono', h: '海の側から上がる花火を見よう', s: '5 回が終わった後', where: 'seat:any', kinds: ['watch'], done: { ev: 'show:花火' }, reward: { yen: 500 } },
  // 森かげドーム
  { id: 'grove_lion', st: ['grove'], ch: 'kono', h: '白いライオンの前で記念写真を撮ろう', s: '像の前で {E}', where: 'spot:ライオンの前で記念写真', done: { ev: 'spot:ライオンの前で記念写真' }, reward: { yen: 500 } },
  { id: 'grove_hanabi', st: ['grove'], ch: 'kono', h: '勝った時の花火を見よう', s: '大きな画面に花火が上がる', where: 'seat:any', kinds: ['watch'], done: { ev: 'show:勝った時の花火(大きな画面)' }, reward: { yen: 800 } },
  // 舟灯ドーム
  { id: 'canal_rose', st: ['canal'], ch: 'kono', h: 'バラ色の記念の席を見てみよう', s: '一塁側の内野席で {E}', where: 'spot:記念の席を見る', done: { ev: 'spot:記念の席を見る' }, reward: { yen: 300 } },
  { id: 'canal_plate', st: ['canal'], ch: 'kono', h: '左翼の記念の板を見に行こう', s: '左翼のフェンスの近くへ', where: 'mark:lf_plate', r: 14, dy: 8, done: { at: true }, reward: { yen: 300 } },

  // 見どころ
  { id: 'm_out', ch: 'meisho', h: '球場の外をぐるっと歩いてみよう', s: '外の広場を回る', where: 'outgate', kinds: ['watch'], done: { at: true }, reward: { yen: 500 } },
  { id: 'm_top', ch: 'meisho', h: 'いちばん上の段から見下ろしてみよう', s: '客席のいちばん上まで', where: 'seat:top', done: { ev: 'top' }, reward: { yen: 300, badge: 'takai' } },
  { id: 'm_field', ch: 'meisho', h: 'グラウンドに降りてみよう', s: '客席の前のフェンスから', where: 'home', kinds: ['walk'], done: { ev: 'field' }, reward: { yen: 200 }, next: 'm_lap' },
  { id: 'm_lap', ch: 'meisho', h: 'ダイヤモンドを一周してみよう', s: '本塁から 一塁 → 二塁 → 三塁 → 本塁', where: 'home', kinds: ['walk'], done: { ev: 'lap' }, reward: { yen: 300, badge: 'diamond' } },
  { id: 'm_foul', ch: 'meisho', h: 'ファウルボールを捕ってみよう', s: '席にいると時々飛んでくる', where: 'seat:any', kinds: ['watch'], done: { ev: 'foul' }, reward: { yen: 500, badge: 'foul' } },

  // 応援の日
  { id: 'o_seat', ch: 'ouen', h: '応援席に座ってみよう', s: '{OUEN}', where: 'seat:ouen', done: { ev: 'sit:ouen' }, reward: { yen: 300, goods: 'megaphone' }, next: 'o_cheer' },
  { id: 'o_cheer', ch: 'ouen', h: 'メガホンで応援してみよう', s: 'メガホンを持って {E}(ごほうびの一覧から持てる)', done: { ev: 'cheer' }, reward: { yen: 200 }, next: 'o_goods' },
  { id: 'o_goods', ch: 'ouen', h: '応援グッズを買ってみよう', s: 'グッズの店で', where: 'shop:goods', kinds: ['watch'], done: { ev: 'goods' }, reward: { yen: 200 }, next: 'o_balloon' },
  { id: 'o_balloon', ch: 'ouen', h: 'ジェット風船を飛ばしてみよう', s: 'グッズの店の風船を持って {E}', where: 'shop:balloon', kinds: ['watch'], done: { ev: 'balloon' }, reward: { yen: 200 }, next: 'o_cheer10' },
  { id: 'o_cheer10', ch: 'ouen', h: '10 回 応援してみよう', s: 'メガホン・タオルで', done: { ev: 'cheer', n: 10 }, reward: { yen: 500, badge: 'ouendan', goods: 'towel', seat: 'ofront' }, next: 'o_hr' },
  { id: 'o_hr', ch: 'ouen', h: '応援席でホームランを見よう', s: '応援席に座って試合を見る', where: 'seat:ouen', kinds: ['watch'], done: { ev: 'hr_ouen' }, reward: { yen: 800 } },

  // グラウンドに立つ(守備。札には自分からは出さない)
  { id: 'd_tut', ch: 'shubi', h: '守備の練習をやってみよう', s: DEF, all: true, auto: false, done: { ev: 'def_tut' }, reward: { yen: 300 } },
  { id: 'd_catch', ch: 'shubi', h: '守備で 10 本 捕ってみよう', s: DEF, all: true, auto: false, done: { ev: 'def_catch', n: 10 }, reward: { yen: 500 } },
  { id: 'd_knock', ch: 'shubi', h: 'ノックを最後までやってみよう', s: DEF + '(ノック)', all: true, auto: false, done: { ev: 'def_knock' }, reward: { yen: 500 } },
  { id: 'd_fine', ch: 'shubi', h: 'ファインプレーを決めてみよう', s: '飛び込む・跳ぶで捕る', all: true, auto: false, done: { ev: 'def_fine' }, reward: { yen: 1000, badge: 'meishu', goods: 'kinen' } },
  { id: 'd_game', ch: 'shubi', h: '試合を最後まで守ってみよう', s: DEF + '(試合)', all: true, auto: false, done: { ev: 'def_game' }, reward: { yen: 1000 } },
  { id: 'd_win', ch: 'shubi', h: '守備の試合で勝ってみよう', s: DEF + '(試合)', all: true, auto: false, done: { ev: 'def_win' }, reward: { yen: 1500, badge: 'shori' } },

  // 全球場めぐり
  { id: 's_2', ch: 'seiha', h: 'ほかの球場にも行ってみよう', s: '一時停止 → タイトルへ → 球場を選ぶ', all: true, done: { visited: 2 }, reward: { yen: 500 } },
  { id: 's_5', ch: 'seiha', h: '5 つの球場をめぐってみよう', s: '球場ごとに名物も店もちがう', all: true, auto: false, done: { visited: 5 }, reward: { yen: 2000, badge: 'tabi', seat: 'sky' } },
  { id: 's_all', ch: 'seiha', h: 'ぜんぶの球場をめぐってみよう', s: '{NST} の球場', all: true, auto: false, done: { visited: 99 }, reward: { yen: 5000, badge: 'seiha', goods: 'plush' } },
  { id: 's_g10', ch: 'seiha', h: '目標を 10 こ 達成してみよう', s: 'どの目標でも', all: true, auto: false, done: { goals: 10 }, reward: { yen: 1000, goods: 'minibat' } },
  { id: 's_g30', ch: 'seiha', h: '目標を 30 こ 達成してみよう', s: 'どの目標でも', all: true, auto: false, done: { goals: 30 }, reward: { yen: 3000, badge: 'master' } },
];

// 称号・バッジ(c: 丸の中の 1 字、col: 丸の色)。一覧で押すと称号にできる
export const BADGES = {
  kansen: { name: '観戦デビュー', c: '観', col: '#2f8fe0', how: '試合を最後まで見る' },
  camera: { name: '球場カメラマン', c: '写', col: '#7a5af0', how: '写真を撮る' },
  kuishinbo: { name: '食いしんぼう', c: '食', col: '#f07a2a', how: '1 つの球場で 5 品' },
  gourmet: { name: '球場グルメ名人', c: '味', col: '#e04a3a', how: '3 つの球場の名物' },
  hataraki: { name: 'はたらき者', c: '働', col: '#2fa860', how: '仕事を最後まで' },
  urikostar: { name: '売り子の星', c: '星', col: '#e0a81a', how: 'アルバイトで 10 回' },
  relief: { name: 'リリーフカーの運転手', c: '車', col: '#3a6ea5', how: 'リリーフカーで投手を送る' },
  takai: { name: 'てっぺんの人', c: '高', col: '#5ab0c8', how: 'いちばん上の段へ' },
  tsuchi: { name: '土のおみやげ', c: '土', col: '#8a5a2a', how: 'ベンチ前の土を袋に' },
  diamond: { name: 'ダイヤモンド一周', c: '周', col: '#b8862a', how: '本塁から一周' },
  foul: { name: 'ファウルボールの達人', c: '球', col: '#c8323a', how: 'ファウルボールを捕る' },
  ouendan: { name: '応援団長', c: '応', col: '#d0302a', how: '10 回 応援' },
  meishu: { name: '守備の名手', c: '守', col: '#1f3557', how: 'ファインプレー' },
  shori: { name: '勝利の立役者', c: '勝', col: '#e0b020', how: '守備の試合で勝つ' },
  tabi: { name: '球場の旅人', c: '旅', col: '#4a9a5a', how: '5 つの球場' },
  seiha: { name: '全球場制覇', c: '覇', col: '#c89a1a', how: 'ぜんぶの球場' },
  master: { name: '目標マスター', c: '極', col: '#8a3ac8', how: '目標を 30 こ' },
};

// 観戦の席(ごほうびで行けるようになる。freeplay.js の goSeat のかぎ)
export const SEAT_REWARDS = { front: '砂かぶり席(本塁の後ろの最前列)', ofront: '外野の最前列', sky: '空からの眺め(球場の上を一周)' };

// 出来事を数える(守備など、目標の画面の外からも呼べる)。st: 球場の id(無ければ全部の合計だけ)
const lsGet = (k, d) => { try { const s = localStorage.getItem(k); return s == null ? d : JSON.parse(s); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 使えない環境 */ } };
export function mkEv(name, n = 1, st = null) {
  const a = lsGet('r4walk.mk.ev.all', {}); a[name] = (a[name] || 0) + n; lsSet('r4walk.mk.ev.all', a);
  if (st) { const s = lsGet('r4walk.mk.ev.' + st, {}); s[name] = (s[name] || 0) + n; lsSet('r4walk.mk.ev.' + st, s); }
}
export function mkEvGet(name, st = null) { return (lsGet(st ? 'r4walk.mk.ev.' + st : 'r4walk.mk.ev.all', {})[name]) || 0; }
if (typeof window !== 'undefined') window.__mkEv = mkEv;
