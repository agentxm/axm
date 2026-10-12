---
observed_at: "2026-10-12T18:48:00Z"
session: "d7b42a"
area: "CLI telemetry preview"
---

# Telemetry mode wording obscured the enabling value

## Context

A diagnostic reproduction needed telemetry preview without transmission.

## Friction

The consent specification describes explicit all/errors/off controls. Setting
`AXM_TELEMETRY=all` with `AXM_TELEMETRY_PREVIEW=1` produced no preview. Inspection
of the consent cases showed that `true` enables all telemetry; an unrecognized
literal disables it.

## Outcome

Repeating the reproduction with `AXM_TELEMETRY=true` produced the expected
preview on stderr. No consent behavior was changed.

## Evidence

The reproduction used CLI 0.43.0. The wording and accepted-value examples are
in `apps/cli/src/telemetry/telemetry-consent-and-precedence.spec.ts`.
