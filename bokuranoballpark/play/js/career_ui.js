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
  isOpen() { return !!this.hub && (!this.hub.classList.contains('hide') || !this.res.classList.contains('hide') || !!(this.card && !this.card.classList.contains('hide'))); }
  hide() { if (!this.hub) return; this.hub.classList.add('hide'); this.res.classList.add('hide'); if (this.card) this.card.classList.add('hide'); }
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
      : D.final ? '' : `<div class="cGoal"><b>キャリアの最終評価まで</b><span>プロで あと ${Math.max(0, left)} 試合</span></div>`;
    const fin = T.games ? `<div class="cPanel cLight cFinal${D.final ? ' fixed' : ''}"><div class="cRibbon">${D.final ? 'キャリアの最終評価' : 'いまの守備の評価(通算)'}</div>`
      + `<div class="cFinRow"><div class="cStamp sm r${fe.grade}"><span>${fe.grade}</span></div><div><div class="cFinTitle">${esc(fe.title)}</div><div class="cFinSub">${fe.score}/100 ・ 1 試合あたり UZR ${K.uzrText(fe.uzrPG)} ・ 守備率 ${K.fpctText(T.po, T.a, T.e)}</div></div></div></div>` : '';
    const ready = !!(window.__app && window.__app.ready);
    this.hub.innerHTML = this.bg() + `<div class="carSheet">
      <div class="cTop"><button class="cBack" data-act="back">戻る</button><h1 class="cLogo">守備のキャリア</h1></div>
      <div class="cPanel cDark">${this.ladder(D.stage)}${this.posRow(D.pos)}${goal}</div>
      <button class="cCardBtn" data-act="card"><span class="cCardNo">${esc(D.num)}</span><span class="cCardTx"><b>${esc(D.name || '名前を決める')}</b><small>自分の選手カード</small></span></button>
      <div class="cPanel cLight"><div class="cRibbon">能力</div>${this.abRows(D.ab, null, D.xp)}
        <div class="cNote">肩: 送球の速さ・届く距離 / 守備: 走る速さ・グラブの届く幅 / エラー回避: お手玉・送球のそれ</div></div>
      <div class="cPanel cLight"><div class="cRibbon">通算成績</div>${this.table([
        ['試合', `${T.games}<small> (高校 ${D.stageGames[0]} ・ 社会人 ${D.stageGames[1]} ・ プロ ${D.stageGames[2]})</small>`],
        ['刺殺', T.po], ['補殺', T.a], ['失策', T.e], ['守備機会', T.po + T.a + T.e], ['守備率', K.fpctText(T.po, T.a, T.e)],
        ['UZR', K.uzrText(T.uzr), T.uzr >= 0 ? 'pos' : 'neg']])}${this.recent()}</div>
      ${fin}
      <div class="cPanel cDark cPick"><div class="cPickHead">守る所</div><div class="cPosBtns">${POS7.map((p) => `<button data-pos="${p}" class="${p === D.pos ? 'on' : ''}" aria-label="${esc(K.POS_NAME[p])}">${POS_SHORT[p]}</button>`).join('')}</div>
        <div class="cNote">どこを守っても、その位置の普通の野手と比べて UZR を出します。替えても能力・通算成績・段はそのまま(位置ごとの成績は選手カードに)。</div></div>
      <button class="cGo" data-act="go"${ready ? '' : ' disabled'}>${ready ? `${esc(st.name)}の試合へ` : '読み込み中…'}</button>
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
    } else band = `<div class="cBand stay pro"><b>プロ ${r.game} 試合目</b><small>${r.final ? '' : `最終評価まで あと ${Math.max(0, K.FINAL_GAMES - D.stageGames[2])} 試合`}</small></div>`;
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
      <button class="cGo" data-act="go"${ready && D.name ? '' : ' disabled'}>${D.name ? (ready ? '次の試合へ' : '読み込み中…') : '名前を決めてください'}</button>
      ${edit ? '' : '<div class="cRow2"><button class="cBtn" data-act="edit">名前を変える</button><button class="cBtn" data-act="pos">守備位置を変える</button></div>'}
    </div>`;
  }
  saveName() {
    const i = this.card.querySelector('#cNameIn'), n = this.card.querySelector('#cNumIn');
    const v = i ? i.value : '';
    if (!String(v).trim()) { if (i) { i.classList.add('bad'); i.focus(); } return; }
    this.C.setName(v); if (n) this.C.setNum(n.value);
    if (this._pick) this.C.setPos(this._pick);
    this.renderCard(false);
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
  intro(head, sub) {
    const el = this.introEl; if (!el) return;
    el.innerHTML = `<b>${esc(head)}</b><span>${esc(sub)}</span>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this._it); this._it = setTimeout(() => el.classList.remove('show'), 2200);
  }
}
