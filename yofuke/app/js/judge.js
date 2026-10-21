// 回答からタイプを決める。answers は場面ごとの選択肢の番号(0 か 1)。
// 同じ数で並んだ軸は、その軸でいちばん最後に答えた場面の向きにする。
import { AXES, TYPES } from './types.js';

export function score(story, answers) {
  const out = {};
  for (const ax of AXES) out[ax.id] = { plus: 0, minus: 0, last: 0 };
  story.scenes.forEach((s, i) => {
    const a = answers[i];
    if (a === undefined || a === null) return;
    const o = s.opts[a]; if (!o) return;
    const r = out[s.ax];
    if (o.v > 0) r.plus += 1; else r.minus += 1;
    r.last = o.v;
  });
  return out;
}

export function judge(story, answers) {
  const sc = score(story, answers);
  let key = '';
  const lean = {};
  for (const ax of AXES) {
    const r = sc[ax.id], n = r.plus + r.minus;
    const plus = r.plus > r.minus || (r.plus === r.minus && r.last > 0);
    key += plus ? ax.plus : ax.minus;
    // 左(plus 側)の割合。答えが無ければ半分
    lean[ax.id] = n ? Math.round(100 * r.plus / n) : 50;
  }
  return { key, type: TYPES[key], lean };
}

// 2つのタイプの相性。同じ軸の数と、軸ごとの言葉を返す
const SAME = {
  a: ['二人とも、人の輪に入って元気になる。出かける約束が決まりやすい。', '二人とも、ひとりの時間を大事にする。黙っていても気まずくならない。'],
  b: ['どちらも目の前の確かな物を見る。話が具体的で、すれ違いが少ない。', 'どちらも見えないつながりを見る。たとえ話だけで通じる時がある。'],
  c: ['どちらも筋道で決める。言い合いになっても、あとに残りにくい。', 'どちらも気持ちを先に考える。相手の機嫌の変化にすぐ気づく。'],
  d: ['どちらも先に決めて動く。旅の計画は早く決まる。', 'どちらもその場で変えていく。予定がくずれても笑っていられる。'],
};
const DIFF = {
  a: '片方は人と会って満ち、片方はひとりで満ちる。誘う側と、休む側の役が自然に分かれる。',
  b: '片方は今ある物を、片方はまだ無い物を見る。同じ景色の話をしているのに、見ている所が違う。',
  c: '片方は筋道で、片方は気持ちで決める。正しさと優しさが、たまにぶつかる。',
  d: '片方は先に決めたい、片方は決めずにいたい。待ち合わせの時間で一度はもめる。',
};
const LEVEL = [
  ['反対側の棚', '何もかもが逆向き。だからこそ、相手の当たり前がいちばん新しく見える。'],
  ['遠い棚', '重なる所は少しだけ。その少しを見つけると、急に話が弾む。'],
  ['向かいの棚', '半分が同じで、半分が違う。ちょうどいい距離で並んでいられる。'],
  ['となりの棚', 'ほとんど同じ向き。ちがう一つが、二人の役割を分けてくれる。'],
  ['同じ棚', '同じ品どうし。言わなくても分かるぶん、同じ所でつまずきやすい。'],
];
export function compat(k1, k2) {
  const lines = []; let same = 0;
  AXES.forEach((ax, i) => {
    if (k1[i] === k2[i]) { same++; lines.push({ ax: ax.id, same: true, text: SAME[ax.id][k1[i] === ax.plus ? 0 : 1] }); }
    else lines.push({ ax: ax.id, same: false, text: DIFF[ax.id] });
  });
  return { same, label: LEVEL[same][0], summary: LEVEL[same][1], lines };
}
