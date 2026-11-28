// 11/26 守備のキャリアのランキング(持ち主「プロ全試合消化時の通算 UZR でランキング」)。docs/ranking_plan_1126.md
// Firebase(らくがき運動会と同じプロジェクト oekakirace)の Firestore を、SDK を読まずに REST で使う(ブラウザ・iOS・Android で同じ)。
//   置き場所: bokura/{板}/entries/{匿名ログインの uid}。1 端末 1 件、良くなった時だけ書きかえる。
//   板: pro5(プロ 5 試合を終えた時の通算 UZR・位置の補正あり)/ season_hs・season_corp・season_pro(1 シーズンの最高)/ pos_<位置>(守備位置ごと)
//   送る物: 選手カードの名前(8 字まで・汚い言葉は弾く)・背番号・守備位置・値・試合数・日付。個人を特定する物は送らない(uid は匿名ログインの乱数)。
// 読みの節約: 上位 20 件を板ごとに 30 分覚える。1 回の遊び(ページを開いている間)でサーバーへ読みに行くのは 8 回まで。
//   混み合い(429)の時は 5 分サーバーへ行かず古い覚えを出す。ルールが無い・権限が無い(403)時は 6 時間行かず、自分の記録だけ出す。
// ページを開いただけではネットに出ない(ランキングを開いた時・キャリアを終えた時だけ)。
// 11/27 持ち主「ランキングは最速でプロでスコアを競うみたいな感じで」: pro5 と pos_<位置> の値(val)は「早さ+守備」の点(rankPts)。
//   早さ = 100 − 5 ×(プロに上がるまでの試合数 − 11)(11 は高校 5 + 社会人 6 の最短。31 試合以上で 0)
//   守備 = 50 + 20 × プロ 5 試合の UZR(位置の補正あり)(0 より下は 0)
//   送る物に toPro(プロまでの試合数)・uzr(位置の補正ありの UZR)を足した(v: 2)。1 シーズンの板(season_*)は今まで通り UZR(v: 1)
//   前の形(UZR だけ)の自分の記録・送り待ちは、読み込んだ時に消す(ルールは公開前なので、サーバーには前の形の記録は無い)
const API_KEY = 'AIzaSyC4yXnCeOvQZarFHz-0KKk5_szykky3yJk';   // 公開してよい識別子(らくがき運動会の online.js と同じ)
const PROJECT = 'oekakirace';
const AUTH_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + API_KEY;
const TOKEN_URL = 'https://securetoken.googleapis.com/v1/token?key=' + API_KEY;
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const ROOT = 'bokura';
export const LIMIT = 20;
const CACHE_MS = 30 * 60 * 1000, SESSION_READS = 8, BUSY_MS = 5 * 60 * 1000, CLOSED_MS = 6 * 3600 * 1000, TIMEOUT_MS = 9000;
const POSS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
export const BOARDS = ['pro5', 'season_hs', 'season_corp', 'season_pro', ...POSS.map((p) => 'pos_' + p)];
// 板ごとの試合数の範囲(ありえない物は送らない。ルールでも同じ範囲を確かめる)
const GAMES = { pro5: [5, 5], season_hs: [5, 60], season_corp: [6, 60], season_pro: [5, 5] };
const gamesRange = (b) => GAMES[b] || [5, 5];
export const MAX_PER_GAME = 3;   // 1 試合あたり ±3 を超える平均は送らない
export const TO_PRO_MIN = 11, TO_PRO_MAX = 120;   // プロまでの試合数(career.js の STAGES の min の和 = 11。高校・社会人は 60 試合まで)
const ptsBoard = (b) => b === 'pro5' || b.startsWith('pos_');
export function rankPts(toPro, uzr) {
  const speed = Math.max(0, 100 - 5 * Math.max(0, Math.round(toPro) - TO_PRO_MIN));
  const def = Math.max(0, Math.round(50 + 20 * uzr));
  return { speed, def, total: speed + def };
}
const K = { auth: 'r4walk.rank.auth', cache: 'r4walk.rank.cache', mine: 'r4walk.rank.mine', pend: 'r4walk.rank.pend', busy: 'r4walk.rank.busy', closed: 'r4walk.rank.closed', dev: 'r4walk.rank.dev' };
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 残せなくても遊べる */ } },
};
export const stats = { reads: 0, docs: 0, writes: 0, session: 0 };

