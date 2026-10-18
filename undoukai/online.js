// らくがき運動会のオンラインの部分(みんなのらくがき・3人の部屋)。Firebase プロジェクト oekakirace。
// 使うのは 匿名ログイン と Firestore だけ(無料の Spark プランの範囲)。ルールは firebase/firestore.rules。
// 生き物は sim.js の Creature の形(線の点・名前)を、URL と同じ詰め方の文字列(data)にして保存する。
const V = '12.4.0';
const FB = `https://www.gstatic.com/firebasejs/${V}/`;
// ウェブの設定(公開してよい識別子。秘密の鍵ではない)
const firebaseConfig = {
  apiKey: 'AIzaSyC4yXnCeOvQZarFHz-0KKk5_szykky3yJk',
  authDomain: 'oekakirace.firebaseapp.com',
  projectId: 'oekakirace',
  storageBucket: 'oekakirace.firebasestorage.app',
  messagingSenderId: '612195274292',
  appId: '1:612195274292:web:31d1950f4338350d004461',
};

let app, auth, db, F, user = null;
const RU = window.RU;
const PER_BYTES = 380;
// 読みの回数を減らす(無料枠は1日の読み取り5万件。10/17 に X で伸びて1日20万件になった)
//   みんなのらくがきの1ページ目: 端末に30分 / CPU に混ぜる絵・ランダムな相手: 読まない(pool.json と端末に覚えた1ページ目)
//   ランキング: 上位10件を板ごとに10〜60分 / 自分の記録: 端末に覚えて読まない / 混み合い(429)の時は端末の古い覚えを出す
const GAL_MS = 30 * 60 * 1000, POOL_MS = 6 * 3600 * 1000;
const RANK_MS = { d: 10 * 60 * 1000, w: 30 * 60 * 1000, all: 60 * 60 * 1000 };
export const RANK_LIMIT = 10;
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } },
};
// ---------- 混み合っている時(無料枠切れ = resource-exhausted / 429) ----------
// 一度出たら5分はサーバーに行かずにすぐ「混み合っている」を返す(つながらない・時間切れは2分)。
export const BUSY_MSG = 'いまは混み合っていて、みんなの絵とランキングが一時的に見られません';
const BUSY_KEY = 'rkg_busy_until';
export function isBusy() { const u = LS.get(BUSY_KEY); return !!(u && Date.now() < u); }
function markBusy(ms) { LS.set(BUSY_KEY, Date.now() + ms); }
export function isQuotaError(e) { const t = String(e && (e.code || '')) + ' ' + String(e && e.message || ''); return /resource-exhausted|quota|429/i.test(t); }
// 読み取りの数(試験で数える用。Firestore は空の検索も1件と数える)
export const stats = { reads: 0 };
function cnt(s) { stats.reads += s && s.docs ? Math.max(1, s.docs.length) : 1; return s; }
function busyError() { const e = new Error(BUSY_MSG); e.code = 'busy'; e.busy = true; return e; }
const TIMEOUT_MS = 9000;
// 読み(retry=true)は、混み合い・控えしか返らない時に3秒待って1回だけやり直す
async function guard(fn, ms, retry) {
  if (retry) {
    if (isBusy()) throw busyError();
    try { return await guard(fn, ms); }
    catch (e) {
      if (!(e && e.busy) || e.timeout === 'long') throw e;
      LS.del(BUSY_KEY);
      await new Promise(r => setTimeout(r, 3000));
      return guard(fn, ms);
    }
  }
  if (isBusy()) throw busyError();
  let tm;
  try {
    const r = await Promise.race([fn(), new Promise((_, rej) => { tm = setTimeout(() => { const e = new Error('timeout'); e.code = 'timeout'; rej(e); }, ms || TIMEOUT_MS); })]);
    // 枠切れ(429)やつながらない時、getDocs はエラーにならず「端末の控え(空)」を返すことがある。それは読めなかった扱いにする
    if (r && r.metadata && r.metadata.fromCache) { const e = new Error('offline'); e.code = 'timeout'; throw e; }
    return r;
  } catch (e) {
    if (isQuotaError(e)) { markBusy(5 * 60 * 1000); throw busyError(); }
    if (e && (e.code === 'timeout' || e.code === 'unavailable')) { markBusy(2 * 60 * 1000); const b = busyError(); b.timeout = e.message === 'timeout' ? 'long' : true; throw b; }
    throw e;
  } finally { clearTimeout(tm); }
}

