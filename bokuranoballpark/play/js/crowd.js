// 観客(席の位置に 1 人ずつ)。main.js の buildCrowd / setCrowd / updateCrowdNear から呼ぶ。引き継ぎは docs/観客の引き継ぎ.md
// 近く(標準 22m・軽量 11m の内)は頭・胴・腕・脚の簡単な人の形、遠くはカメラを向く板 1 枚に人の形を描く(画像は使わず式で描く)。
// 描く呼び出しは 3 つ(近く・遠く・アルプスの大旗)。光源は増やさない(材質は MeshLambertMaterial のまま)。
// 動きは全部シェーダーの中: 小さな揺れ・うちわ・時々立つ・打った瞬間に身を乗り出す・得点やファインプレーで立って手を上げる(11/21 夜からタオルは回さない)・
// 攻める側のアルプスは太鼓の拍子(audio.js の tick)に合わせてメガホン・手拍子・旗。合図は audio.js の crowdEvent / celebrate / setPressure / setFill を外から包んで受ける。
// 座標: x = 一塁側、y = 上、z = 捕手側が +(センターは -z)。人の前は自分から見て -z(席の yaw で回す)。

import { onTeams, setTeamStyle, teamsNow } from './uniform.js';
// 応援席の色: 三塁側 A = 先攻、一塁側 B = 後攻。11/21 から js/uniform.js のチーム(高校・プロ風の球団)の色を _makeData で入れる(下は初めの値)
const SCHOOL = { A: [0x14a39a, 0xf39a2b], B: [0x6b3fb8, 0x9ed13b] };
// 夏の観客の服(白・明るい色が多い。紺・黒も混ぜる)。重みつき
const SHIRTS = [[0xf4f4f0, 4.5], [0xe9e6da, 2], [0xd0d3d6, 2], [0xa9c8e8, 3], [0x7fb2dc, 1], [0x2b3550, 2], [0x2a2a2e, 2], [0xf2d45c, 1],
  [0xf1a7b9, 1], [0x9fd8c0, 1], [0xc9473f, 1], [0xf09a4a, 0.7], [0x7f8a55, 0.7], [0x9a8fc4, 0.5], [0x5f87b8, 1], [0xf7f0c8, 1]];
// 11/20 夕 女性の服: 淡い色(ピンク・水色・薄紫・ミント・桃・白)を多めに。重みつき
const F_SHIRTS = [[0xf4b6c8, 3], [0xb8d8f0, 2.5], [0xcdb8e6, 2], [0xbfe6d2, 1.5], [0xf6cdb0, 1.5], [0xf7f3ec, 3], [0xf2e6a0, 1], [0xe88aa6, 1], [0x2b3550, 0.8], [0xa9c8e8, 1]];
const HATS = [[0xf5f5f2, 4], [0xd8c38f, 3], [0x2a3352, 2], [0x1f1f22, 2], [0x8a7f5c, 1.5], [0xb83a35, 0.6], [0x6f9fd2, 0.8]];

