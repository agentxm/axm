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

Deliver the complete result once. End with a short set of actions whose labels
name their effects. Choose the delivery method before presenting the result.
Use a native picker when the host can leave it as the last visible item.
Otherwise, including on hosts that require a final message after an asynchronous
picker, put the result and choices together in the final message.

Yield at the choice. If posting the picker returns control immediately, keep
the question last while awaiting the user's reply. Dismissing it leaves the
result available and applies no action.

In a prompt, label each choice and show how to invoke it, for example **A · Inspect source**,
**B · Apply correction**, **C · Finish**. Accept the letter, the action name,
or an unambiguous ordinary reply. Where both interfaces are available, keep
the same labels and meanings. A highlighted default takes effect only when
the user submits it.

When an action also needs a target, let the user select it in the control
or supply both in one reply. For reviews, [Select from findings](select-from-findings.md)
keeps the displayed numbers bound to their findings. “Inspect 2” shows the
evidence for that finding. “Fix 2” applies its recommendation within the
user's authority. “Done” ends the review.

Use one choice for the whole result when the same actions apply to every
item. Collapse choices with identical effects, such as “fix all” and “fix
selected” in a single-finding report. If the user has already chosen the
action and scope, carry them forward. Each extra picker costs a turn.

Try one choice through the picker and its text equivalent on separate copies
of the same fixture. Delay the reply and inspect the visible exchange while
the choice is pending. The result appears once, the choice is last, and the
fixture still has its original contents. Submit a choice and compare the
selected action, affected items, and actual changes across both interfaces.
The [extension review template](../guides/reviewing-extensions.md#report-the-review)
shows how to compose this pattern with a recurring report.
