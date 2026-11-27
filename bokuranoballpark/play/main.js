// 球場を歩く — 研究モデル R5 を一人称で(手元用。R4 で作り始め、R5 に差し替えた)
// three.js r169 / three-mesh-bvh 0.8.3(どちらも版を固定した CDN)。ビルド不要の素の ES モジュール。
// 座標: x = 一塁側、y = 上、z = 捕手側が +(センターは -z)。本塁の後ろの頂点が原点(R4 の Blender は (x, z, -y))。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { hookScene } from './js/hidskip.js';   // 11/25 軽く
import { memGuard } from './js/memguard.js';   // 11/26 記憶の見張り(描く所が失われた時・前の起動が落ちた時・球場を替える前の片付け)
import { Sound } from './js/audio.js';
import { Replay } from './js/replay.js';
import { KIT } from './js/figures.js';
import { Crowd, fixSeatsGen, fixSeatsVisualGen, fixSeatsSideGen, seatDownhillGen } from './js/crowd.js';   // 11/21 席の直しは読み込みの間に少しずつ(固まりの直し)
import { Athlete as Person, loadAthletes, updateAthletes, setAthleteLod, setAthleteDetail } from './js/athletes.js';
import { createGfx, QUALS, QUAL_ORDER, TOUCH_ORDER } from './js/gfx.js';   // 見た目の作り(画質の段・空・影・後処理・材質。docs/画質の引き継ぎ.md)
import { Defense } from './js/defense.js';
import { Play } from './js/play.js';
import { CursorGame } from './js/cursorplay.js';   // 11/20 夜 カーソルで打つ・投げる(打席・マウンド。docs/カーソルで打つ・投げる.md。?oldbat=1 で前の打席・マウンドに戻る)
import { UI } from './js/ui.js';
import { STADIUMS, STADIUM_NAMES, stadiumInfo } from './js/stadiums.js';   // 球場の一覧(名前・屋内・課金はここだけ)
import { fixAds } from './js/adfix.js';   // 看板の字の鏡文字・裏から見た反転を読み込んだ後に直す(11/18。?noadfix=1 で直さない)
import { Scoreboard } from './js/scoreboard.js';   // 球場の中のスコアボード(docs/スコアボードの引き継ぎ.md)
import { Watch } from './js/watch.js';
import { Gimmicks } from './js/gimmicks.js';   // 球場の名物(docs/球場の名物.md。?nogimmick=1 で出さない)
import { FreePlay } from './js/freeplay.js';   // 自由に遊ぶ球場(持つ・投げる・乗り物・売店・着替え…。docs/自由に遊べる球場.md)   // 観戦のモード(試合を見ながら歩く。docs/観戦モードの引き継ぎ.md)
import { Passages } from './js/passages.js';   // 通路口・入場ゲート・ベンチ裏の通路(models/passages.json。docs/通路口と歩きの直し.md)
import { Bench } from './js/bench.js';   // ベンチ(ダグアウト)の人(11/20 夜。docs/ベンチの人.md。?nobench=1 で出さない)
import { Wayfind } from './js/wayfinding.js';   // 小さな地図と入口への矢印(歩く時)
import { WarpGen, WARP_GROUPS } from './js/warpgen.js';   // 11/22 ワープ先を当たり判定から全部の球場で作る・組に分ける・地図で押した所へ飛ぶ
import { HudPrefs } from './js/hudprefs.js';   // 11/22 画面に出すもの(一時停止で項目ごとに出す/出さない)
import { Mokuhyo } from './js/mokuhyo.js';   // 11/21 目標と道案内・はじめの案内・観戦のしかた(「ボールパークで過ごす」「球場を歩く」。?nomokuhyo=1 で入れない)
import { PropSolids } from './js/propsolid.js';   // 11/22 夜 ゲームの側で置いた物(売店の台・自販機・トイレの棟など)を歩く時の当たり判定に(?nosolid=1 で無し)
import { fixMenus } from './js/menufix.js';   // 売店のメニューの板から値段を消す(浜風・11/19 から屋根の球場の看板も)
import { fixBreaks, fixBreaksLate, applyNight as breakNight } from './js/breakfix.js';
import { splitSectors } from './js/litesplit.js';   // 11/21 共通: スマホで読む interior.glb を向きで区切る(遠くを描かない仕組みを効かせる)
import { loadFallGuard, fallGuardGeometry, FieldFall } from './js/fallguard.js';   // 11/21 見えない床と柵・グラウンドへ降りても戻さない・E でよじ登る/降りる(?nofg=1 で前の形)   // 白く飛ぶ床・ちらつく重なりを球場ごとの表で直す(11/19。?nobreakfix=1 で直さない。docs/崩れの点検.md)

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
if (params.has('debug')) document.body.classList.add('debug');   // 計測の字(一時停止の fps など)は ?debug の時だけ
// 球場: koshien(浜風の球場)/ dome(屋根の球場)
// 球場の名前(ゲームの中の名前はここだけで決める。実在の名前は出さない)
const STADIUM = (() => { const ok = (v) => (STADIUMS.some((x) => x.id === v) ? v : 'koshien'); const q = params.get('stadium'); if (q) return ok(q); try { const s = JSON.parse(localStorage.getItem('r4walk.sel') || '{}'); return ok(s.stadium); } catch (e) { return 'koshien'; } })();
const PARK = STADIUM === 'park';   // 3 つ目の球場(野外・人工芝。素材は models/jingu_r*_*、版は PARK_PRE だけ替える)
const PARK_PRE = params.has('park_r21') ? 'jingu_r21_' : params.has('park_r6') ? 'jingu_r6_' : params.has('park_r5') ? 'jingu_r5_' : params.has('park_r4') ? 'jingu_r4_' : params.has('park_r3') ? 'jingu_r3_' : params.has('park_r9') ? 'jingu_r9_' : params.has('park_r11') ? 'jingu_r11_' : params.has('park_r12') ? 'jingu_r12_' : params.has('park_r13') ? 'jingu_r13_' : params.has('park_r14') ? 'jingu_r14_' : params.has('park_r15') ? 'jingu_r15_' : params.has('park_r16') ? 'jingu_r16_' : params.has('park_r17') ? 'jingu_r17_' : params.has('park_r18') ? 'jingu_r18_' : params.has('park_r19') ? 'jingu_r19_' : params.has('park_r20') ? 'jingu_r20_' : 'jingu_r22_';   // 11/21 昼 R22(持ち主「甲子園以外の球場良い感じに作りこんで もっと詳細に」): コンコースの天井と壁を写真の白〜クリームに・スタンドの梁と配管・蛍光灯・入口の内側の青い縦の幕と吊りの案内と画面・壁の扇風機と自販機と消火栓と係の扉・外野の下の通路の壁・外の大きな幕と案内図と植え込み・外の壁の切れ目のない当たり判定・スマホは材質をまとめた lite_interior.glb。?park_r21=1 で前の R21。   // 11/21 夜 R21: 入口 1〜18 を本物の位置(公式の図)に・中のコンコースを歩ける(天井と内の壁を当たり判定に)・外野の下の売店・入口の列の柵と手荷物の机。?park_r19=1 で前の R19。   // 11/19 作り込みC: R19(ベンチを開けて中を作り込み・売店 1 店ずつ)。?park_r18=1 で前の R18。 // 杜ノ丘 R16(11/18 夜 コンコースと席の作り込み)。?park_r15=1 で前の R15。   // ?park_r14=1・?park_r13=1・?park_r12=1・?park_r11=1・?park_r9=1・?park_r6=1(・r5・r4・r3)で前の版(interior.glb は守備では読まない)
const DOME = STADIUM === 'dome';
const CANAL = STADIUM === 'canal';   // 10 個目の球場(舟灯ドーム: 動かない丸い屋根・2 層のスタンド・人工芝。素材は models/funabi_r*_*、銀輪と同じ読み方)
const CANAL_PRE = params.has('canal_r6') ? 'funabi_r6_' : params.has('canal_r5') ? 'funabi_r5_' : params.has('canal_r3') ? 'funabi_r3_' : params.has('canal_r2') ? 'funabi_r2_' : params.has('canal_r4') ? 'funabi_r4_' : params.has('canal_r7') ? 'funabi_r7_' : 'funabi_r8_';   /* 舟灯 R8(11/21 昼 持ち主「甲子園以外の球場 もっと詳細に」): 4 階の車いす席(公式の座席図の角度、薄茶の床・黄色い区画・真鍮の手すり)、2 階のモール(外野の側の地面の高さ、南口・店 12・ラウンジ・ロッカー・トイレ)、3 階と 5 階の階段をエレベーターの横へ(17・8 通路前の店を本物の場所に)、壁の消火栓・非常口・掲示・案内図・時計・防犯カメラ、デッキの喫煙所(1・6・10・11 ゲート外)、ネット裏の水色の席、当たり判定の二重を外した。?canal_r7=1 で前の R7 */   /* 舟灯 R7(11/21 持ち主「コンコース・入口・トイレを写真を見て徹底再現」): 公式フロアガイドの売店 3F 16・5F 9 の並びと名前の看板、トイレの棟 21(男女・多目的・目隠しの壁・中)、エレベーター・授乳室・案内所・自販機、吊りの案内、灯り 2 m ごと、ゲートの前の列の柵と手荷物検査、スマホは材質をまとめた lite_interior.glb。?canal_r4=1 で前の既定 R4 */
const RING = STADIUM === 'ring' || CANAL;   // 4 つ目の球場(大きな丸い屋根・人工芝。素材は models/nagoya_r*_*、版は RING_PRE だけ替える。?ring_r2=1 で前の R2)
const RING_PRE = CANAL ? CANAL_PRE : params.has('ring_r22') ? 'nagoya_r22_' : params.has('ring_r21') ? 'nagoya_r21_' : params.has('ring_r20') ? 'nagoya_r20_' : params.has('ring_r18') ? 'nagoya_r18_' : params.has('ring_r2') ? 'nagoya_r2_' : params.has('ring_r9') ? 'nagoya_r9_' : params.has('ring_r11') ? 'nagoya_r11_' : params.has('ring_r12') ? 'nagoya_r12_' : params.has('ring_r14') ? 'nagoya_r14_' : params.has('ring_r15') ? 'nagoya_r15_' : params.has('ring_r16') ? 'nagoya_r16_' : params.has('ring_r17') ? 'nagoya_r17_' : params.has('ring_r18') ? 'nagoya_r18_' : params.has('ring_r19') ? 'nagoya_r19_' : params.has('ring_r20') ? 'nagoya_r20_' : 'nagoya_r23_';   /* 銀輪 R23(11/21 昼 持ち主「甲子園以外の球場良い感じに作りこんで もっと詳細に」): 3F の横丁(屋台 8・卓といす・ちょうちん・男女のトイレ)と 2F→3F の階段・エスカレーター・3F→4F の階段、4F からプライム席への口、エスカレーターの段・手すり、明るい鏡、駅への屋根つき通路とスロープ・デッキの街灯、2F・5F の何も無い壁にポスター・幕・消火栓・自販機・長いす・時計。?ring_r22=1 で前の版 */   /* 銀輪 R22(11/21 夜 持ち主「コンコース・入口・トイレを写真を見て徹底再現」): ゲート 1〜8 を公式 2F の図の角度に(胴のガラスを切った口・歓迎の帯)、1 ゲートの前の広場と大階段・エスカレーター・膜の屋根、2F のトイレの棟 6(男女の口 12・中の個室と小便器と洗面台)・授乳室・喫煙所・案内所・エレベーター・エスカレーター・線の灯り、4F のプライム席の後ろの通路、5F のトイレの目隠しと喫煙所。スマホは lite_interior.glb。?ring_r21=1 で前の版 */   /* 銀輪 R21(11/19 午後 作り込みF): 5 階の店 9→27・壁の掲示と化粧板・トイレ・AED・天井のダクトとスプリンクラー、2 階の壁と天井。?ring_r20=1 で前の版 */   /* 銀輪 R19(11/19 作り込み B: 売店 1 店ずつ・ダグアウトを開けた・床のタイル・裏の下の床)。?ring_r18=1・?ring_r17=1 で前の版 */   // 銀輪 R16(11/18 夜 コンコースと席の作り込み)。?ring_r15=1 で前の R15    // ?ring_r14=1・?ring_r12=1・?ring_r11=1・?ring_r9=1 で前の版
const GROVE = STADIUM === 'grove';   // 森かげドーム(丸い屋根・横が開いている・人工芝。素材は models/morikage_r*_*)
const GROVE_PRE = params.has('grove_r3') ? 'morikage_r3_' : params.has('grove_r5') ? 'morikage_r5_' : params.has('grove_r7') ? 'morikage_r7_' : params.has('grove_r8') ? 'morikage_r8_' : params.has('grove_r9') ? 'morikage_r9_' : params.has('grove_r10') ? 'morikage_r10_' : params.has('grove_r11') ? 'morikage_r11_' : 'morikage_r12_';   /* 森かげ R12(11/21 昼 持ち主「もっと詳細に」): 方位を直した(OSM の入口の点と L-train を場内マップに合わせ 20 → -31 度)本物のゲートの一帯(緑の波板の屋根と銀の字・れんがの柱 28 レーン・れんがのアーケードのチケット・チームストア・あそび場の丸屋根・電車・獅子ビルの画面・駅前の屋台・れんがの輪)、本塁の後ろの左右の開削の中段コンコース(店 4・トイレ 男女・多目的・授乳室・エレベーター・階段)、外周の鉄骨の屋根と液晶の画面。?grove_r11=1 で前の版 */   /* 森かげ R11(11/21 持ち主「徹底的に再現」): センターの後ろの広場の外のメインゲート(28 レーン)とサブゲート・ゲートの中の広場(チームストア・れんがの輪・あそび場・救護室)・外の大いすと屋台の並び・本物の角度のトイレ 7 棟(中まで)・授乳室・加熱式たばこの喫煙所・デッキ・向きの札。?grove_r10=1 で前の版 */   /* 森かげ R10(作り込みE): 売店 45 を 1 店ずつ中身まで(kit3d)。?grove_r9=1 で前の版 */   /* 森かげ R9(11/19 午後 作り込みE): 外の店の棟の作り直し・周りの建物の窓・駅のホームの屋根と駅前・V 字の柱の足・森の側の木の羽板・ベンチの中身と床の下の板。?grove_r8=1 で前の版 */   // 森かげ R8(11/19 方位を直し、名前の板・旗・灯りの帯・店の道具・吊った案内、ラウンジの入口を広げた)。?grove_r7=1・?grove_r5=1・?grove_r3=1 で前の版
const RAIL = STADIUM === 'railside';   // 5 つ目の球場(線路ぞい・左右非対称・天然芝・屋外。素材は models/hiroshima_r*_*。?rail_r9=1 で前の R9)
const BAY = STADIUM === 'bay';   // 9 つ目の球場(開閉式の丸い屋根・人工芝。素材は models/fukuoka_r*_*)
const ROOFPARK = STADIUM === 'roof' || BAY;   // 開閉式の屋根の球場(白樺・潮凪)   // 8 つ目の球場(開閉式の屋根・天然芝。素材は models/escon_r*_*。屋根は昼は開け、ナイターは閉じる)
const ROOF_PRE = BAY ? (params.has('bay_r27') ? 'fukuoka_r27_' : params.has('bay_r26') ? 'fukuoka_r26_' : params.has('bay_r25') ? 'fukuoka_r25_' : params.has('bay_r22') ? 'fukuoka_r22_' : params.has('bay_r16') ? 'fukuoka_r16_' : params.has('bay_r17') ? 'fukuoka_r17_' : params.has('bay_r18') ? 'fukuoka_r18_' : params.has('bay_r19') ? 'fukuoka_r19_' : params.has('bay_r20') ? 'fukuoka_r20_' : params.has('bay_r21') ? 'fukuoka_r21_' : params.has('bay_r23') ? 'fukuoka_r23_' : params.has('bay_r24') ? 'fukuoka_r24_' : params.has('bay_r25') ? 'fukuoka_r25_' : 'fukuoka_r28_')   /* 潮凪 R28(11/21 昼 持ち主「甲子園以外の球場良い感じに作りこんで もっと詳細に」): 固定の店 29 を公式の GATE と通路の番号の所に・ほかの枠はワゴン 24、壁の映像モニター 68、ゲートの中の床の応援の字、トイレを観戦記の通路(1・6・10・27〜30・4〜5 GATE の間)に、上の階の席(5F・6F)の後ろの壁(化粧板・非常口・区画の番号)と階段の上のロビー、TOP GATE と 4 階の店の窓、デッキのチームストア・だれでもトイレ・街灯・植え込み・案内図。?bay_r27=1 で前の版 */   /* 潮凪 R27(11/21 持ち主「コンコース・入口・トイレを写真を見て徹底再現」): 入場ゲート 8 の外(柱・番号の帯・ひさし・壁画・傘袋・手荷物の机・列の柵)と中の吊り「出口」、トイレ(3F の内の壁に男女 9 組・だれでもトイレ 3・授乳室 2、公式 FAQ の通路の前)、デッキのトイレの棟 3・喫煙所 5・ロッカー 4、通路の番号 1〜32。スマホは材質をまとめた lite_interior.glb。?bay_r26=1 で前の版 */   /* 潮凪 R26(11/19 午後 作り込みF): 内の壁の掲示と化粧板・天井のダクトとスプリンクラー・吊りの画面・柱巻きの画面、裏の通路の巾木のちらつき。?bay_r25=1 で前の版 */   /* 潮凪 R25(R24 + 通路に出る立て看板・ベルトの柵をやめ、卓とごみ箱を壁ぞいへ。歩く試験 76/76)。R24(11/19 作り込み B: 売店 1 店ずつ・ダグアウト・床のタイル・画面の前の柱を除く・ベンチの奥の屋根の板)。?bay_r23=1・?bay_r22=1・?bay_r21=1 で前の版 */ : (params.has('roof_r11') ? 'escon_r11_' : params.has('roof_r12') ? 'escon_r12_' : params.has('roof_r13') ? 'escon_r13_' : params.has('roof_r14') ? 'escon_r14_' : params.has('roof_r15') ? 'escon_r15_' : params.has('roof_r16') ? 'escon_r16_' : params.has('roof_r17') ? 'escon_r17_' : params.has('roof_r18') ? 'escon_r18_' : params.has('roof_r19') ? 'escon_r19_' : params.has('roof_r21') ? 'escon_r21_' : 'escon_r22_');   /* 白樺 R22(11/21 2 回目の作り込み): 外野の通路の縁をなめらかに・床のタイル、通路と外野席の壁の間の暗い隙間を広間に(化粧板・柱・灯り)と外野席への口 4、上の階の暗い壁(非常口・消火栓・時計・自販機・掲示板・売店)、醸造所の中(釜・カウンター)、外の広場(波の舗装・木・街灯・案内図)と「11」の壁。?roof_r21=1 で前の版 */   /* 白樺 R21(11/21 持ち主「コンコース・入口・トイレを写真を見て徹底再現」): 2F の通路を外野まで一周(白木の天井・直線の灯り・ガラスの壁・売店 12・トイレの棟)、ゲート G1〜G6 を公式の地図の角度に、トイレ 6 を公式 2F フロアマップの角度に、天井の地を白木に。スマホは材質をまとめた lite_interior.glb。?roof_r19=1 で前の版 */   /* 白樺 R19(11/19 午後 作り込みE): 店の枠を 2 店ずつ(20 → 40、横丁 10 店)、横丁の瓦のひさし・ちょうちんの列・名前の門、木の梁・スプリンクラー・感知器・誘導灯の天井、木張りの柱。?roof_r18=1 で前の版 */   /* 白樺 R18(11/19 午前 作り込みA): 床の絵・壁の物・トイレ・通路口の番号・横丁の卓・外周。?roof_r17=1 で前の版 */   /* 白樺 R17(11/19 朝 作り込みA): 売店 1 店ずつ・本物どおりのベンチ。?roof_r16=1 で前の版 */   // 潮凪: R20(11/18 夜 コンコースと席の作り込み、docs\作り込みの基準(浜風).md)。?bay_r19=1・?bay_r18=1・?bay_r17=1 で前の版。白樺: R12(同じ夜の作り込み)、?roof_r11=1 で前の R11、?bay_r16=1 で開けた形の無い R16
const BAY_OPEN = BAY && ROOF_PRE !== 'fukuoka_r16_';   // 潮凪 R17: 開けた時は roof_movable を隠し、当たり判定は collision_open.glb
let roofClosed = false, roofNode = null, roofOpenScene = null, bvhClosed = null, bvhOpen = null;
const NORTH = STADIUM === 'north';   // 7 つ目の球場(天然芝と黒土・屋外・フェンス 2 m。素材は models/sendai_r*_*)
const NORTH_PRE = params.has('north_r8') ? 'sendai_r8_' : params.has('north_r9') ? 'sendai_r9_' : params.has('north_r10') ? 'sendai_r10_' : params.has('north_r11') ? 'sendai_r11_' : params.has('north_r12') ? 'sendai_r12_' : params.has('north_r13') ? 'sendai_r13_' : params.has('north_r14') ? 'sendai_r14_' : 'sendai_r15_';   // 11/21 昼 R15(持ち主「もっと詳細に」): 外の柵のエントランスを本物の赤い格子の門に・チケットはエントランスで確かめる(スタンドの GATE は開いたまま)・外の壁をえんじの波板とれんがに・外周の舗装・外野の裏の赤い柱・スタメンの板・グルメの立て看板・コンコースのれんがと緑の柱と貼り紙・ちょうちん。?north_r14=1 で前の R14    // 11/21 R14(持ち主「入場ゲートから…徹底再現」): 外の柵とエントランス 5・柵の中の広場(キッチンカー・屋台・場外のトイレ 3・喫煙所 2・授乳室)・本塁の後ろの広間(天井・灯り・案内・机)・コンコースの吊りの案内。?north_r12=1 で前の R12(?north_r13=1 は作り込みE だけの R13)   // 11/19 作り込みC: R12(ベンチを開けて中を作り込み・売店 1 店ずつ)。?north_r11=1 で前の R11。 // 観覧車の丘 R10(11/19 店の名前の看板・厨房の絵・シャッターを減らした)。?north_r9=1・?north_r8=1 で前の版
const SHORE = STADIUM === 'shore';   // 10 個目の球場(海鳴りスタジアム: 海辺・円い 2 層・人工芝・強い海風。素材は models/uminari_r*_*。研究模型 (手元の資料))
const SHORE_PRE = params.has('shore_r16') ? 'uminari_r16_' : params.has('shore_r15') ? 'uminari_r15_' : params.has('shore_r14') ? 'uminari_r14_' : params.has('shore_r12') ? 'uminari_r12_' : 'uminari_r17_';   // 11/21 昼 R17(2 回目の作り込み): R・L ゲートを外野の外の階段の上へ(公式: 外野席の入口)・内野のコンコースの両端から外野のデッキへ場内の通路・ゲートの色の帯と黒い板・天井の四角い板とスポットの灯り・吊りの画面・ベビーケアの箱(211・412)とキッズの広場・外野の店のまわり・駐輪場。?shore_r16=1 で前の R16   // 11/21 夜 R16: ゲートを本物の B・C・D・F・R・L と球場正面(1 階の入口の広間)に、通路口の番号を本物の向き(一塁側の端が 201)、トイレの棟(男女・多目的・授乳室)、スマホ用の中の殻(lite_interior.glb)。?shore_r14=1 で前の既定 R14・?shore_r15=1 で R15
const BOWL = STADIUM === 'bowl';   // 6 つ目の球場(5 m の壁・人工芝・屋外。素材は models/yokohama_r*_*)
const BOWL_PRE = params.has('bowl_r9') ? 'yokohama_r9_' : params.has('bowl_r11') ? 'yokohama_r11_' : params.has('bowl_r12') ? 'yokohama_r12_' : params.has('bowl_r13') ? 'yokohama_r13_' : params.has('bowl_r14') ? 'yokohama_r14_' : params.has('bowl_r15') ? 'yokohama_r15_' : params.has('bowl_r16') ? 'yokohama_r16_' : params.has('bowl_r17') ? 'yokohama_r17_' : 'yokohama_r18_';   /* 11/21 昼 R18(2 回目の作り込み): 外の壁を白と紺の帯の絵に、外周のれんが敷き・デッキの下の灯りと案内板・エレベーターの扉、外野の 1 階の通路を 26〜31 まで延ばし両端から 2 階の帯の端へ上がる中の階段、外野の真ん中のセンターゲート、外野の店 3・トイレの入口 2、2F の消火栓・非常口・吊りの案内・時計・掲示板・充電スタンド・カメラ・スピーカー。スマホは材質をまとめた lite_interior.glb。?bowl_r17=1 で前の R17 */   // 11/21 夜 R17: 内野のコンコースを本物どおり 2 階(5.5 m、Y デッキと同じ高さ)へ・トイレの部屋・外の階段とスロープ(研究模型 tools/ys_conc2f.py)。?bowl_r15=1 で前の R15   // 11/19 作り込みC: R15(ベンチを開けて中を作り込み・売店 1 店ずつ)。?bowl_r14=1 で前の R14。 // 灯台坂 R12(11/18 夜 コンコースと席の作り込み)。?bowl_r11=1 で前の R11   // ?bowl_r9=1 で前の R9
const RAIL_PRE = params.has('rail_r9') ? 'hiroshima_r9_' : params.has('rail_r10') ? 'hiroshima_r10_' : params.has('rail_r11') ? 'hiroshima_r11_' : params.has('rail_r12') ? 'hiroshima_r12_' : params.has('rail_r13') ? 'hiroshima_r13_' : params.has('rail_r14') ? 'hiroshima_r14_' : params.has('rail_r15') ? 'hiroshima_r15_' : params.has('rail_r16') ? 'hiroshima_r16_' : params.has('rail_r17') ? 'hiroshima_r17_' : params.has('rail_r18') ? 'hiroshima_r18_' : params.has('rail_r19') ? 'hiroshima_r19_' : params.has('rail_r20') ? 'hiroshima_r20_' : params.has('rail_r21') ? 'hiroshima_r21_' : params.has('rail_r22') ? 'hiroshima_r22_' : params.has('rail_r23') ? 'hiroshima_r23_' : 'hiroshima_r24_';   /* R24(11/21 昼 持ち主「甲子園以外の球場良い感じに作りこんでください もっと詳細に」): 売店の並びを公式のコンコースマップに(一塁側の外の縁に多く、左翼の外野は無い。一塁側の間に店を 4 つ足した)、授乳室 2(扉を開けた入れる部屋: ソファー・ベビーベッド・おむつ替え台・手洗い・カーテン)・喫煙所、店とトイレの棟の上を天井まで壁で埋めた(架空の広告・時計)、トイレの横の自販機と分別、ざしき席・メインゲートの橋のブリッジ席・パーティーデッキ・バーベキューテラス、プロムナードの青灰色の床と縦格子の手すり・旗の街灯、左翼のトイレの棟を -84 度へ。スマホは材質をまとめた lite_interior.glb。?rail_r23=1 で前の R23 */   /* R23(11/21 持ち主「コンコース・トイレ・入場ゲートを現場の写真どおりに」): 公式のトイレマップ 3F の 7 か所にトイレの棟 8(赤茶の壁・青い男子と赤い女子の帯・白い入口)、吊りの案内 20、ゲート A・B・C の外に看板・列の柵・手荷物の机・テント、外野の灯りの柱。?rail_r22=1 で前の R22 */   /* R22(11/19 午後 作り込みE): 内野の場面の側の手すり・立ち見のカウンター・食べる卓といすを当たり判定にも入れ(絵には出ない COLLONLY_)、席への道の口の前の手すりを切った。connect_test --walk 68/68。?rail_r21=1 で R21 */   /* R21(11/19 午後 作り込みE): 上の段の裏に沿った天井(梁・LED の線・ケーブルの棚・スピーカー・カメラ・誘導灯・点検口・目地)、柱を裏まで伸ばし Y 字の腕・番号の板 3 面、寝そべる席をマットの形に。?rail_r20=1 で前の版 */   /* R20(11/19 昼 作り込みA): 外の地面の板の穴・席の点検・メインゲートのプロムナード・列車を 1 両ずつ。?rail_r19=1 で前の版 */   /* R19(11/19 午前 作り込みA): 外の縁の壁・トイレ・掲示・AED・分別のごみ箱・食べる卓・通路口の番号・外周。?rail_r18=1 で前の版 */   /* R18(11/19 朝 作り込みA): 売店 1 店ずつの中身・本物どおりのベンチ。?rail_r17=1 で前の版 */   // 汽笛ヶ原 R12(11/18 夜 コンコースと席の作り込み)。?rail_r11=1 で前の R11   // ?rail_r10=1・?rail_r9=1 で前の版
const INDOOR_ST = stadiumInfo(STADIUM).indoor;   // 屋根あり(風なし・屋内の照明・観客はプロ風)
const IS_TOUCH = params.has('touch') ? params.get('touch') === '1'
  : (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 使えない環境 */ } };
const load = (k, d) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : d; } catch (e) { return d; } };

// ---------------------------------------------------------------- 描画の土台
const canvas = $('view');
// 画質(最高/高画質/標準/軽量)。初めは PC が高画質・スマホが軽量。選んだ物は覚える。?q= で決められる
let quality = (() => { const q = params.get('q') || load('r4walk.q2', null); if (!params.has('q') && (IS_TOUCH ? !TOUCH_ORDER.includes(q) : q === 'auto')) return IS_TOUCH ? 'auto' : 'std'; return QUALS[q] ? q : (IS_TOUCH ? 'auto' : 'std'); })();   // 11/19 スマホ対応: スマホの初めは「自動」。前に最高・高画質を選んで覚えていても、スマホでは自動に戻す(docs/スマホ対応の引き継ぎ.md)
const LITEQ = (q) => q === 'lite' || q === 'auto' || (q === 'std' && IS_TOUCH && !params.has('touchfull'));   // 11/26 記憶: スマホの「標準」も lite の模型(重い模型と 4096 の影で 1.4GB を超え、iOS で落ちる。?touchfull=1 で前の形)
//   // 自動も模型は軽量と同じ lite の glb(中の建物は読まない)   // PC の初めは「標準」(11/18 持ち主「Chrome ちょっと重い」。高画質・最高は選んだ人だけ、選んだ段は覚える)
const NO_IN = (q) => LITEQ(q) && params.has('nolitein');   // 11/21 共通: スマホ(軽量・自動)でも中の建物 interior.glb を読む(コンコース・売店・トイレの道)。?nolitein=1 で前の形(読まない)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(QUALS[quality].pr(devicePixelRatio || 1, IS_TOUCH));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
hookScene(scene);   // 11/25 軽く: 隠れている人の行列を毎こま計算しない(js/hidskip.js)
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.08, 6000);
camera.rotation.order = 'YXZ';
scene.fog = new THREE.Fog(0xcfe0ee, 450, 3000);

const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, near: 10, far: 900 });
const CENTER = new THREE.Vector3(0, 0, -45);
sun.target.position.copy(CENTER);
scene.add(sun, sun.target);
const gfx = createGfx({ renderer, scene, camera, sun, hemi, dome: INDOOR_ST, touch: IS_TOUCH, shot: params.has('shot'),
  autoStore: { get: () => load('r4walk.autoLv', null), set: (v) => store('r4walk.autoLv', v) },   // 自動の段は覚えて、次はそこから始める
  onAuto: (Q) => setAthleteLod(Q.lod),
  openView: () => { try { return mode !== 'walk' || (player.pos.y < 0.8 && Math.hypot(player.pos.x, player.pos.z + 45) < 110) || nearestSeat(4) >= 0; } catch (e) { return true; } } });   // 席・グラウンドにいる時は、屋内の物を近くだけ描く
