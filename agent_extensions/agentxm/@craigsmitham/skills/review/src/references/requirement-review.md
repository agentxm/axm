# Requirement review

Assess Requirement satisfaction separately for every changed or materially
impacted accepted Requirement. Bind the exact Requirement identity and
revision; do not infer an obligation from tests, current behavior, a work-item
summary, or implementation convenience.

For each Requirement inspect:

- the authoritative obligation, subject, conditions, invariants, and
  exclusions;
- changed meaning and impacted unchanged meaning;
- positive, negative, boundary, and failure behavior;
- realization locations and actor-visible or system-visible effects;
- applicable Requirement-satisfaction Protocol coverage;
- current evidence and contradictory evidence;
- behavior that silently narrows, expands, or changes the obligation; and
- residual unknowns and the owner of missing meaning or evidence.

Report one bounded disposition per Requirement. A passing case supports only
the obligation, conditions, subject, and candidate revision it actually
assessed. Route ambiguous, disputed, or newly required desired state to `spec`;
do not repair it during review.
