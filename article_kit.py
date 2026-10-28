# -*- coding: utf-8 -*-
"""記事ページの共通のひな形(2026-10-26)。カチマケの記事・開発日記(blog/)・試験の小ページ(exam/<試験>/<名前>/)に同じ形を当てる。

    python article_kit.py kachimake   … kachimake/<slug>/index.html の5本を、このひな形で書き直す(何度走らせても同じ)
    build_blog.py / build_guides.py は render() を呼んで書き出す

本文の中身(文・数字)はさわらない。見出しに id を振る・表を横スクロールの箱に入れる・画像に大きさを付ける、だけをする。
"""
import html as _html
import json
import math
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
YURU = "https://yurustudio.github.io"
KAME = "https://kame6493-del.github.io"

# アプリごとの色。生成り・ベージュの地は使わない。本文は白い地、暗い設定の人には暗い地
THEMES = {
    "kachimake": dict(  # 紺と金
        accent="#16264a", accent2="#b8862b", link="#1d4185", soft="#eef2f9", line="#dfe4ee", hd="#16264a", hd_ink="#f3d58e",
        d_bg="#0d1424", d_card="#141d33", d_soft="#18223b", d_line="#26314d", d_ink="#e8ecf4", d_sub="#b4bccd", d_accent="#e6bd63", d_link="#f0cd7d", d_hd="#0a1020",
        brand="カチマケ", brand_url="/kachimake/", icon="/kachimake/img/icon-64.webp", site="カチマケ",
    ),
    "nigatecho": dict(  # ニガテ帳の赤
        accent="#b3282f", accent2="#c9363d", link="#9e1f27", soft="#fbf0f0", line="#eadede", hd="#b3282f", hd_ink="#ffffff",
        d_bg="#141213", d_card="#1d1a1b", d_soft="#251e1f", d_line="#3a3032", d_ink="#eeeaea", d_sub="#bdb4b5", d_accent="#ff8b90", d_link="#ff9ea2", d_hd="#5a1418",
        brand="YURU", brand_url="/", icon="/img/nigatecho-icon-64.webp", site="YURU",
    ),
    "yuru": dict(  # 開発日記(アプリに依らない記事)
        accent="#24527a", accent2="#3a78ad", link="#1f5a92", soft="#eef4f9", line="#dde5ee", hd="#1d3f5e", hd_ink="#ffffff",
        d_bg="#121619", d_card="#191e23", d_soft="#1d252d", d_line="#2c353f", d_ink="#e9edf1", d_sub="#b0b8c2", d_accent="#8db7e0", d_link="#9cc4ec", d_hd="#13293d",
        brand="YURU", brand_url="/", icon="/img/nigatecho-icon-64.webp", site="YURU",
    ),
}

