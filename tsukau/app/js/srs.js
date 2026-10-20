// 間隔反復(日単位)。カードの状態は { ivl:日数, ease, due:日番号, reps, lapses, seen:日番号 }
// 「休んでも山にならない」: 1日に出す復習は REVIEW_CAP まで。遅れの大きい物から出し、残りは翌日以降に回す。
// 新しい語は 1日 newLimit まで(無料は 5)。
export const REVIEW_CAP = 30;
export const FREE_NEW_PER_DAY = 5;
export const MAX_NEW_PER_DAY = 30;

export function dayNumber(date = new Date()) {
  // 端末の暦の日付で数える(時差を含めてローカルの0時で切り替わる)
  return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) / 86400000);
}

export function newCard(today) { return { ivl: 0, ease: 2.5, due: today, reps: 0, lapses: 0, seen: today }; }

// grade: 0=Again 1=Hard 2=Good 3=Easy
export function review(card, grade, today) {
  const c = Object.assign({}, card);
  c.seen = today;
  if (grade === 0) {
    c.lapses += 1; c.reps = 0; c.ivl = 0; c.ease = Math.max(1.3, c.ease - 0.2); c.due = today; // 今日もう一度
    return c;
  }
  if (c.reps === 0) c.ivl = grade === 1 ? 1 : grade === 2 ? 1 : 3;
  else if (c.reps === 1) c.ivl = grade === 1 ? 2 : grade === 2 ? 3 : 6;
  else {
    const late = Math.max(0, today - c.due); // 遅れて正解した分は少しだけ伸ばす
    const base = c.ivl + late / 2;
    c.ivl = Math.round(grade === 1 ? base * 1.2 : grade === 2 ? base * c.ease : base * c.ease * 1.3);
  }
  if (grade === 1) c.ease = Math.max(1.3, c.ease - 0.15);
  if (grade === 3) c.ease = Math.min(3.0, c.ease + 0.15);
  c.ivl = Math.max(1, Math.min(365, c.ivl));
  c.reps += 1;
  c.due = today + c.ivl;
  return c;
}

// 今日の復習(遅れの大きい順、上限まで)と、新しい語の候補
// cards: { id: state }, order: 出題順の id の配列, opts: { newLimit, newDoneToday, cap }
export function buildQueue(cards, order, today, opts = {}) {
  const cap = opts.cap ?? REVIEW_CAP;
  const newLimit = opts.newLimit ?? FREE_NEW_PER_DAY;
  const newDone = opts.newDoneToday ?? 0;
  const due = [];
  for (const id of order) {
    const c = cards[id];
    if (c && c.due <= today) due.push([id, today - c.due, c.ivl]);
  }
  due.sort((a, b) => (b[1] - a[1]) || (a[2] - b[2]));
  const reviews = due.slice(0, cap).map(x => x[0]);
  const fresh = [];
  const room = Math.max(0, newLimit - newDone);
  for (const id of order) {
    if (fresh.length >= room) break;
    if (!cards[id]) fresh.push(id);
  }
  return { reviews, fresh, overflow: Math.max(0, due.length - cap) };
}

// 次に出す日を人が読める形で(ボタンの下の小さな文字に使う)
export function previewIvl(card, grade, today) {
  const c = review(card || newCard(today), grade, today);
  return c.due - today;
}
