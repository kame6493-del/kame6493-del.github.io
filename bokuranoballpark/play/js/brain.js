// 走者の判断と守備の連係の「頭」(11/18 夜)。three.js にも画面にも依存しない、数と座標だけの関数。
// 根拠の表は docs/プロの判断の知識.md、組み込み方は docs/判断の組み込み手順.md、試験は tools/braintest.mjs。
//
// 座標は rules.js と同じ: 地面の (x, z)、本塁 (0,-0.22)、二塁 (0,-38.8)、外野は -z の向き、一塁は +x。
// 時間は秒、距離は m、速さは m/s。走者は「from 塁から to 塁へ、from 塁から dist m」で表す(defense.js と同じ)。
//
// 入口は 6 つ:
//   runnersAtContact(st)   打った瞬間の走者ごとの最初の動き(行く・止まる・戻る・ハーフウェイ・タッチアップの構え)
//   runnersTick(st)        毎こま(0.1〜0.2 秒ごとでよい)の見直し(次の塁を狙う・止まる・戻る・挟まれた時の動き)
//   tagupDecision(o)       フライを捕った瞬間: タッチアップで次の塁へ行くか
//   defenseAssign(st)      打球ごと・状況ごとの 9 人の役目と行き先
//   outfieldThrow(o)       外野手が拾った時: どこへ・中継を通すか・中継への声(カット/そのまま)
//   rundownPlan(o)         挟殺の守備側(誰が追い、誰が受け、いつ投げるか)と走者側(時間かせぎ)

export const L = 27.43;                                         // 塁間
export const BASE = [[0, -0.22], [19.07, -19.4], [0, -38.8], [-19.07, -19.4]];
export const HOME_RECV = [0.25, -1.0];
export const POS0 = (() => {
  const p = (a, d) => [d * Math.sin(a * Math.PI / 180), -d * Math.cos(a * Math.PI / 180)];
  return { P: [0, -18.0], C: [0, 0.78], '1B': p(37, 30), '2B': p(14, 44), SS: p(-14, 44), '3B': p(-37, 30), LF: p(-28, 84), CF: p(0, 95), RF: p(28, 84) };
})();
const OFS = ['LF', 'CF', 'RF'];
const IFS = ['P', '1B', '2B', 'SS', '3B'];
const ALL = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];

// プロの目安の数(docs/プロの判断の知識.md の「数の表」)。ゲームの水準(高校生)に合わせる時は呼ぶ側で上書きする
export const PRO = {
  runSpeed: 8.2,          // 走者の最高速(MLB の Sprint Speed 平均 27 ft/s)
  batterSpeed: 7.8,       // 打者走者(振り終わりから。本塁→一塁 4.2〜4.3 秒)
  turnLoss: 0.25,         // 塁を回る時に失う時間(ふくらんで回る)
  startLoss: 0.2,         // 止まった所からの出遅れ(タッチアップは捕球を見てから)
  arm: { LF: 37, CF: 38.5, RF: 40, IF: 36, C: 36, P: 34 },   // 送球の初速(m/s)。外野の平均 約 87 mph = 39 m/s
  exchangeOF: { charge: 0.75, flat: 0.95, back: 1.3, side: 1.15 },  // 外野手が拾って(捕って)放すまで、体の向き別
  exchangeIF: 0.65, relay: 0.55, tagTime: 0.15,
  secondaryLead: { 1: 5.5, 2: 6.5, 3: 4.5 },   // 投球に合わせた第二リード後の離塁(m)
  twoOutJump: 1.5,        // 2 アウトは打った瞬間にスタート(打球を見る間の分だけ得)
};

const hyp = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const norm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
const dist0 = (p) => hyp(p, BASE[0]);

