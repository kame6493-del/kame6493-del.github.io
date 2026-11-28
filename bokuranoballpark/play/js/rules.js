// 野球の規則と、守備の約束(誰が捕りに行き、誰がどの塁に入るか)。画面にも three.js にも依存しない。
// 守備の試合の「自動で進める打席」と、一人称の場面の判定の両方で使う。自動テストからも直接呼ぶ。
// 自分のチームは後攻(表の守り)。g.score.them = 先攻、g.score.us = 後攻。

// 11/28 お手玉・落球の失策を無くした(?bobble=1 で前の形。画面の無い試験では常に新しい形)
const OLD_BOBBLE = typeof location !== 'undefined' && /[?&]bobble=1/.test(location.search || '');
export const BASE_XZ = [[0, -0.22], [19.07, -19.4], [0, -38.8], [-19.07, -19.4]];
export const BASE_NAME = ['本塁', '一塁', '二塁', '三塁'];
const polar = (aDeg, d) => [d * Math.sin(aDeg * Math.PI / 180), -d * Math.cos(aDeg * Math.PI / 180)];
export const POS_XZ = {
  P: [0, -18.0], C: [0, 0.78],
  '1B': polar(37, 30), '2B': polar(14, 44), SS: polar(-14, 44), '3B': polar(-37, 30),
  LF: polar(-28, 84), CF: polar(0, 95), RF: polar(28, 84),
};
export const POS_LABEL = { P: '投手', C: '捕手', '1B': '一塁', '2B': '二塁', SS: '遊撃', '3B': '三塁', LF: '左翼', CF: '中堅', RF: '右翼' };
export const IF = ['P', '1B', '2B', 'SS', '3B'];
export const OF = ['LF', 'CF', 'RF'];
export const MAX_INNING = 12;

export function newGame() {
  return { inning: 1, half: 'top', outs: 0, bases: [false, false, false], score: { them: 0, us: 0 }, balls: 0, strikes: 0,
    over: false, result: null, log: [], hand: 'R', pa: 0, scenes: 0, line: { them: [], us: [] } };
}
const batting = (g) => (g.half === 'top' ? 'them' : 'us');

// ------------------------------------------------------------ 点・アウト・攻守交代
export function addRuns(g, n) {
  if (n <= 0 || g.over) return 0;
  g.score[batting(g)] += n;
  const L = g.line[batting(g)]; L[g.inning - 1] = (L[g.inning - 1] || 0) + n;
  checkWalkoff(g);
  return n;
}
// 9回以降の裏、後攻が勝ち越した瞬間に試合は終わる(サヨナラ)
export function checkWalkoff(g) {
  if (g.half === 'bottom' && g.inning >= 9 && g.score.us > g.score.them && !g.over) {
    g.over = true; g.result = 'サヨナラ勝ち';
    return true;
  }
  return false;
}
// 3 アウトで攻守交代。9回表が終わって後攻が勝っていれば裏はしない。延長は 12 回まで(同点なら引き分け)
export function endHalf(g) {
  g.outs = 0; g.bases = [false, false, false]; g.balls = 0; g.strikes = 0;
  if (g.over) return 'over';
  if (g.half === 'top') {
    if (!g.line.them[g.inning - 1]) g.line.them[g.inning - 1] = 0;
    if (g.inning >= 9 && g.score.us > g.score.them) { g.over = true; g.result = '勝ち'; return 'over'; }
    g.half = 'bottom';
    return 'bottom';
  }
  if (!g.line.us[g.inning - 1]) g.line.us[g.inning - 1] = 0;
  if (g.inning >= 9 && g.score.us !== g.score.them) { g.over = true; g.result = g.score.us > g.score.them ? '勝ち' : '負け'; return 'over'; }
  if (g.inning >= MAX_INNING) { g.over = true; g.result = '引き分け'; return 'over'; }
  g.inning++; g.half = 'top';
  return 'top';
}
export function addOuts(g, n) { g.outs = Math.min(3, g.outs + n); return g.outs; }

