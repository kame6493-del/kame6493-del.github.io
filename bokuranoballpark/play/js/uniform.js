// ユニフォーム(11/18): 架空の高校 4 校の色・胸の文字・帽子の記章・背番号・パイピング・土の汚れ。
// 体の形は変えず、材質(シェーダー)と、体に沿わせた薄い板の絵だけで作る。引き継ぎは docs/ユニフォームの引き継ぎ.md。
// 絵(胸の文字・記章・数字)は ChatGPT で作った白黒の絵(白 = 形)を models/players_v3/uniform/ に置き、ここで学校の色に塗る。
import * as THREE from 'three';
import { KIT } from './figures.js';
import { STADIUMS, stadiumInfo } from './stadiums.js';

// 学校(名前も記章も架空。検索で同じ名前の高校が出ない事を確かめた)
// letter: 胸の文字の色 / outline: 文字の縁(null で無し)/ pipe: パイピング / pipeK: [袖口, 前立て, 襟, ズボンの横の線]
export const SCHOOLS = {
  soha: { name: '蒼波', jersey: 0xeeeff1, pants: 0xeeeff1, cap: 0x1c2b4a, sock: 0x1c2b4a, under: 0x1c2b4a, belt: 0x1c2b4a,
    letter: 0x1c2b4a, outline: null, pipe: 0x1c2b4a, pipeK: [1, 1, 1, 0], emblem: 0xf2f2ee, num: 0x1c2b4a, numOutline: null },
  takanomori: { name: '鷹ノ森', jersey: 0x8f939a, pants: 0x8f939a, cap: 0x5a1a24, sock: 0x5a1a24, under: 0x5a1a24, belt: 0x16161a,
    letter: 0x641b28, outline: 0xf0eee8, pipe: 0x5a1a24, pipeK: [1, 0, 1, 1], emblem: 0xf0eee8, num: 0x641b28, numOutline: 0xf0eee8 },
  hinoura: { name: '緋ノ浦', jersey: 0xf1f1ef, pants: 0xf1f1ef, cap: 0x1b2440, sock: 0x1b2440, under: 0x1b2440, belt: 0x1b2440,
    letter: 0xb51e2a, outline: 0x1b2440, pipe: 0xb51e2a, pipeK: [1, 1, 1, 0], emblem: 0xc8202c, num: 0xb51e2a, numOutline: 0x1b2440 },
  kaedehara: { name: '楓原', jersey: 0xeef0ee, pants: 0xeef0ee, cap: 0x1d4a33, sock: 0x1d4a33, under: 0x1d4a33, belt: 0x16161a,
    letter: 0x1d4a33, outline: null, pipe: 0x1d4a33, pipeK: [1, 0, 1, 1], emblem: 0xf2f2ee, num: 0x1d4a33, numOutline: null },
};
const Q = new URLSearchParams(location.search);
const OFF = Q.has('nouni');
// 11/26 記憶(iOS で「重くて落ちる」): 胸の文字・帽子の記章の絵は、学校(key)ごとに 1 枚を全員で使う。
// 前は人ごとに 512x180 と 128x128 の絵を作っていて、ボールパークで過ごす(341 人)で canvas が 184MB あった。?uniown=1 で前の形(人ごと)
const UNI_SHARE = !Q.has('uniown');
const SHARED_UNI = new Map();
let BLANK_TEX = null;
function blankTex() { if (!BLANK_TEX) { const c = document.createElement('canvas'); c.width = c.height = 4; BLANK_TEX = new THREE.CanvasTexture(c); BLANK_TEX.colorSpace = THREE.SRGBColorSpace; } return BLANK_TEX; }
function sharedUni(kind, k, W, H, aniso, draw) {
  const id = kind + '|' + k; let e = SHARED_UNI.get(id);
  if (!e) { const c = document.createElement('canvas'); c.width = W; c.height = H; draw(c); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (aniso) t.anisotropy = aniso; e = { c, tex: t }; SHARED_UNI.set(id, e); }
  return e;
}   // ?nouni=1 で前の無地のユニフォーム(比べる用)
const DRESSED = new Set();

// 11/21 チームカラー(持ち主「プロ野球ならそのチーム本拠地の色のチームが後攻に」「高校野球なら完全ランダムで結構多い種類のチームカラーで」)
// 高校野球(応援の型 hs): 試合ごとに架空の高校 40 校から先攻・後攻を選ぶ(似た色同士にしない)。
// プロ風(pro): 後攻 = その球場の元の本拠地の球団の色(ホーム)、先攻 = ほかの球団の色のビジター。チーム名・胸の字は全部架空(実在の球団名・ロゴは出さない)。
// chest: [書き方, 文字] 書き方 = kanji(明朝の太字)・block(太いローマ字)・script(斜めの筆記体ふう)。art があれば絵(chest_<art>.png)を使う
// crowd: [応援席の主の色, 2 番目の色](crowd.js がアルプス・外野の応援団の服・メガホン・タオル・旗・風船に使う)。無ければ帽子と字の色から
// fam: 似た色の印(同じ印を持つ球団同士は対戦させない) / stripe: 縦じまの色
const W = 0xf1f1ef;
const hs = (name, chest, jersey, cap, letter, outline, pipe, pipeK, emblem, x = {}) => ({ name, chest, jersey, pants: x.pants ?? jersey, cap, sock: x.sock ?? cap, under: x.under ?? cap,
  belt: x.belt ?? cap, letter, outline, pipe, pipeK, emblem, num: x.num ?? letter, numOutline: x.numOutline ?? outline, crowd: x.crowd, stripe: null });
