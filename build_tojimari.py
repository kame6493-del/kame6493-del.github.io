# -*- coding: utf-8 -*-
"""トジマリの紹介ページ(/tojimari/)と、設定の手順のページ5枚(/tojimari/guide/<名前>/)を書き出す。python build_tojimari.py
手順は、アプリの data(Downloads/スマホお金まもり_2026-10-31/data/*.json)にある、各社の公式ヘルプで確かめた物だけを使う。
出典の URL と確かめた日は、項目ごとにページへ出す。sitemap.xml・sitemap-yuru.xml に行を足す(そのあと split_sitemap.py)。"""
import html
import json
import os
import re
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.normpath(os.path.join(ROOT, "..", "..", "スマホお金まもり_2026-10-31"))
BASE = "https://yurustudio.github.io"
DAY = "2026-10-31"
TEST_URL = "https://play.google.com/apps/testing/jp.tojimari.app"
GROUP_URL = "https://groups.google.com/g/nigatecho-testers"
e = lambda s: html.escape(str(s), quote=True)

CHECKS, SVC = {}, {}
for fn in ("services_a.json", "services_b.json"):
    for s in json.load(open(os.path.join(APP, "data", fn), encoding="utf-8"))["services"]:
        for c in s["checks"]:
            CHECKS[c["id"]] = c; SVC[c["id"]] = s["name"]
STATS = {x["id"]: x for x in json.load(open(os.path.join(APP, "data", "facts.json"), encoding="utf-8"))["stats"]}

CSS = """
:root{--bg:#eef5f6;--ink:#0c2a33;--sub:#3d5a63;--line:#cfe0e3;--card:#fff;--mint:#0f9f7f;--deep:#022a3d;--warn:#b8432c}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:"Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif;line-height:1.85;font-size:17px}
a{color:#0b6f8a}header.top{background:linear-gradient(160deg,#012233,#06485f);color:#fff;padding:14px 16px}
header.top a{color:#fff;text-decoration:none;display:flex;align-items:center;gap:10px;max-width:760px;margin:0 auto}header.top img{border-radius:10px}
header.top b{letter-spacing:.12em;font-size:18px}header.top small{opacity:.8;font-size:13px}
main{max-width:760px;margin:0 auto;padding:22px 16px 48px}h1{font-size:25px;line-height:1.5;margin:6px 0 12px}
h2{font-size:20px;margin:34px 0 10px;padding-top:6px;border-top:2px solid var(--line)}p.lead{color:var(--sub)}
.crumb{font-size:13px;color:var(--sub)}.crumb a{color:var(--sub)}
.stat{background:#fff;border-left:4px solid var(--warn);padding:12px 14px;border-radius:6px;font-size:15px;margin:18px 0}
.stat small{display:block;color:var(--sub);font-size:12px;margin-top:4px}
.ck{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 16px 12px;margin:16px 0}
.ck h3{margin:0 0 4px;font-size:19px}.ck .svc{font-size:13px;color:var(--mint);font-weight:700;letter-spacing:.06em}
.ck ol{margin:10px 0;padding-left:1.4em}.ck li{margin:3px 0}.ck .done{background:#e6f6f1;border-radius:8px;padding:6px 10px;font-size:15px}
.ck .why{color:var(--warn);font-size:15px;margin:8px 0 0}.ck .note{color:var(--sub);font-size:14px;margin:6px 0 0}
.ck .src{font-size:12.5px;color:var(--sub);margin:10px 0 0;word-break:break-all}
.box{background:var(--deep);color:#e8f6f4;border-radius:16px;padding:20px 18px;margin:34px 0 10px}
.box h2{border:0;margin:0 0 8px;color:#fff;padding:0}.box p{margin:8px 0}.box a{color:#7ff0cf}
.box .btn{display:inline-block;background:#5ff0c4;color:#022a3d;font-weight:700;text-decoration:none;border-radius:999px;padding:10px 20px;margin:6px 8px 0 0}
.box .btn.line{background:transparent;color:#7ff0cf;border:1px solid #7ff0cf}
.box ol{padding-left:1.3em;margin:8px 0}.shots{display:flex;gap:10px;margin:16px 0;overflow:hidden}.shots img{width:32%;height:auto;border-radius:12px;border:1px solid var(--line)}
.guides{list-style:none;padding:0}.guides li{margin:8px 0}.guides a{display:block;background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 14px;text-decoration:none;color:var(--ink)}
.guides small{display:block;color:var(--sub);font-size:13px}.fine{font-size:13px;color:var(--sub)}
footer{max-width:760px;margin:0 auto;padding:0 16px 40px;font-size:13px;color:var(--sub)}
"""

