---
type: Provider
title: "npm distribution for AXM"
description: "Registry publication and account-authority boundaries for AXM release packages and local previews."
status: draft
generated:
  by: codex/gpt-6
  at: 2026-09-11T16:07:00Z
---

# npm distribution for AXM

## Relationship and scope

npm distributes the packages selected by the `release:cli` cohort in
[Nx configuration](../../nx.json), including the public CLI package `axm.sh`.
Package names and membership remain in the project manifests and release
configuration, not a second inventory here. This record covers distribution;
package-manager execution in development remains part of the repository toolchain.

## Publication and access

The [publish workflow](../../.github/workflows/publish.yml) owns canonical
publication of exact CI-produced tarballs and npm provenance. Follow
[Release the CLI](../runbooks/release-cli.md) for gates, partial publication,
immutable reuse, and superseded candidates.
[Local preview publication](../runbooks/publish-local-preview.md) instead uses
the operator's npm login under a non-default dist-tag, without provenance.
These are different operating identities and must not be treated as equivalent
authority. npm package/account settings own actual publisher permissions and
trusted-publishing configuration; the workflow is evidence of intent only.

## Constraints and relationship gaps

Registry replacement or publication-access loss affects npm consumers and
release completion. An ambiguous write is not permission to repeat publication;
the canonical workflow owns settlement and recovery. Account/organization
identity, publisher roster, recovery owner, commercial plan, billing/budget
authority, renewal/cancellation conditions, and agreement/SLA references are
unverified and require the authorized npm administrators. No account inspection
or publication was performed on 2026-09-11.

## Accountability, gaps, and maintenance

Documentation maintainer: [@craigsmitham](https://github.com/craigsmitham), under
the [adoption declaration](../README.md). Relationship accountability and recovery contacts remain gaps; repository maintainers must obtain them from npm account/package settings.

Review this record when cohort membership, trusted publication, preview access, registry policy, or account administration changes.
