# 漢字マージ

### ▶ [ここをクリックして遊ぶ](https://mj-yukkuri.github.io/kanji-merge/)

部首や部品のタイルを動かして合体させ、漢字を作っていくパズルゲームです（2048風）。

- 遊び方：https://mj-yukkuri.github.io/kanji-merge/help.html
- ダウンロードして遊ぶ場合は `index.html` をブラウザで開いてください

## ファイル

| ファイル | 内容 |
|---|---|
| `index.html` | ゲーム本体（8×8） |
| `help.html` | 遊び方・出てくる部品の一覧 |
| `data.js` | レシピデータ（部品・組み合わせ・読み・出やすさ） |
| `graph.html` | 漢字レシピ図（開発用。全レシピをネットワーク図で表示） |
| `tools/balance.js` | バランス検証シミュレーター（開発用） |
| `tools/make_images.py` | ファビコン・OGP画像（`favicon.ico` `icon-*.png` `apple-touch-icon.png` `ogp.png`）を作るスクリプト（要 Pillow） |

## 開発用

- `index.html?debug` で開くと、「合体の提案」「見直し」「違和感」ボタンが使えます。
- `node tools/balance.js` で、現在の `data.js` の出やすさで自動プレイを繰り返し、部品の残りやすさなどを計測します。
