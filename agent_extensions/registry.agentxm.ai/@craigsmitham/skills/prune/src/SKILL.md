---
name: prune
description: Prune a codebase or a specified part by removing unnecessary elements and their associated maintenance burden.
disable-model-invocation: true
---

Prune the requested scope: remove elements that no longer serve its
intended purpose or fulfill a live obligation, including supporting
machinery made unnecessary by their removal.

For opportunity questions, assess candidates and their tradeoffs without
implementing them. For change requests, carry the requested outcome through
implementation and verification within the authorized scope.

The result should be a smaller, coherent system that preserves required
behavior and supported uses, with fewer elements to understand, maintain,
and operate.

Establish intended purpose, affected consumers, applicable requirements,
and evidence that each candidate's obligation has ended or can be fulfilled
by what remains. Account for dynamic use, external consumers, recovery paths,
and compatibility commitments. Apparent disuse alone does not establish that
an element is unnecessary. Retiring a supported capability requires that
contraction to be within the user's intent and authority.

Choose a bounded removal whose benefit justifies transition and ongoing costs,
including work shifted elsewhere. Establish sufficient confidence in retained
behavior before consequential removal. Complete necessary consumer migration
before deleting compatibility paths; identify remaining consumers and exit
conditions when a transition must stay open.

Remove exclusively supporting dependencies, configuration, tests, documentation,
and delivery machinery whose obligations have also ended. Preserve shared
support still needed by retained capabilities and update affected guidance.

Report what became unnecessary, the evidence that obligations remain fulfilled,
and material costs or uncertainty. Reduced line count alone does not establish
reduced burden. Where justified, address the cause of recurring accumulation.
A scope with nothing expendable needs no change.
