// 11/25 守備のキャリアの画面(キャリアの画面・試合の終わりの画面・試合の中の小さな札)。
// 見た目は ChatGPT の案(_chatgpt_career_1125/career_result_gpt_1125.png): 夜の球場と花火、紺と金の枠、緑のバー、赤い昇格の帯、緑の大きなボタン。
// 文字は全部 HTML(絵に焼かない)。飾りの花火だけ案の絵から切り出した(img/career_fw_l.webp・career_fw_r.webp)。
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const ICON = {
  arm: '<svg viewBox="0 0 24 24"><path d="M5 19c1-5 3-8 6-9l1-4c.3-1.2 2-1.4 2.6-.3l.9 1.8c1.6.3 3 1.5 3.5 3.2.6 2.3-.6 4.6-2.8 5.6L11 19z" fill="currentColor"/></svg>',
  field: '<svg viewBox="0 0 24 24"><path d="M6 20c-2-2-2.5-6-1.5-9L6 6c.4-1.3 2.2-1.2 2.4.1L9 9l.7-5.2c.2-1.3 2-1.3 2.2 0l.4 4.7.9-4c.3-1.2 2-1.1 2.1.2l.2 4.6 1.4-2.6c.6-1.1 2.3-.6 2.1.7L18 14c-.6 3.6-3 6.4-6.5 6.8z" fill="currentColor"/></svg>',
  sure: '<svg viewBox="0 0 24 24"><path d="M12 2 20 5v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z" fill="currentColor"/><path d="m8 12 3 3 5-6" fill="none" stroke="#0b3a7a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
const DIAMOND = '<svg class="cDia" viewBox="0 0 60 44"><path d="M30 41 4 17A36 36 0 0 1 56 17Z" fill="none" stroke="#fff" stroke-width="2.4"/><path d="M30 38 18 26 30 14 42 26Z" fill="none" stroke="#fff" stroke-width="2"/><circle class="cDot" r="3.6" fill="#ffd23a"/></svg>';
const DOT = { '1B': [42, 26], '2B': [36, 15], SS: [24, 15], '3B': [18, 26], LF: [12, 9], CF: [30, 5], RF: [48, 9], P: [30, 26.5], C: [30, 38.5] };   // 11/26 投手・捕手の点も
// 11/26 持ち主「説明とかも入れてください 分からない人居ると思うので uzr の注釈として」: UZR の横の小さな「?」。押した時だけ短い注釈を出す
const Q = '<button type="button" class="cQ" data-act="uzrq" aria-label="UZR とは">?</button>';
const UZR_HELP = ['同じ打球を「平均的な守備の選手」が守った時と比べて、何点ぶん失点を防いだかを表す数字です。',
  'プラスなら平均より多く防いだ、マイナスなら平均より失点を許した、という意味です。',
  '守備範囲・併殺・肩・失策の 4 つを合わせた数です(捕手は盗塁を刺した分)。',
  '目安(1 シーズン): +10 で上手い、0 で平均、−10 で下手。',
  '1 試合では小さな数になります(難しい打球を捕って +0.3〜0.8 ほど)。'];
// 能力の文字(S 90〜・A 80〜・B 70〜・C 60〜・D 50〜・E 40〜・F 20〜・G 1〜)。色は career.css の .cLetter.gS〜gG
export const GRADE = (v) => (v >= 90 ? 'S' : v >= 80 ? 'A' : v >= 70 ? 'B' : v >= 60 ? 'C' : v >= 50 ? 'D' : v >= 40 ? 'E' : v >= 20 ? 'F' : 'G');
// 試合の中の小さな札を出すか(一時停止の「画面に出すもの」の「プレーの札」。初めは出さない。js/hudprefs.js と同じ r4walk.hud)
const popsOn = () => { try { const v = JSON.parse(localStorage.getItem('r4walk.hud') || '{}'); return !!(v && v.carPop); } catch (e) { return false; } };
const POS7 = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];   // 11/25 投手・捕手を足した(名前は前のまま)
const POS_SHORT = { '1B': '一', '2B': '二', '3B': '三', SS: '遊', LF: '左', CF: '中', RF: '右', P: '投', C: '捕' };
// 11/26 キャリアの説明(チュートリアル)を見たか
const TUT_KEY = 'r4walk.carTut';
const tutSeen = () => { try { return !!localStorage.getItem(TUT_KEY); } catch (e) { return true; } };
const ADJ_NOTE = '位置の補正あり: 守る位置で打球の数や難しさがちがうので、どの位置でも同じ物差しになるよう均した値です';

