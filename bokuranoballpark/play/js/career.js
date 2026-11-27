// 11/25 守備のキャリア: 高校 → 社会人 → プロ。1 試合ごとに守備の評価(S〜D)と個人の UZR を出し、基準を超えたら次の段へ。
// 能力は 肩・守備・エラー回避 の 3 つ。試合の中のプレーで経験値が入って上がり、プレーに少しだけ効く(効き方の数は下の EFFECT)。
// 守備の試合(defense.js)はそのまま使い、外から包む(begin・startPlay・onCatch・tagBase・tagRunner・evalPlay・makeBall・varietyBall・reachClass)。
// defense.js に足したのは送球の 1 行(throwMod)だけ。画面は js/career_ui.js、見た目は career.css。
// 進み具合は localStorage の r4walk.career.v1。
import { CareerUI } from './career_ui.js?v=1127b';
import * as Rank from './ranking.js?v=1127b';

const KEY = 'r4walk.career.v1';
const OFS = ['LF', 'CF', 'RF'];
export const POS_NAME = { P: '投手', C: '捕手', '1B': '一塁手', '2B': '二塁手', '3B': '三塁手', SS: '遊撃手', LF: '左翼手', CF: '中堅手', RF: '右翼手' };
export const AB_NAME = { arm: '肩', field: '守備', sure: 'エラー回避' };
const AB_MIN = 30, AB_MAX = 99;
// 段: evK 打球(ゴロ・ライナー)の速さの倍率、hard 難しい種類の打球を選ぶ割合、need 昇格の基準(評価がこれ以上 か UZR がこれ以上)
// 11/25 夜 持ち主「全部いい感じに」: 1 試合で上がっていたのを、その段で min 試合以上・直近 3 試合のうち 2 試合で基準を超えたら上がる形に(各段 5〜10 試合ほど)
// 11/26 持ち主「UZR は現実の基準に忠実に」: UZR の作りを本物(Lichtman の UZR。FanGraphs)に合わせたので、基準も決め直した(tools/uzr_1126.py で昇格の早さを比べて決めた)
const UZR_NEED = [0.5, 0.4];
export const STAGES = [
  { key: 'hs', name: '高校', long: '高校野球', evK: 1.00, hard: 0.00, need: { rank: 'B', uzr: UZR_NEED[0] }, min: 5 },
  // 11/27 持ち主「課金したら良い感じに能力上がりやすい」「最速でプロ」: 社会人は 能力の平均が abAvg 以上なら、評価の基準が rankAb に下がる(能力を伸ばすほど早く上がれる)
  { key: 'corp', name: '社会人', long: '社会人野球', evK: 1.04, hard: 0.12, need: { rank: 'A', uzr: UZR_NEED[1], abAvg: 60, rankAb: 'B' }, min: 6 },
  { key: 'pro', name: 'プロ', long: 'プロ野球', evK: 1.08, hard: 0.22, need: null },
];
export const FINAL_GAMES = 5;   // プロで 5 試合守ったら「キャリア完了」(11/26 持ち主「5試合くらいでいいよ」。前は最終評価の後も続けられた)
// 11/26 守る位置の補正(持ち主「特定のポジションが有利になりすぎないように」)。ランキングに出す「UZR(位置の補正あり)」= (UZR − BASE × 機会) × ADJ
//   tools/posbal_1126.py で 9 つの位置を各 20 キャリア(プロ 5 試合)ずつ自動の選手で回して決めた(まとめ tools/posbal_sum_1126.py → posbal_1126_summary.json)。
//   BASE: その位置の機会 1 つあたりの UZR の平均(位置で打球の難しさの見積もりがちがい、外野は平均が大きくマイナスに出る。それを 0 にそろえる)
//   ADJ : 全位置の平均の振れ幅 ÷ その位置の振れ幅。初めは「全位置の平均の機会 ÷ その位置の機会」(機会あたりの UZR × 全位置の平均の機会数)で均したが、
//         右翼・二塁・左翼で振れ幅が大きく、上位 1 割の値が 1.3〜3.7 と離れたので、振れ幅でそろえた(上位 1 割 1.4〜2.7)。機会の数の差もこの中に入る
//   表は docs/アプリ化の引き継ぎ.md の 11/26 ランキングの節
export const POS_BASE = { P: 0.0197, C: 0.109, '1B': 0.0037, '2B': -0.0122, '3B': 0.0005, SS: -0.0054, LF: -0.0391, CF: -0.057, RF: 0.0552 };
export const POS_ADJ = { P: 2.358, C: 0.938, '1B': 1.334, '2B': 1.017, '3B': 1.153, SS: 1.423, LF: 0.769, CF: 0.927, RF: 0.547 };
export const POS_CH = { P: 10.4, C: 15.2, '1B': 14.7, '2B': 12.6, '3B': 15.3, SS: 12.7, LF: 17.2, CF: 13.8, RF: 16.2 };   // 1 試合の平均の機会(機会の数が無い前の記録に使う)
export const adjUZR = (pos, u, ch) => (u - (POS_BASE[pos] || 0) * (ch ?? POS_CH[pos] ?? 14)) * (POS_ADJ[pos] || 1);
const HOF_KEY = 'r4walk.career.hof.v1';
// 11/27 成長(アプリの課金。持ち主「課金したら良い感じに能力上がりやすいみたいなの付けて」。売り物は bokura_app_2026-11-18/store/iap_boost_1127.md)
//   成長ブースト(買い切り): キャリアの経験値がずっと 1.5 倍。持っているかはアプリの shop.js(window.__bpStore.boostOn)
//   特訓チケット(消耗): 1 枚で次の 1 試合の経験値 2 倍(ブーストと重ねて 3 倍)。試合を始めた時に 1 枚使う
//   能力アップの特訓(消耗): 選んだ能力がすぐ +3(70 から +2)。99 まで
//   枚数は r4walk.boost.v1(選手を新しくしても消えない)。shop.js が買った分を足す。ブラウザ版には売り場が無いので、倍率は 1 のまま
export const BOOST = { mult: 1.5, train: 2, abUp: (v) => (v < 70 ? 3 : 2) };
const BKEY = 'r4walk.boost.v1';
export function boostState() {
  const d = { train: 0, abup: 0, useTrain: true, nudge: -99 };
  try { const j = JSON.parse(localStorage.getItem(BKEY) || 'null'); return j && typeof j === 'object' ? { ...d, ...j } : d; } catch (e) { return d; }
}
export function boostSave(s) { try { localStorage.setItem(BKEY, JSON.stringify(s)); } catch (e) { /* 残せなくても遊べる */ } try { window.dispatchEvent(new CustomEvent('bp:boost')); } catch (e) { /* */ } }
export const storeOn = () => { try { return !!(window.__bpStore && window.__bpStore.grow); } catch (e) { return false; } };
export const boostOwned = () => { try { return !!(window.__bpStore && window.__bpStore.boostOn && window.__bpStore.boostOn()); } catch (e) { return false; } };
export const abAvg = (ab) => Math.round((ab.arm + ab.field + ab.sure) / 3);
// 経験値を足した時に、何ずつ上がるか(試合の始めの能力と経験値から。足す順番によらず同じ)
export function upsFrom(ab0, xp0, add) {
  const out = { arm: 0, field: 0, sure: 0 };
  for (const k of ['arm', 'field', 'sure']) { let v = ab0[k], x = (xp0[k] || 0) + (add[k] || 0); while (v < AB_MAX && x >= xpNeed(v)) { x -= xpNeed(v); v++; out[k]++; } }
  return out;
}   // 終えたキャリアの選手カード(殿堂)
const RANK_N = { S: 5, A: 4, B: 3, C: 2, D: 1 };

