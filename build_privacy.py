"""アプリの store/privacy.md を kame6493-del.github.io/apps/<slug>/privacy.html に変換する。
python build_privacy.py <slug> <privacy.md のパス>
問い合わせ先が空欄なら kame6493@gmail.com を入れる(ニガテ帳・カチマケと同じ窓口)。"""
import html
import os
import re
import sys

STYLE = """  :root { --paper:#fbf8f1; --ink:#23262e; --sumi:#5b5f69; --rule:#e6e0d2; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { --paper:#16171b; --ink:#ebe8e0; --sumi:#a3a6ae; --rule:#33343a; color-scheme: dark; } }
  body { margin:0; background:var(--paper); color:var(--ink); font:15px/1.8 -apple-system,"Hiragino Sans","Noto Sans JP",sans-serif; }
  main { max-width:680px; margin:0 auto; padding:24px 16px 64px; }
  h1 { font:700 20px/1.4 "Hiragino Mincho ProN","Noto Serif JP",serif; letter-spacing:.06em; padding-bottom:12px; border-bottom:1px solid var(--ink); }
  h2 { font:700 15px/1.4 "Hiragino Mincho ProN","Noto Serif JP",serif; margin:32px 0 8px; }
  h3 { font:700 14px/1.4 sans-serif; margin:20px 0 6px; }
  p, li { margin:0 0 8px; }
  a { color:inherit; word-break:break-all; }"""

MAIL = "kame6493@gmail.com"


def inline(s):
    s = html.escape(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"(https?://[^\s<)]+)", r'<a href="\1">\1</a>', s)
    s = s.replace(MAIL, f'<a href="mailto:{MAIL}">{MAIL}</a>')
    return s


def convert(md):
    out, title, in_list = [], "プライバシーポリシー", False
    lines = md.splitlines()
    for i, raw in enumerate(lines):
        line = raw.rstrip()
        if line.startswith("- ") or line.startswith("・"):
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{inline(line[2:] if line.startswith('- ') else line[1:])}</li>")
            continue
        if in_list:
            out.append("</ul>")
            in_list = False
        if not line:
            continue
        if line.startswith("# "):
            title = line[2:].strip()
            out.append(f"<h1>{inline(title)}</h1>")
        elif line.startswith("## "):
            out.append(f"<h2>{inline(line[3:])}</h2>")
        elif line.startswith("### "):
            out.append(f"<h3>{inline(line[4:])}</h3>")
        else:
            out.append(f"<p>{inline(line)}</p>")
    if in_list:
        out.append("</ul>")
    body = "\n".join(out)
    # 問い合わせ先が空欄の版には窓口を足す
    if MAIL not in md:
        body += f'\n<h2>お問い合わせ</h2>\n<p><a href="mailto:{MAIL}">{MAIL}</a></p>'
    return title, body


def main():
    slug, src = sys.argv[1], sys.argv[2]
    md = open(src, encoding="utf-8").read()
    # 「【公開前に記入…】」のような記入欄は窓口のメールに置き換える
    md = re.sub(r"[【(（][^】)）]*(記入|入れる|アドレス)[^】)）]*[】)）]", MAIL, md)
    title, body = convert(md)
    d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "apps", slug)
    os.makedirs(d, exist_ok=True)
    page = f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<style>
{STYLE}
</style>
</head>
<body>
<main>
{body}
</main>
</body>
</html>
"""
    open(os.path.join(d, "privacy.html"), "w", encoding="utf-8", newline="\n").write(page)
    print(f"https://kame6493-del.github.io/apps/{slug}/privacy.html")


if __name__ == "__main__":
    main()