// 端末の ID(乱数。サーバーには送らない。自分の記録の印)
export function deviceId() {
  let d = LS.get(K.dev);
  if (!d) { const a = new Uint8Array(12); (self.crypto || window.crypto).getRandomValues(a); d = [...a].map((x) => x.toString(16).padStart(2, '0')).join(''); LS.set(K.dev, d); }
  return d;
}

// 名前: 8 字まで。記号を落とし、汚い言葉なら出さない
const BAD = /(死ね|しね|氏ね|殺す|ころす|ちんこ|ちんぽ|まんこ|セックス|せっくす|うんこ|きちがい|キチガイ|ガイジ|がいじ|fuck|shit|nigger|sex|porn|bitch)/i;
export function cleanName(n) {
  let s = String(n || '').normalize('NFKC').replace(/[^\p{L}\p{N}\p{M} ー・-]/gu, '').replace(/\s+/g, ' ').trim();
  s = [...s].slice(0, 8).join('');
  if (!s || BAD.test(s.replace(/\s/g, ''))) return '名無しの選手';
  return s;
}
const day = (t) => { const d = new Date(t || Date.now()); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// 送る前の確かめ(ありえない値は送らない)
export function plausible(board, e) {
  if (!BOARDS.includes(board) || !e) return false;
  const [g0, g1] = gamesRange(board.startsWith('pos_') ? 'pro5' : board);
  if (!Number.isInteger(e.games) || e.games < g0 || e.games > g1) return false;
  if (!Number.isFinite(e.val) || (!ptsBoard(board) && Math.abs(e.val) > MAX_PER_GAME * e.games)) return false;   // 点の板は下で式と比べる
  if (!POSS.includes(e.pos)) return false;
  if (board.startsWith('pos_') && board !== 'pos_' + e.pos) return false;
  if (!Number.isInteger(e.num) || e.num < 0 || e.num > 99) return false;
  if (ptsBoard(board)) {
    if (!Number.isInteger(e.toPro) || e.toPro < TO_PRO_MIN || e.toPro > TO_PRO_MAX) return false;
    if (!Number.isFinite(e.uzr) || Math.abs(e.uzr) > MAX_PER_GAME * e.games) return false;
    if (Math.abs(e.val - rankPts(e.toPro, e.uzr).total) > 1) return false;
  }
  return true;
}

const isBusy = () => (LS.get(K.busy) || 0) > Date.now();
const isClosed = () => (LS.get(K.closed) || 0) > Date.now();
function err(code, msg) { const e = new Error(msg || code); e.code = code; return e; }
async function http(url, opt, write) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw err('offline');
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tm = setTimeout(() => ac && ac.abort(), TIMEOUT_MS);
  let r;
  try { r = await fetch(url, { ...opt, signal: ac && ac.signal }); } catch (e) { throw err('offline', String(e && e.message)); } finally { clearTimeout(tm); }
  if (r.status === 429) { LS.set(K.busy, Date.now() + BUSY_MS); throw err('busy'); }
  if (r.status === 403 || r.status === 401) { const t = await r.text().catch(() => ''); if (/PERMISSION_DENIED|permission/i.test(t) || r.status === 403) { if (!write) LS.set(K.closed, Date.now() + CLOSED_MS); throw err(write ? 'denied' : 'closed', t.slice(0, 120)); } throw err('auth'); }
  if (r.status === 400 && /FAILED_PRECONDITION|RESOURCE_EXHAUSTED/.test(await r.clone().text().catch(() => ''))) { LS.set(K.busy, Date.now() + BUSY_MS); throw err('busy'); }
  if (!r.ok) throw err('http' + r.status);
  return r.json();
}

// 匿名ログイン(Firestore の読み取りは数えない)。1 時間で切れるので、切れる前に作り直す
// 同時に何本も送る時も、ログインは 1 回にまとめる
let tokP = null;
function token() { if (!tokP) tokP = token0().finally(() => { tokP = null; }); return tokP; }
async function token0() {
  let a = LS.get(K.auth);
  if (a && a.idToken && a.exp > Date.now() + 60000) return a;
  if (a && a.refreshToken) {
    try {
      const j = await http(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(a.refreshToken) });
      a = { uid: j.user_id || a.uid, idToken: j.id_token, refreshToken: j.refresh_token || a.refreshToken, exp: Date.now() + (+j.expires_in || 3600) * 1000 };
      LS.set(K.auth, a); return a;
    } catch (e) { if (e.code === 'offline' || e.code === 'busy') throw e; }
  }
  const j = await http(AUTH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  a = { uid: j.localId, idToken: j.idToken, refreshToken: j.refreshToken, exp: Date.now() + (+j.expiresIn || 3600) * 1000 };
  LS.set(K.auth, a);
  return a;
}
export const myUid = () => (LS.get(K.auth) || {}).uid || null;

