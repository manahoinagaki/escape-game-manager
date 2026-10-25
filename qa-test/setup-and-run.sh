#!/bin/bash
# =====================================================
# setup-and-run.sh — 運用フロー自動テストのセットアップ＆実行
# =====================================================
#
# 使い方:
#   1. このファイルと drive.mjs を同じフォルダに置く
#   2. ターミナルでそのフォルダに移動し、以下を実行:
#        bash setup-and-run.sh
#
# =====================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== 1. Node.js の確認 ==="
if ! command -v node &> /dev/null; then
  echo "❌ Node.js が見つかりません。先にインストールしてください: https://nodejs.org/"
  exit 1
fi
echo "✅ $(node -v)"

echo ""
echo "=== 2. drive.mjs の確認 ==="
if [ ! -f "drive.mjs" ]; then
  echo "❌ drive.mjs がこのフォルダに見つかりません: $SCRIPT_DIR"
  echo "   setup-and-run.sh と drive.mjs を同じフォルダに置いてください。"
  exit 1
fi
echo "✅ 見つかりました"

echo ""
echo "=== 3. Playwright のセットアップ（初回のみ時間がかかります） ==="
if [ ! -f "package.json" ]; then
  npm init -y > /dev/null 2>&1
fi
if [ ! -d "node_modules/playwright" ]; then
  npm install playwright > /dev/null 2>&1
fi
npx playwright install chromium

echo ""
echo "=== 4. テスト対象を選択 ==="
echo "  1) devサーバー (http://localhost:5173) — 本番データに触れず安全（デフォルト）"
echo "  2) 本番サイト   (https://festival-escape-v2.web.app)"
read -p "番号を入力 [1]: " choice
choice=${choice:-1}

if [ "$choice" = "2" ]; then
  export TARGET_URL="https://festival-escape-v2.web.app"
  echo "→ 本番サイトを対象にします: $TARGET_URL"
else
  echo "→ devサーバーを対象にします: http://localhost:5173"
  if ! curl -sf http://localhost:5173 > /dev/null 2>&1; then
    echo ""
    echo "⚠️  devサーバーがまだ起動していないようです。"
    echo "   別のターミナルを開いて、以下を実行してから Enter を押してください:"
    echo ""
    echo "     cd UnFes1_23/frontend && npm run dev"
    echo ""
    read -p "devサーバーを起動したら Enter を押してください... "
  fi
fi

echo ""
echo "=== 5. テスト実行 ==="
node drive.mjs
RESULT=$?

echo ""
if [ $RESULT -eq 0 ]; then
  echo "🎉 すべてのチェックが成功しました。"
else
  echo "⚠️  一部のチェックが失敗しました。上のログと shots/ フォルダの画像を確認してください。"
fi
echo "スクリーンショット: $SCRIPT_DIR/shots/"
