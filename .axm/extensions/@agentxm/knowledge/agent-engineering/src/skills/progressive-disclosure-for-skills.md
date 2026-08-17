---
type: Explanation
title: Progressive disclosure for skills
description: How to route from compact metadata to instructions and only then to conditional resources.
tags: [agent-skills, progressive-disclosure, context, routing, references]
status: stable
generated: { by: "codex/gpt-5.6", at: 2026-08-14T19:36:04Z }
stale_after: 2027-02-14
sources:
  - id: agent-skills-spec
    resource: https://agentskills.io/specification
    title: Agent Skills specification
---

# Progressive disclosure for skills

Agent Skills use staged context loading:[^agent-skills-spec]

```text
name + description -> SKILL.md body -> conditional references or resources
```

Each stage makes a different decision:

| Stage        | Decision                                                                |
| ------------ | ----------------------------------------------------------------------- |
| Metadata     | Is this skill relevant enough to activate?                              |
| Instructions | Which workflow, branch, and resource applies?                           |
| Resource     | What detailed fact, template, or deterministic operation is needed now? |

## Design consequences

- Metadata should route, not summarize the whole body.
- `SKILL.md` should be the control plane, not an encyclopedia.
- Link each conditional resource at the step that needs it and say why.
- Keep references focused and shallow; avoid chains that require reading a
  document merely to discover another document.
- A script may execute without loading all source into context, but its
  dependencies and contract must still be discoverable.

Progressive disclosure creates routing risk as well as context efficiency.
Evaluate whether each destination is found and whether it fulfills the promise
made by the route.

[^agent-skills-spec]: Agent Skills specification