// ------------------------------------------------------------ フォースとタッチ
// 走者が「押し出される」(フォース)のは、後ろの塁が全部埋まっていて、打者走者が走るとき。
// outFrom: もうアウトになった走者の元の塁(0 = 打者)。後ろの走者がアウトになると、前の走者のフォースは外れる。
export function isForced(bases, b, outFrom = []) {
  if (b < 1 || b > 3 || !bases[b - 1]) return false;
  for (let k = 0; k < b; k++) {
    if (outFrom.includes(k)) return false;
    if (k > 0 && !bases[k - 1]) return false;
  }
  return true;
}
// 塁での判定。forced: その走者がフォースか。toGo: 走者が塁まであと何 m か(0 以下なら着いている)
// フォースは塁を踏めばアウト。それ以外は走者に触れないとアウトにならない(走者が遠ければ前の塁へ戻る)
export const TAG_REACH = 8.0;
export function playAtBase(forced, toGo) {
  if (toGo <= 0) return 'safe';
  if (forced) return 'force';
  if (toGo <= TAG_REACH) return 'tag';
  return 'back';
}
// フライを捕った後: 捕る前に離塁した走者は、元の塁へ戻る前に球が塁に着けばアウト
export function tagUpCheck(leftEarly, backBeforeBall) {
  return leftEarly && !backBeforeBall ? 'out' : 'ok';
}
// インフィールドフライ: 無死・一死で一二塁か満塁、内野の普通の飛球(捕れる高さのもの)。打者は捕る前からアウト
export function infieldFly(g, type, fielder) {
  return type === 'pop' && (IF.includes(fielder) || fielder === 'C') && g.outs < 2 && g.bases[0] && g.bases[1];
}
// 振り逃げ: 2ストライク後の第3ストライクを捕手が捕れなかったとき、一塁が空いているか 2 アウトなら打者は走れる
export function canRunDroppedThird(g) { return !g.bases[0] || g.outs === 2; }

// ------------------------------------------------------------ 進塁
// 押し出し(四球・死球・振り逃げで一塁へ)
export function forceAdvance(g) {
  const b = g.bases;
  let runs = 0;
  if (b[0] && b[1] && b[2]) runs = 1;
  if (b[0] && b[1]) b[2] = true;
  if (b[0]) b[1] = true;
  b[0] = true;
  addRuns(g, runs);
  return runs;
}
// 全員 n 個進む(暴投・捕逸・本塁打・エンタイトルツーベース)。batterTo: 打者の行き先(0 = 打者なし、4 = 生還)
export function advanceAll(g, n, batterTo = 0) {
  const nb = [false, false, false];
  let runs = 0;
  for (let b = 3; b >= 1; b--) {
    if (!g.bases[b - 1]) continue;
    const to = b + n;
    if (to >= 4) runs++; else nb[to - 1] = true;
  }
  if (batterTo >= 4) runs++; else if (batterTo > 0) nb[batterTo - 1] = true;
  g.bases = nb;
  addRuns(g, runs);
  return runs;
}

// ------------------------------------------------------------ 1 球ずつ
// 球の結果: ball / strike(見逃し・空振り) / foul / hbp / inplay
export function pitchKind(rng, g) {
  const r = rng();
  const two = g.strikes >= 2;
  if (r < 0.009) return 'hbp';
  if (r < 0.36) return 'ball';
  if (r < 0.47) return 'called';
  if (r < 0.535 + (two ? 0.01 : 0)) return 'swinging';
  if (r < 0.795 + (two ? 0.03 : 0)) return 'foul';
  return 'inplay';
}
// カウントに 1 球を足す。打席が終わればその内容を返す(終わらなければ null)
export function applyPitch(g, kind, rng = Math.random) {
  if (kind === 'hbp') { g.balls = g.strikes = 0; forceAdvance(g); return '死球'; }
  if (kind === 'ball') {
    if (g.bases.some(Boolean) && rng() < 0.025) { const r = advanceAll(g, 1); if (++g.balls >= 4) { g.balls = g.strikes = 0; forceAdvance(g); return '四球'; } return rng() < 0.5 ? `暴投で進塁${r ? ' ' + r + ' 点' : ''}` : `捕逸で進塁${r ? ' ' + r + ' 点' : ''}`; }
    if (++g.balls >= 4) { g.balls = g.strikes = 0; forceAdvance(g); return '四球'; }
    return null;
  }
  if (kind === 'foul') { if (g.strikes < 2) g.strikes++; return null; }   // 2 ストライク後のファウルは数えない
  if (kind === 'called' || kind === 'swinging') {
    if (g.strikes < 2) { g.strikes++; return null; }
    g.balls = g.strikes = 0;
    // 第3ストライクを捕手が捕れなかった(空振りのワンバウンドなど)
    if (kind === 'swinging' && rng() < 0.05 && canRunDroppedThird(g)) {
      if (rng() < 0.82) { addOuts(g, 1); return '振り逃げ(一塁でアウト)'; }
      forceAdvance(g);
      return '振り逃げで出塁';
    }
    addOuts(g, 1);
    return kind === 'called' ? '見逃し三振' : '空振り三振';
  }
  return null;
}

