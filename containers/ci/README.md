# AXM CI Image

`ghcr.io/agentxm/axm-ci` is AXM's public, source-free Linux CI toolchain. The
repository builds and publishes it independently from AXM releases and from the
private AgentXM platform.

The image contains the Node, pnpm, and Bun versions declared by `mise.toml`,
plus Linux build tools and `actionlint`. It contains no repository source,
dependencies, Git metadata, credentials, or user state.

## Versioning and publication

- `VERSION` is the immutable semantic image version.
- `sha-<commit>` identifies the multi-architecture build from one repository
  commit.
- `latest` is a convenience tag and is never a required-CI input.
- Required CI pins `<version>@sha256:<digest>` after the semantic image has been
  published and verified. The active consumer pin lives in `CI_IMAGE`.

The CI image workflow builds amd64 and arm64 once, smoke-tests and scans those
exact artifacts, promotes them without rebuilding, publishes SBOM and
provenance attestations, and verifies anonymous pull access and public OCI
source metadata. The first publication remains private until a package
administrator changes `axm-ci` to public in the GitHub package settings; that
one-way visibility change is required before the publication verification job
and any consumer pin update can succeed.

Retain every semantic version used by CI and the previous known-good digest for
rollback. Keep the newest 30 `sha-*` references; unreferenced commit references
older than 90 days may be removed during routine package maintenance.