const DECL = /* glsl */`
attribute vec4 aP; attribute vec4 aC; attribute vec4 aH; attribute vec4 aE; attribute vec4 aF;
uniform float uT, uBeat0, uBeatP, uPlay, uPress, uAttack, uHatK, uFanK, uNearR, uNearOn, uLeanT, uLeanK;
uniform vec3 uNearC; uniform vec4 uHide; uniform vec4 uHideUp; uniform vec3 uFill;
uniform vec4 uSeatV, uSeatF; uniform vec4 uBal;
uniform vec4 uEvL, uEvR, uEvN;
uniform vec3 uSchA, uSchA2, uSchB, uSchB2;
uniform vec4 uYell, uEnd; uniform float uStyle; uniform vec3 uShR, uHandR, uHip;
float hsh(float x) { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }
float evEnv(vec4 e, float t, float d) { float dt = t - e.x - d; if (dt < 0.0 || e.y <= 0.0) return 0.0; return clamp(dt / 0.35, 0.0, 1.0) * (1.0 - smoothstep(e.z * 0.6, e.z, dt)); }
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 rotZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z); }
`;
// 1 人の姿勢(近く・遠くで同じ)。結果: stand, lean, aR, aL, spr, fanA, spin, sway, hop, yawA と持ち物
// 11/21 夜 持ち主「プロ野球のリアル応援の感じで…高校野球も似たような感じで」。調べた現実の動きは docs/観客の動き_1121.md。
//   応援席: 攻撃中だけ立ち、応援歌の拍(uBeat0・uBeatP = 曲のテンポ。audio.js の今の曲から _tick が入れる)に合わせてメガホン・手拍子・膝で上下。
//   演奏が止まる(打った直後 uPlay = 0)と拍の動きも止める。守りの時は座って拍手・声だけ。リーダーは応援席の方を向いて指揮。
//   一般の客: 座って飲む・見回す・拍手。好守・長打・ホームランで立って歓声と拍手、数秒で座る。タオルを回す・総立ちで跳ね続けるのはやめた(spin・towelUp は 0 のまま)
const POSE = /* glsl */`
  float ph = aE.x, side = aE.y, role = aE.z, ps = aE.w;
  float h1 = hsh(ph * 91.7), h2 = hsh(ph * 13.3 + 1.7), h3 = hsh(ph * 57.1 + 4.1), h4 = hsh(ph * 7.9 + 9.2);
  float t = uT;
  // 11/20 女性と子供: aF.z = 年代(0 子供・1 大人・2 年配)+ 4 × 女性。下の服(女性): 0 ズボン・1 スカート・2 ワンピース。髪: 長い / 肩まで
  float ageK = mod(aF.z, 4.0); bool fem = aF.z > 3.5; bool kid = ageK < 0.5;
  float h5 = hsh(ph * 3.31 + 2.2);
  float lowK = fem && role < 2.5 ? (h5 < 0.45 ? 0.0 : h5 < 0.78 ? 1.0 : 2.0) : 0.0;
  float hst = fract(h1 * 7.7), longK = hst < 0.45 ? 1.0 : 0.55; bool tail = hst >= 0.7 && ageK < 1.5;   // 髪: 背中の上までの長い髪 45%・肩まで 25%・まとめ髪(ポニーテール)30%
  float fillK = aF.y < 0.5 ? uFill.x : aF.y < 1.5 ? uFill.y : uFill.z;
  float alive = step(aF.x, fillK - 0.0001) * step(uHide.w, distance(aP.xyz, uHide.xyz));
  alive *= 1.0 - step(distance(aP.xz, uHideUp.xz), uHideUp.w) * step(uHideUp.y, aP.y);   // 頭の真上(横 uHideUp.w m 以内・高さ uHideUp.y より上)の人は出さない(スタンドの下を歩く時、段のすき間から靴の先が見えないように)
  bool rGen = role < 0.5, rStu = abs(role - 1.0) < 0.5, rBand = abs(role - 2.0) < 0.5, rCheer = role > 2.5;
  bool rPom = abs(role - 3.0) < 0.5, rLead = abs(role - 4.0) < 0.5;   // チア(ポンポン)/ リーダー(高校は学ランの応援団)
  bool pro = uStyle > 0.5;
  bool atk = side != 0.0 && abs(side - uAttack) < 0.5;
  bool defs = side != 0.0 && !atk;
  vec3 schM = side < 0.0 ? uSchA : uSchB, schS = side < 0.0 ? uSchA2 : uSchB2;
  // 持ち物
  float hasHat = step(aH.w, uHatK);
  float neckT = step(fract(ps * 7.31), 0.27) * (rBand ? 0.0 : 1.0);
  float hasFan = (rGen || (rStu && !atk)) && ps < uFanK ? 1.0 : 0.0;
  float hasMega = rStu && fract(ps * 3.7) < (pro ? 0.62 : 0.32) ? 1.0 : 0.0;
  float hasFlag = rStu && hasMega < 0.5 && fract(ps * 5.3) < 0.035 ? 1.0 : 0.0;   // 小旗は少数
  bool drum = rBand && pro && fract(ps * 11.3) < 0.35;                              // プロ風の鳴り物: 3 割が太鼓(両手で打つ)、残りはトランペット
  float hasInst = rBand && !drum ? 1.0 : 0.0;
  float hasPom = rPom ? 1.0 : 0.0;
  float towelUp = 0.0, hop = 0.0, spin = 0.0;
  float yawA = aP.w;
  float lazy = h5 < 0.12 ? 0.35 : 0.75 + 0.25 * h4;   // 動きの大きさは人ごとに違う(1 割はほとんど動かない)
  // ふだん
  float stand = 0.0, lean = 0.0, aR = 0.45 + h2 * 0.15, aL = 0.42 + h3 * 0.15, spr = 0.0, fanA = 0.0;
  float sway = sin(t * (0.5 + h1 * 0.6) + h2 * 6.283) * 0.035;
  if (rGen) {
    float c = fract(t / (50.0 + h1 * 80.0) + h2); stand = smoothstep(0.0, 0.015, c) * (1.0 - smoothstep(0.04, 0.055, c)) * step(h3, 0.3);
    // 飲む: 25〜60 秒に 1 回、2 秒ほど右手を口へ
    float dk = fract(t / (25.0 + h4 * 35.0) + h1 * 3.7);
    if (h5 > 0.4 && dk < 0.06) { float k = sin(dk / 0.06 * 3.1416); aR = mix(aR, 2.25, k); spr = mix(spr, -0.45, k); lean = -0.05 * k; }
    // 見回す・隣と話す: 体を少しひねる
    float lk = fract(t / (16.0 + h2 * 22.0) + h3 * 5.1);
    if (lk < 0.13) yawA += 0.3 * sin(lk / 0.13 * 3.1416) * (h4 < 0.5 ? 1.0 : -1.0);
  }
  if (hasFan > 0.5 && fract(t / (9.0 + h1 * 7.0) + h4) < 0.6) { aR = 1.75; fanA = sin(t * (6.5 + h2 * 2.0) + h1 * 6.28) * 0.55; }
  // 応援歌の拍(曲が鳴っている間は曲のテンポ、無い時は太鼓の 0.5 秒)。人ごとに少し遅れてずれる
  float bt = (t - uBeat0) / uBeatP - 0.05 - h2 * 0.12;
  float bp = fract(bt), pulse = 1.0 - smoothstep(0.0, 0.45, bp);
  float bi = mod(floor(bt), 8.0);                     // 2 小節の何拍目(8 拍目でこぶしを上げる)
  float play = uPlay;                                 // 演奏中 1 / 止まった(打った直後・守り)0
  float amp = (0.6 + 0.4 * uPress) * lazy;
  bool chance = uPress > 0.55;
  float hit = pulse * play;
  if (atk) {
    if (rStu) {
      stand = step(h1, pro ? 0.96 : 0.9);
      if (hasMega > 0.5 && pro) {
        // プロ風: 2 本のメガホンを顔の前で打ち合わせる(1 拍に 1 回)。2 小節の終わりは両手を突き上げる。チャンスは頭の上で大きく
        aR = aL = 1.85 + 0.25 * hit; spr = mix(0.2, -0.08, hit);
        if (chance) { aR = aL = 1.9 + 0.9 * hit * amp; spr = mix(0.22, 0.0, hit); }
        if (bi > 6.5 && play > 0.5 && h3 < 0.85) { aR = aL = 2.8; spr = 0.16; }
        hop = (chance ? 0.04 : -0.035) * hit * amp;   // ふだんは膝で上下に揺れる、チャンスは小さく跳ねる
      } else if (hasMega > 0.5) {
        // 高校: 右手のメガホンを拍に合わせて振り下ろす、左手は胸の前
        aR = 1.75 + 0.85 * hit * amp; aL = mix(0.5, 1.1, play); spr = 0.06;
        if (bi > 6.5 && play > 0.5) { aR = 2.8; }
        hop = -0.03 * hit * amp;
      } else if (hasFlag > 0.5) { aR = 2.45 + (chance ? 0.45 : 0.15) * sin(t * 3.14 + h1) * play; aL = 0.6; }
      else {
        // 手拍子(胸の前で拍に合わせて打つ)。2 小節の終わりは拳を上げる
        aR = aL = 1.3 + 0.1 * hit; spr = mix(0.04, 0.3, (1.0 - pulse) * play);
        if (bi > 6.5 && play > 0.5 && h3 < 0.7) { aR = 2.65; aL = h4 < 0.5 ? 2.6 : 0.8; spr = 0.15; }
        hop = -0.025 * hit * amp;
      }
      if (chance && !pro && hasMega < 0.5) {
        // 高校野球のチャンス: 列ごとに肩を組んで左右に揺れる / 拍に合わせて跳ねる
        if (fract(floor(aP.y * 1.25) * 0.37 + side * 0.21) < 0.35) { aR = aL = 1.55; spr = 1.3; sway = 0.14 * sin((t - uBeat0) / uBeatP * 1.5708) * play; hop = 0.0; }
        else { aR = aL = 1.9 + 0.8 * hit; spr = 0.2; hop = 0.07 * hit * amp; }
      }
      if (play < 0.5) { aR = mix(aR, 1.25, 0.6); aL = mix(aL, 1.2, 0.6); spr = 0.1; hop = 0.0; }   // 演奏が止まった(打った瞬間): 手を胸の前に止めて打球を見る
    } else if (rBand) {
      // 吹奏楽・トランペット: 立って吹く(高校の吹奏楽は 3 割が座ったまま)、拍で体を揺らす。太鼓は両手で交互に打つ
      stand = pro ? 1.0 : step(h3, 0.7);
      if (drum) { float p2 = 1.0 - smoothstep(0.0, 0.45, fract(bt + 0.5)); aR = 1.0 + 0.75 * hit; aL = 1.0 + 0.75 * p2 * play; spr = -0.22; lean = 0.12; }
      else { aR = aL = mix(0.7, 1.42 + 0.06 * pulse, play); lean = -0.06 * hit; sway = mix(sway, 0.05 * sin((t - uBeat0) / uBeatP * 1.5708 + h1), play); }
    } else if (rPom) {
      stand = 1.0; float k = mod(floor(bt), 4.0);
      aR = aL = k < 1.0 ? 2.8 : k < 2.0 ? 1.55 : k < 3.0 ? 2.8 : 0.35; spr = k < 1.0 || (k > 1.5 && k < 3.0) ? 0.45 : 0.1; hop = 0.05 * hit;
      if (play < 0.5) { aR = aL = 0.4; spr = 0.1; hop = 0.0; }
    } else if (rLead) {
      // リーダー(応援団の前の少数): 応援席の方を向いて、拍に合わせて両腕で指揮。2 小節の終わりは両手を上げる
      stand = 1.0; yawA = aP.w + 3.1416;
      float w = sin((t - uBeat0) / uBeatP * 3.1416);
      aR = 1.9 + 0.9 * w * play; aL = 1.9 - 0.9 * w * play; spr = 0.45;
      if (bi > 6.5 && play > 0.5) { aR = aL = 2.9; spr = 0.3; }
      if (play < 0.5) { aR = aL = 0.5; spr = 0.1; yawA = aP.w; }   // 打った瞬間はグラウンドの方へ向き直る
    }
  } else if (rBand) { aR = aL = drum ? 0.45 : 0.62; }
  else if (rCheer) { aR = aL = 0.25; stand = rLead && !pro ? 1.0 : 0.0; }
  // 守りの時の応援席: 座って、時々手をたたく・声を出す(高校は演奏しない)
  if (defs && rStu && h3 < 0.5 && fract(t / (6.0 + h1 * 5.0) + h2) < 0.12) { aR = aL = 1.3; spr = 0.12 + 0.12 * sin(t * 20.0 + h1 * 6.0); fanA = 0.0; lean = 0.08; }
  // ピンチの守る側(高校野球): 手を合わせて祈る
  if (defs && chance && rStu && !pro) { aR = aL = 1.05; spr = -0.24; lean = 0.2; fanA = 0.0; }
  // 攻める側の近くの一般の客(内野・外野)は、曲に合わせて座ったまま手拍子する人がいる
  if (rGen && play > 0.5 && uAttack != 0.0 && aP.x * uAttack > 0.0 && h4 < (pro ? 0.18 : 0.1) && hasFan < 0.5 && fract(t / (40.0 + h1 * 30.0) + h3) < 0.5) {
    aR = aL = 1.3; spr = mix(0.04, 0.28, 1.0 - pulse); }
  // エール交換: 応援団が腕を大きく振り、生徒は拍手(三塁側 → 一塁側の順)
  float ydt = t - uYell.x;
  if (side != 0.0 && ydt > 0.0 && ydt < uYell.y) {
    bool mine = (side < 0.0) == (ydt < uYell.y * 0.5);
    if (rLead && mine) { stand = 1.0; float w = sin(ydt * 2.6); aR = 1.6 + 1.3 * w; aL = 1.6 - 1.3 * w; spr = 0.5; yawA = aP.w; }
    else if (rStu || rBand) { stand = max(stand, mine ? 1.0 : 0.0); aR = aL = 1.3; spr = 0.12 + 0.12 * sin(t * 22.0 + h1 * 6.0); fanA = 0.0; }
  }
  // 場面の合図(歓声と同じ時刻)。人ごとに 0.1〜0.6 秒の遅れ
  vec4 e = side < -0.5 ? uEvL : side > 0.5 ? uEvR : uEvN;
  float dly = 0.12 + h2 * 0.45;
  float env = evEnv(e, t, dly) * step(h4, e.y);
  if (env > 0.0) {
    float edt = t - e.x - dly;
    float clap = 0.12 + 0.12 * sin(t * 22.0 + h1 * 6.0);
    if (e.w < 1.5) {   // 拍手(座ったまま。立つのは 1 割)
      aR = mix(aR, 1.3, env); aL = mix(aL, 1.3, env); spr = mix(spr, clap, env);
      stand = max(stand, env * step(h3, 0.1)); fanA *= 1.0 - env;
    } else if (side == 0.0) {
      // 一般の客: 立つ人の割合は場面の大きさで(好守・長打 4 割、得点 3 割、ホームラン・サヨナラ 9 割)。
      // 初めの 1.5 秒は両手を上げて歓声、そのあと胸の前で拍手。合図の長さ(5〜9 秒)で座る
      float frac = e.w > 3.5 ? 0.9 : e.w > 2.5 ? 0.3 : 0.4;
      stand = max(stand, env * step(h3, frac));
      float hands = (1.0 - smoothstep(1.2, 2.0, edt)) * step(h2, e.w > 3.5 ? 0.7 : 0.35);
      aR = mix(aR, mix(1.3, 2.65, hands), env); aL = mix(aL, mix(1.3, 2.5, hands), env);
      spr = mix(spr, mix(clap, 0.3, hands), env); fanA *= 1.0 - env;
    } else if (atk && e.w > 2.5) {
      // 応援席の得点・ホームラン: 両手(メガホン)を突き上げて跳ね、3 秒ほどで応援歌(得点の歌)の拍へ戻る
      float k = env * (1.0 - smoothstep(2.5, 3.5, edt));
      stand = max(stand, env);
      aR = mix(aR, 2.75 + 0.15 * sin(t * 14.0 + h1 * 6.0) * hasMega, k); aL = mix(aL, 2.65, k * step(h2, 0.85)); spr = mix(spr, 0.3, k);
      hop = mix(hop, (pro ? 0.06 : 0.1) * abs(sin(t * 6.0 + h1 * 6.0)) * step(h5, 0.7), k);
      fanA *= 1.0 - env;
    } else {           // 応援席: 立って手を上げる(攻める側のヒット・守る側の好守など)
      stand = max(stand, env);
      float up = env * step(h3, 0.8);
      aR = mix(aR, 2.7 + 0.18 * sin(t * 9.0 + h1 * 6.0), up);
      aL = mix(aL, 2.65, up * step(h2, 0.65));
      spr = mix(spr, 0.33, up); fanA *= 1.0 - env;
      if (hasMega > 0.5) aR += up * 0.25 * sin(t * 16.0 + h1 * 6.0);
    }
  }
  // 7 回の攻撃の前(プロ風): 攻める側の応援席と、その側の一般の客の一部が立って風船を掲げ、一斉に放して拍手
  float bdt = t - uBal.x;
  if (pro && bdt > -0.5 && bdt < 6.0 && (abs(side - uBal.y) < 0.5 || (rGen && aP.x * uBal.y > 0.0 && h4 < 0.35))) {
    stand = max(stand, rGen ? step(h3, 0.6) : 1.0);
    float rel = smoothstep(0.0, 0.4, bdt - h1 * 1.4);
    aR = mix(2.3, 2.85, rel); aL = mix(0.7, 1.3, rel); spr = 0.1; fanA = 0.0; hop = 0.0;
    if (bdt > 2.6) { aR = aL = 1.3; spr = 0.12 + 0.12 * sin(t * 22.0 + h1 * 6.0); }
  }
  // 試合の終わり: 勝った側は立って喜ぶ(高校野球は 6 秒のあと校歌を立って聞き、そのあと拍手)、負けた側は座ってうつむき、少しして拍手を送る
  float edt = t - uEnd.x;
  if (side != 0.0 && edt > dly && edt < 40.0) {
    yawA = aP.w;
    if (abs(side - uEnd.y) < 0.5) { stand = 1.0;
      if (edt < 6.0) { aR = 2.7 + 0.2 * sin(t * 8.0 + h1 * 6.0); aL = 2.6; spr = 0.35; hop = (pro ? 0.05 : 0.12) * abs(sin(t * 6.0 + h1 * 6.0)) * step(h5, 0.75); }
      else if (!pro && edt < 24.0) { aR = aL = 0.3; spr = 0.0; hop = 0.0; sway = 0.025 * sin(t * 1.4 + h1 * 6.0); }
      else { aR = aL = 1.3; spr = 0.12 + 0.12 * sin(t * 20.0 + h1 * 6.0); hop = 0.0; } }
    else { fanA = 0.0; hop = 0.0;
      if (edt < 4.0 + h1 * 2.0) { stand = 0.0; lean = 0.42; aR = aL = 0.3; spr = 0.0; }
      else { stand = !pro && edt > 12.0 ? step(h3, 0.8) : 0.0; aR = aL = 1.3; spr = 0.12 + 0.12 * sin(t * 20.0 + h1 * 6.0); lean = 0.15 * (1.0 - stand); } }   // 高校野球は選手のあいさつに立って拍手
  } else if (side == 0.0 && edt > dly && edt < 12.0) { aR = aL = 1.3; spr = 0.12 + 0.12 * sin(t * 22.0 + h1 * 6.0); fanA = 0.0; }
  float envL = evEnv(vec4(uLeanT, uLeanK, 1.8, 0.0), t, dly * 0.35) * step(h4, uLeanK + 0.25);
  lean = max(lean, 0.3 * envL);
  stand = clamp(stand, 0.0, 1.0);
`;
// 11/21 席に座っている間(main.js の syncSeatView が uSeatV・uSeatF を入れる): 目の前の数列(前 uSeatF.w m・横に広がる扇の中・目より下)の人だけ、
// 立たない・腕を頭より上げない・旗を下ろす・グラウンドへの見通しの線(目から前 1 m で uSeatF.z だけ下がる)より頭が出る分だけ深く座る。
// 扇の外側・奥の端はなめらかに戻すので、境目で人が急に変わらない。横・後ろ・遠くの人はそのまま
const SEAT_VIEW = /* glsl */`
  float seatSink = 0.0;
  if (uSeatV.w > 0.5) {
    vec3 rv = aP.xyz - uSeatV.xyz;
    float al = dot(rv.xz, uSeatF.xy), la = abs(rv.x * uSeatF.y - rv.z * uSeatF.x);
    float cw = 0.9 + al * 1.35;
    if (length(rv.xz) < 0.5 && rv.y < 0.3 && rv.y > -1.8) seatSink = 60.0;   // 11/21 自分の席に座っている観客は消す(内野席へワープしてすぐ座ると、目がその人の体の中に入っていた)
    float fk = step(0.25, al) * step(rv.y, -0.2) * (1.0 - smoothstep(uSeatF.w * 0.65, uSeatF.w, al)) * (1.0 - smoothstep(cw * 0.75, cw, la));
    // 11/21 夜 持ち主「席に座っても邪魔にならないように」: 同じ列と 1 列後ろの左右 2.4 m の人も、立つ・腕を上げるのを止める(ホームランで隣が立つと腕と体が画面の端をふさいだ)。深く座らせはしない
    // 前の扇の外側(画面の左右の端に入る前の人)も同じく立たせない
    float sk = step(-1.0, al) * step(al, 0.25) * step(abs(rv.y + 0.93), 0.75) * (1.0 - smoothstep(1.6, 2.4, la));
    sk = max(sk, step(0.25, al) * step(rv.y, -0.2) * (1.0 - smoothstep(uSeatF.w * 0.65, uSeatF.w, al)) * (1.0 - smoothstep(cw * 1.5, cw * 1.5 + 1.0, la)));
    float mcap = hasMega > 0.5 ? 0.95 : 1.2;   // メガホンは手の先 35 cm あるので、持っている人は腕をもっと下げる
    if (sk > 0.0 && fk <= 0.0 && seatSink < 1.0) { stand *= 1.0 - sk; hop *= 1.0 - sk; hasFlag *= step(sk, 0.5); if (sk > 0.3) yawA = aP.w;
      aR = mix(aR, min(aR, mcap), sk); aL = mix(aL, min(aL, mcap), sk); }
    if (fk > 0.0 && seatSink < 1.0) {
      stand *= 1.0 - fk; hop *= 1.0 - fk; if (fk > 0.3) yawA = aP.w; towelUp *= 1.0 - fk; hasFlag *= step(fk, 0.5);
      aR = mix(aR, min(aR, min(1.05, mcap)), fk); aL = mix(aL, min(aL, min(1.05, mcap)), fk); spin *= 1.0 - fk;
      float over = rv.y + 0.93 + al * uSeatF.z;   // 頭のてっぺんが見通しの線より上に出ている高さ
      seatSink = clamp(over + 0.12, 0.0, mix(0.4, 0.7, smoothstep(3.0, 10.0, al))) * fk;   // 遠い列(小さく見える)はもう少し深くてよい
    }
  }
`;

