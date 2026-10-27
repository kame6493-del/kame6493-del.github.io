// 色の計算。写真のピクセルはこの端末の中だけで扱う。
// 白い紙の平均色から、R・G・B それぞれに掛ける倍率(白の合わせ)を求める。

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(rgb) {
  return '#' + rgb.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
// 相対輝度(0..1)
export function luminance(rgb) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const [r, g, b] = rgb.map(f); return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// 地の色に合う文字の色(白か墨)
export function inkOn(hex) { return luminance(hexToRgb(hex)) > 0.42 ? '#17161C' : '#FFFFFF'; }

// 色の見分けが弱い人のための、ふつうの言葉の色名(例「くすんだ青」「明るいピンク」)。
// 色相は HSL、あざやかさと明るさは Lab で決める。見本の名前(コーラルなど)と並べて出す。
export function plainName(hex) {
  const rgb = hexToRgb(hex); const [L, a, b] = rgbToLab(rgb); const C = Math.hypot(a, b);
  const gray = L > 93 ? '白' : L > 72 ? '明るい灰色' : L > 45 ? '灰色' : L > 22 ? '暗い灰色' : '黒';
  if (C < 7) return gray;
  // 色みが少しだけある灰色(ブルーグレーなど)
  if ((L >= 35 ? C < 14 : C < 9) && L <= 80) return (b < -3 ? '青みの' : a > 5 ? '赤みの' : a < -4 ? '緑みの' : b > 3 ? '黄みの' : '') + gray;
  const [r, g, bl] = rgb.map(v => v / 255); const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), d = mx - mn;
  let h = d === 0 ? 0 : mx === r ? ((g - bl) / d) % 6 : mx === g ? (bl - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  let base = h < 12 || h >= 330 ? '赤' : h < 34 ? 'だいだい色' : h < 66 ? '黄色' : h < 100 ? '黄緑' : h < 160 ? '緑' : h < 192 ? '青緑' : h < 250 ? '青' : h < 272 ? '青紫' : h < 300 ? '紫' : '赤紫';
  if (base === '赤' && h >= 330 && h < 345) base = '赤紫';
  // 明るい赤・赤紫はピンク。くすんだだいだい色は茶色・ベージュ、くすんだ黄色は黄土色
  if ((base === '赤' || base === '赤紫') && L > 62 && C < 75) base = 'ピンク';
  else if ((base === 'だいだい色' || (base === '黄色' && h < 42)) && L >= 76 && C < 37) return (L > 85 ? '明るい' : '') + 'ベージュ';
  else if ((base === 'だいだい色' || (base === '黄色' && h < 42)) && L >= 62 && L < 76 && C < 45) return '明るい茶色';
  else if (base === 'だいだい色' && L < 66 && (C < 50 || L < 45)) base = '茶色';
  else if (base === '黄色' && L < 66 && C < 65) base = '黄土色';
  const mod = L > 88 ? (C < 22 ? 'ごく薄い' : '明るい') : L > 75 && C < 30 ? 'うすい' : L < 34 ? '暗い' : C > 62 ? 'あざやかな' : C < 26 ? 'くすんだ' : L > 70 ? '明るい' : L < 45 && base !== '茶色' ? 'こい' : '';
  return mod + base;
}

// sRGB → Lab(D65)
export function rgbToLab(rgb) {
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const [r, g, b] = rgb.map(lin);
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

// (x, y) を中心にした正方形の範囲の平均・ばらつき・白飛びの割合
export function samplePatch(data, w, h, x, y, r) {
  const x0 = clamp(Math.round(x - r), 0, w - 1), x1 = clamp(Math.round(x + r), 0, w - 1);
  const y0 = clamp(Math.round(y - r), 0, h - 1), y1 = clamp(Math.round(y + r), 0, h - 1);
  let n = 0, clip = 0; const s = [0, 0, 0], q = [0, 0, 0];
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const k = (j * w + i) * 4;
    for (let c = 0; c < 3; c++) { const v = data[k + c]; s[c] += v; q[c] += v * v; }
    if (data[k] >= 250 && data[k + 1] >= 250 && data[k + 2] >= 250) clip++;
    n++;
  }
  if (!n) return { mean: [0, 0, 0], spread: 0, clipped: 0, count: 0 };
  const mean = s.map(v => v / n);
  const spread = Math.sqrt(q.reduce((a, v, c) => a + Math.max(0, v / n - mean[c] * mean[c]), 0) / 3);
  return { mean, spread, clipped: clip / n, count: n };
}

// 白い紙の平均色 → 倍率。明るさは G を基準に保ち、R と B を G に寄せる
export function whiteGains(mean) {
  const [r, g, b] = mean.map(v => Math.max(1, v));
  const gains = [g / r, 1, g / b].map(v => clamp(v, 0.5, 2.2));
  // 色かぶりの強さ(0 = 白、1 に近いほど強い)
  const cast = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b);
  return { gains, cast };
}
export function applyGainsPixel(rgb, gains) { return rgb.map((v, c) => clamp(Math.round(v * gains[c]), 0, 255)); }
export function applyGains(data, gains) {
  const out = new Uint8ClampedArray(data.length);
  for (let k = 0; k < data.length; k += 4) {
    out[k] = data[k] * gains[0]; out[k + 1] = data[k + 1] * gains[1]; out[k + 2] = data[k + 2] * gains[2]; out[k + 3] = data[k + 3];
  }
  return out;
}

// 紙の写り方の注意。返すのは注意の鍵の配列(空なら問題なし)
export function paperWarnings(patch, wb) {
  const out = [];
  if (patch.count < 25) out.push('small');
  const bright = (patch.mean[0] + patch.mean[1] + patch.mean[2]) / 3;
  if (bright < 110) out.push('dark');
  if (patch.clipped > 0.35) out.push('clipped');
  if (patch.spread > 26) out.push('uneven');
  if (wb.cast > 0.32) out.push('cast');
  // 倍率が上限・下限に張りついた = 明かりの色が強すぎて合わせきれない(本物の写真の確かめで、電球とネオンの店内の写真がこうなった)
  if (wb.gains.some(g => g <= 0.5 || g >= 2.2)) out.push('limit');
  return out;
}

// 顔のだ円の中(頬のあたり)の肌の色。目・口・髪をよけるため、だ円の中ほどの左右2か所から取る
export function cheekColor(data, w, h, face) {
  const r = Math.max(3, Math.round(face.rx * 0.18));
  const pts = [[face.cx - face.rx * 0.45, face.cy + face.ry * 0.15], [face.cx + face.rx * 0.45, face.cy + face.ry * 0.15]];
  const ms = pts.map(([x, y]) => samplePatch(data, w, h, x, y, r).mean);
  const mean = [0, 1, 2].map(c => (ms[0][c] + ms[1][c]) / 2);
  return { rgb: mean, lab: rgbToLab(mean) };
}
