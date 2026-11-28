// 11/27 持ち主「ハッシュタグ付きでツイートして宣伝ができる機能を入れてください。クリアしたらツイートできるみたいに、動画付きとか画像付きで」
// 結果の画面(守備の試合・ノック・キャリアの試合・キャリア完了)とリプレイの画面の「X でシェア」から、絵(または動画)と文を作って出す。
// - 絵: その場面の結果を canvas で 1200x630 に描く。
// - 動画: リプレイの画面で押した時だけ、リプレイを流しながら WebGL の canvas を写して MediaRecorder で数秒録る(遊んでいる間は何もしない)。
//   MediaRecorder・captureStream が無い・iOS で mp4 が録れない時は、リプレイの今の場面の絵だけ。
// - 出し方: アプリ(Capacitor)は @capacitor/share + @capacitor/filesystem があれば共有シートへ。無ければ navigator.share(ファイル付き)、
//   それも無ければ X の投稿画面(x.com/intent/post)を開き、絵・動画は「保存」から付けてもらう。PC は X の投稿画面を新しいタブで。
// 遊んでいる最中の毎こまの処理は足していない(defense-eval の出来事で、どのプレーがファインプレーかを覚えるだけ)。
// 11/27 夜 持ち主「X でシェアは動画がシェアできるようにしてください。ハッシュタグ付けて」:
// - 試合・ノック・キャリアの試合の結果でも、押した時にその試合の一番よいプレー(飛び込み・ジャンプ・ゲッツー・ファインプレー、無ければ最後のアウト)の
//   リプレイをその場で流して録る(録る間だけ「動画を作っています」)。その試合の覚え(replay.keep)は 1 つだけ持つ(印を付けた時に差し替えるだけ)。
// - キャリア完了は選手カードが寄る・数が数え上がる・判子が押される数秒の動画(2D の canvas)。
// - 録れない所(MediaRecorder・captureStream が無い・iOS とアプリで mp4 が無い)は今までの絵。
// - ハッシュタグは 5 つ(飛び込みの動画は #ダイビングキャッチ を足して 6 つ)。

