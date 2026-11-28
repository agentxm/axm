---
type: Explanation
title: The software development lifecycle
description: Six recurring activities connect the reason for a software change to what happens when people use it.
tags: [software-engineering, lifecycle, delivery, operations]
license: CC-BY-SA-4.0
---
# The software development lifecycle

Suppose customers who forget their passwords have to call support. The team ships a self-service recovery link. The deployment succeeds. How will the team know whether it solved the original problem?

**Spec → Design → Implement → Test → Deploy → Operate** follows that question from a customer need to an observable result. The six activities recur throughout a product’s life. A team may be operating the current version, testing a change to it, and designing its replacement on the same day.

| Activity | What the team does | Account recovery example |
| --- | --- | --- |
| **Spec** | Decide whose problem is worth solving. Describe the intended behavior, constraints, and signs of success. | Customers with access to their registered email should be able to regain access without assistance. Agree with support on how to recognize a successful recovery and measure requests for help. |
| **Design** | Choose an approach that fits the system. Explore alternatives where a decision is costly to reverse. | Walk through the journey from the locked account to a successful sign-in. Decide what the customer sees if the link expires along the way. |
| **Implement** | Build a working slice, exercise it locally, and integrate it with the code it depends on. | Connect the recovery form, email delivery, and sign-in flow. Trying them together reveals that requesting a second email leaves two links in the inbox. Return to Spec to agree what each link should do. |
| **Test** | Gather evidence that the integrated change behaves as intended under the conditions that matter. | Follow a valid link through sign-in, try an expired link, and exercise the agreed behavior when two emails have arrived. |
| **Deploy** | Put a known version into its target environment and decide when to expose it to users. | Deploy the tested revision with recovery disabled. Enable it for the first group once support can identify the version and help anyone who gets stuck. |
| **Operate** | Observe use, support users, maintain the service, and decide when it can be withdrawn. | Check whether customers finish recovery and whether they still call support. If many request a link but never sign in, investigate where they stop before choosing the next change. |

For one change, the implementer follows **Implement → Land → Release → Confirm**. Spec supplies the outcome to confirm. Test supplies evidence during implementation, integration on shared main, and release. Operate provides the observations that show whether the change worked for its intended audience. [Delivering a software change](release-engineering/foundations/delivering-a-software-change.md)

The disciplines contribute wherever their expertise helps. Business analysis and requirements engineering help the team define successful recovery. Architecture and design inform how sign-in and email delivery interact. Software testing can turn the two-email question into an example while the code is still being written. Release engineering connects the tested revision to the rollout. Software operations and support help explain what customers experience. Project management helps throughout, from bounding the initial investment to coordinating the rollout with support.

The same activities apply to retirement. To withdraw the old recovery flow, the team identifies who still depends on it, designs their transition, implements and tests the replacement, then deploys the switch. In Operate, it confirms that callers have moved and support obligations are met before shutting the old flow down.
