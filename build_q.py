# -*- coding: utf-8 -*-
"""過去問1問ずつの解答・解説ページ(/q/<試験>/<回>/<id>/)と、回ごとの一覧(/q/<試験>/<回>/)を書き出す。

対象はアプリで無料にしている最新の回だけ。図のある問題と、正答が公表されなかった(除外の)問題は載せない。
問題文・選択肢・正答は公表された原文のまま。解説はアプリ「ニガテ帳」のもの(独自に書いたもの)。
    python build_q.py   (sitemap.xml の /q/ の行も書き直す)
"""
import json
import os
import re

import build_exam as B

e = B.e
ROOT = B.ROOT
BASE = B.BASE
APPDIR = r"C:\Users\yuichi1\Downloads\管理栄養士国試アプリ_2026-10-01\app"

SSSC_NOTE = B.SSSC_LICENSE
MHLW_NOTE = B.MHLW_LICENSE

EXAMS = [
    # key, 表示名, データ, 回, 出題元, 出題元の利用条件, アプリの状態
    ("kaigo", "介護福祉士", "public/data/kaigo/questions.json", 38, "社会福祉振興・試験センター", SSSC_NOTE, "multi_live"),
    ("kanri", "管理栄養士", "public/data/kanri/questions.json", 40, "厚生労働省", MHLW_NOTE, "multi_live"),
    ("rinsho", "臨床検査技師", "exams/rinsho/data/questions.json", 72, "厚生労働省", MHLW_NOTE, "rinsho_live"),
    ("pt", "理学療法士", "public/data/pt/questions.json", 61, "厚生労働省", MHLW_NOTE, "multi_live"),
    ("shakai", "社会福祉士", "public/data/shakai/questions.json", 38, "社会福祉振興・試験センター", SSSC_NOTE, "multi_live"),
    ("seishin", "精神保健福祉士", "public/data/seishin/questions.json", 28, "社会福祉振興・試験センター", SSSC_NOTE, "soon"),
]

EXTRA_CSS = """
.q-stem{font-size:1.08rem;line-height:1.9;margin:18px 0 14px;white-space:pre-wrap}
ol.q-ch{padding-left:0;list-style:none;margin:0 0 18px}
ol.q-ch li{border:1px solid #e3dccb;border-radius:12px;padding:12px 14px;margin:8px 0;background:#fff;display:flex;gap:10px}
ol.q-ch li b{min-width:1.4em;color:#7a6f5c}
details.q-ans{border:2px solid #2b2620;border-radius:14px;padding:14px 16px;margin:16px 0;background:#fffdf8}
details.q-ans summary{cursor:pointer;font-weight:700;font-size:1.05rem}
.q-exp{white-space:pre-wrap;line-height:1.9;margin-top:12px}
.q-nav{display:flex;justify-content:space-between;gap:10px;margin:22px 0;flex-wrap:wrap}
.q-nav a{border:1px solid #d8cfba;border-radius:999px;padding:8px 16px;text-decoration:none}
.q-meta{color:#7a6f5c;font-size:.92rem}
ul.q-list{list-style:none;padding:0}
ul.q-list li{border-bottom:1px solid #eee5d3;padding:10px 2px}
ul.q-list li a{text-decoration:none}
.q-cta{border-radius:16px;background:#f3ede0;padding:16px 18px;margin:26px 0}
"""


def label(q):
    n = q.get("session_no") or q["no"]
    return f"{q['session']} 問{n}"


def app_cta(name, state, key=""):
    if state == "rinsho_live":
        url, txt = B.APP_RINSHO, "「ニガテ帳 臨床検査技師」は App Store で公開中です。"
    elif state == "multi_live":
        url, txt = B.APP_CPP.get(key, B.APP_MULTI), f"「ニガテ帳」(iPhone)で、{name}の過去問を解けます。"
    else:
        url, txt = B.APP_MULTI, f"{name}は「ニガテ帳」(iPhone)の次のアップデートで追加する予定です。"
    return (f'<div class="q-cta"><p><b>間違えた問題だけが残る過去問アプリ</b><br>{e(txt)}'
            "間違えた問題は「苦手」として残り、2回続けて正解すると消えます。全問に解説つき、広告なし。</p>"
            f'<div class="btns"><a class="btn fill" href="{url}">App Store で見る</a>'
            '<a class="btn ghost" href="/#tester">Android テスト版</a></div></div>')