const fv = (f) => (!f ? null : 'stringValue' in f ? f.stringValue : 'integerValue' in f ? +f.integerValue : 'doubleValue' in f ? +f.doubleValue : 'timestampValue' in f ? f.timestampValue : null);
function rowOf(doc) {
  const F = doc.fields || {}, uid = String(doc.name || '').split('/').pop();
  return { uid, name: cleanName(fv(F.name)), num: fv(F.num), pos: fv(F.pos), val: +fv(F.val), games: fv(F.games), day: fv(F.day), toPro: fv(F.toPro), uzr: F.uzr ? +fv(F.uzr) : null, gear: gearOk(fv(F.gear)) };
}

// 11/28 夜 道具ガチャ: 付けていた一番いい道具(「id:Lv」の 1 語。js/gear.js の bestTag)。形の合わない物は出さない・送らない
export const gearOk = (g) => (typeof g === 'string' && /^[a-z0-9_]{1,12}:[1-5]$/.test(g) ? g : null);
// 自分の記録(この端末で終えたキャリアの最高。ネットが無くても出せる)
export function mine() { return LS.get(K.mine) || {}; }
function better(board, e) { const m = mine()[board]; return !m || e.val > m.val + 1e-9; }
function keepMine(board, e) { const m = mine(); if (better(board, e)) { m[board] = { ...e, own: true }; LS.set(K.mine, m); } }
// 端末の中だけに残す(送らない。殿堂のカードから作り直す時)
export function keepLocal(board, e0) {
  const e = { name: cleanName(e0.name), num: Math.round(+e0.num) || 0, pos: e0.pos, val: e0.val, games: e0.games, day: e0.day || day(e0.t), toPro: e0.toPro, uzr: e0.uzr, ...(gearOk(e0.gear) ? { gear: e0.gear } : {}) };
  if (plausible(board, e)) keepMine(board, e);
}
// 11/27 前の形(pro5・pos_* の値が UZR だけ)の自分の記録・送り待ち・覚えた表を消す
(function migrate() {
  const old = (x) => x && typeof x === 'object' && !Number.isInteger(x.toPro);
  for (const key of [K.mine, K.pend]) { const m = LS.get(key); if (!m) continue; let ch = false; for (const b of Object.keys(m)) if (ptsBoard(b) && old(m[b])) { delete m[b]; ch = true; } if (ch) LS.set(key, m); }
  const C = LS.get(K.cache); if (C) { let ch = false; for (const b of Object.keys(C)) if (ptsBoard(b) && (C[b].rows || []).some(old)) { delete C[b]; ch = true; } if (ch) LS.set(K.cache, C); }
})();

