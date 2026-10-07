# -*- coding: utf-8 -*-
"""古文単語1語1ページ(/kobun/<id>/)と一覧(/kobun/)を書き出す。python build_kobun.py
中身はアプリ「こぶんめくり」の本編601語(重要度順)。敬語・助動詞のセットは載せない(アプリの完全版)。
例文は著作権の切れた古典の本文(ウィキソース所収の翻刻)から引いて新字体に改めたもの。意味・解説・現代語訳はアプリで書いたもの。
sitemap.xml の /kobun/ の行も書き直す。"""
import json
import os
import re

import build_exam as B

e = B.e
ROOT = B.ROOT
BASE = B.BASE
WORDS = r"C:\Users\yuichi1\Downloads\こぶんめくり_2026-10-03\app\public\data\words.json"
UPDATED = B.UPDATED

CSS = """
.k-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.k-w{font-size:2.1rem;font-weight:800;margin:4px 0}
.k-meta{color:#7a6f5c;font-size:.92rem}
ol.k-means{font-size:1.1rem;line-height:1.9;padding-left:1.4em}
.k-ex{border-left:4px solid #c8553d;background:#fff;border-radius:10px;padding:12px 14px;margin:10px 0}
.k-ex .t{font-size:1.08rem;line-height:1.9}
.k-ex mark{background:#ffe08a;padding:0 2px}
.k-ex .tr{color:#4a4338;margin-top:6px}
.k-ex .src{color:#7a6f5c;font-size:.88rem;margin-top:4px}
.k-nav{display:flex;justify-content:space-between;gap:10px;margin:22px 0;flex-wrap:wrap}
.k-nav a{border:1px solid #d8cfba;border-radius:999px;padding:8px 16px;text-decoration:none}
.k-cta{border-radius:16px;background:#f3ede0;padding:16px 18px;margin:26px 0}
ul.k-list{list-style:none;padding:0;columns:2;column-gap:28px}
@media (max-width:600px){ul.k-list{columns:1}}
ul.k-list li{break-inside:avoid;border-bottom:1px solid #eee5d3;padding:6px 2px}
ul.k-list li a{text-decoration:none;font-weight:700}
"""

CTA = ('<div class="k-cta"><p><b>古文単語アプリ「こぶんめくり」</b><br>'
       '601語を重要度順に、本文の中の一文で意味を当てて覚える単語帳です。試験日から1日の語数を逆算し、'
       '覚えた語は1日後・3日後・1週間後にもう一度出ます。間違えた語だけが一覧に残り、2回続けて正解すると消えます。敬語42語・助動詞28語のセットもあります。</p>'
       '<div class="btns"><a class="btn ghost" href="https://play.google.com/apps/testing/jp.kobunmekuri.app">Android テスト版に参加</a></div>'
       '<p class="note" style="margin-top:8px">iPhone 版は App Store の審査中です。Android 版はテスト中で、参加ページで「テスターになる」を押すと使えます。</p></div>')
NOTE = ('<p class="note">例文は、著作権の切れた古典の本文(ウィキソース所収の翻刻)から引き、字体を新字体に改めました。'
        '意味・解説・現代語訳は「こぶんめくり」で書いたものです。誤りに気づいたらお知らせください。</p>')


def ex_html(x):
    t = e(x["text"])
    h = e(x.get("hit") or "")
    if h and h in t:
        t = t.replace(h, f"<mark>{h}</mark>", 1)
    return (f'<div class="k-ex"><div class="t">{t}</div><div class="tr">訳: {e(x.get("tr", ""))}</div>'
            f'<div class="src">{e(x.get("src", ""))}</div></div>')


def page(w, prev, nxt):
    url = f"{BASE}/kobun/{w['id']}/"
    kanji = f"({w['kanji']})" if w.get("kanji") and w["kanji"] != w["w"] else ""
    title = f"「{w['w']}」{kanji}の意味と例文|古文単語 重要度{w['rank']}位"
    desc = f"古文単語「{w['w']}」{kanji}({w['pos']})の意味: {'・'.join(w['means'][:3])}。{w['ex'][0].get('src','')}の例文と現代語訳つき。"
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "DefinedTerm", "name": w["w"], "alternateName": w.get("kanji") or None, "description": "・".join(w["means"]),
         "inDefinedTermSet": {"@type": "DefinedTermSet", "name": "古文単語601(こぶんめくり)", "url": f"{BASE}/kobun/"}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "古文単語601", "item": f"{BASE}/kobun/"},
            {"@type": "ListItem", "position": 2, "name": w["w"], "item": url}]}]}
    means = "".join(f"<li>{e(m)}</li>" for m in w["means"])
    exs = "".join(ex_html(x) for x in w.get("ex", []))
    nav = '<div class="k-nav">'
    nav += f'<a href="/kobun/{prev["id"]}/">← {e(prev["w"])}</a>' if prev else "<span></span>"
    nav += '<a href="/kobun/">601語の一覧</a>'
    nav += f'<a href="/kobun/{nxt["id"]}/">{e(nxt["w"])} →</a>' if nxt else "<span></span>"
    nav += "</div>"
    body = f"""<main class="wrap">
<style>{CSS}</style>
<p class="k-meta"><a href="/kobun/">古文単語601</a> / 重要度{w['rank']}位</p>
<div class="k-head"><h1 class="k-w">{e(w['w'])}</h1><span class="k-meta">{e(w.get('kanji') or '')} ・ {e(w['pos'])} ・ {e(w.get('cat') or '')}</span></div>
<h2>意味</h2>
<ol class="k-means">{means}</ol>
<h2>覚え方</h2>
<p>{e(w.get('note') or '')}</p>
<h2>例文</h2>
{exs}
{NOTE}
{nav}
{CTA}
</main>"""
    return B.head(title, desc, url, ld) + body + B.FOOT


