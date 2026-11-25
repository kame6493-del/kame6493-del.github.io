// 実況の文の選び方(commentary)。defense.js の say() から呼ばれ、場面の言葉に「打球の行方の続き」と「点差の状況」を足す。
// 本物の中継の型: 短い句で区切って打球を追い(三遊間 → 抜けた → レフト前)、点が入ったら点差の意味を言い切る(同点・勝ち越し・サヨナラ)。
// 名前は使わず守備位置で呼ぶ。言葉の音は manifest.json の voice(1 つのキーに何通りも。直前に使った物は避ける: audio.js)。
// v4(11/18): 投げる前のつなぎ(カウント・点差・回・守備隊形・応援)、打球の細かい行方(三遊間・線際・左中間・浅い・深い)、
//   打球を追う間のつなぎ(伸びる・フェンス際・追いつくか・抜けるか)、走者(三塁を回る・二塁を狙う・戻る)、
//   判定の言い分け(一塁アウト・間一髪・フォースアウト・内野安打・本塁)、アウトカウント・チェンジ・ピンチをしのいだ、試合の始まりと終わり。
//   毎こま defense.js の update から cmTick() が呼ばれ、間があいた時だけつなぎを入れる(大事な結果が先・言い終わる前に重ねない)。

// 声の長さ(秒): キーごとの一覧。間の見積もりと、打つ前に言い終わるかの見積もりに使う
let DUR = null;
try { fetch('audio/voice_v3/aida_dur.json').then((r) => r.json()).then((j) => { DUR = j; }).catch(() => { }); } catch (e) { /* 無くても動く */ }
// 11/21 言い回しごとの中身の印(aida_tags.json。manifest の voice と同じ並び)。打球の中身に合わない言い回しを選ばないために使う。
//   S 強い当たりの言葉 / W 弱い当たり / G ゴロ・転がる / A 飛球・ライナーの言葉 / L ライナー / F フライ・上がった / B バント / C 送りバント
//   P ピッチャー・マウンド / H 抜けた・ヒット(打った瞬間には言わない) / D 深い / R 正面
let TAGS = null;
try { fetch('audio/voice_v3/aida_tags.json').then((r) => r.json()).then((j) => { TAGS = j; }).catch(() => { }); } catch (e) { /* 無くても動く */ }
// キーは「pre_first」(どれか 1 つ)か「pre_first#2」(その言い回し。0 から数える)か「g_hard_SS#0,2,3」(この中のどれか)。投げる前は時間に収まる長さの言い回しを選ぶ
const split = (k) => { const i = k.indexOf('#'); return i < 0 ? [k, -1] : [k.slice(0, i), +k.slice(i + 1).split(',')[0]]; };
const idxOf = (k) => { const i = k.indexOf('#'); return i < 0 ? null : k.slice(i + 1).split(',').map(Number); };
const durs = (k) => { const [b] = split(k), ix = idxOf(k); const a = DUR && DUR[b]; if (!a || !a.length) return null; if (!ix) return a; const d = ix.map((i) => a[i]).filter((x) => x != null); return d.length ? d : null; };
const durMean = (k) => { const a = durs(k); return a ? a.reduce((s, x) => s + x, 0) / a.length : 1.2; };
const durMax = (k) => { const a = durs(k); return a ? Math.max(...a) : 1.6; };
const durMin = (k) => { const a = durs(k); return a ? Math.min(...a) : 1.2; };
const has = (k) => !!k && (!DUR || !!durs(k));
// 時間(秒)に収まる言い回しを 1 つ選ぶ。そのキーで直前に使った 4 つは避ける
const recentVar = {};
function variant(k, maxDur) {
  const a = DUR && DUR[k]; if (!a) return k;
  const R = recentVar[k] || (recentVar[k] = []);
  let ix = a.map((d, i) => i).filter((i) => a[i] <= maxDur);
  if (!ix.length) return null;
  const fresh = ix.filter((i) => !R.includes(i));
  if (fresh.length) ix = fresh;
  const i = ix[Math.floor(Math.random() * ix.length)];
  R.push(i); if (R.length > Math.min(4, a.length - 1)) R.shift();
  return `${k}#${i}`;
}
const rnd = Math.random;
const pickOne = (a) => a[Math.floor(rnd() * a.length)];
// 言い回しの印で絞る: ok(印の集合) が true の言い回しだけ。全部なら キー のまま、一部なら「キー#0,2」、無ければ null
const tagsOf = (k, i) => new Set(((TAGS && TAGS[k] && TAGS[k][i]) || '').split('').filter(Boolean));
function fitVar(k, ok) {
  if (!k || !has(k)) return null;
  const a = (DUR && DUR[k]) || (TAGS && TAGS[k]);
  if (!a || !TAGS || !TAGS[k]) return k;
  const ix = a.map((x, i) => i).filter((i) => ok(tagsOf(k, i)));
  if (!ix.length) return null;
  return ix.length === a.length ? k : `${k}#${ix.join(',')}`;
}

// 今のプレーで本塁に還った走者の数(点はプレーの終わりに足されるので、それまではここで数える)
function runsSoFar(def) {
  return [def.batterRunner, ...(def.runners || [])].filter((r) => r && !r.out && r.scored).length;
}

// 点差の言葉: 還った点で同点・勝ち越し・逆転・サヨナラになったか
function scoreWord(def, pl) {
  const g = def.g;
  if (!g || !g.score) return null;
  // ツーアウトからのフォースアウトで点が消えることがあるので、アウトが 2 つ以上になりうる時は言わない
  if ((g.outs || 0) + ((pl && pl.outs) || 0) >= 2 && !(def.batterRunner && def.batterRunner.from >= 1)) return null;
  const bat = g.half === 'top' ? 'them' : 'us', fld = bat === 'us' ? 'them' : 'us';
  const before = g.score[bat] - g.score[fld];
  const after = before + runsSoFar(def);
  if (before < 0 && after === 0) return 'tie';
  if (before <= 0 && after > 0) return g.half === 'bottom' && g.inning >= 9 ? 'sayonara' : before < 0 ? 'reverse' : 'lead_change';
  if (after < 0 && after === -1) return 'run_close';
  if (after < -1 && rnd() < 0.5) return 'run_add';
  return null;
}

// 打球の角度(度)。本塁から見てセンター方向が 0、一塁側(ライト)が +、三塁側(レフト)が -
const spray = (p) => Math.atan2(p.x, -p.z) * 180 / Math.PI;
const OFS = ['LF', 'CF', 'RF'], NAME = { LF: 'left', CF: 'center', RF: 'right' };
const BASES = [[0, -0.22], [19.07, -19.4], [0, -38.8], [-19.07, -19.4]];   // rules.js の BASE_XZ と同じ(本塁・一塁・二塁・三塁)
function landing(pl) {
  const ev = pl.batted && pl.batted.path && pl.batted.path.events.find((e) => ['bounce', 'roll', 'wall', 'stop'].includes(e.type));
  return ev && ev.p ? ev : null;
}
// 外野に落ちた打球: 最初に地面(またはフェンス)に着いた所と、外野手の守る位置で決める。
//   フェンスに当たった → フェンス直撃。一番近い外野手より 4 m 以上手前 → その外野手の前に落ちた。
//   4 m 以上後ろ: 外野手の角度から 8 度以上離れて二人の間 → 左中間/右中間を破った、そうでなければその外野手の頭を越えた(〇〇オーバー)。
//   同じくらいの深さ: 二人の間で 8 度以上離れていれば間を破った、そうでなければその外野手の前に落ちた。
export function outfieldWord(def, p, wall) {
  if (wall) return 'fence';
  const a = spray(p), d = Math.hypot(p.x, p.z);
  const F = OFS.map((k) => { const h = def.homeOf(k); return { k, a: spray(h), d: Math.hypot(h.x, h.z) }; });
  const near = F.reduce((m, f) => (Math.abs(f.a - a) < Math.abs(m.a - a) ? f : m));
  const off = Math.abs(near.a - a);
  const gap = a < F[1].a ? 'gap_left' : 'gap_right';
  const between = a > F[0].a && a < F[2].a && off >= 8;
  if (d < near.d - 4) return 'front_' + NAME[near.k];
  if (d > near.d + 4) return between ? gap : 'over_' + NAME[near.k];
  return between ? gap : 'front_' + NAME[near.k];
}
export function direction(def, pl, k) {
  const f = pl.opt.fielder, of = OFS.includes(f);
  let p = def.ballPos;
  if (!p) return null;
  let key = null, kind = null;
  if (k === 'through' && !pl.fly) {
    kind = 'ground';
    const a = spray(p);
    const aSS = def.homeOf ? spray(def.homeOf('SS')) : -12, a2B = def.homeOf ? spray(def.homeOf('2B')) : 12;
    key = a < aSS ? 'through_left' : a > a2B ? 'through_right' : 'through_center';
    // 「ピッチャーの足もとを抜けた!」はマウンドのそばを通ったゴロだけ(11/21)
    const a0 = pl.batted && pl.batted.v ? Math.atan2(pl.batted.v.x, -pl.batted.v.z) * 180 / Math.PI : a;
    key = fitVar(key, (T) => !T.has('P') || Math.abs(a0) < 6) || key;
  } else if (pl.fly && of && ['through', 'gap_left', 'gap_right', 'safe'].includes(k)) {
    kind = 'fly';
    const ev = landing(pl);
    if (ev) p = ev.p;
    key = outfieldWord(def, p, ev && ev.type === 'wall');
  } else return null;
  (def._cmDir = def._cmDir || []).push({ kind, a: +spray(p).toFixed(1), d: +Math.hypot(p.x, p.z).toFixed(1), x: p.x, z: p.z, wall: kind === 'fly' && key === 'fence', key, fielder: f });
  if (def._cmDir.length > 200) def._cmDir.shift();
  return key;
}