// 能力の効き方(t は 0 = 最初の 30、1 = 最高の 99)
const tOf = (v) => Math.max(0, Math.min(1, (v - AB_MIN) / (AB_MAX - AB_MIN)));
const lerp = (a, b, t) => a + (b - a) * t;
export const EFFECT = {
  reach: (v) => lerp(0.96, 1.12, tOf(v)),      // 守備: グローブの届く幅(標準 1.4 m → 1.34〜1.57 m)
  speed: (v) => lerp(0.97, 1.07, tOf(v)),      // 守備: 全力の速さ(標準 8.3 m/s → 8.05〜8.88 m/s)
  dive: (v) => lerp(1.0, 1.1, tOf(v)),         // 守備: 飛び込みで体が進む距離とグラブの先(標準で走るより約 1 m 先 → 最高で約 +0.35 m 伸びる)
  arm: (v) => lerp(0.95, 1.12, tOf(v)),        // 肩: 送球の初速(届く距離も伸びる)
  bobHard: (v) => lerp(0.045, 0.008, tOf(v)),  // エラー回避: 難しい捕球でお手玉する確率
  bobEasy: (v) => lerp(0.015, 0.002, tOf(v)),  // エラー回避: 普通の捕球でお手玉する確率
  sigma: (v) => lerp(0.55, 0.18, tOf(v)),      // エラー回避: 送球の横のそれ(m、標準偏差)
  wild: (v) => lerp(0.018, 0.003, tOf(v)),     // エラー回避: 大きくそれる(受け手が捕れない)送球の確率
};
// 次の 1 を上げるのに要る経験値(11/25 夜 そろえ直し: 1 試合の経験値は 3 つとも 10〜25 ほど。30 のころは 1 試合で 3〜5、
// 60 で 2 前後、80 を超えると 1 前後。30 → 99 は全部で約 1,050 で、プロに入ってから数十試合で届く)
export const xpNeed = (v) => 5 + Math.floor((v - AB_MIN) * 0.3);
export const XP_CAP = 16;      // 1 試合のプレーで入る経験値の上限(能力ごと。補殺の多い内野で肩だけ伸びないように)
export const RANK_LIST = ['S', 'A', 'B', 'C', 'D'];
// 昇格の進み具合: 直近 3 試合で基準を超えた数と、最短であと何試合か
export function promoInfo(D) {
  const st = STAGES[D.stage]; if (!st.need) return null;
  const played = D.stageGames[D.stage] || 0, P = ((D.pass || [])[D.stage] || []).slice(-3);
  const ok3 = P.filter(Boolean).length;
  let k = 0;
  for (; k < 20; k++) { const L = P.concat(Array(k).fill(true)).slice(-3); if (played + k >= st.min && L.filter(Boolean).length >= 2 && k > 0) break; }
  return { played, min: st.min, ok3, last3: P, left: k };
}

const sig = (x) => 1 / (1 + Math.exp(-x));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function fresh() {
  return { v: 1, stage: 0, pos: 'SS', ab: { arm: AB_MIN, field: AB_MIN, sure: AB_MIN }, xp: { arm: 0, field: 0, sure: 0 },
    stageGames: [0, 0, 0], tot: { games: 0, po: 0, a: 0, e: 0, uzr: 0, wins: 0 }, hist: [], final: null, made: Date.now(),
    name: '', num: 6, pass: [[], [], []], best: null, byPos: {},
    stageTot: [zt(), zt(), zt()], done: null, toPro: null };
}
// 11/26 段ごとの成績(1 シーズン = その段で守った試合。adj は位置の補正ありの UZR、ch は打球の機会)
function zt() { return { games: 0, po: 0, a: 0, e: 0, uzr: 0, adj: 0, ch: 0, pos: {} }; }
// 段の中で一番多く守った位置(ランキングに出す守備位置)
export const mainPos = (S, fb) => { let b = fb, n = -1; for (const [p, k] of Object.entries((S && S.pos) || {})) if (k > n) { n = k; b = p; } return b; };