const TAGS = '#ぼくらのボールパーク #野球ゲーム #守備 #野球好きと繋がりたい #インディーゲーム';
const TAG_DIVE = '#ダイビングキャッチ';
const URL_IOS = 'https://apps.apple.com/jp/app/id6837152603';
const URL_WEB = 'https://yurustudio.github.io/bokuranoballpark/play/';
const cap = () => window.Capacitor;
const platform = () => { try { const C = cap(); return C && C.getPlatform ? C.getPlatform() : 'web'; } catch (e) { return 'web'; } };
const isNative = () => { try { const C = cap(); return !!(C && (C.isNativePlatform ? C.isNativePlatform() : platform() !== 'web')); } catch (e) { return false; } };
const coarse = () => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } };
export const shareUrl = () => (platform() === 'ios' ? URL_IOS : URL_WEB);   // Android は一般公開の前なので Play の URL は入れない
// 11/27 夜 持ち主「X でシェアは URL アイフォンも貼れるようにして」: どこから出しても iPhone(App Store)とブラウザ版の両方を貼る(Play はまだ貼らない)
export const shareUrls = () => `iPhone ${URL_IOS}\nブラウザ ${URL_WEB}`;
// 11/28 extra: 足すタグ(今日の守備チャレンジの「#今日の守備チャレンジ」)
export const withTags = (body, dive, extra) => `${body}\n${TAGS}${extra ? ' ' + extra : ''}${dive ? ' ' + TAG_DIVE : ''}\n${shareUrls()}`;
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sgn = (x) => (x >= 0 ? '+' : '−') + Math.abs(+x || 0).toFixed(2);   // 11/28 UZR を本物の大きさにしたので小数 2 桁
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
  return { canvas: cv, body, text: withTags(body), name: 'bokura_game.png' };
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
  return { canvas: cv, body, text: withTags(body), name: 'bokura_career.png' };
}
// キャリア完了(最終評価・称号・UZR・選手カード)。c は殿堂のカード(career.js の makeCard)
// 選手カードは 1 回だけ別の canvas に描いておき、絵・動画のどちらでも貼る
async function cardCanvas(c) {
  const L = window.__bpLocker; if (!L || !L.drawCard) return null;
  try { const cc = newCanvas(400, 548); await L.drawCard(cc.getContext('2d'), c, 0, 0, 400, 548); return cc; } catch (e) { return null; }
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const easeOut = (u) => 1 - Math.pow(1 - u, 3);
const easeBack = (u) => { const k = 1.6; return 1 + (k + 1) * Math.pow(u - 1, 3) + k * Math.pow(u - 1, 2); };
// T 秒目の絵(T を大きくすれば止まった絵)。0〜0.8 秒 カードが左から寄る・0.4〜 文字・0.9〜2.4 数が数え上がる・2.5〜 判子・3.1〜 カードに光
const DONE_SECS = 4.6;
function drawDone(g, c, K, card, T = 99) {
  const W = 1200, H = 630; ground(g, W, H);
  const P = c.pro || { games: 0, po: 0, a: 0, e: 0, uzr: 0, adj: 0 };
  const uc = easeBack(clamp01(T / 0.8)), uh = clamp01((T - 0.4) / 0.5), un = easeOut(clamp01((T - 0.9) / 1.5)), us = clamp01((T - 2.5) / 0.35);
  if (card) {
    g.save(); g.translate(-460 * (1 - uc) + 40 + 200, 40 + 274); g.rotate(-0.1 * (1 - uc)); g.scale(0.86 + 0.14 * uc, 0.86 + 0.14 * uc);
    g.drawImage(card, -200, -274, 400, 548);
    const sh = clamp01((T - 3.1) / 0.7);
    if (sh > 0 && sh < 1) { const x = -320 + 640 * sh, gr = g.createLinearGradient(x - 60, 0, x + 60, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.38)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.rect(-200, -274, 400, 548); g.fill(); }
    g.restore();
  }
  g.save(); g.globalAlpha = uh; g.translate(30 * (1 - uh), 0);
  g.textAlign = 'left'; g.fillStyle = '#ffe08a'; g.font = `900 30px ${FONT}`; g.fillText('ぼくらのボールパーク', 480, 84);
  g.fillStyle = '#fff'; g.font = `900 64px ${FONT}`; g.fillText('キャリア完了!', 476, 166);
  const who = `${c.name || ''} ・ 背番号 ${c.num ?? ''} ・ ${K.POS_NAME[c.pos] || c.pos || ''}`;
  g.fillStyle = '#cfe0ff'; fitText(g, who, 460, 30); g.fillText(who, 480, 214);
  g.fillStyle = '#ffcf33'; fitText(g, `〈${c.title || ''}〉`, 470, 38, '900'); g.fillText(`〈${c.title || ''}〉`, 474, 268);
  g.restore();
  if (us > 0) { g.save(); g.globalAlpha = us; g.translate(1056, 172); const k = 2.2 - 1.2 * easeOut(us); g.scale(k, k); g.translate(-1056, -172); stamp(g, 1056, 172, 100, c.grade); g.restore(); }
  g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '700 22px sans-serif'; g.fillText('最終評価', 1056, 52); g.font = `900 30px ${FONT}`; g.fillText(`${Math.round((c.score ?? 0) * un)} 点`, 1056, 312);
  g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '700 22px sans-serif'; g.fillText(`プロ通算 ${Math.round(P.games * un)} 試合`, 480, 330);
  const n = (v) => Math.round((+v || 0) * un);
  tiles(g, 476, 350, 690, [[sgn(P.adj * un), 'UZR(補正あり)', P.adj >= 0 ? '#7dff9e' : '#ff9a8a'], [un >= 1 ? K.fpctText(P.po, P.a, P.e) : '…', '守備率'], [n(P.po), '刺殺'], [n(P.a), '補殺'], [n(P.e), '失策']], 112);
  g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '700 24px sans-serif'; g.fillText('殿堂入り ・ 最高の守備職人を目指せ', 480, 520);
}
async function careerDoneImage(c, K) {
  await fonts();
  const cv = newCanvas(), card = await cardCanvas(c);
  drawDone(cv.getContext('2d'), c, K, card);
  const P = c.pro || { adj: 0 };
  const body = `守備のキャリア完了!最終評価 ${c.grade}・UZR ${sgn(P.adj)}「${c.title || ''}」⚾ 最高の守備職人を目指せ`;
  return { canvas: cv, card, body, text: withTags(body), name: 'bokura_career_done.png' };
}
// 2D の canvas に draw(T) を描きながら secs 秒を録る(キャリア完了の動画)
async function recordCanvas(cv, draw, secs, onProgress) {
  const mime = videoMime(); if (!mime) return null;
  const g = cv.getContext('2d');
  draw(g, 0);
  const stream = cv.captureStream(30);
  let rec; try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3000000 }); } catch (e) { try { rec = new MediaRecorder(stream); } catch (e2) { stream.getTracks().forEach((t) => t.stop()); return null; } }
  const chunks = []; rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise((res) => { rec.onstop = res; });
  let frames = 0, stopped = false;
  const fin = () => { if (stopped) return; stopped = true; draw(g, 99); if (rec.state !== 'inactive') { try { rec.requestData(); } catch (e) { /* なし */ } rec.stop(); } };
  rec.start(250);
  const t0 = performance.now();
  const step = () => {
    if (stopped) return;
    const T = (performance.now() - t0) / 1000;
    draw(g, Math.min(T, secs)); frames++;
    if (onProgress) onProgress(Math.min(1, T / secs));
    if (T >= secs) { setTimeout(fin, 120); return; }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  const guard = setTimeout(fin, (secs + 4) * 1000);
  await done; clearTimeout(guard);
  stream.getTracks().forEach((t) => t.stop());
  const type = (rec.mimeType || mime).split(';')[0], blob = new Blob(chunks, { type });
  if (!blob.size || frames < 10) return null;
  return { blob, type, ext: type === 'video/mp4' ? 'mp4' : 'webm', secs, frames, w: cv.width, h: cv.height };
}