// 打った後の最初の言葉(打球の行方)を、打球の向き・強さ・落ちる所で細かく選ぶ。打った瞬間の「打った!」は言わない
//   ゴロ: 三塁線・サード正面・三遊間・ショート正面・二遊間(センター返し)・ピッチャー返し・セカンド正面・一二塁間・ファースト正面・一塁線
//   ライナー: 外野へ(レフト・センター・ライト)・内野へ。フライ: 線際・左中間・右中間・深い・浅い・その外野手へ。バント: 三塁側・一塁側
// 打球の本当の形(11/19 持ち主「ライナーでセンター!の実況がおかしい」)。ゲームの中の型(batted.type)は「誰の所へ行くか」で作る名前で、
// 外野への 'liner' に打ち出し 43 度・滞空 4 秒の山なりの打球が混じっていた(試合 100 打球で外野の 'liner' の 6 割)。実況は打ち出し角と最初に落ちる所・滞空で決める。
// 本物の分け方: ゴロ 10 度未満 / ライナー 10〜25 度で滞空が短い / フライ 25〜50 度 / ポップ 50 度より上。線の外に落ちる飛球はファウルフライ
function flight(pl) {
  if (pl._cmF) return pl._cmF;
  const b = pl.batted, v = b.v, la = Math.atan2(v.y, Math.hypot(v.x, v.z)) * 180 / Math.PI;
  const ev = landing(pl), p = ev && ev.p;
  const a = p ? spray(p) : Math.atan2(v.x, -v.z) * 180 / Math.PI;
  const hang = ev && ev.t != null ? ev.t : null, d = p ? Math.hypot(p.x, p.z) : null;
  const liner = la < 24.5 && (hang == null || hang < 3.3);   // 深いライナー(21 度で 96 m・滞空 3 秒)もライナー
  const foul = !!pl.foul || (p ? Math.abs(a) > 45.5 : false);
  return (pl._cmF = { la, a, d, hang, liner, foul });
}
// 11/21 打球の中身(ballFacts): 打ち方の名前(自分の打球は pl.opt.kb、ほかの野手の打球は batted.sub)・速さ・形・捕る人から決める。
// 持ち主「強い打球がピッチャーへの声がおかしい」: 前は、投手への弱いゴロ・バント・高く跳ねるゴロにも「強い打球がピッチャーへ!」「ピッチャー返し!」、
// 二遊間を抜けてショートが捕るゴロにも、センター方向(3.5 度以内)というだけで「ピッチャーへ!」を言い、強い当たりの一声「強い打球!」の後に
// 「強い打球がピッチャーへ!」が続くこともあった。詰まったゴロ(型は bunt)に「送りバント」、外野へのゴロに「ショートゴロ」も出ていた。
export function ballFacts(def, pl) {
  const b = pl.batted, F = flight(pl), v = b.v;
  const spd = Math.hypot(v.x, v.y, v.z), a = Math.atan2(v.x, -v.z) * 180 / Math.PI;
  const label = String(pl.opt.kb || b.sub || '');
  const f = pl.opt.fielder, of = OFS.includes(f);
  let ty = b.type;
  const air = ty === 'liner' || ty === 'fly' || ty === 'pop' || ty === 'fence';
  if (air && F.foul) ty = 'foul_fly';
  else if (ty === 'liner' && !F.liner) ty = F.la > 50 ? 'pop' : 'fly';
  else if (ty === 'fly' && F.liner && F.la >= 10) ty = 'liner';
  const bunt = b.type === 'bunt' && (!label || /バント/.test(label));
  if (b.type === 'bunt' && !bunt) ty = 'grounder';   // 詰まったゴロ・ボテボテ(作り方がバントと同じ転がり)
  const strongL = /強い|強烈|痛烈|強め|ピッチャー返し/.test(label) && !/弱い/.test(label);
  const weakL = /弱い|ボテボテ|詰まった|ゆるい|ポテン|テキサス|前に落ち/.test(label);
  const strong = !weakL && (strongL || pl.kind === 'hard' || spd >= 40);
  const weak = !strong && (weakL || bunt || spd < 24);
  const ground = ty === 'grounder' || ty === 'bunt';
  const chop = ground && /跳ねる|チョッパー/.test(label) && !/切れ目|一度跳ねて/.test(label);
  const dribbler = ground && !bunt && (b.type === 'bunt' || /ボテボテ|詰まった|弱いゴロ/.test(label));
  const near = (k) => def.homeOf && Math.abs(a - spray(def.homeOf(k))) < 4;
  const runners = !!(def.g && def.g.bases && def.g.bases.some(Boolean)), outs = def.g ? def.g.outs || 0 : 0;
  // ゴロの向きの言葉が言えるか(守備位置の角度と打球の向き): 三塁線・一塁線・三遊間・一二塁間・二遊間
  const ag = (k) => (def.homeOf ? spray(def.homeOf(k)) : { '3B': -30, SS: -12, '2B': 12, '1B': 30 }[k]);
  const a3 = ag('3B'), aS = ag('SS'), a2 = ag('2B'), a1 = ag('1B');
  const dir = { Y: a < a3 - 2, Z: a > a1 + 2, M: a > a3 - 3 && a < aS + 3, N: a > a2 - 3 && a < a1 + 3, Q: a > aS - 2 && a < a2 + 2 };
  return {
    ty, bunt, f, of, spd, a, la: F.la, land: F.a, label, strong, weak, ground, chop, dribbler, runners, outs, dir,
    front: ground ? f === 'P' || !!(f && near(f)) : /正面/.test(label) || ['easy', 'hard'].includes(pl.kind),
    sink: /沈む/.test(label), carry: /伸びる/.test(label), slice: /切れ/.test(label), back: /背走|後ろ|内野と外野の間|頭を越/.test(label),
    high: /高く上がった|真上|天ぷら|高い内野|高い/.test(label) && (ty === 'pop' || ty === 'fly'),
  };
}
const POSNUM = { P: '1', C: '2', '1B': '3', '2B': '4', '3B': '5', SS: '6', LF: '7', CF: '8', RF: '9' };
// 打球の中身に合う言い回しだけを通す(言い回しの印で)。preTag: 前に付ける一声の印(同じ強さの言葉を重ねない)
function fitsBall(X, preTag) {
  return (T) => {
    if (T.has('H')) return false;                                   // 打った瞬間に「抜けた」「ヒット」は言わない
    if (X.weak && T.has('S')) return false;
    if (X.strong && T.has('W')) return false;
    if (preTag && T.has(preTag)) return false;                       // 「強い打球!」の後に「強いゴロ」と重ねない
    if (X.ground && (T.has('A') || T.has('L') || T.has('F'))) return false;
    if (X.ty === 'liner' && (T.has('G') || T.has('F'))) return false;
    if ((X.ty === 'fly' || X.ty === 'pop' || X.ty === 'foul_fly') && (T.has('G') || T.has('L'))) return false;
    if (T.has('B') && !X.bunt) return false;
    if (T.has('C') && !(X.bunt && X.runners && X.outs < 2)) return false;   // 送りバントは走者がいて 2 アウト前だけ
    if (T.has('P') && !(X.f === 'P' || ((X.ground || X.ty === 'liner') && Math.abs(X.a) < 6))) return false;
    if (T.has('R') && !X.front) return false;
    if (T.has('D') && (X.weak || X.dribbler)) return false;
    if (X.ground) for (const c of 'YZMNQ') if (T.has(c) && !X.dir[c]) return false;   // 三塁線・三遊間などは、打球がその向きの時だけ
    // 守備位置の名前(印 2〜9)は捕る人の名前だけ(「セカンドの右!」を一塁手が捕る打球に言わない)。外野へ抜けるゴロは内野の名前を言ってよい
    const names = [...T].filter((c) => c >= '2' && c <= '9');
    if (names.length && !names.includes(POSNUM[X.f]) && !(X.of && ((X.ground && !X.bunt) || names.every((c) => c >= '7')))) return false;   // 外野の飛球は落ちる所の向きで外野の名前を言う(11/19)
    return true;
  };
}
function contactWord(def, pl, given) {
  const b = pl.batted; if (!b || !b.v) return { key: given, pre: null };
  const X = ballFacts(def, pl), F = flight(pl);
  const { f, of, a } = X, ty = X.ty;
  const ang = (k) => (def.homeOf ? spray(def.homeOf(k)) : 0);
  let key = null, pre = null, strongKey = false;
  if (ty === 'foul_fly') key = 'foul_fly';
  else if (X.bunt) key = f === 'C' ? 'bunt' : f === 'P' ? 'bunt_pitcher' : /セーフティ/.test(X.label) ? 'bunt_safety' : f === '3B' ? 'bunt_third' : f === '1B' ? 'bunt_first' : Math.abs(a) < 6 ? 'bunt' : a < 0 ? 'bunt_third' : 'bunt_first';
  else if (ty === 'grounder') {
    const a3 = ang('3B'), aS = ang('SS'), a2 = ang('2B'), a1 = ang('1B');
    const near = (x) => Math.abs(a - x) < 4;
    if (of) { key = 'through_' + (F.a < -12 ? 'left' : F.a > 12 ? 'right' : 'center'); (pl.said || (pl.said = {})).dir = true; }   // 外野へのゴロは内野を抜けた当たり
    else if (f === 'P') { key = X.chop ? 'g_chopper_pitcher' : X.weak || X.dribbler ? 'g_pitcher_soft' : X.strong ? (rnd() < 0.7 ? 'g_comebacker' : 'grounder_pitcher') : 'grounder_pitcher'; strongKey = X.strong; }
    else if (X.chop) key = 'g_chopper';
    else if (X.dribbler && has('g_dribbler_' + f)) key = 'g_dribbler_' + f;
    else if (a < a3 - 6) key = 'down_line_left';
    else if (a > a1 + 6) key = 'down_line_right';
    else if (X.strong && has('g_hard_' + f) && near(ang(f)) && rnd() < 0.6) { key = 'g_hard_' + f; strongKey = true; }
    else if (near(a3)) key = 'grounder_third';
    else if (near(aS)) key = 'grounder_short';
    else if (near(a2)) key = 'grounder_second';
    else if (near(a1)) key = 'grounder_first';
    else if (a < aS) key = 'grounder_left';
    else if (a > a2) key = 'grounder_right';
    else key = 'grounder_middle';
    if (!strongKey && !X.dribbler && !X.chop && !of) {
      if (X.strong && (pl.kind === 'hard' || rnd() < 0.45)) pre = 'good_contact';
      else if (X.weak && rnd() < 0.5) pre = 'weak_contact';
    }
  } else if (ty === 'liner') {
    if (f === 'P') { key = 'liner_pitcher'; strongKey = true; }
    else if (of) key = X.sink && rnd() < 0.5 ? 'liner_sink' : X.carry && rnd() < 0.5 ? 'liner_carry' : 'liner_' + (F.a < -15 ? 'left' : F.a > 15 ? 'right' : 'center');
    else key = X.sink && rnd() < 0.4 ? 'liner_sink' : rnd() < 0.5 ? 'liner_infield' : 'liner';
    if (!strongKey && X.spd > 42 && (pl.kind === 'hard' || rnd() < 0.3)) pre = 'good_contact';
  } else if (ty === 'fly' || ty === 'fence') {
    const ev = landing(pl), p = ev && ev.p;
    if (of && p) {
      const la = spray(p), ld = Math.hypot(p.x, p.z), h = def.homeOf(f), hd = Math.hypot(h.x, h.z);
      const FA = OFS.map((k) => spray(def.homeOf(k)));
      const deep = ty === 'fence' || ld > hd + 9;
      if (la < -36) key = 'fly_line_left';
      else if (la > 36) key = 'fly_line_right';
      else if (X.slice && rnd() < 0.5) key = 'fly_slice';
      else if (la > FA[0] + 8 && la < FA[1] - 8) key = 'fly_gap_left';
      else if (la > FA[1] + 8 && la < FA[2] - 8) key = 'fly_gap_right';
      else if (deep) key = 'fly_deep';
      else if (ld < hd - 14) key = 'fly_shallow';
      else if (X.high && rnd() < 0.5) key = 'fly_high';
      else key = 'fly_' + NAME[f];
      if (deep && key !== 'fly_deep' && rnd() < 0.4) pre = 'good_contact';
    } else if (!of) key = f === 'P' ? 'pop_pitcher' : X.back && rnd() < 0.6 ? 'pop_back' : 'pop';
  } else if (ty === 'pop') {
    if (f === 'P') key = 'pop_pitcher';
    else if (X.back && rnd() < 0.6) key = 'pop_back';
    else if (X.high && rnd() < 0.4) key = 'fly_high';
    else if (!X.high && rnd() < 0.3) key = 'fly_shallow';
    else key = 'pop';
  }
  // 11/20 打球の種類(pl.kind)で最初の一声: 強い当たりは「痛烈!」の類。前へ突っ込む・簡単な打球には付けない
  if (pl.kind === 'hard' && !strongKey && ty !== 'fly' && !of) pre = 'good_contact';
  else if (pl.kind === 'charge' || pl.kind === 'easy') pre = null;
  if (X.dribbler || X.chop || X.bunt || strongKey) pre = null;
  if (pre && def._cmLastPre === pre) pre = null;   // 「いい当たり!」「詰まった」を 2 打球続けて言わない
  const preTag = pre === 'good_contact' ? 'S' : pre === 'weak_contact' ? 'W' : null;
  let k2 = key ? fitVar(key, fitsBall(X, preTag)) : null;
  if (!k2 && key && preTag) { pre = null; k2 = fitVar(key, fitsBall(X, null)); }   // 一声を付けると言える言い回しが無くなる時は一声をやめる
  if (!k2 && given && !key) k2 = fitVar(given, fitsBall(X, null));
  // 合う言い回しが無い時は、捕る人の名前のゴロ・フライの言葉にする(「サードゴロ」「ショートフライ」の類)
  if (!k2 && key) {
    const PN = { P: 'pitcher', '1B': 'first', '2B': 'second', SS: 'short', '3B': 'third' };
    const alt = X.ground ? (PN[f] && 'grounder_' + PN[f]) : of ? 'fly_' + NAME[f] : 'pop';
    if (alt && alt !== key) { k2 = fitVar(alt, fitsBall(X, preTag)) || fitVar(alt, fitsBall(X, null)); if (k2) key = alt; }
  }
  const preK = pre ? fitVar(pre, fitsBall(X, null)) : null;
  def._cmLastPre = preK ? pre : null;
  (def._cmContactW = def._cmContactW || []).push({ ty, ty0: b.type, la: +F.la.toFixed(1), hang: F.hang, a: +a.toFixed(1), spd: +X.spd.toFixed(1), key: k2, base: key, pre: preK, fielder: f, label: X.label, kind: pl.kind || null, X: { ty, strong: X.strong, weak: X.weak, bunt: X.bunt, front: X.front, land: X.land } });
  if (def._cmContactW.length > 300) def._cmContactW.shift();
  return { key: k2, pre: preK };
}
// 試験用(tools/cmtable_1121.py): 打球 1 つに対して、打った後の最初の言葉(と印で通る言い回し)を返す。声は鳴らさない
export function previewContact(def, pl) { pl._cmF = null; const X = ballFacts(def, pl); const w = contactWord(def, pl, null); return { ...w, X: { ...X } }; }

