#!/bin/bash
# 诊断 metastaff 起不来的情况。
# 用法：bash scripts/diag-metastaff.sh

set +e

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

echo "=== /tmp/metastaff.log (last 80 lines) ==="
if [ -f /tmp/metastaff.log ]; then
  tail -80 /tmp/metastaff.log
else
  echo "(没有 /tmp/metastaff.log)"
fi
echo

echo "=== tmux sessions ==="
tmux ls 2>/dev/null || echo "(没有 tmux session)"
echo

echo "=== 端口占用 :3000 :8080 ==="
ss -tlnp 2>/dev/null | grep -E ':3000|:8080' || echo "(无)"
echo

echo "=== 单独跑 go server 看错误（10 秒后强制 kill） ==="
cd "$ROOT/apps/server"
timeout 10 env DATABASE_URL= RUNTIME_DIR="$ROOT/runtime" RECORDER_PATH="$ROOT/scripts/playwright-record.mjs" go run -buildvcs=false ./cmd/server 2>&1 | tail -40
echo

echo "=== Go / Node 版本 ==="
go version 2>/dev/null
node --version 2>/dev/null
pnpm --version 2>/dev/null