// ---------------------------------------------------------------- リプレイ(動画・録れない時は今の場面の絵)
const PLAY_WORD = (f) => (!f ? '' : f.special === 'dive' ? 'ダイビングキャッチ!' : f.special === 'jump' ? 'ジャンピングキャッチ!' : f.outs >= 2 ? 'ゲッツー!' : f.kind === 'fine' ? 'ファインプレー!' : '');
// どのプレーがファインプレーだったか(リプレイの覚えに印を付けるだけ。毎こまの処理はなし)
// 11/27 夜: その試合の一番よいプレーの覚えを rp.keep に 1 つだけ残す(飛び込み 5・ジャンプ 4・ゲッツー 3・ファインプレー 2・アウト 1。同じ点なら後の方 = 最後のアウト)。
// R.gid はその試合の defense.stats(守備を始めるたびに作り直される)。別の試合の覚えは使わない。
let hlSeq = 0;
window.addEventListener('defense-eval', (e) => {
  try {
    const d = e.detail || {}, A = window.__app, rp = A && A.replay, R = rp && rp.cur, D = A && A.defense;
    if (!R || rp.on) return;
    if (d.kind === 'fine' || d.special === 'dive' || d.special === 'jump' || (d.outs || 0) >= 2) R.fine = { kind: d.kind, special: d.special, outs: d.outs || 0, t: R.t };
    const knock = D && D.kind === 'knock';
    const rank = d.special === 'dive' ? 5 : d.special === 'jump' ? 4 : (d.outs || 0) >= 2 ? 3 : d.kind === 'fine' ? 2
      : ((d.outs || 0) >= 1 && d.kind !== 'miss') || (knock && /^(ok|nice|judge)$/.test(d.kind || '')) ? 1 : 0;
    if (!rank || (R.hl && R.hl.rank > rank)) return;
    const pl = D && D.play, ct = pl && pl.caughtT != null && pl.t != null ? R.t - Math.max(0, pl.t - pl.caughtT) : null;   // 捕った時(リプレイの覚えの時刻)
    const h = { rank, kind: d.kind, special: d.special || null, outs: d.outs || 0, t: R.t, ct, seq: ++hlSeq };
    h.word = PLAY_WORD(h) || (d.kind === 'nice' ? 'ナイスプレー!' : knock ? 'ナイスキャッチ!' : 'アウト!');
    R.hl = h; R.gid = D && D.stats;
    const K = rp.keep;
    if (!K || K === R || K.gid !== R.gid || !K.hl || rank >= K.hl.rank) rp.keep = R;
  } catch (er) { /* なし */ }
});
// 結果の画面で使う覚え: 今の試合(defense.stats が同じ)の印つきの中で一番よい物。無ければ null(絵にする)
function bestRec(rp) {
  const D = window.__app && window.__app.defense, gid = D && D.stats;
  if (!rp || !gid) return null;
  let best = null;
  for (const R of [rp.keep, rp.last, rp.cur]) {
    if (!R || !R.hl || R.gid !== gid || !R.frames || R.frames.length <= 10) continue;
    if (!best || R.hl.rank > best.hl.rank || (R.hl.rank === best.hl.rank && R.hl.seq > best.hl.seq)) best = R;
  }
  return best;
}
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
  const R = rp.rec, F = R.frames, dur = rp.dur, f = opts.hl || R.fine, maxS = opts.max || 8;
  const fineT = f ? f.t - F[0].t : null, ctR = f && f.ct != null ? f.ct - F[0].t : null;
  let t1 = fineT != null ? Math.min(dur, fineT + 1.2) : Math.min(dur, maxS), t0 = Math.max(0, t1 - maxS);
  if (ctR != null) { t0 = Math.max(0, ctR - 4.5); t1 = Math.min(dur, Math.max(ctR + 2, fineT + 0.8), t0 + maxS); }   // 結果の動画: 捕る 4.5 秒前から、捕って 2 秒(送球のアウトまで)
  const src = window.__app.renderer.domElement, S = recSize(src);
  const cv = newCanvas(S.w, S.h), g = cv.getContext('2d', { alpha: false });
  const word = (opts.hl && opts.hl.word) || PLAY_WORD(f) || 'リプレイ';
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
  const text = withTags(body, f && f.special === 'dive');
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
#bpXShare.busy{background:rgba(4,8,24,.25);align-items:flex-end;padding-bottom:max(18px,env(safe-area-inset-bottom))}
#bpXShare .xsBusy{min-width:min(300px,90%);text-align:center;font:800 17px system-ui,sans-serif}
#bpXShare .xsBar{height:8px;border-radius:4px;background:rgba(255,255,255,.18);overflow:hidden}
#bpXShare .xsBar i{display:block;height:100%;width:0;background:#ffb703;transition:width .2s}
#result #resShare{grid-column:1 / -1;justify-self:center;min-height:38px;height:38px;margin-top:8px;padding:0 24px;border:1px solid rgba(255,255,255,.75);border-image:none;background:#000;color:#fff;border-radius:19px;font:800 15px system-ui,sans-serif;-webkit-text-stroke:0;text-shadow:none;box-shadow:none}
#result #resShare::before,#result #resShare::after{display:none}
#carRes .xShareBtn{display:block;margin:8px auto 0;min-height:38px;padding:0 24px;background:#000;color:#fff;border:1px solid rgba(255,255,255,.75);border-radius:19px;font:800 15px system-ui,sans-serif;box-shadow:none;text-shadow:none}`;
function ensureCss() { if (document.getElementById('bpXShareCss')) return; const s = document.createElement('style'); s.id = 'bpXShareCss'; s.textContent = CSS; document.head.appendChild(s); }
function ensureSheet() {
  if (sheetEl) return;
  sheetEl = document.createElement('div'); sheetEl.id = 'bpXShare'; document.body.appendChild(sheetEl);
  for (const ev of ['pointerdown', 'click', 'touchstart', 'keydown']) sheetEl.addEventListener(ev, (e) => e.stopPropagation());
  sheetEl.addEventListener('click', (e) => { if (sheetEl.classList.contains('busy')) return; if (e.target === sheetEl || e.target.closest('[data-xs="close"]')) close(); });
}
export function sheet(o) {
  ensureCss(); ensureSheet();
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
// 録る間だけの「動画を作っています」(共有の確かめの画面と同じ #bpXShare の中。リプレイの画面より上)
function busyShow(msg) {
  ensureCss(); ensureSheet();
  sheetEl.innerHTML = `<div class="xsBox xsBusy" role="status"><b>${esc(msg)}</b><div class="xsBar"><i></i></div><p class="xsNote">数秒で終わります</p></div>`;
  sheetEl.classList.remove('hide'); sheetEl.classList.add('busy');
  const bar = sheetEl.querySelector('.xsBar i');
  window.__bpShareBusy = true;
  return { set: (u) => { if (bar) bar.style.width = `${Math.round(clamp01(u) * 100)}%`; }, done: () => { window.__bpShareBusy = false; if (sheetEl) { sheetEl.classList.remove('busy'); sheetEl.classList.add('hide'); sheetEl.innerHTML = ''; } } };
}
function showVideo(kind, out, text, alt) {
  window.__bpShareLast = { kind, text, video: { type: out.type, size: out.blob.size, secs: out.secs, frames: out.frames, w: out.w, h: out.h }, poster: out.poster ? out.poster.toDataURL('image/jpeg', 0.85) : null };
  window.__bpShareLastVideo = out.blob;
  return sheet({ blob: out.blob, name: `bokura_${kind}.${out.ext}`, text, alt, poster: out.poster, video: true });
}
// 文に「名場面は〇〇!」を ⚾ の前へ足す
function addScene(body, word) {
  const i = body.indexOf(' ⚾'), w = `名場面は${word.replace(/!$/, '')}!`;
  if (i < 0) return `${body} ${w}`;
  const head = body.slice(0, i), sep = /[!!。]$/.test(head) ? '' : '。';
  return `${head}${sep}${w}${body.slice(i)}`;
}
// 録る間のカメラの向き: 捕る 0.3 秒前の、自分から球への向き(球が近すぎる・見えない時は体の向き)。録る間に回り込まないように固定する
function catchDir(rp, R) {
  try {
    const F = R.frames, h = R.hl, at = (h.ct != null ? h.ct : h.t) - 0.3;
    rp._seek(Math.max(F[0].t, at));
    const me = rp.h.me(), ball = rp.h.ball(); me.root.updateMatrixWorld(true);
    const mp = me.root.getWorldPosition(me.root.position.clone());
    let d = null;
    if (ball && ball.visible) { const bp = ball.getWorldPosition(mp.clone()); d = bp.sub(mp); d.y = 0; if (d.length() < 0.6) d = null; }
    if (!d) { const y = me.root.rotation.y; d = mp.clone().set(-Math.sin(y), 0, -Math.cos(y)); }
    rp._seek(F[0].t);
    return d.normalize();
  } catch (e) { return null; }
}
// 試合・ノック・キャリアの試合の結果: その試合の一番よいプレーのリプレイを、押した時にその場で流して録る。録れない・覚えが無い時は絵
async function withPlayVideo(kind, p) {
  const A = window.__app, rp = A && A.replay, R = bestRec(rp);
  if (!R || !videoMime() || rp.on || !A.renderer) return fromCanvas(kind, p);
  const B = busyShow('動画を作っています');
  const cam = A.camera, camSave = cam ? { p: cam.position.clone(), q: cam.quaternion.clone(), up: cam.up.clone() } : null;
  const view = rp.view, speed = rp.speed;
  let out = null;
  try {
    rp.view = p.view || (R.hl.special === 'dive' || R.hl.special === 'jump' ? 'side' : 'behind');   // 11/28 p.view: 今日の守備チャレンジの縦の画面は後ろから(横からはスマホの縦で三塁側の壁に入ることがあった)
    rp.open(R, null);
    if (rp.ui) rp.ui.style.display = 'none';   // 録る間はリプレイのボタンを出さない(押せないので)
    rp.recDir = catchDir(rp, R);
    out = await recordReplay(rp, { hl: R.hl, max: 8, onProgress: B.set });
  } catch (e) { console.warn('share video', e); out = null; }
  finally {
    rp.recDir = null;
    try { if (rp.on) rp.close(); } catch (e) { /* なし */ }
    rp.view = view; rp.speed = speed;
    if (camSave) { cam.position.copy(camSave.p); cam.quaternion.copy(camSave.q); cam.up.copy(camSave.up); cam.updateMatrixWorld(true); }
    B.done();
  }
  if (!out) return fromCanvas(kind, p);
  const dive = R.hl.special === 'dive';
  const text = withTags(R.hl.rank >= 2 ? addScene(p.body, R.hl.word) : p.body, dive, p.tag);
  return showVideo(kind, out, text, '名場面のリプレイの動画');
}
// キャリア完了: カードが寄る・数が数え上がる・判子の数秒の動画。録れない時は絵
async function doneVideo(c, K) {
  const p = await careerDoneImage(c, K);
  if (!videoMime()) return fromCanvas('careerDone', p);
  const B = busyShow('動画を作っています');
  let out = null;
  try {
    const cv = newCanvas();
    out = await recordCanvas(cv, (g, T) => drawDone(g, c, K, p.card, T), DONE_SECS, B.set);
    if (out) out.poster = p.canvas;
  } catch (e) { console.warn('share video', e); out = null; }
  finally { B.done(); }
  if (!out) return fromCanvas('careerDone', p);
  return showVideo('careerDone', out, p.text, 'キャリア完了の動画');
}
export const game = once(async (r) => { const p = await gameImage(r); return withPlayVideo(r.kind === 'knock' ? 'knock' : 'game', p); });
export const careerGame = once(async (r) => { const C = window.__career; return withPlayVideo('career', await careerGameImage(r, C.K, C.data)); });
export const careerDone = once(async (c) => { const C = window.__career; return doneVideo(c, C.K); });
export const replay = once(async (rp, btn) => replayShare(rp, btn));
// 11/28 今日の守備チャレンジ(js/challenge.js): 絵と文は challenge.js が作り、動画はノックと同じく一番よいプレーのリプレイ
export const challenge = once(async (p) => withPlayVideo('challenge', p));

// 守備の試合・ノックの結果の画面のボタン(index.html の #resShare)。中身は js/ui.js の result が覚えた lastResult
ensureCss();
{ const b = document.getElementById('resShare'); if (b) b.addEventListener('click', (e) => { e.stopPropagation(); const ui = window.__app && window.__app.ui; if (ui && ui.lastResult) game(ui.lastResult); }); }
window.__bpShareX = { game, careerGame, careerDone, replay, challenge, send, sheet, close, withTags, shareUrl, videoMime, recordReplay, bestRec, TAGS, TAG_DIVE,
  draw: { newCanvas, rrect, fonts, ground, brand, stamp, tiles, fitText, FONT, RANK_C } };   // 11/28 draw: 今日の守備チャレンジ(js/challenge.js)の絵を同じ部品で描く