CSS = """
:root{--bg:#fff;--card:#fff;--ink:#1d222b;--sub:#4a5262;--mute:#6b7383;--line:%(line)s;--soft:%(soft)s;--accent:%(accent)s;--accent2:%(accent2)s;--link:%(link)s;--hd:%(hd)s;--hd-ink:%(hd_ink)s;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:%(d_bg)s;--card:%(d_card)s;--ink:%(d_ink)s;--sub:%(d_sub)s;--mute:%(d_sub)s;--line:%(d_line)s;--soft:%(d_soft)s;--accent:%(d_accent)s;--accent2:%(d_accent)s;--link:%(d_link)s;--hd:%(d_hd)s;color-scheme:dark}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%%;scroll-padding-top:16px}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.9 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI","Meiryo",sans-serif;letter-spacing:.02em;overflow-wrap:anywhere;word-break:normal;line-break:strict}
a{color:var(--link);text-underline-offset:.18em;text-decoration-thickness:1px}
a:hover{text-decoration-thickness:2px}
img{max-width:100%%;height:auto}
.wrap{max-width:720px;margin:0 auto;padding:0 16px}
.sh{background:var(--hd);color:var(--hd-ink)}
.sh-in{max-width:1040px;margin:0 auto;padding:0 16px;min-height:56px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.sh-logo{display:flex;align-items:center;gap:10px;color:var(--hd-ink);text-decoration:none;font-weight:800;font-size:17px;letter-spacing:.04em}
.sh-logo img{width:30px;height:30px;border-radius:8px;display:block}
.sh nav{display:flex;gap:4px 16px;flex-wrap:wrap;justify-content:flex-end}
.sh nav a{color:var(--hd-ink);opacity:.92;text-decoration:none;font-size:13.5px;padding:10px 0}
.crumb{margin:22px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:0 .5em;font-size:13px;line-height:1.7;color:var(--mute)}
.crumb li+li::before{content:"›";margin-right:.5em;color:var(--mute)}
.crumb a{color:var(--mute);text-decoration:none}
.crumb a:hover{text-decoration:underline}
.ah{padding:6px 0 4px}
.ah h1{font-size:clamp(25px,5.4vw,34px);line-height:1.45;font-weight:800;letter-spacing:.01em;margin:14px 0 18px;text-wrap:pretty}
.meta{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;font-size:13.5px;color:var(--mute);margin:0 0 6px}
.meta time{font-variant-numeric:tabular-nums}
.rt::before{content:"";display:inline-block;width:.9em;height:.9em;margin-right:.35em;vertical-align:-.1em;border:2px solid currentColor;border-radius:50%%}
.for{margin:18px 0 0;padding:14px 18px;border-radius:12px;background:var(--soft);font-size:15px;line-height:1.75;color:var(--sub)}
.for b{display:block;font-size:12.5px;letter-spacing:.08em;color:var(--accent);margin-bottom:2px}
.toc{margin:28px 0 8px;padding:18px 20px 16px;border:1px solid var(--line);border-radius:12px;background:var(--card)}
.toc p{margin:0 0 6px;font-weight:800;font-size:14px;letter-spacing:.08em;color:var(--accent)}
.toc ol{margin:0;padding:0;list-style:none;counter-reset:t}
.toc li{counter-increment:t;position:relative;padding:5px 0 5px 2em;font-size:15px;line-height:1.6;border-top:1px dashed var(--line)}
.toc li:first-child{border-top:0}
.toc li::before{content:counter(t);position:absolute;left:0;top:6px;width:1.45em;height:1.45em;border-radius:50%%;background:var(--accent);color:var(--bg);font-size:11.5px;line-height:1.45em;text-align:center;font-weight:700}
.toc a{color:var(--ink);text-decoration:none}
.toc a:hover{color:var(--link);text-decoration:underline}
.prose{margin-top:30px}
.prose>p,.prose li{color:var(--ink)}
.prose p{margin:0 0 1.35em}
.prose h2{font-size:clamp(21px,4.2vw,25px);line-height:1.5;font-weight:800;margin:2.6em 0 .9em;padding:.15em 0 .15em .75em;border-left:5px solid var(--accent);text-wrap:pretty}
.prose h3{font-size:clamp(18px,3.6vw,20px);line-height:1.55;font-weight:800;margin:2em 0 .7em;padding-bottom:.35em;border-bottom:1px solid var(--line)}
.prose h2+h3{margin-top:1.2em}
.prose ul,.prose ol{margin:0 0 1.4em;padding-left:1.5em}
.prose li{margin:.35em 0}
.prose li::marker{color:var(--accent)}
.prose hr{border:0;border-top:1px solid var(--line);margin:2.4em 0}
.prose strong,.prose b{font-weight:700;background:linear-gradient(transparent 62%%,color-mix(in srgb,var(--accent2) 22%%,transparent) 0)}
.prose blockquote,.prose .ex,.prose .note,.prose .lead,.prose .disc{margin:0 0 1.4em;padding:14px 18px;background:var(--soft);border-left:4px solid var(--accent2);border-radius:0 10px 10px 0;font-size:15.5px;line-height:1.8;color:var(--sub)}
.prose blockquote p:last-child{margin-bottom:0}
.prose .ex code,.prose code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.9em;background:var(--soft);padding:.1em .35em;border-radius:5px;color:var(--ink)}
.prose .ex code{background:transparent;padding:0}
.prose pre{margin:0 0 1.4em;padding:14px 16px;background:#1b2130;color:#e6e9f0;border-radius:10px;overflow-x:auto;font-size:13.5px;line-height:1.6}
.prose pre code{background:none;color:inherit;padding:0;font-size:inherit}
.prose .src{display:block;margin:-.4em 0 1.4em;font-size:12.5px;line-height:1.7;color:var(--mute)}
.prose .src a{color:var(--mute)}
.tbl{margin:0 0 1.5em;overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--line);border-radius:10px}
.tbl table{border-collapse:collapse;width:100%%;font-size:14.5px;line-height:1.6;font-variant-numeric:tabular-nums}
.tbl th,.tbl td{padding:9px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}
.tbl th{background:var(--soft);font-weight:700;white-space:nowrap;color:var(--ink)}
.tbl tr:last-child td{border-bottom:0}
.tbl td{white-space:nowrap}.tbl td:first-child{white-space:normal;min-width:7.5em}
.prose figure{margin:1.8em 0}
.prose figure img,.prose p>img{display:block;margin:0 auto;border-radius:10px;border:1px solid var(--line);background:#fff}
.prose figcaption{margin-top:8px;font-size:13px;line-height:1.6;color:var(--mute);text-align:center}
.prose dl{margin:0 0 1.4em}.prose dt{font-weight:700}.prose dd{margin:0 0 .8em 0;color:var(--sub)}
.app{margin:56px 0 0;border:1px solid var(--line);border-radius:18px;background:var(--card);overflow:hidden}
.app-h{margin:0;padding:10px 20px;background:var(--soft);font-size:12.5px;font-weight:700;letter-spacing:.08em;color:var(--accent)}
.app-in{display:grid;grid-template-columns:132px 1fr;gap:20px;padding:20px}
.app-shot img{display:block;width:132px;height:auto;border-radius:16px;border:1px solid var(--line)}
.app-n{display:flex;align-items:center;gap:10px;margin:0 0 8px;font-weight:800;font-size:18px;line-height:1.4}
.app-n img{width:36px;height:36px;border-radius:9px;border:1px solid var(--line)}
.app-n small{display:block;font-weight:400;font-size:12.5px;color:var(--mute)}
.app-lead{margin:0 0 10px;font-size:15.5px;line-height:1.75;font-weight:700;color:var(--ink)}
.app-more{margin:0 0 14px;font-size:13.5px;line-height:1.75;color:var(--sub)}
.app-btns{grid-column:2;display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:-6px}
.app-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border-radius:999px;background:var(--accent);color:var(--bg)!important;font-weight:700;font-size:15px;text-decoration:none;line-height:1.3;text-align:center}
.app-btn.gp{background:#1a1a1a;color:#fff!important}
.app-btn.ghost{background:transparent;color:var(--link)!important;border:1.5px solid var(--line)}
.as-b{display:inline-flex;align-items:center;padding:6px 0;line-height:0}
.as-b img{height:44px;width:auto;display:block}
.app-u{margin:8px 0 0;font-size:12px;word-break:break-all;color:var(--mute)}
.app-u a{color:var(--mute)}
.app-c{margin:6px 0 0;font-size:13px;color:var(--sub)}
.app-c b{color:var(--accent);margin-left:.4em}
.app-f{margin:0;padding:12px 20px 16px;border-top:1px solid var(--line);font-size:12px;line-height:1.7;color:var(--mute)}
.app-f p{margin:0 0 4px}
.ua-ios .nc-and,.ua-and .nc-ios{display:none!important}
.rel{margin:48px 0 0}
.rel h2{font-size:18px;margin:0 0 12px;font-weight:800}
.rel ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.rel a{display:block;padding:14px 16px;border:1px solid var(--line);border-radius:12px;text-decoration:none;color:var(--ink);background:var(--card)}
.rel a:hover{border-color:var(--accent)}
.rel span{display:block;font-size:12px;color:var(--accent);font-weight:700;letter-spacing:.04em}
.rel strong{display:block;font-size:15.5px;line-height:1.55;margin-top:2px}
.extra{margin-top:24px}
.sf{margin-top:56px;background:var(--soft);border-top:1px solid var(--line);padding:28px 0 40px;font-size:13.5px;line-height:1.8;color:var(--sub)}
.sf p{margin:0 0 8px}
.sf nav{display:flex;flex-wrap:wrap;gap:4px 18px;margin-bottom:12px}
.sf a{color:var(--sub)}
@media (max-width:560px){body{font-size:16.5px;line-height:1.85}.app-in{grid-template-columns:96px 1fr;gap:14px;padding:16px}.app-shot img{width:96px;border-radius:12px}.app-btn{width:100%%}.app-btns{grid-column:1/-1;margin-top:0}.sh nav a.opt{display:none}.toc{padding:16px}}
@media print{.sh,.app,.rel,.extra,.sf,.toc{display:none}}
"""

