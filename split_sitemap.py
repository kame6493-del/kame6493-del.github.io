"""sitemap.xml を1,000件ずつの小さなサイトマップに分け、sitemap_index.xml にまとめる。
Search Console で sitemap.xml が「取得できませんでした」のまま読まれないので(2026-10-09)、別の名前で出し直すためのもの。
build_*.py で sitemap.xml を書き直したあとに python split_sitemap.py を流す。"""
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
BASE = "https://kame6493-del.github.io/"
SIZE = 1000

src = open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read()
rows = re.findall(r"<url>.*?</url>", src, re.S)
out = os.path.join(ROOT, "sitemaps")
os.makedirs(out, exist_ok=True)
for f in os.listdir(out):
    if f.startswith("sm-") and f.endswith(".xml"):
        os.remove(os.path.join(out, f))

names = []
for i in range(0, len(rows), SIZE):
    name = f"sm-{i // SIZE + 1}.xml"
    with open(os.path.join(out, name), "w", encoding="utf-8", newline="\n") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        f.write("\n".join(rows[i:i + SIZE]))
        f.write("\n</urlset>\n")
    names.append(name)

last = max(re.findall(r"<lastmod>([\d-]+)</lastmod>", src) or ["2026-10-09"])
with open(os.path.join(ROOT, "sitemap_index.xml"), "w", encoding="utf-8", newline="\n") as f:
    f.write('<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
    for n in names:
        f.write(f"<sitemap><loc>{BASE}sitemaps/{n}</loc><lastmod>{last}</lastmod></sitemap>\n")
    f.write("</sitemapindex>\n")
print(len(rows), "urls ->", len(names), "files")
