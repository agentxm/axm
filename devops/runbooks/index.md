# AXM runbooks

Bounded procedures for releases, previews, source execution, and CI images.

- [Release the AXM CLI](release-cli.md) — Prepare, publish, inspect, and recover an authorized CLI release using exact-commit CI artifacts and the canonical publish workflow.
- [Publish a local AXM preview](publish-local-preview.md) — Publish working-tree npm packages under a non-default dist-tag for authorized iteration outside the canonical release flow.
- [Run the AXM source CLI against a workspace](run-source-cli.md) — Select another workspace explicitly when running this checkout’s source CLI, preserving toolchain and user-state boundaries.
- [Reproduce AXM Linux CI](reproduce-linux-ci.md) — Run the pinned Linux verification environment when reproducing a repository CI result locally or on a Docker-only host.
- [Upgrade the AXM CI image](upgrade-ci-image.md) — Build, verify, publish, and adopt an intentional CI-toolchain image change while retaining an immutable rollback target.