UA_JS = ('<script>(function(){var u=navigator.userAgent||"",r=document.documentElement;'
         'if(/iPhone|iPad|iPod/.test(u)||(/Macintosh/.test(u)&&navigator.maxTouchPoints>1))r.classList.add("ua-ios");else if(/Android/.test(u))r.classList.add("ua-and");'
         'var c=document.querySelectorAll("[data-exam]");for(var i=0;i<c.length;i++){var d=Math.ceil((new Date(c[i].getAttribute("data-exam")+"T00:00:00+09:00")-Date.now())/864e5),n=c[i].querySelector("b");if(n&&d>0)n.textContent="あと"+d+"日";}})();</script>')

# ---------------------------------------------------------------------------
# 記事の一覧(関連記事を選ぶのに使う)。path はサイトの頭からの場所
# ---------------------------------------------------------------------------
REGISTRY = [
    # カチマケ
    dict(path="/kachimake/shushihyo/", theme="kachimake", label="収支の記録", title="パチンコ・パチスロの収支表のつけ方", tags={"pachi", "kiroku"}),
    dict(path="/kachimake/kaishuritsu/", theme="kachimake", label="回収率", title="回収率の出し方(パチスロ・競馬)", tags={"pachi", "keiba", "kaishu"}),
    dict(path="/kachimake/koyaku/", theme="kachimake", label="スロット", title="スロットの小役カウンターの使い方と、小役確率の見方", tags={"pachi", "slot"}),
    dict(path="/kachimake/keiba-shushi/", theme="kachimake", label="競馬", title="競馬の収支のつけ方(年間・券種ごとの集計)", tags={"keiba", "kiroku", "kaishu"}),
    dict(path="/kachimake/nenkan-shushi/", theme="kachimake", label="年間収支", title="パチンコ・スロット・競馬の年間収支と確定申告(国税庁のページの整理)", tags={"pachi", "keiba", "kiroku"}),
    # 国家試験(ニガテ帳)
    dict(path="/blog/kaigo-39-kakomon.html", theme="nigatecho", label="介護福祉士", title="介護福祉士 第39回に向けた過去問の回し方", tags={"kaigo", "kakomon"}),
    dict(path="/blog/rinsho-gazou-mondai.html", theme="nigatecho", label="臨床検査技師", title="臨床検査技師国試の画像問題(心電図・顕微鏡写真)の勉強のしかた", tags={"rinsho", "kakomon"}),
    dict(path="/blog/kanri-nigate-kamoku.html", theme="nigatecho", label="管理栄養士", title="管理栄養士国試の苦手科目のつぶし方", tags={"kanri", "kakomon"}),
    dict(path="/blog/pt-kakomon-nankaibun.html", theme="nigatecho", label="理学療法士", title="理学療法士国試の過去問は何回分解く?", tags={"pt", "kakomon"}),
    dict(path="/exam/kanri/kisotsu/", theme="nigatecho", label="管理栄養士", title="管理栄養士国試、既卒の合格率と勉強の進め方", tags={"kanri", "kisotsu"}),
    dict(path="/exam/kaigo/dokugaku/", theme="nigatecho", label="介護福祉士", title="介護福祉士の国試、独学か講座か。実務経験ルートの人へ", tags={"kaigo", "kakomon"}),
    dict(path="/exam/kaigo/shokuba/", theme="nigatecho", label="介護福祉士", title="介護福祉士国試、受験資格(職場)ごとの合格率", tags={"kaigo"}),
    dict(path="/exam/shakai/hajimekata/", theme="nigatecho", label="社会福祉士", title="社会人から社会福祉士の国試を始めるとき、最初にやること", tags={"shakai", "kakomon"}),
    dict(path="/exam/shakai/kisotsu/", theme="nigatecho", label="社会福祉士", title="社会福祉士国試、既卒の合格率と受け直す人の進め方", tags={"shakai", "kisotsu"}),
    dict(path="/exam/seishin/kisotsu/", theme="nigatecho", label="精神保健福祉士", title="精神保健福祉士国試、既卒の合格率と受け直す人の進め方", tags={"seishin", "kisotsu"}),
    dict(path="/exam/pt/kisotsu/", theme="nigatecho", label="理学療法士", title="理学療法士国試、新卒以外の合格率と受け直す人の進め方", tags={"pt", "kisotsu"}),
    dict(path="/exam/rinsho/kisotsu/", theme="nigatecho", label="臨床検査技師", title="臨床検査技師国試、新卒以外の合格率と受け直す人の進め方", tags={"rinsho", "kisotsu"}),
    dict(path="/blog/kisotsu-pass-rates.html", theme="nigatecho", label="国家試験", title="国試5つで既卒の合格率を並べてみた", tags={"kisotsu", "kanri", "shakai", "seishin", "pt", "rinsho"}),
    dict(path="/blog/kaigo-subject-counts.html", theme="nigatecho", label="介護福祉士", title="介護福祉士国試、科目ごとの問題数は毎回同じだった", tags={"kaigo", "kamoku"}),
    dict(path="/blog/kanri-subject-counts.html", theme="nigatecho", label="管理栄養士", title="管理栄養士国試、科目ごとの問題数は5回とも同じ", tags={"kanri", "kamoku"}),
    dict(path="/blog/shakai-subject-counts.html", theme="nigatecho", label="社会福祉士", title="社会福祉士国試、19科目の問題数は6問か9問", tags={"shakai", "kamoku"}),
    dict(path="/blog/seishin-subject-counts.html", theme="nigatecho", label="精神保健福祉士", title="精神保健福祉士国試、18科目の問題数は6問か9問", tags={"seishin", "kamoku"}),
    dict(path="/exam/kaigo/part/", theme="nigatecho", label="介護福祉士", title="介護福祉士国試のパート合格のしくみ。A・B・Cの科目と基準点、免除が続く期間", tags={"kaigo", "kamoku"}),
    dict(path="/exam/kaigo/tojitsu/", theme="nigatecho", label="介護福祉士", title="第39回介護福祉士国家試験 あと何日・受験票・当日の時間割と持ち物", tags={"kaigo", "tojitsu"}),
    dict(path="/exam/seishin/kyotsu-menjo/", theme="nigatecho", label="精神保健福祉士・社会福祉士", title="社会福祉士・精神保健福祉士の共通科目の免除。何問になり、合格点はどう変わるか", tags={"seishin", "shakai", "kamoku"}),
    dict(path="/exam/kanri/shutsugan/", theme="nigatecho", label="管理栄養士", title="第41回管理栄養士国試の出願は12月4日まで。受験資格(実務経験の年数)と出す書類", tags={"kanri", "kisotsu"}),
    dict(path="/exam/shakai/tojitsu/", theme="nigatecho", label="社会福祉士", title="第39回社会福祉士国家試験 あと何日・受験票・当日の時間割と持ち物", tags={"shakai", "tojitsu"}),
    dict(path="/exam/seishin/tojitsu/", theme="nigatecho", label="精神保健福祉士", title="第29回精神保健福祉士国家試験 あと何日・受験票・2日間の時間割と持ち物", tags={"seishin", "tojitsu"}),
    dict(path="/exam/kango/hissu/", theme="nigatecho", label="看護師", title="第116回看護師国家試験の必修問題(50問・40点以上)の合格基準と、一般・状況設定問題の合格点の決まり方", tags={"kango", "kamoku"}),
    dict(path="/exam/kango/gansho/", theme="nigatecho", label="看護師", title="第116回看護師国家試験 願書の提出期間・写真の決まり・必要な書類・あと何日", tags={"kango", "kisotsu"}),
    dict(path="/blog/kokushi-answer-numbers.html", theme="nigatecho", label="国家試験", title="国家試験の「正解の番号」を数えてみた", tags={"kaigo", "kanri", "rinsho", "pt"}),
    # 開発日記
    dict(path="/blog/closed-test-12.html", theme="yuru", label="開発日記", title="クローズドテストの「12人」、3日でなんとか集まった話", tags={"dev", "tester"}),
    dict(path="/blog/promo-video-python.html", theme="yuru", label="開発日記", title="動画編集ができないので、宣伝動画を Python で作ることにした", tags={"dev", "promo"}),
    dict(path="/blog/android-testers-6apps.html", theme="yuru", label="お知らせ", title="Android のテスターを探しています", tags={"dev", "tester"}),
]