GUIDES = [
    {"slug": "paypay", "title": "PayPay の乗っ取り・不正利用に備える設定5つ(公式ヘルプの手順)",
     "h1": "PayPay の乗っ取り・不正利用に備える設定5つ",
     "desc": "PayPay の利用可能額の上限、開く時の顔・指紋の認証、ログイン中の端末、登録した口座・カード、オートチャージの中身。PayPay 公式のヘルプで確かめた手順を、画面の言葉のまま1行ずつ並べました。",
     "lead": ["PayPay の不正利用の話を見て、自分のアカウントは大丈夫かと気になった人に向けて、PayPay の公式ヘルプに書かれている設定の手順を並べました。",
              "どれも、自分の PayPay アプリの画面で確かめる物です。ここに暗証番号やパスワードを書く所はありません。上限の金額は、ふだん使う分に合わせて選んでください。"],
     "stat": "phishing_reports", "sections": [("", ["paypay_limit", "paypay_device_auth", "paypay_devices", "paypay_payment_methods", "paypay_autocharge"])]},
    {"slug": "line", "title": "LINE の乗っ取りを防ぐ設定6つ(公式ヘルプの手順)",
     "h1": "LINE の乗っ取りを防ぐ設定6つ",
     "desc": "LINE のログイン許可、パスコードロック、ログイン中の端末、メールアドレスとパスワードの登録、ログインの通知。LINE の公式ヘルプと使い方ガイドで確かめた手順を1行ずつ並べました。",
     "lead": ["LINE の公式ガイド「LINEの乗っ取り被害を防ぐために!確認しておきたい3つのこと」では、ログイン中の端末と、ログインの通知を見ておくよう案内されています。",
              "ここでは、LINE 公式のヘルプとガイドに書かれた設定を6つ並べました。上の2つは1分ほどで済みます。PC や iPad で LINE を使っている人は、ログイン許可をオフにすると入れなくなるので、注意書きを読んでから決めてください。"],
     "stat": "phishing_reports", "sections": [("", ["line_login_allow", "line_passcode", "line_devices", "line_email", "line_password", "line_login_notice"])]},
    {"slug": "oya", "title": "親のスマホで一緒に確かめたい設定(iPhone・Android・LINE)",
     "h1": "親のスマホで、一緒に確かめたい設定",
     "desc": "帰省のときなどに、親のスマホを手元に置いて一緒に見られる設定の一覧。画面ロック、OS の更新、端末を探す機能、2ファクタ認証・2段階認証、LINE のパスコードロック。Apple・Google・LINE の公式ヘルプで確かめた手順です。",
     "lead": ["親のスマホの設定を、離れて暮らしていると確かめる機会がなかなかありません。会った時に、親のスマホを手元に置いて、この順番で一緒に見ていくための一覧です。",
              "パスコードや暗証番号は、親のスマホの画面に親が自分で入れます。聞き出したり、どこかに書き残したりはしないでください。どれも1〜3分ほどです。"],
     "stat": "tokushu_sagi",
     "sections": [("iPhone の場合", ["iphone_passcode", "iphone_auto_update", "iphone_findmy", "apple_2fa"]),
                  ("Android の場合", ["android_screen_lock", "android_system_update", "android_unknown_apps", "google_2sv"]),
                  ("LINE を使っているなら", ["line_passcode", "line_login_allow"])]},
    {"slug": "google-2sv", "title": "Google アカウントの2段階認証の確かめ方と、あわせて見たい設定",
     "h1": "Google アカウントの2段階認証と、あわせて見たい設定",
     "desc": "Google アカウントの2段階認証プロセスがオンかの確かめ方、セキュリティ診断、再設定用の電話番号とメール、ログインしている端末、パスキー、つながっている他社のアプリ。Google アカウント ヘルプで確かめた手順です。",
     "lead": ["Android のスマホも Gmail も YouTube も、同じ Google アカウントでログインしていることが多いので、まずはここの守りを見ておくと安心です。",
              "まず2段階認証プロセスがオンになっているかを見て、そのあとにセキュリティ診断で残っているおすすめを確かめる、という順番が分かりやすいです。手順は Google アカウント ヘルプに書かれている物だけを使いました。"],
     "stat": "phishing_reports", "sections": [("", ["google_2sv", "google_security_checkup", "google_recovery", "google_devices", "google_passkey", "google_linked_apps"])]},
    {"slug": "iphone-tonan", "title": "iPhone の「盗難デバイスの保護」をオンにする手順と、先に要る設定",
     "h1": "iPhone の「盗難デバイスの保護」をオンにする",
     "desc": "iOS 17.3 以降の「盗難デバイスの保護」がオンかの確かめ方と、使うために先にオンにしておく2ファクタ認証・「探す」、画面ロックのパスコード。Apple サポートで確かめた手順です。",
     "lead": ["「盗難デバイスの保護」は、iPhone を盗まれてパスコードまで知られてしまった時に、大事な設定を変えられないようにするための iPhone の機能です(iOS 17.3 以降)。",
              "Apple サポートによると、使うには2ファクタ認証と「探す」などがオンになっている必要があります。先に盗難デバイスの保護を見て、オンにできなかった時は下の3つを確かめてください。"],
     "stat": None, "sections": [("", ["iphone_stolen_device"]), ("先にオンにしておく設定", ["apple_2fa", "iphone_findmy", "iphone_passcode"])]},
]