setAthleteDetail(gfx.fabric, 0);
gfx.setQuality(quality);
const nightLights = [];
let glowSprites = null;

// R3 以降は航空写真の地面と周りの建物がモデルに入っているので、町の箱は作らない

// ---------------------------------------------------------------- 時間帯
const TIMES = {
  day: { label: '昼', top: 0x3f78bd, horizon: 0xd3e2ee, bottom: 0x8f8a80, sunColor: 0xfff3df, sun: 3.1,
    sunPos: [0.38, 0.78, -0.5], hemiSky: 0xc4dcf2, hemiGround: 0x7a6d58, hemi: 1.15, env: 0.35, exposure: 0.92,
    spots: 0, flood: 0, glow: 0, outside: 1, fog: 0xcfdeea, sunGlow: 0.4, shadow: true },
  night: { label: 'ナイター', top: 0x04060c, horizon: 0x1b2436, bottom: 0x0b0d10, sunColor: 0xdfe6f2, sun: 0.5,
    // 11/18 画質: sun は照明塔の光をまとめた真上寄りの弱い光(選手の足元の影のため。光源は増やさない)
    sunPos: [-0.15, 1, 0.25], hemiSky: 0x5a6a90, hemiGround: 0x2a241c, hemi: 0.75, env: 0.14, exposure: 1.0,
    spots: 1, flood: 6, glow: 1, outside: 0.28, fog: 0x161d2a, sunGlow: 0, shadow: false },
};
if (PARK || RAIL || BOWL || SHORE || NORTH || ROOFPARK) {
  // 野外の 3 つ目・5〜8 つ目の球場: 照明塔は光源にしない(灯具が光るだけ)。夜は上からの光と半球の光で照らす(光源は増やさない)
  TIMES.night = { ...TIMES.night, sun: 2.0, sunColor: 0xfff3e0, sunPos: [0.05, 1, -0.05], hemiSky: 0xaab6cc, hemiGround: 0x34332f, hemi: 0.75, env: 0.28, spots: 0, flood: 6, glow: 0, shadow: false };
}
if (INDOOR_ST) {
  // 屋内: 太陽の影なし、上からほぼ真下の光。値はドームを歩くゲームの LIGHTS と同じ
  TIMES.day = { label: '昼', top: 0x4f86c6, horizon: 0xd8e6f0, bottom: 0x9a978f, sunColor: 0xfffaf0, sun: 1.15, sunPos: [0.18, 1, 0.12],
    hemiSky: 0xfff8ec, hemiGround: 0x8c917e, hemi: 2.2, env: 0.55, exposure: 1.0, spots: 0, flood: 0.15, glow: 0, outside: 1, fog: 0xd3e0ea, sunGlow: 0, shadow: false };
  TIMES.night = { label: '試合の照明', top: 0x05070d, horizon: 0x1c2436, bottom: 0x0d0f12, sunColor: 0xfff3e0, sun: 2.1, sunPos: [0.05, 1, -0.05],
    hemiSky: 0xaab6cc, hemiGround: 0x34332f, hemi: 0.62, env: 0.25, exposure: 1.0, spots: 1, flood: 6.0, glow: 0, outside: 1, fog: 0x141a26, sunGlow: 0, shadow: false };
}
let timeKey = 'day';
const floodMats = [];
const nightLiftMats = [];   // 夜だけ少し光らせる席・屋根の材質
const outsideMats = [];
const soilMats = [];
// 開閉式の屋根(白樺ルーフパーク): 閉じると屋内(風なし・響く音)、開けると野外。当たり判定も入れ替える
function applyRoof(closed) {
  if (!ROOFPARK) return;
  roofClosed = !!closed || !roofOpenScene;   // 開けた形のファイルが無い球場(潮凪 R16)は閉じたまま
  if (roofNode) roofNode.visible = roofClosed;
  if (roofOpenScene) roofOpenScene.visible = !roofClosed;
  if (bvhClosed) bvh = roofClosed ? bvhClosed : bvhOpen;
  try { if (defense && defense.world) defense.world.bvh = bvh; if (play && play.world) play.world.bvh = bvh; } catch (e) { /* 読み込み前 */ }
  try { if (sound && sound.setIndoor) sound.setIndoor(roofClosed); } catch (e) { /* 読み込み前 */ }
}
function setTime(key) {
  if (!TIMES[key]) key = 'day';   // 11/20 持ち主「夕方は要らない」: 時間帯は昼とナイターだけ。前に覚えた夕方(evening)・知らない値は昼
  timeKey = key;
  breakNight(key === 'night');   // js/breakfix.js: 夜だけ暗くする材質
  applyRoof(key === 'night');   // 白樺ルーフパーク: ナイターは屋根を閉じる
  if (passages) passages.setNight(key === 'night');
  const t = TIMES[key];
  const sd = new THREE.Vector3(...t.sunPos).normalize();
  sun.color.set(t.sunColor); sun.intensity = t.sun;
  sun.position.copy(CENTER).addScaledVector(sd, 450);
  gfx.setTime(t, key);   // 空・環境の光・影・ブルーム
  hemi.color.set(t.hemiSky); hemi.groundColor.set(t.hemiGround); hemi.intensity = t.hemi;
  scene.environmentIntensity = t.env;
  renderer.toneMappingExposure = t.exposure;
  scene.fog.color.set(t.fog);
  for (const s of nightLights) { s.intensity = s.userData.base * t.spots; s.visible = t.spots > 0; }
  for (const m of floodMats) m.emissiveIntensity = t.flood;
  // 夜の持ち上げ: 材質の色そのものを弱く光らせる(昼は 0)
  const lift = t === TIMES.night ? 0.32 : 0;
  NIGHT_K.value = key === 'night' ? 1.1 : 0;   // 甲子園 R10 の焼き込んだ夜の光
  for (const m of nightLiftMats) { if (lift > 0) { m.emissive.copy(m.color).multiplyScalar(lift); m.emissiveIntensity = 1; } else { m.emissive.setRGB(0, 0, 0); } if (m.emissiveMap == null && m.map) m.emissiveMap = m.map; m.needsUpdate = true; }
  if (glowSprites) { glowSprites.visible = t.glow > 0; glowSprites.material.opacity = t.glow; }
  for (const m of outsideMats) m.color.copy(m.userData.baseColor).multiplyScalar(t.outside);
  // 土: ナイターは水をまいた直後(色に線形 0.61、粗さ 0.70)。昼は乾いた土(粗さ 0.92)
  for (const m of soilMats) { const wet = key === 'night'; m.color.copy(m.userData.baseColor).multiplyScalar(wet ? 0.61 : 1); m.roughness = wet ? 0.70 : 0.92; }
  document.querySelectorAll('#times .btn').forEach((b) => b.classList.toggle('on', b.dataset.k === key));
  if (typeof sound !== 'undefined' && sound.setTimeOfDay) sound.setTimeOfDay(key);
}

// ---------------------------------------------------------------- 読み込み
const draco = new DRACOLoader().setDecoderPath('./vendor/three/examples/jsm/libs/draco/gltf/');
const gltfLoader = new GLTFLoader().setDRACOLoader(draco);
const progress = {};
// 11/21 持ち主「始めたときのローディングでスマホもPC版もそうだけど画面が固まる事があります なくして」(tools/loadfreeze.py で測った):
// 固まりの元は (1) 読み込みの途中もタイトルの裏で 3D を描いていて、描くたびに絵の作り(シェーダー)を主スレッドで待っていた(PC で 1 回 2〜3 秒)
// (2) 通路の切り抜き・当たり判定の BVH・観客の席の直し(数万の席に光線)が 1 つの長い仕事で続いていた(スマホ相当で 9〜14 秒)
// 直し: 読み込みの間は描かない(タイトルの絵で隠れている)。重い作りの間で 1 こま譲る(breathe)。席の直しは少しずつ(slice)。
// 最後に絵の作りを compileAsync で GPU の裏で済ませ、テクスチャも少しずつ上げる。?noloadfix=1 で前の形
const LOADFIX = !params.has('noloadfix');
let loadBusy = LOADFIX;   // 読み込み中は frame() で描かない
// 譲り方: 前の描画から 50 ms 以上たっていたら次のこまを待って描かせる(進み具合の棒が動く)。そうでなければ、すぐ戻る短い譲り(MessageChannel。入力・描画の割り込みだけ通す)。
// 毎回こまを待つと、スマホ相当で待ちの合計が数秒増えた(屋根の球場 21 秒 → 27 秒)
let lastPaint = performance.now();
if (LOADFIX) { const tick = () => { lastPaint = performance.now(); if (loadBusy) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
const _mc = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null, _mq = [];
if (_mc) _mc.port1.onmessage = () => { const f = _mq.shift(); if (f) f(); };
function breathe() {   // 譲る。隠れたタブでも止まらないよう setTimeout でも進める
  if (!LOADFIX) return Promise.resolve();
  if (_mc && performance.now() - lastPaint < 50) return new Promise((res) => { _mq.push(res); _mc.port2.postMessage(0); });
  return new Promise((res) => { let d = false; const f = () => { if (!d) { d = true; res(); } }; requestAnimationFrame(() => setTimeout(f, 0)); setTimeout(f, 80); });
}
const loadMarks = []; window.__loadMarks = loadMarks;   // 試験用: 読み込みの段ごとの時刻(tools/loadfreeze.py)
function loadMark(k) { loadMarks.push([k, Math.round(performance.now())]); }
async function slice(gen, budget = 40) {   // ジェネレーターを、40 ms ごとに譲りながら最後まで回す
  let t = performance.now();
  for (;;) { const r = gen.next(); if (r.done) return r.value; if (LOADFIX && performance.now() - t > budget) { await breathe(); t = performance.now(); } }
}
// 11/21 同じ固まりの続き: 「球場を歩く」を始めた直後、自由に遊ぶ仕組み(freeplay.js の makeWagons・visClear・visGround)が
// 見た目の模型に three.js の光線を何百本も総当たりで当てていて、PC で 8〜11 秒止まっていた。読み込みが済んだ後は、
// 三角形の多い形に初めて光線を当てる時に BVH を作り、three-mesh-bvh の速い当て方にする(当たる所は同じ)。?noloadfix=1 で前の形
let fastRay = false;
{ const orig = THREE.Mesh.prototype.raycast;
  THREE.Mesh.prototype.raycast = function (rc, out) {
    const g = this.geometry;
    if (!fastRay || this.isSkinnedMesh || this.material === undefined || !g || !g.attributes || !g.attributes.position || g.morphAttributes.position) return orig.call(this, rc, out);
    if (!g.boundsTree) { if ((g.index ? g.index.count : g.attributes.position.count) < 3000) return orig.call(this, rc, out); g.boundsTree = new MeshBVH(g, { maxLeafTris: 10 }); }
    return acceleratedRaycast.call(this, rc, out);
  };
}
function loadNote(s) { const e = $('loadtxt'); if (e) e.textContent = s; const l = document.querySelector('#loadScreen .lsTxt'); if (l) l.textContent = s; }
function setProgress(name, frac) {
  progress[name] = frac;
  if (name === 'build') loadMark('build' + frac);
  const w = { stadium: 3, seats: 1.6, collision: 0.2, ivy: 0.8, places: 0.05, seatbin: 0.3, ...(LOADFIX ? { build: 1.6, warm: 1.2 } : {}) };   // build: 通路・観客の作り、warm: 絵の準備
  let s = 0, tot = 0;
  for (const k in w) { tot += w[k]; s += w[k] * (progress[k] || 0); }
  $('bar').firstElementChild.style.width = Math.round((s / tot) * 100) + '%';
  const lb = document.querySelector('#loadScreen .lsBar i'); if (lb) lb.style.width = Math.round((s / tot) * 100) + '%';
}
// 球場を選ぶ画面で決めて読み直した時は、タイトルでなく「読み込み」の画面(選んだ球場の絵・名前・棒)を出す(UI v5)
(() => {
  let go = false; try { go = sessionStorage.getItem('r4walk.go') === '1'; } catch (e) { /* 使えない環境 */ }
  const ls = $('loadScreen'); if (!go || !ls) return;
  ls.style.backgroundImage = `url("img/stadium_thumbs/${STADIUM}.jpg")`;
  const nm = ls.querySelector('.lsName'); if (nm) nm.textContent = STADIUM_NAMES[STADIUM] || '';
  ls.classList.remove('hide');
})();
function loadGLB(name, url) {
  return new Promise((res, rej) => gltfLoader.load(url, res, (e) => e.total && setProgress(name, e.loaded / e.total), rej));
}

let collider = null, bvh = null, passages = null, wayfind = null;
let propSolids = null;
let ivyHi = null, ivyLo = null;
let places = null;
let surface = null;
const seats = { n: 0, x: null, y: null, z: null, yaw: null, grid: new Map() };

const NIGHT_K = { value: 0 };   // 焼き込んだ夜の光の強さ(昼 0・ナイター 1.1)
function useNightLight(o) {
  // 夜の光は UV の 1 つ(u = 光の量 ÷ 3、v = 0.5 の目印)に入っている。v が全部 0.5 の UV を探す
  const g = o.geometry; if (!g) return false;
  let key = null;
  for (const k of ['uv1', 'uv2', 'uv3']) {
    const a = g.getAttribute(k); if (!a) continue;
    let ok = true; const n = Math.min(a.count, 32);
    for (let i = 0; i < n; i++) { if (Math.abs(a.getY(Math.floor(i * a.count / n)) - 0.5) > 0.02) { ok = false; break; } }
    if (ok) { key = k; break; }
  }
  if (!key) return false;
  g.setAttribute('nlight', g.getAttribute(key));
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  for (const m of mats) {
    if (!m || m.userData.nl) continue;
    m.userData.nl = true;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uNightK = NIGHT_K;
      sh.vertexShader = 'attribute vec2 nlight;\nvarying float vNl;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vNl = nlight.x;');
      sh.fragmentShader = 'uniform float uNightK;\nvarying float vNl;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vNl * 3.0 * uNightK;');
    };
    m.customProgramCacheKey = () => 'nl';
    m.needsUpdate = true;
  }
  return true;
}
// ドーム R11 のコンコース・裏の場所の材質(名前の終わりが _lm)は、焼いた明るさを色の絵に持っている(dome_r11_field.json の lightmap_note)。
// 絵を発光にして、元の色は白 × 0.15、発光の強さ 2.0。床(floor・carpet)は焼いた明るさが強く出るので、明るい灰色(0.36)の普通の材質にする
function lightmapped(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const fix = (m) => {
      if (!m || !/_lm$/.test(m.name || '') || m.userData.lm) return m;
      if (/floor|carpet/.test(m.name)) { const n = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.36, 0.36, 0.36), roughness: 0.85, name: m.name }); n.userData.lm = true; return n; }
      m.userData.lm = true;
      if (m.map) { m.emissiveMap = m.map; m.emissive = new THREE.Color(1, 1, 1); m.emissiveIntensity = 2.0; }
      m.color = new THREE.Color(1, 1, 1).multiplyScalar(0.15); m.needsUpdate = true;
      return m;
    };
    o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
  });
}
function prepModel(root, { shadows = true } = {}) {
  if (!params.has('nobreakfix')) fixBreaks(root, THREE, STADIUM);   // js/breakfix.js(材質の名前で当てる)
  if (!params.has('noadfix')) fixAds(root, THREE);   // 看板の向きの直し(js/adfix.js。当たり判定の GLB は通らない)
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (R10) o.userData.nl = useNightLight(o);
    o.castShadow = shadows; o.receiveShadow = true;
    // 地面(芝・土・線)は影を落とさない(自分に落ちた影が縞のちらつきになる)
    { const m0 = Array.isArray(o.material) ? o.material[0] : o.material; if (m0 && /^(turf|turf_stripe|dirt_brick_red|grass|soil_black|chalk|line_white|r3_ground|park_grass|ground_paving|road_asphalt)/.test(m0.name || '')) o.castShadow = false; }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || m.userData.prepped) continue;
      m.userData.prepped = true;
      const n = m.name || '';
      if (n === 'chainlink') { m.transparent = false; m.alphaTest = 0.45; m.side = THREE.DoubleSide; }
      if (n === 'net') { m.side = THREE.DoubleSide; m.depthWrite = false; m.opacity = 0.06; m.color.setRGB(0.25, 0.27, 0.26); }
      if (n.startsWith('ivy')) m.side = THREE.DoubleSide;
      if (n === 'floodlight') { m.emissive = new THREE.Color(0xfff2d8); m.emissiveIntensity = 0; floodMats.push(m); }
      // ナイターで席・銀傘の下・スタンドが沈まないよう、夜だけ材質を少し自分で光らせる(光源は増やさない。夜用の焼き込みが届くまでのつなぎ)
      if (!INDOOR_ST && !o.userData.nl && /^(concrete_stand|roof_under|galvalume|concrete|seat_stadium|bench_green|paint_stone|paint_green_dark|r8_seat_frame|steel_light|painted_wall)$/.test(n) && m.emissive) { m.userData.nightLift = true; nightLiftMats.push(m); }
      if (n.startsWith('seat') || n === 'bench_green') m.side = THREE.DoubleSide;
      // 球場の外の地面・高架・建物(航空写真など)は、夜に明るく浮かないよう時間帯で暗くする
      if (n.startsWith('r3_')) { m.userData.baseColor = m.color.clone(); outsideMats.push(m); }
      // 杜ノ丘: 球場の外の地面・建物・木・クレーンも、夜は暗くする(白く浮かないように)
      if (PARK && /^(ground_paving|building_|road_asphalt|park_grass|tree_|site_hoarding|crane_|facade_|window_glass)/.test(n)) { m.userData.baseColor = m.color.clone(); outsideMats.push(m); }
      // R6 の内野の土(乾いた土。ナイターは水をまいた土にする)
      if (n === 'soil_black' || (m.map && /r6_soil/i.test(m.map.name || ''))) { m.userData.baseColor = m.color.clone(); soilMats.push(m); }
    }
  });
  gfx.patchModel(root);   // 芝・土の細かさ、金属・座席の材質、テクスチャの斜めの細かさ
}

function surfaceAt(x, z) {
  if (!surface) return 's';
  const bx = Math.round(x) - surface.x0, by = Math.round(-z) - surface.y0;
  const row = surface.rows[by];
  if (!row || bx < 0 || bx >= row.length) return 'x';
  const c = row[bx];
  if (DOME && c === 't') return 'a';
  if (SHORE && (c === 'b' || c === 's')) return 'a';   // 海鳴り: 土の色の人工芝と明るい色の切り欠きは、どちらも人工芝(跳ね方は人工芝と同じ)
  if (BOWL && c === 'b') return 'a';   // 灯台坂: 土の色の人工芝(b)は跳ね方が人工芝と同じ   // ドームの警告帯は人工芝と同じ(甲子園の警告帯は土の値)
  return c === '.' ? 's' : c;
}

