---
observed_at: "2026-09-28T18:30:00Z"
session: "70c4"
area: "cli:sync:telemetry-spec"
---

# Telemetry contract sync needs a running service

## Context

Adopting Telemetry Ingest API 0.3.0 in the CLI required refreshing
`apps/cli/specs/telemetry-openapi.json` before regenerating the client.

## Friction

`cli:sync:telemetry-spec` only fetches `/v1/openapi.json` from a running
service at `AXM_TELEMETRY_URL` and has no local-file mode. No service was
running in the session, so the published target could not refresh the
snapshot from the platform's exported contract document.

## Cost / impact

The snapshot was refreshed by copying the exported document into place and
running prettier by hand, outside the published target. Two refreshes were
needed because the contract was revised once during review.

## Outcome

The snapshot and the generated client match the accepted 0.3.0 document; the
documented sync target was not exercised.

## Evidence

`apps/cli/scripts/sync-telemetry-spec.ts` reads `AXM_TELEMETRY_URL` (default
`http://localhost:4301`) and exits 1 when the fetch fails; the two manual
refreshes each ran `pnpm exec prettier --write` and `cli:generate:telemetry-client`.
