# -*- coding: utf-8 -*-
"""試験ごとの案内ページ(/exam/<key>/index.html)と一覧(/exam/index.html)を書き出す。

数字はすべて公式の発表(厚生労働省・社会福祉振興・試験センター)と、アプリの exam.json から取った。
2026-10-07 時点。新しい回の発表が出たら EXAMS の値を書き換えて、もう一度実行する。
    python build_exam.py
"""
import html
import json
import os

BASE = "https://kame6493-del.github.io"
ROOT = os.path.dirname(os.path.abspath(__file__))
UPDATED = "2026-10-07"
UPDATED_JA = "2026年10月7日"

APP_MULTI = "https://apps.apple.com/jp/app/id6818535389"
APP_RINSHO = "https://apps.apple.com/jp/app/id6818536142"

SSSC_LICENSE = ("過去問題利用にあたっての留意事項等(社会福祉振興・試験センター)",
                "https://www.sssc.or.jp/pastissues/index.html")
MHLW_LICENSE = ("公共データ利用規約(第1.0版)",
                "https://www.digital.go.jp/resources/open_data/public_data_license_v1.0")

# ---------------------------------------------------------------------------
# 試験ごとの中身。facts の各行は (見出し, 本文HTML, [(出典名, URL), ...])
# ---------------------------------------------------------------------------
EXAMS = [
    {
        "key": "kaigo",
        "name": "介護福祉士",
        "round": 39,
        "date_ja": "2027年1月31日",
        "date_iso": "2027-01-31",
        "title": "介護福祉士国家試験の過去問の解き方と、第39回(2027年1月31日)の日程・合格基準",
        "h1": "介護福祉士国家試験 過去問の解き方と、第39回(2027年1月31日)までの進め方",
        "desc": "第39回介護福祉士国家試験は2027年1月31日(日)。出題数125問、第38回の合格点は64点・合格率70.1%。公式発表をもとにした日程と合格基準、過去問の解き直し方、過去問アプリ ニガテ帳の案内。",
        "lead": "第39回介護福祉士国家試験の筆記試験は、2027年1月31日(日)です。受験の申し込みは9月に締め切られ、12月には受験票が届きます。このページでは、試験センターが公表している日程と合格基準を整理したうえで、過去問をどういう順番で解くと手応えが出やすいかをまとめました。",
        "facts": [
            ("試験日", "2027年1月31日(日)。午前がAパート、午後がBパートとCパートです。",
             [("令和8年度 第39回介護福祉士国家試験", "https://www.sssc.or.jp/kaigo/tetsuzuki.html")]),
            ("受験申し込み", "2026年7月22日(水)から9月2日(水)まで。受付は終わっています。受験票は2026年12月11日(金)に発送予定です。",
             [("同上", "https://www.sssc.or.jp/kaigo/tetsuzuki.html")]),
            ("合格発表", "2027年3月23日(火)に試験センターのホームページに合格者の受験番号が載ります。",
             [("同上", "https://www.sssc.or.jp/kaigo/tetsuzuki.html")]),
            ("出題数", "125問。五肢択一を基本とする多肢選択形式で、13科目(12科目と総合問題)。総合問題は事例形式です。",
             [("同上", "https://www.sssc.or.jp/kaigo/tetsuzuki.html")]),
            ("合格基準(第38回)", "総得点125点のうち64点以上(総得点の60%程度を基準に、問題の難易度で補正)。そのうえで、11の科目群すべてで得点があること。1つでも0点の科目群があると不合格です。",
             [("第38回介護福祉士国家試験の合格基準及び正答について(PDF)", "https://www.sssc.or.jp/kaigo/past_exam/pdf/no38/k_kijun_seitou.pdf")]),
            ("第38回の結果", "受験者78,469人、合格者54,987人、合格率70.1%。",
             [("第38回介護福祉士国家試験の合格発表について(PDF)", "https://www.sssc.or.jp/kaigo/past_exam/pdf/no38/k_happyou.pdf")]),
            ("パート合格", "第38回から始まった仕組みです。全体の合格点に届かなくても、パートごとの基準点以上で、そのパートの科目群すべてに得点があれば、そのパートは合格になります。翌年・翌々年まで有効で、その間は不合格のパートだけを受け直すこともできます。第38回のパート別合格はAパート3,935人、Bパート1,509人、Cパート6,181人(一部重複)でした。",
             [("第38回介護福祉士国家試験の合格発表について(PDF)", "https://www.sssc.or.jp/kaigo/past_exam/pdf/no38/k_happyou.pdf")]),
        ],
        "history": {
            "caption": "合格点と合格率の移り変わり",
            "head": ["回", "合格点(125点満点)", "受験者数", "合格率"],
            "rows": [
                ["第34回", "—", "83,082人", "72.3%"],
                ["第35回", "75点", "79,151人", "84.3%"],
                ["第36回", "67点", "74,595人", "82.8%"],
                ["第37回", "70点", "75,387人", "78.3%"],
                ["第38回", "64点", "78,469人", "70.1%"],
            ],
            "note": "受験者数と合格率は第38回の合格発表資料の「これまでの試験結果」から。合格点は各回の合格基準の発表から(第35回は厚生労働省、第36回〜第38回は試験センターの資料。第34回の資料は、いまは公式のサイトで見つからないため「—」にしています)。",
            "src": [("第38回 合格発表(PDF)", "https://www.sssc.or.jp/kaigo/past_exam/pdf/no38/k_happyou.pdf"), ("第35回 合格基準(厚生労働省・PDF)", "https://www.mhlw.go.jp/content/12004000/001073949.pdf"), ("介護福祉士国家試験 過去の試験問題(試験センター)", "https://www.sssc.or.jp/kaigo/past_exam/index.html")],
        },
        "groups_note": "11の科目群は、(1)人間の尊厳と自立、介護の基本 (2)社会の理解 (3)人間関係とコミュニケーション、コミュニケーション技術 (4)生活支援技術 (5)こころとからだのしくみ (6)発達と老化の理解 (7)認知症の理解 (8)障害の理解 (9)医療的ケア (10)介護過程 (11)総合問題 です。",
        "howto": [
            ("最初に、いちばん新しい第38回を通しで解く",
             "最初の1回は、勉強が足りていないと感じていても、第38回の125問を午前と午後に分けて、本番と同じ時間で解いてみるのがおすすめです。午前の試験は1時間45分、午後は1時間55分と案内されています。点数そのものより、時間が足りるか、どのあたりで手が止まるかを知るための1回です。答え合わせのときに、科目群ごとの点も書き出しておきます。"),
            ("間違えた問題と、迷って当たった問題を残しておく",
             "答え合わせで×だった問題に加えて、2択まで絞って勘で当たった問題にも印をつけます。勘で当たった問題は、次に解くと半分くらいは外れるからです。ノートでもスマホのメモでもよいので、「回・問題番号・なぜ間違えたか」を一行ずつ残しておくと、あとで見直す量がはっきりします。"),
            ("同じ問題を、日を空けて2回続けて正解するまで解き直す",
             "解説を読んで納得した直後に解き直すと、ほぼ必ず正解します。それでは覚えたかどうかが分からないので、翌日や数日後にもう一度解いて、2回続けて正解できたらリストから外す、くらいの決まりにしておくと迷いません。リストが少しずつ短くなっていくのが、そのまま進み具合になります。"),
            ("総得点だけでなく、科目群ごとの点を見る",
             "介護福祉士の試験は、総得点が合格点を超えていても、11の科目群のどれかが0点だと不合格になります。医療的ケア(第38回は5問)のように問題数の少ない科目群は、取りこぼすと0点になりやすいので、通しで解いたあとは科目群ごとの点を必ず確かめてください。合格点は回によって64点から75点まで動いているので、目安は合格点ぎりぎりではなく、余裕を持って上に置いておくと安心です。"),
            ("古い回は、制度の変更に気をつける",
             "過去問には、その後の法改正などで、いまは問題として成り立たないものが含まれます。古い回の問題で解説と今の制度が合わないと感じたら、新しいテキストや厚生労働省の資料で確かめてから覚えるようにしてください。"),
        ],
        "plan": [
            ("10月", "第38回を通しで1回。苦手リストを作り始める。"),
            ("11月", "第37回・第36回へ。新しい回を解きながら、苦手リストの解き直しを毎日少しずつ。"),
            ("12月", "残りの回を解き終える。科目群ごとに0点になりそうなところがないかを確認。12月11日に受験票が届く予定。"),
            ("1月", "新しい問題は増やさず、苦手リストと第38回の解き直しに絞る。直前の週末にもう一度、時間を測って通しで解く。"),
        ],
        "app": {
            "status": "live",
            "store": APP_MULTI,
            "range": "第33回〜第38回の750問",
            "free": "第38回の125問",
            "price": "¥900",
            "extra": "事例問題は事例文つき、図のある問題は問題冊子の図をそのまま収録しています。",
        },
        "faq": [
            ("第39回介護福祉士国家試験はいつですか?",
             "2027年1月31日(日)です。受験の申し込みは2026年9月2日で締め切られています。合格発表は2027年3月23日(火)です。(社会福祉振興・試験センターの発表より)"),
            ("合格点は何点ですか?",
             "毎回、総得点の60%程度を基準に、問題の難易度で補正して決まります。第38回は125点中64点以上で、さらに11の科目群すべてで得点があることが条件でした。第35回から第38回の合格点は64点から75点の間です。"),
            ("ニガテ帳で介護福祉士の過去問は解けますか?",
             "解けます(iPhone)。アプリの中で介護福祉士を選ぶと、第38回の125問を無料で、第33回〜第38回の750問を完全版(¥900の買い切り)で解けます。"),
        ],
    },
    {
        "key": "shakai",
        "name": "社会福祉士",
        "round": 39,
        "date_ja": "2027年2月7日",
        "date_iso": "2027-02-07",
        "title": "社会福祉士国家試験の過去問の解き方と、第39回(2027年2月7日)の日程・合格基準",
        "h1": "社会福祉士国家試験 過去問の解き方と、第39回(2027年2月7日)までの進め方",
        "desc": "第39回社会福祉士国家試験は2027年2月7日(日)。出題数129問、第38回の合格点は50点・合格率60.7%。公式発表をもとにした日程と合格基準、過去問の解き直し方、過去問アプリ ニガテ帳の案内。",
        "lead": "第39回社会福祉士国家試験は、2027年2月7日(日)です。受験の申し込みは10月2日で締め切られました。新しい科目構成になってからの過去問は第37回と第38回の2回分しかないので、その2回をどれだけ深く使うかが大事になります。このページでは、試験センターの公表している日程と合格基準を整理して、過去問の使い方をまとめました。",
        "facts": [
            ("試験日", "2027年2月7日(日)。午前と午後に分かれています。",
             [("令和8年度 第39回社会福祉士国家試験", "https://www.sssc.or.jp/shakai/tetsuzuki.html")]),
            ("受験申し込み", "2026年9月3日(木)から10月2日(金)まで。受付は終わっています。受験票は2026年12月11日(金)に発送予定です。",
             [("同上", "https://www.sssc.or.jp/shakai/tetsuzuki.html")]),
            ("合格発表", "2027年3月9日(火)に試験センターのホームページに合格者の受験番号が載ります。",
             [("同上", "https://www.sssc.or.jp/shakai/tetsuzuki.html")]),
            ("出題数", "129問(午前84問、午後45問)。19科目で、五肢択一を基本とする多肢選択形式です。",
             [("同上", "https://www.sssc.or.jp/shakai/tetsuzuki.html")]),
            ("合格基準(第38回)", "総得点129点のうち50点以上(総得点の60%程度を基準に、問題の難易度で補正)。そのうえで、6つの科目群すべてで得点があること。共通科目の免除を受けた人は、45点のうち17点以上で、2つの科目群すべてに得点があることが条件でした。",
             [("第38回社会福祉士国家試験の合格基準及び正答について(PDF)", "https://www.sssc.or.jp/shakai/past_exam/pdf/no38/s_kijun_seitou.pdf")]),
            ("第38回の結果", "受験者25,430人、合格者15,438人、合格率60.7%。",
             [("第38回社会福祉士国家試験の合格発表について(PDF)", "https://www.sssc.or.jp/shakai/past_exam/pdf/no38/s_happyou.pdf")]),
        ],
        "history": {
            "caption": "受験者数と合格率の移り変わり",
            "head": ["回", "受験者数", "合格者数", "合格率"],
            "rows": [
                ["第34回", "34,563人", "10,742人", "31.1%"],
                ["第35回", "36,974人", "16,338人", "44.2%"],
                ["第36回", "34,539人", "20,050人", "58.1%"],
                ["第37回", "27,616人", "15,561人", "56.3%"],
                ["第38回", "25,430人", "15,438人", "60.7%"],
            ],
            "note": "第38回の合格発表資料の「これまでの試験結果」から。合格点は第37回が62点、第38回が50点(どちらも129点満点)でした。",
            "src": [("第38回社会福祉士国家試験の合格発表について(PDF)", "https://www.sssc.or.jp/shakai/past_exam/pdf/no38/s_happyou.pdf")],
        },
        "groups_note": "6つの科目群は、(1)医学概論、心理学と心理的支援、社会学と社会システム (2)社会福祉の原理と政策、社会保障、権利擁護を支える法制度 (3)地域福祉と包括的支援体制、障害者福祉、刑事司法と福祉 (4)ソーシャルワークの基盤と専門職、ソーシャルワークの理論と方法、社会福祉調査の基礎 (5)高齢者福祉、児童・家庭福祉、貧困に対する支援、保健医療と福祉 (6)ソーシャルワークの基盤と専門職(専門)、ソーシャルワークの理論と方法(専門)、福祉サービスの組織と経営 です。",
        "howto": [
            ("最初に、第38回を通しで解く",
             "まずは第38回の129問を、午前84問・午後45問に分けて解いてみてください。点数よりも、時間配分と、どの科目群で手が止まるかを知るのが目的です。答え合わせのときに、6つの科目群ごとの点を書き出しておきます。"),
            ("自信のなかった問題も「間違い」として残す",
             "社会福祉士の試験には、正しいものを2つ選ぶ問題が多く出ます。間違えた問題に加えて、2つのうち1つにしか自信がなかった問題や、迷って当たった問題も「回・問題番号・なぜ迷ったか」を一行ずつ残しておくと、見直す範囲がはっきりします。"),
            ("日を空けて、2回続けて正解するまで解き直す",
             "解説を読んだ直後に解き直すと、ほぼ正解します。翌日や数日後にもう一度解いて、2回続けて正解できたらリストから外す、という決まりにしておくと、覚えたかどうかで迷わずに済みます。過去問が2回分しかない分、この解き直しの回数で差がつきます。"),
            ("科目群ごとの点を、0点にしない",
             "総得点が合格点を超えていても、6つの科目群のどれかが0点だと不合格です。第38回の合格点は129点中50点、第37回は62点と、回によって大きく動いています。合格点の予想に頼るより、どの科目群も取りこぼさない状態を作るほうが確実です。"),
            ("制度の問題は、最新の情報で確かめる",
             "社会保障や権利擁護などの科目は、法改正の影響を受けやすい分野です。過去問の正答が今の制度と合わないことがあるので、気になる問題は新しいテキストや厚生労働省の資料で確かめてから覚えるようにしてください。"),
        ],
        "plan": [
            ("10月", "第38回を通しで1回。苦手リストを作り始める。"),
            ("11月", "第37回を通しで1回。2回分の苦手リストを毎日少しずつ解き直す。"),
            ("12月", "第38回と第37回をもう一度通しで。科目群ごとに0点になりそうなところがないか確認。12月11日に受験票が届く予定。"),
            ("1月〜2月", "苦手リストが空になるまで解き直す。直前の週末に、時間を測ってもう一度通しで解く。"),
        ],
        "app": {
            "status": "live",
            "store": APP_MULTI,
            "range": "第37回・第38回の258問",
            "free": "第38回の129問",
            "price": "¥900",
            "extra": "新しい科目構成(19科目)になってからの2回分を、問題文と選択肢は原文のまま収録しています。",
        },
        "faq": [
            ("第39回社会福祉士国家試験はいつですか?",
             "2027年2月7日(日)です。受験の申し込みは2026年10月2日で締め切られています。合格発表は2027年3月9日(火)です。(社会福祉振興・試験センターの発表より)"),
            ("合格点は何点ですか?",
             "毎回、総得点の60%程度を基準に、問題の難易度で補正して決まります。第38回は129点中50点以上、第37回は62点以上でした。どちらの回も、6つの科目群すべてで得点があることが条件です。"),
            ("ニガテ帳で社会福祉士の過去問は解けますか?",
             "解けます(iPhone)。アプリの中で社会福祉士を選ぶと、第38回の129問を無料で、第37回・第38回の258問を完全版(¥900の買い切り)で解けます。"),
        ],
    },
    {
        "key": "kanri",
        "name": "管理栄養士",
        "round": 41,
        "date_ja": "2027年2月28日",
        "date_iso": "2027-02-28",
        "title": "管理栄養士国家試験の過去問の解き方と、第41回(2027年2月28日)の日程・合格基準",
        "h1": "管理栄養士国家試験 過去問の解き方と、第41回(2027年2月28日)までの進め方",
        "desc": "第41回管理栄養士国家試験は2027年2月28日(日)、出願は2026年11月2日〜12月4日。合格基準は200点中120点以上、第40回の合格率は47.6%。厚生労働省の発表をもとにした日程と、過去問の解き直し方、無料で使える過去問アプリの案内。",
        "lead": "第41回管理栄養士国家試験は、2027年2月28日(日)です。出願の受付は2026年11月2日から12月4日までなので、これから書類をそろえる人も多いと思います。このページでは、厚生労働省の発表している日程と合格基準を整理したうえで、過去問をどう解いていくかをまとめました。",
        "facts": [
            ("試験日", "2027年2月28日(日)。",
             [("管理栄養士国家試験の施行(厚生労働省)", "https://www.mhlw.go.jp/kouseiroudoushou/shikaku_shiken/kanrieiyoushi/")]),
            ("出願", "2026年11月2日(月)から12月4日(金)まで。郵送(書留)は12月4日の消印まで有効です。受験票は2027年2月10日(水)に投函される予定です。",
             [("同上", "https://www.mhlw.go.jp/kouseiroudoushou/shikaku_shiken/kanrieiyoushi/")]),
            ("合格発表", "2027年3月26日(金)午後2時に、厚生労働省のホームページに受験地と受験番号が載ります。",
             [("同上", "https://www.mhlw.go.jp/kouseiroudoushou/shikaku_shiken/kanrieiyoushi/")]),
            ("出題数", "200問。配点は1問1点です。",
             [("第40回管理栄養士国家試験の結果について(PDF)", "https://www.mhlw.go.jp/content/10904750/001677805.pdf")]),
            ("合格基準(第40回)", "総合点120点以上/200点。科目ごとの足切りはありません。",
             [("第40回管理栄養士国家試験の結果について(PDF)", "https://www.mhlw.go.jp/content/10904750/001677805.pdf")]),
            ("第40回の結果", "受験者15,927人、合格者7,582人、合格率47.6%。管理栄養士養成課程の新卒は8,585人中6,810人(79.3%)、既卒は2,222人中208人(9.4%)、栄養士養成課程の既卒は5,120人中564人(11.0%)でした。",
             [("第40回管理栄養士国家試験の合格発表(厚生労働省)", "https://www.mhlw.go.jp/stf/newpage_71616.html"),
              ("結果について(PDF)", "https://www.mhlw.go.jp/content/10904750/001677805.pdf")]),
        ],
        "history": {
            "caption": "受験者数と合格率の移り変わり",
            "head": ["回", "受験者数", "合格者数", "合格率"],
            "rows": [
                ["第36回(2022年)", "16,426人", "10,692人", "65.1%"],
                ["第37回(2023年)", "16,351人", "9,254人", "56.6%"],
                ["第38回(2024年)", "16,329人", "8,056人", "49.3%"],
                ["第39回(2025年)", "16,169人", "7,778人", "48.1%"],
                ["第40回(2026年)", "15,927人", "7,582人", "47.6%"],
            ],
            "note": "第40回管理栄養士国家試験の結果についての「年次別受験者数、合格者数、合格率」から。",
            "src": [("第40回管理栄養士国家試験の結果について(PDF)", "https://www.mhlw.go.jp/content/10904750/001677805.pdf")],
        },
        "groups_note": "",
        "howto": [
            ("最初に、いちばん新しい第40回を通しで解く",
             "最初の1回は、まだ範囲を一周していなくても、第40回の200問を通しで解いてみるのがおすすめです。点数そのものより、200問を解き切る体力と、どの科目で手が止まるかを知るための1回です。答え合わせのときに、科目ごとの正答数も書き出しておきます。"),
            ("間違えた問題と、迷って当たった問題を残しておく",
             "×だった問題に加えて、2択まで絞って勘で当たった問題にも印をつけます。勘で当たった問題は、次に解くと外れることが多いからです。「回・問題番号・なぜ間違えたか」を一行ずつ残しておくと、見直す量がはっきりします。"),
            ("日を空けて、2回続けて正解するまで解き直す",
             "解説を読んだ直後に解き直すと、ほぼ必ず正解します。翌日や数日後にもう一度解いて、2回続けて正解できたらリストから外す、くらいの決まりにしておくと、覚えたかどうかで迷いません。"),
            ("科目ごとの点を、合格基準の6割と比べる",
             "管理栄養士の試験は総合点で120点(6割)を超えれば合格で、科目ごとの足切りはありません。そのぶん、どの科目で点を積むかを自分で決められます。通しで解いたあとは科目ごとの正答率を出して、6割を下回っている科目のうち問題数の多いものから手をつけると、総合点が動きやすくなります。"),
            ("古い回は、基準や制度の変更に気をつける",
             "古い回の問題には、その後に基準や制度が改められて、今の正解と合わなくなっているものがあります。気になる問題は、新しいテキストや厚生労働省の資料で確かめてから覚えるようにしてください。"),
        ],
        "plan": [
            ("10月", "第40回を通しで1回。苦手リストを作り始める。"),
            ("11月", "第39回・第38回へ。11月2日から12月4日の間に出願を済ませる。"),
            ("12月〜1月", "残りの回を解き終える。科目ごとの正答率が6割に届かないところを重点的に。"),
            ("2月", "新しい問題は増やさず、苦手リストと第40回の解き直しに絞る。直前の週末にもう一度、通しで解く。"),
        ],
        "app": {
            "status": "live",
            "store": APP_MULTI,
            "range": "第36回〜第40回の1,000問",
            "free": "第40回の200問",
            "price": "¥980",
            "extra": "本番形式の模試(200問を答え合わせなしで解き、時間と科目別の点を記録)は完全版の機能です。",
        },
        "faq": [
            ("第41回管理栄養士国家試験はいつですか?",
             "2027年2月28日(日)です。出願は2026年11月2日から12月4日まで、合格発表は2027年3月26日(金)午後2時です。(厚生労働省の発表より)"),
            ("合格基準は何点ですか?",
             "第40回は、1問1点の200点満点で、総合点120点以上が合格でした。科目ごとの足切りはありません。"),
            ("管理栄養士の過去問を無料で解けるアプリはありますか?",
             "ニガテ帳(iPhone)では、第40回の200問を、解説・苦手の記録・予想点まで含めて無料で使えます。第36回〜第39回の800問と模試は完全版(¥980の買い切り)です。広告はなく、アカウント登録も要りません。"),
        ],
    },
    {
        "key": "pt",
        "name": "理学療法士",
        "round": 62,
        "date_ja": "2027年2月21日",
        "date_iso": "2027-02-21",
        "title": "理学療法士国家試験の過去問の解き方と、第62回(2027年2月21日)の日程・合格基準",
        "h1": "理学療法士国家試験 過去問の解き方と、第62回(2027年2月21日)までの進め方",
        "desc": "第62回理学療法士国家試験の筆記試験は2027年2月21日(日)、出願は2026年12月14日〜2027年1月4日。第61回の合格基準は総得点167点以上かつ実地問題41点以上、合格率89.7%。厚生労働省の発表をもとにした日程と、過去問の解き直し方、過去問アプリの案内。",
        "lead": "第62回理学療法士国家試験の筆記試験は、2027年2月21日(日)です。出願は2026年12月14日から2027年1月4日まで。合格率は高い試験ですが、合格基準には総得点のほかに実地問題の基準もあります。このページでは、厚生労働省の発表している日程と合格基準を整理して、過去問の使い方をまとめました。",
        "facts": [
            ("試験日", "筆記試験は2027年2月21日(日)。口述試験及び実技試験は2月22日(月)と告示されています。",
             [("理学療法士国家試験の施行(厚生労働省)", "https://www.mhlw.go.jp/kouseiroudoushou/shikaku_shiken/rigakuryouhoushi/")]),
            ("出願", "2026年12月14日(月)から2027年1月4日(月)まで。郵送(書留)は1月4日の消印まで有効です。受験票は2027年1月下旬に発送予定です。",
             [("同上", "https://www.mhlw.go.jp/kouseiroudoushou/shikaku_shiken/rigakuryouhoushi/")]),
            ("合格発表", "2027年3月23日(火)午後2時に、厚生労働省のホームページに受験地と受験番号が載ります。",
             [("同上", "https://www.mhlw.go.jp/kouseiroudoushou/shikaku_shiken/rigakuryouhoushi/")]),
            ("出題数", "200問。一般問題は1問1点、実地問題は1問3点です。",
             [("第61回の合格発表(厚生労働省)", "https://www.mhlw.go.jp/general/sikaku/successlist/2026/siken08_09/about.html")]),
            ("合格基準(第61回)", "総得点167点以上/277点、かつ実地問題41点以上/117点。両方を満たす必要があります(採点除外の問題があったため、満点は回ごとに変わります)。",
             [("第61回理学療法士国家試験の合格発表について", "https://www.mhlw.go.jp/general/sikaku/successlist/2026/siken08_09/about.html")]),
            ("第61回の結果", "受験者12,436人、合格者11,156人、合格率89.7%。新卒は11,366人中10,782人(94.9%)。差し引くと、新卒以外は1,070人中374人(約35.0%)です。",
             [("同上", "https://www.mhlw.go.jp/general/sikaku/successlist/2026/siken08_09/about.html")]),
        ],
        "history": None,
        "groups_note": "",
        "howto": [
            ("最初に、いちばん新しい第61回を通しで解く",
             "最初の1回は、第61回の200問を午前と午後に分けて通しで解いてみるのがおすすめです。点数よりも、時間配分と、どの分野で手が止まるかを知るための1回です。答え合わせのときは、一般問題と実地問題の点を分けて出しておきます。"),
            ("総得点と実地問題の点を、別々に合格基準と比べる",
             "理学療法士の試験は、総得点が基準を超えていても、実地問題の点が基準に届かないと不合格です。第61回の基準は総得点167点以上、実地問題41点以上でした。実地問題は1問3点なので、1問の差が大きく響きます。通しで解いたら、2つの点をそれぞれ基準と並べて、足りないほうから手をつけてください。"),
            ("間違えた問題と、迷って当たった問題を残しておく",
             "×だった問題に加えて、勘で当たった問題にも印をつけます。画像や図を読む問題は、どこを見落としたのかも一緒にメモしておくと、次に同じ形の問題が出たときに役立ちます。"),
            ("日を空けて、2回続けて正解するまで解き直す",
             "解説を読んだ直後に解き直すと、ほぼ正解します。翌日や数日後にもう一度解いて、2回続けて正解できたらリストから外す、という決まりにしておくと、覚えたかどうかで迷わずに済みます。"),
            ("合格率の高さに安心しすぎない",
             "第61回の合格率は89.7%ですが、新卒以外に限ると約35%でした。周りがほとんど受かる試験だからこそ、落ちたときの負担は大きくなります。実習や卒業研究で時間が取りにくい時期は、苦手リストの解き直しだけでも毎日続けておくと、直前に慌てずに済みます。"),
        ],
        "plan": [
            ("10月〜11月", "第61回を通しで1回。総得点と実地問題の点を分けて記録し、苦手リストを作り始める。"),
            ("12月", "第60回・第59回へ。12月14日から1月4日の間に出願を済ませる。"),
            ("1月", "残りの回を解き終える。実地問題で落としている分野を重点的に。"),
            ("2月", "新しい問題は増やさず、苦手リストと第61回の解き直しに絞る。直前の週末にもう一度、通しで解く。"),
        ],
        "app": {
            "status": "live",
            "store": APP_MULTI,
            "range": "第57回〜第61回の1,000問",
            "free": "第61回の200問",
            "price": "¥980",
            "extra": "図や写真のある問題も、画像で収録しています。",
        },
        "faq": [
            ("第62回理学療法士国家試験はいつですか?",
             "筆記試験は2027年2月21日(日)です。出願は2026年12月14日から2027年1月4日まで、合格発表は2027年3月23日(火)午後2時です。(厚生労働省の告示より)"),
            ("合格基準は何点ですか?",
             "第61回は、一般問題1問1点・実地問題1問3点で、総得点167点以上(277点満点)かつ実地問題41点以上(117点満点)でした。満点は採点除外の問題の数で回ごとに変わります。"),
            ("ニガテ帳で理学療法士の過去問は解けますか?",
             "解けます(iPhone)。アプリの中で理学療法士を選ぶと、第61回の200問を無料で、第57回〜第61回の1,000問を完全版(¥980の買い切り)で解けます。"),
        ],
    },
    {
        "key": "rinsho",
        "name": "臨床検査技師",
        "round": 73,
        "date_ja": "2027年2月17日",
        "date_iso": "2027-02-17",
        "title": "臨床検査技師国家試験の過去問の解き方と、第73回(2027年2月17日)の日程・合格基準",
        "h1": "臨床検査技師国家試験 過去問の解き方と、第73回(2027年2月17日)までの進め方",
        "desc": "第73回臨床検査技師国家試験は2027年2月17日(水)、出願は2026年12月14日〜2027年1月4日。第72回の合格基準は199点中120点以上、合格率84.7%。厚生労働省の発表をもとにした日程と、過去問の解き直し方、無料で使える過去問アプリの案内。",
        "lead": "第73回臨床検査技師国家試験は、2027年2月17日(水)です。出願は2026年12月14日から2027年1月4日まで。病院実習や卒業研究が続く時期と重なるので、限られた時間で過去問を回すことになる人が多いと思います。このページでは、厚生労働省の発表している日程と合格基準を整理して、過去問の使い方をまとめました。",
        "facts": [
            ("試験日", "2027年2月17日(水)。",
             [("臨床検査技師国家試験の施行(厚生労働省)", "https://www.mhlw.go.jp/kouseiroudoushou/shikaku_shiken/rinshoukensagishi/")]),
            ("出願", "2026年12月14日(月)から2027年1月4日(月)まで。郵送(書留)は1月4日の消印まで有効です。受験票は2027年1月下旬に発送予定です。",
             [("同上", "https://www.mhlw.go.jp/kouseiroudoushou/shikaku_shiken/rinshoukensagishi/")]),
            ("合格発表", "2027年3月23日(火)午後2時に、厚生労働省のホームページに受験地と受験番号が載ります。",
             [("同上", "https://www.mhlw.go.jp/kouseiroudoushou/shikaku_shiken/rinshoukensagishi/")]),
            ("出題数", "200問(午前・午後)。配点は1問1点です。",
             [("第72回の合格発表(厚生労働省)", "https://www.mhlw.go.jp/general/sikaku/successlist/2026/siken07/about.html")]),
            ("合格基準(第72回)", "総得点120点以上/199点。1問が採点除外になったため、満点が199点でした。",
             [("第72回臨床検査技師国家試験の合格発表について", "https://www.mhlw.go.jp/general/sikaku/successlist/2026/siken07/about.html")]),
            ("第72回の結果", "受験者4,693人、合格者3,976人、合格率84.7%。新卒は4,064人中3,793人(93.3%)。差し引くと、新卒以外は629人中183人(約29.1%)です。",
             [("同上", "https://www.mhlw.go.jp/general/sikaku/successlist/2026/siken07/about.html")]),
        ],
        "history": None,
        "groups_note": "",
        "howto": [
            ("最初に、いちばん新しい第72回を通しで解く",
             "最初の1回は、第72回の200問を午前と午後に分けて通しで解いてみるのがおすすめです。点数よりも、時間配分と、どの科目で手が止まるかを知るための1回です。答え合わせのときに、科目ごとの正答数も書き出しておきます。"),
            ("間違えた問題と、迷って当たった問題を残しておく",
             "×だった問題に加えて、勘で当たった問題にも印をつけます。「回・問題番号・なぜ間違えたか」を一行ずつ残しておくと、見直す量がはっきりします。基準値や染色の問題のように、覚え直しが必要なものは、間違えた理由を短く書いておくと次に効きます。"),
            ("日を空けて、2回続けて正解するまで解き直す",
             "解説を読んだ直後に解き直すと、ほぼ正解します。翌日や数日後にもう一度解いて、2回続けて正解できたらリストから外す、という決まりにしておくと、覚えたかどうかで迷わずに済みます。"),
            ("科目ごとの点を、合格基準の6割と比べる",
             "臨床検査技師の試験は総得点で合否が決まり、第72回は199点中120点以上でした。科目ごとの足切りはないので、通しで解いたら科目ごとの正答率を出して、6割を下回っている科目のうち問題数の多いものから手をつけると、総得点が動きやすくなります。"),
            ("合格率の高さに安心しすぎない",
             "第72回の合格率は84.7%ですが、新卒以外に限ると約29%でした。実習や卒業研究で時間が取りにくい時期は、苦手リストの解き直しだけでも毎日続けておくと、直前に慌てずに済みます。"),
        ],
        "plan": [
            ("10月〜11月", "第72回を通しで1回。苦手リストを作り始める。"),
            ("12月", "第71回・第70回へ。12月14日から1月4日の間に出願を済ませる。"),
            ("1月", "残りの回を解き終える。6割に届かない科目を重点的に。"),
            ("2月", "新しい問題は増やさず、苦手リストと第72回の解き直しに絞る。直前の週末にもう一度、通しで解く。"),
        ],
        "app": {
            "status": "live",
            "store": APP_RINSHO,
            "range": "第68回〜第72回の1,000問",
            "free": "第72回の200問",
            "price": "¥980",
            "extra": "図や写真のある問題も、画像で収録しています。",
        },
        "faq": [
            ("第73回臨床検査技師国家試験はいつですか?",
             "2027年2月17日(水)です。出願は2026年12月14日から2027年1月4日まで、合格発表は2027年3月23日(火)午後2時です。(厚生労働省の告示より)"),
            ("合格基準は何点ですか?",
             "第72回は1問1点で、総得点120点以上(199点満点)が合格でした。1問が採点除外になったため満点が199点です。科目ごとの足切りはありません。"),
            ("臨床検査技師の過去問を無料で解けるアプリはありますか?",
             "ニガテ帳 臨床検査技師(iPhone)では、第72回の200問を、解説・苦手の記録・予想点まで含めて無料で使えます。第68回〜第71回の800問と模試は完全版(¥980の買い切り)です。広告はなく、アカウント登録も要りません。"),
        ],
    },
]

