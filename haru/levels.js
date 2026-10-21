// 面のデータ。しかけの区画(S.〜)を左から順に並べて組み立てる。座標はマス(48px)。縦は 0〜11 行。
// 地形の文字: # 地面 / B レンガ / ? ハテナ(コイン) / H ハテナ(ハート) / Q ハテナ(盾) / A ハテナ(つばさ) / E ハテナ(ブーツ) / R ハテナ(ほのおの剣)
//            X 木箱 / S 石 / M 鉄 / I 氷 / D 砂 / K トゲのブロック / L はしご / V 溶岩 / W 水 / ^ トゲ / = 板 / ~ 雲 / } { ベルトコンベア
// 物の文字:   o コイン / * 星 / h ハート / p 薬 / k カギ / g 宝石 / P スタート / C 中間 / G ゴール / w つばさ / b ブーツ / f ほのおの剣
//            n じしゃく / u 1UP / c 宝箱 / T バネ / Y トランポリン / > < 加速パネル / F 落ちる床 / J ジェットつばさ
// 力(つばさ・ブーツ・剣)はその面の中で拾い、やられると新しい順に1つ落とす。ゴールは力なしでも行ける作りにし、星は力があると取りやすい所に置く。
'use strict';

// 画面の上の HUD に かくれないように、星・足場は 2行目より上に 置かない(hi)
const hi = y => Math.max(2, y);
function sections(L) {
  const S = {};
  const en = (x, list) => (list || []).forEach(([dx, t, op]) => L.enemy(x + dx, t, op || {}));
  S.start = (x, o = {}) => { const top = o.top ?? 10; L.ground(x, x + 9, top); L.put(x + 2, top - 1, 'P'); if (o.deco) L.deco(x + 6, o.deco, 1); return x + 10; };
  S.run = (x, w, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + w - 1, top);
    if (o.fill) L.fill(x, x + w - 1, top, top, o.fill);
    if (o.coins) L.row(x + 2, top - 3, 'o'.repeat(o.coins));
    en(x, o.en);
    (o.deco || []).forEach(([dx, n]) => L.deco(x + dx, n, 1));
    if (o.cp !== undefined) L.put(x + o.cp, top - 1, 'C');
    (o.items || []).forEach(([dx, ch, dy]) => L.put(x + dx, top - 1 - (dy || 0), ch));
    return x + w;
  };
  S.gap = (x, w, o = {}) => {
    if (o.lava) L.lava(x, x + w - 1);
    if (o.plank) L.row(x + Math.floor((w - o.plank) / 2), o.plankY ?? 8, (o.cloud ? '~' : '=').repeat(o.plank));
    if (o.coins) L.row(x, o.coinY ?? 6, 'o'.repeat(w));
    if (o.fish) L.enemy(x + Math.floor(w / 2), 'fish', o.fish === true ? {} : o.fish);
    if (o.geyser) L.hazard(x + Math.floor(w / 2), 'geyser', { h: o.geyser });
    if (o.star) L.put(x + Math.floor(w / 2), hi(o.starY ?? 4), '*');
    en(x, o.en);
    return x + w;
  };
  // 頭で叩くブロック(地面から4段上)
  S.blocks = (x, pat, o = {}) => { const top = o.top ?? 10, w = pat.length + 4; L.ground(x, x + w - 1, top); L.row(x + 2, top - 4, pat); en(x, o.en); if (o.coins) L.row(x + 2, top - 6, 'o'.repeat(o.coins)); return x + w; };
  // バネで高い足場へ
  S.spring = (x, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + 11, top); L.put(x + 2, top - 1, 'T');
    L.row(x + 4, top - 5, (o.cloud ? '~' : '=').repeat(6));
    if (o.star) L.put(x + 7, top - 6, '*'); else L.row(x + 5, top - 6, 'oooo');
    en(x, o.en);
    return x + 12;
  };
  S.tramp = (x, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + 11, top); L.put(x + 2, top - 1, 'Y');
    L.row(x + 4, hi(top - 7) + 1, (o.cloud ? '~' : '=').repeat(5));
    if (o.star) L.put(x + 6, hi(top - 8), '*'); else L.row(x + 4, hi(top - 8), 'ooooo');
    return x + 12;
  };
  // 動く床で穴を渡る
  // 2026-10-18 夜 持ち主「勢いを つけた ジャンプで 越えられる 所が 多い」: 助走ジャンプは 約13マス とぶ → しかけで わたる 穴は 16マス 以上に(MINGAP)
  S.movers = (x, n, o = {}) => {
    n = Math.max(n, 4);
    const top = o.top ?? 10, w = 3 + n * 4;
    if (o.lava) L.lava(x, x + w - 1, top);
    for (let i = 0; i < n; i++) L.mover(x + 1 + i * 4, top - 2 - (o.step ? i % 2 : 0), o.kind || 'move', { range: 2 });
    if (o.star) L.put(x + Math.floor(w / 2), top - 6, '*');
    else L.row(x + 2, top - 5, 'o'.repeat(w - 4));
    en(x, o.en);
    return x + w;
  };
  // 落ちる床をつたう
  S.fallers = (x, n, o = {}) => {
    n = Math.max(n, 6);
    const top = o.top ?? 10, w = n * 3 + 1;
    if (o.lava) L.lava(x, x + w - 1, top);
    for (let i = 0; i < n; i++) { const y = top - 2 - (i % 2); L.row(x + 1 + i * 3, y, 'F'); L.row(x + 1 + i * 3, y - 2, 'o'); }
    en(x, o.en);
    return x + w;
  };
  // 回る火の棒の通路
  S.firebars = (x, w, n, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + w - 1, top);
    for (let i = 0; i < n; i++) L.hazard(x + Math.round(w / (n + 1) * (i + 1)), 'firebar', { y: top - 3, speed: (i % 2 ? -1 : 1) * (o.speed || 1.7), ang: i * 1.5 });
    en(x, o.en);
    return x + w;
  };
  // ドッスンの並び
  S.crushers = (x, n, o = {}) => { const top = o.top ?? 10, w = n * 3 + 3; L.ground(x, x + w - 1, top); for (let i = 0; i < n; i++) L.hazard(x + 2 + i * 3, 'crusher', { y: top - 8, phase: i * 0.45 }); if (o.coins) L.row(x + 2, top - 1, 'o'.repeat(w - 4)); return x + w; };
  // 壁ジャンプのたて穴(左の壁の下から入って、右の低い壁を越える)
  S.shaft = (x, o = {}) => {
    const top = o.top ?? 10, ch = o.ch || 'M';
    L.ground(x, x + 8, top);
    if (o.hint) L.hint(x, 'かべに向かって ジャンプ!', 'かべを けって 上へ のぼれる');
    L.fill(x + 3, x + 3, top - 9, top - 3, ch); L.fill(x + 6, x + 6, top - 6, top - 1, ch);
    if (o.star) L.put(x + 4, top - 8, '*'); else L.row(x + 4, top - 8, 'oo');
    return x + 9;
  };
  // はしごの塔(上を越える)
  S.tower = (x, o = {}) => {
    const top = o.top ?? 10, ch = o.ch || 'S', h = Math.min(o.h || 5, top - 3);
    L.ground(x, x + 8, top);
    L.fill(x + 3, x + 5, top - h, top - 1, ch); L.ladder(x + 2, top - h, top - 1);
    if (o.star) L.put(x + 4, top - h - 1, '*'); else L.row(x + 3, top - h - 1, 'ooo');
    en(x, o.en);
    return x + 9;
  };
  // 上昇気流で高い足場へ
  S.updraft = (x, o = {}) => {
    const top = o.top ?? 10, ch = o.ch || 'D';
    L.ground(x, x + 13, top);
    L.hazard(x + 2, 'updraft', { h: 9, w: 2 });
    L.fill(x + 5, x + 12, top - 7, top - 7, ch);
    if (o.star) L.put(x + 9, top - 8, '*'); else L.row(x + 6, top - 8, 'oooooo');
    en(x, o.en);
    return x + 14;
  };
  S.conveyor = (x, w, dir, o = {}) => { const top = o.top ?? 10; L.ground(x, x + w - 1, top); L.fill(x + 1, x + w - 2, top, top, dir > 0 ? '}' : '{'); en(x, o.en); if (o.coins) L.row(x + 2, top - 3, 'o'.repeat(o.coins)); return x + w; };
  S.zappers = (x, n, o = {}) => { const top = o.top ?? 10, w = n * 4 + 2; L.ground(x, x + w - 1, top); for (let i = 0; i < n; i++) L.hazard(x + 1 + i * 4, 'zapper', { y: top - 1, len: 3, phase: i * 0.9 }); return x + w; };
  S.icicles = (x, w, o = {}) => { const top = o.top ?? 10, ch = o.ch || 'I'; L.ground(x, x + w - 1, top); L.fill(x + 1, x + w - 2, top - 8, top - 7, ch); for (let k = x + 2; k < x + w - 2; k += 3) L.hazard(k, 'icicle', { y: top - 6 }); en(x, o.en); return x + w; };
  S.saws = (x, w, o = {}) => { const top = o.top ?? 10; L.ground(x, x + w - 1, top); L.hazard(x + 2, 'saw', { y: top - 2, range: w - 5, horiz: true }); if (o.coins) L.row(x + 2, top - 5, 'o'.repeat(w - 4)); return x + w; };
  S.axe = (x, o = {}) => { const top = o.top ?? 10; L.ground(x, x + 9, top); L.hazard(x + 5, 'axe', { y: top - 7 }); L.row(x + 3, top - 2, 'ooo'); return x + 10; };
  S.chest = (x, o = {}) => { const top = o.top ?? 10, ch = o.ch || 'S'; L.ground(x, x + 9, top); L.fill(x + 4, x + 6, top - 3, top - 3, ch); L.put(x + 5, top - 4, 'c'); en(x, o.en); return x + 10; };
  S.power = (x, blockCh, o = {}) => { const top = o.top ?? 10; L.ground(x, x + 7, top); L.row(x + 2, top - 4, 'B' + blockCh + 'B'); en(x, o.en); return x + 8; };
  S.updraftGap = (x, w, o = {}) => { w = Math.max(w, 18); L.hazard(x + Math.floor(w / 3) - 1, 'updraft', { h: 10, w: 2 }); L.hazard(x + Math.floor(w * 2 / 3) - 1, 'updraft', { h: 10, w: 2 }); L.row(x + 1, 3, 'o'.repeat(w - 2)); if (o.star) L.put(x + Math.floor(w / 2), 2, '*'); return x + w; };
  S.bubbles = (x, n, o = {}) => { n = Math.max(n, 7); const top = o.top ?? 10, w = n * 4 + 2; for (let i = 0; i < n; i++) L.mover(x + 1 + i * 4, top - 3 - (i % 2), 'bubble'); if (o.star) L.put(x + Math.floor(w / 2), hi(top - 8), '*'); en(x, o.en); return x + w; };
  // 2026-10-17: ふうせんは のると 上がってから 右へ ながれて 大きな 穴(28マス)を こえる。おりると しばらくして もとの 場所に もどる
  S.balloon = (x, o = {}) => { const top = o.top ?? 10, gap = 28, py = Math.max(top - 5, 3);
    if (!L.cpNear(x)) L.put(x + 1, top - 1, 'C');
    L.ground(x, x + 3, top); if (o.lava) L.lava(x + 4, x + 3 + gap, top + 1);
    L.mover(x + 3, top - 1, 'balloon', { range: top - 1 - py, drift: gap - 1 });
    L.row(x + 9, py - 2, 'oooo'); L.row(x + 18, py - 2, 'oooo');
    if (o.star) L.put(x + 14, hi(py - 3), '*');
    L.ground(x + 4 + gap, x + 8 + gap, top);
    return x + 9 + gap; };
  S.water = (x, w, o = {}) => { L.ground(x, x + w - 1, 11); L.water(x, x + w - 1, 7); L.row(x + 2, 10, 'o'.repeat(Math.min(5, w - 4))); if (o.fish) o.fish.forEach((dx, i) => L.enemy(x + dx, 'fish', { jump: 680, phase: i * 0.7 })); if (o.pillars) o.pillars.forEach(dx => L.fill(x + dx, x + dx + 1, 4, 8, 'S')); if (o.star) L.put(x + o.star, 10, '*'); return x + w; };
  S.door = (x, o = {}) => { const top = o.top ?? 10; L.ground(x, x + 5, top); L.wall(x + 2, top - 8, top - 3); L.door(x + 2, top - 1); if (o.star) L.put(x + 4, top - 1, '*'); L.row(x + 3, top - 3, 'gg'); return x + 6; };
  S.goal = (x, o = {}) => { const top = o.top ?? 10; L.ground(x, x + 13, top); L.stairs(x + 1, top, 5, +1, o.ch || '#'); L.put(x + 10, top - 1, 'G'); if (o.deco) L.deco(x + 7, o.deco, 1); /* 2026-10-17 夜: x+12 だと ゴールの 柱に かさなっていた */ return x + 14; };
  S.boss = (x, hp, o = {}) => { const top = o.top ?? 10; L.ground(x, x + 25, top); L.wall(x + 26, 2, top - 1); L.ground(x + 26, x + 26, top); L.put(x + 3, top - 1, 'h'); L.put(x + 22, top - 1, 'p'); L.row(x + 4, top - 4, 'BRB'); if (o.star) L.put(x + 12, top - 4, '*'); L.enemy(x + 15, 'boss', { arena: [x + 1, x + 25], hp }); L.deco(x + 1, 'torch', 1); L.deco(x + 24, 'torch', 1); return x + 27; };
  // ---------- ワールド4: 風・スイッチ・ワープ ----------
  // 横風の道: 扇風機から dir の向きに吹く。on/off を決めると 吹いたり止んだり
  S.windRun = (x, w, dir, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + w - 1, top);
    L.hazard(x, 'wind', { y: 1, h: top - 1, w, dir, v: o.v || 150, on: o.on, off: o.off, phase: o.phase, fx: dir > 0 ? x : x + w - 1 });
    if (o.coins) L.row(x + 2, top - 3, 'o'.repeat(o.coins));
    en(x, o.en);
    if (o.cp !== undefined) L.put(x + o.cp, top - 1, 'C');
    (o.items || []).forEach(([dx, ch, dy]) => L.put(x + dx, top - 1 - (dy || 0), ch));
    return x + w;
  };
  // 追い風で 広い穴を とぶ(風は ずっと吹く)
  S.windGap = (x, w, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + 2, top); L.ground(x + 3 + w, x + 5 + w, top);
    L.hazard(x, 'wind', { y: 1, h: top - 1, w: w + 5, dir: 1, v: o.v || 210, fx: x });
    L.row(x + 3, top - 5, 'o'.repeat(w));
    if (o.star) L.put(x + 3 + Math.floor(w / 2), hi(o.starY ?? 3), '*');
    en(x, o.en);
    return x + w + 6;
  };
  // 向かい風の穴: 吹いている間は とどかない。止んだ すきに とぶ
  S.windHead = (x, w, o = {}) => {
    const top = o.top ?? 10;
    if (o.hint) L.hint(x, 'むかいかぜ!', 'かぜが やんだ すきに ジャンプ');
    L.ground(x, x + 3, top); L.ground(x + 4 + w, x + 9 + w, top);
    if (o.lava) L.lava(x + 4, x + 3 + w, top);
    L.hazard(x, 'wind', { y: 1, h: top - 1, w: w + 10, dir: -1, v: o.v || 170, on: o.on || 2.2, off: o.off || 2.2, phase: o.phase || 0, fx: x + 9 + w });
    L.row(x + 4, top - 4, 'o'.repeat(w));
    en(x, o.en);
    return x + w + 10;
  };
  // スイッチの関所: 赤のかべ → スイッチで 青に → 青のかべの前で もう一度
  S.swGate = (x, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + 15, top);
    if (o.hint) L.hint(x, 'スイッチを 下から たたこう', 'あか と あおの ブロックが 入れかわる');
    L.put(x + 3, top - 4, '%');
    L.fill(x + 7, x + 7, top - 3, top - 1, '1');
    L.put(x + 10, top - 4, '%');
    L.fill(x + 13, x + 13, top - 3, top - 1, '2');
    L.fill(x + 7, x + 7, 0, top - 4, 'S'); L.fill(x + 13, x + 13, 0, top - 4, 'S');
    if (o.coins) L.row(x + 9, top - 1, 'ooo');
    en(x, o.en);
    return x + 16;
  };
  // スイッチの橋: 赤の橋 → まんなかの島で たたく → 青の橋
  S.swBridge = (x, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + 2, top); L.put(x + 1, top - 4, '%');
    L.row(x + 3, top, '1111');
    // 2026-10-17 夜: まんなかの スイッチ(星の 足場)を 1マス さげた。前は 4マスの 高さで、かべジャンプを 同じ かべで くりかえさないと 上に のれなかった
    L.ground(x + 7, x + 7, top); L.put(x + 7, top - 3, '%');
    L.row(x + 8, top, '2222');
    L.ground(x + 12, x + 14, top);
    if (o.lava) { L.lava(x + 3, x + 6, top + 1); L.lava(x + 8, x + 11, top + 1); }
    L.row(x + 3, top - 2, 'oooo'); L.row(x + 8, top - 2, 'oooo');
    if (o.star) L.put(x + 7, top - 6, '*');
    en(x, o.en);
    return x + 15;
  };
  // 青の階段(スイッチを たたくと あらわれる)で 高い所の星へ
  S.swStairs = (x, o = {}) => {
    const top = o.top ?? 10, last = Math.max(top - 7, 3);
    L.ground(x, x + 13, top);
    L.put(x + 2, top - 4, '%');
    L.row(x + 5, top - 3, '22'); L.row(x + 8, Math.round((top - 3 + last) / 2), '22'); L.row(x + 11, last, '22');
    L.row(x + 5, top - 6, '11');
    if (o.star) L.put(x + 12, last - 1, '*'); else L.row(x + 11, last - 1, 'oo');
    en(x, o.en);
    return x + 14;
  };

  // ワープで 高い たなへ(星や コイン)。たなから おりれば 先に すすめる
  S.warpUp = (x, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + 13, top);
    const ly = Math.min(4, top - 4);
    L.portal(x + 3, top - 1, x + 9, ly - 1, { hue: o.hue || 0 });
    L.fill(x + 7, x + 12, ly, ly, 'S');
    if (o.star) L.put(x + 11, ly - 1, '*'); else L.row(x + 10, ly - 1, 'ooo');
    en(x, o.en);
    return x + 14;
  };
  // かべの むこうへ ワープ(行きだけ)。手前には ちがう色の ワープ(コインの たな行き)
  S.warpWall = (x, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + 15, top);
    if (o.hint) L.hint(x, 'ワープの あな', 'さわると べつの ばしょへ とぶよ');
    L.fill(x + 8, x + 8, 0, top - 1, 'S');
    L.portal(x + 6, top - 1, x + 11, top - 1, { one: true, hue: 0 });
    L.portal(x + 2, top - 1, x + 2, 3, { hue: 120 });
    L.fill(x, x + 5, 4, 4, 'S'); L.row(x + 3, 3, 'ooo');
    en(x, o.en);
    return x + 16;
  };
  // ワープの まよい道: 3つの へや。それぞれ 前へ すすむワープと もどされるワープ
  S.warpMaze = (x, o = {}) => {
    const top = o.top ?? 10, start = x;
    for (let r = 0; r < 3; r++) {
      const rx = x + r * 9;
      L.ground(rx, rx + 8, top);
      L.fill(rx + 8, rx + 8, 0, top - 1, 'S');
      const good = (o.order || [0, 1, 0])[r];
      const gx = good ? rx + 6 : rx + 3, bx = good ? rx + 3 : rx + 6;
      L.portal(gx, top - 1, rx + 10, top - 1, { one: true, hue: 40 * r });
      L.portal(bx, top - 1, start + 1, top - 1, { one: true, hue: 200 });
      L.row(rx + 2, top - 4, 'o');
    }
    L.ground(x + 27, x + 30, top);
    if (o.star) L.put(x + 13, top - 5, '*');
    return x + 31;
  };
  // ボス部屋(ワールド4・5): 入ると うしろの入り口が しまる
  S.boss2 = (x, type, hp, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + 25, top); L.wall(x + 26, 0, top - 1); L.ground(x + 26, x + 26, top);
    L.put(x + 3, top - 1, 'h'); L.put(x + 22, top - 1, 'p');
    if (type === 'yurei') { L.put(x + 7, top - 4, 'O'); L.put(x + 19, top - 4, 'O'); }
    else L.row(x + 11, top - 4, 'BRB');
    if (o.star) L.put(type === 'yurei' ? x + 12 : x + 8, top - 5, '*');
    L.enemy(x + 15, type, { arena: [x + 1, x + 25], hp });
    L.deco(x + 1, 'torch', 1); L.deco(x + 24, 'torch', 1);
    return x + 27;
  };
  // ばねの たな: ばねで 高い たなへ(コイン)。ひみつの面では たなの はしに 紫の ワープを 置く(sec に 場所を 返す)
  S.springLedge = (x, o = {}) => {
    const top = o.top ?? 10, ch = o.ch || 'S', ly = Math.max(4, top - 6);
    L.ground(x, x + 11, top); L.put(x + 2, top - 1, 'T');
    L.fill(x + 5, x + 10, ly, ly, ch); L.row(x + 5, ly - 1, 'ooo');
    if (o.sec) o.sec.at = [x + 9, ly - 1];
    en(x, o.en);
    return x + 12;
  };
  // ひみつの へや(ゴールの うしろの かべの むこう)。ワープで 入る。中に ひみつのゴール
