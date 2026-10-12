'use strict';
// らくがき百鬼夜行: 描いたおばけが、ハロウィンの夜の商店街を練り歩く
// 絵はすべて assets/ の PNG。同じファイル名で置き換えればそのまま差し替わる。

const CFG = {
  SHARE_URL: 'https://yurustudio.github.io/rakugaki/', // 公開したら本番の URL を入れる(空ならこのページの URL)
  TAGS: '#らくがき百鬼夜行ゲーム #ハロウィン2026',
  STORE_KEY: 'rakugaki_hyakki_v1',
  GHOST_SIZE: 270,       // おばけの大きさ(世界の単位、画面の高さ=1000)
  ROUTE_START: 250,
  ROUTE_END: 3450,
  SPEED: 160,            // 1秒に進む量 → 約20秒で一周
  START_DELAY: 1.0,
  FINALE_SEC: 2.6,
};
const FONT = '"Hiragino Maru Gothic ProN","Hiragino Sans","BIZ UDPGothic","Yu Gothic UI","Meiryo",sans-serif';

// ---------- 乱数(?seed= で固定できる) ----------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const params = new URLSearchParams(location.search);
let rand = mulberry32(params.has('seed') ? Number(params.get('seed')) : (Date.now() & 0xffffffff));
function hash3(a, b, c) { let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// ---------- 絵の読み込み ----------
const ASSET_NAMES = ['bg_sky', 'bg_far', 'bg_street_1', 'bg_street_2', 'bg_street_3', 'lantern', 'pumpkin', 'pumpkin_surprised',
  'cat', 'cat_surprised', 'kid', 'kid_surprised', 'granny', 'granny_give', 'candy_1', 'candy_2', 'candy_3', 'goal_gate'];
const IMG = {};
function loadAssets() {
  return Promise.all(ASSET_NAMES.map(n => new Promise(res => {
    const im = new Image();
    im.onload = () => { IMG[n] = im; res(); };
    im.onerror = () => { IMG[n] = null; res(); };
    im.src = 'assets/' + n + '.png';
  })));
}
function drawImgH(ctx, im, cx, bottom, h, flip, alpha) {
  if (!im) return;
  const w = h * im.naturalWidth / im.naturalHeight;
  ctx.save();
  if (alpha != null) ctx.globalAlpha = alpha;
  ctx.translate(cx, bottom);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(im, -w / 2, -h, w, h);
  ctx.restore();
}

// ---------- 道具 ----------
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function smoothPath(ctx, pts) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 2) { ctx.lineTo(pts[1][0], pts[1][1]); return; }
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const l = pts[pts.length - 1]; ctx.lineTo(l[0], l[1]);
}
function convexHull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---------- 描いた絵 → おばけ ----------
// strokes: [{c: '#fff', w: 12, p: [[x,y],...]}] (描く板の 600x600 の座標)
class Ghost {
  constructor(strokes, size) {
    this.strokes = strokes;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of strokes) for (const [x, y] of s.p) {
      x0 = Math.min(x0, x - s.w / 2); y0 = Math.min(y0, y - s.w / 2); x1 = Math.max(x1, x + s.w / 2); y1 = Math.max(y1, y + s.w / 2);
    }
    const bw = Math.max(40, x1 - x0), bh = Math.max(40, y1 - y0);
    const k = size / Math.max(bw, bh);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    this.w = bw * k; this.h = bh * k;
    this.parts = strokes.map(s => ({
      c: s.c,
      w: clamp(s.w * k, 4, 22),
      p: s.p.map(([x, y]) => [(x - cx) * k, (y - cy) * k, (x - x0) / bw, (y - y0) / bh]),
    }));
    const all = [];
    for (const s of strokes) for (const q of s.p) all.push(q);
    this.hull = convexHull(all).map(([x, y]) => [(x - cx) * k, (y - cy) * k, (x - x0) / bw, (y - y0) / bh]);
  }
  // 1点を「生きているように」ゆらす: すその波・呼吸・線のふるえ(1秒に8回描き直す手描きアニメの揺れ)
  deform(pt, t, i, j, phase) {
    const [x, y, u, v] = pt;
    const breath = Math.sin(t * 2.4 + phase);
    const sx = 1 + 0.035 * breath, sy = 1 - 0.035 * breath;
    const skirt = v * v;
    let nx = x * sx + Math.sin(t * 5.2 + v * 7 + u * 2.5 + phase) * 15 * skirt;
    let ny = y * sy + Math.sin(t * 3.1 + u * 6 + phase) * 5 * skirt;
    const step = Math.floor(t * 8);
    nx += (hash3(i, j, step) - 0.5) * 4.4;
    ny += (hash3(j + 977, i, step) - 0.5) * 4.4;
    return [nx, ny];
  }
  // cx, bottom: 世界の座標(足もと)。o: {S, flip, rot, sx, sy, phase, alpha, glow}
  draw(ctx, t, cx, bottom, o) {
    const S = o.S || 1;
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.translate(cx, bottom - this.h * S / 2);
    ctx.rotate(o.rot || 0);
    ctx.scale((o.flip || 1) * (o.sx || 1) * S, (o.sy || 1) * S);
    const ph = o.phase || 0;
    // 半透明のからだ
    if (this.hull.length >= 3) {
      const hp = this.hull.map((q, i) => this.deform(q, t, i, 4242, ph));
      hp.push(hp[0]);
      ctx.beginPath(); smoothPath(ctx, hp); ctx.closePath();
      ctx.fillStyle = 'rgba(235,230,255,0.13)';
      ctx.fill();
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const glow = (o.glow || 1);
    for (let j = 0; j < this.parts.length; j++) {
      const s = this.parts[j];
      ctx.shadowColor = s.c; ctx.shadowBlur = 12 * glow;
      ctx.strokeStyle = s.c; ctx.fillStyle = s.c; ctx.lineWidth = s.w;
      const pts = s.p.map((q, i) => this.deform(q, t, i, j, ph));
      ctx.beginPath();
      if (pts.length === 1) { ctx.arc(pts[0][0], pts[0][1], s.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else { smoothPath(ctx, pts); ctx.stroke(); }
    }
    ctx.restore();
  }
}

// ---------- 世界 ----------
const WORLD = {
  streetTop: 180, streetH: 820,
  farTop: 120, farH: 540,
  groundY: 965,
  lanternY: 200, lanternGap: 280, lanternH: 100,
};
function streetTileW(i) {
  const im = IMG['bg_street_' + (((i % 3) + 3) % 3 + 1)];
  return im ? WORLD.streetH * im.naturalWidth / im.naturalHeight : 1230;
}
const WORLD_END = () => streetTileW(0) + streetTileW(1) + streetTileW(2);

let S = null; // パレードの状態
function newParadeState(ghost, followers) {
  const st = {
    t: 0, ghost, followers, x: CFG.ROUTE_START, candies: 0, mode: 'parade',
    drawScore: 0, surprised: 0, events: [], done: {}, bubbles: [], flights: [], parts: [], banner: null,
    hopT: -9, startleT: -9, turns: [], finaleT: null,
    lanterns: [], kid: { x: 2650, state: 'walk', t0: 0, flip: false },
  };
  for (let x = 140; x < 3700; x += WORLD.lanternGap) st.lanterns.push({ x: x + WORLD.lanternGap / 2, a: 0, v: 0, lit: 0 });
  // 振り向く時刻(後ろの子がいる時は振り返って見る)
  st.turns.push(followers.length ? 5.5 : 7.0);
  st.turns.push(15.5);
  return st;
}
function idleState() {
  const st = newParadeState(null, []);
  st.mode = 'idle';
  for (const l of st.lanterns) l.lit = 0.35;
  return st;
}

function drawScoreFor(strokes) {
  let ink = 0; const colors = new Set();
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const s of strokes) {
    colors.add(s.c);
    for (let i = 0; i < s.p.length; i++) {
      const [x, y] = s.p[i];
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      if (i) ink += Math.hypot(x - s.p[i - 1][0], y - s.p[i - 1][1]);
    }
  }
  const cover = ((x1 - x0) * (y1 - y0)) / (600 * 600);
  return clamp(18 + Math.min(25, ink / 90) + Math.min(14, strokes.length * 1.5) + colors.size * 5 + Math.min(10, cover * 16) + rand() * 16, 5, 95);
}

// ---------- 出来事 ----------
const EVENTS = [
  { id: 'pumpkin', at: 800, who: 'かぼちゃ', scary: 'ひゃっ!', cute: 'かぼちゃの仲間?', candy: [2, 1] },
  { id: 'cat', at: 1460, who: '黒猫', scary: 'シャーッ!', cute: 'ニャ〜ン', candy: [0, 0] },
  { id: 'kid', at: 0, who: '仮装の子', scary: 'でたーっ!', cute: 'かわいい!', candy: [2, 1] },
  { id: 'granny', at: 2750, who: 'お菓子屋のおばあちゃん', scary: 'お菓子あげるから…!', cute: 'まあ、かわいいこと', candy: [1, 2] },
];
const NPC = { pumpkin: { x: 950, h: 150 }, cat: { x: 1620, h: 112 }, granny: { x: 2950, h: 270 }, kid: { h: 240 } };

function ghostScreenY(st, t) { return 905 + Math.sin(t * 2.2) * 16; }

function triggerEvent(st, ev) {
  st.done[ev.id] = st.t;
  const scary = rand() * 100 < st.drawScore + 5;
  if (scary) st.surprised++;
  st.events.push({ id: ev.id, scary });
  const npc = npcPos(st, ev.id);
  st.bubbles.push({ text: scary ? ev.scary : ev.cute, x: npc.x, y: npc.top - 20, t0: st.t, dur: 1.8 });
  const n = ev.candy[scary ? 0 : 1];
  for (let i = 0; i < n; i++) st.flights.push({ img: 'candy_' + (1 + Math.floor(rand() * 3)), x0: npc.x, y0: npc.top + 30, t0: st.t + 0.35 + i * 0.3, dur: 0.75 });
  if (ev.id === 'cat') { st.startleT = st.t; if (!st.turns.some(x => Math.abs(x - st.t) < 2)) st.turns.push(st.t + 0.25); }
  if (ev.id === 'kid') { st.kid.state = scary ? 'flee' : 'wave'; st.kid.t0 = st.t; }
}
function npcPos(st, id) {
  if (id === 'kid') return { x: st.kid.x, top: WORLD.groundY - NPC.kid.h };
  const n = NPC[id];
  return { x: n.x, top: WORLD.groundY - n.h };
}

function update(st, dt) {
  st.t += dt;
  const t = st.t;
  // 提灯: ばねで揺れる。おばけが近づくと灯りが強くなる
  for (const l of st.lanterns) {
    if (st.mode !== 'idle' && st.x > l.x - 90 && l.lit < 1) { if (l.lit < 0.5) l.v += 2.6; l.lit = Math.min(1, l.lit + dt * 4); }
    const acc = -30 * l.a - 2.2 * l.v + Math.sin(t * 1.3 + l.x) * 0.6;
    l.v += acc * dt; l.a += l.v * dt;
  }
  if (st.mode === 'idle') return;
  if (st.mode === 'parade') {
    if (t > CFG.START_DELAY) st.x = Math.min(CFG.ROUTE_END, st.x + CFG.SPEED * dt);
    // 仮装の子: 近づいてくる→驚く(逃げる)か手をふる
    const k = st.kid;
    if (k.state === 'walk' && st.x > 1700) k.x -= 45 * dt;
    if (k.state === 'flee' && t - k.t0 > 0.9) { k.x += 420 * dt; k.flip = true; }
    if (k.state === 'wave' && t - k.t0 > 1.4) { k.x -= 40 * dt; }
    for (const ev of EVENTS) {
      if (st.done[ev.id] != null) continue;
      const at = ev.id === 'kid' ? k.x - 230 : ev.at;
      if (st.x >= at) triggerEvent(st, ev);
    }
    if (st.x >= 3250 && st.finaleT == null) {
      st.finaleT = t;
      st.banner = { text: 'パレード大成功!', t0: t };
      for (let i = 0; i < 90; i++) {
        const cols = ['#ff9a3c', '#ffd25c', '#b07cff', '#7ee081', '#ff6f91', '#ffffff'];
        st.parts.push({ x: st.x + (rand() - 0.5) * 300, y: 300 + rand() * 100, vx: (rand() - 0.5) * 420, vy: -rand() * 520 - 200, c: cols[Math.floor(rand() * cols.length)], r: rand() * 6, t0: t, life: 2.4 });
      }
    }
    if (st.finaleT != null && t - st.finaleT > CFG.FINALE_SEC) st.mode = 'end';
  }
  // お菓子が飛んでくる
  for (const f of st.flights) {
    if (!f.got && t >= f.t0 + f.dur) { f.got = true; st.candies++; st.hopT = t; onCandy(st.candies); }
  }
  for (const p of st.parts) { p.vy += 700 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  st.parts = st.parts.filter(p => t - p.t0 < p.life);
}

function turnFlip(st, t) {
  for (const t0 of st.turns) {
    const p = (t - t0) / 1.1;
    if (p < 0 || p > 1) continue;
    if (p < 0.18) return Math.cos(p / 0.18 * Math.PI);
    if (p < 0.82) return -1;
    return Math.cos((1 - (p - 0.82) / 0.18) * Math.PI);
  }
  return 1;
}
// おばけの姿勢(本体・後ろの子どちらも)
function ghostPose(st, t) {
  const appear = clamp(t / 0.7, 0, 1);
  let S0 = st.mode === 'parade' || st.mode === 'end' ? easeOutBack(appear) : 1;
  const hop = t - st.hopT < 0.6 ? Math.sin((t - st.hopT) / 0.6 * Math.PI) : 0;
  const startle = t - st.startleT < 0.5 ? (1 - (t - st.startleT) / 0.5) : 0;
  const moving = t > CFG.START_DELAY && st.x < CFG.ROUTE_END;
  return {
    S: Math.max(0.01, S0) * (1 + startle * 0.12),
    flip: turnFlip(st, t),
    rot: Math.sin(t * 1.7) * 0.075 + (moving ? 0.05 : 0) + hop * 0.12 * Math.sin(t * 9),
    sx: 1 - hop * 0.1, sy: 1 + hop * 0.14,
    dx: startle * Math.sin(t * 70) * 9,
    dy: -hop * 55 - startle * 20,
  };
}

// ---------- 描画 ----------
// cam: {x, y, s} 世界の (x,y) が画面の左上、s = 画面の px/世界の単位
function render(ctx, W, H, st, cam, opt) {
  opt = opt || {};
  const t = st.t;
  ctx.save();
  ctx.fillStyle = '#1c1640'; ctx.fillRect(0, 0, W, H);
  // 夜空(画面に固定・覆うように)
  const sky = IMG.bg_sky;
  if (sky) {
    const k = Math.max(W / sky.naturalWidth, H / sky.naturalHeight);
    ctx.drawImage(sky, (W - sky.naturalWidth * k) / 2, (H - sky.naturalHeight * k) / 2, sky.naturalWidth * k, sky.naturalHeight * k);
  }
  ctx.scale(cam.s, cam.s);
  ctx.translate(-cam.x, -cam.y);
  const viewW = W / cam.s;
  // 遠くの屋根(ゆっくり動く・左右反転を交互に並べてつなぎ目を消す)
  const far = IMG.bg_far;
  if (far) {
    const fw = WORLD.farH * far.naturalWidth / far.naturalHeight;
    const par = 0.45, base = cam.x * par;
    const i0 = Math.floor((cam.x - base) / fw) - 1;
    for (let i = i0; i < i0 + Math.ceil(viewW / fw) + 3; i++) {
      const x = base + i * fw;
      ctx.save(); ctx.translate(x + fw / 2, WORLD.farTop);
      if (i & 1) ctx.scale(-1, 1);
      ctx.drawImage(far, -fw / 2, 0, fw, WORLD.farH); ctx.restore();
    }
  }
  // 商店街(3枚を順に並べ、先はくり返す)
  {
    let x = 0, i = 0;
    while (x > cam.x) { i--; x -= streetTileW(i); }
    while (x < cam.x + viewW) {
      const w = streetTileW(i);
      if (x + w > cam.x) { const im = IMG['bg_street_' + (((i % 3) + 3) % 3 + 1)]; if (im) ctx.drawImage(im, x, WORLD.streetTop, w + 1, WORLD.streetH); }
      x += w; i++;
    }
  }
  // 提灯のひも
  ctx.strokeStyle = 'rgba(40,24,30,0.9)'; ctx.lineWidth = 3;
  ctx.beginPath();
  const g = WORLD.lanternGap;
  const sx0 = Math.floor(cam.x / g) * g - g;
  for (let x = sx0; x < cam.x + viewW + g; x += g) {
    ctx.moveTo(x, WORLD.lanternY - 30); ctx.quadraticCurveTo(x + g / 2, WORLD.lanternY + 50, x + g, WORLD.lanternY - 30);
  }
  ctx.stroke();
  for (const l of st.lanterns) {
    if (l.x < cam.x - 100 || l.x > cam.x + viewW + 100) continue;
    if (l.lit > 0) {
      const rg = ctx.createRadialGradient(l.x, WORLD.lanternY + 55, 5, l.x, WORLD.lanternY + 55, 150);
      rg.addColorStop(0, `rgba(255,170,70,${0.55 * l.lit})`); rg.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = rg; ctx.fillRect(l.x - 150, WORLD.lanternY - 95, 300, 300);
    }
    ctx.save(); ctx.translate(l.x, WORLD.lanternY + 10); ctx.rotate(l.a * 0.25);
    drawImgH(ctx, IMG.lantern, 0, WORLD.lanternH, WORLD.lanternH, false, 0.7 + 0.3 * l.lit);
    ctx.restore();
  }
  // 出口のアーチ
  drawImgH(ctx, IMG.goal_gate, 3300, 995, 760);
  // 商店街の人たち
  const jump = (id) => { const d = st.done[id]; if (d == null) return 0; const p = (t - d) / 0.5; return p > 0 && p < 1 ? Math.sin(p * Math.PI) * 40 : 0; };
  const shake = (id) => { const d = st.done[id]; if (d == null) return 0; const p = t - d; return p < 0.6 ? Math.sin(p * 60) * 5 * (1 - p / 0.6) : 0; };
  const ev = id => st.events.find(e => e.id === id);
  const surprisedImg = (id, base) => (st.done[id] != null || opt.allReacted) ? IMG[base + '_surprised'] || IMG[base] : IMG[base];
  drawImgH(ctx, surprisedImg('pumpkin', 'pumpkin'), NPC.pumpkin.x + shake('pumpkin'), WORLD.groundY - jump('pumpkin'), NPC.pumpkin.h);
  drawImgH(ctx, surprisedImg('cat', 'cat'), NPC.cat.x + shake('cat'), WORLD.groundY - jump('cat') * 0.6, (st.done.cat != null ? 1.12 : 1) * NPC.cat.h);
  {
    const k = st.kid;
    const bob = k.state === 'walk' || k.state === 'flee' ? Math.abs(Math.sin(t * (k.state === 'flee' ? 16 : 7))) * 8 : 0;
    const kev = ev('kid');
    const img = st.done.kid != null ? (kev && kev.scary ? IMG.kid_surprised : IMG.kid_surprised || IMG.kid) : IMG.kid;
    if (!opt.hideKid) drawImgH(ctx, img, k.x, WORLD.groundY - bob - jump('kid'), NPC.kid.h, k.flip);
  }
  drawImgH(ctx, st.done.granny != null || opt.allReacted ? IMG.granny_give : IMG.granny, NPC.granny.x, WORLD.groundY, NPC.granny.h);

  // おばけ(後ろの子 → 本体)
  if (st.ghost) {
    const pose = opt.pose || ghostPose(st, t);
    const gx = (opt.ghostX != null ? opt.ghostX : st.x);
    const gy = opt.ghostBottom != null ? opt.ghostBottom : ghostScreenY(st, t);
    const GS = opt.ghostScale || 1;
    for (let i = st.followers.length - 1; i >= 0; i--) {
      const f = st.followers[i];
      const fx = gx - (opt.followGap || 150) * (i + 1);
      const fy = gy - 40 - (i % 2) * 70 + Math.sin(t * 2.2 - (i + 1) * 0.9) * 14;
      const fp = ghostPose(st, t - (i + 1) * 0.35);
      shadowAt(ctx, fx, WORLD.groundY, 0.5 * GS);
      f.draw(ctx, t, fx, fy, { S: 0.55 * GS * fp.S, flip: fp.flip, rot: fp.rot, sx: fp.sx, sy: fp.sy, phase: (i + 1) * 1.7, alpha: 0.9, glow: cam.s });
    }
    if (!opt.noShadow) shadowAt(ctx, gx, WORLD.groundY, pose.S * GS * (1 - (905 - gy) / 400));
    st.ghost.draw(ctx, t, gx + pose.dx, gy + pose.dy, { S: pose.S * GS, flip: pose.flip, rot: pose.rot, sx: pose.sx, sy: pose.sy, glow: cam.s * GS });
    // お菓子
    for (const f of st.flights) {
      const p = (t - f.t0) / f.dur;
      if (p < 0 || p >= 1) continue;
      const tx = gx, ty = gy - st.ghost.h * 0.6;
      const x = lerp(f.x0, tx, p), y = lerp(f.y0, ty, p) - Math.sin(p * Math.PI) * 170;
      ctx.save(); ctx.translate(x, y); ctx.rotate(p * 9);
      drawImgH(ctx, IMG[f.img], 0, 26, 52); ctx.restore();
    }
  }
  // 吹き出し
  for (const b of st.bubbles) {
    const p = (t - b.t0) / b.dur;
    if (p < 0 || p > 1) continue;
    const a = p < 0.1 ? p / 0.1 : p > 0.85 ? (1 - p) / 0.15 : 1;
    const sc = p < 0.12 ? easeOutBack(p / 0.12) : 1;
    bubble(ctx, b.text, b.x, b.y, a, sc);
  }
  for (const p of st.parts) {
    ctx.save(); ctx.globalAlpha = clamp(1 - (t - p.t0) / p.life, 0, 1);
    ctx.translate(p.x, p.y); ctx.rotate(p.r + t * 5);
    ctx.fillStyle = p.c; ctx.fillRect(-7, -4, 14, 8); ctx.restore();
  }
  ctx.restore();
  // 画面に固定の文字(大成功)
  if (st.banner && !opt.noBanner) {
    const p = clamp((t - st.banner.t0) / 0.5, 0, 1);
    const fs = Math.min(W * 0.11, H * 0.08);
    ctx.save(); ctx.translate(W / 2, H * 0.2); ctx.scale(easeOutBack(p), easeOutBack(p));
    ctx.font = `bold ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = fs * 0.16; ctx.strokeStyle = '#4a1c08'; ctx.strokeText(st.banner.text, 0, 0);
    ctx.fillStyle = '#ffc45e'; ctx.fillText(st.banner.text, 0, 0);
    ctx.restore();
  }
}
function shadowAt(ctx, x, y, k) {
  ctx.save(); ctx.fillStyle = 'rgba(10,5,25,0.35)';
  ctx.beginPath(); ctx.ellipse(x, y, 95 * k, 16 * k, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function bubble(ctx, text, x, y, alpha, sc) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(sc, sc);
  ctx.font = `bold 32px ${FONT}`;
  const w = ctx.measureText(text).width + 36, h = 56;
  roundRect(ctx, -w / 2, -h - 18, w, h, 24);
  ctx.fillStyle = '#fffaf0'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(-12, -20); ctx.lineTo(12, -20); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a1a40'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, -h / 2 - 18);
  ctx.restore();
}

// ---------- 画面 ----------
const $ = id => document.getElementById(id);
const stage = $('stage'), sctx = stage.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  CW = window.innerWidth; CH = window.innerHeight;
  stage.width = Math.round(CW * DPR); stage.height = Math.round(CH * DPR);
}
window.addEventListener('resize', resize);

function mainCam(st) {
  // 空の上の方は少し切って、通りとおばけを大きく見せる
  const camY = 150;
  const s = (CH / (1000 - camY)) * DPR;
  const viewW = stage.width / s;
  let x;
  if (st.mode === 'idle') x = 200 + (Math.sin(st.t * 0.05) * 0.5 + 0.5) * 1800;
  else x = st.x - viewW * (st.followers.length ? 0.55 : 0.42);
  x = clamp(x, 0, Math.max(0, WORLD_END() - viewW));
  return { x, y: camY, s };
}

// ---------- 描く板 ----------
const pad = $('pad'), pctx = pad.getContext('2d');
const COLORS = ['#ffffff', '#ffa040', '#b98bff', '#7ee081', '#ff6f8a'];
let penColor = COLORS[0], penWidth = 14;
let strokes = [], cur = null;
function renderPad() {
  pctx.clearRect(0, 0, 600, 600);
  pctx.lineCap = 'round'; pctx.lineJoin = 'round';
  for (const s of strokes) {
    pctx.strokeStyle = s.c; pctx.fillStyle = s.c; pctx.lineWidth = s.w;
    pctx.shadowColor = s.c; pctx.shadowBlur = 8;
    pctx.beginPath();
    if (s.p.length === 1) { pctx.arc(s.p[0][0], s.p[0][1], s.w / 2, 0, Math.PI * 2); pctx.fill(); }
    else { smoothPath(pctx, s.p); pctx.stroke(); }
  }
  $('padHint').style.display = strokes.length ? 'none' : '';
  $('goBtn').disabled = !strokes.length;
}
function padXY(e) {
  const r = pad.getBoundingClientRect();
  return [clamp((e.clientX - r.left) / r.width * 600, 0, 600), clamp((e.clientY - r.top) / r.height * 600, 0, 600)];
}
pad.addEventListener('pointerdown', e => {
  e.preventDefault();
  pad.setPointerCapture && pad.setPointerCapture(e.pointerId);
  cur = { c: penColor, w: penWidth, p: [padXY(e)] };
  strokes.push(cur); renderPad();
});
pad.addEventListener('pointermove', e => {
  if (!cur) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ce of (evs.length ? evs : [e])) {
    const q = padXY(ce), l = cur.p[cur.p.length - 1];
    if (Math.hypot(q[0] - l[0], q[1] - l[1]) >= 3) cur.p.push(q);
  }
  renderPad();
});
const endStroke = () => { if (cur && cur.p.length > 400) cur.p = cur.p.filter((_, i) => i % 2 === 0 || i === cur.p.length - 1); cur = null; };
pad.addEventListener('pointerup', endStroke);
pad.addEventListener('pointercancel', endStroke);
pad.addEventListener('pointerleave', endStroke);

function buildColorButtons() {
  const box = $('colors');
  COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sw' + (i ? '' : ' on'); b.style.background = c; b.setAttribute('aria-label', '色 ' + (i + 1));
    b.dataset.color = c;
    b.onclick = () => { penColor = c; box.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === b)); };
    box.appendChild(b);
  });
}
$('widthBtn').onclick = () => { penWidth = penWidth === 14 ? 7 : 14; $('widthBtn').textContent = penWidth === 14 ? '太い線' : '細い線'; };
$('undoBtn').onclick = () => { strokes.pop(); renderPad(); };
$('clearBtn').onclick = () => { strokes = []; renderPad(); };

// ---------- 後ろについてくる子(この端末の中だけに残す) ----------
function loadFollowers() {
  try { const a = JSON.parse(localStorage.getItem(CFG.STORE_KEY) || '[]'); return Array.isArray(a) ? a.slice(0, 4) : []; } catch (e) { return []; }
}
function saveFollower(strokesData, name) {
  try {
    const a = loadFollowers();
    a.unshift({ n: name, s: strokesData.map(s => ({ c: s.c, w: s.w, p: s.p.map(([x, y]) => [Math.round(x), Math.round(y)]) })) });
    localStorage.setItem(CFG.STORE_KEY, JSON.stringify(a.slice(0, 4)));
  } catch (e) { /* 保存できない環境では何もしない */ }
}
function updateFollowNote() {
  const n = loadFollowers().length;
  const note = $('followNote');
  note.textContent = n ? `前に描いた ${n} 体が後ろについてきます ` : '';
  if (n) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tool'; b.textContent = '列を解散';
    b.onclick = () => { try { localStorage.removeItem(CFG.STORE_KEY); } catch (e) { } updateFollowNote(); };
    note.appendChild(b);
  }
}

// ---------- 進行 ----------
let manual = false, lastTs = 0, resultInfo = null;
let st = null;
function startParade() {
  const name = $('nameInput').value.trim().slice(0, 12);
  const ghost = new Ghost(strokes.map(s => ({ c: s.c, w: s.w, p: s.p.slice() })), CFG.GHOST_SIZE);
  const followers = loadFollowers().map(f => new Ghost(f.s, CFG.GHOST_SIZE));
  st = newParadeState(ghost, followers);
  st.name = name; st.strokes = strokes.map(s => ({ c: s.c, w: s.w, p: s.p.slice() }));
  st.drawScore = drawScoreFor(strokes);
  st.bubbles.push({ text: 'ぽんっ', x: st.x, y: 905 - CFG.GHOST_SIZE - 10, t0: 0.15, dur: 1.0 });
  for (let i = 0; i < 18; i++) st.parts.push({ x: st.x + (rand() - 0.5) * 60, y: 800 + (rand() - 0.5) * 80, vx: (rand() - 0.5) * 500, vy: -rand() * 300, c: '#ffffff', r: rand() * 6, t0: 0, life: 0.8 });
  $('drawScreen').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('candyNum').textContent = '0';
}
function onCandy(n) { $('candyNum').textContent = String(n); }

function rankFor(score) {
  if (score >= 90) return '商店街の伝説';
  if (score >= 75) return '今夜の主役';
  if (score >= 55) return 'なかなかの驚かせ上手';
  if (score >= 35) return 'ちょっとだけこわい';
  return 'かわいすぎてお菓子をもらった';
}
function commentFor(st) {
  const ev = id => st.events.find(e => e.id === id);
  if (st.surprised >= 4) return '商店街じゅうが悲鳴につつまれた';
  if (st.surprised === 0) return '商店街のみんなにかわいがられた';
  const lines = [];
  if (ev('kid') && ev('kid').scary) lines.push('仮装の子が本気で逃げていった');
  if (ev('pumpkin') && ev('pumpkin').scary) lines.push('かぼちゃが二度見した');
  if (ev('cat') && ev('cat').scary) lines.push('黒猫に本気で威嚇された');
  if (ev('granny') && ev('granny').scary) lines.push('おばあちゃんがお菓子で許してもらおうとした');
  if (ev('granny') && !ev('granny').scary) lines.push('お菓子屋のおばあちゃんにかわいがられた');
  if (ev('kid') && !ev('kid').scary) lines.push('仮装の子に手をふられた');
  return lines[Math.floor(rand() * lines.length)] || '夜の商店街をぶじに練り歩いた';
}

function finishParade() {
  if (st.finishing && st.mode !== 'end') return Promise.resolve();
  st.finishing = true;
  // とばした時は残りの出来事を全部済ませる
  while (st.mode === 'parade') update(st, 1 / 30);
  const score = clamp(Math.round(st.drawScore * 0.55 + st.surprised * 11 + rand() * 6), 3, 99);
  resultInfo = { name: st.name || '名なしのおばけ', score, rank: rankFor(score), comment: commentFor(st), candies: st.candies, surprised: st.surprised };
  saveFollower(st.strokes, st.name);
  const card = makeResultCard(st, resultInfo);
  resultInfo.canvas = card;
  return new Promise(res => card.toBlob(b => {
    resultInfo.blob = b;
    if (resultInfo.url) URL.revokeObjectURL(resultInfo.url);
    resultInfo.url = URL.createObjectURL(b);
    $('resultImg').src = resultInfo.url;
    $('xBtn').href = intentUrl(resultInfo);
    $('hud').classList.add('hidden');
    $('resultScreen').classList.remove('hidden');
    st.mode = 'result';
    res();
  }, 'image/png'));
}

function shareUrl() {
  if (CFG.SHARE_URL) return CFG.SHARE_URL;
  return location.href.split(/[?#]/)[0].replace(/index\.html$/, '');
}
function intentUrl(info) {
  const text = `わたしのおばけ「${info.name}」が商店街を練り歩きました(今夜の驚かせ度 ${info.score}%)\n${CFG.TAGS}`;
  return 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(shareUrl());
}

// ---------- 結果の1枚(1080x1350) ----------
function makeResultCard(st, info) {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const s = 1.6, camY = 1000 - H / s;
  const gx = 1290;
  const view = { ...st, t: st.t, banner: null, bubbles: [], flights: [], parts: [], hopT: -9, startleT: -9, turns: [], mode: 'end', x: gx };
  view.lanterns = st.lanterns.map(l => ({ ...l, lit: 1 }));
  view.kid = { x: -999, state: 'walk', flip: false };
  const pose = { S: 1, flip: 1, rot: 0.05, sx: 1, sy: 1, dx: 0, dy: 0 };
  render(ctx, W, H, view, { x: gx - W / s / 2, y: camY, s }, {
    pose, ghostX: gx, ghostBottom: camY + 960 / s, ghostScale: 1.45, followGap: 240, allReacted: true, noBanner: true, hideKid: true, noShadow: true,
  });
  // 上と下を少し暗く
  let gr = ctx.createLinearGradient(0, 0, 0, 330); gr.addColorStop(0, 'rgba(18,12,44,0.85)'); gr.addColorStop(1, 'rgba(18,12,44,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, 330);
  gr = ctx.createLinearGradient(0, 900, 0, H); gr.addColorStop(0, 'rgba(18,12,44,0)'); gr.addColorStop(1, 'rgba(18,12,44,0.75)');
  ctx.fillStyle = gr; ctx.fillRect(0, 900, W, H - 900);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  // 題名
  ctx.font = `bold 46px ${FONT}`; ctx.lineWidth = 9; ctx.strokeStyle = '#4a1c08'; ctx.strokeText('らくがき百鬼夜行', W / 2, 82);
  ctx.fillStyle = '#ffc45e'; ctx.fillText('らくがき百鬼夜行', W / 2, 82);
  // 名前
  let fs = 84; ctx.font = `bold ${fs}px ${FONT}`;
  const nm = `「${info.name}」`;
  while (ctx.measureText(nm).width > W - 120 && fs > 40) { fs -= 4; ctx.font = `bold ${fs}px ${FONT}`; }
  ctx.lineWidth = 12; ctx.strokeStyle = '#1c1640'; ctx.strokeText(nm, W / 2, 190);
  ctx.fillStyle = '#ffffff'; ctx.fillText(nm, W / 2, 190);
  ctx.font = `bold 32px ${FONT}`; ctx.lineWidth = 7; ctx.strokeText('が商店街を練り歩きました', W / 2, 244);
  ctx.fillStyle = '#e9dcff'; ctx.fillText('が商店街を練り歩きました', W / 2, 244);
  // 下の札
  roundRect(ctx, 50, 985, W - 100, 300, 34);
  ctx.fillStyle = 'rgba(28,18,64,0.88)'; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,184,92,0.8)'; ctx.stroke();
  ctx.textAlign = 'left';
  ctx.font = `bold 34px ${FONT}`; ctx.fillStyle = '#e9dcff'; ctx.fillText('今夜の驚かせ度', 95, 1052);
  ctx.textAlign = 'right'; ctx.font = `bold 118px ${FONT}`; ctx.fillStyle = '#ffb04a';
  ctx.fillText(info.score + '%', W - 95, 1100);
  // 目盛り
  roundRect(ctx, 95, 1072, 560, 26, 13); ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fill();
  roundRect(ctx, 95, 1072, Math.max(26, 560 * info.score / 100), 26, 13);
  const bar = ctx.createLinearGradient(95, 0, 655, 0); bar.addColorStop(0, '#b07cff'); bar.addColorStop(1, '#ff9a3c');
  ctx.fillStyle = bar; ctx.fill();
  ctx.textAlign = 'left';
  fs = 50; ctx.font = `bold ${fs}px ${FONT}`;
  while (ctx.measureText(info.rank).width > 640 && fs > 30) { fs -= 2; ctx.font = `bold ${fs}px ${FONT}`; }
  ctx.fillStyle = '#ffffff'; ctx.fillText(info.rank, 95, 1172);
  fs = 34; ctx.font = `${fs}px ${FONT}`;
  while (ctx.measureText(info.comment).width > W - 190 && fs > 22) { fs -= 2; ctx.font = `${fs}px ${FONT}`; }
  ctx.fillStyle = '#ffe2b8'; ctx.fillText(info.comment, 95, 1232);
  // お菓子の数
  ctx.textAlign = 'right'; ctx.font = `bold 36px ${FONT}`; ctx.fillStyle = '#ffffff';
  const ctext = `お菓子 ${info.candies}こ`;
  ctx.fillText(ctext, W - 95, 1172);
  const cw = ctx.measureText(ctext).width;
  drawImgH(ctx, IMG.candy_1, W - 95 - cw - 30, 1180, 48);
  // 足もと
  ctx.textAlign = 'center'; ctx.font = `26px ${FONT}`; ctx.fillStyle = 'rgba(255,240,220,0.85)';
  ctx.fillText(CFG.TAGS.replace(' ', '  '), W / 2, 1328);
  return c;
}

// ---------- 保存・投稿 ----------
function safeFileName() { return 'rakugaki-hyakki-' + (resultInfo.name || 'obake').replace(/[\\/:*?"<>|\s]/g, '') + '.png'; }
function download() {
  const a = document.createElement('a'); a.href = resultInfo.url; a.download = safeFileName();
  document.body.appendChild(a); a.click(); a.remove();
}
$('saveBtn').onclick = async () => {
  if (!resultInfo || !resultInfo.blob) return;
  const touch = matchMedia('(pointer:coarse)').matches;
  try {
    const file = new File([resultInfo.blob], safeFileName(), { type: 'image/png' });
    if (touch && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  download();
};
$('againBtn').onclick = () => {
  strokes = []; renderPad();
  $('nameInput').value = '';
  $('resultScreen').classList.add('hidden');
  $('drawScreen').classList.remove('hidden');
  updateFollowNote();
  st = idleState();
};
$('skipBtn').onclick = () => { if (st && st.mode === 'parade') finishParade(); };
$('goBtn').onclick = () => { if (strokes.length) startParade(); };

// ---------- ループ ----------
function frame(dt) {
  if (!st) return;
  update(st, dt);
  if (st.mode === 'end' && !st.finishing) { st.finishing = true; finishParade(); }
  render(sctx, stage.width, stage.height, st, mainCam(st), { ghostScale: CW < CH ? 1.12 : 1 });
}
function loop(ts) {
  const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 1 / 60;
  lastTs = ts;
  if (!manual) frame(dt);
  requestAnimationFrame(loop);
}

// 試験と動画撮影のための入口(遊ぶ人には関係ない)
window.__RH = {
  setManual(v) { manual = !!v; },
  step(dt, n) { for (let i = 0; i < (n || 1); i++) frame(dt); },
  state() { return st && { mode: st.mode, t: st.t, x: st.x, candies: st.candies, surprised: st.surprised, events: st.events.slice(), drawScore: st.drawScore, followers: st.followers.length }; },
  result() { return resultInfo && { name: resultInfo.name, score: resultInfo.score, rank: resultInfo.rank, comment: resultInfo.comment, candies: resultInfo.candies, w: resultInfo.canvas.width, h: resultInfo.canvas.height, intent: $('xBtn').href }; },
  strokes() { return strokes; },
  ghostSample(t) { // 同じおばけの2時刻の点の位置(動いているかの確認用)
    if (!st || !st.ghost) return null;
    const g = st.ghost, q = g.parts[0].p[Math.floor(g.parts[0].p.length / 2)];
    return g.deform(q, t, 0, 0, 0);
  },
};

loadAssets().then(() => {
  resize();
  buildColorButtons();
  renderPad();
  updateFollowNote();
  st = idleState();
  requestAnimationFrame(loop);
  document.documentElement.dataset.ready = '1';
});
