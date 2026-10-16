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
    ('04_介護福祉士の科目ごとの問題数.md', 'kaigo-subject-counts', '2026-10-07'),
    ('05_管理栄養士の科目ごとの問題数.md', 'kanri-subject-counts', '2026-10-07'),
    ('06_社会福祉士の科目ごとの問題数.md', 'shakai-subject-counts', '2026-10-07'),
    ('07_国試5つの既卒の合格率.md', 'kisotsu-pass-rates', '2026-10-08'),
    ('08_精神保健福祉士の科目ごとの問題数.md', 'seishin-subject-counts', '2026-10-09'),
]

def banner(slug):
    """国試の記事だけ、iPhone の Safari で上に出る App Store のバナーを付ける(まとめ版ニガテ帳)。"""
    if slug.startswith(('kokushi', 'kaigo', 'kanri', 'shakai', 'kisotsu', 'seishin')):
        return '<meta name="apple-itunes-app" content="app-id=6818535389">\n'
    return ''


# 国試の記事の下(広告の前)に置く App Store の案内。バッジは Apple 公式のもの(/img/appstore-badge-ja.svg)を手を加えずに使う。
# 値段と「無料」の字は書かない。介護・管理栄養は試験ごとの専用ページ(カスタムプロダクトページ)へ
APP_URL = {
    'kaigo': 'https://apps.apple.com/jp/app/id6818535389?ppid=a40c3453-5460-4911-b67d-c67c16387fc0',
    'kanri': 'https://apps.apple.com/jp/app/id6818535389?ppid=21aa2359-6b3a-4735-b88f-b3416c976af5',
}


def app_box(slug):
    if not banner(slug):
        return ''
    url = APP_URL.get(slug.split('-')[0], 'https://apps.apple.com/jp/app/id6818535389')
    lead = ('この試験の過去問を、間違えた問題だけ残して解ける iPhone アプリ' if slug.split('-')[0] in ('kaigo', 'kanri', 'shakai', 'seishin')
            else '国家試験の過去問を、間違えた問題だけ残して解ける iPhone アプリ')
    return (f'<aside class="appbox"><p class="ab-t">{lead}</p>'
            '<p>「ニガテ帳」で、介護福祉士・管理栄養士・理学療法士・社会福祉士・精神保健福祉士の過去問を解けます。'
            '間違えた問題は「苦手」として残り、2回続けて正解すると消えます。</p>'
            f'<a class="ab-b" href="{url}"><img src="/img/appstore-badge-ja.svg" alt="App Store からダウンロード" width="120" height="44"></a>'
            f'<p class="ab-u"><a href="{url}">apps.apple.com/jp/app/id6818535389</a></p>'
            '<p class="ab-a">Android 版はテスト中です(<a href="/#tester">テスターの募集はこちら</a>)。</p>'
            '<p class="ab-tm">Apple、Apple のロゴは、米国およびその他の国や地域で登録された Apple Inc. の商標です。App Store は Apple Inc. のサービスマークです。</p>'
            '</aside>' + chr(10))


PAGE = '''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}｜YURU 開発日記</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="https://kame6493-del.github.io/blog/{slug}.html">
{banner}<meta property="og:title" content="{title}">
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
  .appbox {{ background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 18px 20px; margin: 20px 0 0; font-size: 15px; line-height: 1.7; }}
  .appbox p {{ margin: 0 0 8px; }}
  .ab-t {{ font-weight: 700; }}
  .ab-b {{ display: inline-flex; padding: 11px; margin: -3px 0 -11px -11px; line-height: 0; }}
  .ab-b img {{ height: 44px; width: auto; border-radius: 0; }}
  .ab-u {{ font-size: 12.5px; word-break: break-all; }} .ab-u a {{ color: var(--sub); }}
  .ab-a {{ font-size: 13px; color: var(--sub); }}
  .ab-tm {{ font-size: 11px; color: var(--sub); margin: 10px 0 0 !important; }}
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
{app}<div class='admax' style='margin:48px auto 8px;text-align:center;min-height:250px'><p style='font-size:11px;color:#8a8f98;margin:0 0 4px'>広告</p><script src='https://adm.shinobi.jp/o/72f5aae4c08445e3e0200af63f4ad85c'></script></div>
<div class="xfollow" style="margin:24px auto 8px;padding:8px 12px;max-width:560px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 12px;font-size:14px;line-height:1.5;text-align:center"><style>@media print{{.xfollow{{display:none!important}}}}</style><span>新しいアプリやゲームの話は X で → <a href="https://x.com/apkderete" target="_blank" rel="noopener" style="color:inherit;font-weight:700">@apkderete</a></span><a href="https://x.com/intent/follow?screen_name=apkderete" target="_blank" rel="noopener" style="display:inline-block;padding:4px 14px;border-radius:999px;background:#0f1419;color:#fff;font-size:13px;font-weight:700;text-decoration:none;border:1px solid rgba(255,255,255,.3)">X でフォロー</a></div>
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
        (OUT / f'{slug}.html').write_text(PAGE.format(title=html.escape(title), desc=html.escape(desc), slug=slug, date=date, body=body, banner=banner(slug), app=app_box(slug)), encoding='utf-8', newline=chr(10))
        items.append((slug, title, date))
    return items


if __name__ == '__main__':
    for s, t, d in build():
        print(s, t)