// ごほうびの 表(面の id → みどりキノコの 数 u・コインの 列 coins(1列 8まい)・たからこぞう takara)
const SECRET_REWARD = { 3: { u: 1, coins: 3 }, 6: { u: 2, coins: 1 }, 10: { u: 1, takara: 1, coins: 2 }, 15: { u: 1, coins: 3 }, 20: { u: 2, takara: 1 }, 27: { u: 2, coins: 3 }, 33: { u: 1, takara: 1, coins: 3 }, 42: { u: 3, coins: 3 } };
  S.secretRoom = (x, o = {}) => {
    const top = o.top ?? 10;
    L.fill(x, x, 0, top - 1, 'S'); L.ground(x, x + 12, top);
    L.row(x + 2, top - 3, 'gggg');
    L.put(x + 9, top - 1, '$');
    // 2026-10-18 持ち主「裏道に 進む メリットが ない」→ 面ごとに ちがう 大きな ごほうび(みどりキノコ=1UP・コインの 山・たからこぞう)。
    // 入口の 緑の ワープは 近づくまで ほぼ 見えない(hidden)。へやの ワープで もとの 場所に もどれる
    const R = SECRET_REWARD[L._def && L._def.id] || { u: 1, coins: 2 };
    const ys = [top - 2, top - 4, top - 5]; // ジャンプで とどく 高さ(5マス 上は とどかない)
    for (let i = 0; i < (R.coins || 0); i++) L.row(x + 4, ys[i], 'oooo'); // ワープ(x+3)の 右から ひみつの ゴール(x+9)の 手前まで
    for (let i = 0; i < (R.u || 0); i++) L.put(x + 6 + i, top - 1, 'u');
    if (R.takara) L.enemy(x + 7, 'takara', { life: 25 });
    return x + 13;
  };

  // ---------- ワールド5: ころがる いわ・じかんで きえるブロック・じかんスイッチ ----------
  // ころがる いわの坂道(右の 岩山から ときどき 転がってくる。ふむと とびこえられる)
  S.rocks = (x, w, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + w - 1, top);
    if (o.hint) L.hint(x, 'ころがる いわ!', 'とびこえるか、うえに のって ジャンプ');
    L.hazard(x + w - 1, 'roller', { dir: -1, every: o.every || 3.0, speed: o.speed || 180, phase: o.phase || 0.8 });
    if (o.coins) L.row(x + 2, top - 3, 'o'.repeat(o.coins));
    en(x, o.en);
    if (o.cp !== undefined) L.put(x + o.cp, top - 1, 'C');
    return x + w;
  };
  // じかんで きえるブロックの 道(3と4が 2びょうごとに 入れかわる)
  S.blink = (x, pat, o = {}) => {
    const top = o.top ?? 10, w = pat.length + 2;
    if (o.hint) L.hint(x, 'きえる ブロック', 'ちかちか したら もうすぐ きえるよ');
    if (o.lava) L.lava(x, x + w - 1, top + 1);
    for (let i = 0; i < pat.length; i++) { const c = pat[i]; if (c !== ' ') L.put(x + 1 + i, top - (o.rise ? Math.floor(i / 3) % 2 : 0), c); }
    L.row(x + 1, top - 3, pat.replace(/[34]/g, 'o').replace(/[^o]/g, ' '));
    if (o.star) L.put(x + Math.floor(w / 2), o.starY ?? top - 6, '*');
    en(x, o.en);
    return x + w;
  };
  // じかんで きえるブロックの 塔(星へ)
  S.blinkTower = (x, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + 11, top);
    L.row(x + 2, top - 3, '33'); L.row(x + 5, top - 5, '44'); L.row(x + 8, hi(top - 7), '33');
    if (o.star) L.put(x + 9, hi(top - 8), '*'); else L.row(x + 8, hi(top - 8), 'oo');
    en(x, o.en);
    return x + 12;
  };
  // じかんスイッチ: ふむと 先の とびら(5)が dur びょう ひらく。とびらまでに 穴や 敵
  S.timer = (x, w, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + w - 1, top);
    if (o.hint) L.hint(x, 'じかんスイッチ', 'ふむと とびらが しばらく ひらく');
    L.hazard(x + 2, 'plate', { dur: o.dur || 6 });
    if (o.gap) { const g0 = x + Math.floor(w / 2) - 1; for (let gx = g0; gx < g0 + o.gap; gx++) for (let y = top; y < 12; y++) L.put(gx, y, ' '); }
    L.fill(x + w - 2, x + w - 2, 0, top - 1, '5');
    if (o.coins) L.row(x + 5, top - 3, 'o'.repeat(o.coins));
    en(x, o.en);
    return x + w;
  };
  // じかんスイッチの ふた: ふむと 床の ふた(5)が しばらく あく。中の くぼみに 星
  S.timerCage = (x, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + 13, top);
    L.hazard(x + 2, 'plate', { dur: o.dur || 4 });
    L.row(x + 8, top, '555');
    if (o.star) L.put(x + 9, top, '*'); else L.row(x + 8, top, 'ooo');
    L.row(x + 8, top - 2, 'ooo');
    en(x, o.en);
    return x + 14;
  };

  // ---------- ワールド6: まめの つる・ジップライン・はねる ブロック ----------
  // たねブロック(N)を 下から たたくと、地面から 上まで つるが のびる。のぼって 高い たなへ
  S.seed = (x, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + 13, top);
    if (o.hint) L.hint(x, 'たねブロック', 'したから たたくと つるが のびる。↑で のぼろう');
    L.put(x + 3, top - 3, 'N');
    L.fill(x + 4, x + 11, 3, 3, o.ch || 'S');
    if (o.star) { L.put(x + 9, 2, '*'); L.row(x + 5, 2, 'ooo'); } else L.row(x + 5, 2, 'oooooo');
    en(x, o.en);
    return x + 14;
  };
  // つるで しか こえられない 高い かべ
  S.seedWall = (x, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + 11, top);
    L.put(x + 3, top - 3, 'N');
    // 2026-10-17: かべは 上まで(2行目から)。左の 面は トゲ → つるで のぼるしか ない
    L.fill(x + 5, x + 5, 2, top - 1, o.ch || 'S'); L.fill(x + 4, x + 4, 2, top - 1, 'K');
    L.row(x + 4, 1, 'oo');
    if (o.star) L.put(x + 9, hi(top - 6), '*');
    en(x, o.en);
    return x + 12;
  };
  // ジップライン: 台の上で ジャンプして とってに つかまると、穴の むこうまで すべる
  S.zip = (x, w, o = {}) => {
    const top = o.top ?? 10, ch = o.ch || '#';
    w = Math.max(w, 38); // 2026-10-17: ジャンプでは とどかない 長さ(穴 28マス)
    if (!L.cpNear(x)) L.put(x + 1, top - 1, 'C');
    if (o.hint) L.hint(x, 'ジップライン', 'ジャンプして とってに つかまろう');
    L.ground(x, x + 4, top); L.fill(x + 2, x + 4, top - 2, top - 1, ch);
    L.ground(x + w - 5, x + w - 1, top);
    if (o.lava) L.lava(x + 5, x + w - 6, top + 1);
    L.hazard(x + 3, 'zip', { y: top - 6, tx: x + w - 3, ty: top - 3 });
    // 星は ロープの とちゅう(ぶらさがった体が とおる 高さ)
    const mx = x + 3 + Math.floor((w - 6) / 2), my = Math.round(top - 6 + (3 * (mx - x - 3)) / (w - 6)) + 1;
    if (o.star) L.put(mx, my, '*'); else L.row(mx - 1, my, 'ooo');
    en(x, o.en);
    return x + w;
  };
  // はねる ブロックの 橋(穴の上)。ジャンプを おしたまま のると 高く はねる
  S.notes = (x, pat, o = {}) => {
    const top = o.top ?? 10, w = pat.length + 2;
    if (o.hint) L.hint(x, 'はねる ブロック', 'ジャンプを おしたまま のると 高く はねる');
    if (o.lava) L.lava(x, x + w - 1, top + 1);
    for (let i = 0; i < pat.length; i++) if (pat[i] === '7') L.put(x + 1 + i, top, '7');
    if (o.star) L.put(x + Math.floor(w / 2), hi(top - 7), '*');
    L.row(x + 1, top - 4, pat.replace(/7/g, 'o'));
    en(x, o.en);
    return x + w;
  };
  // はねる ブロックで 高い だいちへ(高く はねないと とどかない)
  S.noteCliff = (x, o = {}) => {
    const top = o.top ?? 10, ch = o.ch || '#';
    L.ground(x, x + 4, top); L.put(x + 3, top, '7');
    L.fill(x + 5, x + 10, top - 5, top - 1, ch); L.ground(x + 5, x + 10, top);
    if (o.star) L.put(x + 8, hi(top - 7), '*'); else L.row(x + 6, top - 6, 'oooo');
    L.ground(x + 11, x + 14, top);
    en(x, o.en);
    return x + 15;
  };

  // ---------- ワールド7: ふわふわ ゾーン・ほしの たいほう・ほうき星 ----------
  // ふわふわ ゾーン(じゅうりょくが よわい)の 島わたり。ふつうなら とどかない 6マスの すきま
  S.moon = (x, n, o = {}) => {
    const top = o.top ?? 10, gap = o.gap || 6, w = n * (4 + gap) + 4;
    if (o.hint) L.hint(x, 'ふわふわ ゾーン', 'たかく とべて ゆっくり おちる');
    L.hazard(x, 'lowgrav', { w });
    for (let i = 0; i <= n; i++) { const gx = x + i * (4 + gap), t2 = top - (o.step ? (i % 2) * 2 : 0); L.ground(gx, gx + 3, t2); if (i < n) L.row(gx + 4, t2 - 5, 'o'.repeat(gap)); }
    if (o.star) L.put(x + 4 + Math.floor(gap / 2), hi(top - 6), '*');
    en(x, o.en);
    return x + w;
  };
  // ほしの たいほう: はいると ななめ上へ とばされて 大きな 穴を こえる
  S.cannon = (x, gap, o = {}) => {
    const top = o.top ?? 10;
    const gap0 = gap; gap = Math.max(gap, 28); o = Object.assign({}, o, { power: Math.round((o.power || 1100) * Math.sqrt(gap / Math.max(8, gap0)) * 1.0) });
    if (!L.cpNear(x)) L.put(x + 1, top - 1, 'C');
    if (o.hint) L.hint(x, 'ほしの たいほう', 'はいると とびだすよ(ジャンプで すぐ うてる)');
    L.ground(x, x + 3, top);
    L.hazard(x + 2, 'cannon', { ang: o.ang ?? -55, power: o.power || 1100 });
    if (o.lava) L.lava(x + 4, x + 3 + gap, top + 1);
    L.ground(x + 4 + gap, x + 11 + gap, top);
    // 2026-10-17 夜: 穴を 28マスに した ときに たいほうが 強く なり、とぶ 道が 画面の 上の 外を とおるように なった。
    // 穴の まんなかの 星・コイン(上から 5行目)は つばさが ないと 取れなかった → 星と コインは うちだした すぐあとの とぶ 道の 上に ならべる
    const tanA = Math.tan(Math.abs((o.ang ?? -55) * Math.PI / 180));
    const onArc = dx => Math.max(2, Math.round(top - 0.7 - dx * tanA * 0.86));
    if (o.star) L.put(x + 2 + 5, onArc(5), '*');
    else for (const dx of [3, 4, 5]) L.put(x + 2 + dx, onArc(dx), 'o');
    en(x, o.en);
    return x + 12 + gap;
  };
  // たいほうで 真上の たなへ
  S.cannonUp = (x, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + 13, top);
    L.hazard(x + 2, 'cannon', { ang: -76, power: 1150 });
    L.fill(x + 5, x + 11, top - 6, top - 6, o.ch || 'S');
    if (o.star) L.put(x + 9, top - 7, '*'); else L.row(x + 6, top - 7, 'ooooo');
    en(x, o.en);
    return x + 14;
  };
  // ほうき星の みち: 右の 外から ほうき星が とんでくる(「!」が 出たら ジャンプ)
  S.comets = (x, w, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + w - 1, top);
    if (o.hint) L.hint(x, 'ほうき星!', '右の「!」が 出たら ジャンプで よけよう');
    L.hazard(x, 'comet', { w, row: top - 1, every: o.every || 2.6, phase: o.phase ?? 1.4 });
    if (o.high) L.hazard(x, 'comet', { w, row: top - 3, every: (o.every || 2.6) * 1.5, phase: 2.2 });
    if (o.coins) L.row(x + 2, top - 3, 'o'.repeat(o.coins));
    if (o.blocks) for (let k = x + 5; k < x + w - 3; k += 7) L.fill(k, k, top - 2, top - 1, 'S');
    if (o.cp !== undefined) L.put(x + o.cp, top - 1, 'C');
    en(x, o.en);
    return x + w;
  };

  // ---------- ワールド8: かんらんしゃ・くずれる つりばし・かげハル ----------
  // かんらんしゃの 足場で 穴を わたる
  S.wheel = (x, o = {}) => {
    if (!o.one) { if (!L.cpNear(x)) L.put(x, (o.top ?? 10) - 1, 'C'); const r0 = Math.min(o.r || 3, 3), step = 2 * r0 + 4; L.ground(x, x + 1, o.top ?? 10); if (o.lava) L.lava(x + 2, x + 2 + step * 3, (o.top ?? 10) + 1);
      for (let i = 0; i < 3; i++) S.wheel(x + 2 + i * step - 2, Object.assign({}, o, { one: true, mid: true, hint: o.hint && i === 0, star: o.star && i === 1, en: i === 2 ? o.en : null }));
      const ex = x + 2 + step * 3; L.ground(ex, ex + 3, o.top ?? 10); return ex + 4; }
    const top = o.top ?? 10, r = Math.min(o.r || 3, 3), w = 2 * r + 6, cx = x + Math.floor(w / 2), cy = top - r - 1;
    if (!o.mid) { L.ground(x, x + 1, top); L.ground(x + w - 2, x + w - 1, top); }
    if (o.lava && !o.mid) L.lava(x + 2, x + w - 3, top + 1);
    if (o.hint) L.hint(x, 'かんらんしゃ', 'まわる 足場に のって わたろう');
    L.hazard(cx, 'wheelhub', { y: cy, r, n: o.n || 4, sp: o.sp || 0.6 });
    const n = o.n || 4;
    for (let i = 0; i < n; i++) L.mover(cx, cy, 'wheel', { cx, cy, r, a0: i / n * Math.PI * 2, sp: o.sp || 0.6 });
    if (o.star) L.put(cx, hi(cy - r - 2), '*'); else L.row(cx - 1, hi(cy - r - 2), 'ooo');
    en(x, o.en);
    return x + w;
  };
  // くずれる つりばし: のると じゅんに おちる。とまらずに わたる
  let bridgeId = 0;
  S.bridge = (x, n, o = {}) => {
    n = Math.max(n, 16);
    const top = o.top ?? 10, g = ++bridgeId;
    L.ground(x, x + 2, top);
    if (o.lava) L.lava(x + 3, x + 2 + n, top + 1);
    for (let i = 0; i < n; i++) L.hazard(x + 3 + i, 'crumb', { y: top, g, i, n });
    L.row(x + 3, top - 2, 'o'.repeat(n));
    if (o.star) L.put(x + 3 + Math.floor(n / 2), top - 4, '*');
    L.ground(x + 3 + n, x + 5 + n, top);
    en(x, o.en);
    return x + 6 + n;
  };
  // かげハル: この 区間では 自分の かげが おくれて おいかけてくる。小さな じゃまものを こえながら すすむ
  S.shadowRun = (x, w, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + w - 1, top);
    L.hazard(x, 'shadow', { w, delay: o.delay || 1.6 });
    for (let k = x + 6; k < x + w - 4; k += 7) {
      if ((k - x) % 14 === 6) L.fill(k, k, top - 1, top - 1, o.ch || 'S');
      else for (let gx = k; gx < k + 2; gx++) for (let y = top; y < 12; y++) L.put(gx, y, o.lava ? 'V' : ' ');
    }
    L.row(x + 2, top - 3, 'o'.repeat(Math.min(6, w - 4)));
    if (o.star) L.put(x + w - 4, hi(top - 5), '*');
    if (o.cp !== undefined) L.put(x + o.cp, top - 1, 'C');
    en(x, o.en);
    return x + w;
  };
  // ボス部屋(ワールド6〜8)。low=ふわふわ ゾーン
  S.boss3 = (x, type, hp, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + 25, top); L.wall(x + 26, 0, top - 1); L.ground(x + 26, x + 26, top);
    L.put(x + 3, top - 1, 'h'); L.put(x + 22, top - 1, 'p');
    if (o.low) L.hazard(x + 1, 'lowgrav', { w: 25 });
    if (!o.low) { L.row(x + 5, top - 4, '==='); L.row(x + 18, top - 4, '==='); }
    if (o.star) L.put(x + 13, top - 6, '*');
    L.enemy(x + 15, type, { arena: [x + 1, x + 25], hp });
    L.deco(x + 1, 'torch', 1); L.deco(x + 24, 'torch', 1);
    return x + 27;
  };
  // ---------- 第4段階(スーパーマリオワールド風): もこりゅう・マント・くるくる・もちはこび・しんでん・ぎんの スイッチ・せんろ・いど ----------
  // たまごブロック(e): もこりゅうの たまご
  S.egg = (x, o = {}) => { const top = o.top ?? 10; L.ground(x, x + 9, top); if (o.hint) L.hint(x, 'たまごブロック', 'したから たたくと なにかが うまれる…'); L.row(x + 3, top - 4, 'BeB'); en(x, o.en); return x + 10; };
  // マントの ハテナ(q)と、はしる ための ながい 道
  S.capeBox = (x, o = {}) => { const top = o.top ?? 10; L.ground(x, x + 21, top); L.row(x + 3, top - 4, 'BqB'); if (o.hint) L.hint(x + 8, 'ほしの マント', 'はしって メーターが たまったら ジャンプで とべる'); L.row(x + 12, hi(top - 7), 'oooooo'); en(x, o.en); return x + 22; };
  // くるくるブロック(j): たたくと まわって とおれる。上の たなへ
  S.turn = (x, o = {}) => {
    const top = o.top ?? 10, w = 14;
    L.ground(x, x + w - 1, top);
    if (o.hint) L.hint(x, 'くるくるブロック', 'したから たたくと まわって とおりぬけられる。スピンで ふむと こわれる');
    // 2026-10-17 夜: かべジャンプを 同じ かべで つづけて できなく したので、くるくるブロックの 列を 1マス さげた(上に のぼる 道が かべジャンプ だのみ だった)
    L.row(x + 3, top - 3, 'jjjjjjjj');
    L.row(x + 4, top - 4, 'oooooo');
    L.row(x + 4, top - 7 < 2 ? 2 : top - 7, o.star ? '' : 'jjj');
    if (o.star) L.put(x + 7, hi(top - 7), '*');
    en(x, o.en);
    return x + w;
  };
  // なげブロック(t)と 敵の ならび: もって なげると まとめて たおせる
  S.throwRun = (x, o = {}) => {
    const top = o.top ?? 10, w = 16;
    L.ground(x, x + w - 1, top);
    if (o.hint) L.hint(x, 'もちあげて なげる', 'C(ダッシュ)を おして ふれると もてる。もう いちど おすと なげる');
    L.put(x + 2, top - 1, 't'); L.put(x + 4, top - 1, 't');
    en(x, o.en || [[9, 'goomy'], [11, 'goomy'], [13, 'goomy']]);
    return x + w;
  };
  // こうらの 坂: こうら虫を ふんで けると まとめて たおせる
  S.shells = (x, o = {}) => { const top = o.top ?? 10, w = 16; L.ground(x, x + w - 1, top); en(x, [[4, 'shell'], [10, 'goomy'], [12, 'goomy'], [14, o.e3 || 'goomy']]); if (o.coins) L.row(x + 6, top - 3, 'ooooo'); return x + w; };
  // しんでんの 点線ブロック: 穴(4マス・とびこえられる)に 橋、上の たなへの かいだん(たからばこ)
  S.palaceRoute = (x, color, o = {}) => {
    const top = o.top ?? 10, ch = { y: '6', g: '8', b: '9', p: '0' }[color] || '6', ly = Math.max(3, top - 6);
    L.ground(x, x + 3, top); L.ground(x + 8, x + 17, top);
    if (o.lava) L.lava(x + 4, x + 7, top + 1);
    L.row(x + 4, top, ch.repeat(4));
    L.row(x + 4, top - 3, 'oooo');
    L.row(x + 10, top - 2, ch); L.row(x + 11, top - 4, ch + ch); L.put(x + 13, ly + 1 < top - 4 ? ly + 1 : top - 5, ch);
    L.fill(x + 14, x + 17, ly, ly, 'S'); L.put(x + 16, ly - 1, 'c');
    en(x, o.en);
    return x + 18;
  };
  // ぎんの スイッチ(&): ふむと レンガの かべが コインに なって、おくの たからが とれる
  S.pswitch = (x, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + 15, top);
    if (o.hint) L.hint(x, 'ぎんの スイッチ', 'ふむと しばらく コインと レンガが 入れかわる');
    L.put(x + 2, top - 1, '&');
    L.fill(x + 8, x + 8, top - 3, top - 1, 'B'); L.fill(x + 8, x + 14, top - 4, top - 4, 'S'); L.fill(x + 14, x + 14, top - 3, top - 1, 'S');
    L.put(x + 11, top - 1, 'c'); L.row(x + 9, top - 3, 'ooooo');
    en(x, o.en);
    return x + 16;
  };
  // せんろの 上を うごく 足場で 大きな 穴を わたる
  S.rail = (x, w, o = {}) => {
    w = Math.max(w, 22);
    const top = o.top ?? 10;
    L.ground(x, x + 2, top); L.ground(x + w - 3, x + w - 1, top);
    if (o.lava) L.lava(x + 3, x + w - 4, top + 1);
    if (o.hint) L.hint(x, 'せんろの 足場', 'のると せんろに そって うごく');
    const dx = w - 6, up = o.up ?? 2;
    L.mover(x + 2, top - 1, 'rail', { path: [[Math.floor(dx / 3), -up], [Math.floor(dx * 2 / 3), -up], [dx - 1, 0]], sp: o.sp || 120 });
    L.row(x + 3 + Math.floor(dx / 3), top - up - 4, 'ooo');
    if (o.star) L.put(x + Math.floor(w / 2), hi(top - up - 5), '*');
    en(x, o.en);
    return x + w;
  };
  // いど: ↓で 入ると ちかの ボーナスの へや(ゴールの 先に 作る)
  S.well = (x, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + 9, top);
    if (o.hint) L.hint(x, 'いど', 'うえに たって ↓で はいれる');
    (L._post = L._post || []).push(() => {
      const rx = L.maxX() + 4;
      L.fill(rx, rx, 0, 10, 'S'); L.ground(rx, rx + 14, 11); L.fill(rx, rx + 14, 0, 1, 'S'); L.fill(rx + 14, rx + 14, 0, 10, 'S');
      L.row(rx + 2, 8, 'oooooooooo'); L.row(rx + 3, 5, '?????'); L.put(rx + 7, 10, 'c');
      L.well(x + 4, top, rx + 2, 11, false);
      L.well(rx + 11, 11, x + 7, top, false);
    });
    en(x, o.en);
    return x + 10;
  };
  // トゲてっきゅう(とりで)
  S.ballchain = (x, o = {}) => { const top = o.top ?? 10, w = 12; L.ground(x, x + w - 1, top); L.hazard(x + 6, 'ballchain', { y: top - 4, r: o.r || 3, sp: o.sp || 1.3, ang: o.ang || 0 }); if (o.coins) L.row(x + 2, top - 2, 'oo'); en(x, o.en); return x + w; };
  // つぶす 天井(とりで): くぼみ(notch)で まつか、おりてくる 前に はしりぬける
  S.ceil = (x, w, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + w - 1, top);
    if (o.hint) L.hint(x, 'つぶす てんじょう!', 'くぼみで まつか、はやく はしりぬけよう');
    const notch = o.notch || [Math.floor(w / 2)];
    L.hazard(x, 'ceil', { w, notch, top: 2, phase: o.phase || 1.0 });
    L.row(x + 1, top - 1, 'o'.repeat(w - 2).split('').map((c, i) => notch.includes(i + 1) ? ' ' : (i % 2 ? 'o' : ' ')).join(''));
    return x + w;
  };
  // おばけやしき: とびらの まよい道。3つの とびらの うち 1つだけ 先へ。ほかは 行き止まり(もどる とびら)
  S.doorMaze = (x, o = {}) => {
    const top = o.top ?? 10, good = o.good ?? 1;
    L.ground(x, x + 15, top);
    if (o.hint) L.hint(x, 'とびら', 'とびらの まえで ↑ を おすと はいれる');
    L.fill(x + 15, x + 15, 0, top - 1, 'S');
    // 行き先の へや: 右に 3つ(それぞれ かべで しきる)
    const rx = x + 16;
    for (let r = 0; r < 3; r++) {
      const bx = rx + r * 9;
      L.ground(bx, bx + 8, top); L.fill(bx + 8, bx + 8, 0, top - 1, 'S');
      L.wdoor(x + 3 + r * 4, top - 1, bx + 2, top - 1);
      if (r !== good) { L.row(bx + 4, top - 3, 'ooo'); }
    }
    // 正しい へやの 先は つづく(かべに 穴)
    const gx = rx + good * 9 + 8;
    for (let y = top - 3; y < top; y++) L.put(gx, y, ' ');
    if (good < 2) { // 正しい へやが さいごで ない ときは、うしろの へやの ゆかの 上を とおって 出口へ
      for (let r = good + 1; r < 3; r++) { const bx = rx + r * 9; for (let y = top - 3; y < top; y++) L.put(bx + 8, y, ' '); }
    }
    if (o.star) L.put(rx + good * 9 + 5, top - 3, '*');
    return rx + 27;
  };
  // おばけやしき: きえる ゆか(じかんで きえる ブロックの 床)と おおおばけ
  S.ghostFloor = (x, o = {}) => {
    const top = o.top ?? 10, pat = o.pat || '3344334433';
    L.ground(x, x + 1, top); L.ground(x + pat.length + 2, x + pat.length + 4, top);
    for (let i = 0; i < pat.length; i++) L.put(x + 2 + i, top, pat[i]);
    L.row(x + 2, top - 3, 'o'.repeat(pat.length));
    if (o.star) L.put(x + 2 + Math.floor(pat.length / 2), top - 5, '*');
    if (o.boo) L.enemy(x - 4, 'oobake', { y: 3 });
    en(x, o.en);
    return x + pat.length + 5;
  };
  // 水の中の 道(上から 下まで 水)。ぷっくん と さかな
  S.deep = (x, w, o = {}) => {
    L.ground(x, x + w - 1, 11); L.water(x, x + w - 1, 1, 10);
    if (o.pillars) o.pillars.forEach(([dx, y0, y1]) => L.fill(x + dx, x + dx + 1, y0, y1, 'S'));
    if (o.coins) L.row(x + 2, o.coinY ?? 6, 'o'.repeat(Math.min(8, w - 4)));
    (o.fugu || []).forEach(([dx, y]) => L.enemy(x + dx, 'fugu', { y }));
    if (o.star) L.put(x + o.star[0], o.star[1], '*');
    if (o.cp !== undefined) { L.fill(x + o.cp - 1, x + o.cp + 1, 10, 10, 'S'); L.put(x + o.cp, 9, 'C'); }
    return x + w;
  };
  // 空の 道(雲の ゆか): 雲を つたう。下は 穴
  S.clouds = (x, n, o = {}) => {
    const top = o.top ?? 9, w = n * 4 + 1;
    for (let i = 0; i < n; i++) { const y = top - (i % 3 === 1 ? 2 : i % 3 === 2 ? 1 : 0); L.row(x + 1 + i * 4, y, '~~~'); L.row(x + 1 + i * 4, y - 2, 'oo'); }
    en(x, o.en);
    return x + w;
  };
  // ボス部屋(とりで の ぬし)
  S.fortBoss = (x, hp, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + 21, top); L.wall(x + 22, 0, top - 1); L.ground(x + 22, x + 22, top);
    L.put(x + 3, top - 1, 'h');
    if (o.star) L.put(x + 10, top - 5, '*');
    L.row(x + 7, top - 4, '==='); L.row(x + 13, top - 4, '===');
    if (o.low) L.hazard(x + 1, 'lowgrav', { w: 21 });
    L.enemy(x + 14, 'hone', { arena: [x + 1, x + 21], hp });
    L.deco(x + 1, 'torch', 1); L.deco(x + 20, 'torch', 1);
    return x + 23;
  };
  // しんでんの スイッチの へや(さいご)
  S.palaceEnd = (x, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + 13, top); L.fill(x + 13, x + 13, 0, top - 1, 'S');
    L.put(x + 7, top - 1, '!');
    L.deco(x + 2, 'crystal', 1); L.deco(x + 11, 'crystal', 1);
    return x + 14;
  };
  // ---------- 第5段階(2026-10-13): 新しい しかけの 区画 ----------
  // シーソー: 穴の 上に シーソーを ならべる(のった ほうが さがる)
  S.seesaws = (x, n, o = {}) => {
    if (!o.safe) n = Math.max(n, 3);
    const top = o.top ?? 10, w = 3 + n * 6 + 3;
    if (o.hint) L.hint(x, 'シーソー', 'のった ほうが さがる。高い ほうへ あるいて つぎへ');
    L.ground(x, x + 2, top); L.ground(x + w - 3, x + w - 1, top);
    if (o.lava) L.lava(x + 3, x + w - 4, top + 1);
    if (o.safe) L.ground(x + 3, x + w - 4, top + 1);
    for (let i = 0; i < n; i++) { const px = x + 5 + i * 6; L.hazard(px, 'seesaw', { y: top - 1, half: 2.5 }); L.row(px - 1, top - 3, 'ooo'); }
    if (o.star) L.put(x + 5 + (n - 1) * 6, hi(top - 5), '*');
    en(x, o.en);
    return x + w;
  };
  // すいこみ つつ: 口の 上で ↓。高い かべの むこうへ(または 上の たなへ)
  S.tubeWall = (x, o = {}) => {
    const top = o.top ?? 10, w = 16;
    if (o.hint) L.hint(x, 'すいこみ つつ', 'つつの 口の 上で ↓ を おすと 中を とおって とびだす');
    L.ground(x, x + w - 1, top);
    L.fill(x + 7, x + 8, 3, top - 1, o.ch || 'S');
    L.hazard(x + 3, 'tube', { pts: [[x + 3, top - 1], [x + 3, 2], [x + 11, 2], [x + 11, top - 3]], exitV: 600 });
    L.row(x + 9, top - 1, 'oo'); if (o.star) L.put(x + 13, top - 1, '*');
    en(x, o.en);
    return x + w;
  };
  // つつで 上の たなへ(ほうびの たな。下を あるいても すすめる)
  S.tubeUp = (x, o = {}) => {
    const top = o.top ?? 10, w = 14, ly = Math.max(3, top - 6);
    L.ground(x, x + w - 1, top);
    L.fill(x + 6, x + 12, ly, ly, o.ch || 'S');
    L.hazard(x + 2, 'tube', { pts: [[x + 2, top - 1], [x + 2, ly - 2], [x + 8, ly - 2]], exitV: 500 });
    if (o.star) L.put(x + 11, ly - 1, '*'); else L.row(x + 9, ly - 1, 'ooo');
    en(x, o.en);
    return x + w;
  };
  // トロッコ: pat の 1文字が 1マス。'.' 地面 / '_' 穴 / '#' 1マスの いわ(とびこえる。ぶつかると おりる)/ 'e' 地面と てき / 'o' 地面と 上の コイン / '*' 地面と 上の 星
  S.cart = (x, pat, o = {}) => {
    const top = o.top ?? 10;
    if (o.hint) L.hint(x, 'トロッコ', 'のると すすみつづける。ジャンプで あなを とびこえよう');
    L.ground(x, x + 4, top);
    L.hazard(x + 2, 'cart', { sp: o.sp || 440 });
    for (let i = 0; i < pat.length; i++) {
      const gx = x + 5 + i, c = pat[i];
      if (c === '_') { if (o.lava) L.lava(gx, gx, top + 1); continue; }
      L.ground(gx, gx, top);
      if (c === '#') L.put(gx, top - 1, o.ch || 'S');
      if (c === 'e') L.enemy(gx, o.e || 'goomy');
      if (c === 'o') L.row(gx, top - 3, 'o');
      if (c === '*') L.put(gx, hi(top - 4), '*');
    }
    const end = x + 5 + pat.length;
    L.hazard(x, 'rails', { w: pat.length + 5 });
    L.ground(end, end + 5, top); L.put(end, top - 1, o.ch || 'S');
    return end + 6;
  };
  // しおの みちひき: ひくい ゆかの 道に 高い かべ。みちた ときに およいで かべを こえる。ひいた ときは ゆかの コイン
  S.tide = (x, w, o = {}) => {
    const lo = 10, hi2 = o.hi ?? 4;
    if (o.hint) L.hint(x, 'しおの みちひき', 'みずが ふえたら およいで かべの 上へ');
    L.ground(x, x + w - 1, 10);
    (o.walls || []).forEach(([dx, h]) => L.fill(x + dx, x + dx + 1, 10 - h, 9, 'S'));
    (o.ledges || []).forEach(([dx, y, n]) => L.fill(x + dx, x + dx + (n || 3) - 1, y, y, 'S'));
    (o.logs || []).forEach(dx => L.hazard(x + dx, 'log', { y: 9, tide: true, sink: 30 }));
    L.hazard(x, 'tide', { w, lo, hi: hi2, per: o.per || 9, phase: o.phase || 0 });
    L.row(x + 2, 9, 'o'.repeat(Math.min(6, w - 4)));
    (o.fugu || []).forEach(([dx, y]) => L.enemy(x + dx, 'fugu', { y }));
    if (o.star) L.put(x + o.star[0], o.star[1], '*');
    en(x, o.en);
    return x + w;
  };
  // しずむ うきぎ: 穴(ようがん か 水)の 上の 丸太。のると しずむ。とまらずに わたる
  S.logs = (x, n, o = {}) => {
    n = Math.max(n, 7); if (!L.cpNear(x)) L.put(x + 1, (o.top ?? 10) - 1, 'C');
    const top = o.top ?? 10, w = 3 + n * 4 + 3;
    if (o.hint) L.hint(x, 'しずむ うきぎ', 'のると しずんで いく。とまらずに わたろう');
    L.ground(x, x + 2, top); L.ground(x + w - 3, x + w - 1, top);
    if (o.water) { L.ground(x + 3, x + w - 4, 11); L.water(x + 3, x + w - 4, top, 10); L.hazard(x + 3, 'wind', { y: top, h: 11 - top, w: w - 6, dir: -1, v: 420, fx: x + w - 4, water: true }); } else L.lava(x + 3, x + w - 4, top + 1);
    // ↑ 2026-10-18 夜: 水の 下を およいで わたれた → いかだの 川と 同じ 左への ながれ
    for (let i = 0; i < n; i++) L.hazard(x + 4 + i * 4, 'log', { y: top, sink: o.water ? 60 : 40, sp: o.water ? 40 : 28 });
    L.row(x + 4, top - 3, 'o'.repeat(w - 8));
    if (o.star) L.put(x + Math.floor(w / 2), hi(top - 5), '*');
    en(x, o.en);
    return x + w;
  };
  // ぴょんぴょん ブロックの 橋: pat の ':' ピンク / ';' 水色 / ' ' 穴。ジャンプする たびに 入れかわる
  S.jumpBridge = (x, pat, o = {}) => {
    const top = o.top ?? 10, w = pat.length + 6;
    if (o.hint) L.hint(x, 'ぴょんぴょん ブロック', 'ジャンプする たびに ピンクと 水色が 入れかわる');
    L.ground(x, x + 2, top); L.ground(x + w - 3, x + w - 1, top);
    if (o.lava) L.lava(x + 3, x + w - 4, top + 1);
    for (let i = 0; i < pat.length; i++) if (pat[i] === ':' || pat[i] === ';') L.put(x + 3 + i, top - (o.rise ? Math.floor(i / 4) % 2 : 0), pat[i]);
    L.row(x + 3, top - 3, pat.replace(/[:;]/g, 'o').replace(/[^o]/g, ' '));
    if (o.star) L.put(x + Math.floor(w / 2), hi(top - 5), '*');
    en(x, o.en);
    return x + w;
  };
  // ぴょんぴょん ブロックの かべ: ピンクの かべ(:)は ジャンプで きえる。上は 石で ふさぐ
  S.jumpWalls = (x, n, o = {}) => {
    const top = o.top ?? 10, w = n * 5 + 3;
    L.ground(x, x + w - 1, top);
    for (let i = 0; i < n; i++) { const wx = x + 3 + i * 5, c = i % 2 ? ';' : ':'; L.fill(wx, wx, top - 3, top - 1, c); L.fill(wx, wx, 0, top - 4, o.ch || 'S'); L.row(wx + 2, top - 2, 'o'); }
    en(x, o.en);
    return x + w;
  };
  // ぴょんぴょん ブロックの 塔: ピンクと 水色の 足場を ジグザグに のぼる(星は てっぺん)
  S.jumpTower = (x, o = {}) => {
    const top = o.top ?? 10, w = 12;
    L.ground(x, x + w - 1, top);
    const steps = [[2, top - 3, ';'], [6, top - 5, ':'], [2, top - 7, ';'], [6, hi(top - 9), ':']];
    for (const [dx, y, c] of steps) if (y >= 2) L.row(x + dx, y, c + c + c);
    if (o.star) L.put(x + 7, hi(top - 10), '*'); else L.row(x + 6, hi(top - 10), 'ooo');
    en(x, o.en);
    return x + w;
  };
  // ぶらんこ: 穴の 上に つるの ぶらんこを ならべる
  S.swings = (x, n, o = {}) => {
    // 2026-10-17: ぶらんこは 6つ・間かく 5マス(穴 30マス)。間かく 6だと 力の 1わり 弱い 試験で わたれなかった
    n = o.safe ? n : Math.max(n, 6); if (!L.cpNear(x)) L.put(x + 1, (o.top ?? 10) - 1, 'C');
    const top = o.top ?? 10, gap = o.gap || (o.safe ? 6 : 5), w = 4 + n * gap + 4;
    if (o.hint) L.hint(x, 'ぶらんこ', 'とびついて ←→で こぐ。ジャンプで とびだす');
    L.ground(x, x + 3, top); L.ground(x + w - 4, x + w - 1, top);
    if (o.lava) L.lava(x + 4, x + w - 5, top + 1);
    if (o.safe) L.ground(x + 4, x + w - 5, top);
    for (let i = 0; i < n; i++) { const ax = x + 4 + Math.floor(gap / 2) + i * gap; L.hazard(ax, 'swing', { y: Math.max(1, top - 9), len: o.len || (o.safe ? 4 : 5), th0: (i % 2 ? -1 : 1) * (o.th0 || 0.8) }); L.row(ax - 1, top - 6, 'o o'); }
    if (o.star) L.put(x + 4 + Math.floor(gap / 2) + (n - 1) * gap + 1, top - 5, '*');
    en(x, o.en);
    return x + w;
  };
  // あわ ふきだし: 高い かべの 手前で あわが のぼってくる。ふんで はねて かべの 上へ
  S.bubbleWall = (x, o = {}) => {
    const top = o.top ?? 10, w = 14, wh = o.h || 6;
    if (o.hint) L.hint(x, 'あわ ふきだし', 'のぼってくる あわを ふむと たかく はねる');
    L.ground(x, x + w - 1, top);
    L.hazard(x + 4, 'bvent', { every: o.every || 1.5, cargo: o.cargo || ['', 'coin', ''], top: 1 });
    L.fill(x + 8, x + 9, top - wh, top - 1, o.ch || 'S');
    L.row(x + 8, top - wh - 1, 'oo');
    if (o.star) L.put(x + 4, hi(top - 8), '*');
    en(x, o.en);
    return x + w;
  };
  // あわの 穴: 穴の 底から あわが のぼる。あわを ふんで わたる
  S.bubbleGap = (x, o = {}) => {
    const top = o.top ?? 10, w = 14;
    L.ground(x, x + 2, top); L.ground(x + w - 3, x + w - 1, top);
    L.ground(x + 6, x + 7, 11); L.hazard(x + 6, 'bvent', { every: o.every || 1.3, cargo: o.cargo || ['', '', 'goomy'], top: 1, sp: 95 });
    L.row(x + 4, top - 5, 'oooooo');
    if (o.star) L.put(x + 7, hi(top - 7), '*');
    en(x, o.en);
    return x + w;
  };
  // ぶくガニの はま: あるく カニが あわを ふいてくる
  S.crabs = (x, w, o = {}) => { const top = o.top ?? 10; L.ground(x, x + w - 1, top); for (let k = 6; k < w - 2; k += 7) L.enemy(x + k, 'bukugani'); if (o.coins) L.row(x + 2, top - 3, 'o'.repeat(Math.min(6, w - 4))); if (o.cp !== undefined) L.put(x + o.cp, top - 1, 'C'); return x + w; };
  // どかん ブロック: 上の どうかせん(どかん ブロックの 列)を 下から たたくと、つながった かべまで つぎつぎ ばくはつ
  S.fuseWall = (x, o = {}) => {
    const top = o.top ?? 10, w = 14, wx = x + 8;
    if (o.hint) L.hint(x, 'どかん ブロック', 'したから たたくと ひが つく。となりの ブロックへ つぎつぎ ばくはつ');
    L.ground(x, x + w - 1, top);
    L.row(x + 3, top - 4, '+++++');
    L.fill(wx, wx, top - 4, top - 1, '+');
    L.fill(wx, wx, 0, top - 5, o.ch || 'S');
    L.row(wx + 2, top - 1, 'oo');
    if (o.star) L.put(wx + 3, top - 1, '*');
    en(x, o.en);
    return x + w;
  };
  // おせる いわと おもし スイッチ: いわを スイッチに のせると とびら(|)が ひらく
  S.pushGate = (x, o = {}) => {
    const top = o.top ?? 10, w = 16;
    if (o.hint) L.hint(x, 'おもし スイッチ', 'いわを おして スイッチの 上に のせよう');
    L.ground(x, x + w - 1, top);
    L.hazard(x + 3, 'pblock', {});
    L.hazard(x + 11, 'wplate', {});
    L.fill(x + 12, x + 12, top - 4, top - 1, '|'); L.fill(x + 12, x + 12, 0, top - 5, o.ch || 'S');
    L.row(x + 13, top - 1, 'oo');
    en(x, o.en);
    return x + w;
  };
  // おせる いわを ようがんに おとして 足場に する(星への 近道)
  S.pushLava = (x, o = {}) => {
    const top = o.top ?? 10, w = 14;
    L.ground(x, x + 4, top); L.ground(x + 10, x + w - 1, top);
    L.lava(x + 5, x + 9, top + 1);
    L.hazard(x + 2, 'pblock', {});
    if (o.star) L.put(x + 6, hi(top - 6), '*'); else L.row(x + 5, top - 4, 'ooooo');
    en(x, o.en);
    return x + w;
  };
  // さかさま スイッチの へや: pat の 1文字が 6マス。'F' ゆかを あるく(てんじょうに 穴)/ 'C' てんじょうを あるく(ゆかに 穴)
  S.grav = (x, pat, o = {}) => {
    const top = o.top ?? 10, seg = 8, w = 4 + pat.length * seg + 4;
    if (o.hint) L.hint(x, 'さかさま スイッチ', 'うえむきの 玉に さわると てんじょうが ゆかに なる');
    L.ground(x, x + w - 1, top); L.fill(x, x + w - 1, 0, 2, o.ch || 'S');
    let cur = 'F';
    for (let i = 0; i < pat.length; i++) {
      const sx = x + 4 + i * seg, c = pat[i];
      if (c !== cur) { L.hazard(sx - 1, 'gorb', { y: c === 'C' ? top - 1 : 3, dir: c === 'C' ? -1 : 1 }); cur = c; }
      if (c === 'C') { for (let k = 1; k < seg - 1; k++) for (let y = top; y < 12; y++) L.put(sx + k, y, ' '); L.row(sx + 2, 4, 'oooo'); }
      else { L.fill(sx + 1, sx + seg - 2, 0, 2, ' '); L.row(sx + 2, top - 2, 'oooo'); }
    }
    if (cur === 'C') L.hazard(x + 4 + pat.length * seg, 'gorb', { y: 3, dir: 1 });
    if (o.star) L.put(x + 4 + (o.starSeg ?? 1) * seg + 2, o.starY ?? 6, '*');
    en(x, o.en);
    return x + w;
  };
  // ゆきだまの かべ: ゆきだまを けって レンガの かべを こわす(上は 石で ふさぐ)
  S.snowWall = (x, o = {}) => {
    const top = o.top ?? 10, w = 16;
    if (o.hint) L.hint(x, 'ゆきだま', 'けると ころがって 大きく なる。レンガの かべも こわせる');
    L.ground(x, x + w - 1, top);
    if (o.ice) L.fill(x + 1, x + w - 2, top, top, 'I');
    L.hazard(x + 3, 'snowb', { r: 22 });
    L.fill(x + 11, x + 11, top - 3, top - 1, 'B'); L.fill(x + 11, x + 11, 0, top - 4, o.ch || 'S');
    L.row(x + 12, top - 1, 'ooo');
    en(x, o.en);
    return x + w;
  };
  // ゆきの さか道: ころりん が ゆきだまを ころがしてくる。すべりん も
  S.snowRun = (x, w, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + w - 1, top);
    if (o.ice) L.fill(x + 1, x + w - 2, top, top, 'I');
    L.enemy(x + w - 2, 'kororin', { every: o.every || 3.0 });
    (o.pen || []).forEach(dx => L.enemy(x + dx, 'suberin'));
    if (o.coins) L.row(x + 2, top - 3, 'o'.repeat(Math.min(6, w - 6)));
    if (o.cp !== undefined) L.put(x + o.cp, top - 1, 'C');
    en(x, o.en);
    return x + w;
  };
  // くらやみの 道: ランタン と ひかりの はな。穴の まわりを はなで てらす
  S.darkPath = (x, w, o = {}) => {
    const top = o.top ?? 10;
    L.ground(x, x + w - 1, top);
    (o.pits || []).forEach(([dx, n]) => { for (let gx = x + dx; gx < x + dx + n; gx++) for (let y = top; y < 12; y++) L.put(gx, y, ' '); });
    (o.flowers || []).forEach(dx => L.hazard(x + dx, 'lflower', {}));
    if (o.lantern !== undefined) L.hazard(x + o.lantern, 'lantern', {});
    (o.flies || []).forEach(([dx, y]) => L.enemy(x + dx, 'hotarun', { y }));
    if (o.coins) L.row(x + 2, top - 3, 'o'.repeat(Math.min(6, w - 4)));
    if (o.cp !== undefined) L.put(x + o.cp, top - 1, 'C');
    if (o.star) L.put(x + o.star[0], o.star[1], '*');
    (o.deco || []).forEach(([dx, n]) => L.deco(x + dx, n, 1));
    en(x, o.en);
    return x + w;
  };
  // ゴール・ボス部屋の前に「つづきの区間」を足す(下の extendLevel)
  if (L._def && !L._def.secret && !L._def.noExtend) for (const nm of ['goal', 'boss', 'boss2', 'boss3', 'fortBoss']) {
    const f = S[nm];
    S[nm] = (x, ...a) => {
      if (!L._extended) { L._extended = true; const o = a.length && a[a.length - 1] && typeof a[a.length - 1] === 'object' ? a[a.length - 1] : {}; x = extendLevel(S, L, L._def, x, o.top ?? 10); }
      return f(x, ...a);
    };
  }
  return S;
}

