// 端末に残す学習の記録(localStorage)。サーバーには送らない。
import { dayNumber } from './srs.js';
const KEY = 'tsukau_v1';
const DEF = () => ({
  v: 1, created: dayNumber(), goal: '', name: '', nameKana: '', onboarded: false, paywallSeen: false,
  cards: {},            // id -> SRS の状態(単語・漢字)
  kana: {},             // 'Hka' -> 正解した回数
  newDone: { day: 0, n: 0, k: 0 }, // n=単語 k=漢字(新しく学んだ数、その日の分)
  streak: { last: 0, cur: 0, best: 0 },
  studyDays: [],        // 学んだ日(日番号、最近90日)
  deck: 'n5', mode: 'words', newPerDay: 5,
  reminder: { on: false, hour: 8, minute: 0 },
  furigana: true,
});
export const S = {
  d: DEF(),
  load() { try { const raw = localStorage.getItem(KEY); if (raw) S.d = Object.assign(DEF(), JSON.parse(raw)); } catch (e) { S.d = DEF(); } return S.d; },
  save() { try { localStorage.setItem(KEY, JSON.stringify(S.d)); } catch (e) { } },
  reset() { S.d = DEF(); S.save(); },
  newDoneToday(today = dayNumber(), mode = 'words') { const f = mode === 'kanji' ? 'k' : 'n'; return S.d.newDone.day === today ? (S.d.newDone[f] || 0) : 0; },
  addNew(today = dayNumber(), mode = 'words') { const f = mode === 'kanji' ? 'k' : 'n'; if (S.d.newDone.day !== today) S.d.newDone = { day: today, n: 0, k: 0 }; S.d.newDone[f] = (S.d.newDone[f] || 0) + 1; },
  // 1日1回、何かを学んだらストリークを進める
  touch(today = dayNumber()) {
    const st = S.d.streak;
    if (st.last === today) return false;
    st.cur = st.last === today - 1 ? st.cur + 1 : 1;
    st.last = today; st.best = Math.max(st.best, st.cur);
    if (!S.d.studyDays.includes(today)) S.d.studyDays = [...S.d.studyDays, today].slice(-90);
    S.save(); return true;
  },
  // 表示用: 昨日までに途切れていたら 0
  streakNow(today = dayNumber()) { const st = S.d.streak; return (st.last === today || st.last === today - 1) ? st.cur : 0; },
};
