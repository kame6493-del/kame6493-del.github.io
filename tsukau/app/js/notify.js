// 毎日1語の通知。アプリ版だけ(@capacitor/local-notifications)。先の14日分を、その日の単語入りで予約し直す。
import { t } from './i18n.js';
const BASE_ID = 7100;
export const Notify = {
  plugin() { const C = window.Capacitor; return (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.LocalNotifications) || null; },
  supported() { return !!Notify.plugin(); },
  async enable() {
    const P = Notify.plugin(); if (!P) return 'web';
    try {
      let st = await P.checkPermissions();
      if (st.display !== 'granted') st = await P.requestPermissions();
      return st.display === 'granted' ? 'ok' : 'denied';
    } catch (e) { return 'denied'; }
  },
  async cancelAll() {
    const P = Notify.plugin(); if (!P) return;
    try { await P.cancel({ notifications: Array.from({ length: 14 }, (_, i) => ({ id: BASE_ID + i })) }); } catch (e) { }
  },
  // wordFor(date) は { w, r, m } を返す
  async schedule(hour, minute, wordFor) {
    const P = Notify.plugin(); if (!P) return 0;
    await Notify.cancelAll();
    const now = new Date(); const list = [];
    for (let i = 0; i < 14; i++) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, minute, 0);
      if (at <= now) continue;
      const w = wordFor(at);
      list.push({ id: BASE_ID + i, title: t('reminderTitle', { w: w.w }), body: t('reminderBody', { r: w.r, m: w.m }), schedule: { at, allowWhileIdle: true }, extra: { open: 'home' } });
    }
    try { await P.schedule({ notifications: list }); } catch (e) { return 0; }
    return list.length;
  },
};