ORDER_HUB = ["kaigo", "shakai", "kanri", "pt", "rinsho"]

# ---------------------------------------------------------------------------

CSS = """
  :root {
    --bg: #ffffff; --tint: #f2f5f8; --ink: #222831; --sub: #5a6270; --mute: #8a919c; --line: #dfe4ea;
    --accent: #24527a; --accent-soft: #e6eef6;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #15181c; --tint: #1c2025; --ink: #e9ecef; --sub: #b0b7c1; --mute: #868e99; --line: #2c323a; --accent: #8db7e0; --accent-soft: #1f2b38; color-scheme: dark; }
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15.5px/1.9 "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", "YuGothic", "Meiryo", sans-serif; }
  a { color: var(--accent); }
  img { display: block; max-width: 100%; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 0 16px; }
  header.top { border-bottom: 1px solid var(--line); }
  header.top .wrap { display: flex; align-items: center; justify-content: space-between; height: 58px; max-width: 960px; }
  .logo { font-weight: 700; font-size: 20px; letter-spacing: .06em; color: var(--ink); text-decoration: none; }
  .logo small { font-size: 12px; font-weight: 400; color: var(--mute); letter-spacing: 0; margin-left: 8px; }
  header.top nav a { color: var(--sub); text-decoration: none; font-size: 14px; margin-left: 18px; }
  @media (max-width: 520px) { .logo small { display: none; } }
  .crumb { font-size: 12.5px; color: var(--mute); margin: 18px 0 0; }
  .crumb a { color: var(--mute); }
  h1 { font-size: clamp(21px, 4.2vw, 27px); line-height: 1.55; margin: 14px 0 0; }
  .lead { color: var(--sub); margin: 14px 0 0; }
  .upd { font-size: 12.5px; color: var(--mute); margin: 10px 0 0; }
  section { padding: 34px 0 6px; }
  h2 { font-size: 19px; margin: 0 0 12px; padding-top: 18px; border-top: 1px solid var(--line); }
  h3 { font-size: 16px; margin: 22px 0 4px; }
  p { margin: 8px 0 0; }
  dl.facts { margin: 6px 0 0; border-top: 1px solid var(--line); }
  dl.facts > div { display: grid; grid-template-columns: 9.5em 1fr; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line); }
  dl.facts dt { font-weight: 700; font-size: 14px; color: var(--sub); }
  dl.facts dd { margin: 0; }
  .src { display: block; font-size: 12.5px; color: var(--mute); margin-top: 2px; }
  .src a { color: var(--mute); }
  @media (max-width: 560px) { dl.facts > div { grid-template-columns: 1fr; gap: 2px; } }
  .tbl { overflow-x: auto; margin: 14px 0 0; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  caption { text-align: left; font-weight: 700; font-size: 14px; color: var(--sub); padding-bottom: 6px; }
  th, td { padding: 7px 10px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  thead th { font-size: 12.5px; color: var(--sub); font-weight: 700; }
  .note { font-size: 13px; color: var(--sub); }
  @media (max-width: 560px) { th, td { padding: 6px 6px; font-size: 13px; } thead th { white-space: normal; vertical-align: bottom; } }
  .tbl.w th, .tbl.w td { white-space: normal; }
  .tbl.w th:first-child { min-width: 11em; }
  ol.plan { list-style: none; margin: 10px 0 0; padding: 0; border-left: 2px solid var(--accent-soft); }
  ol.plan li { padding: 4px 0 10px 16px; }
  ol.plan b { font-weight: 700; color: var(--accent); margin-right: 8px; }
  .app { background: var(--tint); border-radius: 10px; padding: 22px 20px; margin-top: 8px; }
  .app .name { display: flex; gap: 12px; align-items: center; }
  .app .name img { width: 52px; height: 52px; border-radius: 12px; border: 1px solid var(--line); }
  .app .name p { margin: 0; line-height: 1.5; }
  .app .name .t { font-weight: 700; font-size: 17px; }
  .app .name .k { font-size: 13px; color: var(--sub); }
  .app ul { margin: 14px 0 0; padding-left: 1.2em; }
  .app li { margin: 3px 0; }
  .state { font-size: 13px; color: var(--sub); margin: 12px 0 0; }
  .btns { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0 0; }
  .btn { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 18px; border-radius: 8px; font-weight: 700; font-size: 14px; text-decoration: none; }
  .btn.fill { background: var(--accent); color: #fff; }
  @media (prefers-color-scheme: dark) { .btn.fill { color: #10161c; } }
  .btn.ghost { border: 1px solid var(--line); color: var(--ink); background: var(--bg); }
  .faq h3 { margin-top: 18px; }
  .others { list-style: none; padding: 0; margin: 8px 0 0; }
  .others li { padding: 6px 0; border-bottom: 1px solid var(--line); }
  .disc { font-size: 13px; color: var(--sub); }
  .cards { list-style: none; padding: 0; margin: 10px 0 0; }
  .cards li { padding: 18px 0; border-bottom: 1px solid var(--line); }
  .cards h2 { border: 0; padding: 0; margin: 0; font-size: 18px; }
  .cards p { color: var(--sub); font-size: 14.5px; margin: 4px 0 0; }
  footer { border-top: 1px solid var(--line); padding: 28px 0 44px; margin-top: 40px; color: var(--sub); font-size: 13.5px; }
  footer p { margin: 2px 0; }
"""


