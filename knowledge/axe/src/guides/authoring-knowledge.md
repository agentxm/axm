---
type: Guide
title: "Authoring extension knowledge"
description: "Design concepts for browsing and search, and decide when a worked example supports a reusable pattern."
tags: ["knowledge", "okf", "indexes", "metadata", "discovery", "documentation", "pattern mining"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-19T03:52:30Z" }
sources:
  - id: patterns
    resource: https://github.com/craigsmitham/agent-extensions/blob/64a2a8f9f44b303971de1ef1147814b65c2f4b96/knowledge/docs/src/patterns/pattern-description.md
    title: Pattern description
---

# Authoring extension knowledge

Give each concept a question it can answer on its own. Split two procedures
when the reader has a reason to choose between them. Keep steps together when
the reader needs both to reach one outcome.

Under a “Webhook delivery” index, “Retry a delivery” looks clear. In a search
result it could describe either a request that never reached the receiver or
one whose acknowledgement was lost. Retrying the second could repeat a write.
Name the condition in the preview and carry it into the body. For example,
“Missing webhook acknowledgement” can open by telling the reader how to check
whether the receiver already applied the event.

Link the concept from the workflow that uses the answer. In a delivery-support
skill, the step for a missing acknowledgement can point to this concept before
the agent offers to retry. A request about a delivery that never left the
sender should reach the other procedure. For vocabulary used by several
workflows, see [Domain glossary](../patterns/domain-glossary.md).

Try both routes. Browse from the index, then search using the symptom and read
the returned concept on its own. Put shared explanations in one concept and link
them where they affect a decision. For the OKF specification and AXM profile, see
`axm help knowledge`.

## When an example belongs in the pattern catalog

Look for the same design decision in independently authored extensions. Trace
each example to its source so that two copies of one skill count as one
observation. Describe what the authors had to decide, how their responses
vary, and a case where the advice would get in the way. A single use can make
a good worked example. If you share it as a candidate pattern, name the
evidence that would justify a wider claim.[^patterns]

For example, [Select from findings](../patterns/select-from-findings.md) cites
two review tools that let the user choose which findings to fix. A picker and
a numbered text reply can both express that choice. The transferable idea is
preserving the user's selection through the edit. If the original request
already names the finding to fix, asking the user to choose it again adds work.

[^patterns]: Documentation craft, “Pattern description,” on mining known uses and testing the limits of a pattern.