// 長い送球ほど山なり・ワンバウンドで、平均の速さは初速より落ちる(30 m で 0.82 倍、80 m で 0.70 倍)
export function throwTime(d, v0) {
  const f = clamp(0.82 - (d - 30) * 0.0024, 0.66, 0.84);
  return d / (v0 * f);
}
// 外野手の拾い方: 動いている向き(vel)と送球先の向きの角度で、持ち替えの時間が変わる
export function exchangeFor(pos, vel, target, P = PRO) {
  const sp = Math.hypot(vel ? vel[0] : 0, vel ? vel[1] : 0);
  if (sp < 1.0) return P.exchangeOF.flat;
  const t = norm([target[0] - pos[0], target[1] - pos[1]]), v = [vel[0] / sp, vel[1] / sp];
  const c = t[0] * v[0] + t[1] * v[1];
  if (c > 0.5) return P.exchangeOF.charge;            // 送球先へ向かって勢いがある(前進して捕る)
  if (c < -0.5) return P.exchangeOF.back;             // 送球先から遠ざかる向き(背走・フェンス方向)
  return P.exchangeOF.side;                           // 横に流れながら(体を止めて向き直す)
}
// 走者が base へ着く時刻(今から)。from 塁から dist m、途中で回る塁の数ぶん turnLoss
export function runnerTime(r, base, P = PRO) {
  const sp = r.speed || (r.isBatter ? P.batterSpeed : P.runSpeed);
  let d = L - (r.dist || 0), b = (r.from + 1) % 4, turns = 0;
  while (b !== base % 4) { d += L; b = (b + 1) % 4; turns++; if (turns > 3) return Infinity; }
  return d / sp + turns * P.turnLoss + (r.running ? 0 : P.startLoss);
}
// ボールが base に届く時刻(今から)。ball = { holder, holderPos, holderVel, holderKind:'OF'|'IF'|'C'|'P', pickT, pickPos, pickVel, throwTo, throwEta, arm }
export function ballTime(ball, base, P = PRO) {
  const tgt = base === 0 ? HOME_RECV : BASE[base];
  if (ball.throwTo != null) {
    if (ball.throwTo === base) return ball.throwEta;
    // ほかの塁(か中継)へ投げている: 受けて投げ直す
    const rp = ball.throwToPos || BASE[ball.throwTo] || HOME_RECV;
    return ball.throwEta + P.relay + (ball.throwTo === 0 ? 0.5 : 0) + throwTime(hyp(rp, tgt), P.arm.IF);   // 本塁へ投げた: 捕手はタッチの後に投げ直す
  }
  const pos = ball.holder ? ball.holderPos : ball.pickPos, t0 = ball.holder ? 0 : (ball.pickT || 0);
  if (!pos) return 99;
  const kind = ball.holderKind || 'OF';
  const ex = kind === 'OF' ? exchangeFor(pos, ball.holder ? ball.holderVel : ball.pickVel, tgt, P) : P.exchangeIF;
  const d = hyp(pos, tgt), v0 = ball.arm || (kind === 'OF' ? P.arm.CF : P.arm.IF);
  // 外野から 60 m を超える送球は中継を通す(中継は直線上なので、届く時刻はほぼ同じ+持ち替え 0.55 の半分ほど)
  const relayCost = kind === 'OF' && d > 60 ? 0.3 : 0;
  return t0 + ex + throwTime(d, v0) + relayCost;
}

// ------------------------------------------------------------------ 打った瞬間
// st = { outs, bases:[b1,b2,b3], batted:{ type:'grounder'|'liner'|'fly'|'pop'|'bunt', zone, land:[x,z], hang, foul },
//        infieldIn, late (終盤の1点勝負), hitAndRun, runners:[{ base, speed }] }
// 返り値: base ごと { act:'go'|'stop'|'back'|'half'|'tagup'|'freeze', to, halfDist, why }
export function runnersAtContact(st, P = PRO) {
  const out = {}, b = st.batted, z = b.zone, two = st.outs >= 2;
  const isForced = (base) => { let k = 1; while (k < base) { if (!st.bases[k - 1]) return false; k++; } return true; };
  for (let base = 1; base <= 3; base++) {
    if (!st.bases[base - 1]) continue;
    const f = isForced(base);
    let d;
    if (b.foul && (b.type === 'fly' || b.type === 'pop')) d = { act: 'tagup', to: base, why: 'ファウルの飛球: 塁に戻って捕球を待つ(捕られてもタッチアップできる)' };
    else if (two && b.type !== 'bunt') d = { act: 'go', to: base + 1, why: '2アウト: 打った瞬間に全力(ハーフウェイもタッチアップもしない)' };
    else if (b.type === 'liner') d = { act: 'freeze', to: base, why: 'ライナー: その場で止まって戻れる体勢(抜けたのを見てから行く。ライナーバック)' };
    else if (b.type === 'pop') d = { act: 'back', to: base, why: '内野の飛球: 塁に戻る(進めない)' };
    else if (b.type === 'fly') d = flyStance(st, base, P);
    else if (b.type === 'bunt') d = f ? { act: 'go', to: base + 1, why: 'バント: フォースの走者は転がったのを見て進む' }
      : base === 2 ? { act: 'go', to: 3, why: '二塁走者(フォースでない): 三塁側に転がったら三塁手が出たのを見て行く' } : { act: 'stop', to: 3, why: '三塁走者: バントでは止まる(スクイズのサインが無ければ)' };
    else d = groundStance(st, base, f, P);
    if (st.hitAndRun && base === 1 && !two && b.type !== 'liner' && b.type !== 'fly' && b.type !== 'pop') d = { act: 'go', to: 2, why: 'エンドラン: 投球と同時にスタート済み、打球を見て三塁も' };
    out[base] = d;
  }
  return out;
}
function groundStance(st, base, forced, P) {
  const z = st.batted.zone;
  if (forced) return { act: 'go', to: base + 1, why: 'ゴロ・フォース: 進むしかない(ゴロゴー)' };
  if (base === 2) {
    // 二塁走者: 自分の前(遊撃・三塁)のゴロは止まる、自分の後ろ・右(一塁・二塁)へのゴロは三塁へ
    if (['1B', '2B'].includes(z) || OFS.includes(z)) return { act: 'go', to: 3, why: '二塁走者: 自分の後ろ(右側)のゴロは三塁へ' };
    if (z === 'P') return { act: 'stop', to: 2, why: '二塁走者: 投手前のゴロは投手が見てから(止まる)' };
    return { act: 'stop', to: 2, why: '二塁走者: 自分の前・左(遊撃・三塁)のゴロは止まる(投げたのを見て三塁を狙う)' };
  }
  // 三塁走者(フォースでない)
  if (st.infieldIn && !st.late) return { act: 'stop', to: 3, why: '三塁走者: 前進守備のゴロは止まる(抜けたら行く)' };
  if (st.infieldIn && st.late) return { act: 'stop', to: 3, why: '三塁走者: 前進守備・終盤も、ゴロゴーのサインが無ければ止まる' };
  if (z === 'P' || z === '3B') return { act: 'stop', to: 3, why: '三塁走者: 投手・三塁へのゴロは本塁が近い(止まる)' };
  return { act: 'go', to: 4, why: '三塁走者: 中間・後ろの守備で二遊間・一塁側のゴロはゴロゴー(1点と引き換えにアウト1つ)' };
}
// フライの構え: 捕られた時に戻れる距離までだけ出る(ハーフウェイの距離は計算で決める)
function flyStance(st, base, P) {
  const b = st.batted, land = b.land || POS0[b.zone] || POS0.CF;
  const depth = dist0(land), of = OFS.includes(b.zone);
  if (!of) return { act: 'back', to: base, why: '内野のフライ: 塁に戻る' };
  // タッチアップが届くかを先に見る(深いフライは塁で構える)
  const tu = tagupDecision({ base, catchPos: land, catchVel: [0, 0], arm: st.arm || P.arm[b.zone], outs: st.outs, runnerSpeed: st.runners && st.runners[base] && st.runners[base].speed }, P);
  if (base === 3) return { act: 'tagup', to: 3, why: `三塁走者: 外野フライは必ず塁に戻って構える(${tu.go ? '深い: 捕球で本塁へ' : '浅い: 様子を見る'})` };
  if (tu.go && (base === 2 || depth > 92)) return { act: 'tagup', to: base, why: `${base === 2 ? '二塁' : '一塁'}走者: 深いフライ(${Math.round(depth)}m)は塁に戻ってタッチアップの構え` };
  // ハーフウェイ: 捕られてから戻る時間 < 外野手が元の塁へ投げる時間 になる所まで
  const tBack = ex0(P) + throwTime(hyp(land, BASE[base]), st.arm || P.arm[b.zone] || 38);
  const sp = (st.runners && st.runners[base] && st.runners[base].speed) || P.runSpeed;
  let half = clamp((tBack - 0.45) * sp * 0.85, 2.5, 0.55 * L);
  if (depth < 62) half = Math.min(half, 0.3 * L);   // 浅いフライは塁の近く
  return { act: 'half', to: base + 1, halfDist: +half.toFixed(1), why: `${base === 2 ? '二塁' : '一塁'}走者: ハーフウェイ ${half.toFixed(1)}m(捕られたら ${tBack.toFixed(1)}秒で送球が戻る)` };
}
const ex0 = (P) => P.exchangeOF.flat;

