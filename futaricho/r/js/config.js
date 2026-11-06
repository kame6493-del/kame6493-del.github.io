// RevenueCat の公開キー(仮)。本物は RevenueCat にアプリを作った後に入れる(RELEASE.md)。このままだと購入ボタンは押せない。
// 売る物(買い切り)は RevenueCat の Offering(current)と Play の商品で決める。ここに値段は書かない。
window.FUTARICHO_CONFIG = window.FUTARICHO_CONFIG || {
  rcKeys: { android: 'goog_REPLACE_ME', ios: 'appl_REPLACE_ME' },
  playUrl: 'https://play.google.com/store/apps/details?id=jp.futaricho.app',
  shareBase: 'https://yurustudio.github.io/futaricho/r/',
  fallbackPrices: {},
  termsUrl: 'https://yurustudio.github.io/futaricho/terms.html',
  privacyUrl: 'https://yurustudio.github.io/futaricho/privacy.html',
};
