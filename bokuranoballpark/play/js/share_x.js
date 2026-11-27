// 11/27 持ち主「ハッシュタグ付きでツイートして宣伝ができる機能を入れてください。クリアしたらツイートできるみたいに、動画付きとか画像付きで」
// 結果の画面(守備の試合・ノック・キャリアの試合・キャリア完了)とリプレイの画面の「X でシェア」から、絵(または動画)と文を作って出す。
// - 絵: その場面の結果を canvas で 1200x630 に描く。
// - 動画: リプレイの画面で押した時だけ、リプレイを流しながら WebGL の canvas を写して MediaRecorder で数秒録る(遊んでいる間は何もしない)。
//   MediaRecorder・captureStream が無い・iOS で mp4 が録れない時は、リプレイの今の場面の絵だけ。
// - 出し方: アプリ(Capacitor)は @capacitor/share + @capacitor/filesystem があれば共有シートへ。無ければ navigator.share(ファイル付き)、
//   それも無ければ X の投稿画面(x.com/intent/post)を開き、絵・動画は「保存」から付けてもらう。PC は X の投稿画面を新しいタブで。
// 遊んでいる最中の毎こまの処理は足していない(defense-eval の出来事で、どのプレーがファインプレーかを覚えるだけ)。

const TAGS = '#ぼくらのボールパーク #野球ゲーム #守備';
const URL_IOS = 'https://apps.apple.com/jp/app/id6837152603';
const URL_WEB = 'https://yurustudio.github.io/bokuranoballpark/play/';
const cap = () => window.Capacitor;
const platform = () => { try { const C = cap(); return C && C.getPlatform ? C.getPlatform() : 'web'; } catch (e) { return 'web'; } };
const isNative = () => { try { const C = cap(); return !!(C && (C.isNativePlatform ? C.isNativePlatform() : platform() !== 'web')); } catch (e) { return false; } };
const coarse = () => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } };
export const shareUrl = () => (platform() === 'ios' ? URL_IOS : URL_WEB);   // Android は一般公開の前なので Play の URL は入れない
export const withTags = (body) => `${body}\n${TAGS}\n${shareUrl()}`;
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sgn = (x) => (x >= 0 ? '+' : '−') + Math.abs(+x || 0).toFixed(1);
const FONT = '"Dela Gothic One",sans-serif';
const RANK_C = { S: '#ffcf33', A: '#ff6b4a', B: '#4fb3ff', C: '#5fd38a', D: '#a7b0c4' };

