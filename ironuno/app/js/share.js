// 結果カードの保存と共有。画像は端末の中で作り、送り先は本人が共有の画面で選ぶ。
import { SEASONS } from './seasons.js';
import { friendLink } from './friends.js';

export function shareText(result) {
  const T = SEASONS[result.top], T2 = SEASONS[result.second];
  // リンクには季節の短い記号だけが入る(開いた人は、自分の結果と並べて見られる)
  return `顔のまわりに布の色を当てて見比べたら、${T.name}でした。2番目は${T2.name}。\nあなたの似合う色も → ${friendLink(result)}\n#似合う色 #${T.name} #パーソナルカラー`;
}

// mode: 'share' | 'save'。戻り値: 'shared' | 'downloaded'
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