def related(path, n=3):
    me = next((r for r in REGISTRY if r["path"] == path), None)
    if not me:
        return []
    pool = [r for r in REGISTRY if r["path"] != path and (r["theme"] == me["theme"] or (me["theme"] == "yuru" and r["theme"] == "yuru"))]
    main = {"kaigo", "kango", "kanri", "shakai", "seishin", "pt", "rinsho", "pachi", "keiba", "slot"}
    scored = sorted(pool, key=lambda r: -(3 * len(r["tags"] & me["tags"] & main) + len((r["tags"] & me["tags"]) - main)))
    return scored[:n]


# ---------------------------------------------------------------------------
# 本文の手入れ
# ---------------------------------------------------------------------------
def strip_tags(s):
    return re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


def read_minutes(body):
    n = len(re.sub(r"\s", "", strip_tags(re.sub(r"<(table|pre)\b.*?</\1>", "", body, flags=re.S))))
    return max(1, math.ceil(n / 550))  # 日本語の文は1分に500〜600字ほど


def add_heading_ids(body):
    heads = []
    used = set(re.findall(r'\sid="([^"]+)"', body))

    def rep(m):
        attrs, inner = m.group(1), m.group(2)
        mm = re.search(r'\sid="([^"]+)"', attrs)
        if mm:
            hid = mm.group(1)
        else:
            k = len(heads) + 1
            hid = f"s{k}"
            while hid in used:
                k += 1
                hid = f"s{k}"
            used.add(hid)
            attrs = f' id="{hid}"' + attrs
        heads.append((hid, strip_tags(inner)))
        return f"<h2{attrs}>{inner}</h2>"

    body = re.sub(r"<h2([^>]*)>(.*?)</h2>", rep, body, flags=re.S)
    return body, heads


