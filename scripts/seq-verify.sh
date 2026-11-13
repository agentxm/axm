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
# Establish query access before a short-lived capture hits a fresh authenticated
# collector. A healthy node alone does not establish credential or ingestion readiness.
mise exec -- seqcli query -q 'select 1 as ready' --json > /dev/null
receipt_dir=$(mktemp -d "${TMPDIR:-/tmp}/seq-probe.XXXXXXXX")
trap 'rm -rf "$receipt_dir"' EXIT
receipt="$receipt_dir/receipt.json"
if [[ -n "$(git status --porcelain)" ]]; then
  export AXM_TRACE_BUILD_DIRTY=1
else
  export AXM_TRACE_BUILD_DIRTY=0
fi
AXM_TRACE=1 AXM_TRACE_RECEIPT="$receipt" AXM_TRACE_ENDPOINT="${SEQCLI_CONNECTION_SERVERURL%/}/ingest/otlp/v1/traces" AXM_TRACE_BUILD_REVISION="$(git rev-parse HEAD)" pnpm run axm --version >&2
cat > "$receipt_dir/expected.json" <<'JSON'
{"spans":[{"name":"axm.cli.invocation","count":1},{"name":"axm.cli.execution","count":1,"parentName":"axm.cli.invocation"},{"name":"axm.cli.command","count":1,"parentName":"axm.cli.execution"}]}
JSON
for attempt in {1..10}; do
  if pnpm -s trace:inspect --receipt "$receipt" --expect "$receipt_dir/expected.json" > "$receipt_dir/inspection.json" 2> "$receipt_dir/query-error"; then
    cat "$receipt_dir/inspection.json"
    exit 0
  fi
  sleep 0.2
done
printf 'Seq probe evidence is incomplete. Check ingestion permissions, exporter configuration, and Seq disk reserve.\n' >&2
cat "$receipt_dir/inspection.json" >&2
cat "$receipt_dir/query-error" >&2
exit 1
