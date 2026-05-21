#!/usr/bin/env bash
# meta-staff smoke test — drives the default 10-step workflow end-to-end
# against a running server (memory mode is fine). Run after `make server`.
set -euo pipefail

BASE="${BASE:-http://localhost:8080}"
PYTHON="${PYTHON:-python3}"

echo "→ create task"
TID=$(curl -fsS -X POST "$BASE/api/tasks" -H 'Content-Type: application/json' \
  -d '{"title":"smoke · 登录跳转修复","content":"复现：登录后停在 /login。期望：跳到 /dashboard。","source":"bug"}' \
  | $PYTHON -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "  task = $TID"

snapshot() {
  curl -fsS "$BASE/api/tasks/$TID" | $PYTHON -c "
import sys, json
d = json.load(sys.stdin)
for r in d['node_runs']:
    arts = r.get('artifacts') or []
    revs = r.get('reviews') or []
    print(f'  {r[\"run\"][\"node_key\"]:10s} -> {r[\"run\"][\"status\"]:18s} (a={len(arts)}, v={len(revs)})')
"
}

wait_for_status() {
  local node=$1 status=$2
  for _ in {1..30}; do
    local got=$(curl -fsS "$BASE/api/tasks/$TID" | $PYTHON -c "
import sys, json
d=json.load(sys.stdin)
for r in d['node_runs']:
  if r['run']['node_key']=='$node' and r['run']['status']!='rolled_back':
    print(r['run']['status']); break
" )
    [[ "$got" == "$status" ]] && return 0
    sleep 1
  done
  echo "timed out waiting for $node=$status" >&2; return 1
}

run_for() {
  local node=$1
  curl -fsS "$BASE/api/tasks/$TID" | $PYTHON -c "
import sys, json
d=json.load(sys.stdin)
for r in d['node_runs']:
  if r['run']['node_key']=='$node' and r['run']['status']=='awaiting_human':
    print(r['run']['id']); break
"
}

echo "→ wait for spec to finish AI chain → review (awaiting human)"
wait_for_status review awaiting_human
snapshot

echo "→ submit PM校对"
RUN=$(run_for review)
curl -fsS -X POST "$BASE/api/node-runs/$RUN/submit" -H 'Content-Type: application/json' \
  -d '{"kind":"prd","payload":{"text":"已校对 PRD：登录成功→/dashboard"}}' >/dev/null

echo "→ wait for audit (awaiting human)"
wait_for_status audit awaiting_human

echo "→ submit QA校对"
RUN=$(run_for audit)
curl -fsS -X POST "$BASE/api/node-runs/$RUN/submit" -H 'Content-Type: application/json' \
  -d '{"kind":"testcases","payload":{"text":"[{\"id\":\"TC-01\",\"scenario\":\"登录成功跳转\"}]"}}' >/dev/null

echo "→ wait for signoff (3-way review)"
wait_for_status signoff awaiting_human
RUN=$(run_for signoff)
echo "  signoff run = $RUN"
for ROLE in pm qa dev; do
  case $ROLE in
    pm) USERID=11111111-1111-1111-1111-111111111101 ;;
    qa) USERID=11111111-1111-1111-1111-111111111102 ;;
    dev) USERID=11111111-1111-1111-1111-111111111103 ;;
  esac
  curl -fsS -X POST "$BASE/api/node-runs/$RUN/review" -H 'Content-Type: application/json' \
    -d "{\"reviewer_user_id\":\"$USERID\",\"reviewer_role\":\"$ROLE\",\"vote\":\"approve\"}" >/dev/null
  echo "  $ROLE approve ✓"
done

echo "→ wait for accept to finish"
wait_for_status accept done
echo
echo "=== final state ==="
snapshot
echo
echo "✓ smoke ok — task $TID 通过完整 10 步工作流"
