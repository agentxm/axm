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
receipt_dir=$(mktemp -d "${TMPDIR:-/tmp}/seq-probe.XXXXXXXX")
trap 'rm -rf "$receipt_dir"' EXIT
receipt="$receipt_dir/receipt.json"
AXM_TRACE=1 AXM_TRACE_RECEIPT="$receipt" AXM_TRACE_ENDPOINT="${SEQCLI_CONNECTION_SERVERURL%/}/ingest/otlp/v1/traces" pnpm run axm --version
trace_id=$(node --input-type=module -e 'import {readFileSync} from "node:fs"; const receipt=JSON.parse(readFileSync(process.argv[1], "utf8")); if (!/^[a-f0-9]{32}$/.test(receipt.traceId)) process.exit(1); console.log(receipt.traceId)' "$receipt")
for attempt in {1..10}; do
  if node --input-type=module -e 'import {spawnSync} from "node:child_process"; const r=spawnSync("mise", ["exec", "--", "seqcli", "trace", "--id="+process.argv[1], "--json", "--logs"], {stdio:"inherit", timeout:5000}); process.exit(r.status ?? 1)' "$trace_id" > "$receipt_dir/trace.json" 2> "$receipt_dir/query-error"; then
    if node --input-type=module -e '
      import {readFileSync} from "node:fs";
      const trace=JSON.parse(readFileSync(process.argv[1], "utf8"));
      const receipt=JSON.parse(readFileSync(process.argv[2], "utf8"));
      const nodes=[]; const visit=(node)=>{ if(node) { nodes.push(node); for(const child of node.children ?? []) visit(child); } }; visit(trace.root);
      const valid=trace.complete === true && trace.traceId === receipt.traceId && trace.root?.spanId === receipt.spanId;
      process.exit(valid ? 0 : 1);
    ' "$receipt_dir/trace.json" "$receipt"; then
      cat "$receipt_dir/trace.json"
      exit 0
    fi
  fi
  sleep 0.2
done
printf 'Seq did not return probe trace %s. Check ingestion permissions, exporter configuration, and Seq disk reserve.
' "$trace_id" >&2
cat "$receipt_dir/query-error" >&2
exit 1