function b64(bytes) { let s = ''; for (const x of bytes) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64(str) { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)); const a = []; for (let i = 0; i < s.length; i++) a.push(s.charCodeAt(i)); return a; }
// キラキラ(完全版の見た目)は線の後ろに2バイト。前の版は線だけ読んで残りを捨てる
export function packCreature(cr) { return b64(RU.Creature.packBytes(cr, PER_BYTES)); }
export function unpackCreature(str) { return RU.Creature.unpackBytes(unb64(str)); }

export async function init() {
  if (db) return;
  if (isBusy()) throw busyError();
  if (!firebaseConfig) throw new Error('オンラインの設定がまだです');
  try { await guard(initRaw, 12000); }
  catch (e) { if (e && e.busy) throw e; const x = new Error('ネットにつながっていないかも'); x.code = 'offline'; throw x; }
}
async function initRaw() {
  if (db) return;
  const [a, au, fs] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')]);
  F = Object.assign({}, a, au, fs);
  app = F.initializeApp(firebaseConfig);
  auth = F.getAuth(app);
  db = F.getFirestore(app);
  const cred = await F.signInAnonymously(auth);
  user = cred.user;
  LS.set('rkg_uid', user.uid);
}
// ログイン前(覚えた表だけで済んだ時)も、前に使った uid で自分の行・記録がわかるようにする
export function uid() { return user ? user.uid : (LS.get('rkg_uid') || ''); }
// 試験用(ルールの試験で生の SDK を使う)
export function _raw() { return { F, db, auth }; }

