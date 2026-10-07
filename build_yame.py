# -*- coding: utf-8 -*-
"""禁煙・禁酒の「体の変化」ページ(/yamebiyori/kinen/ ・ /yamebiyori/kinshu/)を書き出す。python build_yame.py
本文はアプリ「やめ日和」と同じく、厚生労働省 e-ヘルスネット等の原文をそのまま載せる(言い換え・要約しない)。
e-ヘルスネットの利用条件: 改変のない原文の状態で出典を明記すれば自由に利用できる(公共データ利用規約 第1.0版)。
アプリが書いた文(つなぎ・注意)は原文と見分けがつくように、引用の外に置く。"""
import os
import re

import build_exam as B

e = B.e
ROOT, BASE = B.ROOT, B.BASE
KENNET = "厚生労働省健康づくりサポートネット(e-ヘルスネット)"
S = {
    "early": ("禁煙開始からまだ間もない方へ《実行期編》", "https://kennet.mhlw.go.jp/information/information/tobacco/t-06-003.html", "谷口 千枝", "最終更新日 2018年10月03日"),
    "effect": ("禁煙の効果", "https://kennet.mhlw.go.jp/information/information/tobacco/t-08-001.html", "中村 正和", "最終更新日 2025年10月15日"),
    "prep": ("禁煙の準備 – 禁煙7日前から行う、禁煙のコツを教えます！《準備編》", "https://kennet.mhlw.go.jp/information/information/tobacco/t-06-002.html", "谷口 千枝", "最終確認日 2021年11月10日"),
    "liver": ("アルコールと肝臓病", "https://kennet.mhlw.go.jp/information/information/alcohol/a-01-002.html", "横山 顕", "最終更新日 2022年12月26日"),
    "cancer": ("アルコールとがん", "https://kennet.mhlw.go.jp/information/information/alcohol/a-01-008.html", "横山 顕", "最終更新日 2025年10月15日"),
    "dep": ("アルコールと依存", "https://kennet.mhlw.go.jp/information/information/alcohol/a-05-001.html", "木村 充", "最終更新日 2020年06月24日"),
}


def cite(k):
    t, u, a, d = S[k]
    return f'<p class="src">出典:「{e(t)}」({KENNET}) 執筆 {e(a)} {e(d)} <a href="{u}">{u}</a></p>'


def q(text, k):
    return f'<blockquote class="y-q"><p>{e(text)}</p>{cite(k)}</blockquote>'


CSS = """
.y-q{border-left:4px solid #2e7d6b;background:#fff;border-radius:10px;padding:12px 16px;margin:12px 0}
.y-q p{margin:0 0 6px;line-height:1.9}
.y-q .src{font-size:.86rem;color:#6b6b66}
table.y-t{border-collapse:collapse;width:100%;margin:8px 0}
table.y-t th,table.y-t td{border-bottom:1px solid #e2e2dc;padding:8px 10px;text-align:left;vertical-align:top}
table.y-t th{white-space:nowrap;color:#2e7d6b}
.y-note{background:#f3f1ea;border-radius:12px;padding:12px 16px;font-size:.95rem}
.y-cta{border-radius:16px;background:#e8f2ef;padding:16px 18px;margin:26px 0}
"""

CTA = ('<div class="y-cta"><p><b>禁酒・禁煙カウンター「やめ日和」</b><br>やめた日数と、浮いたお金を数えるアプリです。'
       '飲んだ日・吸った日があっても、それまでの通算の日数は消えません。吸いたくなったときの5分タイマー、来やすい時間帯のグラフもあります。</p>'
       '<div class="btns"><a class="btn ghost" href="https://play.google.com/apps/testing/jp.yamebiyori.sake">Android テスト版に参加</a></div>'
       '<p class="note" style="margin-top:8px">iPhone 版は App Store の審査中です。Android 版はテスト中で、参加ページで「テスターになる」を押すと使えます。</p></div>')