// 上位 20 件を読む。{rows, from: 'net'|'cache'|'stale'|'mine', why}
export async function top(board, opt = {}) {
  const C = LS.get(K.cache) || {}, c = C[board];
  const own = () => { const m = mine()[board]; return m ? [m] : []; };
  if (c && Date.now() - c.t < CACHE_MS && !opt.force) return { rows: merge(c.rows, board), from: 'cache', at: c.t };
  const fallback = (why) => (c ? { rows: merge(c.rows, board), from: 'stale', why, at: c.t } : { rows: own(), from: 'mine', why });
  if (isClosed()) return fallback('closed');
  if (isBusy()) return fallback('busy');
  if (stats.session >= SESSION_READS) return fallback('limit');
  try {
    const a = await token();
    stats.session++;
    const j = await http(`${DOCS}/${ROOT}/${board}:runQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + a.idToken },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'entries' }], orderBy: [{ field: { fieldPath: 'val' }, direction: 'DESCENDING' }], limit: LIMIT } }) });
    const rows = (Array.isArray(j) ? j : []).filter((x) => x && x.document).map((x) => rowOf(x.document)).filter((r) => Number.isFinite(r.val));
    stats.reads += Math.max(1, rows.length); stats.docs += rows.length;
    C[board] = { t: Date.now(), rows }; LS.set(K.cache, C);
    return { rows: merge(rows, board), from: 'net', at: C[board].t };
  } catch (e) { return fallback(e.code || 'error'); }
}
// 自分の記録を、表に無ければ足して並べ直す(自分の行に印)
function merge(rows, board) {
  const u = myUid(), m = mine()[board];
  const R = rows.map((r) => ({ ...r, own: !!(u && r.uid === u) }));
  if (m && !R.some((r) => r.own)) R.push({ ...m, own: true, local: true });
  return R.sort((a, b) => b.val - a.val).slice(0, LIMIT + 1);
}

// 送る。良くなった時だけ。送れない時は端末に残して、次にランキングを開いた時に送る
export async function submit(board, e0) {
  const pts = ptsBoard(board);
  const e = { name: cleanName(e0.name), num: Math.round(+e0.num) || 0, pos: e0.pos, val: Math.round(e0.val * 100) / 100, games: e0.games, day: e0.day || day(e0.t),
    ...(pts ? { toPro: e0.toPro, uzr: Math.round(+e0.uzr * 100) / 100 } : {}), ...(gearOk(e0.gear) ? { gear: e0.gear } : {}) };
  if (!plausible(board, e)) return { ok: false, why: 'implausible' };
  const isBetter = better(board, e);
  keepMine(board, e);
  if (!isBetter && !e0.retry) return { ok: true, why: 'notbetter' };
  const P = LS.get(K.pend) || {};
  if (isClosed() || isBusy()) { P[board] = { ...e, tries: (P[board] && P[board].tries) || 0 }; LS.set(K.pend, P); return { ok: false, why: isClosed() ? 'closed' : 'busy', pending: true }; }
  try {
    const a = await token();
    const name = `projects/${PROJECT}/databases/(default)/documents/${ROOT}/${board}/entries/${a.uid}`;
    const fields = { name: { stringValue: e.name }, num: { integerValue: String(e.num) }, pos: { stringValue: e.pos }, val: { doubleValue: e.val }, games: { integerValue: String(e.games) }, day: { stringValue: e.day }, v: { integerValue: pts ? '2' : '1' } };
    if (pts) { fields.toPro = { integerValue: String(e.toPro) }; fields.uzr = { doubleValue: e.uzr }; }
    const send = (f) => http(`${DOCS}:commit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + a.idToken },
      body: JSON.stringify({ writes: [{ update: { name, fields: f }, updateTransforms: [{ fieldPath: 'at', setToServerValue: 'REQUEST_TIME' }] }] }) }, true);
    // 11/28 夜 道具(gear)を足して送る。サーバーのルールがまだ gear を通さない時(断られた時)は、gear を外してもう一度だけ送る(記録は今まで通り載る)
    if (e.gear) { fields.gear = { stringValue: e.gear }; try { await send(fields); } catch (er) { if (er.code !== 'denied') throw er; delete fields.gear; await send(fields); } }
    else await send(fields);
    stats.writes++;
    delete P[board]; LS.set(K.pend, P);
    // 覚えている表にも自分を入れておく(すぐ読み直さない)
    const C = LS.get(K.cache) || {};
    if (C[board]) { C[board].rows = C[board].rows.filter((r) => r.uid !== a.uid).concat([{ uid: a.uid, ...e }]).sort((x, y) => y.val - x.val).slice(0, LIMIT); LS.set(K.cache, C); }
    return { ok: true };
  } catch (err2) {
    // 送れなかった物は残して、次の遊びで送り直す(断られた物は 3 回まで)
    const tries = ((P[board] && P[board].tries) || 0) + (err2.code === 'denied' ? 1 : 0);
    if (tries < 3) P[board] = { ...e, tries }; else delete P[board];
    LS.set(K.pend, P);
    return { ok: false, why: err2.code || 'error', pending: true };
  }
}
// 送れていない物をもう一度(ランキングを開いた時に 1 回)
let flushed = false;
export async function flush() {
  if (flushed) return; flushed = true;
  const P = LS.get(K.pend) || {};
  for (const b of Object.keys(P)) { if (isClosed() || isBusy()) break; await submit(b, { ...P[b], retry: true }); }
  return status();
}
export function status() { return { busy: isBusy(), closed: isClosed(), pending: Object.keys(LS.get(K.pend) || {}).length, session: stats.session }; }
// 試験用
export function _reset() { for (const k of Object.values(K)) { try { localStorage.removeItem(k); } catch (e) { /* */ } } stats.session = 0; stats.reads = 0; stats.writes = 0; flushed = false; }