// ---------- みんなのらくがき ----------
export async function postCreature(cr, info) {
  const data = packCreature(cr);
  const userRef = F.doc(db, 'users', uid());
  const ref = F.doc(F.collection(db, 'creatures'));
  const day = Math.floor(Date.now() / 86400000);
  try {
    await guard(() => F.runTransaction(db, async tx => {
      const u = await tx.get(userRef);
      if (u.exists()) {
        const d = u.data();
        const last = d.lastPost && d.lastPost.toMillis ? d.lastPost.toMillis() : 0;
        if (Date.now() - last < 30000) throw new Error('少し待ってからもう一度出してね(30秒に1回まで)');
        if (d.day === day && d.count >= 10) throw new Error('出せるのは1日10匹までです');
        tx.update(userRef, { lastPost: F.serverTimestamp(), day, count: d.day === day ? d.count + 1 : 1 });
      } else tx.set(userRef, { lastPost: F.serverTimestamp(), day, count: 1 });
      tx.set(ref, { uid: uid(), name: (cr.name || '').slice(0, 12), data, mode: info ? info.mode : '', created: F.serverTimestamp(), reports: 0, visible: true, rnd: Math.random() * 0.998 + 0.001 });
    }), 15000);
  } catch (e) {
    if (e && e.busy) throw e;
    if (e && /permission/i.test(e.code || e.message)) throw new Error('いまは出せません(回数の上限かもしれません)');
    throw e;
  }
  LS.del(GAL_KEY);
  return ref.id;
}
function toItem(d) {
  const x = d.data();
  try {
    const cr = unpackCreature(x.data); cr.name = x.name || cr.name;
    const c = x.created && x.created.toDate ? x.created.toDate() : null;
    return { id: d.id, creature: cr, created: c ? `${c.getMonth() + 1}/${c.getDate()}` : '', reports: x.reports };
  } catch (e) { return null; }
}
// 一覧は12件ずつ。1ページ目は端末(localStorage)に覚えて、10分は読みに行かない。
const GAL_KEY = 'rkg_gal_first2';
function fromCache(c) {
  return c.items.map(it => { try { const cr = unpackCreature(it.data); cr.name = it.name || cr.name; return { id: it.id, creature: cr, created: it.created }; } catch (e) { return null; } }).filter(Boolean);
}
export async function listCreatures(cursor) {
  if (!cursor) {
    const c = LS.get(GAL_KEY);
    if (c && c.items && Date.now() - c.at < GAL_MS) return { items: fromCache(c), cursor: c.items.length >= 12 ? { cached: c.last } : null };
    try { return await listRemote(null); }
    catch (e) {
      // 混み合い・つながらない時は、前に覚えた1ページ目(古くても)か pool.json を出して遊び続けられるようにする
      if (!(e && (e.busy || e.code === 'offline'))) throw e;
      const items = c && c.items && c.items.length ? fromCache(c) : await bundledPool();
      if (!items.length) throw e;
      return { items, cursor: null, stale: e.busy ? 'busy' : 'offline' };
    }
  }
  return listRemote(cursor);
}
async function listRemote(cursor) {
  await init();
  let q = F.query(F.collection(db, 'creatures'), F.where('visible', '==', true), F.orderBy('created', 'desc'), F.limit(12));
  if (cursor && cursor.snap) q = F.query(q, F.startAfter(cursor.snap));
  else if (cursor && cursor.cached) q = F.query(q, F.startAfter(F.Timestamp.fromMillis(cursor.cached)));
  const snap = cnt(await guard(() => F.getDocs(q), 0, true));
  const items = snap.docs.map(toItem).filter(Boolean);
  if (!cursor) {
    const lastDoc = snap.docs[snap.docs.length - 1];
    LS.set(GAL_KEY, { at: Date.now(), last: lastDoc && lastDoc.data().created ? lastDoc.data().created.toMillis() : 0, items: snap.docs.map(d => { const it = toItem(d); return { id: d.id, data: d.data().data, name: d.data().name, created: it ? it.created : '' }; }) });
  }
  return { items, cursor: snap.docs.length >= 12 ? { snap: snap.docs[snap.docs.length - 1] } : null };
}
// CPU に混ぜる絵・「ランダムな相手」: Firestore は読まない。
// 端末に覚えたみんなのらくがき1ページ目(6時間まで)と、公開のたびに作る pool.json(tools/make_pool.py、24匹)を混ぜて使う。init もいらない。
let bundled = null;
async function bundledPool() {
  if (!bundled) bundled = fetch(new URL('pool.json', import.meta.url)).then(r => r.ok ? r.json() : { items: [] }).then(j => fromCache(j)).catch(() => { bundled = null; return []; });
  return (await bundled) || [];
}
export async function poolCreatures() {
  const c = LS.get(GAL_KEY);
  const recent = c && c.items && c.items.length && Date.now() - c.at < POOL_MS ? fromCache(c) : [];
  const ids = new Set(recent.map(x => x.id));
  return recent.concat((await bundledPool()).filter(x => !ids.has(x.id)));
}
export async function randomCreature() {
  const pool = await poolCreatures().catch(() => []);
  if (pool.length >= 4) return pool[Math.floor(Math.random() * pool.length)];
  await init();
  return guard(randomRaw, 0, true);
}
async function randomRaw() {
  const r = Math.random();
  const col = F.collection(db, 'creatures');
  let snap = cnt(await F.getDocs(F.query(col, F.where('visible', '==', true), F.where('rnd', '>=', r), F.orderBy('rnd'), F.limit(1))));
  if (snap.empty) snap = cnt(await F.getDocs(F.query(col, F.where('visible', '==', true), F.where('rnd', '<', r), F.orderBy('rnd'), F.limit(1))));
  if (snap.empty) return null;
  const it = toItem(snap.docs[0]);
  if (it && it.creature && false) return null;
  return it;
}
export async function report(id) {
  await init();
  const ref = F.doc(db, 'creatures', id);
  const rref = F.doc(db, 'creatures', id, 'reports', uid());
  await guard(() => F.runTransaction(db, async tx => {
    const s = await tx.get(ref); const r = await tx.get(rref);
    if (!s.exists()) throw new Error('もうありません');
    if (r.exists()) throw new Error('通報ずみです');
    const n = (s.data().reports || 0) + 1;
    tx.update(ref, { reports: n, visible: n < 3 });
    tx.set(rref, { at: F.serverTimestamp() });
  }), 15000);
  LS.del(GAL_KEY);
}

