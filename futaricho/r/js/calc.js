// フタリチョウの計算と記録の決まり(画面から切り離した、試験できる部分)。
// 役は 'a' と 'b'。差(balance)が正なら b から a へ、負なら a から b へ返す。
// 端数は払った人が持つ(相手の分は切り捨て)。
export const MAX_AMOUNT = 99999999;
export const FREE_FEATURES = ['half', 'all', 'none', 'amount', 'settle', 'send', 'receive', 'qr', 'month', 'card', 'backup', 'cats9', 'favs', 'catChart', 'pairCompare'];
export const FULL_FEATURES = ['ratio', 'fixed', 'catEdit', 'compare', 'csv'];
export const SPLITS = ['half', 'all', 'none', 'amount', 'ratio'];
export const DEFAULT_CATS = [
  { id: 'food', name: '食費' }, { id: 'eat', name: '外食' }, { id: 'daily', name: '日用品' },
  { id: 'rent', name: '家賃' }, { id: 'util', name: '光熱費' }, { id: 'net', name: '通信' },
  { id: 'move', name: '交通' }, { id: 'fun', name: 'おでかけ' }, { id: 'other', name: 'その他' },
];
export const COLORS = ['#4C84E0', '#F08A4B', '#3BA57E', '#E2A93B'];
const other = r => (r === 'a' ? 'b' : 'a');

export function newState() {
  return {
    v: 1, savedAt: 0, seq: 0,
    book: null, // { id, names:{a,b}, colors:{a,b}, me, nu, full, shared }
    entries: [], settles: [], cats: [], fixed: [], favs: [],
    prefs: { sound: true, big: false, payer: null, split: { t: 'half' }, tutorial: 0, hint2: false },
    sync: { sentAt: 0, sentQrAt: 0, recvAt: 0, match: null },
  };
}

export function migrate(o) {
  const s = newState();
  if (!o || typeof o !== 'object') return s;
  Object.assign(s, o);
  s.prefs = Object.assign(newState().prefs, o.prefs || {});
  s.sync = Object.assign(newState().sync, o.sync || {});
  for (const k of ['entries', 'settles', 'cats', 'fixed', 'favs']) if (!Array.isArray(s[k])) s[k] = [];
  return s;
}

export function createBook(st, { me = 'a', nameMe, namePartner, colorMe = 0, colorPartner = 1, now = Date.now(), rand = Math.random }) {
  const names = { [me]: clean(nameMe) || 'わたし', [other(me)]: clean(namePartner) || 'あいて' };
  const colors = { [me]: colorMe, [other(me)]: colorPartner };
  st.book = { id: rid(rand, 12), names, colors, me, nu: now, full: false, shared: false };
  st.prefs.payer = me;
  return st.book;
}

export function clean(s) { return String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 12); }
export function rid(rand = Math.random, n = 10) { const c = 'abcdefghijkmnpqrstuvwxyz23456789'; let s = ''; for (let i = 0; i < n; i++) s += c[Math.floor(rand() * c.length)]; return s; }

export function validAmount(n) { return Number.isInteger(n) && n >= 1 && n <= MAX_AMOUNT; }

// 払った人以外が持つ額(相手の分)。端数は払った人が持つ。
export function owedBy(entry) {
  const amt = entry.amount | 0, sp = entry.split || { t: 'half' };
  switch (sp.t) {
    case 'half': return Math.floor(amt / 2);
    case 'all': return amt;
    case 'none': return 0;
    case 'amount': return Math.max(0, Math.min(amt, Math.floor(Number(sp.v) || 0)));
    case 'ratio': { const pay = Math.max(0, Math.min(100, Number(sp.v))); if (!Number.isFinite(pay)) return Math.floor(amt / 2); return Math.floor(amt * (100 - pay) / 100); }
    default: return Math.floor(amt / 2);
  }
}

