---
name: audit-docs
description: >
  Audits a bounded documentation corpus and produces a snapshot-bound,
  evidence-backed report on discovery, form fit, accuracy, authority,
  freshness, consistency, coverage, and maintainability. Use when asked to
  audit documentation, assess documentation health, identify documentation
  gaps or staleness, or evaluate a documentation set before remediation. Not
  for writing or fixing docs, reviewing one known document, checking only
  links or formatting, or auditing broader repository or agent context.
---

# Audit docs

Diagnose a bounded documentation corpus without changing it. When a request
includes both audit and remediation, complete the diagnostic first and hand
accepted findings to the appropriate authoring workflow.

## Workflow

1. **Resolve the audit contract.** State the question, included and excluded
   scope, audience, applicable authority, and repository revision, release, or
   observation time. Infer the narrowest useful scope when safe; ask only when
   materially different scopes would change the result.
2. **Read local authority.** Inspect repository instructions, the bounded docs,
   and authoritative product or domain sources available in scope. Then read
   `knowledge/docs/src/explainers/documentation-audits.md`
   and follow
   `knowledge/docs/src/guides/auditing-documentation.md`.
   Open only the linked craft concepts needed for the selected dimensions.
3. **Choose dimensions.** Select the relevant concerns rather than applying a
   universal scorecard: discovery and organization, reader-job and form fit,
   accuracy and completeness, conceptual coherence, authority and provenance,
   freshness and lifecycle, duplication, reader journeys, or maintainability.
   When action-oriented documents are in scope, discovery and form fit include
   whether a context-free title and description expose both the situation or
   intent that makes the document relevant and the outcome it supports. Keep
   that selection condition distinct from preconditions; require a literal
   triggering event only for event-driven work or a Process enactment.
4. **Inventory and declare coverage.** Use a path census, full bounded review,
   purposeful sample, journey sample, or an explicit combination. Record the
   population, selection method, reviewed items, and blind spots.
5. **Gather evidence.** Run existing read-only validators and inspect browsing,
   search, content, links, and representative reader journeys as applicable.
   Do not install tools or mutate files. Treat lint success as evidence about
   deterministic rules, not proof of accuracy or usefulness.
6. **Form findings.** Separate wrong, inconsistent, stale, unverifiable, and
   merely unconventional conditions. Give each material finding an ID, title,
   severity, confidence, condition, evidence, impact, expected state,
   recommendation, and route. Group instances only when they share a cause and
   remediation owner.
7. **Report and stop.** Present the report in this order:
   - scope and snapshot;
   - overall disposition;
   - coverage and method;
   - strengths to preserve;
   - findings, ordered by severity and remediation dependency;
   - recommended remediation order;
   - limitations and unresolved evidence; and
   - handoff.

Use **sound within audited scope**, **targeted remediation**, **structural
remediation**, or **insufficient evidence** as the overall disposition when one
fits. Do not collapse unlike qualities into a numeric health score.

## Authority and completion

An audit-only request authorizes read-only inspection and diagnostic commands,
not documentation changes. If product truth cannot be verified, report the
uncertainty and its owner rather than inventing it. Route accepted writing,
organization, link repair, or stale-content work to `author-docs`; route
broader agent-context or workspace-context assessment elsewhere.

Finish when every broad claim is supported by the declared coverage, findings
are traceable to evidence, strengths and limitations are visible, and each
recommendation has a next route. Do not imply that authoring smoke tests,
package lint, or this report constitute independent approval.