// ------------------------------------------------------------ 打球の種類と行き先
const W_GROUND = { P: 6, '1B': 14, '2B': 22, SS: 24, '3B': 18 };
const W_AIR = { LF: 30, CF: 32, RF: 30, SS: 4, '2B': 4 };
const W_POP = { '1B': 18, '2B': 16, SS: 16, '3B': 18, C: 14, P: 6 };
function pickW(rng, W, skip) {
  const ks = Object.keys(W).filter((k) => k !== skip);
  let s = ks.reduce((a, k) => a + W[k], 0) * rng();
  return ks.find((k) => (s -= W[k]) <= 0) || ks[0];
}
// 打球を 1 つ決める。type: grounder | liner | fly | pop | bunt | foulfly | hr。hit は安打になるか(自動の打席だけで使う)
export function chooseBIP(rng, g, prefer) {
  const r = rng();
  const buntOk = g.outs < 2 && (g.bases[0] || g.bases[1]) && !g.bases[2] && g.half === 'top';
  let type;
  if (buntOk && r < 0.12) type = 'bunt';
  else if (r < 0.50) type = 'grounder';
  else if (r < 0.68) type = 'liner';
  else if (r < 0.90) type = 'fly';
  else if (r < 0.95) type = 'pop';
  else if (r < 0.975) type = 'foulfly';
  else type = 'hr';
  let zone;
  if (type === 'grounder') zone = pickW(rng, W_GROUND);
  else if (type === 'bunt') zone = pickW(rng, { P: 3, '1B': 3, '3B': 4, C: 1 });
  else if (type === 'pop') zone = pickW(rng, W_POP);
  else if (type === 'foulfly') zone = pickW(rng, { C: 3, '1B': 3, '3B': 3, LF: 2, RF: 2 });
  else if (type === 'hr') zone = pickW(rng, { LF: 1, CF: 1, RF: 1 });
  else zone = pickW(rng, type === 'liner' ? { ...W_AIR, '3B': 5, '1B': 5, SS: 7, '2B': 7, P: 2 } : W_AIR);
  // 左打者は引っ張りが一塁・右翼側: 右打者の重みを左右に映す(三塁↔一塁・遊撃↔二塁・左翼↔右翼)
  if (g.hand === 'L') zone = { '3B': '1B', '1B': '3B', SS: '2B', '2B': 'SS', LF: 'RF', RF: 'LF' }[zone] || zone;
  if (prefer && rng() < prefer.p && prefer.types.includes(type) === false) { /* そのまま */ }
  const hitP = { grounder: 0.24, liner: 0.68, fly: 0.19, pop: 0.02, bunt: 0.08, foulfly: 0, hr: 1 }[type];
  const hit = type === 'hr' || rng() < hitP;
  return { type, zone, hit, hand: g.hand };
}