const LEVELS = [
  {
    id: 1, name: 'はじまりの草原', theme: 'grass', bgm: 'bgm_1', time: 400,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'sign' });
      x = S.run(x, 12, { coins: 5, en: [[9, 'goomy']], deco: [[2, 'tree']] });
      x = S.blocks(x, '?BeBH', { en: [[6, 'goomy']] });
      L.hint(x - 9, 'たまごブロック', 'したから たたくと…?');
      x = S.gap(x, 3, { coins: 3 });
      x = S.run(x, 14, { en: [[5, 'goomy'], [10, 'goomy']], items: [[2, 'c']], deco: [[12, 'fence']] });
      x = S.spring(x, { star: true });
      x = S.run(x, 10, { cp: 3, en: [[7, 'shell']] });
      x = S.gap(x, 3);
      x = S.run(x, 8, { en: [[5, 'plant']] });
      x = S.gap(x, 4, { plank: 2 });
      x = S.blocks(x, 'BBABB', { en: [[7, 'bee', { y: 6 }]] });
      x = S.run(x, 10, { en: [[6, 'slime']], deco: [[3, 'tree']] });
      x = S.gap(x, 6, { coins: 6, coinY: 4 });
      x = S.tower(x, { star: true, en: [[7, 'goomy']] });
      L.hint(x, 'スピンジャンプ', 'V で くるくる。トゲの てきも ふめる・レンガを 下に こわせる');
      x = S.run(x, 12, { cp: 2, en: [[7, 'goomy', { v: 'para' }], [10, 'goomy']] });
      x = S.gap(x, 4, { plank: 2, coins: 4, coinY: 6 });
      x = S.run(x, 10, { en: [[4, 'spiky']], items: [[7, 'h']] });
      x = S.gap(x, 3, { coins: 3 });
      x = S.run(x, 12, { en: [[4, 'goomy'], [6, 'goomy'], [9, 'bee', { y: 6 }]] });
      x = S.gap(x, 7, { star: true, starY: 3 });
      x = S.run(x, 8, { coins: 4 });
      x = S.run(x, 10, { cp: 3, en: [[6, 'goomy'], [8, 'goomy']] });
      x = S.movers(x, 2);
      L.hint(x, 'ヒップドロップ', 'くうちゅうで ↓。レンガを 上から わる・てきに つよい いちげき', 'くうちゅうで ▼(下へ スワイプ)。レンガを 上から わる');
      x = S.blocks(x, 'B?B?B?B', { en: [[5, 'shell'], [9, 'goomy', { v: 'para' }]], coins: 5 });
      x = S.gap(x, 4, { plank: 2 });
      x = S.tramp(x);
      x = S.run(x, 10, { en: [[3, 'plant'], [7, 'bee', { v: 'circle', y: 6 }]] });
      x = S.fallers(x, 3);
      x = S.goal(x, { deco: 'tree' });
    },
  },
  {
    id: 2, name: 'くもの上の空', theme: 'sky', bgm: 'bgm_2', time: 400,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { top: 9 });
      x = S.run(x, 8, { top: 9, en: [[5, 'goomy']] });
      x = S.gap(x, 4, { plank: 2, cloud: true, plankY: 8 });
      x = S.power(x, 'A', { top: 9 });
      x = S.run(x, 6, { top: 9, en: [[3, 'bee', { y: 5 }]] });
      x = S.movers(x, 2, { top: 9 });
      x = S.run(x, 10, { top: 8, en: [[6, 'goomy', { v: 'para' }]], items: [[3, 'n']] });
      x = S.spring(x, { top: 8, cloud: true, star: true });
      x = S.fallers(x, 4, { top: 9 });
      x = S.run(x, 12, { top: 8, cp: 2, en: [[6, 'bat', { y: 4 }], [9, 'goomy']] });
      x = S.capeBox(x, { top: 8, hint: true });
      x = S.gap(x, 5, { coins: 5, coinY: 4 });
      x = S.run(x, 8, { top: 8, en: [[4, 'ghost', { y: 5 }]] });
      x = S.movers(x, 3, { top: 8, kind: 'lift' });
      x = S.blocks(x, 'B?QB', { top: 8, en: [[6, 'slime']] });
      x = S.gap(x, 7, { star: true, starY: 3, en: [[3, 'bee', { y: 4 }]] });
      x = S.run(x, 10, { top: 7, cp: 2, en: [[6, 'shell']] });
      x = S.tramp(x, { top: 7, cloud: true, star: true });
      x = S.gap(x, 3);
      x = S.run(x, 10, { top: 8, en: [[3, 'bee', { v: 'dive', y: 3 }], [7, 'goomy']] });
      x = S.fallers(x, 3, { top: 9 });
      x = S.run(x, 6, { top: 8, coins: 3 });
      x = S.run(x, 10, { top: 8, cp: 3, en: [[6, 'bat', { y: 4 }]] });
      x = S.bubbles(x, 3, { top: 8 });
      x = S.blocks(x, 'B?B?B', { top: 8, en: [[5, 'goomy', { v: 'para' }], [8, 'goomy']] });
      x = S.movers(x, 3, { top: 8, step: true });
      x = S.run(x, 8, { top: 8, en: [[4, 'bee', { v: 'dive', y: 2 }]] });
      x = S.goal(x, { top: 8 });
    },
  },
  {
    id: 3, name: 'ほらあなのお城', theme: 'cave', bgm: 'bgm_3', time: 450,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.run(x, 10, { en: [[7, 'skeleton']], deco: [[2, 'crystal']] });
      x = S.turn(x, { hint: true, ch: 'S' });
      x = S.blocks(x, 'S?SES', { en: [[7, 'firespirit']] });
      x = S.gap(x, 3, { lava: true });
      x = S.crushers(x, 3, { coins: true });
      x = S.run(x, 8, { en: [[4, 'turret']] });
      x = S.gap(x, 4, { lava: true, plank: 2, fish: true });
      x = S.run(x, 12, { cp: 2, en: [[7, 'skeleton']], items: [[10, 'k', 3]] });
      L.fill(x - 4, x - 1, 7, 7, 'S');
      x = S.shaft(x, { hint: true, ch: 'S', star: true });
      x = S.run(x, 8, { en: [[4, 'bomb']] });
      x = S.firebars(x, 12, 2, { en: [[9, 'spiky']] });
      x = S.door(x, { star: true });
      x = S.run(x, 10, { cp: 2, en: [[6, 'skeleton']] });
      x = S.icicles(x, 12, { ch: 'S' });
      x = S.gap(x, 4, { lava: true, geyser: 3, star: true, starY: 5 });
      x = S.axe(x);
      x = S.run(x, 10, { en: [[3, 'ghost', { y: 6 }], [7, 'bomb']], items: [[5, 'h']] });
      x = S.saws(x, 12);
      x = S.gap(x, 3, { lava: true });
      x = S.run(x, 8, { en: [[5, 'skeleton']] });
      x = S.run(x, 10, { cp: 3, en: [[6, 'skeleton']] });
      x = S.crushers(x, 4, { coins: true });
      x = S.firebars(x, 12, 2, { speed: 2.1 });
      x = S.gap(x, 4, { lava: true, plank: 2, fish: true });
      x = S.tower(x, { ch: 'S', en: [[7, 'bomb']] });
      // 2026-10-18 夜 持ち主「1面の ほしのあなは いらない」→ ひみつの へや(緑の ワープ)と ひみつの ゴールを なくした
      x = S.springLedge(x, { ch: 'S' });
      x = S.goal(x, { ch: 'S' });
    },
  },
  {
    id: 4, name: 'ほのおの山', theme: 'lava', bgm: 'bgm_2', time: 450,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.run(x, 10, { en: [[7, 'beetle']] });
      x = S.gap(x, 4, { lava: true, fish: { jump: 820 } });
      x = S.blocks(x, 'BRB?B', { en: [[7, 'goomy']] });
      x = S.firebars(x, 12, 2);
      x = S.gap(x, 4, { lava: true, plank: 2 });
      x = S.conveyor(x, 12, 1, { en: [[8, 'beetle']], coins: 5 });
      x = S.run(x, 6, { cp: 2 });
      x = S.throwRun(x, { hint: true, en: [[9, 'beetle'], [11, 'goomy'], [13, 'goomy']] });
      x = S.tower(x, { ch: 'M', h: 6, star: true });
      x = S.movers(x, 2, { lava: true });
      x = S.run(x, 10, { en: [[6, 'wizard']] });
      x = S.gap(x, 6, { lava: true, geyser: 4, coins: 6, coinY: 4 });
      x = S.power(x, 'A', { en: [[6, 'firespirit', { v: 'chase' }]] });
      x = S.run(x, 10, { cp: 2, en: [[6, 'orb', { y: 7, r: 1.6 }]] });
      x = S.tramp(x, { star: true });
      x = S.fallers(x, 4, { lava: true });
      x = S.run(x, 8, { en: [[5, 'beetle']], items: [[2, 'u']] });
      x = S.run(x, 4, { items: [[1, '>'], [2, '>']] });
      x = S.gap(x, 8, { lava: true, star: true, starY: 6 });
      x = S.run(x, 10, { en: [[5, 'wizard']] });
      x = S.conveyor(x, 10, -1, { en: [[5, 'firespirit', { v: 'chase' }]] });
      x = S.run(x, 10, { cp: 3, en: [[6, 'wizard']] });
      x = S.movers(x, 3, { lava: true, kind: 'lift' });
      x = S.firebars(x, 14, 3);
      x = S.gap(x, 4, { lava: true, geyser: 4 });
      x = S.conveyor(x, 12, 1, { en: [[6, 'beetle']] });
      x = S.goal(x, { ch: 'M' });
    },
  },
  {
    id: 5, name: 'こおりの森', theme: 'ice', bgm: 'bgm_1', time: 450,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'tree' });
      x = S.run(x, 10, { en: [[7, 'slime']], fill: 'I' });
      x = S.gap(x, 3);
      x = S.icicles(x, 14, { en: [[10, 'beetle']] });
      x = S.blocks(x, 'BEB?B', { en: [[7, 'goomy', { v: 'para' }]] });
      x = S.run(x, 12, { fill: 'I', en: [[5, 'slime'], [9, 'slime']], coins: 4 });
      x = S.tower(x, { ch: 'I', star: true });
      x = S.run(x, 6, { cp: 2 });
      x = S.well(x, { hint: true });
      x = S.gap(x, 4, { plank: 2 });
      x = S.run(x, 10, { en: [[4, 'eye', { y: 5 }], [8, 'bee', { v: 'circle', y: 5 }]] });
      x = S.shaft(x, { ch: 'I', hint: true, star: true });
      x = S.run(x, 8, { en: [[5, 'beetle']], items: [[2, 'h']] });
      x = S.fallers(x, 4);
      x = S.run(x, 10, { cp: 2, en: [[6, 'slime', { v: 'big' }]] });
      x = S.icicles(x, 12);
      x = S.gap(x, 6, { coins: 6, coinY: 4 });
      x = S.power(x, 'A', { en: [[6, 'bat', { y: 4 }]] });
      x = S.run(x, 10, { fill: 'I', en: [[5, 'eye', { y: 5 }]] });
      x = S.gap(x, 9, { star: true, starY: 4, en: [[4, 'bee', { v: 'dive', y: 2 }]] });
      x = S.run(x, 10, { en: [[4, 'slime'], [7, 'slime']] });
      x = S.run(x, 10, { cp: 3, fill: 'I', en: [[6, 'slime', { v: 'big' }]] });
      x = S.icicles(x, 14, { en: [[8, 'beetle']] });
      x = S.movers(x, 2);
      x = S.tower(x, { ch: 'I', en: [[7, 'eye', { y: 3 }]] });
      x = S.fallers(x, 3);
      x = S.goal(x, { deco: 'crystal' });
    },
  },
  {
    id: 6, name: 'みずの神殿', theme: 'ruins', bgm: 'bgm_2', time: 480, secretGoal: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { top: 6, deco: 'pillar' });
      x = S.run(x, 8, { top: 6, en: [[5, 'plant']] });
      x = S.water(x, 18, { fish: [6, 12], star: 15 });
      x = S.run(x, 10, { top: 6, en: [[5, 'skeleton']], items: [[8, 'c']] });
      x = S.power(x, 'R', { top: 6 });
      x = S.run(x, 8, { top: 6, cp: 2, en: [[6, 'orb', { y: 3, r: 1.5 }]] });
      x = S.water(x, 22, { fish: [5, 15], pillars: [7, 15] });
      x = S.run(x, 10, { top: 6, en: [[4, 'plant', { v: 'spit' }], [8, 'skeleton']] });
      x = S.movers(x, 2, { top: 6, kind: 'lift' });
      x = S.run(x, 10, { top: 6, cp: 2, en: [[6, 'wizard']] });
      x = S.tower(x, { top: 6, ch: 'S', h: 4, star: true });
      const wx = x;
      x = S.water(x, 16, { fish: [8] });
      x = S.run(x, 8, { top: 6, en: [[4, 'beetle']] });
      x = S.firebars(x, 10, 1, { top: 6 });
      x = S.water(x, 14, { fish: [4, 10], star: 7 });
      x = S.run(x, 10, { top: 6, en: [[5, 'plant', { v: 'spit' }]], items: [[2, 'h']] });
      x = S.run(x, 10, { top: 6, cp: 3, en: [[6, 'skeleton']] });
      x = S.water(x, 18, { fish: [5, 11], pillars: [9] });
      x = S.run(x, 8, { top: 6, en: [[4, 'wizard']] });
      x = S.firebars(x, 12, 2, { top: 6 });
      x = S.goal(x, { top: 6, ch: 'S' });
      // ひみつ: 池の 底(いちばん右の 下)の 紫の ワープ
      const room = x + 2;
      x = S.secretRoom(room, { top: 6 });
      L.portal(wx + 13, 10, room + 3, 5, { hue: 270, hidden: true });
    },
  },
  {
    id: 7, name: 'よぞらの塔', theme: 'night', bgm: 'bgm_3', time: 480,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { top: 9 });
      x = S.run(x, 6, { top: 9 });
      x = S.gap(x, 4, { plank: 2, cloud: true, plankY: 7 });
      x = S.run(x, 8, { top: 8, en: [[5, 'eye', { y: 4 }]] });
      x = S.fallers(x, 4, { top: 9 });
      x = S.power(x, 'A', { top: 8 });
      x = S.run(x, 8, { top: 8, cp: 2, en: [[5, 'wizard']] });
      x = S.movers(x, 3, { top: 8, step: true, en: [[5, 'bat', { y: 3 }]] });
      x = S.run(x, 8, { top: 7, en: [[5, 'goomy', { v: 'para' }]] });
      x = S.tramp(x, { top: 7, cloud: true, star: true });
      x = S.gap(x, 4, { coins: 4, coinY: 3, plank: 2, cloud: true, plankY: 7, en: [[2, 'eye', { y: 2 }]] });
      x = S.run(x, 10, { top: 8, cp: 2, en: [[6, 'slime', { v: 'big' }]] });
      x = S.bubbles(x, 3, { top: 8, star: true });
      x = S.run(x, 10, { top: 8, en: [[4, 'wizard'], [8, 'bee', { v: 'dive', y: 3 }]] });
      x = S.movers(x, 2, { top: 8, kind: 'lift' });
      x = S.blocks(x, 'BEB', { top: 8 });
      x = S.gap(x, 9, { star: true, starY: 3, en: [[5, 'bat', { y: 3 }]] });
      x = S.run(x, 10, { top: 7, en: [[5, 'orb', { y: 4, r: 1.5 }]] });
      x = S.fallers(x, 3, { top: 9 });
      x = S.run(x, 10, { top: 8, cp: 3, en: [[6, 'wizard']] });
      x = S.bubbles(x, 4, { top: 8, en: [[8, 'bat', { y: 3 }]] });
      x = S.run(x, 8, { top: 8, en: [[4, 'eye', { y: 4 }]] });
      x = S.movers(x, 3, { top: 8, kind: 'lift' });
      x = S.goal(x, { top: 8 });
    },
  },
  {
    id: 8, world: 2, num: 5, boss: true, name: 'まおうの城', theme: 'castle', bgm: 'bgm_3', time: 600,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.run(x, 10, { en: [[6, 'skeleton']] });
      x = S.firebars(x, 12, 2);
      x = S.gap(x, 4, { lava: true, fish: true });
      x = S.power(x, 'R', { en: [[6, 'beetle']] });
      x = S.crushers(x, 4, { coins: true });
      x = S.run(x, 8, { cp: 2, en: [[6, 'wizard']] });
      x = S.shaft(x, { ch: 'M', star: true });
      x = S.axe(x);
      x = S.gap(x, 5, { lava: true, plank: 2 });
      x = S.run(x, 10, { en: [[4, 'skeleton'], [8, 'bomb']], items: [[2, 'h']] });
      x = S.zappers(x, 3);
      x = S.run(x, 8, { cp: 2 });
      x = S.movers(x, 3, { lava: true, en: [[6, 'fish']] });
      x = S.power(x, 'A');
      x = S.saws(x, 12);
      x = S.tower(x, { ch: 'M', h: 6, star: true });
      x = S.firebars(x, 12, 2, { speed: 2.2 });
      x = S.crushers(x, 3);
      x = S.zappers(x, 3);
      x = S.run(x, 10, { cp: 4, en: [[7, 'skeleton']] });
      x = S.boss(x, 8, { star: true });
    },
  },
  {
    id: 9, name: 'さばくの遺跡', theme: 'sand', bgm: 'bgm_1', time: 480,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'pillar' });
      x = S.run(x, 10, { en: [[6, 'goomy', { v: 'para' }]], items: [[8, 'c']] });
      x = S.run(x, 6);
      L.fill(x - 3, x - 3, 8, 9, 'K');
      x = S.updraft(x, { star: true, en: [[11, 'beetle']] });
      x = S.blocks(x, 'DED?D', { en: [[7, 'skeleton']] });
      x = S.gap(x, 4, { plank: 2 });
      x = S.run(x, 8, { cp: 2, en: [[6, 'firespirit', { v: 'chase' }]] });
      x = S.shaft(x, { ch: 'D', hint: true });
      x = S.run(x, 10, { en: [[4, 'beetle'], [8, 'bee', { v: 'dive', y: 4 }]] });
      x = S.fallers(x, 4);
      x = S.power(x, 'A', { en: [[6, 'skeleton']] });
      x = S.updraft(x, { en: [[11, 'goomy', { v: 'para' }]] });
      x = S.run(x, 8, { cp: 2, items: [[4, 'J']] });
      x = S.gap(x, 9, { star: true, starY: 4, coins: 9, coinY: 6 });
      x = S.run(x, 10, { en: [[5, 'firespirit', { v: 'chase' }], [8, 'beetle']] });
      x = S.tower(x, { ch: 'D', h: 6, star: true });
      x = S.run(x, 10, { en: [[6, 'skeleton']] });
      x = S.run(x, 10, { cp: 3, en: [[6, 'firespirit', { v: 'chase' }]] });
      x = S.updraft(x, { en: [[11, 'skeleton']] });
      x = S.saws(x, 12, { coins: true });
      x = S.fallers(x, 4);
      x = S.blocks(x, 'D?D?D', { en: [[6, 'beetle']] });
      x = S.goal(x, { ch: 'D', deco: 'pillar' });
    },
  },
  {
    id: 10, name: 'からくり工場', theme: 'factory', bgm: 'bgm_2', time: 480, secretGoal: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x);
      x = S.conveyor(x, 12, 1, { en: [[8, 'orb', { v: 'line', y: 7, r: 2 }]] });
      x = S.zappers(x, 3);
      x = S.blocks(x, 'MRM?M', { en: [[7, 'turret', { v: 'aim' }]] });
      x = S.gap(x, 5, { lava: true, plank: 2 });
      x = S.crushers(x, 3, { coins: true });
      x = S.run(x, 8, { cp: 2, en: [[6, 'bomb']] });
      x = S.shaft(x, { ch: 'M', star: true });
      x = S.saws(x, 12, { coins: true });
      x = S.movers(x, 3, { lava: true, kind: 'lift' });
      x = S.conveyor(x, 12, -1, { en: [[6, 'beetle']] });
      x = S.run(x, 8, { cp: 2, en: [[6, 'turret', { v: 'aim' }]] });
      x = S.power(x, 'E');
      x = S.zappers(x, 4);
      x = S.firebars(x, 14, 3);
      x = S.gap(x, 8, { lava: true, star: true, starY: 6, coins: 8, coinY: 7 });
      x = S.run(x, 10, { en: [[4, 'bomb'], [7, 'orb', { v: 'line', y: 7, r: 2 }]], items: [[9, 'u']] });
      x = S.tower(x, { ch: 'M', h: 6, star: true });
      x = S.run(x, 10, { cp: 3, en: [[6, 'bomb']] });
      x = S.crushers(x, 4);
      x = S.conveyor(x, 14, 1, { en: [[5, 'turret', { v: 'aim' }], [10, 'beetle']] });
      x = S.saws(x, 12);
      const sec = {};
      x = S.springLedge(x, { ch: 'M', sec, en: [[10, 'bomb']] });
      x = S.goal(x, { ch: 'M' });
      const room = x + 2;
      x = S.secretRoom(room);
      L.portal(sec.at[0], sec.at[1], room + 3, 9, { hue: 270, hidden: true });
    },
  },
  {
    id: 11, name: 'そらの島', theme: 'sky', bgm: 'bgm_3', time: 480,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { top: 8 });
      x = S.balloon(x, { top: 8 });
      x = S.run(x, 8, { top: 8, en: [[5, 'bee', { v: 'circle', y: 4 }]] });
      x = S.bubbles(x, 3, { top: 8 });
      x = S.power(x, 'A', { top: 8 });
      x = S.run(x, 8, { top: 8, cp: 2, en: [[6, 'eye', { y: 4 }]] });
      x = S.updraftGap(x, 10, { star: true });
      x = S.run(x, 10, { top: 7, en: [[5, 'wizard']] });
      x = S.balloon(x, { top: 7, star: true });
      x = S.run(x, 8, { top: 7, items: [[4, 'J']], en: [[6, 'bat', { y: 3 }]] });
      x = S.gap(x, 4, { coins: 4, coinY: 4, plank: 2, cloud: true, plankY: 7, en: [[2, 'eye', { y: 3 }]] });
      x = S.run(x, 10, { top: 8, cp: 2, en: [[5, 'slime', { v: 'big' }]] });
      x = S.bubbles(x, 4, { top: 8, en: [[8, 'bee', { v: 'dive', y: 2 }]] });
      x = S.run(x, 8, { top: 8, en: [[5, 'goomy', { v: 'para' }]] });
      x = S.tramp(x, { top: 8, cloud: true, star: true });
      x = S.fallers(x, 4, { top: 9 });
      x = S.run(x, 8, { top: 8 });
      x = S.run(x, 10, { top: 8, cp: 3, en: [[6, 'wizard']] });
      x = S.balloon(x, { top: 8 });
      x = S.run(x, 8, { top: 8, en: [[4, 'bee', { v: 'circle', y: 4 }]] });
      x = S.bubbles(x, 3, { top: 8 });
      x = S.movers(x, 3, { top: 8, step: true });
      x = S.goal(x, { top: 8 });
    },
  },
  {
    id: 12, world: 3, num: 5, boss: true, name: 'やみの塔', theme: 'castle', bgm: 'bgm_3', time: 720,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.run(x, 10, { en: [[5, 'skeleton'], [8, 'slime', { v: 'big' }]] });
      x = S.firebars(x, 12, 3);
      x = S.gap(x, 5, { lava: true, fish: true, plank: 2 });
      x = S.power(x, 'R');
      x = S.shaft(x, { ch: 'M', hint: true });
      x = S.run(x, 8, { cp: 2, en: [[5, 'wizard']] });
      x = S.zappers(x, 3);
      x = S.crushers(x, 4);
      x = S.movers(x, 3, { lava: true, step: true });
      x = S.power(x, 'A', { en: [[6, 'beetle']] });
      x = S.run(x, 8, { cp: 2, en: [[6, 'turret', { v: 'aim' }]] });
      x = S.tower(x, { ch: 'M', h: 6, star: true });
      x = S.axe(x);
      x = S.gap(x, 8, { lava: true, geyser: 4, star: true, starY: 4 });
      x = S.saws(x, 12);
      x = S.crushers(x, 3);
      x = S.zappers(x, 4);
      x = S.firebars(x, 12, 2, { speed: 2.3 });
      x = S.run(x, 10, { cp: 3, en: [[6, 'skeleton']], items: [[8, 'h']] });
      x = S.power(x, 'E');
      x = S.boss(x, 10, { star: true });
    },
  },
  // ===================== ワールド4 あらしの こうげん(風・スイッチ・ワープ) =====================
  {
    id: 13, world: 4, num: 1, name: 'あらしの丘', theme: 'storm', bgm: 'bgm_1', time: 500,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'sign' });
      x = S.run(x, 10, { en: [[7, 'goomy']], deco: [[3, 'tree']] });
      L.hint(x, 'おいかぜ', 'かぜに のると はやく とおくへ とべる');
      x = S.windRun(x, 14, 1, { coins: 6, en: [[10, 'goomy']] });
      x = S.windGap(x, 5);
      x = S.run(x, 8, { cp: 2, en: [[6, 'bee', { y: 6 }]] });
      x = S.windRun(x, 14, -1, { v: 120, coins: 5, en: [[8, 'slime']] });
      x = S.blocks(x, 'B?BAB', { en: [[7, 'goomy', { v: 'para' }]] });
      x = S.windHead(x, 3, { hint: true });
      x = S.run(x, 10, { cp: 3, en: [[6, 'beetle']], deco: [[8, 'tree']] });
      x = S.windGap(x, 7, { star: true, starY: 3 });
      x = S.spring(x, { star: true });
      x = S.windRun(x, 12, 1, { on: 2.5, off: 2, en: [[6, 'goomy'], [9, 'goomy']] });
      x = S.gap(x, 3);
      x = S.run(x, 10, { cp: 3, en: [[5, 'bat', { y: 4 }]], items: [[2, 'h']] });
      x = S.fallers(x, 3);
      x = S.run(x, 4);
      x = S.windHead(x, 3, { phase: 1.1 });
      x = S.tower(x, { star: true, en: [[7, 'goomy']] });
      x = S.run(x, 10, { cp: 3, en: [[6, 'skeleton']] });
      x = S.windGap(x, 6);
      x = S.movers(x, 2);
      x = S.windRun(x, 14, -1, { v: 130, on: 2, off: 2, en: [[7, 'beetle']] });
      x = S.blocks(x, 'B?B?B', { en: [[6, 'goomy']] });
      x = S.windGap(x, 6);
      x = S.goal(x, { deco: 'tree' });
    },
  },
  {
    id: 14, world: 4, num: 2, name: 'からくり屋敷', theme: 'mansion', bgm: 'bgm_2', time: 520,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'lamp' });
      x = S.run(x, 10, { en: [[6, 'goomy']], deco: [[3, 'lamp']] });
      x = S.swGate(x, { hint: true });
      x = S.run(x, 8, { cp: 2, en: [[6, 'skeleton']] });
      x = S.swBridge(x);
      x = S.blocks(x, 'B?BAB', { en: [[7, 'bomb']] });
      x = S.run(x, 10, { en: [[6, 'ghost', { y: 6 }]], deco: [[2, 'lamp']] });
      x = S.swStairs(x, { star: true });
      x = S.run(x, 10, { cp: 3, en: [[6, 'bomb']] });
      x = S.firebars(x, 12, 2);
      x = S.swBridge(x, { star: true });
      x = S.run(x, 8, { en: [[5, 'skeleton']], items: [[2, 'h']] });
      x = S.swGate(x, { en: [[5, 'goomy']] });
      x = S.run(x, 10, { cp: 3, en: [[6, 'wizard']] });
      x = S.crushers(x, 3, { coins: true });
      x = S.swBridge(x);
      x = S.run(x, 10, { cp: 4, en: [[5, 'ghost', { y: 5 }], [8, 'skeleton']], deco: [[3, 'lamp']] });
      x = S.movers(x, 2);
      x = S.tower(x, { ch: 'S', h: 6, star: true });
      x = S.swGate(x, { en: [[11, 'bomb']] });
      x = S.run(x, 8, { coins: 4 });
      x = S.goal(x, { ch: 'S', deco: 'lamp' });
    },
  },
  {
    id: 15, world: 4, num: 3, name: 'ワープの洞窟', theme: 'crystal', bgm: 'bgm_3', time: 520, secretGoal: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'crystal' });
      x = S.run(x, 10, { en: [[6, 'bat', { y: 6 }]], deco: [[3, 'crystal']] });
      x = S.warpWall(x, { hint: true });
      x = S.run(x, 8, { cp: 2, en: [[6, 'skeleton']] });
      x = S.warpUp(x, { star: true, en: [[11, 'goomy']] });
      x = S.blocks(x, 'S?SAS', { en: [[7, 'firespirit']] });
      x = S.gap(x, 4, { plank: 2 });
      x = S.run(x, 10, { en: [[5, 'eye', { y: 5 }]], deco: [[7, 'crystal']] });
      x = S.run(x, 6, { cp: 2 });
      x = S.warpMaze(x, { order: [0, 1, 0], star: true });
      x = S.run(x, 10, { cp: 3, en: [[6, 'skeleton']] });
      x = S.icicles(x, 12, { ch: 'S' });
      x = S.windGap(x, 5);
      x = S.run(x, 8, { en: [[5, 'bat', { y: 5 }]] });
      // ひみつの塔: 宙に浮いた柱の てっぺんの ワープ(柱と となりの柱の間を かべジャンプで のぼる。下は くぐって通れる)
      const sx = x;
      x = S.run(x, 12, { en: [[9, 'skeleton']] });
      L.fill(sx + 4, sx + 5, 4, 7, 'S'); L.fill(sx + 8, sx + 8, 2, 7, 'S');
      x = S.swBridge(x);
      x = S.warpUp(x, { hue: 90 });
      x = S.run(x, 10, { cp: 4, en: [[6, 'bat', { y: 4 }]] });
      x = S.warpWall(x, { en: [[13, 'goomy']] });
      x = S.tower(x, { ch: 'S', h: 6, star: true });
      x = S.goal(x, { ch: 'S', deco: 'crystal' });
      const room = x + 2;
      x = S.secretRoom(room);
      L.portal(sx + 4, 3, room + 3, 9, { hue: 270, hidden: true });
    },
  },
  {
    id: 16, world: 4, num: 4, name: 'かみなり雲の道', theme: 'storm', bgm: 'bgm_2', time: 540,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { top: 9 });
      x = S.run(x, 8, { top: 9, en: [[5, 'bee', { y: 5 }]] });
      x = S.windGap(x, 5, { top: 9 });
      x = S.bubbles(x, 3, { top: 9 });
      x = S.swBridge(x, { top: 9 });
      x = S.run(x, 10, { top: 9, cp: 2, en: [[6, 'bat', { y: 4 }]] });
      x = S.windHead(x, 3, { top: 9 });
      x = S.power(x, 'A', { top: 9 });
      x = S.warpUp(x, { top: 9, star: true });
      x = S.run(x, 8, { top: 9, en: [[5, 'eye', { y: 4 }]] });
      x = S.movers(x, 3, { top: 9, kind: 'lift' });
      x = S.windRun(x, 12, 1, { top: 9, on: 2.4, off: 2, en: [[7, 'goomy', { v: 'para' }]] });
      x = S.run(x, 10, { top: 9, cp: 3, en: [[6, 'slime', { v: 'big' }]] });
      x = S.swGate(x, { top: 9 });
      x = S.run(x, 5, { top: 9 }); // 2026-10-18 夜: 関所の 高い かべで かべジャンプして 落ちる床の 穴を とびこえられた → 間を あける
      x = S.fallers(x, 4, { top: 9 });
      x = S.run(x, 4, { top: 9 });
      x = S.windGap(x, 7, { top: 9, star: true, starY: 2 });
      x = S.run(x, 10, { top: 9, cp: 4, en: [[6, 'wizard']] });
      x = S.swStairs(x, { top: 9, star: true });
      x = S.balloon(x, { top: 9 });
      x = S.run(x, 8, { top: 9, en: [[4, 'bee', { v: 'dive', y: 3 }]] });
      x = S.windHead(x, 3, { top: 9, phase: 2 });
      x = S.goal(x, { top: 9 });
    },
  },
  {
    id: 17, world: 4, num: 5, name: 'あらしの城', theme: 'stormcastle', bgm: 'bgm_3', time: 720, boss: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.run(x, 10, { en: [[6, 'skeleton']] });
      x = S.windHead(x, 3, { lava: true });
      x = S.swGate(x, { en: [[11, 'skeleton']] });
      x = S.crushers(x, 3);
      x = S.run(x, 8, { cp: 2, en: [[6, 'wizard']] });
      x = S.warpUp(x, { star: true });
      x = S.firebars(x, 12, 2);
      x = S.swBridge(x, { lava: true });
      x = S.power(x, 'A');
      x = S.windGap(x, 6);
      x = S.run(x, 8, { cp: 3, en: [[5, 'skeleton']], items: [[2, 'h']] });
      x = S.swStairs(x, { star: true });
      x = S.zappers(x, 3);
      x = S.run(x, 8, { cp: 4 });
      x = S.boss2(x, 'kabuto', 6, { star: true });
    },
  },
  {
    id: 18, world: 4, num: '✦', name: 'かぜの ひみつ島', theme: 'sky', bgm: 'bgm_1', time: 400, secret: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { top: 8 });
      x = S.power(x, 'A', { top: 8 });
      x = S.windGap(x, 8, { top: 8, star: true, starY: 2 });
      x = S.run(x, 8, { top: 8, items: [[3, 'u'], [5, 'c']] });
      x = S.windRun(x, 14, 1, { top: 8, coins: 10 });
      x = S.updraftGap(x, 10, { star: true });
      x = S.run(x, 6, { top: 8, cp: 2 });
      x = S.warpUp(x, { top: 8, star: true });
      x = S.windGap(x, 6, { top: 8 });
      x = S.blocks(x, '?????', { top: 8, coins: 5 });
      x = S.goal(x, { top: 8 });
    },
  },
  // ===================== ワールド5 ゆうやけと おばけの くに(ころがる いわ・きえるブロック・じかんスイッチ) =====================
  {
    id: 19, world: 5, num: 1, name: 'ゆうやけの谷', theme: 'dusk', bgm: 'bgm_1', time: 520,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'rocks' });
      x = S.run(x, 10, { en: [[7, 'goomy']], deco: [[3, 'pillar']] });
      x = S.rocks(x, 14, { hint: true });
      x = S.gap(x, 3);
      x = S.run(x, 8, { cp: 2, en: [[6, 'beetle']] });
      x = S.rocks(x, 16, { every: 2.6, coins: 6 });
      x = S.blocks(x, 'D?DAD', { en: [[7, 'skeleton']] });
      x = S.updraft(x, { star: true });
      x = S.run(x, 10, { cp: 3, en: [[6, 'firespirit', { v: 'chase' }]] });
      x = S.rocks(x, 14, { speed: 220 });
      x = S.fallers(x, 3);
      x = S.run(x, 4);
      x = S.tower(x, { ch: 'D', star: true });
      x = S.run(x, 10, { cp: 4, en: [[6, 'beetle']] });
      x = S.rocks(x, 18, { every: 2.2, en: [[6, 'goomy']] });
      x = S.gap(x, 4, { plank: 2 });
      x = S.run(x, 8, { en: [[5, 'bee', { y: 6 }]] });
      x = S.gap(x, 7, { star: true, starY: 3 });
      x = S.run(x, 8, { coins: 4 });
      x = S.rocks(x, 12, { every: 2.8 });
      x = S.run(x, 10, { en: [[6, 'skeleton']], items: [[2, 'h']] });
      x = S.blink(x, 'S33S', { hint: true });
      x = S.timer(x, 14, { dur: 6, hint: true });
      x = S.run(x, 8, { en: [[5, 'beetle']] });
      x = S.rocks(x, 14, { every: 2.4, speed: 210 });
      x = S.movers(x, 2);
      x = S.goal(x, { ch: 'D', deco: 'pillar' });
    },
  },
  {
    id: 20, world: 5, num: 2, name: 'おばけの森', theme: 'ghost', bgm: 'bgm_3', time: 540, secretGoal: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'tree' });
      x = S.run(x, 10, { en: [[6, 'ghost', { y: 6 }]], deco: [[3, 'tree']] });
      x = S.blink(x, 'S333S', { hint: true });
      x = S.run(x, 8, { cp: 2, en: [[6, 'slime']] });
      x = S.blink(x, 'S33S44S33S');
      x = S.power(x, 'A');
      x = S.run(x, 10, { en: [[5, 'eye', { y: 5 }]], deco: [[8, 'tree']] });
      x = S.blinkTower(x, { star: true });
      x = S.run(x, 8, { cp: 3, en: [[6, 'ghost', { y: 5 }]] });
      x = S.blink(x, 'S333S444S', { star: true, starY: 5 });
      x = S.rocks(x, 12);
      // ひみつ: 木の上の 高いところの ワープ
      const sx = x;
      x = S.run(x, 12, { cp: 4, en: [[8, 'bat', { y: 4 }]], deco: [[2, 'tree']] });
      L.fill(sx + 6, sx + 7, 6, 6, '4'); L.fill(sx + 9, sx + 10, 4, 4, '3');
      x = S.blink(x, 'S44S33S44S');
      x = S.tower(x, { ch: 'S', h: 6, star: true });
      x = S.run(x, 8, { en: [[5, 'ghost', { y: 6 }]] });
      x = S.rocks(x, 14, { coins: 5 });
      x = S.run(x, 10, { en: [[4, 'eye', { y: 5 }], [8, 'slime']] });
      x = S.blink(x, 'S333S444S333S');
      x = S.fallers(x, 3);
      x = S.run(x, 8, { en: [[5, 'ghost', { y: 6 }]], deco: [[3, 'tree']] });
      x = S.goal(x, { deco: 'tree' });
      const room = x + 2;
      x = S.secretRoom(room);
      L.portal(sx + 10, 3, room + 3, 9, { hue: 270, hidden: true });
    },
  },
  {
    id: 21, world: 5, num: 3, kind: 'fort', name: 'いわの とりで', theme: 'fort', bgm: 'bgm_2', time: 540,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.run(x, 10, { en: [[6, 'skeleton']] });
      x = S.timer(x, 14, { hint: true, dur: 6 });
      x = S.run(x, 8, { cp: 2, en: [[6, 'bomb']] });
      x = S.rocks(x, 14);
      x = S.timerCage(x, { star: true });
      x = S.timer(x, 16, { gap: 2, dur: 6 });
      x = S.run(x, 10, { cp: 3, en: [[6, 'wizard']] });
      x = S.power(x, 'A');
      x = S.firebars(x, 12, 2);
      x = S.timer(x, 16, { gap: 3, dur: 7, en: [[11, 'goomy']] });
      x = S.tower(x, { ch: 'S', star: true });
      x = S.run(x, 10, { cp: 4, en: [[6, 'skeleton']] });
      x = S.rocks(x, 16, { every: 2.4 });
      x = S.timer(x, 18, { gap: 2, dur: 6, coins: 4 });
      x = S.gap(x, 6, { star: true, starY: 4 });
      x = S.run(x, 6);
      x = S.swGate(x, { en: [[11, 'skeleton']] });
      x = S.crushers(x, 3, { coins: true });
      x = S.blinkTower(x);
      x = S.timer(x, 16, { gap: 2, dur: 5 });
      x = S.fortBoss(x, 5);
    },
  },
  {
    id: 22, world: 5, num: 4, kind: 'ghost', name: 'おばけ屋敷', theme: 'ghostmansion', bgm: 'bgm_3', time: 560,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'lamp' });
      x = S.run(x, 10, { en: [[6, 'ghost', { y: 6 }]] });
      x = S.blink(x, 'S333S');
      x = S.swGate(x);
      x = S.run(x, 8, { cp: 2, en: [[6, 'skeleton']] });
      x = S.timer(x, 14, { dur: 6 });
      x = S.warpUp(x, { star: true });
      x = S.rocks(x, 14);
      x = S.power(x, 'A');
      x = S.blinkTower(x, { star: true });
      x = S.run(x, 10, { cp: 3, en: [[4, 'ghost', { y: 5 }], [8, 'wizard']] });
      x = S.swBridge(x);
      x = S.timerCage(x, { star: true });
      x = S.run(x, 10, { cp: 4, en: [[6, 'skeleton']], deco: [[3, 'lamp']] });
      x = S.blink(x, 'S44S33S');
      x = S.crushers(x, 3);
      x = S.windHead(x, 3);
      x = S.warpWall(x, { en: [[13, 'skeleton']] });
      x = S.run(x, 10, { en: [[5, 'ghost', { y: 5 }]], items: [[2, 'h']] });
      x = S.rocks(x, 14);
      x = S.goal(x, { ch: 'S', deco: 'lamp' });
    },
  },
  {
    id: 23, world: 5, num: 5, name: 'ゆうれい王の やかた', theme: 'ghostmansion', bgm: 'bgm_3', time: 720, boss: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.run(x, 10, { en: [[6, 'ghost', { y: 6 }]] });
      x = S.blink(x, 'S333S444S');
      x = S.timer(x, 14, { dur: 6 });
      x = S.run(x, 8, { cp: 2, en: [[6, 'skeleton']] });
      x = S.swBridge(x);
      x = S.warpUp(x, { star: true });
      x = S.run(x, 8, { cp: 3, items: [[2, 'h']] });
      x = S.rocks(x, 12);
      x = S.power(x, 'A');
      x = S.blinkTower(x, { star: true });
      x = S.timer(x, 16, { gap: 2, dur: 6 });
      x = S.crushers(x, 3);
      x = S.run(x, 6, { cp: 4 });
      x = S.boss2(x, 'yurei', 6, { star: true });
    },
  },
  {
    id: 24, world: 5, num: '✦', name: 'ゆうやけ ひみつの いわば', theme: 'dusk', bgm: 'bgm_1', time: 400, secret: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x);
      x = S.power(x, 'A');
      x = S.run(x, 8, { items: [[3, 'u'], [5, 'c']] });
      x = S.blink(x, 'S3333S4444S', { star: true, starY: 5 });
      x = S.rocks(x, 14, { coins: 8 });
      x = S.timerCage(x, { star: true });
      x = S.run(x, 6, { cp: 2 });
      x = S.blinkTower(x, { star: true });
      x = S.blocks(x, '?????', { coins: 5 });
      x = S.goal(x, { ch: 'D' });
    },
  },
  // ===================== ワールド6 ジャングルと たきの くに(まめの つる・ジップライン・はねる ブロック) =====================
  {
    id: 25, world: 6, num: 1, name: 'ジャングルの いりぐち', theme: 'jungle', bgm: 'bgm_1', time: 520,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'tree' });
      x = S.run(x, 10, { en: [[7, 'goomy']], deco: [[3, 'tree']] });
      x = S.seed(x, { hint: true, star: true });
      x = S.run(x, 8, { cp: 2, en: [[6, 'plant']] });
      x = S.gap(x, 3);
      x = S.notes(x, '7 7 7', { hint: true });
      x = S.run(x, 10, { en: [[6, 'bee', { y: 6 }]], deco: [[2, 'tree']] });
      x = S.blocks(x, 'B?BAB', { en: [[7, 'goomy']] });
      x = S.zip(x, 18, { hint: true });
      x = S.run(x, 10, { cp: 3, en: [[6, 'slime']] });
      x = S.seedWall(x);
      x = S.run(x, 8, { en: [[5, 'goomy', { v: 'para' }]] });
      x = S.notes(x, '77 77 77', { star: true });
      x = S.run(x, 10, { cp: 4, en: [[6, 'plant', { v: 'spit' }]], items: [[2, 'h']] });
      x = S.zip(x, 20, { star: true });
      x = S.movers(x, 2);
      x = S.run(x, 8, { en: [[4, 'bee', { v: 'circle', y: 6 }]] });
      x = S.run(x, 10, { en: [[6, 'spiky']] });
      x = S.seed(x);
      x = S.tower(x, { en: [[7, 'goomy']] });
      x = S.fallers(x, 3);
      x = S.run(x, 4);
      x = S.goal(x, { deco: 'tree' });
    },
  },
  {
    id: 26, world: 6, num: 2, name: 'はねる キノコの もり', theme: 'jungle', bgm: 'bgm_2', time: 540,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'tree' });
      x = S.run(x, 8, { en: [[5, 'slime']] });
      x = S.notes(x, '7 7 7 7');
      x = S.run(x, 8, { cp: 2, en: [[6, 'goomy']] });
      L.hint(x, 'たかく はねよう', 'ジャンプを おしたまま のると 高く はねる');
      x = S.noteCliff(x, { star: true });
      x = S.notes(x, '77  7  77', { en: [[4, 'bee', { y: 5 }]] });
      x = S.blocks(x, 'B?BAB', { en: [[7, 'spiky']] });
      x = S.run(x, 10, { cp: 3, en: [[6, 'plant']], deco: [[2, 'tree']] });
      x = S.seed(x);
      x = S.notes(x, '7  7  7', { star: true });
      x = S.run(x, 10, { en: [[4, 'goomy', { v: 'para' }], [8, 'goomy']] });
      x = S.tower(x, { star: true, en: [[7, 'slime']] });
      x = S.run(x, 10, { cp: 4, en: [[6, 'bee', { v: 'dive', y: 3 }]], items: [[2, 'h']] });
      x = S.zip(x, 16);
      x = S.noteCliff(x, { en: [[13, 'goomy']] });
      x = S.notes(x, '7 77 7');
      x = S.run(x, 8, { en: [[5, 'spiky']] });
      x = S.zip(x, 18, { en: [[17, 'goomy']] });
      x = S.run(x, 8, { en: [[5, 'plant']] });
      x = S.bubbles(x, 3);
      x = S.run(x, 6, { coins: 4 });
      x = S.goal(x, { deco: 'tree' });
    },
  },
  {
    id: 27, world: 6, num: 3, name: 'たきの ジップライン', theme: 'falls', bgm: 'bgm_3', time: 560, secretGoal: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'tree' });
      x = S.run(x, 8, { en: [[6, 'goomy']] });
      x = S.zip(x, 16, { hint: true });
      x = S.run(x, 8, { cp: 2, en: [[5, 'slime']] });
      x = S.zip(x, 22, { star: true, en: [[2, 'bee', { y: 4 }]] });
      x = S.gap(x, 4, { plank: 2 });
      x = S.seed(x, { en: [[12, 'goomy']] });
      x = S.run(x, 8, { cp: 3, en: [[6, 'plant']] });
      x = S.notes(x, '7 7 7 7 7', { en: [[5, 'bee', { y: 6 }]] });
      x = S.power(x, 'A');
      x = S.zip(x, 20, { en: [[17, 'spiky']] });
      x = S.run(x, 8, { en: [[5, 'goomy', { v: 'para' }]] });
      // ひみつ: たねブロックの つるの 上に うかぶ 紫の ワープ
      const sx = x;
      x = S.run(x, 12, { cp: 4, en: [[9, 'slime']] });
      L.put(sx + 5, 7, 'N');
      x = S.noteCliff(x, { star: true });
      x = S.zip(x, 18);
      x = S.notes(x, '7 7 7');
      x = S.run(x, 6, { en: [[4, 'goomy']] });
      x = S.tower(x, { star: true });
      x = S.run(x, 6, { coins: 3 });
      x = S.goal(x, { deco: 'tree' });
      const room = x + 2;
      x = S.secretRoom(room);
      L.portal(sx + 6, 3, room + 3, 9, { hue: 270, hidden: true });
    },
  },
  {
    id: 28, world: 6, num: 4, name: 'つるの とう', theme: 'jungle', bgm: 'bgm_2', time: 560,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'tree' });
      x = S.run(x, 8, { en: [[6, 'spiky']] });
      x = S.seedWall(x, { star: true });
      x = S.run(x, 8, { cp: 2, en: [[5, 'bee', { v: 'dive', y: 3 }]] });
      x = S.updraft(x, { ch: 'S', en: [[11, 'goomy']] });
      x = S.notes(x, '77 7 77');
      x = S.blocks(x, 'S?SAS', { en: [[7, 'plant', { v: 'spit' }]] });
      x = S.zip(x, 20, { en: [[17, 'goomy']] });
      x = S.run(x, 8, { cp: 3, en: [[5, 'slime', { v: 'big' }]] });
      x = S.shaft(x, { ch: 'S', star: true });
      x = S.seed(x, { en: [[12, 'spiky']] });
      x = S.balloon(x);
      x = S.run(x, 10, { cp: 4, items: [[2, 'h']], en: [[7, 'bee', { y: 5 }]] });
      x = S.seedWall(x);
      x = S.notes(x, '7 7  7 7', { star: true });
      x = S.run(x, 8, { en: [[5, 'goomy', { v: 'para' }]] });
      x = S.zip(x, 18);
      x = S.rocks(x, 14, { every: 2.8 });
      x = S.run(x, 6);
      x = S.fallers(x, 3);
      x = S.run(x, 6);
      x = S.goal(x, { ch: 'S', deco: 'tree' });
    },
  },
  {
    id: 29, world: 6, num: 5, name: 'ジャングルの 大樹', theme: 'falls', bgm: 'bgm_1', time: 600,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'tree' });
      x = S.run(x, 8, { en: [[6, 'beetle']] });
      x = S.zip(x, 24, { en: [[2, 'bee', { v: 'dive', y: 3 }]] });
      x = S.run(x, 8, { cp: 2, en: [[6, 'plant', { v: 'spit' }]] });
      x = S.windGap(x, 6);
      x = S.notes(x, '7  7  7  7', { en: [[6, 'bee', { y: 4 }]] });
      x = S.power(x, 'A', { en: [[6, 'spiky']] });
      x = S.seedWall(x, { star: true });
      x = S.run(x, 10, { cp: 3, en: [[6, 'slime', { v: 'big' }]] });
      x = S.rocks(x, 14);
      x = S.noteCliff(x, { star: true });
      x = S.run(x, 8, { en: [[5, 'goomy', { v: 'para' }]] });
      x = S.zip(x, 20);
      x = S.run(x, 10, { cp: 4, items: [[2, 'h']], en: [[7, 'beetle']] });
      x = S.seed(x, { star: true });
      x = S.notes(x, '77 77 77', { en: [[4, 'bee', { v: 'circle', y: 5 }]] });
      x = S.fallers(x, 4);
      x = S.run(x, 8, { en: [[5, 'spiky']] });
      x = S.run(x, 8, { coins: 4 });
      x = S.goal(x, { deco: 'tree' });
    },
  },
  {
    id: 30, world: 6, num: 6, name: 'じょおうバチの す', theme: 'jungle', bgm: 'bgm_3', time: 720, boss: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'tree' });
      x = S.run(x, 10, { en: [[6, 'bee', { y: 6 }]] });
      x = S.notes(x, '7 7 7');
      x = S.seed(x, { star: true });
      x = S.run(x, 8, { cp: 2, en: [[6, 'bee', { v: 'dive', y: 3 }]] });
      x = S.zip(x, 18);
      x = S.noteCliff(x, { star: true });
      x = S.run(x, 10, { cp: 3, en: [[6, 'bee', { y: 6 }]] });
      x = S.seedWall(x);
      x = S.notes(x, '77 77');
      x = S.zip(x, 18, { en: [[17, 'spiky']] });
      x = S.power(x, 'A');
      x = S.run(x, 8, { cp: 3, items: [[2, 'h']] });
      x = S.boss3(x, 'queen', 6, { star: true });
    },
  },
  {
    id: 31, world: 6, num: '✦', name: 'みどりの ひみつ園', theme: 'falls', bgm: 'bgm_1', time: 400, secret: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x);
      x = S.power(x, 'A');
      x = S.notes(x, '7777777', { star: true });
      x = S.run(x, 8, { items: [[3, 'u'], [5, 'c']] });
      x = S.zip(x, 20, { star: true });
      x = S.run(x, 6, { cp: 2 });
      x = S.seed(x, { star: true });
      x = S.blocks(x, '?????', { coins: 5 });
      x = S.goal(x, { deco: 'tree' });
    },
  },
  // ===================== ワールド7 つきと ほしぞらの くに(ふわふわ ゾーン・ほしの たいほう・ほうき星) =====================
  {
    id: 32, world: 7, num: 1, name: 'つきの はら', theme: 'moon', bgm: 'bgm_2', time: 540,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x);
      x = S.run(x, 10, { en: [[7, 'goomy']] });
      x = S.moon(x, 2, { hint: true });
      x = S.run(x, 8, { cp: 2, en: [[6, 'eye', { y: 5 }]] });
      x = S.moon(x, 3, { step: true, star: true });
      x = S.blocks(x, 'S?SAS', { en: [[7, 'slime']] });
      x = S.cannon(x, 9, { hint: true });
      x = S.run(x, 10, { cp: 3, en: [[6, 'goomy', { v: 'para' }]] });
      x = S.tower(x, { star: true, en: [[7, 'spiky']] });
      x = S.moon(x, 2, { gap: 6, en: [[9, 'bat', { y: 4 }]] });
      x = S.run(x, 10, { cp: 4, items: [[2, 'h']], en: [[6, 'slime']] });
      x = S.cannonUp(x, { star: true });
      x = S.gap(x, 3);
      x = S.cannon(x, 10);
      x = S.run(x, 8, { en: [[5, 'eye', { y: 5 }]] });
      x = S.moon(x, 2);
      x = S.goal(x, { ch: 'S' });
    },
  },
  {
    id: 33, world: 7, num: 2, name: 'ほうき星の みち', theme: 'space', bgm: 'bgm_3', time: 560, secretGoal: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x);
      x = S.run(x, 8, { en: [[6, 'goomy']] });
      x = S.comets(x, 18, { hint: true, coins: 6 });
      x = S.run(x, 8, { cp: 2, en: [[6, 'eye', { y: 5 }]] });
      x = S.moon(x, 2, { star: true });
      x = S.comets(x, 20, { blocks: true, en: [[12, 'goomy']] });
      x = S.cannon(x, 10, { star: true, starY: 5 });
      x = S.run(x, 8, { cp: 3, en: [[5, 'slime']] });
      x = S.power(x, 'A');
      x = S.comets(x, 22, { high: true, every: 2.4 });
      x = S.run(x, 8, { cp: 4, items: [[2, 'h']] });
      // ひみつ: ふわふわ ゾーンの 高い 柱の 上の ワープ
      const sx = x;
      x = S.run(x, 14, { en: [[11, 'spiky']] });
      L.hazard(sx, 'lowgrav', { w: 14 });
      L.fill(sx + 6, sx + 6, 5, 9, 'S');
      x = S.moon(x, 2, { step: true });
      x = S.comets(x, 16, { coins: 5, phase: 0.6 });
      x = S.tower(x, { ch: 'S', star: true });
      x = S.goal(x, { ch: 'S' });
      const room = x + 2;
      x = S.secretRoom(room);
      L.portal(sx + 6, 4, room + 3, 9, { hue: 270, hidden: true });
    },
  },
  {
    id: 34, world: 7, num: 3, name: 'たいほう きち', theme: 'moon', bgm: 'bgm_2', time: 560,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.run(x, 8, { en: [[6, 'turret']] });
      x = S.cannon(x, 9);
      x = S.crushers(x, 3, { coins: true });
      x = S.run(x, 8, { cp: 2, en: [[6, 'bomb']] });
      x = S.cannon(x, 10, { lava: true, star: true, starY: 5 });
      x = S.cannonUp(x, { en: [[12, 'goomy']] });
      x = S.run(x, 8, { cp: 3, en: [[6, 'turret', { v: 'aim' }]] });
      x = S.firebars(x, 12, 2);
      x = S.power(x, 'A');
      x = S.moon(x, 2, { gap: 6 });
      x = S.cannonUp(x, { star: true });
      x = S.run(x, 10, { cp: 4, items: [[2, 'h']], en: [[6, 'bomb']] });
      x = S.cannon(x, 11, { lava: true });
      x = S.zappers(x, 3);
      x = S.tower(x, { ch: 'M', h: 6, star: true });
      x = S.run(x, 8, { en: [[5, 'turret']] });
      x = S.goal(x, { ch: 'M' });
    },
  },
  {
    id: 35, world: 7, num: 4, name: 'ほしくずの かいだん', theme: 'space', bgm: 'bgm_1', time: 580,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x);
      x = S.run(x, 8, { en: [[6, 'eye', { y: 5 }]] });
      x = S.moon(x, 3, { step: true, star: true });
      x = S.comets(x, 16, { blocks: true });
      x = S.run(x, 8, { cp: 2, en: [[5, 'slime']] });
      x = S.bubbles(x, 3, { en: [[8, 'bat', { y: 3 }]] });
      x = S.cannon(x, 10);
      x = S.power(x, 'A', { en: [[6, 'goomy', { v: 'para' }]] });
      x = S.run(x, 8, { cp: 3, en: [[6, 'eye', { y: 4 }]] });
      x = S.balloon(x, { star: true });
      x = S.comets(x, 18, { high: true, every: 2.2, en: [[9, 'spiky']] });
      x = S.moon(x, 3, { gap: 6, en: [[8, 'bat', { y: 3 }]] });
      x = S.run(x, 10, { cp: 4, items: [[2, 'h']] });
      x = S.cannonUp(x, { star: true });
      x = S.movers(x, 3, { step: true });
      x = S.comets(x, 14, { coins: 5 });
      x = S.goal(x, { ch: 'S' });
    },
  },
  {
    id: 36, world: 7, num: 5, name: 'つきの うら', theme: 'moon', bgm: 'bgm_3', time: 600,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x);
      x = S.run(x, 8, { en: [[6, 'skeleton']] });
      x = S.swGate(x);
      x = S.moon(x, 2, { gap: 6, en: [[9, 'bat', { y: 4 }]] });
      x = S.run(x, 8, { cp: 2, en: [[5, 'wizard']] });
      x = S.cannon(x, 11, { lava: true, star: true, starY: 5 });
      x = S.comets(x, 18, { high: true, blocks: true });
      x = S.warpUp(x, { star: true });
      x = S.run(x, 8, { cp: 3, en: [[6, 'skeleton']] });
      x = S.power(x, 'A');
      x = S.blink(x, 'S333S444S');
      x = S.moon(x, 3, { step: true });
      x = S.run(x, 10, { cp: 4, items: [[2, 'h']], en: [[6, 'wizard']] });
      x = S.cannonUp(x);
      x = S.comets(x, 16, { every: 2.0 });
      x = S.tower(x, { ch: 'S', h: 6, star: true });
      x = S.goal(x, { ch: 'S' });
    },
  },
  {
    id: 37, world: 7, num: 6, name: 'ほしめだまの てんもんだい', theme: 'space', bgm: 'bgm_3', time: 720, boss: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x);
      x = S.run(x, 10, { en: [[6, 'eye', { y: 5 }]] });
      x = S.comets(x, 16);
      x = S.moon(x, 2, { star: true });
      x = S.run(x, 8, { cp: 2, en: [[6, 'slime']] });
      x = S.cannonUp(x, { star: true });
      x = S.cannon(x, 10);
      x = S.moon(x, 2, { step: true, en: [[9, 'bat', { y: 4 }]] });
      x = S.comets(x, 14, { high: true, cp: 2 });
      x = S.power(x, 'A');
      x = S.run(x, 8, { cp: 3, items: [[2, 'h']] });
      x = S.boss3(x, 'medama', 6, { low: true, star: true });
    },
  },
  {
    id: 38, world: 7, num: '✦', name: 'ほしぞらの ひみつ', theme: 'space', bgm: 'bgm_1', time: 400, secret: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x);
      x = S.power(x, 'A');
      x = S.moon(x, 3, { step: true, star: true });
      x = S.run(x, 8, { items: [[3, 'u'], [5, 'c']] });
      x = S.cannon(x, 12, { star: true, starY: 5 });
      x = S.run(x, 6, { cp: 2 });
      x = S.cannonUp(x, { star: true });
      x = S.blocks(x, '?????', { coins: 5 });
      x = S.goal(x, { ch: 'S' });
    },
  },
  // ===================== ワールド8 かげの おうの くに(かんらんしゃ・くずれる つりばし・かげハル) =====================
  {
    id: 39, world: 8, num: 1, name: 'かげの まち', theme: 'kage', bgm: 'bgm_2', time: 560,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'lamp' });
      x = S.run(x, 10, { en: [[7, 'skeleton']], deco: [[3, 'lamp']] });
      x = S.bridge(x, 6, {});
      L.hint(x - 9, 'くずれる つりばし', 'のると じゅんに おちる。とまらずに わたろう');
      x = S.run(x, 8, { cp: 2, en: [[6, 'ghost', { y: 6 }]] });
      L.hint(x, 'かげが くる!', 'じぶんの かげが おくれて おいかけてくる');
      x = S.shadowRun(x, 24, { star: true });
      x = S.run(x, 8, { en: [[5, 'goomy']] });
      x = S.blocks(x, 'S?SAS', { en: [[7, 'skeleton']] });
      x = S.wheel(x, { hint: true, star: true });
      x = S.run(x, 10, { cp: 3, en: [[6, 'bat', { y: 4 }]] });
      x = S.bridge(x, 8, {});
      x = S.run(x, 8, { en: [[5, 'ghost', { y: 5 }]], deco: [[2, 'lamp']] });
      x = S.shadowRun(x, 28, { cp: 2 });
      x = S.bridge(x, 7, {});
      x = S.run(x, 8, { en: [[5, 'skeleton']] });
      x = S.shadowRun(x, 16, {});
      x = S.tower(x, { ch: 'S', star: true });
      x = S.run(x, 8, { en: [[5, 'skeleton']] });
      x = S.wheel(x, {});
      x = S.run(x, 6, { coins: 4 });
      x = S.goal(x, { ch: 'S', deco: 'lamp' });
    },
  },
  {
    id: 40, world: 8, num: 2, name: 'くずれる つりばし', theme: 'kage', bgm: 'bgm_3', time: 580,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'lamp' });
      x = S.run(x, 8, { en: [[6, 'skeleton']] });
      x = S.bridge(x, 8, { lava: true });
      x = S.run(x, 8, { cp: 2, en: [[6, 'bomb']] });
      x = S.bridge(x, 10, { star: true });
      x = S.firebars(x, 12, 2);
      x = S.power(x, 'A');
      x = S.wheel(x, { lava: true });
      x = S.run(x, 8, { cp: 3, en: [[6, 'wizard']] });
      x = S.bridge(x, 12, { lava: true, en: [[8, 'bat', { y: 5 }]] });
      x = S.shadowRun(x, 20, {});
      x = S.swStairs(x, { star: true });
      x = S.run(x, 10, { cp: 4, items: [[2, 'h']], en: [[6, 'skeleton']] });
      x = S.bridge(x, 8, {});
      x = S.notes(x, '7 7 7', { lava: true });
      x = S.bridge(x, 9, { lava: true });
      x = S.wheel(x, { lava: true });
      x = S.run(x, 8, { en: [[5, 'bat', { y: 5 }]] });
      x = S.tower(x, { ch: 'S', star: true });
      x = S.goal(x, { ch: 'S', deco: 'lamp' });
    },
  },
  {
    id: 41, world: 8, num: 3, name: 'かんらんしゃの とう', theme: 'kagecastle', bgm: 'bgm_2', time: 580,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.run(x, 8, { en: [[6, 'skeleton']] });
      x = S.wheel(x, { lava: true, star: true });
      x = S.run(x, 8, { cp: 2, en: [[6, 'wizard']] });
      x = S.firebars(x, 12, 2);
      x = S.wheel(x, { lava: true, r: 4, n: 5, sp: 0.5 });
      x = S.power(x, 'A');
      x = S.run(x, 8, { cp: 3, en: [[6, 'bomb']] });
      x = S.crushers(x, 3);
      x = S.wheel(x, { lava: true, sp: -0.7, star: true });
      x = S.bridge(x, 8, { lava: true });
      x = S.run(x, 10, { cp: 4, items: [[2, 'h']], en: [[6, 'skeleton']] });
      x = S.shadowRun(x, 22, { lava: true });
      x = S.wheel(x, { lava: true, r: 4, n: 4, sp: 0.55 });
      x = S.bridge(x, 9, { lava: true });
      x = S.shadowRun(x, 20, {});
      x = S.run(x, 6);
      x = S.tower(x, { ch: 'M', h: 6, star: true });
      x = S.zappers(x, 3);
      x = S.goal(x, { ch: 'M', deco: 'torch' });
    },
  },
  {
    id: 42, world: 8, num: 4, name: 'かげの めいろ', theme: 'kagecastle', bgm: 'bgm_3', time: 600, secretGoal: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.run(x, 8, { en: [[6, 'skeleton']] });
      x = S.shadowRun(x, 22, { star: true });
      x = S.run(x, 8, { cp: 2, en: [[6, 'ghost', { y: 5 }]] });
      x = S.warpMaze(x, { order: [1, 0, 1] });
      x = S.bridge(x, 9, { lava: true });
      x = S.power(x, 'A');
      x = S.run(x, 8, { cp: 3, en: [[6, 'wizard']] });
      // ひみつ: かんらんしゃの 右上に うかぶ ワープ(てっぺんの 足場から とびうつる)
      const sx = x;
      x = S.wheel(x, { lava: true, r: 4, sp: 0.5 });
      x = S.zip(x, 18, { lava: true, star: true });
      x = S.run(x, 10, { cp: 4, items: [[2, 'h']], en: [[6, 'skeleton']] });
      x = S.notes(x, '77 77', { lava: true });
      x = S.comets(x, 16, { blocks: true });
      x = S.shadowRun(x, 20, {});
      x = S.cannonUp(x, { star: true });
      x = S.goal(x, { ch: 'S', deco: 'torch' });
      const room = x + 2;
      x = S.secretRoom(room);
      L.portal(sx + 9, 3, room + 3, 9, { hue: 270, hidden: true });
    },
  },
  {
    id: 43, world: 8, num: 5, name: 'さいごの みち', theme: 'kagecastle', bgm: 'bgm_1', time: 640,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.run(x, 8, { en: [[6, 'skeleton']] });
      x = S.zip(x, 18, { lava: true });
      x = S.seedWall(x, { ch: 'S' });
      x = S.run(x, 8, { cp: 2, en: [[6, 'wizard']] });
      x = S.moon(x, 2, { gap: 6, star: true });
      x = S.cannon(x, 10, { lava: true });
      x = S.bridge(x, 10, { lava: true });
      x = S.run(x, 8, { cp: 3, en: [[6, 'bomb']] });
      x = S.power(x, 'A');
      x = S.wheel(x, { lava: true, star: true });
      x = S.windHead(x, 3, { lava: true });
      x = S.swGate(x, { en: [[11, 'skeleton']] });
      x = S.run(x, 10, { cp: 4, items: [[2, 'h']] });
      x = S.shadowRun(x, 24, { lava: true });
      x = S.blink(x, 'S333S444S', { lava: true });
      x = S.notes(x, '7 7 7 7', { lava: true, star: true });
      x = S.goal(x, { ch: 'S', deco: 'torch' });
    },
  },
  {
    id: 44, world: 8, num: 6, name: 'かげの おうの しろ', theme: 'kagecastle', bgm: 'bgm_3', time: 900, boss: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.run(x, 10, { en: [[6, 'skeleton']] });
      x = S.bridge(x, 8, { lava: true });
      x = S.wheel(x, { lava: true, star: true });
      x = S.run(x, 8, { cp: 2, en: [[6, 'wizard']] });
      x = S.shadowRun(x, 22, { star: true });
      x = S.notes(x, '7 7 7', { lava: true });
      x = S.zip(x, 18, { lava: true });
      x = S.run(x, 8, { cp: 3, en: [[6, 'bomb']] });
      x = S.comets(x, 14, { blocks: true });
      x = S.wheel(x, { lava: true, sp: -0.6 });
      x = S.power(x, 'A');
      x = S.run(x, 8, { cp: 4, items: [[2, 'h']] });
      x = S.boss3(x, 'kage', 8, { star: true });
    },
  },
  {
    id: 45, world: 8, num: '✦', name: 'ほしの ランプの へや', theme: 'space', bgm: 'bgm_1', time: 400, secret: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x);
      x = S.power(x, 'A');
      x = S.wheel(x, { star: true });
      x = S.run(x, 8, { items: [[3, 'u'], [5, 'c']] });
      x = S.notes(x, '7777777', { star: true });
      x = S.run(x, 6, { cp: 2 });
      x = S.zip(x, 18, { star: true });
      x = S.blocks(x, '?????', { coins: 5 });
      x = S.goal(x, { ch: 'S' });
    },
  },
  // ===================== 2026-10-12 夜: ワールド1〜3 を 5面+ひみつの面に(1-5 は はじめての ボス) =====================
  {
    id: 46, world: 1, num: 5, name: 'スライム大王の おか', theme: 'grass', bgm: 'bgm_2', time: 600, boss: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'sign' });
      x = S.run(x, 10, { en: [[6, 'slime']], deco: [[2, 'tree']] });
      x = S.blocks(x, 'B?BHB', { en: [[7, 'goomy']] });
      x = S.gap(x, 3, { coins: 3 });
      x = S.spring(x, { star: true });
      x = S.run(x, 10, { cp: 3, en: [[5, 'slime'], [8, 'slime']] });
      x = S.movers(x, 2);
      x = S.tower(x, { star: true, en: [[7, 'goomy', { v: 'para' }]] });
      x = S.run(x, 8, { en: [[5, 'bee', { y: 6 }]], deco: [[6, 'fence']] });
      x = S.power(x, 'A');
      x = S.run(x, 8, { cp: 3 });
      x = S.boss2(x, 'slimeking', 4, { star: true });
    },
  },
  {
    id: 47, removed: true, noStars: true, noShards: true, world: 1, num: '✦', name: 'はらっぱの ひみつ', theme: 'grass', bgm: 'bgm_1', time: 400, secret: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'tree' });
      x = S.power(x, 'A');
      x = S.run(x, 8, { items: [[3, 'u'], [5, 'c']] });
      x = S.tramp(x, { star: true });
      x = S.blocks(x, '?????', { coins: 5 });
      x = S.gap(x, 7, { star: true, starY: 4, coins: 7, coinY: 6 });
      x = S.run(x, 8, { cp: 2, coins: 5 });
      x = S.spring(x, { star: true });
      x = S.run(x, 6, { coins: 4 });
      x = S.goal(x, { deco: 'tree' });
    },
  },
  {
    id: 48, world: 2, num: 4, name: 'こおりの みずうみ', theme: 'ice', bgm: 'bgm_1', time: 520,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'crystal' });
      x = S.run(x, 10, { fill: 'I', en: [[6, 'slime']] });
      x = S.icicles(x, 12, { en: [[8, 'shell']] });
      x = S.gap(x, 4, { plank: 2 });
      x = S.run(x, 8, { cp: 2, en: [[5, 'eye', { y: 5 }]] });
      x = S.bubbles(x, 3);
      x = S.blocks(x, 'BEB?B', { en: [[7, 'slime', { v: 'big' }]] });
      x = S.shaft(x, { ch: 'I', star: true });
      x = S.run(x, 10, { cp: 3, fill: 'I', en: [[4, 'skeleton'], [8, 'bat', { y: 4 }]] });
      x = S.movers(x, 3, { kind: 'lift' });
      x = S.firebars(x, 12, 2);
      x = S.power(x, 'A', { en: [[6, 'eye', { y: 4 }]] });
      x = S.gap(x, 8, { star: true, starY: 4 });
      x = S.run(x, 10, { cp: 4, en: [[6, 'slime', { v: 'big' }]] });
      x = S.fallers(x, 3);
      x = S.run(x, 4);
      x = S.tower(x, { ch: 'I', star: true, en: [[7, 'shell']] });
      x = S.icicles(x, 12);
      x = S.goal(x, { deco: 'crystal' });
    },
  },
  {
    id: 49, world: 2, num: '✦', name: 'こおりの ひみつ', theme: 'ice', bgm: 'bgm_1', time: 400, secret: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'crystal' });
      x = S.power(x, 'A');
      x = S.run(x, 8, { fill: 'I', items: [[3, 'u'], [5, 'c']] });
      x = S.bubbles(x, 3, { star: true });
      x = S.run(x, 6, { fill: 'I', coins: 4 });
      x = S.shaft(x, { ch: 'I', star: true });
      x = S.run(x, 8, { cp: 2, coins: 5 });
      x = S.gap(x, 7, { star: true, starY: 4, coins: 7, coinY: 6 });
      x = S.blocks(x, '?????', { coins: 5 });
      x = S.goal(x, { deco: 'crystal' });
    },
  },
  {
    id: 50, world: 3, num: 4, name: 'すなあらしの みち', theme: 'sand', bgm: 'bgm_2', time: 520,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'pillar' });
      x = S.run(x, 10, { en: [[6, 'beetle']] });
      x = S.updraft(x, { star: true, en: [[11, 'skeleton']] });
      x = S.conveyor(x, 12, 1, { en: [[7, 'bomb']], coins: 4 });
      x = S.run(x, 8, { cp: 2, en: [[6, 'firespirit', { v: 'chase' }]] });
      x = S.saws(x, 12, { coins: true });
      x = S.blocks(x, 'DED?D', { en: [[7, 'turret', { v: 'aim' }]] });
      x = S.zappers(x, 3);
      x = S.run(x, 10, { cp: 3, en: [[5, 'beetle'], [8, 'bee', { v: 'dive', y: 4 }]] });
      x = S.crushers(x, 3, { coins: true });
      x = S.gap(x, 8, { star: true, starY: 4 });
      x = S.power(x, 'A', { en: [[6, 'skeleton']] });
      x = S.updraft(x, { en: [[11, 'goomy', { v: 'para' }]] });
      x = S.run(x, 10, { cp: 4, en: [[6, 'firespirit', { v: 'chase' }]] });
      x = S.conveyor(x, 12, -1, { en: [[6, 'beetle']] });
      x = S.tower(x, { ch: 'D', h: 6, star: true });
      x = S.fallers(x, 3);
      x = S.run(x, 4);
      x = S.goal(x, { ch: 'D', deco: 'pillar' });
    },
  },
  {
    id: 51, world: 3, num: '✦', name: 'すなの ひみつ', theme: 'sand', bgm: 'bgm_1', time: 400, secret: true,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'pillar' });
      x = S.power(x, 'A');
      x = S.run(x, 8, { items: [[3, 'u'], [5, 'c']] });
      x = S.updraft(x, { star: true });
      x = S.conveyor(x, 12, 1, { coins: 6 });
      x = S.run(x, 6, { cp: 2 });
      x = S.updraftGap(x, 10, { star: true });
      x = S.run(x, 6, { coins: 4 });
      x = S.tower(x, { ch: 'D', h: 6, star: true });
      x = S.blocks(x, '?????', { coins: 5 });
      x = S.goal(x, { ch: 'D', deco: 'pillar' });
    },
  },
  // ===================== 第4段階(スーパーマリオワールド風): しんでん・おばけやしき・みず・とりで・そら・ほしの みち =====================
  // ---- しんでん(4色)。さいごの 大きな スイッチを ふむと その色の 点線ブロックが どの 面でも 本物に なる ----
  {
    id: 52, removed: true, noStars: true, noShards: true, world: 1, kind: 'switch', palace: 'y', noExtend: true, name: 'きいろの しんでん', theme: 'crystal', bgm: 'bgm_3', time: 400,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'crystal' });
      x = S.run(x, 8, { coins: 4 });
      x = S.turn(x, { hint: true, star: true });
      x = S.gap(x, 3, { coins: 3 });
      x = S.run(x, 10, { en: [[5, 'goomy'], [8, 'goomy']] });
      x = S.palaceRoute(x, 'y');
      x = S.run(x, 8, { cp: 2 });
      x = S.blocks(x, 'BjBjB', { en: [[6, 'shell']] });
      x = S.movers(x, 2, { star: true });
      x = S.shells(x, { coins: true });
      x = S.run(x, 6, { cp: 2 });
      x = S.tower(x, { ch: 'S', star: true });
      x = S.run(x, 6);
      x = S.palaceEnd(x);
    },
  },
  {
    id: 53, removed: true, noStars: true, noShards: true, world: 2, kind: 'switch', palace: 'g', noExtend: true, name: 'みどりの しんでん', theme: 'crystal', bgm: 'bgm_3', time: 420,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'crystal' });
      x = S.run(x, 8, { fill: 'I', coins: 4 });
      x = S.throwRun(x, { hint: true, en: [[9, 'slime'], [11, 'slime'], [13, 'slime']] });
      x = S.gap(x, 4, { plank: 2, star: true, starY: 5 });
      x = S.turn(x, { star: true });
      x = S.run(x, 8, { cp: 2, en: [[5, 'skeleton']] });
      x = S.palaceRoute(x, 'g');
      x = S.icicles(x, 12, { ch: 'S' });
      x = S.run(x, 6, { cp: 2 });
      x = S.fallers(x, 3);
      x = S.run(x, 4);
      x = S.shaft(x, { ch: 'I', star: true });
      x = S.run(x, 6);
      x = S.palaceEnd(x);
    },
  },
  {
    id: 54, removed: true, noStars: true, noShards: true, world: 4, kind: 'switch', palace: 'b', noExtend: true, name: 'みずいろの しんでん', theme: 'crystal', bgm: 'bgm_3', time: 450,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'crystal' });
      x = S.run(x, 8, { coins: 4 });
      x = S.rail(x, 16, { hint: true, star: true });
      x = S.run(x, 8, { en: [[5, 'mogura']] });
      x = S.windGap(x, 5, { star: true, starY: 5 });
      x = S.palaceRoute(x, 'b');
      x = S.run(x, 8, { cp: 2, en: [[5, 'bomb']] });
      x = S.swGate(x, {});
      x = S.pswitch(x, { hint: true });
      x = S.run(x, 6, { cp: 2 });
      x = S.warpUp(x, { star: true });
      x = S.run(x, 6);
      x = S.palaceEnd(x);
    },
  },
  {
    id: 55, removed: true, noStars: true, noShards: true, world: 6, kind: 'switch', palace: 'p', noExtend: true, name: 'むらさきの しんでん', theme: 'crystal', bgm: 'bgm_3', time: 480,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'crystal' });
      x = S.run(x, 8, { coins: 4 });
      x = S.seed(x, { star: true });
      x = S.notes(x, '7 7 7 7');
      x = S.run(x, 8, { cp: 2, en: [[5, 'nageko']] });
      x = S.palaceRoute(x, 'p', { lava: true });
      x = S.zip(x, 16, { star: true });
      x = S.run(x, 6, { cp: 2, en: [[4, 'spiky']] });
      x = S.turn(x, {});
      x = S.rail(x, 18, { lava: true, sp: 140 });
      x = S.run(x, 6, { cp: 2 });
      x = S.tower(x, { ch: 'S', star: true });
      x = S.run(x, 6);
      x = S.palaceEnd(x);
    },
  },
  // ---- おばけやしき ----
  {
    id: 56, world: 2, kind: 'ghost', noExtend: true, name: 'ゆきの おばけやしき', theme: 'ghostmansion', bgm: 'bgm_3', time: 500,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'lamp' });
      x = S.run(x, 10, { en: [[6, 'ghost', { y: 7 }]], deco: [[3, 'lamp']] });
      x = S.doorMaze(x, { hint: true, good: 1, star: true });
      x = S.run(x, 8, { cp: 2 });
      x = S.ghostFloor(x, { boo: true, star: true });
      x = S.run(x, 10, { en: [[4, 'ghost', { y: 6 }], [8, 'skeleton']] });
      x = S.blocks(x, 'B?BjB', { en: [[6, 'ghost', { y: 5 }]] });
      x = S.run(x, 8, { cp: 3 });
      x = S.doorMaze(x, { good: 2 });
      x = S.ghostFloor(x, { pat: '33443344334433', boo: true });
      x = S.run(x, 8, { cp: 2 });
      x = S.tower(x, { ch: 'S', star: true, en: [[7, 'ghost', { y: 5 }]] });
      x = S.doorMaze(x, { good: 0 });
      x = S.run(x, 8, { coins: 4 });
      x = S.goal(x, { ch: 'S', deco: 'lamp' });
    },
  },
  {
    id: 63, world: 8, kind: 'ghost', noExtend: true, name: 'かげの やかた', theme: 'ghostmansion', bgm: 'bgm_3', time: 560,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'lamp' });
      x = S.run(x, 10, { en: [[6, 'ghost', { y: 7 }], [8, 'kumo', { top: 2, drop: 7 }]] });
      x = S.doorMaze(x, { hint: true, good: 2 });
      x = S.ghostFloor(x, { pat: '3344334433443344', boo: true });
      x = S.run(x, 8, { cp: 2, en: [[5, 'skeleton']] });
      x = S.blink(x, 'S33S44S33S', { star: true, starY: 6 });
      x = S.doorMaze(x, { good: 0, star: true });
      x = S.run(x, 8, { cp: 3, en: [[4, 'ghost', { y: 6 }]] });
      x = S.shadowRun(x, 18, {});
      x = S.ghostFloor(x, { pat: '43344334', boo: true });
      x = S.run(x, 6, { cp: 2 });
      x = S.doorMaze(x, { good: 1 });
      x = S.tower(x, { ch: 'S', star: true });
      x = S.run(x, 8, { en: [[4, 'kumo', { top: 2, drop: 7 }]] });
      x = S.goal(x, { ch: 'S', deco: 'lamp' });
    },
  },
  // ---- みずの なか ----
  {
    id: 57, world: 3, kind: 'water', noExtend: true, name: 'オアシスの みずうみ', theme: 'underwater', bgm: 'bgm_1', time: 520,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'pillar' });
      L.hint(x - 2, 'みずの なか', 'ジャンプで およぐ。ぷっくんは ふくらむと トゲが でる');
      x = S.deep(x, 24, { coins: true, fugu: [[12, 6]], pillars: [[16, 1, 5]] });
      x = S.deep(x, 22, { coinY: 9, coins: true, fugu: [[6, 8], [16, 4]], star: [11, 2], cp: 3 });
      x = S.deep(x, 26, { pillars: [[6, 6, 10], [14, 1, 5], [20, 6, 10]], coins: true, coinY: 3, fugu: [[10, 7]] });
      x = S.deep(x, 22, { coins: true, fugu: [[5, 3], [12, 8], [18, 5]], cp: 2 });
      x = S.deep(x, 24, { pillars: [[4, 1, 7], [12, 4, 10], [19, 1, 7]], star: [16, 2], coins: true, coinY: 9 });
      x = S.deep(x, 22, { coins: true, fugu: [[8, 6], [15, 3]], cp: 2 });
      x = S.deep(x, 28, { pillars: [[5, 5, 10], [11, 1, 6], [17, 5, 10], [23, 1, 6]], coins: true, coinY: 3, fugu: [[14, 8]], star: [20, 9] });
      x = S.deep(x, 20, { coins: true, fugu: [[6, 5], [12, 7]] });
      x = S.run(x, 6, { top: 9 });
      x = S.goal(x, { top: 9, deco: 'pillar' });
    },
  },
  {
    id: 60, world: 6, kind: 'water', noExtend: true, name: 'たきつぼの なか', theme: 'underwater', bgm: 'bgm_1', time: 560,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'tree' });
      L.hint(x - 2, 'たきつぼ', 'ぷっくんが ふくらんでいない ときは ふめる');
      x = S.deep(x, 24, { coins: true, fugu: [[8, 5], [16, 8]], pillars: [[12, 1, 6]] });
      x = S.deep(x, 26, { pillars: [[5, 6, 10], [11, 1, 5], [17, 6, 10]], coins: true, coinY: 3, star: [21, 9], cp: 2 });
      x = S.deep(x, 24, { coins: true, fugu: [[5, 3], [10, 8], [16, 5], [20, 2]] });
      x = S.deep(x, 26, { pillars: [[4, 1, 7], [10, 4, 10], [16, 1, 7], [22, 4, 10]], star: [13, 2], cp: 2 });
      x = S.deep(x, 24, { coins: true, coinY: 9, fugu: [[6, 6], [14, 3], [19, 8]] });
      x = S.deep(x, 26, { pillars: [[6, 5, 10], [12, 1, 6], [18, 5, 10]], coins: true, coinY: 3, fugu: [[9, 8], [21, 4]], star: [15, 9], cp: 2 });
      x = S.deep(x, 22, { coins: true, fugu: [[7, 4], [14, 7]] });
      x = S.run(x, 6, { top: 9 });
      x = S.goal(x, { top: 9, deco: 'tree' });
    },
  },
  // ---- とりで(さいごに とりでの ぬし) ----
  {
    id: 58, world: 3, kind: 'fort', noExtend: true, name: 'すなの とりで', theme: 'fort', bgm: 'bgm_2', time: 560,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.run(x, 8, { en: [[5, 'skeleton']] });
      x = S.ballchain(x, { coins: true });
      x = S.firebars(x, 12, 2);
      x = S.run(x, 8, { cp: 2, en: [[5, 'bomb']] });
      x = S.ceil(x, 10, { hint: true, notch: [4] });
      x = S.gap(x, 3, { lava: true });
      x = S.crushers(x, 3, { coins: true });
      x = S.run(x, 8, { cp: 3 });
      x = S.ballchain(x, { sp: -1.5, ang: 2 });
      x = S.tower(x, { ch: 'S', star: true });
      x = S.movers(x, 2, { lava: true, star: true });
      x = S.run(x, 6, { cp: 2 });
      x = S.ceil(x, 12, { notch: [3, 8] });
      x = S.gap(x, 4, { lava: true, plank: 2, fish: true });
      x = S.firebars(x, 12, 2, { speed: 2.0 });
      x = S.run(x, 4, { star: false });
      L.put(x - 2, 6, '*');
      x = S.run(x, 6, { cp: 2 });
      x = S.fortBoss(x, 5);
    },
  },
  {
    id: 62, world: 7, kind: 'fort', noExtend: true, name: 'つきの とりで', theme: 'castle', bgm: 'bgm_2', time: 600,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.run(x, 8, { en: [[5, 'skeleton']] });
      x = S.ceil(x, 12, { hint: true, notch: [3, 8] });
      x = S.ballchain(x, { r: 3, sp: 1.6, coins: true });
      x = S.moon(x, 2, { star: true });
      x = S.run(x, 8, { cp: 2, en: [[5, 'nageko']] });
      x = S.firebars(x, 14, 3);
      x = S.gap(x, 4, { lava: true, plank: 2 });
      x = S.ceil(x, 14, { notch: [2, 7, 11], phase: 0.4 });
      x = S.run(x, 6, { cp: 2 });
      x = S.cannonUp(x, { star: true });
      x = S.ballchain(x, { sp: -1.8 });
      x = S.crushers(x, 4, { coins: true });
      x = S.run(x, 8, { cp: 2, en: [[5, 'spiky']] });
      x = S.rail(x, 16, { lava: true, star: true });
      x = S.run(x, 6, { cp: 2 });
      x = S.fortBoss(x, 6, { low: true });
    },
  },
  {
    id: 64, world: 8, kind: 'fort', noExtend: true, name: 'かげの とりで', theme: 'kagecastle', bgm: 'bgm_2', time: 620,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.run(x, 8, { en: [[5, 'skeleton'], [7, 'kumo', { top: 2, drop: 7 }]] });
      x = S.ceil(x, 14, { hint: true, notch: [3, 9] });
      x = S.ballchain(x, { r: 3, sp: 1.8 });
      x = S.bridge(x, 7, { lava: true, star: true });
      x = S.run(x, 8, { cp: 2, en: [[5, 'nageko']] });
      x = S.firebars(x, 14, 3, { speed: 2.1 });
      x = S.ceil(x, 16, { notch: [2, 8, 13], phase: 0.2 });
      x = S.run(x, 6, { cp: 2 });
      x = S.wheel(x, { lava: true, star: true });
      x = S.ballchain(x, { sp: -2.0, ang: 1 });
      x = S.shadowRun(x, 16, { lava: true });
      x = S.run(x, 8, { cp: 2 });
      x = S.rail(x, 18, { lava: true, sp: 150, star: true });
      x = S.run(x, 6, { cp: 2 });
      x = S.fortBoss(x, 6);
    },
  },
  // ---- そらの みち(強制スクロール) ----
  {
    id: 59, world: 4, kind: 'sky', auto: 115, auto2: 135, noExtend: true, name: 'あらしの そらの みち', theme: 'storm', bgm: 'bgm_2', time: 400,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, {});
      L.hint(x - 6, 'がめんが すすむ!', 'おいていかれないように すすもう');
      x = S.clouds(x, 6, { en: [[10, 'bee', { y: 5 }]] });
      x = S.run(x, 8, { top: 9, coins: 3 });
      x = S.movers(x, 3, { top: 9, star: true });
      x = S.clouds(x, 5, { top: 8, en: [[8, 'bat', { y: 4 }]] });
      x = S.run(x, 6, { top: 9, cp: 2 });
      x = S.rail(x, 16, { top: 9, sp: 190 });  // 強制スクロールが 速く なったので せんろも 速く(2026-10-16 夜)
      x = S.clouds(x, 6, { en: [[6, 'bee', { v: 'dive', y: 3 }], [16, 'bee', { y: 5 }]] });
      x = S.windGap(x, 5, { top: 9, star: true, starY: 4 });
      x = S.run(x, 6, { top: 9, cp: 2 });
      x = S.clouds(x, 7, { top: 8 });
      x = S.movers(x, 3, { top: 9, kind: 'lift' });
      x = S.clouds(x, 5, { en: [[10, 'bat', { y: 4 }]] });
      L.put(x - 6, 3, '*');
      x = S.run(x, 6, { top: 9, cp: 2 });
      x = S.clouds(x, 6, { top: 8 });
      x = S.run(x, 6, { top: 9 });
      x = S.goal(x, { top: 9 });
    },
  },
  {
    id: 61, world: 7, kind: 'sky', auto: 120, auto2: 140, noExtend: true, name: 'ほうき星の ながれ', theme: 'space', bgm: 'bgm_3', time: 400,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, {});
      L.hint(x - 6, 'がめんが すすむ!', 'ほうき星を よけながら すすもう');
      x = S.comets(x, 18, { coins: 4 });
      x = S.moon(x, 2, { star: true });
      x = S.clouds(x, 5, { top: 9 });
      x = S.run(x, 6, { cp: 2 });
      x = S.cannon(x, 9, {});
      x = S.comets(x, 20, { high: true, blocks: true });
      x = S.rail(x, 16, { star: true, sp: 190 });
      x = S.run(x, 6, { cp: 2 });
      x = S.moon(x, 3, { step: true });
      x = S.clouds(x, 6, { top: 9, en: [[8, 'bat', { y: 5 }]] });
      x = S.comets(x, 18, { coins: 4 });
      x = S.run(x, 6, { cp: 2 });
      x = S.cannonUp(x, { star: true });
      x = S.clouds(x, 5, { top: 9 });
      x = S.run(x, 6);
      x = S.goal(x, {});
    },
  },
  // ---- ほしの みち(上級)。ワールドの「ほしの あな」から ----
  {
    id: 65, world: 9, num: 1, star: true, noExtend: true, name: 'ほしの みち いち', theme: 'space', bgm: 'bgm_3', time: 400,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, {});
      x = S.notes(x, '7 7 7 7 7', { lava: true, star: true });
      x = S.run(x, 6, { en: [[4, 'spiky']] });
      x = S.turn(x, {});
      x = S.fallers(x, 4, { lava: true });
      x = S.run(x, 6, { cp: 2 });
      x = S.moon(x, 2, { gap: 7, star: true });
      x = S.ceil(x, 12, { notch: [3, 8] });
      x = S.rail(x, 18, { lava: true, sp: 160 });
      x = S.run(x, 6, { cp: 2 });
      x = S.bridge(x, 9, { lava: true });
      x = S.shells(x, { e3: 'spiky' });
      x = S.cannon(x, 10, { lava: true, star: true, starY: 3 });
      x = S.run(x, 6);
      x = S.goal(x, {});
    },
  },
  {
    id: 66, world: 9, num: 2, star: true, noExtend: true, name: 'ほしの みち に', theme: 'space', bgm: 'bgm_3', time: 400,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, {});
      x = S.windGap(x, 6, { star: true, starY: 5 });
      x = S.blink(x, 'S33S44S33S44S', { lava: true });
      x = S.run(x, 6, { cp: 2, en: [[4, 'mogura']] });
      x = S.swBridge(x, { lava: true, star: true });
      x = S.ballchain(x, { sp: 2.0 });
      x = S.firebars(x, 12, 3, { speed: 2.2 });
      x = S.run(x, 6, { cp: 2 });
      x = S.zip(x, 18, { lava: true });
      x = S.comets(x, 16, { high: true, blocks: true });
      x = S.wheel(x, { lava: true, star: true, sp: 0.8 });
      x = S.run(x, 6);
      x = S.goal(x, {});
    },
  },
  {
    id: 67, world: 9, num: 3, star: true, noExtend: true, name: 'ほしの みち さん', theme: 'space', bgm: 'bgm_3', time: 420,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, {});
      x = S.timer(x, 16, { gap: 3, dur: 5 });
      x = S.rocks(x, 16, { every: 2.2 });
      x = S.run(x, 6, { cp: 2 });
      x = S.moon(x, 3, { gap: 7, step: true, star: true });
      x = S.ceil(x, 14, { notch: [2, 7, 11], phase: 0.3 });
      x = S.cannon(x, 11, { lava: true, star: true, starY: 3 });
      x = S.run(x, 6, { cp: 2, en: [[4, 'nageko']] });
      x = S.notes(x, '7  7  7  7', { lava: true });
      x = S.bridge(x, 10, { lava: true, star: true });
      x = S.run(x, 6);
      x = S.goal(x, {});
    },
  },
  {
    id: 68, world: 9, num: 4, star: true, noExtend: true, name: 'ほしの みち よん', theme: 'space', bgm: 'bgm_3', time: 420,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, {});
      x = S.rail(x, 20, { lava: true, sp: 170, star: true });
      x = S.shadowRun(x, 20, { lava: true });
      x = S.run(x, 6, { cp: 2 });
      x = S.windHead(x, 5, { lava: true });
      x = S.fallers(x, 5, { lava: true });
      x = S.run(x, 6, { cp: 2, en: [[4, 'kumo', { top: 2, drop: 7 }]] });
      x = S.seedWall(x, { star: true });
      x = S.ballchain(x, { r: 3, sp: 2.2 });
      x = S.blink(x, 'S3344S4433S', { lava: true, rise: true, star: true, starY: 5 });
      x = S.run(x, 6);
      x = S.goal(x, {});
    },
  },
  {
    id: 69, world: 9, num: 5, star: true, noExtend: true, name: 'ほしの みち さいご', theme: 'space', bgm: 'bgm_end', time: 480,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, {});
      x = S.notes(x, '7 7 7 7 7 7', { lava: true });
      x = S.cannon(x, 12, { lava: true, star: true, starY: 3 });
      x = S.run(x, 6, { cp: 2, en: [[4, 'spiky'], [5, 'mogura']] });
      x = S.ceil(x, 16, { notch: [2, 7, 12], phase: 0.2 });
      x = S.wheel(x, { lava: true, sp: 0.9 });
      x = S.bridge(x, 11, { lava: true, star: true });
      x = S.run(x, 6, { cp: 2 });
      x = S.comets(x, 20, { high: true, blocks: true, every: 2.2 });
      x = S.moon(x, 3, { gap: 7, star: true });
      x = S.rail(x, 20, { lava: true, sp: 180 });
      x = S.run(x, 6);
      x = S.goal(x, {});
    },
  },
  // ===================== 第5段階(2026-10-13): 新しい しかけが 主役の 面(1面に 1つの 主役。はじめは 安全な 所で 見せて、だんだん 組み合わせる) =====================
  {
    id: 70, world: 1, noExtend: true, name: 'ぎっこん シーソーの おか', theme: 'grass', bgm: 'bgm_1', time: 420,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'sign' });
      x = S.run(x, 10, { en: [[7, 'goomy']], deco: [[2, 'tree']] });
      x = S.seesaws(x, 1, { hint: true, safe: true });
      x = S.run(x, 8, { cp: 2, coins: 4 });
      x = S.seesaws(x, 2, {});
      x = S.blocks(x, 'B?BvB', { en: [[6, 'goomy']] });
      x = S.tubeUp(x, { star: true });
      L.hint(x - 14, 'すいこみ つつ', 'つつの 口の 上で ↓ を おすと 中を とおって とびだす');
      x = S.run(x, 10, { cp: 3, en: [[6, 'goomy', { v: 'para' }]], deco: [[8, 'tree']] });
      x = S.seesaws(x, 2, { star: true, en: [[2, 'bee', { y: 5 }]] });
      x = S.gap(x, 3, { coins: 3 });
      x = S.tubeWall(x, {});
      x = S.run(x, 10, { cp: 3, en: [[4, 'goomy'], [8, 'goomy']] });
      x = S.seesaws(x, 3, {});
      x = S.spring(x, { star: true });
      x = S.run(x, 8, { cp: 2, en: [[5, 'shell']] });
      x = S.seesaws(x, 2, { en: [[1, 'bee', { y: 5 }]] });
      x = S.run(x, 6, { coins: 4 });
      x = S.goal(x, { deco: 'tree' });
    },
  },
  {
    id: 71, world: 2, noExtend: true, name: 'しおかぜの どうくつ', theme: 'seacave', bgm: 'bgm_2', time: 520,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'crystal' });
      x = S.run(x, 8, {});
      L.hint(x - 4, 'ぶくガニ', 'ふく あわは ふむと はねる。よこから だと おされる');
      x = S.crabs(x, 14, { coins: true });
      x = S.tide(x, 22, { hint: true, walls: [[11, 5]], per: 9 });
      x = S.run(x, 8, { cp: 2 });
      x = S.logs(x, 3, { water: true, hint: true });
      x = S.tide(x, 30, { walls: [[8, 5], [20, 6]], logs: [14], fugu: [[16, 6]], per: 9, phase: 3 });
      x = S.run(x, 8, { cp: 3, en: [[5, 'bukugani']] });
      x = S.tide(x, 28, { walls: [[6, 5], [16, 6]], ledges: [[21, 3, 4]], star: [22, 2], per: 10, phase: 1 });
      x = S.crabs(x, 16, { coins: true, cp: 2 });
      x = S.logs(x, 4, { water: true, star: true });
      x = S.tide(x, 26, { walls: [[12, 6]], fugu: [[6, 6]], star: [12, 3], per: 9, phase: 5 });
      x = S.run(x, 8, { cp: 2, en: [[5, 'bukugani']] });
      x = S.logs(x, 3, { water: true });
      x = S.run(x, 6, { coins: 4 });
      x = S.goal(x, { ch: 'S', deco: 'crystal' });
    },
  },
  {
    id: 72, world: 2, noExtend: true, secretGoal: true, name: 'ゆきだまの さか', theme: 'ice', bgm: 'bgm_1', time: 520,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'tree' });
      x = S.run(x, 8, { fill: 'I' });
      x = S.snowWall(x, { hint: true, ice: true });
      x = S.run(x, 8, { cp: 2, fill: 'I' });
      L.hint(x, 'すべりん と ころりん', 'すべってくる ペンギンと、ゆきだまを ころがす ゆきだるま');
      x = S.snowRun(x, 18, { ice: true, pen: [6], coins: true });
      x = S.tower(x, { ch: 'I', star: true });
      x = S.snowWall(x, { ice: true });
      x = S.gap(x, 3);
      x = S.run(x, 8, { cp: 3, items: [[2, 'h']] });
      x = S.snowRun(x, 16, { pen: [5, 10] });
      x = S.icicles(x, 12, { en: [[8, 'suberin']] });
      // ひみつの かぎ: 高い たなの 上(つららの 先)
      // 2026-10-17 夜: たなが つららの こおりの てんじょう(2〜3行)の すぐ下(5行)で、カギが こおりに めりこみ、たなにも 立てなかった → たなを 7行に さげ、カギは たなの 上
      L.fill(x - 5, x - 2, 7, 7, 'S'); L.hazard(x - 4, 'skey', { y: 6 });
      x = S.snowWall(x, {});
      x = S.gap(x, 7, { star: true, starY: 4 });
      x = S.run(x, 8, { cp: 2, fill: 'I' });
      x = S.snowRun(x, 22, { ice: true, pen: [6, 12], every: 2.6 });
      x = S.power(x, 'A', { en: [[6, 'suberin']] });
      x = S.snowWall(x, { ice: true });
      x = S.spring(x, { star: true });
      x = S.snowRun(x, 14, { pen: [4] });
      x = S.run(x, 6, { coins: 4 });
      // かぎあな(ゴールの 手前の たかい だい)。2026-10-17 夜: コインの 上に だいを かさねて コインが めりこんでいた → だいは コインの 先に
      x = S.run(x, 4);
      L.fill(x - 3, x - 1, 7, 9, 'S'); L.hazard(x - 2, 'keyhole', { y: 3 });
      x = S.goal(x, { deco: 'crystal' });
    },
  },
  {
    id: 73, world: 3, noExtend: true, name: 'トロッコの こうざん', theme: 'mine', bgm: 'bgm_2', time: 480,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.run(x, 8, { en: [[6, 'skeleton']] });
      x = S.cart(x, '........__........o.o.o......___......', { hint: true });
      x = S.run(x, 8, { cp: 2 });
      x = S.fuseWall(x, { hint: true });
      x = S.run(x, 6, { en: [[4, 'bomb']] });
      x = S.cart(x, '.....e.....__....#.....e....___...o*o...__......', {});
      x = S.run(x, 8, { cp: 2, deco: [[5, 'torch']] });
      x = S.tower(x, { ch: 'S', star: true });
      x = S.cart(x, '....__...e..__...#...___..e...__..___.....', { lava: true });
      x = S.run(x, 8, { cp: 2 });
      x = S.fuseWall(x, { star: true });
      x = S.cart(x, '...e...__.#..__..e..___..#...__.....', { lava: true, sp: 470 });
      x = S.run(x, 6, { coins: 4, deco: [[3, 'torch']] });
      x = S.goal(x, { ch: 'S', deco: 'torch' });
    },
  },
  {
    id: 74, world: 4, noExtend: true, name: 'ぴょこぴょこ ブロックの とう', theme: 'crystal', bgm: 'bgm_3', time: 500,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'crystal' });
      x = S.run(x, 8, { coins: 3 });
      x = S.jumpBridge(x, ':: ;; :: ;;', { hint: true });
      L.hint(x - 2, 'いろが ちがう ときは', 'その場で ジャンプすると きりかわる');
      x = S.run(x, 8, { cp: 2, en: [[5, 'goomy']] });
      x = S.jumpWalls(x, 3, {});
      x = S.jumpTower(x, { star: true });
      x = S.run(x, 8, { en: [[5, 'bat', { y: 5 }]] });
      x = S.jumpBridge(x, ':: ;; :: ;; ::', { lava: true });
      x = S.run(x, 8, { cp: 3 });
      x = S.blocks(x, 'B?BAB', { en: [[7, 'skeleton']] });
      x = S.jumpWalls(x, 4, { en: [[6, 'goomy']] });
      x = S.jumpBridge(x, ';; :: ;; :: ;;', { lava: true, rise: true, star: true });
      x = S.run(x, 8, { cp: 2, items: [[2, 'h']] });
      x = S.jumpTower(x, {});
      x = S.windGap(x, 5);
      x = S.jumpBridge(x, ': ; : ; : ; :', { lava: true });
      x = S.tower(x, { ch: 'S', star: true });
      x = S.run(x, 6, { coins: 4 });
      x = S.goal(x, { ch: 'S', deco: 'crystal' });
    },
  },
  {
    id: 75, world: 5, noExtend: true, dark: true, name: 'まっくらの どうくつ', theme: 'cave', bgm: 'bgm_3', time: 520,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      L.hint(x - 6, 'まっくら!', 'ランタンを もって すすもう(C を おしたまま さわる)');
      x = S.darkPath(x, 14, { lantern: 3, flowers: [10], coins: true });
      L.hint(x, 'ひかりの はな', 'さわると ひかって まわりを てらす');
      x = S.darkPath(x, 18, { pits: [[6, 3]], flowers: [4, 11], coins: true });
      x = S.darkPath(x, 10, { cp: 3, deco: [[6, 'torch']] });
      L.hint(x, 'ほたるん', 'ひかる ホタル。真下に いると とびかかってくる');
      x = S.darkPath(x, 22, { pits: [[5, 3], [14, 3]], flowers: [3, 10, 19], flies: [[8, 5], [16, 4]] });
      x = S.darkPath(x, 16, { star: [9, 4], flowers: [6], en: [[12, 'skeleton']] });
      L.fill(x - 9, x - 6, 6, 6, 'S');
      x = S.darkPath(x, 10, { cp: 3, deco: [[2, 'torch']] });
      x = S.darkPath(x, 24, { pits: [[4, 3], [11, 4], [19, 3]], flowers: [9, 17], flies: [[13, 5]], coins: true });
      x = S.fuseWall(x, {});
      x = S.darkPath(x, 10, { cp: 3, lantern: 6 });
      x = S.darkPath(x, 22, { pits: [[6, 4], [15, 3]], flowers: [4, 13, 20], flies: [[10, 4], [18, 5]], en: [[3, 'bat', { y: 6 }]] });
      x = S.tower(x, { ch: 'S', star: true });
      x = S.darkPath(x, 16, { star: [12, 5], flowers: [8], pits: [[4, 3]] });
      L.fill(x - 6, x - 3, 7, 7, 'S');
      x = S.run(x, 6, { coins: 3, deco: [[3, 'torch']] });
      x = S.goal(x, { ch: 'S', deco: 'torch' });
    },
  },
  {
    id: 76, world: 5, noExtend: true, name: 'おもし いわの いせき', theme: 'ruins', bgm: 'bgm_2', time: 520,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'pillar' });
      x = S.run(x, 8, { en: [[6, 'skeleton']] });
      x = S.pushGate(x, { hint: true });
      x = S.run(x, 8, { cp: 2, deco: [[5, 'pillar']] });
      x = S.pushLava(x, { star: true });
      L.hint(x - 14, 'いわを ようがんへ', 'おとすと 足場に なる');
      x = S.run(x, 8, { en: [[5, 'skeleton']] });
      x = S.fuseWall(x, { hint: true });
      x = S.run(x, 8, { cp: 3 });
      x = S.pushGate(x, { en: [[6, 'goomy']] });
      x = S.rocks(x, 14, {});
      x = S.blocks(x, 'S?SvS', { en: [[7, 'skeleton']] });
      x = S.run(x, 8, { cp: 2, items: [[2, 'h']] });
      x = S.pushLava(x, {});
      x = S.fuseWall(x, { star: true });
      x = S.timer(x, 14, { dur: 6 });
      x = S.run(x, 8, { cp: 2 });
      x = S.pushGate(x, { en: [[14, 'skeleton']] });
      x = S.tower(x, { ch: 'S', star: true });
      x = S.run(x, 6, { coins: 4 });
      x = S.goal(x, { ch: 'S', deco: 'pillar' });
    },
  },
  {
    id: 77, world: 6, noExtend: true, secretGoal: true, name: 'ぶらんこの たに', theme: 'jungle', bgm: 'bgm_1', time: 520,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'tree' });
      x = S.run(x, 8, { en: [[6, 'goomy']] });
      x = S.swings(x, 1, { hint: true, safe: true });
      x = S.run(x, 8, { cp: 2 });
      x = S.swings(x, 1, {});
      x = S.run(x, 6, { en: [[4, 'plant']] });
      x = S.swings(x, 2, { star: true });
      x = S.run(x, 8, { cp: 3, deco: [[2, 'tree']] });
      x = S.notes(x, '7 7 7', {});
      x = S.swings(x, 2, { en: [[5, 'bee', { y: 4 }]] });
      x = S.run(x, 8, { cp: 2, items: [[2, 'h']] });
      x = S.seed(x, { star: true });
      // ひみつの かぎ: つるの 上の たな
      L.hazard(x - 6, 'skey', { y: 1 });
      x = S.swings(x, 3, { lava: true });
      x = S.zip(x, 18, {});
      x = S.run(x, 8, { cp: 2, en: [[5, 'spiky']] });
      x = S.swings(x, 2, { lava: true });
      L.hazard(x - 2, 'keyhole', {});
      x = S.tower(x, { star: true });
      x = S.run(x, 6, { coins: 4 });
      x = S.goal(x, { deco: 'tree' });
    },
  },
  {
    id: 78, world: 6, noExtend: true, name: 'あわの たき', theme: 'falls', bgm: 'bgm_2', time: 520,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'tree' });
      x = S.run(x, 8, { coins: 3 });
      x = S.bubbleWall(x, { hint: true, h: 4, cargo: ['', 'coin'] });
      x = S.run(x, 8, { cp: 2 });
      L.hint(x, 'ぶくガニ', 'ふく あわは ふむと はねる。よこから だと おされる');
      x = S.crabs(x, 16, { coins: true });
      x = S.bubbleGap(x, { star: true });
      x = S.run(x, 8, { cp: 3, en: [[5, 'goomy']] });
      x = S.bubbleWall(x, { h: 6, cargo: ['', 'goomy', 'coin'] });
      x = S.notes(x, '7 7 7', {});
      x = S.bubbleGap(x, { cargo: ['coin', '', 'bee'] });
      x = S.run(x, 8, { cp: 2, items: [[2, 'h']] });
      x = S.crabs(x, 18, {});
      x = S.bubbleWall(x, { h: 6, star: true, every: 1.3 });
      x = S.zip(x, 18, {});
      x = S.bubbleGap(x, {});
      x = S.run(x, 8, { cp: 2 });
      x = S.tower(x, { star: true });
      x = S.run(x, 6, { coins: 4 });
      x = S.goal(x, { deco: 'tree' });
    },
  },
  {
    id: 79, world: 7, noExtend: true, name: 'さかさまの とう', theme: 'space', bgm: 'bgm_3', time: 520,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, {});
      x = S.run(x, 8, { coins: 3 });
      x = S.grav(x, 'FCF', { hint: true });
      x = S.run(x, 8, { cp: 2, en: [[5, 'goomy']] });
      x = S.grav(x, 'FCFC', { star: true, starSeg: 1, starY: 4 });
      x = S.run(x, 8, { en: [[5, 'slime']] });
      x = S.moon(x, 2, {});
      x = S.run(x, 8, { cp: 3 });
      x = S.grav(x, 'CFCCF', { star: true, starSeg: 3, starY: 4 });
      x = S.cannon(x, 9, {});
      x = S.run(x, 8, { cp: 2, items: [[2, 'h']] });
      x = S.grav(x, 'FCFCFC', {});
      x = S.tower(x, { ch: 'S', star: true });
      x = S.grav(x, 'CC', {});
      x = S.run(x, 6, { coins: 4 });
      x = S.goal(x, { ch: 'S' });
    },
  },
  {
    id: 80, world: 8, noExtend: true, name: 'からくりの かげとう', theme: 'kagecastle', bgm: 'bgm_3', time: 600,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.run(x, 8, { en: [[6, 'skeleton']] });
      x = S.jumpBridge(x, ':: ;; :: ;;', { lava: true });
      x = S.fuseWall(x, {});
      x = S.run(x, 8, { cp: 2 });
      x = S.swings(x, 2, { lava: true, star: true });
      x = S.grav(x, 'FCF', {});
      x = S.run(x, 8, { cp: 3, en: [[5, 'wizard']] });
      x = S.logs(x, 3, {});
      x = S.pushGate(x, {});
      x = S.cart(x, '....__..e..___..#..__...o*o..___....', { lava: true, ch: 'S' });
      x = S.run(x, 8, { cp: 2, items: [[2, 'h']] });
      x = S.jumpTower(x, { star: true });
      x = S.seesaws(x, 2, { lava: true });
      x = S.bubbleWall(x, { h: 6 });
      x = S.run(x, 6, { coins: 4 });
      x = S.goal(x, { ch: 'S', deco: 'torch' });
    },
  },
  // ===================== おまけの ワールド「ほしの はての にわ」(ほしの みちを ぜんぶ まわると ひらく。むずかしい くみあわせ) =====================
  {
    id: 81, world: 10, noExtend: true, name: 'ほしの はての にわ いち', theme: 'space', music: 'starroad', bgm: 'bgm_3', time: 420,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, {});
      x = S.grav(x, 'FCFCF', { star: true, starSeg: 1, starY: 4 });
      x = S.run(x, 6, { cp: 2 });
      x = S.jumpBridge(x, ':: ;; :: ;; :: ;;', { lava: true, rise: true });
      x = S.swings(x, 2, { lava: true, star: true });
      x = S.run(x, 6, { cp: 2, items: [[3, 'i', 2]] });
      x = S.shells(x, { e3: 'spiky' });
      x = S.jumpTower(x, { star: true });
      x = S.run(x, 6);
      x = S.goal(x, { ch: 'S' });
    },
  },
  {
    id: 82, world: 10, noExtend: true, name: 'ほしの はての にわ に', theme: 'mine', music: 'starroad', bgm: 'bgm_3', time: 420,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.cart(x, '...__..e..___..#..__..e..___...o*o..__.._..#...___....', { lava: true, sp: 480 });
      x = S.run(x, 6, { cp: 2 });
      x = S.logs(x, 4, { star: true });
      x = S.bubbleGap(x, { cargo: ['', 'bee', 'coin'] });
      x = S.run(x, 6, { cp: 2 });
      x = S.fuseWall(x, { star: true });
      x = S.seesaws(x, 3, { lava: true });
      x = S.run(x, 6);
      x = S.goal(x, { ch: 'S', deco: 'torch' });
    },
  },
  {
    id: 83, world: 10, noExtend: true, dark: true, name: 'ほしの はての にわ さん', theme: 'cave', music: 'dark', bgm: 'bgm_3', time: 460,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.darkPath(x, 16, { lantern: 3, flowers: [12], pits: [[7, 3]] });
      x = S.jumpWalls(x, 3, {});
      x = S.darkPath(x, 20, { pits: [[4, 3], [12, 4]], flowers: [2, 10, 17], flies: [[8, 5], [15, 4]], star: [9, 4] });
      L.fill(x - 13, x - 10, 6, 6, 'S');
      x = S.run(x, 6, { cp: 2, deco: [[3, 'torch']] });
      x = S.pushGate(x, {});
      x = S.darkPath(x, 22, { pits: [[5, 3], [13, 3]], flowers: [3, 11, 19], flies: [[9, 4]] });
      x = S.tower(x, { ch: 'S', star: true });
      x = S.darkPath(x, 14, { flowers: [6], star: [10, 5] });
      L.fill(x - 5, x - 3, 7, 7, 'S');
      x = S.run(x, 6, { deco: [[3, 'torch']] });
      x = S.goal(x, { ch: 'S', deco: 'torch' });
    },
  },
  {
    id: 84, world: 10, noExtend: true, name: 'ほしの はての にわ さいご', theme: 'kagecastle', music: 'finalboss', bgm: 'bgm_3', time: 520,
    build(L) {
      const S = sections(L);
      let x = 0;
      x = S.start(x, { deco: 'torch' });
      x = S.tide(x, 24, { walls: [[10, 6]], logs: [5, 16], star: [10, 3], per: 8 });
      x = S.run(x, 6, { cp: 2 });
      x = S.grav(x, 'CFCFC', {});
      x = S.snowWall(x, {});
      x = S.run(x, 6, { cp: 2, items: [[3, 'i', 2]] });
      x = S.swings(x, 2, { lava: true });
      x = S.jumpBridge(x, ': ; : ; : ; :', { lava: true, star: true });
      x = S.bubbleWall(x, { h: 6 });
      x = S.run(x, 6, { cp: 2 });
      x = S.cart(x, '..e..__..#..___..e..__..o*o..___....', { lava: true, sp: 500 });
      x = S.goal(x, { ch: 'S', deco: 'torch' });
    },
  },
  // ばったり バトル: 地図を うろつく 敵に ぶつかると 入る みじかい 面(ワールドに 合わせて 敵と けしきが かわる)
  {
    id: 85, world: 1, noExtend: true, noShards: true, noStars: true, roam: true, name: 'ばったり バトル', theme: 'grass', music: 'boss', bgm: 'bgm_2', time: 200,
    build(L) {
      const S = sections(L);
      const d = L._def, en = EXT_ENEMIES[d.world] || EXT_ENEMIES[1], t = d.roamType || en[0];
      let x = 0;
      x = S.start(x, {});
      x = S.run(x, 22, { coins: 5, en: [[6, t], [10, en[1]], [14, t], [18, en[2]]] });
      x = S.blocks(x, 'B?B?B', { en: [[5, en[3] || t]] });
      x = S.run(x, 10, { items: [[5, 'c']], en: [[3, t]] });
      x = S.goal(x, {});
    },
  },
  // れんしゅうの はらっぱ(はじめて 1-1 に 入る 前。やってみたら 柵が ひらいて つぎへ)
  {
    id: 86, world: 1, noExtend: true, noShards: true, noStars: true, tutorial: true, name: 'れんしゅうの はらっぱ', theme: 'grass', music: 'grass', bgm: 'bgm_1', time: 999,
    build(L) {
      const S = sections(L);
      const gate = (x, n) => { L.fill(x, x, 0, 4, 'S'); L.hazard(x, 'tgate', { n }); };
      const step = (x, w, n, cond, text, sub, subT, arrow, arrowY) => L.hazard(x, 'tstep', { w, n, cond, text, sub, subT, arrow, arrowY });
      let x = 0;
      x = S.start(x, { deco: 'sign' });
      step(x - 8, 14, 1, 'move', 'あるこう', '← → で あるく(ずっと おすと はしる)', '左下の ◀ ▶ で あるく');
      x = S.run(x, 6, { coins: 3 }); gate(x - 1, 1);
      step(x, 12, 2, 'jump', 'ジャンプ', 'スペース・Z・↑ で ジャンプ。ながおしで たかく とぶ', 'みぎ下の「ジャンプ」。ながおしで たかく', x + 5, 6);
      x = S.run(x, 12, {}); L.fill(x - 7, x - 7, 8, 9, 'S'); L.row(x - 8, 6, 'ooo'); gate(x - 1, 2);
      step(x, 12, 3, 'dash', 'ダッシュ', 'ブーツを とって C か Shift で ダッシュ', 'ブーツを とって「ダッシュ」', x + 3, 8);
      x = S.run(x, 12, {}); L.put(x - 9, 9, 'b'); gate(x - 1, 3);
      step(x, 12, 4, 'stomp', 'てきを ふもう', 'てきの 上に おりると たおせる', 'ジャンプして てきの 上に おりる');
      x = S.run(x, 12, { en: [[7, 'goomy']] }); gate(x - 1, 4);
      step(x, 12, 5, 'bump', 'ブロックを たたこう', 'ブロックの 下で ジャンプ。なにかが でてくる', 'ブロックの 下で ジャンプ', x + 6, 4);
      x = S.run(x, 12, {}); L.row(x - 7, 6, 'B?B'); gate(x - 1, 5);
      step(x, 14, 6, 'spin', 'スピンジャンプ', 'V で くるくる。トゲの てきも ふめる', '「スピン」ボタンで くるくる');
      x = S.run(x, 14, { en: [[8, 'spiky']] }); gate(x - 1, 6);
      step(x, 14, 7, 'spinbrk', 'レンガを わろう', 'V の スピンジャンプで レンガの 上に おりると われる', '「スピン」で とんで レンガの 上に おりる', x + 7, 8);
      x = S.run(x, 14, {}); L.row(x - 8, 10, 'BBB'); L.row(x - 8, 11, '###'); L.row(x - 8, 9, 'ooo'); gate(x - 1, 7);
      // 2026-10-18 ヒップドロップを もどした(持ち主「やっぱ 欲しい」)
      step(x, 14, 8, 'hip', 'ヒップドロップ', 'くうちゅうで ↓。ずしんと おちて レンガを わる・てきに つよい いちげき', 'ジャンプして ▼(下へ スワイプでも)。ずしんと おちる', x + 7, 7);
      x = S.run(x, 14, { en: [[10, 'goomy']] }); L.row(x - 8, 10, 'BB'); L.row(x - 8, 11, '##'); L.row(x - 8, 9, 'oo'); gate(x - 1, 8);
      step(x, 14, 9, 'shard', 'ほしの かけら', '1つの ステージに 5まい。たかい ところを さがそう', '1つの ステージに 5まい', x + 8, 4);
      x = S.run(x, 14, {}); L.fill(x - 9, x - 4, 7, 7, 'S'); L.put(x - 6, 5, '@'); L.row(x - 12, 9, 'S'); gate(x - 1, 9);
      L.hint(x, 'これで れんしゅうは おしまい!', 'ゴールの はたへ。あとは ぼうけんで おぼえよう');
      x = S.run(x, 6, { coins: 3 });
      x = S.goal(x, { deco: 'tree' });
    },
  },
];

