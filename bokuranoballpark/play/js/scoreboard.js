// 球場の中のスコアボード(浜風の球場 = r8 の板の面 r7_scoreboard_face、屋根の球場 = dome_r9 のメインビジョン sign_scoreboard)。
// GLB に貼ってあった固定の絵を CanvasTexture に替え、遊びの状態から描き直す(中身が変わった時だけ)。
// 試合の状態は左上の点数板(ui.board)と同じ物を読む。ui.board / ui.digest を包んで、渡された物を覗くだけ(書き換えない)。
// 光源は足さない。面の材質の発光(emissiveMap)に同じ絵を入れて、夜も光って見えるようにする。
// 引き継ぎ: docs/スコアボードの引き継ぎ.md
import { POS_LABEL } from './rules.js';

// 打順(架空のチームの決まった並び)。番号は守備の番号(1 投手 … 9 右翼)
const ORDER = ['CF', '2B', 'SS', '1B', '3B', 'RF', 'LF', 'C', 'P'];   // 1 番 中堅 … 9 番 投手
const POS_KANA = { P: 'ピッチャー', C: 'キャッチャー', '1B': 'ファースト', '2B': 'セカンド', '3B': 'サード', SS: 'ショート', LF: 'レフト', CF: 'センター', RF: 'ライト' };
const FONT = "'Yu Gothic UI','Yu Gothic','Meiryo','Noto Sans JP','Hiragino Sans',sans-serif";
// 打席の結果の言葉(rules.js の resolveBIP / applyPitch と defense.js の場面の言葉)
const RE_HIT = /ヒット|安打|二塁打|三塁打|本塁打|ホームラン|ツーベース|ポテン/;
const RE_ERR = /エラー|失策/;
const RE_PA_END = /三振|四球|死球|ヒット|安打|二塁打|三塁打|本塁打|ホームラン|ツーベース|ポテン|ゴロ|フライ|ライナー|飛球|エラー|振り逃げ|併殺|犠|バント/;
// 時間帯ごとの試合の時刻(時計はここから、遊び始めてからの本当の経過で進む)
const CLOCK_BASE = { day: 13 * 60, night: 19 * 60 };