// 本塁打: 「入った!」→ 方向(レフトスタンドへ・バックスクリーンへ・ライトスタンドへ)→ 点数(ソロ・ツーラン・スリーラン・満塁)、サヨナラならサヨナラホームラン
function homeRunWords(def, pl) {
  const p = def.ballPos;
  const a = p ? spray(p) : 0;
  const dir = a < -12 ? 'hr_dir_left' : a > 12 ? 'hr_dir_right' : 'hr_dir_center';
  const runs = [def.batterRunner, ...(def.runners || [])].filter((r) => r && !r.out && !r.scored).length || 1;
  const g = def.g;
  let type = ['hr_solo', 'hr_solo', 'hr_2run', 'hr_3run', 'hr_grand'][Math.min(4, runs)];
  if (g && g.score && g.half === 'bottom' && g.inning >= 9 && g.score.us + runs > g.score.them && g.score.us <= g.score.them) type = 'hr_sayonara';
  (def._cmHr = def._cmHr || []).push({ a: +a.toFixed(1), dir, runs, type });
  pl._cmRoarAt = def.t + 0.5;
  return ['hr_in', dir, type];
}

// 捕った: 外野手が直接捕った「センター捕りました」(時々「センターフライ、アウト」)。フェンスの 6 m 手前より奥なら「フェンス際、捕った!」
// 内野手のフライ・ライナーは「ショートフライ、アウト」「サードライナー、アウト!」
function catchWord(def, pl) {
  const who = pl.fieldedBy === 'me' ? def.my : pl.fieldedBy;
  if (!pl.fly || !who) return null;
  let ty = pl.batted && pl.batted.type;
  if (ty === 'liner' && pl.batted.v && !flight(pl).liner) ty = 'fly';   // 山なりの「ライナー」を捕っても「センターライナー」とは言わない
  else if (ty === 'fly' && pl.batted.v && flight(pl).liner && flight(pl).la >= 10) ty = 'liner';
  if (OFS.includes(who)) {
    const p = def.ballPos;
    if (p && def.ctx && def.ctx.fenceDist) {
      const fd = def.ctx.fenceDist(spray(p));
      if (fd && Math.hypot(p.x, p.z) > fd - 6) return 'fence_catch';
    }
    if (ty === 'liner' && rnd() < 0.5 && has('out_liner_' + who)) return 'out_liner_' + who;
    if (rnd() < 0.35 && has('out_fly_' + who)) return 'out_fly_' + who;
    return 'caught_' + who;
  }
  if (ty === 'liner' && has('out_liner_' + who)) return 'out_liner_' + who;
  if ((ty === 'pop' || ty === 'fly') && rnd() < 0.6 && has('out_pop_' + who)) return 'out_pop_' + who;
  return rnd() < 0.5 && has('caught_IF') ? 'caught_IF' : 'caught';
}

