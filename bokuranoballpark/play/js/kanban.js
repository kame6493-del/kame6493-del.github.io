// 11/22 持ち主「お店とかだけど 今看板とか感じめっちゃ簡易的なので全球場chatgptとか良い感じに作って看板とか凄いそれっぽくきれいにしてください」
// 看板 = ChatGPT で作った絵の部品(img/kanban/: 看板の地 12・店の印 20・品書きの板 4・ちょうちん・電飾・値札・飾りの帯)+ ゲームの側で字体(fonts/kb_*.woff2、OFL)の店名を重ねる。
// 店の種類(freeplay.js の kindOf。品書きを決めるのと同じ物)ごとに地と印を決め、球場ごとに地の替え・飾り(雪・波・葉・電飾・ちょうちん)を少し変える。
// 使う所: walkers.js(屋台ののれん)・freeplay.js(外の屋台・トラック・テント・アーチの店・コンビニ・品書きの板)・模型に焼き込まれた看板と品書き(材質の絵を描き直す kbReskin)。
// 部品の絵は tools/kanban_parts.py が _chatgpt_kanban_1122/ のシートから切り出す。焼き込みの看板のマスと店名は js/kanban_atlas.js(tools/kanban_atlas_dump.py)。
import { KB_ATLAS } from './kanban_atlas.js';

const VER = '1122a';
const BASE = new URL('../', import.meta.url).href;
const S = { ready: false, fail: false, wait: [], boards: null, marks: null, deco: null, meta: null, imgs: new Map() };
let started = false, kindFn = () => null;
// 筆の字体(kb_yuji)に入っている字(店名の字だけに絞った)。ほかの字が入る名前は太いゴシック(kb_dela)にする(字体が混ざらないように)
const YUJI = new Set([...'…›、。「」あいうえおかがきぎくぐけげこごさざしじすずせぜそぞただちっつてでとどなにぬねのはばひびふぶぷへべほまみむめもゃやゅよらりるれろわをんァアィイウェォオカガキギクグケゲコゴサザシジスズセソタダチッツテトドナニネノハバパヒビピフブプベペホボポマミムメモャュユョラリルレロワン・ー一丁三上下丘並中串丼乗九事二交亭人仕付代以伝位体作使係信個側備充先入公具内円処凪出分切列別券前割動北区千原取受口台号司合同名味呼品員喫噌回団園地坂型堂場塁増壁売夕外夜大天太好始婆子字学安定実客室寝寮寿小少届屋山川席帽幸広店座庫庭弁式引当待後必応念戻所手打投拾持指振捕捨掃揚換援操放救整方日明昔星時暗書替最服木本杜来東板林株根案森模横樹樺橋機次止歳段水氷汁汐決汽沢波津流浜海消清渡港湧湾漁漏潮火灯炭点焚焼照煮熊燃牛牧物特珈球琲甘生町画畑番白盛盤目看眺着礼移空窓窯立笛笹箱粉紙紺終絵緑線置羽者肉肩自舟船色芋花苔茶草華落葉薪薬行袋裏補要見覧観角言記試誕読調豚貨販買赤走足路車転輪辺近迷送通造運道選部野金針鈴鉄銀鍋門閉開間関降陰雪霧青面音風飛食飯飲駅験鮮鳥鳴鷺麺麻']);
const loadImg = (src) => new Promise((ok, ng) => { const i = new Image(); i.decoding = 'async'; i.onload = () => ok(i); i.onerror = () => ng(new Error('img ' + src)); i.src = src; });
export function kbSetKind(fn) { kindFn = fn || kindFn; }
export function kbLoad() {
  if (started || typeof document === 'undefined') return; started = true;
  const fonts = [['kbDela', 'fonts/kb_dela.woff2'], ['kbYuji', 'fonts/kb_yuji.woff2'], ['kbMaru', 'fonts/kb_maru.woff2']].map(([n, f]) => { try { const ff = new FontFace(n, `url(${BASE}${f}?v=${VER})`); document.fonts.add(ff); return ff.load().catch(() => null); } catch (e) { return Promise.resolve(null); } });
  Promise.all([loadImg(`${BASE}img/kanban/kb_boards.webp?v=${VER}`), loadImg(`${BASE}img/kanban/kb_marks.webp?v=${VER}`), loadImg(`${BASE}img/kanban/kb_deco.webp?v=${VER}`), fetch(`${BASE}img/kanban/kb_parts.json?v=${VER}`).then((r) => r.json()), ...fonts])
    .then(([b, m, d, meta]) => { S.boards = b; S.marks = m; S.deco = d; S.meta = meta; S.ready = true; const W = S.wait; S.wait = []; for (const f of W) { try { f(); } catch (e) { console.warn('kanban', e); } } })
    .catch((e) => { S.fail = true; console.warn('kanban parts', e); });
}
export const kbReady = () => S.ready;
export function kbWhen(fn) { if (S.ready) { fn(); return; } S.wait.push(fn); kbLoad(); }
const stadium = () => (typeof window !== 'undefined' && window.__fp && window.__fp.h && window.__fp.h.stadium) || 'koshien';
const lite = () => !!(typeof window !== 'undefined' && window.__kbLite);

