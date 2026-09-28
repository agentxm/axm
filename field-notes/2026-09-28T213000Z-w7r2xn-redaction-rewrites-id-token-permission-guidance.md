---
observed_at: "2026-09-28T21:30:00Z"
session: "6f472f88"
area: "registry-client credential redaction, CLI error envelope suggestions"
---

# Credential redaction rewrote a GitHub Actions permission in a recovery suggestion

## Context

Adding a recovery suggestion to the typed failure a GitHub Actions job gets
when it cannot obtain a workload token, and asserting the suggestion text in a
process-boundary e2e test through `axm whoami --json`.

## Friction

A suggestion whose text named the YAML permission "id-token: write" reached the
JSON envelope with that value replaced by [REDACTED]. The key-value rule in
`redactCredentialShapes` matches `token` followed by a colon and a value, so
the permission name was treated as a credential. The unit specification that
builds the failure directly passed; only the envelope rendering showed the
rewrite.

## Cost / impact

One failed e2e run and a rewording of the suggestion to avoid the `token: word`
shape; the literal YAML stays only in the help topic and quickstart, which are
not redacted.

## Outcome

The suggestion now reads "Add `id-token` with `write` access to the job's
`permissions` ...". The redaction rule was not changed.

## Evidence

e2e assertion failure: expected the whoami JSON envelope to contain
"id-token: write"; the rendered suggestion read "Grant the job permissions:
id-token: [REDACTED] so it can request a GitHub Actions ID token."

## Existing context

None found in this directory.