// 近くの人の形: 選手の体(players_v3/player.glb)を軽くした物(models/crowd/person.json、tools/crowd_person.py で作る)と持ち物
function personGeometry(THREE, J) {
  const P = [], N = [], S = [], NS = [], Q = [], M = [], W = [], LG = [], TL = [];
  for (let i = 0; i < J.n; i++) {
    LG.push(0, 0, 0); TL.push(0, 0, 0);
    P.push(J.seat[i * 3], J.seat[i * 3 + 1], J.seat[i * 3 + 2]); N.push(J.nSeat[i * 3], J.nSeat[i * 3 + 1], J.nSeat[i * 3 + 2]);
    S.push(J.stand[i * 3], J.stand[i * 3 + 1], J.stand[i * 3 + 2]); NS.push(J.nStand[i * 3], J.nStand[i * 3 + 1], J.nStand[i * 3 + 2]);
    Q.push(J.part[i]); M.push(J.mat[i]); W.push(J.w[i * 3], J.w[i * 3 + 1], J.w[i * 3 + 2]);
  }
  // 頭のてっぺん(肌の頂点の一番上)から髪の位置を決める
  let top = -1, tz = 0, tn = 0;
  for (let i = 0; i < J.n; i++) if (J.mat[i] === 0 && J.part[i] === 0 && Math.abs(J.seat[i * 3]) < 0.08) top = Math.max(top, J.seat[i * 3 + 1]);
  for (let i = 0; i < J.n; i++) if (J.mat[i] === 0 && J.part[i] === 0 && J.seat[i * 3 + 1] > top - 0.05) { tz += J.seat[i * 3 + 2]; tn++; }
  const hc = [0, top - 0.1, tn ? tz / tn : 0];
  const sh = J.shoulderR, hand = J.handR;
  const add = (g, part, w, long, tl) => {
    g = g.index ? g.toNonIndexed() : g;
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      if (long) LG.push(long[i * 3], long[i * 3 + 1], long[i * 3 + 2]); else LG.push(0, 0, 0);
      if (tl) TL.push(tl[i * 3], tl[i * 3 + 1], tl[i * 3 + 2]); else TL.push(0, 0, 0);
      P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i));
      S.push(p.getX(i), p.getY(i), p.getZ(i)); NS.push(n.getX(i), n.getY(i), n.getZ(i)); Q.push(part); M.push(9); W.push(w[0], w[1], w[2]);
    }
  };
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const R = [0, 1, 0], L = [1, 0, 0], B = [0, 0, 0];
  const atHand = (g) => g.translate(hand[0], hand[1], hand[2]);          // 手の位置を原点にして作った物を手へ
  const atHandL = (g) => g.translate(-hand[0], hand[1], hand[2]);
  // 4 髪(頭の上と後ろ)
  // 11/20 女性は縁(いちばん下の輪)を後ろ・横へ下ろして肩までの髪にする(aLong の分だけ動かす。三角形は増やさない)。顔の前は下ろさない
  {
    const hg = new THREE.SphereGeometry(0.104, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55).toNonIndexed();
    const pa = hg.attributes.position, long = new Float32Array(pa.count * 3), tl = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      if (y > -0.01) continue;                       // 縁の輪だけ(回す前の y が赤道より下)
      const l = Math.hypot(x, z) || 1, dx = x / l, dz = z / l;   // +z が後ろ(rotateX で後ろへ傾く)
      const b = Math.min(1, Math.max(0, (dz + 0.55) / 1.25)), down = 0.3 * b * b * (3 - 2 * b);   // 11/20 夕 背中の上まで
      long[i * 3] = dx * 0.024 * b; long[i * 3 + 1] = -down; long[i * 3 + 2] = (dz * 0.024 + 0.016) * b;
      // まとめ髪: 後ろの真ん中(dz > 0.6)の縁だけを後ろ下へ引き出す(後ろ・斜め後ろから尾の形が見える)。横は少し上げて耳の上でまとめた形
      const w = Math.min(1, Math.max(0, (dz - 0.6) / 0.35));
      tl[i * 3] = -dx * 0.03 * w; tl[i * 3 + 1] = -0.2 * w + 0.012 * (1 - w); tl[i * 3 + 2] = 0.11 * w;
    }
    add(hg.rotateX(0.42).scale(0.95, 1.05, 1.02).translate(hc[0], hc[1] + 0.012, hc[2] + 0.008), 4, B, long, tl);
  }
  // 8 首のタオル
  add(box(0.3, 0.04, 0.2, 0, sh[1] + 0.06, sh[2] - 0.01), 8, B);
  add(box(0.06, 0.18, 0.015, -0.07, sh[1] - 0.04, sh[2] - 0.11), 8, B); add(box(0.06, 0.18, 0.015, 0.07, sh[1] - 0.04, sh[2] - 0.11), 8, B);
  // 右手の持ち物。9 うちわ・10 タオル・11 メガホン(長さ 35cm)・12 小旗・13 楽器・14 右のポンポン、15 左のポンポン
  add(atHand(new THREE.CylinderGeometry(0.11, 0.11, 0.01, 10).rotateZ(Math.PI / 2).translate(0, -0.17, 0)), 9, R);
  add(atHand(box(0.018, 0.1, 0.018, 0, -0.05, 0)), 9, R);
  add(atHand(box(0.17, 0.62, 0.006, 0, -0.31, 0).rotateZ(0.9)), 10, R);   // マフラータオル(20cm x 110cm を半分に持つ)
  add(atHand(new THREE.CylinderGeometry(0.022, 0.065, 0.35, 10, 1, true).translate(0, -0.2, 0)), 11, R);
  add(atHand(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 4).translate(0, -0.42, 0)), 12, R);
  add(atHand(box(0.008, 0.26, 0.4, 0, -0.74, -0.2)), 12, R);
  add(atHand(new THREE.CylinderGeometry(0.016, 0.06, 0.34, 8, 1, true).translate(-0.04, -0.17, -0.02)), 13, R);
  add(atHand(new THREE.IcosahedronGeometry(0.1, 0).scale(1, 1.2, 1).translate(0, -0.06, 0)), 14, R);
  add(atHandL(new THREE.IcosahedronGeometry(0.1, 0).scale(1, 1.2, 1).translate(0, -0.06, 0)), 15, L);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(S, 3));
  g.setAttribute('aNS', new THREE.Float32BufferAttribute(NS, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(Q, 1));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(M, 1));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(W, 3));
  g.setAttribute('aLong', new THREE.Float32BufferAttribute(LG, 3));
  g.setAttribute('aTail', new THREE.Float32BufferAttribute(TL, 3));
  return g;
}

const NEAR_VERT = /* glsl */`
  int part = int(aPart + 0.5);
  float vis = 1.0;
  float spinOn = spin != 0.0 || towelUp > 0.5 ? 1.0 : 0.0;
  if (part == 5) vis = hasHat; else if (part == 8) vis = neckT * (1.0 - spinOn); else if (part == 9) vis = hasFan;
  else if (part == 10) vis = spinOn; else if (part == 11) vis = hasMega; else if (part == 12) vis = hasFlag; else if (part == 13) vis = hasInst;
  else if (part >= 14) vis = hasPom;
  vec3 so = vec3(0.0, 0.45, -0.11) * stand;
  vec3 p, nn;
  if (part == 0 || part == 5) { p = mix(position, aS, stand); nn = normalize(mix(normal, aNS, stand)); }
  else { p = position + so; nn = normal; }
  if (part == 4 && fem) p += ageK > 1.5 ? vec3(aLong.x * 0.9, -aLong.y * 0.12, aLong.z * 0.5) : tail ? aTail : aLong * longK;   // 年配の女性は短い髪(後ろの縁を上げて襟足を見せ、横へ少しふくらませる)   // 女性の髪(背中の上まで・肩まで・まとめ髪)
  // 子供: 頭(肌・髪・帽子)を首のつけ根から 1.22 倍(体に比べて頭が大きい)
  if (kid && (part == 4 || part == 5 || (part == 0 && aMat < 0.5 && position.y > 0.6 && aW.x + aW.y < 0.05))) { vec3 N0 = vec3(0.0, 0.64, 0.046) + so; p = N0 + (p - N0) * 1.22; }
  if (aW.y > 0.0) {
    vec3 S0 = uShR + so, q = p - S0, qn = nn;
    if (part >= 9 && part <= 13) { float r = part == 10 ? spin : fanA; vec3 ax = vec3(uHandR.x - uShR.x, 0.0, uHandR.z - uShR.z); q = rotY(q - ax, r) + ax; qn = rotY(qn, r); }
    q = rotX(rotZ(q, spr), aR); qn = rotX(rotZ(qn, spr), aR);
    p = mix(p, S0 + q, aW.y); nn = normalize(mix(nn, qn, aW.y));
  }
  if (aW.x > 0.0) {
    vec3 S0 = vec3(-uShR.x, uShR.y, uShR.z) + so, q = p - S0, qn = nn;
    q = rotX(rotZ(q, -spr), aL); qn = rotX(rotZ(qn, -spr), aL);
    p = mix(p, S0 + q, aW.x); nn = normalize(mix(nn, qn, aW.x));
  }
  vec3 H = uHip + so;
  float wu = 1.0 - aW.z;
  p = mix(p, H + rotZ(rotX(p - H, -lean), sway), wu); nn = normalize(mix(nn, rotZ(rotX(nn, -lean), sway), wu));
  p.y += hop;
  if (fem) p.x *= 0.85;   // 女性は肩幅・体の線を細く
  float nearIn = step(distance(aP.xyz, uNearC), uNearR);
  float keep = alive * vis * nearIn;
  p *= aC.w * keep;
  vec3 myPos = rotY(p, yawA) + aP.xyz;
  vec3 myNrm = rotY(nn, yawA);
  // 色
  vec3 skin = mix(vec3(0.80, 0.52, 0.38), vec3(0.50, 0.28, 0.17), aF.w);
  vec3 hair = ageK > 1.5 ? (h3 < 0.25 ? vec3(0.3, 0.29, 0.27) : h3 < 0.6 ? vec3(0.13, 0.12, 0.11) : h3 < 0.8 ? vec3(0.02) : vec3(0.24, 0.14, 0.08)) : h3 < (fem ? 0.5 : 0.75) ? vec3(0.008) : h3 < (fem ? 0.8 : 0.92) ? vec3(0.03, 0.016, 0.009) : fem ? vec3(0.17, 0.08, 0.03) : vec3(0.13, 0.06, 0.025);
  vec3 pants = rBand || abs(role - 4.0) < 0.5 ? vec3(0.01) : abs(role - 3.0) < 0.5 ? schS : h2 < 0.35 ? vec3(0.04, 0.07, 0.17) : h2 < 0.55 ? vec3(0.01) : h2 < 0.75 ? vec3(0.33, 0.27, 0.18) : h2 < 0.9 ? vec3(0.2) : vec3(0.8);
  // 女性のスカート(ももは下の服の色、すねは素足か黒いタイツ)・ワンピース(ももも上の服の色)。座った形の y が -0.12 より上がもも(11/22 夜 座った形の脚を曲げたので、立った形 aS から元の高さを出して決める)
  if (lowK > 0.5) { vec3 legC = h4 < 0.7 ? skin * 0.97 : vec3(0.03); pants = aS.y - 0.45 > -0.12 ? (lowK > 1.5 ? aC.rgb * 0.95 : pants) : legC; }
  vec3 towel = h4 < (uStyle > 0.5 && side != 0.0 ? 0.15 : 0.55) ? vec3(0.9) : side != 0.0 ? schM : uStyle > 0.5 ? uSchB : h4 < 0.75 ? vec3(0.45, 0.65, 0.85) : vec3(0.9, 0.75, 0.2);   // 11/21 プロ風はタオルもチームの色(一般の客はホームの色)
  int mt = int(aMat + 0.5);
  vec3 col = aC.rgb; vGlint = 0.0;
  if (part == 0) col = mt == 0 ? skin : mt == 2 ? pants : mt == 3 ? vec3(0.02) : (abs(role - 3.0) < 0.5 && aW.x + aW.y > 0.5 ? skin : aC.rgb);
  else if (part == 4) col = hair; else if (part == 5) col = aH.rgb;
  else if (part == 8 || part == 10) col = towel;
  else if (part == 9) col = side != 0.0 ? schS : (h1 < 0.5 ? vec3(0.9) : h1 < 0.75 ? vec3(0.75, 0.08, 0.06) : vec3(0.08, 0.2, 0.6));
  else if (part == 11) col = schS; else if (part == 12) col = position.y < uHandR.y - 0.6 ? schM : vec3(0.5);
  else if (part == 13) { col = h1 < 0.8 ? vec3(0.85, 0.6, 0.18) : vec3(0.75); vGlint = pow(0.5 + 0.5 * sin(t * 2.3 + h1 * 40.0), 12.0) * (atk ? 1.0 : 0.3); }
  else if (part >= 14) col = schS;
  vCol = col;
`;

