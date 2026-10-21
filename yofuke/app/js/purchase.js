// 買い切り(1回払い)。アプリ版は RevenueCat、ブラウザ版は購入できない(案内だけ)。サブスク・無料体験は使わない。
export const ENTITLEMENT = 'full';
const LS_KEY = 'yofuke.owned';
export function createPurchase({ cap = (typeof window !== 'undefined' ? window.Capacitor : null), config = (typeof window !== 'undefined' ? window.YF_CONFIG : null), ls = (typeof localStorage !== 'undefined' ? localStorage : null) } = {}) {
  const fallback = (config && config.fallbackPrice) || '¥480';
  const P = {
    owned: false, price: fallback, fromStore: false, busy: false, message: '', pkg: null, ready: false,
    onChange: () => {},
    isApp() { return !!(cap && cap.isNativePlatform && cap.isNativePlatform() && plugin()); },
    async init() {
      try { P.owned = !!(ls && ls.getItem(LS_KEY) === '1'); } catch (e) { /* なし */ }
      if (!P.isApp()) { P.ready = true; emit(); return; }
      const key = config && config.rcKeys && config.rcKeys[cap.getPlatform()];
      if (!key) { P.ready = true; emit(); return; }
      try {
        await plugin().configure({ apiKey: key });
        const off = await plugin().getOfferings();
        const list = (off && off.current && off.current.availablePackages) || [];
        P.pkg = list.find(p => p.packageType === 'LIFETIME') || null;
        const ps = P.pkg && P.pkg.product && P.pkg.product.priceString;
        if (ps) { P.price = ps; P.fromStore = true; }
        const info = await plugin().getCustomerInfo();
        setOwned(active(info));
      } catch (e) { /* 通信できない時は前回の記録のまま */ }
      P.ready = true; emit();
    },
    async buy() {
      if (!P.isApp() || P.busy) return;
      if (!P.pkg) { P.message = 'ストアの商品を読み込めませんでした。少し待ってからもう一度お試しください'; emit(); return; }
      P.busy = true; P.message = ''; emit();
      try {
        const r = await plugin().purchasePackage({ aPackage: P.pkg });
        if (active(r)) { setOwned(true); P.message = 'ひらきました。ありがとうございます'; }
      } catch (e) {
        P.message = e && e.userCancelled ? '購入をやめました' : '購入できませんでした。時間をおいてもう一度お試しください';
      }
      P.busy = false; emit();
    },
    async restore() {
      if (!P.isApp() || P.busy) return;
      P.busy = true; P.message = ''; emit();
      try {
        const r = await plugin().restorePurchases();
        if (active(r)) { setOwned(true); P.message = '購入を戻しました'; } else P.message = 'このアカウントでは、購入が見つかりませんでした';
      } catch (e) { P.message = '購入を戻せませんでした。時間をおいてもう一度お試しください'; }
      P.busy = false; emit();
    },
  };
  function plugin() { return cap && cap.Plugins && cap.Plugins.Purchases; }
  function active(r) { const ci = r && (r.customerInfo || r); return !!(ci && ci.entitlements && ci.entitlements.active && ci.entitlements.active[ENTITLEMENT]); }
  function setOwned(v) { P.owned = !!v; try { ls && (v ? ls.setItem(LS_KEY, '1') : ls.removeItem(LS_KEY)); } catch (e) { /* なし */ } }
  function emit() { try { P.onChange(P); } catch (e) { /* 画面側の失敗は無視 */ } }
  return P;
}
