// 11/26 記憶の見張り(iOS 版に「重すぎてアプリ落ちる」の声。iOS の WKWebView は使える記憶が端末で低く、超えると白い画面か落ちる)。
// 1) 描く所(WebGL)が失われた時(webglcontextlost)に白い画面のままにしない: 「画面を作り直しています」を出して戻るのを待ち、
//    戻ったら環境の光などを作り直して、自動の段を 1 つ下げる。6 秒で戻らなければ「軽い画質で開き直す」を出す。
// 2) 前の起動が、遊んでいる途中で(閉じる・裏へ回すをせずに)終わっていたら、落ちたと見て、自動の段の天井を下げる(起動して 6.5 秒で決める)
//    (1 回目 段 3 = 画面の細かさ 1.5 まで・2 回目 段 2 = 1.25・3 回目から 段 1 = 1.0)。20 分落ちずに遊べたら次の起動で 1 つ戻す。
// 3) 球場を替える(ページの読み直し)前に、描く所と音を先に片付ける(前の球場の絵・形・音を持ったまま次を読まない)。
// 11/27 iOS のアプリ(Capacitor の iOS)は「試合に入るとタイトルに戻される」(WKWebView の記憶あふれ)の星 1 が 3 件: 初めての起動から落ちにくい側で始める。
//    記録(r4walk.memSafe)が無い時は 2(段 2 = 画面の細かさ 1.25)から。20 分落ちずに遊べたら 1 つ戻すのは同じだが、1 より下(天井 3 より上)へは戻さない。PC・Android・ブラウザ版は前のまま。
// 11/28 X の声「iPhone で守備に行こうとするとすぐにメニュー画面に戻される」: WebContent が落ちると殻(Capacitor の webViewWebContentProcessDidTerminate)が頭から読み直し、
//    タイトルに戻っていた。守備(試合・ノック・キャリア)の最中に落ちた時は、読み直した後に、1 段軽い画質で同じ物をもう一度始める
//    (10 分の内に 2 回まで。3 回目はタイトルのまま「軽量」を勧める札)。iOS のアプリは前の起動が落ちたかをすぐ決める(別のタブが無いので 6.5 秒待たない)。?noresume=1 で前の形。
// ?nomemguard=1 で 1)2) を入れない。試験は window.__memGuard。
const K_ALIVE = 'r4walk.alive', K_SAFE = 'r4walk.memSafe', K_PLAY = 'r4walk.inPlay', K_TRY = 'r4walk.resumeTry';
const DEF_MODES = ['game', 'knock'];
const CEIL = [4, 3, 2, 1];   // memSafe 0〜3 → 自動の段の天井(gfx.js の AUTO_LV)
const IOS_SAFE0 = 2, IOS_FLOOR = 1;   // 11/27 iOS のアプリ: 記録が無い時の始まり・戻す下限
const isIosApp = () => { try { const C = window.Capacitor; return !!(C && C.getPlatform && C.getPlatform() === 'ios'); } catch (e) { return false; } };

