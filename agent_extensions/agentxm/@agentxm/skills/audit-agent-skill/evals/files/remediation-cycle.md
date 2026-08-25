# Accepted synthetic audit findings

Target: the complete canonical package at
`.axm/extensions/@example/skills/format-release-notes`, version `0.2.0`.

Compute and preserve its exact pre-change content identity before editing.

Accepted pre-change findings:

- A-01: the description lacks the positive verbs “format” and “normalize” and
  has no negative boundary against publishing release notes.
- A-02: a missing input file has no explicit failure behavior.

The package otherwise has a valid manifest, a stable output contract, no
runtime scripts or external side effects, and versioned regression cases for
supplied Markdown, missing input, and the adjacent publishing boundary.
The read-only `evals/harness/check-contract.mjs` helper is trusted synthetic evaluation
source; after editing, run it from any directory and require a zero exit.

Remediation is authorized inside the named canonical target package only.
Publishing, installation, approval, and changes to any other extension are not
authorized. Preserve the pre-change findings, use the AXM and
`author-agent-skill` workflows, then perform same-agent closure verification
against the revised identity.
