# 音の出典(すべて CC0。表記は不要だが記録として残す)

ハルの冒険(2026-10-13)で評判を確かめて使った物と同じ作者・同じ素材集から選んだ。新しく探した音は無い。

## BGM
- タイトル: Juhani Junkala「384 bgm_menu_title_6_sporty」(12 Music Loops)
  - https://opengameart.org/content/12-music-loops / CC0
  - 作者は OpenGameArt の CC0 音楽でお気に入り数1位(「5 Chiptunes (Action)」お気に入り 442・ダウンロード 31,921)。このパックはお気に入り 27・ダウンロード 381(2024年12月公開で新しい)
- レース中: Juhani Junkala「129 [Retro Sports] bgm_stage_3」(同じ 12 Music Loops)
  - https://opengameart.org/content/12-music-loops / CC0
- 作者の記載: "These music tracks have been released under CC0 creative commons license. You can do anything you want with these tunes."

## 効果音
- Juhani Junkala「The Essential Retro Video Game Sound Effects Collection [512 sounds]」/ CC0
  - https://opengameart.org/content/512-sound-effects-8-bit-style
  - 使っている音: クリック・カウントダウン・スタート・転ぶ・ぶつかる・ハードルを倒す・水しぶき・加速・ゴール・花火
- ゴールの曲(se_clear): celestialghost8「Victory」/ CC0 — https://opengameart.org/content/victory

## 加工
- BGM は頭と終わりの切り出しなし、音量だけ合わせた(ffmpeg loudnorm -17 LUFS)、MP3 96kbps。曲の中身は変えていない。
- 効果音はハルの冒険で切り出した MP3 をそのまま使用。

## 10/16 の追加
- 新しく足した音は無い。抜いた(se_coin)・おにぎり(se_item)・ラスト20m(se_checkpoint)・写真判定と気合い(se_star)・追い風(se_swing)など、上の CC0 の効果音集から入っている物を新しい場面に割り当てただけ。

## 絵
- 絵はすべて ChatGPT の画像生成(チャット 6acebbef…、chatgpt_requests.md)。10/16 に hurdle・beam・item_onigiri・ribbon・flags を追加(マゼンタの地を抜いて game/assets/ に置いた。原本は assets_from_chatgpt/)。
