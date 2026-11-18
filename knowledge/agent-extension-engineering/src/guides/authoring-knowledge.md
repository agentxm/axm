---
type: Guide
title: "Authoring extension knowledge"
description: "Design concepts that readers can select from an index or find directly through search."
tags: ["knowledge", "okf", "indexes", "metadata", "discovery", "documentation"]
status: draft
generated: { by: "codex/gpt-6", at: "2026-11-18T22:24:31Z" }
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

Try both routes. Browse from the index, then search using the symptom and read
the returned concept on its own. Put shared explanations in one concept and link
them where they affect a decision. For the OKF specification and AXM profile, see
`axm help knowledge`.