// 球場: 浜風の球場(R14、models/r14_*、11/19 外野・アルプスの外壁のツタ・通路口の出口の札・外野の通路。?r13=1 で R13(外周の敷石・銀傘の裏)、?r12=1 で R12(売店 14 種・ベンチ)、?r11=1 で R11、?r10=1 で R10、?r9=1 で R9、?r8=1 で R8)と屋根の球場(ドーム R16、models/dome_r16_*、11/19 コンコースの作り込み。?r14dome=1 で R14、?r12dome=1 で R12、?r11dome=1 で R11、?r10dome=1 で R10、?r9dome=1 で R9)。?stadium=dome で選ぶ(メニューで選ぶと残して読み直す)。?r6=1 で前の R6
const MDL = GROVE ? { dir: 'models/', pre: GROVE_PRE, places: `models/${GROVE_PRE}places.json` } : SHORE ? { dir: 'models/', pre: SHORE_PRE, places: `models/${SHORE_PRE}places.json` } : ROOFPARK ? { dir: 'models/', pre: ROOF_PRE, places: `models/${ROOF_PRE}places.json` } : NORTH ? { dir: 'models/', pre: NORTH_PRE, places: `models/${NORTH_PRE}places.json` } : BOWL ? { dir: 'models/', pre: BOWL_PRE, places: `models/${BOWL_PRE}places.json` } : RAIL ? { dir: 'models/', pre: RAIL_PRE, places: `models/${RAIL_PRE}places.json` } : RING ? { dir: 'models/', pre: RING_PRE, places: `models/${RING_PRE}places.json` } : PARK ? { dir: 'models/', pre: PARK_PRE, places: `models/${PARK_PRE}places.json` } : params.has('r6') && !DOME ? { dir: 'model/', pre: '', places: 'places.json' } : DOME ? (params.has('r28dome') ? { dir: 'models/', pre: 'dome_r28_', places: 'models/dome_r28_places.json' } : params.has('r27dome') ? { dir: 'models/', pre: 'dome_r27_', places: 'models/dome_r27_places.json' } : params.has('r26dome') ? { dir: 'models/', pre: 'dome_r26_', places: 'models/dome_r26_places.json' } : params.has('r25dome') ? { dir: 'models/', pre: 'dome_r25_', places: 'models/dome_r25_places.json' } : params.has('r24dome') ? { dir: 'models/', pre: 'dome_r24_', places: 'models/dome_r24_places.json' } : params.has('r23dome') ? { dir: 'models/', pre: 'dome_r23_', places: 'models/dome_r23_places.json' } : params.has('r9dome') ? { dir: 'models/', pre: 'dome_r9_', places: 'models/dome_r9_places.json' } : params.has('r10dome') ? { dir: 'models/', pre: 'dome_r10_', places: 'models/dome_r10_places.json' } : params.has('r11dome') ? { dir: 'models/', pre: 'dome_r11_', places: 'models/dome_r11_places.json' } : params.has('r12dome') ? { dir: 'models/', pre: 'dome_r12_', places: 'models/dome_r12_places.json' } : params.has('r14dome') ? { dir: 'models/', pre: 'dome_r14_', places: 'models/dome_r14_places.json' } : params.has('r16dome') ? { dir: 'models/', pre: 'dome_r16_', places: 'models/dome_r16_places.json' } : params.has('r17dome') ? { dir: 'models/', pre: 'dome_r17_', places: 'models/dome_r17_places.json' } : params.has('r18dome') ? { dir: 'models/', pre: 'dome_r18_', places: 'models/dome_r18_places.json' } : params.has('r19dome') ? { dir: 'models/', pre: 'dome_r19_', places: 'models/dome_r19_places.json' } : params.has('r20dome') ? { dir: 'models/', pre: 'dome_r20_', places: 'models/dome_r20_places.json' } : params.has('r21dome') ? { dir: 'models/', pre: 'dome_r21_', places: 'models/dome_r21_places.json' } : params.has('r22dome') ? { dir: 'models/', pre: 'dome_r22_', places: 'models/dome_r22_places.json' } : params.has('r25dome') ? { dir: 'models/', pre: 'dome_r25_', places: 'models/dome_r25_places.json' } : params.has('dome_r27') ? { dir: 'models/', pre: 'dome_r27_', places: 'models/dome_r27_places.json' } : params.has('dome_r29') ? { dir: 'models/', pre: 'dome_r29_', places: 'models/dome_r29_places.json' } : { dir: 'models/', pre: 'dome_r30_', places: 'models/dome_r30_places.json' })   /* R30(11/21 昼 2 回目の作り込み): 上の階の門 30〜33・40・41 を外の折り返し階段と連絡通路で上の階(バルコニーの階・4F)へ・4F の壁の絵と吊りの案内・1F のトイレと ATM・デッキの案内図・植え込み・街灯・ひさしの灯り・外野の角の外の化粧板。?dome_r29=1 で前の R29 */   /* R29(11/21 夜 持ち主「徹底的に再現」): 本物の番号の門 13(20〜25・11・30〜33・40・41、回転扉 54)・22 ゲートの両わきの大階段・右翼の坂・2F の壁(白い化粧板と黒い帯の案内)・黒い天井と線の灯り・トイレ 16・吊りの案内 18・22 ゲートの天井の LED 16 本。?dome_r27=1(または ?r27dome=1)で前の R27 */   /* R27(11/19 午後 作り込みF: 下の階の壁の掲示・化粧板・トイレの入口・消火器・AED・分別のごみ箱、天井のダクト・スプリンクラー・吊りのサイネージ、柱の番号と画面、席に肘掛け・脚・背もたれの裏)。?r26dome=1 で前の版 */   /* R26(R25 の階段の上の天井を抜き、下の階へ歩いて下りられる)。R25(11/19 作り込み B: 下の階のコンコース(本物の 1F)と階段・売店 60・ダグアウト・全部の階の床にタイル)。?r24dome=1・?r23dome=1・?r22dome=1 で前の版 */   /* R17: 11/19 柱のデジタルサイネージ。?r16dome=1・?r14dome=1 で前の版 */ : (params.has('r8') ? { dir: 'models/', pre: 'r8_', places: 'models/r8_places.json' } : params.has('r9') ? { dir: 'models/', pre: 'r9_', places: 'models/r9_places.json' } : params.has('r10') ? { dir: 'models/', pre: 'r10_', places: 'models/r10_places.json' } : params.has('r11') ? { dir: 'models/', pre: 'r11_', places: 'models/r11_places.json' } : params.has('r12') ? { dir: 'models/', pre: 'r12_', places: 'models/r12_places.json' } : params.has('r13') ? { dir: 'models/', pre: 'r13_', places: 'models/r13_places.json' } : params.has('r14') ? { dir: 'models/', pre: 'r14_', places: 'models/r14_places.json' } : { dir: 'models/', pre: 'r15_', places: 'models/r15_places.json' });   /* 浜風 R15(11/19 夕): R14 + 外の地面のタイルとアスファルト(繰り返しの絵)と、スマホ用の lite(r15_lite_*)。?r14=1 で前の版 */
// 甲子園 R10(?r9=1 で R9、?r8=1 で R8)。stadium・seats だけ夜の光を焼き込んだ r10_nightlight_ を読む
const R10 = MDL.pre === 'r10_' || MDL.pre === 'r11_' || MDL.pre === 'r12_' || MDL.pre === 'r13_' || MDL.pre === 'r14_' || MDL.pre === 'r15_';
const KLITE = MDL.pre === 'r15_' && !params.has('klite0');   // 浜風 R15 のスマホ用 lite(三角形 15 万・描く回数 90 まで、屋内は 8 つの扇形)。?klite0=1 でスマホでも PC と同じ夜の模型   // 夜の光の焼き込み(nightUV)の形は R10・R11・R12 で同じ
const mp = (n) => DOME && n === 'concourse.glb' && LITEQ(quality) && /^dome_r(29|3\d)_$/.test(MDL.pre) ? `${MDL.dir}${MDL.pre}lite_concourse.glb` /* 11/21 屋根の球場 R29: スマホは絵を 1024 にしたコンコース */ : R10 && (n === 'stadium.glb' || n === 'seats.glb') ? (KLITE && LITEQ(quality) ? `models/${MDL.pre}lite_${n}` : `models/${MDL.pre}nightlight_${n}`) : ((DOME || PARK || RING || GROVE || RAIL || BOWL || SHORE || NORTH || ROOFPARK) && LITEQ(quality) && (n === 'stadium.glb' || n === 'seats.glb' || n === 'roof_open.glb') ? `${MDL.dir}${MDL.pre}lite_${n}` : `${MDL.dir}${MDL.pre}${n}`);
// ドームの決まりの表(屋根の高さの格子など)
let domeField = null;
function roofAt(x, z) {
  // 銀輪ドーム: 丸い屋根(中心 center_three、真ん中 top_y、半径 lattice_edge_radius の縁で lattice_edge_y)。球の一部として高さを出す
  const rf = domeField && domeField.roof;
  if (GROVE && rf && rf.membrane_radius) {   // 森かげ: 真ん中は膜(球の一部)、まわりは軒へまっすぐ下がる金属の輪の屋根
    const r = Math.hypot(x - rf.center_three[0], z - rf.center_three[2]), R0 = rf.membrane_radius, h = rf.top_y - rf.membrane_edge_y;
    if (r <= R0) { const Rs = (R0 * R0 + h * h) / (2 * h); return rf.top_y - (Rs - Math.sqrt(Math.max(0, Rs * Rs - r * r))); }
    if (r <= rf.eave_radius) return (rf.membrane_edge_y - 2) + (r - R0) * (rf.eave_y - (rf.membrane_edge_y - 2)) / (rf.eave_radius - R0);
    return null;
  }
  if (RING && rf && rf.center_three) {
    const r = Math.hypot(x - rf.center_three[0], z - rf.center_three[2]), h = rf.top_y - rf.lattice_edge_y, R0 = rf.lattice_edge_radius;
    const Rs = (R0 * R0 + h * h) / (2 * h);
    return r > R0 * 1.15 ? null : rf.top_y - (Rs - Math.sqrt(Math.max(0, Rs * Rs - r * r)));
  }
  const g = domeField && domeField.roof && domeField.roof.inner_membrane_height_grid; if (!g) return null;
  const c = Math.round((x - g.x0) / g.step), r = Math.round((z - g.z0) / g.step);
  const row = g.rows[r]; if (!row) return null; const h = row[c]; return h == null ? null : h;
}
// コンコース・売店・記者席・屋内の物(グラウンドから見えない)。守備・打席・マウンドでは描かない
const INDOOR = /^r(?:[89]|1[0-5])_(conc|shop|booth|kitchen|duct|stair|pipe|plain_signboard|bs_)/;   // r11_bs_*: 裏の部屋(守備では描かない)
let indoorMeshes = [];
function setIndoor(on) { for (const m of indoorMeshes) m.visible = on; }
async function loadAll() {
  $('loadtxt').textContent = 'モデルを読み込んでいます…';
  const placesP = fetch(MDL.places).then((r) => r.json()).then((j) => { setProgress('places', 1); return j; });
  const seatP = fetch(mp('seats.bin')).then((r) => r.arrayBuffer()).then((b) => { setProgress('seatbin', 1); return b; });
  const ivyName = !LITEQ(quality) ? 'ivy_hi' : 'ivy_lo';
  if (DOME || PARK || RING || GROVE || RAIL || BOWL || SHORE || NORTH || ROOFPARK) domeField = await fetch(`models/${MDL.pre}field.json`).then((r) => r.json()).catch(() => null);
  const [st, col, se, iv, pl, sb] = await Promise.all([
    loadGLB('stadium', mp('stadium.glb')), loadGLB('collision', mp('collision.glb')), loadGLB('seats', mp('seats.glb')),
    loadGLB('ivy', mp(`${ivyName}.glb`)), placesP, seatP,
  ]);
  places = pl; surface = pl.surface; loadMark('files');
  if (LOADFIX) loadNote('球場を組み立てています…');
  prepModel(st.scene); scene.add(st.scene);
  await breathe(); setProgress('build', 0.05);
  if (ROOFPARK) {
    // 開閉式の屋根: stadium の roof の塊が閉じた形。開けた形は roof_open.glb(歩く・守備のどちらでも、時間帯で切り替える)
    roofNode = st.scene.getObjectByName(BAY ? 'roof_movable' : 'roof');
    if (!BAY || BAY_OPEN) try { const ro = await loadGLB('roof_open', mp('roof_open.glb')); prepModel(ro.scene); scene.add(ro.scene); roofOpenScene = ro.scene; } catch (e) { console.warn('開けた屋根を読めませんでした', e); }
  }
  if (scoreboard && !params.has('nosb')) scoreboard.attach(st.scene);   // スコアボードの面を、試合に連動する絵に替える(?nosb=1 で元の絵のまま)
  indoorMeshes = [];
  let interiorCol = null;   // 銀輪ドーム: コンコースの床は collision.glb に無いので、中の建物の形も当たり判定に足す(歩く時に上の階に立てるように)
  if (DOME) {
    // ドームのコンコースは別の GLB(歩く時だけ描く)
    try { const cc = await loadGLB('concourse', mp('concourse.glb')); if (MDL.pre === 'dome_r11_') lightmapped(cc.scene); if (LITEQ(quality) && !params.has('nosplit') && !/dome_r(9|1\d|2[0-8])_/.test(MDL.pre)) splitSectors(THREE, cc.scene); /* 11/21 屋根の球場 R29: スマホはコンコースを向きで区切って遠くを描かない(litesplit.js) */ prepModel(cc.scene);   // 焼き込みの直しは R11 だけ(R12 は書き出したままで正しい)
    scene.add(cc.scene); cc.scene.traverse((o) => { if (o.isMesh) indoorMeshes.push(o); }); } catch (e) { console.warn('ドームのコンコースを読めませんでした', e); }
  }
  if (((PARK && !/jingu_r[3-9]_|jingu_r1[0-4]_/.test(MDL.pre)) || RING || GROVE || RAIL || BOWL || SHORE || NORTH || ROOFPARK) && !NO_IN(quality)) {
    // 杜ノ丘 R15 の裏の部屋・コンコース(interior.glb)。歩く時だけ描く(守備では隠す)。11/21 スマホ(lite・auto)でも読む(影は落とさない。遠くは gfx.cullIndoor が描かない)
    try { const ic = await loadGLB('interior', ((RING && !CANAL && LITEQ(quality) && /nagoya_r(2[2-9]|[3-9]\d)_/.test(MDL.pre) && !params.has('nolitein2')) || CANAL && LITEQ(quality) && /funabi_r([7-9]|[1-9]\d)_/.test(MDL.pre) && !params.has('nolitein2')) || (SHORE && LITEQ(quality) && /uminari_r(1[6-9]|[2-9]\d)_/.test(MDL.pre)) || (ROOFPARK && !BAY && LITEQ(quality) && /escon_r(2[1-9]|[3-9]\d)_/.test(MDL.pre) && !params.has('nolitein2')) || (BAY && LITEQ(quality) && /fukuoka_r(2[7-9]|[3-9]\d)_/.test(MDL.pre) && !params.has('nolitein2')) || (GROVE && LITEQ(quality) && /morikage_r(1[1-9]|[2-9]\d)_/.test(MDL.pre) && !params.has('nolitein2')) || (BOWL && LITEQ(quality) && /yokohama_r(1[8-9]|[2-9]\d)_/.test(MDL.pre) && !params.has('nolitein2')) || (PARK && LITEQ(quality) && /jingu_r(2[2-9]|[3-9]\d)_/.test(MDL.pre) && !params.has('nolitein2')) || (RAIL && LITEQ(quality) && /hiroshima_r(2[4-9]|[3-9]\d)_/.test(MDL.pre) && !params.has('nolitein2')) /* 11/21 昼 汽笛ヶ原 R24: スマホは材質をまとめた lite_interior.glb */ /* 11/21 昼 杜ノ丘 R22: スマホは材質をまとめた lite_interior.glb */ ? `models/${MDL.pre}lite_interior.glb` : mp('interior.glb'));   /* 11/21 海鳴り R16: スマホは中の殻だけの軽い lite_interior.glb(0.27 MB。interior.glb は 0.98 MB) */ if (LITEQ(quality) && !params.has('nosplit')) splitSectors(THREE, ic.scene); prepModel(ic.scene, { shadows: !LITEQ(quality) }); scene.add(ic.scene); if (RING || GROVE || RAIL || BOWL || SHORE || NORTH || ROOFPARK) interiorCol = ic.scene; ic.scene.traverse((o) => { if (o.isMesh) indoorMeshes.push(o); }); } catch (e) { console.warn('杜ノ丘の中の建物を読めませんでした', e); }
  }
  st.scene.traverse((o) => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; if (ms.some((m) => INDOOR.test(m.name || ''))) indoorMeshes.push(o); } });
  gfx.cullIndoor(indoorMeshes);   // 11/19 スマホ: 自動・軽量では、遠くのコンコース・売店の中身を描かない(gfx.js)
  await breathe();
  prepModel(se.scene, { shadows: false }); scene.add(se.scene);
  seatsRoot = se.scene; standRoot = st.scene;   // 11/19 観客が椅子の背もたれ・前の椅子に埋まらないよう、見た目の椅子で座る所を確かめる(crowd.js の fixSeatsVisual)
  prepModel(iv.scene, { shadows: false }); scene.add(iv.scene);
  if (ivyName === 'ivy_hi') ivyHi = iv.scene; else ivyLo = iv.scene;
  await breathe(); setProgress('build', 0.12);

  // 当たり判定: 1 つのジオメトリにまとめて BVH
  const geos = [];
  col.scene.updateMatrixWorld(true);
  const colParts = [];   // 点検用: 当たり判定の物の名前と三角形の範囲(window.__colParts。どの物に当たったかを調べる時に使う)
  col.scene.traverse((o) => {
    if (o.isMesh) {
      const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
      colParts.push({ name: o.name || (o.parent && o.parent.name) || '', tris: (g.index ? g.index.count : g.attributes.position.count) / 3 });
      for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
      geos.push(g);
    }
  });
  if (interiorCol) {
    interiorCol.updateMatrixWorld(true);
    interiorCol.traverse((o) => { if (o.isMesh && !/glass|light|net/i.test((o.material && o.material.name) || '')) { const g = (o.geometry.userData.adOrigGeo || o.geometry).clone();   /* adOrigGeo: 看板の裏の写しを足す前の形(js/adfix.js) */ g.applyMatrix4(o.matrixWorld); for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k); geos.push(g); } });
  }
  const fgGeo = FG_ON ? fallGuardGeometry(THREE, await loadFallGuard(STADIUM, LITEQ(quality))) : null;   // 11/21 見えない床と柵(js/fallguard.json)
  if (fgGeo) { geos.push(fgGeo); if (params.has('fgshow')) scene.add(new THREE.Mesh(fgGeo, new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.45, depthWrite: false }))); }
  if (geos.some((g) => g.index) && geos.some((g) => !g.index)) for (let i = 0; i < geos.length; i++) if (geos[i].index) geos[i] = geos[i].toNonIndexed();   // 混ざると mergeGeometries が失敗する
  let merged = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
  { let k = 0; for (const c of colParts) { c.from = k; k += c.tris; c.to = k; } window.__colParts = colParts; }
  await breathe(); setProgress('build', 0.2);
  merged.boundsTree = new MeshBVH(merged, { maxLeafTris: 10 });
  bvh = merged.boundsTree;
  await breathe(); setProgress('build', 0.3);
  if (!params.has('nopricefix')) try { fixMenus(scene, THREE); } catch (e) { console.warn('メニューの板', e); }   // ?nopricefix=1 で値段を消さない(tools/pricecheck.py --before)
  // 通路口・ゲート: 表から道を作り、通る所の模型(絵と当たり判定)を切り抜いて、道の当たり判定を足す(?nopass=1 で無し)
  if (!params.has('nopass')) try {
    const pd = await fetch('models/passages.json?v=' + Date.now()).then((r) => r.json()).catch(() => null);
    passages = new Passages({ THREE, stadium: STADIUM, data: pd, quality }); const pt0 = performance.now();
    if (passages.plan(bvh)) {
      await breathe();
      const T1 = performance.now(); passages.build(); const T2 = performance.now();
      await breathe(); setProgress('build', 0.38);
      merged = LOADFIX && passages.carveCollisionGen ? await slice(passages.carveCollisionGen(merged)) : passages.carveCollision(merged); const T3 = performance.now();
      await breathe(); setProgress('build', 0.46);
      merged.boundsTree = new MeshBVH(merged, { maxLeafTris: 10 }); bvh = merged.boundsTree; const T4 = performance.now();
      await breathe(); setProgress('build', 0.54);
      if (LOADFIX && passages.carveSceneGen) await slice(passages.carveSceneGen(scene)); else passages.carveScene(scene);
      scene.add(passages.group); const T5 = performance.now();
      passages.times = { plan: Math.round(T1 - pt0), build: Math.round(T2 - T1), carveCol: Math.round(T3 - T2), bvh: Math.round(T4 - T3), carveScene: Math.round(T5 - T4) };
      if (!params.has('nowayf')) wayfind = new Wayfind({ passages, isTouch: IS_TOUCH, getState: wayState,   // 11/20 丸い地図を押す/M で全体の地図(docs/全体の地図.md)
        getFp: () => freeplay, seats, fence: fenceDist, stadiumName: STADIUM_NAMES[STADIUM] || '', isOverlay: () => overlayOn, getMode: () => mode, toast,
        setOverlay: (on) => { overlayOn = on; if (on) { keys.clear(); input.f = input.r = 0; } }, releasePointer, lockPointer,
        standNear: (x, z, y) => { const g = warpGen(); return g ? g.standNear(x, z, y) : null; }, describe: (x, y, z) => { const g = warpGen(); return g ? g.describe(x, y, z) : ''; } });   // 11/22 地図で押した所へ飛ぶ(js/warpgen.js)
    }
    passages.ms = Math.round(performance.now() - pt0); window.__passages = passages;
    if (!params.has('nobreakfix')) fixBreaks(passages.group, THREE, STADIUM);   // js/breakfix.js: 通路の枠・段が模型と重なってちらつく所
  } catch (e) { console.warn('通路口を作れませんでした', e); }
  await breathe(); setProgress('build', 0.62);
  if (!params.has('nobreakfix')) try { fixBreaksLate(scene, STADIUM); } catch (e) { console.warn('床の明るさ', e); }   // js/breakfix.js: 白く飛ぶ床だけを暗くする
  if (ROOFPARK) {
    // 屋根を開けた時の当たり判定: 閉じた屋根の板(高さ 40 m より上の三角形)を除いた物を別に作っておく
    const src = merged.index ? merged.toNonIndexed() : merged, P = src.attributes.position, keep = [];
    for (let i = 0; i < P.count; i += 3) { if (Math.min(P.getY(i), P.getY(i + 1), P.getY(i + 2)) > 40) continue; for (let k = 0; k < 3; k++) keep.push(P.getX(i + k), P.getY(i + k), P.getZ(i + k)); }
    const og = new THREE.BufferGeometry(); og.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
    await breathe();
    og.boundsTree = new MeshBVH(og, { maxLeafTris: 10 });
    bvhClosed = bvh; bvhOpen = og.boundsTree;
    await breathe();
    if (BAY_OPEN) {
      // 潮凪 R17: 開けた形の当たり判定は別のファイル
      try {
        const co = await loadGLB('collision_open', mp('collision_open.glb')); co.scene.updateMatrixWorld(true); const gs = [];
        co.scene.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k); gs.push(g); } });
        // 11/19 中の建物(選手の通路・ロッカー・インタビューの部屋)の床と壁も、開けた形の当たり判定に入れる(入れないと昼は部屋の床が無く、下へ落ちた)
        if (interiorCol) interiorCol.traverse((o) => { if (o.isMesh && !/glass|light|net/i.test((o.material && o.material.name) || '')) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k); gs.push(g); } });
        if (fgGeo) gs.push(fgGeo.clone());   // 11/21 見えない床と柵は開けた形にも
        if (gs.some((g) => g.index) && gs.some((g) => !g.index)) for (let i = 0; i < gs.length; i++) if (gs[i].index) gs[i] = gs[i].toNonIndexed();
        let mg = gs.length > 1 ? mergeGeometries(gs, false) : gs[0]; await breathe(); if (passages && passages.segs.length) mg = LOADFIX && passages.carveCollisionGen ? await slice(passages.carveCollisionGen(mg)) : passages.carveCollision(mg); await breathe(); mg.boundsTree = new MeshBVH(mg, { maxLeafTris: 10 }); bvhOpen = mg.boundsTree; await breathe();
      } catch (e) { console.warn('開けた形の当たり判定を読めませんでした', e); }
    }
    applyRoof(timeKey === 'night');
  }
  collider = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ wireframe: true, color: 0xff00ff }));
  collider.visible = false;
  scene.add(collider);

  // 席(位置と向き)と、近くの席を引く格子(2m)
  const a = new Int16Array(sb);
  seats.n = a.length / 4;
  seats.x = new Float32Array(seats.n); seats.y = new Float32Array(seats.n); seats.z = new Float32Array(seats.n); seats.yaw = new Float32Array(seats.n);
  for (let i = 0; i < seats.n; i++) {
    seats.x[i] = a[i * 4] / 100; seats.y[i] = a[i * 4 + 1] / 100; seats.z[i] = a[i * 4 + 2] / 100; seats.yaw[i] = a[i * 4 + 3] / 10000;
    const k = cellKey(seats.x[i], seats.z[i]);
    let c = seats.grid.get(k); if (!c) seats.grid.set(k, c = []); c.push(i);
  }
  if (passages && passages.segs.length) {   // 通路口の中に掛かる席は外す(観客が通路口に座らないように)
    const keep = passages.seatMask(seats); let m = 0;
    for (let i = 0; i < seats.n; i++) if (keep[i]) { seats.x[m] = seats.x[i]; seats.y[m] = seats.y[i]; seats.z[m] = seats.z[i]; seats.yaw[m] = seats.yaw[i]; m++; }
    if (m < seats.n) { seats.n = m; seats.x = seats.x.subarray(0, m); seats.y = seats.y.subarray(0, m); seats.z = seats.z.subarray(0, m); seats.yaw = seats.yaw.subarray(0, m); seats.grid.clear();
      for (let i = 0; i < m; i++) { const k = cellKey(seats.x[i], seats.z[i]); let c = seats.grid.get(k); if (!c) seats.grid.set(k, c = []); c.push(i); } }
  }
  await breathe(); setProgress('build', 0.7);
  // 11/21 観客の席の直し(crowd.js の _build が一度にしていた物)を、少しずつ先に済ませる(結果は同じ。済んだ印を付けるので _build は飛ばす)
  let seatPre = {};
  if (LOADFIX && !/[?&]noseatfix/.test(location.search)) {
    // 同じ球場・同じ模型・同じ直し方なら、前に直した結果を端末に残してあるので使う(屋根の球場で PC 6 秒・スマホ相当 10 秒かかる)。?noseatcache=1 で使わない
    const useCache = !params.has('noseatcache') && !params.has('nochairfix') && !params.has('nosidefix');
    const BAKE = params.has('seatbake');   // 11/25 軽く: tools/seatbake_1125.py が直しの結果を書き出す時(入れてある結果は使わない)
    const sig = useCache || BAKE ? seatSig() : null;
    let hit = useCache && sig ? await seatCache.get(seatCacheKey()) : null;
    if (!(hit && hit.sig === sig && hit.n === seats.n) && useCache && sig && !BAKE && !params.has('noseatbake')) { const b = await seatBaked(sig); if (b) { hit = b; loadMark('seatbaked'); seatCache.put(seatCacheKey(), b); } }   // 11/25 軽く: 端末に無い時(初めての起動・初めての球場)は、アプリに入れてある結果を使う
    const seatBase = BAKE ? { x: seats.x.slice(), y: seats.y.slice(), z: seats.z.slice(), yaw: seats.yaw.slice() } : null;
    if (!BAKE && hit && hit.sig === sig && hit.n === seats.n) {
      seats.x.set(hit.x); seats.y.set(hit.y); seats.z.set(hit.z); seats.yaw.set(hit.yaw);
      seats._fixed = seats._vfixed = seats._sfixed = true; seatPre = hit.stats || {}; seatPre.cached = true; loadMark('seatcache');
    } else {
      seatPre.fix = await slice(fixSeatsGen(seats, (x, z, from, max) => groundAt(x, z, from, max))); seats._fixed = true; setProgress('build', 0.8);
      const ch = await chairAtFnSliced();
      if (ch) { seatPre.vis = await slice(fixSeatsVisualGen(seats, ch)); seats._vfixed = true; }
      setProgress('build', 0.9);
      if (!/[?&]nosidefix/.test(location.search)) { seatPre.side = await slice(fixSeatsSideGen(seats)); seats._sfixed = true; }
      if (sig && !BAKE && seats._vfixed && seats._sfixed) seatCache.put(seatCacheKey(), { sig, n: seats.n, x: seats.x.slice(), y: seats.y.slice(), z: seats.z.slice(), yaw: seats.yaw.slice(), stats: { fix: seatPre.fix, vis: seatPre.vis, side: seatPre.side } });
      if (BAKE) window.__seatBake = { key: seatCacheKey(), file: seatBakeFile(), sig, n: seats.n, base: seatBase, x: seats.x.slice(), y: seats.y.slice(), z: seats.z.slice(), yaw: seats.yaw.slice(), stats: { fix: seatPre.fix, vis: seatPre.vis, side: seatPre.side }, vfixed: !!seats._vfixed, sfixed: !!seats._sfixed };
    }
    await breathe();
  }
  buildCrowd();
  if (crowd) { if (seatPre.fix) crowd.seatFix = seatPre.fix; if (seatPre.vis) crowd.seatFixVisual = seatPre.vis; if (seatPre.side) crowd.seatFixSide = seatPre.side; }
  await breathe(); setProgress('build', 1);

  // ナイター照明(照明塔 4 基・銀傘 2 列)。影は付けない
  // 照明は実際の光源を 4 つまでにする(光源が多いとシェーダーのユニフォームが Windows の Chrome の上限 1024 を超えて、何も映らなくなる)。
  // 照明塔(R8 のコンコース・街灯の灯りは光源にしない)を向きで 4 つの組にまとめ、組ごとに 1 つのスポットにする
  const towers = places.lights.filter((L) => !/^R[89]_/.test(L.name) && !L.name.startsWith('ROOF'));
  const groups = [[], [], [], []];
  for (const L of towers) { const a = Math.atan2(L.pos[0], L.pos[2]); groups[Math.min(3, Math.floor(((a + Math.PI) / (2 * Math.PI)) * 4))].push(L); }
  for (const G of groups) {
    if (!G.length) continue;
    const avg = (f) => [0, 1, 2].map((i) => G.reduce((t, L) => t + f(L)[i], 0) / G.length);
    const pos = avg((L) => L.pos), dir = avg((L) => L.dir), col = avg((L) => L.color);
    const s = new THREE.SpotLight(new THREE.Color(...col), 0, 0, DOME ? 0.9 : 0.62, 0.65, 0);
    s.userData.base = (DOME ? 0.42 : 3.6) * Math.min(3, Math.sqrt(G.length));
    s.position.set(...pos);
    s.target.position.set(pos[0] + dir[0] * 90, pos[1] + dir[1] * 90, pos[2] + dir[2] * 90);
    scene.add(s, s.target);
    nightLights.push(s);
  }
  // 照明塔の灯りのにじみ(遠くから見て点いているのが分かるように)
  {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,248,230,1)'); gr.addColorStop(0.25, 'rgba(255,236,200,0.55)'); gr.addColorStop(1, 'rgba(255,230,190,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const pos = [];
    for (const L of places.lights) if (!L.name.startsWith('ROOF') && !/^R[89]_/.test(L.name)) pos.push(L.pos[0], L.pos[1] + 1.5, L.pos[2]);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    glowSprites = new THREE.Points(geo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), size: 34, sizeAttenuation: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glowSprites.visible = false;
    if (!DOME) scene.add(glowSprites);
  }
  if (false) for (const x of [-38, 0, 38]) {   // 正面の外壁を照らす街の灯り(光源を増やすとシェーダーの上限を超えるので使わない)
    const s = new THREE.SpotLight(0xffd7a8, 0, 0, 0.55, 0.8, 0);
    s.userData.base = 0.9;
    s.position.set(x, 9, 118); s.target.position.set(x * 0.8, 7, 68);
    scene.add(s, s.target);
    nightLights.push(s);
  }
  buildFence();
  if (FG_ON) fieldFall = new FieldFall({ THREE, getBvh: () => bvh, groundAt, fenceDist, player, toast,
    afterMove: () => { player.lastSafe.copy(player.pos); safeHist.length = 0; fallFrom.y = player.pos.y; fallFrom.t = simClock; } });
  setQuality(quality, true);
  setTime(timeKey);
  defense = new Defense(ctx);
  // 11/23 守備の 1 プレーのリプレイ(js/replay.js)。プレーの始まりで覚え始める
  replay = new Replay({ camera, roots: () => [defense.group, me && me.root, defense.ballView.mesh], me: () => me, ball: () => defense.ballView.mesh,
    athletes: () => [me, ...Object.values(defense.fig), ...defense.runnerFigs, defense.batter, ...Object.values(defense.ump || {})],
    render: (dt) => { gfx.update(dt); gfx.render(); },
    hide: (on) => { if (on) { replay._hid = [fpGlove, defense.ring, defense.ballView.trail, catchFxM].filter(Boolean).map((o) => [o, o.visible]); for (const [o] of replay._hid) o.visible = false; document.body.classList.add('replayOn'); }
      else { for (const [o, v] of replay._hid || []) o.visible = v; replay._hid = null; document.body.classList.remove('replayOn'); } } });
  { const sp = defense.startPlay.bind(defense); defense.startPlay = (...x) => { const r = sp(...x); try { if (!defense.ffw) replay.begin(); } catch (e) { console.warn(e); } return r; }; }
  play = new Play(ctx);
  watch = new Watch({ THREE, defense, ctx, params, getUI: () => ui, getScoreboard: () => scoreboard });
  if (!params.has('oldbat')) cursor = new CursorGame({ THREE, defense, ctx, params, getUI: () => ui, getScoreboard: () => scoreboard });   // カーソルで打つ・投げる
  bench = new Bench({ scene, stadium: STADIUM, sound, bvh: () => bvh, groundAt: (x, z, from, max) => groundAt(x, z, from, max), defense: () => defense, watch: () => (cursor && cursor.on ? cursor : watch), mode: () => mode, getQuality: () => gfx.Q.crowd });
  if (!params.has('nofree')) freeplay = new FreePlay({   // 自由に遊ぶ球場(?nofree=1 で入れない)
    scene, camera, player, P, input, sound, IS_TOUCH, params, stadium: STADIUM, WARPS, world: ctx.world, surfaceAt, toast,
    groundAt: (x, z, from, max = 80) => groundAt(x, z, from, max), get mode() { return mode; }, setMode: (m) => ctx.setMode(m), setCamOverride: (v) => ctx.setCamOverride(v),
    placeAt, sit, leaveMode, lockPointer, releasePointer, setOverlay: (on) => { overlayOn = on; if (on) { keys.clear(); input.f = input.r = 0; } },
    setTime, timeKey: () => timeKey, roof: { has: () => ROOFPARK && !!roofOpenScene, closed: () => roofClosed, set: (c) => applyRoof(c) },
    watch: () => watch, me: () => me, seats, get passages() { return passages; }, view: () => activeView(), lookIdle: () => ctx.lookIdle(), curLabel: () => (curAction ? curAction.label : null),
  });
  gimmicks = new Gimmicks({ scene, camera, player, stadium: STADIUM, sound, IS_TOUCH, params, toast, groundAt: (x, z, from, max = 80) => groundAt(x, z, from, max), setCamOverride: (v) => ctx.setCamOverride(v), input: () => input, freeplay: () => freeplay, defense: () => defense, watch: () => watch, timeKey: () => timeKey, passages: () => passages, roof: { has: () => ROOFPARK && !!roofOpenScene, closed: () => roofClosed, set: (c) => applyRoof(c) } });
  gimmicks.setLite(LITEQ(quality));
  if (!params.has('nomokuhyo')) mokuhyo = new Mokuhyo({ scene, camera, player, IS_TOUCH, stadium: STADIUM, stadiumName: STADIUM_NAMES[STADIUM] || '', seats, sound,   // 11/21 目標と道案内(js/mokuhyo.js)
    groundAt: (x, z, from, max = 80) => groundAt(x, z, from, max), getMode: () => mode, isPlaying: () => started && !overlayOn && $('title').classList.contains('hide'),
    fp: () => freeplay, watch: () => watch, wayfind: () => wayfind, gimmicks: () => gimmicks, passages: () => passages, wayState: () => wayState(), lap: () => lap, seatIdx: () => seatIdx,
    setOverlay: (on) => { overlayOn = on; if (on) { keys.clear(); input.f = input.r = 0; } }, releasePointer, lockPointer });
  hudPrefs = new HudPrefs({ getMode: () => mode, mokuhyo: () => mokuhyo, defense: () => defense, freeplay: () => freeplay, ui: () => ui, isTouch: IS_TOUCH });   // 11/22 画面に出すもの(js/hudprefs.js)
  loadMark('modules'); await breathe();
  buildMe();
  setAthleteLod(gfx.Q.lod);
  await loadAthletes(); loadMark('athletes');
  await breathe();
  await warmGPU();
  $('loadtxt').textContent = '準備ができました';
  $('start').disabled = false;
  document.body.classList.add('ready');
  window.__app.ready = true;
}

// 11/21 読み込みの固まりの直し: 絵の準備。場面の全部の材質のシェーダーを compileAsync で作り(KHR_parallel_shader_compile で GPU の裏。待つ間も主スレッドは空く)、
// テクスチャも 1 枚ずつ GPU に上げる。前は読み込みの途中・遊び始めの 1 こま目で、描く時に作って待ち、PC で 2〜3 秒・スマホ相当で 1 秒近く止まっていた
const _fakeRoot = (list) => ({ traverse: (cb) => { for (const o of list) cb(o); }, traverseVisible: () => {} });
// 影の地図の描き方(three.js の WebGLShadowMap が影を落とす物ごとに使う MeshDepthMaterial)も先に作る。
// 影の時と同じ形の材質(向き・絵・透明の切り抜き)を、その物の写し(Object.create。骨・まとめ描きの種類が同じ)に付けて作らせる。同じ形のシェーダーは three.js が使い回す
const _shadowSideOf = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };
const _depthMats = new Map();
function depthProxies(objs) {
  const out = []; if (!renderer.shadowMap.enabled || renderer.shadowMap.type === THREE.VSMShadowMap) return out;
  for (const o of objs) {
    if (!o.isMesh || !o.castShadow || o.customDepthMaterial) continue;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m) continue;
      const side = m.shadowSide != null ? m.shadowSide : _shadowSideOf[m.side];
      const k = [side, m.map ? m.map.channel : -1, m.alphaMap ? m.alphaMap.channel : -1, m.alphaTest > 0 ? 1 : 0, m.displacementMap ? 1 : 0, m.wireframe ? 1 : 0, o.isSkinnedMesh ? 1 : 0, o.isInstancedMesh ? 1 : 0, o.instanceColor ? 1 : 0, o.morphTargetInfluences ? 1 : 0, o.isBatchedMesh ? 1 : 0].join('|');
      if (_depthMats.has(k)) continue;
      const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      dm.side = side; dm.map = m.map; dm.alphaMap = m.alphaMap; dm.alphaTest = m.alphaTest; dm.displacementMap = m.displacementMap; dm.displacementScale = m.displacementScale; dm.displacementBias = m.displacementBias; dm.wireframe = m.wireframe;
      _depthMats.set(k, dm);
      const p = Object.create(o); p.material = dm; out.push(p);
    }
  }
  return out;
}
async function compileSliced(objs, onFrac) {
  const post = gfx.info && gfx.info().post;
  const rt = post ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }) : null;   // 後処理のある画質は、描く先が別の絵(色の変換の無いシェーダー)になるので合わせる
  const srt = new THREE.WebGLRenderTarget(1, 1);   // 影の地図も別の絵に描く(色の変換の無いシェーダー)
  const shadowN = objs.length; objs = objs.concat(depthProxies(objs));
  const waits = []; let i = 0, t = performance.now(), done = 0;
  while (i < objs.length) {
    const batch = [], sh = i >= shadowN; while (i < objs.length && batch.length < 24 && (i >= shadowN) === sh) batch.push(objs[i++]);
    const prev = renderer.getRenderTarget();
    try { renderer.setRenderTarget(sh ? srt : rt); waits.push(renderer.compileAsync(_fakeRoot(batch), camera, scene).then(() => { done++; if (onFrac) onFrac(0.5 + 0.5 * done / Math.max(1, waits.length)); })); } catch (e) { console.warn('絵の準備', e); }
    renderer.setRenderTarget(prev);
    if (onFrac) onFrac(0.5 * i / objs.length);
    if (performance.now() - t > 40) { await breathe(); t = performance.now(); }
  }
  await Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, 20000))]);
  if (rt) rt.dispose();
  srt.dispose();
}
async function warmGPU() {
  if (!LOADFIX || params.has('nowarm')) { loadBusy = false; return; }
  loadNote('絵の準備をしています…');
  const objs = [], texs = new Set();
  scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.material) objs.push(o); });
  loadMark('warm0'); await compileSliced(objs, (f) => setProgress('warm', 0.7 * f)); loadMark('compiled');
  for (const o of objs) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
    if (!m) continue;
    for (const k in m) { const v = m[k]; if (v && v.isTexture && !v.isRenderTargetTexture) texs.add(v); }
    if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture && !v.isRenderTargetTexture) texs.add(v); }
  }
  let n = 0, t = performance.now();
  for (const tx of texs) { try { renderer.initTexture(tx); } catch (e) { /* 上げられない絵は描く時に */ } n++; if (performance.now() - t > 40) { setProgress('warm', 0.7 + 0.25 * n / texs.size); await breathe(); t = performance.now(); } }
  // 影の地図・後処理の絵の作りは描いて初めて作られる: 読み込みの表示のまま 1 回だけ描いておく
  loadMark('textures'); await breathe();
  try { renderOnce(0, true); } catch (e) { console.warn('絵の準備', e); }
  loadMark('render1');
  setProgress('warm', 1);
  await breathe();
  loadBusy = false;
}

async function loadIvy(which) {
  const g = await loadGLB('ivy', mp(`${which}.glb`));
  prepModel(g.scene, { shadows: false });
  scene.add(g.scene);
  if (which === 'ivy_hi') ivyHi = g.scene; else ivyLo = g.scene;
  setQuality(quality);
}

function setQuality(q, first) {
  if (!QUALS[q]) q = 'std';
  quality = q;
  if (!first && !params.has('q')) store('r4walk.q2', q);
  const std = !LITEQ(q);
  gfx.setQuality(q);   // 画面の細かさ・影・後処理・地面の細かさ
  gfx.setTime(TIMES[timeKey], timeKey);
  setAthleteDetail(null, std ? 1 : 0);
  setAthleteLod(gfx.Q.lod);   // 自動は段ごと(gfx.js の AUTO_LV)
  scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => (m.needsUpdate = true)); } });
  if (std) {
    if (ivyHi) { ivyHi.visible = true; if (ivyLo) ivyLo.visible = false; } else if (!window.__app.ivyHiPromise) window.__app.ivyHiPromise = loadIvy('ivy_hi');
  } else {
    if (ivyLo) { ivyLo.visible = true; if (ivyHi) ivyHi.visible = false; } else if (!window.__app.ivyLoPromise) window.__app.ivyLoPromise = loadIvy('ivy_lo');
  }
  if (crowd) setCrowd(crowdOn);
  if (gimmicks) gimmicks.setLite(!std);
  document.querySelectorAll('#quals .btn').forEach((b) => b.classList.toggle('on', b.dataset.k === q));
}