// ------------------------------------------------------------ 自動の打席の結果(規則どおりに進塁・アウト)
export function resolveBIP(g, bip, rng) {
  const { type, zone } = bip;
  const lab = POS_LABEL[zone];
  const b = g.bases;
  if (type === 'hr') { const r = advanceAll(g, 4, 4); return `本塁打 ${r} 点`; }
  if (bip.hit && OF.includes(zone) && type !== 'bunt') {
    if (rng() < 0.03) { const r = advanceAll(g, 2, 2); return `エンタイトルツーベース${r ? ' ' + r + ' 点' : ''}`; }
    const kind = type === 'fly' || rng() < 0.22 ? (rng() < 0.12 ? 3 : 2) : 1;
    let runs = 0; const nb = [false, false, false];
    if (kind === 3) { runs = b.filter(Boolean).length; nb[2] = true; g.bases = nb; addRuns(g, runs); return `${lab}への三塁打${runs ? ' ' + runs + ' 点' : ''}`; }
    if (kind === 2) {
      runs = (b[2] ? 1 : 0) + (b[1] ? 1 : 0);
      if (b[0]) { if (rng() < 0.4 || g.outs === 2) runs++; else nb[2] = true; }
      nb[1] = true; g.bases = nb; addRuns(g, runs); return `${lab}への二塁打${runs ? ' ' + runs + ' 点' : ''}`;
    }
    runs = b[2] ? 1 : 0;
    if (b[1]) { if (rng() < (g.outs === 2 ? 0.8 : 0.55)) runs++; else nb[2] = true; }
    if (b[0]) { if (!nb[2] && zone === 'RF' && rng() < 0.35) nb[2] = true; else nb[1] = true; }
    nb[0] = true; g.bases = nb; addRuns(g, runs);
    return `${lab}前ヒット${runs ? ' ' + runs + ' 点' : ''}`;
  }
  if (bip.hit && (type === 'grounder' || type === 'liner') && rng() < (type === 'grounder' ? 0.72 : 0.9)) {
    // 内野を抜けた安打(三遊間・二遊間・一二塁間)は外野の前のヒットとして進塁
    const thru = { '3B': 'LF', SS: rng() < 0.6 ? 'LF' : 'CF', P: 'CF', '2B': rng() < 0.5 ? 'CF' : 'RF', '1B': 'RF', C: 'CF' }[zone] || 'CF';
    return resolveBIP(g, { ...bip, zone: thru, type: 'grounder' }, rng);
  }
  if (bip.hit) {   // 内野安打・ポテンヒット
    const runs = (b[2] ? 1 : 0);
    const nb = [true, b[0], b[1]]; g.bases = nb; addRuns(g, runs);
    return `${lab}${type === 'fly' || type === 'pop' ? '後方へのポテンヒット' : 'への内野安打'}${runs ? ' ' + runs + ' 点' : ''}`;
  }
  // 失策(高校野球は 1 試合 1 チームあたり 0.5〜1 個ほど): 打者は一塁へ、走者は 1 つ進む
  // 11/28 持ち主「落球お手玉要らない」: ゴロをはじく・落球の失策は起こさない(乱数は前と同じだけ引く)。?bobble=1 で前の形
  if ((type === 'grounder' || type === 'fly' || type === 'liner') && rng() < 0.03 && OLD_BOBBLE) {
    const runs = b[2] ? 1 : 0; g.bases = [true, b[0], b[1]]; addRuns(g, runs);
    return `${lab}の${type === 'grounder' ? 'エラー(ゴロをはじく)' : 'エラー(落球)'}${runs ? ' ' + runs + ' 点' : ''}`;
  }
  // ここからアウトになる打球
  if (type === 'foulfly') { addOuts(g, 1); return `${lab}がファウルフライを捕球`; }
  if (type === 'pop') {
    const iff = infieldFly(g, 'pop', zone);
    addOuts(g, 1);
    return iff ? 'インフィールドフライ(打者アウト)' : `${lab}への小飛球`;
  }
  if (type === 'liner') {
    addOuts(g, 1);
    const on = [1, 2, 3].filter((x) => b[x - 1]);
    if (on.length && g.outs < 3 && rng() < 0.08) { const x = on[on.length - 1]; b[x - 1] = false; addOuts(g, 1); return `${lab}ライナー 飛び出した走者もアウト(併殺)`; }
    return `${lab}ライナー`;
  }
  if (type === 'fly') {
    addOuts(g, 1);
    let text = `${lab}フライ`;
    if (g.outs < 3) {
      if (b[2] && rng() < (zone === 'CF' ? 0.8 : 0.7)) { b[2] = false; addRuns(g, 1); text += '(犠牲フライ)'; }
      if (b[1] && !b[2] && rng() < (zone === 'RF' ? 0.5 : 0.25)) { b[1] = false; b[2] = true; text += ' 二塁走者がタッチアップで三塁へ'; }
    }
    return text;
  }
  if (type === 'bunt') {
    if (rng() < 0.82) {   // 送りバント成功(打者は一塁でアウト、走者は進む)
      addOuts(g, 1);
      if (g.outs < 3) { const nb = [false, b[0], b[1] || false]; if (b[2]) addRuns(g, 1); g.bases = nb; }
      return '送りバント';
    }
    const lead = b[1] ? 2 : 1;   // 先の走者をフォースアウト
    b[lead - 1] = false; addOuts(g, 1);
    const nb = [true, b[0] && lead !== 1 ? true : false, b[2] || (lead === 2 ? false : b[1])];
    g.bases = nb;
    return `バント(${BASE_NAME[lead + 1 > 3 ? 3 : lead + 1]}でフォースアウト)`;
  }
  // ゴロ
  const outsBefore = g.outs;
  if (b[0] && outsBefore < 2 && rng() < 0.4) {
    // 併殺(二塁でフォース → 一塁でフォース)。3 アウト目がフォースなので、その間の得点は入らない
    const r3 = b[2], r2 = b[1];
    addOuts(g, 2);
    g.bases = [false, false, false];
    if (g.outs < 3) { if (r2) g.bases[2] = true; if (r3) addRuns(g, 1); }
    return `${lab}ゴロ 併殺`;
  }
  if (b[0] && rng() < 0.3) {
    // 野選気味: 先の走者を二塁でフォースアウト、打者は一塁に残る
    addOuts(g, 1);
    const r3 = b[2], r2 = b[1];
    g.bases = [true, false, false];
    if (g.outs < 3) { if (r2) g.bases[2] = true; if (r3 && !(r2 && b[0])) addRuns(g, 1); else if (r3) g.bases[2] = true; }
    return `${lab}ゴロ 二塁でフォースアウト`;
  }
  // 打者が一塁でアウト。フォースでない走者は進めることがある。3 アウト目なら得点なし
  addOuts(g, 1);
  if (g.outs < 3) {
    const nb = [false, b[0], false];
    let runs = 0;
    if (b[2]) { if ((rng() < 0.55 && outsBefore < 2) || (b[0] && b[1])) runs++; else nb[2] = true; }
    if (b[1]) { if (!nb[2] && (rng() < 0.6 || b[0])) nb[2] = true; else if (!nb[2]) nb[2] = false, nb[1] = nb[1] || true; }
    g.bases = nb; addRuns(g, runs);
    return `${lab}ゴロ${b.some(Boolean) ? ' 走者は進塁' : ''}${runs ? ' ' + runs + ' 点' : ''}`;
  }
  return `${lab}ゴロ`;
}