def wrap_tables(body):
    # 外側の箱がまだ無い表だけを包む。class="tbl" の表は箱の役を外へ移す
    body = re.sub(r'<div class="tbl[^"]*">\s*(<table\b.*?</table>)\s*</div>', r"\1", body, flags=re.S)
    body = re.sub(r'<table class="tbl">', "<table>", body)
    return re.sub(r"(<table\b.*?</table>)", r'<div class="tbl">\1</div>', body, flags=re.S)


def _img_size(src):
    p = HERE / src.lstrip("/") if src.startswith("/") else None
    if p is None or not p.exists():
        return None
    try:
        from PIL import Image
        return Image.open(p).size
    except Exception:
        return None


def webp_of(src, width=None, quality=82):
    """/img/a.png → /img/a.webp(無ければ作る。width を付けると縮める)。元より重くなる時は元のまま"""
    if not src.startswith("/"):
        return src
    p = HERE / src.lstrip("/")
    if not p.exists() or p.suffix.lower() not in (".png", ".jpg", ".jpeg"):
        return src
    suffix = f"-{width}" if width else ""
    out = p.with_name(p.stem + suffix + ".webp")
    if not out.exists() or out.stat().st_mtime < p.stat().st_mtime:
        from PIL import Image
        im = Image.open(p)
        im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
        if width and im.width > width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        im.save(out, "WEBP", quality=quality, method=6)
    if not width and out.stat().st_size >= p.stat().st_size:
        return src
    return "/" + out.relative_to(HERE).as_posix()


def tune_images(body):
    """本文の画像: 軽い WebP に替え、幅と高さを付け、遅れて読む。<p><img></p> は説明文つきの figure にする"""
    def img(m):
        tag = m.group(0)
        src = re.search(r'src="([^"]+)"', tag).group(1)
        new = webp_of(src)
        tag = tag.replace(f'src="{src}"', f'src="{new}"')
        if "width=" not in tag:
            sz = _img_size(new) or _img_size(src)
            if sz:
                tag = tag.replace("<img ", f'<img width="{sz[0]}" height="{sz[1]}" ', 1)
        if "loading=" not in tag:
            tag = tag.replace("<img ", '<img loading="lazy" ', 1)
        if "decoding=" not in tag:
            tag = tag.replace("<img ", '<img decoding="async" ', 1)
        return tag.replace(" />", ">")

    body = re.sub(r"<img\b[^>]*>", img, body)

    def fig(m):
        tag = m.group(1)
        alt = re.search(r'alt="([^"]*)"', tag)
        cap = f"<figcaption>{alt.group(1)}</figcaption>" if alt and alt.group(1) else ""
        return f"<figure>{tag}{cap}</figure>"

    return re.sub(r"<p>\s*(<img\b[^>]*>)\s*</p>", fig, body)


def prep_body(body):
    body = wrap_tables(body)
    body = tune_images(body)
    body, heads = add_heading_ids(body)
    return body, heads


# ---------------------------------------------------------------------------
# ページ
# ---------------------------------------------------------------------------
def e(s):
    return _html.escape(s, quote=True)


def ja_date(iso):
    y, m, d = iso.split("-")
    return f"{int(y)}年{int(m)}月{int(d)}日"