export class CareerUI {
  constructor(C) { this.C = C; this.built = false; }
  get K() { return this.C.K; }
  build(ui) {
    this.built = true; this.appUI = ui;
    // タイトルのボタン(守備の試合のすぐ下)
    const modes = $('modes');
    if (modes && !modes.querySelector('[data-mode="career"]')) {
      const b = document.createElement('button');
      b.className = 'mode'; b.dataset.mode = 'career';
      b.innerHTML = '<span class="ic ic-career"></span><b>守備のキャリア</b>';
      const g = modes.querySelector('[data-mode="game"]');
      if (g) g.after(b); else modes.prepend(b);
      b.addEventListener('click', (e) => { e.stopPropagation(); this.openHub(); });
      const n = [...modes.querySelectorAll('.mode')].filter((x) => !x.classList.contains('hide')).length;
      modes.dataset.n = String(n);
    }
    // 画面
    const hub = document.createElement('section'); hub.id = 'carHub'; hub.className = 'carScreen hide';
    const res = document.createElement('section'); res.id = 'carRes'; res.className = 'carScreen hide';
    const pop = document.createElement('div'); pop.id = 'carPops';
    const intro = document.createElement('div'); intro.id = 'carIntro';
    document.body.append(hub, res, pop, intro);
    this.hub = hub; this.res = res; this.pops = pop; this.introEl = intro;
    hub.addEventListener('click', (e) => this.onHubClick(e));
    res.addEventListener('click', (e) => this.onResClick(e));
    for (const el of [hub, res]) { el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true }); el.addEventListener('mousedown', (e) => e.stopPropagation()); }
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && !this.hub.classList.contains('hide')) { e.stopPropagation(); this.backToTitle(); } }, true);
    const tick = () => { try { this.placePops(); } catch (e) { /* 飾り */ } requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  isOpen() { return !!this.hub && (!this.hub.classList.contains('hide') || !this.res.classList.contains('hide') || [this.card, this.rankEl, this.tutEl].some((x) => x && !x.classList.contains('hide'))); }
  hide() { if (!this.hub) return; this.hub.classList.add('hide'); this.res.classList.add('hide'); for (const x of [this.card, this.rankEl, this.tutEl]) if (x) x.classList.add('hide'); }
  bg() {
    const st = (window.__app && window.__app.ui && window.__app.ui.app && window.__app.ui.app.stadium) || 'koshien';
    return `<div class="carBg" style="--st:url('img/stadium_thumbs/${esc(st)}.jpg')"><i class="fwL"></i><i class="fwR"></i></div>`;
  }
  ladder(cur, lit) {
    return `<div class="cLadder">${this.K.STAGES.map((s, i) => `<span class="cStep${i === cur ? ' on' : ''}${i < cur ? ' done' : ''}${i === lit ? ' lit' : ''}">${esc(s.name)}</span>${i < 2 ? '<i class="cArrow"></i>' : ''}`).join('')}</div>`;
  }
  posRow(pos) {
    const [x, y] = DOT[pos] || DOT.SS;
    return `<div class="cPosRow">${DIAMOND.replace('class="cDot"', `class="cDot" cx="${x}" cy="${y}"`)}<div class="cPosPill">守備位置: <b>${esc(this.K.POS_NAME[pos] || pos)}</b></div></div>`;
  }
  abRows(ab, ups, xp) {
    const K = this.K;
    return ['arm', 'field', 'sure'].map((k) => {
      const v = ab[k], w = Math.round(100 * v / K.AB_MAX), up = ups && ups[k];
      const nx = xp ? (v >= K.AB_MAX ? '最高' : `次まで ${K.xpNeed(v) - xp[k]}`) : '';
      const g = GRADE(v);
      return `<div class="cAb${up ? ' upd' : ''}"><span class="cAbName">${ICON[k]}${esc(K.AB_NAME[k])}</span><span class="cBar"><i style="--w:${w}%"></i></span>`
        + `<span class="cAbG"><b class="cLetter g${g}">${g}</b><small class="cAbV">${v}</small></span>${up ? `<span class="cPlus">+${up}</span>` : '<span class="cPlus none"></span>'}${nx ? `<small class="cNext">${nx}</small>` : ''}</div>`;
    }).join('');
  }
  table(rows) { return `<table class="cTable">${rows.map(([k, v, cls]) => `<tr><th>${k === 'UZR' ? 'UZR' + Q : esc(k)}</th><td class="${cls || ''}">${v}</td></tr>`).join('')}</table>`; }

  // ------------------------------------------------ キャリアの画面
  openHub() {
    const ui = this.appUI; if (!ui) return;
    ui.hideAll(); ui.app.setOverlay(true);
    this.res.classList.add('hide');
    this.renderHub();
    this.hub.classList.remove('hide');
    this.hub.scrollTop = 0;
    if (!this.C.data.name) this.openCard(true);   // 初めは名前を決める
  }
  renderHub() {
    const C = this.C, D = C.data, K = this.K, st = C.stage, T = D.tot;
    const need = st.need;
    const nextName = need ? K.STAGES[D.stage + 1].name : '';
    const left = K.FINAL_GAMES - D.stageGames[2];
    const fe = K.finalEval(D);
    const goal = need
      ? `<div class="cGoal"><b>${esc(nextName)}へ上がる条件</b><span>評価 ${need.rank} 以上 か UZR${Q} ${K.uzrText(need.uzr)} 以上を、直近 3 試合のうち 2 試合(${esc(st.name)}で ${st.min} 試合以上)</span>${this.progress(K.promoInfo(D))}</div>`
      : D.done ? '' : `<div class="cGoal"><b>キャリア完了まで</b><span>プロで あと ${Math.max(0, left)} 試合${left === 2 ? '(次は 優勝のかかった試合)' : left === 1 ? '(次が 最終戦)' : ''}</span><small class="cProg">プロ 5 試合を終えた時の UZR でランキングを競います</small></div>`;
    const fin = T.games ? `<div class="cPanel cLight cFinal${D.final ? ' fixed' : ''}"><div class="cRibbon">${D.final ? 'キャリアの最終評価' : 'いまの守備の評価(通算)'}</div>`
      + `<div class="cFinRow"><div class="cStamp sm r${fe.grade}"><span>${fe.grade}</span></div><div><div class="cFinTitle">${esc(fe.title)}</div><div class="cFinSub">${fe.score}/100 ・ 1 試合あたり UZR ${K.uzrText(fe.uzrPG)} ・ 守備率 ${K.fpctText(T.po, T.a, T.e)}</div></div></div></div>` : '';
    const ready = !!(window.__app && window.__app.ready);
    const done = D.done ? `<div class="cPanel cDark cDoneP"><div class="cDoneHead">キャリア完了</div>${this.miniCard(D.done)}
        <div class="cNote">この選手の記録は殿堂に残りました。新しい選手で、もう一度 最高の守備職人を目指せます。</div>
        <button class="cGo" data-act="new">新しい選手で始める</button></div>` : '';
    const nH = C.hof().length;
    const menu = `<div class="cRow3"><button class="cBtn" data-act="rank">ランキング</button><button class="cBtn" data-act="tut">キャリアの説明</button><button class="cBtn" data-act="hof">殿堂${nH ? ` <small>${nH}</small>` : ''}</button></div>`;
    this.hub.innerHTML = this.bg() + `<div class="carSheet">
      <div class="cTop"><button class="cBack" data-act="back">戻る</button><h1 class="cLogo">守備のキャリア</h1></div>
      ${done}<div class="cPanel cDark">${this.ladder(D.stage)}${this.posRow(D.pos)}${goal}</div>
      ${menu}
      <button class="cCardBtn" data-act="card"><span class="cCardNo">${esc(D.num)}</span><span class="cCardTx"><b>${esc(D.name || '名前を決める')}</b><small>自分の選手カード</small></span></button>
      <div class="cPanel cLight"><div class="cRibbon">能力</div>${this.abRows(D.ab, null, D.xp)}
        <div class="cNote">肩: 送球の速さ・届く距離 / 守備: 走る速さ・グラブの届く幅 / エラー回避: お手玉・送球のそれ</div></div>
      <div class="cPanel cLight"><div class="cRibbon">通算成績</div>${this.table([
        ['試合', `${T.games}<small> (高校 ${D.stageGames[0]} ・ 社会人 ${D.stageGames[1]} ・ プロ ${D.stageGames[2]})</small>`],
        ['刺殺', T.po], ['補殺', T.a], ['失策', T.e], ['守備機会', T.po + T.a + T.e], ['守備率', K.fpctText(T.po, T.a, T.e)],
        ['UZR', K.uzrText(T.uzr), T.uzr >= 0 ? 'pos' : 'neg']])}${this.recent()}</div>
      ${fin}
      ${D.done ? '' : `<div class="cPanel cDark cPick"><div class="cPickHead">守る所</div><div class="cPosBtns">${POS7.map((p) => `<button data-pos="${p}" class="${p === D.pos ? 'on' : ''}" aria-label="${esc(K.POS_NAME[p])}">${POS_SHORT[p]}</button>`).join('')}</div>
        <div class="cNote">どこを守っても、その位置の普通の野手と比べて UZR を出します。替えても能力・通算成績・段はそのまま(位置ごとの成績は選手カードに)。</div></div>
      <button class="cGo" data-act="go"${ready ? '' : ' disabled'}>${ready ? `${esc(st.name)}の試合へ` : '読み込み中…'}</button>`}
      <button class="cReset" data-act="reset">記録を消して最初から</button>
    </div>`;
    if (!ready) { clearTimeout(this._rt); this._rt = setTimeout(() => { if (!this.hub.classList.contains('hide')) this.renderHub(); }, 800); }
  }
  // 昇格の進み具合(小さく): 直近 3 試合の ○× と、最短であと何試合
  progress(P) {
    if (!P) return '';
    const marks = [0, 1, 2].map((i) => { const v = P.last3[P.last3.length - 3 + i]; return v === undefined ? '<i class="pm">-</i>' : v ? '<i class="pm ok">○</i>' : '<i class="pm ng">×</i>'; }).join('');
    return `<small class="cProg">直近 3 試合 ${marks} ・ ${P.played}/${P.min} 試合 ・ 昇格まで 最短 あと ${P.left} 試合</small>`;
  }
  recent() {
    const H = this.C.data.hist.slice(-5).reverse(); if (!H.length) return '';
    return `<div class="cRecent"><div class="cRecentHead">最近の試合</div>${H.map((h) => `<div class="cRc"><span class="cRcSt">${esc(this.K.STAGES[h.stage].name)}</span><span class="cRcPos">${POS_SHORT[h.pos] || ''}</span><span class="cRk r${h.rank}">${esc(h.rank)}</span><span class="cRcU ${h.uzr >= 0 ? 'pos' : 'neg'}">UZR ${this.K.uzrText(h.uzr)}</span><span class="cRcS">${h.po}刺 ${h.a}補 ${h.e}失</span></div>`).join('')}</div>`;
  }
  onHubClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    e.stopPropagation();
    if (b.dataset.pos) { this.C.setPos(b.dataset.pos); this.renderHub(); return; }
    const a = b.dataset.act;
    if (a === 'uzrq') { this.uzrHelp(); return; }
    if (a === 'back') this.backToTitle();
    else if (a === 'card') this.openCard();
    else if (a === 'rank') this.openRank('pro5');
    else if (a === 'hof') this.openRank('hof');
    else if (a === 'tut') this.openTut();
    else if (a === 'new') this.startNew();
    else if (a === 'go') { if (!this.C.start()) this.renderHub(); }
    else if (a === 'reset') {
      if (!b.classList.contains('sure')) { b.classList.add('sure'); b.textContent = 'もう一度押すと消えます'; setTimeout(() => { if (b.isConnected) { b.classList.remove('sure'); b.textContent = '記録を消して最初から'; } }, 3000); return; }
      this.C.reset(); this.renderHub();
    }
  }
  backToTitle() {
    this.hide(); this.C.leave();
    const ui = this.appUI; if (ui) ui.show('title', true);
  }

  // ------------------------------------------------ 試合の終わりの画面
  result(r) {
    const K = this.K, C = this.C, D = C.data;
    const cur = r.stage, nextName = r.promoted ? K.STAGES[cur + 1].name : '';
    const vs = r.score2 ? `${r.won ? '勝ち' : r.score2.us === r.score2.them ? '引き分け' : '負け'} ${r.score2.us}-${r.score2.them}` : '';
    let band;
    if (r.promoted) band = `<div class="cBand promo"><i class="lw"></i><b>${esc(nextName)}へ昇格!</b><i class="lw r"></i></div>`;
    else if (r.need) {
      const why = !r.enough ? '守る機会が少なかった' : r.passed ? 'この試合は基準クリア' : `基準は 評価 ${r.need.rank} 以上 か UZR ${K.uzrText(r.need.uzr)} 以上`;
      band = `<div class="cBand stay"><b>${esc(K.STAGES[cur].name)}で続ける</b><small>${esc(why)}</small>${this.progress(r.prog)}</div>`;
    } else band = `<div class="cBand stay pro"><b>プロ ${r.game} 試合目</b><small>${r.final ? '' : r.proLeft === 2 ? '次は 優勝のかかった試合' : r.proLeft === 1 ? '次が 最終戦' : `キャリア完了まで あと ${Math.max(0, K.FINAL_GAMES - D.stageGames[2])} 試合`}</small></div>`;
    if (r.done) { this.doneScreen(r); return; }
    const fin = r.final ? `<div class="cPanel cLight cFinal fixed"><div class="cRibbon">${r.finalFirst ? 'キャリアの最終評価' : '最終評価(更新)'}</div><div class="cFinRow"><div class="cStamp sm r${r.final.grade}"><span>${r.final.grade}</span></div><div><div class="cFinTitle">${esc(r.final.title)}</div><div class="cFinSub">${r.final.score}/100 ・ 通算 ${r.final.games} 試合 ・ UZR ${K.uzrText(r.final.uzr)} ・ 守備率 ${K.fpctText(D.tot.po, D.tot.a, D.tot.e)}</div></div></div></div>` : '';
    const anyUp = Object.values(r.ups).some(Boolean);
    this.res.innerHTML = this.bg() + `<div class="carSheet res${r.promoted ? ' promoted' : ''}">
      <h1 class="cLogo">守備のキャリア</h1>
      <div class="cPanel cDark">${this.ladder(cur, r.promoted ? cur + 1 : -1)}${this.posRow(r.pos)}<div class="cGame">${esc(K.STAGES[cur].long)} 第${r.game}戦 ・ ${esc(vs)}</div></div>
      <div class="cPanel cLight cMain">
        <div class="cRibbon green">守備評価</div>
        <div class="cRankBox"><div class="cShine"></div><div class="cStamp r${esc(r.rank)}"><span>${esc(r.rank)}</span></div>
          <div class="cScore">${r.score != null ? `<b data-to="${r.score}">0</b><small>/ 100</small>` : '<small>守る機会がありませんでした</small>'}</div></div>
        ${this.table([['刺殺', r.po], ['補殺', r.a], ['失策', r.e], ['守備率', K.fpctText(r.po, r.a, r.e)], ['UZR', K.uzrText(r.uzr), r.uzr >= 0 ? 'pos' : 'neg']])}
      </div>
      <div class="cPanel cLight cAbP"><div class="cAbs">${this.abRows(r.ab, r.ups, null)}${anyUp ? '' : '<div class="cNote">能力は上がらなかった(経験は少しずつたまっています)</div>'}</div></div>
      ${band}${fin}
      <button class="cGo" data-act="next">次の試合へ</button>
      <div class="cRow2"><button class="cBtn" data-act="hub">キャリアの画面へ</button><button class="cBtn" data-act="title">タイトルへ</button></div>
      ${r.promoted ? '<div class="cConf">' + Array.from({ length: 36 }, (_, i) => `<i style="--x:${(i * 37) % 100};--d:${(i % 7) * 0.12}s;--c:${['#ffd23a', '#ff4b4b', '#39d353', '#4fb3ff', '#fff'][i % 5]};--r:${(i * 53) % 360}deg"></i>`).join('') + '</div>' : ''}
    </div>`;
    this.hub.classList.add('hide');
    const ui = this.appUI; if (ui) { ui.hideAll(); ui.app.setOverlay(true); }
    this.res.classList.remove('hide'); this.res.scrollTop = 0;
    // 点数を数え上げてから判子を押す
    const b = this.res.querySelector('.cScore b'), stamp = this.res.querySelector('.cMain .cStamp');
    const to = b ? +b.dataset.to : 0, t0 = performance.now();
    const step = (t) => { const u = Math.min(1, (t - t0) / 900); if (b) b.textContent = Math.round(to * (1 - Math.pow(1 - u, 3))); if (u < 1) requestAnimationFrame(step); else { stamp && stamp.classList.add('stamp'); this.res.querySelector('.carSheet').classList.add('shown'); } };
    requestAnimationFrame(step);
  }
  onResClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    e.stopPropagation();
    const a = b.dataset.act, ui = this.appUI;
    if (a === 'uzrq') { this.uzrHelp(); return; }
    if (a === 'next') { this.res.classList.add('hide'); this.C.start(); }
    else if (a === 'rank') this.openRank('pro5');
    else if (a === 'new') { ui.app.toTitle(); this.openHub(); this.startNew(); }
    else if (a === 'hub') { ui.app.toTitle(); this.openHub(); }
    else if (a === 'title') { ui.app.toTitle(); this.hide(); ui.show('title', true); }
  }

  // ------------------------------------------------ 自分の選手カード(ChatGPT の案 _chatgpt_career_1125/player_card_gpt_1125.png。後ろ姿の絵は案から切り出し、背番号と文字は HTML)
  openCard(edit) {
    this._pick = this.C.data.pos;
    if (!this.card) {
      const el = document.createElement('section'); el.id = 'carCard'; el.className = 'carScreen hide';
      document.body.appendChild(el); this.card = el;
      el.addEventListener('click', (e) => this.onCardClick(e));
      el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true }); el.addEventListener('mousedown', (e) => e.stopPropagation());
      el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.target.tagName === 'INPUT') this.saveName(); });
      addEventListener('keydown', (e) => { if (e.code === 'Escape' && this.card && !this.card.classList.contains('hide')) { e.stopPropagation(); this.closeCard(); } }, true);
    }
    this.renderCard(!!edit);
    this.card.classList.remove('hide'); this.card.scrollTop = 0;
    if (edit) setTimeout(() => { const i = this.card.querySelector('#cNameIn'); if (i) i.focus(); }, 60);
  }
  closeCard() { if (this.card) this.card.classList.add('hide'); if (!this.hub.classList.contains('hide')) this.renderHub(); }
  renderCard(edit) {
    const C = this.C, D = C.data, K = this.K, T = D.tot;
    const ready = !!(window.__app && window.__app.ready);
    const [dx, dy] = DOT[D.pos] || DOT.SS;
    const pickPos = edit === 'pos' || (edit && !D.name);   // 11/26 初めてのカードと「守備位置を変える」で、図から守る所を選ぶ
    const picker = pickPos ? `<div class="cPanel cDark pcPick"><div class="cPickHead">守備位置を選ぶ</div>${this.posPicker(this._pick || D.pos)}
         <div class="cNote">${D.name ? '替えても 能力・通算成績・段は そのまま。位置ごとの成績は分けて残ります' : 'あとから キャリアの画面か このカードで 替えられます'}</div>
         ${edit === 'pos' ? '<button class="cBtn pcSave" data-act="savepos">この位置にする</button>' : ''}</div>` : '';
    const nameBox = edit === 'pos' ? picker : edit
      ? `<div class="pcEdit"><label class="pcL1">名前<input id="cNameIn" maxlength="10" autocomplete="off" value="${esc(D.name)}" placeholder="10 文字まで"></label>
         <label class="pcL2">背番号<input id="cNumIn" type="number" inputmode="numeric" min="0" max="99" value="${esc(D.num)}"></label>
         <button class="cBtn pcSave" data-act="save">決める</button></div>${picker}`
      : '';
    this.card.innerHTML = this.bg() + `<div class="carSheet pc">
      <div class="cTop"><button class="cBack" data-act="close">戻る</button><h1 class="cLogo">守備のキャリア</h1></div>
      <div class="pcHead">自分の選手カード</div>
      <div class="pcCard"><div class="pcTag">PLAYER CARD</div>
        <div class="pcArt"><span class="pcNum">${esc(D.num)}</span></div>
        <div class="pcInfo">
          <div class="pcBox"><i>名前</i><b class="pcName">${esc(D.name || '(未設定)')}</b></div>
          <div class="pcBox dark"><i>守備位置</i><b class="pcPos">${esc(K.POS_NAME[D.pos] || D.pos)}</b>${DIAMOND.replace('class="cDot"', `class="cDot" cx="${dx}" cy="${dy}"`)}</div>
          <div class="pcBox"><i>今の段</i><b>${esc(C.stage.name)}</b></div>
        </div>
      </div>
      ${nameBox}
      <div class="cPanel cLight pcAbs">${this.abRows(D.ab, null, null)}</div>
      <div class="cPanel cDark pcStats"><div class="pcStatHead">成績</div>
        <table class="pcTable"><tr><th></th><th>試合</th><th>刺殺</th><th>補殺</th><th>失策</th><th>守備率</th><th>UZR${Q}</th></tr>
        ${[[`${POS_SHORT[D.pos] || ''}`, C.posStats(D.pos), 'pcRowPos'], ['通算', T, '']].map(([nm, S, cls]) => `<tr class="${cls}"><th>${esc(nm)}</th><td>${S.games}</td><td>${S.po}</td><td>${S.a}</td><td>${S.e}</td><td>${K.fpctText(S.po, S.a, S.e)}</td><td class="${S.uzr >= 0 ? 'pos' : 'neg'}">${K.uzrText(S.uzr)}</td></tr>`).join('')}</table>
        <div class="pcBestRow">最高評価 ${D.best ? `<b class="pcBest r${esc(D.best)}">${esc(D.best)}</b>` : '-'} ・ 上の行は 今の位置(${esc(K.POS_NAME[D.pos] || D.pos)})の分</div></div>
      ${D.done ? '<button class="cGo blue" data-act="close">キャリアの画面へ</button>' : `<button class="cGo" data-act="go"${ready && D.name ? '' : ' disabled'}>${D.name ? (ready ? '次の試合へ' : '読み込み中…') : '名前を決めてください'}</button>`}
      ${edit || D.done ? '' : '<div class="cRow2"><button class="cBtn" data-act="edit">名前を変える</button><button class="cBtn" data-act="pos">守備位置を変える</button></div>'}
    </div>`;
  }
  saveName() {
    const i = this.card.querySelector('#cNameIn'), n = this.card.querySelector('#cNumIn');
    const v = i ? i.value : '';
    if (!String(v).trim()) { if (i) { i.classList.add('bad'); i.focus(); } return; }
    const first = !this.C.data.name;
    this.C.setName(v); if (n) this.C.setNum(n.value);
    if (this._pick) this.C.setPos(this._pick);
    this.renderCard(false);
    // 11/26 初めて選手カードを作った時は、キャリアの説明を出す(飛ばせる。キャリアの画面の「キャリアの説明」から見返せる)
    if (first && !tutSeen()) this.openTut(true);
  }
  onCardClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    e.stopPropagation();
    const a = b.dataset.act;
    if (b.dataset.pick) { this._pick = b.dataset.pick; for (const x of this.card.querySelectorAll('[data-pick]')) x.classList.toggle('on', x === b); const t = this.card.querySelector('.pcPickName'); if (t) t.textContent = this.K.POS_NAME[this._pick]; return; }
    if (a === 'uzrq') { this.uzrHelp(); return; }
    if (a === 'pos') { this._pick = this.C.data.pos; this.renderCard('pos'); return; }
    if (a === 'savepos') { this.C.setPos(this._pick); this.renderCard(false); return; }
    if (a === 'close') this.closeCard();
    else if (a === 'edit') this.renderCard(true);
    else if (a === 'save') this.saveName();
    else if (a === 'go') { if (!this.C.data.name) return; this.card.classList.add('hide'); if (!this.C.start()) this.openCard(); }
  }

  // 11/26 守る所を図で選ぶ(9 つ)。点の位置は DIAMOND と同じ座標(60x44)を広げた物
  posPicker(cur) {
    const K = this.K;
    return `<div class="pcField"><svg viewBox="0 0 60 44" aria-hidden="true"><path d="M30 41 4 17A36 36 0 0 1 56 17Z" fill="rgba(40,140,60,.55)" stroke="#fff" stroke-width=".8"/><path d="M30 38 18 26 30 14 42 26Z" fill="rgba(190,130,70,.55)" stroke="#fff" stroke-width=".6"/></svg>`
      + POS7.map((p) => { const [x, y] = DOT[p]; return `<button type="button" class="pcPosBtn${p === cur ? ' on' : ''}" data-pick="${p}" style="left:${(x / 60 * 100).toFixed(1)}%;top:${(y / 44 * 100).toFixed(1)}%" aria-label="${esc(K.POS_NAME[p])}">${POS_SHORT[p]}</button>`; }).join('')
      + `</div><div class="pcPickNow">選んだ位置: <b class="pcPickName">${esc(K.POS_NAME[cur] || cur)}</b></div>`;
  }
  uzrHelp() {
    let el = $('carHelp');
    if (!el) {
      el = document.createElement('div'); el.id = 'carHelp'; el.className = 'hide';
      el.innerHTML = `<div class="chBox" role="dialog" aria-label="UZR とは"><b>UZR とは</b>${UZR_HELP.map((t) => `<p>${esc(t)}</p>`).join('')}<button type="button" class="cBtn" data-x="1">閉じる</button></div>`;
      el.addEventListener('click', (e) => { e.stopPropagation(); if (e.target === el || e.target.closest('[data-x]')) el.classList.add('hide'); });
      for (const t of ['touchstart', 'mousedown', 'keydown']) el.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
      document.body.appendChild(el);
    }
    el.classList.remove('hide');
  }

  // ------------------------------------------------ 11/26 キャリア完了・殿堂・ランキング・キャリアの説明
  miniCard(c) {
    const K = this.K;
    return `<div class="cMini"><div class="cMiniArt"><span>${esc(c.num)}</span></div><div class="cMiniTx"><b>${esc(c.name || '(名前なし)')}</b>`
      + `<small>${esc(K.POS_NAME[c.pos] || c.pos)} ・ ${esc(c.title || '')}</small><small>プロ ${c.pro ? c.pro.games : 0} 試合 ・ UZR(位置の補正あり) <em class="${c.pro && c.pro.adj >= 0 ? 'pos' : 'neg'}">${K.uzrText(c.pro ? c.pro.adj : 0)}</em></small></div>`
      + `<div class="cStamp sm r${esc(c.grade || 'C')}"><span>${esc(c.grade || '-')}</span></div></div>`;
  }
  startNew() {
    this.C.newCareer();
    this.renderHub();
    this.openCard(true);   // 新しい選手の名前・背番号・守備位置
  }
  // プロ 5 試合目の後: キャリア完了の画面(プロ通算の成績・UZR・評価・選手カード)
  doneScreen(r) {
    const K = this.K, c = r.done, P = c.pro;
    this.res.innerHTML = this.bg() + `<div class="carSheet res done">
      <h1 class="cLogo">キャリア完了</h1>
      <div class="cPanel cDark"><div class="cGame">プロ野球 最終戦 ・ ${esc(r.score2 ? `${r.won ? '勝ち' : r.score2.us === r.score2.them ? '引き分け' : '負け'} ${r.score2.us}-${r.score2.them}` : '')} ・ この試合 UZR ${K.uzrText(r.uzr)}</div></div>
      <div class="cPanel cLight cMain"><div class="cRibbon green">最終評価</div>
        <div class="cRankBox"><div class="cShine"></div><div class="cStamp r${esc(c.grade)}"><span>${esc(c.grade)}</span></div><div class="cDoneTitle">${esc(c.title)}</div><div class="cScore"><b data-to="${c.score}">0</b><small>/ 100</small></div></div>
        <div class="cSubHead">プロ通算(${P.games} 試合)</div>
        ${this.table([['アウトを取った数(刺殺)', P.po], ['送球でアウト(補殺)', P.a], ['エラー(失策)', P.e], ['守備率', K.fpctText(P.po, P.a, P.e)], ['UZR', K.uzrText(P.uzr), P.uzr >= 0 ? 'pos' : 'neg'],
          ['UZR(位置の補正あり)', K.uzrText(P.adj), P.adj >= 0 ? 'pos' : 'neg']])}
        <div class="cNote dk">${esc(ADJ_NOTE)}</div></div>
      <div class="cPanel cDark cDoneP"><div class="cDoneHead">殿堂入りした選手カード</div>${this.miniCard(c)}<div class="cRankSt" id="cSendSt">ランキングに送っています…</div></div>
      <button class="cGo" data-act="rank">ランキングを見る</button>
      <div class="cRow2"><button class="cBtn" data-act="new">新しい選手で始める</button><button class="cBtn" data-act="title">タイトルへ</button></div>
      <div class="cConf">${Array.from({ length: 36 }, (_, i) => `<i style="--x:${(i * 37) % 100};--d:${(i % 7) * 0.12}s;--c:${['#ffd23a', '#ff4b4b', '#39d353', '#4fb3ff', '#fff'][i % 5]};--r:${(i * 53) % 360}deg"></i>`).join('')}</div>
    </div>`;
    this.hub.classList.add('hide');
    const ui = this.appUI; if (ui) { ui.hideAll(); ui.app.setOverlay(true); }
    this.res.classList.remove('hide'); this.res.scrollTop = 0;
    const b = this.res.querySelector('.cScore b'), stamp = this.res.querySelector('.cMain .cStamp'), to = b ? +b.dataset.to : 0, t0 = performance.now();
    const step = (t) => { const u = Math.min(1, (t - t0) / 1100); if (b) b.textContent = Math.round(to * (1 - Math.pow(1 - u, 3))); if (u < 1) requestAnimationFrame(step); else { stamp && stamp.classList.add('stamp'); const s = this.res.querySelector('.carSheet'); s && s.classList.add('shown'); } };
    requestAnimationFrame(step);
    const st = (t) => { const el = this.res.querySelector('#cSendSt'); if (el) el.textContent = t; };
    Promise.resolve(this.C.lastSend).then((R) => {
      const a = Array.isArray(R) ? R[0] : R;
      if (!a) st('この端末の記録に残しました');
      else if (a.ok) st('ランキングに載せました(位置の補正ありの UZR)');
      else if (a.why === 'implausible') st('ありえない値だったので、ランキングには送りませんでした');
      else st('いまはランキングに送れないので、この端末に残しました(あとで送ります)');
    });
  }

  // ランキング(板: pro5・season_*・pos_*)と殿堂
  openRank(board) {
    if (!this.rankEl) {
      const el = document.createElement('section'); el.id = 'carRank'; el.className = 'carScreen hide';
      document.body.appendChild(el); this.rankEl = el;
      el.addEventListener('click', (e) => this.onRankClick(e));
      el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true }); el.addEventListener('mousedown', (e) => e.stopPropagation());
      addEventListener('keydown', (e) => { if (e.code === 'Escape' && this.rankEl && !this.rankEl.classList.contains('hide')) { e.stopPropagation(); this.closeRank(); } }, true);
    }
    const ui = this.appUI; if (ui && this.hub.classList.contains('hide') && this.res.classList.contains('hide')) { ui.hideAll(); ui.app.setOverlay(true); }
    this.board = board || 'pro5';
    this.rankEl.classList.remove('hide'); this.rankEl.scrollTop = 0;
    this.renderRank(null);
    if (this.board !== 'hof') this.loadRank(this.board);
  }
  closeRank() {
    this.rankEl.classList.add('hide');
    if (this.res.classList.contains('hide') && this.hub.classList.contains('hide')) this.openHub();
    else if (!this.hub.classList.contains('hide')) this.renderHub();
  }
  async loadRank(board) {
    const R = this.K.Rank, seq = (this._rseq = (this._rseq || 0) + 1);
    try { await R.flush(); } catch (e) { /* 送れなくても表は出す */ }
    let res; try { res = await R.top(board); } catch (e) { res = { rows: [], from: 'mine', why: 'error' }; }
    if (seq !== this._rseq || this.board !== board || this.rankEl.classList.contains('hide')) return;
    this.renderRank(res);
  }
  renderRank(res) {
    const K = this.K, b = this.board, POSL = POS7;
    const tab = b === 'hof' ? 'hof' : b === 'pro5' ? 'pro5' : b.startsWith('season_') ? 'season' : 'pos';
    const tabs = [['pro5', 'プロ 5 試合'], ['season', '1 シーズン'], ['pos', '守備位置'], ['hof', '殿堂']]
      .map(([k, t]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('');
    let sub = '', cap = '';
    if (tab === 'season') {
      sub = `<div class="cChips">${[['season_hs', '高校'], ['season_corp', '社会人'], ['season_pro', 'プロ']].map(([k, t]) => `<button class="${k === b ? 'on' : ''}" data-board="${k}">${t}</button>`).join('')}</div>`;
      cap = `${{ season_hs: '高校', season_corp: '社会人', season_pro: 'プロ' }[b]}の 1 シーズンで一番の UZR`;
    } else if (tab === 'pos') {
      sub = `<div class="cChips pos">${POSL.map((p) => `<button class="${'pos_' + p === b ? 'on' : ''}" data-board="pos_${p}" aria-label="${esc(K.POS_NAME[p])}">${POS_SHORT[p]}</button>`).join('')}</div>`;
      cap = `${esc(K.POS_NAME[b.slice(4)] || '')}で プロ 5 試合を終えた時の UZR`;
    } else if (tab === 'pro5') cap = 'プロ 5 試合を終えた時の 通算 UZR';
    let body;
    if (tab === 'hof') {
      const H = this.C.hof().slice().reverse();
      body = H.length ? `<div class="cHof">${H.map((c) => this.miniCard(c) + `<div class="cHofDay">${esc(new Date(c.t).toLocaleDateString('ja-JP'))}${c.migrated ? ' ・ 前の数え方' : ''}</div>`).join('')}</div>`
        : '<div class="cEmpty">まだいません。プロで 5 試合を終えた選手が、ここに残ります。</div>';
      cap = 'この端末でキャリアを終えた選手';
    } else if (!res) body = '<div class="cEmpty">読み込み中…</div>';
    else {
      const why = { closed: 'ランキングの準備中のため、自分の記録だけ出しています', busy: '混み合っているので、前に読んだ表を出しています', offline: 'ネットにつながらないので、自分の記録だけ出しています', limit: '読みすぎないよう、前に読んだ表を出しています' };
      const note = res.from === 'net' || res.from === 'cache' ? 'みんなの記録(30 分ごとに新しくなります)' : (res.from === 'stale' ? (why[res.why] || '前に読んだ表を出しています') : (why[res.why] || why.offline));
      const rows = res.rows || [];
      body = `<div class="cRankNote">${esc(note)}</div>` + (rows.length ? `<table class="cRankT"><tr><th>順位</th><th>選手</th><th>位置</th><th>UZR</th><th>日付</th></tr>${rows.map((r, i) => `<tr class="${r.own ? 'own' : ''}"><td class="n">${r.local && res.from !== 'net' && res.from !== 'cache' ? '-' : i + 1}</td><td class="pl"><i>${esc(r.num)}</i>${esc(r.name)}${r.own ? '<em>あなた</em>' : ''}</td><td>${esc(POS_SHORT[r.pos] || '')}</td><td class="${r.val >= 0 ? 'pos' : 'neg'}">${K.uzrText(r.val)}</td><td class="d">${esc(String(r.day || '').slice(5).replace('-', '/'))}</td></tr>`).join('')}</table>`
        : '<div class="cEmpty">まだ記録がありません。最初の 1 人になろう。</div>');
    }
    this.rankEl.innerHTML = this.bg() + `<div class="carSheet rk">
      <div class="cTop"><button class="cBack" data-act="close">戻る</button><h1 class="cLogo">ランキング</h1></div>
      <div class="cTabs">${tabs}</div>${sub}
      <div class="cPanel cLight cRankP"><div class="cRankCap">${cap}${tab === 'hof' ? '' : `<small>UZR(位置の補正あり)${Q}</small>`}</div>${body}</div>
      ${tab === 'hof' ? '' : `<div class="cNote">${esc(ADJ_NOTE)}。名前・背番号・守備位置・値・日付だけを送ります。</div>`}
    </div>`;
  }
  onRankClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    e.stopPropagation();
    if (b.dataset.act === 'uzrq') { this.uzrHelp(); return; }
    if (b.dataset.act === 'close') { this.closeRank(); return; }
    const t = b.dataset.tab, bd = b.dataset.board;
    const next = bd || (t === 'pro5' ? 'pro5' : t === 'season' ? 'season_pro' : t === 'pos' ? 'pos_' + (this.C.data.pos || 'SS') : t === 'hof' ? 'hof' : null);
    if (!next || next === this.board) return;
    this.board = next; this.renderRank(null);
    if (next !== 'hof') this.loadRank(next);
  }

  // キャリアの説明(初めてカードを作った時・キャリアの画面の「キャリアの説明」から)
  tutPages() {
    const K = this.K, S = K.STAGES, [hs, co] = S, fieldPic = this.posPicker(this.C.data.pos || 'SS').replace(/<button /g, '<span ').replace(/<\/button>/g, '</span>').replace(/data-pick=/g, 'data-p=');
    const abPic = `<div class="cAbs tutAb">${this.abRows({ arm: 72, field: 84, sure: 93 }, null, null)}</div>`;
    const D = this.C.data;
    const card = `<div class="tutCard"><div class="pcArt"><span class="pcNum">${esc(D.num ?? 6)}</span></div><div><b>${esc(D.name || 'あなた')}</b><small>${esc(K.POS_NAME[D.pos] || '')}</small></div></div>`;
    return [
      { h: '最高の守備職人を目指そう', pic: card + this.ladder(0),
        t: ['高校 → 社会人 → プロ と上がっていきます。', 'プロで 5 試合を終えると キャリア完了。', 'その時の UZR(守備の上手さの数)で ランキングを競います。'] },
      { h: '守る位置は 自由', pic: `<div class="tutField">${fieldPic}</div>`,
        t: ['投手から右翼まで、9 つの位置から 好きに選べます。', '途中で替えても大丈夫。能力と成績は そのまま続きます。', 'どこを守っても、その位置の「平均の選手」と比べます。'] },
      { h: '上がる条件', pic: `<div class="tutPromo"><div><b>${esc(hs.name)}</b><span>${hs.min} 試合以上</span><span>評価 ${hs.need.rank} 以上 か UZR ${K.uzrText(hs.need.uzr)} 以上</span></div><i></i><div><b>${esc(co.name)}</b><span>${co.min} 試合以上</span><span>評価 ${co.need.rank} 以上 か UZR ${K.uzrText(co.need.uzr)} 以上</span></div><i></i><div class="pro"><b>プロ</b><span>${K.FINAL_GAMES} 試合で 完了</span></div></div>`,
        t: [`${hs.name}は ${hs.min} 試合以上、${co.name}は ${co.min} 試合以上 守ります。`, '最近の 3 試合のうち 2 試合で 上の基準を超えたら、次へ上がります。', '評価は 試合ごとの守備の点(S が一番上、A・B・C・D と下がる)です。'] },
      { h: '能力と S〜G', pic: abPic,
        t: ['肩は 送球の速さ、守備は 走る速さと 届く幅、エラー回避は ミスの少なさ。', '強さは S(一番上)から G までの文字で出ます。', '試合で守るほど 経験がたまって 伸びていきます。'] },
      { h: '成績の言葉', pic: `<div class="tutWords"><div><b>刺殺</b><span>自分で捕ったり タッチしたりして アウトにした数</span></div><div><b>補殺</b><span>送球して アウトを 手伝った数</span></div><div><b>失策</b><span>エラー(捕り損ね・悪い送球)</span></div><div><b>守備率</b><span>エラーをしなかった割合</span></div></div>`,
        t: ['結果の画面に出る言葉です。', '覚えなくても大丈夫。いちばん大事なのは 次のページの UZR です。'] },
      { h: 'UZR とは', pic: `<div class="tutUzr"><div><span>平均の選手</span><i style="--w:50%"></i><b>0</b></div><div class="me"><span>あなた</span><i style="--w:72%"></i><b>+0.6</b></div></div>`,
        t: ['同じ打球を 平均の選手が守った時と比べて、何点ぶん 失点を防いだかの数です。', 'プラスなら 平均より上手、マイナスなら 平均より下。', '1 試合では 小さな数です(難しい打球を捕って +0.3〜0.8 ほど)。'] },
      { h: 'プロ 5 試合と ランキング', pic: `<div class="tutPro">${[1, 2, 3, 4, 5].map((n) => `<span class="${n === 4 ? 'v' : n === 5 ? 'f' : ''}">${n}<small>${n === 4 ? '優勝が<br>かかる' : n === 5 ? '最終戦' : '試合'}</small></span>`).join('')}</div>`,
        t: ['プロは 5 試合。4 試合目は 優勝のかかった試合、5 試合目が 最終戦です。', '終えると 選手カードが 殿堂に残り、新しい選手で 始め直せます。', 'ランキングは UZR(位置の補正あり)。位置ごとの差を均すので、どこを守っても 上を狙えます。'] },
    ];
  }
  openTut(first) {
    if (!this.tutEl) {
      const el = document.createElement('div'); el.id = 'carTut'; el.className = 'hide';
      document.body.appendChild(el); this.tutEl = el;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const b = e.target.closest('button'); if (!b) return;
        const a = b.dataset.t, n = this.tutPages().length;
        if (a === 'skip' || a === 'end') this.closeTut();
        else if (a === 'next') { this.tutI = Math.min(n - 1, this.tutI + 1); this.renderTut(); }
        else if (a === 'prev') { this.tutI = Math.max(0, this.tutI - 1); this.renderTut(); }
        else if (b.dataset.i != null) { this.tutI = +b.dataset.i; this.renderTut(); }
      });
      for (const t of ['touchstart', 'mousedown']) el.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
      addEventListener('keydown', (e) => {
        if (!this.tutEl || this.tutEl.classList.contains('hide')) return;
        if (e.code === 'Escape') { e.stopPropagation(); this.closeTut(); }
        else if (e.code === 'ArrowRight') { e.stopPropagation(); this.tutI = Math.min(this.tutPages().length - 1, this.tutI + 1); this.renderTut(); }
        else if (e.code === 'ArrowLeft') { e.stopPropagation(); this.tutI = Math.max(0, this.tutI - 1); this.renderTut(); }
      }, true);
    }
    this.tutI = 0; this.tutFirst = !!first;
    this.renderTut();
    this.tutEl.classList.remove('hide');
  }
  closeTut() {
    if (!this.tutEl) return;
    this.tutEl.classList.add('hide');
    try { localStorage.setItem(TUT_KEY, '1'); } catch (e) { /* */ }
  }
  renderTut() {
    const P = this.tutPages(), i = this.tutI, p = P[i], last = i === P.length - 1;
    this.tutEl.innerHTML = `<div class="tutBox" role="dialog" aria-label="キャリアの説明">
      <div class="tutTop"><span class="tutNo">${i + 1} / ${P.length}</span><b>キャリアの説明</b><button type="button" class="tutSkip" data-t="skip">${this.tutFirst ? '飛ばす' : '閉じる'}</button></div>
      <h2>${esc(p.h)}</h2><div class="tutPic">${p.pic}</div>
      <ul>${p.t.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <div class="tutDots">${P.map((_, k) => `<button type="button" class="${k === i ? 'on' : ''}" data-i="${k}" aria-label="${k + 1} 枚目"></button>`).join('')}</div>
      <div class="tutNav"><button type="button" class="cBtn" data-t="prev"${i ? '' : ' disabled'}>前へ</button>${last ? '<button type="button" class="cBtn go" data-t="end">はじめる</button>' : '<button type="button" class="cBtn go" data-t="next">次へ</button>'}</div>
    </div>`;
  }

  // ------------------------------------------------ 試合の中の小さな札(UZR +0.4・肩 +1・お手玉)
  // 左上の点数板と走者の図の下(打つ前の札 #sit が左の列に来ている時はその下)。押せない・1.6 秒で消える・3 つまで
  pop(text, kind) {
    if (!this.pops || !popsOn()) return;   // 11/25 夜 持ち主「出す出さないは設定で」: 初めは出さない(成績と UZR は記録して結果の画面に出す)
    const d = document.createElement('div'); d.className = 'cPop ' + (kind || ''); d.textContent = text;
    this.pops.appendChild(d);
    while (this.pops.children.length > 3) this.pops.firstChild.remove();
    setTimeout(() => d.classList.add('out'), 1500); setTimeout(() => d.remove(), 1900);
  }
  placePops() {
    const el = this.pops; if (!el || !el.children.length) return;
    const vis = (x) => x && !x.classList.contains('hide') && x.offsetWidth > 0;
    const board = $('board'), map = $('runMap'), sit = $('sit');
    let left = 12, top = 12;
    if (vis(board)) { const r = board.getBoundingClientRect(); left = r.left; top = r.bottom + 8; }
    if (vis(map)) { const r = map.getBoundingClientRect(); top = Math.max(top, r.bottom + 8); }
    if (sit && sit.classList.contains('show')) { const r = sit.getBoundingClientRect(); if (r.left < left + 150 && r.bottom > top - 4 && r.top < top + 90) top = r.bottom + 8; }
    el.style.left = Math.round(left) + 'px'; el.style.top = Math.round(top) + 'px';
  }
  intro(head, sub, ms) {
    const el = this.introEl; if (!el) return;
    el.innerHTML = `<b>${esc(head)}</b><span>${esc(sub)}</span>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this._it); this._it = setTimeout(() => el.classList.remove('show'), ms || 2200);
    el.classList.toggle('big', (ms || 0) > 2200);
  }
}
