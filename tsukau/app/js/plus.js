// Tsukau Plus(サブスク+買い切り)。らくがき運動会の Full と同じ作り。
// Android・iOS のアプリ版だけ RevenueCat の Purchases プラグインで買える。ブラウザ版は買えず、案内だけ出す。
// 値段・無料体験の有無はストアの商品から読む(画面に作った数字を出さない)。
// RevenueCat の公開キーはここに書かない。ビルド時に js/config.js(リポジトリに入れない)で window.TSUKAU_CONFIG.rcKeys に入れる。まだ未作成。
import { t } from './i18n.js';

const KEY = 'tsukau_plus';
export const Plus = {
  ENT: 'plus',
  RC_KEYS: { android: '', ios: '' },
  owned: false, pkgs: { annual: null, monthly: null, lifetime: null }, busy: false, ready: null, status: '', onChange: null,
  platform() { const C = window.Capacitor; try { if (C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform) return C.getPlatform(); } catch (e) { } return 'web'; },
  native() { const p = Plus.platform(); return p === 'android' || p === 'ios'; },
  has() { return (Plus.native() && Plus.owned) || Plus.devOverride(); },
  devOverride() { try { return new URLSearchParams(location.search).get('test') === '1' && new URLSearchParams(location.search).get('plus') === '1'; } catch (e) { return false; } },
  plugin() { if (!Plus.native()) return null; const C = window.Capacitor; return (C && C.Plugins && C.Plugins.Purchases) || null; },
  isPlus(info) { return !!(info && info.entitlements && info.entitlements.active && info.entitlements.active[Plus.ENT]); },
  cancelled(e) { return !!(e && (e.userCancelled || (e.data && e.data.userCancelled) || String(e.code) === '1')); },
  pending(e) { return !!(e && (String(e.code) === '20' || /pending/i.test(String(e.message || '')))); },
  offline() { return navigator.onLine === false; },
  init() {
    const Pur = Plus.plugin(); if (!Pur) return Promise.resolve(null);
    const cfg = (window.TSUKAU_CONFIG && window.TSUKAU_CONFIG.rcKeys) || {};
    const key = cfg[Plus.platform()] || Plus.RC_KEYS[Plus.platform()];
    if (!key) return Promise.reject(new Error('no key'));
    if (!Plus.ready) Plus.ready = Promise.resolve(Pur.configure({ apiKey: key })).then(() => Pur, e => { Plus.ready = null; throw e; });
    return Plus.ready;
  },
  restoreLocal() { try { Plus.owned = Plus.native() && localStorage.getItem(KEY) === '1'; } catch (e) { } },
  async load() {
    const Pur = await Plus.init(); if (!Pur) return;
    try {
      const offers = await Pur.getOfferings();
      const list = (offers && offers.current && offers.current.availablePackages) || [];
      for (const p of list) {
        const ty = String(p.packageType || p.identifier || '').toLowerCase();
        if (ty.includes('annual')) Plus.pkgs.annual = p;
        else if (ty.includes('monthly')) Plus.pkgs.monthly = p;
        else if (ty.includes('lifetime')) Plus.pkgs.lifetime = p;
      }
    } catch (e) { /* 値段が読めない時は値段なしで出す */ }
    try {
      let r = await Pur.getCustomerInfo();
      if (!Plus.isPlus(r && r.customerInfo) && Plus.platform() === 'android' && Pur.syncPurchases && !Plus.owned) { await Pur.syncPurchases(); r = await Pur.getCustomerInfo(); }
      Plus.set(Plus.isPlus(r && r.customerInfo), true);
    } catch (e) { /* つながらない時は前の記録のまま */ }
    Plus.changed();
  },
  set(on, quiet) {
    Plus.owned = !!on;
    try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch (e) { }
    if (on && !quiet) Plus.status = t('plusActive');
  },
  changed() { if (typeof Plus.onChange === 'function') Plus.onChange(); },
  // 無料体験の日数(ストアの商品に体験が付いている時だけ)。無ければ 0
  trialDays(pkg) {
    const pr = pkg && pkg.product; if (!pr) return 0;
    const ip = pr.introPrice;
    if (ip && Number(ip.price) === 0) return unitDays(ip.periodUnit, ip.periodNumberOfUnits);
    const fp = pr.defaultOption && pr.defaultOption.freePhase;
    if (fp && fp.billingPeriod) return isoDays(fp.billingPeriod.iso8601);
    return 0;
  },
  price(pkg) { return (pkg && pkg.product && pkg.product.priceString) || ''; },
  // 年額を12で割った月あたり(ストアの値段から計算。通貨の書き方は端末に任せる)
  perMonth(pkg) {
    const pr = pkg && pkg.product; if (!pr || !pr.price || !pr.currencyCode) return '';
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: pr.currencyCode }).format(Math.floor(pr.price / 12 * 100) / 100); } catch (e) { return ''; }
  },
  async buy(kind) {
    const Pur = Plus.plugin();
    if (!Pur) { Plus.status = Plus.native() ? t('storeFail') : t('webOnly'); Plus.changed(); return; }
    if (Plus.busy) return;
    if (Plus.offline()) { Plus.status = t('offline'); Plus.changed(); return; }
    Plus.busy = true; Plus.status = t('storeBusy'); Plus.changed();
    try {
      if (!Plus.pkgs[kind]) await Plus.load();
      if (Plus.owned) { Plus.status = t('plusActive'); return; }
      const pkg = Plus.pkgs[kind]; if (!pkg) throw new Error('no package');
      const r = await Pur.purchasePackage({ aPackage: pkg });
      if (Plus.isPlus(r && r.customerInfo)) { Plus.set(true); }
      else Plus.status = t('pending');
    } catch (e) {
      Plus.status = Plus.cancelled(e) ? t('cancelled') : Plus.pending(e) ? t('pending') : Plus.offline() ? t('offline') : t('storeFail');
    } finally { Plus.busy = false; Plus.changed(); }
  },
  async restore() {
    const Pur = Plus.plugin();
    if (!Pur) { Plus.status = Plus.native() ? t('storeFail') : t('webOnly'); Plus.changed(); return; }
    if (Plus.busy) return;
    if (Plus.offline()) { Plus.status = t('offline'); Plus.changed(); return; }
    Plus.busy = true; Plus.status = t('storeBusy'); Plus.changed();
    try {
      await Plus.init();
      const r = await Pur.restorePurchases();
      if (Plus.isPlus(r && r.customerInfo)) { Plus.set(true, true); Plus.status = t('restoredOk'); }
      else Plus.status = t('restoredNone');
    } catch (e) { Plus.status = Plus.offline() ? t('offline') : t('storeFail'); }
    finally { Plus.busy = false; Plus.changed(); }
  },
};
function unitDays(unit, n) { n = Number(n) || 1; const u = String(unit || '').toUpperCase(); return u === 'DAY' ? n : u === 'WEEK' ? n * 7 : u === 'MONTH' ? n * 30 : u === 'YEAR' ? n * 365 : 0; }
function isoDays(iso) { const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(String(iso || '')); if (!m) return 0; return (+m[1] || 0) * 365 + (+m[2] || 0) * 30 + (+m[3] || 0) * 7 + (+m[4] || 0); }