def index(ws, gs=()):
    url = f"{BASE}/kobun/"
    title = "古文単語601 意味と例文の一覧(重要度順)"
    desc = "大学受験の古文単語601語を重要度順に、意味・覚え方・本文の例文と現代語訳つきで1語ずつ載せています。"
    ld = {"@context": "https://schema.org", "@type": "DefinedTermSet", "name": "古文単語601(こぶんめくり)", "url": url, "inLanguage": "ja"}
    rows = []
    for start in range(0, len(ws), 50):
        part = ws[start:start + 50]
        rows.append(f"<h2>重要度 {part[0]['rank']}〜{part[-1]['rank']}位</h2><ul class=\"k-list\">")
        for w in part:
            rows.append(f'<li><a href="/kobun/{w["id"]}/">{e(w["w"])}</a> <span class="k-meta">{e(w["means"][0])}</span></li>')
        rows.append("</ul>")
    body = f"""<main class="wrap">
<style>{CSS}</style>
<h1>{e(title)}</h1>
<p>{e(desc)} 1語ごとのページでは、意味の一覧と覚え方、源氏物語・徒然草・枕草子などの一文を現代語訳つきで読めます。</p>
{CTA}
<h2>品詞ごと</h2><p>{" / ".join(f'<a href="/kobun/pos/{slug}/">{e(name)}({len(g)}語)</a>' for kind, name, slug, g in gs if kind == "pos")}</p>
<h2>意味のジャンルごと</h2><p>{" / ".join(f'<a href="/kobun/cat/{slug}/">{e(name)}({len(g)}語)</a>' for kind, name, slug, g in gs if kind == "cat")}</p>
{''.join(rows)}
{NOTE}
</main>"""
    return B.head(title, desc, url, ld) + body + B.FOOT


POS_SLUG = {"名詞": "meishi", "形容詞": "keiyoushi", "動詞": "doushi", "副詞": "fukushi", "形容動詞": "keiyoudoushi", "連語": "rengo"}


def group_page(kind, name, slug, ws):
    url = f"{BASE}/kobun/{kind}/{slug}/"
    if kind == "pos":
        title = f"古文単語の{name}の一覧({len(ws)}語・意味と例文つき)"
        desc = f"大学受験の古文単語601語のうち、{name}の{len(ws)}語を重要度順に並べました。1語ずつ意味・覚え方・本文の例文と現代語訳を見られます。"
    else:
        title = f"「{name}」の古文単語({len(ws)}語・意味と例文つき)"
        desc = f"古文単語601語のうち、意味が「{name}」に関わる{len(ws)}語を重要度順に並べました。1語ずつ意味・覚え方・本文の例文と現代語訳を見られます。"
    ld = {"@context": "https://schema.org", "@type": "CollectionPage", "url": url, "name": title, "description": desc, "inLanguage": "ja"}
    items = "".join(f'<li><a href="/kobun/{w["id"]}/">{e(w["w"])}</a> <span class="k-meta">{e(w["pos"])}・{e("・".join(w["means"][:2]))}</span></li>' for w in ws)
    body = f"""<main class="wrap">
<style>{CSS}</style>
<p class="k-meta"><a href="/kobun/">古文単語601</a></p>
<h1>{e(title)}</h1>
<p>{e(desc)}</p>
<ul class="k-list">{items}</ul>
{NOTE}
{CTA}
</main>"""
    return url, B.head(title, desc, url, ld) + body + B.FOOT


def groups(ws):
    out = []
    for pos, slug in POS_SLUG.items():
        g = [w for w in ws if w["pos"] == pos]
        if g:
            out.append(("pos", pos, slug, g))
    cats = [c for c in dict.fromkeys(w.get("cat") for w in ws) if c and c != "その他"]
    for i, c in enumerate(sorted(cats, key=lambda c: -sum(1 for w in ws if w.get("cat") == c)), 1):
        out.append(("cat", c, f"c{i:02d}", [w for w in ws if w.get("cat") == c]))
    return out


def main():
    ws = [w for w in json.load(open(WORDS, encoding="utf-8")) if w["set"] == "main" and w.get("ex")]
    ws.sort(key=lambda w: w["rank"])
    urls = [f"{BASE}/kobun/"]
    for i, w in enumerate(ws):
        d = os.path.join(ROOT, "kobun", w["id"])
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(page(w, ws[i - 1] if i else None, ws[i + 1] if i + 1 < len(ws) else None))
        urls.append(f"{BASE}/kobun/{w['id']}/")
    gs = groups(ws)
    for kind, name, slug, g in gs:
        gurl, html = group_page(kind, name, slug, g)
        d = os.path.join(ROOT, "kobun", kind, slug)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(html)
        urls.append(gurl)
    with open(os.path.join(ROOT, "kobun", "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(index(ws, gs))
    sm = os.path.join(ROOT, "sitemap.xml")
    s = open(sm, encoding="utf-8").read()
    s = re.sub(r"<url><loc>[^<]*/kobun/[^<]*</loc>[^\n]*\n", "", s)
    s = s.replace("</urlset>", "".join(f"<url><loc>{u}</loc><lastmod>{UPDATED}</lastmod></url>\n" for u in urls) + "</urlset>")
    open(sm, "w", encoding="utf-8", newline="\n").write(s)
    print("words", len(ws), "sitemap +", len(urls))


if __name__ == "__main__":
    main()