const HS = {
  asagi: hs('浅葱ヶ崎', ['kanji', '浅葱ヶ崎'], W, 0x0f6f7a, 0x0f7f8a, null, 0x0f6f7a, [1, 1, 1, 0], 0xf2f2ee),
  shion: hs('紫苑館', ['script', 'Shion'], W, 0x3d1f6b, 0x4b2585, 0xc9a54a, 0x4b2585, [1, 1, 1, 0], 0xc9a54a),
  kohaku: hs('琥珀橋', ['block', 'KOHAKU'], 0x8f939a, 0x17181b, 0xd8701c, 0x17181b, 0xd8701c, [1, 0, 1, 1], 0xd8701c),
  aotake: hs('青竹ノ里', ['kanji', '青竹'], W, 0x1d5e2e, 0x23733a, 0xe8c547, 0x23733a, [1, 0, 1, 1], 0xe8c547),
  akane: hs('茜ヶ浜', ['script', 'Akane'], W, 0x9c1430, 0xa8183a, null, 0x9c1430, [1, 1, 1, 0], 0xf2f2ee),
  gunjo: hs('群青坂', ['block', 'GUNJO'], W, 0x1f3fae, 0x2346be, null, 0x2346be, [1, 1, 1, 1], 0xf2f2ee),
  yamabuki: hs('山吹野', ['kanji', '山吹'], W, 0x16233f, 0xf0b419, 0x16233f, 0xf0b419, [1, 1, 1, 0], 0xf0b419),
  tetsujo: hs('鉄城', ['kanji', '鉄城'], 0x8c9097, 0x1b2440, 0x1b2440, 0xf0eee8, 0x1b2440, [1, 0, 1, 1], 0xf0eee8),
  kokuyo: hs('黒耀ヶ丘', ['block', 'KOKUYO'], W, 0x111214, 0x111214, null, 0x111214, [1, 1, 1, 1], 0xf2f2ee, { crowd: [0x151517, 0xf4f4f0] }),
  nadeshiko: hs('撫子原', ['script', 'Nadeshiko'], W, 0x8e1f4f, 0xb02c64, null, 0xb02c64, [1, 1, 1, 0], 0xf2f2ee),
  moegi: hs('萌黄台', ['kanji', '萌黄'], W, 0x16233f, 0x7fb21c, 0x16233f, 0x7fb21c, [1, 0, 1, 1], 0x9ccc2a),
  midori: hs('碧ヶ淵', ['block', 'MIDORI'], W, 0x0b4d4a, 0x0b5a56, null, 0x0b4d4a, [1, 1, 1, 0], 0xf2f2ee),
  amawashi: hs('天鷲', ['script', 'Amawashi'], 0x9fc6e6, 0x14244a, 0x14244a, 0xf4f4f0, 0x14244a, [1, 1, 1, 1], 0xf4f4f0, { crowd: [0x5aa6e0, 0x14244a] }),
  hoshigamine: hs('星ヶ嶺', ['block', 'HOSHIGAMINE'], 0x92969d, 0x1d3a9a, 0x1d3a9a, 0xc81e2a, 0xc81e2a, [1, 0, 1, 1], 0xf2f2ee),
  shakudo: hs('赤銅', ['kanji', '赤銅'], W, 0x17181b, 0xb5541c, 0x17181b, 0xb5541c, [1, 1, 1, 0], 0xd06424),
  ruri: hs('瑠璃ノ島', ['script', 'Ruri'], W, 0x1a3c8c, 0x1f49a6, 0xf4f4f0, 0x1a3c8c, [1, 1, 1, 0], 0xf4f4f0),
  kurumi: hs('胡桃ヶ谷', ['kanji', '胡桃'], W, 0x4a2a17, 0x5a331c, null, 0x4a2a17, [1, 0, 1, 1], 0xe9d9b8, { crowd: [0x6b3f22, 0xe9d9b8] }),
  kinga: hs('金鴉', ['block', 'KINGA'], W, 0x111214, 0xc9a23a, 0x111214, 0xc9a23a, [1, 1, 1, 1], 0xc9a23a, { crowd: [0xd2a93a, 0x151517] }),
  aizome: hs('藍染川', ['kanji', '藍染'], 0xc9ccd1, 0x1b2a5c, 0x1b2a5c, null, 0x1b2a5c, [1, 1, 1, 0], 0xf2f2ee),
  kagero: hs('陽炎坂', ['script', 'Kagero'], W, 0x16233f, 0xd8222c, 0xd9b245, 0xd8222c, [1, 1, 1, 0], 0xd8222c),
  kokenomori: hs('苔ノ森', ['kanji', '苔ノ森'], 0x8f939a, 0x1f4a2a, 0x1f4a2a, 0xf0eee8, 0x1f4a2a, [1, 0, 1, 1], 0xf0eee8),
  kaien: hs('海燕', ['block', 'KAIEN'], 0xb9d4ea, 0x0f2347, 0x0f2347, null, 0x0f2347, [1, 1, 1, 1], 0xf4f4f0, { crowd: [0x7fb8e6, 0x0f2347] }),
  hakko: hs('白虹', ['script', 'Hakko'], W, 0x16233f, 0x3d93d6, 0x16233f, 0x3d93d6, [1, 1, 1, 0], 0x7fc0ee),
  aoigase: hs('葵ヶ瀬', ['kanji', '葵'], W, 0x13214a, 0x13214a, 0xd1ad4a, 0xd1ad4a, [1, 1, 1, 0], 0xd1ad4a),
  koganeno: hs('黄金野', ['block', 'KOGANE'], 0x8f939a, 0x111214, 0x111214, 0xf2c21a, 0xf2c21a, [1, 0, 1, 1], 0xf2c21a, { crowd: [0xf2c21a, 0x151517] }),
  kinshu: hs('錦秋', ['kanji', '錦秋'], W, 0x16233f, 0xe8731c, 0x16233f, 0xe8731c, [1, 1, 1, 0], 0xe8731c),
  muhyo: hs('霧氷館', ['script', 'Muhyo'], W, 0x16233f, 0x2a83c4, 0x16233f, 0x2a83c4, [1, 1, 1, 1], 0xf2f2ee),
  akarinomisaki: hs('灯ノ岬', ['block', 'AKARI'], 0x9a9ea4, 0x16233f, 0xc81e2a, 0x16233f, 0xc81e2a, [1, 0, 1, 1], 0xc81e2a),
  budo: hs('葡萄ヶ丘', ['kanji', '葡萄'], W, 0x5a1a3c, 0x6b2048, null, 0x5a1a3c, [1, 1, 1, 0], 0xf2f2ee),
  narukami: hs('鳴神', ['kanji', '鳴神'], 0x1a2340, 0x1a2340, 0xf4f4f0, 0xd2a93a, 0xd2a93a, [1, 1, 1, 1], 0xd2a93a, { pants: 0xe6e6e2, crowd: [0x22305a, 0xd2a93a] }),
  hisui: hs('翡翠浜', ['script', 'Hisui'], W, 0x0f6a4a, 0x14855c, null, 0x0f6a4a, [1, 1, 1, 0], 0xf2f2ee),
  sakunomori: hs('朔ノ杜', ['kanji', '朔ノ杜'], W, 0x111214, 0x111214, 0xc9a23a, 0xc9a23a, [1, 1, 1, 0], 0xc9a23a),
  koka: hs('紅霞', ['block', 'KOKA'], 0x92969d, 0x7a1424, 0xa01a2e, 0xf0eee8, 0xa01a2e, [1, 0, 1, 1], 0xf0eee8),
  sorasumi: hs('空澄', ['script', 'Sorasumi'], W, 0x2b7fc4, 0x2b7fc4, null, 0x2b7fc4, [1, 1, 1, 1], 0xf2f2ee),
  somanokawa: hs('杣ノ川', ['kanji', '杣ノ川'], W, 0x5a1a24, 0x641b28, null, 0x5a1a24, [1, 0, 1, 1], 0xf2f2ee),
  daidai: hs('橙ヶ原', ['block', 'DAIDAI'], W, 0x111214, 0xec6a14, 0x111214, 0xec6a14, [1, 1, 1, 1], 0xec6a14),
};
// 前からの 4 校は ChatGPT の絵の胸の文字
Object.assign(SCHOOLS.soha, { art: 'soha', crowd: [0x1c2b4a, 0xf4f4f0] });
for (const k of ['takanomori', 'hinoura', 'kaedehara']) SCHOOLS[k].art = k;
Object.assign(SCHOOLS, HS);
export const HS_KEYS = Object.keys(SCHOOLS);
// プロ風: 球場 → 元の本拠地の球団の色(h = ホーム、v = ビジター)。名前は架空
const team = (o) => ({ pants: o.jersey, sock: o.cap, under: o.cap, belt: o.cap, outline: null, pipe: o.cap, pipeK: [1, 1, 1, 0], emblem: 0xf4f4f0, stripe: null, ...o, num: o.num ?? o.letter, numOutline: o.numOutline ?? o.outline ?? null });
const pro = (name, fam, crowd, h, v) => ({ name, fam, crowd, h: team(h), v: team(v) });
const BK = 0x121214, YL = 0xf5c400, OR = 0xf26a1b, WH = 0xf4f4f2;
const PRO = {
  // 甲子園: 白に黒の縦じま・黒の字、黒の帽子に黄色の記章。応援席は黄色と黒
  koshien: pro('Lynx', ['yellow', 'stripe'], [YL, BK],
    { chest: ['script', 'Lynx'], jersey: WH, stripe: BK, cap: BK, letter: BK, pipeK: [0, 0, 0, 0], emblem: YL },
    { chest: ['script', 'Lynx'], jersey: 0xa3a5a9, cap: BK, letter: BK, outline: YL, pipe: YL, pipeK: [1, 0, 1, 1], emblem: YL }),
  // 東京ドーム: 白に橙の字(黒の縁)・橙のパイピング、黒の帽子に橙の記章。応援席は橙
  dome: pro('Comets', ['orange'], [OR, BK],
    { chest: ['block', 'COMETS'], jersey: WH, cap: BK, letter: OR, outline: BK, pipe: OR, pipeK: [1, 1, 1, 1], emblem: OR },
    { chest: ['block', 'COMETS'], jersey: 0x8e9298, cap: BK, letter: BK, outline: OR, pipe: OR, pipeK: [1, 1, 1, 1], emblem: OR }),
  // 神宮: 白に紺の字・赤の縁、緑のパイピング、紺の帽子。応援席は緑と紺
  park: pro('Larks', ['navy', 'green'], [0x1f8a46, 0x13235a],
    { chest: ['script', 'Larks'], jersey: WH, cap: 0x13235a, letter: 0x13235a, outline: 0xc8102e, pipe: 0x1f8a46, pipeK: [1, 1, 1, 1] },
    { chest: ['script', 'Larks'], jersey: 0x9099a6, cap: 0x13235a, letter: 0x13235a, outline: 0xc8102e, pipe: 0x1f8a46, pipeK: [1, 0, 1, 1] }),
  // バンテリン: 白に青の字・青の帽子とストッキング。応援席は青
  ring: pro('Wyverns', ['blue'], [0x0b55b0, 0xf4f4f0],
    { chest: ['script', 'Wyverns'], jersey: WH, cap: 0x08408e, letter: 0x0b4ea2, pipe: 0x0b4ea2, pipeK: [1, 1, 1, 0] },
    { chest: ['block', 'WYVERNS'], jersey: 0xa9b8ca, cap: 0x08408e, letter: 0x08408e, outline: 0xf4f4f0, pipe: 0x08408e, pipeK: [1, 0, 1, 1] }),
  // マツダ: 白に赤の字(紺の縁)・赤の帽子とストッキング。応援席は赤
  railside: pro('Rapids', ['red'], [0xd4001f, 0xf4f4f0],
    { chest: ['script', 'Rapids'], jersey: WH, cap: 0xc8001d, letter: 0xd2001f, outline: 0x1a2541, pipe: 0xd2001f, pipeK: [1, 1, 1, 1] },
    { chest: ['script', 'Rapids'], jersey: 0x9a9ea4, cap: 0xc8001d, letter: 0xd2001f, outline: 0x1a2541, pipe: 0xd2001f, pipeK: [1, 0, 1, 1] }),
  // 横浜: 白に明るい青の字・青の帽子。応援席は明るい青
  bowl: pro('Harbors', ['blue'], [0x1166cc, 0xf4f4f0],
    { chest: ['block', 'HARBORS'], jersey: WH, cap: 0x0b3c8c, letter: 0x0d5fb8, pipe: 0x0d5fb8, pipeK: [1, 1, 1, 1] },
    { chest: ['block', 'HARBORS'], jersey: 0x0d4a9e, pants: 0xb5bac2, cap: 0x0b3c8c, letter: 0xf4f4f0, pipe: 0xf4f4f0, pipeK: [1, 0, 1, 0] }),
  // 楽天モバイル: 白にえんじの字・金の縁、えんじの帽子。応援席はえんじ
  north: pro('Griffins', ['red', 'gold'], [0x8e0c28, 0xc9a24a],
    { chest: ['block', 'GRIFFINS'], jersey: WH, cap: 0x7a0a22, letter: 0x8c0b26, outline: 0xc9a24a, pipe: 0x8c0b26, pipeK: [1, 1, 1, 1], emblem: 0xc9a24a },
    { chest: ['block', 'GRIFFINS'], jersey: 0x93979e, cap: 0x7a0a22, letter: 0x8c0b26, outline: 0xc9a24a, pipe: 0x8c0b26, pipeK: [1, 0, 1, 1], emblem: 0xc9a24a }),
  // エスコン: 白に青の字・金の縁、紺の帽子。応援席は青
  roof: pro('Pioneers', ['blue', 'gold'], [0x1b5fb8, 0xb5995a],
    { chest: ['block', 'PIONEERS'], jersey: WH, cap: 0x0f2346, letter: 0x0b3f8f, outline: 0xb5995a, pipe: 0x0b3f8f, pipeK: [1, 1, 1, 0], emblem: 0xb5995a },
    { chest: ['block', 'PIONEERS'], jersey: 0x8a9099, cap: 0x0f2346, letter: 0x0f2346, outline: 0xb5995a, pipe: 0xb5995a, pipeK: [1, 0, 1, 1], emblem: 0xb5995a }),
  // PayPay: 白に黒の字・黄色の縁と線、黒の帽子に黄色。応援席は黄色と黒
  bay: pro('Ospreys', ['yellow', 'black'], [YL, BK],
    { chest: ['block', 'OSPREYS'], jersey: WH, cap: BK, letter: BK, outline: YL, pipe: YL, pipeK: [1, 1, 1, 1], emblem: YL },
    { chest: ['block', 'OSPREYS'], jersey: 0x1a1a1c, pants: 0x9b9ea3, cap: BK, letter: YL, pipe: YL, pipeK: [1, 1, 1, 1], emblem: YL }),
  // ZOZO: 白に黒の縦じま・黒の字、黒の帽子。応援席は黒と白
  shore: pro('Breakers', ['black', 'stripe'], [BK, 0xf4f4f0],
    { chest: ['script', 'Breakers'], jersey: WH, stripe: BK, cap: BK, letter: BK, pipeK: [0, 0, 0, 0] },
    { chest: ['script', 'Breakers'], jersey: 0x8f9196, cap: BK, letter: BK, outline: 0xf4f4f0, pipe: BK, pipeK: [1, 0, 1, 1] }),
  // ベルーナ: 白に青の字、青の帽子。応援席は青
  grove: pro('Pumas', ['blue'], [0x2559b6, 0xf4f4f0],
    { chest: ['script', 'Pumas'], jersey: WH, cap: 0x16357f, letter: 0x16357f, pipe: 0x16357f, pipeK: [1, 1, 1, 1] },
    { chest: ['script', 'Pumas'], jersey: 0x9fb4cf, cap: 0x16357f, letter: 0x16357f, outline: 0xc8102e, pipe: 0x16357f, pipeK: [1, 0, 1, 1] }),
  // 京セラ: 白に紺の字・金の縁、紺の帽子に金。応援席は紺と金
  canal: pro('Mustangs', ['navy', 'gold'], [0x18295a, 0xc9a24a],
    { chest: ['block', 'MUSTANGS'], jersey: WH, cap: 0x0e1f45, letter: 0x0e1f45, outline: 0xc9a24a, pipe: 0xc9a24a, pipeK: [1, 1, 1, 1], emblem: 0xc9a24a },
    { chest: ['block', 'MUSTANGS'], jersey: 0x152649, pants: 0x9ea2a8, cap: 0x0e1f45, letter: 0xc9a24a, pipe: 0xc9a24a, pipeK: [1, 1, 1, 1], emblem: 0xc9a24a }),
};
for (const [id, t] of Object.entries(PRO)) for (const hv of ['h', 'v']) SCHOOLS[`pro_${id}_${hv}`] = { ...t[hv], name: t.name, crowd: t.crowd, fam: t.fam, pro: id };
export const PRO_IDS = Object.keys(PRO);
const pickS = { home: 'soha', away: 'takanomori' };
// 応援の型と球場(crowd.js・ui.js と同じ決め方: ?cheer > 設定 r4walk.cheer > 球場の屋根)
const STADIUM_ID = (() => { const ok = (v) => (STADIUMS.some((x) => x.id === v) ? v : 'koshien'); const q = Q.get('stadium'); if (q) return ok(q); try { return ok(JSON.parse(localStorage.getItem('r4walk.sel') || '{}').stadium); } catch (e) { return 'koshien'; } })();
let teamStyle = (() => {
  const q = Q.get('cheer'); if (q === 'pro' || q === 'hs') return q;
  try { const s = JSON.parse(localStorage.getItem('r4walk.cheer') || 'null'); if (s === 'pro' || s === 'hs') return s; } catch (e) { /* なし */ }
  return stadiumInfo(STADIUM_ID).indoor ? 'pro' : 'hs';
})();
// 色の近さ(目の感じ方に寄せて緑を重く。0〜約 380)
const cd = (a, b) => { const r = ((a >> 16) & 255) - ((b >> 16) & 255), g = ((a >> 8) & 255) - ((b >> 8) & 255), bl = (a & 255) - (b & 255); return Math.sqrt(0.3 * r * r + 0.59 * g * g + 0.11 * bl * bl) * 1.5; };
const sat = (c) => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; return Math.max(r, g, b) - Math.min(r, g, b); };
// 応援席の色(crowd が無い学校は、帽子と字のうち鮮やかな方 + もう一方か白)
export function crowdOf(S) {
  if (S.crowd) return S.crowd;
  const m = sat(S.letter) >= sat(S.cap) ? S.letter : S.cap, o = m === S.letter ? S.cap : S.letter;
  return [m, cd(m, o) < 60 ? 0xf4f4f0 : o];
}
// 2 チームが見分けにくいか(同じ色の印、字の色が近い、帽子と地が両方近い、応援席の色が近い)
export function similar(a, b) {
  const A = SCHOOLS[a], B = SCHOOLS[b];
  if (A.fam && B.fam) return A.fam.some((f) => B.fam.includes(f));
  if (cd(A.letter, B.letter) < 75) return true;
  if (cd(A.cap, B.cap) < 50 && cd(A.jersey, B.jersey) < 45) return true;
  if (cd(crowdOf(A)[0], crowdOf(B)[0]) < 70) return true;
  return false;
}
const rand = (n) => Math.floor(Math.random() * n);
function pickTeams() {
  const q = Q.get('teams');   // 撮影用 ?teams=後攻,先攻(SCHOOLS の名前)
  if (q) { const [h, a] = q.split(','); if (SCHOOLS[h] && SCHOOLS[a]) { pickS.home = h; pickS.away = a; return; } }
  if (teamStyle === 'pro') {
    const id = PRO[STADIUM_ID] ? STADIUM_ID : 'koshien', qa = Q.get('away');
    const others = PRO_IDS.filter((k) => k !== id && !similar(`pro_${id}_h`, `pro_${k}_h`));
    pickS.home = `pro_${id}_h`; pickS.away = `pro_${qa && PRO[qa] ? qa : others[rand(others.length)]}_v`;
  } else {
    const home = HS_KEYS[rand(HS_KEYS.length)], ok = HS_KEYS.filter((k) => k !== home && !similar(home, k));
    pickS.home = home; pickS.away = ok[rand(ok.length)];
  }
}
pickTeams();
const LISTEN = new Set();
// 応援席など、チームの色を合わせたい物を登録(crowd.js)。チームが替わると呼ぶ
export function onTeams(cb) { LISTEN.add(cb); }
const notify = () => { for (const cb of LISTEN) try { cb(); } catch (e) { console.warn(e); } };
const redress = () => { for (const a of DRESSED) a.dress(); };
// 応援の型が替わった時(crowd.js の _makeData から)。quiet = 知らせない(呼んだ側が自分で塗り直す)
export function setTeamStyle(style, quiet) {
  if ((style !== 'pro' && style !== 'hs') || style === teamStyle) return false;
  teamStyle = style; pickTeams(); redress();
  if (!quiet) notify();
  return true;
}
let matchN = 0;
// 新しい試合(defense.js の試合の始め)。初めの試合は読み込みの時に選んだ組のまま、2 試合目から選び直す
export function newMatch() {
  if (matchN++ === 0) return;
  pickTeams(); redress(); notify();
}
export function teamsNow() { return { style: teamStyle, stadium: STADIUM_ID, home: pickS.home, away: pickS.away, homeName: SCHOOLS[pickS.home].name, awayName: SCHOOLS[pickS.away].name, homeCrowd: crowdOf(SCHOOLS[pickS.home]), awayCrowd: crowdOf(SCHOOLS[pickS.away]) }; }
// 守る側・攻める側の学校を替える(ゲームの作業者用。例 setSchools('hinoura', 'kaedehara'))
export function setSchools(home, away) {
  if (SCHOOLS[home]) pickS.home = home; if (SCHOOLS[away]) pickS.away = away;
  redress(); notify();
}
export function schoolOf(kit) {
  const side = kit && kit.side === 'away' ? 'away' : kit === KIT.away ? 'away' : 'home';
  return { side, key: pickS[side], S: SCHOOLS[pickS[side]] };
}
// 体の色: 学校の色。帽子だけ別の色(自分の印のオレンジ)はそのまま
export function uniformKit(kit) {
  // 11/26 着せ替え(js/cosmetics.js): 自分の選手だけ、選んだユニフォームの色にする(帽子は学校の帽子・自分の印のまま)
  if (kit && kit.ownUni) { const { ownUni, ...k0 } = kit; const r = uniformKit(k0); const { stripe, pipe, ...cols } = ownUni; return { ...r, ...cols }; }
  if (OFF || !kit || kit.plain || !kit.side) return kit;   // 学校の印(side)の無い服(審判など)はそのまま
  const { side, S } = schoolOf(kit);
  const base = KIT[side] || KIT.home;
  return { ...kit, jersey: S.jersey, pants: S.pants, sock: S.sock, under: S.under, belt: S.belt, cap: kit.cap !== base.cap ? kit.cap : S.cap };
}

