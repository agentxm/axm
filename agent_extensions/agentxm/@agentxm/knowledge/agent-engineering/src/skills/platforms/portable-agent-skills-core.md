---
type: Reference
title: Portable Agent Skills core
description: The cross-host package and progressive-disclosure contract defined by the open specification.
tags: [agent-skills, specification, portability, package]
status: stable
stale_after: 2027-02-14
generated: { by: "claude-code/claude-opus-5", at: 2026-08-16T01:39:08Z }
sources:
  - id: agent-skills-spec
    resource: https://agentskills.io/specification
    title: Agent Skills specification
---

# Portable Agent Skills core

An Agent Skill is a directory whose required `SKILL.md` begins with YAML
frontmatter and continues with Markdown instructions. The open specification
requires `name` and `description`; it defines optional `license`,
`compatibility`, `metadata`, and `allowed-tools` fields. Consult the current
specification for exact constraints.[^agent-skills-spec]

The directory may include `scripts/`, `references/`, `assets/`, or other files.
Keep references relative to the skill root, shallow, and loaded only when the
workflow needs them. The description must carry selection information because
hosts commonly expose metadata before the body.

Portable authoring rules:

- make the name, directory, and references internally consistent;
- keep essential workflow and authority in `SKILL.md`;
- declare environment and tool requirements rather than assuming them;
- use scripts for deterministic work and validate their input and output;
- keep host-only extensions outside the portable contract or clearly optional;
- write any question, choice, or approval so it stands as ordinary output, and
  treat a host affordance for structured prompts as an optional rendering whose
  item labels must map onto the identifiers the skill already defines; and
- validate structure, then exercise routing and execution on every claimed host.

The prompting affordance is a common portability trap. A skill written around
one host's question surface loses its choice request where that surface does not
exist, and a skill that lets the surface supply the labels produces a different
referent on each host.

[^agent-skills-spec]: Agent Skills specification

