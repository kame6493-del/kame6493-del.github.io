// 結果カードの保存と共有。画像は端末の中で作り、送り先は本人が共有の画面で選ぶ。
import { TYPES } from './types.js';
export const HASHTAG = '#わすれもの診断';
export const SITE = 'https://yurustudio.github.io/yofuke/';
export function shareText(key) {
  const T = TYPES[key];
  return `よふけの預かり所で一晩、係をしてきた。わたしは「${T.name}」みたいな人らしい。\n${SITE}\n${HASHTAG} #${T.name.replace(/\s/g, '')}`;
}
export async function shareCanvas(canvas, { text = '', filename = 'card.png', mode = 'share', cap = (typeof window !== 'undefined' ? window.Capacitor : null) } = {}) {
  const dataUrl = canvas.toDataURL('image/png');
  const P = cap && cap.isNativePlatform && cap.isNativePlatform() ? cap.Plugins : null;
  if (P && P.Filesystem && P.Share) {
    const w = await P.Filesystem.writeFile({ path: filename, data: dataUrl.split(',')[1], directory: 'CACHE' });
    await P.Share.share({ text, files: [w.uri], dialogTitle: mode === 'save' ? '画像を保存' : '結果を共有' });
    return 'shared';
  }
  if (mode === 'share' && typeof navigator !== 'undefined' && navigator.canShare) {
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    }
  }
  const a = document.createElement('a'); a.href = dataUrl; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  return 'downloaded';
}