const FAR_VERT = /* glsl */`
  vec3 toC = cameraPosition - aP.xyz;
  vec2 tc = normalize(toC.xz + vec2(1e-4));
  vec3 rgt = vec3(tc.y, 0.0, -tc.x);
  vec3 fwd = vec3(-sin(yawA), 0.0, -cos(yawA));
  float front = step(-0.15, dot(fwd.xz, tc));
  float mir = dot(vec3(cos(yawA), 0.0, -sin(yawA)), rgt) >= 0.0 ? 1.0 : -1.0;
  float raise = max(max(aR, aL) - 1.2, 0.0) / 1.7 + max(hasFlag, spin != 0.0 ? 1.0 : 0.0);
  float top = 0.9 + 0.45 * stand + 0.7 * clamp(raise, 0.0, 1.0) + 0.25 * hasFlag * step(1.5, aR);
  float bot = stand > 0.02 ? -0.4 + 0.43 * stand : -0.02;
  float wid = 0.24 + 0.2 * clamp(raise + hasFan * step(1.0, aR) + spr * 1.5 + hasMega * step(1.5, aR) + max(hasInst, 0.0) * 0.3, 0.0, 1.0);
  vec2 bq = vec2(position.x * 2.0 * wid, mix(bot, top, position.y));
  float nearIn = uNearOn > 0.5 ? step(distance(aP.xyz, uNearC), uNearR) : 0.0;
  float keep = alive * (1.0 - nearIn);
  float sc = aC.w * keep;
  vec3 myPos = aP.xyz + rgt * bq.x * sc + vec3(0.0, bq.y * sc, 0.0) + vec3(tc.x, 0.0, tc.y) * 0.06 * sway;
  vec3 myNrm = normalize(fwd * 0.75 + vec3(tc.x, 0.0, tc.y) * 0.25 + vec3(0.0, 0.5, 0.0));   // 体の向きで日の当たり方が変わる
  vUV = bq; vShirt = aC.rgb; vHat = vec4(aH.rgb, hasHat);
  vP1 = vec4(stand, aR, aL, spr);
  vP2 = vec4(front, mir, rBand ? 1.0 : 0.0, role);
  vHs = vec4(aF.w, h3, h2, aF.z + 8.0 * lowK);   // w: 年代 + 4 × 女性 + 8 × 下の服
  vProp = vec4(hasFan, hasMega, hasFlag, neckT);
  vProp2 = vec4(fanA, spin, h1, h4);
  vSch = side < 0.0 ? uSchA : side > 0.0 ? uSchB : uStyle > 0.5 ? uSchB : vec3(-1.0);   // 11/21 プロ風は一般の客のタオル・うちわもホームの色
  vSch2 = side < 0.0 ? uSchA2 : uSchB2;
  vGlint = rBand ? pow(0.5 + 0.5 * sin(t * 2.3 + h1 * 40.0), 12.0) * (atk ? 1.0 : 0.3) : 0.0;
`;
const FAR_FRAG_DECL = /* glsl */`
varying vec2 vUV; varying vec3 vShirt; varying vec4 vHat; varying vec4 vP1; varying vec4 vP2; varying vec4 vHs; varying vec4 vProp; varying vec4 vProp2; varying vec3 vSch; varying vec3 vSch2; varying float vGlint;
float gDil;   // 遠くて小さい時は形を太らせて、点のちらつきを抑える
float sdBox2(vec2 p, vec2 b, float r) { vec2 d = abs(p) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r - gDil; }
float sdSeg(vec2 p, vec2 a, vec2 b, float r) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r - gDil; }
vec2 armDir(float a, float sp) { return vec2(sin(sp), -cos(sp) * cos(a)); }
`;
const FAR_FRAG = /* glsl */`
  vec2 q = vUV; float st = vP1.x; q.y -= 0.43 * st;
  float fw = fwidth(q.y); gDil = clamp(fw * 0.9, 0.0, 0.07); float far = clamp((fw - 0.012) / 0.03, 0.0, 1.0);   // far: 遠くて小さいほど 1
  float front = vP2.x, mir = vP2.y, role = vP2.w;
  bool cheer = role > 2.5;
  vec3 skin = mix(vec3(0.80, 0.52, 0.38), vec3(0.50, 0.28, 0.17), vHs.x);
  float lowK = floor(vHs.w / 8.0 + 0.01), azk = vHs.w - 8.0 * lowK, ageK = mod(azk, 4.0); bool fem = azk > 3.5, kid = ageK < 0.5;   // 11/20 女性と子供
  vec3 hair = ageK > 1.5 ? (vHs.y < 0.25 ? vec3(0.3, 0.29, 0.27) : vHs.y < 0.6 ? vec3(0.13, 0.12, 0.11) : vHs.y < 0.8 ? vec3(0.02) : vec3(0.24, 0.14, 0.08)) : vHs.y < (fem ? 0.5 : 0.75) ? vec3(0.008) : vHs.y < (fem ? 0.8 : 0.92) ? vec3(0.03, 0.016, 0.009) : fem ? vec3(0.17, 0.08, 0.03) : vec3(0.13, 0.06, 0.025);
  float h2 = vHs.z;
  float hst = fract(vProp2.z * 7.7), longK = (hst < 0.45 ? 1.0 : 0.55) * (ageK > 1.5 ? 0.3 : 1.0); bool tail = hst >= 0.7 && ageK < 1.5;
  vec3 pants = vP2.z > 0.5 ? vec3(0.01) : h2 < 0.35 ? vec3(0.04, 0.07, 0.17) : h2 < 0.55 ? vec3(0.01) : h2 < 0.75 ? vec3(0.33, 0.27, 0.18) : h2 < 0.9 ? vec3(0.2) : vec3(0.8);
  vec3 col = vec3(0.0); float dmin = 1.0; bool hit = false;
  // 脚(立っている時だけ見える。座っていれば前の席に隠れる)・座った膝
  float dLeg = st > 0.02 ? sdBox2(q - vec2(0.0, -0.13), vec2(0.15, 0.27), 0.04) : sdBox2(q - vec2(0.0, 0.07), vec2(0.165, 0.07), 0.04) + (front > 0.5 ? 0.0 : 1.0);
  if (dLeg < 0.0) { col = pants; hit = true;
    if (lowK > 0.5) col = (st < 0.02 || q.y > -0.08) ? (lowK > 1.5 ? vShirt * 0.95 : pants) : (vProp2.w < 0.7 ? skin * 0.97 : vec3(0.03)); }   // スカート・ワンピース: ももは服、すねは素足かタイツ
  dmin = min(dmin, abs(dLeg));
  // 胴
  float wT = (0.15 + 0.035 * clamp((q.y - 0.12) / 0.42, 0.0, 1.0)) * (fem ? 0.86 : 1.0);
  float dT = sdBox2(q - vec2(0.0, 0.34), vec2(wT, 0.21), 0.06);
  if (dT < 0.0) { col = vShirt * mix(0.62 + 0.38 * clamp((q.y - 0.1) / 0.42, 0.0, 1.0), 0.86, far); hit = true; } dmin = min(dmin, abs(dT));
  // 首のタオル
  if (vProp.w > 0.5 && vProp2.y == 0.0 && far < 0.7) {
    vec3 tw = vProp2.w < 0.55 ? vec3(0.9) : vSch.x >= 0.0 ? vSch : vec3(0.45, 0.65, 0.85);
    float dw = min(sdBox2(q - vec2(0.0, 0.54), vec2(0.17, 0.025), 0.02), front > 0.5 ? min(sdBox2(q - vec2(0.075, 0.44), vec2(0.035, 0.1), 0.01), sdBox2(q - vec2(-0.075, 0.44), vec2(0.035, 0.1), 0.01)) : 1.0);
    if (dw < 0.0) { col = tw; hit = true; }
  }
  // 女性の髪(後ろから: 肩までの髪の幅、前から: 顔の両側に下りる髪)
  if (fem) {
    float dHl = tail ? (front < 0.5 ? sdSeg(q, vec2(0.0, 0.7), vec2(0.0, 0.53), 0.034) : 1.0)
      : front < 0.5 ? sdBox2(q - vec2(0.0, 0.70 - 0.11 * longK), vec2(0.1, 0.03 + 0.11 * longK), 0.04)
      : min(sdBox2(q - vec2(0.088, 0.68 - 0.065 * longK), vec2(0.027, 0.03 + 0.065 * longK), 0.015), sdBox2(q - vec2(-0.088, 0.68 - 0.065 * longK), vec2(0.027, 0.03 + 0.065 * longK), 0.015));
    if (dHl < 0.0) { col = mix(hair, vShirt * 0.55, far * 0.35); hit = true; } dmin = min(dmin, abs(dHl));
  }
  // 頭・髪・帽子。子供は頭を 1.22 倍(首のつけ根から)
  float hk = kid ? 1.22 : 1.0;
  vec2 qh = (q - vec2(0.0, 0.6)) / hk + vec2(0.0, 0.6);
  float dH = (length((qh - vec2(0.0, 0.715)) * vec2(1.0, 0.93)) - 0.1) * hk - gDil;
  float dN = sdBox2(q - vec2(0.0, 0.6), vec2(0.04, 0.05), 0.01);
  if (dN < 0.0) { col = mix(skin * 0.8, vShirt * 0.8, far); hit = true; }
  if (dH < 0.0) { bool hr = front < 0.5 || qh.y > 0.738 - 0.06 * far || (abs(qh.x) > 0.064 - 0.03 * far && qh.y > 0.64); col = hr ? mix(hair, vShirt * 0.55, far * 0.35) : mix(skin, vHat.w > 0.5 ? vHat.rgb : hair, far * 0.6); hit = true; } dmin = min(dmin, abs(dH));
  if (vHat.w > 0.5) {
    float dc = min(sdBox2(qh - vec2(0.0, 0.79), vec2(0.1, 0.045), 0.035), sdBox2(qh - vec2(0.0, 0.765), vec2(0.15, 0.012), 0.01));
    if (dc < 0.0) { col = vHat.rgb; hit = true; }
  }
  // 腕(両腕。手を前に出すと胴の前に来る)
  for (int i = 0; i < 2; i++) {
    float sd = i == 0 ? 1.0 : -1.0;          // 1 = 右腕
    float a = i == 0 ? vP1.y : vP1.z;
    vec2 S = vec2((fem ? 0.162 : 0.19) * sd * mir, 0.53);
    vec2 dir = armDir(a, vP1.w); dir.x *= sd * mir;
    vec2 Hd = S + dir * 0.56;
    float dA = sdSeg(q, S, Hd, 0.045);
    if (dA < 0.0) { float u = clamp(dot(q - S, dir) / 0.56, 0.0, 1.0); col = (u < 0.42 + 0.5 * far && !cheer) ? vShirt * 0.92 : skin; hit = true; }
    dmin = min(dmin, abs(dA));
    if (i == 0 && far < 0.7) {   // 遠くでは持ち物を描かない(軽くする)
      // 右手の持ち物
      vec3 accent = vSch.x >= 0.0 ? vSch2 : vec3(0.85);
      if (vProp.x > 0.5 && a > 1.0) { vec2 c = Hd + dir * 0.12; float dF = length((q - c) * vec2(1.0 / (0.35 + 0.65 * abs(cos(vProp2.x))), 1.0)) - 0.09;
        if (dF < 0.0) { col = vSch.x >= 0.0 ? accent : (vProp2.z < 0.5 ? vec3(0.9) : vProp2.z < 0.75 ? vec3(0.75, 0.08, 0.06) : vec3(0.08, 0.2, 0.6)); hit = true; } }
      if (vProp.y > 0.5) { float dM = sdSeg(q, Hd, Hd + dir * 0.26, 0.03 + 0.03 * clamp(dot(q - Hd, dir) / 0.26, 0.0, 1.0)); if (dM < 0.0) { col = accent; hit = true; } }
      if (vProp.z > 0.5) { vec2 tp = Hd + dir * 0.85; float dS = sdSeg(q, Hd, tp, 0.012); float dC = sdBox2(q - (tp - dir * 0.15 + vec2(0.2 * sd * mir, 0.0)), vec2(0.2, 0.13), 0.01);
        if (dS < 0.0) { col = vec3(0.5); hit = true; } if (dC < 0.0) { col = vSch.x >= 0.0 ? vSch : vec3(0.9); hit = true; } }
      if (vProp2.y != 0.0) { vec2 tdir = vec2(cos(vProp2.y), 0.35 * sin(vProp2.y) + 0.2); float dW = sdSeg(q, Hd, Hd + tdir * 0.36, 0.04);
        if (dW < 0.0) { col = vProp2.w < 0.55 ? vec3(0.9) : vSch.x >= 0.0 ? vSch : vec3(0.45, 0.65, 0.85); hit = true; } }
    }
  }
  // 楽器(吹奏楽): 胸の前の金色
  float glint = 0.0;
  if (vP2.z > 0.5 && front > 0.5) { float dI = length(q - vec2(0.0, 0.5 + 0.08 * clamp(vP1.y - 1.0, 0.0, 1.0))) - 0.075; if (dI < 0.0) { col = vProp2.z < 0.8 ? vec3(0.85, 0.6, 0.18) : vec3(0.75); hit = true; glint = vGlint; } }
  if (!hit) discard;
  col *= mix(0.78 + 0.22 * smoothstep(0.0, 0.025, dmin), 0.95, clamp(fw / 0.04, 0.0, 1.0));   // ふちを少し暗く(1 人ずつ分かれて見える)
  vec4 diffuseColor = vec4(col, opacity);
`;

function weighted(list, r) {
  let tot = 0; for (const [, w] of list) tot += w;
  let x = r * tot; for (const [c, w] of list) { x -= w; if (x <= 0) return c; }
  return list[list.length - 1][0];
}