// ---------------------------------------------------------------- 観客(js/crowd.js。近くは人の形・遠くは板。引き継ぎは docs/観客の引き継ぎ.md)
let crowd = null, crowdOn = !params.has('nocrowd');
let seatsRoot = null, standRoot = null;
// 見た目の椅子(seats.glb)に上から光線を落として、当たった高さを返す(無ければ null)。初めて呼ばれた時に椅子の形に BVH を付ける
function chairAtFn() {
  if (!seatsRoot || params.has('nochairfix')) return null;
  const list = [], ray = new THREE.Ray(), inv = new THREE.Matrix4(), lr = new THREE.Ray(), down = new THREE.Vector3(0, -1, 0), tmp = new THREE.Vector3();
  seatsRoot.updateMatrixWorld(true);
  // 椅子(seats.glb)と、スタンドの段(stadium.glb の stand・step・riser の材質。椅子が段のコンクリートの下に埋まっている所がある)
  const isStand = (o) => { const ms = Array.isArray(o.material) ? o.material : [o.material]; return ms.some((m) => m && /stand|step|riser|tread/i.test(m.name || '')); };
  if (standRoot) standRoot.updateMatrixWorld(true);
  const roots = [[seatsRoot, () => true], [standRoot, isStand]];
  for (const [root, ok] of roots) if (root) root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.geometry && o.geometry.attributes.position && ok(o)) { const g = o.geometry; if (!g.boundsTree) g.boundsTree = new MeshBVH(g, { maxLeafTris: 10 }); if (!g.boundingBox) g.computeBoundingBox(); list.push({ o, box: g.boundingBox.clone().applyMatrix4(o.matrixWorld), inv: o.matrixWorld.clone().invert() }); } });
  if (!list.length) return null;
  return (x, z, fromY, maxDown) => {
    let best = null;
    for (const e of list) {
      if (x < e.box.min.x || x > e.box.max.x || z < e.box.min.z || z > e.box.max.z || fromY < e.box.min.y) continue;
      ray.origin.set(x, fromY, z); ray.direction.copy(down); lr.copy(ray).applyMatrix4(e.inv);
      const h = e.o.geometry.boundsTree.raycastFirst(lr, THREE.DoubleSide); if (!h) continue;
      tmp.copy(h.point).applyMatrix4(e.o.matrixWorld); if (fromY - tmp.y > maxDown) continue;
      if (best === null || tmp.y > best) best = tmp.y;
    }
    return best;
  };
}
// 11/21 席の直しの結果を端末(IndexedDB)に残す。鍵は球場と模型の種類、照合の印(seatSig)は直す前の席の値・椅子と段と当たり判定の形の大きさ・直す関数の中身から作る
// (模型・当たり判定・crowd.js の直し方のどれかが変わると印が変わり、作り直す)
const seatCache = {
  db: null,
  open() { if (this.db) return this.db; this.db = new Promise((res) => { try { const r = indexedDB.open('bokura_load', 1); r.onupgradeneeded = () => r.result.createObjectStore('seats'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch (e) { res(null); } }); return this.db; },
  async get(k) { const db = await this.open(); if (!db) return null; return new Promise((res) => { try { const q = db.transaction('seats').objectStore('seats').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); } }); },
  async put(k, v) { const db = await this.open(); if (!db) return; try { db.transaction('seats', 'readwrite').objectStore('seats').put(v, k); } catch (e) { /* 残せなくても遊べる */ } },
};
function seatCacheKey() { return `${STADIUM}|${MDL.pre}|${mp('seats.glb')}|${mp('stadium.glb')}`; }
// 11/25 軽く: 席の直しの結果をアプリに入れておく(models/seatfix/<鍵>.bin。tools/seatbake_1125.py が作る)。初めての起動でもスマホ相当で 9 秒ほどの直しを飛ばす。
// 中身: 'SFX2'・頭書きの長さ・頭書き(JSON: sig・n・stats・m・dense・io・parts)・直した席の番号(Uint32 × m。dense の時は無し = 全部の席)・各値(直す前からの差の int16、そのままの値の 16bit(q16)、float32 のどれか。誤差 0.6 mm 以下)。
// 直るのは 4 万席のうち 200 ほどなので、直した席だけを入れる(浜風で 2KB)。印(sig)が違えば使わず、今までどおり直す
function seatBakeFile() { return 'models/seatfix/' + seatCacheKey().replace(/[^A-Za-z0-9]+/g, '_') + '.bin'; }
async function seatBaked(sig) {
  try {
    const r = await fetch(seatBakeFile()); if (!r.ok) return null;
    const buf = await r.arrayBuffer(), dv = new DataView(buf);
    if (buf.byteLength < 8 || dv.getUint32(0, true) !== 0x32584653) return null;
    const hl = dv.getUint32(4, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)));
    if (head.sig !== sig || head.n !== seats.n) return null;
    const m = head.m, idx = head.dense ? null : new Uint32Array(buf.slice(head.io, head.io + m * 4));   // dense: 全部の席(番号は入れていない)
    const out = { sig, n: seats.n, stats: head.stats || {} };
    for (const p of head.parts) {
      const v = seats[p.k].slice();
      const I = (j) => (idx ? idx[j] : j);
      if (p.t === 'f32') { const a = new Float32Array(buf.slice(p.o, p.o + m * 4)); for (let j = 0; j < m; j++) v[I(j)] = a[j]; }
      else if (p.t === 'q16') { const q = new Uint16Array(buf.slice(p.o, p.o + m * 2)); for (let j = 0; j < m; j++) v[I(j)] = p.lo + q[j] * p.st; }   // そのままの値を 65535 段に(1 mm 以下)
      else { const d = new Int16Array(buf.slice(p.o, p.o + m * 2)); for (let j = 0; j < m; j++) v[I(j)] += d[j] / p.s; }
      out[p.k] = v;
    }
    return out.x && out.y && out.z && out.yaw ? out : null;
  } catch (e) { return null; }
}
function seatSig() {
  let h = 2166136261 >>> 0;
  const mix = (v) => { h = Math.imul(h ^ (v >>> 0), 16777619) >>> 0; };
  const mixF = (f) => mix(Math.round(f * 1000) | 0);
  const mixS = (t) => { for (let i = 0; i < t.length; i++) mix(t.charCodeAt(i)); };
  mix(seats.n); for (const a of [seats.x, seats.y, seats.z, seats.yaw]) for (let i = 0; i < seats.n; i++) mixF(a[i]);
  const isStand = (o) => { const ms = Array.isArray(o.material) ? o.material : [o.material]; return ms.some((m) => m && /stand|step|riser|tread/i.test(m.name || '')); };
  for (const [root, ok] of [[seatsRoot, () => true], [standRoot, isStand]]) if (root) { root.updateMatrixWorld(true); root.traverse((o) => { if (!o.isMesh || o.isInstancedMesh || !o.geometry || !o.geometry.attributes.position || !ok(o)) return; const g = o.geometry; mixS(o.name || ''); mix(g.attributes.position.count); mix(g.index ? g.index.count : 0); if (!g.boundingBox) g.computeBoundingBox(); for (const v of [g.boundingBox.min, g.boundingBox.max]) { mixF(v.x); mixF(v.y); mixF(v.z); } for (const e of o.matrixWorld.elements) mixF(e); }); }
  if (bvh && bvh.geometry) { const P = bvh.geometry.attributes.position; mix(P.count); for (let i = 0; i < P.count; i += 97) { mixF(P.getX(i)); mixF(P.getY(i)); mixF(P.getZ(i)); } }
  for (const f of [fixSeatsGen, fixSeatsVisualGen, fixSeatsSideGen, seatDownhillGen, chairAtFn, groundAt]) mixS(String(f));
  return 'v1:' + h.toString(36);
}
// 11/21 読み込みの固まりの直し: chairAtFn の椅子・段の形の BVH を、1 つずつ譲りながら先に作っておく(作った後の chairAtFn はすぐ返る)
async function chairAtFnSliced() {
  if (!seatsRoot || params.has('nochairfix')) return null;
  const isStand = (o) => { const ms = Array.isArray(o.material) ? o.material : [o.material]; return ms.some((m) => m && /stand|step|riser|tread/i.test(m.name || '')); };
  const todo = [];
  for (const [root, ok] of [[seatsRoot, () => true], [standRoot, isStand]]) if (root) root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.geometry && o.geometry.attributes.position && ok(o) && !o.geometry.boundsTree) todo.push(o.geometry); });
  let t = performance.now();
  for (const g of todo) { if (!g.boundsTree) g.boundsTree = new MeshBVH(g, { maxLeafTris: 10 }); if (performance.now() - t > 40) { await breathe(); t = performance.now(); } }
  return chairAtFn();
}
function cellKey(x, z) { return (Math.floor(x / 2) + 1000) * 4000 + (Math.floor(z / 2) + 1000); }
function buildCrowd() {
  crowd = new Crowd({ THREE, scene, seats, sound, stadium: INDOOR_ST ? 'dome' : STADIUM, getQuality: () => gfx.Q.crowd, getTime: () => timeKey,
    groundAt: (x, z, from, max) => groundAt(x, z, from, max),   // 11/18 夜 席の高さを直すのに使う(crowd.js の fixSeats)
    chairAt: seats._vfixed ? null : chairAtFn(),   // 11/21 先に直してあれば作らない(使わない) // 11/19 見た目の椅子の高さ(crowd.js の fixSeatsVisual。?nochairfix=1 で使わない)
    getHideUp: () => underHide, getHide: () => ((player.pos.y > 0.8 || mode === 'sit') ? [player.pos.x, player.pos.y - 0.4, player.pos.z, mode === 'sit' ? 0.9 : 1.4] : null) });
  setCrowd(crowdOn);
}
function setCrowd(on) {
  crowdOn = on;
  if (!crowd) return;
  crowd.setVisible(on);
  $('crowdBtn') && $('crowdBtn').classList.toggle('on', on);
  if (sound.ready) sound.ambience(on && soundOn, on ? 0.9 : 0);
}
// スタンドの下(裏の部屋・選手の通路・ブルペン・地下・席の下のコンコース)を歩いている間は、頭の真上の観客の人形だけを隠す。
// 段の天井のすき間から靴の先が見えるのを防ぎ、人の多い球場で少し軽くなる。判断: 頭の上 2 m より高い所に席がある(横 4 m 以内)、かつ自分が席の段にいない
let underStand = false, underT = 0, underHide = null;   // underHide: [x, 下限の高さ, z, 半径] の円柱の上の人を出さない(crowd.js の uHideUp)
function updateUnderStand(dt) {
  underT += dt; if (underT < 0.25) return; underT = 0;
  let under = false;
  if (crowd && seats && seats.grid && (mode === 'walk')) {
    const px = player.pos.x, pz = player.pos.z, py = player.pos.y;
    outer: for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const c = seats.grid.get(cellKey(px + dx * 2, pz + dz * 2)); if (!c) continue;
      for (const i of c) if (seats.y[i] > py + 2.0 && Math.hypot(seats.x[i] - px, seats.z[i] - pz) < 4) { under = true; break outer; }
    }
    if (under && nearestSeat(1.5) >= 0) under = false;   // 席の段(上の段の張り出しの下の席)では隠さない
  }
  underStand = under;
  // 11/19 音: 球場を歩く時も、席の下(コンコース)ではこもった音とコンコースの話し声、地面の高さの裏の部屋はもっとこもる(観戦は watch.js の listenTick が決める)
  if (sound && sound.ready && sound.setMuffle && !(watch && watch.on)) { const m = mode === 'walk' && under ? 1 : 0; if (m !== (sound.muffleK || 0)) sound.setMuffle(m); }
  underHide =under ? [player.pos.x, player.pos.y + 2.0, player.pos.z, player.pos.y < 3 ? 25.0 : 6.0] : null;   // まとめて隠さず、頭の真上(横 6 m 以内・自分より 2 m 上)の人だけ。地面の高さ以下の裏の部屋・通路(壁で囲まれていて遠くの席は見えない)は 25 m まで(奥の天井のすき間の靴の先も消す)
}
function updateCrowdNear() { /* 自分のまわりの人を消すのは crowd.js の中(getHide)で毎フレーム行う */ }

// ---------------------------------------------------------------- フェンスまでの距離(打球の本塁打の判定に使う)
const fenceTable = [];
function buildFence() {
  const ray = new THREE.Ray();
  for (let a = -50; a <= 50; a++) {
    const r = a * Math.PI / 180;
    ray.origin.set(0, 1.0, 0); ray.direction.set(Math.sin(r), 0, -Math.cos(r));
    const h = bvh.raycastFirst(ray, THREE.DoubleSide, 1, 200);
    fenceTable.push(h ? h.distance : 120);
  }
}
function fenceDist(aDeg) {
  const i = Math.max(0, Math.min(100, Math.round(aDeg + 50)));
  return fenceTable[i] || 120;
}

// ---------------------------------------------------------------- 歩く(カプセルの当たり判定)
const P = { radius: 0.32, height: 1.72, eye: 1.6, walk: 4.3, run: 9.0, jump: 6.4, jumpDef: 5.4, gravity: -22, stepMax: 0.8 };   // 11/20 持ち主「ジャンプをもう少し高く(観戦・歩くだけ)」: 歩く・観戦・自由に遊ぶは 6.4(高さ 0.93 m、空中 0.58 秒)、守備の試合・ノックは 5.4 のまま(0.66 m)
const fallFrom = { y: 0, t: 0, armed: false }, safeHist = []; let simClock = 0, falls = 0;   // 落ちた時の救い(physicsStep)
const FG_ON = !params.has('nofg');   // 11/21 グラウンドへ降りても戻さない・見えない床と柵(js/fallguard.js)。?nofg=1 で前の形
let fieldFall = null;   // FieldFall(当たり判定ができてから作る)
const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), onGround: false, yaw: 0, pitch: 0, lastSafe: new THREE.Vector3(), airTime: 0, speedNow: 0 };
const input = { f: 0, r: 0, run: false, jump: false };
const keys = new Set();
const _seg = new THREE.Line3(), _box = new THREE.Box3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _ray = new THREE.Ray(), _mv = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const GROUND_PROBES = [[0, 0], [0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]];

function groundAt(x, z, fromY, maxDist = 80) {
  _ray.origin.set(x, fromY, z); _ray.direction.copy(DOWN);
  const hit = bvh.raycastFirst(_ray, THREE.DoubleSide, 0, maxDist);
  return hit ? hit.point.y : null;
}
function resolveCapsule() {
  const r = P.radius;
  _seg.start.set(player.pos.x, player.pos.y + r, player.pos.z);
  _seg.end.set(player.pos.x, player.pos.y + P.height - r, player.pos.z);
  _box.makeEmpty(); _box.expandByPoint(_seg.start); _box.expandByPoint(_seg.end);
  _box.min.addScalar(-r); _box.max.addScalar(r);
  const before = _v1.copy(_seg.start);
  bvh.shapecast({
    intersectsBounds: (b) => b.intersectsBox(_box),
    intersectsTriangle: (tri) => {
      const tp = _v2, cp = _mv;
      const d = tri.closestPointToSegment(_seg, tp, cp);
      if (d < r) {
        const depth = r - d;
        const dir = cp.sub(tp).normalize();
        _seg.start.addScaledVector(dir, depth); _seg.end.addScaledVector(dir, depth);
      }
    },
  });
  return before.subVectors(_seg.start, before);
}
function physicsStep(dt, frozen) {
  if (!bvh) return;
  // 移動の向きは、いまのカメラの向きが基準(一人称・後ろからは自分の向き、中継などの視点はカメラの横の向き)
  const myaw = moveYaw();
  const fx = -Math.sin(myaw), fz = -Math.cos(myaw);
  const rx = Math.cos(myaw), rz = -Math.sin(myaw);
  let mx = frozen ? 0 : fx * input.f + rx * input.r, mz = frozen ? 0 : fz * input.f + rz * input.r;
  if (mode === 'defense' && defense && !frozen) { const s = defense.steerMove(mx, mz); if (s) { mx = s[0]; mz = s[1]; } }   // 11/21 初めの数球だけ、倒した向きを捕れる所へ寄せる(defense.js の steerMove)
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  let speed = input.run ? P.run : P.walk;
  if (mode === 'defense' && defense) {
    // 守備: 大きく倒すと全力(本物の野手の全力 約 7〜8 m/s、易しいは少し速く)、少しだと歩き。止まる時はすぐ止まる(慣性なし)
    const full = defense.fullSpeed();
    let k = Math.min(1, ml);
    // 11/25 テスター「外野で抜けた球を拾うのに時間がかかる」: 外野で転がる球を追う間は、棒を半分(0.35)より倒していれば全力で走る(全力の速さは変えない)
    if (k > 0.35 && k < 0.85 && defense.looseChase && defense.looseChase()) k = 0.85;
    speed = IS_TOUCH || stick.active ? (k < 0.4 ? 3.2 * k / 0.4 : 3.2 + (full - 3.2) * Math.min(1, (k - 0.4) / 0.45)) / Math.max(Math.min(1, ml), 1e-6)
      : full;
  }
  const moving = ml > 0.01;
  if (moving && player.onGround) {
    const nx = mx / Math.max(ml, 1e-6), nz = mz / Math.max(ml, 1e-6);
    const ax = player.pos.x + nx * (P.radius + 0.12), az = player.pos.z + nz * (P.radius + 0.12);
    const h = groundAt(ax, az, player.pos.y + P.stepMax + 0.05, P.stepMax + 0.3);
    if (h !== null && h > player.pos.y + 0.02 && h <= player.pos.y + P.stepMax) {
      _ray.origin.set(ax, h + 0.05, az); _ray.direction.set(0, 1, 0);
      if (!bvh.raycastFirst(_ray, THREE.DoubleSide, 0, P.height)) player.pos.y = h + 0.005;
    }
  }
  player.airTime = player.onGround ? 0 : player.airTime + dt;
  if (input.jump && !frozen && (player.onGround || player.airTime < 0.15) && player.vel.y <= 0.01) {
    player.vel.y = mode === 'defense' ? P.jumpDef : P.jump; player.onGround = false; player.airTime = 1;
  } else if (player.onGround) player.vel.y = 0;
  else player.vel.y = Math.max(player.vel.y + P.gravity * dt, -45);
  input.jump = false;
  const ox = player.pos.x, oz = player.pos.z;
  player.pos.x += mx * speed * dt; player.pos.z += mz * speed * dt; player.pos.y += player.vel.y * dt;
  player.mv = { x: mx * speed, z: mz * speed };
  const push = resolveCapsule();
  player.pos.add(push);
  if (mode === 'walk' && propSolids) { const sp = propSolids.push(player.pos, P.radius, P.height); if (sp.x || sp.z) { player.pos.add(sp); const b2 = resolveCapsule(); player.pos.x += b2.x; player.pos.z += b2.z; } }   // 11/22 夜 置いた物から押し出す(押した先が壁なら、壁の当たり判定でもう一度)
  player.speedNow = Math.hypot(player.pos.x - ox, player.pos.z - oz) / dt;
  const pushedUp = push.y > Math.abs(player.vel.y * dt) * 0.25 && push.y > 0;
  let g = null;
  for (const [ox2, oz2] of GROUND_PROBES) {
    const h = groundAt(player.pos.x + ox2, player.pos.z + oz2, player.pos.y + 0.3, 0.42);
    if (h !== null && (g === null || h > g)) g = h;
  }
  const wasGround = player.onGround;
  player.onGround = pushedUp || (g !== null && player.vel.y <= 0.01);
  if (player.onGround && g !== null && player.vel.y <= 0.01) {
    if (player.pos.y - g < 0.4) player.pos.y = Math.max(g, player.pos.y - (wasGround ? 0.4 : 0.05));
    player.vel.y = 0;
  } else if (push.y < -0.001 && player.vel.y > 0) player.vel.y = 0;
  player.pos.x = THREE.MathUtils.clamp(player.pos.x, -400, 400);
  player.pos.z = THREE.MathUtils.clamp(player.pos.z, -460, 360);
  // 落ちた時の救い(11/18 夜): 4 m より高い所から落ちた(段の隙間・床の穴・上の階から下の階へ)・床の下へ抜けた時は、
  // 落ちる 0.5 秒前に立っていた床の上へ戻す。守備では使わない(グラウンドの上だけ)
  if (!player.onGround) fallFrom.y = Math.max(fallFrom.y, player.pos.y);
  // 11/21 グラウンド(フェンスの内・ファウルの所)へ降りた時は戻さない(客席から飛び降りても、そのままグラウンドを歩ける。観戦なら乱入になる)
  const fellFar = fallFrom.armed && mode !== 'defense' && player.onGround && !wasGround && fallFrom.y - player.pos.y > 4.0 && !(fieldFall && fieldFall.isField(player.pos.x, player.pos.y, player.pos.z));
  if (player.pos.y < -15 || fellFar || (fallFrom.armed && !player.onGround && player.airTime > 3.0 && mode !== 'defense')) {
    const back = safeHist.find((h) => fallFrom.t - h.t >= 0.5) || safeHist[0];
    if (back) player.pos.set(back.x, back.y, back.z); else player.pos.copy(player.lastSafe);
    player.vel.set(0, 0, 0); player.onGround = true; player.airTime = 0; falls++;
    toast('落ちたので戻しました');
  }
  simClock += dt;
  if (player.onGround) {
    player.lastSafe.copy(player.pos); fallFrom.y = player.pos.y; fallFrom.t = simClock; fallFrom.armed = true;
    if (!safeHist.length || simClock - safeHist[0].t > 0.1) { safeHist.unshift({ x: player.pos.x, y: player.pos.y, z: player.pos.z, t: simClock }); if (safeHist.length > 30) safeHist.pop(); }
  }
}
function simulate(seconds, frozen = false) {
  const sub = 1 / 120;
  let t = seconds;
  while (t > 1e-6) { const d = Math.min(sub, t); physicsStep(d, frozen); t -= d; }
}