def ck_html(cid, n):
    c = CHECKS[cid]; src = c["source"]
    steps = "".join(f"<li>{e(s)}</li>" for s in c["steps"])
    why_src = c.get("why_source")
    extra = f'<br>注意の文の出典: {e(why_src["publisher"])} <a href="{e(why_src["url"])}" rel="nofollow noopener">{e(why_src["url"])}</a>(確かめた日 {e(why_src["checked"])})' if why_src else ""
    return f"""<section class="ck" id="{e(cid)}"><div class="svc">{e(SVC[cid])}・目安{c.get('minutes', 1)}分</div><h3>{n}. {e(c['title'].replace(' ', ''))}</h3>
<ol>{steps}</ol>
<p class="done">済んだ目印: {e(c['done'])}</p>
<p class="why">オフのままだと: {e(c['why'])}</p>
{f'<p class="note">{e(c["note"])}</p>' if c.get('note') else ''}
<p class="src">手順の出典: {e(src['publisher'])}「{e(src['title'])}」<a href="{e(src['url'])}" rel="nofollow noopener">{e(src['url'])}</a>(確かめた日 {e(src['checked'])}){extra}</p></section>"""


def stat_html(sid):
    if not sid: return ""
    s = STATS[sid]
    v = s["value"] + (f"・{s['value2']}" if s.get("value2") else "")
    return f'<p class="stat">{e(s["period"])}の{e(s["label"])}: {e(v)}<small>{e(s["publisher"])}「{e(s["title"])}」<a href="{e(s["url"])}" rel="nofollow noopener">資料</a>(確かめた日 {e(s["checked"])})</small></p>'


