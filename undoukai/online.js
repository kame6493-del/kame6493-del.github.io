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
const CACHE_MS = 5 * 60 * 1000;

function b64(bytes) { let s = ''; for (const x of bytes) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64(str) { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)); const a = []; for (let i = 0; i < s.length; i++) a.push(s.charCodeAt(i)); return a; }
export function packCreature(cr) { return b64(RU.Creature.fitBytes(cr, PER_BYTES)); }
export function unpackCreature(str) { return RU.Creature.fromBytes(unb64(str), 0)[0]; }

export async function init() {
  if (db) return;
  if (!firebaseConfig) throw new Error('オンラインの設定がまだです');
  const [a, au, fs] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')]);
  F = Object.assign({}, a, au, fs);
  app = F.initializeApp(firebaseConfig);
  auth = F.getAuth(app);
  db = F.getFirestore(app);
  const cred = await F.signInAnonymously(auth);
  user = cred.user;
}
export function uid() { return user ? user.uid : ''; }
// 試験用(ルールの試験で生の SDK を使う)
export function _raw() { return { F, db, auth }; }

// ---------- みんなのらくがき ----------
export async function postCreature(cr, info) {
  const data = packCreature(cr);
  const userRef = F.doc(db, 'users', uid());
  const ref = F.doc(F.collection(db, 'creatures'));
  const day = Math.floor(Date.now() / 86400000);
  try {
    await F.runTransaction(db, async tx => {
      const u = await tx.get(userRef);
      if (u.exists()) {
        const d = u.data();
        const last = d.lastPost && d.lastPost.toMillis ? d.lastPost.toMillis() : 0;
        if (Date.now() - last < 30000) throw new Error('少し待ってからもう一度出してね(30秒に1回まで)');
        if (d.day === day && d.count >= 10) throw new Error('出せるのは1日10匹までです');
        tx.update(userRef, { lastPost: F.serverTimestamp(), day, count: d.day === day ? d.count + 1 : 1 });
      } else tx.set(userRef, { lastPost: F.serverTimestamp(), day, count: 1 });
      tx.set(ref, { uid: uid(), name: (cr.name || '').slice(0, 12), data, mode: info ? info.mode : '', created: F.serverTimestamp(), reports: 0, visible: true, rnd: Math.random() * 0.998 + 0.001 });
    });
  } catch (e) {
    if (e && /permission/i.test(e.code || e.message)) throw new Error('いまは出せません(回数の上限かもしれません)');
    throw e;
  }
  try { sessionStorage.removeItem('rkg_gal_first'); } catch (e) { }
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
// 一覧は12件ずつ。最初のページは5分だけ端末に覚えて、読みの回数を減らす
export async function listCreatures(cursor) {
  if (!cursor) {
    try { const c = JSON.parse(sessionStorage.getItem('rkg_gal_first') || 'null'); if (c && Date.now() - c.at < CACHE_MS) return { items: c.items.map(it => ({ id: it.id, creature: unpackCreature(it.data), created: it.created })).map((it, i) => (it.creature.name = c.items[i].name, it)), cursor: c.items.length >= 12 ? { cached: c.last } : null }; } catch (e) { }
  }
  let q = F.query(F.collection(db, 'creatures'), F.where('visible', '==', true), F.orderBy('created', 'desc'), F.limit(12));
  if (cursor && cursor.snap) q = F.query(q, F.startAfter(cursor.snap));
  else if (cursor && cursor.cached) q = F.query(q, F.startAfter(F.Timestamp.fromMillis(cursor.cached)));
  const snap = await F.getDocs(q);
  const items = snap.docs.map(toItem).filter(Boolean);
  if (!cursor) {
    try {
      const lastDoc = snap.docs[snap.docs.length - 1];
      sessionStorage.setItem('rkg_gal_first', JSON.stringify({ at: Date.now(), last: lastDoc ? lastDoc.data().created.toMillis() : 0, items: snap.docs.map(d => ({ id: d.id, data: d.data().data, name: d.data().name, created: toItem(d) ? toItem(d).created : '' })) }));
    } catch (e) { }
  }
  return { items, cursor: snap.docs.length >= 12 ? { snap: snap.docs[snap.docs.length - 1] } : null };
}
export async function randomCreature() {
  const r = Math.random();
  const col = F.collection(db, 'creatures');
  let snap = await F.getDocs(F.query(col, F.where('visible', '==', true), F.where('rnd', '>=', r), F.orderBy('rnd'), F.limit(1)));
  if (snap.empty) snap = await F.getDocs(F.query(col, F.where('visible', '==', true), F.where('rnd', '<', r), F.orderBy('rnd'), F.limit(1)));
  if (snap.empty) return null;
  const it = toItem(snap.docs[0]);
  if (it && it.creature && false) return null;
  return it;
}
export async function report(id) {
  const ref = F.doc(db, 'creatures', id);
  const rref = F.doc(db, 'creatures', id, 'reports', uid());
  await F.runTransaction(db, async tx => {
    const s = await tx.get(ref); const r = await tx.get(rref);
    if (!s.exists()) throw new Error('もうありません');
    if (r.exists()) throw new Error('通報ずみです');
    const n = (s.data().reports || 0) + 1;
    tx.update(ref, { reports: n, visible: n < 3 });
    tx.set(rref, { at: F.serverTimestamp() });
  });
  try { sessionStorage.removeItem('rkg_gal_first'); } catch (e) { }
}

// ---------- 部屋(3人) ----------
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export async function createRoom() {
  for (let k = 0; k < 5; k++) {
    let code = ''; for (let i = 0; i < 5; i++) code += ABC[Math.floor(Math.random() * ABC.length)];
    const ref = F.doc(db, 'rooms', code);
    try {
      await F.runTransaction(db, async tx => {
        const s = await tx.get(ref);
        if (s.exists()) throw new Error('dup');
        tx.set(ref, { host: uid(), state: 'lobby', members: [uid()], names: { [uid()]: '' }, created: F.serverTimestamp(), course: ['track', 'obstacle', 'slope', 'water'][Math.floor(Math.random() * 4)], seed: Math.floor(Math.random() * 2147483647), order: [], drawSec: 40 });
      });
      return code;
    } catch (e) { if (e.message !== 'dup') throw e; }
  }
  throw new Error('部屋をつくれませんでした');
}
export async function joinRoom(code) {
  const ref = F.doc(db, 'rooms', code);
  await F.runTransaction(db, async tx => {
    const s = await tx.get(ref);
    if (!s.exists()) throw new Error('その部屋はありません');
    const d = s.data();
    if ((d.members || []).includes(uid())) return;
    if (d.state !== 'lobby') throw new Error('その部屋はもう始まっています');
    if ((d.members || []).length >= 3) throw new Error('その部屋はいっぱいです');
    tx.update(ref, { members: d.members.concat([uid()]), names: Object.assign({}, d.names, { [uid()]: '' }) });
  });
}
export function watchRoom(code, cb) {
  let room = null, entries = {};
  const u1 = F.onSnapshot(F.doc(db, 'rooms', code), s => { room = s.exists() ? s.data() : null; cb(room, entries); }, e => cb(null, entries));
  const u2 = F.onSnapshot(F.collection(db, 'rooms', code, 'entries'), s => {
    entries = {};
    s.forEach(d => { try { entries[d.id] = { creature: unpackCreature(d.data().data) }; } catch (e) { } });
    cb(room, entries);
  }, () => { });
  return () => { u1(); u2(); };
}
export async function startDrawing(code, sec) {
  await F.updateDoc(F.doc(db, 'rooms', code), { state: 'drawing', drawSec: sec || 40 });
}
export async function submitEntry(code, cr) {
  await F.setDoc(F.doc(db, 'rooms', code, 'entries', uid()), { data: packCreature(cr), at: F.serverTimestamp() });
}
let starting = false;
export async function startRace(code, order) {
  if (starting) return; starting = true;
  try { await F.updateDoc(F.doc(db, 'rooms', code), { state: 'race', order: order.slice(0, 3) }); }
  finally { setTimeout(() => { starting = false; }, 3000); }
}
export async function leaveRoom(code) {
  const ref = F.doc(db, 'rooms', code);
  await F.runTransaction(db, async tx => {
    const s = await tx.get(ref); if (!s.exists()) return;
    const d = s.data();
    if (d.host === uid()) { if (d.state === 'lobby') tx.delete(ref); return; }
    if (!(d.members || []).includes(uid())) return;
    const names = Object.assign({}, d.names); delete names[uid()];
    tx.update(ref, { members: d.members.filter(x => x !== uid()), names });
  });
}

// ---------- ランキング(タイムアタック) ----------
// rank/{board}/entries/{uid}。board = <コース>_all / <コース>_d<日> / <コース>_w<週>(日本時間)。1人1件、速くなった時だけ書きかえる。
// 送るのは 名前・絵(data)・タイム(t)。t は並べるためだけに使い、表示する側で絵から走らせ直して合わない物は出さない。
export function jstDay() { return Math.floor((Date.now() + 9 * 3600 * 1000) / 86400000); }
export function boardId(course, period) {
  const d = jstDay();
  return course + '_' + (period === 'd' ? 'd' + d : period === 'w' ? 'w' + Math.floor((d + 3) / 7) : 'all');
}
export async function submitRank(course, cr, t) {
  const data = packCreature(cr);
  const name = String(cr.name || '').slice(0, 12);
  let improved = false;
  for (const per of ['all', 'w', 'd']) {
    const ref = F.doc(db, 'rank', boardId(course, per), 'entries', uid());
    const s = await F.getDoc(ref);
    if (s.exists() && !(t < s.data().t)) continue;
    await F.setDoc(ref, { name, data, t, at: F.serverTimestamp(), v: 2 });
    improved = true;
  }
  return { improved };
}
export async function listRank(course, period) {
  const q = F.query(F.collection(db, 'rank', boardId(course, period), 'entries'), F.orderBy('t'), F.limit(50));
  const snap = await F.getDocs(q);
  return snap.docs.map(d => Object.assign({ uid: d.id }, d.data()));
}
export async function myRank(course, period) {
  const s = await F.getDoc(F.doc(db, 'rank', boardId(course, period), 'entries', uid()));
  return s.exists() ? s.data() : null;
}