// 精算の重複をはずした、生きている精算の一覧
export function liveSettles(st) {
  const seen = new Map();
  for (const s of st.settles) {
    if (s.del) continue;
    const k = (s.basis || s.id) + '|' + s.from + '|' + s.amount;
    const prev = seen.get(k);
    if (!prev || s.id < prev.id) seen.set(k, s);
  }
  return [...seen.values()].sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : 1));
}
export const liveEntries = st => st.entries.filter(e => !e.del);

// 差: 正なら b から a へ
export function balance(st, { upTo = Infinity } = {}) {
  let b = 0;
  for (const e of liveEntries(st)) { if (e.t > upTo) continue; const o = owedBy(e); b += e.payer === 'a' ? o : -o; }
  for (const s of liveSettles(st)) { if (s.at > upTo) continue; b += s.from === 'b' ? -s.amount : s.amount; }
  return b;
}
export function direction(b) { return b > 0 ? { from: 'b', to: 'a', amount: b } : b < 0 ? { from: 'a', to: 'b', amount: -b } : { from: null, to: null, amount: 0 }; }

// 記録を足す・直す・消す
export function addEntry(st, { amount, payer, split = { t: 'half' }, cat = 'other', memo = '', date, now = Date.now(), rand = Math.random }) {
  if (!validAmount(amount)) throw new Error('amount');
  if (payer !== 'a' && payer !== 'b') throw new Error('payer');
  if (!SPLITS.includes(split.t)) throw new Error('split');
  const e = { id: rid(rand, 10), date: date || ymd(now), t: now, amount, payer, split: { ...split }, cat, memo: String(memo || '').slice(0, 40), upd: now, by: st.book ? st.book.me : 'a' };
  if (split.t === 'amount') e.split.v = Math.max(0, Math.min(amount, Math.floor(Number(split.v) || 0)));
  st.entries.push(e);
  st.prefs.payer = payer; st.prefs.split = { t: split.t === 'amount' ? 'half' : split.t, v: split.t === 'ratio' ? split.v : undefined };
  return e;
}
export function editEntry(st, id, patch, now = Date.now()) {
  const e = st.entries.find(x => x.id === id && !x.del); if (!e) return null;
  if ('amount' in patch && !validAmount(patch.amount)) throw new Error('amount');
  Object.assign(e, patch); e.upd = Math.max(now, (e.upd || 0) + 1); return e;
}
export function deleteEntry(st, id, now = Date.now()) {
  const e = st.entries.find(x => x.id === id); if (!e) return null;
  e.del = true; e.upd = Math.max(now, (e.upd || 0) + 1); return e;
}
export function undeleteEntry(st, id, now = Date.now()) {
  const e = st.entries.find(x => x.id === id); if (!e) return null;
  delete e.del; e.upd = Math.max(now, (e.upd || 0) + 1); return e;
}

// 精算した: その時点の差を0に戻す。amount を渡すと一部だけ
export function settle(st, { now = Date.now(), amount, rand = Math.random } = {}) {
  const d = direction(balance(st));
  if (!d.amount) return null;
  const amt = amount == null ? d.amount : Math.max(1, Math.min(d.amount, Math.floor(amount)));
  const s = { id: 's' + rid(rand, 9), at: now, date: ymd(now), amount: amt, from: d.from, basis: digest(st).h, upd: now, by: st.book ? st.book.me : 'a' };
  st.settles.push(s);
  return s;
}
export function undoSettle(st, id, now = Date.now()) { const s = st.settles.find(x => x.id === id); if (!s) return null; s.del = true; s.upd = Math.max(now, (s.upd || 0) + 1); return s; }

