# Capture format

Use this template as a compact record, not a completeness checklist. Include
only relevant information already available from the task.

```markdown
---
observed_at: "<ISO-8601 UTC timestamp>"
session: "<opaque session ID | unknown>"
area: "<tool, environment, instruction, or task surface>"
---

# <Specific friction in a short phrase>

## Context
What the agent was trying to accomplish and relevant known conditions.

## Friction
What happened and how it impeded the work. Include expected behavior only when
its basis is already known.

## Cost / impact
The observed extra work, delay, resource use, user effort, effect on task
completion, reduced output quality, or remaining uncertainty. Include concrete
counts or measurements when available; do not estimate. Distinguish the
friction's overhead from work the task inherently required.

## Outcome
How the attempt ended, including any recovery or workaround already performed.

## Evidence
The minimum safe evidence already available to understand or verify the
occurrence, such as a command result, error code, file reference, version, or
observed interaction.

## Existing context
Optional. A relevant constraint, explanation, related occurrence, or possible
remedy already established or considered during the task. Preserve its existing
uncertainty and omit this section when nothing useful is already known.
```

Do not add analysis to fill a section. Omit unknown optional material. For an
unknown measurement, say `not measured` only when that distinction helps later
analysis. Never record credentials, authorization material, opaque response
bodies, or unreviewed values that may contain sensitive data.
