// 画像・CSV・バックアップを端末の外へ出す。送り先は本人が共有の画面で選ぶ(こちらからは送らない)。
function nativePlugins(cap) { return cap && cap.isNativePlatform && cap.isNativePlatform() ? cap.Plugins : null; }

function download(href, filename) { const a = document.createElement('a'); a.href = href; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); }

export async function shareCanvas(canvas, { text = '', filename = 'futaricho.png', cap = window.Capacitor } = {}) {
  const dataUrl = canvas.toDataURL('image/png');
  const P = nativePlugins(cap);
  if (P && P.Filesystem && P.Share) {
    const w = await P.Filesystem.writeFile({ path: filename, data: dataUrl.split(',')[1], directory: 'CACHE' });
    await P.Share.share({ text, files: [w.uri], dialogTitle: '画像を保存・共有' });
    return 'shared';
  }
  if (navigator.canShare) {
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    }
  }
  download(dataUrl, filename); return 'downloaded';
}

// 文字のファイル(CSV・バックアップの JSON)
export async function shareText(content, { filename, mime = 'text/plain', bom = false, cap = window.Capacitor } = {}) {
  const body = (bom ? '﻿' : '') + content;
  const P = nativePlugins(cap);
  if (P && P.Filesystem && P.Share) {
    const w = await P.Filesystem.writeFile({ path: filename, data: body, directory: 'CACHE', encoding: 'utf8' });
    await P.Share.share({ files: [w.uri], dialogTitle: 'ファイルを保存・送る' });
    return 'shared';
  }
  const url = URL.createObjectURL(new Blob([body], { type: mime + ';charset=utf-8' }));
  download(url, filename); setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