def e(s):
    return html.escape(s, quote=True)


def head(title, desc, url, jsonld):
    return f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="{url}">
<meta property="og:site_name" content="YURU">
<meta property="og:locale" content="ja_JP">
<meta property="og:image" content="{BASE}/img/nigatecho-icon.png">
<meta name="twitter:card" content="summary">
<meta name="twitter:site" content="@apkderete">
<link rel="icon" href="/img/nigatecho-icon.png">
<style>{CSS}</style>
<script type="application/ld+json">
{json.dumps(jsonld, ensure_ascii=False, indent=1)}
</script>
</head>
<body>
<header class="top">
  <div class="wrap">
    <a class="logo" href="/">YURU<small>スマホアプリ</small></a>
    <nav><a href="/exam/">試験別ガイド</a><a href="/#apps">アプリ</a></nav>
  </div>
</header>
"""


FOOT = """
<footer>
  <div class="wrap">
    <p>作っている人: YURU(個人) / お知らせは X <a href="https://x.com/apkderete">@apkderete</a></p>
    <p>誤りに気づいたら <a href="mailto:kame6493@gmail.com">kame6493@gmail.com</a> までお知らせください。確認して直します。</p>
    <p><a href="/">YURU のアプリ</a> ・ <a href="/exam/">国家試験の過去問ガイド</a></p>
    <p>© 2026 YURU</p>
  </div>