// 11/18 夜 席の向きと高さを直す(持ち主「外野に座る人が反転してたり」)。seats の中身をその場で書き換える(座る・歩く・観客が同じ値を使う)
// - 向き: 新しい球場の seats.bin(杜ノ丘・銀輪・汽笛ヶ原・灯台坂・観覧車の丘・潮凪)は yaw が 180 度逆(背中がグラウンド)。
//   席ごとに、前の向き (-sin yaw, -cos yaw) が本塁の方から 100 度より外れていたら 180 度回す(浜風・屋根・白樺はほぼ回らない)
// - 高さ: 席の y が段の床と同じ球場(座面の高さが入っていない)では、人が床に座って背もたれに埋まる。
//   席の真下と少し前の床を当たり判定で測り、席の y が床から 0.25 m 未満の球場は、全部の席を座面の高さ(床 + 0.42 m)へ上げる
// 11/21 持ち主「始めたときのローディングで画面が固まる」: 席の直し(数万の席に光線)を少しずつ進められる形(ジェネレーター)にした。
// main.js が読み込みの間に 1 こまずつ譲りながら回す(fixSeatsGen など)。今までの名前(fixSeats など)は最後まで一度に回す(結果は同じ)
function runSync(gen) { let r; do { r = gen.next(); } while (!r.done); return r.value; }
export function fixSeats(seats, groundAt) { return runSync(fixSeatsGen(seats, groundAt)); }
export function fixSeatsVisual(seats, chairAt) { return runSync(fixSeatsVisualGen(seats, chairAt)); }
export function fixSeatsSide(seats) { return runSync(fixSeatsSideGen(seats)); }
export function seatDownhill(seats) { return runSync(seatDownhillGen(seats)); }
export function* fixSeatsGen(seats, groundAt) {
  const N = seats.n, st = { n: N, flipped: 0, turned: 0, lifted: 0 };
  for (let i = 0; i < N; i++) {
    const x = seats.x[i], z = seats.z[i], l = Math.hypot(x, z) || 1;
    let y = seats.yaw[i];
    const d = (Math.sin(y) * x + Math.cos(y) * z) / l;   // = 前の向き・本塁への向き
    if (d < -0.17) { y += Math.PI; if (y > Math.PI) y -= 2 * Math.PI; seats.yaw[i] = y; st.flipped++; }
  }
  // 段の下り(近く 2.5 m・高さの差 1.5 m 以内の席で平面を当てる。上下に重なった段は混ぜない)と逆を向いている席は、下りの向きへ
  const down = yield* seatDownhillGen(seats);
  for (let i = 0; i < N; i++) {
    const dx = down[i * 2], dz = down[i * 2 + 1]; if (!dx && !dz) continue;
    const fx = -Math.sin(seats.yaw[i]), fz = -Math.cos(seats.yaw[i]);
    const l = Math.hypot(seats.x[i], seats.z[i]) || 1, toHome = -(dx * seats.x[i] + dz * seats.z[i]) / l;
    if (dx * fx + dz * fz < -0.17 && toHome > 0) { seats.yaw[i] = Math.atan2(-dx, -dz); st.turned++; }   // 下りが本塁と逆の所(最上段の裏など)は回さない
  }
  // 座面の高さ: 席の真下の床から 0.2 m 未満の席は、床 + 0.42 m へ
  // そのあと、席の真下の一番上の面が座面の 0.2〜0.65 m 下になるように、席を段の前後へ最大 0.5 m ずらす(段の角・段と段の間に座らない)
  if (groundAt) {
    st.moved = 0; st.left = 0;
    for (let i = 0; i < N; i++) {
      if ((i & 127) === 127) yield;
      const y = seats.y[i], g = groundAt(seats.x[i], seats.z[i], y + 0.3, 3);
      if (g == null) continue;
      const h = y - g;
      if (h > -0.35 && h < 0.2) { seats.y[i] = g + 0.42; st.lifted++; }
    }
    const K = [0, -0.1, 0.1, -0.2, 0.2, -0.3, 0.3, -0.4, 0.4, -0.5, 0.5];
    for (let i = 0; i < N; i++) {
      if ((i & 63) === 63) yield;
      const x = seats.x[i], z = seats.z[i], y = seats.y[i];
      let dx = down[i * 2], dz = down[i * 2 + 1];
      if (!dx && !dz) { const l = Math.hypot(x, z) || 1; dx = -x / l; dz = -z / l; }
      let ok = false;
      for (const k of K) {
        const px = x + dx * k, pz = z + dz * k, g = groundAt(px, pz, y + 1.0, 3);
        if (g == null) continue;
        const h = y - g;
        if (h >= 0.2 && h <= 0.65) { if (k) { seats.x[i] = px; seats.z[i] = pz; st.moved++; } ok = true; break; }
      }
      if (!ok) st.left++;
    }
    // 高さを直した後の段で、もう一度向きを確かめる
    const down2 = yield* seatDownhillGen(seats);
    for (let i = 0; i < N; i++) {
      const dx = down2[i * 2], dz = down2[i * 2 + 1]; if (!dx && !dz) continue;
      const fx = -Math.sin(seats.yaw[i]), fz = -Math.cos(seats.yaw[i]);
      const l = Math.hypot(seats.x[i], seats.z[i]) || 1, toHome = -(dx * seats.x[i] + dz * seats.z[i]) / l;
      if (dx * fx + dz * fz < -0.17 && toHome > 0) { seats.yaw[i] = Math.atan2(-dx, -dz); st.turned++; }
    }
  }
  return st;
}
// 11/19 持ち主「変な向きの観客…全部なくして」: 見た目の椅子(seats.glb)に合わせる。chairAt(x, z, fromY, maxDown) = 上から落とした光線が椅子に当たる高さ。
// 腰(席の y)の真上 1 m から落として、腰より 0.12 m 上に椅子がある(背もたれ・前の椅子に埋まる)席は、前後(向いている方)へ最大 0.6 m 探して、
// 椅子の座面が腰の高さ(-0.15〜+0.08)で、その上が空いている所へ移す。見つからない席は地面の下へ隠す(y = -1000。座る・歩く人も選ばない)
export function* fixSeatsVisualGen(seats, chairAt) {
  const N = seats.n, st = { checked: 0, moved: 0, hidden: 0 };
  // 探す所: 向いている方へ前後 0〜0.6 m × 横 0〜0.3 m(近い順)
  const C = [];
  for (const k of [0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3, 0.4, -0.4, 0.5, -0.5, 0.6, -0.6]) for (const l of [0, 0.15, -0.15, 0.3, -0.3]) C.push([k, l, Math.hypot(k, l)]);
  C.sort((a, b) => a[2] - b[2]);
  for (let i = 0; i < N; i++) {
    if ((i & 31) === 31) yield;
    const y = seats.y[i]; if (y < -100) continue;
    const fx = -Math.sin(seats.yaw[i]), fz = -Math.cos(seats.yaw[i]), x = seats.x[i] + fx * 0.05, z = seats.z[i] + fz * 0.05;
    const h = chairAt(x, z, y + 1.0, 1.2); st.checked++;
    if (h === null || h <= y + 0.12) continue;
    let ok = false;
    for (const [k, l] of C) {
      if (!k && !l) continue;
      const px = x + fx * k - fz * l, pz = z + fz * k + fx * l, hh = chairAt(px, pz, y + 1.0, 1.4);
      // 上から落とした光線が最初に当たるのが腰の高さの座面(-0.3〜+0.25)なら、その上は空いている
      if (hh !== null && hh > y - 0.3 && hh < y + 0.25) { seats.x[i] = px - fx * 0.05; seats.z[i] = pz - fz * 0.05; seats.y[i] = Math.max(hh + 0.02, y - 0.3); st.moved++; ok = true; break; }
    }
    if (!ok) { seats.y[i] = -1000; st.hidden++; }
  }
  return st;
}
// 11/19 本体「観客の横向き(ドームの外野 557・白樺の外野 527 など)」: 前の向きが段の下りから 45 度より外れた席を、下りから 35 度以内へ回す(本塁の側へ少し向けたまま)。
// 段の下りはその席の 2.5 m の平面、分からない席は近く 4 m の席の下りの平均
export function* fixSeatsSideGen(seats) {
  const N = seats.n, st = { turned: 0 }, d = yield* seatDownhillGen(seats), sm = new Float32Array(N * 2);
  const cell = new Map(), key = (x, z) => Math.floor(x / 4) * 100003 + Math.floor(z / 4);
  for (let i = 0; i < N; i++) { if (seats.y[i] < -100) continue; const k = key(seats.x[i], seats.z[i]); let q = cell.get(k); if (!q) cell.set(k, q = []); q.push(i); }
  for (let i = 0; i < N; i++) {
    if ((i & 511) === 511) yield;
    if (seats.y[i] < -100) continue;
    const x = seats.x[i], z = seats.z[i], y = seats.y[i], cx = Math.floor(x / 4), cz = Math.floor(z / 4);
    let sx = 0, sz = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const q = cell.get((cx + a) * 100003 + (cz + b)); if (!q) continue;
      for (const j of q) { if (!d[j * 2] && !d[j * 2 + 1]) continue; const X = seats.x[j] - x, Z = seats.z[j] - z; if (X * X + Z * Z > 16 || Math.abs(seats.y[j] - y) > 2) continue; sx += d[j * 2]; sz += d[j * 2 + 1]; } }
    const l = Math.hypot(sx, sz); if (l < 1e-3) continue;
    sm[i * 2] = sx / l; sm[i * 2 + 1] = sz / l;
  }
  const LIM = 35 * Math.PI / 180;
  for (let i = 0; i < N; i++) {
    // 段の下り: その席の近く 2.5 m の平面(seatDownhill)があればそれ、無ければ 4 m の平均。平均だけだと段の向きが変わる角で 1 席ずつの横向きが残った(汽笛ヶ原)
    const raw = d[i * 2] || d[i * 2 + 1], dx = raw ? d[i * 2] : sm[i * 2], dz = raw ? d[i * 2 + 1] : sm[i * 2 + 1]; if (!dx && !dz) continue;
    { const l = Math.hypot(seats.x[i], seats.z[i]) || 1; if (-(dx * seats.x[i] + dz * seats.z[i]) / l < 0.2) continue; }   // 下りが本塁と逆の所(上の段の裏など)は回さない
    const fx = -Math.sin(seats.yaw[i]), fz = -Math.cos(seats.yaw[i]);
    const ang = Math.atan2(dx * fz - dz * fx, dx * fx + dz * fz);   // 下り → 前の向きの角度(符号つき)
    if (Math.abs(ang) <= 45 * Math.PI / 180) continue;
    const a2 = Math.sign(ang) * LIM, c = Math.cos(a2), s2 = Math.sin(a2);
    const nx = dx * c - dz * s2, nz = dx * s2 + dz * c;   // 下りを a2 だけ回す(上の角度の向きと合わせる)
    seats.yaw[i] = Math.atan2(-nx, -nz); st.turned++;
  }
  return st;
}
// 席ごとの段の下りの向き(xz の単位ベクトル。分からない席は 0)
export function* seatDownhillGen(seats) {
  const N = seats.n, out = new Float32Array(N * 2), cell = new Map(), key = (x, z) => Math.floor(x / 2.5) * 100003 + Math.floor(z / 2.5);
  for (let i = 0; i < N; i++) { const k = key(seats.x[i], seats.z[i]); let q = cell.get(k); if (!q) cell.set(k, q = []); q.push(i); }
  for (let i = 0; i < N; i++) {
    if ((i & 511) === 511) yield;
    const x = seats.x[i], z = seats.z[i], y = seats.y[i], cx = Math.floor(x / 2.5), cz = Math.floor(z / 2.5);
    let sxx = 0, szz = 0, sxz = 0, sxy = 0, szy = 0, n = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const q = cell.get((cx + a) * 100003 + (cz + b)); if (!q) continue;
      for (const j of q) { const X = seats.x[j] - x, Z = seats.z[j] - z, Y = seats.y[j] - y; if (X * X + Z * Z > 6.25 || Math.abs(Y) > 1.5) continue; n++; sxx += X * X; szz += Z * Z; sxz += X * Z; sxy += X * Y; szy += Z * Y; }
    }
    if (n < 8) continue;
    const det = sxx * szz - sxz * sxz; if (Math.abs(det) < 1e-6) continue;
    const A = (sxy * szz - szy * sxz) / det, B = (szy * sxx - sxy * sxz) / det, g = Math.hypot(A, B);
    if (g < 0.25) continue;
    out[i * 2] = -A / g; out[i * 2 + 1] = -B / g;
  }
  return out;
}

export class Crowd {
  // o: { THREE, scene, seats, sound, stadium, getQuality(), getTime(), getHide() → [x, y, z, r] }
  constructor(o) {
    Object.assign(this, o);
    const THREE = this.THREE;
    this.clockOverride = null;
    this.visible = true;
    this.fill = 1;
    try { const f = JSON.parse(localStorage.getItem('r4walk.fill') || '1'); if (typeof f === 'number') this.fill = f; } catch (e) { /* 使えない環境 */ }
    const lin = (h) => new THREE.Color(h);
    this.U = {
      uT: { value: 0 }, uBeat0: { value: 0 }, uBeatP: { value: 0.5 }, uPlay: { value: 0 }, uBal: { value: new THREE.Vector4(-99, 0, 0, 0) }, uPress: { value: 0 }, uAttack: { value: -1 }, uHatK: { value: 1 }, uFanK: { value: 0.3 },
      uNearR: { value: 26 }, uNearOn: { value: 1 }, uLeanT: { value: -99 }, uLeanK: { value: 0 },
      uNearC: { value: new THREE.Vector3(0, -999, 0) }, uHide: { value: new THREE.Vector4(0, -999, 0, 0) }, uHideUp: { value: new THREE.Vector4(0, 999, 0, 0) }, uFill: { value: new THREE.Vector3(1, 1, 1) },
      uEvL: { value: new THREE.Vector4(-99, 0, 1, 0) }, uEvR: { value: new THREE.Vector4(-99, 0, 1, 0) }, uEvN: { value: new THREE.Vector4(-99, 0, 1, 0) },
      uSchA: { value: lin(SCHOOL.A[0]) }, uSchA2: { value: lin(SCHOOL.A[1]) }, uSchB: { value: lin(SCHOOL.B[0]) }, uSchB2: { value: lin(SCHOOL.B[1]) },
      uYell: { value: new THREE.Vector4(-99, 0, 0, 0) }, uEnd: { value: new THREE.Vector4(-99, 0, 0, 0) }, uStyle: { value: 0 },
      uShR: { value: new THREE.Vector3(0.2, 0.55, 0.09) }, uHandR: { value: new THREE.Vector3(0.25, 0.1, 0.04) }, uHip: { value: new THREE.Vector3(0, 0.1, 0.03) },
      uSeatV: { value: new THREE.Vector4(0, -999, 0, 0) }, uSeatF: { value: new THREE.Vector4(0, -1, 0.4, 6) },   // 11/21 座った時の目の前(SEAT_VIEW)
    };
    this._build();
    this._attachSound();
    onTeams(() => this.refreshTeams());   // 11/21 試合ごとにチームが替わったら応援席の色も替える
    addEventListener('crowd', (e) => { if (e.detail) this.event(e.detail.name, e.detail.k ?? 1); });
    window.__crowd = this;
  }
  now() { return this.clockOverride ?? performance.now() / 1000; }
  setClock(t) { this.clockOverride = t; this.U.uT.value = t; }
  // 席を立っている人(walkers.js が通路を歩かせている間)は席の人を出さない。away=false で元へ
  setSeatAway(i, away) {
    const F = this.data && this.data.aF; if (!F || i < 0 || i >= this.seats.n) return;
    this._away = this._away || new Map();
    if (away) { if (!this._away.has(i)) this._away.set(i, F[i * 4]); F[i * 4] = 2; }
    else if (this._away.has(i)) { F[i * 4] = this._away.get(i); this._away.delete(i); }
    const at = this.far && this.far.geometry.attributes.aF; if (at) { at.array[i * 4] = F[i * 4]; at.needsUpdate = true; }
    this.nearCenter.set(1e9, 0, 0);   // 近くの形を詰め直す
  }
  seatShown(i) { const F = this.data && this.data.aF; return !!F && F[i * 4] < (this.fill ?? 1) - 0.02; }
  reset() { for (const k of ['uEvL', 'uEvR', 'uEvN']) this.U[k].value.set(-99, 0, 1, 0); this.U.uLeanT.value = -99; this.U.uYell.value.x = -99; this.U.uEnd.value.x = -99; if (this.U.uBal) this.U.uBal.value.x = -99; }

  // 応援の型: 高校野球(アルプスの学校の応援)/ プロ風(外野の応援団)。?cheer=pro|hs > 設定 r4walk.cheer > 球場(屋根 = プロ風、浜風 = 高校野球)
  _styleFirst() {
    try { const q = new URLSearchParams(location.search).get('cheer'); if (q === 'pro' || q === 'hs') return q; } catch (e) { /* なし */ }
    try { const s = JSON.parse(localStorage.getItem('r4walk.cheer') || 'null'); if (s === 'pro' || s === 'hs') return s; } catch (e) { /* なし */ }
    return this.stadium === 'dome' ? 'pro' : 'hs';
  }
  setStyle(st, save = true) {
    if (st !== 'pro' && st !== 'hs') return;
    if (save) try { localStorage.setItem('r4walk.cheer', JSON.stringify(st)); } catch (e) { /* 使えない環境 */ }
    if (st === this.style) return;
    this._makeData(st);
    const g = this.far.geometry;
    for (const k of ['aP', 'aC', 'aH', 'aE', 'aF']) { g.attributes[k].array.set(this.data[k]); g.attributes[k].needsUpdate = true; }
    this.nearCenter.set(1e9, 0, 0);
    if (this.flags) { this.scene.remove(this.flags); this.flags = null; }
    this._buildFlags();
  }