// ---------- 部屋(3人) ----------
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export async function createRoom() {
  for (let k = 0; k < 5; k++) {
    let code = ''; for (let i = 0; i < 5; i++) code += ABC[Math.floor(Math.random() * ABC.length)];
    const ref = F.doc(db, 'rooms', code);
    try {
      await guard(() => F.runTransaction(db, async tx => {
        const s = await tx.get(ref);
        if (s.exists()) throw new Error('dup');
        tx.set(ref, { host: uid(), state: 'lobby', members: [uid()], names: { [uid()]: '' }, created: F.serverTimestamp(), course: ['track', 'obstacle', 'slope', 'water'][Math.floor(Math.random() * 4)], seed: Math.floor(Math.random() * 2147483647), order: [], drawSec: 40 });
      }), 15000);
      return code;
    } catch (e) { if (e.message !== 'dup') throw e; }
  }
  throw new Error('部屋をつくれませんでした');
}
export async function joinRoom(code) {
  const ref = F.doc(db, 'rooms', code);
  await guard(() => F.runTransaction(db, async tx => {
    const s = await tx.get(ref);
    if (!s.exists()) throw new Error('その部屋はありません');
    const d = s.data();
    if (d.created && d.created.toMillis && Date.now() - d.created.toMillis() > 3 * 3600 * 1000) throw new Error('その部屋はもう終わっています');
    if ((d.members || []).includes(uid())) return;
    if (d.state !== 'lobby') throw new Error('その部屋はもう始まっています');
    if ((d.members || []).length >= 3) throw new Error('その部屋はいっぱいです');
    tx.update(ref, { members: d.members.concat([uid()]), names: Object.assign({}, d.names, { [uid()]: '' }) });
  }), 15000);
}
export function watchRoom(code, cb) {
  let room = null, entries = {};
  const u1 = F.onSnapshot(F.doc(db, 'rooms', code), s => { room = s.exists() ? s.data() : null; cb(room, entries); }, e => { if (isQuotaError(e)) markBusy(5 * 60 * 1000); cb(null, entries, e); });
  const u2 = F.onSnapshot(F.collection(db, 'rooms', code, 'entries'), s => {
    entries = {};
    s.forEach(d => { try { entries[d.id] = { creature: unpackCreature(d.data().data) }; } catch (e) { } });
    cb(room, entries);
  }, () => { });
  return () => { u1(); u2(); };
}
export async function startDrawing(code, sec) {
  await guard(() => F.updateDoc(F.doc(db, 'rooms', code), { state: 'drawing', drawSec: sec || 40 }));
}
export async function submitEntry(code, cr) {
  await guard(() => F.setDoc(F.doc(db, 'rooms', code, 'entries', uid()), { data: packCreature(cr), at: F.serverTimestamp() }));
}
let starting = false;
export async function startRace(code, order) {
  if (starting) return; starting = true;
  try { await guard(() => F.updateDoc(F.doc(db, 'rooms', code), { state: 'race', order: order.slice(0, 3) })); }
  finally { setTimeout(() => { starting = false; }, 3000); }
}
export async function leaveRoom(code) {
  const ref = F.doc(db, 'rooms', code);
  await guard(() => F.runTransaction(db, async tx => {
    const s = await tx.get(ref); if (!s.exists()) return;
    const d = s.data();
    if (d.host === uid()) { if (d.state === 'lobby') tx.delete(ref); return; }
    if (!(d.members || []).includes(uid())) return;
    const names = Object.assign({}, d.names); delete names[uid()];
    tx.update(ref, { members: d.members.filter(x => x !== uid()), names });
  }), 15000);
}