</footer>
</body>
</html>
"""


def srcs(lst):
    return '<span class="src">出典: ' + " / ".join(
        f'<a href="{u}">{e(t)}</a>' for t, u in lst) + "</span>"


def app_block(x):
    a = x["app"]
    nm = x["name"]
    if x["key"] == "rinsho":
        title, kind = "ニガテ帳 臨床検査技師", "臨床検査技師国家試験の過去問(iPhone)"
    else:
        title, kind = "ニガテ帳", "国家試験の過去問(iPhone)。アプリの中で試験を選べます"
    pre = "" if a["status"] == "live" else f'<p class="note" style="margin-top:12px">{nm}を追加したあとの内容です。</p>'
    if a["status"] == "live":
        state = f"{nm}は App Store で公開中です。"
        btn = f'<a class="btn fill" href="{a["store"]}">App Store で見る</a>'
    else:
        state = (f"{nm}はアップデートで追加予定(審査中)です。審査が通るまでは、アプリの中で{nm}を選べません。"
                 "今は管理栄養士の過去問が入っています。")
        btn = f'<a class="btn ghost" href="{a["store"]}">App Store のページ(管理栄養士で公開中)</a>'
    return f"""
<section id="app">
  <h2>過去問アプリ「ニガテ帳」について</h2>
  <p>ここまでの解き方を、スマホでやりやすくするために作ったアプリです。間違えた問題が「苦手」として残り、日を空けて2回続けて正解すると消えます。科目ごとの正答率と、いまの正答率で本番を受けたら何点になるかの予想も出ます。点数が上がるかどうかは使い方しだいなので、効果や合格をお約束するものではありません。</p>
  <div class="app">
    <div class="name"><img src="/img/nigatecho-icon.png" alt="" width="52" height="52"><div><p class="t">{e(title)}</p><p class="k">{e(kind)}</p></div></div>
    {pre}<ul>
      <li>収録: {nm}国家試験 {e(a["range"])}。全問に解説つき(解説は独自に書いたものです)</li>
      <li>無料: {e(a["free"])}を、解説・苦手の記録・予想点まで含めて使えます</li>
      <li>完全版: {e(a["price"])}の買い切り。月額はかかりません</li>
      <li>広告なし、アカウント登録なし。記録は端末の中だけに保存され、電波のない所でも解けます</li>
    </ul>
    <p class="note" style="margin-top:10px">{e(a["extra"])}</p>
    <p class="state">{state} Android 版はテスト中です(<a href="/#tester">テスターの募集はこちら</a>)。</p>
    <div class="btns">{btn}</div>
  </div>
