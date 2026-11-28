# Release engineering

The implementer owns integration on shared main and follows the released artifact to its intended users. Use the delivery model to choose sufficient evidence for each decision and the direct-to-main guide to place checks in a repository’s workflow.

## Delivery decisions

- [Delivering a software change](foundations/delivering-a-software-change.md) — Follow one change through Implement, Land, Release, and Confirm, from the first useful check to evidence that the change works for its intended users.
- [Direct-to-main delivery with parallel agents](guides/direct-to-main-delivery.md) — Choose checks, integrate concurrent work, and confirm a release when developers and agents land changes directly on main and deploy from it.
- [Assessing the path to production](guides/assessing-the-path-to-production.md) — Trace a change through the four delivery steps, compare observed results with acceptable limits and targets, and choose which finding to act on.
