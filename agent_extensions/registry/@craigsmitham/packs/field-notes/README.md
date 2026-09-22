# Field notes

Preserve meaningful friction from agent sessions while the evidence is still
available.

During ordinary work, the rule notices a concrete failure, confusing
instruction, avoidable retry or rework, missing capability, or necessary
workaround. The skill writes one concise occurrence note and the agent continues
the original task. Capture is active wherever the rule is enabled; no subjects,
setup, or note lifecycle are required.

The notes are inputs to a separate analysis process. Capture itself does not
cluster observations, infer causes, prioritize problems, recommend changes, or
manage remediation.

## Included extensions

Members are **not standalone** (`standalone: false`): install this pack rather
than treating the leaves as complete units on their own.

| Extension | Role |
| --- | --- |
| `@craigsmitham/rules/field-notes` | Recognizes meaningful session friction and invokes capture |
| `@craigsmitham/skills/field-notes` | Writes one concise occurrence note using evidence already available |
| `@craigsmitham/knowledge/field-notes` | Explains the evidence-preservation practice and its boundaries |

## Install

```bash
axm packs install @craigsmitham/packs/field-notes
```

Then work normally. Notes are written to `field-notes/` in the workspace using
a UTC timestamp, nonce, and short description.

## What gets recorded

Each note records factual context, the observed friction, its actual cost or
impact, the outcome, and minimal safe evidence already available. Cost can
include retries, extra steps, delay, resources, user intervention, rework,
degraded output, blocked work, or remaining uncertainty. Measurements are
included only when known; the agent does not estimate them.

An optional existing-context section may retain an explanation, constraint,
related occurrence, or possible remedy already established during the task. The
agent does no additional investigation or analysis to fill the note.

Routine work, expected diagnostic failures, isolated typing mistakes, general
impressions, and speculative concerns are excluded. Capture never expands the
authority of the original task.

## License

CC-BY-SA-4.0. Attribute as: "field-notes pack, © Craig Smitham, CC-BY-SA-4.0"
with a link to https://github.com/craigsmitham/agent-extensions.