// ------------------------------------------------------------ 「普通の野手なら何%でアウトにできたか」(UZR の基準)
// 平均の野手: 打った 0.30 秒後に動き出し、8.0 m/s で走り、グローブの届く幅 1.3 m。
// 11/25 投手・捕手は、その位置の普通の選手と比べる: 投手は投げ終わりの体勢から 0.40 秒・7.0 m/s、捕手は構えから立ってマスクを外して 0.50 秒・6.6 m/s(VMAX と同じ)。打球の道筋の各時刻で
// 「その時刻に球の所へ届くのに足りない距離」の最小(need)を出し、ロジスティックで確率に直す(need 0 で 5 割、-3 m で 96%、+2 m で 9%)。
// 飛び込み・跳べば届く物はその分だけ低い確率で足す。内野のゴロ・バントは、捕った所から一塁(走者一塁で 2 アウト未満なら二塁も)へ
// 間に合うかを掛ける(打者は打って約 4.45 秒で一塁、一塁走者は約 3.6 秒で二塁)。
export function outProb(d, pl) {
  const path = pl.batted && pl.batted.path; if (!path) return 0.5;
  const at = d.homeOf(d.my), of = OFS.includes(d.my);
  const V = d.my === 'P' ? 7.0 : d.my === 'C' ? 6.6 : 8.0, R = 1.3, REACT = d.my === 'P' ? 0.40 : d.my === 'C' ? 0.50 : 0.30;
  const e1 = path.events.find((e) => e.type === 'bounce' || e.type === 'roll' || e.type === 'wall'), b1 = e1 ? e1.t : 1e9;
  const rF = Math.hypot(at.x, at.z), gr = !!(e1 && e1.p && Math.hypot(e1.p.x, e1.p.z) < 50);
  let need = 1e9, needDive = 1e9, needJump = 1e9, first = null;
  for (let i = 0; i < path.n; i += 2) {
    const t = i * path.dt, x = path.pts[i * 4], y = path.pts[i * 4 + 1], z = path.pts[i * 4 + 2], r = Math.hypot(x, z);
    if ((!of || gr) && r > rF + 5 && t > b1) break;
    if (of && !gr && t > b1) break;
    const avail = Math.max(0, t - REACT) * V, dh = Math.hypot(x - at.x, z - at.z);
    if (y > -0.1 && y < 2.4) { const n = dh - R - avail; if (n < need) need = n; if (n <= 0 && !first) first = { t, x, z }; }
    if (y > -0.2 && y < 1.3) needDive = Math.min(needDive, dh - R - 1.1 - avail);
    if (y > 2.4 && y < 3.2) needJump = Math.min(needJump, dh - R - avail + 0.3);
  }
  let p = Math.max(sig(-need / 0.9), 0.35 * sig(-needDive / 0.6), 0.4 * sig(-needJump / 0.5));
  const ty = pl.batted.type;
  if (!of && (ty === 'grounder' || ty === 'bunt') && first) {
    const thr = (bx, bz, runT) => sig((runT - (first.t + 0.75 + Math.hypot(first.x - bx, first.z - bz) / 31)) / 0.3);
    let pt = thr(19.07, -19.4, 4.45);
    const g = d.g; if (g && g.bases && g.bases[0] && g.outs < 2) {
      const p2 = thr(0, -38.8, 3.6); pt = Math.max(pt, p2);
      // 11/26 UZR の併殺(DPR): 普通の野手がこのゴロで併殺にする割合 = 二塁で先の走者を刺す × 二塁からの転送が打者より先に一塁へ(受けて投げるまで 0.6 秒・27.4 m を 31 m/s)
      const t2 = first.t + 0.75 + Math.hypot(first.x, first.z + 38.8) / 31;
      pl._carDpR = clamp(p2 * sig((4.45 - (t2 + 0.6 + 27.4 / 31)) / 0.3), 0, 0.98);
    }
    p *= pt;
  }
  return clamp(p, 0.02, 0.98);
}

// ------------------------------------------------------------ 最終評価(通算から)
export function finalEval(D) {
  const T = D.tot, g = Math.max(1, T.games);
  const ch = T.po + T.a + T.e, fpct = ch ? (T.po + T.a) / ch : 1;
  const rk = D.hist.slice(-10).map((h) => RANK_N[h.rank] || 0).filter(Boolean);
  const rAvg = rk.length ? rk.reduce((a, b) => a + b, 0) / rk.length : 3;
  const uzrPG = T.uzr / g;
  const score = Math.round(clamp(55 + 14 * uzrPG + clamp((fpct - 0.97) * 150, -20, 8) + (rAvg - 3) * 8, 0, 100));   // 平均(UZR 0・守備率 .970・評価 B)で 55
  const grade = score >= 88 ? 'S' : score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 45 ? 'C' : 'D';
  const title = { S: 'ゴールデン・グラブ級の名手', A: '守備で勝たせる名手', B: '堅実なレギュラー', C: '守備は平均並み', D: '守備に課題が残る' }[grade];
  return { score, grade, title, uzrPG, fpct, uzr: T.uzr, games: T.games };
}
export const fpctText = (po, a, e) => { const c = po + a + e; return c ? ((po + a) / c).toFixed(3).replace(/^0/, '') : '-'; };
export const uzrText = (x) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1);

// 11/26 着せ替え(js/cosmetics.js): 殿堂のカードに、その時の枠・グラブ・ユニフォーム・称号を残す(見た目だけ)
const cosOf = () => { try { const e = window.__bpCos.eq(); return { fr: e.frame, gc: e.gcolor, gp: e.gpat, uni: e.uni, ttl: e.title }; } catch (e) { return {}; } };
// 殿堂に残せる数(シーズンパスの間は増える)。パスが切れても、もう残した選手は消さない
const hofCapNow = (n) => { let c = 50; try { c = window.__bpCos.hofCap(); } catch (e) { /* なし */ } return Math.max(c, n || 0); };
// 11/27 プロに上がるまでの試合数(高校 + 社会人)。ランキングの「早さ」
const toProOf = (D) => D.toPro || ((D.stageGames[0] || 0) + (D.stageGames[1] || 0));
// 11/26 終えたキャリアの選手カード(殿堂に残す形)
function makeCard(D, f) {
  const S = D.stageTot[2], r2 = (x) => Math.round(x * 100) / 100;
  let id = ''; try { id = Rank.deviceId().slice(0, 6) + '-'; } catch (e) { /* */ }
  return { id: id + Date.now().toString(36), name: D.name, num: D.num, pos: mainPos(S, D.pos), posAll: { ...S.pos }, grade: f.grade, title: f.title, score: f.score,
    pro: { games: S.games, po: S.po, a: S.a, e: S.e, uzr: r2(S.uzr), adj: r2(S.adj), ch: S.ch },
    tot: { ...D.tot }, ab: { ...D.ab }, best: D.best, seasons: D.stageTot.map((x) => ({ games: x.games, uzr: r2(x.uzr), adj: r2(x.adj) })), t: Date.now(), ...cosOf(),
    toPro: toProOf(D), pts: Rank.rankPts(toProOf(D), r2(S.adj)) };
}

