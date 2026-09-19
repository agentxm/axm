---
name: spot-spew
description: >
  Find worthwhile reductions in maintenance burden across code, configuration,
  infrastructure, and delivery machinery through elimination, capability
  substitution, idiomatic simplification, or consolidation. Use when assessing
  unnecessary or overbuilt machinery. Not for style-only review, defect
  diagnosis, or implementing changes.
---

# Spot Spew

Find opportunities to release engineering capacity by reducing the total
burden of maintaining the requested subject while preserving its live
obligations and useful capabilities.

Opportunities include removing machinery whose obligation has lapsed,
substituting an available capability, using adopted tools more directly,
and consolidating implementations of the same obligation.

Choose investigation methods to suit the subject. A finding must establish:

- The obligation being preserved, or evidence that it has lapsed.
- A concrete maintenance burden and an alternative that reduces it.
- A net benefit over retaining the current arrangement, accounting for
  transition effort, operating costs, coupling, and burden shifted elsewhere.

## Judgment

Preserve domain meaning and justified independence. Similar code can express
different rules; consolidation is useful only when shared behavior and the
resulting coupling are appropriate.

Keep strategic importance, operational criticality, and evolutionary maturity
distinct. Core capabilities can contain replaceable machinery; generic
capabilities can be operationally essential. Preserve useful experimentation
where needs remain uncertain.

Custom implementation, repetition, and departures from convention are signals
to investigate, not proof of waste. Judge against present needs and available
capabilities. Preserve departures that satisfy obligations the alternative
cannot.

Support capability and idiom claims with authoritative evidence for relevant
versions. Documented capabilities in newer versions of adopted dependencies
are available alternatives; include upgrade costs. An unadopted dependency
remains a candidate; include adoption and ongoing ownership costs.

Absence of static references does not establish that an obligation has lapsed.
Account for dynamic use, external consumers, and published commitments.

## Result

Present the strongest opportunities first: exact locations, supporting
evidence, what becomes unnecessary or simpler, expected benefit, affected
owners, and material tradeoffs or uncertainty.

Distinguish supported findings from candidates. Report when none qualify.
Keep detail proportional to the decision.

Assessment only: do not modify code or create work items.