def render(a):
    """a: dict
      canonical, title(h1), seo_title(<title>), desc, og_desc, og_image, og_w, og_h, twitter_card,
      published, modified(ISO), theme, crumbs[(name, url or None)], audience, body(HTML),
      app(HTML), extra_head, after(広告・X・テスター箱など本文の後ろに置く HTML), footer_links[(name,url)], path
    """
    t = THEMES[a["theme"]]
    after = a.get("after", "")
    if "class='admax'" in after:
        # 広告の「広告」の字を読める濃さに、広告の iframe に題を付ける(読み上げ用)
        after = after.replace("color:#8a8f98", "color:#5f6672")
        after += ('<script>(function(){if(!window.MutationObserver)return;var t=function(){document.querySelectorAll("iframe:not([title])").forEach(function(f){f.title="広告";});};'
                  'new MutationObserver(t).observe(document.body,{childList:true,subtree:true});})();</script>')
    body, heads = prep_body(a["body"])
    mins = read_minutes(body)
    nchars = len(strip_tags(body))
    toc = ""
    if len(heads) >= 4 or (len(heads) >= 3 and nchars >= 2600):
        toc = ('<nav class="toc" aria-label="目次"><p>目次</p><ol>' +
               "".join(f'<li><a href="#{h}">{e(x)}</a></li>' for h, x in heads) + "</ol></nav>")
    canonical = a["canonical"]
    site_root = canonical.split("/", 3)[0] + "//" + canonical.split("/", 3)[2]
    crumbs = a["crumbs"]
    crumb_html = '<ol class="crumb">' + "".join(
        f'<li><a href="{u}">{e(n)}</a></li>' if u else f'<li aria-current="page">{e(n)}</li>' for n, u in crumbs) + "</ol>"
    bl = {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": (site_root + u if u and u.startswith("/") else (u or canonical))}
        for i, (n, u) in enumerate(crumbs)]}
    og_image = a["og_image"]
    art = {"@type": "Article", "headline": a["title"][:110], "description": a["desc"], "inLanguage": "ja",
           "datePublished": a["published"], "dateModified": a.get("modified") or a["published"],
           "image": [og_image],
           "author": {"@type": "Person", "name": "YURU", "url": "https://x.com/apkderete"},
           "publisher": {"@type": "Organization", "name": "YURU", "url": site_root + "/",
                         "logo": {"@type": "ImageObject", "url": site_root + "/img/nigatecho-icon.png"}},
           "mainEntityOfPage": {"@type": "WebPage", "@id": canonical}}
    ld = json.dumps({"@context": "https://schema.org", "@graph": [art, bl]}, ensure_ascii=False, separators=(",", ":"))
    rel = related(a["path"])
    rel_html = ""
    if rel:
        rel_html = ('<section class="rel" aria-labelledby="rel-h"><h2 id="rel-h">あわせて読みたい</h2><ul>' +
                    "".join(f'<li><a href="{r["path"]}"><span>{e(r["label"])}</span><strong>{e(r["title"])}</strong></a></li>' for r in rel) +
                    "</ul></section>")
    pub, mod = a["published"], a.get("modified") or a["published"]
    dates = f'<time datetime="{pub}">{ja_date(pub)}</time>'
    if mod != pub:
        dates += f'<span>更新 <time datetime="{mod}">{ja_date(mod)}</time></span>'
    nav = a.get("nav") or [("記事", "/blog/"), ("試験別ガイド", "/exam/"), ("アプリ", "/#apps")]
    foot = a.get("footer_links") or []
    og_w = a.get("og_w")
    og_size = f'\n<meta property="og:image:width" content="{og_w}">\n<meta property="og:image:height" content="{a["og_h"]}">' if og_w else ""
    return f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(a["seo_title"])}</title>
<meta name="description" content="{e(a["desc"])}">
<link rel="canonical" href="{canonical}">
<meta name="theme-color" content="{t["hd"]}">
<link rel="icon" href="{t["icon"].replace("-64.webp", ".png")}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="{e(t["site"])}">
<meta property="og:locale" content="ja_JP">
<meta property="og:title" content="{e(a["title"])}">
<meta property="og:description" content="{e(a.get("og_desc") or a["desc"])}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{og_image}">{og_size}
<meta property="article:published_time" content="{pub}">
<meta property="article:modified_time" content="{mod}">
<meta name="twitter:card" content="{a.get("twitter_card", "summary_large_image")}">
<meta name="twitter:site" content="@apkderete">
{a.get("extra_head", "")}<script type="application/ld+json">{ld}</script>
<style>{CSS % t}</style>
</head>
<body>
<header class="sh"><div class="sh-in"><a class="sh-logo" href="{t["brand_url"]}"><img src="{t["icon"]}" alt="" width="30" height="30">{e(t["brand"])}</a><nav aria-label="サイト">{"".join(f'<a href="{u}"{" class=opt" if i else ""}>{e(n)}</a>' for i, (n, u) in enumerate(nav))}</nav></div></header>
<main class="wrap">
<article>
<header class="ah">
{crumb_html}
<h1>{e(a["title"])}</h1>
<div class="meta">{dates}<span class="rt">約{mins}分で読めます</span></div>
<p class="for"><b>こんな人に</b>{e(a["audience"])}</p>
</header>
{toc}
<div class="prose">
<!--prose-->
{body}
<!--/prose-->
</div>
</article>
{a.get("app", "")}
{rel_html}
<div class="extra">
{after}
</div>
</main>
<footer class="sf"><div class="wrap">
<nav aria-label="フッター">{"".join(f'<a href="{u}">{e(n)}</a>' for n, u in foot)}<a href="/">YURU のアプリ</a><a href="/exam/">国家試験ガイド</a><a href="/blog/">開発日記</a><a href="https://x.com/apkderete">X @apkderete</a></nav>
<p>誤りに気づいたら <a href="mailto:kame6493@gmail.com">kame6493@gmail.com</a> までお知らせください。確認して直します。</p>
<p>© 2026 YURU</p>
</div></footer>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# アプリの案内の枠
# ---------------------------------------------------------------------------
def app_box(*, head, name, sub, icon, shot, shot_alt, lead, more, buttons, foot=""):
    return (f'<aside class="app" aria-label="アプリの案内"><p class="app-h">{e(head)}</p><div class="app-in">'
            f'<div class="app-shot"><img src="{shot}" alt="{e(shot_alt)}" width="{_img_size(shot)[0]}" height="{_img_size(shot)[1]}" loading="lazy" decoding="async"></div>'
            f'<div><p class="app-n"><img src="{icon}" alt="" width="36" height="36" loading="lazy"><span>{e(name)}' + (f"<small>{e(sub)}</small>" if sub else "") + "</span></p>"
            f'<p class="app-lead">{lead}</p>' + (f'<p class="app-more">{more}</p>' if more else "") +
            f'</div><div class="app-btns">{buttons}</div></div>' + (f'<div class="app-f">{foot}</div>' if foot else "") + "</aside>")