def app_box(top=False):
    intro = "" if top else f"""<h2>この点検を、アプリで順番に</h2>
<p>トジマリは、スマホとお金まわりの設定を、ひとつずつ自分で確かめていくための Android アプリです。使っているサービスに印を付けると、このページと同じ公式ヘルプの手順が大きな字で1つずつ出て、済んだ所に印が付きます。親のスマホの分も分けて点検できます。</p>
<p>アプリは何も調べません。パスワードや暗証番号を入れる所もありません。点検の記録はスマホの中だけに残ります。</p>
<p><a class="btn line" href="/tojimari/">トジマリの紹介</a></p>"""
    return f"""<div class="box" id="tojimari">{intro}<h2 style="font-size:{19 if top else 17}px;margin-top:{0 if top else 18}px">Android 版のテスターを募集しています</h2>
<p>Google Play で一般公開するには、12人に14日間入れておいてもらうテストが要ります。いまテスト版の審査を待っているところで、通ったら下の参加ページから入れます(開けない時は数日おいてから試してください)。</p>
<ol><li><a href="{GROUP_URL}">テスター用のグループ</a>に参加する</li><li>参加ページで「テスターになる」を押す</li><li>同じページの「Google Play でダウンロード」から入れる</li></ol>
<p><a class="btn" href="{TEST_URL}">トジマリのテストに参加する</a></p></div>"""


def page(path, title, desc, body, og_img="/tojimari/img/start.jpg"):
    url = BASE + path
    return f"""<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="article"><meta property="og:site_name" content="YURU"><meta property="og:locale" content="ja_JP">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{url}">
<meta property="og:image" content="{BASE}{og_img}"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/tojimari/img/icon.png">
<style>{CSS}</style></head>
<body><header class="top"><a href="/tojimari/"><img src="/tojimari/img/icon.png" alt="" width="36" height="36"><span><b>トジマリ</b><br><small>スマホとお金の戸締まり</small></span></a></header>
<main>{body}</main>
<footer><p>このページの手順は、各社の公式ヘルプを開いて読み、書かれている順番と画面の言葉のまま写しました。画面は機種や版で変わることがあります。各社の名前は説明のために書いているだけで、トジマリは各社と関係のない、個人の開発者が作ったアプリです。</p>
<p>お問い合わせ: <a href="mailto:kame6493@gmail.com">kame6493@gmail.com</a> / <a href="/">YURU Studio のアプリ一覧</a> / <a href="/tojimari/privacy.html">トジマリのプライバシーポリシー</a></p></footer>
</body></html>
"""


def guide_list(skip=None):
    return '<ul class="guides">' + "".join(f'<li><a href="/tojimari/guide/{g["slug"]}/">{e(g["h1"])}<small>{len([c for _, cs in g["sections"] for c in cs])}項目</small></a></li>' for g in GUIDES if g["slug"] != skip) + "</ul>"


def build_guide(g):
    n, parts = 0, []
    for head, ids in g["sections"]:
        if head: parts.append(f"<h2>{e(head)}</h2>")
        for cid in ids:
            n += 1; parts.append(ck_html(cid, n))
    checked = sorted({CHECKS[c]["source"]["checked"] for _, cs in g["sections"] for c in cs})
    body = f"""<p class="crumb"><a href="/tojimari/">トジマリ</a> › 設定の手順</p>
<h1>{e(g['h1'])}</h1>
{''.join(f'<p class="lead">{e(x)}</p>' for x in g['lead'])}
{stat_html(g['stat'])}
<p class="fine">手順を確かめた日: {'・'.join(checked)}。各項目の下に、もとの公式ページの URL を載せています。</p>
{''.join(parts)}
{app_box()}
<h2>ほかの設定の手順</h2>{guide_list(g['slug'])}"""
    return page(f"/tojimari/guide/{g['slug']}/", g["title"], g["desc"], body)


