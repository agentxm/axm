---
type: Attested Computation
title: "{{Human-readable display name}}"
description: "{{One sentence: what this computes and whose definition it follows.}}"
tags: ["{{tag}}"]
status: stable
# REQUIRED for this type. Defines how the computation runs and what `parameters` mean.
runtime: "{{bigquery | postgres | dbt | python | Looker}}"
# The typed, named holes an agent may fill. Values only — never the computation itself.
parameters:
  - { name: "{{year}}", type: "{{integer}}", required: true }
# Use EITHER this path OR the `# Computation` body block below — never both.
# computation: references/computations/{{name}}.sql
executor:
  resource: "references/skills/{{run-instructions}}.md"
  receipt: ["{{job_id}}", "{{executed_sql}}", "{{result}}"]
attester:
  resource: "references/attesters/{{name}}.py"
generated: { by: "{{producer}}/{{version}}", at: 2026-01-01T00:00:00Z }
verified: { by: "human:{{id}}", at: 2026-01-01T00:00:00Z }
stale_after: 2027-01-01
sources:
  - id: "{{policy-key}}"
    resource: "{{https://...}}"
    title: "{{Policy or standard this computation implements}}"
---

# Computation

    {{SELECT ... WHERE fiscal_year = @year}}

{{One or two sentences on what the computation binds and which policy governs it.}}[^{{policy-key}}]

[^{{policy-key}}]: {{Policy or standard title}}
