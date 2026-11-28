---
okf_version: "0.2"
---
# Software Development Lifecycle

- [The software development lifecycle](software-engineering-lifecycle.md) — Six recurring activities connect the reason for a software change to what happens when people use it.
- [Delivering a software change](release-engineering/foundations/delivering-a-software-change.md) — Follow one change through Implement, Land, Release, and Confirm, from the first useful check to evidence that the change works for its intended users.
- [Assessing the path to production](release-engineering/guides/assessing-the-path-to-production.md) — Trace a change through the four delivery steps, compare observed results with acceptable limits and targets, and choose which finding to act on.

| Activity | What do you need to decide? | Where to start |
| --- | --- | --- |
| **Spec** | Whose problem is worth solving, and what would count as success? | Understand the need with [Jobs to Be Done](business-analysis/foundations/jobs-to-be-done.md), bound the investment with [Shape Up](project-management/foundations/shape-up.md), and [choose a specification method](requirements-engineering/authoring/selecting-a-specification-method.md). |
| **Design** | Which approach fits the problem and the existing system? | [Explore design alternatives](architecture-and-design/foundations/buxton-design.md) or [clarify the domain model](architecture-and-design/foundations/domain-driven-design.md). |
| **Implement** | How can I get a working slice running alongside other changes? | Turn an agreed example into an [executable specification](software-testing/patterns/executable-specifications.md). For teams integrating on main, [check compatibility as main advances](release-engineering/guides/direct-to-main-delivery.md). |
| **Test** | What needs to run for a consequential failure to show up? | Choose [which components to exercise](software-testing/patterns/evidence-matched-test-world.md) and [what to observe in the browser](software-testing/writing-browser-test-evidence.md). |
| **Deploy** | Which revision can advance, and who should receive it? | Use the [delivery decisions](release-engineering/foundations/delivering-a-software-change.md) to connect evidence to a release. Teams deploying from main can use the [direct-to-main guide](release-engineering/guides/direct-to-main-delivery.md) to plan rollout. |
| **Operate** | Did users receive the intended benefit, and what needs attention? | [Confirm the result in use](release-engineering/foundations/delivering-a-software-change.md). During a disruption, [coordinate response and record recovery](software-operations/foundations/incident-policy-and-records.md). |

## Browse by discipline

- [Business analysis](business-analysis/index.md)
- [Requirements engineering](requirements-engineering/index.md)
- [Architecture and design](architecture-and-design/index.md)
- [Software testing](software-testing/index.md)
- [Release engineering](release-engineering/index.md)
- [Software operations](software-operations/index.md)
- [Project management](project-management/index.md)
