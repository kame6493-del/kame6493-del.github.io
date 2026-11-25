// 売店のメニューの板から値段を消す(11/18 夜。ストア・宣伝の写真に値段が写らないように)。浜風の球場の r8_menu_0〜7。
// 元の絵の上の色の帯(見出し)はそのまま使い、下の品名を値段なしで描き直す。品名は元の台本(Koshien2026\tools\r8\make_r8_textures.py)と同じ
const MENUS = [
  ['ビーフカレー', 'カツカレー', 'ごはん大盛り'],
  ['ソースやきそば', '目玉焼きのせ', 'おにぎり'],
  ['からあげ 5こ', 'からあげ 8こ', 'ポテト'],
  ['幕の内べんとう', 'から揚げべんとう', 'お茶'],
  ['お茶・水', 'ジュース', 'コーヒー'],
  ['いちご・レモン', 'メロン・ブルーハワイ', 'ミルクがけ'],
  ['たこやき 6こ', 'たこやき 10こ', 'ねぎ・ソース'],
  ['タオル', 'キャップ', 'メガホン'],
];
// 11/19 持ち主「値段が読める物…各球場にいるなら全部なくして」: 値段の字の所だけを、まわりの色で塗りつぶす(品名は残す)。
// 材質の名前で当てる(模型の版が上がっても、同じ名前・同じ並びの絵なら効く)。四角は絵の幅・高さを 1 とした [左, 上, 右, 下]。
// 見つけ方と確かめ方: python tools/pricecheck.py all(絵を全部取り出して OCR。docs/崩れの点検.md)
const PRICE_RECTS = [
  // 屋根の球場(ドーム)のコンコースの看板の絵の上半分(売店 8 つ、品名 2 つずつ・値段 16 か所)。下半分の通路の番号は触らない
  { mat: /^sign_concourse_detail/, aspect: [0.9, 1.1], rects: [
    [0.075, 0.080, 0.200, 0.125], [0.075, 0.185, 0.200, 0.232],
    [0.318, 0.080, 0.445, 0.125], [0.318, 0.185, 0.445, 0.232],
    [0.560, 0.080, 0.695, 0.125], [0.555, 0.185, 0.698, 0.232],
    [0.815, 0.080, 0.945, 0.128], [0.805, 0.185, 0.948, 0.232],
    [0.060, 0.333, 0.205, 0.378], [0.078, 0.437, 0.192, 0.482],
    [0.330, 0.338, 0.438, 0.380], [0.340, 0.442, 0.444, 0.485],
    [0.555, 0.343, 0.665, 0.385], [0.548, 0.437, 0.656, 0.481],
    [0.815, 0.333, 0.940, 0.375], [0.818, 0.437, 0.940, 0.482],
  ] },
];
function fixPriceRects(root, THREE) {
  let n = 0; const done = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m || !m.map || !m.map.image || m.userData.noPrice || done.has(m) || m.map.isCanvasTexture) continue;   // ゲームが描く絵(値札など、11/19 持ち主「販売物は円単位で」)は触らない。模型の絵だけ
      const e = PRICE_RECTS.find((r) => r.mat.test(m.name || '')); if (!e) continue;
      const img = m.map.image, W = img.width, H = img.height; if (!W || !H) continue;
      const asp = W / H; if (e.aspect && (asp < e.aspect[0] || asp > e.aspect[1])) continue;   // 絵の形が変わった時は当てない(試験で見つける)
      done.add(m);
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      for (const [x0, y0, x1, y1] of e.rects) {
        const X0 = Math.round(x0 * W), Y0 = Math.round(y0 * H), X1 = Math.round(x1 * W), Y1 = Math.round(y1 * H);
        // まわり(外側 4 画素の枠)の色の中央値で塗る
        const pad = 4, d = g.getImageData(Math.max(0, X0 - pad), Math.max(0, Y0 - pad), Math.min(W, X1 + pad) - Math.max(0, X0 - pad), Math.min(H, Y1 + pad) - Math.max(0, Y0 - pad));
        const R = [], G = [], B = [];
        for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) { if (x >= pad && x < d.width - pad && y >= pad && y < d.height - pad) continue; const k = (y * d.width + x) * 4; R.push(d.data[k]); G.push(d.data[k + 1]); B.push(d.data[k + 2]); }
        const med = (A) => A.sort((p, q) => p - q)[A.length >> 1] || 0;
        g.fillStyle = `rgb(${med(R)},${med(G)},${med(B)})`; g.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
      }
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = m.map.colorSpace; tex.flipY = m.map.flipY; tex.wrapS = m.map.wrapS; tex.wrapT = m.map.wrapT; tex.anisotropy = m.map.anisotropy;
      tex.offset.copy(m.map.offset); tex.repeat.copy(m.map.repeat); tex.channel = m.map.channel;
      const old = m.map; m.map = tex; if (m.emissiveMap === old) m.emissiveMap = tex; m.needsUpdate = true; m.userData.noPrice = true; n++;
    }
  });
  return n;
}
export function fixMenus(root, THREE) {
  let n = fixPriceRects(root, THREE);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material; const k = m && /^r8_menu_(\d)$/.exec(m.name || ''); if (!k || !m.map || !m.map.image || m.userData.noPrice || m.map.isCanvasTexture) return;   // ゲームが描いた絵は触らない
    const img = m.map.image, W = img.width, H = img.height, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const top = Math.round(H * 84 / 400);
    g.fillStyle = 'rgb(24,26,28)'; g.fillRect(0, top + 1, W, H - top - 1);
    g.fillStyle = 'rgb(250,248,240)'; g.textBaseline = 'top'; g.font = `${Math.round(H * 58 / 400)}px "BIZ UDGothic","Yu Gothic UI","Yu Gothic","Meiryo",sans-serif`;
    MENUS[+k[1]].forEach((t, i) => g.fillText(t, Math.round(W * 60 / 1200), Math.round(H * (130 + i * 92) / 400)));
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = m.map.colorSpace; tex.flipY = m.map.flipY; tex.wrapS = m.map.wrapS; tex.wrapT = m.map.wrapT; tex.anisotropy = m.map.anisotropy;
    tex.offset.copy(m.map.offset); tex.repeat.copy(m.map.repeat); tex.channel = m.map.channel;
    m.map = tex; if (m.emissiveMap) m.emissiveMap = tex; m.needsUpdate = true; m.userData.noPrice = true; n++;
  });
  return n;
}