// ------------------------------------------------------------------ タッチアップ
// o = { base(走者の塁 1..3), catchPos:[x,z], catchVel:[vx,vz](捕った時の野手の動き), arm, outs, runnerSpeed, late }
// 返り値 { go, to, runT, ballT, margin, need, why }
export function tagupDecision(o, P = PRO) {
  const base = o.base, to = base + 1, tgt = to === 4 ? HOME_RECV : BASE[to];
  if (o.outs >= 2) return { go: false, to: base, why: '2アウト: タッチアップは無い(捕られたら3アウト)' };
  if (dist0(o.catchPos) < 40) return { go: false, to: base, why: '内野の飛球: 進まない' };
  const sp = o.runnerSpeed || P.runSpeed;
  const runT = L / sp + P.startLoss + 0.1;   // 捕球(最初に触れた瞬間)を見て離塁
  const ex = exchangeFor(o.catchPos, o.catchVel || [0, 0], tgt, P);
  const ballT = ex + throwTime(hyp(o.catchPos, tgt), o.arm || P.arm.CF) + (to === 4 ? P.tagTime : 0.1);
  const margin = ballT - runT;
  // 必要な余裕: 三塁走者 0 アウトは確実に(損益分岐 約75%)、1 アウトは少しの危うさでも行く。二塁→三塁は「三塁で 1 つ目・3 つ目のアウトにならない」
  let need = to === 4 ? (o.outs === 0 ? 0.15 : 0.0) : to === 3 ? (o.outs === 0 ? 0.35 : 0.2) : 0.4;
  if (o.late && to === 4) need -= 0.1;
  const go = margin > need;
  const where = `捕球 ${Math.round(dist0(o.catchPos))}m・体勢 ${ex <= P.exchangeOF.charge ? '前へ' : ex >= P.exchangeOF.back ? '後ろへ' : ex > P.exchangeOF.flat ? '横へ' : '止まって'}・肩 ${(o.arm || P.arm.CF).toFixed(0)}m/s`;
  return { go, to: go ? to : base, runT: +runT.toFixed(2), ballT: +ballT.toFixed(2), margin: +margin.toFixed(2), need, why: `${go ? 'タッチアップ' : '自重'}(${where}: 走者 ${runT.toFixed(2)}秒・送球 ${ballT.toFixed(2)}秒)` };
}