// 月のまとめ(ym = 'YYYY-MM')
export function monthSummary(st, ym) {
  const out = { ym, total: 0, count: 0, paid: { a: 0, b: 0 }, share: { a: 0, b: 0 }, own: { a: 0, b: 0 }, cats: {}, settled: 0 };
  for (const e of liveEntries(st)) {
    if (!e.date || e.date.slice(0, 7) !== ym) continue;
    out.count++;
    if (e.split && e.split.t === 'none') { out.own[e.payer] += e.amount; continue; }
    const o = owedBy(e), p = e.payer, q = other(p);
    out.total += e.amount; out.paid[p] += e.amount; out.share[p] += e.amount - o; out.share[q] += o;
    out.cats[e.cat] = (out.cats[e.cat] || 0) + e.amount;
  }
  for (const s of liveSettles(st)) if (s.date && s.date.slice(0, 7) === ym) out.settled += s.amount;
  out.tatekae = { a: out.paid.a - out.share.a, b: out.paid.b - out.share.b }; // 正なら多めに立て替え
  out.ratio = out.total ? { a: Math.round(out.share.a * 100 / out.total), b: 100 - Math.round(out.share.a * 100 / out.total) } : { a: 0, b: 0 };
  return out;
}
export function months(st, now = Date.now()) { const set = new Set([ymd(now).slice(0, 7)]); for (const e of liveEntries(st)) if (e.date) set.add(e.date.slice(0, 7)); return [...set].sort().reverse(); }
export function prevMonths(ym, n) { const [y, m] = ym.split('-').map(Number); const r = []; for (let i = n - 1; i >= 0; i--) { const d = new Date(Date.UTC(y, m - 1 - i, 1)); r.push(d.toISOString().slice(0, 7)); } return r; }

// 固定費(完全版): 毎月 day 日に記録。ID は決まった形なので、ふたりの端末で作っても重ならない
export function applyFixed(st, now = Date.now()) {
  const made = [];
  const today = ymd(now);
  for (const f of st.fixed) {
    if (f.del || !validAmount(f.amount)) continue;
    let ym = f.from;
    for (let guard = 0; guard < 36 && ym <= today.slice(0, 7); guard++) {
      const last = lastDay(ym), day = Math.min(f.day, last);
      const date = ym + '-' + String(day).padStart(2, '0');
      const id = 'fx-' + f.id + '-' + ym;
      if (date <= today && !st.entries.some(e => e.id === id)) {
        const e = { id, date, t: Date.parse(date + 'T00:00:00Z'), amount: f.amount, payer: f.payer, split: { ...f.split }, cat: f.cat, memo: f.memo || f.name || '', upd: Date.parse(date + 'T00:00:00Z'), by: f.by || 'a', fixed: f.id };
        st.entries.push(e); made.push(e);
      }
      ym = nextMonth(ym);
    }
  }
  return made;
}
export function lastDay(ym) { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
export function nextMonth(ym) { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); }

