---
type: Runbook
title: "Upgrade the AXM CI image"
description: "Build, verify, publish, and adopt an intentional CI-toolchain image change while retaining an immutable rollback target."
status: draft
applies-to:
  - ../tools/ci-image.md
  - ../environments/linux-ci.md
uses-tool:
  - ../tools/ci-image.md
  - ../tools/nx.md
sources:
  - id: migration-source
    resource: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/contributing/guides/development-environment.md
    title: Pre-migration repository guidance
generated:
  by: codex/gpt-6
  at: 2026-09-11T16:07:00Z
---

# Upgrade the AXM CI image

## Preconditions and authority

Identify the intended image-input change and the current known-good consumer
digest. An authorized repository maintainer prepares the change; GitHub package
publication and visibility changes require their own administrator authority.
Docker and the repository toolchain are prerequisites. Follow the
[CI-image contract](../tools/ci-image.md) and the canonical
[image workflow](../../.github/workflows/ci-image.yml).

## Image Upgrade

AXM owns `ghcr.io/agentxm/axm-ci` in `containers/ci`. Change its inputs with an
immutable `VERSION` bump, then run `pnpm run container:smoke:ci-image` and full
`pnpm run ci`. The image workflow builds amd64 and arm64 artifacts once,
smoke-tests and scans those exact artifacts, publishes SBOM and provenance
attestations, and verifies anonymous pullability before recording the manifest
digest. Only after publication and soak should the required-CI workflow and
wrapper defaults move together to the new `<version>@sha256:<digest>` reference.
The previous digest remains the immediate rollback target.

### Upgrade Checklist

- [ ] **Toolchain matches** -- Node, pnpm, and Bun match `mise.toml`
- [ ] **Both architectures pass** -- amd64 and arm64 build, smoke, and scan
- [ ] **Publication verified** -- Public metadata, anonymous pull, SBOM, and
      provenance checks pass
- [ ] **Consumer defaults match** -- Required CI workflow and wrapper use one
      immutable reference
- [ ] **Workflow pin matches** -- Required Linux CI uses the tested release
- [ ] **Full CI green** -- `pnpm run ci` completes inside the new image
- [ ] **Rollback available** -- The prior semantic tag remains documented in
      Git history and pullable

The [producer VERSION](../../containers/ci/VERSION) may lead
[mise.toml](../../mise.toml) during a producer-first upgrade. After publication,
update the [consumer pin](../../containers/ci/CI_IMAGE) and toolchain inputs
together. The image record owns this sequencing exception.

## Completion, stop, and recovery

Retain the exact image version/digest, both architecture results, scans, SBOM,
provenance, anonymous-pull result, consumer change, and full-CI result. Stop
before consumer adoption when any publication or verification gate fails.
The soak interval and acceptance evidence are not quantified in the existing
guidance; the authorized maintainer must establish them for the candidate.
If the adopted image regresses, restore the previous tested consumer reference
and associated toolchain inputs coherently, then verify that candidate. Do not
overwrite an immutable image tag or remove the known-good artifact. An image
publication failure remains with the workflow/package administrator.

## Accountability, gaps, and maintenance

Documentation maintainer: [@craigsmitham](https://github.com/craigsmitham), under
the [adoption declaration](../README.md). Repository maintainers select image changes; package administrators control visibility and publication access. Current assignments and soak acceptance evidence remain gaps.

Review this record when image build inputs, publication gates, consumer adoption, retention, or rollback rules change.

Exercise history is unknown: this migration inspected repository sources on
2026-09-11 and did not execute the procedure. Document status does not establish
execution authority or operational readiness.

Migration source: [pre-migration repository guidance][migration-source].

[migration-source]: https://github.com/agentxm/axm/blob/42ed192e796a413246266f871da31bddfd70de10/contributing/guides/development-environment.md
