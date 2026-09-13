---
type: Tool
title: Gitleaks in AXM
status: draft
description: Secret detection for committed history and staged or tracked changes, with exact historical exceptions and fully redacted diagnostics.
---

# Gitleaks in AXM

[mise.toml](../../mise.toml) owns the scanner version.
[Configuration](../../.gitleaks.toml) retains the complete default rule set;
[historical exceptions](../../.gitleaksignore) identify individually reviewed
commit/path/rule/line findings and explain their meaning. No test directories,
whole commits, or future revisions are exempted.

After the repository's normal toolchain preparation, run
`pnpm exec nx run axm:scan-secrets` to scan HEAD's complete ancestry, staged
content, and tracked working changes. Untracked files enter coverage when
staged; Git-ignored local environment files are outside this source gate.
`pnpm exec nx run axm:scan-secrets:staged` runs through the commit hook as well.
Install the pinned scanner with `mise install gitleaks` when needed.

[Required CI](../../.github/workflows/ci.yml) includes a dedicated host job on
every event, including documentation-only changes. It uses the same Nx target
and the existing mise-based workspace setup. The source/artifact workflows
remain independently runnable inside the pinned CI image; Git secret detection
is a separate required check. Neither the scan nor its Git-state observations
are cached by Nx.

The container launcher disables [Mise's automatic installation during command
execution](https://mise.jdx.dev/configuration/settings.html#exec_auto_install).
It uses the image's prepared toolchain; workstation scanner pins do
not trigger installation into that image's read-only tool directory.

Invocations explicitly request full redaction and ignore inline
`gitleaks:allow` comments. Review findings at their source without copying
detected values into issues or documentation. A historical exception requires
evidence that a finding is a synthetic fixture, identifier, or other
non-credential. Actual credentials require revocation or rotation through their
provider; an exception does not remedy exposure.

`pnpm exec nx run axm:test:secret-scanning` exercises native staged, working-tree,
and history detection, complete redaction, and the scope of exact exceptions in
an isolated temporary repository. It also executes the production Required CI
script and proves that failed, cancelled, skipped, or missing scanner evidence
cannot pass. The generated provider-shaped test strings have never been issued
as credentials, and the fixture removes only its own temporary directory.

## Accountability, gaps, and maintenance

Documentation maintenance follows the [adoption declaration](../README.md).
Repository tooling maintainers are the support role through CONTRIBUTING; an
individually assigned scanner owner is not documented. Source detection does
not establish hosted secret protection, token validity, dependency advisory
coverage, or SAST availability. Check CI for current execution evidence.

[Upstream Gitleaks](https://github.com/gitleaks/gitleaks) currently reserves
future releases for security patches and directs feature work to Betterleaks.
The pinned native CLI supplies the needed detection and exception capabilities
without a custom scanner or licensed Action. Reassess provider-rule coverage
and maintenance when upgrading, and rerun the contract if its
[fingerprint behavior](https://github.com/gitleaks/gitleaks#gitleaksignore)
changes.