// 日付(端末の時刻の日にち)
export function ymd(t) {
  if (t === undefined) t = Date.now();
  const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ===== ふたりで送り合う(サーバーなし) =====
// 中身の指紋: 窓(from 以降の日付)の生きている記録と精算の、ID と時刻と額から作る数
export function digest(st, from = '') {
  const parts = [];
  for (const e of st.entries) if (!e.del && (e.date || '') >= from) parts.push('e' + e.id + ':' + e.amount + ':' + e.payer + ':' + owedBy(e) + ':' + e.upd);
  for (const s of st.settles) if (!s.del && (s.date || '') >= from) parts.push('s' + s.id + ':' + s.amount + ':' + s.upd);
  parts.sort();
  let h = 0x811c9dc5;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return { n: parts.length, h: h.toString(36) };
}

// 送る中身(縮める前)。mode='all' は窓の全部、'delta' は since の後に変わった物だけ
export function windowStart(now = Date.now()) { const d = new Date(now); d.setDate(1); d.setMonth(d.getMonth() - 2); return ymd(d.getTime()); }
export function buildPayload(st, { now = Date.now(), mode = 'all', since = 0 } = {}) {
  if (!st.book) throw new Error('nobook');
  const from = windowStart(now);
  const unsettledFrom = oldestUnsettled(st);
  const w = unsettledFrom && unsettledFrom < from ? unsettledFrom : from;
  const pick = x => (x.date || '') >= w && (mode === 'all' || (x.upd || 0) > since);
  const b = st.book;
  return {
    k: 'futaricho', v: 1, at: now, by: b.me, w,
    b: { id: b.id, n: [b.names.a, b.names.b], c: [b.colors.a, b.colors.b], nu: b.nu, f: b.full || false },
    e: st.entries.filter(pick).map(e => [e.id, e.date, e.t, e.amount, e.payer, e.split.t, e.split.v ?? null, e.cat, e.memo || '', e.upd, e.del ? 1 : 0, e.by || '', e.fixed || '']),
    s: st.settles.filter(pick).map(s => [s.id, s.date, s.at, s.amount, s.from, s.basis, s.upd, s.del ? 1 : 0, s.by || '']),
    c: st.cats.map(c => [c.id, c.name, c.upd || 0, c.del ? 1 : 0]),
    x: st.fixed.map(f => [f.id, f.name || '', f.day, f.amount, f.payer, f.split.t, f.split.v ?? null, f.cat, f.from, f.upd || 0, f.del ? 1 : 0]),
    q: st.favs.map(f => [f.id, f.name, f.amount, f.payer, f.split.t, f.split.v ?? null, f.cat, f.upd || 0, f.del ? 1 : 0]),
    d: digest(st, w), m: mode,
  };
}
function oldestUnsettled(st) {
  // まだ精算に含まれていない(最後の精算より後の)記録の、いちばん古い日付
  const ls = liveSettles(st); const lastAt = ls.length ? ls[ls.length - 1].at : -Infinity;
  let min = null; for (const e of liveEntries(st)) if (e.t > lastAt && (!min || e.date < min)) min = e.date;
  return min;
}

export function checkPayload(p) {
  if (!p || p.k !== 'futaricho' || p.v !== 1) return 'notours';
  if (!p.b || typeof p.b.id !== 'string' || !Array.isArray(p.b.n) || !Array.isArray(p.e) || !Array.isArray(p.s)) return 'broken';
  for (const r of p.e) if (!Array.isArray(r) || typeof r[0] !== 'string' || !validAmount(r[3]) || (r[4] !== 'a' && r[4] !== 'b') || !SPLITS.includes(r[5])) return 'broken';
  for (const r of p.s) if (!Array.isArray(r) || typeof r[0] !== 'string' || !validAmount(r[3]) || (r[4] !== 'a' && r[4] !== 'b')) return 'broken';
  return '';
}

// 受け取る前の見立て: 'join'(はじめて加わる)・'same'(同じ帳面)・'other'(別の帳面)
export function relation(st, p) {
  if (!st.book) return 'join';
  if (st.book.id === p.b.id) return 'same';
  return st.book.shared ? 'other' : 'join-solo';
}

// 帳面に加わる(me は相手の帳面の中での自分の役)。1人で入れていた記録は役を合わせて残す
export function joinBook(st, p, me) {
  const hadBook = !!st.book, oldMe = hadBook ? st.book.me : me;
  if (hadBook && oldMe !== me) {
    for (const e of st.entries) { e.payer = other(e.payer); if (e.by) e.by = other(e.by); }
    for (const s of st.settles) { s.from = other(s.from); if (s.by) s.by = other(s.by); }
    for (const f of st.fixed) f.payer = other(f.payer);
  }
  const keepFull = hadBook && st.book.full;
  st.book = { id: p.b.id, names: { a: clean(p.b.n[0]), b: clean(p.b.n[1]) }, colors: { a: p.b.c[0] | 0, b: p.b.c[1] | 0 }, me, nu: p.b.nu || 0, full: !!p.b.f || keepFull, shared: true };
  st.prefs.payer = me;
  return mergePayload(st, p);
}

// 取り込み。同じ ID は upd が大きい方を残す。何回取り込んでも増えない
export function mergePayload(st, p, now = Date.now()) {
  const r = { added: 0, updated: 0, same: 0, settles: 0 };
  const byId = new Map(st.entries.map(e => [e.id, e]));
  for (const x of p.e) {
    const e = { id: x[0], date: x[1], t: x[2], amount: x[3], payer: x[4], split: { t: x[5] }, cat: x[7] || 'other', memo: String(x[8] || '').slice(0, 40), upd: x[9] || 0, by: x[11] || '' };
    if (x[6] != null) e.split.v = x[6];
    if (x[10]) e.del = true;
    if (x[12]) e.fixed = x[12];
    const cur = byId.get(e.id);
    if (!cur) { st.entries.push(e); byId.set(e.id, e); if (!e.del) r.added++; }
    else if ((e.upd || 0) > (cur.upd || 0)) { Object.keys(cur).forEach(k => delete cur[k]); Object.assign(cur, e); r.updated++; }
    else r.same++;
  }
  const sById = new Map(st.settles.map(s => [s.id, s]));
  for (const x of p.s) {
    const s = { id: x[0], date: x[1], at: x[2], amount: x[3], from: x[4], basis: x[5], upd: x[6] || 0, by: x[8] || '' };
    if (x[7]) s.del = true;
    const cur = sById.get(s.id);
    if (!cur) { st.settles.push(s); sById.set(s.id, s); r.settles++; }
    else if (s.upd > (cur.upd || 0)) Object.assign(cur, s);
  }
  for (const x of p.c || []) {
    const cur = st.cats.find(c => c.id === x[0]);
    const c = { id: x[0], name: clean(x[1]), upd: x[2] || 0 }; if (x[3]) c.del = true;
    if (!cur) st.cats.push(c); else if (c.upd > (cur.upd || 0)) Object.assign(cur, c);
  }
  for (const x of p.x || []) {
    const cur = st.fixed.find(f => f.id === x[0]);
    const f = { id: x[0], name: clean(x[1]), day: x[2], amount: x[3], payer: x[4], split: { t: x[5] }, cat: x[7], from: x[8], upd: x[9] || 0 };
    if (x[6] != null) f.split.v = x[6]; if (x[10]) f.del = true;
    if (!cur) st.fixed.push(f); else if (f.upd > (cur.upd || 0)) Object.assign(cur, f);
  }
  for (const x of p.q || []) {
    const cur = st.favs.find(f => f.id === x[0]);
    const f = { id: x[0], name: clean(x[1]), amount: x[2], payer: x[3], split: { t: x[4] }, cat: x[6], upd: x[7] || 0 };
    if (x[5] != null) f.split.v = x[5]; if (x[8]) f.del = true;
    if (!validAmount(f.amount)) continue;
    if (!cur) st.favs.push(f); else if (f.upd > (cur.upd || 0)) Object.assign(cur, f);
  }
  // 呼び名・色は新しく直した方
  if (st.book && p.b && (p.b.nu || 0) > (st.book.nu || 0)) { st.book.names = { a: clean(p.b.n[0]), b: clean(p.b.n[1]) }; st.book.colors = { a: p.b.c[0] | 0, b: p.b.c[1] | 0 }; st.book.nu = p.b.nu; }
  if (st.book && p.b && p.b.f) st.book.full = true;
  if (st.book) st.book.shared = true;
  // 一致の確かめ: 'all' で送られた時だけ、相手の指紋と比べられる
  const mine = digest(st, p.w);
  r.match = p.m === 'all' ? (mine.h === p.d.h ? 'ok' : 'mine-more') : 'partial';
  r.mine = mine;
  st.sync.recvAt = now; st.sync.match = { at: now, r: r.match };
  return r;
}

// ===== 文字列にする(縮めて base64url)=====
export async function encodePayload(p) {
  const raw = new TextEncoder().encode(JSON.stringify(p));
  const cs = new CompressionStream('deflate-raw');
  const buf = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(cs)).arrayBuffer());
  return 'F1' + b64u(buf);
}
export async function decodePayload(code) {
  const m = String(code || '').match(/F1([A-Za-z0-9_-]{8,})/);
  if (!m) return null;
  try {
    const buf = unb64u(m[1]);
    const ds = new DecompressionStream('deflate-raw');
    const txt = await new Response(new Blob([buf]).stream().pipeThrough(ds)).text();
    return JSON.parse(txt);
  } catch (e) { return null; }
}
function b64u(u8) { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

// 精算の結果の文
export function settleText(st, b = balance(st)) {
  const d = direction(b), n = st.book.names;
  if (!d.amount) return 'いまは、おあいこです(フタリチョウ)';
  return `精算すると、${n[d.from]}さんから ${n[d.to]}さんへ ${yen(d.amount)}(フタリチョウ)`;
}
export function yen(n) { return '¥' + Math.round(n).toLocaleString('ja-JP'); }

// CSV(完全版)
export function toCsv(st, catName = id => id) {
  const n = st.book.names; const q = s => '"' + String(s).replace(/"/g, '""') + '"';
  const head = ['日付', '金額', '払った人', '分け方', '相手の分', 'カテゴリ', 'メモ'];
  const sp = e => ({ half: '半分ずつ', all: '全部相手の分', none: '自分の分だけ', amount: '金額で指定', ratio: '割合 ' + (e.split.v) + ':' + (100 - e.split.v) }[e.split.t]);
  const rows = liveEntries(st).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.t - y.t)).map(e => [e.date, e.amount, n[e.payer], sp(e), owedBy(e), catName(e.cat), e.memo || ''].map(q).join(','));
  return [head.map(q).join(','), ...rows].join('\r\n');
}

