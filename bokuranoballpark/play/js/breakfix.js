// 崩れの直し(11/19 持ち主「白く飛んだ床や、崩れた所…各球場にいるなら全部なくして」)。模型(blend・glb)は触らず、読み込んだ後にここで直す。
// 球場ごとの表を、材質の名前(正規表現)で当てる。模型の版が上がっても、同じ名前の材質なら効く。名前が変わった時は tools/breakcheck.py・brightmats.py で見つける。
//   dim:    [名前, 掛ける数]       材質の色(と発光の色)を暗くする。白く飛ぶ床・壁(明るさ 0.55 を超える無地)を本物らしい明るさへ
//   night:  [名前, 夜に掛ける数]   ナイターだけ暗くする(外の地面・広場が夜も昼のように明るい所)。setTime のたびに main.js が applyNight を呼ぶ
//   offset: [名前, 強さ]          同じ所に 2 枚重なってちらつく面の片方を、描く時に少し奥へずらす(polygonOffset)。強さは 1〜4
//   hide:   [物の名前]            重なっている片方の物そのものを描かない(当たり判定は別の GLB なので変わらない)
//   front:  [名前]                両面の材質を片面にする(天井の板の裏が屋根の上・床の下から見えてしまう所)
//   floor:  [名前, 掛ける数]       その材質の上を向いた面(床・地面)だけを暗くする(壁は変えない)。描く時に法線で分ける(fixBreaksLate、シェーダーに 1 行足す)
//   dimMesh: [物の名前, 掛ける数]   物の名前で当てて色を暗くする(js/passages.js の通路の白い壁など、名前の無い材質)
//   offsetMesh: [物の名前, 強さ]   物の名前で当てる polygonOffset(負の数は手前へ)。js/passages.js の通路の物(名前の無い材質)に使う
// ?nobreakfix=1 で直さない(前の見た目を見る時・試験の --before)。
export const BREAK_FIX = {
  // 浜風: ナイターでコンコース・裏の部屋・ブルペンの中が昼の倍ほど白く飛ぶ(夜の光の焼き込みが屋内にも強く入る)。屋内の材質を夜だけ暗くする
  koshien: {
    front: [/^r\d+_bs_ceiling$/],   // 三塁ベンチの上から、裏の部屋の天井の板の裏(白いタイル)が見える
    night: [[/^r\d+_(conc_|stair|wall_waist|shop_(counter|tile|shutter)|room_white|toilet_entry|vending_plain|kiosk_front|kitchen_steel|plate)/, 0.3],   // r\d+: 版(R8〜R12…)が上がっても当たる   // 夜の焼き込みの光(diffuse × nlight × 3)が飽和しているので強めに
      [/^r\d+_(bs_(wall|floor|ceiling)|bullpen_ceiling|door_grey|table_top|board_white|fridge_white)/, 0.35],
      [/^(seat_stadium|paint_green_dark)$/, 0.45]],   // ナイターで内野の椅子・段の緑が白っぽい
  },
  // 屋根の球場: 外の広場の床(facade_light の上を向いた面)が昼も夜も真っ白。外野の段のコンクリートも白く飛ぶ
  dome: {
    floor: [[/^facade_light$/, 0.2], [/^ground_paving$/, 0.35], [/^stand_concrete$/, 0.45]],   // 屋内の昼は光が強く、トーンマップで縮むので強めに(0.42 で 233→203 だった)
    night: [[/^(ground_paving|road_asphalt|facade_light)$/, 0.4]],
    offset: [[/^bs_skirting_dark_lm$/, -1]],   // 選手の通路の幅木が腰の板と同じ面でちらつく   // 屋内の球場の夜は外の地面が昼の明るさのまま(試合の照明の光が外にも当たる)
  },
  park: {},
  // 銀輪: 2 階・5 階のコンコースの床、段のコンクリートが白く飛ぶ
  ring: {
    floor: [[/^(concourse_floor|dt_floor_walk_light)$/, 0.3], [/^stand_concrete$/, 0.45]],
    night: [[/^(ground_paving|road_asphalt|deck_paving)$/, 0.4]],
    dim: [[/^(interior_wall_white|room_white_board)$/, 0.7]],   // ロッカー・インタビューの部屋の白い壁が白く飛ぶ
  },
  railside: {},
  bowl: {},
  // 観覧車の丘: 外周(三塁側)の窓のガラスが外壁の板と同じ面でちらつく。段のコンクリートが白く飛ぶ(夜も)
  north: {
    offset: [[/^window_glass$/, -1], [/^aisle_step_grey$/, -1], [/^sign_boards_fictional$/, -1], [/^fence_pad_green$/, -1]],
    floor: [[/^stand_concrete$/, 0.3]],
  },
  // 白樺: 外周(外野)の道路が舗装と同じ高さでちらつく。外壁の帯がタイルの壁と重なる
  roof: {
    offset: [[/^road_asphalt$/, -1], [/^facade_band_light$/, -1], [/^stand_riser_dark$/, -1]],
  },
  // 潮凪: 外の広場(ground_paving・deck_paving)が昼は白っぽく、夜も昼の明るさのまま。外周の植え込みの縁が道路と重なってちらつく。
  //        一塁側の内野席から、裏の部屋の天井の板(bs_ceiling_white_lm)の裏が見える
  bay: {
    floor: [[/^(ground_paving|deck_paving)$/, 0.45]],
    night: [[/^(ground_paving|road_asphalt|deck_paving)$/, 0.4]],
    offset: [[/^wood_green$/, -1]],
    front: [/^bs_ceiling_white_lm$/],
  },
  // 11/19 新しい球場(同じ試験で数えた)
  // 海鳴り: 段のコンクリートが白く飛ぶ
  shore: {
    floor: [[/^stand_concrete$/, 0.35]],
  },
  // 森かげ: コンコースの床・外の舗装・部屋の床と階段・段が白く飛ぶ。店の厨房の床(dt_kitchen_black)が舗装と同じ高さでちらつく
  grove: {
    floor: [[/^(ground_paving|dt_floor_walk_band|paving_light)$/, 0.4], [/^(room_floor_grey|room_stair_step)$/, 0.35], [/^stand_concrete$/, 0.32], [/^bench_grey$/, 0.5]],
    dim: [[/^room_wall_white$/, 0.6]],
    offset: [[/^dt_kitchen_black$/, -1], [/^front_wall_green$/, -1]],
  },
  // 舟灯(屋内): 3 階・5 階のコンコースの床、外のデッキ・舗装が白く飛ぶ。夜も外が昼の明るさ
  canal: {
    floor: [[/^conc_floor_tile$/, 0.3], [/^(deck_paving|ground_paving)$/, 0.4], [/^kb_kb_signboards_floor$/, 0.62]],   // kb_kb_signboards_floor: 11/19 作り込みF、R5 で 5 階の床のタイルの絵が出て白く飛んだ
    night: [[/^(ground_paving|road_asphalt|deck_paving)$/, 0.4]],
  },
};

