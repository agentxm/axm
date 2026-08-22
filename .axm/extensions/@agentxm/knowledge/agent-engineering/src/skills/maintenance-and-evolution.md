---
type: How-to guide
title: How to maintain and evolve a skill
description: How observed failures become bounded revisions, regression cases, releases, and rollback decisions without fitting the skill to its own case set.
tags: [agent-skills, maintenance, evolution, regression, releases, generalization]
status: stable
generated: { by: "claude-code/claude-opus-5", at: 2026-08-22T14:21:16Z }
stale_after: 2027-02-22
sources:
  - id: dynamic-lifecycle
    resource: https://arxiv.org/abs/2607.10113
    title: Dynamic lifecycle management for Agent Skills
  - id: anthropic-skill-creator
    resource: https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md
    title: Anthropic — Skill Creator
---

# How to maintain and evolve a skill

Revise a skill from observed evidence, not from a suspicion that it could be
better. This closes the build-use-observe-improve lifecycle identified in
current Agent Skill research.[^dynamic-lifecycle]

1. **Establish the triggering evidence** — a routing miss, execution defect,
   security finding, platform drift, repeated user workaround, or the same
   improvisation recurring across independent trials. When separate trials each
   write the same helper or take the same undocumented detour, the skill should
   own that work instead of leaving every invocation to rediscover
   it.[^anthropic-skill-creator]
2. **Preserve the smallest failing case before editing.** Without it you cannot
   later prove the revision fixed anything.
3. **Change the smallest responsible contract** — metadata, instruction,
   resource, script, or compatibility claim. Changing several at once destroys
   attribution.
4. **Run the relevant regression set and representative neighboring cases.** A
   routing fix can create false positives; an execution fix can expand
   authority; a host adaptation can break the portable core.
5. **Re-audit when the trust surface moved** — code, dependencies, permissions,
   data flow, publisher, or acquisition path.
6. **Write release notes that name the change**: behavioral and authority
   changes, affected hosts, new requirements, migration needs, and rollback
   path. Do not preserve compatibility by hiding changed behavior behind an
   unchanged version.
7. **Pin or withdraw the release when a critical claim cannot be supported.**

Use the extension manager's native version and availability controls rather
than editing generated state or treating a governance label as an operational
action. For AXM-managed packages, read the
[AXM extension-management profile](platforms/axm.md) and current CLI help.

Add every confirmed failure to the regression set as you go, so the next
revision starts from a suite that already knows about this one.

## Revise for the population, not the case set

A revision is derived from a handful of observed failures but runs against every
future request, so those cases are a sample rather than the specification. A
skill that satisfies only the examples it was tuned on has been fitted to them.

Prefer a reframing that conveys the underlying reason over another constraint
bolted onto the symptom, and exercise a candidate revision against cases it was
not derived from before accepting it. Repeated tightening that fails to move a
stubborn behavior usually indicates an unclear instruction rather than an
insufficiently forceful one; see
[Instruction structure and examples](../prompts/instruction-structure-and-examples.md).

Read the trials, not only their outcomes. Work the skill caused that produced no
value is a reason to remove instructions, and it is invisible in a pass rate.

[^dynamic-lifecycle]: Dynamic lifecycle management for Agent Skills

[^anthropic-skill-creator]: Anthropic — Skill Creator