// ------------------------------------------------------------------ 毎こま
// st = { outs, outsThisPlay, late, infieldIn, ofIn(前進守備の外野), batted, ball(ballTime の形), runners:[{ id, from, dist, to, running, returning, isBatter, speed, committed, forced, between }] }
// 返り値: id ごと { act:'go'|'hold'|'back'|'stall', to, speed:1|0.9|..., why, coach:'wave'|'stop'|null, slide }
export function runnersTick(st, P = PRO) {
  const two = st.outs + (st.outsThisPlay || 0) >= 2, res = {};
  const runners = [...st.runners].sort((a, b) => (b.from * L + b.dist) - (a.from * L + a.dist));
  const taken = new Set();   // 前の走者が向かう塁(追い越さない・同じ塁に2人行かない)
  for (const r of runners) {
    if (r.between) { res[r.id] = stallInRundown(r, st); continue; }
    const nb = (r.from + 1) % 4 || 4;   // 次の塁(4 = 本塁)
    const cur = r.to || nb;
    let d = { act: r.returning ? 'back' : r.running ? 'go' : 'hold', to: cur, why: '' };
    const bt = (base) => ballTime(st.ball, base % 4, P);
    const rt = (base) => runnerTime(r, base % 4, P);
    const need = (base) => needFor(base, st.outs + (st.outsThisPlay || 0), st.late, r) + (base % 4 === 0 ? (P.homeNeedAdj || 0) : base % 4 === 3 ? (P.thirdNeedAdj || 0) : 0) - (base % 4 === 0 ? (r.aggr || 0) : 0);   // r.aggr: 走者ごとの本塁への思い切り(±0.3 秒)   // P.homeNeedAdj: 水準ごとの本塁の攻め方(プロは 0)
    if (r.returning || (!r.running && (r.dist || 0) < 1)) {
      // 塁にいる(か戻っている): 送球がほかへ行く間に次の塁を取る(送球が後ろ・本塁へ行ったら打者走者は二塁へ)
      const away = st.ball.loose || (st.ball.throwTo != null && st.ball.throwTo !== nb % 4);
      if (!taken.has(nb) && away && bt(nb) - rt(nb) > need(nb) + 0.2) d = { act: 'go', to: nb, why: st.ball.loose ? '送球がそれた: 次の塁へ' : `送球が${st.ball.throwTo === 0 ? '本塁' : st.ball.throwTo + '塁'}へ: その間に次の塁へ` };
      else if (r.returning) d = { act: 'back', to: r.from, why: '戻る' };
    } else {
      // 走っている: いま狙っている塁に間に合うか、さらに先も行けるか
      const m = bt(cur) - rt(cur);
      if (m < need(cur) - 0.6 && !r.forced && !r.committed && (r.dist || 0) < 0.5 * L&& cur === nb) d = { act: 'back', to: r.from, why: `間に合わない(差 ${m.toFixed(2)}秒): 戻る` };
      else if (cur !== nb && m < need(cur) && !r.committed) {
        // 一つ手前で止まる(三塁コーチの止め・二塁で止まる)
        d = { act: 'go', to: nb, coach: nb === 3 ? 'stop' : null, why: `${cur % 4 === 0 ? '本塁' : cur + '塁'}は危ない(差 ${m.toFixed(2)}秒 < 必要 ${need(cur).toFixed(2)}): ${nb % 4 === 0 ? '本塁' : nb + '塁'}で止まる` };
      } else {
        d = { act: 'go', to: cur, why: d.why || `${cur % 4 === 0 ? '本塁' : cur + '塁'}へ(差 ${m.toFixed(2)}秒)` };
        // 次の塁も: 塁の手前 1/3 で判断する(それより後は決めた走者は止まらない)
        const nxt = cur + 1;
        // 打球が外野へ抜けて、まだ誰も拾っていない時(P.earlyRead)は、二塁を回る前に先の塁を決める(本物の走者は抜けた瞬間に打球と外野手の向きを見る)
        const early = P.earlyRead && st.ball && !st.ball.holder && st.ball.throwTo == null && st.ball.pickT != null && st.ball.pickPos && dist0(st.ball.pickPos) > 42 && (!st.ball.ballPos || dist0(st.ball.ballPos) > 33) && (r.dist || 0) > 0.2 * L;   // 球が内野を抜けてから(拾われる所の見積もりがぶれる間は待つ)   // 早めに決めるのは外野で拾う球だけ(内野のゴロは拾われるまで待つ)
        if (cur <= 3 && !taken.has(nxt) && ((r.dist || 0) > 0.6 * L || early)) {
          const m2 = bt(nxt) - rt(nxt);
          if (m2 > need(nxt) + (nxt === 4 ? 0 : (P.extendMargin ?? 0.3))) d = {   // 二塁・三塁へ伸ばすのは余裕 0.3 秒を足して(際どい時は伸ばさない: 見積もりのぶれで行って戻るのを防ぐ)。本塁は needFor と走者ごとの思い切りで決めているので足さない(足すと二塁からの生還が 76% → 57% に落ちた)
            act: 'go', to: nxt, coach: nxt === 4 ? 'wave' : null, why: `${nxt === 4 ? '本塁' : nxt + '塁'}も間に合う(差 ${m2.toFixed(2)}秒)` };
        }
        if (d.to === 4 && cur === 4) d.coach = 'wave';
      }
    }
    // 2 アウトは打った瞬間から全力・止まる判断も前のめりに(needFor で 0 以下)
    d.speed = d.act === 'hold' ? 0 : 1;
    if (d.act === 'go' && st.ball.throwTo != null && (st.ball.throwTo % 4) === (d.to % 4)) d.slide = slideChoice(st.ball.recvPos, d.to % 4);
    if (d.to % 4 !== 0) taken.add(d.to);   // 本塁は何人でも続けて還れる(満塁の二塁走者が三塁で止まらない)
    if (two && d.act === 'back' && !r.isBatter && r.from === 3) d = { act: 'go', to: 4, speed: 1, why: '2アウトの三塁走者は戻っても意味が薄い: 本塁へ' };
    res[r.id] = d;
  }
  return res;
}
// 塁ごとの「必要な余裕」(秒、送球が着くより何秒先に着けば行くか)
export function needFor(base, outs, late, r = {}) {
  const b = base % 4;
  let n;
  if (b === 0) n = outs === 0 ? 0.45 : outs === 1 ? 0.25 : -0.05;   // 本塁: 無死は自重、2死は5分5分でも行く
  else if (b === 3) n = outs === 0 ? 0.35 : outs === 1 ? 0.2 : 0.45;   // 三塁: 「三塁で 1 つ目と 3 つ目のアウトになるな」
  else n = outs === 2 ? 0.1 : 0.2;                                    // 二塁: 得点圏へ
  if (late && b === 0) n -= 0.1;
  return n;
}
// 本塁・塁へ滑る時の回り込み: 受ける野手が走路の内側(フェア側)なら外へ回り込んで手で触る
export function slideChoice(recvPos, base) {
  if (!recvPos) return 'feet';
  const B = base === 0 ? BASE[0] : BASE[base];
  const side = base === 0 ? Math.sign(recvPos[0] - B[0]) : 0;
  if (base === 0) return side > 0 ? 'hook_left_hand' : side < 0 ? 'hook_right_hand' : 'feet';   // 捕手がフェア側(+x 側)なら外(ファウル側)へ回り込む
  return 'feet';
}
// 挟まれた走者: 後ろの走者が進むまで時間をかせぐ。野手が詰めてきたら向きを変え、最後は前の塁の近くでタッチされる
function stallInRundown(r, st) {
  const ch = st.rundown || {};
  const toward = ch.chaserFrom === r.from ? (r.from + 1) % 4 : r.from;   // 追ってくる野手から離れる向き
  return { act: 'stall', to: toward, speed: ch.chaserClose ? 1 : 0.6, why: '挟まれた: 後ろの走者が次の塁へ着くまで時間をかせぐ(追われたら逆へ、前の塁寄りで粘る)' };
}

