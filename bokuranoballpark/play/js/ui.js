// メニューの画面(タイトル → モード → ポジション → 本数・難しさ・時間帯・視点 → 遊ぶ → 一時停止 → 結果)と、
// 遊んでいる間の部品(スコアの板・早送りの札・次の場面へ・送球のボタン)。DOM だけを扱い、遊びの中身は app に任せる。
import { POS_LABEL } from './rules.js';
import { StadiumPicker } from './stadium_picker.js';   // 11/18 球場を選ぶ画面(絵のカード・決定ボタンからだけ読み込む)

// ゲームの題。題を替える時はここだけ直す(docs/タイトル案.md)。
// logo は題字の絵(ChatGPT で作った物)。題を替えて絵が合わなくなったら logo: '' にすると字のロゴになる
// 11/18 持ち主の決定で「一歩目の夏」から改名。題字の絵(ChatGPT)はアプリ化の作業者が作る。届くまでは文字の題(logo: null)。前の img/ui4_logo.png は旧題の字入りなので使わない
export const GAME_TITLE = { name: 'ぼくらのボールパーク', sub: '守って、歩いて、球場まるごと', logo: 'img/hade_logo.webp?v=1121h' };   // 11/21 持ち主「タイトルとか雰囲気もっとド派手に」: 金と炎のロゴ(ChatGPT、_chatgpt_hade_1121)。前は img/ui5_logo.webp?v=1118c   // 題字の絵(副題の帯入り。ChatGPT、docs\アプリ化の引き継ぎ.md)
// タイトルに出すモード(11/17 持ち主「打撃、マウンドはいったん今要りません」)。打席・マウンドのコードは残してある。
// 戻す時は 'bat', 'mound' をこの並びに足す
export const MENU_MODES = ['game', 'knock', 'watch'];   // 11/22 持ち主「球場を歩くのモードいらない、3つでいい」(walk のコードは残す。戻す時は 'walk' を足す)   // 11/18 夜 観戦(試合を見ながら歩く。js/watch.js)を足した

