// 端末の中の記録。写真は残さず、結果の数字と日時だけ。
const KEY = 'ironunu.v2';
const MAX = 50;

export function openStore(ls) {
  let data = { results: [], showFace: false, owned: false, friends: [], nudged: false };
  try { const raw = ls && ls.getItem(KEY); if (raw) data = Object.assign(data, JSON.parse(raw)); } catch (e) { /* 壊れていたら空から */ }
  if (!Array.isArray(data.results)) data.results = [];
  if (!Array.isArray(data.friends)) data.friends = [];
  data.friends = data.friends.filter(f => f && typeof f.top === 'string');
  const save = () => { try { ls && ls.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 保存できない時は今回だけ */ } };
  return {
    data, save,
    addResult(r, at = Date.now()) {
      data.results.unshift({ at, top: r.top, second: r.second, shares: Object.assign({}, r.shares), clarity: r.clarity, calibrated: !!r.calibrated });
      data.results.length = Math.min(data.results.length, MAX); save();
    },
    // 友だちの季節(名前は本人が付けた呼び名だけ。10字まで)。同じ呼び名・同じ季節は入れ直さない
    addFriend(f, at = Date.now()) {
      const name = String(f.name || '').trim().slice(0, 10) || '友だち' + (data.friends.length + 1);
      const dup = data.friends.find(x => x.name === name && x.top === f.top && x.second === (f.second || null));
      if (dup) return dup;
      const rec = { id: at.toString(36) + Math.random().toString(36).slice(2, 6), name, top: f.top, second: f.second || null, at };
      data.friends.push(rec); save(); return rec;
    },
    removeFriend(id) { data.friends = data.friends.filter(x => x.id !== id); save(); },
    latest() { return data.results[0] || null; },
    // いちばん多く出た季節(同じ数なら新しい方)
    summary() {
      const n = {}; for (const r of data.results) n[r.top] = (n[r.top] || 0) + 1;
      let top = null; for (const r of data.results) if (!top || n[r.top] > n[top]) top = r.top;
      return { count: data.results.length, top, times: top ? n[top] : 0 };
    },
  };
}
