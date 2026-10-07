# -*- coding: utf-8 -*-
"""受験生の質問に答える小ページ(/exam/<試験>/<名前>/)を書き出す。python build_guides.py
Threads で繰り返し出ている質問(Booth のセッション 2026-10-07)に、公式の数字と、手元のデータで言えることだけで答える。
数字は各ページに書いた出典で確かめたもの。sitemap.xml の行も足す。"""
import os
import re

import build_exam as B

e, BASE, ROOT = B.e, B.BASE, B.ROOT

N40 = ("第40回管理栄養士国家試験の結果について(厚生労働省・PDF)", "https://www.mhlw.go.jp/content/10904750/001677805.pdf")


def kanri_kisotsu():
    url = f"{BASE}/exam/kanri/kisotsu/"
    title = "管理栄養士国試は既卒だと合格率10%前後。第40回の数字と、既卒の勉強の進め方"
    desc = "第40回管理栄養士国家試験の合格率は、養成課程の新卒79.3%に対し、管理栄養士養成課程の既卒9.4%、栄養士養成課程の既卒11.0%。受験者の46%が既卒です。厚生労働省の発表の数字と、働きながら勉強する人向けの進め方。"
    body = f"""<main class="wrap">
<p class="note"><a href="/exam/kanri/">管理栄養士国家試験</a> / 既卒の人へ</p>
<h1>管理栄養士国試、既卒の合格率と勉強の進め方</h1>
<p>管理栄養士の国家試験は、新卒と既卒で合格率が大きく違います。厚生労働省が発表した第40回(2026年3月1日実施)の数字を、学校区分ごとに並べます。</p>
<h2>第40回の学校区分別の合格率</h2>
<table class="tbl">
<tr><th>区分</th><th>受験者数</th><th>合格者数</th><th>合格率</th></tr>
<tr><td>管理栄養士養成課程(新卒)</td><td>8,585人</td><td>6,810人</td><td>79.3%</td></tr>
<tr><td>管理栄養士養成課程(既卒)</td><td>2,222人</td><td>208人</td><td>9.4%</td></tr>
<tr><td>栄養士養成課程(既卒)</td><td>5,120人</td><td>564人</td><td>11.0%</td></tr>
<tr><td>全体</td><td>15,927人</td><td>7,582人</td><td>47.6%</td></tr>
</table>
{B.srcs([N40])}
<p>既卒の2つの区分を合わせると、受験者は7,342人で全体の46%、合格者は772人で、合格率は10.5%です(上の表から計算)。合格基準は200点中120点以上で、新卒か既卒かで変わりません。</p>

<h2>既卒で勉強するときの進め方</h2>
<p>働きながら勉強する人は、使える時間が限られます。ここからは、過去問アプリを作っている立場で、手元の過去問データから言えることを書きます。合格を約束するものではありません。</p>
<h3>1. 最初に、直近の回を時間を測って1回解く</h3>
<p>第40回の200問を、本番と同じように時間を測って解きます。点数そのものより、どの科目で何問落としたかを知るのが目的です。合格基準の120点まで何点足りないかが、ここで分かります。</p>
<h3>2. 科目ごとの問題数は毎回同じ</h3>
<p>第36回から第40回までの5回、10科目すべてで問題数が同じでした。いちばん多いのは応用力試験の30問、次が人体の構造と機能及び疾病の成り立ちと臨床栄養学の26問ずつです。時間をどこに使うかは、この数を目安にできます。<a href="/blog/kanri-subject-counts.html">科目ごとの問題数を数えた話</a></p>
<h3>3. 間違えた問題だけを回す</h3>
<p>過去問を最初から何周もすると、すでに解ける問題に時間を取られます。間違えた問題だけに印を付けて、そこだけを何度も解き直すと、限られた時間を落としている問題に集中できます。印は、2回続けて正解できたら外す、のように決めておくと、残りの数が減っていくのが分かります。</p>
<h3>4. 応用力試験は4択が中心</h3>
<p>応用力試験は30問のうち24〜28問が4択でした(第36〜40回)。事例を読んで答える問題なので、ほかの科目とは解く感覚が違います。過去問で早めに慣れておくと、本番で戸惑いません。</p>

<h2>第40回の問題を1問ずつ</h2>
<p>第40回の問題は、正答と選択肢ごとの解説つきで1問ずつ載せています。<a href="/q/kanri/40/">第40回の過去問と解説</a></p>
<div class="btns"><a class="btn fill" href="{B.APP_MULTI}">過去問アプリ「ニガテ帳」(App Store)</a></div>
<p class="note">ニガテ帳は、間違えた問題だけが残り、2回続けて正解すると消える過去問アプリです。第40回の200問は無料で解けます。このページとアプリは個人(YURU)の制作物で、厚生労働省とは関係ありません。</p>
</main>"""
    ld = {"@context": "https://schema.org", "@type": "WebPage", "url": url, "name": title, "description": desc, "inLanguage": "ja", "dateModified": B.UPDATED}
    return url, B.head(title, desc, url, ld) + "<style>.tbl{border-collapse:collapse;width:100%;margin:8px 0}.tbl th,.tbl td{border-bottom:1px solid #e3dccb;padding:8px 10px;text-align:left}</style>" + body + B.FOOT


PAGES = [kanri_kisotsu]


def main():
    urls = []
    for fn in PAGES:
        url, html = fn()
        d = os.path.join(ROOT, *url.replace(BASE + "/", "").strip("/").split("/"))
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(html)
        urls.append(url)
    sm = os.path.join(ROOT, "sitemap.xml")
    s = open(sm, encoding="utf-8").read()
    for u in urls:
        if u not in s:
            s = s.replace("</urlset>", f"<url><loc>{u}</loc><lastmod>{B.UPDATED}</lastmod></url>\n</urlset>")
    open(sm, "w", encoding="utf-8", newline="\n").write(s)
    print("ok", urls)


if __name__ == "__main__":
    main()