export class Scoreboard {
  constructor({ THREE, scene, stadium, getMode, getDefense, getPlay, getTime, getUI }) {
    Object.assign(this, { THREE, scene, stadium, getMode, getDefense, getPlay, getTime, getUI });
    this.faces = [];
    this.key = null;
    this.live = null;      // 左上の点数板に最後に渡された状態(ui.board の g)
    this.dgSeen = new WeakMap();
    this.trk = null;       // 試合ごとの数え(安打・失策・打者)
    this.clock0 = performance.now();
    this.lastEval = null;
  }
  // GLB を読んだ後に 1 回。得点板・画面の面を材質の名前で探して、自分の絵(CanvasTexture)を貼る(11/20 9 球場。模型の版が上がっても名前で当たる)
  // 当てる材質: 名前に scoreboard / score の付く物、main_vision・sub_vision・vision_fictional、screen_fiction(白樺)。枠・裏・暗い板(dark/frame/back)は外す
  // 球場ごとに画面の UV の付け方がばらばら(看板と 1 枚の絵を分け合う・90 度回っている・左右が反対・曲面を何枚もの板で作る)なので、
  // UV は使わずに作り直す: 三角を「つながった画面」ごとにまとめ、画面の向き(球場の中から見て右・上)に沿って、絵の上のその画面の帯へ貼り直す。
  // 材質と形は複製して差し替える(同じ材質・形を使うほかの看板は変えない)
  attach(root) {
    const THREE = this.THREE;
    const RE = /(^|_)(scoreboard|score)(_|$)|main_vision|sub_vision|vision_fictional|^screen_fiction$|^screen_(sub)?vision$/i;   // screen_vision・screen_subvision は森かげ(11/20)
    const byMat = new Map();
    root.traverse((o) => {
      if (!o.isMesh || !o.material || Array.isArray(o.material) || o.userData.sbDone) return;
      const m = o.material;
      if (!RE.test(m.name || '') || /dark|frame|back|blank/i.test(m.name || '')) return;
      if (!byMat.has(m)) byMat.set(m, []);
      byMat.get(m).push(o);
    });
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    for (const [m, meshes] of byMat) {
      // 三角を集める(世界の座標)
      const tris = [];
      for (const o of meshes) {
        o.updateMatrixWorld(true);
        const P = o.geometry.attributes.position, I = o.geometry.index, n = I ? I.count : P.count;
        for (let t = 0; t < n; t += 3) {
          const ids = [0, 1, 2].map((k) => (I ? I.getX(t + k) : t + k));
          const p = ids.map((id) => V(P.getX(id), P.getY(id), P.getZ(id)).applyMatrix4(o.matrixWorld));
          const nrm = p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0]));
          const area = nrm.length(); if (area < 1e-6) continue;
          tris.push({ o, ids, p, area: area / 2, n: nrm.normalize(), c: p[0].clone().add(p[1]).add(p[2]).multiplyScalar(1 / 3), cl: -1 });
        }
      }
      if (!tris.length) continue;
      // つながった画面ごとにまとめる(近い三角を順につなぐ。向きが大きく違う物は別の画面)
      const clusters = [];
      for (const t of tris) {
        if (t.cl >= 0) continue;
        const C = { tris: [t] }; t.cl = clusters.length; clusters.push(C);
        for (let q = 0; q < C.tris.length; q++) {
          const a = C.tris[q];
          for (const b of tris) {
            if (b.cl >= 0 || Math.abs(a.n.dot(b.n)) < 0.15) continue;   // 折れ曲がった画面(観覧車の丘のビジョン)も 1 枚にまとめる
            // 頂点が近い(辺や角を分け合う)三角は同じ画面
            let near = false; for (const p of a.p) { for (const q of b.p) if (p.distanceToSquared(q) < 2.25) { near = true; break; } if (near) break; }
            if (near) { b.cl = t.cl; C.tris.push(b); }
          }
        }
      }
      // 画面の向き: 球場の中(本塁と二塁の間あたり)を向く面の法線。右 = 見る人の右、上 = 世界の上
      const strips = [];
      for (const C of clusters) {
        const c = V(0, 0, 0), n = V(0, 0, 0);
        const ref = C.tris.reduce((x, y) => (y.area > x.area ? y : x));   // 一番大きい三角の向きを基準に、面積の重みで平均
        for (const t of C.tris) { c.add(t.c); n.add(t.n.clone().multiplyScalar(t.area * (t.n.dot(ref.n) >= 0 ? 1 : -1))); }
        c.multiplyScalar(1 / C.tris.length); n.y = 0; if (n.lengthSq() < 1e-6) continue; n.normalize();
        const field = V(0, c.y, -40).sub(c); if (n.dot(field) < 0) n.negate();
        const right = n.clone().negate().cross(V(0, 1, 0)).normalize();
        let r0 = 1e9, r1 = -1e9, h0 = 1e9, h1 = -1e9;
        for (const t of C.tris) for (const p of t.p) { const r = p.clone().sub(c).dot(right), h = p.y; r0 = Math.min(r0, r); r1 = Math.max(r1, r); h0 = Math.min(h0, h); h1 = Math.max(h1, h); }
        const wr = r1 - r0, hr = h1 - h0;
        if (wr < 1 || hr < 0.5) continue;
        strips.push({ C, c, n, right, r0, wr, h1, hr, area: wr * hr });
      }
      if (!strips.length) continue;
      // 絵: 横 2048、画面ごとの帯を縦に積む(帯の高さは画面の縦横の比のまま。合わせて 4096 を越えたら縮める)
      const CW = 2048;
      let tot = 0; for (const s of strips) { s.ph = Math.max(160, Math.round(CW * s.hr / s.wr)); tot += s.ph; }
      const kH = Math.min(1, 4096 / tot); let y = 0;
      for (const s of strips) { s.ph = Math.floor(s.ph * kH); s.y = y; y += s.ph; }
      const CH = Math.max(64, y);
      const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
      const g = cv.getContext('2d'); g.fillStyle = '#05080a'; g.fillRect(0, 0, CW, CH);
      const tex = new THREE.CanvasTexture(cv);
      tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
      const mat = m.clone(); mat.name = m.name + '_sb';
      mat.map = tex; mat.emissiveMap = tex; mat.emissive = new THREE.Color(1, 1, 1);
      mat.emissiveIntensity = Math.max(1.5, m.emissiveIntensity || 0); mat.color = new THREE.Color(1, 1, 1); mat.toneMapped = true;
      mat.side = THREE.FrontSide;   // 裏(球場の外・コンコース側)からは見せない(裏から見ると鏡文字になるので)
      // 形を複製して UV を書き直す(三角ごとに頂点を分ける: 画面の境で UV が飛ばないように)
      const per = new Map();
      for (const s of strips) for (const t of s.C.tris) {
        if (t.n.dot(V(0, t.c.y, -40).sub(t.c)) < 0) continue;   // 11/19 グラウンドと逆を向いた面(画面の裏)に絵を貼ると、外から見て鏡文字になる(海鳴り)。裏は貼らない
        if (!per.has(t.o)) per.set(t.o, { pos: [], uv: [], nor: [] });
        const e = per.get(t.o), inv = t.o.matrixWorld.clone().invert();
        // 三角の表(巻きの向き)を球場の中へ向ける。表から見て字が正しく読める(看板の向きの試験 adcheck・adfix と同じ決まり)
        const pts = t.n.dot(s.n) >= 0 ? t.p : [t.p[0], t.p[2], t.p[1]];
        for (const p of pts) {
          const lp = p.clone().applyMatrix4(inv); e.pos.push(lp.x, lp.y, lp.z);
          const u = (p.clone().sub(s.c).dot(s.right) - s.r0) / s.wr, vv = (s.h1 - p.y) / s.hr;
          e.uv.push(u, (s.y + vv * s.ph) / CH);
        }
        const ln = s.n.clone().transformDirection(inv); for (let k = 0; k < 3; k++) e.nor.push(ln.x, ln.y, ln.z);
      }
      for (const [o, e] of per) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(e.pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(e.nor, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(e.uv, 2));
        geo.computeBoundingSphere(); geo.computeBoundingBox();
        o.geometry = geo; o.material = mat; o.userData.sbDone = true;
      }
      const rects = strips.map((s) => ({ x: 0, y: s.y, w: CW, h: s.ph }));
      // 縦に細長い切れ端(折れた画面の脇の面)は暗いまま(中身を詰め込むと読めない)
      const kinds = rects.map((r) => { const A = r.w / r.h; return A < 0.8 ? 'blank' : A >= 4.6 ? 'ribbon' : A >= 2.9 ? 'board' : 'vision'; });
      this.faces.push({ kind: kinds[0], kinds, rects, mat, cv, g, base: null, tex, mesh: meshes[0], meshes, size: strips.map((s) => [+s.wr.toFixed(1), +s.hr.toFixed(1)]) });
    }
    this.key = null;
    return this.faces.length;
  }
  // ui.board / ui.digest を包む(中身は今までどおり。渡された状態を覗くだけ)
  wrapUI(ui) {
    const self = this;
    const ob = ui.board.bind(ui), od = ui.digest.bind(ui);
    ui.board = function (g) { try { if (g) self.live = { ...g, score: { ...g.score }, bases: (g.bases || []).slice() }; self.scanLog(); } catch (e) { /* 板が無くても遊べる */ } return ob(g); };
    ui.digest = function (s, lines) {
      try {
        const d = self.getDefense();
        if (s) {
          self.live = { ...s, score: { ...s.score }, bases: s.bases.slice() };
          if (d && d.dg) self.readDigest(d.dg, lines ? lines.length : 0);
        } else if (self.lastDg) self.readDigest(self.lastDg, Infinity);
      } catch (e) { /* 同上 */ }
      return od(s, lines);
    };
    addEventListener('defense-eval', (e) => { this.lastEval = e.detail; });
  }
  // 試合ごとの数え直し
  track() {
    const d = this.getDefense();
    const g = d && d.kind === 'game' ? d.g : null;
    if (!g) return null;
    if (!this.trk || this.trk.g !== g) this.trk = { g, logN: 0, H: { them: 0, us: 0 }, E: { them: 0, us: 0 }, themPA: 0, halfQ: [], halfSeen: new WeakSet() };
    // 後攻の攻撃(rules.js の simulateHalf)の打席の言葉 g.halfEvents。早送りで「N回裏」を見せた時に数える
    const he = g.halfEvents;
    if (he && !this.trk.halfSeen.has(he)) { this.trk.halfSeen.add(he); this.trk.halfQ.push(he); }
    return this.trk;
  }
  // 早送り(digest)の出来事の言葉: 表(相手の攻撃)の打席の結果から 先攻の安打・打者・後攻の失策を数える
  readDigest(dg, upto) {
    const t = this.track(); if (!t) return;
    this.lastDg = dg;
    let n = this.dgSeen.get(dg) || 0;
    const end = Math.min(dg.ev.length, upto);
    for (; n < end; n++) {
      const e = dg.ev[n]; if (!e || !e.t || !e.s) continue;
      const txt = e.t;
      if (/^\d+回裏/.test(txt)) {   // 後攻の攻撃: 自分の安打・相手の失策
        const hv = t.halfQ.shift() || [];
        for (const x of hv) { const l = x.split('・').pop(); if (RE_HIT.test(l)) t.H.us++; if (RE_ERR.test(l)) t.E.them++; }
        continue;
      }
      if (e.s.half !== 'top') continue;
      if (/^\d+回(表|裏)|スリーアウト|試合終了|プレイボール/.test(txt)) continue;
      // 1 つの言葉に 盗塁・暴投 などと打席の結果が「・」でつながっている
      const last = txt.split('・').pop();
      if (RE_PA_END.test(last)) t.themPA++;
      if (RE_HIT.test(last)) t.H.them++;
      if (RE_ERR.test(last)) t.E.us++;
    }
    this.dgSeen.set(dg, n);
    if (n >= dg.ev.length) this.lastDg = null;
  }
  // 自分が守った場面の結果(defense.js の applyResult が g.log に足す言葉)
  scanLog() {
    const t = this.track(); if (!t) return;
    const g = t.g, d = this.getDefense();
    while (t.logN < g.log.length) {
      const txt = g.log[t.logN++];
      if (txt === 'ファウル') continue;
      const pl = d.play;
      if (pl && pl.steal) continue;
      if (/三振/.test(txt)) { t.themPA++; continue; }
      t.themPA++;
      const br = d.batterRunner;
      const ev = this.lastEval; this.lastEval = null;
      if (txt === 'ホームラン') { t.H.them++; continue; }
      if (br && !br.out) {
        if (ev && ev.kind === 'miss' && /捕球|悪送球/.test(ev.text || '')) t.E.us++;
        else t.H.them++;
      }
    }
  }

  // ---------------------------------------------------------------- 毎こま(描き直しは中身が変わった時だけ)
  update() {
    if (!this.faces.length) return;
    const now = performance.now();
    if (this._t && now - this._t < 120) return;
    this._t = now;
    try { this.scanLog(); } catch (e) { /* */ }
    const st = this.state();
    const key = JSON.stringify(st);
    if (key === this.key) return;
    this.key = key;
    for (const f of this.faces) {
      const g = f.g;
      g.setTransform(1, 0, 0, 1, 0, 0);
      f.rects.forEach((r, i) => {
        const kind = f.kinds[i];
        if (kind === 'blank') { g.fillStyle = '#05080a'; g.fillRect(r.x, r.y, r.w, r.h); return; }
        const [DW, DH] = kind === 'board' ? [2048, 572] : kind === 'ribbon' ? [2048, Math.round(2048 * r.h / r.w)] : [1672, 941];
        g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
        g.fillStyle = '#05080a'; g.fillRect(r.x, r.y, r.w, r.h);
        const sc = Math.min(r.w / DW, r.h / DH);
        g.translate(r.x + (r.w - DW * sc) / 2, r.y + (r.h - DH * sc) / 2); g.scale(sc, sc);
        if (kind === 'board') this.drawBoard(g, DW, DH, st); else if (kind === 'ribbon') this.drawRibbon(g, DW, DH, st); else this.drawVision(g, DW, DH, st, { lineup: /fictional/.test(f.mat.name) });
        g.restore();
      });
      f.tex.needsUpdate = true;
    }
  }
  clock() {
    const base = CLOCK_BASE[this.getTime()] ?? CLOCK_BASE.day;
    const m = Math.floor(base + (performance.now() - this.clock0) / 60000) % 1440;
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  }
  // 歩く時の「本日の試合」の開始の時刻(架空。時計より少し後)
  startTime() { return { day: '13:30', night: '19:30' }[this.getTime()] || '13:30'; }
  // 板に出す中身(描く物だけ。これが変わったら描き直す)
  state() {
    const mode = this.getMode(), d = this.getDefense(), p = this.getPlay();
    const st = { clock: this.clock() };
    if (mode === 'defense' && d && d.kind === 'game' && d.g) {
      const g = d.g, t = this.track();
      const over = g.over && !d.dg;   // 早送りで最後の場面を見せている間は、点数板と同じ途中の状態
      const L = over ? g : (this.live || g);   // 試合が終わったら最後の状態
      st.kind = 'game';
      const inn = L.inning, half = L.half;
      const sum = (a, n) => { let s = 0; for (let i = 0; i < n; i++) s += a[i] || 0; return s; };
      const them = [], us = [];
      for (let i = 0; i < inn - 1; i++) { them[i] = g.line.them[i] ?? 0; us[i] = g.line.us[i] ?? 0; }
      them[inn - 1] = L.score.them - sum(g.line.them, inn - 1);
      if (half !== 'top') us[inn - 1] = L.score.us - sum(g.line.us, inn - 1);
      // 9 回以降の表で試合が終わった(後攻が勝っていて裏をしない)時は ×
      if (over && half === 'top' && inn >= 9 && L.score.us > L.score.them) us[inn - 1] = 'X';
      // サヨナラ: 後攻が裏で勝ち越して終わった回は、点の後ろに x(本物の板と同じ)
      if (over && half !== 'top' && inn >= 9 && L.score.us > L.score.them && typeof us[inn - 1] === 'number') us[inn - 1] = `${us[inn - 1]}x`;
      // 球速: 試合の投球には速さの数が無いので、投げた球ごとに高校野球らしい速さ(128〜144 km/h)を決めて、次の球まで出しておく
      const pl = d.play;
      if (pl && !pl.steal && pl.contactT != null && pl.t >= pl.contactT - 0.45) {
        const id = `${g.pa}-${L.balls || 0}-${L.strikes || 0}-${L.outs || 0}-${inn}${half}`;
        if (id !== this._kmhId) { this._kmhId = id; let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 9973; this._kmh = 128 + h % 17; }
      }
      if (half !== 'top' || over) this._kmh = null;
      Object.assign(st, { inn, half, them, us, R: [L.score.them, L.score.us], H: [t.H.them, t.H.us], E: [t.E.them, t.E.us],
        b: L.balls || 0, s: L.strikes || 0, o: Math.min(3, L.outs || 0), bases: (L.bases || []).map(Boolean), my: d.my,
        bat: half === 'top' ? t.themPA % 9 : -1, batN: Math.floor(t.themPA / 9) + 1, over, kmh: this._kmh ?? null,
        blink: over ? 0 : Math.floor(performance.now() / 600) % 2 });   // 攻撃中の今の回の欄を点滅させる(0.6 秒ごと)
    } else if (mode === 'defense' && d && d.kind === 'knock' && d.knock) {
      const k = d.knock, L = this.live || d.g || {};
      st.kind = 'knock';
      Object.assign(st, { n: Math.min(k.n + (d.play ? 1 : 0), k.N), N: k.N, caught: d.stats.caught, star: d.play && d.play.star ? d.play.star : 0,
        o: Math.min(3, L.outs || 0), bases: (L.bases || [false, false, false]).map(Boolean), my: d.my });
    } else if (mode === 'bat' && p) {
      const s = p.stats;
      st.kind = 'bat';
      Object.assign(st, { pitches: s.pitches, swings: s.swings, hr: s.hr, best: Math.round(s.best || 0), ev: Math.round(s.bestEv || 0), kmh: p.pitch && p.pitch.kmh ? Math.round(p.pitch.kmh) : null });
    } else if (mode === 'pitch' && p) {
      const m = p.mstats;
      st.kind = 'mound';
      Object.assign(st, { n: m.n, strikes: m.strikes, best: Math.round(m.best || 0), kmh: p.lastThrow ? Math.round(p.lastThrow.kmh) : null });
    } else st.kind = 'walk';
    return st;
  }

  // ---------------------------------------------------------------- 浜風の球場の板(横 29.8 m × 縦 8.3 m、絵は 2048 × 572)
  // 並びは本物の甲子園の板に合わせる: 左に先攻・後攻の校名、1〜12 回と 計・H・E、右に球速。下の段に B・S・O のランプ、両チームの打順、時計
  drawBoard(g, W, H, st) {
    g.fillStyle = '#05080a'; g.fillRect(0, 0, W, H);
    const txt = (s, x, y, size, col, align = 'center', w = 900) => { g.font = `${w} ${size}px ${FONT}`; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(String(s), x, y); };
    const cell = (x, y, w, h, col) => { g.fillStyle = col || '#0c1412'; g.fillRect(x + 3, y + 3, w - 6, h - 6); };
    const lamp = (x, y, r, on, col) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = on ? col : '#1b2321'; g.fill(); if (on) { g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,.35)'; g.stroke(); } };
    const WH = '#f4f6f2', YL = '#ffc93a', GR = '#9fb2ac';
    // 上の段: 回の見出し・2 チームの行
    const X0 = 300, CW = 82, NC = 12, XT = X0 + CW * NC + 26, TW = 100;
    const yH = 34, yA = 128, yB = 262, RH = 124;
    g.fillStyle = '#0a1110'; g.fillRect(0, 0, W, 332);
    if (st.kind === 'game') {
      // 攻撃中のチームの行は背景を少し明るく(本物の板の攻撃中の表示)
      if (!st.over) { g.fillStyle = '#1c2b26'; g.fillRect(0, (st.half === 'top' ? yA : yB) - RH / 2, W - 360, RH); }
      const first = Math.max(1, st.inn - NC + 1);   // 延長で 12 回を越えたら、見える回をずらす
      for (let i = 0; i < NC; i++) {
        const n = first + i, x = X0 + CW * i + CW / 2;
        const cur = n === st.inn;
        txt(n, x, yH, 44, cur ? YL : GR, 'center', 700);
        const live = cur && !st.over, aOn = live && st.half === 'top', bOn = live && st.half !== 'top';
        cell(X0 + CW * i, yA - RH / 2, CW, RH, aOn ? (st.blink ? '#4a3e0e' : '#2a2610') : null); cell(X0 + CW * i, yB - RH / 2, CW, RH, bOn ? (st.blink ? '#4a3e0e' : '#2a2610') : null);
        const a = st.them[n - 1], b = st.us[n - 1];
        if (a != null) txt(a, x, yA + 4, 108, aOn ? (st.blink ? '#fff2a0' : YL) : WH);
        if (b != null) txt(b, x, yB + 4, 108, bOn ? (st.blink ? '#fff2a0' : YL) : WH);
      }
      ['計', 'H', 'E'].forEach((h, i) => {
        const x = XT + TW * i + TW / 2;
        txt(h, x, yH, 44, GR, 'center', 700);
        cell(XT + TW * i, yA - RH / 2, TW, RH); cell(XT + TW * i, yB - RH / 2, TW, RH);
        const v = [st.R, st.H, st.E][i];
        txt(v[0], x, yA + 4, 108, YL); txt(v[1], x, yB + 4, 108, YL);
      });
      // 攻撃中のチームの印
      const atk = st.over ? null : st.half === 'top' ? 'a' : 'b', DIM = '#6f7c78';
      txt('相手', 30, yA + 4, 96, atk === 'b' ? DIM : WH, 'left'); txt('自分', 30, yB + 4, 96, atk === 'a' ? DIM : WH, 'left');
      lamp(262, yA, 22, atk === 'a', '#ff5a2a'); lamp(262, yB, 22, atk === 'b', '#ff5a2a');   // チーム名の横の攻撃中のランプ
    } else {
      this.boardBanner(g, st, txt, W);
    }
    // 右上: 球速
    txt('P 球速', 1690, 50, 44, GR, 'left', 700);
    txt(st.kmh != null ? st.kmh : '---', 1880, 170, 150, st.kmh != null ? YL : '#2a3532', 'right');
    txt('km/h', 1892, 196, 44, GR, 'left', 700);
    // 下の段
    g.fillStyle = '#05080a'; g.fillRect(0, 336, W, H - 336);
    const b = st.b || 0, s = st.s || 0, o = st.o || 0;
    const yL = [384, 460, 536];
    [['B', 3, b, '#3fe36a'], ['S', 2, s, '#ffcf2e'], ['O', 2, o, '#ff4a3a']].forEach(([lab, n, v, col], r) => {
      txt(lab, 46, yL[r] + 2, 70, WH);
      for (let i = 0; i < n; i++) lamp(130 + i * 78, yL[r], 30, i < v, col);
    });
    // 走者(塁のランプ)
    const bx = 470, by = 456, bs = 46, bases = st.bases || [false, false, false];
    const dia = (x, y, on) => { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = on ? '#ffd54a' : '#1b2321'; g.fillRect(-bs / 2, -bs / 2, bs, bs); g.restore(); };
    dia(bx + 64, by, bases[0]); dia(bx, by - 64, bases[1]); dia(bx - 64, by, bases[2]);
    g.save(); g.translate(bx, by + 66); g.rotate(Math.PI / 4); g.fillStyle = '#56625e'; g.fillRect(-16, -16, 32, 32); g.restore();
    // 打者の欄(本物の板は両チームの打順 9 人ずつを並べるが、遠くから読めないので、今の打者を大きく出す。名前は出さない)
    if (st.kind === 'game') {
      txt('打者', 640, 372, 34, GR, 'left', 700);
      if (st.over) txt(`試合終了  ${st.R[0]} - ${st.R[1]}`, 640, 470, 100, YL, 'left');
      else if (st.bat >= 0) {
        const k = ORDER[st.bat];
        txt(`${st.bat + 1}`, 700, 470, 130, YL, 'center');
        txt(`番  ${POS_LABEL[k]}`, 760, 476, 96, WH, 'left');
        txt('相手', 1150, 476, 80, GR, 'left', 700);
        txt(`第${st.batN}打席`, 1600, 476, 72, WH, 'right', 700);
      } else txt('自分の攻撃', 640, 470, 96, WH, 'left');
      txt(`守備  ${POS_LABEL[st.my] || ''}(あなた)`, 640, 548, 34, GR, 'left', 700);
    } else if (st.kind === 'knock') {
      txt('守備', 640, 372, 34, GR, 'left', 700);
      txt(`${POS_LABEL[st.my] || ''}`, 640, 470, 110, WH, 'left');
      txt(st.star ? '★'.repeat(st.star) + '☆'.repeat(3 - st.star) : '', 1050, 470, 90, YL, 'left');
    }
    // 時計
    txt(st.clock, 1990, 476, 128, WH, 'right');
    txt('時刻', 1700, 400, 34, GR, 'left', 700);
  }
  // 試合以外の時の上の段(ノック・打席・マウンド・歩く)
  boardBanner(g, st, txt, W) {
    const WH = '#f4f6f2', YL = '#ffc93a', GR = '#9fb2ac';
    if (st.kind === 'knock') {
      txt('ノック', 40, 110, 104, WH, 'left');
      txt(`${st.n}`, 640, 110, 150, YL, 'right'); txt(`/ ${st.N} 本目`, 660, 128, 64, WH, 'left');
      txt('成功', 40, 252, 84, WH, 'left'); txt(`${st.caught}`, 640, 252, 130, YL, 'right');
      txt(`守備 ${POS_LABEL[st.my] || ''}`, 1040, 110, 84, WH, 'left');
    } else if (st.kind === 'bat') {
      txt('打撃練習', 40, 110, 104, WH, 'left');
      txt(`球数 ${st.pitches}`, 700, 110, 84, WH, 'left'); txt(`振った ${st.swings}`, 1150, 110, 84, WH, 'left');
      txt('本塁打', 40, 252, 84, WH, 'left'); txt(st.hr, 520, 252, 130, YL, 'right');
      txt(`最長 ${st.best || '—'} m`, 700, 252, 80, WH, 'left'); txt(`打球 ${st.ev || '—'} km/h`, 1150, 252, 80, WH, 'left');
    } else if (st.kind === 'mound') {
      txt('投球練習', 40, 110, 104, WH, 'left');
      txt(`投げた ${st.n}`, 700, 110, 84, WH, 'left'); txt(`ストライク ${st.strikes}`, 1100, 110, 84, WH, 'left');
      txt('最速', 40, 252, 84, WH, 'left'); txt(st.best || '—', 520, 252, 130, YL, 'right'); txt('km/h', 540, 270, 50, GR, 'left', 700);
    } else {
      txt('本日の試合', 40, 100, 96, WH, 'left');
      txt('第1試合', 640, 100, 80, YL, 'left');
      txt('相手 ー 自分', 40, 250, 104, WH, 'left');
      txt(`${this.startTime()} 試合開始`, 860, 250, 84, YL, 'left');
    }
  }

  // ---------------------------------------------------------------- 細長い画面(汽笛ヶ原・潮凪・白樺・銀輪のメインビジョンなど。横 2048 × 縦 H)
  // 本物の細長い画面の並び: 左に 2 チームの行と回ごとの点・R H E、右に B S O と打者・球速・時計
  drawRibbon(g, W, H, st) {
    const k = H / 386, FS = (n) => Math.round(n * k);
    const txt = (s, x, y, size, col, align = 'center', w = 900) => { g.font = `${w} ${Math.max(10, size)}px ${FONT}`; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(String(s), x, y); };
    const lamp = (x, y, r, on, col) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = on ? col : '#1b2321'; g.fill(); };
    const WH = '#f4f6f2', YL = '#ffc93a', GR = '#9fb2ac';
    g.fillStyle = '#05080a'; g.fillRect(0, 0, W, H);
    const h0 = H * 0.24, rh = (H - h0) / 2, yA = h0 + rh / 2, yB = h0 + rh * 1.5;
    const NX = 0.012 * W, X0 = 0.125 * W, CW = 0.044 * W, NC = 9, XR = X0 + CW * NC + 0.01 * W, RW = 0.05 * W;
    const XS = XR + RW * 3 + 0.02 * W;   // 右の区画
    g.fillStyle = '#0d1614'; g.fillRect(0, h0, XS - 0.01 * W, H - h0);
    if (st.kind === 'game') {
      const atk = st.over ? null : st.half === 'top' ? 'a' : 'b';
      if (atk) { g.fillStyle = '#1c2b26'; g.fillRect(0, atk === 'a' ? h0 : h0 + rh, XS - 0.01 * W, rh); }
      const nf = Math.min(FS(110), (X0 - NX - 0.01 * W) / 2.1);
      txt('相手', NX, yA, nf, atk === 'b' ? '#6f7c78' : WH, 'left'); txt('自分', NX, yB, nf, atk === 'a' ? '#6f7c78' : WH, 'left');
      const first = Math.max(1, st.inn - NC + 1);
      for (let i = 0; i < NC; i++) {
        const n = first + i, x = X0 + CW * i + CW / 2, cur = n === st.inn && !st.over;
        txt(n, x, h0 / 2, FS(64), cur ? YL : GR, 'center', 700);
        const a = st.them[n - 1], b = st.us[n - 1];
        const aOn = cur && st.half === 'top', bOn = cur && st.half !== 'top';
        if (aOn || bOn) { g.fillStyle = st.blink ? '#4a3e0e' : '#2a2610'; g.fillRect(X0 + CW * i + 2, aOn ? h0 + 2 : h0 + rh + 2, CW - 4, rh - 4); }
        if (a != null) txt(a, x, yA, FS(128), aOn ? YL : WH);
        if (b != null) txt(b, x, yB, FS(String(b).length > 1 ? 104 : 128), bOn ? YL : WH);
      }
      ['R', 'H', 'E'].forEach((h, i) => {
        const x = XR + RW * i + RW / 2, v = [st.R, st.H, st.E][i];
        txt(h, x, h0 / 2, FS(64), GR, 'center', 700);
        txt(v[0], x, yA, FS(128), YL); txt(v[1], x, yB, FS(128), YL);
      });
    } else {
      const label = st.kind === 'knock' ? 'ノック' : st.kind === 'bat' ? '打撃練習' : st.kind === 'mound' ? '投球練習' : '本日の試合';
      txt(label, NX, h0 / 2 + rh * 0.35, FS(120), WH, 'left');
      const sub = st.kind === 'knock' ? `${st.n} / ${st.N} 本目  成功 ${st.caught}` : st.kind === 'bat' ? `球数 ${st.pitches}  本塁打 ${st.hr}` : st.kind === 'mound' ? `投げた ${st.n}  ストライク ${st.strikes}` : `相手 ー 自分   ${this.startTime()} 試合開始`;
      txt(sub, NX, yB, FS(110), YL, 'left');
    }
    // 右: B S O(上の半分)と、打者・球速・時計(下の半分)
    const lr = Math.min(FS(30), (W - XS) / 30);
    let x = XS;
    [['B', 3, st.b || 0, '#3fe36a'], ['S', 2, st.s || 0, '#ffcf2e'], ['O', 2, st.o || 0, '#ff4a3a']].forEach(([lab, n, v, col]) => {
      txt(lab, x + lr, H * 0.25, FS(84), WH);
      for (let i = 0; i < n; i++) lamp(x + lr * 3.2 + i * lr * 2.5, H * 0.25, lr, i < v, col);
      x += lr * 3.2 + n * lr * 2.5 + lr * 0.8;
    });
    let line = '';
    if (st.kind === 'game') line = st.over ? `試合終了 ${st.R[0]}-${st.R[1]}` : st.bat >= 0 ? `${st.bat + 1}番 ${POS_LABEL[ORDER[st.bat]]}` : '自分の攻撃';
    else if (st.kind === 'knock') line = `守備 ${POS_LABEL[st.my] || ''}`;
    const rw = W - 0.01 * W - XS, lf = Math.min(FS(84), rw / 9.5);
    txt(line, XS, H * 0.62, lf, WH, 'left');
    txt(st.kmh != null ? `${st.kmh} km/h` : '', XS, H * 0.86, lf * 0.8, YL, 'left');
    txt(st.clock, W - 0.01 * W, H * 0.86, lf * 0.8, WH, 'right');
  }
  // ---------------------------------------------------------------- 屋根の球場のメインビジョン(横長の画面。絵は 1664 × 936)
  // 上: 回ごとの点・R H E・B S O。下: 打者の紹介(何番・守備位置)。試合以外はそのモードの数
  drawVision(g, W, H, st, opt = {}) {
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0b1640'); bg.addColorStop(1, '#081030');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const txt = (s, x, y, size, col, align = 'center', w = 900) => { g.font = `${w} ${size}px ${FONT}`; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(String(s), x, y); };
    const WH = '#ffffff', YL = '#fff23a', GR = '#9fb0d8';
    const lamp = (x, y, r, on, col) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = on ? col : '#2a3550'; g.fill(); };
    // 上の段の枠
    const X0 = 24, Y0 = 78, NW = 206, CW = 94, NC = 9, RW = 100, RH = 112;
    const top = Y0, rows = [Y0 + RH, Y0 + RH * 2];
    g.lineWidth = 6; g.strokeStyle = '#e8ecff';
    const x1 = X0 + NW + CW * NC + RW * 3;
    g.fillStyle = '#000'; g.fillRect(X0, top - 4, x1 - X0, RH * 3 + 8);
    g.strokeRect(X0, top - 4, x1 - X0, RH * 3 + 8);
    for (let i = 0; i <= NC + 3; i++) { const x = X0 + NW + (i <= NC ? CW * i : CW * NC + RW * (i - NC)); g.beginPath(); g.moveTo(x, top - 4); g.lineTo(x, top + RH * 3 + 4); g.lineWidth = 4; g.stroke(); }
    for (let r = 1; r < 3; r++) { g.beginPath(); g.moveTo(X0, top + RH * r); g.lineTo(x1, top + RH * r); g.stroke(); }
    const midY = (r) => top + RH * r + RH / 2 + 4;
    if (st.kind === 'game') {
      const first = Math.max(1, st.inn - NC + 1);
      for (let i = 0; i < NC; i++) {
        const n = first + i, x = X0 + NW + CW * i + CW / 2, cur = n === st.inn && !st.over;
        txt(n, x, midY(0), 70, cur ? YL : WH);
        const a = st.them[n - 1], b = st.us[n - 1];
        const aOn = cur && st.half === 'top', bOn = cur && st.half !== 'top';
        if (aOn || bOn) { g.fillStyle = st.blink ? '#5a4c08' : '#2e2a10'; g.fillRect(X0 + NW + CW * i + 3, top + RH * (aOn ? 1 : 2) + 3, CW - 6, RH - 6); }
        if (a != null) txt(a, x, midY(1), 92, aOn ? (st.blink ? '#fff7b0' : YL) : WH);
        if (b != null) txt(b, x, midY(2), 92, bOn ? (st.blink ? '#fff7b0' : YL) : WH);
      }
      ['R', 'H', 'E'].forEach((h, i) => {
        const x = X0 + NW + CW * NC + RW * i + RW / 2;
        txt(h, x, midY(0), 70, YL);
        txt([st.R, st.H, st.E][i][0], x, midY(1), 92, YL); txt([st.R, st.H, st.E][i][1], x, midY(2), 92, YL);
      });
      const atk = st.over ? null : st.half === 'top' ? 1 : 2;
      if (atk) { g.fillStyle = '#23409a'; g.fillRect(X0 + 3, top + RH * atk + 3, NW - 6, RH - 6); }   // 攻撃中のチーム名の欄を明るく
      txt('相手', X0 + NW / 2 + 10, midY(1), 78, atk === 2 ? '#7d88a8' : WH); txt('自分', X0 + NW / 2 + 10, midY(2), 78, atk === 1 ? '#7d88a8' : WH);
      lamp(X0 + 22, midY(1), 13, atk === 1, '#ff5a2a'); lamp(X0 + 22, midY(2), 13, atk === 2, '#ff5a2a');
      txt(`${st.inn}回${st.half === 'top' ? '表' : '裏'}`, X0 + NW / 2, midY(0), 54, GR);
    } else {
      txt(st.kind === 'knock' ? 'ノック' : st.kind === 'bat' ? '打撃練習' : st.kind === 'mound' ? '投球練習' : '本日の試合', X0 + NW + 30, midY(0), 76, WH, 'left');
    }
    // B S O
    const bx = x1 + 46;
    [['B', 3, st.b || 0, '#2bea5a'], ['S', 2, st.s || 0, '#ffcc1a'], ['O', 2, st.o || 0, '#ff3b2e']].forEach(([lab, n, v, col], r) => {
      const y = midY(r);
      txt(lab, bx, y, 76, WH);
      for (let i = 0; i < n; i++) lamp(bx + 70 + i * 62, y, 26, i < v, col);
    });
    // 区切りの線
    g.fillStyle = '#26a6ff'; g.fillRect(0, 470, W, 8);
    // 下の段
    const card = (x, y, w, h) => { g.fillStyle = '#1d33a8'; g.fillRect(x, y, w, h); g.lineWidth = 6; g.strokeStyle = '#e8ecff'; g.strokeRect(x, y, w, h); };
    if (opt.lineup && st.kind === 'game' && !st.over) {
      // 野外の大きな板(杜ノ丘・観覧車の丘): 本物の板と同じく、先攻の打順 1〜9 番(守備位置)を並べ、今の打者を光らせる。右に打者・時計
      card(40, 512, 760, 400); card(830, 512, W - 870, 400);
      txt('相手', 80, 548, 44, GR, 'left', 700);
      for (let i = 0; i < 9; i++) {
        const col = i < 5 ? 0 : 1, row = i < 5 ? i : i - 5, x = 80 + col * 360, y = 596 + row * 62;
        const on = st.half === 'top' && st.bat === i;
        if (on) { g.fillStyle = YL; g.fillRect(x - 20, y - 30, 340, 60); }
        txt(`${i + 1}`, x + 20, y, 52, on ? '#111' : WH);
        txt(POS_LABEL[ORDER[i]], x + 70, y, 52, on ? '#111' : WH, 'left');
      }
      if (st.half === 'top' && st.bat >= 0) {
        txt(`${st.bat + 1}番 ${POS_LABEL[ORDER[st.bat]]}`, 830 + (W - 870) / 2, 640, 96, YL);
        txt(`第${st.batN}打席`, 830 + (W - 870) / 2, 760, 70, WH);
      } else txt(`${st.inn}回裏  自分の攻撃`, 830 + (W - 870) / 2, 680, 76, WH);
      txt(st.kmh != null ? `球速 ${st.kmh} km/h` : '', 860, 860, 50, YL, 'left', 700);
      txt(st.clock, W - 70, 860, 60, WH, 'right');
      return;
    }
    card(160, 512, W - 320, 400);
    if (st.kind === 'game') {
      if (st.over) {
        txt('試合終了', W / 2, 620, 120, YL);
        txt(`相手 ${st.R[0]} - ${st.R[1]} 自分`, W / 2, 780, 110, WH);
      } else if (st.half === 'top' && st.bat >= 0) {
        const k = ORDER[st.bat];
        g.fillStyle = YL; g.beginPath(); g.moveTo(210, 548); g.lineTo(1010, 548); g.lineTo(980, 648); g.lineTo(180, 648); g.closePath(); g.fill();
        txt(`${st.bat + 1}番  ${POS_KANA[k]}`, 595, 600, 76, '#111');
        txt(`相手  ${POS_LABEL[k]}`, 210, 752, 120, WH, 'left');
        txt(`第${st.batN}打席`, 1470, 752, 86, YL, 'right');
        txt(`守備 ${POS_LABEL[st.my] || ''}(あなた)`, 210, 858, 54, GR, 'left', 700);
        txt(st.clock, 1470, 858, 60, WH, 'right');
      } else {
        txt(`${st.inn}回裏  自分の攻撃`, W / 2, 660, 100, WH);
        txt(st.clock, W / 2, 800, 80, YL);
      }
    } else if (st.kind === 'knock') {
      txt(`${st.n} / ${st.N} 本目`, W / 2, 620, 130, WH);
      txt(`成功 ${st.caught}`, 560, 790, 110, YL);
      txt(st.star ? '★'.repeat(st.star) + '☆'.repeat(3 - st.star) : '', 1160, 790, 100, YL);
    } else if (st.kind === 'bat') {
      txt(`球速 ${st.kmh != null ? st.kmh : '—'} km/h`, W / 2, 610, 110, YL);
      txt(`本塁打 ${st.hr}   最長 ${st.best || '—'} m`, W / 2, 760, 84, WH);
      txt(`球数 ${st.pitches}  ・  振った ${st.swings}`, W / 2, 850, 60, GR, 'center', 700);
    } else if (st.kind === 'mound') {
      txt(`球速 ${st.kmh != null ? st.kmh : '—'} km/h`, W / 2, 610, 110, YL);
      txt(`投げた ${st.n}  ・  ストライク ${st.strikes}`, W / 2, 760, 80, WH);
      txt(`最速 ${st.best || '—'} km/h`, W / 2, 850, 60, GR, 'center', 700);
    } else {
      txt('本日の試合', W / 2, 590, 84, YL);
      txt('相手  対  自分', W / 2, 720, 120, WH);
      txt(`${this.startTime()} 試合開始  ・  いま ${st.clock}`, W / 2, 846, 64, WH, 'center', 700);
    }
  }
}
