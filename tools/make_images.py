# ファビコンと OGP 画像を作る
#   python tools/make_images.py
# 出力: favicon.ico / icon-192.png / apple-touch-icon.png / icon-512.png / ogp.png （リポジトリ直下）
# フォントは Windows の游明朝 Demibold（ゲームの明朝体に近い見た目）
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), "..")
FONT = r"C:\Windows\Fonts\yumindb.ttf"

# ゲームと同じ色
BG, INK, SUB, ACCENT = "#f4efe6", "#2b2622", "#7a6e62", "#c8402c"
BOARD, CELL = "#c9bba7", "#ddd2c2"
TILE = {0: ("#fbf6ec", "#3a2f25"), 1: ("#f2d89c", "#3a2f25"), 2: ("#eaa66a", "#2b1f15"), 3: ("#d4613f", "#ffffff")}
GOLD = "#d9a21b"

def font(size):
    return ImageFont.truetype(FONT, size)

def center_text(d, box, text, size, fill):
    """box の中央に文字を置く（字の実際の外形で中央合わせ）"""
    f = font(size)
    l, t, r, b = d.textbbox((0, 0), text, font=f)
    x0, y0, x1, y1 = box
    d.text(((x0 + x1 - (r - l)) / 2 - l, (y0 + y1 - (b - t)) / 2 - t), text, font=f, fill=fill)

# ---- アイコン（朱色の角丸タイルに白い「字」） ----
def icon(size):
    s = 4  # 4倍で描いて縮小するときれいになる
    im = Image.new("RGBA", (size * s, size * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad = int(size * s * 0.04)
    d.rounded_rectangle((pad, pad, size * s - pad, size * s - pad), radius=int(size * s * 0.22), fill=ACCENT)
    center_text(d, (0, 0, size * s, size * s), "字", int(size * s * 0.72), "#ffffff")
    return im.resize((size, size), Image.LANCZOS)

icon(512).save(os.path.join(ROOT, "icon-512.png"))
icon(192).save(os.path.join(ROOT, "icon-192.png"))
icon(180).save(os.path.join(ROOT, "apple-touch-icon.png"))
icon(64).save(os.path.join(ROOT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

# ---- OGP 画像（1200×630） ----
W, H = 1200, 630
im = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(im)

# 左：ロゴと説明
d.text((80, 160), "漢字", font=font(100), fill=INK)
d.text((80 + d.textlength("漢字", font=font(100)), 160), "マージ", font=font(100), fill=ACCENT)
d.text((84, 310), "部品をくっつけて", font=font(40), fill=INK)
d.text((84, 366), "漢字を作る2048風パズル", font=font(40), fill=INK)
d.text((84, 462), "約1200字の漢字図鑑を集めよう", font=font(28), fill=SUB)

# 右：盤面風の背景に、合体の例をタイルで並べる
bx0, by0, bx1, by1 = 680, 95, 1130, 535
d.rounded_rectangle((bx0, by0, bx1, by1), radius=24, fill=BOARD)
rows = [(("十", 0), ("口", 0), ("田", 2, False)),
        (("日", 0), ("月", 0), ("明", 1, False)),
        (("氵", 0), ("青", 1), ("清", 3, True))]
ts, gap = 90, 14
row_h = (by1 - by0 - 40) / len(rows)
for i, (a, b, c) in enumerate(rows):
    cy = by0 + 20 + row_h * i + row_h / 2
    x = bx0 + 24
    for j, item in enumerate((a, b, c)):
        ch, depth = item[0], item[1]
        bg, fg = TILE[depth]
        box = (x, cy - ts / 2, x + ts, cy + ts / 2)
        d.rounded_rectangle((box[0], box[1] + 4, box[2], box[3] + 4), radius=14, fill="#b3a48f")   # 影
        d.rounded_rectangle(box, radius=14, fill=bg)
        if len(item) > 2 and item[2]:   # 完成タイルは金枠
            d.rounded_rectangle(box, radius=14, outline=GOLD, width=6)
        center_text(d, box, ch, 62, fg)
        x += ts
        if j < 2:
            center_text(d, (x, cy - 30, x + 60, cy + 30), "＋" if j == 0 else "＝", 44, SUB)
            x += 60

im.save(os.path.join(ROOT, "ogp.png"), optimize=True)
print("ok")
