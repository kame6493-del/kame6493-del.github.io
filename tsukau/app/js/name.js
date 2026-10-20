// 名前をカタカナにする。よくある名前は辞書(日本で一般的な書き方)、それ以外は綴りから近い音を推す。
// 推した結果は「だいたいの形」なので、画面で直せるようにしている。
const DICT = {
  aaron: 'アーロン', adam: 'アダム', adrian: 'エイドリアン', aiden: 'エイデン', alex: 'アレックス', alexander: 'アレクサンダー', alice: 'アリス', alicia: 'アリシア',
  amanda: 'アマンダ', amber: 'アンバー', amelia: 'アメリア', amy: 'エイミー', andrew: 'アンドリュー', angela: 'アンジェラ', anna: 'アナ', anthony: 'アンソニー',
  ashley: 'アシュリー', ava: 'エヴァ', benjamin: 'ベンジャミン', ben: 'ベン', brandon: 'ブランドン', brian: 'ブライアン', caleb: 'ケイレブ', carlos: 'カルロス',
  charlotte: 'シャーロット', chloe: 'クロエ', chris: 'クリス', christopher: 'クリストファー', daniel: 'ダニエル', david: 'デイビッド', diego: 'ディエゴ',
  dylan: 'ディラン', elena: 'エレナ', eli: 'イーライ', elijah: 'イライジャ', elizabeth: 'エリザベス', ella: 'エラ', emily: 'エミリー', emma: 'エマ', eric: 'エリック',
  ethan: 'イーサン', evelyn: 'エヴリン', gabriel: 'ガブリエル', grace: 'グレース', hannah: 'ハンナ', harper: 'ハーパー', henry: 'ヘンリー', isabella: 'イザベラ',
  jack: 'ジャック', jacob: 'ジェイコブ', james: 'ジェームズ', jason: 'ジェイソン', jennifer: 'ジェニファー', jessica: 'ジェシカ', john: 'ジョン', jordan: 'ジョーダン',
  jose: 'ホセ', joseph: 'ジョセフ', joshua: 'ジョシュア', julia: 'ジュリア', justin: 'ジャスティン', kevin: 'ケビン', kyle: 'カイル', laura: 'ローラ', leo: 'レオ',
  liam: 'リアム', lily: 'リリー', logan: 'ローガン', lucas: 'ルーカス', lucy: 'ルーシー', luis: 'ルイス', luna: 'ルナ', madison: 'マディソン', maria: 'マリア',
  mark: 'マーク', mason: 'メイソン', matthew: 'マシュー', maya: 'マヤ', mia: 'ミア', michael: 'マイケル', michelle: 'ミシェル', mila: 'ミラ', nathan: 'ネイサン',
  nicholas: 'ニコラス', noah: 'ノア', nora: 'ノラ', olivia: 'オリビア', oliver: 'オリバー', owen: 'オーウェン', paul: 'ポール', rachel: 'レイチェル',
  rebecca: 'レベッカ', robert: 'ロバート', ryan: 'ライアン', samuel: 'サミュエル', sam: 'サム', sarah: 'サラ', sara: 'サラ', sebastian: 'セバスチャン',
  sofia: 'ソフィア', sophia: 'ソフィア', sophie: 'ソフィー', stephanie: 'ステファニー', steven: 'スティーブン', taylor: 'テイラー', thomas: 'トーマス',
  tom: 'トム', tyler: 'タイラー', victoria: 'ビクトリア', william: 'ウィリアム', zoe: 'ゾーイ', max: 'マックス', mike: 'マイク', kate: 'ケイト', katie: 'ケイティ',
  lisa: 'リサ', nina: 'ニーナ', rose: 'ローズ', ruby: 'ルビー', scarlett: 'スカーレット', violet: 'バイオレット', aria: 'アリア', hazel: 'ヘーゼル',
  isaac: 'アイザック', jake: 'ジェイク', luke: 'ルーク', mateo: 'マテオ', miguel: 'ミゲル', juan: 'フアン', ana: 'アナ', camila: 'カミラ', valentina: 'バレンティナ',
  lucia: 'ルシア', pedro: 'ペドロ', rafael: 'ラファエル', ahmed: 'アハメド', fatima: 'ファティマ', omar: 'オマール', ali: 'アリ', min: 'ミン', jin: 'ジン',
  kim: 'キム', lee: 'リー', nguyen: 'グエン', anh: 'アン', linh: 'リン', wei: 'ウェイ', chen: 'チェン', priya: 'プリヤ', arjun: 'アルジュン', ivan: 'イヴァン',
  anastasia: 'アナスタシア', hans: 'ハンス', lena: 'レナ', marco: 'マルコ', giulia: 'ジュリア', pierre: 'ピエール', claire: 'クレア', louis: 'ルイ',
  george: 'ジョージ', harry: 'ハリー', charlie: 'チャーリー', freya: 'フレイヤ', isla: 'アイラ', finn: 'フィン', felix: 'フェリックス', hugo: 'ヒューゴ',
  riley: 'ライリー', jasmine: 'ジャスミン', brooke: 'ブルック', mohammed: 'モハメド', muhammad: 'ムハンマド', abigail: 'アビゲイル', aubrey: 'オーブリー', avery: 'エイブリー',
  layla: 'レイラ', penelope: 'ペネロペ', stella: 'ステラ', claire: 'クレア', jayden: 'ジェイデン', connor: 'コナー', cameron: 'キャメロン', evan: 'エヴァン',
};