</section>
"""


def exam_page(x):
    url = f"{BASE}/exam/{x['key']}/"
    faq_ld = {
        "@type": "FAQPage",
        "@id": url + "#faq",
        "mainEntity": [{"@type": "Question", "name": q,
                        "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in x["faq"]],
    }
    jsonld = {"@context": "https://schema.org", "@graph": [
        {"@type": "WebPage", "@id": url, "url": url, "name": x["title"], "description": x["desc"],
         "inLanguage": "ja", "dateModified": UPDATED,
         "isPartOf": {"@type": "WebSite", "name": "YURU", "url": BASE + "/"},
         "breadcrumb": {"@type": "BreadcrumbList", "itemListElement": [
             {"@type": "ListItem", "position": 1, "name": "YURU", "item": BASE + "/"},
             {"@type": "ListItem", "position": 2, "name": "国家試験の過去問ガイド", "item": BASE + "/exam/"},
             {"@type": "ListItem", "position": 3, "name": x["name"], "item": url}]}},
        faq_ld]}

    out = [head(x["title"], x["desc"], url, jsonld)]
    out.append('<main class="wrap">')
    out.append(f'<p class="crumb"><a href="/">YURU</a> › <a href="/exam/">国家試験の過去問ガイド</a> › {x["name"]}</p>')
    out.append(f"<h1>{e(x['h1'])}</h1>")
    out.append(f'<p class="lead">{e(x["lead"])}</p>')
    out.append(f'<p class="upd">{UPDATED_JA}時点の公式発表をもとにしています。最新の情報は、出典のページで確かめてください。</p>')

    # 試験の基本
    out.append(f'<section id="facts"><h2>第{x["round"]}回{x["name"]}国家試験の日程と合格基準</h2><dl class="facts">')
    for dt, dd, s in x["facts"]:
        out.append(f"<div><dt>{e(dt)}</dt><dd>{e(dd)}{srcs(s)}</dd></div>")
    out.append("</dl>")
    if x["groups_note"]:
        out.append(f'<p class="note">{e(x["groups_note"])}</p>')
    h = x["history"]
    if h:
        out.append('<div class="tbl"><table>')
        out.append(f"<caption>{e(h['caption'])}</caption><thead><tr>" +
                   "".join(f'<th scope="col">{e(c)}</th>' for c in h["head"]) + "</tr></thead><tbody>")
        for r in h["rows"]:
            out.append("<tr>" + f'<th scope="row">{e(r[0])}</th>' + "".join(f"<td>{e(c)}</td>" for c in r[1:]) + "</tr>")
        out.append("</tbody></table></div>")
        out.append(f'<p class="note">{e(h["note"])}{srcs(h["src"])}</p>')
    out.append("</section>")

    import build_exam_sub
    out.append(build_exam_sub.sub_links_html(x["key"]))

    # 解き方
    out.append(f'<section id="howto"><h2>過去問の解き方</h2>')
    out.append("<p>どの資格試験でも言われることですが、過去問は「何年分を解いたか」より「間違えた問題をどれだけ解けるようにしたか」で差がつきます。以下は特定の教材に限らない、一般的な進め方です。</p>")
    for t, body in x["howto"]:
        out.append(f"<h3>{e(t)}</h3><p>{e(body)}</p>")
    out.append("</section>")

    # 日程
    out.append(f'<section id="plan"><h2>第{x["round"]}回({x["date_ja"]})までの進め方の一例</h2>')
    out.append("<p>10月から始める場合の目安です。もっと前から始めている人は、各月の内容を前に倒してください。</p><ol class=\"plan\">")
    for m, t in x["plan"]:
        out.append(f"<li><b>{e(m)}</b>{e(t)}</li>")
    out.append("</ol></section>")

    # 1問ずつの解答・解説ページ(build_q.py が書き出す)
    qround = {"kaigo": 38, "kanri": 40, "rinsho": 72, "pt": 61, "shakai": 38}.get(x["key"])
    if qround:
        out.append(f'<section id="q"><h2>第{qround}回の過去問を1問ずつ解く</h2>'
                   f'<p>第{qround}回{x["name"]}国家試験の問題を、正答と選択肢ごとの解説つきで1問ずつ載せています(図を使う問題は除く)。</p>'
                   f'<div class="btns"><a class="btn fill" href="/q/{x["key"]}/{qround}/">第{qround}回の過去問と解説</a></div></section>')

    # 受験生の質問に答える小ページ(build_guides.py が書き出す)
    guide = {"kanri": ("/exam/kanri/kisotsu/", "既卒の合格率と、働きながらの勉強の進め方"),
             "shakai": ("/exam/shakai/hajimekata/", "社会人から始めるとき、最初の2週間にやること")}.get(x["key"])
    if guide:
        out.append(f'<p>あわせて読む: <a href="{guide[0]}">{e(guide[1])}</a></p>')

    out.append(app_block(x))

    # FAQ
    out.append('<section id="faq" class="faq"><h2>よくある質問</h2>')
    for q, a in x["faq"]:
        out.append(f"<h3>{e(q)}</h3><p>{e(a)}</p>")
    out.append("</section>")

    # 他の試験
    out.append('<section id="others"><h2>ほかの試験</h2><ul class="others">')
    for k in ORDER_HUB:
        if k == x["key"]:
            continue
        y = next(z for z in EXAMS if z["key"] == k)
        out.append(f'<li><a href="/exam/{k}/">{y["name"]}国家試験</a> <span class="note">第{y["round"]}回 {y["date_ja"]}</span></li>')
    out.append("</ul></section>")

    # 注意書き
    org = "社会福祉振興・試験センター" if x["key"] in ("kaigo", "shakai") else "厚生労働省"
    lic = SSSC_LICENSE if x["key"] in ("kaigo", "shakai") else MHLW_LICENSE
    out.append(f"""<section id="note"><h2>このページについて</h2>