def build_top():
    desc = "もし今夜、スマホを落としたら。トジマリは、画面ロック・2段階認証・ログイン中の端末など、スマホとお金まわりの設定を、公式ヘルプの手順で1つずつ自分で確かめる Android アプリです。親のスマホも一緒に点検できます。"
    body = f"""<h1>もし今夜、スマホを落としたら?</h1>
<p class="lead">画面ロックは掛かっているか。2段階認証はオンか。知らない端末からログインされていないか。気になっていても、どこを開けばいいのか分からないままになりがちです。</p>
<p>トジマリは、スマホとお金まわりの設定を、ひとつずつ自分で確かめていくための案内のアプリです。起動したら、まずスマホ本体の3つ(画面ロック・OS の更新・端末を探す機能)。手順が大きな字で1行ずつ出て、済んだら印を付けると守りの点数が上がっていきます。</p>
<div class="shots"><img src="/tojimari/img/start.jpg" alt="最初の画面「もし今夜、スマホを落としたら?」" width="480" height="1039" loading="lazy"><img src="/tojimari/img/check.jpg" alt="点検の画面。手順が1行ずつ出る" width="480" height="1039" loading="lazy"><img src="/tojimari/img/family.jpg" alt="家族の結果のカード「お母さんのスマホを守りました」" width="480" height="1039" loading="lazy"></div>
<h2>親のスマホも、一緒に</h2>
<p>家族を足すと、お父さん・お母さんのスマホを1人ずつ点検できます。親のスマホを手元に置いて、この画面と見比べながら進めます。済んだ所とまだの所は結果のカードになり、家族のグループに送れます。大きい文字のモードもあります。</p>
<h2>トジマリがしないこと</h2>
<p>スマホやアカウントの中を調べたり、危ない所を見つけたりはしません。案内だけです。パスワード・暗証番号・カード番号を入れる所はありません。点検の記録はスマホの中だけに残り、どこにも送りません。点数は、選んだサービスのおすすめの設定のうち、確かめ終えた割合で、安全を約束するものではありません。</p>
<h2>手順は公式のヘルプから</h2>
<p>手順はどれも、各社の公式ヘルプのページを開いて確かめ、確かめた日と URL をアプリの中に載せています。同じ手順の一部を、下のページでも読めます。</p>
{guide_list()}
{app_box(top=True)}"""
    return page("/tojimari/", "トジマリ - スマホとお金の戸締まり点検(Android)", desc, body)


def add_sitemap(fname, base, paths):
    p = os.path.join(ROOT, fname); s = open(p, encoding="utf-8").read()
    for path in paths:
        u = base + path
        if f"<loc>{u}</loc>" not in s:
            s = s.replace("</urlset>", f"<url><loc>{u}</loc><lastmod>{DAY}</lastmod></url>\n</urlset>")
    open(p, "w", encoding="utf-8", newline="\n").write(s)


def main():
    img = os.path.join(ROOT, "tojimari", "img"); os.makedirs(img, exist_ok=True)
    from PIL import Image
    Image.open(os.path.join(APP, "www", "img", "icon_192.png")).save(os.path.join(img, "icon.png"))
    shots = os.path.join(APP, "design", "shots", "390x844")
    for src, dst in (("01_start.png", "start.jpg"), ("02_check1.png", "check.jpg"), ("16_family_card.png", "family.jpg")):
        im = Image.open(os.path.join(shots, src)).convert("RGB"); im = im.resize((480, round(im.height * 480 / im.width)), Image.LANCZOS)
        im.save(os.path.join(img, dst), quality=84, optimize=True)
    out = {"/tojimari/": build_top()}
    for g in GUIDES: out[f"/tojimari/guide/{g['slug']}/"] = build_guide(g)
    for path, h in out.items():
        d = os.path.join(ROOT, *path.strip("/").split("/")); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n").write(h)
        print(path, len(h))
    add_sitemap("sitemap.xml", "https://kame6493-del.github.io", list(out))
    add_sitemap("sitemap-yuru.xml", BASE, list(out))


if __name__ == "__main__":
    main()
