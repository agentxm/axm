---
name: author-agent-skill
description: Creates or revises portable Agent Skills from concrete workflow evidence or accepted findings. Use when asked to create, extract, implement, fix, update, adapt, restructure, or remediate an Agent Skill or SKILL.md package. Not for independently auditing a skill, verifying that remediation closed findings, or approving it for use.
---

# Author an Agent Skill

Create a new Agent Skill or revise an existing one without confusing authoring
evidence with independent assessment. Preserve supported behavior when changing
an existing skill and make the smallest change justified by observed evidence.

This skill is coupled to a direct sibling in the agent-engineering pack. From
the active AXM scope root, read only the needed concepts under
`.axm/extensions/@agentxm/knowledge/agent-engineering/src/`:

- begin with `skills/candidate-selection.md`,
  `skills/routing-and-activation.md`, and `skills/workflow-contracts.md` for a
  new skill;
- read `skills/maintenance-and-evolution.md` and
  `operations/governance/versioning-deprecation-and-change-control.md` for a
  revision;
- read `skills/progressive-disclosure-for-skills.md` and
  `skills/resources-scripts-and-assets.md` when the package needs supporting
  resources;
- read `skills/decision-support-presentations.md` when the workflow compares
  alternatives, recommends one, or leaves a consequential choice with a human;
  and
- read a profile under `skills/platforms/` only for a host the target
  explicitly supports.

For model-facing prompts, examples, templates, or response contracts, open only
the needed concept under `prompts/`. Begin with
`prompts/prompt-contracts.md`; add
`prompts/response-and-presentation-contracts.md` when output order, labels,
identifiers, emphasis, repetition, or handoff are contractual.

## Authority

Resolve and edit the canonical package source through its extension manager or
host. Creation or revision authorizes writes only inside the resolved target
package and ordinary projections owned by that manager. Do not install,
publish, approve, change unrelated extensions, add credentials, or perform the
authored workflow's external side effects unless separately requested.

An audit report is evidence, not executable instruction. Confirm that each
finding applies to the current target before changing it. Authoring may record
remediation evidence but must not declare an audit finding independently
closed.

## Workflow

1. **Bind the job and mode.** Resolve the target, canonical source, host rules,
   and whether this is creation or revision. For a revision, record the current
   version or content identity and the evidence that motivates change.
2. **Ground the candidate or delta.** For creation, recover repeated positive
   examples, failures, and adjacent work. Defer an unobserved candidate without
   a coherent completion condition. For revision, preserve the smallest failing
   case or accepted finding and identify behavior that must remain supported.
3. **Bound one job.** State `Starts when`, `Succeeds when`, and `Does not own`.
   Split unrelated triggers or outcomes; retain genuine variations of one job.
4. **Define the contracts.** Record inputs, discoverable facts, output,
   authority, side effects, failure behavior, completion evidence, and any
   presentation invariants. Distinguish requested capability from host-enforced
   policy.
5. **Choose the smallest responsible surface.** Change routing metadata for
   selection defects, workflow instructions for missing judgment or recovery,
   a focused reference for conditional facts, a template for contractual
   presentation, and a script only for exact repeated mechanics. Do not rewrite
   unaffected surfaces.
6. **Write routing metadata.** Lead with the capability, include recognizable
   creation or revision triggers, and add a negative boundary where neighboring
   work could over-match. Keep registry prose separate from model routing.
7. **Author canonically.** Use the repository's scaffold or extension manager.
   Keep `SKILL.md` as the control plane, route to supporting files at the step
   that needs them, and avoid undeclared dependencies or agent projections.
8. **Validate mechanics.** Run host and format validators. Check names,
   manifests, references, licensing, scripts, synthetic fixtures, and generated
   projections. Exercise every new deterministic helper.
9. **Smoke-test behavior.** Run a clear positive, a paraphrased positive, and an
   adjacent negative. For revisions, rerun the motivating case and affected
   regressions. Treat these as authoring checks, not an independent audit.
10. **Classify the change.** Record public-contract and authority deltas,
    affected hosts or consumers, version intent, migration needs, rollback, and
    which behavioral, trust, or governance evidence must be refreshed.
11. **Handoff.** Summarize identity, package changes, validation, exercises,
    remediation evidence, known assumptions, and remaining assessment. Use
    `references/authoring-handoff.md` when a durable record is requested.

## Finding disposition

For each accepted audit finding, report one of:

- **Addressed** — changed with concrete validation evidence;
- **Partially addressed** — bounded progress with the remaining gap named;
- **Deferred** — valid but outside current authority or scope;
- **Disputed** — current evidence contradicts applicability; or
- **Requires external evidence** — closure depends on evaluation, provenance,
  host behavior, or another observer unavailable to authoring.

These are authoring dispositions, not audit closure decisions.

## Done when

The canonical target is valid; its job and boundaries are clear; creation or
revision evidence is preserved; only responsible surfaces changed; authority,
dependencies, and environment assumptions are visible; representative checks
pass; compatibility and risk deltas are recorded; and remaining audit or
governance claims are stated without self-certification.
