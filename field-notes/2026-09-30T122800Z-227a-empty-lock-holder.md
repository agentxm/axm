---
observed_at: "2026-09-30T12:28:00Z"
session: "227a"
area: "workspace settlement verification"
---

# Empty lock holder interrupted a membership regression

## Context

Focused membership lifecycle verification exercised concurrent physical-boundary admission.

## Friction

The run passed eight cases but one add-agent case threw `SyntaxError: Unexpected end of JSON input` from the transition-lock holder reader. The lock adapter intentionally creates an empty holder placeholder before writing owner metadata; the JSON parser threw outside the typed Effect failure channel.

## Cost / impact

The CLI verification required another correction and retry. A deterministic regression was added for both empty and partial holder contents.

## Outcome

Schema JSON decoding now preserves unknown-holder contention. The focused settlement run passed 29 tests with one volume-dependent skip; it verified contenders leave the placeholder and owner hold intact, recognize the subsequent owner stamp, and acquire after release. The broader CLI retry is pending.