export function memGuard({ renderer, gfx, touch, getSound, getQuality, setQuality, store, load }) {
  const off = /[?&]nomemguard=1/.test(location.search);
  const canvas = renderer.domElement;
  const ios = isIosApp();
  const api = { ios, safe: 0, crashed: false, lost: 0, restored: 0, leaving: false, resumed: null, release, playing, resume, info: () => ({ safe: api.safe, crashed: api.crashed, lost: api.lost, restored: api.restored, ceil: gfx.ceil, lv: gfx.lv, resumed: api.resumed }) };
  window.__memGuard = api;
  if (off) return api;

  // ---------------------------------------------------------------- 2) 前の起動が落ちていたか
  const now = () => Date.now();
  let safe = +load(K_SAFE, 0) || 0;
  if (ios) { const raw = load(K_SAFE, null); safe = raw == null ? IOS_SAFE0 : Math.min(3, Math.max(IOS_FLOOR, +raw || 0)); }   // 11/27 iOS のアプリは落ちにくい側から
  api.safe = safe;
  const applySafe = () => {
    if ((!touch && !ios) || safe <= 0) return;
    gfx.setCeil(CEIL[safe]);
    // 「標準」で落ちた時は「自動」に戻す(自動は記憶の天井の中で動く)
    if (getQuality() === 'std') setTimeout(() => { try { setQuality('auto'); } catch (e) { /* 前のまま */ } }, 0);
  };
  applySafe();
  // 印(r4walk.alive)が残っている = 閉じる・裏へ回す・読み直すをせずに終わった(落ちた)。
  // ただし PC で別のタブが遊んでいると、その印かもしれないので、6.5 秒待って印が書き変わらなければ落ちたと見る(その間は自分の印を書かない)
  const raw0 = (() => { try { return localStorage.getItem(K_ALIVE); } catch (e) { return null; } })();
  const play0 = (() => { try { return JSON.parse(localStorage.getItem(K_PLAY) || 'null'); } catch (e) { return null; } })();
  try { localStorage.removeItem(K_PLAY); } catch (e) { }
  let checking = !!raw0 && !ios;   // 11/28 iOS のアプリは別のタブが無いので、印が残っていれば落ちたとすぐ決める
  let onCrash = null;
  const markCrash = () => { api.crashed = true; safe = Math.min(3, safe + 1); api.safe = safe; store(K_SAFE, safe); applySafe(); if (onCrash) { const f = onCrash; onCrash = null; f(); } };
  if (raw0 && ios) markCrash();
  const t0 = now();
  let beat = null;
  const alive = () => { try { localStorage.setItem(K_ALIVE, JSON.stringify({ t: now() })); } catch (e) { /* 使えない環境 */ } refreshPlay(); };
  const bye = () => { try { localStorage.removeItem(K_ALIVE); } catch (e) { } };
  let eased = false;
  const startBeat = () => { if (beat || api.leaving || checking) return; alive(); beat = setInterval(() => {
    alive();
    if (!eased && safe > (ios ? IOS_FLOOR : 0) && now() - t0 > 20 * 60 * 1000) { eased = true; store(K_SAFE, safe - 1); }   // 落ちずに 20 分: 次の起動で 1 つ戻す(今の起動はそのまま)。iOS のアプリは 1 まで
  }, 5000); };
  const stopBeat = () => { if (beat) { clearInterval(beat); beat = null; } if (!checking) bye(); };
  if (raw0) setTimeout(() => {
    let raw1 = null; try { raw1 = localStorage.getItem(K_ALIVE); } catch (e) { }
    checking = false;
    if (raw1 === raw0) markCrash();
    if (!document.hidden) startBeat();
  }, 6500);
  addEventListener('pagehide', stopBeat);
  // 11/27 片付けた(release)後のページが「戻る」の cache から戻ってきたら(描く所も音も止めてあるので黒い画面になる)、読み直す
  addEventListener('pageshow', (e) => { if (e.persisted && api.leaving) { try { location.reload(); } catch (err) { } } });
  addEventListener('beforeunload', stopBeat);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopBeat(); else startBeat(); });
  if (!document.hidden) startBeat();

  // ---------------------------------------------------------------- 1) 描く所が失われた時
  let box = null, waitT = 0;
  function overlay(kind) {
    if (!box) {
      box = document.createElement('div'); box.id = 'memLost';
      box.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:rgba(10,24,16,.92);color:#fff;font:600 17px/1.6 system-ui,sans-serif;text-align:center;padding:24px';
      document.body.appendChild(box);
    }
    if (kind === 'hide') { box.style.display = 'none'; return; }
    box.style.display = 'flex';
    if (kind === 'wait') box.innerHTML = '<div>画面を作り直しています…</div>';
    else {
      box.innerHTML = '<div>画面の準備がうまくいきませんでした。<br>軽い画質で開き直します。</div>';
      const b = document.createElement('button'); b.id = 'memReopen'; b.textContent = '軽い画質で開き直す';
      b.style.cssText = 'font:700 18px system-ui,sans-serif;padding:14px 26px;border-radius:14px;border:0;background:#f5c84a;color:#222';
      b.addEventListener('click', (e) => { e.stopPropagation(); reopenLight(); });
      box.appendChild(b);
    }
  }
  function reopenLight() {
    try { store(K_SAFE, Math.max(2, api.safe)); store('r4walk.q2', touch ? 'auto' : 'lite'); store('r4walk.autoLv', 0); } catch (e) { }
    stopBeat(); api.leaving = true;
    location.reload();
  }
  canvas.addEventListener('webglcontextlost', (e) => {
    if (api.leaving) return;
    e.preventDefault();   // 戻せるようにする(しないと二度と描けない)
    api.lost++;
    overlay('wait');
    clearTimeout(waitT); waitT = setTimeout(() => { if (renderer.getContext().isContextLost()) overlay('fail'); }, 6000);
  }, false);
  canvas.addEventListener('webglcontextrestored', () => {
    if (api.leaving) return;
    clearTimeout(waitT);
    api.restored++;
    // 記憶が足りなくて失われたと見て、1 段下げる(スマホ)。「標準」は「自動」へ
    if (touch || ios) {
      safe = Math.max(safe, 1); api.safe = safe; store(K_SAFE, safe);
      gfx.setCeil(Math.min(gfx.ceil, Math.max(0, gfx.lv - 1)));
      if (getQuality() === 'std') try { setQuality('auto'); } catch (e) { }
    }
    // three が絵・形を送り直すのは次に描く時。描いて作る絵(環境の光・後処理)はここで作り直す
    setTimeout(() => { try { gfx.restore(); overlay('hide'); } catch (err) { overlay('fail'); } }, 0);
  }, false);
  return api;

  // ---------------------------------------------------------------- 4) 守備の最中に落ちたら、読み直した後にもう一度始める(11/28)
  // main.js の startMode が playing(sel)、toTitle が playing(null) を呼ぶ。印を書く時(5 秒ごと)にキャリア・チャレンジかと、守備が続いているかを書き直す
  function playing(sel) {
    if (!sel || !DEF_MODES.includes(sel.mode)) { try { localStorage.removeItem(K_PLAY); } catch (e) { } return; }
    const rec = { mode: sel.mode, pos: sel.pos, count: sel.count, view: sel.view, time: sel.time, mark: sel.mark, cheer: sel.cheer, stadium: (window.__app && window.__app.ui && window.__app.ui.app && window.__app.ui.app.stadium) || sel.stadium, t: now() };
    try { const C = window.__career; rec.career = !!(C && C.active); } catch (e) { }
    try { localStorage.setItem(K_PLAY, JSON.stringify(rec)); } catch (e) { }
  }
  function refreshPlay() {
    let rec = null; try { rec = JSON.parse(localStorage.getItem(K_PLAY) || 'null'); } catch (e) { }
    if (!rec) return;
    const A = window.__app, d = A && A.defense;
    if (!d || !d.active) { if (now() - rec.t > 20000) try { localStorage.removeItem(K_PLAY); } catch (e) { } return; }   // 守り終わった(結果の画面など)。始めて 20 秒の内は読み込みの途中なので残す
    try { const C = window.__career; rec.career = !!(C && C.active); } catch (e) { }
    rec.t = now();
    try { localStorage.setItem(K_PLAY, JSON.stringify(rec)); } catch (e) { }
  }
  function toast(html, ms) {
    const el = document.createElement('div'); el.id = 'memResume';
    el.style.cssText = 'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:99998;max-width:86vw;background:rgba(10,24,16,.94);color:#fff;font:600 15px/1.55 system-ui,sans-serif;text-align:center;padding:12px 18px;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.4);pointer-events:none';
    el.innerHTML = html; document.body.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .5s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 600); }, ms || 4200);
  }
  // main.js が読み終わった後に呼ぶ(ui = メニューの画面)。落ちていなければ何もしない
  function resume(ui) {
    if (off || /[?&]noresume=1/.test(location.search) || !play0 || (!touch && !ios)) return;
    const go = () => {
      if (now() - play0.t > 10 * 60 * 1000) return;
      if (play0.stadium && ui.app && ui.app.stadium && play0.stadium !== ui.app.stadium) return;
      let tr = null; try { tr = JSON.parse(localStorage.getItem(K_TRY) || 'null'); } catch (e) { }
      if (!tr || now() - tr.t > 10 * 60 * 1000) tr = { n: 0, t: now() };
      if (tr.n >= 2) {
        api.resumed = 'gave_up';
        toast('端末の記憶が足りず、守備の途中で止まってしまいました。<br>一時停止の「画質」を「軽量」にすると遊びやすくなります。', 7000);
        return;
      }
      tr.n++; try { localStorage.setItem(K_TRY, JSON.stringify(tr)); } catch (e) { }
      api.resumed = play0.career ? 'career' : play0.mode;
      toast('画面の記憶が足りなくなったので、画質を下げてもう一度始めます。');
      setTimeout(() => {
        try {
          const C = window.__career;
          if (play0.career && C && C.start && C.start()) return;
          const s = ui.sel;
          for (const k of ['mode', 'pos', 'count', 'view', 'time', 'mark', 'cheer']) if (play0[k] != null) s[k] = play0[k];
          ui.go();
        } catch (e) { console.warn('もう一度始める', e); }
      }, 900);
    };
    if (api.crashed) go(); else if (checking) onCrash = go;
  }

  // ---------------------------------------------------------------- 3) 球場を替える前の片付け
  function release() {
    api.leaving = true; stopBeat();
    try { const s = getSound && getSound(); if (s && s.ctx && s.ctx.close) s.ctx.close(); } catch (e) { /* 片付けられなくても進む */ }
    try { renderer.dispose(); } catch (e) { }
    try { renderer.forceContextLoss(); } catch (e) { }
  }
}
