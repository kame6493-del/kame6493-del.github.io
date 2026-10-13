/* 定時で帰さない — 本体 */
(function () {
  'use strict';
  const C = window.CFG, T = window.STR, E = window.ECON;
  const $ = (id) => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const SPEED = Math.max(0.1, Math.min(200, parseFloat(qs.get('speed')) || 1));
  const TAPX = Math.max(1, Math.min(100, parseFloat(qs.get('tapx')) || 1)); // 撮影用(早送り時の1タップを何回ぶんに数えるか)。ふだんは 1
  const NOW = () => Date.now();
  const EMP = C.EMPLOYEES;
  const NE = EMP.length;

  // ---------- 数字の書式 ----------
  const UNITS = [[1e16, '京'], [1e12, '兆'], [1e8, '億'], [1e4, '万']];
  function yen(n) { // 値段・短い表示: ¥15,000 / ¥12.5万 / ¥3.2億
    n = Math.floor(n);
    if (n < 1e4) return '¥' + n.toLocaleString('ja-JP');
    for (const [v, u] of UNITS) if (n >= v) {
      const x = n / v;
      const s = x >= 1000 ? Math.floor(x).toLocaleString('ja-JP') : x >= 100 ? x.toFixed(0) : x >= 10 ? (Math.floor(x * 10) / 10).toFixed(1) : (Math.floor(x * 100) / 100).toFixed(2);
      return '¥' + s.replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1') + u;
    }
    return '¥' + n;
  }
  function yenShare(n) { // シェア: ¥3.2億
    n = Math.floor(n);
    if (n < 1e4) return '¥' + n.toLocaleString('ja-JP');
    for (const [v, u] of UNITS) if (n >= v) {
      const x = n / v;
      return '¥' + (x >= 100 ? Math.floor(x).toLocaleString('ja-JP') : (Math.floor(x * 10) / 10).toFixed(1).replace(/\.0$/, '')) + u;
    }
    return '¥' + n;
  }
  function yenBigHTML(n) { // 大きな売上: ¥1億2845万 / ¥128万4500 / ¥8,400
    n = Math.floor(n);
    if (n < 1e4) return '¥' + n.toLocaleString('ja-JP');
    for (let i = 0; i < UNITS.length; i++) {
      const [v, u] = UNITS[i];
      if (n >= v) {
        const hi = Math.floor(n / v);
        let s = '¥' + (i === 0 ? hi.toLocaleString('ja-JP') : String(hi)) + '<span class="u">' + u + '</span>';
        const next = UNITS[i + 1];
        if (next) {
          const lo = Math.floor((n % v) / next[0]);
          if (lo > 0) s += lo + '<span class="u">' + next[1] + '</span>';
        } else {
          const lo = n % v;
          if (lo > 0) s += lo;
        }
        return s;
      }
    }
    return '¥' + n;
  }
  function clockStr(min) {
    const t = Math.floor(min);
    const h = (18 + Math.floor(t / 60)) % 24, m = t % 60;
    return h + ':' + String(m).padStart(2, '0');
  }
  const pad2 = (n) => String(n).padStart(2, '0');
  const faceSrc = (i, stage) => EMP[i].sheet + 's' + pad2(stage) + '.webp';
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---------- 保存 ----------
  function freshP() {
    return { v: 1, day: 1, morale: 0, ach: {}, titlesGot: {}, seen: {}, best: 0, bestTitle: '', lifetime: 0,
      settings: { sound: true, vibe: true }, nextStartFatigue: 0, nextFatigueMul: 1, days: 0 };
  }
  function freshS() {
    const sf = P.nextStartFatigue || 0;
    return { phase: 'play', money: 0, rev: 0, taps: 0, buys: 0, levels: {}, fatigue: EMP.map((e, i) => Math.min(95, sf * (0.8 + 0.1 * i))),
      gone: EMP.map(() => 0), minutes: 0, buffs: [], nextEvent: C.events.firstSec, lastEvents: [], moments: {}, ms: 0,
      maxDigits: 0, fatigueMul: P.nextFatigueMul || 1, savedAt: NOW(), result: null, playSec: 0, eventsDone: 0 };
  }
  let P = freshP(), S = null;
  function load() {
    try {
      const raw = localStorage.getItem(C.saveKey);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.P) { P = Object.assign(freshP(), d.P); P.settings = Object.assign({ sound: true, vibe: true }, d.P.settings || {}); }
        if (d && d.S && d.S.levels) S = d.S;
      }
    } catch (e) { /* 保存が使えない環境でも遊べる */ }
  }
  function save() {
    // 放置収益の基準時刻は、ゲーム画面で時間が進んでいる間だけ更新する
    const g = document.getElementById('scr-game');
    if (S && S.phase === 'play' && g && g.classList.contains('active') && !document.hidden) S.savedAt = NOW();
    try { localStorage.setItem(C.saveKey, JSON.stringify({ P, S })); } catch (e) { }
  }
  function wipe() {
    try { localStorage.removeItem(C.saveKey); } catch (e) { }
    P = freshP(); S = null;
  }
  const achCount = () => Object.keys(P.ach).length;
  const pp = () => ({ morale: P.morale, achCount: achCount() });

  // ---------- 音(Kenney CC0。鳴らなくても遊べる) ----------
  const AU = { ctx: null, buf: {}, lastTap: 0 };
  function audioInit() {
    if (AU.ctx || !P.settings.sound) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { AU.ctx = new AC(); } catch (e) { return; }
    const list = [];
    for (const [k, v] of Object.entries(C.SOUNDS)) (Array.isArray(v) ? v : [v]).forEach((u, i) => list.push([Array.isArray(v) ? k + i : k, u]));
    for (const [k, u] of list) {
      fetch(u).then((r) => r.arrayBuffer()).then((ab) => new Promise((res, rej) => AU.ctx.decodeAudioData(ab, res, rej))).then((b) => { AU.buf[k] = b; }).catch(() => { });
    }
  }
  function sfx(name, vol = 0.5, rate = 1) {
    if (!P.settings.sound || !AU.ctx) return;
    if (name === 'tap') { const t = performance.now(); if (t - AU.lastTap < 45) return; AU.lastTap = t; name = 'tap' + Math.floor(Math.random() * 3); }
    const b = AU.buf[name]; if (!b) return;
    try {
      if (AU.ctx.state === 'suspended') AU.ctx.resume();
      const s = AU.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
      const g = AU.ctx.createGain(); g.gain.value = vol; s.connect(g); g.connect(AU.ctx.destination); s.start();
    } catch (e) { }
  }
  function vibe(ms) { if (P.settings.vibe && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { } }

  // ---------- 画面の大きさ ----------
  let SCALE = 1;
  function fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    let s, h;
    if (vw / 450 < vh / 800) { s = vw / 450; h = vh / s; } else { s = vh / 800; h = 800; }
    h = Math.min(h, 1000);
    SCALE = s;
    const st = $('stage');
    st.style.height = h + 'px';
    st.style.transform = 'translateX(-50%) scale(' + s + ')';
    st.style.top = Math.max(0, (vh - h * s) / 2) + 'px';
  }

  // ---------- 文字を流し込む ----------
  function fillStrings(root = document) {
    root.querySelectorAll('[data-s]').forEach((el) => { const v = T[el.dataset.s]; if (typeof v === 'string') el.textContent = v; });
  }

  // ---------- 画面切り替え ----------
  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  }

  // ---------- トースト・演出 ----------
  function toast(msg, cls = '', life = 2.2) {
    const box = $('toasts');
    while (box.children.length > 1) box.firstChild.remove();
    const d = document.createElement('div');
    d.className = 'toast ' + cls; d.textContent = msg; d.style.setProperty('--life', life + 's');
    box.appendChild(d);
    setTimeout(() => d.remove(), (life + 0.5) * 1000);
  }
  function bigMoment(main, sub, cls) {
    const el = $('bigMoment');
    el.className = 'big-moment';
    el.innerHTML = '<b></b><small></small>';
    el.firstChild.textContent = main; el.lastChild.textContent = sub;
    void el.offsetWidth;
    el.className = 'big-moment show ' + (cls || '');
  }

  // ---------- 社員の机 ----------
  const desks = [];
  const shownStage = [];
  function buildDesks() {
    const g = $('deskGrid'); g.innerHTML = '';
    desks.length = 0;
    EMP.forEach((e, i) => {
      const d = document.createElement('div');
      d.className = 'desk' + (e.flip ? ' flip' : '');
      d.dataset.i = i;
      d.innerHTML = '<img class="face" alt=""><span class="stage-no"></span><span class="zzz"></span><div class="bubble"></div>' +
        '<div class="gone-label"><b></b><small></small></div>' +
        '<div class="tag"><div class="tag-top"><span class="nm"></span><span class="st"></span></div><div class="bar"><i></i></div></div>';
      const img = d.querySelector('img.face');
      img.style.filter = e.filter || 'none';
      d.querySelector('.nm').textContent = T.EMP_NAMES[i] || '';
      d.querySelector('.zzz').textContent = T.sleepingZ;
      d.querySelector('.gone-label b').textContent = T.goneHome;
      d.querySelector('.gone-label small').textContent = T.goneHomeSub;
      g.appendChild(d);
      desks.push({ el: d, img, st: d.querySelector('.st'), bar: d.querySelector('.bar i'), no: d.querySelector('.stage-no'), bubble: d.querySelector('.bubble') });
      shownStage[i] = 0;
    });
  }
  function fatigueColor(f) {
    if (f >= 100) return '#a77bff';
    if (f >= 75) return '#ff5a5a';
    if (f >= 50) return '#ff9d3a';
    if (f >= 25) return '#ffd84a';
    return '#5fe08a';
  }
  function renderDesks(force) {
    for (let i = 0; i < NE; i++) {
      const dk = desks[i]; if (!dk) continue;
      const f = S.fatigue[i], gone = !!S.gone[i];
      const stage = gone ? 1 : E.stageOf(f);
      if (stage !== shownStage[i] || force) {
        const prev = shownStage[i];
        shownStage[i] = stage;
        dk.img.src = faceSrc(i, stage);
        dk.img.style.objectPosition = '50% ' + (C.STAGE_FOCUS_Y[stage - 1] || 40) + '%';
        dk.st.textContent = T.STAGE_SHORT[stage - 1];
        dk.no.textContent = stage;
        dk.el.classList.toggle('sleep', stage === 10 && !gone);
        dk.el.classList.toggle('gone', gone);
        if (!force && prev && stage > prev && !gone) {
          dk.el.classList.remove('changed'); void dk.el.offsetWidth; dk.el.classList.add('changed');
          sfx('pop', 0.35);
        }
        if (!gone) markSeen(i, stage, !force);
      }
      const w = Math.round(Math.min(100, f));
      if (dk._w !== w) { dk._w = w; dk.bar.style.width = w + '%'; dk.bar.style.background = fatigueColor(f); }
    }
  }
  function markSeen(i, stage, announce) {
    const key = EMP[i].sheet;
    P.seen[key] = P.seen[key] || [];
    if (!P.seen[key][stage - 1]) {
      P.seen[key][stage - 1] = 1;
      if (announce && stage > 1) toast(T.zukanNew(T.STAGES[stage - 1]), 'blue', 1.8);
    }
  }
  function bubble(i, text, ms = 1400) {
    const b = desks[i] && desks[i].bubble; if (!b) return;
    b.textContent = text; b.classList.add('show');
    clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show'), ms);
  }

  // ---------- 強化 ----------
  const rows = [];
  function buildShop() {
    const list = $('shopList'); list.innerHTML = ''; rows.length = 0;
    C.UPGRADES.forEach((up, idx) => {
      const r = document.createElement('div');
      r.className = 'up'; r.dataset.id = up.id;
      r.innerHTML = '<div class="ic"><img alt="" src="img/icons/' + up.icon + '.webp"><span class="lv"></span></div>' +
        '<div class="info"><div class="nm"></div><div class="ds"></div><div class="ef"></div></div>' +
        '<button class="buy"><span class="fill"></span><span class="pr"></span><span class="rm"></span></button>';
      r.querySelector('.buy').addEventListener('click', (ev) => { ev.stopPropagation(); buy(up.id); });
      list.appendChild(r);
      rows.push({ up, idx, el: r, lv: r.querySelector('.lv'), nm: r.querySelector('.nm'), ds: r.querySelector('.ds'), ef: r.querySelector('.ef'),
        fill: r.querySelector('.fill'), pr: r.querySelector('.pr'), rm: r.querySelector('.rm'), state: '' });
    });
  }
  function effectText(up) {
    if (up.type === 'auto') {
      // 自動は今の倍率をかけた実額で見せる
      const s = E.sums(S.levels);
      const mul = (1 + s.idle) * (1 + s.all);
      return T.effect.auto(up.value, yen(up.value * mul).replace('¥', '+¥'));
    }
    return T.effect[up.type](up.value);
  }
  function unlocked(r) {
    const up = r.up, lv = S.levels[up.id] || 0;
    if (lv > 0 || r.idx < 3) return true;
    return S.rev >= up.cost * 0.25;
  }
  function renderShop() {
    let teaser = false;
    for (const r of rows) {
      const up = r.up, lv = S.levels[up.id] || 0;
      const vis = unlocked(r);
      if (!vis) {
        if (teaser) { r.el.style.display = 'none'; continue; }
        teaser = true;
        r.el.style.display = '';
        if (r.state !== 'locked') {
          r.state = 'locked'; r.el.className = 'up locked';
          r.nm.textContent = T.locked; r.ds.textContent = T.lockedNeed(yen(up.cost * 0.25)); r.ef.textContent = '';
          r.pr.textContent = yen(E.upCost(up, 0)); r.rm.textContent = ''; r.fill.style.width = '0'; r.lv.textContent = '';
        }
        continue;
      }
      r.el.style.display = '';
      const maxed = up.max && lv >= up.max;
      const cost = E.upCost(up, lv);
      const timeLock = up.needMin && S.minutes < up.needMin;
      const can = !maxed && !timeLock && S.money >= cost;
      const key = [lv, can, maxed, timeLock, Math.floor(Math.min(1, S.money / cost) * 50), Math.floor(Math.log10(Math.max(1, cost - S.money)) * 3)].join('|');
      if (key === r.state) continue;
      r.state = key;
      r.el.className = 'up' + (can ? ' can' : '') + (maxed ? ' maxed' : '');
      r.nm.textContent = T.UP[up.id][0];
      r.ds.textContent = T.UP[up.id][1];
      r.ef.textContent = effectText(up);
      r.lv.textContent = T.lv(lv);
      if (maxed) { r.pr.textContent = T.maxed; r.rm.textContent = ''; r.fill.style.width = '0'; continue; }
      if (timeLock) { r.pr.textContent = yen(cost); r.rm.textContent = T.lockedTime; r.fill.style.width = '0'; continue; }
      r.pr.textContent = yen(cost);
      r.rm.textContent = can ? '' : T.remain(yen(cost - S.money));
      r.fill.style.width = (can ? 0 : Math.min(100, (S.money / cost) * 100)) + '%';
    }
  }
  function buy(id) {
    if (!S || S.phase !== 'play' || modalOpen()) return;
    const up = C.UPGRADES.find((u) => u.id === id);
    const lv = S.levels[id] || 0;
    if (up.max && lv >= up.max) return;
    if (up.needMin && S.minutes < up.needMin) { sfx('error', 0.3); toast(T.lockedTime, 'blue', 1.4); return; }
    const cost = E.upCost(up, lv);
    if (S.money < cost) { sfx('error', 0.3); return; }
    S.money -= cost; S.levels[id] = lv + 1; S.buys++;
    sfx('buy', 0.55); vibe(12);
    const r = rows.find((x) => x.up.id === id);
    if (r) { r.el.classList.remove('bought'); void r.el.offsetWidth; r.el.classList.add('bought'); r.state = ''; }
    if (up.sendsHome) {
      // 一番疲れている社員が先に帰れる
      let best = -1;
      for (let i = 0; i < NE; i++) if (!S.gone[i] && (best < 0 || S.fatigue[i] > S.fatigue[best])) best = i;
      const alive = S.gone.filter((g) => !g).length;
      if (best >= 0 && alive > 1) {
        S.gone[best] = 1;
        bubble(best, T.goneHomeSub, 1800);
        toast(T.EMP_NAMES[best] + '：' + T.goneHome, 'green');
      }
    }
    for (const rr of rows) rr.state = '';
    renderShop(); renderRates(); checkAch();
  }

  // ---------- 出来事 ----------
  function modalOpen() { return !$('modal').hidden; }
  function openModal(html, onBind) {
    const m = $('modal'), c = $('modalCard');
    c.innerHTML = html; m.hidden = false;
    if (onBind) onBind(c);
  }
  function closeModal() { $('modal').hidden = true; $('modalCard').innerHTML = ''; }
  function incomePerSec() { return E.autoPerSec(S, pp()) + E.tapValue(S, pp()) * 4; }
  function mostTired() {
    let b = -1;
    for (let i = 0; i < NE; i++) if (!S.gone[i] && (b < 0 || S.fatigue[i] > S.fatigue[b])) b = i;
    return Math.max(0, b);
  }
  function addFatigueAll(v) { for (let i = 0; i < NE; i++) if (!S.gone[i]) S.fatigue[i] = Math.max(0, Math.min(100, S.fatigue[i] + v)); }
  function addFatigue(i, v) { if (!S.gone[i]) S.fatigue[i] = Math.max(0, Math.min(100, S.fatigue[i] + v)); }
  function addBuff(kind, mul, sec) { S.buffs.push({ kind, mul, left: sec, total: sec }); renderBuffs(); }
  function gain(v) { S.money += v; S.rev += v; floatAtCenter('+' + yen(v)); }
  function applyEvent(id, choice) {
    const who = mostTired();
    const A = choice === 'a';
    switch (id) {
      case 'quit': if (A) { addBuff('all', 1.5, 30); addFatigue(who, 15); } else { addFatigue(who, -40); addBuff('tap', 1.3, 30); bubble(who, 'ありがとうございます…！'); } break;
      case 'noot': if (A) { addBuff('all', 2, 30); addFatigueAll(10); } else { addFatigueAll(-25); addBuff('all', 0.7, 20); unlockAch('noOvertime'); } break;
      case 'checkup': if (A) { gain(incomePerSec() * 60); addFatigueAll(12); } else { addFatigueAll(-20); S.minutes = Math.min(C.clock.endMin - 1, S.minutes + 30); } break;
      case 'rush': if (A) { gain(incomePerSec() * 90); addFatigueAll(15); } else { addFatigueAll(-8); } break;
      case 'birthday': if (A) { S.money *= 0.95; addFatigueAll(-18); bubble(who, 'わぁ、ケーキだ！'); } else { addBuff('tap', 2, 20); addFatigueAll(6); } break;
      case 'cat': if (A) { addFatigueAll(-12); } else { addBuff('tap', 1.5, 20); } break;
      case 'boss': if (A) { addBuff('tap', 3, 15); addFatigueAll(10); } else { addFatigueAll(-10); } break;
      case 'pizza': if (A) { addFatigueAll(-15); addBuff('all', 0.5, 10); } else { addBuff('all', 1.5, 30); addFatigueAll(5); } break;
      case 'printer': if (A) { gain(incomePerSec() * 30); addFatigue(who, 12); } else { addFatigueAll(-5); addBuff('tap', 1.5, 20); } break;
    }
    S.eventsDone++;
    renderDesks(); renderRates();
  }
  function triggerEvent(forceId) {
    if (!S || S.phase !== 'play' || modalOpen()) return false;
    const pool = T.EVENTS.filter((e) => !S.lastEvents.includes(e.id));
    const ev = forceId ? T.EVENTS.find((e) => e.id === forceId) : pool[Math.floor(Math.random() * pool.length)];
    if (!ev) return false;
    S.lastEvents.push(ev.id); if (S.lastEvents.length > 4) S.lastEvents.shift();
    sfx('event', 0.5); vibe(20);
    const html = '<span class="ev-tag">できごと</span><h3></h3><p class="ev-body"></p>' +
      '<button class="choice a" data-c="a"><b></b><small></small></button><button class="choice b" data-c="b"><b></b><small></small></button>';
    openModal(html, (c) => {
      c.querySelector('h3').textContent = ev.title;
      c.querySelector('.ev-body').textContent = ev.body;
      const [ba, bb] = c.querySelectorAll('.choice');
      ba.querySelector('b').textContent = ev.a[0]; ba.querySelector('small').textContent = ev.a[1];
      bb.querySelector('b').textContent = ev.b[0]; bb.querySelector('small').textContent = ev.b[1];
      c.querySelectorAll('.choice').forEach((b) => b.addEventListener('click', () => {
        closeModal(); applyEvent(ev.id, b.dataset.c); sfx('toast', 0.4);
        toast((b.dataset.c === 'a' ? ev.a[0] : ev.b[0]) + '！', b.dataset.c === 'a' ? '' : 'green', 1.6);
      }));
    });
    return true;
  }

  // ---------- バフ表示 ----------
  function renderBuffs() {
    const box = $('buffs');
    const html = S.buffs.map((b) => '<span class="buff' + (b.mul < 1 ? ' bad' : '') + '">' + T.buffNames[b.kind] + ' ×' + b.mul + ' ' + Math.ceil(b.left) + '秒</span>').join('');
    if (box._h !== html) { box.innerHTML = html; box._h = html; }
  }

  // ---------- 時計 ----------
  function skyFor(min) {
    if (min < 240) return 'linear-gradient(180deg, rgba(20,40,120,.10), rgba(10,20,70,.25))';
    if (min < 360) return 'linear-gradient(180deg, rgba(20,20,90,.25), rgba(10,10,50,.40))';
    if (min < 600) return 'linear-gradient(180deg, rgba(40,10,90,.30), rgba(5,5,40,.50))';
    if (min < 660) return 'linear-gradient(180deg, rgba(60,40,140,.25), rgba(255,120,80,.25))';
    if (min < 780) return 'linear-gradient(180deg, rgba(255,170,90,.22), rgba(255,120,60,.30))';
    return 'linear-gradient(180deg, rgba(255,230,180,.25), rgba(255,200,140,.25))';
  }
  let lastSky = '';
  function renderClock() {
    $('clockTime').textContent = clockStr(S.minutes);
    $('clockIco').textContent = S.minutes >= C.clock.sunriseMin ? '☀' : '☾';
    const p = Math.min(1, S.minutes / C.clock.endMin);
    $('tbFill').style.width = (p * 100) + '%';
    $('tbRunner').style.left = (p * 100) + '%';
    const sky = skyFor(S.minutes);
    if (sky !== lastSky) { $('sky').style.background = sky; lastSky = sky; }
  }
  function checkMoments() {
    for (const k of Object.keys(T.MOMENTS)) {
      const m = +k;
      if (S.minutes >= m && !S.moments[k]) {
        S.moments[k] = 1;
        if (m === C.clock.lastTrainMin) { bigMoment(T.lastTrainBig, T.lastTrainBigSub); sfx('unit', 0.5, 0.8); vibe(40); unlockAch('lastTrain'); for (const r of rows) r.state = ''; }
        else if (m === C.clock.sunriseMin) { bigMoment(T.sunriseBig, T.sunriseBigSub, 'sun'); sfx('unit', 0.5, 1.1); vibe(40); unlockAch('sunrise'); }
        else { toast(T.MOMENTS[k], 'blue', 2.4); }
      }
    }
  }

  // ---------- 売上の表示 ----------
  let dispMoney = 0, lastMoneyHTML = '';
  function renderMoney(dt) {
    const target = S.money;
    if (Math.abs(target - dispMoney) < 1) dispMoney = target;
    else dispMoney += (target - dispMoney) * Math.min(1, dt * 14);
    const html = yenBigHTML(dispMoney);
    if (html !== lastMoneyHTML) {
      const el = $('money'); el.innerHTML = html; lastMoneyHTML = html;
      const len = html.replace(/<[^>]+>/g, '').length;
      const fs = len <= 8 ? 46 : len <= 10 ? 40 : len <= 12 ? 34 : 29;
      if (el._fs !== fs) { el.style.fontSize = fs + 'px'; el._fs = fs; }
    }
    const digits = Math.floor(Math.log10(Math.max(1, S.money)));
    if (digits > S.maxDigits) {
      S.maxDigits = digits;
      const el = $('money');
      const unit = T.unitUp[digits];
      el.classList.remove('pop', 'bigpop'); void el.offsetWidth;
      if (unit) { el.classList.add('bigpop'); toast(T.unitUpToast(unit), '', 2.4); sfx('unit', 0.6); vibe(30); sparkBurst(225, 60, 18, true); }
      else { el.classList.add('pop'); }
    }
  }
  let lastRates = '';
  function renderRates() {
    const a = '+' + yen(E.tapValue(S, pp())), b = '+' + yen(E.autoPerSec(S, pp()));
    const key = a + b + E.moraleMul(pp()).toFixed(2);
    if (key === lastRates) return;
    lastRates = key;
    $('rateTap').textContent = a; $('rateSec').textContent = b;
    $('moraleLabel').textContent = T.morale(E.moraleMul(pp()).toFixed(E.moraleMul(pp()) < 10 ? 2 : 1).replace(/0$/, '').replace(/\.$/, ''));
  }
  function checkMilestones() {
    while (S.ms < C.MILESTONES.length && S.rev >= C.MILESTONES[S.ms]) {
      const v = C.MILESTONES[S.ms]; S.ms++;
      if (!T.unitUp[Math.round(Math.log10(v))]) { toast(T.milestone(yenShare(v)), '', 1.8); sfx('toast', 0.4); }
    }
  }

  // ---------- 浮かぶ数字・火花 ----------
  const fx = () => $('fxLayer');
  function floatText(x, y, text, crit) {
    const L = fx();
    while (L.childElementCount > 36) L.firstChild.remove();
    const d = document.createElement('div');
    d.className = 'float' + (crit ? ' crit' : '');
    d.textContent = text;
    d.style.setProperty('--x', (x - 40) + 'px'); d.style.setProperty('--y', (y - 20) + 'px'); d.style.setProperty('--dx', rand(-24, 24) + 'px');
    d.addEventListener('animationend', () => d.remove());
    L.appendChild(d);
  }
  function floatAtCenter(text) {
    const o = $('office');
    floatText(o.clientWidth / 2, o.clientHeight / 2, text, true);
  }
  function sparkBurst(x, y, n, global) {
    const L = global ? $('stage') : fx();
    for (let k = 0; k < n; k++) {
      const s = document.createElement('div');
      s.className = 'spark';
      if (global) { s.style.position = 'absolute'; s.style.zIndex = 30; }
      const a = Math.random() * Math.PI * 2, r = rand(20, global ? 140 : 46);
      s.style.setProperty('--x', x + 'px'); s.style.setProperty('--y', y + 'px');
      s.style.setProperty('--dx', Math.cos(a) * r + 'px'); s.style.setProperty('--dy', Math.sin(a) * r + 'px');
      s.addEventListener('animationend', () => s.remove());
      L.appendChild(s);
    }
  }

  // ---------- タップ ----------
  let shakeT = 0;
  function onTap(ev) {
    if (!S || S.phase !== 'play' || modalOpen()) return;
    audioInit();
    const o = $('office');
    const rect = o.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / SCALE, y = (ev.clientY - rect.top) / SCALE;
    let i = -1;
    const deskEl = ev.target.closest && ev.target.closest('.desk');
    if (deskEl) i = +deskEl.dataset.i;
    if (i < 0 || S.gone[i]) {
      const alive = []; for (let k = 0; k < NE; k++) if (!S.gone[k]) alive.push(k);
      i = alive[Math.floor(Math.random() * alive.length)];
    }
    let v = E.tapValue(S, pp());
    const crit = Math.random() < 0.04;
    if (crit) v *= 5;
    v *= TAPX;
    S.money += v; S.rev += v; S.taps++;
    if (S.fatigue[i] < 100) addFatigue(i, C.fatigue.perTap * EMP[i].toughness * (crit ? 3 : 1) * TAPX);
    floatText(x, y, '+' + yen(v), crit);
    if (crit) { floatText(x, y - 34, '大口受注！', true); vibe(25); }
    sparkBurst(x, y, crit ? 10 : 4);
    const dk = desks[i];
    if (dk) { dk.el.classList.remove('typing'); void dk.el.offsetWidth; dk.el.classList.add('typing'); }
    const g = $('scr-game');
    if (performance.now() - shakeT > 110) { shakeT = performance.now(); g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake'); }
    sfx('tap', 0.35, rand(0.92, 1.12));
    if (P.settings.vibe && navigator.vibrate && S.taps % 3 === 0) try { navigator.vibrate(4); } catch (e) { }
    if (S.taps === 1) $('tapHint').classList.add('hide');
    if (S.taps === 1 || S.taps === 100 || S.taps === 1000) checkAch();
  }

  // ---------- 実績 ----------
  function unlockAch(id) {
    if (P.ach[id] || !T.ACH[id]) return;
    P.ach[id] = NOW();
    toast(T.achUnlocked(T.ACH[id][0]), 'green', 2.4);
    sfx('toast', 0.45);
    lastRates = '';
  }
  function checkAch() {
    if (!S) return;
    if (S.taps >= 1) unlockAch('tap1');
    if (S.taps >= 100) unlockAch('tap100');
    if (S.taps >= 1000) unlockAch('tap1000');
    if (S.buys >= 1) unlockAch('buy1');
    if (S.buys >= 30) unlockAch('buy30');
    if (S.rev >= 1e6) unlockAch('rev1m');
    if (S.rev >= 1e8) unlockAch('rev100m');
    if (S.rev >= 1e12) unlockAch('rev1t');
    if ((S.levels.ai || 0) >= 3) unlockAch('ai');
    if (P.day >= 5) unlockAch('day5');
    const any = Object.values(P.seen).some((a) => a && a.filter(Boolean).length >= 10);
    if (any) unlockAch('zukan');
    if (Object.keys(P.titlesGot).length >= 6) unlockAch('allTitles');
  }

  // ---------- 本体のループ ----------
  let lastT = performance.now(), saveAcc = 0, shopAcc = 0, achAcc = 0;
  function step(dt) {
    S.playSec += dt;
    S.minutes += C.clock.minPerSec * dt;
    const a = E.autoPerSec(S, pp()) * dt;
    S.money += a; S.rev += a;
    const fr = E.fatigueRate(S, pp());
    for (let i = 0; i < NE; i++) if (!S.gone[i] && S.fatigue[i] < 100) S.fatigue[i] = Math.min(100, S.fatigue[i] + fr * EMP[i].toughness * dt);
    if (S.buffs.length) {
      for (const b of S.buffs) b.left -= dt;
      S.buffs = S.buffs.filter((b) => b.left > 0);
    }
    S.nextEvent -= dt;
    checkMoments();
    checkMilestones();
    if (S.nextEvent <= 0) {
      S.nextEvent = rand(C.events.minSec, C.events.maxSec);
      triggerEvent();
    }
    if (S.minutes >= C.clock.endMin) {
      S.minutes = C.clock.endMin;
      unlockAch('allNight');
      bigMoment(T.dayEndBig, '', 'sun');
      sendHome('end');
    }
  }
  function loop(t) {
    const real = Math.min(0.1, (t - lastT) / 1000);
    lastT = t;
    if (S && S.phase === 'play' && $('scr-game').classList.contains('active')) {
      const dt = real * SPEED;
      if (!modalOpen()) {
        // 速度を上げたときも細かく刻む
        let left = dt;
        while (left > 0 && S.phase === 'play') { const d = Math.min(left, 0.1); step(d); left -= d; }
      }
      if (S.phase === 'play') {
        renderMoney(real);
        renderClock();
        renderDesks();
        shopAcc += real; if (shopAcc > 0.12) { shopAcc = 0; renderShop(); renderRates(); renderBuffs(); }
        achAcc += real; if (achAcc > 0.5) { achAcc = 0; checkAch(); }
        saveAcc += real; if (saveAcc > 5) { saveAcc = 0; save(); }
      }
    }
    requestAnimationFrame(loop);
  }

  // ---------- 1日の始まり ----------
  function enterGame() {
    show('scr-game');
    $('dayLabel').textContent = T.dayN(P.day);
    buildDesks(); buildShop();
    dispMoney = S.money; lastMoneyHTML = ''; lastRates = ''; lastSky = '';
    $('tapHint').classList.toggle('hide', S.taps > 0);
    renderDesks(true); renderShop(); renderRates(); renderClock(); renderBuffs(); renderMoney(1);
    lastT = performance.now();
    offlineCheck();
  }
  function startNewDay() {
    S = freshS();
    P.nextStartFatigue = 0; P.nextFatigueMul = 1;
    save();
    enterGame();
  }
  function offlineCheck(hiddenSec) {
    if (!S || S.phase !== 'play') return;
    const sec = Math.min(C.offlineMaxSec, hiddenSec != null ? hiddenSec : (NOW() - (S.savedAt || NOW())) / 1000);
    if (sec < 60) return;
    const earn = Math.floor(E.autoPerSec(S, pp()) * sec * C.offlineRate);
    if (earn < 1) return;
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    openModal('<h3></h3><p class="off-body"></p><span class="big-num"></span><button class="btn-gold"></button>', (c) => {
      c.querySelector('h3').textContent = T.offlineTitle;
      const body = T.offlineBody(yen(earn), T.timeFmt(h, m));
      c.querySelector('.off-body').textContent = body;
      c.querySelector('.big-num').textContent = '+' + yen(earn);
      const b = c.querySelector('.btn-gold'); b.textContent = T.offlineOk;
      b.addEventListener('click', () => { closeModal(); S.money += earn; S.rev += earn; sfx('unit', 0.5); sparkBurst(225, 80, 16, true); save(); });
    });
    S.savedAt = NOW();
  }

  // ---------- 全員帰す ----------
  function decideTitle() {
    if (S.taps === 0) return 'nothing';
    for (let i = 0; i < NE; i++) if (!S.gone[i] && S.fatigue[i] >= 100) return 'legend';
    if (S.minutes < C.clock.whiteUntilMin) return 'white';
    if (S.minutes < C.clock.lastTrainMin) return 'normal';
    if (S.minutes < C.clock.sunriseMin) return 'gray';
    return 'black';
  }
  function sendHome(reason) {
    if (!S || S.phase !== 'play') return;
    if (modalOpen()) closeModal();
    audioInit();
    const hb = $('homeBtn'); hb.classList.add('pressed'); setTimeout(() => hb.classList.remove('pressed'), 260);
    const title = decideTitle();
    const stages = S.fatigue.map((f, i) => (S.gone[i] ? 1 : E.stageOf(f)));
    const moraleBefore = E.moraleMul(pp());
    const newBest = S.rev > P.best;
    const res = { title, rev: S.rev, minutes: S.minutes, stages, gone: S.gone.slice(), day: P.day, morale: moraleBefore, newBest, taps: S.taps, reason };
    // 翌日のボーナス
    const tb = C.TITLES[title];
    P.morale += tb.morale; P.nextStartFatigue = tb.startFatigue; P.nextFatigueMul = tb.fatigueMul;
    P.titlesGot[title] = (P.titlesGot[title] || 0) + 1;
    if (newBest) { P.best = S.rev; P.bestTitle = title; }
    P.lifetime += S.rev; P.days++;
    if (title === 'white') unlockAch('white');
    if (title === 'legend') unlockAch('legend');
    if (title === 'nothing') unlockAch('nothing');
    checkAch();
    S.phase = 'result'; S.result = res;
    save();
    // 演出: 笑顔に戻って帰っていく
    sfx('home', 0.6); vibe([20, 40, 20]);
    const order = [];
    for (let i = 0; i < NE; i++) if (!S.gone[i]) order.push(i);
    order.forEach((i, k) => {
      const dk = desks[i]; if (!dk) return;
      dk.img.src = faceSrc(i, 1);
      dk.img.style.objectPosition = '50% ' + C.STAGE_FOCUS_Y[0] + '%';
      dk.el.classList.remove('sleep'); dk.st.textContent = T.STAGE_SHORT[0]; dk.no.textContent = '1'; dk.bar.style.width = '0'; dk._w = 0;
      dk.el.classList.remove('changed'); void dk.el.offsetWidth; dk.el.classList.add('changed');
      setTimeout(() => bubble(i, k % 2 ? 'おつかれさまでした！' : 'かえれる〜！', 1500), 80 + k * 120);
      setTimeout(() => dk.el.classList.add('leave'), 750 + k * 140);
    });
    sparkBurst(225, 400, 24, true);
    setTimeout(() => showHome(res), 1650);
  }
  function showHome(res) {
    $('toasts').innerHTML = '';
    show('scr-home');
    const lines = T.THANKS[res.title] || T.THANKS.normal;
    $('homeThanks').textContent = lines.map((l) => '「' + l + '」').join('\n');
    // 帰宅シーンの絵を見せ直す
    document.querySelectorAll('#scr-home .home-head, #scr-home .home-sub2, #scr-home .home-scene').forEach((el) => { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; });
  }

  // ---------- 結果 ----------
  const emoji = (st) => (st >= 10 ? '💀' : st >= 7 ? '😩' : st >= 4 ? '😐' : '😀');
  let lastCardBlob = null, lastCardURL = '';
  function shareText(res) {
    return T.shareText(T.TITLE[res.title][0], yenShare(res.rev), clockStr(res.minutes), res.stages.map(emoji).join(''));
  }
  function showResult() {
    const res = S && S.result; if (!res) { toTitle(); return; }
    $('toasts').innerHTML = '';
    show('scr-result');
    $('resultInner').scrollTop = 0;
    $('resultHead').textContent = T.resultHead(res.day);
    const tn = T.TITLE[res.title];
    $('resultTitle').textContent = tn[0];
    $('resultTitle').classList.toggle('long', tn[0].length > 7);
    $('resultComment').textContent = tn[1];
    $('resSales').textContent = yenShare(res.rev);
    $('resLeave').textContent = clockStr(res.minutes);
    $('resBest').innerHTML = '';
    $('resBest').textContent = yenShare(P.best);
    if (res.newBest && res.rev > 0) { const n = document.createElement('span'); n.className = 'new'; n.textContent = T.newRecord; $('resBest').appendChild(n); }
    const f = $('resFaces'); f.innerHTML = '';
    res.stages.forEach((st, i) => {
      const d = document.createElement('div');
      d.className = 'rface' + (EMP[i].flip ? ' flip' : '');
      d.innerHTML = '<img alt=""><span></span>';
      const img = d.querySelector('img'); img.src = faceSrc(i, st); img.style.filter = EMP[i].filter || 'none';
      img.style.objectPosition = '50% ' + (st === 10 ? 80 : 30) + '%';
      d.querySelector('span').textContent = res.gone[i] ? T.goneHome : T.STAGE_SHORT[st - 1];
      f.appendChild(d);
    });
    $('resBonus').textContent = T.BONUS[res.title];
    window.TEIJI.lastShareText = shareText(res);
    $('cardPreview').removeAttribute('src');
    lastCardBlob = null;
    window.TeijiCard.draw(res, { yen: yenBigHTML, yenShare, clockStr, faceSrc, emp: EMP, P }).then((canvas) => {
      window.TEIJI.lastCanvas = canvas;
      canvas.toBlob((b) => {
        lastCardBlob = b;
        if (lastCardURL) URL.revokeObjectURL(lastCardURL);
        lastCardURL = URL.createObjectURL(b);
        $('cardPreview').src = lastCardURL;
      }, 'image/png');
    }).catch((e) => console.warn('card', e));
  }
  async function doShare() {
    const res = S && S.result; if (!res) return;
    const text = shareText(res);
    window.TEIJI.lastShareText = text;
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    if (navigator.share && coarse) {
      try {
        const data = { text };
        if (lastCardBlob && navigator.canShare) {
          const file = new File([lastCardBlob], 'teiji_result.png', { type: 'image/png' });
          if (navigator.canShare({ files: [file], text })) data.files = [file];
        }
        await navigator.share(data);
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    const url = 'https://x.com/intent/post?text=' + encodeURIComponent(text);
    window.TEIJI.lastIntentURL = url;
    const w = window.open(url, '_blank');
    if (w) { try { w.opener = null; } catch (e) { } } else location.href = url;
  }
  function saveImage() {
    const go = (b) => {
      const a = document.createElement('a');
      const u = URL.createObjectURL(b);
      a.href = u; a.download = 'teiji_result_day' + (S.result ? S.result.day : 1) + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
      toast(T.imgSaved, 'green', 1.6);
    };
    if (lastCardBlob) go(lastCardBlob);
    else if (window.TEIJI.lastCanvas) window.TEIJI.lastCanvas.toBlob(go, 'image/png');
  }
  function nextDay() {
    P.day++;
    startNewDay();
    sfx('title', 0.5);
    toast(T.dayN(P.day) + '・' + T.morale(E.moraleMul(pp()).toFixed(2).replace(/0$/, '').replace(/\.$/, '')), '', 2.4);
  }

  // ---------- タイトル ----------
  function toTitle() {
    show('scr-title');
    const total = Object.keys(T.TITLE).length;
    $('titleLead').textContent = T.titleLead;
    $('titleBest').textContent = P.best > 0 ? T.bestLine(yenShare(P.best), Object.keys(P.titlesGot).length, total) : '';
    $('btnCont').disabled = !S;
    save();
  }
  function startFromTitle() {
    audioInit();
    sfx('title', 0.5);
    if (S && S.phase === 'result') { showResult(); return; }
    if (S && S.phase === 'play') { enterGame(); return; }
    startNewDay();
  }

  // ---------- 実績・図鑑・設定の窓 ----------
  function openPanel(kind) {
    audioInit();
    if (kind === 'ach') {
      const items = Object.entries(T.ACH).map(([id, [n, d]]) => '<div class="ach' + (P.ach[id] ? ' got' : '') + '"><span class="mk">' + (P.ach[id] ? '★' : '・') + '</span><div><b>' + n + '</b><small>' + d + '</small></div></div>').join('');
      openModal('<h3>' + T.achTitle + ' ' + achCount() + '/' + Object.keys(T.ACH).length + '</h3><p style="font-size:12px;margin:0 0 8px;color:#a9b8e6">' + T.achNote + '</p><div class="list">' + items + '</div><button class="btn-gold" id="mClose">' + T.close + '</button>');
    } else if (kind === 'zukan') {
      const sheets = [...new Set(EMP.map((e) => e.sheet))];
      let html = '<h3>' + T.zukanTitle + '</h3><p style="font-size:12px;margin:0 0 6px;color:#a9b8e6">' + T.zukanNote + '</p>';
      sheets.forEach((sh) => {
        const seen = P.seen[sh] || [];
        const who = EMP.map((e, i) => (e.sheet === sh ? T.EMP_NAMES[i] : '')).filter(Boolean).join('・');
        html += '<div class="zk-sec">' + who + ' ' + seen.filter(Boolean).length + '/10</div><div class="zukan">' + T.STAGES.map((n, k) => '<div class="zk' + (seen[k] ? '' : ' no') + '"><img alt="" src="' + sh + 's' + pad2(k + 1) + '.webp"><span>' + (k + 1) + ' ' + (seen[k] ? T.STAGE_SHORT[k] : '？') + '</span></div>').join('') + '</div>';
      });
      html += '<div class="zk-sec">' + T.titlesTitle + ' ' + Object.keys(P.titlesGot).length + '/' + Object.keys(T.TITLE).length + '</div><div class="titles">' +
        Object.entries(T.TITLE).map(([id, [n]]) => '<div class="tt' + (P.titlesGot[id] ? ' got' : '') + '">' + (P.titlesGot[id] ? n + ' ×' + P.titlesGot[id] : '？？？') + '</div>').join('') + '</div>';
      html += '<button class="btn-gold" id="mClose">' + T.close + '</button>';
      openModal(html);
    } else if (kind === 'set') {
      const tg = (k) => '<button class="toggle' + (P.settings[k] ? ' on' : '') + '" data-k="' + k + '">' + (P.settings[k] ? T.on : T.off) + '</button>';
      openModal('<h3>' + T.setTitle + '</h3><div class="set-row"><span>' + T.setSound + '</span>' + tg('sound') + '</div><div class="set-row"><span>' + T.setVibe + '</span>' + tg('vibe') + '</div>' +
        '<div class="set-row"><span></span><button class="danger" id="mReset">' + T.setReset + '</button></div><p class="credits">' + T.setCredits + '</p><button class="btn-gold" id="mClose">' + T.close + '</button>', (c) => {
        c.querySelectorAll('.toggle').forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.k; P.settings[k] = !P.settings[k];
          b.classList.toggle('on', P.settings[k]); b.textContent = P.settings[k] ? T.on : T.off;
          if (k === 'sound') { if (P.settings.sound) audioInit(); updateMute(); }
          save();
        }));
        c.querySelector('#mReset').addEventListener('click', () => {
          if (confirm(T.confirmReset)) { wipe(); closeModal(); toTitle(); }
        });
      });
    }
    const cl = $('mClose'); if (cl) cl.addEventListener('click', closeModal);
  }
  function updateMute() { $('btnMute').textContent = P.settings.sound ? '🔊' : '🔇'; }

  // ---------- つなぐ ----------
  function bind() {
    fillStrings();
    $('office').addEventListener('pointerdown', (e) => { if (e.button > 0) return; e.preventDefault(); onTap(e); });
    $('homeBtn').addEventListener('click', () => sendHome('button'));
    $('btnStart').addEventListener('click', startFromTitle);
    $('btnCont').addEventListener('click', startFromTitle);
    $('btnNew').addEventListener('click', () => {
      if (S && !confirm(T.confirmReset)) return;
      const keepSettings = P.settings; wipe(); P.settings = keepSettings; audioInit(); startNewDay();
    });
    $('btnResult').addEventListener('click', showResult);
    $('btnShare').addEventListener('click', doShare);
    $('btnSaveImg').addEventListener('click', saveImage);
    $('btnNext').addEventListener('click', nextDay);
    $('btnToTitle').addEventListener('click', toTitle);
    $('btnMute').addEventListener('click', () => { P.settings.sound = !P.settings.sound; if (P.settings.sound) audioInit(); updateMute(); save(); });
    document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openPanel(b.dataset.open)));
    $('modal').addEventListener('click', (e) => { if (e.target === $('modal') && !$('modalCard').querySelector('.choice')) closeModal(); });
    window.addEventListener('resize', fit);
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { hiddenAt = NOW(); save(); }
      else if (hiddenAt && S && S.phase === 'play' && $('scr-game').classList.contains('active')) {
        const sec = (NOW() - hiddenAt) / 1000; hiddenAt = 0;
        if (!modalOpen()) offlineCheck(sec);
      }
    });
    window.addEventListener('pagehide', save);
    // 画像の先読み
    const pre = new Set();
    EMP.forEach((e) => { for (let k = 1; k <= 10; k++) pre.add(e.sheet + 's' + pad2(k) + '.webp'); });
    pre.forEach((u) => { const im = new Image(); im.src = u; });
  }

  // テスト・撮影用の窓口
  window.TEIJI = {
    get S() { return S; }, get P() { return P; }, speed: SPEED,
    yen, yenShare, yenBigHTML, clockStr, triggerEvent, sendHome, save, load,
    setMoney(v) { S.money = v; S.rev = Math.max(S.rev, v); },
    setMinutes(m) { S.minutes = m; },
    lastShareText: '', lastIntentURL: '',
  };

  load();
  fit();
  bind();
  updateMute();
  toTitle();
  if (qs.get('autostart') === '1') startFromTitle();
  requestAnimationFrame(loop);
})();