// ローマ字の並びをカタカナに(長い綴りから先に当てる)
const ROMA = {
  kya: 'キャ', kyu: 'キュ', kyo: 'キョ', sha: 'シャ', shu: 'シュ', sho: 'ショ', she: 'シェ', chi: 'チ', cha: 'チャ', chu: 'チュ', cho: 'チョ', che: 'チェ',
  tsu: 'ツ', shi: 'シ', nya: 'ニャ', nyu: 'ニュ', nyo: 'ニョ', hya: 'ヒャ', mya: 'ミャ', rya: 'リャ', ryu: 'リュ', ryo: 'リョ', gya: 'ギャ', ja: 'ジャ', ju: 'ジュ',
  jo: 'ジョ', je: 'ジェ', ji: 'ジ', thi: 'ティ', thu: 'トゥ', tha: 'サ', the: 'ザ', tho: 'ソ', ph: 'フ', fa: 'ファ', fi: 'フィ', fe: 'フェ', fo: 'フォ', fu: 'フ',
  va: 'バ', vi: 'ビ', vu: 'ブ', ve: 'ベ', vo: 'ボ', wi: 'ウィ', we: 'ウェ', wo: 'ウォ', wa: 'ワ', ti: 'ティ', di: 'ディ', tu: 'トゥ', du: 'ドゥ',
  ka: 'カ', ki: 'キ', ku: 'ク', ke: 'ケ', ko: 'コ', ga: 'ガ', gi: 'ギ', gu: 'グ', ge: 'ゲ', go: 'ゴ', sa: 'サ', si: 'シ', su: 'ス', se: 'セ', so: 'ソ',
  za: 'ザ', zi: 'ジ', zu: 'ズ', ze: 'ゼ', zo: 'ゾ', ta: 'タ', te: 'テ', to: 'ト', da: 'ダ', de: 'デ', do: 'ド', na: 'ナ', ni: 'ニ', nu: 'ヌ', ne: 'ネ', no: 'ノ',
  ha: 'ハ', hi: 'ヒ', hu: 'フ', he: 'ヘ', ho: 'ホ', ba: 'バ', bi: 'ビ', bu: 'ブ', be: 'ベ', bo: 'ボ', pa: 'パ', pi: 'ピ', pu: 'プ', pe: 'ペ', po: 'ポ',
  ma: 'マ', mi: 'ミ', mu: 'ム', me: 'メ', mo: 'モ', ya: 'ヤ', yu: 'ユ', ye: 'イェ', yo: 'ヨ', ra: 'ラ', ri: 'リ', ru: 'ル', re: 'レ', ro: 'ロ',
  la: 'ラ', li: 'リ', lu: 'ル', le: 'レ', lo: 'ロ', ca: 'カ', ci: 'シ', cu: 'ク', ce: 'セ', co: 'コ', qu: 'ク', xa: 'クサ',
  a: 'ア', i: 'イ', u: 'ウ', e: 'エ', o: 'オ', y: 'イ',
};
// 子音だけで終わる時の形
const SOLO = { b: 'ブ', c: 'ク', d: 'ド', f: 'フ', g: 'グ', h: '', j: 'ジ', k: 'ク', l: 'ル', m: 'ム', n: 'ン', p: 'プ', q: 'ク', r: 'ル', s: 'ス', t: 'ト', v: 'ブ', w: 'ウ', x: 'クス', z: 'ズ' };
const KEYS = Object.keys(ROMA).sort((a, b) => b.length - a.length);