// ---------- 面を のばす(2026-10-12 夜: 持ち主「もうちょっと1ステージ長めでも」) ----------
// ふつうの面は ゴールの前に 約105マス、ボスの面は ボス部屋の前に 約60マスの「つづきの区間」を足す。
// 区間は その面の id から 決まる 乱数で、そのワールドの しかけと 前のワールドの しかけを まぜて 組む(同じ しかけは 2回まで・続けて 同じ物は 出さない)。
// はじめに 中間ポイント、60マスを こえたら もう1つ 中間ポイント。星は 足さない(星は 3つの まま)。ひみつの面は のばさない。
function extRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const EXT_ENEMIES = {
  1: ['goomy', 'shell', 'slime', 'goomy', 'mogura'], 2: ['slime', 'skeleton', 'bat', 'shell', 'goomy'], 3: ['beetle', 'skeleton', 'bomb', 'firespirit', 'nageko'],
  4: ['skeleton', 'goomy', 'bomb', 'beetle', 'mogura'], 5: ['skeleton', 'bomb', 'slime', 'beetle', 'nageko'], 6: ['goomy', 'slime', 'shell', 'spiky', 'nageko'],
  7: ['spiky', 'skeleton', 'slime', 'beetle', 'mogura'], 8: ['skeleton', 'bomb', 'spiky', 'beetle', 'nageko', 'mogura'], 9: ['spiky', 'skeleton', 'bomb', 'nageko', 'mogura', 'beetle'],
};
const EXT_FLYERS = { 1: 'bee', 2: 'eye', 3: 'bee', 4: 'bat', 5: 'ghost', 6: 'bee', 7: 'bat', 8: 'ghost' };
function extActs(S, wn, top, R, e1, fly) {
  const pick = a => a[Math.floor(R() * a.length)];
  const ch = top === 10 ? (['S', 'M', 'D', 'I'][wn % 4]) : 'S';
  const generic = [
    ['run', x => S.run(x, 9 + Math.floor(R() * 5), { top, coins: 3 + Math.floor(R() * 3), en: [[4, e1()], [8, e1()]] })],
    ['gap', x => S.gap(x, 3 + Math.floor(R() * 2), { plank: R() < 0.4 ? 2 : 0, coins: 3 })],
    ['blocks', x => S.blocks(x, pick(['B?B?B', 'B?BBB', '??B??', 'B?B']), { top, en: [[R() < 0.5 ? 6 : 5, e1()]], coins: 3 })],
    ['movers', x => S.movers(x, 2, { top, kind: R() < 0.5 ? 'lift' : 'move' })],
    ['fallers', x => S.fallers(x, 3, { top })],
    ['spring', x => S.spring(x, { top })],
    ['fly', x => S.run(x, 10, { top, en: [[5, fly, { y: top - 4 }]], coins: 4 })],
  ];
  // 第4段階の しかけ(どの ワールドにも 少しずつ)。しんでんの 色は その ワールドまでに ある しんでん
  const pal = wn >= 6 ? ['y', 'g', 'b', 'p'] : wn >= 4 ? ['y', 'g', 'b'] : wn >= 2 ? ['y', 'g'] : ['y'];
  const smw = top === 10 ? [
    ['turn', x => S.turn(x, { top })],
    ['throwRun', x => S.throwRun(x, { top, en: [[9, e1()], [11, e1()], [13, e1()]] })],
    ['shells', x => S.shells(x, { top, coins: true, e3: e1() })],
    ['palace', x => S.palaceRoute(x, pick(pal), { top })],
    ['pswitch', x => S.pswitch(x, { top })],
    ['rail', x => S.rail(x, 14, { top })],
    ['well', x => S.well(x, { top })],
    ['egg', x => S.egg(x, { top })],
    ['cape', x => S.capeBox(x, { top })],
    ['kumo', x => S.run(x, 12, { top, en: [[4, 'kumo', { top: 2, drop: top - 3 }], [9, 'kumo', { top: 2, drop: top - 3 }]], coins: 4 })],
  ] : [['turn', x => S.turn(x, { top })], ['shells', x => S.shells(x, { top, coins: true, e3: e1() })]];
  const W = {
    1: [['tramp', x => S.tramp(x, { top })], ['tower', x => S.tower(x, { top, ch })], ['chest', x => S.chest(x, { top, ch: 'S' })], ['seesaws', x => S.seesaws(x, 2, { top })], ['tubeUp', x => S.tubeUp(x, { top })]],
    2: [['icicles', x => S.icicles(x, 12, { top })], ['shaft', x => S.shaft(x, { top, ch: 'I' })], ['firebars', x => S.firebars(x, 12, 2, { top })], ['bubbles', x => S.bubbles(x, 3, { top })], ['snowWall', x => S.snowWall(x, { top })], ['logsW', x => S.logs(x, 2, { top, water: true })]],
    3: [['updraft', x => S.updraft(x, { top })], ['conveyor', x => S.conveyor(x, 12, R() < 0.5 ? 1 : -1, { top, en: [[6, e1()]] })], ['zappers', x => S.zappers(x, 3, { top })], ['saws', x => S.saws(x, 12, { top, coins: true })], ['crushers', x => S.crushers(x, 3, { top, coins: true })], ['cart', x => S.cart(x, '.....__.....e....__.....', { top })], ['pushGate', x => S.pushGate(x, { top })]],
    4: [['windRun', x => S.windRun(x, 12, R() < 0.5 ? 1 : -1, { top, v: 140, coins: 4, en: [[7, e1()]] })], ['windGap', x => S.windGap(x, 5, { top })], ['swGate', x => S.swGate(x, { top })], ['swBridge', x => S.swBridge(x, { top })], ['warpWall', x => S.warpWall(x, { top })], ['warpUp', x => S.warpUp(x, { top })], ['jumpBridge', x => S.jumpBridge(x, ':: ;; ::', { top })], ['jumpWalls', x => S.jumpWalls(x, 2, { top })]],
    5: [['rocks', x => S.rocks(x, 14, { top, coins: 4 })], ['blink', x => S.blink(x, pick(['S33S44S', 'S333S', 'S44S33S']), { top })], ['timer', x => S.timer(x, 14, { top, dur: 6 })], ['timerCage', x => S.timerCage(x, { top })], ['blinkTower', x => S.blinkTower(x, { top })], ['fuseWall', x => S.fuseWall(x, { top })], ['pushLava', x => S.pushLava(x, { top })]],
    6: [['seed', x => S.seed(x, { top })], ['zip', x => S.zip(x, 16, { top })], ['notes', x => S.notes(x, '7 7 7', { top })], ['noteCliff', x => S.noteCliff(x, { top })], ['swings', x => S.swings(x, 2, { top })], ['bubbleWall', x => S.bubbleWall(x, { top, h: 5 })]],
    7: [['moon', x => S.moon(x, 2, { top })], ['cannon', x => S.cannon(x, 9, { top })], ['comets', x => S.comets(x, 16, { top, coins: 4 })], ['cannonUp', x => S.cannonUp(x, { top })], ['grav', x => S.grav(x, 'FCF', { top })]],
    8: [['wheel', x => S.wheel(x, { top })], ['bridge', x => S.bridge(x, 7, { top })], ['shadowRun', x => S.shadowRun(x, 18, { top })], ['jumpBridgeL', x => S.jumpBridge(x, ':: ;; ::', { top, lava: true })], ['logsL', x => S.logs(x, 3, { top })]],
  };
  // ここの しかけ(いまの ワールド)と、1つ前の ワールドの しかけ
  const own = (W[wn] || []).map(a => [...a, 3]);
  const prev = (W[wn - 1] || []).map(a => [...a, 1]);
  return { own, prev, generic: generic.map(a => [...a, 2]), smw: smw.map(a => [...a, a[0] === 'egg' || a[0] === 'cape' || a[0] === 'well' ? 0.7 : 1.4]) };
}
function extendLevel(S, L, def, x, top) {
  const R = extRng(def.id * 7919 + 17);
  const wn = def.world;
  const en = EXT_ENEMIES[wn] || EXT_ENEMIES[1];
  const e1 = () => en[Math.floor(R() * en.length)];
  // 面の上の高さが 低い(上が せまい)面は 地面の しかけだけ
  const acts = extActs(S, wn, top, R, e1, EXT_FLYERS[wn] || 'bee');
  let pool = top === 10 ? [...acts.own, ...acts.prev, ...acts.generic, ...acts.smw] : [...acts.generic.filter(a => !['fallers'].includes(a[0])), ...acts.smw];
  const target = def.boss ? 60 : 105;
  const start = x;
  x = S.run(x, 9, { top, cp: 2, en: [[7, e1()]] });
  let last = '', cp2 = false;
  const used = {};
  while (x - start < target) {
    const cand = pool.filter(a => a[0] !== last && (used[a[0]] || 0) < (['egg', 'cape', 'well', 'palace', 'pswitch'].includes(a[0]) ? 1 : 2));
    const tot = cand.reduce((s, a) => s + a[2], 0);
    let r = R() * tot, a = cand[0];
    for (const c of cand) { r -= c[2]; if (r <= 0) { a = c; break; } }
    used[a[0]] = (used[a[0]] || 0) + 1; last = a[0];
    x = a[1](x);
    // しかけの あとには かならず 少し 地面(穴が 2つ つながらないように)
    if (!cp2 && x - start > 60) { x = S.run(x, 7, { top, cp: 3 }); cp2 = true; }
    else x = S.run(x, 3 + Math.floor(R() * 3), { top });
  }
  return x;
}