// 大きく褒める言葉(Shout の段階)は、本当に難しいプレーの時だけ。
// 難しいプレー = 飛び込み・ジャンプで捕った(pl.special)か、ゲームの評価が「ファインプレー」(pl.evalKind === 'fine'。evalPlay が決める。
// フェンス際・背走・逆シングル・ぎりぎりの強烈な当たりはこの判定に入っている)。普通に捕った時は「捕りました」「アウト」だけ。
const PRAISE = new Set(['fine_play', 'nice_catch', 'diving_catch', 'jumping_catch', 'running_catch', 'sliding_catch']);
function praiseOk(pl, k) {
  if (k === 'diving_catch' || k === 'jumping_catch') return !!pl.special;
  return !!pl.special || pl.evalKind === 'fine';
}

// 「いい送球!」は、送球で走者をぎりぎり刺した時(走者が塁まであと 0.3 秒未満)・外野から走者を刺した時・併殺の時だけ。
// 普通に捕って普通に投げてアウトの時は「アウト」だけ。アウトの言葉(out・tag_out)が来た時に、その時アウトになった走者の残りの距離で決める。
const RUN = 7.2, BAT = 6.6;   // defense.js の RUN_SPEED・BATTER_SPEED と同じ
const OF = new Set(['LF', 'CF', 'RF']);
function noteOut(def, pl) {
  const rs = [def.batterRunner, ...(def.runners || [])].filter((r) => r && r.out && !r._cmSeen);
  const info = [];
  for (const r of rs) {
    r._cmSeen = true;
    const left = Math.max(0, 27.43 - (r.dist || 0)) / (r.isBatter ? BAT : RUN);
    const thrown = pl.lastThrow && !pl.lastThrow.self;
    if (thrown && left < 0.3) pl._cmGoodThrow = 'close';
    if (thrown && OF.has(def.my) && pl.fieldedBy === 'me' && !r.isBatter) pl._cmGoodThrow = 'outfield';
    const base = r.to != null ? r.to % 4 : null;
    info.push({ left, thrown: !!thrown, batter: !!r.isBatter, base: r.isBatter && (r.from || 0) === 0 ? 1 : (((r.from || 0) + 1) % 4), to: base, forced: !!r.forced });
    (def._cmOut = def._cmOut || []).push({ left: +left.toFixed(2), thrown: !!thrown, batter: !!r.isBatter, my: def.my, good: pl._cmGoodThrow || null });
    if (def._cmOut.length > 300) def._cmOut.shift();
  }
  if ((pl.outs || 0) >= 2) pl._cmGoodThrow = pl._cmGoodThrow || 'dp';
  return info;
}
// アウトの言い分け: 本塁でアウト・間一髪・二塁でフォースアウト・ゴロで一塁アウト(「ショートゴロ、一塁アウト」)
function outWord(def, pl, k, info) {
  if (k !== 'out' && k !== 'tag_out') return k;
  const o = info[0];
  if (!o) return k;
  if (o.base === 0 && !o.batter) return 'home_out';
  if (o.thrown && o.left < 0.3) return 'out_close';
  if (k === 'tag_out') return k;
  if (!o.batter && o.forced && o.base === 2) return 'out_force';
  if (o.batter && o.base === 1 && pl.batted && pl.batted.type === 'grounder') {
    const who = pl.fieldedBy === 'me' ? def.my : pl.fieldedBy;
    const r = rnd();
    if (r < 0.4 && has('out_go_' + who)) return 'out_go_' + who;
    if (r < 0.7) return 'out_first';
  }
  return k;
}
// アウトの後: これでツーアウト・スリーアウト(ピンチをしのいだ・この回 0 点・試合終了)
function afterOutWords(def, pl) {
  const g = def.g; if (!g || pl._cmOutsSaid === (pl.outs || 0)) return [];
  pl._cmOutsSaid = pl.outs || 0;
  const total = (g.outs || 0) + (pl.outs || 0);
  if (total >= 3) {
    if (runsSoFar(def) && !(def.batterRunner && def.batterRunner.from >= 1)) { /* フォースアウトで点が消える場合などは言わない */ }
    const lead = g.score && (g.half === 'top' ? g.score.us - g.score.them : g.score.them - g.score.us);
    const last = g.half === 'top' && g.inning >= 9 && g.score && g.score.us > g.score.them;
    if (last) { def._cmWon = true; return ['game_win']; }
    const risp = pl._cmStart && (pl._cmStart.bases[1] || pl._cmStart.bases[2]);
    if (risp && !runsSoFar(def)) return [pickOne(['escape', 'escape', 'change'])];
    if (!runsSoFar(def) && rnd() < 0.35) return ['zero_inning'];
    return lead != null && rnd() < 0.6 ? ['change'] : [];
  }
  if (total === 2 && rnd() < 0.35) return ['now_two_out'];
  if (total === 1 && (pl.outs || 0) === 1 && rnd() < 0.15) return ['now_one_out'];
  return [];
}
// 送球の行方: 走者と球のどちらが先に塁に着くか近い時は「きわどいタイミング!」を続ける
function closeCall(def, pl, base) {
  const p = def.ballPos; if (!p || base == null) return false;
  const B = BASES[base];
  const ballT = Math.hypot(p.x - B[0], p.z - B[1]) / 31;
  const rs = [def.batterRunner, ...(def.runners || [])].filter((r) => r && !r.out && !r.scored && r.run && !r.done && (r.to % 4) === base);
  if (!rs.length) return false;
  const r = rs[0];
  const legs = ((base - (r.from || 0) + 4) % 4) || 4;
  const left = Math.max(0, legs * 27.43 - (r.dist || 0)) / (r.isBatter ? BAT : RUN);
  return Math.abs(left - ballT) < 0.3;
}

