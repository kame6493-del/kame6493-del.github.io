// フタリチョウ 完全版。アプリ版は RevenueCat(Capacitor のプラグイン)、ブラウザ版は購入できない(案内だけ)。
// 何を売るかは RevenueCat の Offering(current)で決める。入っているパッケージを全部出す(買い切りを先頭に)。
// 年額や体験を足す・外すのは Offering と Play の商品の側だけで済み、アプリを作り直さなくてよい。
// 値段はストアの商品から読む(priceString)。読めない時だけ config の fallbackPrices を出し、購入ボタンは押せなくする。
export const ENTITLEMENT = 'futaricho_full';
const LS_KEY = 'futaricho.full';
const ORDER = { LIFETIME: 0, ANNUAL: 1, SIX_MONTH: 2, THREE_MONTH: 3, TWO_MONTH: 4, MONTHLY: 5, WEEKLY: 6, CUSTOM: 7, UNKNOWN: 8 };
const LABEL = { LIFETIME: '買い切り', ANNUAL: '1年ごと', SIX_MONTH: '6か月ごと', THREE_MONTH: '3か月ごと', MONTHLY: '1か月ごと', WEEKLY: '1週ごと' };

export function createPurchase({ cap = (typeof window !== 'undefined' ? window.Capacitor : null), config = (typeof window !== 'undefined' ? window.FUTARICHO_CONFIG : null), ls = (typeof localStorage !== 'undefined' ? localStorage : null), timeoutMs = 8000 } = {}) {
  const P = {
    owned: false, busy: false, message: '', ready: false,
    packages: [],
    onChange: () => {},
    isApp() { return !!(cap && cap.isNativePlatform && cap.isNativePlatform() && plugin()); },
    fromStore() { return P.packages.length > 0; },
    // 画面に並べる選択肢。ストアから読めない時は予備(押せない)
    plans() {
      if (P.packages.length) return P.packages.map(p => planOf(p));
      const fp = (config && config.fallbackPrices) || {};
      return Object.keys(fp).map(k => ({ id: k, type: k === 'lifetime' ? 'LIFETIME' : 'ANNUAL', label: k === 'lifetime' ? '買い切り' : '1年ごと', price: fp[k], intro: '', sub: k !== 'lifetime', offline: true }));
    },
    async init() {
      try { P.owned = !!(ls && ls.getItem(LS_KEY)); } catch (e) { /* なし */ }
      if (!P.isApp()) { P.ready = true; emit(); return; }
      const key = config && config.rcKeys && config.rcKeys[cap.getPlatform()];
      if (!key || /REPLACE/.test(key)) { P.ready = true; emit(); return; }
      try {
        // 1.0.4: ストアや通信が止まっても画面は待たせない。8 秒で打ち切り、前回の記録のまま進む
        await withTimeout(P._load(key), timeoutMs);
      } catch (e) { /* 通信できない・時間切れの時は前回の記録のまま */ }
      P.ready = true; emit();
    },
    async _load(key) {
      {
        await plugin().configure({ apiKey: key });
        const off = await plugin().getOfferings();
        const list = ((off && off.current && off.current.availablePackages) || []).slice();
        list.sort((a, b) => (ORDER[a.packageType] ?? 9) - (ORDER[b.packageType] ?? 9));
        P.packages = list;
        const info = await plugin().getCustomerInfo();
        setOwned(active(info));
      }
    },
    async buy(id) {
      if (!P.isApp() || P.busy) return false;
      const pkg = P.packages.find(p => p.identifier === id);
      if (!pkg) { P.message = 'ストアの商品を読み込めませんでした。少し待ってから、もう一度お試しください'; emit(); return false; }
      P.busy = true; P.message = ''; emit();
      let ok = false;
      try {
        const r = await plugin().purchasePackage({ aPackage: pkg });
        if (active(r)) { setOwned(true); ok = true; P.message = '完全版になりました。ありがとうございます'; }
      } catch (e) {
        P.message = e && e.userCancelled ? '購入をやめました' : '購入できませんでした。時間をおいて、もう一度お試しください';
      }
      P.busy = false; emit(); return ok;
    },
    async restore() {
      if (!P.isApp() || P.busy) return false;
      P.busy = true; P.message = ''; emit();
      let ok = false;
      try {
        const r = await plugin().restorePurchases();
        if (active(r)) { setOwned(true); ok = true; P.message = '購入を戻しました'; } else P.message = 'この端末のアカウントでは、購入が見つかりませんでした';
      } catch (e) { P.message = '購入を戻せませんでした。時間をおいて、もう一度お試しください'; }
      P.busy = false; emit(); return ok;
    },
  };
  function planOf(p) {
    const pr = p.product || {};
    const sub = p.packageType !== 'LIFETIME';
    // 体験はストアの商品に付いている時だけ出す(introPrice が 0 円の時)
    const ip = pr.introPrice;
    const intro = ip && ip.price === 0 && ip.periodNumberOfUnits ? `最初の${ip.periodNumberOfUnits}${unitJa(ip.periodUnit)}はお試し` : '';
    return { id: p.identifier, type: p.packageType, label: LABEL[p.packageType] || (pr.title || '完全版'), price: pr.priceString || '', intro, sub, offline: false };
  }
  function unitJa(u) { return { DAY: '日', WEEK: '週間', MONTH: 'か月', YEAR: '年' }[u] || ''; }
  function withTimeout(pr, ms) { return Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }
  function plugin() { return cap && cap.Plugins && cap.Plugins.Purchases; }
  function active(r) { const ci = r && (r.customerInfo || r); return !!(ci && ci.entitlements && ci.entitlements.active && ci.entitlements.active[ENTITLEMENT]); }
  function setOwned(v) { P.owned = !!v; try { ls && (v ? ls.setItem(LS_KEY, '1') : ls.removeItem(LS_KEY)); } catch (e) { /* なし */ } }
  function emit() { try { P.onChange(P); } catch (e) { /* 画面側の失敗は無視 */ } }
  return P;
}