const $ = (id) => document.getElementById(id);
// 11/26 サクサク: 画面の大きさの印(大きさが変わった時だけ更新。毎こま innerWidth を読まない)
{ const f = () => { window.__vwh = innerWidth + 'x' + innerHeight; }; f(); addEventListener('resize', f); addEventListener('orientationchange', f); }
// 文字の題: 狭い画面で折り返す時は「ぼくらの / ボールパーク」の切れ目で(語の途中で切れないように)
function textLogo(h, name) {
  h.textContent = '';
  const i = name.indexOf('の');
  const parts = i > 0 && i < name.length - 1 ? [name.slice(0, i + 1), name.slice(i + 1)] : [name];
  for (const t of parts) { const sp = document.createElement('span'); sp.style.display = 'inline-block'; sp.textContent = t; h.appendChild(sp); }
}
function applyTitle() {
  const T = GAME_TITLE;
  document.title = `${T.name} | ${T.sub}`;
  const box = document.querySelector('#title .logoWrap');
  if (!box) return;
  box.innerHTML = '';
  const h = document.createElement('h1'); h.className = 'logo'; h.setAttribute('aria-label', `${T.name} ${T.sub}`);
  if (T.logo) {
    const im = document.createElement('img'); im.src = T.logo; im.alt = T.name; im.className = 'logoImg';
    im.onerror = () => { box.classList.add('textLogo'); textLogo(h, T.name); };
    h.appendChild(im);
  } else { box.classList.add('textLogo'); textLogo(h, T.name); }
  box.appendChild(h);
  const s = document.createElement('div'); s.className = 'logoSub'; s.textContent = T.sub;
  box.appendChild(s);
}
const PLAYABLE = ['1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'P', 'C'];   // 11/25 テスター「投手・捕手も選べるように」
const POS_HINT = {
  '1B': 'ゴロを捕って一塁を踏む。内野ゴロでは一塁に入る',
  '2B': '二遊間のゴロ。併殺では二塁に入る',
  SS: '三遊間のゴロ。外野の安打では中継に入る',
  '3B': '三塁線の強い打球。バントは前へ',
  LF: '左のフライ。三塁へのバックアップ',
  CF: '中のフライ。二塁と両翼のバックアップ',
  RF: '右のフライ。一塁へのバックアップ',
  P: 'ピッチャー返し・バント・一塁のベースカバー(投げるのは自動)',
  C: 'バント・本塁まわりのフライ・本塁のタッチ・盗塁の送球',
};
// 守る所の図の丸いボタンは 1 文字(見本どおり)。読み上げと説明は POS_LABEL の名前で
const POS_SHORT = { '1B': '一', '2B': '二', '3B': '三', SS: '遊', LF: '左', CF: '中', RF: '右', P: '投', C: '捕' };
const MODE_TITLE = { game: '守備の試合', knock: 'ノック', bat: '打席', mound: 'マウンド', walk: '球場を歩く', watch: 'ボールパークで過ごす' };
const MODE_GO = { game: 'プレイボール', knock: 'ノック開始', bat: '打席に立つ', mound: 'マウンドへ', walk: '歩きはじめる', watch: '試合を観に行く' };

// 守備位置の図の上のボタンの位置(svg 400x330 の座標)。本物の比率だと内野のボタンが重なるので、少し広げてある
// v4: 球場の図は ChatGPT の絵(img/ui4_field.png 625x446)。座標はその絵の上の位置。ボタンどうしが重ならないよう少し広げてある
const FIELD_W = 625, FIELD_H = 446;
const FIELD_XY = { '1B': [462, 282], '2B': [386, 178], SS: [238, 178], '3B': [162, 282], LF: [118, 132], CF: [312, 62], RF: [506, 132], P: [312, 290], C: [312, 408] };   // 11/25 投手はマウンド、捕手は本塁
function fieldXY(k) { return FIELD_XY[k]; }

export function diamondSVG(bases) {
  const on = (b) => (bases[b - 1] ? '#ffd54a' : 'rgba(255,255,255,.22)');
  return `<svg class="dia" viewBox="0 0 40 40"><rect x="26" y="15" width="10" height="10" transform="rotate(45 31 20)" fill="${on(1)}"/><rect x="15" y="4" width="10" height="10" transform="rotate(45 20 9)" fill="${on(2)}"/><rect x="4" y="15" width="10" height="10" transform="rotate(45 9 20)" fill="${on(3)}"/><rect x="16" y="28" width="8" height="8" transform="rotate(45 20 32)" fill="rgba(255,255,255,.5)"/></svg>`;
}
// どちらの点か一目で分かるように: チームの色の帯・名前・先攻後攻・攻撃中の印・点差
export function teamsHTML(g) {
  const d = g.score.us - g.score.them;
  const lead = window.__watch && window.__watch.on ? (d > 0 ? `後攻 ${d}点リード` : d < 0 ? `先攻 ${-d}点リード` : '同点') : d > 0 ? `自分 ${d}点リード` : d < 0 ? `自分 ${-d}点ビハインド` : '同点';
  const row = (who, name, pts, bat, me) => `<div class="tm${me ? ' me' : ''}${bat ? ' atk' : ''}"><i class="sw ${who}"></i><span class="nm">${name}</span><b>${pts}</b><span class="bat">${bat ? '▶' : ''}</span></div>`;
  const W = window.__watch && window.__watch.on;   // 観戦(watch.js)では「自分」のチームが無いので 先攻・後攻 で呼ぶ
  return `<div class="sb-teams">${row('away', W ? '先攻' : '相手<small>先攻</small>', g.score.them, g.half === 'top', false)}${row('home', W ? '後攻' : '自分<small>後攻</small>', g.score.us, g.half !== 'top', true)}<div class="sb-diff ${d > 0 ? 'up' : d < 0 ? 'dn' : ''}">${lead}</div></div>`;
}
export function boardHTML(g) {
  const dots = (n, max, on) => Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
  const head = g.knock ? `<div class="sb-inn">ノック<small>${g.knock}</small></div>` + (g.sub ? `<div class="sb-score sb-k">${g.sub}</div>` : '')
    : `<div class="sb-inn">${g.inning}回<small>${g.half === 'top' ? '表' : '裏'}</small></div>` + teamsHTML(g);
  return head
    + diamondSVG(g.bases)
    + `<div class="sb-cnt"><span class="b">B</span><span class="b">${dots(g.balls, 3)}</span><span class="s">S</span><span class="s">${dots(g.strikes, 2)}</span><span class="o">O</span><span class="o">${dots(Math.min(3, g.outs), 2)}</span></div>`;
}

function evalHTML(e) {
  if (!e) return '';
  const esc = (t) => String(t ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const bar = (x) => `<div class="ev-sub"><span class="ev-k">${x.k}</span><span class="ev-bar"><i style="width:${x.v ?? 0}%"></i></span><b>${x.v ?? '—'}</b><small>${esc(x.note)}</small></div>`;
  const cmp = e.prev != null ? `<span class="ev-cmp ${e.score >= e.prev ? 'up' : 'dn'}">前回 ${e.prev} → ${e.score >= e.prev ? '+' : ''}${e.score - e.prev}</span>` : '';
  const best = e.bestScore != null ? `<span class="ev-cmp">自分の最高 ${Math.max(e.bestScore, e.score)}${e.newBest ? '(更新!)' : ''}</span>` : '';
  return `<div class="evalTotal"><div class="ev-head">守備の評価</div>`
    + `<div class="ev-main"><div class="ev-rank r-${e.rank}">${e.rank}</div><div class="ev-score"><b data-to="${e.n ? e.score : 0}">0</b><small>/100</small><div>${cmp}${best}</div></div></div>`
    + `<div class="ev-subs">${(e.subs || []).map(bar).join('')}</div>`
    + (e.best ? `<div class="ev-scene good"><span>名場面</span>${esc(e.best)}</div>` : '')
    + (e.worst ? `<div class="ev-scene bad"><span>一番のミス</span>${esc(e.worst)}</div>` : '')
    + `<div class="ev-word">${esc(e.word)}</div></div>`;
}
// 点数を 0 から数え上げ、ランクの判子を押す
function animateEval(root) {
  const b = root.querySelector('.ev-score b'); if (!b) return;
  const to = +b.dataset.to || 0, t0 = performance.now();
  const step = (t) => { const u = Math.min(1, (t - t0) / 900); b.textContent = Math.round(to * (1 - Math.pow(1 - u, 3))); if (u < 1) requestAnimationFrame(step); else root.querySelector('.ev-rank')?.classList.add('stamp'); };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- 走者の小さな図(点数板のすぐ下)
// 11/17 持ち主「左上とかにランナーの進行状況が分かるように。どの位置にいるか分かりにくい」。
// 守備(defense.js)の状態を読むだけ: 走者は r.from(出た塁)と r.dist(そこから走った m)、打球は ballPos(世界の座標)。
const MAP_W = 140, MAP_H = 112, MAP_HOME = [70, 104], MAP_K = 1.5;   // 1 m = 1.5 の大きさ。本塁は下の真ん中
const BASE_W = [[0, -0.22], [19.07, -19.4], [0, -38.8], [-19.07, -19.4]];   // rules.js の BASE_XZ と同じ(x, z)
const mapXY = (x, z) => [MAP_HOME[0] + x * MAP_K, MAP_HOME[1] + (z + 0.22) * MAP_K];
const MAP_BASE = BASE_W.map(([x, z]) => mapXY(x, z));
// 外野は遠いので縮める: 本塁から 32 m までは同じ割合、その先は 0.25 倍(柵の外は縁で止める)
function mapBall(x, z) {
  const dx = x - BASE_W[0][0], dz = z - BASE_W[0][1], r = Math.hypot(dx, dz);
  const r2 = r <= 32 ? r : Math.min(58, 32 + (r - 32) * 0.25), k = r > 1e-6 ? r2 / r : 0;
  return mapXY(BASE_W[0][0] + dx * k, BASE_W[0][1] + dz * k);
}
function runnerXY(r) {
  const a = MAP_BASE[((r.from % 4) + 4) % 4], b = MAP_BASE[(r.from + 1) % 4];
  const u = Math.min(1, Math.max(0, r.dist || 0) / 27.43);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}
function runMapSVG() {
  const [hx, hy] = MAP_HOME, R1 = 58 * MAP_K, c = Math.SQRT1_2;
  const fan = `M${hx} ${hy} L${hx - R1 * c} ${hy - R1 * c} A${R1} ${R1} 0 0 1 ${hx + R1 * c} ${hy - R1 * c} Z`;
  const R2 = 29 * MAP_K;
  const dirt = `M${hx} ${hy} L${hx - R2 * c} ${hy - R2 * c} A${R2} ${R2} 0 0 1 ${hx + R2 * c} ${hy - R2 * c} Z`;
  const [h, f, s, t] = MAP_BASE;
  const base = (p, i) => `<rect class="mb mb${i}" x="${p[0] - 4}" y="${p[1] - 4}" width="8" height="8" transform="rotate(45 ${p[0]} ${p[1]})"/>`;
  return `<svg viewBox="0 0 ${MAP_W} ${MAP_H}" aria-hidden="true"><path class="mfan" d="${fan}"/><path class="mdirt" d="${dirt}"/>`
    + `<path class="mgrass" d="M${h[0]} ${h[1] - 6} L${f[0] - 6} ${f[1]} L${s[0]} ${s[1] + 6} L${t[0] + 6} ${t[1]} Z"/>`
    + `<path class="mline" d="M${hx} ${hy} L${hx - R1 * c} ${hy - R1 * c} M${hx} ${hy} L${hx + R1 * c} ${hy - R1 * c}"/>`
    + `<path class="mpath" d="M${h[0]} ${h[1]} L${f[0]} ${f[1]} L${s[0]} ${s[1]} L${t[0]} ${t[1]} Z"/>`
    + `${[f, s, t].map((p, i) => base(p, i + 1)).join('')}<path class="mhome" d="M${h[0] - 4} ${h[1] - 4} h8 v4 l-4 4 l-4 -4 Z"/>`
    + `<g class="mrun"></g><circle class="mball" r="2.6" cx="-9" cy="-9"/></svg>`;
}

export class UI {
  constructor(app) {
    this.app = app;
    applyTitle();
    this.touch = app.IS_TOUCH;
    document.body.classList.toggle('touch', this.touch);
    this.sel = Object.assign({ mode: 'game', pos: 'SS', count: 10, diff: 'easy', bd: 'mix', time: 'day', view: '1p' }, app.load('r4walk.sel', {}));   // 視点の初めは自分の目(一人称)
    if (!app.load('r4walk.viewReset1', false)) { this.sel.view = '1p'; app.store('r4walk.viewReset1', true); app.store('r4walk.sel', this.sel); }   // 11/18: 前に残った視点を一度だけ自分の目に戻す
    this.sel.stadium = app.stadium || 'koshien';
    // 球場の名前は main.js の STADIUM_NAMES の 1 か所から(持ち主が替える時はそこだけ)
    if (app.stadiumNames) document.querySelectorAll('[data-key="stadium"] button').forEach((b) => { if (app.stadiumNames[b.dataset.v]) b.textContent = app.stadiumNames[b.dataset.v]; });
    // 応援の型(観客 js/crowd.js と同じ決め方: ?cheer > 設定 r4walk.cheer > 球場。屋根 = プロ風、浜風 = 高校野球)
    this.sel.cheer = (() => {
      try { const q = new URLSearchParams(location.search).get('cheer'); if (q === 'pro' || q === 'hs') return q; } catch (e) { /* なし */ }
      const s = app.load('r4walk.cheer', null); if (s === 'pro' || s === 'hs') return s;
      return app.stadiumIndoor ? 'pro' : 'hs';
    })();
    // 屋根の球場は時間帯の代わりに屋内の照明 2 つ
    if (app.stadiumIndoor) {
      const tseg = document.querySelector('#setScreen .seg[data-key="time"]');
      if (tseg) { tseg.querySelector('[data-v="day"]').textContent = '昼'; tseg.querySelector('[data-v="night"]').textContent = '試合の照明'; tseg.previousElementSibling.textContent = '照明'; }
    }
    if (this.sel.time !== 'day' && this.sel.time !== 'night') this.sel.time = 'day';   // 11/20 持ち主「夕方は要らない」: 前に覚えた夕方は昼に
    this.stack = [];
    // タイトル(MENU_MODES に無いモードのボタンは出さない)
    const modesEl = $('modes');
    if (modesEl) modesEl.dataset.n = String(MENU_MODES.length);
    document.querySelectorAll('#modes .mode').forEach((b) => b.classList.toggle('hide', !MENU_MODES.includes(b.dataset.mode)));
    if (!MENU_MODES.includes(this.sel.mode)) this.sel.mode = MENU_MODES[0];
    document.querySelectorAll('#modes .mode').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.sel.mode = b.dataset.mode;
      if (this.sel.mode === 'game' || this.sel.mode === 'knock') this.show('posScreen'); else this.show('setScreen');
    }));
    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.back(); }));
    // ポジション
    const field = $('field');
    for (const k of PLAYABLE) {
      const [x, y] = fieldXY(k);
      const b = document.createElement('button');
      b.className = 'posbtn'; b.dataset.pos = k; b.textContent = POS_SHORT[k]; b.setAttribute('aria-label', POS_LABEL[k]);
      b.style.left = (x / FIELD_W * 100) + '%'; b.style.top = (y / FIELD_H * 100) + '%';
      b.addEventListener('click', (e) => { e.stopPropagation(); this.sel.pos = k; this.refresh(); this.app.store('r4walk.sel', this.sel); });
      field.appendChild(b);
    }
    const desc = document.createElement('div'); desc.className = 'posdesc'; desc.id = 'posDesc';
    field.after(desc);
    $('posNext').addEventListener('click', (e) => { e.stopPropagation(); this.show('setScreen'); });
    // 本数・難しさ・時間帯・視点
    document.querySelectorAll('#setScreen .seg').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const v = b.dataset.v; this.sel[seg.dataset.key] = isNaN(+v) ? v : +v;
      if (seg.dataset.key === 'time') app.setTime(v);
      // 応援: 観客に伝えて設定(r4walk.cheer)に残す。観客がまだ無ければ設定だけ残す
      if (seg.dataset.key === 'cheer') { if (window.__crowd && window.__crowd.setStyle) window.__crowd.setStyle(v); else this.app.store('r4walk.cheer', v); }
      this.refresh();
      this.app.store('r4walk.sel', this.sel);   // 選んだ物は次に開いた時も残る
      if (seg.dataset.key === 'stadium' && app.setStadium) { this.app.store('r4walk.sel', this.sel); app.setStadium(v); }
    })));
    $('setGo').addEventListener('click', (e) => { e.stopPropagation(); this.go(); });
    // 球場を選ぶ画面: 押しただけでは読み込まない。「この球場で始める」(決定)だけが読み込み・ショップへ進む。戻るは 1 つ前の画面へ
    this.picker = new StadiumPicker({
      current: this.sel.stadium || app.stadium,
      isLocked: (id) => (typeof window.__ippomeOpen === 'function' ? !window.__ippomeOpen(id) : false),
      onBack: () => this.back(),
      onDecide: (id, time) => this.decideStadium(id, time),
      goLabel: () => 'この球場で' + (MODE_GO[this.sel.mode] || 'はじめる'),
    });
    const spb = $('stadiumPickBtn');
    if (spb) spb.addEventListener('click', (e) => { e.stopPropagation(); this.picker.open(this.sel.stadium || app.stadium, this.sel.time); this.show('stadiumScreen'); });
    // 一時停止
    $('pauseBtn').addEventListener('click', (e) => { e.stopPropagation(); this.pause(); });
    $('pzResume').addEventListener('click', (e) => { e.stopPropagation(); this.resume(); });
    $('pzRestart').addEventListener('click', (e) => { e.stopPropagation(); this.hideAll(); this.go(); });
    $('pzTitle').addEventListener('click', (e) => { e.stopPropagation(); app.toTitle(); this.show('title', true); });
    document.querySelectorAll('#views button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); app.setView(b.dataset.v); this.refresh(); }));
    // 落下点の目印(一時停止の画面からも。試合中の守備にすぐ効く)
    document.querySelectorAll('#marks button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.sel.mark = b.dataset.v; this.app.store('r4walk.sel', this.sel); if (this.app.defense && this.app.defense.sel) this.app.defense.sel.mark = b.dataset.v; this.refresh(); }));
    $('credBtn').addEventListener('click', (e) => { e.stopPropagation(); this.credits(); });
    $('credBack').addEventListener('click', (e) => { e.stopPropagation(); $('credits').classList.add('hide'); });
    for (const [id, key] of [['volAll', 'all'], ['volAmb', 'amb'], ['volVoice', 'voice'], ['volSong', 'song'], ['volCrowd', 'crowd'], ['volSfx', 'sfx']]) {
      const v = app.load('r4walk.vol.' + key, null);
      if (v != null) $(id).value = v;
      $(id).addEventListener('input', () => { app.setVolume(key, $(id).value / 100); app.store('r4walk.vol.' + key, +$(id).value); });
      $(id).addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    }
    $('voiceBtn').addEventListener('click', (e) => { e.stopPropagation(); app.setVoice(!app.voiceOn); this.refresh(); });
    // 結果
    $('resAgain').addEventListener('click', (e) => { e.stopPropagation(); this.hideAll(); this.go(); });
    $('resPos').addEventListener('click', (e) => { e.stopPropagation(); app.toTitle(); this.show('posScreen', true); });
    $('resClose').addEventListener('click', (e) => { e.stopPropagation(); app.toTitle(); this.show('title', true); });
    // 次の場面へ
    $('skipBtn').addEventListener('click', (e) => { e.stopPropagation(); app.skip(); });
    $('skipBtn').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); app.skip(); }, { passive: false });
    $('viewBtn').addEventListener('click', (e) => { e.stopPropagation(); app.cycleView(); });
    $('viewBtn').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); app.cycleView(); }, { passive: false });
    // ジャンプ・飛び込む(捕る前だけ出る)
    for (const [id, fn] of [['btnJump', () => app.jump()], ['btnDive', () => app.dive()], ['btnCall', () => app.callBall && app.callBall()]]) {
      const b = $(id);
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
      b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
    }
    // 送球のボタン
    this.padEl = $('pad');
    this.padEl.querySelectorAll('.basebtn').forEach((b) => {
      const go = (e) => { e.preventDefault(); e.stopPropagation(); app.chooseBase(+b.dataset.base); };
      b.addEventListener('touchstart', go, { passive: false }); b.addEventListener('mousedown', go);
      if (!this.touch) { const k = document.createElement('span'); k.className = 'k'; k.textContent = { 1: '1', 2: '2', 3: '3', 0: '4', 5: '5' }[b.dataset.base]; b.appendChild(k); }
    });
    this.refresh();
    // 走者の図と本塁打の題字(遊んでいる間だけ、毎こま守備の状態を読む)
    this.mapEl = document.createElement('div'); this.mapEl.id = 'runMap'; this.mapEl.className = 'hide'; this.mapEl.innerHTML = runMapSVG();
    document.body.appendChild(this.mapEl);
    this.mapRun = this.mapEl.querySelector('.mrun'); this.mapBallEl = this.mapEl.querySelector('.mball');
    this.mapDots = new Map();
    this.hrEl = document.createElement('div'); this.hrEl.id = 'hrBanner'; this.hrEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.hrEl);
    // 判定の札(アウト・セーフ・ダブルプレー・三振): ホームランの札と同じ書き方で、少し上・少し小さく・1 秒
    this.callEl = document.createElement('div'); this.callEl.id = 'callBanner'; document.body.appendChild(this.callEl);
    const cs = document.createElement('style');
    cs.textContent = `#callBanner{position:fixed;left:50%;top:17vh;z-index:14;pointer-events:none;text-align:center;white-space:nowrap;transform:translate(-50%,-50%) scale(.6) rotate(-4deg);opacity:0;transition:transform .2s cubic-bezier(.2,1.6,.4,1),opacity .15s}
#callBanner.show{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(-4deg)}
#callBanner b{display:block;font-family:var(--v4-body);font-weight:900;font-style:italic;letter-spacing:.02em;color:#fff;-webkit-text-stroke:7px #0d3a24;paint-order:stroke fill;text-shadow:0 4px 0 rgba(0,0,0,.4);font-size:clamp(38px,9vw,72px);line-height:1.05}
#callBanner.safe b{-webkit-text-stroke-color:#1d3f7a}
body.photo #callBanner{display:none}@media (max-height:460px){ #callBanner{top:20vh} #callBanner b{font-size:46px} }`;
    document.head.appendChild(cs);
    const tick = () => { try { this.mapTick(); this.layoutHud(); } catch (e) { /* 図は飾り。遊びは止めない */ } requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  // ------------------------------------------------ 走者の図
  mapTick() {
    const A = window.__app, d = A && A.defense, el = this.mapEl, board = $('board');
    const on = !!(d && d.active && d.g && document.body.classList.contains('playing') && !document.body.classList.contains('photo')
      && board && !board.classList.contains('hide') && !this.isOpen());
    el.classList.toggle('hide', !on);
    if (!on) { if (this.mapDots.size) { this.mapRun.innerHTML = ''; this.mapDots.clear(); } return; }
    // 11/26 サクサク: 点数板の位置は、中身・画面の大きさが変わった時と 0.5 秒ごとだけ読む(毎こま読むと、そのたびに配置の計算が走っていた)
    const now0 = performance.now(), bkey = (window.__vwh || '') + '|' + this._bk + '|' + board.className;
    if (bkey !== this._mapBK || now0 - (this._mapBT || 0) > 500) {
      this._mapBK = bkey; this._mapBT = now0;
      const br = board.getBoundingClientRect(), L = Math.round(br.left) + 'px', T = Math.round(br.bottom + 6) + 'px';
      if (el.style.left !== L) el.style.left = L; if (el.style.top !== T) el.style.top = T;
    }
    const g = d.g;
    // 攻める側の色: 表は相手(えんじ)、裏は自分(白に紺の縁)。ノックは相手の色
    const atk = d.kind === 'game' && g.half !== 'top' ? 'home' : 'away';
    el.dataset.atk = atk;
    // 塁にいる走者の印(試合の状態)
    for (let i = 1; i <= 3; i++) el.querySelector('.mb' + i)?.classList.toggle('on', !!(g.bases && g.bases[i - 1]));
    const now = performance.now(), seen = new Set();
    const list = [d.batterRunner, ...(d.runners || [])].filter(Boolean);
    for (const r of list) {
      seen.add(r);
      let dot = this.mapDots.get(r);
      if (!dot) {
        dot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        dot.innerHTML = '<circle r="5"/><path class="x" d="M-4 -4 L4 4 M4 -4 L-4 4"/>';
        dot.setAttribute('class', 'mr' + (r.isBatter ? ' bat' : ''));
        this.mapRun.appendChild(dot); this.mapDots.set(r, dot);
      }
      if (r.scored) { dot.setAttribute('class', 'mr gone'); continue; }
      if (r.out) {
        if (!dot._outT) { dot._outT = now; dot.setAttribute('class', 'mr out'); }
        if (now - dot._outT > 900) dot.setAttribute('class', 'mr gone');
        continue;
      }
      const [x, y] = runnerXY(r);
      dot.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    }
    for (const [r, dot] of this.mapDots) if (!seen.has(r)) { dot.remove(); this.mapDots.delete(r); }
    // 打球(白い点)
    const bp = d.ball && d.ballPos;
    if (bp) { const [x, y] = mapBall(bp.x, bp.z); this.mapBallEl.setAttribute('cx', x.toFixed(1)); this.mapBallEl.setAttribute('cy', y.toFixed(1)); this.mapBallEl.style.opacity = '1'; }
    else this.mapBallEl.style.opacity = '0';
    // 本塁打: 1 プレーに 1 回、真ん中の上に大きく。9 回以降の裏に自分が勝ち越せばサヨナラ
    const pl = d.play;
    if (pl && pl.hr && this._hrPlay !== pl) {
      this._hrPlay = pl;
      const runs = 1 + (g.bases || []).filter(Boolean).length;
      const sayo = d.kind === 'game' && g.half !== 'top' && g.inning >= 9 && g.score.us <= g.score.them && g.score.us + runs > g.score.them;
      this.homeRun(sayo);
    }
  }
  callBanner(text, kind) {
    const el = this.callEl; if (!el) return;
    if (this.hrEl && this.hrEl.classList.contains('show')) return;   // ホームランの札と重ねない
    el.innerHTML = `<b>${text}</b>`; el.classList.toggle('safe', kind === 'safe');
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this._callT); this._callT = setTimeout(() => el.classList.remove('show'), 1000);
  }
  // ------------------------------------------------ 遊んでいる間の札の置き場所(ここ 1 か所で決める)
  // 左上の点数板(#board)とその下の走者の図(#runMap)、右上の丸いボタン(視点・一時停止)を避けて、
  //   打つ前の状況の札(#sit)→ その下に 1 プレーの評価(#evalPop・アウトやファウルの字)を置く。
  //   横長(スマホ横・PC): 点数板の右から右上のボタンの手前までの空いた所の真ん中。入らなければ縦と同じ
  //   縦長(スマホ縦): 点数板の下、走者の図の右(入らなければ走者の図の下)
  //   本塁打の題字(#hrBanner)は画面の真ん中(css)。札より下になるよう、札の下端より上には出さない
  layoutHud() {
    if (!document.body.classList.contains('playing')) return;
    // 11/26 サクサク: 札の置き場所は、札・点数板・ボタンの中身や出し入れ・画面の大きさが変わった時と 0.4 秒ごとだけ計算する(毎こま計算すると配置の計算が毎回走る)
    {
      const ids = ['board', 'sit', 'evalPop', 'viewBtn', 'pauseBtn'], now = performance.now();
      let key = (window.__vwh || '') + '|' + (this.mapEl ? this.mapEl.className : '') + '|' + (this.callEl ? this.callEl.className : '') + '|' + (this.hrEl ? this.hrEl.className : '');
      for (const id of ids) { const e = $(id); key += '|' + (e ? e.className + ':' + e.textContent.length : '-'); }
      if (key === this._hudK && now - (this._hudT || 0) < 400) return;
      this._hudK = key; this._hudT = now;
    }
    const W = innerWidth, gap = 8;
    const vis = (el) => el && !el.classList.contains('hide') && el.offsetWidth > 0;
    const board = $('board'), map = this.mapEl, sit = $('sit'), ev = $('evalPop');
    const B = vis(board) ? board.getBoundingClientRect() : { left: 12, right: 12, top: 12, bottom: 12 };
    const M = vis(map) ? map.getBoundingClientRect() : null;
    let rightLimit = W - gap;
    for (const id of ['viewBtn', 'pauseBtn']) { const e = $(id); if (vis(e)) { const r = e.getBoundingClientRect(); if (r.top < B.bottom) rightLimit = Math.min(rightLimit, r.left - gap); } }
    const sw = sit ? sit.offsetWidth : 0, sh = sit ? sit.offsetHeight : 0;
    let cx, top;
    const freeW = rightLimit - (B.right + gap);
    if (W > innerHeight && freeW >= sw + 4) { cx = B.right + gap + freeW / 2; top = B.top; }
    else {
      const left0 = M ? M.right + gap : B.left;
      if (M && left0 + sw <= W - gap) { cx = left0 + sw / 2; top = B.bottom + gap; }
      else { cx = Math.max(B.left + sw / 2, Math.min(W - gap - sw / 2, B.left + sw / 2)); top = (M ? M.bottom : B.bottom) + gap; }
    }
    if (sit) { sit.style.left = Math.round(cx) + 'px'; sit.style.top = Math.round(top) + 'px'; }
    if (ev) { ev.style.left = Math.round(cx) + 'px'; ev.style.top = Math.round(top + Math.max(sh, 40) + gap) + 'px'; }
    // アウト・セーフ等の大きな字(#callBanner): 評価の札(ナイスプレー等)と重ならないよう、札の下端より下に置く(11/19 点検で重なりを見つけた)
    if (this.callEl) {
      const evB = top + Math.max(sh, 40) + gap + (ev ? ev.offsetHeight || 36 : 36);
      const half = (this.callEl.offsetHeight || 80) / 2;
      this.callEl.style.top = Math.round(Math.max(innerHeight * (innerHeight <= 460 ? 0.20 : 0.17), evB + gap + half)) + 'px';
    }
    // 本塁打の題字: 真ん中(縦 30%・横 47%)。ただし上の端が評価の札の下より下に来るよう下げる
    if (this.hrEl) {
      const evBottom = top + Math.max(sh, 40) + gap + (ev ? ev.offsetHeight || 36 : 36);
      const half = (this.hrEl.offsetHeight || 120) / 2;
      const base = innerHeight * (innerHeight <= 460 ? 0.47 : 0.30);
      this.hrEl.style.top = Math.round(Math.max(base, evBottom + gap + half + 26)) + 'px';   // 26: 傾けた分
    }
  }
  homeRun(sayonara, sub) {   // sub: 守備の試合の本塁打の何点か(ツーラン等)。題字の上に小さく
    const el = this.hrEl;
    el.innerHTML = sayonara ? '<small>サヨナラ</small><b>ホームラン</b>' : sub ? `<small>${sub}</small><b>ホームラン</b>` : '<b>ホームラン</b>';
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this._hrT); this._hrT = setTimeout(() => el.classList.remove('show'), 1700);
  }
  // ------------------------------------------------ 画面の切り替え
  hideAll() { for (const id of ['title', 'posScreen', 'setScreen', 'stadiumScreen', 'panel', 'result', 'credits']) $(id).classList.add('hide'); this.app.setOverlay(false); }
  show(id, reset) {
    for (const s of ['title', 'posScreen', 'setScreen', 'stadiumScreen', 'panel', 'result', 'credits']) $(s).classList.toggle('hide', s !== id);
    if (reset) this.stack = [];
    if (this.stack[this.stack.length - 1] !== id) this.stack.push(id);
    this.app.setOverlay(true);
    this.refresh();
  }
  back() { this.stack.pop(); const id = this.stack.pop() || 'title'; this.show(id); }
  isOpen() { return ['title', 'posScreen', 'setScreen', 'stadiumScreen', 'panel', 'result', 'credits'].some((s) => !$(s).classList.contains('hide')); }
  // 球場を選ぶ画面の決定: 鍵のかかった球場はショップへ(アプリ版の shop.js)。開いている球場は、今の球場ならそのまま始め、違えば読み直してから始める
  decideStadium(id, time) {
    if (typeof window.__ippomeOpen === 'function' && !window.__ippomeOpen(id)) {
      if (window.__ippomeShop && window.__ippomeShop.openSheet) window.__ippomeShop.openSheet(id);
      return;
    }
    this.sel.stadium = id; if (time) this.sel.time = time;
    this.go();
  }
  go() {
    this.app.store('r4walk.sel', this.sel);
    if (this.sel.stadium && this.app.stadium && this.sel.stadium !== this.app.stadium && this.app.setStadium) {
      // 違う球場: 選んだ物を残して読み直し、読み終わったらそのまま始める(main.js が r4walk.go を見る)
      try { sessionStorage.setItem('r4walk.go', '1'); } catch (e) { /* 使えない環境 */ }
      this.app.setStadium(this.sel.stadium); return;
    }
    if (this.sel.time && this.app.setTime) this.app.setTime(this.sel.time);
    this.hideAll();
    this.app.startMode({ ...this.sel });
  }
  pause() {
    if (this.isOpen()) return;
    this.show('panel', true);
    document.querySelectorAll('#panel .walkOnly').forEach((e) => e.classList.toggle('hide', this.app.mode !== 'walk' && this.app.mode !== 'sit'));
    this.app.onPause(true);
  }
  resume() { this.hideAll(); this.app.onPause(false); }
  credits() {
    $('credits').classList.remove('hide');
    fetch('CREDITS.txt').then((r) => r.text()).then((t) => { $('credText').textContent = t.replace(/^#+\s*/gm, '').replace(/\|/g, ' ').replace(/-{3,}/g, ''); }).catch(() => {});
  }
  refresh() {
    { const b = $('stadiumPickBtn'); const id = this.sel.stadium || this.app.stadium || 'koshien';
      if (b) { b.querySelector('img').src = `img/stadium_thumbs/${id}.jpg`; b.querySelector('.stPickName').textContent = (this.app.stadiumNames && this.app.stadiumNames[id]) || id; } }
    const s = this.sel;
    document.querySelectorAll('#field .posbtn').forEach((b) => b.classList.toggle('on', b.dataset.pos === s.pos));
    const pd = $('posDesc'); if (pd) pd.textContent = (POS_LABEL[s.pos] ? POS_LABEL[s.pos] + ': ' : '') + (POS_HINT[s.pos] || '');
    document.querySelectorAll('#setScreen .seg').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(seg.dataset.key === 'mark' ? (s.mark || (s.diff === 'easy' ? 'on' : 'off')) : s[seg.dataset.key]) === b.dataset.v)));   // 落下点は選んでいなければ「易しい」だけ目印あり
    $('optCount').classList.toggle('hide', s.mode !== 'knock');
    $('optBd')?.classList.add('hide'); $('optDiff')?.classList.add('hide');   // 11/20 持ち主「難易度設定要らない」(段は index.html から外した)
    $('optView').classList.toggle('hide', s.mode === 'bat' || s.mode === 'mound');
    $('optCheer')?.classList.toggle('hide', s.mode !== 'knock' && s.mode !== 'game' && s.mode !== 'watch');
    $('setTitle').textContent = { game: '試合の設定', knock: 'ノックの設定' }[s.mode] || MODE_TITLE[s.mode];   // 見本5の見出し
    $('setGo').textContent = MODE_GO[s.mode];
    $('setGo').classList.toggle('knock', s.mode === 'knock');
    const best = this.app.knockBest ? this.app.knockBest()[`${s.pos}_${s.count}`] : null;
    $('setBest').textContent = s.mode === 'knock' ? (best ? `自己ベスト ${best.caught} / ${s.count}` : '') : '';
    document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('on', b.dataset.v === this.app.view));
    { const mk = this.sel.mark || (this.sel.diff === 'easy' ? 'on' : 'off'); document.querySelectorAll('#marks button').forEach((b) => b.classList.toggle('on', b.dataset.v === mk)); }
    $('voiceBtn').classList.toggle('on', !!this.app.voiceOn);
  }

  // ------------------------------------------------ 遊んでいる間
  playing(on) {
    document.body.classList.toggle('playing', on);
    $('pauseBtn').classList.toggle('hide', !on);
    $('viewBtn').classList.toggle('hide', !on || this.app.mode === 'bat' || this.app.mode === 'pitch');
  }
  // 左上の点数板: 回・点数(ノックは何本目)・走者の塁・B/S/O。中身が変わった時だけ描き直し、アウト・走者が変わったら一瞬光らせる
  board(g) {
    const el = $('board');
    if (!g) { el.classList.add('hide'); this._bk = null; return; }
    const key = JSON.stringify([g.inning, g.half, g.score, g.bases, g.outs, g.balls, g.strikes, g.knock, g.sub]);
    if (key === this._bk) { el.classList.remove('hide'); return; }
    const prev = this._bs; this._bk = key; this._bs = { outs: g.outs, bases: (g.bases || []).join() };
    el.classList.remove('hide'); el.innerHTML = boardHTML(g);
    if (prev && (prev.outs !== g.outs || prev.bases !== (g.bases || []).join())) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  }
  digest(g, lines) {
    const el = $('digest');
    if (!g) { el.classList.add('hide'); return; }
    el.classList.remove('hide');
    el.querySelector('.dgBoard').innerHTML = boardHTML(g);
    const box = el.querySelector('.dgLines');
    const show = lines.slice(-3);
    if (box.dataset.n !== String(lines.length)) {
      box.innerHTML = show.map((t, i) => `<div class="${i < show.length - 1 ? 'old' : ''}"></div>`).join('');
      box.querySelectorAll('div').forEach((d, i) => (d.textContent = show[i]));
      box.dataset.n = String(lines.length);
    }
  }
  skip(show, raised) {
    const b = $('skipBtn');
    this._skipOn = !!show;
    // スマホは「次の場面へ」のボタンを出さない(自動で進む。飛ばしたい時は画面を 2 回たたく)
    if (this.touch && !this._dblSkip) {
      this._dblSkip = true; let last = 0; const down = new Map();
      // 11/21 なぞって視点を回した指は「たたく」に数えない(素早く 2 回なぞると場面が飛んで視点が戻っていた)。動きが 14px 未満・0.35 秒未満の指だけ数える
      document.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) down.set(t.identifier, { x: t.clientX, y: t.clientY, t: performance.now() }); }, { passive: true, capture: true });
      document.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0], d = t && down.get(t.identifier); for (const u of e.changedTouches) down.delete(u.identifier);
        if (!this._skipOn || e.target.closest('button,#stick,#pad,#acts')) return;
        const now = performance.now();
        if (!d || Math.hypot(t.clientX - d.x, t.clientY - d.y) >= 14 || now - d.t > 350) { last = 0; return; }
        if (now - last < 320) { last = 0; this.app.skip(); } else last = now;
      }, { passive: true });
    }
    b.classList.toggle('hide', !show || this.touch);
    b.classList.toggle('raised', !!raised);
  }
  acts(show, fly) {
    $('acts').classList.toggle('hide', !(show && this.touch)); $('btnCall').classList.toggle('hide', !fly);
    // PC: フライの時だけ右下に「E: オーライ」の小さな印
    if (!this.callKeyEl) {
      this.callKeyEl = document.createElement('div'); this.callKeyEl.id = 'callKey'; this.callKeyEl.innerHTML = '<kbd>E</kbd> オーライ'; document.body.appendChild(this.callKeyEl);
      const st = document.createElement('style');
      st.textContent = `#callKey{position:fixed;right:18px;bottom:64px;z-index:13;pointer-events:none;font:800 15px/1 var(--v4-body,sans-serif);color:#fff;background:rgba(13,58,36,.88);border:2px solid #ffd84a;border-radius:10px;padding:8px 12px;opacity:0;transition:opacity .12s}
#callKey.show{opacity:1}#callKey kbd{font:inherit;background:#ffd84a;color:#0d3a24;border-radius:5px;padding:1px 6px;margin-right:6px}
#btnCall:not(.hide){animation:callGlow .8s ease-in-out infinite alternate;background:#ffd84a;color:#0d3a24;font-weight:900}
@keyframes callGlow{from{box-shadow:0 0 0 0 rgba(255,216,74,.9)}to{box-shadow:0 0 18px 6px rgba(255,216,74,.55)}}`;
      document.head.appendChild(st);
    }
    this.callKeyEl.classList.toggle('show', !!(fly && !this.touch));
  }
  // 送球のボタン: hide / off(見せるだけ) / live(押せる)
  // 打つ前の状況(大きめに短く出して、小さく戻す)
  situation(o) {
    let el = $('sit');
    if (!el) { el = document.createElement('div'); el.id = 'sit'; document.body.appendChild(el); }
    el.innerHTML = `${diamondSVG(o.bases)}<div class="st"><b>${o.text}</b>${o.head ? `<span>${o.head}</span>` : ''}</div><div class="so">${[0, 1].map((i) => `<i class="${i < o.outs ? 'on' : ''}"></i>`).join('')}</div>`;
    el.classList.remove('hide', 'out'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this._sitT); this._sitT = setTimeout(() => { el.classList.remove('show'); el.classList.add('out'); }, o.ms || 1200);
  }
  // 1 プレーの評価(小さく、画面の上の方に 1 秒ほど)
  evalPop(text, kind) {
    let el = $('evalPop');
    if (!el) { el = document.createElement('div'); el.id = 'evalPop'; document.body.appendChild(el); }
    el.className = 'k-' + kind; el.textContent = text; void el.offsetWidth; el.classList.add('show');
    clearTimeout(this._evT); this._evT = setTimeout(() => el.classList.remove('show'), 1300);
  }
  padHint(bases) {
    this.padEl.querySelectorAll('.basebtn').forEach((b) => b.classList.toggle('hint', !!bases && bases.includes(+b.dataset.base)));
  }
  pad(state, cut) {
    const p = this.padEl;
    p.classList.toggle('hide', state === 'hide');
    p.classList.toggle('off', state === 'off');
    p.classList.toggle('live', state === 'live');
    p.querySelector('.cut').classList.toggle('hide', !cut);
  }
  // ------------------------------------------------ 結果
  result(r) {
    const head = $('resHead'), body = $('resBody');
    const avg = (a) => (a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const sec = (a) => (a && a.length ? avg(a).toFixed(2) + '秒' : '—');
    const kmh = (a) => (a && a.length ? Math.round(avg(a)) + 'km' : '—');
    const tile = (v, l, w) => `<div class="tile${w ? ' wide' : ''}"><b>${v}</b><span>${l}</span></div>`;
    const s = r.stats;
    if (r.kind === 'knock') {
      head.innerHTML = `${r.caught} / ${r.done}`;
      body.innerHTML = `<div class="resSub">ノック ${POS_LABEL[r.pos]} ${r.N}本${r.stopped ? '(途中まで)' : ''}${r.newBest ? ' ・ 自己ベスト' : ''}</div>`;
      const sr = (k) => (s.star && s.star[k] && s.star[k][1] ? `${s.star[k][0]}/${s.star[k][1]}` : '—');
      body.innerHTML += evalHTML(r.ev);
      body.innerHTML += `<div class="tiles">${tile(sr(1), '★ の成功')}${tile(sr(2), '★★ の成功')}${tile(sr(3), '★★★ の成功')}${tile(r.streak, '連続で捕れた')}${tile(`${r.correct}/${s.decisions}`, '正しい送球')}${tile(sec(s.transfer), '捕って投げるまで')}${tile(kmh(s.speed), '送球の速さ')}</div>`;
    } else {
      const g = r.g;
      const word = r.stopped ? '途中まで' : (g.result || '');
      head.innerHTML = word;
      const n = Math.max(9, g.inning);
      let t = `<table class="line"><tr><th></th>${Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('')}<th>計</th></tr>`;
      t += `<tr class="away"><th><i class="sw away"></i>相手<small>先攻</small></th>${Array.from({ length: n }, (_, i) => `<td>${g.line.them[i] ?? ''}</td>`).join('')}<td class="t">${g.score.them}</td></tr>`;
      t += `<tr class="me"><th><i class="sw home"></i>自分<small>後攻</small></th>${Array.from({ length: n }, (_, i) => `<td>${g.line.us[i] ?? (g.over && !r.stopped && i === g.inning - 1 ? 'X' : '')}</td>`).join('')}<td class="t">${g.score.us}</td></tr></table>`;
      const dd = g.score.us - g.score.them;
      body.innerHTML = `<div class="resSub">相手(先攻) ${g.score.them} - ${g.score.us} 自分(後攻) ・ ${dd > 0 ? dd + '点差で勝ち' : dd < 0 ? -dd + '点差で負け' : '同点'} ・ ${POS_LABEL[r.pos]}</div>` + t + evalHTML(r.ev) + `<div class="tiles">${tile(s.caught, '捕った')}${tile(s.outs, 'アウトにした')}${tile(`${s.correct}/${s.decisions}`, '正しい塁の判断')}${tile(s.cover, 'カバー成功')}${tile(s.errors, 'エラー')}${tile(sec(s.transfer), '捕って投げるまで')}</div>`;
    }
    $('resPos').classList.toggle('hide', false);
    this.lastResult = { ...r, posLabel: POS_LABEL[r.pos] };   // 11/27 X でシェアの絵と文(js/share_x.js)
    this.show('result', true);
    animateEval(body);
  }
}
