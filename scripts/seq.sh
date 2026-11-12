#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export SEQCLI_CONNECTION_SERVERURL="${SEQCLI_CONNECTION_SERVERURL:-http://127.0.0.1:5341}"
node --input-type=module -e '
  let u;
  try { u = new URL(process.env.SEQCLI_CONNECTION_SERVERURL); } catch { console.error("Invalid local Seq URL"); process.exit(1); }
  if (!["http:", "https:"].includes(u.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) || u.username || u.password || u.search || u.hash) {
    console.error("Local Seq workflows require a loopback HTTP URL without credentials, query, or fragment"); process.exit(1);
  }
'
action="${1:-status}"
if (( $# )); then shift; fi
case "$action" in
  start)
    docker compose -f tools/seq/compose.yaml up -d
    exec mise exec -- seqcli node health --server=http://127.0.0.1:5341 --wait-until-healthy --timeout=30000
    ;;
  stop) exec docker compose -f tools/seq/compose.yaml stop ;;
  status) exec mise exec -- seqcli node health --timeout=5000 --json ;;
  *) exec mise exec -- seqcli "$action" "$@" ;;
esac