// 打った瞬間の一声(「打った!」など)は打球音に重なって「ポン」と聞こえるので言わない(11/18 持ち主)。
// 打った時の実況は、打球の方向が分かってから(打って 0.5 秒後)方向の言葉(「三遊間!」「センターへ上がった」など)から始める。
const CONTACT = new Set(['hit', 'pulled', 'opposite', 'long_hit']);
const DIRKEYS = new Set(['grounder_third', 'grounder_left', 'grounder_middle', 'grounder_right', 'fly_left', 'fly_center', 'fly_right', 'pop', 'liner', 'bunt']);
const AFTER_CONTACT = 0.5;
// 投げる前の状況の読み上げ(showSituation・saySituation・pitch_set)は、ここで預かり、投げる前のつなぎ(preTalk)の候補にする
const SIT = new Set(['no_out', 'one_out', 'two_out', 'runner_1', 'runner_2', 'runner_3', 'runner_12', 'runner_13', 'runner_23', 'loaded', 'two_out_loaded', 'big_moment', 'pinch', 'pitch_set']);

function expand(def, keys, opt = {}) {
  const pl = def.play;
  let ks = [].concat(keys).filter(Boolean);
  if (!pl || !pl.opt) return { keys: ks, opt };
  const out = [];
  const contact = ks.some((k) => CONTACT.has(k)) || (opt.delay != null && opt.delay < 0.2 && opt.cut);
  const S = pl._cmSaid || (pl._cmSaid = {});
  let outish = false;
  for (const k of ks) {
    if (CONTACT.has(k)) { (def._cmContact = def._cmContact || []).push(k); continue; }
    if (contact && DIRKEYS.has(k)) { const w = contactWord(def, pl, k); if (w.pre) out.push(w.pre); out.push(w.key); S.contact = true; continue; }
    if (k === 'hr_carry' && ks.includes('hr')) continue;   // 越えた後の「大きい…」は遅いので言わない
    if (k === 'hr') { if (!(pl.said && pl.said.hrw)) { (pl.said || (pl.said = {})).hrw = true; out.push(...homeRunWords(def, pl)); } continue; }
    if (k === 'back_back') S.back = true;
    if (k === 'caught') { const w = catchWord(def, pl); if (w) { (def._cmCatch = def._cmCatch || []).push(w); out.push(w); outish = true; continue; } }
    let kk = k;
    if (k === 'out' || k === 'tag_out' || k === 'double_play' || k.startsWith('dp_')) {
      const info = noteOut(def, pl);
      kk = outWord(def, pl, k, info);
      if (kk !== k) (def._cmOutW = def._cmOutW || []).push({ from: k, to: kk });
    }
    if (k === 'safe') {
      const br = def.batterRunner;
      if (br && !br.out && (br.from || 0) >= 1 && pl.batted && pl.batted.type === 'grounder' && !OFS.includes(pl.opt.fielder) && pl.lastThrow && pl.lastThrow.base === 1) kk = 'infield_hit';
      else if (pl._cmClose) kk = 'safe_close';
    }
    if (k === 'nice_throw') {
      (def._cmThrow = def._cmThrow || []).push({ ok: !!pl._cmGoodThrow, why: pl._cmGoodThrow || null });
      if (def._cmThrow.length > 300) def._cmThrow.shift();
      if (!pl._cmGoodThrow) continue;
    }
    if (PRAISE.has(k)) {
      const ok = praiseOk(pl, k);
      (def._cmPraise = def._cmPraise || []).push({ key: k, ok, special: pl.special || null, evalKind: pl.evalKind || null });
      if (def._cmPraise.length > 300) def._cmPraise.shift();
      if (!ok) continue;
      pl._cmRoarAt = def.t + 0.4;
      // 外野手が飛び込み・ジャンプなしで遠くを追って捕ったファインプレーは「よく追いついた!」も
      if (k === 'fine_play' && !pl.special && OFS.includes(def.my) && pl.fieldedBy === 'me' && rnd() < 0.5) kk = 'running_catch';
    }
    // 内野を抜けたゴロ・外野に落ちた打球は、打球の角度で方向を言う(「抜けていった!センター前!」)
    const dir = direction(def, pl, k);
    if (dir) { if (!(pl.said && pl.said.dir)) { (pl.said || (pl.said = {})).dir = true; out.push(dir); } continue; }
    if (['to_first', 'to_second', 'to_third', 'to_home'].includes(k)) {
      out.push(kk);
      const base = { to_first: 1, to_second: 2, to_third: 3, to_home: 0 }[k];
      if (closeCall(def, pl, base) && !S.close) { S.close = true; pl._cmClose = true; out.push('close_call'); }
      continue;
    }
    out.push(kk);
    if (/out|double_play|^dp_|caught|_catch/.test(kk)) outish = true;
    if (k === 'home_in') {
      if (S.homeIn) { out[out.length - 1] = 'run_more'; }
      S.homeIn = true;
      const w = scoreWord(def, pl);
      if (w && !(pl.said && pl.said['score_' + w])) { (pl.said || (pl.said = {}))['score_' + w] = true; out.push(w); if (/tie|reverse|lead_change|sayonara/.test(w)) pl._cmRoarAt = def.t + 0.5; }
    }
  }
  if (contact && !S.contact && pl.batted) { const w = contactWord(def, pl, null); if (w.key) { if (w.pre) out.unshift(w.pre, w.key); else out.unshift(w.key); S.contact = true; } }
  if (outish && (pl.outs || 0) > 0) out.push(...afterOutWords(def, pl));
  // 言葉が続く時は、句と句の間を中継らしく少しだけ空ける
  const o = { ...opt };
  if (contact) { o.delay = Math.max(o.delay || 0, AFTER_CONTACT); if (o.maxWait != null) o.maxWait = Math.max(o.maxWait, 0.8); }
  if (out.length > 1 && o.gap == null) o.gap = 0.08;
  if (out.length > ks.length && o.maxWait != null) o.maxWait = Math.max(o.maxWait, 1.4);
  // 続けて言う言葉(本塁打の「入った!→レフトスタンドへ→ツーラン」など)は、前の言葉を言い終わるのを待つ。最後の言葉まで捨てないように
  if (out.length > 1) o.maxWait = Math.max(o.maxWait ?? 1.6, out.slice(0, -1).reduce((s2, k) => s2 + durMean(k) + 0.1, 0) + 0.4);
  return { keys: out.filter((k) => has(k)), opt: o };
}

