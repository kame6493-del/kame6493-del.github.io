"""blog/tester-box.html を blog/*.html(index 含む)の本文の終わり(広告の前)に入れる。何度走らせても同じ(マーカーで置換)。"""
import re
from pathlib import Path
HERE = Path(__file__).resolve().parent
BOX = (HERE / 'blog' / 'tester-box.html').read_text(encoding='utf-8')
MARK = re.compile(r'<!--tester-box-->.*?<!--/tester-box-->\n?', re.S)
n = 0
for f in sorted((HERE / 'blog').glob('*.html')):
    if f.name == 'tester-box.html':
        continue
    t = f.read_text(encoding='utf-8')
    if '<!--tester-box-->' in t:
        t = MARK.sub(lambda m: BOX, t)
    else:
        i = t.find("<div class='admax'")
        if i < 0:
            print('skip', f.name); continue
        t = t[:i] + BOX + t[i:]
    f.write_text(t, encoding='utf-8', newline='\n'); n += 1
print(n, 'files')