// ---------- 今日の1面(2026-10-13): 日本の 日づけ(UTC+9)から みんな 同じ 1面を 組む ----------
// 日づけの 文字(YYYY-MM-DD)を ハッシュして 乱数の たねに する。#1 は 2026-10-14。
// しかけは はじめの ワールドで 出てくる 物だけ(力・カギ・ワープ・水・ボス・ひみつ なし)。区画は 8〜11こ、星は 3つ、中間は 1つ。
// 区画ごとの はんい(マス)は def._secs に のこす(ゲームの 方で ダメージ・やられた 場所を しらべる)。
const DAILY_ID = 900, DAILY_EPOCH = '2026-10-14';
function dailyToday(ms) { return new Date((ms === undefined ? Date.now() : ms) + 9 * 3600000).toISOString().slice(0, 10); }
function dailyNum(ds) { return Math.round((Date.parse(ds + 'T00:00:00Z') - Date.parse(DAILY_EPOCH + 'T00:00:00Z')) / 86400000) + 1; }
function dailyHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
// 試験用: 日づけを きめうち できる(null なら 今日)
let DAILY_DATE = null;
const dailyDate = () => DAILY_DATE || dailyToday();
const DAILY_THEMES = [
  { theme: 'grass', deco: ['tree', 'fence'] }, { theme: 'sky' }, { theme: 'ice' }, { theme: 'sand' }, { theme: 'night' },
  { theme: 'jungle', deco: ['tree'] }, { theme: 'falls', deco: ['tree'] }, { theme: 'dusk' }, { theme: 'ruins' }, { theme: 'cave', deco: ['torch', 'crystal'] },
];
function buildDaily(L, ds) {
  const S = sections(L);
  const R = extRng(dailyHash('haru-daily:' + ds));
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const pick = a => a[Math.floor(R() * a.length)];
  const th = DAILY_THEMES[Math.floor(R() * DAILY_THEMES.length)];
  const e1 = () => pick(['goomy', 'goomy', 'slime', 'goomy', 'slime']);
  const deco = () => (th.deco ? [[1, pick(th.deco)]] : []);
  // 区画: [おもさ, 1面に いくつまで, 組み立て(x) → つぎの x]。星の 区画は 星を 1つ 置く
  const K = {
    field: [3, 3, x => S.run(x, ri(10, 13), { coins: ri(3, 5), en: [[ri(4, 6), e1()]].concat(R() < 0.5 ? [[ri(8, 9), e1()]] : []), deco: deco() })],
    pits: [2, 2, x => { x = S.run(x, 3); x = S.gap(x, ri(2, 3), { coins: 3 }); x = S.run(x, 4, { en: R() < 0.4 ? [[2, 'goomy']] : [] }); x = S.gap(x, ri(3, 4), { coins: 4, coinY: 6 }); return S.run(x, 3); }],
    plank: [2, 2, x => { x = S.run(x, 3); x = S.gap(x, 5, { plank: 2 }); x = S.run(x, 4, { coins: 0 }); x = S.gap(x, 3, { coins: 3 }); return S.run(x, 3); }],
    blocks: [2, 2, x => { x = S.blocks(x, pick(['?B?B?', 'B?B?B', 'B??B', '?BBB?']), { en: [[ri(5, 6), e1()]], coins: 3 }); return S.run(x, 3); }],
    flyers: [2, 2, x => S.run(x, ri(11, 13), { coins: 4, en: [[5, ...(R() < 0.5 ? ['bee', { y: 6 }] : ['goomy', { v: 'para' }])], [10, 'goomy']], deco: deco() })],
    fallers: [1, 1, x => { x = S.run(x, 3); x = S.fallers(x, 3); return S.run(x, 3); }],
    crushers: [1, 1, x => { x = S.run(x, 2); x = S.crushers(x, ri(2, 3), { coins: true }); return S.run(x, 2); }],
    firebars: [1, 1, x => { x = S.firebars(x, 12, 1, { speed: 1.5, en: [[9, 'goomy']] }); return S.run(x, 2); }],
    saws: [1, 1, x => { x = S.run(x, 2); x = S.saws(x, 12); return S.run(x, 2); }],
  };
  const STAR = {
    spring: x => { x = S.spring(x, { star: true }); return S.run(x, 2); },
    tramp: x => { x = S.tramp(x, { star: true }); return S.run(x, 2); },
    tower: x => { x = S.tower(x, { star: true, h: ri(4, 5), ch: th.theme === 'ice' ? 'I' : 'S' }); return S.run(x, 2); },
    movers: x => { x = S.run(x, 2); x = S.movers(x, 2, { star: true, kind: R() < 0.5 ? 'lift' : 'move' }); return S.run(x, 3); },
  };
  const n = ri(8, 11);
  // 星の 区画は 前・まん中・うしろ に 1つずつ
  const third = n / 3;
  const starAt = new Set([ri(1, Math.max(1, Math.floor(third) - 1)), ri(Math.ceil(third), Math.floor(2 * third) - 1), ri(Math.ceil(2 * third), n - 1)]);
  const used = {};
  const secs = [];
  let x = S.start(0, { deco: 'sign' }), last = '';
  const mid = Math.floor(n / 2);
  const starKinds = Object.keys(STAR);
  for (let i = 0; i < n; i++) {
    const x0 = i === 0 ? 0 : x;
    if (i === mid) x = S.run(x, 6, { cp: 3, coins: 2 });
    let kind;
    if (starAt.has(i)) {
      const c = starKinds.filter(k => k !== last && !used[k]);
      kind = pick(c.length ? c : starKinds);
      x = STAR[kind](x);
    } else {
      const easy = i === 0 ? ['field', 'blocks', 'flyers'] : null;
      const cand = Object.keys(K).filter(k => k !== last && (used[k] || 0) < K[k][1] && (!easy || easy.includes(k)));
      const tot = cand.reduce((s, k) => s + K[k][0], 0);
      let r = R() * tot; kind = cand[0];
      for (const k of cand) { r -= K[k][0]; if (r <= 0) { kind = k; break; } }
      x = K[kind][2](x);
    }
    used[kind] = (used[kind] || 0) + 1; last = kind;
    secs.push({ kind, x0, x1: x });
  }
  // みじかすぎる 日は さいごの 区画の あとに 少し 道を たす(120マス より 長く)
  if (x + 14 < 120) x = S.run(x, 120 - 14 - x, { coins: 3 });
  x = S.goal(x, { deco: th.deco ? th.deco[0] : undefined });
  secs[secs.length - 1].x1 = x;
  return { theme: th.theme, secs, W: x };
}
LEVELS.push({
  id: DAILY_ID, world: 1, num: '✦', daily: true, noExtend: true, noShards: true, noStars: true, name: '', label: '今日の1面', theme: 'grass', bgm: 'bgm_1', time: 600,
  build(L) {
    const d = L._def;
    // 中間から やりなおす ときは 同じ 日の 面(夜中の 12時を またいでも かわらない)
    const ds = d._keepDate && d._date ? d._date : dailyDate();
    const r = buildDaily(L, ds);
    d._date = ds; d._num = dailyNum(ds); d._secs = r.secs; d.theme = r.theme; d.name = '#' + d._num;
  },
});

LEVELS.forEach(d => { const b = d.build; d.build = L => { L._def = d; b(L); (L._post || []).forEach(f => f()); }; });
// 面の ならびは id の 順(試験の 道具は「id = 番号」で 面を えらぶ)
LEVELS.sort((p, q) => p.id - q.id);
