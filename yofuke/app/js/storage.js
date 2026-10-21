// 端末の中だけの記録。回答の途中と結果(タイプと傾向と日時)。名前やメールは持たない。外へ送らない。
const KEY = 'yofuke.v1';
const MAX = 30;
export function openStore(ls) {
  let data = { progress: {}, results: [], seenIntro: false };
  try { const raw = ls && ls.getItem(KEY); if (raw) data = Object.assign(data, JSON.parse(raw)); } catch (e) { /* 壊れていたら空から */ }
  if (!Array.isArray(data.results)) data.results = [];
  if (!data.progress || typeof data.progress !== 'object') data.progress = {};
  const save = () => { try { ls && ls.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 保存できない時は今回だけ */ } };
  return {
    data, save,
    progress(id) { const p = data.progress[id]; return p && Array.isArray(p.answers) ? p : null; },
    setProgress(id, answers) { data.progress[id] = { answers: answers.slice(), at: Date.now() }; save(); },
    clearProgress(id) { delete data.progress[id]; save(); },
    addResult(story, r, at = Date.now()) {
      data.results.unshift({ story, key: r.key, lean: Object.assign({}, r.lean), at });
      data.results.length = Math.min(data.results.length, MAX); save();
    },
    latest(story) { return data.results.find(r => !story || r.story === story) || null; },
    clearAll() { data.progress = {}; data.results = []; save(); },
  };
}