// ---------------------------------------------------------------- ワープ先と出入口
// 位置は three の座標(x, z)。look は見る点(x, z, y)
const WARPS = [
  { k: 'home', label: '本塁', at: [0, 3.2], look: [0, -60, 1.5] },
  { k: 'mound', label: 'マウンド', at: [0, -19.4], look: [0, 0, 1.0] },
  { k: 'bench', label: '一塁ベンチ前', at: [21.5, -5.5], look: [-10, -40, 1.5] },
  { k: 'infield', label: '内野席', at: [-14, 30], look: [0, -45, -2] },
  { k: 'alps', label: 'アルプス席', at: [80, -60], look: [0, -25, 0] },
  { k: 'outfield', label: '外野席', at: [-30, -131], look: [0, 0, 0] },
  { k: 'board', label: 'スコアボード前', at: [0, -110], look: [0, -133, 19] },
  { k: 'front', label: '正面の外(ツタの外壁)', at: [-8, 82], look: [-6, 68, 8], fromY: 10 },
  { k: 'concourse', label: 'コンコース', at: [0, 60], look: [30, 58, 1.6], fromY: 2 },
  { k: 'concourse3', label: '3階コンコース', at: [0, 60], look: [30, 58, 6.2], fromY: 5.5 },
  { k: 'gate', label: '外の門', at: [-4, 76], look: [-4, 60, 4], fromY: 3 },
  { k: 'bullpen', label: 'ブルペン', at: [-90, -30], look: [-92, -41, 0.8], fromY: 2 },
  // R11 の裏の部屋(本塁の後ろのスタンドの下)
  { k: 'interview', label: 'インタビューの部屋', at: [4, 32], look: [-3, 30, 1.4], fromY: 1.5 },
  { k: 'locker', label: 'ロッカー(一塁側)', at: [33, 24], look: [41, 24, 1.3], fromY: 1.5 },
];
if (PARK) {
  WARPS.length = 0;   // R1 はグラウンドの中だけ
  WARPS.push({ k: 'home', label: '本塁', at: [0, 2.6], look: [0, -60, 1.5], fromY: 3 }, { k: 'mound', label: 'マウンド', at: [0, -19.6], look: [0, 0, 1.2], fromY: 3 }, { k: 'outfield', label: '外野', at: [0, -100], look: [0, 0, 1.5], fromY: 3 });
  // R15 の中(places の CAM_20・22・23・26 の位置)
  if (!NO_IN(quality)) WARPS.push(
    { k: 'concourse', label: 'コンコース(一塁側)', at: [64.4, 0.2], look: [64.4, 12, 1.6], fromY: 2.5 },
    { k: 'concourse3b', label: 'コンコース(三塁側)', at: [-64.4, 0.2], look: [-64.4, 12, 1.6], fromY: 2.5 },   // 11/21 R21: 中のコンコースは三塁側・本塁の後ろ・外野の下にもある(歩く人の道の種にもなる)
    { k: 'concourseHome', label: 'コンコース(本塁の後ろ)', at: [0, 50.5], look: [12, 50.5, 1.6], fromY: 2.5 },
    { k: 'concourseOF', label: '外野の下の売店(ライト)', at: [51.6, -133.1], look: [80, -115, 1.6], fromY: 2.5 },
    { k: 'tunnel', label: '選手の通路', at: [28.3, 17.0], look: [20, 17, 1.4], fromY: 2.5 },
    { k: 'locker', label: 'ロッカー(一塁側)', at: [41.0, 6.6], look: [41, 12, 1.4], fromY: 3 },
    { k: 'interview', label: 'インタビューの部屋', at: [32.5, 18.9], look: [37, 18.9, 1.4], fromY: 3 },
  );
}
if (BAY) {
  // 潮凪ドームの行き先(places の CAM の位置。中の建物は interior.glb、スマホでは読まないので外す)
  WARPS.length = 0;
  WARPS.push(
    { k: 'home', label: '本塁', at: [0, 2.6], look: [0, -60, 1.5], fromY: 3 },
    { k: 'mound', label: 'マウンド', at: [0, -19.6], look: [0, 0, 1.2], fromY: 3 },
    { k: 'outfield', label: '外野席(右翼)', at: [61.1, -107.5], look: [0, -20, 0], fromY: 13 },
    { k: 'infield', label: '内野席(一塁側)', at: [21.1, 13.0], look: [0, -30, 0], fromY: 6.5 },
    { k: 'upper', label: '上の階の席(5F・6F)', at: [12.0, -135.5], look: [0, 0, 2], fromY: 37 },   // R21: 画面の上の席(まだ歩いて上がる道は無い)
  );
  if (!NO_IN(quality)) WARPS.push(
    { k: 'concourse', label: 'コンコース', at: [-64.3, 30.6], look: [-50, 40, 12.2], fromY: 12.5 },
    { k: 'tunnel', label: '選手の通路', at: [28.4, 11.3], look: [20, 11.3, 1.6], fromY: 1.8 },
    { k: 'locker', label: 'ロッカー(一塁側)', at: [36.5, 11.0], look: [36.5, 15, 1.6], fromY: 1.2 },   // 11/19 前の (35.0, 7.7) は棚の間の狭い所(壁まで 0.3〜0.5 m)で、歩ける格子の 1 点だけの所だった → 部屋の広い所へ
    { k: 'interview', label: 'インタビューの部屋', at: [13.4, 29.3], look: [13.4, 35, 1.6], fromY: 1.8 },
    // ブルペン(CAM_30、推定の場所)はスタンドの下の壁しか写らないので外す
  );
} else if (ROOFPARK) {
  // 白樺ルーフパークの行き先(places の CAM の位置。中の建物は interior.glb、スマホでは読まないので外す)
  WARPS.length = 0;
  WARPS.push(
    { k: 'home', label: '本塁', at: [0, 2.6], look: [0, -60, 1.5], fromY: 3 },
    { k: 'mound', label: 'マウンド', at: [0, -19.6], look: [0, 0, 1.2], fromY: 3 },
    { k: 'infield', label: '一塁側の上の席', at: [52, 2], look: [0, -30, 0], fromY: 25 },
    { k: 'infield3', label: '三塁側の上の席', at: [-40, 10], look: [0, -30, 0], fromY: 35 },
  );
  if (!NO_IN(quality)) WARPS.push(
    { k: 'concourse', label: 'コンコース(本塁の後ろ)', at: [1.2, 37.9], look: [20, 30, 9.3], fromY: 10 },
    { k: 'tunnel', label: '選手の通路', at: [27.6, 5.0], look: [27.6, 0, 1.6], fromY: 1.8 },
    { k: 'locker', label: '丸いロッカー', at: [48.0, 12.1], look: [44, 8, 1.6], fromY: 1.8 },
    { k: 'interview', label: 'インタビューの部屋', at: [9.3, 39.7], look: [9.3, 34, 1.6], fromY: 1.8 },
  );
}
if (NORTH) {
  // 観覧車の丘スタジアムの行き先(places の CAM の位置。中の建物は interior.glb、スマホでは読まないので外す)
  WARPS.length = 0;
  WARPS.push(
    { k: 'home', label: '本塁', at: [0, 2.6], look: [0, -60, 1.5], fromY: 3 },
    { k: 'mound', label: 'マウンド', at: [0, -19.6], look: [0, 0, 1.2], fromY: 3 },
    { k: 'outfield', label: '外野席', at: [-34.9, -129.6], look: [0, -20, 0], fromY: 11 },
    { k: 'infield', label: '内野席(三塁側)', at: [-37.2, -9.2], look: [0, -30, 0], fromY: 4 },
  );
  if (!NO_IN(quality)) WARPS.push(
    { k: 'concourse', label: 'コンコース(一塁側)', at: [64.2, -1.7], look: [64.2, 12, 1.6], fromY: 2.5 },
    { k: 'tunnel', label: '選手の通路', at: [24.8, 13.8], look: [16, 13.8, 1.0], fromY: 1.0 },
    { k: 'locker', label: 'ロッカー(一塁側)', at: [34.9, 9.7], look: [34.9, 15, 1.8], fromY: 1.8 },
    { k: 'interview', label: 'インタビューの部屋', at: [-28.0, 17.8], look: [-33, 17.8, 1.8], fromY: 1.8 },
    { k: 'bullpen', label: 'ブルペン(一塁側)', at: [67.3, -31.9], look: [67.3, -22, 1.0], fromY: 2 },
  );
}
if (SHORE) {
  // 海鳴りスタジアムの行き先(研究模型の build_report から tools/make_warps.py。中の建物は interior.glb、スマホでは読まないので外す)
  WARPS.length = 0;
  WARPS.push(
    {k: 'home', label: '本塁', at: [0, 2.6], look: [0, -60, 1.5], fromY: 3},
    {k: 'mound', label: 'マウンド', at: [0, -19.6], look: [0, 0, 1.2], fromY: 3},
    {k: 'infield', label: '1階席(三塁側)', at: [-25.2, 18.5], look: [0, -30, 0], fromY: 6.279999999999999},
    {k: 'upper', label: '2階席(三塁側)', at: [-60.3, 1.6], look: [0, -40, 0], fromY: 18.3},
    {k: 'outfield', label: '外野席(レフト)', at: [-46.5, -109.7], look: [0, -20, 0], fromY: 6.4},
  );
  if (!NO_IN(quality)) WARPS.push(
    {k: 'concourse', label: '2階コンコース', at: [-1.0, 37.7], look: [10.8, 37.7, 6.18], fromY: 6.279999999999999},
    {k: 'concourse4', label: '4階コンコース', at: [-72.2, -1.5], look: [-67.2, 4.5, 18.2], fromY: 18.3},
    {k: 'gate', label: 'Cゲートの前(外のデッキ)', at: [4.4, 59.7], look: [2.8, 42.8, 6.279999999999999], fromY: 6.279999999999999},
    {k: 'bench', label: '一塁ベンチ', at: [21.9, 13.3], look: [0, -30, 1.0], fromY: 0.5},
    {k: 'tunnel', label: '選手の通路', at: [25.4, 15.5], look: [24.0, 20.0, 1.4], fromY: 1.0},
    {k: 'locker', label: 'ロッカー(一塁側)', at: [25.3, 20.8], look: [29.9, 23.7, 1.2], fromY: 1.0},
    {k: 'interview', label: 'インタビューの部屋', at: [18.2, 27.2], look: [19.0, 31.5, 1.4], fromY: 1.0},
    {k: 'bullpen', label: 'ブルペン(一塁側)', at: [48.0, -9.6], look: [43.2, -25.4, 1.0], fromY: 1.0},
    {k: 'seaview', label: '海の見える浜', at: [0.0, -215.0], look: [0.0, -320.0, 1.5], fromY: 3},
  );
}
if (BOWL) {
  // 灯台坂スタジアムの行き先(places の CAM の位置。中の建物は interior.glb、スマホでは読まないので外す)
  WARPS.length = 0;
  WARPS.push(
    { k: 'home', label: '本塁', at: [0, 2.6], look: [0, -60, 1.5], fromY: 3 },
    { k: 'mound', label: 'マウンド', at: [0, -19.6], look: [0, 0, 1.2], fromY: 3 },
    { k: 'outfield', label: '外野席', at: [-31.2, -119.9], look: [0, -20, 0], fromY: 15 },
    { k: 'infield', label: '内野席(三塁側)', at: [-38.7, -7.0], look: [0, -30, 0], fromY: 5 },
  );
  if (!NO_IN(quality)) WARPS.push(
    { k: 'concourse', label: '2 階コンコース(一塁側)', at: [58.2, 16.9], look: [50.5, 30.2, 7.0], fromY: 8.0 },   // 11/21 R17: 内野のコンコースは 2 階(5.5 m)
    { k: 'concourse2', label: '2 階コンコース(三塁側)', at: [-57.6, 16.2], look: [-49.9, 29.6, 7.0], fromY: 8.0 },
    { k: 'gate', label: 'Y デッキ(6 ゲートの前)', at: [-76.5, 13.1], look: [-60, 10, 7.0], fromY: 8.0 },
    { k: 'tunnel', label: '選手の通路', at: [31.4, 18.1], look: [22, 18.1, 1.0], fromY: 1.0 },
    { k: 'locker', label: 'ロッカー(一塁側)', at: [42.9, 7.1], look: [42.9, 12, 1.8], fromY: 1.8 },
    { k: 'interview', label: 'インタビューの部屋', at: [35.5, 20.1], look: [40, 20.1, 1.8], fromY: 1.8 },
    { k: 'bullpen', label: 'ブルペン(一塁側)', at: [56.6, -95.5], look: [56.6, -85, 1.0], fromY: 3 },
  );
}
if (RAIL) {
  // 汽笛ヶ原ボールパークの行き先(places の CAM の位置。地下の部屋は interior.glb、スマホでは読まないので外す)
  WARPS.length = 0;
  WARPS.push(
    { k: 'home', label: '本塁', at: [0, 2.6], look: [0, -60, 1.5], fromY: 3 },
    { k: 'mound', label: 'マウンド', at: [0, -19.6], look: [0, 0, 1.2], fromY: 3 },
    { k: 'outfield', label: '左翼の席', at: [-59.0, -104.6], look: [0, -20, 0], fromY: 7 },
    { k: 'infield', label: '内野席(三塁側)', at: [-43.2, 1.1], look: [0, -30, 0], fromY: 5 },
  );
  if (!NO_IN(quality)) WARPS.push(
    { k: 'concourse', label: 'コンコース(一塁側)', at: [39.9, 31.1], look: [50, 20, 7.8], fromY: 8.5 },   // R11 で床(6.27 m)が当たり判定に入った
    { k: 'corridor', label: '選手の通路', at: [18.0, 31.3], look: [30, 31.3, -2.4], fromY: -1.5 },
    { k: 'locker', label: 'ロッカー', at: [32.4, 22.6], look: [40, 22.6, -2.4], fromY: -1.5 },
    { k: 'interview', label: '記者会見の部屋', at: [13.4, 36.7], look: [13.4, 44, -2.4], fromY: -1.5 },
    { k: 'bullpen', label: '室内のブルペン', at: [59.2, -22.1], look: [59.2, -12, -3.9], fromY: -3 },
  );
}
if (RING) {
  // 銀輪ドームの行き先(places の LOC・CAM の位置。R11 で部屋の天井を下げ・奥へずらしたので部屋は R11 の CAM に合わせた。中の建物は interior.glb、スマホでは読まないので外す)
  WARPS.length = 0;
  WARPS.push(
    { k: 'home', label: '本塁', at: [0, 2.6], look: [0, -60, 1.5], fromY: 3 },
    { k: 'mound', label: 'マウンド', at: [0, -19.6], look: [0, 0, 1.2], fromY: 3 },
    { k: 'outfield', label: '外野席', at: [0, -132], look: [0, -20, 0], fromY: 13 },
    { k: 'infield', label: '内野席(三塁側)', at: [-51.2, -33.6], look: [0, -30, 0], fromY: 5 },
  );
  if (!NO_IN(quality)) WARPS.push(
    { k: 'concourse', label: '2階コンコース', at: [-34.9, 43.9], look: [-20, 50, 7.6], fromY: 8 },
    { k: 'concourse3', label: '5階コンコース', at: [-36.2, 46.0], look: [-50, 40, 19.6], fromY: 20 },
    ...(/nagoya_r(2[2-9]|[3-9]\d)_/.test(MDL.pre) ? [{ k: 'concourse4', label: '4階(プライム席の後ろ)', at: [-6, 52], look: [6, 50, 15.8], fromY: 16.5 }, { k: 'plaza', label: '1ゲートの前の広場', at: [-14, 80], look: [0, 62, 8], fromY: 7.5 }] : []),
    ...(/nagoya_r(2[3-9]|[3-9]\d)_/.test(MDL.pre) ? [{ k: 'alley3', label: '3階の横丁', at: [91.8, -3.2], look: [80, 20, 11.8], fromY: 11.5 }, { k: 'walkway', label: '駅への屋根つき通路', at: [-52, 82], look: [-30, 82, 7.6], fromY: 7.5 }] : []),   // 11/21 R23: 3F の横丁と駅への通路   // 11/21 R22: 4F の通路と 1 ゲートの前の広場
    { k: 'locker', label: 'ロッカー(一塁側)', at: [39.2, -0.6], look: [45, -0.6, 1.0], fromY: 1.0 },
    { k: 'interview', label: 'インタビューの部屋', at: [12.7, 23.7], look: [19, 23.7, 1.0], fromY: 1.0 },
    { k: 'corridor', label: '選手の通路', at: [31.5, 2.5], look: [40, 2.5, 0.3], fromY: -0.2 },   // R15 で段の裏の天井を下げ、一塁側へ向いても観客の足が見えない
    { k: 'bullpen', label: 'ブルペン(一塁側)', at: [63.3, -35.4], look: [63.3, -26, 0.6], fromY: 1.0 },
  );
}
if (GROVE) {
  // 森かげドームの行き先(places の CAM の位置。裏の部屋・売店の中は interior.glb、スマホでは読まないので外す)
  WARPS.length = 0;
  WARPS.push(
    { k: 'home', label: '本塁', at: [0, 2.6], look: [0, -60, 1.5], fromY: 3 },
    { k: 'mound', label: 'マウンド', at: [0, -19.6], look: [0, 0, 1.2], fromY: 3 },
    { k: 'bench', label: 'ベンチ(三塁側)', at: [-22.7, 0.9], look: [5, -40, 0.6], fromY: 1 },
    { k: 'infield', label: '内野席(本塁の後ろ)', at: [4.5, 33.3], look: [0, -60, 2], fromY: 12 },
    { k: 'infield1', label: '内野席(一塁側の上)', at: [62, -5], look: [-20, -70, 2], fromY: 14 },
    { k: 'outfield', label: '外野席(左翼)', at: [-58, -104], look: [0, -10, 2], fromY: 12 },
    { k: 'concourse', label: 'コンコース(一塁側)', at: [99.4, -27.6], look: [100.6, -60, 13.4], fromY: 14 },   // 11/19 作り込みE: 前の [88, -30] は席の中(屋根の中心から 89.8 m、コンコースは 99〜104 m)に下りていた
    { k: 'concourse3', label: 'コンコース(外野の森が見える所)', at: [-47, -138], look: [-95, -150, 16], fromY: 14 },
    ...(/morikage_r(1[2-9]|[2-9]\d)_/.test(GROVE_PRE) ? [{ k: 'gate', label: 'メインゲートの外', at: [4, -216], look: [4, -200, 17], fromY: 14 }, { k: 'plaza', label: 'ゲートの中の広場', at: [4, -186], look: [4, -150, 15], fromY: 14 }, { k: 'midconc1', label: '中段コンコース(一塁側)', at: [37.8, 18.8], look: [0, 8.5, 2], fromY: 8.5 }, { k: 'midconc3', label: '中段コンコース(三塁側)', at: [-37.8, 18.8], look: [0, 8.5, 2], fromY: 8.5 }] : /morikage_r11_/.test(GROVE_PRE) ? [{ k: 'gate', label: 'メインゲートの外', at: [0, -209], look: [0, -190, 16.5], fromY: 14 }, { k: 'plaza', label: 'ゲートの中の広場', at: [-6, -186], look: [0, -150, 15], fromY: 14 }] : [{ k: 'gate', label: 'メインゲートの外', at: [41.7, -176.4], look: [0, -48, 16], fromY: 14 }]),   // 11/21 R11: メインゲートはセンターの後ろの広場の外(z -195)
    { k: 'bullpen', label: 'ブルペン(三塁側)', at: [-62.5, -48.5], look: [-72, -58, 0.8], fromY: 2 },
  );
  if (!NO_IN(quality)) WARPS.push(
    { k: 'corridor', label: '選手の通路', at: [-25.7, 3.3], look: [-31, 7.6, 0.5], fromY: 1 },
    { k: 'locker', label: 'ロッカー(三塁側)', at: [-31.9, 8.5], look: [-36, 12, 0.5], fromY: 1 },
    { k: 'lounge', label: 'ラウンジ(本塁の後ろの地下)', at: [-8, 31], look: [6, 30, 0.5], fromY: 1 },
    { k: 'stairs', label: '関係者の階段', at: [11.5, 53.5], look: [11.5, 60, 1.0], fromY: 1 },
  );
}
if (CANAL) {
  // 舟灯ドームの行き先(研究の模型 KyoceraDome2026 の数から tools/kd_make_warps.py で作った。中の建物は interior.glb、スマホでは読まないので外す)
  WARPS.length = 0;
  WARPS.push(
    { k: 'home', label: '本塁', at: [0, 2.6], look: [0, -60, 1.5], fromY: 3 },
    { k: 'mound', label: 'マウンド', at: [0, -19.6], look: [0, 0, 1.2], fromY: 3 },
    { k: 'outfield', label: '外野席(右翼・下段)', at: [53.2, -111.9], look: [0, -20, 0], fromY: 12 },
    { k: 'infield', label: '内野席(一塁側・下段)', at: [65.9, -8.9], look: [0, -30, 0], fromY: 9 },
    { k: 'upper', label: '上段の席(本塁の後ろ)', at: [-30.1, 30.6], look: [0, -40, 0], fromY: 19.0 },
  );
  if (!NO_IN(quality)) WARPS.push(
    { k: 'concourse', label: '3階コンコース', at: [-89.3, -11.4], look: [-94.7, -35.6, 8.6], fromY: 8.5 },
    { k: 'concourse5', label: '5階コンコース', at: [90.4, -11.0], look: [78.8, 11.2, 21.2], fromY: 21.1 },
    { k: 'gate', label: '4ゲート(外のデッキ)', at: [-19.8, 63.8], look: [-17.6, 52.0, 9.0], fromY: 8.5 },
    { k: 'locker', label: 'ロッカー(一塁側)', at: [34.9, 8.7], look: [37.7, 11.5, 1.4], fromY: 1.6 },
    { k: 'corridor', label: '選手の通路', at: [27.8, 3.9], look: [31.3, 7.4, 1.1], fromY: 1.3 },
    { k: 'bullpen', label: 'ブルペン(一塁側)', at: [72.6, -37.3], look: [74.0, -35.9, 1.4], fromY: 1.6 },
  );
}
if (CANAL && !NO_IN(quality) && /funabi_r([8-9]|[1-9]\d)_/.test(CANAL_PRE)) WARPS.push(   // 11/21 舟灯 R8: 4 階の車いす席・2 階のモール(研究の模型 KyoceraDome2026 tools/kd_r8.py)
  { k: 'deck4', label: '4階 車いす席(一塁側)', at: [90.1, -34.4], look: [69.6, -36.6, 13.5], fromY: 16.5 },
  { k: 'mall', label: '2階 モール(外野の側)', at: [-15.5, -141.7], look: [-49.5, -129.6, 1.6], fromY: 3.0 },
  { k: 'mallgate', label: '南口(2階 モールの入口)', at: [0.0, -167.9], look: [0.0, -143.9, 2.0], fromY: 3.0 },
);
if (DOME) {
  WARPS.length = 0;
  WARPS.push(
    { k: 'home', label: '本塁', at: [0, 2.6], look: [0, -60, 1.5], fromY: 3 },
    { k: 'mound', label: 'マウンド', at: [0, -19.6], look: [0, 0, 1.2], fromY: 3 },
    { k: 'bench', label: 'ダグアウト(三塁側)', at: [-21, 3.2], look: [0, -28, 0.8], fromY: 1.0 },
    { k: 'infield', label: '1階内野席', at: [36, 28.4], look: [0, -30, 0], fromY: 16 },
    { k: 'upper', label: '2階席の一番上', at: [0, 66], look: [0, -40, 0], fromY: 42 },
    { k: 'outfield', label: '外野席', at: [60.6, -98], look: [0, -20, 0], fromY: 13 },
    { k: 'front', label: '外の正面', at: [0, 100], look: [0, 30, 26], fromY: 14 },
    // 以下はドームを歩く(Downloads\ドーム_歩く_2026-11-17、R11)の行き先と同じ座標・向き
    { k: 'gate', label: 'ゲートの中', at: [0, 67], look: [-25, 55, 11.8], fromY: 12 },
    { k: 'concourse', label: '2階コンコース(ゲートの階)', at: [4.3, 62.9], look: [-12, 63.6, 11.8], fromY: 12 },   // 11/19 作り込み B: 本物はゲートとデッキが 2F(模型の A の階)
    { k: 'concourse1', label: '1階コンコース(グルメストリート)', at: [40, 45], look: [55, 30, 7.1], fromY: 9.5 },   // R25: 下の階(本物の 1F)
    { k: 'concourse3', label: '4階コンコース', at: [-69.5, 15.5], look: [-80, 4.5, 28.5], fromY: 28.5 },
    { k: 'bullpen', label: 'ブルペン(一塁側)', at: [58, -90.5], look: [66, -82, 1.0], fromY: 3 },
    { k: 'corridor', label: '選手の通路', at: [0, 32.4], look: [15, 31.5, 1.5], fromY: 1.5 },
    { k: 'locker', label: 'ロッカー(一塁側)', at: [40, 12.2], look: [44, 16, 1.4], fromY: 1.5 },
    { k: 'interview', label: 'インタビューの部屋', at: [5, 36], look: [5, 41, 1.4], fromY: 1.5 },
  );
}
function placeAt(x, z, lookX, lookZ, lookY, fromY = 60) {
  const y = groundAt(x, z, fromY, 120) ?? 0;
  player.pos.set(x, y + 0.02, z);
  player.vel.set(0, 0, 0); player.onGround = true; player.lastSafe.copy(player.pos); safeHist.length = 0; fallFrom.y = player.pos.y;
  const dx = lookX - x, dz = lookZ - z, dy = lookY - (y + P.eye);
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
}
function warp(i, quiet) {
  const w = WARPS[i];
  if (!w || !bvh) return;
  if (freeplay && freeplay.warpBlocked(w)) return;   // 観戦: チケットを持たずに一度外へ出た人は、ワープで中へ入れない(js/freeplay.js)
  leaveMode();
  placeAt(w.at[0], w.at[1], w.look[0], w.look[1], w.look[2], w.fromY || 60);
  if (!quiet) toast(w.label);
}
// 出入口: 外 ⇔ 中(この球場のモデルには外から席へ上がる階段の中身が無いので、門をくぐると中へ移る)
// 位置は places の自動調べ(tools/probe.py)で決めた。from に近づいて E で to へ
const DOORS = [
  { at: [-4, 76], to: [-10, 62.5], label: '中へ入る(内野席の上へ)', look: [0, -45, -2] },
  { at: [-10, 63.5], to: [-4, 78], label: '外へ出る(正面の門へ)', look: [-4, 60, 4], y: 'high', fromY: 10 },
  { at: [116, -66], to: [80, -60], label: '中へ入る(アルプス席へ)', look: [0, -25, 0], fromY: 10 },
  { at: [103, -66], to: [116, -64], label: '外へ出る(アルプスの外へ)', look: [160, -64, 1.6], y: 'high', fromY: 10 },
  { at: [-28, -151], to: [-28, -162], label: '外へ出る(外野の外へ)', look: [-28, -220, 1.6], y: 'high', fromY: 10 },
  { at: [-28, -162], to: [-30, -131], label: '中へ入る(外野席へ)', look: [0, 0, 0] },
  { at: [26, -1.2], to: [33, 14], label: 'ベンチ裏から内野席へ', look: [0, -40, 1.5] },
  { at: [31, 13.0], to: [21.5, -5.5], label: 'グラウンドへ降りる', look: [-10, -40, 1.5], y: 'high' },
];
if (DOME || PARK || RING || GROVE || RAIL || BOWL || SHORE || NORTH || ROOFPARK) DOORS.length = 0;   // 甲子園の出入口の位置はドームでは使わない
window.__DOORS = DOORS;

// ---------------------------------------------------------------- 座る
let mode = 'walk';    // walk | sit | defense | bat | pitch
let seatIdx = -1;
const SEAT_EYE = 0.82;
// 11/21 持ち主「席座ると前の人が邪魔で見えにくい」: 座った目を少し上げ(背すじを伸ばした高さ)、目の前の数列の人だけ低く座らせる(js/crowd.js の SEAT_VIEW)。?noseatview=1 で前のまま
const SEATVIEW = { on: !/[?&]noseatview/.test(location.search), eye: 0.9, dist: 18, idx: -1, tan: 0.4 };
const _sv = new THREE.Vector3();
function seatEye() { return SEATVIEW.on ? SEATVIEW.eye : SEAT_EYE; }
// 席の前へ同じ列の筋をたどって最前列を探し、目から最前列の手すりの上を通る線の下がり(前 1 m あたり)を返す。座った時に 1 回だけ
function seatSightTan(i) {
  const fx = -Math.sin(seats.yaw[i]), fz = -Math.cos(seats.yaw[i]), ey = seats.y[i] + seatEye();
  let fd = 0, fy = seats.y[i];
  for (let d = 0.6; d < 70; d += 0.4) {
    const x = seats.x[i] + fx * d, z = seats.z[i] + fz * d, c = seats.grid.get(cellKey(x, z));
    let hit = false;
    if (c) for (const j of c) if (seats.y[j] > -100 && Math.abs(seats.x[j] - x) < 0.5 && Math.abs(seats.z[j] - z) < 0.5 && seats.y[j] < fy + 0.15) { hit = true; if (seats.y[j] < fy) fy = seats.y[j]; }
    if (hit) fd = d; else if (d - fd > 6) break;
  }
  if (fd < 0.5) return 0.4;   // 最前列(前に人がいない)
  return Math.max(0.12, Math.min(1.4, 1.2 * (ey - (fy + 0.5)) / (fd + 1.0)));   // 1.2 倍: 手すりの下のグラウンドの手前まで見えるように(12 球場の撮影で決めた。1.5 倍だと前の列が椅子ばかりに見える)
}
// 毎フレーム(placeCamera から): 座っている間だけ観客に目の前を知らせる。立ったら戻す
function syncSeatView() {
  if (!crowd || !crowd.setSeatView) return;
  if (mode !== 'sit' || seatIdx < 0 || !SEATVIEW.on) { if (SEATVIEW.idx !== -1) { crowd.setSeatView(null); SEATVIEW.idx = -1; } return; }
  const i = seatIdx;
  if (SEATVIEW.idx !== i) { SEATVIEW.idx = i; SEATVIEW.tan = seatSightTan(i); }
  _sv.set(seats.x[i], seats.y[i] + seatEye(), seats.z[i]);
  crowd.setSeatView(_sv, -Math.sin(seats.yaw[i]), -Math.cos(seats.yaw[i]), SEATVIEW.tan, SEATVIEW.dist);
}
function nearestSeat(maxD = 1.1) {
  let best = -1, bd = maxD;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const c = seats.grid.get(cellKey(player.pos.x + dx * 2, player.pos.z + dz * 2));
    if (!c) continue;
    for (const i of c) {
      const dy = seats.y[i] - player.pos.y;
      if (dy < -0.2 || dy > 1.1) continue;
      const d = Math.hypot(seats.x[i] - player.pos.x, seats.z[i] - player.pos.z);
      if (d < bd) { bd = d; best = i; }
    }
  }
  return best;
}
function sit(i) {
  seatIdx = i; mode = 'sit';
  player.vel.set(0, 0, 0);
  player.yaw = seats.yaw[i]; player.pitch = -0.1;
  sound.play('tick', { gain: 0.15, rate: 0.7 });
  toast('座りました', 'E(緑のボタン)で立つ');
}
function standUp() {
  if (mode !== 'sit') return;
  const i = seatIdx;
  mode = 'walk'; seatIdx = -1;
  // 席の前(グラウンド側)の段に立つ
  const yaw = seats.yaw[i];
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  for (const d of [0.38, 0.55, 0.2, 0.75]) {
    const x = seats.x[i] + fx * d, z = seats.z[i] + fz * d;
    const g = groundAt(x, z, seats.y[i] + 0.2, 1.5);
    if (g !== null) { player.pos.set(x, g + 0.01, z); break; }
  }
  player.vel.set(0, 0, 0); player.onGround = true; player.lastSafe.copy(player.pos);
}

// ---------------------------------------------------------------- グラウンド: ベースを踏む・ダイヤモンド一周
const BASES = [
  { k: 'home', label: '本塁', p: new THREE.Vector3(0, 0, -0.22) },
  { k: 'first', label: '一塁', p: new THREE.Vector3(19.07, 0, -19.4) },
  { k: 'second', label: '二塁', p: new THREE.Vector3(0, 0, -38.8) },
  { k: 'third', label: '三塁', p: new THREE.Vector3(-19.07, 0, -19.4) },
];
const lap = { state: 'idle', t0: 0, next: 1, onBase: -1, best: load('r4walk.lapBest', null), last: null };
let simTime = 0;
function updateBases() {
  if (mode !== 'walk' || player.pos.y > 0.6) { lap.onBase = -1; return; }
  let on = -1;
  for (let i = 0; i < 4; i++) {
    const b = BASES[i].p;
    if (Math.hypot(player.pos.x - b.x, player.pos.z - b.z) < (i === 0 ? 0.45 : 0.42)) on = i;
  }
  if (on !== lap.onBase && on >= 0) {
    sound.play('tick', { gain: 0.35, rate: 1.0 + on * 0.05 });
    if (on === 0 && lap.state === 'run' && lap.next === 4) {
      const t = simTime - lap.t0;
      lap.state = 'idle'; lap.last = t;
      if (!lap.best || t < lap.best) { lap.best = t; store('r4walk.lapBest', t); toast(`一周 ${t.toFixed(2)} 秒`, '自己ベスト'); }
      else toast(`一周 ${t.toFixed(2)} 秒`, `ベスト ${lap.best.toFixed(2)} 秒`);
      sound.crowd('cheer', 0.4);
    } else if (on === 0) {
      lap.state = 'ready'; lap.next = 1;
    } else if (lap.state === 'run' && on === lap.next) {
      lap.next++;
      toast(BASES[on].label, `${(simTime - lap.t0).toFixed(2)} 秒`);
    } else if (lap.state === 'run' && on !== lap.next) {
      toast(`${BASES[on].label}(順番がちがいます)`);
    }
  }
  if (on === -1 && lap.onBase === 0 && lap.state === 'ready') { lap.state = 'run'; lap.t0 = simTime; lap.next = 1; }
  if (lap.state === 'run' && simTime - lap.t0 > 90) lap.state = 'idle';
  lap.onBase = on;
}

// ---------------------------------------------------------------- そのとき E でできること
function currentAction() {
  if (mode === 'sit') { const fs = freeplay && freeplay.sitAction(); if (fs) return fs; return { label: '立つ', run: standUp }; }   // すっきり: 座って食べ物を持っていれば「食べる」
  if (freeplay && (mode === 'walk' || mode === 'drive' || mode === 'fprest')) { const fa = freeplay.action(mode); if (fa) return fa; }   // 近くの物に触る(js/freeplay.js)
  if (gimmicks && !(freeplay && freeplay.simple)) { const ga = gimmicks.action(mode); if (ga) return ga; }   // すっきりの形では名物の E の札は出さない(見た目はそのまま)   // 球場の名物(js/gimmicks.js)
  if (mode !== 'walk') return null;
  const px = player.pos.x, pz = player.pos.z, py = player.pos.y;
  for (const d of (passages && passages.segs.length ? [] : DOORS)) {   // 11/19 通路口・ゲートで歩いて行けるので、E で飛ぶ出入口は使わない(?nopass=1 の時だけ前の出入口)
    if (Math.hypot(px - d.at[0], pz - d.at[1]) < 2.4 && (d.y !== 'high' ? py < 3 : true)) {
      return { label: d.label, run: () => { placeAt(d.to[0], d.to[1], d.look[0], d.look[1], d.look[2], d.fromY || 60); toast(d.label.replace(/(.*)\((.*)\)/, '$2') || d.label); } };
    }
  }
  if (py < 0.6 && Math.hypot(px - 0, pz - 0) < 2.6 && pz > -2) return { label: '打席に立つ', run: () => play.enterBat() };
  if (py < 0.8 && Math.hypot(px, pz + 18.4) < 2.6) return { label: 'マウンドに立つ', run: () => play.enterMound() };
  const s = nearestSeat();
  if (s >= 0) { const ok = freeplay ? freeplay.canSit(s) : true; return ok === true ? { label: '座る', run: () => sit(s) } : { label: ok, run: () => freeplay.seatRefuse(s) }; }   // 観戦のチケットの区画だけ座れる(js/freeplay.js)
  if (fieldFall) { const fa = fieldFall.action(mode); if (fa) return fa; }   // 11/21 グラウンドから客席へよじ登る・最前列(席の無い所)からグラウンドへ降りる(js/fallguard.js。座れる席の前では「座る」が先)
  return freeplay ? freeplay.useAction(mode) : null;   // 何も近くに無い時は、持っている物を使う
}
let curAction = null;
function doAction() { if (curAction) curAction.run(); }

function leaveMode() {
  if (freeplay) freeplay.leave();
  if (mode === 'sit') standUp();
  if (mode === 'bat' || mode === 'pitch') play.exit(true);
  if (cursor && cursor.on) cursor.exit(true);
  if (mode === 'defense') defense.stop(true);
  mode = 'walk';
}