<p class="disc">このページとニガテ帳は個人(YURU)の制作物で、厚生労働省および社会福祉振興・試験センターとは関係ありません。試験の日程・合格基準・受験者数は、各ページに示した{org}の公表資料から取りました。アプリの問題と正答は{org}が公表したものを出典とし、<a href="{lic[1]}">{e(lic[0])}</a>にしたがって収録しています。解説は独自に作成したものです。過去問には、その後の法改正などで今の正解と合わなくなった問題が含まれることがあります。受験の手続きは、必ず公式の案内で確かめてください。</p>
</section>""")
    out.append("</main>")
    out.append(FOOT)
    return "\n".join(out)


def hub_page():
    url = f"{BASE}/exam/"
    title = "国家試験の過去問ガイド(介護福祉士・社会福祉士・管理栄養士・理学療法士・臨床検査技師)"
    desc = "介護福祉士・社会福祉士・管理栄養士・理学療法士・臨床検査技師の国家試験について、次の試験日と合格基準を公式発表から整理し、過去問の解き方をまとめたページの一覧です。"
    jsonld = {"@context": "https://schema.org", "@graph": [
        {"@type": "CollectionPage", "@id": url, "url": url, "name": title, "description": desc,
         "inLanguage": "ja", "dateModified": UPDATED,
         "isPartOf": {"@type": "WebSite", "name": "YURU", "url": BASE + "/"},
         "hasPart": [{"@type": "WebPage", "url": f"{BASE}/exam/{k}/"} for k in ORDER_HUB]}]}
    out = [head(title, desc, url, jsonld), '<main class="wrap">']
    out.append('<p class="crumb"><a href="/">YURU</a> › 国家試験の過去問ガイド</p>')
    out.append("<h1>国家試験の過去問ガイド</h1>")
    out.append('<p class="lead">過去問アプリ「ニガテ帳」で扱っている試験について、次の試験日と合格基準を公式の発表から整理し、過去問の解き方をまとめました。試験ごとのページに出典のリンクを付けています。</p>')
    out.append(f'<p class="upd">{UPDATED_JA}時点の情報です。</p>')
    out.append('<ul class="cards">')
    blurbs = {
        "kaigo": "125問。第38回の合格点は64点、合格率70.1%。11の科目群すべてで得点が必要。パート合格あり。",
        "shakai": "129問。第38回の合格点は50点、合格率60.7%。6つの科目群すべてで得点が必要。",
        "kanri": "200問。合格基準は総合点120点以上。第40回の合格率47.6%。出願は11月2日〜12月4日。",
        "pt": "200問。第61回は総得点167点以上かつ実地問題41点以上、合格率89.7%。出願は12月14日〜1月4日。",
        "rinsho": "200問。第72回は120点以上(199点満点)、合格率84.7%。出願は12月14日〜1月4日。",
    }
    for k in ORDER_HUB:
        y = next(z for z in EXAMS if z["key"] == k)
        out.append(f'<li><h2><a href="/exam/{k}/">{y["name"]}国家試験</a></h2>'
                   f'<p>第{y["round"]}回 {y["date_ja"]}。{e(blurbs[k])}</p>'
                   f'<p><a href="/exam/{k}/goukakuten/">合格点の推移</a> ・ <a href="/exam/{k}/schedule/">日程と残り日数</a>'
                   + (' ・ <a href="/exam/kaigo/kamoku/">11の科目群</a>' if k == "kaigo" else "") + '</p></li>')
    out.append("</ul>")
    out.append("""<section><h2>ニガテ帳について</h2>
