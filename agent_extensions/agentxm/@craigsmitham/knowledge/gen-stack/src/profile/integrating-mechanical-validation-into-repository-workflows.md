---
type: Guide
title: Integrating Gen Stack mechanical validation into repository workflows
description: Use when an adopted repository wants repeatable OKF, structural-profile, and relationship-projection checks in Git hooks or CI; validate exact staged or committed state while keeping semantic review, coverage, fitness, and release decisions separate.
tags: [gen-stack, validation, git-hooks, continuous-integration, okf, relationships]
status: stable
sources:
  - id: application-profile
    resource: gen-stack-application-profile.md
    title: Gen Stack application profile for OKF v0.2
generated:
  by: codex/gpt-5.6
  at: 2026-08-27T01:11:07Z
---

# Integrating Gen Stack mechanical validation into repository workflows

> **Authority:** This Guide applies the canonical meaning in the [Gen Stack
> vocabulary and relationship model](/glossary.md). The [Gen Stack application
> profile](/profile/gen-stack-application-profile.md) owns governed corpus
> representation. This Guide owns operational selection advice for hooks and
> CI; it adds neither semantic authority nor profile-conformance rules.

Use this guide after a repository has adopted the supported Gen Stack profile
and needs local feedback plus an authoritative continuous-integration gate. For
initial establishment, use [Adopting Gen Stack](../adopting-gen-stack.md). The
package's `knowledge/gen-stack/scripts/README.md` owns every command, result
layer, dependency, and exit meaning.

## Goal

Run the canonical non-mutating mechanical gate against the exact repository
state being accepted. Do not let that gate claim semantic review, coverage,
fitness, merge authority, or release authority.

## Preconditions

- The adopting repository contains its supported corpus at `gen-stack/`.
- The repository can invoke the packaged CLI and its documented dependencies.
- The validator version has a named pinning and update policy.
- A named human or institutional workflow owns semantic review and any
  coverage, fitness, merge, or release decision.

## Representation

The integration is repository-native configuration: a hook-manager entry,
shell hook, and/or CI workflow that invokes the canonical CLI. It is not a
governed Gen Stack corpus concept and must not be copied into `gen-stack/`.
Keep the command in one reusable repository script when several hosts need it,
then let hooks and CI call that script.

## Choose the enforcement points

Use this default:

1. **Pre-commit for fast feedback** — validate the exact Git index with
   `check --view git-index`. Keep it quick and allow an explicitly documented
   emergency bypass supplied by the repository's hook framework.
2. **CI as the authoritative gate** — validate the committed tree with
   `check --revision HEAD`. CI cannot be bypassed by a local hook setting and
   binds the result to the revision under review.
3. **Pre-push only when useful** — add the committed-tree check when the
   repository benefits from catching failures before network work. Do not make
   it the sole authority.

Do not put semantic review, coverage assessment, evaluation execution, release
approval, or relationship synchronization in a Git hook. Those activities
have different evidence, latency, authority, or mutation semantics.

## Validate the selected state, not a nearby state

For pre-commit, always select `git-index`. Reading the working tree can validate
unstaged content that will not be committed or miss the effect of a staged
deletion. The CLI materializes the index as one Git tree and refuses unmerged
entries or an index that changes during capture.

For CI and pre-push, select a revision. `--revision HEAD` resolves and records
the exact tree. A workflow validating a merge result, tag, or supplied commit
may pass that revision instead, but it should not silently fall back to the
working tree.

The check evaluates the complete selected `gen-stack/` corpus. A path filter
may decide whether to invoke it, but must never reduce validation to changed
files: indexes, identities, subjects, target resolution, reachability, cycles,
and reciprocal projections are corpus-wide properties.

Trigger the check when any of these change:

- `gen-stack/**`;
- the repository wrapper, hook, or CI workflow that invokes the check;
- the pinned Gen Stack knowledge/tool version; or
- the AXM/OKF validation integration that determines the native layer.

When trigger configuration is hard to keep complete, run the check
unconditionally.

## Keep repair explicit and outside the gate

Never call a mutating synchronizer from pre-commit, CI, or a read-only
validation wrapper. When relationship projection fails, inspect the
authoritative assertion, run the documented synchronizer deliberately against
the intended working tree, review and stage its changes, then rerun the exact
state check. Automatic repair can change the accepted input or hide an invalid
assertion source.

## Verify the integration

Exercise the repository integration with public-safe synthetic changes:

1. Run the working-tree, index, and committed-tree commands on a known-good
   corpus and confirm their `input.kind` and tree identity.
2. Stage a profile-invalid edit while leaving a different unstaged edit; prove
   the index check sees only the staged state.
3. Stage a deletion and a rename; prove whole-corpus validation catches broken
   references or reachability.
4. Create an unmerged index and confirm exit `2` rather than a partial check.
5. Make a relationship assertion without synchronizing its reciprocal and
   confirm exit `1` with the relationship-projection layer failed.
6. Remove AXM from the execution environment and confirm exit `2` with OKF
   validation unavailable.
7. Confirm neither the hook nor CI changes the working tree or index.
8. Confirm CI protection, not the local hook, is the merge authority.

## Final check

- Pre-commit validates `git-index`; CI validates an exact revision.
- Every invocation validates the complete corpus and is non-mutating.
- CI is authoritative; hooks provide feedback.
- The CLI's unavailable/error result remains distinct from corpus findings.
- Repair is explicit, reviewed, and outside hooks and CI.
- Semantic review, coverage, fitness, and release decisions retain named
  owners and never inherit a mechanical pass.