// ---------- ランキング(タイムアタック) ----------
// rank/{board}/entries/{uid}。board = <コース>_all / <コース>_d<日> / <コース>_w<週>(日本時間)。1人1件、速くなった時だけ書きかえる。
// 送るのは 名前・絵(data)・タイム(t)。t は並べるためだけに使い、表示する側で絵から走らせ直して合わない物は出さない。
export function jstDay() { return Math.floor((Date.now() + 9 * 3600 * 1000) / 86400000); }
export function boardId(course, period) {
  const d = jstDay();
  return course + '_' + (period === 'd' ? 'd' + d : period === 'w' ? 'w' + Math.floor((d + 3) / 7) : 'all');
}
// verify(strokes) → 今の計算でのタイム。前の版の計算で登録した自分の記録(今は走らせ直すと合わず、表に出ない)は、
// 遅くなっても置きかえる(ルールは「速くなった時だけ書きかえ」なので、いったん消してから書く)。
function staleEntry(d, verify) {
  if (!verify) return false;
  try { const tv = verify(unpackCreature(d.data).strokes); return tv == null || Math.abs(tv - d.t) > 0.002; } catch (e) { return true; }
}
// 自分の記録は端末にも覚える(板の id ごと。CALC は計算の版。計算を変えたら上げる)。
// 端末の記録より遅ければ読みに行かない。速ければ読まずに書く(サーバーの方が速い時はルールで断られるので、その時だけ読む)。
const CALC = '1018';
const myKey = b => 'rkg_my_' + uid() + '_' + b;
export async function submitRank(course, cr, t, verify) {
  if (isBusy()) throw busyError();
  const data = packCreature(cr);
  const name = String(cr.name || '').slice(0, 12);
  let improved = false;
  for (const per of ['all', 'w', 'd']) {
    const b = boardId(course, per);
    const ref = F.doc(db, 'rank', b, 'entries', uid());
    const mine = LS.get(myKey(b));
    const entry = { name, data, t, at: F.serverTimestamp(), v: 2 };
    if (mine && mine.calc === CALC) {
      if (!(t < mine.t)) continue;
      try { await guard(() => F.setDoc(ref, entry)); LS.set(myKey(b), { t, calc: CALC, name }); patchRankCache(b, { uid: uid(), name, data, t }); improved = true; continue; }
      catch (e) { if (e && e.busy) throw e; }
    }
    const s = cnt(await guard(() => F.getDoc(ref)));
    if (s.exists()) {
      if (staleEntry(s.data(), verify)) await guard(() => F.deleteDoc(ref));
      else if (!(t < s.data().t)) { LS.set(myKey(b), { t: s.data().t, calc: CALC, name: s.data().name }); continue; }
    }
    await guard(() => F.setDoc(ref, entry));
    LS.set(myKey(b), { t, calc: CALC, name }); patchRankCache(b, { uid: uid(), name, data, t });
    improved = true;
  }
  return { improved };
}
// 自分が登録した時は、覚えている板の表に自分の行を入れなおす(読みに行かずに自分の順位が見える)
function patchRankCache(b, row) {
  const key = 'rkg_rank_' + b, c = LS.get(key);
  if (!c || !c.rows) return;
  c.rows = c.rows.filter(r => r.uid !== row.uid).concat([row]).sort((x, y) => x.t - y.t);
  LS.set(key, c);
}
// 上位10件ずつ読み、板ごとに端末へ10〜60分覚える。
// 前の計算で登録された記録(走らせ直すと合わない)が上に居座っている時は、合う物が6件に足りなければ1回(10件)だけ続きを読む。
// 混み合い(429)・つながらない時は、1日以内に覚えた表があればそれを出す(rows.stale = true)。
export async function listRank(course, period, verify) {
  const b = boardId(course, period), key = 'rkg_rank_' + b;
  const c = LS.get(key);
  if (c && c.rows && Date.now() - c.at < (RANK_MS[period] || RANK_MS.all)) return c.rows;
  const rows = [];
  let last = null, ok = 0;
  try {
    await init();
    for (let page = 0; page < 2; page++) {
      let q = F.query(F.collection(db, 'rank', b, 'entries'), F.orderBy('t'), F.limit(RANK_LIMIT));
      if (last) q = F.query(q, F.startAfter(last));
      const snap = cnt(await guard(() => F.getDocs(q), 0, true));
      for (const d of snap.docs) {
        const x = d.data(); rows.push({ uid: d.id, name: x.name, data: x.data, t: x.t });
        if (!verify || !staleEntry(x, verify)) ok++;
      }
      if (!verify || ok >= 6 || snap.docs.length < RANK_LIMIT) break;
      last = snap.docs[snap.docs.length - 1];
    }
  } catch (e) {
    if (e && e.busy && c && c.rows) { const r = c.rows.slice(); r.stale = true; return r; }
    throw e;
  }
  LS.set(key, { at: Date.now(), rows });
  // 1日より古い板の覚えを捨てる
  try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('rkg_rank_')) { const v = LS.get(k); if (!v || Date.now() - v.at > 24 * 3600 * 1000) localStorage.removeItem(k); } } } catch (e) { }
  return rows;
}
// 自分の記録: 端末に覚えた物だけ(読みに行かない)
export async function myRank(course, period) {
  const m = LS.get(myKey(boardId(course, period)));
  return m && m.calc === CALC ? { t: m.t, name: m.name } : null;
}
