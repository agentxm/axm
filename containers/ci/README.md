# AXM CI Image

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

Trusted self-hosted runs reuse separate Docker volumes for the pnpm store and
Nx cache. Their names are scoped to this repository, the host architecture, the
digest-pinned image, and the lockfile contents. Pull-request jobs run only on
ephemeral GitHub-hosted runners, so untrusted changes cannot read or write the
persistent trusted-runner caches. The PR workflow restores separate,
branch-scoped GitHub Actions caches into host directories and bind-mounts them
into the container. The Nx cache includes task artifacts and the
database-backed metadata Nx uses to recognize their provenance; the launcher
does not disable Nx's unknown-cache safety check. Nx saves use commit-specific
immutable keys and can restore compatible entries from an earlier commit on
the same branch. An exact Actions cache restore that yields no Nx task hits
fails verification instead of silently rerunning the workspace. `node_modules`
remains an anonymous volume and is never persisted across runs. For recovery
or cache rotation, operators may set `AXM_CI_PNPM_CACHE_VOLUME` and
`AXM_CI_NX_CACHE_VOLUME` to another Docker volume name or absolute bind-mount
path.

Retain every semantic version used by CI and the previous known-good digest for
rollback. Keep the newest 30 `sha-*` references; unreferenced commit references
older than 90 days may be removed during routine package maintenance.