<p>間違えた問題が残り、日を空けて2回続けて正解すると消える、国家試験の過去問アプリです。どの試験も直近1回分は無料で、完全版は買い切りです。広告はなく、アカウント登録も要りません。iPhone では「ニガテ帳」で管理栄養士・介護福祉士・社会福祉士・理学療法士を、「ニガテ帳 臨床検査技師」で臨床検査技師を公開中です。Android 版はテスト中です。</p>
<div class="btns"><a class="btn fill" href="https://apps.apple.com/jp/app/id6818535389">管理栄養士(App Store)</a><a class="btn fill" href="https://apps.apple.com/jp/app/id6818536142">臨床検査技師(App Store)</a><a class="btn ghost" href="/#tester">Android テスト</a></div>
</section>
<section><h2>このページについて</h2><p class="disc">個人(YURU)の制作物で、厚生労働省および社会福祉振興・試験センターとは関係ありません。受験の手続きは、必ず公式の案内で確かめてください。</p></section>""")
    out.append("</main>")
    out.append(FOOT)
    return "\n".join(out)


def main():
    for x in EXAMS:
        d = os.path.join(ROOT, "exam", x["key"])
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(exam_page(x))
    with open(os.path.join(ROOT, "exam", "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(hub_page())
    import build_exam_sub
    build_exam_sub.build_all()
    print("ok")


if __name__ == "__main__":
    main()