// ---------------------------------------------------------------- 絵の部品
function newCanvas(W = 1200, H = 630) { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
async function fonts() { try { await Promise.race([document.fonts.load(`900 40px ${FONT}`), new Promise((r) => setTimeout(r, 1200))]); } catch (e) { /* 無くても描ける */ } }
// 夜の球場の地(紺の空・照明の光・緑の芝)。生成りの無地は使わない
function ground(g, W, H) {
  const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#071433'); sky.addColorStop(0.55, '#10306a'); sky.addColorStop(0.56, '#1b6a33'); sky.addColorStop(1, '#0f4a22');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  for (const [x, a] of [[W * 0.12, 0.22], [W * 0.88, 0.22], [W * 0.5, 0.12]]) { const l = g.createRadialGradient(x, 0, 0, x, 0, H * 0.75); l.addColorStop(0, `rgba(255,248,214,${a})`); l.addColorStop(1, 'rgba(255,248,214,0)'); g.fillStyle = l; g.fillRect(0, 0, W, H); }
  g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-40, H); g.lineTo(W * 0.5, H * 0.56); g.lineTo(W + 40, H); g.stroke();
}
function brand(g, W, H) {
  g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = '#ffe08a'; g.font = `900 34px ${FONT}`; g.fillText('ぼくらのボールパーク', 44, 66);
  g.fillStyle = 'rgba(255,255,255,.78)'; g.font = '700 20px sans-serif'; g.fillText('守って、歩いて、球場まるごと', 46, 96);
}
function stamp(g, x, y, r, txt) {
  const c = RANK_C[txt] || '#ffcf33';
  g.save(); g.translate(x, y); g.rotate(-0.12);
  g.fillStyle = 'rgba(10,16,40,.55)'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.lineWidth = r * 0.1; g.strokeStyle = c; g.beginPath(); g.arc(0, 0, r * 0.92, 0, Math.PI * 2); g.stroke();
  g.lineWidth = r * 0.03; g.beginPath(); g.arc(0, 0, r * 0.74, 0, Math.PI * 2); g.stroke();
  g.fillStyle = c; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${Math.round(r * 1.1)}px ${FONT}`; g.fillText(txt || '-', 0, r * 0.06);
  g.restore(); g.textBaseline = 'alphabetic';
}
function tiles(g, x, y, w, items, h = 104) {
  const gap = 14, n = items.length, tw = (w - gap * (n - 1)) / n;
  items.forEach(([v, l, col], i) => {
    const tx = x + i * (tw + gap); rrect(g, tx, y, tw, h, 14); g.fillStyle = 'rgba(8,16,44,.72)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2; g.stroke();
    g.textAlign = 'center'; g.fillStyle = col || '#fff'; g.font = `900 ${String(v).length > 5 ? 34 : 44}px ${FONT}`; g.fillText(String(v), tx + tw / 2, y + 56);
    g.fillStyle = 'rgba(255,255,255,.8)'; fitText(g, l, tw - 12, 19); g.fillText(l, tx + tw / 2, y + 88);
  });
}
function fitText(g, t, maxW, size, weight = '700', fam = 'sans-serif') { let s = size; do { g.font = `${weight} ${s}px ${fam}`; s -= 2; } while (g.measureText(t).width > maxW && s > 12); }

// ---------------------------------------------------------------- 場面ごとの絵と文
// 守備の試合・ノックの結果(js/ui.js の result の r)
async function gameImage(r) {
  await fonts();
  const cv = newCanvas(), g = cv.getContext('2d'), W = cv.width, H = cv.height; ground(g, W, H); brand(g, W, H);
  const s = r.stats || {}, ev = r.ev || {}, fine = (s.ev && s.ev.fine) || 0;
  g.textAlign = 'left'; g.fillStyle = '#fff';
  if (r.kind === 'knock') {
    g.font = "900 54px sans-serif"; g.fillText(`ノック ${r.posLabel || ''} ${r.N}本`, 44, 190);
    g.font = `900 120px ${FONT}`; g.fillStyle = '#ffe08a'; g.fillText(`${r.caught} / ${r.done}`, 44, 330);
    g.fillStyle = '#fff'; g.font = '700 30px sans-serif'; g.fillText(r.newBest ? '捕った数 ・ 自己ベスト!' : '捕った数', 50, 378);
    tiles(g, 44, 430, 760, [[r.streak ?? 0, '連続で捕れた'], [`${r.correct ?? 0}/${s.decisions ?? 0}`, '正しい送球'], [fine, 'ファインプレー', fine ? '#ffcf33' : '#fff']]);
  } else {
    const G = r.g || { score: { us: 0, them: 0 } }, us = G.score.us, them = G.score.them;
    const word = r.stopped ? '途中まで' : us > them ? '勝ち!' : us < them ? '負け' : '引き分け';
    g.font = "900 42px sans-serif"; g.fillText(`守備の試合 ・ ${r.posLabel || ''}`, 44, 176);
    g.font = `900 110px ${FONT}`; g.fillStyle = us > them && !r.stopped ? '#ffe08a' : '#fff'; g.fillText(word, 44, 300);
    g.fillStyle = '#fff'; g.font = '900 46px sans-serif'; g.fillText(`自分 ${us} - ${them} 相手`, 48, 366);
    tiles(g, 44, 410, 760, [[s.outs ?? 0, 'アウトにした'], [s.caught ?? 0, '捕った'], [fine, 'ファインプレー', fine ? '#ffcf33' : '#fff'], [s.errors ?? 0, 'エラー']]);
  }
  if (ev.best) { g.textAlign = 'left'; g.fillStyle = '#ffcf33'; g.font = '900 24px sans-serif'; g.fillText('名場面', 46, 574); g.fillStyle = '#fff'; fitText(g, ev.best, 640, 24); g.fillText(ev.best, 150, 574); }
  if (ev.rank && ev.rank !== '—') {
    stamp(g, 1000, 300, 120, ev.rank);
    g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '700 26px sans-serif'; g.fillText('守備の評価', 1000, 150);
    g.font = `900 40px ${FONT}`; g.fillText(`${ev.score ?? 0} 点`, 1000, 476);
  }
  let body;
  if (r.kind === 'knock') body = `ノック ${r.posLabel || ''} ${r.N}本で ${r.caught}本捕った!${ev.rank && ev.rank !== '—' ? `守備の評価 ${ev.rank}` : ''}${fine ? `・ファインプレー ${fine}` : ''} ⚾`;
  else {
    const G = r.g, us = G.score.us, them = G.score.them, word = r.stopped ? '途中まで' : us > them ? '勝ち' : us < them ? '負け' : '引き分け';
    body = `守備の試合、${r.stopped ? `${us}対${them}まで守った` : `${us}対${them}で${word}`}!${r.posLabel || ''}でアウト ${s.outs ?? 0}${fine ? `・ファインプレー ${fine}` : ''}${ev.rank && ev.rank !== '—' ? `・守備の評価 ${ev.rank}` : ''} ⚾`;
  }
  return { canvas: cv, text: withTags(body), name: 'bokura_game.png' };
}
// 守備のキャリアの試合の結果(js/career_ui.js の result の r)
async function careerGameImage(r, K, D) {
  await fonts();
  const cv = newCanvas(), g = cv.getContext('2d'), W = cv.width, H = cv.height; ground(g, W, H); brand(g, W, H);
  const st = K.STAGES[r.stage] || {}, next = r.promoted ? (K.STAGES[r.stage + 1] || {}).name : '';
  g.textAlign = 'left'; g.fillStyle = '#fff'; g.font = "900 42px sans-serif"; g.fillText(`守備のキャリア ・ ${st.long || st.name || ''} 第${r.game}戦`, 44, 176);
  g.font = '700 30px sans-serif'; g.fillStyle = '#cfe0ff'; g.fillText(`${D.name || ''} ・ ${K.POS_NAME[r.pos] || r.pos || ''}${r.score2 ? ` ・ ${r.won ? '勝ち' : r.score2.us === r.score2.them ? '引き分け' : '負け'} ${r.score2.us}-${r.score2.them}` : ''}`, 46, 222);
  if (next) { rrect(g, 44, 250, 560, 74, 12); g.fillStyle = '#d62828'; g.fill(); g.fillStyle = '#fff'; g.font = `900 44px ${FONT}`; g.fillText(`${next}へ昇格!`, 70, 303); }
  tiles(g, 44, next ? 360 : 290, 760, [[K.uzrText(r.uzr), 'UZR', r.uzr >= 0 ? '#7dff9e' : '#ff9a8a'], [r.po, '刺殺'], [r.a, '補殺'], [r.e, '失策']], next ? 110 : 130);
  stamp(g, 1000, 300, 120, r.rank); g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '700 26px sans-serif'; g.fillText('守備評価', 1000, 150);
  if (r.score != null) { g.font = `900 40px ${FONT}`; g.fillText(`${r.score} 点`, 1000, 476); }
  const body = `守備のキャリア ${st.name || ''} 第${r.game}戦、守備評価 ${r.rank}・UZR ${K.uzrText(r.uzr)}${next ? `。${next}へ昇格!` : ''} ⚾ 最高の守備職人を目指せ`;
  return { canvas: cv, text: withTags(body), name: 'bokura_career.png' };
}
// キャリア完了(最終評価・称号・UZR・選手カード)。c は殿堂のカード(career.js の makeCard)
async function careerDoneImage(c, K) {
  await fonts();
  const cv = newCanvas(), g = cv.getContext('2d'), W = cv.width, H = cv.height; ground(g, W, H);
  const L = window.__bpLocker;
  try { if (L && L.drawCard) await L.drawCard(g, c, 40, 40, 400, 548); } catch (e) { /* カードなしで */ }
  const P = c.pro || { games: 0, po: 0, a: 0, e: 0, uzr: 0, adj: 0 };
  g.textAlign = 'left'; g.fillStyle = '#ffe08a'; g.font = `900 30px ${FONT}`; g.fillText('ぼくらのボールパーク', 480, 84);
  g.fillStyle = '#fff'; g.font = `900 64px ${FONT}`; g.fillText('キャリア完了!', 476, 166);
  g.fillStyle = '#cfe0ff'; fitText(g, `${c.name || ''} ・ 背番号 ${c.num ?? ''} ・ ${K.POS_NAME[c.pos] || c.pos || ''}`, 460, 30); g.fillText(`${c.name || ''} ・ 背番号 ${c.num ?? ''} ・ ${K.POS_NAME[c.pos] || c.pos || ''}`, 480, 214);
  g.fillStyle = '#ffcf33'; fitText(g, `〈${c.title || ''}〉`, 470, 38, '900'); g.fillText(`〈${c.title || ''}〉`, 474, 268);
  stamp(g, 1056, 172, 100, c.grade); g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '700 22px sans-serif'; g.fillText('最終評価', 1056, 52); g.font = `900 30px ${FONT}`; g.fillText(`${c.score ?? 0} 点`, 1056, 312);
  g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '700 22px sans-serif'; g.fillText(`プロ通算 ${P.games} 試合`, 480, 330);
  tiles(g, 476, 350, 690, [[sgn(P.adj), 'UZR(補正あり)', P.adj >= 0 ? '#7dff9e' : '#ff9a8a'], [K.fpctText(P.po, P.a, P.e), '守備率'], [P.po, '刺殺'], [P.a, '補殺'], [P.e, '失策']], 112);
  g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '700 24px sans-serif'; g.fillText('殿堂入り ・ 最高の守備職人を目指せ', 480, 520);
  const body = `守備のキャリア完了!最終評価 ${c.grade}・UZR ${sgn(P.adj)}「${c.title || ''}」⚾ 最高の守備職人を目指せ`;
  return { canvas: cv, text: withTags(body), name: 'bokura_career_done.png' };
}

// ---------------------------------------------------------------- リプレイ(動画・録れない時は今の場面の絵)
const PLAY_WORD = (f) => (!f ? '' : f.special === 'dive' ? 'ダイビングキャッチ!' : f.special === 'jump' ? 'ジャンピングキャッチ!' : f.outs >= 2 ? 'ゲッツー!' : f.kind === 'fine' ? 'ファインプレー!' : '');
// どのプレーがファインプレーだったか(リプレイの覚えに印を付けるだけ。毎こまの処理はなし)
window.addEventListener('defense-eval', (e) => {
  try {
    const d = e.detail || {}, rp = window.__app && window.__app.replay, R = rp && rp.cur;
    if (!R || rp.on) return;
    if (d.kind === 'fine' || d.special === 'dive' || d.special === 'jump' || (d.outs || 0) >= 2) R.fine = { kind: d.kind, special: d.special, outs: d.outs || 0, t: R.t };
  } catch (er) { /* なし */ }
});
const MIMES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
export function videoMime() {
  try {
    if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
    const ok = MIMES.filter((m) => MediaRecorder.isTypeSupported(m));
    const mp4 = ok.find((m) => m.startsWith('video/mp4'));
    if (platform() === 'ios' || /iPhone|iPad|iPod/.test(navigator.userAgent) || isNative()) return mp4 || null;   // iOS とアプリは mp4 だけ(X は webm を受け付けない。保存もできないので絵にする)
    if (new URLSearchParams(location.search).get('sharewebm') === '1') return ok.find((m) => m.startsWith('video/webm')) || mp4 || null;   // 試験で webm を見る
    return mp4 || ok[0] || null;   // X は mp4 を受け付ける。webm しか録れない所は webm(保存して使う)
  } catch (e) { return null; }
}
// 録る絵の大きさ: 長い辺 1280 まで・下に字幕の帯(画面の中身に字を重ねない)
function recSize(src) {
  const k = Math.min(1, 1280 / Math.max(src.width, src.height)), ev = (x) => Math.max(2, Math.round(x / 2) * 2);
  const w = ev(src.width * k), sh = ev(src.height * k), band = ev(Math.max(44, Math.min(w, sh) * 0.08));
  return { w, sh, band, h: sh + band };
}
function drawBand(g, w, sh, band, word) {
  g.fillStyle = '#0a1438'; g.fillRect(0, sh, w, band);
  g.fillStyle = '#ffb703'; g.fillRect(0, sh, w, Math.max(2, band * 0.06));
  const fs = Math.round(band * 0.42); g.textBaseline = 'middle';
  g.textAlign = 'left'; g.fillStyle = '#ffe08a'; g.font = `900 ${fs}px ${FONT}`; g.fillText('ぼくらのボールパーク', band * 0.3, sh + band * 0.54);
  if (word) { g.textAlign = 'right'; g.fillStyle = '#fff'; g.fillText(word, w - band * 0.3, sh + band * 0.54); }
  g.textBaseline = 'alphabetic';
}
// 今のリプレイの場面を 1 枚(録れない所・録るのに失敗した時)
async function replayStill(rp) {
  await fonts();
  const src = window.__app.renderer.domElement;
  const S = recSize(src), cv = newCanvas(S.w, S.h), g = cv.getContext('2d');
  await new Promise((res) => { const prev = rp.onFrame; rp.onFrame = () => { rp.onFrame = prev; try { g.drawImage(src, 0, 0, S.w, S.sh); } catch (e) { /* なし */ } res(); }; setTimeout(res, 800); });
  drawBand(g, S.w, S.sh, S.band, PLAY_WORD(rp.rec && rp.rec.fine) || 'リプレイ');
  return cv;
}
// リプレイを流しながら録る。録っている間だけ 1 こまずつ写す。opts.max 秒まで
export async function recordReplay(rp, opts = {}) {
  const mime = videoMime(); if (!mime) return null;
  await fonts();
  const R = rp.rec, F = R.frames, dur = rp.dur, f = R.fine, maxS = opts.max || 8;
  const fineT = f ? f.t - F[0].t : null;
  const t1 = fineT != null ? Math.min(dur, fineT + 1.2) : Math.min(dur, maxS), t0 = Math.max(0, t1 - maxS);
  const src = window.__app.renderer.domElement, S = recSize(src);
  const cv = newCanvas(S.w, S.h), g = cv.getContext('2d', { alpha: false });
  const word = PLAY_WORD(f) || 'リプレイ';
  g.fillStyle = '#000'; g.fillRect(0, 0, S.w, S.sh); drawBand(g, S.w, S.sh, S.band, word);
  const stream = cv.captureStream(30);
  let rec; try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4000000 }); } catch (e) { try { rec = new MediaRecorder(stream); } catch (e2) { return null; } }
  const chunks = []; rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const save = { t: rp.t, playing: rp.playing, speed: rp.speed, onFrame: rp.onFrame };
  let poster = null, frames = 0;
  const done = new Promise((res) => { rec.onstop = res; });
  rp.t = t0; rp.speed = 1; rp.playing = true; rp.snapCam = true; rp.recording = true; rp.paintBtns && rp.paintBtns();
  const fin = () => { if (rec.state !== 'inactive') { try { rec.requestData(); } catch (e) { /* なし */ } rec.stop(); } };
  rp.onFrame = () => {
    try { g.drawImage(src, 0, 0, S.w, S.sh); } catch (e) { /* なし */ }
    frames++;
    if (opts.onProgress) opts.onProgress(Math.min(1, (rp.t - t0) / Math.max(0.1, t1 - t0)));
    if (!poster && (fineT == null ? rp.t >= (t0 + t1) / 2 : rp.t >= fineT - 0.2)) { poster = newCanvas(S.w, S.h); poster.getContext('2d').drawImage(cv, 0, 0); }
    if (rp.t >= t1 - 1e-3 || !rp.playing || !rp.on) fin();
  };
  rec.start(250);
  const guard = setTimeout(fin, (t1 - t0 + 3) * 1000);
  await done; clearTimeout(guard);
  rp.onFrame = save.onFrame; rp.recording = false;
  if (rp.on) { rp.t = save.t; rp.speed = save.speed; rp.playing = false; rp.snapCam = true; rp.paintBtns && rp.paintBtns(); }
  stream.getTracks().forEach((t) => t.stop());
  const type = (rec.mimeType || mime).split(';')[0];
  const blob = new Blob(chunks, { type });
  if (!blob.size || frames < 5) return null;
  if (!poster) { poster = newCanvas(S.w, S.h); poster.getContext('2d').drawImage(cv, 0, 0); }
  return { blob, type, ext: type === 'video/mp4' ? 'mp4' : 'webm', poster, secs: Math.round((t1 - t0) * 10) / 10, frames, w: S.w, h: S.h };
}
async function replayShare(rp, btn) {
  if (!rp || !rp.on || rp.recording) return;
  const f = rp.rec && rp.rec.fine, word = PLAY_WORD(f);
  const body = word ? `${word.replace(/!$/, '')}を決めた!⚾ 自分の守備をいろんな視点から見返せる` : '自分の守備をリプレイで ⚾ いろんな視点から見返せる';
  const text = withTags(body);
  const lab = btn ? btn.textContent : '';
  let out = null;
  if (videoMime()) {
    try { out = await recordReplay(rp, { onProgress: (u) => { if (btn) btn.textContent = `録画中 ${Math.round(u * 100)}%`; } }); } catch (e) { console.warn(e); out = null; }
  }
  if (btn) btn.textContent = lab;
  if (!rp.on) return;
  if (out) {
    window.__bpShareLast = { kind: 'replay', text, video: { type: out.type, size: out.blob.size, secs: out.secs, frames: out.frames, w: out.w, h: out.h }, poster: out.poster.toDataURL('image/jpeg', 0.85) };
    window.__bpShareLastVideo = out.blob;
    sheet({ blob: out.blob, name: `bokura_replay.${out.ext}`, text, alt: 'リプレイの動画', poster: out.poster, video: true });
  } else {
    const cv = await replayStill(rp);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    window.__bpShareLast = { kind: 'replay', text, video: null, image: cv.toDataURL('image/jpeg', 0.85) };
    sheet({ blob, name: 'bokura_replay.png', text, alt: 'リプレイの絵' });
  }
}

// ---------------------------------------------------------------- 出し方
function b64(blob) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = rej; fr.readAsDataURL(blob); }); }
const intentUrl = (text) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
function openIntent(text) {
  const u = intentUrl(text);
  try {
    const C = cap(), B = C && C.Plugins && C.Plugins.Browser;
    if (isNative() && B && B.open) { B.open({ url: u }); return 'browser'; }
  } catch (e) { /* 下へ */ }
  const w = window.open(u, '_blank', 'noopener'); if (!w && isNative()) location.href = u;   // アプリは外の URL を外のブラウザで開く
  return 'intent';
}
// アプリの部品(@capacitor/share + @capacitor/filesystem)があればそれで。無ければ navigator.share(ファイル付き)。どれも無ければ X の投稿画面
export async function send({ blob, name, text }) {
  const C = cap(), P = (C && C.Plugins) || {};
  if (isNative() && P.Share && P.Share.share) {
    try {
      let files;
      if (blob && P.Filesystem && P.Filesystem.writeFile) {
        const w = await P.Filesystem.writeFile({ path: `share/${Date.now()}_${name}`, data: await b64(blob), directory: 'CACHE', recursive: true });
        files = [w.uri];
      }
      await P.Share.share(files ? { text, files, dialogTitle: 'シェア' } : { text, dialogTitle: 'シェア' });
      return 'capacitor';
    } catch (e) { if (/cancel/i.test(String(e && (e.message || e)))) return 'cancel'; console.warn('share', e); }
  }
  const file = blob ? new File([blob], name, { type: blob.type }) : null;
  if ((coarse() || isNative()) && navigator.share) {
    try {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return 'web-files'; }
      if (isNative()) { await navigator.share({ text }); return 'web-text'; }
    } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  return openIntent(text);
}
// 出す前の確かめの画面: 絵(動画)・文・「X でシェア(共有)」・「保存」・「閉じる」。共有は押した時に呼ぶ(スマホの共有は押した直後でないと断られるため)
let sheetEl = null, sheetUrl = null;
const CSS = `#bpXShare{position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;background:rgba(4,8,24,.72);padding:max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom));font-family:system-ui,sans-serif}
#bpXShare.hide{display:none}
#bpXShare .xsBox{background:#0f1d47;border:2px solid #ffb703;border-radius:16px;padding:14px;max-width:min(560px,100%);max-height:100%;overflow:auto;display:flex;flex-direction:column;gap:10px;color:#fff}
#bpXShare .xsMedia{width:100%;max-height:52vh;object-fit:contain;border-radius:10px;background:#000}
#bpXShare .xsText{white-space:pre-wrap;font:600 14px/1.5 system-ui,sans-serif;background:rgba(255,255,255,.08);border-radius:8px;padding:8px 10px;margin:0}
#bpXShare .xsRow{display:flex;gap:8px;flex-wrap:wrap}
#bpXShare .xsRow>*{flex:1;min-width:110px;text-align:center;text-decoration:none;font:800 15px system-ui,sans-serif;border-radius:10px;padding:11px 10px;cursor:pointer;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff}
#bpXShare .xsGo{background:#000;border-color:#fff}
#bpXShare .xsNote{font-size:12px;color:#cfe0ff;margin:0}
#result #resShare{grid-column:1 / -1;justify-self:center;min-height:38px;height:38px;margin-top:8px;padding:0 24px;border:1px solid rgba(255,255,255,.75);border-image:none;background:#000;color:#fff;border-radius:19px;font:800 15px system-ui,sans-serif;-webkit-text-stroke:0;text-shadow:none;box-shadow:none}
#result #resShare::before,#result #resShare::after{display:none}
#carRes .xShareBtn{display:block;margin:8px auto 0;min-height:38px;padding:0 24px;background:#000;color:#fff;border:1px solid rgba(255,255,255,.75);border-radius:19px;font:800 15px system-ui,sans-serif;box-shadow:none;text-shadow:none}`;
function ensureCss() { if (document.getElementById('bpXShareCss')) return; const s = document.createElement('style'); s.id = 'bpXShareCss'; s.textContent = CSS; document.head.appendChild(s); }
export function sheet(o) {
  ensureCss();
  if (!sheetEl) {
    sheetEl = document.createElement('div'); sheetEl.id = 'bpXShare'; document.body.appendChild(sheetEl);
    for (const ev of ['pointerdown', 'click', 'touchstart', 'keydown']) sheetEl.addEventListener(ev, (e) => e.stopPropagation());
    sheetEl.addEventListener('click', (e) => { if (e.target === sheetEl || e.target.closest('[data-xs="close"]')) close(); });
  }
  if (sheetUrl) URL.revokeObjectURL(sheetUrl);
  sheetUrl = o.blob ? URL.createObjectURL(o.blob) : '';
  const native = isNative(), mobile = native || coarse();
  const media = o.video ? `<video class="xsMedia" src="${sheetUrl}" ${o.poster ? `poster="${o.poster.toDataURL('image/jpeg', 0.8)}"` : ''} controls playsinline muted loop autoplay></video>`
    : `<img class="xsMedia" src="${sheetUrl}" alt="${esc(o.alt || '')}">`;
  const go = mobile ? '<button class="xsGo" data-xs="go">X でシェア</button>' : `<a class="xsGo" data-xs="go" href="${intentUrl(o.text)}" target="_blank" rel="noopener">X で投稿する</a>`;
  const save = native ? '' : `<a data-xs="save" href="${sheetUrl}" download="${esc(o.name)}">${o.video ? '動画' : '絵'}を保存</a>`;
  const note = mobile ? '' : `<p class="xsNote">X の投稿画面が開きます。${o.video ? '動画' : '絵'}は「保存」してから投稿に付けてください</p>`;
  sheetEl.innerHTML = `<div class="xsBox" role="dialog" aria-label="X でシェア">${media}<p class="xsText">${esc(o.text)}</p>${note}<div class="xsRow">${go}${save}<button data-xs="close">閉じる</button></div></div>`;
  sheetEl.classList.remove('hide');
  const b = sheetEl.querySelector('button[data-xs="go"]');
  if (b) b.addEventListener('click', async () => { b.disabled = true; try { window.__bpShareSent = await send(o); } finally { b.disabled = false; } });
  window.__bpShareSheet = { text: o.text, name: o.name, type: o.blob ? o.blob.type : '', size: o.blob ? o.blob.size : 0, video: !!o.video, mobile, native };
  return sheetEl;
}
function close() {
  if (!sheetEl) return; sheetEl.classList.add('hide');
  const v = sheetEl.querySelector('video'); if (v) v.pause();
  sheetEl.innerHTML = ''; if (sheetUrl) { URL.revokeObjectURL(sheetUrl); sheetUrl = null; }
}

// ---------------------------------------------------------------- 場面の入口(結果の画面のボタンから呼ぶ)
async function fromCanvas(kind, p) {
  const blob = await new Promise((r) => p.canvas.toBlob(r, 'image/png'));
  window.__bpShareLast = { kind, text: p.text, image: p.canvas.toDataURL('image/jpeg', 0.85) };
  return sheet({ blob, name: p.name, text: p.text, alt: '結果の絵' });
}
let busy = false;
const once = (fn) => async (...a) => { if (busy) return null; busy = true; try { return await fn(...a); } catch (e) { console.warn('share', e); return null; } finally { busy = false; } };
export const game = once(async (r) => fromCanvas(r.kind === 'knock' ? 'knock' : 'game', await gameImage(r)));
export const careerGame = once(async (r) => { const C = window.__career; return fromCanvas('career', await careerGameImage(r, C.K, C.data)); });
export const careerDone = once(async (c) => { const C = window.__career; return fromCanvas('careerDone', await careerDoneImage(c, C.K)); });
export const replay = once(async (rp, btn) => replayShare(rp, btn));

// 守備の試合・ノックの結果の画面のボタン(index.html の #resShare)。中身は js/ui.js の result が覚えた lastResult
ensureCss();
{ const b = document.getElementById('resShare'); if (b) b.addEventListener('click', (e) => { e.stopPropagation(); const ui = window.__app && window.__app.ui; if (ui && ui.lastResult) game(ui.lastResult); }); }
window.__bpShareX = { game, careerGame, careerDone, replay, send, sheet, close, withTags, shareUrl, videoMime, recordReplay, TAGS };
