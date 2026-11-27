// 11/26 記憶の見張り(iOS 版に「重すぎてアプリ落ちる」の声。iOS の WKWebView は使える記憶が端末で低く、超えると白い画面か落ちる)。
// 1) 描く所(WebGL)が失われた時(webglcontextlost)に白い画面のままにしない: 「画面を作り直しています」を出して戻るのを待ち、
//    戻ったら環境の光などを作り直して、自動の段を 1 つ下げる。6 秒で戻らなければ「軽い画質で開き直す」を出す。
// 2) 前の起動が、遊んでいる途中で(閉じる・裏へ回すをせずに)終わっていたら、落ちたと見て、自動の段の天井を下げる(起動して 6.5 秒で決める)
//    (1 回目 段 3 = 画面の細かさ 1.5 まで・2 回目 段 2 = 1.25・3 回目から 段 1 = 1.0)。20 分落ちずに遊べたら次の起動で 1 つ戻す。
// 3) 球場を替える(ページの読み直し)前に、描く所と音を先に片付ける(前の球場の絵・形・音を持ったまま次を読まない)。
// 11/27 iOS のアプリ(Capacitor の iOS)は「試合に入るとタイトルに戻される」(WKWebView の記憶あふれ)の星 1 が 3 件: 初めての起動から落ちにくい側で始める。
//    記録(r4walk.memSafe)が無い時は 2(段 2 = 画面の細かさ 1.25)から。20 分落ちずに遊べたら 1 つ戻すのは同じだが、1 より下(天井 3 より上)へは戻さない。PC・Android・ブラウザ版は前のまま。
// ?nomemguard=1 で 1)2) を入れない。試験は window.__memGuard。
const K_ALIVE = 'r4walk.alive', K_SAFE = 'r4walk.memSafe';
const CEIL = [4, 3, 2, 1];   // memSafe 0〜3 → 自動の段の天井(gfx.js の AUTO_LV)
const IOS_SAFE0 = 2, IOS_FLOOR = 1;   // 11/27 iOS のアプリ: 記録が無い時の始まり・戻す下限
const isIosApp = () => { try { const C = window.Capacitor; return !!(C && C.getPlatform && C.getPlatform() === 'ios'); } catch (e) { return false; } };

export function memGuard({ renderer, gfx, touch, getSound, getQuality, setQuality, store, load }) {
  const off = /[?&]nomemguard=1/.test(location.search);
  const canvas = renderer.domElement;
  const ios = isIosApp();
  const api = { ios, safe: 0, crashed: false, lost: 0, restored: 0, leaving: false, release, info: () => ({ safe: api.safe, crashed: api.crashed, lost: api.lost, restored: api.restored, ceil: gfx.ceil, lv: gfx.lv }) };
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
  let checking = !!raw0;
  const t0 = now();
  let beat = null;
  const alive = () => { try { localStorage.setItem(K_ALIVE, JSON.stringify({ t: now() })); } catch (e) { /* 使えない環境 */ } };
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
    if (raw1 === raw0) { api.crashed = true; safe = Math.min(3, safe + 1); api.safe = safe; store(K_SAFE, safe); applySafe(); }
    if (!document.hidden) startBeat();
  }, 6500);
  addEventListener('pagehide', stopBeat);
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

  // ---------------------------------------------------------------- 3) 球場を替える前の片付け
  function release() {
    api.leaving = true; stopBeat();
    try { const s = getSound && getSound(); if (s && s.ctx && s.ctx.close) s.ctx.close(); } catch (e) { /* 片付けられなくても進む */ }
    try { renderer.dispose(); } catch (e) { }
    try { renderer.forceContextLoss(); } catch (e) { }
  }
}
