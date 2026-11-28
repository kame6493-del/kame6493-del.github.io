// 守備: 「試合」(1〜9回、延長12回まで。規則は rules.js。自分が関わる場面だけ操作し、ほかは早送り)と「ノック」(10/50/100 本)。
// 操作は 2 つだけ: 動く(近づけば自動で捕る)/捕ったら投げる塁を選ぶ(一塁・二塁・三塁・本塁・中継)。送球の強さは自動。
import * as THREE from 'three';
import { KIT } from './figures.js';
import { Athlete as Person, motionRoot, motionEvent } from './athletes.js';
// コース(''・high・low・in・out・miss・bunt)の打撃の動きの「当たる」時刻
const swingContact = (c) => motionEvent(c ? 'bat_' + (c === 'bunt' ? 'bunt' : 'swing_' + c) : 'bat_swing', 'contact') ?? motionEvent('bat_swing', 'contact');
import { BallView, ballVisScale } from './ball.js';
import { predict, samplePath, pathDuration, solveThrow } from './ballsim.js';
import { diamondSVG } from './ui.js';
import { PHYS } from './physics.js';
import * as R from './rules.js';
import { newMatch } from './uniform.js';   // 11/21 試合ごとにチーム(色)を選び直す
import * as BR from './brain.js';
import { commentate, cmTick } from './commentary.js';
import { Guide } from './guide.js';   // 11/21 夜 ガイドモード(落下点・動く向き・投げる先)と守備の練習
import { mkEv } from './mokuhyo_data.js';   // 11/22 目標の出来事(守備で捕った・ファインプレー・ノック・試合)

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const D2R = Math.PI / 180;
const VX = (a) => V(a[0], 0, a[1]);

export const POS = {};
for (const k of Object.keys(R.POS_XZ)) POS[k] = { label: R.POS_LABEL[k], at: VX(R.POS_XZ[k]), of: R.OF.includes(k), side: R.POS_XZ[k][0] < 0 ? -1 : 1 };
POS.P.at.y = 0.25;
const BASEP = R.BASE_XZ.map(VX);
const BASE_NAME = R.BASE_NAME;
// 11/21 持ち主「内野ゴロでファーストがベースから離れながら取っている」: 一塁のベース(一辺 0.38 m の四角、辺は本塁→一塁の線に沿う)。
// RUN1 = 本塁→一塁の向き、IN1 = 線から内野側(二塁の方)、FOUL1 = 線からファウル側(打者走者の走る側)
const RUN1 = V(BASEP[1].x - BASEP[0].x, 0, BASEP[1].z - BASEP[0].z).normalize();
const IN1 = V(-RUN1.z, 0, RUN1.x).multiplyScalar(V(-RUN1.z, 0, RUN1.x).dot(V(BASEP[2].x - BASEP[1].x, 0, BASEP[2].z - BASEP[1].z)) > 0 ? 1 : -1);
const FOUL1 = IN1.clone().negate();
const BAG_HALF = 0.19;
const bag1Dist = (x, z) => { const dx = x - BASEP[1].x, dz = z - BASEP[1].z; const s = dx * RUN1.x + dz * RUN1.z, q = dx * IN1.x + dz * IN1.z; return Math.hypot(Math.max(0, Math.abs(s) - BAG_HALF), Math.max(0, Math.abs(q) - BAG_HALF)); };
const _fv = V();
const DIFF = {
  easy: { label: '易しい', reach: 1.6, ev: 0.0, ai: 2.0, speed: 8.6 },
  normal: { label: 'ふつう', reach: 1.2, ev: 0.35, ai: 1.8, speed: 8.0 },
  hard: { label: '難しい', reach: 0.95, ev: 0.7, ai: 1.7, speed: 7.6 },
  // 11/20 持ち主「難易度設定要らない」: 難しさは 1 つだけ(易しいとふつうの間)。難しさは打球の種類のばらつきで出す(varietyBall)
  std: { label: '', reach: 1.4, ev: 0.35, ai: 1.8, speed: 8.3 },
};
// 打球の種類と出る割合(本物の試合に近く: 簡単な物が多め、届かない物も少し)。同じ種類が続きすぎないよう、直前 2 本と同じ種類は出にくくする
const KIND_W = { easy: 33, step: 15, run: 12, charge: 9, hop: 7, hard: 5, back: 6, dive: 4.5, jump: 5, foul: 5, through: 4 };   // 11/23 持ち主「ファールフライとかギリギリのフライとか」: foul 3→5   // 11/20 飛び込む 9→4.5・跳ぶ 6→5(作り直しの付け替わりを直したら、どちらも本当にその種類で出るようになったので)
export const KIND_LABEL = { easy: '正面・簡単', step: '少し動く', run: '全力で走る', charge: '前へ突っ込む', hop: 'バウンドが変わる', hard: '強い当たり', back: '背走', dive: '飛び込む', jump: '跳ぶ', foul: 'ファウルフライ', through: '抜ける' };
// 11/21 攻略組の 2 人「最初は捕るのが難しい」: 初めての人は今の球の方へ走り、フライ・深いゴロで捕れる所を通り過ぎていた(tools/beginnertest.py)。
// 自分の打球の初め 8 本だけ、倒した向きを捕れる所の方へ寄せ、着いたら足を緩める(画面には何も出さない)。1 本ごとの強さ。9 本目からは何もしない
const HELP_K = [0.9, 0.9, 0.9, 0.9, 0.9, 0.7, 0.5, 0.3];
// 11/25 持ち主「ちゃんと向く方向に飛び込んで取る感じで ギリギリのプレーは飛び込んだから取れたみたいな感じで」: 飛び込みの作り直し(?olddive=1 で前の形)。
//   向き: 捕れる所(打球の道筋で、体が飛んでグラブの先が届く所)へ。後ろへは飛ばない。動き: 踏み切り → 宙で体が伸びる → グラブの先で捕る → 腹から着地して滑る → 起き上がる。
//   届く所: 前は「体の 0.95 m 前を中心に半径 R+0.55 m の輪」で横にも広く届いた。今は「体からグラブの先(最大 1.8 m)までの細い帯(半径 0.6 m)」だけ。
//   走り続けた時より約 1 m 先まで届く(球の 0.14〜0.2 秒前に飛べば +0.9〜1.0 m)。守備の能力(career.js の diveK)で体の伸び・グラブの先が少し伸びる
const LOOSE_OFF = typeof location !== 'undefined' && /[?&]noloose=1/.test(location.search);   // 11/25 抜けた球を拾う速さの直し(looseSteer・視点の振り向き・自動の外野手)を使わない
const NEWDIVE = !(typeof location !== 'undefined' && /[?&]olddive=1/.test(location.search));
// 11/26 持ち主「正面から飛び込んで取る感じに … 正面からまっすぐに飛ぶ感じです 向き方向に」: 今向いている向き(一人称はカメラの前、三人称は体の前)へ、頭から腹ばいでまっすぐ飛ぶ。
//   横の打球は、先に打球の方へ向き直ってから(DV.turnW の速さ)正面へ飛ぶ。捕れる所は前と同じグラブの帯(体の前、グラブの先まで)。?sidedive=1 で 11/25 の形(体を横にして飛ぶ)
const FRONTDIVE = NEWDIVE && !(typeof location !== 'undefined' && /[?&]sidedive=1/.test(location.search));
const angDiff = (a, b) => { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); };
const DV = { v0: 9.5, stop: 0.62, tipMax: 1.8, tipT: 0.14, rr: 0.6, win0: 0.05, win1: 0.5, yawOff: -1.83, turnW: 15, turnMin: 0.12, turnMax: 2.0 };   // turnW: 向き直る速さ(rad/秒、90 度で 0.1 秒)。turnMin より小さいずれは向き直らずに飛ぶ。turnMax(115 度)より後ろへは向き直らない   // yawOff: 飛び込みの動き(Mixamo)は体の左へ倒れるので、頭が飛ぶ向きを向くよう体を回す(実測で 105 度)
const diveTip = (t) => 0.3 + (DV.tipMax - 0.3) * Math.min(1, t / DV.tipT) - (t > 0.55 ? Math.min(0.3, t - 0.55) : 0);   // グラブの先(体の中心から前へ m)
const diveGloveH = (t) => (t < 0.1 ? 0.9 : t < 0.42 ? 0.9 - (t - 0.1) / 0.32 * 0.78 : 0.12);   // グラブの高さ(足もとから m)。宙では胸の高さ、着地で地面すれすれ
const diveHi = (t) => (t < 0.3 ? 1.35 : diveGloveH(t) + 0.6);   // 届く高さの上(宙にいる間は横のライナーにも手が届く)
const diveTravel = (t, k) => { const u = Math.min(t, DV.stop); return DV.v0 * k * (u - u * u / (2 * DV.stop)); };   // 体が前へ進んだ距離(踏み切りで速く、着地して滑って止まる)
const DIVE_EXTRA = NEWDIVE ? 0.9 : 1.1;  // 飛び込むと、走り続けた時より何 m 先まで届くか(reachClass)。myReachHit・updateAct から: 球の 0.04 秒前に飛べば 1.48 m、0.2 秒前なら 1.15 m、0.3 秒前は 0.7 m。人が飛ぶ間合い(0.2 秒前)に合わせた
// 外野手の送球の初速(m/s): 高校生の外野手の返球 90〜110 km/h。ノーバウンドで届くのは 60 m 台まで(11/20、自分も自動の外野手も同じ。docs/物理の値.md)
const ofThrowSpeed = (dist) => Math.min(30.5, 25 + dist * 0.08);
const RUN_SPEED = 7.2;      // 走者(m/s)
const BATTER_SPEED = 6.6;   // 打者走者(振り終わってからの走り出し。本塁から一塁まで約 4.4 秒、高校生の右打者くらい)
// brain.js(プロの判断)を高校生の速さと肩で使う(docs/判断の組み込み手順.md の 0)
const BLV = { ...BR.PRO, runSpeed: RUN_SPEED, batterSpeed: BATTER_SPEED, arm: { LF: 29.5, CF: 29.5, RF: 30, IF: 33, C: 31, P: 30 },   // 送球の初速はゲームの自動の野手の実際(外野 27+0.09×距離・最大 33.5、内野 29+0.17×距離・最大 36)に合わせる
  exchangeOF: { charge: 1.25, flat: 1.35, back: 1.5, side: 1.45 }, exchangeIF: 0.72, relay: 0.7, turnLoss: 0.3, startLoss: 0.25, homeNeedAdj: 0.52, thirdNeedAdj: 0, earlyRead: true };   // 外野を高校生の速さにした後、単打の二塁走者の生還が 5〜7 割になるよう合わせた(11/18)   // 高校生の試合は本塁をプロより攻める(単打の二塁走者 約 6 割)   // 持ち替え・中継はゲームの自動の野手の実際の時間(外野 1.0〜1.3 秒・内野 0.6〜0.85 秒・中継 0.7 秒)に合わせる
try { window.__BR = BR; window.__BLV = BLV; } catch (e) { /* 試験で中を見るため */ }
const AI_SPEED = 7.0;       // ほかの野手(平均。人ごとの最高速は VMAX)
const VMAX = { P: 7.0, C: 6.6, '1B': 7.2, '2B': 7.8, SS: 7.9, '3B': 7.4, LF: 7.7, CF: 8.0, RF: 7.7 };   // 高校生の最高速(m/s)。外野は 11/18 に高校生らしく少し遅く(持ち主「高校生らしく遅くしていい」)   // 高校生の最高速(m/s)
const ACC = 6.5, DEC = 8.0;  // 加速・減速(m/s^2)
const REACT = 0.25;         // 打った瞬間から動き出すまで(秒)
// 11/26 守備・走塁の直し(持ち主「外野フライでまだ外野のチャージ甘くて…ベースカバー異常に遅かったり…ファーストとかがベース離れる…ランナーが詰まっているのに全速力で走って」)。
// ?oldai=1 で前の形(試験の前後比べ用)
const COVFIX_OFF = typeof location !== 'undefined' && /[?&]oldai=1/.test(location.search);
const AICOMMIT_OFF = typeof location !== 'undefined' && /[?&]oldcommit=1/.test(location.search);   // 11/28 比べる用: CPU の送球の予約が 2 つ重なる直しを外す
const HOMEFIX_OFF = typeof location !== 'undefined' && /[?&]oldhome=1/.test(location.search);   // 11/28 比べる用: 直す前の捕手(本塁で持たずに投げる・カバーの自分を見ない)
// 11/27 夜 持ち主の直し(fix1127b): ?oldiff=1 インフィールドフライの走者を前の形に / ?oldpick=1 止まった球を拾い直した時の「直接捕球」の判定を前の形に / ?oldtalk=1 実況の「抜けた」「セーフ」を前の形に
const OLDIFF = typeof location !== 'undefined' && /[?&]oldiff=1/.test(location.search);
const OLDPICK = typeof location !== 'undefined' && /[?&]oldpick=1/.test(location.search);
const OLDWEAKP = typeof location !== 'undefined' && /[?&]oldweakp=1/.test(location.search);   // 11/28 夕 比べる用: 直す前の弱いゴロ(自分が追う球を投手が横取りする・ほかの野手が先に捕った自分の打球も自分のミス/機会に数える)
const OLDCAM = typeof location !== 'undefined' && /[?&]oldcam=1/.test(location.search);   // 11/27 フライを追う時の視点の回り方を前の形に
const OLDTALK = typeof location !== 'undefined' && /[?&]oldtalk=1/.test(location.search);
const ACC_COV = COVFIX_OFF ? 6.5 : 8.5;   // 塁に入る人の走り出しの加速(m/s²)
// フェアかファウルか(原点は本塁の後ろの頂点、ファウルラインは 45 度)
const TAG_R = 1.1;   // 走者に触れられる距離(グラブを伸ばして、m)
const HOME_RECV = V(0.25, 0, -1.0);   // 本塁で送球を受ける所(本塁の前のフェア側。三塁からの走路から約 0.8 m 外し、ふさがない)
const FOUL_TYPES = ['foul_tip', 'foul_grounder', 'foul_line', 'foul_stands', 'foul_fly'];
const isFair = (x, z) => z <= 0.02 && Math.abs(x) <= -z + 0.04;
const DT = 1 / 240;
const HALF = 0.3 * 27.43;   // フライで様子を見る走者の離塁
const UMP_KIT = { jersey: 0x1b2230, pants: 0x737b88, cap: 0x1b2230, sock: 0x1b2230, under: 0x1b2230 };
const UMP_AT = { 0: V(-0.3, 0, 1.55), 1: V(23.5, 0, -16.5), 2: V(-5, 0, -45), 3: V(-23.5, 0, -16.5) };
const POS_VOICE = { P: 'position_P', C: 'position_C', '1B': 'position_1B', '2B': 'position_2B', SS: 'position_SS', '3B': 'position_3B', LF: 'position_LF', CF: 'position_CF', RF: 'position_RF' };
const NUM = { P: 1, C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9 };

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const snap = (g) => ({ inning: g.inning, half: g.half, outs: g.outs, bases: g.bases.slice(), score: { ...g.score }, balls: g.balls, strikes: g.strikes });

export class Defense {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.world = { bvh: ctx.bvh, surfaceAt: ctx.surfaceAt, groundY: (x, z, f) => ctx.groundAt(x, z, f ?? 5, 40), roofAt: ctx.roofAt || null };
    this.rng = mulberry(ctx.params.has('seed') ? +ctx.params.get('seed') : (Date.now() & 0xffffff));
    this.active = false;
    this.group = new THREE.Group(); this.group.visible = false; this.scene.add(this.group);
    this.fig = {};
    for (const k of Object.keys(POS)) {
      const f = new Person(KIT.home, { mitt: k === 'C', mask: k === 'C', number: String(NUM[k]), of: !!POS[k].of });
      this.group.add(f.root); this.fig[k] = f;
    }
    this.batter = new Person(KIT.away, { bat: true, helmet: true, glove: false });
    // 左打者は右打ちの動きを鏡に映して使う(親の箱を x 方向に -1 倍。打席・構え・バット・スイング・走り出しが全部左右逆になる)
    this.batterMirror = new THREE.Group(); this.group.add(this.batterMirror); this.batterMirror.add(this.batter.root);
    this.runnerFigs = [0, 1, 2, 3].map(() => { const f = new Person(KIT.away, { helmet: true, glove: false }); this.group.add(f.root); return f; });
    this.knocker = new Person({ jersey: 0x24324a, pants: 0x24324a, cap: 0x24324a, sock: 0x24324a, under: 0x24324a }, { bat: true, glove: false });
    this.group.add(this.knocker.root);
    // 審判(球審と塁審 3 人)。顔・番号なし
    this.ump = {};
    for (const b of [0, 1, 2, 3]) { const u = new Person(UMP_KIT, { glove: false }); u.root.position.copy(UMP_AT[b]); u.setYawToward(b === 0 ? 0 : 0, b === 0 ? -20 : -20); this.group.add(u.root); this.ump[b] = u; u.anim = null; }
    this.ballView = new BallView(this.scene);
    this.ballView.visScale = 1.0;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.visible = false; this.scene.add(ring); this.ring = ring;
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.visible = false; this.scene.add(sh); this.shadow = sh;
    // フライの落下地点の目印(設定で あり/なし)。光は使わない薄い輪
    // 赤い丸(太い赤の輪+内側を赤くうっすら+白い細い縁取り)。芝でも土でも見える(11/18 持ち主「赤い丸で目立つように」)
    const lm = new THREE.Mesh(new THREE.RingGeometry(0.74, 1.2, 48), new THREE.MeshBasicMaterial({ color: 0xff1a10, transparent: true, opacity: 0.0, depthWrite: false, toneMapped: false }));
    const lmIn = new THREE.Mesh(new THREE.CircleGeometry(0.74, 40), new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.0, depthWrite: false, toneMapped: false }));
    const lmEdge = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.3, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, toneMapped: false }));
    lm.add(lmIn); lm.add(lmEdge); lm.inner = lmIn; lm.edge = lmEdge;
    lm.rotation.x = -Math.PI / 2; lm.visible = false; this.scene.add(lm); this.landMark = lm;
    // 投げられる野手の足もとを控えめに明るくする(記号は足さない)
    const gc = document.createElement('canvas'); gc.width = gc.height = 64;
    { const g = gc.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,190,0.9)'); gr.addColorStop(0.6, 'rgba(255,220,140,0.35)'); gr.addColorStop(1, 'rgba(255,220,140,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
    const gtex = new THREE.CanvasTexture(gc);
    this.glows = [0, 1, 2, 3, 4].map(() => { const m = new THREE.Mesh(new THREE.CircleGeometry(1.0, 24), new THREE.MeshBasicMaterial({ map: gtex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 })); m.rotation.x = -Math.PI / 2; m.visible = false; this.scene.add(m); return m; });
    this.hover = null;
    this.best = ctx.load('r4walk.knockBest', {});
    this.sel = { mode: 'game', pos: 'SS', count: 10, diff: 'easy' };
    this.meAnim = null;
    this.align = { off: {}, tags: [] };
    this.guide = new Guide(this);   // ガイドモードと練習(js/guide.js)
    this.tut = null;
  }

  // ------------------------------------------------------------ 外から見る口
  // 11/27 守備のキャリアの一歩目(career.js の EFFECT.start → startK): 打ってから 0.6 秒の間は速さに足す(初めに startK 倍を足し、0.6 秒で 0 へ)。キャリアの外は 0
  fullSpeed() { const s = (this.D || DIFF.easy).speed, k = this.startK || 0, pl = this.play; if (k > 0 && pl && pl.contactT != null && pl.phase !== 'pre') { const u = pl.t - pl.contactT; if (u >= 0 && u < 0.6) return s * (1 + k * (1 - u / 0.6)); } return s; }
  holding() { return !!(this.play && this.play.holder === 'me'); }
  inDigest() { return !!this.dg; }
  frozen() { return !!this.dg || !!(this.meAct && this.meAct.kind === 'dive'); }
  // ------------------------------------------------------------ ジャンプ・飛び込み(捕る前だけ)
  // 初めの数球の手助け(HELP_K): main.js の physicsStep から毎こま。返す [mx, mz] か null(そのまま)。
  // 止まっている時は変えない(自分から勝手には動かない)。弱く助ける本数(0.7 未満)は、押した向きが捕れる所から 110 度より離れていたら変えない
  steerMove(mx, mz) {
    const ls = this.looseSteer(mx, mz); if (ls) return ls;
    const pl = this.play, b = this.ball, ml = Math.hypot(mx, mz);
    if (!pl || !pl.helpK || ml < 0.05 || !b || !pl.batted || b.path !== pl.batted.path || pl.thrown || pl.holder || pl.endT || this.meAct || this.dg) return null;
    const P = this.ctx.player.pos, k = pl.helpK;
    if (!pl.helpTg || pl.t - pl.helpTgT > 0.25) { pl.helpTg = this.interceptFor(P, b, pl.t, this.fullSpeed(), 0, 0.5, 0); pl.helpTgT = pl.t; }
    const dx = pl.helpTg.x - P.x, dz = pl.helpTg.z - P.z, dist = Math.hypot(dx, dz);
    const ux = mx / ml, uz = mz / ml;
    if (dist < 0.5) { const s = (1 - k) + k * Math.max(0, (dist - 0.15) / 0.35); return [mx * s, mz * s]; }   // 着いたら待つ(通り過ぎない)
    const tx = dx / dist, tz = dz / dist;
    if (ux * tx + uz * tz > 0.94) return null;   // 向きがもう合っている人(約 20 度以内)には触らない
    // 球の方へ倒したまま捕れる所が後ろにある(頭を越えるフライ・深いゴロ)時も、強く助ける間は捕れる所へ下がる(前を向いて球を見たまま)
    if (ux * tx + uz * tz < -0.35) return k >= 0.7 ? [tx * ml, tz * ml] : null;
    let nx = ux * (1 - k) + tx * k, nz = uz * (1 - k) + tz * k; const nl = Math.hypot(nx, nz) || 1;
    return [nx / nl * ml, nz / nl * ml];
  }
  // 11/25 テスター「外野で後ろに抜けた球を拾うのに時間がかかる」: 外野で地面に落ちた球(跳ねた・転がる球)を自分が追う時は、
  // 倒した向きが追いつく所から左右 75 度以内なら、追いつく所へまっすぐ向ける(球の今の所を追って弧を描かない)。速さ(倒した強さ)は変えない。
  // 止まっている時・逆へ倒した時は触らない。?noloose=1 で前の形
  // 外野で地面に落ちた球を自分が追っているか(looseSteer と、main.js の「半分倒せば全力」)
  looseChase() {
    const pl = this.play, b = this.ball, p = this.ballPos;
    if (LOOSE_OFF || !pl || !b || !p || !POS[this.my] || !POS[this.my].of || pl.thrown || pl.holder || pl.endT || this.meAct || this.dg || this.watching) return false;
    if (!pl.batted || b.path !== pl.batted.path) return false;
    const tb = pl.t - b.t0;
    if (!b.path.events.some((e) => (e.type === 'bounce' || e.type === 'roll' || e.type === 'stop') && e.t <= tb)) return false;   // まだ宙にある球は今までどおり
    if (this.inInfield(p)) return false;
    const P = this.ctx.player.pos;
    if (pl.looseK && this.fig[pl.looseK] && POS[pl.looseK].of) { const F = this.fig[pl.looseK].root.position; if (Math.hypot(F.x - p.x, F.z - p.z) + 2 < Math.hypot(P.x - p.x, P.z - p.z)) return false; }   // 自動の外野手の方がずっと近い
    return true;
  }
  looseSteer(mx, mz) {
    const pl = this.play, b = this.ball, ml = Math.hypot(mx, mz);
    if (ml < 0.05 || !this.looseChase()) return null;
    const P = this.ctx.player.pos;
    if (!pl.lsTg || pl.t - pl.lsT > 0.15) { pl.lsTg = this.interceptFor(P, b, pl.t, this.fullSpeed(), 0, this.D.reach * 0.6, 0); pl.lsT = pl.t; }
    const dx = pl.lsTg.x - P.x, dz = pl.lsTg.z - P.z, dist = Math.hypot(dx, dz);
    if (dist < 0.4) return null;
    const ux = mx / ml, uz = mz / ml, tx = dx / dist, tz = dz / dist;
    if (ux * tx + uz * tz < 0.26) return null;   // 75 度より外へ倒した: その人の向きのまま
    return [tx * ml, tz * ml];
  }
  canAct() { const pl = this.play; return !!(this.active && !this.dg && pl && pl.phase !== 'pre' && pl.holder !== 'me' && !pl.endT && !this.meAct); }
  jump() {
    const c = this.ctx;
    if (!this.canAct() || !c.player.onGround) return false;
    c.input.jump = true;
    this.meAct = { kind: 'jump', t: 0, dur: 0.75 };
    return true;
  }
  // 11/25 飛び込む向き: これからの打球の道筋で、飛び込んだ体とグラブの先が届く一番早い所。届く所が無ければ一番惜しい所。後ろへは飛ばない
  diveAim(face) {
    const c = this.ctx, P = c.player.pos, b = this.ball, pl = this.play;
    if (!b || !pl || !b.path) return null;
    const path = b.path, tb = pl.t - b.t0, k = this.diveK || 1, rr = DV.rr * (this.D.reach / 1.4);
    const front = FRONTDIVE && face != null;
    let best = null, bestLack = 1e9;
    for (let i = Math.max(0, Math.floor(tb / path.dt)); i < path.n; i++) {
      const tau0 = i * path.dt - tb;
      const x = path.pts[i * 4], y = path.pts[i * 4 + 1], z = path.pts[i * 4 + 2];
      // 11/26 正面へ飛ぶ: その所の向きまで向き直る時間を引いた時刻で、体が飛んで届くかを見る
      let tau = tau0;
      if (front) { const da = Math.abs(angDiff(Math.atan2(-(x - P.x), -(z - P.z)), face)); if (da > DV.turnMax) continue; if (da > DV.turnMin) tau = tau0 - da / DV.turnW; }
      if (tau < DV.win0) continue; if (tau > DV.win1) break;
      const hy = y - P.y; if (hy < -0.15 || hy > diveHi(tau)) continue;   // グラブは宙からでも地面まで下ろせる
      const dist = Math.hypot(x - P.x, z - P.z), reach = diveTravel(tau, k) + diveTip(tau) * k;
      const lack = dist - reach;
      if (lack <= rr * 0.6 && lack >= -(diveTip(tau) * k - 0.5)) { best = V(x - P.x, 0, z - P.z); break; }
      if (Math.abs(lack) < bestLack) { bestLack = Math.abs(lack); best = V(x - P.x, 0, z - P.z); }
    }
    if (!best || best.lengthSq() < 1e-6) return null;
    best.normalize();
    const bp = this.ballPos;
    if (bp) {
      const ref = V(bp.x - P.x, 0, bp.z - P.z);
      if (ref.lengthSq() > 0.04) {
        ref.normalize(); const dt2 = best.dot(ref);
        if (dt2 < -0.1) { best.addScaledVector(ref, -dt2); if (best.lengthSq() < 0.01) best.copy(ref); best.normalize(); }   // 後ろ向きの分を消して横へ
      }
    }
    return best;
  }
  dive(dir) {
    const c = this.ctx;
    if (!this.canAct()) return false;
    let d = dir ? dir.clone() : null;
    if (FRONTDIVE) {
      // 11/26 今向いている向き(main.js が player.faceYaw に入れる: 一人称はカメラ、三人称は体)。捕れる所が横なら、そちらへ向き直ってから正面へ飛ぶ
      const P = c.player, face = Number.isFinite(P.faceYaw) ? P.faceYaw : P.yaw;
      const aim = this.diveAim(face);
      let yaw1 = face;
      if (aim) yaw1 = Math.atan2(-aim.x, -aim.z);
      else if (d && d.lengthSq() > 1e-6) { const yd = Math.atan2(-d.x, -d.z); if (Math.abs(angDiff(yd, face)) <= DV.turnMax) yaw1 = yd; }   // 自動の選手が向きを渡した時(捕れる所が見つからない時も、打球の方へ向いてから)
      const da = angDiff(yaw1, face), turn = Math.abs(da) > DV.turnMin ? Math.abs(da) / DV.turnW : 0;
      if (!turn) yaw1 = face;
      const dd = V(-Math.sin(yaw1), 0, -Math.cos(yaw1));
      const mv = c.player.mv, carry = mv ? V(mv.x, 0, mv.z) : V(); if (carry.length() > 7) carry.setLength(7);
      this.meAct = { kind: 'dive', front: true, t: 0, turn, dur: 1.35 + turn, dir: dd, yaw0: face, yaw1, yawNow: face, carry, lt: -turn, animT: 0, dip: 0, minD: 99, p0: c.player.pos.clone() };
      c.sound.sfx('slide', { gain: 0.45 });
      return true;
    }
    if (NEWDIVE) { const aim = this.diveAim(); if (aim) d = aim; }   // 11/25 捕れる所へ向かって飛ぶ(自動の選手が向きを渡しても、捕れる所が見つかればそちら)
    const mv = c.player.mv;
    if (!d && mv && Math.hypot(mv.x, mv.z) > 0.5) d = V(mv.x, 0, mv.z);
    if (!d && this.ballPos) d = V(this.ballPos.x - c.player.pos.x, 0, this.ballPos.z - c.player.pos.z);
    if (!d || d.lengthSq() < 1e-6) d = V(-Math.sin(c.player.yaw), 0, -Math.cos(c.player.yaw));
    d.y = 0; d.normalize();
    this.meAct = { kind: 'dive', t: 0, dur: 1.35, dir: d };
    if (NEWDIVE) Object.assign(this.meAct, { yawOff: DV.yawOff, animT: 0, dip: 0, minD: 99, p0: c.player.pos.clone() });
    c.sound.sfx('slide', { gain: 0.45 });
    return true;
  }
  // 手の届く所: 普段・跳んでいる間(上に +0.45 m 腕を伸ばす)・飛び込んでいる間(前へ体を投げ出す)
  myReachHit(p) {
    const me = this.ctx.player.pos, R = this.D.reach, a = this.meAct;
    const dh = Math.hypot(p.x - me.x, p.z - me.z), hb = p.y - me.y;
    // 11/25 テスター「センターフライを捕り損ねたのにアウト」: 飛び込んでいる間(踏み切った後)は、立って構えた時の届く輪(体のまわり 1.4 m・どの向きも)では捕らない。
    // 前は宙を飛ぶ間・腹ばいで滑る間・逆の向きへ飛んだ時も、体の横や後ろに落ちた球を捕ってアウトにしていた。捕れるのはグラブの帯(下の NEWDIVE)だけ
    const alt = a && a.kind === 'dive' ? a.t - (a.turn || 0) : 0;   // 11/26 踏み切ってからの時刻(向き直る間は足で立っている)
    const diving = NEWDIVE && a && a.kind === 'dive' && alt >= DV.win0;
    if (!diving && dh < R && hb > -0.1 && hb < 2.4) return { how: null, dh };
    const easy = this.sel.diff === 'easy' ? 1 : this.sel.diff === 'std' ? 0.92 : this.sel.diff === 'normal' ? 0.85 : 0.72;
    // フェンス際(1.4 m 以内)では、フェンスに手をかけて体を引き上げ、フェンスの上へグラブを伸ばせる
    const up = this.nearFence() < 1.4 ? 1.55 : 0.45;   // フェンス際は最高で地面から約 3.95 m(浜風の球場 3.0 m のフェンスなら上 0.4〜0.9 m をもぎ取れる。屋根の球場 4.35 m では届かない)
    if (a && a.kind === 'jump' && a.t < 0.62 * easy + 0.05 && dh < R && hb > 0.3 && hb < 2.4 + up && (up < 1 || p.y < 3.95)) return { how: 'jump', dh, hard: p.y > 2.5 };   // フェンス際でも地面から 3.95 m まで   // フェンス際でも地面から 3.95 m まで
    if (NEWDIVE && a && a.kind === 'dive') {
      // 11/25 体からグラブの先までの細い帯で捕る(ぎりぎりはグラブの先に入る)。帯の外を近くで過ぎたら「かすめた」(a.minD)
      if (alt < DV.win0) { if (dh < R && hb > -0.1 && hb < 2.4) return { how: null, dh }; return null; }   // 向き直っている間は、立って構えた時と同じ
      if (alt > DV.win1) return null;
      const k = this.diveK || 1, tip = diveTip(alt) * k, rr = DV.rr * (R / 1.4), hy = p.y - me.y;
      const rx = p.x - me.x, rz = p.z - me.z, f = rx * a.dir.x + rz * a.dir.z, s = Math.abs(-rx * a.dir.z + rz * a.dir.x);
      const fc = Math.max(0.5, Math.min(tip, f)), d2 = Math.hypot(f - fc, s);
      if (hy > -0.15 && hy < diveHi(alt)) { a.minD = Math.min(a.minD ?? 99, d2 - rr); if (d2 < rr) return { how: 'dive', dh, hard: Math.hypot(p.x - a.p0.x, p.z - a.p0.z) > R * 1.05 }; }
      return null;
    }
    if (a && a.kind === 'dive' && a.t > 0.04 && a.t < 0.62 * easy) {
      const c2 = me.clone().addScaledVector(a.dir, 0.95);   // 伸ばしたグラブは体の前
      const d2 = Math.hypot(p.x - c2.x, p.z - c2.z);
      if (d2 < R + 0.55 && hb > -0.2 && hb < 1.3) return { how: 'dive', dh: d2, hard: dh > R * 1.05 };
    }
    return null;
  }
  // 外野フェンス: 本塁からの角度(度)ごとの距離と高さ(当たり判定のモデルから測る)
  fenceInfo(ang) {
    const k = Math.round(ang);
    this._fence = this._fence || {};
    if (this._fence[k]) return this._fence[k];
    const c = this.ctx, r = k * D2R, dir = V(Math.sin(r), 0, -Math.cos(r)), fd = c.fenceDist(k);
    let top = 4;
    if (c.bvh) for (let y = 0.5; y < 9; y += 0.05) { const h = c.bvh.raycastFirst(new THREE.Ray(V(0, y, 0), dir), THREE.DoubleSide, 1, fd + 0.4); if (!h) { top = y; break; } }
    return (this._fence[k] = { dist: fd, top });
  }
  nearFence() {
    const me = this.ctx.player.pos, ang = Math.atan2(me.x, -me.z) / D2R;
    if (Math.abs(ang) > 50) return 99;
    return this.fenceInfo(ang).dist - Math.hypot(me.x, me.z);
  }
  // フェンスの上 hAbove(m、負ならフェンス直撃)を通る大飛球(角度 ang 度)
  makeFenceBall(ang, hAbove, p0, laDeg = 30) {   // laDeg: 打ち出しの角度(11/20 跳ぶ打球は高く上げて、外野手がフェンスまで走る間を作る)
    const f = this.fenceInfo(ang), r = ang * D2R, dir = V(Math.sin(r), 0, -Math.cos(r));
    const want = f.top + hAbove, la = laDeg * D2R;
    const back = new THREE.Vector3().crossVectors(dir, V(0, 1, 0)).normalize().multiplyScalar(-2000 * Math.PI / 30);
    const flat = { bvh: null, surfaceAt: () => 's', groundY: () => 0 };
    const hAt = (ev) => {
      const v = dir.clone().multiplyScalar(ev * Math.cos(la)); v.y = ev * Math.sin(la);
      const pr = predict(flat, p0, v, back.clone(), 9, { Cd: 0.35, clScale: 1.0, dt: 1 / 120 });
      for (let i = 0; i < pr.n; i++) { const x = pr.pts[i * 4], y = pr.pts[i * 4 + 1], z = pr.pts[i * 4 + 2]; if (i > 10 && y < 0.05) return -1; if (Math.hypot(x, z) >= this.ctx.fenceDist(Math.atan2(x, -z) / D2R)) return y; }   // 球は打者の所から出るので、本塁から見た角度は狙いの角度と少しずれる(20 度 → 19.2 度)。その角度のフェンスで測る   // フェンスの距離は本塁から測っている。地面に一度落ちたら届かない扱い(低いフェンスで、跳ねた球がフェンスの所で 2 m を超えるのを解にしないように)
      return -1;
    };
    let lo = 25, hi = 75;
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (hAt(m) < want) lo = m; else hi = m; }
    const ev = (lo + hi) / 2;
    const v = dir.clone().multiplyScalar(ev * Math.cos(la)); v.y = ev * Math.sin(la);
    const path = predict(this.world, p0, v, back, 9, { Cd: 0.35, clScale: 1.0, dt: DT });
    return { path, type: 'fly', v, w: back, p0: p0.clone(), fence: { ang, hAbove } };
  }
  updateAct(dt) {
    const a = this.meAct; if (!a) return;
    a.t += dt;
    if (FRONTDIVE && a.kind === 'dive' && a.front) {
      // 11/26 向き直る(勢いは少し残す) → 正面へ踏み切り、宙で体が伸びる → 腹から着地して滑る → 起き上がる。動きの時刻は踏み切りから(lt)
      const P = this.ctx.player.pos, k = this.diveK || 1, lt = a.t - a.turn; a.lt = lt;
      if (lt < 0) { const u = a.t / a.turn, e = u * u * (3 - 2 * u); a.yawNow = a.yaw0 + angDiff(a.yaw1, a.yaw0) * e; P.x += a.carry.x * dt * (1 - 0.5 * u); P.z += a.carry.z * dt * (1 - 0.5 * u); }
      else { a.yawNow = a.yaw1; if (lt < DV.stop) { const sp = DV.v0 * k * Math.max(0, 1 - lt / DV.stop); P.x += a.dir.x * sp * dt; P.z += a.dir.z * sp * dt; } }
      const sm = (x) => x * x * (3 - 2 * x);
      a.animT = Math.max(0, lt);
      a.dip = lt <= 0 ? 0 : lt < 0.3 ? sm(lt / 0.3) : lt < 0.95 ? 1 : Math.max(0, 1 - sm(Math.min(1, (lt - 0.95) / 0.4)));
      const pl = this.play;
      if (!a.grazed && lt > DV.win1 && pl && pl.holder !== 'me' && pl.fieldedBy !== 'me' && a.minD < 0.45) { a.grazed = true; pl._graze = true; if (this.ctx.ui && this.ctx.ui.evalPop && !this.dg) this.ctx.ui.evalPop('グラブの先をかすめた', 'miss'); }
      if (a.t >= a.dur) this.meAct = null;
      return;
    }
    if (NEWDIVE && a.kind === 'dive') {
      // 11/25 踏み切りで速く前へ、宙を飛び、腹から着地して滑って止まる(DV.stop 秒)。動きの再生の時刻(animT)と、一人称の目の下がり(dip)
      const P = this.ctx.player.pos, k = this.diveK || 1;
      if (a.t < DV.stop) { const sp = DV.v0 * k * Math.max(0, 1 - a.t / DV.stop); P.x += a.dir.x * sp * dt; P.z += a.dir.z * sp * dt; }
      a.animT = a.t < 0.4 ? a.t * 0.8 : a.t < 0.6 ? 0.32 + (a.t - 0.4) * 1.2 : Math.min(1.0, 0.56 + (a.t - 0.6) * 0.9);
      const sm = (x) => x * x * (3 - 2 * x);
      a.dip = a.t < 0.3 ? sm(a.t / 0.3) : a.t < 0.95 ? 1 : Math.max(0, 1 - sm(Math.min(1, (a.t - 0.95) / 0.4)));
      // 届かなかった: グラブの先の近く(0.45 m 以内)を球が過ぎたら「かすめた」
      const pl = this.play;
      if (!a.grazed && a.t > DV.win1 && pl && pl.holder !== 'me' && pl.fieldedBy !== 'me' && a.minD < 0.45) { a.grazed = true; pl._graze = true; if (this.ctx.ui && this.ctx.ui.evalPop && !this.dg) this.ctx.ui.evalPop('グラブの先をかすめた', 'miss'); }   // hush は今は何も出さないので、1 プレーの札(evalPop)で
      if (a.t >= a.dur) this.meAct = null;
      return;
    }
    if (a.kind === 'dive' && a.t < 0.5) {
      // 体を投げ出して前へ約 2 m(はじめ速く、すぐ止まる)
      const sp = 8.2 * Math.max(0, 1 - a.t / 0.5);
      const P = this.ctx.player.pos;
      P.x += a.dir.x * sp * dt; P.z += a.dir.z * sp * dt;
    }
    if (a.t >= a.dur) this.meAct = null;
  }
  ballWorld() {
    if (this.ball && this.ballPos) return this.ballPos;
    if (this.holderFig && this.holderFig !== 'me') return this.holderFig.root.position;
    return null;
  }
  homeOf(k) { const o = this.align.off[k]; const p = POS[k].at.clone(); if (o) { p.x += o[0]; p.z += o[1]; } return p; }
  say(keys, opt) { if (this.ffw) return; commentate(this, keys, opt); }   // 実況の文の選び方・鳴らすかどうかは commentary.js
  umpCall(key, base) {
    if ((key === 'out' || key === 'safe') && !this._umpDelayed) {
      this.later0(0.35, () => { this._umpDelayed = true; this.umpCall(key, base); this._umpDelayed = false; });
      return;
    }
    // 判定の文字(アウト・セーフ・ダブルプレー・三振)。早送り中は出さない
    if (!this.ffw && !this.dg && this.ctx.ui && this.ctx.ui.callBanner) {
      const pl = this.play;
      const txt = key === 'out' ? (pl && (pl.outs || 0) >= 2 ? 'ダブルプレー' : 'アウト') : key === 'strike_out' ? '三振' : key === 'safe' ? 'セーフ' : key === 'foul' ? 'ファウル' : null;
      if (txt && !(this.watching && key === 'foul')) this.ctx.ui.callBanner(txt, key);   // 11/26 ボールパークで過ごす(観戦)は「ファウル」の大きな文字を出さない(持ち主「飛んで来たら変な文字要らない」。球と審判の声で分かる)
    }
    const u = this.ump[base] || this.ump[0];
    // 遠い審判の声も、はっきり聞こえるように聞く人から 12 m より遠くには置かない(向きは審判の方のまま)
    const at = u.root.position.clone().add(V(0, 1.6, 0)), me = this.ctx.player.pos, dd = Math.hypot(at.x - me.x, at.z - me.z);
    if (dd > 12) { at.x = me.x + (at.x - me.x) * 12 / dd; at.z = me.z + (at.z - me.z) * 12 / dd; }
    this.ctx.sound.call(key, at);
    u.anim = { kind: key, t: 0.9 };
  }

  // ------------------------------------------------------------ 始める・やめる
  begin(sel) {
    const c = this.ctx;
    if (c.mode !== 'walk' && c.mode !== 'defense') { window.__app.warp(0, true); }
    this.sel = { ...this.sel, ...sel };
    this.guide.tutGate(this.sel); this.tut = this.guide.tut; delete this.sel.noTut;   // 11/21 守備を初めて始めた時は練習から(練習の間はノック)
    c.el('toast').classList.remove('show');
    this.ball = null; this.holderFig = null; this.batterRunner = null; this.play = null; this.ballPos = null; this.dg = null;
    this.kind = this.sel.mode;
    this.my = this.sel.pos;
    // 11/20 難しさの設定は無くした(覚えている設定・URL の指定は無視)。観戦(watch.js)は見えない捕手の手の届く所が本塁の打球に掛からないよう ふつう のまま(keepDiff)
    const keepDiff = !!(sel && sel.keepDiff); delete this.sel.keepDiff;   // この 1 回だけ(次の守備の試合へ持ち越さない)
    if (!keepDiff) { this.sel.diff = 'std'; this.sel.bd = 'mix'; }
    this.D = DIFF[this.sel.diff] || DIFF.std;
    this.active = true;
    this.group.visible = true;
    c.setMode('defense');
    c.setCamOverride(false);
    this.stats = { caught: 0, chances: 0, outs: 0, correct: 0, decisions: 0, cover: 0, coverTotal: 0, errors: 0, transfer: [], speed: [], streak: 0, bestStreak: 0, ev: { fine: 0, nice: 0, judge: 0, ok: 0, miss: 0, hit: 0, pts: [] } };
    this.t = 0; this.play = null; this.wait = 0.6; this.pend = []; this.meAct = null; this._pinch = false;
    this.align = { off: {}, tags: [] };
    if (this.kind === 'knock') {
      this.knock = { n: 0, N: this.sel.count, t0: c.simTime, bd: this.sel.bd || 'easy' };
      this.stats.star = { 1: [0, 0], 2: [0, 0], 3: [0, 0] };
      this.g = R.newGame();   // ノックの「想定の走者とアウト」(1 本ごとに決め直す)
      c.ui && c.ui.board(null);
    } else {
      this.g = R.newGame();
      newMatch();   // 11/21 2 試合目から先攻・後攻のチームを選び直す(高校野球は 2 校とも、プロ風は先攻だけ)
      this.knock = null;
      c.hud(null);
      this.wait = 0.1;
      this.firstPA = true;
    }
    this.resetFigures();
    this.placeMe();
    if (c.releasePointer) c.releasePointer();   // 守備はマウスを捕まえない(クリックで投げる野手を選ぶ)
    this.updateHUD();
    this.updatePad();
    c.refreshHint();
  }
  stop(silent) {
    if (!this.active) return;
    const c = this.ctx;
    if (this.tut) { this.tut = null; if (this.guide.tut) { this.guide.tut = null; c.store('r4walk.defTut', true); } silent = true; }   // 練習の途中でやめた: 結果は出さない(次からは練習を出さない)
    this.guide.hide(); this.guide.askHide(); this.guide.card.classList.remove('show'); this.guide.spot.visible = false;   // 11/22 「ガイドはまだ必要ですか?」も必ず閉じる(答えていなければ askPend が残り、次の守備でまた出す)
    this.active = false;
    this.ball = null; this.holderFig = null; this.play = null; this.dg = null;
    this.group.visible = false; this.ballView.show(false); this.ring.visible = false; this.shadow.visible = false;
    this.glows.forEach((g) => (g.visible = false)); document.body.style.cursor = '';
    c.setCamOverride(false);
    c.hud(null);
    if (c.ui) { c.ui.pad('hide'); if (c.ui.acts) c.ui.acts(false); c.ui.skip(false); c.ui.digest(null); c.ui.board(null); }
    this._padKey = null; this.meAct = null;
    if (c.mode === 'defense') c.setMode('walk');
    if (!silent) this.showResult(true);
  }

  resetFigures() {
    for (const k of Object.keys(POS)) {
      const f = this.fig[k];
      f.root.visible = k !== this.my;
      f.home = this.homeOf(k);
      f.root.position.copy(f.home); f.root.position.y = this.gy(f.root.position);
      f.setYawToward(0, 0);
      f.set(k === 'C' ? 'crouch' : 'ready');
      f.target = null; f.noCatchUntil = 0;
    }
    for (const u of Object.values(this.ump)) u.root.visible = this.kind === 'game';
    this.batter.root.visible = this.kind === 'game';
    this.batter.root.position.set(-0.85, 0, -0.25); this.batter.root.rotation.y = -Math.PI / 2; this.batter.set('bat');
    this.knocker.root.visible = this.kind === 'knock';
    this.knocker.root.position.set(-1.4, 0, -0.6); this.knocker.root.rotation.y = 0.05; this.knocker.set('stand');
    this.runners = [];
    this.runnerFigs.forEach((f) => (f.root.visible = false));
    this.layRunners();
  }
  baseGlow(bases) {
    if (!this.bglows) {
      this.bglows = [1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.RingGeometry(0.55, 1.05, 32), new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.32, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; this.group.add(m); return m; });
    }
    this.bglows.forEach((m, i) => { m.visible = !!(bases && bases[i]); m.position.set(BASEP[i + 1].x, this.gy(BASEP[i + 1]) + 0.025, BASEP[i + 1].z); });
  }
  gy(p) { const g = this.ctx.groundAt(p.x, p.z, 3, 10); return g ?? 0; }
  snapHome() {
    for (const k of Object.keys(POS)) {
      const f = this.fig[k];
      f.home = this.homeOf(k);
      f.root.position.copy(f.home); f.root.position.y = this.gy(f.home);
      f.target = null; f.spd = 0; f.chase = null; f.role = null; f.noCatchUntil = 0; f.throwT = 0; f.pointT = 0; f.catchT = 0; f.prep = null; f.rdOut = false;
      f.setYawToward(0, 0);
    }
  }
  allHome() { return Object.keys(POS).every((k) => { const f = this.fig[k]; if (!f.root.visible) return true; const h = f.home || this.homeOf(k); return Math.hypot(f.root.position.x - h.x, f.root.position.z - h.z) < 0.8; }); }
  placeMe() {
    const a = this.homeOf(this.my);
    if (this.my === 'C' && !this.watching) { this.ctx.placeAt(a.x, a.z, 0, -18.4, 1.3, 5); return; }   // 11/25 捕手は投手の方を向く(本塁を向くと真下を見ていた)
    this.ctx.placeAt(a.x, a.z, 0, 0, 1.0, 5);
  }
  // 守備位置を打者・走者・点差で少し変える
  applyAlignment() {
    if (!this.g) { this.align = { off: {}, tags: [] }; return; }
    this.align = R.alignment(this.g);
    // 打者は左右で打席が変わる。球審は捕手の後ろ、打者の側(スロット)
    const hs = this.g.hand === 'L' ? -1 : 1;
    this.batter.root.position.set(-0.85 * hs, 0, -0.25); this.batter.root.rotation.y = -Math.PI / 2 * hs; this.batterMirror.scale.x = 1;   // 左打者は一塁側の打席で、左打ちの動き(*_lh)を使う(鏡は使わない)
    this.ump[0].root.position.set(-0.32 * hs, 0, POS.C.at.z + 0.78);
    for (const k of Object.keys(POS)) {
      const f = this.fig[k]; f.home = this.homeOf(k);
      f.root.position.copy(f.home); f.root.position.y = this.gy(f.home); f.target = null; f.setYawToward(0, 0);
    }
  }
  // 攻める側の背番号(本物の高校野球は攻める側も全員付ける)。並べ替えは試合の乱数(this.rng)を使わない(打球・判断の流れを変えないため)。打順 1〜9 に先発の番号(投手 1、ほか 2〜9)を並べ、試合の間は同じ
  awayOrder() {
    const g = this.g;
    if (!g.awayOrder) { const a = [1, 2, 3, 4, 5, 6, 7, 8, 9]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } g.awayOrder = a; }
    return g.awayOrder;
  }
  batterNum() { const g = this.g; if (!g) return ''; const o = this.awayOrder(); return o[((Math.max(1, g.pa || 1) - 1) % 9 + 9) % 9]; }
  // 塁にいる人の番号を決める。前の打席の終わりに覚えた番号から、その後の打者を後ろに足し、
  // 得点した人は前から(走者は抜かない)、アウトは後ろ(多くは打者)から外して、塁の順に当てる
  runnerNums() {
    const g = this.g, o = this.awayOrder();
    const occ = [3, 2, 1].filter((b) => g.bases[b - 1]);
    const S = g.numSnap;
    if (S && S.pa === g.pa && S.key === g.bases.join()) return S.on.slice();
    const same = S && S.inning === g.inning && S.half === g.half;
    let cand = [];
    if (same) for (const b of [3, 2, 1]) if (S.on[b - 1] != null) cand.push({ num: S.on[b - 1], base: b });
    const from = S ? S.pa + 1 : Math.max(1, (g.pa || 1) - occ.length);
    for (let p = from; p < (g.pa || 1); p++) cand.push({ num: o[((p - 1) % 9 + 9) % 9], base: 0 });
    const runs = same ? Math.max(0, g.score.them - S.them) : 0, outs = same ? Math.max(0, g.outs - S.outs) : g.outs;
    cand = cand.slice(Math.min(runs, cand.length));
    for (let i = 0; i < outs && cand.length > occ.length; i++) cand.pop();
    while (cand.length > occ.length) cand.shift();
    const on = [null, null, null], used = new Set([this.batterNum()]);
    occ.forEach((b, i) => { if (cand[i]) { on[b - 1] = cand[i].num; used.add(cand[i].num); } });
    for (const b of occ) if (on[b - 1] == null || [...on].filter((x) => x === on[b - 1]).length > 1) { const n = o.find((x) => !used.has(x)); on[b - 1] = n; used.add(n); }
    return on;
  }
  saveNums(on) { const g = this.g; g.numSnap = { pa: g.pa, key: g.bases.join(), on, inning: g.inning, half: g.half, them: g.score.them, outs: g.outs }; }
  layRunners() {
    this.baseGlow(this.g ? this.g.bases : null);
    this.runners = [];
    this.runnerFigs.forEach((f) => (f.root.visible = false));
    if (!this.g) return;
    const nums = this.runnerNums(); this.saveNums(nums);
    if (this.batter && this.batter.setNumber) this.batter.setNumber(String(this.batterNum()));
    let fi = 1;
    for (let b = 1; b <= 3; b++) {
      if (this.g.bases[b - 1]) {
        const f = this.runnerFigs[fi++];
        f.root.visible = true;
        // 第一リード(本物の高校野球): 一塁 3〜4 m・線のやや後ろ / 二塁 5〜6 m・三塁の後ろ寄りに膨らむ / 三塁 2〜3 m・ファウル地域
        // 2 アウトや大差では少し大きく、終盤の接戦では少し小さく。人ごとに少しずらす
        const g = this.g, late = g.inning >= 7 && Math.abs(g.score.us - g.score.them) <= 1;
        const adj = (g.outs === 2 ? 0.4 : 0) - (late ? 0.3 : 0) + (this.rng() - 0.5) * 0.8;
        const m = { 1: 3.5, 2: 5.5, 3: 2.5 }[b] + adj;
        const off = { 1: 0.6, 2: 2.0, 3: 1.0 }[b];   // 線から外(ダイヤモンドの外側)へ
        if (f.setNumber) f.setNumber(String(nums[b - 1] ?? ''));
        const r = { num: nums[b - 1], fig: f, base: b, from: b, to: b, dist: m, lead0: m, off, aggr: (this.rng() - 0.5) * 0.6 + (g.outs === 2 ? 0.1 : 0) + (late ? 0.1 : 0), run: false, done: true, out: false, scored: false, forced: false, isBatter: false };
        const lead = this.runnerPos(r);
        f.root.position.copy(lead); f.root.position.y = 0; f.setYawToward(0, -18.4);
        f.set('ready');
        this.runners.push(r);
      }
    }
  }

  // ------------------------------------------------------------ 打球を作る
  // 打球の速さ(m/s): 高校生の打球の散らばり。弱い当たり(40〜80 km/h)約 15%、強烈な当たり(150〜170 km/h)約 8〜18%、
  // ほかは平均 108 + 30L km/h・標準偏差 約 15 km/h の正規分布(75〜150 km/h)
  evSample(L, allowWeak) {
    const r = this.rng();
    if (allowWeak && r < 0.15) return 11 + this.rng() * 11;
    if (r > 0.92 - 0.1 * L) return 41.5 + this.rng() * 5.7;
    const g = (this.rng() + this.rng() + this.rng() - 1.5) * 2;   // ほぼ正規分布(平均 0・標準偏差 約 1)
    return Math.max(21, Math.min(41.5, 30 + 8.5 * L + 4.2 * g));
  }
  // o(11/21 打球の種類を増やした時に足した。無ければ前と同じ): la 打ち出しの角度(度)、ev 速さ(m/s)、
  // spin 回転(rad/s。y は横回転 = 横へ切れる、正で +x(一塁側)へ曲がる)、top 縦回転(rpm。正は逆回転 = 伸びる、負は順回転 = 沈む)。
  // 回転は道筋(predict)の中で効くので、見えている球の動きと同じ(見えない曲がり方はしない)
  makeBall(type, T, L, p0, o = null) {
    const rng = this.rng;
    const d = Math.hypot(T.x - p0.x, T.z - p0.z);
    let dir = V(T.x - p0.x, 0, T.z - p0.z).normalize();
    let v, w;
    const sideW = o && o.side ? -o.side : 0;   // 横回転(y 軸): 下の式で、進む向きに対して +x の方へ曲がる
    const topW = (dr, rpm) => new THREE.Vector3().crossVectors(dr, V(0, 1, 0)).normalize().multiplyScalar(-rpm * Math.PI / 30);   // 正の rpm は逆回転(浮く)
    if (o && o.stop && (type === 'grounder' || type === 'bunt')) {
      // 11/21 止まる所(本塁からの距離)を決めた弱いゴロ: 球場の地面(土・天然芝・人工芝)で転がり方が違うので、速さを道筋で合わせる(8 回)
      let lo = 6, hi = 30; const want = o.stop;
      for (let k = 0; k < 8; k++) { const m = (lo + hi) / 2; const b0 = this.makeBall(type, T, L, p0, { ...o, stop: 0, ev: m, coarseOnly: true }); const P = b0.path, j = (P.n - 1) * 4; if (Math.hypot(P.pts[j], P.pts[j + 2]) < want) lo = m; else hi = m; }
      return this.makeBall(type, T, L, p0, { ...o, stop: 0, ev: (lo + hi) / 2 });
    }
    if (type === 'grounder' || type === 'bunt') {
      const ev = o && o.ev ? o.ev : type === 'bunt' ? 8 + rng() * 3 : this._randEV ? this.evSample(L, true) : 21 + 17 * L + rng() * 4;
      const weak = ev < 22;
      const la = (o && o.la != null ? o.la : type === 'bunt' ? -4 + rng() * 6 : weak ? -1 + rng() * 4 : -2 + rng() * 7) * D2R;   // 弱いゴロは小さく弾む
      v = dir.clone().multiplyScalar(ev * Math.cos(la)); v.y = ev * Math.sin(la);
      w = new THREE.Vector3().crossVectors(V(0, 1, 0), dir).multiplyScalar(-80);
      if (sideW) w.y += sideW;
    } else if (type === 'liner') {
      const ev = o && o.ev ? o.ev : this._randEV ? Math.max(26, this.evSample(L, false)) : 27 + 13 * L + rng() * 3;
      const r = solveThrow(p0, V(T.x, 0, T.z), ev, T.y || 1.3);
      v = r.v; w = V();
      if (o && o.top) w.add(topW(dir, o.top));
      if (sideW) w.y += sideW;
      if (w.lengthSq() > 1) {
        // 回転で浮く・沈む分を入れて、狙いの所を同じ高さで通るように上向きの速さを 3 回合わせる(伸びるライナーは低く出て浮き上がり、沈むライナーは高く出て沈む)
        const flat = { bvh: null, surfaceAt: () => 's', groundY: () => -50 }, want = T.y || 1.3;
        const yAt = (vv) => { const pr = predict(flat, p0, vv, w.clone(), 4, { Cd: 0.35, clScale: 1.0, dt: 1 / 120 }); for (let i = 0; i < pr.n; i++) { const x = pr.pts[i * 4], z = pr.pts[i * 4 + 2]; if (Math.hypot(x - p0.x, z - p0.z) >= d) return [pr.pts[i * 4 + 1], i * pr.dt]; } return [want, 1]; };
        for (let k = 0; k < 3; k++) { const [y, t] = yAt(v); v.y += (want - y) / Math.max(0.2, t); }
      }
    } else {
      const la = (o && o.la != null ? o.la : type === 'pop' ? 62 + rng() * 12 : 26 + rng() * 14) * D2R;
      const rpm = 1800 + rng() * 600;
      const flat = { bvh: null, surfaceAt: () => 's', groundY: () => 0 };
      const co = this._coarse;
      // 横回転のある飛球は、曲がる分だけ狙いを反対へずらして、落ちる所が T になるようにする(2 回合わせる)
      let back, ev = 20;
      for (let pass = 0; pass < (sideW ? 2 : 1); pass++) {
        back = topW(dir, rpm); if (sideW) back.y += sideW;
        let lo = 5, hi = 70;
        for (let i = 0; i < (co ? 11 : 22); i++) {
          const m = (lo + hi) / 2;
          const vv = dir.clone().multiplyScalar(m * Math.cos(la)); vv.y = m * Math.sin(la);
          const pr = predict(flat, p0, vv, back.clone(), 9, { Cd: 0.35, clScale: 1.0, dt: co ? 1 / 40 : 1 / 120 });
          const fh = pr.firstHit ? pr.firstHit.p : pr.end;
          if (Math.hypot(fh.x - p0.x, fh.z - p0.z) < d) lo = m; else hi = m;
        }
        ev = (lo + hi) / 2;
        if (sideW && pass === 0) {
          const vv = dir.clone().multiplyScalar(ev * Math.cos(la)); vv.y = ev * Math.sin(la);
          const pr = predict(flat, p0, vv, back.clone(), 9, { Cd: 0.35, clScale: 1.0, dt: co ? 1 / 40 : 1 / 120 });
          const fh = pr.firstHit ? pr.firstHit.p : pr.end;
          const off = Math.atan2(fh.x - p0.x, -(fh.z - p0.z)) - Math.atan2(T.x - p0.x, -(T.z - p0.z));   // 落ちた所の向き − 狙いの向き
          const a0 = Math.atan2(dir.x, -dir.z) - off;
          dir = V(Math.sin(a0), 0, -Math.cos(a0));
        }
      }
      v = dir.clone().multiplyScalar(ev * Math.cos(la)); v.y = ev * Math.sin(la);
      w = back;
    }
    const high = v.y > 24, co = this._coarse || (o && o.coarseOnly);   // 11/21 高い内野フライ(天ぷら)は落ちるまで 6 秒を超え、跳ねている途中で道筋が終わって宙で止まっていた: 長めに先読みする
    const path = predict(this.world, p0, v, w, co ? (high ? 9 : 6) : (high ? 13 : 9), { Cd: 0.35, clScale: 1.0, dt: co ? 1 / 60 : DT });
    return { path, type, v, w, p0: p0.clone() };
  }
  // 高く跳ねるゴロ(チョッパー): 本塁の前の土にたたきつけて大きく跳ねる。ev 速さ、la 下向きの角度(度)。向きは T
  chopBall(T, ev, la, p0, stop = 0) {
    if (stop) {   // 止まる所(本塁からの距離)を決めた時は速さを道筋で合わせる(球場の地面で転がり方が違う)
      let lo = 10, hi = 40; const sv = this._coarse; this._coarse = true;
      try { for (let k = 0; k < 8; k++) { const m = (lo + hi) / 2, P = this.chopBall(T, m, la, p0).path, j = (P.n - 1) * 4; if (Math.hypot(P.pts[j], P.pts[j + 2]) < stop) lo = m; else hi = m; } } finally { this._coarse = sv; }
      ev = (lo + hi) / 2;
    }
    const dir = V(T.x - p0.x, 0, T.z - p0.z).normalize(), a = -la * D2R;
    const v = dir.clone().multiplyScalar(ev * Math.cos(a)); v.y = ev * Math.sin(a);
    const w = new THREE.Vector3().crossVectors(V(0, 1, 0), dir).multiplyScalar(-80);
    const path = predict(this.world, p0, v, w, this._coarse ? 6 : 9, { Cd: 0.35, clScale: 1.0, dt: this._coarse ? 1 / 60 : DT });
    return { path, type: 'grounder', v, w, p0: p0.clone() };
  }
  ballFor(pos, L, p0, forceType) {
    const rng = this.rng;
    const at = this.homeOf(pos);
    const of = !!POS[pos].of;
    let type = forceType;
    if (!type) { const r = rng(); type = of ? (r < 0.55 ? 'fly' : r < 0.85 ? 'liner' : 'grounder') : (r < 0.62 ? 'grounder' : r < 0.82 ? 'liner' : 'pop'); }
    // 11/21 持ち主「打球の種類バリエーションをもっと大量に各ポジション」: ほかの野手(観戦・中継の場面、投手・捕手も)の打球も、
    // 本物によくある打ち方を混ぜる(4 割ほど。残りは前と同じ作り)。どれも決まっていた野手が捕れる所へ
    // 11/25 捕手の打球はバント・本塁まわりのフライだけ(前の作りのゴロ・バントは本塁の後ろへ飛んでいた。捕手を選べるようにしたので必ずこちら)
    if (pos === 'C' && !this.watching) {
      // バントは打ってすぐ地面に落ちる(下向き 8〜12 度)。前の 2〜6 度だと捕手が宙で捕ってアウトになっていた
      if (type === 'bunt' || type === 'grounder') { const b = this.makeBall('bunt', V((rng() - 0.5) * 3, 0, -2.5 - rng() * 2.5), L, p0, { ev: 5.5 + rng() * 2.5, la: -12 + rng() * 4 }); b.sub = '捕手前のバント'; return b; }
      return this.subBall('C', 'pop', L, p0);
    }
    const sub = rng() < 0.42 ? this.subBall(pos, type, L, p0) : null;
    if (sub) return sub;
    if (type === 'bunt') {
      const T = V(at.x, 0, at.z).normalize().multiplyScalar(9 + rng() * 5);
      return this.makeBall('bunt', T, L, p0);
    }
    if (type === 'fence') {
      // フェンス際の大飛球: フェンスの上 -0.5〜0.8 m(直撃・ぎりぎり越える・もぎ取れる高さ)。センターのバックスクリーンは避ける
      let ang = Math.atan2(at.x, -at.z) / D2R + (rng() * 2 - 1) * 6;
      if (Math.abs(ang) < 10) ang = (ang < 0 ? -1 : 1) * (10 + rng() * 6);
      return this.makeFenceBall(Math.max(-42, Math.min(42, ang)), -0.5 + rng() * 1.3, p0);
    }
    if (type === 'foulfly') {
      // ファウルゾーンの飛球(一塁・三塁の線の外)
      const sgn = at.x < 0 ? -1 : 1, a = (50 + rng() * 6) * D2R, d = 20 + rng() * 8;
      return this.makeBall('pop', V(sgn * d * Math.sin(a), 0, -d * Math.cos(a)), L, p0);
    }
    const fromHome = V(at.x, 0, at.z).normalize();
    const side = V(-fromHome.z, 0, fromHome.x);
    let lat, dep;
    if (of) { lat = (rng() * 2 - 1) * (3 + 16 * L); dep = (rng() * 2 - 1) * (3 + 13 * L); }
    else if (type === 'pop') { lat = (rng() * 2 - 1) * (2 + 6 * L); dep = (rng() * 2 - 1) * (3 + 6 * L); }
    else { lat = (rng() * 2 - 1) * (0.6 + 5.2 * L); dep = 0; }
    const T = at.clone().setY(0).addScaledVector(side, lat).addScaledVector(fromHome, dep);
    if (type === 'grounder' && !of) T.addScaledVector(fromHome, 6);
    if (type === 'grounder' && of) T.addScaledVector(fromHome, -8);
    if (type === 'liner' && !of) T.y = 0.8 + rng() * 1.2;
    T.x = THREE.MathUtils.clamp(T.x, -110, 110);
    if (type === 'grounder' && !of && this.kind === 'game' && rng() < 0.06 && this.oldHop()) return this.badHop(T)(p0);   // 11/26 イレギュラーは無くした(持ち主「理不尽なイレギュラーがあるのでこれは無くして」。?badhop=1 で前の形。rng は前と同じ数だけ引く)
    return this.makeBall(type, T, L, p0);
  }
  // ほかの野手の打球の打ち方(ballFor から)。打者の左右で引っぱる向き・切れる向きを変える。返す球には sub(名前)を付ける
  subBall(pos, type, L, p0) {
    const rng = this.rng, at = this.homeOf(pos).setY(0), of = !!POS[pos].of, g = this.g;
    const pull = g && g.hand === 'L' ? 1 : -1;   // 引っぱる向き(x の符号)
    const out = V(at.x, 0, at.z).normalize(), side = V(-out.z, 0, out.x);
    const T = (lat, front, y = 0) => { const t = at.clone().addScaledVector(side, lat).addScaledVector(out, -front); t.y = y; t.x = THREE.MathUtils.clamp(t.x, -110, 110); return t; };
    const s = (b, name) => { b.sub = name; return b; };
    const pick = (a) => a[Math.floor(rng() * a.length)];
    if (pos === 'P') {
      if (type === 'grounder') return pick([
        () => s(this.makeBall('grounder', V((rng() - 0.5) * 1.2, 0, at.z - 4), L, p0, { ev: 30 + rng() * 8, la: -3 + rng() * 3 }), 'ピッチャー返し'),
        () => s(this.makeBall('bunt', V((rng() - 0.5) * 3, 0, -12 - rng() * 3), L, p0, { ev: 12 + rng() * 3 }), '投手前の弱いゴロ'),
        () => s(this.chopBall(V((rng() - 0.5) * 2, 0, -20), 22 + rng() * 5, 28 + rng() * 8, p0), '投手の前で高く跳ねるゴロ'),
      ])();
      if (type === 'liner') return s(this.makeBall('liner', V((rng() - 0.5) * 1.4, 1.1 + rng() * 0.8, at.z), L, p0, { ev: 36 + rng() * 6 }), 'ピッチャー返しのライナー');
      if (type === 'pop') return s(this.makeBall('pop', V((rng() - 0.5) * 6, 0, at.z - 2 + rng() * 5), L, p0, { la: 66 + rng() * 12 }), 'マウンドの小フライ');
      if (type === 'bunt') return s(this.makeBall('bunt', V(pull * -(1 + rng() * 3), 0, -8 - rng() * 4), L, p0, { ev: 9 + rng() * 3 }), rng() < 0.5 ? '投手前のバント' : '強めのバント');
      return null;
    }
    if (pos === 'C') {
      if (type === 'bunt') return s(this.makeBall('bunt', V((rng() - 0.5) * 3, 0, -2.5 - rng() * 2.5), L, p0, { ev: 5 + rng() * 2.5, la: -6 + rng() * 4 }), '捕手前のバント');
      if (type === 'pop' || type === 'foulfly') {
        const sg = rng() < 0.5 ? -1 : 1, a = (62 + rng() * 48) * D2R, d = 6 + rng() * 9;   // 90 度より大きいと本塁の後ろ(バックネットの前)
        return s(this.makeBall('pop', V(sg * d * Math.sin(a), 0, -d * Math.cos(a)), L, p0, { la: 72 + rng() * 10 }), Math.cos(a) < 0 ? 'バックネット前のファウルフライ' : sg < 0 ? '三塁側のファウルフライ' : '一塁側のファウルフライ');
      }
      return null;
    }
    if (!of) {
      if (type === 'grounder') return pick([
        () => s(this.chopBall(T((rng() - 0.5) * 2, 3), 24 + rng() * 6, 24 + rng() * 8, p0), '高く跳ねるゴロ'),
        () => s(this.makeBall('bunt', T((rng() - 0.5) * 2, 9 + rng() * 3), L, p0, { ev: 13 + rng() * 3 }), 'ボテボテのゴロ'),
        () => s(this.makeBall('grounder', T((rng() - 0.5) * 1.5, -5), L, p0, { ev: 36 + rng() * 6 }), '強いゴロ'),
        () => s(this.makeBall('grounder', T(pull * (1 + rng() * 2), -6), L, p0), '引っぱったゴロ'),
        () => s(this.makeBall('grounder', T(-pull * (1 + rng() * 2), -6), L, p0, { side: -pull * (25 + rng() * 20) }), '流し打ちのゴロ'),
      ])();
      if (type === 'liner') return s(this.makeBall('liner', T((rng() - 0.5) * 2, 0, 1.2 + rng() * 0.9), L, p0, { ev: 34 + rng() * 8, top: -(600 + rng() * 600) }), '沈むライナー');
      if (type === 'pop') return pick([
        () => s(this.makeBall('pop', T((rng() - 0.5) * 5, -(2 + rng() * 4)), L, p0, { la: 74 + rng() * 8 }), '高い内野フライ'),
        () => s(this.makeBall('pop', T((rng() - 0.5) * 4, -(5 + rng() * 3)), L, p0, { la: 52 + rng() * 8 }), '後ろへのポップ'),
      ])();
      if (type === 'bunt') { const d = 8 + rng() * 5; return s(this.makeBall('bunt', V(at.x, 0, at.z).normalize().multiplyScalar(d), L, p0, { ev: 9 + rng() * 2.5 }), pos === '3B' ? '三塁線へのバント' : pos === '1B' ? '一塁線へのバント' : 'バント'); }
      return null;
    }
    // 外野
    const line = pos === 'LF' ? -1 : pos === 'RF' ? 1 : pull;   // 切れていく向き(左翼は三塁線へ、右翼は一塁線へ、中堅は打者で)
    if (type === 'fly') return pick([
      () => s(this.makeBall('fly', T((rng() - 0.5) * 8, (rng() - 0.5) * 8), L, p0, { side: line * (90 + rng() * 60) }), '線の方へ切れていくフライ'),
      () => s(this.makeBall('fly', T((rng() - 0.5) * 6, (rng() - 0.5) * 6), L, p0, { la: 46 + rng() * 10 }), '高く上がったフライ'),
      () => s(this.makeBall('fly', T((rng() - 0.5) * 6, -(5 + rng() * 6)), L, p0, { la: 24 + rng() * 6 }), '頭の上を越えそうなフライ'),
    ])();
    if (type === 'liner') return pick([
      () => s(this.makeBall('liner', T((rng() - 0.5) * 6, 2 + rng() * 4, 1.0 + rng()), L, p0, { top: 1200 + rng() * 600 }), '伸びるライナー'),
      () => s(this.makeBall('liner', T((rng() - 0.5) * 6, 2 + rng() * 3, 1.0 + rng() * 0.6), L, p0, { top: -(800 + rng() * 600) }), '沈むライナー'),
    ])();
    if (type === 'grounder') return s(this.makeBall('grounder', T((rng() - 0.5) * 8, -10), L, p0, { la: 6 + rng() * 6 }), 'ワンバウンドで外野へ');
    return null;
  }

  // ------------------------------------------------------------ 1 つの場面(プレー)
  startPlay(opt) {
    const c = this.ctx;
    c.setCamOverride(false);
    this.applyAlignment();
    this.snapHome();
    if (this.placeUmps) this.placeUmps();
    this.placeMe();
    this.autoRun = null;
    this.ballView.show(false); this.ring.visible = false;
    const p0 = opt.by === 'knock' ? V(-1.1, 1.05, -1.3) : V(-0.25, 0.95, -0.55);
    const pl = {
      opt, t: 0, phase: 'pre', ball: null, holder: null, thrown: null, events: [], result: null, endT: null,
      p0, contactT: (opt.by === 'knock' ? 0.75 : 1.05) + (opt.sitT || 0), choice: null, caughtAt: null, fieldedBy: null, fly: false,
      coverSpot: opt.coverSpot || null, covered: false, outs: 0, said: {},
    };
    this.play = pl;
    this.meAct = null; this.prep = null;
    this._randEV = !!opt.randEV;   // 試合・ノックの打球だけ速さを散らばらせる(試験で直接作る打球は決まった速さ)
    pl.batted = opt.make ? opt.make(p0) : opt.type && FOUL_TYPES.includes(opt.type) ? this.makeFoulCatchable(opt.type, p0) : this.ballFor(opt.fielder, opt.L, p0, opt.type);
    this._randEV = false;
    pl.star = opt.star || 0; pl.kb = opt.kb || ''; pl.kind = opt.kind || null;
    pl.fly = pl.batted.type === 'fly' || pl.batted.type === 'pop' || pl.batted.type === 'liner';
    pl.foul = opt.type === 'foulfly';
    pl.isBunt = pl.batted.type === 'bunt';
    for (const r of this.runners) { r.run = false; r.done = true; r.forced = false; r.half = false; r.returning = false; r.tagLock = null; }
    if (this.g) {
      const f = this.runnerFigs[0];
      f.root.visible = false;
      if (f.setNumber) f.setNumber(String(this.batterNum()));
      this.batterRunner = { num: this.batterNum(), fig: f, base: 0, from: 0, to: 1, dist: 0, run: false, done: false, out: false, scored: false, forced: true, isBatter: true };
      for (const r of this.runners) r.forced = R.isForced(this.g.bases, r.base);
      pl.iff = !pl.foul && R.infieldFly(this.g, pl.batted.type, opt.fielder);
      if (this.kind === 'game') {
        if (this.g.bases.some(Boolean) && this.rng() < 0.6) this.say('pitch_set', { maxWait: 0.6 });
        this.ctx.sound.crowdEvent('prepitch');
        this.crowdPressure();
      }
    } else this.batterRunner = null;
    // 11/20 持ち主「ぼてぼてのゴロになった際に投手が取りにいかずに転がり続ける」: 内野の前で止まる弱いゴロ・バントは、
    // 一番早く届く人(投手・捕手・一塁手・三塁手と、決まっていた人)が捕りに行く(ほかの人は決まりどおりベースカバーへ)。自分の打球は変えない
    if (opt.fielder !== this.my && !opt.plan && this.kind === 'game' && (pl.batted.type === 'grounder' || pl.batted.type === 'bunt')) {
      const k2 = this.weakFielder(pl.batted.path, opt.fielder);
      if (k2 && k2 !== opt.fielder) { pl.weakFrom = opt.fielder; opt.fielder = k2; }
    }
    this.assignCovers(opt);
    this.updatePad();
  }
  // 弱いゴロ(本塁から 30 m より手前で止まる・止まりかける球)を一番早く捕れる人。弱くなければ null
  weakFielder(path, cur) {
    const e = path.pts, n = path.n, ex = e[(n - 1) * 4], ez = e[(n - 1) * 4 + 2];
    if (Math.hypot(ex, ez) > 30) return null;
    let best = null, bt = 1e9;
    for (const k of [cur, 'P', 'C', '1B', '3B', '2B', 'SS']) {
      if (!k || k === this.my || !POS[k] || POS[k].of || !this.fig[k] || !this.fig[k].root.visible) continue;
      const t = this.reachT(path, this.homeOf(k), VMAX[k] || AI_SPEED) + (k === cur ? -0.2 : 0);   // 決まっていた人を少し優先(同じくらいなら変えない)
      if (t < bt) { bt = t; best = k; }
    }
    return best;
  }
  // from から走って球(打ってからの道筋)に触れる一番早い時刻(秒)
  reachT(path, from, vmax, t0 = 0) {
    for (let tt = t0; tt < pathDuration(path); tt += 0.05) {
      const q = samplePath(path, tt, V()); if (q.y > 2.0) continue;
      if (REACT + this.runTime(Math.max(0, Math.hypot(q.x - from.x, q.z - from.z) - 0.6), vmax) <= tt) return tt;
    }
    const q = samplePath(path, pathDuration(path), V());
    return pathDuration(path) + REACT + this.runTime(Math.hypot(q.x - from.x, q.z - from.z), vmax);
  }
  // ほかの野手の動き: 守備の約束(rules.coverPlan)どおりに、誰がどこへ入るか
  assignCovers(opt) {
    const my = this.my, f = this.fig, fielder = opt.fielder;
    for (const k of Object.keys(POS)) { f[k].target = null; f[k].role = null; f[k].cutTo = null; f[k].cutGo = false; f[k].rdOut = false; }
    const cov = { 0: 'C', 1: '1B', 2: 'SS', 3: '3B' };
    this.cutoffK = null;
    const g = this.g;
    const plan = opt.plan || R.coverPlan({ type: opt.planType || this.play.batted.type, zone: fielder, bases: g.bases, outs: g.outs, hand: g.hand, hit: !!opt.hit });
    this.plan = plan;
    for (const [k, role] of Object.entries(plan)) {
      if (role.role === 'base' && cov._set?.[role.base] !== true) { cov[role.base] = k; (cov._set = cov._set || {})[role.base] = true; }
      if (role.role === 'cut' && !this.cutoffK) this.cutoffK = k;
    }
    delete cov._set;
    this.cover = cov;
    // 9 人の割り当ては brain.js の defenseAssign(docs/判断の組み込み手順.md の 4)。使えない時は前の rules.coverPlan
    let A = null;
    try {
      const path = this.play && this.play.batted && this.play.batted.path;
      let land = null;
      if (path) { for (let i = 1; i < path.n; i++) { if (path.pts[i * 4 + 1] < 0.3 && path.pts[i * 4 + 1] < path.pts[i * 4 - 3]) { land = [path.pts[i * 4], path.pts[i * 4 + 2]]; break; } } if (!land) { const j = (path.n - 1) * 4; land = [path.pts[j], path.pts[j + 2]]; } }
      let gap = null;
      if (land && POS[fielder] && POS[fielder].of && opt.hit) {
        const h = this.homeOf(fielder), deep = Math.hypot(land[0], land[1]) > Math.hypot(h.x, h.z) + 6;
        if (deep) { const ang = Math.atan2(land[0], -land[1]) * 180 / Math.PI; gap = ang < -36 ? 'LL' : ang < -8 ? 'LC' : ang > 36 ? 'RL' : ang > 8 ? 'RC' : (land[0] < 0 ? 'LC' : 'RC'); }
      }
      this.bplanGap = gap; this.bplanZone = fielder;
      if (!opt.plan) A = BR.defenseAssign({ type: opt.planType || this.play.batted.type, zone: fielder, hit: !!opt.hit, gap, bases: g.bases, outs: g.outs, hand: g.hand, ballPos: land });
    } catch (e) { A = null; }
    this.bplan = A;
    if (A) {
      const cov2 = { 0: 'C', 1: '1B', 2: 'SS', 3: '3B' }, seen = {};
      this.cutoffK = null;
      for (const [k, a] of Object.entries(A)) {
        if (a.role === 'base' && a.base != null && !seen[a.base]) { cov2[a.base] = k; seen[a.base] = 1; }
        if (a.role === 'cut' && !this.cutoffK) this.cutoffK = k;
      }
      this.cover = cov2;
      for (const [k, a] of Object.entries(A)) {
        if (k === my || k === fielder || !f[k] || !a.to) continue;
        f[k].role = a.role === 'base' ? 'base' + a.base : a.role;
        if (a.role !== 'cut' && a.role !== 'trail') f[k].target = V(a.to[0], 0, a.to[1]);   // 中継・トレイルは打球が外野へ抜けてから動かす
        else f[k].cutTo = V(a.to[0], 0, a.to[1]);
      }
    } else {
      for (const [k, role] of Object.entries(plan)) {
        if (k === my || k === fielder || !f[k]) continue;
        const s = R.roleSpot(role, k, fielder);
        if (s && role.role !== 'cut') { f[k].role = role.role + (role.base ?? ''); f[k].target = V(s[0], 0, s[1]); }
        if (role.role === 'cut') f[k].role = 'cut';   // 中継は打球が外野へ抜けてから(live で動かす)
      }
    }
    if (fielder !== my) f[fielder].role = 'field';
    // 11/20 持ち主「ピッチャーが投げた後毎回一塁側に走って不自然」: 投手が一塁(と一塁の後ろ)へ走るのは、一塁側のゴロ(一塁手が打球へ行く・一二塁間)の時だけ。
    // ほかの打球で一塁の方へ割り当てられていたら、マウンドの前に残る(本塁・三塁の後ろ・中継の後ろなどは今のまま)
    const FP = f.P;
    if (FP && my !== 'P' && fielder !== 'P' && FP.target && Math.hypot(FP.target.x - BASEP[1].x, FP.target.z - BASEP[1].z) < 16) {
      const bt = this.play && this.play.batted, ground = bt && (bt.type === 'grounder' || bt.type === 'bunt');
      const right = fielder === '1B' || (fielder === '2B' && bt && bt.v && Math.atan2(bt.v.x, -bt.v.z) * 180 / Math.PI > 22);
      if (!(ground && right)) {
        FP.target = V(0, 0, -15.5); FP.role = 'hold';
        if (this.cover && this.cover[1] === 'P') this.cover[1] = '1B';
      }
    }
    // 11/21 内野ゴロ・バントで一塁に入る人は、ベースの中心(体がベースの上に重なる)でなく、捕る人の方を向いて右足でベースを踏む所へ
    const bt1 = this.play && this.play.batted;
    if (bt1 && (bt1.type === 'grounder' || bt1.type === 'bunt') && POS[fielder] && !POS[fielder].of) {
      for (const k of Object.keys(POS)) {
        if (k === my || k === fielder || !f[k] || f[k].role !== 'base1' || !f[k].target) continue;
        if (Math.hypot(f[k].target.x - BASEP[1].x, f[k].target.z - BASEP[1].z) > 1.0) continue;
        f[k].target = this.firstSpot(this.homeOf(fielder)).p;
      }
    }
  }

  runnerPos(r) {
    const a = BASEP[r.from], b = BASEP[(r.from + 1) % 4];
    const u = Math.min(1, Math.max(0, r.dist) / 27.43);
    const p = a.clone().lerp(b, u);
    // 打者走者は打席(本塁の横 0.85 m)から走り出し、4 m で走路の線に乗る(本塁の上を通らない)
    if (r.isBatter && r.from === 0 && this.g) { const k = Math.max(0, 1 - r.dist / 4); p.x += (this.g.hand === 'L' ? 0.85 : -0.85) * k; }
    // 11/21 打者走者は一塁の手前 15 m からファウル側(走路の線の外、0.3 m)を走り、ベースのファウル側を踏む(一塁で受ける人は内野側)。一塁を回ったら 3 m で線へ戻る
    if (r.isBatter && this.g) { const k = r.from === 0 ? Math.min(1, Math.max(0, (r.dist - 12) / 8)) : r.from === 1 ? Math.max(0, 1 - r.dist / 3) : 0; if (k > 0) { p.x += FOUL1.x * 0.3 * k; p.z += FOUL1.z * 0.3 * k; } }
    if (r.off && !r.isBatter) {
      // リードの所は線の外。走り出したら 8 m で線の上へ戻る・塁へ戻る時も塁に近づくほど線へ
      const k = Math.max(0, 1 - Math.max(0, r.dist - (r.lead0 || 0) - 2) / 8) * Math.min(1, r.dist / 2);
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2 + 19.4, ml = Math.hypot(mx, mz) || 1;
      p.x += mx / ml * r.off * k; p.z += mz / ml * r.off * k;
    }
    return p;
  }
  runnerETA(r, base) {
    let d = 27.43 - r.dist, b = (r.from + 1) % 4;
    if (!r.run && r.done) return Infinity;
    if (r.returning) return Infinity;
    while (b !== base) { d += 27.43; b = (b + 1) % 4; if (d > 120) return Infinity; }
    return d / (r.isBatter ? BATTER_SPEED : RUN_SPEED);
  }
  // いまフォースか: 後ろの走者(打者を含む)がアウトになると、前の走者のフォースは外れる
  forcedNow(r) {
    // フォースは「次の塁まで」だけ。その塁に着いた(越えた)走者は、もうフォースではない(規則 5.09(b)(6))
    if (r.isBatter) return r.from < 1;
    if (!r.forced) return false;
    if (r.from > r.base) return false;
    if (this.batterRunner && this.batterRunner.out) return false;
    for (const q of this.runners) if (q !== r && q.forced && q.base < r.base && q.out) return false;
    return true;
  }

  // ------------------------------------------------------------ 毎フレーム
  update(dt) {
    if (this.catchFx && this.catchFx.t < 1) this.catchFx.t += dt;   // 11/22 夜 捕った手ごたえの時計(main.js の updateCatchFx が見る)
    if (!this.active) return;
    this.guide.tick(dt);   // ガイドの印と言葉・練習の進み(1 こま前の状態で十分)
    if (!this.active) return;
    this.t += dt;
    this.animateUmps(dt);
    if (this.pend && this.pend.length) { const due = this.pend.filter((x) => this.t >= x.at); this.pend = this.pend.filter((x) => this.t < x.at); for (const x of due) x.fn(); }
    if (this.dg) { this.updateDigest(dt); this.animateFigures(dt); this.updateSkip(); return; }
    if (this.play && this.play.phase === 'live') this.updatePad();   // フライが上がった・落ちたでオーライのボタンを出し入れ(変わった時だけ画面を触る)
    this.assist(dt);
    if (!this.play) {
      this.wait -= dt;
      if (this.wait <= 0 && (this.allHome() || this.wait < -0.3)) this.next();
      this.animateFigures(dt);
      this.updateHUD(); this.updateSkip();
      return;
    }
    const pl = this.play;
    pl.t += dt;
    cmTick(this, pl);   // 実況: 投げる前・打球を追う間のつなぎ(commentary.js。自分の場面だけ・間があいた時だけ)
    if (pl.timers) {
      const due = pl.timers.filter((x) => pl.t >= x.at);
      pl.timers = pl.timers.filter((x) => pl.t < x.at);
      for (const x of due) x.fn();
      if (this.play !== pl) return;
    }
    if (pl.phase === 'pre') {
      this.preContact(pl, dt);
      if (pl.t >= pl.contactT) this.contact(pl);
    } else if (pl.phase !== 'steal') this.live(pl, dt);
    else this.live(pl, dt);
    if (pl.autoSkipFoul && this.play === pl && pl.endT == null && !this.ffw && pl.t > pl.contactT + 0.6) { pl.autoSkipFoul = false; this.fastForward(pl); }
    // 打った後も、打者が走者に替わるまで(当たって 0.55 秒)スイングの振り終わりを進める
    if (this.kind === 'game' && pl.phase !== 'pre' && pl.swingCourse != null && pl.t < pl.contactT + 0.55) {
      const ce = swingContact(pl.swingCourse) ?? 0.72;   // 動きごとの「当たる」時刻(Mixamo の打撃は動きごとに違う、2026-11-19)
      this.batter.set('swing', { t: pl.t - (pl.contactT - ce), course: pl.swingCourse, lh: this.g && this.g.hand === 'L' });
    }
    this.updateAct(dt);
    this.updatePreps();
    if (pl.holder === 'me' && !pl.choiceOpen && pl.choiceAt != null && pl.t >= pl.choiceAt && !pl.endT) { pl.choiceAt = null; this.offerChoice(pl); }
    this.updatePad();
    this.animateFigures(dt);
    this.updateGlow();
    this.updateHUD(); this.updateSkip();
  }
  later(sec, fn) { const pl = this.play; if (!pl) return; (pl.timers = pl.timers || []).push({ at: pl.t + sec, fn }); }
  contact(pl) {
    const g = this.g;
    pl.phase = 'live';
    if (pl.opt.fielder === this.my && (this.kind === 'game' || this.kind === 'knock') && !this.watching && !this.ffw) {
      const used = +this.ctx.load('r4walk.catchHelp', 0) || 0;
      pl.helpK = HELP_K[used] || 0;
      if (used < HELP_K.length && !this.tut) this.ctx.store('r4walk.catchHelp', used + 1);   // 練習の打球は数えない
    }
    // 11/20 打球の種類を小さな帯で知らせる(試合とノックの自分の打球。簡単な物は出さない)
    // 11/20 夜 持ち主「試合中に前へとか背走みたいなよくわからないの要らない」: 出さない(戻す時は ?kindpop=1)
    if (pl.kind && !['easy', 'step', 'foul'].includes(pl.kind) && this.ctx.ui && this.ctx.ui.evalPop && !this.watching && /[?&]kindpop=1/.test(location.search)) {
      const K = { run: '全力で!', charge: '前へ突っ込め!', hop: 'バウンドに注意', hard: '強い当たり', back: '背走!', dive: '飛び込め!', jump: '跳べ!', through: '抜けるか!' };
      if (K[pl.kind]) this.ctx.ui.evalPop(K[pl.kind], pl.kind === 'dive' || pl.kind === 'jump' ? 'fine' : 'ok');
    }
    this.launch(pl.batted.path, pl.t);
    const ty = pl.batted.type;
    this.ctx.sound.hit(ty === 'grounder' ? 'grounder' : ty === 'bunt' ? 'jam' : ty === 'pop' ? 'jam' : ty === 'liner' || ty === 'fly' ? 'barrel' : 'solid', 0.75);
    if (this.kind === 'game') {
      const hard = ty === 'liner' || ty === 'fly' ? 0.85 : ty === 'grounder' ? 0.55 : 0.3;
      this.ctx.sound.crowdEvent('contact', hard);
      if (ty === 'fly' || (ty === 'pop' && !pl.iff)) this.ctx.sound.crowdEvent('flyup');
    }
    if (this.batterRunner) { this.batterRunner.run = true; this.batterRunner.done = false; this.batterRunner.startAt = pl.t + 0.55; }   // 振り終わり(当たってから 0.35 秒、バットを肩に巻き付けた形)まで打者のまま
    if (g) {
      const twoOut = g.outs === 2;
      if (pl.iff) {
        // インフィールドフライ: 打者は捕る前からアウト。走者はフォースでなくなる(進むのは自分の責任)
        this.batterRunner.out = true; this.batterRunner.run = false; this.batterRunner.done = true; this.batterRunner.flyOut = true; pl.outs++;
        for (const r of this.runners) r.forced = false;
        // 11/27 持ち主「インフィールドフライで走者が飛び出すことがある」: 走者は捕るか落ちるかまで塁に戻って構える(前はリードのまま止まり、一死では
        // 打者アウトで「2 アウト」と見て打った瞬間に走り出していた)。?oldiff=1 で前の形
        if (!OLDIFF) for (const r of this.runners) { if (r.out) continue; this.runDecide(pl, r, false, r.base, 'インフィールドフライ: 塁に戻る', 0); r.half = false; if (r.dist > 0.3) { r.returning = true; r.done = false; } }
        const apex = Math.max(0.6, pl.batted.v.y / 9.8 * 0.9);
        this.later(apex, () => { this.hush('インフィールドフライ', '打者アウト', { ms: 1300 }); if (this.kind === 'game') { this.umpCall('out', 0); this.say('infield_fly', { cut: true }); } });
      } else {
        // 打った瞬間の走者の判断は brain.js(docs/判断の組み込み手順.md の 1)
        const late = g.inning >= 7 && Math.abs(g.score.us - g.score.them) <= 1;
        const lp = this.landPoint(pl);
        const dec = BR.runnersAtContact({
          outs: g.outs, bases: g.bases, infieldIn: !!(this.align && this.align.tags && this.align.tags.includes('前進守備')), late,
          batted: { type: ty, zone: pl.opt.fielder, land: [lp.x, lp.z], foul: pl.foul }, arm: BLV.arm[pl.opt.fielder] || BLV.arm.IF, runners: { 1: {}, 2: {}, 3: {} },
        }, BLV);
        for (const r of this.runners) {
          const d = dec[r.base]; if (!d) continue;
          if (d.act === 'go') this.runDecide(pl, r, true, d.to, d.why, twoOut ? 0.05 : 0.1);
          else if (d.act === 'half') { r.half = true; r.halfDist = d.halfDist; r.run = true; r.done = false; r.startAt = pl.t + 0.15; r.to = r.base + 1; r.why = d.why; this.logRun(pl, r, 'ハーフウェイ', d.why); }
          else if (d.act === 'freeze') { r.run = false; r.done = true; r.frozen = true; this.logRun(pl, r, '止まる', d.why); }
          else {
            this.runDecide(pl, r, false, r.base, d.why, 0);
            if ((d.act === 'back' || d.act === 'tagup') && r.dist > 0.3) { r.returning = true; r.done = false; }   // 塁に戻って構える
          }
        }
      }
      if (POS[pl.opt.fielder].of && ty === 'grounder' && !pl.foul) pl.ofHit = true;
      // 自分の所へのゴロがはっきりファウルになるなら、捕りに行かせずに飛ばす(本物の三塁手もファウルのゴロは追わない)。際どい物・ファウルフライは操作できるまま
      if (this.kind === 'game' && !pl.fly && ty !== 'foulfly' && pl.opt.fielder === this.my && this.predictFoulGround(pl) === 'foul') pl.autoSkipFoul = true;   // 外野へのゴロは安打: 走者は進む
      // 外野の安打の走者は毎こまの brain.js(runnersTick)が決める(前の ofHitRunners は使わない)
    }
    if (this.kind === 'game') {
      // 実況: 打った → 打球の行方
      const z = pl.opt.fielder;
      const dirKey = ty === 'grounder' ? ({ '3B': 'grounder_third', SS: 'grounder_left', '2B': 'grounder_middle', '1B': 'grounder_right', P: 'grounder_middle' }[z])
        : ty === 'fly' ? ({ LF: 'fly_left', CF: 'fly_center', RF: 'fly_right' }[z] || 'pop')
          : ty === 'pop' ? 'pop' : ty === 'liner' ? 'liner' : ty === 'bunt' ? 'bunt' : null;
      const pull = (g.hand === 'R' && POS[z].side < 0) || (g.hand === 'L' && POS[z].side > 0);
      this.say([ty === 'bunt' ? null : (POS[z].of && this.rng() < 0.3 ? (pull ? 'pulled' : 'opposite') : 'hit'), dirKey], { cut: true, delay: 0.09 });   // 打球音の 0.09 秒後に入る
      if (ty === 'fly' && POS[z].of) this.later(1.4, () => { if (this.ball && !pl.thrown) this.say('back_back', { maxWait: 0.8 }); });
    }
    this.planChase(pl);
    this.flyOwner(pl);
    if (pl.opt.onContact) pl.opt.onContact(pl);
  }
  // 11/26 持ち主「外野フライでまだ外野のチャージ甘くて取れなかったり」: 宙の打球(フライ・ライナー・ポップ)は、打った瞬間に、
  // 落ちる前に走って届く人(外野手を優先。内野と外野の間のポップは前へ突っ込む外野手か、背走する内野手)が捕りに行く。
  // 前は決まっていた人(内野手)だけが追い、球が本塁から 38 m を越えた所で外野手へ替えていたので、浅いフライが間に落ちていた
  airMargin(path, from, vmax, react = REACT, rk = 0.8) {
    const ev = path.events.find((e) => e.type === 'bounce' || e.type === 'roll' || e.type === 'wall' || e.type === 'stop');
    const tEnd = ev ? ev.t : pathDuration(path);
    let best = null;
    for (let tt = 0.2; tt <= tEnd; tt += 0.05) {
      const q = samplePath(path, tt, V()); if (q.y > 2.4) continue;
      const m = tt - (react + this.runTime(Math.max(0, Math.hypot(q.x - from.x, q.z - from.z) - (this.D.ai || 1.8) * rk), vmax));
      if (best == null || m > best.m) best = { m, pt: V(q.x, 0, q.z), tt };
    }
    return best;
  }
  // 11/26 安打と決まっている外野の打球(観戦・中継の場面の ofHit。外野手は直接は捕らない)を、普通の野手が落ちる前に走って届かない所へ落とす。
  // 前は外野手の 0.5〜1.9 秒手前に落ちる球が多く、外野手が前へ出ずにワンバウンドを待つので「チャージが甘い」に見えていた。make を何度か作り直して選ぶ
  hitSafe(make, n = 20) {
    if (COVFIX_OFF) return make();
    let best = null, bm = 1e9;
    for (let i = 0; i < n; i++) {
      const b = make(); let m = -9;
      for (const k of Object.keys(POS)) {
        if (k === this.my || k === 'C' || !this.fig[k]) continue;
        const r = this.airMargin(b.path, this.fig[k].root.position, VMAX[k] || AI_SPEED, REACT, 1.0); if (r && r.m > m) m = r.m;
      }
      if (m < -0.1) return b;
      if (m < bm) { bm = m; best = b; }
    }
    return best;
  }
  flyOwner(pl) {
    if (COVFIX_OFF || !this.ball || !pl.fly || pl.foul || pl.iff && false) return;
    const fk = pl.opt.fielder;
    if (fk === this.my || !this.fig[fk] || this.fig[fk].noCatchUntil) return;
    const path = this.ball.path, cand = [];
    for (const k of Object.keys(POS)) {
      if (k === this.my || !this.fig[k] || !this.fig[k].root.visible || (k === 'C' && !this.watching && this.my !== 'C')) continue;
      const b = this.airMargin(path, this.fig[k].root.position, VMAX[k] || AI_SPEED); if (b) cand.push({ k, ...b });
    }
    const me = this.airMargin(path, this.ctx.player.pos, this.fullSpeed ? this.fullSpeed() : 8);
    const cur = cand.find((c) => c.k === fk);
    const ok = cand.filter((c) => c.m >= 0);
    if (!ok.length) return;
    if (cur && cur.m >= 0) pl.flyK = fk;   // 決まっていた人が届く: その人が最後まで追う(38 m を越えても外野手へ替えない)
    // 外野手が届くなら外野手(前へ突っ込む方が捕りやすい)。同じ組では早く着く人
    ok.sort((a, b) => ((POS[b.k].of ? 0.6 : 0) + b.m) - ((POS[a.k].of ? 0.6 : 0) + a.m));
    const best = ok[0];
    if (me && me.m >= 0.3 && !(cur && cur.m >= 0)) return;   // 自分が楽に届く球は自分に任せる(自動の人は横から取らない)
    if (best.k === fk || (cur && cur.m >= 0 && POS[fk].of === POS[best.k].of)) return;
    if (cur && cur.m >= 0 && !POS[fk].of && POS[best.k].of && best.m < 0.4) return;   // 外野手がぎりぎりなら、届く内野手のまま
    const F = this.fig[best.k];
    F.role = 'field'; F.noCatchUntil = 0;
    F.chase = { pt: best.pt, at: pl.t + REACT, path }; F.target = null;
    pl.looseK = best.k; pl.looseNext = pl.t + REACT; pl.flyK = best.k;
    const F0 = this.fig[fk]; F0.chase = null; F0.target = F0.role === 'cut' ? null : this.homeOf(fk); if (F0.role === 'field') F0.role = null;
    pl.opt.fielder0 = fk;
  }
  // 捕りに行く野手: 打った瞬間に、落ちる所・通り道の「間に合う一番早い点」を決めて、そこへまっすぐ
  planChase(pl) {
    const fk = pl.opt.fielder;
    if (!this.ball || fk === this.my || !this.fig[fk]) return;
    const F = this.fig[fk];
    F.chase = { pt: this.interceptFor(F.root.position, this.ball, pl.t, VMAX[fk] || AI_SPEED, this.minCatchT(F)), at: pl.t + REACT, path: this.ball.path };
  }
  // 安打の打球を外野手が拾う時は、1 度跳ねた後で(直接は捕らない)
  minCatchT(F) {
    if (!F.noCatchUntil || !this.ball) return 0;
    const e = this.ball.path.events.find((x) => x.type === 'bounce' || x.type === 'roll');
    return e ? e.t + 0.3 : 0;
  }
  preContact(pl, dt) {
    const u = pl.t / pl.contactT;
    if (this.kind === 'game') {
      const P = this.fig.P;
      const tr = pl.contactT - 0.45;
      // セットポジションの投球: 動きの「放す」(1.17 秒)が球の出る時刻に合うように
      P.setYawToward(0, 0); P.set('pitch', { t: (motionEvent('pitch_set', 'release') ?? 1.17) + (pl.t - tr) });
      if (this.my === 'P' && !this.watching && pl.t > tr - 0.2 && !pl.pThrow) { pl.pThrow = true; this.meAnim = { kind: 'throw', t: 0.35, dur: 0.35 }; }   // 11/25 自分が投手: 投げる動きは自動(一人称の腕が振れる)
      if (pl.t > tr) {
        const k = Math.min(1, (pl.t - tr) / 0.45);
        this.ballView.show(true);
        this.ballView.update(V(-0.18 * (1 - k), 1.81 - 0.91 * k + Math.sin(k * Math.PI) * 0.15, -17.46 + 16.91 * k), dt, this.ctx.camera, 0.02, 0.2);   // 球の出る所 = 投球(Mixamo、移し替えなしの体)の放す時の右手(-0.18, 1.81, -17.46)、11/19 夜に測り直し(前の体は -0.37, 1.80, -17.55)
      }
      // スイング: 動きの「当たる」(0.6 秒)が打つ時刻に合うように 0.6 秒前から
      const lh = this.g && this.g.hand === 'L';
      if (pl.swingCourse == null) {
        // コース: 打球の種類と向きから(ゴロは低め・フライは高め・引っ張りは内角・流しは外角・バントはバント)
        const ty = pl.batted.type, z = pl.opt.fielder, pull = POS[z] && ((!lh && POS[z].side < 0) || (lh && POS[z].side > 0));
        pl.swingCourse = ty === 'bunt' ? 'bunt' : ty === 'grounder' ? 'low' : (ty === 'fly' || ty === 'pop' || ty === 'fence' || ty === 'foulfly') ? 'high' : (POS[z] && POS[z].side ? (pull ? 'in' : 'out') : '');
      }
      const ce = swingContact(pl.swingCourse) ?? 0.6;   // スイング: 動きの「当たる」が打つ時刻に合うように、その分だけ前から
      const sw = pl.t - (pl.contactT - ce);
      if (sw > 0) this.batter.set('swing', { t: sw, course: pl.swingCourse, lh }); else this.batter.set('bat', { lh });
    } else {
      const K = this.knocker;
      const sw = pl.t - (pl.contactT - 0.18);
      const pts = pl.batted.path.pts, n = pl.batted.path.n;
      K.root.rotation.y = Math.atan2(-(pts[n * 4 - 4] - K.root.position.x), -(pts[n * 4 - 2] - K.root.position.z)) - Math.PI / 2;
      K.set(sw > 0 ? 'swing' : 'bat', { u: sw / 0.25 });
      const toss = pl.t - (pl.contactT - 0.5);
      if (toss > 0) {
        const k = toss / 0.5;
        this.ballView.show(true);
        this.ballView.update(V(-1.1, 1.0 + Math.sin(k * Math.PI) * 0.55, -1.3), dt, this.ctx.camera, 0, 0);
      }
    }
  }
  // 送球の道で、受ける所に一番近づく時刻
  // 11/21 一塁で送球を受ける人(一塁手・ベースカバーの投手や二塁手)の立つ所。本物どおり、ベースの内野側の端に右足(送球の来る方と反対の足)の
  // 母指球を付け、送球の来る方(from)を向いて、左足を送球の方へ踏み出して捕る(first_stretch: 右足 = 体の中心の右 0.2 m・前 0.13 m、捕る時のグラブ = 前 1.05 m・高さ 0.9 m)。
  // p = 体の中心(足は動かさない)、glove = 伸ばして捕るグラブの所(送球はここへ投げる)
  firstSpot(from) {
    const B = BASEP[1];
    let ux = from.x - B.x, uz = from.z - B.z; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
    const rx = -uz, rz = ux;   // 送球の方を向いた時の体の右
    const bx = B.x + IN1.x * 0.13 + ux * 0.06, bz = B.z + IN1.z * 0.13 + uz * 0.06;   // 右足の母指球(ベースの内野側の端から 0.06 m 内)
    const p = V(bx - rx * 0.22 - ux * 0.13, 0, bz - rz * 0.22 - uz * 0.13); p.snap = true;
    return { p, u: V(ux, 0, uz), glove: V(p.x + ux * 1.05, 0, p.z + uz * 1.05) };
  }
  // 足(左右の足首・母指球)が一塁のベースに触れているか。人の形(骨)が見えている時は骨の位置、遠くの簡単な形は体の中心で
  footOn1(F) {
    if (!F) return false;
    if (F.rig && F.rig.model.visible && F.rig.bones) {
      for (const n of ['ball_r', 'foot_r', 'ball_l', 'foot_l']) { const b = F.rig.bones[n]; if (!b) continue; b.getWorldPosition(_fv); if (_fv.y - (F.root.position.y || 0) < 0.3 && bag1Dist(_fv.x, _fv.z) <= 0.08) return true; }
      return false;
    }
    return Math.hypot(F.root.position.x - BASEP[1].x, F.root.position.z - BASEP[1].z) < 0.5;
  }
  // 一塁への送球の受け手を決めた時: 受け手は踏んで伸びる所へ、送球はグラブの所へ
  firstRecv(pl, rk, fromPos) {
    if (!rk || !this.fig[rk] || rk === this.my) return null;
    const s = this.firstSpot(fromPos);
    pl.first1 = { k: rk, spot: s };
    return s;
  }
  arriveT(path, to) {
    let best = 1e9, bt = pathDuration(path);
    for (let i = 0; i < path.n; i += 4) { const d = Math.hypot(path.pts[i * 4] - to.x, path.pts[i * 4 + 2] - to.z); if (d < best) { best = d; bt = i * path.dt; } }
    return bt;
  }
  // 受け手: 塁へ入りながら、球の来る所へ(それていれば、届く所へまっすぐ)
  receiverGo(pl, rk, toMe) {
    if (toMe || !rk || !this.fig[rk]) return;
    const F = this.fig[rk], b = this.ball; if (!b) return;
    const path = b.path, fp = F.root.position;
    // 11/21 一塁への送球: 受け手はベースに右足を付けたまま伸びて捕る(前は球の来る所へ前へ出て、ベースの 1〜3 m 前で捕っていた)。
    // 送球がそれて、足を付けたまま伸びても届かない時(グラブの所から 1.0 m より外を通る)だけ、球の所へ離れる
    const f1 = pl.thrown && pl.thrown.base === 1 && pl.first1 && pl.first1.k === rk ? pl.first1.spot : null;
    // 11/22 走りながら捕る一塁カバー(firstLead): 止まらずにベースへ走り続け、通り道で捕る(球はその道の上へ投げてある)
    if (pl.thrown && pl.thrown.base === 1 && pl.firstLeadK === rk && pl.firstLeadSpot) { F.target = pl.firstLeadSpot.clone(); F.target.snap = true; F.chase = null; F.role = 'base1'; return; }
    if (f1) {
      let m = 1e9;
      for (let i = 0; i < path.n; i++) { const y = path.pts[i * 4 + 1]; if (y > 2.3) continue; m = Math.min(m, Math.hypot(path.pts[i * 4] - f1.glove.x, path.pts[i * 4 + 2] - f1.glove.z)); }
      if (m <= 1.0) { F.target = f1.p.clone(); F.target.snap = true; F.chase = null; F.role = 'base1'; return; }
      pl.first1 = null;   // それた: 離れて捕る(タッチか、セーフ)
    }
    // 11/26 持ち主「まだファーストとかがベース離れることある」: 一塁への送球で、ベースを踏んで伸びる所(グラブの所から 1.2 m 以内)を通るなら、
    // まだベースに着いていない受け手もベースへ入って踏んで捕る(前は球の通り道の手前へ出て、ベースから離れて捕っていた)
    if (!COVFIX_OFF && pl.thrown && pl.thrown.base === 1 && pl.thrown.fromK && this.fig[pl.thrown.fromK]) {
      const S1 = this.firstSpot(this.fig[pl.thrown.fromK].root.position);
      let m = 1e9; for (let i = 0; i < path.n; i++) { if (path.pts[i * 4 + 1] > 2.3) continue; m = Math.min(m, Math.hypot(path.pts[i * 4] - S1.glove.x, path.pts[i * 4 + 2] - S1.glove.z)); }
      if (m <= 1.2 && this.runTime(Math.hypot(fp.x - S1.p.x, fp.z - S1.p.z), VMAX[rk] || AI_SPEED) < this.arriveT(path, S1.glove) + 0.15) { F.target = S1.p.clone(); F.target.snap = true; F.chase = null; F.role = 'base1'; return; }
    }
    let pt = null;
    for (let i = 0; i < path.n; i += 2) {
      const x = path.pts[i * 4], y = path.pts[i * 4 + 1], z = path.pts[i * 4 + 2], tt = i * path.dt;
      if (y > 2.3 || tt < 0.25) continue;
      const need = this.runTime(Math.hypot(x - fp.x, z - fp.z), VMAX[rk] || AI_SPEED);
      if (need <= tt - 0.05) { pt = V(x, 0, z); break; }
    }
    if (!pt) {
      // 間に合う所が無い: 送球の線にいちばん近い所へ寄る
      let bd = 1e9;
      for (let i = 0; i < path.n; i++) { const x = path.pts[i * 4], y = path.pts[i * 4 + 1], z = path.pts[i * 4 + 2]; if (y > 2.3) continue; const dd = Math.hypot(x - fp.x, z - fp.z); if (dd < bd) { bd = dd; pt = V(x, 0, z); } }
      if (!pt) return;
    }
    // 塁の近く(1.2 m 以内)で捕れるなら塁で待つ。そうでなければ球へ
    const base = pl.thrown && pl.thrown.base != null ? BASEP[pl.thrown.base] : null;
    // 11/25 盗塁の二塁: 送球が塁の近く(1.6 m)を通るなら、前へ出ずに塁で待ってタッチ(前は送球に向かって前へ出て、塁から離れて捕り、挟殺になっていた)
    if (pl.steal && base) {
      let m = 1e9; for (let i = 0; i < path.n; i++) { if (path.pts[i * 4 + 1] > 2.3) continue; m = Math.min(m, Math.hypot(path.pts[i * 4] - base.x, path.pts[i * 4 + 2] - base.z)); }
      if (m < 1.6) { F.target = base.clone().add(V(0, 0, 0.5)); F.chase = null; return; }
    }
    // 11/28 X の遊んだ人「ホームゲッツー取らない」: 満塁のゴロで本塁へ投げた時、捕手が送球を迎えに本塁の 2〜3 m 前へ出て捕り、本塁を踏めず封殺にならなかった(tools/homedp_1128.py)。
    //   本塁への送球が本塁の受け所(HOME_RECV)の近く(1.6 m)を通るなら、前へ出ずに本塁で待って受ける(?oldcommit=1 で前の形)
    if (!AICOMMIT_OFF && base && pl.thrown.base === 0) {
      let m = 1e9; for (let i = 0; i < path.n; i++) { if (path.pts[i * 4 + 1] > 2.3) continue; m = Math.min(m, Math.hypot(path.pts[i * 4] - HOME_RECV.x, path.pts[i * 4 + 2] - HOME_RECV.z)); }
      if (m < 1.6) { F.target = HOME_RECV.clone(); F.chase = null; return; }
    }
    if (!base || Math.hypot(pt.x - base.x, pt.z - base.z) > 1.9) { F.target = pt; F.chase = { pt, at: pl.t, path }; }
    else if (Math.hypot(fp.x - base.x, fp.z - base.z) > 1.5) { F.target = pt; F.chase = { pt, at: pl.t, path }; }   // まだ塁に着いていない: 間に合う所で受ける   // 塁から 1.9 m 以内に来る送球は、塁に足を残して伸びて捕る
  }
  launch(path, t) { this.ball = { path, t0: t, tPrev: 0 }; this.ballView.show(true); this.ballView.clearTrail(); }

  live(pl, dt) {
    const c = this.ctx;
    // 走者
    for (const r of [this.batterRunner, ...this.runners]) {
      if (!r || r.out || r.scored) continue;
      if (r.turnT > 0) { r.turnT -= dt; continue; }
      if (r.returning) {
        r.dist -= RUN_SPEED * dt;
        if (r.dist <= 0) { r.dist = 0; r.returning = false; r.run = false; r.done = true; if (r.tagupNext) { r.tagupNext = false; r.run = true; r.done = false; r.startAt = pl.t + 0.05; r.to = r.tagupTo || 4; r.tagup = true; } }
        continue;
      }
      if (!r.run || r.done) continue;
      if (pl.t < (r.startAt || 0)) continue;
      if (r.half && r.dist >= (r.halfDist ?? HALF)) continue;   // 様子を見て止まる
      // 送球がその塁へ来ている → 塁の 3 m 手前から足から滑り込む(打者走者の一塁は駆け抜ける)
      if (!r.isBatter && r.slideT == null && 27.43 - r.dist < 3.0 && (r.from + 1) % 4 === r.to % 4 && ((pl.thrown && pl.thrown.base === (r.from + 1) % 4) || (!pl.fly && !pl.ofHit))) r.slideT = 0;
      // 7. 走り出しは加速(約 1 秒で全速)。本塁打は軽く走る(5.5 m/s)
      const vmaxR = r.trot ? 6.5 : (r.isBatter ? BATTER_SPEED : RUN_SPEED);
      let vcap = vmaxR;
      // 止まる塁(二塁・三塁で次へ行かない時)は、手前 4 m から減速して止まる(いきなり止まらない)。一塁の駆け抜け・本塁・滑り込みは減速しない
      const stopHere = (r.from + 1) % 4 === r.to % 4 && r.to % 4 !== 0 && !(r.isBatter && r.to === 1) && r.slideT == null;
      if (stopHere) vcap = Math.min(vcap, Math.max(1.2, Math.sqrt(2 * 9 * Math.max(0, 27.43 - r.dist))));   // 最後の 2〜3 m で止まる
      r.v = Math.min(vcap, (r.v || 0) + 7.5 * dt);
      r.dist += r.v * dt;
      if (r.dist >= 27.43) {
        r.from = (r.from + 1) % 4; r.dist = 0; r.arrived = r.from;
        if (r.from === 0) { r.scored = true; r.done = true; r.run = false; c.sound.sfx('base_step', { gain: 0.5 }); if (this.kind === 'game' && !pl.hr && !pl.said.scoreSnd) { pl.said.scoreSnd = true; c.sound.crowdEvent('score', 0.8); } if (this.kind === 'game' && !pl.said.home) { pl.said.home = true; this.say('home_in', { maxWait: 1.2 }); } }
        else if (r.from >= r.to) { r.done = true; r.run = false; r.v = 0; if (r.isBatter && r.from === 1) r.throughT = 0; }
      }
    }
    if (pl.phase === 'live' && !pl.endT && this.g && pl.t >= (pl.rdNext || 0)) { pl.rdNext = pl.t + 0.2; this.runnerDecisions(pl); }
    this.fixRunnerOrder(pl);
    this.tagPlay(pl, dt);
    // 球
    if (this.ball) {
      const b = this.ball;
      const t1 = pl.t - b.t0;
      const p = V();
      let caught = false;
      for (let tt = b.tPrev; tt <= t1 && !caught; tt += DT) {
        samplePath(b.path, tt, p);
        caught = this.tryCatch(pl, p, tt);
      }
      b.tPrev = t1;
      if (!caught && this.ball) {
        samplePath(b.path, t1, p);
        this.ballView.update(p, dt, c.camera, 0.022, 0.25);
        const dd = p.distanceTo(c.camera.position);
        if (dd < 1.4 && c.view === '1p') { this.ballView.mesh.scale.setScalar(0.001); this.ballView.fitDot(p, dd, 0, c.camera); }
        else { const s2 = ballVisScale(dd, c.camera); this.ballView.mesh.scale.setScalar(s2); this.ballView.fitDot(p, dd, s2, c.camera); }   // 11/20 本物の大きさに近く(ball.js の ballVisScale。前は dd × 0.0045 / r で 40 m 先が約 5 倍)
        this.shadow.visible = p.y > 0.3; this.shadow.position.set(p.x, this.gy(p) + 0.02, p.z);
        this.updateLandMark(pl, p);
        this.ballPos = p;
        if (!pl.thrown && !pl.holder && pl.batted && b.path === pl.batted.path) {
          const me = c.player.pos, dh = Math.hypot(p.x - me.x, p.z - me.z), hb = p.y - me.y;
          const ma = this.meAct, prone = NEWDIVE && ma && ma.kind === 'dive' && ma.t - (ma.turn || 0) > DV.win1;
          if (prone) {
            // 11/25 飛び込んで倒れている間に、体の近くを球が過ぎた(飛ぶのが早すぎた): 捕球のミスには数えず、札で知らせる
            if (hb > -0.2 && hb < 2.2 && dh < this.D.reach && !ma.early && !pl.dropped) { ma.early = true; if (c.ui && c.ui.evalPop && !this.dg) c.ui.evalPop('飛び込みが早かった', 'miss'); }
          } else if (hb > -0.2 && hb < 2.2) pl.myMin = Math.min(pl.myMin ?? 99, dh);
        }
        // フェアの打球がフェンスを越えてスタンドに入った: その場で本塁打(後ろの席に当たって跳ね返った球は捕っても無効)
        if (pl.batted && b.path === pl.batted.path && !pl.thrown && !pl.holder && !pl.endT && !pl.foulCalled) {
          const ang = Math.atan2(p.x, -p.z) / D2R;
          if (Math.abs(ang) <= 45 && Math.hypot(p.x, p.z) > this.fenceInfo(ang).dist + 0.6 && p.y > 0.2) { this.homeRun(pl); return; }
        }
        // 屋根の球場: ベンチ(前のネットが無い)に入った打球・送球はボールデッド
        const dg = c.dugouts;
        if (dg && !pl.endT && p.y < 2.2 && dg.some((q) => p.x > q.x[0] && p.x < q.x[1] && p.z > q.z[0] && p.z < q.z[1] && Math.abs(p.x) > 21)) { this.ball = null; this.ballView.show(false); this.hush('ボールデッド', 'ベンチに入った', { ms: 1000 }); this.umpCall('foul', 0); this.finishPlay(pl, 'ボールデッド'); return; }
        if (t1 > pathDuration(b.path) + 0.3 && !pl.endT) this.ballDead(pl);
        else if (this.kind === 'knock' && !pl.thrown && !pl.missed && !pl.holder && t1 > 0.8) {
          // 自分の横・後ろを抜けた(拾いに行くか、外野が拾って返す)
          const me = c.player.pos;
          const dB = Math.hypot(p.x - pl.p0.x, p.z - pl.p0.z), dM = Math.hypot(me.x - pl.p0.x, me.z - pl.p0.z);
          if (dB > dM + 4 && Math.hypot(p.x - me.x, p.z - me.z) > 3) { pl.missed = true; this.stats.streak = 0; this.hush('抜けた', '球に追いついて返す', { ms: 900 }); }
        }
        // 試合: フライ・ライナーが捕られずに落ちた → 様子を見ていた走者が走り出す
        if (this.g && pl.fly && !pl.foulCalled && pl.fairKnown && !pl.flyDropped && !pl.thrown && b.path.events.some((e) => (e.type === 'bounce' || e.type === 'roll') && e.t <= t1)) {
          pl.flyDropped = true;
          const of = POS[pl.opt.fielder].of;
          // 11/27 インフィールドフライが落ちた: 走者はフォースでない(進むのは自分の責任)。一斉に走らせず、毎こまの判断(brain.js)に任せる
          for (const r of this.runners) { if (r.out) continue; if (pl.iff && !OLDIFF) continue; r.half = false; r.run = true; r.done = false; r.startAt = pl.t; r.to = Math.min(4, r.base + (of && r.base >= 2 ? 2 : 1)); }
          // 11/27 持ち主「内野に抜けた時にセーフとか言ってる」: 内野の飛球が落ちただけでは「セーフ」と言わない(この後に拾って投げてアウトになることがある。本当のセーフは塁の判定 tagBase の時に言う)
          if (!pl.said.drop && this.kind === 'game') { pl.said.drop = true; this.say(of ? (pl.opt.fielder === 'CF' ? (this.rng() < 0.5 ? 'gap_left' : 'gap_right') : 'through') : OLDTALK ? 'safe' : null, { maxWait: 1 }); this.ctx.sound.crowdEvent(of ? 'longhit' : 'hit', 0.8); }
        }
        // ゴロが内野を抜けた
        // 11/27 持ち主「内野に抜けた時に『抜けた』と言ってることがある」: 本塁から 46 m を越えただけでは言わない。内野手の誰もそばにいない(4 m より遠い)・
        // 止まる所が内野の後ろ(本塁から 44 m 超)の時だけ。内野手が深い所で捕るゴロ・内野の後ろで止まるゴロには言わない(?oldtalk=1 で前の形)
        if (this.kind === 'game' && !pl.fly && !pl.thrown && !pl.holder && !pl.said.through && !POS[pl.opt.fielder].of && Math.hypot(p.x, p.z) > 46 && (OLDTALK || this.passedInfield(b.path, p))) { pl.said.through = true; this.say('through', { maxWait: 1 }); c.sound.crowdEvent('hit', 0.6); }
      }
    } else if (this.holderFig) {
      const hp = this.holderFig === 'me' ? c.myHandPos() : this.holderFig.root.position.clone().add(V(0, 1.2, 0));
      this.ballView.update(hp, dt, c.camera, 0, 0); this.shadow.visible = false;
      this.ballView.mesh.scale.setScalar(this.holderFig === 'me' && c.view === '1p' ? 0.55 : Math.min(2.5, ballVisScale(hp.distanceTo(c.camera.position), c.camera)));   // 野手が持っている球は手・グラブとの比を崩しすぎないよう 2.5 倍まで
    }
    // 打球を捕りに行く野手
    const fk = pl.opt.fielder;
    if (fk !== this.my && this.ball && !pl.thrown && this.fig[fk] && !(pl.throughK && !POS[fk].of) && !(pl.flyK && pl.flyK !== fk)) {   // 11/26 宙の打球を別の人(flyOwner)が捕りに行く時は追わない   // 11/20 内野を抜けた後は、元の内野手は追わない(前は throughBall で止めても次のこまでまた追い始め、一塁手が外野まで追っていた)
      const F = this.fig[fk];
      if (!F.chase || F.chase.path !== this.ball.path) F.chase = { pt: this.interceptFor(F.root.position, this.ball, pl.t, VMAX[fk] || AI_SPEED, this.minCatchT(F)), at: F.chase ? pl.t : pl.t + REACT, path: this.ball.path };
      if (pl.t >= F.chase.at) F.target = F.chase.pt;
    }
    // フェアかファウルか
    if (this.ball && pl.batted && this.ball.path === pl.batted.path && !pl.thrown && !pl.holder && !pl.fairKnown && !pl.endT) this.judgeFair(pl);
    // 中継: 打球が外野へ行ったら中継の人が線の上へ
    if (this.bplan && this.ball && !pl.thrown && this.ballPos && Math.hypot(this.ballPos.x, this.ballPos.z) > 40) {
      // 中継・トレイルは打球が外野へ抜けたら、brain.js の立つ所へ
      for (const [k, a] of Object.entries(this.bplan)) if ((a.role === 'cut' || a.role === 'trail') && k !== this.my && this.fig[k] && this.fig[k].cutTo && !this.fig[k].cutGo) { this.fig[k].target = this.fig[k].cutTo.clone(); this.fig[k].cutGo = true; }
    } else if (!this.bplan && this.cutoffK && this.cutoffK !== this.my && this.plan && this.plan[this.cutoffK] && this.ball && !pl.thrown && this.ballPos && Math.hypot(this.ballPos.x, this.ballPos.z) > 40) {
      const s = R.roleSpot(this.plan[this.cutoffK], this.cutoffK, fk);
      if (s) this.fig[this.cutoffK].target = V(s[0], 0, s[1]);
    }
    // 内野を抜けた打球(内野手の間・頭の上): 抜けた時のボールの動きから、外野手の捕りに行く人を決め直す
    if (!pl.throughK && pl.batted && this.ball && this.ball.path === pl.batted.path && !pl.thrown && !pl.holder && !pl.endT && !pl.foulCalled
      && !POS[pl.opt.fielder].of && this.ballPos && Math.hypot(this.ballPos.x, this.ballPos.z) > 38 && !(pl.flyK && !pl.flyDropped && this.ballPos.y > 0.3)) this.throughBall(pl);
    if (!pl.holder && this.ball && pl.phase === 'live' && !pl.endT && pl.t >= (pl.lbNext || 0)) { pl.lbNext = pl.t + 0.2; this.ensureChaser(pl); }
    if (pl.phase === 'live' && !pl.endT && pl.t >= (pl.fcNext || 0)) { pl.fcNext = pl.t + 0.1; this.firstCover(pl); }   // 11/22 一塁のベースカバー(誰が入るか)を決め直す
    if (pl.phase === 'live' && !pl.endT && pl.batted && !pl.fly && pl.t >= (pl.ofcNext || 0)) { pl.ofcNext = pl.t + 0.2; this.ofCover(pl); this.ofSupport(pl); }
    if (pl.phase === 'live' && !pl.endT && pl.batted && pl.fly && (pl.flyDropped || pl.fieldedBy) && pl.t >= (pl.ofcNext || 0)) { pl.ofcNext = pl.t + 0.2; this.ofCover(pl); }
    // 11/20 内野手が追っていた球が外野へ出たら、その内野手は追うのをやめる(一塁手は一塁へ戻る)。外野の球は外野手が拾う
    if (pl.looseK && this.ball && !pl.holder && this.ballPos && POS[pl.looseK] && !POS[pl.looseK].of && !this.inInfield(this.ballPos) && Math.hypot(this.ballPos.x, this.ballPos.z) > 40 && !(pl.thrown && pl.thrown.eta != null && pl.t < pl.thrown.eta + 0.15) && !(pl.flyK === pl.looseK && !pl.flyDropped && this.ballPos.y > 0.3)) {
      const F = this.fig[pl.looseK];
      if (F) { F.chase = null; F.role = pl.looseK === '1B' ? 'base1' : null; F.target = pl.looseK === '1B' ? BASEP[1].clone().add(V(-0.6, 0, -0.4)) : this.homeOf(pl.looseK); }
      pl.looseK = null; pl.lbNext = 0;
    }
    if (pl.looseK && pl.looseK === pl.flyK && pl.looseK !== pl.opt.fielder && this.ball && !pl.holder && !pl.flyDropped && !pl.thrown && this.ballPos && this.ballPos.y > 0.3) {
      // 11/26 宙の打球を捕りに行く人(flyOwner)は、決めた所(落ちる前に一番余裕を持って着ける所)へまっすぐ
      const F = this.fig[pl.looseK]; if (F && F.chase && pl.t >= F.chase.at) F.target = F.chase.pt;
    } else if (pl.looseK && this.ball && !pl.holder && pl.t >= (pl.looseNext || 0)) {
      pl.looseNext = pl.t + 0.2;
      const F = this.fig[pl.looseK];
      if (F) { const tg = this.interceptFor(F.root.position, this.ball, pl.t, VMAX[pl.looseK] || AI_SPEED, 0, 0, !LOOSE_OFF && (F.spd || 0) > 2 ? 0.05 : REACT); F.target = tg; F.chase = { pt: tg, at: pl.t, path: this.ball.path }; F.role = 'field'; }   // 11/25 もう走っている人は反応の間(0.25 秒)を足さない
    }
    if (pl.selfTagK && pl.holder === pl.selfTagK && !pl.endT) {
      const F = this.fig[pl.selfTagK];
      if (this.footOn1(F)) { this.tagBase(pl, 1, pl.selfTagK); pl.selfTagK = null; pl.aiThinking = false; }   // 11/21 足がベースに触れた時(前は体の中心が 0.7 m 以内)
    }
    if (pl.holder && !this.ball && !pl.endT && pl.holder !== 'me') this.aiDecide(pl);
    if (pl.holder === 'me' && !this.ball) {
      // 塁に触れた(足が塁の角にかかる 0.9 m 以内)
      for (let bi = 0; bi <= 3; bi++) if (Math.hypot(c.player.pos.x - BASEP[bi].x, c.player.pos.z - BASEP[bi].z) < 0.9) this.tagBase(pl, bi, 'me');
      // アウトが決まって走者も止まり、球が内野にある(外野で持っている時は内野へ返すまで続ける)
      const inIF = !POS[this.my].of || this.inInfield(c.player.pos);
      if (!pl.endT && !pl.releasing && pl.choiceAt == null && pl.t - pl.caughtT > 0.7 && !this.anyMoving() && (inIF || (pl.t - pl.caughtT > 8))) this.finishPlay(pl, inIF ? null : '送球なし');
      if (this.kind === 'knock' && pl.t - pl.caughtT > 8 && !pl.endT && !pl.releasing) this.finishPlay(pl, '送球なし');
    }
    if (!pl.endT) {
      if (pl.hr && !this.anyMoving()) this.finishPlay(pl, 'ホームラン');   // 全員が本塁を踏んだ
      if (pl.t > 25 && !pl.hr) this.finishPlay(pl, null);
      if (pl.hr && pl.t - pl.hrT > 30) this.finishPlay(pl, 'ホームラン');
      if (!this.anyMoving() && !this.ball && pl.holder && pl.holder !== 'me' && !pl.aiThinking && pl.t > pl.contactT + 1.5 && (!POS[pl.holder].of || this.inInfield(this.fig[pl.holder].root.position))) this.finishPlay(pl, null);
      // 送球がそれた・受け手が届かない → 近い野手(投げた人と受け手以外)が追う
      if (pl.thrown && this.ball && !pl.overChase && pl.thrown.eta != null && pl.t > pl.thrown.eta + 0.15) {
        pl.overChase = true;
        const k = this.looseTo(this.ballPos || V(), [pl.thrown.fromK, this.my]);
        if (k) { const F = this.fig[k]; F.chase = { pt: this.interceptFor(F.root.position, this.ball, pl.t, VMAX[k] || AI_SPEED), at: pl.t, path: this.ball.path }; F.target = F.chase.pt; F.role = 'field'; pl.looseK = k; }
      }
      // 一塁手が自分で一塁を踏みに行く
      if (this.autoRun && pl.holder === 'me') {
        const P0 = c.player.pos, dx = this.autoRun.x - P0.x, dz = this.autoRun.z - P0.z, dd = Math.hypot(dx, dz);
        if (dd > 0.3) { const st = Math.min(dd, this.fullSpeed() * dt); P0.x += dx / dd * st; P0.z += dz / dd * st; } else this.autoRun = null;
      }
    }
    if (pl.batted && pl.t >= pl.contactT - 0.5 && pl.t < pl.contactT + 0.1) {
      for (const r of this.runners) {
        if (r.isBatter || r.run || r.second || r.out) continue;
        const want = (r.lead0 || 0) + (r.from === 3 ? 2.2 : 1.9);
        r.dist = Math.min(want, r.dist + 4.0 * dt); r.shuffle = r.dist < want;
        if (pl.t >= pl.contactT) r.second = true;
      }
    }
    if (pl.batted && pl.opt.fielder === this.my && pl.firstMove == null && pl.t >= pl.contactT) {
      const P = c.player.pos;
      if (!pl.meStart) {
        pl.meStart = P.clone();
        // 打球のうち自分にいちばん近い所(手の届く高さ)へ向かうのが正しい一歩目
        const path = pl.batted.path; let bd = 1e9;
        for (let i = 0; i < path.n; i += 2) { const x = path.pts[i * 4], y = path.pts[i * 4 + 1], z = path.pts[i * 4 + 2]; if (y > 2.4) continue; const dd = Math.hypot(x - P.x, z - P.z); if (dd < bd) { bd = dd; pl.meAim = V(x, 0, z); } }
      }
      const mx = P.x - pl.meStart.x, mz = P.z - pl.meStart.z, ml = Math.hypot(mx, mz);
      if (ml > 0.6) {
        const A = pl.meAim || P, ax = A.x - pl.meStart.x, az = A.z - pl.meStart.z, al = Math.hypot(ax, az) || 1;
        const good = al < 1.5 || (mx * ax + mz * az) / (ml * al) > 0.5;
        pl.firstMove = good ? pl.t - pl.contactT : 1.5;   // 違う方へ出たら遅れと同じ
      }
    }
    if (pl.endT != null) {
      // 駆け抜けた打者走者が一塁へ戻るまでは閉じない(最長 4 秒)
      const br = this.batterRunner, backing = this.kind === 'game' && !(this.g && this.g.outs + (pl.outs || 0) >= 3) && br && !br.out && br.throughT != null && br.throughT < 1.6 && this.overrunOff(br) > 0.4;
      pl.endT -= dt;
      if (pl.endT <= 0 && !backing) this.closePlay(pl);
    }
    // 中継・カバーは自分で動かして入る(自動では走らせない。行く先は地面の薄い輪だけで知らせる)
    if (pl.coverSpot && !pl.coverDone) {
      const me = c.player.pos;
      { this.ring.visible = true; this.ring.position.set(pl.coverSpot.p.x, this.gy(pl.coverSpot.p) + 0.03, pl.coverSpot.p.z); }
      pl.coverDist = Math.hypot(me.x - pl.coverSpot.p.x, me.z - pl.coverSpot.p.z);
      if (pl.phase !== 'pre') { if (pl.coverStart == null) pl.coverStart = pl.coverDist; pl.coverMin = Math.min(pl.coverMin ?? 99, pl.coverDist); }
    }
  }
  // ------------------------------------------------------------ 走者の判断(行く・止まる と理由を記録)
  logRun(pl, r, act, why) {
    // 走塁の決めの記録(点検用に、その時の場面も残す: アウト数・打球・球を持つ人・送球先・塁間の位置)
    const bp = this.ballPos;
    (pl.runLog = pl.runLog || []).push({ t: +pl.t.toFixed(2), tc: +(pl.t - pl.contactT).toFixed(2), base: r.base, from: r.from, act, why, outs: this.g ? this.g.outs + (pl.outs || 0) : 0, type: pl.batted ? pl.batted.type : null, zone: pl.opt ? pl.opt.fielder : null, holder: pl.holder || null, thrown: pl.thrown ? pl.thrown.base ?? null : null, dist: +(r.dist || 0).toFixed(1), ball: bp ? [+bp.x.toFixed(1), +bp.z.toFixed(1), +bp.y.toFixed(1)] : null, bat: !!r.isBatter, pick: pl._bb && pl._bb.pickPos ? [Math.round(pl._bb.pickPos[0]), Math.round(pl._bb.pickPos[1]), +(pl._bb.pickT || 0).toFixed(2)] : null });
    if (act === '戻る' && this.onBack) this.onBack(pl, r);
  }
  runDecide(pl, r, go, to, why, delay) {
    r.why = why;
    if (go) { r.half = false; r.run = true; r.done = false; r.startAt = pl.t + (delay || 0); r.to = Math.min(4, to); this.logRun(pl, r, `${['本', '一', '二', '三', '本'][Math.min(4, to)]}塁へ`, why); }
    else { r.run = false; r.done = true; this.logRun(pl, r, '止まる', why); }
  }
  // 打球の落ちる所(最初に地面に着く所・止まる所)の本塁からの距離
  landDist(pl) {
    // ゴロは外野手が拾う辺り(転がって止まる所、外野の守備位置の深さまで)、フライ・ライナーは最初に落ちる所
    if (pl.batted && pl.batted.type === 'grounder') { const e = samplePath(pl.batted.path, pathDuration(pl.batted.path), V()); return Math.min(Math.hypot(e.x, e.z), Math.hypot(this.homeOf(pl.opt.fielder).x, this.homeOf(pl.opt.fielder).z)); }
    const ev = pl.batted && pl.batted.path.events.find((e) => e.type === 'bounce' || e.type === 'roll' || e.type === 'stop' || e.type === 'wall');
    const p = ev ? ev.p : pl.batted ? samplePath(pl.batted.path, pathDuration(pl.batted.path), V()) : V();
    return Math.hypot(p.x, p.z);
  }
  // 外野の安打: 打球の深さ・方向・アウトの数で、次の塁を狙うか決める(三塁コーチの決まりの代わり)
  ofHitRunners(pl, twoOut) {
    const D = this.landDist(pl), z = pl.opt.fielder, g = this.g;
    // 間に合うか: 外野手が拾う時刻 + 持ち替え 1.1 秒 + 送球(30 m/s)と、走者が着く時刻を比べる(2 アウトは少し積極的に)
    const F = z === this.my ? null : this.fig[z];
    const from = F ? F.root.position : this.homeOf(z);
    const ic = this.ball ? this.interceptFor(from, this.ball, pl.t, VMAX[z] || 8.2, this.minCatchT(F || {})) : this.homeOf(z);
    const tPick = this.ball ? (() => { const b = this.ball.path; for (let i = 0; i < b.n; i += 4) { const x = b.pts[i * 4], y = b.pts[i * 4 + 1], zz = b.pts[i * 4 + 2]; if (y < 2.4 && Math.hypot(x - ic.x, zz - ic.z) < 1.5) return i * b.dt; } return pathDuration(b); })() : 3.5;
    const ballTo = (bi) => tPick + 1.1 + Math.hypot(BASEP[bi].x - ic.x, BASEP[bi].z - ic.z) / 30;
    const runT = (bases, lead) => (27.43 * bases - lead) / RUN_SPEED + 0.15;
    const margin = twoOut ? 0.6 : 0.15;
    const late = g.inning >= 7 && Math.abs(g.score.us - g.score.them) <= 1;
    for (const r of this.runners) {
      if (r.base === 3) this.runDecide(pl, r, true, 4, '三塁走者: 安打で生還', 0.05);
      else if (r.base === 2) {
        const rt = runT(2, r.dist || 3.3), bt = ballTo(0);
        const why = `走者 ${rt.toFixed(1)}秒・送球 ${bt.toFixed(1)}秒`;
        if (rt < bt + margin + (late ? 0.3 : 0)) this.runDecide(pl, r, true, 4, `${twoOut ? '2アウト: ' : late ? '終盤の 1 点: ' : ''}間に合う(${why}): 本塁を狙う`, 0.05);
        else this.runDecide(pl, r, true, 3, `危ない(${why}): 三塁止まり`, 0.1);
      } else if (r.base === 1) {
        const rt = runT(2, r.dist || 3.3), bt = ballTo(3);
        const why = `走者 ${rt.toFixed(1)}秒・三塁への送球 ${bt.toFixed(1)}秒`;
        if (rt < bt + margin - 0.2) this.runDecide(pl, r, true, 3, `間に合う(${why}): 三塁を狙う`, 0.1);
        else this.runDecide(pl, r, true, 2, `危ない(${why}): 二塁止まり`, 0.1);
      }
    }
    if (this.batterRunner && D > 80) { this.batterRunner.to = 2; this.logRun(pl, this.batterRunner, '二塁へ', '外野の奥深く(長打): 二塁を狙う'); }
  }

  // 走者の判断を毎 0.2 秒見直す(三塁コーチの代わり): ボールの今の動きから「塁に着く時刻」と「その塁へ送球が届く時刻」を比べる
  ballToBase(pl, bi) {
    const P = BASEP[bi];
    if (pl.holder) {
      const H = this.holderPos(pl); if (!H) return 99;
      const k = pl.holder === 'me' ? this.my : pl.holder;
      return (POS[k] && POS[k].of ? 1.0 : 0.6) + Math.hypot(H.x - P.x, H.z - P.z) / 30;
    }
    if (pl.thrown && this.ball) {
      if (pl.thrown.base === bi) return Math.max(0, (pl.thrown.eta || pl.t) - pl.t);
      return 1.2 + Math.max(0, (pl.thrown.eta || pl.t) - pl.t) + 12 / 30;   // ほかの塁へ: 受けてから投げ直す
    }
    if (this.ball && this.ballPos) {
      // これから拾う: 一番早く着く野手が拾う時刻 + 持ち替え + 送球
      const p = this.ballPos;
      let best = 99;
      for (const k of Object.keys(POS)) {
        if (!this.fig[k].root.visible) continue;
        const F = this.fig[k].root.position;
        const tp = this.runTime(Math.hypot(F.x - p.x, F.z - p.z), VMAX[k] || AI_SPEED);
        const t = tp + (POS[k].of ? 1.0 : 0.6) + Math.hypot(p.x - P.x, p.z - P.z) / 30;
        if (t < best) best = t;
      }
      const ofHit = Math.hypot(p.x, p.z) > 45;
      if (ofHit && bi === 0 && Math.hypot(p.x, p.z) > 60) best += 0.5;   // 中継を通す
      return best;
    }
    return 99;
  }
  // brain.js に渡す「いまの球」(docs/判断の組み込み手順.md の 3)
  brainBall(pl) {
    const kindOf = (k) => (POS[k] && POS[k].of ? 'OF' : k === 'C' ? 'C' : k === 'P' ? 'P' : 'IF');
    const armOf = (k) => BLV.arm[k] || BLV.arm.IF;
    if (pl.holder) {
      const k = pl.holder === 'me' ? this.my : pl.holder, H = this.holderPos(pl);
      if (!H) return { holder: true, holderPos: [0, -19], holderKind: 'IF', arm: BLV.arm.IF };
      const v = pl.holder === 'me' ? (this.ctx.player.vel || V()) : V(-Math.sin(this.fig[k].root.rotation.y) * (this.fig[k].spd || 0), 0, -Math.cos(this.fig[k].root.rotation.y) * (this.fig[k].spd || 0));
      return { holder: true, holderPos: [H.x, H.z], holderVel: [v.x, v.z], holderKind: kindOf(k), arm: armOf(k) };
    }
    if (pl.thrown && this.ball) {
      const th = pl.thrown, rk = th.to === 'me' ? this.my : th.to;
      const rp = rk && (rk === this.my ? this.ctx.player.pos : this.fig[rk] && this.fig[rk].root.position);
      let tb = th.base;
      if (tb == null && rp) { let bd = 1e9; for (let i = 0; i < 4; i++) { const dd = Math.hypot(BASEP[i].x - rp.x, BASEP[i].z - rp.z); if (dd < bd) { bd = dd; tb = i; } } }
      const eta = Math.max(0, (th.eta || pl.t) - pl.t);
      return { throwTo: tb ?? 2, throwEta: eta, throwToPos: rp ? [rp.x, rp.z] : null, recvPos: rp ? [rp.x, rp.z] : null, loose: !!pl.overChase };
    }
    // 転がる・飛んでいる球: いちばん早く拾える野手の所と時刻
    const b = this.ball; if (!b || !this.ballPos) return { holder: true, holderPos: [0, -19], holderKind: 'IF', arm: BLV.arm.IF };
    const p = this.ballPos, cands = [];
    for (const k of Object.keys(POS)) {
      const me = k === this.my, F = me ? this.ctx.player.pos : this.fig[k].root.position;
      if (!me && !this.fig[k].root.visible) continue;
      cands.push([Math.hypot(F.x - p.x, F.z - p.z), k, F]);
    }
    cands.sort((x, y) => x[0] - y[0]);
    let best = null;
    for (const [, k, F] of cands) {   // 全員で比べる(今の球の近くでなく、拾える所の早さで)
      const vmax = k === this.my ? this.fullSpeed() : (VMAX[k] || AI_SPEED);
      // 走者の見積もり: 野手は手(グラブ)の届く 1.2 m 先で捕れる。打って 0.3 秒より後は、もう動き出しているので反応の遅れは数えない
      // (前は自分の守る所へのゴロでも「誰も捕れず外野へ抜ける」と見て、走者が二つ先の塁を狙い、拾われた瞬間に戻していた)
      const pt = this.interceptFor(F, b, pl.t, vmax, 0, 1.2, pl.t > pl.contactT + 0.3 ? 0 : REACT);
      // 拾う時刻 = 野手が着く時刻と、球がその点に来る時刻の遅い方
      let tb = 0; { const P = b.path, t0 = pl.t - b.t0; for (let i = Math.max(0, Math.floor(t0 / P.dt)); i < P.n; i++) { if (Math.hypot(P.pts[i * 4] - pt.x, P.pts[i * 4 + 2] - pt.z) < 1.0 && P.pts[i * 4 + 1] < 2.4) { tb = i * P.dt - t0; break; } } }
      const t = Math.max(0.25 + this.runTime(Math.hypot(pt.x - F.x, pt.z - F.z), vmax), tb);
      if (!best || t < best.t) best = { k, pt, t, F };
    }
    const dv = best.pt.clone().sub(best.F).setY(0); const dl = dv.length() || 1;
    return { ballPos: [p.x, p.z], pickPos: [best.pt.x, best.pt.z], pickT: best.t, pickVel: [dv.x / dl * 5, dv.z / dl * 5], holderKind: kindOf(best.k), arm: armOf(best.k) };
  }
  runnerDecisions(pl) {
    // 毎こまの走者の判断は brain.js の runnersTick(打った瞬間に決めた形を、球の動きに合わせて直す)
    const g = this.g; if (!g) return;
    if (!pl.holder && !pl.thrown && !(this.ball && this.ballPos)) return;   // 球がまだ見えていない(打つ前)
    const p = this.ballPos;
    const airborne = pl.fly && !pl.flyDropped && !pl.fieldedBy && this.ball && this.ball.path === (pl.batted && pl.batted.path) && p && p.y > 0.4;
    if (airborne && g.outs + (pl.outs || 0) < 2) return;   // フライは捕られるか落ちるかまで(打った瞬間の構えのまま)
    if (airborne && pl.iff && !OLDIFF) return;   // 11/27 インフィールドフライの打者アウトは「2 アウト目」に数えない(一死で打者アウトになっても、走者は捕るまで塁にとどまる)
    if (pl.foulCalled) return;
    const late = g.inning >= 7 && Math.abs(g.score.us - g.score.them) <= 1;
    const all = [this.batterRunner, ...this.runners].filter((r) => r && !r.out && !r.scored);
    const st = { outs: g.outs, outsThisPlay: pl.outs || 0, late, ball: this.brainBall(pl),
      runners: all.map((r) => ({ id: r.isBatter ? 'B' : this.runners.indexOf(r), from: r.from, dist: r.dist, to: r.to, running: !!(r.run && !r.done && !(r.half && r.dist >= (r.halfDist ?? HALF))), returning: !!r.returning, isBatter: !!r.isBatter, forced: this.forcedNow(r), committed: !!r.committed, between: !!(r.rundown && pl.holder), aggr: r.aggr || 0 })) };
    pl._bb = st.ball;
    let res;
    try { res = BR.runnersTick(st, BLV); } catch (e) { return; }
    // 11/25 捕手の本塁の場面(coverScene の sendHome): 二塁・三塁の走者は本塁へ突っ込む(三塁コーチが回す)
    if (pl.sendHome) for (const r of all) if (!r.isBatter && r.from >= 2 && !r.out && !(pl.fly && !pl.fieldedBy && !pl.flyDropped)) res[this.runners.indexOf(r)] = { act: 'go', to: 4, why: '本塁へ突っ込む(捕手の場面)' };
    // 一度決めた判断は、球の状況(持つ人・送球の行き先)が変わるまで 0.8 秒は変えない(行ったり来たりを防ぐ)
    const bkey = pl.holder ? 'h:' + pl.holder : pl.thrown ? 't:' + (pl.thrown.to || '') + (pl.thrown.base ?? '') : 'loose';
    for (const r of all) {
      const d = res[r.isBatter ? 'B' : this.runners.indexOf(r)]; if (!d) continue;
      const sticky = r.decT != null && pl.t - r.decT < 0.8 && r.decKey === bkey;
      if (d.act === 'go') {
        const to = Math.min(4, d.to || r.from + 1);
        if (to > r.from && this.jammed(pl, r, all)) continue;   // 11/26 次の塁がふさがっていて前の走者が進まない: 行かない
        if (r.returning || !r.run || r.done || r.to !== to || r.half) {
          if (r.half && to === r.from + 1 && !r.returning && r.run && !r.done && !pl.flyDropped && pl.fly && !pl.fieldedBy) continue;
          if (sticky && !r.half && !r.frozen && !r.returning && to <= (r.to || 0)) continue;   // 先の塁へ伸ばすのは止めない。手前へ戻すのと向きを変えるのだけ待つ
          r.half = false; r.returning = false; r.run = true; r.done = false; if (!(r.startAt > pl.t)) r.startAt = pl.t; r.to = to; r.frozen = false;
          r.decT = pl.t; r.decKey = bkey;
          this.logRun(pl, r, `${['本', '一', '二', '三', '本'][to]}塁へ`, d.why);
        }
        r.coach = d.coach || null; r.slideKind = d.slide || null;
      } else if (d.act === 'back') {
        if (!r.returning && !r.isBatter && r.dist > 0.3 && r.dist < 0.35 * 27.43 && !this.forcedNow(r) && !(r.decT != null && r.decKey === bkey) && !(g.outs + (pl.outs || 0) >= 2)) { r.returning = true;   // 2 アウトは戻らない(フライが捕られれば 3 アウト目で、戻っても意味が無い)   // 2 アウトのゴロ・安打では戻らない   // 戻るのは塁間の 3 分の 1 まで、球の状況が変わった時だけ(行ったり来たりしない)
           r.run = false; r.half = false; r.done = false; r.decT = pl.t; r.decKey = bkey;
           // 打った瞬間に「行く」と決めて、まだ一歩二歩(打って 0.4 秒まで)なら、際どいので最初から行かなかった形にする(行って戻るに数えない)
           const lg = pl.runLog || [], j = lg.length - 1 - [...lg].reverse().findIndex((x) => x.base === r.base && !x.bat && /塁へ$/.test(x.act));
           if (pl.t < pl.contactT + 0.4 && j < lg.length && lg[j] && lg[j].tc < 0.15) { lg[j].act = '止まる'; lg[j].why += ` → 際どいので行かない(${d.why})`; }
           else this.logRun(pl, r, '戻る', d.why); }
      }
    }
  }
  _runnerDecisionsV1(pl) {
    const g = this.g, twoOut = g.outs + (pl.outs || 0) >= 2;
    const late = g.inning >= 7 && Math.abs(g.score.us - g.score.them) <= 1;
    const p = this.ballPos;
    // 打球がどこに行ったか(毎こま見る): 内野を抜けた・外野に落ちた
    const through = !!(pl.batted && !pl.holder && p && (Math.hypot(p.x, p.z) > 40 || pl.flyDropped) && !pl.foulCalled && (!pl.fly || pl.flyDropped));
    const airborne = pl.fly && !pl.flyDropped && !pl.fieldedBy && this.ball && this.ball.path === (pl.batted && pl.batted.path) && p && p.y > 0.4;
    for (const r of this.runners) {
      if (r.out || r.scored || r.isBatter) continue;
      if (airborne && !twoOut) continue;   // フライは捕られるか落ちるかまで待つ
      const L = 27.43, nb = (r.from + 1) % 4, remain = (L - r.dist) / RUN_SPEED;
      const margin = (nb === 0 ? 0.5 : 0.3) - (twoOut ? 0.3 : 0) - (late && nb === 0 ? 0.2 : 0);
      const bt = this.ballToBase(pl, nb);
      // 止まっている走者: 抜けた打球・2 アウトなら次の塁へ(間に合うなら)
      if ((r.done || !r.run) && !r.returning && r.dist < 4) {
        if ((through || (twoOut && !pl.holder)) && bt > remain + margin) { r.run = true; r.done = false; r.half = false; r.to = r.from + 1; r.startAt = pl.t; this.logRun(pl, r, `${['本', '一', '二', '三'][nb]}塁へ`, `抜けた打球: 走者 ${remain.toFixed(1)}秒・送球 ${bt.toFixed(1)}秒`); }
        continue;
      }
      if (!r.run || r.done || r.returning) continue;
      // 走っている: 間に合わないなら(まだ戻れる所なら)戻る。着いたら、次の塁も間に合うか見る
      // 決めた走者は戻らない(はっきりアウトになる時だけ戻る)
      if (bt < remain + margin - 0.6 && r.dist < 0.45 * L && !this.forcedNow(r) && !(r.committed && bt > remain - 0.8) && !(pl.ofHit && r.from === 3 && bt > remain - 0.8)) { r.returning = true; r.run = false; this.logRun(pl, r, '戻る', `間に合わない: 走者 ${remain.toFixed(1)}秒・送球 ${bt.toFixed(1)}秒`); continue; }
      if (r.to === r.from + 1 && r.to < 4 && r.dist > 0.7 * L) {
        const nb2 = (nb + 1) % 4, remain2 = remain + L / RUN_SPEED + 0.3, bt2 = this.ballToBase(pl, nb2);
        const m2 = (nb2 === 0 ? 0.5 : 0.3) - (twoOut ? 0.3 : 0) - (late && nb2 === 0 ? 0.2 : 0);
        if (bt2 > remain2 + m2 && (through || twoOut)) { r.to = r.from + 2; this.logRun(pl, r, `${['本', '一', '二', '三'][nb2]}塁を狙う`, `間に合う: 走者 ${remain2.toFixed(1)}秒・送球 ${bt2.toFixed(1)}秒`); }
      }
    }
  }
  // 走者どうしの決まり: 1 つの塁には 1 人・後ろの走者は前の走者を追い越さない(前の走者が止まっていたら、空くまで進まずに元の塁へ戻る)
  fixRunnerOrder(pl) {
    if (pl.endT != null && this.g && this.g.outs + (pl.outs || 0) >= 3) return;
    const L = 27.43;
    const rs = [this.batterRunner, ...this.runners].filter((r) => r && !r.out && !r.scored);
    const pos = (r) => r.from * L + r.dist;
    rs.sort((a, b) => pos(b) - pos(a));
    // 11/26 持ち主「ランナーが詰まっているのに全速力で走ってアウトになってしまう」: 次の塁に前の走者がいて、その走者が進まない(止まる・戻る)なら、
    // フォースでない後ろの走者は飛び出さずに元の塁へ戻る(前は 1.8 m まで近づいてから戻り、塁間で挟まれてアウトになっていた)
    if (!COVFIX_OFF && pl.phase === 'live' && !pl.hr) {
      for (const t of rs) {
        if (!(t.run && !t.done && !t.returning) || t.dist < 0.3 || !this.jammed(pl, t, rs)) continue;
        t.returning = true; t.run = false; t.half = false; t.to = t.from;
        if (pl.runLog) this.logRun(pl, t, '戻る', '次の塁に前の走者がいて進まない: 飛び出さない');
      }
    }
    for (let i = 1; i < rs.length; i++) {
      const lead = rs[i - 1], t = rs[i];
      const gap = pos(lead) - pos(t);
      if (gap >= 1.8) continue;
      const leadMoving = lead.run && !lead.done && !lead.returning && pl.t >= (lead.startAt || 0);
      const np = Math.max(t.from * L, pos(lead) - 1.8);   // 前の走者の 1.8 m 後ろまで(今いる塁より後ろへは戻さない)
      t.dist = np - t.from * L;
      if (!leadMoving && !(t.isBatter && t.from < 1) && !this.forcedNow(lead)) {   // 一塁に着いた打者走者も、前がふさがっていれば一塁へ戻る
        // 前の走者が塁にとどまっている: 後ろの走者は進めないので元の塁へ戻る
        if (t.dist > 0.3) { t.returning = true; t.run = false; t.half = false; if (pl.runLog) this.logRun(pl, t, '戻る', '前の走者が塁にいる: 空くまで進まない'); }
        else { t.run = false; t.done = true; }
        t.to = t.from;
      }
      if (!leadMoving && this.forcedNow(lead)) {
        // 前の走者がフォース(後ろが詰まっている): 止まらず次の塁へ
        lead.run = true; lead.done = false; lead.returning = false; lead.to = Math.max(lead.to || 0, lead.from + 1); lead.startAt = pl.t;
      }
    }
  }

  // 11/26 この走者の次の塁に前の走者がいて、進まない(フォースでもない)か
  jammed(pl, t, rs) {
    if (COVFIX_OFF || (t.isBatter && t.from < 1) || this.forcedNow(t)) return false;
    const nb = t.from + 1; if (nb >= 4) return false;
    rs = rs || [this.batterRunner, ...this.runners].filter((r) => r && !r.out && !r.scored);
    const lead = rs.find((q) => q !== t && !q.out && !q.scored && q.from === nb && q.dist < 2.0);
    if (!lead) return false;
    const going = lead.run && !lead.done && !lead.returning && (lead.to || 0) > nb;
    if (going || this.forcedNow(lead)) return false;
    if (pl.t < pl.contactT + 0.5 && lead.startAt != null && lead.startAt > pl.t) return false;   // 前の走者がこれから走り出す
    return true;
  }
  // 駆け抜けた打者走者の一塁からの離れ(1.2 秒まで駆け抜け、その後 2.6 m/s で戻る)
  overrunOff(r) {
    if (r.throughT == null) return 0;
    const out = Math.max(0, motionRoot('run_through_1b', 0.25 + Math.min(r.throughT, 0.8))[0] - motionRoot('run_through_1b', 0.25)[0]);
    return r.throughT <= 0.8 ? out : Math.max(0, out - (r.throughT - 0.8) * 4.0);
  }

  // 11/21 この人が一塁で、ベースを踏んだまま伸びて捕る所にいるか(送球の受け手で、立つ所から 0.35 m 以内)
  stretch1(pl, k) {
    const f = pl && pl.first1; if (!f || f.k !== k || !pl.thrown || pl.thrown.base !== 1 || !this.fig[k]) return false;
    const q = this.fig[k].root.position; return Math.hypot(q.x - f.spot.p.x, q.z - f.spot.p.z) < 0.35;
  }
  recvReady(pl) {
    const th = pl.thrown; if (!th || !th.to) return false;
    const R = th.to === 'me' ? this.ctx.player.pos : this.fig[th.to] && this.fig[th.to].root.position;
    if (!R) return false;
    const goal = th.base != null ? BASEP[th.base] : null;
    return !goal || Math.hypot(R.x - goal.x, R.z - goal.z) < 2.5;
  }
  // 打った時の自分の位置から、走るだけで(飛び込まずに)余裕を持って捕れた打球か。そうならファインプレーにしない
  runOnlyReach(pl) {
    if (!pl.batted || !pl.meStart) return false;
    const path = pl.batted.path, h = pl.meStart, R = this.D.reach, v = this.fullSpeed();
    for (let i = 0; i < path.n; i += 2) {
      const x = path.pts[i * 4], y = path.pts[i * 4 + 1], z = path.pts[i * 4 + 2], tt = i * path.dt;
      if (y > 2.3) continue;
      const d = Math.max(0, Math.hypot(x - h.x, z - h.z) - R);
      if (0.3 + this.runTime(d, v) + 0.15 <= tt) return true;
    }
    return false;
  }
  fairReach(pl) {
    if (!pl.batted || pl.foulCalled) return false;
    if (pl._fair != null) return pl._fair;
    const path = pl.batted.path, h = this.homeOf(this.my), R = this.D.reach;
    let ok = false;
    for (let i = 0; i < path.n && !ok; i += 2) {
      const x = path.pts[i * 4], y = path.pts[i * 4 + 1], z = path.pts[i * 4 + 2], tt = i * path.dt;
      if (y > 2.3) continue;
      const d = Math.max(0, Math.hypot(x - h.x, z - h.z) - R + 0.3);
      if (0.6 + this.runTime(d, 6.5) + 0.3 <= tt) ok = true;   // 普通の反応と速さで、余裕を持って届く物だけ「捕れる打球」
    }
    return (pl._fair = ok);
  }
  // 外野へ抜けた球の外野手 3 人の動き(自分が外野手で捕りに行く時も同じ): 捕る人・隣の外野手は捕る人の 8〜15 m 後ろ・フェンスまで転がる球は 2 人で追う・残りの外野手は二塁の後ろ寄りへ
  ofSupport(pl) {
    const b = this.ball, p = this.ballPos;
    if (!b || !p || pl.holder || pl.thrown || Math.hypot(p.x, p.z) < 36 || b.path !== (pl.batted && pl.batted.path)) return;
    const OF = ['LF', 'CF', 'RF'], my = this.my;
    const posOf = (k) => (k === my ? this.ctx.player.pos : this.fig[k].root.position);
    // 捕る人: 自分が外野手でこの球を追っているなら自分、ほかは looseK・打球の担当
    let ck = null;
    if (OF.includes(my) && (pl.opt.fielder === my || pl.loosePick)) ck = my;
    else if (pl.looseK && OF.includes(pl.looseK)) ck = pl.looseK;
    else if (OF.includes(pl.opt.fielder)) ck = pl.opt.fielder;
    if (!ck) ck = this.nearestTo(p, ['P', 'C', '1B', '2B', 'SS', '3B']);
    if (!ck) return;
    const cp = ck === my ? this.interceptFor(posOf(my), b, pl.t, this.fullSpeed()) : (this.fig[ck].target || posOf(ck)).clone();
    const P = b.path, j = (P.n - 1) * 4, end = V(P.pts[j], 0, P.pts[j + 2]);
    const toFence = Math.hypot(end.x, end.z) > 85;
    const others = OF.filter((k) => k !== ck && k !== my && this.fig[k].root.visible)
      .sort((a, c) => Math.hypot(posOf(a).x - cp.x, posOf(a).z - cp.z) - Math.hypot(posOf(c).x - cp.x, posOf(c).z - cp.z));
    const nb = others[0], far = others[1];
    if (nb && !(ck !== my && pl.looseK === nb)) {
      const F = this.fig[nb]; F.chase = null; F.role = 'backup';
      if (toFence) {
        // フェンスまで転がる球は 2 人で追う(隣は球の止まる所の少し手前・横)
        const side = V(-end.z, 0, end.x).normalize().multiplyScalar(Math.sign(posOf(nb).x - end.x || 1) * 4);
        F.target = end.clone().add(side).add(end.clone().normalize().multiplyScalar(-3));
      } else {
        const out = cp.clone().setY(0).normalize();
        F.target = cp.clone().setY(0).add(out.multiplyScalar(11));   // 捕る人の 11 m 後ろ
      }
    }
    if (far && !(ck !== my && pl.looseK === far)) {
      const F = this.fig[far]; F.chase = null; F.role = 'backup';
      const h = this.homeOf(far); F.target = h.clone().lerp(V(0, 0, -52), 0.45);   // 二塁の後ろ寄りへ寄る
    }
  }
  // 落下地点の目印: 自分の場面のフライ・ライナーが空中にある間だけ。落ちるまでの時間で小さく・濃くなる
  markOn() { return false; }   // 11/18 持ち主「落下点は要らない」: 落下点の目印は出さない(覚えた設定に目印ありが残っていても出さない)
  updateLandMark(pl, p) {
    const lm = this.landMark; if (!lm) return;
    const show = this.markOn() && pl && pl.phase === 'live' && !pl.holder && !pl.thrown && pl.batted && this.ball && this.ball.path === pl.batted.path
      && (pl.batted.type === 'fly' || pl.batted.type === 'pop' || pl.batted.type === 'liner' || pl.batted.type === 'fence' || pl.batted.type === 'foulfly') && p.y > 1.0 && pl.opt.fielder === this.my;
    if (!show) { lm.visible = false; return; }
    const path = this.ball.path, tb = pl.t - this.ball.t0;
    let tx = null, tz = null, rem = 0;
    for (let i = Math.max(0, Math.floor(tb / path.dt)); i < path.n; i++) { if (path.pts[i * 4 + 1] < 1.0 && i * path.dt > tb) { tx = path.pts[i * 4]; tz = path.pts[i * 4 + 2]; rem = i * path.dt - tb; break; } }
    if (tx == null) { lm.visible = false; return; }
    if (!lm.visible) lm.position.set(tx, 0, tz);
    lm.position.x += (tx - lm.position.x) * 0.25; lm.position.z += (tz - lm.position.z) * 0.25;   // 風・回転で動く時もなめらかに
    lm.position.y = this.gy(lm.position) + 0.03;
    const k = Math.min(1, rem / 4);
    lm.scale.setScalar(0.75 + 1.0 * k); lm.material.opacity = 0.95 - 0.3 * k; lm.inner.material.opacity = 0.78 - 0.18 * k; lm.edge.material.opacity = 0.8 - 0.3 * k; lm.visible = true;   // 落ちる時が近いほど小さく、はっきり
  }
  // フライが上がっている(打球がまだ空中)
  flyUp() { const pl = this.play; return !!(pl && pl.fly && !pl.thrown && !pl.holder && this.ball && this.ballPos && this.ballPos.y > 1.5 && pl.batted && this.ball.path === pl.batted.path); }
  // オーライ: 自分が捕ると声を出す。捕りに来ていた味方は止まって後ろへ回る。外野手が来ている時に自分が内野手なら、外野手の声が優先
  callBall() {
    const pl = this.play; if (!pl || !this.flyUp() || pl.called) return false;
    const P = this.ctx.player.pos, e = this.landPoint(pl);
    if (!POS[this.my].of) {
      const ofk = ['LF', 'CF', 'RF'].find((k) => k !== this.my && this.fig[k].root.visible && Math.hypot(this.fig[k].root.position.x - e.x, this.fig[k].root.position.z - e.z) < 12 && (pl.opt.fielder === k || pl.looseK === k));
      if (ofk) { this.voiceCall(ofk); pl.called = ofk; return false; }   // 外野手が「オーライ」: 譲る
    }
    pl.called = 'me'; this.voiceCall('me'); this.meCallT = 0.6;
    if (pl.opt.fielder !== this.my) { pl.yieldK = pl.opt.fielder; pl.opt.fielder = this.my; }
    for (const k of Object.keys(POS)) {
      if (k === this.my) continue;
      const F = this.fig[k];
      if (F.chase && F.chase.path === this.ball.path || pl.looseK === k || pl.yieldK === k) {
        F.chase = null; F.noCatchUntil = 99; F.role = 'backup';
        const away = V(e.x, 0, e.z).add(V(e.x, 0, e.z).normalize().multiplyScalar(6));   // 捕る人の後ろ(本塁から見て 6 m 先)
        F.target = away; if (pl.looseK === k) pl.looseK = null;
      }
    }
    if (this.kind === 'game' || this.kind === 'knock') { this.stats.calls = (this.stats.calls || 0) + 1; }
    return true;
  }
  landPoint(pl) {
    const path = this.ball.path, tb = pl.t - this.ball.t0;
    for (let i = Math.max(0, Math.floor(tb / path.dt)); i < path.n; i++) if (path.pts[i * 4 + 1] < 2.0 && i * path.dt > tb) return V(path.pts[i * 4], 0, path.pts[i * 4 + 2]);
    const i = path.n - 1; return V(path.pts[i * 4], 0, path.pts[i * 4 + 2]);
  }
  // 掛け声(音だけ。字は出さない)。音の素材は音の係の 'call_allright'(無ければ鳴らない)
  voiceCall(who) {
    try { this.ctx.sound.sfx(who === 'me' ? 'call_allright' : 'call_allright_mate', { gain: 0.8 }); } catch (e) { /* 無くても動く */ }
    // 片手を上げる(上半身だけ)。自分は自分の選手、味方はその野手
    try { const f = who === 'me' ? this.ctx.meFig && this.ctx.meFig() : this.fig[who]; if (f && f.callMine) f.callMine(); } catch (e) { /* 動きが無くても動く */ }
    (this.callLog = this.callLog || []).push({ who, t: this.play ? +this.play.t.toFixed(2) : null });
  }
  // プレーの途中の文字は出さない(11/17 持ち主「中継!とか書いてたりするのいらない」)。出すのは点数板・プレーの終わりの評価・打つ前の状況・一時停止と結果だけ
  hush() {}

  // 3 つ目のアウト: プレーは終わり(走者を止め、投げる塁は選ばせない)
  thirdOut(pl) {
    if (!this.g || this.g.outs + (pl.outs || 0) < 3 || pl.endT != null) return false;
    for (const r of [this.batterRunner, ...this.runners]) if (r && !r.out) { r.run = false; r.returning = false; r.done = true; }
    pl.choiceOpen = false; pl.aiThinking = true;
    this.finishPlay(pl, null);
    if (pl.endT != null && this.kind !== 'knock') pl.endT = Math.max(pl.endT, 0.45);   // 3 アウト目の「アウト」を一目見せて、すぐチェンジへ(前は 0.8 秒)
    return true;
  }

  // ------------------------------------------------------------ 走者へのタッチと挟殺
  // 走者が塁に触れているか(塁を離れて 0.5 m 以内、または着いて止まっている)
  onBase(r) { return r.dist <= 0.5 || r.dist >= 26.9; }
  holderPos(pl) { return pl.holder === 'me' ? this.ctx.player.pos : pl.holder && this.fig[pl.holder] ? this.fig[pl.holder].root.position : null; }
  watchThrow(pl) {
    const br = this.batterRunner;
    if (!br || br.out || pl.extraBase || !pl.thrown || !this.ball) return;
    if (pl.thrown.base === 0 && br.from === 1 && br.done && !br.run && this.g.outs + pl.outs < 2) {
      pl.extraBase = true; br.run = true; br.done = false; br.to = 2; br.dist = 0; br.startAt = pl.t; br.throughT = null;
      this.logRun(pl, br, '二塁へ', '本塁への送球の間に: 打者走者が二塁へ');
    }
  }
  tagPlay(pl, dt) {
    this.watchThrow(pl);
    if (!pl.holder || this.ball || pl.endT != null || !this.g) return;
    const H = this.holderPos(pl); if (!H) return;
    const who = pl.holder;
    const list = [this.batterRunner, ...this.runners].filter((r) => r && !r.out && !r.scored);
    // 11/23 タッチプレー: 球を持って塁で待つ野手へ、走者はそのまま来る。塁の手前(1.3 m)か野手の手の届く所でタッチしてアウト。
    // 野手が投げた・塁から離れた時は待つのをやめる(走者は今までどおり自分で決める)
    pl.tagWait = null;
    for (const r of list) {
      const TL = r.tagLock; if (!TL) continue;
      const B = BASEP[TL.bi];
      if (pl.holder !== TL.who || Math.hypot(H.x - B.x, H.z - B.z) > 2.5) { r.tagLock = null; if (who !== 'me' && pl.holder === TL.who) pl.aiThinking = false; continue; }
      r.returning = false; r.run = true; r.done = false; r.half = false; r.to = r.from + 1; r.rundown = 0;
      const rp = this.runnerPos(r);
      pl.tagWait = r;
      if (who !== 'me') { const F = this.fig[who]; F.target = null; F.setYawToward(rp.x, rp.z); pl.aiChase = null; pl.aiThinking = true; }
      if (27.43 - r.dist <= 1.3 || Math.hypot(rp.x - H.x, rp.z - H.z) <= TAG_R) { r.tagLock = null; pl.tagWait = null; if (who !== 'me') pl.aiThinking = false; this.tagRunner(pl, r, who); return; }
    }
    for (const r of list) {
      if (r === pl.tagWait) continue;
      const rp = this.runnerPos(r);
      const d = Math.hypot(rp.x - H.x, rp.z - H.z);
      // 触れた: 塁に触れていない走者なら、フォースの場面でもアウト
      if (d <= TAG_R && !this.onBase(r)) { this.tagRunner(pl, r, who); return; }
      // 挟殺: ボールを持った人が走者の行く先の側に近くにいる → 走者は戻る。戻る先の塁に味方がボールを持って来たら、また進む
      if (r.isBatter || this.onBase(r) || d > 9) continue;
      const nxt = BASEP[(r.from + 1) % 4], prv = BASEP[r.from];
      const toN = Math.hypot(H.x - nxt.x, H.z - nxt.z), rN = Math.hypot(rp.x - nxt.x, rp.z - nxt.z);
      const toP = Math.hypot(H.x - prv.x, H.z - prv.z), rP = Math.hypot(rp.x - prv.x, rp.z - prv.z);
      r.rdT = (r.rdT || 0) - dt;
      if (r.rdT > 0) continue;
      if (!r.returning && toN < rN && !this.forcedNow(r)) { r.returning = true; r.run = false; r.half = false; r.rdT = 0.8; r.turnT = 0.4; r.rundown = (r.rundown || 0) + 1; }   // 止まって向きを変える 0.4 秒   // 前をふさがれた → 戻る
      else if (r.returning && toP < rP && (r.rundown || 0) < 4) { r.returning = false; r.run = true; r.done = false; r.to = r.from + 1; r.startAt = pl.t + 0.4; r.rdT = 0.8; r.rundown = (r.rundown || 0) + 1; }   // 戻る先をふさがれた → また進む
    }
    // 自動の野手: ボールを持って塁に触れたら(0.9 m 以内)その塁で判定。フォースの塁が近く(8 m 以内)で走者より先に着けるなら、投げずに踏みに行く
    if (who !== 'me') {
      const F = this.fig[who];
      // 11/21 一塁は足がベースに触れた時(前は体の中心が 0.9 m 以内)
      for (let bi = 0; bi <= 3; bi++) if (bi === 1 ? this.footOn1(F) : Math.hypot(H.x - BASEP[bi].x, H.z - BASEP[bi].z) < 0.9) { this.tagBase(pl, bi, who, pl.aiStep !== bi); if (pl.aiStep === bi) { pl.aiStep = null; pl.aiThinking = false; } }
      if (pl.aiStep == null && !pl.aiThinking) {
        let best = null, bt = 1e9;
        for (const r of list) {
          const heading = r.isBatter ? r.from === 0 : r.run && !r.done;
          if (!heading || !this.forcedNow(r)) continue;
          const b = (r.from + 1) % 4, P = BASEP[b], dd = Math.hypot(H.x - P.x, H.z - P.z);
          if (dd > 8 || (pl.tagged && pl.tagged[b])) continue;
          const mine = this.runTime(dd, VMAX[who] || AI_SPEED), theirs = (27.43 - r.dist) / (r.isBatter ? BATTER_SPEED : RUN_SPEED);
          const leadIn = b === 1 && pl.firstLeadK === who && dd < 5;   // 11/22 走りながら捕った一塁カバーの人は、そのままベースを踏む(間に合ったかは踏んだ時の走者で決まる)
          if ((mine < theirs - 0.1 || leadIn) && mine < bt) { bt = mine; best = b; }
        }
        if (best != null) { pl.aiStep = best; pl.aiThinking = true; F.target = BASEP[best].clone(); }
      }
      let near = null, nd = 7;
      for (const r of list) { if (this.onBase(r) || r.isBatter) continue; const rp = this.runnerPos(r); const d = Math.hypot(rp.x - H.x, rp.z - H.z); if (d < (r.rundown ? 16 : nd) && d < (near ? nd : 99)) { nd = d; near = r; } }   // 挟まれた走者は 16 m まで追う(全力で詰める)
      if (near && pl.aiStep == null && !pl.tagWait && pl.aiCommit !== who) { const rp = this.runnerPos(near); F.target = V(rp.x, 0, rp.z); F.prep = null; pl.aiChase = near; pl.aiThinking = true; }
      else if (pl.aiChase) { pl.aiChase = null; pl.aiThinking = false; F.target = null; }
      if (pl.aiChase && pl.aiChase.rundown) this.rundownAI(pl, pl.aiChase, who, H);
    }
  }
  // 挟殺: 走者が逃げる先の塁と、戻る先の塁の両方に野手を入れ、ボールを持つ人は走者を追い、
  // 走者が塁に近づいたら塁で待つ味方へ短く投げる(1〜2 回で決める)。最後はタッチ
  rundownAI(pl, r, who, H) {
    // 挟殺は brain.js の rundownPlan(docs/判断の組み込み手順.md の 6): 元の塁へ追い返す・受ける人は塁の 3 m 前・走者まで 4 m で投げる・投げた人は列の後ろへ
    if (!pl.rdPlan || pl.rdPlan.who !== who) {
      const fielders = {}; for (const k of Object.keys(POS)) if (k !== this.my && this.fig[k].root.visible && !POS[k].of) fielders[k] = [this.fig[k].root.position.x, this.fig[k].root.position.z];
      try { pl.rdPlan = { who, ...BR.rundownPlan({ between: [r.from, (r.from + 1) % 4], holder: who, fielders, otherRunners: this.runners.some((x) => x !== r && !x.out && x.run && !x.done) }) }; } catch (e) { pl.rdPlan = { who }; }
      const R0 = pl.rdPlan;
      if (R0.recv && this.fig[R0.recv]) { const B = BASEP[R0.driveTo], N = BASEP[R0.driveTo === r.from ? (r.from + 1) % 4 : r.from], d = V(N.x - B.x, 0, N.z - B.z).normalize(); this.fig[R0.recv].target = B.clone().addScaledVector(d, 3); this.fig[R0.recv].role = 'base' + R0.driveTo; }   // 受ける人は塁から走路に沿って 3 m 前へ
      if (R0.backups) R0.backups.forEach((k, i) => { if (this.fig[k]) { const b = i === 0 ? R0.driveTo : (r.from + 1) % 4; this.fig[k].target = BASEP[b].clone(); this.fig[k].role = 'base' + b; } });
    }
    const bases = [r.from, (r.from + 1) % 4];
    for (const b of bases) {
      const P = BASEP[b];
      const hasCover = Object.keys(POS).some((k) => k !== who && k !== this.my && this.fig[k].root.visible && Math.hypot(this.fig[k].root.position.x - P.x, this.fig[k].root.position.z - P.z) < 3.5)
        || (this.my && Math.hypot(this.ctx.player.pos.x - P.x, this.ctx.player.pos.z - P.z) < 3.5);
      if (!hasCover) {   // 空いた塁は近い野手(投手も)が埋める
        const k = this.nearestTo(P, [who, this.my]);
        if (k) { this.fig[k].target = P.clone(); this.fig[k].role = 'base' + b; }
      }
    }
    pl.rdThrowT = (pl.rdThrowT || 0);
    if ((pl.rdThrows || 0) >= 2 || pl.t < pl.rdThrowT) return;
    const fb = r.returning ? r.from : (r.from + 1) % 4, P = BASEP[fb], rp = this.runnerPos(r);
    const rToB = Math.hypot(rp.x - P.x, rp.z - P.z), hToB = Math.hypot(H.x - P.x, H.z - P.z);
    const mate = Object.keys(POS).find((k) => k !== who && k !== this.my && this.fig[k].root.visible && Math.hypot(this.fig[k].root.position.x - P.x, this.fig[k].root.position.z - P.z) < 4.0);
    const rToM = mate ? Math.hypot(rp.x - this.fig[mate].root.position.x, rp.z - this.fig[mate].root.position.z) : 99;
    if (rToM > ((pl.rdPlan && pl.rdPlan.throwWhen) || 4) + 1.5 || rToB < 2 || hToB < rToB + 1.5) return;   // 走者が受け手まで約 4 m・自分は走者の後ろにいる時だけ投げる
    if (!mate) return;
    const F = this.fig[who], to = this.fig[mate].root.position.clone().setY(0);
    const from = F.root.position.clone().add(V(0.2, 1.6, 0));
    const sv = solveThrow(from, to, 20, 1.35);
    const path = predict(this.world, from, sv.v, sv.w, 4, { Cd: 0.35, clScale: 0, dt: DT });
    pl.thrown = { from: who, fromK: who, base: null, to: mate, relayTo: null, eta: pl.t + this.arriveT(path, to) };
    pl.holder = null; this.holderFig = null; pl.aiThinking = false; pl.aiChase = null; pl.overChase = false;
    pl.rdThrows = (pl.rdThrows || 0) + 1; pl.rdThrowT = pl.t + 0.8;
    F.setYawToward(to.x, to.z); F.throwT = 0.35; F.tossTo = false;
    this.launch(path, pl.t);
    this.fig[mate].target = null;
    { const away = P.clone().sub(rp).setY(0).normalize(); F.target = P.clone().addScaledVector(away, 2); F.role = 'base' + fb; }   // 投げた人は受けた側の列の後ろへ
  }
  // 11/22 持ち主「ぼてぼてのゴロの時ファーストが一塁入る事放棄することある。この一塁をベースカバー誰かするように」:
  // 内野のゴロ・バントの間は 0.1 秒ごとに、一塁に入る人を決め直す(打球を捕りに行く人・持った人は外す。操作している自分も外す)。
  // 本物の決まり: 一塁手が打球へ出たら投手が一塁へ(一塁線の内側を平行に走って入る)、投手・捕手・三塁手・二遊間が捕る時は一塁手が戻る、
  // バントで一塁手が前へ出た時は二塁手が入る。決まりの人が間に合わない時は、着くのが早い人(一塁手・投手・二塁手)が入る
  firstCover(pl) {
    const br = this.batterRunner, my = this.my;
    if (!this.g || !br || br.out || br.from >= 1 || !pl.batted || pl.fly || pl.foul || pl.steal || pl.throughK || pl.foulCalled) return;
    if (pl.batted.type !== 'grounder' && pl.batted.type !== 'bunt') return;
    if (pl.thrown && pl.thrown.base === 1) return;   // 一塁へ投げた後は受け手(receiverGo)に任せる
    if (pl.coverSpot && pl.coverSpot.base === 1) return;   // 自分が一塁に入る場面
    if (pl.selfTagK) return;   // 持った人が自分で踏みに行く
    if (pl.releasing || pl.first1 || pl.firstLeadK) return;   // 一塁へ投げると決めた後(投げる動きの間)は受け手を替えない
    const hk = pl.holder === 'me' ? my : pl.holder;
    if (hk && POS[hk] && POS[hk].of) return;
    if (!hk && this.ballPos && !this.inInfield(this.ballPos)) return;
    const busy = new Set(hk ? [hk] : [pl.opt.fielder, pl.looseK]);   // 捕りに行く人・持った人
    if (pl.thrown && pl.thrown.fromK) busy.add(pl.thrown.fromK);
    const f0 = hk || pl.looseK || pl.opt.fielder;
    const fromP = f0 === my ? this.ctx.player.pos : this.fig[f0] ? this.fig[f0].root.position : V(0, 0, -18);
    const S = this.firstSpot(fromP);
    // 操作している自分がもうベースにいれば(自分で戻った)、自分へ投げる
    if (my !== f0 && !busy.has(my) && Math.hypot(this.ctx.player.pos.x - BASEP[1].x, this.ctx.player.pos.z - BASEP[1].z) < 2.0) { this.cover[1] = my; return; }
    const bunt = pl.batted.type === 'bunt', prev = this.cover[1];
    const eta = (k) => {
      const F = this.fig[k], p = F.root.position, dd = Math.hypot(p.x - S.p.x, p.z - S.p.z);
      if (dd < 0.6) return 0;
      const going = (F.spd || 0) > 3 && F.target && Math.hypot(F.target.x - S.p.x, F.target.z - S.p.z) < 3;
      return going ? dd / Math.max(F.spd, 6) : (pl.t < pl.contactT + 0.3 ? REACT : 0.15) + this.runTime(dd, VMAX[k] || AI_SPEED);
    };
    let best = null, bv = 1e9;
    for (const k of ['1B', 'P', '2B']) {
      if (k === my || busy.has(k) || !this.fig[k] || !this.fig[k].root.visible) continue;
      if (k === '2B' && this.cover[2] === '2B' && this.g.bases[0]) continue;   // 併殺の二塁に入る二塁手は一塁へ回さない
      let bonus = k === prev ? 0.4 : 0;   // 入りかけた人は替えない(0.4 秒より早い人がいる時だけ)
      if (f0 === '1B') bonus += k === 'P' ? (bunt ? 0.2 : 0.5) : k === '2B' ? (bunt ? 0.4 : 0.15) : 0;
      else bonus += k === '1B' ? (bunt ? 0.4 : 0.8) : k === '2B' && bunt ? 0.4 : 0;
      const v = eta(k) - bonus;
      if (v < bv) { bv = v; best = k; }
    }
    if (!best) return;
    if (prev && prev !== best && prev !== my && !busy.has(prev) && this.fig[prev] && this.fig[prev].role === 'base1') {
      // 替わった人は、一塁の後ろ(二塁手)・マウンドの前(投手)・一塁の手前(一塁手)へ
      const G = this.fig[prev];
      G.target = prev === '2B' ? V(BASEP[1].x - 4, 0, BASEP[1].z - 6) : prev === 'P' ? V(0, 0, -15.5) : BASEP[1].clone().add(V(-3, 0, 2));
      G.role = prev === '2B' ? 'backup' : 'hold';
    }
    this.cover[1] = best;
    const F = this.fig[best];
    F.chase = null; F.role = 'base1';
    if (pl.first1 && pl.first1.k === best) return;
    const T = S.p.clone(); T.snap = true;
    if (!F.target || Math.hypot(F.target.x - T.x, F.target.z - T.z) > 0.3 || !F.target.snap) {
      // 投手は一塁線の内側を平行に走ってベースへ(ベースの 3 m 手前・内野側 1.2 m を通る。走者とぶつからない)
      const fp = F.root.position, W = BASEP[1].clone().addScaledVector(RUN1.clone().normalize(), -3).addScaledVector(IN1, 1.2);
      if (best === 'P' && Math.hypot(fp.x - BASEP[1].x, fp.z - BASEP[1].z) > Math.hypot(W.x - BASEP[1].x, W.z - BASEP[1].z) + 1.5) T.via = W;
      F.target = T;
    }
  }
  // 11/22 自分(一塁手)が一塁へ投げる時: カバーの人より自分の方がベースに近い(15 m まで)なら、投げずに自分で踏みに行く(本物の一塁手もそうする)
  selfFirst() {
    if (this.my !== '1B') return false;
    const pl = this.play;
    if (pl && pl.sf && pl.sf.t === pl.caughtT) return pl.sf.v;   // 捕った時に 1 回決める(案内が途中で替わらない)
    const P = this.ctx.player.pos, dm = Math.hypot(P.x - BASEP[1].x, P.z - BASEP[1].z);
    const ck = this.cover && this.cover[1];
    let v;
    if (dm >= 15) v = false;
    else if (!ck || ck === this.my || !this.fig[ck]) v = true;
    else { const F = this.fig[ck].root.position; v = Math.hypot(F.x - BASEP[1].x, F.z - BASEP[1].z) > dm + 1.0; }
    if (pl && pl.holder === 'me') pl.sf = { t: pl.caughtT, v };
    return v;
  }
  // 11/22 一塁へ走って入るカバーの人への送球: 球が先に着くなら緩めて(トス、15 m/s まで)着く時に合わせる。
  // それでも早ければ、ベースへ走る道の上(手前)で捕らせて、捕ってからそのまま踏む
  firstLead(pl, rk, from, to, speed) {
    const F = this.fig[rk];
    if (!F || !pl.first1 || pl.first1.k !== rk) return { to, speed };
    const S = pl.first1.spot, p = F.root.position, dd = Math.hypot(p.x - S.p.x, p.z - S.p.z);
    if (dd < 0.5) return { to, speed };
    const v = Math.max(F.spd || 0, 5.5), mv = (F.spd || 0) > 3;
    const tr = (x) => (mv ? x / v : REACT + this.runTime(x, VMAX[rk] || AI_SPEED));
    const dist = Math.hypot(to.x - from.x, to.z - from.z), MIN = 15, eta = tr(dd) + 0.05;
    if (dist / speed >= eta) return { to, speed };
    if (dist / MIN >= eta) return { to, speed: Math.max(MIN, dist / eta) };
    let q = null;
    for (let u = 0.9; u >= 0; u -= 0.05) {
      const x = p.x + (S.p.x - p.x) * u, z = p.z + (S.p.z - p.z) * u;
      if (Math.hypot(x - from.x, z - from.z) / MIN >= tr(dd * u)) { q = V(x, 0, z); break; }
    }
    if (!q) q = V(p.x, 0, p.z);
    pl.first1 = null;   // ベースで伸びて待つのでなく、走りながら捕る
    pl.firstLeadK = rk; pl.firstLeadSpot = S.p.clone();
    return { to: q, speed: MIN, lead: true };
  }
  // 誰も持っていないボールには、必ず一番早く着ける野手が向かう(打球・それた送球・こぼれた球・止まった球)。もう 1 人は後ろへ
  ensureChaser(pl) {
    const b = this.ball, p = this.ballPos; if (!b || !p || pl.holder || p.y > 1.2) return;
    if (pl.thrown && pl.thrown.eta != null && pl.t < pl.thrown.eta + 0.15) return;   // 送球の途中は受け手に任せる
    const me = this.ctx.player.pos;
    const near = (k) => { const F = this.fig[k]; const T = F.target; return T && Math.hypot(T.x - p.x, T.z - p.z) < 3.5 && (F.spd || 0) > 0.3 || Math.hypot(F.root.position.x - p.x, F.root.position.z - p.z) < 2; };
    const fk = pl.opt.fielder;
    // 11/28 夕 遊んだ人「ショートでやっている時に、弱いゴロだとピッチャーが捕球してミスになることがある」: 自分の打球を CPU(投手など)が追い始めた後でも、
    //   自分が追いついて その人と同じくらい(+0.3 秒まで)に届くなら、CPU は追うのをやめて元の場所(塁に入る人は塁)へ戻る。?oldweakp=1 で前の形
    if (!OLDWEAKP && fk === this.my && !pl.thrown && pl.looseK && pl.looseK !== this.my && this.fig[pl.looseK] && !POS[this.my].of && this.inInfield(p)) {
      const tb = pl.t - b.t0, k0 = pl.looseK, F0 = this.fig[k0], tm = this.reachT(b.path, me, this.fullSpeed(), tb), tk = this.reachT(b.path, F0.root.position, VMAX[k0] || AI_SPEED, tb);
      if (tm < pathDuration(b.path) + 3 && tm <= tk + 0.3 && Math.hypot(F0.root.position.x - p.x, F0.root.position.z - p.z) > 1.6) {
        F0.chase = null; F0.target = k0 === '1B' ? BASEP[1].clone().add(V(-0.6, 0, -0.4)) : this.homeOf(k0); if (F0.role === 'field') F0.role = k0 === '1B' ? 'base1' : null;
        pl.looseK = null; pl.weakYield = (pl.weakYield || 0) + 1; return;
      }
    }
    if (pl.looseK && this.fig[pl.looseK] && near(pl.looseK)) return;
    if (!pl.thrown && fk !== this.my && this.fig[fk] && this.fig[fk].chase && this.fig[fk].chase.path === b.path) {
      // 打球を追う人がまだ間に合う(ボールが追う点の手前)なら任せる
      const C = this.fig[fk].chase.pt, F = this.fig[fk].root.position;
      if (Math.hypot(p.x, p.z) < Math.hypot(C.x, C.z) + 1.5 || Math.hypot(F.x - p.x, F.z - p.z) < 3) return;
    }
    if (fk === this.my && !pl.thrown && Math.hypot(me.x - p.x, me.z - p.z) < 6) return;   // 自分が追っている
    if (fk === this.my && !pl.thrown && POS[this.my].of) {
      // 外野へ抜けて止まる球は、自分(外野手)が追っている間は任せる(止まる所が本塁から 36 m 超・自分から 30 m 以内)
      const P = b.path, j = (P.n - 1) * 4, ex = P.pts[j], ez = P.pts[j + 2];
      if (Math.hypot(ex, ez) > 36 && Math.hypot(me.x - ex, me.z - ez) < 30) return;
    }
    const speedish = b.path.events.some((e) => (e.type === 'roll' || e.type === 'stop' || e.type === 'bounce') && e.t <= pl.t - b.t0);
    if (!speedish && !pl.thrown) return;   // まだ飛んでいる打球は、捕りに行く人に任せる
    // 11/21 自分の打球(前へ突っ込むボテボテ・チョッパー)は、自分が一番早い人より 0.5 秒遅いまでに届くなら、投手・捕手たちに取らせない
    // (打球の種類を増やした時、ノックで二塁・遊撃の前の弱いゴロを投手が全部捕っていた)。自分が追わずに間に合わなくなれば、前のとおり一番早い人が行く
    if (fk === this.my && !pl.thrown && !POS[this.my].of && this.inInfield(p)) {
      const tb = pl.t - b.t0, tm = this.reachT(b.path, me, this.fullSpeed(), tb);
      if (tm < pathDuration(b.path)) {
        let best = 1e9;
        for (const q of ['P', 'C', '1B', '3B', '2B', 'SS']) if (q !== this.my && this.fig[q] && this.fig[q].root.visible) best = Math.min(best, this.reachT(b.path, this.fig[q].root.position, VMAX[q] || AI_SPEED, tb));
        if (tm <= best + (this.my === '1B' && p.x > 2 ? 1.0 : OLDWEAKP ? 0.5 : 0.8)) return;   // 11/28 夕 0.5 → 0.8 秒(人は動き出しが自動の野手より遅い)   // 11/22 一塁側の球を自分(一塁手)が追う時は、投手は捕りに来ずに一塁へ入る(1.0 秒まで任せる)
      }
    }
    let k = this.looseTo(p, [this.my]);
    if (!k) return;
    // 11/20 内野の球は、近い人より早く届く人(走っている向き・速さを入れた時刻で)。投手・捕手・一塁手・三塁手も比べる
    if (this.inInfield(p) && !pl.thrown) {
      const cur = pl.looseK && this.fig[pl.looseK] && !POS[pl.looseK].of ? pl.looseK : null;
      if (cur && cur !== this.my) k = cur;
      const tb = pl.t - b.t0, T = (q) => this.reachT(b.path, this.fig[q].root.position, VMAX[q] || AI_SPEED, tb) - (q === cur ? 0.5 : q === k ? 0.15 : 0);   // 追い始めた人は替えない(0.5 秒より早い人がいる時だけ)
      const covering = (q) => /^base/.test(this.fig[q].role || '') || (Object.values(this.cover || {}).includes(q) && this.fig[q].role !== 'field');   // 塁に入る人は塁を空けない(looseTo と同じ)
      for (const q of ['P', 'C', '1B', '3B', '2B', 'SS']) if (q !== this.my && q !== k && this.fig[q] && this.fig[q].root.visible && !POS[q].of && !covering(q) && T(q) < T(k)) k = q;
    }
    const F = this.fig[k]; F.role = 'field'; F.noCatchUntil = 0;
    const tg = this.interceptFor(F.root.position, b, pl.t, VMAX[k] || AI_SPEED); F.target = tg; F.chase = { pt: tg, at: pl.t, path: b.path };
    pl.looseK = k; pl.looseNext = pl.t + 0.2;
    const k2 = this.nearestTo(p, [this.my, k, 'C', '1B', '2B', 'SS', '3B', ...(this.inInfield(p) ? ['P'] : [])]);   // 後ろへ回るのは外野手(内野手は塁を空けない)。11/20 前は投手を外す条件が逆で、捕りに行く投手(k)まで「後ろへ」に戻していた
    if (k2 && Math.hypot(this.fig[k2].root.position.x - p.x, this.fig[k2].root.position.z - p.z) < 30) { const back = tg.clone().add(tg.clone().setY(0).normalize().multiplyScalar(8)); this.fig[k2].target = back; this.fig[k2].role = 'backup'; }
  }
  tagRunner(pl, r, who) {
    const c = this.ctx;
    r.out = true; r.run = false; r.done = true; r.returning = false;
    if (r.fig) r.fig.set('stand');
    pl.outs++; pl.tagOut = who; pl.lastOutForce = false;
    if (pl.aiChase === r) { pl.aiChase = null; pl.aiThinking = false; }
    // 近い塁の審判がコール
    const rp = this.runnerPos(r);
    let bi = 0, bd = 1e9; for (let i = 0; i < 4; i++) { const d = Math.hypot(BASEP[i].x - rp.x, BASEP[i].z - rp.z); if (d < bd) { bd = d; bi = i; } }
    this.hush('アウト!', 'タッチ', { big: true, ms: 1100 });
    c.sound.crowdEvent(pl.outs >= 2 ? 'dp' : 'out', 0.6);
    this.umpCall('out', bi);
    if (this.kind === 'game') this.say('tag_out', { maxWait: 1 });
    // タッチの動き(グラブを下ろして触る「tag」の 0.47 秒が今)
    const prep = { clip: 'tag', start: 0.4, id: (this._prepId = (this._prepId || 0) + 1), until: pl.t + 0.6, path: null, who };
    if (who === 'me') { this.prep = prep; this.stats.outs++; }
    else { this.fig[who].prep = prep; this.fig[who].setYawToward(rp.x, rp.z); }
    this.thirdOut(pl);
  }
  // 抜けた打球の担当: 外野手(と、外野の自分)で、ボールに一番早く着く人。中堅は少し優先。もう一人はその後ろへバックアップ
  throughBall(pl) {
    pl.throughK = true; pl.throughAt = pl.t;
    const c = this.ctx, b = this.ball, tb = pl.t - b.t0;
    const timeTo = (from, vmax) => {
      for (let tt = Math.max(0, tb); tt < pathDuration(b.path); tt += 0.05) {
        const q = samplePath(b.path, tt, V()); if (q.y > 2.4) continue;
        const need = this.runTime(Math.hypot(q.x - from.x, q.z - from.z), vmax);
        if (need <= tt - tb + 0.1) return { t: tt - tb, pt: V(q.x, 0, q.z) };
      }
      const e = samplePath(b.path, pathDuration(b.path), V());
      return { t: pathDuration(b.path) - tb + this.runTime(Math.hypot(e.x - from.x, e.z - from.z), vmax), pt: V(e.x, 0, e.z) };
    };
    const cand = [];
    for (const k of ['LF', 'CF', 'RF']) {
      if (k === this.my) cand.push({ k: 'me', ...timeTo(c.player.pos, this.fullSpeed()) });
      else if (this.fig[k].root.visible) cand.push({ k, ...timeTo(this.fig[k].root.position, VMAX[k] || AI_SPEED) });
    }
    if (!cand.length) return;
    cand.sort((a, b2) => (a.t - (a.k === 'CF' ? 0.4 : 0)) - (b2.t - (b2.k === 'CF' ? 0.4 : 0)));
    const best = cand[0];
    const ai = best.k === 'me' ? cand.find((x) => x.k !== 'me') : best;
    // 元の内野手は追うのをやめて守備位置(中継・塁)へ
    const ifk = pl.opt.fielder;
    if (ifk && ifk !== this.my && !POS[ifk].of && this.fig[ifk]) {
      const F1 = this.fig[ifk]; F1.chase = null;
      // 11/20 持ち主「ライト前にボール転がった際にファーストが離れてライトゴロにならない」: 一塁手は一塁へ戻って外野からの送球を待つ(ライトゴロを狙える)
      if (ifk === '1B') { F1.target = BASEP[1].clone().add(V(-0.6, 0, -0.4)); F1.role = 'base1'; if (this.cover) this.cover[1] = '1B'; }
      else F1.target = F1.role === 'cut' ? null : this.homeOf(ifk);
      if (F1.role === 'field') F1.role = null;
    }
    if (best.k !== 'me') {
      const F = this.fig[best.k];
      F.role = 'field'; F.noCatchUntil = 0; F.target = best.pt; F.chase = { pt: best.pt, at: pl.t, path: b.path };
      pl.looseK = best.k; pl.looseNext = pl.t + 0.2;
    }
    // バックアップ: 捕る人の後ろ(本塁から見て 8 m 先)
    const other = cand.find((x) => x.k !== best.k && x.k !== 'me');
    if (other && ai) {
      const back = best.pt.clone().add(best.pt.clone().setY(0).normalize().multiplyScalar(8));
      const F2 = this.fig[other.k]; F2.target = back; F2.role = 'backup';
      if (best.k === 'me' && ai.k === other.k) { /* 自分が捕る時は、近い外野手が後ろへ */ }
    }
  }
  inInfield(p) { return Math.hypot(p.x, p.z + 19) < 33 || p.z > -6; }
  // 11/27 ゴロが内野手の間を本当に抜けたか(実況の「抜けた!」に使う): 止まる所が本塁から 44 m より先で、内野手(自分が内野手なら自分も)が球から 4 m より遠い
  passedInfield(path, p) {
    const j = (path.n - 1) * 4; if (Math.hypot(path.pts[j], path.pts[j + 2]) < 44) return false;
    for (const k of ['P', 'C', '1B', '2B', '3B', 'SS']) {
      const q = k === this.my ? this.ctx.player.pos : this.fig[k] && this.fig[k].root.visible ? this.fig[k].root.position : null;
      if (q && Math.hypot(q.x - p.x, q.z - p.z) < 4) return false;
    }
    return true;
  }
  // 外野にある球は外野手だけが拾う(内野手は内野にある球だけ)
  looseTo(p, skip = []) {
    if (this.inInfield(p)) {
      // 塁に入っている人(一塁手の一塁など)は、ほかに 5 m 以内で近い人がいれば追わない(塁を空けない)
      const covering = Object.keys(POS).filter((k) => /^base/.test(this.fig[k].role || '') || Object.values(this.cover || {}).includes(k) && this.fig[k].role !== 'field');
      const k0 = this.nearestTo(p, skip), k1 = this.nearestTo(p, [...skip, ...covering]);
      if (k0 && k1 && k0 !== k1 && covering.includes(k0)) {
        const dd = (q) => Math.hypot(this.fig[q].root.position.x - p.x, this.fig[q].root.position.z - p.z);
        if (dd(k1) < dd(k0) + 5) return k1;
      }
      return k0;
    }
    return this.nearestTo(p, [...skip, 'P', 'C', '1B', '2B', 'SS', '3B']) || this.nearestTo(p, skip);
  }
  // 球が外野にある間の内野の動き(本物どおり): 一塁手は一塁・三塁手は三塁・捕手は本塁。
  // 左側は遊撃手、右側は二塁手が中継に出て、もう一人は二塁へ。投手は三塁か本塁の後ろへ。外野の球は追わない
  ofCover(pl) {
    const p = this.ballPos; if (!p || !this.g) return;
    const hk = pl.holder === 'me' ? this.my : pl.holder;
    const inOF = hk ? POS[hk] && POS[hk].of && !this.inInfield(hk === this.my ? this.ctx.player.pos : this.fig[hk].root.position)
      : (!this.inInfield(p) && !(pl.thrown && pl.thrown.to && !POS[pl.thrown.to === 'me' ? this.my : pl.thrown.to]?.of));
    if (!inOF) return;
    if (this.bplan && this.play && this.play.batted) {
      // brain.js の割り当てを、今の球の所で決め直す(中継とバックアップが球について動く)。外野手(捕る人・隣)は ofSupport が動かす
      let A = null;
      // 11/20 割り当ての「捕る人」は外野で球を拾う外野手(内野を抜けた球で内野手のままだと、その内野手が外野の球へ向かっていた)
      let zk = this.bplanZone || pl.opt.fielder;
      if (!POS[zk] || !POS[zk].of) zk = pl.looseK && POS[pl.looseK] && POS[pl.looseK].of ? pl.looseK : (hk && POS[hk] && POS[hk].of ? hk : (this.nearestTo(p, ['P', 'C', '1B', '2B', 'SS', '3B']) || 'CF'));
      try { A = BR.defenseAssign({ type: this.play.batted.type === 'fly' && !pl.flyDropped ? 'fly' : 'liner', zone: zk, hit: true, gap: this.bplanGap || null, bases: this.g.bases, outs: this.g.outs, hand: this.g.hand, ballPos: [p.x, p.z] }); } catch (e) { A = null; }
      if (A) {
        for (const [k, a] of Object.entries(A)) {
          if (k === this.my || POS[k].of || !this.fig[k] || pl.holder === k || pl.looseK === k || !a.to || a.role === 'field') continue;
          if (a.role === 'cut' && pl.holder) continue;   // 外野手が持ったら中継は止まって構える
          const F = this.fig[k]; F.chase = null; F.target = V(a.to[0], 0, a.to[1]); F.role = a.role === 'base' ? 'base' + a.base : a.role;
          if (a.role === 'cut' && !this.cutoffK) this.cutoffK = k;
        }
        const cutK = Object.entries(A).find(([, a]) => a.role === 'cut');
        if (cutK && cutK[0] !== this.my) this.cutoffK = cutK[0];
        return;
      }
    }
    const rs = [this.batterRunner, ...this.runners].filter((r) => r && !r.out && !r.scored);
    const lead = rs.reduce((m, r) => Math.max(m, Math.min(4, (r.to || r.from) + (r.run && !r.done ? 0 : 1))), 1);
    const tb = lead >= 4 ? 0 : Math.max(2, lead);   // 中継が向く塁(先の走者の次の塁)
    const left = p.x < -3;
    // 本塁への返球の中継は、左翼側は三塁手・中堅と右翼側は一塁手(空いた塁は遊撃手・二塁手が埋める)。二・三塁へは遊撃手か二塁手
    let cut, cover = {};
    if (tb === 0) {
      cut = p.x < -12 ? '3B' : '1B';
      if (cut === '3B') cover = { '1B': 1, 'SS': 3, '2B': 2 }; else cover = { '3B': 3, '2B': 1, 'SS': 2 };
    } else {
      cut = this.cutoffK === 'SS' || this.cutoffK === '2B' ? this.cutoffK : (left ? 'SS' : '2B');
      cover = { '1B': 1, '3B': 3, [cut === 'SS' ? '2B' : 'SS']: 2 };
    }
    const set = (k, v, role) => {
      if (k === this.my || !this.fig[k] || !this.fig[k].root.visible || pl.holder === k) return;
      const F = this.fig[k]; F.chase = null; F.target = v; F.role = role;
      if (pl.looseK === k) pl.looseK = null;
    };
    const spot = { 1: BASEP[1].clone().add(V(-0.6, 0, -0.4)), 2: BASEP[2].clone().add(V(0, 0, 0.6)), 3: BASEP[3].clone().add(V(0.6, 0, -0.4)) };
    for (const [k, b] of Object.entries(cover)) set(k, spot[b], 'base');
    set('C', HOME_RECV.clone(), 'base');
    // 中継: 球と向く塁を結ぶ線の上、塁から 40% (最大 30 m)
    const goal = BASEP[tb], dx = p.x - goal.x, dz = p.z - goal.z, dl = Math.hypot(dx, dz) || 1;
    const cd = Math.min(30, Math.max(8, dl * 0.45));
    if (!pl.holder) set(cut, V(goal.x + dx / dl * cd, 0, goal.z + dz / dl * cd), 'cut');   // 外野手が持ったら中継は止まって構える
    if (cut !== this.my) this.cutoffK = cut;
    // 投手: 向く塁の後ろ(本塁なら本塁の後ろ、二・三塁なら三塁の後ろ)
    const bk = tb === 0 ? V(0, 0, 9) : tb === 3 ? BASEP[3].clone().add(V(-6, 0, 6)) : V(0, 0, -27);   // 二塁へ向く時はマウンドと二塁の間
    set('P', bk, 'backup');
  }
  nearestTo(p, skip = []) {
    let best = null, bd = 1e9;
    for (const k of Object.keys(POS)) {
      if (skip.includes(k) || !this.fig[k].root.visible) continue;
      const d = Math.hypot(this.fig[k].root.position.x - p.x, this.fig[k].root.position.z - p.z);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  anyMoving() { return [this.batterRunner, ...this.runners].some((r) => r && !r.out && !r.scored && ((r.run && !r.done && !(r.half && r.dist >= (r.halfDist ?? HALF))) || r.returning)); }
  // その塁に、送球より先に入れる味方がいるか(自分を含む)
  canCover(b, fromK, tt) {
    const rk = this.cover[b];
    const P = BASEP[b];
    // 11/28 持ち主「ベースカバー入っているのにキャッチャーが投げてこない」: 役目の人が別でも、自分(プレイヤー)が塁に着いている(2 m 以内)ならカバーとして認める
    if (!HOMEFIX_OFF && this.my !== fromK && !this.watching && this.ctx.player && Math.hypot(this.ctx.player.pos.x - P.x, this.ctx.player.pos.z - P.z) < 2.0) return true;
    if (rk === this.my) return Math.hypot(this.ctx.player.pos.x - P.x, this.ctx.player.pos.z - P.z) / this.fullSpeed() < tt + 0.15;   // 自分は自動で塁へ走る
    if (!rk || rk === fromK || !this.fig[rk]) return false;
    const fp = this.fig[rk].root.position;
    const dd = Math.hypot(fp.x - P.x, fp.z - P.z), F = this.fig[rk];
    const need = dd < 1.5 ? 0 : (F.spd || 0) > 3 ? dd / Math.max(F.spd, 5) : REACT + this.runTime(dd, VMAX[rk] || AI_SPEED);   // 走っている人は今の速さで
    return need < tt + 0.15;
  }
  runTime(d, vmax) { const da = vmax * vmax / (2 * ACC); return d < da ? Math.sqrt(2 * d / ACC) : vmax / ACC + (d - da) / vmax; }
  interceptFor(from, ball, now, vmax = AI_SPEED, minT = 0, reach = 0, react = REACT) {
    const path = ball.path;
    const tb = now - ball.t0;
    for (let tt = Math.max(0, tb, minT); tt < pathDuration(path); tt += 0.05) {
      const q = samplePath(path, tt, V());
      if (q.y > 2.4) continue;
      const need = react + this.runTime(Math.max(0, Math.hypot(q.x - from.x, q.z - from.z) - reach), vmax);
      if (need <= tt - tb + 0.1) return V(q.x, 0, q.z);
    }
    const e = samplePath(path, pathDuration(path), V());
    return V(e.x, 0, e.z);
  }
  tryCatch(pl, p, tt) {
    // 観戦の時、グラウンドに降りた自分(乱入した守備の人)が先に捕れる(watch.js の intrGrab。捕ったら 'me' として投げる・踏む・タッチする)
    if (this.intruder && !pl.thrown && !pl.holder) { try { if (this.intruder.grab(pl, p, tt)) { this.onCatch(pl, 'me', p, tt); return true; } } catch (e) { /* 観戦の側の誤りで試合を止めない */ } }
    const c = this.ctx;
    const me = c.player.pos;
    const reach = this.D.reach;
    // 11/25 落球(dropBall)した球は、地面に落ちるまで誰も捕らない(落とした球を宙で拾い直してアウトにしない)
    const dropAir = pl.dropped && this.ball && pl.batted && this.ball.path === pl.batted.path && !this.ball.path.events.some((e) => e.type !== 'stop' && e.t <= tt);
    if (dropAir) return false;
    // 11/25 自分が捕手: 打った直後(0.3 秒)の球は捕らない(打つ所が体から 1.35 m で、バントや当たり損ねをバットの所で捕ってアウトにしていた)
    // バントは地面すれすれ(0.6 m 未満)を宙で捕らない(跳ねる前に低い所で捕って「捕手フライ」のアウトになっていた)
    const cJust = this.my === 'C' && !this.watching && !pl.thrown && pl.batted && this.ball && this.ball.path === pl.batted.path
      && (tt < 0.3 || (pl.batted.type === 'bunt' && p.y < 0.6 && !this.ball.path.events.some((e) => e.type !== 'stop' && e.t <= tt)));
    if (!pl.myLock && !cJust) {
      const h = this.myReachHit(p);
      if (h) {
        const intended = !pl.thrown || pl.thrown.to === 'me';
        if (intended || h.dh < reach * 0.8) { pl.myReach = h.dh / reach; pl.special = h.how && h.hard ? h.how : null; pl.action = h.how; this.onCatch(pl, 'me', p, tt); return true; }
      }
    }
    for (const k of Object.keys(POS)) {
      if (k === this.my) continue;
      const F = this.fig[k];
      if (!F.root.visible) continue;
      if (pl.thrown && pl.thrown.fromK === k && tt < 0.4) continue;
      if (pl.thrown && pl.thrown.to && pl.thrown.to !== k && pl.thrown.eta != null && pl.t < pl.thrown.eta + 0.2 && !pl.overChase && (this.recvReady(pl) || (pl.firstLeadK && pl.thrown.to === pl.firstLeadK))) continue;   // 受け手が塁にいる時は受け手に任せる(11/22 走って一塁に入る人へのトスも、途中の人は捕らない)
      const fp = F.root.position;
      const dh = Math.hypot(p.x - fp.x, p.z - fp.z), hb = p.y - fp.y;
      let Rr = k === pl.looseK ? (k === pl.flyK && !pl.thrown ? this.D.ai : 2.0) : pl.thrown || pl.loosePick ? 1.6 : (k === pl.opt.fielder ? this.D.ai : 0.0);
      if (this.stretch1(pl, k)) Rr = 1.15;   // 11/21 一塁でベースを踏んで伸びて捕る人: 球が伸ばしたグラブ(体の前 1.05 m)に来た時に捕る(前は 1.6 m 手前で捕っていた)
      if (F.noCatchUntil && !pl.thrown && this.ball && !this.ball.path.events.some((e) => e.type !== 'stop' && e.t < tt - 0.25)) Rr = 0;
      // 11/28 CPU の野手も、バントの地面すれすれ(0.6 m 未満)を跳ねる前に宙で捕らない。打った直後 0.3 秒(バットの所)も捕らない(捕手が宙で捕って「捕手フライ」の 1 アウトで終わり、送球が出なかった)。自分が捕手の時(11/25)と同じ
      if (!HOMEFIX_OFF && !pl.thrown && pl.batted && pl.batted.type === 'bunt' && this.ball && this.ball.path === pl.batted.path && (tt < 0.3 || p.y < 0.6) && !this.ball.path.events.some((e) => e.type !== 'stop' && e.t <= tt)) Rr = 0;
      if (Rr > 0 && dh < Rr && hb > -0.45 && hb < 2.5) { this.onCatch(pl, k, p, tt); return true; }   // 11/20 下は -0.1 → -0.45: マウンドの高さ(約 0.25 m)に立ったままの投手が、マウンドの裾で止まった球の上に立って拾えずにいた
    }
    return false;
  }

  onCatch(pl, who, p, tt) {
    const c = this.ctx;
    const firstTouch = !pl.thrown;
    // 11/28 夕 自分の打球を、自分が触れる前に(グラブの届く 9 割まで来ていない)ほかの野手が先に捕った: 自分の担当でなかった打球として、評価のミス・UZR の機会に数えない(?oldweakp=1 で前の形)
    if (!OLDWEAKP && firstTouch && who !== 'me' && !pl.holder && pl.opt.fielder === this.my && !((pl.myMin ?? 99) < this.D.reach * 0.9)) { pl.notMine = who; if (who === 'P' || who === 'C') pl.cpuTook = who; }
    // 11/27 持ち主「外野に抜けたゴロを取りに行くと謎アウトになることがある」: 止まった球(ballDead)は道筋を作り直すので、拾い直した最初のこま(tt 0)には
    // 地面に着いた印が無く「直接捕った」扱いで打者アウトになっていた。打球の道筋そのもので、地面に着く前に捕った時だけ直接捕球にする(?oldpick=1 で前の形)
    const onFly = firstTouch && !pl.dropped && this.ball && (OLDPICK || (!pl.groundStop && pl.batted && this.ball.path === pl.batted.path)) && !this.ball.path.events.some((e) => (e.type === 'bounce' || e.type === 'roll' || e.type === 'wall') && e.t <= tt);   // 11/25 落とした球を拾い直したのはアウトでない
    this.ball = null;
    pl.holder = who;
    this.holderFig = who === 'me' ? 'me' : this.fig[who];
    this.shadow.visible = false;
    if (who === 'me' && c.sound.mittMine) c.sound.mittMine(); else c.sound.mitt(who === 'me' ? null : this.fig[who].root.position);
    if (who === 'me') this.catchFx = { t: 0, p: p.clone() };   // 11/22 夜 捕った手ごたえ(main.js の updateCatchFx: 画面が少し揺れる・一人称は球が手前で一瞬止まって見える)
    if (who === 'me' && this.prep) this.prep.until = Math.min(this.prep.until, pl.t + 0.45);
    if (who !== 'me' && this.fig[who].prep) { const pr = this.fig[who].prep; pr.until = Math.min(pr.until, pl.t + (pr.rel ? pr.rel - pr.ct + 0.4 : 0.45)); pr.catchAt = pl.t; }
    if (who !== 'me') this.fig[who]._grPick = firstTouch && !onFly && POS[who].of ? pl.t : null;   // 11/25 外野手が地面の球を拾った(aiDecide の送球までの間)
    if (who !== 'me' && !this.fig[who].prep) { const F = this.fig[who]; F.catchT = 0.4; F.catchH = Math.max(-1, Math.min(1, (p.y - F.root.position.y - 1.1) / 0.9)); }
    pl.caughtT = pl.t;
    if (pl.thrown) pl.thrown.caughtT = pl.t;
    if (who === 'me') this.meAnim = { kind: 'catch', t: 0.3, dur: 0.3, h: Math.max(-1, Math.min(1, (p.y - 1.1) / 0.9)) };
    // 一・三塁の手前で、跳ねた球をファウルの所で触った → ファウル(フライを直接捕ったのはアウト)
    if (firstTouch && !onFly && !pl.fairKnown && pl.batted && !isFair(p.x, p.z)) { pl.fairKnown = true; pl.fieldedBy = null; this.foulCall(pl); return; }
    if (firstTouch) pl.fairKnown = true;
    if (firstTouch && who === 'me' && !this.watching && !this.tut && !pl.dropped) mkEv('def_catch');   // 11/22 目標(js/mokuhyo_data.js)
    if (firstTouch && who === 'me' && !pl.dropped) { this.stats.caught++; this.stats.streak++; this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak); }
    if (firstTouch) pl.fieldedBy = who;
    if (firstTouch && who === 'me') { const h = this.homeOf(this.my), P = c.player.pos, l = Math.hypot(h.x, h.z) || 1; pl.runDist = Math.hypot(P.x - h.x, P.z - h.z); pl.runLat = Math.abs(((P.x - h.x) * -h.z + (P.z - h.z) * h.x) / l); }
    const g = this.g;
    if (firstTouch && onFly && g) {
      if (!pl.iff) {
        this.batterRunner.out = true; this.batterRunner.run = false; this.batterRunner.done = true; this.batterRunner.flyOut = true;
        pl.outs++;
        if (who === 'me') this.stats.outs++;
      }
      if (this.kind === 'game') {
        this.hush('アウト', '捕球', { ms: 1000 });
        if (!pl.iff) this.umpCall('out', POS[pl.opt.fielder].of ? 2 : (pl.opt.fielder === '1B' ? 1 : pl.opt.fielder === '3B' ? 3 : 0));   // インフィールドフライは宣告の時に 1 回
        const fine = who === 'me' && !!pl.special && !this.runOnlyReach(pl);   // 実況の「ファインプレー」は飛び込み・ジャンプ・フェンス際だけ(普通の捕球では言わない)
        if (who === 'me' && pl.special) this.say([pl.special === 'dive' ? 'diving_catch' : 'jumping_catch', 'fine_play'], { maxWait: 1, cut: true });
        else this.say(fine ? ['caught', 'fine_play'] : ['caught'], { maxWait: 0.8 });
        c.sound.crowdEvent(who === 'me' && (pl.special || fine) ? 'fine' : 'out', fine ? 0.9 : 0.6);
      } else if (!pl.iff) this.umpCall('out', POS[pl.opt.fielder].of ? 2 : 0);   // ノックでも捕ったらアウトのコール
      if (this.kind !== 'game' && who === 'me') this.hush(pl.special === 'dive' ? 'ダイビングキャッチ!' : pl.special === 'jump' ? 'ジャンピングキャッチ!' : 'アウト', '直接捕球', { ms: 900 });
      // 様子を見ていた走者は戻る。三塁走者は捕ってからタッチアップ(2 アウト未満)
      for (const r of this.runners) {
        if (r.out) continue;
        // 11/21 滞空の長いライナー・フライの間に次の塁まで着いていた走者も、元の塁(r.base)へ戻ってから(前は着いた塁に残り、戻ってきた前の走者と同じ塁に 2 人いた)
        if (!r.scored && r.from > r.base) { r.dist += (r.from - r.base) * 27.43; r.from = r.base; r.to = r.base + 1; r.run = false; r.done = false; }
        if (r.run && !r.done || r.dist > 0.5) { r.half = false; r.run = false; r.returning = r.dist > 0.01; r.done = !r.returning; }
        // タッチアップ: brain.js(プロの判断を高校生の速さと肩で)。捕った所・野手の体の向き(前へ・後ろへ)・肩・アウトの数で決める
        if (!POS[pl.opt.fielder].of || g.outs + pl.outs >= 3) continue;
        const Fk = who === 'me' ? null : this.fig[who];
        const vel = who === 'me' ? (c.player.vel ? [c.player.vel.x, c.player.vel.z] : [0, 0]) : Fk ? [-Math.sin(Fk.root.rotation.y) * (Fk.spd || 0), -Math.cos(Fk.root.rotation.y) * (Fk.spd || 0)] : [0, 0];
        const late = g.inning >= 7 && Math.abs(g.score.us - g.score.them) <= 1;
        let d = BR.tagupDecision({ base: r.base, catchPos: [p.x, p.z], catchVel: vel, arm: BLV.arm[pl.opt.fielder], outs: g.outs + pl.outs - (pl.iff ? 0 : 1), late }, BLV);
        if (pl.sendHome && r.base === 3) d = { ...d, go: true, to: 4, why: '本塁へタッチアップ(捕手の場面)' };   // 11/25 捕手の本塁の場面
        this.logRun(pl, r, d.go ? `${d.to === 4 ? '本' : d.to}塁へ` : '止まる', d.why);
        if (d.go) {
          if (r.returning) { r.tagupNext = true; r.tagupTo = d.to; }
          else { r.run = true; r.done = false; r.startAt = pl.t + 0.2; r.to = d.to; r.dist = 0; r.from = r.base; r.tagup = true; }
          if (d.to === 4 && !pl.said.tagup) { pl.said.tagup = true; this.later(0.6, () => this.say('tagup', { maxWait: 1 })); }
        }
      }
    }
    if (firstTouch && who === 'me' && pl.special && !onFly && pl.batted && ['fly', 'pop', 'liner', 'fence'].includes(pl.batted.type)) {
      // 11/25 飛び込んだ・跳んだが、フライ・ライナーは先に地面に着いていた(ワンバウンドで捕った): アウトでないので「ダイビングキャッチ」とは言わない
      if (c.ui && c.ui.evalPop && !this.dg) c.ui.evalPop('ワンバウンドで捕球', 'miss');
      pl.special = null;
    } else if (firstTouch && who === 'me' && pl.special) {
      if (this.kind === 'game') this.hush(pl.special === 'dive' ? 'ダイビングキャッチ!' : 'ジャンピングキャッチ!', '', { big: true, ms: 1300 });
      if (NEWDIVE && pl.special === 'dive' && c.ui && c.ui.evalPop) c.ui.evalPop('ナイスキャッチ!', 'fine');   // 11/25 飛び込んで(走っても届かない球を)捕ったら「ナイスキャッチ!」の札
      if (this.kind === 'knock' || !onFly) this.say([pl.special === 'dive' ? 'diving_catch' : 'jumping_catch', NEWDIVE && pl.special === 'dive' ? 'nice_catch' : null].filter(Boolean), { maxWait: 1, cut: true });
      if (!(firstTouch && onFly && this.kind === 'game')) c.sound.crowdEvent('fine', 1);
    } else if (firstTouch && this.kind === 'game') {
      // ゴロを捕った: 実況で呼ぶ
      const k = who === 'me' ? this.my : who;
      const moved = who === 'me' ? (pl.coverStart == null ? 1 : 0) : 0;
      const dive = { SS: 'dive_short', '2B': 'dive_second', '3B': 'dive_third', '1B': 'dive_first' }[k];
      this.say(dive && moved && this.rng() < 0.5 ? dive : POS_VOICE[k], { maxWait: 0.6 });
    }
    if (pl.thrown && pl.thrown.base != null) {
      const bi = pl.thrown.base;
      const fig = who === 'me' ? null : this.fig[who];
      const at = who === 'me' ? c.player.pos : fig.root.position;
      c.sound.sfx('throw_catch', { gain: 0.8, pos: at });
      // 足が塁に触れている(体の中心が塁から 1.2 m 以内)。11/21 一塁の自動の野手は、足がベースに付いている時だけ(見た目と判定を合わせる)
      if (bi === 1 && who !== 'me' ? this.footOn1(fig) : Math.hypot(at.x - BASEP[bi].x, at.z - BASEP[bi].z) < 1.2) this.tagBase(pl, bi, who);
      if (pl.thrown.relayTo != null && who !== 'me') pl.relayPending = pl.thrown.relayTo;
      if (pl.thrown.knock && pl.thrown.from === 'me') this.knockFeedback(pl);
    }
    if (pl.thrown && pl.thrown.to === 'me' && who === 'me') {
      if (pl.coverSpot && !pl.coverDone) { pl.coverDone = true; this.hush('カバー成功', '', { ms: 900 }); this.ring.visible = false; }
    }
    if (firstTouch && onFly && this.kind === 'game' && this.thirdOut(pl)) { this.updatePad(); return; }   // 3 つ目のアウトを捕った
    // 3. 走者がいない時にフライ・ライナーを捕った: 打者アウトで終わり(投げる場面は出さない)
    if (firstTouch && onFly && this.kind === 'game' && !POS[who === 'me' ? this.my : who].of && !this.runners.some((r) => !r.out && !r.scored)) { this.finishPlay(pl, null); this.updatePad(); return; }
    if (who === 'me') {
      // 飛び込んで捕ったら、起き上がるまで(約 1 秒)投げられない
      const a = this.meAct;
      if (a && a.kind === 'dive' && a.t < 1.05 + (a.turn || 0)) pl.choiceAt = pl.t + (1.05 + (a.turn || 0) - a.t);
      else this.offerChoice(pl);
    }
    this.updatePad();
  }

  offerChoice(pl) { pl.choiceOpen = true; this.updatePad(); }
  // 11/25 落球: フライ・ライナーをグラブに入れかけてこぼした(守備のキャリアのお手玉など)。アウトにしない。
  // 球はグラブの所から足もとへ落ちて少し転がり、地面に着くまでは誰も捕らない(tryCatch の dropAir)。着いたら走者は次の塁へ(live の flyDropped)。
  // 落とした人が拾い直して投げられる。成績は捕球のミス(失策)
  dropBall(pl, p, why = '落球') {
    const c = this.ctx, rng = this.rng;
    const a = rng() * Math.PI * 2, sp = 1.0 + rng() * 1.4;
    const from = p.clone(); from.y = Math.max(0.5, Math.min(from.y, 2.2));
    const v = V(Math.sin(a) * sp, 0.6 + rng() * 0.9, Math.cos(a) * sp);
    const path = predict(this.world, from, v, V(0, 0, 0), 4, { Cd: 0.35, clScale: 0, dt: DT });
    pl.dropped = true; pl.dropT = pl.t; pl.missed = true; pl.myMin = Math.min(pl.myMin ?? 99, 0.3); if (this.stats) this.stats.streak = 0;
    pl.batted = { ...pl.batted, path };   // 打球の続き(フェア・ファウルの判定と、走者の「落ちたら進む」はこの球で)
    this.launch(path, pl.t);
    this.ballPos = from.clone();
    if (this.meAnim == null || this.meAnim.kind !== 'catch') this.meAnim = { kind: 'catch', t: 0.3, dur: 0.3, h: 0 };
    c.sound.sfx('throw_catch', { gain: 0.5, pos: from });
    if (c.ui && c.ui.evalPop && !this.dg) c.ui.evalPop(why + '!', 'miss');
    if (this.kind === 'game') c.sound.crowdEvent('miss', 0.8);
    this.updatePad();
  }
  updatePad() {
    const ui = this.ctx.ui; if (!ui) return;
    if (!this.active || this.dg) { ui.pad('hide'); ui.acts && ui.acts(false); this._padKey = 'hide'; return; }
    const pl = this.play;
    // 捕る前はジャンプと飛び込みのボタン、捕ったら送球のボタンに入れ替わる(スマホ)
    const acting = !!(pl && pl.phase !== 'pre' && pl.holder !== 'me' && !pl.endT && !pl.thrown);
    const st = pl && pl.choiceOpen && pl.holder === 'me' ? 'live' : (acting && this.ctx.IS_TOUCH ? 'hide' : 'off');
    const fly = acting && this.flyUp();
    const key = st + acting + fly;
    if (key === this._padKey) return;
    this._padKey = key;
    ui.pad(st, !!POS[this.my].of);
    if (ui.padHint) ui.padHint(st === 'live' && (this.sel.diff === 'easy' || this.sel.diff === 'std') && pl ? this.correctBase(pl) : null);
    if (ui.acts) ui.acts(acting, fly);
  }
  updateSkip() {
    const ui = this.ctx.ui; if (!ui) return;
    const pl = this.play;
    const show = !!this.dg || (pl && pl.endT != null && pl.endT > 0.2) || (!pl && this.wait > 0.15) || this.canSkipLive(pl);
    ui.skip(show, !this.dg);
  }
  // 次の場面へ(Space・Enter・画面のボタン)
  skip() {
    if (!this.active) return;
    if (this.dg) { this.dg.t = this.dg.dur; return; }
    const pl = this.play;
    if (pl && pl.endT != null) { pl.endT = 0; return; }
    if (this.canSkipLive(pl)) { this.fastForward(pl); return; }
    if (!pl) { this.wait = 0; this.snapHome(); }
  }
  // 自分の出番が済んだ(投げた・カバーに入った・捕れない所へ行った)後は、残りを飛ばせる
  canSkipLive(pl) {
    if (!pl || pl.phase !== 'live' || pl.endT != null || pl.holder === 'me' || pl.releasing) return false;
    if (pl.t < pl.contactT + 0.8) return false;
    const mine = pl.opt.fielder === this.my && !pl.thrown && !pl.fieldedBy;
    if (mine && this.ball) return false;
    if (pl.coverSpot && !pl.coverDone && pl.thrown && pl.thrown.to === 'me') return false;
    return true;
  }
  fastForward(pl) {
    this.ffw = true;
    const c = this.ctx, en = c.sound.enabled;
    c.sound.enabled = false;   // 早回しの間の音は鳴らさない(最後の結果だけ)
    try {
      for (let i = 0; i < 60 * 30 && this.play === pl && pl.endT == null; i++) {
        pl.t += 1 / 60;
        if (pl.timers) { const due = pl.timers.filter((x) => pl.t >= x.at); pl.timers = pl.timers.filter((x) => pl.t < x.at); for (const x of due) x.fn(); }
        if (pl.holder === 'me' && !pl.releasing && pl.endT == null) {
          if (!pl.choiceOpen) pl.choiceOpen = true;
          const cb = this.correctBase(pl); this.chooseBase(cb[0] === 5 && !POS[this.my].of ? 1 : cb[0]);
          if (pl.holder === 'me' && !pl.releasing) this.finishPlay(pl, null);
        }
        this.live(pl, 1 / 60);
        this.animateFigures(1 / 60);
      }
    } finally { this.ffw = false; c.sound.enabled = en; }
    if (this.play === pl && pl.endT == null) this.finishPlay(pl, null);
    if (this.play === pl) pl.endT = Math.min(pl.endT, 0.35);
  }
  onKey(code) {
    if (code === 'KeyQ') { this.stop(); return true; }
    if (code === 'KeyF') { this.dive(); return true; }
    if (code === 'KeyE') { this.callBall(); return true; }
    const m = /^Digit([1-5])$/.exec(code);
    if (m) { const k = +m[1]; this.chooseBase(k === 4 ? 0 : k); return true; }
    return false;
  }
  onPointer() {}

  // 投げられる先(塁に入っている味方・中継)
  throwTargets() {
    const pl = this.play;
    if (!pl || pl.holder !== 'me' || !pl.choiceOpen) return [];
    const out = [];
    for (const b of [1, 2, 3, 0]) {
      let k = this.cover[b];
      if (!k || k === this.my) k = b === 1 ? '2B' : b === 2 ? 'SS' : b === 3 ? 'SS' : 'C';
      if (k === this.my) k = b === 2 ? '2B' : 'P';
      if (!this.fig[k] || !this.fig[k].root.visible || k === this.my) continue;
      if (out.some((o) => o.k === k)) continue;
      out.push({ base: b, k, fig: this.fig[k] });
    }
    if (POS[this.my].of && this.cutoffK && this.cutoffK !== this.my && this.fig[this.cutoffK] && !out.some((o) => o.k === this.cutoffK)) {
      out.push({ base: 5, k: this.cutoffK, fig: this.fig[this.cutoffK] });
    }
    return out;
  }
  // 画面の点(x, y)にいちばん近い投げ先の野手
  targetAt(x, y, maxPx = 90) {
    const cam = this.ctx.camera; cam.updateMatrixWorld();
    let best = null, bd = maxPx;
    for (const t of this.throwTargets()) {
      for (const h of [0.2, 1.0, 1.7]) {
        const p = t.fig.root.position.clone().add(V(0, h, 0)).project(cam);
        if (p.z > 1) continue;
        const sx = (p.x + 1) / 2 * innerWidth, sy = (1 - p.y) / 2 * innerHeight;
        const d = Math.hypot(sx - x, sy - y);
        if (d < bd) { bd = d; best = t; }
      }
    }
    return best;
  }
  pickAt(x, y) { const t = this.targetAt(x, y); if (t) { this.chooseBase(t.base); return true; } return false; }
  hoverAt(x, y) { const t = this.targetAt(x, y); this.hover = t ? t.k : null; document.body.style.cursor = t ? 'pointer' : ''; }
  updateGlow() {
    const ts = this.active && !this.dg ? this.throwTargets() : [];
    this.glows.forEach((g, i) => {
      const t = ts[i];
      g.visible = !!t;
      if (!t) return;
      const p = t.fig.root.position;
      g.position.set(p.x, this.gy(p) + 0.03, p.z);
      g.material.opacity = this.hover === t.k ? 0.95 : 0.45;
      g.scale.setScalar(this.hover === t.k ? 1.25 : 1);
    });
    if (!ts.length && this.hover) { this.hover = null; document.body.style.cursor = ''; }
  }
  // 見回しの補助: 指で視点を動かしていない間、打球の方へ弱めに向ける
  assist(dt) {
    const c = this.ctx;
    const pl = this.play;
    // 球を持ってから指で視点を動かしたら、その回は送球先へ向けない(aimThrow)
    if (pl && pl.dpAim && pl.dpAim.key === pl.caughtT && pl.holder === 'me' && c.lookIdle() < Math.min(0.8, pl.t - pl.caughtT)) pl.dpAim.off = true;
    if (c.fixedView || c.lookIdle() < 0.8 || this.dg) { this._yawV = 0; return; }
    let t = null;
    if (pl && pl.holder === 'me' && this.aimThrow(pl, dt)) return;
    if (pl && pl.holder === 'me') {
      // 捕ったら投げる先の内野の方へ: 投げられる野手が左右の端まで入るよう、いちばん左と右の真ん中を向く
      // 向く先は捕った時に一度だけ決める(野手が動いても視点が揺れない)
      const P0 = c.player.pos;
      if (pl.assistKey !== pl.caughtT) { pl.assistKey = pl.caughtT; pl.assistT = null; }
      const ts = pl.assistT ? [] : this.throwTargets();
      if (pl.assistT) t = pl.assistT;
      else if (ts.length) {
        const ang = ts.map((q) => Math.atan2(-(q.fig.root.position.x - P0.x), -(q.fig.root.position.z - P0.z)));
        const ref = ang[0];
        const rel = ang.map((a) => Math.atan2(Math.sin(a - ref), Math.cos(a - ref)));
        const mid = ref + (Math.min(...rel) + Math.max(...rel)) / 2;
        t = pl.assistT = V(P0.x - Math.sin(mid) * 30, 0.8, P0.z - Math.cos(mid) * 30);
      } else t = pl.assistT = V(0, 0.8, -19.4);
    } else if (pl && this.ball && this.ballPos) t = this.ballPos;
    else if (pl && pl.phase === 'pre') t = this.my === 'C' && !this.watching ? V(0, 1.3, -18.4) : V(0, 1.0, 0);   // 11/25 捕手は投手を見て構える
    else if (pl && pl.coverSpot && !pl.coverDone && !pl.holder) t = pl.coverSpot.p.clone().setY(0.5);
    if (!t) return;
    const P = c.player, eyeY = P.pos.y + 1.6;
    const dx = t.x - P.pos.x, dz = t.z - P.pos.z;
    if (Math.hypot(dx, dz) < 1.5) { if (this._yawV) { this._yawV *= Math.exp(-8 * dt); P.yaw += this._yawV * dt; } return; }   // 11/27 回っている途中なら、すっと止める
    // 球が画面の真ん中より少し上に入るように(少し下を向く)
    const yaw = Math.atan2(-dx, -dz), pitch = THREE.MathUtils.clamp(Math.atan2(t.y - eyeY, Math.hypot(dx, dz)) - 0.07, -0.6, 0.85);
    let d = yaw - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    // 11/25 球を追う間で、球が横から後ろ(35 度より外)にある時は速く振り向く(真後ろで約 2.6 倍。180 度を 0.3 秒ほどで 30 度以内へ)。球を持った後・投げる前は今までどおり
    // 11/27 テスター tipsy さん「フライを追う時、少しずれたり行きすぎるとカメラが急に回ってキャッチが難しい」:
    // 宙の球は、真上・すぐ横に近いほど横の向きが少しのずれで大きく変わる(行きすぎると真後ろへ反転する)。
    //  - 横の距離が近いほど横に回す強さを弱める(2 m 以内は回さない・8 m で元どおり)。真上の球は上を見上げる(縦の向き)だけで追う
    //  - 後ろへ速く振り向く(boost)は地面の球だけ。宙の球は回す速さに上限(1 秒に 140 度。スマホ 120 度)
    //  ?oldcam=1 で前の形
    //  (宙の球 = 打球がまだ地面に着いていない間。高さでは分けない: 前に高さで分けた形では、行きすぎて横 2 m を落ちてくる球で 1 秒に 400 度回っていた)
    const air = !OLDCAM && pl && !pl.holder && this.ball && t === this.ballPos && pl.batted && this.ball.path === pl.batted.path && !pl.thrown
      && !this.ball.path.events.some((e) => (e.type === 'bounce' || e.type === 'roll' || e.type === 'wall') && e.t <= pl.t - this.ball.t0);
    const boost = !LOOSE_OFF && !air && pl && !pl.holder && this.ball && t === this.ballPos ? 1 + 1.6 * THREE.MathUtils.clamp((Math.abs(d) - 0.6) / 1.4, 0, 1) : 1;
    const k = 1 - Math.exp((c.IS_TOUCH ? -2.2 : -2.6) * boost * dt);
    const chase = !OLDCAM && pl && !pl.holder && this.ball && t === this.ballPos;
    if (chase) {
      // 球を追う間は、回る速さ(宙 140 度/秒・スマホ 120、地面の球 300 度/秒)と、回り始め・止まりの速さの変わり(1 秒に 900 度/秒まで)に上限を付けて、なめらかに回す。
      // 捕り損ねて球がすぐ横・後ろに落ちた時も、いきなり反転しない(前は 1 秒に 700〜800 度で回っていた)
      let step = d * k;
      if (air) { const near = THREE.MathUtils.clamp((Math.hypot(dx, dz) - 2) / 6, 0, 1); step *= near * near * (3 - 2 * near); }
      const vMax = air ? (c.IS_TOUCH ? 2.1 : 2.45) : 5.2, want = THREE.MathUtils.clamp(step / Math.max(dt, 1e-4), -vMax, vMax);
      const v0 = this._yawV || 0, acc = 15.7 * dt;
      this._yawV = v0 + THREE.MathUtils.clamp(want - v0, -acc, acc);
      P.yaw += this._yawV * dt;
    } else { this._yawV = 0; P.yaw += d * k; }
    P.pitch += (pitch - P.pitch) * k * 0.7;
  }
  // 11/22 持ち主「スマホ画面でゲッツーを取る時二塁手の方にカメラが向くように良い感じに視点動く感じに ただし状況次第で」:
  // 内野で球を持ったら、その場面の正しい送球先(ガイドと同じ throwBase。一塁走者・2 アウト未満のゴロなら二塁に入る野手)の方へ視点を寄せる。
  // スマホ縦は送球先が画面の真ん中付近に見えていない時、PC・横持ちは画面の外にいる時だけ。0.3 秒ほどで寄せ、回す角度は 165° まで(後ろへ走って捕った時は、送球先が真後ろ近くになる)。
  // 自分で視点を動かしたらその回は止める。投げたあとは今までどおり球を追う(二塁から一塁への送球の方へ自然に向く)。外野は今まで(真ん中を向く)のまま
  // 返す: true = ここで扱った(今までの「投げる先の真ん中を向く」はしない)
  aimThrow(pl, dt) {
    const c = this.ctx, my = this.my, P = c.player;
    if (!POS[my] || POS[my].of) return false;
    let a = pl.dpAim;
    if (!a || a.key !== pl.caughtT) {
      if (!pl.choiceOpen) return false;
      a = pl.dpAim = { key: pl.caughtT, base: null, k: null, yaw0: P.yaw, on: false, off: false };
      const base = this.guide && this.guide.throwBase ? this.guide.throwBase(pl) : this.correctBase(pl)[0];
      const B = BASEP[base];
      if (!B) return false;
      // 11/22 夜 Discord の感想「ファーストでゴロを捕った時、自分で一塁を踏みたいのに視点が固定されて塁が見えない」:
      // 一塁手が自分で一塁を踏む場面(chooseBase と同じ近さ・selfFirst)は、送球先の人ではなく一塁のベースの方へ向ける
      if (base === 1 && my === '1B' && (Math.hypot(P.pos.x - B.x, P.pos.z - B.z) < 7 || this.selfFirst())) { a.base = 1; a.k = 'bag'; a.self = true; }
      // ほかの守備位置で自分で踏みに行く近さ(5 m)なら向けない
      else if (Math.hypot(P.pos.x - B.x, P.pos.z - B.z) < 5) return false;
      if (!a.self) {
      const tg = this.throwTargets().find((x) => x.base === base);
      if (!tg) return false;
      a.base = base; a.k = tg.k;
      }
    }
    if (!a.k) return false;
    if (a.off) return true;
    // 選んだ塁が違ったら、そこで止める(投げたら球を追う)。自分で一塁を踏む時は、踏むまでベースの方を見たまま
    if (!pl.choiceOpen && !a.self && !(pl.lastThrow && pl.lastThrow.base === a.base)) return true;
    if (a.self && pl.lastThrow) return true;
    const F = a.self ? null : this.fig[a.k];
    if (!a.self && (!F || !F.root.visible)) return true;
    const cam = c.camera, tall = cam.aspect < 1;
    const tp = a.self ? V(BASEP[1].x, 0.3, BASEP[1].z) : F.root.position.clone(); if (!a.self) tp.y += 1.0;
    if (!a.on) {
      cam.updateMatrixWorld();
      const q = tp.clone().project(cam), front = q.z < 1;
      const shown = tall ? front && Math.abs(q.x) < 0.45 && Math.abs(q.y) < 0.85 : front && Math.abs(q.x) < 0.9 && Math.abs(q.y) < 0.9;
      if (shown) return true;   // もう見えている時は動かさない
      a.on = true;
    }
    const dx = tp.x - P.pos.x, dz = tp.z - P.pos.z, dh = Math.hypot(dx, dz);
    if (dh < (a.self ? 1.0 : 1.5)) return true;
    let want = Math.atan2(-dx, -dz);
    if (!tall && !a.self) {
      // PC・横持ちは真ん中まで回さず、画面の端から少し内側に入るまで
      const half = Math.atan(Math.tan(cam.fov * Math.PI / 360) * cam.aspect);
      let e0 = want - P.yaw; e0 = Math.atan2(Math.sin(e0), Math.cos(e0));
      want -= Math.sign(e0) * half * 0.45;
    }
    // 回す角度の上限(捕った時の向きから 165°)
    let rel = want - a.yaw0; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    rel = THREE.MathUtils.clamp(rel, -2.88, 2.88);
    want = a.yaw0 + rel;
    let e = want - P.yaw; e = Math.atan2(Math.sin(e), Math.cos(e));
    const k = 1 - Math.exp(-9 * dt);
    const step = THREE.MathUtils.clamp(e * k, -7.5 * dt, 7.5 * dt);
    P.yaw += step;
    const pitch = THREE.MathUtils.clamp(Math.atan2(tp.y - (P.pos.y + 1.6), dh) - 0.07, a.self ? -0.45 : -0.6, 0.85);   // ベースを見る時も下を向きすぎない
    P.pitch += (pitch - P.pitch) * k * 0.7;
    return true;
  }

  // ------------------------------------------------------------ 送球
  chooseBase(base) {
    const pl = this.play;
    if (!pl || pl.holder !== 'me' || !pl.choiceOpen) return;
    if (base === 5 && !POS[this.my].of) return;
    const c = this.ctx;
    pl.choiceOpen = false;
    const correct = this.correctBase(pl);
    pl.correctAt = correct;
    // 一塁手が一塁の近くで捕ったら、一塁ボタンは「自分で踏みに行く」
    // 選んだ塁が自分のすぐ近く(一塁手の一塁は 7 m、ほかは 5 m 以内)なら、投げずに自分で踏みに行く(フォースは踏めばアウト)
    if (base !== 5 && (Math.hypot(c.player.pos.x - BASEP[base].x, c.player.pos.z - BASEP[base].z) < (base === 1 && this.my === '1B' ? 7 : 5) || (base === 1 && this.selfFirst()))) {
      pl.choiceOpen = false;
      const ok1 = correct.includes(base);
      this.stats.decisions++; this.stats.correct++;
      pl.decisionOk = ok1; pl.lastThrow = { base, speedKmh: 0, transfer: pl.t - pl.caughtT, correct: ok1, self: true };
      this.autoRun = BASEP[base].clone();
      this.updatePad();
      return;
    }
    const ok = correct.includes(base);
    pl.decisionOk = ok;
    this.stats.decisions++; this.stats.correct++;   // 余計な進塁を許したら、プレーが終わってから evalPlay で 1 つ戻す
    // 投げる動き(腕を引いて放すまで約 0.22 秒)のあとで球が手を離れる。「捕ってから投げるまで」は球が手を離れるまで
    const RELEASE = 0.22;
    const transfer = pl.t - pl.caughtT + RELEASE;
    this.stats.transfer.push(transfer);
    let rk, to;
    if (base === 5) {
      rk = this.cutoffK || 'SS';
      const tb = correct.find((x) => x !== 5) ?? 2;
      to = BASEP[tb].clone().lerp(c.player.pos.clone().setY(0), 0.4);
      pl.relayBase = tb;
    } else {
      rk = this.cover[base];
      if (!rk || rk === this.my) rk = base === 1 ? '2B' : base === 2 ? 'SS' : base === 3 ? 'SS' : 'C';
      if (rk === this.my) rk = base === 2 ? '2B' : 'P';
      to = base === 0 ? HOME_RECV.clone() : BASEP[base].clone();
    }
    const F = this.fig[rk];
    F.root.visible = true;
    F.target = to.clone();
    // 11/21 一塁へ: 受け手はベースを踏んで伸びる所へ、送球は伸ばしたグラブの所(高さ 1.0 m)へ
    pl.first1 = null;
    const s1 = base === 1 ? this.firstRecv(pl, rk, c.player.pos) : null;
    if (s1) { F.target = s1.p.clone(); F.target.snap = true; to = s1.glove.clone(); }
    pl.releasing = true;
    pl.lastThrow = { base, speedKmh: 0, transfer, correct: ok };
    this.meAnim = { kind: 'throw', t: 0.35, dur: 0.35 };
    this.later(RELEASE, () => {
      if (this.play !== pl) return;
      const from = c.myHandPos();
      const dist = Math.hypot(to.x - from.x, to.z - from.z);
      let speed = POS[this.my].of ? ofThrowSpeed(dist) : Math.min(36, 29 + dist * 0.17);   // 11/20 持ち主「外野手ですが肩強すぎる」: 自分の外野からの送球も自動の外野手と同じ(前は 27 + 距離 × 0.09・上限 33.5 m/s = 121 km/h、ノーバウンドで 78 m)
      // 11/22 一塁へ走って入るカバーの人へは、着く時に合わせて緩める・走る道の上へ(firstLead)
      let lead = false;
      if (base === 1 && s1) { const L1 = this.firstLead(pl, rk, from, to, speed); to = L1.to; speed = L1.speed; lead = !!L1.lead; }
      if (this.throwMod) { try { const m = this.throwMod(to, from, speed, rk, pl); if (m) { to = m.to; speed = m.speed; } } catch (e) { /* 無くても投げる */ } }   // 11/25 守備のキャリア(js/career.js): 肩で送球の速さ、エラー回避で送球のそれ。キャリアの試合の時だけ入る
      // 外野からの遠い送球はワンバウンド(内野の手前 9 m で 1 回跳ねる)
      const hop = POS[this.my].of && dist > 55 && base !== 5;
      const sv = solveThrow(from, hop ? to.clone().lerp(from.clone().setY(0), 9 / dist) : to, speed, hop ? -1.5 : lead ? 1.2 : s1 ? 1.0 : 1.35);
      const path = predict(this.world, from, sv.v, sv.w, 6, { Cd: 0.35, clScale: 0, dt: DT });
      this.stats.speed.push(speed * 3.6);
      pl.lastThrow.speedKmh = speed * 3.6;
      pl.thrown = { from: 'me', fromK: null, base: base === 5 ? null : base, relayTo: base === 5 ? pl.relayBase : null, to: rk, speed, transfer, knock: this.kind === 'knock', eta: pl.t + this.arriveT(path, to) };
      pl.holder = null; this.holderFig = null; pl.releasing = false;
      pl.myLock = true; pl.overChase = false;
      this.launch(path, pl.t);
      this.receiverGo(pl, rk, false);
      c.sound.play('tick', { gain: 0.25, rate: 0.8 });
    });
    if (this.kind === 'game') this.say({ 1: 'to_first', 2: 'to_second', 3: 'to_third', 0: 'to_home', 5: null }[base], { maxWait: 0.5 });
    this.updatePad();
  }
  correctBase(pl) {
    if (!this.g) return pl.opt.correct || [1];
    const me = this.ctx.player.pos;
    const sp = POS[this.my].of ? 32 : 28;
    const runners = [this.batterRunner, ...this.runners].filter((r) => r && !r.out && !r.scored && (r.run || !r.done) && !r.returning);
    const can = [];
    for (const r of runners) {
      // 11/22 刺せる塁は、走者がまだ着いていない次の塁(from + 1)と、目指している塁(to)。フォースは次の塁だけ、目指す塁(その先)はタッチ。
      // 前は to だけを見てフォースにしていたので、ゴロが抜けると見て最初から三塁を目指す一塁走者がいると、一塁走者・0〜1 アウトのゴロでも送球先が三塁になっていた
      const nx = r.isBatter ? 1 : (r.from + 1) % 4, end = r.isBatter ? 1 : Math.min(4, r.to) % 4;
      for (const tgt of nx === end ? [nx] : [nx, end]) {
      const eta = this.runnerETA(r, tgt);
      let tb = Math.hypot(BASEP[tgt].x - me.x, BASEP[tgt].z - me.z) / sp + 0.15;
      // 11/22 一塁は、カバーの人がベースに着く時刻より前には捕れない(着いてから捕って踏む)
      if (tgt === 1 && r.isBatter && this.selfFirst()) tb = this.runTime(Math.hypot(BASEP[1].x - me.x, BASEP[1].z - me.z), this.fullSpeed()) + 0.1;   // 自分で踏みに行く
      else if (tgt === 1 && this.cover && this.cover[1] && this.cover[1] !== this.my && this.fig[this.cover[1]]) {
        const ck = this.cover[1], F = this.fig[ck], dd = Math.hypot(F.root.position.x - BASEP[1].x, F.root.position.z - BASEP[1].z);
        tb = Math.max(tb, dd < 1.0 ? 0 : ((F.spd || 0) > 3 ? dd / Math.max(F.spd, 6) : 0.15 + this.runTime(dd, VMAX[ck] || AI_SPEED)) + 0.1);
      }
      if (tb < eta && ((tgt === nx && this.forcedNow(r)) || 27.43 - r.dist <= R.TAG_REACH + RUN_SPEED * tb)) can.push(tgt);
      }
    }
    // 帰塁中の走者(フライで離れた)は元の塁へ投げればアウト
    for (const r of this.runners) if (r.returning && !r.out) { const tb = Math.hypot(BASEP[r.from].x - me.x, BASEP[r.from].z - me.z) / sp + 0.15; if (tb < r.dist / RUN_SPEED) can.push(r.from); }
    if (can.length) {
      const order = [0, 3, 2, 1];
      const best = order.find((b) => can.includes(b));
      const ok = [best];
      if (best === 2 && can.includes(1)) ok.push(1);
      if (best === 3 && can.includes(2) && can.includes(1)) ok.push(2);   // 一・二塁のゴロ: 三塁のフォースが一番前でも、二塁→一塁の併殺も正解
      if (POS[this.my].of) ok.push(5);
      return ok;
    }
    const lead = runners.reduce((a, r) => (!a || (r.to % 4 === 0 ? 4 : r.to) > (a.to % 4 === 0 ? 4 : a.to) ? r : a), null);
    if (!lead) return POS[this.my].of ? [2, 5] : [1, 2];
    const nb = lead.isBatter ? 2 : ((lead.to % 4));
    const res = [nb];
    if (POS[this.my].of) res.push(5);
    return res;
  }
  // 塁で球を持った(踏んだ)。フォースは塁を踏めばアウト、それ以外は走者に触れてアウト(走者が遠ければ戻る)
  tagBase(pl, bi, who, quiet) {
    if (pl.tagged && pl.tagged[bi]) return false;
    const c = this.ctx;
    const runners = [this.batterRunner, ...this.runners].filter((r) => r && !r.out && !r.scored);
    const mark = () => ((pl.tagged = pl.tagged || {})[bi] = true);
    const out = (r, how) => {
      r.out = true; r.run = false; r.done = true; r.returning = false;
      r.fig.set('stand');
      pl.outs++;
      pl.lastOutForce = how === 'force';
      mark();
      this.hush('アウト!', `${BASE_NAME[bi]}${how === 'force' ? '' : how === 'tag' ? '(タッチ)' : '(帰塁できず)'}`, { big: true, ms: 1100 });
      c.sound.crowdEvent(pl.outs >= 2 ? 'dp' : 'out', 0.6);
      this.umpCall('out', bi);
      if (this.kind === 'game') {
        const dp = pl.outs >= 2 && !pl.said.dp;
        if (dp) { pl.said.dp = true; const k = `dp_${NUM[pl.fieldedBy === 'me' ? this.my : pl.fieldedBy] || 6}${NUM[this.cover[2]] || 4}3`; this.say(this.ctx.sound.hasVoice(k) ? k : 'double_play', { maxWait: 1 }); }
        else this.say(how === 'tag' ? 'tag_out' : 'out', { maxWait: 1 });
      }
      if (who === 'me' || pl.thrown?.from === 'me') this.stats.outs++;
      this.thirdOut(pl);
      return true;
    };
    for (const r of runners) {
      // フライで離れて、戻る前に球が塁へ着いた
      if (r.returning && r.from === bi && r.dist > 0.01 && !r.rundown) return out(r, 'back');   // 挟殺で戻る走者はタッチが要る
    }
    for (const r of runners) {
      const heading = r.isBatter ? (bi === 1 && r.from === 0) : (r.run && !r.done && (r.from + 1) % 4 === bi);
      if (!heading) continue;
      const toGo = r.isBatter && !r.run ? 27.43 : 27.43 - r.dist;
      const res = R.playAtBase(this.forcedNow(r), toGo);
      if (res === 'force') return out(r, 'force');
      // 11/23 持ち主「タッチプレーの時はタッチしてアウトするように」: 塁に球が着いただけではアウトにしない。走者はそのまま塁へ来て、待つ野手がタッチしてアウト(tagPlay の tagLock)
      if (res === 'tag' || (res === 'back' && pl.steal)) { r.tagLock = { bi, who }; mark(); return false; }
      if (res === 'back') { r.returning = true; r.run = false; mark(); this.hush('セーフ', '走者は戻った', { ms: 1000 }); return false; }
    }
    // 走者がもう着いていた
    if (!quiet && runners.some((r) => r.arrived === bi && r.from === bi)) {
      mark(); this.hush('セーフ', BASE_NAME[bi], { ms: 1100 }); this.umpCall('safe', bi);
      if (this.kind === 'game') this.say('safe', { maxWait: 1 });
    }
    return false;
  }
  // その塁へ向かう(戻る)走者がいて、まだ塁に着いていないか(送球してアウトにできる見込みのある塁)
  baseLive(b) {
    const B = BASEP[b];
    return [this.batterRunner, ...this.runners].some((r) => {
      if (!r || r.out || r.scored) return false;
      const heading = (r.run && !r.done && (r.to % 4) === b) || (r.returning && r.from === b);
      if (!heading) return false;
      const rp = this.runnerPos(r); return Math.hypot(rp.x - B.x, rp.z - B.z) > 0.6;
    });
  }
  aiDecide(pl) {
    if (pl.aiThinking || pl.aiChase) return;
    const k = pl.holder;
    const F = this.fig[k];
    const runners = [this.batterRunner, ...this.runners].filter((r) => r && !r.out && !r.scored && ((r.run && !r.done) || r.returning));
    const outsNow = this.g ? this.g.outs + pl.outs : 0;
    const farOut = !!POS[k].of && !this.inInfield(F.root.position);
    if ((!runners.length || outsNow >= 3) && !farOut) return;
    let target = null, toMe = false;
    if ((!runners.length || outsNow >= 3) && farOut) target = 'return';   // 内野へ返す
    else if (pl.relayPending != null && (pl.relayPending === 'cut' || this.canCover(pl.relayPending, k, Math.hypot(BASEP[pl.relayPending].x - F.root.position.x, BASEP[pl.relayPending].z - F.root.position.z) / 30 + 0.45))) { target = pl.relayPending; pl.relayPending = null; }
    else if (pl.relayPending != null) { pl.relayPending = null; if (!farOut) return; target = 'return'; }   // 受ける人がいない塁へは投げない
    else if (POS[k].of && farOut) {
      // 外野手の送球先は brain.js の outfieldThrow(docs/判断の組み込み手順.md の 5): 刺せる塁があればそこ、なければ後ろの走者の次の塁を止める
      const fp = F.root.position, all = [this.batterRunner, ...this.runners].filter((r) => r && !r.out && !r.scored);
      let t = null;
      try { t = BR.outfieldThrow({ from: k, pos: [fp.x, fp.z], vel: [-Math.sin(F.root.rotation.y) * (F.spd || 0), -Math.cos(F.root.rotation.y) * (F.spd || 0)], arm: BLV.arm[k], outs: outsNow,
        runners: all.map((r) => ({ id: r.isBatter ? 'B' : this.runners.indexOf(r), from: r.from, dist: r.dist, to: r.to, running: !!(r.run && !r.done), returning: !!r.returning, isBatter: !!r.isBatter })) }, BLV); } catch (e) { t = null; }
      if (pl.sendHome && this.baseLive(0)) t = { target: 0, via: null, call: '本塁へ' };   // 11/25 捕手の本塁の場面: 還ってくる走者がいれば本塁へ
      if (!t) target = 'cut';
      else if (t.via === 'cut' || !this.canCover(t.target, k, 99)) { target = 'cut'; pl.forceRelay = true; pl.relayTarget = t.target; if (t.cutBy && (t.cutBy === this.my || (this.fig[t.cutBy] && this.fig[t.cutBy].root.visible)) && t.cutBy !== k) pl.returnTo = t.cutBy; }
      else target = t.target;
      pl.ofCall = t && t.call;
    }
    else {
      const fp = F.root.position;
      const opts = [];
      // 11/28 持ち主「バックホームの場面でキャッチャーがホームアウトしないで一塁に投げる」: 本塁へ向かう走者がいて、球を持った人が本塁の近くに
      // いてタッチが間に合うなら、まず自分で本塁に入ってタッチ(塁に着くと tagBase → tagLock で待つ)。前は本塁の役目が自分(canCover が false)なので一塁へ投げていた
      if (!HOMEFIX_OFF) {
        const d0 = Math.hypot(fp.x - BASEP[0].x, fp.z - BASEP[0].z);
        const home = runners.find((r) => !r.isBatter && !r.returning && r.run && !r.done && r.to % 4 === 0 && !(pl.tagged && pl.tagged[0]));
        // 本塁の役目の人(捕手)は、それた送球を拾いに前へ出ていても 22 m までは走って戻る(0:3x の試験で 14 m 前で拾った捕手が、走者が来る 3 秒の間立ったままだった)。ほかの人は 6 m まで(遠ければ本塁へ投げる)
        if (home && d0 < ((k === 'C' || this.cover[0] === k) ? 22 : 6) && this.runTime(Math.max(0, d0 - 0.6), VMAX[k] || AI_SPEED) + 0.1 < this.runnerETA(home, 0) + 0.3) {
          (this._homeStep = this._homeStep || []).push({ from: k, d: +d0.toFixed(1) }); if (this._homeStep.length > 200) this._homeStep.shift();
          pl.aiStep = 0; pl.aiThinking = true; F.target = BASEP[0].clone(); return;
        }
      }
      for (const r of runners) {
        if (r.returning) { const tt = Math.hypot(BASEP[r.from].x - fp.x, BASEP[r.from].z - fp.z) / 28 + 0.6; if (tt < r.dist / RUN_SPEED) opts.push(r.from); continue; }
        const tb = r.isBatter ? 1 : r.to % 4;
        const eta = this.runnerETA(r, tb);
        const tt = Math.hypot(BASEP[tb].x - fp.x, BASEP[tb].z - fp.z) / 28 + 0.6;
        // 11/26 塁に入る人が間に合うかは、投げるまでの構え(内野 0.6〜0.85 秒)と送球の時間で見る(前は 0.35 秒で見ていて、二塁のカバーが少し遅いだけで併殺を狙わず一塁へ投げていた)
        if (HOMEFIX_OFF) { if (tt < eta + 0.2 && this.canCover(tb, k, Math.hypot(BASEP[tb].x - fp.x, BASEP[tb].z - fp.z) / 30 + (POS[k].of ? 1.0 : COVFIX_OFF ? 0.35 : 0.65))) opts.push(tb); continue; }
        // 11/28 持ち主「ランナーの状況もちゃんと見て」: 送球の時間は投げる人の肩(BLV.arm)で。封殺は塁に先に着けば、タッチ(封殺でない)は 0.3 秒の余裕が要る。
        // 受ける人がその塁にいない(間に合わない)なら投げない
        const dist = Math.hypot(BASEP[tb].x - fp.x, BASEP[tb].z - fp.z);
        const tt2 = dist / ((BLV.arm && (BLV.arm[k] || BLV.arm.IF)) || 28) + 0.6;
        const forced = r.isBatter || this.forcedNow(r);
        const margin = eta - tt2 + (forced ? (tb === 1 ? 0.2 : -0.15) : -0.3);   // 一塁より先の封殺は、受ける人が捕って踏む間(0.15 秒)の余裕も見る(試験で、走者一塁のバントを二塁へ投げて間に合わない 4 回があった)
        if (margin > 0 && this.canCover(tb, k, dist / 30 + (POS[k].of ? 1.0 : COVFIX_OFF ? 0.35 : 0.65))) { opts.push(tb); (pl._optM = pl._optM || {})[tb] = { margin, forced }; }
      }
      const order = [0, 3, 2, 1];
      target = order.find((b) => opts.includes(b));
      // 11/28 2 アウトは一番確実な所(封殺を先に、余裕の大きい塁)。打者走者の一塁が間に合うならそこで十分
      if (!HOMEFIX_OFF && outsNow >= 2 && opts.length > 1) {
        const M = pl._optM || {};
        target = opts.slice().sort((a, b) => ((M[b] && M[b].forced ? 1 : 0) - (M[a] && M[a].forced ? 1 : 0)) || ((M[b] ? M[b].margin : 0) - (M[a] ? M[a].margin : 0)))[0];
      }
      pl._optM = null;
      if (!HOMEFIX_OFF && target != null) { (this._throwLog = this._throwLog || []).push({ from: k, to: target, opts: opts.slice(), outs: outsNow }); if (this._throwLog.length > 300) this._throwLog.shift(); }
      // 11/22 一塁のカバーが間に合わない: 打者走者より先に自分で一塁を踏めるなら走って踏む(14 m まで)。踏めなければ投げずに持つ
      if (target == null && !farOut && this.batterRunner && !this.batterRunner.out && this.batterRunner.from < 1 && this.forcedNow(this.batterRunner)) {
        const d1 = Math.hypot(fp.x - BASEP[1].x, fp.z - BASEP[1].z);
        if (d1 < 14 && this.runTime(d1, VMAX[k] || AI_SPEED) + 0.1 < this.runnerETA(this.batterRunner, 1)) { pl.aiThinking = true; pl.selfTagK = k; F.target = BASEP[1].clone(); return; }
      }
      if (target == null) { if (farOut) target = 'cut'; else return; }
    }
    // 11/20 夜 持ち主「外野からホームとか内野に送球したあとランナーがいないのに一塁に送球する癖」: 投げる塁へ向かう(か戻る)走者がいて、
    // まだ塁に着いていない時だけ塁へ投げる。いなければ、外野からは内野へ返す(中継・二塁の人)、内野は持ったまま(走者が止まればプレーが終わる)
    if (typeof target === 'number') {
      if (!this.baseLive(target)) {
        (this._emptySkip = this._emptySkip || []).push({ base: target, from: k, t: +(pl.t - (pl.contactT || 0)).toFixed(1) }); if (this._emptySkip.length > 200) this._emptySkip.shift();
        if (farOut) target = 'return'; else { pl.aiThinking = false; return; }
      }
    }
    // 外野から遠い塁(42 m 超)へは、線の上の中継を通す(中継が受けて回って投げる)
    if (typeof target === 'number' && farOut && !(pl.sendHome && target === 0) && this.cutoffK && this.cutoffK !== k && this.fig[this.cutoffK] && this.fig[this.cutoffK].root.visible && Math.hypot(BASEP[target].x - F.root.position.x, BASEP[target].z - F.root.position.z) > 42) { pl.relayTarget = target; target = 'cut'; pl.forceRelay = target; }
    if (target === 'return') {
      // 内野へ返す: 中継の人か、二塁に入った人へ
      const rk0 = (this.cutoffK && this.cutoffK !== k && this.fig[this.cutoffK].root.visible) ? this.cutoffK : this.nearestTo(BASEP[2], [k, 'C', 'P']);
      target = 'cut'; pl.returnTo = rk0;
    }
    // 一塁手が一塁の近く(9 m 以内)で捕ったら、投げずに自分で一塁を踏みに行く
    if (target === 1 && k === '1B' && Math.hypot(F.root.position.x - BASEP[1].x, F.root.position.z - BASEP[1].z) < 9) {
      pl.aiThinking = true; pl.selfTagK = k; F.target = BASEP[1].clone(); return;
    }
    pl.aiThinking = true; pl.aiCommit = AICOMMIT_OFF ? null : k; const aiTok = pl.aiTok = (pl.aiTok || 0) + 1;   // 11/28 投げ先を決めた(投げるまで、そばを走る走者を追いに行って決め直さない)
    let rk, to;
    if (target === 'cut') {
      rk = pl.returnTo || this.cutoffK || 'SS';
      if (rk === k) rk = this.nearestTo(BASEP[2], [k, 'C', 'P']);
      const lead = runners.reduce((a, r) => (!a || (r.to > a.to) ? r : a), null);
      const tb = pl.forceRelay ? pl.relayTarget : lead ? (lead.isBatter ? 2 : lead.to % 4) : 2;
      pl.forceRelay = null;
      if (rk === this.my || (!pl.returnTo && pl.coverSpot && pl.coverSpot.who === this.my && pl.cov && pl.cov.role === 'cut')) { rk = this.my; toMe = true; }
      // 中継の人が今いる所へ投げる(誰もいない所へは投げない)
      if (toMe) to = pl.coverSpot && pl.coverSpot.ring ? pl.coverSpot.p.clone() : this.ctx.player.pos.clone().setY(0);
      else to = this.fig[rk] ? this.fig[rk].root.position.clone().setY(0) : BASEP[tb].clone().lerp(F.root.position.clone().setY(0), 0.42);
      pl.relayTarget = tb;
    } else {
      rk = this.cover[target];
      // 11/28 自分(プレイヤー)が塁に着いている(2 m 以内)なら、役目の人が別でも自分へ投げる
      if (!HOMEFIX_OFF && k !== this.my && !this.watching && this.ctx.player && Math.hypot(this.ctx.player.pos.x - BASEP[target].x, this.ctx.player.pos.z - BASEP[target].z) < 2.0) {
        const ck = rk && rk !== k && this.fig[rk] ? Math.hypot(this.fig[rk].root.position.x - BASEP[target].x, this.fig[rk].root.position.z - BASEP[target].z) : 99;
        if (rk === k || ck > 1.5) rk = this.my;
      }
      if (rk === k) {
        // 塁に入る役目の人が自分で球を持った: 一塁なら自分で踏みに行く、ほかの塁は近くの別の人へ
        if (target === 1) { pl.aiThinking = true; pl.selfTagK = k; F.target = BASEP[1].clone(); return; }
        rk = this.nearestTo(BASEP[target], [k, this.my]);
      }
      // 塁に入る役目の人が遠く(ほかの塁へ回っている等)て、球より 0.4 秒以上遅れるなら、間に合う近くの人へ。誰も間に合わなければ投げない
      if (rk && rk !== this.my && this.fig[rk] && target !== 0) {
        const late = (q) => { const G = this.fig[q]; if (!G) return 99; const dd = Math.hypot(G.root.position.x - BASEP[target].x, G.root.position.z - BASEP[target].z); const need = dd < 1.5 ? 0 : this.runTime(dd, 7.2) + 0.25; const fly = 0.6 + Math.hypot(BASEP[target].x - F.root.position.x, BASEP[target].z - F.root.position.z) / 28; return need - fly; };
        if (late(rk) > 0.4) {
          const alt = this.nearestTo(BASEP[target], [k, this.my, rk]);
          if (alt && late(alt) <= 0.4) rk = alt;
          else { pl.aiThinking = false; return; }
        }
      }
      to = target === 0 ? HOME_RECV.clone() : BASEP[target].clone();
      if (rk === this.my) toMe = true;
      if (!toMe && rk && this.fig[rk]) { this.fig[rk].target = to.clone(); this.fig[rk].root.visible = true; }
      // 11/21 一塁へ: 受け手はベースを踏んで伸びる所へ、送球は伸ばしたグラブの所(高さ 1.0 m)へ
      pl.first1 = null;
      if (target === 1 && !toMe) { const s1 = this.firstRecv(pl, rk, F.root.position); if (s1) { this.fig[rk].target = s1.p.clone(); this.fig[rk].target.snap = true; to = s1.glove.clone(); } }
    }
    // 併殺の二塁から一塁への転送は素早く(0.25 秒)、ほかは受ける所を指してから(0.45 秒)
    const dpTurn = target === 1 && (pl.outs || 0) >= 1 && pl.thrown && (pl.thrown.base === 2 || (!AICOMMIT_OFF && pl.thrown.base === 0 && k === 'C'));   // 11/28 本塁で封殺した捕手から一塁(ホームゲッツー)も素早く
    const relay = pl.thrown && pl.thrown.relayTo != null;
    const clipThrow = F.prep && F.prep.rel && pl.thrown;   // 中継・併殺の動きの中で投げる
    // 11/25 外野手が地面の球(抜けた・落ちた球)を拾った時は、拾いながら投げる形に入る(1.25〜1.5 秒 → 0.95〜1.15 秒。高校生の外野手の返球の速さ)。フライを捕った時は今までどおり
    const grPick = POS[k].of && !LOOSE_OFF && F._grPick != null && F._grPick === pl.caughtT;
    let turn = dpTurn ? 0.55 : relay ? 0.7 : POS[k].of ? (grPick ? 0.95 + this.rng() * 0.2 : 1.25 + this.rng() * 0.25) : k === 'C' ? 0.7 : 0.6 + this.rng() * 0.25;
    if (clipThrow) turn = Math.max(0.05, F.prep.rel - F.prep.ct - Math.max(0, pl.t - F.prep.catchAt));
    if (!clipThrow) {
      F.pointAt = to.clone(); F.pointT = Math.min(Math.max(0, turn - 0.22), 0.45); F.setYawToward(to.x, to.z);
      F.tossTo = target === 2 && Math.hypot(to.x - F.root.position.x, to.z - F.root.position.z) < 9;   // 併殺の二塁へ近くからは下手のトス
      this.later(Math.max(0, turn - 0.22), () => { if (this.play === pl && !pl.endT) { F.setYawToward(to.x, to.z); F.throwT = 0.35; F.pointT = 0; F.prep = null; } });
    }
    F.pointAt = to.clone(); F.pointT = turn;
    this.later(turn, () => {
      if (this.play !== pl || pl.endT) return;
      // 11/28 満塁のゴロで、遊撃手が本塁へ投げると決めた後にそばを走る走者を追い、決め直した三塁への送球も予約され、本塁へ投げた球が 0.2 秒後に三塁へ投げ直されていた(tools/homedp_1128.py)。
      //   投げる時に、まだ自分が球を持っていて、自分の決めた送球の時だけ投げる
      if (!AICOMMIT_OFF && (pl.holder !== k || pl.aiTok !== aiTok)) return;
      // 投げる時にもう一度: 構える間に走者が止まった・戻り終えた塁へは投げない(持ったまま、次のこまで決め直す)
      if (typeof target === 'number' && !this.baseLive(target)) { (this._emptySkip = this._emptySkip || []).push({ base: target, from: k, late: true }); pl.aiThinking = false; pl.aiCommit = null; F.pointT = 0; return; }
      if (target === 'cut' && !toMe && rk && this.fig[rk]) to = this.fig[rk].root.position.clone().setY(0);   // 中継の人が今いる所へ
      if (target === 1 && pl.first1 && pl.first1.k === rk && !toMe) { const s1 = this.firstRecv(pl, rk, F.root.position); to = s1.glove.clone(); this.fig[rk].target = s1.p.clone(); this.fig[rk].target.snap = true; }   // 11/21 投げる時の所から決め直す
      F.setYawToward(to.x, to.z);
      const from = F.root.position.clone().add(V(0.2, 1.7, 0));
      const dist = Math.hypot(to.x - from.x, to.z - from.z);
      const of = !!POS[k].of;
      let speed = of ? ofThrowSpeed(dist) : Math.min(36, 29 + dist * 0.17);   // 外野の送球は高校生の 90〜110 km/h(ofThrowSpeed)
      if (of && this.cpuArmK) { try { speed *= this.cpuArmK(k, dist) || 1; } catch (e) { /* 無くても投げる */ } }   // 11/28 持ち主「肩の強さが良くなるにつれて改善」: 守備のキャリアでは CPU の外野手も段ごとの肩で(js/career.js)
      // 11/22 一塁へ走って入るカバーの人へは、着く時に合わせて緩める・走る道の上へ(firstLead)
      let lead = false;
      if (target === 1 && !toMe && pl.first1 && pl.first1.k === rk) { const L1 = this.firstLead(pl, rk, from, to, speed); to = L1.to; speed = L1.speed; lead = !!L1.lead; if (lead) F.setYawToward(to.x, to.z); }
      // 外野からの遠い返球は、低く速いワンバウンドで(内野の前で 1 回跳ねる)
      const hop = of && dist > 55 && target !== 'cut' && this.rng() < 0.6;
      const aim = hop ? to.clone().lerp(from.clone().setY(0), 9 / dist) : to;
      const s = solveThrow(from, aim, speed, hop ? -1.5 : lead ? 1.2 : target === 1 && pl.first1 && pl.first1.k === rk ? 1.0 : 1.35);   // 11/21 一塁は伸ばしたグラブの高さ(1.0 m)へ
      const path = predict(this.world, from, s.v, s.w, 6, { Cd: 0.35, clScale: 0, dt: DT });
      pl.thrown = { from: k, fromK: k, base: target === 'cut' ? null : target, to: toMe ? 'me' : rk, relayTo: target === 'cut' ? pl.relayTarget : null, eta: pl.t + this.arriveT(path, to) };
      pl.holder = null; this.holderFig = null; pl.aiThinking = false; pl.aiCommit = null;
      pl.myLock = false; pl.overChase = false;
      this.launch(path, pl.t);
      this.receiverGo(pl, rk, toMe);
      if (this.kind === 'game' && target !== 'cut') this.say({ 1: 'to_first', 2: 'to_second', 3: 'to_third', 0: 'to_home' }[target], { maxWait: 0.5 });
    });
  }
  homeRun(pl) {
    if (pl.hr) return;
    this.ball = null; this.ballView.show(false); this.shadow.visible = false;
    pl.hr = true; pl.hrT = pl.t;
    for (const r of [this.batterRunner, ...this.runners]) if (r && !r.out) { r.run = true; r.done = false; r.to = 4; r.half = false; r.returning = false; r.trot = true; r.startAt = pl.t; }
    this.say(['hr_carry', 'hr'], { cut: true }); this.ctx.sound.crowdEvent('hr', 1);
    const n = [this.batterRunner, ...this.runners].filter((r) => r && !r.out).length;
    if (!this.ffw && !this.watching && this.ctx.ui && this.ctx.ui.homeRun) this.ctx.ui.homeRun(false, ['ソロ', 'ツーラン', 'スリーラン', '満塁'][Math.max(0, Math.min(3, n - 1))]);   // 真ん中の題字(1.7 秒)
    // 11/18 持ち主「ホームランが出たらパッと切り替わるように」: 走者が回り終えるのを待たず、1.5 秒見せたら次の打者へ(得点は applyResult が塁の人数で数える)
    this.later(1.5, () => { if (this.play === pl && pl.endT == null) this.finishPlay(pl, 'ホームラン'); });
  }
  ballDead(pl) {
    if (this.kind === 'knock' && pl.thrown && !this.anyMoving()) { this.ball = null; this.ballView.show(false); this.finishPlay(pl, '悪送球'); return; }
    const b = this.ball;
    const end = samplePath(b.path, pathDuration(b.path), V());
    const out = Math.abs(end.x) > 120 || end.z < -125 || end.z > 25 || end.y > 2.5 || end.y < -0.3;   // ベンチ(地面より低い所)に入った球もボールデッド
    if (out) {
      this.ball = null; this.ballView.show(false);
      const hr = end.z < -90 && !pl.thrown;
      if (hr) {
        for (const r of [this.batterRunner, ...this.runners]) if (r && !r.out) { r.run = true; r.done = false; r.to = 4; }
        this.say(['hr_carry', 'hr'], { cut: true }); this.ctx.sound.crowdEvent('hr', 1);
        this.finishPlay(pl, 'ホームラン');
      } else this.finishPlay(pl, 'ボールデッド');
      return;
    }
    if (!pl.loosePick) {
      pl.loosePick = true;
      const nearHome = Math.hypot(end.x, end.z) < 25;
      let bestK = null, bd = 1e9;
      for (const k of Object.keys(POS)) {
        if (k === this.my || (!nearHome && (k === 'C' || k === 'P')) || !this.fig[k].root.visible) continue;
        if (pl.thrown && pl.thrown.fromK === k) continue;
        const d = this.fig[k].root.position.distanceTo(end);
        if (d < bd) { bd = d; bestK = k; }
      }
      const meD = this.ctx.player.pos.distanceTo(end);
      if (bestK && (bd < meD + 6 || this.kind === 'knock')) { this.fig[bestK].target = V(end.x, 0, end.z); this.fig[bestK].chase = null; pl.opt.fielder = bestK; this.fig[bestK].role = 'field'; this.fig[bestK].noCatchUntil = 0; pl.looseK = bestK; }
      for (const r of this.runners) if (!r.out && r.run) r.to = Math.min(4, r.to + (r.base === 2 ? 1 : 0));
    }
    b.path = predict(this.world, end, V(), V(), 0.1, { dt: DT });
    b.t0 = pl.t; b.tPrev = 0;
    if (!pl.thrown) pl.groundStop = true;   // 11/27 打球は地面で止まった(この後に拾っても直接捕球ではない)
  }
  finishPlay(pl, label) {
    if (pl.endT != null) return;
    // 11/20 持ち主「アウトや1つのプレーが終わった後余りにも次のシーンが速すぎる」: 試合・観戦は 0.55 → 1.15 秒(3 アウト目は 0.3 → 0.8 秒)。
    // 審判のコールと「アウト!」「一塁アウト」の実況(0.7〜1.1 秒)を言い終わるくらい。ノックは今のまま。?quick=1(試験)は前の短さ
    const quick = this.ctx.params && this.ctx.params.has && this.ctx.params.has('quick');
    pl.endT = this.kind === 'knock' ? 0.45 : (this.g && this.g.outs + (pl.outs || 0) >= 3 ? (quick ? 0.3 : 0.8) : (quick ? 0.55 : 1.15));   // 3 アウト目は短め(すぐチェンジへ)
    pl.label = label;
    // 動いていない走者は塁へ戻る(リードのまま止まらない)
    for (const r of this.runners) if (!r.out && !r.scored && !(r.run && !r.done) && r.dist > 0.3) { r.returning = true; r.run = false; }
    this.evalPlay(pl);
    pl.choiceOpen = false;
    this.updatePad();
    this.ring.visible = false;
  }
  // ------------------------------------------------------------ フェア・ファウル
  // 一・三塁より先は最初に落ちた所、手前は止まった所・野手が触れた所・塁の横を過ぎた所で決める
  // 打った時点で、地面を転がる打球がファウルになるかを見通す(際どい物は 'close'、はっきりファウルは 'foul'、フェアは 'fair')
  predictFoulGround(pl) {
    const path = pl.batted && pl.batted.path; if (!path) return 'fair';
    const margin = (x, z) => (-z - Math.abs(x)) / Math.SQRT2;   // フェアの内側が正(m)
    const ev = path.events.find((e) => e.type === 'bounce' || e.type === 'roll' || e.type === 'stop' || e.type === 'wall');
    let px = null, pz = null;
    if (ev && ev.p && Math.hypot(ev.p.x, ev.p.z) > 27.0) { px = ev.p.x; pz = ev.p.z; }
    else {
      for (let i = 0; i < path.n; i++) { const x = path.pts[i * 4], z = path.pts[i * 4 + 2]; if (Math.hypot(x, z) > 27.0) { px = x; pz = z; break; } }
      if (px == null) { const j = (path.n - 1) * 4; px = path.pts[j]; pz = path.pts[j + 2]; }
    }
    if (pz > 0.3) return 'foul';
    const m = margin(px, pz);
    return m > 1.2 ? 'fair' : m < -1.2 ? 'foul' : 'close';
  }
  judgeFair(pl) {
    const b = this.ball, path = b.path, t1 = pl.t - b.t0;
    const ev = path.events.find((e) => (e.type === 'bounce' || e.type === 'roll' || e.type === 'wall' || e.type === 'stop') && e.t <= t1);
    const p = this.ballPos || V();
    if (!ev) return;
    const ep = ev.p || p;
    if (ep.z > 0.3 || p.z > 0.3) { pl.fairKnown = true; this.foulCall(pl); return; }   // 本塁より後ろ(バックネット)
    const far = Math.hypot(ep.x, ep.z) > 27.0;
    if (far) { pl.fairKnown = true; if (!isFair(ep.x, ep.z)) this.foulCall(pl); return; }
    // 手前に落ちた: 転がって一・三塁の横を過ぎるか止まるまで待つ
    const past = Math.hypot(p.x, p.z) > 27.0;
    const stopped = t1 > pathDuration(path) - 0.05;
    if (past || stopped) { pl.fairKnown = true; if (!isFair(p.x, p.z)) this.foulCall(pl); }
  }
  foulCall(pl) {
    if (pl.foulCalled) return;
    pl.foulCalled = true;
    const c = this.ctx;
    const u = this.ump[0];
    const side = (this.ballPos && this.ballPos.x) || 1;
    if (u) u.setYawToward(side > 0 ? 30 : -30, -20);
    this.umpCall('foul', 0);
    this.hush('ファウル', '', { ms: 900 });
    if (this.kind === 'game') this.say('foul', { maxWait: 0.8 });
    c.sound.crowdEvent('foul', 0.6);
    for (const r of [this.batterRunner, ...this.runners]) if (r && !r.out) { r.run = false; r.half = false; r.done = true; if (!r.isBatter && r.dist > 0.3) r.returning = true; }
    if (this.batterRunner) { this.batterRunner.dist = 0; this.batterRunner.from = 0; }
    this.finishPlay(pl, 'ファウル');
  }
  // 11/23 自分の場面のファウルフライ・線際は、取れる物だけ(12 回まで作り直す。だめなら前からある捕れる所のファウルフライ)
  makeFoulCatchable(type, p0) {
    if (type !== 'foul_fly' && type !== 'foul_line') return this.makeFoul(type, p0);
    let b = null;
    for (let tr = 0; tr < 12; tr++) { b = this.makeFoul(type, p0); if (this.catchableFoul(b)) return b; }
    for (let tr = 0; tr < 6; tr++) { b = this.makeFoul('foul_fly', p0, tr > 2); if (this.catchableFoul(b)) return b; }   // 線際のライナーが抜ける当たりにしかならない時は、取れるファウルフライに替える
    return b;
  }
  // ファウルの打球(ゴロ・フライ・バックネットへのチップ・スタンド)
  makeFoul(type, p0, plain = false) {
    const rng = this.rng, my = this.my;
    const sgn = my === '3B' || my === 'SS' || my === 'LF' ? -1 : my === '1B' || my === '2B' || my === 'RF' ? 1 : (rng() < 0.5 ? -1 : 1);
    const at = (aDeg, d, y = 0) => V(sgn * d * Math.sin(aDeg * D2R), y, -d * Math.cos(aDeg * D2R));
    if (type === 'foul_tip') {
      // バックネットへのファウル(後ろへ飛ぶ)
      const v = V((rng() * 2 - 1) * 5, 9 + rng() * 6, 24 + rng() * 6);
      const w = V(-180, 0, 0);
      return { path: predict(this.world, p0, v, w, 5, { Cd: 0.35, clScale: 1.0, dt: DT }), type: 'foul_tip', v, w, p0: p0.clone() };
    }
    if (type === 'foul_grounder') return this.makeBall('grounder', at(47 + rng() * 4, 30 + rng() * 6), 0.4, p0);
    if (type === 'foul_line') {
      // ライン際(フェアかファウルかぎりぎり)
      const of = !!POS[my].of;
      return of ? this.makeBall('liner', at(43.5 + rng() * 3.5, 62 + rng() * 14, 1.2), 0.85, p0) : this.makeBall('grounder', at(43.6 + rng() * 2.6, 30), 0.75, p0);
    }
    if (type === 'foul_stands') return this.makeBall('pop', at(62 + rng() * 14, 48 + rng() * 10), 0.6, p0);
    // ファウルフライ(捕れる所)
    const of = !!POS[my].of;
    const d = of ? 66 + rng() * 10 : my === 'C' || my === 'P' ? 8 + rng() * 6 : 22 + rng() * 8;
    const a = of ? 47.5 + rng() * 3 : my === 'C' || my === 'P' ? 70 + rng() * 25 : 50 + rng() * 6;
    // 11/23 ファウルフライにも散らばり: 線ぎりぎり(フェアかファウルか)・切れていく・浅い・深い
    const r = rng();
    if (my !== 'C' && my !== 'P' && !plain) {
      if (r < 0.25) return this.makeBall(of ? 'fly' : 'pop', at(45 + rng() * 1.8, of ? 62 + rng() * 12 : 20 + rng() * 10), 0.5, p0);
      if (r < 0.45) return this.makeBall(of ? 'fly' : 'pop', at(46 + rng() * 2.5, of ? 64 + rng() * 10 : 24 + rng() * 8), 0.5, p0, { side: sgn * (140 + rng() * 60) });
      if (r < 0.6) return this.makeBall('pop', at(of ? 50 + rng() * 4 : 64 + rng() * 14, of ? 48 + rng() * 8 : 12 + rng() * 5), 0.4, p0, { la: 66 + rng() * 14 });
    }
    return this.makeBall('pop', at(a, d), 0.5, p0);
  }

  // ------------------------------------------------------------ 1 プレーの評価
  // fine ファインプレー / nice ナイスプレー / judge ナイス判断 / ok ふつうにアウト / hit 捕れない打球 / miss ミス
  evalPlay(pl) {
    if (pl.evaled || this.dg || pl.watch) return;
    pl.evaled = true;
    const st = this.stats, E = st.ev, c = this.ctx;
    if (pl.coverSpot && pl.coverOk == null) {   // カバーに入れたか(評価はプレーの終わりに出すので、ここで決める)
      const reduced = pl.coverStart ? 1 - (pl.coverMin ?? 99) / pl.coverStart : 0;
      pl.coverOk = !!(pl.coverDone || (pl.coverMin ?? 99) < (pl.coverSpot.ring ? 2.5 : 1.5) || (!pl.coverSpot.need && reduced > 0.6));
    }
    if (pl.label === 'ファウル' && pl.fieldedBy !== 'me') return;
    const mine = pl.opt.fielder === this.my && pl.batted && !pl.steal && !pl.notMine;   // 11/28 夕 ほかの野手が先に捕った打球は自分の打球にしない
    const caught = pl.fieldedBy === 'me' && !pl.missed;
    const reach = this.D.reach;
    const star = pl.star || (pl.batted && pl.batted.type === 'fence' ? 3 : (pl.myReach || 0) > 0.8 ? 2 : 1);
    let kind = null, text = '';
    const lt = pl.lastThrow;
    const outMade = (pl.outs || 0) > 0 || (this.kind === 'knock' && caught && (pl.decisionOk !== false));
    // 投げる塁の選び方は、それで余計な進塁(本塁への送球の間に打者走者が二塁へ、など)を許した時だけミス(11/17 持ち主)
    const extra = !!pl.extraBase || (pl.label === '悪送球' && this.kind === 'game');   // ノックの「悪送球」は走者が動いていない時の打ち切りなので進塁ではない
    const badPick = lt && lt.correct === false && extra;
    if (badPick && !pl.decCounted) { pl.decCounted = true; st.correct = Math.max(0, st.correct - 1); }
    if (badPick) { kind = 'miss'; text = 'ミス(投げる塁: 余計な進塁)'; }
    else if (pl.label === '悪送球' && lt) { kind = 'miss'; text = 'ミス(悪送球)'; }
    // カバーに入れなかった時はミスにしない(11/19 持ち主「カバーミス扱いにしないでください」)。入れた時だけ下で ok にする
    else if (mine && !caught && pl.label !== 'ホームラン' && (pl.myMin ?? 99) < reach * 0.9) { kind = 'miss'; text = 'ミス(捕球)'; }
    else if (mine && !caught && pl.label !== 'ホームラン' && this.fairReach(pl)) { kind = 'miss'; text = 'ミス(捕れる打球)'; }
    else if (mine && !caught) { kind = 'hit'; text = ''; }   // 捕れない打球は札を出さない
    // ファインプレーは本当に難しい物だけ: ジャンプ・飛び込み・フェンス際、★3 の打球を手の届く端で、横へ大きく動いて端で、強烈な当たり(150 km/h 以上)を端で(11/17 持ち主「普通に捕っただけでファインプレーとか言わせなくていい」)
    else if (caught && outMade && !this.runOnlyReach(pl) && (pl.special || (star >= 3 && (pl.myReach || 0) > 0.9 && (pl.runLat || 0) > (POS[this.my].of ? 15 : 4)) || ((pl.myReach || 0) > 0.95 && (pl.runLat || 0) > (POS[this.my].of ? 25 : 7)) || ((pl.myReach || 0) > 0.9 && pl.batted && pl.batted.v && pl.batted.v.length() > 41.5 && !POS[this.my].of && pl.caughtT - pl.contactT < 0.7))) { kind = 'fine'; text = 'ファインプレー!'; }   // 手の届く端(9 割超)で、横へ大きく動いた・反応ぎりぎりの物だけ。フェンス際の打球でも普通に捕ったら出さない
    else if (pl.tagOut === 'me') { kind = 'nice'; text = 'ナイスタッチ!'; }
    else if (caught && (pl.outs || 0) >= 2) { kind = 'nice'; text = 'ナイス併殺!'; }
    else if (caught && outMade && lt && !lt.self && lt.transfer < (POS[this.my].of ? 1.25 : 0.95)) { kind = 'nice'; text = 'ナイスプレー'; }
    else if (caught && lt && lt.correct && pl.correctAt && !pl.correctAt.includes(POS[this.my].of ? 2 : 1)) { kind = 'judge'; text = 'ナイス判断'; }
    else if (caught && POS[this.my].of && lt && !lt.self && (pl.outs || 0) > (pl.fly ? 1 : 0)) { kind = 'nice'; text = 'ナイス返球!'; }
    else if (!mine && pl.coverOk && pl.coverSpot && pl.coverSpot.need) { kind = 'ok'; text = ''; }   // 送球が来るカバーに自分で入れた
    else if (caught && outMade) { kind = 'ok'; text = ''; }   // 普通に捕ってアウト: 札は出さない
    else if (!mine && lt && lt.correct && (pl.outs || 0) > 0) { kind = 'nice'; text = pl.lastThrow && pl.lastThrow.base === 0 ? '好返球!' : 'ナイスプレー'; }
    // 内訳のための数え(自分の打球だけ)
    E.sub = E.sub || { catchN: 0, catchOk: 0, thrN: 0, thrOk: 0, tr: [], hardN: 0, hardOk: 0 };
    const S = E.sub; S.cw = S.cw || 0; S.cwOk = S.cwOk || 0; S.fs = S.fs || [];
    const chance = mine && (caught || (pl.myMin ?? 99) < reach * 0.9 || this.fairReach(pl));
    if (chance) { S.catchN++; if (caught) S.catchOk++; S.cw += star; if (caught) S.cwOk += star; }
    if (!mine && pl.coverSpot && pl.coverSpot.need && pl.coverOk) { S.covN = (S.covN || 0) + 1; S.covOk = (S.covOk || 0) + 1; }   // できた時だけ数える(できなかった分で内訳を下げない)
    if (mine && pl.batted && !pl.steal) S.fs.push(pl.firstMove != null ? pl.firstMove : 2.0);   // 一歩目(動き出さなかったら 2 秒)
    if (lt && lt.correct != null) { S.pickN = (S.pickN || 0) + 1; S.pickOk = (S.pickOk || 0) + (lt.correct ? 1 : extra ? 0 : 0.4); }   // 違う塁は余計な進塁が無くても満点にしない
    if (lt && !lt.self) { S.thrN++; if (pl.label !== '悪送球') S.thrOk++; if (lt.transfer) S.tr.push(lt.transfer); }
    const hard = mine && (star >= 2 || pl.special || (pl.myMin ?? 99) < reach * 1.5 && !caught && (pl.myMin ?? 99) > reach * 0.9);
    if (hard) { S.hardN++; if (caught) S.hardOk++; }
    if (!kind) return;
    E[kind]++;
    if (kind === 'fine' && mine && !this.watching && !this.tut) mkEv('def_fine');   // 11/22 目標
    // 名場面の言葉: 何回・どんな打球・どう捕ってどこへ
    {
      const ty = { grounder: 'ゴロ', liner: 'ライナー', fly: 'フライ', pop: '小飛球', fence: 'フェンス際の大飛球', bunt: 'バント', foul_fly: 'ファウルフライ' }[pl.batted ? pl.batted.type : ''] || '打球';
      const how = pl.special === 'dive' ? 'ダイビングキャッチ' : pl.special === 'jump' ? 'ジャンピングキャッチ' : caught ? '捕って' : '';
      const to = lt && lt.base != null ? `${['本塁', '一塁', '二塁', '三塁', '', '中継'][lt.base]}へ` : '';
      const inn = this.kind === 'game' && this.g ? `${this.g.inning}回、` : this.kind === 'knock' ? `${this.knock.n + 1}本目、` : '';
      (E.log = E.log || []).push({ kind, pts: { fine: 100, nice: 92, judge: 88, ok: 78, miss: 25 }[kind] ?? 0, text: `${inn}${ty}を${how}${how && to ? '、' : ''}${to}${kind === 'fine' ? '(ファインプレー)' : kind === 'nice' ? `(${text.replace('!', '')})` : kind === 'judge' ? '(ナイス判断)' : kind === 'miss' ? `(${text})` : ''}` });
    }
    // 点: 易しい打球をただ捕っただけは伸びない(★1 で 55・★2 で 70・★3 で 85)。ミスは 0
    const pts = kind === 'ok' ? (mine ? 28 + 17 * Math.min(3, star) : 60) : { fine: 100, nice: 82, judge: 82, miss: 0 }[kind];   // 普通に捕ってアウト: ★1 45・★2 62・★3 79
    if (pts != null) E.pts.push(Math.min(100, pts + (pl.called === 'me' && caught ? 5 : 0)));   // オーライと声を出して捕ったら少し加点
    pl.evalKind = kind;
    // 実況(commentary)が評価を受け取れるように: window の 'defense-eval' の出来事で { kind, text, special, star, outs } を渡す
    try { window.dispatchEvent(new CustomEvent('defense-eval', { detail: { kind, text, special: pl.special || null, star, outs: pl.outs || 0, fielder: this.my } })); } catch (e) { /* 無くても動く */ }
    if (text) c.ui && c.ui.evalPop && c.ui.evalPop(text, kind);
    if (kind === 'fine') { c.sound.crowdEvent('fine', 1); if (this.kind === 'game' && !pl.special) this.say('fine_play', { maxWait: 1 }); }
    else if (kind === 'nice' && this.kind === 'game') this.say(pl.outs >= 2 ? 'double_play' : 'nice_throw', { maxWait: 1 });
    else if (kind === 'miss') { c.sound.crowdEvent('miss', 0.7); if (this.kind === 'game' && text === 'ミス(捕球)') st.errors++; }
  }
  // 試合(ノック)の最後のトータルの守備評価: ランク・点数・内訳・名場面・ひとこと・前回との比べ
  evalSummary() {
    const st = this.stats, E = st.ev, n = E.pts.length, S = E.sub || { catchN: 0, catchOk: 0, thrN: 0, thrOk: 0, tr: [], hardN: 0, hardOk: 0 };
    const avg = n ? E.pts.reduce((a, b) => a + b, 0) / n : 0;
    const pct = (a, b, d) => (b ? Math.round(100 * a / b) : d);
    const of = !!POS[this.my].of, trAvg = S.tr.length ? S.tr.reduce((a, b) => a + b, 0) / S.tr.length : null;
    const speed = trAvg == null ? null : Math.max(0, Math.min(100, Math.round(100 - (trAvg - (of ? 0.9 : 0.6)) * 200)));   // 捕って投げるまで: 内野 0.6 秒・外野 0.9 秒で満点、0.5 秒遅いと 0
    const fs = S.fs || [], fsAvg = fs.length ? fs.reduce((a, b) => a + b, 0) / fs.length : null;
    const subs = [
      { k: 'カバー', v: S.covN ? Math.round(100 * S.covOk / S.covN) : null, note: S.covN ? `${S.covOk} 回` : '—' },
      { k: '捕球', v: S.cw ? Math.round(100 * S.cwOk / S.cw) : null, note: S.catchN ? `${S.catchOk}/${S.catchN}` : '—' },
      { k: '送球', v: S.thrN ? Math.round(0.5 * pct(S.thrOk, S.thrN, 0) + 0.5 * (speed ?? 60)) : null, note: S.thrN ? `正確 ${S.thrOk}/${S.thrN}${trAvg != null ? ` ・ ${trAvg.toFixed(2)}秒` : ''}` : '—' },
      { k: '判断', v: S.pickN ? Math.round(100 * S.pickOk / S.pickN) : null, note: S.pickN ? `正しい塁 ${Math.round(S.pickOk)}/${S.pickN}` : '—' },
      { k: '守備範囲', v: S.hardN ? pct(S.hardOk, S.hardN, 0) : 0, note: S.hardN ? `難しい打球 ${S.hardOk}/${S.hardN}` : '難しい打球なし' },
    ];
    const vs = subs.map((x) => x.v).filter((v) => v != null);
    let score = n ? Math.round(0.4 * avg + 0.6 * (vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : avg) - 10 * E.miss) : 0;
    if (S.pickN >= 2 && S.pickOk / S.pickN < 0.6) score = Math.min(score, 69);   // 投げる塁をよく間違えるなら C まで
    if (!S.hardOk) score = Math.min(score, 79);   // 難しい打球を 1 つも捕っていなければ B まで
    if (E.miss || S.hardOk < 2) score = Math.min(score, 91);   // S はミス無しで難しい打球を 2 つ以上
    score = Math.max(0, score);
    const rank = !n ? '—' : (score >= 85 && !E.miss && (S.hardOk || 0) >= 2 && E.fine >= 1) ? 'S' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D';   // S はノーミス・難しい打球を 2 つ以上・ファインプレーありの A
    const log = E.log || [];
    const best = log.filter((x) => x.kind !== 'miss' && x.kind !== 'hit').sort((a, b) => b.pts - a.pts)[0] || null;
    const worst = log.filter((x) => x.kind === 'miss')[0] || null;
    // ひとこと: いちばん良い所と、次の課題(いちばん低い内訳)
    const have = subs.filter((x) => x.v != null && x.k !== 'ファイン/ミス');
    const hi = have.slice().sort((a, b) => b.v - a.v)[0], lo = have.filter((x) => x.k !== 'カバー').sort((a, b) => a.v - b.v)[0];   // カバーは課題に挙げない
    const good = { 捕球: '打球への入りが確実', 送球: '送球が速くて正確', 判断: '走者を見て投げる塁を選べている', カバー: '送球の来る塁に自分で入れている', 守備範囲: '一歩目が速く、難しい打球にも届いている' };
    const next = { カバー: '送球が来る塁・中継に早く入ることが次の課題', 捕球: '捕れる打球を確実に捕ることが次の課題', 送球: '捕ってから投げるまでを速く、が次の課題', 判断: '投げる塁の判断が次の課題。走者の位置を先に見よう', 守備範囲: '一歩目をもう少し速く。打った瞬間に動き出そう' };
    let word;
    if (!n) word = '守る場面がありませんでした';
    else if (rank === 'S') word = `${good[hi ? hi.k : '捕球']}。難しい打球も落とさなかった`;
    else if (rank === 'A') word = `${good[hi ? hi.k : '捕球']}。ただ${lo && lo.v < 90 ? next[lo.k] : '難しい打球をもう一つ捕りたい'}`;
    else if (rank === 'B') word = `${lo ? next[lo.k] : '難しい打球を捕れていない'}。${E.miss ? `ミスが ${E.miss} つ` : '易しい打球を捕っただけでは上がらない'}`;
    else word = `${E.miss ? `ミスが ${E.miss} つ。` : ''}${lo ? next[lo.k] : '捕れる打球を確実に捕るところから'}`;
    // 前回・自分の最高との比べ(端末に残す。無くても動く)
    const key = `r4walk.evalHist.${this.kind}.${this.my}`;
    let hist = null;
    try { hist = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { hist = null; }
    const prev = hist ? hist.last : null, bestScore = hist ? hist.best : null;
    if (n) { try { localStorage.setItem(key, JSON.stringify({ last: score, best: Math.max(score, bestScore ?? 0) })); } catch (e) { /* 残せなくても動く */ } }
    return { fine: E.fine, nice: E.nice + E.judge, miss: E.miss, score, word, n, rank, subs, best: best && best.text, worst: worst && worst.text, prev, bestScore, newBest: n && (bestScore == null || score > bestScore) };
  }

  knockFeedback(pl) {
    const lt = pl.lastThrow, c = this.ctx;
    if (!lt || pl.fed) return;
    pl.fed = true;
    const ms = `捕ってから ${lt.transfer.toFixed(2)} 秒 ・ ${Math.round(lt.speedKmh)} km/h`;
    if (lt.correct || POS[this.my].of || !pl.extraBase) this.hush('送球', ms, { ms: 900 });
    else this.hush(`送球先は ${(pl.correctAt || []).filter((b) => b !== 5).map((b) => BASE_NAME[b]).join('・') || '—'}`, ms, { ms: 1200 });
  }
  closePlay(pl) {
    if (pl.watch && this.prevView && this.ctx.setViewQuiet) { this.ctx.setViewQuiet(this.prevView); this.prevView = null; }
    this.ballView.show(false); this.shadow.visible = false; this.ball = null; this.holderFig = null;
    if (pl.coverSpot) {
      this.stats.coverTotal++;
      const reduced = pl.coverStart ? 1 - (pl.coverMin ?? 99) / pl.coverStart : 0;
      const ok = pl.coverDone || (pl.coverMin ?? 99) < (pl.coverSpot.ring ? 2.5 : 1.5) || (!pl.coverSpot.need && reduced > 0.6);
      pl.coverOk = ok;
      if (ok) this.stats.cover++;   // 入れなかった時はエラーに数えない(11/19 持ち主)
    }
    this.play = null;
    if (this.kind === 'game') this.applyResult(pl);
    else {
      this.knockScore(pl);
      this.knock.n++;
      const every = this.knock.N >= 50 ? 10 : 5;
      this.wait = this.knock.n % every === 0 ? 0.9 : 0.25;
      if (this.knock.n % every === 0 && this.knock.n < this.knock.N) this.hush(`あと ${this.knock.N - this.knock.n} 本`, '', { ms: 900 });
    }
    this.resetFiguresSoft();
    this.updatePad();
  }
  // ノックの 1 本の点: 自分で捕って(抜けた球を拾って返したのは捕球に数えない)、要る時は正しい塁へ
  knockScore(pl) {
    const s = this.stats, st = pl.star || 1;
    if (pl.label === 'ファウル' && pl.fieldedBy !== 'me') { this.knock.n--; return; }   // ファウルは数えない(もう 1 本)
    const caught = pl.fieldedBy === 'me' && !pl.missed;
    const ok = caught && pl.decisionOk !== false;
    if (s.star && s.star[st]) { s.star[st][1]++; if (ok) s.star[st][0]++; }
    if (!caught) s.streak = 0;
  }
  resetFiguresSoft() { for (const k of Object.keys(POS)) { const f = this.fig[k]; f.target = f.home.clone(); f.role = null; f.noCatchUntil = 0; } }

  // ------------------------------------------------------------ 試合の結果を状態へ
  applyResult(pl) {
    const g = this.g;
    if (pl.label === 'ファウル') {
      if (pl.isBunt && g.strikes >= 2) {
        // スリーバント失敗は三振
        g.balls = g.strikes = 0; R.addOuts(g, 1); g.log.push('スリーバント失敗(三振)'); this.lastPlay = { msg: '三振', outs: 1, runs: 0 };
        this.hush('三振', 'スリーバント失敗', { ms: 1200 }); this.umpCall('strike_out', 0);
        this.afterPA(); return;
      }
      // 打席は続く(2 ストライク後のファウルは数えない)
      if (g.strikes < 2) g.strikes++;
      this.contPA = true;
      g.log.push('ファウル');
      this.afterPA();
      return;
    }
    let runs = 0;
    const all = [this.batterRunner, ...this.runners];
    if (pl.label === 'ホームラン') { runs = all.filter((r) => r && !r.out).length; g.bases = [false, false, false]; }
    else {
      const nb = [false, false, false]; var on = [null, null, null];   // 塁に残った人の背番号
      for (const r of all) {
        if (!r || r.out) continue;
        if (r.scored) { runs++; continue; }
        let b = r.from;
        if (r.run && !r.done && r.dist > 13.7 && !r.half) b = (r.from + 1) % 4;
        if (b === 0 && !r.isBatter) { runs++; continue; }
        if (r.isBatter && b === 0) { if (!r.run && r.done) continue; b = 1; }
        if (nb[b - 1]) { const k = [2, 1, 0].find((i) => !nb[i] && i > b - 1); if (k != null) { nb[k] = true; on[k] = r.num; } else runs++; } else { nb[b - 1] = true; on[b - 1] = r.num; }
      }
      g.bases = nb;
    }
    // 3 アウト目がフォースアウト(打者が一塁に着く前を含む)なら、その間の得点は入らない
    // 2 アウトから打者がアウト(フライを捕られた・一塁に着く前にアウト)で 3 アウト目なら、その間に本塁を踏んでも点は入らない(11/19 点検: 満塁のフライで 1 点入っていた)
    const batterOut3 = g.outs === 2 && all.some((r) => r && r.isBatter && r.out && (r.flyOut || r.from === 0));   // 一塁を回ってから二塁で刺されたのはタイムプレー(先に踏んだ点は入る)
    if (g.outs + pl.outs >= 3 && (pl.lastOutForce || batterOut3)) runs = 0;
    if (g.outs + pl.outs >= 3) g.bases = [false, false, false];
    R.addOuts(g, pl.outs);
    R.addRuns(g, runs);
    this.saveNums(g.bases.some(Boolean) && on ? on.map((x, i) => (g.bases[i] ? x : null)) : [null, null, null]);
    let msg = pl.label || '';
    if (!msg || msg === 'ok' || msg === 'ng') msg = pl.outs >= 2 ? 'ダブルプレー' : pl.outs === 1 ? 'アウト' : runs ? `${runs} 点` : 'セーフ';
    if (runs && pl.outs && !/点/.test(msg)) msg += ` ・ ${runs} 点`;
    g.log.push(msg);
    this.lastPlay = { msg, outs: pl.outs, runs, runLog: pl.runLog || [] };
    (this.runHist = this.runHist || []).push(...(pl.runLog || []).map((x) => ({ ...x, msg })));
    (this.runRes = this.runRes || []).push(...this.runners.map((r) => ({ start: r.base, end: r.scored ? 4 : r.out ? -1 : r.from + (r.dist > 13 ? 1 : 0), out: !!r.out, scored: !!r.scored, ofHit: !!pl.ofHit, fly: !!pl.fly, caughtFly: pl.fly && pl.fieldedBy != null && !pl.flyDropped, tagup: !!r.tagup, outs0: g.outs, zone: pl.opt.fielder })));
    if (runs && pl.label !== 'ホームラン' && !pl.said.scoreSnd) this.ctx.sound.crowdEvent('score', Math.min(1, 0.6 + 0.2 * runs));
    // 実況: 落ち着いて状況をまとめる
    if (g.outs < 3) this.later0(0.9, () => this.saySituation());
    this.crowdPressure();
    this.afterPA();
  }
  later0(sec, fn) { (this.pend = this.pend || []).push({ at: this.t + sec, fn }); }
  saySituation() {
    const g = this.g; if (!g) return;
    const b = g.bases, key = b[0] && b[1] && b[2] ? 'loaded' : b[0] && b[1] ? 'runner_12' : b[0] && b[2] ? 'runner_13' : b[1] && b[2] ? 'runner_23' : b[0] ? 'runner_1' : b[1] ? 'runner_2' : b[2] ? 'runner_3' : null;
    if (g.outs === 2 && key === 'loaded') { this.say(['two_out_loaded', g.inning >= 7 ? 'big_moment' : null], { maxWait: 2 }); this.ctx.sound.mood(0.75, 1.2); return; }
    const pinch = (b[1] || b[2]) && g.inning >= 7 && Math.abs(g.score.us - g.score.them) <= 1;
    this.say([['no_out', 'one_out', 'two_out'][g.outs], key, pinch ? 'pinch' : null], { maxWait: 2 });
    this.ctx.sound.mood(pinch ? 0.7 : 1, 1.2);
  }
  afterPA() {
    this.layRunners();
    // 打席が終わったら、打席には次の打者(同じ番号の人が塁と打席に二人いないように)
    if (this.g && !this.contPA && this.batter && this.batter.setNumber) { const o = this.awayOrder(); this.batter.setNumber(String(o[(this.g.pa || 0) % 9])); }
    this.placeMe();
    this.wait = this.g && this.g.outs >= 3 ? 0 : 0.1;
  }

  // ------------------------------------------------------------ 次へ
  next() {
    if (this.kind === 'knock') return this.nextKnock();
    return this.nextPA();
  }
  nextKnock() {
    const k = this.knock;
    if (this.tut && this.guide.tutBall()) return;   // 練習の間は打球を練習の側で決める
    if (k.n >= k.N) { this.endKnock(); return; }
    const rng = this.rng, g = this.g;
    // 想定の走者とアウト(本物のノックのように、1 本ごとに場面を決める)
    const S = [[[false, false, false], 34], [[true, false, false], 24], [[false, true, false], 11], [[true, true, false], 10], [[false, false, true], 8], [[true, false, true], 6], [[true, true, true], 7]];
    let r = rng() * 100, bases = S[0][0];
    for (const [b, w] of S) { if ((r -= w) <= 0) { bases = b; break; } }
    g.bases = bases.slice(); g.outs = Math.floor(rng() * 3); g.half = 'top'; g.balls = g.strikes = 0; g.hand = rng() < 0.3 ? 'L' : 'R';
    this.layRunners();
    // 打球の難しさ(★1〜3)。まぜるは 1 本ごとにばらばら
    this.applyAlignment();   // 守備位置を先に決める(打球の届き方はこの位置から見る)
    const kb = this.varietyBall(null);   // 11/20 打球の種類をばらばらに(難しさの設定は無し)
    const star = kb.star;
    k.scen = R.BASE_NAME && bases.some(Boolean) ? bases.map((b, i) => (b ? ['一', '二', '三'][i] : '')).filter(Boolean).join('') + '塁' : 'なし';
    this.applyAlignment();
    const sitT = Math.min(0.6, this.showSituation());
    this.startPlay({ fielder: this.my, by: 'knock', star, kb: kb.label, kind: kb.kind, make: kb.make, L: kb.L, type: kb.type, sitT, randEV: true });
  }
  // ノックの打球を 1 本作る。★1 は正面、★3 は飛び込みやジャンプが要る物も
  knockBall(star) {
    const rng = this.rng, my = this.my, of = !!POS[my].of;
    const at = this.homeOf(my).setY(0), fromHome = V(at.x, 0, at.z).normalize(), side = V(-fromHome.z, 0, fromHome.x);
    const sgn = () => (rng() < 0.5 ? -1 : 1), pick = (a) => a[Math.floor(rng() * a.length)];
    const T = (lat, dep, y = 0) => { const t = at.clone().addScaledVector(side, lat).addScaledVector(fromHome, dep); t.y = y; t.x = THREE.MathUtils.clamp(t.x, -110, 110); return t; };
    const L = star === 1 ? 0.05 + rng() * 0.2 : star === 2 ? 0.35 + rng() * 0.25 : 0.7 + rng() * 0.3;
    const mk = (type, t, l = L) => (p0) => this.makeBall(type, t, l, p0);
    if (!of) {
      // 逆シングル: 右投げの内野手の右(三塁側)。一二塁間の深い所は一塁手・二塁手、三遊間の深い所は遊撃・三塁
      const back = my === 'SS' || my === '3B' ? -1 : 1;
      const opts = star === 1 ? [['正面のゴロ', () => mk('grounder', T(sgn() * rng() * 0.6, 6))], ['正面のゴロ', () => mk('grounder', T(sgn() * rng() * 0.5, 6))], ['小フライ', () => mk('pop', T(sgn() * 1.5, -1))]]
        : star === 2 ? [['横のゴロ', () => mk('grounder', T(sgn() * (1.6 + rng() * 1.6), 6))], ['ライナー', () => { const t = T(sgn() * rng(), 0, 1.0 + rng() * 0.8); return mk('liner', t); }], ['横のゴロ', () => mk('grounder', T(sgn() * (1.5 + rng() * 1.5), 6))], ['高い内野フライ', () => mk('pop', T(sgn() * 3, -3))]]
          : [['深い所のゴロ(飛び込む)', () => mk('grounder', T(back * (4.6 + rng() * 1.0), 7), 0.85)], ['逆シングル', () => mk('grounder', T(-back * (3.4 + rng() * 0.8), 6), 0.9)], ['ショートバウンド', () => mk('grounder', T(sgn() * rng() * 0.6, 2), 1.0)],
            ['頭の上のライナー(跳ぶ)', () => mk('liner', T(sgn() * rng() * 0.4, 0, 2.75 + rng() * 0.15), 0.8)], ...(this.ctx.indoor ? [['高い内野フライ', () => mk('pop', T(sgn() * 3, -4), 0.6)]] : [['風で流れる内野フライ', () => this.windBall('pop', T(sgn() * 5, -5), 0.6)]]), [this.oldHop() ? 'バウンドの変わるゴロ' : '正面寄りのゴロ', () => this.badHop(T(sgn() * rng() * 1.2, 6))]];
      if (star >= 2 && (my === '1B' || my === '3B')) opts.push(['ライン際(フェアかファウルか)', () => (p0) => this.makeFoul('foul_line', p0)]);
      const [label, f] = pick(opts);
      const type = /フライ/.test(label) ? 'pop' : /ライナー/.test(label) ? 'liner' : 'grounder';
      return { label, make: f(), L, type };
    }
    const opts = star === 1 ? [['イージーフライ', () => mk('fly', T(sgn() * rng() * 3, sgn() * rng() * 3))], ['正面のライナー', () => mk('fly', T(sgn() * rng() * 2, rng() * 4))]]
      : star === 2 ? [['横へのフライ', () => mk('fly', T(sgn() * (7 + rng() * 6), sgn() * rng() * 5))], ['頭の上を越えるフライ', () => mk('fly', T(sgn() * rng() * 4, -(8 + rng() * 5)))], ['前のライナー', () => mk('fly', T(sgn() * rng() * 3, 8 + rng() * 5))], ['外野の前のゴロ', () => mk('grounder', T(sgn() * rng() * 4, -6))]]
        : [['フェンス際', () => (p0) => { const ang = Math.atan2(at.x, -at.z) / D2R; let a2 = ang + (rng() * 2 - 1) * 5; if (Math.abs(a2) < 10) a2 = (a2 < 0 ? -1 : 1) * (10 + rng() * 5); return this.makeFenceBall(Math.max(-42, Math.min(42, a2)), -0.3 + rng() * 1.0, p0); }],
          ['前に落ちる打球(飛び込む)', () => mk('fly', T(sgn() * rng() * 2, 13 + rng() * 4), 0.4)], ['左中間・右中間を破る', () => mk('fly', T(sgn() * (15 + rng() * 5), -(4 + rng() * 6)))],
          ...(this.ctx.indoor && !this.ctx.semiOpen ? [] : [['風で流れるフライ', () => this.windBall('fly', T(sgn() * (4 + rng() * 4), -(2 + rng() * 6)), 0.5)]]), ['ライナー性の当たり', () => mk('liner', T(sgn() * (5 + rng() * 4), 4, 1.2), 0.9)]];
    if (star >= 2 && (my === 'LF' || my === 'RF')) opts.push(['ライン際(フェアかファウルか)', () => (p0) => this.makeFoul('foul_line', p0)]);
    const [label, f] = pick(opts);
    return { label, make: f(), L, type: /ゴロ/.test(label) ? 'grounder' : /ライナー/.test(label) ? 'liner' : 'fly' };
  }
  // 打球の種類を 1 つ選んで作る(11/20)。cat: 規則で決まった打球('grounder' ならゴロの仲間、ほかは飛球の仲間)。null なら全部から
  // 返す: { kind, label, star, type, make, L }。ダイビング・ジャンプの物は、ボタンを押せば届く所・高さに作る(試験 tools/kindtest.py)
  varietyBall(cat, want) {   // want: 種類を決めて作る(試験 tools/kindtest.py)
    const rng = this.rng, my = this.my, of = !!POS[my].of;
    const at = this.homeOf(my).setY(0), out = V(at.x, 0, at.z).normalize(), side = V(-out.z, 0, out.x);
    const sgn = () => (rng() < 0.5 ? -1 : 1), SG = sgn();
    // lat: 横(m)、front: 守備位置から本塁の方へ(m。負は後ろ)、y: 高さ
    const T = (lat, front, y = 0) => { const t = at.clone().addScaledVector(side, lat).addScaledVector(out, -front); t.y = y; t.x = THREE.MathUtils.clamp(t.x, -110, 110); return t; };
    const mk = (type, t, l) => (p0) => this.makeBall(type, t, l, p0);
    const back = my === 'SS' || my === '3B' ? -1 : 1;   // 深い所(三遊間・一二塁間の奥)の向き
    const gap = my === 'LF' ? 1 : my === 'RF' ? -1 : SG;   // 外野の間(左中間・右中間)の向き。左翼・右翼は中堅の方へ(線の外へ転がさない)
    const fence = (h) => (p0) => { const ang = Math.atan2(at.x, -at.z) / D2R; let a2 = ang + (this.rng() * 2 - 1) * 5; if (Math.abs(a2) < 10) a2 = (a2 < 0 ? -1 : 1) * (10 + this.rng() * 5); a2 = Math.max(-42, Math.min(42, a2)); return this.makeFenceBall(a2, h == null ? 2.75 + this.rng() * 0.85 - this.fenceInfo(a2).top : h, p0, h == null ? 36 + this.rng() * 12 : 30); };   // h なし: フェンスの所で地面から 2.75〜3.6 m(跳べば届く高さ。フェンスの高さによらない。低い所はフェンスに当たる前に捕る)   // 11/20 this.rng(): 種類を確かめた打球と本当に飛ぶ打球を同じにする(下の det)
    const indoor = this.ctx.indoor && !this.ctx.semiOpen;
    // 11/21 持ち主「打球の種類バリエーションをもっと大量に各ポジション増やして」: 本物の野球で各位置に来る打球を足した。
    // 種類(kind: 簡単・少し動く…)ごとの出る割合は前のまま(KIND_W を同じ種類の打球の数で割る)で、名前(打ち方)だけ増やす。だから捕れる割合は大きく変わらない。
    // 打者の左右(g.hand)で引っぱる向き・切れる向きを変える。回転(切れる・伸びる・沈む)は道筋の中で効く(makeBall の o)
    const pull = this.g && this.g.hand === 'L' ? 1 : -1;   // 引っぱった打球の横の向き(lat の符号。右打者は三塁側 = 負)
    const mid = at.x < 0 ? 1 : -1;   // 二塁ベースの方(二遊間・一二塁間・三遊間)
    const mkO = (type, t, l, o) => (p0) => this.makeBall(type, t, l, p0, typeof o === 'function' ? o() : o);   // o は打つ時に決める(this.rng: det の種から)
    const r2 = (a, b) => a + this.rng() * (b - a);
    const chop = (t, e0, e1, a0, a1, st) => (p0) => this.chopBall(t, r2(e0, e1), r2(a0, a1), p0, st ? r2(st[0], st[1]) : 0);
    const line = my === 'LF' ? -1 : my === 'RF' ? 1 : pull;   // 外野の線の方(切れていく向き)
    const ang0 = Math.atan2(at.x, -at.z) / D2R;
    const fenceAt = (off, hh) => (p0) => { let a2 = ang0 + off + (this.rng() * 2 - 1) * 3; if (Math.abs(a2) < 10) a2 = (a2 < 0 ? -1 : 1) * (10 + this.rng() * 5); a2 = Math.max(-42, Math.min(42, a2)); return this.makeFenceBall(a2, hh == null ? 2.75 + this.rng() * 0.85 - this.fenceInfo(a2).top : hh, p0, 36 + this.rng() * 12); };
    const deepFly = () => (p0) => { const a2 = ang0 + (this.rng() * 2 - 1) * 4, fd = this.fenceInfo(Math.max(-44, Math.min(44, a2))).dist, rr = Math.max(Math.hypot(at.x, at.z) + 6, fd - 6 - this.rng() * 4); return this.makeBall('fly', V(rr * Math.sin(a2 * D2R), 0, -rr * Math.cos(a2 * D2R)), 0.6, p0); };
    const gapName = my === 'LF' ? '左中間' : my === 'RF' ? '右中間' : gap < 0 ? '左中間' : '右中間';
    const lineName = my === 'LF' ? '三塁線' : my === 'RF' ? '一塁線' : '線';
    const EX_OF = [
      ['easy', 'air', '高く上がった正面のフライ', 1, () => mkO('fly', T(sgn() * rng() * 2.5, sgn() * rng() * 2.5), 0.2, () => ({ la: r2(48, 58) }))],
      ['easy', 'air', '正面の伸びるライナー', 1, () => mkO('liner', T(sgn() * rng() * 1.0, rng() * 1.0, 1.4), 1.0, () => ({ top: r2(900, 1300) }))],
      ['step', 'air', '切れていくフライ', 2, () => mkO('fly', T(sgn() * (2.4 + rng() * 1.8), sgn() * rng() * 1.5), 0.4, () => ({ side: line * r2(90, 150) }))],
      ['step', 'air', '少し前へのフライ', 2, () => mk('fly', T(sgn() * rng() * 2, 3 + rng() * 2.5), 0.3)],
      ['run', 'air', gapName + 'へのフライ', 2, () => mk('fly', T(gap * (11 + rng() * 6), -(rng() * 5)), 0.6)],
      ['run', 'air', lineName + 'へ切れていくフライ', 2, () => mkO('fly', T(line * (8 + rng() * 5), sgn() * rng() * 4), 0.6, () => ({ side: line * r2(110, 170) }))],
      ['run', 'air', '伸びるライナー(走って追う)', 2, () => mkO('liner', T(sgn() * (6 + rng() * 5), -(1 + rng() * 3), 1.4), 0.9, () => ({ top: r2(1000, 1500) }))],
      ['charge', 'air', 'テキサス気味のポテン(前へ)', 2, () => mkO('fly', T(sgn() * rng() * 3, 11 + rng() * 4), 0.3, () => ({ la: r2(44, 56) }))],
      ['charge', 'ground', '一度跳ねて来るゴロ(前へ出る)', 1, () => mkO('grounder', T(sgn() * rng() * 3, 3 + rng() * 3), 0.7, () => ({ la: r2(7, 13) }))],
      ['charge', 'air', '沈むライナー(前へ)', 2, () => mkO('liner', T(sgn() * rng() * 2.5, 5 + rng() * 3, 0.8), 0.8, () => ({ top: -r2(800, 1300) }))],
      ['hard', 'air', my === 'CF' ? 'センター返しの強いライナー' : '正面への強いライナー', 2, () => mkO('liner', T(sgn() * rng() * 1.5, 1 + rng() * 2, 1.3), 1.0, () => ({ ev: r2(38, 43) }))],
      ['hard', 'air', '線の方へ切れる強いライナー', 2, () => mkO('liner', T(line * (2 + rng() * 3), 0, 1.3), 0.9, () => ({ side: line * r2(60, 100) }))],
      ['back', 'air', '外野の奥へのフライ(背走)', 2, () => deepFly()],
      ['back', 'air', '伸びて頭を越えるライナー(背走)', 2, () => mkO('liner', T(sgn() * rng() * 3, -(7 + rng() * 4), 1.5), 0.9, () => ({ top: r2(1000, 1500) }))],
      ['dive', 'air', '前のポテン(飛び込む)', 3, (x = 18) => mkO('fly', T(SG * 1.2, x), 0.4, { la: 40 }), [4, 30]],
      ['jump', 'air', 'フェンス際(' + gapName + '寄り・跳ぶ)', 3, () => fenceAt(gap * 8)],
      ...(my === 'LF' || my === 'RF' ? [['foul', 'air', 'ファウルゾーンへのフライ', 2, () => (p0) => this.makeFoul('foul_fly', p0)]] : []),
      // 11/23 持ち主「ファールフライとかギリギリのフライとか もっと打球のバリエーション」
      ...(my === 'LF' || my === 'RF' ? [
        ['run', 'air', lineName + 'ぎりぎりのフライ(フェアかファウルか)', 2, () => { const a = line * r2(43.9, 46.3) * D2R, rr = Math.hypot(at.x, at.z) + (rng() * 2 - 1) * 6; return mkO('fly', V(rr * Math.sin(a), 0, -rr * Math.cos(a)), 0.5, () => ({ side: line * r2(30, 70) })); }],
        ['foul', 'air', 'ファウルゾーンへ切れていくフライ', 2, () => { const a = line * r2(45.8, 48.5) * D2R, rr = Math.hypot(at.x, at.z) + (rng() * 2 - 1) * 5; return mkO('fly', V(rr * Math.sin(a), 0, -rr * Math.cos(a)), 0.5, () => ({ side: line * r2(140, 200) })); }],
        ['foul', 'air', 'ファウルゾーンの浅いフライ(前へ)', 2, () => { const a = line * r2(47, 52) * D2R, rr = Math.hypot(at.x, at.z) - r2(10, 16); return mkO('fly', V(rr * Math.sin(a), 0, -rr * Math.cos(a)), 0.4, () => ({ la: r2(50, 60) })); }],
        ['jump', 'air', 'ポール際のフェンス際(跳ぶ)', 3, () => (p0) => { const a2 = line * r2(38, 42); return this.makeFenceBall(a2, 2.75 + this.rng() * 0.85 - this.fenceInfo(a2).top, p0, 36 + this.rng() * 12); }],
      ] : []),
      ...(my === 'CF' ? [
        ['run', 'air', '左中間・右中間の深いフライ(斜め後ろへ)', 2, () => mkO('fly', T(SG * (9 + rng() * 5), -(6 + rng() * 5)), 0.6, () => ({ la: r2(32, 40) }))],
        ['back', 'air', 'バックスクリーン手前のフライ(背走)', 2, () => (p0) => { const a2 = (this.rng() * 2 - 1) * 5, fd = this.fenceInfo(a2).dist, rr = Math.max(Math.hypot(at.x, at.z) + 5, fd - 3 - this.rng() * 3); return this.makeBall('fly', V(rr * Math.sin(a2 * D2R), 0, -rr * Math.cos(a2 * D2R)), 0.6, p0, { la: 38 + this.rng() * 8 }); }],
        ['charge', 'air', '二塁ベースの後ろに落ちそうなフライ(前へ)', 2, () => mkO('fly', T(sgn() * rng() * 3, 20 + rng() * 5), 0.3, () => ({ la: r2(52, 62) }))],
      ] : []),
      ['step', 'air', 'ふらふら上がって押し戻されるフライ', 2, () => mkO('fly', T(sgn() * rng() * 3, 2 + rng() * 3), 0.3, () => ({ la: r2(60, 68) }))],
      ['charge', 'air', '内野と外野の間に落ちそうなフライ(前へ)', 2, () => mkO('fly', T(sgn() * rng() * 4, 16 + rng() * 5), 0.3, () => ({ la: r2(50, 60) }))],
      ['run', 'air', '逃げていくライナー(走って追う)', 2, () => mkO('liner', T(line * (5 + rng() * 4), -(rng() * 3), 1.4), 0.9, () => ({ side: line * r2(80, 130) }))],
      ['back', 'air', 'フェンス手前で失速するフライ(背走)', 2, () => (p0) => { const a2 = ang0 + (this.rng() * 2 - 1) * 6, fd = this.fenceInfo(Math.max(-44, Math.min(44, a2))).dist, rr = Math.max(Math.hypot(at.x, at.z) + 5, fd - 2.5 - this.rng() * 2.5); return this.makeBall('fly', V(rr * Math.sin(a2 * D2R), 0, -rr * Math.cos(a2 * D2R)), 0.6, p0, { la: 40 + this.rng() * 8 }); }],
    ];
    const midName = my === '1B' ? '一二塁間' : my === '3B' ? '三遊間' : '二遊間';
    const lineIF = my === '1B' ? '一塁線' : '三塁線';
    const corner = my === '1B' || my === '3B';
    const EX_IF = [
      ['easy', 'ground', '正面の高く跳ねるゴロ', 1, () => chop(T(sgn() * rng() * 0.6, -2), 26, 32, 22, 30)],
      ['easy', 'ground', 'ゆるいゴロ', 1, () => mk('grounder', T(sgn() * rng() * 0.8, -6), 0.05)],
      ['easy', 'air', '真上の内野フライ', 1, () => mkO('pop', T(sgn() * rng() * 1.5, 0.5), 0.3, () => ({ la: r2(76, 84) }))],
      ['step', 'ground', '引っぱった強めのゴロ', 2, () => mk('grounder', T(pull * (1.5 + rng() * 1.8), -6), 0.7)],
      ['step', 'ground', '流し打ちのゴロ', 2, () => mkO('grounder', T(-pull * (1.5 + rng() * 1.8), -6), 0.5, () => ({ side: -pull * r2(20, 40) }))],
      ['step', 'ground', 'ベース寄りのゴロ', 2, () => mk('grounder', T(mid * (1.8 + rng() * 1.6), -5), 0.6)],
      ['step', 'air', '高く上がった内野フライ(天ぷら)', 2, () => mkO('pop', T(sgn() * (2 + rng() * 2.5), sgn() * rng() * 2), 0.4, () => ({ la: r2(78, 85) }))],
      ['step', 'ground', '横へ跳ねるゴロ', 2, () => chop(T(sgn() * (1.6 + rng() * 1.6), -3), 26, 34, 18, 26)],
      ['run', 'ground', midName + 'のゴロ', 2, () => mk('grounder', T(mid * (4.5 + rng() * 3), -6), 0.7)],
      ...(corner ? [['run', 'ground', lineIF + 'のゴロ', 2, () => (p0) => this.makeFoul('foul_line', p0)]] : []),
      ['run', 'air', '後ろへ流れる飛球', 2, () => mkO('pop', T(sgn() * (3 + rng() * 3), -(4 + rng() * 3)), 0.5, () => ({ la: r2(58, 68), side: (this.rng() < 0.5 ? -1 : 1) * 60 }))],
      ['charge', 'ground', '前で高く跳ねるゴロ(チョッパー)', 2, () => (corner ? chop(T(sgn() * rng() * 1.5, 6), 16, 22, 30, 40) : chop(T(-mid * (1.5 + rng() * 2), 6), 21, 26, 28, 36, [32, 37]))],   // 二塁・遊撃は投手から離れる側へ(投手の前で止まると投手が捕る)
      ['charge', 'ground', '詰まったゴロ(前へ)', 2, () => mkO('bunt', T(corner ? sgn() * rng() * 1.5 : -mid * (1.5 + rng() * 1.5), 8 + rng() * 3), 0.1, () => ({ ...(corner ? { ev: r2(13, 16) } : { stop: r2(33, 38) }) }))],
      ...(corner ? [['charge', 'ground', lineIF + 'へのバント(前へ)', 2, () => (p0) => { const s2 = at.x < 0 ? -1 : 1, a = r2(36, 42) * D2R, d = r2(9, 13); return this.makeBall('bunt', V(s2 * d * Math.sin(a), 0, -d * Math.cos(a)), 0.1, p0); }]] : []),
      ...(my === '3B' ? [['charge', 'ground', 'セーフティバント(前へ)', 2, () => (p0) => { const a = r2(30, 38) * D2R, d = r2(11, 15); return this.makeBall('bunt', V(-d * Math.sin(a), 0, -d * Math.cos(a)), 0.1, p0, { ev: r2(10, 12.5) }); }]] : []),
      ...(!corner ? [['charge', 'ground', (my === 'SS' ? '三遊間' : '一二塁間') + '寄りのボテボテ(前へ)', 2, () => mkO('bunt', T(-mid * (3.5 + rng() * 2), 8), 0.1, () => ({ stop: r2(30, 34) }))]] : []),
      ['hop', 'ground', 'ハーフバウンド', 3, () => mk('grounder', T(sgn() * rng() * 0.6, -3.5), 0.9)],
      ['hop', 'ground', '大きく跳ねるゴロ', 2, () => chop(T(sgn() * rng() * 1.0, -4), 30, 38, 26, 34)],
      ['hop', 'ground', this.oldHop() ? '芝の切れ目で跳ねるゴロ' : '芝から土へ転がるゴロ', 2, () => this.badHop(T(sgn() * (0.8 + rng() * 1.2), -6))],
      ['hard', 'air', '強烈なライナー', 2, () => mkO('liner', T(sgn() * rng() * 0.8, 0, 1.1 + rng() * 0.6), 1.0, () => ({ ev: r2(40, 45) }))],
      ['hard', 'ground', '足もとへの強いゴロ', 2, () => mk('grounder', T(sgn() * rng() * 0.5, -1.5), 1.0)],
      ['hard', 'air', '沈むライナー', 2, () => mkO('liner', T(sgn() * rng() * 0.8, 1, 0.6 + rng() * 0.4), 0.9, () => ({ top: -r2(700, 1300) }))],
      ['back', 'air', '内野と外野の間のフライ(背走)', 2, () => mkO('pop', T(sgn() * rng() * 3, -(7 + rng() * 3)), 0.5, () => ({ la: r2(48, 56) }))],
      ['back', 'air', '伸びるライナー(背走)', 2, () => mkO('liner', T(sgn() * rng() * 1, -(3 + rng() * 2), 1.6 + rng() * 0.5), 0.8, () => ({ top: r2(900, 1400) }))],
      ...(!corner ? [['dive', 'ground', midName + 'のゴロ(飛び込む)', 3, (x = 6) => mk('grounder', T(mid * x, -7), 1.3), [1, 15]]] : []),
      ['jump', 'air', '少し横の頭の上のライナー(跳ぶ)', 3, () => { const t = T(sgn() * (0.7 + rng() * 0.5), 0), hh = 2.95 + rng() * 0.2, sp = THREE.MathUtils.clamp(30 + Math.hypot(at.x, at.z) * 0.7, 46, 62); return (p0) => this.lineDrive(t, hh, sp, p0); }],
      ...(!corner ? [['through', 'ground', midName + 'を抜けるゴロ', 3, (x = 10) => mk('grounder', T(mid * x, -8), 1.0), [1, 28]]] : []),
      ...(corner ? [['foul', 'air', 'ベンチ前のファウルフライ', 2, () => { const s2 = at.x < 0 ? -1 : 1, a = (60 + rng() * 10) * D2R, d = 17 + rng() * 6; return mkO('pop', V(s2 * d * Math.sin(a), 0, -d * Math.cos(a)), 0.4, () => ({ la: r2(70, 78) })); }]]
        : [['foul', 'air', 'ファウルゾーンへ流れるフライ', 2, () => { const s2 = at.x < 0 ? -1 : 1, a = (47 + rng() * 4) * D2R, d = 30 + rng() * 6; return mkO('pop', V(s2 * d * Math.sin(a), 0, -d * Math.cos(a)), 0.4, () => ({ la: r2(60, 70), side: s2 * 50 })); }]]),
      // 11/23 持ち主「ファールフライとかギリギリのフライとか もっと打球のバリエーション」
      ...(corner ? [
        ['foul', 'air', lineIF + 'ぎりぎりのフライ(フェアかファウルか)', 2, () => { const s2 = at.x < 0 ? -1 : 1, a = r2(43.9, 46.3) * D2R, d = r2(20, 30); return mkO('pop', V(s2 * d * Math.sin(a), 0, -d * Math.cos(a)), 0.4, () => ({ la: r2(68, 78) })); }],
        ['foul', 'air', 'ファウルゾーンへ切れていく飛球', 2, () => { const s2 = at.x < 0 ? -1 : 1, a = r2(45.8, 49) * D2R, d = r2(24, 32); return mkO('pop', V(s2 * d * Math.sin(a), 0, -d * Math.cos(a)), 0.4, () => ({ la: r2(60, 70), side: s2 * r2(70, 110) })); }],
        ['foul', 'air', '本塁寄りのファウルフライ(前へ)', 2, () => { const s2 = at.x < 0 ? -1 : 1, a = r2(66, 80) * D2R, d = r2(12, 17); return mkO('pop', V(s2 * d * Math.sin(a), 0, -d * Math.cos(a)), 0.3, () => ({ la: r2(74, 82) })); }],
        ['foul', 'air', '後ろのファウルゾーンへのフライ(背走)', 2, () => { const s2 = at.x < 0 ? -1 : 1, a = r2(46, 49) * D2R, d = r2(33, 40); return mkO('pop', V(s2 * d * Math.sin(a), 0, -d * Math.cos(a)), 0.5, () => ({ la: r2(56, 64) })); }],
      ] : [
        ['back', 'air', (my === 'SS' ? '三遊間' : '一二塁間') + 'の後ろへのフライ(背走)', 2, () => mkO('pop', T(-mid * (3 + rng() * 3), -(6 + rng() * 3)), 0.5, () => ({ la: r2(50, 58) }))],
        ['run', 'air', '二塁ベースの後ろへのフライ', 2, () => mkO('pop', T(mid * (4 + rng() * 3), -(3 + rng() * 3)), 0.5, () => ({ la: r2(60, 70) }))],
        ['hard', 'air', '二遊間への低い強いライナー', 2, () => mkO('liner', T(mid * (1.5 + rng() * 1.5), 0, 1.0 + rng() * 0.7), 1.0, () => ({ ev: r2(38, 43) }))],
        ['step', 'air', 'ふらっと上がった後ろの飛球', 2, () => mkO('pop', T(sgn() * rng() * 2.5, -(2.5 + rng() * 2)), 0.4, () => ({ la: r2(62, 72), side: sgn() * r2(30, 60) }))],
      ]),
      ['step', 'air', '高く上がりすぎた内野フライ', 2, () => mkO('pop', T(sgn() * (1.5 + rng() * 2), sgn() * rng() * 1.5), 0.3, () => ({ la: r2(84, 87) }))],
      ...(indoor ? [] : [['step', 'air', '風に流される内野フライ', 2, () => this.windBall('pop', T(sgn() * (2 + rng() * 3), -(1 + rng() * 3)), 0.5)]]),
      ['charge', 'air', '前に落ちそうな小フライ(前へ)', 2, () => mkO('pop', T(sgn() * rng() * 2, 5 + rng() * 3), 0.3, () => ({ la: r2(55, 65) }))],
    ];
    // 11/25 テスター「投手・捕手も選べるように」: 投手・捕手の所へ来る打球(本物でよくある物)。種類ごとの割合は KIND_W のまま
    const bunt = (s2, a0, a1, d0, d1, e0, e1, la) => (p0) => { const a = r2(a0, a1) * D2R, d = r2(d0, d1); return this.makeBall('bunt', V(s2 * d * Math.sin(a), 0, -d * Math.cos(a)), 0.1, p0, { ev: r2(e0, e1), ...(la ? { la: r2(la[0], la[1]) } : {}) }); };
    const popAt = (s2, a0, a1, d0, d1, l0, l1) => (p0) => { const a = r2(a0, a1) * D2R, d = r2(d0, d1); return this.makeBall('pop', V(s2 * d * Math.sin(a), 0, -d * Math.cos(a)), 0.4, p0, { la: r2(l0, l1) }); };
    const EX_P = [
      ['easy', 'ground', 'ピッチャー返しのゴロ(正面)', 1, () => mkO('grounder', T(sgn() * rng() * 0.5, -6), 0.2, () => ({ ev: r2(24, 30) }))],
      ['easy', 'ground', '投手前のゆるいゴロ', 1, () => mkO('bunt', T(sgn() * rng() * 1.2, 5 + rng() * 2), 0.1, () => ({ ev: r2(13, 16) }))],
      ['easy', 'air', 'マウンドへの小フライ', 1, () => mkO('pop', T(sgn() * rng() * 1.5, sgn() * rng() * 1.5), 0.3, () => ({ la: r2(72, 82) }))],
      ['step', 'ground', '投手の横へのゴロ', 2, () => mkO('grounder', T(sgn() * (1.3 + rng() * 1.0), -6), 0.4, () => ({ ev: r2(24, 30) }))],
      ['step', 'air', '一塁側への小フライ', 2, () => mkO('pop', T(3 + rng() * 3, 3 + rng() * 3), 0.3, () => ({ la: r2(66, 76) }))],
      ['step', 'air', '三塁側への小フライ', 2, () => mkO('pop', T(-(3 + rng() * 3), 3 + rng() * 3), 0.3, () => ({ la: r2(66, 76) }))],
      ['charge', 'ground', '投手前のバント(前へ)', 2, () => (p0) => this.makeBall('bunt', V(pull * -(0.5 + rng() * 2.5), 0, -7 - rng() * 4), 0.1, p0, { ev: r2(9, 12) })],
      ['charge', 'ground', '一塁線へのバント(前へ)', 2, () => bunt(1, 30, 40, 9, 13, 9.5, 12)],
      ['charge', 'ground', '三塁線へのバント(前へ)', 2, () => bunt(-1, 30, 40, 9, 13, 9.5, 12)],
      ['charge', 'ground', '投手の前で高く跳ねるゴロ(前へ)', 2, () => chop(V((rng() - 0.5) * 2, 0, -20), 21, 26, 30, 38)],
      ['hop', 'ground', 'マウンドで跳ねるゴロ', 2, () => chop(T(sgn() * rng() * 0.8, -4), 26, 32, 18, 26)],
      ['hard', 'air', 'ピッチャー返しのライナー', 2, () => mkO('liner', V((rng() - 0.5) * 1.4, 1.1 + rng() * 0.8, -18), 1.0, () => ({ ev: r2(33, 39) }))],
      ['hard', 'ground', '足もとへの強いゴロ', 2, () => mkO('grounder', V((rng() - 0.5) * 1.0, 0, -22), 1.0, () => ({ ev: r2(30, 35), la: r2(-3, 0) }))],
      ['dive', 'air', '横のライナー(飛び込む)', 3, (x = 3) => mk('liner', T(SG * x, -5, 0.6), 0.95), [0.5, 12]],
      ['jump', 'air', '頭の上のライナー(跳ぶ)', 3, () => { const t = T(sgn() * rng() * 0.6, 0), hh = 2.95 + rng() * 0.25; return (p0) => this.lineDrive(t, hh, 46, p0); }],
    ];
    const EX_C = [
      ['easy', 'ground', '捕手前のバント', 1, () => mkO('bunt', V((rng() - 0.5) * 3, 0, -2.5 - rng() * 2.5), 0.1, () => ({ ev: r2(5.5, 8), la: r2(-12, -8) }))],
      ['easy', 'air', '本塁の上の高いフライ', 1, () => popAt(sgn(), 0, 40, 1, 4, 80, 87)],
      ['charge', 'ground', '捕手前のボテボテ(前へ)', 2, () => mkO('bunt', V((rng() - 0.5) * 4, 0, -4 - rng() * 3), 0.1, () => ({ ev: r2(7, 9.5), la: r2(-12, -8) }))],
      ['charge', 'ground', '三塁線へのバント(前へ)', 2, () => bunt(-1, 38, 44, 5, 8, 7, 9, [-12, -8])],
      ['charge', 'ground', '一塁線へのバント(前へ)', 2, () => bunt(1, 38, 44, 5, 8, 7, 9, [-12, -8])],
      ['step', 'air', '捕手前の小フライ', 2, () => popAt(sgn(), 0, 35, 4, 8, 70, 80)],
      ['foul', 'air', 'バックネット前のファウルフライ(背走)', 2, () => popAt(sgn(), 100, 150, 5, 11, 76, 84)],
      ['foul', 'air', '三塁側のファウルフライ', 2, () => popAt(-1, 60, 90, 8, 15, 72, 82)],
      ['foul', 'air', '一塁側のファウルフライ', 2, () => popAt(1, 60, 90, 8, 15, 72, 82)],
      ['run', 'air', 'ベンチ前へ流れるファウルフライ(走る)', 2, () => popAt(sgn(), 68, 88, 14, 19, 70, 78)],
    ];
    const K = my === 'P' ? EX_P : my === 'C' ? EX_C : of ? [
      ['easy', 'air', 'イージーフライ', 1, () => mk('fly', T(sgn() * rng() * 3, sgn() * rng() * 3), 0.2)],
      ['easy', 'air', '正面のライナー', 1, () => mk('liner', T(sgn() * rng() * 1.2, rng() * 1.0, 1.3), 1.0)],   // 11/20 遅いと外野まで届かず前に落ちていた
      ['charge', 'ground', '外野の前のゴロ(前へ出る)', 1, () => mk('grounder', T(sgn() * rng() * 3, 4), 0.6)],   // 外野へのゴロは芝で止まるので前へ出て捕る(11/20 easy → charge)
      ['step', 'air', '横へのフライ', 2, () => mk('fly', T(sgn() * (2.6 + rng() * 1.6), sgn() * rng() * 1.5), 0.4)],
      ['step', 'air', indoor ? '少し横のフライ' : '風で流れるフライ', 2, () => (indoor ? mk('fly', T(sgn() * (4 + rng() * 3), sgn() * rng() * 3), 0.4) : this.windBall('fly', T(sgn() * (3 + rng() * 3), -(2 + rng() * 4)), 0.5))],
      ['run', 'air', '全力で追うフライ', 2, () => mk('fly', T(sgn() * (12 + rng() * 5), sgn() * rng() * 5), 0.6)],
      ['back', 'air', '頭の上を越えるフライ(背走)', 2, () => mk('fly', T(sgn() * rng() * 4, -(10 + rng() * 5)), 0.6)],
      ['charge', 'air', '前に落ちそうな当たり', 2, () => mk('fly', T(sgn() * rng() * 3, 12 + rng() * 4), 0.4)],
      ['hard', 'air', 'ライナー性の強い当たり', 2, () => mk('liner', T(sgn() * (3 + rng() * 4), -(2 + rng() * 4), 1.2), 0.9)],
      ['dive', 'air', '前に落ちる打球(飛び込む)', 3, (x = 18) => mk('liner', T(sgn() * rng() * 3, x, 0.3), 0.9), [4, 28]],   // 低く速いライナーが前に落ちる(11/20: 遅い山なりで、前へ走れば全部届いていた)
      ['jump', 'air', 'フェンス際(跳ぶ)', 3, () => fence()],
      ['through', 'air', '左中間・右中間を破る', 3, (x = 18) => mk('liner', T(gap * Math.min(x, 44), 15, 0.4), 1.0), [4, 44]],   // 左中間・右中間へ低く速いライナー(外野手の 15 m 前・横は 44 m までに落ちて、間を転がる。11/20 前は外野手の後ろへ届かせようとして山なりになり中堅が追いついていた)
      // 11/20 「外野を抜けるゴロ」は外した(ゴロは芝で止まって外野手の所まで来ず、抜ける当たりにならない。試合では抜ける当たりは規則の側で出る)
      ...(my === 'LF' || my === 'RF' ? [['foul', 'air', 'ライン際の当たり(フェアかファウルか)', 2, () => (p0) => this.makeFoul('foul_line', p0)]] : []),
      ...EX_OF,
    ] : [
      ['easy', 'ground', '正面のゴロ', 1, () => mk('grounder', T(sgn() * rng() * 0.6, -6), 0.3)],
      ['easy', 'air', '小フライ', 1, () => mk('pop', T(sgn() * 1.5, 1), 0.3)],
      ['easy', 'air', '正面のライナー', 1, () => mk('liner', T(sgn() * rng() * 0.5, 0, 1.0 + rng() * 0.8), 0.5)],
      ['step', 'ground', '横のゴロ', 2, () => mk('grounder', T(sgn() * (1.6 + rng() * 1.6), -6), 0.5)],
      ['run', 'ground', '深い所のゴロ', 2, () => mk('grounder', T(back * (5.5 + rng() * 3), -7), 0.7)],
      ['run', 'ground', '逆シングル', 3, () => mk('grounder', T(-back * (5.5 + rng() * 2.5), -6), 0.9)],
      ['charge', 'ground', 'ボテボテのゴロ(前へ突っ込む)', 2, () => (my === 'SS' || my === '2B' ? mkO('bunt', T(-mid * (2 + rng() * 2), 8), 0.1, () => ({ stop: r2(31, 35) })) : mk('bunt', T(sgn() * rng() * 1.2, 12 + rng() * 3), 0.1))],   // 11/21 二塁・遊撃は前は投手の前(本塁から 20 m 余り)で止まり、ノックでは毎回投手が捕っていた: 投手から離れる側へ、本塁から 30 m 余りで止まる強さに(stop。球場の地面で転がり方が違うので道筋で合わせる)
      ['charge', 'air', 'ポテンヒット性(前へ)', 2, () => mk('pop', T(sgn() * rng() * 2, 6 + rng() * 3), 0.4)],
      ['hop', 'ground', this.oldHop() ? 'イレギュラー' : '速いゴロ', 2, () => this.badHop(T(sgn() * rng() * 0.8, -6))],
      ['hop', 'ground', 'ショートバウンド', 3, () => mk('grounder', T(sgn() * rng() * 0.6, -2), 1.0)],
      ['hard', 'ground', '強いゴロ', 2, () => mk('grounder', T(sgn() * rng() * 1.2, -6), 1.0)],
      ['back', 'air', '後ろへの飛球(背走)', 2, () => mk('pop', T(sgn() * rng() * 2, -(5 + rng() * 3)), 0.5)],
      ['dive', 'ground', '深い所のゴロ(飛び込む)', 3, (x = 6) => mk('grounder', T(back * x, -7), 1.3), my === 'SS' || my === '2B' ? [1, 15] : [1, 26]],   // 11/20 速いゴロ(46〜50 m/s)にした。二塁・遊撃は守備位置が深く、遅いゴロは 16 m 横でも走れば届き、それより先は隣の三塁手・一塁手が捕ってしまう
      ['dive', 'air', '横のライナー(飛び込む)', 3, (x = 3) => mk('liner', T(SG * x, -5, 0.6), 0.95), [0.5, 18]],
      ['jump', 'air', '頭の上のライナー(跳ぶ)', 3, () => { const t = T(sgn() * rng() * 0.6, 0), hh = 2.95 + rng() * 0.25, sp = THREE.MathUtils.clamp(30 + Math.hypot(at.x, at.z) * 0.7, 46, 62); return (p0) => this.lineDrive(t, hh, sp, p0); }],   // 守備位置の頭の上 2.85〜3.15 m を 162 km/h で通る低いライナー: 後ろへ 10 m 以上 2.4 m より高いまま(下がっても届かず、跳べば届く)   // 6 m 後ろを 2.5 m で通る強いライナー: 守備位置では頭の上(跳べば届く)、下がっても間に合わない
      ['through', 'ground', '抜けるゴロ', 3, (x = 10) => mk('grounder', T(back * x, -8), 1.0), [1, 28]],
      ['foul', 'air', 'ファウルフライ', 2, () => { const s2 = at.x < 0 ? -1 : 1, a = (50 + rng() * 6) * D2R, d = 20 + rng() * 8; return mk('pop', V(s2 * d * Math.sin(a), 0, -d * Math.cos(a)), 0.4); }],
      ...EX_IF,
    ];
    const wantC = cat == null ? null : cat === 'grounder' || cat === 'bunt' ? 'ground' : 'air';
    let C = wantC ? K.filter((x) => x[1] === wantC) : K; if (!C.length) C = K;
    if (this._noFoul) { const C2 = C.filter((x) => !/ファウル|ぎりぎり/.test(x[2])); if (C2.length) C = C2; }   // 11/23 取れるファウルが作れなかった時の選び直し
    if (this.kind === 'game' && !want) C = C.filter((x) => x[0] !== 'through');   // 試合の抜ける当たりは規則(安打)の側で出るので、自分の場面では出さない(誰も拾わない球を作らない)
    if (want) { const C2 = C.filter((x) => x[0] === want); if (C2.length) C = C2; }
    const last = this._lastKinds || (this._lastKinds = []);
    const lastL = this._lastLabels || (this._lastLabels = []);   // 11/21 直前 4 本と同じ名前(打ち方)の打球も出にくくする(種類が増えたので、同じ打球が続かないように散らす)
    const W = C.map((x) => (KIND_W[x[0]] || 5) / C.filter((y) => y[0] === x[0]).length * (last.includes(x[0]) ? 0.15 : 1) * (lastL.includes(x[2]) ? 0.2 : 1));
    let r = rng() * W.reduce((a, b) => a + b, 0), i = 0;
    for (; i < C.length - 1; i++) { if ((r -= W[i]) <= 0) break; }
    const [kind0, catK, label0, star0, f0] = C[i];   // C[i][5]: 境目を探す範囲(飛び込む・抜ける物)
    // 11/20 打球の中の乱数(速さ・角度・回転)を 1 本ごとに決めた種から出す: 種類を確かめた道筋と、本当に飛ぶ道筋を同じにする。
    // 前は確かめる時は決まった速さ、飛ぶ時は散らばらせた速さ(randEV)で別の打球になり、「抜ける」当たりに追いついたり「飛び込む」当たりが正面に来ていた
    const seed = (rng() * 4294967296) >>> 0;
    const det = (mkx, sd) => (p0) => { const sv = this.rng, sr = this._randEV; this.rng = mulberry(sd); this._randEV = false; try { return mkx(p0); } finally { this.rng = sv; this._randEV = sr; } };
    // 距離で境目を探す物(C[i][5])は同じ種(距離だけ変える)、ほかは作り直すたびに新しい種
    const f = C[i][5] ? (...a) => det(f0(...a), seed) : (...a) => det(f0(...a), (rng() * 4294967296) >>> 0);
    // 届き方で決まる種類(簡単・少し動く・全力・飛び込む・跳ぶ・抜ける)は、道筋で本当にそうなる物になるまで作り直す(最大 14 回)
    const CLS = ['easy', 'step', 'run', 'dive', 'jump', 'through'];
    let kind = kind0, label = label0, star = star0, made = null;
    if (CLS.includes(kind0)) {
      const p0 = this.contactPoint();
      const clsOf = (mkx) => { this._coarse = true; try { return this.reachClass(mkx(p0).path); } finally { this._coarse = false; } };
      const runOK = (c) => c === 'easy' || c === 'step' || c === 'run';
      const range = C[i][5];
      if (range && (kind0 === 'dive' || kind0 === 'through')) {
        // 境目を 2 つ探す: 走れば届く一番遠い所(hiR)と、飛び込めば届く一番遠い所(hiD)。飛び込むはその間、抜けるは hiD より 2〜5 m 先
        const bis = (ok) => { let lo = range[0], hi = range[1]; if (!ok(clsOf(f(lo)))) return lo; if (ok(clsOf(f(hi)))) return hi; for (let k = 0; k < 7; k++) { const m = (lo + hi) / 2; if (ok(clsOf(f(m)))) lo = m; else hi = m; } return hi; };
        const hiR = bis(runOK), hiD = Math.max(hiR, bis((c) => runOK(c) || c === 'dive'));
        const x = kind0 === 'dive' ? hiR + (hiD - hiR) * (0.25 + rng() * 0.6) : hiD + 2 + rng() * 3;
        made = f(Math.min(range[1] * 1.4, x));
        let cls = clsOf(made);
        // 境目の探し方が外れた時(打球の道筋は距離に対してまっすぐ変わらない)は、範囲の中から選び直す(最大 8 回)
        for (let tr = 0; tr < 8 && cls !== kind0; tr++) { const m2 = f(range[0] + rng() * (range[1] * 1.3 - range[0])), c2 = clsOf(m2); if (c2 === kind0) { made = m2; cls = c2; } }
        if (cls !== kind0) { kind = cls; label = { easy: '正面の当たり', step: '少し動けば捕れる当たり', run: '全力で走れば届く当たり', dive: '飛び込めば届く当たり', jump: '跳べば届く当たり', through: '抜ける当たり' }[cls]; star = cls === 'easy' ? 1 : cls === 'step' || cls === 'run' ? 2 : 3; }
      } else for (let tr = 0; tr < 10; tr++) {
        const mk1 = f(), cls = clsOf(mk1);
        made = mk1;
        if (cls === kind0) break;
        if (tr === 9) { kind = cls; label = { easy: '正面の当たり', step: '少し動けば捕れる当たり', run: '全力で走れば届く当たり', dive: '飛び込めば届く当たり', jump: '跳べば届く当たり', through: '抜ける当たり' }[cls]; star = cls === 'easy' ? 1 : cls === 'step' || cls === 'run' ? 2 : 3; }
      }
    }
    // 11/23 持ち主「観客に入って取れないようなやつはそんなに要りません 取れる奴だけ守備時は守備機会あるように」:
    // ファウル・線ぎりぎりの打球は、グラウンドに落ちて(スタンド・壁に当たらない)自分が届く物だけにする。12 回作って無理なら、ほかの打球を選び直す
    if (/ファウル|ぎりぎり/.test(label0) && !want) {
      const p0 = this.contactPoint(); let ok = false;
      for (let tr = 0; tr < 12 && !ok; tr++) { const mk1 = tr === 0 && made ? made : f(); this._coarse = true; let b1; try { b1 = mk1(p0); } finally { this._coarse = false; } if (this.catchableFoul(b1)) { made = mk1; ok = true; } }
      if (!ok && !this._noFoul) { this._noFoul = true; try { return this.varietyBall(cat); } finally { this._noFoul = false; } }
    }
    // 作り直しで種類が付け替わって、3 本続けて同じ種類になる時は、もう一度選び直す(1 回だけ)
    if (!want && !this._vbRetry && last.length >= 2 && last.every((k) => k === kind)) { this._vbRetry = true; try { return this.varietyBall(cat); } finally { this._vbRetry = false; } }
    last.push(kind); if (last.length > 2) last.shift();
    lastL.push(label0); if (lastL.length > 4) lastL.shift();
    const type = /ゴロ/.test(label) ? 'grounder' : /ライナー|フェンス|当たり/.test(label) && catK === 'air' ? (/フェンス/.test(label) ? 'fence' : 'liner') : /フライ|飛球|ポテン/.test(label) ? (of ? 'fly' : 'pop') : catK === 'ground' ? 'grounder' : 'fly';
    return { kind, label, star, type, make: made || f(), L: [0, 0.2, 0.55, 0.85][star], kind0, label0 };   // kind0・label0: 選んだ時の種類(試験で、作り直しで付け替わった物を数える)
  }
  // 11/23 取れる打球か: 最初に当たる所がグラウンド(壁・スタンドでない、高さ 0.5 m 未満)で、自分が届く(抜けるでない)
  catchableFoul(b) {
    if (!b || !b.path) return false;
    const ev = b.path.events, e = ev.find((x) => x.type === 'bounce' || x.type === 'roll' || x.type === 'wall');
    if (!e || e.type === 'wall' || !e.p || e.p.y > 0.5 || e.surf === 'w') return false;
    const r = Math.hypot(e.p.x, e.p.z), ang = Math.atan2(e.p.x, -e.p.z) / D2R;
    if (Math.abs(ang) <= 45 && r > this.fenceInfo(ang).dist - 0.5) return false;
    const c = this.reachClass(b.path);
    return c === 'easy' || c === 'step' || c === 'run' || c === 'dive' || c === 'jump';
  }
  // まっすぐに近い速いライナー: 水平の距離 T で高さ h を通るように、上向きの速さを道筋で 3 回合わせる
  lineDrive(T, h, speed, p0) {
    const dir = V(T.x - p0.x, 0, T.z - p0.z), d = dir.length(); dir.normalize();
    const flat = { bvh: null, surfaceAt: () => 's', groundY: () => 0 };
    let vy = (h - p0.y) / (d / speed) + 4.9 * (d / speed);
    const yAt = (vy0) => { const v = dir.clone().multiplyScalar(speed); v.y = vy0; const pr = predict(flat, p0, v, V(), 3, { Cd: 0.35, clScale: 0, dt: 1 / 120 }); for (let i = 0; i < pr.n; i++) { const x = pr.pts[i * 4], z = pr.pts[i * 4 + 2]; if (Math.hypot(x - p0.x, z - p0.z) >= d) return pr.pts[i * 4 + 1]; } return 0; };
    for (let k = 0; k < 3; k++) vy += h - yAt(vy);
    const v = dir.clone().multiplyScalar(speed); v.y = vy;
    const path = predict(this.world, p0, v, V(), this._coarse ? 6 : 9, { Cd: 0.35, clScale: 0, dt: this._coarse ? 1 / 60 : DT });
    return { path, type: 'liner', v, w: V(), p0: p0.clone() };
  }
  // 打った所(本塁の打者のバット。ノックはノッカーの所)
  contactPoint() { return this.kind === 'knock' ? V(-1.1, 1.05, -1.3) : V(-0.25, 0.95, -0.55); }   // startPlay の p0 と同じ
  // 打球の道筋から、守備位置から走って届くか(普通に・飛び込んで・跳んで)を決める(自動の選手 tools/bot.js と同じ考え: 0.12 秒で動き出し、速さ D.speed)
  // 返す: 'easy'(2 m 以内)・'step'(5 m 以内)・'run'・'dive'・'jump'・'through'
  reachClass(path) {
    const at = this.homeOf(this.my), v = (this.D || DIFF.std).speed, R = (this.D || DIFF.std).reach, of = !!POS[this.my].of;
    const e1 = path.events.find((e) => e.type === 'bounce' || e.type === 'roll' || e.type === 'wall'), b1 = e1 ? e1.t : 1e9;
    const rF = Math.hypot(at.x, at.z), gr = !!(e1 && e1.p && Math.hypot(e1.p.x, e1.p.z) < 50);   // 外野へのゴロ(内野で跳ねた球)
    let run = null, dive = false, jump = false;
    for (let i = 0; i < path.n; i += 2) {
      const t = i * path.dt, x = path.pts[i * 4], y = path.pts[i * 4 + 1], z = path.pts[i * 4 + 2], r = Math.hypot(x, z);
      if ((!of || gr) && r > rF + 5 && t > b1) break;   // 内野・外野へのゴロ: 地面に着いてから守備位置の 5 m 後ろを抜けたら抜けた当たり(内野の飛球・ライナーは落ちるまで見る)
      if (of && !gr && t > b1) break;   // 外野の飛球・ライナー: 落ちる前に捕れなければ安打(11/20: 前は落ちて 0.6 秒まで見ていて、前に落ちる当たりが「走れば届く」になっていた)
      const avail = Math.max(0, t - 0.02) * v, dh = Math.hypot(x - at.x, z - at.z);   // 自分は打った直後から D.speed(8.3 m/s)で走れる(測った: 1 秒で 8.4 m)
      if (y > -0.1 && y < 2.4 && dh - R <= avail) { run = run == null ? dh : Math.min(run, dh); if (run < 2) break; }
      // 飛び込む: 走っている所から体を投げ出す(updateAct: 0.5 秒で約 2 m 前へ、グラブは体の 0.95 m 前で R+0.55 m の輪)。
      // 走り続けた時より先へ届くのは約 1.5 m(飛び込みの 0.04 秒目)まで。前は 2.8 m 先まで届く見込みで、自分の速さでは届かない球も「飛び込む」にしていた
      if (y > -0.2 && y < 1.3 && dh - (R + DIVE_EXTRA) <= avail) dive = true;
      const ang = Math.atan2(x, -z) / D2R, nearF = Math.abs(ang) <= 45 && this.fenceInfo(ang).dist - r < 1.4;
      if (y > 2.4 && y < (nearF ? 3.9 : 3.2) && dh - R <= avail - 0.3) jump = true;   // 跳べば届く: 頭の上 3.2 m(跳んで体が上がる分を入れて)・フェンス際 3.9 m まで
    }
    if (run != null) return run < 2 ? 'easy' : run < 5 ? 'step' : 'run';
    return dive ? 'dive' : jump ? 'jump' : 'through';
  }
  // 風で流れる: 横回転を足して、落ちる所が横へずれる
  windBall(type, T, l) {
    return (p0) => {
      const b = this.makeBall(type, T, l, p0);
      const windK = (() => { try { const st = (this.ctx.stadiums || []).find((x) => x.id === this.ctx.stadium); return (st && st.wind) || 1; } catch (e) { return 1; } })();   // 球場の風の強さ(stadiums.js の wind。海鳴りは 1.8)
      const w = b.w.clone().add(V(0, (this.rng() < 0.5 ? -1 : 1) * 130 * windK, 0));
      b.w = w; b.path = predict(this.world, p0, b.v, w, 9, { Cd: 0.35, clScale: 1.0, dt: DT });
      return b;
    };
  }
  // バウンドの変わるゴロ: 跳ねるたびに少し横へそれる(土の荒れ)。道筋を 2 つつないで作る
  // 11/26 持ち主「理不尽なイレギュラーがあるのでこれは無くしてください」: 跳ねても向き・高さは変えない素直なゴロにした(同じ的・同じ強さ)。?badhop=1 で前の形
  oldHop() { return !!(this.ctx.params && this.ctx.params.has && this.ctx.params.has('badhop')); }
  badHop(T) {
    return (p0) => {
      const b = this.makeBall('grounder', T, 0.6, p0);
      if (!this.oldHop()) return b;
      const ev = b.path.events.find((e) => e.type === 'bounce' && e.t > 0.25);
      if (!ev) return b;
      const pts = b.path.pts, i0 = Math.floor(ev.t / b.path.dt);
      const pa = V(pts[i0 * 4], pts[i0 * 4 + 1], pts[i0 * 4 + 2]), pb = V(pts[(i0 + 1) * 4], pts[(i0 + 1) * 4 + 1], pts[(i0 + 1) * 4 + 2]);
      const vel = pb.clone().sub(pa).divideScalar(b.path.dt);
      const yaw = (this.rng() < 0.5 ? -1 : 1) * (0.25 + this.rng() * 0.2);
      const v2 = V(vel.x * Math.cos(yaw) - vel.z * Math.sin(yaw), Math.abs(vel.y) * 0.9 + 1.5, vel.x * Math.sin(yaw) + vel.z * Math.cos(yaw));
      const p2 = predict(this.world, pa.clone().setY(Math.max(0.05, pa.y)), v2, V(), 6, { Cd: 0.35, clScale: 1.0, dt: DT });
      const n0 = i0 + 1, n = n0 + p2.n, out = new Float32Array(n * 4);
      out.set(pts.subarray(0, n0 * 4), 0);
      for (let i = 0; i < p2.n; i++) { out[(n0 + i) * 4] = p2.pts[i * 4]; out[(n0 + i) * 4 + 1] = p2.pts[i * 4 + 1]; out[(n0 + i) * 4 + 2] = p2.pts[i * 4 + 2]; out[(n0 + i) * 4 + 3] = p2.pts[i * 4 + 3]; }
      b.path = { ...b.path, pts: out, n, events: [...b.path.events.filter((e) => e.t <= ev.t), ...p2.events.map((e) => ({ ...e, t: e.t + ev.t }))] };
      return b;
    };
  }
  endKnock() {
    const s = this.stats, k = this.knock;
    const time = this.ctx.simTime - k.t0;
    const key = `${this.my}_${k.N}`;
    const prev = this.best[key];
    const cur = { caught: s.caught, streak: s.bestStreak, correct: s.correct, time };
    let newBest = false;
    if (!prev || cur.caught > prev.caught || (cur.caught === prev.caught && cur.time < prev.time)) { this.best[key] = cur; this.ctx.store('r4walk.knockBest', this.best); newBest = true; }
    this.lastResult = { kind: 'knock', ...cur, N: k.N, pos: this.my, newBest, done: k.n };
    if (!this.watching) mkEv('def_knock');   // 11/22 目標
    this.stop(true);
    this.showResult(false);
  }

  // 試合: 自分が関わる場面まで、規則どおりに 1 球ずつ早送りする。その間の出来事は引きの画面で短く見せる
  nextPA() {
    const g = this.g;
    if (g.over) { this.endGame(); return; }
    const rng = this.rng, my = this.my;
    const ev = [];
    const push = (t) => { if (t) ev.push({ t, s: snap(g) }); };
    if (this.firstPA) { this.firstPA = false; push('1回表 プレイボール'); this.umpCall('play', 0); }
    let scene = null;
    for (let guard = 0; guard < 80 && !scene && !g.over; guard++) {
      if (g.outs >= 3) {
        push('スリーアウト チェンジ');
        if (R.endHalf(g) === 'over') { push(`試合終了 ${g.result}`); break; }
        const inn = g.inning;
        const h = R.simulateHalf(g, rng);
        push(`${inn}回裏 ${h.runs}点${g.over ? ' ' + g.result : ''}`);
        if (g.over) break;
        if (R.endHalf(g) === 'over') { push(`試合終了 ${g.result}`); break; }
        push(`${g.inning}回表${g.inning > 9 ? '(延長)' : ''}`);
        continue;
      }
      const cont = this.contPA; this.contPA = false;
      if (!cont) g.pa++;
      const fp = { '1B': 0.2, '3B': 0.2, LF: 0.13, RF: 0.13, C: 0.22 }[my] || 0;   // ファウルの場面は、触れる機会のある守備位置だけ(11/25 捕手は本塁まわりのファウルフライ)
      // 11/25 自分が捕手: 一塁に走者がいる時は、打席の初めに盗塁の場面も(規則の側の盗塁 3.5% だけでは 1 試合にほとんど来ないので)
      if (my === 'C' && !this.watching && !cont && R.stealChance(g) && rng() < 0.12) { scene = { kind: 'steal' }; this.contPA = true; break; }
      const res = R.simulatePA(g, rng, { steal: () => !!this.stealRole() && rng() < 0.85, cont, foul: () => rng() < fp });
      if (res.kind === 'done') { push(res.text); continue; }
      for (const n of res.notes || []) push(n);
      if (res.kind === 'steal') { scene = { kind: 'steal' }; break; }
      if (res.kind === 'foul') {
        const r = rng();
        // 自分がボールに触れる機会のあるファウルだけ場面にする(バックネットへ・スタンドへは自動で飛ばす)
        const ty = my === 'C' ? 'foul_fly' : my === '1B' || my === '3B' ? (r < 0.55 ? 'foul_fly' : 'foul_grounder')
          : POS[my].of && my !== 'CF' ? (r < 0.6 ? 'foul_fly' : 'foul_line') : null;
        if (ty) { scene = { kind: 'field', bip: { type: ty, zone: my, hit: false, hand: g.hand } }; break; }
        if (g.strikes < 2) g.strikes++; continue;
      }
      let bip = res.bip;
      const want = 0.28 + (POS[my].of ? 0.08 : 0) + (g.scenes < g.pa * 0.4 ? 0.14 : 0);
      if (bip.zone !== my && bip.type !== 'hr' && rng() < want) bip = this.bipForMe(bip);
      if (bip.zone === my && bip.type !== 'hr' && (bip.type !== 'foulfly' || my === '1B' || my === '3B' || my === 'C')) { scene = { kind: 'field', bip }; break; }
      if (bip.type !== 'hr' && bip.type !== 'foulfly' && bip.zone !== 'C') {
        const plan = R.coverPlan({ ...bip, bases: g.bases, outs: g.outs, hand: g.hand });
        const role = plan[my];
        // 自分に送球が来る役目(中継・送球の来る塁)だけ操作の場面にする。バックアップ・送球の来ない塁は自動で(成績には数える)
        const ofz = POS[bip.zone] && POS[bip.zone].of;
        const expect = ofz ? (bip.hit ? (g.bases[1] ? 0 : g.bases[0] ? 3 : 2) : (g.bases[2] && g.outs < 2 ? 0 : null)) : (g.bases[0] && g.outs < 2 ? 2 : 1);
        // 試合が決まる最後のアウトになりうる打球(9 回以降の表・2 アウト・リード)は、自分に関わらなくても普通の速さで見せる
        const lastOut = g.half === 'top' && g.inning >= 9 && g.outs === 2 && g.score.us > g.score.them;
        if (lastOut && bip.type !== 'foulfly' && bip.zone !== my && bip.zone !== 'C') { scene = { kind: 'watch', bip }; break; }
        // 操作の場面にするのは中継(受けて投げる先を選ぶ所)だけ。塁に入る・バックアップは全部自動(11/17 持ち主)
        if (role && role.role === 'cut' && rng() < 0.85) { scene = { kind: 'cover', bip, plan, role }; break; }
        // 11/25 投手: 一塁側のゴロで一塁のベースカバーに入る(一塁手から送球を受けて一塁を踏む)
        if (my === 'P' && role && role.role === 'base' && role.base === 1 && bip.type === 'grounder' && !bip.hit && rng() < 0.85) { scene = { kind: 'cover', bip, plan, role }; break; }
        // 11/25 捕手: 外野の安打で二塁・三塁の走者が還ってくる・外野フライのタッチアップ → 本塁で送球を受けてタッチ
        if (my === 'C' && ofz && (bip.hit ? (g.bases[1] || g.bases[2]) : (g.bases[2] && g.outs < 2)) && rng() < 0.85) { scene = { kind: 'cover', bip, plan, role: { role: 'base', base: 0, why: bip.hit ? '本塁で返球を待つ' : '本塁で返球を待つ(タッチアップ)' } }; break; }
        // 併殺: 二塁に入って受けて一塁へ投げる(ピボット)は操作の場面(自分がボールに触れて次の動作をする)
        const dpBall = !ofz && bip.type === 'grounder' && g.bases[0] && g.outs < 2 && !bip.hit;
        if (dpBall && role && role.role === 'base' && role.base === 2 && rng() < 0.9) { scene = { kind: 'cover', bip, plan, role, dp: true }; break; }
        if (role && (role.role === 'base' || role.role === 'backup')) { this.stats.coverTotal++; this.stats.cover++; }
      }
      push(R.resolveBIP(g, bip, rng));
    }
    // 11/18 持ち主「攻守の入れ替えをサクサクに」: 回が替わった時は、守る人を守備位置に置き直してすぐ次の場面へ(歩いて戻るのを待たない)
    const changed = ev.some((e) => e.t === 'スリーアウト チェンジ');
    const then = () => { if (changed && !g.over) this.snapHome(); if (scene) this.startScene(scene); else if (g.over) this.endGame(); else this.wait = changed ? 0 : 0.2; };
    this.startDigest(ev, then, changed ? 1.5 : null);
  }
  bipForMe(bip) {
    const rng = this.rng, my = this.my, g = this.g;
    let type;
    if (POS[my].of) { const r = rng(); type = r < 0.08 ? 'fence' : r < 0.55 ? 'fly' : r < 0.85 ? 'liner' : 'grounder'; }
    else if (my === 'C') { const r = rng(); type = r < 0.5 ? 'bunt' : r < 0.8 ? 'pop' : 'foulfly'; }   // 11/25 捕手: バント・捕手前のフライ・ファウルフライ
    else if (my === 'P') { const r = rng(); type = r < 0.5 ? 'grounder' : r < 0.68 ? 'liner' : r < 0.8 ? 'pop' : 'bunt'; }   // 11/25 投手: ピッチャー返し・バント処理
    else if ((my === '1B' || my === '3B') && rng() < 0.08) type = 'foulfly';
    else { const r = rng(); type = r < 0.6 ? 'grounder' : r < 0.8 ? 'liner' : r < 0.94 ? 'pop' : ((my === '1B' || my === '3B') && g.outs < 2 && g.bases[0] && !g.bases[2] ? 'bunt' : 'grounder'); }
    return { ...bip, type, zone: my, hit: false };
  }
  // 最後のアウトの場面を見る: 見やすいテレビ中継の視点にして、打った所から決まるまで(実況・審判・歓声つき)
  watchScene(sc) {
    const { bip } = sc, c = this.ctx;
    this.prevView = c.view;
    if (c.setViewQuiet) c.setViewQuiet('tv');
    const zone = bip.type === 'hr' ? 'CF' : bip.zone;
    const of = POS[zone] && POS[zone].of;
    const type = bip.type === 'hr' ? 'fence' : of ? (bip.hit ? 'liner' : 'fly') : (bip.type === 'bunt' ? 'bunt' : bip.type === 'pop' || bip.type === 'liner' ? bip.type : 'grounder');
    this.hush('最後のアウトなるか', '', { ms: 1200 });
    this.startPlay({ fielder: zone === this.my ? zone : zone, L: 0.35, by: 'bat', type, hit: !!bip.hit, sitT: 0.6 });
    const pl = this.play; pl.watch = true;
    if (of && bip.hit && type === 'liner') { pl.batted = this.hitSafe(() => this.makeBall('liner', this.homeOf(zone).setY(0).lerp(V(0, 0, -40), 0.25).add(COVFIX_OFF ? V() : V((this.rng() - 0.5) * 12, 0, (this.rng() - 0.5) * 6)), 0.4, pl.p0)); pl.fly = false; pl.ofHit = true; this.fig[zone].noCatchUntil = 99; }
  }
  stealRole() {
    const plan = R.coverPlan({ type: 'steal', zone: 'C', bases: this.g.bases, outs: this.g.outs, hand: this.g.hand });
    const r = plan[this.my];
    if (this.my === 'C' && !this.watching) return r || { role: 'field' };   // 11/25 自分が捕手: 盗塁は二塁へ投げる操作の場面(stealSceneC)
    return null;   // 盗塁で塁に入るのも自動(操作の場面にしない)
  }
  startScene(sc) {
    this.g.scenes++;
    this.applyAlignment();
    // 守備位置の変更(ゲッツー態勢など)は文字で知らせない。野手が動くのを見れば分かる
    const sitT = this.showSituation();
    if (sc.kind === 'watch') { this.watchScene(sc); return; }
    if (sc.kind === 'field') { this.applyAlignment(); const vb = this.varietyBall(sc.bip.type); this.startPlay({ fielder: this.my, L: vb.L, by: 'bat', type: vb.type, make: vb.make, star: vb.star, kb: vb.label, kind: vb.kind, sitT, randEV: true }); }
    else if (sc.kind === 'cover') this.coverScene(sc);
    else if (this.my === 'C') this.stealSceneC();
    else this.stealScene();
  }
  // 打つ前に、今の状況(回・アウト・走者・点差)を少し大きく見せる。変わった時だけ長め
  showSituation() {
    const g = this.g, c = this.ctx;
    if (!g || !c.ui || !c.ui.situation) return 0;
    const key = `${g.inning}${g.half}${g.outs}${g.bases.join()}${this.kind === 'knock' ? this.knock.n : ''}`;
    const fresh = key !== this._sitKey; this._sitKey = key;
    const b = g.bases, nm = ['一', '二', '三'].filter((x, i) => b[i]);
    const runners = !nm.length ? '走者なし' : nm.length === 3 ? '満塁' : nm.join('・') + '塁';
    const head = this.kind === 'game' ? `${g.inning}回${g.half === 'top' ? '表' : '裏'} ${g.score.them}-${g.score.us}` : '';
    c.ui.situation({ bases: b, outs: g.outs, text: `${g.outs}アウト ${runners}`, head, ms: fresh ? 1300 : 800 });
    if (fresh && this.kind === 'game' && (b.some(Boolean) || g.outs)) {
      const k = b[0] && b[1] && b[2] ? 'loaded' : b[0] && b[1] ? 'runner_12' : b[0] && b[2] ? 'runner_13' : b[1] && b[2] ? 'runner_23' : b[0] ? 'runner_1' : b[1] ? 'runner_2' : b[2] ? 'runner_3' : null;
      this.say([['no_out', 'one_out', 'two_out'][g.outs], k], { maxWait: 0.4 });
    }
    return fresh ? 0.9 : 0.4;
  }
  diffL() {
    const hardP = this.sel.diff === 'hard' ? 0.65 : this.sel.diff === 'normal' || this.sel.diff === 'std' ? 0.45 : 0.25;   // ★2 以上(三遊間の深い所・逆シングル・背走など)の割合
    return this.rng() < hardP ? 0.65 + this.rng() * 0.35 : 0.05 + this.rng() * 0.4;
  }
  coverScene(sc) {
    const { bip, plan, role } = sc;
    const zone = bip.zone;
    const of = POS[zone].of;
    const opt = { fielder: zone, L: Math.min(0.5, this.diffL() * 0.6), by: 'bat', plan, hit: !!bip.hit };
    opt.type = of ? (bip.hit ? (this.rng() < 0.7 ? 'liner' : 'grounder') : 'fly') : (bip.type === 'pop' || bip.type === 'liner' ? 'grounder' : bip.type);
    const s = R.roleSpot(role, this.my, zone);
    opt.coverSpot = { p: V(s[0], 0, s[1]), ring: role.role !== 'base', need: role.role !== 'backup', who: this.my, base: role.base };
    this.hush(role.why || '', '', { ms: 1200 });
    this.startPlay(opt);
    const pl = this.play;
    pl.cov = role;
    if (of && bip.hit) {
      // 外野の安打: 外野手の手前に落とし、外野手は捕らずに拾う
      pl.batted = this.hitSafe(() => this.makeBall(opt.type, this.homeOf(zone).setY(0).lerp(V(0, 0, -40), 0.22).add(COVFIX_OFF ? V() : V((this.rng() - 0.5) * 10, 0, (this.rng() - 0.5) * 6)), 0.3, pl.p0));
      pl.fly = false; pl.ofHit = true;
      this.fig[zone].noCatchUntil = 99;
    } else if (of) {
      pl.batted = this.makeBall('fly', this.homeOf(zone).setY(0).add(V(this.rng() * 6 - 3, 0, this.rng() * 6 - 3)), 0.3, pl.p0);
      pl.fly = true;
    }
    if (role.role === 'base') this.cover[role.base] = this.my;
    if (role.role === 'cut') this.cutoffK = this.my;
    // 11/25 自分が投手で一塁のベースカバーに入る場面: 一塁手が右(二塁の方)へ 4〜7 m 動いて捕るゴロにする(ベースの近くで捕ると一塁手が自分で踏むので)
    if (this.my === 'P' && role.role === 'base' && role.base === 1 && !of) {
      const h = this.homeOf('1B').setY(0), toward2 = BASEP[2].clone().sub(h).setY(0).normalize();
      pl.batted = this.makeBall('grounder', h.clone().addScaledVector(toward2, 4 + this.rng() * 3).add(V(0, 0, -5)), 0.3, pl.p0, { ev: 24 + this.rng() * 4 });
      pl.fly = false; pl.isBunt = false;
    }
    // 11/25 自分が捕手で本塁に入る場面: 外野の安打は外野手の横 6〜9 m へ(拾って本塁へ返す)。走者は本塁へ突っ込む
    if (this.my === 'C' && role.role === 'base' && role.base === 0) {
      pl.sendHome = true;
      if (of && bip.hit) {
        const h = this.homeOf(zone).setY(0), side = V(-h.z, 0, h.x).normalize().multiplyScalar((this.rng() < 0.5 ? -1 : 1) * (6 + this.rng() * 3));
        pl.batted = this.hitSafe(() => this.makeBall('liner', h.clone().add(side).lerp(V(0, 0, -40), 0.12), 0.4, pl.p0), 1);
      }
    }
  }
  stealScene() {
    const g = this.g, me = this.my;
    const plan = R.coverPlan({ type: 'steal', zone: 'C', bases: g.bases, outs: g.outs, hand: g.hand });
    const role = plan[me];
    const s = R.roleSpot(role, me, 'C');
    const spot = role.role === 'base' ? { p: BASEP[2].clone(), ring: false, need: true, who: me, base: 2 } : { p: V(s[0], 0, s[1]).add(V(0, 0, -2)), ring: true, need: false, who: me };
    this.hush('盗塁!', role.why, { ms: 1300 });
    this.startPlay({ fielder: 'C', L: 0.2, by: 'bat', type: 'pop', coverSpot: spot, plan, planType: 'steal' });
    const pl = this.play;
    pl.batted = null; pl.steal = true; pl.phase = 'steal'; pl.cov = role;
    const cov2 = role.role === 'base' ? me : Object.keys(plan).find((k) => plan[k].role === 'base' && plan[k].base === 2) || 'SS';
    this.cover[2] = cov2;
    const r1 = this.runners.find((r) => r.base === 1);
    if (r1) { r1.run = true; r1.done = false; r1.to = 2; r1.startAt = 0; r1.forced = false; r1.dist = 3.5 + this.rng() * 4; }
    this.batterRunner = null;
    this.say('steal', { cut: true });
    this.later(1.6, () => {
      if (this.play !== pl) return;
      const C = this.fig.C;
      const from = C.root.position.clone().add(V(0.2, 1.4, -0.3));
      const to = BASEP[2].clone();
      const st = solveThrow(from, to, 33, 0.6);
      const path = predict(this.world, from, st.v, st.w, 5, { Cd: 0.35, clScale: 0, dt: DT });
      pl.thrown = { from: 'C', fromK: 'C', base: 2, to: cov2 === me ? 'me' : cov2 };
      if (cov2 !== me) { this.fig[cov2].target = to.clone(); }
      pl.phase = 'live';
      C.throwT = 0.35;
      this.launch(path, pl.t);
    });
  }

  // 11/25 自分が捕手の盗塁: 一塁走者がスタート → 投手の球を自分が捕る → 二塁へ投げる(塁を選ぶ)。二塁に入る野手がタッチ
  stealSceneC() {
    const g = this.g;
    const plan = R.coverPlan({ type: 'steal', zone: 'C', bases: g.bases, outs: g.outs, hand: g.hand });
    this.hush('盗塁!', '捕ったら二塁へ', { ms: 1300 });
    this.startPlay({ fielder: 'C', L: 0.2, by: 'bat', type: 'pop', plan, planType: 'steal' });
    const pl = this.play;
    pl.batted = null; pl.steal = true; pl.phase = 'steal'; pl.stealC = true;
    const cov2 = Object.keys(plan).find((k) => plan[k].role === 'base' && plan[k].base === 2) || 'SS';
    this.cover[2] = cov2;
    if (this.fig[cov2]) { this.fig[cov2].target = BASEP[2].clone(); this.fig[cov2].role = 'base2'; }
    const r1 = this.runners.find((r) => r.base === 1);
    if (r1) { r1.run = true; r1.done = false; r1.to = 2; r1.startAt = 0.1; r1.forced = false; r1.dist = 3.0 + this.rng() * 1.0; }
    this.batterRunner = null;
    this.say('steal', { cut: true });
    // 投手はクイックで投げる(走者が出てから約 1.0 秒で放す、約 130 km/h)。球は構えたミットの所(体の前 0.45 m・高さ 0.95 m)へ。
    // 走者が二塁に着くのは約 3.7 秒。捕ってから 0.6 秒ほどで投げればアウト、遅いとセーフ
    this.later(1.0, () => {
      if (this.play !== pl) return;
      const me = this.ctx.player.pos, from = V(-0.18, 1.81, -17.46), to = V(me.x - 0.05, me.y + 0.95, me.z - 0.45);
      const st = solveThrow(from, to, 36, 0.4);
      const path = predict(this.world, from, st.v, st.w, 3, { Cd: 0.35, clScale: 0, dt: DT });
      pl.thrown = { from: 'P', fromK: 'P', base: null, to: 'me', eta: pl.t + this.arriveT(path, to), pitch: true };
      this.fig.P.throwT = 0.35;
      this.launch(path, pl.t);
    });
  }
  // ------------------------------------------------------------ 早送り(引きの画面で 2〜3 秒まで)
  startDigest(ev, then, maxDur) {
    if (!ev.length) { then(); return; }
    const c = this.ctx;
    const dur = Math.min(maxDur || 2.2, Math.max(1.0, 0.6 + 0.34 * ev.length));   // 攻守交代(チェンジ・裏の回・次の回)は 1.5 秒まで
    this.dg = { t: 0, dur, ev, then };
    c.setCamOverride(true);
    this.layRunners();
    this.ballView.show(false); this.ring.visible = false;
    this.updatePad();
    c.ui && c.ui.board(null);
    this.updateDigest(0);
  }
  updateDigest(dt) {
    const d = this.dg, c = this.ctx;
    d.t += dt;
    const n = d.ev.length;
    const shown = Math.min(n, 1 + Math.floor(d.t / (d.dur / n)));
    const cur = d.ev[shown - 1];
    if (c.ui) c.ui.digest(cur.s, d.ev.slice(0, shown).map((e) => e.t));
    if (shown !== d.shown) { d.shown = shown; this.digestSound(cur); }
    // 引きの画面: 一塁側の高い所から、ゆっくり動かす
    const u = Math.min(1, d.t / d.dur);
    const cam = c.camera;
    const tall = cam.aspect < 1;
    const k = this.dgCamK ?? 0.65;   // 引きの寄り具合(11/19: 1 だと潮凪ドームは屋根の中・甲子園は銀傘の下に入ったので、9 球場とも 0.65 に寄せた)
    cam.position.set((18 - 20 * u) * k, (30 + 2 * u) * k, (40 - 6 * u) * k); cam.lookAt(0, tall ? -4 : 0, tall ? -34 : -42);
    const fov = tall ? 84 : 60;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (d.t >= d.dur) {
      this.dg = null;
      c.setCamOverride(false);
      c.ui && c.ui.digest(null);
      this.layRunners();
      this.updateHUD();
      d.then();
      this.updatePad();
    }
  }
  // 早送りの行に合わせた実況・審判・歓声(短く。遅れた言葉は捨てる)
  digestSound(e) {
    const t = e.t, snd = this.ctx.sound;
    const k = [];
    if (/プレイボール/.test(t)) k.push('play_ball');
    else if (/延長/.test(t)) k.push('extra');
    else if (/^(\d+)回表/.test(t)) k.push(`inning_${+t.match(/^(\d+)/)[1]}`);
    else if (/^9回裏/.test(t) && !/点/.test(t)) k.push('bottom_9');
    else if (/チェンジ/.test(t)) { k.push('change'); snd.crowdEvent(e.s && this._pinch ? 'escape' : 'change', 1); this._pinch = false; }
    else if (/試合終了/.test(t)) { k.push(/サヨナラ/.test(t) ? 'sayonara' : 'game_set'); snd.crowdEvent(/サヨナラ/.test(t) ? 'sayonara' : 'change', 1); }
    else if (/サヨナラ/.test(t)) { k.push('sayonara'); snd.crowdEvent('sayonara', 1); }
    else if (/見逃し三振/.test(t)) { k.push('strikeout_looking'); this.umpCall('strike_out', 0); snd.crowdEvent('strikeout', 1); }
    else if (/三振/.test(t)) { k.push('strikeout'); this.umpCall('strike', 0); snd.crowdEvent('strikeout', 1); }
    else if (/振り逃げ/.test(t)) k.push('dropped_third');
    else if (/四球/.test(t)) k.push('walk');
    else if (/死球/.test(t)) { k.push('hbp'); this.umpCall('hbp', 0); }
    else if (/本塁打/.test(t)) { k.push('hr'); snd.crowdEvent('hr', 1); }
    else if (/エンタイトル/.test(t)) k.push('entitled');
    else if (/二塁打|三塁打/.test(t)) { k.push('long_hit'); snd.crowdEvent('longhit', 0.8); }
    else if (/ヒット|安打/.test(t)) { k.push('through'); snd.crowdEvent('hit', 0.6); }
    else if (/併殺/.test(t)) { k.push('double_play'); snd.crowdEvent('dp', 1); }
    else if (/インフィールドフライ/.test(t)) k.push('infield_fly');
    else if (/犠牲フライ/.test(t)) k.push('sac_fly');
    else if (/送りバント/.test(t)) k.push('bunt');
    else if (/盗塁成功/.test(t)) k.push('steal_safe');
    else if (/盗塁失敗/.test(t)) k.push('steal_out');
    else if (/暴投/.test(t)) k.push('wild_pitch');
    else if (/捕逸/.test(t)) k.push('passed_ball');
    else if (/フライ|ライナー|ゴロ|小飛球/.test(t)) { k.push('out'); snd.crowdEvent('out', 0.4); }
    if (/(\d+) 点/.test(t) && !/本塁打/.test(t)) k.push('home_in');
    if (k.length) this.say(k, { maxWait: 1.2 });
    if (e.s) this.crowdPressure(e.s);
  }
  // 得点圏(二塁・三塁)の走者で、攻める側の応援が高まる。満塁はいちばん
  crowdPressure(st) {
    const g = st || this.g; if (!g) return;
    const b = g.bases, p = (b[1] ? 0.5 : 0) + (b[2] ? 0.5 : 0) + (b[0] && (b[1] || b[2]) ? 0.15 : 0);
    if (p >= 0.5 && g.outs < 3) this._pinch = true;
    this.ctx.sound.setPressure(Math.min(1, p), g.half);
  }
  endGame() {
    const g = this.g;
    g.over = true;
    this.umpCall('game', 0);
    this.say('game_set', { maxWait: 3 });
    this.lastResult = { kind: 'game', pos: this.my, g, stats: { ...this.stats } };
    if (!this.watching) { mkEv('def_game'); if (g.score && g.score.us > g.score.them) mkEv('def_win'); if ((+this.ctx.load('r4walk.guideN', 0) || 0) < 10) this.ctx.store('r4walk.guideN', 10); }   // 11/22 目標・試合を最後まで守ったらガイドの確認を 1 回
    this.stop(true);
    this.showResult(false);
  }
  showResult(stopped) {
    const s = this.stats;
    if (!s || !this.ctx.ui) return;
    this.ctx.releasePointer && this.ctx.releasePointer();
    if (this.kind === 'knock') {
      const k = this.knock;
      const r = stopped ? { caught: s.caught, streak: s.bestStreak, correct: s.correct, time: this.ctx.simTime - k.t0, N: k.N, done: k.n, pos: this.my } : this.lastResult;
      this.ctx.ui.result({ kind: 'knock', ...r, N: k.N, pos: this.my, done: stopped ? k.n : k.N, stopped, newBest: !stopped && this.lastResult.newBest, stats: s, ev: this.evalSummary() });
    } else this.ctx.ui.result({ kind: 'game', g: this.g, pos: this.my, stats: s, stopped, ev: this.evalSummary() });
  }

  // ------------------------------------------------------------ 人の形を動かす
  placeUmps() {
    const g = this.g, inside = g && g.bases.some(Boolean);
    this.ump[1].root.position.set(22.5, 0, -25.5); this.ump[3].root.position.set(-22.5, 0, -25.5);
    this.ump[2].root.position.set(inside ? -3 : -4.5, 0, inside ? -33 : -46);
  }
  animateUmps(dt) {
    const bp = this.ballPos;
    for (const [b, u] of Object.entries(this.ump)) {
      if (!u.root.visible) continue;
      if (+b !== 0 && bp && this.play && this.play.phase === 'live') u.setYawToward(bp.x, bp.z);
      if (u.anim && u.anim.t > 0) { u.anim.t -= dt; u.set(u.anim.kind === 'safe' ? 'ump_safe' : u.anim.kind === 'out' || u.anim.kind === 'strike' ? 'ump_out' : 'ump_point'); }
      else u.set(+b === 0 ? 'crouch' : 'ready');
      if (+b !== 0 && !(bp && this.play && this.play.phase === 'live')) u.setYawToward(0, 0);
    }
  }
  animateFigures(dt) {
    const pl = this.play;
    for (const k of Object.keys(POS)) {
      const F = this.fig[k];
      if (!F.root.visible) continue;
      F.phase = (F.phase || 0);
      if (F.setHolding) F.setHolding(this.holderFig === F);
      if (k === 'P' && pl && pl.phase === 'pre' && this.kind === 'game') continue;   // 投球中は preContact が動かす
      if (F.throwT > 0) { F.throwT -= dt; F.set('throw', { u: 1 - F.throwT / 0.35, toss: F.tossTo }); continue; }
      const prep = F.prep && pl && pl.t < F.prep.until ? F.prep : null;
      if (!prep) F.prep = null;
      if (prep) {
        F.set('catch', { clip: prep.clip, start: prep.start, id: prep.id });
        if (F.target) { const p = F.root.position, dx = F.target.x - p.x, dz = F.target.z - p.z, d = Math.hypot(dx, dz); if (d > 0.15) { const st = Math.min(d, Math.max(2, F.spd || 0) * dt); p.x += dx / d * st; p.z += dz / d * st; } }
        continue;
      }
      if (F.catchT > 0) { F.catchT -= dt; F.set('catch', { h: F.catchH || 0 }); continue; }
      if (F.pointT > 0 && F.pointAt) {
        F.pointT -= dt; F.setYawToward(F.pointAt.x, F.pointAt.z);
        const d = F.pointAt.clone().sub(F.root.position); d.y = 0.3;
        F.set('ready');   // 捕った後は握り替えて投げる方を向くだけ(両手を上げる形は出さない)
        continue;
      }
      // 打つ前(投球の間)は守備位置で構える。動き出すのは打ってから(反応の遅れのあと)
      F.react = F.react ?? (0.2 + ((k.charCodeAt(0) * 7 + (k.charCodeAt(1) || 0) * 13) % 25) / 100);
      // 11/26 持ち主「取った後ベースカバー異常に遅かったりで併殺にならなかったり」: 塁に入る人(base0〜3)は打った瞬間(0.1 秒)に塁へ走り出す(前は人ごとの 0.2〜0.44 秒)
      const covRun = !COVFIX_OFF && /^base/.test(F.role || '') && pl && pl.batted && (pl.batted.type === 'grounder' || pl.batted.type === 'bunt');
      const hold = pl && !pl.steal && pl.t < pl.contactT + (k === pl.opt.fielder ? 0.2 : covRun ? 0.1 : F.react);
      if (F.target && !hold) {
        const p = F.root.position;
        // 15. 本塁の後ろへ回る人(投手のバックアップ)は、本塁と走路の上を通らずに、横へ回り込む
        let tx = F.target.x, tz = F.target.z;
        if (F.target.z > 1.5 && p.z < -1.5 && Math.abs(p.x) < 6 && Math.abs(tx) < 8) { tx = (tx >= 0 ? 7 : -7); tz = 0.5; }
        // 11/22 通り道の点(via、一塁カバーの投手の線の内側)を通ってから行く先へ。通る点では緩めない
        let viaD = 0;
        if (F.target.via) { const w = F.target.via; if (Math.hypot(w.x - p.x, w.z - p.z) < 1.0) F.target.via = null; else { viaD = Math.hypot(F.target.x - w.x, F.target.z - w.z); tx = w.x; tz = w.z; } }
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        if (d > 0.15) {
          // 加速して最高速、着く手前で速さを落とす(捕る所・塁で止まれるように)
          const vmax = VMAX[k] || AI_SPEED;
          // 11/20 夜 持ち主「近いフライが飛んできた外野手はボールが取られるまでは全力で」: フライが空中にある間の外野手(捕る人もカバーの人も)は、
          // すぐ最高速まで上げて(加速 14 m/s²)、着くまで速さを落とさない(手前で緩めない。着いたら止まって構える)
          const fullOF = pl && pl.fly && POS[k].of && !pl.fieldedBy && !pl.holder && !pl.thrown && pl.phase === 'live';
          // 11/25 外野で転がる球を拾いに行く外野手は、拾う所で止まりきらずに走りながら拾う(4.5 m/s までしか緩めない)
          const scoop = !LOOSE_OFF && pl && POS[k].of && F.role === 'field' && (pl.looseK === k || pl.opt.fielder === k) && !pl.holder && !pl.thrown && this.ball && this.ballPos && this.ballPos.y < 0.6;
          const vStop = fullOF ? vmax : Math.max(scoop ? 4.5 : 0, Math.sqrt(2 * DEC * Math.max(0, d + viaD - 0.1)));
          F.spd = Math.min(vmax, (F.spd || 0) + (fullOF ? 14 : covRun ? ACC_COV : ACC) * dt, Math.max(2.0, vStop));   // 11/26 塁に入る人は走り出しを速く(ACC_COV)
          const s = Math.min(d, F.spd * dt);
          p.x += dx / d * s; p.z += dz / d * s; p.y = this.gy(p);
          // フライで頭を越える打球を追う最初の数歩は、打球の方を向いたまま後ろへ下がる
          const back = pl && pl.fly && k === pl.opt.fielder && pl.t < pl.contactT + 1.1 && F.spd < 3.6 && Math.hypot(tx, tz) > Math.hypot(p.x, p.z) + 3 && (dx * p.x + dz * p.z) > 0.7 * d * Math.hypot(p.x, p.z);
          F.root.rotation.y = back ? Math.atan2(dx, dz) : Math.atan2(-dx, -dz);
          F.phase += dt * (6 + F.spd * 0.8);
          F.set('run', { phase: F.phase, v: F.spd, back });
          continue;
        }
        if (F.target.snap && d > 0.005) { p.x = tx; p.z = tz; }   // 11/21 一塁を踏む所はぴったりに(0.15 m 手前で止まると足がベースから外れる)
        F.spd = 0;
      } else F.spd = 0;
      const bp = this.ballPos || V(0, 0, 0);
      if (pl && this.ball) F.setYawToward(bp.x, bp.z); else F.setYawToward(0, 0);
      if (this.holderFig === F) F.set('stand');
      else if (pl && pl.phase === 'live' && k === this.cutoffK && F.role === 'cut' && this.ballPos && Math.hypot(this.ballPos.x, this.ballPos.z) > 40 && !pl.thrown && pl.holder !== k && this.holderFig !== F) {
        const of = this.fig[pl.opt.fielder]; if (of) F.setYawToward(of.root.position.x, of.root.position.z);
        F.set('point');   // 中継で呼ぶ(両手を上げる)
      } else F.set(k === 'C' ? (pl && pl.phase !== 'pre' ? 'ready' : 'crouch') : 'ready');
    }
    this.separate();
    const all = [this.batterRunner, ...this.runners];
    for (const r of all) {
      if (!r || !r.fig) continue;
      if (r.isBatter && !(pl && pl.phase !== 'pre' && this.kind === 'game' && pl.t >= pl.contactT + 0.55)) { r.fig.root.visible = false; continue; }
      r.fig.root.visible = !r.scored;
      const p = this.runnerPos(r);
      if (r.isBatter && r.throughT != null) {
        // 一塁を駆け抜ける: 動きの根っこの前への移動(ベースを踏んだ所から先)だけ一塁の先へ
        r.throughT += dt;
        const f = this.overrunOff(r);   // 駆け抜けて、振り返って一塁へ小走りで戻る
        const d1 = BASEP[1].clone().sub(BASEP[0]).setY(0).normalize();
        p.addScaledVector(d1, f);
      }
      // 11/21 打者走者は一塁で受ける人(一塁手・ベースカバーの人)とぶつからない: 0.6 m より近ければファウル側へよける
      if (r.isBatter && (r.from === 0 || r.throughT != null || r.dist < 3)) {
        for (const k of new Set(['1B', this.cover && this.cover[1]])) {
          const G = k && k !== this.my && this.fig[k]; if (!G || !G.root.visible) continue;
          const q = G.root.position;
          for (let i = 0; i < 16 && Math.hypot(p.x - q.x, p.z - q.z) < 0.6; i++) { p.x += FOUL1.x * 0.05; p.z += FOUL1.z * 0.05; }
        }
      }
      r.fig.root.position.set(p.x, 0, p.z);
      if (r.slideT != null && r.slideT < 1.1) { r.slideT += dt; r.fig.set('slide', { t: r.slideT }); continue; }
      if (r.isBatter && r.throughT != null && r.throughT >= 0.8 && this.overrunOff(r) > 0) { r.fig.setYawToward(BASEP[1].x, BASEP[1].z); r.fig.set('run', { v: 4.0 }); continue; }
      if (r.isBatter && r.throughT != null && r.throughT < 0.8) { r.fig.setYawToward(p.x + (BASEP[1].x - BASEP[0].x), p.z + (BASEP[1].z - BASEP[0].z)); r.fig.set('through', { t: r.throughT }); continue; }
      if (r.returning) { const nb = BASEP[r.from]; r.fig.setYawToward(nb.x, nb.z); r.ph = (r.ph || 0) + dt * 12; r.fig.set('run', { phase: r.ph }); }
      else if (r.run && !r.done && pl && pl.t >= (r.startAt || 0) && !(r.half && r.dist >= (r.halfDist ?? HALF))) {
        const nb = BASEP[(r.from + 1) % 4];
        r.fig.setYawToward(nb.x, nb.z);
        r.ph = (r.ph || 0) + dt * 12;
        r.fig.set('run', { phase: r.ph });
      } else if (r.out) { r.outT = (r.outT || 0) + dt; r.fig.set('stand'); if (r.outT > 1.0) r.fig.root.visible = false; }
      else {
        // リードの間は投手(打った後は打球)の方を向いて構える。第二リードは横歩き
        const lk = !pl || pl.t < pl.contactT || pl.endT != null ? V(0, 0, -18.4) : (this.ballPos || V(0, 0, -18.4));   // 11/26 プレーの間(早送り・次の打席の前)は前の球の所でなく投手の方
        r.fig.setYawToward(lk.x, lk.z);
        r.fig.set('ready');
      }
    }
    if (this.batterRunner && pl && pl.phase !== 'pre' && pl.t >= pl.contactT + 0.55) this.batter.root.visible = false;
    else if (this.kind === 'game') this.batter.root.visible = true;
    this.facePoint = pl && pl.coverSpot && !pl.coverDone ? pl.coverSpot.p : V(0, 0, 0);
  }

  // 球が手の届く所へ来るまでの時間と、その時の球(lead 秒先まで)
  catchAhead(pos, reach, lead) {
    const pl = this.play, b = this.ball; if (!pl || !b) return null;
    const path = b.path, tb = pl.t - b.t0;
    const i0 = Math.max(0, Math.floor(tb / path.dt)), i1 = Math.min(path.n - 1, Math.ceil((tb + lead) / path.dt));
    for (let i = i0; i <= i1; i += 2) {
      const x = path.pts[i * 4], y = path.pts[i * 4 + 1], z = path.pts[i * 4 + 2];
      const hb = y - (pos.y || 0);
      if (Math.hypot(x - pos.x, z - pos.z) < reach && hb > -0.2 && hb < 2.6) return { dt: i * path.dt - tb, p: V(x, y, z), hb };
    }
    return null;
  }
  // 捕る形を選ぶ: 高さ(頭の上・胸・地面)と、地面なら体の右か左か
  catchClip(a, pos, yaw, who) {
    const pl = this.play;
    if (who === 'C' && pl && pl.thrown) return { clip: 'tag', ct: 0.22, face: true };   // 本塁で受けてタッチ
    if (pl && pl.thrown && who !== 'me' && pl.thrown.relayTo != null && who === this.cutoffK) return { clip: 'cutoff_relay', ct: 0.15, rel: 0.93, face: true };   // 中継: 受けて回って投げる
    if (pl && pl.thrown && who !== 'me' && this.stretch1(pl, who) && a.hb > 0.45 && a.hb < 1.75) return { clip: 'first_stretch', ct: 0.5, face: true };   // 11/21 一塁で踏んで待つ人(一塁手・ベースカバーの投手など)は、右足をベースに付けたまま左足を踏み出して伸びて捕る
    if (pl && pl.thrown && who !== 'me' && pl.thrown.base != null && who !== '1B') {
      const b = pl.thrown.base, B = BASEP[b];
      if (Math.hypot(pos.x - B.x, pos.z - B.z) < 3) {
        const br = this.batterRunner;
        const dpOk = b === 2 && (who === 'SS' || who === '2B') && br && !br.out && (this.g ? this.g.outs + pl.outs : 0) < 2 && this.runners.some((r) => !r.out && r.from === 1 && r.run && !r.done);
        if (dpOk) return who === 'SS' ? { clip: 'dp_ss_pivot', ct: 0.42, rel: 0.81, dp: 'fwd' } : { clip: 'dp_2b_pivot', ct: 0.32, rel: 0.65, dp: 'left' };
        const forced = [this.batterRunner, ...this.runners].some((r) => r && !r.out && r.run && !r.done && (r.from + 1) % 4 === b && this.forcedNow(r));
        return forced ? { clip: 'base_cover', ct: 0.72, face: true } : { clip: 'tag', ct: 0.22, face: true };
      }
    }
    if (a.hb > 1.75) return { clip: 'fly_catch', ct: 0.58 };
    if (a.hb > 0.6) return who === '1B' && Math.hypot(pos.x - BASEP[1].x, pos.z - BASEP[1].z) < 2 ? { clip: 'first_stretch', ct: 0.5 } : { clip: 'tag', ct: 0.22 };
    if (a.hb > 0.25 && motionEvent('mx_gb_low', 'catch') != null) return { clip: 'mx_gb_low', ct: 0.5 };   // 膝の高さの球: Mixamo の低い捕球(Mixamo の骨組みの体だけ、11/19 夜)
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const dx = a.p.x - pos.x, dz = a.p.z - pos.z;
    const lat = dx * -fz + dz * fx;
    if (lat > 0.6) return { clip: 'gb_backhand', ct: 0.5 };
    if (lat < -0.6) return { clip: 'gb_forehand', ct: 0.5 };
    return { clip: 'gb_front', ct: 0.5 };
  }
  // 毎こま: 捕りに行く人(自分・自動)の捕る動きを、届く時刻に合わせて始める
  updatePreps() {
    const pl = this.play;
    if (!pl || !this.ball || pl.holder) return;
    const tryPrep = (who, pos, yaw, reach, holder) => {
      if (holder.prep && holder.prep.path === this.ball.path) return;
      const a = this.catchAhead(pos, reach, 0.62);
      if (!a) return;
      const c = this.catchClip(a, pos, yaw, who);
      c.ct = motionEvent(c.clip, 'catch') ?? c.ct; if (c.rel) c.rel = motionEvent(c.clip, 'release') ?? c.rel;
      if (a.dt > c.ct + 0.02) return;
      if (who !== 'me' && pl.fly && !pl.thrown && !pl.called && c.clip === 'fly_catch') { pl.called = who; this.voiceCall(who); }   // 自動の野手もフライは「オーライ」
      holder.prep = { clip: c.clip, start: Math.max(0, c.ct - a.dt), id: (this._prepId = (this._prepId || 0) + 1), until: pl.t + (c.rel ? 0.2 + c.rel - c.ct + a.dt + 0.35 : 1.0), path: this.ball.path, who, rel: c.rel, ct: c.ct, catchAt: pl.t + a.dt };
      // 向き: 受ける時は送球の来る方を向く。併殺は投げる先(一塁)が動きの投げる向きになるように
      if (who !== 'me' && holder.root) {
        const F = holder, fp = F.root.position;
        if (c.dp) { const to = BASEP[1], yaw = Math.atan2(-(to.x - fp.x), -(to.z - fp.z)); F.root.rotation.y = c.dp === 'left' ? yaw - Math.PI / 2 : yaw; }
        else if (c.face && pl.thrown) { const from = pl.thrown.fromK && this.fig[pl.thrown.fromK] ? this.fig[pl.thrown.fromK].root.position : this.ctx.player.pos; F.setYawToward(from.x, from.z); }
      }
    };
    const me = this.ctx.player.pos;
    const meReach = this.D.reach + 0.2;
    if ((pl.opt.fielder === this.my && !pl.thrown) || (pl.thrown && pl.thrown.to === 'me') || pl.loosePick) tryPrep('me', me, this.ctx.meYaw ? this.ctx.meYaw() : 0, meReach, this);
    const ks = new Set([pl.thrown ? null : pl.opt.fielder, pl.thrown && pl.thrown.to !== 'me' ? pl.thrown.to : null, pl.looseK]);
    for (const k of ks) {
      if (!k || k === this.my || !this.fig[k]) continue;
      const F = this.fig[k];
      tryPrep(k, F.root.position, F.root.rotation.y, this.stretch1(pl, k) ? 1.15 : pl.thrown ? 2.2 : (this.D.ai || 1.8) + 0.2, F);   // 11/21 伸びて捕る人は捕る所(1.15 m)に合わせて動きを始める
    }
  }
  // 人どうしがすり抜けない: 0.8 m より近い 2 人は、球に関わっていない方がよける
  separate() {
    const pl = this.play, ks = Object.keys(POS).filter((k) => this.fig[k].root.visible);
    const keep = (k) => (pl && (pl.opt.fielder === k || pl.holder === k || (pl.thrown && pl.thrown.to === k) || /^base/.test(this.fig[k].role || ''))) || (k === 'C' && (!pl || pl.phase === 'pre')) ? 1 : 0;
    const me = this.ctx.player.pos;
    for (let i = 0; i < ks.length; i++) {
      const A = this.fig[ks[i]].root.position;
      for (let j = i + 1; j < ks.length; j++) {
        const B = this.fig[ks[j]].root.position;
        const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
        if (d >= 0.8) continue;
        const ux = d > 1e-3 ? dx / d : 1, uz = d > 1e-3 ? dz / d : 0, push = 0.8 - d;
        const ka = keep(ks[i]), kb = keep(ks[j]);
        const wa = ka && !kb ? 0 : !ka && kb ? 1 : 0.5;
        A.x -= ux * push * wa; A.z -= uz * push * wa; B.x += ux * push * (1 - wa); B.z += uz * push * (1 - wa);
      }
      // 自分の選手ともすり抜けない
      const dx = A.x - me.x, dz = A.z - me.z, d = Math.hypot(dx, dz);
      if (d < 0.75 && d > 1e-3 && !keep(ks[i])) { A.x += dx / d * (0.75 - d); A.z += dz / d * (0.75 - d); }
    }
  }
  // 今の状況(プレーの途中のアウト・走者・得点を足した物)
  liveState() {
    const g = this.g, pl = this.play;
    const L = { inning: g.inning, half: g.half, score: { ...g.score }, outs: g.outs, bases: g.bases.slice(), balls: g.balls, strikes: g.strikes };
    if (pl && pl.phase !== 'pre') {
      L.outs = Math.min(3, g.outs + (pl.outs || 0));
      const nb = [false, false, false]; let runs = 0;
      for (const r of [this.batterRunner, ...this.runners]) {
        if (!r || r.out) continue;
        if (r.scored) { runs++; continue; }
        const b = r.dist > 13.7 && !r.returning ? (r.from + 1) % 4 : r.from;
        if (b > 0) nb[b - 1] = true; else if (!r.isBatter && r.from === 3 && b === 0) runs++;
      }
      L.bases = nb;
      if (this.kind === 'game') { if (g.half === 'top') L.score.them += runs; else L.score.us += runs; }
    }
    return L;
  }
  updateHUD() {
    const c = this.ctx;
    if (!this.active) return;
    const s = this.stats;
    if (c.ui && !this.dg) {
      if (this.tut) { c.ui.board(null); c.hud(null); return; }   // 練習の間は点数板を出さない(練習の札を上に出す)
      // プレーの途中も、アウト・走者が変わったらその場で(左上の点数板)
      const L = this.liveState();
      if (this.kind === 'knock') { const k = this.knock; L.knock = this.tut ? '練習' : `${Math.min(k.n + (this.play ? 1 : 0), k.N)} / ${k.N}本`; L.sub = this.play && this.play.star ? '★'.repeat(this.play.star) + '☆'.repeat(3 - this.play.star) : ''; }
      c.ui.board(L);
      c.hud(null);
      return;
    }
    if (this.kind === 'knock') {
      const k = this.knock;
      const g = this.g, b = g ? g.bases : [false, false, false], on = (i) => (b[i - 1] ? '#ffd54a' : 'rgba(255,255,255,.25)');
      const dia = `<svg viewBox="0 0 40 40" style="width:30px;height:30px;vertical-align:middle"><rect x="26" y="15" width="10" height="10" transform="rotate(45 31 20)" fill="${on(1)}"/><rect x="15" y="4" width="10" height="10" transform="rotate(45 20 9)" fill="${on(2)}"/><rect x="4" y="15" width="10" height="10" transform="rotate(45 9 20)" fill="${on(3)}"/></svg>`;
      const outs = [0, 1].map((i) => `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-left:3px;background:${g && i < g.outs ? '#ff5a36' : 'rgba(255,255,255,.25)'}"></i>`).join('');
      const st = this.play && this.play.star ? '★'.repeat(this.play.star) + '☆'.repeat(3 - this.play.star) : '';
      c.hud(`<div class="m">ノック ${POS[this.my].label} ${Math.min(k.n + (this.play ? 1 : 0), k.N)} / ${k.N} <span style="color:#ffd54a">${st}</span></div><div class="d">${dia} <span style="vertical-align:middle">O${outs}</span> ・ 捕球 ${s.caught} ・ 連続 ${s.streak}</div>`);
    } else if (c.ui && !this.dg) c.ui.board(this.g);
  }
}
