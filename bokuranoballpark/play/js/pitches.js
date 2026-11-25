// 球種の定義。数値は右投手の基準。腕の側への動き(HB)は + 、グラブ側は − 。
// mv: 動かす向き(度、0 = 真上、+ = 腕の側)  rpm: 回転数  eff: 回転効率(残りはジャイロ)
// dv: ストレートからの球速差(km/h)  target: 実測の帯 (誘発変化 cm)
export const PITCH_TYPES = {
  FF: { name: 'ストレート', short: '直', color: '#e5484d', mv: 30, rpm: 2350, eff: 0.97, dv: 0,
        target: { ivb: [38, 52], hb: [12, 26], kmh: [140, 158] } },
  SI: { name: 'シンカー', short: 'シ', color: '#f08a24', mv: 64, rpm: 2150, eff: 0.92, dv: -3,
        target: { ivb: [8, 26], hb: [30, 46], kmh: [138, 153] } },
  FC: { name: 'カットボール', short: 'カ', color: '#b07cf2', mv: -24, rpm: 2400, eff: 0.4, dv: -8,
        target: { ivb: [10, 26], hb: [-14, -2], kmh: [132, 148] } },
  SL: { name: 'スライダー', short: 'ス', color: '#f5c518', mv: -80, rpm: 2500, eff: 0.5, dv: -16,
        target: { ivb: [-4, 12], hb: [-36, -16], kmh: [126, 142] } },
  SW: { name: 'スイーパー', short: 'ス', color: '#ffd84d', mv: -92, rpm: 2650, eff: 0.88, dv: -20,
        target: { ivb: [-8, 8], hb: [-58, -40], kmh: [122, 136] } },
  CU: { name: 'カーブ', short: 'カ', color: '#3fbf6a', mv: -150, rpm: 2400, eff: 0.7, dv: -30,
        target: { ivb: [-42, -20], hb: [-28, -8], kmh: [112, 128] } },
  FS: { name: 'フォーク', short: 'フ', color: '#3b8ef0', mv: 66, rpm: 1100, eff: 0.85, dv: -9,
        target: { ivb: [-2, 12], hb: [6, 24], kmh: [132, 148] } },
  CH: { name: 'チェンジアップ', short: 'チ', color: '#9b6bf2', mv: 62, rpm: 1800, eff: 0.92, dv: -17,
        target: { ivb: [6, 22], hb: [24, 42], kmh: [124, 142] } },
};
export const PITCH_ORDER = ['FF', 'SI', 'FC', 'SL', 'SW', 'CU', 'FS', 'CH'];
export const isBreaking = (t) => t === 'SL' || t === 'SW' || t === 'CU';
export const isOffspeed = (t) => t === 'FS' || t === 'CH';
