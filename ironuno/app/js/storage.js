// 端末の中の記録。写真は残さず、結果の数字と日時だけ。
const KEY = 'ironunu.v2';
const MAX = 50;

export function openStore(ls) {
  let data = { results: [], showFace: false, owned: false };
  try { const raw = ls && ls.getItem(KEY); if (raw) data = Object.assign(data, JSON.parse(raw)); } catch (e) { /* 壊れていたら空から */ }
  if (!Array.isArray(data.results)) data.results = [];
  const save = () => { try { ls && ls.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 保存できない時は今回だけ */ } };
  return {
    data, save,
    addResult(r, at = Date.now()) {
      data.results.unshift({ at, top: r.top, second: r.second, shares: Object.assign({}, r.shares), clarity: r.clarity, calibrated: !!r.calibrated });
      data.results.length = Math.min(data.results.length, MAX); save();
    },
    latest() { return data.results[0] || null; },
    // いちばん多く出た季節(同じ数なら新しい方)
    summary() {
      const n = {}; for (const r of data.results) n[r.top] = (n[r.top] || 0) + 1;
      let top = null; for (const r of data.results) if (!top || n[r.top] > n[top]) top = r.top;
      return { count: data.results.length, top, times: top ? n[top] : 0 };
    },
  };
}