def ans_text(q):
    return "・".join(f"{a} {q['choices'][a - 1]}" for a in q["answer"])


def related(x, q, qs, n=5):
    """同じ科目のほかの問題を、この問題の次から順に n 問(科目で探している人が次へ進めるように)"""
    key, ex = x[0], x[3]
    same = [p for p in qs if p["subject"] == q["subject"] and p["id"] != q["id"]]
    if not same:
        return ""
    i = next((k for k, p in enumerate(same) if (p["session"], p.get("session_no") or p["no"]) > (q["session"], q.get("session_no") or q["no"])), 0)
    pick = (same[i:] + same[:i])[:n]
    items = "".join(f'<li><a href="/q/{key}/{ex}/{p["id"]}/">{e(label(p))}</a> '
                    f'<span class="q-meta">{e(re.sub(r"[ 　]+", " ", p["stem"])[:40])}…</span></li>' for p in pick)
    return f'<h2 style="font-size:1.05rem;margin-top:26px">{e(q["subject"])}のほかの問題</h2><ul class="q-list">{items}</ul>'


def page(x, q, prev, nxt, qs=()):
    key, name, _, ex, org, lic, state = x
    url = f"{BASE}/q/{key}/{ex}/{q['id']}/"
    stem1 = re.sub(r"\s+", " ", q["stem"])
    title = f"第{ex}回{name}国家試験 {label(q)} 解答と解説|{q['subject']}"
    desc = f"{stem1[:70]}… 正答と、選択肢ごとの解説。第{ex}回{name}国家試験 {label(q)}({q['subject']})。"
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "WebPage", "@id": url, "url": url, "name": title, "description": desc, "inLanguage": "ja",
         "dateModified": B.UPDATED, "isPartOf": {"@type": "WebSite", "name": "YURU", "url": BASE + "/"}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "国家試験の過去問ガイド", "item": BASE + "/exam/"},
            {"@type": "ListItem", "position": 2, "name": f"{name}", "item": f"{BASE}/exam/{key}/"},
            {"@type": "ListItem", "position": 3, "name": f"第{ex}回 過去問と解説", "item": f"{BASE}/q/{key}/{ex}/"},
            {"@type": "ListItem", "position": 4, "name": label(q), "item": url}]}]}
    ch = "".join(f"<li><b>{i}</b><span>{e(c)}</span></li>" for i, c in enumerate(q["choices"], 1))
    nav = '<div class="q-nav">'
    nav += f'<a href="/q/{key}/{ex}/{prev["id"]}/">← {e(label(prev))}</a>' if prev else "<span></span>"
    nav += f'<a href="/q/{key}/{ex}/">第{ex}回の一覧</a>'
    nav += f'<a href="/q/{key}/{ex}/{nxt["id"]}/">{e(label(nxt))} →</a>' if nxt else "<span></span>"
    nav += "</div>"
    src = [(f"{org} 第{ex}回{name}国家試験 問題", q["source"]), lic]
    body = f"""<main class="wrap">
<style>{EXTRA_CSS}</style>
<p class="q-meta"><a href="/exam/{key}/">{e(name)}国家試験</a> / <a href="/q/{key}/{ex}/">第{ex}回 過去問と解説</a></p>
<h1>第{ex}回{e(name)}国家試験 {e(label(q))}</h1>
<p class="q-meta">科目: {e(q['subject'])}</p>
<div class="q-stem">{e(q['stem'])}</div>
<ol class="q-ch">{ch}</ol>
<details class="q-ans"><summary>正答と解説を見る</summary>
<p style="margin-top:12px"><b>正答: {e(ans_text(q))}</b></p>
<div class="q-exp">{e(q['explanation'])}</div>
</details>
<p class="note">問題文・選択肢・正答は{e(org)}が公表したものです。解説は「ニガテ帳」が独自に書いたもので、{e(org)}によるものではありません。誤りに気づいたらお知らせください。</p>
{B.srcs(src)}
{nav}
{related(x, q, qs)}
{app_cta(name, state, key)}
</main>"""
    return B.head(title, desc, url, ld) + body + B.FOOT


