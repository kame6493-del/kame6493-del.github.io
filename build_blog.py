"""開発日記: kachimake/marketing/記事/*.md を blog/<slug>.html にする。front matter の title を見出しに使う。"""
import html
import re
from pathlib import Path

import markdown

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / 'kachimake' / 'marketing' / '記事'
OUT = HERE / 'blog'
OUT.mkdir(exist_ok=True)
POSTS = [
    ('01_テスター12人の集め方.md', 'closed-test-12', '2026-10-03'),
    ('02_宣伝動画をコードで量産する.md', 'promo-video-python', '2026-10-03'),
    ('03_国試の正解の番号を数えた.md', 'kokushi-answer-numbers', '2026-10-07'),
]

PAGE = '''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}｜YURU 開発日記</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="https://kame6493-del.github.io/blog/{slug}.html">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="article">
<meta name="twitter:card" content="summary">
<style>
  :root {{ --bg: #f4f4f1; --card: #fff; --ink: #1d1d1b; --sub: #6b6b66; --line: #e2e2dc; --link: #1b3a8a; color-scheme: light; }}
  @media (prefers-color-scheme: dark) {{ :root {{ --bg: #121211; --card: #1d1d1b; --ink: #f1f1ec; --sub: #a3a39c; --line: #33332f; --link: #8fb0ff; color-scheme: dark; }} }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.85 -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif; }}
  main {{ max-width: 760px; margin: 0 auto; padding: 32px 16px 56px; }}
  article {{ background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 24px 20px; }}
  h1 {{ font-size: 23px; line-height: 1.45; margin: 0 0 6px; }}
  .date {{ color: var(--sub); font-size: 13px; margin: 0 0 20px; }}
  h2 {{ font-size: 19px; margin: 32px 0 8px; padding-top: 12px; border-top: 1px solid var(--line); }}
  a {{ color: var(--link); }}
  table {{ border-collapse: collapse; width: 100%; font-size: 14px; display: block; overflow-x: auto; }}
  th, td {{ border-bottom: 1px solid var(--line); padding: 6px 8px; text-align: left; white-space: nowrap; }}
  pre {{ background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 12px; overflow-x: auto; font-size: 13px; line-height: 1.5; }}
  code {{ font-family: ui-monospace, Consolas, monospace; font-size: 0.92em; }}
  hr {{ border: 0; border-top: 1px solid var(--line); margin: 28px 0; }}
  nav {{ margin: 0 0 16px; font-size: 14px; }}
  img {{ max-width: 100%; height: auto; border-radius: 10px; }}
</style>
</head>
<body>
<main>
<nav><a href="../">← アプリ一覧へ</a></nav>
<article>
<h1>{title}</h1>
<p class="date">{date} ・ <a href="https://x.com/apkderete">@apkderete</a></p>
{body}
</article>
</main>
</body>
</html>
'''


def build():
    items = []
    for src, slug, date in POSTS:
        text = (SRC / src).read_text(encoding='utf-8')
        m = re.match(r'^---\n(.*?)\n---\n', text, re.S)
        title = re.search(r'title:\s*"(.*)"', m.group(1)).group(1)
        body_md = text[m.end():]
        first = next(p for p in body_md.split('\n\n') if p.strip() and not p.startswith('#'))
        desc = re.sub(r'\s+', ' ', first)[:110]
        body = markdown.markdown(body_md, extensions=['tables', 'fenced_code'])
        (OUT / f'{slug}.html').write_text(PAGE.format(title=html.escape(title), desc=html.escape(desc), slug=slug, date=date, body=body), encoding='utf-8')
        items.append((slug, title, date))
    return items


if __name__ == '__main__':
    for s, t, d in build():
        print(s, t)
