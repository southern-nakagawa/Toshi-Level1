#!/bin/bash
# ══ 理論株価スクリーナー ランチャー ══
# ダブルクリックで proxy.py 起動 → ブラウザで開く

cd "$(dirname "$0")"

# 既にproxyが起動中なら二重起動しない
if lsof -i :8765 >/dev/null 2>&1; then
  echo "proxy は既に起動中です"
else
  echo "proxy.py を起動中..."
  python3 proxy.py &
  PROXY_PID=$!
  sleep 2
  echo "proxy 起動完了 (PID: $PROXY_PID)"
fi

# ブラウザで開く
open index.html

echo ""
echo "終了するには Ctrl+C を押してください"
echo "(このウィンドウを閉じてもproxyは動き続けます)"
echo ""

# proxyのログを表示し続ける（Ctrl+Cで終了）
wait $PROXY_PID 2>/dev/null
