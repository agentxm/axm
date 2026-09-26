---
observed_at: "2026-09-26T06:57:44Z"
session: "01a0d9de-cc8e-7ca0-b584-d186f30c10c3"
area: "public repository field-note handoff"
---

# Private tracker reference entered public field-note history

## Context

The unpublished product branch was being prepared for a public pull request.

## Friction

A public-safety scan found a private tracker identifier in six field notes, including temporary test-report paths. Editing the tip would leave the original references visible in earlier pull-request commits.

## Cost / impact

The notes needed sanitization, and the 56 unpublished commits were rewritten. Nineteen commit hashes changed, requiring a mapping for the pending tracker progress update.

## Outcome

The current tree and rewritten commit patches have no matches for the private identifier. A local old-to-new hash map was retained outside the public repository for the tracker update.

## Evidence

The pre-publication `rg` scan found six affected field notes. A scan of `git log -p` after the rewrite found no matches, and the final tree matched the pre-rewrite sanitized tree.
