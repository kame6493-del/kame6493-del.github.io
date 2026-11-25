// 音: 評判の良いフリー素材だけ(出典は CREDITS.md)。audio/manifest.json があればそれを使い、無ければ前からの CC0 の音で鳴らす。
// 系統: 効果音(打球・捕球) / 球場(ざわめき・セミ・風・応援) / 実況 / 審判。音量は 全体・球場・実況 を別々に変えられる。
const FILES = {
  barrel: 'audio/crack_barrel.mp3', barrel2: 'audio/crack_barrel2.mp3', barrel3: 'audio/crack_barrel3.mp3',
  jam: 'audio/crack_jam.mp3', end: 'audio/crack_end.mp3', foultip: 'audio/foultip.mp3', tick: 'audio/tick.mp3',
  mitt: 'audio/mitt.mp3', mitt2: 'audio/mitt2.mp3',
  roar: 'audio/roar.mp3', amb: 'audio/ambience.mp3', ooh: 'audio/ooh.mp3', cheer: 'audio/cheer.mp3', applause: 'audio/applause.mp3',
};
// manifest に無いときの代わり
const FALLBACK = {
  bat_barrel: ['barrel', 'barrel3'], bat_solid: ['barrel2'], bat_jam: ['jam'], bat_foul: ['foultip'], bat_grounder: ['barrel2'],
  glove: ['mitt', 'mitt2'], mitt: ['mitt', 'mitt2'], throw_catch: ['mitt2'], base_step: ['tick'], slide: [],
  cheer_big: ['roar'], cheer: ['cheer'], sigh: ['ooh'], applause: ['applause'], band_hit: [], pa_chime: [],
};

