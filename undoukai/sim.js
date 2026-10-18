'use strict';
// らくがき運動会: 形の読み取り・レースの計算・生き物データの形式(画面に関係しない部分)
// ここの計算は、どの端末・どのブラウザで開いても同じ結果になるように、
// Math.sin / cos / pow / exp / hypot を使わない(四則と sqrt だけ。sqrt は IEEE で結果が決まっている)。
(function (root) {

  // ---------- 乱数(整数の演算だけ) ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const dist = (a, b) => { const dx = a[0] - b[0], dy = a[1] - b[1]; return Math.sqrt(dx * dx + dy * dy); };

  // ---------- 生き物のデータ形式 ----------
  // JSON: { v:1, name:'もちお', created:'2026-10-14', strokes:[{c:'#19263d', w:14, p:[[x,y],...]}] }
  // 座標は描く板(600x600)の上。p は整数。保存・読み込み・URL への詰め込みはすべて Creature.* を通す。
  const PALETTE = ['#19263d', '#e2483d', '#2f6fe0', '#2fa35a', '#f08a24', '#8a4fd8'];
  const WIDTHS = [14, 7];
  // 完全版のペンと太さ・キラキラ(見た目だけ。形の読み取り analyze とレースの計算は線の点しか見ない)
  // 線の印のバイト: 下3ビット=色(PALETTE)・4ビット目=細い・5〜7ビット目=ペンの種類・8ビット目=太さの追加(極太/極細)
  // 前の版の読み方(PALETTE[f & 7] / WIDTHS[(f >> 3) & 1])でも、近い色と太さで読める
  const WIDTHS4 = [14, 7, 22, 4];
  const PENS = ['', 'gold', 'silver', 'rainbow', 'glitter', 'pink', 'sky', 'lemon'];
  const PEN_COLOR = { gold: '#e0a526', silver: '#9aa7b8', rainbow: '#e2483d', pink: '#ff6fa8', sky: '#4cc3f5', lemon: '#f2c81f' };
  const PEN_BASE = { gold: 4, silver: 0, rainbow: 1, pink: 1, sky: 2, lemon: 4 }; // 前の版で読んだ時の色
  const FX = ['', 'kira', 'aura', 'star', 'petal'];
  const EXTRA = 0xf7; // 生き物のバイト列の後ろに付ける印(キラキラ)。前の版は読まずに捨てる
  function widthIndex(w) { return w >= 18 ? 2 : w <= 5 ? 3 : w <= 9 ? 1 : 0; }
  const PAD = 600;
  const Q = 3; // URL に詰めるときの目の細かさ(3px)

  function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const A = pts[a], B = pts[b];
      const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.sqrt(dx * dx + dy * dy);
      let md = -1, mi = -1;
      for (let i = a + 1; i < b; i++) {
        const d = L < 1e-6 ? dist(pts[i], A) : Math.abs((pts[i][0] - A[0]) * dy - (pts[i][1] - A[1]) * dx) / L;
        if (d > md) { md = d; mi = i; }
      }
      if (md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }

  const Creature = {
    PALETTE, WIDTHS, WIDTHS4, PENS, PEN_COLOR, FX,
    make(strokes, name, fx) {
      const cr = { v: 1, name: String(name || '').slice(0, 12), created: new Date().toISOString().slice(0, 10), strokes: strokes.map(s => Creature.copyStroke(s, s.p.map(q => [Math.round(q[0]), Math.round(q[1])]))) };
      if (fx && FX.indexOf(fx) > 0) cr.fx = fx;
      return cr;
    },
    copyStroke(s, p) { const o = { c: s.c, w: s.w, p }; if (s.k && PENS.indexOf(s.k) > 0) o.k = s.k; return o; },
    // キラキラの印(1体だけを文字にする時は後ろに付ける)
    extraBytes(cr) { const i = cr && cr.fx ? FX.indexOf(cr.fx) : -1; return i > 0 ? [EXTRA, i] : []; },
    readExtra(b, pos, cr) { if (b[pos] === EXTRA && pos + 1 < b.length) { const fx = FX[b[pos + 1]]; if (fx) cr.fx = fx; return pos + 2; } return pos; },
    // 線をバイト列に(URL 用)。eps: 間引きの強さ(px)
    toBytes(cr, eps) {
      const out = [];
      // 名前は 36 バイトまで(文字の途中で切らない)
      let nm = ''; for (const ch of String(cr.name || '')) { if (new TextEncoder().encode(nm + ch).length > 36) break; nm += ch; }
      const nb = new TextEncoder().encode(nm);
      out.push(nb.length); for (const b of nb) out.push(b);
      const strokes = cr.strokes.slice(0, 80);
      out.push(strokes.length);
      for (const s of strokes) {
        const kd = s.k ? Math.max(0, PENS.indexOf(s.k)) : 0;
        let ci = kd && s.k !== 'glitter' ? PEN_BASE[s.k] : PALETTE.indexOf(String(s.c).toLowerCase()); if (ci < 0) ci = 0;
        const wi = widthIndex(s.w);
        let pts = rdp(s.p.map(q => [clamp(Math.round(q[0] / Q), 0, 200), clamp(Math.round(q[1] / Q), 0, 200)]), eps / Q);
        // 同じ点の連続を落とす
        pts = pts.filter((q, i) => i === 0 || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]);
        if (!pts.length) pts = [[0, 0]];
        // 差が大きすぎる所に点を足す(1バイトに収める)
        const full = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          const a = full[full.length - 1], b = pts[i];
          const n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / 120);
          for (let k = 1; k <= n; k++) full.push([Math.round(a[0] + (b[0] - a[0]) * k / n), Math.round(a[1] + (b[1] - a[1]) * k / n)]);
        }
        const P = full.slice(0, 255);
        out.push(ci | ((wi & 1) << 3) | (kd << 4) | ((wi >> 1) << 7)); out.push(P.length); out.push(P[0][0], P[0][1]);
        for (let i = 1; i < P.length; i++) { out.push((P[i][0] - P[i - 1][0]) & 255, (P[i][1] - P[i - 1][1]) & 255); }
      }
      return out;
    },
    fromBytes(b, pos) {
      const sb = v => v > 127 ? v - 256 : v;
      const nl = b[pos++];
      const name = new TextDecoder().decode(new Uint8Array(b.slice(pos, pos + nl))); pos += nl;
      const ns = b[pos++];
      const strokes = [];
      for (let k = 0; k < ns; k++) {
        const f = b[pos++], n = b[pos++];
        let x = b[pos++], y = b[pos++];
        const p = [[x * Q, y * Q]];
        for (let i = 1; i < n; i++) { x += sb(b[pos++]); y += sb(b[pos++]); p.push([x * Q, y * Q]); }
        const kd = PENS[(f >> 4) & 7], base = PALETTE[f & 7] || PALETTE[0];
        const st = { c: kd && PEN_COLOR[kd] && kd !== 'rainbow' ? PEN_COLOR[kd] : base, w: WIDTHS4[((f >> 3) & 1) | (((f >> 7) & 1) << 1)], p };
        if (kd) st.k = kd;
        strokes.push(st);
      }
      if (pos > b.length) throw new Error('short');
      return [{ v: 1, name, created: '', strokes }, pos];
    },
    // 1体を約 maxBytes 以内に(だめなら間引きを強める)
    fitBytes(cr, maxBytes) {
      let eps = 2.5, bytes = Creature.toBytes(cr, eps);
      while (bytes.length > maxBytes && eps < 30) { eps *= 1.45; bytes = Creature.toBytes(cr, eps); }
      // まだ大きい(ぐちゃぐちゃに大量に描いた)時: 点を1つおきに減らし、短い線から落とす
      let c2 = cr;
      for (let k = 0; k < 12 && bytes.length > maxBytes; k++) {
        const ss = c2.strokes.map(s => Creature.copyStroke(s, s.p.filter((_, i) => i % 2 === 0 || i === s.p.length - 1)));
        if (k >= 2) { ss.sort((a, b) => b.p.length - a.p.length); ss.length = Math.max(1, Math.floor(ss.length * 0.75)); }
        c2 = { name: cr.name, strokes: ss };
        bytes = Creature.toBytes(c2, eps);
      }
      return bytes;
    },
    // 一度 URL の形にしてから戻す(どの端末でも同じ線でレースするため、自分の絵もこれを通す)
    roundTrip(cr, maxBytes) { const o = Creature.fromBytes(Creature.fitBytes(cr, maxBytes || 420), 0)[0]; if (cr.fx && FX.indexOf(cr.fx) > 0) o.fx = cr.fx; return o; },
    // 1体を文字にする(ランキング・みんなのらくがき・部屋)。キラキラは後ろに付ける
    packBytes(cr, maxBytes) { return Creature.fitBytes(cr, maxBytes || 380).concat(Creature.extraBytes(cr)); },
    unpackBytes(b) { const [cr, pos] = Creature.fromBytes(b, 0); Creature.readExtra(b, pos, cr); return cr; },
  };

  // 挑戦状(URL のハッシュに入れる)
  // バイト列: [1(版), コース, 種(4バイト), 定員, 体数, 生き物...] → base64url
  const COURSE_IDS = ['track', 'obstacle', 'slope', 'water'];
  function b64url(bytes) {
    let s = ''; for (const x of bytes) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64url(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
    const a = []; for (let i = 0; i < s.length; i++) a.push(s.charCodeAt(i)); return a;
  }
  const Challenge = {
    encode(ch) { // ch: {course, seed, size, creatures:[creature]}
      const out = [1, Math.max(0, COURSE_IDS.indexOf(ch.course)), (ch.seed >>> 24) & 255, (ch.seed >>> 16) & 255, (ch.seed >>> 8) & 255, ch.seed & 255, ch.size, ch.creatures.length];
      for (const cr of ch.creatures) for (const b of Creature.fitBytes(cr, ch.perBytes || 380)) out.push(b);
      // キラキラは全員の後ろにまとめて付ける(前の版は n 体を読んだら残りを捨てるので、壊れない)
      if (ch.creatures.some(cr => Creature.extraBytes(cr).length)) { out.push(EXTRA, ch.creatures.length); for (const cr of ch.creatures) out.push(Math.max(0, FX.indexOf(cr.fx || ''))); }
      return b64url(out);
    },
    decode(str) {
      const b = unb64url(str);
      if (b[0] !== 1) throw new Error('version');
      const course = COURSE_IDS[b[1]] || 'track';
      const seed = ((b[2] << 24) | (b[3] << 16) | (b[4] << 8) | b[5]) >>> 0;
      const size = clamp(b[6], 2, 4), n = b[7];
      let pos = 8; const creatures = [];
      for (let i = 0; i < n; i++) { const [cr, p] = Creature.fromBytes(b, pos); creatures.push(cr); pos = p; }
      if (b[pos] === EXTRA && b[pos + 1] === n) for (let i = 0; i < n; i++) { const fx = FX[b[pos + 2 + i]]; if (fx) creatures[i].fx = fx; }
      return { course, seed, size, creatures };
    },
  };

  // ---------- 形を読む ----------
  function strokeInfo(s) {
    const p = s.p;
    let len = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, sx = 0, sy = 0;
    for (let i = 0; i < p.length; i++) {
      const [x, y] = p[i];
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
      sx += x; sy += y;
      if (i) len += dist(p[i], p[i - 1]);
    }
    const closed = p.length >= 4 && len >= 50 && dist(p[0], p[p.length - 1]) <= Math.max(24, len * 0.16);
    return { len, x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: sx / p.length, cy: sy / p.length, closed };
  }
  function polyAreaPerim(p) {
    let A = 0, P = 0;
    for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; A += a[0] * b[1] - b[0] * a[1]; P += dist(a, b); }
    return [Math.abs(A) / 2, P];
  }
  function segCross(a, b, c, d) {
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0;
  }
  // 足もとの山(下向きのとがり)を数える
  function footPeaks(p, y0, H, minY) {
    const n = p.length; if (n < 2) return [];
    const idx = [];
    for (let i = 0; i < n; i++) {
      const y = p[i][1];
      let isPeak = true;
      for (let k = Math.max(0, i - 3); k <= Math.min(n - 1, i + 3); k++) if (p[k][1] > y) { isPeak = false; break; }
      if (isPeak && (!idx.length || i - idx[idx.length - 1] > 2)) idx.push(i);
    }
    const peaks = [];
    for (let j = 0; j < idx.length; j++) {
      const i = idx[j], y = p[i][1];
      if (y < y0 + 0.7 * H || y < minY) continue;
      // 左右の谷(となりの山までの一番上)
      let lv = 1e9, rv = 1e9;
      const a = j ? idx[j - 1] : 0, b = j < idx.length - 1 ? idx[j + 1] : n - 1;
      for (let k = a; k <= i; k++) lv = Math.min(lv, p[k][1]);
      for (let k = i; k <= b; k++) rv = Math.min(rv, p[k][1]);
      if (i === 0) lv = rv; if (i === n - 1) rv = lv;
      const prom = y - Math.max(lv, rv);
      if (prom >= Math.max(16, 0.1 * H)) peaks.push(p[i]);
    }
    // 近い山はまとめる
    const out = [];
    for (const q of peaks) if (!out.some(o => dist(o, q) < 12)) out.push(q);
    return out;
  }

  const TYPE_NAMES = {
    many: 'ワシャワシャ型', run2: 'スタスタ型', run1: 'ケンケン型', roll: 'コロコロ型', fly: 'パタパタ型', worm: 'クネクネ型', jelly: 'ぽよんぽよん型', guru: 'よろよろ型',
  };
  const TYPE_DESC = {
    many: '足がたくさん。ワシャワシャ走る', run2: '足が2本。大股で走る', run1: '足が1本。ケンケンで進む', roll: 'まんまる。コロコロ転がる', fly: '羽がある。ちょっと飛ぶ', worm: '細長い。くねって進む', jelly: '足なし。ぽよんぽよん跳ねる', guru: 'ぐちゃぐちゃ。よろよろ進む',
  };

  function analyze(strokes) {
    const S = strokes.filter(s => s && s.p && s.p.length);
    if (!S.length) return null;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of S) for (const [x, y] of s.p) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    const W = Math.max(24, x1 - x0), H = Math.max(24, y1 - y0);
    const infos = S.map(strokeInfo);
    const M = Math.max(W, H);
    // からだ: 一番大きい閉じた線(無ければ一番長い線)
    let bi = -1, best = -1;
    infos.forEach((f, i) => { if (!f.closed || f.len < 0.25 * M) return; const [a, per] = polyAreaPerim(S[i].p); const rd = per > 0 ? 4 * Math.PI * a / (per * per) : 0; const sc = a * (0.4 + rd); if (sc > best) { best = sc; bi = i; } });
    const bodyClosed = bi >= 0;
    if (bi < 0) infos.forEach((f, i) => { if (f.len > best) { best = f.len; bi = i; } });
    const body = infos[bi];
    let roundness = 0;
    if (bodyClosed) { const [A, P] = polyAreaPerim(S[bi].p); roundness = P > 0 ? clamp(4 * Math.PI * A / (P * P), 0, 1) : 0; }
    const bcx = body.cx, bcy = body.cy, bw = Math.max(10, body.w);
    const roles = infos.map(() => 'other');
    roles[bi] = 'body';
    let legs = 0, wings = 0, tails = 0, bodyLines = 0; const legPeaks = []; let legH = 0, legN = 0, wingSpan = 0;
    infos.forEach((f, i) => {
      if (i === bi) return;
      if (f.len < 0.07 * M) { roles[i] = 'dot'; return; }
      const bodyLine = !f.closed && f.w > 0.5 * W && f.w > 2.5 * f.h; // 横に長く波打つ線(ヘビの体の線)は足にしない
      if (bodyLine) bodyLines++;
      const pk = f.closed || bodyLine ? [] : footPeaks(S[i].p, y0, H, bodyClosed ? body.y1 - 0.1 * body.h : -1e9);
      if (pk.length) { roles[i] = 'leg'; legs += pk.length; for (const q of pk) legPeaks.push(q); legH += f.h; legN++; return; }
      const upper = f.cy < bcy + 0.05 * H;
      const out = f.x0 < body.x0 - 0.12 * bw || f.x1 > body.x1 + 0.12 * bw;
      const wide = f.w >= 0.6 * f.h;
      let wingShape = true;
      if (f.closed) { const [A, P] = polyAreaPerim(S[i].p); wingShape = P > 0 && 4 * Math.PI * A / (P * P) < 0.72; }
      if (upper && out && wide && wingShape && f.len >= 0.15 * M) { roles[i] = 'wing'; wings++; wingSpan = Math.max(wingSpan, Math.max(body.x0 - f.x0, f.x1 - body.x1) / Math.max(bw, 0.3 * M)); return; }
      // しっぽ・ひれ: 体の横(上下の真ん中あたり)から外へ突き出た線
      const midY = f.cy > body.y0 - 0.1 * body.h && f.cy < body.y1 + 0.1 * body.h;
      let finShape = true; // まるい輪(頭など)は数えない。三角のひれ・線のしっぽは数える
      if (f.closed) { const [A, P] = polyAreaPerim(S[i].p); finShape = P > 0 && 4 * Math.PI * A / (P * P) < 0.8; }
      else finShape = f.h >= 0.3 * f.w; // ほぼ水平の短い線(ひげ)は数えない
      if (out && midY && finShape && f.len >= 0.12 * M) { roles[i] = 'tail'; tails++; }
    });
    // とがり: 線の向きが鋭く折れ返る角(70度より鋭い)の数。トゲ・耳・くちばし・ヒレの先
    let sharpN = 0;
    S.forEach((s, i) => {
      if (roles[i] === 'dot' || roles[i] === 'leg') return;
      const p = rdp(s.p, 0.03 * M), mn = 0.04 * M;
      for (let k = 1; k < p.length - 1; k++) {
        const ax = p[k - 1][0] - p[k][0], ay = p[k - 1][1] - p[k][1], bx = p[k + 1][0] - p[k][0], by = p[k + 1][1] - p[k][1];
        const la = Math.sqrt(ax * ax + ay * ay), lb = Math.sqrt(bx * bx + by * by);
        if (la < mn || lb < mn) continue;
        if ((ax * bx + ay * by) / (la * lb) > 0.34) sharpN++;
      }
    });
    // ぐちゃぐちゃ度: 線どうしの交わり
    let crossings = 0;
    const segs = [];
    for (const s of S) { const p = rdp(s.p, 4); for (let i = 1; i < p.length; i++) segs.push([p[i - 1], p[i]]); }
    const NS = Math.min(segs.length, 700);
    for (let i = 0; i < NS && crossings < 400; i++) for (let j = i + 2; j < NS; j++) if (segCross(segs[i][0], segs[i][1], segs[j][0], segs[j][1])) crossings++;
    let ink = 0; for (const f of infos) ink += f.len;
    const density = ink / Math.sqrt(W * H);
    // 左右対称: 点を左右反転して、近い点があるか
    let sym = 0;
    {
      const pts = []; for (const s of S) for (let i = 0; i < s.p.length; i += 2) pts.push(s.p[i]);
      const cx = (x0 + x1) / 2; let tot = 0; const n = Math.min(pts.length, 260); const step = pts.length / n;
      for (let k = 0; k < n; k++) {
        const q = pts[Math.floor(k * step)], mx = 2 * cx - q[0], my = q[1];
        let md = 1e9; for (const r of pts) { const dx = r[0] - mx, dy = r[1] - my, d = dx * dx + dy * dy; if (d < md) md = d; }
        tot += Math.sqrt(md);
      }
      sym = clamp(1 - (tot / n) / (0.12 * M), 0, 1);
    }
    const aspect = W / H;
    const size = clamp((W * H) / (PAD * PAD), 0, 1);
    const scribble = crossings >= 18 && density >= 7;
    const round = bodyClosed && roundness >= 0.72 && body.w >= 0.6 * W && body.h >= 0.6 * H;
    let mode;
    if (scribble) mode = 'guru';
    else if ((wings >= 2 && legs <= 4) || (wings >= 1 && legs <= 1)) mode = 'fly';
    else if (legs >= 3) mode = 'many';
    else if (legs === 2) mode = 'run2';
    else if (legs === 1) mode = 'run1';
    else if (round) mode = 'roll';
    else if (aspect >= 1.9) mode = 'worm';
    else mode = 'jelly';
    return {
      mode, typeName: TYPE_NAMES[mode], typeDesc: TYPE_DESC[mode],
      legs, wings, roundness, aspect, crossings, density, sym, size, ink, strokes: S.length,
      legLen: legN ? legH / legN / H : 0, wingSpan, tails, bodyLines, sharp: sharpN, W, H, bodyClosed, bodyFill: clamp((body.w * body.h) / (W * H), 0, 1), M,
      bbox: [x0, y0, x1, y1], roles, bodyIndex: bi, legPeaks,
    };
  }

  // ---------- コース ----------
  const FINISH = 3000;
  const COURSES = {
    track: { id: 'track', name: 'かけっこ', sub: 'まっすぐ 100m', segs: [] , hurdles: [], beam: null, net: null, water: [], hill: null },
    obstacle: { id: 'obstacle', name: '障害物きょうそう', sub: 'ハードル・あみくぐり・平均台', hurdles: [520, 820, 2560, 2780], net: [1080, 1520], beam: [1780, 2300], water: [], hill: null },
    slope: { id: 'slope', name: '坂道', sub: 'のぼって くだる', hurdles: [], net: null, beam: null, water: [], hill: { a: 350, b: 1250, c: 1550, d: 2450, h: 210 } },
    water: { id: 'water', name: '水たまり', sub: 'ばしゃばしゃ', hurdles: [], net: null, beam: null, water: [[480, 900], [1300, 1800], [2180, 2620]], hill: null },
  };
  COURSES.track.hurdles = [];
  function smooth01(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function groundH(course, x) {
    const h = course.hill; if (!h) return 0;
    if (x < h.a) return 0;
    if (x < h.b) return h.h * smooth01((x - h.a) / (h.b - h.a));
    if (x < h.c) return h.h;
    if (x < h.d) return h.h * (1 - smooth01((x - h.c) / (h.d - h.c)));
    return 0;
  }
  function terrainAt(course, x) {
    for (const w of course.water) if (x >= w[0] && x <= w[1]) return 'water';
    if (course.beam && x >= course.beam[0] && x <= course.beam[1]) return 'beam';
    if (course.net && x >= course.net[0] && x <= course.net[1]) return 'net';
    const h = course.hill;
    if (h) { if (x > h.a + 40 && x < h.b - 20) return 'up'; if (x > h.c + 20 && x < h.d - 40) return 'down'; }
    return 'flat';
  }

  // ---------- 形 → 能力(画面には出さない。走りっぷりを見て遊ぶ人が考える) ----------
  // まず「生き物らしく、速そう・凄そうに描けているか」(出来ばえ)で能力の合計が決まる。
  //   はっきりした体の輪郭 / 足や羽がある / 線が絡まっていない / ほどよい大きさ / 目などの描き込み
  //   描き込みの量そのもの(塗りつぶし)では増えない。ぐちゃぐちゃ・線1本・小さすぎ は低い。
  // 10/18 から: その合計を4種目に配る(合計はほぼ一定なので、ある種目で強い形は別の種目で弱くなる。万能の形は作らない)。
  //  track かけっこ  : 足が2〜6本で長い・前後に伸びた体・とがった形(トゲ・耳・くちばし)。大きすぎる体は重い
  //  obstacle 障害物 : 縦に高い・体が小さめ・跳ねそうな足(1〜4本)・羽。横に長すぎる体と足の多さはハードルに引っかかる
  //  slope 坂道      : 足が多い(短くてよい)・低く横に広い・どっしりした大きな体。細長く背が高いと転げやすい。丸いと下りで転がって速い
  //  water 水たまり  : 平たい・横に長い・しっぽやひれ・大きな体。足だけ長いと沈む
  //  bal バランス    : 左右対称で線が絡まない。平均台と転びにくさ(種目の得意とは別)
  const AB_KEYS = ['track', 'obstacle', 'slope', 'water'];
  function quality(info) {
    const guru = info.mode === 'guru';
    const clean = clamp(1 - info.crossings / 40, 0, 1);
    let outline = info.bodyClosed ? clamp(info.bodyFill / 0.18, 0, 1) : clamp(info.ink / (3 * info.M), 0, 1) * 0.3;
    if (!guru && info.bodyLines && info.strokes >= 3) outline = Math.max(outline, 0.75); // 長い体を線でなぞって頭も描いた(ヘビ)
    const limbs = guru ? 0 : (info.legs >= 4 ? 1 : info.legs >= 2 ? 0.85 : info.legs === 1 ? 0.4 : 0) * 0.75 + (info.wings ? 0.35 : 0) + (info.tails ? 0.35 : 0); // しっぽ・ひれも体の部品
    const size = clamp((info.size - 0.012) / 0.1, 0, 1) * (1 - 0.3 * clamp((info.size - 0.6) / 0.35, 0, 1));
    const detail = clamp((info.strokes - 1) / 4, 0, 1) * (info.strokes > 40 ? 0.5 : 1);
    return clamp(0.3 * outline + 0.33 * clamp(limbs, 0, 1) + 0.24 * clean + 0.13 * detail, 0, 1) * (0.5 + 0.5 * size) * (guru ? 0.75 : 1);
  }
  function abilities(info) {
    if (info._ab) return info._ab;
    const guru = info.mode === 'guru';
    const L = guru ? 0 : info.legs;
    const asp = info.aspect, inv = 1 / Math.max(0.05, asp);
    const legK = L === 0 ? 0 : L === 1 ? 0.35 : L === 2 ? 0.82 : L === 3 ? 0.9 : L === 4 ? 0.97 : L === 5 ? 0.78 : L === 6 ? 0.62 : L <= 10 ? 0.62 - 0.08 * (L - 6) : 0.3; // 2〜4本足がいちばん走りやすい。多いと足がもつれる
    const legLong = L ? clamp((info.legLen || 0) / 0.42, 0, 1) : 0;
    const long = clamp((asp - 1.0) / 1.0, 0, 1) * (1 - clamp((asp - 3) / 2, 0, 1)); // 前後に伸びた体
    const tall = clamp((inv - 0.75) / 0.9, 0, 1);                                   // 縦に高い
    const tallThin = clamp((inv - 1.15) / 0.9, 0, 1);                               // 細くて背が高い(坂で転げる)
    const wide = clamp((asp - 1.05) / 0.9, 0, 1) * (1 - clamp((asp - 3.5) / 3, 0, 1)); // 低く横に広い
    const flat = clamp((asp - 1.3) / 1.5, 0, 1);                                    // 平たい
    const big = clamp((info.size - 0.06) / 0.3, 0, 1);
    const bigBody = info.bodyClosed ? big * clamp(info.bodyFill / 0.3, 0, 1) : 0.3 * big;
    const small = (1 - clamp((info.size - 0.05) / 0.25, 0, 1)) * (1 - clamp((info.bodyFill - 0.2) / 0.5, 0, 1)) * clamp(info.size / 0.06, 0, 1); // 体が小さく身軽(塊・点は身軽ではない)
    const heavy = (info.bodyClosed ? clamp(info.bodyFill / 0.35, 0, 1) : 0.3) * clamp((info.size - 0.03) / 0.25, 0, 1);
    const sharp = clamp((info.sharp || 0) / 5, 0, 1);
    const fins = clamp(((info.tails || 0) + 0.5 * (info.wings || 0)) / 2, 0, 1);
    const wingK = info.wings ? 0.5 + 0.5 * clamp(info.wingSpan, 0, 1) : 0;
    const spring = L === 0 ? 0.55 : L <= 2 ? 1 : L <= 4 ? 0.8 : L <= 6 ? 0.4 : 0.15;  // 跳ねそうな足
    const manyLegs = clamp((L - 1) / 7, 0, 1) * (L > 14 ? 0.6 : 1); // 多いほど坂を踏んばれる(8本まで)
    const roll = info.bodyClosed ? info.roundness * info.roundness * info.roundness * clamp(info.bodyFill * 1.5, 0, 1) : 0;
    const raw = {
      track: legK * (0.3 + 0.7 * legLong) + 0.4 * long * (L ? 1 : 0.4) + 0.3 * sharp - 0.25 * big - 0.3 * tall,
      obstacle: 0.5 * tall + 0.35 * small + 0.3 * spring + 0.35 * wingK - 0.55 * clamp((asp - 1.5) / 1.2, 0, 1) - 0.5 * clamp((L - 3) / 4, 0, 1),
      slope: 0.6 * manyLegs + 0.3 * (L >= 2 ? 1 - legLong : 0) + 0.35 * wide + 0.45 * heavy + 0.15 * roll - 0.55 * tallThin, // 短い足をたくさん踏んばる
      water: 0.45 * flat + 0.45 * fins + 0.4 * bigBody + 0.3 * long * (L ? 0.2 : 1) - 0.45 * legLong * (1 - 0.5 * flat), // 足のない長い体はくねって泳ぐ
    };
    if (guru) { for (const k of AB_KEYS) raw[k] = 0.1; } // 塗りつぶし・ぐちゃぐちゃは形にならない(どれも伸びない)
    const q = quality(info);
    // 出来ばえ Q が土台。4種目への配り方(share、合計1)で得意・不得意が決まる。
    // 手抜きの絵は得意な種目でも、ちゃんと描いた絵の不得意な種目と同じくらいにしかならない。
    const Q = (0.05 + 0.95 * q) * (guru ? 0.85 : 1);
    let sum = 0; for (const k of AB_KEYS) sum += 0.15 + Math.max(0, raw[k]);
    const ab = { q, roll, tip: tallThin, bal: clamp(info.sym * 0.85 + 0.1 - clamp(info.crossings / 60, 0, 1) * 0.8, 0, 1) };
    for (const k of AB_KEYS) ab[k] = clamp(Q * (0.35 + 1.9 * (0.15 + Math.max(0, raw[k])) / sum), 0.04, 1.4);
    Object.defineProperty(info, '_ab', { value: ab, enumerable: false });
    return ab;
  }
  // 能力 → 地面ごとの速さの倍率。a = その種目の得意さ
  function terrainMul(ab, terr, courseId) {
    const a = ab[courseId] != null ? ab[courseId] : ab.track;
    switch (terr) {
      case 'up': return 0.92 + 0.22 * a - 0.10 * ab.roll;
      case 'down': return 0.98 + 0.14 * a + 0.40 * ab.roll;
      case 'water': return 0.83 + 0.27 * a;
      case 'net': return 0.93 + 0.12 * a;
      case 'beam': return 0.87 + 0.12 * a + 0.18 * ab.bal;
      default: return 0.95 + 0.16 * a;
    }
  }

  // ---------- 型ごとの走り(見た目と越え方。速さは能力で決まる) ----------
  const MODE = {
    many: { hurdle: 'jump', burst: 0.02 },
    run2: { hurdle: 'jump', burst: 0.02 },
    run1: { hurdle: 'hop', burst: 0.03 },
    roll: { hurdle: 'bonk', burst: 0.02 },
    fly: { hurdle: 'fly', burst: 0.02, stall: 0.04 },
    worm: { hurdle: 'climb', burst: 0.02 },
    jelly: { hurdle: 'hop', burst: 0.025 },
    guru: { hurdle: 'random', burst: 0.04, burstMul: 1.6 },
  };
  function traitBonus() { return { accel: 1, tripMul: 1, hurdleMul: 1, notes: [] }; }

  // 得意・にがて(試験用。画面には出さない)
  function courseFit(info) {
    const res = {};
    for (const id of COURSE_IDS) {
      let tot = 0;
      for (let k = 0; k < 8; k++) tot += simulate([{ info }], id, 9001 + k * 131).times[0];
      res[id] = FINISH / (tot / 8);
    }
    const ids = Object.keys(res).sort((a, c) => res[c] - res[a]);
    return { score: res, best: ids[0], worst: ids[ids.length - 1] };
  }

  // ---------- レース ----------
  const BASE = 138;   // 1秒に進む量(コース 3000 → 約22秒)
  const DT = 1 / 60;
  const REC = 2;      // 2歩に1回記録 = 30コマ/秒
  // opts.cheers: [{s:歩の番号, who}] 応援で気合いが入った時(ひとりで走る時だけ。同じ種と同じ応援なら同じ結果)
  // opts.solo: タイムアタック(1体だけ。おにぎり・追い風なし)
  function simulate(entries, courseId, seed, opts) {
    opts = opts || {};
    const course = COURSES[courseId] || COURSES.track;
    const rnd = mulberry32(seed >>> 0);
    const N = entries.length;
    const R = entries.map((e, i) => {
      const info = e.info, m = MODE[info.mode] || MODE.jelly, ab = abilities(info);
      const knots = []; for (let k = 0; k < 140; k++) knots.push((rnd() - 0.5) * 2);
      return {
        i, info, m, ab, apt: ab[course.id] != null ? ab[course.id] : ab.track, x: 0, v: 0, air: 0, phase: rnd(), state: 'run', stun: 0, cross: null, burstT: 0, stallT: 0, itemT: 0, recT: 0, cheerT: 0,
        personal: 1 + (rnd() - 0.5) * 0.05, knots, finished: null, beamDone: false, fallAt: null, onBeam: false, offBeam: false,
        inWater: false, trips: 0, falls: 0, bonks: 0, bursts: 0, knocked: 0, splashes: 0, flyovers: 0, hurdleIdx: 0, fellOffBeam: false,
        items: 0, spurtAt: 0.70 + rnd() * 0.14, spurting: false, drafts: 0, itemIdx: 0, gust: false,
        reactT: 0.12 + rnd() * 0.25,
      };
    });
    // コース上のおにぎり: 3か所。それぞれ半分くらいのレーンに置く(運)
    const items = [];
    for (let k = 0; k < 3; k++) {
      const x = 650 + k * 650 + Math.floor(rnd() * 380);
      const lanes = []; for (let i = 0; i < N; i++) if (rnd() < 0.5) lanes.push(i);
      if (!lanes.length && N) lanes.push(Math.floor(rnd() * N));
      if (!opts.solo) items.push({ x, lanes });
    }
    // 追い風: 1回、うしろの半分に吹く
    const gustT = 6 + rnd() * 7, gustDur = 2.6;
    const cheers = (opts.cheers || []).slice().sort((a, b) => a.s - b.s);
    let ci = 0;
    const frames = []; const events = [];
    const ev = (t, type, who, extra) => events.push(Object.assign({ t, type, who }, extra || {}));
    let t = 0, step = 0, leader = -1, lastLeadEv = -9, gustOn = false, gustDone = !!opts.solo;
    const knocked = {};
    const prevX = new Float64Array(N);
    ev(0, 'start', -1);
    while (t < 120) {
      for (let i = 0; i < N; i++) prevX[i] = R[i].x;
      while (ci < cheers.length && cheers[ci].s <= step) { const c = cheers[ci++]; const r = R[c.who]; if (r && r.finished == null) { r.cheerT = 1.1; ev(t, 'cheer', c.who); } }
      if (!gustDone && !gustOn && t >= gustT) {
        gustOn = true;
        const ord = R.filter(r => r.finished == null).sort((a, b) => a.x - b.x);
        const back = ord.slice(0, Math.floor(ord.length / 2));
        for (const r of back) r.gust = true;
        if (back.length) ev(t, 'gust', -1, { lanes: back.map(r => r.i) });
      }
      if (gustOn && t >= gustT + gustDur) { gustOn = false; gustDone = true; for (const r of R) r.gust = false; }
      for (const r of R) {
        if (r.finished != null) { r.v *= 0.96; r.x += r.v * DT; continue; }
        if (t < r.reactT) continue;
        const terr = terrainAt(course, r.x);
        if (r.stun > 0) {
          r.stun -= DT; r.v *= 0.86; r.x += r.v * DT; r.state = r.fellOffBeam && r.stun > 0.6 ? 'fall' : 'down';
          if (r.stun <= 0) { r.state = 'run'; r.fellOffBeam = false; r.recT = 0.8; ev(t, 'recover', r.i); }
        } else if (r.cross) {
          const c = r.cross; c.t += DT;
          const p = clamp(c.t / c.dur, 0, 1);
          r.x = c.x0 + (c.x1 - c.x0) * p;
          r.air = c.h * 4 * p * (1 - p);
          r.state = c.kind;
          if (p >= 1) { r.cross = null; r.air = 0; r.state = 'run'; r.v = Math.max(r.v, BASE * 0.6); }
        } else {
          const n = r.knots, k0 = Math.floor(t), f = t - k0;
          const noise = (n[k0 % 140] * (1 - f) + n[(k0 + 1) % 140] * f) * 0.04;
          const terrK = terr === 'beam' && r.offBeam ? 'flat' : terr;
          let mult = terrainMul(r.ab, terrK, course.id);
          if (terrK === 'beam' && r.offBeam) mult = 0.9;
          mult *= r.personal * (1 + noise);
          // バテ(後半)とラストスパート
          const pr = r.x / FINISH;
          if (pr > 0.45) mult *= 1 - 0.12 * (1 - Math.min(1, r.apt)) * clamp((pr - 0.45) / 0.4, 0, 1);
          if (pr >= r.spurtAt) { if (!r.spurting) { r.spurting = true; ev(t, 'spurt', r.i); } mult *= 1.05 + 0.08 * Math.min(1, r.apt); }
          // すぐ前に誰かいると風よけ(抜きつ抜かれつ)
          let draft = false;
          for (let j = 0; j < N; j++) { if (j === r.i) continue; const gap = prevX[j] - r.x; if (gap > 25 && gap < 200 && R[j].finished == null) { draft = true; break; } }
          if (draft) { mult *= 1.035; r.drafts++; }
          if (r.gust) mult *= 1.10;
          if (r.burstT > 0) { r.burstT -= DT; mult *= r.m.burstMul || 1.3; }
          if (r.itemT > 0) { r.itemT -= DT; mult *= 1.2; }
          if (r.recT > 0) { r.recT -= DT; mult *= 1.15; }
          if (r.cheerT > 0) { r.cheerT -= DT; mult *= 1.10; }
          if (r.stallT > 0) { r.stallT -= DT; mult *= 0.55; }
          const target = Math.max(25, BASE * mult);
          const acc = 1.7 + 1.9 * Math.min(1, r.apt);
          r.v += (target - r.v) * Math.min(1, DT * acc);
          const nx = r.x + r.v * DT;
          // ハードル
          const hs = course.hurdles;
          if (r.hurdleIdx < hs.length && nx >= hs[r.hurdleIdx] - 34) {
            const hx = hs[r.hurdleIdx];
            let kind = r.m.hurdle;
            const lack = 1 - Math.min(1, r.ab.obstacle);
            let cost = 0.05 + 0.28 * lack * lack;
            if (kind === 'random') { const q = rnd(); kind = q < 0.4 ? 'jump' : q < 0.7 ? 'bonk' : 'climb'; cost += rnd() * 0.3; }
            let x0 = r.x, x1 = hx + 40, h = 70;
            if (kind === 'bonk') {
              if (rnd() < 0.3 + 0.5 * lack) { ev(t, 'bonk', r.i); r.bonks++; x0 = r.x - 24; cost += 0.3; h = 40; }
              else { kind = 'jump'; h = 45; }
            }
            if (kind === 'jump' && r.info.mode === 'many' && rnd() < 0.3 * lack) { kind = 'knock'; knocked[r.i + '_' + r.hurdleIdx] = t; ev(t, 'knock', r.i); r.knocked++; }
            if (kind === 'fly') { h = 95; r.flyovers++; if (r.flyovers === 1) ev(t, 'flyover', r.i); }
            if (kind === 'climb') { h = 52; ev(t, 'climb', r.i); }
            if (kind === 'hop') h = 80;
            if (kind === 'knock') h = 20;
            const dur = (x1 - x0) / Math.max(60, r.v) + cost;
            r.cross = { kind, x0, x1, dur, t: 0, h };
            r.hurdleIdx++;
            continue;
          }
          r.x = nx;
          r.state = (r.burstT > 0 || r.itemT > 0 || r.cheerT > 0) ? 'burst' : 'run';
          // おにぎり
          while (r.itemIdx < items.length && r.x >= items[r.itemIdx].x) {
            const it = items[r.itemIdx++];
            if (it.lanes.includes(r.i)) { r.itemT = 1.1; r.items++; ev(t, 'item', r.i, { k: r.itemIdx - 1 }); }
          }
          // 平均台
          if (course.beam && !r.beamDone && r.x >= course.beam[0]) {
            r.beamDone = true;
            const lb = 1 - r.ab.bal;
            if (rnd() < 0.04 + 0.5 * lb * lb) r.fallAt = course.beam[0] + 60 + rnd() * (course.beam[1] - course.beam[0] - 120);
            r.onBeam = true;
          }
          if (r.onBeam && r.fallAt != null && r.x >= r.fallAt) { r.onBeam = false; r.offBeam = true; r.fallAt = null; r.stun = 1.2; r.falls++; r.fellOffBeam = true; ev(t, 'fall', r.i); }
          if (r.onBeam && course.beam && r.x > course.beam[1]) r.onBeam = false;
          const wet = terr === 'water';
          if (wet && !r.inWater) { r.splashes++; ev(t, 'splash', r.i, { k: r.splashes }); }
          r.inWater = wet;
          // 偶然の出来事
          if (t > 1.2) {
            const lb = 1 - r.ab.bal;
            const tripRate = (0.006 + 0.075 * lb * lb) * (terr === 'down' ? 1.4 + 3 * r.ab.tip : terr === 'up' ? 1 + 2 * r.ab.tip : 1); // 細長く背が高いと坂で転げる
            if (rnd() < tripRate * DT) { r.stun = 0.75 + rnd() * 0.45; r.trips++; ev(t, 'trip', r.i); }
            else if (rnd() < r.m.burst * DT && r.burstT <= 0) { r.burstT = 1.2 + rnd() * 0.8; r.bursts++; ev(t, 'burst', r.i); }
            else if (r.m.stall && rnd() < r.m.stall * DT && r.stallT <= 0) { r.stallT = 0.9; ev(t, 'stall', r.i); }
          }
          r.air = r.info.mode === 'fly' ? 26 : 0;
        }
        r.phase += r.v * DT / 95;
        if (r.x >= FINISH && r.finished == null) {
          const over = (r.x - FINISH) / Math.max(1, r.v);
          r.finished = t + DT - over; ev(r.finished, 'finish', r.i);
        }
      }
      let li = 0; for (const r of R) if (r.x > R[li].x) li = r.i;
      if (li !== leader) { if (t - lastLeadEv > 2.5 && t > 2 && R[li].x < FINISH - 100) { ev(t, 'lead', li); lastLeadEv = t; } leader = li; }
      if (step % REC === 0) frames.push(R.map(r => [r.x, r.air + (r.onBeam ? 38 : 0), STATE_CODE[r.state] || 0, r.phase, r.v]));
      step++; t += DT;
      if (R.every(r => r.finished != null) && R.every(r => r.x > FINISH + 60 || r.v < 5)) break;
      if (R.every(r => r.finished != null) && t > Math.max(...R.map(r => r.finished)) + 2.5) break;
    }
    const order = R.slice().sort((a, b) => (a.finished == null ? 1e9 : a.finished) - (b.finished == null ? 1e9 : b.finished)).map(r => r.i);
    const rank = []; order.forEach((i, k) => { rank[i] = k + 1; });
    const photo = [];
    for (let k = 1; k < order.length; k++) { const a = R[order[k - 1]].finished, b = R[order[k]].finished; if (b - a < 0.12) photo.push([order[k - 1], order[k]]); }
    events.sort((a, b) => a.t - b.t);
    return {
      course: course.id, seed, frames, fps: 60 / REC, events, order, rank, photo, knocked, items, gust: opts.solo ? null : { t: gustT, dur: gustDur },
      times: R.map(r => r.finished),
      stats: R.map(r => ({ trips: r.trips, falls: r.falls, bonks: r.bonks, bursts: r.bursts, knocked: r.knocked, splashes: r.splashes, flyovers: r.flyovers, items: r.items, drafts: r.drafts, spurt: r.spurting })),
    };
  }
  // タイムアタック: 絵とコースと種から、だれが計算しても同じタイム(ランキングの照合に使う)
  function timeAttack(strokes, courseId, seed) {
    const info = analyze(strokes); if (!info) return null;
    const r = simulate([{ info }], courseId, seed, { solo: true });
    return r.times[0] == null ? null : Math.round(r.times[0] * 1000) / 1000;
  }
  const STATE_CODE = { run: 0, down: 1, fall: 2, jump: 3, hop: 4, bonk: 5, fly: 6, climb: 7, knock: 8, burst: 9 };
  const STATE_NAME = Object.keys(STATE_CODE);

  // ---------- CPU のらくがき ----------
  // 子どもが描いたような線: 決めた点を通る曲線に、手のゆれ(乱数をなめらかにつないだ物)を足す。三角関数は使わない。
  const C8 = [[0, -1], [0.7071, -0.7071], [1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071]];
  function catmull(pts, nPer) {
    const out = []; const P = [pts[0]].concat(pts, [pts[pts.length - 1]]);
    for (let i = 1; i < P.length - 2; i++) {
      const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
      for (let k = 0; k < nPer; k++) {
        const t = k / nPer, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map(j => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    out.push(pts[pts.length - 1]); return out;
  }
  function wobbly(key, rnd, n, amp) {
    const dense = catmull(key, 10);
    const out = []; const kn = [], km = [];
    for (let i = 0; i < 8; i++) { kn.push((rnd() - 0.5) * 2); km.push((rnd() - 0.5) * 2); }
    const L = [0]; for (let i = 1; i < dense.length; i++) L.push(L[i - 1] + dist(dense[i], dense[i - 1]));
    const tot = L[L.length - 1] || 1;
    let j = 0;
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1), d = s * tot;
      while (j < L.length - 2 && L[j + 1] < d) j++;
      const f = (d - L[j]) / ((L[j + 1] - L[j]) || 1);
      const ks = s * 7, k0 = Math.floor(ks), kf = ks - k0;
      const wx = kn[k0] * (1 - kf) + kn[Math.min(7, k0 + 1)] * kf, wy = km[k0] * (1 - kf) + km[Math.min(7, k0 + 1)] * kf;
      out.push([Math.round(dense[j][0] + (dense[j + 1][0] - dense[j][0]) * f + wx * amp + (rnd() - 0.5) * 2),
        Math.round(dense[j][1] + (dense[j + 1][1] - dense[j][1]) * f + wy * amp + (rnd() - 0.5) * 2)]);
    }
    return out;
  }
  function loop(cx, cy, rx, ry, rnd, jag) {
    const pts = C8.map(([c, s]) => [cx + c * rx * (1 + (rnd() - 0.5) * jag), cy + s * ry * (1 + (rnd() - 0.5) * jag)]);
    pts.push([pts[0][0] + (rnd() - 0.3) * rx * 0.25, pts[0][1] + rnd() * ry * 0.15]);
    return pts;
  }
  const CPU_DEFS = [
    { id: 'tako', name: 'タコ足タケシ', color: '#e2483d', say: '足は多いが息が合わない!', build(r) {
      const S = [{ k: loop(300, 250, 95, 80, r, 0.18), n: 60 }];
      S.push({ k: [[262, 238], [266, 252]], n: 4 }, { k: [[330, 236], [333, 250]], n: 4 });
      for (let i = 0; i < 8; i++) { const x = 222 + i * 22; S.push({ k: [[x, 315], [x - 12 + (i % 3) * 8, 380], [x + 6 - (i % 2) * 14, 448]], n: 14 }); }
      return S;
    } },
    { id: 'koro', name: 'コロ田まるお', color: '#f08a24', say: 'どっちが前かわからない!', build(r) {
      return [{ k: loop(300, 300, 150, 145, r, 0.07), n: 80 }, { k: loop(270, 270, 14, 16, r, 0.2), n: 12 }, { k: [[255, 350], [300, 372], [345, 348]], n: 12 }];
    } },
    { id: 'pata', name: '羽根田パタ子', color: '#2f6fe0', say: '飛ぶのは反則じゃないのか!', build(r) {
      return [
        { k: loop(300, 320, 70, 55, r, 0.15), n: 50 },
        { k: [[240, 300], [190, 230], [160, 262], [120, 200], [96, 250], [60, 210], [70, 290], [150, 320], [232, 318]], n: 40 },
        { k: [[360, 300], [410, 225], [440, 260], [480, 195], [505, 245], [545, 205], [535, 290], [455, 318], [368, 318]], n: 40 },
        { k: [[370, 305], [400, 314], [372, 322]], n: 8 }, { k: [[325, 300], [328, 312]], n: 4 },
        { k: [[285, 372], [280, 420]], n: 8 }, { k: [[318, 372], [322, 420]], n: 8 },
      ];
    } },
    { id: 'naga', name: 'なが〜い田中', color: '#2fa35a', say: 'まだ胴体がスタート地点!', build(r) {
      const top = [[60, 300], [140, 280], [230, 300], [320, 278], [410, 300], [500, 282], [550, 300]];
      const bot = [[550, 300], [535, 345], [470, 345], [380, 360], [290, 340], [200, 360], [110, 345], [62, 340], [60, 300]];
      return [{ k: top.concat(bot.slice(1)), n: 110 }, { k: [[520, 304], [523, 316]], n: 4 }, { k: [[505, 330], [530, 333]], n: 5 },
        { k: [[200, 290], [205, 350]], n: 6 }, { k: [[330, 285], [335, 345]], n: 6 }];
    } },
    { id: 'gucha', name: 'ぐちゃ山くん', color: '#8a4fd8', say: '生き物かどうかも怪しい!', build(r) {
      const S = [];
      for (let k = 0; k < 4; k++) {
        const pts = []; let x = 300, y = 300;
        for (let i = 0; i < 14; i++) { x = 300 + (r() - 0.5) * 230; y = 300 + (r() - 0.5) * 200; pts.push([x, y]); }
        S.push({ k: pts, n: 70 });
      }
      S.push({ k: loop(255, 190, 14, 14, r, 0.2), n: 10 }, { k: loop(335, 195, 12, 13, r, 0.2), n: 10 });
      return S;
    } },
  ];

  // ---------- 毎回ちがう CPU(10/17): 手で決めた12種の骨組み × 大きさ・向き・足の数・線のくせ・色の組み合わせ ----------
  const CRAYON = ['#e2483d', '#f08a24', '#e8b920', '#2fa35a', '#2f6fe0', '#8a4fd8', '#d94f9b', '#19263d', '#7a4a2b', '#12a3a3', '#5b6b7a', '#c0392b'];
  const NAME_A = ['ぽよ', 'ころ', 'もぐ', 'ふわ', 'どた', 'すい', 'ちび', 'でか', 'のそ', 'ぱた', 'もこ', 'ぴょん', 'てく', 'ぐる', 'ぷに', 'ばた', 'ほわ', 'ずん', 'にょろ', 'ぺた'];
  const NAME_B = ['丸', 'ぽん', 'スケ', 'ちゃん', 'くん', 'ボウ', 'リン', 'ッコ', '太', 'みん', 'すけ', 'ピー', 'ル', '助', 'まる', 'ぞう'];
  function pick(r, a) { return a[Math.floor(r() * a.length) % a.length]; }
  function rr(r, a, b) { return a + (b - a) * r(); }
  function eyes(r, x, y, gap, S, ink) {
    const t = Math.floor(r() * 5);
    if (t === 4) return;
    const e = (ex) => {
      if (t === 0) S.push({ k: [[ex, y], [ex + 2, y + 3]], n: 4, c: ink });
      else if (t === 1) S.push({ k: loop(ex, y, 9, 9, r, 0.2), n: 10, c: ink });
      else if (t === 2) { S.push({ k: [[ex - 7, y - 7], [ex + 7, y + 7]], n: 5, c: ink }, { k: [[ex + 7, y - 7], [ex - 7, y + 7]], n: 5, c: ink }); }
      else S.push({ k: loop(ex, y, 13, 11, r, 0.2), n: 12, c: ink }, { k: [[ex + 1, y], [ex + 3, y + 2]], n: 3, c: ink });
    };
    e(x - gap); if (r() < 0.9) e(x + gap);
  }
  function legs(r, S, xs, y0, len, col, bend) { for (const x of xs) { if (r() < 0.06) continue; const l = len * rr(r, 0.8, 1.2), b = (r() - 0.5) * bend; S.push({ k: [[x, y0], [x + b, y0 + l * 0.5], [x + b * 1.6 + (r() - 0.5) * 8, y0 + l]], n: 12, c: col }); } }
  const KINDS = {
    dog(r, c, ink) { const L = rr(r, 100, 150), H = rr(r, 55, 85), S = [{ k: loop(280, 280, L, H, r, 0.2), n: 60, c }, { k: loop(280 + L + 25, 240, rr(r, 35, 55), rr(r, 30, 45), r, 0.2), n: 30, c }];
      S.push({ k: [[280 - L, 250], [280 - L - rr(r, 20, 60), 200 + r() * 60]], n: 8, c }); eyes(r, 280 + L + 30, 232, 12, S, ink);
      if (r() < 0.6) S.push({ k: [[280 + L + 10, 205], [280 + L + 5, 170], [280 + L + 28, 195]], n: 10, c });
      const n = r() < 0.2 ? 2 : 4; legs(r, S, n === 2 ? [230, 330] : [190, 240, 320, 370], 280 + H * 0.85, rr(r, 70, 140), c, 14); return S; },
    cat(r, c, ink) { const R = rr(r, 85, 125), S = [{ k: loop(300, 330, R, R * rr(r, 0.8, 1.05), r, 0.18), n: 60, c }];
      S.push({ k: [[225, 262], [215, 205], [262, 245]], n: 10, c }, { k: [[338, 245], [382, 205], [376, 265]], n: 10, c });
      eyes(r, 300, 310, rr(r, 28, 42), S, ink); S.push({ k: [[285, 345], [300, 355], [315, 345]], n: 8, c: ink });
      for (let i = 0; i < 3; i++) S.push({ k: [[200, 335 + i * 10], [150, 330 + i * 18]], n: 6, c: ink }, { k: [[400, 335 + i * 10], [450, 330 + i * 18]], n: 6, c: ink });
      legs(r, S, [255, 345], 330 + R * 0.9, rr(r, 20, 45), c, 8); if (r() < 0.8) S.push({ k: [[400, 400], [470, 380], [500, 320], [470, 270]], n: 16, c }); return S; },
    fish(r, c, ink) { const L = rr(r, 120, 200), H = rr(r, 50, 90), S = [{ k: loop(280, 300, L, H, r, 0.15), n: 60, c }];
      S.push({ k: [[280 - L + 5, 300], [280 - L - rr(r, 50, 90), 245], [280 - L - rr(r, 40, 70), 355], [280 - L + 5, 300]], n: 22, c });
      S.push({ k: [[250, 300 - H], [270, 300 - H - rr(r, 30, 60)], [320, 300 - H + 3]], n: 12, c }); eyes(r, 280 + L * 0.6, 285, 1, S, ink);
      if (r() < 0.6) for (let i = 0; i < 4; i++) S.push({ k: [[250 + i * 30, 285], [262 + i * 30, 300], [250 + i * 30, 315]], n: 6, c: ink });
      if (r() < 0.5) legs(r, S, [260, 320], 300 + H * 0.9, 45, c, 10); return S; },
    bug(r, c, ink) { const R = rr(r, 60, 105), S = [{ k: loop(300, 300, R * 1.3, R, r, 0.15), n: 50, c }, { k: loop(300 + R * 1.3 + 25, 295, 30, 28, r, 0.2), n: 20, c }];
      S.push({ k: [[300, 300 - R], [300, 300 + R]], n: 10, c }); eyes(r, 300 + R * 1.3 + 28, 288, 9, S, ink);
      S.push({ k: [[300 + R * 1.3 + 40, 270], [300 + R * 1.3 + 70, 220]], n: 6, c }, { k: [[300 + R * 1.3 + 25, 268], [300 + R * 1.3 + 30, 215]], n: 6, c });
      const k = r() < 0.5 ? 3 : r() < 0.5 ? 2 : 4; const xs = []; for (let i = 0; i < k; i++) xs.push(300 - R + (i + 0.5) * (2 * R * 1.1 / k)); legs(r, S, xs, 300 + R * 0.9, rr(r, 40, 80), c, 40);
      if (r() < 0.5) for (let i = 0; i < 3; i++) S.push({ k: loop(270 + i * 35, 285 + (i % 2) * 20, 9, 9, r, 0.2), n: 10, c: ink }); return S; },
    snail(r, c, ink) { const R = rr(r, 70, 110), S = [{ k: loop(290, 270, R, R, r, 0.1), n: 50, c }];
      const sp = []; for (let i = 0; i < 14; i++) { const a = i * 0.7, rad = R * 0.85 * (1 - i / 16); sp.push([290 + rad * Math.max(-1, Math.min(1, Math.sin(a))), 270 - rad * Math.max(-1, Math.min(1, Math.cos(a)))]); }
      S.push({ k: sp, n: 40, c: ink }); const by = 270 + R; S.push({ k: [[130, by], [200, by + 22], [380, by + 22], [470, by - 20], [490, by - 80]], n: 40, c }, { k: [[130, by], [270, by - 6]], n: 14, c });
      S.push({ k: [[470, by - 20], [455, by - 70], [450, by - 100]], n: 10, c }, { k: [[490, by - 80], [505, by - 120]], n: 8, c }); eyes(r, 490, by - 60, 1, S, ink); return S; },
    dino(r, c, ink) { const L = rr(r, 100, 140), S = [{ k: loop(290, 300, L, rr(r, 60, 90), r, 0.2), n: 60, c }];
      S.push({ k: [[290 - L, 300], [290 - L - 80, 340], [290 - L - 130, 380]], n: 14, c }, { k: [[290 + L * 0.7, 250], [290 + L * 0.9 + 20, 160], [290 + L * 0.9 + 55, 130]], n: 14, c });
      S.push({ k: loop(290 + L * 0.9 + 85, 125, 45, 28, r, 0.2), n: 24, c }); eyes(r, 290 + L * 0.9 + 100, 118, 1, S, ink);
      if (r() < 0.8) for (let i = 0; i < 5; i++) S.push({ k: [[200 + i * 35, 245 - (i % 2) * 10], [212 + i * 35, 205 - (i % 2) * 15], [225 + i * 35, 248]], n: 8, c });
      legs(r, S, [r() < 0.5 ? 230 : 260, 350], 355, rr(r, 90, 140), c, 10); return S; },
    bird(r, c, ink) { const R = rr(r, 55, 85), S = [{ k: loop(300, 310, R * 1.2, R, r, 0.18), n: 50, c }, { k: loop(300 + R * 1.1, 250, 32, 30, r, 0.2), n: 20, c }];
      S.push({ k: [[300 + R * 1.1 + 28, 248], [300 + R * 1.1 + 60, 258], [300 + R * 1.1 + 28, 266]], n: 8, c: pick(r, CRAYON) }); eyes(r, 300 + R * 1.1 + 10, 240, 1, S, ink);
      if (r() < 0.75) { const sp = rr(r, 90, 170); S.push({ k: [[270, 290], [250 - sp * 0.3, 240 - sp * 0.6], [230 - sp * 0.7, 230 - sp], [200 - sp, 270 - sp * 0.4], [240, 330]], n: 30, c }); }
      S.push({ k: [[300 - R * 1.2, 310], [300 - R * 1.2 - 60, 330]], n: 8, c }); legs(r, S, [285, 325], 310 + R, rr(r, 35, 70), c, 6); return S; },
    snake(r, c, ink) { const pts = []; const y0 = rr(r, 230, 330), amp = rr(r, 25, 70), cnt = 4 + Math.floor(r() * 3);
      for (let i = 0; i <= cnt; i++) pts.push([70 + i * (430 / cnt), y0 + (i % 2 ? amp : -amp) + (r() - 0.5) * 30]);
      const S = [{ k: pts, n: 50 + cnt * 8, c }, { k: pts.map(q => [q[0], q[1] + 28]), n: 50 + cnt * 8, c }, { k: loop(pts[cnt][0] + 20, pts[cnt][1] + 14, 32, 26, r, 0.2), n: 20, c }];
      eyes(r, pts[cnt][0] + 25, pts[cnt][1] + 6, 1, S, ink); S.push({ k: [[pts[cnt][0] + 50, pts[cnt][1] + 14], [pts[cnt][0] + 85, pts[cnt][1] + 8]], n: 6, c: '#c0392b' }); return S; },
    octo(r, c, ink) { const R = rr(r, 70, 100), S = [{ k: loop(300, 230, R, R * 1.1, r, 0.15), n: 50, c }]; eyes(r, 300, 240, R * 0.4, S, ink);
      const k = 4 + Math.floor(r() * 5); for (let i = 0; i < k; i++) { const x = 300 - R + (i + 0.5) * (2 * R / k), d = (r() - 0.5) * 70; S.push({ k: [[x, 320], [x + d, 390], [x - d * 0.5, 450], [x + d * 0.8, 500 + r() * 30]], n: 18, c }); } return S; },
    rabbit(r, c, ink) { const R = rr(r, 70, 105), S = [{ k: loop(300, 360, R, R * 0.95, r, 0.15), n: 50, c }, { k: loop(300, 230, R * 0.62, R * 0.55, r, 0.15), n: 36, c }];
      const e = rr(r, 70, 130); S.push({ k: [[272, 190], [260, 190 - e], [290, 195]], n: 14, c }, { k: [[322, 188], [345, 190 - e], [330, 200]], n: 14, c }); eyes(r, 300, 225, 20, S, ink);
      legs(r, S, [255, 345], 360 + R * 0.9, rr(r, 25, 60), c, 14); S.push({ k: loop(300 - R - 10, 380, 18, 18, r, 0.2), n: 12, c }); return S; },
    turtle(r, c, ink) { const R = rr(r, 85, 130), S = [{ k: [[300 - R, 330], [300 - R * 0.8, 250], [300, 215], [300 + R * 0.8, 250], [300 + R, 330], [300 - R, 330]], n: 50, c }];
      for (let i = 0; i < 3; i++) S.push({ k: [[300 - R * 0.5 + i * R * 0.5, 335], [300 - R * 0.4 + i * R * 0.4, 235]], n: 8, c: ink });
      S.push({ k: loop(300 + R + 38, 290, 36, 28, r, 0.2), n: 20, c }); eyes(r, 300 + R + 45, 282, 1, S, ink); legs(r, S, [300 - R * 0.6, 300 - R * 0.15, 300 + R * 0.3, 300 + R * 0.7], 335, rr(r, 30, 55), c, 6); return S; },
    giraffe(r, c, ink) { const S = [{ k: loop(270, 330, rr(r, 90, 120), rr(r, 50, 70), r, 0.18), n: 50, c }], nl = rr(r, 130, 210);
      S.push({ k: [[340, 290], [360, 290 - nl * 0.5], [365, 290 - nl]], n: 14, c }, { k: [[385, 285], [385, 290 - nl], [365, 290 - nl]], n: 14, c });
      S.push({ k: loop(385, 290 - nl - 14, 36, 22, r, 0.2), n: 20, c }); eyes(r, 392, 290 - nl - 18, 1, S, ink);
      for (let i = 0; i < 4; i++) S.push({ k: loop(220 + i * 30, 320 + (i % 2) * 22, 9, 9, r, 0.3), n: 10, c: ink }); legs(r, S, [200, 235, 305, 340], 375, rr(r, 100, 160), c, 8); return S; },
    ghost(r, c, ink) { const W = rr(r, 70, 110), H = rr(r, 100, 150), x = 300, y = 220, S = [];
      S.push({ k: [[x - W, y + H], [x - W - 5, y + 20], [x - W * 0.5, y - H * 0.5], [x, y - H * 0.7], [x + W * 0.5, y - H * 0.5], [x + W + 5, y + 20], [x + W, y + H], [x + W * 0.5, y + H - 25], [x, y + H], [x - W * 0.5, y + H - 25], [x - W, y + H]], n: 70, c });
      eyes(r, x, y, W * 0.35, S, ink); S.push({ k: loop(x, y + 55, 14, 18, r, 0.2), n: 12, c: ink });
      if (r() < 0.6) S.push({ k: [[x - W, y + 20], [x - W - 50, y + 60]], n: 8, c }, { k: [[x + W, y + 20], [x + W + 50, y + 60]], n: 8, c }); return S; },
    crab(r, c, ink) { const R = rr(r, 85, 120), S = [{ k: loop(300, 320, R * 1.2, R * 0.7, r, 0.18), n: 50, c }];
      S.push({ k: [[285, 255], [280, 215]], n: 5, c }, { k: [[320, 255], [325, 215]], n: 5, c }); S.push({ k: loop(280, 205, 10, 10, r, 0.2), n: 8, c: ink }, { k: loop(325, 205, 10, 10, r, 0.2), n: 8, c: ink });
      S.push({ k: [[300 - R * 1.2, 300], [300 - R * 1.2 - 40, 230], [300 - R * 1.2 - 20, 190], [300 - R * 1.2 - 55, 200], [300 - R * 1.2 - 60, 250]], n: 20, c }, { k: [[300 + R * 1.2, 300], [300 + R * 1.2 + 40, 230], [300 + R * 1.2 + 20, 190], [300 + R * 1.2 + 55, 200], [300 + R * 1.2 + 60, 250]], n: 20, c });
      legs(r, S, [240, 270, 330, 360], 360, rr(r, 40, 80), c, 50); return S; },
  };
  const KIND_IDS = Object.keys(KINDS);
  function randomDoodle(r, kind) {
    const c = pick(r, CRAYON), ink = r() < 0.6 ? '#19263d' : pick(r, CRAYON), multi = r() < 0.25;
    const S0 = KINDS[kind](r, c, ink);
    const sc = rr(r, 0.55, 1.1), sx = sc * rr(r, 0.85, 1.2), sy = sc * rr(r, 0.85, 1.2), flip = r() < 0.5, dx = (r() - 0.5) * 60, dy = (r() - 0.5) * 60;
    const w = Math.round(rr(r, 6, 15)), amp = rr(r, 1.5, 7), tilt = (r() - 0.5) * 0.25;
    const f = (p) => { let x = (p[0] - 300) * sx, y = (p[1] - 300) * sy; y += x * tilt; if (flip) x = -x; return [Math.max(25, Math.min(575, 300 + x + dx)), Math.max(25, Math.min(575, 300 + y + dy))]; };
    return S0.map((s, i) => ({ c: multi && i > 0 && r() < 0.35 ? pick(r, CRAYON) : (s.c || c), w: Math.max(5, w + (r() < 0.3 ? Math.round((r() - 0.5) * 4) : 0)), p: wobbly(s.k.map(f), r, s.n, amp) }));
  }
  function cpuName(r) { return pick(r, NAME_A) + pick(r, NAME_B); }
  // seed ごとに別の顔ぶれ。候補を多めに作り、できばえ順に散らして選ぶ(強い子と弱い子がまざる)。avoid={kinds,names}=直前に出た物
  function randomCpus(seed, n, avoid) {
    const r = mulberry32((seed ^ 0x9e3779b9) >>> 0), av = avoid || {};
    const cand = [];
    for (let i = 0; i < n * 3; i++) {
      let kind = pick(r, KIND_IDS), t = 0; while (av.kinds && av.kinds.indexOf('r_' + kind) >= 0 && t++ < 4) kind = pick(r, KIND_IDS);
      const strokes = randomDoodle(r, kind); const info = analyze(strokes); if (!info) continue;
      let name = cpuName(r); t = 0; while (av.names && av.names.indexOf(name) >= 0 && t++ < 4) name = cpuName(r);
      cand.push({ v: 1, name, created: '2026-10-17', strokes, cpu: 'r_' + kind, _q: quality(info) });
    }
    cand.sort((a, b) => a._q - b._q);
    const out = [], used = {}, m = cand.length;
    for (let i = 0; i < n; i++) {
      const lo = Math.floor(i * m / n), hi = Math.max(lo + 1, Math.floor((i + 1) * m / n)); let best = null;
      for (let t = 0; t < 6; t++) { const c = cand[lo + Math.floor(r() * (hi - lo))]; if (!c || out.indexOf(c) >= 0) continue; if ((used[c.cpu] || 0) < 2) { best = c; break; } if (!best) best = c; }
      if (!best) best = cand.find(c => out.indexOf(c) < 0);
      used[best.cpu] = (used[best.cpu] || 0) + 1; out.push(best);
    }
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = out[i]; out[i] = out[j]; out[j] = t; }
    out.forEach(c => { delete c._q; });
    return out;
  }
  function cpuCreature(def, seed) {
    const r = mulberry32(hashStr(def.id) ^ (seed || 0));
    const strokes = def.build(r).map(s => ({ c: def.color, w: 9, p: wobbly(s.k, r, s.n, 3.5) }));
    return { v: 1, name: def.name, created: '2026-10-14', strokes, cpu: def.id };
  }

  const API = { mulberry32, hashStr, clamp, Creature, Challenge, COURSE_IDS, analyze, COURSES, FINISH, groundH, terrainAt, MODE, traitBonus, courseFit, simulate, STATE_NAME, CPU_DEFS, cpuCreature, randomCpus, TYPE_NAMES, BASE, rdp, abilities, quality, AB_KEYS, terrainMul, timeAttack };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.RU = API;
})(typeof window !== 'undefined' ? window : globalThis);