// よく使う支払い(いつもの)。押すとその場で記録できる
export const MAX_FAVS = 8;
export function addFav(st, { name, amount, payer, split = { t: 'half' }, cat = 'other', now = Date.now(), rand = Math.random }) {
  if (!validAmount(amount)) throw new Error('amount');
  if (st.favs.filter(f => !f.del).length >= MAX_FAVS) return null;
  const f = { id: 'q' + rid(rand, 8), name: clean(name) || '', amount, payer, split: { ...split }, cat, upd: now };
  st.favs.push(f); return f;
}
export function removeFav(st, id, now = Date.now()) { const f = st.favs.find(x => x.id === id); if (f) { f.del = true; f.upd = now; } return f; }
export function entryFromFav(st, id, { now = Date.now(), date, rand = Math.random } = {}) {
  const f = st.favs.find(x => x.id === id && !x.del); if (!f) return null;
  return addEntry(st, { amount: f.amount, payer: f.payer, split: f.split, cat: f.cat, memo: f.name, date, now, rand });
}
// よく入れる組み合わせ(いつものの候補): 同じ額・カテゴリ・払った人が3回以上
export function favSuggestions(st) {
  const m = new Map();
  for (const e of liveEntries(st)) { if (e.fixed) continue; const k = e.amount + '|' + e.cat + '|' + e.payer + '|' + e.split.t; m.set(k, (m.get(k) || 0) + 1); }
  const have = new Set(st.favs.filter(f => !f.del).map(f => f.amount + '|' + f.cat + '|' + f.payer + '|' + f.split.t));
  return [...m.entries()].filter(([k, n]) => n >= 3 && !have.has(k)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => { const [amount, cat, payer, t] = k.split('|'); return { amount: +amount, cat, payer, split: { t }, n }; });
}
// ふたりの比べ(直近 n か月): 月ごとの負担の割合と、カテゴリごとの払った人の内わけ
export function pairCompare(st, ym, n = 6) {
  const list = prevMonths(ym, n).map(m => monthSummary(st, m));
  const cats = {};
  for (const e of liveEntries(st)) { if (!e.date || e.date.slice(0, 7) !== ym || (e.split && e.split.t === 'none')) continue; const c = cats[e.cat] || (cats[e.cat] = { a: 0, b: 0 }); c[e.payer] += e.amount; }
  return { months: list, cats };
}
