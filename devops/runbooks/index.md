# AXM runbooks

Bounded procedures for releases, integration, source execution, and Linux CI reproduction.

- [Release the AXM CLI](release-cli.md) — Prepare, publish, inspect, and recover an authorized CLI release using exact-commit CI artifacts and the canonical publish workflow.
- [Integrate changes](integrate-changes.md) — Share unfinished work across machines and integrate an accepted, locally verified change into main.
- [Run the AXM source CLI against a workspace](run-source-cli.md) — Select another workspace explicitly when running this checkout’s source CLI, preserving toolchain and user-state boundaries.
- [Reproduce AXM Linux CI](reproduce-linux-ci.md) — Reproduce a failed Linux verification job using its exact revision and native toolchain.
