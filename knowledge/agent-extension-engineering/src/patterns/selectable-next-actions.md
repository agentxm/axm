---
type: Pattern
title: "Selectable next actions"
description: "When a result leaves several meaningful follow-ups, let the user select an action by control or by a short reply."
tags: ["skills", "interaction", "next steps", "picker", "text fallback", "review"]
status: draft
---

# Selectable next actions

A diagnostic skill finds an invalid setting. The reader may want to inspect
the source, apply the suggested correction, or finish with the diagnosis.
“Let me know how to proceed” makes them work out which actions the skill
supports. Automatically applying the correction spends authority the
diagnostic request never granted.

Show the result first. Offer one menu for the result, with labels that name
each action's effect. Keep only applicable actions and combine choices with
the same effect. If the user has already chosen an action and its scope,
carry that choice forward.

Give the workflow a usual order that readers can learn. For example, a
diagnostic can offer **Inspect source**, **Apply correction**, then **Finish**.
Place **Finish**, **Skip**, or **Cancel** last when offered. When the user's
goal and the evidence favor one action, move it to the top and append
`(Recommended)` to its label. Keep the other actions in their usual order.
If the choice depends on a preference the user hasn't expressed, use the
usual order and leave every label unmarked.

Use the host's native picker when available. Build the picker and text menu
from the same ordered choices, including the recommendation marker and short
replies. Assign any letters after ordering and interpret them against the
menu the user saw. Accept the action name or an unambiguous ordinary reply.
A picker may highlight the first row automatically. Wait for the user's
selection before acting.

When an action also needs a target, let the user select it in the control
or supply both in one reply. For reviews, [Select from findings](select-from-findings.md)
keeps the displayed numbers bound to their findings. “Inspect 2” shows the
evidence for that finding. “Fix 2” applies its recommendation within the
user's authority. “Done” ends the review.

Try one choice through the picker and its text equivalent on separate copies
of the same fixture. Compare the selected action, the affected items, and
what actually changed. The [extension review template](../guides/reviewing-extensions.md#report-the-review)
shows how to compose this pattern with a recurring report.