// ------------------------------------------------------------ 本体
class Career {
  constructor() {
    this.data = this.load();
    this.active = false;   // キャリアの画面から試合を始めた(タイトルへ戻るまで)
    this.game = null;      // いまの試合の記録(キャリアの試合の間だけ)
    this.cnt = 0;          // tagBase・tagRunner で数えたアウト(onCatch の中のアウトと重ねて数えないため)
    this.K = { POS_NAME, AB_NAME, STAGES, FINAL_GAMES, EFFECT, xpNeed, finalEval, fpctText, uzrText, AB_MAX, promoInfo, POS_ADJ, POS_BASE, adjUZR, mainPos, Rank,
      BOOST, boostState, boostSave, storeOn, boostOwned, abAvg, upsFrom };
    this.ui = new CareerUI(this);
    this.wait();
    // 11/27 ランキングの点が「早さ+守備」に変わった: 前の形(UZR だけ)の自分の記録は ranking.js が消すので、殿堂のカードから作り直す(端末の中だけ。送らない)
    try {
      for (const c of this.hof()) {
        if (c.migrated || !c.seasons || !c.pro || c.pro.games < FINAL_GAMES) continue;
        const tp = c.toPro || ((c.seasons[0].games || 0) + (c.seasons[1].games || 0)), pt = Rank.rankPts(tp, c.pro.adj);
        const e = { name: c.name, num: c.num, pos: c.pos, val: pt.total, uzr: c.pro.adj, toPro: tp, games: c.pro.games, t: c.t };
        Rank.keepLocal('pro5', e); Rank.keepLocal('pos_' + c.pos, e);
      }
    } catch (e) { /* 無くても遊べる */ }
  }
  load() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (j && j.v === 1) {
        const D = Object.assign(fresh(), j);
        if (!Array.isArray(D.pass) || D.pass.length !== 3) D.pass = [[], [], []];
        // 11/26 位置ごとの成績(試合・刺殺・補殺・失策・UZR)。前から遊んでいる人の記録は、今の位置の分として引き継ぐ
        if (!j.byPos || typeof j.byPos !== 'object') { D.byPos = {}; const T = D.tot; if (T && T.games) D.byPos[D.pos] = { games: T.games, po: T.po, a: T.a, e: T.e, uzr: T.uzr }; }
        if (!D.best && D.hist.length) D.best = D.hist.reduce((b, h) => ((RANK_N[h.rank] || 0) > (RANK_N[b] || 0) ? h.rank : b), null);
        // 11/26 段ごとの成績が無い前の記録は、残っている試合の記録(最近 60 試合)から作る
        if (!Array.isArray(j.stageTot) || j.stageTot.length !== 3) {
          D.stageTot = [zt(), zt(), zt()];
          for (const h of D.hist) { const S = D.stageTot[h.stage]; if (!S || (h.stage === 2 && S.games >= FINAL_GAMES)) continue; S.games++; S.po += h.po; S.a += h.a; S.e += h.e; S.uzr += h.uzr; S.adj += adjUZR(h.pos, h.uzr, h.ch); S.pos[h.pos] = (S.pos[h.pos] || 0) + 1; }
        }
        if (D.stage === 2 && !D.toPro) D.toPro = (D.stageGames[0] || 0) + (D.stageGames[1] || 0);
        // 前の作りでプロ 5 試合を超えて続けていた人は、5 試合で終えた形にする(続きの試合は通算にだけ入っている)
        //   (殿堂には入れる。ランキングへは送らない: UZR の数え方が 11/26 に変わる前の試合のため)
        if (D.stage === 2 && D.stageGames[2] >= FINAL_GAMES && !D.done) {
          const f = D.final || finalEval(D); D.final = f; D.done = makeCard(D, f); D.done.migrated = true;
          try { const H = JSON.parse(localStorage.getItem(HOF_KEY) || '[]'); if (Array.isArray(H)) { H.push(D.done); localStorage.setItem(HOF_KEY, JSON.stringify(H.slice(-50))); } } catch (e) { /* */ }
          try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { /* */ }
        }
        return D;
      }
    } catch (e) { /* 壊れていたら新しく */ }
    return fresh();
  }
  setName(n) { this.data.name = String(n || '').replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 10); this.save(); }
  // 11/26 守る位置を替える(能力・通算成績・段はそのまま。位置ごとの成績は分けて覚える)
  setPos(p) { if (POS_NAME[p]) { this.data.pos = p; this.save(); } }
  posStats(p) { return (this.data.byPos && this.data.byPos[p]) || { games: 0, po: 0, a: 0, e: 0, uzr: 0 }; }
  setNum(n) { n = Math.round(+n); if (Number.isFinite(n) && n >= 0 && n <= 99) { this.data.num = n; this.save(); } }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* 残せなくても遊べる */ } }
  reset() { this.data = fresh(); this.save(); }
  // 11/26 キャリアを終えた後、新しい選手で始め直す(殿堂の記録は残す)
  newCareer() { this.data = fresh(); this.save(); }
  hof() { try { const a = JSON.parse(localStorage.getItem(HOF_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  saveHof(a, cap) { try { localStorage.setItem(HOF_KEY, JSON.stringify(a.slice(-(cap || 50)))); } catch (e) { /* 残せなくても遊べる */ } }
  get stage() { return STAGES[this.data.stage]; }

  wait() {
    const A = window.__app;
    if (A && A.ui && !this.ui.built) this.ui.build(A.ui);
    if (A && A.defense && A.ui && !this.hooked) this.hook(A.defense, A.ui);
    if (!this.hooked) setTimeout(() => this.wait(), 200);
  }
  appUI() { return window.__app && window.__app.ui; }

  // ------------------------------------------------ キャリアの試合を始める・やめる
  start() {
    const ui = this.appUI(); if (!ui || !window.__app.ready) return false;
    if (this.data.done) return false;   // キャリアを終えた選手は試合に出ない(新しい選手で始め直す)
    this.active = true;
    if (!this._saved) this._saved = { mode: ui.sel.mode, pos: ui.sel.pos };
    ui.sel.mode = 'game'; ui.sel.pos = this.data.pos;   // 一時停止の「最初から」(ui.go)でもキャリアの試合になるように
    this.ui.hide();
    ui.hideAll();
    ui.app.startMode({ ...ui.sel, mode: 'game', pos: this.data.pos, stadium: ui.app.stadium });
    return true;
  }
  leave() {
    this.active = false; this.game = null;
    const ui = this.appUI();
    if (ui && this._saved) { ui.sel.mode = this._saved.mode; ui.sel.pos = this._saved.pos; this._saved = null; }
  }

  // ------------------------------------------------ 守備の試合を包む
  hook(d, ui) {
    this.hooked = true;
    const C = this, P = Object.getPrototypeOf(d);
    const ob = d.begin;
    d.begin = function (sel) {
      const car = C.active && sel && sel.mode === 'game' && !sel.keepDiff;
      if (car) sel = { ...sel, pos: C.data.pos };
      C.game = null; this.throwMod = null; this.diveK = 1;
      const r = ob.call(this, sel);
      if (car && this.kind === 'game' && !this.tut) C.onBegin(this);
      return r;
    };
    const sp = d.startPlay;
    d.startPlay = function (...x) {
      const r = sp.apply(this, x);
      try { const pl = this.play; if (C.game && this.kind === 'game' && pl && pl.opt.fielder === this.my && pl.batted && !pl.steal) pl._car = { p: outProb(this, pl), of: OFS.includes(this.my) }; } catch (e) { console.warn(e); }
      return r;
    };
    const rc = d.reachClass;   // 打球の種類の見極めは標準の野手で(能力で打球が難しくならないように)
    d.reachClass = function (path) { if (!C.game || !C.baseD) return rc.call(this, path); const s = this.D; this.D = C.baseD; try { return rc.call(this, path); } finally { this.D = s; } };
    const mb = d.makeBall;   // 段ごとにゴロ・ライナーを少し速く
    d.makeBall = function (type, T, L, p0, o) {
      const k = C.game ? C.stage.evK : 1;
      if (k !== 1 && (type === 'grounder' || type === 'liner') && !(o && 'stop' in o) && !(o && o.coarseOnly)) {
        if (o && o.ev) o = { ...o, ev: o.ev * k };
        else if (type === 'grounder') o = { ...(o || {}), ev: (21 + 17 * L + this.rng() * 4) * k };
        else o = { ...(o || {}), ev: (27 + 13 * L + this.rng() * 3) * k };
      }
      return mb.call(this, type, T, L, p0, o);
    };
    const vb = d.varietyBall;   // 段が上がると難しい種類の打球が増える
    d.varietyBall = function (cat, want) {
      if (C.game && !want && C.stage.hard > 0 && this.rng() < C.stage.hard) { const H = ['run', 'hard', 'back', 'hop', 'dive']; want = H[Math.floor(this.rng() * H.length)]; }
      return vb.call(this, cat, want);
    };
    const oc = d.onCatch;
    d.onCatch = function (pl, who, p, tt) {
      if (!C.game) return oc.call(this, pl, who, p, tt);
      const o0 = pl.outs || 0, c0 = C.cnt, first = !pl.thrown, wild = pl._carWild;
      // 11/25 テスター「捕り損ねたのにアウト」: フライ・ライナーを宙で捕ってお手玉したら落球(アウトにしない。球は落ちて走者は進む)。前は札だけ「お手玉!」でアウトのままだった
      try {
        const onFly = first && who === 'me' && !pl.dropped && pl.fly && this.ball && !this.ball.path.events.some((e) => (e.type === 'bounce' || e.type === 'roll' || e.type === 'wall') && e.t <= tt);
        if (onFly && C.bobRoll(this, pl)) { pl._carBob = true; this.dropBall(pl, p, 'お手玉で落球'); return; }
      } catch (e) { console.warn(e); }
      const r = oc.call(this, pl, who, p, tt);
      try {
        const extra = (pl.outs || 0) - o0 - (C.cnt - c0);
        if (who === 'me' && extra > 0) C.game.po += extra;
        if (wild && !wild.done && pl.thrown && pl.thrown.from === 'me') { wild.done = true; wild.caught = who === wild.rk; }
        if (first && who === 'me' && pl.choiceOpen && pl.endT == null) C.bobble(this, pl);
      } catch (e) { console.warn(e); }
      return r;
    };
    const tb = d.tagBase;
    d.tagBase = function (pl, bi, who, quiet) { const o0 = pl.outs || 0; const r = tb.call(this, pl, bi, who, quiet); C.outsBy(pl, who, (pl.outs || 0) - o0); return r; };
    const tr = d.tagRunner;
    d.tagRunner = function (pl, rr, who) { const o0 = pl.outs || 0; const r = tr.call(this, pl, rr, who); C.outsBy(pl, who, (pl.outs || 0) - o0); return r; };
    const ep = d.evalPlay;
    d.evalPlay = function (pl) { const r = ep.call(this, pl); try { if (C.game && this.kind === 'game' && !pl._carDone) { pl._carDone = true; C.afterPlay(this, pl); } } catch (e) { console.warn(e); } return r; };
    // 結果の画面: キャリアの試合なら、キャリアの結果の画面を出す
    const ores = ui.result.bind(ui);
    ui.result = function (r) { try { if (C.onResult(r)) return; } catch (e) { console.warn('career result', e); } return ores(r); };
    // タイトルへ戻ったら、キャリアの試合の印を消す
    const ot = ui.app.toTitle;
    ui.app.toTitle = function (...x) { C.leave(); C.ui.hide(); return ot.apply(this, x); };
    // キャリアの画面が開いている間は「開いている」扱い(Esc で一時停止を重ねない)
    const oi = ui.isOpen.bind(ui);
    ui.isOpen = function () { return oi() || C.ui.isOpen(); };
    void P;
  }
  outsBy(pl, who, n) {
    if (!this.game || n <= 0) return;
    this.cnt += n;
    if (who === 'me') this.game.po += n;
    else if (pl.thrown && pl.thrown.from === 'me' && !pl._carA) { pl._carA = true; this.game.a += 1; }
  }
  onBegin(d) {
    const ab = this.data.ab;
    this.baseD = d.D;
    d.D = { ...d.D, reach: d.D.reach * EFFECT.reach(ab.field), speed: d.D.speed * EFFECT.speed(ab.field) };
    d.diveK = EFFECT.dive(ab.field);
    const C = this;
    d.throwMod = function (to, from, speed, rk, pl) {
      if (!C.game) return null;
      const s = C.data.ab.sure, rng = this.rng;
      const dx = to.x - from.x, dz = to.z - from.z, L = Math.hypot(dx, dz) || 1;
      const g = (rng() + rng() + rng() - 1.5) * 2;   // ほぼ正規分布
      let off = g * EFFECT.sigma(s);
      if (rng() < EFFECT.wild(s)) { off = (rng() < 0.5 ? -1 : 1) * (2.0 + rng() * 0.8); pl._carWild = { rk }; }
      const t2 = to.clone(); t2.x += (-dz / L) * off; t2.z += (dx / L) * off;
      return { to: t2, speed: speed * EFFECT.arm(C.data.ab.arm) };
    };
    // 11/27 成長: ブースト 1.5 倍・特訓チケット 2 倍(試合を始めた時に 1 枚使う。途中でやめても戻らない)
    const owned = boostOwned(), bs = boostState();
    let train = false;
    if (bs.useTrain && bs.train > 0) { bs.train--; train = true; boostSave(bs); }
    const mult = (owned ? BOOST.mult : 1) * (train ? BOOST.train : 1);
    this.game = { po: 0, a: 0, e: 0, uzr: 0, uzrOld: 0, parts: { rng: 0, dpr: 0, arm: 0, err: 0 }, chances: 0, xp: { arm: 0, field: 0, sure: 0 }, xpPlay: { arm: 0, field: 0, sure: 0 }, ups: { arm: 0, field: 0, sure: 0 }, ab0: { ...ab }, plays: 0, stage: this.data.stage, pos: d.my,
      mult, owned, train, xp0: { ...this.data.xp }, base: { arm: 0, field: 0, sure: 0 } };
    const st = this.stage, n = this.data.stageGames[this.data.stage] + 1;
    // 11/26 プロの 4 試合目は「優勝のかかった試合」、5 試合目は「最終戦」
    const tag = this.data.stage === 2 ? (n === FINAL_GAMES - 1 ? '優勝のかかった試合' : n >= FINAL_GAMES ? '最終戦' : '') : '';
    const xb = mult > 1 ? ` ・ 経験値 ×${mult}` : '';
    this.ui.intro(`${st.long} 第${n}戦`, (tag ? `${tag} ・ ${POS_NAME[d.my]}` : POS_NAME[d.my]) + xb, tag ? 3400 : 2200);
  }
  // お手玉: 捕った後、投げられるまで 0.6 秒遅れる(アウトにできなければ失策)
  bobRoll(d, pl) {
    const s = this.data.ab.sure, hard = (pl._car && pl._car.p < 0.75) || (pl.myReach || 0) > 0.75 || (pl.star || 0) >= 2;
    return d.rng() < (hard ? EFFECT.bobHard(s) : EFFECT.bobEasy(s));
  }
  bobble(d, pl) {
    if (pl.dropped || !this.bobRoll(d, pl)) return;   // 落とした球を拾い直した時はお手玉にしない
    pl._carBob = true; pl.choiceOpen = false; pl.choiceAt = pl.t + 0.6;
    this.ui.pop('お手玉!', 'bad');
    d.updatePad && d.updatePad();
  }
  afterPlay(d, pl) {
    const G = this.game; if (!G) return;
    if (pl.label === 'ホームラン') return;
    const mine = !!pl._car, caught = pl.fieldedBy === 'me' && !pl.missed;
    if (pl.label === 'ファウル' && !caught) return;
    const lt = pl.lastThrow, outs = pl.outs || 0, of = OFS.includes(d.my);
    // 失策: 捕れる打球を落とした・悪送球・大きくそれた送球を受け手が捕れなかった・お手玉でアウトにできなかった
    let err = 0;
    if (pl.evalKind === 'miss' && mine && !caught && pl.label !== '悪送球' && (pl.myMin ?? 99) < d.D.reach * 0.9) err = 1;   // グラブの届く所まで来た球を捕れなかった(defense.js の「ミス(捕球)」と同じ)
    if (pl.label === '悪送球' && lt && !lt.self) err = 1;
    if (pl._carWild && pl._carWild.done && !pl._carWild.caught) err = 1;
    if (pl._carBob && (outs === 0 || pl.dropped)) err = 1;
    if (pl.dropped && mine) err = 1;   // 11/25 落球は、拾い直してほかの走者をアウトにしても失策
    G.e += err;
    // 11/26 持ち主「UZR は現実の基準に忠実に」: Lichtman の UZR(FanGraphs の UZR 入門)の作りに合わせた。?olduzr=1 で前の形
    //  範囲(RngR): その打球を普通の野手がアウトにする割合 p と比べる。アウトにすれば +(1-p)、できなければ -p に、安打とアウトの差の点を掛ける
    //    (入門: 外野の安打 約 .56 点・アウト 約 -.27 点 → 差 .83 点。内野の安打はほぼ単打で差 約 .75 点)
    //  失策(ErrR): 失策した球は「普通はその野手が捕る球」として範囲には入れず、平均の失策の割合(内野 3%・外野 1.5%)と比べる
    //    (失策で -(1-e)×差 ≒ -0.73(内野)/-0.82(外野)。失策しなければ +e×差 ≒ +0.02)。自分の打球でない送球・中継の失策は 1 つ進塁ぶん -0.3
    //  併殺(DPR): 一塁に走者・2 アウト未満のゴロを捕った時、普通の野手の併殺の割合 r(outProb の _carDpR)と比べて ±、併殺とひとつのアウトの差 0.3 点
    //  肩(ARM): 外野の補殺 +0.45(走者を刺す。ARM は外野だけ。内野の中継・カバーの補殺は UZR に入らない)
    //  捕手の盗塁: UZR は捕手を数えないので、盗塁を刺した/許した点(rSB と同じ考え。盗塁 +0.2・盗塁死 -0.41、普通の阻止率 3 割)で ±
    //  飛び込みの足し点は外した(難しさは p に入っている)
    const RV = of ? 0.83 : 0.75, EAVG = of ? 0.015 : 0.03, part = { rng: 0, dpr: 0, arm: 0, err: 0 };
    let du0 = 0;   // 前の形(比べるため・?olduzr=1 の時に使う)
    if (mine) {
      const p = pl._car.p, rv = of ? 0.85 : 0.75, ok = caught && outs > 0;
      du0 += ok ? (1 - p) * rv : -p * rv;
      if (ok && outs >= 2) du0 += 0.25;
      if (caught && pl.special === 'dive') du0 += 0.2;
      if (err) part.err -= (1 - EAVG) * RV;
      else { part.rng += ok ? (1 - p) * RV : -p * RV; part.err += EAVG * RV; }
      if (pl._carDpR != null && caught && !err) part.dpr += (outs >= 2 ? 1 - pl._carDpR : -pl._carDpR) * 0.3;
      G.chances++;
    } else if (err) part.err -= 0.3;
    if (err) du0 -= 0.25;
    if (pl.stealC) { const cs = (pl.outs || 0) > 0; du0 += cs ? 0.35 : -0.15; part.arm += cs ? 0.43 : -0.18; G.chances++; }
    else if (pl._carA && of) { du0 += 0.4; part.arm += 0.45; } else if (pl._carA && !mine) du0 += 0.15;
    for (const k in part) G.parts[k] += part[k];
    G.uzrOld += du0;
    const OLDU = !!(d.ctx && d.ctx.params && d.ctx.params.has && d.ctx.params.has('olduzr'));
    const du = OLDU ? du0 : part.rng + part.dpr + part.arm + part.err;
    G.uzr += du; G.plays++;
    // 経験値
    // 11/25 夜 そろえ直し: 前は補殺 1 つで肩 +5(外野 +10)入り、肩だけ 1 試合で 30 → 40 になった。3 つとも同じくらい入る数にし、1 試合の上限 XP_CAP を付けた
    const X = { arm: 0, field: 0, sure: 0 };
    if (lt && !lt.self) { X.arm += 2; if (lt.transfer && lt.transfer < (of ? 1.1 : 0.8)) X.arm += 1; }
    if (pl._carA) X.arm += of ? 5 : 2;
    if (pl.evalKind === 'nice' && lt && !lt.self) X.arm += 2;
    if (caught) X.field += 2;
    if (caught && mine && pl._car.p < 0.7) X.field += 3;
    if (pl.evalKind === 'fine') X.field += 4;
    if (caught && pl.special === 'dive') X.field += 3;
    if (du > 0 && mine) X.field += Math.min(4, Math.round(du * 5));
    if (mine && !err) X.sure += 2;
    if (lt && !lt.self && !err) X.sure += 1;
    if (caught && mine && !err && pl._car.p < 0.7) X.sure += 2;   // 難しい球をきれいに捕った
    for (const k in X) X[k] = Math.max(0, Math.min(X[k], XP_CAP - G.xpPlay[k])), G.xpPlay[k] += X[k];
    this.addXP(X);
    if (Math.abs(du) >= 0.05) this.ui.pop(`UZR ${uzrText(du)}`, du >= 0 ? 'good' : 'bad');
    if (pl.evalKind === 'fine' && mine) { try { d.ctx.sound.crowdEvent('fine', 1); } catch (e) { /* 音なし */ } }
  }
  addXP(X, end, G0) {
    const D = this.data, G = G0 || this.game, m = (G && G.mult) || 1;
    for (const k of ['arm', 'field', 'sure']) {
      if (!X[k]) continue;
      if (G && G.base) G.base[k] += X[k];   // 倍率の前(「ブーストがあれば」の計算に使う)
      const x = Math.round(X[k] * m * 10) / 10;
      if (G) G.xp[k] += x;
      D.xp[k] += x;
      let up = 0;
      while (D.ab[k] < AB_MAX && D.xp[k] >= xpNeed(D.ab[k])) { D.xp[k] -= xpNeed(D.ab[k]); D.ab[k]++; up++; }
      if (D.ab[k] >= AB_MAX) D.xp[k] = 0;
      D.xp[k] = Math.round(D.xp[k] * 10) / 10;
      if (up) { if (G) G.ups[k] += up; if (!end) this.ui.pop(`${AB_NAME[k]} +${up}`, 'up'); this.applyAbilities(); }
    }
    this.save();
  }
  // 試合の途中で能力が上がった時も、すぐプレーに効かせる
  applyAbilities() {
    const d = window.__app && window.__app.defense; if (!d || !this.game || !this.baseD) return;
    const ab = this.data.ab;
    d.D = { ...this.baseD, reach: this.baseD.reach * EFFECT.reach(ab.field), speed: this.baseD.speed * EFFECT.speed(ab.field) };
    d.diveK = EFFECT.dive(ab.field);
  }
  // ------------------------------------------------ 試合の終わり
  onResult(r) {
    if (!this.game || !r || r.kind !== 'game') return false;
    const G = this.game; this.game = null;
    const d = window.__app.defense; if (d) d.throwMod = null;
    if (r.stopped) return false;
    const D = this.data, st = this.stage, ev = r.ev || {}, st0 = D.stage;
    const rank = ev.n ? ev.rank : 'C';
    const tc = G.po + G.a + G.e;
    // 試合の終わりの経験値: 出た分(3 つとも 2)+ 評価(S 6・A 4・B 3・C 1)+ 無失策(エラー回避 +3)
    { const rb = { S: 6, A: 4, B: 3, C: 1 }[rank] || 0, g = (tc > 0 || (ev.n || 0) > 0) ? 2 + rb : 1; this.addXP({ arm: g, field: g, sure: g + (G.e === 0 && tc >= 3 ? 3 : 0) }, true, G); }
    const need = st.need;
    const avg = abAvg(D.ab), needRank = need ? (need.abAvg && avg >= need.abAvg ? need.rankAb : need.rank) : null;
    const rankOK = need && (RANK_N[rank] || 0) >= RANK_N[needRank];
    const uzrOK = need && G.uzr >= need.uzr;
    const enough = tc >= 2 || (ev.n || 0) >= 3;
    const passed = !!(need && enough && (rankOK || uzrOK));
    if (!Array.isArray(D.pass)) D.pass = [[], [], []];
    if (need) { D.pass[D.stage].push(passed); if (D.pass[D.stage].length > 10) D.pass[D.stage].shift(); }
    const P3 = need ? D.pass[D.stage].slice(-3) : [];
    const promoted = !!(need && passed && D.stageGames[D.stage] + 1 >= st.min && P3.filter(Boolean).length >= 2);
    if (ev.n && (RANK_N[rank] || 0) > (RANK_N[D.best] || 0)) D.best = rank;
    const won = r.g && r.g.score && r.g.score.us > r.g.score.them;
    D.stageGames[D.stage]++;
    const T = D.tot; T.games++; T.po += G.po; T.a += G.a; T.e += G.e; T.uzr += G.uzr; if (won) T.wins++;
    if (!Array.isArray(D.stageTot) || D.stageTot.length !== 3) D.stageTot = [zt(), zt(), zt()];
    { const S = D.stageTot[st0]; S.games++; S.po += G.po; S.a += G.a; S.e += G.e; S.uzr += G.uzr; S.adj += adjUZR(G.pos, G.uzr, G.chances); S.ch += G.chances; S.pos[G.pos] = (S.pos[G.pos] || 0) + 1; }
    if (!D.byPos) D.byPos = {};
    { const B = D.byPos[G.pos] || (D.byPos[G.pos] = { games: 0, po: 0, a: 0, e: 0, uzr: 0 }); B.games++; B.po += G.po; B.a += G.a; B.e += G.e; B.uzr += G.uzr; }
    const res = { stage: D.stage, game: D.stageGames[D.stage], pos: G.pos, po: G.po, a: G.a, e: G.e, tc, uzr: G.uzr, chances: G.chances, rank, score: ev.n ? ev.score : null,
      ups: G.ups, ab: { ...D.ab }, xp: { ...G.xp }, promoted, passed, won, score2: r.g ? { us: r.g.score.us, them: r.g.score.them } : null, need, rankOK, uzrOK, enough, t: Date.now(), parts: { ...G.parts }, uzrOld: G.uzrOld,
      needRank, abAvg: avg, boost: this.boostRes(G) };
    D.hist.push({ stage: res.stage, pos: res.pos, po: res.po, a: res.a, e: res.e, uzr: Math.round(res.uzr * 100) / 100, rank, won, t: res.t, ch: G.chances });
    if (D.hist.length > 60) D.hist.shift();
    if (!promoted && need) res.prog = promoInfo(D);
    if (promoted) { this.sendSeason(st0); D.stage = Math.min(STAGES.length - 1, D.stage + 1); if (D.stage === 2) D.toPro = D.stageGames[0] + D.stageGames[1]; }
    if (st0 === 2) { res.proGame = D.stageGames[2]; res.proLeft = Math.max(0, FINAL_GAMES - D.stageGames[2]); }
    if (st0 === 2 && D.stageGames[2] >= FINAL_GAMES) { const f = finalEval(D); res.final = f; res.finalFirst = !D.final; D.final = f; res.done = this.complete(f); }
    this.save();
    this.ui.result(res);
    this.cheer(res);
    return true;
  }
  // 11/26 プロ 5 試合を終えた: 殿堂に選手カードを残し、ランキングへ送る(送れなくても端末に残る)
  complete(f) {
    const D = this.data, S = D.stageTot[2];
    const card = makeCard(D, f), pos = card.pos;
    D.done = card;
    const H = this.hof(), cap = hofCapNow(H.length); H.push(card); this.saveHof(H, cap);
    try { window.dispatchEvent(new CustomEvent('bp:careerdone', { detail: { first: H.length === 1 } })); } catch (e) { /* 無くても動く */ }
    // 11/27 持ち主「最速でプロ、プロでスコアを競う」: プロ 5 試合・守備位置の板は「早さ+守備」の点(ranking.js の rankPts)。1 シーズンの板は今まで通り UZR
    const e = { name: D.name, num: D.num, pos, val: card.pts.total, uzr: Math.round(S.adj * 100) / 100, toPro: card.toPro, games: S.games, t: card.t };
    const es = { name: D.name, num: D.num, pos, val: S.adj, games: S.games, t: card.t };
    this.lastSend = Promise.all([Rank.submit('pro5', e), Rank.submit('pos_' + pos, e), Rank.submit('season_pro', es)]).catch(() => null);
    return card;
  }
  // 高校・社会人を上がった時、その段(1 シーズン)の UZR をランキングへ
  sendSeason(si) {
    const D = this.data, S = D.stageTot && D.stageTot[si]; if (!S || !S.games) return;
    const board = ['season_hs', 'season_corp'][si]; if (!board) return;
    this.lastSend = Rank.submit(board, { name: D.name, num: D.num, pos: mainPos(S, D.pos), val: S.adj, games: S.games, t: Date.now() }).catch(() => null);
  }
  // 11/27 成長: 結果の画面に出す数(この試合の倍率・ブースト/特訓チケットがあれば何ずつ上がったか)
  boostRes(G) {
    if (!G || !G.base) return null;
    const b = G.base, m = G.mult || 1, w = (k) => { const o = {}; for (const a of ['arm', 'field', 'sure']) o[a] = Math.round(b[a] * k * 10) / 10; return upsFrom(G.ab0, G.xp0, o); };
    return { mult: m, owned: !!G.owned, train: !!G.train, base: { ...b },
      ifBoost: G.owned ? null : w(m * BOOST.mult), ifTrain: G.train ? null : w(m * BOOST.train) };
  }
  // 能力アップの特訓を 1 回使う(キャリアの画面から。試合の外だけ)
  useAbUp(k) {
    const D = this.data, bs = boostState();
    if (!AB_NAME[k] || bs.abup <= 0 || D.done || this.game || D.ab[k] >= AB_MAX) return 0;
    const add = Math.min(AB_MAX - D.ab[k], BOOST.abUp(D.ab[k]));
    D.ab[k] += add; if (D.ab[k] >= AB_MAX) D.xp[k] = 0;
    bs.abup--; boostSave(bs); this.save();
    return add;
  }
  setUseTrain(on) { const bs = boostState(); bs.useTrain = !!on; boostSave(bs); }
  cheer(res) {
    const s = window.__app && window.__app.sound; if (!s) return;
    try {
      if (res.promoted) { s.crowdEvent && s.crowdEvent('fine', 1); s.voice && s.voice(['crowd_roar'], { maxWait: 2 }); }
      else if (res.rank === 'S' || res.rank === 'A') s.voice && s.voice(['fine_play'], { maxWait: 2 });
    } catch (e) { /* 音なし */ }
  }
}

const career = new Career();
try { window.__career = career; } catch (e) { /* 試験で見る */ }
export default career;
