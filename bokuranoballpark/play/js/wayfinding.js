// 迷わない案内(11/18 夜、持ち主「どこから球場内に入ればいいか分からない」)
// 画面の右上に小さな丸い地図(自分の向きが上)と、近くの入口への矢印の札(「席へ」「コンコースへ」「グラウンドへ」「入場口へ」)。
// 道の一覧は passages.js(models/passages.json)から。歩く・観戦の時だけ出す。見た目は UI v5(紺の地・黄の強調・白に紺の縁の字)。
// 11/20 午後 持ち主「右上押したら全体とかが見られるような感じに」: 丸い地図を押す(または M)と、球場全体の大きな地図を開く(docs/全体の地図.md)。
//  ・大きな地図は開いた時だけ描く。閉じている間は何もしない。開いている間はゲームを止める(main.js の overlay。試合も止まる)
//  ・売店・チケット売り場・仕事の受付・マスコットの位置は freeplay.js が置いた結果をそのまま読む(readMarks)。地図の側では位置を持たない
//  ・印を押すと、そこを行き先にして、右上の札の矢印がそこを指す(着いたら消える)
const NAVY = '#06264a', YEL = '#fdc803';
const SIMPLE = () => typeof window !== 'undefined' && !!window.__fpSimple;   // すっきりの形(js/freeplay.js。?fpfull=1 で前の形)
// 売店の種類 → 地図の印(色・中の字・凡例の名前)
const SHOP_CATS = [
  { k: 'drink', re: /ビール|ビア|サワー|ブルワリー|バー$|ドリンク|ソーダ|自動販売機|自販機|ジュース|お茶|コーヒー|珈琲|ふなびスタンド/, col: '#38a8f0', ch: '飲', name: '飲み物・ビール' },
  { k: 'sweet', re: /甘|あまみ|かき氷|アイス|ソフト|スイーツ|クレープ|ドーナツ|パフェ/, col: '#f07aa8', ch: '甘', name: '甘い物・かき氷' },
  { k: 'goods', re: /グッズ|おみやげ|みやげ|土産|ショップ|ストア|チームの店/, col: '#a77bf0', ch: 'グ', name: 'グッズ・おみやげ' },
  { k: 'store', re: /コンビニ|売店|ワゴン/, col: '#2fb5a0', ch: '店', name: '売店・コンビニ' },
  { k: 'food', re: /./, col: '#f08a2c', ch: '食', name: '食べ物の店' },
];
const shopCat = (name) => SHOP_CATS.find((c) => c.re.test(name || '')) || SHOP_CATS[SHOP_CATS.length - 1];
const SPOT = {   // 売店のほかの印
  booth: { col: YEL, ch: '券', name: 'チケット売り場', sq: true },
  desk: { col: '#7ccf4a', ch: '仕', name: '仕事の受付' },
  mascot: { col: '#ffffff', ch: 'パ', name: 'マスコット(パン太)' },
  gate: { col: '#3ddc84', name: '入場ゲート(番号)', sq: true },
  vom: { col: '#ffe36a', name: '通路口(客席・コンコースの出入口)' },
  path: { col: '#6ec6ff', name: 'ベンチ・裏の通路' },
  toilet: { col: '#8fd0ff', ch: 'W', name: 'トイレ', sq: true },
};

