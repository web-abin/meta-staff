#!/bin/bash
# 服务器侧一键重新部署：git pull → 装依赖 → 重启 tmux → 验证
# 用法：bash scripts/redeploy.sh   （也可 chmod +x 后直接 ./scripts/redeploy.sh）

set -e

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
echo "▶ project root: $ROOT"

echo "[1/5] git pull"
git pull

echo "[2/5] pnpm install"
pnpm install --prefer-offline

echo "[3/5] kill old tmux sessions (ms-be / ms-fe / metastaff)"
tmux kill-session -t ms-be     2>/dev/null || true
tmux kill-session -t ms-fe     2>/dev/null || true
tmux kill-session -t metastaff 2>/dev/null || true

echo "[4/5] start fresh tmux: metastaff (make demo)"
tmux new -d -s metastaff "cd $ROOT && make demo 2>&1 | tee /tmp/metastaff.log"

echo "[5/5] wait 20s and verify..."
sleep 20

echo "--- llm provider ---"
grep -E 'llm provider|listening' /tmp/metastaff.log | tail -5 || true

echo "--- ports ---"
ss -tlnp 2>/dev/null | grep -E ':3000|:8080' || true

echo "--- healthz ---"
curl -sS -m 3 http://127.0.0.1:8080/api/healthz || true
echo

IP=$(curl -sS -m 3 ifconfig.me 2>/dev/null || echo "")
echo "done. open: http://${IP:-<your-server-ip>}:3000/"
