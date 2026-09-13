---
type: Tool
title: CodeQL in AXM
status: draft
description: Managed source security analysis for AXM, including local-input threats, with source-specific review of reported findings.
---

# CodeQL in AXM

AXM uses GitHub's managed CodeQL default setup for source security analysis.
It complements [Gitleaks](gitleaks.md), dependency advisories, architectural
boundaries, and executable specifications. CodeQL does not establish those
other checks or the correctness of application authorization.

## Configuration and execution authority

The repository's **Settings → Advanced Security → CodeQL analysis** owns its
configuration. GitHub manages the scanner distribution and generated workflow;
there is no parallel repository-owned CodeQL workflow or local Nx wrapper.
Use [GitHub's default setup guidance](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configure-code-scanning)
for supported triggers, language detection, and access prerequisites. Repository
administration belongs to the [GitHub provider record](../providers/github.md).

The September 13, 2026 API readback reported configured default setup, the
default query suite, standard GitHub runners, a weekly schedule, and
`remote_and_local` threat sources. The
[configuration validation run](https://github.com/agentxm/axm/actions/runs/34744403799)
successfully analyzed JavaScript/TypeScript, Python, and GitHub Actions at
`60a4f0b8d24510c2153c47041e71a822e3c852d8` and uploaded all three analyses.
That is execution evidence for that revision, not a claim that findings are
resolved or that later revisions passed.

Local inputs matter because AXM reads workspace content and command arguments.
GitHub describes [threat-model customization](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/manage-your-configuration/edit-default-setup#including-local-sources-of-tainted-data-in-default-setup)
as a preview feature. Its language-availability prose is narrower than the
validated configuration and JavaScript/Python local-source findings observed
here. Recheck the API readback and actual analyses when changing this option;
do not infer coverage from the option's name alone.

## Reading results

Use the repository's [code-scanning results](https://github.com/agentxm/axm/security/code-scanning)
and the analysis run associated with the changed revision. For read-only
configuration inspection, the supported GitHub CLI entry is
`gh api repos/agentxm/axm/code-scanning/default-setup`.
The [code-scanning REST API](https://docs.github.com/en/rest/code-scanning/code-scanning)
also exposes analysis errors, scanned revisions, and paginated alert details.

Review each reported flow against the owning command or capability: identify
who controls the source, the operation's intended authority, and the reachable
sink. A command accepting an explicitly selected filesystem path does not by
itself establish an unintended path escape. Test fixtures and acquired
extensions still require ownership and reachability review; neither their
location nor a scanner severity is a disposition. Make any dismissal specific
to the finding and its evidence. Do not exclude whole directories to remove
the initial baseline.

## Limits, support, and recovery

Default setup supplies analysis and alerts. It does not automatically add a
required status check or a code-scanning merge rule. The
[CI workflow](../../.github/workflows/ci.yml) and repository protection settings
own delivery gates. Review and calibrate the existing findings before deciding
which severities should block changes; see
[GitHub's merge-protection guidance](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/manage-your-configuration/edit-default-setup#defining-the-alert-severities-that-cause-a-check-failure-for-a-pull-request).

For a missing or failed scan, inspect its selected revision, language jobs,
upload result, and current configuration. An enabled setting or empty result
list is insufficient evidence of a successful analysis. Prefer managed
configuration changes over an additional workflow unless an observed coverage
gap requires advanced setup.

Documentation maintenance follows the [adoption declaration](../README.md).
Repository tooling maintainers support configuration and failed executions;
the code owner reviews reported behavior. An individually assigned security
review owner remains undocumented. Revisit this record when language coverage,
threat models, query selection, merge policy, or the hosted service changes.