def nigatecho_box(key=None, note=""):
    """ニガテ帳の案内。key は試験(kaigo/kanri/shakai/seishin/pt/rinsho)。None は5試験まとめ"""
    import build_exam as B
    shot = webp_of("/img/nigatecho-1.jpg", 300)
    if key:
        ios, play = B.store_urls(key)
        x = next(z for z in B.EXAMS if z["key"] == key)
        name = "ニガテ帳 臨床検査技師" if key == "rinsho" else "ニガテ帳"
        sub = "" if key == "rinsho" else x["name"]
        lead = e(B.IOS_LEAD)
        more = f'<span class="app-c" data-exam="{x["date_iso"]}">第{x["round"]}回の試験は{e(x["date_ja"])}<b></b></span>'
    else:
        ios, play = B.APP_MULTI, B.PLAY_MULTI
        name, sub = "ニガテ帳", "国家試験の過去問"
        lead = "国家試験の過去問を、間違えた問題だけ残して解ける iPhone アプリ"
        more = "介護福祉士・管理栄養士・理学療法士・社会福祉士・精神保健福祉士の過去問を解けます。"
    more = (more + ("<br>" if more else "") + "間違えた問題は「苦手」として残り、2回続けて正解すると消えます。")
    btns = (f'<a class="as-b nc-ios" href="{ios}"><img src="/img/appstore-badge-ja.svg" alt="App Store からダウンロード" width="120" height="44" loading="lazy"></a>'
            f'<a class="app-btn ghost nc-and" href="{play}">Android テスト版に参加</a>')
    foot = (f'<p class="nc-ios">App Store: <a href="{ios}">{e(ios.split("?")[0].replace("https://", ""))}</a></p>'
            f'<p class="nc-and">Android は先に<a href="{B.TESTER_GROUP}">テスター用のグループ</a>に入ってから参加してください。</p>'
            + (f"<p>{note}</p>" if note else "") +
            '<p>Apple、Apple のロゴは、米国およびその他の国や地域で登録された Apple Inc. の商標です。App Store は Apple Inc. のサービスマークです。</p>')
    return app_box(head="この記事を書いた人が作っている過去問アプリ", name=name, sub=sub, icon="/img/nigatecho-icon-64.webp",
                   shot=shot, shot_alt="ニガテ帳のホーム画面。あと何問わからないかと試験日までの日数が出る", lead=lead, more=more,
                   buttons=btns, foot=foot) + UA_JS


# ---------------------------------------------------------------------------
# カチマケの記事5本
# ---------------------------------------------------------------------------
KACHI = {
    "shushihyo": dict(audience="パチンコ・パチスロの収支を、紙・エクセル・アプリのどれかでつけ始めたい人"),
    "kaishuritsu": dict(audience="パチスロや競馬の回収率を、ずれずに出したい人"),
    "koyaku": dict(audience="スロットで小役を数えていて、出た確率をどう見ればいいか知りたい人"),
    "keiba-shushi": dict(audience="競馬の収支を、年間や券種ごとにまとめたい人"),
    "nenkan-shushi": dict(audience="パチンコ・スロット・競馬の1年分の収支を残しておきたい人",
                          h1="パチンコ・スロット・競馬の年間収支と確定申告(国税庁のページの整理)"),
}
KACHI_CARE_RE = re.compile(r'<p class="care">(.*?)</p>', re.S)


def _between(s, a, b):
    i = s.find(a)
    if i < 0:
        return None
    i += len(a)
    j = s.find(b, i)
    return s[i:j] if j >= 0 else None


def kachimake_one(slug):
    f = HERE / "kachimake" / slug / "index.html"
    s = f.read_text(encoding="utf-8")
    get = lambda pat: re.search(pat, s, re.S).group(1)
    seo_title = _html.unescape(get(r"<title>(.*?)</title>"))
    desc = _html.unescape(get(r'<meta name="description" content="([^"]*)"'))
    og_desc = _html.unescape(get(r'<meta property="og:description" content="([^"]*)"'))
    pub = get(r'"datePublished":\s*"([^"]+)"')
    mod = re.search(r'"dateModified":\s*"([^"]+)"', s)
    mod = mod.group(1) if mod else pub
    h1 = _html.unescape(get(r"<h1>(.*?)</h1>"))
    crumb = re.search(r'<li aria-current="page">(.*?)</li>', s) or re.search(r"<a href=\"\.\./\">カチマケ</a> › (.*?)</p>", s)
    crumb = _html.unescape(crumb.group(1))
    if "<!--prose-->" in s:
        body = _between(s, "<!--prose-->", "<!--/prose-->").strip()
        appd = re.sub(r'</p><p class="app-more">', "", _between(s, "<!--appdesc-->", "<!--/appdesc-->"))
        shot = re.search(r'<div class="app-shot"><img src="([^"]+)" alt="([^"]*)"', s)
        shot_src, shot_alt = shot.group(1), _html.unescape(shot.group(2))
        shot_src = re.sub(r"-\d+\.webp$", ".jpg", shot_src)
        care = _between(s, "<!--care-->", "<!--/care-->")
    else:
        body = s.split('<p class="date">', 1)[1].split("</p>", 1)[1].split('<div class="app">', 1)[0].strip()
        body = re.sub(r"\n  ", "\n", body)
        app = s.split('<div class="app">', 1)[1]
        appd = re.search(r"<p>(.*?)</p>", app, re.S).group(1)
        shot = re.search(r'<div class="shot"><img src="\.\./img/([^"]+)" alt="([^"]*)"', app)
        shot_src, shot_alt = "/kachimake/img/" + shot.group(1), _html.unescape(shot.group(2))
        care = KACHI_CARE_RE.search(app).group(1)
    meta = KACHI[slug]
    title = meta.get("h1") or h1
    if meta.get("h1"):
        seo_title = meta["h1"] + " | カチマケ"
    # 案内の文は今の文のまま。最初の一文を大きく、残りを小さく
    m = re.match(r"(.+?。)(.*)", appd.strip(), re.S)
    lead, more = (m.group(1), m.group(2).strip()) if m else (appd, "")
    play = "https://play.google.com/store/apps/details?id=jp.kachimake.app"
    care_text = care.split("<br>")[0].strip()
    box = app_box(head="記録をつけるアプリ", name="カチマケ", sub="パチンコ・スロット・競馬の収支", icon="/kachimake/img/icon-64.webp",
                  shot=webp_of(shot_src, 300), shot_alt=shot_alt,
                  lead=f"<!--appdesc-->{lead}", more=f"{more}<!--/appdesc-->",
                  buttons=f'<a class="app-btn" href="{play}" target="_blank" rel="noopener">Google Play でカチマケを見る</a>',
                  foot=f"<p><!--care-->{care_text}<br>{play}<!--/care--></p>".replace(f"<br>{play}<br>{play}", f"<br>{play}"))
    html_out = render(dict(
        path=f"/kachimake/{slug}/", canonical=f"{YURU}/kachimake/{slug}/", theme="kachimake",
        title=title, seo_title=seo_title, desc=desc, og_desc=og_desc,
        og_image=f"{YURU}/kachimake/img/og.jpg", og_w=1200, og_h=630,
        published=pub, modified=mod, audience=meta["audience"],
        crumbs=[("YURU", "/"), ("カチマケ", "/kachimake/"), (crumb, None)],
        nav=[("カチマケ", "/kachimake/"), ("ほかのアプリ", "/")],
        body=body, app=box,
        footer_links=[("カチマケのトップ", "/kachimake/"), ("プライバシーポリシー", "https://kame6493-del.github.io/kachimake-site/privacy.html")],
    ))
    f.write_text(html_out, encoding="utf-8", newline="\n")
    return f


