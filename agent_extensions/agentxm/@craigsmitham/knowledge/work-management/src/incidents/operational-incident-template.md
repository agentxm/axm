---
type: Reference
title: Operational Incident Record template
description: Provides a current-state-first, tracker-neutral body fallback for operational impact and response coordination.
tags: [incident, operational-incident, template, markdown, current-state, chronology]
generated: { by: codex/gpt-5.6, at: 2026-08-29T19:30:08Z }
---

# Operational Incident Record template

Use native incident fields and response surfaces when they carry the meaning
exactly. Keep the live current-state section ahead of chronology. Omit
inapplicable headings.

```markdown
# <Affected service or capability> <current impact>

## Current state

- **Impact:** <current affected users, workflows, regions, data, or business
  outcomes and relevant uncertainty>
- **Started:** <time and timezone, or best-known bound>
- **Severity:** <local value and evidence basis>
- **Response state:** <investigating, mitigating, monitoring, restored,
  recovering, or another local state>
- **Active control:** <current mitigation, containment, rollback, or observation>
- **Next update:** <time, condition, or handoff point>

## Coordination

- **Incident lead:** <current command responsibility>
- **Delegated roles:** <operations, investigation, communications, or other
  local responsibilities>
- **Objectives:** <current response objectives in priority order>
- **Channels:** <safe response and communication locations>
- **Related:** <alerts, incidents, Defect Reports, Changes, reviews, or recovery>

## Chronology

| Time | Observation, decision, action, result, or communication | Source or actor |
| --- | --- | --- |
| <time> | <entry preserving what was known then> | <identity> |

## Transition and exit

- **Mitigation and observed effect:** <bounded action and result>
- **Restoration and recovery:** <current state, residual impact, and remaining
  work>
- **Exit or closure conditions:** <observable conditions and local authority>
- **Handoff:** <receiving owner, current truth, next action, and timing>
- **Residual risk and follow-up:** <independently owned items and reopening
  trigger>
```