const ALL = {
  // 通路口の枠・段(js/passages.js が足す物)が、模型の壁・芝と同じ面に重なってちらつく(屋根の球場のダグアウト、杜ノ丘のベンチの段など)。枠と段を手前に描く
  offsetMesh: [[/^passage_frame/, -2], [/^passage_(stair|floor|step|deck)/, -1]],   // deck: 銀輪の 2 階コンコースの床と重なる
  // 通路口の白い壁(js/passages.js)が、屋内の昼の強い光で白く飛ぶ(屋根の球場のダグアウト・銀輪の部屋・潮凪の選手の通路)
  dimMesh: [[/^passage_wall/, 0.62]],
};

function list(st, k) { return [...((BREAK_FIX[st] || {})[k] || []), ...(ALL[k] || [])]; }

// 読み込んだ模型ごとに 1 回(main.js の prepModel の頭で呼ぶ。材質は 1 回だけ直す)
export function fixBreaks(root, THREE, st) {
  const stat = { dim: 0, night: 0, offset: 0, hide: 0, front: 0, floor: 0 };
  const dim = list(st, 'dim'), night = list(st, 'night'), off = list(st, 'offset'), hide = list(st, 'hide'), front = list(st, 'front'), offM = list(st, 'offsetMesh'), dimM = list(st, 'dimMesh');
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (hide.some((re) => re.test(o.name || ''))) { o.visible = false; o.userData.brkHidden = true; stat.hide++; return; }
    const dm = dimM.find(([re]) => re.test(o.name || ''));
    if (dm) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m && m.color && !m.userData.brkDimM) { m.userData.brkDimM = true; m.color.multiplyScalar(dm[1]); stat.dim++; }
    const om = offM.find(([re]) => re.test(o.name || ''));
    if (om) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m && !m.userData.brkOffM) { m.userData.brkOffM = true; m.polygonOffset = true; m.polygonOffsetFactor = om[1]; m.polygonOffsetUnits = om[1]; m.needsUpdate = true; stat.offset++; }
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m || m.userData.brk) continue;
      m.userData.brk = true;
      const n = m.name || '';
      const d = dim.find(([re]) => re.test(n));
      if (d && m.color) { m.color.multiplyScalar(d[1]); if (m.emissive && m.emissiveMap) m.emissive.multiplyScalar(d[1]); stat.dim++; }
      const nt = night.find(([re]) => re.test(n));
      if (nt && m.color) { m.userData.brkNight = nt[1]; m.userData.brkBase = m.color.clone(); NIGHT.add(m); stat.night++; }
      const of = off.find(([re]) => re.test(n));
      if (of) { m.polygonOffset = true; m.polygonOffsetFactor = of[1]; m.polygonOffsetUnits = of[1]; m.needsUpdate = true; stat.offset++; }
      if (front.some((re) => re.test(n)) && m.side !== THREE.FrontSide) { m.side = THREE.FrontSide; m.needsUpdate = true; stat.front = (stat.front || 0) + 1; }
    }
  });
  return stat;
}

// 床だけ暗くする: 読み込みが全部終わった後に 1 回(main.js の loadAll の終わり)。ほかの直し(夜の光の焼き込み・gfx の芝)が onBeforeCompile を付けた後に、つないで足す
export function fixBreaksLate(root, st) {
  const fl = list(st, 'floor'); let n = 0;
  if (!fl.length) return n;
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m || m.userData.brkFloor || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) continue;
      const f = fl.find(([re]) => re.test(m.name || '')); if (!f) continue;
      m.userData.brkFloor = true; n++;
      const k = (+f[1]).toFixed(3), prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
      m.onBeforeCompile = function (sh, r) {
        if (prev) prev.call(this, sh, r);
        sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { vec3 brkUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz); diffuseColor.rgb *= mix(1.0, ${k}, smoothstep(0.7, 0.85, dot(normal, brkUp))); }`);
        this.userData.brkApplied = sh.fragmentShader.includes('brkUp');   // 試験で確かめる用
      };
      m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|brkF' + k; };
      m.needsUpdate = true;
    }
  });
  return n;
}

const NIGHT = new Set();
// 時間帯が変わった時に呼ぶ(main.js の setTime)。夜だけ暗くする材質
export function applyNight(isNight) {
  for (const m of NIGHT) { m.color.copy(m.userData.brkBase); if (isNight) m.color.multiplyScalar(m.userData.brkNight); }
}