def index_page(x, qs):
    key, name, _, ex, org, lic, state = x
    url = f"{BASE}/q/{key}/{ex}/"
    title = f"第{ex}回{name}国家試験 過去問と解説(全{len(qs)}問)"
    desc = f"第{ex}回{name}国家試験の問題を1問ずつ、正答と選択肢ごとの解説つきで載せています。科目別に並べています。"
    ld = {"@context": "https://schema.org", "@type": "CollectionPage", "url": url, "name": title,
          "description": desc, "inLanguage": "ja", "dateModified": B.UPDATED}
    rows = []
    cur = None
    for q in qs:
        if q["subject"] != cur:
            if cur is not None:
                rows.append("</ul>")
            cur = q["subject"]
            rows.append(f"<h2>{e(cur)}</h2><ul class=\"q-list\">")
        rows.append(f'<li><a href="/q/{key}/{ex}/{q["id"]}/">{e(label(q))}</a> '
                    f'<span class="q-meta">{e(re.sub(r"[ 　]+", " ", q["stem"])[:48])}…</span></li>')
    rows.append("</ul>")
    body = f"""<main class="wrap">
<style>{EXTRA_CSS}</style>
<p class="q-meta"><a href="/exam/{key}/">{e(name)}国家試験</a></p>
<h1>{e(title)}</h1>
<p>{e(desc)} 図を使う問題と、正答が公表されなかった問題は載せていません。</p>
{app_cta(name, state, key)}
{''.join(rows)}
{B.srcs([(f"{org} 第{ex}回{name}国家試験", qs[0]["source"]), lic])}
</main>"""
    return B.head(title, desc, url, ld) + body + B.FOOT


def main():
    urls = []
    for x in EXAMS:
        key, name, path, ex = x[0], x[1], x[2], x[3]
        allq = json.load(open(os.path.join(APPDIR, path), encoding="utf-8"))
        qs = [q for q in allq if q["exam"] == ex and not q.get("excluded") and not q.get("figure")
              and q.get("explanation") and q.get("answer")]
        order = {"午前": 0, "午後": 1}
        qs.sort(key=lambda q: (order.get(q["session"], 2), q.get("session_no") or q["no"]))
        for i, q in enumerate(qs):
            d = os.path.join(ROOT, "q", key, str(ex), q["id"])
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n") as f:
                f.write(page(x, q, qs[i - 1] if i else None, qs[i + 1] if i + 1 < len(qs) else None, qs))
            urls.append(f"{BASE}/q/{key}/{ex}/{q['id']}/")
        bysub = sorted(qs, key=lambda q: (x and 0, [s for s in dict.fromkeys(p["subject"] for p in qs)].index(q["subject"])))
        with open(os.path.join(ROOT, "q", key, str(ex), "index.html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(index_page(x, bysub))
        urls.insert(0, f"{BASE}/q/{key}/{ex}/")
        print(key, ex, len(qs))
    sm = os.path.join(ROOT, "sitemap.xml")
    s = open(sm, encoding="utf-8").read()
    s = re.sub(r"<url><loc>[^<]*/q/[^<]*</loc>[^\n]*\n", "", s)
    add = "".join(f"<url><loc>{u}</loc><lastmod>{B.UPDATED}</lastmod></url>\n" for u in urls)
    s = s.replace("</urlset>", add + "</urlset>")
    open(sm, "w", encoding="utf-8", newline="\n").write(s)
    print("sitemap +", len(urls))


if __name__ == "__main__":
    main()