// ------------------------------------------------------------------ 外野の返球
// o = { from(拾った野手), pos, vel, arm, runners:[{id, from, dist, to, running, speed, isBatter}], outs, late }
// 返り値 { target(塁 0..3 か 'cut'), via:'cut'|'direct', cutBy, call:'cut2'|'cut3'|'let_go'|..., why }
export function outfieldThrow(o, P = PRO) {
  const lead = [...o.runners].filter((r) => !r.out).sort((a, b) => (b.from * L + b.dist) - (a.from * L + a.dist));
  const ball = { holder: true, holderPos: o.pos, holderVel: o.vel || [0, 0], holderKind: 'OF', arm: o.arm || P.arm[o.from] };
  // 一番先の走者でアウトにできる塁があればそこ、なければ「先の走者の次の塁」へ返して止める
  for (const r of lead) {
    const to = (r.to || r.from + 1) % 4;
    const m = runnerTime(r, to, P) - ballTime(ball, to, P);
    if (m > 0.1) {
      const d = hyp(o.pos, to === 0 ? HOME_RECV : BASE[to]);
      const cutBy = cutFor(o.from, to);
      const via = d > 60 ? 'cut' : 'direct';
      return { target: to, via, cutBy, call: 'let_go', why: `${to === 0 ? '本塁' : to + '塁'}で刺せる(${m.toFixed(2)}秒): ${via === 'cut' ? '中継の頭の高さで、捕手(受け手)は「そのまま」' : '直接'}` };
    }
  }
  // 刺せない: 後ろの走者を進ませない塁へ(中継が受けて止める)
  const trail = lead.find((r) => r.isBatter) || lead[lead.length - 1];
  const keep = trail ? ((trail.to || trail.from + 1) % 4 === 1 ? 2 : ((trail.to || trail.from + 1) + 1) % 4) : 2;
  return { target: keep, via: 'cut', cutBy: cutFor(o.from, keep), call: keep === 2 ? 'cut2' : keep === 3 ? 'cut3' : 'cut', why: `先の走者は刺せない: 中継へ低く返し、打者走者(後ろの走者)の次の塁(${keep}塁)を止める` };
}
// 中継に入る人(本塁への中継は左翼から三塁手・中堅と右翼から一塁手、三塁・二塁へは遊撃・二塁)
export function cutFor(of, base) {
  if (base === 0) return of === 'LF' ? '3B' : '1B';
  if (base === 3) return of === 'RF' ? 'SS' : 'SS';
  if (base === 2) return of === 'RF' ? '2B' : of === 'LF' ? 'SS' : 'SS';
  return '2B';
}
// 中継の立つ所: 外野手と塁を結ぶ線の上。本塁は塁から 約 40%、ほかは送球が 2 本とも 40〜50 m 以内になる所
export function cutSpot(fromPos, base) {
  const B = base === 0 ? HOME_RECV : BASE[base];
  const d = hyp(fromPos, B);
  const f = clamp(base === 0 ? 0.38 : d / 2 / d, 0.3, 0.55);
  return lerp(B, fromPos, f);
}