// ---------------------------------------------------------------- 視点(カメラ)
// 1p 自分の目 / 3p 後ろから(肩越し) / tv テレビ中継 / backnet バックネット裏 / top 上から
const VIEWS = ['1p', '3p', 'tv', 'backnet', 'top'];
const VIEW_LABEL = { '1p': '自分の目', '3p': '後ろから', tv: 'テレビ中継', backnet: 'バックネット裏', top: '上から' };
const FIXED = new Set(['tv', 'backnet', 'top']);
let view = load('r4walk.view2', '1p');   // 初めは自分の目。11/18 に保存の名前を替えて、前に残った「後ろから」を一度捨てた(その後に選んだ物は覚える)
if (!['1p', '3p'].includes(view)) view = '3p';   // 前に残したテレビ中継などは後ろからに戻す
const fixedOff = { yaw: 0, pitch: 0 };
const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 70, init: false, blend: 0 };
function activeView() {
  if (mode === 'bat' || mode === 'pitch' || mode === 'sit') return '1p';
  if (mode === 'walk' && FIXED.has(view)) return '3p';
  return view;
}
function setView(v, quiet) {
  if (!VIEWS.includes(v)) return;
  view = v; store('r4walk.view2', v);
  fixedOff.yaw = fixedOff.pitch = 0;
  cam.blend = 0.45;
  if (!quiet) toast(VIEW_LABEL[activeView()], '', { ms: 900 });
  if (ui) ui.refresh();
}
function cycleView() {
  const list = ['1p', '3p'];   // 切り替えは自分の目と後ろからだけ(テレビ中継などはゲームが中で使う時だけ)
  const i = list.indexOf(activeView());
  setView(list[(i + 1) % list.length]);
}
function moveYaw() {
  if (FIXED.has(activeView())) { const d = camera.getWorldDirection(_v1); return Math.atan2(-d.x, -d.z); }
  return player.yaw;
}
// 球場の中のカメラ: 見る点からカメラへ線を引き、壁・スタンドに当たったら手前に寄せる
function clearCam(look, want) {
  _ray.origin.copy(look); _v2.subVectors(want, look);
  const d = _v2.length(); if (d < 1e-3) return want;
  _ray.direction.copy(_v2).divideScalar(d);
  const h = bvh ? bvh.raycastFirst(_ray, THREE.DoubleSide, 0, d) : null;
  if (h) return look.clone().addScaledVector(_ray.direction, Math.max(0.6, h.distance - 0.35));
  return want;
}
function desiredCam(v, out) {
  const me = player.pos;
  const dball = defense && defense.active ? defense.ballWorld() : null;
  if (v === '3p') {
    const pitch = THREE.MathUtils.clamp(player.pitch, -0.75, 0.55);
    const fwd = new THREE.Vector3(-Math.sin(player.yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(player.yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const act = mode === 'defense' && defense ? defense.meAct : null;
    const dv = act && act.kind === 'dive' ? Math.sin(Math.min(1, act.t / act.dur) * Math.PI) : 0;
    const target = new THREE.Vector3(me.x, me.y + 1.45 - 0.55 * dv + Math.sin((act ? act.t : 0) * 38) * 0.025 * dv, me.z).addScaledVector(right, 0.42);
    // 縦持ちは横の見える幅が狭いので、少し引いて高く・広く
    const tall = camera.aspect < 1;
    const want = target.clone().addScaledVector(fwd, tall ? -4.6 : -3.7).add(new THREE.Vector3(0, tall ? 1.1 : 0.55, 0));
    // 上を見上げても、カメラは地面に潜らない(足もとより 1.2 m 上に保つ)
    want.y = Math.max(want.y, me.y + 1.2);
    out.pos.copy(clearCam(target, want));
    // 後ろがフェンスや壁でふさがれている時は、カメラを上へ持ち上げて見下ろす(選手に寄りすぎない)
    if (out.pos.distanceTo(target) < 2.2) {
      const fh = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
      // 壁に沿って横から見る(フェンス際の跳び上がりが見える)。だめなら斜め上から
      const rh = new THREE.Vector3(-fh.z, 0, fh.x);
      for (const cand of [target.clone().addScaledVector(rh, 2.6).addScaledVector(fh, 1.2).add(new THREE.Vector3(0, 0.6, 0)), target.clone().addScaledVector(rh, -2.6).addScaledVector(fh, 1.2).add(new THREE.Vector3(0, 0.6, 0)),
        target.clone().addScaledVector(fh, -0.8).add(new THREE.Vector3(0, 3.0, 0))]) {
        const c = clearCam(target, cand);
        if (c.distanceTo(target) > Math.max(1.8, out.pos.distanceTo(target))) {
          out.pos.copy(c);
          out.look.copy(target).add(new THREE.Vector3(0, 0.5, 0)).addScaledVector(fh, 0.4);
          out.fov = camera.aspect < 1 ? 80 : 68;
          return;
        }
      }
    }
    out.look.copy(target).addScaledVector(fwd, 6);
    out.fov = tall ? 80 : 68;
    return;
  }
  const off = (p, k = 1) => { // 指でなぞった分だけ、カメラを見る点のまわりに回す
    const d = p.clone().sub(out.look); const r = Math.hypot(d.x, d.z);
    const a = Math.atan2(d.x, d.z) + fixedOff.yaw * k;
    return new THREE.Vector3(out.look.x + Math.sin(a) * r, p.y + fixedOff.pitch * 25 * k, out.look.z + Math.cos(a) * r);
  };
  if (v === 'tv') {
    const pre = defense && defense.active && (!defense.play || defense.play.phase === 'pre') && !dball;
    if (pre) {
      // いつもの中継の画面: センターの後ろの高い所から、投手越しに本塁
      out.look.set(0, 1.3, -4); out.pos.copy(off(new THREE.Vector3(-3.5, 17, -124))); out.fov = 13;
    } else {
      // 打球が飛んだら、本塁の後ろの高い所から打球と自分を追う
      const a = dball || me, b = me;
      out.look.set((a.x + b.x) / 2, Math.min(4, (a.y + b.y) / 2 + 0.8), (a.z + b.z) / 2);
      out.pos.copy(off(new THREE.Vector3(out.look.x * 0.15, 13, 9)));   // 本塁の後ろ、ネットの手前の高い所(屋根の下に入らない)
      const spread = Math.hypot(a.x - b.x, a.z - b.z) + 14;
      out.fov = THREE.MathUtils.clamp(2 * Math.atan(spread / 2 / out.pos.distanceTo(out.look)) * 180 / Math.PI * 1.25, 14, 55);
    }
  } else if (v === 'backnet') {
    out.look.set(me.x * 0.35, 0, -46 + (me.z + 46) * 0.35);
    out.pos.copy(off(new THREE.Vector3(0, 21, 36))); out.fov = camera.aspect < 1 ? 72 : 52;
  } else {
    // 上から: 内野と外野の手前が全部入る高さ。自分の方へ少し寄せる
    out.look.set(me.x * 0.3, 0, -38 + (me.z + 38) * 0.3);
    out.pos.copy(off(new THREE.Vector3(out.look.x * 0.5, 58, out.look.z + 36))); out.fov = camera.aspect < 1 ? 78 : 58;
  }
  out.pos.copy(clearCam(out.look, out.pos));
}
const _want = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 70 };
function placeCamera(dt = 1 / 60) {
  syncSeatView();
  if (camOverride) { cam.init = false; return; }
  const v = activeView();
  if (mode === 'sit') {
    const i = seatIdx;
    camera.position.set(seats.x[i], seats.y[i] + seatEye(), seats.z[i]);
    camera.position.x += Math.sin(seats.yaw[i]) * 0.06; camera.position.z += Math.cos(seats.yaw[i]) * 0.06;
    camera.rotation.set(player.pitch, player.yaw, 0);
    setFov(70); cam.init = false;
    return;
  }
  if (v === '1p') {
    camera.position.set(player.pos.x, player.pos.y + P.eye, player.pos.z);
    // 11/25 飛び込みの間は目が下がって少し前へ流れ、少し下を向く(酔わない程度。dip は defense.js の updateAct)
    const dva = mode === 'defense' && defense && defense.meAct && defense.meAct.kind === 'dive' && defense.meAct.dip ? defense.meAct : null;
    // 11/26 正面の飛び込み: 向き直る間は目線も打球の方へ回り、踏み切ると目線が前へ低く滑り込む(腹ばいの頭の高さ・前)
    const fdv = mode === 'defense' && defense && defense.meAct && defense.meAct.kind === 'dive' && defense.meAct.front ? defense.meAct : null;
    if (fdv && Number.isFinite(fdv.yawNow)) player.yaw = fdv.yawNow;
    if (fdv) { camera.position.y -= 1.2 * fdv.dip; camera.position.x += fdv.dir.x * 1.05 * fdv.dip; camera.position.z += fdv.dir.z * 1.05 * fdv.dip; }
    else if (dva) { camera.position.y -= 0.85 * dva.dip; camera.position.x += dva.dir.x * 0.45 * dva.dip; camera.position.z += dva.dir.z * 0.45 * dva.dip; }
    camera.rotation.set(player.pitch - (dva ? 0.12 * dva.dip : 0), player.yaw, 0);
    setFov(70);
    if (cam.blend > 0) blendFrom(dt);
    else { cam.pos.copy(camera.position); cam.look.copy(camera.position).add(camera.getWorldDirection(_v1)); cam.fov = 70; cam.init = true; }
    return;
  }
  desiredCam(v, _want);
  if (!cam.init) { cam.pos.copy(_want.pos); cam.look.copy(_want.look); cam.fov = _want.fov; cam.init = true; }
  // 中継などの視点はなめらかに追う。後ろからはそのまま付いていく(切り替えの直後だけなめらかに)
  const k = v === '3p' && cam.blend <= 0 ? 1 : 1 - Math.exp(-(cam.blend > 0 ? 7 : 4.5) * dt);
  cam.pos.lerp(_want.pos, k); cam.look.lerp(_want.look, k); cam.fov += (_want.fov - cam.fov) * k;
  if (cam.blend > 0) cam.blend -= dt;
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
  setFov(cam.fov);
}
function blendFrom(dt) {
  // 一人称へ切り替えた直後: 前のカメラから目の位置へ寄せる
  const k = 1 - Math.exp(-8 * dt);
  cam.pos.lerp(camera.position, k);
  const tgt = camera.position.clone().add(camera.getWorldDirection(_v1));
  cam.look.lerp(tgt, k);
  cam.blend -= dt;
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
}
function setFov(f) { if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); } }

// ---------------------------------------------------------------- 自分の選手の姿(一人称以外で見える)
let me = null, meYaw = 0, meNum = null;
const POS_NUM = { P: 1, C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9 };
function buildMe() {
  me = new Person({ ...KIT.home, cap: 0xff7a1a }, { numColor: 0xff7a1a });   // 帽子の色だけ変えて、自分と分かるように
  scene.add(me.root);
  const c = document.createElement('canvas'); c.width = c.height = 128;
  meNum = { canvas: c, tex: new THREE.CanvasTexture(c), shown: null };
  meNum.tex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), new THREE.MeshBasicMaterial({ map: meNum.tex, transparent: true }));
  plate.position.set(0, 0.33, 0.152); me.spine.add(plate);
  me.root.visible = false;
}
function setBackNumber(n) {
  if (me && me.setNumber) me.setNumber(n ? String(n) : '');
  if (!meNum || meNum.shown === n) return;
  const g = meNum.canvas.getContext('2d'); g.clearRect(0, 0, 128, 128);
  if (n) { g.font = '900 104px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1f3557'; g.fillText(String(n), 64, 70); }
  meNum.tex.needsUpdate = true; meNum.shown = n;
}
let mePhase = 0;
// 11/26 正面への飛び込みの体: 腕を頭の上へ伸ばした形(athletes.js の dive → fly_catch の捕る所)を、足もとを軸に前へ倒す。
// 踏み切りで浮き(0.3 m)、宙で水平に近づき、腹から着地して滑り、起き上がる。グラブの先が当たり判定の帯の先(defense.js の diveTip)に来るよう、体を後ろへずらす
// 11/27 持ち主「埋まってる」: 前は 1.6 rad(92 度)倒して腹の高さ 0.03 m だったので、胴の厚みと頭・踏み出した足が地面に 0.35 m もぐっていた。
//   倒すのは 90 度まで、脚もまっすぐ後ろへ伸ばし(athletes.js の _applyReach)、骨から体の厚みを引いた一番低い所が地面に乗るよう持ち上げる(athletes.js の _groundClamp。groundY を入れる)
const FD = { pitch: 1.45, prone: 1.57, lift: 0.3, belly: 0, back: 0.5 };
function frontDivePose(act) {
  const lt = act.lt ?? act.t, sm = (x) => x * x * (3 - 2 * Math.max(0, Math.min(1, x)));
  if (lt < 0) return;
  let ph, y;
  if (lt < 0.14) { ph = sm(lt / 0.14) * (FD.pitch - 0.08); y = sm(lt / 0.14) * FD.lift; }
  else if (lt < 0.42) { const u = (lt - 0.14) / 0.28; ph = FD.pitch - 0.08 * (1 - u) + (FD.prone - FD.pitch) * sm(u); y = FD.lift + (FD.belly - FD.lift) * sm(u); }
  else if (lt < 0.95) { ph = FD.prone; y = FD.belly; }
  else { const u = sm((lt - 0.95) / 0.4); ph = FD.prone * (1 - u); y = FD.belly * (1 - u); }
  me.root.rotation.order = 'YXZ';
  me.root.rotation.x = -ph;
  me.reach = lt < 0.95 ? Math.min(1, lt / 0.1) : Math.max(0, 1 - (lt - 0.95) / 0.3);   // 両腕を頭の先へ(athletes.js の _applyReach)
  me.root.position.y += y;
  me.groundY = player.pos.y;   // 11/27 体の一番低い所をここより下へ入れない(athletes.js の _groundClamp)
  const bk = FD.back * Math.sin(ph);
  me.root.position.x -= act.dir.x * bk; me.root.position.z -= act.dir.z * bk;
}
function updateMe(dt) {
  if (!me) return;
  const vis = started && !overlayOn && (mode === 'walk' || mode === 'defense') && activeView() !== '1p';
  // 11/23 リプレイ: 一人称の守備でも自分の体を動かしておく(カメラに映らない層 31。リプレイの時だけ映す)
  const ghost = !vis && started && !overlayOn && mode === 'defense' && activeView() === '1p';
  if (!!me._ghost !== ghost) { me._ghost = ghost; me.root.traverse((o) => o.layers.set(ghost ? 31 : 0)); }
  if (replay && replay.on) return;
  player.faceYaw = activeView() === '1p' ? player.yaw : meYaw;   // 11/26 飛び込む向き(一人称はカメラの前、三人称は体の前。defense.js の dive)
  me.root.visible = vis || ghost;
  if (!vis && !ghost) return;
  // 11/21 攻略組の声「客として回る時もグローブをはめている」: 歩く時はグラブを外す(守備の時だけ付ける)
  if (me.parts && me.parts.Glove) { const g = mode === 'defense'; if (me._gloveOn !== g) { me.parts.Glove.forEach((m) => (m.visible = g)); me._gloveOn = g; } }
  setBackNumber(mode === 'defense' && defense.my ? POS_NUM[defense.my] : null);
  me.root.position.copy(player.pos);
  if (me.root.rotation.x) me.root.rotation.x = 0;   // 11/26 飛び込みの前へ倒した分を戻す
  if (me.reach) me.reach = 0;
  if (me.groundY != null) me.groundY = null;
  const mv = player.mv || { x: 0, z: 0 };
  const sp = Math.hypot(mv.x, mv.z);
  let want = player.yaw;
  if (sp > 0.4) want = Math.atan2(-mv.x, -mv.z);
  else if (mode === 'defense') { const b = defense.ballWorld(); if (b) want = Math.atan2(-(b.x - player.pos.x), -(b.z - player.pos.z)); else if (defense.facePoint) want = Math.atan2(-(defense.facePoint.x - player.pos.x), -(defense.facePoint.z - player.pos.z)); }
  let d = want - meYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  meYaw += d * (1 - Math.exp(-12 * dt));
  me.root.rotation.y = meYaw;
  const anim = mode === 'defense' ? defense.meAnim : null;
  const act = mode === 'defense' ? defense.meAct : null;
  if (me.setHolding) me.setHolding(mode === 'defense' && defense.holding && defense.holding());
  const prep = mode === 'defense' && defense.prep && defense.play && defense.play.t < defense.prep.until ? defense.prep : null;
  if (act) {
    if (act.kind === 'dive' && act.front) { meYaw = act.yawNow; me.root.rotation.y = meYaw; frontDivePose(act, dt); }   // 11/26 正面へ頭から(体を前へ倒す。下の frontDivePose)
    else if (act.kind === 'dive') { meYaw = Math.atan2(-act.dir.x, -act.dir.z) + (act.yawOff || 0); me.root.rotation.y = meYaw; }   // 11/25 yawOff: 頭が飛ぶ向きを向くように(defense.js の DV)
    if (act.kind === 'dive' && act.front && act.lt < 0) { mePhase += dt * 10; me.set('run', { phase: mePhase, speed: 0.6, v: 4 }); }   // 向き直る間は足を運ぶ
    else me.set(act.kind, { u: act.t / act.dur, t: act.animT ?? act.t, front: !!act.front, lt: act.lt });
  } else if (prep && !(anim && anim.kind === 'throw' && anim.t > 0)) {
    if (anim && anim.t > 0) anim.t -= dt;
    me.set('catch', { clip: prep.clip, start: prep.start, id: prep.id });
  } else if (anim && anim.t > 0) {
    anim.t -= dt;
    if (anim.kind === 'throw') me.set('throw', { u: 1 - anim.t / anim.dur });
    else me.set('catch', { h: anim.h ?? 0 });
  } else if (sp > 0.4) { mePhase += dt * (6 + sp * 1.1); me.set('run', { phase: mePhase, speed: Math.min(1, sp / 6), v: sp }); }
  else me.set(mode === 'defense' ? (defense.holding() ? 'stand' : 'ready') : 'stand');
}
// 自分の手の位置(球を持つ)。一人称なら画面の右下、ほかは選手の右手
function myHandPos() {
  if (me && me.root.visible && !me._ghost) {
    me.root.updateMatrixWorld(true);
    // 捕った直後はグラブ(左手)、そのあと投げる手(右手)に持ちかえる
    const glove = defense && defense.meAnim && defense.meAnim.kind === 'catch' && defense.meAnim.t > 0;
    return me.arms[glove ? 0 : 1].hand.getWorldPosition(new THREE.Vector3());
  }
  return new THREE.Vector3(0.22, -0.28, -0.5).applyQuaternion(camera.quaternion).add(camera.position);
}

// ---------------------------------------------------------------- 入力(PC)
const LOOK = 0.0022;
// 守備の PC: マウスを動かすだけでは回らない。右ボタン(または左ドラッグ)で動かした時だけ視点が動く。左クリックは投げる野手を選ぶ
const drag = { on: false, btn: 0, x: 0, y: 0, moved: 0 };
canvas.addEventListener('mousedown', (e) => {
  if (!started || IS_TOUCH || overlayOn) return;
  if (mode === 'bat') { play.onPointer(e.clientX, e.clientY, 'down', e.button); return; }
  if (mode === 'defense') { Object.assign(drag, { on: true, btn: e.button, x: e.clientX, y: e.clientY, moved: 0 }); look.lastT = simTime; return; }
  if (document.pointerLockElement !== canvas) { if (!document.body.classList.contains('photo')) lockPointer(); return; }
  if (mode === 'pitch') { play.onPointer(e.clientX, e.clientY, 'down', e.button); return; }
  if (mode === 'defense') { defense.onPointer('down', e.button); return; }
  if (e.button === 0 && freeplay && freeplay.click()) return;   // 持っている物を使う(投げる・打つ・食べる…)
  if (e.button === 2 && mode === 'walk' && !cursor && player.pos.y < 0.8 && Math.hypot(player.pos.x, player.pos.z + 18.4) < 2.6) { play.enterMound(); play.onPointer(0, 0, 'down', 2); }
});
addEventListener('mouseup', (e) => {
  if (!started || IS_TOUCH) return;
  if (drag.on) {
    drag.on = false; look.lastT = simTime;
    if (mode === 'defense' && drag.btn === 0 && drag.moved <= 6) defense.pickAt(e.clientX, e.clientY);
    return;
  }
  if (mode === 'bat' || mode === 'pitch') play.onPointer(e.clientX, e.clientY, 'up', e.button);
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
// 手で動かした分はためておき、毎フレーム少しずつ回す(なめらかに・少しの慣性と減速)
const lookPend = { yaw: 0, pitch: 0 };
function turnBy(dx, dy, kx, ky) { lookPend.yaw -= dx * kx; lookPend.pitch -= dy * ky; }
function applyLook(dt) {
  const k = 1 - Math.exp(-14 * dt);
  const dy = lookPend.yaw * k, dp = lookPend.pitch * k;
  lookPend.yaw -= dy; lookPend.pitch -= dp;
  if (Math.abs(dy) + Math.abs(dp) < 1e-7) return;
  if (FIXED.has(activeView())) {
    fixedOff.yaw = THREE.MathUtils.clamp(fixedOff.yaw + dy * 0.6, -0.9, 0.9);
    fixedOff.pitch = THREE.MathUtils.clamp(fixedOff.pitch - dp * 0.5, -0.35, 0.35);
    return;
  }
  // 上下は真上・真下までは向かない
  const lim = mode === 'defense' ? 0.9 : 1.45;
  player.yaw += dy;
  player.pitch = THREE.MathUtils.clamp(player.pitch + dp, -lim, lim);
}
document.addEventListener('mousemove', (e) => {
  if (mode === 'bat') { play.onPointer(e.clientX, e.clientY, 'move'); return; }
  if (document.pointerLockElement === canvas && !overlayOn) turnBy(e.movementX, e.movementY, LOOK, LOOK);
  else if (mode === 'defense' && !overlayOn) {
    if (drag.on) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.btn === 2 || drag.moved > 6) { turnBy(dx, dy, 0.0032, 0.002); look.lastT = simTime; }
    } else defense.hoverAt(e.clientX, e.clientY);
  }
});
let quietUnlock = false;
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  $('cross').classList.toggle('hide', !locked || mode === 'bat' || activeView() !== '1p');
  refreshHint();
  // Esc でマウスが離れたら一時停止のメニュー
  if (!locked && started && !overlayOn && !quietUnlock && !document.body.classList.contains('photo') && mode !== 'bat') ui.pause();
  quietUnlock = false;
});
function releasePointer() { if (document.pointerLockElement) { quietUnlock = true; try { document.exitPointerLock(); } catch (e) { /* */ } } }
function refreshHint() {
  const h = mode === 'cbat' ? 'マウスでカーソルを球へ ・ クリックか Space で振る ・ 右クリックか F で強振/ミート ・ E で打席を出る ・ Esc'
    : mode === 'cmound' ? 'マウスで投げる所 ・ 1〜4 で球種 ・ クリックか Space で投げる ・ E でマウンドを降りる ・ Esc'
    : mode === 'bat' ? 'クリックで振る(マウスの所をねらう) ・ E か Q で打席を出る ・ Esc 一時停止'
    : mode === 'pitch' ? '右クリック(左でも可)を長押しして放すと投げる ・ E か Q でマウンドを降りる'
      : mode === 'defense' ? 'WASD 動く ・ Space ジャンプ(打球の外は次の場面へ) ・ F 飛び込む ・ E オーライ(フライ) ・ 捕ったら投げたい野手をクリック ・ 右ドラッグで見回す ・ V 視点 ・ Esc'
        : freeplay && freeplay.simple ? 'WASD 移動 ・ Shift 走る ・ E 買う/座る ・ C 座る ・ M 地図 ・ Esc'   // 11/20 夜 すっきり(すべる・できること・しまうは無し)
        : 'WASD 移動 ・ Shift 走る ・ E 触る/座る/乗る ・ クリック 使う ・ Q しまう ・ C 座る/すべる ・ Tab できること ・ V 視点 ・ M 地図 ・ Esc';
  $('hint').textContent = h;
}
addEventListener('keydown', (e) => {
  if (!started) return;
  if (e.code === 'Escape' && replay && replay.on) { replay.close(); return; }
  if (e.code === 'Escape') { if (overlayOn) { if (!$('panel').classList.contains('hide')) ui.resume(); } else ui.pause(); return; }
  if (overlayOn) return;
  keys.add(e.code);
  if (mode === 'defense') {
    // Space: 打球が飛んでいる間はジャンプ、それ以外は次の場面へ。Enter はいつも次の場面へ。F は飛び込む
    if (e.code === 'Space') { if (!defense.jump()) defense.skip(); e.preventDefault(); return; }
    if (e.code === 'Enter') { defense.skip(); e.preventDefault(); return; }
    if (defense.onKey(e.code)) return;
  }
  if (freeplay && freeplay.onKey(e)) return;   // Tab できること・Q しまう・C 座る/すべる
  if (e.code === 'Space') { input.jump = true; e.preventDefault(); }
  if (e.code === 'KeyV' && !e.repeat) { cycleView(); return; }
  if (e.code === 'KeyM' && !e.repeat && wayfind && (mode === 'walk' || mode === 'sit')) { wayfind.openMap(); return; }   // 全体の地図(閉じるのは wayfinding.js が受ける)
  if (mode === 'bat' || mode === 'pitch') { if (e.code === 'KeyE' || e.code === 'KeyQ') { play.exit(); return; } }
  if (e.code === 'KeyE' && !e.repeat) doAction();
  if ((mode === 'walk' || mode === 'sit') && /^Digit[1-8]$/.test(e.code)) warp(+e.code.slice(5) - 1);
  if (e.code === 'KeyT') { const ks = Object.keys(TIMES); setTime(ks[(ks.indexOf(timeKey) + 1) % ks.length]); toast(TIMES[timeKey].label); }
  if (e.code === 'KeyP') setPhoto(!document.body.classList.contains('photo'));
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
function keyInput() {
  if (IS_TOUCH && stick.active) return;
  if (window.__app && window.__app.noKeys) return;   // 試験の自動操作中
  if (stick.active) return;
  const k = (c) => keys.has(c);
  input.f = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
  input.r = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
  input.run = k('ShiftLeft') || k('ShiftRight');
  if (mode === 'sit' && (input.f || input.r)) standUp();
}

// ---------------------------------------------------------------- 入力(スマホ)
// スティック: 左下の広い所のどこを触っても、そこが中心になる。視点: それ以外の所をなぞる(ボタンとスティックの上は除く)
const stick = { active: false, id: null, cx: 0, cy: 0, x: 0, y: 0 };
const look = { id: null, x: 0, y: 0, lastT: -99, sx: 0, sy: 0, st: 0 };
const STICK_R = 52;
const CONTROLS = '.screen,#pad,#acts,#skipBtn,.corner,#jump,#act,#throwBtn,#exitMode,#photoBar,#fpUse,#fpMenu,#fpSheet,#fpWallet,#wayf canvas,#wfMap';
function stickAllowed() { return mode === 'walk' || mode === 'defense' || mode === 'sit' || mode === 'drive' || mode === 'fprest'; }
function inStickZone(x, y) { return x < innerWidth * 0.46 && y > innerHeight * 0.45; }
function stickHome() {
  const s = $('stick'); s.style.left = ''; s.style.top = ''; s.style.bottom = ''; s.classList.add('idle');
  $('knob').style.transform = '';
}
function onTouchStart(e) {
  if (!started || overlayOn) return;
  let used = false;
  for (const t of e.changedTouches) {
    const el = document.elementFromPoint(t.clientX, t.clientY);
    if (el && el.closest(CONTROLS)) continue;
    used = true;
    if (mode === 'bat') { play.onPointer(t.clientX, t.clientY, 'down', 0); continue; }
    // 守備で球を持っている時、指の下に投げられる野手がいれば、スティックにせずに「たたく」の候補にする
    const onFielder = mode === 'defense' && defense.targetAt(t.clientX, t.clientY, 60);
    if (!onFielder && stickAllowed() && stick.id === null && inStickZone(t.clientX, t.clientY)) {
      stick.id = t.identifier; stick.active = true; stick.cx = t.clientX; stick.cy = t.clientY;
      const s = $('stick'); s.classList.remove('idle');
      s.style.left = (t.clientX - 64) + 'px'; s.style.top = (t.clientY - 64) + 'px'; s.style.bottom = 'auto';
      moveStick(t);
    } else if (look.id === null) {
      look.id = t.identifier; look.x = look.sx = t.clientX; look.y = look.sy = t.clientY; look.lastT = simTime; look.st = performance.now();
    }
    if (document.body.classList.contains('photo')) flashPhotoBar();
  }
  if (used) e.preventDefault();
}
function moveStick(t) {
  let dx = t.clientX - stick.cx, dy = t.clientY - stick.cy;
  const l = Math.hypot(dx, dy);
  if (l > STICK_R) { dx *= STICK_R / l; dy *= STICK_R / l; }
  $('knob').style.transform = `translate(${dx}px, ${dy}px)`;
  stick.x = dx / STICK_R; stick.y = dy / STICK_R;
  // 真ん中の少しの揺れは 0 に
  const m = Math.hypot(stick.x, stick.y), dead = 0.08;
  const s = m < dead ? 0 : (m - dead) / (1 - dead) / Math.max(m, 1e-6);
  input.r = stick.x * s; input.f = -stick.y * s;
  input.run = m > 0.92;
  if (mode === 'sit' && m > 0.5) standUp();
}
function onTouchMove(e) {
  let used = false;
  for (const t of e.changedTouches) {
    if (t.identifier === stick.id) { moveStick(t); used = true; }
    else if (t.identifier === look.id) {
      // なぞった量に素直に回す(感度は控えめ、なめらかに)。上下はもっと控えめ
      turnBy(t.clientX - look.x, t.clientY - look.y, 0.0046, 0.0026);
      look.x = t.clientX; look.y = t.clientY; look.lastT = simTime; used = true;
    }
  }
  if (used) e.preventDefault();
}
function onTouchEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === stick.id) { stick.id = null; stick.active = false; input.f = input.r = 0; input.run = false; stickHome(); }
    if (t.identifier === look.id) {
      look.id = null; look.lastT = simTime;
      // 守備: 指を動かさずに軽くたたいたら、そこにいる野手へ投げる
      if (mode === 'defense' && Math.hypot(t.clientX - look.sx, t.clientY - look.sy) < 14 && performance.now() - look.st < 400) defense.pickAt(t.clientX, t.clientY);
    }
  }
}
document.addEventListener('touchstart', onTouchStart, { passive: false });
document.addEventListener('touchmove', onTouchMove, { passive: false });
document.addEventListener('touchend', onTouchEnd);
document.addEventListener('touchcancel', onTouchEnd);
$('jump').addEventListener('touchstart', (e) => { input.jump = true; e.preventDefault(); }, { passive: false });
$('jump').addEventListener('click', () => (input.jump = true));
$('act').addEventListener('click', (e) => { e.stopPropagation(); doAction(); });
$('act').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); doAction(); }, { passive: false });
$('exitMode').addEventListener('click', (e) => { e.stopPropagation(); if (mode === 'defense') defense.stop(); else play.exit(); });
const tb = $('throwBtn');
tb.addEventListener('touchstart', (e) => { play.onPointer(0, 0, 'down', 2); e.preventDefault(); }, { passive: false });
tb.addEventListener('touchend', (e) => { play.onPointer(0, 0, 'up', 2); e.preventDefault(); }, { passive: false });
tb.addEventListener('mousedown', (e) => { e.stopPropagation(); play.onPointer(0, 0, 'down', 2); });
tb.addEventListener('mouseup', (e) => { e.stopPropagation(); play.onPointer(0, 0, 'up', 2); });
stickHome();

// ---------------------------------------------------------------- 画面の部品
let toastTimer = 0;
function toast(msg, sub, opt = {}) {
  const el = $('toast');
  el.innerHTML = '';
  el.appendChild(document.createTextNode(msg));
  if (sub) { const s = document.createElement('small'); s.textContent = sub; el.appendChild(s); }
  el.classList.toggle('big', !!opt.big);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), opt.ms || 1500);
}
function hud(html) {
  const el = $('hud');
  if (!html) { el.classList.add('hide'); return; }
  el.classList.remove('hide'); el.innerHTML = html;
}
let photoTimer = 0;
function flashPhotoBar() {
  const b = $('photoBar'); b.classList.remove('fade');
  clearTimeout(photoTimer); photoTimer = setTimeout(() => b.classList.add('fade'), 2400);
}
function setPhoto(on) {
  document.body.classList.toggle('photo', on);
  $('photoBar').classList.toggle('hide', !on);
  $('toast').classList.remove('show');
  if (on) flashPhotoBar();
}
$('photoExit').addEventListener('click', (e) => { e.stopPropagation(); setPhoto(false); });
$('photoSave').addEventListener('click', (e) => {
  e.stopPropagation();
  renderOnce();
  const a = document.createElement('a');
  a.download = `球場_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.png`;
  a.href = canvas.toDataURL('image/png'); a.click();
});
$('photoBtn').addEventListener('click', (e) => { e.stopPropagation(); ui.resume(); setPhoto(true); });

