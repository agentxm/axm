---
type: Guide
title: "Publishing and retiring extensions"
description: "Choose release contents, revisit guidance when upstream contracts change, and plan consumer migrations."
tags: ["publish", "deprecate", "migrate", "retire", "version", "rollback", "upstream"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T03:08:32Z" }
sources:
  - id: okf
    resource: https://github.com/craigsmitham/agent-extensions/blob/64a2a8f9f44b303971de1ef1147814b65c2f4b96/skills/okf/src/SKILL.md
    title: OKF skill upstream revision and refresh guidance
  - id: effect
    resource: https://github.com/craigsmitham/agent-extensions/blob/64a2a8f9f44b303971de1ef1147814b65c2f4b96/packs/effect/README.md
    title: Effect pack supported range and reviewed release
---

# Publishing and retiring extensions

## Choose what ships

Suppose a skill's package root contains an `AGENTS.md` for repository
maintainers, an `evals/` directory used only in CI, and a sample invoice the
README asks installed users to classify. Exclude the maintainer instructions
and internal evals. Ship the sample invoice along with the reference table the
skill reads to classify it. The README gives the fixture a consumer even
though the author also uses it in tests.

Compare that decision with the candidate archive. If the table is present in
the checkout and missing from the archive, the installed example still fails.
For AXM's selection rules and archive preview, see `axm help publish`.

## When an upstream change calls for a review

For guidance that depends on a standard or host feature, record the revision
you checked alongside the versions you intend to support. The Effect pack
reports both, so a reader can tell which release supplied the evidence.[^effect]

For example, consider a skill that teaches how to describe an optional field.
If a new standard makes the field mandatory, revisit the instruction, the
template that omits the field, and the validator that accepts that template.
Try an example with and without the field against the new revision before
extending the support claim. Until then, a user asking about the newer
revision should be able to see which rules the skill actually checks.
The OKF skill ties its instructions, templates, and validator to an explicit
upstream refresh in this way.[^okf]

## Replace or retire a release

Start a migration note with the task a consumer performs today. If two writing
skills become one release-note editor, name the surviving editing workflow and
say where general correspondence now goes. When there is no successor for a
task, say so. Point readers to an available replacement by its exact identity.

Try the migration from a representative existing workspace. A skill installed
directly can remain active after its former pack is replaced, leaving two
editors competing for the same request. Check which editors the host still
offers. Record the prior versions and selections if consumers need a way back.

For publication and release verification in AXM, see `axm help publish`.
Registry confirmation establishes which version is available. To find out
whether consumers can use it, exercise the task after upgrading.

[^effect]: Effect pack README, supported major version and reviewed patch release.

[^okf]: OKF skill, pinned specification and coordinated refresh.
