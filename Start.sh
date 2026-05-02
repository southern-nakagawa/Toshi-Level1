#!/bin/bash
cd "$(dirname "$0")"

echo "================================================"
echo "  理論株価スクリーナー プロキシ起動"
echo "================================================"
echo ""

if ! command -v python3 &>/dev/null; then
  echo "python3 が見つかりません。"
  echo "https://www.python.org からインストールしてください。"
  read -p "Enterキーで閉じる..."
  exit 1
fi

python3 -c "import flask, requests" 2>/dev/null
if [ $? -ne 0 ]; then
  echo "必要なライブラリをインストール中..."
  python3 -m pip install flask requests --break-system-packages
  echo ""
fi

echo "スリープ防止: ON（画面は消えます）"
echo "プロキシ起動中... (ポート 8765)"
echo "ブラウザで index.html を開いてください"
echo "停止: このウィンドウを閉じる or Ctrl+C"
echo ""

# caffeinate -i でスリープのみ防止（画面は消える）
caffeinate -i python3 proxy.py