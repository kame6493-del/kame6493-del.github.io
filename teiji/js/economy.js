/* 売上と疲れの計算(画面に依存しない。tools/sim.js からも使う) */
(function (root) {
  const CFG = root.CFG || (typeof require !== 'undefined' ? require('./config.js') : null);

  function upCost(up, lvl) {
    return Math.ceil(up.cost * Math.pow(up.growth || CFG.costGrowth, lvl));
  }
  function sums(levels) {
    const s = { tap: 0, auto: 0, idle: 0, all: 0, total: 0 };
    for (const up of CFG.UPGRADES) {
      const n = levels[up.id] || 0;
      if (!n) continue;
      s[up.type] += up.value * n;
      s.total += n;
    }
    return s;
  }
  function moraleMul(p) {
    return (1 + (p.morale || 0)) * (1 + CFG.achievementMorale * (p.achCount || 0));
  }
  function buffMul(st, kind) {
    let m = 1;
    for (const b of st.buffs || []) if (b.kind === kind || b.kind === 'all') m *= b.mul;
    return m;
  }
  function sleepers(st) {
    let n = 0;
    for (let i = 0; i < st.fatigue.length; i++) if (!st.gone[i] && st.fatigue[i] >= 100) n++;
    return n;
  }
  function globalMul(st, p) {
    const s = sums(st.levels);
    return (1 + s.all) * Math.pow(CFG.sleepPenalty, sleepers(st));
  }
  function tapValue(st, p) {
    const s = sums(st.levels);
    return Math.max(1, Math.round(CFG.tapBase * (1 + s.tap) * moraleMul(p) * globalMul(st, p) * buffMul(st, 'tap')));
  }
  function autoPerSec(st, p) {
    const s = sums(st.levels);
    return s.auto * (1 + s.idle) * globalMul(st, p) * buffMul(st, 'auto');
  }
  function fatigueRate(st, p) {
    const pace = autoPerSec(st, p) + tapValue(st, p) * 4;
    return (CFG.fatigue.basePerSec + CFG.fatigue.perLogPerSec * Math.log10(1 + pace)) * (st.fatigueMul || 1) * buffMul(st, 'fatigue');
  }
  function stageOf(f) {
    if (f >= 100) return 10;
    return Math.min(9, 1 + Math.floor(f / 11.112));
  }
  const E = { upCost, sums, moraleMul, tapValue, autoPerSec, fatigueRate, stageOf, globalMul, sleepers };
  root.ECON = E;
  if (typeof module !== 'undefined') module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
