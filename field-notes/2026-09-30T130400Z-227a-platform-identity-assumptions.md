---
observed_at: "2026-09-30T13:04:00Z"
session: "227a"
area: "native filesystem platform verification"
---

# Real platforms exposed identity assumptions missed on Linux

## Context

Native physical-boundary coordination passed Linux controls before real macOS and Windows workflow execution.

## Friction

The macOS case-folding volume admitted two existing case aliases concurrently. Windows refused absent case variants with the wrong physical-identity classification and admitted a mutation of the coordination namespace. Existing path spelling and namespace normalization differed.

## Cost / impact

The platform gate failed. The correction required shared resolver changes and process coverage for aliases in parent paths.

## Outcome

Existing observed-entry spelling resolution now applies to both path syntaxes; shared overlap comparison avoids implicit Windows case folding. Local path-syntax and real-filesystem controls passed for the resolver corrections. Fresh macOS and Windows execution is still required. Broader source controls must also evaluate the measured extra filesystem-read cost.
