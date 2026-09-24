---
observed_at: "2026-09-24T20:25:00Z"
session: "cb804d88-8d8a-44e8-94a4-438b3abcda6e"
area: "work-item attachment used as the implementation brief"
---

# Audit document clipped every proposed owner and deletion list mid-sentence

## Context

Implementing the owner-bypass consolidation from a work item whose per-finding
detail lives in an attached audit document. The document states that its text
is clipped and that a workflow journal holds the full return values.

## Friction

In every finding entry the `Proposed owner`, `Deletes`, `Specs`,
`Operator-visible`, and `Risk` fields end with `…` part way through a sentence,
including the published-source rule, the reuse predicate name and inputs, the
adopt copy-matching rule, and the list of call sites to delete. The workflow
journal was not attached or linked from the work item.

## Cost / impact

Each of the nineteen findings needed the cited files read in full to
reconstruct the intended deletions and owner shape, and four design points
(published-source rule, canonical-tree reuse for local and Git sources,
Knowledge drift policy, adopt copy matching) were decided from the surrounding
architecture rather than from the audit's recorded proposal.

## Outcome

The work proceeded from the decisions recorded in the work item plus the
binding architecture documents; the clipped proposals were not recovered.

## Evidence

- Work item attachment titled `Audit findings — remaining owner bypasses`,
  opening paragraph: "Text is clipped; the workflow journal holds the full
  return values."
- Example clipped field: `Deletes: desired-state-graph.ts: withVersionConstraint
(284-291) and the source: rewrite ternary inside the orderedNodes map
(≈1019-1027), so settled nodes keep their declared source;
configured-entry-resolution.ts: the …`