// ---------------------------------------------------------------- 型
const MK = { karaage: 0, ramen: 1, curry: 2, yakisoba: 3, takoyaki: 4, ice: 6, bento: 7, goods: 8, hotdog: 9, coffee: 10, kakigori: 11, nikuman: 12, yakitori: 13, udon: 14, pizza: 15, konamon: 16, drink: 17, sweets: 18, store: 19 };
// 看板の地(kb_boards の番号): 0 黒うるし 1 白木 2 赤のれん 3 藍のれん 4 電球の電飾 5 れんがにネオン 6 パステルの甘味 7 黒板 8 金属の板 9 朱の祭りの幕 10 緑のほうろう 11 空色の波
const BST = [
  { ink: '#f2cf72', stroke: '#140c04', font: 'yuji', px: 0.32, py: 0.2 },
  { ink: '#3b2210', stroke: null, font: 'yuji', px: 0.3, py: 0.2, sh: 'rgba(255,240,210,0.5)' },
  { ink: '#ffffff', stroke: '#4a0808', font: 'yuji', px: 0.3, py: 0.24, dy: 0.06 },
  { ink: '#ffffff', stroke: '#08123a', font: 'yuji', px: 0.3, py: 0.24, dy: 0.06 },
  { ink: '#c0121a', stroke: '#fff3cf', font: 'dela', px: 0.42, py: 0.3 },
  { ink: '#fff4c8', stroke: null, glow: '#ffa21f', font: 'dela', px: 0.4, py: 0.25 },
  { ink: '#8a2c4c', stroke: '#ffffff', font: 'maru', px: 0.4, py: 0.3 },
  { ink: '#f5f2ea', stroke: null, font: 'maru', px: 0.34, py: 0.24 },
  { ink: '#1b2742', stroke: '#eef1f4', font: 'dela', px: 0.3, py: 0.22 },
  { ink: '#ffffff', stroke: '#6e0e06', font: 'dela', px: 0.3, py: 0.2 },
  { ink: '#f4d677', stroke: '#06180c', font: 'dela', px: 0.32, py: 0.22 },
  { ink: '#ffffff', stroke: '#0b4a86', font: 'dela', px: 0.3, py: 0.22 },
];
const KB_BOARD = { ramen: 2, nikuman: 2, udon: 3, yakitori: 1, bento: 1, curry: 10, karaage: 9, yakisoba: 0, takoyaki: 9, konamon: 0, hotdog: 4, pizza: 4, ice: 11, kakigori: 11, sweets: 6, coffee: 7, drink: 11, goods: 8, store: 8 };
// 球場ごと: def 種類の分からない店の地 / sw 種類ごとの地の替え / deco 飾り(雪・波・葉・電飾・ちょうちん)/ menu 品書きの板の地
const THEME = {
  koshien: { def: 10, deco: 'lantern', sw: { sweets: 6, store: 10 }, menu: 'enamel' },   // 古い球場・浜風: 緑のほうろう、和の店にちょうちん
  dome: { def: 8, deco: 'bulbs', sw: { karaage: 4 }, menu: 'navy' },                      // 大屋根の球場: 金属の板と電飾
  park: { def: 1, deco: 'leaf', sw: { curry: 1 }, menu: 'wood' },                  // 杜の球場: 白木とつたの葉
  ring: { def: 8, deco: 'bulbs', sw: { karaage: 0, yakitori: 0 }, menu: 'navy' },           // 銀の輪の屋根の球場
  railside: { def: 5, deco: null, sw: { hotdog: 5, curry: 0, bento: 7 }, menu: 'chalk' },    // 汽車と港のれんが
  bowl: { def: 11, deco: 'wave', sw: { curry: 10, ramen: 0 }, menu: 'navy' },              // 港町
  north: { def: 1, deco: 'snow', sw: { yakitori: 0, karaage: 1 }, menu: 'wood' },           // 北の杜
  roof: { def: 7, deco: 'snow', sw: { ramen: 0, curry: 7, drink: 5 }, menu: 'chalk' },        // 北国の屋根の球場
  bay: { def: 11, deco: 'wave', sw: { ramen: 0 }, menu: 'navy' },                           // 海の球場
  shore: { def: 11, deco: 'wave', sw: { yakitori: 9 }, menu: 'enamel' },                    // 海辺の風の球場
  grove: { def: 1, deco: 'leaf', sw: { curry: 1, coffee: 7 }, menu: 'wood' },      // 森の球場
  canal: { def: 0, deco: 'lantern', sw: { hotdog: 4, karaage: 0 }, menu: 'chalk' },        // 運河の下町
};
const WA = new Set(['ramen', 'udon', 'yakitori', 'takoyaki', 'konamon', 'bento', 'nikuman', 'yakisoba']);   // ちょうちんを下げる和の店
function subKind(k, name) {
  if (k === 'ice' && /氷|かち割り/.test(name)) return 'kakigori';
  if (k === 'sweets' && /珈琲|コーヒー|カフェ|喫茶|ラテ/.test(name)) return 'coffee';
  if (k === 'ramen' && /まん|しゅうまい|シュウマイ|シューマイ/.test(name)) return 'nikuman';
  if (k === 'vend') return 'drink';
  return k;
}
// 店名 → 看板の型(地・印・字体・飾り)。kind を渡せばそれを使う(渡さなければ品書きと同じ kindOf で決める)
export function kbStyle(name, kind) {
  const nm = String(name || ''), st = stadium(), T = THEME[st] || THEME.koshien;
  const k0 = kind !== undefined ? kind : kindFn(nm), sk = k0 ? subKind(k0, nm) : null;
  const board = sk == null ? T.def : ((T.sw && T.sw[sk] != null) ? T.sw[sk] : (KB_BOARD[sk] != null ? KB_BOARD[sk] : T.def));
  const B = BST[board]; let font = B.font; if (font === 'yuji' && [...nm].some((c) => c.charCodeAt(0) > 127 && !YUJI.has(c))) font = 'dela';
  return { kind: k0 || null, sk, board, mark: sk != null && MK[sk] != null ? MK[sk] : null, font, B, deco: T.deco, wa: WA.has(sk), st, T };
}
const FONT = { dela: '"kbDela", "Noto Sans JP", "Yu Gothic", sans-serif', yuji: '"kbYuji", "kbDela", serif', maru: '"kbMaru", "kbDela", sans-serif' };
const fontOf = (f, px) => `${f === 'dela' ? '400' : f === 'maru' ? '900' : '400'} ${Math.max(6, Math.round(px))}px ${FONT[f] || FONT.dela}`;

