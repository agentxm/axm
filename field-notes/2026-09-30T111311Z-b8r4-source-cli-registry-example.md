---
observed_at: "2026-09-30T11:13:11.823448+00:00"
session: "f7ab31c9"
area: "axm-cli-interactions"
---

# Source CLI runbook Registry name is rejected

## Context

Running source CLI 0.37.3 in disposable workspaces with isolated AXM user settings using `devops/runbooks/run-source-cli.md`.

## Friction

The runbook example names its Registry `local`. The CLI rejected those settings before lint or sync could inspect the fixture: `defaultRegistry: registry name must start with a letter or digit, contain only lowercase alphanumeric characters, hyphens, and dots, and must not be an intrinsic source name`.

## Cost / impact

The fixture initialization and affected commands had to be retried after changing the named source and its selection.

## Outcome

Using `review-fixture` for both the source name and `defaultRegistry` allowed the disposable probes to proceed.

## Evidence

`devops/runbooks/run-source-cli.md`, source CLI version 0.37.3, validation exit code 9.
