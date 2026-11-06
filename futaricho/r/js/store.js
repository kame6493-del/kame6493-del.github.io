// 保存。端末の中だけ(localStorage に1つの JSON)。外には送らない。
// iOS の WebView は localStorage を消すことがあるので、同じ物を Capacitor Preferences(端末の標準の保存先)にも書き、
// 起動の後に新しい方(savedAt が大きい方)を使う。読めない時は控え(futaricho.v1.broken)に移して最初から。
import { migrate, newState } from './calc.js';
export const KEY = 'futaricho.v1';

export function loadLocal(ls) {
  let raw = null;
  try { raw = ls && ls.getItem(KEY); } catch (e) { return { st: newState(), broken: false }; }
  if (!raw) return { st: newState(), broken: false };
  try { return { st: migrate(JSON.parse(raw)), broken: false }; }
  catch (e) {
    try { ls.setItem(KEY + '.broken', raw); } catch (_) { /* なし */ }
    return { st: newState(), broken: true };
  }
}

export function saveLocal(ls, st) {
  st.savedAt = Date.now();
  const s = JSON.stringify(st);
  try { ls && ls.setItem(KEY, s); } catch (e) { /* 容量いっぱい等。Preferences の方に残る */ }
  return s;
}

function prefs(cap) { return cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.Preferences; }
export async function savePrefs(cap, json) { const P = prefs(cap); if (!P) return false; try { await P.set({ key: KEY, value: json }); return true; } catch (e) { return false; } }
// Preferences の方が新しければ、その中身を返す(なければ null)
export async function newerFromPrefs(cap, st) {
  const P = prefs(cap); if (!P) return null;
  try {
    const r = await P.get({ key: KEY });
    if (!r || !r.value) return null;
    const o = migrate(JSON.parse(r.value));
    return (o.savedAt || 0) > (st.savedAt || 0) ? o : null;
  } catch (e) { return null; }
}