// ---------------------------------------------------------------- 絵(白黒の形 → 学校の色)
const DIR = 'models/players_v3/uniform/';
const imgs = {};
function loadImg(name) {
  if (imgs[name]) return imgs[name];
  const e = { img: new Image(), ok: false, crops: null };
  e.img.onload = () => { e.ok = true; for (const a of DRESSED) a.dress(); };
  e.img.onerror = () => { e.fail = true; };
  e.img.src = DIR + name;
  imgs[name] = e;
  return e;
}
// 白い所を形として、透明の地の 1 枚にする(地は黒)。外側の余白は切る
const maskCache = new Map();
function maskOf(name) {
  if (maskCache.has(name)) return maskCache.get(name);
  const e = loadImg(name); if (!e.ok) return null;
  const w = e.img.naturalWidth, h = e.img.naturalHeight;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(e.img, 0, 0);
  const d = g.getImageData(0, 0, w, h); const p = d.data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let i = 0, k = 0; i < p.length; i += 4, k++) {
    const l = Math.max(p[i], p[i + 1], p[i + 2]);
    const a = Math.max(0, Math.min(255, (l - 60) * 255 / 140));
    p[i] = p[i + 1] = p[i + 2] = 255; p[i + 3] = a;
    if (a > 40) { const x = k % w, y = (k / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  g.putImageData(d, 0, 0);
  const m = { c, x0, y0, x1, y1, cols: null };
  maskCache.set(name, m);
  return m;
}
// 11/21 絵の無いチーム: 胸の字・記章を文字で描いて、絵と同じ形(白 = 形の透明の地)にする。字は全部架空のチーム名
const FONTS = {
  kanji: '900 150px "Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Noto Serif JP", "Noto Serif CJK JP", serif',
  block: '900 150px "Arial Black", "Helvetica Neue", Impact, sans-serif',
  script: 'italic 700 170px "Brush Script MT", "Segoe Script", Georgia, "Times New Roman", serif',
};
function textMask(id, text, font, script) {
  if (maskCache.has(id)) return maskCache.get(id);
  const c = document.createElement('canvas'); c.width = 1400; c.height = 300;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.font = font; g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.save(); g.translate(700, 150);
  if (script) g.rotate(-0.06);   // 筆記体は少し右上がり
  g.fillText(text, 0, 0, 1360);
  if (script) { g.lineWidth = 9; g.strokeStyle = '#fff'; g.beginPath(); const w = Math.min(1300, g.measureText(text).width); g.moveTo(-w * 0.42, 78); g.quadraticCurveTo(0, 96, w * 0.48, 66); g.stroke(); }   // 筆記体の下の払い
  g.restore();
  const d = g.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < x0) { x0 = 0; y0 = 0; x1 = 1; y1 = 1; }
  const m = { c, x0, y0, x1, y1, cols: null };
  maskCache.set(id, m);
  return m;
}
function chestMask(key, S) {
  if (S.art) return maskOf(`chest_${S.art}.png`);
  const [kind, text] = S.chest || ['block', (S.name || key).toUpperCase()];
  return textMask('chest|' + key, text, FONTS[kind] || FONTS.block, kind === 'script');
}
function emblemMask(key, S) {
  if (S.art) return maskOf(`emblem_${S.art}.png`);
  const [kind, text] = S.chest || ['block', key];
  const ch = kind === 'kanji' ? [...text][0] : text[0].toUpperCase();
  return textMask('emblem|' + key, ch, (FONTS[kind] || FONTS.block).replace(/1[57]0px/, '220px'), false);
}
// 数字の絵(0〜9 を横に並べた 1 枚)を、白の列のすき間で 10 個に分ける
function digitBoxes(m) {
  if (m.cols) return m.cols;
  const g = m.c.getContext('2d', { willReadFrequently: true }); const w = m.c.width, h = m.c.height;
  const d = g.getImageData(0, 0, w, h).data; const col = new Uint8Array(w);
  for (let x = 0; x < w; x++) for (let y = m.y0; y <= m.y1; y++) if (d[(y * w + x) * 4 + 3] > 60) { col[x] = 1; break; }
  const runs = []; let s = -1;
  for (let x = 0; x <= w; x++) { const on = x < w && col[x]; if (on && s < 0) s = x; if (!on && s >= 0) { if (x - s > 4) runs.push([s, x - 1]); s = -1; } }
  // 細い切れ端(すき間で割れた 1 つの字)はとなりとつなぐ
  while (runs.length > 10) { let bi = 0, bg = 1e9; for (let i = 0; i < runs.length - 1; i++) { const gp = runs[i + 1][0] - runs[i][1]; if (gp < bg) { bg = gp; bi = i; } } runs.splice(bi, 2, [runs[bi][0], runs[bi + 1][1]]); }
  m.cols = runs.length === 10 ? runs : null;
  return m.cols;
}
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
// 形を色で塗って(縁取りがあれば外に縁を付けて)canvas に描く
function paint(g, src, sx, sy, sw, sh, dx, dy, dw, dh, fill, outline, ow) {
  const t = document.createElement('canvas'); t.width = Math.ceil(dw + ow * 2 + 4); t.height = Math.ceil(dh + ow * 2 + 4);
  const tg = t.getContext('2d');
  const tint = (col) => { const u = document.createElement('canvas'); u.width = t.width; u.height = t.height; const ug = u.getContext('2d');
    ug.drawImage(src, sx, sy, sw, sh, ow + 2, ow + 2, dw, dh); ug.globalCompositeOperation = 'source-in'; ug.fillStyle = hex(col); ug.fillRect(0, 0, u.width, u.height); return u; };
  if (outline != null && ow > 0) { const o = tint(outline); for (let a = 0; a < 16; a++) tg.drawImage(o, Math.cos(a / 16 * Math.PI * 2) * ow, Math.sin(a / 16 * Math.PI * 2) * ow); }
  tg.drawImage(tint(fill), 0, 0);
  g.drawImage(t, dx - ow - 2, dy - ow - 2);
}

// ---------------------------------------------------------------- 体に沿わせた薄い板
// 体の元の形(立ち姿)から、高さ y の前(dir=1)・後ろ(dir=-1)の面の z を x ごとに調べる
const profCache = new Map();
function profile(geo, slotIdx, y, dir, xs) {
  const ck = geo.uuid + '|' + slotIdx + '|' + y.toFixed(3) + '|' + dir + '|' + xs.length + '|' + xs[0].toFixed(3);
  if (profCache.has(ck)) return profCache.get(ck);
  const P = geo.attributes.position, S = geo.attributes.slot; const out = [];
  for (const x of xs) {
    let best = null;
    for (let i = 0; i < P.count; i++) {
      if (S && Math.round(S.getX(i)) !== slotIdx) continue;
      if (Math.abs(P.getY(i) - y) > 0.025 || Math.abs(P.getX(i) - x) > 0.025) continue;
      const z = P.getZ(i); if (best === null || z * dir > best * dir) best = z;
    }
    out.push(best);
  }
  // 見つからない所はとなりから
  for (let i = 0; i < out.length; i++) if (out[i] === null) out[i] = out[i - 1] ?? out.find((v) => v !== null) ?? 0;
  profCache.set(ck, out);
  return out;
}
// 曲げた板: 幅 w・高さ h、中心 (0, y)、前後 dir。体の面から off だけ浮かせる。模型の座標で作り、骨の座標へ移す
function bentPlate(geo, slotIdx, y, w, h, dir, off) {
  const n = 12, rows = 4, xs = Array.from({ length: n + 1 }, (_, i) => -w / 2 + (w * i) / n);
  // 行ごとに、その高さの面を調べる(上下 2cm の一番外側。板が布の中へ沈まないように)
  const prof = Array.from({ length: rows + 1 }, (_, j) => {
    const yy = y - h / 2 + (h * j) / rows;
    const a = profile(geo, slotIdx, yy - 0.02, dir, xs), b = profile(geo, slotIdx, yy, dir, xs), c = profile(geo, slotIdx, yy + 0.02, dir, xs);
    return xs.map((_, k) => (dir > 0 ? Math.max(a[k], b[k], c[k]) : Math.min(a[k], b[k], c[k])));
  });
  const g = new THREE.PlaneGeometry(w, h, n, rows);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), yy = p.getY(i);
    const k = Math.round(((x + w / 2) / w) * n), j = Math.round(((yy + h / 2) / h) * rows);
    p.setXYZ(i, dir > 0 ? x : -x, y + yy, prof[j][k] + dir * off);
  }
  // 背中(dir < 0)は x を逆にして置くので、絵の左右はそのままで後ろから正しく読める(uv を返すと鏡文字になる。11/18 全員の背中で確かめた)
  g.computeVertexNormals();
  return g;
}
// 体に貼る板の材質。動きで布が少しふくらんでも沈まないよう、描く時だけカメラの方へ 1.2cm 寄せる。
// 動きを左右反転して使う時(athletes.js の model.scale.x = -1)は字が鏡文字になるので、その時だけ絵の左右を戻す
function pullForward(m) {
  m.side = THREE.DoubleSide;   // 左右反転すると面の表裏も入れ替わる
  m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_MAP
if (determinant(mat3(modelMatrix)) < 0.0) vMapUv.x = 1.0 - vMapUv.x;
#endif`).replace('#include <project_vertex>', `#include <project_vertex>
{ vec4 mv2 = mvPosition; mv2.xyz += normalize(-mvPosition.xyz) * 0.012; gl_Position = projectionMatrix * mv2; }`); };
  m.customProgramCacheKey = () => 'uniform-plate-v2';
  return m;
}
function plateMat(tex) {
  return pullForward(new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.02, roughness: 0.8, depthWrite: false }));
}
// 模型の座標(立ち姿)の物を骨に付ける
function attachToBone(r, bone, mesh, skinned) {
  // 骨に付ける位置は、組み立てた時の姿勢でなく「体を作った時の姿勢(bind)」から決める(その時の姿勢に左右されない)
  const sk = skinned && skinned.skeleton, idx = sk ? sk.bones.indexOf(bone) : -1;
  let toBone;
  if (idx >= 0) toBone = new THREE.Matrix4().copy(sk.boneInverses[idx]).multiply(skinned.bindMatrix);
  else { r.inner.updateMatrixWorld(true); toBone = new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(r.inner.matrixWorld); }
  mesh.geometry.applyMatrix4(toBone);
  bone.add(mesh);
}

// 体の材質(athletes.js の bodyMaterial)に足すシェーダー: パイピングと土の汚れ。vObjP・vObjN・vSlot は athletes.js が作る
export function uniformUniforms() {
  return { uPipe: { value: new THREE.Color(0x1c2b4a) }, uPipeK: { value: new THREE.Vector4(0, 0, 0, 0) }, uDirt: { value: 0 }, uCatch: { value: 0 }, uStripe: { value: new THREE.Vector4(0, 0, 0, 0) } };
}
export function uniformShader(sh, U) {
  Object.assign(sh.uniforms, U);
  // ベルトの形が腰の後ろで下へ垂れて見える所は、ズボンの色にする(形の直しは docs の案)
  sh.vertexShader = sh.vertexShader.replace('vSlot = slot;', 'vSlot = slot; if (uPipeK.x + uPipeK.y + uPipeK.z + uPipeK.w > 0.0 && slot > 3.5 && slot < 4.5 && (position.y < 0.9 || position.z < -0.11)) { vSlotCol = cols[1]; vSlot = 1.0; }')
    .replace('#include <common>', `#include <common>
uniform vec4 uPipeK;`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform vec3 uPipe; uniform vec4 uPipeK; uniform float uDirt; uniform float uCatch; uniform vec4 uStripe;
float uHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float uNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(uHash(i), uHash(i + vec3(1,0,0)), f.x), mix(uHash(i + vec3(0,1,0)), uHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(uHash(i + vec3(0,0,1)), uHash(i + vec3(1,0,1)), f.x), mix(uHash(i + vec3(0,1,1)), uHash(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
    .replace('// 白い布でも陰影が残るよう、布の反射率を本物の布くらいに', `// 白い布でも陰影が残るよう、布の反射率を本物の布くらいに
{ // ユニフォーム(uniform.js): パイピング(袖口・前立て・襟・ズボンの横)と土の汚れ
  float ax = abs(vObjP.x);
  if (uStripe.w > 0.5 && vSlot < 1.5) {   // 11/21 縦じま(上着・ズボン)。体のまわりの角度で 2.6cm おき。遠くでは細い線をならした色へ
    float cx = vSlot > 0.5 && vObjP.y < 0.8 ? sign(vObjP.x) * 0.095 : 0.0;
    float rr = vSlot > 0.5 && vObjP.y < 0.8 ? 0.075 : 0.15;
    float u = atan(vObjP.z + 0.01, vObjP.x - cx) * rr / 0.026;
    float fw = max(fwidth(u), 1e-4), d = abs(fract(u) - 0.5) * 2.0;
    float line = 1.0 - smoothstep(0.1 - fw, 0.1 + fw, d);
    line = mix(line, 0.1, smoothstep(0.25, 0.6, fw));
    diffuseColor.rgb = mix(diffuseColor.rgb, uStripe.rgb * 0.82, line * 0.92);
  }
  float pipe = 0.0;
  if (vSlot < 0.5) {
    float aa = max(fwidth(ax), 0.0015);
    pipe = max(pipe, uPipeK.x * smoothstep(0.371 - aa, 0.371 + aa, ax) * step(1.3, vObjP.y));                      // 袖口
    pipe = max(pipe, uPipeK.y * (1.0 - smoothstep(0.0035, 0.0035 + aa, abs(ax - 0.019))) * step(0.03, vObjP.z) * step(0.95, vObjP.y) * step(vObjP.y, 1.455));   // 前立ての 2 本の線
    float rr = length(vObjP.xz - vec2(0.0, -0.015));
    pipe = max(pipe, uPipeK.z * step(1.43, vObjP.y) * smoothstep(0.064, 0.07, rr) * (1.0 - smoothstep(0.082, 0.088, rr)));   // 襟(首まわりの細い線)
  }
  if (vSlot > 0.5 && vSlot < 1.5) {
    float side = sign(vObjP.x) * normalize(vObjN).x;
    pipe = max(pipe, uPipeK.w * smoothstep(0.9, 0.95, side) * step(0.42, vObjP.y) * step(vObjP.y, 0.885));          // ズボンの横の線
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, uPipe * 0.82, pipe);
  if (uCatch > 0.5) {   // 捕手の防具(形は変えず色で): 胸当て(上着の前)とレガース(すねの前)
    float chest = step(vSlot, 0.5) * smoothstep(0.035, 0.06, vObjP.z) * step(0.98, vObjP.y) * step(vObjP.y, 1.44) * step(ax, 0.2);
    float rib = 0.85 + 0.15 * step(0.5, fract(vObjP.y * 18.0));
    float shin = step(0.5, vSlot) * step(vSlot, 3.5) * smoothstep(-0.06, -0.03, vObjP.z) * step(0.12, vObjP.y) * step(vObjP.y, 0.5);
    float knee = shin * smoothstep(0.42, 0.46, vObjP.y);
    diffuseColor.rgb = mix(diffuseColor.rgb, uPipe * 0.55 * rib, max(chest, shin));
    diffuseColor.rgb = mix(diffuseColor.rgb, uPipe * 0.35, knee);
  }
  if (uDirt > 0.0 && vSlot > 0.5 && vSlot < 3.5 && abs(vSlot - 2.0) > 0.5) {
    float n = uNoise(vObjP * 38.0) * 0.6 + uNoise(vObjP * 95.0) * 0.4;
    float knee = smoothstep(0.43, 0.48, vObjP.y) * (1.0 - smoothstep(0.6, 0.66, vObjP.y)) * smoothstep(-0.05, 0.0, vObjP.z);   // 膝の前
    float seat = smoothstep(0.7, 0.76, vObjP.y) * (1.0 - smoothstep(0.86, 0.9, vObjP.y)) * smoothstep(-0.07, -0.11, vObjP.z) * 0.6;   // お尻(滑り込み)
    float shin = (1.0 - smoothstep(0.13, 0.22, vObjP.y)) * 0.35;   // 足首の上(ソックス)
    float d = clamp((knee + seat + shin) * uDirt * smoothstep(0.45, 0.8, n), 0.0, 0.8);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.32, 0.23), d * 0.45);
  }
}`);
}

// ---------------------------------------------------------------- 人ごと
// _build の後に 1 回: 胸の文字・背番号・帽子とヘルメットの記章の板を作る
export function buildUniform(a, baseGeo) {
  const r = a.rig; if (!r || OFF) return;
  DRESSED.add(a);
  const body = a.parts.Body[0];
  const geo = baseGeo || (body && body.geometry);
  const sp = r.bones.spine_03 || r.bones.spine_02, head = r.bones.Head || r.bones.head;
  r.uni = {};
  if (geo && geo.attributes.slot && sp) {
    // 胸の文字(幅 26cm・高さ 9cm、胸の高さ)
    const cc = UNI_SHARE ? null : document.createElement('canvas'); if (cc) { cc.width = 512; cc.height = 180; }
    const ct = UNI_SHARE ? blankTex() : new THREE.CanvasTexture(cc); if (!UNI_SHARE) { ct.colorSpace = THREE.SRGBColorSpace; ct.anisotropy = 8; }
    const chest = new THREE.Mesh(bentPlate(geo, 0, 1.31, 0.31, 0.108, 1, 0.005), plateMat(ct));
    chest.receiveShadow = true; chest.visible = false;
    attachToBone(r, sp, chest, body);
    r.uni.chest = { mesh: chest, c: cc, tex: ct, key: '' };
    // 背番号(体の背中に沿わせる。前の平らな板は使わない)
    if (r.numPlate) {
      const old = r.numPlate; old.parent && old.parent.remove(old);
      const back = new THREE.Mesh(bentPlate(geo, 0, 1.255, 0.24, 0.24, -1, 0.006), old.material);
      back.material.alphaTest = 0.02; pullForward(back.material); back.material.polygonOffset = false; back.receiveShadow = true; back.visible = false;
      attachToBone(r, sp, back, body);
      r.numPlate = back;
    }
  }
  // 帽子・ヘルメットの記章(前の真ん中、5cm)
  if (head) {
    for (const [part, zf, y] of [['Cap', 0.103, 1.702], ['Helmet', 0.112, 1.700]]) {
      if (!a.parts[part] || !a.parts[part].length) continue;
      const ec = UNI_SHARE ? null : document.createElement('canvas'); if (ec) ec.width = ec.height = 128;
      const et = UNI_SHARE ? blankTex() : new THREE.CanvasTexture(ec); if (!UNI_SHARE) et.colorSpace = THREE.SRGBColorSpace;
      const g = new THREE.PlaneGeometry(0.052, 0.052);
      g.rotateX(-0.6);   // つばの上の、上を向いた面に合わせる
      g.translate(0, y, zf + 0.004);
      const em = new THREE.Mesh(g, plateMat(et)); em.visible = false;
      attachToBone(r, head, em, body);
      r.uni[part] = { mesh: em, c: ec, tex: et, key: '' };
    }
  }
}
// 色を塗り直す(学校・番号が替わった時、絵が読み込まれた時)
export function dressUniform(a) {
  const r = a.rig; if (!r || !r.uni) return;
  const { key, S } = schoolOf(a.kit);
  const plain = a.isUmp || !a.kit || a.kit.plain || !a.kit.side;
  // 材質(パイピング・汚れ)
  for (const m of a.parts.Body) {
    const U = m.material.userData.uni; if (!U) continue;
    U.uPipe.value.setHex(S.pipe); U.uPipeK.value.set(...(plain ? [0, 0, 0, 0] : S.pipeK));
    if (U.uStripe) { const c = new THREE.Color(S.stripe ?? 0); U.uStripe.value.set(c.r, c.g, c.b, !plain && S.stripe != null ? 1 : 0); }
    U.uDirt.value = plain ? 0 : dirtOf(a);
    U.uCatch.value = !plain && a.opt && a.opt.mitt && a.opt.mitt !== 'fb' ? 1 : 0;
    const OU = a.kit && a.kit.ownUni;   // 11/26 着せ替え: 自分の選手の縦じま・パイピング
    if (OU) { if (OU.pipe != null) U.uPipe.value.setHex(OU.pipe); if (U.uStripe) { const c = new THREE.Color(OU.stripe ?? 0); U.uStripe.value.set(c.r, c.g, c.b, OU.stripe != null ? 1 : 0); } }
  }
  // 胸の文字
  const ch = r.uni.chest;
  if (ch) {
    const m = plain ? null : chestMask(key, S);
    ch.mesh.visible = !!m && !(a.opt && a.opt.mitt && a.opt.mitt !== 'fb');
    const k = key + '|' + (m ? 1 : 0);
    if (m && ch.key !== k) {
      ch.key = k;
      const drawChest = (c) => {
        const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
        const sw = m.x1 - m.x0 + 1, sh = m.y1 - m.y0 + 1;
        const ow = S.outline != null ? 7 : 0;
        const sc = Math.min((c.width - 8 - ow * 2) / sw, (c.height - 8 - ow * 2) / sh);
        const dw = sw * sc, dh = sh * sc;
        paint(g, m.c, m.x0, m.y0, sw, sh, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh, S.letter, S.outline, ow);
      };
      if (!ch.c) { const e = sharedUni('chest', k, 512, 180, 8, drawChest); ch.tex = e.tex; ch.mesh.material.map = e.tex; }   // 11/26 学校ごとに 1 枚
      else { drawChest(ch.c); ch.tex.needsUpdate = true; }
    }
  }
  // 帽子・ヘルメットの記章
  for (const part of ['Cap', 'Helmet']) {
    const e = r.uni[part]; if (!e) continue;
    const m = plain ? null : emblemMask(key, S);
    const { side } = schoolOf(a.kit);
    const custom = a.kit.cap !== (KIT[side] || KIT.home).cap;   // 自分の印の帽子(オレンジ)は記章なし
    e.mesh.visible = !!m && !custom && a.parts[part].some((x) => x.visible);
    const k = key + '|' + (m ? 1 : 0);
    if (m && e.key !== k) {
      e.key = k;
      const drawEm = (c) => {
        const g = c.getContext('2d'); g.clearRect(0, 0, 128, 128);
        const sw = m.x1 - m.x0 + 1, sh = m.y1 - m.y0 + 1, sc = Math.min(116 / sw, 116 / sh);
        paint(g, m.c, m.x0, m.y0, sw, sh, (128 - sw * sc) / 2, (128 - sh * sc) / 2, sw * sc, sh * sc, S.emblem, null, 0);
      };
      if (!e.c) { const sh = sharedUni('emblem', k, 128, 128, 0, drawEm); e.tex = sh.tex; e.mesh.material.map = sh.tex; }   // 11/26 学校ごとに 1 枚
      else { drawEm(e.c); e.tex.needsUpdate = true; }
    }
  }
}
// 汚れ: 内野手と捕手は多め、外野は少し、投手・打者・走者は少し
function dirtOf(a) {
  const n = +a.number || 0;
  if (n === 2) return 0.8; if (n >= 3 && n <= 6) return 0.65; if (n >= 7 && n <= 9) return 0.35; if (n === 1) return 0.2;
  return 0.3;
}
// 背番号を絵の数字で描く。絵がまだ無ければ false(athletes.js が前の書き方で描く)
export function drawNumber(a, canvas, num, colorOverride) {
  if (OFF || !a.kit || !a.kit.side) return false;
  const m = maskOf('digits.png'); if (!m) return false;
  const boxes = digitBoxes(m); if (!boxes) return false;
  const { S } = schoolOf(a.kit);
  const g = canvas.getContext('2d'); const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  const ds = String(num).split('').map((d) => boxes[+d]).filter(Boolean);
  if (!ds.length) return false;
  const sh = m.y1 - m.y0 + 1, gap = 0.08 * sh;
  const tw = ds.reduce((t, b) => t + (b[1] - b[0] + 1), 0) + gap * (ds.length - 1);
  const ow = S.numOutline != null || colorOverride != null ? Math.round(W * 0.035) : 0;
  const sc = Math.min((W * 0.9 - ow * 2) / tw, (H * 0.86 - ow * 2) / sh);
  let x = (W - tw * sc) / 2;
  const y = (H - sh * sc) / 2;
  for (const b of ds) {
    const bw = b[1] - b[0] + 1;
    paint(g, m.c, b[0], m.y0, bw, sh, x, y, bw * sc, sh * sc, colorOverride ?? S.num, colorOverride != null ? 0xf4f2ea : S.numOutline, ow);
    x += (bw + gap) * sc;
  }
  return true;
}
// 背番号の板の絵の大きさ(高さが足りないので 256 にする)
export const NUM_CANVAS = 256;
// 必要な絵を先に読み始める
export function preloadUniform() { for (const k of Object.keys(SCHOOLS)) if (SCHOOLS[k].art) { loadImg(`chest_${k}.png`); loadImg(`emblem_${k}.png`); } loadImg('digits.png'); }
