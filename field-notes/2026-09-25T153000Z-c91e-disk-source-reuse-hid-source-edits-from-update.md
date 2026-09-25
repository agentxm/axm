---
observed_at: "2026-09-25T15:30:00Z"
session: "c91e"
area: "workspace install: canonical reuse and footprint precision"
---

# Extending accepted-tree reuse to disk sources hid source edits from update

## Context

Making a repeated install of every kind classify as `unchanged` from the
recorded footprint. Local rules, hooks, subagents, and Knowledge still
recorded a canonical-directory `modified` footprint on repeat because their
managers re-copied the package, unlike skills, which consult
`reusableCanonicalTree` for disk sources.

## Friction

Wiring the same reuse into the four managers made the reinstall table pass
but broke the Knowledge e2e lifecycle: after editing the local source,
`axm knowledge update` kept the previous canonical content, because the
shared reuse observation compares only identity and the on-disk tree, not
the source's content. A forced skill reinstall also reported a change after
copying identical bytes.

## Cost / impact

One full local e2e run (about 6 minutes) surfaced the regression after unit
specs and `verify:affected` had passed; the reuse edits in four managers and
two test-fixture guards were then reverted and replaced by a different fix.

## Outcome

Reverted disk-source reuse. The canonical-directory replacement writers now
compare the previous and replaced tree integrity and record a footprint only
when the bytes changed, which makes the repeat classify as `unchanged`
without changing what is acquired. A second cause remained: the scoped
staging directory outside the workspace recorded a `created` footprint,
which the classifier now excludes with the same workspace-scope rule the
operation footprint already applied.

## Evidence

- Failing e2e examples: `knowledge.e2e.test.ts` "converges configured local
  Knowledge through install, update, sync, activation, and uninstall"
  (`expected ... to contain 'Updated architecture'`) and
  `skills.e2e.test.ts` "overwrites existing skill with --reinstall"
  (`expected ... to contain '1 skill already current'`).
- Classifier trace for the Knowledge repeat:
  `footprint: [{ path: "/tmp/axm-knowledge-package-.../staged", change: "created" }]`.
