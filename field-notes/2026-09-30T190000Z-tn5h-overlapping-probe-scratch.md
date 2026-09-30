---
observed_at: "2026-09-30T19:00:00Z"
session: "tn5h"
area: "native capability probe verification"
---

# Overlapping capability probes left shared scratch behind

## Context

The full source gate exercised preview purity with multiple instruction consumers.

## Friction

The preview snapshot contained an empty `.axm/tmp` after probing. One probe created the shared parent and finished while another still used it; the remaining probe did not own the parent.

## Cost / impact

The full local source gate failed after approximately 21 minutes. A deterministic overlapping-probe specification reproduced the residual `.axm` directory before the correction.

## Outcome

Each probe now owns a unique child of the existing native root. The focused instruction suites passed 53 cases, and the complete preview-purity file passed 12 cases. Full final-candidate verification remains required.