  // 11/21 チームの色が替わった(uniform.js)。席の人の並びは同じ種なので、色だけが替わる
  refreshTeams() {
    if (!this.far || !this.style) return;
    const away = this._away ? new Map(this._away) : null;
    this._makeData(this.style);
    if (away) for (const [i] of away) { this._away.set(i, this.data.aF[i * 4]); this.data.aF[i * 4] = 2; }
    const g = this.far.geometry;
    for (const k of ['aP', 'aC', 'aH', 'aE', 'aF']) { g.attributes[k].array.set(this.data[k]); g.attributes[k].needsUpdate = true; }
    this.nearCenter.set(1e9, 0, 0);
    if (this.flags) { this.scene.remove(this.flags); this.flags = null; }
    this._buildFlags();
  }
  _makeData(style) {
    const { THREE, seats } = this;
    const pro = style === 'pro';
    // 11/21 チームの色(三塁側 = 先攻 = away、一塁側 = 後攻 = home)。応援の型が替わればチームも選び直す
    setTeamStyle(style, true);
    { const T = teamsNow(); SCHOOL.A = T.awayCrowd.slice(); SCHOOL.B = T.homeCrowd.slice(); this.teams = T;
      if (this.U) { this.U.uSchA.value.setHex(SCHOOL.A[0]); this.U.uSchA2.value.setHex(SCHOOL.A[1]); this.U.uSchB.value.setHex(SCHOOL.B[0]); this.U.uSchB2.value.setHex(SCHOOL.B[1]); } }
    this.style = style; this.U.uStyle.value = pro ? 1 : 0;
    if (this.sound) this.sound.cheerStyle = style;   // audio.js の応援の音の型
    const N = seats.n;
    const D = this.data || (this.data = { aP: new Float32Array(N * 4), aC: new Float32Array(N * 4), aH: new Float32Array(N * 4), aE: new Float32Array(N * 4), aF: new Float32Array(N * 4) });
    const { aP, aC, aH, aE, aF } = D;
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const col = new THREE.Color();
    // 区画: 0 内野・1 アルプス(50〜72 度)・2 外野。プロ風では外野の 14〜44 度を両チームの応援団の席にする(三塁側 = 左翼 = 先攻、一塁側 = 右翼 = 後攻)
    const sec = new Uint8Array(N), ang = new Float32Array(N);
    const yMinA = { '-1': 1e9, '1': 1e9 }, yMinO = { '-1': 1e9, '1': 1e9 }, yMin = [1e9, 1e9, 1e9], yMax = [-1e9, -1e9, -1e9];
    for (let i = 0; i < N; i++) {
      const a = Math.abs(Math.atan2(seats.x[i], -seats.z[i]) * 180 / Math.PI); ang[i] = a;
      const s = a > 72 ? 0 : a >= 50 ? 1 : 2; sec[i] = s;
      if (seats.y[i] < -100) continue;   // 11/21 隠した席(y = -1002)は数えない(銀輪・舟灯・森かげ・白樺でアルプスの応援が 20 人ほどしか出ていなかった)
      yMin[s] = Math.min(yMin[s], seats.y[i]); yMax[s] = Math.max(yMax[s], seats.y[i]);
      const k = seats.x[i] < 0 ? '-1' : '1';
      if (s === 1) yMinA[k] = Math.min(yMinA[k], seats.y[i]);
      if (s === 2 && a >= 14 && a <= 44) yMinO[k] = Math.min(yMinO[k], seats.y[i]);
    }
    const vn = (x, z, sc = 5) => { const h = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
      const gx = x / sc, gz = z / sc, ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
      const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
      return (h(ix, iz) * (1 - sx) + h(ix + 1, iz) * sx) * (1 - sz) + (h(ix, iz + 1) * (1 - sx) + h(ix + 1, iz + 1) * sx) * sz; };
    const score = new Float32Array(N), role = new Uint8Array(N), sideOf = new Int8Array(N), secF = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const s = sec[i], x = seats.x[i], z = seats.z[i], y = seats.y[i];
      const yn = (y - yMin[s]) / Math.max(1, yMax[s] - yMin[s]);
      let sc = 0.5 * rnd() + 0.35 * vn(x, z);
      if (s === 0) sc += 0.18 * yn + 0.1 * Math.max(0, 1 - (180 - ang[i]) / 100);
      else if (s === 2) sc += 0.25 * yn + 0.05 * Math.abs(ang[i] - 25) / 25;
      let r = 0, side = 0, fs = s;
      const sd = x < 0 ? -1 : 1;
      if (!pro && s === 1 && y > -100) {
        side = sd; const rowH = y - yMinA[sd], u = (ang[i] - 50) / 22;
        if (u > 0.4 && u < 0.6 && rowH > 0.7 && rowH < 4.6) r = 2;                               // 吹奏楽(中ほどの下の段)
        else if (rowH < 0.7 && u > 0.3 && u < 0.7) r = rnd() < 0.55 ? 3 : 4;                     // 最前列: チアと応援団(学ラン)
        else if (u > 0.12 && u < 0.92 && rowH < 11) r = 1;                                       // 生徒(学校の色の T シャツ)
        else side = 0;
        if (r >= 2) sc = 0; else if (r === 1) sc = 0.3 * sc; else sc = 0.4 + 0.6 * sc;
      } else if (pro && s === 2 && ang[i] >= 14 && ang[i] <= 44 && y > -100) {
        side = sd; const rowH = y - yMinO[sd], u = (ang[i] - 14) / 30;
        if (u > 0.4 && u < 0.62 && rowH > 0.5 && rowH < 3.2) r = 2;                               // トランペットと太鼓
        else if (rowH < 0.6 && u > 0.25 && u < 0.8 && rnd() < 0.35) r = 4;                         // 最前列のリーダー
        else r = 1;                                                                              // 応援団の席の人(チームの服)
        sc = r >= 2 ? 0 : 0.25 * sc; fs = 1;                                                       // 入りは「応援の席」の割合で決める
      } else if (pro && s === 1) fs = 0;
      role[i] = r; score[i] = sc; sideOf[i] = side; secF[i] = fs;
    }
    // 11/20 持ち主「女性、子供とかも観戦に来ている人で分かるように」: 女性・子供・年配を決める。子供は親子連れ(同じ列の隣に大人 1〜2 人)で座る。
    // 割合の目安(本物の球場の客層): 女性 4 割前後・子供 1 割前後。区画: 内野 / 特別席(本塁の後ろ、角度 150 度より外)/ アルプス・応援の席の一般 / 外野
    const zone = (i) => (sec[i] === 0 ? (ang[i] > 150 ? 1 : 0) : sec[i] === 1 ? 2 : 3);
    const FEM = [0.4, 0.34, 0.4, 0.37], FAM = [0.2, 0.07, 0.15, 0.18], OLD = [0.22, 0.28, 0.1, 0.09];
    const fem = new Uint8Array(N), age = new Uint8Array(N).fill(1), done = new Uint8Array(N);
    {
      const g1 = new Map(), k1 = (x, z) => Math.floor(x) * 4001 + Math.floor(z);
      for (let i = 0; i < N; i++) { if (seats.y[i] < -100) continue; const k = k1(seats.x[i], seats.z[i]); let q = g1.get(k); if (!q) g1.set(k, q = []); q.push(i); }
      // 同じ列の隣の席(横 0.35〜0.85 m・高さの差 0.2 m 以内・前後のずれ 0.3 m 以内)。sgn = +1 で席の右側
      const nextTo = (i, sgn) => {
        const x = seats.x[i], z = seats.z[i], y = seats.y[i], sx = Math.cos(seats.yaw[i]) * sgn, sz = -Math.sin(seats.yaw[i]) * sgn;
        let best = -1, bd = 9;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const q = g1.get((Math.floor(x) + a) * 4001 + Math.floor(z) + b); if (!q) continue;
          for (const j of q) { if (j === i || done[j] || role[j] || Math.abs(seats.y[j] - y) > 0.2) continue; const dx = seats.x[j] - x, dz = seats.z[j] - z, al = dx * sx + dz * sz, ac = Math.abs(dx * sz - dz * sx);
            if (al > 0.35 && al < 0.85 && ac < 0.3 && al < bd) { bd = al; best = j; } } }
        return best;
      };
      const order = []; for (let i = 0; i < N; i++) if (!role[i] && seats.y[i] > -100) order.push(i);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      for (const i of order) {
        if (done[i]) continue;
        const zi = zone(i);
        if (rnd() < FAM[zi]) {
          // 親子連れ: i が親、右へ子供 1〜2 人、左にもう 1 人の親(6 割)
          const sg = rnd() < 0.5 ? 1 : -1, kids = [];
          let c = nextTo(i, sg); if (c >= 0) { kids.push(c); done[c] = 1; const c2 = rnd() < 0.4 ? nextTo(c, sg) : -1; if (c2 >= 0) { kids.push(c2); done[c2] = 1; } }
          if (kids.length) {
            done[i] = 1; const mom = rnd() < 0.55 ? 1 : 0; fem[i] = mom;
            for (const c of kids) { age[c] = 0; fem[c] = rnd() < 0.48 ? 1 : 0; score[c] = score[i]; }
            const p2 = rnd() < 0.6 ? nextTo(i, -sg) : -1; if (p2 >= 0) { done[p2] = 1; fem[p2] = 1 - mom; score[p2] = score[i]; }
            continue;
          }
        }
        done[i] = 1; fem[i] = rnd() < FEM[zi] ? 1 : 0;
        if (rnd() < OLD[zi]) age[i] = 2;
      }
      // 応援の人: 生徒・応援団の席は男女半々に近く、吹奏楽は女性が少し多く、チアは全員女性、学ランの応援団は男性が多い
      for (let i = 0; i < N; i++) { const r = role[i]; if (!r) continue;
        fem[i] = rnd() < (r === 1 ? (pro ? 0.36 : 0.45) : r === 2 ? (pro ? 0.25 : 0.58) : r === 3 ? 1 : 0.08) ? 1 : 0; }
    }
    this.famStat = { fem, age };
    for (let s = 0; s < 3; s++) {
      const idx = []; for (let i = 0; i < N; i++) if (secF[i] === s) idx.push(i);
      idx.sort((a, b) => score[a] - score[b]);
      idx.forEach((i, k) => { aF[i * 4] = role[i] >= 2 ? 0 : k / idx.length; });
    }
    // 服の色は 3m のかたまりで少しそろえる(連れ立って来た人・同じ色の多い場所)
    const cellCol = (x, z) => { const k = Math.floor(x / 3) * 7919 + Math.floor(z / 3) * 104729; const h = Math.sin(k) * 43758.5453; return weighted(SHIRTS, h - Math.floor(h)); };
    for (let i = 0; i < N; i++) {
      const s = sec[i], r = role[i], side = sideOf[i];
      aP[i * 4] = seats.x[i]; aP[i * 4 + 1] = seats.y[i] - 0.02; aP[i * 4 + 2] = seats.z[i]; aP[i * 4 + 3] = seats.yaw[i] + (rnd() - 0.5) * 0.35;
      const ag = age[i], fm = fem[i];
      // 背の高さ(座った形ごと縮める): 子供 0.62〜0.74、女性 0.9〜1.0、男性 0.96〜1.08。高校の応援の生徒は少し低め
      let scale = ag === 0 ? 0.62 + rnd() * 0.12 : fm ? 0.9 + rnd() * 0.1 : 0.96 + rnd() * 0.12;
      if (r >= 1 && !pro) scale = fm ? 0.89 + rnd() * 0.08 : 0.94 + rnd() * 0.1;
      const sch = (side || (seats.x[i] < 0 ? -1 : 1)) < 0 ? SCHOOL.A : SCHOOL.B;
      let shirt;
      if (pro) {
        if (r === 1) { const dark = ((sch[0] >> 16) & 255) + ((sch[0] >> 8) & 255) + (sch[0] & 255) < 120; shirt = rnd() < (dark ? 0.6 : 0.88) ? sch[0] : rnd() < 0.6 ? sch[1] : 0xf4f4f0; }   // 黒・紺のチームは白も混ぜる(席の色に沈まないように)               // そろいの服(チームの色。11/21 持ち主「その色に染まって見えるくらい」)
        else if (r === 2) shirt = sch[0];
        else if (r === 4) shirt = sch[1];
        else {   // 一般の客: 本物の球場はホームの客が多い。三塁側の外野寄り(先攻の応援団の近く)だけビジターの色も
          const vis = seats.x[i] < 0 && ang[i] < 60 ? 0.3 : seats.x[i] < 0 ? 0.08 : 0.02, u = rnd();
          shirt = u < vis ? (rnd() < 0.8 ? SCHOOL.A[0] : SCHOOL.A[1]) : u < vis + 0.34 ? (rnd() < 0.8 ? SCHOOL.B[0] : SCHOOL.B[1]) : (rnd() < 0.4 ? cellCol(seats.x[i], seats.z[i]) : weighted(SHIRTS, rnd()));
        }
      } else {
        if (r === 1) shirt = rnd() < 0.8 ? sch[0] : 0xf4f4f0;
        else if (r === 2) shirt = 0xf4f4f0;
        else if (r === 3) shirt = sch[0];
        else if (r === 4) shirt = 0x15171c;                                                     // 学ラン
        else shirt = rnd() < 0.4 ? cellCol(seats.x[i], seats.z[i]) : weighted(SHIRTS, rnd());
      }
      if (r === 0 && fm && ag === 1) {   // 女性: 2 割はチームカラー(学校・チームの色)のユニフォームのレプリカ、5 割は淡い色
        const u = rnd(); if (u < 0.2) shirt = rnd() < 0.7 ? sch[0] : sch[1]; else if (u < 0.7) shirt = weighted(F_SHIRTS, rnd());
      }
      col.setHex(shirt);
      const v = r === 0 ? 0.9 + rnd() * 0.14 : 0.95 + rnd() * 0.08;
      aC[i * 4] = col.r * v; aC[i * 4 + 1] = col.g * v; aC[i * 4 + 2] = col.b * v; aC[i * 4 + 3] = scale;
      let hatP = s === 2 ? 0.6 : s === 0 ? 0.4 : 0.5, hat = weighted(HATS, rnd());
      if (r === 1) { hatP = pro ? 0.45 : 0.55; hat = rnd() < (pro ? 0.8 : 0.6) ? sch[pro ? 0 : 1] : 0xf5f5f2; }
      if (r === 2) { hatP = 1; hat = pro ? sch[1] : sch[0]; }
      if (r === 3) hatP = 0;
      if (r === 4) { hatP = pro ? 0.5 : 1; hat = pro ? sch[0] : 0x111216; }
      let cheerCap = false;
      if (ag === 0 && r === 0 && rnd() < 0.8) {   // 子供は応援の帽子(近い側の学校・チームの色か白・赤・紺)。夜・屋根でも脱がない
        const sd = seats.x[i] < 0 ? SCHOOL.A : SCHOOL.B, u = rnd(); hat = u < 0.55 ? sd[0] : u < 0.7 ? sd[1] : u < 0.82 ? 0xf5f5f2 : u < 0.92 ? 0xc0392b : 0x1f2f5a; cheerCap = true;
      }
      col.setHex(hat);
      aH[i * 4] = col.r; aH[i * 4 + 1] = col.g; aH[i * 4 + 2] = col.b; aH[i * 4 + 3] = rnd() < hatP ? rnd() * 0.5 : 0.5 + rnd() * 0.5;
      if (r === 2 || r === 4) aH[i * 4 + 3] = 0;   // 帽子は時間帯で減らさない
      if (cheerCap) aH[i * 4 + 3] = rnd() * 0.06;
      else if (r <= 1 && fm && ag === 1 && rnd() < 0.72) aH[i * 4 + 3] = 2;   // 11/20 夕 大人の女性の 7 割は昼も帽子なし(髪が見えるように。uHatK は昼 1 で全員かぶる)
      aE[i * 4] = rnd(); aE[i * 4 + 1] = side; aE[i * 4 + 2] = r; aE[i * 4 + 3] = rnd();
      aF[i * 4 + 1] = secF[i]; aF[i * 4 + 2] = ag + 4 * fm; aF[i * 4 + 3] = Math.pow(rnd(), 1.6) * 0.7;   // 年代 + 4 × 女性
    }
    this.sideOf = sideOf; this.roleOf = role;
  }

  _build() {
    const { THREE, seats } = this;
    if (!seats._fixed && !/[?&]noseatfix/.test(location.search)) { this.seatFix = fixSeats(seats, this.groundAt); seats._fixed = true; }   // ?noseatfix は直す前と比べる撮影用
    if (!seats._vfixed && this.chairAt && !/[?&]noseatfix/.test(location.search)) { this.seatFixVisual = fixSeatsVisual(seats, this.chairAt); seats._vfixed = true; }   // 11/19 見た目の椅子に合わせる
    if (!seats._sfixed && !/[?&](noseatfix|nosidefix)/.test(location.search)) { this.seatFixSide = fixSeatsSide(seats); seats._sfixed = true; }   // 11/19 横向きを段の下りへ寄せる(?nosidefix=1 で止める)
    const N = seats.n;
    this._makeData(this._styleFirst());
    this.grid = new Map();
    for (let i = 0; i < N; i++) { const k = this._cell(seats.x[i], seats.z[i]); let c = this.grid.get(k); if (!c) this.grid.set(k, c = []); c.push(i); }
    // 遠く: 1 人 1 枚の板(全員)
    const far = new THREE.InstancedBufferGeometry();
    far.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    far.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    far.setIndex([0, 1, 2, 0, 2, 3]);
    for (const k of ['aP', 'aC', 'aH', 'aE', 'aF']) far.setAttribute(k, new THREE.InstancedBufferAttribute(this.data[k], 4));
    far.instanceCount = N;
    this.far = new THREE.Mesh(far, this._material('far'));
    this.far.frustumCulled = false; this.far.receiveShadow = true; this.scene.add(this.far);
    this.far.onBeforeRender = (r, s, cam) => this._tick(cam);
    this.nearCenter = new THREE.Vector3(1e9, 0, 0);
    this.U.uNearOn.value = 0;
    // 近く: 選手の体を軽くした人の形(読み終わるまでは遠くの板だけ)
    this.ready = fetch('models/crowd/person.json?v=20261122').then((r) => r.json()).then((J) => {
      this.U.uShR.value.fromArray(J.shoulderR); this.U.uHandR.value.fromArray(J.handR); this.U.uHip.value.fromArray(J.hip);
      const near = personGeometry(THREE, J);
      this.NEAR_MAX = 6000;
      this.nearBuf = {};
      for (const k of ['aP', 'aC', 'aH', 'aE', 'aF']) { const a = new THREE.InstancedBufferAttribute(new Float32Array(this.NEAR_MAX * 4), 4); a.setUsage(THREE.DynamicDrawUsage); near.setAttribute(k, a); this.nearBuf[k] = a; }
      near.instanceCount = 0;
      this.near = new THREE.Mesh(near, this._material('near'));
      this.near.frustumCulled = false; this.near.receiveShadow = true; this.near.visible = this.visible;
      this.scene.add(this.near);
      this.nearCenter.set(1e9, 0, 0);
    }).catch((e) => console.warn('観客の近くの形を読めませんでした', e));
    this._buildFlags();
    this._buildBalloons();
  }

  // 7 回の風船(プロ風): 攻める側の応援団の席から細長い風船が一斉に上がって落ちる。1 回の描画・光源なし
  _buildBalloons() {
    const { THREE, seats } = this;
    const lite = this.getQuality && this.getQuality() === 'lite';   // 11/18 画質: 'ultra'(最高)・'std' は同じ扱い
    const M = lite ? 1500 : 3500;
    const base = new THREE.CylinderGeometry(0.035, 0.03, 0.62, 6, 3);
    const pa = base.attributes.position;
    for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); const k = Math.cos((y / 0.31) * 1.3); pa.setX(i, pa.getX(i) * (0.4 + 0.6 * k)); pa.setZ(i, pa.getZ(i) * (0.4 + 0.6 * k)); }
    base.computeVertexNormals();
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('normal', base.attributes.normal);
    const pos = new Float32Array(M * 4), cl = new Float32Array(M * 4);
    this.balloonData = { pos, cl, M };
    g.setAttribute('aB', new THREE.InstancedBufferAttribute(pos, 4));
    g.setAttribute('aBc', new THREE.InstancedBufferAttribute(cl, 4));
    g.instanceCount = M;
    this._fillBalloons(-1);
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aB; attribute vec4 aBc; uniform float uT; uniform vec4 uBal; varying vec3 vBc;\n' + DECL.split('\n').filter((l) => /^vec3 rot|^float hsh/.test(l)).join('\n'))
        .replace('#include <beginnormal_vertex>', `
          float sd = aBc.w, h = aB.w;
          float dt = uT - uBal.x - h * 1.4;
          float on = (abs(sd - uBal.y) < 0.5 && dt > 0.0 && dt < 8.0) ? 1.0 : 0.0;
          float a1 = h * 40.0, a2 = hsh(h * 3.1) * 6.28;
          vec3 objectNormal = rotY(rotX(normal, a1 + dt * (3.0 + h * 4.0)), a2 + dt * 2.0);`)
        .replace('#include <begin_vertex>', `
          vec3 pp = rotY(rotX(position, a1 + dt * (3.0 + h * 4.0)), a2 + dt * 2.0);
          float up = (14.0 + hsh(h * 7.7) * 10.0) * (1.0 - exp(-dt * 1.3)) / 1.3 - 1.6 * max(0.0, dt - 1.0) * max(0.0, dt - 1.0) * 0.5;
          vec2 dir = normalize(-aB.xz + vec2(1e-3)) * (2.0 + hsh(h * 5.3) * 6.0) + vec2(hsh(h * 9.1) - 0.5, hsh(h * 2.9) - 0.5) * 6.0;
          vec3 wob = vec3(sin(dt * 2.2 + a1), 0.0, cos(dt * 1.7 + a2)) * 0.6;
          vec3 c = aB.xyz + vec3(0.0, 1.6 + up, 0.0) + vec3(dir.x, 0.0, dir.y) * (1.0 - exp(-dt * 0.6)) + wob * min(dt, 1.0);
          on *= step(aB.y - 2.0, c.y);
          vec3 transformed = c + pp * on; vBc = aBc.rgb;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBc;')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( vBc, opacity );')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vBc * 0.18;');
    };
    m.customProgramCacheKey = () => 'crowd_balloon';
    this.balloons = new THREE.Mesh(g, m);
    this.balloons.frustumCulled = false;
    this.scene.add(this.balloons);
  }
  _fillBalloons(side) {
    const { seats } = this, { pos, cl, M } = this.balloonData;
    const idx = []; for (let i = 0; i < seats.n; i++) if (this.sideOf[i] === side && this.roleOf[i] === 1) idx.push(i);
    if (!idx.length) for (let i = 0; i < seats.n; i++) if (this.sideOf[i] === side) idx.push(i);
    const sch = side < 0 ? SCHOOL.A : SCHOOL.B, c = new this.THREE.Color();
    let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < M; k++) {
      const i = idx.length ? idx[Math.floor(rnd() * idx.length)] : 0;
      pos[k * 4] = seats.x[i] + (rnd() - 0.5) * 0.4; pos[k * 4 + 1] = seats.y[i]; pos[k * 4 + 2] = seats.z[i] + (rnd() - 0.5) * 0.4; pos[k * 4 + 3] = rnd();
      const r = rnd(); c.setHex(r < 0.5 ? sch[0] : r < 0.85 ? sch[1] : 0xf6f6f2);
      cl[k * 4] = c.r; cl[k * 4 + 1] = c.g; cl[k * 4 + 2] = c.b; cl[k * 4 + 3] = side;
    }
    if (this.balloons) { const g = this.balloons.geometry; g.attributes.aB.needsUpdate = true; g.attributes.aBc.needsUpdate = true; }
  }
  balloonsUp(side) {
    if (!this.balloons) return;
    this._fillBalloons(side);
    this.U.uBal.value.set(this.now(), side, 0, 0);
    if (this.sound && this.sound.balloons) this.sound.balloons();
  }
  yell(dur = 16) { this.U.uYell.value.set(this.now(), dur, 0, 0); if (this.sound && this.sound.yellRoll) this.sound.yellRoll(); }
  gameEnd(winSide) { this.U.uEnd.value.set(this.now(), winSide, 0, 0); }

  _cell(x, z) { return (Math.floor(x / 8) + 500) * 1000 + (Math.floor(z / 8) + 500); }

  _material(kind) {
    const THREE = this.THREE;
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: kind === 'far' ? THREE.DoubleSide : THREE.FrontSide });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.U);
      const vary = kind === 'far'
        ? 'varying vec2 vUV; varying vec3 vShirt; varying vec4 vHat; varying vec4 vP1; varying vec4 vP2; varying vec4 vHs; varying vec4 vProp; varying vec4 vProp2; varying vec3 vSch; varying vec3 vSch2; varying float vGlint;'
        : 'attribute vec3 aS; attribute vec3 aNS; attribute float aPart; attribute float aMat; attribute vec3 aW; attribute vec3 aLong; attribute vec3 aTail; varying vec3 vCol; varying float vGlint;';
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + DECL + vary)
        .replace('#include <beginnormal_vertex>', POSE + SEAT_VIEW + (kind === 'far' ? FAR_VERT : NEAR_VERT) + '\nvec3 objectNormal = myNrm;')
        .replace('#include <begin_vertex>', 'vec3 transformed = myPos; transformed.y -= seatSink;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + (kind === 'far' ? FAR_FRAG_DECL : 'varying vec3 vCol; varying float vGlint;'))
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', kind === 'far' ? FAR_FRAG : 'vec4 diffuseColor = vec4( vCol, opacity ); float glint = vGlint;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.8, 0.45) * glint * 0.9;');
    };
    m.customProgramCacheKey = () => 'crowd_' + kind;
    return m;
  }

  // アルプスの大旗(両校 2 本ずつ)。攻める側の旗だけ大きく振る。旗の絵は式で描く(実在の校章に似せない)
  _buildFlags() {
    const { THREE, seats } = this;
    const { aE, aF } = this.data;
    const spots = [];
    for (const side of [-1, 1]) {
      let best = [];
      for (let i = 0; i < seats.n; i++) if (aE[i * 4 + 1] === side && aE[i * 4 + 2] === 2) best.push(i);
      if (!best.length) continue;
      best.sort((a, b) => seats.y[a] - seats.y[b]);
      const front = best.slice(0, Math.max(1, Math.floor(best.length * 0.15)));
      front.sort((a, b) => seats.x[a] * side - seats.x[b] * side);
      spots.push([front[0], side, 0], [front[front.length - 1], side, 1]);
    }
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    const hex = (h) => '#' + h.toString(16).padStart(6, '0');
    // 左半分 = 三塁側の学校(青緑の地に橙の斜めの帯と白い丸)、右半分 = 一塁側(紫の地に黄緑の横 2 本と白い星)
    g.fillStyle = hex(SCHOOL.A[0]); g.fillRect(0, 0, 256, 256);
    g.fillStyle = hex(SCHOOL.A[1]); g.beginPath(); g.moveTo(0, 190); g.lineTo(190, 0); g.lineTo(256, 0); g.lineTo(0, 256); g.fill();
    g.fillStyle = '#f7f7f2'; g.beginPath(); g.arc(150, 140, 46, 0, Math.PI * 2); g.fill();
    g.fillStyle = hex(SCHOOL.A[0]); g.beginPath(); g.arc(150, 140, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = hex(SCHOOL.B[0]); g.fillRect(256, 0, 256, 256);
    g.fillStyle = hex(SCHOOL.B[1]); g.fillRect(256, 40, 256, 26); g.fillRect(256, 190, 256, 26);
    g.fillStyle = '#f7f7f2'; g.beginPath();
    for (let k = 0; k < 10; k++) { const r = k % 2 ? 22 : 54, a = -Math.PI / 2 + k * Math.PI / 5; g.lineTo(384 + r * Math.cos(a), 128 + r * Math.sin(a)); }
    g.fill();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const P = [], UV = [], F = [], I = [];
    const W = 2.6, H = 1.7, NX = 12, NY = 6;
    for (const [si, side, k] of spots) {
      const base = P.length / 3;
      const x0 = seats.x[si], y0 = seats.y[si] + 1.4, z0 = seats.z[si], yaw = seats.yaw[si];
      for (let iy = 0; iy <= NY; iy++) for (let ix = 0; ix <= NX; ix++) {
        const u = ix / NX, v = iy / NY;
        P.push(x0, y0, z0); UV.push((side < 0 ? 0 : 0.5) + u * 0.5, v); F.push(u * W, (v - 1) * H, yaw, side + k * 0.1);
      }
      for (let iy = 0; iy < NY; iy++) for (let ix = 0; ix < NX; ix++) { const a = base + iy * (NX + 1) + ix; I.push(a, a + 1, a + NX + 1, a + 1, a + NX + 2, a + NX + 1); }
    }
    if (!spots.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    geo.setAttribute('aFl', new THREE.Float32BufferAttribute(F, 4));
    geo.setIndex(I);
    const m = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.U);
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.22;');   // 夜でも旗の色が沈まないように(光源は足さない)
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aFl; uniform float uT, uAttack;')
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', `
          float side = floor(aFl.w + 0.5); float k = aFl.w - side;
          bool atk = abs(side - uAttack) < 0.5;
          float sw = atk ? sin(uT * 1.6 + k * 20.0) * 1.1 : 0.12 * sin(uT * 0.5 + k * 9.0);   // 竿ごと左右に振る
          float lift = 3.2;
          vec3 l = vec3(aFl.x, aFl.y + lift, 0.0);
          l.z += sin(aFl.x * 2.2 - uT * (atk ? 7.0 : 2.5)) * 0.18 * (aFl.x / 2.6);           // 布のなびき
          float c = cos(sw * 0.45), s = sin(sw * 0.45);
          l = vec3(l.x * c - l.y * s, l.x * s + l.y * c, l.z);
          float cy = cos(aFl.z + 1.5708), sy = sin(aFl.z + 1.5708);
          vec3 transformed = position + vec3(l.x * cy + l.z * sy, l.y, -l.x * sy + l.z * cy);`);
    };
    m.customProgramCacheKey = () => 'crowd_flag';
    this.flags = new THREE.Mesh(geo, m);
    this.flags.frustumCulled = false;
    this.scene.add(this.flags);
  }

  // 毎フレーム(遠くの板を描く直前): 時刻・攻める側・入り・近くの入れ替え
  _tick(cam) {
    const U = this.U, t = this.now();
    U.uT.value = t;
    const s = this.sound;
    if (s) { U.uAttack.value = s.attackSide || -1; U.uPress.value += ((s.pressure || 0) - U.uPress.value) * 0.05; }
    // 11/21 夜 応援歌の拍: 曲(audio.js の _song: t0 = 鳴り始めの ctx の時刻、bar = 1 小節 4 拍の秒)が鳴っていれば曲のテンポと頭に合わせる。
    // 曲が無い時は太鼓の拍子(tick を包んだ所で uBeat0、0.5 秒)。uPlay: 演奏中 1、打った直後(quiet)・鳴っていない時 0。playOverride は撮影用
    {
      const S = s && s._song; let play = 0;
      if (S && s.ctx && S.bar) {
        const cn = s.ctx.currentTime, len = S.len || 60, el = cn - S.t0;
        U.uBeatP.value = S.bar / 4;
        U.uBeat0.value = t - (el >= 0 ? el % len : el);
        play = !S.quiet && el > 0 ? 1 : 0;
      } else { U.uBeatP.value = 0.5; play = t - U.uBeat0.value < 2.3 ? 1 : 0; }
      if (this.playOverride != null) play = this.playOverride;
      const dt = Math.min(0.1, Math.max(0, t - (this._tPrev ?? t))); this._tPrev = t;
      U.uPlay.value += (play - U.uPlay.value) * (this.clockOverride != null ? 1 : Math.min(1, dt * 6));
    }
    const q = this.getQuality ? this.getQuality() : 'std';
    const tk = this.getTime ? this.getTime() : 'day';
    const dome = this.stadium === 'dome';
    U.uHatK.value = dome ? 0.08 : tk === 'night' ? 0.12 : 1;
    U.uFanK.value = dome ? 0.08 : tk === 'night' ? 0.1 : 0.3;
    // 入り(満員 1 / ふつう 0.7 / 空いている 0.4): 内野・アルプス・外野で割合を変える(アルプスは学校の応援でいつも埋まる)
    const f = Math.max(0, Math.min(1, this.fill)), L = (a, b, c) => (f >= 0.7 ? b + (a - b) * (f - 0.7) / 0.3 : c + (b - c) * (f - 0.4) / 0.3);
    U.uFill.value.set(L(0.96, 0.72, 0.42), L(1.0, 0.96, 0.88), L(0.92, 0.5, 0.18));
    const h = this.getHide ? this.getHide() : null;
    if (h) U.uHide.value.set(h[0], h[1], h[2], h[3]); else U.uHide.value.w = 0;
    const hu = this.getHideUp ? this.getHideUp() : null;
    if (hu) U.uHideUp.value.set(hu[0], hu[1], hu[2], hu[3]); else U.uHideUp.value.w = 0;
    // 近くの人の形: カメラが 3m 動いたら入れ替える(境目はその時の中心で固定して、近く・遠くが必ずどちらか一方になる)
    const R = q === 'ultra' ? 22 : q === 'std' ? 15 : q === 'min' ? 4 : 7;   // 'min': スマホの自動のいちばん下の段(gfx.js の AUTO_LV)   // 11/18 画質: 最高は近くの人の形を広く
    U.uNearR.value = R;
    if (this.near && (cam.position.distanceTo(this.nearCenter) > 3 || this._nearR !== R)) this._refillNear(cam.position, R);
    this._watchGame();
    if (this.balloons) this.balloons.visible = this.visible && this.U.uBal && t - this.U.uBal.value.x < 10;   // 飛んでいない時は描かない
  }
  _refillNear(c, R) {
    this._nearR = R;
    this.nearCenter.copy(c); this.U.uNearC.value.copy(c);
    const d = this.data, B = this.nearBuf, seats = this.seats;
    let n = 0;
    const r8 = Math.ceil(R / 8) + 1, cx = Math.floor(c.x / 8), cz = Math.floor(c.z / 8);
    for (let ix = cx - r8; ix <= cx + r8 && n < this.NEAR_MAX; ix++) for (let iz = cz - r8; iz <= cz + r8 && n < this.NEAR_MAX; iz++) {
      const cell = this.grid.get((ix + 500) * 1000 + (iz + 500)); if (!cell) continue;
      for (const i of cell) {
        const dx = seats.x[i] - c.x, dy = seats.y[i] - 0.02 - c.y, dz = seats.z[i] - c.z;
        if (dx * dx + dy * dy + dz * dz > R * R) continue;
        for (const k in B) B[k].array.set(d[k].subarray(i * 4, i * 4 + 4), n * 4);
        if (++n >= this.NEAR_MAX) break;
      }
    }
    for (const k in B) { B[k].needsUpdate = true; }
    this.near.geometry.instanceCount = n;
    this.U.uNearOn.value = n > 0 ? 1 : 0;
    // 近くに収まりきらなかった時は、遠くの板を消さない(人が抜けて見えないように)
    if (n >= this.NEAR_MAX) this.U.uNearOn.value = 0;
    this.nearCount = n;
  }

  setVisible(on) { this.visible = on; this.far.visible = on; if (this.near) this.near.visible = on; if (this.flags) this.flags.visible = on; if (this.balloons) this.balloons.visible = on; }
  // 試合の流れを読む(defense.js の g を見るだけ): 試合の始まりのエール交換(高校野球)・7 回の風船(プロ風)・試合の終わり
  _watchGame() {
    const d = globalThis.__app && globalThis.__app.defense, g = d && d.g;
    if (!g || d.kind !== 'game') { this._g = null; return; }
    if (this._g !== g) { this._g = g; this._lastHalf = g.inning + g.half; this._over = !!g.over; if (this.style === 'hs') this.yell(16); return; }
    const h = g.inning + g.half;
    if (h !== this._lastHalf) {
      this._lastHalf = h;
      if (this.style === 'pro' && g.inning === 7) this.balloonsUp(g.half === 'bottom' ? 1 : -1);
    }
    if (g.over && !this._over) {
      this._over = true;
      const s = this.sound, our = -((s && s.attackSide) || -1);
      const sc = g.score || {}; const win = (sc.us || 0) >= (sc.them || 0) ? our : -our;
      this.gameEnd(win);
    }
  }
  setFill(f) { this.fill = f; }
  // 11/21 座った時の目の前(SEAT_VIEW)。eye = 目の位置、fx・fz = 席の前の向き、tanDn = 見通しの線の下がり(前 1 m あたり)、dist = 前の何 m まで。null で止める
  setSeatView(eye, fx, fz, tanDn, dist = 6) {
    const U = this.U;
    if (!eye) { U.uSeatV.value.w = 0; return; }
    U.uSeatV.value.set(eye.x, eye.y, eye.z, 1); U.uSeatF.value.set(fx, fz, tanDn, dist);
  }

  // 場面の合図 → 誰がどう動くか。side: 攻める側 S、守る側 D、一般 N
  event(name, k = 1) {
    const t = this.now(), U = this.U, s = this.sound;
    const S = s && s.attackSide ? s.attackSide : -1, D = -S;
    const slot = (side) => (side < 0 ? U.uEvL : side > 0 ? U.uEvR : U.uEvN).value;
    const fire = (side, frac, dur, kind) => {
      const e = slot(side);
      // まだ立っている途中なら、立ち直させずに長さと強さだけ足す
      if (t - e.x < e.z * 0.55 && e.y > 0) { e.y = Math.max(e.y, frac); e.z = Math.max(e.z, t - e.x + dur); e.w = Math.max(e.w, kind); }
      else e.set(t, frac, dur, kind);
    };
    const lean = (kk) => { if (t - U.uLeanT.value > 1.2) U.uLeanT.value = t; U.uLeanK.value = Math.min(1, kk); };
    switch (name) {
      case 'contact': lean(0.35 + 0.5 * k); break;
      case 'ooh': case 'flyup': lean(0.9); fire(S, 0.45, 2.8, 2); fire(0, 0.15, 2.5, 2); break;
      case 'foul': lean(0.4); break;
      case 'hit': fire(S, 0.85, 4, 2); fire(0, 0.5, 3.5, 1); break;   // ヒットは攻める側が立って手を上げる
      case 'longhit': fire(S, 1, 5.5, 2); fire(0, 0.65, 5, 2); break;
      case 'hr': fire(S, 1, 9, 4); fire(0, 1, 5.5, 4); fire(D, 0.15, 3, 1); break;   // 11/21 夜 持ち主「タオル降るとかは要らない」: 一般の客は立って歓声と拍手、5 秒ほどで座る(4)
      case 'sayonara': fire(S, 1, 10, 4); fire(0, 1, 9, 4); fire(D, 0.15, 3, 1); break;   // サヨナラは一般の客も長めに立って拍手
      case 'score': fire(S, 1, 7, 3); fire(0, 0.75, 4.5, 3); break;
      case 'fine': fire(D, 1, 5.5, 2); fire(0, 0.8, 5.5, 2); fire(S, 0.3, 3, 1); break;
      case 'out': fire(D, 0.7, 3, 1); fire(0, 0.4, 3, 1); break;
      case 'dp': case 'strikeout': case 'escape': fire(D, 1, 4.5, 2); fire(0, 0.65, 4, 2); break;
      case 'miss': fire(S, 0.7, 3.5, 2); break;
      case 'change': fire(0, 0.4, 3, 1); fire(-1, 0.5, 3, 1); fire(1, 0.5, 3, 1); break;
      default: break;
    }
  }

  // audio.js の合図を外から包む(audio.js は触らない)
  _attachSound() {
    const s = this.sound; if (!s) return;
    const wrap = (name, fn) => { const orig = s[name]; if (typeof orig !== 'function') return; s[name] = function (...a) { const r = orig.apply(this, a); try { fn(...a); } catch (e) { /* 見た目だけ */ } return r; }; };
    let celebT = -99;
    wrap('crowdEvent', (name, k = 1) => { if (name === 'hr' || name === 'score' || name === 'sayonara') celebT = this.now(); this.event(name, k); });
    wrap('celebrate', (k = 0.8, big = false) => { if (this.now() - celebT > 1) this.event(big ? 'hr' : 'score', k); celebT = this.now(); });
    wrap('crowd', (kind, k = 1) => { this.event(kind === 'hr' ? 'hr' : kind === 'ooh' ? 'ooh' : kind === 'big' ? 'longhit' : kind === 'cheer' ? 'hit' : kind === 'applause' ? 'change' : '', k); });
    wrap('setFill', (f) => this.setFill(f));
    // 太鼓の拍子の頭(tick の中で taikoT が 2 秒に戻った時)
    const crowd = this, ot = s.tick;
    if (typeof ot === 'function') s.tick = function (...a) { const b = this.taikoT; const r = ot.apply(this, a); if (this.taikoT > b + 0.5 && this.taikoT >= 1.9) crowd.U.uBeat0.value = crowd.now(); return r; };
  }
}