APPNOTE = ('<p class="y-note">このページとアプリは記録と情報のためのもので、医療の助言や診断はしません。体の変化には個人差があります。'
           '体調に不安があるとき、つらい症状が出たときは、ためらわず医療機関に相談してください。引用した内容は、厚生労働省がこのページのために示したものではありません。</p>')

TIMELINE = [
    ("禁煙後20分", "血圧や脈拍が正常化する"), ("12時間", "血液中の一酸化炭素が正常になる"),
    ("2-3週間", "心機能が改善する / 肺機能が回復する"), ("1-9ヶ月", "咳・息切れ・疲れやすさが改善される"),
    ("1年", "上昇していた冠動脈疾患のリスクが半減する"), ("5年", "脳卒中のリスクが非喫煙者と同じレベルになる"),
    ("10年", "肺がん死亡率が喫煙者の半分になる / 口腔・喉頭・食道・膵臓・膀胱・子宮頸がんになるリスクが低下する"),
    ("15年", "冠動脈疾患のリスクが非喫煙者と同じレベルになる"),
]


ALT_ROWS = [("朝起きてすぐ", "すぐに顔を洗う"), ("食事の後", "歯磨き"), ("コーヒーと一緒に", "コーヒーを紅茶に代える"), ("出勤中の車の中", "大声で歌う"), ("仕事の休憩時間", "職場の人に禁煙宣言をする"), ("帰宅時の車の中", "深呼吸"), ("アルコールとともに", "冷水を一緒に置いておき、吸いたくなったら飲む")]


def kinen():
    ALT = "".join(f"<tr><th>{e(a)}</th><td>{e(b)}</td></tr>" for a, b in ALT_ROWS)
    url = f"{BASE}/yamebiyori/kinen/"
    title = "禁煙すると体はいつ変わる?20分後から15年後まで(厚生労働省 e-ヘルスネットより)"
    desc = "禁煙後20分で血圧や脈拍が正常化し、2-3週間で心機能・肺機能が回復、1年で冠動脈疾患のリスクが半減。厚生労働省 e-ヘルスネットの表を原文のまま、出典つきで載せています。"
    rows = "".join(f"<tr><th>{e(a)}</th><td>{e(b)}</td></tr>" for a, b in TIMELINE)
    body = f"""<main class="wrap"><style>{CSS}</style>
<p class="note"><a href="/">YURU のアプリ</a> / やめ日和</p>
<h1>禁煙すると、体はいつ変わる?</h1>
<p>禁煙を始めてからの体の変化を、厚生労働省の e-ヘルスネットが表にまとめています。原文のまま載せます。</p>
{q("禁煙開始後20分から身体的な禁煙の効果は出現します。例えば血圧や脈拍が正常に戻ったり、手足の血のめぐりがよくなったりします。また継続して禁煙していくことで、呼吸がラクになったり味覚が戻ってきたりします。", "early")}
<table class="y-t">{rows}</table>
{cite("early")}
<h2>早い時期に感じられる変化</h2>
{q("禁煙後早ければ1ヵ月たつと、せきや喘鳴（ぜんめい）などの呼吸器症状が改善します。また、免疫機能が回復して、かぜやインフルエンザなどの感染症にかかりにくくなります。", "effect")}
{q("そのほか、禁煙すると顔色や胃の調子が良くなったり目覚めがさわやかになるなど、日常生活の中で実感できる色々な効果があります。", "effect")}
{q("長年たばこを吸っていても、禁煙するのに遅すぎることはありません。", "effect")}
<h2>はじめの2週間が山場</h2>
{q("禁煙開始後2～3日をピークに禁煙の離脱症状（禁断症状）が現れます。その後個人差はありますが、症状は緩やかに10～14日ごろまで続きます。", "prep")}
{q("たばこを吸いたい気持ちは1日中ずっと続くわけではありません。長く続いても3分～5分です。", "prep")}
<p>吸いたくなったら、5分だけ別のことをして過ごすのがひとつの手です。やめ日和には、そのための5分タイマーがあります。</p>
<h2>吸いたくなる場面と、代わりの行動</h2>
<p>e-ヘルスネットには、たばこを吸いたくなりやすい場面ごとに、代わりにする行動の例が表で載っています。原文のまま載せます。</p>
<table class="y-t">{ALT}</table>
{cite("prep")}
{APPNOTE}
<p><a href="/yamebiyori/kinshu/">禁酒すると体はどう変わる? →</a></p>
{CTA}
</main>"""
    ld = {"@context": "https://schema.org", "@type": "WebPage", "url": url, "name": title, "description": desc, "inLanguage": "ja", "dateModified": B.UPDATED}
    return url, B.head(title, desc, url, ld) + body + B.FOOT