// 11/20 23 時 すっきりの形: 一時停止の画面のワープは、自由に遊ぶ所の行き先(アルバイト受付・チケット売り場・入場ゲート・席・売店・トイレ。6 つまで)を開くたびに作り直す
// 11/22 持ち主「ワープできる場所増やして なんかセンター側の裏とか回れないこと多いので 良い感じにして すぐにどこでも回れる感じで」:
// 行き先は js/warpgen.js が当たり判定から作る(全部の球場で同じやり方)。一時停止の画面には アルバイト受付・チケット売り場(前のまま先頭)と、組のボタン(内野・外野・センター裏…)だけを出し、
// 組を押すと中の行き先が 1 画面の窓に開く。WARPS の行き先は組の先頭に今までの並びで入る(warp() のチケットの決まりもそのまま)
let _warpGen = null;
function warpGen() {
  if (!bvh) return null;
  if (!_warpGen) _warpGen = new WarpGen({ THREE, getBvh: () => bvh, fence: fenceDist, seats, WARPS, getFp: () => freeplay, isField: (x, y, z) => !!(fieldFall && fieldFall.isField(x, y, z)),
    getMarks: () => { try { return wayfind ? wayfind.readMarks() : []; } catch (e) { return []; } } });
  return _warpGen;
}
function warpSpot(s, quiet) {
  if (!s || !bvh) return false;
  if (freeplay && freeplay.warpBlocked({ at: [s.x, s.z], k: 'gen' })) return false;
  leaveMode();
  let lx = s.lx, lz = s.lz, ly = s.ly;
  if (lx == null) { lx = s.field ? 0 : 0; lz = s.field ? -20 : -45; ly = s.y + (s.field ? 1.4 : 0.6); if (Math.hypot(lx - s.x, lz - s.z) < 3) lz = s.z - 10; }
  placeAt(s.x, s.z, lx, lz, ly, s.y + 1.6);
  if (!quiet) toast(s.label);
  return true;
}
function warpPick(g, onBack) {
  let el = $('warpPick');
  if (!el) {
    el = document.createElement('div'); el.id = 'warpPick'; el.className = 'hide';
    const st = document.createElement('style');
    st.textContent = `#warpPick{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;background:rgba(2,20,45,.55);padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));font-family:var(--v5-head,"Meiryo",sans-serif)}
#warpPick.hide{display:none}
#warpPick .box{width:min(560px,100%);max-height:100%;display:flex;flex-direction:column;background:rgba(2,40,90,.96);border:3px solid var(--v5-light,#d1eefd);border-radius:18px;color:#fff;overflow:hidden}
#warpPick .hd{display:flex;align-items:center;gap:8px;padding:8px 8px 6px 14px}
#warpPick .hd h3{flex:1;margin:0;font-size:19px;font-weight:900}
#warpPick .ls{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 8px 10px;overflow-y:auto;grid-auto-flow:row dense}
#warpPick button{min-height:44px;padding:2px 8px;border-radius:12px;border:2px solid rgba(209,238,253,.7);background:rgba(1,92,215,.6);color:#fff;font:inherit;font-weight:800;font-size:14px;line-height:1.2;cursor:pointer}
#warpPick .hd button{background:#fdc803;color:#06264a;border-color:#fff;min-width:72px}
#warps .wg{background:rgba(253,200,3,.22)}`;
    document.head.appendChild(st);
    el.innerHTML = '<div class="box" role="dialog" aria-label="ワープ"><div class="hd"><h3></h3><button class="bk">戻る</button></div><div class="ls"></div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { e.stopPropagation(); if (e.target === el) el.classList.add('hide'); });
    el.querySelector('.bk').addEventListener('click', (e) => { e.stopPropagation(); el.classList.add('hide'); });
    addEventListener('keydown', (e) => { if (!el.classList.contains('hide') && e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); el.classList.add('hide'); } }, true);
  }
  el.querySelector('h3').textContent = `ワープ: ${g.label}`;
  const ls = el.querySelector('.ls'); ls.innerHTML = ''; ls.scrollTop = 0;
  for (const it of g.items) {
    const b = document.createElement('button'); b.textContent = it.label; if (it.label.length > 11) b.style.gridColumn = 'span 2';
    b.addEventListener('click', (e) => { e.stopPropagation(); el.classList.add('hide'); ui.resume(); if (it.w != null) warp(it.w); else warpSpot(it.spot); });
    ls.appendChild(b);
  }
  el.classList.remove('hide');
}
function refreshWarps() {
  if (!(mode === 'walk' || mode === 'sit' || mode === 'fprest' || mode === 'drive')) return;
  const el = $('warps'); el.innerHTML = ''; el.style.gridAutoFlow = 'row dense';
  const add = (label, run, cls) => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; if (label.length > 6 && !cls) b.style.gridColumn = 'span 2'; b.addEventListener('click', (e) => { e.stopPropagation(); run(); }); el.appendChild(b); return b; };
  // 11/21 0 時 持ち主「アルバイト受付やチケット売り場はあっていい」: その 2 つは前のまま先頭
  if (freeplay && freeplay.simple) for (const t of freeplay.warpTargets()) if (t.label === 'アルバイト受付' || t.label === 'チケット売り場') add(t.label, () => { ui.resume(); t.run(); });
  const G = warpGen(); let groups = null;
  try { groups = G ? G.list() : null; } catch (e) { console.warn('ワープ先', e); }
  if (!groups) { WARPS.forEach((w, i) => add(w.label, () => { ui.resume(); warp(i); })); return; }
  for (const g of groups) add(`${g.label} ${g.items.length}`, () => warpPick(g), 'wg');
}
WARPS.forEach((w, i) => {
  const b = document.createElement('button');
  b.textContent = w.label;
  if (w.label.length > 6) b.style.gridColumn = 'span 2';
  b.addEventListener('click', (e) => { e.stopPropagation(); ui.resume(); warp(i); });
  $('warps').appendChild(b);
});
for (const k of Object.keys(TIMES)) {
  const b = document.createElement('button');
  b.dataset.k = k; b.textContent = TIMES[k].label;
  b.addEventListener('click', (e) => { e.stopPropagation(); setTime(k); });
  $('times').appendChild(b);
}
for (const [v, label] of [[1, '満員'], [0.7, 'ふつう'], [0.4, '空いている']]) {
  const b = document.createElement('button');
  b.dataset.v = v; b.textContent = label; b.className = 'btn';
  b.addEventListener('click', (e) => { e.stopPropagation(); sound.setFill(v); store('r4walk.fill', v); document.querySelectorAll('#fills button').forEach((x) => x.classList.toggle('on', +x.dataset.v === v)); });
  $('fills').appendChild(b);
}
for (const k of (IS_TOUCH ? TOUCH_ORDER : QUAL_ORDER)) {   // 11/19 スマホは 自動・標準・軽量(最高・高画質は出さない)
  const b = document.createElement('button');
  b.dataset.k = k; b.textContent = QUALS[k].label;
  b.addEventListener('click', (e) => { e.stopPropagation(); setQuality(k); });
  $('quals').appendChild(b);
}
let soundOn = !params.has('mute');
$('crowdBtn').addEventListener('click', (e) => { e.stopPropagation(); setCrowd(!crowdOn); });
$('soundBtn').addEventListener('click', (e) => { e.stopPropagation(); setSound(!soundOn); });
function setSound(on) {
  soundOn = on; sound.enabled = on;
  $('soundBtn').classList.toggle('on', on);
  if (sound.ready) sound.ambience(on && crowdOn, crowdOn ? 0.9 : 0);
}
// setTime が #times の .btn を探すので、ボタンに印を付けておく
document.querySelectorAll('#times button,#quals button').forEach((b) => b.classList.add('btn'));

const sound = new Sound();
const memg = memGuard({ renderer, gfx, touch: IS_TOUCH, getSound: () => sound, getQuality: () => quality, setQuality: (q) => setQuality(q), store, load });   // 11/26 記憶の見張り(js/memguard.js)
sound.windK = stadiumInfo(STADIUM).wind || 1;   // 球場の風の強さで風の音を大きく(stadiums.js の wind、海鳴りは 1.8)
sound.enabled = soundOn;
// 11/23 持ち主「アプリ落とした後音楽流れ続けるのは辞めさせて」: アプリが裏へ回った・閉じた時は音を全部止める(戻ったら続きから)。
// Android の側(MainActivity の onPause・onStop)からも window.__bgAudio(true) を呼ぶ
window.__bgAudio = (hide) => {
  sound.bgHidden = !!hide;
  const c = sound.ctx;
  try { if (c) { if (hide) c.suspend(); else if (c.state === 'suspended' && started) c.resume(); } } catch (e) { }
  if (hide) for (const m of document.querySelectorAll('audio,video')) try { m.pause(); } catch (e) { }
  if (hide && window.__hypeStop) window.__hypeStop();
};
document.addEventListener('visibilitychange', () => window.__bgAudio(document.visibilityState === 'hidden'));
addEventListener('pagehide', () => window.__bgAudio(true));
document.addEventListener('pause', () => window.__bgAudio(true));    // Capacitor の裏へ回った知らせ
document.addEventListener('resume', () => window.__bgAudio(document.visibilityState === 'hidden'));
let started = false;
let overlayOn = true;   // メニューが出ている間は世界を止める
function lockPointer() { if (IS_TOUCH) return; try { const p = canvas.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 使えない環境 */ } }
async function start() {
  if (!started) {
    started = true;
    $('soundBtn').classList.toggle('on', soundOn);
    if (!params.has('shot')) { sound.init().then(() => { setSound(soundOn); applyVolumes(); if (INDOOR_ST && sound.setIndoor) sound.setIndoor(true); if (stadiumInfo(STADIUM).semi && sound.setSemiOpen) sound.setSemiOpen(); sound.setTimeOfDay(timeKey); sound.setFill(load('r4walk.fill', 1)); document.querySelectorAll('#fills button').forEach((x) => x.classList.toggle('on', +x.dataset.v === load('r4walk.fill', 1))); }); }
  }
  if (ui) ui.hideAll();
  overlayOn = false;
}
$('start').addEventListener('click', start);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
});
// 11/19 スマホ: 向きを変えた直後は innerWidth・innerHeight がまだ古い端末がある(iOS・Android の WebView)。少し後にも合わせ直し、止まっている間も 1 回描く
{ const refit = () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); gfx.resize(); if (overlayOn || !started) { try { renderOnce(0, true); } catch (e) { /* 読み込み前 */ } } };
  addEventListener('orientationchange', () => { for (const t of [80, 300, 700]) setTimeout(refit, t); });
  if (window.visualViewport) visualViewport.addEventListener('resize', () => setTimeout(refit, 40)); }
function applyVolumes() {
  for (const k of ['all', 'amb', 'voice', 'song', 'crowd', 'sfx']) { const v = load('r4walk.vol.' + k, null); if (v != null && sound.setVolume) sound.setVolume(k, v / 100); }
  if (sound.setVoice) sound.setVoice(load('r4walk.voiceOn', true));
}

// メニューから遊ぶモードを始める
function startMode(sel) {
  start();
  lap.state = 'idle';   // 前のモードで測りかけの一周は持ち越さない
  leaveMode();
  if (watch && watch.on) watch.stop();   // 観戦はワープ(leaveMode)では止めない。モードを替える時・タイトルへ戻る時だけ止める
  setTime(sel.time || timeKey);
  if (sel.mode === 'game' || sel.mode === 'knock' || sel.mode === 'walk' || sel.mode === 'watch') setView(sel.view || view, true);
  if (sel.mode === 'walk' || sel.mode === 'watch') cam.blend = 0;   // 11/20 持ち主: 歩く・観戦では画面を勝手に動かさない(始める時のカメラのすべりも無し)
  ui.playing(true);
  if (sel.mode === 'walk') { warp(0, true); lockPointer(); }
  else if (sel.mode === 'watch') { const wi = WARPS.findIndex((w) => /^infield/.test(w.k)); warp(wi >= 0 ? wi : 0, true); watch.start(); if (freeplay) { freeplay.watchStart(); if (freeplay.simple && !params.has('shot')) busyWhile(freeplay.prepare()); } lockPointer(); }   // 観戦は内野席から(自由に遊ぶ仕組みがある時は球場の外から。チケットを買って入る)
  else if (sel.mode === 'game' || sel.mode === 'knock') { releasePointer(); defense.begin({ mode: sel.mode, pos: sel.pos, count: sel.count, diff: sel.diff, bd: sel.bd, mark: sel.mark || (sel.diff === 'easy' ? 'on' : 'off') }); }
  else if (sel.mode === 'bat' && cursor) { releasePointer(); cursor.enter('bat'); }   // カーソルで打つ
  else if (sel.mode === 'mound' && cursor) { releasePointer(); cursor.enter('mound'); }   // カーソルで投げる
  else if (sel.mode === 'bat') { warp(0, true); play.enterBat(); }   // ?oldbat=1: 前の打席
  else if (sel.mode === 'mound') { placeAt(0, -17.6, 0, 0, 1.0, 5); play.enterMound(); lockPointer(); }
  ui.playing(true);
  refreshHint();
  if (mokuhyo) mokuhyo.onStart(sel.mode);   // 11/21 目標と道案内: 過ごす・歩くの時だけ動く
  if (hudPrefs) hudPrefs.onStart(sel.mode);   // 11/22 操作の説明を初めの 3 回だけ出すための回数
  if (LOADFIX && sel.mode !== 'watch' && !params.has('shot') && !window.__app.manual) modeWarm();
}
// 11/21 持ち主「始めたときのローディングで画面が固まる」の続き: 守備の試合・歩くなどを始めた 1 こま目で、新しく出た物(選手・道具)の絵の作りを
// 描く時に待って 0.5〜1.5 秒止まっていた。始めた時は描くのを止め、新しい絵の作りを GPU の裏で済ませてから描く。
// 0.12 秒で済まない時だけ、読み込みの画面(球場の絵・回るボール)を出す
let modeWarmN = 0;
async function modeWarm() {
  const my = ++modeWarmN; loadBusy = true;
  const ls = $('loadScreen'), bar = ls && ls.querySelector('.lsBar i'), tx = ls && ls.querySelector('.lsTxt'), t0 = tx ? tx.textContent : '';
  let shown = false;
  const show = setTimeout(() => {
    if (!ls || my !== modeWarmN || !loadBusy) return; shown = true;
    ls.style.backgroundImage = `url("img/stadium_thumbs/${STADIUM}.jpg")`;
    const nm = ls.querySelector('.lsName'); if (nm) nm.textContent = STADIUM_NAMES[STADIUM] || '';
    if (tx) tx.textContent = '準備中…'; if (bar) bar.style.width = '60%';
    ls.classList.remove('hide');
  }, 120);
  try {
    // 11/25 重さの直し: 遊び始めてから 1 こまずつ作っていた物(歩く人の道・売店と店員・球場の外の物・ベンチ)を、読み込みの画面の間に済ませる。
    // スタンドで捕る(standcatch.js)は startMode の後で観戦を始めるので、1 度譲ってから見る
    await null;
    await prebuildPlay(() => my === modeWarmN);
    const objs = []; scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.material && o.visible !== false) objs.push(o); });
    await compileSliced(objs, (f) => { if (shown && bar) bar.style.width = Math.round(60 + 35 * f) + '%'; });
  } catch (e) { console.warn('絵の準備', e); }
  clearTimeout(show);
  if (my !== modeWarmN) return;
  loadBusy = false;
  if (shown) { if (bar) bar.style.width = '100%'; requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => { if (my === modeWarmN) { ls.classList.add('hide'); if (tx) tx.textContent = t0; } }))); }
}
// 11/20 夜 「ボールパークで過ごす」の始まりの固まり: 球場の外の物を作る間とシェーダーの準備の間は、読み込みの画面(球場の絵・名前)を出しておく
// 11/25 重さの直し(持ち主「軽量化して」の残り): 「スタンドで捕る」「ボールパークで過ごす」を始めてから 20 秒ほど、歩く人の道作りを 1 こまずつ進めていて重く、
// 自動の画質がそのせいで下がり、下がった段が次の起動にも残っていた。道作りは読み込みの画面の間(ここ)と、タイトルで待っている間(idleBuild)に済ませる
async function prebuildPlay(alive = () => true) {
  if (params.has('noprebuild')) return;
  const t0 = performance.now();
  if (watch && watch.on && freeplay && freeplay.freeMode && freeplay.freeMode() && freeplay.prepare) { try { await freeplay.prepare(); } catch (e) { console.warn('外の物の準備', e); } }
  if (!alive()) return;
  // 11/26 サクサク(持ち主「徹底的に軽く」): 歩く人の道は「ボールパークで過ごす」でしか使わないので、守備の試合・ノックの読み込みでは仕上げない(タイトルの間に少しずつ作るのは前のまま)
  const defPlay = !!(defense && defense.active && (defense.kind === 'game' || defense.kind === 'knock'));
  if (!defPlay || (watch && watch.on)) await finishWalkers(alive);
  if (!alive()) return;
  // 11/26 ベンチ(光線で置き場所を探す。スマホ相当で 0.4〜0.5 秒)を、守備の試合・ノックでも読み込みの画面の間に済ませる。前は始めて 3 秒ほどの所で 0.9 秒止まっていた
  if (bench && !bench.built && !bench.failed && ((watch && watch.on) || defPlay)) { try { await bench.build(); } catch (e) { console.warn('ベンチの準備', e); } }
  try { (window.__loadMarks || (window.__loadMarks = [])).push(['prebuild', Math.round(performance.now() - t0)]); } catch (e) { /* 試験の印 */ }
}
async function finishWalkers(alive = () => true) {
  const W = watch && watch.walkers; if (!W || !W.building) return;
  const t0 = performance.now();
  await W.finishBuild(IS_TOUCH ? 30 : 40, alive);
  try { (window.__loadMarks || (window.__loadMarks = [])).push(['walkers', Math.round(performance.now() - t0)]); } catch (e) { /* 試験の印 */ }
}
function busyWhile(p) {
  const ls = $('loadScreen'); if (!ls) return;
  ls.style.backgroundImage = `url("img/stadium_thumbs/${STADIUM}.jpg")`;
  const nm = ls.querySelector('.lsName'); if (nm) nm.textContent = STADIUM_NAMES[STADIUM] || '';
  const tx = ls.querySelector('.lsTxt'), t0 = tx ? tx.textContent : ''; if (tx) tx.textContent = '準備中…';
  const bar = ls.querySelector('.lsBar i'); if (bar) bar.style.width = '60%';
  ls.classList.remove('hide');
  const done = () => { if (bar) bar.style.width = '100%'; requestAnimationFrame(() => requestAnimationFrame(() => { ls.classList.add('hide'); if (tx) tx.textContent = t0; })); };
  Promise.resolve(p).then(() => prebuildPlay()).then(() => (renderer.compileAsync ? renderer.compileAsync(scene, camera).catch(() => {}) : null)).catch(() => {}).finally(() => setTimeout(done, 30));
}
function toTitle() {
  leaveMode();
  if (watch && watch.on) watch.stop();
  ui.playing(false); ui.board(null); ui.digest(null); ui.skip(false); ui.pad('hide');
  hud(null); releasePointer();
  if (mokuhyo) mokuhyo.onTitle();
  warp(0, true);
}

// ---------------------------------------------------------------- ループ
const clock = new THREE.Clock();
let frames = 0, fpsT = 0, fpsVal = 0;
let replay = null, defense = null, play = null, ui = null, scoreboard = null, watch = null, freeplay = null, gimmicks = null, bench = null;
let mokuhyo = null;   // 11/21 目標と道案内(js/mokuhyo.js)
let hudPrefs = null;   // 11/22 画面に出すもの(js/hudprefs.js)
let camOverride = false;
let cursor = null;   // カーソルで打つ・投げる(js/cursorplay.js)
function updateUI() {
  curAction = started && !overlayOn ? currentAction() : null;
  const pr = $('prompt');
  if (curAction && !document.body.classList.contains('photo')) {
    if (IS_TOUCH) { pr.classList.add('hide'); $('act').classList.remove('hide'); $('act').textContent = curAction.label.replace(/(.*)\(.*\)/, '$1'); }
    else { pr.classList.remove('hide'); pr.innerHTML = `<kbd>E</kbd>${curAction.label}`; $('act').classList.add('hide'); }
  } else { pr.classList.add('hide'); $('act').classList.add('hide'); }
  const playingNow = started && !overlayOn;
  const showStick = IS_TOUCH && playingNow && stickAllowed() && !(mode === 'defense' && defense.inDigest());
  $('stick').classList.toggle('hide', !showStick);
  $('jump').classList.toggle('hide', !(IS_TOUCH && playingNow && (mode === 'walk' || mode === 'sit')));
  $('hint').classList.toggle('hide', IS_TOUCH || !playingNow || innerWidth < 600);
  $('viewBtn').classList.toggle('hide', !playingNow || !(mode === 'walk' || mode === 'defense' || mode === 'sit'));
  $('cross').classList.toggle('hide', !(document.pointerLockElement === canvas) || mode === 'bat' || activeView() !== '1p' || mode === 'defense');
  if (mode === 'walk' || mode === 'sit') {
    if (watch && watch.on) hud(null);   // 観戦では左上に点数板が出るので、一周・座っている の札は出さない(重なる。11/19 点検)
    else if (lap.state === 'run') hud(`<div class="m">ダイヤモンド一周</div>${(simTime - lap.t0).toFixed(2)} 秒<div class="d">次は ${BASES[lap.next % 4].label}${lap.best ? ` ・ ベスト ${lap.best.toFixed(2)} 秒` : ''}</div>`);
    else if (lap.state === 'ready') hud(`<div class="m">本塁を踏みました</div><div class="d">離れると一周の時間を測ります</div>`);
    else if (mode === 'sit') hud('<div class="m">座っています</div><div class="d">動くか E で立つ</div>');
    else hud(null);
  }
  if (wayfind) { wayfind.setVisible(playingNow && mode === 'walk' && !document.body.classList.contains('photo')); wayfind.update(); }
  if (mokuhyo) mokuhyo.update();   // 11/21 目標と道案内(js/mokuhyo.js)
}
// 案内(wayfinding.js)に渡す、いまの場所の様子: グラウンドの中か・席の段か・球場の外か
const _wr = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
function wayState() {
  const x = player.pos.x, y = player.pos.y, z = player.pos.z;
  const ang = Math.atan2(x, -z) * 180 / Math.PI, r = Math.hypot(x, z);
  const fieldIn = y < 0.7 && z < 14 && r < fenceDist(Math.max(-50, Math.min(50, ang))) + 1;   // ファウルの所も含める
  _wr.origin.set(x, y + 1.8, z); const up = bvh ? bvh.raycastFirst(_wr, THREE.DoubleSide, 0, 5) : null;
  const onStand = player.onGround && y > 1.2 && !up && !fieldIn;
  let gr = 0, gn = 0; if (passages) for (const it of passages.items) if (it.kind === 'gate') { gr += Math.hypot(it.mouthIn.x, it.mouthIn.z + 40); gn++; }
  const outside = gn > 0 && Math.hypot(x, z + 40) > gr / gn - 1 && y < 3;
  return { x, y, z, yaw: moveYaw(), fieldIn, onStand, outside };
}
function stepWorld(dt) {
  simTime += dt;
  applyLook(dt);
  if (mode === 'walk' && bvh && !params.has('nosolid')) { if (!propSolids) propSolids = new PropSolids(THREE, { scene, groundAt }); propSolids.update(dt); }
  if (freeplay) freeplay.update(dt);
  if (gimmicks) gimmicks.update(dt);
  if (mode === 'walk' || mode === 'defense') simulate(dt, mode === 'defense' && defense.frozen());
  else if (mode === 'pitch') simulate(dt, true);
  if (mode === 'walk') updateBases();
  updateUnderStand(dt);
  if (mode === 'defense') defense.update(dt);
  else if (watch && watch.on) watch.update(dt);
  if (cursor && cursor.on) cursor.update(dt);
  if (mode === 'bat' || mode === 'pitch') play.update(dt);
  else play.idle(dt);
  updateMe(dt);
}
// 11/22 作り・11/23 本番へ(持ち主 OK): 自分の目の守備で、自分が捕った瞬間だけ本物のグラブを出す。
// 模型は 3D スキャン(models/fp_glove.glb。Laser Design「Baseball Glove」CC-BY 4.0 を 9 千面に軽くし、商標の字と札を消した。元から左手用)。
// 左から捕った時の球の画面の所へ出て、パシッ(onCatch の音)と同じこまに当たり、少し引いて 0.8 秒ほどで左へ下がって消える。投げる・走るだけの時・後ろからの視点では出さない。
// 11/23 v2(持ち主「グローブの中にボールが入っている感じに」): スキャンは閉じた形で手のひらが膨らんでいたので、読み込んだ時に
//   ポケット(手のひらと網の間)を球の形に彫り、くぼみの奥を少し暗くする。球はくぼみの奥に置き、縁と指先に一部が隠れる。
//   捕ると指先と網が球の方へ少し閉じる(形の変化 morph)。グラブは「一塁へ!」の札・下の説明の帯・スマホのボタンに重ならない所へずらす。
// ?glovehold=0.2 で、その時刻(0〜1)の姿勢のまま出しっぱなしにする(見た目の調整用)
let fpGlove = null, fpGloveLoading = false, fpGloveMesh = null;
const FPG = { dur: 0.8, t: -1, anim: null, h: 0, hold: params.has('glovehold') ? +params.get('glovehold') : null,
  // 球の中心(手首を原点にした模型の向き: x 右(親指の側)・y 指先・z 手のひらの向き)。cup = くぼみの底の丸み・open = くぼみの口の半径(球は半径 3.66cm・グラブは全長 31cm の本物の比)
  pocket: new THREE.Vector3(+(params.get('gpx') || -0.008), +(params.get('gpy') || 0.165), +(params.get('gpz') || 0.005)), cup: 0.040, open: +(params.get('gop') || 0.021), rx: -0.5, ry: 0.3, rz: -0.7,
  depth: 0.5, close: 1, tgt: null, offA: new THREE.Vector3(), offB: new THREE.Vector3(), samp: null };