export class Wayfind {
  // o: passages, getState, isTouch と、大きな地図に使う物(main.js から): getFp(自由に遊ぶ)・seats(席の位置)・fence(本塁からの柵の距離)・
  //    stadiumName・isOverlay・setOverlay・releasePointer・lockPointer・getMode・toast
  constructor(o) {
    const { passages, getState, isTouch } = o;
    this.o = o; this.P = passages; this.getState = getState; this.touch = isTouch;
    this.items = passages ? passages.nav().filter((it) => it.kind !== 'void' && it.kind !== 'rail' && it.kind !== 'solid' && it.kind !== 'plaza' && it.kind !== 'patch' && it.kind !== 'hide' && !(it.kind === 'path' && !it.label)) : [];
    this.el = null; this.t = 0; this.on = false; this.dest = null; this.mapOn = false;
    if (!this.items.length) return;
    const el = document.createElement('div'); el.id = 'wayf';
    el.innerHTML = '<canvas width="240" height="240" role="button" aria-label="球場の地図を開く" title="押すと球場全体の地図(M)"></canvas><div class="wf-chip"><i class="wf-arrow"></i><span class="wf-txt"></span></div>';
    document.body.appendChild(el); this.el = el;
    this.cv = el.querySelector('canvas'); this.g = this.cv.getContext('2d');
    this.chip = el.querySelector('.wf-chip'); this.arrow = el.querySelector('.wf-arrow'); this.txt = el.querySelector('.wf-txt');
    this.cv.addEventListener('click', (e) => { e.stopPropagation(); this.openMap(); });
    const st = document.createElement('style');
    st.textContent = `#wayf{position:fixed;right:10px;top:64px;z-index:6;display:none;flex-direction:column;align-items:flex-end;gap:6px;pointer-events:none;font-family:var(--v5-head,"Meiryo",sans-serif)}
#wayf canvas{width:120px;height:120px;border-radius:50%;background:rgba(6,38,74,.62);border:3px solid rgba(255,255,255,.85);box-shadow:0 3px 0 rgba(0,0,0,.3);pointer-events:auto;cursor:pointer;touch-action:manipulation}
#wayf .wf-chip{display:flex;align-items:center;gap:6px;max-width:220px;padding:5px 10px 5px 6px;border-radius:14px;background:rgba(6,38,74,.72);border:2px solid var(--v5-yellow,#fdc803);
 color:#fff;font-weight:900;font-size:14px;line-height:1.2;-webkit-text-stroke:0;text-shadow:0 1px 0 rgba(0,0,0,.5)}
#wayf .wf-arrow{flex:0 0 22px;height:22px;background:var(--v5-yellow,#fdc803);clip-path:polygon(50% 0,100% 55%,68% 55%,68% 100%,32% 100%,32% 55%,0 55%);transition:transform .15s}
#wayf.hide-chip .wf-chip{display:none}
@media (max-width:640px),(pointer:coarse){#wayf{top:58px;right:6px}#wayf canvas{width:92px;height:92px}#wayf .wf-chip{font-size:12px;max-width:170px}}
#wfMap{position:fixed;inset:0;z-index:31;display:flex;align-items:center;justify-content:center;background:rgba(2,20,45,.5);padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));font-family:var(--v5-head,"Meiryo",sans-serif)}
#wfMap.hide{display:none}
#wfMap .box{width:min(1180px,100%);height:min(860px,100%);display:flex;flex-direction:column;background:rgba(2,40,90,.95);border:3px solid var(--v5-light,#d1eefd);border-radius:18px;
 box-shadow:0 12px 30px rgba(0,0,0,.45);color:#fff;overflow:hidden}
#wfMap .hd{display:flex;align-items:center;gap:8px;padding:8px 8px 6px 14px;flex-wrap:wrap}
#wfMap .hd h3{flex:1 1 auto;margin:0;font-size:19px;font-weight:900;line-height:1.25;min-width:0}
#wfMap .hd h3 small{display:block;font-size:13px;font-weight:800;color:var(--v5-yellow2,#fae957)}
#wfMap .lv{display:flex;gap:4px;flex-wrap:wrap}
#wfMap button{min-height:44px;min-width:44px;padding:0 12px;border-radius:12px;border:2px solid rgba(209,238,253,.7);background:rgba(1,92,215,.6);color:#fff;font:inherit;font-weight:900;font-size:15px;cursor:pointer}
#wfMap .lv button.on{background:${YEL};color:${NAVY};border-color:#fff}
#wfMap .lv button.here::after{content:" ●";color:#ff5a5a}
#wfMap .x{background:var(--v5-blue,#0152ae);border-color:#fff}
@media (max-width:560px){#wfMap .hd h3{order:1}#wfMap .x{order:2}#wfMap .lv{order:3;flex:1 0 100%}#wfMap .lv button{padding:0 10px;font-size:14px}}
#wfMap .bd{flex:1;display:flex;min-height:0;gap:8px;padding:0 8px 8px}
#wfMap .cvw{position:relative;flex:1;min-width:0;min-height:0;border-radius:12px;overflow:hidden;background:#0b3550}
#wfMap .cvw canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab}
#wfMap .zm{position:absolute;right:6px;bottom:6px;display:flex;flex-direction:column;gap:6px}
#wfMap .zm button{width:44px;padding:0;background:rgba(6,38,74,.85)}
#wfMap .dst{position:absolute;left:6px;top:6px;right:58px;display:flex;align-items:center;gap:8px;pointer-events:none}
#wfMap .dst span{padding:4px 10px;border-radius:10px;background:rgba(6,38,74,.85);border:2px solid ${YEL};font-size:14px;font-weight:900;line-height:1.3}
#wfMap .dst button{pointer-events:auto;background:rgba(6,38,74,.85);white-space:nowrap;flex:0 0 auto}
#wfMap .dst .go{flex:0 0 auto;display:block;width:auto;min-height:44px;margin:0;font-size:15px;letter-spacing:0;box-shadow:none;background:${YEL};color:${NAVY};border-color:#fff}
#wfMap .dst span{flex:0 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#wfMap .dst.hide{display:none}
#wfMap .lg{flex:0 0 220px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;font-size:14px;font-weight:800;line-height:1.25;padding:2px 4px}
#wfMap .lg .t{font-size:13px;color:var(--v5-yellow2,#fae957);margin:6px 0 2px}
#wfMap .lg .i{display:flex;align-items:center;gap:8px;min-height:24px}
#wfMap .lg .i i{flex:0 0 22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:12px;font-weight:900;color:${NAVY};border:2px solid ${NAVY}}
#wfMap .lg .i i.sq{border-radius:4px}
#wfMap .lg .i b{margin-left:auto;font-size:12px;opacity:.75}
#wfMap .ft{padding:0 14px 8px;font-size:13px;font-weight:700;opacity:.9}
@media (max-width:760px){#wfMap .bd{flex-direction:column}#wfMap .ft{font-size:12px;padding:0 10px 6px}#wfMap .lg{flex:0 0 auto;max-height:26%;display:grid;grid-template-columns:1fr 1fr;column-gap:10px;font-size:13px}#wfMap .lg .t{grid-column:1/-1;margin:2px 0 0}}
@media (max-height:460px){#wfMap .bd{flex-direction:row}#wfMap .lg{flex:0 0 200px;max-height:none;display:flex;font-size:12px}#wfMap .hd{padding:4px 6px 2px 10px}#wfMap .hd h3{font-size:16px}#wfMap .hd h3 small{font-size:11px}#wfMap .ft{display:none}}`;
    document.head.appendChild(st);
  }
  setVisible(v) { this.on = v; if (this.el) this.el.style.display = v ? 'flex' : 'none'; }
  // その時の場所から、出す案内を決める(地図で行き先を選んでいればそれ)
  _target(s) {
    if (this.dest) {
      const p = this.dest.p, d = Math.hypot(p[0] - s.x, p[2] - s.z) + Math.abs(p[1] - s.y) * 0.5;
      if (d < 3.5) { const t = this.dest.text; this.dest = null; if (this.o.toast && !SIMPLE()) this.o.toast(`着きました: ${t}`); }
      else return { p, d, text: `${this.dest.text}へ`, mine: true };
    }
    if (SIMPLE()) return null;   // 11/20 夜 持ち主「緑の案内はぶっちゃけなくていい」「コンコースへみたいなのも案内いらない」: 行き先の札は出さない(地図で選んだ行き先は地図の上の印だけ)
    const near = (pick, kind, end) => {
      let best = null, bd = 1e9;
      for (const it of this.items) {
        if (kind && !kind.includes(it.kind)) continue; if (pick && !pick(it)) continue;
        const p = end === 'b' ? it.b : it.a; const d = Math.hypot(p[0] - s.x, p[2] - s.z) + Math.abs(p[1] - s.y) * 2;
        if (d < bd) { bd = d; best = { it, p, d }; }
      }
      return best;
    };
    const onField = s.y < 0.7 && s.fieldIn;
    if (onField) { const b = near((it) => it.side === 'bench', ['path'], 'a'); if (b) return { ...b, text: `グラウンドの外へ: ${b.it.label}` }; }
    if (s.onStand) { const v = near(null, ['vom'], 'b'); if (v) return { ...v, text: `コンコースへ(${v.it.label}の通路口)` }; }
    if (s.outside) { const g = near(null, ['gate'], 'a'); if (g) return { ...g, text: `入場口へ: ${g.it.n ? g.it.n + ' ゲート' : g.it.label}` }; }
    const v = near(null, ['vom'], 'a'); if (v) return { ...v, text: `席へ: ${v.it.label}` };
    return null;
  }
  update() {
    if (!this.el || !this.on) return;
    const s = this.getState(); if (!s) return;
    const now = performance.now(), lp = this.lp; if (now - this.t < 120 && lp && Math.hypot(s.x - lp[0], s.z - lp[1]) < 1 && Math.abs(s.yaw - lp[2]) < 0.2 && lp[3] === this.dest) return;
    this.t = now; this.lp = [s.x, s.z, s.yaw, this.dest];
    const tg = this._target(s); this.lastTg = tg;
    // 地図(自分の向きが上、半径 70 m)
    const g = this.g, W = 240, R = 70, k = (W / 2 - 8) / R, cy = Math.cos(s.yaw), sy = Math.sin(s.yaw);
    const toMap = (x, z) => { const dx = x - s.x, dz = z - s.z; const u = dx * cy - dz * sy, v = dx * sy + dz * cy; return [W / 2 + u * k, W / 2 + v * k]; };
    g.clearRect(0, 0, W, W); g.save(); g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 3, 0, 7); g.clip();
    // ダイヤモンドと外野の線(目安)
    g.strokeStyle = 'rgba(160,230,160,.55)'; g.lineWidth = 3; g.beginPath();
    for (const [x, z] of [[0, 0], [19.07, -19.4], [0, -38.8], [-19.07, -19.4], [0, 0]]) { const [a, b] = toMap(x, z); g.lineTo(a, b); } g.stroke();
    g.beginPath(); for (let a = -45; a <= 45; a += 5) { const t = a * Math.PI / 180, [p, q] = toMap(Math.sin(t) * 105, -Math.cos(t) * 105 + 0); a === -45 ? g.moveTo(p, q) : g.lineTo(p, q); } g.stroke();
    for (const it of this.items) {
      const [a, b] = toMap(it.a[0], it.a[2]);
      g.fillStyle = it.kind === 'gate' ? '#3ddc84' : it.kind === 'vom' ? '#fdc803' : '#6ec6ff';
      g.beginPath(); if (it.kind === 'gate') g.rect(a - 6, b - 6, 12, 12); else g.arc(a, b, 5.5, 0, 7); g.fill();
      if (it.kind === 'gate' && it.n) { g.fillStyle = '#06264a'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(it.n), a, b + 0.5); }
    }
    if (tg) { const [a, b] = toMap(tg.p[0], tg.p[2]); g.strokeStyle = tg.mine ? '#ff5a5a' : '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(a, b, 10, 0, 7); g.stroke(); }
    { const mk = typeof window !== 'undefined' && window.__mkTarget; if (mk && mk.p) { const [a, b] = toMap(mk.p[0], mk.p[2]); g.strokeStyle = '#ffcc3a'; g.lineWidth = 4; g.beginPath(); g.arc(a, b, 9, 0, 7); g.stroke(); } }   // 11/21 目標(js/mokuhyo.js)
    g.restore();
    // 自分(上向きの三角)
    g.fillStyle = '#fff'; g.strokeStyle = '#06264a'; g.lineWidth = 3; g.beginPath(); g.moveTo(W / 2, W / 2 - 13); g.lineTo(W / 2 + 9, W / 2 + 9); g.lineTo(W / 2, W / 2 + 4); g.lineTo(W / 2 - 9, W / 2 + 9); g.closePath(); g.stroke(); g.fill();
    // 札: 目当てへの向き(画面の上が前)と距離
    if (tg && tg.d > 2.5 && !SIMPLE()) {
      const [a, b] = toMap(tg.p[0], tg.p[2]); const ang = Math.atan2(a - W / 2, -(b - W / 2));
      this.arrow.style.transform = `rotate(${ang}rad)`; this.txt.textContent = `${tg.text} ${Math.round(tg.d)} m`; this.el.classList.remove('hide-chip');
    } else this.el.classList.add('hide-chip');
  }

  // ================================================================ 大きな地図(全体)
  // freeplay.js が置いた物の位置を読む(位置は freeplay.js の結果だけ。ここでは持たない)
  readMarks() {
    const out = [], fp = this.o.getFp && this.o.getFp();
    const v3 = (q) => (q ? [q.x, q.y, q.z] : null);
    if (fp) {
      try {
        const pl = fp._plan;
        if (pl && pl.booth) out.push({ t: 'booth', p: v3(fp.boothFront || pl.booth), at: v3(pl.booth), label: 'チケット売り場' });
        if (fp.jobDeskLook) out.push({ t: 'desk', p: v3(fp.jobDesk || fp.jobDeskLook), at: v3(fp.jobDeskLook), label: '仕事の受付' });
        if (fp.mascot && fp.mascot.g) out.push({ t: 'mascot', p: v3(fp.mascot.g.position), label: `マスコット(${fp.mascot.name || 'パン太'})` });
        if (fp.mshops === undefined && fp.scanModelShops) fp.scanModelShops();   // 模型にもとからある店(freeplay.js が近づいた時に数えるのと同じ物。一度だけ)
        const W = fp.walkers && fp.walkers();
        const L = ((W && W.stalls) || []).concat(fp.wagons || [], fp.simple ? (fp.mopen || []) : (fp.mshops || []), fp.outStores || []);   // すっきり: 開いている店だけ(ふさいだ模型の店は出さない)
        for (const t of fp.toilets || []) out.push({ t: 'toilet', p: v3(t.door), at: v3(t.p), label: 'トイレ' });
        const seen = [];
        for (const s of L) {
          if (s == null || !isFinite(s.x)) continue;
          if (seen.some((q) => Math.hypot(q[0] - s.x, q[2] - s.z) < 1.2 && Math.abs(q[1] - s.y) < 1.5)) continue;   // 同じ店の重なり
          seen.push([s.x, s.y, s.z]);
          const name = (fp.simple && fp.stallMenu && fp.stallMenu(s).title) || s.kind || (s.info && s.info.name) || (s.wagon ? 'ワゴン' : '売店');   // 11/21 店の窓の題名(見た目の看板の字)と同じ名前
          const c = shopCat(name);
          out.push({ t: 'shop', cat: c, p: [s.x + (s.fx || 0) * 1.2, s.y, s.z + (s.fz || 0) * 1.2], at: [s.x, s.y, s.z], label: name === '売店' || /店$/.test(name) ? name : `${name}の店`, short: name, out: !!s.out });
        }
      } catch (e) { console.warn('地図: 売店などを読めない', e); }
    }
    for (const it of this.items) {
      if (it.kind === 'gate') out.push({ t: 'gate', p: it.b || it.a, at: it.a, n: it.n, label: it.n ? `${it.n} ゲート` : (it.label || '入場ゲート') });
      else if (it.kind === 'vom') out.push({ t: 'vom', p: it.a, at: it.a, label: `${it.label || ''}の通路口` });
      else if (it.kind === 'path') out.push({ t: 'path', p: it.a, at: it.a, label: it.label });
    }
    return out;
  }
  // 床の高さで階を分ける(ゲート・通路口・売店・売り場の高さを、3 m 以上あいた所で区切る。2 つ以上の印がある所だけ。名前は下から 1階・2階…)
  _levels(marks) {
    const ys = []; for (const m of marks) if (m.t !== 'mascot') ys.push(m.p[1]);
    ys.sort((a, b) => a - b);   // 通路口は コンコースの側(a)の高さ。客席の側は階に数えない
    const L = []; let cur = null;
    for (const y of ys) { if (!cur || y - cur.max > 3.0) { cur = { min: y, max: y, n: 0 }; L.push(cur); } cur.max = y; cur.n++; }
    const lv = L.filter((l) => l.n >= 2);
    lv.forEach((l, i) => { l.i = i; l.name = `${i + 1}階`; l.h = Math.round((l.min + l.max) / 2 - lv[0].min); });
    return lv.length ? lv : [{ min: -1e9, max: 1e9, i: 0, name: '1階', n: 0 }];
  }
  _levelOf(y) {
    const L = this.levels; let best = L[0], bd = 1e9;
    for (const l of L) { const d = y < l.min ? l.min - y : y > l.max ? y - l.max : 0; if (d < bd - 0.01 || (d === bd && y >= l.min)) { bd = d; best = l; } }
    return best;
  }
  _buildMap() {
    const el = document.createElement('div'); el.id = 'wfMap'; el.className = 'hide';
    el.innerHTML = `<div class="box" role="dialog" aria-label="球場の地図"><div class="hd"><h3>球場の地図<small></small></h3><div class="lv"></div><button class="x">閉じる</button></div>
<div class="bd"><div class="cvw"><canvas></canvas><div class="dst hide"><span></span><button class="go">ここへ行く</button><button class="dx">やめる</button></div><div class="zm"><button class="zi" aria-label="大きく">＋</button><button class="zo" aria-label="小さく">－</button><button class="zme" aria-label="自分の所へ" style="font-size:12px">自分</button></div></div><div class="lg"></div></div>
<div class="ft">${SIMPLE() ? (this.touch ? '印や行きたい所を押して「ここへ行く」でそこへ飛べます ・ 指で動かす ・ 2本指で拡大' : '印や行きたい所を押して「ここへ行く」でそこへ飛べます ・ ドラッグで動かす ・ ホイールで拡大 ・ M か Esc で閉じる') : this.touch ? '印を押すと行き先になり、右上の矢印で案内します ・ 指で動かす ・ 2本指で拡大' : '印を押すと、そこを行き先にして右上の矢印で案内します ・ ドラッグで動かす ・ ホイールで拡大 ・ M か Esc で閉じる'}</div></div>`;
    document.body.appendChild(el); this.mapEl = el;
    this.mcv = el.querySelector('.cvw canvas'); this.mg = this.mcv.getContext('2d');
    el.addEventListener('click', (e) => { if (e.target === el) this.closeMap(); });
    el.querySelector('.x').addEventListener('click', () => this.closeMap());
    el.querySelector('.zi').addEventListener('click', () => this._zoomAt(1.5));
    el.querySelector('.zo').addEventListener('click', () => this._zoomAt(1 / 1.5));
    el.querySelector('.zme').addEventListener('click', () => { const s = this.ms; if (s) { this.view.cx = s.x; this.view.cz = s.z; this.view.z = Math.max(this.view.z, 2.5); this._draw(); } });
    el.querySelector('.dx').addEventListener('click', () => { this.dest = null; this.lp = null; this._draw(); });
    // 11/20 23 時 持ち主「ワープで行ける場所の案内を増やして」: 地図で選んだ印へ飛ぶ(チケットが無い時は中へは飛べない。freeplay.js の warpToPoint)
    el.querySelector('.go').addEventListener('click', () => { const d = this.dest, fp = this.o.getFp && this.o.getFp(); if (!d || !fp || !fp.warpToPoint) return; if (fp.warpToPoint(d.p, d.m && d.m.at)) { this.dest = null; this.closeMap(); } });
    // 指・マウス: 動かす・2本指で拡大・軽く押すと印を選ぶ
    const pts = new Map(); let tap = null, pinch = null;
    const cv = this.mcv;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 1) tap = { x: e.clientX, y: e.clientY, t: performance.now() }; else { tap = null; const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: this.view.z }; } e.preventDefault(); });
    cv.addEventListener('pointermove', (e) => {
      const q = pts.get(e.pointerId); if (!q) return;
      if (pts.size >= 2 && pinch) { pts.set(e.pointerId, [e.clientX, e.clientY]); const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); this._setZoom(pinch.z * d / Math.max(10, pinch.d), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); return; }
      const dx = e.clientX - q[0], dy = e.clientY - q[1]; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap = null;
      if (!tap) { const s = this._scale(); this.view.cx -= dx / s; this.view.cz -= dy / s; this._draw(); }
    });
    const up = (e) => {
      if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
      if (tap && e.type === 'pointerup') { const r = cv.getBoundingClientRect(); this._tapAt(e.clientX - r.left, e.clientY - r.top); }
      tap = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this._setZoom(this.view.z * Math.pow(1.0015, -e.deltaY), e.clientX, e.clientY); }, { passive: false });
    // 開いている間のキー: Esc・M で閉じる(main.js・freeplay.js より先に受ける)
    addEventListener('keydown', (e) => { if (!this.mapOn) return; if (e.code === 'Escape' || e.code === 'KeyM' || e.code === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) this.closeMap(); } }, true);
    addEventListener('resize', () => { if (this.mapOn) { this._fitCanvas(); this._draw(); } });
  }
  // いる所の名前: グラウンド・客席(まわり 2.5 m に席がある)・球場の外(ゲートの輪より外)・コンコース・通路
  _where(s) {
    if (!s) return '';
    let gr = 0, gn = 0; for (const it of this.items) if (it.kind === 'gate' && it.a) { gr += Math.hypot(it.a[0], it.a[2] + 40); gn++; }
    const outRing = gn && Math.hypot(s.x, s.z + 40) > gr / gn - 1;
    if (s.fieldIn && s.y < 0.7 && !outRing) return 'グラウンド';
    const S = this.o.seats; let seat = false;
    if (S && S.n) for (let i = 0; i < S.n; i += 2) { const dx = S.x[i] - s.x; if (dx > 2.5 || dx < -2.5) continue; const dz = S.z[i] - s.z; if (dz > 2.5 || dz < -2.5) continue; if (Math.abs(S.y[i] - s.y) < 2.5) { seat = true; break; } }
    if (seat) return '客席';
    if (s.outside || outRing) return '球場の外';
    return 'コンコース・通路';
  }
  toggleMap() { if (this.mapOn) this.closeMap(); else this.openMap(); }
  openMap() {
    if (this.mapOn || !this.items.length) return false;
    if (this.o.isOverlay && this.o.isOverlay()) return false;   // ほかの窓・メニューが開いている
    const m = this.o.getMode ? this.o.getMode() : 'walk'; if (!(m === 'walk' || m === 'sit')) return false;
    if (!this.mapEl) this._buildMap();
    this.mapOn = true;
    if (this.o.setOverlay) this.o.setOverlay(true);
    if (this.o.releasePointer) this.o.releasePointer();
    const s = this.getState(); this.ms = s;
    this.marks = this.readMarks(); this.levels = this._levels(this.marks);
    for (const mk of this.marks) mk.lv = this._levelOf(mk.p[1]);
    this.myLv = s ? this._levelOf(s.y) : this.levels[0];
    this.lvSel = null;   // null = すべての階
    this._bounds();
    this.view = { cx: (this.bb[0] + this.bb[2]) / 2, cz: (this.bb[1] + this.bb[3]) / 2, z: 1 };
    // 見出し・階・凡例
    const where = this._where(s);
    this.mapEl.querySelector('h3 small').textContent = `${this.o.stadiumName || ''}${this.o.stadiumName ? ' ・ ' : ''}いま: ${where}${this.levels.length > 1 ? `(${this.myLv.name})` : ''}`;
    const lv = this.mapEl.querySelector('.lv'); lv.innerHTML = '';
    if (this.levels.length > 1) {
      const mk = (txt, val) => { const b = document.createElement('button'); b.textContent = txt; if (val) b.title = `下の階から 約 ${val.h} m 上`; b.className = (this.lvSel === val ? 'on' : '') + (val && val === this.myLv ? ' here' : ''); b.addEventListener('click', () => { this.lvSel = val; [...lv.children].forEach((x, i) => x.classList.toggle('on', (i === 0 ? null : this.levels[i - 1]) === val)); this._draw(); }); lv.appendChild(b); };
      mk('全部の階', null); for (const l of this.levels) mk(l.name, l);   // 高さは title に
    }
    this._legend();
    this.mapEl.classList.remove('hide');
    this._fitCanvas(); this._draw();
    return true;
  }
  closeMap() {
    if (!this.mapOn) return;
    this.mapOn = false; this.mapEl.classList.add('hide');
    if (this.o.setOverlay) this.o.setOverlay(false);
    const m = this.o.getMode ? this.o.getMode() : ''; if (!this.touch && m === 'walk' && this.o.lockPointer) this.o.lockPointer();
    this.lp = null;   // 小さな地図をすぐ描き直す
  }
  _legend() {
    const lg = this.mapEl.querySelector('.lg'), cnt = {};
    for (const m of this.marks) { const k = m.t === 'shop' ? 'shop:' + m.cat.k : m.t; cnt[k] = (cnt[k] || 0) + 1; }
    const row = (col, ch, name, n, sq) => `<div class="i"><i class="${sq ? 'sq' : ''}" style="background:${col}">${ch || ''}</i><span>${name}</span>${n ? `<b>${n}</b>` : ''}</div>`;
    let h = '<div class="t">印の見方</div>';
    h += `<div class="i"><i style="background:#fff;clip-path:polygon(50% 0,100% 100%,50% 78%,0 100%);border:0;border-radius:0"></i><span>自分(とがった方が向き)</span></div>`;
    h += `<div class="i"><i style="background:transparent;border:3px solid #ff5a5a"></i><span>行き先</span></div>`;
    if (typeof window !== 'undefined' && window.__mkTarget) h += `<div class="i"><i style="background:transparent;border:3px solid #ffcc3a"></i><span>目標(点線は道案内)</span></div>`;   // 11/21 js/mokuhyo.js
    for (const k of ['booth', 'desk', 'mascot', 'toilet', 'gate', 'vom', 'path']) if (cnt[k]) h += row(SPOT[k].col, SPOT[k].ch || (k === 'gate' ? '1' : ''), SPOT[k].name, cnt[k], SPOT[k].sq);
    h += '<div class="t">売店・屋台</div>';
    for (const c of SHOP_CATS) if (cnt['shop:' + c.k]) h += row(c.col, c.ch, c.name, cnt['shop:' + c.k]);
    if (!SHOP_CATS.some((c) => cnt['shop:' + c.k])) h += '<div class="i"><span>(まだ準備中)</span></div>';
    lg.innerHTML = h;
  }
  _bounds() {
    let x0 = -60, z0 = -150, x1 = 60, z1 = 20;
    const S = this.o.seats;
    const add = (x, z) => { if (!isFinite(x) || !isFinite(z)) return; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; };
    if (S && S.n) for (let i = 0; i < S.n; i += 3) add(S.x[i], S.z[i]);
    for (const m of this.marks) add(m.p[0], m.p[2]);
    if (this.ms) add(this.ms.x, this.ms.z);
    const pad = 14; this.bb = [x0 - pad, z0 - pad, x1 + pad, z1 + pad];
    // 席の形を 1 m の目の絵にしておく(開くたびに作らない)
    if (!this.seatImg && S && S.n) {
      let ax = 1e9, az = 1e9, bx = -1e9, bz = -1e9, ymin = 1e9, ymax = -1e9;
      for (let i = 0; i < S.n; i++) { const x = S.x[i], z = S.z[i], y = S.y[i]; if (x < ax) ax = x; if (x > bx) bx = x; if (z < az) az = z; if (z > bz) bz = z; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
      const C = 1, w = Math.ceil((bx - ax) / C) + 3, h = Math.ceil((bz - az) / C) + 3;
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
      for (let i = 0; i < S.n; i++) {
        const u = Math.floor((S.x[i] - ax) / C) + 1, v = Math.floor((S.z[i] - az) / C) + 1, t = (S.y[i] - ymin) / Math.max(1, ymax - ymin), o = (v * w + u) * 4;
        // 低い席は明るい水色、高い席ほど濃い青
        d[o] = 120 - 70 * t; d[o + 1] = 170 - 70 * t; d[o + 2] = 215 - 40 * t; d[o + 3] = 255;
      }
      g.putImageData(img, 0, 0);   // すき間(通路)は下でぼかして少し埋める
      const c2 = document.createElement('canvas'); c2.width = w; c2.height = h; const g2 = c2.getContext('2d');
      g2.filter = 'blur(0.6px)'; g2.drawImage(c, 0, 0); g2.filter = 'none'; g2.globalAlpha = 1; g2.drawImage(c, 0, 0);
      this.seatImg = { c: c2, x: ax - C, z: az - C, C };
    }
  }
  _fitCanvas() {
    const r = this.mcv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cw = Math.max(50, r.width); this.ch = Math.max(50, r.height); this.dpr = dpr;
    this.fw = Math.max(40, this.cw - 54);   // 右の ＋・－・自分 のボタンの列を除いた幅に合わせて置く
    this.mcv.width = Math.round(this.cw * dpr); this.mcv.height = Math.round(this.ch * dpr);
  }
  _scale() { const b = this.bb; return Math.min((this.fw - 16) / (b[2] - b[0]), (this.ch - 48) / (b[3] - b[1])) * this.view.z; }   // 上下の端に字の置き場を残す
  _setZoom(z, px, py) {
    const r = this.mcv.getBoundingClientRect(); const z2 = Math.max(1, Math.min(8, z));
    if (px != null) { const s0 = this._scale(), wx = this.view.cx + (px - r.left - this.fw / 2) / s0, wz = this.view.cz + (py - r.top - this.ch / 2) / s0; this.view.z = z2; const s1 = this._scale(); this.view.cx = wx - (px - r.left - this.fw / 2) / s1; this.view.cz = wz - (py - r.top - this.ch / 2) / s1; }
    else this.view.z = z2;
    this._draw();
  }
  _zoomAt(f) { this._setZoom(this.view.z * f); }
  _clampView() {
    const b = this.bb, s = this._scale(), hw = this.fw / 2 / s, hh = this.ch / 2 / s;
    const cl = (v, a, c, h) => (c - a <= 2 * h ? (a + c) / 2 : Math.max(a + h, Math.min(c - h, v)));
    this.view.cx = cl(this.view.cx, b[0], b[2], hw); this.view.cz = cl(this.view.cz, b[1], b[3], hh);
  }
  _w2s(x, z) { const s = this._scale(); return [(x - this.view.cx) * s + this.fw / 2, (z - this.view.cz) * s + this.ch / 2]; }
  _visible(m) { return !this.lvSel || m.lv === this.lvSel; }
  _tapAt(px, py) {
    if (!this.screenMarks) return;
    let best = null, bd = this.touch ? 26 : 18;
    for (const q of this.screenMarks) { const d = Math.hypot(q.sx - px, q.sy - py); if (d < bd) { bd = d; best = q; } }
    if (!best) { this._tapFree(px, py); return; }
    const m = best.m;
    this.dest = { p: m.p.slice(), text: m.label, m };
    this.lp = null; this._draw();
  }
  // 11/22 持ち主「すぐにどこでも回れる感じで」: 印の無い所を押しても、そこ(立てる床が無ければ一番近い立てる所)を行き先にする(main.js → js/warpgen.js の standNear)
  _tapFree(px, py) {
    if (!this.o.standNear) return;
    const s = this._scale(), x = this.view.cx + (px - this.fw / 2) / s, z = this.view.cz + (py - this.ch / 2) / s;
    const prefY = this.lvSel ? (this.lvSel.min + this.lvSel.max) / 2 : this.ms ? this.ms.y : null;
    const q = this.o.standNear(x, z, prefY);
    if (!q) { if (this.o.toast) this.o.toast('そこには立てる所がありません'); return; }
    const name = (this.o.describe && this.o.describe(q.x, q.y, q.z)) || '地図で選んだ所';
    this.dest = { p: [q.x, q.y, q.z], text: name, m: { at: [0, q.y, -45], free: true } };
    this.lp = null; this._draw();
  }
  _draw() {
    if (!this.mapOn) return;
    this._clampView();
    const g = this.mg, dpr = this.dpr, W = this.cw, H = this.ch, s = this._scale();
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.fillStyle = '#123f2c'; g.fillRect(0, 0, W, H);   // 球場の外(広場・道)
    const P = (x, z) => this._w2s(x, z);
    // 席(上から見た形)
    const si = this.seatImg;
    if (si) { const [a, b] = P(si.x, si.z); g.imageSmoothingEnabled = true; g.globalAlpha = 0.95; g.drawImage(si.c, a, b, si.c.width * si.C * s, si.c.height * si.C * s); g.globalAlpha = 1; }
    // グラウンド: 柵までの芝・内野の土・ダイヤモンド
    const fence = this.o.fence || (() => 110);
    g.beginPath(); { const [a, b] = P(0, 6); g.moveTo(a, b); }
    for (let d = -50; d <= 50; d += 2) { const t = d * Math.PI / 180, r = fence(d); const [a, b] = P(Math.sin(t) * r, -Math.cos(t) * r); g.lineTo(a, b); }
    g.closePath(); g.fillStyle = '#2f8a3a'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.stroke();
    g.beginPath(); { for (let d = -50; d <= 50; d += 5) { const t = d * Math.PI / 180, r = 29; const [a, b] = P(Math.sin(t) * r, -Math.cos(t) * r); d === -50 ? g.moveTo(a, b) : g.lineTo(a, b); } const [a, b] = P(0, 4); g.lineTo(a, b); }
    g.closePath(); g.fillStyle = '#b07a4a'; g.fill();
    g.beginPath(); for (const [x, z] of [[0, 0], [19.07, -19.4], [0, -38.8], [-19.07, -19.4]]) { const [a, b] = P(x, z); g.lineTo(a, b); } g.closePath(); g.fillStyle = '#3a9a44'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.5; g.beginPath();
    for (const sg of [-1, 1]) { const t = sg * 45 * Math.PI / 180, r = fence(sg * 45); const [a, b] = P(0, 0), [c, d] = P(Math.sin(t) * r, -Math.cos(t) * r); g.moveTo(a, b); g.lineTo(c, d); } g.stroke();
    // 通路(ゲートの中の道)
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = Math.max(1.5, s * 2); g.lineCap = 'round';
    for (const it of this.items) { if (it.kind !== 'gate' || !it.pts) continue; g.beginPath(); it.pts.forEach((q, i) => { const [a, b] = P(q[0], q[2]); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); }
    // 印
    const fp = this.o.getFp && this.o.getFp(); let gt = null; try { gt = fp && fp.guideTarget ? fp.guideTarget() : null; } catch (e) { gt = null; }
    const R = Math.max(9, Math.min(13, 6 + s * 1.2)), sm = []; this.screenMarks = sm;
    const order = { vom: 0, path: 1, gate: 2, shop: 3, toilet: 3.5, desk: 4, booth: 5, mascot: 6 };
    const ms = this.marks.slice().sort((a, b) => order[a.t] - order[b.t]);
    const labels = [], keep = [];   // keep: 字でかくさない印(売り場・受付・マスコット)
    for (const m of ms) {
      const [a, b] = P(m.p[0], m.p[2]); if (a < -20 || b < -20 || a > W + 20 || b > H + 20) continue;
      const on = this._visible(m); g.globalAlpha = on ? 1 : 0.28;
      if (m.t === 'vom' || m.t === 'path') {
        const r = m.t === 'vom' ? Math.max(4, R * 0.45) : Math.max(4.5, R * 0.5);
        g.beginPath(); g.arc(a, b, r, 0, 7); g.fillStyle = SPOT[m.t].col; g.fill(); g.lineWidth = 1.5; g.strokeStyle = NAVY; g.stroke();
        if (on) { sm.push({ sx: a, sy: b, m }); if (s > 4.2) labels.push({ x: a, y: b + r + 2, ay: b - r - 2, t: m.t === 'vom' ? (m.label || '').replace(/の通路口$/, '') : m.label, small: true, pri: 0 }); }
        continue;
      }
      const sp = m.t === 'shop' ? m.cat : SPOT[m.t];
      const ch = m.t === 'gate' ? String(m.n || '') : sp.ch;
      const r = m.t === 'gate' ? R * 0.95 : m.t === 'shop' ? R * 0.9 : R * 1.1;
      g.beginPath(); if (sp.sq) g.rect(a - r, b - r, r * 2, r * 2); else g.arc(a, b, r, 0, 7);
      g.fillStyle = sp.col; g.fill(); g.lineWidth = 2; g.strokeStyle = NAVY; g.stroke();
      if (ch) { g.fillStyle = NAVY; g.font = `900 ${Math.round(r * (ch.length > 1 ? 1.05 : 1.25))}px ${'"Hiragino Sans","Yu Gothic UI","Meiryo",sans-serif'}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, a, b + 1); }
      if (!on) continue;
      sm.push({ sx: a, sy: b, m });
      if (m.t === 'booth' || m.t === 'desk' || m.t === 'mascot') { labels.push({ x: a, y: b + r + 3, ay: b - r - 3, t: m.t === 'mascot' ? 'マスコット' : m.label, pri: 3 }); keep.push([a - r, b - r, 2 * r, 2 * r]); }
      else if (m.t === 'shop' && s > 2.2) labels.push({ x: a, y: b + r + 2, ay: b - r - 2, t: m.short, pri: 1, small: true });
    }
    g.globalAlpha = 1;
    // 行き先: 地図で選んだ物(赤)・いまの案内(白)・自由に遊ぶの案内(黄)
    const ring = (p, col, txt) => { if (!p) return; const [a, b] = P(p[0], p[2]); g.lineWidth = 4; g.strokeStyle = col; g.beginPath(); g.arc(a, b, R + 7, 0, 7); g.stroke(); g.lineWidth = 2; g.strokeStyle = NAVY; g.beginPath(); g.arc(a, b, R + 10, 0, 7); g.stroke(); if (txt) labels.push({ x: a, y: b - R - 30, ay: b - R - 12, t: txt, pri: 4, col }); };
    if (this.dest) ring(this.dest.p, '#ff5a5a', '行き先');
    else if (this.lastTg && this.lastTg.p) ring(this.lastTg.p, '#ffffff', null);
    if (gt && gt.p && !(this.dest && Math.hypot(this.dest.p[0] - gt.p.x, this.dest.p[2] - gt.p.z) < 2)) ring([gt.p.x, gt.p.y, gt.p.z], YEL, null);
    { const mk = typeof window !== 'undefined' && window.__mkTarget;   // 11/21 目標と道案内(js/mokuhyo.js): 道の線と、金色の輪「目標」
      if (mk && mk.p) { if (mk.route && mk.route.length && this.ms) { g.save(); g.setLineDash([6, 5]); g.lineWidth = 3; g.strokeStyle = '#ffcc3a'; g.beginPath(); { const [a, b] = P(this.ms.x, this.ms.z); g.moveTo(a, b); } for (const q of mk.route) { const [a, b] = P(q[0], q[1]); g.lineTo(a, b); } g.stroke(); g.restore(); } ring(mk.p, '#ffcc3a', `目標: ${mk.label || ''}`); } }
    // 自分(字の後に描く。まわりは字を置かない)
    const me = this.ms, boxes = keep.slice();
    let meS = null;
    if (me) { meS = P(me.x, me.z); boxes.push([meS[0] - 16, meS[1] - 16, 32, 32]); labels.push({ x: meS[0], y: meS[1] + 18, t: 'いまここ', pri: 6, col: '#ff8a8a', ay: meS[1] - 18 }); }
    // 字(大事な物から。重なる時は下・上・右・左の順に置き場を探し、それでも重なる細かい字は出さない。画面の外に出る物は内へ寄せる)
    labels.sort((p, q) => q.pri - p.pri);
    const hit = (x, y, w, h) => boxes.some((q) => x < q[0] + q[2] && x + w > q[0] && y < q[1] + q[3] && y + h > q[1]);
    for (const L of labels) {
      if (!L.t) continue;
      const fs = L.small ? 12 : 14; g.font = `800 ${fs}px "Hiragino Sans","Yu Gothic UI","Meiryo",sans-serif`;
      const w = g.measureText(L.t).width + 10, h = fs + 6, up = (L.ay != null ? L.ay : L.y - 24) - h;
      const mid = (L.y + up + h) / 2 - h / 2;
      const cand = [[L.x - w / 2, L.y], [L.x - w / 2, up], [L.x + 14, mid], [L.x - w - 14, mid], [L.x + 6, L.y + 4], [L.x - w - 6, L.y + 4], [L.x + 6, up - 4], [L.x - w - 6, up - 4], [L.x - w / 2, L.y + h + 2], [L.x - w / 2, up - h - 2]].map(([x, y]) => [Math.max(2, Math.min(W - w - 2, x)), Math.max(2, Math.min(H - h - 2, y))]);
      let pos = cand.find(([x, y]) => !hit(x, y, w, h));
      if (!pos) { if (L.pri < 5) continue; pos = cand[0]; }   // 置けない字は出さない(凡例で分かる)。自分と行き先だけは重ねても出す
      const [x, y] = pos; boxes.push([x, y, w, h]);
      g.fillStyle = 'rgba(6,38,74,.86)'; g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, 6); else g.rect(x, y, w, h); g.fill();
      g.fillStyle = L.col || '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(L.t, x + 5, y + h / 2 + 1);
    }
    if (meS) {
      const [a, b] = meS, ang = -me.yaw;
      g.save(); g.translate(a, b); g.beginPath(); g.arc(0, 0, 20, 0, 7); g.fillStyle = 'rgba(255,90,90,.35)'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#ff5a5a'; g.stroke(); g.rotate(ang);
      g.beginPath(); g.moveTo(0, -15); g.lineTo(11, 11); g.lineTo(0, 5); g.lineTo(-11, 11); g.closePath(); g.fillStyle = '#fff'; g.strokeStyle = NAVY; g.lineWidth = 3; g.stroke(); g.fill(); g.restore();
    }
    // 方角の目安(本塁が下)
    g.font = '800 12px "Hiragino Sans","Yu Gothic UI","Meiryo",sans-serif'; g.fillStyle = 'rgba(255,255,255,.75)'; g.textAlign = 'left'; g.textBaseline = 'bottom';
    g.fillText('本塁が下 ・ 外野が上', 8, H - 6);
    // 行き先の札
    const dst = this.mapEl.querySelector('.dst');
    if (this.dest) { dst.classList.remove('hide'); dst.querySelector('span').textContent = `行き先: ${this.dest.text}`; } else dst.classList.add('hide');
  }
}