// ------------------------------------------------------------ 声の順番の見積もり(ゲームの時間で)
// audio.js の声の列(pumpVoice)と同じ決まりで、いつ何を言い終わるかを見積もる。間があいているかの判断と、試験の記録に使う。
// 本当に鳴らす順番は audio.js が決める(こちらは見積もり)。
function vstate(def) { return def._cmV || (def._cmV = { busy: 0, items: [], log: [] }); }
function schedule(def, keys, o) {
  const V = vstate(def), now = def.t || 0;
  if (o.cut) { for (const x of V.items) if (x.start > now) x.drop = 'cut'; V.items = V.items.filter((x) => x.start <= now); V.busy = V.items.reduce((m, x) => Math.max(m, x.end), now); }
  if (!o.low) {   // 大事な言葉が来たら、鳴っているつなぎ(low)は止めて先に言う(audio.js と同じ)
    const lows = V.items.filter((x) => x.low && x.end > now);
    if (lows.length) { for (const x of lows) { if (x.start > now) x.drop = 'low'; else { x.end = now + 0.06; x.stopped = true; } } V.items = V.items.filter((x) => !x.drop); V.busy = V.items.reduce((m, x) => Math.max(m, x.end), now); }
  }
  const kept = [];
  let t = Math.max(now + (o.delay || 0), V.busy + (o.gap ?? 0.06));
  for (const k of keys) {
    if (split(k)[0] === V.lastK && !o.allowRepeat) continue;   // audio.js と同じ: 同じ言葉を続けて言わない
    const d = durMean(k);
    const start = Math.max(t, now + (o.delay || 0));
    if (start - now > (o.maxWait ?? 1.6) + (o.delay || 0)) continue;
    if (o.untilSim != null && start + durMax(k) > o.untilSim) continue;
    kept.push(k); V.lastK = split(k)[0];
    const it = { k, start, end: start + d, low: !!o.low, at: now, inning: def.g ? def.g.inning : null };
    V.items.push(it); V.log.push(it);
    if (V.log.length > 3000) V.log.shift();
    t = start + d + (o.gap ?? 0.06);
    V.busy = Math.max(V.busy, start + d);
  }
  V.items = V.items.filter((x) => x.end > now - 2);
  return kept;
}
function idle(def, margin = 0.3) {
  const V = vstate(def), now = def.t || 0;
  if (V.busy > now - margin) return false;
  const s = def.ctx && def.ctx.sound;
  if (s && s.ready && s.enabled && s.ctx) { if (s.vq && s.vq.length) return false; if (s.vBusyUntil > s.ctx.currentTime - margin) return false; }
  return true;
}

// 実況を鳴らすのは、自分が操作するプレーの場面だけ(打つ少し前の状況の読み上げから、プレーが終わって評価が出るまで)。
// 早送り(def.dg・def.ffw)・ほかの野手の自動のプレー・攻撃中・攻守交代・スキップした場面では鳴らさない。
// 試合の終わり(ゲームセット・サヨナラ)は結果の画面へ移る所だけ鳴らす。審判のコールと観客の音はここを通らないので今のまま。
const END_KEYS = new Set(['game_set', 'game_set_2', 'sayonara', 'game_win', 'game_lose']);
function ownScene(def) { return !!def.play && !def.dg && !def.ffw; }
function send(def, keys, opt) {
  const pl = def.play;
  const o = { ...opt };
  // 打つ前に言い始める言葉は、打つ 0.15 秒前に言い終わる物だけ(打った瞬間に声が重ならないように)
  if (pl && pl.phase === 'pre' && pl.contactT != null && !o.untilSim) {
    const left = pl.contactT - pl.t - 0.15;
    o.untilSim = (def.t || 0) + left;
    const s = def.ctx && def.ctx.sound;
    if (s && s.ctx) o.until = s.ctx.currentTime + left;
  }
  const kept = schedule(def, keys, o);
  if (kept.length) def.ctx.sound.voice(kept, o);
  return kept;
}
export function commentate(def, keys, opt = {}) {
  if (def.ffw || def.dg) { def._cmMuted = (def._cmMuted || 0) + 1; return null; }
  const ks0 = [].concat(keys).filter(Boolean);
  // 状況の読み上げは預かって、投げる前のつなぎ(cmTick の preTalk)で言う
  if (ks0.length && ks0.every((k) => SIT.has(k)) && def.kind === 'game') { def._cmSit = { keys: ks0, t: def.t || 0 }; return null; }
  if (def.g && def.g.over && ks0.some((k) => END_KEYS.has(k))) {
    if (def._cmEnd) return null;
    def._cmEnd = true;
    const won = def.g.score && def.g.score.us > def.g.score.them;
    let ks = ks0.filter((k) => END_KEYS.has(k));
    if (def._cmWon) return null;   // 最後のアウトで「守り切りました!」を言った
    if (ks.includes('game_set')) ks = [won ? 'game_win' : pickOne(['game_lose', 'game_set'])];
    return send(def, ks, { ...opt, maxWait: 3 });
  }
  const r = expand(def, ks0, opt);
  if (ownScene(def)) return send(def, r.keys, r.opt);
  queueMicrotask(() => { if (ownScene(def)) send(def, r.keys, r.opt); else def._cmMuted = (def._cmMuted || 0) + 1; });
  return r;
}
// 評価(defense-eval)で悪送球が分かった時: 「悪送球!」(進塁を許した送球の乱れだけ。普通の送球をミスとは言わない)
try {
  window.addEventListener('defense-eval', (e) => {
    const def = globalThis.__app && globalThis.__app.defense;
    if (!def || def.kind !== 'game' || !ownScene(def)) return;
    if (e.detail && e.detail.text === 'ミス(悪送球)') send(def, ['bad_throw'], { maxWait: 1 });
    // 11/21 ふつうにアウトを取った後、間があいていれば時々「落ち着いた守備でした」(試合の終わり・チェンジの言葉を言った後は言わない)
    else if (e.detail && e.detail.kind === 'ok' && (e.detail.outs || 0) > 0 && !def._cmWon && rnd() < 0.3) {
      const V = vstate(def), last = V.log[V.log.length - 1], now = def.t || 0;
      const lk = last ? split(last.k)[0] : '';
      if (!/change|escape|zero_inning|game_|now_two_out/.test(lk) && idle(def, 0.2) && (!last || now - last.end > 0.3)) send(def, ['after_out'], { maxWait: 0.8, low: true });
    }
  });
} catch (e) { /* 無くても動く */ }

// ------------------------------------------------------------ 毎こま: 投げる前のつなぎ・打球を追う間のつなぎ・走者
// defense.js の update から、プレーの間だけ呼ばれる。試合の自分の場面だけ。早送り・スキップ中は何もしない。
const recentCat = [];
function useCat(c) { recentCat.push(c); if (recentCat.length > 4) recentCat.shift(); }
function fits(keys, budget) { return keys.reduce((s, k) => s + durMin(k) + 0.12, 0) <= budget; }
function scoreLead(g) { return g.half === 'top' ? g.score.us - g.score.them : g.score.them - g.score.us; }   // 守る側から見たリード