// ------------------------------------------------------------------ 守備の割り当て
// st = { type:'grounder'|'liner'|'fly'|'pop'|'bunt'|'steal'|'pickoff', zone, hit(安打), gap:'LC'|'RC'|'LL'|'RL'|null(長打の方向),
//        bases:[b1,b2,b3], outs, hand:'R'|'L', ballPos:[x,z](外野の打球の今の所、無ければ zone の守備位置) }
// 返り値: 守備位置ごと { role:'field'|'base'|'cut'|'trail'|'backup'|'charge'|'hold', base?, to:[x,z], why }
export function defenseAssign(st) {
  const A = {}, set = (k, role, to, why, extra = {}) => { if (!A[k]) A[k] = { role, to: to && [+to[0].toFixed(2), +to[1].toFixed(2)], why, ...extra }; };
  const [r1, r2, r3] = st.bases, z = st.zone, of = OFS.includes(z);
  const bp = st.ballPos || POS0[z] || POS0.CF;
  const behind = (base, from, d = 11) => { const B = base === 0 ? BASE[0] : BASE[base], n = norm([B[0] - from[0], B[1] - from[1]]); return [B[0] + n[0] * d, B[1] + n[1] * d]; };
  const cover = (k, base, why) => set(k, 'base', base === 0 ? HOME_RECV : BASE[base], why, { base });
  if (st.type === 'steal') {
    const cv = st.hand === 'L' ? 'SS' : '2B';   // 右打者は二塁手、左打者は遊撃手が入る(引っ張る側の内野手は守備位置に残す)
    set('C', 'field', POS0.C, '二塁へ送球'); cover(cv, 2, '二塁に入る(盗塁)');
    set(cv === 'SS' ? '2B' : 'SS', 'backup', behind(2, [0, 0], 5), '二塁のバックアップ(送球の後ろ)');
    set('CF', 'backup', behind(2, [0, 0], 18), '二塁の後ろへ(それた送球)');
    set('P', 'hold', [0, -16.5], 'しゃがんで送球の通り道をあける');
    cover('1B', 1, '一塁'); cover('3B', 3, '三塁'); set('LF', 'hold', POS0.LF, '構え'); set('RF', 'hold', POS0.RF, '構え');
    return A;
  }
  if (st.type === 'pickoff') {
    // 一塁けん制: 一塁手が塁について受ける、右翼手と二塁手がそれた球に備える
    cover('1B', 1, '一塁で受ける(走者の足元へタッチ)'); set('RF', 'backup', behind(1, POS0.P, 20), '一塁の後ろ(それた牽制)');
    set('2B', 'backup', [12, -26], '一二塁間へ寄る(挟殺の用意)'); cover('C', 0, '本塁'); set('SS', 'hold', POS0.SS, '二塁寄り'); set('3B', 'hold', POS0['3B'], '構え');
    set('P', 'field', POS0.P, '牽制'); set('LF', 'hold', POS0.LF, '構え'); set('CF', 'hold', POS0.CF, '構え');
    return A;
  }
  set(z, 'field', bp, '打球を捕る');
  if (st.type === 'bunt') {
    for (const k of ['P', '1B', '3B']) if (k !== z) set(k, 'charge', [POS0[k][0] * 0.45, Math.max(POS0[k][1] * 0.45, -12)], '前に出てバント処理');
    cover('2B', 1, '一塁カバー(バント)'); cover('SS', r2 ? 3 : 2, r2 && !r3 ? '三塁ががら空き: 遊撃が三塁へ(走者一二塁で三塁手が出た時)' : '二塁に入る'); cover('C', 0, '本塁(三塁手が出たら打球を指示)');
    if (r2) set('SS', 'base', BASE[3], '三塁に入る', { base: 3 });
    set('LF', 'backup', behind(3, POS0['1B'], 14), '三塁のバックアップ'); set('CF', 'backup', behind(2, [0, 0], 16), '二塁のバックアップ'); set('RF', 'backup', behind(1, POS0['3B'], 14), '一塁のバックアップ');
    return A;
  }
  if (!of) {
    // 内野の打球
    if (z === '1B') cover('P', 1, '一塁手が捕った: 投手が一塁へ(一塁線の内側を平行に走り、塁の内側で受ける)');
    else cover('1B', 1, '一塁に入る');
    if (z === '2B') set('P', 'backup', [12, -16], '自分の左の打球: まず一塁へ走り出す(一塁手が塁に戻れば止まる)');
    const two = (z === 'SS' || z === '3B' || z === 'P' || z === 'C') ? '2B' : 'SS';   // 二塁は打球と反対側の二遊間(投手の打球は打者による: ここは二塁手、併殺は遊撃も可)
    if (z === 'P' && r1) cover('SS', 2, '投手ゴロの併殺: 遊撃が二塁に入る(投手から見て正面)');
    else cover(two, 2, r1 && st.outs < 2 ? '二塁ベースカバー(併殺: 塁の手前で受けて踏んで一塁へ)' : '二塁に入る');
    if (z === '3B') cover(r2 || r3 ? 'SS' : 'P', 3, r2 || r3 ? '三塁手が出た: 遊撃が三塁へ' : '三塁が空く: 投手が三塁へ(走者なしは投手も可)');
    else cover('3B', 3, '三塁に戻る');
    if (r3 || r2) cover('C', 0, '本塁に入る');
    else if (z !== 'C') set('C', 'backup', [19.07 + 8.5, -19.4 + 6.0 + 2.2], '一塁線のファウル側を一塁の後ろへ(走者が得点圏にいない時)');
    set('RF', 'backup', behind(1, POS0[z] || POS0.SS, 14), '一塁のバックアップ(送球の延長線上)');
    set('CF', 'backup', behind(2, POS0[z] || [0, 0], 16), '二塁のバックアップ');
    set('LF', 'backup', behind(3, POS0[z] || POS0['1B'], 14), '三塁のバックアップ');
    set('2B', 'backup', [19.07 - 4, -19.4 - 6], '一塁の後ろ寄り'); set('SS', 'hold', POS0.SS, '打球の後ろ(二塁寄り)');
    set('P', 'backup', [5.5, -15], '一塁線寄りへ');
    return A;
  }
  // 外野の打球
  if (st.type === 'fly' && !st.hit) {
    const nb = z === 'CF' ? (st.hand === 'L' ? 'RF' : 'LF') : 'CF';
    set(nb, 'backup', [bp[0] + (POS0[nb][0] - bp[0]) * 0.3 - norm(bp)[0] * 9, bp[1] + (POS0[nb][1] - bp[1]) * 0.3 - norm(bp)[1] * 9], '捕る人の斜め後ろ(落とした・弾いた時)');
    if (r3 && st.outs < 2) { const ck = cutFor(z, 0); set(ck, 'cut', cutSpot(bp, 0), '本塁への中継(タッチアップ)', { base: 0 }); set('P', 'backup', behind(0, bp, 12), '本塁のバックアップ'); }
    if (r2 && st.outs < 2) set('SS', 'cut', cutSpot(bp, 3), '三塁への中継(二塁走者のタッチアップ)', { base: 3 });
    cover('C', 0, '本塁'); cover('1B', 1, '一塁(一塁走者の帰塁)'); cover('3B', 3, '三塁');
    if (!A.SS) set(z === 'RF' ? '2B' : 'SS', 'cut', cutSpot(bp, 2), '二塁への中継', { base: 2 });
    cover(A.SS && A.SS.role === 'cut' ? '2B' : 'SS', 2, '二塁に入る');
    if (!A.P) set('P', 'backup', behind(3, bp, 12), '三塁のバックアップ');
    for (const k of OFS) set(k, 'backup', behind(2, [0, 0], 18), '二塁の後ろへ寄る');
    return A;
  }
  if (st.gap) {
    // 長打(外野の間・線際): ダブルカット(先頭の中継 + 15 m 後ろのトレイル)
    const leftSide = st.gap === 'LC' || st.gap === 'LL';
    const leadC = leftSide ? 'SS' : '2B', trail = leftSide ? '2B' : 'SS';
    const tb = r1 || r2 || r3 ? 0 : 3;   // 走者がいれば本塁、いなければ三塁へ(打者走者の三塁打を止める)
    const B = tb === 0 ? HOME_RECV : BASE[tb];
    const leadSpot = lerp(bp, B, clamp(30 / hyp(bp, B), 0.2, 0.45));
    set(leadC, 'cut', leadSpot, `先頭の中継(外野手から 30 m、${tb === 0 ? '本塁' : '三塁'}への線上)`, { base: tb });
    set(trail, 'trail', lerp(leadSpot, B, 15 / hyp(leadSpot, B)), '先頭の中継の 15 m 後ろ(それた・高い送球を拾う)', { base: tb });
    cover('3B', 3, '三塁に入る'); cover('C', 0, '本塁(中継へ「カット3」「そのまま」「カット2」を声で)');
    if (tb === 0) { set('1B', 'cut', cutSpot(lerp(leadSpot, B, 0.5), 0), '本塁への第2の中継(マウンドの前)', { base: 0 }); set('P', 'backup', [-5, 12], '三塁と本塁の間の後ろ(送球の先を見て本塁か三塁の後ろへ)'); }
    else { set('1B', 'base', BASE[2], '打者走者を追って二塁に入る(トレイル)', { base: 2 }); set('P', 'backup', behind(3, leadSpot, 12), '三塁のバックアップ'); }
    const nb = st.gap === 'LC' ? (z === 'LF' ? 'CF' : 'LF') : st.gap === 'RC' ? (z === 'RF' ? 'CF' : 'RF') : 'CF';
    set(nb, 'backup', [bp[0] + norm(bp)[0] * 4, bp[1] + norm(bp)[1] * 4], '2人で追う: 跳ね返りに備えて捕る人の後ろ・横');
    for (const k of OFS) set(k, 'backup', behind(2, [0, 0], 18), '二塁の後ろへ');
    return A;
  }
  // 外野の前の安打: 先の走者の次の次の塁へ返す
  const tb = r2 ? 0 : r1 ? 3 : 2;
  const ck = cutFor(z, tb);
  set(ck, 'cut', cutSpot(bp, tb), tb === 0 ? '本塁への中継' : tb === 3 ? '三塁への中継' : '二塁への中継', { base: tb });
  cover('C', 0, '本塁');
  if (ck === '3B') { cover('SS', 3, '三塁に入る'); cover('2B', 2, '二塁に入る'); }
  else if (ck === '1B') { cover('2B', 1, '一塁に入る(打者走者の戻り)'); cover('SS', 2, '二塁に入る'); cover('3B', 3, '三塁に入る'); }
  else if (ck === 'SS') { cover('2B', 2, '二塁に入る'); cover('3B', 3, '三塁に入る'); }
  else { cover('SS', 2, '二塁に入る'); cover('3B', 3, '三塁に入る'); }
  cover('1B', 1, '打者走者が一塁を踏むのを見て一塁に入る');
  if (tb === 0) set('P', 'backup', behind(0, bp, 12), '本塁のバックアップ(送球の延長線上、本塁から 12 m)');
  else if (tb === 3) set('P', 'backup', behind(3, bp, 12), '三塁のバックアップ');
  else set('P', 'backup', behind(2, bp, 10), '二塁の後ろ(送球の延長線上)');
  if (tb === 3 && z !== 'LF') set('LF', 'backup', behind(3, bp, 18), '三塁のバックアップ(投手のさらに後ろ・ファウル側)');
  const nb = z === 'CF' ? (bp[0] < 0 ? 'LF' : 'RF') : 'CF';
  set(nb, 'backup', [bp[0] + (POS0[nb][0] - bp[0]) * 0.25 - norm(bp)[0] * 10, bp[1] + (POS0[nb][1] - bp[1]) * 0.25 - norm(bp)[1] * 10], '捕る外野手の後ろ(後逸に備える)');
  if (tb === 2 || tb === 3) set('RF', 'backup', behind(2, bp, 16), '二塁の後ろへ');
  for (const k of OFS) set(k, 'backup', behind(2, [0, 0], 18), '二塁の後ろへ');
  return A;
}