function englishToRoma(s) {
  return s
    .replace(/ee|ea/g, 'ii').replace(/oo/g, 'uu').replace(/ck/g, 'k').replace(/ph/g, 'f').replace(/th/g, 's')
    .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/x/g, 'kus').replace(/q/g, 'k')
    .replace(/([bcdfghjklmnpqrstvwxz])\1/g, '$1');
}

export function romaToKatakana(word) {
  let s = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (s.length > 3 && /ce$/.test(s)) s = s.slice(0, -2) + 's';
  else if (s.length > 3 && /ge$/.test(s)) s = s.slice(0, -2) + 'ji';
  else if (s.length > 3 && /[^aeiou]e$/.test(s)) s = s.slice(0, -1); // 語末の読まない e
  s = englishToRoma(s);
  let out = '';
  while (s.length) {
    if (s[0] === 'n' && s.length > 1 && !'aeiouy'.includes(s[1])) { out += 'ン'; s = s.slice(1); continue; }
    const k = KEYS.find(k => s.startsWith(k));
    if (k) {
      const v = ROMA[k];
      // 同じ母音が続くときは長音
      if (k.length === 1 && 'aiueo'.includes(k) && out && /[アカサタナハマヤラワガザダバパイキシチニヒミリギジビピウクスツヌフムユルグズブプエケセテネヘメレゲゼデベペオコソトノホモヨロゴゾドボポ]$/.test(out) && k === lastVowel(out)) { out += 'ー'; }
      else out += v;
      s = s.slice(k.length); continue;
    }
    out += SOLO[s[0]] ?? ''; s = s.slice(1);
  }
  return out;
}
const VOW = { ア: 'a', カ: 'a', サ: 'a', タ: 'a', ナ: 'a', ハ: 'a', マ: 'a', ヤ: 'a', ラ: 'a', ワ: 'a', ガ: 'a', ザ: 'a', ダ: 'a', バ: 'a', パ: 'a', イ: 'i', キ: 'i', シ: 'i', チ: 'i', ニ: 'i', ヒ: 'i', ミ: 'i', リ: 'i', ギ: 'i', ジ: 'i', ビ: 'i', ピ: 'i', ウ: 'u', ク: 'u', ス: 'u', ツ: 'u', ヌ: 'u', フ: 'u', ム: 'u', ユ: 'u', ル: 'u', グ: 'u', ズ: 'u', ブ: 'u', プ: 'u', エ: 'e', ケ: 'e', セ: 'e', テ: 'e', ネ: 'e', ヘ: 'e', メ: 'e', レ: 'e', ゲ: 'e', ゼ: 'e', デ: 'e', ベ: 'e', ペ: 'e', オ: 'o', コ: 'o', ソ: 'o', ト: 'o', ノ: 'o', ホ: 'o', モ: 'o', ヨ: 'o', ロ: 'o', ゴ: 'o', ゾ: 'o', ド: 'o', ボ: 'o', ポ: 'o' };
function lastVowel(s) { return VOW[s[s.length - 1]] || ''; }

// 名前全体(空白で区切った語ごと)。{ kana, known } known=辞書にあった語の数
export function nameToKatakana(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
  let known = 0;
  const parts = words.map(w => {
    const key = w.toLowerCase().replace(/[^a-z]/g, '');
    if (DICT[key]) { known++; return DICT[key]; }
    if (/^[゠-ヿ]+$/.test(w)) { known++; return w; }
    if (/^[぀-ゟ]+$/.test(w)) { known++; return w.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60)); }
    return romaToKatakana(w);
  }).filter(Boolean);
  return { kana: parts.join('・'), known, words: words.length };
}