function preTalk(def, pl) {
  const g = def.g; if (!g || !g.score) return;
  const budget = pl.contactT - pl.t - 0.25;
  if (budget < 0.7) return;
  const b = g.bases || [], risp = b[1] || b[2], lead = scoreLead(g);
  const C = [];   // [カテゴリ, キー列, 重み]
  const first = !def._cmGameStarted; def._cmGameStarted = true;
  const halfKey = `${g.inning}${g.half}`, newHalf = def._cmHalf !== halfKey; def._cmHalf = halfKey;
  const sit = def._cmSit && (def.t || 0) - def._cmSit.t < 2.5 ? def._cmSit.keys.filter((k) => k !== 'pitch_set') : null;
  def._cmSit = null;
  if (first && g.inning === 1 && g.outs === 0 && !b.some(Boolean)) C.push(['start', ['game_start'], 100]);
  else if (first) C.push(['start', [pickOne(['inning_def', 'ready_' + def.my])], 60]);
  const innK = `inn_${g.half === 'top' ? 'top' : 'bot'}_${g.inning}`;
  if (newHalf && !first) C.push(['half', [rnd() < 0.5 && has(innK) ? innK : 'inning_def'], 40]);
  if (sit && sit.length) C.push(['sit', sit.slice(0, 3), 70]);
  const late = g.inning >= 7, last = g.inning >= 9;
  if (last && g.half === 'top' && lead > 0 && g.outs === 2) C.push(['big', ['pre_last_out'], 70]);
  else if (last && g.half === 'bottom' && risp && lead >= 0 && lead <= 1) C.push(['big', ['pre_sayonara'], 70]);
  else if (risp && lead >= 1 && lead <= 2) C.push(['big', ['pre_tying'], late ? 55 : 25]);
  else if (risp && lead === 0) C.push(['big', ['pre_goahead'], late ? 55 : 25]);
  if (last && g.outs === 0 && !b.some(Boolean) && g.half === 'top') C.push(['inn', ['pre_final'], 35]);
  const bc = g.balls || 0, sc = g.strikes || 0;
  if (bc === 3 && sc === 2) C.push(['count', ['pre_full'], 40]);
  else if (sc === 2) C.push(['count', ['pre_two_strikes'], 25]);
  else if (bc === 0 && sc === 0) C.push(['count', ['pre_first'], 15]);
  else if (bc >= 2 && sc < 2) C.push(['count', ['pre_ahead'], 15]);
  else if (sc > bc) C.push(['count', ['pre_ahead_p'], 12]);
  else C.push(['count', [has(`count_${bc}${sc}`) ? `count_${bc}${sc}` : 'pre_even'], 10]);
  // 11/21 「さあ、三球目」: 何球目かは、ツーストライクより前ならボールとストライクの数で決まる(ファウルもストライクに数える)
  const pno = bc + sc + 1;
  if (sc < 2 && pno >= 2 && pno <= 7 && has(`pre_pitchno_${pno}`)) C.push(['pitchno', [`pre_pitchno_${pno}`], 12]);
  const tags = (def.align && def.align.tags) || [];
  if (tags.includes('前進守備')) C.push(['align', ['pre_in'], 25]);
  else if (tags.includes('ゲッツー態勢')) C.push(['align', ['pre_dp'], 20]);
  else if (tags.includes('長打警戒')) C.push(['align', ['pre_deep'], 18]);
  if (lead === 0) C.push(['score', ['pre_tie'], 12]);
  else if (lead > 0) C.push(['score', [lead === 1 ? pickOne(['pre_lead1', 'lead_1']) : lead <= 5 && rnd() < 0.6 ? `lead_${lead}` : 'pre_lead'], 12]);
  else C.push(['score', [-lead <= 5 && rnd() < 0.6 ? `behind_${-lead}` : 'pre_behind'], 12]);
  C.push(['inn', [g.inning >= 10 ? 'pre_extra' : g.inning >= 7 ? 'pre_late' : g.inning >= 4 ? 'pre_mid' : 'pre_early'], 8]);
  if (b[2]) C.push(['runner', ['pre_runner3'], 14]);
  else if (risp) C.push(['runner', ['pre_scoring'], 10]);
  else if (b[0]) C.push(['runner', ['pre_runner'], 10]);
  if (risp && late && Math.abs(lead) <= 2) C.push(['pinch', ['pre_pinch'], 18]);
  if (g.outs === 2 && !(last && lead > 0)) C.push(['outs', ['pre_two_out'], 8]);
  if (g.outs === 0 && b.some(Boolean)) C.push(['outs', ['pre_no_out'], 6]);
  if (risp || rnd() < 0.3) C.push(['crowd', ['pre_crowd'], risp ? 14 : 6]);
  C.push(['atmos', ['pre_atmos'], 6], ['hold', ['pre_hold'], 8], ['pitcher', ['pre_pitcher'], 7], ['batter', ['pre_batter'], 5], ['ready', ['ready_' + def.my], 4]);
  // 決まり: 始まり・場面の読み上げ・大きな場面は必ず言う(重みが大きい)。それ以外は直前に使ったカテゴリを避けて重みで選ぶ。言わない回も残す(しゃべりすぎない)
  const ok = C.filter(([c, ks, w]) => ks.every(has) && fits(ks, budget) && (w >= 40 || !recentCat.includes(c)));
  if (!ok.length) return;
  if (!ok.some(([, , w]) => w >= 40) && rnd() < 0.15) return;   // 何もない時は時々黙る
  const tot = ok.reduce((s, x) => s + x[2], 0);
  let r = rnd() * tot, pick = ok[0];
  for (const x of ok) { if ((r -= x[2]) <= 0) { pick = x; break; } }
  // 言い回しは残りの時間に収まる物から選ぶ(長い言い回しは打つ前に言い終わらないので選ばない)
  let left = budget, keys = [];
  const take = (ks) => { const out = []; for (const k of ks) { const v = variant(k, left - 0.12 * (ks.length - out.length)); if (!v) return false; out.push(v); left -= durMax(v) + 0.12; } keys = keys.concat(out); return true; };
  if (!take(pick[1])) return;
  useCat(pick[0]);
  // 時間が余れば短いつなぎをもう 1 つ(カウント・応援・場面)
  if (left > 0.75 && rnd() < 0.65) {
    const more = ok.filter((x) => x !== pick && x[0] !== pick[0] && fits(x[1], left) && x[0] !== 'start');
    if (more.length) { const m = more.sort((a2, b2) => b2[2] - a2[2] + (rnd() - 0.5) * 20)[0]; if (take(m[1])) useCat(m[0]); }
  }
  (def._cmPre = def._cmPre || []).push({ cat: pick[0], keys, budget: +budget.toFixed(2) });
  if (def._cmPre.length > 300) def._cmPre.shift();
  send(def, keys, { maxWait: 0.3, gap: 0.12 });
}

// 言い回しを番号の中から 1 つ選ぶ(そのキーで直前に使った物は避ける)。'drop_q#5' の形で返す
function pickVar(k, idxs) {
  if (!has(k)) return null;
  const a = DUR && DUR[k], R = recentVar[k] || (recentVar[k] = []);
  let ix = a ? idxs.filter((i) => a[i] != null) : idxs;
  if (!ix.length) return null;
  const fresh = ix.filter((i) => !R.includes(i)); if (fresh.length) ix = fresh;
  const i = ix[Math.floor(rnd() * ix.length)];
  R.push(i); if (a && R.length > Math.min(4, a.length - 1)) R.shift();
  return `${k}#${i}`;
}
// 11/20 打球の種類(defense.js の varietyBall が決める pl.kind)ごとの一言。声は新しく作らず、今ある言い回しから合う物だけを番号で選ぶ。
//   全力で走る → 「追いつくか!」「懸命に追う!」 / 前へ突っ込む → 「前へ突っ込んでくる!」「突っ込んだ!」(飛球は「前か、捕れるか!」「落ちるか!」)
//   背走 → 「背走!」「下がって、下がって…」 / 飛び込む: ゴロ → 「飛びつけるか」「抜けるか、追いつくか」、外野の前 → 「前へ飛び込むか!」「ダイレクトで捕れるか!」、内野のライナー → 「届くか!」
//   跳ぶ: フェンス際 → 「フェンス際!」「フェンスいっぱい!」、内野の頭の上 → 「届くか!」 / 抜ける → 「抜けるか!」「どうだ、抜けるか」(外野は「間に合うか!」)
//   捕れずに抜けた(ノックだけ。試合は「抜けた!レフト前!」を defense.js が言う) → 「届かない!」「抜けていく!」「グラブの先を抜けた!」
//   バウンドが変わる・正面・少し動く・ファウルフライは、合う声が無い/打球の行方の言葉で足りるので足さない
function kindTalk(def, pl, S, t) {
  const K = pl.kind, b = pl.batted;
  if (!K || !b || pl.opt.fielder !== def.my) return;
  const ground = b.type === 'grounder' || b.type === 'bunt', of = OFS.includes(def.my);
  const ball = def.ballPos;
  const say1 = (k) => { if (!k) return false; send(def, [k], { maxWait: 0.25, low: true }); pl._cmFill = (pl._cmFill || 0) + 1; (def._cmKind = def._cmKind || []).push({ kind: K, key: k, t: +t.toFixed(2) }); if (def._cmKind.length > 300) def._cmKind.shift(); return true; };
  if (!S.kind && !pl.fieldedBy && !pl.holder && !pl.thrown && t >= 0.3 && idle(def, 0.05)) {
    let k = null;
    if (K === 'run') k = pickVar('chase_q', [0, 1, 2, 3, 4, 5]);
    else if (K === 'charge') k = ground ? pickVar('drop_q', [0, 2, 3]) : pickVar('drop_q', [1, 3, 4]);
    else if (K === 'back' && !S.back) k = rnd() < 0.5 ? pickVar('back_back', [3, 6]) : pickVar('going_back', [0, 2]);
    else if (K === 'dive') k = ground ? pickVar('through_q', [6, 3, 4]) : of ? pickVar('drop_q', [5, 6]) : pickVar('chase_q', [6]);
    else if (K === 'jump') k = of ? (S.fence ? null : pickVar('fence_q', [1, 5, 3])) : pickVar('chase_q', [6]);
    else if (K === 'through') k = of && !ground ? pickVar('chase_q', [2, 0]) : pickVar('through_q', [0, 2, 7]);
    if (k) { S.kind = true; if (K === 'back') S.back = true; if (K === 'jump' && of) S.fence = true; say1(k); return; }
    if (t > 1.2) S.kind = true;   // 間があかないまま 1.2 秒たったら言わない(打球の行方の言葉で足りている)
  }
  if (def.kind === 'knock' && !S.miss && ['dive', 'jump', 'through', 'run'].includes(K) && !pl.fieldedBy && !pl.holder && ball) {
    const h = def.homeOf(def.my), rF = Math.hypot(h.x, h.z), r = Math.hypot(ball.x, ball.z);
    const ev = landing(pl), landed = ev && t > ev.t + 0.1;
    if ((ground && r > rF + 6) || (!ground && landed && (of || r > rF + 3))) { S.miss = true; say1(pickVar('missed', K === 'through' ? [1, 2] : [1, 3])); }
  }
}