def kinshu():
    url = f"{BASE}/yamebiyori/kinshu/"
    title = "禁酒すると体はどう変わる?肝臓・がんのリスクと、急にやめたときの症状(厚生労働省 e-ヘルスネットより)"
    desc = "飲酒が原因の脂肪肝は、やめれば短期間で改善するのが特徴。禁酒1年につき肝臓がんのリスクは6-7%低下。急にやめたときの離脱症状も。e-ヘルスネットの原文を出典つきで。"
    body = f"""<main class="wrap"><style>{CSS}</style>
<p class="note"><a href="/">YURU のアプリ</a> / やめ日和</p>
<h1>禁酒すると、体はどう変わる?</h1>
<p>お酒をやめたときの体の変化について、厚生労働省の e-ヘルスネットの原文をそのまま載せます。</p>
<h2>肝臓</h2>
{q("飲酒が原因の脂肪肝は、飲酒をやめれば短期間で改善するのが特徴です。", "liver")}
{q("アルコール性肝障害は禁酒により再生へ向かい、禁酒1年につき肝臓がんのリスクは6-7%低下します。", "liver")}
<h2>がんのリスク</h2>
{q("頭頸部がん、食道がん、肝臓がんでは禁酒により最初のがんや2つ目のがんの発生リスクが低下することが報告されており、禁煙・禁酒・野菜や果物の摂取に取り組めばさらにリスクは低下します。", "cancer")}
<h2>急にやめたときの体の症状</h2>
{q("身体依存とは、文字通り酒が切れると身体の症状が出ることで、酒を止めたり減らしたりしたときに、離脱症状と呼ばれる症状が出現するようになります。代表的な離脱症状としては、不眠・発汗・手のふるえ・血圧の上昇・不安・いらいら感などがあり、重症の場合は幻覚が見えたり、けいれん発作を起こしたりすることもあります。", "dep")}
<p>毎日たくさん飲んでいた人が急にやめるときは、こうした症状が出ることがあります。つらいときは一人で我慢せず、医療機関に相談してください。</p>
{APPNOTE}
<p><a href="/yamebiyori/kinen/">禁煙すると体はいつ変わる? →</a></p>
{CTA}
</main>"""
    ld = {"@context": "https://schema.org", "@type": "WebPage", "url": url, "name": title, "description": desc, "inLanguage": "ja", "dateModified": B.UPDATED}
    return url, B.head(title, desc, url, ld) + body + B.FOOT


def main():
    urls = []
    for fn in (kinen, kinshu):
        url, html = fn()
        d = os.path.join(ROOT, *url.replace(BASE + "/", "").strip("/").split("/"))
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n").write(html)
        urls.append(url)
    sm = os.path.join(ROOT, "sitemap.xml")
    s = open(sm, encoding="utf-8").read()
    s = re.sub(r"<url><loc>[^<]*/yamebiyori/[^<]*</loc>[^\n]*\n", "", s)
    s = s.replace("</urlset>", "".join(f"<url><loc>{u}</loc><lastmod>{B.UPDATED}</lastmod></url>\n" for u in urls) + "</urlset>")
    open(sm, "w", encoding="utf-8", newline="\n").write(s)
    print("ok", urls)


if __name__ == "__main__":
    main()
