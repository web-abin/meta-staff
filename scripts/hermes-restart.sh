#!/bin/bash
# 重启 hermes docker 容器，挂载工作目录到 /workspace。
# meta-staff 的 /static/workspace/* 暴露同一个目录，hermes 写到 /workspace 的文件
# 浏览器就能直接看见。
#
# 用法：bash scripts/hermes-restart.sh
# 环境变量（都可选，有默认）：
#   HERMES_API_KEY        - 不传则从 /root/meta-staff/.env 或现有容器里读
#   HERMES_WORKSPACE_DIR  - 宿主机工作目录，默认 /root/hermes-workspace
#   HERMES_DATA_DIR       - 宿主机数据目录(配置/缓存)，默认 /root/.hermes
#   HERMES_IMAGE          - docker 镜像，默认 hermes-agent:latest

set -e

HERMES_WORKSPACE_DIR=${HERMES_WORKSPACE_DIR:-/root/hermes-workspace}
HERMES_DATA_DIR=${HERMES_DATA_DIR:-/root/.hermes}
HERMES_IMAGE=${HERMES_IMAGE:-hermes-agent:latest}

# 1. 解析 API_SERVER_KEY: env > meta-staff .env > 现存容器
KEY="${HERMES_API_KEY:-}"
if [ -z "$KEY" ] && [ -f /root/meta-staff/.env ]; then
  KEY=$(grep '^HERMES_API_KEY=' /root/meta-staff/.env | head -1 | cut -d= -f2- | tr -d '\r')
fi
if [ -z "$KEY" ] && docker ps -a --filter name=hermes --format '{{.Names}}' | grep -q '^hermes$'; then
  KEY=$(docker inspect hermes --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^API_SERVER_KEY=' | cut -d= -f2- | tr -d '\r')
fi
if [ -z "$KEY" ]; then
  echo "❌ 找不到 HERMES_API_KEY。请把它写到 /root/meta-staff/.env，或 export HERMES_API_KEY=<key> 后重跑。"
  exit 1
fi

echo "▶ data       = $HERMES_DATA_DIR"
echo "▶ workspace  = $HERMES_WORKSPACE_DIR"
echo "▶ image      = $HERMES_IMAGE"
echo "▶ api key    = ${KEY:0:8}...${KEY: -4}"

mkdir -p "$HERMES_WORKSPACE_DIR"
# hermes 容器里跑的是非 root 用户（日志会打 "Dropping root privileges"），
# 而宿主机 mkdir 出来的目录是 root:root 0755 — 容器内非 root 用户写不进。
# 整个目录 chmod 777：方案简单，容器内文件创建后宿主机也能直接读写。
# 副作用：宿主机其他用户也能写。考虑到这个目录就是给 hermes 当沙箱，可接受。
chmod 777 "$HERMES_WORKSPACE_DIR"

# 2. 镜像不在本地就按部署文档拉一次 + tag。先走 daemon.json 配的镜像加速
#    （默认）；走原仓库失败再依次尝试几个国内 mirror。
ensure_image() {
  if [ -n "$(docker images -q "$HERMES_IMAGE" 2>/dev/null)" ]; then
    return 0
  fi
  echo "▶ image missing, pulling..."
  local sources=(
    "nousresearch/hermes-agent:latest"
    "docker.1ms.run/nousresearch/hermes-agent:latest"
    "hub.rat.dev/nousresearch/hermes-agent:latest"
    "docker.m.daocloud.io/nousresearch/hermes-agent:latest"
  )
  for src in "${sources[@]}"; do
    echo "  → trying $src"
    if docker pull "$src"; then
      docker tag "$src" "$HERMES_IMAGE"
      echo "  ✓ tagged $src as $HERMES_IMAGE"
      return 0
    fi
  done
  echo "❌ 所有源都拉不动。手动跑：docker pull nousresearch/hermes-agent:latest && docker tag nousresearch/hermes-agent:latest $HERMES_IMAGE"
  return 1
}
ensure_image

echo "▶ removing old container (if any)..."
docker rm -f hermes 2>/dev/null || true

echo "▶ starting new container..."
docker run -d --name hermes --restart unless-stopped -p 127.0.0.1:8642:8642 -v "$HERMES_DATA_DIR:/opt/data" -v "$HERMES_WORKSPACE_DIR:/workspace" -e API_SERVER_HOST=0.0.0.0 -e "API_SERVER_KEY=$KEY" "$HERMES_IMAGE" gateway run

echo "▶ wait 10s for boot..."
sleep 10

echo
echo "=== docker ps ==="
docker ps --filter name=hermes

echo
echo "=== /health ==="
curl -sS -m 5 http://127.0.0.1:8642/health || echo "(health check failed)"
echo

echo "=== last 20 log lines ==="
docker logs --tail 20 hermes 2>&1 || true

echo
echo "done."
echo "hermes 看到的工作目录: 容器内 /workspace"
echo "宿主机对应路径:       $HERMES_WORKSPACE_DIR"
echo "meta-staff 暴露 URL:  http://49.233.191.112:8080/static/workspace/<file>"
