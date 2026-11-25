// 画面に出すもの(11/22 持ち主「画面内の情報量はある程度限られたものに」「画面内に出す出さないかは自分で決められるようにして」)
// 一時停止の画面に「画面に出すもの」の段を作り、項目ごとに出す/出さないを選ぶ。選んだ値は覚える(r4walk.hud)。
//  ・目標と道案内 = 目標の札のオン/オフ(r4walk.mk.on・G キー・札の「目標」ボタンと同じ値)
//  ・ガイド = 守備のガイド(r4walk.guide)、落下点 = 落下点の輪(r4walk.fallMark)。どちらも js/guide.js の値をそのまま使う(二重に持たない)
//  ・お金・持ち物(袋)・小さな地図・点数板・操作の説明 はここで覚え、body の class で隠す(各部品の出し入れの仕組みには手を入れない)
// 隠していても、袋は I キーと一時停止の「持ち物」、目標は J キー・G キーと一時停止の「目標の一覧」、全体の地図は M キーでいつでも開ける。
// 操作の説明(PC の下の帯)は、何も選んでいなければ初めの 3 回だけ出す(慣れたら自然に消える)。
const KEY = 'r4walk.hud', KEY_N = 'r4walk.hud.n';
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 使えない環境 */ } };

// where: free = 過ごす(歩く・座る)、def = 守備、all = どちらも
const ITEMS = [
  { k: 'wallet', t: 'お金', where: 'free' },
  { k: 'bag', t: '持ち物(袋)', where: 'free' },
  { k: 'goal', t: '目標と道案内', where: 'free' },
  { k: 'map', t: '小さな地図', where: 'free' },
  { k: 'board', t: '点数板', where: 'all' },
  { k: 'help', t: '操作の説明', where: 'all', pc: true },
  { k: 'guide', t: 'ガイド', where: 'def' },
  { k: 'fall', t: '落下点', where: 'def' },
  { k: 'carPop', t: 'プレーの札(UZR など)', where: 'def' },   // 11/25 夜 守備のキャリアの札(UZR +0.4・肩 +1・お手玉)。初めは出さない(js/career_ui.js が r4walk.hud を読む)
];
const OWN = ['wallet', 'bag', 'map', 'board', 'help', 'carPop'];
const OFF0 = ['carPop'];   // 何も選んでいない時は出さない物   // ここで覚える物(ほかはそれぞれの仕組みの値)
const HELP_N = 3;

const CSS = `
body.hud-off-wallet #fpWallet,body.hm-def #fpWallet{display:none!important}
body.hud-off-bag #fpBag,body.hm-def #fpBag,body.hm-def #fpHand{display:none!important}
body.hud-off-map #wayf{display:none!important}
body.hud-off-board #board,body.hud-off-board #runMap,body.hud-off-board #sit{display:none!important}
body.hud-off-help #hint{display:none!important}
#pzGuide>.lab,#pzGuide .gdSeg{display:none!important}
#pzGuide .gdTutBtn{margin-top:0}
#mkOpt [data-mk="on"],#mkOpt [data-mk="off"]{display:none!important}
#hudOpt .seg{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#hudOpt .seg button{position:relative;padding:0 8px 0 34px;white-space:nowrap;text-align:left;justify-content:flex-start;min-width:0}
#hudOpt .seg button::before{content:"";position:absolute;left:10px;top:50%;width:18px;height:18px;margin-top:-11px;border-radius:5px;border:2px solid rgba(255,255,255,.75);font:900 15px/18px sans-serif;text-align:center;color:#3a2300}
#hudOpt .seg button.on::before{content:"✓";background:#ffd65a;border-color:#ffd65a}
#hudOpt .seg button:not(.on){opacity:.6}
#hudOpt small{display:block;margin-top:6px;font-size:11.5px;opacity:.8;line-height:1.4}
`;