def ensure_icons():
    webp_of_icon("/kachimake/img/icon.png", "/kachimake/img/icon-64.webp")
    webp_of_icon("/img/nigatecho-icon.png", "/img/nigatecho-icon-64.webp")


def webp_of_icon(src, out):
    from PIL import Image
    o = HERE / out.lstrip("/")
    if not o.exists():
        im = Image.open(HERE / src.lstrip("/")).convert("RGBA").resize((64, 64), Image.LANCZOS)
        im.save(o, "WEBP", quality=90, method=6)


if __name__ == "__main__":
    ensure_icons()
    if sys.argv[1:] == ["kachimake"]:
        for slug in KACHI:
            print(kachimake_one(slug))


# ---------------------------------------------------------------------------
# 試験の小ページ(build_guides.py が作る /exam/<試験>/<名前>/)
# ---------------------------------------------------------------------------
GUIDE_AUDIENCE = {
    "/exam/kanri/kisotsu/": "管理栄養士国家試験を、既卒で受ける人・働きながら受け直す人",
    "/exam/shakai/hajimekata/": "社会人になってから、社会福祉士の国家試験の勉強を始める人",
    "/exam/kaigo/dokugaku/": "実務経験ルートで介護福祉士を受ける人、独学か講座かで迷っている人",
    "/exam/pt/kisotsu/": "理学療法士国家試験を、もう一度受ける人",
    "/exam/rinsho/kisotsu/": "臨床検査技師国家試験を、もう一度受ける人",
    "/exam/shakai/kisotsu/": "社会福祉士国家試験を、もう一度受ける人",
    "/exam/kaigo/shokuba/": "介護福祉士国家試験を受ける人、受験資格ごとの合格率を知りたい人",
    "/exam/seishin/kisotsu/": "精神保健福祉士国家試験を、もう一度受ける人",
}


def from_guide(url, page):
    """build_guides.py が書いた1ページを、このひな形に載せかえる。本文はそのまま"""
    import build_exam as B
    path = url.replace(B.BASE, "")
    key = path.strip("/").split("/")[1]
    g = lambda pat: _html.unescape(re.search(pat, page, re.S).group(1))
    title = g(r"<title>(.*?)</title>")
    desc = g(r'<meta name="description" content="([^"]*)"')
    h1 = g(r"<h1>(.*?)</h1>")
    main = page.split('<main class="wrap">', 1)[1]
    cm = re.match(r'\s*<p class="note"><a href="([^"]+)">(.*?)</a> / (.*?)</p>', main, re.S)
    body = main.split("</h1>", 1)[1]
    cut = body.find('<aside class="ncard"')
    rest = ""
    if cut >= 0:
        rest = body[cut:].split("</aside>", 1)[1]
        body = body[:cut]
    else:
        body = body.split("<div class='admax'", 1)[0]
    note = re.search(r'<p class="note">(.*?)</p>', rest, re.S)
    note = note.group(1) if note else ""
    ld = json.loads(re.search(r'<script type="application/ld\+json">\s*(.*?)\s*</script>', page, re.S).group(1))
    mod = ld.get("dateModified") or B.UPDATED
    xfollow = re.search(r'(<div class="xfollow".*?</div>)\s*<footer>', B.FOOT, re.S).group(1)
    return render(dict(
        path=path, canonical=url, theme="nigatecho",
        title=h1, seo_title=title, desc=desc,
        og_image=KAME + "/img/nigatecho-card.jpg", og_w=480, og_h=853, twitter_card="summary",
        published=mod, modified=mod, audience=GUIDE_AUDIENCE.get(path, ""),
        crumbs=[("YURU", "/"), ("国家試験ガイド", "/exam/"), (_html.unescape(cm.group(2)), cm.group(1)), (_html.unescape(cm.group(3)), None)],
        body=body.strip(), app=nigatecho_box(key, note=note),
        after=B.ADMAX + "\n" + xfollow,
        extra_head=(B.itunes_banner(url).strip() + "\n") if B.itunes_banner(url).strip() else "",
    ))