// 盗塁(一塁走者、二塁が空いている)。成功 70%
// 盗塁: 一塁だけ・2 アウト未満。終盤で 3 点以上の差(大差)では控える
export function stealChance(g) { return g.bases[0] && !g.bases[1] && g.outs < 2 && !(g.inning >= 7 && Math.abs(g.score.us - g.score.them) >= 3); }
export function resolveSteal(g, rng) {
  g.bases[0] = false;
  if (rng() < 0.7) { g.bases[1] = true; return '盗塁成功'; }
  addOuts(g, 1); return '盗塁失敗(二塁でタッチアウト)';
}

// 1 打席を、打球が飛ぶ所まで(または打席が終わるまで)1 球ずつ進める。
// 戻り値: { kind: 'done', text } / { kind: 'inplay', bip } / { kind: 'steal' }(盗塁の場面を一人称で遊ぶとき)
export function simulatePA(g, rng, hooks = {}) {
  // cont: ファウルフライを落とした後など、同じ打者の打席を続ける
  if (!hooks.cont) { g.balls = 0; g.strikes = 0; g.hand = rng() < 0.35 ? 'L' : 'R'; }
  const notes = [];
  for (let n = 0; n < 40; n++) {
    if (g.over || g.outs >= 3) return { kind: 'done', text: notes.join('・') };
    if (stealChance(g) && rng() < 0.035) {
      if (hooks.steal && hooks.steal()) return { kind: 'steal', notes };
      notes.push(resolveSteal(g, rng));
      if (g.outs >= 3) return { kind: 'done', text: notes.join('・') };
    }
    const k = pitchKind(rng, g);
    if (k === 'inplay') return { kind: 'inplay', bip: chooseBIP(rng, g), notes };
    if (k === 'foul' && hooks.foul && hooks.foul()) return { kind: 'foul', notes };
    const res = applyPitch(g, k, rng);
    if (res && /暴投|捕逸/.test(res)) { notes.push(res); continue; }
    if (res) { notes.push(res); return { kind: 'done', text: notes.join('・') }; }
  }
  return { kind: 'done', text: notes.join('・') };
}
// 半イニングを全部自動で(自分のチームの攻撃など)。得点と出来事を返す
export function simulateHalf(g, rng) {
  const before = g.score[batting(g)];
  const events = [];
  for (let i = 0; i < 30 && g.outs < 3 && !g.over; i++) {
    g.pa++;
    const r = simulatePA(g, rng);
    let t = r.text;
    if (r.kind === 'inplay') t = [...(r.notes || []), resolveBIP(g, r.bip, rng)].join('・');
    if (t) events.push(t);
  }
  g.halfEvents = events;
  return { runs: g.score[batting(g)] - before, events };
}