export class HudPrefs {
  // h: getMode・mokuhyo・defense・freeplay・ui・isTouch
  constructor(h) {
    this.h = h;
    this.v = Object.assign({}, lsGet(KEY, {}));
    this.n = +lsGet(KEY_N, 0) || 0;
    if (!document.getElementById('hudCss')) { const st = document.createElement('style'); st.id = 'hudCss'; st.textContent = CSS; document.head.appendChild(st); }
    this.apply();
    const tryUi = () => { if (this.h.ui() && document.querySelector('#panel .sheet')) this.injectPause(); else setTimeout(tryUi, 200); };
    tryUi();
    this._iv = setInterval(() => this.tick(), 250);
  }
  keys() { return ITEMS.map((x) => x.k); }
  guide() { const d = this.h.defense(); return d && d.guide; }
  get(k) {
    if (k === 'goal') { const m = this.h.mokuhyo(); return m ? !!m.on : lsGet('r4walk.mk.on', true) !== false; }
    if (k === 'guide') { const g = this.guide(); return g ? g.value() === 'on' : lsGet('r4walk.guide', 'on') !== 'off'; }
    if (k === 'fall') { const g = this.guide(); return g ? g.fallValue() === 'on' : lsGet('r4walk.fallMark', 'on') !== 'off'; }
    if (k in this.v) return !!this.v[k];
    if (k === 'help') return this.n <= HELP_N;
    if (OFF0.includes(k)) return false;
    return true;
  }
  set(k, on) {
    on = !!on;
    if (k === 'goal') { const m = this.h.mokuhyo(); if (m) m.setOn(on); else lsSet('r4walk.mk.on', on); }
    else if (k === 'guide') { const g = this.guide(); if (g) g.setValue(on ? 'on' : 'off'); else lsSet('r4walk.guide', on ? 'on' : 'off'); }
    else if (k === 'fall') { const g = this.guide(); if (g) g.setFall(on ? 'on' : 'off'); else lsSet('r4walk.fallMark', on ? 'on' : 'off'); }
    else if (OWN.includes(k)) { this.v[k] = on; lsSet(KEY, this.v); }
    this.apply(); this.paint();
    { const m = this.h.mokuhyo(); if (m && m.kind) try { m.place(); } catch (e) { /* 札の位置は次のこまで */ } }   // 点数板を隠した・出した時は目標の札の位置を置き直す
  }
  // モードを始めた回数(操作の説明を初めの 3 回だけ出す)
  onStart(mode) {
    if (!/^(game|knock|watch|walk)$/.test(mode || '')) return;
    this.n++; lsSet(KEY_N, this.n); this.apply();
  }
  apply() {
    const b = document.body.classList;
    for (const k of OWN) b.toggle('hud-off-' + k, !this.get(k));
  }
  tick() {
    const m = this.h.getMode();
    document.body.classList.toggle('hm-def', m === 'defense');
  }
  // 一時停止の画面に「画面に出すもの」の段(視点の行の下)と、目標の段に「持ち物」のボタン
  injectPause() {
    if (this.el) return;
    const sheet = document.querySelector('#panel .sheet'); if (!sheet) return;
    const o = document.createElement('div'); o.className = 'opt'; o.id = 'hudOpt';
    o.innerHTML = '<div class="lab"><i class="li li-eye"></i>画面に出すもの</div><div class="seg wrap"></div><small></small>';
    const tm = document.getElementById('times'), at = tm && tm.closest('.opt');
    sheet.insertBefore(o, at && at.parentNode === sheet ? at : null);
    o.querySelector('.seg').addEventListener('click', (e) => { const btn = e.target.closest('button'); if (!btn) return; e.stopPropagation(); this.set(btn.dataset.k, !this.get(btn.dataset.k)); });
    this.el = o;
    // 目標の段(js/mokuhyo.js の #mkOpt)は「開く」の段にする: 目標の一覧・持ち物・はじめの案内(オン/オフはこの段へ移した)
    const mk = document.getElementById('mkOpt');
    if (mk) {
      const lab = mk.querySelector('.lab'); if (lab) lab.textContent = '開く';
      const seg = mk.querySelector('.seg'), li = seg && seg.querySelector('[data-mk="list"]');
      if (seg && !seg.querySelector('[data-hud="bag"]')) {
        const bb = document.createElement('button'); bb.type = 'button'; bb.dataset.hud = 'bag'; bb.textContent = '持ち物';
        bb.addEventListener('click', (e) => { e.stopPropagation(); const ui = this.h.ui(), fp = this.h.freeplay(); if (ui && ui.resume) ui.resume(); setTimeout(() => { if (fp && fp.openBagSimple) fp.openBagSimple(); }, 30); });
        if (li) li.after(bb); else seg.appendChild(bb);
      }
    }
    const ui = this.h.ui(), pz = ui.pause.bind(ui);
    ui.pause = (...a) => { const r = pz(...a); this.paint(); return r; };
    this.paint();
  }
  where() { const m = this.h.getMode(); return m === 'defense' ? 'def' : (m === 'walk' || m === 'sit') ? 'free' : 'other'; }
  paint() {
    const o = this.el; if (!o) return;
    const w = this.where(), touch = this.h.isTouch;
    const list = ITEMS.filter((x) => (x.where === 'all' ? w !== 'other' || x.k !== 'board' : x.where === w) && !(x.pc && touch));
    const seg = o.querySelector('.seg');
    const sig = list.map((x) => x.k).join(',');
    if (seg.dataset.sig !== sig) { seg.dataset.sig = sig; seg.innerHTML = ''; for (const x of list) { const b = document.createElement('button'); b.type = 'button'; b.dataset.k = x.k; b.textContent = x.t; seg.appendChild(b); } }
    for (const b of seg.querySelectorAll('button')) { const on = this.get(b.dataset.k); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    o.querySelector('small').textContent = w === 'def' ? '押すと 出す/隠す が切り替わります。ガイドは 向き・合図・投げる先、落下点は 地面の輪'
      : w === 'free' ? (touch ? '押すと 出す/隠す が切り替わります。隠しても 下の「開く」から いつでも見られます' : '押すと 出す/隠す が切り替わります。隠しても I(持ち物)・J(目標)・G(道案内)・M(地図)で いつでも開けます')
        : '押すと 出す/隠す が切り替わります';
    o.classList.toggle('hide', !list.length);
  }
}
