// 球場の一覧(ここだけで決める)。名前・屋内か・課金かは、ゲーム(main.js・ui.js)とアプリの鍵(shop\gate.js・shop.js)の両方がここを見る。
// id は URL の ?stadium= と localStorage の r4walk.sel.stadium に入る値(変えない)。name はゲームの中の名前(実在の名前は出さない)。
// indoor: 屋根あり(風なし・空の代わりに屋内の照明・観客はプロ風)。roof: 開閉式。desc: 球場を選ぶ画面の 1 行の説明。絵は img/stadium_thumbs/<id>.jpg
export const STADIUMS = [
  { id: 'koshien', name: '浜風の球場', indoor: false, paid: false, product: null, desc: 'ツタの外壁と大きな屋根の、土の内野の野外の球場。浜風が吹く。' },
  { id: 'dome', name: '屋根の球場', indoor: true, paid: true, product: 'bokura_dome', desc: '白い屋根に覆われた屋内の球場。人工芝で風は無い。' },
  { id: 'park', name: '杜ノ丘ボールパーク', indoor: false, paid: true, product: 'bokura_park', desc: '街なかの野外の球場。人工芝で、ナイターが似合う。' },
  { id: 'ring', name: '銀輪ドーム', indoor: true, paid: true, product: 'bokura_ring', desc: '大きな丸い屋根の屋内の球場。広い外野と高いフェンス。' },   // 11/18 4 つ目(仮の名前。商品 ID は案)
  { id: 'railside', name: '汽笛ヶ原ボールパーク', indoor: false, paid: true, product: 'bokura_kiteki', desc: '線路ぞいの左右非対称の野外の球場。天然芝の内野。' },
  { id: 'bowl', name: '灯台坂スタジアム', indoor: false, paid: true, product: 'bokura_minato', desc: '5 m の高い壁に囲まれた港の球場。人工芝。' },
  { id: 'north', name: '観覧車の丘スタジアム', indoor: false, paid: true, product: 'bokura_kanran', desc: '観覧車の見える野外の球場。天然芝と低いフェンス。' },
  { id: 'roof', name: '白樺ルーフパーク', indoor: false, roof: true, paid: true, product: 'bokura_shirakaba', desc: '開く屋根とガラスの壁の球場。昼は開き、ナイターは閉じる。' },
  { id: 'bay', name: '潮凪ドーム', indoor: false, roof: true, paid: true, product: 'bokura_shionagi', desc: '海辺の開く丸い屋根の球場。昼は開き、ナイターは閉じる。' },   // 11/18 9 つ目(仮の名前。開閉式の丸い屋根・人工芝。R17 から開閉(昼は開け、ナイターは閉じる)。商品 ID は案)   // 11/18 8 つ目(仮の名前。開閉式の屋根: 昼は開け、ナイターは閉じる。天然芝。商品 ID は案)   // 11/18 7 つ目(仮の名前。天然芝と黒土・屋外・フェンス 2 m。商品 ID は案)   // 11/18 6 つ目(仮の名前は手順書の案から。高い 5 m の壁・人工芝・屋外。商品 ID は案)   // 11/18 5 つ目(仮の名前。左右非対称・天然芝・屋外。商品 ID は案)
  { id: 'shore', name: '海鳴りスタジアム', indoor: false, paid: true, product: 'bokura_uminari', wind: 1.8, desc: '海のそばの円い野外の球場。海からの強い風がよく吹く。人工芝。' },   // 11/19 10 個目(仮の名前。海辺・円い 2 層・大きなひさしの投光器・人工芝・強い海風。商品 ID は案)
  { id: 'grove', name: '森かげドーム', indoor: true, semi: true, wind: 0.4, paid: true, product: 'bokura_morikage', desc: '森の丘を掘り下げた観客席に丸い屋根を載せた球場。横が開いていて森が見える。' },   // 11/19 森かげ(屋根あり・横が開いている: 風は弱め、音は半分こもる。素材は models/morikage_r*_*)
  { id: 'canal', name: '舟灯ドーム', indoor: true, paid: true, product: 'bokura_funabi', desc: '川ぞいの銀色の丸い屋根の屋内の球場。2 層のスタンドと人工芝。' },   // 11/19 新しい球場(研究の模型 KyoceraDome2026、素材は models/funabi_r*_*。名前・商品 ID は架空)
];
export const STADIUM_NAMES = Object.fromEntries(STADIUMS.map((s) => [s.id, s.name]));
export const stadiumInfo = (id) => STADIUMS.find((s) => s.id === id) || STADIUMS[0];