// ------------------------------------------------------------------ 挟殺
// o = { between:[a,b](走者がいる塁間、a→b が進む向き), runnerPos, holder, fielders:{k:[x,z]}, otherRunners(進もうとしている後ろの走者がいるか) }
// 返り値 { chase(持って追う人), recv(受ける人), backups:[...], driveTo(追い込む塁), throwWhen(受け手との距離), follow, why }
export function rundownPlan(o) {
  const [a, b] = o.between;
  const near = (base, skip) => Object.entries(o.fielders).filter(([k]) => !skip.includes(k)).sort((p, q) => hyp(p[1], BASE[base % 4]) - hyp(q[1], BASE[base % 4]))[0]?.[0];
  // 元の塁(後ろの塁)へ追い返す: 先の塁を取られる方が損。ボールは顔の高さに見せて、1 回(多くて 2 回)の送球で終わらせる
  const driveTo = a;
  const chase = o.holder;
  const recv = near(a, [chase]);
  const back2 = near(b, [chase, recv]);
  const backups = [near(a, [chase, recv, back2]), back2].filter(Boolean);
  return { chase, recv, backups, driveTo, throwWhen: 4.0, follow: 'throw_then_go_to_back_of_line',
    why: `持った人(${chase})は全力で走者を元の塁(${a === 0 ? '本塁' : a + '塁'})へ追う。受ける人(${recv})は塁の 3 m 前に出て「今」の声、走者まで約 4 m で投げる。投げた人は受けた側の列の後ろへ回る。${o.otherRunners ? '後ろの走者を見て、進んだらそちらへ' : ''}` };
}

export const _test = { throwTime, exchangeFor, runnerTime, ballTime, needFor, cutFor, cutSpot };