// ---------------------------------------------------------------- 描く
function drawBoard(g, bi, x, y, w, h) {
  const M = S.meta.boards, sx = (bi % M.cols) * M.w, sy = Math.floor(bi / M.cols) * M.h, sw = M.w, sh = M.h;
  const cap = Math.round(sh * 0.9), dcap = cap * (h / sh);
  if (dcap * 2.2 > w) { g.drawImage(S.boards, sx, sy, sw, sh, x, y, w, h); return; }
  g.drawImage(S.boards, sx, sy, cap, sh, x, y, dcap, h);
  g.drawImage(S.boards, sx + cap, sy, sw - cap * 2, sh, x + dcap - 0.5, y, w - dcap * 2 + 1, h);
  g.drawImage(S.boards, sx + sw - cap, sy, cap, sh, x + w - dcap, y, dcap, h);
}
function drawMark(g, mi, cx, cy, d) {
  const t = S.meta.marks.t, c = S.meta.marks.cols;
  g.save(); g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = d * 0.08; g.shadowOffsetY = d * 0.03;
  g.drawImage(S.marks, (mi % c) * t, Math.floor(mi / c) * t, t, t, cx - d / 2, cy - d / 2, d, d); g.restore();
}
function deco(nm) { const b = S.meta.deco[nm]; return b; }
function drawDeco(g, nm, x, y, w, h) { const b = deco(nm); if (b) g.drawImage(S.deco, b[0], b[1], b[2], b[3], x, y, w, h); }
function stripDeco(g, nm, x, y, w, bh) {   // 横に並べる帯(雪・波・葉・電飾)
  const b = deco(nm); if (!b) return; const tw = b[2] * (bh / b[3]); for (let px = x - tw * 0.1; px < x + w; px += tw * 0.98) { const ww = Math.min(tw, x + w - px); g.drawImage(S.deco, b[0], b[1], b[2] * (ww / tw), b[3], px, y, ww, bh); }
}
// 字: 幅に合わせて縮める。縮めすぎる時は「・」や空白で 2 行に
function drawText(g, text, cx, cy, maxW, maxH, sty) {
  const B = sty.B; let lines = [text];
  let fs = maxH * 0.86; g.font = fontOf(sty.font, fs);
  let mw = g.measureText(text).width;
  if (mw > maxW) { const fs1 = fs * maxW / mw; const sp = text.split(/[\s・]+/).filter(Boolean);
    if (fs1 < maxH * 0.5 && sp.length >= 2) { const half = Math.ceil(sp.length / 2); lines = [sp.slice(0, half).join(' '), sp.slice(half).join(' ')]; fs = maxH * 0.46; g.font = fontOf(sty.font, fs); const m2 = Math.max(...lines.map((l) => g.measureText(l).width)); if (m2 > maxW) fs *= maxW / m2; }
    else fs = fs1; }
  g.font = fontOf(sty.font, fs); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const lh = fs * 1.08, y0 = cy - (lines.length - 1) * lh / 2;
  lines.forEach((l, i) => {
    const yy = y0 + i * lh + fs * 0.04;
    g.save();
    if (B.glow) { g.shadowColor = B.glow; g.shadowBlur = fs * 0.35; g.fillStyle = B.glow; g.fillText(l, cx, yy); g.shadowBlur = fs * 0.15; }
    else { g.shadowColor = B.sh || 'rgba(0,0,0,0.45)'; g.shadowBlur = fs * 0.08; g.shadowOffsetY = fs * 0.04; }
    if (B.stroke) { g.strokeStyle = B.stroke; g.lineWidth = Math.max(2, fs * 0.14); g.strokeText(l, cx, yy); g.shadowColor = 'transparent'; }
    if (sty.font === 'yuji') { g.strokeStyle = B.ink; g.lineWidth = Math.max(1, fs * 0.055); g.strokeText(l, cx, yy); }   // 筆の字は細いので、同じ色で少し太らせる
    g.fillStyle = B.ink; g.fillText(l, cx, yy); g.restore();
  });
}
// 看板 1 枚を (x, y, w, h) に描く
export function kbDrawSign(g, x, y, w, h, name, sty) {
  sty = sty || kbStyle(name);
  const text = String(name || '').trim(), B = sty.B, ar = w / h;
  if (!S.ready) { g.fillStyle = '#1d2b3a'; g.fillRect(x, y, w, h); g.fillStyle = '#fff'; g.font = `900 ${Math.round(h * 0.5)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x + w / 2, y + h / 2, w * 0.9); return; }
  drawBoard(g, sty.board, x, y, w, h);
  if (ar < 1.7) {   // 四角に近いマス: 上に印、下に字
    const d = Math.min(w * 0.72, h * 0.58); if (sty.mark != null) drawMark(g, sty.mark, x + w / 2, y + h * 0.08 + d / 2, d);
    drawText(g, text, x + w / 2, y + h * 0.8, w * 0.84, h * 0.26, sty); return;
  }
  let tx0 = x + h * B.px, tx1 = x + w - h * B.px, ty0 = y + h * B.py, ty1 = y + h - h * B.py;
  const top = ar >= 3.2 && sty.deco && sty.deco !== 'lantern' && !(sty.deco === 'wave' && sty.board === 11);
  if (sty.mark != null && ar >= 2.4) { const d = h * 0.8; drawMark(g, sty.mark, x + h * B.px * 0.55 + d / 2, y + h / 2, d); tx0 = x + h * B.px * 0.55 + d + h * 0.12; }
  if (sty.deco === 'lantern' && sty.wa && ar >= 3.4) { const lh = h * 0.92, lw = lh * 0.62; drawDeco(g, 'lantern_red', x + w - h * B.px * 0.45 - lw, y + h * 0.04, lw, lh); tx1 = x + w - h * B.px * 0.45 - lw - h * 0.08; }
  else if (sty.mark != null && ar >= 6) tx1 -= h * 0.25;
  if (ar > 8) tx1 = Math.min(tx1, tx0 + h * 6.5);   // とても細長い帯(舟灯の店の帯など)は、前の絵と同じく左寄せ(見える所に字が来るように)
  if (top) { const bh = h * (sty.deco === 'bulbs' ? 0.3 : sty.deco === 'wave' ? 0.2 : 0.32); if (sty.deco === 'wave') { stripDeco(g, 'trim_wave', x, y + h - bh, w, bh); ty1 = Math.min(ty1, y + h - bh * 0.8); } else { stripDeco(g, { snow: 'trim_snow', leaf: 'trim_leaf', bulbs: 'bulbs' }[sty.deco], x, y - bh * 0.12, w, bh); ty0 = Math.max(ty0, y + bh * 0.72); } }
  const dy = (B.dy || 0) * h;
  drawText(g, text, (tx0 + tx1) / 2, (ty0 + ty1) / 2 + dy, Math.max(10, tx1 - tx0), Math.max(8, ty1 - ty0), sty);
}

// ---------------------------------------------------------------- 作った店の看板のテクスチャ(同じ名前・大きさは 1 枚を共有。部品が読めたら描き直す)
const TEX = new Map();
export function kbSignTexture(THREE, name, opt = {}) {
  const sty = kbStyle(name, opt.kind), w = opt.w || (lite() ? 384 : 512), h = opt.h || Math.round(w / 4);
  const key = [name, w, h, sty.board, sty.mark, stadium()].join('|');
  let t = TEX.get(key); if (t) return t;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const draw = () => { g.clearRect(0, 0, w, h); kbDrawSign(g, 0, 0, w, h, name, kbStyle(name, opt.kind)); };
  draw();
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; TEX.set(key, t);
  if (!S.ready) kbWhen(() => { draw(); t.needsUpdate = true; });
  return t;
}
// のぼり(縦長): 地は看板の地を縦に、字は縦書き
export function kbFlagTexture(THREE, name, opt = {}) {
  const sty = kbStyle(name, opt.kind), w = 128, h = 512, key = ['flag', name, sty.board, stadium()].join('|');
  let t = TEX.get(key); if (t) return t;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const draw = () => {
    const s2 = kbStyle(name, opt.kind); g.clearRect(0, 0, w, h);
    if (S.ready) { g.save(); g.translate(w, 0); g.rotate(Math.PI / 2); drawBoard(g, s2.board, 0, 0, h, w); g.restore(); } else { g.fillStyle = '#1d2b3a'; g.fillRect(0, 0, w, h); }
    let y = 18; if (S.ready && s2.mark != null) { drawMark(g, s2.mark, w / 2, 14 + 46, 92); y = 116; }
    const ch = [...String(name)].filter((q) => q.trim()).slice(0, 6), fs = Math.min(76, (h - y - 16) / Math.max(1, ch.length));
    ch.forEach((q, i) => { drawText(g, q, w / 2, y + fs * (i + 0.5), w * 0.8, fs, s2); });
  };
  draw();
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; TEX.set(key, t);
  if (!S.ready) kbWhen(() => { draw(); t.needsUpdate = true; });
  return t;
}

// ---------------------------------------------------------------- 品書き(実際に買える品の絵・名前・値段)
// items: [{ id, name, price(null で出さない) }]。iconOf(id) → { src, i }(5×5 の絵のマス)。絵の読み込みは kbFoods で前もって
export function kbFoods(srcs) { return Promise.all([...new Set(srcs.filter(Boolean))].map((s) => { if (S.imgs.has(s)) return S.imgs.get(s); const p = loadImg(s).then((im) => { S.imgs.set(s, im); return im; }).catch(() => null); S.imgs.set(s, p); return p; })); }
const imgOf = (src) => { const v = S.imgs.get(src); return v && v.naturalWidth ? v : null; };
function drawFood(g, ic, x, y, s, sty) {
  const im = ic && imgOf(ic.src);
  g.save(); g.beginPath(); const r = s * 0.16; g.moveTo(x + r, y); g.arcTo(x + s, y, x + s, y + s, r); g.arcTo(x + s, y + s, x, y + s, r); g.arcTo(x, y + s, x, y, r); g.arcTo(x, y, x + s, y, r); g.closePath(); g.clip();
  if (im) { const n = 5, cw = im.naturalWidth / n; g.drawImage(im, (ic.i % n) * cw, Math.floor(ic.i / n) * cw, cw, cw, x, y, s, s); }
  else if (S.ready && sty && sty.mark != null) { g.fillStyle = '#20242a'; g.fillRect(x, y, s, s); drawMark(g, sty.mark, x + s / 2, y + s / 2, s * 0.96); }
  else { g.fillStyle = '#3a3f46'; g.fillRect(x, y, s, s); }
  g.restore();
}
const MENU_BG = { chalk: { ink: '#f6f3ea', sub: '#ffd76a', line: 'rgba(255,255,255,0.25)', px: 0.075, top: 0.07 }, enamel: { ink: '#2a2020', sub: '#b3121c', line: 'rgba(0,0,0,0.18)', px: 0.085, top: 0.075 }, navy: { ink: '#f4f1e6', sub: '#f2cf72', line: 'rgba(255,255,255,0.22)', px: 0.085, top: 0.075 }, wood: { ink: '#2d1a0c', sub: '#8a1a10', line: 'rgba(60,30,10,0.25)', px: 0.06, top: 0.05 } };
function menuBgOf(sty) { const k = sty.sk; if (k === 'sweets' || k === 'ice' || k === 'kakigori' || k === 'drink') return 'enamel'; if (k === 'coffee') return 'chalk'; return (sty.T && sty.T.menu) || 'chalk'; }
const yenTxt = (n) => `${Math.round(n).toLocaleString('ja-JP')}円`;
// 縦長の品書きの板(立て看板・店の脇の板)
export function kbDrawMenu(g, x, y, w, h, title, items, iconOf, opt = {}) {
  const sty = kbStyle(opt.signName || title, opt.kind), bgk = opt.bg || menuBgOf(sty), M = MENU_BG[bgk];
  if (S.ready) { const b = deco('menu_' + bgk); g.drawImage(S.deco, b[0], b[1], b[2], b[3], x, y, w, h); } else { g.fillStyle = '#16301f'; g.fillRect(x, y, w, h); }
  const px = w * M.px, top = y + h * M.top;
  // 見出し: 店の看板の型の小さい札
  const th = h * 0.15; kbDrawSign(g, x + px * 0.8, top, w - px * 1.6, th, title, sty);
  const L = items.slice(0, opt.max || 5), y0 = top + th + h * 0.03, rh = (y + h - h * M.top * 0.9 - y0) / Math.max(4, L.length), s = rh * 0.82;
  L.forEach((it, k) => {
    const ry = y0 + k * rh; drawFood(g, iconOf && iconOf(it.id), x + px, ry + (rh - s) / 2, s, sty);
    const nx = x + px + s + w * 0.035, nw = x + w - px - nx;
    g.save(); g.textBaseline = 'middle';
    const hasP = it.price != null; let fs = rh * (hasP ? 0.34 : 0.4); g.font = fontOf('maru', fs); g.textAlign = 'left'; let tw = g.measureText(it.name).width; if (tw > nw) { fs *= nw / tw; g.font = fontOf('maru', fs); }
    g.fillStyle = M.ink; g.fillText(it.name, nx, ry + rh * (hasP ? 0.34 : 0.5));
    if (hasP) { g.font = fontOf('dela', rh * 0.32); g.textAlign = 'right'; g.fillStyle = M.sub; g.fillText(yenTxt(it.price), x + w - px, ry + rh * 0.74); }
    g.restore();
    if (k < L.length - 1) { g.fillStyle = M.line; g.fillRect(nx, ry + rh - 1, nw, 1.5); }
  });
}
// 横長の品書き(模型の店の台の上の写真の板): 品を横に並べる(絵・名前・値段)
export function kbDrawMenuStrip(g, x, y, w, h, title, items, iconOf, opt = {}) {
  const sty = kbStyle(opt.signName || title, opt.kind), bgk = opt.bg || menuBgOf(sty), M = MENU_BG[bgk];
  if (S.ready) { const b = deco('menu_' + bgk); const ins = Math.min(b[2], b[3]) * 0.1; g.drawImage(S.deco, b[0], b[1], b[2] * 0.12, b[3], x, y, Math.min(w * 0.06, h * 0.3), h); g.drawImage(S.deco, b[0] + b[2] * 0.12, b[1], b[2] * 0.76, b[3], x + Math.min(w * 0.06, h * 0.3) - 0.5, y, w - Math.min(w * 0.06, h * 0.3) * 2 + 1, h); g.drawImage(S.deco, b[0] + b[2] * 0.88, b[1], b[2] * 0.12, b[3], x + w - Math.min(w * 0.06, h * 0.3), y, Math.min(w * 0.06, h * 0.3), h); }
  else { g.fillStyle = '#16301f'; g.fillRect(x, y, w, h); }
  const pad = Math.min(w * 0.04, h * 0.12); const L = items.slice(0, Math.max(1, Math.min(opt.max || 4, Math.floor((w - pad * 2) / (h * 0.62))))); if (!L.length) return;
  const cw = (w - pad * 2) / L.length, s = Math.min(cw * 0.86, (h - pad * 2) * 0.62);
  L.forEach((it, k) => {
    const cx = x + pad + cw * (k + 0.5), iy = y + pad;
    drawFood(g, iconOf && iconOf(it.id), cx - s / 2, iy, s, sty);
    const hasP = it.price != null, ty = iy + s + (h - pad * 2 - s) * (hasP ? 0.3 : 0.5), fs0 = Math.min((h - pad * 2 - s) * (hasP ? 0.42 : 0.6), cw * 0.2);
    g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; let fs = fs0; g.font = fontOf('maru', fs); const tw = g.measureText(it.name).width; if (tw > cw * 0.94) { fs *= cw * 0.94 / tw; g.font = fontOf('maru', fs); }
    g.fillStyle = M.ink; g.fillText(it.name, cx, ty);
    if (hasP) { g.font = fontOf('dela', fs0 * 0.95); g.fillStyle = M.sub; g.fillText(yenTxt(it.price), cx, iy + s + (h - pad * 2 - s) * 0.76); }
    g.restore();
  });
}

// ---------------------------------------------------------------- 模型に焼き込まれた看板・品書きの絵を描き直す
// spec(KB_ATLAS と KB_MENUS): re(材質の名前)・rows×cols のマス・t(マスごとの店名)または byName(材質の名前の番号 → 店名)。
// 三角の UV の四角(同じ四角はまとめる)ごとに、その四角に収まる看板を描く(マスの一部だけを使う板があっても字が切れない)。四角の外は前の絵のまま
// menuOf(name) → [{ id, name, price }](その店名の店で実際に買える品。null なら品書きは描かない)。iconOf(id) → 絵のマス
export const KB_MENUS = {
  koshien: [{ re: 'r12_shop_menu_(\\d+)$', byName: KB_ATLAS.koshien[0].byName }, { re: 'r12_shop_noren_(\\d+)$', byName: KB_ATLAS.koshien[0].byName, noren: true }],
  dome: [{ re: 'kb_kb_menuboards', rows: 8, cols: 1, from: 'kb_kb_shopsigns_names' }],
  ring: [{ re: 'kb_kb_menuboards', rows: 8, cols: 1, from: 'kb_kb_shopsigns_names' }],
  bay: [{ re: 'kb_kb_menuboards', rows: 8, cols: 1, from: 'kb_kb_shopsigns_names' }],
  canal: [{ re: 'kb_kb_menuboards', rows: 8, cols: 1, from: 'kb_kb_shopsigns_names' }],
  park: [{ re: '^rc_menus$', rows: 8, cols: 2, from: '^rc_signs$' }],
  bowl: [{ re: '^rc_menus$', rows: 8, cols: 2, from: '^rc_signs$' }],
  north: [{ re: '^rc_menus$', rows: 8, cols: 2, from: '^rc_signs$' }],
  railside: [{ re: 'kt_tex_menus_50', rows: 4, cols: 4, from: 'kt_tex_signs_140' }],
  roof: [{ re: 'kt_tex_menus_50', rows: 4, cols: 4, from: 'kt_tex_signs_140' }],
  grove: [{ re: 'kt_tex_menus_50', rows: 4, cols: 4, from: 'kt_tex_signs_140' }, { re: '^sign_menus$', rows: 6, cols: 1, from: '^sign_names$' }],
  shore: [{ re: '^dt_menus$', rows: 12, cols: 1, from: '^dt_names$' }],
};
// スマホの画質の模型で、看板が 1 枚の絵に詰めてある所(絵の中の四角 [x0, y0, x1, y1, 店名]、size の絵の画素で。上から下へ)
const KB_LITE = {
  koshien: [{ re: 'r12_shop_name_lite$', size: 512, boxes: [[212, 0, 438, 24, '浜風カレー'], [0, 143, 226, 166, 'からあげ'], [228, 143, 454, 166, '鉄板やきそば'], [0, 168, 226, 191, 'たこやき'], [228, 168, 454, 191, 'ジュース・ドリンク'], [0, 193, 226, 216, 'おべんとう'], [228, 193, 454, 216, '炭火やきとり'], [0, 218, 226, 241, 'かき氷・ソフト'], [228, 218, 454, 241, 'にぎり寿司'], [0, 243, 226, 266, 'グラウンドピザ'], [228, 243, 454, 266, '応援グッズ'], [0, 268, 226, 291, 'うどん・そば'], [228, 268, 454, 291, '中華・天津飯'], [0, 293, 226, 316, 'お好み焼き']] }],
};
function namesOf(st, spec) {
  if (spec.t || spec.byName) return spec;
  const a = (KB_ATLAS[st] || []).find((q) => q.re === spec.from); if (!a) return null;
  return { ...spec, t: a.t };
}
function uvRects(o, mat, P) {   // その材質の三角の UV の四角(0〜1 に折り返す)。同じ・重なる四角はまとめる
  const g = o.geometry, U = g.attributes.uv, I = g.index; if (!U) return [];
  const ms = Array.isArray(o.material) ? o.material : [o.material], ranges = [];
  if (Array.isArray(o.material)) { for (const gr of g.groups || []) if (ms[gr.materialIndex] === mat) ranges.push([gr.start, gr.start + gr.count]); } else ranges.push([0, I ? I.count : U.count]);
  const seen = new Set(), out = [];
  for (const [a0, a1] of ranges) for (let t = a0; t + 2 < a1; t += 3) {
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9, us = 0, vs = 0;
    for (let k = 0; k < 3; k++) { const i = I ? I.getX(t + k) : t + k, u = U.getX(i), v = U.getY(i); us += u; vs += v; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const fu = Math.floor(us / 3), fv = Math.floor(vs / 3); u0 -= fu; u1 -= fu; v0 -= fv; v1 -= fv;
    if (u1 - u0 < 0.004 || v1 - v0 < 0.004) continue;
    const key = [u0, u1, v0, v1].map((q) => Math.round(q * 1024)).join(','); if (seen.has(key)) continue; seen.add(key);
    out.push([Math.max(0, u0), Math.min(1, u1), Math.max(0, v0), Math.min(1, v1)]);
  }
  return out;
}
function mergeRects(R, sp) {   // 重なる・接する四角をまとめる(同じマスの中だけ。隣のマスの板とはまとめない)
  const tol = 0.003; let ch = true;
  const cell = (a) => (sp && sp.boxes ? sp.boxes.findIndex((q) => { const cx = (a[0] + a[1]) / 2 * sp.size, cy = (a[2] + a[3]) / 2 * sp.size; return cx >= q[0] && cx <= q[2] && cy >= q[1] && cy <= q[3]; }) : sp && sp.rows ? Math.floor(((a[2] + a[3]) / 2) * sp.rows) * 1000 + Math.floor(((a[0] + a[1]) / 2) * (sp.cols || 1)) : 0);
  while (ch) { ch = false; for (let i = 0; i < R.length && !ch; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i], b = R[j]; if (cell(a) === cell(b) && a[0] <= b[1] + tol && b[0] <= a[1] + tol && a[2] <= b[3] + tol && b[2] <= a[3] + tol) { R[i] = [Math.min(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3])]; R.splice(j, 1); ch = true; break; } } }
  return R;
}
// signs: 模型の看板の場所と店名(models/shop_signs.json の球場の分)。品書きの板は、すぐ上の看板の店名の品で描く(マスの店名と看板が違う球場がある: 舟灯)
function voteNames(spots, signs) {
  const V = new Map();
  for (const s of spots) { let best = null, bd = 1e9, own = false; for (const q of signs || []) { if ((q.gen || 0) > 1) continue; const dy = q.y - s.y, h = Math.hypot(q.x - s.x, q.z - s.z); if (h > 6 || dy < -1.5 || dy > 4) continue; if (q.t === s.t) own = true; const d = h + Math.abs(dy) * 0.5 + (q.gen ? 3 : 0); if (d < bd) { bd = d; best = q.t; } } if (own) best = s.t; if (!best) continue; /* 同じ店名の看板が近くにあればマスの店名のまま */ let m = V.get(s.t); if (!m) V.set(s.t, m = new Map()); m.set(best, (m.get(best) || 0) + 1); }
  const out = new Map(); for (const [k, m] of V) { let b = null, bn = -1; for (const [n, c] of m) if (c > bn) { bn = c; b = n; } if (b) out.set(k, b); } return out;
}
// 品書きの板(模型の材質の絵)を、板の場所ごとに「すぐ上の看板の店名」の品で描き直す。
// 同じマスの板が違う店名の店に使われている球場(舟灯など)があるので、板の三角ごとに店名を決め、店名ごとのマスを並べた新しい絵を作り、三角の UV をそのマスへ付け替える
// (位置・頂点の数・材質の数は変えない。UV だけを持つ新しい形を、その模型の部品にだけ付ける)。マスの中の板の形(UV の四角)はそのまま写す
function nearestSign(signList, x, y, z, own) {
  let best = null, bd = 1e9, hasOwn = false;
  for (const q of signList || []) { if ((q.gen || 0) > 1) continue; const dy = q.y - y, h = Math.hypot(q.x - x, q.z - z); if (h > 6 || dy < -1.5 || dy > 4) continue; if (own && q.t === own && h < 4.5) hasOwn = true; const d = h + Math.abs(dy) * 0.5 + (q.gen ? 3 : 0); if (d < bd) { bd = d; best = q.t; } }
  return hasOwn ? own : best;
}
function menuJob(THREE, j, sp, signList, menuOf, iconOf, spots) {
  const old = j.tex; if (old.offset.x || old.offset.y || old.repeat.x !== 1 || old.repeat.y !== 1 || old.rotation) return null;
  const im = old.image, iw = im.width || im.naturalWidth, ih = im.height || im.naturalHeight; if (!iw || !ih) return null;
  const rows = sp.rows || 1, cols = sp.cols || 1, flip = !!old.flipY, T = new Map(), per = [], sp3 = {};
  for (const q of j.mats) {
    const o = q.o, g = o.geometry, P = g.attributes.position, U = g.attributes.uv, I = g.index; if (!P || !U) continue;
    const ms = Array.isArray(o.material) ? o.material : [o.material], ranges = [];
    if (Array.isArray(o.material)) { for (const gr of g.groups || []) if (ms[gr.materialIndex] === q.m) ranges.push([gr.start, gr.start + gr.count]); } else ranges.push([0, I ? I.count : P.count]);
    o.updateMatrixWorld(true); const e = o.matrixWorld.elements;
    const raw0 = sp.byName ? (() => { const mm = q.nm.match(new RegExp(sp.re)); return mm ? sp.byName[+mm[1]] : null; })() : null;
    const uv = new Float32Array(U.count * 2); for (let i = 0; i < U.count; i++) { uv[i * 2] = U.getX(i); uv[i * 2 + 1] = U.getY(i); }
    const list = [];
    for (const [a0, a1] of ranges) for (let t = a0; t + 2 < a1; t += 3) {
      const ii = [0, 1, 2].map((k) => (I ? I.getX(t + k) : t + k));
      let uc = 0, vc = 0, x = 0, y = 0, z = 0;
      for (const i of ii) { const px = P.getX(i), py = P.getY(i), pz = P.getZ(i); uc += uv[i * 2] / 3; vc += uv[i * 2 + 1] / 3; x += (e[0] * px + e[4] * py + e[8] * pz + e[12]) / 3; y += (e[1] * px + e[5] * py + e[9] * pz + e[13]) / 3; z += (e[2] * px + e[6] * py + e[10] * pz + e[14]) / 3; }
      const fu = Math.floor(uc), fv = Math.floor(vc), fx = uc - fu, fy = flip ? 1 - (vc - fv) : vc - fv;
      const row = Math.min(rows - 1, Math.max(0, Math.floor(fy * rows))), col = Math.min(cols - 1, Math.max(0, Math.floor(fx * cols)));
      const raw = sp.byName ? raw0 : (sp.t[row * cols + col] || null);
      const target = raw ? (nearestSign(signList, x, y, z, raw) || raw) : `#${row},${col}`;
      let info = T.get(target); if (!info) T.set(target, info = { row, col, rects: new Map(), draw: !!raw });
      let l0 = 1e9, l1 = -1e9, m0 = 1e9, m1 = -1e9;
      for (const i of ii) { const lx = (uv[i * 2] - fu) * cols - col, fyv = flip ? 1 - (uv[i * 2 + 1] - fv) : uv[i * 2 + 1] - fv, ly = fyv * rows - row; l0 = Math.min(l0, lx); l1 = Math.max(l1, lx); m0 = Math.min(m0, ly); m1 = Math.max(m1, ly); }
      if (l1 - l0 > 0.01 && m1 - m0 > 0.01) { const r = [Math.max(0, l0), Math.min(1, l1), Math.max(0, m0), Math.min(1, m1)], key = r.map((v) => Math.round(v * 512)).join(','); info.rects.set(key, r); }
      list.push({ ii, fu, fv, row, col, target });
      if (raw) { const key = target + '|' + Math.round(x / 3) + ',' + Math.round(y / 3) + ',' + Math.round(z / 3); let s = sp3[key]; if (!s) { s = sp3[key] = { t: target, x: 0, y: 0, z: 0, n: 0, gen: 2 }; } s.x += x; s.y += y; s.z += z; s.n++; }
    }
    per.push({ q, uv, list });
  }
  if (!T.size) return null;
  const names = [...T.keys()], n = names.length, cw0 = iw / cols, ch0 = ih / rows;
  const gc = Math.max(1, Math.round(Math.sqrt(n * ch0 / cw0))), gr = Math.ceil(n / gc);
  const cap = lite() ? 1024 : 2048, s = Math.min(lite() ? 1 : (Math.max(cw0, ch0) <= 512 ? 1.5 : 1), cap / Math.max(gc * cw0, gr * ch0));   // PC は小さい絵だけ 1.5 倍(字がぼやけないように。メモリを増やしすぎない)
  const cw = Math.max(8, Math.floor(cw0 * s)), ch = Math.max(8, Math.floor(ch0 * s)), W = gc * cw, H = gr * ch;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  let cells = 0;
  names.forEach((name, k) => {
    const info = T.get(name), x = (k % gc) * cw, y = Math.floor(k / gc) * ch;
    try { g.drawImage(im, info.col * cw0, info.row * ch0, cw0, ch0, x, y, cw, ch); } catch (e) { /* 前の絵が描けない */ }
    if (!info.draw) return;
    const items = menuOf ? menuOf(name) : null; if (!items || !items.length) return;
    const R = mergeRects([...info.rects.values()], null);
    for (const r of R) { const rx = x + r[0] * cw, ry = y + r[2] * ch, rw = (r[1] - r[0]) * cw, rh = (r[3] - r[2]) * ch; if (rw < 6 || rh < 6) continue; if (rw / rh >= 1.25) kbDrawMenuStrip(g, rx, ry, rw, rh, name, items, iconOf, { max: 4 }); else kbDrawMenu(g, rx, ry, rw, rh, name, items, iconOf, { max: 5 }); cells++; }
  });
  for (const P of per) {
    for (const tr of P.list) {
      const k = names.indexOf(tr.target), gx = k % gc, gy = Math.floor(k / gc);
      for (const i of tr.ii) {
        const lx = (P.uv[i * 2] - tr.fu) * cols - tr.col, fyv = flip ? 1 - (P.uv[i * 2 + 1] - tr.fv) : P.uv[i * 2 + 1] - tr.fv, ly = fyv * rows - tr.row;
        const nx = (gx + Math.min(1, Math.max(0, lx))) / gc, ny = (gy + Math.min(1, Math.max(0, ly))) / gr;
        P.uv[i * 2] = nx; P.uv[i * 2 + 1] = flip ? 1 - ny : ny;
      }
    }
    const o = P.q.o, g0 = o.geometry;
    const g2 = new THREE.BufferGeometry(); for (const key of Object.keys(g0.attributes)) if (key !== 'uv') g2.setAttribute(key, g0.attributes[key]);
    g2.setAttribute('uv', new THREE.BufferAttribute(P.uv, 2)); if (g0.index) g2.setIndex(g0.index); for (const grp of g0.groups) g2.addGroup(grp.start, grp.count, grp.materialIndex);
    g2.boundingBox = g0.boundingBox; g2.boundingSphere = g0.boundingSphere; g2.userData = { ...g0.userData, kbUV: 1 }; g2.name = g0.name;
    o.geometry = g2;
  }
  for (const v of Object.values(sp3)) { v.x /= v.n; v.y /= v.n; v.z /= v.n; v.n = 0; spots.push(v); }
  const t = new THREE.CanvasTexture(c);
  t.flipY = old.flipY; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = old.colorSpace || THREE.SRGBColorSpace; t.channel = old.channel || 0; t.anisotropy = Math.max(4, old.anisotropy || 1); t.magFilter = old.magFilter; t.minFilter = old.minFilter;
  return { tex: t, cells, names: n };
}
export function kbReskin(THREE, root, st, menuOf, iconOf, signList) {
  if (!S.ready) return { done: 0 };
  const signs = (KB_ATLAS[st] || []).concat(KB_LITE[st] || []).map((a) => ({ ...a, kind: 'sign' })), menus = (KB_MENUS[st] || []).map((a) => namesOf(st, a)).filter(Boolean).map((a) => ({ ...a, kind: a.noren ? 'noren' : 'menu' }));
  const specs = signs.concat(menus); if (!specs.length) return { done: 0 };
  const jobs = new Map();   // 元の絵 → { spec, mats: [{ m, o, nm }] }
  const refs = new Map();   // 元の絵を使う材質の数(全部の材質)
  root.traverse((o) => { if (!o.isMesh || !o.material) return; for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { if (!m) continue; for (const t of [m.map, m.emissiveMap]) if (t) refs.set(t, (refs.get(t) || 0) + 1); if (m.userData.kb) continue; const nm = m.name || ''; const sp = specs.find((q) => new RegExp(q.re).test(nm)); if (!sp || !m.map || !m.map.image || m.map.isCompressedTexture) continue; const key = sp.byName ? m.map : m.map; let j = jobs.get(key); if (!j) { j = { spec: sp, tex: m.map, mats: [] }; jobs.set(key, j); } j.mats.push({ m, o, nm }); } });
  let done = 0, cells = 0; const miss = [], spots = [];
  for (const j of jobs.values()) {
    const sp = j.spec, old = j.tex, im = old.image, iw = im.width || im.naturalWidth, ih = im.height || im.naturalHeight; if (!iw || !ih) continue;
    if (sp.kind === 'menu') { let r = null; try { r = menuJob(THREE, j, sp, signList, menuOf, iconOf, spots); } catch (e) { miss.push('menu ' + sp.re + ' ' + e.message); } if (r) { let n = 0; for (const q of j.mats) { if (q.m.map === old) { q.m.map = r.tex; n++; } if (q.m.emissiveMap === old) { q.m.emissiveMap = r.tex; n++; } q.m.userData.kb = 1; q.m.needsUpdate = true; } if ((refs.get(old) || 0) <= n) old.dispose(); done++; cells += r.cells; continue; } }
    const cap = lite() ? 1024 : 2048, up = !lite() && Math.max(iw, ih) <= 512 ? 2 : 1, k = Math.min(up, cap / Math.max(iw, ih));
    const W = Math.round(iw * k), H = Math.round(ih * k);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    try { g.drawImage(im, 0, 0, W, H); } catch (e) { miss.push('draw ' + sp.re); continue; }
    const flip = !!old.flipY;
    let rects = []; for (const q of j.mats) rects.push(...uvRects(q.o, q.m)); rects = mergeRects(rects, sp);
    let remap = null; if (sp.kind === 'menu') { const my = []; spotsOf(j, sp, my); remap = voteNames(my, signList); for (const s of my) { s.raw = s.t; s.t = remap.get(s.t) || s.t; } spots.push(...my); }
    const byNameText = (nm) => { if (!sp.byName) return null; const mm = nm.match(new RegExp(sp.re)); return mm ? sp.byName[+mm[1]] : null; };
    for (const r of rects) {
      const x0 = r[0] * W, x1 = r[1] * W, y0 = (flip ? 1 - r[3] : r[2]) * H, y1 = (flip ? 1 - r[2] : r[3]) * H;
      let text = null;
      if (sp.boxes) { const cx = (x0 + x1) / 2 / W * sp.size, cy = (y0 + y1) / 2 / H * sp.size, bx = sp.boxes.find((q) => cx >= q[0] && cx <= q[2] && cy >= q[1] && cy <= q[3]); if (!bx) continue; text = bx[4]; }
      else if (sp.byName) text = byNameText(j.mats[0].nm);
      else { const cyF = ((y0 + y1) / 2) / H, cxF = ((x0 + x1) / 2) / W, row = Math.min(sp.rows - 1, Math.floor(cyF * sp.rows)), col = Math.min(sp.cols - 1, Math.floor(cxF * sp.cols)); if ((x1 - x0) / W > 1.3 / sp.cols || (y1 - y0) / H > 1.3 / sp.rows) continue; text = sp.t[row * sp.cols + col] || null; }
      if (!text) continue;
      const w = x1 - x0, h = y1 - y0; if (w < 6 || h < 6) continue;
      if (sp.kind === 'sign') kbDrawSign(g, x0, y0, w, h, text);
      else if (sp.kind === 'noren') { const sty = kbStyle(text); const s2 = { ...sty, board: 2, B: BST[2], mark: null, deco: null }; kbDrawSign(g, x0, y0, w, h, text.split('・')[0], s2); }
      else { const nm2 = (remap && remap.get(text)) || text, items = menuOf ? menuOf(nm2) : null; if (!items || !items.length) continue; if (w / h >= 1.25) kbDrawMenuStrip(g, x0, y0, w, h, nm2, items, iconOf, { max: 4 }); else kbDrawMenu(g, x0, y0, w, h, nm2, items, iconOf, { max: 5 }); }
      cells++;
    }
    const t = new THREE.CanvasTexture(c);
    t.flipY = old.flipY; t.wrapS = old.wrapS; t.wrapT = old.wrapT; t.colorSpace = old.colorSpace || THREE.SRGBColorSpace; t.channel = old.channel || 0; t.offset.copy(old.offset); t.repeat.copy(old.repeat); t.rotation = old.rotation; t.center.copy(old.center); t.anisotropy = Math.max(4, old.anisotropy || 1); t.magFilter = old.magFilter; t.minFilter = old.minFilter; t.generateMipmaps = true;
    let n = 0; for (const q of j.mats) { if (q.m.map === old) { q.m.map = t; n++; } if (q.m.emissiveMap === old) { q.m.emissiveMap = t; n++; } q.m.userData.kb = 1; q.m.needsUpdate = true; }
    if ((refs.get(old) || 0) <= n) old.dispose();
    done++;
  }
  return { done, cells, miss, jobs: jobs.size, spots };
}
// 品書きの板の場所(世界の座標)と店名: 看板の無い店に、その店の品書きの板の店名を付けるため(freeplay.seenName が使う)。3 m の目ごとにまとめる
function spotsOf(j, sp, out) {
  const tmp = {};
  for (const q of j.mats) {
    const o = q.o, g = o.geometry, P = g.attributes.position, U = g.attributes.uv, I = g.index; if (!P || !U) continue;
    const ms = Array.isArray(o.material) ? o.material : [o.material], ranges = [];
    if (Array.isArray(o.material)) { for (const gr of g.groups || []) if (ms[gr.materialIndex] === q.m) ranges.push([gr.start, gr.start + gr.count]); } else ranges.push([0, I ? I.count : P.count]);
    o.updateMatrixWorld(true); const e = o.matrixWorld.elements, flip = !!j.tex.flipY;
    const byName = sp.byName ? (() => { const mm = q.nm.match(new RegExp(sp.re)); return mm ? sp.byName[+mm[1]] : null; })() : null;
    for (const [a0, a1] of ranges) for (let t = a0; t + 2 < a1; t += 3) {
      let u = 0, v = 0, x = 0, y = 0, z = 0;
      for (let k = 0; k < 3; k++) { const i = I ? I.getX(t + k) : t + k, px = P.getX(i), py = P.getY(i), pz = P.getZ(i); u += U.getX(i) / 3; v += U.getY(i) / 3; x += (e[0] * px + e[4] * py + e[8] * pz + e[12]) / 3; y += (e[1] * px + e[5] * py + e[9] * pz + e[13]) / 3; z += (e[2] * px + e[6] * py + e[10] * pz + e[14]) / 3; }
      let name = byName;
      if (!sp.byName) { u -= Math.floor(u); v -= Math.floor(v); const row = Math.min(sp.rows - 1, Math.floor((flip ? 1 - v : v) * sp.rows)), col = Math.min(sp.cols - 1, Math.floor(u * sp.cols)); name = sp.t[row * sp.cols + col] || null; }
      if (!name) continue;
      const key = name + '|' + Math.round(x / 3) + ',' + Math.round(y / 3) + ',' + Math.round(z / 3);
      let s = tmp[key]; if (!s) { s = tmp[key] = { t: name, x: 0, y: 0, z: 0, n: 0 }; out.push(s); }
      s.x += x; s.y += y; s.z += z; s.n++;
    }
  }
  for (const s of out) if (s.n) { s.x /= s.n; s.y /= s.n; s.z /= s.n; s.gen = 2; s.n = 0; }
}

// 試験(tools/kanban_audit.py)から看板の型を見るため
if (typeof window !== 'undefined') window.__kb = { style: kbStyle, kind: (n) => kindFn(n), ready: () => S.ready };