// ------------------------------------------------------------ 守備位置(打者の左右・走者・点差で少し変える)
export function alignment(g) {
  const off = {}; const tags = [];
  const lead = g.score.us - g.score.them;   // 守っている側(後攻)から見た点差
  const r1 = g.bases[0], r3 = g.bases[2];
  const late = g.inning >= 7;
  const add = (k, dx, dz) => { const o = off[k] || (off[k] = [0, 0]); o[0] += dx; o[1] += dz; };
  const toward = (k, tx, tz, m) => { const p = POS_XZ[k]; const dx = tx - p[0], dz = tz - p[1]; const l = Math.hypot(dx, dz) || 1; add(k, dx / l * m, dz / l * m); };
  // 打者の向き(右打者は三塁側へ引っ張りやすい)
  const pull = g.hand === 'L' ? 1 : -1;
  for (const k of OF) add(k, pull * 2.5, 0);
  for (const k of ['2B', 'SS']) add(k, pull * 1.0, 0);
  if (r3 && g.outs < 2 && late && Math.abs(lead) <= 1) {
    tags.push('前進守備');
    for (const k of ['1B', '2B', 'SS', '3B']) toward(k, 0, 0, 5);
  } else if (r1 && g.outs < 2) {
    tags.push('ゲッツー態勢');
    for (const k of ['2B', 'SS']) { toward(k, BASE_XZ[2][0], BASE_XZ[2][1], 2.5); toward(k, 0, 0, 1.5); }
  }
  if (late && lead > 0 && lead <= 2) {
    tags.push('長打警戒');
    for (const k of OF) toward(k, 0, 0, -6);
    toward('1B', BASE_XZ[1][0] + 3, BASE_XZ[1][1] + 3, 1.5); toward('3B', BASE_XZ[3][0] - 3, BASE_XZ[3][1] + 3, 1.5);
  }
  if (g.strikes === 2 && !tags.length) for (const k of OF) toward(k, 0, 0, 1.5);   // 2ストライクは少し前へ
  return { off, tags };
}