const _fpZ = new THREE.Vector3(0, 0, -1), _fpq = new THREE.Quaternion(), _fpv = new THREE.Vector3(), _fpv2 = new THREE.Vector3(), _fpv3 = new THREE.Vector3();
const sm = (x) => x * x * (3 - 2 * x);
const smr = (a, b, x) => sm(Math.max(0, Math.min(1, (x - a) / (b - a))));
// ポケットを彫る・暗くする・閉じる形を作る(手首を原点にした座標で。模型は y を 0.154 上げて使う)
// ポケットの周りの三角を 4 つずつに 2 回分ける(くぼみの縁がギザギザにならないように)。分けた点は辺の上なので、外との境に隙間は出ない
function subdivFpGlove(g, C, rad, Y0) {
  const names = Object.keys(g.attributes), src = names.map((k) => g.attributes[k]);
  let idx = Array.from(g.index ? g.index.array : [...Array(g.attributes.position.count).keys()]);
  const vals = names.map((k, j) => Array.from(src[j].array)), size = src.map((a) => a.itemSize);
  const P = vals[names.indexOf('position')];
  const near = (i) => { const x = P[i * 3] - C.x, y = P[i * 3 + 1] + Y0 - C.y; return x * x + y * y < rad * rad && P[i * 3 + 2] > C.z - 0.03; };
  for (let lv = 0; lv < 2; lv++) {
    const mid = new Map(), out = [];
    const midOf = (a, b) => {
      const key = a < b ? a + ',' + b : b + ',' + a; let m = mid.get(key);
      if (m == null) { m = vals[0].length / size[0]; for (let j = 0; j < names.length; j++) { const s = size[j], V = vals[j]; for (let c = 0; c < s; c++) V.push((V[a * s + c] + V[b * s + c]) / 2); } mid.set(key, m); }
      return m;
    };
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      if (!(near(a) || near(b) || near(c))) { out.push(a, b, c); continue; }
      const ab = midOf(a, b), bc = midOf(b, c), ca = midOf(c, a);
      out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    idx = out;
  }
  for (let j = 0; j < names.length; j++) {
    const A = src[j], arr = new A.array.constructor(vals[j]);
    g.setAttribute(names[j], new THREE.BufferAttribute(arr, A.itemSize, A.normalized));
  }
  g.setIndex(idx);
}
function carveFpGlove(mesh) {
  const g = mesh.geometry, Y0 = 0.154, C = FPG.pocket, OP = FPG.open, zc = C.z;
  subdivFpGlove(g, C, OP * 2.2, Y0);
  const pa = g.attributes.position, na = g.attributes.normal, n = pa.count;
  const col = new Float32Array(n * 3).fill(1);
  const v = new THREE.Vector3();
  const P0 = pa.array.slice(), N0 = na ? na.array.slice() : null, dk = [];
  // くぼみ(球がある間だけ。形の変化 2 番として持ち、球を右手へ持ちかえたら戻す): 手のひらの面を、口(open)の中は球の下まで、外へ向かってなだらかに元の面へ戻る漏斗の形に押し下げる。
  // 口は球(半径 3.66cm)より狭いので、正面から見ても球の縁は革に隠れ、上の方だけが見える
  const zLow = Math.max(-0.022, zc - 0.03), zTop = 0.075, ra = OP * 0.55, rb = OP * 1.35;
  const moved = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pa, i); v.y += Y0;
    const rr = Math.hypot(v.x - C.x, v.y - C.y);
    if (v.z > zc - 0.02 && rr < rb) {
      const f = zLow + (zTop - zLow) * smr(ra, rb, rr);
      if (v.z > f) { pa.setZ(i, f); moved[i] = 1; }
      // 奥ほど暗く(球の影)・口の周りも少し
      const k = 0.5 + 0.5 * smr(ra * 0.6, rb * 1.1, rr); col[i * 3] = k; col[i * 3 + 1] = k * 0.97; col[i * 3 + 2] = k * 0.94; if (k < 0.999) dk.push(i, k);
    }
  }
  pa.needsUpdate = true;
  // 動かした所の向き(法線)だけ計り直す(ほかは元のまま: 継ぎ目の陰を変えない)
  if (na) {
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', pa); g2.setIndex(g.index); g2.computeVertexNormals();
    const n2 = g2.attributes.normal;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pa, i); v.y += Y0;
      const rr = Math.hypot(v.x - C.x, v.y - C.y);
      if (v.z > zc - 0.025 && rr < rb * 1.05) na.setXYZ(i, n2.getX(i), n2.getY(i), n2.getZ(i));
    }
    na.needsUpdate = true;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // 閉じた形: 指先と網(y > 0.19)を手のひらの方(+z)へ巻く。親指の側(x > 0.03)も少し内へ
  const d = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pa, i); v.y += Y0;
    let x = v.x, y = v.y, z = v.z;
    const a = FPG.curlA * smr(0.19, 0.30, v.y);
    if (a > 0) { const py = 0.19, ey = y - py, ez = z; y = py + ey * Math.cos(a) - ez * Math.sin(a); z = ey * Math.sin(a) + ez * Math.cos(a); }
    const b = FPG.curlB * smr(0.03, 0.10, v.x) * (1 - 0.5 * smr(0.22, 0.30, v.y));
    if (b > 0) { const px = 0.03, ex = x - px, ez = z; x = px + ex * Math.cos(b) - ez * Math.sin(b); z = ex * Math.sin(b) + ez * Math.cos(b); }
    d[i * 3] = x - v.x; d[i * 3 + 1] = y - v.y; d[i * 3 + 2] = z - v.z;
  }
  // 元の形に戻し、くぼみは差分で持つ
  const dc = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) dc[i] = pa.array[i] - P0[i];
  pa.array.set(P0); pa.needsUpdate = true;
  g.morphAttributes.position = [new THREE.BufferAttribute(d, 3), new THREE.BufferAttribute(dc, 3)];
  if (na) {
    const nc = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) nc[i] = na.array[i] - N0[i];
    na.array.set(N0); na.needsUpdate = true;
    g.morphAttributes.normal = [new THREE.BufferAttribute(new Float32Array(n * 3), 3), new THREE.BufferAttribute(nc, 3)];
  }
  g.morphTargetsRelative = true;
  FPG.dk = dk; FPG.pocketAmt = 1; FPG.mesh = mesh;
  mesh.updateMorphTargets();
  mesh.morphTargetInfluences[1] = 1;
  mesh.material.vertexColors = true; mesh.material.needsUpdate = true;
  // 画面でのグラブの広がりを測る点(手首の座標)
  const S = [];
  for (let i = 0; i < n; i += 23) { v.fromBufferAttribute(pa, i); S.push(new THREE.Vector3(v.x, v.y + Y0, v.z)); }
  FPG.samp = S;
}
FPG.curlA = params.has('glovecurl') ? +params.get('glovecurl') : 0.65; FPG.curlB = params.has('glovecurlb') ? +params.get('glovecurlb') : 0.5;
// くぼみと奥の陰の強さ(0〜1)。球がグラブを離れる時に 0 へ
function fpPocket(amt) {
  if (!fpGloveMesh || !FPG.dk || Math.abs(amt - FPG.pocketAmt) < 0.01) return;
  FPG.pocketAmt = amt; fpGloveMesh.morphTargetInfluences[1] = amt;
  const ca = fpGloveMesh.geometry.attributes.color, A = ca.array, dk = FPG.dk;
  for (let j = 0; j < dk.length; j += 2) { const i = dk[j], k = 1 - (1 - dk[j + 1]) * amt; A[i * 3] = k; A[i * 3 + 1] = k * (1 - 0.03 * amt); A[i * 3 + 2] = k * (1 - 0.06 * amt); }
  ca.needsUpdate = true;
}
function loadFpGlove() {
  fpGloveLoading = true;
  gltfLoader.load('models/fp_glove.glb', (g) => {
    const inner = g.scene;
    inner.position.set(0, 0.154, 0);   // 手首(模型の下の端)を原点に
    inner.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; const m = o.material; m.metalness = 0; m.roughness = 0.6; m.envMapIntensity = 0.8; m.color.setRGB(0.84, 0.8, 0.78); fpGloveMesh = o; } });   // 色は昼の光で黄色く明るすぎたので少し落とす
    if (fpGloveMesh && !params.has('glovenocarve')) carveFpGlove(fpGloveMesh);
    fpGlove = new THREE.Group(); fpGlove.add(inner); fpGlove.visible = false; scene.add(fpGlove);   // 球と同じ場面・同じ深さの扱い(手前の層に分けない)。隠れ方は深さで決まる
    window.__app.fpGlove = fpGlove; window.__app.FPG = FPG;
  }, undefined, (e) => console.warn('fp_glove', e));
}
// 重ならない物(画面の px): 投げる先の札・下の説明の帯・スマホの棒とボタン・上の札
function fpObstacles() {
  const W = innerWidth, H = innerHeight, out = [];
  const add = (r, m = 8) => { if (r && r.width > 2 && r.height > 2) out.push({ l: r.left - m, t: r.top - m, r: r.right + m, b: r.bottom + m }); };
  document.querySelectorAll('#gd b, #gd span, #hint, #stickZone, #stick, .basebtn, #acts button, #jump, #act, #throwBtn, #hud, #board').forEach((e) => {
    if (e.closest('.hide')) return;
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = e.getBoundingClientRect(); if (r.width > W * 0.9 && r.height > H * 0.5) return;   // 画面いっぱいの入れ物は外す
    add(r);
  });
  // 投げる先の塁のボタン(#pad)は捕った少し後に出るので、隠れていても出た時の所を測って空けておく
  const pad = document.getElementById('pad');
  if (pad && pad.classList.contains('hide')) { pad.classList.remove('hide'); pad.querySelectorAll('.basebtn').forEach((e) => { if (!e.classList.contains('hide') && !e.classList.contains('cut')) add(e.getBoundingClientRect()); }); pad.classList.add('hide'); }
  // 札がまだ出ていない時も、出る所を空けておく(捕った直後に「一塁へ!」が出る)
  const touch = document.body.classList.contains('touch');
  const top = touch ? H * 0.58 : H - 118 - 108;
  out.push({ l: W / 2 - 175, t: top - 6, r: W / 2 + 175, b: top + 108 });
  FPG.obs = out;
  return out;
}
// カメラの中の手首の所 p・向き q・大きさ s の時、画面でのグラブの四角(px)
function fpRect(p, q, s) {
  const W = innerWidth, H = innerHeight, r = { l: 1e9, t: 1e9, r: -1e9, b: -1e9 };
  for (const v of FPG.samp) {
    _fpv3.copy(v).multiplyScalar(s).applyQuaternion(q).add(p).applyMatrix4(camera.projectionMatrix);
    const x = (_fpv3.x + 1) / 2 * W, y = (1 - _fpv3.y) / 2 * H;
    if (x < r.l) r.l = x; if (x > r.r) r.r = x; if (y < r.t) r.t = y; if (y > r.b) r.b = y;
  }
  return r;
}
// 重なりを避けるずれ(カメラの中の m)。画面の上でグラブの四角を 12px 刻みで動かしてみて、何にも重ならず画面に収まる中で一番近い所へ
function fpAvoid(p, q, s, obs, out, leftW = 1.15) {
  const H = innerHeight, W = innerWidth, k = 2 * (-p.z) * Math.tan(camera.fov * Math.PI / 360) / H;   // 1px が何 m か
  const r = fpRect(p, q, s), st = 12;
  const over = (dx, dy) => { let a = 0; for (const o of obs) { const w = Math.min(r.r + dx, o.r) - Math.max(r.l + dx, o.l), h = Math.min(r.b + dy, o.b) - Math.max(r.t + dy, o.t); if (w > 0 && h > 0) a += w * h; } return a; };
  const inside = (dx, dy) => r.t + dy >= H * 0.02 && r.b + dy <= H * 1.02 && r.l + dx >= -W * 0.12 && r.r + dx <= W * 1.04;
  let best = null;
  if (over(0, 0) > 0 || !inside(0, 0)) {
    const ny = Math.ceil(H / st), nx = Math.ceil(W / st);
    for (let iy = -ny; iy <= ny; iy++) for (let ix = -nx; ix <= nx; ix++) {
      const dx = ix * st, dy = iy * st;
      if (!inside(dx, dy)) continue;
      const ov = over(dx, dy), cost = ov * 10 + Math.abs(dx) * (dx < 0 ? leftW : 1.15) + Math.abs(dy);
      if (!best || cost < best.cost) best = { dx, dy, cost };
    }
  }
  FPG.dbg.push({ r: [r.l | 0, r.t | 0, r.r | 0, r.b | 0], best });
  return best ? out.set(best.dx * k, -best.dy * k, 0) : out.set(0, 0, 0);
}
// 時刻 u(0〜1)の、カメラから見た手首の所と向き
function fpGlovePose(u, port, out) {
  let k = 1, close = 0, back = 0, w = 0, ph = 0;
  if (u < 0.09) { w = 1 - Math.pow(1 - u / 0.09, 3); k = w; ph = 0; }   // さっと出て、球の所で捕る
  else if (u < 0.40) { w = sm((u - 0.09) / 0.31); ph = 1; back = Math.sin(Math.min(1, (u - 0.09) / 0.12) * Math.PI) * 0.03; close = sm(Math.min(1, (u - 0.07) / 0.08)); }   // 当たって少し押され、指を閉じて、体の方(左下)へ引き寄せる
  else if (u < 0.52) { ph = 2; close = 1; }
  else { w = sm(Math.min(1, (u - 0.52) / 0.48)); ph = 3; k = 1 - w; close = 1; }   // 左下へ下がって消える
  // 向き: 指先は上・少し奥・内(右)へ。ポケットはこちらと少し上を向く。出る時と下がる時は手首を寝かせる
  out.rot.set(FPG.rx - 0.4 * (1 - k) + close * 0.08, FPG.ry - 0.2 * (1 - k), FPG.rz - 0.3 * (1 - k));
  // 画面の端で捕っても横向きに見えないよう、カメラから狙いの所への向きに合わせて回す
  _fpv3.copy(FPG.tgt).add(FPG.offA).normalize();
  out.q.setFromUnitVectors(_fpZ, _fpv3).multiply(_fpq.setFromEuler(out.rot));
  _fpq.copy(out.q);
  const s = port ? 0.8 : 1;
  // 球(ポケット)を狙いの所に合わせた手首の所
  const T = FPG.tgt, pk = _fpv.copy(FPG.pocket).multiplyScalar(s).applyQuaternion(_fpq);
  const A = new THREE.Vector3().copy(T).add(FPG.offA).sub(pk);
  const Bv = new THREE.Vector3(T.x - (port ? 0.04 : 0.08), T.y - (port ? 0.03 : 0.05), T.z + 0.02).add(FPG.offB).sub(pk);
  const Hv = new THREE.Vector3(T.x - (port ? 0.30 : 0.46), T.y - (port ? 0.10 : 0.16), T.z + 0.06).add(FPG.offA).sub(pk);   // 出入りは左(グラブの手の側)から。下の札やボタンの上を通らない
  if (ph === 0) out.pos.lerpVectors(Hv, A, w);
  else if (ph === 1) out.pos.lerpVectors(A, Bv, w);
  else if (ph === 2) out.pos.copy(Bv);
  else out.pos.lerpVectors(Bv, Hv, w);
  out.pos.y -= back * 0.3; out.pos.z += back;
  out.close = close * FPG.close;
  return out;
}
// 捕ったこまで決める: 球の画面の所(極端な所は内へ)→ ポケットを置く所。重なりを避けるずれも、ここで決める
function fpGloveAim(port) {
  const d = defense, m = d && d.ballView && d.ballView.mesh;
  const D = FPG.depth, ty = Math.tan(camera.fov * Math.PI / 360);
  let nx = 0, ny = -0.15;
  if (m && FPG.hold == null) {
    const p = _fpv.copy(m.position).project(camera);
    if (p.z < 1 && isFinite(p.x)) { nx = p.x; ny = p.y; }
  }
  if (FPG.hold != null && params.has('glovenx')) { nx = +params.get('glovenx'); ny = +(params.get('gloveny') || 0); }   // 調整用
  FPG.rawN = [nx, ny];
  nx = Math.max(port ? -0.45 : -0.7, Math.min(port ? 0.45 : 0.7, nx)); ny = Math.max(-0.55, Math.min(0.6, ny));
  FPG.tgt = new THREE.Vector3(nx * D * ty * camera.aspect, ny * D * ty, -D);
  FPG.nx = nx; FPG.ny = ny;
  // 重ならないずれ(捕った姿勢・引き寄せた姿勢それぞれ)
  FPG.offA.set(0, 0, 0); FPG.offB.set(0, 0, 0);
  FPG.dbg = [];
  if (!FPG.samp) return;
  const obs = fpObstacles(), s = port ? 0.8 : 1, tmp = { pos: new THREE.Vector3(), rot: new THREE.Euler(), q: new THREE.Quaternion(), close: 0 };
  fpGlovePose(0.09, port, tmp); fpAvoid(tmp.pos, tmp.q.clone(), s, obs, FPG.offA);
  fpGlovePose(0.45, port, tmp); const ob = fpAvoid(tmp.pos, tmp.q.clone(), s, obs, new THREE.Vector3(), 0.5); FPG.offB.add(ob);   // 引き寄せた所は左(グラブの手の側)へ逃がす
}
const _pose = { pos: new THREE.Vector3(), rot: new THREE.Euler(), q: new THREE.Quaternion(), close: 0 };
function updateFpGlove(dt = 1 / 60) {
  const d = defense;
  // 球の色はグラブの中だけ少し陰にする。毎こま元に戻してから、グラブの中なら掛け直す
  const bm = d && d.ballView && d.ballView.mesh.material;
  if (bm && FPG.bmSaved) { bm.color.copy(FPG.bmSaved.c); bm.emissive.copy(FPG.bmSaved.e); }
  const ok = started && !overlayOn && mode === 'defense' && activeView() === '1p' && d;
  if (!ok && FPG.hold == null) { if (fpGlove) fpGlove.visible = false; FPG.t = -1; return; }
  if (!fpGlove) { if (!fpGloveLoading) loadFpGlove(); return; }
  const port = camera.aspect < 1;
  const anim = d && d.meAnim;
  if (anim && anim !== FPG.anim) { FPG.anim = anim; if (anim.kind === 'catch' && d.holderFig === 'me') { FPG.t = 0; FPG.h = anim.h || 0; fpGloveAim(port); } }
  if (anim && anim.kind === 'throw' && FPG.t >= 0 && FPG.t < 0.45) FPG.t = 0.45;   // 投げ始めたら下げる
  let u;
  const fdg = d && d.meAct && d.meAct.kind === 'dive' && d.meAct.front ? d.meAct : null, flt = fdg ? fdg.t - fdg.turn : -1;
  if (FPG.hold != null) { u = FPG.hold; if (!FPG.tgt || FPG.aimPort !== port) { FPG.aimPort = port; fpGloveAim(port); } }
  else if (FPG.t < 0 && fdg && flt > 0.02 && flt < 0.8) { fpGloveAim(port); if (FPG.rawN && FPG.rawN[0] === 0 && FPG.rawN[1] === -0.15) FPG.tgt.y *= 2.2; u = Math.min(0.089, flt * 0.55); }   // 球が見えない時は画面の下寄りに   // 11/26 正面の飛び込み: 踏み切ったらグラブを前へ伸ばす(球が見えればその方へ)。捕ったら捕る動きへ
  else if (FPG.t >= 0) { FPG.t += (dt || 1 / 60) / FPG.dur; u = FPG.t; if (u >= 1) { FPG.t = -1; fpGlove.visible = false; return; } }
  else { fpGlove.visible = false; return; }
  if (!FPG.tgt) fpGloveAim(port);
  fpGlovePose(u, port, _pose);
  fpGlove.visible = true;
  fpGlove.scale.setScalar(port ? 0.8 : 1);
  fpGlove.position.copy(_pose.pos).applyQuaternion(camera.quaternion).add(camera.position);
  fpGlove.quaternion.copy(camera.quaternion).multiply(_pose.q);
  if (fpGloveMesh && fpGloveMesh.morphTargetInfluences) fpGloveMesh.morphTargetInfluences[0] = _pose.close;
  fpPocket(u < 0.55 ? 1 : 1 - sm(Math.min(1, (u - 0.55) / 0.2)));   // 球を持ちかえたら、くぼみを戻す
  // 球はポケットの奥に(手が下がり始めたら右手へ持ちかえる: 元の所へ寄せる)。大きさは本物の比(グラブと同じ倍率)
  if (FPG.hold != null && d && d.ballView && !d.ballView.mesh.visible) { d.ballView.mesh.visible = true; d.holderFig = 'me'; }   // 調整用: 球も置く
  if (d && d.holderFig === 'me' && d.ballView && d.ballView.mesh.visible) {
    fpGlove.updateMatrixWorld(true);
    const pk = fpGlove.localToWorld(_fpv.copy(FPG.pocket));
    const m = d.ballView.mesh;
    const w = u < 0.55 ? 0 : sm(Math.min(1, (u - 0.55) / 0.25));
    m.position.lerpVectors(pk, _fpv2.copy(m.position), w);
    m.scale.setScalar((port ? 0.8 : 1) * (1 - w) + m.scale.x * w);
    if (!FPG.bmSaved) FPG.bmSaved = { c: m.material.color.clone(), e: m.material.emissive.clone() };
    m.material.color.copy(FPG.bmSaved.c).multiplyScalar(1 - 0.18 * (1 - w)); m.material.emissive.copy(FPG.bmSaved.e).multiplyScalar(1 - 0.85 * (1 - w));   // ポケットの陰
    if (d.ballView.dot) d.ballView.dot.visible = false;
    m.layers.set(w < 1 ? 31 : 0);   // 11/23 朝 持ち主「グローブの中に入ったボール見えなくていい」: グラブに入っている間は球を描かない(カメラの層から外すだけ。位置と表示の印は今までどおり)
  } else if (d && d.ballView && d.ballView.mesh.layers.mask !== 1) d.ballView.mesh.layers.set(0);
}
// 11/22 夜 Discord の感想「一人称だと捕った!という感じが薄い」: グローブは出さない(11/21 持ち主)。代わりに捕った瞬間、
// 画面がほんの少し揺れる(0.2 秒)・一人称は捕った球が画面の手前で一瞬止まって見え、金色の細い輪が小さく広がって消える(0.3 秒)。音は audio.js の mittMine
let catchFxM = null;
function updateCatchFx(dt) {
  const fx = mode === 'defense' && defense ? defense.catchFx : null;
  const fp = activeView() === '1p';
  if (!fx || fx.t > 0.35 || camOverride) { if (catchFxM) catchFxM.visible = false; return; }   // 時計は defense.update で進める
  const t = fx.t, amp = (fp ? 0.010 : 0.005) * Math.max(0, 1 - t / 0.2);
  if (amp > 0) { camera.rotation.x += Math.sin(t * 90) * amp; camera.rotation.y += Math.sin(t * 70 + 1.3) * amp * 0.6; camera.updateMatrixWorld(); }
  if (!fp || fpGlove) { if (catchFxM) catchFxM.visible = false; return; }   // 11/23 一人称はグラブが出るので、手前の球と金の輪は出さない(揺れだけ残す)
  if (!catchFxM) {
    catchFxM = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf4f1ea }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.034, 32), new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, depthTest: false, depthWrite: false }));
    ball.material.depthTest = false; ball.renderOrder = 11; ring.renderOrder = 12; ball.frustumCulled = ring.frustumCulled = false;
    catchFxM.add(ball, ring); catchFxM.userData = { ball, ring }; scene.add(catchFxM);
  }
  // 捕った所の向き(カメラから見て)。画面の外・後ろなら真ん中の少し下に
  if (!fx.loc) {
    const l = fx.p.clone().sub(camera.position).applyQuaternion(camera.quaternion.clone().invert());
    const tx = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * 0.6, ty = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.6;
    if (l.z > -0.2) l.set(0, -0.15, -1); else { l.divideScalar(-l.z); l.x = THREE.MathUtils.clamp(l.x, -tx, tx); l.y = THREE.MathUtils.clamp(l.y, -ty, ty * 0.5); l.z = -1; }
    fx.loc = l.multiplyScalar(0.5);
  }
  const { ball, ring } = catchFxM.userData;
  catchFxM.visible = true;
  catchFxM.position.copy(fx.loc).applyQuaternion(camera.quaternion).add(camera.position);
  catchFxM.quaternion.copy(camera.quaternion);
  ball.visible = t < 0.18; ball.scale.setScalar(t < 0.05 ? 1.15 - t * 3 : 1);
  const r = Math.min(1, t / 0.3); ring.scale.setScalar(1 + r * 1.6); ring.material.opacity = 0.85 * (1 - r);
}
function renderOnce(dt, still) {
  placeCamera(dt);
  updateFpGlove(dt);
  updateCatchFx(dt);
  if (freeplay) freeplay.afterCamera(dt || 1 / 60);
  gfx.update(dt);
  if (sound.ready) { sound.setListener(camera); sound.tick(dt || 1 / 60); }
  if (bench) bench.update(camera, dt);   // ベンチの人(js/bench.js)
  updateAthletes(camera, still ? 0 : (dt || 1 / 60));   // 試験で止めて撮る時は人の動きを進めない(step で進める)
  if (scoreboard) scoreboard.update();
  gfx.render();
}
let lastFrameAt = 0;
function frame() {
  // 重さを抑える: 隠れている時は描かない。描くのは 1 秒 60 こままで。メニュー・一時停止・始める前は 1 秒 5 こま
  if (document.hidden) return;
  if (replay && replay.on) { const now = performance.now(); if (now - lastFrameAt < 1000 / 61) return; lastFrameAt = now; replay.tick(Math.min(clock.getDelta(), 0.1)); return; }   // 11/23 リプレイの間は世界を止めて、覚えた動きを見せる
  if (loadBusy) return;   // 11/21 読み込み中はタイトルの絵の裏なので描かない(描くと絵の作りで主スレッドが止まっていた)
  const now = performance.now();
  const idle = !started || overlayOn;
  if (now - lastFrameAt < (idle ? 200 : 1000 / 61)) return;
  lastFrameAt = now;
  const dt = Math.min(clock.getDelta(), 0.1);
  // 11/21 持ち主「観戦モードはメニュー開く際一時停止しなくていい」: 観戦中に一時停止の画面だけが開いている時は、試合を進め続ける(操作の入力は読まない)
  const watchMenu = overlayOn && watch && watch.on && !$('panel').classList.contains('hide') && $('title').classList.contains('hide') && $('result').classList.contains('hide');
  if (started && (!overlayOn || watchMenu) && !window.__app.manual) { if (!watchMenu) keyInput(); stepWorld(dt); }
  updateCrowdNear();
  if (started) updateUI();
  renderOnce(dt);
  if (replay && started && !overlayOn && mode === 'defense') replay.capture(dt);
  gfx.autoTick(now, idle || !!window.__app.manual || !!(watch && watch.walkers && watch.walkers.building && watch.walkers.group.visible));   // 11/25 道作りの途中は測らない   // スマホの「自動」: fps を測って段を替える(gfx.js)
  { const wk = watch && watch.walkers, wq = gfx.Q.walk; if (wq && wk && wk.built) { const k = Math.min(wq, wk.pool.length); if (wk.K !== k) wk.K = k; } }   // 自動の段の、歩く人の形の数
  frames++; fpsT += dt;
  if (fpsT >= 1) { fpsVal = frames / fpsT; frames = 0; fpsT = 0; $('fps').textContent = fpsVal.toFixed(0) + ' fps'; }
}
renderer.setAnimationLoop(frame);

// ---------------------------------------------------------------- 遊びの部品に渡す口
const ctx = {
  THREE, scene, camera, renderer, canvas, player, P, input, keys, sound, IS_TOUCH, params, BASES,
  get bvh() { return bvh; }, groundAt, surfaceAt, fenceDist, toast, hud, store, load,
  get mode() { return mode; }, setMode(m) { mode = m; setIndoor(m === 'walk' || m === 'sit'); refreshHint(); },
  setCamOverride(v) { camOverride = v; if (!v) cam.init = false; }, meYaw: () => meYaw, meFig: () => me, roofAt: DOME || RING || GROVE ? roofAt : null, semiOpen: !!stadiumInfo(STADIUM).semi, get indoor() { return INDOOR_ST || (ROOFPARK && roofClosed); }, stadiumIndoor: INDOOR_ST, stadiums: STADIUMS, stadium: STADIUM, get dugouts() { return DOME && domeField && domeField.dugouts ? [domeField.dugouts.third_side, domeField.dugouts.first_side].filter(Boolean) : null; }, placeAt, lockPointer, releasePointer, refreshHint, setPhoto,
  get simTime() { return simTime; }, get timeKey() { return timeKey; },
  world: { get bvh() { return bvh; }, surfaceAt, groundY: (x, z, from) => groundAt(x, z, from ?? 5, 40) },
  el: $,
  get ui() { return ui; }, get view() { return activeView(); }, myHandPos, setViewQuiet: (v) => setView(v, true),
  // 視点を指で動かしていない時間(秒)。守備の見回しの補助に使う
  lookIdle() { return look.id !== null || drag.on ? 0 : simTime - look.lastT; },
  get fixedView() { return FIXED.has(activeView()); },
};

// メニューの画面
ui = new UI({
  IS_TOUCH, load, store, stadium: STADIUM, stadiumNames: STADIUM_NAMES, stadiumIndoor: INDOOR_ST, stadiums: STADIUMS,
  // 球場を替える: 選んだ物を残して読み直す(モデルが大きく違うので)
  // 11/26 読み直す前に描く所と音を片付ける。11/27 location.href への移動だと、iOS の WKWebView は前の球場のページを丸ごと「戻る」用に残し(back-forward cache)、
  // 球場を替えるたびに記憶が積み上がった(シミュレーターで WebContent が 1 つ目 650MB → 2 つ目 1.1GB → 3 つ目 1.5GB → 2.1GB。実機は 1.5〜2GB で落ちてタイトルに戻る)。
  // URL を replaceState で書き換えてから読み直す(読み直しは back-forward cache に入らない)。?hrefswitch=1 で前の形
  setStadium: (k) => { if (k === STADIUM) return; const u = new URL(location.href); u.searchParams.set('stadium', k); memg.release();
    if (params.has('hrefswitch')) { location.href = u.toString(); return; }
    try { history.replaceState(history.state, '', u.toString()); location.reload(); } catch (e) { location.replace(u.toString()); } },
  get mode() { return mode; }, get view() { return activeView() === '1p' && mode !== 'defense' && mode !== 'walk' ? view : view; },
  get voiceOn() { return sound.voiceOn !== false; },
  setTime: (k) => setTime(k), setView: (v) => setView(v, true), cycleView,
  setVolume: (k, v) => { if (sound.setVolume) sound.setVolume(k, v); },
  setVoice: (on) => { if (sound.setVoice) sound.setVoice(on); else sound.voiceOn = on; store('r4walk.voiceOn', on); },
  startMode, toTitle,
  setOverlay: (on) => { overlayOn = on; if (on) { keys.clear(); input.f = input.r = 0; } },
  onPause: (on) => { if (on) releasePointer(); else if (mode === 'walk' || mode === 'pitch') lockPointer(); },
  skip: () => { if (mode === 'defense') defense.skip(); },
  chooseBase: (b) => { if (mode === 'defense' || (watch && watch.on && watch.intr && watch.intr.holding)) defense.chooseBase(b); },   // 観戦で乱入して捕った時も(watch.js)
  jump: () => { if (mode === 'defense') defense.jump(); },
  dive: () => { if (mode === 'defense') defense.dive(); },
  callBall: () => { if (mode === 'defense') defense.callBall(); },
  knockBest: () => (defense ? defense.best : {}),
});

// 球場の中のスコアボード: 左上の点数板と同じ物(ui.board / ui.digest に渡る状態)を読む
scoreboard = new Scoreboard({ THREE, scene, stadium: STADIUM, getMode: () => ((watch && watch.on) || (cursor && cursor.on) ? 'defense' : mode), getDefense: () => defense, getPlay: () => play, getTime: () => timeKey });
scoreboard.wrapUI(ui);
{ const op = ui.pause.bind(ui); ui.pause = function (...x) { try { refreshWarps(); } catch (e) { console.warn(e); } return op(...x); }; }
// 11/23 一時停止の「リプレイを見る」(守備の時、覚えたプレーがあれば)
function replayPick() { return mode === 'defense' && replay && defense ? replay.pick(!defense.play || defense.play.endT != null) : null; }
{ const op = ui.pause.bind(ui); ui.pause = function (...x) { const r = op(...x); $('pzReplay').classList.toggle('hide', !replayPick()); return r; }; }
$('pzReplay').addEventListener('click', (e) => { e.stopPropagation(); const R = replayPick(); if (!R) return; $('panel').classList.add('hide'); replay.open(R, () => { $('panel').classList.remove('hide'); }); });   // 一時停止を開くたびに、ワープの行き先を作り直す(すっきりの形)

// ---------------------------------------------------------------- 試験用の入口(自動テストと撮影で使う)
window.__app = {
  ready: false, manual: false, WARPS, TIMES, P, DOORS, VIEWS, get solids() { return propSolids; },   // 11/22 夜 置いた物の当たり判定(試験で見る)
  warp, setTime, setQuality, setPhoto, athleteLod: (v) => setAthleteLod(v), start, simulate, setCrowd, sit, standUp, doAction, nearestSeat, seatY: (i) => seats.y[i],
  setView, cycleView, startMode, toTitle, get ui() { return ui; }, get overlay() { return overlayOn; },
  get fps() { return fpsVal; }, soilMats, gfx, get renderer() { return renderer; }, get scene() { return scene; },
  get bvh() { return bvh; }, get places() { return places; }, THREE, get falls() { return falls; }, player, get fieldFall() { return fieldFall; }, wayState: () => wayState(), get wayfind() { return wayfind; },   // 通路口の点検用(tools/probe_layers.py)
  get warpGen() { return warpGen(); }, warpSpot, refreshWarps,   // 11/22 ワープ先(js/warpgen.js)の試験
  get replay() { return replay; }, get defense() { return defense; }, get watch() { return watch; }, get freeplay() { return freeplay; }, get gimmicks() { return gimmicks; }, get mokuhyo() { return mokuhyo; }, get hudPrefs() { return hudPrefs; }, get play() { return play; }, get cursor() { return cursor; }, get lap() { return lap; }, get scoreboard() { return scoreboard; },
  step(sec, sub = 1 / 60) { let t = sec; while (t > 1e-6) { const d = Math.min(sub, t); keyInput(); stepWorld(d); placeCamera(d); updateAthletes(camera, d); t -= d; } updateCrowdNear(); updateUI(); },
  setInput(o) { Object.assign(input, o); },
  pressKey(code) { dispatchEvent(new KeyboardEvent('keydown', { code })); dispatchEvent(new KeyboardEvent('keyup', { code })); },
  state() { placeCamera(); return { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, pitch: player.pitch, onGround: player.onGround, mode,
    input: { ...input }, time: timeKey, quality, stickActive: stick.active, action: curAction ? curAction.label : null, seat: seatIdx,
    cam: camera.position.toArray(), view: activeView(), overlay: overlayOn, speed: player.speedNow }; },
  place(x, y, z, yaw = 0, pitch = 0) { player.pos.set(x, y, z); player.vel.set(0, 0, 0); player.yaw = yaw; player.pitch = pitch; player.onGround = false; safeHist.length = 0; fallFrom.armed = false; },
  look(yaw, pitch) { player.yaw = yaw; player.pitch = pitch; },
  placeAt, groundAt: (x, z, from = 60) => groundAt(x, z, from, 120), surfaceAt, fenceDist,
  pause() { renderer.setAnimationLoop(null); },
  resume() { clock.getDelta(); renderer.setAnimationLoop(frame); },
  snap() { renderOnce(1 / 60); renderOnce(1 / 60); return canvas.toDataURL('image/jpeg', 0.9); },
  render(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) { updateUI(); renderOnce(dt, true); } },
  timeFrames(n) {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) renderOnce();
    const gl = renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    return (performance.now() - t0) / n;
  },
  info() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; },
  camera, scene, renderer, sound,
};
window.__app.seatView = SEATVIEW;   // 11/21 試験で前後を比べる(on を切ると前のまま)

setTime(params.get('time') && TIMES[params.get('time')] ? params.get('time') : (ui.sel.time || 'day'));
function idleBuild() {
  if (params.has('noidlebuild')) return;
  const idle = !started || overlayOn;
  if (!idle || loadBusy || document.hidden) { setTimeout(idleBuild, 400); return; }
  const g = warpGen();
  if (g && !g.ready) { g.step(12); setTimeout(idleBuild, 30); return; }
  if (watch && !params.has('nowalkers')) {
    if (!watch.walkers) { try { watch.prepWalkers(); } catch (e) { console.warn('歩く人の準備', e); return; } }
    const W = watch.walkers;
    if (W && W.building) { W.buildStep(1e9, 12); setTimeout(idleBuild, 30); return; }
  }
  if (bench && !bench.built && !bench.failed && !bench.building) { try { bench.build(); } catch (e) { /* 遊ぶ時に作る */ } }
}
// 11/26 サクサク(持ち主「徹底的に軽く」): ボールパークで過ごすの売店・看板・ごみ箱などの小物(後から作る)も、スマホの「自動」では球場の小物と同じく遠くでは描かない(gfx.cullDyn)。?nocullfp=1 で前の形
if (IS_TOUCH && !params.has('nocullfp')) setInterval(() => { try { if (freeplay && freeplay.group) gfx.cullDyn(freeplay.group); } catch (e) { /* 描き方の飾り */ } }, 2000);
loadAll().then(() => {
  loadBusy = false; fastRay = LOADFIX;
  warp(0, true);
  // 11/22 ワープ先は読み終えてから少しずつ作る。11/25 遊んでいる間は進めない(タイトル・メニューの間だけ。一時停止のワープの一覧を開いた時に残りを済ませる)。
  // 続けて、歩く人の道もタイトルで待っている間に先に作っておく(遊び始めてからの重さの直し)
  setTimeout(idleBuild, 2500);
  if (params.has('autostart')) start();
  // 球場を選ぶ画面で別の球場に決めて読み直した時は、読み終わったらそのまま始める(タイトルへは戻らない)
  let goNow = false; try { goNow = sessionStorage.getItem('r4walk.go') === '1'; sessionStorage.removeItem('r4walk.go'); } catch (e) { /* 使えない環境 */ }
  if (goNow && ui && ui.go) ui.go();
  { const ls = $('loadScreen'); if (ls) ls.classList.add('hide'); }
}).catch((err) => {
  loadBusy = false;
  console.error(err);
  $('loadtxt').textContent = '読み込みに失敗しました: ' + (err && err.message ? err.message : err);
});
