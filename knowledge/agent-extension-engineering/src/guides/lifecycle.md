---
type: Guide
title: "Publishing and retiring extensions"
description: "Choose what consumers receive in a release and plan what changes for them on upgrade or retirement."
tags: ["publish", "deprecate", "migrate", "retire", "version", "rollback"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T01:53:47Z" }
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