// ------------------------------------------------------------ 守備の約束: 打球ごとに 9 人の役目
// s = { type, zone, bases, outs, hand, hit }。戻り値 { 守備位置: { role, base?, cutFor?, why } }
// role: field(捕りに行く) / base(塁に入る) / cut(中継) / backup(バックアップ) / charge(前に出る) / none
export function coverPlan(s) {
  const P = {}; const set = (k, role, o = {}) => { if (!P[k]) P[k] = { role, ...o }; };
  const [r1, r2] = s.bases;
  const z = s.zone;
  if (s.type === 'steal') {
    // 右打者のときは二塁手、左打者のときは遊撃手が二塁に入る
    const cov = s.hand === 'L' ? 'SS' : '2B';
    set(cov, 'base', { base: 2, why: '二塁ベースに入る(盗塁)' });
    set(cov === 'SS' ? '2B' : 'SS', 'backup', { base: 2, why: '二塁のバックアップ' });
    set('CF', 'backup', { base: 2, why: '二塁のバックアップ' });
    set('C', 'field', { why: '二塁へ送球' });
    set('1B', 'base', { base: 1 }); set('3B', 'base', { base: 3 });
    return P;
  }
  set(z, 'field', { why: '打球を捕る' });
  // 捕手: 二・三塁に走者がいない内野ゴロは一塁線の後ろへバックアップ(走者一塁でも、併殺の一塁送球のため)
  if (!s.bases[1] && !s.bases[2] && !OF.includes(z) && s.type !== 'bunt' && z !== 'C') set('C', 'backup', { base: 1, line: true, why: '一塁のバックアップ(一塁線の後ろ)' });
  set('C', 'base', { base: 0 });
  if (s.type === 'bunt') {
    for (const k of ['P', '1B', '3B']) set(k, 'charge', { why: '前に出てバント処理' });
    set('2B', 'base', { base: 1, why: '一塁ベースカバー(バント)' });
    set('SS', 'base', { base: 2, why: '二塁ベースに入る(バント)' });
    set('LF', 'backup', { base: 3, why: '三塁のバックアップ' });
    set('CF', 'backup', { base: 2, why: '二塁のバックアップ' });
    set('RF', 'backup', { base: 1, why: '一塁のバックアップ' });
    return P;
  }
  const ofBall = OF.includes(z);
  if (ofBall && s.hit) {
    // 外野の安打: 先の走者を止める塁へ返す。中継は「外野手と返す塁を結ぶ線」の上
    const tb = r2 ? 0 : r1 ? 3 : 2;
    let cut;
    if (tb === 0) cut = z === 'LF' ? '3B' : '1B';     // 本塁への返球: 左翼からは三塁手、中堅・右翼からは一塁手が中継
    else if (tb === 3) cut = 'SS';
    else cut = z === 'RF' ? '2B' : 'SS';
    set(cut, 'cut', { base: tb, why: tb === 0 ? '本塁への中継に入る' : '中継に入る' });
    // 塁に入る: 中継に出た人の塁は、となりの内野手が埋める
    if (cut === '3B') { set('SS', 'base', { base: 3, why: '三塁ベースに入る' }); set('2B', 'base', { base: 2, why: '二塁ベースに入る' }); set('1B', 'base', { base: 1, why: '一塁ベースに入る' }); }
    else if (cut === '1B') { set('2B', 'base', { base: 1, why: '一塁ベースに入る' }); set('SS', 'base', { base: 2, why: '二塁ベースに入る' }); set('3B', 'base', { base: 3, why: '三塁ベースに入る' }); }
    else if (cut === 'SS') { set('2B', 'base', { base: 2, why: '二塁ベースに入る' }); set('1B', 'base', { base: 1, why: '一塁ベースに入る' }); set('3B', 'base', { base: 3, why: '三塁ベースに入る' }); }
    else { set('SS', 'base', { base: 2, why: '二塁ベースに入る' }); set('1B', 'base', { base: 1, why: '一塁ベースに入る' }); set('3B', 'base', { base: 3, why: '三塁ベースに入る' }); }
    if (!s.bases.some(Boolean)) set('P', 'backup', { mid: true, why: 'マウンドと二塁の間へ(中継の後ろ)' });
    else set('P', 'backup', { base: tb === 0 ? 0 : 3, why: tb === 0 ? '本塁のバックアップ' : '三塁のバックアップ' });
    if (z === 'RF' && tb === 3) set('LF', 'backup', { base: 3, why: '三塁のバックアップ' });
    // となりの外野手は打球を追った外野手の後ろ
    const nb = z === 'CF' ? (s.hand === 'L' ? 'RF' : 'LF') : 'CF';
    set(nb, 'backup', { of: z, why: 'となりの外野のバックアップ' });
    for (const k of OF) set(k, 'backup', { base: 2, why: '二塁のバックアップ' });
    return P;
  }
  if (ofBall) {
    // 外野フライ: となりの外野手がバックアップ。三塁走者がいれば本塁への中継
    const nb = z === 'CF' ? (s.hand === 'L' ? 'RF' : 'LF') : 'CF';
    set(nb, 'backup', { of: z, why: 'となりの外野のバックアップ' });
    if (s.bases[2] && s.outs < 2) set(z === 'LF' ? '3B' : '1B', 'cut', { base: 0, why: '本塁への中継に入る(タッチアップ)' });
    set('1B', 'base', { base: 1 }); set('3B', 'base', { base: 3 });
    set(z === 'RF' ? '2B' : 'SS', 'cut', { base: 2, why: '中継に入る' });
    set(z === 'RF' ? 'SS' : '2B', 'base', { base: 2, why: '二塁ベースに入る' });
    set('P', 'backup', { base: s.bases[2] ? 0 : 3, why: '本塁のバックアップ' });
    for (const k of OF) set(k, 'backup', { base: 2, why: '二塁の後ろ(中堅寄り)へ寄る' });
    return P;
  }
  // 内野の打球(ゴロ・ライナー・小飛球)
  if (z === '1B') set('P', 'base', { base: 1, why: '一塁ベースカバー' });
  else set('1B', 'base', { base: 1, why: '一塁ベースに入る' });
  const twoCover = (z === 'SS' || z === '3B') ? '2B' : 'SS';   // 二塁へは、打球と反対側の二遊間が入る
  if (z !== twoCover) set(twoCover, 'base', { base: 2, why: r1 && s.outs < 2 ? '二塁ベースカバー(併殺)' : '二塁ベースに入る' });
  if (z === '3B') set('SS', 'base', { base: 3, why: '三塁ベースに入る' });
  else set('3B', 'base', { base: 3, why: '三塁ベースに入る' });
  set('RF', 'backup', { base: 1, why: '一塁のバックアップ' });
  set('CF', 'backup', { base: 2, why: '二塁のバックアップ' });
  set('LF', 'backup', { base: 3, why: '三塁のバックアップ' });
  set('P', 'backup', { toward1B: true, why: '一塁線寄りへ数歩(一塁のカバーの用意)' });
  set('2B', 'backup', { base: z === 'P' || z === 'C' ? 2 : 1, near: true, why: z === 'P' || z === 'C' ? '二塁の後ろ寄りへ' : '一塁の後ろ寄りへ' });
  set('SS', 'none');
  return P;
}
// 役目ごとの立つ点(x, z)
export function roleSpot(role, k, zone) {
  const B = BASE_XZ;
  if (role.role === 'base') return role.base === 0 ? [0.25, -1.0] : B[role.base].slice();   // 本塁は前のフェア側で受ける(走路をふさがない)
  if (role.role === 'cut') {
    const of = POS_XZ[zone] || POS_XZ.CF, b = B[role.base];
    const f = role.base === 0 ? 0.36 : 0.42;
    return [b[0] + (of[0] - b[0]) * f, b[1] + (of[1] - b[1]) * f];
  }
  if (role.role === 'backup') {
    if (role.mid) return [0, -29];   // マウンドと二塁の間
    if (role.toward1B) return [5.5, -15];   // 投手: 一塁線寄りへ数歩
    if (role.near) { const b = B[role.base]; return role.base === 1 ? [b[0] + 4, b[1] - 6] : [b[0] + 3, b[1] - 6]; }
    if (role.line) { const b = B[1], l = Math.hypot(b[0], b[1]); return [b[0] + b[0] / l * 9 + 2.2, b[1] + b[1] / l * 9 + 2.2]; }   // 一塁線のファウル側、一塁の約 9 m 後ろ
    if (role.of) { const o = POS_XZ[role.of], me = POS_XZ[k]; const l = Math.hypot(o[0], o[1]); return [o[0] + (me[0] - o[0]) * 0.25 - o[0] / l * 10, o[1] + (me[1] - o[1]) * 0.25 - o[1] / l * 10]; }
    // 投げてくる方向の延長線上(塁の 10〜12 m 後ろ)
    const b = B[role.base];
    const from = role.base === 0 ? (zone && POS_XZ[zone] && OF.includes(zone) ? POS_XZ[zone] : [0, -30]) : role.base === 1 ? POS_XZ.SS : role.base === 2 ? (zone && POS_XZ[zone] ? [0, 0] : [0, 0]) : POS_XZ['1B'];
    const dx = b[0] - from[0], dz = b[1] - from[1], l = Math.hypot(dx, dz) || 1;
    return [b[0] + dx / l * 11, b[1] + dz / l * 11];
  }
  if (role.role === 'charge') { const p = POS_XZ[k]; return [p[0] * 0.45, Math.max(p[1] * 0.45, -12)]; }
  return null;
}