function liveTalk(def, pl) {
  const S = pl._cmSaid || (pl._cmSaid = {});
  const t = pl.t - pl.contactT;
  kindTalk(def, pl, S, t);
  if (t < 0.6) return;
  const b = pl.batted, f = pl.opt.fielder, of = OFS.includes(f);
  const ball = def.ballPos;
  pl._cmFill = pl._cmFill || 0;
  const low = (k, opt = {}) => { if (pl._cmFill >= 3 || !has(k)) return false; pl._cmFill++; send(def, [k], { maxWait: 0.3, low: true, ...opt }); (def._cmFillLog = def._cmFillLog || []).push(k); return true; };
  // 走者: 三塁を回った(本塁へ)は大事なので間を待たずに。ほかは間があいた時だけ
  for (const r of [def.batterRunner, ...(def.runners || [])]) {
    if (!r || r.out || r.scored) continue;
    const prev = r._cmFrom ?? r.from;
    if (r.from !== prev) {
      if (!r.isBatter && r.from === 3 && r.to === 4 && r.run && !S.go) { S.go = true; send(def, ['runner_go'], { maxWait: 0.6 }); }
      else if (!r.isBatter && r.from === 2 && r.to >= 3 && r.run && !S.to3 && idle(def, 0.15)) { S.to3 = true; low('runner_to_3'); }
      else if (r.isBatter && r.from === 1 && r.to >= 2 && r.run && !S.b2 && idle(def, 0.15)) { S.b2 = true; low('batter_to_2'); }
      else if (r.isBatter && r.from === 2 && r.to >= 3 && r.run && !S.b3 && idle(def, 0.15)) { S.b3 = true; low('batter_to_3'); }
    }
    r._cmFrom = r.from;
    if (!r.isBatter && r.returning && pl.fieldedBy && pl.fly && !S.back2 && idle(def)) { S.back2 = true; low('runner_back'); }
    if (r.isBatter && r.done && !r.run && (r.from === 2 || r.from === 3) && !S.xbh && idle(def, 0.4) && t > 2) { S.xbh = true; low(r.from === 3 ? 'hit_triple' : 'hit_double'); }
  }
  // 中継へ投げた(defense.js は中継への送球を言わないので、ここで)
  const lt = pl.lastThrow;
  if (lt && lt !== S.lt) { S.lt = lt; if (lt.base === 5 && !S.cut && idle(def, 0.1)) { S.cut = true; send(def, ['to_cut'], { maxWait: 0.5 }); } }
  // ファインプレー・逆転などの後、間があいたら観客の様子
  if (pl._cmRoarAt != null && (def.t || 0) > pl._cmRoarAt && !S.roar && idle(def, 0.5)) { S.roar = true; if (rnd() < 0.6) low('crowd_roar'); }
  if (!b || pl.fieldedBy || pl.holder || !ball || pl.thrown) return;
  if (!idle(def)) return;
  // 打球を追う間
  if ((b.type === 'fly' || b.type === 'fence') && of && ball.y > 2) {
    const ev = landing(pl), p = ev && ev.p;
    const h = def.homeOf(f), hd = Math.hypot(h.x, h.z), d = Math.hypot(ball.x, ball.z);
    const fd = def.ctx && def.ctx.fenceDist ? def.ctx.fenceDist(spray(ball)) : 110;
    const ld = p ? Math.hypot(p.x, p.z) : d;
    if (!S.fence && fd && d > fd - 12 && t > 1.2) { S.fence = true; low('fence_q'); return; }
    if (!S.carry && !S.back && ld > hd + 8 && t > 1.0 && t < 2.6) { S.carry = true; low('fly_carry'); return; }
    if (!S.drop && p && ld < hd - 12 && t > 0.9) { S.drop = true; low('drop_q'); return; }
    if (!S.chase && p && def.fig && def.fig[f] && t > 1.0) {
      const fp = def.fig[f].root.position;
      if (Math.hypot(fp.x - p.x, fp.z - p.z) > 13) { S.chase = true; low('chase_q'); return; }
    }
  }
  if (b.type === 'grounder' && !of && !S.thq && !pl.fly) {
    const d = Math.hypot(ball.x, ball.z);
    if (d > 20 && d < 33 && t < 1.6) {
      const a = spray(ball), aS = spray(def.homeOf('SS')), a2 = spray(def.homeOf('2B')), a3 = spray(def.homeOf('3B')), a1 = spray(def.homeOf('1B'));
      const gapLeft = a > a3 + 5 && a < aS - 5, gapMid = a > aS + 5 && a < a2 - 5, gapRight = a > a2 + 5 && a < a1 - 5;
      if ((gapLeft || gapMid || gapRight) && rnd() < 0.7) { S.thq = true; low('through_q'); }
    }
  }
}

export function cmTick(def, pl) {
  // ノック: 投げる前のつなぎは無し。打球の種類ごとの一言だけ
  if (pl && def.kind === 'knock' && !def.ffw && !def.dg && ownScene(def) && pl.phase !== 'pre' && pl.contactT != null && pl.endT == null) { const S = pl._cmSaid || (pl._cmSaid = {}); kindTalk(def, pl, S, pl.t - pl.contactT); return; }
  if (!pl || def.kind !== 'game' || def.ffw || def.dg || !ownScene(def)) return;
  if (def._cmG !== def.g) { def._cmG = def.g; def._cmGameStarted = false; def._cmHalf = null; def._cmEnd = false; def._cmWon = false; }   // 新しい試合
  if (!pl._cmStart && def.g) pl._cmStart = { bases: (def.g.bases || []).slice(), outs: def.g.outs };
  if (pl.phase === 'pre') {
    if (!pl._cmGuard && pl.contactT != null && !pl.steal) {
      // 前のプレーの声が、この打球の打つ時刻まで残りそうなら、打つ 0.15 秒前に止める(打った瞬間に声を重ねない)
      pl._cmGuard = true;
      const left = pl.contactT - pl.t - 0.15, now = def.t || 0, V = vstate(def);
      for (const x of V.items) { if (x.start > now) { x.drop = 'contact'; } else if (x.end > now + left) { x.end = now + left; x.stopped = true; } }
      V.items = V.items.filter((x) => !x.drop); V.busy = V.items.reduce((m, x) => Math.max(m, x.end), now);
      const s = def.ctx && def.ctx.sound;
      if (s && s.voiceStopAt && s.ctx) s.voiceStopAt(s.ctx.currentTime + left);
    }
    if (!pl._cmPreDone && pl.t >= 0.04 && !pl.steal) { pl._cmPreDone = true; preTalk(def, pl); }
    return;
  }
  if (pl.contactT != null && def._cmContactPl !== pl) { def._cmContactPl = pl; def._cmContactAt = (def.t || 0) - (pl.t - pl.contactT); (def._cmContacts = def._cmContacts || []).push(+def._cmContactAt.toFixed(3)); if (def._cmContacts.length > 500) def._cmContacts.shift(); }
  if (pl.endT != null) return;
  liveTalk(def, pl);
}
