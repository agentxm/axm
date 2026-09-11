---
type: Tool
title: "AXM CI image"
description: "Versioning, publication, retention, and rollback contract for AXM\u2019s public Linux CI toolchain image."
status: draft
source-in:
  - target: ../repositories/axm.md
    scope: containers/ci and CI-image workflows
uses-provider:
  - target: ../providers/github.md
    scope: GHCR distribution and image publication workflows
runs-in:
  - ../environments/linux-ci.md
sources:
  - id: migration-source
    resource: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/containers/ci/README.md
    title: Pre-migration repository guidance
generated:
  by: codex/gpt-6
  at: 2026-09-11T16:07:00Z
---

# AXM CI image

`ghcr.io/agentxm/axm-ci` is AXM's public, source-free Linux CI toolchain. The
repository builds and publishes it independently from AXM releases and from the
private AgentXM platform.

The image contains Node, pnpm, and Bun, plus Linux build tools and `actionlint`.
It contains no repository source, dependencies, Git metadata, credentials, or
user state. The checked-in image inputs may lead `mise.toml` during a
producer-first toolchain upgrade; after the new semantic image is published,
the consumer change updates `CI_IMAGE` and the repository toolchain pins
together.

## Versioning and publication

- `VERSION` is the immutable semantic image version.
- `sha-<commit>` identifies the multi-architecture build from one repository
  commit.
- `latest` is a convenience tag and is never a required-CI input.
- Required CI pins `<version>@sha256:<digest>` after the semantic image has been
  published and verified. The active consumer pin lives in `CI_IMAGE`.

The reusable CI image workflow builds amd64 and arm64 once on architecture-native
runners, smoke-tests and scans those exact artifacts, promotes them without
rebuilding, publishes SBOM and provenance attestations, and verifies anonymous
pull access and public OCI source metadata. Pull-request callers receive
read-only permissions and cannot promote; the trusted `ci-image-publish.yml`
entry point grants package and
attestation write access only for publication. The first publication remains
private until a package administrator changes `axm-ci` to public in the GitHub
package settings; that one-way visibility change is required before the
publication verification job and any consumer pin update can succeed.

Retain every semantic version used by CI and the previous known-good digest for
rollback. Keep the newest 30 `sha-*` references; unreferenced commit references
older than 90 days may be removed during routine package maintenance.

## Configuration and supported operation

[Container inputs](../../containers/ci/Containerfile),
[producer VERSION](../../containers/ci/VERSION), and
[consumer CI_IMAGE pin](../../containers/ci/CI_IMAGE) own the artifact definition.
The [image workflow](../../.github/workflows/ci-image.yml) and
[trusted publication entrypoint](../../.github/workflows/ci-image-publish.yml)
own build and promotion. Follow [Upgrade the CI image](../runbooks/upgrade-ci-image.md)
for a change, and [Reproduce Linux CI](../runbooks/reproduce-linux-ci.md) to use it.
Docker is the host prerequisite. The image supports Linux verification; native
platform checks remain separate. Cache persistence and isolation are owned by
the [Linux CI environment](../environments/linux-ci.md).

## Accountability, gaps, and maintenance

Documentation maintainer: [@craigsmitham](https://github.com/craigsmitham), under
the [adoption declaration](../README.md). Repository maintainers manage image changes; the package administrator and recovery-owner roster remains unverified in GitHub package settings.

Review this record when image inputs, pins, publication permissions, retention, or verification gates change.

Migration source: [pre-migration repository guidance][migration-source].

[migration-source]: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/containers/ci/README.md