export class Sound {
  constructor() {
    this.ctx = null; this.buf = {}; this.ready = false; this.enabled = true;
    this.ambSrc = null; this.vol = 0.9;
    this.man = null; this.last = {};
    this.voiceOn = true; this.vq = []; this.vBusyUntil = 0; this.vlog = []; this.lastVoice = null;
    this.levels = { all: 0.8, amb: 0.7, voice: 0.8, song: 1, crowd: 1, sfx: 1 };   // 11/21 応援歌・歓声・効果音も別に変えられる
    this.loops = {};
    this.fill = 1;          // 観客の入り(満員 1 / ふつう 0.7 / 空いている 0.4)
    this.timeK = 1;         // ナイターは少し静かに
    this.pressure = 0;      // 得点圏に走者がいると上がる(攻める側の応援が高まる)
    this.attackSide = -1;   // 攻める側の応援の聞こえる向き(-1 三塁側=左、+1 一塁側=右)
    this.taikoT = 0; this.taikoI = 0;
  }
  async init() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !this.bgHidden) try { await this.ctx.resume(); } catch (e) { } return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    // 全体の出口: 少し下げてから、割れないようにリミッター(強く当たる所だけ抑える)
    this.master = c.createGain(); this.master.gain.value = this.levels.all;
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -16; this.limiter.knee.value = 6; this.limiter.ratio.value = 12; this.limiter.attack.value = 0.003; this.limiter.release.value = 0.25;
    this.trim = c.createGain(); this.trim.gain.value = 0.62;
    this.master.connect(this.trim); this.trim.connect(this.limiter); this.limiter.connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.levels.sfx; this.sfxBus.connect(this.master);
    this.ambBus = c.createGain(); this.ambBus.gain.value = this.levels.amb; this.ambBus.connect(this.master);
    this.voiceBus = c.createGain(); this.voiceBus.gain.value = this.levels.voice; this.voiceBus.connect(this.master);
    // 応援(攻める側): 左右の向きを付ける。観客の層: ざわめき(小)・応援(中)・歓声(大)を重ねる
    this.supBus = c.createGain(); this.supBus.gain.value = 0.0;
    this.supPan = c.createStereoPanner ? c.createStereoPanner() : null;
    if (this.supPan) { this.supPan.pan.value = this.attackSide * 0.6; this.supBus.connect(this.supPan); this.supPan.connect(this.ambBus); } else this.supBus.connect(this.ambBus);
    this.bedBus = c.createGain(); this.bedBus.gain.value = 1; this.crowdVol = c.createGain(); this.crowdVol.gain.value = this.levels.crowd; this.bedBus.connect(this.crowdVol); this.crowdVol.connect(this.ambBus);
    this.songBus = c.createGain(); this.songBus.gain.value = this.levels.song; this.songBus.connect(this.supBus);   // 応援歌の音量(設定)
    // 球場の広さの響き(審判の声などに少しだけ)
    this.verb = c.createConvolver(); this.verb.buffer = this.impulse(1.6); this.verbGain = c.createGain(); this.verbGain.gain.value = 0.35;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.sfxBus);
    this.streamDest = c.createMediaStreamDestination ? c.createMediaStreamDestination() : null;
    if (this.streamDest) this.limiter.connect(this.streamDest);
    try { this.man = await (await fetch('audio/manifest.json', { cache: 'no-cache' })).json(); } catch (e) { this.man = null; }
    const urls = { ...FILES };
    // 実況の声(voice)は数が多いので、ここでは読まない。使う時に少しずつ読む(vPrime・vFill。スマホのメモリを食わないように)
    if (this.man) for (const grp of ['sfx', 'amb', 'call', 'pa', 'vendor']) for (const [k, v] of Object.entries(this.man[grp] || {})) for (const u of [].concat(v || [])) if (u) urls[u] = u;
    await Promise.all(Object.entries(urls).map(async ([k, url]) => {
      try { const ab = await (await fetch(url)).arrayBuffer(); this.buf[k] = await new Promise((res, rej) => c.decodeAudioData(ab, res, rej)); } catch (e) { /* 無くても遊べる */ }
    }));
    this.ready = true;
    this.vPrime();
    try { if (this.bgHidden) await c.suspend(); else if (c.state === 'suspended') await c.resume(); } catch (e) { }
  }
  // 短い響き(雑音を指数で減らしただけの、部屋の響きの型)
  impulse(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2) * (i < 400 ? i / 400 : 1); }
    return b;
  }
  // 屋根の球場: 屋根の下の長い響き(約 3.4 秒)に、観客・応援・実況・効果音を少し通す(音の素材は増やさない)
  // 森かげドーム(屋根あり・横が開いている): 響きを半分に、風の音を少し残す(11/19)
  setSemiOpen() { this.semi = true; if (this.hallGain) this.hallGain.gain.value = 0.14; if (this.ctx) this._applyPlace(); }
  setIndoor(on) {
    if (this.ctx) { this.indoor = !!on; this._applyPlace(); }   // 屋根の開け閉めで風と空調の音を入れ替える
    if (!this.ctx || this.hall) return;
    if (!on) return;
    const c = this.ctx;
    this.hall = c.createConvolver(); this.hall.buffer = this.impulse(3.4);
    this.hallGain = c.createGain(); this.hallGain.gain.value = 0.28;
    this.hall.connect(this.hallGain); this.hallGain.connect(this.master);
    for (const [bus, g] of [[this.ambBus, 0.6], [this.voiceBus, 0.35], [this.sfxBus, 0.45]]) { const s = c.createGain(); s.gain.value = g; bus.connect(s); s.connect(this.hall); }
  }
  setVolume(key, v) {
    this.levels[key] = v;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (key === 'all') this.master.gain.setTargetAtTime(v, t, 0.05);
    if (key === 'amb') this.ambBus.gain.setTargetAtTime(v, t, 0.05);
    if (key === 'voice') this.voiceBus.gain.setTargetAtTime(v, t, 0.05);
    if (key === 'song' && this.songBus) this.songBus.gain.setTargetAtTime(v, t, 0.05);
    if (key === 'crowd' && this.crowdVol) this.crowdVol.gain.setTargetAtTime(v, t, 0.05);
    if (key === 'sfx') this.sfxBus.gain.setTargetAtTime(v, t, 0.05);
  }
  setVoice(on) { this.voiceOn = on; if (!on) this.vq.length = 0; }
  files(grp, key) {
    const m = this.man && this.man[grp] && this.man[grp][key];
    const list = [].concat(m || []).filter((u) => u && this.buf[u]);
    if (list.length) return list;
    return (FALLBACK[key] || []).filter((k) => this.buf[k]);
  }
  // 同じ音が続かないように選ぶ
  pick(grp, key) {
    const l = this.files(grp, key);
    if (!l.length) return null;
    let u = l[Math.floor(Math.random() * l.length)];
    if (l.length > 1 && u === this.last[key]) u = l[(l.indexOf(u) + 1) % l.length];
    this.last[key] = u;
    return u;
  }
  gainOf(u) { return (this.man && this.man.gain && this.man.gain[u]) ?? 1; }
  // 早送り・スキップ中か(自分の操作の場面ではない)。実況の入口(commentary.js の commentate)と同じ見分け方: defense の ffw か dg。
  // 観客・応援の側もこれを使う。早送り中は出来事の音(歓声・拍手・太鼓・メガホン・掛け声・審判・打球)を鳴らさず、ループのざわめきだけ残す
  isSkipping() { const d = globalThis.__app && globalThis.__app.defense; return !!(d && (d.ffw || d.dg)); }
  play(name, { gain = 1, rate = 1, at = 0, offset = 0, dur, bus, pos, always } = {}) {
    if (this.log) this.log.push({ name, gain, rate, at });
    if (!always && this.isSkipping()) return null;
    if (!this.ready || !this.enabled || !this.buf[name]) return null;
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.buf[name];
    s.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = gain * this.gainOf(name);
    s.connect(g);
    let out = g;
    if (pos && this.listener) {
      // 聞こえる位置: 左右と距離。遠いほど小さく、響きが多い
      const pn = c.createPanner(); pn.panningModel = 'equalpower'; pn.distanceModel = 'inverse'; pn.refDistance = 6; pn.rolloffFactor = 0.9;
      pn.positionX ? (pn.positionX.value = pos.x, pn.positionY.value = pos.y, pn.positionZ.value = pos.z) : pn.setPosition(pos.x, pos.y, pos.z);
      g.connect(pn); out = pn;
      const d = Math.hypot(pos.x - this.listener.x, pos.z - this.listener.z);
      const wet = c.createGain(); wet.gain.value = Math.min(0.8, 0.12 + d / 120); out.connect(wet); wet.connect(this.verb);
    }
    out.connect(bus || this.sfxBus);
    const t = c.currentTime + at;
    if (dur) s.start(t, offset, dur); else s.start(t, offset);
    // 応援(太鼓・吹奏楽・掛け声)は先の拍まで予約するので、打った瞬間に重なる物を止められるよう覚えておく(_contactQuiet)
    // 得点の時の攻める側の太鼓・掛け声(sidePan)も
    if (bus && (bus === this.supBus || bus === this.sidePan)) { const q =(this._supSrc || (this._supSrc = [])).filter((x) => x.t > c.currentTime - 0.5); q.push({ s, g, t }); this._supSrc = q; }
    return { src: s, gain: g, dur: (dur || s.buffer.duration) / rate };
  }
  // 聞く人の位置(カメラ)を毎フレーム渡す
  setListener(cam) {
    if (!this.ctx) return;
    this.listener = cam.position;
    const L = this.ctx.listener, p = cam.position, f = cam.getWorldDirection ? cam.getWorldDirection(cam.position.clone()) : null;
    try {
      if (L.positionX) { L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z; }
      else L.setPosition(p.x, p.y, p.z);
      if (f) { if (L.forwardX) { L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; } else L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
    } catch (e) { /* 古い環境 */ }
  }
  // 効果音: 同じ音を 0.07 秒以内に続けて鳴らさない・0.05 秒に 3 つまで(重なって大きく割れないように)
  sfx(key, opt = {}) {
    const now = this.ctx ? this.ctx.currentTime : performance.now() / 1000;
    this.sfxLast = this.sfxLast || {}; this.sfxWin = (this.sfxWin || []).filter((t) => now - t < 0.05);
    if (this.sfxLast[key] != null && now - this.sfxLast[key] < 0.07) return null;
    if (this.sfxWin.length >= 3) return null;
    this.sfxLast[key] = now; this.sfxWin.push(now);
    const u = this.pick('sfx', key) || this.pick('amb', key); if (this.log) this.log.push({ name: key, t: +now.toFixed(3), gain: opt.gain ?? 1 }); return u ? this.play(u, opt) : null;
  }

  // ------------------------------------------------ 球場の音(ループ)
  ambience(on, level = 0.55) {
    if (!this.ready) return;
    const c = this.ctx;
    const A = this.man?.amb || {};
    const want = [['crowd', A.crowd_loop || 'amb', level, 'bed'], ['buzz', A.buzz_loop, level * 0.5, 'bed'],
      ['band', A.band_loop, level * 0.55, 'sup'], ['rhythm', A.cheer_rhythm_loop, level * 0.7, 'sup']];
    for (const [k, u, lv, bus] of want) {
      const L = this.loops[k];
      if (on && u && this.buf[u] && !L) {
        const b = this.buf[u];
        const g = c.createGain(); g.gain.value = lv * this.gainOf(u); g.connect(bus === 'bed' ? this.bedBus : bus === 'sup' ? this.supBus : this.ambBus);
        const s = c.createBufferSource(); s.buffer = b; s.loop = true;
        if (b.duration > 2) { s.loopStart = 0.3; s.loopEnd = b.duration - 0.3; }
        s.connect(g); s.start(c.currentTime, Math.random() * Math.max(0, b.duration - 1));
        this.loops[k] = { s, g, lv: lv * this.gainOf(u) };
      } else if (!on && L) { try { L.s.stop(); } catch (e) { } delete this.loops[k]; }
      else if (on && L) { L.lv = lv * this.gainOf(u); L.g.gain.setTargetAtTime(this._songOn && bus === 'sup' ? 0.0001 : L.lv, c.currentTime, 0.4); }   // 応援の曲が鳴っている間は太鼓の列・手拍子のループは下げたまま
    }
    this.placeLoops(on, level);
    this.ambSrc = this.loops.crowd ? this.loops.crowd.s : null;
    this.ambGain = this.loops.crowd ? this.loops.crowd.g : null;
    this.ambLevel = this.loops.crowd ? this.loops.crowd.lv : level;
  }
  // 場所の音(11/19): 屋外は風(wind_loop)、屋根の下は空調の低い音(dome_air_loop)、コンコースは人の話し声のこもった響き(concourse_loop)。
  // 観客の入りや mood で上下させないよう、ループ(this.loops)とは別に持つ。風・空調は球場の音(ambBus)を通る(コンコースでこもる)。
  // コンコースの話し声は concBus(こもらせない)を通り、席・グラウンドでは 0、コンコース(setMuffle 1)で 1、裏の部屋(2)で小さく
  placeLoops(on, level = 0.9) {
    const c = this.ctx, A = this.man?.amb || {};
    if (!this.placeBus) {
      this.placeBus = {};
      for (const k of ['wind', 'air']) { const g = c.createGain(); g.gain.value = 0; g.connect(this.ambBus); this.placeBus[k] = g; }
      const cg = c.createGain(); cg.gain.value = 0; cg.connect(this.master); this.placeBus.conc = cg;
      this.place = {};
    }
    for (const [k, u, lv] of [['wind', A.wind_loop, 0.5], ['air', A.dome_air_loop, 0.45], ['conc', A.concourse_loop, 0.55]]) {
      const L = this.place[k];
      if (on && u && this.buf[u] && !L) {
        const b = this.buf[u], g = c.createGain(); g.gain.value = lv * level; g.connect(this.placeBus[k]);
        const s = c.createBufferSource(); s.buffer = b; s.loop = true; s.loopStart = 1; s.loopEnd = b.duration - 1;
        s.connect(g); s.start(c.currentTime, 1 + Math.random() * Math.max(0, b.duration - 3));
        this.place[k] = { s, g };
      } else if (!on && L) { try { L.s.stop(); } catch (e) { } delete this.place[k]; }
    }
    this._applyPlace();
  }
  _applyPlace() {
    if (!this.placeBus) return;
    const t = this.ctx.currentTime, m = this.muffleK || 0;
    this.placeBus.wind.gain.setTargetAtTime(this.indoor ? (this.semi ? (this.windK || 1) : 0) : (this.windK || 1), t, 1.0);   // windK: 球場の風の強さ(main.js が stadiums.js の wind を入れる)
    this.placeBus.air.gain.setTargetAtTime(this.indoor ? (this.semi ? 0.5 : 1) : 0, t, 1.0);
    this.placeBus.conc.gain.setTargetAtTime(m >= 2 ? 0.25 : m >= 1 ? 1 : 0, t, 0.5);
  }
  // 場内放送(VOICEVOX:No.7 アナウンス): 新しい打者の「バッターは、N 番。」と、ファウルが客席へ入った後の「ファウルボールにご注意ください」。
  // 球場のスピーカーらしく、遠い響き(verb)を多めに。実況より前に出ないよう ambBus(実況の間は下がる)を通す
  paSay(file, at = 0) {
    if (!this.ready || !this.enabled || this.isSkipping() || !this.buf[file]) return null;
    const c = this.ctx;
    if (!this.paBus) { this.paBus = c.createGain(); this.paBus.gain.value = 0.42; this.paBus.connect(this.ambBus); const w = c.createGain(); w.gain.value = 0.55; this.paBus.connect(w); w.connect(this.verb); }
    this._paT = c.currentTime + at;
    return this.play(file, { gain: 1, at, bus: this.paBus });
  }
  _paBatter() {
    const d = globalThis.__app && globalThis.__app.defense; if (!d || !d.g || !d.batterNum) return;
    const key = d.g.inning + d.g.half + ':' + (d.g.pa || 0);
    if (key === this._paKey) return;
    const pl = d.play;
    if (pl && pl.endT == null) return;   // 打席の間(次の投球までの待ち)だけ
    if (!(d.wait > 3.2)) return;          // 次の打球までに言い終わらない時は言わない(守備の試合は間が短いので、ほぼ観戦で鳴る)
    const o = d.awayOrder ? d.awayOrder() : null, i = o ? ((Math.max(1, d.g.pa || 1) - 1) % 9 + 9) % 9 : -1;
    const n = i >= 0 ? i + 1 : 0;   // 打順(1〜9 番)
    this._paKey = key;
    if (n >= 1 && n <= 9) this.paSay(`audio/pa/batter_${n}.mp3`, 0.8);
  }
  // 売り子の声: 席の通路のどこか(聞く人から 10〜35 m)で時々。遠いほど小さく響く(play の pos)。コンコース・裏の部屋・早送りでは鳴らさない
  _vendorTick(dt) {
    this._vendT = (this._vendT ?? 12 + Math.random() * 15) - dt;
    if (this._vendT > 0) return;
    this._vendT = 18 + Math.random() * 30;
    const L = this.listener, list = this.files('vendor', 'call');
    if (!L || !list.length || (this.muffleK || 0) >= 1 || this.ctx.currentTime < (this._cheerQuietUntil || 0) + 1) return;
    const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 25;
    const u = list[Math.floor(Math.random() * list.length)];
    this.play(u, { gain: 0.9 * this.fill, bus: this.ambBus, pos: { x: L.x + Math.cos(a) * r, y: L.y + 1 + Math.random() * 3, z: L.z + Math.sin(a) * r } });
  }
  // ------------------------------------------------ 観客の指揮
  // 観客の入りと時間帯で全体の大きさを決める
  setFill(f) { this.fill = f; this._applyCrowdLevel(); }
  setTimeOfDay(k) { this.timeK = k === 'night' ? 0.75 : 1; this._applyCrowdLevel(); }
  _applyCrowdLevel() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = this.fill * this.timeK;
    this.bedBus.gain.setTargetAtTime(k, t, 0.6);
    this._supBase = (this.watchMode ? 0.5 + 0.5 * this.pressure : 0.25 + 0.75 * (this.isSkipping() ? 0 : this.pressure)) * this.fill;   // 早送り中は応援を盛り上げない。観戦(watch.js)は攻撃中ずっと応援が続く
    this.supBus.gain.setTargetAtTime(this._supBase, t, 0.8);
  }
  // 得点圏の走者(0..1)と、攻める側(top = 先攻 = 三塁側、bottom = 後攻 = 一塁側)
  setPressure(p, half) {
    if (this.log) this.log.push({ name: 'pressure:' + p.toFixed(2) });
    // 打席の終わり・早送りの 1 行ごとに呼ばれる: ここで点が入っていたら得点の音(ヒットの音とは別)
    if (this.ready && this.enabled) { const runs = this._scoreCheck(true); if (runs > 0) this.celebrate(Math.min(1, 0.6 + 0.2 * runs), false); }
    this.pressure = Math.max(0, Math.min(1, p));
    const side = half === 'bottom' ? 1 : -1;
    if (this.ctx && this.supPan && side !== this.attackSide) {
      // 攻守の交代: 応援がいったん下がって、反対側から聞こえ直す
      const t = this.ctx.currentTime;
      this.supBus.gain.setTargetAtTime(0.0001, t, 0.3);
      this.supPan.pan.setTargetAtTime(side * 0.6, t + 0.9, 0.05);
    }
    this.attackSide = side;
    this._applyCrowdLevel();
  }
  // 毎フレーム: 得点圏に走者がいる間は、攻める側の太鼓の拍子(ドン・ドン・ドドン)と手拍子。
  // ラッパは得点圏の応援の中だけ・小さく・まれに(打った・点が入った後の 14 秒は鳴らさない、1 回鳴ったら 20 秒あける)
  tick(dt) {
    if (!this.ready || !this.enabled) return;
    // 早送りが始まった・終わった時に応援の大きさを合わせ直す。早送り中は拍子を鳴らさない
    const skip = this.isSkipping(); if (skip !== this._wasSkip) { this._wasSkip = skip; this._applyCrowdLevel(); }
    this._flyTick(dt, skip);   // 11/21 大飛球の「おおーっ」(打球が飛んでいる間、フェンスに近づくほど上がる)
    this._songTick(dt, skip);  // 11/21 応援の曲(プロ風 3・高校野球 3)を攻める側のスタンドから
    if (skip) return;
    this._vendorTick(dt);
    this._paT2 = (this._paT2 || 0) - dt; if (this._paT2 <= 0) { this._paT2 = 0.25; this._paBatter(); }
    this.taikoT -= dt;
    if (this.ctx.currentTime < (this._cheerQuietUntil || 0)) { this.taikoT = Math.max(this.taikoT, this._cheerQuietUntil - this.ctx.currentTime); return; }   // 打った直後は応援の拍子を止める(本物も打った瞬間に演奏が止まる)
    if ((this.pressure < 0.45 && !this.watchMode) || this.taikoT > 0) return;   // 観戦は走者がいなくても攻撃中ずっと拍子(本物の応援と同じ)。大きさは pressure で上下
    if (this._songOn) { this.taikoI++; this.taikoT = 2.0; return; }   // 応援の曲が鳴っている間は、拍子の太鼓・ラッパ・メガホン・掛け声を重ねない(拍の合図だけ進める。crowd.js の手拍子の絵が使う)
    const pat = [0, 0.5, 1.0, 1.25];
    const now = this.ctx.currentTime;
    // 応援の型(crowd.js が cheerStyle を入れる): hs = 高校野球(太鼓・吹奏楽の短い音・生徒の掛け声)、pro = プロ風(行進の太鼓・トランペットの短い音・メガホン)
    const pro = this.cheerStyle === 'pro';
    const g0 = 0.35 * this.fill * (0.6 + 0.4 * this.pressure);
    const i = this.taikoI++;
    const pd = pro ? this.pick('amb', 'pro_drums') : null;
    if (pd) { if (i % 4 === 0) this.play(pd, { gain: g0 * 0.85, dur: 8, bus: this.supBus }); }
    else { const u = this.pick('amb', 'taiko'); if (u) for (const off of pat) this.play(u, { gain: g0, at: off, bus: this.supBus }); }
    // 吹奏楽・トランペットは拍子に置く短い音だけ(曲は鳴らさない)。打った・点が入った後の 14 秒は鳴らさない(ラッパを休む決まりと同じ)
    const brassOk = now >= (this._hornQuietUntil || 0);
    const hey = this.pick('amb', 'chant_hey');
    if (pro) {
      const tp = this.pick('amb', 'pro_trumpet');
      if (tp && brassOk) for (const off of [0, 0.5, 1.0]) this.play(tp, { gain: 0.16 * this.fill, at: off, dur: 0.45, bus: this.supBus });
      const mg = this.pick('amb', 'megaphone');
      if (mg) for (let k = 0; k < 8; k++) this.play(mg, { gain: (k % 2 ? 0.14 : 0.22) * this.fill, at: k * 0.25 + Math.random() * 0.015, rate: 0.95 + Math.random() * 0.1, bus: this.supBus });
      if (hey) this.play(hey, { gain: 0.3 * this.fill, at: 1.5, rate: 0.96 + Math.random() * 0.08, bus: this.supBus });
    } else {
      const br = this.pick('amb', 'hs_brass');
      if (br && brassOk) for (const off of [0, 1.0]) this.play(br, { gain: 0.2 * this.fill * (0.6 + 0.4 * this.pressure), at: off, dur: 0.9, bus: this.supBus });
      if (hey && i % 2) this.play(hey, { gain: 0.3 * this.fill, at: 1.5, rate: 0.98 + Math.random() * 0.06, bus: this.supBus });
    }
    const horn = !pro && this.pressure >= 0.5 && i >= 3 && now >= (this._hornQuietUntil || 0) && Math.random() < 0.25;
    if (horn) { const tr = this.pick('amb', 'trumpet'); if (tr) this.play(tr, { gain: 0.12 * this.fill, at: 0.1, bus: this.supBus }); this._hornQuietUntil = now + 20; }
    else if (!pro) { const cl = this.pick('amb', 'clap_rhythm'); if (cl && i % 2) this.play(cl, { gain: 0.45 * this.fill, at: 0.0, dur: 2.0, bus: this.supBus }); }
    this.taikoT = 2.0;
  }
  // ------------------------------------------------ 応援の曲(11/21)
  // manifest の cheer_songs: { pro: { normal, chance, score }, hs: {...} }。各 { file, loopStart, loopEnd }(前後 0.5 秒は継ぎ目用の続きの音)。
  // 球場の型(cheerStyle: pro / hs)の 3 曲だけを使う時に読む(22.05kHz にして持つ。スマホのメモリを食わないように)。
  // 鳴らし方: 攻める側のスタンド(supBus = 攻める側の向き・pressure と観客の入りで大きさが変わる)から 1 曲ずつ。
  //   ふだん normal / 得点圏に走者 chance(pressure 0.5 以上) / 点が入った後 24 秒 score。切り替えは 1.5 秒で重ねて入れ替える。
  //   打った瞬間(_cheerQuietUntil)は止まり、少しして戻る(本物の応援と同じ)。攻守が替わったら頭から。早送り中は鳴らさない。
  //   曲が鳴っている間は band_loop・cheer_rhythm_loop と拍子の短い音(tick)を止め、重ねすぎない。
  _songLoad(style) {
    const S = this.man && this.man.cheer_songs && this.man.cheer_songs[style];
    if (!S || !this.ctx) return null;
    this._songBuf = this._songBuf || {};
    if (this._songBuf[style]) return this._songBuf[style];
    const box = this._songBuf[style] = { ready: false, buf: {} };
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    Promise.all(Object.entries(S).map(async ([k, v]) => {
      try {
        const ab = await (await fetch(v.file)).arrayBuffer();
        const dc = OAC ? new OAC(1, 1, 22050) : this.ctx;
        box.buf[k] = await new Promise((res, rej) => dc.decodeAudioData(ab, res, rej));
      } catch (e) { /* 無くても遊べる(今までの拍子の音で鳴る) */ }
    })).then(() => { box.ready = true; });
    return box;
  }
  _songTick(dt, skip) {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime;
    this._songT = (this._songT || 0) - dt;
    if (this._songT > 0) return;
    this._songT = 0.25;
    const style = this.cheerStyle === 'pro' ? 'pro' : this.cheerStyle === 'hs' ? 'hs' : null;
    const on = !!(style && this.enabled && this.loops && this.loops.crowd && !skip);
    const box = on ? this._songLoad(style) : null;
    if (!on || !box || !box.ready) { this._songCutPrev(); if (this._song) this._songStop(skip ? 0.25 : 1.0, skip ? 'skip' : 'off'); this._songOn = false; this._songLoops(false); return; }
    let want = now < (this._songScoreUntil || 0) ? 'score' : this.pressure >= 0.5 ? 'chance' : 'normal';
    if (!box.buf[want]) want = box.buf.normal ? 'normal' : Object.keys(box.buf)[0];
    if (!want) return;
    const cur = this._song, side = this.attackSide;
    if (cur && cur.side !== side) { this._songCutPrev(); this._songStop(0.6, 'side'); this._songAt = 0; }   // 攻守の交代: 今の曲を止めて、反対側で頭から
    else if (cur && cur.key !== want) {
      // ふだん⇔チャンスは 8 秒は続けてから替える(走者が出たり消えたりで行ったり来たりしない)。得点の後は待たずに替える
      // 替える所は今の曲の次の小節の頭(ループの頭が小節の頭。manifest の bar)。そこで 0.3 秒だけ重ねて、次の曲を小節の頭から入れる
      if (cur.t0 > now) { try { cur.s.stop(); } catch (e) { } this._song = null; this._songAt = cur.t0; }   // まだ鳴り始めていない(小節の頭を待っている)曲は、同じ時刻で入れ替える
      else if (want === 'score' || cur.key === 'score' || now - cur.t0 > 8) { const at = this._songNextBar(cur, now); this._songStop(0.3, 'switch', at - 0.15); this._songAt = at - 0.15; }
    }
    if (!this._song) { const at = Math.max(now, this._songAt || 0); this._songAt = 0; this._songStart(style, want, box.buf[want], side, this._songLast === want && this._songLastSide === side ? 'resume' : 'start', at); }
    // 打った瞬間から少しの間は演奏を止める(_contactQuiet と同じ窓)。そのあと 1 秒かけて戻す
    const S2 = this._song;
    if (S2) {
      const quiet = now < (this._cheerQuietUntil || 0) + 0.3;
      if (quiet !== S2.quiet) { S2.quiet = quiet; S2.g.gain.setTargetAtTime(quiet ? 0.0001 : S2.lv, now, quiet ? 0.08 : 0.5); if (this.log) this.log.push({ name: 'song:' + (quiet ? 'quiet' : 'back') }); }
    }
    this._songOn = true;
    this._songLoops(true);
  }
  // 今の曲の次の小節の頭の時刻(0.2 秒より近ければその次)
  _songNextBar(S, now) {
    const bar = S.bar || 2, len = S.len || 60;
    const pos = ((now - S.t0) % len + len) % len;
    let dt = bar - (pos % bar); if (dt < 0.2) dt += bar;
    return now + dt;
  }
  _songStart(style, key, b, side, how, at) {
    const c = this.ctx, v = this.man.cheer_songs[style][key], now = Math.max(c.currentTime, at || 0);
    const s = c.createBufferSource(); s.buffer = b; s.loop = true;
    s.loopStart = v.loopStart || 0; s.loopEnd = Math.min(b.duration, v.loopEnd || b.duration);
    // 頭から入る時(攻守の交代・はじめ)は 0.5 秒で上げる。曲の切り替え(at あり)は小節の頭へ 0.3 秒で重ねる
    const g = c.createGain(), lv = 0.57; g.gain.value = 0.0001;   // 11/21 持ち主「応援歌の音量上げて」0.38→0.57(1.5倍)
    if (at) { g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(lv, now + 0.3); } else g.gain.setTargetAtTime(lv, now, 0.5);
    s.connect(g); g.connect(this.songBus || this.supBus);
    // 早送り・打った後などで止まった同じ曲に戻る時は、止まった所の小節の頭から続ける(毎回頭からにしない)
    const len = s.loopEnd - s.loopStart, bar = v.bar || 2;
    const back = how === 'resume' && this._songPos != null ? Math.floor(this._songPos / bar) * bar % len : 0;
    s.start(now, s.loopStart + back);
    this._songPos = null;
    this._song = { s, g, key, style, side, t0: now - back, lv, quiet: false, bar: v.bar, len };
    this._songLast = key; this._songLastSide = side;
    if (this.log) this.log.push({ name: 'song:' + style + '_' + key });
    (this.songLog || (this.songLog = [])).push({ t: +now.toFixed(2), ev: how, song: style + '_' + key, side, p: +this.pressure.toFixed(2) });
  }
  _songStop(sec, why, at) {
    const S = this._song; if (!S) return;
    this._songPos = this.ctx.currentTime > S.t0 ? (this.ctx.currentTime - S.t0) % (S.len || 60) : 0;   // 戻る時に続きから鳴らすため
    const now = Math.max(this.ctx.currentTime, at || 0);
    try { S.g.gain.cancelScheduledValues(now); S.g.gain.setValueAtTime(S.g.gain.value, now); S.g.gain.linearRampToValueAtTime(0.0001, now + sec); S.s.stop(now + sec + 0.05); } catch (e) { }
    (this.songLog || (this.songLog = [])).push({ t: +now.toFixed(2), ev: 'stop:' + why, song: S.style + '_' + S.key });
    this._song = null;
    if (why === 'switch') this._songPrev = S;
  }
  // 小節の頭で替える途中(前の曲がまだ鳴っている)に早送り・止める・攻守が替わる時は、前の曲もすぐ消す
  _songCutPrev() {
    const P = this._songPrev; if (!P) return; this._songPrev = null;
    const t = this.ctx.currentTime;
    try { P.g.gain.cancelScheduledValues(t); P.g.gain.setValueAtTime(P.g.gain.value, t); P.g.gain.linearRampToValueAtTime(0.0001, t + 0.2); P.s.stop(t + 0.25); } catch (e) { }
  }
  // 曲が鳴っている間は、前からの応援のループ(太鼓の列・手拍子)を下げる
  _songLoops(song) {
    const t = this.ctx.currentTime;
    for (const k of ['band', 'rhythm']) { const L = this.loops[k]; if (L) L.g.gain.setTargetAtTime(song ? 0.0001 : L.lv, t, 0.6); }
  }
  // 点が入ったか: 早送りの時はその行の「N 点」、ふつうの時は試合の点の合計の増え方で見る(defense.js の g / dg を読むだけ)
  _scoreCheck(fromPressure) {
    const d = globalThis.__app && globalThis.__app.defense;
    if (!d || !d.g || !d.g.score) return 0;
    const g = d.g, sum = (s) => (s ? (s.them || 0) + (s.us || 0) : 0), now = this.ctx ? this.ctx.currentTime : 0;
    if (d.dg && d.dg.ev) {
      this._dgSeen = now; this._scG = g; this._scSum = sum(g.score);
      const cur = d.dg.ev[Math.max(0, (d.dg.shown || 1) - 1)];
      if (!cur || cur === this._scEv) return 0;
      const m = /(\d+)\s*点/.exec(cur.t || '');
      if (!m) return 0;
      this._scEv = cur;
      return +m[1];
    }
    if (this._scG !== g) { this._scG = g; this._scSum = sum(g.score); return 0; }
    const n = sum(g.score) - (this._scSum || 0);
    this._scSum = sum(g.score);
    if (n <= 0) return 0;
    // 早送りの直後(点はもう鳴らした)や、本塁打・サヨナラで鳴らしたばかりの時は鳴らさない
    if (now - (this._dgSeen ?? -99) < 4) return 0;
    if (fromPressure && now - (this._celebT ?? -99) < 10) return 0;
    return n;
  }
  // 得点の音: 球場の大きな歓声「わーっ」と拍手に、攻める側のスタンドの盛り上がり(太鼓の連打・メガホンを叩く音・観客の太鼓)を重ねる。ラッパは鳴らさない
  celebrate(k = 0.8, big = false) {
    if (!this.ready || !this.enabled || this.isSkipping()) return;
    const c = this.ctx, t = c.currentTime, f = this.fill * this.timeK;
    if (this.log) this.log.push({ name: 'ev:score' });
    (this.elog || (this.elog = [])).push('score');
    const again = t - (this._celebT ?? -99) < 2.5;   // 早送りで点が続いた時は、歓声だけ足す
    this._celebT = t; this._hornQuietUntil = Math.max(this._hornQuietUntil || 0, t + 14);
    this._songScoreUntil = t + 24;   // 応援の曲: 点が入ったら「得点の後」の曲へ(24 秒)
    this.taikoT = Math.max(this.taikoT, 5.5);           // 得点圏の太鼓の拍子は少し休む(連打と重ねない)
    if (!this.sidePan) {
      this.sidePan = c.createStereoPanner ? c.createStereoPanner() : null;
      if (this.sidePan) this.sidePan.connect(this.ambBus);
    }
    if (this.sidePan) this.sidePan.pan.setValueAtTime(this.attackSide * 0.5, t);
    const side = this.sidePan || this.ambBus;
    const bed = this.bedBus.gain;
    bed.cancelScheduledValues(t); bed.setTargetAtTime(f * (1.9 + 0.3 * k), t, 0.08); bed.setTargetAtTime(f, t + (big ? 6 : 4.5), 1.0);
    const P = (key, o = {}, bus = this.ambBus) => { const u = this.pick('amb', key); return u ? this.play(u, { bus, ...o, gain: (o.gain ?? 1) * f }) : null; };
    P('cheer_big', { gain: 0.75 + 0.2 * k });
    if (again) { P('applause', { gain: 0.45, at: 0.6, dur: 3.5 }); return; }
    P('applause', { gain: 0.55 + 0.15 * k, at: 0.9, dur: big ? 6 : 5 });
    P('score_taiko', { gain: 0.6 + 0.2 * k, at: 0.2 }, side);
    P('stand_drums', { gain: 0.5 + 0.2 * k, at: 0.5 }, side);
    // メガホンを叩く音: 1 打の素材を太鼓の拍(8 分)に合わせて並べる。2 人分を少しずらし、拍の頭を強く
    const mg = this.pick('amb', 'megaphone');
    if (mg) for (let i = 0; i < 14; i++) for (const who of [0, 1]) {
      const at = 0.3 + i * 0.25 + who * 0.018 + (Math.random() - 0.5) * 0.02;
      this.play(mg, { gain: (i % 2 ? 0.28 : 0.42) * (1 - i / 22) * (who ? 0.8 : 1) * f, at, rate: 0.94 + Math.random() * 0.12, bus: side });
    }
    if (big) { P('cheer_big', { gain: 0.7, at: 1.6 }); P('applause', { gain: 0.5, at: 3.6, dur: 5 }); }
    // 攻める側のスタンドの集団の掛け声(プロ風は長めに、大合唱の雰囲気)。ラッパではない
    const hey = this.pick('amb', 'chant_hey');
    if (hey) for (let k = 0, n = this.cheerStyle === 'pro' ? 8 : 3; k < n; k++) this.play(hey, { gain: (0.34 + 0.08 * k) * f, at: 1.3 + k * 0.55, rate: 0.95 + Math.random() * 0.08, bus: side });
  }
  // エール交換(高校野球): 応援団の太鼓の連打と、生徒の集団の掛け声(crowd.js の yell から呼ぶ)
  yellRoll() {
    if (!this.ready || !this.enabled) return;
    const f = this.fill * this.timeK, side = this.supBus;
    const r = this.pick('amb', 'yell_roll'); if (r) this.play(r, { gain: 0.55 * f, dur: 6, bus: this.ambBus });
    const hey = this.pick('amb', 'chant_hey'); if (hey) for (let k = 0; k < 3; k++) this.play(hey, { gain: 0.4 * f, at: 6.3 + k * 1.1, bus: this.ambBus });
  }
  // 7 回の風船(プロ風): 風船が一斉に飛ぶ音(crowd.js の balloonsUp から呼ぶ)
  balloons() {
    if (!this.ready || !this.enabled) return;
    const f = this.fill * this.timeK;
    const b1 = this.buf['audio/amb/balloon_1.mp3'] ? 'audio/amb/balloon_1.mp3' : this.pick('amb', 'balloon');
    if (b1) this.play(b1, { gain: 0.7 * f, dur: 6, bus: this.ambBus });
    const b2 = 'audio/amb/balloon_2.mp3'; if (this.buf[b2]) for (let k = 0; k < 4; k++) this.play(b2, { gain: 0.3 * f, at: 0.15 + k * 0.33, rate: 0.9 + Math.random() * 0.25, bus: this.ambBus });
  }
  // 場面ごとの観客: name と強さ(0..1)。歓声(大)は bus を分けずに鳴らし、ざわめきは場面で上下させる
  crowdEvent(name, k = 1) {
    if (this.log) this.log.push({ name: 'ev:' + name });
    (this.elog || (this.elog = [])).push(name);
    if (!this.ready || !this.enabled) return;
    if (this.isSkipping()) { if (/^(hit|longhit|hr|sayonara|score)$/.test(name)) this._scoreCheck(false); return; }   // 早送り中は鳴らさない(点は数えておき、後で鳴らさない)
    const c = this.ctx, t = c.currentTime, f = this.fill * this.timeK;
    const bed = this.bedBus.gain, base = f;
    const swell = (to, back = 2.2) => { bed.cancelScheduledValues(t); bed.setTargetAtTime(base * to, t, 0.08); bed.setTargetAtTime(base, t + back, 0.8); };
    const P = (key, o = {}) => { const u = this.pick('amb', key); return u ? this.play(u, { bus: this.ambBus, ...o, gain: (o.gain ?? 1) * f }) : null; };
    // 11/21 飛球の結果(捕った・ファウル・落ちた・本塁打)は、飛んでいる間の大きさ(peak)で客席の反応を替える(_flyResult)
    if (this._flyResult(name, k, { t, f, P, swell })) return;
    if (name === 'prepitch') { bed.cancelScheduledValues(t); bed.setTargetAtTime(base * 0.55, t, 0.25); return; }   // 投球の前は静まる
    if (name === 'foul' && t - (this._paFoulT ?? -99) > 60 && Math.random() < 0.35) { this._paFoulT = t; this.paSay(Math.random() < 0.5 ? 'audio/pa/foul_caution.mp3' : 'audio/pa/foul_caution_2.mp3', 2.4); }   // 投球の前は静まる
    // 11/18 0:2x 持ち主「バット当たった後、金属音以外の変な効果音やっぱ鳴ってます。ならないようにして」: 打った時と打球が上がった時は、別の効果音(stir・oo の声、音の高さを上げる「おー」)を鳴らさない。球場のざわめきを少し大きくするだけ
    // 観戦(watch.js): 本物の球場に近い客席の反応。打球音のあと 0.25 秒で「おお」と上がる・ファウルで少し沸く・凡退と三振で攻める側の「あー」
    // 11/19 持ち主「打球音のあと変なポン!みたいな声」: 打った後 0.25 秒の「おお」(oo、0.46 秒の短い叫び)をやめた。
    // 打った直後の客席の反応は、ざわめきの層がふくらむだけ。打球が上がった時は 0.6 秒後から大勢の歓声をゆっくり(0.9 秒かけて)立ち上げる(頭の立った短い声は鳴らさない)
    if (this.watchMode) {
      if (name === 'contact') { swell(1.1 + 0.6 * k, 2.5); return; }
      if (name === 'flyup') { swell(1.3, 3.5); return; }   // 11/21 歓声の立ち上げは _flyTick(打球の飛び方で大きさが変わる)へ移した
      if (name === 'foul') { swell(1.25, 1.6); this.rise('cheer', 0.15 + 0.08 * k, 0.5, 0.6, 1.8); return; }
      if (name === 'out') { swell(1.15, 2.5); P('sigh', { gain: 0.32 + 0.15 * k, at: 0.1 }); P('applause', { gain: 0.3, at: 0.5, dur: 2.5 }); return; }
      if (name === 'strikeout') { swell(1.35, 3); P('sigh', { gain: 0.42, at: 0.05 }); P('cheer', { gain: 0.35, at: 0.15 }); P('applause', { gain: 0.45, at: 0.5, dur: 3 }); return; }
      if (name === 'walk') { swell(1.2, 2); P('applause', { gain: 0.45, dur: 2.5 }); P('cheer', { gain: 0.25, at: 0.1 }); return; }
    }
    if (name === 'contact') { swell(1.0 + 0.4 * k); return; }
    if (name === 'flyup') { swell(1.3, 3.5); return; }
    if (name === 'out') { swell(1.3); P('applause', { gain: 0.5 + 0.3 * k, dur: 3.5 }); P('cheer', { gain: 0.35 * k, at: 0.05 }); return; }
    if (name === 'fine') {
      // 自分のファインプレー: どよめき → 大歓声 → 拍手が長く続く
      swell(1.8, 5); P('stir', { gain: 0.6 }); P('cheer_big', { gain: 0.7, at: 0.4 }); P('applause', { gain: 0.6, at: 1.6, dur: 5 }); P('applause', { gain: 0.45, at: 3.8, dur: 5 });
      return;
    }
    // 打った・点が入った後はラッパを鳴らさない(得点圏の応援のラッパも 14 秒休む)
    if (['contact', 'flyup', 'hit', 'longhit', 'hr', 'sayonara', 'score', 'fine'].includes(name)) this._hornQuietUntil = Math.max(this._hornQuietUntil || 0, t + 14);
    // 点が入った: 得点の音(defense.js から crowdEvent('score', 点の数) でも呼べる)
    if (name === 'score') { this._scoreCheck(false); this.celebrate(Math.min(1, 0.6 + 0.2 * k), false); return; }
    if (name === 'hr') { this._scoreCheck(false); swell(2.2, 5); P('stir', { gain: 0.7 }); this.celebrate(1, true); return; }
    if (name === 'hit' || name === 'longhit') {
      // この打球で点が入っていれば得点の音。入っていなければ、観客のどよめきと歓声だけ(ラッパ・ため息なし)
      const runs = this._scoreCheck(false);
      if (runs > 0) { this.celebrate(Math.min(1, 0.6 + 0.2 * runs), false); return; }
      const big = name === 'longhit' ? 0.8 : 0.55;
      P('stir', { gain: 0.35 + 0.35 * big });
      const u = this.pick('amb', big > 0.6 ? 'cheer_big' : 'cheer');
      if (u) this.play(u, { gain: (0.35 + 0.4 * big) * f, at: 0.15, bus: this.supBus });
      swell(1.6 + 0.4 * big, 3.5);
      return;
    }
    if (name === 'dp' || name === 'strikeout' || name === 'escape') { swell(1.7, 3.5); P('cheer_big', { gain: 0.75 }); P('applause', { gain: 0.7, at: 0.8, dur: 4 }); return; }
    if (name === 'sayonara') {
      this._scoreCheck(false);
      // サヨナラ: 得点の音(太鼓の連打・メガホン)に、大歓声と長い拍手を足す。直前の行で得点の音が鳴っていれば歓声と拍手だけ
      const recent = t - (this._celebT ?? -99) < 3;
      swell(2.2, 6); P('stir', { gain: 1 });
      if (!recent) this.celebrate(1, true);
      P('cheer_big', { gain: 0.9, at: recent ? 0.2 : 1.6 }); P('applause', { gain: 0.9, at: 2.4, dur: 6 });
      return;
    }
    if (name === 'change') { P('applause', { gain: 0.45, dur: 3 }); return; }
    if (name === 'foul') { swell(0.9, 1.5); P('sigh', { gain: 0.3 + 0.2 * k, rate: 1.05 }); return; }   // 「あー」
    if (name === 'miss') { swell(0.8, 2); P('sigh', { gain: 0.5 + 0.3 * k }); return; }
  }
  // ------------------------------------------------ 大飛球の客席(11/21 持ち主「大飛球になったら歓声があがるとか球場っぽい雰囲気にしてください」)
  // 打った球の道筋は打った瞬間に全部わかっている(ballsim.js の predict)。そこから 着く所・一番高い所・フェンスを越えるか を読み(_flyPredict)、
  // 球が飛んでいる間、フェンスに近づくほど客席の「おおーっ」を上げていく(_flyTick。0.08 秒ごとに大きさを決め直す。飛んでいる間は下げない)。
  // 結果で替える(_flyResult): 本塁打 = 大歓声が爆発して攻める側の太鼓・メガホン・掛け声(前からの celebrate)/フェンス直撃・長打 = 歓声と攻める側の拍手/
  //   外野の大飛球を捕った = 攻める側の「あぁ〜」と守る側の拍手/平凡なフライ = 小さく/ファウルの大飛球 = どよめいて、ため息。
  // 音: 「おおーっ」の地は cheer.mp3(MLB の観客の続く歓声 12 秒)を大きさだけ上げ下げ、大きくなったら ooh.mp3(Crowd Ooohs and Ahhhs)の頭の 2 秒を重ねる。
  //   どちらも前から入っている CC0 の音(CREDITS.md)。ため息・拍手・歓声は manifest の sigh・applause・cheer_big・stir のまま。
  // 攻める側・守る側の向きは attackSide(setPressure が表裏から入れる)。左右の振り分けは celebrate の sidePan と同じ 0.5。
  // 打球は defense.js(守備の試合・観戦・カーソルの打席・ボールパーク)、cursorplay.js のはっきりしたファウル(foulFly)、play.js(前の打席)から読むだけ。早送り中は鳴らさない
  _flySrc() {
    const A = globalThis.__app; if (!A) return null;
    const d = A.defense, pl = d && d.play;
    if (d && d.active && !d.dg && d.kind === 'game' && pl && pl.batted && pl.batted.path && !pl.watchPitch && pl.phase !== 'pre') {
      const on = !!(d.ball && d.ball.path === pl.batted.path);
      return { key: pl.batted, path: pl.batted.path, tb: on ? pl.t - d.ball.t0 : null, live: on && !pl.hr && pl.endT == null && !pl.holder, fd: (d.ctx && d.ctx.fenceDist) || A.fenceDist, type: pl.batted.type, who: 'def' };
    }
    const cu = A.cursor, ff = cu && cu.foulFly;
    if (ff && ff.path) return { key: ff, path: ff.path, tb: ff.t, live: ff.t < ff.dur, fd: A.fenceDist, type: 'foul', who: 'cursor' };
    const p = A.play, b = p && p.batted;
    if (b && b.path && (p.state === 'batted' || b.t === 0)) return { key: b, path: b.path, tb: b.t, live: p.state === 'batted', fd: A.fenceDist, type: 'bat', label: b.label, who: 'bat' };
    return null;
  }
  // 打球の予測: 一番高い所(apex)・最初に着く所までの距離(dist)・その向きのフェンスまでの割合(ratio)・越えるか(over)・フェンス直撃か(wall)・フェアか。
  // k(0..1) = どれだけ「大きい」当たりか。越える 1、直撃 0.9、ほかはフェンスの 60% から 95% の所までで 0 → 0.85(外野の定位置あたりの平凡なフライは小さい)。ファウルは 0.8 倍、低い当たり(4 m 未満)は半分
  _flyPredict(path, fd0) {
    const fd = (a) => fd0(Math.max(-45, Math.min(45, a)));
    const P = path.pts, n = path.n, dt = path.dt, fh = path.firstHit;
    const tEnd = fh ? fh.t : n * dt;
    let apex = 0, over = false, tOver = null;
    for (let i = 0; i < n && i * dt <= tEnd + 1e-6; i++) {
      const x = P[i * 4], y = P[i * 4 + 1], z = P[i * 4 + 2]; if (y > apex) apex = y;
      const a = Math.atan2(x, -z) * 57.29578;
      if (!over && Math.abs(a) <= 45 && Math.hypot(x, z) > fd(a) + 0.6 && y > 0.2) { over = true; tOver = i * dt; }   // defense.js の本塁打の見方と同じ
    }
    const q = fh ? fh.p : path.end, ang = Math.atan2(q.x, -q.z) * 57.29578, dist = Math.hypot(q.x, q.z);
    const fair = Math.abs(ang) <= 45 && q.z < 0.3, fdl = fd(ang), ratio = dist / fdl;
    const wall = !over && fair && !!(fh && fh.wall) && Math.abs(dist - fdl) < 3;
    let k = over ? 1 : wall ? 0.9 : Math.max(0, Math.min(0.85, (ratio - 0.6) / 0.35 * 0.85));
    if (!fair) k *= 0.8;
    if (apex < 4) k *= 0.5;
    return { apex, dist, ang, ratio, fair, over, wall, k, tLand: over ? tOver : tEnd };
  }
  _flyStart(s) {
    if (this.fly && !this.fly.done) this._flyEnd('cut');
    if (!s.fd) return;
    const pred = this._flyPredict(s.path, s.fd);
    const t = this.ctx.currentTime;
    const F = this.fly = { key: s.key, path: s.path, who: s.who, label: s.label, pred, I: 0, peak: 0, upd: 0, done: false, used: false, src: null, t0: t };
    const rec = { name: 'fly:start', t: +t.toFixed(3), k: +pred.k.toFixed(2), dist: Math.round(pred.dist), ratio: +pred.ratio.toFixed(2), apex: +pred.apex.toFixed(1), over: pred.over, wall: pred.wall, fair: pred.fair, tLand: +pred.tLand.toFixed(2) };
    if (this.log) this.log.push(rec);
    (this.flyLog || (this.flyLog = [])).push(rec);
    if (pred.k < 0.05 && pred.apex < 12) return;   // 低いライナー・小さいフライ: 打った時のざわめきだけ
    const u = this.buf['audio/cheer.mp3'] ? 'audio/cheer.mp3' : this.buf.cheer ? 'cheer' : this.pick('amb', 'cheer');
    if (u) F.src = this.play(u, { gain: 0.0001, offset: 0.4 + Math.random() * 3, bus: this.ambBus });
  }
  _flyTick(dt, skip) {
    if (!this.ctx) return;
    if (skip) { if (this.fly && !this.fly.done) this._flyEnd('cut'); return; }
    const s = this._flySrc();
    if (s && s.tb != null && s.tb < 0.7 && (!this.fly || this.fly.key !== s.key) && s.type !== 'grounder' && s.type !== 'bunt') this._flyStart(s);
    const F = this.fly; if (!F || F.done) return;
    const t = this.ctx.currentTime;
    if (!s || s.key !== F.key || s.tb == null || !s.live) {   // 球を追えなくなった(捕った・投げた・本塁打・次の打球)。結果の音(crowdEvent)が来なければ 0.6 秒で静かに下げる
      if (F.lost == null) F.lost = t;
      if (F.who === 'bat' && !F.used) this._flyBatResult(F);
      else if (t - F.lost > 0.6) this._flyEnd('fade');
      return;
    }
    F.upd -= dt; if (F.upd > 0) return; F.upd = 0.08;
    const P = F.path.pts, i = Math.max(0, Math.min(F.path.n - 1, Math.floor(s.tb / F.path.dt)));
    const x = P[i * 4], y = P[i * 4 + 1], z = P[i * 4 + 2], a = Math.atan2(x, -z) * 57.29578;
    const r = Math.hypot(x, z) / s.fd(Math.max(-45, Math.min(45, a)));
    const air = s.tb < F.pred.tLand;
    if (F.pred.wall && !F.wallT && !air) { this._flyWall(F); return; }   // フェンスに当たった
    if (F.who === 'bat' && !air && !F.used) { this._flyBatResult(F); return; }
    if (air) {
      // 予測の大きさ(k)を、今の球がフェンスへどれだけ近いか(r)で上げていく。打った瞬間に k の 3 割、フェンスの所で k
      const cl = Math.max(0, Math.min(1, (r - 0.3) / 0.65));
      const I = Math.min(1, F.pred.k * (0.3 + 0.7 * Math.pow(cl, 1.3)) + (F.pred.apex > 12 ? 0.05 : 0));
      F.I = Math.max(F.I, I); F.peak = Math.max(F.peak, F.I);
    }
    const f = this.fill * this.timeK;
    const g = F.I < 0.07 ? 0.0001 : (0.03 + 0.6 * F.I) * f;
    if (F.src) F.src.gain.gain.setTargetAtTime(g, t, air ? 0.18 : 0.6);
    if (!F.oohDone && F.I >= 0.5) {   // 大きくなったら「おおーっ」の声を重ねる(頭を立てず 0.35 秒で上げる)
      F.oohDone = true;
      const h = this.buf.ooh ? this.play('ooh', { gain: 0.0001, dur: 2.1, bus: this.ambBus }) : null;
      if (h) { const G = h.gain.gain, top = (0.22 + 0.3 * F.I) * f; G.setValueAtTime(0.0001, t); G.linearRampToValueAtTime(top, t + 0.35); G.setTargetAtTime(0, t + 1.6, 0.25); }
      if (this.log) this.log.push({ name: 'fly:ooh', t: +t.toFixed(3), gain: +((0.22 + 0.3 * F.I) * f).toFixed(3) });
    }
    const L = this.flyLog || (this.flyLog = []);
    L.push({ t: +t.toFixed(3), tb: +s.tb.toFixed(2), r: +r.toFixed(3), h: +y.toFixed(1), I: +F.I.toFixed(3), g: +g.toFixed(3) });
    if (L.length > 1200) L.splice(0, 300);
    if (!air && s.tb > F.pred.tLand + 2.5) this._flyEnd('fade');   // 着いたのに結果が来ない: 下げる
  }
  // 地の「おおーっ」を下げる: burst = 1.2 秒そのまま残してから(歓声へつなぐ)/ sigh = すぐ下げる(ため息へ)/ fade = ゆっくり / cut = 早送りなど
  _flyEnd(how) {
    const F = this.fly; if (!F || F.done) return;
    const t = this.ctx.currentTime; F.done = true; F.endT = t; F.how = how;
    if (F.src) {
      const [hold, tau] = { burst: [1.2, 0.9], sigh: [0, 0.15], fade: [0, 0.5], cut: [0, 0.06] }[how] || [0, 0.5];
      const G = F.src.gain.gain; G.setTargetAtTime(0.0001, t + hold, tau);
      try { F.src.src.stop(t + hold + tau * 6 + 0.1); } catch (e) { }
    }
    const rec = { name: 'fly:end:' + how, t: +t.toFixed(3), peak: +F.peak.toFixed(3) };
    if (this.log) this.log.push(rec);
    (this.flyLog || (this.flyLog = [])).push(rec);
  }
  // 攻める側(att = true)・守る側のスタンドの向き
  _sideBus(att) {
    const c = this.ctx, key = att ? '_attPan' : '_defPan';
    if (!this[key]) { this[key] = c.createStereoPanner ? c.createStereoPanner() : null; if (this[key]) this[key].connect(this.ambBus); }
    if (this[key]) this[key].pan.setValueAtTime((att ? 1 : -1) * this.attackSide * 0.5, c.currentTime);
    return this[key] || this.ambBus;
  }
  _flyQ(key, o = {}, bus) {
    const u = this.pick('amb', key), f = this.fill * this.timeK;
    const r = u ? this.play(u, { ...o, bus: bus || this.ambBus, gain: (o.gain ?? 1) * f }) : null;
    (this.flyLog || (this.flyLog = [])).push({ name: 'snd:' + key, t: +this.ctx.currentTime.toFixed(3), at: o.at || 0, gain: +((o.gain ?? 1) * f).toFixed(3), side: bus === this._attPan ? 'att' : bus === this._defPan ? 'def' : 'mid' });
    return r;
  }
  _swellBed(to, back) { const t = this.ctx.currentTime, f = this.fill * this.timeK, bed = this.bedBus.gain; bed.cancelScheduledValues(t); bed.setTargetAtTime(f * to, t, 0.08); bed.setTargetAtTime(f, t + back, 0.8); }
  // フェンス直撃: どよめき → 歓声 → 攻める側の拍手(この後の「長打」の音は重ねない)
  _flyWall(F) {
    const t = this.ctx.currentTime;
    F.wallT = t; F.used = true;
    this._flyEnd('burst');
    this._hornQuietUntil = Math.max(this._hornQuietUntil || 0, t + 14);
    this._swellBed(1.9, 3.5);
    this._flyQ('stir', { gain: 0.5 });
    this._flyQ('cheer_big', { gain: 0.62, at: 0.12 });
    this._flyQ('applause', { gain: 0.5, at: 0.9, dur: 4 }, this._sideBus(true));
  }
  // 前の打席(play.js): 球が着いた時に、打球の名前(ホームラン・フェンス直撃・…)で反応する
  _flyBatResult(F) {
    F.used = true;
    const L = F.label, pk = Math.max(F.peak, F.I);
    if (L === 'ホームラン') { this._flyEnd('burst'); this._flyDirect = true; try { this.crowd('hr', 1); } finally { this._flyDirect = false; } this._flyQ('cheer_big', { gain: 0.55, at: 0.4 }); return; }
    if (L === 'フェンス直撃' && !F.wallT) { this._flyWall(F); return; }
    if (!F.pred.fair && pk >= 0.2) { this._flyEnd('sigh'); this._flyQ('stir', { gain: 0.25 + 0.4 * pk }); this._flyQ('sigh', { gain: 0.25 + 0.4 * pk, at: 0.55 }); return; }
    if (F.pred.fair && pk >= 0.3) { this._flyEnd('burst'); this._flyQ('cheer', { gain: 0.3 + 0.3 * pk, at: 0.05 }); this._flyQ('applause', { gain: 0.35 + 0.2 * pk, at: 0.6, dur: 3 }); return; }
    this._flyEnd('fade');
  }
  // crowdEvent から: 今の飛球の結果なら、飛んでいる間の大きさ(peak)で反応を替える。true = ここで鳴らし終えた(前からの反応は鳴らさない)
  _flyResult(name, k, { t, swell }) {
    const F = this.fly;
    if (!F || F.who === 'bat') return false;
    if (F.done && t - F.endT > 1.0) return false;
    // フェンス直撃のあと(落ちた・長打): 歓声はもう鳴らした。点が入っていれば得点の音だけ
    if (F.wallT && t - F.wallT < 6 && (name === 'hit' || name === 'longhit')) { const runs = this._scoreCheck(false); if (runs > 0) this.celebrate(Math.min(1, 0.6 + 0.2 * runs), false); return true; }
    if (F.used || !['hr', 'sayonara', 'out', 'fine', 'foul', 'hit', 'longhit'].includes(name)) return false;
    const pk = Math.max(F.peak, F.I), att = this._sideBus(true), def = this._sideBus(false);
    F.used = true; F.res = name;
    const rec = { name: 'fly:res:' + name, t: +t.toFixed(3), peak: +pk.toFixed(3) };
    if (this.log) this.log.push(rec);
    (this.flyLog || (this.flyLog = [])).push(rec);
    if (name === 'hr' || name === 'sayonara') {   // 本塁打: 地の歓声を残したまま、前からの大歓声・拍手・攻める側の太鼓とメガホン(celebrate)へ。攻める側の歓声を 1 つ足す
      this._flyEnd('burst');
      this._flyQ('cheer', { gain: 0.45, at: 0.35 }, att);
      return false;
    }
    if (name === 'out' || name === 'fine') {
      if (pk >= 0.25) {   // 外野の大飛球を捕った: 攻める側の「あぁ〜」と、守る側の拍手
        this._flyEnd('sigh');
        this._flyQ('sigh', { gain: 0.3 + 0.45 * pk, at: 0.05 }, att);
        this._flyQ('applause', { gain: 0.3 + 0.35 * pk, at: 0.45, dur: 3.5 }, def);
        if (name === 'fine') return false;   // 自分のファインプレーは前からの大歓声も
        swell(1.2 + 0.3 * pk, 2.5); this.taikoT = Math.max(this.taikoT, 3);
        return true;
      }
      this._flyEnd('fade');   // 平凡なフライ: 小さく(守る側の軽い拍手だけ)
      if (name === 'fine') return false;
      swell(1.1, 2); this._flyQ('applause', { gain: 0.28, at: 0.3, dur: 2.5 }, def);
      return true;
    }
    if (name === 'foul') {
      const m = Math.max(pk, F.pred.k);
      if (m >= 0.25) {   // ファウルの大飛球: どよめいて、ため息
        this._flyEnd('sigh');
        swell(1.4 + 0.4 * m, 2.5);
        this._flyQ('stir', { gain: 0.25 + 0.4 * m });
        this._flyQ('sigh', { gain: 0.25 + 0.4 * m, at: 0.55 });
        return true;
      }
      this._flyEnd('fade'); return false;
    }
    // 外野に落ちた(長打・ヒット): 前からの歓声に、攻める側の拍手を足す
    if (pk >= 0.35) { this._flyEnd('burst'); this._flyQ('applause', { gain: 0.35 + 0.3 * pk, at: 0.9, dur: 4 }, att); }
    else this._flyEnd('fade');
    return false;
  }
  // コンコース・席の下にいる時のこもった音(0 = ふつう、1 = こもる)。球場の音(ざわめき・応援・歓声)と打球音に低い方だけ通す
  setMuffle(k) {
    if (!this.ctx || !this.ambBus) return;
    const c = this.ctx, t = c.currentTime;
    if (!this.muffleLp) {
      this.muffleLp = c.createBiquadFilter(); this.muffleLp.type = 'lowpass'; this.muffleLp.frequency.value = 20000; this.muffleLp.Q.value = 0.5;
      this.muffleG = c.createGain(); this.muffleG.gain.value = 1;
      this.ambBus.disconnect(); this.ambBus.connect(this.muffleLp); this.muffleLp.connect(this.muffleG); this.muffleG.connect(this.master);
      const bo = this.batOut(); if (this.batBus) { this.batBus.disconnect(); this.batBus.connect(this.muffleLp); if (this.batHall) this.batBus.connect(this.batHall); }
    }
    this.muffleK = k;
    // 1 = コンコース(650 Hz より上を削り 0.55 倍)、2 = 地面の高さの裏の部屋・通路(壁の向こう: 380 Hz・0.3 倍)
    this.muffleLp.frequency.setTargetAtTime(k >= 1.5 ? 380 : k > 0.5 ? 650 : 20000, t, 0.35);
    this.muffleG.gain.setTargetAtTime(k >= 1.5 ? 0.3 : k > 0.5 ? 0.55 : 1, t, 0.35);
    this._applyPlace();
  }
  // 場面で球場の大きさを変える(ピンチで静か、打球で上がる)
  mood(k = 1, sec = 0.8) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const L of Object.values(this.loops)) L.g.gain.setTargetAtTime(L.lv * k, t, sec);
  }

  // ------------------------------------------------ 打球・捕球
  // 当たりの質で打球音を変える: barrel (芯) / solid (普通) / jam (詰まり) / end (先っぽ) / tip (かすり) / grounder
  // 金属バットの「カキーン」「キーン」: 効果音ラボの金属バットの音を 0.4〜0.7 秒に短くした物(2026-11-18 0 時に作り直し。Eelke の版は「ポン」と聞こえたのでやめた)。
  // 打球音だけの通り道(batBus): 120 Hz より下を弱く削り、全体のリミッターを強く叩かない大きさにする。屋根の球場の長い響きへは少しだけ
  batOut() {
    const c = this.ctx;
    if (!this.batBus) {
      this.batHp = c.createBiquadFilter(); this.batHp.type = 'highpass'; this.batHp.frequency.value = 120; this.batHp.Q.value = 0.7;
      this.batBus = c.createGain(); this.batBus.gain.value = 0.8;
      this.batHp.connect(this.batBus); this.batBus.connect(this.master);
    }
    if (this.hall && !this.batHall) { this.batHall = c.createGain(); this.batHall.gain.value = 0.12; this.batBus.connect(this.batHall); this.batHall.connect(this.hall); }
    return this.batHp;
  }
  // 11/19 持ち主「打球音のあと変なポン!みたいな声」。録って調べた正体と直し(docs/音の引き継ぎ.md の 11/19 の節):
  //  ・詰まり・ポップ・バントの bat_jam_1〜3 は 3 つとも同じソフトボールの音で、273 Hz の低い「ポン」という鳴りが強い → 打球音から外した(短い金属音 bat_end に)
  //  ・bat_barrel_3 は「金属バットと歓声」の頭を切った物で、0.23 秒から歓声の声の出だしが入っていた。bat_barrel_1・solid_3・grounder_2 は 0.1〜0.3 秒に跳ね返りの「コッ」、solid_2・foul_1 は 0.2 秒に 2 つ目の当たり → 外した
  //  ・打った瞬間に、応援の拍子(和太鼓 band_hit_3/4 の「ドン」・吹奏楽の短い音・掛け声「ヘイ」)が重なることがあった → 打った瞬間から 1.4 秒は応援を止める(_contactQuiet)
  //  ・観戦の「打球音の 0.25 秒あとの『おお』」→ やめた(crowdEvent の watchMode)
  // 打球音は 1 つの素材の系統だけ: 高校野球(応援 hs)= 効果音ラボの金属バット(metal-bat2 の長さ違い)、プロ風(応援 pro)= 木のバットの「カッ」(Freesound CC0 martinimeniscus「Bat Hit 9」の頭 0.3 秒)
  hit(kind, strength = 1) {
    if (!this.ctx) return;
    const r = 1;   // 音の高さは変えない(変えると「ポン」と軽く聞こえる)
    const wood = this.cheerStyle === 'pro' && this.files('sfx', 'bat_wood').length > 0;
    const key = wood ? 'bat_wood' : { barrel: 'bat_barrel', solid: 'bat_solid', jam: 'bat_jam', end: 'bat_end', tip: 'bat_foul', foul: 'bat_foul', grounder: 'bat_grounder' }[kind] || 'bat_solid';
    const s = Math.max(0, Math.min(1, strength));
    let gain = { barrel: 0.95, solid: 0.7 + 0.2 * s, grounder: 0.65 + 0.2 * s, jam: 0.5 + 0.1 * s, end: 0.55 + 0.15 * s, tip: 0.45, foul: 0.45 }[kind] ?? 0.7;
    const dk = this.batDistK ?? 1;   // 観戦: 本塁から遠いほど小さく(watch.js が聞く人と本塁の距離から入れる)
    const o = { gain: gain * dk, rate: r, bus: this.batOut() };
    if (wood && (kind === 'tip' || kind === 'foul')) { o.gain *= 0.6; o.dur = 0.09; }
    else if (wood && (kind === 'jam' || kind === 'end')) { o.gain *= 0.75; o.dur = 0.16; }
    this.sfx(this.files('sfx', key).length ? key : 'bat_solid', o);
    if (kind !== 'tip' && kind !== 'foul') this._contactQuiet(1.4);
    if (kind === 'barrel') this.duck(0.6, 0.6);
  }
  // 打った瞬間から sec 秒は、応援の拍子(太鼓・吹奏楽・掛け声・手拍子)を鳴らさない。もう予約してある物も止める
  _contactQuiet(sec) {
    const c = this.ctx, t = c.currentTime;
    this._cheerQuietUntil = Math.max(this._cheerQuietUntil || 0, t + sec);
    for (const x of this._supSrc || []) {
      if (x.t >= t - 0.08 && x.t <= t + sec) { try { x.s.stop(); } catch (e) { } }
      else if (x.t < t - 0.08) { try { x.g.gain.setTargetAtTime(0, t, 0.06); x.s.stop(t + 0.4); } catch (e) { } }   // 鳴っている途中の拍は短く消す
    }
    this._supSrc = [];
    // ループの応援(ドラムライン・手拍子)も打った瞬間に引き、sec 秒後にゆっくり戻す
    const G = this.supBus.gain, base = this._supBase ?? G.value;
    G.cancelScheduledValues(t); G.setTargetAtTime(base * 0.15, t, 0.05); G.setTargetAtTime(base, t + sec, 0.6);
    if (this.log) this.log.push({ name: 'quiet', t: +t.toFixed(3) });
  }
  // 大勢の声を、頭を立てずにゆっくり立ち上げる(at 秒後から attack 秒かけて gain まで、len 秒で消える)
  rise(key, gain, at, attack, len) {
    if (!this.ready || !this.enabled || this.isSkipping()) return;
    const u = this.pick('amb', key); if (!u) return;
    const f = this.fill * this.timeK;
    const r = this.play(u, { gain: 0.0001, at, bus: this.ambBus }); if (!r) return;
    const t = this.ctx.currentTime + at, G = r.gain.gain, top = gain * f * this.gainOf(u);
    G.setValueAtTime(0.0001, t); G.linearRampToValueAtTime(top, t + attack); G.setTargetAtTime(0, t + Math.max(attack, len - 0.8), 0.4);
  }
  mitt(pos) { this.sfx('glove', { gain: 0.9, rate: 0.96 + Math.random() * 0.08, pos }); }
  mittMine() { this.sfx('glove', { gain: 1.4, rate: 0.93 + Math.random() * 0.04 }); }   // 11/22 夜 自分が捕った時の「パシッ」は大きく・少し低めに(グローブを出さずに捕った感じを強める)
  // 強い当たりの瞬間に周りのざわめきを少しだけ下げて、元に戻す(前は 12% まで落として 135% へ跳ね上げていて、「ドッ」と沸く爆発のように聞こえた)
  duck(depth = 0.6, back = 0.6) {
    if (!this.ambGain || !this.ctx) return;
    const g = this.ambGain.gain, t = this.ctx.currentTime, v = this.ambLevel || 0.5;
    g.cancelScheduledValues(t); g.setTargetAtTime(v * depth, t, 0.02); g.setTargetAtTime(v, t + 0.3, back * 0.5);
  }
  crowd(kind, strength = 1) {
    if (this.log) this.log.push({ name: 'crowd:' + kind });
    // 11/21 前の打席(play.js)は打った瞬間に crowd('hr' / 'ooh') を呼ぶ。打球が飛ぶ間の「おおーっ」と着いた時の反応は _flyTick がするので、ここでは鳴らさない
    if ((kind === 'hr' || kind === 'ooh') && !this._flyDirect) { const p = globalThis.__app && globalThis.__app.play; if (p && p.batted && p.batted.t === 0 && p.batted.label) return; }
    if (kind === 'ooh' || kind === 'sigh') { const u = this.pick('amb', 'sigh'); if (u) this.play(u, { gain: 0.5 + 0.4 * strength, dur: Math.min(3.2, this.buf[u].duration), bus: this.ambBus }); }
    else if (kind === 'cheer') { const u = this.pick('amb', 'cheer'); if (u) this.play(u, { gain: 0.45 + 0.45 * strength, bus: this.ambBus }); }
    else if (kind === 'big') { const u = this.pick('amb', 'cheer_big'); if (u) this.play(u, { gain: 0.6 + 0.4 * strength, bus: this.ambBus }); }
    else if (kind === 'applause') { const u = this.pick('amb', 'applause'); if (u) this.play(u, { gain: 0.5 + 0.4 * strength, dur: 4, bus: this.ambBus }); }
    else if (kind === 'band') { const u = this.pick('amb', 'band_hit'); if (u) this.play(u, { gain: 0.5 * strength, bus: this.ambBus }); }
    else if (kind === 'chime') { const u = this.pick('amb', 'pa_chime'); if (u) this.play(u, { gain: 0.35, bus: this.ambBus }); }
    else if (kind === 'hr') { this.roar(1); const u = this.pick('amb', 'applause'); if (u) this.play(u, { gain: 0.6, at: 2.5, bus: this.ambBus }); }
  }
  roar(strength = 1) {
    const u = this.pick('amb', 'cheer_big');
    const r = u ? this.play(u, { gain: 0.5 + 0.7 * strength, bus: this.ambBus }) : null;
    if (r && strength < 0.8) r.gain.gain.setTargetAtTime(0, this.ctx.currentTime + 1.5 + strength * 2, 0.8);
  }

  // ------------------------------------------------ 審判(その審判のいる所から聞こえる)
  call(key, pos) {
    if (this.log) this.log.push({ name: 'call:' + key });
    (this.clog || (this.clog = [])).push(key);
    const u = this.pick('call', key);
    if (u) this.play(u, { gain: 1, pos });
  }

  // ------------------------------------------------ 実況(短い言葉を順につなぐ。同じ言葉は続けない。打球音・歓声の邪魔をしない大きさ)
  // keys: キーの配列(左から順に)。opt.maxWait: これより遅れたら言わない(秒)。opt.cut: 前の待ちを捨てて今から
  // 実況の声の読み込み: キーごとに 1 つだけ音を用意しておき(22 kHz で解いてメモリを半分に)、言ったら次の言い回しを用意して前の物は捨てる。
  // 次の言い回しは、そのキーで直前に使った物(最大 4 つ)を避けて選ぶ。全部で 1,500 を超える声を、手元には 300 ほどだけ置く
  vFiles(key) { const m = this.man && this.man.voice && this.man.voice[key]; return [].concat(m || []).filter(Boolean); }
  async vLoad(u) {
    if (this.buf[u]) return this.buf[u];
    if (this.vLoading[u]) return this.vLoading[u];
    const p = (async () => {
      try {
        const ab = await (await fetch(u)).arrayBuffer();
        const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        let dc = this.ctx;
        try { if (OAC) dc = new OAC(1, 1, 22050); } catch (e) { dc = this.ctx; }
        const b = await new Promise((res, rej) => { const r = dc.decodeAudioData(ab, res, rej); if (r && r.catch) r.catch(rej); });
        this.buf[u] = b; return b;
      } catch (e) { return null; } finally { delete this.vLoading[u]; }
    })();
    this.vLoading[u] = p; return p;
  }
  vFill(key, avoid) {
    const l = this.vFiles(key); if (!l.length) return;
    const P = this.vPool[key] || (this.vPool[key] = { ready: null, recent: [] });
    if (P.ready && this.buf[P.ready] && P.ready !== avoid) return;
    const keep = Math.min(4, l.length - 1);
    let ok = l.filter((u) => u !== avoid && !P.recent.slice(-keep).includes(u));
    if (!ok.length) ok = l.filter((u) => u !== avoid);
    if (!ok.length) ok = l;
    const u = ok[Math.floor(Math.random() * ok.length)];
    P.ready = u;
    this.vLoad(u);
  }
  vPrime() {
    if (!this.man || !this.man.voice) return;
    this.vPool = this.vPool || {}; this.vLoading = this.vLoading || {};
    const keys = Object.keys(this.man.voice);
    let i = 0;
    const next = () => { if (i >= keys.length) return; const k = keys[i++]; this.vFill(k); const P = this.vPool[k]; Promise.resolve(P && P.ready && this.vLoading[P.ready]).then(next, next); };
    for (let n = 0; n < 4; n++) next();   // 4 本ずつ並べて読む
  }
  // 言う声を選ぶ: 用意してある物。まだ無ければ今あるそのキーの物(無ければ言わない)
  pickVoice(key) {
    this.vPool = this.vPool || {}; this.vLoading = this.vLoading || {};
    const P = this.vPool[key];
    let u = P && P.ready && this.buf[P.ready] ? P.ready : null;
    if (!u) { const have = this.vFiles(key).filter((x) => this.buf[x]); u = have.length ? have[Math.floor(Math.random() * have.length)] : null; }
    if (!u) { this.vFill(key); return null; }
    const Q = this.vPool[key] || (this.vPool[key] = { ready: null, recent: [] });
    Q.recent.push(u); if (Q.recent.length > 8) Q.recent.shift();
    return u;
  }
  vDone(key, u) {   // 言い終わったら(鳴らし始めたら)次の言い回しを用意し、言った物は手放す
    const P = this.vPool[key]; if (!P) return;
    if (P.recent[P.recent.length - 1] !== u) { P.recent.push(u); if (P.recent.length > 8) P.recent.shift(); }   // 言い回しを指定して言った物も「直前に使った」に数える
    if (P.ready === u) P.ready = null;
    this.vFill(key, u);
    if (this.vFiles(key).length > 1) setTimeout(() => { if (!this.vPool[key] || this.vPool[key].ready !== u) delete this.buf[u]; }, 8000);
  }
  voice(keys, opt = {}) {
    keys = [].concat(keys).filter(Boolean);
    if (!keys.length) return;
    const now = this.ctx ? this.ctx.currentTime : (performance.now() / 1000);
    if (opt.cut) this.vq.length = 0;
    for (const k0 of keys) {
      // 「pre_first#2」は、そのキーの 3 つ目の言い回しを言う(commentary.js が時間に収まる長さの物を選んだ時)
      // 「g_hard_SS#0,2,3」は、この中のどれか(打球の中身に合う言い回しだけ。11/21)。用意してある物が中にあればそれ、無ければ直前に使っていない物
      const hi = k0.indexOf('#'), k = hi < 0 ? k0 : k0.slice(0, hi), u = hi < 0 ? null : this.vPickOf(k, k0.slice(hi + 1).split(',').map(Number));
      if (k === this.lastVoice && !opt.allowRepeat) continue;
      this.vlog.push(k);
      this.lastVoice = k;
      if (this.voiceOn) this.vq.push({ k, u, at: now, after: now + (opt.delay || 0), maxWait: (opt.maxWait ?? 1.6) + (opt.delay || 0), gap: opt.gap ?? 0.06, until: opt.until, low: !!opt.low });
    }
    // 大事な言葉(low でない)が来たら、鳴っているつなぎ(low)はすぐ止めて先に言う
    if (!opt.low && this.vCur && this.vCur.low && this.ctx && this.vBusyUntil > this.ctx.currentTime) {
      try { const t = this.ctx.currentTime; this.vCur.gain.gain.setTargetAtTime(0, t, 0.02); this.vCur.src.stop(t + 0.08); } catch (e) { }
      this.vBusyUntil = this.ctx.currentTime + 0.06; this.vCur = null;
    }
    this.pumpVoice();
  }
  vPickOf(k, ix) {
    const l = this.vFiles(k), ok = ix.map((i) => l[i]).filter(Boolean);
    if (ok.length <= 1) return ok[0] || null;
    const P = this.vPool && this.vPool[k];
    const recent = (P && P.recent) || [];
    const fresh = ok.filter((x) => !recent.slice(-Math.min(4, ok.length - 1)).includes(x));
    if (P && P.ready && fresh.includes(P.ready) && this.buf[P.ready]) return P.ready;
    const loaded = fresh.filter((x) => this.buf[x]);
    if (loaded.length) return loaded[Math.floor(Math.random() * loaded.length)];
    const pool = fresh.length ? fresh : ok;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  hasVoice(k) { return this.vFiles(k).length > 0; }
  // この時刻(ctx の秒)に、鳴っている実況を止め、待っている実況を捨てる(次の打球の打つ瞬間に声を残さない)
  voiceStopAt(t) {
    if (!this.ctx) return;
    this.vq.length = 0;
    if (this.vCur && this.vBusyUntil > t) {
      try { const g = this.vCur.gain.gain; g.setValueAtTime(g.value, Math.max(this.ctx.currentTime, t - 0.08)); g.linearRampToValueAtTime(0, Math.max(this.ctx.currentTime, t)); this.vCur.src.stop(Math.max(this.ctx.currentTime, t) + 0.02); } catch (e) { }
      this.vBusyUntil = t;
    }
  }
  pumpVoice() {
    if (!this.ready || !this.enabled || !this.voiceOn) { this.vq.length = 0; return; }
    const c = this.ctx;
    while (this.vq.length) {
      const it = this.vq[0];
      const start = Math.max(c.currentTime, this.vBusyUntil + it.gap, it.after || 0);   // after: 打球音の直後に入る時の小さな間
      if (start - it.at > it.maxWait) { this.vq.shift(); continue; }   // 古くなった言葉は捨てる
      if (start > c.currentTime + 0.05) { clearTimeout(this.vTimer); this.vTimer = setTimeout(() => this.pumpVoice(), (start - c.currentTime) * 1000 - 20); return; }
      if (it.u && !this.buf[it.u]) {   // 選んだ言い回しを読み終わるまで待つ(待ちすぎたら上で捨てる。読めなければそのキーのほかの言い回し)
        this.vLoading = this.vLoading || {};
        if (!it.loading) { it.loading = true; this.vLoad(it.u).then((bf) => { if (!bf) it.u = null; this.pumpVoice(); }); }
        return;
      }
      this.vq.shift();
      const u = it.u || this.pickVoice(it.k);
      if (!u) continue;
      if (it.until != null && start + this.buf[u].duration > it.until) continue;   // 打つ前に言い終わらない物は言わない(打った瞬間に声を重ねない)
      const r = this.play(u, { gain: 1, bus: this.voiceBus });
      this.vDone(it.k, u);
      if (r) {
        this.vCur = { ...r, low: it.low };
        this.vBusyUntil = c.currentTime + r.dur;
        // 実況の間、球場の音を少し下げる
        this.ambBus.gain.cancelScheduledValues(c.currentTime);
        this.ambBus.gain.setTargetAtTime(this.levels.amb * 0.72, c.currentTime, 0.08);
        this.ambBus.gain.setTargetAtTime(this.levels.amb, c.currentTime + r.dur, 0.35);
      }
    }
  }
}
